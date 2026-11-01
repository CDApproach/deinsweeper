// Knobelfeld – Spielkern: Varianten, Generator und logischer Löser.
// Kein DOM-Zugriff, damit der Code im Web Worker und in Node-Tests läuft.
//
// Jedes Feld hat einen Wert: 0 = sicher, 1/2 = Mine (Bedeutung je nach Modus).
// Jeder aufgedeckte Hinweis wird zu Constraints der Form
//   tmin <= Summe(w[wert(zelle)]) <= tmax
// Der Löser arbeitet nur mit diesen Constraints – also genau mit dem, was
// auch die Spielerin/der Spieler sieht. Ein Feld gilt nur dann als lösbar,
// wenn der Löser vom ersten Klick aus ohne Raten alles aufdecken kann.

export const DIFFICULTIES = {
  // level: wie viele Hinweise der Löser höchstens kombinieren darf
  // deep: wie viele solcher Kombinationsschritte ein Feld mindestens braucht
  easy: { id: 'easy', name: 'Leicht', cols: 8, rows: 10, level: 2, deep: 1, base: 1000, par: 60 },
  medium: { id: 'medium', name: 'Mittel', cols: 9, rows: 12, level: 2, deep: 3, base: 2500, par: 150 },
  hard: { id: 'hard', name: 'Schwer', cols: 10, rows: 14, level: 3, deep: 5, base: 5000, par: 300 },
};

const coords = (b, i) => [i % b.cols, (i / b.cols) | 0];

function nb8(b, i) {
  const [x, y] = coords(b, i);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < b.cols && ny < b.rows) out.push(ny * b.cols + nx);
    }
  }
  return out;
}

// Felder mit Schachbrett-Abstand genau d (d >= 1).
function ringAt(b, i, d) {
  const [x, y] = coords(b, i);
  const out = [];
  for (let dy = -d; dy <= d; dy++) {
    for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < b.cols && ny < b.rows) out.push(ny * b.cols + nx);
    }
  }
  return out;
}

function within(b, i, r) {
  const out = [];
  for (let d = 1; d <= r; d++) out.push(...ringAt(b, i, d));
  return out;
}

// Kompassrose: die 8 Nachbarn plus je ein Feld zwei Schritte nach N, O, S, W.
const ROSE = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -2], [2, 0], [0, 2], [-2, 0]];
function rose(b, i) {
  const [x, y] = coords(b, i);
  const out = [];
  for (const [dx, dy] of ROSE) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < b.cols && ny < b.rows) out.push(ny * b.cols + nx);
  }
  return out;
}

export const MODES = {
  weighted: {
    id: 'weighted',
    values: 3,
    full: false,
    density: { easy: 0.15, medium: 0.18, hard: 0.2 },
    heavy: { easy: 0.3, medium: 0.4, hard: 0.5 },
    mineValue(rng, diff) { return rng() < this.heavy[diff] ? 2 : 1; },
    safeZone: (b, i) => [i, ...nb8(b, i)],
    clue(b, i) {
      let s = 0;
      for (const j of nb8(b, i)) s += b.values[j];
      return [s];
    },
    constraints(b, i) {
      const s = b.clues[i][0];
      return [{ cells: nb8(b, i), w: [0, 1, 2], tmin: s, tmax: s, pos: true, show: true }];
    },
  },

  echolot: {
    id: 'echolot',
    values: 2,
    full: false,
    density: { easy: 0.17, medium: 0.2, hard: 0.23 },
    mineValue: () => 1,
    safeZone: (b, i) => [i, ...nb8(b, i)],
    clue(b, i) {
      for (let d = 1; ; d++) {
        const ring = ringAt(b, i, d);
        if (!ring.length) return [0, 0];
        let k = 0;
        for (const j of ring) k += b.values[j];
        if (k) return [d, k];
      }
    },
    constraints(b, i) {
      const [d, k] = b.clues[i];
      const out = [];
      if (d >= 2) out.push({ cells: within(b, i, d - 1), w: [0, 1], tmin: 0, tmax: 0, pos: true, show: false });
      out.push({ cells: ringAt(b, i, d), w: [0, 1], tmin: k, tmax: k, pos: true, show: true });
      return out;
    },
  },

  kompass: {
    id: 'kompass',
    values: 2,
    full: false,
    density: { easy: 0.22, medium: 0.25, hard: 0.28 },
    mineValue: () => 1,
    safeZone: (b, i) => [i, ...rose(b, i)],
    clue(b, i) {
      let k = 0;
      for (const j of rose(b, i)) k += b.values[j];
      return [k];
    },
    constraints(b, i) {
      const k = b.clues[i][0];
      return [{ cells: rose(b, i), w: [0, 1], tmin: k, tmax: k, pos: true, show: true }];
    },
  },

  magnet: {
    id: 'magnet',
    values: 3, // 1 = Pluspol, 2 = Minuspol
    full: true, // alle Pole müssen bestimmt werden
    density: { easy: 0.15, medium: 0.18, hard: 0.2 },
    mineValue: (rng) => (rng() < 0.5 ? 1 : 2),
    safeZone: (b, i) => [i, ...nb8(b, i)],
    clue(b, i) {
      let k = 0, diff = 0;
      for (const j of nb8(b, i)) {
        if (b.values[j] === 1) { k++; diff++; } else if (b.values[j] === 2) { k++; diff--; }
      }
      return [k, Math.sign(diff)];
    },
    constraints(b, i) {
      const [k, s] = b.clues[i];
      const cells = nb8(b, i);
      const out = [{ cells, w: [0, 1, 1], tmin: k, tmax: k, pos: true, show: true }];
      if (k > 0) {
        out.push({ cells, w: [0, 1, -1], tmin: s > 0 ? 1 : s < 0 ? -99 : 0, tmax: s > 0 ? 99 : s < 0 ? -1 : 0, pos: false, show: false });
      }
      return out;
    },
  },
};

