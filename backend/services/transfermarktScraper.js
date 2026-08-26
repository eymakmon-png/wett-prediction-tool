// ============================================
// TRANSFERMARKT SCRAPER
// Lädt Verletzungen & Sperrungen automatisch
// ============================================
const axios = require('axios');
const cheerio = require('cheerio');
const { pool } = require('../database/init');

const TRANSFERMARKT_BASE = 'https://www.transfermarkt.com';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Scrape Verletzungen für Team
async function scrapeTeamInjuries(teamUrlPart) {
  try {
    console.log(`  🔍 Scraping Transfermarkt for ${teamUrlPart}...`);
    
    const url = `${TRANSFERMARKT_BASE}/${teamUrlPart}/verletzungen/verein`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 5000
    });
    
    const $ = cheerio.load(response.data);
    const injuries = [];
    
    // Parse Verletzungen-Tabelle
    $('table.items tr').each((i, elem) => {
      if (i === 0) return; // Skip header
      
      const playerName = $(elem).find('td:nth-child(2) a').text().trim();
      const position = $(elem).find('td:nth-child(3)').text().trim();
      const injury = $(elem).find('td:nth-child(4)').text().trim();
      const returnDate = $(elem).find('td:nth-child(5)').text().trim();
      
      if (playerName && injury) {
        injuries.push({
          playerName,
          position,
          injury,
          returnDate,
          status: returnDate ? 'OUT' : 'DOUBT'
        });
      }
    });
    
    return injuries;
  } catch (error) {
    console.warn(`  ⚠ Scraping error for ${teamUrlPart}:`, error.message);
    return [];
  }
}

// Save injuries to database
async function saveInjuriesForTeam(teamName, injuries) {
  try {
    // Get team ID
    const teamRes = await pool.query(
      'SELECT id FROM teams WHERE name = $1',
      [teamName]
    );
    
    if (teamRes.rows.length === 0) {
      console.warn(`  ⚠ Team not found: ${teamName}`);
      return false;
    }
    
    const teamId = teamRes.rows[0].id;
    let insertedCount = 0;
    
    for (const injury of injuries) {
      try {
        await pool.query(
          `INSERT INTO injuries (team_id, player_name, position, injury_type, return_date, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (team_id, player_name) DO UPDATE SET
             injury_type = $4,
             return_date = $5,
             status = $6`,
          [teamId, injury.playerName, injury.position, injury.injury, injury.returnDate, injury.status]
        );
        insertedCount++;
      } catch (err) {
        console.warn(`  ⚠ Failed to insert injury for ${injury.playerName}`);
      }
    }
    
    console.log(`   ✓ ${teamName}: ${insertedCount} injuries saved`);
    return true;
  } catch (error) {
    console.error(`  ✗ Error saving injuries for ${teamName}:`, error.message);
    return false;
  }
}

// Main: Scrape all teams
async function scrapeAllInjuries() {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  🏥 TRANSFERMARKT SCRAPER (Injuries)  ║');
    console.log('╚════════════════════════════════════════╝');
    
    // Get all teams from database
    const teamsRes = await pool.query('SELECT id, name, league FROM teams ORDER BY name');
    const teams = teamsRes.rows;
    
    console.log(`\n📊 Found ${teams.length} teams to scan\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const team of teams) {
      try {
        // Build Transfermarkt URL (simplified - adjust for each league!)
        const teamUrlPart = team.name.toLowerCase().replace(/\s+/g, '-');
        
        const injuries = await scrapeTeamInjuries(teamUrlPart);
        
        if (injuries.length > 0) {
          const saved = await saveInjuriesForTeam(team.name, injuries);
          if (saved) successCount++;
        }
        
        await delay(1000); // Rate limiting
      } catch (err) {
        console.error(`  ✗ Error for ${team.name}:`, err.message);
        errorCount++;
      }
    }
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 SCRAPE SUMMARY                    ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`✓ Success: ${successCount}/${teams.length}`);
    console.log(`✗ Errors: ${errorCount}\n`);
    
    return successCount > 0;
  } catch (error) {
    console.error('\n✗ CRITICAL ERROR:', error.message);
    return false;
  }
}

module.exports = {
  scrapeAllInjuries
};
