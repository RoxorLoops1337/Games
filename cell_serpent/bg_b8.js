// Batch 8 background life: a live twinkling night sky with shooting stars, a squall of snow or a storm of petals when a
// snake head dies (per species), mist banks that part around snake heads, and tracking spotlights on boss stages.
// Everything uses small pooled arrays made once; nothing allocates per frame.
import { W, LINE_Y } from './sim.js';

const TAU = Math.PI * 2;
function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

export const SQUALL = { frosty: 1, mighty: 1 };                     // snow squall species
export const STORM = { love: 1, piggy: 1, sneezy: 1, sour: 1 };      // petal storm species
const NSTAR = 16, NFLAKE = 44, NPET = 40;

export function makeB8() {
  const r = rnd(808), b = { r, skin: 'love', stars: [], flakes: [], petals: [], shoot: { t0: -99, next: 5, x: 0, y: 0, dx: 1, dy: 0.4, len: 150 }, sq: { t0: -99, dir: 1 }, heads: { n: 0, x: [0, 0, 0, 0], y: [0, 0, 0, 0], bx: W / 2, bk: 0 }, bk: 0, lastBeam: null, bx: W / 2, by: 300, bl: 0, lt: -1, pendingWind: 0, wind: 0 };
  for (let i = 0; i < NSTAR; i++) b.stars.push({ x: 20 + r() * (W - 40), y: 300 + r() * 440, s: 3 + r() * 5, p: r() * TAU, v: 0.8 + r() * 1.6 });
  for (let i = 0; i < NFLAKE; i++) b.flakes.push({ x: r() * W, y: r() * 900, z: 0.6 + r() * 1.2, v: 0.8 + r() * 0.8 });
  for (let i = 0; i < NPET; i++) b.petals.push({ x: 0, y: 0, vx: 0, vy: 0, a: 0, w: 0, life: 0, max: 1, c: i % 3 });
  return b;
}

// a head died: a snow squall rolls through (frosty, mighty) or the head bursts into a storm of petals (the pink worlds)
export function headKill(b, t, x, y) {
  if (SQUALL[b.skin]) { b.sq.t0 = t; b.sq.dir = b.r() < 0.5 ? -1 : 1; b.pendingWind = b.sq.dir * 330; }
  else if (STORM[b.skin]) {
    for (let i = 0; i < NPET; i++) {
      const p = b.petals[i], a = b.r() * TAU, sp = 120 + b.r() * 380;
      p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 140; p.a = b.r() * TAU; p.w = (b.r() - 0.5) * 9; p.life = p.max = 1.8 + b.r() * 1.4;
    }
    b.pendingWind = (b.r() < 0.5 ? -1 : 1) * 210;
  } else b.pendingWind = (b.r() < 0.5 ? -1 : 1) * 140;
}

// the Encore beam fired at x: petals are sucked up along it, a squall leans away from it, anything else gets a small shove
export function beamKill(b, t, x) {
  const dir = x < W / 2 ? 1 : -1;
  if (SQUALL[b.skin]) { b.sq.t0 = t; b.sq.dir = dir; b.pendingWind = dir * 300; }
  else if (STORM[b.skin]) {
    for (let i = 0; i < NPET; i++) {
      const p = b.petals[i], side = i & 1 ? 1 : -1;
      p.x = x + side * (14 + b.r() * 26); p.y = LINE_Y - 60 - b.r() * 640; p.vx = side * (60 + b.r() * 170); p.vy = -(160 + b.r() * 320);
      p.a = b.r() * TAU; p.w = (b.r() - 0.5) * 11; p.life = p.max = 1.4 + b.r() * 1.2;
    }
    b.pendingWind = dir * 120;
  } else b.pendingWind = dir * 150;
}
// per frame: notice a new beam, ease the beam's pull on the mist in (fast) and out (slow)
export function stepBeam(b, beam, dt) {
  if (beam && beam !== b.lastBeam) beamKill(b, b.lt, beam.x);
  b.lastBeam = beam || null;
  if (beam) b.heads.bx = beam.x;
  b.bk += ((beam ? 1 : 0) - b.bk) * Math.min(1, dt * (beam ? 14 : 1.4)); if (b.bk < 0.003) b.bk = 0;
  b.heads.bk = b.bk;
}

