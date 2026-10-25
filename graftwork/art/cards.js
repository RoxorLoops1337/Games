// GRAFTWORK card art: the surgeon's slab. Cards are vellum skin pinned under a lamp; grafts are patches of other
// skin sewn on with black sutures and a brass staple. All procedural canvas, no images.
//
// Performance: the static layers of a card (frame, banner, illustration, text, grafts, tithe seam, jam clamp) are
// rendered once into an offscreen canvas keyed by id + upgrade + grafts + tithe/jam + rules text, then blitted.
// Only the cost orb, glow, selection, dim and shadow are drawn live. Without a DOM (node tests) it draws directly.
//
//   drawCard(ctx, spec, x, y, o)       centered. o: { scale, rot, tithed, jam, cost, glow 0..1, selected, dim 0..1, alpha, hover, preview }
//   drawCardBack(ctx, x, y, o)         centered. o: { scale, rot, alpha, dim }
//   drawGraftPatch(ctx, graft, x,y,w,h,o)   TOP-LEFT anchored. o: { hover, selected, dim, sold, scale }
//   drawSchoolGlyph(ctx, school, x, y, r, color)   centered
import { COL } from '../ui/core.js';
import { cardLines, priceLines } from '../engine/text.js';
import { GRAFTS } from '../data/index.js';

export const CARD_W = 220, CARD_H = 310;
const HW = CARD_W / 2, HH = CARD_H / 2;
const INK = COL.ink, BRASS = '#c9a227', BRASS_D = '#7a5f12', STEEL = '#b9b4a8', STEEL_D = '#6c675e', SCAR_BRIGHT = '#e5546a';
const SCHOOL_ORDER = ['ember', 'echo', 'hoard', 'blood', 'rust', 'static', 'gilded'];
export const SCHOOL_SHAPES = { ember: 'flame', echo: 'arcs', hoard: 'pouch', blood: 'drop', rust: 'cog', static: 'bolt', gilded: 'diamond' };
const TIER_COL = { safe: '#4f9a5d', greedy: '#d9a82c', weird: '#8a52c8' };
const HERO_SCHOOL = { marrow: 'blood', wick: 'ember', odile: 'hoard' };

// ---------- small utilities ----------
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngOf(seed) { let a = (typeof seed === 'string' ? hash(seed) : seed) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rgb(hex) { if (hex[0] !== '#') { const m = hex.match(/\d+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; } const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function toHex(r, g, b) { const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
function alpha(hex, a) { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function desat(hex, t) { const c = rgb(hex); const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return toHex(c[0] + (l - c[0]) * t, c[1] + (l - c[1]) * t, c[2] + (l - c[2]) * t); }
const font = (size, o = {}) => `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${Math.round(size * 10) / 10}px ${o.ui ? 'Trebuchet MS, sans-serif' : 'Georgia, serif'}`;

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r); g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
}
function poly(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
function fs(g, fill, lw = 2.2) { if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); } }
function circ(g, x, y, r, fill, lw = 2) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); fs(g, fill, lw); }
function ell(g, x, y, rx, ry, fill, lw = 2, rot = 0) { g.beginPath(); g.ellipse ? g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2) : g.arc(x, y, rx, 0, Math.PI * 2); fs(g, fill, lw); }
function line(g, x1, y1, x2, y2, col, lw) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.stroke(); }
function grad(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([t, c]) => gr.addColorStop(t, c)); return gr; }
function setDash(g, d) { if (g.setLineDash) g.setLineDash(d); }
function wrapText(g, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean), out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && g.measureText(t).width > maxW) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  return out;
}
function fitText(g, str, maxW, size, minSize, o = {}) { let s = size; g.font = font(s, o); while (s > minSize && g.measureText(str).width > maxW) { s -= 0.5; g.font = font(s, o); } return s; }

