const Game = require("../../models/game.model");
const { Question } = require("../../models/question.model");
const generatePin = require("../../utils/generatePin");
const { emitQuestion } = require("../../services/questionService");
const { endGame } = require("../../services/gameService");

/**
 * Maneja la creación de un nuevo juego
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleCreateGame = (socket, io) => {
  socket.on("create-game", async (gameData, callback) => {
    try {
      const { timeLimit, questionIds } = gameData;
      const pin = generatePin();
      const questions = await Question.find({ '_id': { $in: questionIds } });

      const game = new Game({
        pin,
        timeLimitPerQuestion: timeLimit * 1000,
        hostId: socket.id,
        questions: questions.map(q => q._id),
        status: "waiting",
      });

      await game.save();
      socket.join(pin);

      callback({ success: true, pin });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
};

/**
 * Maneja el inicio de un juego
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleStartGame = (socket, io) => {
  socket.on("start-game", async ({ pin }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.status !== "waiting") {
        return callback({ success: false, error: "El juego ya ha comenzado" });
      }

      game.status = "playing";
      game.currentQuestion = 0;
      game.questionStartTime = Date.now();
      await game.save();

      // Emitir countdown antes de iniciar
      io.to(pin).emit("game-starting", {
        countdown: 5,
        message: "¡El juego comenzará en breve!"
      });

      // Esperar 5 segundos y luego iniciar
      setTimeout(() => {
        emitQuestion(game, game.currentQuestion, io, endGame);
      }, 5000);

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
};

module.exports = {
  handleCreateGame,
  handleStartGame
};