// ============================================
// LINEUP SYNC
// Speichert Startelf-Aufstellungen beendeter Spiele
// Nur Lesen von der API, Schreiben in match_lineups
// ============================================
const axios = require('axios');
const { pool } = require('../database/init');

const API = 'https://api.football-data.org/v4';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Tabelle anlegen (falls noch nicht vorhanden)
async function ensureLineupTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_lineups (
      match_id INTEGER NOT NULL REFERENCES matches(id),
      team_id INTEGER NOT NULL REFERENCES teams(id),
      player_api_id INTEGER NOT NULL,
      player_name VARCHAR(255),
      PRIMARY KEY (match_id, player_api_id)
    )
  `);
}

// Holt Startelfen für beendete Spiele, die noch keine Aufstellung haben
async function syncLineupsForFinishedMatches(limit = 20) {
  await ensureLineupTable();
  const key = process.env.FOOTBALL_DATA_API_KEY;

  const todo = await pool.query(
    `SELECT m.id, m.match_id, m.home_team_id, m.away_team_id
     FROM matches m
     WHERE m.status = 'FINISHED'
       AND NOT EXISTS (SELECT 1 FROM match_lineups l WHERE l.match_id = m.id)
     ORDER BY m.kick_off DESC
     LIMIT $1`,
    [limit]
  );

  let gespeichert = 0;
  let fehlgeschlagen = 0;

  for (const m of todo.rows) {
    try {
      await sleep(1200); // Pause, damit das Anfragelimit nicht erreicht wird
      const res = await axios.get(`${API}/matches/${m.match_id}`, {
        headers: { 'X-Auth-Token': key, 'X-Unfold-Lineups': 'true' },
        timeout: 20000
      });

      const seiten = [
        [res.data.homeTeam, m.home_team_id],
        [res.data.awayTeam, m.away_team_id]
      ];

      let anzahl = 0;
      for (const [team, teamId] of seiten) {
        for (const p of (team?.lineup || [])) {
          await pool.query(
            `INSERT INTO match_lineups (match_id, team_id, player_api_id, player_name)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [m.id, teamId, p.id, p.name]
          );
          anzahl++;
        }
      }

      if (anzahl > 0) gespeichert++;
      else fehlgeschlagen++;
    } catch (e) {
      fehlgeschlagen++;
      console.error(`Lineup-Fehler Spiel ${m.match_id}:`, e.message);
    }
  }

  return { geprueft: todo.rows.length, gespeichert, fehlgeschlagen };
}

module.exports = { syncLineupsForFinishedMatches };
