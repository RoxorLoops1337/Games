// Batch 7 background life: ground mist banks on the sleepy and gloomy worlds, wind gusts that kills blow through the
// petals, snow and mist, and small helpers that read the snakes (dash telegraph, how close a head is to the circle).
// Mist is two baked soft sprites drawn a few times; nothing allocates per frame.
import { W, LINE_Y } from './sim.js';

const TAU = Math.PI * 2;
// per species: banks, body colour, alpha, drift speed (px/s), how high the fog reaches above the line
export const MIST = {
  sleepy: { n: 5, rgb: '176,160,255', core: '226,214,255', a: 0.5, sp: 6, rise: 150 },
  gloomy: { n: 6, rgb: '120,96,196', core: '150,255,170', a: 0.6, sp: 9, rise: 190 },
};
export const mistFor = skin => MIST[skin] || null;
function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// one bank: a pile of soft ellipses, flatter at the bottom so it hugs the ground; v picks one of two shapes
function bakeBank(b, m, v) {
  const r = rnd(5 + v * 17);
  for (let i = 0; i < 9; i++) {
    const x = (i / 8 - 0.5) * 300 + (r() - 0.5) * 36, y = 14 - Math.sin(i / 8 * Math.PI) * (26 + r() * 22) + (r() - 0.5) * 10, rw = 70 + r() * 56, rh = 22 + r() * 18;
    b.save(); b.translate(x, y); b.scale(1, rh / rw);
    const g = b.createRadialGradient(0, 0, 2, 0, 0, rw);
    g.addColorStop(0, `rgba(${i % 3 === 1 ? m.core : m.rgb},.5)`); g.addColorStop(0.55, `rgba(${m.rgb},.2)`); g.addColorStop(1, `rgba(${m.rgb},0)`);
    b.fillStyle = g; b.beginPath(); b.arc(0, 0, rw, 0, TAU); b.fill(); b.restore();
  }
}

// banks keep their own x, height and speed; wx is the gust offset from the wind state
export function makeBanks() {
  const a = [], r = rnd(29);
  for (let i = 0; i < 6; i++) a.push({ x: r() * (W + 420), u: r(), v: 0.6 + r() * 0.8, p: r() * TAU, k: i & 1, z: 0.5 + r() * 0.9 });
  return a;
}
export function drawMist(c, kit, skin, banks, t, wx, boss, low, heads) {
  const m = mistFor(skin); if (!m || !kit) return;
  let sprs = banks.spr;   // looked up once per world, not every frame
  if (!sprs || banks.sprSkin !== skin) {
    sprs = [kit.bake(`mistbank|${skin}|0`, 380, 100, b => bakeBank(b, m, 0), 1), kit.bake(`mistbank|${skin}|1`, 380, 100, b => bakeBank(b, m, 1), 1)];
    if (!sprs[0] || !sprs[1]) return;
    banks.spr = sprs; banks.sprSkin = skin;
  }
  const n = low ? Math.min(3, m.n) : m.n, span = W + 420, dtp = Math.min(0.1, Math.max(0, t - (banks.lt === undefined ? t : banks.lt))); banks.lt = t;
  c.save();
  for (let i = 0; i < n; i++) {
    const k = banks[i], x = ((k.x + t * m.sp * k.v + wx * k.z) % span + span) % span - 210, y = LINE_Y - 14 - k.u * m.rise + Math.sin(t * 0.35 * k.v + k.p) * 5;
    const sc = 0.9 + k.u * 0.7, h = 100 * sc, w = 380 * sc;
    const part = heads ? partOf(k, heads, x, y, dtp) : 0;   // batch 8: banks slide aside and thin out around a snake head
    c.globalAlpha = m.a * (0.75 + 0.25 * Math.sin(t * 0.5 + k.p)) * (boss ? 1.05 : 1) * (1 - k.u * 0.35) * (1 - 0.6 * k.pa);
    c.drawImage(sprs[k.k].c, x + k.pu - w / 2, y - h / 2, w, h);
  }
  c.restore();
}

