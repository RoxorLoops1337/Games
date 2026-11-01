// doodle_env.js: the DOODLE environment. The world is a kid's notebook: every stage is a different page or desk, the board is a drawn page with
// a pencil-shaded lane, the stage tile is a doodled stage. Same exports, anchors and option semantics as the classic art_env.js.
//   drawBackdrop(ctx, id, w, h, t, o)        id: title hub garage busk club festival arena beach moon. o: beat 0..1, staticAmt 0..1, skin (a BOARD_SKIN_IDS id)
//   drawBoard(ctx, mapId, worldId, t, o)     logical coords, board at BOARD_X/BOARD_Y. o: beat, slotHint [[c,r]], hoverSlot [c,r], dropSlot [c,r], skin
//   BOARD_SKIN_IDS, BOARD_SKINS              cosmetic board skins: 'skin_paper' (default, the look every world has), 'skin_chalk' (dark slate, chalk-white outlines),
//                                            'skin_sticker' (bright scrapbook: washi tape, star stickers), 'skin_midnight' (inky night page, glow crayon). BOARD_SKINS[id] = { name, desc }.
//                                            o.skin is a palette and decor override on top of every world's theme; a missing or unknown id is 'skin_paper' (output unchanged).
//                                            Baked sprites are keyed by skin, so switching skins costs one bake per (world, skin) and nothing per frame.
//   drawStageBase(ctx, worldId, x, y, o)     (x,y) = stage tile centre. o: t, hp 0..1, hit 0..1, beat,
//                                            studio (optional object of Studio upgrade levels, e.g. profile.studio: { amp: 7, hype: 3, ... }).
//                                            With o.studio the stage gains props by level: amp stacks (amp), a banner (heropow + herocd), string
//                                            lights (hype + lucky) and truss poles (stagehp). Missing or empty o.studio draws the plain stage.
//                                            The props adapt to the map: they only go where the neighbour tiles are free (no lane, no blocked decor), see stageRoom().
//   studioProps(levels)                      pure: Studio levels -> { amps 0..4, riser 0..3, cables, charm, jar 0..4, banner 0..2, lights 0..3, van 0..3, truss 0..3, eq 0..3, total }
//   drawStudioScene(ctx, w, h, t, studio, o) the animated "backstage" picture for the Studio tab (w x h about 504 x 170). o: heroLv {roxor,jasmin}, outfits {roxor,jasmin}
// Everything static is baked once into 2 or 3 "boil" frames (different seeds) and replayed slowly; per frame work is a drawImage plus a few cheap
// live bits (twinkles, notes, rain, bunting, lasers, chevrons). No gradients, no glow, no unseeded randomness, no clock. Safe in node with a mock ctx.
import { C, Pen, arc, rect, star, heart, makeCanvas as kitCanvas, setScale, getScale } from './doodle_kit.js';
import { BOARD_X, BOARD_Y, BOARD_W, BOARD_H, TILE, COLS, ROWS, WORLD_BY_ID, MAPS, buildMap, laneAt, tileCx, tileCy } from './data_core.js';
import { drawHero } from './doodle_heroes.js';

export const makeCanvas = kitCanvas;
const TAU = Math.PI * 2;
let INK = C.ink;   // the outline colour: swapped per skin while a sprite is baked (see inked)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };
const hn = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // deterministic 0..1 noise from an integer

const bgCache = new Map(), boardCache = new Map(), stageCache = new Map(), heroFrames = new Map();
export function setArtScale(n) { setScale(n); bgCache.clear(); boardCache.clear(); stageCache.clear(); heroFrames.clear(); creepCache.clear(); extraCache.clear(); sceneCache.clear(); }

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

// ------------------------------------------------------------------------------------------------ board skins
export const BOARD_SKIN_IDS = ['skin_paper', 'skin_chalk', 'skin_sticker', 'skin_midnight'];
export const BOARD_SKINS = {
  skin_paper: { name: 'Notebook Paper', desc: 'The classic ruled page with tape and crayon.' },
  skin_chalk: { name: 'Chalkboard', desc: 'A dark slate board with chalk-white outlines and dust.' },
  skin_sticker: { name: 'Scrapbook', desc: 'A bright pastel page with washi tape and star stickers.' },
  skin_midnight: { name: 'Midnight Page', desc: 'An inky night page with glow crayon lines and stars.' },
};
// palette overrides (paper/line/margin/grain for backdrops; page/pad/lane/... for boards). Missing keys keep the world's own theme.
const SKIN = {
  skin_chalk: { ink: '#efebdd', paper: '#2b3637', line: '#455a5c', margin: '#c99090', grain: 'rgba(255,255,255,0.05)', veil: '#1f2828', veilA: 0.42, page: '#313e3e', pad: '#86b3a6', lane: '#dcd7c4', laneA: 0.5, dash: '#2b3637', chev: 'rgba(240,236,220,0.65)', tape: 'rgba(235,230,210,0.28)', frame: '#efebdd', dark: true },
  skin_sticker: { ink: '#3b2d57', paper: '#fff4f9', line: '#ffcadf', margin: '#ff8fbf', grain: 'rgba(255,120,170,0.07)', page: '#fffaf3', pad: '#ffd3ea', lane: '#b8a8f2', laneA: 0.6, dash: '#ffffff', chev: 'rgba(59,45,87,0.5)', frame: '#ff8fbf' },
  skin_midnight: { ink: '#8fefff', paper: '#0d1036', line: '#232a76', margin: '#6c3fc8', grain: 'rgba(160,190,255,0.06)', veil: '#070a26', veilA: 0.4, page: '#11154a', pad: '#5565e8', lane: '#7d68ea', laneA: 0.62, dash: '#ffd0f6', chev: 'rgba(190,240,255,0.75)', tape: 'rgba(120,230,255,0.25)', frame: '#8fefff', dark: true },
};
const skinOf = (o) => (o && SKIN[o.skin] ? o.skin : 'skin_paper');
const skinTag = (sk) => (sk === 'skin_paper' ? '' : '|' + sk);
// run a draw function with the outline colour of a skin (INK is read at draw time by every doodle piece)
const inked = (ink, fn) => (p, c, f) => { const old = INK; INK = ink || C.ink; try { fn(p, c, f); } finally { INK = old; } };

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

// ---------------------------------------------------------------- Bonfire Beach and Moonlight Rave pieces
const lerp = (a, b, k) => a + (b - a) * k;
function palmTree(p, x, y, s, lean) {   // (x, y) = foot, s = height, lean = sideways drift of the crown in heights
  const tx = x + lean * s, ty = y - s, mx = x + lean * s * 0.15, my = y - s * 0.52, trunk = [x, y, mx, my, tx, ty];
  p.ln(trunk, '#7a4d28', Math.max(5, s * 0.075), false, 0.8); p.ln(trunk.map((v, i) => (i % 2 ? v : v + s * 0.012)), '#d3a46a', Math.max(2, s * 0.03), false, 0.6);
  for (const k of [0.18, 0.36, 0.54, 0.72]) { const a = k < 0.5 ? [lerp(x, mx, k * 2), lerp(y, my, k * 2)] : [lerp(mx, tx, k * 2 - 1), lerp(my, ty, k * 2 - 1)]; p.ln([a[0] - s * 0.035, a[1], a[0] + s * 0.035, a[1] - s * 0.012], INK, 1.8, false, 0.3); }
  for (let i = 0; i < 7; i++) {
    const a = (-205 + i * 40) * Math.PI / 180, L = s * (i === 3 ? 0.46 : 0.52), dx = Math.cos(a), dy = Math.sin(a);
    const tipx = tx + dx * L, tipy = ty + dy * L * 0.55 + Math.abs(dx) * L * 0.42, mxx = tx + dx * L * 0.5, myy = ty + dy * L * 0.28 + Math.abs(dx) * L * 0.08;
    p.shp([tx, ty, mxx, myy - L * 0.2, tipx, tipy, mxx, myy + L * 0.13], i % 2 ? C.green : '#2f9a46', INK, 2.4, { gap: 4.5, f2: '#b6ec8a' });
  }
  p.dot(tx - s * 0.03, ty + s * 0.05, s * 0.045, '#7a4d28'); p.dot(tx + s * 0.04, ty + s * 0.06, s * 0.04, '#6a3f20');
}
function surfboard(p, x, y, len, rot, col, col2) {
  const c = p.ctx, wd = len * 0.17; c.save(); c.translate(x, y); c.rotate(rot);
  const pts = []; for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, cs = Math.cos(a); pts.push(cs * len / 2, Math.sin(a) * wd * (cs > 0 ? 1 - 0.65 * cs * cs : 1)); }
  p.shp(pts, col, INK, 3, { gap: 5, f2: '#fff' }); p.ln([-len * 0.44, 0, len * 0.44, 0], col2, 4, false, 0.5); p.ln([-len * 0.1, -wd * 0.7, -len * 0.1, wd * 0.7], col2, 3, false, 0.4);
  p.shp([-len * 0.5, 0, -len * 0.58, -wd * 0.55, -len * 0.4, -wd * 0.1], INK, INK, 1.5, { gap: 3 });
  c.restore();
}
function driftwood(p, x, y, len, rot) {
  const c = p.ctx, w = len * 0.2; c.save(); c.translate(x, y); c.rotate(rot);
  p.shp(rect(-len / 2, -w / 2, len, w, 5), '#b98d5c', INK, 3, { gap: 5, f2: '#ecd3a4' });
  p.shp(arc(len / 2, 0, w * 0.26, w / 2, 0, 360, 10), '#e8c995', INK, 2.4, { gap: 4 }); p.ln(arc(len / 2, 0, w * 0.12, w * 0.24, 0, 360, 8), INK, 1.4, true, 0.3);
  p.ln([-len * 0.3, -w * 0.15, -len * 0.05, -w * 0.1], INK, 1.6, false, 0.4); p.dot(len * 0.12, w * 0.1, w * 0.1, INK);
  c.restore();
}
function glowStick(p, x, y, len, rot, col) {
  const c = p.ctx; c.save(); c.translate(x, y); c.rotate(rot);
  p.shp(rect(-len / 2, -len * 0.085, len, len * 0.17, len * 0.08), col, INK, 2.6, { gap: 4, alpha: 1 }); p.ln([-len * 0.4, -len * 0.03, len * 0.34, -len * 0.03], '#fff', 2.4, false, 0.3);
  for (const k of [-0.5, 0.5]) p.ln([k * len, -len * 0.085, k * len, len * 0.085], INK, 2.4, false, 0.2);
  c.restore();
}
function crystalProp(p, x, y, s, col) {
  p.shp([x, y - s * 0.62, x + s * 0.3, y - s * 0.2, x + s * 0.22, y + s * 0.42, x - s * 0.22, y + s * 0.42, x - s * 0.3, y - s * 0.2], col, INK, 3, { gap: 5, f2: '#fff' });
  p.ln([x, y - s * 0.62, x - s * 0.04, y + s * 0.42], INK, 1.8, false, 0.3); p.ln([x - s * 0.3, y - s * 0.2, x + s * 0.3, y - s * 0.2], INK, 1.6, false, 0.3);
  p.shp([x + s * 0.28, y + s * 0.0, x + s * 0.5, y + s * 0.18, x + s * 0.44, y + s * 0.42, x + s * 0.26, y + s * 0.42], C.mag, INK, 2.4, { gap: 4 });
}
function logsAndStones(p, x, y, s) {   // the bonfire pit: stone ring and crossed logs (flames are live)
  const stone = (a) => { const sx = x + Math.cos(a) * s * 0.52, sy = y + Math.sin(a) * s * 0.34; p.shp(p.blob(sx, sy, s * 0.1, s * 0.078, 8), '#b2adbd', INK, 2.2, { gap: 4 }); };
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; if (Math.sin(a) < 0) stone(a); }
  p.shp(arc(x, y + s * 0.02, s * 0.44, s * 0.28, 0, 360, 16), '#3b2b2a', null, 0, { gap: 4, alpha: 0.9 });
  driftwood(p, x, y + s * 0.04, s * 0.78, 0.38); driftwood(p, x, y + s * 0.04, s * 0.78, -0.42);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; if (Math.sin(a) >= 0) stone(a); }
}
function flames(c, x, y, s, t, beat) {   // live crayon flames: three nested tear drops that sway and flicker
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  const cols = ['#e8403f', '#ff9226', '#ffd60a'];
  for (let k = 0; k < 3; k++) {
    const f = 1 - k * 0.27, hgt = s * f * (1 + 0.13 * Math.sin(t * 9 + k * 2.1) + beat * 0.15), w = s * 0.34 * f, sw = Math.sin(t * 5.3 + k) * s * 0.07;
    for (const [dx, sc] of (k === 0 ? [[-s * 0.3, 0.55], [s * 0.3, 0.5], [0, 1]] : [[0, 1]])) {
      const hh = hgt * sc * (dx === 0 ? 1 : 0.85 + 0.15 * Math.sin(t * 7 + dx)), ww = w * sc, bx = x + dx;
      c.beginPath(); c.moveTo(bx - ww, y); c.bezierCurveTo(bx - ww * 1.25, y - hh * 0.4, bx - ww * 0.25 + sw, y - hh * 0.62, bx + sw, y - hh);
      c.bezierCurveTo(bx + ww * 0.3 + sw, y - hh * 0.55, bx + ww * 1.25, y - hh * 0.4, bx + ww, y); c.closePath();
      c.fillStyle = cols[k]; c.fill(); if (k === 0) { c.strokeStyle = INK; c.lineWidth = 3; c.stroke(); }
    }
  }
  c.fillStyle = '#ffd60a'; for (let i = 0; i < 6; i++) { const k = (t * 0.8 + i * 0.17) % 1, a = 1 - k; c.globalAlpha = a; c.fillRect(x + Math.sin(i * 7 + t * 2) * s * 0.35 - 1.5, y - s * 0.4 - k * s * 1.2, 3, 3); }
  c.restore();
}
function beachBall(p, x, y, r) { p.shp(arc(x, y, r, r, 0, 360, 14), '#fff', INK, 3, { gap: 5 }); for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; p.hatch([x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a + 1) * r, y + Math.sin(a + 1) * r], [C.red, C.blue, C.yellow][i], 5, 0.5, 0.9); } p.ln(arc(x, y, r, r, 0, 360, 14), INK, 2.6, true, 0.6); }
function starfish(p, x, y, r, col) { p.shp(star(x, y, r, 0.5, 0.3), col, INK, 2.4, { gap: 4 }); p.dot(x, y, r * 0.14, INK); }
function sailboat(p, x, y, s) { p.shp([x - s, y, x + s, y, x + s * 0.6, y + s * 0.45, x - s * 0.6, y + s * 0.45], '#fff', INK, 2.4, { gap: 4 }); p.ln([x, y, x, y - s * 1.8], INK, 2.4, false, 0.4); p.shp([x + 2, y - s * 1.7, x + 2, y - s * 0.15, x + s * 0.95, y - s * 0.15], C.red, INK, 2.2, { gap: 4 }); p.shp([x - 3, y - s * 1.3, x - 3, y - s * 0.15, x - s * 0.75, y - s * 0.15], C.yellow, INK, 2.2, { gap: 4 }); }
function floatRock(p, x, y, w, h, top) {   // a floating stage platform: lit top, rocky underside
  p.shp([x - w * 0.5, y, x + w * 0.5, y, x + w * 0.34, y + h * 0.45, x + w * 0.12, y + h, x - w * 0.12, y + h * 0.5, x - w * 0.36, y + h * 0.3], '#4b4fa6', INK, 3, { gap: 6, f2: '#8a8ee8' });
  p.shp(arc(x, y, w * 0.5, h * 0.16, 0, 360, 16), top || '#9aa4ff', INK, 3, { gap: 5, f2: '#fff' });
  p.ln([x - w * 0.2, y + h * 0.3, x - w * 0.08, y + h * 0.18], INK, 1.8, false, 0.3);
}
function planet(p, x, y, r, col, ring) { if (ring) p.ln(arc(x, y, r * 1.7, r * 0.45, 0, 360, 18), C.mag, 3, true, 0.8); p.shp(arc(x, y, r, r, 0, 360, 14), col, INK, 3, { gap: 5, f2: '#fff' }); if (ring) p.ln(arc(x, y, r * 1.7, r * 0.45, 180, 360, 10), C.mag, 3, false, 0.8); }
const bulbPos = (k, w, y0, sag) => [w * k, y0 + Math.sin(k * Math.PI) * sag];
const BULBS = [C.yellow, C.pink, C.cyan, C.lime, C.orange];
function wirePts(w, y0, sag, n = 16) { const q = []; for (let i = 0; i <= n; i++) q.push(...bulbPos(i / n, w, y0, sag)); return q; }

