require('dotenv').config();
const express = require('express');
const cors = require('cors');

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
// HEALTH CHECK ENDPOINT (for testing)
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Wett Prediction Tool API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============================================
// API ROUTES (Skeleton - werden später gebaut)
// ============================================

// Matches Endpoints
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

// Predictions Endpoints
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

// Teams Endpoints
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

// Performance Endpoints
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

// Manual Inputs Endpoints
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

// Admin Endpoints
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
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  ⚽ WETT PREDICTION TOOL v1.0              ║');
  console.log('║  Status: ✓ Running                         ║');
  console.log(`║  Port: ${PORT}                                    ║`);
  console.log('║  Environment: ' + (process.env.NODE_ENV || 'development').padEnd(21) + '║');
  console.log('║                                            ║');
  console.log(`║  🏥 Health Check:                           ║`);
  console.log(`║  http://localhost:${PORT}/health${' '.repeat(20 - PORT.toString().length)}║`);
  console.log('║                                            ║');
  console.log('║  📚 API Docs: Coming Soon                  ║');
  console.log('║                                            ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;

