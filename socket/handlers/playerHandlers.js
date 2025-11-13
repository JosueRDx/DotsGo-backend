const Game = require("../../models/game.model");
const { isAnswerCorrect, calculatePoints, MIN_TIMEOUT_POINTS } = require("../../services/validationService");
const { haveAllPlayersAnswered, endGame } = require("../../services/gameService");
const { emitQuestion } = require("../../services/questionService");
const { getQuestionTimer, clearQuestionTimer } = require("../../utils/timer");
const { initializePlayer, processPlayerAnswer, checkWinConditions } = require("../../services/gameModeService");
const shuffleArray = require("../../utils/shuffle");
const { checkRateLimit, clearSocketData } = require("../../utils/rateLimiter");
const { validateJoinGameData, validateSubmitAnswerData } = require("../../utils/validation");
const logger = require("../../utils/logger");

/**
 * Maneja la unión de un jugador al juego
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleJoinGame = (socket, io) => {
  socket.on("join-game", async (joinData, callback) => {
    // Validar que callback es una función
    if (typeof callback !== 'function') {
      return;
    }

    // Verificar rate limiting
    const rateCheck = checkRateLimit(socket.id, 'join-game');
    if (!rateCheck.allowed) {
      return callback({
        success: false,
        error: `Demasiadas solicitudes. Intenta de nuevo en ${rateCheck.retryAfter} segundos.`,
        rateLimitExceeded: true
      });
    }

    // Validar datos de entrada
    const validation = validateJoinGameData(joinData);
    if (!validation.valid) {
      logger.warn(`⚠️ Validación fallida en join-game:`, validation.errors);
      return callback({
        success: false,
        error: validation.errors[0], // Enviar el primer error
        validationErrors: validation.errors // Lista completa de errores
      });
    }

    // Usar datos validados y sanitizados
    const { pin, username, character } = validation.sanitized;

    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.status === "finished") {
        return callback({ success: false, error: "El juego ya ha finalizado" });
      }

      // Verificar límite máximo de jugadores
      const maxPlayersAllowed = game.modeConfig?.maxPlayers || 50;
      if (game.players.length >= maxPlayersAllowed) {
        return callback({ 
          success: false, 
          error: `El juego está lleno (${maxPlayersAllowed} jugadores máximo)` 
        });
      }

      const totalQuestions = game.questions.length;
      let joinResponse = {
        success: true,
        gameStatus: game.status,
        totalQuestions
      };


      if (game.status === "playing") {
        // Crear orden aleatorio para jugador que se une tarde
        const shuffledQuestions = shuffleArray(game.questions.map(q => q._id));

        // NUEVO: Inicializar jugador según el modo de juego
        const basePlayerData = {
          id: socket.id,
          username,
          score: 0,
          correctAnswers: 0,
          totalResponseTime: 0,
          answers: [],
          character: character || null,
          questionOrder: shuffledQuestions,
          currentQuestionIndex: game.currentQuestion
        };

        const playerData = initializePlayer(basePlayerData, game.gameMode, game.modeConfig);
        logger.info(`🎮 Jugador ${username} se unió tarde al modo ${game.gameMode}:`, {
          lives: playerData.lives,
          position: playerData.position,
          isEliminated: playerData.isEliminated
        });

        game.players.push(playerData);
        await game.save();
        socket.join(pin);

        // Enviar pregunta actual según el orden aleatorio del nuevo jugador
        const playerQuestionId = shuffledQuestions[game.currentQuestion];
        const playerQuestion = game.questions.find(q => q._id.toString() === playerQuestionId.toString());

        const questionStartTime = game.questionStartTime || Date.now();
        const timeElapsed = Date.now() - questionStartTime;
        const rawRemaining = Math.floor((game.timeLimitPerQuestion - timeElapsed) / 1000);
        const timeRemaining = Math.min(
          Math.floor(game.timeLimitPerQuestion / 1000),
          Math.max(0, rawRemaining)
        );

        joinResponse = {
          ...joinResponse,
          joinedDuringGame: true,
          timeRemaining,
          currentIndex: Math.min(game.currentQuestion + 1, totalQuestions)
        };

        if (playerQuestion) {
          socket.emit("game-started", {
            question: playerQuestion,
            timeLimit: timeRemaining,
            currentIndex: game.currentQuestion + 1,
            totalQuestions: totalQuestions,
          });

          logger.debug(`🔄 Jugador ${username} se unió tarde - Pregunta: ${playerQuestion.title}`);
        }
        io.to(pin).emit("player-joined", {
          players: game.players,
          gameInfo: {
            pin: game.pin,
            questionsCount: totalQuestions,
            maxPlayers: 50,
            status: game.status,
            timeLimitPerQuestion: game.timeLimitPerQuestion / 1000
          }
        });

        io.to(pin).emit("players-updated", {
          players: game.players
        });
      }

      if (game.status === "waiting") {
        // Crear orden aleatorio de preguntas para este jugador
        const shuffledQuestions = shuffleArray(game.questions.map(q => q._id));

        // 🐛 DEBUG: Ver orden asignado
        logger.debug(`\n🎲 Jugador ${username} - Orden de preguntas:`);
        for (let i = 0; i < shuffledQuestions.length; i++) {
          const q = game.questions.find(question => question._id.toString() === shuffledQuestions[i].toString());
          logger.debug(`  ${i + 1}. ${q ? q.title : 'Pregunta no encontrada'}`);
        }

        // NUEVO: Inicializar jugador según el modo de juego
        const basePlayerData = {
          id: socket.id,
          username,
          score: 0,
          correctAnswers: 0,
          totalResponseTime: 0,
          answers: [],
          character: character || null,
          questionOrder: shuffledQuestions,  // Orden único y aleatorio para este jugador
          currentQuestionIndex: 0
        };

        const playerData = initializePlayer(basePlayerData, game.gameMode, game.modeConfig);
        logger.info(`🎮 Jugador ${username} inicializado para modo ${game.gameMode}:`, {
          lives: playerData.lives,
          position: playerData.position,
          isEliminated: playerData.isEliminated
        });

        game.players.push(playerData);
        await game.save();
        socket.join(pin);

        // Debug: Verificar sockets en la sala
        const socketsInRoom = await io.in(pin).allSockets();
        logger.debug(`🔍 Jugador ${username} se unió. Sockets en sala ${pin}:`, Array.from(socketsInRoom));
        logger.debug(`📊 Total jugadores en BD: ${game.players.length}`);

        logger.debug(`📤 Emitiendo player-joined a sala ${pin} con ${game.players.length} jugadores`);
        io.to(pin).emit("player-joined", {
          players: game.players,
          gameInfo: {
            pin: game.pin,
            questionsCount: game.questions.length,
            maxPlayers: 50,
            status: game.status,
            timeLimitPerQuestion: game.timeLimitPerQuestion / 1000
          }
        });

        logger.debug(`📤 Emitiendo players-updated a sala ${pin} con ${game.players.length} jugadores`);
        io.to(pin).emit("players-updated", {
          players: game.players
        });

        logger.info(`Jugador conectado: ${username} con personaje: ${character?.name || "Sin personaje"} - Juego tiene ${game.questions.length} preguntas`);
        joinResponse = {
          ...joinResponse,
          joinedDuringGame: false
        };
      }

      callback(joinResponse);
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
};

/**
 * Función auxiliar para guardar con reintentos en caso de VersionError
 * @param {Function} saveFn - Función que realiza el guardado
 * @param {number} maxRetries - Número máximo de reintentos
 * @returns {Promise} Resultado del guardado
 */
