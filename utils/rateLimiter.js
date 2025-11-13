/**
 * Middleware de rate limiting para Socket.IO
 * Protege contra spam y ataques de flood
 */

const logger = require("./logger");

// Map para almacenar contadores de eventos por socket
const eventCounts = new Map();

// Map para rastrear violaciones acumuladas por socket
const violationCounts = new Map();

// Configuración de umbrales para enforcement
const ENFORCEMENT_CONFIG = {
  warningThreshold: 3,        // Advertencias después de 3 violaciones
  temporaryBlockThreshold: 5, // Bloqueo temporal después de 5 violaciones
  disconnectThreshold: 10,    // Desconectar después de 10 violaciones
  blockDurationMs: 30000,     // Duración del bloqueo temporal: 30 segundos
  violationResetMs: 300000    // Resetear violaciones después de 5 minutos sin incidentes
};

// Configuración de límites por tipo de evento
const RATE_LIMITS = {
  // Eventos de creación/inicio 
  'create-game': { maxAttempts: 5, windowMs: 60000 },
  'start-game': { maxAttempts: 10, windowMs: 60000 },
  'create-tournament': { maxAttempts: 3, windowMs: 60000 }, 
  
  // Eventos de jugador 
  'join-game': { maxAttempts: 10, windowMs: 30000 }, 
  'submit-answer': { maxAttempts: 50, windowMs: 60000 }, 
  'leave-game': { maxAttempts: 10, windowMs: 30000 }, 
  
  // Eventos de consulta 
  'get-room-players': { maxAttempts: 30, windowMs: 60000 }, 
  'get-current-question': { maxAttempts: 30, windowMs: 60000 }, 
  'rejoin-host': { maxAttempts: 5, windowMs: 60000 }, 
  
  // Eventos de admin
  'kick-player': { maxAttempts: 20, windowMs: 60000 }, 
  
  // Default para eventos no especificados
  'default': { maxAttempts: 50, windowMs: 60000 }
};


/**
 * Obtiene o inicializa el contador de violaciones para un socket
 */
const getViolationCount = (socketId) => {
  if (!violationCounts.has(socketId)) {
    violationCounts.set(socketId, {
      count: 0,
      lastViolation: Date.now(),
      blockedUntil: null
    });
  }
  return violationCounts.get(socketId);
};

/**
 * Incrementa el contador de violaciones y aplica medidas correctivas
 * @returns {Object} Información sobre el enforcement aplicado
 */
const recordViolation = (socketId) => {
  const violation = getViolationCount(socketId);
  const now = Date.now();
  
  // Resetear violaciones si ha pasado suficiente tiempo sin incidentes
  if (now - violation.lastViolation > ENFORCEMENT_CONFIG.violationResetMs) {
    violation.count = 0;
  }
  
  violation.count++;
  violation.lastViolation = now;
  
  const enforcement = {
    action: 'none',
    violationCount: violation.count,
    shouldDisconnect: false,
    shouldBlock: false,
    blockDurationSec: 0,
    message: ''
  };
  
  // Nivel 1: Advertencia (3+ violaciones)
  if (violation.count >= ENFORCEMENT_CONFIG.warningThreshold && 
      violation.count < ENFORCEMENT_CONFIG.temporaryBlockThreshold) {
    enforcement.action = 'warning';
    enforcement.message = `⚠️ Advertencia: Has excedido los límites ${violation.count} veces. Modera tus acciones para evitar bloqueo temporal.`;
    logger.warn(`⚠️ Socket ${socketId} recibió advertencia (${violation.count} violaciones)`);
  }
  
  // Nivel 2: Bloqueo temporal (5+ violaciones)
  else if (violation.count >= ENFORCEMENT_CONFIG.temporaryBlockThreshold && 
           violation.count < ENFORCEMENT_CONFIG.disconnectThreshold) {
    enforcement.action = 'block';
    enforcement.shouldBlock = true;
    enforcement.blockDurationSec = ENFORCEMENT_CONFIG.blockDurationMs / 1000;
    violation.blockedUntil = now + ENFORCEMENT_CONFIG.blockDurationMs;
    enforcement.message = `🚫 Has sido bloqueado temporalmente por ${enforcement.blockDurationSec} segundos debido a múltiples violaciones de límites.`;
    logger.warn(`🚫 Socket ${socketId} bloqueado temporalmente (${violation.count} violaciones)`);
  }
  
  // Nivel 3: Desconexión (10+ violaciones)
  else if (violation.count >= ENFORCEMENT_CONFIG.disconnectThreshold) {
    enforcement.action = 'disconnect';
    enforcement.shouldDisconnect = true;
    enforcement.message = `❌ Has sido desconectado por violar repetidamente los límites de uso. Contacta al administrador si crees que esto es un error.`;
    logger.error(`❌ Socket ${socketId} será desconectado (${violation.count} violaciones)`);
  }
  
  return enforcement;
};

