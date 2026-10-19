// Midnight Mog icons: currencies, relics, buildings, crates, status and role icons. All procedural canvas 2D.
// Pure render module: never mutates sim state, never calls Math.random (a local hash varies things).
//
// API (x,y is ALWAYS the centre of a size x size box for every icon function here):
//   drawCurrency(ctx, 'fish'|'yarn'|'gems'|'tokens', x, y, size, t)
//   drawRelic(ctx, relicId, x, y, size, t)              rarity medallion + distinct emblem, rarity glow
//   drawBuilding(ctx, buildingId, level, x, y, size, t) level 0 = blueprint, growth by level, tier trims every 20 levels
//   drawCrate(ctx, crateId, x, y, size, o{open:0..1, t, glow, shake})
//   drawStatusIcon(ctx, status, x, y, size)            drawRoleIcon(ctx, role, x, y, size)
// Extras: RELIC_IDS, BUILDING_IDS, CRATE_IDS, STATUS_IDS, ROLE_IDS, CURRENCY_IDS, clearIconCache(), setResolution(dpr),
//   and the small gfx toolkit (G) that render/world.js shares: hsh, strHash, mk, makeCanvas, bake, blit, bloom, shape.
//
// How it is built: every static body is painted in a 100x100 design space, baked once per (id, pixel bucket) into an
// offscreen canvas, and only the live bits (glow pulse, sparkle, smoke, clock hands, lid, light spill) are drawn per frame.
// Without any canvas (node tests) the painters run directly on the given context.
import { PAL, RARITY, ROLE_COLOR, rgba, mix, shade, glow as palGlow, prism, rarityColor } from '../palette.js';
import { RELICS, RELIC_BY_ID } from '../data/relics.js';
import { BUILDINGS } from '../data/buildings.js';
import { CRATES } from '../data/crates.js';

export const TAU = Math.PI * 2;
const PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, sqrt = Math.sqrt;
const INK = PAL.ink, BONE = PAL.bone;
export const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const frac = (v) => v - floor(v);
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const outCubic = (t) => 1 - Math.pow(1 - cl(t, 0, 1), 3);

export function hsh(a, b = 0) {
  let n = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35);
  n ^= n >>> 15; n = Math.imul(n, 0x2c1b3c6d); n ^= n >>> 12; n = Math.imul(n, 0x297a2d39); n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}
export function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Seeded generator for bake-time variation (mulberry32). */
export function mk(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------------------------------------ canvas helpers
let DPR_FIXED = 0;
export function dpr() {
  if (DPR_FIXED) return DPR_FIXED;
  const d = typeof globalThis !== 'undefined' && globalThis.devicePixelRatio ? globalThis.devicePixelRatio : 1;
  return cl(fin(d, 1), 1, 2);
}
export function makeCanvas(w, h) {
  w = max(1, Math.ceil(w)); h = max(1, Math.ceil(h));
  try { if (typeof OffscreenCanvas !== 'undefined') { const c = new OffscreenCanvas(w, h); if (c.getContext) return c; } } catch (e) { /* fall through */ }
  try { if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } } catch (e) { /* none */ }
  return null;
}
/** Bake paint(c) into a w x h (logical px) bitmap at device resolution. Returns {cv,w,h,paint}; cv is null without canvas. */
export function bake(w, h, paint) {
  const d = dpr();
  const cv = makeCanvas(w * d, h * d);
  let ok = false;
  if (cv) {
    try { const c = cv.getContext('2d'); c.scale(d, d); paint(c); ok = true; } catch (e) { ok = false; }
  }
  return { cv: ok ? cv : null, w, h, paint };
}
export function blit(ctx, B, x, y, w, h) {
  w = w === undefined ? B.w : w; h = h === undefined ? B.h : h;
  if (B.cv) { ctx.drawImage(B.cv, x, y, w, h); return; }
  ctx.save(); ctx.translate(x, y); if (w !== B.w || h !== B.h) ctx.scale(w / B.w, h / B.h); B.paint(ctx); ctx.restore();
}

const glowCache = new Map();
function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const cv = makeCanvas(64, 64);
  if (cv) {
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.35, rgba(color, 0.45)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  glowCache.set(color, cv);
  return cv;
}
/** Additive bloom from a cached sprite (falls back to palette glow()). */
export function bloom(ctx, x, y, r, color, a = 0.6) {
  if (!(r > 0) || !(a > 0)) return;
  const s = glowSprite(color);
  if (!s) { palGlow(ctx, x, y, r, color, a); return; }
  const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pa * cl(a, 0, 1);
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
}

// icon sprite cache: key -> {cv, paint, px}
const ICONS = new Map();
function pxFor(size) { return max(16, Math.round(fin(size, 32) * dpr() / 4) * 4); }
/** Draw design-space (0..100) painter centred at x,y with the given size, baked per pixel bucket. */
function sprite(ctx, key, paint, x, y, size) {
  size = fin(size, 32); if (size <= 0) return;
  const px = pxFor(size);
  const k = key + '@' + px;
  let s = ICONS.get(k);
  if (!s) {
    if (ICONS.size > 900) ICONS.clear();
    const cv = makeCanvas(px, px);
    let ok = false;
    if (cv) { try { const c = cv.getContext('2d'); c.scale(px / 100, px / 100); paint(c); ok = true; } catch (e) { ok = false; } }
    s = { cv: ok ? cv : null, paint };
    ICONS.set(k, s);
  }
  if (s.cv) { ctx.drawImage(s.cv, x - size / 2, y - size / 2, size, size); return; }
  ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 100, size / 100); s.paint(ctx); ctx.restore();
}
export function clearIconCache() { ICONS.clear(); glowCache.clear(); }
export function setResolution(d) { DPR_FIXED = d > 0 ? cl(d, 1, 3) : 0; clearIconCache(); }

// ------------------------------------------------------------------------------------------------ shape toolkit (design units)
export const bRect = (x, y, w, h) => (c) => { c.rect(x, y, w, h); };
export const bEll = (cx, cy, rx, ry, rot = 0) => (c) => { c.moveTo(cx + rx, cy); c.ellipse(cx, cy, max(0.01, rx), max(0.01, ry), rot, 0, TAU); };
export const bPoly = (pts) => (c) => { c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); };
export const bChamf = (x, y, w, h, k) => (c) => { c.moveTo(x + k, y); c.lineTo(x + w - k, y); c.lineTo(x + w, y + k); c.lineTo(x + w, y + h - k); c.lineTo(x + w - k, y + h); c.lineTo(x + k, y + h); c.lineTo(x, y + h - k); c.lineTo(x, y + k); c.closePath(); };
export const bRound = (x, y, w, h, r) => (c) => { r = min(r, w / 2, h / 2); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath(); };
export const bRing = (cx, cy, rx, ry, ix, iy) => (c) => { c.moveTo(cx + rx, cy); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.moveTo(cx + ix, cy); c.ellipse(cx, cy, ix, iy, 0, 0, TAU, true); };
export const bArch = (x, y, w, h) => (c) => { const r = w / 2; c.moveTo(x, y + h); c.lineTo(x, y + r); c.arc(x + r, y + r, r, PI, 0); c.lineTo(x + w, y + h); c.closePath(); };
/** Several builders as one path. */
export const bAll = (...bs) => (c) => { for (const b of bs) b(c); };

/**
 * One outline rule + one lighting rule: 2px ink outline stroked first, 3 tone gradient fill, cyan rim from the upper left,
 * magenta bounce from below, optional halftone shadow lower right. build(c) adds subpaths only (no beginPath).
 * o: {lw, bb:[x0,y0,x1,y1], flat, ht, hot:[x,y], rim:color, noRim, bounce:color}
 */
export function shape(c, build, base, o) {
  o = o || {};
  const lw = o.lw === undefined ? 4.5 : o.lw;
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (lw > 0) { c.beginPath(); build(c); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); }
  const bb = o.bb || [0, 0, 100, 100];
  if (o.flat) { c.beginPath(); build(c); c.fillStyle = base; c.fill(); }
  else {
    const g = c.createLinearGradient(bb[0], bb[1], bb[2], bb[3]);
    g.addColorStop(0, shade(base, 0.25)); g.addColorStop(0.45, base); g.addColorStop(1, shade(base, -0.35));
    c.beginPath(); build(c); c.fillStyle = g; c.fill();
  }
  if (!o.flat) {
    c.save(); c.beginPath(); build(c); c.clip();
    if (o.ht) {
      c.fillStyle = shade(base, -0.5);
      const x0 = bb[0], y0 = bb[1], x1 = bb[2], y1 = bb[3], sp = o.htSp || 5;
      c.beginPath();
      for (let yy = y0, row = 0; yy < y1; yy += sp * 0.7, row++) for (let xx = x0 + (row & 1) * sp / 2; xx < x1; xx += sp) {
        const f = ((xx - x0) / (x1 - x0 || 1) + (yy - y0) / (y1 - y0 || 1)) / 2;
        const r = (f - 0.45) * 2.2; if (r > 0.08) { c.moveTo(xx + r, yy); c.arc(xx, yy, min(r, 1.2), 0, TAU); }
      }
      c.fill();
    }
    if (!o.noRim) {
      c.beginPath(); c.rect(-60, -60, 260, 260); c.save(); c.translate(2.1, 2.1); build(c); c.restore();
      c.fillStyle = rgba(o.rim || PAL.cyan, 0.85); c.fill('evenodd');
    }
    c.beginPath(); c.rect(-60, -60, 260, 260); c.save(); c.translate(0, -2.1); build(c); c.restore();
    c.fillStyle = rgba(o.bounce || PAL.magenta, 0.5); c.fill('evenodd');
    c.restore();
  }
  if (o.hot) { c.fillStyle = BONE; c.beginPath(); c.arc(o.hot[0], o.hot[1], 1.3, 0, TAU); c.fill(); }
  c.restore();
}
const line = (c, pts, col, w) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); };
/** Ink-underlaid line (readable on any fill). */
const inkLine = (c, pts, col, w) => { line(c, pts, INK, w + 3); line(c, pts, col, w); };
const dot = (c, x, y, r, col) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = col; c.fill(); };
const fillB = (c, build, col) => { c.beginPath(); build(c); c.fillStyle = col; c.fill(); };
const strokeB = (c, build, col, w) => { c.beginPath(); build(c); c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); };
/** soft glow inside a baked sprite */
const soft = (c, x, y, r, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
const lin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g; };
/** 4-point sparkle star (live) */
function sparkle(ctx, x, y, r, col, a) {
  if (!(r > 0.3) || a <= 0) return;
  const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pa * cl(a, 0, 1);
  ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.fill();
  ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
}
export { sparkle };

// colour aliases
const CY = PAL.cyan, MG = PAL.magenta, LM = PAL.lime, VI = PAL.violet, VH = PAL.violetHi, BD = PAL.boneDim, SL = PAL.slate;
const I2 = PAL.ink2, I3 = PAL.ink3, GD = PAL.gold, GDD = PAL.goldDeep, GH = PAL.goldHot;
const ORG = ROLE_COLOR.brawler, STEEL = ROLE_COLOR.tank, ULT = ROLE_COLOR.mage;

// ------------------------------------------------------------------------------------------------ currencies
export const CURRENCY_IDS = ['fish', 'yarn', 'gems', 'tokens'];
const CUR_GLOW = { fish: CY, yarn: MG, gems: CY, tokens: LM };

function paintFish(c) {
  // faceted fish jewel: body bean, forked tail, fins, gill arc, eye
  const body = (cc) => { cc.moveTo(10, 52); cc.bezierCurveTo(18, 30, 46, 26, 66, 44); cc.lineTo(66, 58); cc.bezierCurveTo(46, 76, 18, 72, 10, 52); cc.closePath(); };
  shape(c, bPoly([62, 50, 90, 28, 82, 50, 90, 72]), MG, { bb: [60, 28, 92, 72], lw: 4 });
  shape(c, bPoly([34, 32, 50, 14, 58, 36]), CY, { bb: [34, 14, 58, 36], lw: 4 });
  shape(c, bPoly([36, 70, 48, 86, 56, 66]), CY, { bb: [36, 66, 56, 86], lw: 4 });
  shape(c, body, CY, { bb: [10, 26, 66, 76], ht: true, hot: [26, 38] });
  c.save(); c.beginPath(); body(c); c.clip();
  c.fillStyle = rgba(BONE, 0.55); c.beginPath(); c.moveTo(10, 52); c.bezierCurveTo(20, 34, 40, 30, 60, 42); c.lineTo(40, 50); c.closePath(); c.fill();
  c.fillStyle = rgba(PAL.cyanDeep, 0.5); c.beginPath(); c.moveTo(20, 66); c.lineTo(44, 54); c.lineTo(66, 58); c.lineTo(60, 66); c.closePath(); c.fill();
  strokeB(c, bPoly([40, 50, 66, 44]), rgba(BONE, 0.5), 1);
  c.restore();
  c.strokeStyle = rgba(PAL.cyanDeep, 0.9); c.lineWidth = 1.6; c.beginPath(); c.arc(40, 52, 14, -1.0, 1.0); c.stroke();
  dot(c, 24, 48, 4.6, INK); dot(c, 24, 48, 3.6, BONE); dot(c, 23.6, 48.2, 1.9, INK); dot(c, 22.6, 46.8, 0.9, BONE);
  c.strokeStyle = rgba(BONE, 0.7); c.lineWidth = 1.2; c.beginPath(); c.moveTo(70, 50); c.lineTo(86, 36); c.moveTo(70, 50); c.lineTo(86, 64); c.stroke();
}
function paintYarn(c) {
  const ball = bEll(48, 52, 33, 32);
  // trailing thread
  c.save(); c.lineCap = 'round';
  c.beginPath(); c.moveTo(66, 78); c.bezierCurveTo(80, 94, 96, 80, 86, 92); c.strokeStyle = INK; c.lineWidth = 7; c.stroke();
  c.beginPath(); c.moveTo(66, 78); c.bezierCurveTo(80, 94, 96, 80, 86, 92); c.strokeStyle = CY; c.lineWidth = 3.4; c.stroke(); c.restore();
  shape(c, ball, MG, { bb: [15, 20, 81, 84], ht: true, hot: [32, 32] });
  c.save(); c.beginPath(); ball(c); c.clip();
  for (let i = 0; i < 7; i++) { // wrapped strands, two directions
    const o = -22 + i * 11;
    c.beginPath(); c.moveTo(14, 44 + o); c.bezierCurveTo(38, 30 + o, 58, 66 + o, 84, 50 + o); c.strokeStyle = rgba(shade(MG, -0.45), 0.9); c.lineWidth = 2.1; c.stroke();
    c.beginPath(); c.moveTo(14, 41 + o); c.bezierCurveTo(38, 27 + o, 58, 63 + o, 84, 47 + o); c.strokeStyle = rgba(shade(MG, 0.35), 0.8); c.lineWidth = 1.2; c.stroke();
  }
  for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(28 + i * 11, 20); c.bezierCurveTo(60 + i * 5, 40, 20 + i * 14, 62, 36 + i * 12, 86); c.strokeStyle = rgba(shade(MG, -0.5), 0.55); c.lineWidth = 1.6; c.stroke(); }
  c.restore();
  c.fillStyle = rgba(BONE, 0.65); c.beginPath(); c.ellipse(34, 34, 9, 4.5, -0.7, 0, TAU); c.fill();
}
function paintGem(c) {
  const out = [50, 90, 8, 40, 24, 12, 76, 12, 92, 40];
  shape(c, bPoly(out), CY, { bb: [8, 12, 92, 90], lw: 4.5, flat: true });
  const F = (pts, col) => { fillB(c, bPoly(pts), col); };
  const lt = shade(CY, 0.55), md = CY, dk = PAL.cyanDeep, vd = shade(PAL.cyanDeep, -0.35);
  c.save(); c.beginPath(); bPoly(out)(c); c.clip();
  F([24, 12, 76, 12, 62, 32, 38, 32], rgba(BONE, 0.92));           // table
  F([24, 12, 38, 32, 8, 40], lt); F([76, 12, 92, 40, 62, 32], md);   // crown sides
  F([38, 32, 62, 32, 50, 40], shade(CY, 0.25));
  F([8, 40, 38, 32, 50, 40, 30, 52], md); F([92, 40, 62, 32, 50, 40, 70, 52], dk); // girdle
  F([8, 40, 30, 52, 50, 90], dk); F([92, 40, 70, 52, 50, 90], vd);   // pavilion
  F([30, 52, 50, 40, 70, 52, 50, 90], md);
  F([30, 52, 50, 40, 50, 90], lt);
  c.strokeStyle = rgba(INK, 0.45); c.lineWidth = 1; c.beginPath();
  c.moveTo(38, 32); c.lineTo(8, 40); c.moveTo(62, 32); c.lineTo(92, 40); c.moveTo(38, 32); c.lineTo(50, 40); c.lineTo(62, 32); c.moveTo(30, 52); c.lineTo(50, 40); c.lineTo(70, 52); c.moveTo(50, 40); c.lineTo(50, 90); c.stroke();
  c.restore();
  strokeB(c, bPoly([24, 12, 8, 40, 50, 90]), rgba(CY, 0.0), 1);
  c.strokeStyle = rgba(BONE, 0.95); c.lineWidth = 2; c.beginPath(); c.moveTo(10, 40); c.lineTo(25, 14); c.lineTo(50, 13); c.stroke();
  dot(c, 30, 22, 1.7, BONE);
}
function paintToken(c) {
  const hex = (r, cx, cy) => { const p = []; for (let i = 0; i < 6; i++) { const a = PI / 6 + i * PI / 3; p.push(cx + cos(a) * r, cy + sin(a) * r); } return bPoly(p); };
  shape(c, hex(44, 50, 50), LM, { bb: [6, 6, 94, 94], ht: true, hot: [26, 22] });
  shape(c, hex(34, 50, 50), PAL.limeDeep, { bb: [16, 16, 84, 84], lw: 2.5, flat: false, noRim: true });
  c.save(); c.beginPath(); hex(34, 50, 50)(c); c.clip();
  c.fillStyle = rgba(INK, 0.25); c.fillRect(0, 50, 100, 50); c.restore();
  // paw emboss
  const paw = INK;
  fillB(c, bEll(50, 60, 13, 10), paw);
  for (const [px, py, r] of [[33, 47, 5.2], [43.5, 37, 5.6], [56.5, 37, 5.6], [67, 47, 5.2]]) fillB(c, bEll(px, py, r * 0.8, r), paw);
  fillB(c, bEll(46, 57, 5, 2.4, -0.5), rgba(LM, 0.55));
  strokeB(c, bPoly([50, 8, 86, 29, 86, 71, 50, 92, 14, 71, 14, 29]), rgba(BONE, 0.25), 1);
  for (let i = 0; i < 6; i++) { const a = PI / 6 + i * PI / 3; dot(c, 50 + cos(a) * 40, 50 + sin(a) * 40, 1.7, BONE); }
}
const CUR_PAINT = { fish: paintFish, yarn: paintYarn, gems: paintGem, tokens: paintToken };

