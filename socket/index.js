const { handleCreateGame, handleStartGame, handleRejoinHost, handleKickPlayer, handleCreateTournament, handleStartTournamentMatch } = require("./handlers/gameHandlers");
const {
  handleJoinGame,
  handleSubmitAnswer,
  handleDisconnect,
  handleLeaveGame
} = require("./handlers/playerHandlers");
const {
  handleGetRoomPlayers,
  handleGetCurrentQuestion
} = require("./handlers/roomHandlers");
const { clearSocketData, startCleanupInterval } = require("../utils/rateLimiter");
const logger = require("../utils/logger");

// Iniciar limpieza periódica de datos de rate limiting
startCleanupInterval();

/**
 * Configura todos los manejadores de eventos de Socket.IO
 * @param {Server} io - Instancia del servidor de Socket.IO
 */
const setupSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    logger.debug("Socket conectado:", socket.id);

    // Handlers de juego
    handleCreateGame(socket, io);
    handleStartGame(socket, io);
    handleRejoinHost(socket, io);
    handleKickPlayer(socket, io);
    
    // Handlers de torneo
    handleCreateTournament(socket, io);
    handleStartTournamentMatch(socket, io);

    // Handlers de jugadores
    handleJoinGame(socket, io);
    handleSubmitAnswer(socket, io);
    handleLeaveGame(socket, io);
    handleDisconnect(socket, io);

    // Handlers de sala
    handleGetRoomPlayers(socket, io);
    handleGetCurrentQuestion(socket, io);

    // Limpiar datos de rate limiting al desconectar
    socket.on("disconnect", () => {
      clearSocketData(socket.id);
    });
  });
};

module.exports = setupSocketHandlers;