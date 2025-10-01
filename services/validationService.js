const MIN_TIMEOUT_POINTS = 10;

/**
 * Valida si una respuesta del jugador es correcta comparando con la respuesta esperada
 * @param {Object} answer - Respuesta del jugador {pictogram, colors, number}
 * @param {Object} correctAnswer - Respuesta correcta {pictogram, colors, number}
 * @returns {boolean} true si la respuesta es correcta
 */
const isAnswerCorrect = (answer, correctAnswer) => {
  if (!answer) return false;

  // Validar pictograma
  const ansPictogram = String(answer.pictogram || '').toLowerCase().trim();
  const correctPictogram = String(correctAnswer.pictogram || '').toLowerCase().trim();
  if (ansPictogram !== correctPictogram) return false;

  // Validar número
  const ansNumber = String(answer.number ?? '').trim();
  const correctNumber = String(correctAnswer.number ?? '').trim();
  if (ansNumber !== correctNumber) return false;

  // Validar colores (orden independiente)
  const ansColors = Array.isArray(answer.colors)
    ? answer.colors.map(c => c.toLowerCase()).sort()
    : [];
  const correctColors = Array.isArray(correctAnswer.colors)
    ? correctAnswer.colors.map(c => c.toLowerCase()).sort()
    : [];

  return JSON.stringify(ansColors) === JSON.stringify(correctColors);
};

/**
 * Calcula los puntos obtenidos basándose en el tiempo de respuesta
 * @param {number} responseTime - Tiempo que tardó el jugador en responder (segundos)
 * @param {number} timeLimit - Tiempo límite de la pregunta (milisegundos)
 * @returns {number} Puntos obtenidos (mínimo MIN_TIMEOUT_POINTS, máximo 100)
 */
const calculatePoints = (responseTime, timeLimit) => {
  const timeLimitInSeconds = timeLimit / 1000;
  const timeFactor = Math.max(0, (timeLimitInSeconds - responseTime) / timeLimitInSeconds);
  return Math.max(MIN_TIMEOUT_POINTS, Math.floor(100 * timeFactor));
};

module.exports = {
  MIN_TIMEOUT_POINTS,
  isAnswerCorrect,
  calculatePoints
};