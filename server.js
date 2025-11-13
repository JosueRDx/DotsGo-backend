const express = require("express");
const http = require("http");
const dotenv = require("dotenv");

// Cargar variables de entorno
dotenv.config();

// Importar configuraciones
const connectDatabase = require("./config/database");
const { setupCors } = require("./config/cors");
const setupSocketIO = require("./config/socket");
const setupSocketHandlers = require("./socket");

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
  });
}).catch((error) => {
  console.error("❌ Error al iniciar el servidor:", error);
  process.exit(1);
});