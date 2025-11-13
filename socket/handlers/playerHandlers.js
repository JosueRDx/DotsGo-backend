const Game = require("../../models/game.model");
const { isAnswerCorrect, calculatePoints, MIN_TIMEOUT_POINTS } = require("../../services/validationService");
const { haveAllPlayersAnswered, endGame } = require("../../services/gameService");
const { emitQuestion } = require("../../services/questionService");
const { getQuestionTimer, clearQuestionTimer } = require("../../utils/timer");
const { initializePlayer, processPlayerAnswer, checkWinConditions } = require("../../services/gameModeService");
const shuffleArray = require("../../utils/shuffle");
const { 
  generateSessionId, 
  schedulePlayerCleanup, 
  cancelPlayerCleanup, 
  isWithinGracePeriod 
} = require("../../utils/sessionManager");
const {
  canJoinGame,
  registerPlayer,
  unregisterPlayer
} = require("../../utils/antiMultiAccount");

/**
 * Maneja la unión de un jugador al juego
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleJoinGame = (socket, io) => {
  socket.on("join-game", async ({ pin, username, character, sessionId: clientSessionId }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.status === "finished") {
        return callback({ success: false, error: "El juego ya ha finalizado" });
      }

      const totalQuestions = game.questions.length;
      
      // NUEVO: Verificar si es una reconexión
      let existingPlayer = null;
      if (clientSessionId) {
        existingPlayer = game.players.find(p => p.sessionId === clientSessionId);
      }
      
      // NUEVO: También buscar por username (reingreso desde mismo navegador)
      if (!existingPlayer) {
        existingPlayer = game.players.find(p => p.username === username);
      }

      // Si el jugador existe, reconectar
      if (existingPlayer) {
        console.log(`🔄 Reconectando jugador ${existingPlayer.username}`);
        console.log(`   SessionId: ${clientSessionId || existingPlayer.sessionId || 'nuevo'}`);
        console.log(`   Estado anterior: ${existingPlayer.isConnected ? 'conectado' : 'desconectado'}`);
        console.log(`   Socket anterior: ${existingPlayer.id}, nuevo: ${socket.id}`);
        
        // Cancelar limpieza programada si hay sessionId
        if (clientSessionId) {
          cancelPlayerCleanup(clientSessionId);
        } else if (existingPlayer.sessionId) {
          cancelPlayerCleanup(existingPlayer.sessionId);
        }
        
        // Actualizar socket ID y estado
        existingPlayer.id = socket.id;
        existingPlayer.isConnected = true;
        existingPlayer.disconnectedAt = null;
        existingPlayer.lastActiveAt = new Date();
        
        // Usar sessionId existente si no se proporcionó uno nuevo
        const finalSessionId = clientSessionId || existingPlayer.sessionId || generateSessionId();
        existingPlayer.sessionId = finalSessionId;
        
        // Guardar con reintentos para evitar conflictos de versión
        try {
          await game.save();
        } catch (error) {
          if (error.name === 'VersionError') {
            console.log('⚠️ VersionError en reconexión, reintentando...');
            const freshGame = await Game.findById(game._id);
            const freshPlayer = freshGame.players.find(p => p.username === username);
            if (freshPlayer) {
              freshPlayer.id = socket.id;
              freshPlayer.isConnected = true;
              freshPlayer.disconnectedAt = null;
              freshPlayer.lastActiveAt = new Date();
              freshPlayer.sessionId = finalSessionId;
              await freshGame.save();
            }
          } else {
            throw error;
          }
        }
        
        socket.join(pin);
        
        // Re-registrar en sistema anti-multicuentas
        registerPlayer(pin, username, socket);
        
        // Notificar a todos que el jugador se reconectó
        io.to(pin).emit("player-reconnected", {
          playerId: socket.id,
          sessionId: finalSessionId,
          username: existingPlayer.username,
          players: game.players.filter(p => p.isConnected)
        });
        
        io.to(pin).emit("players-updated", {
          players: game.players.filter(p => p.isConnected)
        });
        
        let joinResponse = {
          success: true,
          reconnected: true,
          sessionId: finalSessionId,
          gameStatus: game.status,
          totalQuestions,
            playerData: {
              score: existingPlayer.score,
              correctAnswers: existingPlayer.correctAnswers,
              lives: existingPlayer.lives,
              position: existingPlayer.position,
              isEliminated: existingPlayer.isEliminated,
              currentQuestionIndex: existingPlayer.currentQuestionIndex
            }
          };
          
          // Si el juego está en curso, enviar pregunta actual
          if (game.status === "playing" && game.currentQuestion < game.questions.length) {
            const playerQuestionId = existingPlayer.questionOrder[game.currentQuestion];
            const playerQuestion = game.questions.find(q => q._id.toString() === playerQuestionId.toString());
            
            if (playerQuestion) {
              const questionStartTime = game.questionStartTime || Date.now();
              const timeElapsed = Date.now() - questionStartTime;
              const timeRemaining = Math.max(0, Math.floor((game.timeLimitPerQuestion - timeElapsed) / 1000));
              
              joinResponse.currentQuestion = {
                question: playerQuestion,
                timeRemaining,
                currentIndex: game.currentQuestion + 1
              };
              
              socket.emit("game-started", {
                question: playerQuestion,
                timeLimit: timeRemaining,
                currentIndex: game.currentQuestion + 1,
                totalQuestions: totalQuestions,
              });
            }
          }
          
          return callback(joinResponse);
      }
      
      // NUEVO: Verificar anti-multicuentas
      const multiAccountCheck = canJoinGame(pin, username, socket);
      if (!multiAccountCheck.allowed) {
        console.log(`🚫 Intento de multicuenta bloqueado - User: ${username}, Razón: ${multiAccountCheck.code}`);
        return callback({ 
          success: false, 
          error: multiAccountCheck.reason,
          code: multiAccountCheck.code
        });
      }
      
      // Verificar si el username ya existe (evitar duplicados)
      const duplicatePlayer = game.players.find(p => 
        p.username === username && p.isConnected
      );
      
      if (duplicatePlayer) {
        return callback({ 
          success: false, 
          error: "Ya existe un jugador con ese nombre en la partida" 
        });
      }
      
      // Generar nuevo sessionId
      const sessionId = generateSessionId();
      
      let joinResponse = {
        success: true,
        reconnected: false,
        sessionId,
        gameStatus: game.status,
        totalQuestions
      };


      if (game.status === "playing") {
        // Crear orden aleatorio para jugador que se une tarde
        const shuffledQuestions = shuffleArray(game.questions.map(q => q._id));

        // NUEVO: Inicializar jugador según el modo de juego
        const basePlayerData = {
          id: socket.id,
          sessionId, // NUEVO: ID de sesión persistente
          username,
          score: 0,
          correctAnswers: 0,
          totalResponseTime: 0,
          answers: [],
          character: character || null,
          questionOrder: shuffledQuestions,
          currentQuestionIndex: game.currentQuestion,
          isConnected: true,
          lastActiveAt: new Date()
        };

        const playerData = initializePlayer(basePlayerData, game.gameMode, game.modeConfig);
        console.log(`🎮 Jugador ${username} se unió tarde al modo ${game.gameMode}:`, {
          lives: playerData.lives,
          position: playerData.position,
          isEliminated: playerData.isEliminated
        });

        game.players.push(playerData);
        await game.save();
        socket.join(pin);
        
        // NUEVO: Registrar en sistema anti-multicuentas
        registerPlayer(pin, username, socket);

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

          console.log(`🔄 Jugador ${username} se unió tarde - Pregunta: ${playerQuestion.title}`);
        }
        // Filtrar solo jugadores conectados
        const connectedPlayers = game.players.filter(p => p.isConnected !== false);
        
        io.to(pin).emit("player-joined", {
          players: connectedPlayers,
          gameInfo: {
            pin: game.pin,
            questionsCount: totalQuestions,
            maxPlayers: 50,
            status: game.status,
            timeLimitPerQuestion: game.timeLimitPerQuestion / 1000
          }
        });

        io.to(pin).emit("players-updated", {
          players: connectedPlayers
        });
      }

      if (game.status === "waiting") {
        // Crear orden aleatorio de preguntas para este jugador
        const shuffledQuestions = shuffleArray(game.questions.map(q => q._id));

        // 🐛 DEBUG: Ver orden asignado
        console.log(`\n🎲 Jugador ${username} - Orden de preguntas:`);
        for (let i = 0; i < shuffledQuestions.length; i++) {
          const q = game.questions.find(question => question._id.toString() === shuffledQuestions[i].toString());
          console.log(`  ${i + 1}. ${q ? q.title : 'Pregunta no encontrada'}`);
        }

        // NUEVO: Inicializar jugador según el modo de juego
        const basePlayerData = {
          id: socket.id,
          sessionId, // NUEVO: ID de sesión persistente
          username,
          score: 0,
          correctAnswers: 0,
          totalResponseTime: 0,
          answers: [],
          character: character || null,
          questionOrder: shuffledQuestions,  // Orden único y aleatorio para este jugador
          currentQuestionIndex: 0,
          isConnected: true,
          lastActiveAt: new Date()
        };

        const playerData = initializePlayer(basePlayerData, game.gameMode, game.modeConfig);
        console.log(`🎮 Jugador ${username} inicializado para modo ${game.gameMode}:`, {
          lives: playerData.lives,
          position: playerData.position,
          isEliminated: playerData.isEliminated
        });

        game.players.push(playerData);
        await game.save();
        socket.join(pin);
        
        // NUEVO: Registrar en sistema anti-multicuentas
        registerPlayer(pin, username, socket);

        // Debug: Verificar sockets en la sala
        const socketsInRoom = await io.in(pin).allSockets();
        console.log(`🔍 Jugador ${username} se unió. Sockets en sala ${pin}:`, Array.from(socketsInRoom));
        console.log(`📊 Total jugadores en BD: ${game.players.length}`);

        // Filtrar solo jugadores conectados para emisión
        const connectedPlayers = game.players.filter(p => p.isConnected !== false);
        
        console.log(`📤 Emitiendo player-joined a sala ${pin} con ${connectedPlayers.length} jugadores conectados`);
        io.to(pin).emit("player-joined", {
          players: connectedPlayers,
          gameInfo: {
            pin: game.pin,
            questionsCount: game.questions.length,
            maxPlayers: 50,
            status: game.status,
            timeLimitPerQuestion: game.timeLimitPerQuestion / 1000
          }
        });

        console.log(`📤 Emitiendo players-updated a sala ${pin} con ${connectedPlayers.length} jugadores conectados`);
        io.to(pin).emit("players-updated", {
          players: connectedPlayers
        });

        console.log(`Jugador conectado: ${username} con personaje: ${character?.name || "Sin personaje"} - Juego tiene ${game.questions.length} preguntas`);
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
        console.log(`⚠️ VersionError detectado, reintentando (${attempt + 1}/${maxRetries})...`);
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
  socket.on("submit-answer", async ({ pin, answer, responseTime, questionId, isAutoSubmit }, callback) => {
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

      console.log("=== VALIDACIÓN DE RESPUESTA ===");
      console.log("Jugador:", player.username);
      console.log("Pregunta del jugador:", currentQuestion.title);
      console.log("Respuesta recibida:", JSON.stringify(answer, null, 2));
      console.log("Respuesta correcta:", JSON.stringify(currentQuestion.correctAnswer, null, 2));

      // Verificar si la respuesta está vacía
      const isEmptyAnswer = !answer.pictogram &&
        (!answer.colors || answer.colors.length === 0) &&
        !answer.number;

      let isCorrect = false;

      if (!isEmptyAnswer) {
        isCorrect = isAnswerCorrect(answer, currentQuestion.correctAnswer);
        console.log(`Validación automática -> ${isCorrect ? 'CORRECTA' : 'INCORRECTA'}`);
      } else {
        console.log("❌ Respuesta vacía");
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
        console.log(`✅ RESPUESTA CORRECTA - Puntos: ${pointsAwarded}${autoSubmission ? " (auto)" : ""}`);
      } else {
        console.log(`❌ RESPUESTA INCORRECTA - Puntos: 0`);
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

      console.log(`Jugador ${player.username} - Correcta: ${isCorrect} - Puntos: ${pointsAwarded} - Total: ${player.score}`);
      console.log("=================================");

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
        console.log(`🏁 Juego terminado por modo ${result.game.gameMode}:`, result.modeResult.winner);
        
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
        console.log("🎯 Todos los jugadores han respondido, forzando timeout para mostrar respuestas correctas");
        
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
                  console.log(`🔄 Continuando con pregunta ${nextGame.currentQuestion + 1} de ${nextGame.questions.length}`);
                  emitQuestion(nextGame, nextGame.currentQuestion, io, endGame);
                } else {
                  console.log(`🏁 Todas las preguntas completadas, terminando juego`);
                  endGame(nextGame, nextGame.pin, io);
                }
              }, 5000); // 5 segundos para mostrar las respuestas correctas
            }
          }, 1000); // 1 segundo de delay para que se procesen todas las respuestas
        }
      }
    } catch (error) {
      console.error("Error en submit-answer:", error);
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
    try {
      const game = await Game.findOne({ "players.id": socket.id });

      if (game) {
        const player = game.players.find(p => p.id === socket.id);
        
        if (!player) {
          console.log(`⚠️ Jugador con socket ${socket.id} no encontrado en el juego`);
          return;
        }

        const playerName = player.username;
        const sessionId = player.sessionId;

        console.log(`🔌 Jugador ${playerName} desconectado (razón: ${reason})`);

        // NUEVO: Desregistrar del sistema anti-multicuentas (desconexión real)
        unregisterPlayer(game.pin, playerName, socket, true);

        // Marcar como desconectado pero NO eliminar
        player.isConnected = false;
        player.disconnectedAt = new Date();
        await game.save();

        // Notificar desconexión temporal
        io.to(game.pin).emit("player-disconnected", {
          playerId: socket.id,
          sessionId: sessionId,
          username: playerName,
          canReconnect: true,
          gracePeriodSeconds: 180, // 3 minutos
          players: game.players.filter(p => p.isConnected) // Solo jugadores conectados
        });

        // Programar limpieza después del período de gracia
        schedulePlayerCleanup(sessionId, game.pin, async () => {
          try {
            const updatedGame = await Game.findOne({ pin: game.pin });
            
            if (updatedGame) {
              const stillDisconnected = updatedGame.players.find(
                p => p.sessionId === sessionId && !p.isConnected
              );
              
              if (stillDisconnected) {
                console.log(`🗑️ Eliminando jugador ${playerName} por timeout de reconexión`);
                
                updatedGame.players = updatedGame.players.filter(
                  p => p.sessionId !== sessionId
                );
                await updatedGame.save();

                // Notificar eliminación definitiva
                io.to(updatedGame.pin).emit("player-removed", {
                  sessionId: sessionId,
                  username: playerName,
                  reason: 'reconnection_timeout',
                  players: updatedGame.players.filter(p => p.isConnected)
                });

                io.to(updatedGame.pin).emit("players-updated", {
                  players: updatedGame.players.filter(p => p.isConnected)
                });
              }
            }
          } catch (error) {
            console.error("Error en limpieza de jugador:", error);
          }
        });

        console.log(`⏳ Jugador ${playerName} tiene 3 minutos para reconectar`);
      }
    } catch (error) {
      console.error("Error en disconnect:", error);
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
          
          // NUEVO: NO desregistrar inmediatamente en salida voluntaria
          // Mantener registro por 5 minutos para prevenir multicuentas
          unregisterPlayer(pin, username, socket, false);

          io.to(pin).emit("player-left", {
            playerId: removedPlayer.id,
            players: game.players,
            reason: 'voluntary_leave'
          });

          io.to(pin).emit("players-updated", {
            players: game.players
          });

          console.log(`Jugador ${username} salió voluntariamente del juego ${pin}`);
        } else {
          console.log(`No se encontró jugador ${username} en el juego ${pin}`);
        }
      }
    } catch (error) {
      console.error("Error en leave-game:", error);
    }
  });
};

module.exports = {
  handleJoinGame,
  handleSubmitAnswer,
  handleDisconnect,
  handleLeaveGame
};