export function drawCurrency(ctx, id, x, y, size, t) {
  const p = CUR_PAINT[id]; if (!p) return;
  x = fin(x); y = fin(y); size = fin(size, 24); t = fin(t);
  if (size <= 0) return;
  const gc = CUR_GLOW[id];
  bloom(ctx, x, y, size * (0.78 + 0.06 * sin(t * 2.4 + strHash(id))), gc, 0.26 + 0.1 * sin(t * 2.4));
  sprite(ctx, 'cur_' + id, p, x, y, size);
  if (size >= 14) {
    const ph = frac(t * 0.55 + hsh(strHash(id)) * 3);
    const s = sin(ph * PI);
    const ax = x + (hsh(floor(t * 0.55 + hsh(strHash(id)) * 3), 3) - 0.5) * size * 0.55, ay = y + (hsh(floor(t * 0.55 + hsh(strHash(id)) * 3), 4) - 0.6) * size * 0.5;
    sparkle(ctx, ax, ay, size * 0.2 * s, BONE, s);
  }
}

// ------------------------------------------------------------------------------------------------ status icons
export const STATUS_IDS = ['stun', 'dot', 'burn', 'poison', 'bleed', 'freeze', 'buff', 'debuff', 'slow', 'haste', 'shield', 'reflect', 'taunt', 'regen', 'vuln', 'armor', 'crit', 'sleep', 'cleanse', 'barrier'];
const STATUS_ALIAS = { fire: 'burn', toxin: 'poison', frost: 'freeze', chill: 'freeze', weaken: 'debuff', curse: 'debuff', heal: 'regen', bleeding: 'bleed', sleepy: 'sleep', fast: 'haste', slowed: 'slow', stunned: 'stun', defense: 'armor', guard: 'shield', mark: 'vuln', burning: 'burn', poisoned: 'poison' };
function chip(c, col, glyph) {
  shape(c, bRing(50, 50, 46, 46, 36, 36), col, { lw: 4, flat: false, bb: [4, 4, 96, 96], noRim: false });
  fillB(c, bEll(50, 50, 36, 36), rgba(I2, 1));
  c.save(); c.beginPath(); bEll(50, 50, 36, 36)(c); c.clip();
  soft(c, 50, 58, 40, col, 0.28); c.restore();
  glyph(c, col);
}
const star5 = (cx, cy, R, r) => { const p = []; for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr = i & 1 ? r : R; p.push(cx + cos(a) * rr, cy + sin(a) * rr); } return bPoly(p); };
const STATUS_PAINT = {
  stun(c) { chip(c, CY, () => { shape(c, bEll(50, 60, 17, 9), BD, { lw: 3 }); for (let i = 0; i < 3; i++) { const a = i * TAU / 3 - 1.2; shape(c, star5(50 + cos(a) * 20, 38 + sin(a) * 8, 9, 4), BONE, { lw: 2.5, flat: true }); } }); },
  burn(c) { chip(c, ORG, () => { const f = (cc) => { cc.moveTo(50, 14); cc.bezierCurveTo(52, 30, 74, 38, 70, 62); cc.bezierCurveTo(68, 80, 32, 82, 30, 62); cc.bezierCurveTo(30, 52, 38, 48, 40, 38); cc.bezierCurveTo(46, 44, 46, 28, 50, 14); cc.closePath(); }; shape(c, f, ORG, { lw: 3, bb: [30, 14, 70, 80] }); fillB(c, bEll(50, 66, 11, 13), BONE); fillB(c, bEll(50, 70, 7, 8), MG); }); },
  poison(c) { chip(c, LM, () => { shape(c, (cc) => { cc.moveTo(50, 16); cc.bezierCurveTo(60, 38, 74, 48, 70, 64); cc.bezierCurveTo(66, 82, 34, 82, 30, 64); cc.bezierCurveTo(26, 48, 40, 38, 50, 16); cc.closePath(); }, LM, { lw: 3, bb: [30, 16, 70, 80] }); fillB(c, bEll(50, 62, 9, 8), INK); dot(c, 46, 60, 1.8, LM); dot(c, 54, 60, 1.8, LM); fillB(c, bRect(47, 67, 6, 3), INK); }); },
  bleed(c) { chip(c, MG, () => { shape(c, (cc) => { cc.moveTo(50, 14); cc.bezierCurveTo(62, 36, 76, 48, 72, 64); cc.bezierCurveTo(68, 82, 32, 82, 28, 64); cc.bezierCurveTo(24, 48, 38, 36, 50, 14); cc.closePath(); }, MG, { lw: 3, bb: [28, 14, 72, 80] }); fillB(c, bEll(40, 58, 4, 7, 0.3), rgba(BONE, 0.7)); }); },
  freeze(c) { chip(c, CY, () => { c.save(); c.translate(50, 50); for (let i = 0; i < 3; i++) { c.rotate(PI / 3); inkLine(c, [-26, 0, 26, 0], BONE, 4); inkLine(c, [18, -7, 24, 0, 18, 7], CY, 3); inkLine(c, [-18, -7, -24, 0, -18, 7], CY, 3); } c.restore(); dot(c, 50, 50, 5, CY); }); },
  dot(c) { STATUS_PAINT.burn(c); },
  buff(c) { chip(c, LM, () => { shape(c, bPoly([50, 16, 78, 48, 62, 48, 62, 80, 38, 80, 38, 48, 22, 48]), LM, { lw: 3, bb: [22, 16, 78, 80] }); }); },
  debuff(c) { chip(c, MG, () => { shape(c, bPoly([50, 84, 78, 52, 62, 52, 62, 20, 38, 20, 38, 52, 22, 52]), MG, { lw: 3, bb: [22, 20, 78, 84] }); }); },
  slow(c) { chip(c, CY, () => { for (let i = 0; i < 2; i++) { const o = i * 17; shape(c, bPoly([22, 26 + o, 50, 46 + o, 78, 26 + o, 78, 38 + o, 50, 58 + o, 22, 38 + o]), i ? shade(CY, -0.15) : CY, { lw: 2.5, bb: [22, 26, 78, 70] }); } }); },
  haste(c) { chip(c, LM, () => { for (let i = 0; i < 2; i++) { const o = i * 20 - 6; shape(c, bPoly([20 + o, 24, 46 + o, 50, 20 + o, 76, 32 + o, 76, 58 + o, 50, 32 + o, 24]), i ? LM : shade(LM, -0.2), { lw: 2.5, bb: [20, 24, 78, 76] }); } }); },
  shield(c) { chip(c, CY, () => { const s = (cc) => { cc.moveTo(50, 16); cc.lineTo(78, 26); cc.lineTo(76, 54); cc.bezierCurveTo(74, 70, 62, 78, 50, 84); cc.bezierCurveTo(38, 78, 26, 70, 24, 54); cc.lineTo(22, 26); cc.closePath(); }; shape(c, s, CY, { lw: 3, bb: [22, 16, 78, 84] }); inkLine(c, [50, 28, 50, 72], BONE, 3); inkLine(c, [34, 42, 66, 42], BONE, 3); }); },
  barrier(c) { STATUS_PAINT.shield(c); },
  reflect(c) { chip(c, CY, () => { inkLine(c, [24, 56, 24, 38, 66, 38], BONE, 5); shape(c, bPoly([64, 26, 82, 38, 64, 50]), CY, { lw: 2.5, flat: true }); inkLine(c, [76, 44, 76, 62, 34, 62], CY, 5); shape(c, bPoly([36, 50, 18, 62, 36, 74]), BONE, { lw: 2.5, flat: true }); }); },
  taunt(c) { chip(c, MG, () => { shape(c, bPoly([42, 18, 58, 18, 55, 56, 45, 56]), MG, { lw: 3, bb: [42, 18, 58, 56] }); shape(c, bEll(50, 72, 7, 7), MG, { lw: 3, bb: [43, 65, 57, 79] }); }); },
  regen(c) { chip(c, LM, () => { shape(c, bPoly([42, 18, 58, 18, 58, 42, 82, 42, 82, 58, 58, 58, 58, 82, 42, 82, 42, 58, 18, 58, 18, 42, 42, 42]), LM, { lw: 3, bb: [18, 18, 82, 82] }); }); },
  vuln(c) { chip(c, MG, () => { STATUS_PAINT._shieldPath(c, MG); inkLine(c, [52, 22, 44, 44, 58, 50, 46, 80], INK, 4); inkLine(c, [52, 22, 44, 44, 58, 50, 46, 80], BONE, 2); }); },
  _shieldPath(c, col) { shape(c, (cc) => { cc.moveTo(50, 16); cc.lineTo(78, 26); cc.lineTo(76, 54); cc.bezierCurveTo(74, 70, 62, 78, 50, 84); cc.bezierCurveTo(38, 78, 26, 70, 24, 54); cc.lineTo(22, 26); cc.closePath(); }, col, { lw: 3, bb: [22, 16, 78, 84] }); },
  armor(c) { chip(c, STEEL, () => { STATUS_PAINT._shieldPath(c, STEEL); fillB(c, bRect(40, 36, 20, 28), rgba(BONE, 0.85)); fillB(c, bRect(36, 44, 28, 12), rgba(BONE, 0.85)); }); },
  crit(c) { chip(c, CY, () => { shape(c, star5(50, 52, 34, 14), CY, { lw: 3, bb: [16, 18, 84, 86] }); dot(c, 50, 52, 6, BONE); }); },
  sleep(c) { chip(c, ULT, () => { for (const [px, py, s] of [[28, 60, 1], [44, 44, 1.3], [60, 26, 1.6]]) { c.save(); c.translate(px, py); c.scale(s, s); inkLine(c, [0, 0, 14, 0, 0, 14, 14, 14], BONE, 3.4); c.restore(); } }); },
  cleanse(c) { chip(c, LM, () => { shape(c, star5(50, 50, 32, 12), BONE, { lw: 3, bb: [18, 18, 82, 82] }); dot(c, 50, 50, 5, LM); }); },
};
export function drawStatusIcon(ctx, status, x, y, size) {
  let id = STATUS_ALIAS[status] || status;
  if (!STATUS_PAINT[id] || id[0] === '_') id = 'dot';
  sprite(ctx, 'st_' + id, STATUS_PAINT[id], fin(x), fin(y), fin(size, 16));
}

