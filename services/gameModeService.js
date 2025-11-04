const Game = require("../models/game.model");

/**
 * Configuraciones de los diferentes modos de juego
 */
const GAME_MODES = {
  classic: {
    name: 'Modo Clásico',
    description: 'Responde todas las preguntas y acumula puntos. El jugador con más puntos gana.',
    icon: '🏆',
    maxPlayers: 50,
    features: ['Puntuación por velocidad', 'Todas las preguntas', 'Ranking final'],
    winCondition: 'all_questions'
  },
  adventure: {
    name: 'Modo Aventura',
    description: 'Escala la montaña con 3 vidas. Cada error te hace perder una vida.',
    icon: '🏔️',
    maxPlayers: 20,
    maxLives: 3,
    features: ['3 vidas por jugador', 'Eliminación por vidas', 'Supervivencia'],
    winCondition: 'last_standing'
  },
  duel: {
    name: 'Modo Duelo',
    description: 'Enfrentamiento 1v1 eliminatorio. Un error y estás fuera.',
    icon: '⚔️',
    maxPlayers: 2,
    maxLives: 1, // Solo 1 "vida" (eliminatorio)
    features: ['Solo 2 jugadores', 'Eliminatorio directo', 'Un error = eliminación'],
    winCondition: 'first_to_finish'
  },
  tournament: {
    name: 'Modo Torneo',
    description: 'Torneo eliminatorio con múltiples jugadores. Bracket automático.',
    icon: '🏆',
    maxPlayers: 32,
    maxLives: 1, // Eliminatorio
    features: ['Múltiples jugadores', 'Bracket automático', 'Eliminación directa'],
    winCondition: 'tournament_bracket'
  }
};

/**
 * Obtiene la configuración de un modo de juego
 * @param {string} gameMode - Modo de juego ('classic', 'adventure', 'duel')
 * @returns {Object} Configuración del modo
 */
const getGameModeConfig = (gameMode) => {
  return GAME_MODES[gameMode] || GAME_MODES.classic;
};

/**
 * Inicializa un jugador según el modo de juego
 * @param {Object} playerData - Datos básicos del jugador
 * @param {string} gameMode - Modo de juego
 * @returns {Object} Jugador inicializado
 */
const initializePlayer = (playerData, gameMode, customModeConfig = null) => {
  const config = getGameModeConfig(gameMode);
  
  // CORREGIDO: Usar configuración personalizada si está disponible
  const maxLives = customModeConfig?.maxLives || config.maxLives || 3;
  
  return {
    ...playerData,
    lives: maxLives,
    position: 0,
    isEliminated: false,
    eliminatedAt: null
  };
};

/**
 * Procesa la respuesta de un jugador según el modo de juego
 * @param {Object} game - Documento del juego
 * @param {Object} player - Jugador que respondió
 * @param {boolean} isCorrect - Si la respuesta fue correcta
 * @param {number} pointsAwarded - Puntos otorgados
 * @param {Object} io - Instancia de Socket.IO
 * @returns {Object} Resultado del procesamiento
 */
