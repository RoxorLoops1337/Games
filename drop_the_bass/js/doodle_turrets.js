// doodle_turrets.js: the DOODLE version of the turrets and projectiles. Every turret is a kid's crayon drawing of an instrument with a smiley face, sitting on a
// scribbled pad on the notebook page. Built on doodle_kit.js: static art is baked into 3 boil frames and replayed, per-frame work is a few blits and transforms.
// Same exports and option semantics as art_turrets.js: drawTurret(ctx,type,level,x,y,o), drawTurretIconFlat(ctx,type,x,y,size), drawProjectile(ctx,kind,x,y,o).
import { TURRETS } from './data_core.js';
import { C, arc, rect, star, sprite, blit, setScale, clamp } from './doodle_kit.js';

export function setArtScale(n) { setScale(n); }

const TAU = Math.PI * 2;
const INK = C.ink;
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// tint a hex colour toward `to` (k 0..1), or darken with a negative k
function tint(hex, k, to = '#ffffff') {
  const a = hexRgb(hex), b = hexRgb(k < 0 ? '#000000' : to), m = Math.abs(k);
  const r = a.map((v, i) => Math.round(v + (b[i] - v) * m));
  return '#' + r.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// where the face sits on each body (x, y, size) and whether a rotating pointer is drawn over it
const FACE = {
  kick: [0, 2, 1], snare: [0, 2, 0.95], hat: [0, -9, 0.8], sub: [0, 0, 0.9], mic: [0, -8, 0.95], synth: [0, -4, 0.8], horn: [-3, 2, 0.9],
  scratch: [0, 0, 0.9], loop: [0, -5, 0.8], cowbell: [0, 3, 0.9], amp: [0, -11, 0.8], vocal: [0, 0, 1.05],
};
const POINTER = { kick: 1, snare: 1, hat: 1, mic: 1, synth: 1, horn: 1, scratch: 1, cowbell: 1 };

// ---- little drawing helpers (all take the pen so the boil seed applies)
function face(p, x, y, s, mood) {
  const ex = 5.4 * s, r = 3.3 * s;
  if (mood === 'x') {   // not used in baked art (jam draws X eyes live), kept for lab sheets
    for (const sx of [-1, 1]) { p.ln([x + sx * ex - 2.4, y - 2.4, x + sx * ex + 2.4, y + 2.4], INK, 2, false, 0.4); p.ln([x + sx * ex + 2.4, y - 2.4, x + sx * ex - 2.4, y + 2.4], INK, 2, false, 0.4); }
    p.ln([x - 4, y + 5, x - 2, y + 3.4, x, y + 5, x + 2, y + 3.4, x + 4, y + 5], INK, 2, false, 0.4);
    return;
  }
  for (const sx of [-1, 1]) { p.dot(x + sx * ex, y - 1.5 * s, r, '#fff'); p.ln(arc(x + sx * ex, y - 1.5 * s, r, r, 0, 360, 8), INK, 1.5, true, 0.4); p.dot(x + sx * ex + 0.8, y - 1.2 * s, r * 0.5, INK); }
  p.ln(arc(x, y + 1.5 * s, 3.8 * s, 3 * s, 20, 160, 6), INK, 2, false, 0.5);
  p.dot(x - 9 * s, y + 2.5 * s, 2.2 * s, 'rgba(255,95,176,0.55)'); p.dot(x + 9 * s, y + 2.5 * s, 2.2 * s, 'rgba(255,95,176,0.55)');
}
function sparkle(p, x, y, r, col) { p.ln([x - r, y, x + r, y], col, 1.8, false, 0.3); p.ln([x, y - r, x, y + r], col, 1.8, false, 0.3); }
function waves(p, x, y, dir, n, r, col) { for (let i = 0; i < n; i++) p.ln(arc(x, y, r + i * 5, r + i * 5, dir > 0 ? -35 : 145, dir > 0 ? 35 : 215, 6), col, 2.2, false, 0.5); }
function hatchBody(p, pts, fill, tier, o = {}) {   // filled outlined shape; higher tiers add a second scribble colour
  p.shp(pts, fill, INK, o.lw || 3, { gap: o.gap || 5, f2: tier >= 1 ? (o.f2 || tint(fill, 0.55)) : null, alpha: 0.95 });
}

// ---- the instrument bodies. Each draws centred near (0, 4) inside a 56 x 64 box. tier: 0 = levels 1-2, 1 = levels 3-4, 2 = levels 5-7.
const BODY = {
  kick(p, d, tier) {
    p.shp(p.blob(0, 4, 21, 19, 16, 0.04), d.color, INK, 3.4, { gap: 5, f2: tier ? tint(d.color, 0.5) : null });
    p.ln(arc(0, 4, 17, 15, 200, 340, 8), '#fff6ea', 3, false, 0.6);
    for (const a of [20, 70, 110, 160]) { const x = Math.cos(a * Math.PI / 180) * 21, y = 4 + Math.sin(a * Math.PI / 180) * 19; p.dot(x, y, 2.3, C.paper); p.ln(arc(x, y, 2.3, 2.3, 0, 360, 6), INK, 1.2, true, 0.3); }
    if (tier) { p.ln([-14, 20, -8, 14, -2, 20, 4, 14, 10, 20], C.yellow, 2.4, false, 0.5); }
  },
  snare(p, d, tier) {
    p.shp(rect(-22, -3, 44, 24, 6), d.color, INK, 3.4, { gap: 5, f2: tier ? tint(d.color, 0.55) : null });
    p.shp(p.blob(0, -3, 22, 8, 14, 0.04), '#fffbe0', INK, 3, { gap: 6 });
    p.ln([-20, 8, -12, 18, -4, 8, 4, 18, 12, 8, 20, 18], INK, 1.6, false, 0.4);
    if (tier) p.ln(arc(0, -3, 18, 5, 200, 340, 6), C.orange, 2, false, 0.4);
  },
  hat(p, d, tier) {
    p.ln([0, -4, 0, 28], INK, 3, false, 0.5); p.ln([-12, 30, 0, 22, 12, 30], INK, 3, false, 0.5);
    p.shp(p.blob(0, 8, 22, 6.5, 14, 0.04), d.color, INK, 3, { gap: 5, f2: tier ? tint(d.color, 0.5) : null });
    p.shp(p.blob(0, -6, 24, 8, 14, 0.04), tint(d.color, 0.15), INK, 3.2, { gap: 5, f2: tier ? C.yellow : null });
    p.dot(0, -9, 2.2, C.gold);
  },
  sub(p, d, tier) {
    p.shp(rect(-21, -20, 42, 46, 7), '#6a5ee0', INK, 3.4, { gap: 5, f2: tier ? tint('#6a5ee0', 0.5) : null });
    p.shp(p.blob(0, 6, 15, 15, 14, 0.04), '#d9d4ff', INK, 3, { gap: 5 });
    p.shp(p.blob(0, 6, 8, 8, 12, 0.05), d.color, INK, 2.6, { gap: 4 });
    p.dot(0, -11, 3.6, '#d9d4ff'); p.ln(arc(0, -11, 3.6, 3.6, 0, 360, 8), INK, 1.8, true, 0.3);
    waves(p, 21, 6, 1, tier ? 3 : 2, 6, C.cyan); waves(p, -21, 6, -1, tier ? 3 : 2, 6, C.cyan);
  },
  mic(p, d, tier) {
    p.ln([0, 12, 0, 32], INK, 7, false, 0.4); p.ln([0, 12, 0, 32], '#b9b9c6', 3.4, false, 0.4);
    p.shp(rect(-5, 14, 10, 5, 2), d.color, INK, 2, { gap: 3 });
    p.shp(p.blob(0, -4, 17, 17, 14, 0.04), '#cfcfda', INK, 3.4, { gap: 4.5, f2: tier ? d.color : null });
    p.ln(arc(0, -4, 17, 6, 0, 180, 8), INK, 1.6, false, 0.4); p.ln(arc(0, -4, 6, 17, -90, 90, 8), INK, 1.6, false, 0.4);
    p.shp(p.blob(0, 10, 13, 4, 10, 0.05), d.color, INK, 2.4, { gap: 4 });
  },
  synth(p, d, tier) {
    p.shp(rect(-23, -12, 46, 36, 6), d.color, INK, 3.4, { gap: 5, f2: tier ? tint(d.color, 0.55) : null });
    p.shp(rect(-20, 6, 40, 14, 2), '#fffdf2', INK, 2.4, { gap: 8, alpha: 0.5 });
    for (let i = -16; i <= 16; i += 8) p.ln([i, 6, i, 20], INK, 1.4, false, 0.2);
    for (const i of [-12, -4, 12]) p.shp(rect(i - 2.4, 6, 4.8, 8, 1), INK, INK, 1, { gap: 3 });
    for (const x of [-15, 15]) { p.dot(x, 0, 2.6, C.yellow); p.ln(arc(x, 0, 2.6, 2.6, 0, 360, 6), INK, 1.2, true, 0.2); }
  },
  horn(p, d, tier) {
    p.shp(rect(-12, -6, 24, 32, 6), d.color, INK, 3.4, { gap: 5, f2: tier ? tint(d.color, 0.55) : null });
    p.shp(rect(-6, -12, 12, 8, 2), '#cfcfda', INK, 2.4, { gap: 4 });
    p.ln([-12, 4, 12, 4], '#fff6ea', 2.4, false, 0.4);
  },
  scratch(p, d, tier) {
    p.shp(p.blob(0, 2, 22, 22, 18, 0.03), '#3a3450', INK, 3.4, { gap: 5, f2: tier ? '#6d6590' : null });
    for (const r of [17, 13]) p.ln(arc(0, 2, r, r, 20, 330, 12), '#8d86b0', 1.4, false, 0.3);
    p.shp(p.blob(0, 2, 9, 9, 12, 0.05), '#f6f2ff', INK, 2.4, { gap: 4 });
  },
  loop(p, d, tier) {
    p.shp(rect(-23, -20, 46, 46, 8), d.color, INK, 3.4, { gap: 5, f2: tier ? tint(d.color, 0.55) : null });
    p.shp(rect(-17, -16, 34, 17, 4), '#f6fff2', INK, 2.4, { gap: 6, alpha: 0.6 });
    for (const x of [-10, 10]) { p.shp(p.blob(x, 15, 7, 7, 10, 0.05), '#d8d8e2', INK, 2.4, { gap: 4 }); }
    p.ln(arc(0, 15, 3, 3, 40, 330, 8), C.red, 2, false, 0.3);
    p.dot(-18, -22, 2, C.red);
  },
  cowbell(p, d, tier) {
    p.shp([-11, -14, 11, -14, 22, 24, -22, 24], d.color, INK, 3.4, { gap: 5, f2: tier ? tint(d.color, 0.55) : null });
    p.shp(rect(-9, -20, 18, 8, 3), '#cfcfda', INK, 2.4, { gap: 4 });
    p.ln(arc(0, -22, 5, 4, 180, 360, 6), INK, 2.2, false, 0.3);
    p.shp([-22, 24, 22, 24, 18, 31, -18, 31], tint(d.color, -0.25), INK, 2.6, { gap: 4 });
  },
  amp(p, d, tier) {
    p.shp(rect(-23, -22, 46, 50, 6), '#40364e', INK, 3.4, { gap: 5, f2: tier ? d.color : null });
    p.shp(rect(-19, -18, 38, 12, 3), d.color, INK, 2.4, { gap: 4 });
    for (const x of [-12, -4, 4, 12]) { p.dot(x, -12, 2.2, '#fff6ea'); p.ln([x, -12, x + 1.2, -15], INK, 1.2, false, 0.2); }
    p.shp(p.blob(0, 11, 12, 12, 12, 0.04), '#8d86a8', INK, 2.6, { gap: 4 }); p.dot(0, 11, 4, '#2b2733');
  },
  vocal(p, d, tier) {
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; p.dot(Math.cos(a) * 22, 2 + Math.sin(a) * 22, 2.6, ['#ff5fb0', '#ffd60a', '#9dff3a', '#19d3ff', '#7b4fd0'][i % 5]); }
    p.shp(p.blob(0, 2, 17, 17, 14, 0.04), '#ffe0f4', INK, 3.4, { gap: 4.5, f2: tier ? '#ffc2e6' : null });
    p.ln(arc(0, 2, 22, 22, 200, 250, 5), '#fff', 2, false, 0.3);
  },
};
// the rotating pointer, drawn pointing right from (0, 0), in a 56 x 24 box (origin at the left end)
const POINT = {
  kick(p) { p.ln([0, 0, 40, 0], INK, 8, false, 0.4); p.ln([0, 0, 40, 0], '#d9a066', 4.4, false, 0.4); p.dot(41, 0, 6, C.red); p.ln(arc(41, 0, 6, 6, 0, 360, 8), INK, 2, true, 0.3); },
  snare(p) { p.ln([0, 0, 38, 0], INK, 7, false, 0.4); p.ln([0, 0, 38, 0], '#f1d18a', 3.4, false, 0.4); p.dot(39, 0, 4.6, '#fff6ea'); p.ln(arc(39, 0, 4.6, 4.6, 0, 360, 8), INK, 1.8, true, 0.3); },
  hat(p) { p.ln([0, 0, 34, 0], INK, 6, false, 0.4); p.ln([0, 0, 34, 0], '#f1d18a', 3, false, 0.4); p.dot(35, 0, 3.6, C.lime); p.ln(arc(35, 0, 3.6, 3.6, 0, 360, 6), INK, 1.6, true, 0.3); },
  mic(p) { p.shp([0, -5, 30, -12, 30, 12, 0, 5], C.pink, INK, 2.8, { gap: 4 }); p.ln(arc(32, 0, 7, 10, -70, 70, 6), C.pink, 2.2, false, 0.4); p.ln(arc(32, 0, 12, 14, -60, 60, 6), C.pink, 2, false, 0.4); },
  synth(p) { p.ln([0, 0, 8, -7, 14, 6, 22, -8, 30, 5, 38, 0], INK, 7, false, 0.4); p.ln([0, 0, 8, -7, 14, 6, 22, -8, 30, 5, 38, 0], C.cyan, 3.4, false, 0.4); sparkle(p, 42, 0, 4, C.yellow); },
  horn(p) { p.shp([0, -5, 36, -15, 36, 15, 0, 5], C.red, INK, 3, { gap: 4, f2: '#ffd0d0' }); p.ln(arc(38, 0, 7, 12, -70, 70, 6), C.red, 2.2, false, 0.4); },
  scratch(p) { p.ln([0, 0, 30, 0], INK, 6, false, 0.4); p.ln([0, 0, 30, 0], '#e5e5ff', 2.8, false, 0.4); p.shp([30, -4, 38, -4, 38, 4, 30, 4], '#e5e5ff', INK, 2, { gap: 3 }); },
  cowbell(p) { p.ln([0, 0, 46, 0], INK, 6, false, 0.4); p.ln([0, 0, 46, 0], '#b98a5a', 3, false, 0.4); p.dot(47, 0, 4.4, C.gold); p.ln(arc(47, 0, 4.4, 4.4, 0, 360, 8), INK, 1.8, true, 0.3); },
};