// ================================================================================================================ BACKDROPS
const STAGES = {
  title: { paper: '#f1ecfb', line: '#cdc4ee', margin: '#f08a8a', accent: C.pink },
  hub: { paper: '#efe9fb', line: '#d3c7ee', margin: '#e9a5c9', accent: C.pink },
  garage: { paper: C.paper, line: '#a9cdf0', margin: '#f08a8a', accent: C.orange },
  busk: { paper: '#e2e8f2', line: '#b9c7de', margin: '#f08a8a', accent: C.yellow },
  club: { paper: '#efe6fc', line: '#cdbdf0', margin: '#f08a8a', accent: C.mag },
  festival: { paper: '#ffe9c8', line: '#f5c9a0', margin: '#f08a8a', accent: C.orange },
  arena: { paper: '#f6f0e2', line: '#bcd5ea', margin: '#f08a8a', accent: C.pink },
  beach: { paper: '#fdebc6', line: '#f2d29b', margin: '#f08a8a', accent: C.orange },
  moon: { paper: '#10144a', line: '#242d86', margin: '#7b4fd0', accent: C.cyan, grain: 'rgba(170,190,255,0.07)' },
};
const PAINT = {
  title(p, c, w, h) {
    p.hatch(rect(0, 0, w, h * 0.62), '#8f86e0', 11, 0.5, 0.3);   // crayon night wash on the page
    sparkleDots(p, w, h * 0.5, 22, [C.yellow, C.pink, C.sky], 11);
    p.shp(arc(w * 0.78, h * 0.14, 46, 46, 0, 360, 18), C.yellow, INK, 3.4, { gap: 6 }); p.shp(arc(w * 0.78 + 14, h * 0.14 - 8, 38, 38, 0, 360, 16), '#cfc8f3', null, 0, { gap: 3, alpha: 1 });
    for (let i = 0; i < 4; i++) p.hatch([w * (0.2 + i * 0.18), h * 0.5, w * (0.24 + i * 0.18), 0, w * (0.28 + i * 0.18), 0, w * (0.32 + i * 0.18), h * 0.5], [C.pink, C.cyan, C.yellow, C.lime][i], 12, 1.1, 0.3);
    let x = -10; for (let i = 0; x < w + 20; i++) { const bw = 60 + hn(i * 3) * 70, bh = h * (0.12 + hn(i * 5 + 1) * 0.16); building(p, x, h * 0.62, bw, bh, ['#7d6fd0', '#d96aa8', '#4f9fd8'][i % 3], '#ffe27a', INK); x += bw + 6; }
    p.hatch(rect(0, h * 0.62, w, h * 0.38), '#8f88b8', 10, -0.4, 0.5);
    p.ln([0, h * 0.62, w, h * 0.62], INK, 3.2, false, 1);
    marginDoodles(p, w, h, [C.pink, C.cyan, C.yellow, C.lime], 5);
  },
  hub(p, c, w, h) {
    const cols = ['#ffc2de', '#c9f2a4', '#bfe9ff', '#ffe49a', '#d9ccf5'];
    for (let i = 0; i < 26; i++) { const x = hn(i * 7 + 1) * w, y = hn(i * 11 + 2) * h, col = cols[i % 5]; if (i % 4 === 0) p.shp(star(x, y, 15, 0.45, hn(i)), col, '#d3c9ec', 2, { gap: 5, alpha: 0.5 }); else if (i % 4 === 1) p.shp(heart(x, y, 28), col, '#d3c9ec', 2, { gap: 5, alpha: 0.5 }); else if (i % 4 === 2) spiral(p, x, y, 16, '#d9cff0'); else p.shp(heart(x, y, 20), col, '#d3c9ec', 2, { gap: 5, alpha: 0.5 }); }
    tape(p, w * 0.1, 18, 90, 26, -0.2); tape(p, w * 0.9, 18, 90, 26, 0.25);
  },
  garage(p, c, w, h) {
    p.shp(rect(w * 0.2, h * 0.04, w * 0.6, h * 0.17), '#d9d3c3', '#7d7688', 3, { gap: 9, alpha: 0.5 });
    for (let i = 1; i < 5; i++) p.ln([w * 0.2, h * (0.04 + i * 0.034), w * 0.8, h * (0.04 + i * 0.034)], '#9e97aa', 2.4, false, 0.8);
    if (!BAKE_THUMB) p.txt('GARAGE DAYS', w * 0.5, h * 0.265, Math.min(46, w * 0.09), C.orange, { align: 'c', out: INK, ow: 5 });
    c.fillStyle = 'rgba(138,90,43,0.2)'; c.beginPath(); const sx = w * 0.7, sy = h * 0.78; for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU, r = 70 + hn(i + 4) * 38; c.lineTo(sx + Math.cos(a) * r * 1.3, sy + Math.sin(a) * r * 0.8); } c.fill();
    drumProp(p, w * 0.06, h * 0.4, 70, C.red); amp(p, w, h); guitarProp(p, w * 0.93, h * 0.58, 90, -0.4); cymbalProp(p, w * 0.07, h * 0.62, 70);
    for (let r = 0; r < 7; r++) for (let k = 0; k < 10; k++) { const bx = w * 0.12 + k * w * 0.077 + (r % 2) * 18, by = h * 0.86 + r * 14; if (bx < w * 0.93 && by < h - 8) p.hatch(rect(bx, by, w * 0.068, 10), '#d98a63', 6, 0.1, 0.35); }
    marginDoodles(p, w, h, [C.pink, C.lime, C.sky, C.yellow], 21);
    tape(p, w * 0.2, 10, 80, 24, -0.25); tape(p, w * 0.8, 10, 80, 24, 0.2);
    function amp(pp, ww, hh) { ampProp(pp, ww * 0.92, hh * 0.4, 80); }
  },
  busk(p, c, w, h) {
    const chalk = '#7b8aa8';
    let x = -10; for (let i = 0; x < w; i++) { const bw = 70 + hn(i * 3 + 9) * 80, bh = h * (0.16 + hn(i * 5 + 4) * 0.2); p.shp(rect(x, h * 0.6 - bh, bw, bh), '#6f82a6', INK, 2.8, { gap: 8, alpha: 0.55 }); for (let r = 0; r < Math.floor(bh / 42); r++) for (let k = 0; k < Math.floor(bw / 30); k++) if (hn(i * 17 + r * 5 + k) > 0.4) p.shp(rect(x + 10 + k * 28, h * 0.6 - bh + 12 + r * 40, 14, 20), C.yellow, null, 1, { gap: 4, alpha: 0.85 }); x += bw + 8; }
    for (let k = 0; k < 4; k++) lamp(p, w * (0.14 + k * 0.24), h * 0.66, h * 0.17, '#ffe27a');
    for (let r = 0; r < 9; r++) for (let k = 0; k < Math.ceil(w / 54); k++) { const cx = k * 54 + (r % 2) * 27, cy = h * 0.67 + r * 22; if (cy < h - 4) p.ln(arc(cx, cy, 24, 11, 200, 340, 6), chalk, 2, false, 0.7); }
    if (!BAKE_THUMB) p.txt('OLD TOWN', w * 0.5, h * 0.09, Math.min(44, w * 0.09), C.yellow, { align: 'c', out: INK, ow: 5 });
    marginDoodles(p, w, h, [C.yellow, C.pink, C.sky], 31);
  },
  club(p, c, w, h) {
    p.hatch(rect(0, 0, w, h * 0.72), '#9b7fe6', 11, 0.5, 0.26);   // glitter-pen night wash
    discoBall(p, w * 0.5, h * 0.12, 38);
    const cols = [C.mag, C.cyan, C.lime, C.yellow, C.pink];
    for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; p.ln([w * 0.5, h * 0.12, w * 0.5 + Math.sin(a) * h * 0.8, h * 0.12 + Math.cos(a) * h * 0.8], cols[i % 5], 2.8, false, 1.6); }
    for (let k = 0; k < 2; k++) { const sx = k ? w * 0.9 : w * 0.1; for (let r = 0; r < 3; r++) speakerProp(p, sx, h * (0.3 + r * 0.13), 56, '#3b3158'); }
    const tw = Math.ceil(w / 60), th = 6; for (let r = 0; r < th; r++) for (let k = 0; k < tw; k++) if ((r + k) % 2) p.hatch(rect(k * 60, h * 0.78 + r * ((h * 0.22) / th), 60, (h * 0.22) / th), cols[(r + k) % 5], 8, 0.8, 0.45);
    if (!BAKE_THUMB) p.txt('NEON CLUB', w * 0.5, h * 0.27, Math.min(44, w * 0.09), C.pink, { align: 'c', out: INK, ow: 5 });
    sparkleDots(p, w, h * 0.7, 26, [C.mag, C.cyan, C.orange, C.yellow], 41);
  },
  festival(p, c, w, h) {
    const bands = ['#ffd95a', '#ffb347', '#ff8a5a', '#f2619a', '#9b6bd8'];
    bands.forEach((col, i) => p.hatch(rect(0, i * h * 0.1, w, h * 0.105), col, 10, 0.15, 0.8));
    p.shp(arc(w * 0.5, h * 0.4, 70, 70, 0, 360, 20), C.yellow, INK, 3.4, { gap: 6 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; p.ln([w * 0.5 + Math.cos(a) * 82, h * 0.4 + Math.sin(a) * 82, w * 0.5 + Math.cos(a) * 112, h * 0.4 + Math.sin(a) * 112], C.yellow, 3, false, 0.6); }
    for (let i = 0; i < 4; i++) p.shp(arc(w * (0.1 + i * 0.3), h * 0.68, w * 0.32, h * 0.08, 180, 360, 14).concat([w * (0.1 + i * 0.3) + w * 0.32, h * 0.8, w * (0.1 + i * 0.3) - w * 0.32, h * 0.8]), i % 2 ? '#4fb85a' : '#6cc84a', INK, 2.8, { gap: 7 });
    tentProp(p, w * 0.2, h * 0.7, 54, C.red); tentProp(p, w * 0.82, h * 0.72, 62, C.blue); tentProp(p, w * 0.6, h * 0.69, 40, C.pink);
    p.hatch(rect(0, h * 0.8, w, h * 0.2), '#5a8a3a', 8, -0.3, 0.7);
    if (!BAKE_THUMB) p.txt('SUNSET FEST', w * 0.5, h * 0.27, Math.min(46, w * 0.095), '#fff', { align: 'c', out: INK, ow: 6 });
    cloud(p, w * 0.2, h * 0.34, 50, '#fff'); cloud(p, w * 0.82, h * 0.3, 44, '#fff');
  },
  arena(p, c, w, h) {
    p.shp(rect(w * 0.2, h * 0.012, w * 0.6, h * 0.085, 10), '#ffe9a0', INK, 3.4, { gap: 8, alpha: 0.7 });
    if (!BAKE_THUMB) p.txt('MEGA ARENA', w * 0.5, h * 0.078, Math.min(40, w * 0.08), C.red, { align: 'c', out: INK, ow: 5 });
    for (let k = 0; k < 2; k++) { const tx = k ? w * 0.93 : w * 0.07; p.ln([tx, h * 0.5, tx, h * 0.16], INK, 4, false, 0.8); p.shp(rect(tx - 26, h * 0.1, 52, 38, 4), '#f3e9a0', INK, 3, { gap: 6 }); for (let i = -1; i <= 1; i++) p.ln([tx + i * 12, h * 0.15, tx + i * 90 * (k ? -1 : 1) - 30, h * 0.46], '#ffe27a', 2.2, false, 1.2); }
    const heads = [C.pink, C.sky, C.yellow, C.lime, C.orange, C.lav];
    for (let r = 0; r < 9; r++) { const y = h * 0.28 + r * h * 0.045, cnt = Math.floor(w / 26); p.ln([w * 0.04, y + 14, w * 0.96, y + 14], '#a9a39a', 2.2, false, 0.9); for (let k = 0; k < cnt; k++) { const x = w * 0.04 + (k + 0.5) / cnt * w * 0.92 + (r % 2) * 6; p.dot(x, y + 4, 7, heads[(k * 7 + r * 3) % 6]); p.ln(arc(x, y + 4, 7, 7, 0, 360, 8), INK, 1.4, true, 0.4); } }
    p.hatch(rect(0, h * 0.7, w, h * 0.3), '#d9c9a0', 9, 0.4, 0.55);
    p.ln([0, h * 0.7, w, h * 0.7], INK, 3.2, false, 1);
    marginDoodles(p, w, h * 0.7, [C.pink, C.cyan, C.yellow], 51);
  },
  beach(p, c, w, h) {   // sunset sky, teal sea strip, warm sand, palms, surfboards, driftwood, a bonfire pit and string lights
    const u = Math.min(w / 540, h / 960), hz = h * 0.095, sea = h * 0.07;
    ['#ffe08a', '#ffb56a', '#f7808f', '#b88ae0'].forEach((col, i) => p.hatch(rect(0, hz - (i + 1) * hz / 4, w, hz / 4 + 8), col, 9, 0.18 + i * 0.06, 0.88));
    for (let i = 0; i < 9; i++) { const a = -Math.PI + (i + 0.5) * Math.PI / 9; p.ln([w * 0.5 + Math.cos(a) * 66 * u, hz + Math.sin(a) * 66 * u, w * 0.5 + Math.cos(a) * 92 * u, hz + Math.sin(a) * 92 * u], C.orange, 3.2, false, 0.6); }
    p.shp(arc(w * 0.5, hz, 58 * u, 58 * u, 180, 360, 14), C.yellow, INK, 3.4, { gap: 6, f2: '#fff6b0' });
    cloud(p, w * 0.2, hz * 0.5, 34 * u, '#ffd6e4'); cloud(p, w * 0.82, hz * 0.62, 28 * u, '#ffe8ef');
    p.hatch(rect(0, hz, w, sea), '#2fc4b2', 8, 0.1, 0.92); p.hatch(rect(0, hz + sea * 0.5, w, sea * 0.5), '#1c8e9c', 8, 0.2, 0.5); p.ln([0, hz, w, hz], INK, 3.2, false, 1);
    for (let r = 0; r < 3; r++) for (let k = 0; k < Math.ceil(w / 60) + 1; k++) p.ln(arc(k * 60 + r * 20 + hn(k + r * 9) * 18, hz + sea * (0.25 + r * 0.26), 16 * u + 4, 5, 200, 340, 5), '#eafffb', 2.2, false, 0.6);
    sailboat(p, w * 0.84, hz + 2, 15 * u + 4);
    const sy = hz + sea; p.hatch(rect(0, sy, w, h - sy), '#f6d38a', 11, -0.35, 0.55); p.hatch(rect(0, sy, w, 22 * u + 8), '#d9b070', 7, 0.3, 0.55);
    for (let k = 0; k < Math.ceil(w / 34) + 1; k++) { const q = arc(k * 34 + 8, sy, 17, 9, 0, 180, 5); p.ln(q, '#ffffff', 4.2, false, 0.5); p.ln(q, INK, 1.6, false, 0.4); }
    p.ln([0, sy, w, sy], INK, 2.6, false, 1);
    p.ln(wirePts(w, h * 0.014, 30 * u + 8), INK, 2.2, false, 0.5);
    palmTree(p, w * 0.055, h * 0.7, h * 0.34, 0.32); palmTree(p, w * 0.95, h * 0.78, h * 0.37, -0.34); palmTree(p, w * 0.93, h * 0.3, h * 0.12, -0.1);
    logsAndStones(p, w * 0.5, h * 0.64, 96 * u + 20);
    surfboard(p, w * 0.17, h * 0.935, 120 * u + 30, -1.22, C.pink, '#fff'); surfboard(p, w * 0.8, h * 0.94, 130 * u + 30, 1.12, C.cyan, C.yellow); surfboard(p, w * 0.3, h * 0.955, 110 * u + 30, -1.45, C.lime, C.red);
    driftwood(p, w * 0.58, h * 0.968, 110 * u + 20, 0.07); driftwood(p, w * 0.09, h * 0.84, 90 * u + 20, -0.5); beachBall(p, w * 0.7, h * 0.95, 22 * u + 8);
    for (const [fx, fy, r, col] of [[0.43, 0.945, 11, C.orange], [0.9, 0.9, 12, C.pink], [0.12, 0.7, 10, C.red], [0.88, 0.5, 10, C.orange]]) starfish(p, w * fx, h * fy, r * u + 4, col);
    for (let i = 0; i < 18; i++) p.dot(hn(i * 3 + 5) * w, h * (0.25 + hn(i * 5 + 1) * 0.72), 1.6 + hn(i) * 1.6, 'rgba(138,90,43,0.45)');
    if (!BAKE_THUMB) p.txt('BONFIRE BEACH', w * 0.5, h * 0.268, Math.min(44, w * 0.09), '#fff', { align: 'c', out: INK, ow: 5 });
  },
  moon(p, c, w, h) {   // deep navy paper, crayon neon, a big moon, stars, floating stage platforms, glow sticks, a lunar floor
    const u = Math.min(w / 540, h / 960);
    p.hatch(rect(0, 0, w, h * 0.5), '#2b3bd0', 12, 0.5, 0.2); p.hatch(rect(0, h * 0.5, w, h * 0.5), '#5a2fb0', 12, -0.4, 0.14);
    sparkleDots(p, w, h * 0.92, 46, [C.cyan, C.pink, C.yellow, '#fff'], 61);
    planet(p, w * 0.11, h * 0.2, 28 * u + 8, '#5f8cff', false); planet(p, w * 0.9, h * 0.34, 18 * u + 6, '#ff8ac8', true);
    const mx = w * 0.78, my = h * 0.072, mr = 80 * u + 14;
    p.ln(arc(mx, my, mr + 10, mr + 10, 0, 360, 24), C.cyan, 4, true, 1.6); p.ln(arc(mx + 4, my + 3, mr + 17, mr + 17, 0, 360, 24), C.mag, 2.6, true, 1.6);
    p.shp(arc(mx, my, mr, mr, 0, 360, 20), '#fff3b0', INK, 4, { gap: 6, f2: '#fffbe0' });
    for (const [dx, dy, rr] of [[-0.35, -0.2, 0.2], [0.25, 0.25, 0.16], [0.3, -0.35, 0.1], [-0.2, 0.4, 0.12]]) { p.ln(arc(mx + dx * mr, my + dy * mr, rr * mr, rr * mr, 0, 360, 10), '#d9c870', 3, true, 0.8); }
    floatRock(p, w * 0.14, h * 0.5, 100 * u + 30, 70 * u + 20); glowStick(p, w * 0.12, h * 0.495 - 14, 40 * u + 10, -0.9, C.lime); glowStick(p, w * 0.17, h * 0.495 - 14, 40 * u + 10, 0.9, C.pink);
    floatRock(p, w * 0.86, h * 0.62, 110 * u + 30, 76 * u + 20); speakerProp(p, w * 0.86, h * 0.62 - 38 * u - 8, 46 * u + 14, '#3b3158'); glowStick(p, w * 0.8, h * 0.62 - 12, 36 * u + 10, 0.4, C.cyan);
    floatRock(p, w * 0.5, h * 0.72, 140 * u + 30, 90 * u + 20, '#b4baff'); p.ln(arc(w * 0.5, h * 0.72 - 40 * u, 40 * u + 10, 40 * u + 10, 180, 360, 12), C.mag, 5, false, 1); p.ln(arc(w * 0.5, h * 0.72 - 40 * u, 28 * u + 6, 28 * u + 6, 180, 360, 12), C.cyan, 4, false, 1);
    const fy = h * 0.92; p.hatch([0, fy + 12, w * 0.2, fy - 6, w * 0.42, fy + 8, w * 0.7, fy - 10, w, fy + 6, w, h, 0, h], '#7c82d8', 9, 0.35, 0.78); p.ln([0, fy + 12, w * 0.2, fy - 6, w * 0.42, fy + 8, w * 0.7, fy - 10, w, fy + 6], INK, 3.2, false, 1.2);
    for (const [fx, fyy, rw] of [[0.12, 0.955, 30], [0.4, 0.975, 42], [0.64, 0.95, 26], [0.88, 0.97, 36]]) { p.shp(arc(w * fx, h * fyy, rw * u + 8, (rw * 0.32) * u + 3, 0, 360, 12), '#5a5fb8', INK, 2.4, { gap: 4 }); }
    for (const [gx, gy, rot, col] of [[0.3, 0.935, -0.4, C.lime], [0.34, 0.94, 0.6, C.pink], [0.75, 0.93, 0.3, C.cyan], [0.8, 0.945, -0.8, C.yellow]]) glowStick(p, w * gx, h * gy, 34 * u + 10, rot, col);
    if (!BAKE_THUMB) p.txt('MOONLIGHT RAVE', w * 0.5, h * 0.268, Math.min(42, w * 0.085), C.cyan, { align: 'c', out: INK, ow: 5 });
  },
};
function bgScale(w, h) { return clamp(Math.min(getScale(), Math.sqrt(1.4e6 / Math.max(1, w * h))), 0.6, 2); }
// washi tape: a translucent striped strip; sticker: a die-cut shape with a white border
function washi(p, x, y, w, h, rot, col, col2) {
  const c = p.ctx; c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = 0.88; c.fillStyle = col; c.fillRect(-w / 2, -h / 2, w, h);
  c.save(); c.beginPath(); c.rect(-w / 2, -h / 2, w, h); c.clip(); c.strokeStyle = col2; c.lineWidth = 3; c.beginPath(); for (let k = -h; k < w + h; k += 11) { c.moveTo(-w / 2 + k, -h / 2); c.lineTo(-w / 2 + k - h, h / 2); } c.stroke(); c.restore();
  c.globalAlpha = 1; c.strokeStyle = 'rgba(80,60,90,0.4)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-w / 2, -h / 2); for (let k = 0; k <= 4; k++) c.lineTo(-w / 2 + (k % 2 ? 3 : -1), -h / 2 + (k + 0.5) * h / 4); c.stroke(); c.restore();
}
function sticker(p, pts, col, lw = 2.2) { p.ln(pts, '#ffffff', lw + 8, true, 0.5); p.shp(pts, col, INK, lw, { gap: 4 }); }
const WASHI = [['#ffb3d1', '#ffffff'], ['#a8e6cf', '#ffffff'], ['#ffe08a', '#ff9ec7'], ['#b9c7ff', '#ffffff']];
function skinOver(p, c, w, h, skin, o) {   // decor and palette veil drawn on top of a world's backdrop for a board skin
  const sk = SKIN[skin];
  if (sk.veil) p.hatch(rect(0, 0, w, h), sk.veil, 9, -0.5, sk.veilA);
  if (skin === 'skin_chalk') {
    c.fillStyle = 'rgba(255,255,255,0.07)'; for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse(hn(i * 3 + 1) * w, hn(i * 5 + 2) * h, 40 + hn(i) * 70, 14 + hn(i + 3) * 20, hn(i) * 2, 0, TAU); c.fill(); }
    p.ln(rect(10, 10, w - 20, h - 20, 12), 'rgba(239,235,221,0.5)', 3, true, 2); p.ln(rect(16, 16, w - 32, h - 32, 14), 'rgba(239,235,221,0.25)', 2, true, 2.4);
    for (let i = 0; i < 30; i++) { const x = hn(i * 7 + 2) * w, y = hn(i * 11 + 1) * h; p.ln([x, y, x + 3 + hn(i) * 5, y + 1], 'rgba(255,255,255,0.35)', 2, false, 0.3); }
  } else if (skin === 'skin_midnight') {
    for (let i = 0; i < 34; i++) star4(p, hn(i * 3 + 91) * w, hn(i * 5 + 92) * h, 3 + hn(i + 7) * 5, [C.cyan, C.pink, '#fff3b0', C.lime][i % 4]);
    p.ln([w * 0.62, h * 0.045, w * 0.8, h * 0.075], C.cyan, 3, false, 0.6); p.ln([w * 0.1, h * 0.93, w * 0.24, h * 0.95], C.pink, 3, false, 0.6);
    p.ln(rect(12, 12, w - 24, h - 24, 14), 'rgba(143,239,255,0.4)', 2.6, true, 2);
  } else if (skin === 'skin_sticker') {
    for (let i = 0; i < 40; i++) { c.fillStyle = ['rgba(255,150,190,0.22)', 'rgba(150,210,255,0.22)', 'rgba(255,225,120,0.28)'][i % 3]; c.beginPath(); c.arc(hn(i * 3 + 51) * w, hn(i * 5 + 52) * h, 5 + hn(i) * 6, 0, TAU); c.fill(); }
    washi(p, w * 0.08, 16, 100, 26, -0.5, ...WASHI[0]); washi(p, w * 0.92, 16, 100, 26, 0.5, ...WASHI[1]); washi(p, w * 0.1, h - 16, 100, 26, 0.45, ...WASHI[2]); washi(p, w * 0.9, h - 16, 100, 26, -0.45, ...WASHI[3]);
    const cols = [C.yellow, C.pink, C.sky, C.lime, C.orange];
    for (let i = 0; i < 12; i++) { const left = i % 2 === 0, x = left ? 14 + hn(i * 3 + 5) * w * 0.05 : w - 14 - hn(i * 3 + 6) * w * 0.05, y = h * (0.1 + i * 0.075); if (i % 3 === 2) sticker(p, heart(x, y, 26), C.pink); else sticker(p, star(x, y, 15, 0.46, hn(i) - 0.5), cols[i % 5]); }
  }
}
function bakeBg(id, w, h, skin) {
  const sk = SKIN[skin], st = sk ? Object.assign({}, STAGES[id], { paper: sk.paper, line: sk.line, margin: sk.margin, grain: sk.grain }) : STAGES[id], s = bgScale(w, h);
  return bake('bg|' + id + '|' + Math.round(w) + 'x' + Math.round(h) + skinTag(skin), Math.round(w), Math.round(h), 2, s, inked(sk ? sk.ink : C.ink, (p, c) => {
    ruled(c, w, h, st);
    PAINT[id](p, c, w, h);
    if (sk) skinOver(p, c, w, h, skin);
  }));
}
const twinkle = (c, w, h, t, n, col, ymax) => { c.strokeStyle = col; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); for (let i = 0; i < n; i++) { const k = Math.sin(t * (1.5 + hn(i) * 2.2) + i * 5); if (k < 0.2) continue; const x = hn(i * 3 + 7) * w, y = hn(i * 5 + 3) * h * ymax, r = 3 + k * 5; c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); } c.stroke(); };
function floatNotes(c, w, h, t, n, cols, amax = 0.9) {
  c.lineWidth = 2.6; c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const k = ((t * 0.07 + i / n) % 1), x = w * (0.12 + hn(i * 9 + 2) * 0.76) + Math.sin(t * 0.9 + i * 2) * 16, y = h * (1.02 - k * 1.1), a = Math.sin(k * Math.PI);
    c.globalAlpha = a * amax; c.fillStyle = cols[i % cols.length]; c.strokeStyle = INK; c.beginPath(); c.ellipse(x, y, 7, 5, -0.4, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x + 6, y - 2); c.lineTo(x + 6, y - 22); c.lineTo(x + 14, y - 18); c.stroke();
  }
  c.globalAlpha = 1;
}
const DYN = {
  title(c, w, h, t, beat) { twinkle(c, w, h, t, 18, C.yellow, 0.5); floatNotes(c, w, h, t, 5, [C.pink, C.cyan, C.yellow, C.lime]); },
  hub(c, w, h, t) { floatNotes(c, w, h, t, 3, ['#ffc2de', '#c9f2a4', '#bfe9ff', '#ffe49a'], 0.3); },
  garage(c, w, h, t, beat) { floatNotes(c, w, h, t, 3, [C.orange, C.pink, C.sky]); if (beat > 0.05) { c.strokeStyle = C.orange; c.lineWidth = 3; c.globalAlpha = beat * 0.6; c.beginPath(); c.arc(w * 0.92, h * 0.4, 52 + (1 - beat) * 16, -0.9, 0.9); c.stroke(); c.globalAlpha = 1; } },
  busk(c, w, h, t) {
    c.strokeStyle = '#5b86c9'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < 40; i++) { const x = (hn(i * 3) * w + t * 30) % w, y = ((hn(i * 5 + 1) * h + t * 340) % h); c.moveTo(x, y); c.lineTo(x - 5, y + 16); }
    c.stroke(); twinkle(c, w, h, t, 6, C.orange, 0.3);
  },
  club(c, w, h, t, beat) {
    const cols = [C.mag, C.cyan, C.lime]; c.lineWidth = 3.6; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = Math.sin(t * (0.8 + i * 0.3) + i * 2) * 0.7; c.strokeStyle = cols[i]; c.globalAlpha = 0.55 + beat * 0.4; c.beginPath(); c.moveTo(w * 0.5, h * 0.12); c.lineTo(w * 0.5 + Math.sin(a) * h, h * 0.12 + Math.cos(a) * h); c.stroke(); }
    c.globalAlpha = 1; twinkle(c, w, h, t, 22, C.orange, 0.9);
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
DYN.beach = function (c, w, h, t, beat) {
  const u = Math.min(w / 540, h / 960), hz = h * 0.095, sea = h * 0.07, sag = 30 * u + 8;
  for (let i = 0; i <= 15; i++) { const [x, y] = bulbPos(i / 15, w, h * 0.014, sag); c.globalAlpha = 0.55 + 0.45 * Math.sin(t * 2.7 + i * 1.9); c.fillStyle = BULBS[i % 5]; c.beginPath(); c.arc(x, y + 5, 4.2, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke(); }
  c.globalAlpha = 1; c.strokeStyle = '#fff'; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath();
  for (let i = 0; i < 16; i++) { const k = Math.sin(t * (1.2 + hn(i) * 1.6) + i * 4); if (k < 0.1) continue; const x = hn(i * 3 + 1) * w, y = hz + sea * (0.15 + hn(i * 5 + 2) * 0.75), l = 5 + k * 7; c.moveTo(x - l, y); c.lineTo(x + l, y); }
  c.stroke();
  c.strokeStyle = INK; c.lineWidth = 2.6; for (let i = 0; i < 2; i++) { const x = ((t * (14 + i * 6) + i * 260) % (w + 80)) - 40, y = h * (0.035 + i * 0.03) + Math.sin(t * 0.8 + i) * 5, f = Math.sin(t * 7 + i * 2) * 5; c.beginPath(); c.moveTo(x - 10, y - f); c.quadraticCurveTo(x - 4, y - 6, x, y); c.quadraticCurveTo(x + 4, y - 6, x + 10, y - f); c.stroke(); }
  flames(c, w * 0.5, h * 0.64, 70 * u + 16, t, beat);
};
DYN.moon = function (c, w, h, t, beat) {
  twinkle(c, w, h, t, 30, '#ffffff', 0.9);
  const cols = [C.cyan, C.pink, '#fff3b0', C.lime]; c.lineWidth = 1.8;
  for (let i = 0; i < 20; i++) {   // low gravity: slow floaty bubbles and specks drifting upward
    const k = (t * (0.018 + hn(i) * 0.02) + hn(i * 2 + 5)) % 1, x = w * hn(i * 5 + 1) + Math.sin(t * 0.55 + i * 1.7) * 16, y = h * (1.03 - k * 1.06), r = 2.5 + hn(i + 9) * 4.5;
    c.globalAlpha = Math.sin(k * Math.PI) * 0.75; c.strokeStyle = cols[i % 4]; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    if (i % 3 === 0) { c.fillStyle = cols[i % 4]; c.fillRect(x + r + 4, y - 1, 3, 3); }
  }
  c.globalAlpha = 1;
  for (let i = 0; i < 4; i++) {   // drifting glow sticks tumbling slowly
    const k = (t * 0.02 + i * 0.25) % 1, x = w * (0.1 + 0.8 * hn(i * 7 + 3)) + Math.sin(t * 0.4 + i * 2) * 20, y = h * (1.03 - k * 1.06), a = Math.sin(k * Math.PI);
    c.save(); c.translate(x, y); c.rotate(t * 0.5 + i * 1.7); c.globalAlpha = a * 0.9; c.fillStyle = cols[i % 4]; c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath(); c.rect(-9, -2.8, 18, 5.6); c.fill(); c.stroke(); c.restore();
  }
  c.globalAlpha = 1;
  if (beat > 0.05) { const mr = 80 * Math.min(w / 540, h / 960) + 14; c.strokeStyle = C.cyan; c.lineWidth = 3; c.globalAlpha = beat * 0.55; c.beginPath(); c.arc(w * 0.78, h * 0.072, mr + 22 + (1 - beat) * 16, 0, TAU); c.stroke(); c.globalAlpha = 1; }
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
  const k = 1 + (1 - clamp(amt, 0, 1)) * 0.3, a = clamp(amt * 0.95, 0, 0.85);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(k, k); ctx.translate(-w / 2, -h / 2);
  put(ctx, e, 0, 0, t, 3, a);
  ctx.restore();
}
let BAKE_THUMB = false;
export function drawBackdrop(ctx, id, w, h, t, o) {
  o = o || {}; t = t || 0; id = STAGES[id] ? id : 'title';
  const beat = clamp(o.beat || 0, 0, 1), skin = skinOf(o);
  const key = id + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + getScale() + (o.thumb ? '|t' : '') + skinTag(skin);
  let e = bgCache.get(key); if (!e) { BAKE_THUMB = !!o.thumb; e = lruSet(bgCache, key, bakeBg(id, w, h, skin), 10); BAKE_THUMB = false; }
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
  club: { page: '#f1e9ff', line: '#d6c9f5', pad: '#c9b3f5', lane: '#6d6790', accent: C.mag, props: ['speaker', 'amp', 'speaker', 'cone'] },
  festival: { page: '#fff0d6', line: '#f6d6a8', pad: '#ffc98a', lane: '#b89a72', accent: C.orange, props: ['plant', 'crate', 'cone', 'amp'] },
  arena: { page: '#faf5ea', line: '#cfe0ee', pad: '#c9dcf2', lane: '#8d93a6', accent: C.pink, props: ['cone', 'speaker', 'amp', 'crate'] },
  // Bonfire Beach: warm sand page, wet sand tide band at the spawn end, a boardwalk lane, the bonfire in the middle of the fork
  beach: { page: '#fbe7b9', line: '#efd09a', pad: '#ffe3ae', lane: '#b88454', accent: C.orange, props: ['palm', 'driftwood', 'palm', 'surf'], rule: 'sand', laneStyle: 'planks', plank: '#6b4a2b', fire: [3, 3], chev: 'rgba(43,39,51,0.5)', dash: '#f7f2e4' },
  // Moonlight Rave: deep navy page with stars, floating stage platforms for pads, a neon dance-floor lane
  moon: { page: '#161a56', line: '#2a3490', pad: '#7d8cff', lane: '#6f5fe0', accent: C.cyan, props: ['glow', 'crystal', 'glow', 'speaker'], rule: 'stars', laneStyle: 'floor', laneAlt: C.mag, platform: true, ink: '#a9f1ff', tape: 'rgba(120,230,255,0.3)', chev: 'rgba(200,245,255,0.8)', dash: '#ffd0f6', laneA: 0.66 },
};
const themeFor = (worldId, skin) => Object.assign({}, THEME[worldId] || THEME.garage, SKIN[skin] || {});
const PAD = 26;
function pathSet(m) { const s = new Set(); for (const lane of m.lanes) for (const [c, r] of lane.tiles) s.add(c + ',' + r); return s; }
function gatePos(lane) {
  const p0 = lane.pts[0], p1 = lane.pts[1]; let gx = p0.x, gy = p0.y;
  if (p0.c < 0) gx = BOARD_X; else if (p0.c >= COLS) gx = BOARD_X + BOARD_W;
  if (p0.r < 0) gy = BOARD_Y; else if (p0.r >= ROWS) gy = BOARD_Y + BOARD_H;
  return { gx, gy, ang: Math.atan2(p1.y - p0.y, p1.x - p0.x) };
}
function paintProp(p, kind, x, y) {
  const s = 54;
  if (kind === 'speaker') speakerProp(p, x, y, s); else if (kind === 'plant') plantProp(p, x, y + 6, s); else if (kind === 'crate') crateProp(p, x, y + 4, s * 0.86); else if (kind === 'cone') coneProp(p, x, y, s);
  else if (kind === 'palm') { p.shp(arc(x, y + 26, 18, 5, 0, 360, 10), '#e0b46c', null, 0, { gap: 4, alpha: 0.9 }); palmTree(p, x - 2, y + 28, 58, 0.16); }
  else if (kind === 'driftwood') { driftwood(p, x, y + 10, 56, -0.35); driftwood(p, x + 4, y + 18, 40, 0.25); }
  else if (kind === 'surf') { surfboard(p, x, y, 64, -1.15, C.pink, '#fff'); p.shp(arc(x + 10, y + 26, 14, 4, 0, 360, 8), '#e0b46c', null, 0, { gap: 4, alpha: 0.9 }); }
  else if (kind === 'glow') { glowStick(p, x - 8, y + 4, 40, -0.95, C.lime); glowStick(p, x + 8, y + 4, 40, 0.95, C.pink); glowStick(p, x, y + 10, 38, 0.1, C.cyan); }
  else if (kind === 'crystal') { crystalProp(p, x - 6, y + 2, 44, '#7ee8ff'); crystalProp(p, x + 14, y + 14, 24, '#d9b3ff'); }
  else ampProp(p, x, y + 2, s);
}
function paintPlatform(p, c, s, x0, y0, th, i) {   // a floating stage platform for a buildable tile (moon)
  const cx = s.x;
  p.shp([x0 + 9, y0 + 32, x0 + TILE - 9, y0 + 32, x0 + TILE - 17, y0 + 47, x0 + TILE / 2 + 7, y0 + 63, x0 + TILE / 2 - 8, y0 + 49, x0 + 15, y0 + 43], '#3a3f94', INK, 2.2, { gap: 6, f2: '#7a82e0' });
  p.shp(arc(cx, y0 + 33, 29, 17, 0, 360, 14), th.pad, INK, 2.4, { gap: 6.5, f2: '#ffffff', alpha: 0.9 });
  p.ln([cx - 7, y0 + 33, cx + 7, y0 + 33], INK, 2.2, false, 0.5); p.ln([cx, y0 + 28, cx, y0 + 38], INK, 2.2, false, 0.5);
  if (i % 4 === 0) p.dot(x0 + 11 + (i % 3) * 20, y0 + 56 - (i % 2) * 6, 2.4, i % 8 === 0 ? C.cyan : C.mag);   // a tiny floating speck under the platform
}
function paintBoard(p, c, mapId, worldId, skin) {
  const m = buildMap(mapId), th = themeFor(worldId, skin), pset = pathSet(m);
  c.translate(-BOARD_X + PAD, -BOARD_Y + PAD);
  // the page the board is drawn on: a slightly lighter sheet with faint ruled lines, an uneven double border and tape in the corners
  c.fillStyle = th.page; c.fillRect(BOARD_X - 6, BOARD_Y - 6, BOARD_W + 12, BOARD_H + 12);
  c.strokeStyle = th.line; c.lineWidth = 1.6; c.beginPath();
  if (th.rule === 'sand') {   // wet-sand ripples
    for (let y = BOARD_Y + 30, row = 0; y < BOARD_Y + BOARD_H; y += 36, row++) for (let x = BOARD_X + (row % 2) * 22; x < BOARD_X + BOARD_W; x += 44) { c.moveTo(x, y); c.quadraticCurveTo(x + 11, y - 5, x + 22, y); c.quadraticCurveTo(x + 33, y + 5, x + 44, y); }
  } else for (let y = BOARD_Y + 18; y < BOARD_Y + BOARD_H; y += 36) { c.moveTo(BOARD_X, y); c.lineTo(BOARD_X + BOARD_W, y); }
  c.stroke();
  if (th.rule === 'sand') for (let i = 0; i < 60; i++) p.dot(BOARD_X + hn(i * 3 + 1) * BOARD_W, BOARD_Y + 30 + hn(i * 5 + 2) * (BOARD_H - 30), 1.4 + hn(i) * 1.4, 'rgba(138,90,43,0.35)');
  if (th.rule === 'stars') for (let i = 0; i < 34; i++) star4(p, BOARD_X + hn(i * 3 + 4) * BOARD_W, BOARD_Y + hn(i * 5 + 5) * BOARD_H, 2.5 + hn(i + 3) * 4, ['#7886f0', '#6bd6ee', '#e690d8', '#f2e8a0'][i % 4]);
  if (worldId === 'beach') {   // the tide: a teal band with foam scallops along the spawn edge
    p.hatch(rect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, 24), '#2fc4b2', 7, 0.15, 0.62); p.hatch(rect(BOARD_X - 4, BOARD_Y + 20, BOARD_W + 8, 12), '#d9b070', 7, 0.3, 0.4);
    for (let k = 0; k < 16; k++) { const q = arc(BOARD_X + k * 34 + 8, BOARD_Y + 20, 17, 8, 0, 180, 5); p.ln(q, '#ffffff', 3.4, false, 0.5); p.ln(q, INK, 1.4, false, 0.3); }
  }
  p.ln(rect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, BOARD_H + 8, 10), INK, 3.6, true, 1.4); p.ln(rect(BOARD_X - 10, BOARD_Y - 9, BOARD_W + 20, BOARD_H + 19, 12), th.frame || th.accent, 2.4, true, 2.2);
  const corners = [[BOARD_X + 10, BOARD_Y - 6, -0.4], [BOARD_X + BOARD_W - 10, BOARD_Y - 6, 0.4], [BOARD_X + 10, BOARD_Y + BOARD_H + 6, 0.4], [BOARD_X + BOARD_W - 10, BOARD_Y + BOARD_H + 6, -0.4]];
  corners.forEach(([x, y, r], i) => { if (skin === 'skin_sticker') washi(p, x, y, 74, 22, r, ...WASHI[i]); else tape(p, x, y, 70, 22, r, th.tape); });
  if (skin === 'skin_sticker') {   // star stickers stuck on the frame
    const cols = [C.yellow, C.pink, C.sky, C.lime, C.orange];
    for (let i = 0; i < 7; i++) { const side = i % 2, x = side ? BOARD_X + BOARD_W + 4 : BOARD_X - 4, y = BOARD_Y + 60 + i * 96; if (i % 3 === 1) sticker(p, heart(x, y, 24), C.pink, 2); else sticker(p, star(x, y, 13, 0.46, i * 0.3), cols[i % 5], 2); }
  }
  c.save(); c.beginPath(); c.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H); c.clip();
  const isFire = (s) => th.fire && s.c === th.fire[0] && s.r === th.fire[1];
  if (m.base && (worldId === 'beach')) { const bx0 = BOARD_X + m.base.c * TILE, by0 = BOARD_Y + m.base.r * TILE; p.hatch(rect(bx0 - 3, by0 - 3, TILE + 6, TILE + 6, 12), '#2fc4b2', 6, 0.2, 0.75); for (const sd of [-1, 1]) p.ln(arc(bx0 + TILE / 2 + sd * (TILE / 2 + 2), by0 + TILE / 2, 8, 16, sd < 0 ? 90 : -90, sd < 0 ? 270 : 90, 6), '#fff', 3, false, 0.4); }
  // buildable pads: scribbled squares with a tiny plus; blocked tiles: doodled props with a grey hatch shadow
  m.slots.forEach((s, i) => {
    const x0 = BOARD_X + s.c * TILE, y0 = BOARD_Y + s.r * TILE;
    if (isFire(s)) { p.hatch(arc(s.x, s.y + 8, 33, 24, 0, 360, 12), '#e3c07a', 6, 0.2, 0.6); logsAndStones(p, s.x, s.y + 4, 66); }
    else if (s.blocked) {
      p.hatch([s.x - 22, s.y + 22, s.x + 26, s.y + 22, s.x + 30, s.y + 30, s.x - 18, s.y + 30], th.dark ? '#000000' : '#8a8696', 5, 0.2, th.dark ? 0.3 : 0.5);
      paintProp(p, th.props[(s.c * 3 + s.r * 5) % th.props.length], s.x, s.y);
    } else if (th.platform) paintPlatform(p, c, s, x0, y0, th, i);
    else {
      p.hatch(rect(x0 + 6, y0 + 6, TILE - 12, TILE - 12, 8), th.pad, 8.5, -0.7 + (i % 3) * 0.15, th.dark ? 0.55 : 0.42);
      p.ln(rect(x0 + 5, y0 + 5, TILE - 10, TILE - 10, 9), INK, 2.2, true, 1.1);
      p.ln([s.x - 7, s.y, s.x + 7, s.y], INK, 2.2, false, 0.5); p.ln([s.x, s.y - 7, s.x, s.y + 7], INK, 2.2, false, 0.5);
    }
  });
  // the lane: every path tile pencil-shaded, ink edges where the lane meets the page, a dashed centre line
  for (const key of pset) {
    const [cc, rr] = key.split(',').map(Number); if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
    const x0 = BOARD_X + cc * TILE, y0 = BOARD_Y + rr * TILE;
    p.hatch(rect(x0, y0, TILE, TILE), th.lane, 7, 0.9 + ((cc + rr) % 2) * 0.1, th.laneA || (worldId === 'club' ? 0.6 : 0.5));
    if (th.laneStyle === 'planks') {   // boardwalk planks across the walking direction
      const hz = pset.has((cc - 1) + ',' + rr) || pset.has((cc + 1) + ',' + rr), vt = pset.has(cc + ',' + (rr - 1)) || pset.has(cc + ',' + (rr + 1));
      if (hz !== vt) for (let k = 1; k < 4; k++) { if (hz) p.ln([x0 + k * 18, y0 + 4, x0 + k * 18, y0 + TILE - 4], th.plank, 1.8, false, 0.4); else p.ln([x0 + 4, y0 + k * 18, x0 + TILE - 4, y0 + k * 18], th.plank, 1.8, false, 0.4); }
    } else if (th.laneStyle === 'floor' && (cc + rr) % 2) p.hatch(rect(x0 + 5, y0 + 5, TILE - 10, TILE - 10, 6), th.laneAlt, 9, 0.5, 0.26);
    if (!pset.has(cc + ',' + (rr - 1))) p.ln([x0 - 1, y0, x0 + TILE + 1, y0], INK, 3.2, false, 1);
    if (!pset.has(cc + ',' + (rr + 1))) p.ln([x0 - 1, y0 + TILE, x0 + TILE + 1, y0 + TILE], INK, 3.2, false, 1);
    if (!pset.has((cc - 1) + ',' + rr)) p.ln([x0, y0 - 1, x0, y0 + TILE + 1], INK, 3.2, false, 1);
    if (!pset.has((cc + 1) + ',' + rr)) p.ln([x0 + TILE, y0 - 1, x0 + TILE, y0 + TILE + 1], INK, 3.2, false, 1);
  }
  if (m.base && worldId === 'moon') { const bx0 = BOARD_X + m.base.c * TILE, by0 = BOARD_Y + m.base.r * TILE; p.ln(rect(bx0 + 4, by0 + 4, TILE - 8, TILE - 8, 10), C.cyan, 3, true, 0.8); p.ln(rect(bx0 + 9, by0 + 9, TILE - 18, TILE - 18, 8), C.mag, 2.2, true, 0.8); }
  for (const lane of m.lanes) { const q = []; for (const pt of lane.pts) q.push(pt.x, pt.y); p.ln(q, th.dash || '#f7f2e4', 3, false, 1, [14, 12]); }
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
function boardEntry(mapId, worldId, skin) {
  const key = mapId + '|' + worldId + '|' + getScale() + skinTag(skin);
  let e = boardCache.get(key);
  if (!e) {
    const th = themeFor(worldId, skin);
    e = lruSet(boardCache, key, bake('board|' + mapId + '|' + worldId + skinTag(skin), BOARD_W + PAD * 2, BOARD_H + PAD * 2, 2, getScale(), inked(th.ink, (p, c) => paintBoard(p, c, mapId, worldId, skin))), 12);
  }
  return e;
}
function floaties(c, t) {   // low gravity: a few slow bubbles and specks drifting up across the board
  c.save(); c.lineWidth = 1.8; const cols = [C.cyan, C.pink, '#fff3b0', C.lime];
  for (let i = 0; i < 12; i++) {
    const k = (t * (0.025 + hn(i) * 0.02) + hn(i * 2 + 5)) % 1, x = BOARD_X + BOARD_W * hn(i * 5 + 1) + Math.sin(t * 0.6 + i * 1.7) * 12, y = BOARD_Y + BOARD_H * (1.04 - k * 1.08), r = 2.2 + hn(i + 9) * 3.5;
    c.globalAlpha = Math.sin(k * Math.PI) * 0.6; c.strokeStyle = cols[i % 4]; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  }
  c.restore();
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
  const skin = skinOf(o), m = buildMap(mapId), th = themeFor(worldId, skin), wd = WORLD_BY_ID[worldId] || { accent: C.pink };
  const beat = clamp(o.beat || 0, 0, 1), e = boardEntry(mapId, worldId, skin);
  ctx.save();
  if (e.direct) { ctx.save(); e.draw(new Pen(ctx, hashStr(e.key), 1), ctx, 0); ctx.restore(); } else put(ctx, e, BOARD_X - PAD, BOARD_Y - PAD, t, 3.5);
  // flowing chevrons along every lane (pencil ticks marching to the stage)
  ctx.save(); ctx.beginPath(); ctx.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H); ctx.clip();
  if (th.fire) flames(ctx, tileCx(th.fire[0]), tileCy(th.fire[1]) + 8, 54, t, beat);   // the bonfire in the middle of the fork
  if (worldId === 'moon') floaties(ctx, t);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.2; ctx.strokeStyle = th.chev || 'rgba(43,39,51,0.5)';
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
function paintStage(p, c, ok, cracked, accent, worldId) {
  c.translate(SW / 2, SH / 2 + 8);
  if (worldId === 'beach') {   // a little beached boat for a stage: planked hull, stripe, portholes, a life ring
    const hull = [-56, 17, 56, 17, 52, 30, 36, 42, -36, 42, -52, 30];
    p.shp(hull, '#c86a45', INK, 3, { gap: 6, f2: '#f0b48a' }); p.ln([-52, 29, 52, 29], '#fff', 3, false, 0.6);
    for (const x of [-26, 0, 26]) { p.dot(x, 35, 4.2, '#7ad8e8'); p.ln(arc(x, 35, 4.2, 4.2, 0, 360, 8), INK, 1.6, true, 0.3); }
    p.shp(arc(-47, 30, 6.5, 6.5, 0, 360, 10), C.red, INK, 2, { gap: 3 }); p.dot(-47, 30, 2.6, '#fff');
    p.ln([-34, 44, -26, 46, -18, 44], '#8fe8dc', 2.4, false, 0.6); p.ln([20, 45, 28, 47, 36, 45], '#8fe8dc', 2.4, false, 0.6);   // lapping water
  } else if (worldId === 'moon') {   // a floating moon-rock platform with a neon rim
    const rock = [-56, 18, 56, 18, 46, 30, 28, 41, 6, 47, -16, 42, -40, 32];
    p.shp(rock, '#4d52a8', INK, 3, { gap: 6, f2: '#9298f0' }); p.ln([-50, 20, 50, 20], C.cyan, 3, false, 0.5);
    p.ln([-22, 30, -14, 36], INK, 1.8, false, 0.3); p.ln([14, 30, 22, 38], INK, 1.8, false, 0.3);
    p.shp([34, 40, 40, 52, 30, 48], C.mag, INK, 1.8, { gap: 3 }); p.shp([-30, 38, -26, 50, -36, 45], C.cyan, INK, 1.8, { gap: 3 });
  } else {
    p.hatch([-50, 22, 50, 22, 56, 40, -56, 40], '#8a6a4a', 6, 0.3, 0.8); p.ln([-50, 22, 50, 22, 56, 40, -56, 40], INK, 3, true, 1);
  }
  p.shp(rect(-46, 10, 92, 14), accent, INK, 3, { gap: 6 });
  for (let i = -3; i <= 3; i++) p.ln([i * 13, 10, i * 13 - 3, 24], INK, 1.8, false, 0.4);
  for (const sd of [-1, 1]) { const x = sd * 42; p.shp(rect(x - 11, -30, 22, 42, 4), '#3d3750', INK, 3, { gap: 5, alpha: 0.9 }); p.shp(arc(x, -18, 6, 6, 0, 360, 8), C.grey, INK, 2, { gap: 4 }); p.shp(arc(x, -3, 7.5, 7.5, 0, 360, 8), C.grey, INK, 2, { gap: 4 }); }
  p.ln([-42, -36, 42, -36], INK, 4, false, 0.8); p.ln([-30, -36, -30, -48, 30, -48, 30, -36], INK, 2.6, false, 0.6);
  for (let i = 0; i < 3; i++) { const x = -20 + i * 20; p.shp(rect(x - 5, -55, 10, 9, 2), ok ? [C.pink, C.cyan, C.yellow][i] : '#6a6478', INK, 2.2, { gap: 4 }); }
  p.shp(rect(-26, -32, 52, 24, 3), ok ? '#2a2548' : '#3e3a50', INK, 2.6, { gap: 6 });
  if (cracked) { p.ln([-38, -44, -30, -30, -34, -16, -22, -4], INK, 2.6, false, 1.4); p.ln([30, -40, 24, -26, 32, -12], INK, 2.4, false, 1.2); p.ln([-4, 10, 0, 18, 8, 22], INK, 2.2, false, 1); }
}
function stageEntry(worldId, ok, cracked) {
  const key = worldId + '|' + ok + '|' + cracked + '|' + getScale();
  let e = stageCache.get(key);
  if (!e) { const a = (WORLD_BY_ID[worldId] || { accent: C.pink }).accent; e = lruSet(stageCache, key, bake('stage|' + worldId + '|' + ok + cracked, SW, SH, 2, getScale(), (p, c) => paintStage(p, c, ok, cracked, a, worldId)), 20); }
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
  const sp = o.studio ? studioProps(o.studio) : null, lay = stageLayout(stageRoom(worldId)), ex = sp ? stageExtras(worldId, sp, lay) : null;
  if (ex) put(ctx, ex, -EXW / 2, -EXH + 48, t, 3);
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
  if (sp && sp.lights > 0 && ok) for (const b of lightBulbs(sp.lights, lay, sp)) { ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 3.1 + b.i * 1.9); ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.x, b.y, 3.1, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke(); } ctx.globalAlpha = 1;
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

