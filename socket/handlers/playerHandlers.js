const Game = require("../../models/game.model");
const { isAnswerCorrect, calculatePoints, MIN_TIMEOUT_POINTS } = require("../../services/validationService");
const { haveAllPlayersAnswered, endGame } = require("../../services/gameService");
const { emitQuestion } = require("../../services/questionService");
const { getQuestionTimer, clearQuestionTimer } = require("../../utils/timer");
const shuffleArray = require("../../utils/shuffle");

/**
 * Maneja la unión de un jugador al juego
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleJoinGame = (socket, io) => {
  socket.on("join-game", async ({ pin, username, character }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.status === "finished") {
        return callback({ success: false, error: "El juego ya ha finalizado" });
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

        const playerData = {
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

          console.log(`🔄 Jugador ${username} se unió tarde - Pregunta: ${playerQuestion.title}`);
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
        console.log(`\n🎲 Jugador ${username} - Orden de preguntas:`);
        for (let i = 0; i < shuffledQuestions.length; i++) {
          const q = game.questions.find(question => question._id.toString() === shuffledQuestions[i].toString());
          console.log(`  ${i + 1}. ${q ? q.title : 'Pregunta no encontrada'}`);
        }

        const playerData = {
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

        game.players.push(playerData);
        await game.save();
        socket.join(pin);

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

        io.to(pin).emit("players-updated", {
          players: game.players
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

      return { game, isCorrect, pointsAwarded, player };
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

      // Si todos han respondido su pregunta actual, pasar a la siguiente ronda
      if (haveAllPlayersAnswered(result.game)) {
        clearQuestionTimer(pin);

        // Actualizar y guardar con retry también
        await saveWithRetry(async () => {
          const updatedGame = await Game.findOne({ pin }).populate("questions");
          updatedGame.currentQuestion += 1;
          await updatedGame.save();
          return updatedGame;
        }).then(nextGame => {
          emitQuestion(nextGame, nextGame.currentQuestion, io, endGame);
        });
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
  socket.on("disconnect", async () => {
    try {
      const game = await Game.findOne({ "players.id": socket.id });

      if (game) {
        const player = game.players.find(p => p.id === socket.id);
        const playerName = player ? player.username : 'Jugador desconocido';

        game.players = game.players.filter(p => p.id !== socket.id);
        await game.save();

        io.to(game.pin).emit("player-left", {
          playerId: socket.id,
          players: game.players,
        });

        io.to(game.pin).emit("players-updated", {
          players: game.players
        });

        console.log(`Jugador ${playerName} se desconectó del juego ${game.pin}`);
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
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          game.players.splice(playerIndex, 1);
          await game.save();

          socket.leave(pin);

          io.to(pin).emit("player-left", {
            playerId: socket.id,
            players: game.players,
          });

          io.to(pin).emit("players-updated", {
            players: game.players
          });

          console.log(`Jugador ${username} salió del juego ${pin}`);
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