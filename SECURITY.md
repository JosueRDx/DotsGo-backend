# Seguridad - DotsGo

## Mejoras de Seguridad Implementadas

### 1. Validación de Host en Reconexión

**Archivo:** `backend/socket/handlers/gameHandlers.js`

El evento `rejoin-host` ahora verifica que el socket que intenta reconectarse sea realmente el host original del juego.

```javascript
// Antes: Cualquiera con el PIN podía reconectarse como host
socket.on("rejoin-host", async ({ pin }, callback) => {
  const game = await Game.findOne({ pin });
  socket.join(pin); // Sin validación
});

// Ahora: Solo el host original puede reconectarse
socket.on("rejoin-host", async ({ pin }, callback) => {
  const game = await Game.findOne({ pin });
  if (game.hostId !== socket.id) {
    return callback({ 
      success: false, 
      error: "No autorizado. Solo el host puede reconectarse." 
    });
  }
  socket.join(pin); // Con validación
});
```

### 2. Wrapper Seguro para localStorage

**Archivo:** `frontend/src/utils/storage.js`

Utilidad que maneja errores de localStorage (modo incógnito, storage lleno, etc.)

#### Uso:

```javascript
// Importar
import storage from '@/utils/storage';

// En lugar de:
localStorage.setItem('key', 'value');
const value = localStorage.getItem('key');

// Usar:
storage.setItem('key', 'value');
const value = storage.getItem('key', 'defaultValue');

// Para objetos JSON:
storage.setJSON('user', { name: 'John' });
const user = storage.getJSON('user', null);
```

#### Características:
- ✅ Manejo automático de errores
- ✅ Valores por defecto
- ✅ Detección de storage lleno
- ✅ Compatible con modo incógnito
- ✅ Logging de errores

### 3. Rate Limiting para Socket.IO

**Archivo:** `backend/utils/rateLimiter.js`

Protección contra spam y ataques de flood en eventos de Socket.IO.

#### Límites Configurados:

| Evento | Máximo Intentos | Ventana de Tiempo |
|--------|-----------------|-------------------|
| create-game | 5 | 60 segundos |
| start-game | 10 | 60 segundos |
| join-game | 10 | 30 segundos |
| submit-answer | 50 | 60 segundos |
| rejoin-host | 5 | 60 segundos |
| kick-player | 20 | 60 segundos |

#### Características:
- ✅ Límites personalizables por evento
- ✅ Limpieza automática de datos antiguos
- ✅ Mensajes informativos al usuario
- ✅ Logging de intentos excedidos
- ✅ Zero overhead en memoria

#### Respuesta cuando se excede el límite:

```javascript
{
  success: false,
  error: "Demasiadas solicitudes. Intenta de nuevo en 45 segundos.",
  rateLimitExceeded: true,
  retryAfter: 45
}
```

### 4. Protección del Endpoint de Debug

**Archivo:** `backend/routes/questions.routes.js`

El endpoint `/api/questions/debug-game/:pin` ahora solo está disponible en desarrollo.

```javascript
router.get('/debug-game/:pin', async (req, res) => {
  // Deshabilitar en producción
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ 
      error: 'Endpoint no disponible en producción' 
    });
  }

});
```

## Configuración para Producción

### Variables de Entorno Requeridas

Agregar al archivo `.env`:

```bash
# Modo de ejecución
NODE_ENV=production

# MongoDB
MONGODB_URI=mongodb+srv://...

# Puerto
PORT=5000
```

### Checklist Pre-Producción

- [ ] Establecer `NODE_ENV=production` en producción
- [ ] Configurar orígenes CORS permitidos en `backend/config/cors.js`
- [ ] Revisar y ajustar límites de rate limiting si es necesario
- [ ] Implementar HTTPS para conexiones seguras
- [ ] Configurar logs en producción (considerar Winston/Pino)
- [ ] Habilitar compresión de respuestas
- [ ] Configurar firewall y reglas de seguridad

## Monitoreo

### Logs de Seguridad

El sistema genera logs cuando:
- Se intenta reconectar como host sin autorización
- Se exceden los límites de rate limiting
- Hay errores en localStorage (cliente)

### Ejemplos de Logs:

```
⚠️ Intento de reconexión no autorizada al juego ABC123 por socket xyz789
⚠️ Rate limit excedido para socket abc123 en evento 'create-game': 6/5
🧹 Limpieza de rate limiting: 15 sockets eliminados
```

## Mejoras Futuras Recomendadas

1. **Autenticación JWT** para hosts
2. **WebSocket con TLS** (wss://)
3. **Helmet.js** para headers de seguridad HTTP
4. **CSRF Protection** para formularios
5. **Rate limiting en HTTP endpoints** (express-rate-limit)
6. **Sanitización de entradas** (express-validator)
7. **Monitoreo con Sentry** para errores en producción

## Contacto

Para reportar problemas de seguridad, contacta al equipo de desarrollo.
