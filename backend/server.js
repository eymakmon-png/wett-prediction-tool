require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase, pool } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

// Logger Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// DATABASE INITIALIZATION (beim Start!)
// ============================================
let dbInitialized = false;

async function startServer() {
  try {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  ⚽ WETT PREDICTION TOOL v1.0              ║');
    console.log('║  Initializing...                           ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
    
    // 1. Initialisiere Datenbank
    console.log('📦 Step 1: Initializing Database...');
    const dbReady = await initDatabase();
    
    if (dbReady) {
      dbInitialized = true;
      console.log('✓ Database ready!\n');
    } else {
      console.warn('⚠ Database initialization failed, but server will continue\n');
    }
    
    // 2. Starte Server
    console.log('🚀 Step 2: Starting Express Server...\n');
    
  } catch (error) {
    console.error('Critical error during startup:', error);
    process.exit(1);
  }
}

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Wett Prediction Tool API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: dbInitialized ? 'connected' : 'initializing'
  });
});

// ============================================
// DATABASE STATUS ENDPOINT
// ============================================
app.get('/api/status', async (req, res) => {
  try {
    // Test database connection
    const result = await pool.query('SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = \'public\'');
    const tableCount = result.rows[0].table_count;
    
    res.json({
      success: true,
      database: {
        status: 'connected',
        tables_created: tableCount
      },
      server: {
        status: 'running',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Database connection failed',
      message: error.message
    });
  }
});

// ============================================
// MATCHES ENDPOINTS (Skeleton)
// ============================================
app.get('/api/matches/today', (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    data: []
  });
});

app.get('/api/matches/:matchId', (req, res) => {
  const { matchId } = req.params;
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    matchId: matchId,
    data: {}
  });
});

app.get('/api/matches/league/:league/round/:round', (req, res) => {
  const { league, round } = req.params;
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    league: league,
    round: round,
    data: []
  });
});

// ============================================
// PREDICTIONS ENDPOINTS (Skeleton)
// ============================================
app.get('/api/predictions/:matchId', (req, res) => {
  const { matchId } = req.params;
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    matchId: matchId,
    prediction: {}
  });
});

app.get('/api/predictions/today', (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    data: []
  });
});

// ============================================
// TEAMS ENDPOINTS (Skeleton)
// ============================================
app.get('/api/teams', (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    data: []
  });
});

app.get('/api/teams/:teamId', (req, res) => {
  const { teamId } = req.params;
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    teamId: teamId,
    data: {}
  });
});

// ============================================
// PERFORMANCE ENDPOINTS (Skeleton)
// ============================================
app.get('/api/performance/weekly', (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    data: {}
  });
});

app.get('/api/performance/all-time', (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    data: {}
  });
});

// ============================================
// MANUAL INPUTS ENDPOINTS (Skeleton)
// ============================================
app.post('/api/manual-inputs', (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint coming soon'
  });
});

app.get('/api/manual-inputs/:matchId', (req, res) => {
  const { matchId } = req.params;
  res.json({
    success: true,
    message: 'Endpoint coming soon',
    matchId: matchId,
    data: []
  });
});

// ============================================
// ADMIN ENDPOINTS (Skeleton)
// ============================================
app.post('/api/admin/sync-data', (req, res) => {
  res.json({
    success: true,
    message: 'Sync started (endpoint coming soon)'
  });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// ============================================
// START SERVER
// ============================================
async function start() {
  await startServer();
  
  app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  ⚽ WETT PREDICTION TOOL v1.0              ║');
    console.log('║  Status: ✓ Running                         ║');
    console.log(`║  Port: ${PORT}                                    ║`);
    console.log('║  Environment: ' + (process.env.NODE_ENV || 'development').padEnd(21) + '║');
    console.log('║                                            ║');
    console.log(`║  🏥 Health Check:                           ║`);
    console.log(`║  https://your-url.railway.app/health       ║`);
    console.log('║                                            ║');
    console.log(`║  📊 Database Status:                        ║`);
    console.log(`║  https://your-url.railway.app/api/status   ║`);
    console.log('║                                            ║');
    console.log('║  📚 API Docs: Coming Soon                  ║');
    console.log('║                                            ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
  });
}

start();

module.exports = app;
