const Game = require("../../models/game.model");
const { Question } = require("../../models/question.model");
const generatePin = require("../../utils/generatePin");
const { emitQuestion } = require("../../services/questionService");
const { endGame } = require("../../services/gameService");
const tournamentService = require("../../services/tournamentService");
const { checkRateLimit } = require("../../utils/rateLimiter");
const { validateCreateGameData, validatePin } = require("../../utils/validation");
const logger = require("../../utils/logger");

/**
 * Maneja la creación de un nuevo juego
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleCreateGame = (socket, io) => {
  socket.on("create-game", async (gameData, callback) => {
    // Validar que callback es una función
    if (typeof callback !== 'function') {
      return;
    }

    // Verificar rate limiting
    const rateCheck = checkRateLimit(socket.id, 'create-game');
    if (!rateCheck.allowed) {
      return callback({
        success: false,
        error: `Demasiadas solicitudes. Intenta de nuevo en ${rateCheck.retryAfter} segundos.`,
        rateLimitExceeded: true
      });
    }

    // Validar datos de entrada
    const validation = validateCreateGameData(gameData);
    if (!validation.valid) {
      logger.warn(`⚠️ Validación fallida en create-game:`, validation.errors);
      return callback({
        success: false,
        error: validation.errors[0], // Enviar el primer error
        validationErrors: validation.errors // Lista completa de errores
      });
    }

    try {
      // Usar datos validados y sanitizados
      const { timeLimit, questionIds, gameMode, gameName, modeConfig: customModeConfig } = validation.sanitized;
      const pin = generatePin();
      const questions = await Question.find({ '_id': { $in: questionIds } });

      // NUEVO: Importar configuración de modos de juego
      const { getGameModeConfig } = require("../../services/gameModeService");
      const defaultModeConfig = getGameModeConfig(gameMode);

      // CORREGIDO: Usar configuración personalizada del frontend si está disponible
      const finalModeConfig = {
        maxLives: customModeConfig?.maxLives || defaultModeConfig.maxLives || 3,
        maxPlayers: defaultModeConfig.maxPlayers || 50,
        duelPlayers: defaultModeConfig.maxPlayers === 2 ? 2 : null,
        winCondition: defaultModeConfig.winCondition || 'all_questions'
      };

      logger.info(`🎮 Creando juego en modo ${gameMode} con configuración:`, finalModeConfig);

      const game = new Game({
        pin,
        timeLimitPerQuestion: timeLimit * 1000,
        hostId: socket.id,
        questions: questions.map(q => q._id),
        status: "waiting",
        // NUEVO: Configuración de modo de juego
        gameMode: gameMode,
        modeConfig: finalModeConfig,
        gameName: gameName || `Juego ${gameMode}`
      });

      await game.save();
      socket.join(pin);
      logger.info(`🎮 Admin socket ${socket.id} creó juego y se unió a sala ${pin}`);
      
      // Debug: Verificar que el socket esté en la sala
      const socketsInRoom = await socket.in(pin).allSockets();
      logger.debug(`🔍 Sockets en sala ${pin}:`, Array.from(socketsInRoom));

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
    // Validar que callback es una función
    if (typeof callback !== 'function') {
      return;
    }

    // Validar PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      logger.warn(`⚠️ Validación fallida en rejoin-host:`, pinValidation.error);
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

      // Verificar que el socket que se reconecta sea el host original
      if (game.hostId !== socket.id) {
        logger.warn(`Intento de reconexión no autorizada al juego ${pin} por socket ${socket.id}. Host real: ${game.hostId}`);
        return callback({ 
          success: false, 
          error: "No autorizado. Solo el host puede reconectarse." 
        });
      }

      socket.join(pin);
      logger.info(`🔄 Admin socket ${socket.id} se reconectó a sala ${pin} con ${game.players.length} jugadores`);

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
    // Validar que callback es una función
    if (typeof callback !== 'function') {
      return;
    }

    // Verificar rate limiting
    const rateCheck = checkRateLimit(socket.id, 'start-game');
    if (!rateCheck.allowed) {
      return callback({
        success: false,
        error: `Demasiadas solicitudes. Intenta de nuevo en ${rateCheck.retryAfter} segundos.`,
        rateLimitExceeded: true
      });
    }

    // Validar PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      logger.warn(`⚠️ Validación fallida en start-game:`, pinValidation.error);
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

      if (game.status !== "waiting") {
        return callback({ success: false, error: "El juego ya ha comenzado" });
      }

      game.status = "playing";
      game.currentQuestion = 0;
      game.questionStartTime = Date.now();
      // Establecer timestamp de inicio del juego para auto-finalización
      game.gameStartedAt = new Date();
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
 * Maneja la creación de un torneo
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleCreateTournament = (socket, io) => {
  socket.on("create-tournament", async ({ pin }, callback) => {
    // Validar PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      logger.warn(`⚠️ Validación fallida en create-tournament:`, pinValidation.error);
      return callback({
        success: false,
        error: pinValidation.error
      });
    }

    try {
      const game = await Game.findOne({ pin: pinValidation.sanitized });

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.gameMode !== 'tournament') {
        return callback({ success: false, error: "El juego no está en modo torneo" });
      }

      if (game.players.length < 2) {
        return callback({ success: false, error: "Se necesitan al menos 2 jugadores para crear un torneo" });
      }

      // Crear el torneo
      const tournament = tournamentService.createTournament(pin, game.players);
      
      // Emitir estado inicial del torneo
      io.to(pin).emit("tournament-state-update", tournament);

      logger.info(`🏆 Torneo creado para juego ${pin} con ${game.players.length} jugadores`);
      
      callback({ 
        success: true, 
        tournament: tournament
      });

    } catch (error) {
      logger.error("Error al crear torneo:", error);
      callback({ success: false, error: error.message });
    }
  });
};

/**
 * Maneja el inicio de un match del torneo
 * @param {Socket} socket - Socket del cliente
 * @param {Object} io - Instancia de Socket.IO
 */
