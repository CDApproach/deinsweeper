import { MODES, DIFFICULTIES, Engine, generate, cascade, chordTargets, highlightCells, findHint, scoreGame, COMBO_MS } from './core.js';
import { api, online } from './online.js';
import { ICON, mineIcon, flagIcon } from './icons.js';
import { sfx, haptics, audio, unlockAudio } from './audio.js';
import * as fx from './fx.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ Speicher

const KEY = 'knobelfeld.v1';
const store = Object.assign(
  { sound: true, vibe: true, mode: 'weighted', diff: 'easy', seen: {}, scores: {}, name: '', scoreTab: 'world' },
  (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })()
);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* privater Modus */ } };
audio.enabled = store.sound;
haptics.enabled = store.vibe;

// ------------------------------------------------------------------ Texte

const num = (k, extra = '') => `<span class="num n${Math.min(k, 8)} ${extra}">${k}</span>`;

const INFO = {
  weighted: {
    name: 'Schwere Minen',
    desc: 'Kleine Minen zählen 1, große 2 – die Zahl ist die Summe.',
    minesLabel: 'Minen',
    flagCycle: [1, 2],
    flagHint: 'Mehrfach tippen: kleine Mine (1) → große Mine (2) → keine',
    rules: [
      'Unter den Feldern liegen <b>kleine Minen (Wert 1)</b> und <b>große Minen (Wert 2)</b>.',
      'Jede Zahl ist die <b>Summe der Minen-Werte</b> in den 8 Nachbarfeldern.',
      'Eine 3 kann also 1 + 2 sein – oder 1 + 1 + 1. Erst die Zahlen daneben verraten, was stimmt.',
      'Gewonnen, wenn alle sicheren Felder offen sind.',
    ],
    example: {
      cols: 3,
      cells: [['f2', 1], ['o', 1], ['f1', 1], ['o', 1], ['c', 0, num(3)], ['o', 1], ['o', 1], ['o', 1], ['o', 1]],
      text: 'Die 3 in der Mitte: eine große Mine (2) plus eine kleine Mine (1) in den Nachbarfeldern.',
    },
  },
  echolot: {
    name: 'Echolot',
    desc: 'Wie weit ist die nächste Mine – und wie viele liegen dort?',
    minesLabel: 'Minen',
    flagCycle: [1],
    flagHint: 'Tippen setzt oder entfernt eine Boje',
    rules: [
      'Jede Zahl ist ein <b>Sonar-Echo</b>: Sie zählt die Minen auf dem <b>nächsten Ring</b>, auf dem überhaupt Minen liegen.',
      '<b>Ohne Ring:</b> Die Minen liegen direkt nebenan – wie bei Minesweeper.',
      '<b>Ein Ring:</b> Alle 8 Nachbarn sind sicher, die Minen liegen genau 2 Felder entfernt.',
      '<b>Zwei Ringe:</b> 3 Felder entfernt. Alles, was näher liegt, ist sicher. (Ab 4 steht die Entfernung klein daneben.)',
      'Entfernung zählt in Schritten – auch ein diagonaler Schritt ist ein Feld.',
    ],
    example: {
      cols: 5,
      cells: [
        ['#', 1], ['f1', 1], ['#', 1], ['#', 1], ['#', 1],
        ['#', 1], ['o', 0], ['o', 0], ['o', 0], ['#', 1],
        ['#', 1], ['o', 0], ['c', 0, num(2) + '<i class="rg a"></i>'], ['o', 0], ['f1', 1],
        ['#', 1], ['o', 0], ['o', 0], ['o', 0], ['#', 1],
        ['#', 1], ['#', 1], ['#', 1], ['#', 1], ['#', 1],
      ],
      text: 'Ein Ring: Die nächsten Minen sind 2 Felder entfernt. Auf dem hervorgehobenen Ring liegen genau 2.',
    },
  },
  kompass: {
    name: 'Kompass',
    desc: 'Die Zahl blickt weiter: 8 Nachbarn plus je 2 Felder nach N, O, S, W.',
    minesLabel: 'Minen',
    flagCycle: [1],
    flagHint: 'Tippen setzt oder entfernt eine Markierung',
    rules: [
      'Jede Zahl zählt die Minen in ihrer <b>Kompassrose</b>: die 8 direkten Nachbarn <b>plus</b> je ein Feld zwei Schritte nach Norden, Osten, Süden und Westen – zusammen 12 Felder.',
      'Gewohnte Minesweeper-Muster funktionieren dadurch nicht mehr – hier musst du neu denken.',
      'Tippe eine Zahl an, um ihre Rose zu sehen.',
    ],
    example: {
      cols: 5,
      cells: [
        ['#', 0], ['#', 0], ['f1', 1], ['#', 0], ['#', 0],
        ['#', 0], ['o', 1], ['o', 1], ['f1', 1], ['#', 0],
        ['f1', 1], ['o', 1], ['c', 0, num(3)], ['o', 1], ['o', 1],
        ['#', 0], ['o', 1], ['o', 1], ['o', 1], ['#', 0],
        ['#', 0], ['#', 0], ['o', 1], ['#', 0], ['#', 0],
      ],
      text: 'Die 3 zählt alle 12 hervorgehobenen Felder – auch die Spitzen zwei Schritte entfernt.',
      kompass: true,
    },
  },
  magnet: {
    name: 'Magnetfeld',
    desc: 'Zähle die Magnete – die Farbe verrät, welcher Pol überwiegt.',
    minesLabel: 'Magnete',
    flagCycle: [1, 2],
    flagHint: 'Mehrfach tippen: Pluspol → Minuspol → keine',
    rules: [
      'Die Minen sind Magnete: <b style="color:#ff6b7f">Pluspol</b> oder <b style="color:#63b0ff">Minuspol</b>.',
      'Die Zahl zählt die Magnete in den 8 Nachbarfeldern – wie bei Minesweeper.',
      'Die <b>Farbe</b> zeigt, welcher Pol dort überwiegt: <b style="color:#ff6b7f">rot</b> = mehr Plus, <b style="color:#63b0ff">blau</b> = mehr Minus, <b>weiß</b> = Gleichstand.',
      'Gewonnen, wenn alle sicheren Felder offen <b>und alle Magnete mit dem richtigen Pol</b> markiert sind.',
    ],
    example: {
      cols: 3,
      cells: [['f1', 1], ['o', 1], ['o', 1], ['o', 1], ['c', 0, '<span class="num pol-z">2</span><span class="sg pol-z">±</span>'], ['f2', 1], ['o', 1], ['o', 1], ['o', 1]],
      text: '2 Magnete, weiße Zahl = Gleichstand: einer ist Plus, einer Minus.',
    },
  },
};
const MODE_IDS = Object.keys(INFO);

