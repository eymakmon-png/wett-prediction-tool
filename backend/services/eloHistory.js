// ============================================
// ELO-HISTORIE
// Berechnet ELO pro Team in zeitlicher Reihenfolge.
// Speichert Wert VOR und NACH jedem beendeten Spiel.
// Schreibt nur in team_elo_history (abgeleitete Daten).
// ============================================
const { pool } = require('../database/init');

const K = 20;
const START = 1500;

async function ensureEloTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_elo_history (
      match_id INTEGER NOT NULL REFERENCES matches(id),
      team_id INTEGER NOT NULL REFERENCES teams(id),
      elo_before FLOAT NOT NULL,
      elo_after FLOAT NOT NULL,
      PRIMARY KEY (match_id, team_id)
    )
  `);
}

async function rebuildEloHistory() {
  await ensureEloTable();

  const res = await pool.query(
    `SELECT id, home_team_id, away_team_id, home_goals, away_goals
     FROM matches
     WHERE status = 'FINISHED'
       AND home_goals IS NOT NULL
       AND away_goals IS NOT NULL
     ORDER BY kick_off ASC, id ASC`
  );

  const elo = new Map();
  const get = teamId => (elo.has(teamId) ? elo.get(teamId) : START);
  const rows = [];

  for (const m of res.rows) {
    const h = get(m.home_team_id);
    const a = get(m.away_team_id);

    const expHome = 1 / (1 + Math.pow(10, (a - h) / 400));
    const s = m.home_goals > m.away_goals ? 1 : m.home_goals === m.away_goals ? 0.5 : 0;

    const hAfter = h + K * (s - expHome);
    const aAfter = a + K * ((1 - s) - (1 - expHome));

    elo.set(m.home_team_id, hAfter);
    elo.set(m.away_team_id, aAfter);

    rows.push([m.id, m.home_team_id, h, hAfter]);
    rows.push([m.id, m.away_team_id, a, aAfter]);
  }

  // Abgeleitete Tabelle komplett neu füllen (idempotent, beliebig oft ausführbar)
  await pool.query('TRUNCATE team_elo_history');

  for (const [matchId, teamId, before, after] of rows) {
    await pool.query(
      `INSERT INTO team_elo_history (match_id, team_id, elo_before, elo_after)
       VALUES ($1, $2, $3, $4)`,
      [matchId, teamId, before, after]
    );
  }

  return {
    spiele: res.rows.length,
    zeilen: rows.length,
    teams_mit_elo: elo.size
  };
}

module.exports = { rebuildEloHistory };
