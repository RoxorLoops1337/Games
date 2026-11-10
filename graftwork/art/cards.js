// GRAFTWORK card art: THE ANATOMICAL PLATE. Cards are engraved vellum pinned under one key lamp; grafts are patches of
// other skin sewn on with black thread and brass. All procedural canvas, no images.
//
// Performance: the static layers of a card (frame, vellum, engraved illustration, text, grafts, tithe seam, jam clamp,
// marks) are baked once into an offscreen canvas keyed by (id, up, grafts, fused, tithed, jam, compact, mark, rarity,
// text). Only the live layer is drawn per frame: contact shadow, lamp rim and sheen, parallax layers when tilted,
// uncommon sweep, rare foil band and frame sparkle, cost orb, glow, selection, dim. Without a DOM (node tests) it
// draws directly.
//
//   lightDir(t, out?)                  THE shared key lamp. Unit vector TOWARD the lamp (upper left), pendulum +-12 deg / 6 s.
//                                      Returns {x, y, angle, sway}. Pass `out` to avoid allocation.
//   drawCard(ctx, spec, x, y, o)       centered. o: { scale, rot, tithed, jam, cost, glow 0..1, selected, dim 0..1, alpha, hover,
//                                      preview, compact, tilt:{x,y} -1..1, mark:'numb'|'unpicked'|'reknit'|'frayed', rarity, t, still }
//   drawCardBack(ctx, x, y, o)         centered. o: { scale, rot, alpha, dim, t, back }; setCardBack(id) picks the equipped back (8 ids: BACK_IDS)
//   drawGraftPatch(ctx, graft, x,y,w,h,o)   TOP-LEFT anchored. o: { hover, selected, dim, sold, scale }
//   drawSchoolGlyph(ctx, school, x, y, r, color)   centered
import { COL } from '../ui/core.js';
import { cardLines, priceLines } from '../engine/text.js';
import { GRAFTS } from '../data/index.js';
import { lnw } from './linework.js';
import { createFaceLru, chooseBucket, idealBucket, LEGACY, PIXEL_BUDGET, BIG_MAX, BIG_FROM } from './face_lod.js';
import { deviceScale } from '../ui/smoothing.js';
import { FLAGS } from '../ui/perf_flags.js';
import { templates, composeCardFront, cardFrameIds, cardBackIds, resolveSlots, drawNineSlice, centerOf, CARD_BACK_TEMPLATE } from '../ui/templates.js';

export const CARD_W = 220, CARD_H = 310;
const HW = CARD_W / 2, HH = CARD_H / 2;
// Revised school colours from the art bible. The lead syncs data/schools.js and ui/core.js COL from this list.
export const SCHOOL_COLORS = { ember: '#E8571F', echo: '#6CC6D6', hoard: '#B8922A', blood: '#A3142F', rust: '#8F4A2A', static: '#D9E84A', gilded: '#EFD98F' };
export const CB = { on: false }; // colourblind pattern chips on cards (set by ui/a11y.js)
export const COLX = Object.assign({}, COL, SCHOOL_COLORS);
const INK = COL.ink, SEPIA = '#4a3022', BRASS = '#c9a227', BRASS_D = '#7a5f12', BRASS_L = '#fff1b0', STEEL = '#b9b4a8', STEEL_D = '#6c675e', SCAR_BRIGHT = '#e5546a';
const SCHOOL_ORDER = ['ember', 'echo', 'hoard', 'blood', 'rust', 'static', 'gilded'];
export const SCHOOL_SHAPES = { ember: 'flame', echo: 'arcs', hoard: 'pouch', blood: 'drop', rust: 'cog', static: 'bolt', gilded: 'diamond' };
const TIER_COL = { safe: '#4f9a5d', greedy: '#d9a82c', weird: '#8a52c8' };
const HERO_SCHOOL = { marrow: 'blood', wick: 'ember', odile: 'hoard' };

// ---------- the key lamp ----------
export function lightDir(t, out) {
  const o = out || { x: 0, y: 0, angle: 0, sway: 0 };
  const sway = Math.sin(((t || 0) / 6) * Math.PI * 2) * (12 * Math.PI / 180);
  const a = -0.75 * Math.PI + sway;
  o.x = Math.cos(a); o.y = Math.sin(a); o.angle = a; o.sway = sway;
  return o;
}
const _L = { x: 0, y: 0, angle: 0, sway: 0 };
const nowT = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;

// ---------- small utilities ----------
// ---------- small utilities ----------
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngOf(seed) { let a = (typeof seed === 'string' ? hash(seed) : seed) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rgb(hex) { if (hex[0] !== '#') { const m = hex.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; } const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function toHex(r, g, b) { const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
function alpha(hex, a) { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function desat(hex, t) { const c = rgb(hex); const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return toHex(c[0] + (l - c[0]) * t, c[1] + (l - c[1]) * t, c[2] + (l - c[2]) * t); }
const font = (size, o = {}) => `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${Math.round(size * 10) / 10}px ${o.ui ? 'Trebuchet MS, sans-serif' : 'Georgia, serif'}`;

function setDash(g, d) { if (g.setLineDash) g.setLineDash(d); }
function wrapText(g, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean), out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && g.measureText(t).width > maxW) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  return out;
}
function fitText(g, str, maxW, size, minSize, o = {}) { let s = size; g.font = font(s, o); while (s > minSize && g.measureText(str).width > maxW) { s -= 0.5; g.font = font(s, o); } return s; }


// ---------- shape helpers: every outlined shape is ENGRAVED (hatch on the shadow side, tapered sepia contour) ----------
let BB = null; // bbox hint of the last path (consumed by fs)
function rr(g, x, y, w, h, r) {
  BB = { cx: x + w / 2, cy: y + h / 2, r: Math.max(w, h) * 0.55 };
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r); g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
}
function poly(g, pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  g.beginPath(); pts.forEach((p, i) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.closePath();
  BB = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0) * 0.55 + 1 };
}
function isOpaque(f) { if (typeof f !== 'string') return false; if (f.startsWith('rgba')) { const m = f.match(/[\d.]+/g); return m && +m[3] >= 0.7; } return true; }
function lg(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([t, c]) => gr.addColorStop(t, c)); return gr; }
// motif "gradients" are flat: the shading is hatched, never blended
function grad(g, x0, y0, x1, y1, stops) { if (stops.length === 2) return mix(stops[0][1], stops[1][1], 0.4); return stops[stops.length >> 1][1]; }

