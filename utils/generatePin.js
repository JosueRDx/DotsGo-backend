/**
 * Genera un PIN aleatorio único de 6 caracteres alfanuméricos en mayúsculas
 * @returns {string} PIN generado (ej: "A3F9K2")
 */
const generatePin = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

module.exports = generatePin;