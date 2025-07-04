const express = require("express");
const app = express();
const http = require("http").createServer(app);
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();


const allowedOrigins = [
  'http://localhost:5173',
  'https://dotsgo-frontend.onrender.com'
];

// Configuracion de CORS a Express y a Socket.IO
const corsOptions = {
  origin: allowedOrigins
};
app.use(cors(corsOptions));

const io = require("socket.io")(http, {
  cors: {
   origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
});
const mongoose = require("mongoose");
const { Question, seedQuestions } = require("./models/question.model");
const Game = require("./models/game.model");
const questionController = require('./controllers/questionController');

app.use(cors());

app.use(express.json());
// app.use(express.static('dist'));

app.get('/api/questions', questionController.getAllQuestions);

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Conectado a MongoDB");
    seedQuestions();
  })
  .catch((err) => console.error("Error conectando a MongoDB:", err));

const generatePin = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Almacenar los timers de cada partida para poder cancelarlos
const questionTimers = new Map();

const MIN_TIMEOUT_POINTS = 10;

const isAnswerCorrect = (answer, correctAnswer) => {
  if (!answer) return false;

  const ansPictogram = String(answer.pictogram || '').toLowerCase().trim();
  const correctPictogram = String(correctAnswer.pictogram || '').toLowerCase().trim();
  if (ansPictogram !== correctPictogram) return false;

  const ansNumber = String(answer.number ?? '').trim();
  const correctNumber = String(correctAnswer.number ?? '').trim();
  if (ansNumber !== correctNumber) return false;

  const ansColors = Array.isArray(answer.colors)
    ? answer.colors.map(c => c.toLowerCase()).sort()
    : [];
  const correctColors = Array.isArray(correctAnswer.colors)
    ? correctAnswer.colors.map(c => c.toLowerCase()).sort()
    : [];

  return JSON.stringify(ansColors) === JSON.stringify(correctColors);
};

const registerTimeoutAnswer = async (gameId, playerId) => {
  try {
    const game = await Game.findById(gameId).populate("questions");
    if (!game) return;
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    const question = game.questions[game.currentQuestion];
    const currentQuestionId = question._id.toString();

    let existing = player.answers.find(a => a.questionId.toString() === currentQuestionId);

    if (existing) {
      if (
        !existing.isCorrect &&
        existing.pointsAwarded === 0 &&
        existing.givenAnswer &&
        existing.givenAnswer.pictogram
      ) {
        if (isAnswerCorrect(existing.givenAnswer, question.correctAnswer)) {
          existing.isCorrect = true;
          existing.pointsAwarded = MIN_TIMEOUT_POINTS;
          player.score += MIN_TIMEOUT_POINTS;
          player.correctAnswers += 1;
        }
      }
    } else {
      player.answers.push({
        questionId: currentQuestionId,
        givenAnswer: { pictogram: "", colors: [], number: "" },
        isCorrect: false,
        pointsAwarded: 0,
      });
      existing = player.answers[player.answers.length - 1];
    }

    await game.save();

    io.to(game.pin).emit("player-answered", {
      playerId: player.id,
      isCorrect: existing.isCorrect,
      pointsAwarded: existing.pointsAwarded,
      playerScore: player.score,
    });
  } catch (error) {
    console.error("Error al registrar timeout:", error);
  }
};

const processTimeouts = async (game) => {
  const currentPlayers = game.players.map(p => p.id);
  for (const playerId of currentPlayers) {
    await registerTimeoutAnswer(game._id, playerId);
  }
};

// Verificar si todos los jugadores respondieron la pregunta actual
const haveAllPlayersAnswered = (game) => {
  if (game.currentQuestion < 0 || game.currentQuestion >= game.questions.length) {
    return false;
  }
  const currentQuestionId = game.questions[game.currentQuestion]._id.toString();
  return game.players.every(player =>
    player.answers.some(a => a.questionId.toString() === currentQuestionId)
  );
};

