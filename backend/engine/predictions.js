// ============================================
// PREDICTION ENGINE - v5
// Zeitlich korrekt: nur Daten VOR dem Anpfiff
// ============================================
const { pool } = require('../database/init');

// Stichtag: Anpfiff des betrachteten Spiels, sonst jetzt
function resolveCutoff(cutoff) {
  return cutoff ? new Date(cutoff) : new Date();
}

// Vergangenes Spiel = Backtest-Fall (keine h2h_history nutzen)
function isHistorical(cutoff) {
  return !!cutoff && new Date(cutoff) < new Date();
}

// Calculate recent form (last 5 matches before cutoff)
async function calculateTeamForm(teamId, cutoff = null) {
  try {
    const result = await pool.query(
      `SELECT 
        m.id, m.home_team_id, m.away_team_id, m.home_goals, m.away_goals, m.status, m.kick_off
       FROM matches m
       WHERE (m.home_team_id = $1 OR m.away_team_id = $1)
       AND m.status = 'FINISHED'
       AND m.kick_off < $2
       ORDER BY m.kick_off DESC
       LIMIT 5`,
      [teamId, resolveCutoff(cutoff)]
    );
    
    const matches = result.rows;
    let wins = 0, draws = 0, losses = 0;
    
    for (const match of matches) {
      const isHome = match.home_team_id === teamId;
      const teamGoals = isHome ? match.home_goals : match.away_goals;
      const oppGoals = isHome ? match.away_goals : match.home_goals;
      
      if (teamGoals > oppGoals) wins++;
      else if (teamGoals === oppGoals) draws++;
      else losses++;
    }
    
    const formRating = (wins * 3 + draws * 1) / Math.max(matches.length, 1);
    
    return {
      wins,
      draws,
      losses,
      matchesPlayed: matches.length,
      formRating: parseFloat(formRating.toFixed(2))
    };
  } catch (error) {
    console.error('Error calculating team form:', error.message);
    return { wins: 0, draws: 0, losses: 0, matchesPlayed: 0, formRating: 0 };
  }
}

// Head-to-head: aus Sicht von homeTeamId
async function calculateHeadToHead(homeTeamId, awayTeamId, cutoff = null) {
  try {
    // h2h_history nur für kommende Spiele (ohne Datum, also nicht für Backtests)
    if (!isHistorical(cutoff)) {
      const h2hResult = await pool.query(
        `SELECT home_wins, draws, away_wins
         FROM h2h_history
         WHERE home_team_id = $1 AND away_team_id = $2`,
        [homeTeamId, awayTeamId]
      );
      
      if (h2hResult.rows.length > 0) {
        const data = h2hResult.rows[0];
        return {
          homeWins: data.home_wins,
          draws: data.draws,
          awayWins: data.away_wins,
          matchesPlayed: data.home_wins + data.draws + data.away_wins,
          source: 'h2h_history'
        };
      }
    }
    
    // Fallback: Direktvergleiche vor dem Stichtag
    const matchResult = await pool.query(
      `SELECT m.home_team_id, m.home_goals, m.away_goals
       FROM matches m
       WHERE ((m.home_team_id = $1 AND m.away_team_id = $2)
          OR (m.home_team_id = $2 AND m.away_team_id = $1))
       AND m.status = 'FINISHED'
       AND m.kick_off < $3
       ORDER BY m.kick_off DESC
       LIMIT 10`,
      [homeTeamId, awayTeamId, resolveCutoff(cutoff)]
    );
    
    const matches = matchResult.rows;
    let homeWins = 0, draws = 0, awayWins = 0;
    
    for (const match of matches) {
      // Tore aus Sicht von homeTeamId (Rollen können in alten Spielen getauscht sein)
      const teamIsHome = match.home_team_id === homeTeamId;
      const homeG = teamIsHome ? match.home_goals : match.away_goals;
      const awayG = teamIsHome ? match.away_goals : match.home_goals;
      
      if (homeG > awayG) homeWins++;
      else if (homeG === awayG) draws++;
      else awayWins++;
    }
    
    return {
      homeWins,
      draws,
      awayWins,
      matchesPlayed: matches.length,
      source: 'matches_fallback'
    };
  } catch (error) {
    console.error('Error calculating head-to-head:', error.message);
    return { homeWins: 0, draws: 0, awayWins: 0, matchesPlayed: 0, source: 'error' };
  }
}

