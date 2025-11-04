/**
 * Servicio para manejar torneos tipo bracket
 */

class TournamentService {
  constructor() {
    this.tournaments = new Map(); // gamePin -> tournament data
  }

  /**
   * Crear un nuevo torneo
   */
  createTournament(gamePin, players) {
    // Mezclar jugadores aleatoriamente
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    
    // Si hay número impar, agregar un BYE
    const playersWithByes = [...shuffledPlayers];
    if (playersWithByes.length % 2 !== 0) {
      playersWithByes.push({
        id: 'bye',
        username: 'BYE',
        isBye: true,
        isEliminated: false
      });
    }

    // Generar bracket inicial
    const bracket = this.generateBracket(playersWithByes);
    
    const tournament = {
      gamePin,
      players: playersWithByes,
      bracket,
      currentRound: 0,
      currentMatch: null,
      status: 'waiting', // waiting, active, completed
      winner: null,
      createdAt: new Date()
    };

    this.tournaments.set(gamePin, tournament);
    return tournament;
  }

  /**
   * Generar bracket completo
   */
  generateBracket(players) {
    const totalRounds = Math.ceil(Math.log2(players.length));
    const bracket = [];

    // Primera ronda
    const firstRound = [];
    for (let i = 0; i < players.length; i += 2) {
      firstRound.push({
        id: `r0-m${Math.floor(i/2)}`,
        round: 0,
        player1: players[i],
        player2: players[i + 1],
        winner: null,
        status: 'pending' // pending, active, completed
      });
    }
    bracket.push(firstRound);

    // Rondas siguientes (vacías inicialmente)
    for (let round = 1; round < totalRounds; round++) {
      const roundMatches = [];
      const previousRoundSize = bracket[round - 1].length;
      
      for (let i = 0; i < Math.ceil(previousRoundSize / 2); i++) {
        roundMatches.push({
          id: `r${round}-m${i}`,
          round,
          player1: null,
          player2: null,
          winner: null,
          status: 'waiting'
        });
      }
      bracket.push(roundMatches);
    }

    return bracket;
  } 
 /**
   * Obtener el siguiente match disponible
   */
  getNextMatch(gamePin) {
    const tournament = this.tournaments.get(gamePin);
    if (!tournament) return null;

    // Buscar el primer match pendiente con ambos jugadores
    for (let round = 0; round < tournament.bracket.length; round++) {
      for (let match of tournament.bracket[round]) {
        if (match.status === 'pending' && match.player1 && match.player2) {
          // Manejar BYE automáticamente
          if (match.player1.isBye) {
            this.advancePlayer(gamePin, match.id, match.player2);
            continue;
          }
          if (match.player2.isBye) {
            this.advancePlayer(gamePin, match.id, match.player1);
            continue;
          }
          return match;
        }
      }
    }
    return null;
  }

  /**
   * Iniciar un match específico
   */
  startMatch(gamePin, matchId) {
    const tournament = this.tournaments.get(gamePin);
    if (!tournament) return null;

    // Encontrar el match
    for (let round of tournament.bracket) {
      const match = round.find(m => m.id === matchId);
      if (match) {
        match.status = 'active';
        tournament.currentMatch = match;
        tournament.status = 'active';
        return match;
      }
    }
    return null;
  }

  /**
   * Completar un match con un ganador
   */
  completeMatch(gamePin, matchId, winner) {
    const tournament = this.tournaments.get(gamePin);
    if (!tournament) return null;

    // Encontrar y completar el match
    for (let roundIndex = 0; roundIndex < tournament.bracket.length; roundIndex++) {
      const matchIndex = tournament.bracket[roundIndex].findIndex(m => m.id === matchId);
      if (matchIndex !== -1) {
        const match = tournament.bracket[roundIndex][matchIndex];
        match.winner = winner;
        match.status = 'completed';
        
        // Avanzar ganador a la siguiente ronda
        this.advancePlayer(gamePin, matchId, winner);
        
        // Verificar si el torneo terminó
        if (this.isTournamentComplete(tournament)) {
          tournament.status = 'completed';
          tournament.winner = winner;
        }
        
        tournament.currentMatch = null;
        return match;
      }
    }
    return null;
  }

  /**
   * Avanzar jugador a la siguiente ronda
   */
  advancePlayer(gamePin, matchId, player) {
    const tournament = this.tournaments.get(gamePin);
    if (!tournament) return;

    // Encontrar el match actual
    for (let roundIndex = 0; roundIndex < tournament.bracket.length; roundIndex++) {
      const matchIndex = tournament.bracket[roundIndex].findIndex(m => m.id === matchId);
      if (matchIndex !== -1) {
        // Marcar match como completado si no lo está
        if (tournament.bracket[roundIndex][matchIndex].status !== 'completed') {
          tournament.bracket[roundIndex][matchIndex].winner = player;
          tournament.bracket[roundIndex][matchIndex].status = 'completed';
        }
        
        // Si no es la final, avanzar a siguiente ronda
        if (roundIndex < tournament.bracket.length - 1) {
          const nextRoundIndex = roundIndex + 1;
          const nextMatchIndex = Math.floor(matchIndex / 2);
          const nextMatch = tournament.bracket[nextRoundIndex][nextMatchIndex];
          
          if (!nextMatch.player1) {
            nextMatch.player1 = player;
          } else {
            nextMatch.player2 = player;
            nextMatch.status = 'pending';
          }
        }
        break;
      }
    }
  }

  /**
   * Verificar si el torneo está completo
   */
  isTournamentComplete(tournament) {
    const finalRound = tournament.bracket[tournament.bracket.length - 1];
    return finalRound.length === 1 && finalRound[0].winner !== null;
  }

  /**
   * Obtener estado del torneo
   */
  getTournamentState(gamePin) {
    return this.tournaments.get(gamePin) || null;
  }

  /**
   * Eliminar torneo
   */
  deleteTournament(gamePin) {
    return this.tournaments.delete(gamePin);
  }

  /**
   * Obtener nombre de la ronda
   */
  getRoundName(roundIndex, totalRounds) {
    const roundsFromEnd = totalRounds - roundIndex - 1;
    switch (roundsFromEnd) {
      case 0: return 'Final';
      case 1: return 'Semifinal';
      case 2: return 'Cuartos de Final';
      case 3: return 'Octavos de Final';
      default: return `Ronda ${roundIndex + 1}`;
    }
  }
}

module.exports = new TournamentService();