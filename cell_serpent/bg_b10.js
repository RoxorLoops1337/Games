// Batch 10 background life: the sky creatures react to the show. When a snake head dies the world's creature bursts
// out of it in a little flock (bats scatter, birds flap off, butterflies fly up), and a stage clear gets a flourish
// that fits the world (butterflies and moths land on the duo, bees and bats circle them, birds and ducks land beside
// them, a penguin slides in, a rainbow after the rain, glitter on the ice, a shooting star over the dreamers).
// Fixed pools made once, closed-form motion, no gradients, nothing allocates per frame.
import { W, LINE_Y } from './sim.js';
import { FLYER, drawKind } from './bg_b9.js';

const TAU = Math.PI * 2;
function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

export const NSC = 8, NCL = 6;
export const CLEAR_T = 5.4;   // seconds the flourish lasts
const IN_T = 1.2, HOLD_T = 3.4, OUT_T = 1.3;
export const RAINBOW = ['#ff5a5a', '#ffa23a', '#ffe24a', '#6fe07a', '#52b8ff', '#9a7bff'];
// which kinds scatter from a dead head, which circle the duo, which stay on the ground
export const SCATTER = { butterfly: 1, bee: 1, bat: 1, bird: 1, moth: 1, duck: 1 };
export const ORBIT = { bee: 62, bat: 120 };
export const GROUND = { penguin: 1 };

export function makeB10() {
  const b = { r: rnd(1010), sc: [], cl: [], clT: -99, clSkin: '', clX: W / 2, clY: LINE_Y, lgt: 0, skin: '', lampT: -99 };
  for (let i = 0; i < NSC; i++) b.sc.push({ x: 0, y: 0, vx: 0, vy: 0, t0: -99, life: 2.4, p: 0, kind: '', alt: 0, s: 1 });
  for (let i = 0; i < NCL; i++) b.cl.push({ kind: '', n: 0, sx: 0, sy: 0, tx: 0, ty: 0, p: 0, alt: 0, dir: 1, on: false });
  return b;
}
export const countOn = a => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i].t0 > -50) n++; return n; };

// a head died at (x, y): the world's creature bursts out of it
export function scare(b, skin, t, x, y) {
  const kind = FLYER[skin]; if (!kind || !SCATTER[kind]) return 0;
  const n = kind === 'bat' ? NSC : 6, r = b.r;
  for (let i = 0; i < n; i++) {
    const f = b.sc[i], a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.5 + (r() - 0.5) * 0.4, sp = 240 + r() * 240;
    f.x = x; f.y = y; f.vx = Math.cos(a) * sp; f.vy = Math.sin(a) * sp; f.t0 = t; f.life = 2.2 + r() * 0.5; f.p = r() * TAU; f.kind = kind; f.alt = i & 1; f.s = 0.8 + r() * 0.4;
  }
  return n;
}
// stage clear: the world's flourish. px, py: where the duo stands.
export function clearFlourish(b, skin, t, px, py) {
  b.clT = t; b.clSkin = skin; b.clX = px; b.clY = py;
  if (skin === 'disco') b.lampT = t;
  const kind = FLYER[skin], r = b.r;
  for (let i = 0; i < NCL; i++) b.cl[i].on = false;
  if (!kind || kind === 'zzz') return 0;
  const n = kind === 'penguin' ? 2 : kind === 'duck' || kind === 'bird' ? 3 : kind === 'bat' ? 5 : 4;
  for (let i = 0; i < n; i++) {
    const c = b.cl[i], side = i & 1 ? 1 : -1, ground = !!GROUND[kind];
    c.on = true; c.kind = kind; c.n = i; c.p = r() * TAU; c.alt = i & 1; c.dir = side;
    c.sx = side > 0 ? W + 60 : -60; c.sy = ground ? py + 16 : 360 + r() * 260;
    if (ground) { c.tx = px + side * (96 + i * 6); c.ty = py + 16; }
    else if (kind === 'butterfly' || kind === 'moth') { c.tx = px + (i - 1.5) * 38; c.ty = py - 128 - (i & 1) * 24; }
    else if (ORBIT[kind]) { c.tx = px; c.ty = py - 64; }
    else { c.tx = px + side * (88 + (i >> 1) * 34 + (i === 2 ? 40 : 0)); c.ty = py + 18 - (i === 2 ? 12 : 0); }
  }
  return n;
}

