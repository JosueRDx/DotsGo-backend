const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');

/**
 * GET /api/questions
 * Obtiene todas las preguntas disponibles
 */
router.get('/', questionController.getAllQuestions);

module.exports = router;