// the push a bank gets from the heads near it, eased so it glides: k.pu is the sideways shove in px, k.pa how thin it went (0..1)
function partOf(k, heads, x, y, dt) {
  let push = 0, thin = 0;
  for (let i = 0; i < heads.n; i++) {
    const dx = x - heads.x[i], dy = Math.abs(y - heads.y[i]), nx = Math.max(0, 1 - Math.abs(dx) / 260), ny = Math.max(0, 1 - dy / 340), q = nx * ny;
    push += (dx < 0 ? -1 : 1) * q * 150; if (q > thin) thin = q;
  }
  if (heads.bk > 0) {   // batch 9: the Encore beam blows a whole column of mist apart
    const dx = x - heads.bx, q = Math.max(0, 1 - Math.abs(dx) / 300) * heads.bk;
    push += (dx < 0 ? -1 : 1) * q * 230; if (q > thin) thin = q;
  }
  const e = Math.min(1, dt * 3.2);
  k.pu = (k.pu || 0) + (push - (k.pu || 0)) * e; k.pa = (k.pa || 0) + (thin - (k.pa || 0)) * e;
  return thin;
}

// ---- wind: a kill gives the air a shove (alternating mostly the same way). wx is the distance everything has been blown.
export function makeWind() { return { wx: 0, wv: 0, lt: -1, kp: 9, dir: 1, r: rnd(404) }; }
// kick: seconds since the last kill. A new kill is the moment kick falls back below its previous value.
export function stepWind(w, t, kick, reduce) {
  const dt = w.lt < 0 ? 0 : Math.min(0.1, Math.max(0, t - w.lt)); w.lt = t;
  if (reduce) { w.wv = 0; w.wx = 0; w.kp = kick; return; }
  if (kick < w.kp - 0.0001 && kick < 0.3) { if (w.r() < 0.35) w.dir = -w.dir; w.wv = Math.max(-260, Math.min(260, w.wv + w.dir * (110 + w.r() * 70))); }
  w.kp = kick;
  w.wv *= Math.exp(-dt * 1.7); if (Math.abs(w.wv) < 1) w.wv = 0;
  w.wx += w.wv * dt + w.dir * 6 * dt;   // a breath of steady drift too
  if (w.wx > 20000 || w.wx < -20000) w.wx = 0;
}
// a few thin streaks that whoosh across while a gust is strong: one path, one stroke
export function drawGust(c, w, t, low) {
  const a = Math.abs(w.wv) / 260; if (a < 0.08) return;
  const n = low ? 4 : 8, dir = w.wv > 0 ? 1 : -1;
  c.save(); c.lineCap = 'round'; c.strokeStyle = 'rgb(235,240,255)'; c.lineWidth = 1.6; c.globalAlpha = Math.min(0.5, a * 0.6);
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const sd = i * 71 + 13, y = LINE_Y * (0.15 + ((sd * 37) % 100) / 100 * 0.75), len = 50 + ((sd * 13) % 60), x = (((sd * 53) % 100) / 100 * (W + 200) + w.wx * (1.3 + (i % 3) * 0.3)) % (W + 200);
    const px = (x + W + 200) % (W + 200) - 100;
    c.moveTo(px, y); c.lineTo(px - dir * len, y + Math.sin(t * 3 + i) * 3);
  }
  c.stroke(); c.restore();
}

// ---- snake readers (no allocation; the result lives in one shared object)
export const DASH = { k: 0, x: 0 };   // k: 0 calm, 1 a snake is winding up, 2 a snake is dashing; x: head x of the one that is
export function dashState(snakes) {
  DASH.k = 0; DASH.x = W / 2;
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i], k = s.surge === 'go' ? 2 : s.surge === 'warn' ? 1 : 0;
    if (k > DASH.k) { DASH.k = k; DASH.x = s.segs[0].x; }
  }
  return DASH;
}
// 0..1: how close the nearest snake head is to the rim of the circle (1 = on it), for the warning pulse
export function ringDanger(snakes, ring) {
  let best = 1e9;
  for (let i = 0; i < snakes.length; i++) { const h = snakes[i].segs[0]; if (!h) continue; const d = Math.hypot(h.x - ring.cx, h.y - ring.cy) - ring.R - h.r * 0.4; if (d < best) best = d; }
  return Math.max(0, Math.min(1, 1 - best / 150));
}
