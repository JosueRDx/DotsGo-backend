/**
 * Aleatoriza un array usando el algoritmo Fisher-Yates con semilla mejorada
 * @param {Array} array - Array a aleatorizar
 * @returns {Array} Nuevo array aleatorizado
 */
const shuffleArray = (array) => {
  const shuffled = [...array]; // Copia para no mutar el original

  // Agregar entropía adicional usando timestamp y random
  const seed = Date.now() + Math.random() * 1000000;
  let entropy = seed;

  for (let i = shuffled.length - 1; i > 0; i--) {
    // Generar número pseudo-aleatorio con más entropía
    entropy = (entropy * 9301 + 49297) % 233280;
    const random = entropy / 233280;

    const j = Math.floor(random * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
};

module.exports = shuffleArray;