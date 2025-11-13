/**
 * Sistema Anti-Multicuentas
 * Previene que un usuario cree múltiples cuentas desde el mismo navegador/IP
 */

// Almacén de fingerprints por juego
// Estructura: { pin: { fingerprint: { username, socketId, timestamp } } }
const gameFingerprints = new Map();

// Almacén de IPs por juego
// Estructura: { pin: { ip: [{ username, socketId, timestamp }] } }
const gameIPs = new Map();

// Configuración
const MAX_ACCOUNTS_PER_IP = 2; // Máximo 2 cuentas por IP (para permitir 2 jugadores en misma red)
const MAX_ACCOUNTS_PER_FINGERPRINT = 1; // Máximo 1 cuenta por navegador
const FINGERPRINT_EXPIRY = 30 * 60 * 1000; // 30 minutos

/**
 * Genera un fingerprint del cliente basado en headers
 * @param {Object} socket - Socket del cliente
 * @returns {string} Fingerprint único
 */
const generateClientFingerprint = (socket) => {
  const handshake = socket.handshake;
  
  // Combinar múltiples factores para crear fingerprint
  const factors = [
    handshake.headers['user-agent'] || '',
    handshake.headers['accept-language'] || '',
    handshake.headers['accept-encoding'] || '',
    handshake.address || '',
  ];
  
  return Buffer.from(factors.join('|')).toString('base64');
};

/**
 * Obtiene la IP real del cliente (considerando proxies)
 * @param {Object} socket - Socket del cliente
 * @returns {string} IP del cliente
 */
const getClientIP = (socket) => {
  const handshake = socket.handshake;
  
  // Intentar obtener IP real considerando proxies
  return (
    handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    handshake.headers['x-real-ip'] ||
    handshake.address ||
    'unknown'
  );
};

/**
 * Verifica si un cliente puede unirse al juego
 * @param {string} pin - PIN del juego
 * @param {string} username - Nombre del usuario
 * @param {Object} socket - Socket del cliente
 * @returns {Object} { allowed: boolean, reason: string }
 */
const canJoinGame = (pin, username, socket) => {
  const fingerprint = generateClientFingerprint(socket);
  const ip = getClientIP(socket);
  
  // Inicializar estructuras si no existen
  if (!gameFingerprints.has(pin)) {
    gameFingerprints.set(pin, new Map());
  }
  if (!gameIPs.has(pin)) {
    gameIPs.set(pin, new Map());
  }
  
  const pinFingerprints = gameFingerprints.get(pin);
  const pinIPs = gameIPs.get(pin);
  
  // Limpiar entradas expiradas
  cleanExpiredEntries(pinFingerprints);
  cleanExpiredEntries(pinIPs);
  
  // Verificar fingerprint (mismo navegador)
  if (pinFingerprints.has(fingerprint)) {
    const existing = pinFingerprints.get(fingerprint);
    
    // IMPORTANTE: Permitir reconexión si es el mismo usuario
    // (sin importar si el socket es diferente)
    if (existing.username === username) {
      console.log(`✅ Reconexión permitida para ${username} (mismo usuario, mismo fingerprint)`);
      return { allowed: true, reason: 'reconnection' };
    }
    
    // Bloquear solo si es diferente username
    console.log(`🚫 Multicuenta bloqueada - Fingerprint: ${fingerprint.substring(0, 20)}...`);
    console.log(`   Usuario existente: ${existing.username}, Intento: ${username}`);
    return {
      allowed: false,
      reason: 'Ya tienes una cuenta activa en este juego. Cierra la otra pestaña primero.',
      code: 'DUPLICATE_BROWSER',
      existingUser: existing.username
    };
  }
  
  // Verificar IP (múltiples dispositivos en misma red)
  const ipAccounts = pinIPs.get(ip) || [];
  const activeIPAccounts = ipAccounts.filter(acc => 
    Date.now() - acc.timestamp < FINGERPRINT_EXPIRY
  );
  
  // Permitir si es el mismo usuario desde otra IP
  const sameUserDifferentIP = activeIPAccounts.find(acc => acc.username === username);
  if (sameUserDifferentIP) {
    return { allowed: true, reason: 'same_user_different_device' };
  }
  
  // Verificar límite de cuentas por IP
  if (activeIPAccounts.length >= MAX_ACCOUNTS_PER_IP) {
    return {
      allowed: false,
      reason: `Máximo ${MAX_ACCOUNTS_PER_IP} jugadores permitidos desde la misma red.`,
      code: 'IP_LIMIT_REACHED'
    };
  }
  
  return { allowed: true, reason: 'new_player' };
};

/**
 * Registra un jugador en el sistema anti-multicuentas
 * @param {string} pin - PIN del juego
 * @param {string} username - Nombre del usuario
 * @param {Object} socket - Socket del cliente
 */
