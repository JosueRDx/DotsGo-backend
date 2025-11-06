const cors = require("cors");

/**
 * Orígenes permitidos para CORS
 */
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://dotsgo-frontend.onrender.com',
  'http://192.168.226.1:5173',
  'http://192.168.25.1:5173',
  'http://192.168.43.219:5173'
];

/**
 * Opciones de configuración de CORS para Express
 */
const corsOptions = {
  origin: allowedOrigins
};

/**
 * Configura CORS en la aplicación Express
 * @param {Express} app - Aplicación Express
 */
const setupCors = (app) => {
  app.use(cors(corsOptions));
};

module.exports = {
  allowedOrigins,
  corsOptions,
  setupCors
};