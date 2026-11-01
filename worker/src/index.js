// Knobelfeld – Weltrangliste als Cloudflare Worker mit D1-Datenbank.
//
// Ablauf einer Runde:
//   POST /api/start  { mode, diff }                     -> { id, seed }
//   POST /api/finish { id, first, attempt, moves }      -> { ok, score, time, rank, total }
//   POST /api/claim  { id, name }                       -> { rank, total }
//   GET  /api/scores?mode=..&diff=..&limit=..           -> { scores: [...] }
//
// Der Server vertraut keiner Punktzahl aus dem Browser: Er baut das Feld aus
// seed + Versuchsnummer nach, spielt die aufgezeichneten Züge nach, misst die
// Zeit mit seiner eigenen Uhr und rechnet die Punkte selbst aus.
import { MODES, DIFFICULTIES, MAX_ATTEMPT, boardForAttempt, replay, scoreGame } from '../../js/core.js';

const HOUR = 3600 * 1000;
const MAX_GAME_MS = 6 * HOUR; // ältere Runden zählen nicht mehr
const CLAIM_MS = 24 * HOUR; // so lange kann ein Name nachgetragen werden

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const originOk = !origin || allowed.includes('*') || allowed.includes(origin);
    const cors = originOk && origin
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : {};
    const json = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors, ...extra } });

    if (!originOk) return json({ error: 'origin' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    try {
      if (req.method === 'GET' && url.pathname === '/api/scores') return await scores(url, env, json);
      if (req.method === 'POST') {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') return json({ error: 'body' }, 400);
        if (url.pathname === '/api/start') return await start(body, env, json);
        if (url.pathname === '/api/finish') return await finish(body, env, json);
        if (url.pathname === '/api/claim') return await claim(body, env, json);
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'server' }, 500);
    }
  },
};

const validBoard = (mode, diff) => Object.hasOwn(MODES, mode) && Object.hasOwn(DIFFICULTIES, diff);

async function start(body, env, json) {
  const { mode, diff } = body;
  if (!validBoard(mode, diff)) return json({ error: 'mode' }, 400);
  const now = Date.now();
  const id = crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  // Gelegentlich aufräumen: alte Runden ohne Namen braucht niemand mehr.
  if (Math.random() < 0.05) {
    await env.DB.prepare('DELETE FROM games WHERE name IS NULL AND started_at < ?').bind(now - CLAIM_MS - MAX_GAME_MS).run();
  }
  await env.DB.prepare('INSERT INTO games (id, mode, diff, seed, started_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, mode, diff, seed, now).run();
  return json({ id, seed });
}

async function finish(body, env, json) {
  const { id, first, attempt, moves } = body;
  const now = Date.now();
  const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(String(id)).first();
  if (!game) return json({ error: 'unknown game' }, 404);
  if (game.finished_at) return json({ error: 'already finished' }, 409);
  const elapsed = now - game.started_at;
  if (elapsed > MAX_GAME_MS) return json({ error: 'expired' }, 410);
  const d = DIFFICULTIES[game.diff];
  if (!Number.isInteger(first) || first < 0 || first >= d.cols * d.rows) return json({ error: 'first' }, 400);
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_ATTEMPT) return json({ error: 'attempt' }, 400);

  // Runde ist ab jetzt verbraucht – egal, ob gültig oder nicht.
  await env.DB.prepare('UPDATE games SET finished_at = ? WHERE id = ?').bind(now, game.id).run();

  const board = boardForAttempt(game.mode, game.diff, first, game.seed, attempt);
  let result;
  try {
    result = replay(board, moves);
  } catch {
    return json({ ok: false, error: 'invalid moves' }, 422);
  }
  // Die Zeitstempel des Browsers dürfen nicht später liegen als die Serveruhr erlaubt.
  if (!result.won || result.lastT > elapsed + 3000) return json({ ok: false, error: 'not won' }, 422);

  const s = scoreGame(game.mode, game.diff, result.events, elapsed);
  await env.DB.prepare('UPDATE games SET score = ?, time_ms = ?, hints = ? WHERE id = ?')
    .bind(s.total, elapsed, s.hints, game.id).run();
  const { rank, total } = await rankOf(env, game.mode, game.diff, s.total, elapsed);
  return json({ ok: true, score: s.total, points: s.points, bonus: s.bonus, time: elapsed, rank, total: total + 1 });
}

function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim();
  const len = [...name].length;
  return len >= 2 && len <= 16 ? name : null;
}

async function claim(body, env, json) {
  const name = cleanName(body.name);
  if (!name) return json({ error: 'name' }, 400);
  const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(String(body.id)).first();
  if (!game || game.score == null) return json({ error: 'unknown game' }, 404);
  if (game.name) return json({ error: 'already claimed' }, 409);
  if (Date.now() - game.finished_at > CLAIM_MS) return json({ error: 'expired' }, 410);
  await env.DB.prepare('UPDATE games SET name = ? WHERE id = ?').bind(name, game.id).run();
  const { rank, total } = await rankOf(env, game.mode, game.diff, game.score, game.time_ms);
  return json({ ok: true, name, rank, total });
}

async function rankOf(env, mode, diff, score, time) {
  const r = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN score > ?3 OR (score = ?3 AND time_ms < ?4) THEN 1 ELSE 0 END) AS better,
       COUNT(*) AS total
     FROM games WHERE mode = ?1 AND diff = ?2 AND name IS NOT NULL`
  ).bind(mode, diff, score, time).first();
  return { rank: (r?.better || 0) + 1, total: r?.total || 0 };
}

async function scores(url, env, json) {
  const mode = url.searchParams.get('mode'), diff = url.searchParams.get('diff');
  if (!validBoard(mode, diff)) return json({ error: 'mode' }, 400);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const { results } = await env.DB.prepare(
    `SELECT name, score, time_ms AS time, hints, finished_at AS date
     FROM games WHERE mode = ? AND diff = ? AND name IS NOT NULL
     ORDER BY score DESC, time_ms ASC LIMIT ?`
  ).bind(mode, diff, limit).all();
  return json({ scores: results }, 200, { 'Cache-Control': 'public, max-age=10' });
}