const ease = u => u * u * (3 - 2 * u);
// where clear creature c is at flourish time u (seconds). Writes into OUT (shared), returns the fade 0..1 (0 = gone).
export const OUT = { x: 0, y: 0, face: 1, calm: 0 };
export function clearPos(b, c, u) {
  const hold = HOLD_T + c.n * 0.12, orb = ORBIT[c.kind], tin = IN_T + c.n * 0.16;
  let tx = c.tx, ty = c.ty;
  if (orb) { const a = u * (c.kind === 'bee' ? 6 : 3.4) + c.n * 2.1; tx = b.clX + Math.cos(a) * orb; ty = b.clY - 64 + Math.sin(a) * orb * 0.45; }
  const e = ease(Math.min(1, u / tin));
  let x = c.sx + (tx - c.sx) * e + Math.sin(u * 5 + c.p) * 16 * (1 - e), y = c.sy + (ty - c.sy) * e + Math.sin(u * 7 + c.p) * 12 * (1 - e);
  if (GROUND[c.kind]) y -= Math.abs(Math.sin(u * 5 + c.p)) * (e < 1 ? 7 : 3);
  let fade = Math.min(1, u * 5);
  OUT.face = u < tin ? (tx > c.sx ? 1 : -1) : (orb ? 1 : -c.dir);
  OUT.calm = !orb && u >= tin && u < hold ? 1 : 0;
  if (u > hold) {
    const w = Math.min(1, (u - hold) / OUT_T), q = w * w; fade = 1 - Math.max(0, w - 0.5) * 2;
    if (GROUND[c.kind]) x += c.dir * q * 560; else { x += c.dir * q * 420; y -= q * 620; }
    OUT.face = c.dir; OUT.calm = 0;
  }
  OUT.x = x; OUT.y = y; return fade;
}

// per frame: forget everything when the stage or the run changes
export function stepB10(b, t, skin, gt) {
  if (b.skin !== skin || (gt !== undefined && gt < b.lgt - 0.5)) { for (let i = 0; i < NSC; i++) b.sc[i].t0 = -99; for (let i = 0; i < NCL; i++) b.cl[i].on = false; b.clT = -99; b.lampT = -99; }
  b.skin = skin; b.lgt = gt === undefined ? 0 : gt;
}

// seconds into a running flourish, -1 when none runs
export function clearAge(b, t) { const u = t - b.clT; return u >= 0 && u < CLEAR_T ? u : -1; }

export function drawScatter(c, b, t, th, low) {
  c.save();
  const n = low ? NSC >> 1 : NSC;
  for (let i = 0; i < n; i++) {
    const f = b.sc[i]; if (f.t0 < -50) continue;
    const u = t - f.t0; if (u < 0 || u > f.life) { if (u > f.life) f.t0 = -99; continue; }
    const d = (1 - Math.exp(-3 * u)) / 3, x = f.x + f.vx * (d + 0.35 * u), y = f.y + f.vy * (d + 0.35 * u) + u * u * 40;
    const fade = Math.min(1, (f.life - u) * 2.5);
    c.globalAlpha = 0.95 * fade; c.save(); c.translate(x, y); c.scale((f.vx < 0 ? -1 : 1) * f.s, f.s);
    drawKind(c, f.kind, Math.sin(u * (f.kind === 'bat' ? 20 : 14) + f.p), f.alt, b.skin, th); c.restore();
  }
  c.restore();
}

export function drawClear(c, b, t, th, low) {
  const u = clearAge(b, t); if (u < 0) return;
  c.save();
  for (let i = 0; i < NCL; i++) {
    const k = b.cl[i]; if (!k.on) continue;
    const fade = clearPos(b, k, u); if (fade <= 0.01) continue;
    const flap = OUT.calm ? Math.sin(u * 3 + k.p) * 0.35 : Math.sin(u * (k.kind === 'bat' ? 16 : k.kind === 'bee' ? 60 : 11) + k.p);
    c.globalAlpha = 0.97 * fade; c.save(); c.translate(OUT.x, OUT.y); c.scale(OUT.face * 1.3, 1.3);
    drawKind(c, k.kind, flap, k.alt, b.clSkin, th); c.restore();
  }
  const sk = b.clSkin;
  if (sk === 'grumpy') {   // the rain stops and a rainbow comes out
    const a = Math.min(1, u / 0.9, (CLEAR_T - u) / 1.2);
    c.globalAlpha = 0.34 * a; c.lineWidth = 12; c.lineCap = 'butt';
    for (let i = 0; i < RAINBOW.length; i++) { c.strokeStyle = RAINBOW[i]; c.beginPath(); c.arc(W / 2, LINE_Y - 20, 400 - i * 12, Math.PI, TAU); c.stroke(); }
  } else if (sk === 'frosty') {   // glitter drifts down through the cold air
    const a = Math.min(1, u / 0.5, (CLEAR_T - u) / 1.2), n = low ? 8 : 16; c.fillStyle = '#eaf8ff';
    for (let i = 0; i < n; i++) {
      const tw = 0.5 + 0.5 * Math.sin(u * 7 + i * 1.9), z = 4 + (i % 4) * 2.2 * tw, x = (i * 97 + 31) % W + Math.sin(u * 1.5 + i) * 20, y = 160 + (u * (140 + (i % 5) * 26) + i * 83) % (LINE_Y - 200);
      c.globalAlpha = a * tw * 0.9; c.fillRect(x - z * 0.15, y - z, z * 0.3, z * 2); c.fillRect(x - z, y - z * 0.15, z * 2, z * 0.3);
    }
  }
  c.restore();
}
