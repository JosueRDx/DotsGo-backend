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
      credentials: true
    },
    transports: ["websocket", "polling"], // Permitir fallback a polling
    pingTimeout: 60000, // 60 segundos
    pingInterval: 25000, // 25 segundos
    connectTimeout: 45000, // 45 segundos
    allowEIO3: true
  });

  return io;
};

module.exports = setupSocketIO;