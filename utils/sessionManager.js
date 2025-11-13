const crypto = require('crypto');

/**
 * Genera un ID de sesión único
 * @returns {string} Session ID
 */
const generateSessionId = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Tiempo de gracia para reconexión (3 minutos)
 */
const RECONNECTION_GRACE_PERIOD = 3 * 60 * 1000; // 3 minutos en milisegundos

/**
 * Mapa de timers de limpieza por jugador
 * Estructura: { sessionId: timeoutId }
 */
const cleanupTimers = new Map();

/**
 * Programa la limpieza de un jugador desconectado después del período de gracia
 * @param {string} sessionId - ID de sesión del jugador
 * @param {string} pin - PIN del juego
 * @param {Function} cleanupCallback - Función a ejecutar si no se reconecta
 */
const schedulePlayerCleanup = (sessionId, pin, cleanupCallback) => {
  // Cancelar timer existente si hay uno
  if (cleanupTimers.has(sessionId)) {
    clearTimeout(cleanupTimers.get(sessionId));
  }

  // Programar nueva limpieza
  const timerId = setTimeout(() => {
    console.log(`⏰ Período de gracia expirado para sesión ${sessionId} en juego ${pin}`);
    cleanupCallback();
    cleanupTimers.delete(sessionId);
  }, RECONNECTION_GRACE_PERIOD);

  cleanupTimers.set(sessionId, timerId);
  console.log(`⏳ Período de gracia iniciado para sesión ${sessionId} (3 minutos)`);
};

/**
 * Cancela la limpieza programada de un jugador (cuando se reconecta)
 * @param {string} sessionId - ID de sesión del jugador
 */
const cancelPlayerCleanup = (sessionId) => {
  if (cleanupTimers.has(sessionId)) {
    clearTimeout(cleanupTimers.get(sessionId));
    cleanupTimers.delete(sessionId);
    console.log(`✅ Limpieza cancelada para sesión ${sessionId} (reconectado)`);
    return true;
  }
  return false;
};

/**
 * Verifica si un jugador está dentro del período de gracia
 * @param {Date} disconnectedAt - Fecha de desconexión
 * @returns {boolean} True si aún está en período de gracia
 */
const isWithinGracePeriod = (disconnectedAt) => {
  if (!disconnectedAt) return false;
  const elapsed = Date.now() - new Date(disconnectedAt).getTime();
  return elapsed < RECONNECTION_GRACE_PERIOD;
};

module.exports = {
  generateSessionId,
  schedulePlayerCleanup,
  cancelPlayerCleanup,
  isWithinGracePeriod,
  RECONNECTION_GRACE_PERIOD
};