// ================================================================================================================ STUDIO PROGRESS
// Studio upgrade levels become things you can see: props on the Static-attacked stage (drawStageBase o.studio) and a backstage scene in the Studio tab.
const tierOf = (v, steps) => { let n = 0; for (const s of steps) if (v >= s) n++; return n; };
export function studioProps(levels) {
  const L = levels && typeof levels === 'object' ? levels : {};
  const g = (id) => { const v = Math.floor(+L[id]); return v > 0 && Number.isFinite(v) ? v : 0; };
  let total = 0; for (const k of Object.keys(L)) total += g(k);
  return {
    amps: tierOf(g('amp'), [1, 5, 10, 15]), riser: tierOf(g('tempo'), [1, 6, 12]), cables: tierOf(g('range'), [1, 4, 8]),
    charm: tierOf(g('crit') + g('critdmg'), [1, 10]), jar: tierOf(g('coin') + g('tipcup'), [1, 6, 12, 20]),
    banner: tierOf(g('heropow') + g('herocd'), [1, 6]), lights: tierOf(g('hype') + g('lucky'), [1, 4, 9]),
    van: tierOf(g('rack') * 3 + g('stream'), [1, 4, 9]), truss: tierOf(g('stagehp'), [1, 5, 10]), eq: tierOf(total, [4, 20, 60]), total,
  };
}
const sketch = (p, pts) => { p.ctx.globalAlpha = 0.7; p.ln(pts, '#9b96ad', 2.2, true, 0.7, [6, 7]); p.ctx.globalAlpha = 1; };
function ampBox(p, x, y, w, h, tint) {   // (x, y) = bottom-left corner
  p.shp(rect(x, y - h, w, h, 3), '#3d3750', INK, 3, { gap: 5, alpha: 0.95, f2: tint });
  const cx = x + w / 2, cy = y - h * 0.44, r = Math.min(w, h) * 0.3;
  p.shp(arc(cx, cy, r, r, 0, 360, 10), C.grey, INK, 2.2, { gap: 4 }); p.dot(cx, cy, r * 0.34, INK);
  p.dot(x + 7, y - h + 6, 2.2, C.yellow); p.dot(x + 14, y - h + 6, 2.2, C.pink);
}
const AMP_SPOTS = [
  [], [[40, 0, 40, 38]], [[34, 0, 44, 44], [84, 0, 36, 34]],
  [[30, 0, 48, 50], [30, -50, 48, 40], [84, 0, 38, 38]],
  [[14, 0, 50, 52], [14, -52, 50, 44], [68, 0, 48, 52], [68, -52, 48, 44], [60, -96, 34, 30]],
];
function drumKit(p, cx, y, tier) {   // cx centre, y = riser top
  const kick = (x, r) => { p.shp(arc(x, y - r, r, r * 0.95, 0, 360, 12), C.pink, INK, 3, { gap: 5, f2: C.yellow }); p.shp(arc(x, y - r, r * 0.38, r * 0.38, 0, 360, 8), C.paper, INK, 2, { gap: 5 }); };
  if (tier >= 1) kick(cx, 17);
  if (tier >= 2) {
    p.ln([cx - 46, y, cx - 40, y - 24], INK, 2.6, false, 0.6); p.shp(arc(cx - 40, y - 28, 12, 6, 0, 360, 10), C.paper, INK, 2.4, { gap: 4 });
    p.ln([cx + 44, y, cx + 44, y - 34], INK, 2.6, false, 0.6); p.shp(arc(cx + 44, y - 36, 15, 4, 0, 360, 10), C.gold, INK, 2.4, { gap: 4 });
  }
  if (tier >= 3) {
    kick(cx + 30, 11);
    p.ln([cx - 24, y - 20, cx - 36, y - 56], INK, 2.4, false, 0.6); p.shp(arc(cx - 36, y - 58, 17, 4.5, 0, 360, 10), C.yellow, INK, 2.4, { gap: 4 });
    p.ln([cx + 8, y - 28, cx + 20, y - 62], INK, 2.4, false, 0.6); p.shp(arc(cx + 20, y - 64, 15, 4, 0, 360, 10), C.gold, INK, 2.4, { gap: 4 });
  }
}
function vanArt(p, x, y, tier, ghost) {   // (x, y) = bottom-left on the floor
  const body = [x, y - 8, x, y - 46, x + 66, y - 46, x + 66, y - 8], cab = [x + 66, y - 8, x + 66, y - 36, x + 80, y - 36, x + 96, y - 20, x + 96, y - 8];
  if (ghost) { sketch(p, body); sketch(p, cab); p.ctx.globalAlpha = 0.7; p.ln(arc(x + 22, y - 6, 8, 8, 0, 360, 10), '#9b96ad', 2.2, true, 0.5, [5, 5]); p.ln(arc(x + 76, y - 6, 8, 8, 0, 360, 10), '#9b96ad', 2.2, true, 0.5, [5, 5]); p.ctx.globalAlpha = 1; return; }
  const col = tier >= 3 ? C.gold : tier === 2 ? C.pink : '#b9b4c6';
  p.shp(body, col, INK, 3, { gap: 5, f2: tier >= 2 ? C.paper : null }); p.shp(cab, col, INK, 3, { gap: 5 });
  p.shp([x + 71, y - 33, x + 79, y - 33, x + 91, y - 21, x + 71, y - 21], C.sky, INK, 2.2, { gap: 4 });
  p.shp(rect(x + 8, y - 38, 20, 14, 2), C.sky, INK, 2.2, { gap: 4 });
  if (tier >= 2) { p.ln([x + 2, y - 15, x + 64, y - 15], C.cyan, 3.4, false, 0.6); p.shp(star(x + 42, y - 31, 7, 0.45, 0.2), C.yellow, INK, 1.8, { gap: 4 }); }
  if (tier >= 3) { p.ln([x + 6, y - 50, x + 60, y - 50], INK, 2.4, false, 0.4); for (let i = 0; i < 4; i++) p.ln([x + 10 + i * 15, y - 46, x + 10 + i * 15, y - 50], INK, 2, false, 0.2); p.txt('TOUR', x + 22, y - 52, 8, C.red, { align: 'c', w: 2 }); p.shp(rect(x + 44, y - 64, 14, 12, 2), '#3d3750', INK, 2.2, { gap: 4 }); }
  else if (tier === 1) p.ln([x + 14, y - 30, x + 20, y - 24, x + 15, y - 18], INK, 1.8, false, 0.8);
  for (const wx of [x + 22, x + 76]) { p.shp(arc(wx, y - 6, 9, 9, 0, 360, 10), '#3d3750', INK, 2.8, { gap: 4 }); p.shp(arc(wx, y - 6, 3.4, 3.4, 0, 360, 6), C.grey, INK, 1.6, { gap: 3 }); }
}
function jarArt(p, x, y, tier, ghost) {   // (x, y) = bottom centre
  const gl = [x - 11, y - 34, x - 13, y - 4, x - 9, y, x + 9, y, x + 13, y - 4, x + 11, y - 34];
  if (ghost) { sketch(p, gl); return; }
  if (tier >= 1) p.shp([x - 12, y - 4 - tier * 6, x - 13, y - 4, x - 9, y, x + 9, y, x + 13, y - 4, x + 12, y - 4 - tier * 6], C.gold, null, 1, { gap: 4, alpha: 0.95 });
  p.ln(gl, INK, 2.6, false, 0.6); p.ln([x - 14, y - 34, x + 14, y - 34], INK, 3.2, false, 0.4);
  for (let i = 0; i < tier; i++) p.dot(x - 6 + (i % 2) * 11, y - 8 - i * 4, 3.4, C.yellow);
  if (tier >= 3) p.shp(star(x, y - 40, 7, 0.45, 0), C.yellow, INK, 1.8, { gap: 4 });
}
const BULB_COLS = [C.pink, C.cyan, C.yellow, C.lime, C.orange];
// Which neighbour tiles of the stage tile are free? A tile is free when it is on the board, is not a lane tile and not a blocked decor tile.
// The Studio props only go into free tiles, so they never cover the lane (Busk Street, where the stage sits mid board, is the case that matters).
const roomCache = new Map();
function stageRoom(worldId) {
  let r = roomCache.get(worldId); if (r) return r;
  r = { L: true, R: true, U: true };
  const wd = WORLD_BY_ID[worldId];
  if (wd && MAPS[wd.map]) {
    const m = buildMap(wd.map), b = m.base, blocked = new Set(m.slots.filter((s) => s.blocked).map((s) => s.c + ',' + s.r));
    const free = (c, rr) => c >= 0 && c < COLS && rr >= 0 && rr < ROWS && !m.isPath(c, rr) && !blocked.has(c + ',' + rr);
    r = { L: free(b.c - 1, b.r), R: free(b.c + 1, b.r), U: free(b.c, b.r - 1) };
  }
  roomCache.set(worldId, r); return r;
}
// the prop layout for a room: which sides get amps, where the truss poles stand and how high the top bar goes (stage-centre coordinates)
function stageLayout(room) {
  return { sides: [room.L ? -1 : 0, room.R ? 1 : 0].filter((v) => v), poleX: [room.L ? 62 : 44, room.R ? 62 : 44], tall: room.U, code: (room.L ? 1 : 0) + '' + (room.R ? 1 : 0) + (room.U ? 1 : 0) };
}
const topYOf = (sp, lay) => 22 - Math.min(sp.banner > 0 || sp.lights > 0 ? 112 : sp.truss >= 2 ? 92 : 82, lay.tall ? 112 : 84);
// string light bulbs for the Static stage, in stage-centre coordinates
function lightBulbs(tier, lay, sp) {
  const n = [0, 3, 5, 7][tier] || 0, out = [], ty = topYOf(sp, lay) + 8;
  for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); out.push({ i, x: lerp(-lay.poleX[0] + 4, lay.poleX[1] - 4, k), y: ty + Math.sin(k * Math.PI) * 8 + 3, col: BULB_COLS[i % 5] }); }
  return out;
}
const EXW = 200, EXH = 150;
const extraCache = new Map();
function stageExtras(worldId, sp, lay) {
  if (!(sp.amps || sp.banner || sp.lights || sp.truss)) return null;
  const key = [worldId, sp.amps, sp.banner, sp.lights, sp.truss, lay.code, getScale()].join('|');
  let e = extraCache.get(key);
  if (!e) e = lruSet(extraCache, key, bake('extras|' + key, EXW, EXH, 2, getScale(), (p, c) => paintExtras(p, c, sp, (WORLD_BY_ID[worldId] || { accent: C.pink }).accent, lay)), 24);
  return e;
}
function paintExtras(p, c, sp, accent, lay) {
  c.translate(EXW / 2, EXH - 48);   // stage centre
  const poles = sp.truss > 0 || sp.banner > 0 || sp.lights > 0, ty0 = topYOf(sp, lay), hgt = 22 - ty0, [pl, pr] = lay.poleX;
  if (sp.amps > 0) {
    if (lay.sides.length) {
      const stack = Math.min(2, (sp.amps >= 4 ? 2 : sp.amps >= 3 ? 1 : 0) + (lay.sides.length === 1 && sp.amps >= 2 ? 1 : 0));
      for (const sd of (sp.amps >= 2 ? lay.sides : lay.sides.slice(0, 1))) {
        ampBox(p, sd < 0 ? -90 : 56, 34, 32, 36, accent);
        if (stack >= 1) ampBox(p, sd < 0 ? -88 : 58, -2, 28, 28, accent);
        if (stack >= 2) ampBox(p, sd < 0 ? -86 : 60, -30, 24, 22, accent);
      }
    } else {   // no free tile beside the stage: small amps tucked behind it
      ampBox(p, -38, -26, 32, 32, accent); if (sp.amps >= 2) ampBox(p, 6, -26, 32, 32, accent); if (sp.amps >= 3) ampBox(p, -16, -46, 32, 22, accent);
    }
  }
  if (poles) {
    for (const [sd, px] of [[-1, pl], [1, pr]]) { p.ln([sd * px, 22, sd * px, ty0], INK, 3.2, false, 0.5); if (sp.truss >= 1) for (let k = 0; k * 30 < hgt - 10; k++) p.ln([sd * px - 4, 22 - k * 30, sd * px + 4, 22 - k * 30 - 22], INK, 1.6, false, 0.3); }
    p.ln([-pl, ty0, pr, ty0], INK, 3.2, false, 0.5);
    if (sp.truss >= 3) for (const x of [-34, 0, 34]) p.shp(rect(x - 5, ty0 + 2, 10, 8, 2), C.yellow, INK, 1.8, { gap: 4 });
  }
  if (sp.banner > 0) {
    const ty = ty0 + 10, bw = lay.tall ? 48 : 34;
    if (sp.banner >= 2) { p.shp([-bw, ty, bw, ty, bw, ty + 22, 0, ty + 28, -bw, ty + 22], C.pink, INK, 2.6, { gap: 5, f2: C.yellow }); if (lay.tall) p.txt('BASS', 0, ty + 18, 12, C.paper, { align: 'c', out: INK, ow: 3.4, w: 2.6 }); else p.shp(star(0, ty + 12, 8, 0.46, 0), C.yellow, INK, 1.6, { gap: 3 }); }
    else for (let i = 0; i < 6; i++) { const k = i / 5; p.shp([lerp(-bw, bw, k) - 6, ty, lerp(-bw, bw, k) + 6, ty, lerp(-bw, bw, k), ty + 14], BULB_COLS[i % 5], INK, 1.8, { gap: 4 }); }
  }
  if (sp.lights > 0) { const q = []; for (let i = 0; i <= 10; i++) q.push(lerp(-pl + 4, pr - 4, i / 10), ty0 + 8 + Math.sin(i / 10 * Math.PI) * 8); p.ln(q, INK, 1.8, false, 0.4); }
}

