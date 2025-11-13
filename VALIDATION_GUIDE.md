# Guía de Validación de Entradas

## Descripción General

Este documento describe el sistema de validación implementado para proteger la aplicación contra datos maliciosos o incorrectos en todos los eventos de Socket.IO y endpoints HTTP.

## Módulo de Validación

**Ubicación**: `backend/utils/validation.js`

### Validadores Individuales

#### 1. `validateUsername(username)`
Valida nombres de usuario de jugadores.

**Reglas**:
- **Requerido**: Sí
- **Tipo**: String
- **Longitud**: 1-50 caracteres
- **Caracteres permitidos**: Letras (a-z, A-Z), números (0-9), espacios, guiones (-), guiones bajos (_), caracteres con tilde (á, é, í, ó, ú, ñ)
- **Sanitización**: Elimina espacios en blanco al inicio y final

**Ejemplo**:
```javascript
const result = validateUsername("Juan_Pérez-123");
// { valid: true, sanitized: "Juan_Pérez-123" }

const result2 = validateUsername("@hacker<script>");
// { valid: false, error: "El nombre de usuario contiene caracteres no permitidos" }
```

#### 2. `validatePin(pin)`
Valida códigos PIN de juegos.

**Reglas**:
- **Requerido**: Sí
- **Tipo**: String
- **Formato**: Exactamente 6 dígitos numéricos
- **Patrón**: `^\d{6}$`

**Ejemplo**:
```javascript
const result = validatePin("123456");
// { valid: true, sanitized: "123456" }

const result2 = validatePin("abc123");
// { valid: false, error: "El PIN debe contener exactamente 6 dígitos" }
```

#### 3. `validateTimeLimit(timeLimit)`
Valida el tiempo límite por pregunta en segundos.

**Reglas**:
- **Requerido**: Sí
- **Tipo**: Number
- **Rango**: 5-300 segundos (5 segundos a 5 minutos)
- **Sanitización**: Redondea a número entero

**Ejemplo**:
```javascript
const result = validateTimeLimit(30);
// { valid: true, sanitized: 30 }

const result2 = validateTimeLimit(500);
// { valid: false, error: "El tiempo límite no puede exceder 300 segundos" }
```

#### 4. `validateQuestionIds(questionIds)`
Valida arrays de IDs de preguntas MongoDB.

**Reglas**:
- **Requerido**: Sí
- **Tipo**: Array de Strings
- **Longitud**: 1-100 elementos
- **Formato de cada ID**: MongoDB ObjectID (24 caracteres hexadecimales)
- **Restricciones**: Sin duplicados

**Ejemplo**:
```javascript
const result = validateQuestionIds([
  "507f1f77bcf86cd799439011",
  "507f191e810c19729de860ea"
]);
// { valid: true, sanitized: [...] }

const result2 = validateQuestionIds([]);
// { valid: false, error: "Debe seleccionar al menos una pregunta" }
```

#### 5. `validateGameMode(gameMode)`
Valida el modo de juego seleccionado.

**Reglas**:
- **Requerido**: No (default: 'classic')
- **Tipo**: String
- **Valores permitidos**: 'classic', 'adventure', 'duel', 'tournament'
- **Sanitización**: Convierte a minúsculas y elimina espacios

**Ejemplo**:
```javascript
const result = validateGameMode("ADVENTURE");
// { valid: true, sanitized: "adventure" }

const result2 = validateGameMode("invalid-mode");
// { valid: false, error: "Modo de juego inválido. Modos permitidos: classic, adventure, duel, tournament" }
```

#### 6. `validateGameName(gameName)`
Valida el nombre personalizado del juego.

**Reglas**:
- **Requerido**: No (opcional)
- **Tipo**: String
- **Longitud máxima**: 100 caracteres
- **Sanitización**: Elimina espacios en blanco, retorna null si está vacío

**Ejemplo**:
```javascript
const result = validateGameName("Mi Juego de Pictogramas");
// { valid: true, sanitized: "Mi Juego de Pictogramas" }

const result2 = validateGameName("");
// { valid: true, sanitized: null }
```

#### 7. `validateModeConfig(modeConfig, gameMode)`
Valida la configuración personalizada del modo de juego.