// ------------------------------------------------------------------------------------------------ role icons
export const ROLE_IDS = ['brawler', 'archer', 'mage', 'support', 'trapper', 'tank'];
function rchip(c, col, glyph) {
  shape(c, bChamf(6, 6, 88, 88, 16), col, { lw: 4, bb: [6, 6, 94, 94], flat: true });
  fillB(c, bChamf(13, 13, 74, 74, 12), I2);
  c.save(); c.beginPath(); bChamf(13, 13, 74, 74, 12)(c); c.clip(); soft(c, 50, 64, 48, col, 0.3); c.restore();
  strokeB(c, bChamf(13, 13, 74, 74, 12), rgba(BONE, 0.08), 1);
  glyph(c, col);
}
const ROLE_PAINT = {
  brawler(c, col) { // fist
    shape(c, bRound(26, 40, 48, 38, 12), col, { lw: 3, bb: [26, 30, 74, 78] });
    for (let i = 0; i < 4; i++) shape(c, bRound(26 + i * 12, 26, 13, 24, 6), shade(col, i % 2 ? 0 : 0.1), { lw: 2.5, bb: [26, 26, 74, 50] });
    shape(c, bRound(60, 50, 22, 14, 6), shade(col, 0.1), { lw: 2.5, bb: [60, 50, 82, 64] });
    inkLine(c, [30, 66, 70, 66], BONE, 3);
  },
  archer(c, col) { // bow and arrow
    c.save(); c.lineCap = 'round';
    c.beginPath(); c.moveTo(34, 22); c.quadraticCurveTo(76, 50, 34, 78); c.strokeStyle = INK; c.lineWidth = 9; c.stroke();
    c.beginPath(); c.moveTo(34, 22); c.quadraticCurveTo(76, 50, 34, 78); c.strokeStyle = col; c.lineWidth = 5; c.stroke(); c.restore();
    inkLine(c, [34, 22, 34, 78], BONE, 1.6);
    inkLine(c, [20, 50, 76, 50], BONE, 3); shape(c, bPoly([86, 50, 70, 42, 70, 58]), col, { lw: 2.5, flat: true });
    shape(c, bPoly([20, 50, 12, 42, 18, 50, 12, 58]), col, { lw: 2, flat: true });
  },
  mage(c, col) { // wand with star
    inkLine(c, [26, 80, 62, 44], BD, 6);
    shape(c, star5(66, 34, 20, 8), col, { lw: 3, bb: [46, 14, 86, 54] });
    dot(c, 66, 34, 4, BONE);
    sparkleBaked(c, 30, 30, 7, BONE); sparkleBaked(c, 80, 68, 6, col); sparkleBaked(c, 44, 62, 4, col);
  },
  support(c, col) { // heart + plus
    const h = (cc) => { cc.moveTo(50, 80); cc.bezierCurveTo(12, 52, 18, 20, 38, 20); cc.bezierCurveTo(46, 20, 50, 26, 50, 30); cc.bezierCurveTo(50, 26, 54, 20, 62, 20); cc.bezierCurveTo(82, 20, 88, 52, 50, 80); cc.closePath(); };
    shape(c, h, col, { lw: 3.5, bb: [14, 20, 86, 80] });
    fillB(c, bPoly([46, 36, 54, 36, 54, 46, 64, 46, 64, 54, 54, 54, 54, 64, 46, 64, 46, 54, 36, 54, 36, 46, 46, 46]), BONE);
  },
  trapper(c, col) { // bear trap jaws
    shape(c, bEll(50, 66, 36, 10), SL, { lw: 3, bb: [14, 56, 86, 76] });
    const jaw = (flip) => (cc) => { const f = flip ? -1 : 1; cc.moveTo(50 - f * 34, 66); cc.bezierCurveTo(50 - f * 34, 34, 50 + f * 4, 20, 50 + f * 10, 24); cc.lineTo(50 + f * 4, 40); cc.lineTo(50 - f * 4, 28); cc.lineTo(50 - f * 12, 46); cc.lineTo(50 - f * 20, 36); cc.lineTo(50 - f * 24, 66); cc.closePath(); };
    shape(c, jaw(false), col, { lw: 3, bb: [16, 22, 56, 66] }); shape(c, jaw(true), shade(col, -0.15), { lw: 3, bb: [44, 22, 84, 66] });
    dot(c, 50, 66, 4, BONE);
  },
  tank(c, col) { // shield
    const s = (cc) => { cc.moveTo(50, 14); cc.lineTo(82, 24); cc.lineTo(80, 56); cc.bezierCurveTo(78, 72, 64, 80, 50, 88); cc.bezierCurveTo(36, 80, 22, 72, 20, 56); cc.lineTo(18, 24); cc.closePath(); };
    shape(c, s, col, { lw: 3.5, bb: [18, 14, 82, 88], ht: true });
    c.save(); c.beginPath(); s(c); c.clip(); fillB(c, bRect(50, 10, 40, 90), rgba(INK, 0.22)); c.restore();
    inkLine(c, [50, 22, 50, 76], BONE, 3); dot(c, 32, 34, 2.2, BONE); dot(c, 68, 34, 2.2, BONE);
    shape(c, bPoly([40, 46, 50, 38, 60, 46, 56, 58, 44, 58]), BONE, { lw: 2, flat: true });
  },
};
function sparkleBaked(c, x, y, r, col) {
  c.fillStyle = col; c.beginPath(); c.moveTo(x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.fill();
}
export function drawRoleIcon(ctx, role, x, y, size) {
  const g = ROLE_PAINT[role]; if (!g) return;
  sprite(ctx, 'role_' + role, (c) => rchip(c, ROLE_COLOR[role], g), fin(x), fin(y), fin(size, 20));
}

// ------------------------------------------------------------------------------------------------ relics
// 27 distinct emblems in a rarity medallion. Gold appears only on legend and mythic relics.
export const RELIC_IDS = RELICS.map((r) => r.id);
const lemn = (cx, cy, a, n = 28) => { const p = []; for (let i = 0; i <= n; i++) { const th = i / n * TAU, d = 1 + sin(th) * sin(th); p.push(cx + a * cos(th) / d, cy + a * sin(th) * cos(th) / d); } return p; };
const bolt = (x, y, s) => bPoly([x + 10 * s, y, x - 8 * s, y + 24 * s, x + 2 * s, y + 24 * s, x - 10 * s, y + 52 * s, x + 16 * s, y + 18 * s, x + 4 * s, y + 18 * s, x + 14 * s, y]);
const curl = (c, x0, y0, x1, y1, bend) => { c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2 - bend, x1, y1); };