// ---- sprites (cached through the kit)
function padSprite(type, L) {
  const d = TURRETS[type];
  return sprite('dt_pad|' + type + '|' + L, 72, 80, (p) => {
    const c = p.ctx;
    // a scribbled pad: pale tint of the instrument colour, double border for higher levels
    p.shp(rect(-29, -18, 58, 56, 10), tint(d.color, 0.8), INK, 3, { gap: 6, alpha: 0.75 });
    if (L >= 4) p.ln(rect(-26, -15, 52, 50, 8), tint(d.color, -0.1), 2, true, 0.8);
    if (L >= 6) p.ln(rect(-31, -20, 62, 60, 12), C.gold, 2.4, true, 0.9);
    // stars across the top: L-1 of them (levels 2 to 6); level 7 gets a crown and rays
    if (L >= 7) {
      for (let i = 0; i < 7; i++) { const a = -Math.PI + (i + 0.5) / 7 * Math.PI; p.ln([Math.cos(a) * 30, -2 + Math.sin(a) * 30, Math.cos(a) * 37, -2 + Math.sin(a) * 37], C.gold, 3, false, 0.6); }
      p.shp([-12, -26, -12, -36, -6, -31, 0, -39, 6, -31, 12, -36, 12, -26], C.gold, INK, 2.6, { gap: 3 });
      p.dot(0, -30, 2, C.red);
    } else {
      const n = L - 1;
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 11; p.shp(star(x, -25, 5.2, 0.5), i % 2 ? C.orange : C.yellow, INK, 1.6, { gap: 3, j: 0.4 }); }
    }
    // level badge
    p.dot(22, 31, 8.4, '#fff6ea'); p.ln(arc(22, 31, 8.4, 8.4, 0, 360, 10), INK, 2, true, 0.5);
    p.txt(String(L), 22, 36, 11, INK, { align: 'c', w: 1.9 });
    void c;
  }, { seed: 11 });
}
function bodySprite(type, tier) {
  const d = TURRETS[type];
  return sprite('dt_body|' + type + '|' + tier, 84, 92, (p) => {
    p.ctx.scale(1.24, 1.24);
    BODY[type](p, d, tier);
    const f = FACE[type]; face(p, f[0], f[1], f[2] * 1.18);
    if (tier >= 1) { sparkle(p, -26, -26, 3.6, C.yellow); sparkle(p, 27, -20, 3, C.pink); }
    if (tier >= 2) { sparkle(p, 25, 26, 3.4, C.cyan); p.ln(star(-27, 22, 3.4, 0.5), C.orange, 1.8, true, 0.3); }
  }, { seed: 23 });
}
function pointerSprite(type) {
  return sprite('dt_ptr|' + type, 84, 48, (p) => { p.ctx.translate(-26, 0); POINT[type](p); }, { seed: 31 });
}