**Reglas**:
- **Requerido**: No (opcional)
- **Tipo**: Object
- **Propiedades**:
  - `maxLives`: Number (1-10) - Para modo adventure
  - `maxPlayers`: Number (2-100)

**Ejemplo**:
```javascript
const result = validateModeConfig({ maxLives: 5, maxPlayers: 20 }, 'adventure');
// { valid: true, sanitized: { maxLives: 5, maxPlayers: 20 } }

const result2 = validateModeConfig({ maxLives: 15 }, 'adventure');
// { valid: false, error: "Las vidas máximas deben ser un número entre 1 y 10" }
```

#### 8. `validateAnswerIndex(answerIndex)`
Valida el índice de una respuesta seleccionada.

**Reglas**:
- **Requerido**: Sí
- **Tipo**: Number (entero)
- **Rango**: 0-3 (4 opciones de respuesta)

**Ejemplo**:
```javascript
const result = validateAnswerIndex(2);
// { valid: true, sanitized: 2 }

const result2 = validateAnswerIndex(5);
// { valid: false, error: "El índice de respuesta debe estar entre 0 y 3" }
```

#### 9. `validateResponseTime(responseTime)`
Valida el tiempo de respuesta en milisegundos.

**Reglas**:
- **Requerido**: Sí
- **Tipo**: Number
- **Rango**: 0-300000 ms (0 a 5 minutos)
- **Sanitización**: Redondea a entero

**Ejemplo**:
```javascript
const result = validateResponseTime(3500);
// { valid: true, sanitized: 3500 }

const result2 = validateResponseTime(-100);
// { valid: false, error: "El tiempo de respuesta no puede ser negativo" }
```

### Validadores Compuestos

#### 1. `validateCreateGameData(gameData)`
Valida todos los datos necesarios para crear un juego.

**Valida**:
- timeLimit
- questionIds
- gameMode
- gameName
- modeConfig

**Retorna**:
```javascript
{
  valid: boolean,
  errors: string[], // Si valid = false
  sanitized: {      // Si valid = true
    timeLimit: number,
    questionIds: string[],
    gameMode: string,
    gameName: string | null,
    modeConfig: object | null
  }
}
```

#### 2. `validateJoinGameData(joinData)`
Valida datos para que un jugador se una a un juego.

**Valida**:
- pin
- username
- character (opcional)

**Retorna**:
```javascript
{
  valid: boolean,
  errors: string[], // Si valid = false
  sanitized: {      // Si valid = true
    pin: string,
    username: string,
    character: object | undefined
  }
}
```

#### 3. `validateSubmitAnswerData(answerData)`
Valida datos al enviar una respuesta.

**Valida**:
- pin
- answerIndex
- responseTime

**Retorna**:
```javascript
{
  valid: boolean,
  errors: string[], // Si valid = false
  sanitized: {      // Si valid = true
    pin: string,
    answerIndex: number,
    responseTime: number
  }
}
```

## Implementación en Handlers

### Eventos de Socket.IO Protegidos

Todos los siguientes eventos de Socket.IO tienen validación implementada:

#### Game Handlers (`gameHandlers.js`)

1. **create-game**
   - Validador: `validateCreateGameData()`
   - Valida: timeLimit, questionIds, gameMode, gameName, modeConfig
   ```javascript
   const validation = validateCreateGameData(gameData);
   if (!validation.valid) {
     return callback({ success: false, error: validation.errors[0] });
   }
   ```

2. **rejoin-host**
   - Validador: `validatePin()`
   - Valida: PIN del juego
   ```javascript
   const pinValidation = validatePin(pin);
   if (!pinValidation.valid) {
     return callback({ success: false, error: pinValidation.error });
   }
   ```

3. **start-game**
   - Validador: `validatePin()`
   - Valida: PIN del juego

4. **create-tournament**
   - Validador: `validatePin()`
   - Valida: PIN del juego

5. **start-tournament-match**
   - Validadores: `validatePin()` + validación manual de matchId
   - Valida: PIN y matchId (string no vacío)

6. **kick-player**
   - Validadores: `validatePin()` + validación manual de playerId
   - Valida: PIN y playerId (string no vacío)

#### Player Handlers (`playerHandlers.js`)