// ------------------------------------------------------------------ Hilfen

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtNum = (n) => n.toLocaleString('de-DE');

let toastTimer = 0;
function toast(text, ms = 2200) {
  const t = $('toast');
  t.innerHTML = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

// ------------------------------------------------------------------ Sheet

let sheetClose = null;
function openSheet(html, onClose) {
  $('sheet-body').innerHTML = html;
  $('sheet-body').scrollTop = 0;
  $('sheet').classList.add('on');
  $('sheet-backdrop').classList.add('on');
  sheetClose = onClose || null;
}
function closeSheet() {
  $('sheet').classList.remove('on');
  $('sheet-backdrop').classList.remove('on');
  const cb = sheetClose;
  sheetClose = null;
  if (cb) cb();
}
$('sheet-backdrop').addEventListener('click', closeSheet);

function exampleHTML(mode) {
  const ex = INFO[mode].example;
  const cells = ex.cells.map(([t, hl, html]) => {
    let cls = 'cell', inner = '';
    if (t === '#') cls += ' hidden';
    else if (t === 'o') cls += ' open' + (ex.kompass ? ' kr zero' : '');
    else if (t === 'c') { cls += ' open src' + (ex.kompass ? ' kr' : ''); inner = html; }
    else { cls += ' hidden flagged'; inner = flagIcon(mode, Number(t[1])); }
    if (hl) cls += ' hl';
    return `<div class="${cls}">${inner}</div>`;
  }).join('');
  return `<div class="example"><div class="board" style="--cols:${ex.cols}">${cells}</div><p>${ex.text}</p></div>`;
}

function rulesHTML(mode, startLabel) {
  const info = INFO[mode];
  return `
    <h2><span class="mode-icon" style="--mc:var(--accent)">${ICON[mode]}</span>${info.name}</h2>
    <ul>${info.rules.map((r) => `<li>${r}</li>`).join('')}</ul>
    ${exampleHTML(mode)}
    <h3>Steuerung</h3>
    <ul>
      <li>Unten wechselst du zwischen <b>Aufdecken</b> und <b>Markieren</b>. ${info.flagHint}.</li>
      <li><b>Lange drücken</b> markiert immer – egal, welches Werkzeug aktiv ist.</li>
      <li><b>Tippe auf eine Zahl</b>, um ihren Bereich zu sehen. Sind dort schon alle Minen markiert, deckt das den Rest auf.</li>
    </ul>
    <h3>Fair &amp; Punkte</h3>
    <ul>
      <li>Jedes Feld ist <b>garantiert ohne Raten lösbar</b> – es gibt immer einen logischen nächsten Schritt.</li>
      <li>Schnelle Züge hintereinander bauen eine <b>Combo</b> auf. Am Ende gibt es einen <b>Zeitbonus</b>.</li>
      <li>Hängst du fest, zeigt <b>Tipp</b> den nächsten beweisbaren Schritt (kostet 20&nbsp;% vom Zeitbonus).</li>
    </ul>
    <div class="actions"><button class="btn primary" data-close>${startLabel || 'Verstanden'}</button></div>`;
}

function showRules(mode, startLabel, onClose) {
  openSheet(rulesHTML(mode, startLabel), onClose);
  $('sheet-body').querySelector('[data-close]').onclick = closeSheet;
}

// ------------------------------------------------------------------ Startseite

function setMode(m) {
  store.mode = m;
  document.body.dataset.mode = m;
  save();
  renderHome();
}

function bestOf(mode, diff) {
  const list = store.scores[`${mode}_${diff}`];
  return list && list.length ? list[0] : null;
}

function renderHome() {
  document.body.dataset.mode = store.mode;
  const accentOf = { weighted: '#ffb547', echolot: '#36e2c8', kompass: '#b996ff', magnet: '#ff5d7a' };
  $('mode-list').innerHTML = MODE_IDS.map((m) => {
    const best = bestOf(m, store.diff);
    return `<button class="mode-card ${m === store.mode ? 'sel' : ''}" data-mode="${m}" style="--mc:${accentOf[m]}">
      <span class="mode-icon">${ICON[m]}</span>
      <span class="mc-name">${INFO[m].name}</span>
      <span class="mc-desc">${INFO[m].desc}</span>
      <span class="mc-best">${best ? 'Rekord ' + fmtNum(best.s) : '&nbsp;'}</span>
    </button>`;
  }).join('');
  $('diff-list').innerHTML = Object.values(DIFFICULTIES).map((d) =>
    `<button role="radio" aria-checked="${d.id === store.diff}" class="${d.id === store.diff ? 'sel' : ''}" data-diff="${d.id}"><b>${d.name}</b><small>${d.cols}×${d.rows}</small></button>`
  ).join('');
  const best = bestOf(store.mode, store.diff);
  $('best-line').innerHTML = best
    ? `Rekord: <b>${fmtNum(best.s)}</b> Punkte · ${fmtTime(best.t)}`
    : 'Noch kein Rekord – leg los!';
  $('btn-sound').innerHTML = store.sound ? ICON.soundOn : ICON.soundOff;
  $('btn-sound').classList.toggle('off', !store.sound);
  $('btn-vibe').innerHTML = ICON.vibe;
  $('btn-vibe').classList.toggle('off', !store.vibe);
}

$('mode-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  unlockAudio();
  sfx.peek();
  setMode(b.dataset.mode);
});
$('diff-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-diff]');
  if (!b) return;
  sfx.peek();
  store.diff = b.dataset.diff;
  save();
  renderHome();
});
$('btn-sound').onclick = () => {
  store.sound = !store.sound;
  audio.enabled = store.sound;
  save();
  renderHome();
  sfx.peek();
};
$('btn-vibe').onclick = () => {
  store.vibe = !store.vibe;
  haptics.enabled = store.vibe;
  save();
  renderHome();
  haptics.buzz(30);
  if (store.vibe && !navigator.vibrate) toast('Dein Browser unterstützt leider keine Vibration.');
};
$('btn-rules').onclick = () => showRules(store.mode);
$('btn-play').onclick = () => {
  unlockAudio();
  if (!store.seen[store.mode]) {
    store.seen[store.mode] = true;
    save();
    showRules(store.mode, 'Los geht’s', () => newGame());
    return;
  }
  newGame();
};
$('btn-scores').onclick = () => showScores(store.mode, store.diff);

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tipsLabel = (h) => (h ? ` · ${h} Tipp${h > 1 ? 's' : ''}` : '');

