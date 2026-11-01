// Partikel auf einem Vollbild-Canvas: Funken, Explosion, Konfetti.

const canvas = document.getElementById('fx');
const g = canvas.getContext('2d');
let parts = [];
let running = false;
let dpr = 1;

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
}
addEventListener('resize', resize);
resize();

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function loop() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) {
    p.life -= p.decay;
    p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav;
    p.x += p.vx; p.y += p.vy;
    p.rot += p.vr;
    g.globalAlpha = Math.max(0, Math.min(1, p.life));
    g.fillStyle = p.color;
    if (p.shape === 'rect') {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      g.restore();
    } else {
      g.beginPath();
      g.arc(p.x, p.y, p.size * (0.4 + 0.6 * p.life), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(loop);
  else running = false;
}

function add(p) {
  if (reduced) return;
  parts.push({ vr: 0, rot: 0, drag: 0.94, grav: 0.12, decay: 0.025, shape: 'dot', ...p });
  if (!running) { running = true; requestAnimationFrame(loop); }
}

export function sparks(x, y, color, n = 10, speed = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
    add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, size: 2 + Math.random() * 2.5, color, decay: 0.03 + Math.random() * 0.02 });
  }
}

export function explosion(x, y) {
  const cols = ['#fff3b0', '#ffb347', '#ff6a3d', '#ff2d55', '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 9;
    add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: 2 + Math.random() * 5, color: cols[i % cols.length], decay: 0.012 + Math.random() * 0.02, grav: 0.08 });
  }
}

export function confetti() {
  const cols = ['#ffb547', '#36e2c8', '#b996ff', '#ff5d7a', '#5aa9ff', '#4ee6a3', '#ffe27a'];
  const w = innerWidth;
  for (let i = 0; i < 140; i++) {
    add({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 10,
      size: 7 + Math.random() * 6, color: cols[i % cols.length], shape: 'rect',
      vr: (Math.random() - 0.5) * 0.4, drag: 0.975, grav: 0.22, decay: 0.006 + Math.random() * 0.006,
    });
  }
}

export function ripple(x, y, size, color) {
  if (reduced) return;
  const el = document.createElement('div');
  el.className = 'ripple';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.width = el.style.height = size + 'px';
  if (color) el.style.borderColor = color;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

export function floater(x, y, text, color) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  if (color) el.style.color = color;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}