const processPlayerAnswer = async (game, player, isCorrect, pointsAwarded, io) => {
  const result = {
    playerUpdated: false,
    gameEnded: false,
    winner: null,
    eliminatedPlayers: []
  };

  switch (game.gameMode) {
    case 'classic':
      // Modo clásico: solo acumular puntos (ya manejado en playerHandlers)
      result.playerUpdated = true;
      break;

    case 'adventure':
      if (!isCorrect) {
        player.lives -= 1;
        console.log(`🏔️ ${player.username} perdió una vida (respuesta incorrecta/vacía). Vidas restantes: ${player.lives}`);
        
        if (player.lives <= 0) {
          player.isEliminated = true;
          player.eliminatedAt = new Date();
          result.eliminatedPlayers.push(player);
          console.log(`💀 ${player.username} fue eliminado del modo Aventura`);
          
          // Notificar eliminación a todos los jugadores
          io.to(game.pin).emit("player-eliminated", {
            playerId: player.id,
            username: player.username,
            reason: "Sin vidas",
            mode: "adventure",
            remainingPlayers: game.players.filter(p => !p.isEliminated && p.id !== player.id).length
          });
        } else {
          // Notificar pérdida de vida pero aún vivo
          io.to(game.pin).emit("player-life-lost", {
            playerId: player.id,
            username: player.username,
            livesRemaining: player.lives,
            mode: "adventure"
          });
        }
      } else {
        // Respuesta correcta: avanzar posición
        player.position += 1;
        console.log(`✅ ${player.username} avanzó a posición ${player.position} (respuesta correcta)`);
      }
      
      // Verificar condiciones de fin de juego
      const activePlayers = game.players.filter(p => !p.isEliminated);
      const totalPlayers = game.players.length;
      console.log(`🔍 Modo Aventura - Jugadores activos: ${activePlayers.length}/${totalPlayers}`);
      console.log(`🔍 Jugadores eliminados: ${game.players.filter(p => p.isEliminated).map(p => p.username).join(', ')}`);
      
      // CORREGIDO: Solo terminar el juego si había más de 1 jugador inicialmente y ahora queda solo 1
      if (activePlayers.length === 1 && totalPlayers > 1) {
        result.gameEnded = true;
        result.winner = {
          playerId: activePlayers[0].id,
          username: activePlayers[0].username,
          winType: 'survival',
          winTime: new Date()
        };
        result.reason = 'Último superviviente';
        console.log(`🏆 Modo Aventura: ${activePlayers[0].username} es el último superviviente`);
      } else if (activePlayers.length === 0) {
        result.gameEnded = true;
        result.winner = null;
        result.reason = 'Todos los jugadores fueron eliminados';
        console.log(`💀 Modo Aventura: Todos los jugadores fueron eliminados`);
      } else if (activePlayers.length === 1 && totalPlayers === 1) {
        // NUEVO: Si hay solo 1 jugador, el juego continúa normalmente como modo clásico
        console.log(`🎮 Modo Aventura con 1 jugador: ${activePlayers[0].username} continúa jugando`);
      }
      result.playerUpdated = true;
      break;

    case 'duel':
      const FINISH_LINE = 10; // Meta para ganar el duelo (reducida)
      
      if (isCorrect) {
        player.position += 2; // Avanzar 2 posiciones por respuesta correcta
        console.log(`⚔️ ${player.username} avanzó a posición ${player.position} (respuesta correcta)`);
        
        // Notificar avance
        io.to(game.pin).emit("duel-position-update", {
          playerId: player.id,
          username: player.username,
          position: player.position,
          action: 'advance',
          points: 2
        });
      } else {
        // ELIMINATORIO: Respuesta incorrecta = eliminación inmediata
        player.isEliminated = true;
        player.eliminatedAt = new Date();
        result.eliminatedPlayers.push(player);
        console.log(`💀 ${player.username} fue eliminado del duelo (respuesta incorrecta)`);
        
        // Notificar eliminación
        io.to(game.pin).emit("duel-position-update", {
          playerId: player.id,
          username: player.username,
          position: player.position,
          action: 'eliminated',
          reason: 'Respuesta incorrecta'
        });
        
        // En duelo, si un jugador es eliminado, el otro gana automáticamente
        const remainingPlayer = game.players.find(p => !p.isEliminated && p.id !== player.id);
        if (remainingPlayer) {
          result.gameEnded = true;
          result.winner = {
            playerId: remainingPlayer.id,
            username: remainingPlayer.username,
            winType: 'elimination',
            winTime: new Date()
          };
          result.reason = 'Oponente eliminado';
          console.log(`🏆 ${remainingPlayer.username} ganó el duelo por eliminación del oponente`);
        }
      }
      
      // Verificar si alguien llegó a la meta (solo si el juego no terminó por eliminación)
      if (!result.gameEnded) {
        const winnerByPosition = game.players.find(p => p.position >= FINISH_LINE && !p.isEliminated);
        if (winnerByPosition) {
          result.gameEnded = true;
          result.winner = {
            playerId: winnerByPosition.id,
            username: winnerByPosition.username,
            winType: 'race',
            winTime: new Date()
          };
          result.reason = 'Llegó a la meta';
          console.log(`🏁 ${winnerByPosition.username} ganó el duelo llegando a la meta (posición ${winnerByPosition.position})`);
        }
      }
      
      // Emitir estado actualizado del duelo
      io.to(game.pin).emit("duel-state-update", {
        players: game.players.map(p => ({
          id: p.id,
          username: p.username,
          position: p.position,
          isEliminated: p.isEliminated,
          character: p.character
        })),
        finishLine: FINISH_LINE,
        gameEnded: result.gameEnded,
        winner: result.winner
      });
      
      result.playerUpdated = true;
      break;

    case 'tournament':
      // En modo torneo, usar la misma lógica que el duelo para cada match
      if (!isCorrect) {
        // ELIMINATORIO: Respuesta incorrecta = eliminación inmediata
        player.isEliminated = true;
        player.eliminatedAt = new Date();
        result.eliminatedPlayers.push(player);
        console.log(`💀 ${player.username} fue eliminado del torneo (respuesta incorrecta)`);
        
        // En torneo, si un jugador es eliminado, el otro gana el match
        const remainingPlayer = game.players.find(p => !p.isEliminated && p.id !== player.id && game.activePlayers?.includes(p.id));
        if (remainingPlayer) {
          result.gameEnded = true;
          result.winner = {
            playerId: remainingPlayer.id,
            username: remainingPlayer.username,
            winType: 'elimination',
            winTime: new Date()
          };
          result.reason = 'Oponente eliminado';
          console.log(`🏆 ${remainingPlayer.username} ganó el match por eliminación del oponente`);
        }
      } else {
        // Respuesta correcta: avanzar posición
        player.position += 2;
        console.log(`⚔️ ${player.username} avanzó a posición ${player.position} (respuesta correcta)`);
        
        // Verificar si llegó a la meta (mismo que duelo)
        const FINISH_LINE = 10;
        if (player.position >= FINISH_LINE) {
          result.gameEnded = true;
          result.winner = {
            playerId: player.id,
            username: player.username,
            winType: 'race',
            winTime: new Date()
          };
          result.reason = 'Llegó a la meta';
          console.log(`🏁 ${player.username} ganó el match llegando a la meta (posición ${player.position})`);
        }
      }
      
      result.playerUpdated = true;
      break;
  }

  return result;
};