// ---------- school glyphs (seven SHAPES, colorblind safe) ----------
export function drawSchoolGlyph(ctx, school, x, y, r, color) {
  const c = color || COL[school] || '#fff';
  ctx.save(); ctx.translate(x, y); ctx.scale(r / 10, r / 10); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const out = (fill) => { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke(); };
  switch (school) {
    case 'ember': ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(2, -5, 8, -2, 7, 3); ctx.bezierCurveTo(6, 8, 3, 10, 0, 10); ctx.bezierCurveTo(-4, 10, -8, 7, -7, 2); ctx.bezierCurveTo(-6, -1, -3, -3, -3, -6); ctx.bezierCurveTo(-1, -5, 0, -8, 0, -10); ctx.closePath(); out(c); break;
    case 'echo':
      ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(-3, 0, 5, -1.1, 1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(-3, 0, 10, -1.0, 1.0); ctx.stroke();
      ctx.lineWidth = 1.9; ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(-3, 0, 5, -1.1, 1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(-3, 0, 10, -1.0, 1.0); ctx.stroke();
      ctx.beginPath(); ctx.arc(-3, 0, 1.6, 0, 6.3); out(c); break;
    case 'hoard': ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(3, -8); ctx.lineTo(2, -5); ctx.bezierCurveTo(10, -1, 10, 9, 0, 10); ctx.bezierCurveTo(-10, 9, -10, -1, -2, -5); ctx.closePath(); out(c); ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(3, -5); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke(); break;
    case 'blood': ctx.beginPath(); ctx.moveTo(0, -10); ctx.bezierCurveTo(3, -4, 8, 0, 8, 4); ctx.bezierCurveTo(8, 8, 4, 10, 0, 10); ctx.bezierCurveTo(-4, 10, -8, 8, -8, 4); ctx.bezierCurveTo(-8, 0, -3, -4, 0, -10); ctx.closePath(); out(c); break;
    case 'rust': {
      ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.2832, rad = i % 2 ? 6.8 : 10; const px = Math.cos(a) * rad, py = Math.sin(a) * rad; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); out(c);
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 6.3); out(INK); break;
    }
    case 'static': ctx.beginPath(); ctx.moveTo(2, -10); ctx.lineTo(-6, 1); ctx.lineTo(-1, 1); ctx.lineTo(-3, 10); ctx.lineTo(7, -3); ctx.lineTo(1, -3); ctx.lineTo(5, -10); ctx.closePath(); out(c); break;
    case 'gilded': ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 0); ctx.lineTo(0, 10); ctx.lineTo(-8, 0); ctx.closePath(); out(c); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(43,30,26,.6)'; ctx.stroke(); break;
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
  scalpel(g, k) { g.rotate(-0.6); rr(g, -40, -4.5, 36, 9, 3); fs(g, k.brass); g.beginPath(); for (let i = 0; i < 5; i++) { g.moveTo(-36 + i * 7, -4.5); g.lineTo(-36 + i * 7, 4.5); } g.lineWidth = 1; g.strokeStyle = BRASS_D; g.stroke(); poly(g, [[-4, -3], [6, -2], [8, 2], [-4, 3]]); fs(g, k.steelD); poly(g, [[6, -4], [30, -4], [42, 5], [6, 4]]); fs(g, k.steel); line(g, 10, -1, 34, 1.5, '#fff', 1.4); circ(g, 6, 12, 0, null, 0); },
  bonesaw(g, k) { g.rotate(-0.35); rr(g, -42, -8, 28, 16, 5); fs(g, k.dark); line(g, -36, -3, -20, -3, k.light, 1.5); g.beginPath(); g.moveTo(-14, -5); g.lineTo(40, -5); g.lineTo(40, 3); for (let i = 0; i < 9; i++) { g.lineTo(37 - i * 6.2, 8); g.lineTo(34 - i * 6.2, 3); } g.lineTo(-14, 4); g.closePath(); fs(g, k.steel); line(g, -10, -2, 36, -2, '#fff', 1.3); circ(g, -14, 0, 3, k.brass, 1.5); },
  bandage(g, k) { circ(g, -4, -2, 25, k.paper); circ(g, -4, -2, 19, null, 1.2); circ(g, -4, -2, 13, null, 1.2); circ(g, -4, -2, 7, INK, 1.5); g.save(); g.beginPath(); g.arc(-4, -2, 25, 0, 6.3); g.clip(); for (let i = -3; i < 4; i++) line(g, -30, i * 8, 30, i * 8 + 5, 'rgba(120,90,60,.25)', 1); g.restore(); poly(g, [[12, 18], [40, 22], [39, 34], [10, 32]]); fs(g, k.paper); line(g, 14, 25, 38, 28, k.main, 3); g.beginPath(); g.moveTo(22, 20); g.lineTo(24, 32); g.moveTo(30, 21); g.lineTo(32, 33); g.lineWidth = 1.4; g.strokeStyle = SCAR_BRIGHT; g.stroke(); },
  syringe(g, k) { g.rotate(-0.75); rr(g, -22, -8, 38, 16, 3); fs(g, 'rgba(235,245,248,.9)'); g.save(); rr(g, -22, -8, 38, 16, 3); g.clip(); g.fillStyle = k.main; g.fillRect(-22, -8, 22, 16); g.restore(); rr(g, -22, -8, 38, 16, 3); fs(g, null); for (let i = 0; i < 5; i++) line(g, -16 + i * 7, -8, -16 + i * 7, i % 2 ? -4 : -2, INK, 1.2); line(g, -22, 0, -36, 0, k.steelD, 4); line(g, -38, -8, -38, 8, k.steel, 5); rr(g, 14, -12, 5, 24, 2); fs(g, k.steel); poly(g, [[19, -3], [26, -2], [26, 2], [19, 3]]); fs(g, k.steelD); poly(g, [[26, -1.4], [46, 0], [26, 1.4]]); fs(g, k.steel, 1.4); },
  heart(g, k) { g.beginPath(); g.moveTo(0, -12); g.bezierCurveTo(-8, -36, -42, -26, -34, 2); g.bezierCurveTo(-30, 18, -10, 28, 0, 40); g.bezierCurveTo(10, 28, 30, 18, 34, 2); g.bezierCurveTo(42, -26, 8, -36, 0, -12); g.closePath(); fs(g, grad(g, -30, -30, 30, 40, [[0, k.light], [0.5, k.main], [1, k.dark]]), 2.6); ell(g, -16, -14, 6, 3.5, 'rgba(255,255,255,.4)', 0, -0.7); line(g, -2, -12, -2, -30, k.dark, 5); line(g, 8, -14, 14, -30, k.dark, 4); g.beginPath(); g.moveTo(-26, 6); g.lineTo(26, 10); g.lineWidth = 2; setDash(g, [4, 3]); g.strokeStyle = '#111'; g.stroke(); setDash(g, []); rr(g, -4, 3, 12, 5, 1.5); fs(g, k.brass, 1.4); },
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
  skull(g, k) { g.beginPath(); g.moveTo(-24, -4); g.bezierCurveTo(-30, -44, 30, -44, 24, -4); g.bezierCurveTo(24, 6, 18, 10, 16, 14); g.lineTo(16, 28); g.lineTo(-16, 28); g.lineTo(-16, 14); g.bezierCurveTo(-18, 10, -24, 6, -24, -4); g.closePath(); fs(g, k.paper, 2.6); ell(g, -10, -6, 7, 8, INK, 0); ell(g, 10, -6, 7, 8, INK, 0); poly(g, [[0, 6], [-4, 14], [4, 14]]); fs(g, INK, 1); for (let i = -2; i <= 2; i++) line(g, i * 6, 18, i * 6, 28, INK, 1.6); g.beginPath(); g.moveTo(14, -30); g.lineTo(8, -20); g.lineTo(12, -14); g.lineTo(6, -8); g.lineWidth = 1.6; g.strokeStyle = SCAR_BRIGHT; g.stroke(); },
  drop(g, k) { g.beginPath(); g.moveTo(0, -42); g.bezierCurveTo(10, -20, 30, -2, 30, 16); g.bezierCurveTo(30, 32, 16, 42, 0, 42); g.bezierCurveTo(-16, 42, -30, 32, -30, 16); g.bezierCurveTo(-30, -2, -10, -20, 0, -42); g.closePath(); fs(g, grad(g, -20, -20, 24, 40, [[0, k.light], [0.4, k.main], [1, k.dark]]), 2.6); ell(g, -12, 12, 5, 9, 'rgba(255,255,255,.4)', 0, 0.3); circ(g, 30, -12, 5, k.main, 1.8); circ(g, 36, 6, 3, k.main, 1.4); },
  thorn(g, k) { g.beginPath(); g.moveTo(-42, 30); g.bezierCurveTo(-20, 10, 10, 18, 42, -20); g.lineWidth = 9; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); g.lineWidth = 6; g.strokeStyle = k.dark; g.stroke(); [[-24, 18, -34, -8], [-2, 14, -8, -26], [20, 4, 30, 28]].forEach(([x, y, tx, ty]) => { const dx = ty - y, dy = x - tx, l = Math.hypot(dx, dy) || 1; poly(g, [[x - dx / l * 5, y - dy / l * 5], [tx, ty], [x + dx / l * 5, y + dy / l * 5]]); fs(g, k.main, 2); }); poly(g, [[34, -14], [44, -30], [42, -10]]); fs(g, k.main, 2); },
  shield(g, k) { g.beginPath(); g.moveTo(-31, -36); g.lineTo(31, -36); g.lineTo(31, 4); g.bezierCurveTo(31, 24, 12, 36, 0, 44); g.bezierCurveTo(-12, 36, -31, 24, -31, 4); g.closePath(); fs(g, grad(g, -30, -36, 30, 40, [[0, k.steel], [1, k.steelD]]), 2.8); g.beginPath(); g.moveTo(-22, -28); g.lineTo(22, -28); g.lineTo(22, 4); g.bezierCurveTo(22, 18, 8, 28, 0, 34); g.bezierCurveTo(-8, 28, -22, 18, -22, 4); g.closePath(); fs(g, k.main, 1.8); line(g, 0, -28, 0, 34, k.dark, 3); line(g, -22, -6, 22, -6, k.dark, 3); [[-26, -31], [26, -31], [-26, 2], [26, 2]].forEach(([x, y]) => circ(g, x, y, 2.4, k.brass, 1.2)); },
  scales(g, k) { line(g, 0, -34, 0, 34, INK, 7); line(g, 0, -34, 0, 34, k.brass, 4); poly(g, [[-18, 40], [18, 40], [10, 32], [-10, 32]]); fs(g, k.brass); g.save(); g.rotate(0.12); line(g, -34, -30, 34, -30, INK, 6); line(g, -34, -30, 34, -30, k.brass, 3); circ(g, 0, -30, 4, k.brass, 1.6); [[-34, 1], [34, -1]].forEach(([x, s]) => { g.save(); g.translate(x, -30); g.rotate(-0.12); line(g, 0, 0, -14, 30, INK, 1.4); line(g, 0, 0, 14, 30, INK, 1.4); g.beginPath(); g.moveTo(-17, 30); g.lineTo(17, 30); g.bezierCurveTo(14, 42, -14, 42, -17, 30); g.closePath(); fs(g, s > 0 ? k.main : k.brass, 2); g.restore(); }); g.restore(); },
  bell(g, k) { g.beginPath(); g.moveTo(-28, 24); g.bezierCurveTo(-24, 14, -18, 0, -16, -16); g.bezierCurveTo(-14, -34, 14, -34, 16, -16); g.bezierCurveTo(18, 0, 24, 14, 28, 24); g.closePath(); fs(g, grad(g, -24, -30, 24, 24, [[0, mix(k.brass, '#fff', 0.35)], [1, BRASS_D]]), 2.6); circ(g, 0, -34, 4, null, 2.2); rr(g, -30, 22, 60, 6, 3); fs(g, k.brass); circ(g, 0, 33, 5, k.dark, 1.8); g.beginPath(); g.arc(0, 0, 40, -0.35, 0.35 + 0); g.lineWidth = 2; g.strokeStyle = k.main; g.stroke(); g.beginPath(); g.arc(0, 0, 40, 2.8, 3.5); g.stroke(); },
  rope(g, k) { const tan = '#b89a68'; for (let i = 0; i < 3; i++) { const rx = 32 - i * 5, ry = 20 - i * 3, cy = -4 + i * 6; ell(g, 0, cy, rx, ry, null, 0); g.lineWidth = 11; g.strokeStyle = INK; g.stroke(); } for (let i = 0; i < 3; i++) { const rx = 32 - i * 5, ry = 20 - i * 3, cy = -4 + i * 6; ell(g, 0, cy, rx, ry, null, 0); g.lineWidth = 7.5; g.strokeStyle = tan; g.stroke(); setDash(g, [3, 4]); g.lineWidth = 7.5; g.strokeStyle = '#7a6238'; g.stroke(); setDash(g, []); } g.beginPath(); g.moveTo(30, 12); g.bezierCurveTo(40, 26, 20, 38, 30, 44); g.lineWidth = 11; g.strokeStyle = INK; g.stroke(); g.lineWidth = 7.5; g.strokeStyle = tan; g.stroke(); line(g, 28, 43, 36, 46, k.main, 3); },
  spiral(g, k) { for (let pass = 2; pass >= 0; pass--) { g.save(); g.translate(pass * 5, pass * 4); g.beginPath(); for (let a = 0; a < 17; a += 0.15) { const r = 2 + a * 2.2; const px = Math.cos(a) * r, py = Math.sin(a) * r; a ? g.lineTo(px, py) : g.moveTo(px, py); } g.globalAlpha = pass === 0 ? 1 : 0.35; g.lineWidth = 8; g.strokeStyle = INK; g.stroke(); g.lineWidth = 4.5; g.strokeStyle = pass ? k.light : k.main; g.stroke(); g.restore(); } g.globalAlpha = 1; },
  papers(g, k) { [[-8, 6, -0.18], [4, 2, 0.06], [-2, -4, 0.2]].forEach(([dx, dy, rot], i) => { g.save(); g.translate(dx, dy); g.rotate(rot); rr(g, -24, -32, 48, 64, 2); fs(g, i === 2 ? k.paper : mix(k.paper, '#8a8070', 0.12 * (3 - i)), 2); if (i === 2) { for (let j = 0; j < 6; j++) line(g, -16, -22 + j * 8, 16 - (j % 3) * 5, -22 + j * 8, 'rgba(43,30,26,.55)', 1.6); g.save(); g.translate(8, 14); g.rotate(-0.3); ell(g, 0, 0, 11, 8, null, 2); g.strokeStyle = SCAR_BRIGHT; g.lineWidth = 2.4; g.stroke(); g.restore(); } g.restore(); }); rr(g, 14, -38, 7, 22, 3); g.lineWidth = 2.4; g.strokeStyle = k.steelD; g.stroke(); },
  hourglass(g, k) { rr(g, -24, -42, 48, 7, 2); fs(g, k.brass); rr(g, -24, 35, 48, 7, 2); fs(g, k.brass); g.beginPath(); g.moveTo(-18, -35); g.lineTo(18, -35); g.lineTo(3, 0); g.lineTo(18, 35); g.lineTo(-18, 35); g.lineTo(-3, 0); g.closePath(); fs(g, 'rgba(225,238,238,.5)', 2.4); poly(g, [[-13, -33], [13, -33], [3, -8], [-3, -8]]); fs(g, k.main, 0); poly(g, [[-16, 33], [16, 33], [8, 18], [-8, 18]]); fs(g, k.main, 0); line(g, 0, -6, 0, 18, k.main, 1.8); line(g, -22, -35, -22, 35, INK, 3); line(g, 22, -35, 22, 35, INK, 3); },
  needle(g, k) { g.rotate(-0.4); g.beginPath(); g.arc(0, 8, 30, 3.5, 6.0); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); g.lineWidth = 2.6; g.strokeStyle = k.steel; g.stroke(); circ(g, 28, -4, 3, INK, 1.2); g.beginPath(); g.moveTo(28, -4); g.bezierCurveTo(40, -16, 20, -30, 30, -38); g.moveTo(-20, 8); g.lineWidth = 2; g.strokeStyle = k.main; g.stroke(); g.beginPath(); g.moveTo(-34, 28); g.lineTo(-12, 36); g.lineTo(10, 28); g.lineTo(32, 36); g.lineWidth = 2.2; g.strokeStyle = '#111'; setDash(g, [5, 3]); g.stroke(); setDash(g, []); },
  bone(g, k) { g.rotate(-0.6); rr(g, -32, -6, 64, 12, 5); fs(g, k.paper); [[-36, -9], [-36, 9], [36, -9], [36, 9]].forEach(([x, y]) => circ(g, x, y, 8, k.paper, 2.4)); rr(g, -30, -4, 60, 8, 3); g.fillStyle = k.paper; g.fill(); line(g, -20, -1, 18, -1, '#fff', 1.4); line(g, 6, 3, 14, 3, 'rgba(120,90,60,.5)', 1.4); },
  clamp(g, k) { circ(g, -26, -20, 10, null, 0); [[-1, 1], [1, -1]].forEach(([s]) => { g.save(); g.scale(1, s); g.beginPath(); g.moveTo(-36, -26); g.lineTo(-24, -14); g.lineTo(40, 14); g.lineTo(40, 21); g.lineTo(20, 20); g.lineTo(-30, -8); g.closePath(); fs(g, k.steel, 2.4); g.restore(); }); ell(g, -34, -24, 9, 9, null, 0); ell(g, -34, -24, 8, 8, null, 2.6); ell(g, -34, 24, 8, 8, null, 2.6); for (let i = 0; i < 4; i++) line(g, 24 + i * 4, 4, 24 + i * 4, 14, INK, 1.2); circ(g, -6, 0, 4, k.main, 1.8); },
  crown(g, k) { poly(g, [[-34, 22], [-34, -14], [-18, 6], [0, -28], [18, 6], [34, -14], [34, 22]]); fs(g, grad(g, 0, -28, 0, 24, [[0, mix(k.brass, '#fff', 0.4)], [1, k.brass]]), 2.6); rr(g, -36, 22, 72, 10, 3); fs(g, k.brass, 2.4); circ(g, 0, -30, 5, k.main, 2); circ(g, -34, -16, 4, k.main, 1.8); circ(g, 34, -16, 4, k.main, 1.8); [[-16, 27], [0, 27], [16, 27]].forEach(([x, y], i) => { poly(g, [[x, y - 3], [x + 3, y], [x, y + 3], [x - 3, y]]); fs(g, i === 1 ? SCAR_BRIGHT : k.main, 1.2); }); },
  chain(g, k) { for (let i = 0; i < 4; i++) { g.save(); g.translate(-24 + i * 16, -14 + i * 9); g.rotate(i % 2 ? 0.9 : -0.1); const w = i % 2 ? 7 : 14; rr(g, -w, -7, w * 2, 14, 7); g.lineWidth = 7; g.strokeStyle = INK; g.stroke(); g.lineWidth = 4; g.strokeStyle = k.steel; g.stroke(); g.restore(); } },
};
function drawSchoolGlyphSafe(g, x, y, r, col) { circ(g, x, y, r, col, 1); }
export const MOTIF_NAMES = Object.keys(MOTIFS);

