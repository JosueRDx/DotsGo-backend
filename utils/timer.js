/**
 * Almacena los timers de cada partida para poder cancelarlos
 * Key: PIN del juego
 * Value: Timer ID de setTimeout
 */
const questionTimers = new Map();

/**
 * Guarda un timer para un juego específico
 * @param {string} pin - PIN del juego
 * @param {NodeJS.Timeout} timer - ID del timer
 */
const setQuestionTimer = (pin, timer) => {
  questionTimers.set(pin, timer);
};

/**
 * Obtiene el timer de un juego específico
 * @param {string} pin - PIN del juego
 * @returns {NodeJS.Timeout|undefined} Timer ID o undefined
 */
const getQuestionTimer = (pin) => {
  return questionTimers.get(pin);
};

/**
 * Elimina el timer de un juego específico
 * @param {string} pin - PIN del juego
 * @returns {boolean} true si se eliminó, false si no existía
 */
const deleteQuestionTimer = (pin) => {
  return questionTimers.delete(pin);
};

/**
 * Cancela y elimina el timer de un juego
 * @param {string} pin - PIN del juego
 */
const clearQuestionTimer = (pin) => {
  const timer = questionTimers.get(pin);
  if (timer) {
    clearTimeout(timer);
    questionTimers.delete(pin);
  }
};

module.exports = {
  setQuestionTimer,
  getQuestionTimer,
  deleteQuestionTimer,
  clearQuestionTimer
};