// ---------------------------------------------------------------- Zufall

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- Brett

export function makeBoard(modeId, diffId, first, rng, density) {
  const mode = MODES[modeId], diff = DIFFICULTIES[diffId];
  const b = { mode: modeId, diff: diffId, cols: diff.cols, rows: diff.rows, n: diff.cols * diff.rows, first };
  b.values = new Uint8Array(b.n);
  const safe = new Set(mode.safeZone(b, first));
  const cand = [];
  for (let i = 0; i < b.n; i++) if (!safe.has(i)) cand.push(i);
  const count = Math.min(cand.length, Math.round(b.n * density));
  for (let k = 0; k < count; k++) {
    const r = k + Math.floor(rng() * (cand.length - k));
    [cand[k], cand[r]] = [cand[r], cand[k]];
    b.values[cand[k]] = mode.mineValue(rng, diffId);
  }
  b.mines = count;
  b.safeCount = b.n - count;
  b.clues = new Array(b.n).fill(null);
  for (let i = 0; i < b.n; i++) if (!b.values[i]) b.clues[i] = mode.clue(b, i);
  return b;
}

// ---------------------------------------------------------------- Löser

const VAL = [-1, 0, 1, -1, 2, -1, -1, -1]; // Domain-Bitmaske -> Wert
const single = (m) => (m & (m - 1)) === 0;
export const maskValue = (m) => VAL[m];
export const isSingle = single;

function prep(c) {
  if (c.minW) return;
  c.minW = new Int16Array(8);
  c.maxW = new Int16Array(8);
  for (let m = 1; m < 8; m++) {
    let lo = Infinity, hi = -Infinity;
    for (let v = 0; v < c.w.length; v++) {
      if (m & (1 << v)) { lo = Math.min(lo, c.w[v]); hi = Math.max(hi, c.w[v]); }
    }
    c.minW[m] = lo === Infinity ? 0 : lo;
    c.maxW[m] = hi === -Infinity ? 0 : hi;
  }
}