// pattern tiles are drawn at 2x and halved by the pattern transform where DOMMatrix exists
const pats = {};
function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext && c.getContext('2d'); if (!g) return null; return { c, g }; } catch (e) { return null; }
}
function mkPattern(g, key, size, paint, half = true) {
  if (key in pats) return pats[key];
  const cv = makeCanvas(size, size); let p = null;
  if (cv) { try { paint(cv.g, size); p = g.createPattern(cv.c, 'repeat'); if (half && p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix([0.5, 0, 0, 0.5, 0, 0])); } catch (e) { p = null; } }
  pats[key] = p; return p;
}
// cached 8 unit hatch tiles at 3 densities (1 loose, 2 tight, 3 cross)
function hatchPat(g, lvl) {
  return mkPattern(g, 'h' + lvl, 16, (c, n) => {
    c.strokeStyle = 'rgba(58,38,26,.62)'; c.lineWidth = lnw(1.5); c.lineCap = 'butt'; c.beginPath();
    const sp = lvl === 1 ? 16 : 8;
    for (let o = -n; o <= n * 2; o += sp) { c.moveTo(o, n); c.lineTo(o + n, 0); }
    if (lvl >= 3) for (let o = -n; o <= n * 2; o += 16) { c.moveTo(o, 0); c.lineTo(o + n, n); }
    c.stroke();
  });
}
function weavePat(g) {
  return mkPattern(g, 'weave', 6, (c) => { c.strokeStyle = 'rgba(30,20,14,.9)'; c.lineWidth = lnw(1); c.beginPath(); c.moveTo(0, 1.5); c.lineTo(6, 1.5); c.moveTo(0, 4.5); c.lineTo(6, 4.5); c.moveTo(1.5, 0); c.lineTo(1.5, 3); c.moveTo(4.5, 3); c.lineTo(4.5, 6); c.stroke(); });
}
function fibrePat(g) {
  return mkPattern(g, 'fibre', 128, (c, n) => {
    const r = rngOf('fibre');
    for (let i = 0; i < 150; i++) {
      const x = r() * n, y = r() * n, a = r() * 6.28, l = 6 + r() * 16, bend = (r() - 0.5) * 8; const dark = r() > 0.42;
      c.strokeStyle = dark ? `rgba(110,82,50,${0.10 + r() * 0.14})` : `rgba(255,250,235,${0.16 + r() * 0.16})`; c.lineWidth = lnw(0.6 + r() * 0.7);
      for (let ox = -n; ox <= n; ox += n) for (let oy = -n; oy <= n; oy += n) { c.beginPath(); c.moveTo(x + ox, y + oy); c.quadraticCurveTo(x + ox + Math.cos(a) * l / 2 + bend, y + oy + Math.sin(a) * l / 2 - bend, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); c.stroke(); }
    }
    for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(90,64,38,${0.05 + r() * 0.08})`; c.fillRect(r() * n, r() * n, 1 + r(), 1 + r()); }
  });
}
function goldPat(g) {
  return mkPattern(g, 'gold', 64, (c, n) => {
    const r = rngOf('gold'); c.fillStyle = '#d9b648'; c.fillRect(0, 0, n, n);
    for (let i = 0; i < 70; i++) { const x = r() * n, y = r() * n, s = 2 + r() * 6; c.fillStyle = r() > 0.5 ? '#f5e6a8' : r() > 0.4 ? '#c9a227' : '#8a6c18'; c.globalAlpha = 0.6 + r() * 0.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + s, y + r() * 2); c.lineTo(x + s * 0.6, y + s * 0.8); c.closePath(); c.fill(); }
    c.globalAlpha = 1; c.strokeStyle = 'rgba(80,56,10,.5)'; c.lineWidth = lnw(0.7); for (let i = 0; i < 12; i++) { const x = r() * n, y = r() * n; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 14, y + (r() - 0.5) * 14); c.stroke(); }
  });
}
// hatch the shadow side of the CURRENT path (flat colour on the lit side). lvl 2+ adds cross hatch in the deep shadow.
function shadeCurrent(g, fill, cx, cy, R, lvl = 1) {
  const t1 = hatchPat(g, lvl >= 2 ? 2 : 1); if (!t1) return;
  g.save(); g.clip();
  const bx = cx - R - 4, by = cy - R - 4, bs = 2 * R + 8, x0 = cx - R * 0.8, y0 = cy - R * 0.8, x1 = cx + R * 0.9, y1 = cy + R * 0.9;
  const cover = (a, b) => { const c1 = alpha(fill, 1), c0 = alpha(fill, 0); const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, c1); gr.addColorStop(a, c1); gr.addColorStop(b, c0); gr.addColorStop(1, c0); g.fillStyle = gr; g.fillRect(bx, by, bs, bs); };
  if (lvl >= 2) { const t3 = hatchPat(g, 3); if (t3) { g.fillStyle = t3; g.fillRect(bx, by, bs, bs); cover(0.76, 0.98); } }
  g.fillStyle = t1; g.fillRect(bx, by, bs, bs); cover(0.36, 0.8);
  g.restore();
}
function fs(g, fill, lw = 2.2, lvl = 2) {
  const bb = BB; BB = null;
  const cx = bb ? bb.cx : 0, cy = bb ? bb.cy : 0, R = bb ? bb.r : 40;
  if (fill) { g.fillStyle = fill; g.fill(); if (isOpaque(fill)) shadeCurrent(g, fill, cx, cy, R, lvl); }
  if (lw) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    const sg = g.createLinearGradient(cx + R, cy + R, cx - R, cy - R); // heavy on the shadow side, light on the lit side
    sg.addColorStop(0, alpha(SEPIA, 0.98)); sg.addColorStop(0.55, alpha(SEPIA, 0.8)); sg.addColorStop(1, alpha(SEPIA, 0.42));
    g.strokeStyle = sg; g.lineWidth = lnw(lw * 1.12); g.stroke();
    g.strokeStyle = INK; g.lineWidth = lnw(Math.max(0.9, lw * 0.4)); g.stroke();
  }
}
function circ(g, x, y, r, fill, lw = 2) { BB = { cx: x, cy: y, r: r * 1.05 + 0.5 }; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); fs(g, fill, lw); }
function ell(g, x, y, rx, ry, fill, lw = 2, rot = 0) { BB = { cx: x, cy: y, r: Math.max(rx, ry) * 1.05 + 0.5 }; g.beginPath(); g.ellipse ? g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2) : g.arc(x, y, rx, 0, Math.PI * 2); fs(g, fill, lw); }
function line(g, x1, y1, x2, y2, col, lw) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = col; g.lineWidth = lnw(lw); g.lineCap = 'round'; g.stroke(); }
// thread-like cord: ink body, colour core, twist marks
function cord(g, w, col, pathFn) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); pathFn(); g.lineWidth = lnw(w + 3); g.strokeStyle = SEPIA; g.stroke();
  g.beginPath(); pathFn(); g.lineWidth = lnw(w); g.strokeStyle = col; g.stroke();
  g.beginPath(); pathFn(); g.lineWidth = lnw(w); g.strokeStyle = 'rgba(43,30,26,.45)'; setDash(g, [1.5, 3.5]); g.stroke(); setDash(g, []);
}
function engrave(g, str, x, y, col, up = false) { // debossed text: 1px light below, ink on top
  g.fillStyle = up ? 'rgba(20,10,5,.55)' : 'rgba(255,248,228,.55)'; g.fillText(str, x, y + (up ? -1 : 1));
  g.fillStyle = col; g.fillText(str, x, y);
}
function bevel(g, x, y, w, h, r, lw = 2, a = 0.55) { // 2px bevel, light top/left, dark bottom/right (baked at the rest lamp)
  rr(g, x + lw / 2, y + lw / 2, w - lw, h - lw, Math.max(1, r - lw / 2));
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, `rgba(255,248,226,${a})`); gr.addColorStop(0.42, 'rgba(255,248,226,0)'); gr.addColorStop(0.58, 'rgba(20,10,4,0)'); gr.addColorStop(1, `rgba(20,10,4,${a})`);
  g.lineWidth = lnw(lw); g.strokeStyle = gr; g.stroke(); BB = null;
}

// ---------- school glyphs (seven SHAPES, colorblind safe) ----------
export function drawSchoolGlyph(ctx, school, x, y, r, color) {
  const c = color || COLX[school] || '#fff';
  ctx.save(); ctx.translate(x, y); ctx.scale(r / 10, r / 10); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const out = (fill) => { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lnw(1.6); ctx.strokeStyle = INK; ctx.stroke(); };
  switch (school) {
    case 'ember': ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(2, -5, 8, -2, 7, 3); ctx.bezierCurveTo(6, 8, 3, 10, 0, 10); ctx.bezierCurveTo(-4, 10, -8, 7, -7, 2); ctx.bezierCurveTo(-6, -1, -3, -3, -3, -6); ctx.bezierCurveTo(-1, -5, 0, -8, 0, -10); ctx.closePath(); out(c); break;
    case 'echo':
      ctx.lineWidth = lnw(3.4); ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(-3, 0, 5, -1.1, 1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(-3, 0, 10, -1.0, 1.0); ctx.stroke();
      ctx.lineWidth = lnw(1.9); ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(-3, 0, 5, -1.1, 1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(-3, 0, 10, -1.0, 1.0); ctx.stroke();
      ctx.beginPath(); ctx.arc(-3, 0, 1.6, 0, 6.3); out(c); break;
    case 'hoard': ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(3, -8); ctx.lineTo(2, -5); ctx.bezierCurveTo(10, -1, 10, 9, 0, 10); ctx.bezierCurveTo(-10, 9, -10, -1, -2, -5); ctx.closePath(); out(c); ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(3, -5); ctx.lineWidth = lnw(1.6); ctx.strokeStyle = INK; ctx.stroke(); break;
    case 'blood': ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(3, -4, 8, 0, 8, 4); ctx.bezierCurveTo(8, 8, 4, 10, 0, 10); ctx.bezierCurveTo(-4, 10, -8, 8, -8, 4); ctx.bezierCurveTo(-8, 0, -3, -4, 0, -10); ctx.closePath(); out(c); break;
    case 'rust': {
      ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.2832, rad = i % 2 ? 6.8 : 10; const px = Math.cos(a) * rad, py = Math.sin(a) * rad; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); out(c);
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 6.3); out(INK); break;
    }
    case 'static': ctx.beginPath(); ctx.moveTo(2, -10); ctx.lineTo(-6, 1); ctx.lineTo(-1, 1); ctx.lineTo(-3, 10); ctx.lineTo(7, -3); ctx.lineTo(1, -3); ctx.lineTo(5, -10); ctx.closePath(); out(c); break;
    case 'gilded': ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 0); ctx.lineTo(0, 10); ctx.lineTo(-8, 0); ctx.closePath(); out(c); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.lineWidth = lnw(0.9); ctx.strokeStyle = 'rgba(43,30,26,.6)'; ctx.stroke(); break;
    default: ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.3); out(c);
  }
  ctx.restore();
}

// ---------- the motif library ----------
// Each motif draws around (0,0) in a +-40 box. k = palette: main (school), dark, light, acc (variant accent), paper, steel, steelD, brass.
function gearPath(g, r, n, depth = 0.22) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a0 = (i / (n * 2)) * 6.2832, a1 = ((i + 1) / (n * 2)) * 6.2832, rad = i % 2 ? r * (1 - depth) : r; const am = (a0 + a1) / 2; const d = 0.02; g.lineTo(Math.cos(a0 + d) * rad, Math.sin(a0 + d) * rad); g.lineTo(Math.cos(a1 - d) * rad, Math.sin(a1 - d) * rad); void am; }
  g.closePath();
}
const MOTIFS = {
  scalpel(g, k) { g.rotate(-0.6); rr(g, -40, -4.5, 36, 9, 3); fs(g, k.brass); g.beginPath(); for (let i = 0; i < 5; i++) { g.moveTo(-36 + i * 7, -4.5); g.lineTo(-36 + i * 7, 4.5); } g.lineWidth = lnw(1); g.strokeStyle = BRASS_D; g.stroke(); poly(g, [[-4, -3], [6, -2], [8, 2], [-4, 3]]); fs(g, k.steelD); poly(g, [[6, -4], [30, -4], [42, 5], [6, 4]]); fs(g, k.steel); line(g, 10, -1, 34, 1.5, '#fff', 1.4); circ(g, 6, 12, 0, null, 0); },
  bonesaw(g, k) { g.rotate(-0.35); rr(g, -42, -8, 28, 16, 5); fs(g, k.dark); line(g, -36, -3, -20, -3, k.light, 1.5); g.beginPath(); g.moveTo(-14, -5); g.lineTo(40, -5); g.lineTo(40, 3); for (let i = 0; i < 9; i++) { g.lineTo(37 - i * 6.2, 8); g.lineTo(34 - i * 6.2, 3); } g.lineTo(-14, 4); g.closePath(); fs(g, k.steel); line(g, -10, -2, 36, -2, '#fff', 1.3); circ(g, -14, 0, 3, k.brass, 1.5); },
  bandage(g, k) { circ(g, -4, -2, 25, k.paper); circ(g, -4, -2, 19, null, 1.2); circ(g, -4, -2, 13, null, 1.2); circ(g, -4, -2, 7, INK, 1.5); g.save(); g.beginPath(); g.arc(-4, -2, 25, 0, 6.3); g.clip(); for (let i = -3; i < 4; i++) line(g, -30, i * 8, 30, i * 8 + 5, 'rgba(120,90,60,.25)', 1); g.restore(); poly(g, [[12, 18], [40, 22], [39, 34], [10, 32]]); fs(g, k.paper); line(g, 14, 25, 38, 28, k.main, 3); g.beginPath(); g.moveTo(22, 20); g.lineTo(24, 32); g.moveTo(30, 21); g.lineTo(32, 33); g.lineWidth = lnw(1.4); g.strokeStyle = SCAR_BRIGHT; g.stroke(); },
  syringe(g, k) { g.rotate(-0.75); rr(g, -22, -8, 38, 16, 3); fs(g, 'rgba(235,245,248,.9)'); g.save(); rr(g, -22, -8, 38, 16, 3); g.clip(); g.fillStyle = k.main; g.fillRect(-22, -8, 22, 16); g.restore(); rr(g, -22, -8, 38, 16, 3); fs(g, null); for (let i = 0; i < 5; i++) line(g, -16 + i * 7, -8, -16 + i * 7, i % 2 ? -4 : -2, INK, 1.2); line(g, -22, 0, -36, 0, k.steelD, 4); line(g, -38, -8, -38, 8, k.steel, 5); rr(g, 14, -12, 5, 24, 2); fs(g, k.steel); poly(g, [[19, -3], [26, -2], [26, 2], [19, 3]]); fs(g, k.steelD); poly(g, [[26, -1.4], [46, 0], [26, 1.4]]); fs(g, k.steel, 1.4); },
  heart(g, k) { g.beginPath(); g.moveTo(0, -12); g.bezierCurveTo(-8, -36, -42, -26, -34, 2); g.bezierCurveTo(-30, 18, -10, 28, 0, 40); g.bezierCurveTo(10, 28, 30, 18, 34, 2); g.bezierCurveTo(42, -26, 8, -36, 0, -12); g.closePath(); fs(g, grad(g, -30, -30, 30, 40, [[0, k.light], [0.5, k.main], [1, k.dark]]), 2.6); ell(g, -16, -14, 6, 3.5, 'rgba(255,255,255,.4)', 0, -0.7); line(g, -2, -12, -2, -30, k.dark, 5); line(g, 8, -14, 14, -30, k.dark, 4); g.beginPath(); g.moveTo(-26, 6); g.lineTo(26, 10); g.lineWidth = lnw(2); setDash(g, [4, 3]); g.strokeStyle = '#111'; g.stroke(); setDash(g, []); rr(g, -4, 3, 12, 5, 1.5); fs(g, k.brass, 1.4); },
  flame(g, k) { g.beginPath(); g.moveTo(0, -42); g.bezierCurveTo(8, -26, 30, -14, 28, 10); g.bezierCurveTo(26, 30, 10, 40, 0, 40); g.bezierCurveTo(-10, 40, -28, 30, -26, 8); g.bezierCurveTo(-25, -2, -18, -8, -14, -18); g.bezierCurveTo(-10, -8, -4, -14, 0, -42); g.closePath(); fs(g, grad(g, 0, -40, 0, 40, [[0, k.light], [0.5, k.main], [1, k.dark]]), 2.6); g.save(); g.translate(0, 14); g.scale(0.55, 0.55); g.beginPath(); g.moveTo(0, -42); g.bezierCurveTo(8, -26, 30, -14, 28, 10); g.bezierCurveTo(26, 30, 10, 40, 0, 40); g.bezierCurveTo(-10, 40, -28, 30, -26, 8); g.bezierCurveTo(-25, -2, -18, -8, -14, -18); g.bezierCurveTo(-10, -8, -4, -14, 0, -42); g.closePath(); fs(g, '#ffd36a', 2); g.restore(); },
  candle(g, k) { rr(g, -13, -8, 26, 46, 3); fs(g, k.paper); g.beginPath(); g.moveTo(-13, -8); g.lineTo(13, -8); g.lineTo(13, 0); g.bezierCurveTo(10, 2, 9, 12, 5, 12); g.bezierCurveTo(1, 12, 2, 4, -2, 4); g.bezierCurveTo(-6, 4, -6, 18, -9, 18); g.bezierCurveTo(-12, 18, -13, 8, -13, 0); g.closePath(); fs(g, mix(k.paper, '#ffffff', 0.4), 1.6); ell(g, 0, 40, 26, 7, k.brass); ell(g, 0, 36, 20, 5, k.steel, 1.4); line(g, 0, -8, 0, -16, INK, 2); g.beginPath(); g.moveTo(0, -42); g.bezierCurveTo(8, -32, 9, -24, 0, -15); g.bezierCurveTo(-9, -24, -8, -32, 0, -42); g.closePath(); fs(g, '#ffcb59', 1.8); },
  bolt(g, k) { poly(g, [[8, -44], [-20, 4], [-3, 4], [-12, 44], [24, -10], [5, -10], [20, -44]]); fs(g, grad(g, 0, -44, 0, 44, [[0, '#fffbe0'], [0.5, k.main], [1, k.dark]]), 2.6); line(g, -22, -24, -30, -30, k.main, 2.5); line(g, 26, 20, 34, 28, k.main, 2.5); line(g, 24, 30, 30, 24, k.main, 2); },
  coins(g, k) { for (let i = 0; i < 4; i++) { const y = 22 - i * 10; rr(g, -22, y - 2, 44, 11, 5); fs(g, k.brass, 2); ell(g, 0, y - 2, 22, 7, mix(k.brass, '#fff', 0.25), 2); } g.save(); g.translate(26, -14); g.rotate(0.4); ell(g, 0, 0, 14, 14, k.brass); ell(g, 0, 0, 9, 9, null, 1.4); line(g, 0, -5, 0, 5, INK, 2); g.restore(); ell(g, 0, -18, 22, 7, mix(k.brass, '#fff', 0.25), 2); drawSchoolGlyphSafe(g, 0, -18, 4, k.main); },
  key(g, k) { g.rotate(-0.6); circ(g, -22, 0, 15, k.brass, 2.4); circ(g, -22, 0, 6, INK, 1.6); rr(g, -8, -4, 48, 8, 2); fs(g, k.brass); poly(g, [[28, 4], [40, 4], [40, 14], [34, 14], [34, 10], [28, 10]]); fs(g, k.brass); poly(g, [[16, 4], [22, 4], [22, 11], [16, 11]]); fs(g, k.brass); line(g, -6, -1, 36, -1, '#fff', 1.2); },
  ledger(g, k) { rr(g, -30, -36, 60, 72, 4); fs(g, k.dark, 2.6); rr(g, -30, -36, 12, 72, 3); fs(g, mix(k.dark, '#000', 0.3)); rr(g, -12, -26, 34, 22, 2); fs(g, k.paper, 1.6); line(g, -6, -20, 16, -20, INK, 1.6); line(g, -6, -14, 10, -14, INK, 1.4); for (let i = 0; i < 4; i++) line(g, -10, 4 + i * 7, 20, 4 + i * 7, k.light, 1.2); poly(g, [[18, 36], [26, 36], [26, 48], [22, 44], [18, 48]]); fs(g, SCAR_BRIGHT, 1.6); rr(g, -34, -6, 6, 12, 2); fs(g, k.brass, 1.4); },
  eye(g, k) { g.beginPath(); g.moveTo(-42, 0); g.quadraticCurveTo(0, -38, 42, 0); g.quadraticCurveTo(0, 38, -42, 0); g.closePath(); fs(g, k.paper, 2.6); g.save(); g.clip(); circ(g, 0, 0, 15, k.main, 2); circ(g, 0, 0, 7, INK, 0); circ(g, -4, -4, 3, '#fff', 0); for (let i = 0; i < 5; i++) { const a = 2.8 + i * 0.18; line(g, -40 * Math.cos(a - 3.1) - 2, 4 * i - 8, -22, 2 * i - 4, SCAR_BRIGHT, 0.9); } g.restore(); for (let i = -2; i <= 2; i++) line(g, i * 12, -22 + Math.abs(i) * 4, i * 15, -32 + Math.abs(i) * 5, INK, 2); },
  hand(g, k) { const skin = mix(k.paper, k.main, 0.25); const fing = [[-17, 34], [-6, 42], [5, 40], [16, 32]]; fing.forEach(([x, h]) => { rr(g, x - 5, -4 - h + 8, 10, h + 8, 5); fs(g, skin, 2); }); rr(g, -22, -6, 44, 38, 8); fs(g, skin, 2.2); g.save(); g.translate(-22, 14); g.rotate(-0.8); rr(g, -6, -24, 12, 28, 6); fs(g, skin, 2); g.restore(); rr(g, -22, -8, 44, 8, 3); g.fillStyle = skin; g.fill(); line(g, -20, 22, 20, 22, '#111', 2); for (let i = 0; i < 6; i++) line(g, -18 + i * 7, 18, -16 + i * 7, 26, '#111', 1.6); },
  mask(g, k) { g.beginPath(); g.moveTo(-24, -22); g.bezierCurveTo(-24, -42, 24, -42, 24, -22); g.bezierCurveTo(24, -8, 16, 4, 8, 8); g.lineTo(0, 42); g.lineTo(-8, 8); g.bezierCurveTo(-16, 4, -24, -8, -24, -22); g.closePath(); fs(g, grad(g, -24, -30, 24, 30, [[0, k.light], [1, k.dark]]), 2.6); circ(g, -11, -20, 8, 'rgba(210,235,240,.9)', 2.2); circ(g, 11, -20, 8, 'rgba(210,235,240,.9)', 2.2); circ(g, -11, -20, 3.5, INK, 0); circ(g, 11, -20, 3.5, INK, 0); line(g, 0, -4, 0, 30, INK, 1.4); line(g, -30, -16, -24, -16, k.brass, 3); line(g, 24, -16, 30, -16, k.brass, 3); },
  jar(g, k) { rr(g, -22, -22, 44, 58, 9); fs(g, 'rgba(225,238,238,.55)', 2.4); g.save(); rr(g, -22, -22, 44, 58, 9); g.clip(); g.fillStyle = k.main; g.fillRect(-24, 2, 48, 36); g.fillStyle = k.light; g.fillRect(-24, 2, 48, 3); g.restore(); rr(g, -14, -32, 28, 12, 2); fs(g, 'rgba(225,238,238,.7)'); rr(g, -17, -42, 34, 11, 3); fs(g, k.brass); circ(g, -8, 14, 3, 'rgba(255,255,255,.5)', 1); circ(g, 6, 22, 2.2, 'rgba(255,255,255,.5)', 1); circ(g, 10, 8, 2, 'rgba(255,255,255,.5)', 1); rr(g, -14, -12, 28, 14, 1); fs(g, k.paper, 1.4); line(g, 0, -10, 0, 0, SCAR_BRIGHT, 2); line(g, -5, -5, 5, -5, SCAR_BRIGHT, 2); },
  gear(g, k) { gearPath(g, 34, 9); fs(g, grad(g, -30, -30, 30, 30, [[0, k.steel], [1, k.steelD]]), 2.6); circ(g, 0, 0, 22, null, 1.6); circ(g, 0, 0, 10, INK, 1.8); circ(g, 0, 0, 4, k.steel, 1); g.save(); g.translate(30, 28); gearPath(g, 17, 6); fs(g, k.main, 2.2); circ(g, 0, 0, 5, INK, 1.4); g.restore(); },
  skull(g, k) { g.beginPath(); g.moveTo(-24, -4); g.bezierCurveTo(-30, -44, 30, -44, 24, -4); g.bezierCurveTo(24, 6, 18, 10, 16, 14); g.lineTo(16, 28); g.lineTo(-16, 28); g.lineTo(-16, 14); g.bezierCurveTo(-18, 10, -24, 6, -24, -4); g.closePath(); fs(g, k.paper, 2.6); ell(g, -10, -6, 7, 8, INK, 0); ell(g, 10, -6, 7, 8, INK, 0); poly(g, [[0, 6], [-4, 14], [4, 14]]); fs(g, INK, 1); for (let i = -2; i <= 2; i++) line(g, i * 6, 18, i * 6, 28, INK, 1.6); g.beginPath(); g.moveTo(14, -30); g.lineTo(8, -20); g.lineTo(12, -14); g.lineTo(6, -8); g.lineWidth = lnw(1.6); g.strokeStyle = SCAR_BRIGHT; g.stroke(); },
  drop(g, k) { g.beginPath(); g.moveTo(0, -42); g.bezierCurveTo(10, -20, 30, -2, 30, 16); g.bezierCurveTo(30, 32, 16, 42, 0, 42); g.bezierCurveTo(-16, 42, -30, 32, -30, 16); g.bezierCurveTo(-30, -2, -10, -20, 0, -42); g.closePath(); fs(g, grad(g, -20, -20, 24, 40, [[0, k.light], [0.4, k.main], [1, k.dark]]), 2.6); ell(g, -12, 12, 5, 9, 'rgba(255,255,255,.4)', 0, 0.3); circ(g, 30, -12, 5, k.main, 1.8); circ(g, 36, 6, 3, k.main, 1.4); },
  thorn(g, k) { g.beginPath(); g.moveTo(-42, 30); g.bezierCurveTo(-20, 10, 10, 18, 42, -20); g.lineWidth = lnw(9); g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); g.lineWidth = lnw(6); g.strokeStyle = k.dark; g.stroke(); [[-24, 18, -34, -8], [-2, 14, -8, -26], [20, 4, 30, 28]].forEach(([x, y, tx, ty]) => { const dx = ty - y, dy = x - tx, l = Math.hypot(dx, dy) || 1; poly(g, [[x - dx / l * 5, y - dy / l * 5], [tx, ty], [x + dx / l * 5, y + dy / l * 5]]); fs(g, k.main, 2); }); poly(g, [[34, -14], [44, -30], [42, -10]]); fs(g, k.main, 2); },
  shield(g, k) { g.beginPath(); g.moveTo(-31, -36); g.lineTo(31, -36); g.lineTo(31, 4); g.bezierCurveTo(31, 24, 12, 36, 0, 44); g.bezierCurveTo(-12, 36, -31, 24, -31, 4); g.closePath(); fs(g, grad(g, -30, -36, 30, 40, [[0, k.steel], [1, k.steelD]]), 2.8); g.beginPath(); g.moveTo(-22, -28); g.lineTo(22, -28); g.lineTo(22, 4); g.bezierCurveTo(22, 18, 8, 28, 0, 34); g.bezierCurveTo(-8, 28, -22, 18, -22, 4); g.closePath(); fs(g, k.main, 1.8); line(g, 0, -28, 0, 34, k.dark, 3); line(g, -22, -6, 22, -6, k.dark, 3); [[-26, -31], [26, -31], [-26, 2], [26, 2]].forEach(([x, y]) => circ(g, x, y, 2.4, k.brass, 1.2)); },
  scales(g, k) { line(g, 0, -34, 0, 34, INK, 7); line(g, 0, -34, 0, 34, k.brass, 4); poly(g, [[-18, 40], [18, 40], [10, 32], [-10, 32]]); fs(g, k.brass); g.save(); g.rotate(0.12); line(g, -34, -30, 34, -30, INK, 6); line(g, -34, -30, 34, -30, k.brass, 3); circ(g, 0, -30, 4, k.brass, 1.6); [[-34, 1], [34, -1]].forEach(([x, s]) => { g.save(); g.translate(x, -30); g.rotate(-0.12); line(g, 0, 0, -14, 30, INK, 1.4); line(g, 0, 0, 14, 30, INK, 1.4); g.beginPath(); g.moveTo(-17, 30); g.lineTo(17, 30); g.bezierCurveTo(14, 42, -14, 42, -17, 30); g.closePath(); fs(g, s > 0 ? k.main : k.brass, 2); g.restore(); }); g.restore(); },
  bell(g, k) { g.beginPath(); g.moveTo(-28, 24); g.bezierCurveTo(-24, 14, -18, 0, -16, -16); g.bezierCurveTo(-14, -34, 14, -34, 16, -16); g.bezierCurveTo(18, 0, 24, 14, 28, 24); g.closePath(); fs(g, grad(g, -24, -30, 24, 24, [[0, mix(k.brass, '#fff', 0.35)], [1, BRASS_D]]), 2.6); circ(g, 0, -34, 4, null, 2.2); rr(g, -30, 22, 60, 6, 3); fs(g, k.brass); circ(g, 0, 33, 5, k.dark, 1.8); g.beginPath(); g.arc(0, 0, 40, -0.35, 0.35 + 0); g.lineWidth = lnw(2); g.strokeStyle = k.main; g.stroke(); g.beginPath(); g.arc(0, 0, 40, 2.8, 3.5); g.stroke(); },
  rope(g, k) { const tan = '#b89a68'; for (let i = 0; i < 3; i++) { const rx = 32 - i * 5, ry = 20 - i * 3, cy = -4 + i * 6; ell(g, 0, cy, rx, ry, null, 0); g.lineWidth = lnw(11); g.strokeStyle = INK; g.stroke(); } for (let i = 0; i < 3; i++) { const rx = 32 - i * 5, ry = 20 - i * 3, cy = -4 + i * 6; ell(g, 0, cy, rx, ry, null, 0); g.lineWidth = lnw(7.5); g.strokeStyle = tan; g.stroke(); setDash(g, [3, 4]); g.lineWidth = lnw(7.5); g.strokeStyle = '#7a6238'; g.stroke(); setDash(g, []); } g.beginPath(); g.moveTo(30, 12); g.bezierCurveTo(40, 26, 20, 38, 30, 44); g.lineWidth = lnw(11); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(7.5); g.strokeStyle = tan; g.stroke(); line(g, 28, 43, 36, 46, k.main, 3); },
  spiral(g, k) { for (let pass = 2; pass >= 0; pass--) { g.save(); g.translate(pass * 5, pass * 4); g.beginPath(); for (let a = 0; a < 17; a += 0.15) { const r = 2 + a * 2.2; const px = Math.cos(a) * r, py = Math.sin(a) * r; a ? g.lineTo(px, py) : g.moveTo(px, py); } g.globalAlpha = pass === 0 ? 1 : 0.35; g.lineWidth = lnw(8); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(4.5); g.strokeStyle = pass ? k.light : k.main; g.stroke(); g.restore(); } g.globalAlpha = 1; },
  papers(g, k) { [[-8, 6, -0.18], [4, 2, 0.06], [-2, -4, 0.2]].forEach(([dx, dy, rot], i) => { g.save(); g.translate(dx, dy); g.rotate(rot); rr(g, -24, -32, 48, 64, 2); fs(g, i === 2 ? k.paper : mix(k.paper, '#8a8070', 0.12 * (3 - i)), 2); if (i === 2) { for (let j = 0; j < 6; j++) line(g, -16, -22 + j * 8, 16 - (j % 3) * 5, -22 + j * 8, 'rgba(43,30,26,.55)', 1.6); g.save(); g.translate(8, 14); g.rotate(-0.3); ell(g, 0, 0, 11, 8, null, 2); g.strokeStyle = SCAR_BRIGHT; g.lineWidth = lnw(2.4); g.stroke(); g.restore(); } g.restore(); }); rr(g, 14, -38, 7, 22, 3); g.lineWidth = lnw(2.4); g.strokeStyle = k.steelD; g.stroke(); },
  hourglass(g, k) { rr(g, -24, -42, 48, 7, 2); fs(g, k.brass); rr(g, -24, 35, 48, 7, 2); fs(g, k.brass); g.beginPath(); g.moveTo(-18, -35); g.lineTo(18, -35); g.lineTo(3, 0); g.lineTo(18, 35); g.lineTo(-18, 35); g.lineTo(-3, 0); g.closePath(); fs(g, 'rgba(225,238,238,.5)', 2.4); poly(g, [[-13, -33], [13, -33], [3, -8], [-3, -8]]); fs(g, k.main, 0); poly(g, [[-16, 33], [16, 33], [8, 18], [-8, 18]]); fs(g, k.main, 0); line(g, 0, -6, 0, 18, k.main, 1.8); line(g, -22, -35, -22, 35, INK, 3); line(g, 22, -35, 22, 35, INK, 3); },
  needle(g, k) { g.rotate(-0.4); g.beginPath(); g.arc(0, 8, 30, 3.5, 6.0); g.lineWidth = lnw(5); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(2.6); g.strokeStyle = k.steel; g.stroke(); circ(g, 28, -4, 3, INK, 1.2); g.beginPath(); g.moveTo(28, -4); g.bezierCurveTo(40, -16, 20, -30, 30, -38); g.moveTo(-20, 8); g.lineWidth = lnw(2); g.strokeStyle = k.main; g.stroke(); g.beginPath(); g.moveTo(-34, 28); g.lineTo(-12, 36); g.lineTo(10, 28); g.lineTo(32, 36); g.lineWidth = lnw(2.2); g.strokeStyle = '#111'; setDash(g, [5, 3]); g.stroke(); setDash(g, []); },
  bone(g, k) { g.rotate(-0.6); rr(g, -32, -6, 64, 12, 5); fs(g, k.paper); [[-36, -9], [-36, 9], [36, -9], [36, 9]].forEach(([x, y]) => circ(g, x, y, 8, k.paper, 2.4)); rr(g, -30, -4, 60, 8, 3); g.fillStyle = k.paper; g.fill(); line(g, -20, -1, 18, -1, '#fff', 1.4); line(g, 6, 3, 14, 3, 'rgba(120,90,60,.5)', 1.4); },
  clamp(g, k) { circ(g, -26, -20, 10, null, 0); [[-1, 1], [1, -1]].forEach(([s]) => { g.save(); g.scale(1, s); g.beginPath(); g.moveTo(-36, -26); g.lineTo(-24, -14); g.lineTo(40, 14); g.lineTo(40, 21); g.lineTo(20, 20); g.lineTo(-30, -8); g.closePath(); fs(g, k.steel, 2.4); g.restore(); }); ell(g, -34, -24, 9, 9, null, 0); ell(g, -34, -24, 8, 8, null, 2.6); ell(g, -34, 24, 8, 8, null, 2.6); for (let i = 0; i < 4; i++) line(g, 24 + i * 4, 4, 24 + i * 4, 14, INK, 1.2); circ(g, -6, 0, 4, k.main, 1.8); },
  crown(g, k) { poly(g, [[-34, 22], [-34, -14], [-18, 6], [0, -28], [18, 6], [34, -14], [34, 22]]); fs(g, grad(g, 0, -28, 0, 24, [[0, mix(k.brass, '#fff', 0.4)], [1, k.brass]]), 2.6); rr(g, -36, 22, 72, 10, 3); fs(g, k.brass, 2.4); circ(g, 0, -30, 5, k.main, 2); circ(g, -34, -16, 4, k.main, 1.8); circ(g, 34, -16, 4, k.main, 1.8); [[-16, 27], [0, 27], [16, 27]].forEach(([x, y], i) => { poly(g, [[x, y - 3], [x + 3, y], [x, y + 3], [x - 3, y]]); fs(g, i === 1 ? SCAR_BRIGHT : k.main, 1.2); }); },
  chain(g, k) { for (let i = 0; i < 4; i++) { g.save(); g.translate(-24 + i * 16, -14 + i * 9); g.rotate(i % 2 ? 0.9 : -0.1); const w = i % 2 ? 7 : 14; rr(g, -w, -7, w * 2, 14, 7); g.lineWidth = lnw(7); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(4); g.strokeStyle = k.steel; g.stroke(); g.restore(); } },
  // ----- new motifs for the Thread / affliction content -----
  knot(g, k) { // overhand trefoil knot with two frayed tails
    const pt = (t) => [Math.sin(t) * 9 + Math.sin(2 * t) * 18, Math.cos(t) * 9 - Math.cos(2 * t) * 18];
    const seg = (a, b) => () => { for (let t = a; t <= b; t += 0.07) { const p = pt(t); t === a ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); } };
    cord(g, 5, k.main, seg(0, 6.3)); cord(g, 5, k.main, seg(0.5, 1.5)); cord(g, 5, k.main, seg(2.6, 3.6)); cord(g, 5, k.main, seg(4.7, 5.7));
    cord(g, 3, k.main, () => { g.moveTo(-14, 22); g.bezierCurveTo(-26, 34, -34, 30, -40, 40); });
    cord(g, 3, k.dark, () => { g.moveTo(16, 24); g.bezierCurveTo(26, 36, 36, 30, 42, 38); });
    for (let i = 0; i < 3; i++) { line(g, -40 - i, 40 - i, -44 - i, 36 - i * 2, SEPIA, 0.9); line(g, 42, 38, 46 + i, 34 + i * 2, SEPIA, 0.9); }
  },
  scissors(g, k) { // tailor's shears, open, with a cut thread
    g.rotate(-0.55);
    [1, -1].forEach((s) => {
      g.save(); g.rotate(s * 0.17);
      poly(g, [[-4, -3.4], [46, s > 0 ? -0.5 : 0.5], [-4, 3.4]]); fs(g, k.steel, 2);
      line(g, 2, s > 0 ? -1.4 : 1.4, 38, 0, '#fff', 1);
      rr(g, -26, -2.5, 24, 5, 2); fs(g, k.steelD, 1.4);
      ell(g, -34, 0, 10, 7.5, null, 2.6); g.lineWidth = lnw(2.4); g.strokeStyle = BRASS; g.stroke();
      g.restore();
    });
    circ(g, -2, 0, 3.4, k.brass, 1.6);
    g.rotate(0.55); cord(g, 2.2, k.main, () => { g.moveTo(-36, 34); g.bezierCurveTo(-20, 28, -8, 36, 4, 30); }); cord(g, 2.2, k.main, () => { g.moveTo(14, 30); g.bezierCurveTo(26, 24, 34, 34, 42, 28); });
  },
  sewneedle(g, k) { // straight needle, eye threaded, thread running through a cloth strip
    g.save(); g.translate(0, 14); poly(g, [[-42, -6], [42, -8], [42, 8], [-42, 6]]); fs(g, k.paper, 1.8, 1);
    for (let i = -38; i < 40; i += 6) line(g, i, -3, i + 3, 3, 'rgba(74,48,34,.5)', 0.8);
    cord(g, 1.8, '#0e0e0e', () => { for (let i = -34; i < 26; i += 8) { g.moveTo(i, -5); g.lineTo(i + 4, 5); } }); g.restore();
    g.save(); g.rotate(-0.62); g.translate(0, -6);
    poly(g, [[-44, -2.2], [-36, -2.2], [-36, 2.2], [-44, 2.2]]); fs(g, k.steelD, 1.2);
    ell(g, -40, 0, 1.6, 0.9, SEPIA, 0);
    poly(g, [[-36, -1.6], [44, -0.4], [48, 0], [44, 0.4], [-36, 1.6]]); fs(g, k.steel, 1.6);
    line(g, -30, -0.6, 40, -0.1, '#fff', 0.8);
    g.restore();
    cord(g, 2.6, k.main, () => { g.moveTo(-34, -28); g.bezierCurveTo(-48, -8, -10, 0, -26, 18); });
  },
  tangle(g, k) { // a tangled loop of cord: six overlapping rings
    const r = rngOf('tangle' + (k.main || ''));
    for (let i = 0; i < 6; i++) {
      const cx = (r() - 0.5) * 14, cy = (r() - 0.5) * 10, rx = 16 + r() * 18, ry = 10 + r() * 16, a = r() * 3.14;
      cord(g, 3.6, i % 2 ? k.main : k.dark, () => { g.ellipse ? g.ellipse(cx, cy, rx, ry, a, 0, 6.2832) : g.arc(cx, cy, rx, 0, 6.28); });
    }
    circ(g, 0, 0, 5, k.brass, 1.6);
    cord(g, 3, k.main, () => { g.moveTo(14, 18); g.bezierCurveTo(30, 40, 40, 30, 44, 42); });
  },
  poisonvial(g, k) { // stoppered flask, green liquid, skull label
    const tox = '#7fa83a';
    g.beginPath(); g.moveTo(-8, -26); g.lineTo(-8, -10); g.bezierCurveTo(-34, 6, -30, 36, 0, 38); g.bezierCurveTo(30, 36, 34, 6, 8, -10); g.lineTo(8, -26); g.closePath();
    g.fillStyle = 'rgba(225,238,238,.35)'; g.fill();
    g.save(); g.clip(); g.fillStyle = tox; g.fillRect(-40, 6, 80, 40); g.fillStyle = '#c4e07a'; g.fillRect(-40, 6, 80, 2.5);
    circ(g, -9, 20, 3, 'rgba(255,255,255,.5)', 1); circ(g, 8, 26, 2, 'rgba(255,255,255,.5)', 1); circ(g, 4, 14, 1.6, 'rgba(255,255,255,.5)', 1); g.restore();
    g.beginPath(); g.moveTo(-8, -26); g.lineTo(-8, -10); g.bezierCurveTo(-34, 6, -30, 36, 0, 38); g.bezierCurveTo(30, 36, 34, 6, 8, -10); g.lineTo(8, -26); g.closePath(); g.lineWidth = lnw(2.6); g.strokeStyle = SEPIA; g.stroke();
    line(g, -22, 6, -20, 24, 'rgba(255,255,255,.7)', 2.2);
    rr(g, -10, -36, 20, 11, 2); fs(g, k.brass, 1.8);
    rr(g, -14, 6, 28, 17, 2); fs(g, k.paper, 1.3, 1);
    g.beginPath(); g.arc(0, 11, 4.2, 0, 6.3); g.fillStyle = INK; g.fill(); line(g, -4, 19, 4, 19, INK, 1.4); line(g, -6, 21, 6, 13, INK, 0.9); line(g, -6, 13, 6, 21, INK, 0.9);
    g.beginPath(); g.moveTo(26, 30); g.bezierCurveTo(30, 36, 28, 42, 30, 46); g.lineWidth = lnw(2.4); g.strokeStyle = tox; g.stroke(); circ(g, 30, 46, 2.6, tox, 1.2);
  },
  crackedshield(g, k) { // shield split by a gilded crack with a chip falling away
    g.beginPath(); g.moveTo(-31, -36); g.lineTo(31, -36); g.lineTo(31, 4); g.bezierCurveTo(31, 24, 12, 36, 0, 44); g.bezierCurveTo(-12, 36, -31, 24, -31, 4); g.closePath();
    fs(g, k.steel, 2.8);
    g.save(); g.clip(); g.fillStyle = k.main; g.beginPath(); g.moveTo(-22, -28); g.lineTo(22, -28); g.lineTo(22, 4); g.lineTo(0, 34); g.lineTo(-22, 4); g.closePath(); g.fill(); g.restore();
    g.beginPath(); g.moveTo(-22, -28); g.lineTo(22, -28); g.lineTo(22, 4); g.bezierCurveTo(22, 18, 8, 28, 0, 34); g.bezierCurveTo(-8, 28, -22, 18, -22, 4); g.closePath(); fs(g, null, 1.6);
    const crack = () => { g.moveTo(8, -38); g.lineTo(-2, -20); g.lineTo(6, -8); g.lineTo(-6, 6); g.lineTo(2, 20); g.lineTo(-8, 34); };
    g.beginPath(); crack(); g.lineWidth = lnw(5); g.strokeStyle = INK; g.stroke(); g.beginPath(); crack(); g.lineWidth = lnw(2); g.strokeStyle = '#f5e6a8'; g.stroke();
    poly(g, [[22, 22], [34, 14], [38, 30], [28, 36]]); fs(g, k.steelD, 1.6);
    [[-26, -31], [26, -31]].forEach(([x, y]) => circ(g, x, y, 2.4, k.brass, 1.2));
  },
  pulledstitch(g, k) { // a stitch drawn up out of the cloth, the weave puckering around it
    poly(g, [[-40, -4], [40, -8], [42, 34], [-38, 36]]); fs(g, k.paper, 2, 1);
    for (let i = -34; i < 38; i += 7) { line(g, i, -2, i + 3, 6, 'rgba(74,48,34,.45)', 0.9); }
    for (let i = -36; i < 36; i += 12) { if (Math.abs(i - 6) < 9) continue; cord(g, 1.8, '#0e0e0e', () => { g.moveTo(i, 14); g.lineTo(i + 8, 22); }); }
    cord(g, 2.4, '#0e0e0e', () => { g.moveTo(-6, 18); g.bezierCurveTo(-4, -10, 16, -34, 30, -36); });
    cord(g, 2.4, '#0e0e0e', () => { g.moveTo(14, 18); g.bezierCurveTo(10, 0, 22, -22, 30, -36); });
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(4, 20, 8 + i * 5, 0.2 + i * 0.1, 2.9 - i * 0.1); g.lineWidth = lnw(0.9); g.strokeStyle = 'rgba(74,48,34,.55)'; g.stroke(); }
    circ(g, 4, 20, 2.6, INK, 0); circ(g, 31, -36, 3, k.main, 1.4);
  },
  hammerrivet(g, k) { // hammer coming down on a brass rivet through a plate
    rr(g, -38, 16, 76, 14, 2); fs(g, k.steel, 2.2);
    for (let i = -30; i < 36; i += 14) circ(g, i, 23, 1.6, k.steelD, 0.8);
    poly(g, [[-5, 4], [5, 4], [4, 16], [-4, 16]]); fs(g, k.brass, 1.4);
    g.beginPath(); g.arc(0, 4, 9, Math.PI, 0); g.closePath(); fs(g, k.brass, 2);
    circ(g, 0, 16, 0, null, 0);
    g.save(); g.translate(14, -22); g.rotate(0.62);
    rr(g, -3.5, -2, 7, 60, 3); fs(g, '#8a5a30', 1.8, 1); line(g, -1, 4, -1, 50, 'rgba(255,230,190,.45)', 1);
    rr(g, -20, -22, 40, 20, 3); fs(g, k.steel, 2.4); line(g, -16, -17, 14, -17, '#fff', 1.2);
    rr(g, 12, -22, 12, 20, 2); fs(g, k.steelD, 1.8);
    g.restore();
    for (let i = 0; i < 6; i++) { const a = -2.6 + i * 0.5; line(g, Math.cos(a) * 14, 2 + Math.sin(a) * 12, Math.cos(a) * 24, 2 + Math.sin(a) * 20, k.main, 1.8); }
  },
  // ----- Round 6b: one picture per idea (shears, spools, looms, purses, jars, forks ...) -----
  shears(g, k) { // long tailor's shears, closed, blades laid on a cut of cloth
    poly(g, [[-40, 14], [40, 8], [42, 34], [-38, 36]]); fs(g, k.paper, 1.8, 1);
    for (let i = -34; i < 38; i += 8) line(g, i, 16, i + 2, 32, 'rgba(74,48,34,.35)', 0.8);
    g.rotate(-0.42);
    poly(g, [[-6, -5], [48, 0], [-6, 5]]); fs(g, k.steel, 2); poly(g, [[-6, -2], [44, 0.5], [-6, 6]]); fs(g, k.steelD, 1.4);
    line(g, 2, -2, 40, -0.2, '#fff', 1);
    circ(g, -8, 0, 3.4, k.brass, 1.6);
    ell(g, -24, -6, 10, 7, null, 2.6); g.lineWidth = lnw(2.4); g.strokeStyle = BRASS; g.stroke();
    ell(g, -26, 10, 8, 6, null, 2.6); g.lineWidth = lnw(2.4); g.strokeStyle = BRASS; g.stroke();
  },
  spool(g, k) { // wooden spool wound with thread, the end trailing off
    ell(g, 0, 28, 28, 7, k.brass, 2); rr(g, -17, -22, 34, 50, 2); fs(g, k.main, 2);
    for (let i = 0; i < 9; i++) line(g, -17, -18 + i * 5.4, 17, -15 + i * 5.4, 'rgba(43,30,26,.4)', 1);
    ell(g, 0, -22, 28, 7, k.brass, 2); ell(g, 0, -24, 28, 7, mix(k.brass, '#fff', 0.3), 1.6);
    line(g, -14, -26, 14, -26, 'rgba(255,255,255,.5)', 1);
    cord(g, 2.2, k.main, () => { g.moveTo(17, 4); g.bezierCurveTo(34, 10, 28, 30, 40, 34); });
    circ(g, 40, 34, 2, k.dark, 1);
  },
  bobbin(g, k) { // sewing-machine bobbin, a slotted brass reel with a loose tail
    ell(g, 0, 22, 24, 8, k.brass, 2); rr(g, -9, -12, 18, 34, 2); fs(g, k.steel, 1.8);
    rr(g, -18, -10, 36, 28, 3); fs(g, k.dark, 2);
    for (let i = 0; i < 6; i++) line(g, -18, -6 + i * 4.4, 18, -4 + i * 4.4, alpha(k.light, 0.55), 1.2);
    ell(g, 0, -12, 24, 8, k.brass, 2); circ(g, 0, -12, 4, INK, 1.4);
    poly(g, [[-4, -22], [4, -22], [4, -16], [-4, -16]]); fs(g, k.steelD, 1);
    cord(g, 2, k.main, () => { g.moveTo(18, 6); g.bezierCurveTo(34, 2, 30, -20, 40, -26); });
  },
  threader(g, k) { // wire needle threader, a diamond loop passing a thread through the eye
    g.rotate(-0.35);
    rr(g, -44, -3, 18, 6, 3); fs(g, k.brass, 1.6);
    line(g, -26, 0, 2, 0, INK, 3); line(g, -26, 0, 2, 0, k.steel, 1.4);
    poly(g, [[2, 0], [20, -9], [36, 0], [20, 9]]); g.lineWidth = lnw(3); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(1.4); g.strokeStyle = k.steel; g.stroke();
    poly(g, [[22, 14], [46, 14], [46, 17], [22, 17]]); fs(g, k.steel, 1.4); ell(g, 38, 15.5, 3, 1.3, INK, 0);
    cord(g, 2, k.main, () => { g.moveTo(-20, -16); g.bezierCurveTo(0, -24, 14, 0, 38, 15.5); });
  },
  loom(g, k) { // small frame loom: warp threads, a shuttle, a woven band
    rr(g, -38, -34, 76, 70, 3); fs(g, '#8a5a30', 2.4, 1); rr(g, -31, -27, 62, 56, 1); fs(g, k.paper, 1.4, 1);
    for (let i = -26; i <= 26; i += 6.5) line(g, i, -27, i, 29, 'rgba(43,30,26,.85)', 1.2);
    for (let r = 0; r < 4; r++) for (let i = -26; i < 26; i += 6.5) { const y = 8 + r * 5; line(g, i + (r % 2 ? 3 : 0), y, i + 6.5 + (r % 2 ? 3 : 0), y, r % 2 ? k.main : k.dark, 3.4); }
    g.save(); g.translate(2, -8); g.rotate(-0.1); poly(g, [[-16, 0], [-10, -5], [10, -5], [16, 0], [10, 5], [-10, 5]]); fs(g, '#c9a15a', 2); line(g, -9, 0, 9, 0, k.main, 2); g.restore();
    [[-38, -34], [38, -34], [-38, 36], [38, 36]].forEach(([x, y]) => circ(g, x, y, 2.4, k.brass, 1.2));
  },
  crossstitch(g, k) { // cross-stitched panel on a gridded cloth, a needle left in it
    poly(g, [[-40, -30], [40, -30], [40, 34], [-40, 34]]); fs(g, k.paper, 2.2, 1);
    for (let i = -34; i <= 34; i += 8) line(g, i, -26, i, 30, 'rgba(74,48,34,.2)', 0.7);
    for (let j = -22; j <= 26; j += 8) line(g, -36, j, 36, j, 'rgba(74,48,34,.2)', 0.7);
    const X = [[-26, -14], [-18, -14], [-10, -6], [-2, 2], [6, 10], [14, 2], [22, -6], [-2, -14], [-10, 10], [-18, 18], [14, 18], [22, 10]];
    X.forEach(([x, y], i) => { const c = i % 3 ? k.main : INK; line(g, x - 3.2, y - 3.2, x + 3.2, y + 3.2, c, 2.2); line(g, x + 3.2, y - 3.2, x - 3.2, y + 3.2, c, 2.2); });
    g.save(); g.translate(26, 22); g.rotate(-0.9); rr(g, -2, -22, 4, 28, 1.5); fs(g, k.steel, 1.2); ell(g, 0, -17, 1.2, 3, INK, 0); g.restore();
  },
  thimble(g, k) { // brass thimble pitted with dimples, a needle resting beside
    g.beginPath(); g.moveTo(-22, 32); g.lineTo(-18, 2); g.bezierCurveTo(-18, -22, 18, -22, 18, 2); g.lineTo(22, 32); g.closePath();
    fs(g, grad(g, -20, -20, 20, 30, [[0, mix(k.brass, '#fff', 0.35)], [1, BRASS_D]]), 2.6);
    rr(g, -26, 28, 52, 8, 3); fs(g, k.brass, 2);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = -11 + c * 7.4 + (r % 2 ? 3 : 0), y = -8 + r * 8; if (Math.abs(x) < 17 - Math.max(0, 2 - r) * 3) circ(g, x, y, 1.5, BRASS_D, 0.4); }
    g.save(); g.translate(30, -12); g.rotate(0.9); rr(g, -1.6, -28, 3.2, 44, 1.5); fs(g, k.steel, 1.2); g.restore();
  },
  hoop(g, k) { // embroidery hoop gripping stretched linen with a half-sewn leaf
    circ(g, 0, 0, 34, k.paper, 1.4);
    for (let i = -28; i < 30; i += 7) line(g, i, -18, i + 2, 18, 'rgba(74,48,34,.14)', 0.8);
    cord(g, 2.6, k.main, () => { g.moveTo(-18, 14); g.bezierCurveTo(-14, -14, 8, -22, 20, -14); g.bezierCurveTo(14, 4, 4, 14, -18, 14); });
    cord(g, 1.8, k.dark, () => { g.moveTo(-14, 10); g.lineTo(12, -10); });
    g.beginPath(); g.arc(0, 0, 34, 0, 6.3); g.lineWidth = lnw(7); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(4.4); g.strokeStyle = '#a97b45'; g.stroke();
    rr(g, 28, -8, 14, 16, 2); fs(g, k.brass, 1.8); line(g, 31, 0, 39, 0, INK, 1.4);
  },
  tapestry(g, k) { // woven hanging on a rod with a fringe and a pictured crest
    rr(g, -42, -36, 84, 6, 3); fs(g, '#8a5a30', 2); circ(g, -44, -33, 4, k.brass, 1.4); circ(g, 44, -33, 4, k.brass, 1.4);
    poly(g, [[-34, -30], [34, -30], [34, 28], [0, 38], [-34, 28]]); fs(g, k.dark, 2.4);
    poly(g, [[-26, -24], [26, -24], [26, 22], [0, 30], [-26, 22]]); fs(g, k.paper, 1.4, 1);
    for (let i = -22; i < 24; i += 6) line(g, i, -24, i, 24, 'rgba(74,48,34,.2)', 0.8);
    poly(g, [[0, -16], [14, 0], [0, 18], [-14, 0]]); fs(g, k.main, 1.8);
    circ(g, 0, 0, 4, k.brass, 1.2); line(g, -14, 0, 14, 0, INK, 1); line(g, 0, -16, 0, 18, INK, 1);
    for (let i = -28; i <= 28; i += 7) line(g, i, 29 + Math.abs(i) * -0.15, i, 37 - Math.abs(i) * 0.15, k.brass, 1.8);
  },
  pinking(g, k) { // pinking-sheared zigzag edge with a pin trail
    g.beginPath(); g.moveTo(-42, 6); for (let i = 0; i < 14; i++) { g.lineTo(-42 + i * 6 + 3, 14); g.lineTo(-42 + i * 6 + 6, 6); } g.lineTo(42, -30); g.lineTo(-42, -30); g.closePath(); fs(g, k.paper, 2.2, 1);
    for (let i = -34; i < 40; i += 8) line(g, i, -22, i + 4, -2, 'rgba(74,48,34,.28)', 0.9);
    [[-26, -10], [-4, -16], [20, -8]].forEach(([x, y]) => { line(g, x, y, x + 12, y + 22, k.steel, 1.6); circ(g, x, y, 3.4, k.brass, 1.4); });
    cord(g, 1.8, k.main, () => { g.moveTo(-40, 24); g.lineTo(-30, 30); g.lineTo(-20, 24); g.lineTo(-10, 30); g.lineTo(0, 24); g.lineTo(10, 30); g.lineTo(20, 24); g.lineTo(30, 30); g.lineTo(40, 24); });
  },
  seamripper(g, k) { // seam ripper, forked steel hook in a wooden handle, cut stitches beside it
    g.save(); g.rotate(-0.5);
    rr(g, -42, -6, 34, 12, 6); fs(g, '#8a5a30', 2, 1); line(g, -38, -2, -14, -2, 'rgba(255,230,190,.5)', 1.2);
    rr(g, -10, -3, 8, 6, 1); fs(g, k.brass, 1.2);
    line(g, -2, 0, 22, 0, INK, 3.6); line(g, -2, 0, 22, 0, k.steel, 1.8);
    g.beginPath(); g.moveTo(22, 0); g.bezierCurveTo(34, -2, 40, -12, 32, -18); g.lineWidth = lnw(3.6); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(1.8); g.strokeStyle = k.steel; g.stroke();
    poly(g, [[22, 0], [36, 8], [38, 3], [30, -3]]); fs(g, k.steel, 1.6); circ(g, 33, -18, 3.2, k.main, 1.4);
    g.restore();
    for (let i = 0; i < 4; i++) cord(g, 1.8, k.main, () => { g.moveTo(-34 + i * 11, 28); g.lineTo(-27 + i * 11, 22 + (i % 2) * 6); });
  },
  fusewire(g, k) { // spool of fuse wire with a lit end throwing sparks
    ell(g, -14, 28, 24, 6, k.brass, 1.8); rr(g, -34, -4, 40, 32, 2); fs(g, k.steel, 2, 1);
    for (let i = 0; i < 6; i++) line(g, -34, -1 + i * 5.2, 6, 1 + i * 5.2, 'rgba(43,30,26,.4)', 1);
    ell(g, -14, -4, 24, 6, mix(k.brass, '#fff', 0.3), 1.8);
    cord(g, 2, '#6c675e', () => { g.moveTo(6, 10); g.bezierCurveTo(20, 12, 22, -14, 30, -16); });
    circ(g, 31, -18, 5, '#ffcb59', 1.4); circ(g, 31, -18, 2, '#fffbe0', 0);
    [[-0.9, 12], [-0.2, 14], [0.5, 12], [-1.6, 10]].forEach(([a, l]) => line(g, 31 + Math.cos(a) * 7, -18 + Math.sin(a) * 7, 31 + Math.cos(a) * (7 + l), -18 + Math.sin(a) * (7 + l), k.main, 1.8));
  },
  anvil(g, k) { // tempering anvil on a block, hammer resting above the face
    rr(g, -20, 20, 40, 18, 2); fs(g, '#8a5a30', 2.2, 1);
    g.beginPath(); g.moveTo(-34, -6); g.lineTo(30, -6); g.lineTo(42, -14); g.lineTo(38, 4); g.lineTo(18, 6); g.lineTo(14, 20); g.lineTo(-14, 20); g.lineTo(-12, 6); g.lineTo(-30, 6); g.closePath();
    fs(g, grad(g, -30, -10, 30, 20, [[0, k.steel], [1, k.steelD]]), 2.6);
    line(g, -30, -4, 28, -4, '#fff', 1.4); circ(g, 0, -1, 1.6, INK, 0);
    g.save(); g.translate(-8, -12); g.rotate(-0.5); rr(g, -3, -34, 6, 34, 2); fs(g, '#8a5a30', 1.6, 1); rr(g, -13, -46, 26, 13, 2); fs(g, k.steel, 2); g.restore();
    for (let i = 0; i < 5; i++) { const a = -0.3 - i * 0.35; line(g, 30 + Math.cos(a) * 6, -10 + Math.sin(a) * 6, 30 + Math.cos(a) * 14, -10 + Math.sin(a) * 14, k.main, 1.8); }
  },
  purse(g, k) { // drawstring coin purse, fat and bulging, a coin spilling out
    g.beginPath(); g.moveTo(-10, -22); g.bezierCurveTo(-40, -6, -40, 38, 0, 38); g.bezierCurveTo(40, 38, 40, -6, 10, -22); g.closePath();
    fs(g, grad(g, -30, -20, 30, 36, [[0, mix(k.main, '#fff', 0.2)], [1, k.dark]]), 2.8);
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-8 + i * 5, -20); g.bezierCurveTo(-20 + i * 9, 0, -22 + i * 12, 14, -14 + i * 9, 34); g.lineWidth = lnw(0.9); g.strokeStyle = 'rgba(43,30,26,.45)'; g.stroke(); }
    poly(g, [[-14, -22], [14, -22], [18, -34], [8, -28], [0, -36], [-8, -28], [-18, -34]]); fs(g, k.dark, 2);
    cord(g, 2, k.brass, () => { g.moveTo(-12, -20); g.bezierCurveTo(-4, -14, 4, -14, 12, -20); });
    ell(g, 32, 30, 10, 10, k.brass, 2); ell(g, 32, 30, 6, 6, null, 1.2); line(g, 32, 26, 32, 34, INK, 1.4);
    drawSchoolGlyphSafe(g, 0, 12, 5, k.brass);
  },
  mirror(g, k) { // hand mirror in a brass frame, the glass holding a pale reflection
    g.save(); g.rotate(0.35);
    rr(g, -5, 14, 10, 30, 5); fs(g, k.brass, 2);
    ell(g, 0, -8, 25, 29, k.brass, 2.8);
    ell(g, 0, -8, 20, 24, 'rgba(210,232,238,.9)', 1.8);
    g.save(); g.beginPath(); g.ellipse ? g.ellipse(0, -8, 20, 24, 0, 0, 6.3) : g.arc(0, -8, 20, 0, 6.3); g.clip();
    line(g, -26, 6, -2, -30, 'rgba(255,255,255,.7)', 4); line(g, -14, 14, 6, -20, 'rgba(255,255,255,.5)', 2);
    g.globalAlpha = 0.55; poly(g, [[-8, -16], [8, -16], [10, 4], [0, 12], [-10, 4]]); g.fillStyle = k.main; g.fill(); g.globalAlpha = 1; g.restore();
    [[-24, -26], [24, -26], [0, -36]].forEach(([x, y]) => circ(g, x, y, 2.4, k.main, 1.2));
    g.restore();
  },
  batteryjar(g, k) { // Leyden-style jar: glass, foil wrap, a brass rod and ball throwing a spark
    rr(g, -22, -10, 44, 48, 6); fs(g, 'rgba(225,238,238,.55)', 2.4);
    rr(g, -22, 8, 44, 24, 2); fs(g, k.steel, 1.6, 1);
    for (let i = 0; i < 5; i++) line(g, -22 + i * 11, 8, -22 + i * 11, 32, 'rgba(255,255,255,.4)', 1);
    rr(g, -16, -20, 32, 12, 3); fs(g, '#8a5a30', 1.8, 1);
    line(g, 0, -20, 0, -36, INK, 4); line(g, 0, -20, 0, -36, k.brass, 2); circ(g, 0, -38, 5, k.brass, 1.8);
    poly(g, [[16, -42], [24, -34], [20, -34], [28, -24], [18, -32], [22, -32]]); fs(g, '#fffbe0', 1);
    line(g, 30, -22, 36, -18, k.main, 2); line(g, 26, -44, 34, -48, k.main, 2);
  },
  tuningfork(g, k) { // steel tuning fork with ringing arcs
    rr(g, -4, 6, 8, 34, 4); fs(g, k.steel, 1.8);
    g.beginPath(); g.moveTo(-12, -34); g.lineTo(-12, -2); g.bezierCurveTo(-12, 10, 12, 10, 12, -2); g.lineTo(12, -34); g.lineWidth = lnw(8); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(5); g.strokeStyle = k.steel; g.stroke();
    line(g, -13, -32, -13, -4, '#fff', 1.2);
    for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(0, -20, 22 + j * 8, -0.6, 0.6); g.moveTo(Math.cos(Math.PI - 0.6) * (22 + j * 8), -20 + Math.sin(Math.PI - 0.6) * (22 + j * 8)); g.arc(0, -20, 22 + j * 8, Math.PI - 0.6, Math.PI + 0.6); g.lineWidth = lnw(2); g.strokeStyle = alpha(k.main, 1 - j * 0.25); g.stroke(); }
    circ(g, 0, 40, 3.4, k.brass, 1.4);
  },
  scalpelfan(g, k) { // a fan of three scalpels laid out from one brass pin
    g.save(); g.translate(0, 26);
    [-0.7, 0, 0.7].forEach((a, i) => { g.save(); g.rotate(a); poly(g, [[-3, 6], [3, 6], [3, -26], [0, -62], [-3, -26]]); fs(g, k.steel, 1.8); line(g, -0.8, -50, -0.8, -24, '#fff', 1.1); rr(g, -4, 6, 8, 14, 2); fs(g, i === 1 ? k.main : k.brass, 1.4); g.restore(); });
    g.restore();
    circ(g, 0, 26, 5, k.brass, 1.8);
  },
  belljar(g, k) { // glass bell jar over a specimen on a wooden plinth
    rr(g, -34, 28, 68, 10, 3); fs(g, '#8a5a30', 2.2, 1);
    g.beginPath(); g.moveTo(-26, 28); g.lineTo(-26, -8); g.bezierCurveTo(-26, -40, 26, -40, 26, -8); g.lineTo(26, 28); g.closePath(); fs(g, 'rgba(225,238,238,.38)', 2.4);
    circ(g, 0, -40, 4, k.brass, 1.6);
    line(g, -19, -10, -19, 20, 'rgba(255,255,255,.65)', 2.4);
    g.beginPath(); g.moveTo(-8, 28); g.bezierCurveTo(-12, 10, -4, 4, -4, -8); g.bezierCurveTo(-4, -14, 10, -14, 10, -6); g.bezierCurveTo(10, 8, 14, 16, 12, 28); g.closePath(); fs(g, k.main, 1.8);
    circ(g, 3, -4, 2, INK, 0);
  },
  keyring(g, k) { // iron ring of three keys of different wards
    g.beginPath(); g.arc(0, -14, 14, 0, 6.3); g.lineWidth = lnw(6); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(3); g.strokeStyle = k.steel; g.stroke();
    [[-0.5, 1], [0.15, 0.82], [0.8, 1]].forEach(([a, s], i) => {
      const col = i === 1 ? k.main : k.brass;
      g.save(); g.translate(0, -2); g.rotate(a); circ(g, 0, 0, 7, col, 2); circ(g, 0, 0, 2.6, INK, 0);
      rr(g, -2.4, 6, 4.8, 34 * s, 1.5); fs(g, col, 1.4);
      poly(g, [[2.4, 28 * s], [8, 28 * s], [8, 33 * s], [2.4, 33 * s]]); fs(g, col, 1.2);
      poly(g, [[-2.4, 36 * s], [-7, 36 * s], [-7, 40 * s], [-2.4, 40 * s]]); fs(g, col, 1.2); g.restore();
    });
  },
  sutureknot(g, k) { // a surgeon's square knot pulled tight over a closed incision
    poly(g, [[-42, -6], [42, -8], [42, 30], [-42, 32]]); fs(g, mix(k.paper, SCAR_BRIGHT, 0.2), 2, 1);
    g.beginPath(); g.moveTo(-40, 12); g.bezierCurveTo(-10, 6, 10, 18, 40, 10); g.lineWidth = lnw(4); g.strokeStyle = '#7a1a2a'; g.stroke();
    for (let i = -34; i < 36; i += 12) cord(g, 2, '#0e0e0e', () => { g.moveTo(i, 2); g.lineTo(i + 3, 22); });
    cord(g, 3.4, '#0e0e0e', () => { g.moveTo(-8, 8); g.bezierCurveTo(-16, -8, 8, -14, 6, 6); g.bezierCurveTo(4, 20, -18, 6, -4, -2); });
    cord(g, 3.4, k.main, () => { g.moveTo(8, 8); g.bezierCurveTo(16, -8, -8, -14, -6, 6); });
    circ(g, 0, 4, 4, '#0e0e0e', 1.4);
    cord(g, 2.4, '#0e0e0e', () => { g.moveTo(4, 8); g.lineTo(18, -22); }); cord(g, 2.4, '#0e0e0e', () => { g.moveTo(-4, 8); g.lineTo(-20, -26); });
  },
  bandageroll(g, k) { // rolled bandage unspooling across a bench, pinned at the end
    g.beginPath(); g.moveTo(-22, 30); g.lineTo(34, 30); g.lineTo(38, 20); g.lineTo(-22, 18); g.closePath(); fs(g, k.paper, 2, 1);
    for (let i = 0; i < 9; i++) line(g, -14 + i * 6, 19 + (i % 2) * 0.4, -14 + i * 6, 29, 'rgba(120,90,60,.3)', 1);
    line(g, -20, 24, 36, 24, alpha(k.main, 0.6), 3);
    ell(g, -22, 6, 22, 24, k.paper, 2.4);
    ell(g, -22, 6, 15, 17, null, 1.2); ell(g, -22, 6, 9, 11, null, 1.2); ell(g, -22, 6, 4, 5, INK, 1.4);
    line(g, 30, 14, 32, 34, k.steel, 2.4); circ(g, 30, 14, 3, k.brass, 1.2);
  },
  gavel(g, k) { // auctioneer's gavel striking its block, a coin jumping
    ell(g, 0, 34, 30, 7, '#8a5a30', 2); rr(g, -26, 22, 52, 12, 3); fs(g, '#6e4524', 2, 1);
    g.save(); g.translate(8, -10); g.rotate(-0.55);
    rr(g, -3.5, -2, 7, 52, 3); fs(g, '#8a5a30', 1.8, 1); rr(g, -22, -16, 44, 22, 4); fs(g, '#6e4524', 2.4, 1);
    rr(g, -24, -17, 7, 24, 2); fs(g, k.brass, 1.6); rr(g, 17, -17, 7, 24, 2); fs(g, k.brass, 1.6); g.restore();
    ell(g, -22, -16, 9, 9, k.brass, 2); ell(g, -22, -16, 5, 5, null, 1.2);
    for (let i = 0; i < 4; i++) line(g, -28 + i * 4, 18, -30 + i * 6, 11, k.main, 1.8);
  },
  stamp(g, k) { // rubber stamp with the red print of the stamped form beneath
    poly(g, [[-38, 14], [38, 14], [38, 36], [-38, 36]]); fs(g, k.paper, 1.8, 1);
    g.save(); g.translate(14, 26); g.rotate(-0.08); ell(g, 0, 0, 15, 8, null, 2); g.strokeStyle = SCAR_BRIGHT; g.lineWidth = lnw(2.2); g.stroke(); line(g, -8, 0, 8, 0, SCAR_BRIGHT, 2); g.restore();
    for (let i = 0; i < 3; i++) line(g, -32, 20 + i * 6, -8 - i * 3, 20 + i * 6, 'rgba(43,30,26,.5)', 1.4);
    rr(g, -22, -6, 44, 16, 3); fs(g, k.dark, 2.2); rr(g, -18, -10, 36, 6, 2); fs(g, k.steelD, 1.4);
    g.beginPath(); g.moveTo(-8, -10); g.bezierCurveTo(-8, -34, 8, -34, 8, -10); g.closePath(); fs(g, '#8a5a30', 2, 1); line(g, -4, -26, -4, -14, 'rgba(255,230,190,.5)', 1.4);
  },
  powderkeg(g, k) { // banded powder keg with a fuse and a falling spark
    g.beginPath(); g.moveTo(-26, -20); g.bezierCurveTo(-38, -4, -38, 20, -26, 34); g.lineTo(26, 34); g.bezierCurveTo(38, 20, 38, -4, 26, -20); g.closePath(); fs(g, '#8a5a30', 2.8, 2);
    for (let i = -16; i <= 16; i += 8) line(g, i, -18, i * 1.2, 32, 'rgba(43,30,26,.5)', 1);
    [-14, 24].forEach((y) => { rr(g, -34, y - 3, 68, 7, 2); fs(g, k.steel, 1.6, 1); });
    ell(g, 0, -20, 26, 7, '#6e4524', 2);
    cord(g, 2.2, '#b89a68', () => { g.moveTo(0, -24); g.bezierCurveTo(8, -36, -4, -40, 6, -48); });
    circ(g, 6, -48, 4, '#ffcb59', 1.2); [0.5, 2.4, 4.2].forEach((a) => line(g, 6 + Math.cos(a) * 5, -48 + Math.sin(a) * 5, 6 + Math.cos(a) * 11, -48 + Math.sin(a) * 11, k.main, 1.6));
    drawSchoolGlyphSafe(g, 0, 8, 6, k.main);
  },
  tourniquet(g, k) { // leather strap cinched round a limb with a windlass rod
    g.beginPath(); g.moveTo(-40, -10); g.lineTo(-40, 24); g.bezierCurveTo(-20, 32, 20, 32, 40, 24); g.lineTo(40, -10); g.bezierCurveTo(20, -2, -20, -2, -40, -10); g.closePath(); fs(g, k.paper, 2.4, 1);
    g.beginPath(); g.moveTo(-8, -8); g.lineTo(10, -8); g.lineTo(12, 30); g.lineTo(-10, 30); g.closePath(); fs(g, '#7a4a2a', 2.2, 2);
    for (let i = 0; i < 4; i++) line(g, -8, -2 + i * 8, 10, -2 + i * 8, 'rgba(43,30,26,.5)', 1);
    rr(g, -4, -14, 8, 6, 1); fs(g, k.brass, 1.4);
    g.save(); g.translate(2, 6); g.rotate(-0.9); rr(g, -4, -42, 8, 54, 3); fs(g, k.steel, 1.8); circ(g, 0, -42, 4, k.brass, 1.4); g.restore();
  },
  matchstick(g, k) { // a lit match with a bright head and a spray of motes
    g.save(); g.rotate(-0.6); rr(g, -4, -10, 8, 54, 2); fs(g, '#c9a15a', 1.8, 1); line(g, -1.5, -4, -1.5, 40, 'rgba(255,240,200,.5)', 1);
    ell(g, 0, -16, 8, 10, k.dark, 2);
    g.restore();
    g.beginPath(); g.moveTo(-20, -30); g.bezierCurveTo(-14, -48, 4, -50, -4, -62); g.bezierCurveTo(20, -52, 26, -34, 14, -22); g.bezierCurveTo(8, -16, -14, -18, -20, -30); g.closePath(); fs(g, '#ffcb59', 2);
    [[26, -8], [-30, -14], [20, -40]].forEach(([x, y]) => circ(g, x, y, 2, k.main, 1));
    rr(g, 12, 18, 30, 20, 2); fs(g, k.paper, 1.8, 1); line(g, 14, 30, 40, 30, k.main, 4);
  },
  waxseal(g, k) { // wax seal pressed into a ribbon, a drip running down
    poly(g, [[-40, -6], [40, -10], [40, 8], [-40, 12]]); fs(g, k.paper, 1.8, 1);
    g.beginPath(); g.moveTo(-14, -14); g.bezierCurveTo(-28, -30, 10, -40, 22, -26); g.bezierCurveTo(36, -12, 32, 14, 16, 24); g.bezierCurveTo(14, 36, 8, 42, 6, 34); g.bezierCurveTo(-4, 34, -26, 24, -22, 8); g.bezierCurveTo(-34, 2, -24, -10, -14, -14); g.closePath();
    fs(g, grad(g, -20, -20, 24, 30, [[0, k.light], [1, k.dark]]), 2.6);
    circ(g, 4, 0, 12, null, 1.6); circ(g, 4, 0, 7, null, 1.2); drawSchoolGlyphSafe(g, 4, 0, 3.5, k.light);
    ell(g, -8, -16, 5, 2.5, 'rgba(255,255,255,.45)', 0, -0.5);
  },
  ticket(g, k) { // pawn ticket torn in two, a stub and a string tag
    g.save(); g.rotate(-0.12); poly(g, [[-40, -20], [8, -20], [8, 20], [-40, 20]]); fs(g, k.paper, 2.2, 1);
    for (let i = 0; i < 3; i++) line(g, -34, -12 + i * 8, -6 - (i % 2) * 8, -12 + i * 8, 'rgba(43,30,26,.55)', 1.5);
    circ(g, -33, 12, 4, k.main, 1.4);
    poly(g, [[14, -18], [40, -18], [40, 22], [14, 22]]); fs(g, mix(k.paper, '#8a7a60', 0.15), 2, 1);
    line(g, 20, -8, 34, -8, 'rgba(43,30,26,.55)', 1.5); line(g, 20, 0, 30, 0, 'rgba(43,30,26,.55)', 1.5); circ(g, 27, 12, 4, null, 1.4); g.restore();
    cord(g, 1.8, k.brass, () => { g.moveTo(-26, 20); g.bezierCurveTo(-30, 34, -10, 40, 0, 32); });
  },
  dynamocoil(g, k) { // copper coil wound on a core between two magnet poles
    poly(g, [[-40, -24], [-26, -24], [-26, 24], [-40, 24]]); fs(g, k.main, 2.2); poly(g, [[26, -24], [40, -24], [40, 24], [26, 24]]); fs(g, k.dark, 2.2);
    line(g, -33, -14, -33, 14, 'rgba(255,255,255,.7)', 4); line(g, 33, -14, 33, 14, 'rgba(255,255,255,.4)', 4);
    rr(g, -22, -6, 44, 12, 2); fs(g, k.steel, 1.6, 1);
    for (let i = 0; i < 8; i++) { ell(g, -18 + i * 5, 0, 5, 16, null, 0); g.lineWidth = lnw(4); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(2.4); g.strokeStyle = '#b8683a'; g.stroke(); }
    line(g, 0, -24, 0, -38, k.brass, 2.4); circ(g, 0, -40, 3.4, k.brass, 1.4);
    line(g, -8, 22, -8, 38, k.main, 2); line(g, 8, 22, 8, 38, k.main, 2);
  },
};
function drawSchoolGlyphSafe(g, x, y, r, col) { circ(g, x, y, r, col, 1); }
export const MOTIF_NAMES = Object.keys(MOTIFS);

// keyword -> motif, first match wins. Matched against spec.art + id + name.
const KEYWORDS = [
  [/tangle|snarl|snag|loop/, 'tangle'], [/\bknot|thread|lash|\btie\b/, 'knot'], [/scissor|shears|snip|sever/, 'scissors'], [/sew|darn|pin\b/, 'sewneedle'],
  [/poison|toxin|venom|envenom|noxious/, 'poisonvial'], [/fragile|brittle|crack|shatter|broken|splinter/, 'crackedshield'], [/unpick|unravel|undo|pulled|fray|rip/, 'pulledstitch'], [/hammer|rivet|temper|anvil|forge|smith/, 'hammerrivet'],
  [/saw|amputate|cleave|hacksaw/, 'bonesaw'], [/scalpel|flick|lancet|incision|\bcut\b|swipe|jab|slice|lunge|weak.?point/, 'scalpel'],
  [/syringe|transfus|anesth|adrenal|\bshot\b|inject|fog/, 'syringe'], [/dress|swab|gauze|bandage|apron|wrap|aid|triage/, 'bandage'],
  [/hemostat|clamp|lay.?bare|restrain|tongs/, 'clamp'], [/suture|stitch|needle|thread|barbed/, 'needle'],
  [/vivisect|femur|\bbone\b|shard|rib/, 'bone'], [/skull|flatline|desperate|death|exsang|reaper|grave/, 'skull'],
  [/spark|discharge|arc.?flash|dynamo|capacitor|static|bolt|charge|lightning|shock/, 'bolt'],
  [/candle|wick|wax|snuff|trim|pilot|slow.?match/, 'candle'], [/hourglass|burnout|reopen|wait|delay|time|layaway|prepaid|standing/, 'hourglass'],
  [/match|kindle|flare|ember|torch|blaze|fire|burn|pyre|cinder|scald|wildfire|flashpoint|backdraft|powder|keg|tinder|spread/, 'flame'],
  [/crown|gilded|golden|age\b|hostile|takeover/, 'crown'], [/scale|bidding|market|bill|balance|audit/, 'scales'],
  [/coin|change|purse|gilt|pocket|tip|dividend|collect|gold|levy|liquidate|bulk|parachute|pawn|keepsake|patronage/, 'coins'],
  [/ledger|receipt|invoice|inventory|chart|order|waiver|paperwork|entry|recall/, 'ledger'], [/key\b|unlock/, 'key'],
  [/eye|appraise|browse|review|opinion|look|sight|scry/, 'eye'], [/hold|steady|poise|hand|grab|grip|reach/, 'hand'],
  [/mask|biohaz|plague|beak/, 'mask'], [/jar|vial|epidemic|fever|bottle|flask|brew|tonic/, 'jar'],
  [/gear|cog|rust|flake|slag|scrap|machine|grind/, 'gear'], [/thorn|barb|splinter|spike|prick/, 'thorn'],
  [/shield|plate|plating|brace|block|tourniquet|shrug|leather|resolve|armor|ward|cover|guard/, 'shield'],
  [/bell|ringing|usher|toll|chime/, 'bell'], [/rope|tie|knot|leash|noose|bind/, 'rope'], [/chain|link|reaction/, 'chain'],
  [/echo|encore|second|again|repeat|helping|spiral|loop|swirl/, 'spiral'],
  [/blood|drop|bleed|hemorr|clot|bruise|drawblood|draw.?blood|scab|scar|wound|open|transfuse|bio/, 'drop'],
  [/heart|heal|pulse|life|cauterize|beat|rite/, 'heart'], [/paper|form|stamp|file|record|lint|junk|note/, 'papers'],
];
const OP_MOTIF = { bleed: 'drop', burn: 'flame', charge: 'bolt', block: 'shield', poison: 'jar', vulnerable: 'eye', weak: 'thorn', strength: 'hand', thorns: 'thorn' };
function pickMotif(spec) {
  const art = String(spec.art || '').toLowerCase();
  if (MOTIFS[art]) return art;
  const hay = `${art} ${String(spec.id || '').toLowerCase()} ${String(spec.name || '').toLowerCase()}`.replace(/_/g, ' ');
  for (const [re, m] of KEYWORDS) if (re.test(hay)) return m;
  const ops = [];
  const walk = (fx) => (fx || []).forEach((o) => { ops.push(o); if (o.then) walk(o.then); if (o.else) walk(o.else); if (Array.isArray(o.fx)) walk(o.fx); });
  walk(spec.fx);
  for (const o of ops) { if (o.s) { const sk = String(o.s).toLowerCase(); for (const key of Object.keys(OP_MOTIF)) if (sk.includes(key)) return OP_MOTIF[key]; } }
  const has = (n) => ops.some((o) => o.op === n);
  if (spec.type === 'junk') return ['papers', 'ledger', 'gear', 'bone', 'thorn', 'jar'][hash(spec.id || '') % 6];
  if (has('gold')) return 'coins'; if (has('draw')) return 'hand'; if (has('energy')) return 'bolt'; if (has('heal')) return 'heart'; if (has('block')) return 'shield';
  if (has('addCard')) return 'papers'; if (has('dmg')) return ['scalpel', 'bonesaw', 'clamp', 'bone'][hash(spec.id || '') % 4];
  return MOTIF_NAMES[hash(spec.id || spec.name || '') % MOTIF_NAMES.length];
}
export const motifOf = (spec) => pickMotif(spec);
function schoolOf(spec) { return spec.school || HERO_SCHOOL[spec.hero] || null; }
function tintOf(spec) { const s = schoolOf(spec); return (s && COLX[s]) || COLX[spec.type] || '#8a7a60'; }


// ---------- the illustration window: 3 parallax layers (back wash, motif, foreground sprinkles) + inner shadow ring ----------
const WIN = { x: -90, y: -112, w: 180, h: 90 };
const WINC = { x: -90, y: -102, w: 180, h: 118 }; // compact face
const WINCG = { x: -90, y: -102, w: 180, h: 70 };  // compact face with grafts: a shorter window leaves room for the graft band
function artInfo(spec) {
  const r = rngOf('art:' + spec.id);
  const motif = pickMotif(spec);
  const variant = Math.floor(r() * 3);
  const sch = schoolOf(spec), main = desat(tintOf(spec), 0.12);
  const acc = COLX[SCHOOL_ORDER[(Math.max(0, SCHOOL_ORDER.indexOf(sch)) + 2 + variant) % 7]];
  const k = { main, dark: mix(main, INK, 0.5), light: mix(main, '#ffffff', 0.4), acc, paper: '#efe4cc', steel: STEEL, steelD: STEEL_D, brass: BRASS };
  return { motif, variant, main, sch, acc, k, junk: spec.type === 'junk', sc: 1.0 + r() * 0.14, ox: (r() - 0.5) * 18, oy: (r() - 0.5) * 6, rot: (r() - 0.5) * (variant === 2 ? 0.5 : 0.2), ang: 0.5 + r() * 0.6, seed: Math.floor(r() * 99999) };
}
function drawBackLayer(g, I, w, M) {
  const x = w.x - M, y = w.y - M, ww = w.w + 2 * M, hh = w.h + 2 * M, cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  g.fillStyle = I.junk ? '#cfc8b8' : mix(COLX.vellum, I.main, I.variant === 1 ? 0.3 : 0.17); g.fillRect(x, y, ww, hh);
  g.globalAlpha = 0.5;
  if (I.variant === 0) { const rg = g.createRadialGradient(cx, cy, 4, cx, cy, 78); rg.addColorStop(0, alpha(I.k.light, 0.85)); rg.addColorStop(1, alpha(I.k.light, 0)); g.fillStyle = rg; g.fillRect(x, y, ww, hh); }
  else if (I.variant === 1) { g.fillStyle = alpha(I.acc, 0.3); g.beginPath(); g.moveTo(x, cy + 20); g.lineTo(x + ww, cy - 30); g.lineTo(x + ww, cy - 6); g.lineTo(x, cy + 44); g.closePath(); g.fill(); }
  else { const r = rngOf('rays' + I.seed); g.fillStyle = alpha(I.acc, 0.3); for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.2832 + r(); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 120, a, a + 0.16); g.closePath(); g.fill(); } }
  g.globalAlpha = 1;
  // engraver's field lines, denser toward the floor
  g.strokeStyle = 'rgba(74,48,34,.15)'; g.lineWidth = lnw(0.7); g.beginPath();
  const sa = Math.sin(I.ang) * 60;
  for (let i = -130; i < 150; i += 5) { g.moveTo(cx + i - sa, cy - 70); g.lineTo(cx + i + sa, cy + 70); }
  g.stroke();
  g.beginPath(); for (let j = 0; j < 9; j++) { const yy = cy + w.h * 0.3 + j * 3.2; g.moveTo(x, yy); g.lineTo(x + ww, yy); } g.strokeStyle = 'rgba(74,48,34,.13)'; g.stroke();
  ell(g, cx + I.ox * 0.4, cy + w.h * 0.36, 38, 4.6, 'rgba(43,30,26,.3)', 0);
  const vg = g.createRadialGradient(cx, cy, 30, cx, cy, 112); vg.addColorStop(0, 'rgba(30,18,12,0)'); vg.addColorStop(1, 'rgba(30,18,12,.4)'); g.fillStyle = vg; g.fillRect(x, y, ww, hh);
}
function drawMotifLayer(g, I, w) {
  const cx = w.x + w.w / 2, cy = w.y + w.h / 2, fsc = Math.min(1.34, w.h / 90);
  g.save(); const sc = I.sc * (I.variant === 2 ? 0.95 : 1.04) * fsc;
  g.translate(cx + I.ox, cy + I.oy); g.scale((I.variant === 1 ? -1 : 1) * sc, sc); g.rotate(I.rot);
  g.lineJoin = 'round'; g.lineCap = 'round';
  MOTIFS[I.motif](g, I.k);
  g.restore(); BB = null;
}
function drawForeLayer(g, I, w, M) {
  const r = rngOf('fore' + I.seed), x = w.x - M, y = w.y - M, ww = w.w + 2 * M, hh = w.h + 2 * M;
  for (let i = 0; i < 18; i++) { g.fillStyle = i % 4 === 0 ? alpha(I.k.main, 0.5) : `rgba(74,48,34,${0.25 + r() * 0.3})`; g.beginPath(); g.arc(x + r() * ww, y + r() * hh, 0.6 + r() * 1.3, 0, 6.3); g.fill(); }
  const hp = hatchPat(g, 3);
  if (hp) { g.save(); g.globalAlpha = 0.5; g.fillStyle = hp; poly(g, [[w.x + w.w + M, w.y + w.h - 34], [w.x + w.w + M, w.y + w.h + M], [w.x + w.w - 56, w.y + w.h + M]]); g.fill(); poly(g, [[w.x - M, w.y - M], [w.x + 40, w.y - M], [w.x - M, w.y + 22]]); g.globalAlpha = 0.22; g.fill(); g.restore(); }
  g.strokeStyle = 'rgba(74,48,34,.4)'; g.lineWidth = lnw(0.9); g.beginPath();
  for (let i = 0; i < 5; i++) { const px = w.x + 8 + r() * (w.w - 16), py = w.y + w.h - 4 - r() * 8; g.moveTo(px, py); g.lineTo(px + 3, py - 7); }
  g.stroke(); BB = null;
}
function drawRing(g, I, w, compact, framed) { // framed: a painted frame lies over the window's edge, so the ink rule is left out and the school seal moves clear of the corner piece
  g.save(); rr(g, w.x, w.y, w.w, w.h, 5); g.clip();
  rr(g, w.x - 2, w.y - 2, w.w + 4, w.h + 4, 6); g.lineWidth = lnw(6.5); g.strokeStyle = lg(g, w.x, w.y, w.x + w.w, w.y + w.h, [[0, 'rgba(30,18,12,.34)'], [0.5, 'rgba(30,18,12,.5)'], [1, 'rgba(30,18,12,.7)']]); g.stroke();
  g.restore();
  if (!framed) {
    rr(g, w.x, w.y, w.w, w.h, 5); g.lineWidth = lnw(2.5); g.strokeStyle = INK; g.stroke();
    rr(g, w.x + 2.5, w.y + 2.5, w.w - 5, w.h - 5, 3.5); g.lineWidth = lnw(1); g.strokeStyle = 'rgba(255,246,220,.5)'; g.stroke();
  }
  const gx = w.x + w.w - (framed ? 19 : 13), gy = w.y + (framed ? 24 : 13);
  if (I.sch && (!compact || framed)) { circ(g, gx, gy, 10.5, 'rgba(232,220,196,.88)', 1.4); drawSchoolGlyph(g, I.sch, gx, gy, 7.5, COLX[I.sch]); }
  BB = null;
}
function drawIllustration(g, I, w, compact = w === WINC, framed = false) {
  g.save(); rr(g, w.x, w.y, w.w, w.h, 5); g.clip();
  drawBackLayer(g, I, w, 0); drawMotifLayer(g, I, w); drawForeLayer(g, I, w, 0);
  g.restore(); drawRing(g, I, w, compact, framed);
}

// ---------- thread, patches, brass ----------
function patchPoints(x, y, w, h, seed) {
  const r = rngOf(seed), pts = [], j = Math.min(w, h) * 0.06;
  const n = Math.max(2, Math.round(Math.max(w, h) / 22));
  const cn = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  for (let e = 0; e < 4; e++) {
    const a = cn[e], b = cn[(e + 1) % 4], cnt = e % 2 ? Math.max(2, Math.round(h / 22)) : n;
    for (let i = 0; i < cnt; i++) { const t = i / cnt; const jx = i ? (r() - 0.5) * 2 * j : (r() - 0.5) * j * 2.2; const jy = i ? (r() - 0.5) * 2 * j : (r() - 0.5) * j * 2.2; pts.push([a[0] + (b[0] - a[0]) * t + jx, a[1] + (b[1] - a[1]) * t + jy]); }
  }
  return pts;
}
// embossed cross stitches: a 1px light offset under the dark thread
function stitchAround(g, pts, inset, step = 6.5, col = '#0e0e0e', lw = 1.5) {
  const build = (ox, oy) => {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const nx = -uy, ny = ux, n = Math.max(1, Math.floor(len / step));
      for (let s = 0; s < n; s++) { const t = (s + 0.5) / n, px = a[0] + dx * t + nx * inset + ox, py = a[1] + dy * t + ny * inset + oy; g.moveTo(px - nx * 3.2 - ux * 1.8, py - ny * 3.2 - uy * 1.8); g.lineTo(px + nx * 3.2 + ux * 1.8, py + ny * 3.2 + uy * 1.8); }
    }
  };
  g.lineCap = 'round'; g.lineWidth = lnw(lw); build(0.9, 1); g.strokeStyle = 'rgba(255,246,220,.45)'; g.stroke(); build(0, 0); g.strokeStyle = col; g.stroke();
}
function staple(g, x, y, w = 14, rot = 0) { // brass, 4-stop stepped banding, lit from the top left
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(-w / 2 + 1.2, -0.8, w, 5);
  rr(g, -w / 2, -2.5, w, 4.6, 1.6); g.fillStyle = BRASS_D; g.fill(); g.lineWidth = lnw(1); g.strokeStyle = INK; g.stroke();
  g.fillStyle = BRASS; g.fillRect(-w / 2 + 1, -2, w - 2, 3); g.fillStyle = '#e3c45a'; g.fillRect(-w / 2 + 1.5, -2, w - 3, 1.5); g.fillStyle = BRASS_L; g.fillRect(-w / 2 + 2, -2, w * 0.45, 0.8);
  g.fillStyle = BRASS_D; g.fillRect(-w / 2, -1, 2.2, 4.4); g.fillRect(w / 2 - 2.2, -1, 2.2, 4.4);
  g.restore(); BB = null;
}
function drawRivet(g, gid, cx, cy) { // brass rivet with a school-colour wax head
  const gr = GRAFTS[gid]; const col = (gr && gr.school && COLX[gr.school]) || BRASS;
  g.save(); g.translate(cx, cy);
  g.beginPath(); g.arc(1.2, 1.8, 9, 0, 6.3); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
  g.beginPath(); g.arc(0, 0, 9, 0, 6.3); g.fillStyle = INK; g.fill();
  [[7.8, 0, 0, '#6e5414'], [6.6, -0.4, -0.4, BRASS], [5.2, -0.9, -0.9, '#e3c45a'], [3.7, -1.2, -1.2, BRASS_L]].forEach(([r, ox, oy, c]) => { g.beginPath(); g.arc(ox, oy, r, 0, 6.3); g.fillStyle = c; g.fill(); });
  g.beginPath(); g.arc(0.4, 0.4, 3.3, 0, 6.3); g.fillStyle = col; g.fill(); g.lineWidth = lnw(1); g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(-1, -1.2, 1, 0, 6.3); g.fillStyle = 'rgba(255,255,255,.7)'; g.fill();
  g.restore();
}
function drawSmallPatch(g, gid, cx, cy, idx, sc = 1) {
  const gr = GRAFTS[gid]; const school = gr && gr.school; const col = (school && COLX[school]) || '#888';
  const w = 34, h = 30, pts = patchPoints(cx - w / 2, cy - h / 2, w, h, gid + idx);
  g.save(); if (sc !== 1) { g.translate(cx, cy); g.scale(sc, sc); g.translate(-cx, -cy); }
  poly(g, pts.map((p) => [p[0] + 1.5, p[1] + 2.5])); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
  const body = mix(col, '#d8cdb4', 0.18);
  poly(g, pts); fs(g, body, 1.2, 2);
  const wp = weavePat(g); if (wp) { poly(g, pts); g.save(); g.clip(); g.globalAlpha = 0.14; g.fillStyle = wp; g.fillRect(cx - w, cy - h, w * 2, h * 2); g.restore(); }
  stitchAround(g, pts, 1.5, 6.5);
  if (idx === 2) { // Overload: gold cracked border
    poly(g, pts); g.lineWidth = lnw(2.6); g.strokeStyle = COLX.lamp; g.stroke();
    g.beginPath(); g.moveTo(cx - w / 2, cy - 4); g.lineTo(cx - 6, cy - 2); g.lineTo(cx - 2, cy + 8); g.lineTo(cx + 6, cy + h / 2); g.moveTo(cx + w / 2, cy - h / 2 + 5); g.lineTo(cx + 4, cy - 4); g.lineWidth = lnw(1.5); g.strokeStyle = '#fff3b0'; g.stroke();
  }
  drawSchoolGlyph(g, school, cx, cy + 1, 7.5, mix(col, '#ffffff', 0.5));
  staple(g, cx - 1, cy - h / 2 + 2, 13, -0.15 + idx * 0.1);
  g.restore(); BB = null;
}

// Resting (compact) hand face: one chip per graft INSIDE the card (school glyph + name), so the key facts read without lifting the card.
// The 3rd chip is the Overload: gold border and a crack. Names shrink to fit; a lifted card shows the full text.
function drawGraftBand(g, grafts, x, y, w, h) {
  const n = Math.min(3, grafts.length); if (!n) return;
  const gap = 4, cw = (w - gap * (n - 1)) / n;
  grafts.slice(0, 3).forEach((gid, i) => {
    const gr = GRAFTS[gid], school = gr && gr.school, col = (school && COLX[school]) || '#888', cx = x + i * (cw + gap), over = i === 2;
    g.save();
    rr(g, cx, y, cw, h, 6); fs(g, mix(col, '#e9dfc6', 0.55), over ? 2.6 : 1.4, 2);
    if (over) { rr(g, cx, y, cw, h, 6); g.lineWidth = lnw(2.6); g.strokeStyle = COLX.lamp; g.stroke(); g.beginPath(); g.moveTo(cx + cw * 0.55, y); g.lineTo(cx + cw * 0.48, y + h * 0.4); g.lineTo(cx + cw * 0.6, y + h * 0.65); g.lineWidth = lnw(1.4); g.strokeStyle = '#fff3b0'; g.stroke(); }
    drawSchoolGlyph(g, school, cx + 11, y + h / 2, 6.5, mix(col, '#2b1e1a', 0.35));
    const nm = String((gr && gr.name) || gid), tw = cw - 25;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const sz = fitText(g, nm, tw, 16, 8, { bold: true, ui: true }); g.font = font(sz, { bold: true, ui: true }); g.fillStyle = '#2b1e1a';
    if (g.measureText(nm).width > tw) { const first = nm.split(' ')[0]; g.fillText(first, cx + 20 + tw / 2, y + h / 2 + 0.5, tw); }
    else g.fillText(nm, cx + 20 + tw / 2, y + h / 2 + 0.5, tw);
    g.restore(); BB = null;
  });
}

// ---------- card outline (junk is torn) ----------
function cardPath(g, junk, seed) {
  if (!junk) { rr(g, -HW, -HH, CARD_W, CARD_H, 12); return; }
  const r = rngOf('tear:' + seed), pts = [];
  const edge = (x0, y0, x1, y1, amp) => { const n = 12; for (let i = 0; i < n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * amp, y0 + (y1 - y0) * t + (r() - 0.5) * amp]); } };
  pts.push([-HW + 8, -HH]); edge(-HW + 8, -HH, HW - 38, -HH, 2);
  pts.push([HW - 38, -HH]); pts.push([HW - 30, -HH + 10]); pts.push([HW - 22, -HH + 4]); pts.push([HW - 14, -HH + 18]); pts.push([HW - 6, -HH + 14]); pts.push([HW, -HH + 28]);
  edge(HW, -HH + 28, HW, HH - 8, 2.5); pts.push([HW - 8, HH]); edge(HW - 8, HH, -HW + 56, HH, 2);
  pts.push([-HW + 56, HH]); pts.push([-HW + 48, HH - 8]); pts.push([-HW + 38, HH - 2]); pts.push([-HW + 30, HH - 12]); pts.push([-HW + 20, HH - 4]); pts.push([-HW + 2, HH - 14]);
  edge(-HW, HH - 14, -HW, -HH + 8, 2.5);
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
}

function drawClamp(g, seed, ty = -22) { // ty = bottom edge of the illustration window: the clamp straddles it and never covers the key number below
  const r = rngOf('clamp:' + seed);
  g.save(); g.translate(0, ty - 10); g.rotate(-0.12);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-112, 3, 224, 26);
  g.fillStyle = lg(g, 0, -12, 0, 14, [[0, '#c27a49'], [0.45, COLX.rust], [1, '#4d2714']]); g.fillRect(-112, -12, 224, 26); g.lineWidth = lnw(2.4); g.strokeStyle = INK; g.strokeRect(-112, -12, 224, 26);
  for (let i = 0; i < 40; i++) { g.fillStyle = r() > 0.5 ? 'rgba(60,25,10,.5)' : 'rgba(220,150,90,.35)'; g.fillRect(-110 + r() * 218, -10 + r() * 22, 2 + r() * 5, 1.5 + r() * 2.5); }
  [-96, -60, 60, 96].forEach((x) => { circ(g, x, 1, 3.6, STEEL_D, 1.4); });
  rr(g, -122, -18, 16, 38, 3); fs(g, STEEL_D, 2); rr(g, 106, -18, 16, 38, 3); fs(g, STEEL_D, 2);
  // padlock
  g.beginPath(); g.arc(0, -5, 8, Math.PI, 0); g.lineWidth = lnw(3.4); g.strokeStyle = INK; g.stroke(); g.lineWidth = lnw(1.8); g.strokeStyle = STEEL; g.stroke();
  rr(g, -11, -5, 22, 18, 3); fs(g, lg(g, 0, -5, 0, 13, [[0, '#f1d675'], [1, BRASS_D]]), 2); circ(g, 0, 3, 2.2, INK, 0); line(g, 0, 3, 0, 8, INK, 2);
  g.restore();
  // tape cross, top right of the illustration
  [0.7, -0.7].forEach((a) => { g.save(); g.translate(58, -88); g.rotate(a); g.fillStyle = 'rgba(214,199,166,.92)'; g.fillRect(-26, -5, 52, 10); g.lineWidth = lnw(1.2); g.strokeStyle = 'rgba(43,30,26,.7)'; g.strokeRect(-26, -5, 52, 10); line(g, -22, 0, 22, 0, 'rgba(43,30,26,.2)', 1); g.restore(); });
}
function drawBandages(g) {
  g.save(); g.translate(-82, 118); g.rotate(-0.6); g.fillStyle = '#e9e2d0'; g.fillRect(-48, -9, 96, 18); g.lineWidth = lnw(1.5); g.strokeStyle = 'rgba(43,30,26,.8)'; g.strokeRect(-48, -9, 96, 18);
  g.fillStyle = 'rgba(160,140,110,.5)'; for (let i = 0; i < 12; i++) g.fillRect(-44 + i * 8, -6, 2, 2);
  g.fillStyle = 'rgba(179,38,58,.55)'; g.beginPath(); g.arc(14, 0, 6, 0, 6.3); g.fill(); line(g, -30, -9, -30, 9, '#0e0e0e', 1.6); line(g, -22, -9, -22, 9, '#0e0e0e', 1.6); g.restore();
}

// ---------- overlays baked into the face ----------
function drawSeam(g, seed) { // Tithe: a red seam with puckered branches and embossed stitches
  const r = rngOf('seam:' + seed), pts = [];
  const x0 = -96, y0 = -118, x1 = 96, y1 = 124, n = 11;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (i && i < n ? (r() - 0.5) * 16 : 0), y0 + (y1 - y0) * t + (i && i < n ? (r() - 0.5) * 16 : 0)]); }
  const stroke = (p, w, c) => { g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.lineWidth = lnw(w); g.strokeStyle = c; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); };
  g.fillStyle = 'rgba(90,80,75,.13)'; rr(g, -102, -147, 204, 294, 6); g.fill();
  stroke(pts.map((p) => [p[0] + 1, p[1] + 2]), 7, 'rgba(40,0,10,.45)');
  stroke(pts, 5, COLX.scar); stroke(pts.map((p) => [p[0] - 1, p[1] - 1]), 1.3, '#f7a0a8');
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[i + 1]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l; for (let s = 0; s < 2; s++) { const t = 0.25 + s * 0.5, px = a[0] + dx * t + (pass ? 0 : 1), py = a[1] + dy * t + (pass ? 0 : 1); g.moveTo(px - nx * 6, py - ny * 6); g.lineTo(px + nx * 6, py + ny * 6); } }
    g.lineWidth = lnw(1.8); g.strokeStyle = pass ? '#0e0e0e' : 'rgba(255,230,230,.5)'; g.stroke();
  }
  for (let b = 0; b < 3; b++) {
    const i = 2 + b * 3, p = pts[i], dir = (b % 2 ? 1 : -1) * (1.1 + r() * 0.5) + Math.atan2(y1 - y0, x1 - x0);
    const br = [[p[0], p[1]]]; let ax = p[0], ay = p[1], a = dir; for (let s = 0; s < 4; s++) { a += (r() - 0.5) * 0.9; ax += Math.cos(a) * (10 + r() * 8); ay += Math.sin(a) * (10 + r() * 8); br.push([ax, ay]); }
    stroke(br, 3.4, 'rgba(40,0,10,.5)'); stroke(br, 2, COLX.scar);
    ell(g, p[0], p[1], 5, 3, 'rgba(240,130,140,.45)', 0, dir); // pucker
    for (let q = 1; q < 3; q++) { g.beginPath(); g.arc(p[0], p[1], 5 + q * 3.5, dir - 0.9, dir + 0.9); g.lineWidth = lnw(0.8); g.strokeStyle = 'rgba(60,10,16,.5)'; g.stroke(); }
  }
  BB = null;
}
function drawMark(g, mark, win, seed) {
  if (mark === 'numb') { // a grey gauze patch dulls the art
    g.fillStyle = 'rgba(140,138,132,.22)'; rr(g, win.x, win.y, win.w, win.h, 5); g.fill();
    const pts = patchPoints(win.x + win.w - 76, win.y + win.h - 56, 66, 48, 'numb' + seed);
    poly(g, pts.map((p) => [p[0] + 1.5, p[1] + 2.5])); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
    poly(g, pts); fs(g, '#8e8b84', 1.4, 2);
    const wp = weavePat(g); if (wp) { poly(g, pts); g.save(); g.clip(); g.globalAlpha = 0.2; g.fillStyle = wp; g.fillRect(win.x, win.y, win.w, win.h); g.restore(); }
    stitchAround(g, pts, 1.5, 6.5);
    g.strokeStyle = 'rgba(30,24,20,.7)'; g.lineWidth = lnw(1.6); g.beginPath(); const cx = win.x + win.w - 43, cy = win.y + win.h - 32; g.moveTo(cx - 9, cy - 9); g.lineTo(cx + 9, cy + 9); g.moveTo(cx + 9, cy - 9); g.lineTo(cx - 9, cy + 9); g.stroke();
  } else if (mark === 'unpicked') { // a stitch line coming apart, one loose thread hanging
    const y = win.y + win.h - 12;
    for (let i = 0; i < 9; i++) { const x = win.x + 10 + i * 18; if (i > 5) { g.beginPath(); g.arc(x, y - 5 - (i - 5) * 2, 3 + (i - 5), 0, 3.5); g.lineWidth = lnw(1.3); g.strokeStyle = '#0e0e0e'; g.stroke(); } else line(g, x, y - 3, x + 8, y + 3, '#0e0e0e', 1.8); }
    const th = () => { g.moveTo(win.x + 36, y); g.bezierCurveTo(win.x + 20, y + 30, win.x + 60, y + 50, win.x + 38, y + 74); g.bezierCurveTo(win.x + 30, y + 84, win.x + 48, y + 92, win.x + 54, y + 84); };
    g.beginPath(); th(); g.lineWidth = lnw(3.6); g.strokeStyle = 'rgba(255,246,220,.35)'; g.stroke(); g.beginPath(); th(); g.lineWidth = lnw(2); g.strokeStyle = '#0e0e0e'; g.stroke();
  } else if (mark === 'reknit') { // a red brand: the card was sewn back and remembers it
    const cx = win.x + win.w - 36, cy = win.y + win.h - 34;
    g.save(); g.translate(cx, cy); g.rotate(-0.25);
    circ(g, 0, 0, 24, 'rgba(163,20,47,.9)', 1.6); circ(g, 0, 0, 18, null, 1.2); g.strokeStyle = 'rgba(255,200,200,.6)'; g.stroke();
    g.strokeStyle = 'rgba(255,230,230,.85)'; g.lineWidth = lnw(2); g.beginPath(); g.moveTo(-9, -9); g.lineTo(9, 9); g.moveTo(9, -9); g.lineTo(-9, 9); g.stroke();
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 5 - 3, -12); g.lineTo(i * 5 + 3, -12); g.moveTo(i * 5 - 3, 12); g.lineTo(i * 5 + 3, 12); g.lineWidth = lnw(1); g.stroke(); }
    g.restore();
  } else if (mark === 'frayed') { // edges coming apart: loose threads along the bottom
    const r = rngOf('fray' + seed);
    for (let i = 0; i < 16; i++) { const x = -96 + i * 12.5 + r() * 6, l = 8 + r() * 14, d = (r() - 0.5) * 12; g.beginPath(); g.moveTo(x, HH - 3); g.quadraticCurveTo(x + d, HH + l * 0.5, x + d * 1.6, HH + l); g.lineWidth = lnw(0.9 + r() * 0.8); g.strokeStyle = i % 3 ? 'rgba(43,30,26,.85)' : 'rgba(232,220,196,.85)'; g.stroke(); }
    g.fillStyle = 'rgba(43,30,26,.18)'; g.fillRect(-100, HH - 22, 200, 18);
  }
  BB = null;
}

// ---------- card faces ----------
function domeRivet(g, x, y, r) { g.beginPath(); g.arc(x + 0.8, y + 1.2, r, 0, 6.3); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill(); g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fillStyle = BRASS_D; g.fill(); g.beginPath(); g.arc(x - r * 0.15, y - r * 0.15, r * 0.75, 0, 6.3); g.fillStyle = BRASS; g.fill(); g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, 6.3); g.fillStyle = BRASS_L; g.fill(); g.lineWidth = lnw(0.9); g.strokeStyle = INK; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.stroke(); }
function keyInfo(lines) {
  for (const ln of lines) {
    const m = /(\d+)/.exec(ln); if (!m) continue;
    return { n: m[1], kind: /damage/i.test(ln) ? 'dmg' : /block/i.test(ln) ? 'block' : /heal/i.test(ln) ? 'heal' : /draw|energy/i.test(ln) ? 'other' : 'status' };
  }
  return null;
}
function kindIcon(g, kind, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 16, s / 16);
  if (kind === 'dmg') { g.rotate(-0.7); poly(g, [[-3, -16], [3, -16], [3, 6], [0, 12], [-3, 6]]); fs(g, '#cfc9bb', 2); rr(g, -9, 6, 18, 4, 1.5); fs(g, BRASS, 1.6); rr(g, -2, 10, 4, 8, 1.5); fs(g, '#5a3a22', 1.4); }
  else if (kind === 'block') { g.beginPath(); g.moveTo(-12, -13); g.lineTo(12, -13); g.lineTo(12, 1); g.bezierCurveTo(12, 9, 5, 14, 0, 17); g.bezierCurveTo(-5, 14, -12, 9, -12, 1); g.closePath(); fs(g, '#9bb0ba', 2.2); line(g, 0, -13, 0, 16, 'rgba(43,30,26,.7)', 1.6); }
  else { g.beginPath(); g.moveTo(0, -15); g.bezierCurveTo(5, -6, 12, -1, 12, 6); g.bezierCurveTo(12, 12, 7, 16, 0, 16); g.bezierCurveTo(-7, 16, -12, 12, -12, 6); g.bezierCurveTo(-12, -1, -5, -6, 0, -15); g.closePath(); fs(g, kind === 'heal' ? '#7fb08a' : kind === 'other' ? '#d6c08a' : COLX.scar, 2.2); }
  g.restore(); BB = null;
}
function typeGlyph(g, type, x, y, s, col) {
  g.save(); g.translate(x, y); g.scale(s / 12, s / 12);
  circ(g, 0, 0, 13, 'rgba(232,220,196,.9)', 1.4);
  if (type === 'attack') { g.rotate(-0.7); poly(g, [[-2.2, -10], [2.2, -10], [2.2, 4], [0, 8], [-2.2, 4]]); fs(g, col, 1.4); line(g, -6, 5, 6, 5, INK, 2); }
  else if (type === 'skill') { g.beginPath(); g.moveTo(-8, -8); g.lineTo(8, -8); g.lineTo(8, 1); g.bezierCurveTo(8, 6, 3, 9, 0, 11); g.bezierCurveTo(-3, 9, -8, 6, -8, 1); g.closePath(); fs(g, col, 1.4); }
  else if (type === 'power') { poly(g, [[0, -10], [3, -3], [10, 0], [3, 3], [0, 10], [-3, 3], [-10, 0], [-3, -3]]); fs(g, col, 1.4); }
  else { poly(g, [[-8, -7], [3, -9], [8, -2], [6, 8], [-6, 7]]); fs(g, col, 1.4); }
  g.restore(); BB = null;
}
function renderBody(g, spec, o, rarity) {
  const junk = spec.type === 'junk', frame = junk ? COLX.junk : (COLX[spec.type] || '#444'), seed = spec.id || spec.name || 'x';
  cardPath(g, junk, seed); g.fillStyle = frame; g.fill(); shadeCurrent(g, frame, 0, 0, 190, 2);
  g.save(); cardPath(g, junk, seed); g.clip();
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = lnw(1);
  for (let i = 0; i < 4; i++) { rr(g, -HW + 1.5 + i * 1.7, -HH + 1.5 + i * 1.7, CARD_W - 3 - i * 3.4, CARD_H - 3 - i * 3.4, 11 - i); g.stroke(); }
  if (rarity === 'rare') { const gp = goldPat(g); if (gp) { g.globalAlpha = 0.6; g.fillStyle = gp; g.fillRect(-HW, -HH, CARD_W, CARD_H); g.globalAlpha = 1; } }
  g.restore();
  cardPath(g, junk, seed); g.lineWidth = lnw(2.5); g.strokeStyle = INK; g.stroke();
  if (!junk) { bevel(g, -HW, -HH, CARD_W, CARD_H, 12, 2, 0.5); if (rarity === 'uncommon') { rr(g, -HW + 4, -HH + 4, CARD_W - 8, CARD_H - 8, 9); g.lineWidth = lnw(1.1); g.strokeStyle = '#d8d4c8'; g.stroke(); } else if (rarity === 'rare') { rr(g, -HW + 4, -HH + 4, CARD_W - 8, CARD_H - 8, 9); g.lineWidth = lnw(1.8); g.strokeStyle = '#f0d878'; g.stroke(); rr(g, -HW + 5.8, -HH + 5.8, CARD_W - 11.6, CARD_H - 11.6, 8); g.lineWidth = lnw(0.8); g.strokeStyle = 'rgba(80,56,10,.8)'; g.stroke(); } }
  // vellum
  g.save(); cardPath(g, junk, seed); g.clip();
  const vel = junk ? mix(COLX.vellum, '#8d897d', 0.5) : COLX.vellum;
  rr(g, -102, -147, 204, 294, 6); g.fillStyle = vel; g.fill();
  g.save(); g.clip();
  const fp = fibrePat(g); if (fp) { g.globalCompositeOperation = 'multiply'; g.fillStyle = fp; g.fillRect(-104, -149, 208, 298); g.globalCompositeOperation = 'source-over'; }
  const rx = rngOf('fox:' + seed);
  for (let i = 0; i < 9; i++) { const side = Math.floor(rx() * 4), t = rx(); const px = side < 2 ? -102 + t * 204 : (side === 2 ? -102 : 102), py = side < 2 ? (side === 0 ? -147 : 147) : -147 + t * 294, rad = 16 + rx() * 30; const rg = g.createRadialGradient(px, py, 1, px, py, rad); rg.addColorStop(0, `rgba(150,102,52,${0.2 + rx() * 0.14})`); rg.addColorStop(1, 'rgba(150,102,52,0)'); g.fillStyle = rg; g.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
  rr(g, -102, -147, 204, 294, 6); g.lineWidth = lnw(12); g.strokeStyle = 'rgba(140,96,52,.13)'; g.stroke();
  const rs = rngOf('sp:' + seed); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(110,80,50,${0.05 + rs() * 0.08})`; g.fillRect(-100 + rs() * 200, -145 + rs() * 290, 1 + rs() * 1.6, 1 + rs() * 1.6); }
  g.restore();
  rr(g, -102, -147, 204, 294, 6); g.lineWidth = lnw(1.6); g.strokeStyle = 'rgba(43,30,26,.85)'; g.stroke();
  bevel(g, -102, -147, 204, 294, 6, 2, 0.6);
  g.restore();
  [[-105, -150], [105, -150], [-105, 150], [105, 150]].forEach(([x, y]) => domeRivet(g, x, y, 3.6));
  return frame;
}
function drawKeyNumber(g, spec, lines, o, win, box) { // compact face: the one number that matters, big, with its kind icon. box: a painted frame's own place for it
  const ki = keyInfo(lines), ty = box ? box.y : win.y + win.h, kb = box ? box.h / 88 : 1;
  if (ki) {
    const gz = !box && (spec.grafts || []).length ? 0.78 : 1, size = Math.round((ki.n.length > 2 ? 60 : ki.n.length > 1 ? 82 : 92) * gz * kb); g.font = font(size, { bold: true }); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const wN = g.measureText(ki.n).width, cx = box ? box.x + box.w / 2 + 12 * kb : 14, baseY = ty + 8 * kb + size * 0.78;
    const ncol = o.tithed ? '#7a6a60' : ki.kind === 'dmg' ? '#7a1c1c' : ki.kind === 'block' ? '#2f4a58' : ki.kind === 'heal' ? '#3a6a46' : '#4a3022';
    if (box) { g.lineJoin = 'round'; g.lineWidth = Math.max(4, size * 0.09); g.strokeStyle = 'rgba(240,231,208,.92)'; g.strokeText(ki.n, cx, baseY); } // on a picture: a vellum edge around the number
    g.fillStyle = 'rgba(20,10,5,.28)'; g.fillText(ki.n, cx + 2, baseY + 3);
    g.fillStyle = ncol; g.fillText(ki.n, cx, baseY);
    const hp = hatchPat(g, 2); if (hp) { g.save(); g.globalAlpha = 0.55; g.fillStyle = hp; g.fillText(ki.n, cx, baseY); g.restore(); }
    g.lineJoin = 'round'; g.lineWidth = 1.3; g.strokeStyle = SEPIA; g.strokeText(ki.n, cx, baseY);
    g.fillStyle = 'rgba(255,246,220,.5)'; g.fillRect(cx - wN / 2 + 3, baseY - size * 0.72, wN - 6, 1);
    kindIcon(g, ki.kind, cx - wN / 2 - (box ? 6 + 16 * kb : 24), baseY - size * 0.34, box ? Math.max(15, 20 * kb) : 20);
  }
}
function plate(g, x, y, w, h, fill, up) { // engraved name plate
  rr(g, x, y, w, h, 6); fs(g, fill, 2, 2);
  if (up) { const gp = goldPat(g); if (gp) { rr(g, x, y, w, h, 6); g.save(); g.clip(); g.globalAlpha = 0.35; g.fillStyle = gp; g.fillRect(x, y, w, h); g.restore(); } rr(g, x + 2.5, y + 2.5, w - 5, h - 5, 4); g.lineWidth = lnw(1); g.strokeStyle = 'rgba(255,248,200,.85)'; g.stroke(); }
  else { rr(g, x + 2, y + 2, w - 4, h - 4, 4.5); g.lineWidth = lnw(0.9); g.strokeStyle = 'rgba(201,162,39,.7)'; g.stroke(); }
  BB = null;
}
function renderFace(g, spec, lines, price, o, I, win) {
  const junk = spec.type === 'junk', seed = spec.id || spec.name || 'x', rarity = o.rarity || spec.rarity || 'common';
  const frame = renderBody(g, spec, o, rarity);
  const nm = String(spec.name || '').replace(/\+$/, '');
  g.textAlign = 'center'; g.textBaseline = 'middle'; try { if ('letterSpacing' in g) g.letterSpacing = '0.5px'; } catch (e) { /* no letterSpacing */ }
  if (!o.compact) {
    const bx = -58, by = -142, bw = 150, bh = 27;
    plate(g, bx, by, bw, bh, spec.up ? '#d9b648' : mix(frame, INK, 0.5), spec.up);
    const maxNameW = bw - (spec.up ? 38 : 18), ns = fitText(g, nm, maxNameW, 17, 9.5, { bold: true }), ncx = bx + (spec.up ? (bw - 22) / 2 + 2 : bw / 2) + 6;
    g.font = font(ns, { bold: true }); engrave(g, nm, ncx, by + bh / 2 + 0.5, spec.up ? INK : COLX.vellum, !spec.up);
    if (spec.up) { circ(g, bx + bw - 14, by + bh / 2, 8.5, INK, 1.5); g.fillStyle = COLX.lamp; g.font = font(15, { bold: true }); g.fillText('+', bx + bw - 14, by + bh / 2 + 0.5); }
    drawIllustration(g, I, win);
    const label = String(spec.type || '').toUpperCase();
    try { if ('letterSpacing' in g) g.letterSpacing = '1.5px'; } catch (e) { /* none */ }
    g.font = font(11, { bold: true, ui: true }); const tw = Math.max(70, g.measureText(label).width + 36);
    g.beginPath(); g.moveTo(-tw / 2 - 8, -30); g.lineTo(tw / 2 + 8, -30); g.lineTo(tw / 2 + 2, -21); g.lineTo(tw / 2 + 8, -12); g.lineTo(-tw / 2 - 8, -12); g.lineTo(-tw / 2 - 2, -21); g.closePath(); BB = { cx: 0, cy: -21, r: tw / 2 + 8 };
    fs(g, mix(frame, INK, 0.2), 1.8, 1);
    g.fillStyle = COLX.vellum; g.fillText(label, 0, -20.5);
    try { if ('letterSpacing' in g) g.letterSpacing = '0px'; } catch (e) { /* none */ }
    layoutText(g, spec, lines, price, o);
    (spec.grafts || []).slice(0, 3).forEach((gid, i) => drawSmallPatch(g, gid, HW + 4, 28 + i * 44, i));
    (spec.fused || []).slice(0, 4).forEach((gid, i) => drawRivet(g, gid, -HW + 3, 30 + i * 24));
  } else {
    const bx = -56, by = -150, bw = 160, bh = 44;
    plate(g, bx, by, bw, bh, spec.up ? '#d9b648' : mix(frame, INK, 0.5), spec.up);
    const textW = bw - 18 - (spec.up ? 18 : 0), cxn = bx + bw / 2 - (spec.up ? 8 : 0);
    let ns = fitText(g, nm, textW, 26, 20, { bold: true }); g.font = font(ns, { bold: true });
    const col = spec.up ? INK : COLX.vellum;
    if (g.measureText(nm).width <= textW) engrave(g, nm, cxn, by + bh / 2 + 0.5, col, !spec.up);
    else { g.font = font(19, { bold: true }); const wl = wrapText(g, nm, textW).slice(0, 2); wl.forEach((ln, i) => engrave(g, ln, cxn, by + bh / 2 + (i - (wl.length - 1) / 2) * 19, col, !spec.up)); }
    if (spec.up) { circ(g, bx + bw - 15, by + bh / 2, 9, INK, 1.5); g.fillStyle = COLX.lamp; g.font = font(16, { bold: true }); g.fillText('+', bx + bw - 15, by + bh / 2 + 0.5); }
    drawIllustration(g, I, win);
    drawKeyNumber(g, spec, lines, o, win);
    g.textBaseline = 'middle';
    typeGlyph(g, spec.type, -76, 130, 11, frame);
    const sch = schoolOf(spec); if (sch) { circ(g, 76, 130, 13, 'rgba(232,220,196,.9)', 1.4); drawSchoolGlyph(g, sch, 76, 130, 9, COLX[sch]); }
    drawGraftBand(g, spec.grafts || [], -86, 46, 172, 38);
    (spec.fused || []).slice(0, 4).forEach((gid, i) => drawRivet(g, gid, -HW + 3, 8 + i * 24));
    if (o.tithed) { g.font = font(15, { bold: true, ui: true }); }
  }
  if (junk) drawBandages(g);
  if (o.tithed) drawSeam(g, seed);
  if (o.jam) drawClamp(g, seed, win.y + win.h);
  if (o.mark) drawMark(g, o.mark, win, seed);
}

// ---------- template mode (ui/templates.js) ----------
// When assets/ui/manifest.json holds a card frame for this card, the face is COMPOSED: frame image first, then each slot's painter (illustration,
// name, type band, rules text, grafts, glyphs, pips) on top. Slots come from CARD_TEMPLATE (+ manifest overrides), so a new frame needs no code.
// Without a frame (headless, no manifest, still loading) renderFace above runs unchanged.
function pipsPaint(g, r, rarity, up) {
  const n = rarity === 'rare' ? 3 : rarity === 'uncommon' ? 2 : rarity === 'common' ? 1 : 0, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  for (let i = 0; i < n; i++) { const x = cx + (i - (n - 1) / 2) * 14; g.beginPath(); g.moveTo(x, cy - 4.5); g.lineTo(x + 4, cy); g.lineTo(x, cy + 4.5); g.lineTo(x - 4, cy); g.closePath(); g.fillStyle = up ? BRASS_L : BRASS; g.fill(); g.lineWidth = lnw(0.9); g.strokeStyle = INK; g.stroke(); }
}
// the vellum that shows through a painted frame's text window: the same sheet as the procedural card (fibre, a foxed edge)
function vellumRect(g, r, seed, junk) {
  g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.fillStyle = junk ? mix(COLX.vellum, '#8d897d', 0.5) : COLX.vellum; g.fillRect(r.x, r.y, r.w, r.h);
  const fp = fibrePat(g); if (fp) { g.globalCompositeOperation = 'multiply'; g.fillStyle = fp; g.fillRect(r.x, r.y, r.w, r.h); g.globalCompositeOperation = 'source-over'; }
  const rx = rngOf('fox:' + seed);
  for (let i = 0; i < 5; i++) { const px = r.x + rx() * r.w, py = rx() > 0.5 ? r.y : r.y + r.h, rad = 14 + rx() * 26; const rg = g.createRadialGradient(px, py, 1, px, py, rad); rg.addColorStop(0, `rgba(150,102,52,${0.16 + rx() * 0.12})`); rg.addColorStop(1, 'rgba(150,102,52,0)'); g.fillStyle = rg; g.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
  g.lineWidth = lnw(9); g.strokeStyle = 'rgba(60,36,18,.22)'; g.strokeRect(r.x, r.y, r.w, r.h); // the frame's shadow on the sheet
  g.restore();
}
// lettering on a painted ribbon or banner: light with an ink edge, so it reads on leather, gauze and gilt alike
function inked(g, str, x, y, col, size) {
  g.lineJoin = 'round'; g.lineWidth = Math.max(2.2, size * 0.22); g.strokeStyle = 'rgba(22,12,8,.92)'; g.strokeText(str, x, y);
  g.fillStyle = col; g.fillText(str, x, y);
}
function renderFaceTemplate(g, spec, lines, price, o, I, T) {
  const junk = spec.type === 'junk', seed = spec.id || spec.name || 'x', rarity = o.rarity || spec.rarity || 'common', compact = !!o.compact;
  const frame = junk ? COLX.junk : (COLX[spec.type] || '#444'), win = T.slots.window, painted = T.painted;
  const nm = String(spec.name || '').replace(/\+$/, '');
  const painters = {
    window: (gg, r, inf) => drawIllustration(gg, I, r, compact, inf.under),
    textHole: (gg, r) => vellumRect(gg, r, seed, junk),
    namePlate: (gg, r, inf) => {
      gg.textAlign = 'center'; gg.textBaseline = 'middle';
      const fit = r.fit || {};
      if (inf.baked) { // the banner is in the painting: only the name is written, gold when the card is upgraded
        const up = !!spec.up, textW = r.w - 6 - (up ? 15 : 0), cx = r.x + r.w / 2 - (up ? 7 : 0), cy = r.y + r.h / 2 + 0.5;
        const ns = fitText(gg, nm, textW, fit.max || 16, fit.min || 9.5, { bold: true }); gg.font = font(ns, { bold: true });
        const tw = Math.min(r.w, gg.measureText(nm).width + 26), wash = gg.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
        wash.addColorStop(0, 'rgba(20,10,6,0)'); wash.addColorStop(0.18, 'rgba(20,10,6,.42)'); wash.addColorStop(0.82, 'rgba(20,10,6,.42)'); wash.addColorStop(1, 'rgba(20,10,6,0)');
        gg.fillStyle = wash; gg.fillRect(cx - tw / 2, r.y + 1.5, tw, r.h - 3); // a soft shade under the letters: gilt ornament and gauze stay behind them
        inked(gg, nm, cx, cy, up ? '#ffe7a0' : COLX.vellum, ns);
        if (up) { const bx = r.x + r.w - 9, by = r.y + r.h / 2; circ(gg, bx, by, 7.5, INK, 1.2); gg.fillStyle = COLX.lamp; gg.font = font(13, { bold: true }); gg.fillText('+', bx, by + 0.5); BB = null; }
        return;
      }
      plate(gg, r.x, r.y, r.w, r.h, spec.up ? '#d9b648' : mix(frame, INK, 0.5), spec.up);
      const textW = r.w - 18 - (spec.up ? 18 : 0), cx = r.x + r.w / 2 - (spec.up ? 8 : 0), cy = r.y + r.h / 2 + 0.5;
      const ns = fitText(gg, nm, textW, fit.max || 17, fit.min || 9.5, { bold: true }); gg.font = font(ns, { bold: true });
      const col = spec.up ? INK : COLX.vellum;
      if (gg.measureText(nm).width <= textW || !(fit.lines > 1)) engrave(gg, nm, cx, cy, col, !spec.up);
      else { gg.font = font(ns, { bold: true }); const wl = wrapText(gg, nm, textW).slice(0, fit.lines); wl.forEach((ln, i) => engrave(gg, ln, cx, cy + (i - (wl.length - 1) / 2) * ns, col, !spec.up)); }
      if (spec.up) { circ(gg, r.x + r.w - 14, r.y + r.h / 2, Math.min(9, r.h / 3), INK, 1.5); gg.fillStyle = COLX.lamp; gg.font = font(15, { bold: true }); gg.fillText('+', r.x + r.w - 14, r.y + r.h / 2 + 0.5); }
    },
    typeBand: (gg, r, inf) => {
      const label = String(spec.type || '').toUpperCase(), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      gg.textAlign = 'center'; gg.textBaseline = 'middle';
      if (inf.baked) { // the ribbon is in the painting
        const fit = r.fit || {}, sz = fitText(gg, label, r.w - 8, fit.max || 11, fit.min || 9, { bold: true, ui: true });
        gg.font = font(sz, { bold: true, ui: true }); inked(gg, label, cx, cy + 0.5, COLX.vellum, sz * 0.8);
        return;
      }
      gg.beginPath(); gg.moveTo(r.x, r.y); gg.lineTo(r.x + r.w, r.y); gg.lineTo(r.x + r.w - 6, cy); gg.lineTo(r.x + r.w, r.y + r.h); gg.lineTo(r.x, r.y + r.h); gg.lineTo(r.x + 6, cy); gg.closePath(); BB = { cx, cy, r: r.w / 2 }; fs(gg, mix(frame, INK, 0.2), 1.8, 1);
      try { if ('letterSpacing' in gg) gg.letterSpacing = '1.5px'; } catch (e) { /* none */ }
      gg.font = font(11, { bold: true, ui: true }); gg.fillStyle = COLX.vellum; gg.fillText(label, cx, cy + 0.5);
      try { if ('letterSpacing' in gg) gg.letterSpacing = '0px'; } catch (e) { /* none */ }
    },
    textBox: (gg, r) => { if (!(compact && (spec.grafts || []).length)) layoutText(gg, spec, lines, price, o, r); }, // a grafted hand face shows its graft chips there instead
    keyNumber: (gg, r) => {
      if (!r.own) { drawKeyNumber(gg, spec, lines, o, win); return; }
      if (!keyInfo(lines)) return;
      const wash = gg.createLinearGradient(0, r.y, 0, r.y + r.h); // the number stands on the picture: a vellum mist under it keeps it as plain as on the bare card
      wash.addColorStop(0, 'rgba(236,225,200,0)'); wash.addColorStop(0.5, 'rgba(236,225,200,.5)'); wash.addColorStop(1, 'rgba(236,225,200,.8)');
      gg.fillStyle = wash; gg.fillRect(r.x, r.y, r.w, r.h);
      drawKeyNumber(gg, spec, lines, o, win, r);
    },
    graftBand: (gg, r) => drawGraftBand(gg, spec.grafts || [], r.x, r.y, r.w, r.h),
    graftSlots: (gg, r) => (spec.grafts || []).slice(0, 3).forEach((gid, i) => { const c = centerOf(r.items[i]); drawSmallPatch(gg, gid, c.x, c.y, i); }),
    fusedSlots: (gg, r) => (spec.fused || []).slice(0, 4).forEach((gid, i) => { const c = centerOf(r.items[i]); drawRivet(gg, gid, c.x, c.y); }),
    typeGlyph: (gg, r) => { const c = centerOf(r); typeGlyph(gg, spec.type, c.x, c.y, r.w / 2, frame); },
    schoolGlyph: (gg, r) => { const sch = schoolOf(spec); if (!sch) return; const c = centerOf(r); circ(gg, c.x, c.y, r.w / 2, 'rgba(232,220,196,.9)', 1.4); drawSchoolGlyph(gg, sch, c.x, c.y, r.w * 0.35, COLX[sch]); },
    pips: (gg, r, inf) => { if (!inf.baked) pipsPaint(gg, r, rarity, !!spec.up); },
  };
  g.textBaseline = 'middle';
  if (painted) { rr(g, -HW + 3, -HH + 3, CARD_W - 6, CARD_H - 6, 9); g.fillStyle = '#17110e'; g.fill(); BB = null; } // nothing shows through a seam or a socket
  composeCardFront(g, T.tpl, T.fr, { compact, grafts: (spec.grafts || []).length > 0 }, painters);
  if (junk && !painted) drawBandages(g);
  if (o.tithed) { drawSeam(g, seed); if (painted && T.slots.namePlate && (T.fr.def.baked || []).includes('namePlate')) painters.namePlate(g, T.slots.namePlate, { baked: true }); } // the seam runs through the banner of a painted card: the name is written over it again
  if (o.jam) drawClamp(g, seed, painted ? win.y + 34 : win.y + win.h); // on a painted frame the banner under the picture carries the name: the clamp bites the top of the picture
  if (o.mark) drawMark(g, o.mark, win, seed);
}
// the template (if any) a card face is drawn from: { fr, tpl, slots, painted } or null. Resolved once per frame image and variant, then looked up.
const TPL = { ver: -1, pick: new Map(), face: new Map() };
function faceTemplate(spec, o) {
  templates.ensure();
  if (!templates.ready()) return null;
  if (TPL.ver !== templates.ver) { TPL.ver = templates.ver; TPL.pick.clear(); TPL.face.clear(); }
  const rarity = o.rarity || spec.rarity || 'common', pk = (spec.type || '') + '|' + rarity + '|' + (spec.school || '');
  let fr = TPL.pick.get(pk);
  if (fr === undefined) { fr = templates.pickFrame(cardFrameIds(spec, rarity)); TPL.pick.set(pk, fr); }
  if (!fr) return null;
  const compact = !!o.compact, grafts = (spec.grafts || []).length > 0, fk = fr.id + (compact ? '|c' : '|f') + (grafts ? 'g' : '');
  let T = TPL.face.get(fk);
  if (T === undefined) {
    const tpl = templates.cardTemplate(fr), slots = resolveSlots(tpl, { compact, grafts });
    T = slots.window ? { fr, tpl, slots, painted: !!(fr.def.under && fr.def.under.length) } : null;
    TPL.face.set(fk, T);
  }
  return T;
}

// ---------- caching ----------
// Faces are baked at a BUCKET of render scales (art/face_lod.js): the smallest step that is not below the device pixels the card is drawn at, so a 40 card deck grid
// is no longer a 3x downscale of a 1.5x bitmap every frame and a zoomed card on a DPR 3 phone is rendered at device resolution. The key carries the bucket.
const PAD = 26, LM = 14;
const cache = createFaceLru({ max: 110, budget: PIXEL_BUDGET, bigMax: BIG_MAX });
let builtNow = 0;
export function cardFrame() { builtNow = 0; } // main.js calls this once per tick: the per-frame budget of face builds
export const cardCacheStats = () => ({ faces: cache.size, pixels: cache.pixels, big: cache.bigCount, evicted: cache.stats.evicted, builds: FACE_STATS.builds, reuse: FACE_STATS.reuse });
const FACE_STATS = { builds: 0, reuse: 0 };
function faceKey(spec, lines, price, o) {
  return [spec.id, spec.up ? 1 : 0, (spec.grafts || []).join(','), (spec.fused || []).join(','), o.tithed ? 1 : 0, o.jam ? 1 : 0, o.compact ? 1 : 0, o.mark || '', o.rarity || spec.rarity || '', spec.type, spec.school || '', lines.join('|'), price.join('|')].join('#');
}
function getFace(spec, o, need, T) {
  const lines = cardLines(spec, !!o.tithed), price = priceLines(spec);
  const base = faceKey(spec, lines, price, o) + (T ? '#T:' + T.fr.id : '');
  const pick = chooseBucket(need, (b) => cache.has(base + '@' + b), builtNow);
  const key = base + '@' + pick.bucket;
  let ent = pick.build ? undefined : cache.get(key);
  if (ent) { if (pick.bucket !== idealBucket(need)) FACE_STATS.reuse++; return ent; }
  const S = pick.bucket;
  const win = T ? T.slots.window : o.compact ? ((spec.grafts || []).length ? WINCG : WINC) : WIN, I = artInfo(spec);
  const cv = makeCanvas(Math.ceil((CARD_W + PAD * 2) * S), Math.ceil((CARD_H + PAD * 2) * S));
  if (cv) {
    builtNow++; FACE_STATS.builds++;
    cv.g.setTransform(S, 0, 0, S, 0, 0); cv.g.translate(HW + PAD, HH + PAD);
    if (T) renderFaceTemplate(cv.g, spec, lines, price, o, I, T); else renderFace(cv.g, spec, lines, price, o, I, win);
    ent = { cv: cv.c, win, info: I, layers: undefined, T, S, px: cv.c.width * cv.c.height, big: S >= BIG_FROM };
    cache.set(key, ent);
    return ent;
  }
  return { direct: (g) => (T ? renderFaceTemplate(g, spec, lines, price, o, I, T) : renderFace(g, spec, lines, price, o, I, win)), win, info: I, T };
}
export function clearCardCache() { cache.clear(); backCache = {}; }
function buildLayers(ent) { // lazy: only cards that are ever tilted pay for the 3 parallax canvases
  if (ent.layers !== undefined) return ent.layers;
  const S = ent.S || 1.5, w = ent.win, I = ent.info, mk = (ww, hh) => makeCanvas(Math.ceil(ww * S), Math.ceil(hh * S));
  const a = mk(w.w + 2 * LM, w.h + 2 * LM), b = mk(w.w + 2 * LM, w.h + 2 * LM), c = mk(w.w + 2 * LM, w.h + 2 * LM), d = mk(w.w + 8, w.h + 8);
  if (!a || !b || !c || !d) { ent.layers = null; return null; }
  [a, b, c].forEach((q) => { q.g.setTransform(S, 0, 0, S, 0, 0); q.g.translate(-(w.x - LM), -(w.y - LM)); });
  d.g.setTransform(S, 0, 0, S, 0, 0); d.g.translate(-(w.x - 4), -(w.y - 4));
  drawBackLayer(a.g, I, w, LM); drawMotifLayer(b.g, I, w); drawForeLayer(c.g, I, w, LM); drawRing(d.g, I, w, w === WINC);
  ent.layers = { a: a.c, b: b.c, c: c.c, d: d.c };
  return ent.layers;
}

// ---------- cost orb (live: the specular follows the lamp) ----------
function drawCostOrb(g, spec, o, L, T) {
  const cost = o.cost === undefined ? spec.cost : o.cost, cp = !!o.compact;
  const gs = T && T.slots.costGem; // a template may move the gem (its slot) and bring its own gem image
  const r = gs ? gs.w / 2 : cp ? 25 : 20, ox = gs ? gs.x + gs.w / 2 : -HW + (cp ? 14 : 12), oy = gs ? gs.y + gs.h / 2 : -HH + (cp ? 16 : 14);
  const base = typeof spec.cost === 'number' ? spec.cost : null;
  let tint = '#2b3a44';
  if (typeof cost === 'number' && base !== null) { if (cost > base) tint = '#7a1c2c'; else if (cost < base) tint = '#2b6a3a'; }
  // the painted gem comes in the three cost states (as printed, raised, lowered); a manifest with one gem only gets the old colour wash
  const gemUp = gs && tint !== '#2b3a44' ? templates.frameImg(tint === '#7a1c2c' ? 'card_gem.up' : 'card_gem.down') : null, gem = gemUp || (gs && templates.frameImg('card_gem'));
  const unplay = spec.flags && spec.flags.unplayable;
  g.save();
  if (gem) {
    drawNineSlice(g, gem, ox - r, oy - r, r * 2, r * 2);
    if (!gemUp && tint !== '#2b3a44' && !templates.has('card_gem.up')) { g.fillStyle = tint; g.globalAlpha = 0.28; g.beginPath(); g.arc(ox, oy, r * 0.8, 0, 6.3); g.fill(); g.globalAlpha = 1; }
  } else {
  g.beginPath(); g.arc(ox - L.x * 2.5, oy - L.y * 3.5, r, 0, 6.3); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill();
  g.beginPath(); g.arc(ox, oy, r, 0, 6.3); g.fillStyle = tint; g.fill();
  g.beginPath(); g.arc(ox + 3, oy + 4, r - 3, 0, 6.3); g.fillStyle = mix(tint, '#000', 0.4); g.fill();
  g.beginPath(); g.arc(ox - 1, oy - 1.5, r - 3, 0, 6.3); g.fillStyle = tint; g.fill();
  const hx = ox + L.x * r * 0.5, hy = oy + L.y * r * 0.5, rg = g.createRadialGradient(hx, hy, 0, hx, hy, r * 0.8); rg.addColorStop(0, 'rgba(255,255,255,.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.beginPath(); g.arc(ox, oy, r - 2, 0, 6.3); g.fillStyle = rg; g.fill();
  g.lineWidth = lnw(3); g.strokeStyle = BRASS; g.beginPath(); g.arc(ox, oy, r, 0, 6.3); g.stroke();
  g.lineWidth = lnw(1.2); g.strokeStyle = INK; g.beginPath(); g.arc(ox, oy, r + 1.6, 0, 6.3); g.stroke(); g.beginPath(); g.arc(ox, oy, r - 2, 0, 6.3); g.stroke();
  g.lineWidth = lnw(1.2); g.strokeStyle = BRASS_L; g.beginPath(); g.arc(ox, oy, r - 0.2, 3.4, 4.8); g.stroke();
  }
  const txt = unplay && cost === undefined ? '-' : String(cost === undefined || cost === null ? '-' : cost);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(txt.length > 1 ? (cp ? 26 : 20) : (cp ? 32 : 25), { bold: true }); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(txt, ox + 1, oy + 2);
  if (gem) { g.lineJoin = 'round'; g.lineWidth = cp ? 5 : 4; g.strokeStyle = 'rgba(16,10,8,.85)'; g.strokeText(txt, ox, oy + 1); } // facets are busy: the number keeps an ink edge
  g.fillStyle = tint === '#7a1c2c' ? '#ffd6d6' : tint === '#2b6a3a' ? '#d6ffd9' : '#f6ecd2'; g.fillText(txt, ox, oy + 1);
  // "+N cost" badge: a small red orb with an up arrow on the cost orb whenever the effective cost is above the printed one (Heavy Hands, Leaden, jams, Costup)
  if (typeof cost === 'number' && base !== null && cost > base) {
    const br = r * 0.52, bx = ox + r * 0.78, by = oy + r * 0.82;
    g.beginPath(); g.arc(bx, by, br + 1.8, 0, 6.3); g.fillStyle = INK; g.fill();
    g.beginPath(); g.arc(bx, by, br, 0, 6.3); g.fillStyle = '#e0453a'; g.fill(); g.lineWidth = lnw(1.6); g.strokeStyle = '#ffd6d6'; g.stroke();
    g.beginPath(); g.moveTo(bx, by - br * 0.62); g.lineTo(bx + br * 0.5, by + br * 0.02); g.lineTo(bx + br * 0.17, by + br * 0.02); g.lineTo(bx + br * 0.17, by + br * 0.6); g.lineTo(bx - br * 0.17, by + br * 0.6); g.lineTo(bx - br * 0.17, by + br * 0.02); g.lineTo(bx - br * 0.5, by + br * 0.02); g.closePath(); g.fillStyle = '#fff'; g.fill();
  }
  g.restore();
}

// ---------- live rarity layers ----------
const _P = { x: 0, y: 0 };
function perim(u) { const W = CARD_W - 10, H = CARD_H - 10, P = 2 * (W + H); let d = (((u % 1) + 1) % 1) * P; const x0 = -W / 2, y0 = -H / 2; if (d < W) { _P.x = x0 + d; _P.y = y0; } else if ((d -= W) < H) { _P.x = x0 + W; _P.y = y0 + d; } else if ((d -= H) < W) { _P.x = x0 + W - d; _P.y = y0 + H; } else { d -= W; _P.x = x0; _P.y = y0 + H - d; } return _P; }
function glint(g, x, y, s, a) { g.strokeStyle = `rgba(255,238,170,${a})`; g.lineWidth = lnw(1.1); g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke(); g.fillStyle = `rgba(255,250,220,${a})`; g.beginPath(); g.arc(x, y, 1.3, 0, 6.3); g.fill(); }
function drawFoil(g, win, t, tx, ty) { // diagonal overlay + color-dodge band, clipped to the art, moving with time and tilt
  g.save(); rr(g, win.x, win.y, win.w, win.h, 5); g.clip();
  const ph = ((((t * 0.26 + tx * 0.28 + ty * 0.14) % 1.5) + 1.5) % 1.5), px = win.x - 50 + (win.w + 100) * (ph / 1.1), cy = win.y + win.h / 2;
  const gr = g.createLinearGradient(px - 52, cy - 30, px + 52, cy + 30);
  gr.addColorStop(0, 'rgba(255,214,120,0)'); gr.addColorStop(0.3, 'rgba(255,205,110,.5)'); gr.addColorStop(0.5, 'rgba(255,248,232,.8)'); gr.addColorStop(0.7, 'rgba(150,226,255,.5)'); gr.addColorStop(1, 'rgba(255,160,200,0)');
  g.globalCompositeOperation = 'overlay'; g.fillStyle = gr; g.fillRect(win.x, win.y, win.w, win.h);
  g.globalCompositeOperation = 'color-dodge'; g.globalAlpha = 0.45; g.fillRect(win.x, win.y, win.w, win.h);
  g.restore();
}
function drawCardLive(g, spec, o, win, t, L, junk, id) {
  const rarity = o.rarity || spec.rarity || 'common';
  // lamp rim: 1.5px light stroke on the lit edges
  if (!junk) {
    rr(g, -HW + 0.75, -HH + 0.75, CARD_W - 1.5, CARD_H - 1.5, 11.5);
    const gr = g.createLinearGradient(L.x * HW, L.y * HH, -L.x * HW, -L.y * HH); gr.addColorStop(0, 'rgba(255,244,212,.85)'); gr.addColorStop(0.35, 'rgba(255,244,212,.22)'); gr.addColorStop(0.6, 'rgba(255,244,212,0)');
    g.lineWidth = lnw(1.5); g.strokeStyle = gr; g.stroke();
    g.save(); rr(g, -HW, -HH, CARD_W, CARD_H, 12); g.clip();
    const sx = L.x * HW * 0.5, sy = L.y * HH * 0.5, sh = g.createRadialGradient(sx, sy, 6, sx, sy, 230); sh.addColorStop(0, 'rgba(255,245,215,.12)'); sh.addColorStop(1, 'rgba(255,245,215,0)'); g.fillStyle = sh; g.fillRect(-HW, -HH, CARD_W, CARD_H);
    if (rarity === 'uncommon' || rarity === 'rare') { // edge light sweep every 4 s
      const ph = (t % 4) / 4;
      if (ph < 0.45) { const u = ph / 0.45, cx = -HW - 60 + (CARD_W + 120) * u, sg = g.createLinearGradient(cx - 40, -HH, cx + 40, HH * 0.4); sg.addColorStop(0, 'rgba(255,248,226,0)'); sg.addColorStop(0.5, `rgba(255,248,226,${0.26 * Math.sin(u * Math.PI)})`); sg.addColorStop(1, 'rgba(255,248,226,0)'); g.fillStyle = sg; g.fillRect(-HW, -HH, CARD_W, CARD_H); }
    }
    g.restore();
    if (rarity === 'rare') {
      drawFoil(g, win, t, (o.tilt && o.tilt.x) || 0, (o.tilt && o.tilt.y) || 0);
      const fo = templates.ready() && templates.frameImg('card_foil'); // optional foil layer part: an overlay that slides with time and tilt
      if (fo) { g.save(); rr(g, -HW, -HH, CARD_W, CARD_H, 12); g.clip(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.25 + 0.2 * Math.sin(t * 1.3 + ((o.tilt && o.tilt.x) || 0) * 2); drawNineSlice(g, fo, -HW + Math.sin(t * 0.4) * 6, -HH, CARD_W, CARD_H); g.restore(); }
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) { const p = perim(t * 0.07 + i / 3), a = 0.5 + 0.5 * Math.sin(t * 3.1 + i * 2.1); glint(g, p.x, p.y, 3 + a * 5, 0.25 + a * 0.6); }
      g.restore();
    }
  }
  void id;
}

// ---------- drawCard ----------
export function drawCard(ctx, spec, x, y, o = {}) {
  const s = o.scale || 1, t = o.t !== undefined ? o.t : (o.still ? 0 : nowT()), L = lightDir(t, _L);
  ctx.save();
  ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale(s, s);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.selected) ctx.translate(0, -14); else if (o.hover) ctx.translate(0, -6);
  const cid = spec.id || spec.name || 'x', T = faceTemplate(spec, o), junk = spec.type === 'junk' && !(T && T.painted); // junk: the torn procedural outline (a painted junk frame is a plain rounded card)
  // contact shadow, thrown away from the lamp
  const sdx = -L.x * 7, sdy = -L.y * 10;
  ctx.save(); ctx.translate(sdx, sdy); cardPath(ctx, junk, cid); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fill(); ctx.translate(sdx * 0.3, sdy * 0.3); cardPath(ctx, junk, cid); ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.fill(); ctx.restore();
  const gl = o.glow || 0;
  if (gl > 0 || o.selected) {
    const col = o.glowColor || (o.glow && schoolOf(spec) && o.schoolGlow ? COLX[schoolOf(spec)] : COLX.lamp);
    const a = o.selected ? Math.max(gl, 0.7) : gl;
    for (let i = 4; i >= 1; i--) { rr(ctx, -HW - i * 3, -HH - i * 3, CARD_W + i * 6, CARD_H + i * 6, 12 + i * 3); ctx.fillStyle = alpha(col, a * 0.1); ctx.fill(); }
  }
  const face = getFace(spec, o, FLAGS.faceLod && typeof ctx.getTransform === 'function' ? deviceScale(ctx) : LEGACY, T), win = face.win, tl = o.tilt, tx = tl ? tl.x || 0 : 0, ty = tl ? tl.y || 0 : 0;
  if (face.cv) {
    ctx.drawImage(face.cv, -HW - PAD, -HH - PAD, CARD_W + PAD * 2, CARD_H + PAD * 2);
    if (tl && (Math.abs(tx) > 0.02 || Math.abs(ty) > 0.02) && !(T && T.painted && o.compact)) { // 3-layer parallax: back wash 2px, motif 5px, foreground 9px (not under the number a painted hand face puts on the picture)
      const ly = buildLayers(face);
      if (ly) {
        ctx.save(); rr(ctx, win.x, win.y, win.w, win.h, 5); ctx.clip();
        const ww = win.w + 2 * LM, hh = win.h + 2 * LM, bx = win.x - LM, by = win.y - LM;
        ctx.drawImage(ly.a, bx + tx * 2, by + ty * 2, ww, hh); ctx.drawImage(ly.b, bx + tx * 5, by + ty * 5, ww, hh); ctx.drawImage(ly.c, bx + tx * 9, by + ty * 9, ww, hh);
        ctx.restore();
        if (T && T.painted) { ctx.save(); ctx.beginPath(); ctx.rect(win.x - 1, win.y - 1, win.w + 2, win.h + 2); ctx.clip(); drawNineSlice(ctx, T.fr, -HW, -HH, CARD_W, CARD_H); ctx.restore(); } // the frame's corner pieces lie over the picture again
        else ctx.drawImage(ly.d, win.x - 4, win.y - 4, win.w + 8, win.h + 8);
      }
    }
  } else face.direct(ctx);
  drawCardLive(ctx, spec, o, win, t, L, junk, cid);
  drawCostOrb(ctx, spec, o, L, face.T);
  if (o.hover && !o.selected) { cardPath(ctx, junk, cid); ctx.lineWidth = lnw(1.5); ctx.strokeStyle = 'rgba(232,220,196,.45)'; ctx.stroke(); }
  if (o.selected || gl > 0.5) { cardPath(ctx, junk, cid); ctx.lineWidth = lnw(o.selected ? 4.5 : 2.5); ctx.strokeStyle = o.selected ? '#f2c14e' : COLX.lamp; ctx.stroke(); }
  if (o.preview) { rr(ctx, -HW - 3, -HH - 3, CARD_W + 6, CARD_H + 6, 14); ctx.lineWidth = lnw(2); setDash(ctx, [8, 5]); ctx.strokeStyle = COLX.lamp; ctx.stroke(); setDash(ctx, []); }
  if (CB.on && !junk && !o.noCb) drawCbChip(ctx, spec);
  if (o.dim > 0) { cardPath(ctx, junk, cid); ctx.fillStyle = `rgba(12,8,8,${Math.min(0.85, o.dim * 0.7)})`; ctx.fill(); }
  ctx.restore(); BB = null;
}

// Colourblind chip: card type letter + a school-specific fill pattern, bottom-left. Not colour dependent.
const PAT_OF = { ember: 'diag', echo: 'waves', hoard: 'dots', blood: 'drops', rust: 'cross', static: 'zig', gilded: 'check' };
function drawCbChip(ctx, spec) {
  const sc = schoolOf(spec), x = -HW + 10, y = HH - 30, w = 54, h = 18;
  ctx.save(); rr(ctx, x, y, w, h, 4); ctx.fillStyle = 'rgba(14,14,14,.88)'; ctx.fill(); ctx.clip();
  ctx.strokeStyle = sc ? COLX[sc] : '#ddd'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = lnw(1.5);
  const p = PAT_OF[sc] || 'none'; ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const px = x + 18 + i * 4.5;
    if (p === 'diag') { ctx.moveTo(px, y + h); ctx.lineTo(px + 6, y); } else if (p === 'waves') { ctx.moveTo(px, y + 5 + (i % 2) * 6); ctx.lineTo(px + 4, y + 11 - (i % 2) * 6); } else if (p === 'cross') { ctx.moveTo(px, y); ctx.lineTo(px + 4, y + h); ctx.moveTo(px + 4, y); ctx.lineTo(px, y + h); } else if (p === 'zig') { ctx.moveTo(px, y + 3 + (i % 2) * 12); ctx.lineTo(px + 4.5, y + 15 - (i % 2) * 12); } else if (p === 'check') { if (i % 2 === 0) ctx.rect(px, y + 2, 4.5, 7); else ctx.rect(px, y + 9, 4.5, 7); } else if (p === 'dots') { ctx.moveTo(px + 2, y + 5); ctx.arc(px + 1, y + 5 + (i % 2) * 8, 1.6, 0, 6.3); } else if (p === 'drops') { ctx.moveTo(px, y + 3); ctx.lineTo(px + 2, y + 15); }
  }
  if (p === 'check' || p === 'dots') ctx.fill(); else ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.font = font(12, { bold: true, ui: true }); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(({ attack: 'A', skill: 'S', power: 'P' })[spec.type] || '', x + 9, y + h / 2 + 1); ctx.restore();
}
// ---------- card back: a stitched suture cross over a vellum wound ----------
let backCache = {}, curBack = 'plain';
function lens(g, len, wid, vertical) { g.beginPath(); if (vertical) { g.moveTo(0, -len); g.quadraticCurveTo(wid, 0, 0, len); g.quadraticCurveTo(-wid, 0, 0, -len); } else { g.moveTo(-len, 0); g.quadraticCurveTo(0, -wid, len, 0); g.quadraticCurveTo(0, wid, -len, 0); } g.closePath(); }
export const BACK_IDS = ['plain', 'ledger', 'bone', 'verdigris', 'oxblood', 'gilt', 'tapestry', 'ward_lamp'];
export function setCardBack(id) { curBack = BACK_IDS.includes(id) ? id : 'plain'; }
// Palette per back: base fill, the two frame strokes, the pulse glow and the motif ink. Motifs are drawn in -HW..HW, -HH..HH space.
const PAL = {
  plain: { base: '#3d352e', f1: 'rgba(201,162,39,.65)', f2: 'rgba(232,220,196,.35)', glow: '190,40,52', ink: '#7a2230', txt: 'rgba(232,220,196,.8)' },
  ledger: { base: '#23382b', f1: 'rgba(214,190,110,.7)', f2: 'rgba(200,226,196,.35)', glow: '110,190,120', ink: '#a9c9a2', txt: 'rgba(214,236,206,.8)' },
  bone: { base: '#cbbf9f', f1: 'rgba(90,70,40,.7)', f2: 'rgba(60,44,30,.35)', glow: '255,244,212', ink: '#4a3c2a', txt: 'rgba(58,44,30,.85)' },
  verdigris: { base: '#1f4a47', f1: 'rgba(150,224,200,.65)', f2: 'rgba(170,230,210,.35)', glow: '90,200,180', ink: '#9ad8c4', txt: 'rgba(200,240,226,.8)' },
  oxblood: { base: '#4a1219', f1: 'rgba(222,150,130,.6)', f2: 'rgba(240,190,170,.3)', glow: '220,60,60', ink: '#d6806c', txt: 'rgba(246,206,190,.8)' },
  gilt: { base: '#1a1613', f1: 'rgba(242,193,78,.95)', f2: 'rgba(242,193,78,.5)', glow: '242,193,78', ink: '#f2c14e', txt: 'rgba(246,214,130,.9)' },
  tapestry: { base: '#4d2c3c', f1: 'rgba(230,190,120,.7)', f2: 'rgba(230,200,150,.4)', glow: '230,150,90', ink: '#e0b67a', txt: 'rgba(240,214,170,.85)' },
  ward_lamp: { base: '#131c2c', f1: 'rgba(255,190,90,.7)', f2: 'rgba(160,190,240,.35)', glow: '255,190,90', ink: '#ffc766', txt: 'rgba(206,222,250,.85)' },
};
function strokeLines(g, pts, col, w) { g.beginPath(); for (const [x1, y1, x2, y2] of pts) { g.moveTo(x1, y1); g.lineTo(x2, y2); } g.lineWidth = lnw(w); g.strokeStyle = col; g.lineCap = 'round'; g.stroke(); }
function ring(g, x, y, r, col, w) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.lineWidth = lnw(w); g.strokeStyle = col; g.stroke(); }
const MOTIF = {
  ledger(g, P) { // ruled ledger page: column rules, row ticks, a wax seal
    const L = []; for (let y = -96; y <= 96; y += 12) L.push([-62, y, 62, y]);
    strokeLines(g, L, 'rgba(200,226,196,.16)', 1);
    strokeLines(g, [[-30, -100, -30, 100], [30, -100, 30, 100], [-62, -100, -62, 100], [62, -100, 62, 100]], 'rgba(214,190,110,.5)', 1.2);
    const T = []; for (let y = -90; y <= 90; y += 12) T.push([-58, y, -40, y], [40, y, 58, y]);
    strokeLines(g, T, P.ink, 1.6);
    circ(g, 0, 0, 22, '#7a2230', 2); ring(g, 0, 0, 16, 'rgba(255,214,200,.5)', 1.2); strokeLines(g, [[-8, 0, 8, 0], [0, -8, 0, 8]], 'rgba(255,214,200,.7)', 2.2);
  },
  bone(g, P) { // spine: stacked vertebrae with a thread down the middle, ribs fanning out
    for (let i = 0; i < 7; i++) { const y = -84 + i * 28, w = 22 - Math.abs(i - 3) * 1.5; rr(g, -w / 2, y - 9, w, 18, 6); g.fillStyle = '#e6dcc0'; g.fill(); g.lineWidth = lnw(1.8); g.strokeStyle = P.ink; g.stroke(); }
    for (let i = 0; i < 6; i++) { const y = -70 + i * 28; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 11, y); g.quadraticCurveTo(sd * 52, y - 6, sd * 56, y + 24); g.lineWidth = lnw(3); g.strokeStyle = '#e6dcc0'; g.stroke(); g.lineWidth = lnw(1); g.strokeStyle = P.ink; g.stroke(); } }
    strokeLines(g, [[0, -96, 0, 96]], '#7a2230', 1.4);
  },
  verdigris(g, P) { // rosette: eight petals and a patina ring
    for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * Math.PI / 4); g.beginPath(); g.ellipse(0, -34, 12, 30, 0, 0, 6.2832); g.lineWidth = lnw(2.2); g.strokeStyle = P.ink; g.stroke(); g.fillStyle = 'rgba(154,216,196,.14)'; g.fill(); g.restore(); }
    ring(g, 0, 0, 70, P.ink, 1.4); ring(g, 0, 0, 76, 'rgba(154,216,196,.3)', 1); circ(g, 0, 0, 9, P.ink, 0); circ(g, 0, 0, 4, '#1f4a47', 0);
    const r = rngOf('verdi'); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(170,236,210,.12)'; g.beginPath(); g.arc(-HW + r() * CARD_W, -HH + r() * CARD_H, 1 + r() * 4, 0, 6.3); g.fill(); }
  },
  oxblood(g, P) { // diamond lattice, a stitched cross and a heart
    const L = []; for (let k = -150; k <= 150; k += 20) { L.push([k, -110, k + 110, 0], [k, -110, k - 110, 0], [k, 110, k + 110, 0], [k, 110, k - 110, 0]); }
    g.save(); rr(g, -HW + 14, -HH + 14, CARD_W - 28, CARD_H - 28, 5); g.clip(); strokeLines(g, L, 'rgba(240,170,150,.16)', 1); g.restore();
    g.beginPath(); g.moveTo(0, 30); g.bezierCurveTo(-48, -2, -30, -44, 0, -18); g.bezierCurveTo(30, -44, 48, -2, 0, 30); g.fillStyle = '#8c1c28'; g.fill(); g.lineWidth = lnw(2.6); g.strokeStyle = '#1b0508'; g.stroke();
    const S = []; for (let i = -70; i <= 70; i += 14) { if (Math.abs(i) < 16) continue; S.push([-5, i, 5, i + 4], [-5, i + 4, 5, i]); } strokeLines(g, S, P.ink, 1.8);
    strokeLines(g, [[0, -100, 0, 100]], 'rgba(240,190,170,.25)', 1);
  },
  gilt(g, P) { // sunburst: rays, a triple-ruled inner frame and a gilt boss
    const R = []; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, c = Math.cos(a), s = Math.sin(a); R.push([c * 18, s * 18, c * (i % 2 ? 62 : 82), s * (i % 2 ? 62 : 82)]); }
    strokeLines(g, R, P.ink, 1.6); ring(g, 0, 0, 90, 'rgba(242,193,78,.55)', 1.2); ring(g, 0, 0, 96, 'rgba(242,193,78,.3)', 1);
    circ(g, 0, 0, 16, '#f2c14e', 2); circ(g, 0, 0, 9, '#1a1613', 1.4); ring(g, 0, 0, 24, P.ink, 1.2);
    rr(g, -HW + 5, -HH + 5, CARD_W - 10, CARD_H - 10, 9); g.lineWidth = lnw(1); g.strokeStyle = 'rgba(242,193,78,.55)'; g.stroke();
  },
  tapestry(g, P) { // woven weft and warp, a diamond medallion with a stitched star
    const W2 = []; for (let x = -70; x <= 70; x += 7) W2.push([x, -104, x, 104]); strokeLines(g, W2, 'rgba(230,190,120,.1)', 2);
    const W3 = []; for (let y = -104; y <= 104; y += 7) W3.push([-70, y, 70, y]); strokeLines(g, W3, 'rgba(120,60,90,.35)', 2);
    g.beginPath(); g.moveTo(0, -70); g.lineTo(46, 0); g.lineTo(0, 70); g.lineTo(-46, 0); g.closePath(); g.fillStyle = 'rgba(40,20,32,.7)'; g.fill(); g.lineWidth = lnw(2.4); g.strokeStyle = P.ink; g.stroke();
    g.beginPath(); g.moveTo(0, -48); g.lineTo(30, 0); g.lineTo(0, 48); g.lineTo(-30, 0); g.closePath(); g.lineWidth = lnw(1.2); g.strokeStyle = 'rgba(230,200,150,.6)'; g.stroke();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a); strokeLines(g, [[c * 5, s * 5, c * (i % 2 ? 14 : 22), s * (i % 2 ? 14 : 22)]], P.ink, 1.8); }
    const D = []; for (let y = -96; y <= 96; y += 16) { if (Math.abs(y) < 74) continue; D.push([-40, y, -30, y + 6], [-20, y, -10, y + 6], [0, y, 10, y + 6], [20, y, 30, y + 6], [40, y, 50, y + 6]); } strokeLines(g, D, P.ink, 1.6);
  },
  ward_lamp(g, P) { // the ward lamp: hanging chain, glass, flame, long glow and window mullions behind
    strokeLines(g, [[-40, -104, -40, 104], [40, -104, 40, 104], [-40, -30, 40, -30], [-40, 40, 40, 40]], 'rgba(160,190,240,.12)', 2);
    strokeLines(g, [[0, -104, 0, -62]], P.ink, 1.6); for (let y = -102; y < -64; y += 8) ring(g, 0, y, 2.6, P.ink, 1.2);
    const gl = g.createRadialGradient(0, 8, 4, 0, 8, 80); gl.addColorStop(0, 'rgba(255,200,110,.55)'); gl.addColorStop(1, 'rgba(255,200,110,0)'); g.fillStyle = gl; g.fillRect(-90, -80, 180, 180);
    g.beginPath(); g.moveTo(-14, -60); g.lineTo(14, -60); g.lineTo(22, 12); g.quadraticCurveTo(0, 30, -22, 12); g.closePath(); g.fillStyle = 'rgba(40,52,80,.8)'; g.fill(); g.lineWidth = lnw(2.4); g.strokeStyle = P.ink; g.stroke();
    g.beginPath(); g.moveTo(0, -4); g.quadraticCurveTo(-11, -18, 0, -34); g.quadraticCurveTo(11, -18, 0, -4); g.fillStyle = '#ffd98a'; g.fill(); g.lineWidth = lnw(1.2); g.strokeStyle = '#7a3c10'; g.stroke();
    rr(g, -18, -68, 36, 8, 3); g.fillStyle = P.ink; g.fill(); rr(g, -12, 22, 24, 8, 3); g.fillStyle = P.ink; g.fill();
  },
};
function renderBack(g, id = 'plain') {
  const P = PAL[id] || PAL.plain;
  rr(g, -HW, -HH, CARD_W, CARD_H, 12); g.fillStyle = P.base; g.fill(); shadeCurrent(g, P.base, 0, 0, 190, 2);
  g.save(); rr(g, -HW, -HH, CARD_W, CARD_H, 12); g.clip(); const r = rngOf('back');
  for (let i = 0; i < 140; i++) { g.fillStyle = r() > 0.5 ? 'rgba(20,14,10,.12)' : 'rgba(255,240,220,.06)'; g.beginPath(); g.arc(-HW + r() * CARD_W, -HH + r() * CARD_H, 0.8 + r() * 3, 0, 6.3); g.fill(); }
  rr(g, -HW + 8, -HH + 8, CARD_W - 16, CARD_H - 16, 7); g.lineWidth = lnw(id === 'gilt' ? 2.2 : 1.2); g.strokeStyle = P.f1; g.stroke();
  rr(g, -HW + 12, -HH + 12, CARD_W - 24, CARD_H - 24, 5); g.lineWidth = lnw(0.8); setDash(g, [3, 3]); g.strokeStyle = P.f2; g.stroke(); setDash(g, []);
  if (MOTIF[id]) { g.save(); MOTIF[id](g, P); g.restore(); }
  g.restore();
  rr(g, -HW, -HH, CARD_W, CARD_H, 12); g.lineWidth = lnw(2.5); g.strokeStyle = INK; g.stroke(); bevel(g, -HW, -HH, CARD_W, CARD_H, 12, 2, 0.4);
  if (id === 'plain') {
    // the wound: two crossing lenses, lips first, then the vellum showing through
    const arms = [[62, 17, false], [96, 17, true]];
    arms.forEach(([len, wid, v]) => { lens(g, len, wid, v); g.lineWidth = lnw(7); g.strokeStyle = '#2a1612'; g.lineJoin = 'round'; g.stroke(); lens(g, len, wid, v); g.lineWidth = lnw(3); g.strokeStyle = '#7a2230'; g.stroke(); });
    arms.forEach(([len, wid, v]) => { lens(g, len, wid, v); fs(g, '#d8c8a6', 0, 2); });
    const fp = fibrePat(g); if (fp) { g.save(); arms.forEach(([len, wid, v]) => { lens(g, len, wid, v); g.clip(); }); g.globalCompositeOperation = 'multiply'; g.fillStyle = fp; g.fillRect(-100, -100, 200, 200); g.restore(); }
    // stitches across both arms (dark thread over a 1px light emboss)
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      for (let i = -80; i <= 80; i += 13) { if (Math.abs(i) < 14) continue; const o = pass ? 0 : 1, w2 = 14 * (1 - Math.abs(i) / 110); g.moveTo(-w2 + o, i + o - 2); g.lineTo(w2 + o, i + o + 2); }
      for (let i = -52; i <= 52; i += 13) { if (Math.abs(i) < 14) continue; const o = pass ? 0 : 1, h2 = 14 * (1 - Math.abs(i) / 80); g.moveTo(i + o - 2, -h2 + o); g.lineTo(i + o + 2, h2 + o); }
      g.lineWidth = lnw(2); g.lineCap = 'round'; g.strokeStyle = pass ? '#0e0e0e' : 'rgba(255,246,220,.5)'; g.stroke();
    }
    circ(g, 0, 0, 5.5, BRASS, 1.6); circ(g, -1.4, -1.6, 1.6, BRASS_L, 0);
  }
  [[-HW + 14, -HH + 14, 0.78], [HW - 14, -HH + 14, -0.78], [-HW + 14, HH - 14, -0.78], [HW - 14, HH - 14, 0.78]].forEach(([x, y, a]) => staple(g, x, y, 18, a));
  g.font = font(11, { bold: true, ui: true }); g.textAlign = 'center'; g.textBaseline = 'middle'; try { if ('letterSpacing' in g) g.letterSpacing = '3px'; } catch (e) { /* none */ }
  engrave(g, 'GRAFTWORK', 0, 124, P.txt, true);
  BB = null;
}
function backTemplate(bid, o) {
  templates.ensure();
  if (!templates.ready()) return null;
  const fr = templates.pickFrame(cardBackIds(bid, o.hero, o.act));
  return fr ? { fr, tpl: templates.cardBackTemplate(fr) } : null;
}
function renderBackTemplate(g, BT, P) {
  const slots = resolveSlots(BT.tpl, {}), t = slots.title, own = !!(BT.tpl.slots.title && BT.tpl.slots.title !== CARD_BACK_TEMPLATE.slots.title);
  drawNineSlice(g, BT.fr, -HW, -HH, CARD_W, CARD_H);
  if (t && !(BT.fr.def.baked || []).includes('title')) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (own) { // the painting has a brass plate for the title: dark engraved letters, sized to the plate
      let sp = 3, sz = 11; g.font = font(sz, { bold: true, ui: true });
      while (sz > 8 && g.measureText('GRAFTWORK').width + 9 * sp > t.w - 12) { if (sp > 1) sp -= 0.5; else { sz -= 0.5; g.font = font(sz, { bold: true, ui: true }); } }
      try { if ('letterSpacing' in g) g.letterSpacing = sp + 'px'; } catch (e) { /* none */ }
      engrave(g, 'GRAFTWORK', t.x + t.w / 2 + sp / 2, t.y + t.h / 2 + 0.5, '#2a1a0e');
      try { if ('letterSpacing' in g) g.letterSpacing = '0px'; } catch (e) { /* none */ }
    } else {
      g.font = font(11, { bold: true, ui: true }); try { if ('letterSpacing' in g) g.letterSpacing = '3px'; } catch (e) { /* none */ }
      engrave(g, 'GRAFTWORK', t.x + t.w / 2, t.y + t.h / 2, P.txt, true);
    }
  }
  BB = null;
}
export function drawCardBack(ctx, x, y, o = {}) {
  const t = o.t !== undefined ? o.t : nowT(), L = lightDir(t, _L);
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); const s = o.scale || 1; ctx.scale(s, s); if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.hover) ctx.translate(0, -6);
  ctx.save(); ctx.translate(-L.x * 7, -L.y * 10); rr(ctx, -HW, -HH, CARD_W, CARD_H, 12); ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.fill(); ctx.restore();
  const bid = BACK_IDS.includes(o.back) ? o.back : curBack, P = PAL[bid];
  const BT = backTemplate(bid, o), bkey = BT ? bid + '@' + BT.fr.id : bid; // a template back (per hero or act when the manifest has one) replaces the procedural one
  if (backCache[bkey] === undefined) { const BS = LEGACY, cv = makeCanvas(Math.ceil((CARD_W + 8) * BS), Math.ceil((CARD_H + 8) * BS)); if (cv) { cv.g.setTransform(BS, 0, 0, BS, 0, 0); cv.g.translate(HW + 4, HH + 4); if (BT) renderBackTemplate(cv.g, BT, P); else renderBack(cv.g, bid); backCache[bkey] = cv.c; } else backCache[bkey] = false; }
  if (backCache[bkey]) ctx.drawImage(backCache[bkey], -HW - 4, -HH - 4, CARD_W + 8, CARD_H + 8); else if (BT) renderBackTemplate(ctx, BT, P); else renderBack(ctx, bid);
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.6), pg = ctx.createRadialGradient(0, 0, 4, 0, 0, 84); pg.addColorStop(0, `rgba(${P.glow},${(bid === 'bone' ? 0.06 : 0.1) + 0.16 * pulse * (bid === 'bone' ? 0.4 : 1)})`); pg.addColorStop(1, `rgba(${P.glow},0)`); ctx.fillStyle = pg; ctx.fillRect(-90, -100, 180, 200);
  rr(ctx, -HW + 0.75, -HH + 0.75, CARD_W - 1.5, CARD_H - 1.5, 11.5);
  const rg = ctx.createLinearGradient(L.x * HW, L.y * HH, -L.x * HW, -L.y * HH); rg.addColorStop(0, 'rgba(255,244,212,.7)'); rg.addColorStop(0.35, 'rgba(255,244,212,.15)'); rg.addColorStop(0.6, 'rgba(255,244,212,0)'); ctx.lineWidth = lnw(1.5); ctx.strokeStyle = rg; ctx.stroke();
  if (o.dim > 0) { rr(ctx, -HW, -HH, CARD_W, CARD_H, 12); ctx.fillStyle = `rgba(12,8,8,${Math.min(0.85, o.dim * 0.7)})`; ctx.fill(); }
  ctx.restore(); BB = null;
}