function showScores(mode, diff, tab = online.enabled ? store.scoreTab : 'local') {
  const local = store.scores[`${mode}_${diff}`] || [];
  const localTable = local.length
    ? `<table class="scores-table">${local.map((e, k) => `<tr><td>${k + 1}.</td><td>${fmtNum(e.s)}</td><td>${fmtTime(e.t)}${tipsLabel(e.h)}</td><td>${new Date(e.d).toLocaleDateString('de-DE')}</td></tr>`).join('')}</table>`
    : '<p>Hier ist noch alles leer. Gewinne eine Runde, um dich einzutragen.</p>';
  openSheet(`
    <h2><span class="mode-icon">${ICON.trophy}</span>Bestenliste</h2>
    ${online.enabled ? `<div class="tabs" data-k="tab">
      <button data-v="world" class="${tab === 'world' ? 'sel' : ''}">Weltweit</button>
      <button data-v="local" class="${tab === 'local' ? 'sel' : ''}">Dieses Gerät</button></div>` : ''}
    <div class="tabs" data-k="mode">${MODE_IDS.map((m) => `<button data-v="${m}" class="${m === mode ? 'sel' : ''}">${INFO[m].name}</button>`).join('')}</div>
    <div class="tabs" data-k="diff">${Object.values(DIFFICULTIES).map((d) => `<button data-v="${d.id}" class="${d.id === diff ? 'sel' : ''}">${d.name}</button>`).join('')}</div>
    <div id="score-list">${tab === 'world' ? '<p class="muted">Lade Weltrangliste …</p>' : localTable}</div>
    ${online.enabled && store.name ? `<p class="muted small">Du spielst als <b>${esc(store.name)}</b>. <button class="link-btn" data-a="rename">Ändern</button></p>` : ''}
    <div class="actions"><button class="btn ghost" data-close>Schließen</button></div>`);
  const body = $('sheet-body');
  body.querySelector('[data-close]').onclick = closeSheet;
  const rn = body.querySelector('[data-a=rename]');
  if (rn) rn.onclick = () => askName(() => showScores(mode, diff, tab));
  body.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => {
      const k = b.parentElement.dataset.k;
      if (k === 'tab') { store.scoreTab = b.dataset.v; save(); }
      showScores(k === 'mode' ? b.dataset.v : mode, k === 'diff' ? b.dataset.v : diff, k === 'tab' ? b.dataset.v : tab);
    };
  });
  if (tab !== 'world') return;
  api.scores(mode, diff).then((r) => {
    const el = document.getElementById('score-list');
    if (!el) return;
    if (!r) { el.innerHTML = '<p>Die Weltrangliste ist gerade nicht erreichbar. Bist du online?</p>'; return; }
    el.innerHTML = r.scores.length
      ? `<table class="scores-table">${r.scores.map((e, k) => `<tr class="${e.name === store.name ? 'me' : ''}"><td>${k + 1}.</td><td>${fmtNum(e.score)}</td><td class="nm">${esc(e.name)}</td><td>${fmtTime(e.time)}${tipsLabel(e.hints)}</td></tr>`).join('')}</table>`
      : '<p>Noch niemand eingetragen – sei die oder der Erste!</p>';
  });
}

