// doodle_env.js: the DOODLE environment. The world is a kid's notebook: every stage is a different page or desk, the board is a drawn page with
// a pencil-shaded lane, the stage tile is a doodled stage. Same exports, anchors and option semantics as the classic art_env.js.
//   drawBackdrop(ctx, id, w, h, t, o)        id: title hub garage busk club festival arena. o: beat 0..1, staticAmt 0..1
//   drawBoard(ctx, mapId, worldId, t, o)     logical coords, board at BOARD_X/BOARD_Y. o: beat, slotHint [[c,r]], hoverSlot [c,r], dropSlot [c,r]
//   drawStageBase(ctx, worldId, x, y, o)     (x,y) = stage tile centre. o: t, hp 0..1, hit 0..1, beat
// Everything static is baked once into 2 or 3 "boil" frames (different seeds) and replayed slowly; per frame work is a drawImage plus a few cheap
// live bits (twinkles, notes, rain, bunting, lasers, chevrons). No gradients, no glow, no Math.random, no Date. Safe in node with a mock ctx.
import { C, Pen, arc, rect, star, heart, makeCanvas as kitCanvas, setScale, getScale } from './doodle_kit.js';
import { BOARD_X, BOARD_Y, BOARD_W, BOARD_H, TILE, COLS, ROWS, WORLD_BY_ID, buildMap, laneAt, tileCx, tileCy } from './data_core.js';
import { drawHero } from './doodle_heroes.js';

export const makeCanvas = kitCanvas;
const TAU = Math.PI * 2;
const INK = C.ink;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };
const hn = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // deterministic 0..1 noise from an integer

const bgCache = new Map(), boardCache = new Map(), stageCache = new Map(), heroFrames = new Map();
export function setArtScale(n) { setScale(n); bgCache.clear(); boardCache.clear(); stageCache.clear(); heroFrames.clear(); creepCache.clear(); }

// ------------------------------------------------------------------------------------------------ baking
// draw(pen, c, f) paints in logical units with (0,0) at the top-left of a w x h box; the pen strokes are logical px wide (sc 1).
function bake(key, w, h, frames, scale, draw) {
  const e = { w, h, frames: [], direct: false, draw, key, scale };
  for (let f = 0; f < frames; f++) {
    const cv = makeCanvas(w * scale, h * scale);
    const c = cv && cv.getContext ? cv.getContext('2d') : null;
    if (!c) { e.direct = true; e.frames.length = 0; break; }
    c.scale(scale, scale);
    draw(new Pen(c, hashStr(key) + f * 977, 1), c, f);
    e.frames.push(cv);
  }
  return e;
}
function put(ctx, e, x, y, t, fps, alpha) {
  if (!e) return;
  if (e.direct) { ctx.save(); ctx.translate(x, y); e.draw(new Pen(ctx, hashStr(e.key), 1), ctx, 0); ctx.restore(); return; }
  const f = Math.floor(t * fps) % e.frames.length;
  if (alpha != null && alpha < 1) { const a = ctx.globalAlpha; ctx.globalAlpha = a * alpha; ctx.drawImage(e.frames[f < 0 ? 0 : f], x, y, e.w, e.h); ctx.globalAlpha = a; }
  else ctx.drawImage(e.frames[f < 0 ? 0 : f], x, y, e.w, e.h);
}
const lruSet = (map, key, val, max) => { if (map.size >= max) map.delete(map.keys().next().value); map.set(key, val); return val; };

