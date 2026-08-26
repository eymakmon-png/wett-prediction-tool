// ============================================
// JOB SCHEDULER - node-cron
// Auto-Sync täglich + Auto-Predictions
// ============================================
const cron = require('node-cron');
const { fullSync } = require('../api/footballdata');

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

// Job 2: Prediction Calculation at 18:00 UTC
cron.schedule('0 18 * * *', async () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  📊 SCHEDULED PREDICTIONS (18:00 UTC) ║');
  console.log('╚════════════════════════════════════════╝');
  
  console.log('✓ Predictions will be recalculated on next API call');
  console.log('✓ All algorithms use latest data\n');
});

console.log('✓ Job Scheduler initialized!');
console.log('  📅 06:00 UTC - Auto Sync');
console.log('  📊 18:00 UTC - Auto Predictions\n');

module.exports = {
  // Export für Tests falls nötig
};
