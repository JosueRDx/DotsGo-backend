const Game = require("../../models/game.model");
const { validatePin } = require("../../utils/validation");
const logger = require("../../utils/logger");

/**
 * Maneja la solicitud de información de jugadores en una sala
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleGetRoomPlayers = (socket, io) => {
  socket.on("get-room-players", async ({ pin }, callback) => {
    // Validar que callback es una función
    if (typeof callback !== 'function') {
      return;
    }

    // Validar PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      logger.warn(`⚠️ Validación fallida en get-room-players:`, pinValidation.error);
      return callback({
        success: false,
        error: pinValidation.error
      });
    }

    try {
      const game = await Game.findOne({ pin: pinValidation.sanitized }).populate("questions");

      if (!game) {
        return callback({
          success: false,
          error: "Juego no encontrado"
        });
      }

      logger.debug(`get-room-players: PIN ${pin} tiene ${game.questions.length} preguntas`);

      callback({
        success: true,
        players: game.players,
        gameInfo: {
          pin: game.pin,
          questionsCount: game.questions.length,
          maxPlayers: 50,
          status: game.status,
          timeLimitPerQuestion: game.timeLimitPerQuestion / 1000
        }
      });
    } catch (error) {
      logger.error("Error en get-room-players:", error);
      callback({
        success: false,
        error: error.message
      });
    }
  });
};

/**
 * Maneja la solicitud de la pregunta actual de un juego activo
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleGetCurrentQuestion = (socket, io) => {
  socket.on("get-current-question", async ({ pin }, callback) => {
    // Validar que callback es una función
    if (typeof callback !== 'function') {
      return;
    }

    // Validar PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      logger.warn(`⚠️ Validación fallida en get-current-question:`, pinValidation.error);
      return callback({
        success: false,
        error: pinValidation.error
      });
    }

    try {
      const game = await Game.findOne({ pin: pinValidation.sanitized }).populate("questions");

      if (!game) {
        return callback({
          success: false,
          error: "Juego no encontrado"
        });
      }

      if (game.status !== "playing") {
        return callback({
          success: false,
          error: "El juego no está activo"
        });
      }

      // Si hay una pregunta actual activa
      if (game.currentQuestion >= 0 && game.currentQuestion < game.questions.length) {
        // Buscar al jugador específico que está solicitando la pregunta
        const player = game.players.find(p => p.id === socket.id);

        if (!player) {
          return callback({
            success: false,
            error: "Jugador no encontrado"
          });
        }

        // Obtener la pregunta según el orden aleatorio del jugador
        const playerQuestionId = player.questionOrder[game.currentQuestion];
        const currentQuestion = game.questions.find(q => q._id.toString() === playerQuestionId.toString());

        if (!currentQuestion) {
          return callback({
            success: false,
            error: "Pregunta no encontrada"
          });
        }

        const timeElapsed = Date.now() - (game.questionStartTime || Date.now());
        const timeRemaining = Math.max(0, Math.floor((game.timeLimitPerQuestion - timeElapsed) / 1000));

        if (timeRemaining > 0) {
          logger.debug(`📥 get-current-question: Jugador ${player.username} recibe pregunta: ${currentQuestion.title}`);
          return callback({
            success: true,
            question: currentQuestion,
            timeLeft: timeRemaining,
            currentIndex: game.currentQuestion + 1,
            totalQuestions: game.questions.length,
            gameMode: game.gameMode,
            modeConfig: game.modeConfig
          });
        }
      }

      return callback({
        success: true,
        question: null,
        timeLeft: 0,
        currentIndex: 0,
        totalQuestions: game.questions.length,
        gameMode: game.gameMode,
        modeConfig: game.modeConfig
      });
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // NUEVO: Manejo del evento request-current-question (método de respaldo)
  socket.on("request-current-question", async ({ pin }, callback) => {
    // Validar PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      logger.warn(`⚠️ Validación fallida en request-current-question:`, pinValidation.error);
      return callback({
        success: false,
        error: pinValidation.error
      });
    }

    try {
      const game = await Game.findOne({ pin: pinValidation.sanitized }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.status !== "playing") {
        return callback({ success: false, error: "No hay juego activo" });
      }

      const player = game.players.find(p => p.id === socket.id);
      if (!player) {
        return callback({ success: false, error: "Jugador no encontrado" });
      }

      // Obtener la pregunta específica del jugador
      const playerQuestionId = player.questionOrder[game.currentQuestion];
      const playerQuestion = game.questions.find(q => q._id.toString() === playerQuestionId.toString());

      if (!playerQuestion) {
        return callback({ success: false, error: "No hay pregunta activa" });
      }

      const questionStartTime = game.questionStartTime || Date.now();
      const timeElapsed = Date.now() - questionStartTime;
      const timeRemaining = Math.max(0, Math.floor((game.timeLimitPerQuestion - timeElapsed) / 1000));

      callback({
        success: true,
        question: playerQuestion,
        timeLeft: timeRemaining,
        currentIndex: game.currentQuestion + 1,
        totalQuestions: game.questions.length,
        gameMode: game.gameMode,
        modeConfig: game.modeConfig
      });

    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
};

module.exports = {
  handleGetRoomPlayers,
  handleGetCurrentQuestion
};