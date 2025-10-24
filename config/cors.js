const cors = require("cors");

/**
 * Orígenes permitidos para CORS
 */
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://192.168.1.13:5173',
  'https://dotsgo-frontend.onrender.com'
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