const bodyY = 4;      // body centre offset inside the 72 px tile (the pad sits slightly low so stars fit above)
const pivot = [0, -2];

function bracket(ctx, t) {
  const b = 31 + Math.sin(t * 8) * 1.8;
  ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(sx * b, sy * (b - 8) + 6); ctx.lineTo(sx * b, sy * b + 6); ctx.lineTo(sx * (b - 8), sy * b + 6); ctx.stroke(); }
  ctx.strokeStyle = C.yellow; ctx.lineWidth = 1.6;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(sx * b, sy * (b - 8) + 6); ctx.lineTo(sx * b, sy * b + 6); ctx.lineTo(sx * (b - 8), sy * b + 6); ctx.stroke(); }
  ctx.restore();
}
function burst(ctx, d, fire, t) {   // doodled muzzle burst: a spiky star with ink outline and speed dashes
  const k = clamp((fire - 0.1) / 0.9, 0, 1), r = 7 + k * 10;
  ctx.save(); ctx.beginPath();
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, q = i % 2 ? r * 0.5 : r; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
  ctx.closePath(); ctx.fillStyle = d.accent; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = d.color; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r + 4), Math.sin(a) * (r + 4)); ctx.lineTo(Math.cos(a) * (r + 10 + k * 4), Math.sin(a) * (r + 10 + k * 4)); ctx.stroke(); }
  ctx.restore(); void t;
}

