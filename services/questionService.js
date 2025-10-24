const Game = require("../models/game.model");
const { processTimeouts } = require("./gameService");
const { setQuestionTimer, deleteQuestionTimer } = require("../utils/timer");

/**
 * Emite una pregunta individual a cada jugador según su orden aleatorio
 * Esta función se llama recursivamente para cada ronda de preguntas
 * @param {Object} game - Documento del juego
 * @param {number} questionIndex - Índice de la ronda (no la pregunta específica)
 * @param {Object} io - Instancia de Socket.IO
 * @param {Function} endGameCallback - Función para finalizar el juego
 */
const emitQuestion = async (game, questionIndex, io, endGameCallback) => {
  if (questionIndex >= game.questions.length) {
    setTimeout(() => endGameCallback(game, game.pin, io), 1000);
    return;
  }

  await Game.findByIdAndUpdate(
    game._id,
    { $set: { questionStartTime: Date.now() } }
  );

  // Emitir pregunta individual a cada jugador según su orden aleatorio
  game.players.forEach((player) => {

    io.to(game.pin).emit("ranking-updated", {
      players: game.players
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
    // Obtener la pregunta correspondiente al índice actual del jugador
    const playerQuestionId = player.questionOrder[questionIndex];
    const playerQuestion = game.questions.find(q => q._id.toString() === playerQuestionId.toString());

    if (playerQuestion) {
      // Encontrar el socket del jugador y emitirle su pregunta única
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        playerSocket.emit("game-started", {
          question: playerQuestion,
          timeLimit: game.timeLimitPerQuestion / 1000,
          currentIndex: questionIndex + 1,
          totalQuestions: game.questions.length,
        });

        console.log(`📤 Jugador ${player.username} recibió pregunta: ${playerQuestion.title}`);
      }
    }
  });

  const timer = setTimeout(async () => {
    const updatedGame = await Game.findById(game._id).populate("questions");
    if (updatedGame && updatedGame.status === "playing") {
      await processTimeouts(updatedGame, io);

      // NUEVO: Mostrar respuestas correctas antes de continuar
      await showCorrectAnswers(updatedGame, questionIndex, io);

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

      // Esperar un poco antes de continuar con la siguiente pregunta
      setTimeout(async () => {
        const nextGame = await Game.findByIdAndUpdate(
          updatedGame._id,
          { $inc: { currentQuestion: 1 }, $set: { questionStartTime: Date.now() } },
          { new: true }
        ).populate("questions");
        emitQuestion(nextGame, nextGame.currentQuestion, io, endGameCallback);
      }, 5000); // 5 segundos para mostrar las respuestas correctas
    }
    deleteQuestionTimer(game.pin);
  }, game.timeLimitPerQuestion);

  setQuestionTimer(game.pin, timer);
};

/**
 * Muestra las respuestas correctas a todos los jugadores
 * @param {Object} game - Documento del juego
 * @param {number} questionIndex - Índice de la ronda actual
 * @param {Object} io - Instancia de Socket.IO
 */
const showCorrectAnswers = async (game, questionIndex, io) => {
  console.log(`📋 Mostrando respuestas correctas para la ronda ${questionIndex + 1}`);

  // Crear un mapa de respuestas correctas para cada jugador
  const playerAnswers = game.players.map(player => {
    const playerQuestionId = player.questionOrder[questionIndex];
    const playerQuestion = game.questions.find(q => q._id.toString() === playerQuestionId.toString());
    
    if (playerQuestion) {
      return {
        playerId: player.id,
        username: player.username,
        question: {
          title: playerQuestion.title,
          correctAnswer: playerQuestion.correctAnswer
        },
        character: player.character
      };
    }
    return null;
  }).filter(Boolean);

  // Emitir las respuestas correctas a todos los jugadores
  io.to(game.pin).emit("show-correct-answers", {
    roundIndex: questionIndex + 1,
    totalQuestions: game.questions.length,
    playerAnswers: playerAnswers,
    displayTime: 5000 // 5 segundos para mostrar las respuestas
  });

  console.log(`✅ Respuestas correctas enviadas a ${playerAnswers.length} jugadores`);
};

module.exports = {
  emitQuestion,
  showCorrectAnswers
};