// Definir emitQuestion como una función independiente
const emitQuestion = async (game, questionIndex) => {
  if (questionIndex >= game.questions.length) {
    setTimeout(() => endGame(game, game.pin), 1000);
    return;
  }

  const question = game.questions[questionIndex];
  await Game.findByIdAndUpdate(
    game._id,
    { $set: { questionStartTime: Date.now() } }
  );

  io.to(game.pin).emit("game-started", {
    question: question,
    timeLimit: game.timeLimitPerQuestion / 1000,
    currentIndex: questionIndex + 1,
    totalQuestions: game.questions.length,
  });

  const timer = setTimeout(async () => {
    const updatedGame = await Game.findById(game._id).populate("questions");
    if (updatedGame && updatedGame.status === "playing") {
      await processTimeouts(updatedGame); // Procesar timeouts
      const nextGame = await Game.findByIdAndUpdate(
        updatedGame._id,
        { $inc: { currentQuestion: 1 }, $set: { questionStartTime: Date.now() } },
        { new: true }
      ).populate("questions");
      emitQuestion(nextGame, nextGame.currentQuestion); // Llamada recursiva
    }
    questionTimers.delete(game.pin);
  }, game.timeLimitPerQuestion);
  questionTimers.set(game.pin, timer);
};

io.on("connection", (socket) => {
  console.log("Socket conectado:", socket.id);

  socket.on("create-game", async (gameData, callback) => {
    try {
      const { timeLimit, questionIds } = gameData;
      const pin = generatePin();
      const questions = await Question.find({ '_id': { $in: questionIds } });

      const game = new Game({
        pin,
        timeLimitPerQuestion: timeLimit * 1000,
        hostId: socket.id,
        questions: questions.map(q => q._id),
        status: "waiting",
      });

      await game.save();
      socket.join(pin);

      callback({ success: true, pin });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on("join-game", async ({ pin, username, character }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.status === "playing") {
        const currentQuestion = game.questions[game.currentQuestion];
        const timeElapsed = Date.now() - game.questionStartTime;
        const timeRemaining = Math.max(0, Math.floor((game.timeLimitPerQuestion - timeElapsed) / 1000));

        socket.emit("game-started", {
          question: currentQuestion,
          timeLimit: timeRemaining,
          currentIndex: game.currentQuestion + 1,
          totalQuestions: game.questions.length,
        });
      }
      if (game.status === "waiting") {
        // MODIFICADO: Incluir información del personaje
        const playerData = {
          id: socket.id,
          username,
          score: 0,
          correctAnswers: 0,
          answers: [],
          character: character || null
        };

        game.players.push(playerData);
        await game.save();
        socket.join(pin);

        // CORREGIDO: Usar game.questions.length en lugar de valor hardcodeado
        io.to(pin).emit("player-joined", {
          players: game.players,
          gameInfo: {
            pin: game.pin,
            questionsCount: game.questions.length, // CORREGIDO: Conteo real de preguntas
            maxPlayers: 50,
            status: game.status,
            timeLimitPerQuestion: game.timeLimitPerQuestion / 1000
          }
        });

        // Emitir evento separado para actualizar lista
        io.to(pin).emit("players-updated", {
          players: game.players
        });

        console.log(`Jugador conectado: ${username} con personaje: ${character?.name || "Sin personaje"} - Juego tiene ${game.questions.length} preguntas`);
      }

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on("start-game", async ({ pin }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }

      if (game.status !== "waiting") {
        return callback({ success: false, error: "El juego ya ha comenzado" });
      }

      game.status = "playing";
      game.currentQuestion = 0;
      game.questionStartTime = Date.now();
      await game.save();

      // NUEVO: Emitir countdown antes de iniciar
      io.to(pin).emit("game-starting", {
        countdown: 5,
        message: "¡El juego comenzará en breve!"
      });

      // MODIFICADO: Esperar 5 segundos y luego iniciar
      setTimeout(() => {
        emitQuestion(game, game.currentQuestion);
      }, 5000);

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on("submit-answer", async ({ pin, answer, responseTime, questionId }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({ success: false, error: "Juego no encontrado" });
      }
      if (game.status !== "playing") {
        return callback({ success: false, error: "Juego no válido" });
      }

      // Determinar la pregunta asociada a la respuesta
      let questionIndex = game.questions.findIndex(q => q._id.toString() === (questionId || "").toString());
      if (questionIndex === -1) {
        questionIndex = game.currentQuestion;
      }

      const currentQuestion = game.questions[questionIndex];
      const player = game.players.find(p => p.id === socket.id);

      if (!player) {
        return callback({ success: false, error: "Jugador no encontrado" });
      }

      console.log("=== VALIDACIÓN DE RESPUESTA ===");
      console.log("Jugador:", player.username);
      console.log("Pregunta:", currentQuestion.title);
      console.log("Respuesta recibida:", JSON.stringify(answer, null, 2));
      console.log("Respuesta correcta:", JSON.stringify(currentQuestion.correctAnswer, null, 2));

      // Verificar si la respuesta está vacía
      const isEmptyAnswer = !answer.pictogram &&
        (!answer.colors || answer.colors.length === 0) &&
        !answer.number;

      let isCorrect = false;

      if (!isEmptyAnswer) {
        isCorrect = isAnswerCorrect(answer, currentQuestion.correctAnswer);
        console.log(`Validación automática -> ${isCorrect ? 'CORRECTA' : 'INCORRECTA'}`);
      } else {
        console.log("❌ Respuesta vacía");
      }

      // Calcular puntos
      let pointsAwarded = 0;
      if (isCorrect) {
        const timeFactor = Math.max(0, (game.timeLimitPerQuestion / 1000 - (responseTime || 0)) / (game.timeLimitPerQuestion / 1000));
        pointsAwarded = Math.max(MIN_TIMEOUT_POINTS, Math.floor(100 * timeFactor));

        console.log(`✅ RESPUESTA CORRECTA - Puntos: ${pointsAwarded}`);
      } else {
        console.log(`❌ RESPUESTA INCORRECTA - Puntos: 0`);
      }

      // Guardar respuesta o actualizar la existente (por timeout previo)
      const existing = player.answers.find(a => a.questionId.toString() === currentQuestion._id.toString());
      if (existing) {
        if (!existing.isCorrect && existing.pointsAwarded === 0) {
          existing.givenAnswer = answer;
          existing.isCorrect = isCorrect;
          existing.pointsAwarded = pointsAwarded;
          if (isCorrect) {
            player.score += pointsAwarded;
            player.correctAnswers += 1;
          }
        } else {
          return callback({ success: false, error: "Respuesta ya registrada" });
        }
      } else {
        player.answers.push({
          questionId: currentQuestion._id,
          givenAnswer: answer,
          isCorrect,
          pointsAwarded,
        });
        if (isCorrect) {
          player.score += pointsAwarded;
          player.correctAnswers += 1;
        }
      }

      await game.save();

      console.log(`Jugador ${player.username} - Correcta: ${isCorrect} - Puntos: ${pointsAwarded} - Total: ${player.score}`);
      console.log("=================================");

      callback({ success: true, isCorrect, pointsAwarded });

      io.to(pin).emit("player-answered", {
        playerId: socket.id,
        isCorrect,
        pointsAwarded,
        playerScore: player.score,
      });
      // Si todos han respondidoa pasa a la siguiente 
      if (questionIndex === game.currentQuestion && haveAllPlayersAnswered(game)) {
        const timer = questionTimers.get(pin);
        if (timer) {
          clearTimeout(timer);
          questionTimers.delete(pin);
        }
        game.currentQuestion += 1;
        await game.save();
        emitQuestion(game, game.currentQuestion);
      }
    } catch (error) {
      console.error("Error en submit-answer:", error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on("disconnect", async () => {
    try {
      const game = await Game.findOne({ "players.id": socket.id });

      if (game) {
        const player = game.players.find(p => p.id === socket.id);
        const playerName = player ? player.username : 'Jugador desconocido';

        game.players = game.players.filter(p => p.id !== socket.id);
        await game.save();

        io.to(game.pin).emit("player-left", {
          playerId: socket.id,
          players: game.players,
        });

        // NUEVO: Emitir evento adicional para actualizar lista
        io.to(game.pin).emit("players-updated", {
          players: game.players
        });

        console.log(`Jugador ${playerName} se desconectó del juego ${game.pin}`);
      }
    } catch (error) {
      console.error("Error en disconnect:", error);
    }
  });

  // NUEVO: Evento para obtener información de la sala
  socket.on("get-room-players", async ({ pin }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({
          success: false,
          error: "Juego no encontrado"
        });
      }

      console.log(`get-room-players: PIN ${pin} tiene ${game.questions.length} preguntas`);

      callback({
        success: true,
        players: game.players,
        gameInfo: {
          pin: game.pin,
          questionsCount: game.questions.length, // CORREGIDO: Conteo real
          maxPlayers: 50,
          status: game.status,
          timeLimitPerQuestion: game.timeLimitPerQuestion / 1000
        }
      });
    } catch (error) {
      console.error("Error en get-room-players:", error);
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // NUEVO: Evento para que jugadores salgan del juego
  socket.on("leave-game", async ({ pin, username }) => {
    try {
      const game = await Game.findOne({ pin });

      if (game) {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          game.players.splice(playerIndex, 1);
          await game.save();

          socket.leave(pin);

          // Notificar a otros jugadores
          io.to(pin).emit("player-left", {
            playerId: socket.id,
            players: game.players,
          });

          io.to(pin).emit("players-updated", {
            players: game.players
          });

          console.log(`Jugador ${username} salió del juego ${pin}`);
        }
      }
    } catch (error) {
      console.error("Error en leave-game:", error);
    }
  });

  // SOLO AGREGANDO ESTE EVENTO SIN TOCAR NADA MÁS
  socket.on("get-current-question", async ({ pin }, callback) => {
    try {
      const game = await Game.findOne({ pin }).populate("questions");

      if (!game) {
        return callback({
          success: false,
          error: "Juego no encontrado"
        });
      }

      if (game.status !== "playing") {
        return callback({
          success: false,
          error: "El juego no está activo"
        });
      }

      // Si hay una pregunta actual activa
      if (game.currentQuestion >= 0 && game.currentQuestion < game.questions.length) {
        const currentQuestion = game.questions[game.currentQuestion];
        const timeElapsed = Date.now() - (game.questionStartTime || Date.now());
        const timeRemaining = Math.max(0, Math.floor((game.timeLimitPerQuestion - timeElapsed) / 1000));

        if (timeRemaining > 0) {
          return callback({
            success: true,
            question: currentQuestion,
            timeLeft: timeRemaining,
            currentIndex: game.currentQuestion + 1,
            totalQuestions: game.questions.length
          });
        }
      }

      return callback({
        success: true,
        question: null,
        timeLeft: 0,
        currentIndex: 0,
        totalQuestions: game.questions.length
      });
    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

});

const endGame = async (game, pin) => {
  game.status = "finished";
  await game.save();

  const updatedGame = await Game.findById(game._id);
  const totalQuestions = updatedGame.questions.length;

  // MODIFICADO: Incluir información del personaje en los resultados
  const results = updatedGame.players.map(player => ({
    username: player.username,
    score: player.score || 0,
    correctAnswers: player.correctAnswers || 0,
    totalQuestions,
    character: player.character || null // NUEVO: Incluir personaje
  }));

  console.log("Resultados finales enviados desde el backend:", results);
  io.to(pin).emit("game-ended", { results });
};

const PORT = process.env.PORT || 5000;
http.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});