// Ein Hinweisfeld ("Gruppe") ist die Einheit, in der ein Mensch denkt.
// Stufe 1: ein Hinweis allein. Stufe 2: zwei überlappende Hinweise zusammen.
// Stufe 3: drei zusammenhängende Hinweise.
export class Engine {
  constructor(b, { autoReveal = true, budget = 30000 } = {}) {
    this.b = b;
    this.mode = MODES[b.mode];
    const n = b.n;
    this.dom = new Uint8Array(n).fill((1 << this.mode.values) - 1);
    this.revealed = new Uint8Array(n);
    this.revealedCount = 0;
    this.groups = [];
    this.cellGroups = Array.from({ length: n }, () => []);
    this.autoReveal = autoReveal;
    this.budget = budget;
    this.pending = [];
    this.changes = [];
    this.cache = new Map();
    this.lastReason = null;
    this.reasonAll = new Set(); // alle Hinweise, die bisher zu einer Ableitung beigetragen haben
    this.stamp = new Int32Array(n);
    this.st = 0;
    this.mask = new Uint16Array(n);
    this.vars = new Int32Array(n);
    this.asg = new Int8Array(n);
    this.supStamp = new Int32Array(n);
    this.sup = new Uint8Array(n);
    this.sst = 0;
    this.S = new Int32Array(16);
    this.LO = new Int32Array(16);
    this.HI = new Int32Array(16);
    this.nv = 0;
    this.deep = 0; // Anzahl Schritte, die mehrere Hinweise kombinieren
  }

  reveal(i) {
    if (this.revealed[i]) return;
    this.revealed[i] = 1;
    this.revealedCount++;
    this.setDom(i, 1);
    const cons = this.mode.constraints(this.b, i);
    const g = { owner: i, cons, ver: 0, unk: 0, id: this.groups.length, dirty: true, cells: [] };
    const seen = new Set();
    for (const c of cons) {
      prep(c);
      for (const cell of c.cells) {
        if (seen.has(cell)) continue;
        seen.add(cell);
        g.cells.push(cell);
        this.cellGroups[cell].push(g);
        if (!single(this.dom[cell])) g.unk++;
      }
    }
    this.groups.push(g);
  }

  setDom(i, m) {
    const old = this.dom[i];
    if (old === m) return;
    if (m === 0) throw new Error('Widerspruch in Feld ' + i);
    this.dom[i] = m;
    const nowSingle = single(m) && !single(old);
    for (const g of this.cellGroups[i]) {
      g.ver++;
      g.dirty = true;
      if (nowSingle) g.unk--;
    }
    this.changes.push(i);
    if (m === 1 && !this.revealed[i] && this.autoReveal) this.pending.push(i);
  }

  flush() {
    while (this.pending.length) this.reveal(this.pending.pop());
  }

  // Gibt 1 (erfüllbar), 0 (unmöglich) oder -1 (Suchbudget erschöpft) zurück.
  sat(cons, x, u) {
    const dom = this.dom, K = cons.length, vars = this.vars, mask = this.mask;
    const st = ++this.st;
    let nv = 0;
    for (let k = 0; k < K; k++) {
      for (const cell of cons[k].cells) {
        if (single(dom[cell])) continue;
        if (this.stamp[cell] !== st) { this.stamp[cell] = st; mask[cell] = 0; vars[nv++] = cell; }
        mask[cell] |= 1 << k;
      }
    }
    let xi = -1;
    for (let j = 0; j < nv; j++) if (vars[j] === x) { xi = j; break; }
    if (xi < 0) return 1;
    vars[xi] = vars[0];
    vars[0] = x;
    this.nv = nv;
    const S = this.S, LO = this.LO, HI = this.HI;
    for (let k = 0; k < K; k++) {
      const c = cons[k];
      let s = 0, lo = 0, hi = 0;
      for (const cell of c.cells) {
        const m = dom[cell];
        if (single(m)) s += c.w[VAL[m]];
        else { lo += c.minW[m]; hi += c.maxW[m]; }
      }
      S[k] = s; LO[k] = lo; HI[k] = hi;
      if (s + lo > c.tmax || s + hi < c.tmin) return 0;
    }
    let nodes = 0;
    const budget = this.budget, asg = this.asg;
    const rec = (j) => {
      if (j === nv) return 1;
      if (++nodes > budget) return -1;
      const cell = vars[j], m = dom[cell], cm = mask[cell];
      const vals = j === 0 ? 1 << u : m;
      for (let v = 0; v < 3; v++) {
        if (!(vals & (1 << v))) continue;
        let ok = true;
        for (let k = 0; k < K; k++) {
          if (!(cm & (1 << k))) continue;
          const c = cons[k];
          S[k] += c.w[v]; LO[k] -= c.minW[m]; HI[k] -= c.maxW[m];
          if (S[k] + LO[k] > c.tmax || S[k] + HI[k] < c.tmin) ok = false;
        }
        if (ok) {
          asg[j] = v;
          const r = rec(j + 1);
          if (r !== 0) return r;
        }
        for (let k = 0; k < K; k++) {
          if (!(cm & (1 << k))) continue;
          const c = cons[k];
          S[k] -= c.w[v]; LO[k] += c.minW[m]; HI[k] += c.maxW[m];
        }
      }
      return 0;
    };
    return rec(0);
  }

