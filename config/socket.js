const socketIO = require("socket.io");
const { allowedOrigins } = require("./cors");

/**
 * Configura Socket.IO con CORS y opciones de transporte
 * @param {http.Server} server - Servidor HTTP de Node.js
 * @returns {Server} Instancia de Socket.IO
 */
const setupSocketIO = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
    transports: ["websocket"],
  });

  return io;
};

module.exports = setupSocketIO;