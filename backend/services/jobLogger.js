// ============================================
// JOB LOGGER - Speichert Job-Status in DB
// ============================================
const { pool } = require('../database/init');

// Job start logging
async function logJobStart(jobName) {
  try {
    const result = await pool.query(
      `INSERT INTO job_logs (job_name, status, started_at)
       VALUES ($1, 'RUNNING', NOW())
       RETURNING id`,
      [jobName]
    );
    return result.rows[0]?.id || null;
  } catch (error) {
    console.error(`✗ Error logging job start for ${jobName}:`, error.message);
    return null;
  }
}

// Job success logging
async function logJobSuccess(jobId, jobName, durationMs) {
  try {
    await pool.query(
      `UPDATE job_logs 
       SET status = 'SUCCESS', 
           completed_at = NOW(), 
           duration_ms = $1
       WHERE id = $2`,
      [durationMs, jobId]
    );
    console.log(`✓ [${jobName}] Logged: SUCCESS (${durationMs}ms)`);
  } catch (error) {
    console.error(`✗ Error logging job success for ${jobName}:`, error.message);
  }
}

// Job error logging
async function logJobError(jobId, jobName, errorMsg, durationMs) {
  try {
    await pool.query(
      `UPDATE job_logs 
       SET status = 'ERROR', 
           completed_at = NOW(), 
           duration_ms = $1,
           error_message = $2
       WHERE id = $3`,
      [durationMs, errorMsg, jobId]
    );
    console.log(`✗ [${jobName}] Logged: ERROR`);
  } catch (error) {
    console.error(`✗ Error logging job error for ${jobName}:`, error.message);
  }
}

module.exports = {
  logJobStart,
  logJobSuccess,
  logJobError
};