  // Schließt für eine Menge von Constraints alle unmöglichen Werte aus.
  deduce(cons) {
    const dom = this.dom, sst = ++this.sst, sup = this.sup, supStamp = this.supStamp;
    const list = [];
    for (const c of cons) {
      for (const cell of c.cells) {
        if (single(dom[cell]) || supStamp[cell] === sst) continue;
        supStamp[cell] = sst;
        sup[cell] = 0;
        list.push(cell);
      }
    }
    let changed = false;
    for (const x of list) {
      for (let v = 0; v < 3; v++) {
        if (single(dom[x])) break;
        const bit = 1 << v;
        if (!(dom[x] & bit) || (sup[x] & bit)) continue;
        const r = this.sat(cons, x, v);
        if (r === 1) {
          for (let j = 0; j < this.nv; j++) {
            const cell = this.vars[j];
            if (supStamp[cell] === sst) sup[cell] |= 1 << this.asg[j];
          }
        } else if (r === 0) {
          this.setDom(x, dom[x] & ~bit);
          changed = true;
        } else {
          sup[x] |= bit;
        }
      }
    }
    return changed;
  }

  level1(done) {
    let changed = false;
    for (let gi = 0; gi < this.groups.length; gi++) {
      const g = this.groups[gi];
      if (!g.dirty || g.unk === 0) continue;
      const hit = this.deduce(g.cons);
      g.dirty = false;
      if (hit) {
        changed = true;
        this.lastReason = [g.owner];
        this.reasonAll.add(g.owner);
        this.flush();
        if (done()) return true;
      }
    }
    return changed;
  }

  neighbours(g, memo) {
    let s = memo.get(g);
    if (s) return s;
    s = new Set();
    for (const cell of g.cells) {
      if (single(this.dom[cell])) continue;
      for (const h of this.cellGroups[cell]) if (h !== g && h.unk > 0) s.add(h);
    }
    memo.set(g, s);
    return s;
  }

  trySet(gs) {
    const ids = gs.map((g) => g.id).sort((a, b) => a - b);
    const key = ids.join(',');
    const sig = gs.map((g) => g.id + ':' + g.ver).sort().join(',');
    if (this.cache.get(key) === sig) return false;
    const cons = [];
    for (const g of gs) cons.push(...g.cons);
    const hit = this.deduce(cons);
    this.cache.set(key, gs.map((g) => g.id + ':' + g.ver).sort().join(','));
    if (hit) {
      this.lastReason = gs.map((g) => g.owner);
      for (const g of gs) this.reasonAll.add(g.owner);
      this.flush();
    }
    return hit;
  }

  levelK(K) {
    const memo = new Map();
    const tried = new Set();
    const active = this.groups.filter((g) => g.unk > 0);
    for (const g of active) {
      const n1 = this.neighbours(g, memo);
      for (const h of n1) {
        if (K === 2) {
          if (h.id < g.id) continue;
          if (this.trySet([g, h])) return true;
          continue;
        }
        const n2 = new Set([...n1, ...this.neighbours(h, memo)]);
        for (const i of n2) {
          if (i === g || i === h) continue;
          const key = [g.id, h.id, i.id].sort((a, b) => a - b).join(',');
          if (tried.has(key)) continue;
          tried.add(key);
          if (this.trySet([g, h, i])) return true;
        }
      }
    }
    return false;
  }

  solved() {
    if (this.revealedCount < this.b.safeCount) return false;
    if (!this.mode.full) return true;
    for (let i = 0; i < this.b.n; i++) if (this.b.values[i] && !single(this.dom[i])) return false;
    return true;
  }

  run(maxLevel, done = () => this.solved()) {
    this.flush();
    for (;;) {
      if (done()) return true;
      if (this.level1(done)) continue;
      if (maxLevel >= 2 && this.levelK(2)) { this.deep++; continue; }
      if (maxLevel >= 3 && this.levelK(3)) { this.deep++; continue; }
      return done();
    }
  }
}

// Liefert -1, wenn nicht ohne Raten lösbar, sonst die Zahl der Kombinationsschritte.
export function solveDepth(b, level) {
  const e = new Engine(b);
  e.reveal(b.first);
  return e.run(level) ? e.deep : -1;
}