// Fragt den öffentlichen Spielernamen ab (gespeichert auf diesem Gerät).
function askName(done) {
  openSheet(`
    <h2>Dein Spielername</h2>
    <p>Er erscheint <b>öffentlich</b> in der Weltrangliste. Nimm am besten einen Spitznamen, nicht deinen echten Namen.</p>
    <input class="name-input" id="name-input" maxlength="16" autocomplete="nickname" enterkeyhint="done" placeholder="z. B. Minenfuchs" value="${esc(store.name)}">
    <p class="muted small" id="name-err">2 bis 16 Zeichen.</p>
    <div class="actions"><button class="btn ghost" data-a="skip">Abbrechen</button><button class="btn primary" data-a="ok">Speichern</button></div>`);
  const input = $('name-input');
  setTimeout(() => input.focus(), 350);
  const ok = () => {
    const name = input.value.replace(/\s+/g, ' ').trim();
    if ([...name].length < 2) { $('name-err').textContent = 'Bitte mindestens 2 Zeichen.'; $('name-err').style.color = 'var(--danger)'; return; }
    store.name = name;
    save();
    sheetClose = null;
    done(name);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  $('sheet-body').querySelector('[data-a=ok]').onclick = ok;
  $('sheet-body').querySelector('[data-a=skip]').onclick = () => { sheetClose = null; done(null); };
}

// ------------------------------------------------------------------ Generator

let worker = null;
let reqId = 0;
const pending = new Map();
function requestBoard(mode, diff, first, seed) {
  return new Promise((resolve) => {
    const id = ++reqId;
    const fallback = () => resolve(generate(mode, diff, first, seed));
    try {
      if (!worker) {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => {
          const p = pending.get(e.data.id);
          pending.delete(e.data.id);
          if (p) p.resolve(e.data.board);
        };
        worker.onerror = () => {
          worker = null;
          for (const [k, p] of pending) { pending.delete(k); p.fallback(); }
        };
      }
      pending.set(id, { resolve, fallback });
      worker.postMessage({ id, mode, diff, first, seed });
    } catch {
      fallback();
    }
  });
}

// ------------------------------------------------------------------ Spielzustand

const G = {
  mode: 'weighted', diff: 'easy', cols: 8, rows: 10,
  board: null, revealed: null, flags: null, cons: null,
  cells: [], tool: 'dig',
  started: false, ended: false, won: false, generating: false, paused: false,
  t0: 0, elapsed: 0, pausedAt: 0,
  score: 0, combo: 0, lastAction: -1e9, maxCombo: 0, hints: 0,
  result: null, polarityToast: false, hintEls: [], lossHint: null,
  moves: [], events: [], online: null, world: null,
};
let timerId = 0;
let comboTimer = 0;

function newGame(mode = store.mode, diff = store.diff) {
  closeSheet();
  const d = DIFFICULTIES[diff];
  Object.assign(G, {
    mode, diff, cols: d.cols, rows: d.rows,
    board: null, revealed: new Uint8Array(d.cols * d.rows), flags: new Uint8Array(d.cols * d.rows), cons: null,
    tool: 'dig', started: false, ended: false, won: false, generating: false, paused: false,
    t0: 0, elapsed: 0, score: 0, combo: 0, lastAction: -1e9, maxCombo: 0, hints: 0, result: null, polarityToast: false, lossHint: null,
    moves: [], events: [], online: null, world: null,
  });
  document.body.dataset.mode = mode;
  $('home').classList.remove('active');
  $('game').classList.add('active');
  $('game').classList.remove('ended');
  $('game-icon').innerHTML = ICON[mode];
  $('game-name').textContent = INFO[mode].name;
  $('game-diff').textContent = d.name;
  $('hud-mines-label').textContent = INFO[mode].minesLabel;
  $('flag-label').textContent = mode === 'echolot' ? 'Boje' : 'Markieren';
  $('hud-combo').classList.remove('on');
  $('btn-pause').innerHTML = ICON.pause;
  setTool('dig');
  buildBoard();
  updateHud();
  clearInterval(timerId);
  timerId = setInterval(updateTime, 250);
  boardMsg('Tippe irgendein Feld an.<small>Der erste Zug ist immer sicher.</small>', true);
}

function boardMsg(html, soft) {
  const m = $('board-msg');
  m.innerHTML = html ? `<div>${html}</div>` : '';
  m.classList.toggle('on', !!html);
  m.style.pointerEvents = soft ? 'none' : 'auto';
  m.style.opacity = soft ? '0.9' : '1';
}

function buildBoard() {
  const el = $('board');
  el.style.setProperty('--cols', G.cols);
  el.classList.remove('paused', 'shake');
  const n = G.cols * G.rows;
  const frag = document.createDocumentFragment();
  G.cells = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'cell hidden';
    c.dataset.i = i;
    frag.appendChild(c);
    G.cells.push(c);
  }
  el.replaceChildren(frag);
  fitBoard();
}

function fitBoard() {
  const wrap = $('board-wrap');
  const gap = 3, pad = 18;
  const w = wrap.clientWidth - pad, h = wrap.clientHeight - pad;
  const cs = Math.floor(Math.min((w - gap * (G.cols - 1)) / G.cols, (h - gap * (G.rows - 1)) / G.rows));
  $('board').style.setProperty('--cs', Math.max(22, Math.min(58, cs)) + 'px');
}
addEventListener('resize', () => { if ($('game').classList.contains('active')) fitBoard(); });

function clueHTML(i) {
  const c = G.board.clues[i];
  switch (G.mode) {
    case 'weighted':
    case 'kompass':
      return c[0] ? num(c[0]) : '';
    case 'echolot': {
      const [d, k] = c;
      let h = num(k);
      if (d >= 2) h += '<i class="rg a"></i>';
      if (d >= 3) h += '<i class="rg b"></i>';
      if (d >= 4) h += `<span class="dlab">${d}</span>`;
      return h;
    }
    case 'magnet': {
      const [k, s] = c;
      if (!k) return '';
      const pc = s > 0 ? 'pol-p' : s < 0 ? 'pol-m' : 'pol-z';
      return `<span class="num ${pc}">${k}</span><span class="sg ${pc}">${s > 0 ? '+' : s < 0 ? '−' : '±'}</span>`;
    }
  }
  return '';
}

function renderCell(i, anim = false, delay = 0) {
  const el = G.cells[i];
  let cls = 'cell', html = '';
  if (G.revealed[i]) {
    cls += ' open';
    html = clueHTML(i);
    if (G.mode === 'kompass') cls += ' kr' + (G.board.clues[i][0] ? '' : ' zero');
  } else {
    cls += ' hidden';
    if (G.flags[i]) { cls += ' flagged'; html = flagIcon(G.mode, G.flags[i]); }
  }
  if (anim) { cls += ' anim'; el.style.setProperty('--d', delay + 'ms'); }
  el.className = cls;
  el.innerHTML = html;
}

// Zahlen, deren Bereich vollständig markiert ist, werden gedimmt;
// passen Markierungen und Zahl nicht zusammen, leuchtet die Zahl rot.
function updateSatisfaction() {
  if (!G.board) return;
  for (let i = 0; i < G.board.n; i++) {
    if (!G.revealed[i]) continue;
    let done = true, over = false;
    for (const c of G.cons[i]) {
      if (!c.show || !c.pos) continue;
      let sum = 0, open = 0;
      for (const j of c.cells) {
        if (G.revealed[j]) continue;
        if (G.flags[j]) sum += c.w[G.flags[j]];
        else open++;
      }
      if (sum > c.tmax || (!open && sum !== c.tmax)) over = true;
      if (open) done = false;
    }
    const el = G.cells[i];
    el.classList.toggle('done', done && !over);
    el.classList.toggle('over', over);
  }
}