// The size the rules text gets in a box maxW wide and avail high: the largest of 15 down to `floor` (8; a painted frame's smaller text window goes to 7)
// at which rules plus price fit. `fits` is false when even the floor spills (the text is then drawn anyway).
export function cardTextFit(g, lines, price, maxW, avail, floor = 8) {
  let best = null; const psMin = floor < 8 ? floor + 0.5 : 8.5;
  for (let s = 15; s >= floor; s -= 0.5) {   // Overload cards stack three grafts of text: keep shrinking rather than spill off the face
    g.font = font(s); const lh = s * (s < 10 ? 1.1 : 1.2);
    const rl = lines.map((l) => wrapText(g, l, maxW)); const rn = rl.reduce((a, b) => a + b.length, 0);
    const rH = rn * lh + Math.max(0, rl.length - 1) * 2.5;
    const ps = Math.max(psMin, Math.min(13, s - 2)); g.font = font(ps, { bold: true });
    const pl = price.map((l) => wrapText(g, l, maxW)); const pn = pl.reduce((a, b) => a + b.length, 0);
    const pH = pn ? pn * ps * 1.2 + 12 : 0;
    best = { s, lh, rl, rH, ps, pl, pH };
    if (rH + pH + 4 <= avail) break;
  }
  best.fits = best.rH + best.pH + 4 <= avail;
  return best;
}
function layoutText(g, spec, lines, price, o, box) { // box: the text slot of a template face; the default is the procedural layout
  const MAXW = box ? box.w : 176, TOP = box ? box.y : 2, BOT = box ? box.y + box.h : 143, AVAIL = BOT - TOP, CX = box ? box.x + box.w / 2 : 0;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const flavor = spec.flavor ? String(spec.flavor) : '';
  const { s, lh, rl, rH, ps, pl, pH } = cardTextFit(g, lines, price, MAXW, AVAIL, box && AVAIL < 120 ? 7 : 8);
  let fl = [], fH = 0;
  if (flavor) { g.font = font(11, { italic: true }); fl = wrapText(g, flavor, MAXW); if (fl.length > 2) fl.length = 2; fH = fl.length * 12.5 + 5; }
  const flavorOk = fH && rH + pH + fH + 6 <= AVAIL;
  const reserveBottom = flavorOk ? fH : 0;
  const lower = BOT - reserveBottom;
  // price block anchored above the flavor, rules centered in the rest
  const priceTop = lower - pH;
  const zoneTop = TOP + 2, zoneBot = pH ? priceTop - 2 : lower;
  let y = zoneTop + Math.max(0, (zoneBot - zoneTop - rH) / 2);
  g.font = font(s); g.fillStyle = o.tithed ? '#5f5048' : INK;
  rl.forEach((group) => { group.forEach((ln) => { y += lh; g.fillText(ln, CX, y - lh * 0.22); }); y += 2.5; });
  if (pH) {
    const dy = priceTop + 2;
    g.beginPath(); g.moveTo(CX - 80, dy); g.lineTo(CX + 80, dy); g.lineWidth = lnw(1.4); g.strokeStyle = '#0e0e0e'; setDash(g, [5, 3]); g.stroke(); setDash(g, []);
    g.beginPath(); for (let x = CX - 76; x <= CX + 76; x += 10) { g.moveTo(x - 2, dy - 2.5); g.lineTo(x + 2, dy + 2.5); } g.lineWidth = lnw(1); g.stroke();
    g.font = font(ps, { bold: true }); g.fillStyle = o.tithed ? '#8a3a44' : COLX.scar; let py = dy + 7;
    pl.forEach((group) => group.forEach((ln) => { py += ps * 1.2; g.fillText(ln, CX, py - ps * 0.25); }));
  }
  if (flavorOk) { g.font = font(11, { italic: true }); g.fillStyle = 'rgba(43,30,26,.72)'; fl.forEach((ln, i) => g.fillText(ln, CX, BOT - fH + 11 + i * 12.5 + 3)); }
  void spec;
}