// ---------------------------------------------------------------- Generator

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Obergrenze, die der Server bei der Versuchsnummer akzeptiert (real: < 300).
export const MAX_ATTEMPT = 5000;

// Jeder Versuch hat seinen eigenen, aus (seed, attempt) abgeleiteten Zufall.
// So kann der Server ein Feld aus seed + Versuchsnummer in Mikrosekunden
// nachbauen, ohne den Löser erneut laufen zu lassen.
export function boardForAttempt(modeId, diffId, first, seed, attempt) {
  const density = Math.max(0.06, MODES[modeId].density[diffId] - 0.005 * Math.floor((attempt - 1) / 40));
  const rng = mulberry32(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(attempt, 0xc2b2ae35));
  const b = makeBoard(modeId, diffId, first, rng, density);
  b.seed = seed >>> 0;
  b.attempt = attempt;
  return b;
}

// Erzeugt so lange Zufallsfelder, bis eines rein logisch lösbar ist und
// genug echte Knobel-Schritte enthält. Gibt es nach vielen Versuchen keins,
// werden zuerst die Knobel-Anforderung und dann die Dichte gelockert –
// lösbar ist das Ergebnis in jedem Fall, das wird nie aufgeweicht.
// Das Ergebnis hängt nur von den Argumenten ab (keine Uhrzeit), damit der
// Server es für die Weltrangliste nachprüfen kann.
export function generate(modeId, diffId, first, seed = (Math.random() * 2 ** 32) >>> 0) {
  const diff = DIFFICULTIES[diffId];
  let minDeep = diff.deep;
  const t0 = now();
  for (let attempt = 1; ; attempt++) {
    const b = boardForAttempt(modeId, diffId, first, seed, attempt);
    const depth = solveDepth(b, diff.level);
    if (depth >= minDeep) {
      b.stats = { attempts: attempt, ms: Math.round(now() - t0), density: b.mines / b.n, depth };
      return b;
    }
    if (attempt % 60 === 0 && minDeep > 0) minDeep--;
  }
}

// ---------------------------------------------------------------- Punkte

export const COMBO_MS = 4000;
export const HINT_FACTOR = 0.8;

// events: [{ t, count }] für jedes Aufdecken, [{ t, hint: true }] für Tipps.
// Wird im Browser und auf dem Server identisch gerechnet.
export function scoreGame(modeId, diffId, events, elapsedMs) {
  let combo = 0, last = -Infinity, points = 0, maxCombo = 0, hints = 0;
  for (const e of events) {
    if (e.hint) { hints++; combo = 0; continue; }
    combo = e.t - last < COMBO_MS ? Math.min(combo + 1, 10) : 1;
    last = e.t;
    maxCombo = Math.max(maxCombo, combo);
    points += 10 * combo + Math.min(e.count - 1, 20);
  }
  const d = DIFFICULTIES[diffId];
  const par = d.par * (modeId === 'kompass' || modeId === 'magnet' ? 1.2 : 1);
  const mult = 0.3 + 1.7 * Math.exp(-(elapsedMs / 1000) / par);
  const bonus = Math.round(d.base * mult * HINT_FACTOR ** hints);
  return { points, bonus, total: points + bonus, mult, maxCombo, hints };
}

