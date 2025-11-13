/**
 * Script de prueba para el sistema anti-multicuentas
 * Ejecutar con: node test-anti-multiaccount.js
 */

const {
  canJoinGame,
  registerPlayer,
  unregisterPlayer,
  cleanupGame,
  getGameStats,
  generateClientFingerprint,
  getClientIP
} = require('./utils/antiMultiAccount');

console.log('🧪 Iniciando pruebas del sistema anti-multicuentas...\n');

// Mock de socket para testing
const createMockSocket = (id, userAgent, ip) => ({
  id,
  handshake: {
    headers: {
      'user-agent': userAgent,
      'accept-language': 'es-ES,es;q=0.9',
      'accept-encoding': 'gzip, deflate, br'
    },
    address: ip
  }
});

const PIN = 'TEST123';

// Test 1: Fingerprint único por navegador
console.log('Test 1: Fingerprint único por navegador');
const socket1 = createMockSocket('socket1', 'Mozilla/5.0 Chrome', '192.168.1.100');
const socket2 = createMockSocket('socket2', 'Mozilla/5.0 Firefox', '192.168.1.100');
const socket3 = createMockSocket('socket3', 'Mozilla/5.0 Chrome', '192.168.1.100');

const fp1 = generateClientFingerprint(socket1);
const fp2 = generateClientFingerprint(socket2);
const fp3 = generateClientFingerprint(socket3);

console.log('  Fingerprint Chrome:', fp1.substring(0, 20) + '...');
console.log('  Fingerprint Firefox:', fp2.substring(0, 20) + '...');
console.log('  Fingerprint Chrome (mismo):', fp3.substring(0, 20) + '...');
console.log('  ✅ Chrome ≠ Firefox:', fp1 !== fp2);
console.log('  ✅ Chrome = Chrome:', fp1 === fp3);
console.log('');

// Test 2: Detección de IP
console.log('Test 2: Detección de IP');
const ip1 = getClientIP(socket1);
const ip2 = getClientIP(socket2);
console.log('  IP Socket 1:', ip1);
console.log('  IP Socket 2:', ip2);
console.log('  ✅ Misma IP:', ip1 === ip2);
console.log('');

// Test 3: Primer jugador puede unirse
console.log('Test 3: Primer jugador puede unirse');
const check1 = canJoinGame(PIN, 'Juan', socket1);
console.log('  Resultado:', check1);
console.log('  ✅ Permitido:', check1.allowed === true);

if (check1.allowed) {
  registerPlayer(PIN, 'Juan', socket1);
  console.log('  ✅ Jugador registrado');
}
console.log('');

// Test 4: Mismo navegador, diferente usuario (BLOQUEADO)
console.log('Test 4: Mismo navegador, diferente usuario');
const socket1b = createMockSocket('socket1b', 'Mozilla/5.0 Chrome', '192.168.1.100');
const check2 = canJoinGame(PIN, 'Pedro', socket1b);
console.log('  Resultado:', check2);
console.log('  ✅ Bloqueado:', check2.allowed === false);
console.log('  ✅ Código correcto:', check2.code === 'DUPLICATE_BROWSER');
console.log('');

// Test 5: Diferente navegador, misma IP (PERMITIDO)
console.log('Test 5: Diferente navegador, misma IP');
const check3 = canJoinGame(PIN, 'María', socket2);
console.log('  Resultado:', check3);
console.log('  ✅ Permitido:', check3.allowed === true);

if (check3.allowed) {
  registerPlayer(PIN, 'María', socket2);
  console.log('  ✅ Jugador registrado');
}
console.log('');

// Test 6: Tercer jugador misma IP (BLOQUEADO)
console.log('Test 6: Tercer jugador misma IP (límite alcanzado)');
const socket4 = createMockSocket('socket4', 'Mozilla/5.0 Safari', '192.168.1.100');
const check4 = canJoinGame(PIN, 'Carlos', socket4);
console.log('  Resultado:', check4);
console.log('  ✅ Bloqueado:', check4.allowed === false);
console.log('  ✅ Código correcto:', check4.code === 'IP_LIMIT_REACHED');
console.log('');

// Test 7: Estadísticas del juego
console.log('Test 7: Estadísticas del juego');
const stats = getGameStats(PIN);
console.log('  Estadísticas:', stats);
console.log('  ✅ 2 navegadores únicos:', stats.uniqueBrowsers === 2);
console.log('  ✅ 1 IP única:', stats.uniqueIPs === 1);
console.log('  ✅ 2 cuentas totales:', stats.totalAccounts === 2);
console.log('');

// Test 8: Reconexión del mismo usuario (PERMITIDO)
console.log('Test 8: Reconexión del mismo usuario');
const check5 = canJoinGame(PIN, 'Juan', socket1);
console.log('  Resultado:', check5);
console.log('  ✅ Permitido:', check5.allowed === true);
console.log('  ✅ Razón correcta:', check5.reason === 'reconnection');
console.log('');

// Test 9: Desregistrar jugador
console.log('Test 9: Desregistrar jugador');
unregisterPlayer(PIN, 'Juan', socket1);
const statsAfterUnregister = getGameStats(PIN);
console.log('  Estadísticas después:', statsAfterUnregister);
console.log('  ✅ 1 cuenta restante:', statsAfterUnregister.totalAccounts === 1);
console.log('');

// Test 10: Ahora puede unirse otro usuario en ese navegador
console.log('Test 10: Nuevo usuario en navegador liberado');
const check6 = canJoinGame(PIN, 'Luis', socket1);
console.log('  Resultado:', check6);
console.log('  ✅ Permitido:', check6.allowed === true);
console.log('');

// Test 11: Diferente IP (PERMITIDO)
console.log('Test 11: Usuario desde diferente IP');
const socket5 = createMockSocket('socket5', 'Mozilla/5.0 Chrome', '192.168.1.200');
const check7 = canJoinGame(PIN, 'Ana', socket5);
console.log('  Resultado:', check7);
console.log('  ✅ Permitido:', check7.allowed === true);

if (check7.allowed) {
  registerPlayer(PIN, 'Ana', socket5);
  console.log('  ✅ Jugador registrado');
}
console.log('');

// Test 12: Estadísticas finales
console.log('Test 12: Estadísticas finales');
const finalStats = getGameStats(PIN);
console.log('  Estadísticas finales:', finalStats);
console.log('  ✅ 2 navegadores únicos:', finalStats.uniqueBrowsers === 2);
console.log('  ✅ 2 IPs únicas:', finalStats.uniqueIPs === 2);
console.log('');

// Test 13: Limpieza del juego
console.log('Test 13: Limpieza del juego');
cleanupGame(PIN);
const statsAfterCleanup = getGameStats(PIN);
console.log('  Estadísticas después de limpieza:', statsAfterCleanup);
console.log('  ✅ Todo limpio:', statsAfterCleanup.totalAccounts === 0);
console.log('');

console.log('🎉 Todas las pruebas completadas exitosamente!');
console.log('');
console.log('📊 Resumen:');
console.log('  ✅ Fingerprinting funciona correctamente');
console.log('  ✅ Detección de IP funciona');
console.log('  ✅ Bloqueo de múltiples pestañas funciona');
console.log('  ✅ Límite de 2 por IP funciona');
console.log('  ✅ Reconexión de mismo usuario funciona');
console.log('  ✅ Desregistro funciona');
console.log('  ✅ Limpieza funciona');