// keyword -> motif, first match wins. Matched against spec.art + id + name.
const KEYWORDS = [
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
function schoolOf(spec) { return spec.school || HERO_SCHOOL[spec.hero] || null; }
function tintOf(spec) { const s = schoolOf(spec); return (s && COL[s]) || COL[spec.type] || '#8a7a60'; }

// ---------- the illustration window ----------
const WIN = { x: -90, y: -112, w: 180, h: 90 };
function drawIllustration(g, spec) {
  const r = rngOf('art:' + spec.id);
  const motif = pickMotif(spec);
  const variant = Math.floor(r() * 3);
  const main = tintOf(spec);
  const sch = schoolOf(spec);
  const acc = COL[SCHOOL_ORDER[(Math.max(0, SCHOOL_ORDER.indexOf(sch)) + 2 + variant) % 7]];
  const k = { main, dark: mix(main, INK, 0.5), light: mix(main, '#ffffff', 0.4), acc, paper: '#efe4cc', steel: STEEL, steelD: STEEL_D, brass: BRASS };
  const junk = spec.type === 'junk';
  g.save(); rr(g, WIN.x, WIN.y, WIN.w, WIN.h, 5); g.clip();
  const cx = WIN.x + WIN.w / 2, cy = WIN.y + WIN.h / 2;
  const bgBase = junk ? '#cfc8b8' : mix(COL.vellum, main, variant === 1 ? 0.34 : 0.2);
  g.fillStyle = grad(g, 0, WIN.y, 0, WIN.y + WIN.h, [[0, mix(bgBase, '#fff', 0.2)], [1, mix(bgBase, INK, 0.18)]]); g.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
  // backdrop shape per variant
  g.globalAlpha = 0.5;
  if (variant === 0) { const rg = g.createRadialGradient(cx, cy, 4, cx, cy, 70); rg.addColorStop(0, alpha(k.light, 0.8)); rg.addColorStop(1, alpha(k.light, 0)); g.fillStyle = rg; g.fillRect(WIN.x, WIN.y, WIN.w, WIN.h); }
  else if (variant === 1) { g.fillStyle = alpha(acc, 0.35); g.beginPath(); g.moveTo(WIN.x - 10, cy + 20); g.lineTo(WIN.x + WIN.w + 10, cy - 30); g.lineTo(WIN.x + WIN.w + 10, cy - 6); g.lineTo(WIN.x - 10, cy + 44); g.closePath(); g.fill(); }
  else { g.fillStyle = alpha(acc, 0.35); for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.2832 + r(); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 110, a, a + 0.16); g.closePath(); g.fill(); } }
  g.globalAlpha = 1;
  // hatching texture
  g.strokeStyle = 'rgba(43,30,26,.13)'; g.lineWidth = 0.8; const ang = 0.5 + r() * 0.6; g.beginPath();
  for (let i = -120; i < 140; i += 4.5) { g.moveTo(cx + i - 60 * Math.sin(ang), cy - 60); g.lineTo(cx + i + 60 * Math.sin(ang), cy + 60); }
  g.stroke();
  // motif
  g.save(); const sc = (0.9 + r() * 0.16) * (variant === 2 ? 0.95 : 1.02); const ox = (r() - 0.5) * 18, oy = (r() - 0.5) * 6;
  g.translate(cx + ox, cy + oy); g.scale((variant === 1 ? -1 : 1) * sc, sc); g.rotate((r() - 0.5) * (variant === 2 ? 0.5 : 0.2));
  g.save(); g.translate(2, 3); g.globalAlpha = 0.22; g.fillStyle = INK; g.restore();
  g.lineJoin = 'round'; g.lineCap = 'round';
  MOTIFS[motif](g, k);
  g.restore();
  // vignette
  const vg = g.createRadialGradient(cx, cy, 30, cx, cy, 105); vg.addColorStop(0, 'rgba(30,18,12,0)'); vg.addColorStop(1, 'rgba(30,18,12,.42)'); g.fillStyle = vg; g.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
  g.restore();
  rr(g, WIN.x, WIN.y, WIN.w, WIN.h, 5); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
  rr(g, WIN.x + 2, WIN.y + 2, WIN.w - 4, WIN.h - 4, 4); g.lineWidth = 1; g.strokeStyle = 'rgba(232,220,196,.5)'; g.stroke();
  if (sch) { circ(g, WIN.x + WIN.w - 13, WIN.y + 13, 10.5, 'rgba(232,220,196,.82)', 1.6); drawSchoolGlyph(g, sch, WIN.x + WIN.w - 13, WIN.y + 13, 7.5, COL[sch]); }
}