// Spielt eine aufgezeichnete Partie nach.
// moves: { k: 'r'|'c'|'f'|'h', i, v, t } – Aufdecken, Zahl antippen, Markierung, Tipp.
// Wirft bei ungültigen Zügen einen Fehler; won ist nur true bei echtem Sieg.
export function replay(b, moves) {
  if (!Array.isArray(moves) || !moves.length || moves.length > 4000) throw new Error('moves');
  const mode = MODES[b.mode];
  const revealed = new Uint8Array(b.n), flags = new Uint8Array(b.n);
  const flagValues = mode.values === 3 ? [0, 1, 2] : [0, 1];
  const events = [];
  let lastT = 0;
  const cellOk = (i) => Number.isInteger(i) && i >= 0 && i < b.n;
  for (let k = 0; k < moves.length; k++) {
    const m = moves[k];
    if (!m || typeof m.t !== 'number' || !(m.t >= lastT) || !Number.isFinite(m.t)) throw new Error('time');
    lastT = m.t;
    if (k === 0 && (m.k !== 'r' || m.i !== b.first)) throw new Error('first');
    if (m.k === 'h') { events.push({ t: m.t, hint: true }); continue; }
    if (!cellOk(m.i)) throw new Error('cell');
    if (m.k === 'f') {
      if (revealed[m.i] || !flagValues.includes(m.v)) throw new Error('flag');
      flags[m.i] = m.v;
      continue;
    }
    let starts;
    if (m.k === 'r') {
      if (revealed[m.i] || flags[m.i]) throw new Error('reveal');
      starts = [m.i];
    } else if (m.k === 'c') {
      if (!revealed[m.i]) throw new Error('chord');
      starts = chordTargets(b, m.i, revealed, flags);
      if (!starts.length) throw new Error('chord');
    } else {
      throw new Error('kind');
    }
    if (starts.some((s) => b.values[s])) return { won: false, events, lastT };
    let count = 0;
    for (const s of starts) {
      for (const j of cascade(b, revealed, s)) { flags[j] = 0; count++; }
    }
    events.push({ t: m.t, count });
  }
  for (let i = 0; i < b.n; i++) {
    if (!b.values[i] && !revealed[i]) return { won: false, events, lastT };
    if (mode.full && b.values[i] && flags[i] !== b.values[i]) return { won: false, events, lastT };
  }
  return { won: true, events, lastT };
}

// ---------------------------------------------------------------- Spielhilfen

// Felder, die der Hinweis von i direkt als sicher ausweist (z. B. eine 0).
export function zeroSafe(b, i) {
  const out = [];
  for (const c of MODES[b.mode].constraints(b, i)) if (c.pos && c.tmax === 0) out.push(...c.cells);
  return out;
}

// Deckt i auf und folgt automatisch allen "offensichtlich sicheren" Feldern.
// Liefert die neu aufgedeckten Felder in Wellen-Reihenfolge.
export function cascade(b, revealed, start) {
  const out = [];
  if (revealed[start]) return out;
  const queue = [start];
  revealed[start] = 1;
  while (queue.length) {
    const i = queue.shift();
    out.push(i);
    if (b.values[i]) continue;
    for (const j of zeroSafe(b, i)) {
      if (!revealed[j]) { revealed[j] = 1; queue.push(j); }
    }
  }
  return out;
}

// Felder, die durch Tippen auf eine erfüllte Zahl aufgedeckt werden dürfen.
export function chordTargets(b, i, revealed, flags) {
  const out = new Set();
  for (const c of MODES[b.mode].constraints(b, i)) {
    if (!c.pos || !c.show || c.tmin !== c.tmax) continue;
    let sum = 0;
    const open = [];
    for (const cell of c.cells) {
      if (revealed[cell]) continue;
      if (flags[cell]) sum += c.w[flags[cell]];
      else open.push(cell);
    }
    if (open.length && sum === c.tmax) open.forEach((x) => out.add(x));
  }
  return [...out];
}

export function highlightCells(b, i) {
  const out = [];
  for (const c of MODES[b.mode].constraints(b, i)) if (c.show) out.push(...c.cells);
  return out;
}

// Sucht den einfachsten logisch beweisbaren nächsten Schritt.
// flags: aktuelle Markierungen (0 = keine, sonst Wert).
export function findHint(b, revealed, flags) {
  const e = new Engine(b, { autoReveal: false });
  for (let i = 0; i < b.n; i++) if (revealed[i]) e.reveal(i);
  let hint = null;
  const check = () => {
    for (const c of e.changes) {
      if (revealed[c]) continue;
      const m = e.dom[c];
      if (m === 1) {
        hint = { cell: c, kind: flags[c] ? 'wrongflag' : 'safe' };
      } else if (!(m & 1)) {
        if (!flags[c]) hint = { cell: c, kind: 'mine', value: single(m) ? VAL[m] : 0 };
        else if (single(m) && flags[c] !== VAL[m]) hint = { cell: c, kind: 'retype', value: VAL[m] };
      }
      if (hint) {
        // Die ganze Beweiskette zeigen, nicht nur den letzten Schritt.
        hint.reasons = [...e.reasonAll];
        return true;
      }
    }
    e.changes.length = 0;
    return false;
  };
  e.changes.length = 0;
  e.run(3, check);
  return hint;
}
