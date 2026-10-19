// ============================================
// PREDICTION ENGINE - v7
// Gewichte: ELO 40%, Form 28%, H2H 12%, Heimvorteil 10%, Aufstellung 10%
// NEU: Unentschieden wird explizit berechnet (nicht mehr als Rest)
// Zeitlich korrekt: nur Daten VOR dem Anpfiff
// ============================================
const { pool } = require('../database/init');

// Basisquote für Unentschieden (Annahme, gegen matches-Tabelle prüfen)
const DRAW_BASE = 0.25;

// Stichtag: Anpfiff des betrachteten Spiels, sonst jetzt
function resolveCutoff(cutoff) {
  return cutoff ? new Date(cutoff) : new Date();
}

// Vergangenes Spiel = Backtest-Fall (keine h2h_history nutzen)
function isHistorical(cutoff) {
  return !!cutoff && new Date(cutoff) < new Date();
}

// Form der letzten 5 Spiele vor dem Stichtag
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

// Aufstellungs-Stabilität
// Anteil der Spieler, die in mindestens 3 der letzten 5 Spiele vor dem Anpfiff
// in der Startelf standen, bezogen auf 11. Hoch = eingespielte Mannschaft.
// Neutral (0.5), wenn weniger als 3 Spiele mit Aufstellung vorliegen.
async function calculateLineupStability(teamId, cutoff = null) {
  try {
    const last = await pool.query(
      `SELECT m.id FROM matches m
       WHERE m.status = 'FINISHED'
       AND m.kick_off < $2
       AND (m.home_team_id = $1 OR m.away_team_id = $1)
       ORDER BY m.kick_off DESC
       LIMIT 5`,
      [teamId, resolveCutoff(cutoff)]
    );
    const matchIds = last.rows.map(r => r.id);
    if (matchIds.length === 0) return { stability: 0.5, matchesWithLineup: 0 };

    const withLineup = await pool.query(
      `SELECT COUNT(DISTINCT match_id) AS n FROM match_lineups
       WHERE team_id = $1 AND match_id = ANY($2)`,
      [teamId, matchIds]
    );
    const n = parseInt(withLineup.rows[0].n);
    if (n < 3) return { stability: 0.5, matchesWithLineup: n };

    const stable = await pool.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT player_api_id FROM match_lineups
         WHERE team_id = $1 AND match_id = ANY($2)
         GROUP BY player_api_id
         HAVING COUNT(*) >= 3
       ) t`,
      [teamId, matchIds]
    );
    const c = parseInt(stable.rows[0].c);

    return { stability: Math.min(1, c / 11), matchesWithLineup: n };
  } catch (error) {
    console.error('Error calculating lineup stability:', error.message);
    return { stability: 0.5, matchesWithLineup: 0 };
  }
}

// Alte Spielerstärke (Noten) - nicht mehr in der Berechnung, nur noch für Kompatibilität exportiert
async function calculatePlayerStrength(teamId, cutoff = null) {
  return { avgRating: 6.0, performanceCount: 0, playerStrength: 0 };
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

// Gewinnwahrscheinlichkeiten mit explizitem Unentschieden
async function calculateImprovedWinProbability(homeTeamId, awayTeamId, cutoff = null) {
  try {
    const homeFormRes = await calculateTeamForm(homeTeamId, cutoff);
    const awayFormRes = await calculateTeamForm(awayTeamId, cutoff);
    const h2hRes = await calculateHeadToHead(homeTeamId, awayTeamId, cutoff);
    const homeLineup = await calculateLineupStability(homeTeamId, cutoff);
    const awayLineup = await calculateLineupStability(awayTeamId, cutoff);

    // Getrennte Abfragen: feste Zuordnung Heim/Auswärts
    const homeEloRes = await pool.query('SELECT elo_rating FROM teams WHERE id = $1', [homeTeamId]);
    const awayEloRes = await pool.query('SELECT elo_rating FROM teams WHERE id = $1', [awayTeamId]);

    const homeElo = homeEloRes.rows[0]?.elo_rating || 1500;
    const awayElo = awayEloRes.rows[0]?.elo_rating || 1500;

    const eloProbs = calculateWinProbability(homeElo, awayElo);

    // Form (28 %)
    const formFactor = (homeFormRes.formRating - awayFormRes.formRating) / 10;

    // H2H (12 %)
    const h2hFactor = h2hRes.matchesPlayed > 0
      ? (h2hRes.homeWins - h2hRes.awayWins) / (h2hRes.matchesPlayed * 2)
      : 0;

    // Aufstellung (10 %): Differenz der Stabilität, neutral bei fehlenden Daten
    const lineupFactor = (homeLineup.stability - awayLineup.stability) / 2;

    // Heimvorteil (10 %)
    const homeAdvantage = 0.05;

    // Schritt 1: Rohwerte für Heim- und Auswärtssieg (ohne Unentschieden)
    const rawHome =
      eloProbs.homeWin * 0.40 +
      (0.5 + formFactor * 0.28) * 0.28 +
      (0.5 + h2hFactor * 0.12) * 0.12 +
      (0.5 + lineupFactor * 0.10) * 0.10 +
      homeAdvantage * 0.10;

    const rawAway =
      eloProbs.awayWin * 0.40 +
      (0.5 - formFactor * 0.28) * 0.28 +
      (0.5 - h2hFactor * 0.12) * 0.12 +
      (0.5 - lineupFactor * 0.10) * 0.10;

    const total = rawHome + rawAway;
    if (total <= 0) {
      return { homeWinProb: 0.4, drawProb: DRAW_BASE, awayWinProb: 0.33 };
    }

    // Schritt 2: Unentschieden explizit berechnen
    // Ausgeglichene Teams -> höherer Anteil, klare Favoriten -> niedriger
    const balance = 1 - Math.abs(rawHome - rawAway) / total;
    const drawProb = DRAW_BASE * (0.8 + 0.4 * balance);

    // Schritt 3: Heim und Auswärts auf den restlichen Anteil skalieren (Summe = 1)
    const homeWinRaw = (1 - drawProb) * (rawHome / total);
    const awayWinRaw = (1 - drawProb) * (rawAway / total);

    const homeWinProb = Math.min(0.95, Math.max(0.05, homeWinRaw));
    const awayWinProb = Math.min(0.95, Math.max(0.05, awayWinRaw));
    const drawFinal = 1 - homeWinProb - awayWinProb;

    return {
      homeWinProb: parseFloat(homeWinProb.toFixed(4)),
      drawProb: parseFloat(drawFinal.toFixed(4)),
      awayWinProb: parseFloat(awayWinProb.toFixed(4)),
      factors: {
        eloWeight: 0.40,
        formWeight: 0.28,
        h2hWeight: 0.12,
        homeWeight: 0.10,
        lineupWeight: 0.10
      },
      lineup: {
        home: homeLineup,
        away: awayLineup
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
      lineup: winProbs.lineup,
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
  calculateLineupStability,
  calculatePlayerStrength
};