// ---------- graft tile (offers, shop, deck view). TOP-LEFT anchored ----------
export function drawGraftPatch(ctx, graft, x, y, w, h, o = {}) {
  const sc = o.scale || 1, col = COLX[graft.school] || '#888', g = ctx;
  const lift = o.hover && !o.sold ? -4 : 0;
  g.save();
  g.translate(x + w / 2, y + h / 2 + lift); g.scale(sc, sc); g.translate(-w / 2, -h / 2);
  const pts = patchPoints(0, 0, w, h, graft.id || 'g');
  // shadow + body
  poly(g, pts.map((p) => [p[0] + 3, p[1] + 5])); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill();
  { const bc = mix(col, INK, o.hover ? 0.18 : 0.3); poly(g, pts); g.fillStyle = bc; g.fill(); shadeCurrent(g, bc, w / 2, h / 2, Math.max(w, h) * 0.6, 2); BB = null; }
  g.save(); poly(g, pts); g.clip(); const r = rngOf('gp:' + graft.id);
  const wp = weavePat(g); if (wp) { g.globalAlpha = 0.14; g.fillStyle = wp; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,240,220,${0.04 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  g.restore();
  poly(g, pts); g.lineWidth = lnw(2); g.strokeStyle = INK; g.stroke();
  const inset = pts.map((p) => [p[0] + (w / 2 - p[0]) * (5 / (w / 2)), p[1] + (h / 2 - p[1]) * (5 / (h / 2))]);
  stitchAround(g, pts, 0, 8, '#0e0e0e', 1.7); poly(g, inset); g.lineWidth = lnw(1.2); setDash(g, [4, 3]); g.strokeStyle = 'rgba(14,14,14,.8)'; g.stroke(); setDash(g, []);
  const pad = Math.max(10, w * 0.07);
  // glyph + name
  const gr = Math.min(16, Math.max(10, w * 0.075));
  rr(g, pad - 4, pad - 2, w - pad * 2 + 8, gr * 2 + 10, 8); g.fillStyle = 'rgba(26,22,20,.62)'; g.fill(); circ(g, pad + gr + 2, pad + gr + 2, gr + 3, 'rgba(26,22,20,.85)', 1.6); drawSchoolGlyph(g, graft.school, pad + gr + 2, pad + gr + 2, gr, COLX[graft.school]);
  const nameX = pad + gr * 2 + 14, nameW = w - nameX - pad;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const lines = []; g.font = font(17, { bold: true }); const sz = fitText(g, graft.name, nameW, 17, 9, { bold: true });
  g.font = font(sz, { bold: true }); let nm = [graft.name]; if (g.measureText(graft.name).width > nameW) nm = wrapText(g, graft.name, nameW).slice(0, 2); void lines;
  const nlh = sz * 1.1; nm.forEach((ln, i) => { const yy = pad + gr + 2 + (i - (nm.length - 1) / 2) * nlh; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(ln, nameX + 1, yy + 1.5); g.fillStyle = COLX.vellum; g.fillText(ln, nameX, yy); });
  // tier ribbon
  const ry = pad + gr * 2 + 10, rh = Math.max(15, Math.min(20, h * 0.075)), tier = String(graft.tier || 'safe'), tcol = TIER_COL[tier] || '#888';
  g.beginPath(); g.moveTo(-3, ry); g.lineTo(w + 3, ry); g.lineTo(w - 4, ry + rh / 2); g.lineTo(w + 3, ry + rh); g.lineTo(-3, ry + rh); g.closePath(); fs(g, lg(g, 0, ry, 0, ry + rh, [[0, mix(tcol, '#fff', 0.2)], [1, mix(tcol, INK, 0.35)]]), 1.8);
  g.font = font(Math.min(12, rh - 4), { bold: true, ui: true }); g.fillStyle = tier === 'greedy' ? INK : '#fff'; g.textAlign = 'left'; g.fillText(tier.toUpperCase() + (graft.rarity ? '  /  ' + graft.rarity : ''), pad, ry + rh / 2 + 0.5);
  // weight staples (1-3)
  const wt = Math.max(1, Math.min(3, graft.weight || 1));
  for (let i = 0; i < wt; i++) staple(g, w - pad - 8 - i * 17, ry + rh / 2, 13, 0);
  // text plate
  const ty = ry + rh + 7, th = h - ty - pad;
  if (th > 20) {
    rr(g, pad - 2, ty, w - pad * 2 + 4, th, 5); g.fillStyle = 'rgba(26,22,20,.82)'; g.fill(); g.lineWidth = lnw(1); g.strokeStyle = 'rgba(232,220,196,.25)'; g.stroke();
    const tw = w - pad * 2 - 8; let fsz = 14, bl, pl, bh, ph;
    for (; fsz >= 8; fsz -= 0.5) { g.font = font(fsz); bl = wrapText(g, graft.boon || '', tw); g.font = font(fsz, { bold: true }); pl = wrapText(g, graft.price || '', tw); bh = bl.length * fsz * 1.2; ph = pl.length * fsz * 1.2; if (bh + ph + 14 <= th - 4) break; }
    const total = bh + ph + 10, y0 = ty + Math.max(2, (th - total) / 2); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = font(fsz); g.fillStyle = COLX.vellum; bl.forEach((ln, i) => g.fillText(ln, pad + 2, y0 + (i + 1) * fsz * 1.2 - 3));
    const dy = y0 + bh + 4; g.beginPath(); g.moveTo(pad + 2, dy); g.lineTo(w - pad - 2, dy); g.lineWidth = lnw(1); setDash(g, [4, 3]); g.strokeStyle = 'rgba(232,220,196,.4)'; g.stroke(); setDash(g, []);
    g.font = font(fsz, { bold: true }); g.fillStyle = SCAR_BRIGHT; pl.forEach((ln, i) => g.fillText(ln, pad + 2, dy + 4 + (i + 1) * fsz * 1.2 - 3));
  }
  // brass corner staple for flavour
  staple(g, w / 2, 1, 16, 0);
  if (o.selected) { poly(g, pts); g.lineWidth = lnw(3.5); g.strokeStyle = COLX.lamp; g.stroke(); poly(g, pts); g.lineWidth = lnw(7); g.strokeStyle = 'rgba(242,193,78,.25)'; g.stroke(); }
  else if (o.hover) { poly(g, pts); g.lineWidth = lnw(2); g.strokeStyle = 'rgba(242,193,78,.7)'; g.stroke(); }
  if (o.sold) { poly(g, pts); g.fillStyle = 'rgba(20,16,14,.65)'; g.fill(); g.save(); g.translate(w / 2, h / 2); g.rotate(-0.35); const bw = Math.min(w * 0.8, 150); rr(g, -bw / 2, -17, bw, 34, 4); g.lineWidth = lnw(3); g.strokeStyle = SCAR_BRIGHT; g.stroke(); g.font = font(24, { bold: true }); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = SCAR_BRIGHT; g.fillText('SOLD', 0, 1); g.restore(); }
  if (o.dim > 0) { poly(g, pts); g.fillStyle = `rgba(12,8,8,${Math.min(0.85, o.dim * 0.7)})`; g.fill(); }
  g.restore();
}