// ---------------------------------------------------------------- the Studio tab backstage scene
const SCENE_W = 504, SCENE_H = 170, SFLOOR = 144;
const sceneCache = new Map();
function paintScene(p, c, sp, accent) {
  ruled(c, SCENE_W, SCENE_H, { paper: C.paper, line: C.line, step: 30, margin: C.margin });
  // floor boards
  p.hatch([0, SFLOOR, SCENE_W, SFLOOR, SCENE_W, SCENE_H, 0, SFLOOR + 26], '#c79a63', 7, 0.25, 0.8); p.ln([0, SFLOOR, SCENE_W, SFLOOR], INK, 3.4, false, 1);
  for (let x = 40; x < SCENE_W; x += 70) p.ln([x, SFLOOR, x - 10, SCENE_H], INK, 1.4, false, 0.4);
  // cables on the floor
  for (let i = 0; i < sp.cables; i++) { const y0 = SFLOOR + 8 + i * 6, q = []; for (let k = 0; k <= 16; k++) q.push(20 + k * 24, y0 + Math.sin(k * 0.9 + i * 2) * (4 + i)); p.ln(q, [C.red, C.blue, C.green][i], 3, false, 0.5); }
  // string lights wire and truss
  const hasPoles = sp.truss > 0 || sp.banner > 0 || sp.lights > 0;
  if (hasPoles) {
    const top = 14;
    for (const x of [140, 384]) { p.ln([x, SFLOOR, x, top], INK, 3.4, false, 0.6); for (let k = 0; k < 6; k++) p.ln([x - 5, SFLOOR - k * 22, x + 5, SFLOOR - k * 22 - 16], INK, 1.5, false, 0.3); }
    p.ln([140, top, 384, top], INK, 3.4, false, 0.5);
    if (sp.truss >= 2) for (const x of [190, 262, 334]) { p.shp(rect(x - 7, top + 2, 14, 10, 2), C.yellow, INK, 2, { gap: 4 }); }
  }
  if (sp.lights > 0) { const q = []; for (let i = 0; i <= 24; i++) q.push(i * SCENE_W / 24, 8 + Math.sin(i / 24 * Math.PI) * 18); p.ln(q, INK, 2, false, 0.5); }
  else sketch(p, [10, 8, 494, 8, 494, 12, 10, 12]);
  if (sp.banner >= 1) {
    if (sp.banner >= 2) { p.shp([250, 20, 378, 20, 378, 42, 314, 47, 250, 42], C.pink, INK, 3, { gap: 5, f2: C.yellow }); p.txt('DROP THE BASS', 314, 38, 10, C.paper, { align: 'c', out: INK, ow: 3.4, w: 2.4 }); }
    else for (let i = 0; i < 6; i++) p.shp([248 + i * 22, 18, 264 + i * 22, 18, 256 + i * 22, 36], BULB_COLS[i % 5], INK, 2, { gap: 4 });
  } else sketch(p, [250, 20, 378, 20, 378, 42, 250, 42]);
  if (sp.charm > 0) { p.ln([356, 46, 356, 58], INK, 1.8, false, 0.2); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; p.shp(arc(356 + Math.cos(a) * 6, 67 + Math.sin(a) * 6, 5, 5, 0, 360, 8), C.green, INK, 1.8, { gap: 3 }); } if (sp.charm >= 2) p.ln(arc(356, 67, 13, 13, 0, 360, 14), C.gold, 2.4, true, 0.4); }
  // amps
  if (sp.amps === 0) { sketch(p, rect(30, SFLOOR - 38, 44, 38)); sketch(p, rect(82, SFLOOR - 38, 38, 38)); }
  else for (const [x, dy, w, h] of AMP_SPOTS[sp.amps]) ampBox(p, x, SFLOOR + dy, w, h, accent);
  // drum riser
  const rw = [0, 100, 128, 156][sp.riser] || 0, rh = [0, 14, 20, 26][sp.riser] || 0;
  if (sp.riser === 0) sketch(p, rect(246, SFLOOR - 14, 100, 14)); else { const rx = 300 - rw / 2; p.shp(rect(rx, SFLOOR - rh, rw, rh, 2), '#a7794a', INK, 3, { gap: 5, f2: C.yellow }); for (let i = 1; i < rw / 28; i++) p.ln([rx + i * 28, SFLOOR - rh + 2, rx + i * 28, SFLOOR - 2], INK, 1.5, false, 0.3); drumKit(p, 300, SFLOOR - rh, sp.riser); }
  // van
  vanArt(p, 398, SFLOOR + 6, sp.van, sp.van === 0);
  jarArt(p, 372, SFLOOR + 24, sp.jar, sp.jar === 0);
  // equaliser frame
  if (sp.eq === 0) sketch(p, rect(398, 24, 92, 48));
  else { p.shp(rect(398, 24, 92, 48, 4), '#2a2548', INK, 3, { gap: 6 }); }
  if (sp.total === 0) p.txt('EMPTY STUDIO', 72, 44, 10, C.purple, { align: 'c', w: 2 });
}
function sceneEntry(sp, accent) {
  const key = ['scene', sp.amps, sp.riser, sp.cables, sp.charm, sp.jar, sp.banner, sp.lights, sp.van, sp.truss, sp.eq, sp.total > 0 ? 1 : 0, getScale()].join('|');
  let e = sceneCache.get(key);
  if (!e) e = lruSet(sceneCache, key, bake(key, SCENE_W, SCENE_H, 3, getScale(), (p, c) => paintScene(p, c, sp, accent)), 12);
  return e;
}
const HERO_POSE = { roxor: 'beat', jasmin: 'sing' };
export function drawStudioScene(ctx, w, h, t, studio, o) {
  o = o || {}; t = t || 0;
  const sp = studioProps(studio), hl = o.heroLv || {}, outfits = o.outfits || {};
  ctx.save(); ctx.translate(0, 0); if (w && h && (w !== SCENE_W || h !== SCENE_H)) ctx.scale(w / SCENE_W, h / SCENE_H);
  put(ctx, sceneEntry(sp, C.pink), 0, 0, t, 2.5);
  // live: glowing equaliser, twinkling bulbs, heroes with their level
  const bars = [0, 5, 7, 9][sp.eq];
  for (let i = 0; i < bars; i++) {
    const bw = 76 / bars, bh = 6 + (0.25 + 0.75 * Math.abs(Math.sin(t * (2.2 + hn(i) * 2.8) + i))) * (28 + sp.eq * 4), x = 405 + i * (bw + 0.8), col = [C.cyan, C.lime, C.yellow, C.pink][i % 4];
    ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.fillRect(x - 2, 66 - bh - 3, bw - 1.4 + 4, bh + 6);
    ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillRect(x, 66 - bh, bw - 1.4, bh);
  }
  if (sp.lights > 0) for (let i = 0; i < 12 + sp.lights * 3; i++) { const n = 12 + sp.lights * 3, k = i / (n - 1), x = k * SCENE_W, y = 8 + Math.sin(k * Math.PI) * 18 + 4; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2.6 + i * 1.7); ctx.fillStyle = BULB_COLS[i % 5]; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (sp.truss >= 3) { ctx.lineCap = 'round'; for (const [x, col] of [[190, C.pink], [262, C.yellow], [334, C.cyan]]) { const a = Math.PI / 2 + Math.sin(t * 1.3 + x) * 0.35; ctx.strokeStyle = col; ctx.globalAlpha = 0.4; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x + Math.cos(a) * 90, 28 + Math.sin(a) * 90); ctx.stroke(); } ctx.globalAlpha = 1; }
  let hv = 0;
  for (const [who, x] of [['roxor', 176], ['jasmin', 226]]) {
    const lv = Math.max(1, Math.min(10, Math.floor(+hl[who]) || 1)); hv += lv;
    const tr = tierOf(lv, [3, 6, 10]);
    try { drawHero(ctx, who, x, SFLOOR + 6, 96 + tr * 3, { t: t + (who === 'jasmin' ? 0.4 : 0), pose: HERO_POSE[who], outfit: outfits[who] || 'default' }); } catch (e) { /* art must never break the menu */ }
    if (tr >= 1) for (let i = 0; i < 3 + tr * 2; i++) { const a = t * 0.9 + i * 6.283 / (3 + tr * 2), r = 34 + tr * 4; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + i); ctx.strokeStyle = who === 'roxor' ? C.lime : C.pink; ctx.lineWidth = 2.4; const sx = x + Math.cos(a) * r, sy = SFLOOR - 50 + Math.sin(a) * r * 0.9; ctx.beginPath(); ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (tr >= 3) { const cy = SFLOOR - 100 + Math.sin(t * 2) * 2; ctx.fillStyle = C.gold; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x - 12, cy + 10); ctx.lineTo(x - 13, cy - 2); ctx.lineTo(x - 6, cy + 4); ctx.lineTo(x, cy - 6); ctx.lineTo(x + 6, cy + 4); ctx.lineTo(x + 13, cy - 2); ctx.lineTo(x + 12, cy + 10); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    // level pips under the feet
    for (let i = 0; i < 10; i++) { const px = x - 22.5 + i * 5, py = SFLOOR + 17; ctx.beginPath(); ctx.arc(px, py, 2, 0, TAU); ctx.fillStyle = i < lv ? (who === 'roxor' ? C.lime : C.pink) : 'rgba(255,255,255,0.55)'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke(); }
  }
  ctx.restore();
}
