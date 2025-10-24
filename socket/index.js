const { handleCreateGame, handleStartGame, handleRejoinHost } = require("./handlers/gameHandlers");
const {
  handleJoinGame,
  handleSubmitAnswer,
  handleDisconnect,
  handleLeaveGame,
  handleKickPlayer
} = require("./handlers/playerHandlers");
const {
  handleGetRoomPlayers,
  handleGetCurrentQuestion
} = require("./handlers/roomHandlers");

/**
 * Configura todos los manejadores de eventos de Socket.IO
 * @param {Server} io - Instancia del servidor de Socket.IO
 */
const setupSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket conectado:", socket.id);

    // Handlers de juego
    handleCreateGame(socket, io);
    handleStartGame(socket, io);
    handleRejoinHost(socket, io);

    // Handlers de jugadores
    handleJoinGame(socket, io);
    handleSubmitAnswer(socket, io);
    handleLeaveGame(socket, io);
    handleKickPlayer(socket, io);
    handleDisconnect(socket, io);

    // Handlers de sala
    handleGetRoomPlayers(socket, io);
    handleGetCurrentQuestion(socket, io);
  });
};

module.exports = setupSocketHandlers;