// Testet den Weltranglisten-Worker gegen eine SQLite-Datenbank im Speicher:
// gültige Runden werden angenommen, Schummelversuche abgelehnt.
// Aufruf: node test/api.mjs
import { readFileSync } from 'node:fs';
import worker from '../worker/src/index.js';
import { createD1 } from '../worker/d1-sqlite.mjs';
import { generate, cascade, findHint, MODES } from '../js/core.js';

const db = createD1();
db.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
const env = { DB: db, ALLOWED_ORIGINS: 'https://test.github.io' };
const ORIGIN = 'https://test.github.io';

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error('FEHLER:', msg); } else console.log('ok  ', msg); };

async function call(path, body, origin = ORIGIN) {
  const init = body
    ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', Origin: origin } }
    : { headers: { Origin: origin } };
  const r = await worker.fetch(new Request('https://api.test' + path, init), env);
  return { status: r.status, data: await r.json() };
}

// Spielt eine Partie nur mit beweisbaren Zügen und zeichnet sie auf.
function playByHints(mode, diff, seed, first) {
  const b = generate(mode, diff, first, seed);
  const revealed = new Uint8Array(b.n), flags = new Uint8Array(b.n);
  cascade(b, revealed, first);
  const moves = [{ k: 'r', i: first, t: 0 }];
  for (let s = 1; s < 3000; s++) {
    const h = findHint(b, revealed, flags);
    if (!h) break;
    if (h.kind === 'safe') { cascade(b, revealed, h.cell); moves.push({ k: 'r', i: h.cell, t: s * 5 }); }
    else { flags[h.cell] = h.value || b.values[h.cell]; moves.push({ k: 'f', i: h.cell, v: flags[h.cell], t: s * 5 }); }
  }
  return { b, moves };
}

for (const mode of Object.keys(MODES)) {
  const s1 = await call('/api/start', { mode, diff: 'easy' });
  check(s1.status === 200 && s1.data.id && Number.isInteger(s1.data.seed), `${mode}: Runde starten`);
  const { b, moves } = playByHints(mode, 'easy', s1.data.seed, 35);
  const f1 = await call('/api/finish', { id: s1.data.id, first: 35, attempt: b.stats.attempts, moves });
  check(f1.status === 200 && f1.data.ok && f1.data.score > 0, `${mode}: echter Sieg wird angenommen (${f1.data.score} Punkte)`);
  const c1 = await call('/api/claim', { id: s1.data.id, name: '  Chris  ' });
  check(c1.status === 200 && c1.data.name === 'Chris' && c1.data.rank === 1, `${mode}: Name eintragen`);
  check((await call('/api/claim', { id: s1.data.id, name: 'Nochmal' })).status === 409, `${mode}: Name nur einmal`);
  check((await call('/api/finish', { id: s1.data.id, first: 35, attempt: b.stats.attempts, moves })).status === 409, `${mode}: Runde nur einmal werten`);

  // Schummeln: unvollständige Partie
  const s2 = await call('/api/start', { mode, diff: 'easy' });
  const p2 = playByHints(mode, 'easy', s2.data.seed, 35);
  const f2 = await call('/api/finish', { id: s2.data.id, first: 35, attempt: p2.b.stats.attempts, moves: p2.moves.slice(0, -2) });
  check(f2.status === 422, `${mode}: unvollständige Partie abgelehnt`);

  // Schummeln: Züge eines anderen Feldes (fremder Seed)
  const s3 = await call('/api/start', { mode, diff: 'easy' });
  const f3 = await call('/api/finish', { id: s3.data.id, first: 35, attempt: p2.b.stats.attempts, moves: p2.moves });
  check(f3.status === 422, `${mode}: Züge für ein anderes Feld abgelehnt`);

  // Schummeln: Zeitstempel weit in der Zukunft
  const s4 = await call('/api/start', { mode, diff: 'easy' });
  const p4 = playByHints(mode, 'easy', s4.data.seed, 35);
  p4.moves.forEach((m) => { m.t += 600000; });
  p4.moves[0].t = 0;
  const f4 = await call('/api/finish', { id: s4.data.id, first: 35, attempt: p4.b.stats.attempts, moves: p4.moves });
  check(f4.status === 422, `${mode}: gefälschte Zeitstempel abgelehnt`);
}

const bad = await call('/api/start', { mode: 'weighted', diff: 'easy' }, 'https://evil.example');
check(bad.status === 403, 'fremde Webseite wird abgewiesen');
const badName = await call('/api/claim', { id: 'x', name: 'a' });
check(badName.status === 400, 'zu kurzer Name abgelehnt');
const list = await call('/api/scores?mode=magnet&diff=easy');
check(list.status === 200 && list.data.scores.length === 1 && list.data.scores[0].name === 'Chris', 'Bestenliste abrufen');

console.log(failures ? `\n${failures} Fehler` : '\nAlles in Ordnung.');
process.exit(failures ? 1 : 0);
