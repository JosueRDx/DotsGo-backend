const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const { validatePin } = require('../utils/validation');

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
    
    // Validar formato del PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.valid) {
      return res.status(400).json({ 
        error: pinValidation.error 
      });
    }
    
    const game = await Game.findOne({ pin: pinValidation.sanitized }).populate('questions');
    
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