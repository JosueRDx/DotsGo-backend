const Game = require("../models/game.model");
const { isAnswerCorrect } = require("./validationService");
const { MIN_TIMEOUT_POINTS } = require("./validationService");

/**
 * Registra una respuesta por timeout para un jugador específico
 * @param {string} gameId - ID del juego
 * @param {string} playerId - ID del jugador
 * @param {Object} io - Instancia de Socket.IO
 */
const registerTimeoutAnswer = async (gameId, playerId, io) => {
  try {
    const game = await Game.findById(gameId).populate("questions");
    if (!game) return;

    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    // Obtener la pregunta específica del jugador según su orden aleatorio
    const playerQuestionId = player.questionOrder[game.currentQuestion];
    const question = game.questions.find(q => q._id.toString() === playerQuestionId.toString());

    if (!question) return;

    const currentQuestionId = question._id.toString();

    let existing = player.answers.find(a => a.questionId.toString() === currentQuestionId);

    if (existing) {
      if (
        !existing.isCorrect &&
        existing.pointsAwarded === 0 &&
        existing.givenAnswer &&
        existing.givenAnswer.pictogram
      ) {
        if (isAnswerCorrect(existing.givenAnswer, question.correctAnswer)) {
          existing.isCorrect = true;
          existing.pointsAwarded = MIN_TIMEOUT_POINTS;
          player.score += MIN_TIMEOUT_POINTS;
          player.correctAnswers += 1;
        }
      }
    } else {
      player.answers.push({
        questionId: currentQuestionId,
        givenAnswer: { pictogram: "", colors: [], number: "" },
        isCorrect: false,
        pointsAwarded: 0,
      });
      existing = player.answers[player.answers.length - 1];
    }

    await game.save();

    io.to(game.pin).emit("player-answered", {
      playerId: player.id,
      isCorrect: existing.isCorrect,
      pointsAwarded: existing.pointsAwarded,
      playerScore: player.score,
    });
  } catch (error) {
    console.error("Error al registrar timeout:", error);
  }
};

/**
 * Procesa los timeouts de todos los jugadores en un juego
 * @param {Object} game - Documento del juego
 * @param {Object} io - Instancia de Socket.IO
 */
const processTimeouts = async (game, io) => {
  const currentPlayers = game.players.map(p => p.id);
  for (const playerId of currentPlayers) {
    await registerTimeoutAnswer(game._id, playerId, io);
  }
};

/**
 * Verifica si todos los jugadores han respondido su pregunta actual (según su orden aleatorio)
 * @param {Object} game - Documento del juego
 * @returns {boolean} true si todos han respondido
 */
const haveAllPlayersAnswered = (game) => {
  if (game.currentQuestion < 0 || game.currentQuestion >= game.questions.length) {
    return false;
  }

  // Verificar que cada jugador haya respondido su pregunta específica de la ronda actual
  return game.players.every(player => {
    // Obtener la pregunta que le tocó al jugador en esta ronda
    const playerQuestionId = player.questionOrder[game.currentQuestion];

    // Verificar si ya respondió esa pregunta
    return player.answers.some(a => a.questionId.toString() === playerQuestionId.toString());
  });
};

/**
 * Finaliza el juego y emite los resultados a todos los jugadores
 * @param {Object} game - Documento del juego
 * @param {string} pin - PIN del juego
 * @param {Object} io - Instancia de Socket.IO
 */
const endGame = async (game, pin, io) => {
  game.status = "finished";
  await game.save();

  const updatedGame = await Game.findById(game._id);
  const totalQuestions = updatedGame.questions.length;

  const results = updatedGame.players.map(player => ({
    username: player.username,
    score: player.score || 0,
    correctAnswers: player.correctAnswers || 0,
    totalQuestions,
    character: player.character || null
  }));

  console.log("Resultados finales enviados desde el backend:", results);
  io.to(pin).emit("game-ended", { results });
};

module.exports = {
  registerTimeoutAnswer,
  processTimeouts,
  haveAllPlayersAnswered,
  endGame
};