// Spielerstärke aus Ratings vor dem Stichtag
async function calculatePlayerStrength(teamId, cutoff = null) {
  try {
    const result = await pool.query(
      `SELECT AVG(pp.rating) as avg_rating, COUNT(pp.id) as perf_count
       FROM player_performance pp
       JOIN matches m ON m.id = pp.match_id
       WHERE pp.team_id = $1
       AND pp.rating > 0
       AND m.kick_off < $2`,
      [teamId, resolveCutoff(cutoff)]
    );

    const data = result.rows[0];
    
    if (!data || data.perf_count === 0) {
      return { avgRating: 6.0, performanceCount: 0, playerStrength: 0 };
    }
    
    const avgRating = parseFloat(data.avg_rating) || 6.0;
    const playerStrength = (avgRating - 5) / 5;
    
    return {
      avgRating: parseFloat(avgRating.toFixed(2)),
      performanceCount: parseInt(data.perf_count),
      playerStrength: parseFloat(playerStrength.toFixed(2))
    };
  } catch (error) {
    console.error('Error calculating player strength:', error.message);
    return { avgRating: 6.0, performanceCount: 0, playerStrength: 0 };
  }
}

// Basic ELO
function calculateWinProbability(homeElo, awayElo) {
  const diff = homeElo - awayElo;
  const homeProb = 1 / (1 + Math.pow(10, -diff / 400));
  const awayProb = 1 - homeProb;
  const drawProb = 0.25;
  
  return {
    homeWin: homeProb * 0.75,
    draw: drawProb,
    awayWin: awayProb * 0.75
  };
}

// Over/under 2.5
function calculateOverUnder2_5(homeTeamId, awayTeamId, form1, form2) {
  const avgGoals = (form1.formRating + form2.formRating) / 2 * 1.5;
  const over25Prob = Math.min(0.9, Math.max(0.1, avgGoals / 3.5));
  
  return {
    over2_5: over25Prob,
    under2_5: 1 - over25Prob
  };
}

// Win probability mit Stichtag
async function calculateImprovedWinProbability(homeTeamId, awayTeamId, cutoff = null) {
  try {
    const homeFormRes = await calculateTeamForm(homeTeamId, cutoff);
    const awayFormRes = await calculateTeamForm(awayTeamId, cutoff);
    const h2hRes = await calculateHeadToHead(homeTeamId, awayTeamId, cutoff);
    const homePlayerRes = await calculatePlayerStrength(homeTeamId, cutoff);
    const awayPlayerRes = await calculatePlayerStrength(awayTeamId, cutoff);
    
    // Getrennte Abfragen: feste Zuordnung Heim/Auswärts
    const homeEloRes = await pool.query('SELECT elo_rating FROM teams WHERE id = $1', [homeTeamId]);
    const awayEloRes = await pool.query('SELECT elo_rating FROM teams WHERE id = $1', [awayTeamId]);
    
    const homeElo = homeEloRes.rows[0]?.elo_rating || 1500;
    const awayElo = awayEloRes.rows[0]?.elo_rating || 1500;
    
    const eloProbs = calculateWinProbability(homeElo, awayElo);
    
    // Form factor (25%)
    const formFactor = (homeFormRes.formRating - awayFormRes.formRating) / 10;
    
    // H2H factor (12%)
    const h2hFactor = h2hRes.matchesPlayed > 0 
      ? (h2hRes.homeWins - h2hRes.awayWins) / (h2hRes.matchesPlayed * 2)
      : 0;
    
    // Player factor (18%)
    const playerFactor = (homePlayerRes.playerStrength - awayPlayerRes.playerStrength) / 2;
    
    // Home advantage (10%)
    const homeAdvantage = 0.05;

    // WEIGHTS (Sum = 100%): ELO 35%, Form 25%, H2H 12%, Home 10%, Player 18%
    const homeWinProb = Math.min(
      0.95,
      Math.max(
        0.05,
        eloProbs.homeWin * 0.35 +
        (0.5 + formFactor * 0.25) * 0.25 +
        (0.5 + h2hFactor * 0.12) * 0.12 +
        (0.5 + playerFactor * 0.18) * 0.18 +
        homeAdvantage * 0.10
      )
    );
    
    const awayWinProb = Math.min(
      0.95,
      Math.max(
        0.05,
        eloProbs.awayWin * 0.35 +
        (0.5 - formFactor * 0.25) * 0.25 +
        (0.5 - h2hFactor * 0.12) * 0.12 +
        (0.5 - playerFactor * 0.18) * 0.18
      )
    );
    
    const drawProb = 1 - homeWinProb - awayWinProb;
    
    return {
      homeWinProb: parseFloat(homeWinProb.toFixed(4)),
      drawProb: parseFloat(drawProb.toFixed(4)),
      awayWinProb: parseFloat(awayWinProb.toFixed(4)),
      factors: {
        eloWeight: 0.35,
        formWeight: 0.25,
        h2hWeight: 0.12,
        homeWeight: 0.10,
        playerWeight: 0.18
      },
      h2hSource: h2hRes.source
    };
  } catch (error) {
    console.error('Error calculating improved win probability:', error.message);
    return { homeWinProb: 0.5, drawProb: 0.25, awayWinProb: 0.25 };
  }
}