const saveWithRetry = async (saveFn, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await saveFn();
    } catch (error) {
      if (error.name === 'VersionError' && attempt < maxRetries - 1) {
        logger.warn(`⚠️ VersionError detectado, reintentando (${attempt + 1}/${maxRetries})...`);
        // Esperar un tiempo aleatorio antes de reintentar (10-50ms)
        await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 40));
        continue;
      }
      throw error; // Si no es VersionError o se agotaron los reintentos, lanzar error
    }
  }
};

/**
 * Maneja el envío de respuestas de los jugadores
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleSubmitAnswer = (socket, io) => {
  socket.on("submit-answer", async (answerData, callback) => {
    // Validar que callback es una función
    if (typeof callback !== 'function') {
      return;
    }

    // Verificar rate limiting
    const rateCheck = checkRateLimit(socket.id, 'submit-answer');
    if (!rateCheck.allowed) {
      return callback({
        success: false,
        error: `Demasiadas respuestas. Intenta de nuevo en ${rateCheck.retryAfter} segundos.`,
        rateLimitExceeded: true
      });
    }

    // Validar datos básicos (PIN, answerIndex, responseTime)
    const validation = validateSubmitAnswerData({
      pin: answerData.pin,
      answerIndex: 0, // Solo para validar PIN y tiempo, answerIndex no es relevante aquí
      responseTime: answerData.responseTime
    });

    if (!validation.valid) {
      logger.warn(`⚠️ Validación fallida en submit-answer:`, validation.errors);
      return callback({
        success: false,
        error: validation.errors[0],
        validationErrors: validation.errors
      });
    }

    // Extraer datos validados y otros campos adicionales
    const { pin } = validation.sanitized;
    const { answer, responseTime, questionId, isAutoSubmit } = answerData;

    // Usar saveWithRetry para manejar concurrencia
    const processAnswer = async () => {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }
      if (game.status !== "playing") {
        return callback({ success: false, error: "Juego no válido" });
      }

      const player = game.players.find(p => p.id === socket.id);

      if (!player) {
        return callback({ success: false, error: "Jugador no encontrado" });
      }

      // Obtener la pregunta específica del jugador según su orden aleatorio
      const playerQuestionId = player.questionOrder[game.currentQuestion];
      const currentQuestion = game.questions.find(q => q._id.toString() === playerQuestionId.toString());

      if (!currentQuestion) {
        return callback({ success: false, error: "Pregunta no encontrada" });
      }

      logger.debug("=== VALIDACIÓN DE RESPUESTA ===");
      logger.debug("Jugador:", player.username);
      logger.debug("Pregunta del jugador:", currentQuestion.title);
      logger.debug("Respuesta recibida:", JSON.stringify(answer, null, 2));
      logger.debug("Respuesta correcta:", JSON.stringify(currentQuestion.correctAnswer, null, 2));

      // Verificar si la respuesta está vacía
      const isEmptyAnswer = !answer.pictogram &&
        (!answer.colors || answer.colors.length === 0) &&
        !answer.number;

      let isCorrect = false;

      if (!isEmptyAnswer) {
        isCorrect = isAnswerCorrect(answer, currentQuestion.correctAnswer);
        logger.debug(`Validación automática -> ${isCorrect ? 'CORRECTA' : 'INCORRECTA'}`);
      } else {
        logger.debug("❌ Respuesta vacía");
      }

      const timeLimitSeconds = game.timeLimitPerQuestion / 1000;
      const autoSubmission = Boolean(isAutoSubmit);
      let normalizedResponseTime = Number.isFinite(responseTime) && responseTime >= 0
        ? responseTime
        : timeLimitSeconds;
      if (autoSubmission) {
        normalizedResponseTime = timeLimitSeconds;
      }

      // Calcular puntos
      let pointsAwarded = 0;
      if (isCorrect) {
        pointsAwarded = autoSubmission
          ? MIN_TIMEOUT_POINTS
          : calculatePoints(normalizedResponseTime, game.timeLimitPerQuestion);
        logger.debug(`✅ RESPUESTA CORRECTA - Puntos: ${pointsAwarded}${autoSubmission ? " (auto)" : ""}`);
      } else {
        logger.debug(`❌ RESPUESTA INCORRECTA - Puntos: 0`);
      }

      // Guardar respuesta o actualizar la existente (por timeout previo)
      const existing = player.answers.find(a => a.questionId.toString() === currentQuestion._id.toString());
      if (existing) {
        const previousResponseTime = Number.isFinite(existing.responseTime)
          ? existing.responseTime
          : 0;
        if (!existing.isCorrect && existing.pointsAwarded === 0) {
          existing.givenAnswer = answer;
          existing.isCorrect = isCorrect;
          existing.pointsAwarded = pointsAwarded;
          existing.responseTime = normalizedResponseTime;
          if (isCorrect) {
            player.score += pointsAwarded;
            player.correctAnswers += 1;
          }
          player.totalResponseTime = Math.max(0, (player.totalResponseTime || 0) - previousResponseTime + normalizedResponseTime);
        } else {
          return callback({ success: false, error: "Respuesta ya registrada" });
        }
      } else {
        player.answers.push({
          questionId: currentQuestion._id,
          givenAnswer: answer,
          isCorrect,
          pointsAwarded,
          responseTime: normalizedResponseTime,
        });
        if (isCorrect) {
          player.score += pointsAwarded;
          player.correctAnswers += 1;
        }
        player.totalResponseTime = (player.totalResponseTime || 0) + normalizedResponseTime;
      }

      await game.save();

      logger.debug(`Jugador ${player.username} - Correcta: ${isCorrect} - Puntos: ${pointsAwarded} - Total: ${player.score}`);
      logger.debug("=================================");

      // NUEVO: Procesar respuesta según el modo de juego
      const modeResult = await processPlayerAnswer(game, player, isCorrect, pointsAwarded, io);
      
      if (modeResult.playerUpdated) {
        await game.save();
      }

      // NUEVO: Manejar eliminación individual en modo aventura
      if (modeResult.eliminatedPlayers && modeResult.eliminatedPlayers.length > 0) {
        for (const eliminatedPlayer of modeResult.eliminatedPlayers) {
          // Notificar al jugador específico que fue eliminado
          const playerSocket = io.sockets.sockets.get(eliminatedPlayer.id);
          if (playerSocket) {
            playerSocket.emit("player-game-over", {
              reason: "Sin vidas restantes",
              message: "Has perdido todas tus vidas en el modo Aventura",
              gameMode: "adventure",
              finalStats: {
                score: eliminatedPlayer.score || 0,
                correctAnswers: eliminatedPlayer.correctAnswers || 0,
                totalQuestions: eliminatedPlayer.answers?.length || 0,
                character: eliminatedPlayer.character
              }
            });
          }
        }
      }

      return { 
        game, 
        isCorrect, 
        pointsAwarded, 
        player,
        modeResult // NUEVO: Incluir resultado del modo de juego
      };
    };

    try {
      const result = await saveWithRetry(processAnswer);

      callback({ success: true, isCorrect: result.isCorrect, pointsAwarded: result.pointsAwarded });

      io.to(pin).emit("player-answered", {
        playerId: socket.id,
        isCorrect: result.isCorrect,
        pointsAwarded: result.pointsAwarded,
        playerScore: result.player.score,
      });
      // NUEVO: Incluir información de modo de juego en ranking
      io.to(pin).emit("ranking-updated", {
        players: result.game.players
          .map(p => ({
            id: p.id,
            username: p.username,
            score: p.score || 0,
            correctAnswers: p.correctAnswers || 0,
            totalResponseTime: p.totalResponseTime || 0,
            character: p.character,
            // NUEVO: Información específica de modos
            lives: p.lives,
            position: p.position,
            isEliminated: p.isEliminated
          }))
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
            return a.totalResponseTime - b.totalResponseTime;
          }),
        gameMode: result.game.gameMode,
        modeConfig: result.game.modeConfig
      });

      // NUEVO: Verificar si el juego terminó por condiciones del modo
      if (result.modeResult && result.modeResult.gameEnded) {
        logger.info(`🏁 Juego terminado por modo ${result.game.gameMode}:`, result.modeResult.winner);
        
        // Actualizar el juego con el ganador
        await Game.findByIdAndUpdate(result.game._id, {
          status: 'finished',
          winner: result.modeResult.winner
        });

        // Emitir fin de juego
        io.to(pin).emit("game-ended", {
          results: result.game.players.map(p => ({
            username: p.username,
            score: p.score || 0,
            correctAnswers: p.correctAnswers || 0,
            totalQuestions: p.questionOrder?.length || result.game.questions.length,
            character: p.character,
            lives: p.lives,
            position: p.position,
            isEliminated: p.isEliminated,
            totalResponseTime: p.totalResponseTime || 0
          })),
          hasWinner: !!result.modeResult.winner,
          winner: result.modeResult.winner,
          gameMode: result.game.gameMode,
          endReason: result.modeResult.reason || 'Condición de victoria cumplida'
        });

        return; // Salir sin procesar más preguntas
      }
      

      // Si todos han respondido su pregunta actual, forzar el timeout para mostrar respuestas correctas
      if (haveAllPlayersAnswered(result.game)) {
        logger.debug("🎯 Todos los jugadores han respondido, forzando timeout para mostrar respuestas correctas");
        
        // Obtener el timer actual y ejecutarlo inmediatamente
        const currentTimer = getQuestionTimer(pin);
        if (currentTimer) {
          clearTimeout(currentTimer);
          clearQuestionTimer(pin);
          
          // Ejecutar el proceso de timeout inmediatamente (que incluye showCorrectAnswers)
          setTimeout(async () => {
            const updatedGame = await Game.findById(result.game._id).populate("questions");
            if (updatedGame && updatedGame.status === "playing") {
              const { processTimeouts } = require("../../services/gameService");
              const { showCorrectAnswers } = require("../../services/questionService");
              
              await processTimeouts(updatedGame, io);
              
              // Mostrar respuestas correctas
              await showCorrectAnswers(updatedGame, updatedGame.currentQuestion, io);
              
              // Actualizar ranking
              const refreshedGame = await Game.findById(updatedGame._id);
              io.to(refreshedGame.pin).emit("ranking-updated", {
                players: refreshedGame.players
                  .map(p => ({
                    id: p.id,
                    username: p.username,
                    score: p.score || 0,
                    correctAnswers: p.correctAnswers || 0,
                    totalResponseTime: p.totalResponseTime || 0,
                    character: p.character
                  }))
                  .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
                    return a.totalResponseTime - b.totalResponseTime;
                  })
              });
              
              // Esperar antes de continuar con la siguiente pregunta
              setTimeout(async () => {
                const nextGame = await Game.findByIdAndUpdate(
                  updatedGame._id,
                  { $inc: { currentQuestion: 1 }, $set: { questionStartTime: Date.now() } },
                  { new: true }
                ).populate("questions");
                
                // Verificar si aún hay preguntas por hacer
                if (nextGame.currentQuestion < nextGame.questions.length) {
                  logger.debug(`🔄 Continuando con pregunta ${nextGame.currentQuestion + 1} de ${nextGame.questions.length}`);
                  emitQuestion(nextGame, nextGame.currentQuestion, io, endGame);
                } else {
                  logger.debug(`🏁 Todas las preguntas completadas, terminando juego`);
                  endGame(nextGame, nextGame.pin, io);
                }
              }, 5000); // 5 segundos para mostrar las respuestas correctas
            }
          }, 1000); // 1 segundo de delay para que se procesen todas las respuestas
        }
      }
    } catch (error) {
      logger.error("Error en submit-answer:", error);
      callback({ success: false, error: error.message });
    }
  });
};

/**
 * Maneja la desconexión de un jugador
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleDisconnect = (socket, io) => {
  socket.on("disconnect", async (reason) => {
    // Limpiar datos de rate limiting cuando socket se desconecta
    clearSocketData(socket.id);

    try {
      const game = await Game.findOne({ "players.id": socket.id });

      if (game) {
        const player = game.players.find(p => p.id === socket.id);
        const playerName = player ? player.username : 'Jugador desconocido';

        // Remover jugador de la partida
        game.players = game.players.filter(p => p.id !== socket.id);
        await game.save();

        // Notificar a otros jugadores
        io.to(game.pin).emit("player-left", {
          playerId: socket.id,
          players: game.players,
          reason: reason === 'client namespace disconnect' ? 'page_reload' : 'disconnect'
        });

        io.to(game.pin).emit("players-updated", {
          players: game.players
        });

        logger.info(`Jugador ${playerName} se desconectó del juego ${game.pin} (razón: ${reason})`);
      }
    } catch (error) {
      logger.error("Error en disconnect:", error);
    }
  });
};

/**
 * Maneja cuando un jugador sale del juego voluntariamente
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleLeaveGame = (socket, io) => {
  socket.on("leave-game", async ({ pin, username }) => {
    // Validar PIN (opcional, pero si se proporciona debe ser válido)
    if (pin) {
      const pinValidation = validatePin(pin);
      if (!pinValidation.valid) {
        logger.warn(`⚠️ Validación fallida en leave-game:`, pinValidation.error);
        return; // No callback, solo log
      }
    }

    // Validar username (opcional)
    if (username && typeof username !== 'string') {
      logger.warn(`⚠️ Validación fallida en leave-game: username debe ser string`);
      return;
    }

    try {
      const game = await Game.findOne({ pin });

      if (game) {
        // Buscar por socket.id o por username como fallback
        let playerIndex = game.players.findIndex(p => p.id === socket.id);
        
        // Si no se encuentra por socket.id, buscar por username
        if (playerIndex === -1 && username) {
          playerIndex = game.players.findIndex(p => p.username === username);
        }

        if (playerIndex !== -1) {
          const removedPlayer = game.players[playerIndex];
          game.players.splice(playerIndex, 1);
          await game.save();

          socket.leave(pin);

          io.to(pin).emit("player-left", {
            playerId: removedPlayer.id,
            players: game.players,
            reason: 'voluntary_leave'
          });

          io.to(pin).emit("players-updated", {
            players: game.players
          });

          logger.info(`Jugador ${username} salió voluntariamente del juego ${pin}`);
        } else {
          logger.debug(`No se encontró jugador ${username} en el juego ${pin}`);
        }
      }
    } catch (error) {
      logger.error("Error en leave-game:", error);
    }
  });
};

module.exports = {
  handleJoinGame,
  handleSubmitAnswer,
  handleDisconnect,
  handleLeaveGame
};