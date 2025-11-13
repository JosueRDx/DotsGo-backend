/**
 * Utilidades de validación para entradas de Socket.IO
 * Valida todos los datos recibidos de los clientes para prevenir datos maliciosos o incorrectos
 */


 // Valida un nombre de usuario

const validateUsername = (username) => {
  // Verificar que existe
  if (!username) {
    return { valid: false, error: "El nombre de usuario es requerido" };
  }

  // Verificar tipo de dato
  if (typeof username !== 'string') {
    return { valid: false, error: "El nombre de usuario debe ser texto" };
  }

  // Eliminar espacios en blanco al inicio y final
  const trimmed = username.trim();

  // Verificar longitud mínima
  if (trimmed.length < 1) {
    return { valid: false, error: "El nombre de usuario no puede estar vacío" };
  }

  // Verificar longitud máxima (50 caracteres)
  if (trimmed.length > 50) {
    return { valid: false, error: "El nombre de usuario no puede exceder 50 caracteres" };
  }

  // Verificar caracteres permitidos (letras, números, espacios, guiones y guiones bajos)
  const validPattern = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s_-]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: "El nombre de usuario contiene caracteres no permitidos" };
  }

  return { valid: true, sanitized: trimmed };
};

 // Valida un PIN de juego

const validatePin = (pin) => {
  // Verificar que existe
  if (!pin) {
    return { valid: false, error: "El PIN es requerido" };
  }

  // Verificar tipo de dato
  if (typeof pin !== 'string') {
    return { valid: false, error: "El PIN debe ser texto" };
  }

  // Convertir a mayúsculas para normalizar
  const normalizedPin = pin.toUpperCase().trim();

  // Verificar formato (exactamente 6 caracteres alfanuméricos)
  const pinPattern = /^[A-Z0-9]{6}$/;
  if (!pinPattern.test(normalizedPin)) {
    return { valid: false, error: "El PIN debe contener exactamente 6 caracteres alfanuméricos" };
  }

  return { valid: true, sanitized: normalizedPin };
};

 // Valida el límite de tiempo por pregunta

const validateTimeLimit = (timeLimit) => {
  // Verificar que existe
  if (timeLimit === undefined || timeLimit === null) {
    return { valid: false, error: "El tiempo límite es requerido" };
  }

  // Verificar tipo de dato
  if (typeof timeLimit !== 'number') {
    return { valid: false, error: "El tiempo límite debe ser un número" };
  }

  // Verificar que sea un número válido
  if (isNaN(timeLimit) || !isFinite(timeLimit)) {
    return { valid: false, error: "El tiempo límite debe ser un número válido" };
  }

  // Verificar rango mínimo (5 segundos)
  if (timeLimit < 5) {
    return { valid: false, error: "El tiempo límite debe ser al menos 5 segundos" };
  }

  // Verificar rango máximo (300 segundos = 5 minutos)
  if (timeLimit > 300) {
    return { valid: false, error: "El tiempo límite no puede exceder 300 segundos" };
  }

  // Redondear a entero
  return { valid: true, sanitized: Math.floor(timeLimit) };
};


 // Valida un array de IDs de preguntas

const validateQuestionIds = (questionIds) => {
  // Verificar que existe
  if (!questionIds) {
    return { valid: false, error: "Los IDs de preguntas son requeridos" };
  }

  // Verificar que sea un array
  if (!Array.isArray(questionIds)) {
    return { valid: false, error: "Los IDs de preguntas deben ser un array" };
  }

  // Verificar que no esté vacío
  if (questionIds.length === 0) {
    return { valid: false, error: "Debe seleccionar al menos una pregunta" };
  }

  // Verificar límite máximo (100 preguntas)
  if (questionIds.length > 100) {
    return { valid: false, error: "No puede seleccionar más de 100 preguntas" };
  }

  // Verificar que todos los elementos sean strings válidos (MongoDB ObjectIDs)
  const objectIdPattern = /^[a-f0-9]{24}$/i;
  for (let i = 0; i < questionIds.length; i++) {
    const id = questionIds[i];
    
    if (typeof id !== 'string') {
      return { valid: false, error: `El ID de pregunta en posición ${i + 1} no es válido` };
    }

    if (!objectIdPattern.test(id)) {
      return { valid: false, error: `El ID de pregunta en posición ${i + 1} tiene formato inválido` };
    }
  }

  // Verificar que no haya duplicados
  const uniqueIds = new Set(questionIds);
  if (uniqueIds.size !== questionIds.length) {
    return { valid: false, error: "Los IDs de preguntas contienen duplicados" };
  }

  return { valid: true, sanitized: questionIds };
};

 // Valida el modo de juego

