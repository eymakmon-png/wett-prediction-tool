// ============================================
// PERFORMANCE RECORDER - v2
// Lädt FINISHED Matches & speichert Performance
// Nur noch Vorhersagen, die noch NICHT aufgezeichnet wurden
// ============================================
const { pool } = require('../database/init');
const { recordMatchResult } = require('./performanceTracker');

async function recordAllFinishedMatches() {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 PERFORMANCE RECORDER START        ║');
    console.log('╚════════════════════════════════════════╝');

    // Vorhersagen für beendete Spiele, die noch KEINEN performance_log-Eintrag haben
    const matchesRes = await pool.query(
      `SELECT
        m.id,
        m.match_id,
        m.home_goals,
        m.away_goals,
        m.status,
        pred.id AS prediction_id,
        pred.home_win_prob,
        pred.draw_prob,
        pred.away_win_prob,
        pred.over_2_5_prob
       FROM matches m
       JOIN predictions pred ON m.id = pred.match_id
       WHERE m.status = 'FINISHED'
       AND NOT EXISTS (
         SELECT 1 FROM performance_log pl WHERE pl.prediction_id = pred.id
       )
       LIMIT 50`
    );

    const matches = matchesRes.rows;
    console.log(`📊 Matches to record: ${matches.length}\n`);

    if (matches.length === 0) {
      console.log('⚠ No new matches to record');
      return false;
    }

    let recordedCount = 0;
    let errorCount = 0;

    for (const match of matches) {
      try {
        console.log(`  🔄 Recording match ${match.match_id}...`);

        const probs = {
          HOME: match.home_win_prob,
          DRAW: match.draw_prob,
          AWAY: match.away_win_prob
        };

        const predictedWinner = Object.keys(probs).reduce((a, b) =>
          probs[a] > probs[b] ? a : b
        );

        const predictedOver25 = match.over_2_5_prob > 0.5;

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