const EMBLEM = {
  rusty_bell(c) {
    const rust = mix(BD, ORG, 0.42);
    const bell = (cc) => { cc.moveTo(26, 72); cc.bezierCurveTo(30, 66, 30, 54, 31, 46); cc.bezierCurveTo(32, 28, 42, 22, 50, 22); cc.bezierCurveTo(58, 22, 68, 28, 69, 46); cc.bezierCurveTo(70, 54, 70, 66, 74, 72); cc.closePath(); };
    shape(c, bEll(50, 17, 5, 5), BD, { lw: 3, bb: [45, 12, 55, 22] });
    shape(c, bell, rust, { bb: [26, 22, 74, 72], ht: true, hot: [40, 32] });
    c.save(); c.beginPath(); bell(c); c.clip();
    for (const [a, b] of [[38, 30], [52, 36], [60, 28], [44, 50]]) { c.fillStyle = rgba(shade(MG, -0.55), 0.55); c.beginPath(); c.ellipse(a, b + 6, 2.6, 8, 0.1, 0, TAU); c.fill(); }
    fillB(c, bRect(26, 62, 48, 5), rgba(BONE, 0.2)); c.restore();
    shape(c, bEll(50, 78, 6, 6), BD, { lw: 3, bb: [44, 72, 56, 84] });
  },
  lucky_collar(c) {
    shape(c, bRing(50, 42, 34, 22, 25, 14), MG, { bb: [16, 20, 84, 64], ht: true });
    for (let i = 0; i < 9; i++) { const a = PI * (0.12 + i * 0.095); line(c, [50 + cos(a) * 29.5 - 1.2, 42 + sin(a) * 18 - 0, 50 + cos(a) * 29.5 + 1.2, 42 + sin(a) * 18], BONE, 1.4); }
    shape(c, bEll(50, 64, 4.5, 4.5), BD, { lw: 2.5, bb: [45, 60, 55, 69] });
    const lf = (ox, oy) => bEll(50 + ox, 78 + oy, 8, 8);
    for (const [ox, oy] of [[-7.5, -2], [7.5, -2], [-7.5, 11], [7.5, 11]].map(([a, b]) => [a, b - 6])) shape(c, lf(ox, oy), LM, { lw: 2.6, bb: [40, 60, 60, 90] });
    dot(c, 50, 79, 2.6, PAL.limeDeep);
  },
  fish_skeleton(c) {
    const bone = (pts, w) => { inkLine(c, pts, BONE, w); };
    bone([22, 52, 70, 52], 4);
    for (let i = 0; i < 5; i++) { const x = 32 + i * 8; bone([x, 52, x + 5, 36 - i * 1.5], 2.6); bone([x, 52, x + 5, 68 + i * 1.5], 2.6); }
    shape(c, bPoly([70, 52, 88, 34, 84, 52, 88, 70]), BONE, { lw: 3, flat: true });
    shape(c, bEll(22, 52, 14, 13), BONE, { lw: 3.5, bb: [8, 39, 36, 65], ht: true });
    shape(c, bEll(18, 49, 4.4, 4.4), INK, { lw: 0, flat: true }); dot(c, 18, 49, 2.2, CY);
    inkLine(c, [10, 56, 22, 60], INK, 1.5); inkLine(c, [12, 60, 24, 62], INK, 1.2);
  },
  warm_sock(c) {
    const sock = (cc) => { cc.moveTo(34, 14); cc.lineTo(62, 14); cc.lineTo(62, 52); cc.bezierCurveTo(62, 58, 74, 56, 82, 64); cc.bezierCurveTo(90, 74, 82, 86, 70, 86); cc.lineTo(42, 86); cc.bezierCurveTo(30, 86, 28, 74, 34, 64); cc.closePath(); };
    shape(c, sock, MG, { bb: [28, 14, 90, 86], ht: true, hot: [40, 24] });
    c.save(); c.beginPath(); sock(c); c.clip();
    fillB(c, bRect(20, 14, 60, 14), BONE); fillB(c, bRect(20, 34, 60, 5), CY); fillB(c, bRect(20, 44, 60, 5), CY);
    fillB(c, bEll(40, 82, 16, 12), CY); fillB(c, bEll(80, 74, 10, 12), BONE);
    inkLine(c, [26, 20, 70, 20], rgba(INK, 0.25), 1);
    c.restore();
    for (let i = 0; i < 5; i++) line(c, [37 + i * 5.4, 15, 37 + i * 5.4, 27], rgba(INK, 0.25), 1);
  },
  yarn_scrap(c) {
    shape(c, bEll(46, 50, 28, 27), CY, { bb: [18, 23, 74, 77], ht: true, hot: [32, 34] });
    c.save(); c.beginPath(); bEll(46, 50, 28, 27)(c); c.clip();
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(14, 36 + i * 9); c.bezierCurveTo(34, 24 + i * 9, 54, 58 + i * 9, 80, 42 + i * 9); c.strokeStyle = rgba(PAL.cyanDeep, 0.9); c.lineWidth = 2; c.stroke(); }
    c.restore();
    c.save(); c.lineCap = 'round'; c.beginPath(); c.moveTo(62, 70); c.bezierCurveTo(74, 80, 80, 66, 90, 78); c.strokeStyle = INK; c.lineWidth = 7; c.stroke();
    c.beginPath(); c.moveTo(62, 70); c.bezierCurveTo(74, 80, 80, 66, 90, 78); c.strokeStyle = MG; c.lineWidth = 3.4; c.stroke(); c.restore();
    inkLine(c, [88, 76, 94, 74, 90, 82, 96, 82], MG, 1.6);
  },
  scratch_pad_notes(c) {
    shape(c, bRound(26, 20, 48, 62, 4), BONE, { bb: [26, 20, 74, 82], lw: 4 });
    shape(c, bRect(26, 20, 48, 12), MG, { lw: 3, bb: [26, 20, 74, 32] });
    for (let i = 0; i < 6; i++) dot(c, 31 + i * 7.6, 26, 2.2, INK);
    inkLine(c, [34, 44, 44, 40, 52, 46, 62, 42], CY, 2); inkLine(c, [34, 56, 66, 56], VH, 1.6); inkLine(c, [34, 66, 58, 66], VH, 1.6);
    inkLine(c, [34, 74, 40, 70, 46, 76, 52, 70], MG, 1.8);
    shape(c, bPoly([70, 56, 80, 46, 86, 52, 76, 62]), LM, { lw: 3, bb: [70, 46, 86, 62] }); shape(c, bPoly([70, 56, 76, 62, 66, 66]), BD, { lw: 2, flat: true });
  },
  ember_locket(c) {
    c.save(); c.beginPath(); c.arc(50, 20, 10, 0, TAU); c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = BD; c.lineWidth = 2.6; c.stroke(); c.restore();
    shape(c, bEll(50, 56, 28, 33), VH, { bb: [22, 23, 78, 89], ht: true, hot: [34, 38] });
    shape(c, bEll(50, 56, 21, 26), I2, { lw: 2.5, flat: true });
    c.save(); c.beginPath(); bEll(50, 56, 21, 26)(c); c.clip(); soft(c, 50, 66, 28, ORG, 0.6); c.restore();
    const fl = (cc) => { cc.moveTo(50, 36); cc.bezierCurveTo(52, 46, 66, 50, 62, 64); cc.bezierCurveTo(60, 76, 40, 76, 38, 64); cc.bezierCurveTo(38, 58, 44, 56, 44, 50); cc.bezierCurveTo(48, 52, 48, 44, 50, 36); cc.closePath(); };
    shape(c, fl, ORG, { lw: 2, bb: [38, 36, 62, 76] }); fillB(c, bEll(50, 67, 6, 8), BONE);
  },
  tesla_whisker(c) {
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(14, 38 + i * 14); c.quadraticCurveTo(44, 26 + i * 14 + 6, 82, 22 + i * 24); c.strokeStyle = INK; c.lineWidth = 6; c.lineCap = 'round'; c.stroke(); c.strokeStyle = BONE; c.lineWidth = 2.6; c.stroke(); }
    shape(c, bolt(46, 18, 1.15), CY, { lw: 3.5, bb: [30, 18, 66, 82], ht: false, rim: BONE });
    fillB(c, bolt(46, 18, 1.15), rgba(BONE, 0.0));
    for (const [x, y] of [[82, 22], [82, 46], [82, 70]]) { shape(c, bEll(x, y, 5.5, 5.5), CY, { lw: 2.5, bb: [x - 6, y - 6, x + 6, y + 6] }); dot(c, x - 1.5, y - 1.5, 1.4, BONE); }
    inkLine(c, [70, 30, 76, 36, 70, 40, 78, 46], CY, 1.6);
  },
  trapper_toolbelt(c) {
    shape(c, bPoly([8, 34, 92, 34, 92, 56, 8, 56]), mix(MG, INK, 0.45), { bb: [8, 34, 92, 56], ht: true });
    for (let i = 0; i < 9; i++) dot(c, 14 + i * 9.5, 45, 1.5, rgba(BONE, 0.45));
    shape(c, bRound(38, 28, 24, 34, 4), BD, { lw: 3.5, bb: [38, 28, 62, 62] }); shape(c, bRect(44, 36, 12, 18), INK, { lw: 0, flat: true }); inkLine(c, [50, 31, 50, 59], BD, 4);
    for (const px of [14, 62]) {
      shape(c, bRound(px, 60, 24, 26, 5), VH, { bb: [px, 60, px + 24, 86], lw: 3.5, ht: true });
      shape(c, bPoly([px, 60, px + 24, 60, px + 24, 70, px + 12, 76, px, 70]), mix(VH, INK, 0.25), { lw: 2.5, bb: [px, 60, px + 24, 76] });
      dot(c, px + 12, 74, 2.8, px < 40 ? CY : MG);
    }
  },
  tin_whistle(c) {
    c.save(); c.translate(50, 54); c.rotate(-0.42);
    shape(c, bRound(-38, -9, 70, 18, 5), mix(STEEL, BD, 0.5), { bb: [-38, -9, 32, 9], lw: 4 });
    shape(c, bRound(-46, -7, 18, 14, 3), BD, { lw: 3.5, bb: [-46, -7, -28, 7] });
    fillB(c, bEll(-8, -9, 7, 3), INK); fillB(c, bRect(-16, -6, 16, 5), INK);
    for (let i = 0; i < 3; i++) dot(c, 8 + i * 8.5, 0, 2.4, INK);
    c.restore();
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(70, 38, 8 + i * 8, -0.9, 0.9); c.strokeStyle = rgba(CY, 0.95 - i * 0.25); c.lineWidth = 3 - i * 0.5; c.lineCap = 'round'; c.stroke(); }
  },
  hairball_amulet(c) {
    c.save(); c.beginPath(); c.ellipse(50, 18, 9, 11, 0, 0, TAU); c.strokeStyle = INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = BONE; c.lineWidth = 2.4; c.stroke(); c.restore();
    const spikes = []; const R = 26;
    for (let i = 0; i < 22; i++) { const a = i / 22 * TAU, r1 = R + (i & 1 ? 8 : 2), a2 = a + TAU / 44; spikes.push(50 + cos(a) * R, 58 + sin(a) * R * 0.95, 50 + cos(a2) * r1, 58 + sin(a2) * r1 * 0.95); }
    const fur = (cc) => { cc.moveTo(spikes[0], spikes[1]); for (let i = 0; i < spikes.length; i += 4) { cc.lineTo(spikes[i + 2], spikes[i + 3]); const n = (i + 4) % spikes.length; cc.lineTo(spikes[n], spikes[n + 1]); } cc.closePath(); };
    shape(c, fur, VH, { bb: [14, 22, 86, 94], ht: true, hot: [34, 38], lw: 4 });
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(50, 58, 8 + i * 3.5, 0.4 + i, 1.8 + i); c.strokeStyle = rgba(shade(VH, -0.4), 0.7); c.lineWidth = 1.2; c.stroke(); }
    shape(c, bPoly([50, 46, 60, 58, 50, 72, 40, 58]), MG, { lw: 3, bb: [40, 46, 60, 72] });
    line(c, [44, 55, 50, 49, 56, 55], rgba(BONE, 0.8), 1.4);
  },
  bulwark_bowl(c) {
    const bowl = (cc) => { cc.moveTo(14, 44); cc.lineTo(86, 44); cc.bezierCurveTo(86, 70, 70, 86, 50, 86); cc.bezierCurveTo(30, 86, 14, 70, 14, 44); cc.closePath(); };
    shape(c, bEll(50, 44, 36, 10), shade(STEEL, 0.2), { bb: [14, 34, 86, 54], lw: 4 });
    fillB(c, bEll(50, 44, 30, 7), mix(I2, STEEL, 0.15));
    for (const [x, y] of [[38, 43], [48, 45], [58, 43], [66, 45], [44, 41], [54, 41]]) dot(c, x, y - 1, 3, [MG, LM, CY][(x | 0) % 3]);
    shape(c, bowl, STEEL, { bb: [14, 44, 86, 86], ht: true, hot: [26, 54] });
    shape(c, bPoly([50, 54, 66, 59, 65, 71, 50, 80, 35, 71, 34, 59]), I2, { lw: 2.5, bb: [34, 54, 66, 80] });
    inkLine(c, [50, 58, 50, 74], BONE, 2.2); inkLine(c, [41, 64, 59, 64], BONE, 2.2);
    shape(c, bEll(50, 44, 36, 10), shade(STEEL, 0.25), { lw: 0, flat: true, noRim: true });
    c.save(); c.beginPath(); c.ellipse(50, 44, 36, 10, 0, 0, TAU); c.ellipse(50, 45, 30, 7, 0, 0, TAU, true); c.fillStyle = shade(STEEL, 0.3); c.fill(); c.restore();
    c.beginPath(); c.ellipse(50, 44, 36, 10, 0, PI, TAU * 0.85); c.strokeStyle = rgba(BONE, 0.7); c.lineWidth = 1.5; c.stroke();
  },
  sniper_scope(c) {
    shape(c, bRing(50, 50, 40, 40, 30, 30), mix(SL, STEEL, 0.4), { bb: [10, 10, 90, 90], ht: true });
    c.save(); c.beginPath(); bEll(50, 50, 30, 30)(c); c.clip();
    c.fillStyle = lin(c, 20, 20, 80, 80, [0, rgba(CY, 0.55), 1, rgba(I3, 1)]); c.fillRect(10, 10, 80, 80);
    soft(c, 38, 36, 26, BONE, 0.5);
    c.restore();
    inkLine(c, [50, 22, 50, 78], BONE, 1.5); inkLine(c, [22, 50, 78, 50], BONE, 1.5);
    c.beginPath(); c.arc(50, 50, 14, 0, TAU); c.strokeStyle = rgba(BONE, 0.8); c.lineWidth = 1.4; c.stroke();
    dot(c, 50, 50, 2.8, MG);
    shape(c, bEll(36, 34, 6, 3.6, -0.8), BONE, { lw: 0, flat: true, noRim: true });
  },
  snack_dispenser(c) {
    shape(c, bRound(26, 14, 48, 56, 18), rgba(CY, 0.0) && mix(I3, CY, 0.2), { bb: [26, 14, 74, 70], lw: 4.5 });
    c.save(); c.beginPath(); bRound(26, 14, 48, 56, 18)(c); c.clip();
    for (let i = 0; i < 16; i++) { const x = 34 + (i % 4) * 11 + (floor(i / 4) & 1) * 4, y = 28 + floor(i / 4) * 10; shape(c, bEll(x, y, 4.6, 3.6, i), [MG, LM, BONE, CY][i % 4], { lw: 1.8, bb: [x - 5, y - 4, x + 5, y + 4], noRim: true }); }
    fillB(c, bPoly([30, 14, 40, 14, 34, 66, 30, 66]), rgba(BONE, 0.28)); c.restore();
    shape(c, bRound(22, 68, 56, 16, 4), VH, { lw: 4, bb: [22, 68, 78, 84] }); fillB(c, bRect(40, 74, 20, 8), INK);
    shape(c, bEll(50, 12, 10, 4), BD, { lw: 3, bb: [40, 8, 60, 16] });
    shape(c, bRound(78, 54, 14, 7, 3), LM, { lw: 3, bb: [78, 54, 92, 61] }); dot(c, 88, 70, 3, MG);
  },
  catnip_pouch(c) {
    for (const [a, b, r] of [[38, 24, -0.5], [50, 18, 0], [62, 24, 0.5]]) { c.save(); c.translate(a, b + 8); c.rotate(r); shape(c, (cc) => { cc.moveTo(0, 0); cc.bezierCurveTo(8, -8, 8, -22, 0, -28); cc.bezierCurveTo(-8, -22, -8, -8, 0, 0); }, LM, { lw: 3, bb: [-8, -28, 8, 0] }); line(c, [0, 0, 0, -22], PAL.limeDeep, 1.2); c.restore(); }
    const bag = (cc) => { cc.moveTo(34, 34); cc.bezierCurveTo(18, 52, 14, 76, 28, 86); cc.lineTo(72, 86); cc.bezierCurveTo(86, 76, 82, 52, 66, 34); cc.closePath(); };
    shape(c, bag, ULT, { bb: [14, 34, 86, 86], ht: true, hot: [32, 52] });
    inkLine(c, [32, 36, 68, 36], BONE, 3.5);
    shape(c, bPoly([34, 34, 28, 42, 36, 40]), BONE, { lw: 1.5, flat: true });
    shape(c, (cc) => { cc.moveTo(50, 78); cc.bezierCurveTo(36, 70, 38, 56, 50, 50); cc.bezierCurveTo(62, 56, 64, 70, 50, 78); }, LM, { lw: 2.5, bb: [38, 50, 62, 78] });
    line(c, [50, 76, 50, 56], PAL.limeDeep, 1.5);
  },
  glow_stick(c) {
    c.save(); c.translate(50, 50); c.rotate(-0.95);
    shape(c, bRound(-42, -11, 84, 22, 11), LM, { bb: [-42, -11, 42, 11], lw: 4.5 });
    fillB(c, bRound(-38, -7, 76, 14, 7), rgba(BONE, 0.5)); fillB(c, bRound(-38, -9, 76, 6, 4), rgba(BONE, 0.55));
    fillB(c, bRect(-44, -9, 6, 18), INK); fillB(c, bRect(38, -9, 6, 18), INK);
    inkLine(c, [-20, -9, -20, 9], rgba(PAL.limeDeep, 0.8), 1.4); inkLine(c, [16, -9, 16, 9], rgba(PAL.limeDeep, 0.8), 1.4);
    c.restore();
    sparkleBaked(c, 24, 24, 6, BONE); sparkleBaked(c, 78, 76, 5, LM); sparkleBaked(c, 82, 28, 4, CY);
  },
  moonstone_prism(c) {
    const tri = bPoly([50, 14, 84, 76, 16, 76]);
    inkLine(c, [4, 52, 34, 52], BONE, 4);
    for (const [col, y] of [[MG, 54], [ULT, 62], [CY, 70], [LM, 78]]) { c.beginPath(); c.moveTo(66, 58); c.lineTo(98, y); c.lineTo(98, y + 9); c.closePath(); c.fillStyle = rgba(col, 0.8); c.fill(); }
    shape(c, tri, mix(I3, CY, 0.4), { bb: [16, 14, 84, 76], lw: 4.5 });
    c.save(); c.beginPath(); tri(c); c.clip();
    soft(c, 40, 40, 34, BONE, 0.7);
    fillB(c, bPoly([50, 14, 58, 14, 40, 76, 16, 76]), rgba(BONE, 0.14)); c.restore();
    c.save(); c.beginPath(); c.arc(50, 56, 11, 0, TAU); c.clip(); c.fillStyle = BONE; c.fillRect(30, 40, 40, 30); c.beginPath(); c.arc(55, 52, 10, 0, TAU); c.fillStyle = mix(I3, CY, 0.4); c.fill(); c.restore();
    inkLine(c, [50, 16, 84, 76], rgba(BONE, 0.0), 1);
    c.beginPath(); c.moveTo(50, 16); c.lineTo(16, 76); c.strokeStyle = rgba(CY, 0.9); c.lineWidth = 1.8; c.stroke();
  },
  nine_lives_charm(c) {
    shape(c, bEll(50, 56, 34, 34), MG, { bb: [16, 22, 84, 90], ht: true, hot: [32, 38] });
    shape(c, bEll(50, 56, 26, 26), I2, { lw: 2.5, flat: true });
    const ear = (s) => (cc) => { cc.moveTo(50 + s * 22, 48); cc.quadraticCurveTo(50 + s * 24, 32, 50 + s * 12, 28); cc.quadraticCurveTo(50 + s * 14, 38, 50 + s * 6, 42); cc.closePath(); };
    fillB(c, ear(1), BONE); fillB(c, ear(-1), BONE);
    fillB(c, bEll(50, 56, 17, 14), BONE);
    fillB(c, bPoly([36, 54, 46, 56, 38, 60]), MG); fillB(c, bPoly([64, 54, 54, 56, 62, 60]), MG);
    fillB(c, bPoly([48, 62, 52, 62, 50, 65]), MG);
    for (let i = 0; i < 9; i++) { const a = PI * (1.12 + i * 0.095); dot(c, 50 + cos(a) * 41, 56 + sin(a) * 41, 2.6, i === 4 ? BONE : CY); }
  },
  stray_crown(c) {
    const crown = (cc) => { cc.moveTo(14, 78); cc.lineTo(10, 30); cc.lineTo(32, 52); cc.lineTo(40, 20); cc.lineTo(50, 48); cc.lineTo(62, 14); cc.lineTo(68, 52); cc.lineTo(90, 26); cc.lineTo(86, 78); cc.closePath(); };
    shape(c, crown, mix(BD, SL, 0.35), { bb: [10, 14, 90, 78], ht: true, hot: [30, 56] });
    shape(c, bRect(14, 64, 72, 16), VH, { lw: 3, bb: [14, 64, 86, 80], noRim: true });
    for (let i = 0; i < 7; i++) { dot(c, 22 + i * 9.4, 72, 3.4, rgba(INK, 0.55)); dot(c, 22 + i * 9.4, 71, 2.4, BD); }
    for (const [x, y] of [[10, 30], [40, 20], [62, 14], [90, 26]]) { shape(c, bPoly([x, y - 7, x + 6, y, x, y + 7, x - 6, y]), MG, { lw: 2.4, bb: [x - 6, y - 7, x + 6, y + 7] }); }
    inkLine(c, [48, 56, 54, 60, 50, 66], INK, 1.4);
    inkLine(c, [26, 40, 30, 44], rgba(BONE, 0.7), 1.2);
  },
  chain_reaction_collar(c) {
    for (let i = 0; i < 7; i++) {
      const a = PI * (0.1 + i * 0.133), x = 50 + cos(a) * 34, y = 36 + sin(a) * 28;
      c.save(); c.translate(x, y); c.rotate(a + (i & 1 ? 0 : PI / 2)); shape(c, bRing(0, 0, i & 1 ? 8 : 6, i & 1 ? 5 : 8, i & 1 ? 4.5 : 2.6, i & 1 ? 2 : 5), i & 1 ? BD : shade(BD, -0.15), { bb: [-9, -9, 9, 9], lw: 3.4 }); c.restore();
    }
    for (const [x0, y0, x1, y1] of [[22, 60, 34, 70], [66, 70, 78, 60], [40, 74, 60, 74]]) inkLine(c, [x0, y0, (x0 + x1) / 2 + 3, (y0 + y1) / 2 - 5, (x0 + x1) / 2 - 2, (y0 + y1) / 2 + 3, x1, y1], CY, 2);
    shape(c, bPoly([50, 70, 58, 80, 50, 92, 42, 80]), CY, { lw: 3, bb: [42, 70, 58, 92] });
    soft(c, 50, 38, 20, CY, 0.25);
  },
  overclock_battery(c) {
    shape(c, bRect(42, 10, 16, 8), BD, { lw: 3.5, bb: [42, 10, 58, 18] });
    shape(c, bRound(28, 18, 44, 70, 7), mix(LM, INK, 0.5), { bb: [28, 18, 72, 88], lw: 4.5, ht: true });
    for (let i = 0; i < 5; i++) fillB(c, bRect(34, 24 + i * 11.5, 32, 8), i < 4 ? LM : rgba(LM, 0.25));
    shape(c, bolt(44, 30, 0.95), BONE, { lw: 2.8, bb: [34, 30, 66, 80], flat: true });
    inkLine(c, [20, 40, 14, 48, 22, 52, 16, 62], CY, 1.8); inkLine(c, [80, 30, 88, 38, 80, 44, 86, 54], CY, 1.8);
  },
  shadow_cloak(c) {
    const cloak = (cc) => { cc.moveTo(50, 10); cc.bezierCurveTo(70, 12, 76, 34, 76, 50); cc.bezierCurveTo(80, 66, 90, 78, 86, 90); cc.lineTo(76, 82); cc.lineTo(68, 92); cc.lineTo(58, 82); cc.lineTo(50, 92); cc.lineTo(42, 82); cc.lineTo(32, 92); cc.lineTo(24, 82); cc.lineTo(14, 90); cc.bezierCurveTo(10, 78, 20, 66, 24, 50); cc.bezierCurveTo(24, 34, 30, 12, 50, 10); cc.closePath(); };
    shape(c, cloak, mix(VI, INK, 0.45), { bb: [10, 10, 90, 92], ht: true, hot: [36, 22] });
    shape(c, bEll(50, 42, 17, 19), INK, { lw: 2.5, flat: true });
    fillB(c, bPoly([38, 40, 48, 44, 40, 47]), MG); fillB(c, bPoly([62, 40, 52, 44, 60, 47]), MG);
    soft(c, 43, 43, 8, MG, 0.5); soft(c, 57, 43, 8, MG, 0.5);
    shape(c, bPoly([50, 62, 56, 69, 50, 76, 44, 69]), CY, { lw: 2.4, bb: [44, 62, 56, 76] });
    inkLine(c, [30, 56, 36, 76], rgba(VH, 0.5), 1.5); inkLine(c, [70, 56, 64, 76], rgba(VH, 0.5), 1.5);
  },
  infinite_yarn(c) {
    shape(c, bEll(50, 50, 32, 31), GD, { bb: [18, 19, 82, 81], ht: true, hot: [34, 34] });
    c.save(); c.beginPath(); bEll(50, 50, 32, 31)(c); c.clip();
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(14, 36 + i * 9); c.bezierCurveTo(34, 24 + i * 9, 54, 58 + i * 9, 86, 40 + i * 9); c.strokeStyle = rgba(GDD, 0.9); c.lineWidth = 2; c.stroke(); }
    c.restore();
    const L = lemn(50, 50, 40);
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); c.moveTo(L[0], L[1]); for (let i = 2; i < L.length; i += 2) c.lineTo(L[i], L[i + 1]); c.strokeStyle = INK; c.lineWidth = 8; c.stroke(); c.strokeStyle = GH; c.lineWidth = 4; c.stroke(); c.restore();
    sparkleBaked(c, 20, 20, 6, BONE); sparkleBaked(c, 82, 80, 5, GH);
  },
  midnight_crown(c) {
    const crown = (cc) => { cc.moveTo(12, 76); cc.lineTo(10, 34); cc.lineTo(30, 52); cc.lineTo(40, 24); cc.lineTo(50, 48); cc.lineTo(60, 24); cc.lineTo(70, 52); cc.lineTo(90, 34); cc.lineTo(88, 76); cc.closePath(); };
    shape(c, crown, GD, { bb: [10, 24, 90, 76], ht: true, hot: [28, 50] });
    shape(c, bRect(12, 62, 76, 18), mix(VI, INK, 0.35), { lw: 3.5, bb: [12, 62, 88, 80], noRim: true });
    inkLine(c, [14, 64, 86, 64], GH, 1.6); inkLine(c, [14, 78, 86, 78], GDD, 1.4);
    c.save(); c.beginPath(); c.arc(50, 36, 12, 0, TAU); c.clip(); c.fillStyle = GH; c.fillRect(30, 20, 40, 30); c.beginPath(); c.arc(55, 33, 10.5, 0, TAU); c.fillStyle = mix(VI, INK, 0.2); c.fill(); c.restore();
    c.beginPath(); c.arc(50, 36, 12, 0, TAU); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    for (const [x, y, col] of [[10, 34, CY], [90, 34, MG], [50, 71, CY]]) shape(c, bPoly([x, y - 6, x + 5, y, x, y + 6, x - 5, y]), col, { lw: 2.4, bb: [x - 5, y - 6, x + 5, y + 6] });
    dot(c, 40, 24, 2.4, GH); dot(c, 60, 24, 2.4, GH);
  },
  supernova_bell(c) {
    const rays = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i & 1 ? 30 : 48, a2 = a + TAU / 32; rays.push(50 + cos(a) * 18, 50 + sin(a) * 18, 50 + cos(a2) * r, 50 + sin(a2) * r); }
    const burst = (cc) => { cc.moveTo(rays[0], rays[1]); for (let i = 0; i < rays.length; i += 4) { cc.lineTo(rays[i + 2], rays[i + 3]); const n = (i + 4) % rays.length; cc.lineTo(rays[n], rays[n + 1]); } cc.closePath(); };
    fillB(c, burst, rgba(GH, 0.9));
    c.beginPath(); c.arc(50, 52, 44, 0, TAU); c.strokeStyle = rgba(GD, 0.55); c.lineWidth = 1.6; c.setLineDash([3, 4]); c.stroke(); c.setLineDash([]);
    const bell = (cc) => { cc.moveTo(30, 72); cc.bezierCurveTo(34, 66, 34, 56, 35, 48); cc.bezierCurveTo(36, 34, 44, 30, 50, 30); cc.bezierCurveTo(56, 30, 64, 34, 65, 48); cc.bezierCurveTo(66, 56, 66, 66, 70, 72); cc.closePath(); };
    shape(c, bEll(50, 26, 4.5, 4.5), GD, { lw: 3, bb: [45, 21, 55, 31] });
    shape(c, bell, GD, { bb: [30, 30, 70, 72], ht: true, hot: [42, 40] });
    fillB(c, bRect(30, 66, 40, 5), rgba(GH, 0.55));
    shape(c, bEll(50, 77, 5.5, 5.5), GDD, { lw: 3, bb: [44, 72, 56, 82] });
    sparkleBaked(c, 18, 22, 6, BONE); sparkleBaked(c, 84, 78, 7, BONE);
  },
  cheshire_grin(c) {
    shape(c, bEll(50, 50, 40, 40), mix(VI, INK, 0.4), { bb: [10, 10, 90, 90], lw: 4 });
    c.save(); c.beginPath(); bEll(50, 50, 40, 40)(c); c.clip();
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-10 + i * 24, 0); c.lineTo(10 + i * 24, 100); c.strokeStyle = rgba(VH, 0.22); c.lineWidth = 6; c.stroke(); }
    c.restore();
    const grin = (cc) => { cc.moveTo(14, 54); cc.bezierCurveTo(26, 90, 74, 90, 86, 54); cc.bezierCurveTo(72, 72, 28, 72, 14, 54); cc.closePath(); };
    shape(c, grin, BONE, { bb: [14, 54, 86, 82], lw: 3.5, flat: true });
    for (let i = 0; i < 8; i++) { const x = 22 + i * 8.6; line(c, [x, 60 + sin(i / 7 * PI) * 12, x - 0.6, 66 + sin(i / 7 * PI) * 12], INK, 1.2); }
    for (const s of [-1, 1]) { shape(c, (cc) => { cc.moveTo(50 + s * 8, 44); cc.quadraticCurveTo(50 + s * 20, 28, 50 + s * 30, 40); cc.quadraticCurveTo(50 + s * 20, 46, 50 + s * 8, 44); }, s < 0 ? CY : MG, { lw: 3, bb: [20, 28, 80, 46], flat: true }); fillB(c, bEll(50 + s * 19, 39, 1.8, 4.6), INK); }
  },
  nine_tailed_halo(c) {
    for (let i = 0; i < 9; i++) {
      const a = PI * (0.12 + i * 0.095) + PI, col = ramp9(i);
      const x0 = 50, y0 = 74, L = 46, bend = (i - 4) * 3;
      const x1 = 50 + cos(a) * L * 1.0 * (i === 4 ? 0.2 : 1) , y1 = 74 + sin(a) * L * 1.2;
      c.save(); c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(50 + (x1 - 50) * 0.3 + bend, 74 + (y1 - 74) * 0.7, x1, y1); c.strokeStyle = INK; c.lineWidth = 9; c.stroke();
      c.strokeStyle = col; c.lineWidth = 5; c.stroke(); c.strokeStyle = rgba(BONE, 0.6); c.lineWidth = 1.4; c.stroke(); c.restore();
    }
    c.beginPath(); c.ellipse(50, 22, 26, 9, 0, 0, TAU); c.strokeStyle = INK; c.lineWidth = 10; c.stroke(); c.strokeStyle = GH; c.lineWidth = 5.5; c.stroke(); c.strokeStyle = GD; c.lineWidth = 2; c.stroke();
    shape(c, bEll(50, 78, 11, 9), BONE, { lw: 3.5, bb: [39, 69, 61, 87] });
    for (const s of [-1, 1]) fillB(c, bPoly([50 + s * 4, 72, 50 + s * 12, 62, 50 + s * 11, 74]), BONE);
    dot(c, 46, 78, 1.8, INK); dot(c, 54, 78, 1.8, INK);
  },
};
function ramp9(i) { return [CY, ULT, MG, ORG, LM, CY, ULT, MG, GH][i % 9]; }