function centerOf(i) {
  const r = G.cells[i].getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2, r.width];
}

function updateHud() {
  $('hud-score').textContent = fmtNum(G.score);
  if (!G.board) { $('hud-mines').textContent = '–'; return; }
  let f = 0;
  for (let i = 0; i < G.board.n; i++) if (G.flags[i] && !G.revealed[i]) f++;
  $('hud-mines').textContent = G.board.mines - f;
}

function now() { return performance.now(); }
function elapsed() {
  if (!G.started) return 0;
  if (G.ended) return G.elapsed;
  if (G.paused) return G.pausedAt - G.t0;
  return now() - G.t0;
}
function updateTime() { $('hud-time').textContent = fmtTime(elapsed()); }

function bump(id) {
  const el = $(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// ------------------------------------------------------------------ Aktionen

function setTool(t) {
  G.tool = t;
  const tg = $('tool-toggle');
  tg.classList.toggle('flag', t === 'flag');
  tg.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.tool === t;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
}
$('tool-toggle').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (!b || b.dataset.tool === G.tool) return;
  setTool(b.dataset.tool);
  sfx.peek();
  haptics.buzz(8);
});

async function firstTap(i) {
  G.generating = true;
  boardMsg('');
  const [x, y, w] = centerOf(i);
  fx.ripple(x, y, w * 6);
  sfx.start();
  // Für die Weltrangliste kommt der Zufall vom Server. Ohne Netz wird
  // trotzdem gespielt – die Runde zählt dann nur auf diesem Gerät.
  const start = online.enabled ? await api.start(G.mode, G.diff) : null;
  const seed = start ? start.seed : (Math.random() * 2 ** 32) >>> 0;
  const board = await requestBoard(G.mode, G.diff, i, seed);
  if (G.board || G.ended || !$('game').classList.contains('active')) return;
  G.online = start;
  G.board = board;
  G.cons = Array.from({ length: board.n }, (_, k) => (board.values[k] ? [] : MODES[G.mode].constraints(board, k)));
  G.generating = false;
  G.started = true;
  G.t0 = now();
  record('r', i);
  revealFrom([i], i);
}

// Zeichnet einen Zug auf (Zeit = Spielzeit ohne Pausen), damit der Server
// die Partie nachspielen kann.
function record(k, i, v) {
  const m = { k, t: Math.round(elapsed()) };
  if (i !== undefined) m.i = i;
  if (v !== undefined) m.v = v;
  G.moves.push(m);
  return m.t;
}

// Deckt die Felder in `starts` (alle sicher) samt Kaskade auf.
function revealFrom(starts, origin) {
  const fresh = [];
  for (const s of starts) fresh.push(...cascade(G.board, G.revealed, s));
  if (!fresh.length) return;
  const [ox, oy] = [origin % G.cols, Math.floor(origin / G.cols)];
  for (const j of fresh) {
    const d = Math.hypot(j % G.cols - ox, Math.floor(j / G.cols) - oy);
    G.flags[j] = 0;
    renderCell(j, true, Math.min(650, d * 38));
  }
  registerAction(origin, fresh.length);
  updateSatisfaction();
  updateHud();
  checkWin();
}

function registerAction(i, count) {
  const t = G.moves[G.moves.length - 1].t;
  G.events.push({ t, count });
  G.combo = t - G.lastAction < COMBO_MS ? Math.min(G.combo + 1, 10) : 1;
  G.lastAction = t;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  const pts = 10 * G.combo + Math.min(count - 1, 20);
  G.score += pts;
  const [x, y] = centerOf(i);
  fx.floater(x, y - 10, `+${pts}`);
  fx.sparks(x, y, getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#fff', Math.min(24, 6 + count), 2.4);
  sfx.reveal(G.combo, count);
  haptics.buzz(count > 6 ? [12, 30, 12] : 10);
  bump('hud-score');
  const cb = $('hud-combo');
  if (G.combo >= 2) {
    $('hud-combo-text').textContent = `Combo x${G.combo}`;
    cb.classList.add('on');
    const bar = $('hud-combo-bar');
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    void bar.offsetWidth;
    bar.style.transition = `transform ${COMBO_MS}ms linear`;
    bar.style.transform = 'scaleX(0)';
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => cb.classList.remove('on'), COMBO_MS);
  }
}

function cycleFlag(i) {
  const cyc = INFO[G.mode].flagCycle;
  const cur = G.flags[i];
  const k = cyc.indexOf(cur);
  const next = cur === 0 ? cyc[0] : k + 1 < cyc.length ? cyc[k + 1] : 0;
  G.flags[i] = next;
  record('f', i, next);
  renderCell(i);
  if (next) { sfx.flag(); haptics.buzz(15); } else { sfx.unflag(); haptics.buzz(6); }
  updateSatisfaction();
  updateHud();
  checkWin();
}

function tapNumber(i) {
  const targets = chordTargets(G.board, i, G.revealed, G.flags);
  if (targets.length) {
    const mine = targets.find((j) => G.board.values[j]);
    if (mine !== undefined) { lose(mine, 'chord'); return; }
    sfx.chord();
    record('c', i);
    revealFrom(targets, i);
    return;
  }
  flashArea(i);
}

let hlTimer = 0;
function flashArea(i) {
  clearHighlights();
  const area = highlightCells(G.board, i);
  for (const j of area) G.cells[j].classList.add('hl');
  G.cells[i].classList.add('src');
  G.hintEls = [...area, i];
  sfx.peek();
  hlTimer = setTimeout(clearHighlights, 1300);
}
function clearHighlights() {
  clearTimeout(hlTimer);
  for (const el of G.cells) el.classList.remove('hl', 'src', 'hint', 'hint-mine', 'reason');
}

