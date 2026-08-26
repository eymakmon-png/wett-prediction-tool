// backend/database/init.js
// ============================================
// DATABASE INITIALIZATION
// Läuft automatisch beim Server-Start!
// ============================================

const { Pool } = require('pg');

// Verbindung zur Datenbank
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// SQL Schema
const schema = `
  -- 1. TEAMS TABELLE
  CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    short_name VARCHAR(10),
    country VARCHAR(50),
    league VARCHAR(10),
    elo_rating FLOAT DEFAULT 1500,
    home_strength FLOAT DEFAULT 1.0,
    away_weakness FLOAT DEFAULT 1.0,
    recent_form VARCHAR(10),
    points_for_season INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- 2. PLAYERS TABELLE
  CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    team_id INTEGER REFERENCES teams(id),
    position VARCHAR(20),
    importance INTEGER DEFAULT 50,
    goals_last_5 INTEGER DEFAULT 0,
    assists_last_5 INTEGER DEFAULT 0,
    form_status VARCHAR(20) DEFAULT 'NORMAL',
    form_impact FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- 3. MATCHES TABELLE
  CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(50) UNIQUE,
    season INTEGER,
    round INTEGER,
    competition VARCHAR(20),
    home_team_id INTEGER REFERENCES teams(id),
    away_team_id INTEGER REFERENCES teams(id),
    kick_off TIMESTAMP,
    status VARCHAR(20) DEFAULT 'SCHEDULED',
    home_goals INTEGER,
    away_goals INTEGER,
    referee VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- 4. PREDICTIONS TABELLE
  CREATE TABLE IF NOT EXISTS predictions (
    id SERIAL PRIMARY KEY,
    match_id INTEGER REFERENCES matches(id),
    match_date TIMESTAMP,
    home_team_id INTEGER REFERENCES teams(id),
    away_team_id INTEGER REFERENCES teams(id),
    home_win_prob FLOAT,
    draw_prob FLOAT,
    away_win_prob FLOAT,
    over_2_5_prob FLOAT,
    confidence_level INTEGER DEFAULT 5,
    value_percentage FLOAT DEFAULT 0,
    suggested_bet VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- 5. PLAYER RATINGS TABELLE
  CREATE TABLE IF NOT EXISTS player_ratings (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id),
    match_id INTEGER REFERENCES matches(id),
    rating FLOAT,
    rating_date DATE,
    was_scraped_at TIMESTAMP,
    source VARCHAR(50) DEFAULT 'flashscore',
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- 6. MANUAL INPUTS TABELLE
  CREATE TABLE IF NOT EXISTS manual_inputs (
    id SERIAL PRIMARY KEY,
    match_id INTEGER REFERENCES matches(id),
    input_type VARCHAR(50),
    player_id INTEGER REFERENCES players(id),
    data JSONB,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
  );
  
  -- 7. INJURIES TABELLE
  CREATE TABLE IF NOT EXISTS injuries (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id),
    player_name VARCHAR(255) NOT NULL,
    position VARCHAR(50),
    injury_type VARCHAR(255),
    return_date VARCHAR(100),
    status VARCHAR(20) DEFAULT 'OUT',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(team_id, player_name)
  );

  -- 8. PERFORMANCE LOG TABELLE
  CREATE TABLE IF NOT EXISTS performance_log (
    id SERIAL PRIMARY KEY,
    prediction_id INTEGER REFERENCES predictions(id),
    match_result VARCHAR(20),
    actual_home_goals INTEGER,
    actual_away_goals INTEGER,
    prediction_correct BOOLEAN,
    profit_loss FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- INDEXES für schnelle Abfragen
  CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league);
  CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
  CREATE INDEX IF NOT EXISTS idx_matches_home_team ON matches(home_team_id);
  CREATE INDEX IF NOT EXISTS idx_matches_away_team ON matches(away_team_id);
  CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition);
  CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
  CREATE INDEX IF NOT EXISTS idx_player_ratings_player ON player_ratings(player_id);
  CREATE INDEX IF NOT EXISTS idx_player_ratings_date ON player_ratings(rating_date);
`;

// Funktion: Datenbank initialisieren
async function initDatabase() {
  try {
    console.log('🔄 Initializing database schema...');
    
    // Führe alle SQL Statements aus
    await pool.query(schema);
    
    console.log('✓ Database schema initialized successfully!');
    console.log('✓ All tables created!');
    console.log('✓ Indexes created!');
    
    return true;
  } catch (error) {
    console.error('✗ Database initialization error:', error.message);
    return false;
  }
}

// Export
module.exports = { initDatabase, pool };