// ---------- stitching and patches ----------
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
function stitchAround(g, pts, inset, step = 6.5, col = '#0e0e0e', lw = 1.5) {
  // pts is a closed polygon; draws cross stitches over the edge
  g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux, n = Math.max(1, Math.floor(len / step));
    for (let s = 0; s < n; s++) { const t = (s + 0.5) / n, px = a[0] + dx * t + nx * inset, py = a[1] + dy * t + ny * inset; g.moveTo(px - nx * 3.2 - ux * 1.8, py - ny * 3.2 - uy * 1.8); g.lineTo(px + nx * 3.2 + ux * 1.8, py + ny * 3.2 + uy * 1.8); }
  }
  g.stroke();
}
function staple(g, x, y, w = 14, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-w / 2 + 1, -1.2, w, 5);
  rr(g, -w / 2, -2.5, w, 4.4, 1.5); g.fillStyle = grad(g, 0, -2.5, 0, 2, [[0, '#f1d675'], [0.5, BRASS], [1, BRASS_D]]); g.fill(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke();
  g.fillStyle = BRASS_D; g.fillRect(-w / 2, -1, 2.2, 5); g.fillRect(w / 2 - 2.2, -1, 2.2, 5);
  g.restore();
}
function drawSmallPatch(g, gid, cx, cy, idx) {
  const gr = GRAFTS[gid]; const school = gr && gr.school; const col = (school && COL[school]) || '#888';
  const w = 34, h = 30, pts = patchPoints(cx - w / 2, cy - h / 2, w, h, gid + idx);
  g.save();
  poly(g, pts.map((p) => [p[0] + 1.5, p[1] + 2.5])); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
  poly(g, pts); g.fillStyle = grad(g, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, [[0, mix(col, '#fff', 0.2)], [1, mix(col, INK, 0.35)]]); g.fill(); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke();
  stitchAround(g, pts, 1.5, 6.5);
  if (idx === 2) { // Overload: gold cracked border
    poly(g, pts); g.lineWidth = 2.6; g.strokeStyle = COL.lamp; g.stroke();
    g.beginPath(); g.moveTo(cx - w / 2, cy - 4); g.lineTo(cx - 6, cy - 2); g.lineTo(cx - 2, cy + 8); g.lineTo(cx + 6, cy + h / 2); g.moveTo(cx + w / 2, cy - h / 2 + 5); g.lineTo(cx + 4, cy - 4); g.lineWidth = 1.5; g.strokeStyle = '#fff3b0'; g.stroke();
  }
  drawSchoolGlyph(g, school, cx, cy + 1, 7.5, mix(col, '#ffffff', 0.55));
  staple(g, cx - 1, cy - h / 2 + 2, 13, -0.15 + idx * 0.1);
  g.restore();
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

// ---------- overlays baked into the face ----------
function drawSeam(g, seed) {
  const r = rngOf('seam:' + seed), pts = [];
  const x0 = -96, y0 = -118, x1 = 96, y1 = 124, n = 11;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (i && i < n ? (r() - 0.5) * 16 : 0), y0 + (y1 - y0) * t + (i && i < n ? (r() - 0.5) * 16 : 0)]); }
  const stroke = (p, w, c) => { g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.lineWidth = w; g.strokeStyle = c; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); };
  stroke(pts.map((p) => [p[0] + 1, p[1] + 2]), 7, 'rgba(40,0,10,.45)');
  stroke(pts, 5, COL.scar); stroke(pts.map((p) => [p[0] - 1, p[1] - 1]), 1.3, '#f7a0a8');
  // stitches across the seam
  g.beginPath();
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[i + 1]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l; for (let s = 0; s < 2; s++) { const t = 0.25 + s * 0.5, px = a[0] + dx * t, py = a[1] + dy * t; g.moveTo(px - nx * 6, py - ny * 6); g.lineTo(px + nx * 6, py + ny * 6); ell(g, px, py, 3.5, 2, null, 0); } }
  g.lineWidth = 1.8; g.strokeStyle = '#0e0e0e'; g.stroke();
  // 3 puckered branch cracks
  for (let b = 0; b < 3; b++) {
    const i = 2 + b * 3, p = pts[i], dir = (b % 2 ? 1 : -1) * (1.1 + r() * 0.5) + Math.atan2(y1 - y0, x1 - x0);
    const br = [[p[0], p[1]]]; let ax = p[0], ay = p[1], a = dir; for (let s = 0; s < 4; s++) { a += (r() - 0.5) * 0.9; ax += Math.cos(a) * (10 + r() * 8); ay += Math.sin(a) * (10 + r() * 8); br.push([ax, ay]); }
    stroke(br, 3.4, 'rgba(40,0,10,.5)'); stroke(br, 2, COL.scar);
    ell(g, p[0], p[1], 5, 3, 'rgba(240,130,140,.45)', 0, dir);
  }
  g.fillStyle = 'rgba(90,80,75,.13)'; rr(g, -102, -147, 204, 294, 6); g.fill();
}
function drawClamp(g, seed) {
  const r = rngOf('clamp:' + seed);
  g.save(); g.translate(0, -18); g.rotate(-0.2);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-142, 3, 284, 26);
  g.fillStyle = grad(g, 0, -12, 0, 14, [[0, '#c27a49'], [0.45, COL.rust], [1, '#4d2714']]); g.fillRect(-140, -12, 280, 26); g.lineWidth = 2.4; g.strokeStyle = INK; g.strokeRect(-140, -12, 280, 26);
  for (let i = 0; i < 40; i++) { g.fillStyle = r() > 0.5 ? 'rgba(60,25,10,.5)' : 'rgba(220,150,90,.35)'; g.fillRect(-138 + r() * 274, -10 + r() * 22, 2 + r() * 5, 1.5 + r() * 2.5); }
  [-118, -70, 70, 118].forEach((x) => { circ(g, x, 1, 3.6, STEEL_D, 1.4); });
  rr(g, -150, -18, 16, 38, 3); fs(g, STEEL_D, 2); rr(g, 134, -18, 16, 38, 3); fs(g, STEEL_D, 2);
  // padlock
  g.beginPath(); g.arc(0, -5, 8, Math.PI, 0); g.lineWidth = 3.4; g.strokeStyle = INK; g.stroke(); g.lineWidth = 1.8; g.strokeStyle = STEEL; g.stroke();
  rr(g, -11, -5, 22, 18, 3); fs(g, grad(g, 0, -5, 0, 13, [[0, '#f1d675'], [1, BRASS_D]]), 2); circ(g, 0, 3, 2.2, INK, 0); line(g, 0, 3, 0, 8, INK, 2);
  g.restore();
  // tape cross, top right of the illustration
  [0.7, -0.7].forEach((a) => { g.save(); g.translate(58, -88); g.rotate(a); g.fillStyle = 'rgba(214,199,166,.92)'; g.fillRect(-26, -5, 52, 10); g.lineWidth = 1.2; g.strokeStyle = 'rgba(43,30,26,.7)'; g.strokeRect(-26, -5, 52, 10); line(g, -22, 0, 22, 0, 'rgba(43,30,26,.2)', 1); g.restore(); });
}
function drawBandages(g) {
  g.save(); g.translate(-82, 118); g.rotate(-0.6); g.fillStyle = '#e9e2d0'; g.fillRect(-48, -9, 96, 18); g.lineWidth = 1.5; g.strokeStyle = 'rgba(43,30,26,.8)'; g.strokeRect(-48, -9, 96, 18);
  g.fillStyle = 'rgba(160,140,110,.5)'; for (let i = 0; i < 12; i++) g.fillRect(-44 + i * 8, -6, 2, 2);
  g.fillStyle = 'rgba(179,38,58,.55)'; g.beginPath(); g.arc(14, 0, 6, 0, 6.3); g.fill(); line(g, -30, -9, -30, 9, '#0e0e0e', 1.6); line(g, -22, -9, -22, 9, '#0e0e0e', 1.6); g.restore();
  g.save(); g.translate(70, -112); g.rotate(0.5); g.fillStyle = '#e9e2d0'; g.fillRect(-26, -7, 52, 14); g.lineWidth = 1.5; g.strokeStyle = 'rgba(43,30,26,.8)'; g.strokeRect(-26, -7, 52, 14); line(g, -8, -7, -8, 7, '#0e0e0e', 1.4); line(g, 2, -7, 2, 7, '#0e0e0e', 1.4); g.restore();
}

