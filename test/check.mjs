// Prüft für alle Modi und Schwierigkeitsgrade:
//  - der Generator liefert nur Felder, die der Löser komplett ohne Raten löst
//  - der Löser schließt nie den echten Wert eines Feldes aus (Korrektheit)
//  - Aufdecken per Kaskade deckt nur sichere Felder auf
//  - ein Tipp ist in jedem Zwischenzustand verfügbar
//  - der Generator ist reproduzierbar und eine aufgezeichnete Partie lässt sich
//    nachspielen (so prüft der Server Einträge in die Weltrangliste)
// Aufruf: node test/check.mjs [anzahlProKombination]
import { MODES, DIFFICULTIES, Engine, generate, cascade, findHint, mulberry32, maskValue, boardForAttempt, replay, scoreGame, chordTargets, FLAG_ANY } from '../js/core.js';

const N = Number(process.argv[2] || 20);
let failures = 0;
const fail = (msg) => { failures++; console.error('FEHLER:', msg); };

for (const modeId of Object.keys(MODES)) {
  for (const diffId of Object.keys(DIFFICULTIES)) {
    const diff = DIFFICULTIES[diffId];
    const times = [], attempts = [], dens = [], depths = [];
    for (let k = 0; k < N; k++) {
      const seed = 1000 * k + 7;
      const rng = mulberry32(seed ^ 0x9e3779b9);
      const first = Math.floor(rng() * diff.cols * diff.rows);
      const b = generate(modeId, diffId, first, seed);
      times.push(b.stats.ms); attempts.push(b.stats.attempts); dens.push(b.mines / b.n); depths.push(b.stats.depth);

      // 1) Unabhängiger Lösungslauf mit Korrektheitsprüfung bei jeder Ableitung
      const e = new Engine(b);
      const orig = e.setDom.bind(e);
      e.setDom = (i, m) => {
        if (!(m & (1 << b.values[i]))) fail(`${modeId}/${diffId} seed ${seed}: echter Wert von Feld ${i} ausgeschlossen`);
        orig(i, m);
      };
      e.reveal(first);
      if (!e.run(diff.level)) fail(`${modeId}/${diffId} seed ${seed}: nicht lösbar`);
      for (let i = 0; i < b.n; i++) {
        if (b.values[i] === 0 && !e.revealed[i]) fail(`${modeId}/${diffId}: sicheres Feld ${i} nicht aufgedeckt`);
        if (MODES[modeId].full && b.values[i] && maskValue(e.dom[i]) !== b.values[i]) fail(`${modeId}: Pol ${i} nicht bestimmt`);
      }

      // Reproduzierbarkeit: gleiches Feld aus seed + Versuchsnummer
      const again = boardForAttempt(modeId, diffId, first, seed, b.stats.attempts);
      if (again.values.join() !== b.values.join()) fail(`${modeId}/${diffId}: Feld nicht reproduzierbar`);

      // 2) Simulierte Partie: immer nur dem Tipp folgen – muss bis zum Sieg reichen
      const revealed = new Uint8Array(b.n), flags = new Uint8Array(b.n);
      const moves = [{ k: 'r', i: first, t: 0 }];
      for (const c of cascade(b, revealed, first)) if (b.values[c]) fail(`${modeId}: Kaskade traf Mine`);
      let steps = 0;
      const won = () => {
        for (let i = 0; i < b.n; i++) {
          if (!b.values[i] && !revealed[i]) return false;
          if (MODES[modeId].full && b.values[i] && flags[i] !== b.values[i]) return false;
        }
        return true;
      };
      while (!won()) {
        const h = findHint(b, revealed, flags);
        if (!h) { fail(`${modeId}/${diffId} seed ${seed}: kein Tipp gefunden nach ${steps} Schritten`); break; }
        if (h.kind === 'safe') {
          if (b.values[h.cell]) { fail(`${modeId}: Tipp 'sicher' war Mine`); break; }
          for (const c of cascade(b, revealed, h.cell)) if (b.values[c]) fail(`${modeId}: Kaskade traf Mine`);
          moves.push({ k: 'r', i: h.cell, t: steps * 900 });
        } else if (h.kind === 'mine' || h.kind === 'retype' || h.kind === 'type') {
          if (!b.values[h.cell]) { fail(`${modeId}: Tipp 'Mine' war sicher`); break; }
          if (h.value && h.value !== b.values[h.cell]) fail(`${modeId}: Tipp nennt falsche Sorte`);
          // Sorte noch offen -> wie ein Mensch mit "?" markieren
          flags[h.cell] = h.value || (MODES[modeId].values === 3 ? FLAG_ANY : 1);
          moves.push({ k: 'f', i: h.cell, v: flags[h.cell], t: steps * 900 });
        }
        // Mit korrekten (auch "?"-)Markierungen darf Tippen auf eine Zahl nie eine Mine aufdecken.
        for (let i = 0; i < b.n; i++) {
          if (!revealed[i]) continue;
          for (const j of chordTargets(b, i, revealed, flags)) {
            if (b.values[j]) { fail(`${modeId}/${diffId} seed ${seed}: Zahl antippen hätte Mine ${j} aufgedeckt`); break; }
          }
        }
        if (++steps > 2000) { fail('Endlosschleife'); break; }
      }

      // 3) Nachspielen wie auf dem Server
      const rp = replay(again, moves);
      if (!rp.won) fail(`${modeId}/${diffId} seed ${seed}: Nachspielen ergibt keinen Sieg`);
      const sc = scoreGame(modeId, diffId, rp.events, rp.lastT + 1000);
      if (!(sc.total > 0)) fail('Punkte');
      const cheat = replay(again, moves.slice(0, -1));
      if (cheat.won && moves.length > 1) fail(`${modeId}: unvollständige Partie als Sieg gewertet`);
    }
    const avg = (a) => (a.reduce((s, x) => s + x, 0) / a.length);
    console.log(
      `${modeId.padEnd(9)} ${diffId.padEnd(6)} ` +
      `Zeit Ø ${avg(times).toFixed(0).padStart(5)} ms max ${String(Math.max(...times)).padStart(5)} ms | ` +
      `Versuche Ø ${avg(attempts).toFixed(1).padStart(5)} | Dichte Ø ${(avg(dens) * 100).toFixed(1)}% (Ziel ${(MODES[modeId].density[diffId] * 100).toFixed(0)}%) | Knobelschritte Ø ${avg(depths).toFixed(1)} min ${Math.min(...depths)}`
    );
  }
}
console.log(failures ? `\n${failures} Fehler` : '\nAlles in Ordnung.');
process.exit(failures ? 1 : 0);
