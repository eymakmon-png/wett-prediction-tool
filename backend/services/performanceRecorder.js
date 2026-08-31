// ============================================
// PERFORMANCE RECORDER - DEBUG
// Lädt FINISHED Matches & speichert Performance
// ============================================
const { pool } = require('../database/init');
const { recordMatchResult } = require('./performanceTracker');

async function recordAllFinishedMatches() {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 PERFORMANCE RECORDER START        ║');
    console.log('╚════════════════════════════════════════╝');
    
    // Check predictions table
    const predCheck = await pool.query('SELECT COUNT(*) as count FROM predictions');
    console.log(`\n📊 Predictions in DB: ${predCheck.rows[0].count}`);
    
    // Check finished matches
    const finishedCheck = await pool.query('SELECT COUNT(*) as count FROM matches WHERE status = \'FINISHED\'');
    console.log(`📊 Finished matches in DB: ${finishedCheck.rows[0].count}`);
    
    // Debug: Show sample of predictions and finished matches
    const predSample = await pool.query('SELECT id, match_id FROM predictions LIMIT 3');
    const finishedSample = await pool.query('SELECT id FROM matches WHERE status = \'FINISHED\' LIMIT 3');
    
    console.log('\n🔍 Sample predictions:');
    predSample.rows.forEach(p => console.log(`  - pred.id=${p.id}, pred.match_id=${p.match_id}`));
    
    console.log('🔍 Sample finished matches:');
    const finishedSampleWithMatchId = await pool.query('SELECT id, match_id FROM matches WHERE status = \'FINISHED\' LIMIT 3');
    finishedSampleWithMatchId.rows.forEach(m => console.log(`  - match.id=${m.id}, match.match_id=${m.match_id}`));
    
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
       JOIN predictions pred ON m.match_id = pred.match_id
       LEFT JOIN performance_log pl ON pred.id = pl.prediction_id
       WHERE m.status = 'FINISHED'
       AND pl.id IS NULL
       LIMIT 50`
    );
    
    const matches = matchesRes.rows;
    console.log(`📊 Matches to record: ${matches.length}\n`);
    
    if (matches.length === 0) {
      console.log('⚠ No matches found to record!');
      return false;
    }
    
    let recordedCount = 0;
    let errorCount = 0;
    
    for (const match of matches) {
      try {
        console.log(`  🔄 Recording match ${match.match_id}...`);
        
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
        console.log(`    ✓ Recorded!`);
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
