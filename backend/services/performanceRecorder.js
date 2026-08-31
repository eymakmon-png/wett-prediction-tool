// ============================================
// PERFORMANCE RECORDER
// Lädt FINISHED Matches & speichert Performance
// ============================================
const { pool } = require('../database/init');
const { recordMatchResult } = require('./performanceTracker');

async function recordAllFinishedMatches() {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 PERFORMANCE RECORDER START        ║');
    console.log('╚════════════════════════════════════════╝');
    
    // Get all FINISHED matches with predictions but WITHOUT performance_log entry
    const matchesRes = await pool.query(
      `SELECT 
        m.id, 
        m.match_id, 
        m.home_goals, 
        m.away_goals, 
        m.status,
        pred.id as prediction_id,
        pred.home_win_prob,
        pred.draw_prob,
        pred.away_win_prob,
        pred.over_2_5_prob
       FROM matches m
       JOIN predictions pred ON m.id = pred.match_id
       LEFT JOIN performance_log pl ON pred.id = pl.prediction_id
       WHERE m.status = 'FINISHED'
       AND pl.id IS NULL
       ORDER BY m.kick_off DESC
       LIMIT 50`
    );
    
    const matches = matchesRes.rows;
    console.log(`\n📊 Found ${matches.length} finished matches to record\n`);
    
    let recordedCount = 0;
    let errorCount = 0;
    
    for (const match of matches) {
      try {
        // Determine predicted winner (highest probability)
        const probs = {
          HOME: match.home_win_prob,
          DRAW: match.draw_prob,
          AWAY: match.away_win_prob
        };
        
        const predictedWinner = Object.keys(probs).reduce((a, b) => 
          probs[a] > probs[b] ? a : b
        );
        
        // Determine predicted over/under
        const predictedOver25 = match.over_2_5_prob > 0.5;
        
        // Record the result
        await recordMatchResult(
          match.id,
          match.home_goals,
          match.away_goals,
          predictedWinner,
          predictedOver25
        );
        
        recordedCount++;
      } catch (err) {
        console.error(`   ✗ Error for match ${match.match_id}:`, err.message);
        errorCount++;
      }
    }
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 RECORDER SUMMARY                  ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`✓ Recorded: ${recordedCount}/${matches.length}`);
    console.log(`✗ Errors: ${errorCount}\n`);
    
    return recordedCount > 0;
  } catch (error) {
    console.error('\n✗ CRITICAL ERROR:', error.message);
    return false;
  }
}

module.exports = {
  recordAllFinishedMatches
};