/**
 * Verifica las condiciones de victoria según el modo de juego
 * @param {Object} game - Documento del juego
 * @returns {Object} Resultado de la verificación
 */
const checkWinConditions = (game) => {
  const result = {
    gameEnded: false,
    winner: null,
    reason: null
  };

  const activePlayers = game.players.filter(p => !p.isEliminated);

  switch (game.gameMode) {
    case 'classic':
      // El juego termina cuando se acaban las preguntas (manejado en questionService)
      break;

    case 'adventure':
      // CORREGIDO: Solo terminar si había más de 1 jugador inicialmente
      if (activePlayers.length === 1 && game.players.length > 1) {
        result.gameEnded = true;
        result.winner = {
          playerId: activePlayers[0].id,
          username: activePlayers[0].username,
          winType: 'survival'
        };
        result.reason = 'Último superviviente';
      } else if (activePlayers.length === 0) {
        result.gameEnded = true;
        result.reason = 'Todos los jugadores fueron eliminados';
      }
      break;

    case 'duel':
      if (activePlayers.length === 1) {
        result.gameEnded = true;
        result.winner = {
          playerId: activePlayers[0].id,
          username: activePlayers[0].username,
          winType: 'elimination'
        };
        result.reason = 'Oponente eliminado';
      } else if (activePlayers.length === 0) {
        result.gameEnded = true;
        result.reason = 'Empate - Ambos jugadores eliminados';
      }
      break;

    case 'tournament':
      // En modo torneo, el fin del juego se maneja en el servicio de torneo
      // Aquí solo verificamos si hay un ganador del match actual
      if (activePlayers.length === 1) {
        result.gameEnded = true;
        result.winner = {
          playerId: activePlayers[0].id,
          username: activePlayers[0].username,
          winType: 'match_winner'
        };
        result.reason = 'Ganador del match';
      } else if (activePlayers.length === 0) {
        result.gameEnded = true;
        result.reason = 'Empate en el match';
      }
      break;
  }

  return result;
};

/**
 * Obtiene el estado del juego para el frontend
 * @param {Object} game - Documento del juego
 * @returns {Object} Estado del juego
 */
const getGameState = (game) => {
  const config = getGameModeConfig(game.gameMode);
  const activePlayers = game.players.filter(p => !p.isEliminated);

  return {
    gameMode: game.gameMode,
    modeConfig: config,
    activePlayers: activePlayers.length,
    totalPlayers: game.players.length,
    eliminatedPlayers: game.players.filter(p => p.isEliminated).length,
    currentQuestion: game.currentQuestion + 1,
    totalQuestions: game.questions.length,
    winner: game.winner
  };
};

module.exports = {
  GAME_MODES,
  getGameModeConfig,
  initializePlayer,
  processPlayerAnswer,
  checkWinConditions,
  getGameState
};