/**
 * Verifica si un socket está actualmente bloqueado
 */
const isSocketBlocked = (socketId) => {
  const violation = violationCounts.get(socketId);
  if (!violation || !violation.blockedUntil) return false;
  
  const now = Date.now();
  if (now < violation.blockedUntil) {
    const remainingSec = Math.ceil((violation.blockedUntil - now) / 1000);
    return {
      blocked: true,
      remainingSec,
      message: `🚫 Bloqueado temporalmente. Intenta de nuevo en ${remainingSec} segundos.`
    };
  }
  
  // El bloqueo ha expirado
  violation.blockedUntil = null;
  return { blocked: false };
};

// Obtiene la configuración de rate limit para un evento

const getRateLimit = (eventName) => {
  return RATE_LIMITS[eventName] || RATE_LIMITS.default;
};


// Obtiene o crea el registro de eventos para un socket

const getSocketEvents = (socketId) => {
  if (!eventCounts.has(socketId)) {
    eventCounts.set(socketId, new Map());
  }
  return eventCounts.get(socketId);
};


 // Limpia eventos antiguos fuera de la ventana de tiempo

const cleanOldTimestamps = (timestamps, windowMs) => {
  const now = Date.now();
  return timestamps.filter(time => now - time < windowMs);
};


 // Verifica si un socket ha excedido el rate limit para un evento

const checkRateLimit = (socketId, eventName) => {
  // Verificar primero si el socket está bloqueado
  const blockStatus = isSocketBlocked(socketId);
  if (blockStatus.blocked) {
    return {
      allowed: false,
      retryAfter: blockStatus.remainingSec,
      current: 0,
      max: 0,
      blocked: true,
      enforcement: {
        action: 'blocked',
        message: blockStatus.message
      }
    };
  }
  
  const { maxAttempts, windowMs } = getRateLimit(eventName);
  const socketEvents = getSocketEvents(socketId);
  
  // Obtener timestamps de intentos previos
  let timestamps = socketEvents.get(eventName) || [];
  
  // Limpiar timestamps antiguos
  timestamps = cleanOldTimestamps(timestamps, windowMs);
  
  // Verificar si se excedió el límite
  if (timestamps.length >= maxAttempts) {
    const oldestTimestamp = Math.min(...timestamps);
    const retryAfter = Math.ceil((windowMs - (Date.now() - oldestTimestamp)) / 1000);
    
    // Registrar violación y aplicar enforcement
    const enforcement = recordViolation(socketId);
    
    return {
      allowed: false,
      retryAfter,
      current: timestamps.length,
      max: maxAttempts,
      blocked: false,
      enforcement
    };
  }
  
  // Agregar nuevo timestamp
  timestamps.push(Date.now());
  socketEvents.set(eventName, timestamps);
  
  return {
    allowed: true,
    current: timestamps.length,
    max: maxAttempts,
    blocked: false
  };
};


 // Limpia los datos de rate limiting de un socket

const clearSocketData = (socketId) => {
  eventCounts.delete(socketId);
  violationCounts.delete(socketId); // NUEVO: Limpiar también violaciones
};


 // Middleware para aplicar rate limiting a eventos de Socket.IO