export function drawTurret(ctx, type, level, x, y, o) {
  const def = TURRETS[type];
  if (!def || !BODY[type]) return;
  o = o || {};
  const L = clamp(Math.round(level || 1), 1, 7), t = o.t || 0, fire = clamp(o.fire || 0, 0, 1), ang = o.ang || 0, jam = !!o.jammed;
  const tier = L >= 5 ? 2 : L >= 3 ? 1 : 0;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  let sc = o.scale == null ? 1 : o.scale;
  if (o.spawn != null && o.spawn < 1) sc *= Math.max(0.01, easeOutBack(clamp(o.spawn, 0, 1)));
  ctx.translate(x, y); if (sc !== 1) ctx.scale(sc, sc);
  if (jam) ctx.translate(Math.sin(t * 50) * 1.1, 0);
  const ph = (type.length * 0.37 + L * 0.11);
  // pad, then the squashed body, then the pointer
  blit(ctx, padSprite(type, L), 0, -2, t, { phase: ph });
  ctx.save();
  const sq = fire * 0.1;
  ctx.translate(0, 26); ctx.scale(1 + sq * 0.6, 1 - sq); ctx.translate(0, -26);
  const bob = jam ? 0 : Math.sin(t * 3 + ph * 6) * 1.1;
  blit(ctx, bodySprite(type, tier), 0, bodyY + bob, t, { phase: ph });
  if (POINTER[type]) {
    ctx.save(); ctx.translate(pivot[0], pivot[1] + bob); ctx.rotate(ang); ctx.translate(-fire * 5 + 34, 0);
    blit(ctx, pointerSprite(type), 0, 0, t, { phase: ph + 0.3 });
    ctx.restore();
  }
  // jammed: scribbled X eyes over the face, a zigzag, a grey wash
  const f = FACE[type];
  if (jam) {
    ctx.save(); ctx.translate(f[0] * 1.24, bodyY + f[1] * 1.24 + bob); ctx.lineCap = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = INK;
    const ex = 5.4 * f[2] * 1.18 * 1.24;
    for (const sx of [-1, 1]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx * ex, -1.5 * 1.4, 5.2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(sx * ex - 2.8, -4.2); ctx.lineTo(sx * ex + 2.8, 1.2); ctx.moveTo(sx * ex + 2.8, -4.2); ctx.lineTo(sx * ex - 2.8, 1.2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-5, 6); ctx.lineTo(-2.5, 3.4); ctx.lineTo(0, 6); ctx.lineTo(2.5, 3.4); ctx.lineTo(5, 6); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const zx = Math.sin(t * 22) * 2;
    ctx.beginPath(); ctx.moveTo(20 + zx, -34); ctx.lineTo(14 + zx, -26); ctx.lineTo(22 + zx, -26); ctx.lineTo(15 + zx, -16); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  if (fire > 0.12) { ctx.save(); ctx.translate(pivot[0], pivot[1]); ctx.rotate(POINTER[type] ? ang : -Math.PI / 2); ctx.translate(POINTER[type] ? 60 : 26, 0); burst(ctx, def, fire, t); ctx.restore(); }
  if (o.buff) {   // buffed: three little crayon sparkles orbiting the pad
    const col = o.buff === 'dmg' ? C.red : C.green;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = t * 1.8 + i * 2.094, px = Math.cos(a) * 30, py = 4 + Math.sin(a) * 28, r = 3.6 + Math.sin(t * 6 + i) * 1; ctx.beginPath(); ctx.moveTo(px - r, py); ctx.lineTo(px + r, py); ctx.moveTo(px, py - r); ctx.lineTo(px, py + r); ctx.stroke(); }
    ctx.restore();
  }
  if (o.selected) bracket(ctx, t);
  ctx.restore();
}

// a flat list icon: a little paper tile with the instrument on it (no pointer, level one look)
export function drawTurretIconFlat(ctx, type, x, y, size) {
  const def = TURRETS[type];
  if (!def || !BODY[type]) return;
  const s = size / 56;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(-24, -20); ctx.lineTo(24, -20); ctx.quadraticCurveTo(28, -20, 28, -16); ctx.lineTo(28, 20); ctx.quadraticCurveTo(28, 24, 24, 24); ctx.lineTo(-24, 24); ctx.quadraticCurveTo(-28, 24, -28, 20); ctx.lineTo(-28, -16); ctx.quadraticCurveTo(-28, -20, -24, -20); ctx.closePath();
  ctx.fillStyle = tint(def.color, 0.75); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.scale(0.7, 0.7); blit(ctx, bodySprite(type, 0), 0, 2, 0);
  ctx.restore();
}

// ---- projectiles: doodled shells, notes, stars and dashes with scribbled trails. Drawn centred at (x, y); ang is the heading.
function projSprite(kind) {
  return sprite('dt_pr|' + kind, 64, 40, (p) => {
    switch (kind) {
      case 'kick': {   // a round orange bomb with a fuse spark and a scribble trail
        p.ln([-26, -4, -14, -2, -8, 0], C.orange, 3.4, false, 1); p.ln([-26, 5, -14, 3, -8, 1], C.yellow, 2.6, false, 1);
        p.shp(p.blob(2, 0, 9, 9, 12, 0.05), C.orange, INK, 2.6, { gap: 3.6 }); p.ln([8, -7, 13, -12], INK, 2.2, false, 0.4); sparkle(p, 14, -13, 3.6, C.yellow); break;
      }
      case 'snare': {  // a yellow star on a dash trail
        p.ln([-28, 0, -10, 0], C.yellow, 3, false, 0.8); p.ln([-22, -5, -12, -4], C.orange, 2, false, 0.6); p.shp(star(4, 0, 8, 0.5), C.yellow, INK, 2.2, { gap: 3, j: 0.4 }); break;
      }
      case 'hat': {    // a tiny teal dash
        p.ln([-14, 0, 4, 0], '#2fc4b2', 3.2, false, 0.5); p.dot(7, 0, 3, C.paper); p.ln(arc(7, 0, 3, 3, 0, 360, 6), INK, 1.4, true, 0.3); break;
      }
      case 'cowbell': {  // a gold dart with a long scribbled trail
        p.ln([-30, 0, -10, 0], C.gold, 3, false, 0.8); p.ln([-26, -4, -14, -4], C.orange, 2, false, 0.6);
        p.shp([-8, -5, 12, 0, -8, 5], C.gold, INK, 2.4, { gap: 3 }); break;
      }
      case 'orb': case 'vocal': {  // a pink glow ball with a smile and little sparkles
        p.shp(p.blob(0, 0, 9, 9, 12, 0.05), '#ffd0ee', INK, 2.4, { gap: 3.4 });
        p.dot(-3, -1, 1.2, INK); p.dot(3, -1, 1.2, INK); p.ln(arc(0, 2, 3, 2.4, 20, 160, 5), INK, 1.4, false, 0.3);
        sparkle(p, -15, -9, 3, C.pink); sparkle(p, 15, 8, 3, C.yellow); break;
      }
      case 'synth': {  // a felt-tip zigzag
        p.ln([-20, 0, -13, -6, -6, 6, 1, -6, 8, 6, 15, 0], INK, 6, false, 0.5); p.ln([-20, 0, -13, -6, -6, 6, 1, -6, 8, 6, 15, 0], C.cyan, 3, false, 0.5); break;
      }
      default: p.dot(0, 0, 4, C.paper); p.ln(arc(0, 0, 4, 4, 0, 360, 8), INK, 1.8, true, 0.3);
    }
  }, { seed: 41 });
}
function discSprite() {
  return sprite('dt_pr|disc', 40, 40, (p) => {
    p.shp(p.blob(0, 0, 15, 15, 14, 0.04), '#3a3450', INK, 2.6, { gap: 4, f2: '#6d6590' });
    p.ln(arc(0, 0, 10, 10, 20, 330, 10), '#8d86b0', 1.4, false, 0.3);
    p.shp(p.blob(0, 0, 5, 5, 8, 0.05), '#f6f2ff', INK, 1.8, { gap: 3 });
  }, { seed: 53 });
}
export function drawProjectile(ctx, kind, x, y, o) {
  o = o || {};
  const t = o.t || 0, ang = o.ang || 0, s = o.scale == null ? 1 : o.scale;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * 1.5, s * 1.5);
  if (kind === 'scratch') { ctx.rotate(t * 16); blit(ctx, discSprite(), 0, 0, t); }
  else if (kind === 'orb' || kind === 'vocal') { ctx.translate(0, Math.sin(t * 8) * 1.2); blit(ctx, projSprite(kind), 0, 0, t); }
  else { ctx.rotate(ang); blit(ctx, projSprite(kind), 4, 0, t); }
  ctx.restore();
}
