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

// Conectar a base de datos e iniciar servidor
connectDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
}).catch((error) => {
  console.error("Error al iniciar el servidor:", error);
  process.exit(1);
});