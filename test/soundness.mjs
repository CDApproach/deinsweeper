// Unabhängige Gegenprobe für den Löser: Auf kleinen Feldern werden ALLE
// Belegungen der verdeckten Felder durchprobiert, die zu den sichtbaren Zahlen
// passen (berechnet mit mode.clue, also ohne die Constraints des Lösers).
// Jede Schlussfolgerung des Lösers muss in jeder dieser Belegungen stimmen –
// sonst hätte er etwas "bewiesen", das in Wahrheit offen ist, und man müsste raten.
// Aufruf: node test/soundness.mjs [rundenProModus]
import { MODES, Engine, mulberry32 } from '../js/core.js';

const ROUNDS = Number(process.argv[2] || 300);
let failures = 0;

function smallBoard(modeId, cols, rows, rng, density) {
  const mode = MODES[modeId];
  const b = { mode: modeId, cols, rows, n: cols * rows, values: new Uint8Array(cols * rows) };
  for (let i = 0; i < b.n; i++) if (rng() < density) b.values[i] = mode.mineValue(rng, 'hard');
  b.mines = b.values.filter(Boolean).length;
  b.safeCount = b.n - b.mines;
  b.clues = Array.from({ length: b.n }, (_, i) => (b.values[i] ? null : mode.clue(b, i)));
  return b;
}

// Alle zu den sichtbaren Zahlen passenden Belegungen – liefert je Feld die möglichen Werte.
function bruteForce(b, revealed) {
  const mode = MODES[b.mode];
  const hidden = [];
  for (let i = 0; i < b.n; i++) if (!revealed[i]) hidden.push(i);
  const clueCells = [];
  for (let i = 0; i < b.n; i++) if (revealed[i]) clueCells.push(i);
  // Ein Hinweis kann geprüft werden, sobald alle Felder belegt sind, die ihn beeinflussen.
  const deps = new Map(clueCells.map((i) => [i, new Set(mode.constraints(b, i).flatMap((c) => c.cells))]));
  const pos = new Map(hidden.map((c, k) => [c, k]));
  const checkAt = Array.from({ length: hidden.length }, () => []);
  for (const i of clueCells) {
    let last = -1;
    for (const c of deps.get(i)) if (pos.has(c)) last = Math.max(last, pos.get(c));
    if (last >= 0) checkAt[last].push(i);
  }
  const tmp = { ...b, values: Uint8Array.from(b.values) };
  for (const c of hidden) tmp.values[c] = 0;
  const possible = new Map(hidden.map((c) => [c, 0]));
  let solutions = 0;
  const same = (a, c) => a.length === c.length && a.every((x, k) => x === c[k]);
  const rec = (k) => {
    if (k === hidden.length) {
      solutions++;
      for (const c of hidden) possible.set(c, possible.get(c) | (1 << tmp.values[c]));
      return;
    }
    for (let v = 0; v < mode.values; v++) {
      tmp.values[hidden[k]] = v;
      if (checkAt[k].every((i) => same(mode.clue(tmp, i), b.clues[i]))) rec(k + 1);
    }
    tmp.values[hidden[k]] = 0;
  };
  rec(0);
  return { possible, solutions };
}

for (const modeId of Object.keys(MODES)) {
  const rng = mulberry32(4242 + modeId.length);
  let checked = 0, deductions = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const b = smallBoard(modeId, 5, 5, rng, 0.18 + rng() * 0.14);
    // Zufälliger Spielstand: ein Teil der sicheren Felder ist offen, höchstens 13 verdeckt.
    const revealed = new Uint8Array(b.n);
    const safe = [];
    for (let i = 0; i < b.n; i++) if (!b.values[i]) safe.push(i);
    for (const i of safe) if (rng() < 0.6) revealed[i] = 1;
    let hiddenCount = b.n - revealed.reduce((s, x) => s + x, 0);
    for (const i of safe) { if (hiddenCount <= 13) break; if (!revealed[i]) { revealed[i] = 1; hiddenCount--; } }
    if (!revealed.some(Boolean)) continue;

    const e = new Engine(b, { autoReveal: false, budget: 1e6 });
    for (let i = 0; i < b.n; i++) if (revealed[i]) e.reveal(i);
    e.run(3, () => false);
    const { possible, solutions } = bruteForce(b, revealed);
    if (!solutions) { failures++; console.error(`${modeId}: Brute-Force findet nicht einmal die echte Lösung (Testfehler)`); continue; }
    for (const [c, mask] of possible) {
      if ((e.dom[c] & mask) !== mask) {
        failures++;
        console.error(`FEHLER ${modeId} Runde ${r}: Feld ${c} – Löser erlaubt ${e.dom[c].toString(2)}, möglich sind ${mask.toString(2)}`);
      }
      if (e.dom[c] !== (1 << MODES[modeId].values) - 1) deductions++;
    }
    checked++;
  }
  console.log(`${modeId.padEnd(9)} ${checked} Spielstände geprüft, ${deductions} Schlussfolgerungen gegengeprüft`);
}
console.log(failures ? `\n${failures} Fehler` : '\nLöser ist korrekt: keine einzige unbelegte Schlussfolgerung.');
process.exit(failures ? 1 : 0);