// ------------------------------------------------------------------------------------------------ small doodle pieces (shared by backdrops and board props)
function ruled(c, w, h, o) {
  c.fillStyle = o.paper; c.fillRect(0, 0, w, h);
  const step = o.step || 44; c.strokeStyle = o.line; c.lineWidth = 1.6; c.beginPath();
  for (let y = step * 1.5; y < h; y += step) { c.moveTo(0, y); c.lineTo(w, y); }
  if (o.grid) for (let x = step; x < w; x += step) { c.moveTo(x, 0); c.lineTo(x, h); }
  c.stroke();
  if (o.margin) { c.strokeStyle = o.margin; c.lineWidth = 2.2; c.beginPath(); c.moveTo(w * 0.1, 0); c.lineTo(w * 0.1, h); c.stroke(); }
  c.fillStyle = o.grain || 'rgba(120,100,70,0.06)';
  for (let i = 0; i < Math.min(700, w * h / 2200); i++) c.fillRect(hn(i * 3 + 1) * w, hn(i * 3 + 2) * h, 2, 2);
}
function star4(p, x, y, r, col) { p.ln([x, y - r, x, y + r], col, 2.4, false, 0.5); p.ln([x - r, y, x + r, y], col, 2.4, false, 0.5); p.ln([x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6], col, 1.6, false, 0.4); }
function spiral(p, x, y, r, col) { const q = []; for (let i = 0; i <= 30; i++) { const a = i / 30 * TAU * 2.2, k = i / 30; q.push(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k); } p.ln(q, col, 2.6, false, 0.8); }
function noteDoodle(p, x, y, s, col) { p.shp(p.blob(x, y, s * 0.42, s * 0.3, 8, 0.05), col, INK, 2.4, { gap: 4 }); p.ln([x + s * 0.4, y - s * 0.1, x + s * 0.4, y - s * 1.3, x + s * 0.95, y - s * 1.0], INK, 2.6, false, 0.6); }
function cloud(p, x, y, s, col, line) { const q = []; for (let i = 0; i <= 20; i++) { const a = Math.PI + i / 20 * Math.PI; q.push(x + Math.cos(a) * s * (1 + 0.25 * Math.sin(i * 1.7 + 3)), y + Math.sin(a) * s * 0.55 * (1 + 0.3 * Math.sin(i * 2.3))); } q.push(x + s * 1.1, y + s * 0.02, x - s * 1.1, y + s * 0.02); p.shp(q, col, line || INK, 2.4, { gap: 5, alpha: 0.7 }); }
function sparkleDots(p, w, h, n, cols, seed) { for (let i = 0; i < n; i++) { const x = hn(seed + i * 2) * w, y = hn(seed + i * 2 + 1) * h; star4(p, x, y, 5 + hn(i + seed) * 6, cols[i % cols.length]); } }
function marginDoodles(p, w, h, cols, seed) {
  for (let i = 0; i < 16; i++) {
    const left = hn(seed + i) < 0.5, x = left ? 12 + hn(seed + i * 3) * w * 0.07 : w - 12 - hn(seed + i * 5) * w * 0.07, y = (i + hn(seed + i * 7) * 0.8) / 16 * h, col = cols[i % cols.length];
    if (i % 3 === 0) p.shp(star(x, y, 13, 0.45, hn(i) - 0.5), col, INK, 2.2, { gap: 4 });
    else if (i % 3 === 1) p.shp(heart(x, y, 24), col, INK, 2.2, { gap: 4 });
    else spiral(p, x, y, 13, col);
  }
}
function tape(p, x, y, w, h, rot, col) { const c = p.ctx; c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col || 'rgba(255,224,120,0.8)'; c.fillRect(-w / 2, -h / 2, w, h); c.strokeStyle = 'rgba(80,70,50,0.35)'; c.lineWidth = 1.4; c.strokeRect(-w / 2, -h / 2, w, h); c.restore(); }
function building(p, x, y, w, h, fill, win, lines) {
  p.shp(rect(x, y - h, w, h), fill, lines || INK, 2.8, { gap: 7, alpha: 0.6 });
  const cols = Math.max(1, Math.floor(w / 26)), rows = Math.max(1, Math.floor(h / 34));
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (hn(x + r * 7 + k * 13) > 0.35) p.shp(rect(x + 8 + k * (w - 16) / cols, y - h + 10 + r * (h - 20) / rows, 11, 14), win, null, 1, { gap: 4, alpha: 0.9 });
}
function lamp(p, x, y, h, glow) { p.ln([x, y, x, y - h], INK, 3.4, false, 0.8); p.ln([x, y - h, x + 18, y - h - 6], INK, 3.2, false, 0.6); p.shp(arc(x + 22, y - h - 4, 9, 7, 0, 360, 10), C.yellow, INK, 2.4, { gap: 4 }); if (glow) p.hatch([x + 10, y - h, x + 36, y - h, x + 52, y - h + 80, x - 4, y - h + 80], glow, 9, 1.2, 0.3); }
function speakerProp(p, x, y, s, col) { p.shp(rect(x - s * 0.42, y - s * 0.62, s * 0.84, s * 1.1, 6), col || '#4a4458', INK, 3, { gap: 5, alpha: 0.8 }); for (const [dy, r] of [[-0.3, 0.2], [0.18, 0.28]]) { p.shp(arc(x, y + dy * s, r * s, r * s, 0, 360, 12), C.grey, INK, 2.4, { gap: 4 }); p.dot(x, y + dy * s, r * s * 0.3, INK); } }
function plantProp(p, x, y, s) { p.shp(rect(x - s * 0.28, y, s * 0.56, s * 0.38, 4), C.orange, INK, 2.6, { gap: 5 }); for (let i = -2; i <= 2; i++) p.shp([x, y, x + i * s * 0.24, y - s * (0.5 + 0.1 * (2 - Math.abs(i))), x + i * s * 0.24 + s * 0.14, y - s * 0.1], C.green, INK, 2.2, { gap: 4 }); }
function crateProp(p, x, y, s) { p.shp(rect(x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8), '#c8975a', INK, 3, { gap: 6 }); p.ln([x - s * 0.4, y - s * 0.4, x + s * 0.4, y + s * 0.4], INK, 2.4, false, 0.8); p.ln([x + s * 0.4, y - s * 0.4, x - s * 0.4, y + s * 0.4], INK, 2.4, false, 0.8); }
function coneProp(p, x, y, s) { p.shp(rect(x - s * 0.42, y + s * 0.34, s * 0.84, s * 0.14), '#555065', INK, 2.4, { gap: 5 }); p.shp([x, y - s * 0.5, x + s * 0.34, y + s * 0.36, x - s * 0.34, y + s * 0.36], C.orange, INK, 2.8, { gap: 5 }); p.ln([x - s * 0.17, y - s * 0.02, x + s * 0.17, y - s * 0.02], '#fff', 4, false, 0.5); }
function ampProp(p, x, y, s) { p.shp(rect(x - s * 0.46, y - s * 0.34, s * 0.92, s * 0.7, 5), '#3d3750', INK, 3, { gap: 5, alpha: 0.85 }); p.shp(rect(x - s * 0.36, y - s * 0.08, s * 0.72, s * 0.34, 3), '#cbb98a', INK, 2, { gap: 4 }); for (let i = 0; i < 4; i++) p.dot(x - s * 0.27 + i * s * 0.18, y - s * 0.22, 3, i % 2 ? C.red : C.lime); }
function drumProp(p, x, y, s, col) { p.shp(rect(x - s * 0.45, y - s * 0.2, s * 0.9, s * 0.5, 4), col || C.red, INK, 3, { gap: 5 }); p.shp(arc(x, y - s * 0.2, s * 0.45, s * 0.14, 0, 360, 12), '#f7f0dc', INK, 2.6, { gap: 5 }); p.ln([x + s * 0.2, y - s * 0.5, x - s * 0.1, y - s * 0.25], INK, 3, false, 0.6); p.ln([x - s * 0.3, y - s * 0.5, x, y - s * 0.24], INK, 3, false, 0.6); }
function guitarProp(p, x, y, s, rot) { const c = p.ctx; c.save(); c.translate(x, y); c.rotate(rot); p.shp(p.blob(0, 0, s * 0.3, s * 0.38, 12, 0.04), C.orange, INK, 3, { gap: 6 }); p.dot(0, 0, s * 0.08, INK); p.shp(rect(-s * 0.05, -s * 0.95, s * 0.1, s * 0.62), '#7a4d28', INK, 2.4, { gap: 4 }); p.shp(rect(-s * 0.09, -s * 1.08, s * 0.18, s * 0.16), INK, INK, 2, { gap: 3 }); c.restore(); }
function cymbalProp(p, x, y, s) { p.ln([x, y + s * 0.5, x, y - s * 0.1], INK, 2.8, false, 0.5); p.shp(arc(x, y - s * 0.12, s * 0.5, s * 0.1, 0, 360, 12), C.yellow, INK, 2.6, { gap: 4 }); p.ln([x - s * 0.25, y + s * 0.5, x, y + s * 0.3, x + s * 0.25, y + s * 0.5], INK, 2.6, false, 0.6); }
function discoBall(p, x, y, r) { p.ln([x, 0, x, y - r], INK, 2.4, false, 0.6); const c = p.ctx; p.shp(arc(x, y, r, r, 0, 360, 16), '#c9ccd8', INK, 3, { gap: 5 }); c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip(); c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); for (let i = -3; i <= 3; i++) { c.moveTo(x - r, y + i * r / 3.4); c.lineTo(x + r, y + i * r / 3.4); c.moveTo(x + i * r / 3.4, y - r); c.lineTo(x + i * r / 3.4, y + r); } c.stroke(); c.restore(); }
function tentProp(p, x, y, s, col) { p.shp([x - s, y, x, y - s * 0.9, x + s, y], col, INK, 2.8, { gap: 6 }); p.shp([x - s * 0.22, y, x, y - s * 0.4, x + s * 0.22, y], INK, null, 1, { gap: 4 }); }

