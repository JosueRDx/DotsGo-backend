const Game = require("../models/game.model");
const { isAnswerCorrect } = require("./validationService");
const { MIN_TIMEOUT_POINTS } = require("./validationService");
const logger = require("../utils/logger");

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

    const timeoutResponseTime = game.timeLimitPerQuestion / 1000;

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
          const previousResponseTime = Number.isFinite(existing.responseTime)
            ? existing.responseTime
            : 0;
          existing.responseTime = timeoutResponseTime;
          player.totalResponseTime = Math.max(0, (player.totalResponseTime || 0) - previousResponseTime + timeoutResponseTime);
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
        responseTime: timeoutResponseTime,
      });
      player.totalResponseTime = (player.totalResponseTime || 0) + timeoutResponseTime;
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
    logger.error("Error al registrar timeout:", error);
  }
};

/**
 * Procesa los timeouts de todos los jugadores activos en un juego
 * @param {Object} game - Documento del juego
 * @param {Object} io - Instancia de Socket.IO
 */
const processTimeouts = async (game, io) => {
  // CORREGIDO: Solo procesar jugadores activos (no eliminados)
  const activePlayers = game.players.filter(p => !p.isEliminated).map(p => p.id);
  for (const playerId of activePlayers) {
    await registerTimeoutAnswer(game._id, playerId, io);
  }
};

/**
 * Verifica si todos los jugadores activos han respondido su pregunta actual (según su orden aleatorio)
 * @param {Object} game - Documento del juego
 * @returns {boolean} true si todos los jugadores activos han respondido
 */
const haveAllPlayersAnswered = (game) => {
  if (game.currentQuestion < 0 || game.currentQuestion >= game.questions.length) {
    return false;
  }

  // CORREGIDO: Solo considerar jugadores activos (no eliminados)
  const activePlayers = game.players.filter(player => !player.isEliminated);
  
  if (activePlayers.length === 0) {
    return true; // Si no hay jugadores activos, consideramos que "todos" han respondido
  }

  // Verificar que cada jugador activo haya respondido su pregunta específica de la ronda actual
  return activePlayers.every(player => {
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

  const results = updatedGame.players.map(player => {
    const normalizedScore = Number.isFinite(player.score)
      ? player.score
      : Number(player.score) || 0;

    const normalizedCorrect = Number.isFinite(player.correctAnswers)
      ? player.correctAnswers
      : Number(player.correctAnswers) || 0;

    const normalizedResponseTime = Number.isFinite(player.totalResponseTime)
      ? player.totalResponseTime
      : Number(player.totalResponseTime) || 0;

    const playerQuestionCount = Array.isArray(player.questionOrder) && player.questionOrder.length > 0
      ? player.questionOrder.length
      : totalQuestions;

    return {
      username: player.username,
      score: normalizedScore,
      correctAnswers: normalizedCorrect,
      totalQuestions: playerQuestionCount,
      character: player.character || null,
      totalResponseTime: normalizedResponseTime
    };
  });

  // NUEVO: Verificar si alguien respondió correctamente
  const hasWinner = results.some(player => player.correctAnswers > 0);
  
  logger.info("Resultados finales enviados desde el backend:", results);
  logger.debug(`¿Hay ganador?: ${hasWinner}`);
  logger.debug(`Modo de juego: ${updatedGame.gameMode}`);
  
  io.to(pin).emit("game-ended", { 
    results, 
    hasWinner, // NUEVO: Indicar si hay ganador
    gameMode: updatedGame.gameMode, // NUEVO: Incluir modo de juego
    winner: updatedGame.winner, // NUEVO: Incluir información del ganador
    endReason: 'Juego completado' // NUEVO: Razón de finalización
  });
};

module.exports = {
  registerTimeoutAnswer,
  processTimeouts,
  haveAllPlayersAnswered,
  endGame
};