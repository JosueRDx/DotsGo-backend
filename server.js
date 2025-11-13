const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const cron = require("node-cron");

// Cargar variables de entorno
dotenv.config();

// Importar configuraciones
const connectDatabase = require("./config/database");
const { setupCors } = require("./config/cors");
const setupSocketIO = require("./config/socket");
const setupSocketHandlers = require("./socket");

// Importar servicios
const {
  cleanupAbandonedGames,
  cleanupStaleWaitingGames,
} = require("./services/gameCleanupService");

// Importar rutas
const questionsRouter = require("./routes/questions.routes");

// Crear aplicación Express y servidor HTTP
const app = express();
const server = http.createServer(app);

// Configurar Socket.IO
const io = setupSocketIO(server);

// Middleware
setupCors(app);
app.use(express.json());

// Rutas HTTP
app.use('/api/questions', questionsRouter);

// Configurar manejadores de Socket.IO
setupSocketHandlers(io);

// Puerto
const PORT = process.env.PORT || 5000;

/**
 * Obtiene las direcciones IP de red del servidor
 * Útil para mostrar URLs accesibles desde otros dispositivos
 * @returns {string[]} Array de direcciones IP disponibles
 */
const getNetworkAddresses = () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  const addresses = [];

  // Iterar sobre todas las interfaces de red
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      // Solo IPv4, no loopback (127.0.0.1), y debe estar activo
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    });
  });

  return addresses;
};

// Conectar a base de datos e iniciar servidor
connectDatabase().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ===== SERVIDOR DOTSGOGAME =====');
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`\n📍 URLs disponibles:`);
    console.log(`   Local:    http://localhost:${PORT}`);
    
    // Mostrar IPs de red detectadas automáticamente
    const networkAddresses = getNetworkAddresses();
    if (networkAddresses.length > 0) {
      networkAddresses.forEach((address) => {
        console.log(`   Network:  http://${address}:${PORT}`);
      });
    } else {
      console.log(`   Network:  (No se detectaron interfaces de red)`);
    }

    // Mostrar URL del frontend si está configurada
    if (process.env.FRONTEND_URL) {
      console.log(`\n🌐 Frontend configurado: ${process.env.FRONTEND_URL}`);
    }

    console.log('\n================================\n');

    // Configurar cron jobs para limpieza automática
    setupCleanupJobs();
  });
}).catch((error) => {
  console.error("❌ Error al iniciar el servidor:", error);
  process.exit(1);
});

/**
 * Configura tareas programadas para limpieza automática de juegos
 * - Cada 5 minutos: Revisa y finaliza juegos que excedan duración máxima
 * - Cada 30 minutos: Limpia juegos en espera obsoletos (>1 hora sin iniciar)
 */
function setupCleanupJobs() {
  // Job 1: Cleanup de juegos activos abandonados (cada 5 minutos)
  cron.schedule("*/5 * * * *", async () => {
    try {
      console.log("🧹 Ejecutando cleanup de juegos abandonados...");
      const stats = await cleanupAbandonedGames(io);
      
      if (stats.finalized > 0 || stats.warned > 0) {
        console.log(
          `✅ Cleanup completado: ${stats.finalized} finalizados, ${stats.warned} advertidos de ${stats.checked} revisados`
        );
      }
    } catch (error) {
      console.error("❌ Error en cron job de cleanup:", error.message);
    }
  });

  // Job 2: Cleanup de juegos en espera obsoletos (cada 30 minutos)
  cron.schedule("*/30 * * * *", async () => {
    try {
      console.log("🧹 Ejecutando cleanup de juegos en espera obsoletos...");
      const deleted = await cleanupStaleWaitingGames();
      
      if (deleted > 0) {
        console.log(`✅ Eliminados ${deleted} juegos obsoletos`);
      }
    } catch (error) {
      console.error(
        "❌ Error en cron job de cleanup de espera:",
        error.message
      );
    }
  });

  console.log("⏰ Cron jobs de limpieza configurados:");
  console.log("   - Cleanup de juegos abandonados: cada 5 minutos");
  console.log("   - Cleanup de juegos en espera: cada 30 minutos");
}