const registerPlayer = (pin, username, socket) => {
  const fingerprint = generateClientFingerprint(socket);
  const ip = getClientIP(socket);
  
  if (!gameFingerprints.has(pin)) {
    gameFingerprints.set(pin, new Map());
  }
  if (!gameIPs.has(pin)) {
    gameIPs.set(pin, new Map());
  }
  
  const pinFingerprints = gameFingerprints.get(pin);
  const pinIPs = gameIPs.get(pin);
  
  // Registrar fingerprint
  pinFingerprints.set(fingerprint, {
    username,
    socketId: socket.id,
    timestamp: Date.now()
  });
  
  // Registrar IP
  if (!pinIPs.has(ip)) {
    pinIPs.set(ip, []);
  }
  pinIPs.get(ip).push({
    username,
    socketId: socket.id,
    fingerprint,
    timestamp: Date.now()
  });
  
  console.log(`🔒 Jugador registrado - PIN: ${pin}, User: ${username}, IP: ${ip}`);
};

/**
 * Elimina un jugador del sistema anti-multicuentas
 * IMPORTANTE: Solo desregistrar en desconexión real, NO en salida voluntaria
 * @param {string} pin - PIN del juego
 * @param {string} username - Nombre del usuario
 * @param {Object} socket - Socket del cliente
 * @param {boolean} isDisconnect - True si es desconexión, false si es salida voluntaria
 */
const unregisterPlayer = (pin, username, socket, isDisconnect = false) => {
  const fingerprint = generateClientFingerprint(socket);
  const ip = getClientIP(socket);
  
  // NUEVO: Si es salida voluntaria (leave-game), NO desregistrar inmediatamente
  // Mantener el registro por 5 minutos para prevenir multicuentas
  if (!isDisconnect) {
    console.log(`⏳ Salida voluntaria de ${username} - Manteniendo registro por 5 minutos`);
    
    // Programar desregistro después de 5 minutos
    setTimeout(() => {
      if (gameFingerprints.has(pin)) {
        const pinFingerprints = gameFingerprints.get(pin);
        if (pinFingerprints.has(fingerprint)) {
          const existing = pinFingerprints.get(fingerprint);
          if (existing.username === username) {
            pinFingerprints.delete(fingerprint);
            console.log(`🔓 Registro expirado para ${username} después de 5 minutos`);
          }
        }
      }
    }, 5 * 60 * 1000); // 5 minutos
    
    return;
  }
  
  // Solo desregistrar inmediatamente en desconexión real
  if (gameFingerprints.has(pin)) {
    const pinFingerprints = gameFingerprints.get(pin);
    
    // Eliminar por fingerprint
    if (pinFingerprints.has(fingerprint)) {
      const existing = pinFingerprints.get(fingerprint);
      if (existing.username === username) {
        pinFingerprints.delete(fingerprint);
      }
    }
  }
  
  if (gameIPs.has(pin)) {
    const pinIPs = gameIPs.get(pin);
    
    // Eliminar de IP
    if (pinIPs.has(ip)) {
      const ipAccounts = pinIPs.get(ip);
      const filtered = ipAccounts.filter(acc => 
        acc.username !== username || acc.socketId !== socket.id
      );
      
      if (filtered.length === 0) {
        pinIPs.delete(ip);
      } else {
        pinIPs.set(ip, filtered);
      }
    }
  }
  
  console.log(`🔓 Jugador desregistrado - PIN: ${pin}, User: ${username}`);
};

/**
 * Limpia todas las entradas de un juego
 * @param {string} pin - PIN del juego
 */
const cleanupGame = (pin) => {
  gameFingerprints.delete(pin);
  gameIPs.delete(pin);
  console.log(`🧹 Limpieza completa del juego ${pin}`);
};

/**
 * Limpia entradas expiradas de un Map
 * @param {Map} map - Map a limpiar
 */
const cleanExpiredEntries = (map) => {
  const now = Date.now();
  
  for (const [key, value] of map.entries()) {
    if (Array.isArray(value)) {
      // Para arrays (IPs)
      const filtered = value.filter(item => 
        now - item.timestamp < FINGERPRINT_EXPIRY
      );
      
      if (filtered.length === 0) {
        map.delete(key);
      } else {
        map.set(key, filtered);
      }
    } else {
      // Para objetos (fingerprints)
      if (now - value.timestamp > FINGERPRINT_EXPIRY) {
        map.delete(key);
      }
    }
  }
};

/**
 * Obtiene estadísticas de un juego
 * @param {string} pin - PIN del juego
 * @returns {Object} Estadísticas
 */
const getGameStats = (pin) => {
  const fingerprints = gameFingerprints.get(pin) || new Map();
  const ips = gameIPs.get(pin) || new Map();
  
  return {
    uniqueBrowsers: fingerprints.size,
    uniqueIPs: ips.size,
    totalAccounts: Array.from(ips.values()).reduce((sum, arr) => sum + arr.length, 0)
  };
};

module.exports = {
  canJoinGame,
  registerPlayer,
  unregisterPlayer,
  cleanupGame,
  getGameStats,
  getClientIP,
  generateClientFingerprint
};
