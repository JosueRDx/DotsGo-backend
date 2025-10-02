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
      pointsAwarded: Number
    }
  ]
});

const gameSchema = new mongoose.Schema({
  pin: {
    type: String,
    unique: true
  },
  status: {
    type: String,
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting'
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
  }
});

const Game = mongoose.model('Game', gameSchema);
module.exports = Game;