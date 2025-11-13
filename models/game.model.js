const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  id: String,
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

// ===== ÍNDICES PARA OPTIMIZACIÓN DE CONSULTAS =====
// Estos índices mejoran significativamente el rendimiento de las consultas más frecuentes

/**
 * Índice único en el campo 'pin'
 * Garantiza que cada juego tenga un PIN único y acelera búsquedas por PIN
 * Usado en: create-game, join-game, start-game, y todos los eventos de Socket.IO
 */
gameSchema.index({ pin: 1 }, { unique: true });

/**
 * Índice en el campo 'status'
 * Acelera consultas que filtran juegos por estado (waiting, playing, finished)
 * Útil para listar juegos activos o buscar juegos disponibles
 */
gameSchema.index({ status: 1 });

/**
 * Índice TTL (Time To Live) en 'createdAt'
 * Elimina automáticamente juegos después de 24 horas de su creación
 * Previene acumulación de datos antiguos y mantiene la base de datos limpia
 * MongoDB ejecuta esta limpieza en segundo plano cada 60 segundos
 */
gameSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24 horas = 86400 segundos

/**
 * Índice en 'players.id' para búsquedas de jugadores
 * Acelera consultas que buscan un jugador específico dentro de un juego
 * Usado en: submit-answer, disconnect, y validaciones de jugador
 */
gameSchema.index({ 'players.id': 1 });

/**
 * Índice compuesto para consultas de juegos activos con jugadores
 * Optimiza búsquedas que necesitan filtrar por estado y contar jugadores
 * Ejemplo: encontrar juegos en espera que tengan espacio disponible
 */
gameSchema.index({ status: 1, 'players.0': 1 });

const Game = mongoose.model('Game', gameSchema);
module.exports = Game;