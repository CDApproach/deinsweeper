// Kleine Synthesizer-Effekte über die Web Audio API – keine Audiodateien nötig.

let ctx = null;
let master = null;
export const audio = { enabled: true };

function ac() {
  if (!audio.enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// iOS gibt Audio erst nach einer Berührung frei.
export function unlockAudio() { ac(); }

function tone(freq, { dur = 0.12, type = 'sine', vol = 0.2, when = 0, slide = 0, attack = 0.005 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.6, vol = 0.5, freq = 900, when = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(80, t + dur);
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// Pentatonik, damit steigende Combos immer harmonisch klingen.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const note = (step) => 523.25 * 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);

export const sfx = {
  reveal(combo = 1, cells = 1) {
    tone(note(combo - 1), { dur: 0.13, type: 'triangle', vol: 0.18 });
    if (cells > 4) {
      for (let k = 1; k <= Math.min(4, Math.floor(cells / 6) + 1); k++) {
        tone(note(combo - 1 + k), { dur: 0.1, type: 'sine', vol: 0.07, when: k * 0.045 });
      }
    }
  },
  flag() { tone(880, { dur: 0.07, type: 'square', vol: 0.06 }); tone(1320, { dur: 0.06, type: 'sine', vol: 0.08, when: 0.03 }); },
  unflag() { tone(660, { dur: 0.08, type: 'sine', vol: 0.08, slide: 0.6 }); },
  deny() { tone(180, { dur: 0.12, type: 'square', vol: 0.06 }); },
  peek() { tone(1046, { dur: 0.05, type: 'sine', vol: 0.05 }); },
  chord() { tone(392, { dur: 0.18, type: 'sine', vol: 0.12, slide: 2 }); },
  hint() { [0, 4, 7].forEach((s, k) => tone(659 * 2 ** (s / 12), { dur: 0.25, type: 'sine', vol: 0.09, when: k * 0.06 })); },
  boom() {
    noise({ dur: 0.9, vol: 0.9, freq: 1400 });
    tone(140, { dur: 0.7, type: 'sine', vol: 0.5, slide: 0.25 });
  },
  win() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => tone(523.25 * 2 ** (s / 12), { dur: 0.35, type: 'triangle', vol: 0.14, when: k * 0.075 }));
    tone(1046.5, { dur: 0.9, type: 'sine', vol: 0.1, when: 0.55 });
  },
  start() { tone(330, { dur: 0.5, type: 'sine', vol: 0.12, slide: 3 }); },
};

export const haptics = {
  enabled: true,
  buzz(pattern) {
    if (!this.enabled || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch { /* nicht unterstützt */ }
  },
};
