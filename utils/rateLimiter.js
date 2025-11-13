/**
 * Middleware de rate limiting para Socket.IO
 * Protege contra spam y ataques de flood
 */

// Map para almacenar contadores de eventos por socket
const eventCounts = new Map();

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
    
    return {
      allowed: false,
      retryAfter,
      current: timestamps.length,
      max: maxAttempts
    };
  }
  
  // Agregar nuevo timestamp
  timestamps.push(Date.now());
  socketEvents.set(eventName, timestamps);
  
  return {
    allowed: true,
    current: timestamps.length,
    max: maxAttempts
  };
};


 // Limpia los datos de rate limiting de un socket

const clearSocketData = (socketId) => {
  eventCounts.delete(socketId);
};


 // Middleware para aplicar rate limiting a eventos de Socket.IO

const rateLimitMiddleware = (socket, eventName) => {
  return (data, callback) => {
    const result = checkRateLimit(socket.id, eventName);
    
    if (!result.allowed) {
      console.warn(`⚠️ Rate limit excedido para socket ${socket.id} en evento '${eventName}': ${result.current}/${result.max}`);
      
      const error = {
        success: false,
        error: `Demasiadas solicitudes. Intenta de nuevo en ${result.retryAfter} segundos.`,
        rateLimitExceeded: true,
        retryAfter: result.retryAfter
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
      console.log(`Limpieza de rate limiting: ${cleanedSockets} sockets eliminados`);
    }
  }, 5 * 60 * 1000); 
};

module.exports = {
  checkRateLimit,
  clearSocketData,
  rateLimitMiddleware,
  applyRateLimiting,
  startCleanupInterval,
  RATE_LIMITS
};