1. **join-game**
   - Validador: `validateJoinGameData()`
   - Valida: pin, username, character
   ```javascript
   const validation = validateJoinGameData(joinData);
   if (!validation.valid) {
     return callback({ success: false, error: validation.errors[0] });
   }
   const { pin, username, character } = validation.sanitized;
   ```

2. **submit-answer**
   - Validador: `validateSubmitAnswerData()`
   - Valida: pin, answerIndex (indirecto), responseTime
   ```javascript
   const validation = validateSubmitAnswerData({
     pin: answerData.pin,
     answerIndex: 0,
     responseTime: answerData.responseTime
   });
   ```

3. **leave-game**
   - Validadores: `validatePin()` (opcional) + validación manual de username
   - Valida: PIN (si se proporciona) y username (tipo string)

#### Room Handlers (`roomHandlers.js`)

1. **get-room-players**
   - Validador: `validatePin()`
   - Valida: PIN del juego

2. **get-current-question**
   - Validador: `validatePin()`
   - Valida: PIN del juego

3. **request-current-question**
   - Validador: `validatePin()`
   - Valida: PIN del juego

### Endpoints HTTP Protegidos

#### Questions Routes (`questions.routes.js`)

1. **GET /api/questions/debug-game/:pin**
   - Validador: `validatePin()`
   - Valida: PIN en parámetros de URL
   - Protección adicional: Solo disponible en desarrollo (NODE_ENV !== 'production')
   ```javascript
   const pinValidation = validatePin(pin);
   if (!pinValidation.valid) {
     return res.status(400).json({ error: pinValidation.error });
   }
   ```

## Manejo de Errores

### Respuestas de Validación

Cuando la validación falla, se retorna:

```javascript
{
  success: false,
  error: "Mensaje del primer error",
  validationErrors: ["Error 1", "Error 2", ...] // Opcional, lista completa
}
```

### Logs de Seguridad

Todos los fallos de validación se registran en consola con formato:

```javascript
console.warn(`⚠️ Validación fallida en [nombre-evento]:`, [detalles]);
```

Esto permite:
- Monitorear intentos de ataque
- Detectar bugs en el frontend
- Auditar problemas de seguridad

## Beneficios de Seguridad

### 1. Prevención de Inyección
- **SQL Injection**: N/A (usamos MongoDB con queries parametrizadas)
- **NoSQL Injection**: Validación de ObjectIDs previene inyección de operadores MongoDB
- **XSS**: Sanitización de strings previene scripts maliciosos en nombres

### 2. Prevención de DoS
- Límites de longitud previenen consumo excesivo de memoria
- Límites de cantidad (max 100 preguntas) previenen sobrecarga
- Validación de tipos previene errores que causen crashes

### 3. Integridad de Datos
- Sanitización garantiza datos consistentes en base de datos
- Validación de rangos previene valores ilógicos (tiempo negativo, etc.)
- Detección de duplicados previene inconsistencias

### 4. Protección de Lógica de Negocio
- Validación de modos de juego previene estados inválidos
- Validación de índices previene acceso fuera de rango
- Validación de IDs previene manipulación de datos de otros usuarios

## Mejores Prácticas

### Para Desarrolladores

1. **Siempre validar ANTES de usar datos**:
   ```javascript
   // ❌ MAL
   const game = await Game.findOne({ pin });
   
   // ✅ BIEN
   const pinValidation = validatePin(pin);
   if (!pinValidation.valid) return callback({ success: false, error: pinValidation.error });
   const game = await Game.findOne({ pin: pinValidation.sanitized });
   ```

2. **Usar datos sanitizados**:
   ```javascript
   // ❌ MAL
   const { timeLimit, questionIds } = gameData;
   
   // ✅ BIEN
   const validation = validateCreateGameData(gameData);
   const { timeLimit, questionIds } = validation.sanitized;
   ```

3. **Retornar errores descriptivos**:
   ```javascript
   // ❌ MAL
   return callback({ success: false, error: "Error" });
   
   // ✅ BIEN
   return callback({ 
     success: false, 
     error: validation.errors[0],
     validationErrors: validation.errors
   });
   ```

