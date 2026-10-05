// ============================================
// H2H SCRAPER SERVICE
// Scraped Head-to-Head Daten von Flashscore
// ============================================
const puppeteer = require('puppeteer');
const { pool } = require('../database/init');

async function scrapeH2H(homeTeamName, awayTeamName) {
  let browser;
  try {
    console.log(`\n🔄 Scraping H2H: ${homeTeamName} vs ${awayTeamName}`);

    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set timeout
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Go to Flashscore H2H page
    const url = `https://www.flashscore.com/search/?q=${homeTeamName}+${awayTeamName}`;
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for results to load
    await page.waitForSelector('a[href*="/match/"]', { timeout: 5000 }).catch(() => null);

    // Get all match links
    const matchLinks = await page.$$eval('a[href*="/match/"]', links => 
      links.map(link => link.href).filter((url, index, self) => self.indexOf(url) === index).slice(0, 20)
    );

    if (matchLinks.length === 0) {
      console.log(`  ⚠ No H2H matches found for ${homeTeamName} vs ${awayTeamName}`);
      return null;
    }

    console.log(`  📊 Found ${matchLinks.length} matches`);

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    const results = [];

    // Scrape each match
    for (const matchLink of matchLinks.slice(0, 10)) {
      try {
        const matchPage = await browser.newPage();
        matchPage.setDefaultTimeout(15000);
        await matchPage.goto(matchLink, { waitUntil: 'networkidle2' }).catch(() => null);

        // Get match info
        const matchInfo = await matchPage.evaluate(() => {
          const scoreEl = document.querySelector('[class*="score"]');
          const homeTeamEl = document.querySelector('[class*="home"]');
          const awayTeamEl = document.querySelector('[class*="away"]');
          const dateEl = document.querySelector('[class*="date"]');

          return {
            score: scoreEl ? scoreEl.textContent.trim() : null,
            homeTeam: homeTeamEl ? homeTeamEl.textContent.trim() : null,
            awayTeam: awayTeamEl ? awayTeamEl.textContent.trim() : null,
            date: dateEl ? dateEl.textContent.trim() : null
          };
        }).catch(() => null);

        if (matchInfo && matchInfo.score) {
          const [homeGoals, awayGoals] = matchInfo.score.split(':').map(s => parseInt(s.trim()));

          if (!isNaN(homeGoals) && !isNaN(awayGoals)) {
            if (homeGoals > awayGoals) {
              homeWins++;
            } else if (awayGoals > homeGoals) {
              awayWins++;
            } else {
              draws++;
            }

            results.push({
              date: matchInfo.date,
              homeGoals,
              awayGoals,
              result: homeGoals > awayGoals ? 'HOME' : awayGoals > homeGoals ? 'AWAY' : 'DRAW'
            });
          }
        }

        await matchPage.close();
      } catch (err) {
        console.log(`  ⚠ Error scraping match: ${err.message}`);
        continue;
      }
    }

    await browser.close();

    const h2hData = {
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      homeWins,
      awayWins,
      draws,
      totalMatches: homeWins + awayWins + draws,
      lastMatches: results,
      homeWinRate: results.length > 0 ? (homeWins / results.length * 100).toFixed(1) : 0
    };

    console.log(`  ✅ H2H Complete: ${homeTeamName} ${homeWins}W-${draws}D-${awayWins}L ${awayTeamName}`);

    return h2hData;
  } catch (error) {
    console.error(`  ✗ Error scraping H2H: ${error.message}`);
    if (browser) await browser.close();
    return null;
  }
}

async function saveH2HData(homeTeamId, awayTeamId, h2hData) {
  try {
    if (!h2hData) return false;

    await pool.query(
      `INSERT INTO h2h_history 
       (home_team_id, away_team_id, home_wins, draws, away_wins, home_win_rate, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (home_team_id, away_team_id)
       DO UPDATE SET
         home_wins = $3,
         draws = $4,
         away_wins = $5,
         home_win_rate = $6,
         last_updated = NOW()`,
      [homeTeamId, awayTeamId, h2hData.homeWins, h2hData.draws, h2hData.awayWins, h2hData.homeWinRate]
    );

    return true;
  } catch (error) {
    console.error(`Error saving H2H data: ${error.message}`);
    return false;
  }
}

async function scrapeAllH2HMatches() {
  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  🔄 H2H SCRAPER START                 ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Get all upcoming matches
    const matchesRes = await pool.query(
      `SELECT DISTINCT 
        m.home_team_id, m.away_team_id,
        ht.name as home_team, at.name as away_team
       FROM matches m
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       WHERE m.status = 'SCHEDULED'
       LIMIT 20`
    );

    const matches = matchesRes.rows;
    console.log(`📊 Found ${matches.length} upcoming matches to scrape H2H for\n`);

    let scrapedCount = 0;
    let errorCount = 0;

    for (const match of matches) {
      try {
        const h2hData = await scrapeH2H(match.home_team, match.away_team);
        
        if (h2hData) {
          const saved = await saveH2HData(match.home_team_id, match.away_team_id, h2hData);
          if (saved) scrapedCount++;
        } else {
          errorCount++;
        }

        // Rate limiting: 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`Error for match ${match.home_team} vs ${match.away_team}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  🔄 H2H SCRAPER SUMMARY               ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`✓ Scraped: ${scrapedCount}/${matches.length}`);
    console.log(`✗ Errors: ${errorCount}\n`);

    return scrapedCount > 0;
  } catch (error) {
    console.error('\n✗ CRITICAL ERROR:', error.message);
    return false;
  }
}

module.exports = {
  scrapeH2H,
  saveH2HData,
  scrapeAllH2HMatches
};
