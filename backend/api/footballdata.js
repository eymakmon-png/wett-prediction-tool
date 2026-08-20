// backend/api/footballdata.js
// ============================================
// FOOTBALL-DATA.ORG INTEGRATION - FIXED VERSION
// Lädt ECHTE Matches in die Datenbank
// ============================================

const axios = require('axios');
const { pool } = require('../database/init');

const FOOTBALL_DATA_API = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// Helper: Rate Limit beachten
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// FUNCTION: Lade alle Teams
// ============================================
async function syncTeams(leagueCode = 'BL1') {
  try {
    console.log(`\n🔄 [${leagueCode}] Loading teams...`);
    
    const response = await axios.get(
      `${FOOTBALL_DATA_API}/competitions/${leagueCode}/standings`,
      {
        headers: { 'X-Auth-Token': API_KEY },
        timeout: 10000
      }
    );

    if (!response.data.standings || response.data.standings.length === 0) {
      throw new Error('No standings data returned from API');
    }

    const standings = response.data.standings[0]; // Regular Season
    const teams = standings.table;

    if (!teams || teams.length === 0) {
      throw new Error('No teams in standings data');
    }

    let insertedCount = 0;
    let updatedCount = 0;

    for (const team of teams) {
      try {
        const result = await pool.query(
          `INSERT INTO teams (name, short_name, league, elo_rating, points_for_season)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (name) DO UPDATE SET points_for_season = $5
           RETURNING id`,
          [
            team.team.name,
            team.team.shortName || team.team.name.substring(0, 10),
            leagueCode,
            1500, // Standard Elo
            team.points
          ]
        );

        if (result.rows.length > 0) {
          const teamId = result.rows[0].id;
          console.log(`   ✓ Team: ${team.team.name} (ID: ${teamId})`);
          insertedCount++;
        }
      } catch (err) {
        console.warn(`   ⚠ Failed to insert ${team.team.name}:`, err.message);
      }
    }

    console.log(`✓ Teams synced for ${leagueCode}: ${insertedCount} processed`);
    return true;

  } catch (error) {
    console.error(`✗ [${leagueCode}] Team sync error:`, {
      message: error.message,
      response: error.response?.data?.message || 'No API response',
      status: error.response?.status
    });
    return false;
  }
}

