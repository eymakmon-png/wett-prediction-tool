// ============================================
// JOB SCHEDULER - node-cron
// Auto-Sync + Auto-Scraper + Auto-Predictions
// ============================================
const cron = require('node-cron');
const { fullSync } = require('../api/footballdata');
const { scrapeAllInjuries } = require('./transfermarktScraper');
const { scrapeAllPlayerForms } = require('./flashscoreScraper');

console.log('⏰ Initializing Job Scheduler...');

// Job 1: Daily Data Sync at 06:00 UTC
cron.schedule('0 6 * * *', async () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  🔄 SCHEDULED SYNC START (06:00 UTC)  ║');
  console.log('╚════════════════════════════════════════╝');
  
  try {
    const result = await fullSync(['PL', 'BL1']);
    if (result) {
      console.log('✓ Scheduled Sync completed successfully!\n');
    } else {
      console.log('⚠ Scheduled Sync completed with errors\n');
    }
  } catch (error) {
    console.error('✗ Scheduled Sync error:', error.message);
  }
});

// Job 2: Transfermarkt Scraper at 07:00 UTC
cron.schedule('0 7 * * *', async () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  🏥 SCHEDULED SCRAPER (07:00 UTC)     ║');
  console.log('╚════════════════════════════════════════╝');
  
  try {
    const result = await scrapeAllInjuries();
    if (result) {
      console.log('✓ Scraper completed successfully!\n');
    } else {
      console.log('⚠ Scraper completed with errors\n');
    }
  } catch (error) {
    console.error('✗ Scraper error:', error.message);
  }
});

// Job 3: Prediction Calculation at 18:00 UTC
cron.schedule('0 18 * * *', async () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  📊 SCHEDULED PREDICTIONS (18:00 UTC) ║');
  console.log('╚════════════════════════════════════════╝');
  
  console.log('✓ Predictions will be recalculated on next API call');
  console.log('✓ All algorithms use latest data\n');
});
// Job 2b: Player Form Scraper at 08:00 UTC
cron.schedule('0 8 * * *', async () => {
  try {
    await scrapeAllPlayerForms();
  } catch (error) {
    console.error('✗ Player Form Scraper error:', error.message);
  }
});

console.log('✓ Job Scheduler initialized!');
console.log('  📅 06:00 UTC - Auto Sync');
console.log('  🏥 07:00 UTC - Transfermarkt Scraper');
console.log('  ⭐ 08:00 UTC - Player Form Scraper');
console.log('  📊 18:00 UTC - Auto Predictions\n');

module.exports = {
  // Export für Tests falls nötig
};