// ---- night: stars that really twinkle and a shooting star now and then
export function drawNight(c, b, t, k, dim, low) {
  if (k < 0.45) return;
  const fade = Math.min(1, (k - 0.45) * 4) * dim;
  c.save(); c.fillStyle = '#fff';
  const n = low ? 8 : NSTAR;
  for (let i = 0; i < n; i++) {
    const s = b.stars[i], tw = Math.max(0, Math.sin(t * s.v + s.p)); if (tw < 0.25) continue;
    const z = s.s * (0.5 + 0.5 * tw);
    c.globalAlpha = fade * tw * 0.9; c.fillRect(s.x - z * 0.16, s.y - z, z * 0.32, z * 2); c.fillRect(s.x - z, s.y - z * 0.16, z * 2, z * 0.32);
    c.globalAlpha = fade * tw * 0.35; c.beginPath(); c.arc(s.x, s.y, z * 0.55, 0, TAU); c.fill();
  }
  const sh = b.shoot;
  if (t >= sh.next) {   // launch: from the upper sky, falling to one side
    const r = b.r; sh.t0 = t; sh.next = t + 6 + r() * 9; sh.dx = r() < 0.5 ? -1 : 1; sh.dy = 0.35 + r() * 0.3; sh.x = sh.dx < 0 ? 280 + r() * 400 : 40 + r() * 380; sh.y = 300 + r() * 220; sh.len = 130 + r() * 110;
  }
  const u = (t - sh.t0) / 0.85;
  if (u >= 0 && u < 1 && !(low && k < 0.6)) {
    const run = 340 * u, x = sh.x + sh.dx * run, y = sh.y + sh.dy * run, f = Math.sin(u * Math.PI);
    c.lineCap = 'round';
    for (let j = 0; j < 3; j++) {   // three strokes, longer ones fainter: a tail without a gradient
      const L = sh.len * (1 - j * 0.3) * f;
      c.globalAlpha = fade * f * (0.22 + j * 0.28); c.strokeStyle = j === 2 ? '#fff' : '#bcd6ff'; c.lineWidth = 6 - j * 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - sh.dx * L, y - sh.dy * L); c.stroke();
    }
    c.globalAlpha = fade * f; c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 4.5, 0, TAU); c.fill();
    c.globalAlpha = fade * f * 0.3; c.beginPath(); c.arc(x, y, 11, 0, TAU); c.fill();
  }
  c.restore();
}

// ---- squall and petal storm. Returns the wind to add (read once per frame).
export function stepB8(b, t, wd) {
  const dt = b.lt < 0 ? 0 : Math.min(0.1, Math.max(0, t - b.lt)); b.lt = t;
  if (b.pendingWind) { wd.wv = Math.max(-300, Math.min(300, wd.wv + b.pendingWind)); b.pendingWind = 0; }
  // the squall holds the wind up for a while instead of letting it die in a second
  const e = squallLevel(b, t);
  if (e > 0.02) { const want = b.sq.dir * 230 * e; if (Math.abs(wd.wv) < Math.abs(want)) wd.wv += (want - wd.wv) * Math.min(1, dt * 4); }
  return dt;
}
export function squallLevel(b, t) { const u = (t - b.sq.t0) / 2.6; return u < 0 || u > 1 ? 0 : u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.4); }

export function drawSquall(c, b, t, low) {
  if (!SQUALL[b.skin]) return;
  const e = squallLevel(b, t); if (e <= 0.01) return;
  const dir = b.sq.dir;
  c.save();
  c.globalAlpha = 0.14 * e; c.fillStyle = '#e8f4ff'; c.fillRect(0, 150, W, LINE_Y - 150);   // the air goes white
  c.fillStyle = '#fff'; const n = low ? 16 : NFLAKE;
  for (let i = 0; i < n; i++) {
    const f = b.flakes[i], sp = 900 * f.z * f.v, x = (((f.x + dir * (t - b.sq.t0) * sp) % (W + 160)) + W + 160) % (W + 160) - 80, y = (f.y + (t * 90 * f.z) % 900) % 900 + 160, len = 26 + 40 * f.z * e;
    c.globalAlpha = Math.min(0.85, 0.3 + e * 0.6) * (0.5 + 0.3 * f.z);
    c.fillRect(Math.min(x, x - dir * len), y, len, 2.2 * f.z);   // a flake smeared into a streak
  }
  c.restore();
}