const validateGameMode = (gameMode) => {
  // Si no se proporciona, usar valor por defecto
  if (!gameMode) {
    return { valid: true, sanitized: 'classic' };
  }

  // Verificar tipo de dato
  if (typeof gameMode !== 'string') {
    return { valid: false, error: "El modo de juego debe ser texto" };
  }

  // Lista de modos válidos
  const validModes = ['classic', 'adventure', 'duel', 'tournament'];
  const lowercaseMode = gameMode.toLowerCase().trim();

  if (!validModes.includes(lowercaseMode)) {
    return { valid: false, error: `Modo de juego inválido. Modos permitidos: ${validModes.join(', ')}` };
  }

  return { valid: true, sanitized: lowercaseMode };
};


 // Valida el nombre del juego

const validateGameName = (gameName) => {
  // El nombre del juego es opcional
  if (!gameName) {
    return { valid: true, sanitized: null };
  }

  // Verificar tipo de dato
  if (typeof gameName !== 'string') {
    return { valid: false, error: "El nombre del juego debe ser texto" };
  }

  const trimmed = gameName.trim();

  // Verificar longitud máxima (100 caracteres)
  if (trimmed.length > 100) {
    return { valid: false, error: "El nombre del juego no puede exceder 100 caracteres" };
  }

  return { valid: true, sanitized: trimmed || null };
};

 //Valida la configuración del modo de juego

const validateModeConfig = (modeConfig, gameMode) => {
  // La configuración del modo es opcional
  if (!modeConfig) {
    return { valid: true, sanitized: null };
  }

  // Verificar tipo de dato
  if (typeof modeConfig !== 'object' || Array.isArray(modeConfig)) {
    return { valid: false, error: "La configuración del modo debe ser un objeto" };
  }

  const sanitized = {};

  // Validar maxLives (para modo adventure)
  if (modeConfig.maxLives !== undefined) {
    if (typeof modeConfig.maxLives !== 'number' || modeConfig.maxLives < 1 || modeConfig.maxLives > 10) {
      return { valid: false, error: "Las vidas máximas deben ser un número entre 1 y 10" };
    }
    sanitized.maxLives = Math.floor(modeConfig.maxLives);
  }

  // Validar maxPlayers
  if (modeConfig.maxPlayers !== undefined) {
    if (typeof modeConfig.maxPlayers !== 'number' || modeConfig.maxPlayers < 2 || modeConfig.maxPlayers > 100) {
      return { valid: false, error: "Los jugadores máximos deben ser un número entre 2 y 100" };
    }
    sanitized.maxPlayers = Math.floor(modeConfig.maxPlayers);
  }

  return { valid: true, sanitized };
};


  // Valida datos completos para crear un juego

const validateCreateGameData = (gameData) => {
  // Verificar que se reciban datos
  if (!gameData || typeof gameData !== 'object') {
    return { valid: false, errors: ["Los datos del juego son inválidos"] };
  }

  const errors = [];
  const sanitized = {};

  // Validar timeLimit
  const timeLimitResult = validateTimeLimit(gameData.timeLimit);
  if (!timeLimitResult.valid) {
    errors.push(timeLimitResult.error);
  } else {
    sanitized.timeLimit = timeLimitResult.sanitized;
  }

  // Validar questionIds
  const questionIdsResult = validateQuestionIds(gameData.questionIds);
  if (!questionIdsResult.valid) {
    errors.push(questionIdsResult.error);
  } else {
    sanitized.questionIds = questionIdsResult.sanitized;
  }

  // Validar gameMode
  const gameModeResult = validateGameMode(gameData.gameMode);
  if (!gameModeResult.valid) {
    errors.push(gameModeResult.error);
  } else {
    sanitized.gameMode = gameModeResult.sanitized;
  }

  // Validar gameName
  const gameNameResult = validateGameName(gameData.gameName);
  if (!gameNameResult.valid) {
    errors.push(gameNameResult.error);
  } else {
    sanitized.gameName = gameNameResult.sanitized;
  }

  // Validar modeConfig
  const modeConfigResult = validateModeConfig(gameData.modeConfig, sanitized.gameMode);
  if (!modeConfigResult.valid) {
    errors.push(modeConfigResult.error);
  } else {
    sanitized.modeConfig = modeConfigResult.sanitized;
  }

  // Si hay errores, retornar lista completa
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, sanitized };
};


  // Valida datos para unirse a un juego

