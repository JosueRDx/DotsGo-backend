const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');

/**
 * GET /api/questions
 * Obtiene todas las preguntas disponibles
 */
router.get('/', questionController.getAllQuestions);

/**
 * GET /api/questions/debug-game/:pin
 * Debug: Obtiene información del juego por PIN
 * NOTA: Este endpoint solo debe estar disponible en desarrollo
 */
router.get('/debug-game/:pin', async (req, res) => {
  try {
    // Deshabilitar en producción
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ 
        error: 'Endpoint no disponible en producción' 
      });
    }

    const Game = require('../models/game.model');
    const { pin } = req.params;
    
    const game = await Game.findOne({ pin }).populate('questions');
    
    if (!game) {
      return res.status(404).json({ error: 'Juego no encontrado' });
    }
    
    res.json({
      pin: game.pin,
      status: game.status,
      playersCount: game.players.length,
      players: game.players.map(p => ({
        id: p.id,
        username: p.username,
        character: p.character?.name || 'Sin personaje'
      })),
      questionsCount: game.questions.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;