// ---------- the card face (static layers) ----------
function renderFace(g, spec, lines, price, o) {
  const junk = spec.type === 'junk';
  const frame = junk ? COL.junk : (COL[spec.type] || '#444');
  const seed = spec.id || spec.name || 'x';
  // frame
  cardPath(g, junk, seed); g.fillStyle = grad(g, -HW, -HH, HW, HH, [[0, mix(frame, '#ffffff', 0.18)], [0.5, frame], [1, mix(frame, '#000', 0.4)]]); g.fill();
  g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
  g.save(); cardPath(g, junk, seed); g.clip();
  const rf = rngOf('fr:' + seed); g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.beginPath(); for (let i = 0; i < 14; i++) { const yy = -HH + rf() * CARD_H; g.moveTo(-HW, yy); g.lineTo(HW, yy + (rf() - 0.5) * 14); } g.stroke();
  // vellum
  const vel = junk ? mix(COL.vellum, '#8d897d', 0.5) : COL.vellum;
  rr(g, -102, -147, 204, 294, 6); g.fillStyle = grad(g, 0, -147, 0, 147, [[0, vel], [1, mix(vel, COL.vellum2, 0.9)]]); g.fill(); g.lineWidth = 1.6; g.strokeStyle = 'rgba(43,30,26,.85)'; g.stroke();
  const rs = rngOf('sp:' + seed); for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(110,80,50,${0.04 + rs() * 0.07})`; g.fillRect(-100 + rs() * 200, -145 + rs() * 290, 1 + rs() * 2, 1 + rs() * 2); }
  g.restore();
  // rivets
  [[-105, -150], [105, -150], [-105, 150], [105, 150]].forEach(([x, y]) => { circ(g, x, y, 3.4, grad(g, x - 2, y - 2, x + 2, y + 2, [[0, '#f6e394'], [1, BRASS_D]]), 1.2); });
  // name banner
  const nm = String(spec.name || '').replace(/\+$/, '');
  const bx = -58, by = -142, bw = 150, bh = 27;
  rr(g, bx, by, bw, bh, 6);
  if (spec.up) g.fillStyle = grad(g, 0, by, 0, by + bh, [[0, '#ffe58a'], [0.5, COL.lamp], [1, '#b98918']]);
  else g.fillStyle = grad(g, 0, by, 0, by + bh, [[0, mix(frame, INK, 0.35)], [1, mix(frame, INK, 0.7)]]);
  g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  if (spec.up) { rr(g, bx + 2.5, by + 2.5, bw - 5, bh - 5, 4); g.lineWidth = 1; g.strokeStyle = 'rgba(255,248,200,.8)'; g.stroke(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const maxNameW = bw - (spec.up ? 38 : 18);
  const ns = fitText(g, nm, maxNameW, 17, 9.5, { bold: true });
  const ncx = bx + (spec.up ? (bw - 22) / 2 + 2 : bw / 2) + 6;
  g.fillStyle = spec.up ? INK : COL.vellum; g.font = font(ns, { bold: true });
  if (!spec.up) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillText(nm, ncx + 0.8, by + bh / 2 + 1.3); g.fillStyle = COL.vellum; }
  g.fillText(nm, ncx, by + bh / 2 + 0.5);
  if (spec.up) { circ(g, bx + bw - 14, by + bh / 2, 8.5, INK, 1.5); g.fillStyle = COL.lamp; g.font = font(15, { bold: true }); g.fillText('+', bx + bw - 14, by + bh / 2 + 0.5); }
  // illustration
  drawIllustration(g, spec);
  // type ribbon
  const label = String(spec.type || '').toUpperCase();
  g.font = font(11, { bold: true, ui: true }); const tw = Math.max(70, g.measureText(label).width + 36);
  g.beginPath(); g.moveTo(-tw / 2 - 8, -30); g.lineTo(-tw / 2, -30); g.lineTo(tw / 2, -30); g.lineTo(tw / 2 + 8, -30); g.lineTo(tw / 2 + 2, -21); g.lineTo(tw / 2 + 8, -12); g.lineTo(-tw / 2 - 8, -12); g.lineTo(-tw / 2 - 2, -21); g.closePath();
  fs(g, grad(g, 0, -30, 0, -12, [[0, mix(frame, '#fff', 0.15)], [1, mix(frame, INK, 0.45)]]), 1.8);
  g.fillStyle = COL.vellum; g.font = font(11, { bold: true, ui: true }); g.fillText(label.split('').join(' ').replace(/ {2,}/g, ' '), 0, -20.5);
  // text blocks
  layoutText(g, spec, lines, price, o);
  // grafts on the edge
  (spec.grafts || []).slice(0, 3).forEach((gid, i) => drawSmallPatch(g, gid, HW + 4, 28 + i * 44, i));
  // junk dressing
  if (junk) drawBandages(g);
  if (o.tithed) drawSeam(g, seed);
  if (o.jam) drawClamp(g, seed);
}
function layoutText(g, spec, lines, price, o) {
  const MAXW = 176, TOP = 2, BOT = 143, AVAIL = BOT - TOP;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const flavor = spec.flavor ? String(spec.flavor) : '';
  let best = null;
  for (let s = 15; s >= 10; s -= 0.5) {
    g.font = font(s); const lh = s * 1.2;
    const rl = lines.map((l) => wrapText(g, l, MAXW)); const rn = rl.reduce((a, b) => a + b.length, 0);
    const rH = rn * lh + Math.max(0, rl.length - 1) * 2.5;
    const ps = Math.max(11, Math.min(13, s - 2)); g.font = font(ps, { bold: true });
    const pl = price.map((l) => wrapText(g, l, MAXW)); const pn = pl.reduce((a, b) => a + b.length, 0);
    const pH = pn ? pn * ps * 1.2 + 12 : 0;
    best = { s, lh, rl, rH, ps, pl, pH };
    if (rH + pH + 4 <= AVAIL) break;
  }
  const { s, lh, rl, rH, ps, pl, pH } = best;
  let fl = [], fH = 0;
  if (flavor) { g.font = font(11, { italic: true }); fl = wrapText(g, flavor, MAXW); if (fl.length > 2) fl.length = 2; fH = fl.length * 12.5 + 5; }
  const flavorOk = fH && rH + pH + fH + 6 <= AVAIL;
  const reserveBottom = flavorOk ? fH : 0;
  const lower = BOT - reserveBottom;
  // price block anchored above the flavor, rules centered in the rest
  const priceTop = lower - pH;
  const zoneTop = TOP + 2, zoneBot = pH ? priceTop - 2 : lower;
  let y = zoneTop + Math.max(0, (zoneBot - zoneTop - rH) / 2);
  g.font = font(s); g.fillStyle = o.tithed ? '#6e5f56' : INK;
  rl.forEach((group) => { group.forEach((ln) => { y += lh; g.fillText(ln, 0, y - lh * 0.22); }); y += 2.5; });
  if (pH) {
    const dy = priceTop + 2;
    g.beginPath(); g.moveTo(-80, dy); g.lineTo(80, dy); g.lineWidth = 1.4; g.strokeStyle = '#0e0e0e'; setDash(g, [5, 3]); g.stroke(); setDash(g, []);
    g.beginPath(); for (let x = -76; x <= 76; x += 10) { g.moveTo(x - 2, dy - 2.5); g.lineTo(x + 2, dy + 2.5); } g.lineWidth = 1; g.stroke();
    g.font = font(ps, { bold: true }); g.fillStyle = o.tithed ? '#8a3a44' : COL.scar; let py = dy + 7;
    pl.forEach((group) => group.forEach((ln) => { py += ps * 1.2; g.fillText(ln, 0, py - ps * 0.25); }));
  }
  if (flavorOk) { g.font = font(11, { italic: true }); g.fillStyle = 'rgba(43,30,26,.72)'; fl.forEach((ln, i) => g.fillText(ln, 0, BOT - fH + 11 + i * 12.5 + 3)); }
  void spec;
}

// ---------- caching ----------
const S = 1.5, PAD = 26;
const cache = new Map(); const CACHE_MAX = 110;
function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext && c.getContext('2d'); if (!g) return null; return { c, g }; } catch (e) { return null; }
}
function faceKey(spec, lines, price, o) {
  return [spec.id, spec.up ? 1 : 0, (spec.grafts || []).join(','), o.tithed ? 1 : 0, o.jam ? 1 : 0, spec.type, spec.school || '', lines.join('|'), price.join('|')].join('#');
}
function getFace(spec, o) {
  const lines = cardLines(spec, !!o.tithed), price = priceLines(spec);
  const key = faceKey(spec, lines, price, o);
  let ent = cache.get(key);
  if (ent) { cache.delete(key); cache.set(key, ent); return ent; }
  const cv = makeCanvas(Math.ceil((CARD_W + PAD * 2) * S), Math.ceil((CARD_H + PAD * 2) * S));
  if (cv) {
    cv.g.setTransform(S, 0, 0, S, 0, 0); cv.g.translate(HW + PAD, HH + PAD);
    renderFace(cv.g, spec, lines, price, o);
    ent = { cv: cv.c };
    cache.set(key, ent);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return ent;
  }
  return { direct: () => (g) => renderFace(g, spec, lines, price, o) };
}
export function clearCardCache() { cache.clear(); backCache = null; }

// ---------- cost orb ----------
function drawCostOrb(g, spec, o) {
  const cost = o.cost === undefined ? spec.cost : o.cost;
  const ox = -HW + 12, oy = -HH + 14, r = 20;
  const base = typeof spec.cost === 'number' ? spec.cost : null;
  let tint = '#2b3a44';
  if (typeof cost === 'number' && base !== null) { if (cost > base) tint = '#7a1c2c'; else if (cost < base) tint = '#2b6a3a'; }
  const unplay = spec.flags && spec.flags.unplayable;
  g.save();
  g.beginPath(); g.arc(ox + 1.5, oy + 3, r, 0, 6.3); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill();
  const rg = g.createRadialGradient(ox - 6, oy - 7, 2, ox, oy, r); rg.addColorStop(0, mix(tint, '#ffffff', 0.45)); rg.addColorStop(0.55, tint); rg.addColorStop(1, mix(tint, '#000', 0.5));
  g.beginPath(); g.arc(ox, oy, r, 0, 6.3); g.fillStyle = rg; g.fill();
  g.lineWidth = 3; g.strokeStyle = BRASS; g.stroke(); g.lineWidth = 1.2; g.strokeStyle = INK; g.beginPath(); g.arc(ox, oy, r + 1.6, 0, 6.3); g.stroke(); g.beginPath(); g.arc(ox, oy, r - 2, 0, 6.3); g.stroke();
  const txt = unplay && cost === undefined ? '-' : String(cost === undefined || cost === null ? '-' : cost);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(txt.length > 1 ? 20 : 25, { bold: true }); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(txt, ox + 1, oy + 2);
  g.fillStyle = tint === '#7a1c2c' ? '#ffd6d6' : tint === '#2b6a3a' ? '#d6ffd9' : '#f6ecd2'; g.fillText(txt, ox, oy + 1);
  g.restore();
}

// ---------- drawCard ----------
export function drawCard(ctx, spec, x, y, o = {}) {
  const s = o.scale || 1;
  ctx.save();
  ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale(s, s);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.selected) ctx.translate(0, -14); else if (o.hover) ctx.translate(0, -6);
  const junk = spec.type === 'junk';
  // soft shadow
  ctx.save(); ctx.translate(4, 7); cardPath(ctx, junk, spec.id || spec.name || 'x'); ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fill(); ctx.restore();
  // glow aura
  const gl = o.glow || 0;
  if (gl > 0 || o.selected) {
    const col = o.glowColor || (o.glow && schoolOf(spec) && o.schoolGlow ? COL[schoolOf(spec)] : COL.lamp);
    const a = o.selected ? Math.max(gl, 0.7) : gl;
    for (let i = 4; i >= 1; i--) { rr(ctx, -HW - i * 3, -HH - i * 3, CARD_W + i * 6, CARD_H + i * 6, 12 + i * 3); ctx.fillStyle = alpha(col, a * 0.1); ctx.fill(); }
  }
  const face = getFace(spec, o);
  if (face.cv) ctx.drawImage(face.cv, -HW - PAD, -HH - PAD, CARD_W + PAD * 2, CARD_H + PAD * 2);
  else face.direct()(ctx);
  drawCostOrb(ctx, spec, o);
  if (o.hover && !o.selected) { cardPath(ctx, junk, spec.id || 'x'); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(242,193,78,.55)'; ctx.stroke(); }
  if (o.selected || gl > 0.5) { cardPath(ctx, junk, spec.id || 'x'); ctx.lineWidth = o.selected ? 3.5 : 2.5; ctx.strokeStyle = o.selected ? '#fff0b0' : COL.lamp; ctx.stroke(); }
  if (o.preview) { rr(ctx, -HW - 3, -HH - 3, CARD_W + 6, CARD_H + 6, 14); ctx.lineWidth = 2; setDash(ctx, [8, 5]); ctx.strokeStyle = COL.lamp; ctx.stroke(); setDash(ctx, []); }
  if (o.dim > 0) { cardPath(ctx, junk, spec.id || 'x'); ctx.fillStyle = `rgba(12,8,8,${Math.min(0.85, o.dim * 0.7)})`; ctx.fill(); }
  ctx.restore();
}

// ---------- card back ----------
let backCache = null;
function renderBack(g) {
  rr(g, -HW, -HH, CARD_W, CARD_H, 12); g.fillStyle = grad(g, -HW, -HH, HW, HH, [[0, '#6e6760'], [1, '#403a35']]); g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
  g.save(); rr(g, -HW, -HH, CARD_W, CARD_H, 12); g.clip(); const r = rngOf('back');
  for (let i = 0; i < 160; i++) { g.fillStyle = r() > 0.5 ? 'rgba(20,14,10,.10)' : 'rgba(255,240,220,.07)'; g.beginPath(); g.arc(-HW + r() * CARD_W, -HH + r() * CARD_H, 1 + r() * 4, 0, 6.3); g.fill(); }
  g.restore();
  const pts = [[-96, -140], [96, -140], [96, 140], [-96, 140]]; const edge = []; pts.forEach((a, i) => { const b = pts[(i + 1) % 4]; for (let s = 0; s < 8; s++) edge.push([a[0] + (b[0] - a[0]) * s / 8, a[1] + (b[1] - a[1]) * s / 8]); });
  poly(g, pts); g.lineWidth = 1.6; g.strokeStyle = '#0e0e0e'; setDash(g, [6, 4]); g.stroke(); setDash(g, []);
  stitchAround(g, pts, 0, 9);
  // sigil: ring, patch diamond, crossed needle and scalpel
  circ(g, 0, 0, 56, null, 0); g.lineWidth = 3; g.strokeStyle = 'rgba(14,14,14,.8)'; g.beginPath(); g.arc(0, 0, 56, 0, 6.3); g.stroke(); g.lineWidth = 1.2; g.strokeStyle = BRASS; g.beginPath(); g.arc(0, 0, 50, 0, 6.3); g.stroke();
  g.save(); g.rotate(0.785); const sq = [[-26, -26], [26, -26], [26, 26], [-26, 26]]; poly(g, sq); fs(g, '#a89a80', 2); stitchAround(g, sq, 2, 7); g.restore();
  g.save(); g.scale(0.9, 0.9); g.rotate(0.6); g.translate(0, 0); rr(g, -4, -48, 8, 96, 3); fs(g, STEEL_D, 2); g.restore();
  g.save(); g.rotate(-0.6); g.beginPath(); g.moveTo(-42, 0); g.lineTo(42, 0); g.lineWidth = 3; g.strokeStyle = BRASS; g.stroke(); circ(g, 40, 0, 3, INK, 1.4); g.restore();
  circ(g, 0, 0, 7, BRASS, 2);
  staple(g, 0, -HH + 14, 22, 0); staple(g, 0, HH - 14, 22, 0);
  g.font = font(11, { bold: true, ui: true }); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(232,220,196,.75)'; g.fillText('G R A F T W O R K', 0, 74);
}
export function drawCardBack(ctx, x, y, o = {}) {
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); const s = o.scale || 1; ctx.scale(s, s); if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (o.hover) ctx.translate(0, -6);
  ctx.save(); ctx.translate(4, 7); rr(ctx, -HW, -HH, CARD_W, CARD_H, 12); ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fill(); ctx.restore();
  if (backCache === null) { const cv = makeCanvas(Math.ceil((CARD_W + 8) * S), Math.ceil((CARD_H + 8) * S)); if (cv) { cv.g.setTransform(S, 0, 0, S, 0, 0); cv.g.translate(HW + 4, HH + 4); renderBack(cv.g); backCache = cv.c; } else backCache = false; }
  if (backCache) ctx.drawImage(backCache, -HW - 4, -HH - 4, CARD_W + 8, CARD_H + 8); else renderBack(ctx);
  if (o.dim > 0) { rr(ctx, -HW, -HH, CARD_W, CARD_H, 12); ctx.fillStyle = `rgba(12,8,8,${Math.min(0.85, o.dim * 0.7)})`; ctx.fill(); }
  ctx.restore();
}

// ---------- graft tile (offers, shop, deck view). TOP-LEFT anchored ----------
export function drawGraftPatch(ctx, graft, x, y, w, h, o = {}) {
  const sc = o.scale || 1, col = COL[graft.school] || '#888', g = ctx;
  const lift = o.hover && !o.sold ? -4 : 0;
  g.save();
  g.translate(x + w / 2, y + h / 2 + lift); g.scale(sc, sc); g.translate(-w / 2, -h / 2);
  const pts = patchPoints(0, 0, w, h, graft.id || 'g');
  // shadow + body
  poly(g, pts.map((p) => [p[0] + 3, p[1] + 5])); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill();
  poly(g, pts); g.fillStyle = grad(g, 0, 0, w, h, [[0, mix(col, '#ffffff', o.hover ? 0.28 : 0.15)], [1, mix(col, INK, 0.45)]]); g.fill();
  g.save(); poly(g, pts); g.clip(); const r = rngOf('gp:' + graft.id);
  g.strokeStyle = 'rgba(43,30,26,.14)'; g.lineWidth = 0.8; g.beginPath(); for (let i = -h; i < w; i += 5) { g.moveTo(i, 0); g.lineTo(i + h * 0.6, h); } g.stroke();
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,240,220,${0.04 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  g.restore();
  poly(g, pts); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  const inset = pts.map((p) => [p[0] + (w / 2 - p[0]) * (5 / (w / 2)), p[1] + (h / 2 - p[1]) * (5 / (h / 2))]);
  stitchAround(g, pts, 0, 8, '#0e0e0e', 1.7); poly(g, inset); g.lineWidth = 1.2; setDash(g, [4, 3]); g.strokeStyle = 'rgba(14,14,14,.8)'; g.stroke(); setDash(g, []);
  const pad = Math.max(10, w * 0.07);
  // glyph + name
  const gr = Math.min(16, Math.max(10, w * 0.075));
  circ(g, pad + gr, pad + gr + 2, gr + 3, 'rgba(26,22,20,.85)', 1.6); drawSchoolGlyph(g, graft.school, pad + gr, pad + gr + 2, gr, COL[graft.school]);
  const nameX = pad + gr * 2 + 10, nameW = w - nameX - pad;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const lines = []; g.font = font(17, { bold: true }); const sz = fitText(g, graft.name, nameW, 17, 9, { bold: true });
  g.font = font(sz, { bold: true }); let nm = [graft.name]; if (g.measureText(graft.name).width > nameW) nm = wrapText(g, graft.name, nameW).slice(0, 2); void lines;
  const nlh = sz * 1.1; nm.forEach((ln, i) => { const yy = pad + gr + 2 + (i - (nm.length - 1) / 2) * nlh; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(ln, nameX + 1, yy + 1.5); g.fillStyle = COL.vellum; g.fillText(ln, nameX, yy); });
  // tier ribbon
  const ry = pad + gr * 2 + 10, rh = Math.max(15, Math.min(20, h * 0.075)), tier = String(graft.tier || 'safe'), tcol = TIER_COL[tier] || '#888';
  g.beginPath(); g.moveTo(-3, ry); g.lineTo(w + 3, ry); g.lineTo(w - 4, ry + rh / 2); g.lineTo(w + 3, ry + rh); g.lineTo(-3, ry + rh); g.closePath(); fs(g, grad(g, 0, ry, 0, ry + rh, [[0, mix(tcol, '#fff', 0.2)], [1, mix(tcol, INK, 0.35)]]), 1.8);
  g.font = font(Math.min(12, rh - 4), { bold: true, ui: true }); g.fillStyle = tier === 'greedy' ? INK : '#fff'; g.textAlign = 'left'; g.fillText(tier.toUpperCase() + (graft.rarity ? '  /  ' + graft.rarity : ''), pad, ry + rh / 2 + 0.5);
  // weight staples (1-3)
  const wt = Math.max(1, Math.min(3, graft.weight || 1));
  for (let i = 0; i < wt; i++) staple(g, w - pad - 8 - i * 17, ry + rh / 2, 13, 0);
  // text plate
  const ty = ry + rh + 7, th = h - ty - pad;
  if (th > 20) {
    rr(g, pad - 2, ty, w - pad * 2 + 4, th, 5); g.fillStyle = 'rgba(26,22,20,.82)'; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(232,220,196,.25)'; g.stroke();
    const tw = w - pad * 2 - 8; let fsz = 14, bl, pl, bh, ph;
    for (; fsz >= 8; fsz -= 0.5) { g.font = font(fsz); bl = wrapText(g, graft.boon || '', tw); g.font = font(fsz, { bold: true }); pl = wrapText(g, graft.price || '', tw); bh = bl.length * fsz * 1.2; ph = pl.length * fsz * 1.2; if (bh + ph + 14 <= th - 4) break; }
    const total = bh + ph + 10, y0 = ty + Math.max(2, (th - total) / 2); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = font(fsz); g.fillStyle = COL.vellum; bl.forEach((ln, i) => g.fillText(ln, pad + 2, y0 + (i + 1) * fsz * 1.2 - 3));
    const dy = y0 + bh + 4; g.beginPath(); g.moveTo(pad + 2, dy); g.lineTo(w - pad - 2, dy); g.lineWidth = 1; setDash(g, [4, 3]); g.strokeStyle = 'rgba(232,220,196,.4)'; g.stroke(); setDash(g, []);
    g.font = font(fsz, { bold: true }); g.fillStyle = SCAR_BRIGHT; pl.forEach((ln, i) => g.fillText(ln, pad + 2, dy + 4 + (i + 1) * fsz * 1.2 - 3));
  }
  // brass corner staple for flavour
  staple(g, w / 2, 1, 16, 0);
  if (o.selected) { poly(g, pts); g.lineWidth = 3.5; g.strokeStyle = COL.lamp; g.stroke(); poly(g, pts); g.lineWidth = 7; g.strokeStyle = 'rgba(242,193,78,.25)'; g.stroke(); }
  else if (o.hover) { poly(g, pts); g.lineWidth = 2; g.strokeStyle = 'rgba(242,193,78,.7)'; g.stroke(); }
  if (o.sold) { poly(g, pts); g.fillStyle = 'rgba(20,16,14,.65)'; g.fill(); g.save(); g.translate(w / 2, h / 2); g.rotate(-0.35); const bw = Math.min(w * 0.8, 150); rr(g, -bw / 2, -17, bw, 34, 4); g.lineWidth = 3; g.strokeStyle = SCAR_BRIGHT; g.stroke(); g.font = font(24, { bold: true }); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = SCAR_BRIGHT; g.fillText('SOLD', 0, 1); g.restore(); }
  if (o.dim > 0) { poly(g, pts); g.fillStyle = `rgba(12,8,8,${Math.min(0.85, o.dim * 0.7)})`; g.fill(); }
  g.restore();
}
