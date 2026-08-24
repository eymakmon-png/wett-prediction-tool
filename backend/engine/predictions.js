// ============================================
// PREDICTION ENGINE
// Win Probability + Over/Under 2.5 Goals
// ============================================

const { pool } = require('../database/init');

// ============================================
// FUNCTION: Calculate Win Probability (ELO-based)
// ============================================
async function calculateWinProbability(homeTeamId, awayTeamId) {
  try {
    // Get team data
    const homeRes = await pool.query('SELECT elo_rating FROM teams WHERE id = $1', [homeTeamId]);
    const awayRes = await pool.query('SELECT elo_rating FROM teams WHERE id = $1', [awayTeamId]);

    if (homeRes.rows.length === 0 || awayRes.rows.length === 0) {
      throw new Error('Team not found');
    }

    const homeElo = homeRes.rows[0].elo_rating || 1500;
    const awayElo = awayRes.rows[0].elo_rating || 1500;

    // ELO Probability Formula
    // P(Home) = 1 / (1 + 10^((AwayElo - HomeElo) / 400))
    const eloDifference = awayElo - homeElo;
    const homeWinProb = 1 / (1 + Math.pow(10, eloDifference / 400));
    const drawProb = 0.25; // Simplified: 25% chance of draw
    const awayWinProb = 1 - homeWinProb - drawProb;

    // Home Advantage Boost (+3%)
    const homeBoost = 0.03;
    const adjustedHomeWin = Math.min(homeWinProb + homeBoost, 0.95);
    const adjustedAwayWin = Math.max(awayWinProb - homeBoost, 0.05);
    const adjustedDraw = 1 - adjustedHomeWin - adjustedAwayWin;

    return {
      homeWinProb: parseFloat((adjustedHomeWin * 100).toFixed(2)),
      drawProb: parseFloat((adjustedDraw * 100).toFixed(2)),
      awayWinProb: parseFloat((adjustedAwayWin * 100).toFixed(2)),
      homeElo,
      awayElo,
      eloDifference
    };
  } catch (error) {
    console.error('Win probability error:', error.message);
    return null;
  }
}

// ============================================
// FUNCTION: Calculate Over/Under 2.5 Goals
// ============================================
async function calculateOverUnder2_5(homeTeamId, awayTeamId) {
  try {
    // Get team goal statistics
    const homeRes = await pool.query(
      `SELECT 
        COUNT(*) as total_matches,
        AVG(home_goals) as avg_goals_for,
        AVG(away_goals) as avg_goals_against
       FROM matches 
       WHERE home_team_id = $1 AND home_goals IS NOT NULL`,
      [homeTeamId]
    );

    const awayRes = await pool.query(
      `SELECT 
        COUNT(*) as total_matches,
        AVG(away_goals) as avg_goals_for,
        AVG(home_goals) as avg_goals_against
       FROM matches 
       WHERE away_team_id = $1 AND away_goals IS NOT NULL`,
      [awayTeamId]
    );

    const homeStats = homeRes.rows[0];
    const awayStats = awayRes.rows[0];

    // Default values if no history
    const homeGoalsFor = parseFloat(homeStats.avg_goals_for) || 1.5;
    const homeGoalsAgainst = parseFloat(homeStats.avg_goals_against) || 1.2;
    const awayGoalsFor = parseFloat(awayStats.avg_goals_for) || 1.2;
    const awayGoalsAgainst = parseFloat(awayStats.avg_goals_against) || 1.4;

    // Predict total goals
    // Home team expected goals at home: avg_for * (1 + 0.1) = home advantage
    // Away team expected goals away: avg_for * (1 - 0.1) = away disadvantage
    const expectedHomeGoals = homeGoalsFor * 1.1;
    const expectedAwayGoals = awayGoalsFor * 0.9;
    const expectedTotalGoals = expectedHomeGoals + expectedAwayGoals;

    // Over/Under 2.5 probability (Poisson distribution approximation)
    // Simple model: if expected < 2.5 then Under likely, else Over likely
    const overProb = Math.min(expectedTotalGoals / 3.5 * 100, 95);
    const underProb = 100 - overProb;

    return {
      overProb: parseFloat(overProb.toFixed(2)),
      underProb: parseFloat(underProb.toFixed(2)),
      expectedTotalGoals: parseFloat(expectedTotalGoals.toFixed(2)),
      expectedHomeGoals: parseFloat(expectedHomeGoals.toFixed(2)),
      expectedAwayGoals: parseFloat(expectedAwayGoals.toFixed(2)),
      homeMatchHistory: homeStats.total_matches,
      awayMatchHistory: awayStats.total_matches
    };
  } catch (error) {
    console.error('Over/Under calculation error:', error.message);
    return null;
  }
}

// ============================================
// FUNCTION: Calculate ALL Predictions for Match
// ============================================
async function calculateAllPredictions(homeTeamId, awayTeamId, matchId = null) {
  try {
    const winProb = await calculateWinProbability(homeTeamId, awayTeamId);
    const overUnder = await calculateOverUnder2_5(homeTeamId, awayTeamId);

    if (!winProb || !overUnder) {
      throw new Error('Failed to calculate predictions');
    }

    const predictions = {
      match_id: matchId,
      timestamp: new Date().toISOString(),
      predictions: {
        win_probability: winProb,
        over_under_2_5: overUnder
      },
      recommendation: generateRecommendation(winProb, overUnder)
    };

    return predictions;
  } catch (error) {
    console.error('All predictions error:', error.message);
    return null;
  }
}

// ============================================
// FUNCTION: Generate Trading Recommendation
// ============================================
function generateRecommendation(winProb, overUnder) {
  const recommendations = [];

  // Win Probability Recommendations
  if (winProb.homeWinProb > 60) {
    recommendations.push({
      type: 'HOME_WIN',
      confidence: winProb.homeWinProb,
      odds_needed: calculateOddsNeeded(winProb.homeWinProb / 100),
      value: 'Strong'
    });
  }

  if (winProb.awayWinProb > 60) {
    recommendations.push({
      type: 'AWAY_WIN',
      confidence: winProb.awayWinProb,
      odds_needed: calculateOddsNeeded(winProb.awayWinProb / 100),
      value: 'Strong'
    });
  }

  if (winProb.drawProb > 30) {
    recommendations.push({
      type: 'DRAW',
      confidence: winProb.drawProb,
      odds_needed: calculateOddsNeeded(winProb.drawProb / 100),
      value: 'Moderate'
    });
  }

  // Over/Under Recommendations
  if (overUnder.overProb > 65) {
    recommendations.push({
      type: 'OVER_2_5',
      confidence: overUnder.overProb,
      odds_needed: calculateOddsNeeded(overUnder.overProb / 100),
      value: 'Strong'
    });
  }

  if (overUnder.underProb > 65) {
    recommendations.push({
      type: 'UNDER_2_5',
      confidence: overUnder.underProb,
      odds_needed: calculateOddsNeeded(overUnder.underProb / 100),
      value: 'Strong'
    });
  }

  return recommendations;
}

// ============================================
// HELPER: Calculate Minimum Odds for +5% Value
// ============================================
function calculateOddsNeeded(probability) {
  // For +5% value: Odds needed = (1 + 0.05) / probability
  // Example: If prob = 0.55 (55%), need odds of 1.91 for +5% value
  const oddsForValue = 1.05 / probability;
  return parseFloat(oddsForValue.toFixed(2));
}

// ============================================
// Export
// ============================================
module.exports = {
  calculateWinProbability,
  calculateOverUnder2_5,
  calculateAllPredictions,
  generateRecommendation
};
