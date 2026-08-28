// ============================================
// PERFORMANCE TRACKER
// Speichert & Berechnet Prediction Accuracy
// ============================================
const { pool } = require('../database/init');

// Record match result & calculate accuracy
async function recordMatchResult(matchId, homeGoals, awayGoals, predictedWinner, predictedOver25) {
  try {
    // Get prediction from predictions table
    const predRes = await pool.query(
      `SELECT id, home_win_prob, draw_prob, away_win_prob, over_2_5_prob
       FROM predictions
       WHERE match_id = $1`,
      [matchId]
    );
    
    if (predRes.rows.length === 0) {
      console.warn(`  ⚠ No prediction found for match ${matchId}`);
      return null;
    }
    
    const prediction = predRes.rows[0];
    
    // Determine actual result
    let actualResult = 'DRAW';
    if (homeGoals > awayGoals) actualResult = 'HOME_WIN';
    if (homeGoals < awayGoals) actualResult = 'AWAY_WIN';
    
    // Determine if Over/Under 2.5
    const totalGoals = homeGoals + awayGoals;
    const actualOver25 = totalGoals > 2.5;
    
    // Calculate prediction accuracy
    let predictionCorrect = false;
    let accuracyScore = 0;
    
    // Check winner prediction
    if (actualResult === 'HOME_WIN' && predictedWinner === 'HOME') {
      predictionCorrect = true;
      accuracyScore += prediction.home_win_prob;
    } else if (actualResult === 'AWAY_WIN' && predictedWinner === 'AWAY') {
      predictionCorrect = true;
      accuracyScore += prediction.away_win_prob;
    } else if (actualResult === 'DRAW' && predictedWinner === 'DRAW') {
      predictionCorrect = true;
      accuracyScore += prediction.draw_prob;
    }
    
    // Check over/under prediction
    if (actualOver25 === predictedOver25) {
      accuracyScore += prediction.over_2_5_prob / 2;
    }
    
    // Estimate profit/loss (simplified)
    const profitLoss = predictionCorrect ? 10 : -10;
    
    // Save to performance_log
    const result = await pool.query(
      `INSERT INTO performance_log 
       (prediction_id, match_result, actual_home_goals, actual_away_goals, prediction_correct, profit_loss)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [prediction.id, actualResult, homeGoals, awayGoals, predictionCorrect, profitLoss]
    );
    
    console.log(`✓ Match ${matchId}: Recorded - Correct: ${predictionCorrect}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error recording match result:', error.message);
    return null;
  }
}

// Get last 10 days performance
async function getLast10DaysPerformance() {
  try {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_predictions,
        SUM(CASE WHEN prediction_correct THEN 1 ELSE 0 END) as correct_predictions,
        SUM(profit_loss) as total_profit_loss,
        AVG(CASE WHEN prediction_correct THEN 1 ELSE 0 END) * 100 as accuracy_percent
       FROM performance_log
       WHERE created_at >= $1`,
      [tenDaysAgo]
    );
    
    return result.rows[0] || { total_predictions: 0, correct_predictions: 0, total_profit_loss: 0, accuracy_percent: 0 };
  } catch (error) {
    console.error('Error getting last 10 days performance:', error.message);
    return null;
  }
}

// Get last N matches performance
async function getLastMatchesPerformance(limit = 10) {
  try {
    const
