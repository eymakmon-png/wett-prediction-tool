// ============================================
// BACKTEST (nur lesen, speichert nichts)
// Vergleicht das Modell mit einfachen Regeln
// Jedes Spiel wird mit dem Stand VOR dem Anpfiff bewertet
// ============================================
const { pool } = require('../database/init');
const { calculateAllPredictions, getEloBeforeCutoff } = require('../engine/predictions');

// Welcher Ausgang hat die höchste Wahrscheinlichkeit?
function argmax(h, d, a) {
  if (h >= d && h >= a) return 'HOME';
  if (a >= h && a >= d) return 'AWAY';
  return 'DRAW';
}

async function runBacktest() {
  const res = await pool.query(
    `SELECT id, home_team_id, away_team_id, home_goals, away_goals, kick_off
     FROM matches
     WHERE status = 'FINISHED'
       AND home_goals IS NOT NULL
       AND away_goals IS NOT NULL
     ORDER BY kick_off ASC, id ASC`
  );

  const s = {
    spiele: 0,
    modell_treffer: 0,
    immer_heim_treffer: 0,
    elo_favorit_treffer: 0,
    modell_wahl: { HOME: 0, DRAW: 0, AWAY: 0 },
    tatsaechlich: { HOME: 0, DRAW: 0, AWAY: 0 }
  };

  for (const m of res.rows) {
    const ergebnis = m.home_goals > m.away_goals ? 'HOME'
      : m.home_goals === m.away_goals ? 'DRAW' : 'AWAY';

    // Modell: Vorhersage mit Stand vor dem Anpfiff
    const pred = await calculateAllPredictions(m.home_team_id, m.away_team_id, m.id);
    const p = pred.predictions;
    const modellWahl = argmax(p.home_win_prob, p.draw_prob, p.away_win_prob);

    // Regel 1: immer Heimsieg
    const immerHeim = 'HOME';

    // Regel 2: immer der ELO-Favorit (ohne Form, H2H, Aufstellung)
    const homeElo = await getEloBeforeCutoff(m.home_team_id, m.kick_off);
    const awayElo = await getEloBeforeCutoff(m.away_team_id, m.kick_off);
    const eloFavorit = homeElo >= awayElo ? 'HOME' : 'AWAY';

    s.spiele++;
    s.tatsaechlich[ergebnis]++;
    s.modell_wahl[modellWahl]++;
    if (modellWahl === ergebnis) s.modell_treffer++;
    if (immerHeim === ergebnis) s.immer_heim_treffer++;
    if (eloFavorit === ergebnis) s.elo_favorit_treffer++;
  }

  const prozent = (treffer, gesamt) =>
    gesamt > 0 ? Math.round((treffer / gesamt) * 1000) / 10 : 0;

  return {
    spiele: s.spiele,
    trefferquote_prozent: {
      modell: prozent(s.modell_treffer, s.spiele),
      immer_heimsieg: prozent(s.immer_heim_treffer, s.spiele),
      elo_favorit: prozent(s.elo_favorit_treffer, s.spiele)
    },
    modell_wahl_anzahl: s.modell_wahl,
    tatsaechliche_ergebnisse: s.tatsaechlich,
    hinweis: 'Modell ist nur sinnvoll, wenn es klar über beiden Regeln liegt. Kleine Stichprobe, Ergebnis vorsichtig lesen.'
  };
}

module.exports = { runBacktest };