const handleStartTournamentMatch = (socket, io) => {
  socket.on("start-tournament-match", async ({ pin, matchId }, callback) => {
    // Validar PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      logger.warn(`⚠️ Validación fallida en start-tournament-match:`, pinValidation.error);
      return callback({
        success: false,
        error: pinValidation.error
      });
    }

    // Validar matchId (debe ser un string no vacío)
    if (!matchId || typeof matchId !== 'string' || matchId.trim().length === 0) {
      logger.warn(`⚠️ Validación fallida en start-tournament-match: matchId inválido`);
      return callback({
        success: false,
        error: "El ID del match es requerido"
      });
    }

    try {
      const game = await Game.findOne({ pin: pinValidation.sanitized }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      // Iniciar el match en el servicio de torneo
      const match = tournamentService.startMatch(pin, matchId);
      
      if (!match) {
        return callback({ success: false, error: "Match no encontrado" });
      }

      // Configurar el juego para el duelo específico
      game.status = "playing";
      game.currentQuestion = 0;
      game.questionStartTime = Date.now();
      
      // Filtrar solo los jugadores del match actual
      const matchPlayers = [match.player1, match.player2].filter(p => p && !p.isBye);
      
      // Actualizar los jugadores activos en el juego
      game.activePlayers = matchPlayers.map(p => p.id);
      await game.save();

      // Notificar que el match comenzó
      io.to(pin).emit("tournament-match-started", {
        match: match,
        players: matchPlayers
      });

      // Emitir countdown antes de iniciar
      io.to(pin).emit("game-starting", {
        countdown: 3,
        message: `¡Match iniciando: ${match.player1.username} vs ${match.player2.username}!`
      });

      // Esperar 3 segundos y luego iniciar la primera pregunta
      setTimeout(() => {
        emitQuestion(game, game.currentQuestion, io, (gameResult) => {
          // Callback personalizado para manejar el fin del match
          handleTournamentMatchEnd(game, gameResult, io);
        });
      }, 3000);

      logger.info(`⚔️ Match iniciado: ${match.player1.username} vs ${match.player2.username}`);
      
      callback({ success: true });

    } catch (error) {
      logger.error("Error al iniciar match del torneo:", error);
      callback({ success: false, error: error.message });
    }
  });
};

/**
 * Maneja el fin de un match del torneo
 */
const handleTournamentMatchEnd = async (game, gameResult, io) => {
  try {
    const tournament = tournamentService.getTournamentState(game.pin);
    if (!tournament || !tournament.currentMatch) return;

    // Determinar el ganador del match
    let winner = null;
    if (gameResult.results && gameResult.results.length > 0) {
      // El ganador es el jugador con mayor puntuación
      const sortedResults = gameResult.results.sort((a, b) => b.score - a.score);
      winner = sortedResults[0];
    }

    if (winner) {
      // Completar el match en el torneo
      const completedMatch = tournamentService.completeMatch(
        game.pin, 
        tournament.currentMatch.id, 
        winner
      );

      // Obtener estado actualizado del torneo
      const updatedTournament = tournamentService.getTournamentState(game.pin);

      // Emitir resultado del match
      io.to(game.pin).emit("tournament-match-completed", {
        match: completedMatch,
        winner: winner,
        bracket: updatedTournament.bracket,
        tournamentWinner: updatedTournament.winner
      });

      // Si el torneo terminó, emitir evento final
      if (updatedTournament.status === 'completed') {
        io.to(game.pin).emit("tournament-completed", {
          winner: updatedTournament.winner,
          bracket: updatedTournament.bracket
        });
        
        // Limpiar el torneo
        tournamentService.deleteTournament(game.pin);
      } else {
        // Emitir estado actualizado
        io.to(game.pin).emit("tournament-state-update", updatedTournament);
      }

      logger.info(`✅ Match completado. Ganador: ${winner.username}`);
    }

  } catch (error) {
    logger.error("Error al manejar fin de match del torneo:", error);
  }
};

/**
 * Maneja la expulsión de un jugador por parte del administrador
 * @param {Socket} socket - Socket del cliente (admin)
 * @param {Object} io - Instancia de Socket.IO
 */
const handleKickPlayer = (socket, io) => {
  socket.on("kick-player", async ({ pin, playerId, playerUsername }, callback) => {
    // Validar PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      logger.warn(`⚠️ Validación fallida en kick-player:`, pinValidation.error);
      return callback({
        success: false,
        error: pinValidation.error
      });
    }

    // Validar playerId (debe ser un string no vacío)
    if (!playerId || typeof playerId !== 'string' || playerId.trim().length === 0) {
      logger.warn(`⚠️ Validación fallida en kick-player: playerId inválido`);
      return callback({
        success: false,
        error: "El ID del jugador es requerido"
      });
    }

    try {
      const game = await Game.findOne({ pin: pinValidation.sanitized });

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

      logger.info(`Admin expulsó al jugador ${kickedPlayer.username} del juego ${pin}`);
      
      callback({ 
        success: true, 
        message: `Jugador ${kickedPlayer.username} expulsado exitosamente`,
        updatedPlayers: game.players
      });

    } catch (error) {
      logger.error("Error al expulsar jugador:", error);
      callback({ success: false, error: error.message });
    }
  });
};

module.exports = {
  handleCreateGame,
  handleStartGame,
  handleRejoinHost,
  handleKickPlayer,
  handleCreateTournament,
  handleStartTournamentMatch
};