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
      console.log(`🎮 Admin socket ${socket.id} creó juego y se unió a sala ${pin}`);
      
      // Debug: Verificar que el socket esté en la sala
      const socketsInRoom = await socket.in(pin).allSockets();
      console.log(`🔍 Sockets en sala ${pin}:`, Array.from(socketsInRoom));

      callback({ success: true, pin });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
};

/**
 * Permite al host reconectarse a un juego existente después de recargar la página
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleRejoinHost = (socket, io) => {
  socket.on("rejoin-host", async ({ pin }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      socket.join(pin);
      console.log(`🔄 Admin socket ${socket.id} se reconectó a sala ${pin} con ${game.players.length} jugadores`);

      const players = game.players.map(player => ({
        id: player.id,
        username: player.username,
        character: player.character || null,
        score: player.score || 0,
      }));

      callback({
        success: true,
        game: {
          status: game.status,
          players,
          timeLimitPerQuestion: game.timeLimitPerQuestion / 1000,
          questionsCount: game.questions.length,
        }
      });
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

/**
 * Maneja la expulsión de un jugador por parte del administrador
 * @param {Socket} socket - Socket del cliente (admin)
 * @param {Object} io - Instancia de Socket.IO
 */
const handleKickPlayer = (socket, io) => {
  socket.on("kick-player", async ({ pin, playerId, playerUsername }, callback) => {
    try {
      const game = await Game.findOne({ pin });

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      // Buscar el jugador a expulsar
      const playerIndex = game.players.findIndex(p => p.id === playerId);
      
      if (playerIndex === -1) {
        return callback({ success: false, error: "Jugador no encontrado" });
      }

      // No permitir expulsar al host (primer jugador)
      if (playerIndex === 0) {
        return callback({ success: false, error: "No se puede expulsar al host" });
      }

      const kickedPlayer = game.players[playerIndex];
      
      // Remover jugador de la partida
      game.players.splice(playerIndex, 1);
      await game.save();

      // Notificar al jugador expulsado
      const playerSocket = io.sockets.sockets.get(playerId);
      if (playerSocket) {
        playerSocket.emit("player-kicked", {
          reason: "Expulsado por el administrador",
          message: "Has sido expulsado de la partida por el administrador."
        });
        
        // Desconectar al jugador de la sala
        playerSocket.leave(pin);
      }

      // Notificar a todos los demás jugadores
      io.to(pin).emit("player-left", {
        playerId: playerId,
        players: game.players,
        reason: 'kicked_by_admin',
        kickedPlayerName: kickedPlayer.username
      });

      io.to(pin).emit("players-updated", {
        players: game.players
      });

      console.log(`Admin expulsó al jugador ${kickedPlayer.username} del juego ${pin}`);
      
      callback({ 
        success: true, 
        message: `Jugador ${kickedPlayer.username} expulsado exitosamente`,
        updatedPlayers: game.players
      });

    } catch (error) {
      console.error("Error al expulsar jugador:", error);
      callback({ success: false, error: error.message });
    }
  });
};

module.exports = {
  handleCreateGame,
  handleStartGame,
  handleRejoinHost,
  handleKickPlayer
};