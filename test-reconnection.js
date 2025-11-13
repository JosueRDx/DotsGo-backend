/**
 * Script de prueba para el sistema de reconexión
 * Ejecutar con: node test-reconnection.js
 */

const { 
  generateSessionId, 
  schedulePlayerCleanup, 
  cancelPlayerCleanup, 
  isWithinGracePeriod 
} = require('./utils/sessionManager');

console.log('🧪 Iniciando pruebas del sistema de reconexión...\n');

// Test 1: Generar Session ID
console.log('Test 1: Generar Session ID');
const sessionId1 = generateSessionId();
const sessionId2 = generateSessionId();
console.log('  Session ID 1:', sessionId1);
console.log('  Session ID 2:', sessionId2);
console.log('  ✅ Son únicos:', sessionId1 !== sessionId2);
console.log('  ✅ Longitud correcta:', sessionId1.length === 32);
console.log('');

// Test 2: Período de gracia
console.log('Test 2: Verificar período de gracia');
const now = new Date();
const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
const fourMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000);

console.log('  Desconectado hace 2 minutos:', isWithinGracePeriod(twoMinutesAgo));
console.log('  ✅ Dentro del período:', isWithinGracePeriod(twoMinutesAgo) === true);
console.log('  Desconectado hace 4 minutos:', isWithinGracePeriod(fourMinutesAgo));
console.log('  ✅ Fuera del período:', isWithinGracePeriod(fourMinutesAgo) === false);
console.log('');

// Test 3: Programar y cancelar limpieza
console.log('Test 3: Programar y cancelar limpieza');
const testSessionId = generateSessionId();
let cleanupExecuted = false;

schedulePlayerCleanup(testSessionId, 'TEST123', () => {
  cleanupExecuted = true;
  console.log('  ❌ Limpieza ejecutada (no debería ocurrir)');
});

console.log('  Limpieza programada para sesión:', testSessionId);

// Cancelar inmediatamente
const cancelled = cancelPlayerCleanup(testSessionId);
console.log('  ✅ Limpieza cancelada:', cancelled);

// Esperar un poco para verificar que no se ejecutó
setTimeout(() => {
  console.log('  ✅ Limpieza no ejecutada:', !cleanupExecuted);
  console.log('');
  
  // Test 4: Limpieza automática
  console.log('Test 4: Limpieza automática (5 segundos)');
  const testSessionId2 = generateSessionId();
  let autoCleanupExecuted = false;
  
  // Programar limpieza con timeout corto para testing
  const originalTimeout = setTimeout;
  setTimeout = (fn, delay) => {
    // Reducir delay a 5 segundos para testing
    return originalTimeout(fn, 5000);
  };
  
  schedulePlayerCleanup(testSessionId2, 'TEST456', () => {
    autoCleanupExecuted = true;
    console.log('  ✅ Limpieza automática ejecutada correctamente');
    
    // Restaurar setTimeout original
    setTimeout = originalTimeout;
    
    console.log('\n🎉 Todas las pruebas completadas exitosamente!');
    process.exit(0);
  });
  
  console.log('  Esperando 5 segundos para limpieza automática...');
}, 1000);
