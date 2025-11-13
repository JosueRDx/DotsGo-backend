const cors = require("cors");

/**
 * Orígenes permitidos para CORS
 * Se obtienen desde la variable de entorno ALLOWED_ORIGINS
 * Si no está definida, se usan valores por defecto para desarrollo local
 */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://dotsgo-frontend.onrender.com'
    ];

// Log de orígenes permitidos para debugging (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
  console.log('📋 Orígenes CORS permitidos:', allowedOrigins);
}

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