function tap(i) {
  if (G.ended || G.paused || G.generating) return;
  clearHighlights();
  if (!G.board) {
    if (G.tool === 'flag') { toast('Decke zuerst ein Feld auf – der erste Zug ist sicher.'); sfx.deny(); return; }
    firstTap(i);
    return;
  }
  if (G.revealed[i]) { tapNumber(i); return; }
  if (G.tool === 'flag') { cycleFlag(i); return; }
  if (G.flags[i]) {
    sfx.deny();
    haptics.buzz([10, 40, 10]);
    G.cells[i].animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 220 });
    toast('Markiert – zum Aufdecken erst die Markierung entfernen.', 1600);
    return;
  }
  if (G.board.values[i]) { lose(i, 'dig'); return; }
  record('r', i);
  revealFrom([i], i);
}

function longPress(i) {
  if (G.ended || G.paused || !G.board || G.generating) return;
  clearHighlights();
  if (G.revealed[i]) { flashArea(i); return; }
  cycleFlag(i);
}

// Zeiger-Eingabe: kurzes Tippen, langes Drücken, Abbruch bei Wischen.
(() => {
  const boardEl = $('board');
  let press = null;
  const cancel = () => {
    if (!press) return;
    clearTimeout(press.timer);
    press.el.classList.remove('press');
    press = null;
  };
  // Auch Tipps in die Fugen zwischen den Feldern treffen das nächste Feld.
  const cellAt = (e) => {
    const hit = e.target.closest('.cell');
    if (hit) return hit;
    const a = G.cells[0].getBoundingClientRect();
    const step = G.cols > 1 ? G.cells[1].getBoundingClientRect().left - a.left : a.width;
    const cx = Math.floor((e.clientX - a.left + (step - a.width) / 2) / step);
    const cy = Math.floor((e.clientY - a.top + (step - a.height) / 2) / step);
    if (cx < 0 || cy < 0 || cx >= G.cols || cy >= G.rows) return null;
    return G.cells[cy * G.cols + cx];
  };
  boardEl.addEventListener('pointerdown', (e) => {
    const el = cellAt(e);
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    unlockAudio();
    const i = Number(el.dataset.i);
    cancel();
    press = { i, el, x: e.clientX, y: e.clientY, long: false };
    if (el.classList.contains('hidden')) el.classList.add('press');
    press.timer = setTimeout(() => {
      if (!press) return;
      press.long = true;
      press.el.classList.remove('press');
      longPress(i);
    }, 380);
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14) cancel();
  });
  boardEl.addEventListener('pointerup', () => {
    if (!press) return;
    const p = press;
    cancel();
    if (!p.long) tap(p.i);
  });
  boardEl.addEventListener('pointercancel', cancel);
  boardEl.addEventListener('pointerleave', cancel);
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
})();

// ------------------------------------------------------------------ Tipps

function hintText(h) {
  const m = G.mode;
  if (h.kind === 'safe') return 'Dieses Feld ist <b>sicher</b>.';
  if (h.kind === 'wrongflag') return 'Diese Markierung ist <b>falsch</b> – das Feld ist sicher.';
  const what = m === 'magnet'
    ? (h.value === 1 ? 'ein <b style="color:#ff6b7f">Pluspol</b>' : h.value === 2 ? 'ein <b style="color:#63b0ff">Minuspol</b>' : 'ein Magnet')
    : m === 'weighted'
      ? (h.value === 2 ? 'eine <b>große Mine (2)</b>' : h.value === 1 ? 'eine <b>kleine Mine (1)</b>' : 'eine <b>Mine</b>')
      : 'eine <b>Mine</b>';
  if (h.kind === 'retype') return `Falsch markiert: Hier liegt ${what}.`;
  return `Hier liegt sicher ${what}.`;
}

function showHint(h, persistent) {
  clearHighlights();
  if (!h) return;
  const el = G.cells[h.cell];
  el.classList.add('hint');
  if (h.kind === 'mine' || h.kind === 'retype') el.classList.add('hint-mine');
  // Nur die Beweis-Zahlen in der Nähe zeigen, sonst leuchtet das halbe Feld.
  const hx = h.cell % G.cols, hy = Math.floor(h.cell / G.cols);
  for (const r of h.reasons || []) {
    if (Math.max(Math.abs(r % G.cols - hx), Math.abs(Math.floor(r / G.cols) - hy)) <= 4) G.cells[r].classList.add('reason');
  }
  if (!persistent) hlTimer = setTimeout(clearHighlights, 4500);
}

$('btn-hint').onclick = () => {
  if (G.ended || G.paused || G.generating) return;
  if (!G.board) { toast('Tippe einfach irgendein Feld an – der erste Zug ist immer sicher.'); return; }
  const h = findHint(G.board, G.revealed, G.flags);
  if (!h) { toast('Alles erledigt – hier gibt es nichts mehr zu tun.'); return; }
  G.hints++;
  G.combo = 0;
  G.events.push({ t: record('h'), hint: true });
  $('hud-combo').classList.remove('on');
  showHint(h);
  sfx.hint();
  haptics.buzz(20);
  toast(`${hintText(h)} <small style="opacity:.7">Die grün umrandeten Zahlen beweisen es.</small>`, 4200);
};

// ------------------------------------------------------------------ Spielende

function checkWin() {
  if (G.ended || !G.board) return;
  const b = G.board;
  let open = 0;
  for (let i = 0; i < b.n; i++) if (G.revealed[i]) open++;
  if (open < b.safeCount) return;
  if (MODES[G.mode].full) {
    for (let i = 0; i < b.n; i++) {
      if (b.values[i] && G.flags[i] !== b.values[i]) {
        if (!G.polarityToast) {
          G.polarityToast = true;
          toast('Alle Felder offen! Jetzt noch jeden Magneten mit dem <b>richtigen Pol</b> markieren.', 3800);
        }
        return;
      }
    }
  }
  win();
}