// ============================================
// FUNCTION: Lade alle kommenden Matches
// ============================================
async function syncMatches(leagueCode = 'BL1', status = 'SCHEDULED') {
  try {
    console.log(`\n🔄 [${leagueCode}] Loading ${status} matches...`);
    
    const response = await axios.get(
      `${FOOTBALL_DATA_API}/competitions/${leagueCode}/matches?status=${status}`,
      {
        headers: { 'X-Auth-Token': API_KEY },
        timeout: 10000
      }
    );

    if (!response.data.matches) {
      throw new Error('No matches data in API response');
    }

    const matches = response.data.matches;
    console.log(`   📊 Found ${matches.length} ${status} matches from API`);

    if (matches.length === 0) {
      console.log(`   ℹ No ${status} matches to sync`);
      return true;
    }

    // FIX #1: Lade ALLE Teams vorab (statt N+1 Queries)
    const teamsRes = await pool.query(
      'SELECT id, name FROM teams WHERE league = $1',
      [leagueCode]
    );

    const teamMap = new Map(teamsRes.rows.map(t => [t.name, t.id]));
    console.log(`   🔍 Found ${teamMap.size} teams in database for ${leagueCode}`);

    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const match of matches) {
      try {
        const homeTeamId = teamMap.get(match.homeTeam.name);
        const awayTeamId = teamMap.get(match.awayTeam.name);

        // Wenn Teams nicht gefunden: Skip
        if (!homeTeamId || !awayTeamId) {
          console.warn(`   ⚠ Teams not found: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
          skippedCount++;
          continue;
        }

        // FIX #2: Speichere korrekten round-Wert (Spielrunde, nicht Timestamp!)
        // Wenn match.round nicht existiert, speichere NULL
        const round = match.matchday || match.round || null;

        const kickOffDate = match.utcDate ? new Date(match.utcDate) : null;

        // Speichere Match mit korrekten Werten
        const result = await pool.query(
          `INSERT INTO matches 
           (match_id, season, round, competition, home_team_id, away_team_id, kick_off, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (match_id) DO UPDATE SET 
             status = $8,
             kick_off = $7
           RETURNING id`,
          [
            match.id,                    // match_id (string von API)
            match.season,                // season (z.B. 2024)
            round,                       // round (Spielrunde, nicht Timestamp!) - FIX
            leagueCode,                  // competition
            homeTeamId,                  // home_team_id
            awayTeamId,                  // away_team_id
            kickOffDate,                 // kick_off (TIMESTAMP, nicht Unix!)
            match.status                 // status (SCHEDULED, LIVE, FINISHED, etc.)
          ]
        );

        if (result.rows.length > 0) {
          const matchId = result.rows[0].id;
          console.log(`   ✓ Match ${matchId}: ${match.homeTeam.name} vs ${match.awayTeam.name} on ${kickOffDate?.toISOString()?.split('T')[0]}`);
          insertedCount++;
        }

      } catch (err) {
        console.error(`   ✗ Failed to insert match ${match.id}:`, err.message);
        errorCount++;
      }
    }

    console.log(`✓ ${status} matches synced for ${leagueCode}: ${insertedCount} inserted, ${skippedCount} skipped, ${errorCount} errors`);
    return errorCount === 0;

  } catch (error) {
    console.error(`✗ [${leagueCode}] Match sync error (${status}):`, {
      message: error.message,
      response: error.response?.data?.message || 'No API response',
      status: error.response?.status
    });
    return false;
  }
}

// ============================================
// FUNCTION: Lade abgelaufene Matches mit Ergebnissen
// ============================================
async function syncFinishedMatches(leagueCode = 'BL1') {
  try {
    console.log(`\n🔄 [${leagueCode}] Loading FINISHED matches with results...`);
    
    const response = await axios.get(
      `${FOOTBALL_DATA_API}/competitions/${leagueCode}/matches?status=FINISHED`,
      {
        headers: { 'X-Auth-Token': API_KEY },
        timeout: 10000
      }
    );

    if (!response.data.matches) {
      throw new Error('No matches data in API response');
    }

    const matches = response.data.matches;
    console.log(`   📊 Found ${matches.length} finished matches from API`);

    if (matches.length === 0) {
      console.log(`   ℹ No finished matches to sync`);
      return true;
    }

    // Lade ALLE Teams vorab
    const teamsRes = await pool.query(
      'SELECT id, name FROM teams WHERE league = $1',
      [leagueCode]
    );

    const teamMap = new Map(teamsRes.rows.map(t => [t.name, t.id]));

    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const match of matches) {
      try {
        const homeTeamId = teamMap.get(match.homeTeam.name);
        const awayTeamId = teamMap.get(match.awayTeam.name);

        if (!homeTeamId || !awayTeamId) {
          skippedCount++;
          continue;
        }

        const round = match.matchday || match.round || null;
        const kickOffDate = match.utcDate ? new Date(match.utcDate) : null;

        // Speichere Match mit Ergebnissen
        const homeGoals = match.score?.fullTime?.home;
        const awayGoals = match.score?.fullTime?.away;

        if (homeGoals === null || homeGoals === undefined || awayGoals === null || awayGoals === undefined) {
          console.warn(`   ⚠ No full-time score for match ${match.id}`);
          skippedCount++;
          continue;
        }

        const result = await pool.query(
          `INSERT INTO matches 
           (match_id, season, round, competition, home_team_id, away_team_id, kick_off, 
            status, home_goals, away_goals)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (match_id) DO UPDATE SET 
             home_goals = $9, 
             away_goals = $10, 
             status = $8
           RETURNING id`,
          [
            match.id,
            match.season,
            round,
            leagueCode,
            homeTeamId,
            awayTeamId,
            kickOffDate,
            match.status,
            homeGoals,
            awayGoals
          ]
        );

        if (result.rows.length > 0) {
          console.log(`   ✓ Result: ${match.homeTeam.name} ${homeGoals}:${awayGoals} ${match.awayTeam.name}`);
          insertedCount++;
        }

      } catch (err) {
        console.error(`   ✗ Failed to insert finished match ${match.id}:`, err.message);
        errorCount++;
      }
    }

    console.log(`✓ Finished matches synced for ${leagueCode}: ${insertedCount} inserted, ${skippedCount} skipped, ${errorCount} errors`);
    return errorCount === 0;

  } catch (error) {
    console.error(`✗ [${leagueCode}] Finished match sync error:`, {
      message: error.message,
      response: error.response?.data?.message || 'No API response',
      status: error.response?.status
    });
    return false;
  }
}

// ============================================
// FUNCTION: Full Sync (Teams + Matches)
// ============================================
async function fullSync(leagues = ['BL1']) {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 FULL SYNC - Football-data.org     ║');
    console.log('║  Teams + Scheduled Matches + Results  ║');
    console.log('╚════════════════════════════════════════╝');

    const results = {
      success: [],
      failed: []
    };

    for (const league of leagues) {
      console.log(`\n${'═'.repeat(50)}`);
      console.log(`⚽ Processing: ${league}`);
      console.log('═'.repeat(50));

      // Teams synchronisieren
      const teamsOk = await syncTeams(league);
      await delay(2000); // Rate Limiting beachten

      // Anstehende Matches
      const matchesOk = await syncMatches(league, 'SCHEDULED');
      await delay(2000);

      // Abgelaufene Matches mit Ergebnissen
      const finishedOk = await syncFinishedMatches(league);
      await delay(2000);

      // Gesamtstatus für diese Liga
      const leagueOk = teamsOk && matchesOk && finishedOk;
      
      if (leagueOk) {
        results.success.push(league);
        console.log(`\n✓ ${league}: ALL SYNCS COMPLETED SUCCESSFULLY`);
      } else {
        results.failed.push(league);
        console.log(`\n⚠ ${league}: SOME SYNCS FAILED - Check logs above`);
      }
    }

    // Abschließender Report
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 SYNC SUMMARY                      ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`✓ Successful: ${results.success.join(', ') || 'None'}`);
    console.log(`✗ Failed: ${results.failed.join(', ') || 'None'}`);
    
    const allOk = results.failed.length === 0;
    if (allOk) {
      console.log('\n✓✓✓ FULL SYNC COMPLETED SUCCESSFULLY ✓✓✓\n');
    } else {
      console.log(`\n⚠ FULL SYNC COMPLETED WITH ERRORS (${results.failed.length}/${leagues.length} failed)\n`);
    }

    return allOk;

  } catch (error) {
    console.error('\n✗ FULL SYNC CRITICAL ERROR:', error.message);
    console.error('Stack:', error.stack);
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
