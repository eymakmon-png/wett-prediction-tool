require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase, pool } = require('./database/init');
const { fullSync } = require('./api/footballdata');
const axios = require('axios');
const { calculateAllPredictions } = require('./engine/predictions');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// DATABASE INITIALIZATION
// ============================================
let dbInitialized = false;

async function startServer() {
  try {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  ⚽ WETT PREDICTION TOOL v2.0              ║');
    console.log('║  Initializing...                           ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
    
    console.log('📦 Step 1: Initializing Database...');
    const dbReady = await initDatabase();
    
    if (dbReady) {
      dbInitialized = true;
      console.log('✓ Database ready!\n');
    } else {
      console.warn('⚠ Database initialization failed\n');
    }
    
    console.log('🚀 Step 2: Starting Express Server...\n');
    
  } catch (error) {
    console.error('Critical error during startup:', error);
    process.exit(1);
  }
}

// ============================================
// HEALTH CHECK
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
// DATABASE STATUS
// ============================================
app.get('/api/status', async (req, res) => {
  try {
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
// SYNC DATA ENDPOINT (Admin)
// ============================================
app.get('/api/admin/sync-data', async (req, res) =>{
  try {
    console.log('🔄 Starting full sync...');
    const result = await fullSync(['PL', 'BL1']);
    
    if (result) {
      res.json({
        success: true,
        message: 'Data sync completed!',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Sync failed'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// MATCHES ENDPOINTS (ECHTE DATEN!)
// ============================================

// Get all matches
app.get('/api/matches', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.id,
        m.match_id,
        m.season,
        m.round,
        m.competition,
        m.kick_off,
        m.status,
        m.home_goals,
        m.away_goals,
        ht.name as home_team,
        at.name as away_team
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      ORDER BY m.kick_off DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get matches by league
app.get('/api/matches/league/:league', async (req, res) => {
  try {
    const { league } = req.params;
    
    const result = await pool.query(`
      SELECT 
        m.id,
        m.match_id,
        m.season,
        m.round,
        m.competition,
        m.kick_off,
        m.status,
        m.home_goals,
        m.away_goals,
        ht.name as home_team,
        at.name as away_team
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE m.competition = $1
      ORDER BY m.kick_off DESC
      LIMIT 100
    `, [league.toUpperCase()]);

    res.json({
      success: true,
      league: league.toUpperCase(),
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get scheduled matches (upcoming)
app.get('/api/matches/upcoming', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.id,
        m.match_id,
        m.season,
        m.kick_off,
        m.status,
        ht.name as home_team,
        at.name as away_team,
        m.competition
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE m.status = 'SCHEDULED'
      ORDER BY m.kick_off ASC
      LIMIT 20
    `);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get finished matches (results)
app.get('/api/matches/finished/:league', async (req, res) => {
  try {
    const { league } = req.params;
    
    const result = await pool.query(`
      SELECT 
        m.id,
        m.match_id,
        m.season,
        m.kick_off,
        m.status,
        m.home_goals,
        m.away_goals,
        ht.name as home_team,
        at.name as away_team,
        m.competition
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE m.status = 'FINISHED' AND m.competition = $1
      ORDER BY m.kick_off DESC
      LIMIT 50
    `, [league.toUpperCase()]);

    res.json({
      success: true,
      league: league.toUpperCase(),
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single match
app.get('/api/matches/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        m.id,
        m.match_id,
        m.season,
        m.round,
        m.competition,
        m.kick_off,
        m.status,
        m.home_goals,
        m.away_goals,
        ht.name as home_team,
        at.name as away_team
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE m.match_id = $1
    `, [matchId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// TEAMS ENDPOINTS
// ============================================

app.get('/api/teams', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, short_name, league, elo_rating, points_for_season
      FROM teams
      ORDER BY league, points_for_season DESC
    `);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/teams/:league', async (req, res) => {
  try {
    const { league } = req.params;
    
    const result = await pool.query(`
      SELECT id, name, short_name, league, elo_rating, points_for_season
      FROM teams
      WHERE league = $1
      ORDER BY points_for_season DESC
    `, [league.toUpperCase()]);

    res.json({
      success: true,
      league: league.toUpperCase(),
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// PREDICTIONS ENDPOINTS
// ============================================
app.get('/api/predictions/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const matchRes = await pool.query(
      'SELECT home_team_id, away_team_id FROM matches WHERE id = $1',
      [matchId]
    );
    if (matchRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }
    const { home_team_id, away_team_id } = matchRes.rows[0];
    const predictions = await calculateAllPredictions(home_team_id, away_team_id, matchId);
    res.json({
      success: true,
      match_id: matchId,
      predictions: predictions.predictions,
      recommendations: predictions.recommendation
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/predictions/league/:league', async (req, res) => {
  try {
    const { league } = req.params;
    const matchesRes = await pool.query(
      `SELECT id, home_team_id, away_team_id, kick_off FROM matches 
       WHERE competition = $1 AND status = 'SCHEDULED'
       ORDER BY kick_off ASC LIMIT 20`,
      [league]
    );
    const predictions = [];
    for (const match of matchesRes.rows) {
      const pred = await calculateAllPredictions(match.home_team_id, match.away_team_id, match.id);
      predictions.push({
        match_id: match.id,
        kick_off: match.kick_off,
        ...pred.predictions,
        recommendations: pred.recommendation
      });
    }
    res.json({
      success: true,
      league,
      count: predictions.length,
      predictions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/predictions/matches', async (req, res) => {
  try {
    const matchesRes = await pool.query(
      `SELECT id, home_team_id, away_team_id, competition, kick_off FROM matches 
       WHERE status = 'SCHEDULED'
       ORDER BY kick_off ASC LIMIT 50`
    );
   const predictions = [];
for (const match of matchesRes.rows) {
  const pred = await calculateAllPredictions(match.home_team_id, match.away_team_id, match.id);
  if (pred && pred.predictions) {  ← CHECK!
    predictions.push({
      match_id: match.match_id,
      home_team: match.home_team,
      away_team: match.away_team,
      kick_off: match.kick_off,
      status: match.status,
      competition: match.competition,
      ...pred.predictions,
      recommendations: pred.recommendation
    });
  }
}
res.json({
  success: true,
  count: predictions.length,
  predictions
});
} catch (error) {
  res.status(500).json({ success: false, error: error.message });
}
        
// Get ALL predictions (auch FINISHED matches)
app.get('/api/predictions/all', async (req, res) => {
  try {
    const matchesRes = await pool.query(
      `SELECT 
        m.id,
        m.match_id,
        m.kick_off,
        m.status,
        m.competition,
        ht.name as home_team,
        at.name as away_team
       FROM matches m
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       ORDER BY m.kick_off DESC
       LIMIT 100`
    );
    for (const match of matchesRes.rows) {
  const pred = await calculateAllPredictions(match.home_team_id, match.away_team_id, match.id);
  if (pred && pred.predictions) {
    predictions.push({
        match_id: match.match_id,
        home_team: match.home_team,
        away_team: match.away_team,
        kick_off: match.kick_off,
        status: match.status,
        competition: match.competition,
        ...pred.predictions,
        recommendations: pred.recommendation
      });
    }
    res.json({
      success: true,
      count: predictions.length,
      predictions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// ============================================
// ERROR HANDLERS
// ============================================
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

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
    console.log(`║  📊 API Endpoints:                          ║`);
    console.log(`║  GET /api/matches                           ║`);
    console.log(`║  GET /api/matches/league/:league            ║`);
    console.log(`║  GET /api/matches/upcoming                  ║`);
    console.log(`║  POST /api/admin/sync-data                  ║`);
    console.log('║                                            ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
  });
}

// ============================================
// DEBUG ENDPOINT
// ============================================
app.get('/api/admin/debug-football-data/:league', async (req, res) => {
  try {
    const { league } = req.params;
    const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
    const FOOTBALL_DATA_API = 'https://api.football-data.org/v4';

    console.log(`\n🔍 DEBUG: Fetching ${league}...`);
    const response = await axios.get(
      `${FOOTBALL_DATA_API}/competitions/${league}/standings`,
      { headers: { 'X-Auth-Token': API_KEY } }
    );

    const teams = response.data.standings[0].table;
    res.json({
      success: true,
      league: league,
      teams_count: teams.length,
      first_team: teams[0].team.name
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      response: error.response ? error.response.data : 'NO RESPONSE'
    });
  }
});

start()
module.exports = app;