const validateJoinGameData = (joinData) => {
  // Verificar que se reciban datos
  if (!joinData || typeof joinData !== 'object') {
    return { valid: false, errors: ["Los datos de unión son inválidos"] };
  }

  const errors = [];
  const sanitized = {};

  // Validar PIN
  const pinResult = validatePin(joinData.pin);
  if (!pinResult.valid) {
    errors.push(pinResult.error);
  } else {
    sanitized.pin = pinResult.sanitized;
  }

  // Validar username
  const usernameResult = validateUsername(joinData.username);
  if (!usernameResult.valid) {
    errors.push(usernameResult.error);
  } else {
    sanitized.username = usernameResult.sanitized;
  }

  // El character es opcional, solo verificar si existe
  if (joinData.character !== undefined && joinData.character !== null) {
    if (typeof joinData.character !== 'object') {
      errors.push("El personaje debe ser un objeto");
    } else {
      sanitized.character = joinData.character;
    }
  }

  // Si hay errores, retornar lista completa
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, sanitized };
};


  // Valida un índice de respuesta

const validateAnswerIndex = (answerIndex) => {
  // Verificar que existe
  if (answerIndex === undefined || answerIndex === null) {
    return { valid: false, error: "El índice de respuesta es requerido" };
  }

  // Verificar tipo de dato
  if (typeof answerIndex !== 'number') {
    return { valid: false, error: "El índice de respuesta debe ser un número" };
  }

  // Verificar que sea un entero válido
  if (!Number.isInteger(answerIndex)) {
    return { valid: false, error: "El índice de respuesta debe ser un número entero" };
  }

  // Verificar rango (0-3 para 4 opciones)
  if (answerIndex < 0 || answerIndex > 3) {
    return { valid: false, error: "El índice de respuesta debe estar entre 0 y 3" };
  }

  return { valid: true, sanitized: answerIndex };
};


  // Valida el tiempo de respuesta

const validateResponseTime = (responseTime) => {
  // Verificar que existe
  if (responseTime === undefined || responseTime === null) {
    return { valid: false, error: "El tiempo de respuesta es requerido" };
  }

  // Verificar tipo de dato
  if (typeof responseTime !== 'number') {
    return { valid: false, error: "El tiempo de respuesta debe ser un número" };
  }

  // Verificar que sea válido
  if (isNaN(responseTime) || !isFinite(responseTime)) {
    return { valid: false, error: "El tiempo de respuesta debe ser un número válido" };
  }

  // Verificar rango mínimo (0 ms)
  if (responseTime < 0) {
    return { valid: false, error: "El tiempo de respuesta no puede ser negativo" };
  }

  // Verificar rango máximo (5 minutos = 300000 ms)
  if (responseTime > 300000) {
    return { valid: false, error: "El tiempo de respuesta es demasiado alto" };
  }

  return { valid: true, sanitized: Math.floor(responseTime) };
};

  // Valida datos para enviar una respuesta

const validateSubmitAnswerData = (answerData) => {
  // Verificar que se reciban datos
  if (!answerData || typeof answerData !== 'object') {
    return { valid: false, errors: ["Los datos de respuesta son inválidos"] };
  }

  const errors = [];
  const sanitized = {};

  // Validar PIN
  const pinResult = validatePin(answerData.pin);
  if (!pinResult.valid) {
    errors.push(pinResult.error);
  } else {
    sanitized.pin = pinResult.sanitized;
  }

  // Validar answerIndex
  const answerIndexResult = validateAnswerIndex(answerData.answerIndex);
  if (!answerIndexResult.valid) {
    errors.push(answerIndexResult.error);
  } else {
    sanitized.answerIndex = answerIndexResult.sanitized;
  }

  // Validar responseTime
  const responseTimeResult = validateResponseTime(answerData.responseTime);
  if (!responseTimeResult.valid) {
    errors.push(responseTimeResult.error);
  } else {
    sanitized.responseTime = responseTimeResult.sanitized;
  }

  // Si hay errores, retornar lista completa
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, sanitized };
};

module.exports = {
  // Validadores individuales
  validateUsername,
  validatePin,
  validateTimeLimit,
  validateQuestionIds,
  validateGameMode,
  validateGameName,
  validateModeConfig,
  validateAnswerIndex,
  validateResponseTime,
  
  // Validadores compuestos
  validateCreateGameData,
  validateJoinGameData,
  validateSubmitAnswerData
};
