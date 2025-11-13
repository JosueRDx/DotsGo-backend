/**
 * Sistema de logging condicional para el backend
 * Solo registra logs en desarrollo para evitar degradación de rendimiento en producción
 * y prevenir exposición de información sensible
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Logger condicional que solo imprime en desarrollo
 */
const logger = {
  /**
   * Log de información general (desarrollo)
   * @param {...any} args - Argumentos a loguear
   */
  info: (...args) => {
    if (isDevelopment) {
      console.log('ℹ️', ...args);
    }
  },

  /**
   * Log de advertencias (siempre se registra)
   * @param {...any} args - Argumentos a loguear
   */
  warn: (...args) => {
    console.warn('⚠️', ...args);
  },

  /**
   * Log de errores (siempre se registra)
   * @param {...any} args - Argumentos a loguear
   */
  error: (...args) => {
    console.error('❌', ...args);
  },

  /**
   * Log de debug detallado (solo desarrollo)
   * @param {...any} args - Argumentos a loguear
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.log('🔍', ...args);
    }
  },

  /**
   * Log de éxito/operación completada (solo desarrollo)
   * @param {...any} args - Argumentos a loguear
   */
  success: (...args) => {
    if (isDevelopment) {
      console.log('✅', ...args);
    }
  },

  /**
   * Log de inicio de operación (solo desarrollo)
   * @param {...any} args - Argumentos a loguear
   */
  start: (...args) => {
    if (isDevelopment) {
      console.log('🚀', ...args);
    }
  },

  /**
   * Log de finalización (solo desarrollo)
   * @param {...any} args - Argumentos a loguear
   */
  end: (...args) => {
    if (isDevelopment) {
      console.log('🏁', ...args);
    }
  }
};

module.exports = logger;