export function drawPetalStorm(c, b, t, th, low) {
  if (!STORM[b.skin]) return;
  const dt = b.lt < 0 ? 0 : 0.016;
  c.save();
  for (let i = 0; i < NPET; i++) {
    const p = b.petals[i]; if (p.life <= 0) continue;
    p.life -= dt; const wv = b.windv || 0;
    p.vx += (wv * 0.9 - p.vx) * 0.02 + Math.sin(t * 5 + i) * 6; p.vy += (60 - p.vy) * 0.025;   // they slow, swirl and sink
    p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.w * dt;
    const k = p.life / p.max; if (k > 1 || (low && i & 1)) continue;
    c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.scale(1, 0.45 + 0.55 * Math.abs(Math.sin(p.a * 1.3 + i)));
    c.globalAlpha = Math.min(1, k * 2.2) * 0.9; c.fillStyle = p.c === 0 ? th.lite : p.c === 1 ? '#ffd7e8' : th.base;
    c.beginPath(); c.ellipse(0, 0, 11, 6, 0, 0, TAU); c.fill();
    c.restore();
  }
  c.restore();
}

// ---- mist that parts: collect up to 4 head positions, banks read them to slide aside and thin out
export function readHeads(b, snakes) {
  const h = b.heads; h.n = 0;
  for (let i = 0; i < snakes.length && h.n < 4; i++) { const s = snakes[i].segs[0]; if (s) { h.x[h.n] = s.x; h.y[h.n] = s.y; h.n++; } }
  return h;
}

// ---- boss arena: two lamps on the stage floor track the boss head and meet on it, with a pool of light behind it
export function drawBossLights(c, kit, b, t, pulse, ph, snakes, low) {
  if (!kit || !snakes || !snakes.length) return;
  let hx = 0, hy = 0, found = false;
  for (let i = 0; i < snakes.length; i++) { const s = snakes[i]; if (s.boss && s.segs[0]) { hx = s.segs[0].x; hy = s.segs[0].y; found = true; break; } }
  if (!found) return;
  const dt = 0.016; b.bx += (hx - b.bx) * Math.min(1, dt * 5); b.by += (Math.max(hy, 120) - b.by) * Math.min(1, dt * 5);
  const sprs = b.bs || (b.bs = [kit.bake('b8beamA', 140, 800, bb => beamPaint(bb, '255,150,200'), 1), kit.bake('b8beamB', 140, 800, bb => beamPaint(bb, '130,230,255'), 1), kit.bake('b8spot', 300, 300, spotPaint, 1)]);
  if (!sprs[0] || !sprs[1] || !sprs[2]) { b.bs = null; return; }
  const on = Math.min(1, Math.max(0, (hy + 80) / 200)); if (on <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  const heat = 1 - ph * 0.5;   // phase 2 turns the cool lamp hot
  for (let i = 0; i < 2; i++) {
    const ax = i ? W - 40 : 40, ay = LINE_Y - 10, dx = b.bx - ax, dy = b.by - ay, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) - Math.PI / 2 + Math.sin(t * 1.3 + i * 2) * 0.05;
    c.save(); c.translate(ax, ay); c.rotate(ang); c.globalAlpha = (0.2 + pulse * 0.16) * on * (i ? 1 : 1); c.drawImage(sprs[i && heat > 0.55 ? 1 : 0].c, -70, 0, 140, d + 50); c.restore();
  }
  c.globalAlpha = (0.24 + pulse * 0.22) * on; const sz = 330 + pulse * 40; c.drawImage(sprs[2].c, b.bx - sz / 2, b.by - sz / 2, sz, sz);
  if (!low) {   // the two lamp bodies glow on the floor
    c.globalAlpha = (0.3 + pulse * 0.4) * on; c.fillStyle = 'rgb(255,200,230)';
    for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(i ? W - 40 : 40, LINE_Y - 10, 12 + pulse * 6, 0, TAU); c.fill(); }
  }
  c.restore();
}
function beamPaint(b, rgb) {
  const g = b.createLinearGradient(0, -400, 0, 400); g.addColorStop(0, `rgba(${rgb},.95)`); g.addColorStop(1, `rgba(${rgb},.12)`);
  b.fillStyle = g; b.beginPath(); b.moveTo(-8, -400); b.lineTo(8, -400); b.lineTo(62, 400); b.lineTo(-62, 400); b.closePath(); b.fill();
}
function spotPaint(b) {
  const g = b.createRadialGradient(0, 0, 4, 0, 0, 150); g.addColorStop(0, 'rgba(255,230,240,.9)'); g.addColorStop(0.4, 'rgba(255,120,190,.35)'); g.addColorStop(1, 'rgba(255,90,170,0)');
  b.fillStyle = g; b.beginPath(); b.arc(0, 0, 150, 0, TAU); b.fill();
}
