// ============================================
// SAVE PREDICTIONS SERVICE - v2
// Speichert Vorhersagen VOR dem Anpfiff.
// Nach dem Anpfiff werden keine Vorhersagen mehr geändert.
// Bestehende Zeilen werden aktualisiert (id bleibt stabil).
// ============================================
const { pool } = require('../database/init');

async function savePredictions(matchId, homeTeamId, awayTeamId, predictions) {
  try {
    if (!matchId || !predictions || !predictions.predictions) {
      console.log(`⚠ savePredictions: Missing data - matchId=${matchId}`);
      return false;
    }

    // Anpfiff und Status des Spiels prüfen
    const matchRes = await pool.query(
      'SELECT kick_off, status FROM matches WHERE id = $1',
      [matchId]
    );

    if (matchRes.rows.length === 0) {
      console.log(`⚠ savePredictions: Match ${matchId} nicht gefunden`);
      return false;
    }

    const { kick_off, status } = matchRes.rows[0];

    // Sperre: Ab Anpfiff (oder bei beendeten Spielen) keine Änderungen mehr
    if (status !== 'SCHEDULED' || new Date(kick_off) <= new Date()) {
      console.log(`  ⏭ Match ${matchId}: bereits angepfiffen oder beendet, keine Änderung`);
      return false;
    }

    const { home_win_prob, draw_prob, away_win_prob, over_2_5_prob } = predictions.predictions;

    // Vorhandene Zeile aktualisieren (neueste), sonst neu anlegen
    const updateRes = await pool.query(
      `UPDATE predictions
       SET home_win_prob = $2,
           draw_prob = $3,
           away_win_prob = $4,
           over_2_5_prob = $5,
           updated_at = NOW()
       WHERE id = (
         SELECT id FROM predictions WHERE match_id = $1 ORDER BY id DESC LIMIT 1
       )
       RETURNING id`,
      [matchId, home_win_prob, draw_prob, away_win_prob, over_2_5_prob]
    );

    if (updateRes.rows.length > 0) {
      console.log(`    ✓ Aktualisiert (id=${updateRes.rows[0].id})`);
      return true;
    }

    const insertRes = await pool.query(
      `INSERT INTO predictions
       (match_id, home_team_id, away_team_id, match_date, home_win_prob, draw_prob, away_win_prob, over_2_5_prob, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id`,
      [matchId, homeTeamId, awayTeamId, kick_off, home_win_prob, draw_prob, away_win_prob, over_2_5_prob]
    );

    if (insertRes.rows.length > 0) {
      console.log(`    ✓ Neu angelegt (id=${insertRes.rows[0].id})`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`  ✗ Error saving prediction for match ${matchId}:`, error.message);
    return false;
  }
}

module.exports = {
  savePredictions
};