// ================================================================================================================ BACKDROPS
const STAGES = {
  title: { paper: '#27204c', line: '#3b3270', margin: '#9a4a7a', grain: 'rgba(255,255,255,0.04)', accent: C.pink },
  hub: { paper: '#efe9fb', line: '#d3c7ee', margin: '#e9a5c9', accent: C.pink },
  garage: { paper: C.paper, line: '#a9cdf0', margin: '#f08a8a', accent: C.orange },
  busk: { paper: '#46556f', line: '#5d6e8c', margin: '#7d90b0', grain: 'rgba(255,255,255,0.05)', accent: C.yellow },
  club: { paper: '#1c1535', line: '#33285d', margin: '#5a2a7a', grain: 'rgba(255,255,255,0.04)', accent: C.mag },
  festival: { paper: '#ffe9c8', line: '#f5c9a0', margin: '#f08a8a', accent: C.orange },
  arena: { paper: '#f6f0e2', line: '#bcd5ea', margin: '#f08a8a', accent: C.pink },
};
const PAINT = {
  title(p, c, w, h) {
    sparkleDots(p, w, h * 0.5, 22, ['#fff6b0', '#ffd0ea', '#bfe9ff'], 11);
    p.shp(arc(w * 0.78, h * 0.14, 46, 46, 0, 360, 18), C.yellow, INK, 3.4, { gap: 6 }); p.shp(arc(w * 0.78 + 14, h * 0.14 - 8, 38, 38, 0, 360, 16), STAGES.title.paper, null, 0, { gap: 3, alpha: 1 });
    for (let i = 0; i < 4; i++) p.hatch([w * (0.2 + i * 0.18), h * 0.5, w * (0.24 + i * 0.18), 0, w * (0.28 + i * 0.18), 0, w * (0.32 + i * 0.18), h * 0.5], [C.pink, C.cyan, C.yellow, C.lime][i], 12, 1.1, 0.14);
    let x = -10; for (let i = 0; x < w + 20; i++) { const bw = 60 + hn(i * 3) * 70, bh = h * (0.12 + hn(i * 5 + 1) * 0.16); building(p, x, h * 0.62, bw, bh, ['#4a3f86', '#5a4a9a', '#3c3470'][i % 3], '#ffe27a', '#d8d0ff'); x += bw + 6; }
    p.hatch(rect(0, h * 0.62, w, h * 0.38), '#17122e', 10, -0.4, 0.8);
    marginDoodles(p, w, h, [C.pink, C.cyan, C.yellow, C.lime], 5);
  },
  hub(p, c, w, h) {
    const cols = ['#ffc2de', '#c9f2a4', '#bfe9ff', '#ffe49a', '#d9ccf5'];
    for (let i = 0; i < 26; i++) { const x = hn(i * 7 + 1) * w, y = hn(i * 11 + 2) * h, col = cols[i % 5]; if (i % 4 === 0) p.shp(star(x, y, 15, 0.45, hn(i)), col, '#b9aedc', 2, { gap: 5 }); else if (i % 4 === 1) p.shp(heart(x, y, 28), col, '#b9aedc', 2, { gap: 5 }); else if (i % 4 === 2) spiral(p, x, y, 16, '#c3b5e8'); else noteDoodle(p, x, y, 16, col); }
    tape(p, w * 0.1, 18, 90, 26, -0.2); tape(p, w * 0.9, 18, 90, 26, 0.25);
  },
  garage(p, c, w, h) {
    p.shp(rect(w * 0.2, h * 0.04, w * 0.6, h * 0.17), '#d9d3c3', '#7d7688', 3, { gap: 9, alpha: 0.5 });
    for (let i = 1; i < 5; i++) p.ln([w * 0.2, h * (0.04 + i * 0.034), w * 0.8, h * (0.04 + i * 0.034)], '#9e97aa', 2.4, false, 0.8);
    p.txt('GARAGE DAYS', w * 0.5, h * 0.265, Math.min(46, w * 0.09), C.orange, { align: 'c', out: INK, ow: 5 });
    c.fillStyle = 'rgba(138,90,43,0.2)'; c.beginPath(); const sx = w * 0.7, sy = h * 0.78; for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU, r = 70 + hn(i + 4) * 38; c.lineTo(sx + Math.cos(a) * r * 1.3, sy + Math.sin(a) * r * 0.8); } c.fill();
    drumProp(p, w * 0.06, h * 0.4, 70, C.red); amp(p, w, h); guitarProp(p, w * 0.93, h * 0.58, 90, -0.4); cymbalProp(p, w * 0.07, h * 0.62, 70);
    for (let r = 0; r < 7; r++) for (let k = 0; k < 10; k++) { const bx = w * 0.12 + k * w * 0.077 + (r % 2) * 18, by = h * 0.86 + r * 14; if (bx < w * 0.93 && by < h - 8) p.hatch(rect(bx, by, w * 0.068, 10), '#d98a63', 6, 0.1, 0.35); }
    marginDoodles(p, w, h, [C.pink, C.lime, C.sky, C.yellow], 21);
    tape(p, w * 0.2, 10, 80, 24, -0.25); tape(p, w * 0.8, 10, 80, 24, 0.2);
    function amp(pp, ww, hh) { ampProp(pp, ww * 0.92, hh * 0.4, 80); }
  },
  busk(p, c, w, h) {
    const chalk = '#f4f1e8';
    let x = -10; for (let i = 0; x < w; i++) { const bw = 70 + hn(i * 3 + 9) * 80, bh = h * (0.16 + hn(i * 5 + 4) * 0.2); p.shp(rect(x, h * 0.6 - bh, bw, bh), '#5c6b86', chalk, 2.6, { gap: 9, alpha: 0.4 }); for (let r = 0; r < Math.floor(bh / 42); r++) for (let k = 0; k < Math.floor(bw / 30); k++) if (hn(i * 17 + r * 5 + k) > 0.4) p.shp(rect(x + 10 + k * 28, h * 0.6 - bh + 12 + r * 40, 14, 20), C.yellow, null, 1, { gap: 4, alpha: 0.85 }); x += bw + 8; }
    for (let k = 0; k < 4; k++) lamp(p, w * (0.14 + k * 0.24), h * 0.66, h * 0.17, '#ffe27a');
    for (let r = 0; r < 9; r++) for (let k = 0; k < Math.ceil(w / 54); k++) { const cx = k * 54 + (r % 2) * 27, cy = h * 0.67 + r * 22; if (cy < h - 4) p.ln(arc(cx, cy, 24, 11, 200, 340, 6), chalk, 2, false, 0.7); }
    p.txt('OLD TOWN', w * 0.5, h * 0.09, Math.min(44, w * 0.09), chalk, { align: 'c' });
    marginDoodles(p, w, h, [chalk, '#ffd0ea', '#bfe9ff'], 31);
  },
  club(p, c, w, h) {
    discoBall(p, w * 0.5, h * 0.12, 38);
    const cols = [C.mag, C.cyan, C.lime, C.yellow, C.pink];
    for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; p.ln([w * 0.5, h * 0.12, w * 0.5 + Math.sin(a) * h * 0.8, h * 0.12 + Math.cos(a) * h * 0.8], cols[i % 5], 2.8, false, 1.6); }
    for (let k = 0; k < 2; k++) { const sx = k ? w * 0.9 : w * 0.1; for (let r = 0; r < 3; r++) speakerProp(p, sx, h * (0.3 + r * 0.13), 56, '#3b3158'); }
    const tw = Math.ceil(w / 60), th = 6; for (let r = 0; r < th; r++) for (let k = 0; k < tw; k++) if ((r + k) % 2) p.hatch(rect(k * 60, h * 0.78 + r * ((h * 0.22) / th), 60, (h * 0.22) / th), cols[(r + k) % 5], 8, 0.8, 0.28);
    p.txt('NEON CLUB', w * 0.5, h * 0.27, Math.min(44, w * 0.09), C.pink, { align: 'c', out: '#0e0a22', ow: 5 });
    sparkleDots(p, w, h * 0.7, 26, [C.mag, C.cyan, C.lime, '#fff'], 41);
  },
  festival(p, c, w, h) {
    const bands = ['#ffd95a', '#ffb347', '#ff8a5a', '#f2619a', '#9b6bd8'];
    bands.forEach((col, i) => p.hatch(rect(0, i * h * 0.1, w, h * 0.105), col, 10, 0.15, 0.8));
    p.shp(arc(w * 0.5, h * 0.4, 70, 70, 0, 360, 20), C.yellow, INK, 3.4, { gap: 6 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; p.ln([w * 0.5 + Math.cos(a) * 82, h * 0.4 + Math.sin(a) * 82, w * 0.5 + Math.cos(a) * 112, h * 0.4 + Math.sin(a) * 112], C.yellow, 3, false, 0.6); }
    for (let i = 0; i < 4; i++) p.shp(arc(w * (0.1 + i * 0.3), h * 0.68, w * 0.32, h * 0.08, 180, 360, 14).concat([w * (0.1 + i * 0.3) + w * 0.32, h * 0.8, w * (0.1 + i * 0.3) - w * 0.32, h * 0.8]), i % 2 ? '#4fb85a' : '#6cc84a', INK, 2.8, { gap: 7 });
    tentProp(p, w * 0.2, h * 0.7, 54, C.red); tentProp(p, w * 0.82, h * 0.72, 62, C.blue); tentProp(p, w * 0.6, h * 0.69, 40, C.pink);
    p.hatch(rect(0, h * 0.8, w, h * 0.2), '#5a8a3a', 8, -0.3, 0.7);
    p.txt('SUNSET FEST', w * 0.5, h * 0.27, Math.min(46, w * 0.095), '#fff', { align: 'c', out: INK, ow: 6 });
    cloud(p, w * 0.2, h * 0.34, 50, '#fff'); cloud(p, w * 0.82, h * 0.3, 44, '#fff');
  },
  arena(p, c, w, h) {
    p.shp(rect(w * 0.2, h * 0.04, w * 0.6, h * 0.14, 10), '#2b2840', INK, 3.4, { gap: 8, alpha: 0.9 });
    p.txt('MEGA ARENA', w * 0.5, h * 0.125, Math.min(44, w * 0.088), C.yellow, { align: 'c' });
    for (let k = 0; k < 2; k++) { const tx = k ? w * 0.93 : w * 0.07; p.ln([tx, h * 0.5, tx, h * 0.16], INK, 4, false, 0.8); p.shp(rect(tx - 26, h * 0.1, 52, 38, 4), '#f3e9a0', INK, 3, { gap: 6 }); for (let i = -1; i <= 1; i++) p.ln([tx + i * 12, h * 0.15, tx + i * 90 * (k ? -1 : 1) - 30, h * 0.46], '#ffe27a', 2.2, false, 1.2); }
    const heads = [C.pink, C.sky, C.yellow, C.lime, C.orange, C.lav];
    for (let r = 0; r < 9; r++) { const y = h * 0.28 + r * h * 0.045, cnt = Math.floor(w / 26); p.ln([w * 0.04, y + 14, w * 0.96, y + 14], '#a9a39a', 2.2, false, 0.9); for (let k = 0; k < cnt; k++) { const x = w * 0.04 + (k + 0.5) / cnt * w * 0.92 + (r % 2) * 6; p.dot(x, y + 4, 7, heads[(k * 7 + r * 3) % 6]); p.ln(arc(x, y + 4, 7, 7, 0, 360, 8), INK, 1.4, true, 0.4); } }
    p.hatch(rect(0, h * 0.7, w, h * 0.3), '#d9c9a0', 9, 0.4, 0.55);
    p.ln([0, h * 0.7, w, h * 0.7], INK, 3.2, false, 1);
    marginDoodles(p, w, h * 0.7, [C.pink, C.cyan, C.yellow], 51);
  },
};
function bgScale(w, h) { return clamp(Math.min(getScale(), Math.sqrt(1.4e6 / Math.max(1, w * h))), 0.6, 2); }
function bakeBg(id, w, h) {
  const st = STAGES[id], s = bgScale(w, h);
  return bake('bg|' + id + '|' + Math.round(w) + 'x' + Math.round(h), Math.round(w), Math.round(h), 2, s, (p, c) => {
    ruled(c, w, h, st);
    PAINT[id](p, c, w, h);
  });
}
const twinkle = (c, w, h, t, n, col, ymax) => { c.strokeStyle = col; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); for (let i = 0; i < n; i++) { const k = Math.sin(t * (1.5 + hn(i) * 2.2) + i * 5); if (k < 0.2) continue; const x = hn(i * 3 + 7) * w, y = hn(i * 5 + 3) * h * ymax, r = 3 + k * 5; c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); } c.stroke(); };
function floatNotes(c, w, h, t, n, cols) {
  c.lineWidth = 2.6; c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const k = ((t * 0.07 + i / n) % 1), x = w * (0.12 + hn(i * 9 + 2) * 0.76) + Math.sin(t * 0.9 + i * 2) * 16, y = h * (1.02 - k * 1.1), a = Math.sin(k * Math.PI);
    c.globalAlpha = a * 0.9; c.fillStyle = cols[i % cols.length]; c.strokeStyle = INK; c.beginPath(); c.ellipse(x, y, 7, 5, -0.4, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x + 6, y - 2); c.lineTo(x + 6, y - 22); c.lineTo(x + 14, y - 18); c.stroke();
  }
  c.globalAlpha = 1;
}
const DYN = {
  title(c, w, h, t, beat) { twinkle(c, w, h, t, 18, '#fff6b0', 0.5); floatNotes(c, w, h, t, 5, [C.pink, C.cyan, C.yellow, C.lime]); },
  hub(c, w, h, t) { floatNotes(c, w, h, t, 4, ['#ffc2de', '#c9f2a4', '#bfe9ff', '#ffe49a']); },
  garage(c, w, h, t, beat) { floatNotes(c, w, h, t, 3, [C.orange, C.pink, C.sky]); if (beat > 0.05) { c.strokeStyle = C.orange; c.lineWidth = 3; c.globalAlpha = beat * 0.6; c.beginPath(); c.arc(w * 0.92, h * 0.4, 52 + (1 - beat) * 16, -0.9, 0.9); c.stroke(); c.globalAlpha = 1; } },
  busk(c, w, h, t) {
    c.strokeStyle = '#d9e6ff'; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < 40; i++) { const x = (hn(i * 3) * w + t * 30) % w, y = ((hn(i * 5 + 1) * h + t * 340) % h); c.moveTo(x, y); c.lineTo(x - 5, y + 16); }
    c.stroke(); twinkle(c, w, h, t, 6, '#fff6b0', 0.3);
  },
  club(c, w, h, t, beat) {
    const cols = [C.mag, C.cyan, C.lime]; c.lineWidth = 3.6; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = Math.sin(t * (0.8 + i * 0.3) + i * 2) * 0.7; c.strokeStyle = cols[i]; c.globalAlpha = 0.55 + beat * 0.4; c.beginPath(); c.moveTo(w * 0.5, h * 0.12); c.lineTo(w * 0.5 + Math.sin(a) * h, h * 0.12 + Math.cos(a) * h); c.stroke(); }
    c.globalAlpha = 1; twinkle(c, w, h, t, 22, '#ffffff', 0.9);
  },
  festival(c, w, h, t, beat) {
    const sway = Math.sin(t * 1.6) * 7, cols = [C.red, C.yellow, C.blue, C.pink, C.lime, C.orange];
    for (let row = 0; row < 2; row++) {
      const y0 = h * (0.04 + row * 0.055), n = 12; c.strokeStyle = INK; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, y0); c.quadraticCurveTo(w / 2, y0 + 34 + sway * (row ? -1 : 1), w, y0); c.stroke();
      for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, x = w * u, y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * (y0 + 34 + sway * (row ? -1 : 1)) + u * u * y0; c.fillStyle = cols[(i + row * 2) % 6]; c.beginPath(); c.moveTo(x - 11, y); c.lineTo(x + 11, y); c.lineTo(x, y + 24 + beat * 4); c.closePath(); c.fill(); c.stroke(); }
    }
    twinkle(c, w, h, t, 6, '#fff', 0.35);
  },
  arena(c, w, h, t, beat) {
    c.strokeStyle = INK; c.lineWidth = 2.6; c.lineCap = 'round';
    for (let i = 0; i < 14; i++) { const x = w * (0.06 + hn(i * 4 + 1) * 0.88), y = h * (0.3 + hn(i * 6 + 2) * 0.36), k = Math.sin(t * 5 + i * 1.7) * 0.5 + 0.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(i) * 4, y - 12 - k * 9 - beat * 5); c.stroke(); }
    twinkle(c, w, h, t, 10, '#ffe27a', 0.2);
  },
};
const creepCache = new Map();
function bakeCreep(w, h) {
  const s = clamp(Math.min(getScale(), Math.sqrt(0.8e6 / Math.max(1, w * h))), 0.5, 1);
  return bake('creep|' + Math.round(w) + 'x' + Math.round(h), Math.round(w), Math.round(h), 2, s, (p, c) => {
    const n = Math.round((w + h) / 14);
    for (let i = 0; i < n; i++) {
      const edge = Math.floor(hn(i * 3 + 1) * 4), u = hn(i * 7 + 2), depth = Math.pow(hn(i * 5 + 3), 1.7) * 0.2;
      const x = edge === 0 ? u * w : edge === 1 ? w * (1 - depth) : edge === 2 ? u * w : w * depth, y = edge === 0 ? h * depth : edge === 1 ? u * h : edge === 2 ? h * (1 - depth) : u * h;
      const r = 16 + hn(i + 9) * 26;
      p.ln(p.spiky(r, r * 0.9, 9, 0.2, x, y), i % 2 ? '#8e8aa0' : '#6d6a80', 3, true, 1.4);
      if (i % 3 === 0) { p.ln(p.spiky(r, r * 0.9, 9, 0.2, x + 4, y + 3), C.cyan, 1.6, true, 1); p.ln(p.spiky(r, r * 0.9, 9, 0.2, x - 4, y - 3), C.mag, 1.6, true, 1); }
      p.hatch(p.spiky(r * 0.8, r * 0.7, 9, 0.15, x, y), '#c9c4d6', 7, 0.5, 0.7);
      if (r > 28) { p.eye(x - r * 0.28, y - 3, r * 0.2, 0.6); p.eye(x + r * 0.28, y - 3, r * 0.2, 0.6); }
    }
  });
}
function staticCreep(ctx, w, h, t, amt) {
  if (!(amt > 0.02)) return;
  const key = Math.round(w) + 'x' + Math.round(h) + '|' + getScale();
  let e = creepCache.get(key); if (!e) e = lruSet(creepCache, key, bakeCreep(w, h), 6);
  // the fuzz creeps in from the edges: draw the layer a little larger when calm, full size at full static
  const k = 1 + (1 - clamp(amt, 0, 1)) * 0.3, a = clamp(amt * 1.3, 0, 0.95);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(k, k); ctx.translate(-w / 2, -h / 2);
  put(ctx, e, 0, 0, t, 3, a);
  ctx.restore();
}
export function drawBackdrop(ctx, id, w, h, t, o) {
  o = o || {}; t = t || 0; id = STAGES[id] ? id : 'title';
  const beat = clamp(o.beat || 0, 0, 1);
  const key = id + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + getScale();
  let e = bgCache.get(key); if (!e) e = lruSet(bgCache, key, bakeBg(id, w, h), 10);
  ctx.save();
  put(ctx, e, 0, 0, t, 2.5);
  DYN[id](ctx, w, h, t, beat);
  staticCreep(ctx, w, h, t, o.staticAmt || 0);
  ctx.restore();
}