4. **Log de intentos sospechosos**:
   ```javascript
   if (!validation.valid) {
     console.warn(`⚠️ Validación fallida en ${eventName}:`, validation.errors);
   }
   ```

### Para Nuevos Eventos

Al agregar un nuevo evento de Socket.IO:

1. Identificar todos los datos de entrada
2. Seleccionar validadores apropiados del módulo `validation.js`
3. Agregar validación al inicio del handler (después de rate limiting)
4. Usar siempre los datos sanitizados
5. Retornar errores descriptivos
6. Agregar logs de seguridad

**Template**:
```javascript
const handleNuevoEvento = (socket, io) => {
  socket.on("nuevo-evento", async (inputData, callback) => {
    // 1. Rate limiting (si aplica)
    const rateCheck = checkRateLimit(socket.id, 'nuevo-evento');
    if (!rateCheck.allowed) {
      return callback({ success: false, error: "Demasiadas solicitudes" });
    }

    // 2. Validación de entrada
    const validation = validateNuevoEventoData(inputData);
    if (!validation.valid) {
      console.warn(`⚠️ Validación fallida en nuevo-evento:`, validation.errors);
      return callback({
        success: false,
        error: validation.errors[0],
        validationErrors: validation.errors
      });
    }

    // 3. Usar datos sanitizados
    const { campo1, campo2 } = validation.sanitized;

    try {
      // 4. Lógica del evento
      // ...
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
};
```

## Testing

### Casos de Prueba Recomendados

Para cada validador, probar:

1. **Valores válidos**: Datos correctos retornan `{ valid: true, sanitized: ... }`
2. **Valores faltantes**: `null`, `undefined` retornan error apropiado
3. **Tipos incorrectos**: Number en lugar de String, etc.
4. **Fuera de rango**: Valores menores/mayores a límites
5. **Formato inválido**: Caracteres especiales, patrones incorrectos
6. **Casos edge**: Strings vacíos, arrays vacíos, valores límite

**Ejemplo de test**:
```javascript
describe('validateUsername', () => {
  it('debe aceptar nombres válidos', () => {
    const result = validateUsername('Juan123');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('Juan123');
  });

  it('debe rechazar caracteres especiales', () => {
    const result = validateUsername('Juan<script>');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('caracteres no permitidos');
  });

  it('debe rechazar nombres muy largos', () => {
    const result = validateUsername('a'.repeat(51));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('50 caracteres');
  });
});
```

## Monitoreo y Mantenimiento

### Métricas a Rastrear

1. **Cantidad de validaciones fallidas por evento**
2. **Tipos de errores más comunes**
3. **IPs o sockets con múltiples fallos** (posibles atacantes)
4. **Patrones de ataque** (caracteres especiales específicos, etc.)

### Actualización de Reglas

Al detectar nuevos patrones de ataque:

1. Actualizar validadores en `validation.js`
2. Agregar tests para el nuevo caso
3. Documentar el cambio en este archivo
4. Notificar al equipo de frontend si afecta llamadas

## Resumen de Protecciones Implementadas

| Aspecto | Protección |
|---------|-----------|
| **Nombres de usuario** | Longitud 1-50, solo alfanuméricos y caracteres seguros |
| **PINs** | Formato estricto de 6 dígitos |
| **Tiempo límite** | Rango 5-300 segundos |
| **IDs de preguntas** | Formato MongoDB ObjectID, máximo 100, sin duplicados |
| **Modo de juego** | Lista blanca de modos permitidos |
| **Nombre del juego** | Máximo 100 caracteres |
| **Vidas/jugadores** | Rangos lógicos (1-10 vidas, 2-100 jugadores) |
| **Índice de respuesta** | Rango 0-3 |
| **Tiempo de respuesta** | No negativo, máximo 5 minutos |

## Notas Importantes

- ⚠️ **NUNCA** saltarse la validación "porque los datos vienen del frontend"
- ⚠️ **SIEMPRE** usar datos sanitizados después de validar
- ⚠️ **TODOS** los nuevos eventos deben tener validación
- ⚠️ **LOGS** son críticos para detectar ataques y bugs

## Referencias

- Documentación de seguridad: `SECURITY.md`
- Rate limiting: `utils/rateLimiter.js`
- Modelos de datos: `models/game.model.js`, `models/question.model.js`
