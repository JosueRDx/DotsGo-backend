/**
 * Servicio de Limpieza de Juegos
 * 
 * Gestiona la auto-finalización de juegos abandonados o que excedan
 * la duración máxima configurada. Previene acumulación de recursos.
 */

const Game = require("../models/game.model");
const logger = require("../utils/logger");

/**
 * Tiempo de advertencia antes de auto-finalizar (15 minutos)
 */
const WARNING_TIME_MS = 15 * 60 * 1000;

// Busca y finaliza juegos que hayan excedido su duración máxima

async function cleanupAbandonedGames(io) {
  const now = Date.now();
  const stats = {
    checked: 0,
    finalized: 0,
    warned: 0,
    errors: 0,
  };

  try {
    // Buscar juegos activos con gameStartedAt definido
    const activeGames = await Game.find({
      status: "playing",
      gameStartedAt: { $ne: null },
    }).lean();

    stats.checked = activeGames.length;
    logger.debug(`🧹 Cleanup: Revisando ${activeGames.length} juegos activos`);

    for (const game of activeGames) {
      try {
        const gameAge = now - new Date(game.gameStartedAt).getTime();
        const maxDuration = game.maxGameDuration || 7200000; // Default: 2 horas

        // Juego excedió duración máxima - auto-finalizar
        if (gameAge > maxDuration) {
          await finalizeGame(game, io);
          stats.finalized++;
          logger.warn(
            `⏱️ Juego auto-finalizado por timeout: PIN ${game.pin} (${Math.round(gameAge / 60000)} minutos)`
          );
        }
        // Juego cerca del límite - enviar advertencia
        else if (gameAge > maxDuration - WARNING_TIME_MS) {
          await warnGame(game, io, maxDuration - gameAge);
          stats.warned++;
        }
      } catch (error) {
        stats.errors++;
        logger.error(
          `❌ Error al procesar juego ${game.pin}:`,
          error.message
        );
      }
    }

    if (stats.finalized > 0 || stats.warned > 0) {
      logger.info(
        `🧹 Cleanup completado: ${stats.finalized} finalizados, ${stats.warned} advertidos`
      );
    }

    return stats;
  } catch (error) {
    logger.error("❌ Error en cleanup de juegos:", error.message);
    throw error;
  }
}


// Finaliza un juego automáticamente por exceso de duración

async function finalizeGame(game, io) {
  try {
    // Calcular resultados finales
    const sortedPlayers = [...game.players].sort(
      (a, b) => b.score - a.score
    );

    // Actualizar estado del juego
    await Game.findByIdAndUpdate(game._id, {
      status: "finished",
      endedAt: new Date(),
      autoFinalized: true,
      finalResults: sortedPlayers.map((p, index) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        position: index + 1,
      })),
    });

    // Emitir evento de finalización automática
    io.to(game.pin).emit("game-auto-finalized", {
      message: "El juego ha sido finalizado automáticamente por exceder el tiempo máximo",
      reason: "max-duration-exceeded",
      results: sortedPlayers,
    });

    // Redirigir a resultados
    io.to(game.pin).emit("game-ended", {
      winners: sortedPlayers.slice(0, 3),
      allPlayers: sortedPlayers,
      autoFinalized: true,
    });

    logger.info(`✅ Juego ${game.pin} finalizado automáticamente`);
  } catch (error) {
    logger.error(
      `❌ Error al finalizar juego ${game.pin}:`,
      error.message
    );
    throw error;
  }
}


// Envía advertencia a los participantes de un juego cercano al límite

async function warnGame(game, io, timeRemaining) {
  const minutesRemaining = Math.ceil(timeRemaining / 60000);

  io.to(game.pin).emit("game-time-warning", {
    message: `El juego se finalizará automáticamente en ${minutesRemaining} minutos`,
    minutesRemaining,
    severity: minutesRemaining <= 5 ? "high" : "medium",
  });

  logger.debug(
    `⚠️ Advertencia enviada a juego ${game.pin}: ${minutesRemaining} min restantes`
  );
}


 // Cleanup manual forzado de un juego específico

async function forceCleanupGame(pin, io) {
  try {
    const game = await Game.findOne({ pin, status: "playing" }).lean();

    if (!game) {
      logger.warn(`⚠️ No se encontró juego activo con PIN ${pin}`);
      return false;
    }

    await finalizeGame(game, io);
    return true;
  } catch (error) {
    logger.error(`❌ Error en cleanup forzado de ${pin}:`, error.message);
    throw error;
  }
}

 // Limpia juegos en estado "waiting" que lleven más de 1 hora sin iniciar
 
async function cleanupStaleWaitingGames() {
  const oneHourAgo = new Date(Date.now() - 3600000);

  try {
    const result = await Game.deleteMany({
      status: "waiting",
      createdAt: { $lt: oneHourAgo },
    });

    if (result.deletedCount > 0) {
      logger.info(
        `🧹 Eliminados ${result.deletedCount} juegos en espera obsoletos`
      );
    }

    return result.deletedCount;
  } catch (error) {
    logger.error(
      "❌ Error al limpiar juegos en espera:",
      error.message
    );
    throw error;
  }
}

module.exports = {
  cleanupAbandonedGames,
  forceCleanupGame,
  cleanupStaleWaitingGames,
};
