const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  id: String, // Socket ID actual
  socketId: String, // 🔑 Socket ID único por pestaña/conexión
  username: String,
  score: {
    type: Number,
    default: 0
  },
  totalResponseTime: {
    type: Number,
    default: 0
  },
  correctAnswers: {
    type: Number,
    default: 0
  },
  // Estado de conexión
  isConnected: {
    type: Boolean,
    default: true
  },
  disconnectedAt: {
    type: Date,
    default: null
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  },
  // NUEVO: Agregar información del personaje
  character: {
    id: Number,
    name: String,
    image: String,
    specialty: String
  },
  // NUEVO: Orden aleatorio de preguntas para cada jugador
  questionOrder: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    }
  ],
  // Índice de la pregunta actual para este jugador
  currentQuestionIndex: {
    type: Number,
    default: 0
  },
  // NUEVO: Propiedades específicas de modos de juego
  lives: {
    type: Number,
    default: 3 // Para modo Aventura
  },
  position: {
    type: Number,
    default: 0 // Para modo Duelo (posición en la montaña/pista)
  },
  isEliminated: {
    type: Boolean,
    default: false // Para saber si el jugador fue eliminado
  },
  eliminatedAt: {
    type: Date,
    default: null // Cuándo fue eliminado
  },
  // NUEVO: Contador de salidas/desconexiones
  exitCount: {
    type: Number,
    default: 0 // Cuántas veces ha salido del juego
  },
  answers: [
    {
      questionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question'
      },
      givenAnswer: {
        pictogram: String,
        colors: [String],
        number: Number
      },
      isCorrect: Boolean,
      pointsAwarded: Number,
      responseTime: Number
    }
  ]
});

const gameSchema = new mongoose.Schema({
  pin: {
    type: String,
    unique: true
  },
  questionStartTime: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting'
  },
  // NUEVO: Modo de juego
  gameMode: {
    type: String,
    enum: ['classic', 'adventure', 'duel'],
    default: 'classic'
  },
  // NUEVO: Configuración específica del modo
  modeConfig: {
    maxLives: {
      type: Number,
      default: 3 // Para modo Aventura
    },
    maxPlayers: {
      type: Number,
      default: 50 // Para modo Clásico
    },
    duelPlayers: {
      type: Number,
      default: 2 // Para modo Duelo
    },
    winCondition: {
      type: String,
      enum: ['all_questions', 'last_standing', 'first_to_finish'],
      default: 'all_questions'
    }
  },
  players: [playerSchema],
  currentQuestion: {
    type: Number,
    default: -1
  },
  questions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    }
  ],
  timeLimitPerQuestion: {
    type: Number,
    required: true
  },
  // NUEVO: Información del ganador para modos especiales
  winner: {
    playerId: String,
    username: String,
    winType: String, // 'survival', 'race', 'points'
    winTime: Date
  }
});

const Game = mongoose.model('Game', gameSchema);
module.exports = Game;