const rateLimitMiddleware = (socket, eventName) => {
  return (data, callback) => {
    const result = checkRateLimit(socket.id, eventName);
    
    if (!result.allowed) {
      // Manejar diferentes niveles de enforcement
      if (result.blocked) {
        // Socket bloqueado temporalmente
        logger.warn(`🚫 Socket ${socket.id} bloqueado intentó acceder a '${eventName}'`);
      } else if (result.enforcement) {
        // Violación de rate limit con enforcement
        logger.warn(`⚠️ Rate limit excedido para socket ${socket.id} en evento '${eventName}': ${result.current}/${result.max}`);
        
        // Emitir advertencia al cliente si corresponde
        if (result.enforcement.action === 'warning' || 
            result.enforcement.action === 'block') {
          socket.emit('rate-limit-warning', {
            message: result.enforcement.message,
            violationCount: result.enforcement.violationCount,
            action: result.enforcement.action
          });
        }
        
        // Desconectar si se alcanzó el umbral
        if (result.enforcement.shouldDisconnect) {
          socket.emit('rate-limit-disconnect', {
            message: result.enforcement.message,
            violationCount: result.enforcement.violationCount
          });
          
          // Desconectar después de 1 segundo para que el mensaje llegue
          setTimeout(() => {
            socket.disconnect(true);
            logger.error(`❌ Socket ${socket.id} desconectado por violaciones repetidas`);
          }, 1000);
        }
      }
      
      const error = {
        success: false,
        error: result.blocked ? 
          result.enforcement.message : 
          `Demasiadas solicitudes. Intenta de nuevo en ${result.retryAfter} segundos.`,
        rateLimitExceeded: true,
        retryAfter: result.retryAfter,
        enforcement: result.enforcement
      };
      
      // Si hay callback, enviar error
      if (typeof callback === 'function') {
        callback(error);
      }
      
      // No continuar con el evento
      return false;
    }
    
    return true;
  };
};


 // Aplica rate limiting a un socket para eventos específicos

const applyRateLimiting = (socket, events = Object.keys(RATE_LIMITS)) => {
  events.forEach(eventName => {
    if (eventName === 'default') return;
    
    const originalOn = socket.on.bind(socket);
    
    // Interceptar el método 'on' para este evento
    socket.on = function(event, handler) {
      if (event === eventName) {
        // Envolver el handler con rate limiting
        const wrappedHandler = function(...args) {
          const data = args[0];
          const callback = args[args.length - 1];
          
          const isAllowed = rateLimitMiddleware(socket, event)(data, callback);
          
          if (isAllowed) {
            return handler.apply(this, args);
          }
        };
        
        return originalOn(event, wrappedHandler);
      }
      
      return originalOn(event, handler);
    };
  });
};

/**
 * Limpieza periódica de datos antiguos
 * Ejecutar cada 5 minutos
 */
const startCleanupInterval = () => {
  setInterval(() => {
    const now = Date.now();
    let cleanedSockets = 0;
    
    eventCounts.forEach((socketEvents, socketId) => {
      let hasActiveEvents = false;
      
      socketEvents.forEach((timestamps, eventName) => {
        const { windowMs } = getRateLimit(eventName);
        const cleaned = cleanOldTimestamps(timestamps, windowMs);
        
        if (cleaned.length > 0) {
          socketEvents.set(eventName, cleaned);
          hasActiveEvents = true;
        } else {
          socketEvents.delete(eventName);
        }
      });
      
      if (!hasActiveEvents) {
        eventCounts.delete(socketId);
        cleanedSockets++;
      }
    });
    
    if (cleanedSockets > 0) {
      logger.debug(`Limpieza de rate limiting: ${cleanedSockets} sockets eliminados`);
    }
  }, 5 * 60 * 1000); 
};

module.exports = {
  checkRateLimit,
  clearSocketData,
  rateLimitMiddleware,
  applyRateLimiting,
  startCleanupInterval,
  RATE_LIMITS,
  ENFORCEMENT_CONFIG,
  getViolationCount,
  isSocketBlocked
};