function finish() {
  G.ended = true;
  G.elapsed = now() - G.t0;
  clearInterval(timerId);
  updateTime();
  clearTimeout(comboTimer);
  $('hud-combo').classList.remove('on');
  $('game').classList.add('ended');
}

function win() {
  finish();
  G.won = true;
  const sc = scoreGame(G.mode, G.diff, G.events, G.elapsed);
  const { bonus, mult, total } = sc;
  G.score = sc.points;
  if (G.online) submitWorld();
  const key = `${G.mode}_${G.diff}`;
  const list = store.scores[key] || [];
  const entry = { s: total, t: Math.round(G.elapsed), d: Date.now(), h: G.hints };
  list.push(entry);
  list.sort((a, b) => b.s - a.s);
  store.scores[key] = list.slice(0, 5);
  const isRecord = store.scores[key][0] === entry && list.length > 0;
  save();
  G.result = { win: true, total, bonus, mult, isRecord };

  const b = G.board;
  let k = 0;
  for (let i = 0; i < b.n; i++) {
    if (!b.values[i]) continue;
    const el = G.cells[i];
    el.className = 'cell hidden flagged solved-flag';
    el.innerHTML = G.mode === 'magnet' ? mineIcon('magnet', b.values[i]) : flagIcon(G.mode, b.values[i]);
    el.style.setProperty('--d', (k++ * 25) + 'ms');
  }
  for (const el of G.cells) el.classList.remove('done', 'over');
  sfx.win();
  haptics.buzz([30, 50, 30, 50, 90]);
  fx.confetti();
  setTimeout(showResult, 1100);
}

function lose(i, how) {
  // Erst analysieren, dann aufdecken: War der Zug logisch vermeidbar?
  let analysis;
  if (how === 'chord') {
    analysis = 'Eine deiner Markierungen war falsch – deshalb hat das Aufdecken rund um die Zahl eine Mine getroffen. Falsche Markierungen sind rot durchgestrichen.';
  } else {
    const e = new Engine(G.board, { autoReveal: false });
    for (let j = 0; j < G.board.n; j++) if (G.revealed[j]) e.reveal(j);
    e.run(3, () => false);
    const provable = !(e.dom[i] & 1);
    analysis = provable
      ? 'Dieses Feld war mit den offenen Zahlen <b>nachweislich eine Mine</b> – hier hat sich ein Denkfehler eingeschlichen.'
      : 'Dieses Feld ließ sich noch <b>nicht sicher bestimmen</b> – hier wurde geraten. Das hervorgehobene Feld wäre der nächste beweisbare Schritt gewesen.';
    if (!provable) G.lossHint = findHint(G.board, G.revealed, G.flags);
  }
  finish();
  G.won = false;
  G.result = { win: false, analysis };

  const b = G.board;
  const [bx, by] = centerOf(i);
  G.cells[i].className = 'cell mine boom';
  G.cells[i].innerHTML = mineIcon(G.mode, b.values[i]);
  fx.explosion(bx, by);
  sfx.boom();
  haptics.buzz([90, 50, 160]);
  $('board').classList.add('shake');
  const ox = i % G.cols, oy = Math.floor(i / G.cols);
  for (let j = 0; j < b.n; j++) {
    if (j === i || G.revealed[j]) continue;
    const el = G.cells[j];
    const d = Math.hypot(j % G.cols - ox, Math.floor(j / G.cols) - oy) * 45 + 150;
    if (b.values[j]) {
      if (G.flags[j] && (G.flags[j] === b.values[j] || G.mode !== 'magnet' && G.mode !== 'weighted')) continue;
      el.className = 'cell mine anim';
      el.style.setProperty('--d', d + 'ms');
      el.innerHTML = mineIcon(G.mode, b.values[j]);
      if (G.flags[j]) el.classList.add('wrong');
    } else if (G.flags[j]) {
      el.classList.add('wrong');
    }
  }
  if (G.lossHint) setTimeout(() => showHint(G.lossHint, true), 700);
  setTimeout(showResult, 1500);
}

