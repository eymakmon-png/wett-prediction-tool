// ============================================
// SAVE PREDICTIONS SERVICE
// Speichert berechnete Predictions in DB
// ============================================
const { pool } = require('../database/init');

async function savePredictions(matchId, homeTeamId, awayTeamId, predictions) {
  try {
    if (!matchId || !predictions || !predictions.predictions) {
      console.log(`⚠ savePredictions: Missing data - matchId=${matchId}, predictions=${!!predictions}, predictions.predictions=${!!predictions?.predictions}`);
      return false;
    }

    const { home_win_prob, draw_prob, away_win_prob, over_2_5_prob } = predictions.predictions;

    console.log(`  💾 Saving match ${matchId}: H=${home_win_prob?.toFixed(2)} D=${draw_prob?.toFixed(2)} A=${away_win_prob?.toFixed(2)} O=${over_2_5_prob?.toFixed(2)}`);

    // Insert or update prediction
    const result = await pool.query(
      `INSERT INTO predictions 
       (match_id, home_win_prob, draw_prob, away_win_prob, over_2_5_prob, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (match_id) 
       DO UPDATE SET
         home_win_prob = $2,
         draw_prob = $3,
         away_win_prob = $4,
         over_2_5_prob = $5,
         updated_at = NOW()
       RETURNING id`,
      [matchId, home_win_prob, draw_prob, away_win_prob, over_2_5_prob]
    );

    if (result.rows.length > 0) {
      console.log(`    ✓ Saved!`);
      return true;
    } else {
      console.log(`    ✗ No rows returned`);
      return false;
    }
  } catch (error) {
    console.error(`  ✗ Error saving prediction for match ${matchId}:`, error.message);
    return false;
  }
}

module.exports = {
  savePredictions
};