// ================================================================================================================ BOARD
const THEME = {
  garage: { page: '#fff7e4', line: '#d9e8f7', pad: '#ffe2a8', lane: '#a9a39a', accent: C.orange, props: ['speaker', 'crate', 'amp', 'plant'] },
  busk: { page: '#e9edf5', line: '#c9d6ea', pad: '#cfe0ff', lane: '#7e8ba3', accent: C.yellow, props: ['plant', 'crate', 'cone', 'speaker'] },
  club: { page: '#2c2350', line: '#3f3470', pad: '#6a4ab0', lane: '#16102e', accent: C.mag, props: ['speaker', 'amp', 'speaker', 'cone'] },
  festival: { page: '#fff0d6', line: '#f6d6a8', pad: '#ffc98a', lane: '#b89a72', accent: C.orange, props: ['plant', 'crate', 'cone', 'amp'] },
  arena: { page: '#faf5ea', line: '#cfe0ee', pad: '#c9dcf2', lane: '#8d93a6', accent: C.pink, props: ['cone', 'speaker', 'amp', 'crate'] },
};
const PAD = 26;
function pathSet(m) { const s = new Set(); for (const lane of m.lanes) for (const [c, r] of lane.tiles) s.add(c + ',' + r); return s; }
function gatePos(lane) {
  const p0 = lane.pts[0], p1 = lane.pts[1]; let gx = p0.x, gy = p0.y;
  if (p0.c < 0) gx = BOARD_X; else if (p0.c >= COLS) gx = BOARD_X + BOARD_W;
  if (p0.r < 0) gy = BOARD_Y; else if (p0.r >= ROWS) gy = BOARD_Y + BOARD_H;
  return { gx, gy, ang: Math.atan2(p1.y - p0.y, p1.x - p0.x) };
}
function paintProp(p, kind, x, y) { const s = 54; if (kind === 'speaker') speakerProp(p, x, y, s); else if (kind === 'plant') plantProp(p, x, y + 6, s); else if (kind === 'crate') crateProp(p, x, y + 4, s * 0.86); else if (kind === 'cone') coneProp(p, x, y, s); else ampProp(p, x, y + 2, s); }
function paintBoard(p, c, mapId, worldId) {
  const m = buildMap(mapId), th = THEME[worldId] || THEME.garage, pset = pathSet(m);
  c.translate(-BOARD_X + PAD, -BOARD_Y + PAD);
  // the page the board is drawn on: a slightly lighter sheet with faint ruled lines, an uneven double border and tape in the corners
  c.fillStyle = th.page; c.fillRect(BOARD_X - 6, BOARD_Y - 6, BOARD_W + 12, BOARD_H + 12);
  c.strokeStyle = th.line; c.lineWidth = 1.6; c.beginPath(); for (let y = BOARD_Y + 18; y < BOARD_Y + BOARD_H; y += 36) { c.moveTo(BOARD_X, y); c.lineTo(BOARD_X + BOARD_W, y); } c.stroke();
  p.ln(rect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, BOARD_H + 8, 10), INK, 3.6, true, 1.4); p.ln(rect(BOARD_X - 10, BOARD_Y - 9, BOARD_W + 20, BOARD_H + 19, 12), th.accent, 2.4, true, 2.2);
  tape(p, BOARD_X + 10, BOARD_Y - 6, 70, 22, -0.4); tape(p, BOARD_X + BOARD_W - 10, BOARD_Y - 6, 70, 22, 0.4); tape(p, BOARD_X + 10, BOARD_Y + BOARD_H + 6, 70, 22, 0.4); tape(p, BOARD_X + BOARD_W - 10, BOARD_Y + BOARD_H + 6, 70, 22, -0.4);
  c.save(); c.beginPath(); c.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H); c.clip();
  // buildable pads: scribbled squares with a tiny plus; blocked tiles: doodled props with a grey hatch shadow
  m.slots.forEach((s, i) => {
    const x0 = BOARD_X + s.c * TILE, y0 = BOARD_Y + s.r * TILE;
    if (s.blocked) {
      p.hatch([s.x - 22, s.y + 22, s.x + 26, s.y + 22, s.x + 30, s.y + 30, s.x - 18, s.y + 30], '#8a8696', 5, 0.2, 0.5);
      paintProp(p, th.props[(s.c * 3 + s.r * 5) % th.props.length], s.x, s.y);
    } else {
      p.hatch(rect(x0 + 6, y0 + 6, TILE - 12, TILE - 12, 8), th.pad, 8.5, -0.7 + (i % 3) * 0.15, 0.42);
      p.ln(rect(x0 + 5, y0 + 5, TILE - 10, TILE - 10, 9), INK, 2.2, true, 1.1);
      p.ln([s.x - 7, s.y, s.x + 7, s.y], INK, 2.2, false, 0.5); p.ln([s.x, s.y - 7, s.x, s.y + 7], INK, 2.2, false, 0.5);
    }
  });
  // the lane: every path tile pencil-shaded, ink edges where the lane meets the page, a dashed centre line
  for (const key of pset) {
    const [cc, rr] = key.split(',').map(Number); if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
    const x0 = BOARD_X + cc * TILE, y0 = BOARD_Y + rr * TILE;
    p.hatch(rect(x0, y0, TILE, TILE), th.lane, 7, 0.9 + ((cc + rr) % 2) * 0.1, worldId === 'club' ? 0.9 : 0.5);
    if (!pset.has(cc + ',' + (rr - 1))) p.ln([x0 - 1, y0, x0 + TILE + 1, y0], INK, 3.2, false, 1);
    if (!pset.has(cc + ',' + (rr + 1))) p.ln([x0 - 1, y0 + TILE, x0 + TILE + 1, y0 + TILE], INK, 3.2, false, 1);
    if (!pset.has((cc - 1) + ',' + rr)) p.ln([x0, y0 - 1, x0, y0 + TILE + 1], INK, 3.2, false, 1);
    if (!pset.has((cc + 1) + ',' + rr)) p.ln([x0 + TILE, y0 - 1, x0 + TILE, y0 + TILE + 1], INK, 3.2, false, 1);
  }
  for (const lane of m.lanes) { const q = []; for (const pt of lane.pts) q.push(pt.x, pt.y); p.ln(q, worldId === 'club' ? '#e8e0ff' : '#f7f2e4', 3, false, 1, [14, 12]); }
  // spawn gates: an angry doodled hole with brows and fangs
  for (const lane of m.lanes) {
    const g = gatePos(lane); c.save(); c.translate(g.gx, g.gy); c.rotate(g.ang);
    p.shp(p.spiky(16, 30, 9, 0.12, 4, 0), '#1c1530', INK, 3, { gap: 4, alpha: 1 });
    p.ln([-6, -14, 8, -8], C.red, 3.4, false, 0.5); p.ln([-6, 14, 8, 8], C.red, 3.4, false, 0.5);
    p.shp([6, -3, 11, 3, 15, -3], '#fff', INK, 1.6, { gap: 3 }); p.shp([6, 3, 11, -3, 15, 3], '#fff', INK, 1.6, { gap: 3 });
    c.restore();
  }
  c.restore();
}
function boardEntry(mapId, worldId) {
  const key = mapId + '|' + worldId + '|' + getScale();
  let e = boardCache.get(key);
  if (!e) {
    e = lruSet(boardCache, key, bake('board|' + mapId + '|' + worldId, BOARD_W + PAD * 2, BOARD_H + PAD * 2, 2, getScale(), (p, c) => paintBoard(p, c, mapId, worldId)), 8);
  }
  return e;
}
function brackets(c, x, y, half, bounce, col) {
  c.lineWidth = 3.4; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const pass of [[INK, 6.2, 0], [col, 3.4, 0.9]]) {
    c.strokeStyle = pass[0]; c.lineWidth = pass[1]; c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const px = x + sx * (half + bounce), py = y + sy * (half + bounce) + pass[2]; c.moveTo(px - sx * 14, py); c.lineTo(px, py); c.lineTo(px, py - sy * 14); }
    c.stroke();
  }
}
export function drawBoard(ctx, mapId, worldId, t, o) {
  o = o || {}; t = t || 0;
  const m = buildMap(mapId), th = THEME[worldId] || THEME.garage, wd = WORLD_BY_ID[worldId] || { accent: C.pink };
  const beat = clamp(o.beat || 0, 0, 1), e = boardEntry(mapId, worldId);
  ctx.save();
  if (e.direct) { ctx.save(); e.draw(new Pen(ctx, hashStr(e.key), 1), ctx, 0); ctx.restore(); } else put(ctx, e, BOARD_X - PAD, BOARD_Y - PAD, t, 3.5);
  // flowing chevrons along every lane (pencil ticks marching to the stage)
  ctx.save(); ctx.beginPath(); ctx.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = worldId === 'club' ? 'rgba(232,224,255,0.75)' : 'rgba(43,39,51,0.5)';
  for (const lane of m.lanes) {
    const sp = 58, off = (t * 30) % sp; ctx.beginPath();
    for (let d = off; d < lane.total; d += sp) { const p = laneAt(lane, d), c = Math.cos(p.ang), s = Math.sin(p.ang); const bx = p.x - c * 5, by = p.y - s * 5; ctx.moveTo(bx - s * 8, by + c * 8); ctx.lineTo(p.x + c * 4, p.y + s * 4); ctx.lineTo(bx + s * 8, by - c * 8); }
    ctx.stroke();
  }
  ctx.restore();
  // gate sparks: a few grey scribble flecks flicking out of each hole
  for (const lane of m.lanes) {
    const g = gatePos(lane); ctx.save(); ctx.translate(g.gx, g.gy); ctx.rotate(g.ang); ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
    for (let i = 0; i < 4; i++) { const k = (t * 1.3 + i * 0.27) % 1; ctx.strokeStyle = i % 2 ? '#9a94b8' : C.mag; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.moveTo(8 + k * 24, -10 + i * 7 + Math.sin(t * 6 + i) * 3); ctx.lineTo(13 + k * 24, -8 + i * 7 + Math.sin(t * 6 + i) * 3); ctx.stroke(); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  const bounce = Math.abs(Math.sin(t * 5)) * 3;
  if (o.slotHint) for (const [c, r] of o.slotHint) { const x = tileCx(c), y = tileCy(r); ctx.fillStyle = 'rgba(157,255,58,0.35)'; ctx.fillRect(x - 28, y - 28, 56, 56); brackets(ctx, x, y, 28, bounce, C.lime); }
  if (o.hoverSlot) { const [c, r] = o.hoverSlot, x = tileCx(c), y = tileCy(r); ctx.fillStyle = 'rgba(255,214,10,0.3)'; ctx.fillRect(x - 29, y - 29, 58, 58); brackets(ctx, x, y, 29, 1, C.yellow); }
  if (o.dropSlot) {
    const [c, r] = o.dropSlot, x = tileCx(c), y = tileCy(r), a = wd.accent || th.accent;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const pass of [[INK, 7.5], [a, 4]]) { ctx.strokeStyle = pass[0]; ctx.lineWidth = pass[1]; ctx.beginPath(); ctx.ellipse(x, y, 25 + bounce, 24 + bounce * 0.8, t * 0.4, 0.2, TAU - 0.35); ctx.stroke(); }
    const ay = y - 42 - bounce * 1.6; ctx.fillStyle = a; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 10, ay - 8); ctx.lineTo(x + 10, ay - 8); ctx.lineTo(x, ay + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (beat > 0.03) { ctx.strokeStyle = wd.accent || th.accent; ctx.globalAlpha = 0.5 * beat; ctx.lineWidth = 4 + beat * 3; ctx.strokeRect(BOARD_X - 7, BOARD_Y - 7, BOARD_W + 14, BOARD_H + 14); ctx.globalAlpha = 1; }
  ctx.restore();
}

// ================================================================================================================ STAGE BASE
const SW = 120, SH = 110;   // sprite box, centred on (x, y - 8)
function paintStage(p, c, ok, cracked, accent) {
  c.translate(SW / 2, SH / 2 + 8);
  p.hatch([-50, 22, 50, 22, 56, 40, -56, 40], '#8a6a4a', 6, 0.3, 0.8); p.ln([-50, 22, 50, 22, 56, 40, -56, 40], INK, 3, true, 1);
  p.shp(rect(-46, 10, 92, 14), accent, INK, 3, { gap: 6 });
  for (let i = -3; i <= 3; i++) p.ln([i * 13, 10, i * 13 - 3, 24], INK, 1.8, false, 0.4);
  for (const sd of [-1, 1]) { const x = sd * 42; p.shp(rect(x - 11, -30, 22, 42, 4), '#3d3750', INK, 3, { gap: 5, alpha: 0.9 }); p.shp(arc(x, -18, 6, 6, 0, 360, 8), C.grey, INK, 2, { gap: 4 }); p.shp(arc(x, -3, 7.5, 7.5, 0, 360, 8), C.grey, INK, 2, { gap: 4 }); }
  p.ln([-42, -36, 42, -36], INK, 4, false, 0.8); p.ln([-30, -36, -30, -48, 30, -48, 30, -36], INK, 2.6, false, 0.6);
  for (let i = 0; i < 3; i++) { const x = -20 + i * 20; p.shp(rect(x - 5, -55, 10, 9, 2), ok ? [C.pink, C.cyan, C.yellow][i] : '#6a6478', INK, 2.2, { gap: 4 }); }
  p.shp(rect(-26, -32, 52, 24, 3), ok ? '#2a2548' : '#3e3a50', INK, 2.6, { gap: 6 });
  if (cracked) { p.ln([-38, -44, -30, -30, -34, -16, -22, -4], INK, 2.6, false, 1.4); p.ln([30, -40, 24, -26, 32, -12], INK, 2.4, false, 1.2); p.ln([-4, 10, 0, 18, 8, 22], INK, 2.2, false, 1); }
  p.txt(ok ? 'LIVE' : 'OFF', 0, 60 - 8, 12, ok ? C.red : '#8a869a', { align: 'c', w: 2 });
}
function stageEntry(worldId, ok, cracked) {
  const key = worldId + '|' + ok + '|' + cracked + '|' + getScale();
  let e = stageCache.get(key);
  if (!e) { const a = (WORLD_BY_ID[worldId] || { accent: C.pink }).accent; e = lruSet(stageCache, key, bake('stage|' + worldId + '|' + ok + cracked, SW, SH, 2, getScale(), (p, c) => paintStage(p, c, ok, cracked, a)), 20); }
  return e;
}
// tiny roxor and jasmin: the real hero art when it can be drawn, else a small doodle stand-in
function miniHeroes(c, p, pose, tt) {
  try { drawHero(c, 'roxor', -11, 7, 38, { t: tt, pose }); drawHero(c, 'jasmin', 11, 7, 36, { t: tt + 0.4, pose: pose === 'beat' ? 'sing' : pose }); return; } catch (err) { /* fall through to the stand-ins */ }
  for (const [x, col, hair] of [[-11, C.lime, INK], [11, C.pink, '#3a2a40']]) {
    p.shp(rect(x - 5, -6, 10, 14, 3), col, INK, 2, { gap: 4 }); p.shp(arc(x, -12, 6.5, 6.5, 0, 360, 10), C.skin, INK, 2, { gap: 4 });
    if (x < 0) p.shp([x - 3, -17, x + 1, -26, x + 4, -17], '#7a4d28', INK, 1.6, { gap: 3 }); else p.shp(arc(x + 6, -14, 3.5, 6, 0, 360, 8), hair, INK, 1.4, { gap: 3 });
  }
}
function heroSprite(pose, t) {
  const f = Math.floor(t * 5) % 8, key = pose + '|' + f + '|' + getScale();
  let e = heroFrames.get(key);
  if (e === undefined) {
    const cv = makeCanvas(88 * getScale(), 52 * getScale()), c = cv && cv.getContext ? cv.getContext('2d') : null;
    if (c) { c.scale(getScale(), getScale()); c.translate(44, 26); miniHeroes(c, new Pen(c, 99 + f, 1), pose, f / 5); e = cv; } else e = false;
    lruSet(heroFrames, key, e, 80);
  }
  return e || null;
}
export function drawStageBase(ctx, worldId, x, y, o) {
  o = o || {}; const t = o.t || 0, hp = o.hp == null ? 1 : clamp(o.hp, 0, 1), hit = clamp(o.hit || 0, 0, 1), beat = clamp(o.beat || 0, 0, 1);
  const wd = WORLD_BY_ID[worldId] || { accent: C.pink }, ok = hp > 0.34, cracked = hp < 0.5;
  ctx.save(); ctx.translate(x + (hit > 0.05 ? Math.sin(t * 90) * 2.6 * hit : 0), y + 5);
  const e = stageEntry(worldId, ok, cracked);
  if (e.direct) { ctx.save(); ctx.translate(-SW / 2, -SH / 2 - 8); e.draw(new Pen(ctx, hashStr(e.key), 1), ctx, 0); ctx.restore(); } else put(ctx, e, -SW / 2, -SH / 2 - 8, t, 3);
  // live bits: swaying light beams, bouncing equalizer bars, speaker arcs on the beat
  if (ok) {
    const cols = [C.pink, C.cyan, C.yellow]; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * 0.4 + Math.sin(t * 1.5 + i * 2) * 0.2; ctx.strokeStyle = cols[i]; ctx.globalAlpha = 0.45 + beat * 0.35; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-20 + i * 20, -60); ctx.lineTo(-20 + i * 20 + Math.cos(a) * 52, -60 + Math.sin(a) * 52); ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 7; i++) { const bh = 3 + (0.3 + 0.7 * Math.abs(Math.sin(t * (2.4 + hn(i) * 3) + i))) * (8 + beat * 7); ctx.fillStyle = i % 2 ? wd.accent : C.cyan; ctx.fillRect(-22 + i * 6.6, -12 - bh, 4, bh); }
    for (const sd of [-1, 1]) { ctx.strokeStyle = wd.accent; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.3 + beat * 0.6; ctx.beginPath(); ctx.arc(sd * 42, -10, 16 + beat * 5, sd < 0 ? Math.PI - 0.9 : -0.9, sd < 0 ? Math.PI + 0.9 : 0.9); ctx.stroke(); } ctx.globalAlpha = 1;
  }
  const pose = hp <= 0.34 ? 'sad' : hit > 0.2 ? 'shock' : (hp > 0.7 ? 'cheer' : 'beat');
  const hs = heroSprite(pose, t);
  if (hs) ctx.drawImage(hs, -44, -26 - 3, 88, 52); else { ctx.save(); ctx.translate(0, -3); miniHeroes(ctx, new Pen(ctx, 99, 1), pose, t); ctx.restore(); }
  if (hit > 0.05) {
    ctx.fillStyle = 'rgba(255,60,80,' + (hit * 0.3).toFixed(3) + ')'; ctx.fillRect(-46, -58, 92, 76);
    ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = -2.6 + i * 0.55, r0 = 40 + hit * 6; ctx.moveTo(Math.cos(a) * r0, -20 + Math.sin(a) * r0 * 0.8); ctx.lineTo(Math.cos(a) * (r0 + 12), -20 + Math.sin(a) * (r0 + 12) * 0.8); } ctx.stroke();
  }
  if (hp < 0.6) for (let i = 0; i < 4; i++) { const k = (t * 0.7 + i * 0.26) % 1; ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = '#8a869a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(-34 + i * 22 + Math.sin(t * 2 + i) * 4, -40 - k * 30, 4 + k * 8, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (hp < 0.5) for (let i = 0; i < 3; i++) { const k = (t * 2.2 + i * 0.33) % 1; ctx.fillStyle = i % 2 ? C.yellow : C.orange; ctx.globalAlpha = 1 - k; ctx.fillRect(-30 + i * 30 + Math.sin(i * 9) * 6, -26 - k * 18, 3, 3); } ctx.globalAlpha = 1;
  ctx.restore();
}