function showResult() {
  const r = G.result;
  if (!r || !$('game').classList.contains('active')) return;
  const d = DIFFICULTIES[G.diff];
  let html;
  if (r.win) {
    html = `
      <div class="result-head"><div class="big-ico">${ICON.trophy}</div><h2>Gelöst!</h2></div>
      <div class="result-score" id="count-up">0</div>
      ${r.isRecord ? '<div class="result-new">Neuer Rekord!</div>' : ''}
      <div class="breakdown">
        <span>Zeit</span><span>${fmtTime(G.elapsed)}</span>
        <span>Zug-Punkte (beste Combo x${G.maxCombo})</span><span>${fmtNum(G.score)}</span>
        <span>Zeitbonus (${d.name}, x${r.mult.toFixed(2)})${G.hints ? ` · ${G.hints} Tipp${G.hints > 1 ? 's' : ''}` : ''}</span><span>${fmtNum(r.bonus)}</span>
        <span class="tot">Gesamt</span><span class="tot">${fmtNum(r.total)}</span>
      </div>
      ${online.enabled ? '<div class="world" id="world"></div>' : ''}`;
  } else {
    html = `
      <div class="result-head"><div class="big-ico" style="color:var(--danger)">${ICON.boom}</div><h2>Boom!</h2></div>
      <div class="analysis"><p>${r.analysis}</p></div>`;
  }
  html += `<div class="actions"><button class="btn ghost" data-a="look">Feld ansehen</button><button class="btn primary" data-a="again">Nochmal</button></div>
           <div class="actions" style="margin-top:8px"><button class="btn ghost" data-a="menu">Menü</button></div>`;
  openSheet(html);
  const body = $('sheet-body');
  body.querySelector('[data-a=look]').onclick = closeSheet;
  body.querySelector('[data-a=again]').onclick = () => newGame(G.mode, G.diff);
  body.querySelector('[data-a=menu]').onclick = goHome;
  if (r.win && r.shown) $('count-up').textContent = fmtNum(r.total);
  if (r.win && online.enabled) renderWorld();
  if (r.win && !r.shown) {
    r.shown = true;
    const el = $('count-up');
    const t0 = now();
    const step = () => {
      const p = Math.min(1, (now() - t0) / 900);
      el.textContent = fmtNum(Math.round(r.total * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// ------------------------------------------------------------------ Weltrangliste

async function submitWorld() {
  const w = (G.world = { state: 'checking' });
  const id = G.online.id;
  let res = null;
  for (let k = 0; k < 3 && !res; k++) {
    if (k) await new Promise((r) => setTimeout(r, 1500));
    res = await api.finish({ id, first: G.board.first, attempt: G.board.attempt, moves: G.moves });
  }
  if (!res || !res.ok) { w.state = res ? 'rejected' : 'offline'; renderWorld(); return; }
  Object.assign(w, { state: 'checked', score: res.score, time: res.time, rank: res.rank, total: res.total });
  if (store.name) await claimWorld(w, id, store.name);
  else { w.state = 'needname'; renderWorld(); }
}

async function claimWorld(w, id, name) {
  w.state = 'claiming';
  renderWorld();
  const c = await api.claim(id, name);
  if (c && c.ok) {
    Object.assign(w, { state: 'listed', rank: c.rank, total: c.total, name: c.name });
    if (c.rank === 1) { fx.confetti(); sfx.win(); }
  } else {
    w.state = c && c.error === 'name' ? 'needname' : 'claimfail';
  }
  renderWorld();
}

function renderWorld() {
  const el = document.getElementById('world');
  if (!el) return;
  const w = G.world;
  const pts = w && w.score ? `<b>${fmtNum(w.score)}</b> Punkte` : '';
  let html;
  if (!G.online) html = 'Diese Runde wurde ohne Internet gestartet und zählt nur auf diesem Gerät.';
  else if (!w || w.state === 'checking') html = 'Weltrangliste: Dein Sieg wird geprüft …';
  else if (w.state === 'offline') html = 'Keine Verbindung zur Weltrangliste – die Runde zählt nur auf diesem Gerät.';
  else if (w.state === 'rejected') html = 'Diese Runde konnte für die Weltrangliste nicht bestätigt werden.';
  else if (w.state === 'claiming') html = `Geprüft: ${pts}. Wird eingetragen …`;
  else if (w.state === 'claimfail') html = `Geprüft: ${pts}, aber das Eintragen hat nicht geklappt. <button class="link-btn" data-a="retry">Nochmal versuchen</button>`;
  else if (w.state === 'needname') html = `Geprüft: ${pts} – das wäre <b>Platz ${w.rank}</b>. <button class="btn primary slim" data-a="name">Mit Namen eintragen</button>`;
  else if (w.state === 'listed') html = `<span class="world-rank">Platz ${w.rank}</span> von ${w.total} weltweit · ${pts} als <b>${esc(w.name)}</b> <button class="link-btn" data-a="list">Ansehen</button>`;
  el.innerHTML = `<span class="world-ico">${ICON.globe}</span><div>${html}${w && w.score && Math.abs(w.score - G.result.total) > 50 ? '<small>Gewertet wird die Zeit, die der Server misst – Pausen zählen dabei mit.</small>' : ''}</div>`;
  const id = G.online && G.online.id;
  const nameBtn = el.querySelector('[data-a=name]');
  if (nameBtn) nameBtn.onclick = () => askName((name) => { showResult(); if (name) claimWorld(w, id, name); });
  const retry = el.querySelector('[data-a=retry]');
  if (retry) retry.onclick = () => claimWorld(w, id, store.name);
  const list = el.querySelector('[data-a=list]');
  if (list) list.onclick = () => showScores(G.mode, G.diff, 'world');
}

$('btn-result').onclick = showResult;
$('btn-again').onclick = () => newGame(G.mode, G.diff);

// ------------------------------------------------------------------ Navigation & Pause

function goHome() {
  closeSheet();
  clearInterval(timerId);
  G.ended = true;
  G.lossHint = null;
  $('game').classList.remove('active');
  $('home').classList.add('active');
  renderHome();
}

$('btn-back').innerHTML = ICON.back;
$('btn-help').innerHTML = ICON.help;
$('btn-pause').innerHTML = ICON.pause;
$('ti-dig').innerHTML = ICON.dig;
$('ti-flag').innerHTML = ICON.flag;
$('ti-hint').innerHTML = ICON.hint;

$('btn-back').onclick = () => {
  if (!G.started || G.ended) { goHome(); return; }
  pause();
  openSheet(`
    <h2>Runde abbrechen?</h2>
    <p>Dein Fortschritt in dieser Runde geht verloren.</p>
    <div class="actions"><button class="btn ghost" data-a="stay">Weiterspielen</button><button class="btn primary" data-a="leave">Zum Menü</button></div>`, resume);
  $('sheet-body').querySelector('[data-a=stay]').onclick = closeSheet;
  $('sheet-body').querySelector('[data-a=leave]').onclick = () => { sheetClose = null; goHome(); };
};

$('btn-help').onclick = () => {
  const wasRunning = G.started && !G.ended && !G.paused;
  if (wasRunning) pause();
  showRules(G.mode, 'Weiter', wasRunning ? resume : null);
};

function pause() {
  if (!G.started || G.ended || G.paused) return;
  G.paused = true;
  G.pausedAt = now();
  $('board').classList.add('paused');
  $('btn-pause').innerHTML = ICON.play;
  boardMsg('Pausiert<small>Tippe, um weiterzuspielen</small>');
}
function resume() {
  if (!G.paused) return;
  G.paused = false;
  G.t0 += now() - G.pausedAt;
  $('board').classList.remove('paused');
  $('btn-pause').innerHTML = ICON.pause;
  boardMsg('');
}
$('btn-pause').onclick = () => (G.paused ? resume() : pause());
$('board-msg').addEventListener('click', () => { if (G.paused) resume(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ------------------------------------------------------------------ Start

renderHome();
if (location.hostname === 'localhost') window.__G = G; // nur zum lokalen Testen

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
