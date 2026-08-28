// ============================================
// JOB SCHEDULER - node-cron
// Auto-Sync + Auto-Scraper + Auto-Predictions
// ============================================
const cron = require('node-cron');
const { fullSync } = require('../api/footballdata');
const { scrapeAllInjuries } = require('./transfermarktScraper');
const { scrapeAllPlayerForms } = require('./flashscoreScraper');
const { scrapeAllPlayerPerformances } = require('./sofascoreScraper');
const { recordAllFinishedMatches } = require('./performanceRecorder');
const { logJobStart, logJobSuccess, logJobError } = require('./jobLogger');

console.log('⏰ Initializing Job Scheduler...');

// Job 1: Daily Data Sync at 06:00 UTC
cron.schedule('0 6 * * *', async () => {
  const startTime = Date.now();
  let jobId = null;
  
  try {
    jobId = await logJobStart('Auto-Sync');
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  🔄 SCHEDULED SYNC START (06:00 UTC)  ║');
    console.log('╚════════════════════════════════════════╝');
    
    const result = await fullSync(['PL', 'BL1']);
    const duration = Date.now() - startTime;
    
    if (result) {
      console.log('✓ Scheduled Sync completed successfully!\n');
      await logJobSuccess(jobId, 'Auto-Sync', duration);
    } else {
      console.log('⚠ Scheduled Sync completed with errors\n');
      await logJobError(jobId, 'Auto-Sync', 'Sync returned false', duration);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('✗ Scheduled Sync error:', error.message);
    await logJobError(jobId, 'Auto-Sync', error.message, duration);
  }
});

// Job 2: Transfermarkt Scraper at 07:00 UTC
cron.schedule('0 7 * * *', async () => {
  const startTime = Date.now();
  let jobId = null;
  
  try {
    jobId = await logJobStart('Transfermarkt-Scraper');
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  🏥 SCHEDULED SCRAPER (07:00 UTC)     ║');
    console.log('╚════════════════════════════════════════╝');
    
    const result = await scrapeAllInjuries();
    const duration = Date.now() - startTime;
    
    if (result) {
      console.log('✓ Scraper completed successfully!\n');
      await logJobSuccess(jobId, 'Transfermarkt-Scraper', duration);
    } else {
      console.log('⚠ Scraper completed with errors\n');
      await logJobError(jobId, 'Transfermarkt-Scraper', 'Scraper returned false', duration);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('✗ Scraper error:', error.message);
    await logJobError(jobId, 'Transfermarkt-Scraper', error.message, duration);
  }
});

// Job 3: Prediction Calculation at 18:00 UTC
cron.schedule('0 18 * * *', async () => {
  const startTime = Date.now();
  let jobId = null;
  
  try {
    jobId = await logJobStart('Auto-Predictions');
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  📊 SCHEDULED PREDICTIONS (18:00 UTC) ║');
    console.log('╚════════════════════════════════════════╝');
    
    console.log('✓ Predictions will be recalculated on next API call');
    console.log('✓ All algorithms use latest data\n');
    
    const duration = Date.now() - startTime;
    await logJobSuccess(jobId, 'Auto-Predictions', duration);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('✗ Predictions error:', error.message);
    await logJobError(jobId, 'Auto-Predictions', error.message, duration);
  }
});

// Job 4: Player Form Scraper at 08:00 UTC
cron.schedule('0 8 * * *', async () => {
  const startTime = Date.now();
  let jobId = null;
  
  try {
    jobId = await logJobStart('Player-Form-Scraper');
    
    await scrapeAllPlayerForms();
    const duration = Date.now() - startTime;
    
    await logJobSuccess(jobId, 'Player-Form-Scraper', duration);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('✗ Player Form Scraper error:', error.message);
    await logJobError(jobId, 'Player-Form-Scraper', error.message, duration);
  }
});

// Job 5: Sofascore Player Performance at 09:00 UTC
cron.schedule('0 9 * * *', async () => {
  const startTime = Date.now();
  let jobId = null;
  
  try {
    jobId = await logJobStart('Sofascore-Performance');
    
    const result = await scrapeAllPlayerPerformances();
    const duration = Date.now() - startTime;
    
    if (result) {
      await logJobSuccess(jobId, 'Sofascore-Performance', duration);
    } else {
      await logJobError(jobId, 'Sofascore-Performance', 'Scraper returned false', duration);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('✗ Sofascore Performance error:', error.message);
    await logJobError(jobId, 'Sofascore-Performance', error.message, duration);
  }
});

// Job 6: Performance Recorder at 10:00 UTC
cron.schedule('0 10 * * *', async () => {
  const startTime = Date.now();
  let jobId = null;
  
  try {
    jobId = await logJobStart('Performance-Recorder');
    
    const result = await recordAllFinishedMatches();
    const duration = Date.now() - startTime;
    
    if (result) {
      await logJobSuccess(jobId, 'Performance-Recorder', duration);
    } else {
      await logJobError(jobId, 'Performance-Recorder', 'Recorder returned false', duration);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('✗ Performance Recorder error:', error.message);
    await logJobError(jobId, 'Performance-Recorder', error.message, duration);
  }
});

console.log('✓ Job Scheduler initialized!');
console.log('  📅 06:00 UTC - Auto Sync');
console.log('  🏥 07:00 UTC - Transfermarkt Scraper');
console.log('  ⭐ 08:00 UTC - Player Form Scraper');
console.log('  🎯 09:00 UTC - Sofascore Performance');
console.log('  📊 10:00 UTC - Performance Recorder');
console.log('  📈 18:00 UTC - Auto Predictions\n');

module.exports = {
  // Export für Tests falls nötig
};