// ---- medallions
const MEDAL = bChamf(5, 5, 90, 90, 17);
function paintMedallion(c, rar) {
  const R = RARITY[rar] || RARITY.common;
  const col = rar === 'mythic' ? PAL.gold : R.color;
  // body
  shape(c, MEDAL, rar === 'common' ? mix(I2, SL, 0.2) : mix(I2, col, rar === 'legend' || rar === 'mythic' ? 0.14 : 0.1), { bb: [5, 5, 95, 95], lw: 5, flat: true });
  fillB(c, MEDAL, lin(c, 0, 0, 0, 100, [0, mix(I3, col, 0.12), 1, I2]));
  c.save(); c.beginPath(); MEDAL(c); c.clip(); soft(c, 50, 62, 52, col, rar === 'common' ? 0.1 : 0.3); c.restore();
  // frame
  const fr = bChamf(9, 9, 82, 82, 14);
  strokeB(c, fr, rar === 'common' ? SL : col, rar === 'common' ? 2.4 : 3);
  if (rar === 'legend' || rar === 'mythic') { strokeB(c, bChamf(14, 14, 72, 72, 11), rgba(rar === 'mythic' ? PAL.goldHot : GH, 0.85), 1.4); }
  strokeB(c, bChamf(14, 14, 72, 72, 11), rgba(BONE, 0.07), 1);
  // upper-left cyan highlight
  c.beginPath(); c.moveTo(9, 70); c.lineTo(9, 23); c.lineTo(23, 9); c.lineTo(70, 9); c.strokeStyle = rgba(CY, 0.8); c.lineWidth = 1.6; c.stroke();
  const stud = (x, y, r, cc) => { shape(c, bPoly([x, y - r, x + r, y, x, y + r, x - r, y]), cc, { lw: 2, bb: [x - r, y - r, x + r, y + r], flat: true }); };
  if (rar === 'rare') for (const [x, y] of [[9, 23], [23, 9], [91, 77], [77, 91], [91, 23], [23, 91], [77, 9], [9, 77]].filter((p, i) => i % 2 === 0)) stud(x, y, 4.6, CY);
  if (rar === 'rare') for (const [x, y] of [[50, 9], [50, 91], [9, 50], [91, 50]]) dot(c, x, y, 1.8, CY);
  if (rar === 'epic') {
    for (const [x, y, sx, sy] of [[9, 9, 1, 1], [91, 9, -1, 1], [9, 91, 1, -1], [91, 91, -1, -1]]) {
      c.beginPath(); c.moveTo(x + sx * 14, y + sy * 3); c.bezierCurveTo(x + sx * 4, y + sy * 3, x + sx * 3, y + sy * 14, x + sx * 3, y + sy * 14); c.strokeStyle = INK; c.lineWidth = 4.2; c.stroke(); c.strokeStyle = MG; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.arc(x + sx * 9, y + sy * 9, 2.6, 0, TAU); c.fillStyle = BONE; c.fill();
    }
    for (const [x, y] of [[50, 9], [50, 91], [9, 50], [91, 50]]) stud(x, y, 3.6, MG);
  }
  if (rar === 'legend' || rar === 'mythic') {
    const cr = bPoly([24, 10, 28, -2, 38, 8, 50, -6, 62, 8, 72, -2, 76, 10]);
    shape(c, cr, rar === 'mythic' ? GH : GD, { lw: 3, bb: [24, -6, 76, 10], flat: true });
    for (const [x, y] of [[9, 91], [91, 91]]) stud(x, y, 4.4, GH);
  }
}
const medalKey = {};
export function drawRelicMedallion(ctx, rar, x, y, size, t) {
  const R = RARITY[rar] || RARITY.common;
  sprite(ctx, 'medal_' + rar, (c) => paintMedallion(c, rar), x, y, size);
  if (rar === 'mythic') {
    const col = prism(t, 0.35);
    ctx.save(); ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = max(1, size * 0.032);
    const s = size / 100, x0 = x - size / 2, y0 = y - size / 2;
    ctx.beginPath(); ctx.moveTo(x0 + 9 * s, y0 + 23 * s); ctx.lineTo(x0 + 23 * s, y0 + 9 * s); ctx.lineTo(x0 + 77 * s, y0 + 9 * s); ctx.lineTo(x0 + 91 * s, y0 + 23 * s); ctx.lineTo(x0 + 91 * s, y0 + 77 * s); ctx.lineTo(x0 + 77 * s, y0 + 91 * s); ctx.lineTo(x0 + 23 * s, y0 + 91 * s); ctx.lineTo(x0 + 9 * s, y0 + 77 * s); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  return R;
}
export function drawRelic(ctx, relicId, x, y, size, t) {
  x = fin(x); y = fin(y); size = fin(size, 48); t = fin(t);
  if (size <= 0) return;
  const def = RELIC_BY_ID[relicId];
  const rar = def ? def.rarity : 'common';
  const R = RARITY[rar] || RARITY.common;
  const gcol = rar === 'mythic' ? prism(t, 0.35) : R.glow;
  if (R.glowAlpha > 0) bloom(ctx, x, y, size * (0.72 + 0.05 * sin(t * 2 + strHash(relicId || 'x') % 7)), gcol, R.glowAlpha * (0.55 + 0.25 * sin(t * (rar === 'epic' ? 3 : 2))));
  drawRelicMedallion(ctx, rar, x, y, size, t);
  const em = EMBLEM[relicId];
  if (em) sprite(ctx, 'rel_' + relicId, em, x, y + size * 0.01, size * 0.84); else sprite(ctx, 'rel_unknown', EMBLEM_UNKNOWN, x, y, size * 0.84);
  if (rar === 'legend' || rar === 'mythic') {
    for (let i = 0; i < (rar === 'mythic' ? 3 : 2); i++) {
      const ph = frac(t * 0.45 + i / 3 + hsh(strHash(relicId || 'x'), i) );
      const a = hsh(strHash(relicId || 'x'), i + 9) * TAU, r = size * (0.2 + 0.18 * hsh(i, 3));
      sparkle(ctx, x + cos(a) * r, y + sin(a) * r, size * 0.11 * sin(ph * PI), rar === 'mythic' ? prism(t + i, 0.3) : PAL.goldHot, sin(ph * PI));
    }
  }
  if (rar === 'mythic') { // orbiting stars
    for (let i = 0; i < 3; i++) { const a = t * 0.9 + i * TAU / 3; sparkle(ctx, x + cos(a) * size * 0.5, y + sin(a) * size * 0.5, size * 0.07, prism(t + i * 0.3, 0.4), 0.9); }
  }
}
function EMBLEM_UNKNOWN(c) { shape(c, bEll(50, 50, 30, 30), SL, { bb: [20, 20, 80, 80] }); line(c, [42, 40, 50, 34, 58, 40, 50, 52, 50, 58], BONE, 4); dot(c, 50, 68, 3, BONE); }

// ------------------------------------------------------------------------------------------------ buildings
// Little neon rooftop structures. Growth: `step` (0..3, every 5 levels) adds floors and lit windows, `tier` (every 20 levels)
// changes the trim colour and adds rooftop ornaments. Level 0 draws a blueprint with scaffolding.
export const BUILDING_IDS = BUILDINGS.map((b) => b.id);
const TIER_COL = [BD, CY, MG, LM, VH, BONE, BONE];
function winA(c, x, y, w, h, on, col) { // arched window
  shape(c, bArch(x, y, w, h), on ? col : I3, { lw: 2, bb: [x, y, x + w, y + h], flat: true, noRim: true });
  if (on) { fillB(c, bRect(x + w / 2 - 0.5, y + w / 2, 1, h - w / 2), rgba(INK, 0.4)); }
}
function box(c, x, y, w, h, base, o) { shape(c, bRect(x, y, w, h), base, Object.assign({ bb: [x, y, x + w, y + h], ht: true }, o || {})); }
function slate(c, pts, base, o) { shape(c, bPoly(pts), base, Object.assign({ lw: 4 }, o || {})); }
function pad(c, K) {
  shape(c, bChamf(5, 80, 90, 13, 4), I3, { lw: 3.5, bb: [5, 80, 95, 93], noRim: false });
  line(c, [10, 83.5, 90, 83.5], rgba(K.ac, 0.85), 1.6);
  for (let i = 0; i < 6; i++) dot(c, 14 + i * 14.4, 88.5, 1.2, rgba(K.ac, 0.7));
}
const STONE = mix(VI, I3, 0.35);
const BP = {
  tuna_cannery(c, K) {
    const e = K.e;
    box(c, 20, 10 - e, 12, 40 + e, mix(VI, BD, 0.25)); for (const y of [16, 26]) fillB(c, bRect(20, y - e, 12, 4), MG);
    shape(c, bEll(26, 10 - e, 7, 3), BD, { lw: 3, bb: [19, 7 - e, 33, 13 - e] });
    box(c, 12, 46 - e, 54, 35 + e, mix(VI, STEEL, 0.35));
    for (let i = 0; i < 3; i++) slate(c, [12 + i * 18, 46 - e, 12 + i * 18, 34 - e, 30 + i * 18, 46 - e], mix(VI, STEEL, 0.2), { lw: 3.4, bb: [12, 34, 66, 46] });
    for (let i = 0; i < 3; i++) winA(c, 18 + i * 15, 56 - e / 2, 9, 14, i <= K.step, CY);
    shape(c, bRect(68, 42 - e, 24, 39 + e), mix(CY, I3, 0.55), { lw: 4, bb: [68, 42, 92, 81], ht: true });
    shape(c, bEll(80, 42 - e, 12, 4.4), shade(CY, 0.1), { lw: 3.4, bb: [68, 38, 92, 47] });
    fillB(c, bRect(68, 58 - e / 2, 24, 14), BONE); fillB(c, bEll(80, 65 - e / 2, 6, 3.4), CY); fillB(c, bPoly([86, 65 - e / 2, 91, 61 - e / 2, 91, 69 - e / 2]), CY); dot(c, 75, 64 - e / 2, 1, INK);
    return { top: 8 - e };
  },
  yarn_mill(c, K) {
    const e = K.e;
    box(c, 12, 52 - e, 46, 29 + e, mix(MG, I3, 0.62));
    slate(c, [8, 52 - e, 35, 28 - e, 62, 52 - e], mix(VI, MG, 0.3), { bb: [8, 28, 62, 52] });
    for (let i = 0; i < 2; i++) winA(c, 20 + i * 20, 60 - e / 2, 10, 16, i <= K.step, MG);
    winA(c, 31, 36 - e, 8, 10, true, CY);
    shape(c, bRect(66, 44 - e, 20, 36 + e), MG, { lw: 4, bb: [66, 44, 86, 80], ht: true });
    c.save(); c.beginPath(); c.rect(66, 44 - e, 20, 36 + e); c.clip();
    for (let y = 46 - e; y < 80; y += 3.4) line(c, [64, y, 88, y + 2.6], rgba(shade(MG, -0.45), 0.8), 1.2);
    c.restore();
    shape(c, bEll(76, 44 - e, 14, 5), shade(BD, 0.15), { lw: 3.5, bb: [62, 39, 90, 49] }); shape(c, bEll(76, 79, 14, 5), BD, { lw: 3.5, bb: [62, 74, 90, 84] });
    inkLine(c, [60, 54 - e, 70, 48 - e], CY, 1.6); dot(c, 35, 27 - e, 2, BONE);
    return { top: 24 - e };
  },
  scratching_post(c, K) {
    const e = K.e;
    shape(c, bRound(12, 74, 76, 9, 3), VH, { lw: 3.6, bb: [12, 74, 88, 83] });
    box(c, 40, 22 - e, 20, 53 + e, mix(BD, SL, 0.3));
    c.save(); c.beginPath(); c.rect(40, 22 - e, 20, 53 + e); c.clip();
    for (let y = 18 - e; y < 78; y += 4) line(c, [36, y + 3, 64, y - 3], rgba(shade(BD, -0.45), 0.9), 1.5);
    c.restore();
    shape(c, bRound(22, 14 - e, 56, 9, 3), MG, { lw: 3.6, bb: [22, 14 - e, 78, 23 - e] });
    if (K.step >= 1) shape(c, bRound(58, 44 - e / 2, 26, 7, 3), VH, { lw: 3.2, bb: [58, 44, 84, 51] });
    inkLine(c, [28, 23 - e, 28, 38 - e], BONE, 1.4); shape(c, bEll(28, 42 - e, 5, 5), LM, { lw: 2.5, bb: [23, 37, 33, 47] });
    for (let i = 0; i < 3; i++) line(c, [43 + i * 4, 60, 45 + i * 4, 72], rgba(INK, 0.5), 1);
    return { top: 12 - e };
  },
  crate_workshop(c, K) {
    const e = K.e;
    box(c, 12, 52 - e, 46, 29 + e, mix(VI, I3, 0.25));
    slate(c, [8, 52 - e, 16, 38 - e, 54, 38 - e, 62, 52 - e], mix(MG, I3, 0.45), { bb: [8, 38, 62, 52] });
    shape(c, bRing(35, 66 - e / 2, 9, 9, 4, 4), BD, { lw: 3, bb: [26, 57, 44, 75] }); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; fillB(c, bRect(35 + cos(a) * 9 - 1.8, 66 - e / 2 + sin(a) * 9 - 1.8, 3.6, 3.6), BD); }
    box(c, 70, 22 - e, 5, 58 + e, STEEL, { lw: 3.5 });
    shape(c, bPoly([70, 22 - e, 70, 28 - e, 36, 30 - e, 36, 25 - e]), STEEL, { lw: 3.2, bb: [36, 22, 70, 30] });
    inkLine(c, [40, 30 - e, 40, 40 - e], BONE, 1.4); box(c, 33, 40 - e, 14, 12, mix(MG, BD, 0.3), { lw: 3 });
    box(c, 78, 64, 14, 16, mix(MG, BD, 0.3), { lw: 3 }); box(c, 80, 52, 11, 12, mix(CY, BD, 0.5), { lw: 3 });
    return { top: 20 - e };
  },
  nap_dome(c, K) {
    const e = K.e;
    const R = 38 + e * 0.35, cy = 82;
    const dome = (cc) => { cc.moveTo(50 - R, cy); cc.arc(50, cy, R, PI, 0); cc.closePath(); };
    shape(c, dome, mix(CY, I3, 0.6), { lw: 4.5, bb: [12, 82 - R, 88, 82], flat: true });
    c.save(); c.beginPath(); dome(c); c.clip();
    c.fillStyle = lin(c, 0, 82 - R, 0, 82, [0, rgba(CY, 0.5), 0.6, rgba(I3, 0.9), 1, rgba(VH, 0.8)]); c.fillRect(0, 0, 100, 100);
    for (let i = 1; i < 4; i++) { c.beginPath(); c.ellipse(50, cy, R * i / 4, R, 0, PI, TAU); c.strokeStyle = rgba(BONE, 0.2); c.lineWidth = 1; c.stroke(); }
    shape(c, bEll(34, 74, 14, 6), MG, { lw: 3, bb: [20, 68, 48, 80] }); shape(c, bEll(62, 74, 15, 6.5), ULT, { lw: 3, bb: [47, 67, 77, 81] });
    c.save(); c.beginPath(); c.arc(50, 48, 9, 0, TAU); c.clip(); c.fillStyle = BONE; c.fillRect(38, 36, 24, 24); c.beginPath(); c.arc(54, 45, 8, 0, TAU); c.fillStyle = mix(I3, CY, 0.3); c.fill(); c.restore();
    fillB(c, bRect(0, 0, 40, 100), rgba(BONE, 0.07)); c.restore();
    strokeB(c, (cc) => { cc.moveTo(50 - R + 5, cy - 10); cc.arc(50, cy, R - 5, PI + 0.25, PI + 1.1); }, rgba(BONE, 0.7), 1.8);
    return { top: 82 - R };
  },
  barracks(c, K) {
    const e = K.e;
    box(c, 12, 42 - e, 76, 39 + e, mix(STEEL, I3, 0.6));
    for (let i = 0; i < 6; i++) box(c, 12 + i * 13.2, 34 - e, 9.6, 9, mix(STEEL, I3, 0.45), { lw: 3 });
    shape(c, bArch(40, 54 - e / 2, 20, 27 + e / 2), I2, { lw: 3.5, bb: [40, 54, 60, 81], flat: true });
    fillB(c, bArch(44, 59 - e / 2, 12, 22 + e / 2), rgba(CY, 0.25 + 0.15 * K.step));
    for (let i = 0; i < 2; i++) { winA(c, 18 + i * 54, 52 - e / 2, 9, 14, i <= K.step, CY); }
    inkLine(c, [18, 34 - e, 18, 16 - e], BD, 2); slate(c, [18, 16 - e, 34, 21 - e, 18, 26 - e], MG, { lw: 2.6, bb: [18, 16, 34, 26] });
    inkLine(c, [82, 34 - e, 82, 20 - e], BD, 2); slate(c, [82, 20 - e, 70, 24 - e, 82, 28 - e], CY, { lw: 2.6, bb: [70, 20, 82, 28] });
    return { top: 14 - e };
  },
  laser_arcade(c, K) {
    const e = K.e;
    box(c, 16, 44 - e, 68, 37 + e, mix(MG, I3, 0.7));
    shape(c, bChamf(20, 22 - e, 60, 20, 5), I2, { lw: 4, bb: [20, 22, 80, 42], flat: true });
    for (let i = 0; i < 6; i++) fillB(c, bRect(26 + i * 8.4, 27 - e, 5, 10), i % 2 ? CY : MG);
    strokeB(c, bChamf(22, 24 - e, 56, 16, 4), rgba(BONE, 0.5), 1);
    shape(c, bArch(40, 56 - e / 2, 20, 25 + e / 2), I2, { lw: 3, flat: true, bb: [40, 56, 60, 81] });
    fillB(c, bRect(45, 64 - e / 2, 10, 17 + e / 2), MG); fillB(c, bRect(47, 66 - e / 2, 6, 6), CY);
    for (let i = 0; i < 2; i++) winA(c, 22 + i * 52, 54 - e / 2, 8, 12, i <= K.step, CY);
    for (const [x0, y0, x1, y1] of [[84, 24 - e, 98, 4], [84, 24 - e, 100, 14]]) line(c, [x0, y0, x1, y1], rgba(MG, 0.5), 1.4);
    dot(c, 84, 24 - e, 2.6, MG);
    return { top: 22 - e };
  },
  smokehouse(c, K) {
    const e = K.e;
    box(c, 14, 50 - e, 56, 31 + e, mix(ORG, I3, 0.78));
    slate(c, [10, 50 - e, 22, 30 - e, 62, 30 - e, 74, 50 - e], mix(VI, I3, 0.2), { bb: [10, 30, 74, 50] });
    box(c, 54, 12 - e, 11, 24, STONE, { lw: 3.5 });
    shape(c, bRect(22, 60 - e / 2, 22, 21 + e / 2), I2, { lw: 3, bb: [22, 60, 44, 81], flat: true }); fillB(c, bRect(25, 63 - e / 2, 16, 18 + e / 2), rgba(ORG, 0.85)); soft(c, 33, 76, 12, ORG, 0.6);
    inkLine(c, [74, 54, 94, 54], BD, 2); inkLine(c, [74, 54, 74, 80], BD, 2); inkLine(c, [94, 54, 94, 80], BD, 2);
    for (let i = 0; i < 3; i++) { const x = 79 + i * 6; shape(c, bEll(x, 66, 2.4, 9), mix(CY, BD, 0.5), { lw: 2, bb: [x - 3, 57, x + 3, 75], noRim: true }); }
    return { top: 10 - e };
  },
  kitty_bank(c, K) {
    const e = K.e;
    box(c, 14, 42 - e, 72, 6, BONE, { lw: 3.5 });
    slate(c, [10, 42 - e, 50, 22 - e, 90, 42 - e], mix(BD, STEEL, 0.4), { bb: [10, 22, 90, 42] });
    for (const s of [-1, 1]) slate(c, [50 + s * 40, 42 - e, 50 + s * 38, 28 - e, 50 + s * 30, 36 - e], mix(BD, STEEL, 0.4), { lw: 2.5, flat: true });
    for (let i = 0; i < 4; i++) shape(c, bRect(18 + i * 18, 48 - e, 8, 28 + e), BONE, { lw: 3, bb: [18 + i * 18, 48, 26 + i * 18, 76], ht: true });
    box(c, 12, 76, 76, 6, BD, { lw: 3.4 });
    shape(c, bEll(50, 37 - e / 2, 7, 7), CY, { lw: 3, bb: [43, 30, 57, 44] }); line(c, [50, 33 - e / 2, 50, 41 - e / 2], BONE, 1.6); line(c, [46.5, 37 - e / 2, 53.5, 37 - e / 2], BONE, 1.6);
    return { top: 20 - e };
  },
  vet_clinic(c, K) {
    const e = K.e;
    shape(c, bRound(14, 40 - e, 72, 41 + e, 10), mix(LM, I3, 0.72), { lw: 4.5, bb: [14, 40, 86, 81], ht: true });
    shape(c, bPoly([42, 22 - e, 58, 22 - e, 58, 32 - e, 68, 32 - e, 68, 42 - e, 58, 42 - e, 58, 52 - e, 42, 52 - e, 42, 42 - e, 32, 42 - e, 32, 32 - e, 42, 32 - e]), LM, { lw: 3.4, bb: [32, 22, 68, 52] });
    for (let i = 0; i < 2; i++) winA(c, 20 + i * 52, 58 - e / 2, 10, 14, i <= K.step, LM);
    shape(c, bArch(40, 58 - e / 2, 20, 23 + e / 2), I2, { lw: 3, flat: true, bb: [40, 58, 60, 81] });
    fillB(c, bEll(50, 71, 4.4, 3.6), LM); for (const [x, y] of [[44, 65], [48, 62.5], [52, 62.5], [56, 65]]) fillB(c, bEll(x, y, 1.4, 1.8), LM);
    return { top: 20 - e };
  },
  gem_mine(c, K) {
    const e = K.e;
    slate(c, [6, 82, 14, 54 - e, 30, 38 - e, 50, 28 - e, 72, 36 - e, 90, 52 - e, 96, 82], mix(VI, I3, 0.5), { lw: 4.5, bb: [6, 28, 96, 82] });
    shape(c, bArch(32, 50 - e / 2, 36, 32 + e / 2), I2, { lw: 4, bb: [32, 50, 68, 82], flat: true });
    inkLine(c, [30, 82, 30, 54 - e / 2, 70, 54 - e / 2, 70, 82], mix(BD, ORG, 0.3), 3.4);
    inkLine(c, [28, 64, 72, 64], rgba(BD, 0.0), 1);
    line(c, [34, 82, 66, 82], rgba(BD, 0.9), 2);
    shape(c, bRound(42, 68, 18, 10, 2), mix(SL, STEEL, 0.4), { lw: 2.8, bb: [42, 68, 60, 78] });
    for (const [x, y, s] of [[46, 66, 1], [52, 64, 1.2], [57, 66, 0.9]]) shape(c, bPoly([x, y - 5 * s, x + 3 * s, y, x, y + 3 * s, x - 3 * s, y]), CY, { lw: 1.8, bb: [x - 3, y - 5, x + 3, y + 3], noRim: true });
    for (const [x, y, s] of [[20, 52, 1], [84, 60, 0.8], [74, 42, 1.1]]) slate(c, [x, y, x - 3.5 * s, y + 10 * s, x + 3.5 * s, y + 10 * s], CY, { lw: 2.6, bb: [x - 4, y, x + 4, y + 10] });
    return { top: 26 - e };
  },
  catnip_garden(c, K) {
    const e = K.e;
    shape(c, bRect(14, 46 - e, 72, 35 + e), rgba(LM, 0), { lw: 4.5, bb: [14, 46, 86, 81], flat: true });
    fillB(c, bRect(14, 46 - e, 72, 35 + e), lin(c, 0, 46 - e, 0, 82, [0, rgba(LM, 0.28), 1, rgba(CY, 0.12)]));
    slate(c, [10, 46 - e, 50, 22 - e, 90, 46 - e], rgba(LM, 0.0), { lw: 4.5, flat: true });
    fillB(c, bPoly([10, 46 - e, 50, 22 - e, 90, 46 - e]), lin(c, 0, 22, 0, 46, [0, rgba(CY, 0.45), 1, rgba(LM, 0.25)]));
    for (const x of [14, 38, 62, 86]) line(c, [x, 46 - e, x, 81], rgba(BONE, 0.65), 1.8);
    line(c, [50, 22 - e, 38, 46 - e], rgba(BONE, 0.65), 1.4); line(c, [50, 22 - e, 62, 46 - e], rgba(BONE, 0.65), 1.4);
    for (let i = 0; i < 4; i++) { const x = 26 + i * 16; shape(c, bRound(x - 5, 72, 10, 9, 2), mix(MG, I3, 0.5), { lw: 2.4, bb: [x - 5, 72, x + 5, 81], noRim: true }); for (const r of [-0.6, 0, 0.6]) { c.save(); c.translate(x, 72); c.rotate(r); shape(c, (cc) => { cc.moveTo(0, 0); cc.bezierCurveTo(4, -5, 4, -11 - K.step, 0, -15 - K.step * 2); cc.bezierCurveTo(-4, -11 - K.step, -4, -5, 0, 0); }, LM, { lw: 2, bb: [-4, -16, 4, 0], noRim: true }); c.restore(); } }
    return { top: 20 - e };
  },
  clock_tower(c, K) {
    const e = K.e;
    box(c, 34, 24 - e, 32, 57 + e, mix(VI, BD, 0.25));
    box(c, 30, 76, 40, 6, BD, { lw: 3.4 }); box(c, 30, 20 - e, 40, 6, BD, { lw: 3.4 });
    slate(c, [32, 20 - e, 50, 0 - e * 0.5 + 2, 68, 20 - e], mix(MG, I3, 0.35), { bb: [32, 0, 68, 20] });
    shape(c, bEll(50, 40 - e / 2, 12, 12), BONE, { lw: 3.6, bb: [38, 28, 62, 52] });
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; dot(c, 50 + cos(a) * 9.4, 40 - e / 2 + sin(a) * 9.4, 0.9, INK); }
    winA(c, 44, 58 - e / 3, 12, 14, K.step >= 1, MG);
    dot(c, 50, 3 - e * 0.5, 2.4, CY);
    return { top: 0 - e * 0.5, clock: [50, 40 - e / 2] };
  },
  shrine_nine_lives(c, K) {
    const e = K.e * 0.7;
    for (const x of [24, 70]) shape(c, bRect(x, 34 - e, 8, 47 + e), MG, { lw: 3.6, bb: [x, 34, x + 8, 81], ht: true });
    shape(c, (cc) => { cc.moveTo(8, 34 - e); cc.quadraticCurveTo(50, 26 - e, 92, 34 - e); cc.lineTo(88, 24 - e); cc.quadraticCurveTo(50, 14 - e, 12, 24 - e); cc.closePath(); }, mix(MG, INK, 0.2), { lw: 4, bb: [8, 14, 92, 34] });
    shape(c, bRect(20, 40 - e, 60, 5), mix(MG, INK, 0.1), { lw: 3.2, bb: [20, 40, 80, 45] });
    shape(c, bEll(50, 66, 8, 9), BONE, { lw: 3, bb: [42, 57, 58, 75] }); shape(c, bEll(50, 53, 6.5, 6), BONE, { lw: 3, bb: [43, 47, 57, 59] });
    for (const s of [-1, 1]) fillB(c, bPoly([50 + s * 2, 49, 50 + s * 6, 42, 50 + s * 7, 50]), BONE);
    box(c, 34, 76, 32, 5, STONE, { lw: 3 });
    for (let i = 0; i < 9; i++) { const x = 16 + i * 8.5; fillB(c, bRect(x - 1.5, 72, 3, 8), BONE); }
    return { top: 14 - e, flames: 9 };
  },
  radio_tower(c, K) {
    const e = K.e;
    box(c, 22, 66, 56, 15, mix(VI, I3, 0.3), { lw: 3.6 });
    winA(c, 30, 69, 8, 12, true, CY);
    slate(c, [38, 66, 50, 8 - e, 62, 66], rgba(BD, 0.0), { lw: 4, flat: true });
    fillB(c, bPoly([38, 66, 50, 8 - e, 62, 66]), rgba(I2, 0.7));
    for (let i = 0; i < 6; i++) { const y = 66 - i * (58 + e) / 6, y2 = y - (58 + e) / 6; const w1 = 12 * (1 - (66 - y) / (58 + e)), w2 = 12 * (1 - (66 - y2) / (58 + e)); inkLine(c, [50 - w1, y, 50 + w2, y2], BD, 1.7); inkLine(c, [50 + w1, y, 50 - w2, y2], BD, 1.7); }
    inkLine(c, [38, 66, 50, 8 - e], BD, 2.8); inkLine(c, [62, 66, 50, 8 - e], BD, 2.8);
    shape(c, (cc) => { cc.moveTo(54, 34 - e / 2); cc.quadraticCurveTo(76, 32 - e / 2, 74, 50 - e / 2); cc.quadraticCurveTo(62, 40 - e / 2, 54, 34 - e / 2); }, BONE, { lw: 3, bb: [54, 32, 76, 50] });
    dot(c, 50, 8 - e, 2.6, MG);
    return { top: 6 - e, beacon: [50, 8 - e] };
  },
  observatory(c, K) {
    const e = K.e * 0.6;
    box(c, 22, 52 - e, 56, 29 + e, mix(VI, I3, 0.25));
    const dome = (cc) => { cc.moveTo(26, 52 - e); cc.arc(50, 52 - e, 24, PI, 0); cc.closePath(); };
    shape(c, dome, mix(STEEL, BD, 0.4), { lw: 4.2, bb: [26, 28, 74, 52] });
    c.save(); c.beginPath(); dome(c); c.clip(); fillB(c, bPoly([46, 20, 56, 20, 60, 60, 44, 60]), I2); fillB(c, bRect(48, 20, 3, 40), rgba(BONE, 0.25)); c.restore();
    c.save(); c.translate(52, 40 - e); c.rotate(-0.7); shape(c, bRound(0, -4.5, 32, 9, 2.5), SL, { lw: 3, bb: [0, -4, 32, 4] }); shape(c, bRect(28, -6, 7, 12), BD, { lw: 2.4, bb: [28, -6, 35, 6] }); c.restore();
    for (let i = 0; i < 2; i++) winA(c, 30 + i * 28, 58 - e / 2, 10, 14, i <= K.step, VH);
    for (const [x, y] of [[14, 20], [84, 14], [90, 40], [8, 44]]) sparkleBaked(c, x, y, 3.2, BONE);
    return { top: 28 - e };
  },
};
const BLD_LIVE = {
  tuna_cannery: (ctx, o, s, t, K) => smoke(ctx, o.x + 26 * s, o.y + (6 - K.e) * s, s, t, BONE),
  smokehouse: (ctx, o, s, t, K) => smoke(ctx, o.x + 59.5 * s, o.y + (10 - K.e) * s, s, t, BD),
  clock_tower(ctx, o, s, t, K) {
    const cx = o.x + 50 * s, cy = o.y + (40 - K.e / 2) * s, ph = t * 0.4;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = max(1, 2 * s);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sin(ph * 12) * 6.5 * s, cy - cos(ph * 12) * 6.5 * s); ctx.moveTo(cx, cy); ctx.lineTo(cx + sin(ph) * 9 * s, cy - cos(ph) * 9 * s); ctx.stroke();
    ctx.restore(); bloom(ctx, cx, cy, 14 * s, MG, 0.15 + 0.1 * sin(t * 2));
  },
  radio_tower(ctx, o, s, t, K) {
    const bx = o.x + 50 * s, by = o.y + (8 - K.e) * s;
    for (let i = 0; i < 3; i++) { const ph = frac(t * 0.7 + i / 3); ctx.strokeStyle = rgba(CY, (1 - ph) * 0.8); ctx.lineWidth = max(1, 1.6 * s); ctx.beginPath(); ctx.arc(bx, by, (4 + ph * 22) * s, -2.2, -0.9); ctx.stroke(); }
  },
  laser_arcade(ctx, o, s, t, K) {
    const ox = o.x + 84 * s, oy = o.y + (24 - K.e) * s, a = sin(t * 1.3) * 0.5;
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(MG, 0.8 * pa); ctx.lineWidth = max(1, 1.8 * s); ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + cos(-0.9 + a) * 40 * s, oy + sin(-0.9 + a) * 40 * s); ctx.stroke();
    ctx.strokeStyle = rgba(CY, 0.6 * pa); ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + cos(-0.5 - a) * 34 * s, oy + sin(-0.5 - a) * 34 * s); ctx.stroke();
    ctx.globalCompositeOperation = po; bloom(ctx, ox, oy, 8 * s, MG, 0.6);
  },
  nap_dome(ctx, o, s, t) { for (let i = 0; i < 2; i++) { const ph = frac(t * 0.3 + i * 0.5); ctx.globalAlpha *= 1; const a = sin(ph * PI); ctx.fillStyle = rgba(BONE, a * 0.9); ctx.font = 'bold ' + Math.round(max(6, (9 + i * 4) * s)) + 'px sans-serif'; ctx.fillText('z', o.x + (62 + i * 8 + ph * 6) * s, o.y + (46 - ph * 22 - i * 6) * s); } },
  gem_mine(ctx, o, s, t) { const ph = frac(t * 0.5); sparkle(ctx, o.x + 52 * s, o.y + 64 * s, 6 * s * sin(ph * PI), BONE, sin(ph * PI)); },
  observatory(ctx, o, s, t) { for (let i = 0; i < 3; i++) { const a = 0.5 + 0.5 * sin(t * (1 + i * 0.6) + i * 2); sparkle(ctx, o.x + (14 + i * 34) * s, o.y + (20 - (i % 2) * 7) * s, 3.4 * s, BONE, a * 0.9); } },
  shrine_nine_lives(ctx, o, s, t) { for (let i = 0; i < 9; i++) { const x = o.x + (16 + i * 8.5) * s, y = o.y + 71 * s, f = 0.7 + 0.3 * sin(t * 9 + i * 1.7); bloom(ctx, x, y, 4.5 * s * f, ORG, 0.9); ctx.fillStyle = BONE; ctx.beginPath(); ctx.ellipse(x, y + 0.5 * s, 1 * s, 2 * s * f, 0, 0, TAU); ctx.fill(); } },
  vet_clinic(ctx, o, s, t, K) { bloom(ctx, o.x + 50 * s, o.y + (37 - K.e) * s, 18 * s, LM, 0.2 + 0.12 * sin(t * 2.2)); },
  catnip_garden(ctx, o, s, t) { for (let i = 0; i < 3; i++) { const ph = frac(t * 0.2 + i / 3); sparkle(ctx, o.x + (30 + i * 20 + sin(t + i) * 4) * s, o.y + (70 - ph * 30) * s, 3 * s * sin(ph * PI), LM, sin(ph * PI)); } },
  yarn_mill(ctx, o, s, t) { const ph = frac(t * 0.6); ctx.strokeStyle = rgba(BONE, 0.6); ctx.lineWidth = max(1, s); ctx.beginPath(); ctx.moveTo(o.x + 70 * s, o.y + (48 + ph * 28) * s); ctx.lineTo(o.x + 82 * s, o.y + (48 + ph * 28 + 2) * s); ctx.stroke(); },
  kitty_bank(ctx, o, s, t, K) { const ph = frac(t * 0.4); sparkle(ctx, o.x + (30 + ph * 40) * s, o.y + (50 - K.e) * s, 4 * s * sin(ph * PI), BONE, sin(ph * PI)); },
  crate_workshop(ctx, o, s, t, K) { const a = sin(t * 1.4) * 0.05; ctx.save(); ctx.translate(o.x + 36 * s, o.y + (32 - K.e) * s); ctx.rotate(a); ctx.translate(-(o.x + 36 * s), -(o.y + (32 - K.e) * s)); ctx.restore(); bloom(ctx, o.x + 40 * s, o.y + (46 - K.e) * s, 10 * s, MG, 0.12); },
  barracks(ctx, o, s, t, K) { bloom(ctx, o.x + 50 * s, o.y + 70 * s, 14 * s, CY, 0.18 + 0.08 * sin(t * 1.8)); },
  scratching_post(ctx, o, s, t, K) { bloom(ctx, o.x + 28 * s, o.y + (42 - K.e) * s, 8 * s, LM, 0.25 + 0.15 * sin(t * 2.6)); },
};
function smoke(ctx, x, y, s, t, col) {
  for (let i = 0; i < 4; i++) {
    const ph = frac(t * 0.35 + i / 4), r = (2.5 + ph * 7) * s;
    ctx.fillStyle = rgba(col, 0.38 * (1 - ph)); ctx.beginPath(); ctx.arc(x + (sin(ph * 5 + i) * 3 + ph * 8) * s, y - ph * 26 * s, r, 0, TAU); ctx.fill();
  }
}
function tierDeco(c, K, top) {
  const tc = K.ac;
  if (K.tier >= 1) for (let i = 0; i < 5; i++) dot(c, 18 + i * 16, 80, 1.5, BONE);
  if (K.tier >= 2) { inkLine(c, [10, 80, 10, 76 - 18], BD, 1.6); inkLine(c, [6, 62, 14, 62], BD, 1.4); dot(c, 10, 58, 2, tc); }
  if (K.tier >= 3) { inkLine(c, [92, 80, 92, 44], BD, 1.8); slate(c, [92, 44, 80, 48, 92, 54], tc, { lw: 2.4, flat: true }); }
  if (K.tier >= 4) for (const x of [8, 92]) shape(c, bPoly([x, 70, x + 4, 76, x, 82, x - 4, 76]), tc, { lw: 2, bb: [x - 4, 70, x + 4, 82], flat: true });
  if (K.tier >= 5) { c.beginPath(); c.ellipse(50, 86, 52, 6, 0, 0, TAU); c.strokeStyle = rgba(tc, 0.9); c.lineWidth = 2; c.stroke(); }
}
function paintBuilding(c, id, K) {
  const p = BP[id] || BP.barracks;
  let info = null;
  c.save();
  info = p(c, K) || {};
  c.restore();
  pad(c, K);
  tierDeco(c, K, info.top);
  return info;
}
function paintBlueprint(c, id, K) {
  c.save(); c.globalAlpha = 0.28; const info = (BP[id] || BP.barracks)(c, K) || {}; c.restore();
  const top = max(2, (info.top || 20) - 2);
  c.save(); c.setLineDash([4, 3]); c.strokeStyle = rgba(CY, 0.9); c.lineWidth = 1.6; c.strokeRect(12, top, 76, 82 - top);
  c.setLineDash([]); c.strokeStyle = rgba(CY, 0.5); c.lineWidth = 1;
  c.beginPath(); for (let x = 12; x <= 88; x += 19) { c.moveTo(x, top); c.lineTo(x, 82); } for (let y = top; y < 82; y += 16) { c.moveTo(12, y); c.lineTo(88, y); } c.moveTo(12, top); c.lineTo(88, 82); c.moveTo(88, top); c.lineTo(12, 82); c.stroke(); c.restore();
  pad(c, K);
}
const BLD_DEF = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
export function buildingKit(level) {
  const lv = max(0, floor(fin(level)));
  const tier = lv <= 0 ? 0 : min(6, floor((lv - 1) / 20));
  const step = lv <= 0 ? 0 : min(3, floor(((lv - 1) % 20) / 5));
  return { lv, tier, step, e: step * 3.5, ac: TIER_COL[tier] };
}
export function drawBuilding(ctx, id, level, x, y, size, t) {
  x = fin(x); y = fin(y); size = fin(size, 64); t = fin(t);
  if (size <= 0) return;
  const K = buildingKit(level);
  const known = !!BP[id];
  const key = 'bld_' + id + '_' + K.tier + '_' + K.step + (K.lv === 0 ? '_bp' : '');
  if (K.lv > 0 && K.tier >= 1) bloom(ctx, x, y + size * 0.3, size * 0.55, K.tier >= 5 ? prism(t, 0.3) : K.ac, 0.14 + 0.05 * sin(t * 2));
  sprite(ctx, key, (c) => (K.lv === 0 ? paintBlueprint(c, id, K) : paintBuilding(c, id, K)), x, y, size);
  if (known && K.lv > 0) {
    const s = size / 100, o = { x: x - size / 2, y: y - size / 2 };
    const live = BLD_LIVE[id]; if (live) live(ctx, o, s, t, K);
    if (K.tier >= 2) { const a = 0.5 + 0.5 * sin(t * 3 + strHash(id)); bloom(ctx, o.x + 10 * s, o.y + 58 * s, 5 * s, K.tier >= 5 ? prism(t, 0.5) : K.ac, 0.4 + 0.5 * a); }
    if (K.tier >= 5) { ctx.save(); ctx.strokeStyle = prism(t, 0.35); ctx.globalAlpha = 0.7; ctx.lineWidth = max(1, 1.8 * s); ctx.beginPath(); ctx.ellipse(o.x + 50 * s, o.y + 86 * s, 52 * s, 6 * s, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
  }
}

// ------------------------------------------------------------------------------------------------ crates
// Five crates. Body and lid pieces are baked separately; opening (o.open 0..1) lifts/rotates the lid pieces, opens a glowing
// mouth and spills light. o.shake 0..1 rattles it, o.glow is an intensity (number) or a colour (hex, PAL role or rarity id).
export const CRATE_IDS = CRATES.map((c) => c.id);
const CRATE_DEF = Object.fromEntries(CRATES.map((c) => [c.id, c]));
function crateColor(v, dflt) {
  if (typeof v !== 'string') return dflt;
  if (v[0] === '#') return v;
  if (PAL[v] && typeof PAL[v] === 'string') return PAL[v];
  if (RARITY[v]) return RARITY[v].color;
  return dflt;
}
// each crate: body(c), lids:[{paint(c), hx, hy, rot, lift, sx (foreshorten), fade}], mouth:{cx,cy,rx,ry}
const CRATEART = {
  alley_crate: {
    mouth: { cx: 50, cy: 46, rx: 34, ry: 6 }, glow: CY,
    body(c) {
      const card = mix(BD, SL, 0.45);
      shape(c, bPoly([12, 46, 88, 46, 90, 90, 10, 90]), card, { lw: 4.5, bb: [10, 46, 90, 90], ht: true });
      c.save(); c.beginPath(); bPoly([12, 46, 88, 46, 90, 90, 10, 90])(c); c.clip();
      fillB(c, bRect(44, 44, 12, 48), rgba(BD, 0.9)); line(c, [44, 46, 44, 90], rgba(INK, 0.35), 1); line(c, [56, 46, 56, 90], rgba(INK, 0.35), 1);
      c.fillStyle = rgba(shade(MG, -0.5), 0.35); c.beginPath(); c.ellipse(24, 80, 14, 7, 0.2, 0, TAU); c.fill();
      for (let i = 0; i < 3; i++) line(c, [14, 56 + i * 12, 86, 57 + i * 12], rgba(INK, 0.16), 1);
      c.restore();
      fillB(c, bRound(62, 62, 22, 20, 3), rgba(BONE, 0.85));
      for (const [x, y] of [[68, 70], [72, 67], [76, 67], [80, 70]]) fillB(c, bEll(x, y, 1.6, 2), INK); fillB(c, bEll(74, 76, 4, 3), INK);
      inkLine(c, [64, 63, 82, 63], MG, 1.2);
    },
    lids: [
      { hx: 11, hy: 44, rot: -1.75, lift: 0, paint(c) { shape(c, bPoly([8, 36, 50, 38, 50, 46, 11, 46]), mix(BD, SL, 0.3), { lw: 4, bb: [8, 36, 50, 46] }); line(c, [14, 41, 44, 42], rgba(INK, 0.25), 1); } },
      { hx: 89, hy: 44, rot: 1.75, lift: 0, paint(c) { shape(c, bPoly([50, 38, 92, 36, 89, 46, 50, 46]), mix(BD, SL, 0.5), { lw: 4, bb: [50, 36, 92, 46] }); fillB(c, bRect(44, 36, 12, 10), rgba(BD, 0.95)); } },
    ],
  },
  neon_crate: {
    mouth: { cx: 50, cy: 48, rx: 35, ry: 9 }, glow: CY,
    body(c) {
      const tin = (cc) => { cc.moveTo(14, 48); cc.lineTo(14, 82); cc.bezierCurveTo(14, 94, 86, 94, 86, 82); cc.lineTo(86, 48); cc.closePath(); };
      shape(c, tin, PAL.cyanDeep, { lw: 4.5, bb: [14, 48, 86, 92], ht: true });
      c.save(); c.beginPath(); tin(c); c.clip();
      fillB(c, bRect(10, 58, 80, 22), BONE);
      fillB(c, bEll(40, 69, 15, 7), CY); fillB(c, bPoly([54, 69, 66, 62, 66, 76]), CY); dot(c, 31, 67, 1.6, INK); line(c, [36, 69, 50, 69], rgba(BONE, 0.6), 1);
      inkLine(c, [10, 58, 90, 58], rgba(MG, 0.0), 1);
      fillB(c, bRect(10, 58, 80, 3), MG); fillB(c, bRect(10, 77, 80, 3), MG);
      for (let i = 0; i < 6; i++) line(c, [18 + i * 14, 48, 18 + i * 14, 90], rgba(INK, 0.1), 1);
      c.restore();
      c.beginPath(); c.ellipse(50, 48, 36, 9, 0, 0, PI); c.strokeStyle = shade(CY, 0.3); c.lineWidth = 2; c.stroke();
    },
    lids: [
      { hx: 86, hy: 48, rot: -1.45, lift: 6, paint(c) {
        shape(c, bEll(50, 47, 37, 10), mix(PAL.cyanDeep, CY, 0.35), { lw: 4.5, bb: [13, 37, 87, 57] });
        c.beginPath(); c.ellipse(50, 47, 28, 6.5, 0, 0, TAU); c.strokeStyle = rgba(INK, 0.4); c.lineWidth = 1.2; c.stroke();
        shape(c, bRing(46, 44, 11, 5.4, 7.6, 3), BD, { lw: 3, bb: [35, 39, 57, 49] });
        c.beginPath(); c.ellipse(34, 44, 11, 3, -0.3, PI, TAU); c.strokeStyle = rgba(BONE, 0.8); c.lineWidth = 1.6; c.stroke();
      } },
    ],
  },
  rooftop_crate: {
    mouth: { cx: 50, cy: 52, rx: 36, ry: 7 }, glow: MG,
    body(c) {
      shape(c, bRound(10, 50, 80, 41, 5), mix(VI, INK, 0.2), { lw: 4.5, bb: [10, 50, 90, 91], ht: true });
      for (const x of [22, 78]) { fillB(c, bRect(x - 4, 50, 8, 41), rgba(INK, 0.35)); line(c, [x - 4, 52, x - 4, 90], rgba(MG, 0.9), 2); line(c, [x + 4, 52, x + 4, 90], rgba(MG, 0.9), 2); }
      line(c, [12, 60, 88, 60], MG, 2.4); line(c, [12, 83, 88, 83], MG, 2.4);
      shape(c, bRound(40, 58, 20, 20, 4), mix(MG, INK, 0.2), { lw: 3.6, bb: [40, 58, 60, 78] });
      shape(c, bEll(50, 67, 4.4, 4.4), CY, { lw: 2.5, bb: [45, 62, 55, 72] }); fillB(c, bRect(48.8, 68, 2.4, 6), INK);
      for (const [x, y] of [[16, 56], [84, 56], [16, 86], [84, 86]]) dot(c, x, y, 1.8, BONE);
    },
    lids: [{ hx: 50, hy: 52, rot: 0, lift: 12, sx: 0.55, paint(c) {
      const lid = (cc) => { cc.moveTo(10, 52); cc.lineTo(10, 40); cc.bezierCurveTo(10, 20, 90, 20, 90, 40); cc.lineTo(90, 52); cc.closePath(); };
      shape(c, lid, mix(VI, INK, 0.1), { lw: 4.5, bb: [10, 22, 90, 52], ht: true });
      line(c, [22, 50, 22, 28], MG, 2); line(c, [78, 50, 78, 28], MG, 2); line(c, [14, 36, 86, 36], rgba(MG, 0.0), 1);
      c.beginPath(); c.moveTo(14, 38); c.bezierCurveTo(24, 24, 76, 24, 86, 38); c.strokeStyle = MG; c.lineWidth = 2.4; c.stroke();
      dot(c, 50, 30, 2, BONE);
    } }],
  },
  midnight_crate: {
    mouth: { cx: 50, cy: 52, rx: 35, ry: 6 }, glow: VH,
    body(c) {
      shape(c, bRect(10, 50, 80, 41), I3, { lw: 4.5, bb: [10, 50, 90, 91], ht: true });
      c.save(); c.beginPath(); c.rect(10, 50, 80, 41); c.clip();
      for (let i = 0; i < 4; i++) line(c, [10, 58 + i * 9, 90, 58 + i * 9], rgba(VH, 0.22), 1);
      c.restore();
      for (const [x, y] of [[16, 56], [84, 56], [16, 85], [84, 85], [50, 56]]) { dot(c, x, y, 2.6, INK); dot(c, x, y - 0.4, 1.7, VH); }
      shape(c, bEll(50, 71, 13, 13), I2, { lw: 3.6, bb: [37, 58, 63, 84] });
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; line(c, [50 + cos(a) * 9, 71 + sin(a) * 9, 50 + cos(a) * 11.4, 71 + sin(a) * 11.4], VH, 1.2); }
      line(c, [50, 71, 56, 65], BONE, 2); dot(c, 50, 71, 2.2, MG);
      // velvet rope draped between two posts
      for (const x of [14, 86]) { shape(c, bRect(x - 2, 62, 4, 28), BD, { lw: 2.6, bb: [x - 2, 62, x + 2, 90] }); shape(c, bEll(x, 61, 4.4, 4.4), BONE, { lw: 2.6, bb: [x - 4, 57, x + 4, 66] }); }
      c.beginPath(); c.moveTo(14, 61); c.quadraticCurveTo(50, 92, 86, 61); c.strokeStyle = INK; c.lineWidth = 7; c.lineCap = 'round'; c.stroke(); c.strokeStyle = MG; c.lineWidth = 4; c.stroke(); c.strokeStyle = rgba(BONE, 0.45); c.lineWidth = 1; c.stroke();
    },
    lids: [{ hx: 50, hy: 52, rot: 0, lift: 38, sx: 1, fade: true, paint(c) {
      shape(c, bPoly([8, 52, 14, 34, 86, 34, 92, 52]), mix(I3, VH, 0.25), { lw: 4.5, bb: [8, 34, 92, 52], ht: true });
      line(c, [20, 40, 80, 40], rgba(VH, 0.5), 1.2); shape(c, bEll(50, 43, 7, 5), BD, { lw: 2.6, bb: [43, 38, 57, 48] }); dot(c, 50, 43, 1.8, MG);
    } }],
  },
  mythic_crate: {
    mouth: { cx: 50, cy: 50, rx: 32, ry: 7 }, glow: GH,
    body(c) {
      shape(c, bPoly([12, 50, 88, 50, 92, 90, 8, 90]), I2, { lw: 4.5, bb: [8, 50, 92, 90], ht: true });
      for (const x of [16, 84]) { shape(c, bRect(x - 5, 52, 10, 36), mix(GD, GDD, 0.4), { lw: 3.2, bb: [x - 5, 52, x + 5, 88] }); line(c, [x, 54, x, 86], rgba(GH, 0.7), 1); shape(c, bRect(x - 7, 84, 14, 6), GD, { lw: 3, bb: [x - 7, 84, x + 7, 90] }); }
      shape(c, bArch(34, 56, 32, 34), I3, { lw: 3.6, bb: [34, 56, 66, 90], flat: true });
      strokeB(c, bArch(36, 58, 28, 32), GD, 2);
      // cat sigil
      const ear = (s) => (cc) => { cc.moveTo(50 + s * 10, 68); cc.quadraticCurveTo(50 + s * 12, 58, 50 + s * 5, 55); cc.quadraticCurveTo(50 + s * 5, 62, 50 + s * 2, 64); cc.closePath(); };
      fillB(c, ear(1), GD); fillB(c, ear(-1), GD); fillB(c, bEll(50, 71, 9, 8), GD);
      fillB(c, bPoly([44, 69, 48, 70, 45, 72]), I3); fillB(c, bPoly([56, 69, 52, 70, 55, 72]), I3);
      for (let i = 0; i < 5; i++) dot(c, 24 + i * 13, 55, 1.6, GH);
      line(c, [12, 51, 88, 51], GD, 2.6);
    },
    lids: [{ hx: 50, hy: 50, rot: 0.1, lift: 30, sx: 1, paint(c) {
      shape(c, bPoly([10, 50, 16, 36, 50, 28, 84, 36, 90, 50]), mix(I2, GD, 0.15), { lw: 4.5, bb: [10, 28, 90, 50], ht: true });
      shape(c, bPoly([20, 36, 24, 18, 32, 32, 42, 12, 50, 30, 58, 12, 68, 32, 76, 18, 80, 36]), GD, { lw: 3.6, bb: [20, 12, 80, 36], ht: true });
      for (const [x, y] of [[24, 18], [42, 12], [58, 12], [76, 18]]) dot(c, x, y, 2, GH);
      shape(c, bPoly([50, 38, 56, 44, 50, 50, 44, 44]), CY, { lw: 2.4, bb: [44, 38, 56, 50] });
      line(c, [14, 47, 86, 47], GH, 1.4);
    } }],
  },
};
export function drawCrate(ctx, crateId, x, y, size, o) {
  o = o || {};
  x = fin(x); y = fin(y); size = fin(size, 96); if (size <= 0) return;
  const art = CRATEART[crateId] || CRATEART.alley_crate;
  const t = fin(o.t), open = cl(fin(o.open), 0, 1), shake = cl(fin(o.shake), 0, 1);
  const gcol = crateColor(o.glow, art.glow);
  const gInt = typeof o.glow === 'number' ? cl(fin(o.glow, 1), 0, 2) : 1;
  const e = outCubic(open);
  const s = size / 100, x0 = x - size / 2, y0 = y - size / 2;
  const mouth = art.mouth;
  // ---- backdrop glow and light spill
  const base = (0.1 + 0.9 * e) * gInt;
  bloom(ctx, x, y + size * 0.05, size * (0.6 + 0.5 * e), gcol, 0.2 + 0.55 * base);
  if (e > 0.02) {
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    const my = y0 + mouth.cy * s, mx = x0 + mouth.cx * s;
    const rays = 7, spin = t * 0.3;
    for (let i = 0; i < rays; i++) {
      const a = -PI / 2 + (i - (rays - 1) / 2) * 0.2 + sin(spin + i) * 0.04;
      const L = size * (0.9 + 0.5 * hsh(i, 5)) * e, w = 0.05 + 0.04 * hsh(i, 6);
      ctx.fillStyle = rgba(gcol, (0.16 + 0.14 * hsh(i, 7)) * e * gInt * pa);
      ctx.beginPath(); ctx.moveTo(mx - mouth.rx * s * 0.3, my); ctx.lineTo(mx + cos(a - w) * L, my + sin(a - w) * L); ctx.lineTo(mx + cos(a + w) * L, my + sin(a + w) * L); ctx.lineTo(mx + mouth.rx * s * 0.3, my); ctx.fill();
    }
    ctx.fillStyle = rgba(BONE, 0.22 * e * pa); ctx.beginPath(); ctx.moveTo(mx - mouth.rx * s * 0.8, my); ctx.lineTo(mx - mouth.rx * s * 0.35, my - size * 0.8 * e); ctx.lineTo(mx + mouth.rx * s * 0.35, my - size * 0.8 * e); ctx.lineTo(mx + mouth.rx * s * 0.8, my); ctx.fill();
    ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
  }
  // ---- shake and idle bob
  ctx.save();
  const sh = shake * size * 0.018, jx = sin(t * 61) * sh + sin(t * 37) * sh * 0.5, jr = sin(t * 47) * shake * 0.05;
  ctx.translate(x + jx, y0 + size); ctx.rotate(jr); ctx.translate(-x, -(y0 + size));
  // ---- body
  const key = 'crate_' + crateId;
  sprite(ctx, key + '_b', art.body, x, y, size);
  // ---- mouth
  if (e > 0.04) {
    const cx = x0 + mouth.cx * s, cy = y0 + mouth.cy * s, rx = mouth.rx * s * (0.55 + 0.45 * e), ry = mouth.ry * s * (0.5 + 0.9 * e);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(cx, cy, rx + 2.2 * s, ry + 2 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(gcol, 1); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(BONE, 0.85 * e); ctx.beginPath(); ctx.ellipse(cx, cy - ry * 0.1, rx * 0.72, ry * 0.55, 0, 0, TAU); ctx.fill();
    bloom(ctx, cx, cy, rx * 1.4, gcol, 0.6 * e);
  }
  // ---- lid pieces
  for (let i = 0; i < art.lids.length; i++) {
    const L = art.lids[i];
    const lk = key + '_l' + i;
    ctx.save();
    const hx = x0 + L.hx * s, hy = y0 + L.hy * s;
    if (L.fade) ctx.globalAlpha *= 1 - 0.55 * e;
    ctx.translate(hx, hy - (L.lift || 0) * s * e);
    if (L.rot) ctx.rotate(L.rot * e + (open > 0 && open < 1 ? sin(t * 14 + i) * 0.02 * (1 - open) : 0));
    else if (e > 0 && e < 1) ctx.rotate(sin(t * 9 + i) * 0.01);
    if (L.sx !== undefined && L.sx < 1) ctx.scale(1, 1 - (1 - L.sx) * e);
    ctx.translate(-hx, -hy);
    sprite(ctx, lk, L.paint, x, y, size);
    ctx.restore();
  }
  // ---- seam light on a closed crate (it leaks before it opens)
  if (open < 0.5) {
    const leak = (0.25 + 0.2 * sin(t * 3)) * (1 - open * 2) * gInt * (0.4 + shake * 1.2);
    const cx = x0 + mouth.cx * s, cy = y0 + (mouth.cy + 1) * s;
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(gcol, cl(leak, 0, 1) * pa); ctx.fillRect(cx - mouth.rx * s * 0.9, cy - 0.8 * s, mouth.rx * s * 1.8, 1.6 * s);
    ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
  }
  ctx.restore();
  // ---- rising motes
  if (e > 0.05) {
    for (let i = 0; i < 9; i++) {
      const ph = frac(t * (0.5 + 0.3 * hsh(i, 1)) + hsh(i, 2));
      const px = x0 + mouth.cx * s + (hsh(i, 3) - 0.5) * mouth.rx * s * 1.6 + sin(t * 2 + i) * 4 * s;
      const py = y0 + mouth.cy * s - ph * size * 0.9 * e;
      sparkle(ctx, px, py, size * 0.045 * (1 - ph) * (0.6 + hsh(i, 4)), i % 3 ? gcol : BONE, (1 - ph) * e);
    }
  }
}
