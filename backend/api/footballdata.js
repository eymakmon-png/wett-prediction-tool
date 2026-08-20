// backend/api/footballdata.js
// ============================================
// FOOTBALL-DATA.ORG INTEGRATION
// Lädt ECHTE Matches in die Datenbank
// ============================================

const axios = require('axios');
const { pool } = require('../database/init');

const FOOTBALL_DATA_API = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// ============================================
// FUNCTION: Lade alle Teams
// ============================================
async function syncTeams(leagueCode = 'PL') {
  try {
    console.log(`🔄 Loading teams from ${leagueCode}...`);
    
    const response = await axios.get(`${FOOTBALL_DATA_API}/competitions/${leagueCode}/standings`, {
      headers: { 'X-Auth-Token': API_KEY }
    });

    const standings = response.data.standings[0]; // Regular Season
    
    for (const team of standings.table) {
      await pool.query(
        `INSERT INTO teams (name, short_name, league, elo_rating, points_for_season)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET points_for_season = $5`,
        [
          team.team.name,
          team.team.shortName,
          leagueCode,
          1500, // Standard Elo
          team.points
        ]
      );
    }
    
    console.log(`✓ Teams synced for ${leagueCode}!`);
    return true;
  } catch (error) {
    console.error('✗ Team sync error:', error.message);
    return false;
  }
}

// ============================================
// FUNCTION: Lade alle kommenden Matches
// ============================================
async function syncMatches(leagueCode = 'PL', days = 7) {
  try {
    console.log(`🔄 Loading matches from ${leagueCode}...`);
    
    const response = await axios.get(
      `${FOOTBALL_DATA_API}/competitions/${leagueCode}/matches?status=SCHEDULED`,
      {
        headers: { 'X-Auth-Token': API_KEY }
      }
    );

    const matches = response.data.matches;
    let count = 0;

    for (const match of matches) {
      // Finde Team IDs
      const homeTeamRes = await pool.query(
        'SELECT id FROM teams WHERE name = $1',
        [match.homeTeam.name]
      );
      const awayTeamRes = await pool.query(
        'SELECT id FROM teams WHERE name = $1',
        [match.awayTeam.name]
      );

      if (homeTeamRes.rows.length === 0 || awayTeamRes.rows.length === 0) {
        console.log(`⚠ Teams not found for ${match.homeTeam.name} vs ${match.awayTeam.name}`);
        continue;
      }

      const homeTeamId = homeTeamRes.rows[0].id;
      const awayTeamId = awayTeamRes.rows[0].id;

      // Speichere Match
      await pool.query(
        `INSERT INTO matches 
         (match_id, season, round, competition, home_team_id, away_team_id, kick_off, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (match_id) DO NOTHING`,
        [
          match.id,
          match.season,
          match.utcDate ? new Date(match.utcDate).getTime() / 1000 : null,
          leagueCode,
          homeTeamId,
          awayTeamId,
          match.utcDate,
          match.status
        ]
      );

      count++;
    }

    console.log(`✓ ${count} matches synced for ${leagueCode}!`);
    return true;
  } catch (error) {
    console.error('✗ Match sync error:', error.message);
    return false;
  }
}

// ============================================
// FUNCTION: Lade abgelaufene Matches mit Ergebnissen
// ============================================
async function syncFinishedMatches(leagueCode = 'PL') {
  try {
    console.log(`🔄 Loading finished matches from ${leagueCode}...`);
    
    const response = await axios.get(
      `${FOOTBALL_DATA_API}/competitions/${leagueCode}/matches?status=FINISHED`,
      {
        headers: { 'X-Auth-Token': API_KEY }
      }
    );

    const matches = response.data.matches;
    let count = 0;

    for (const match of matches) {
      const homeTeamRes = await pool.query(
        'SELECT id FROM teams WHERE name = $1',
        [match.homeTeam.name]
      );
      const awayTeamRes = await pool.query(
        'SELECT id FROM teams WHERE name = $1',
        [match.awayTeam.name]
      );

      if (homeTeamRes.rows.length === 0 || awayTeamRes.rows.length === 0) {
        continue;
      }

      const homeTeamId = homeTeamRes.rows[0].id;
      const awayTeamId = awayTeamRes.rows[0].id;

      // Speichere Match mit Ergebnissen
      await pool.query(
        `INSERT INTO matches 
         (match_id, season, round, competition, home_team_id, away_team_id, kick_off, 
          status, home_goals, away_goals)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (match_id) DO UPDATE SET 
         home_goals = $9, away_goals = $10, status = $8`,
        [
          match.id,
          match.season,
          match.utcDate ? new Date(match.utcDate).getTime() / 1000 : null,
          leagueCode,
          homeTeamId,
          awayTeamId,
          match.utcDate,
          match.status,
          match.score.fullTime.home,
          match.score.fullTime.away
        ]
      );

      count++;
    }

    console.log(`✓ ${count} finished matches synced!`);
    return true;
  } catch (error) {
    console.error('✗ Finished match sync error:', error.message);
    return false;
  }
}

// ============================================
// FUNCTION: Full Sync (Teams + Matches)
// ============================================
async function fullSync(leagues = ['PL', 'BL1']) {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 FULL SYNC - Football-data.org     ║');
    console.log('╚════════════════════════════════════════╝\n');

    for (const league of leagues) {
      console.log(`\n⚽ Processing league: ${league}`);
      await syncTeams(league);
      await syncMatches(league);
      await syncFinishedMatches(league);
    }

    console.log('\n✓ FULL SYNC COMPLETED!\n');
    return true;
  } catch (error) {
    console.error('✗ Full sync error:', error.message);
    return false;
  }
}

// Export
module.exports = {
  syncTeams,
  syncMatches,
  syncFinishedMatches,
  fullSync,
  FOOTBALL_DATA_API,
  API_KEY
};