// Recommendation
function generateRecommendation(homeWinProb, drawProb, awayWinProb, over25Prob) {
  const maxProb = Math.max(homeWinProb, drawProb, awayWinProb);
  
  if (maxProb < 0.4) return 'SKIP - Low confidence';
  if (homeWinProb === maxProb && homeWinProb > 0.6) return `HOME WIN - ${(homeWinProb * 100).toFixed(0)}%`;
  if (drawProb === maxProb && drawProb > 0.4) return `DRAW - ${(drawProb * 100).toFixed(0)}%`;
  if (awayWinProb === maxProb && awayWinProb > 0.6) return `AWAY WIN - ${(awayWinProb * 100).toFixed(0)}%`;
  
  return 'MIXED - Wait for better odds';
}

// Calculate all predictions: Stichtag = Anpfiff des Spiels (matchId = matches.id)
async function calculateAllPredictions(homeTeamId, awayTeamId, matchId) {
  try {
    const kickRes = await pool.query('SELECT kick_off FROM matches WHERE id = $1', [matchId]);
    const cutoff = kickRes.rows[0]?.kick_off || null;

    const winProbs = await calculateImprovedWinProbability(homeTeamId, awayTeamId, cutoff);
    const form1 = await calculateTeamForm(homeTeamId, cutoff);
    const form2 = await calculateTeamForm(awayTeamId, cutoff);
    const ou = calculateOverUnder2_5(homeTeamId, awayTeamId, form1, form2);
    
    return {
      predictions: {
        home_win_prob: winProbs.homeWinProb,
        draw_prob: winProbs.drawProb,
        away_win_prob: winProbs.awayWinProb,
        over_2_5_prob: ou.over2_5,
        under_2_5_prob: ou.under2_5
      },
      recommendation: generateRecommendation(
        winProbs.homeWinProb,
        winProbs.drawProb,
        winProbs.awayWinProb,
        ou.over2_5
      ),
      factors: winProbs.factors,
      h2hSource: winProbs.h2hSource
    };
  } catch (error) {
    console.error('Error calculating all predictions:', error.message);
    return {
      predictions: {
        home_win_prob: 0.33,
        draw_prob: 0.33,
        away_win_prob: 0.33,
        over_2_5_prob: 0.5,
        under_2_5_prob: 0.5
      },
      recommendation: 'ERROR - Check logs'
    };
  }
}

module.exports = {
  calculateWinProbability,
  calculateOverUnder2_5,
  calculateAllPredictions,
  generateRecommendation,
  calculateTeamForm,
  calculateHeadToHead,
  calculateImprovedWinProbability,
  calculatePlayerStrength
};
