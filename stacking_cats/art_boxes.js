// Drawings for the four lootboxes (cardboard box, wicker basket, silver fish chest, golden cat chest): same 64x64 board and cel-shaded
// style as art_icons.js, keyed by the plain character that BOXES in cats.js uses. art_icons.js merges BOX_ICONS into its own table.
// NOTE: keep every drawing on whole lines; never put a // comment in the middle of a line that holds code after it.
import { TAU, INK, cel, ell, poly, star, line } from './art_util.js';
import { BOX_BY_ID } from './cats.js';

const BOX = [0, 0, 64, 64];
const P = (build) => { const p = new Path2D(); build(p); return p; };
const F = (ctx, path, fill, lw = 2, o = {}) => cel(ctx, path, fill, { box: BOX, lw, ...o });
const dot = (ctx, x, y, r, col = 'rgba(255,255,255,.85)') => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const ln = (ctx, pts, col, lw = 2) => line(ctx, pts, col, lw);
const glint = (ctx, x, y, s = 4) => { ctx.fillStyle = '#fff'; ctx.fill(star(x, y, s, s * 0.28, 4)); };
const curve = (ctx, col, lw, fn) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); fn(ctx); ctx.stroke(); };
const rect = (x, y, w, h) => P((p) => { p.rect(x, y, w, h); });
const rrect = (x, y, w, h, r) => P((p) => { p.roundRect(x, y, w, h, r); });
const halo = (ctx, x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const pawPrint = (ctx, x, y, s, col) => { dot(ctx, x, y + s * 0.35, s * 0.55, col); for (const [dx, dy] of [[-0.7, -0.35], [-0.25, -0.8], [0.25, -0.8], [0.7, -0.35]]) dot(ctx, x + dx * s, y + dy * s, s * 0.26, col); };

export const BOX_ICONS = {
  // cardboard box: open flaps, a strip of tape and a paw stamp
  '📦': (c) => {
    F(c, poly(c, [[6, 26], [20, 14], [28, 28], [14, 36]]), '#d9a869', 2);
    F(c, poly(c, [[58, 26], [44, 14], [36, 28], [50, 36]]), '#d9a869', 2);
    F(c, poly(c, [[10, 30], [54, 30], [52, 56], [12, 56]]), '#c89a62', 2.2);
    F(c, rect(10, 30, 44, 7), '#b8874f', 1.6, { shade: false });
    F(c, rect(27, 30, 10, 26), '#f2dfae', 1.6, { shade: false });
    ln(c, [[30, 38], [34, 38]], '#d9c488', 1.4);
    pawPrint(c, 20, 47, 4.4, '#7a5530');
    dot(c, 15, 20, 1.4, 'rgba(255,255,255,.6)');
    glint(c, 47, 22, 3.2);
  },
  // wicker basket: woven body, a high handle and a blue blanket on top
  '🧳': (c) => {
    curve(c, INK, 6.4, (x) => { x.moveTo(14, 30); x.bezierCurveTo(14, 4, 50, 4, 50, 30); });
    curve(c, '#c98a45', 4, (x) => { x.moveTo(14, 30); x.bezierCurveTo(14, 4, 50, 4, 50, 30); });
    F(c, ell(null, 32, 31, 24, 7), '#8fb8e8', 2);
    F(c, P((p) => { p.moveTo(8, 33); p.lineTo(56, 33); p.lineTo(50, 56); p.quadraticCurveTo(32, 62, 14, 56); p.closePath(); }), '#e0b068', 2.2);
    for (let y = 38; y < 56; y += 6) ln(c, [[10 + (y - 33) * 0.2, y], [54 - (y - 33) * 0.2, y]], '#b4803e', 1.6);
    for (let x = 16; x < 50; x += 7) ln(c, [[x, 34], [x + (x < 32 ? -1 : 1), 57]], '#b4803e', 1.4);
    pawPrint(c, 32, 46, 3.6, '#fff0d0');
    glint(c, 14, 40, 3);
  },
  // silver fish chest: steel blue chest with straps, a fish on the lid and a gold lock
  '🧰': (c) => {
    F(c, rrect(8, 28, 48, 28, 4), '#9fb4cc', 2.2);
    F(c, P((p) => { p.moveTo(8, 30); p.bezierCurveTo(8, 10, 56, 10, 56, 30); p.closePath(); }), '#c8d6e8', 2.2);
    F(c, rect(14, 18, 7, 38), '#7f93ad', 1.6, { shade: false });
    F(c, rect(43, 18, 7, 38), '#7f93ad', 1.6, { shade: false });
    F(c, poly(c, [[24, 40], [34, 34], [42, 40], [34, 46]]), '#5ab4f0', 1.6);
    F(c, poly(c, [[42, 40], [48, 35], [48, 45]]), '#5ab4f0', 1.6);
    dot(c, 30, 39, 1.5, '#2a1c3a');
    F(c, rrect(28, 48, 8, 8, 2), '#ffc83a', 1.6);
    dot(c, 32, 52, 1.2, '#7a4a10');
    glint(c, 18, 22, 3.4); glint(c, 50, 26, 2.6);
  },
  // golden cat chest: gold chest with a red lining, a cat face on the front and jewels, glowing
  '🗃': (c) => {
    halo(c, 32, 34, 30, 'rgba(255,214,90,.75)');
    F(c, rrect(8, 28, 48, 28, 4), '#f0b830', 2.2);
    F(c, P((p) => { p.moveTo(8, 30); p.bezierCurveTo(8, 8, 56, 8, 56, 30); p.closePath(); }), '#ffd860', 2.2);
    F(c, rect(14, 17, 6, 39), '#d9961a', 1.6, { shade: false });
    F(c, rect(44, 17, 6, 39), '#d9961a', 1.6, { shade: false });
    F(c, poly(c, [[24, 36], [26, 28], [31, 33]]), '#fff0d0', 1.4);
    F(c, poly(c, [[40, 36], [38, 28], [33, 33]]), '#fff0d0', 1.4);
    F(c, ell(null, 32, 41, 10, 8.5), '#fff0d0', 1.8);
    dot(c, 28, 40, 1.7, '#2a1c3a'); dot(c, 36, 40, 1.7, '#2a1c3a');
    F(c, poly(c, [[30.5, 43.5], [33.5, 43.5], [32, 45.5]]), '#ff8fb7', 1);
    for (const [x, col] of [[22, '#ee5a6a'], [32, '#5ab4f0'], [42, '#5cc86a']]) F(c, ell(null, x, 20, 3, 3.4), col, 1.2, { shade: false });
    glint(c, 12, 24, 3.6); glint(c, 52, 20, 3); glint(c, 50, 50, 2.6);
  },
};

// ---------------------------------------------------------------- hero drawings: the same boxes with much finer detail, drawn big for the opening screen
const fine = (ctx, pts, col, lw = 0.5) => ln(ctx, pts, col, lw);
const soft = (ctx, x, y, rx, ry, a = 0.28) => { ctx.fillStyle = `rgba(40,24,60,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); };
const grad = (ctx, x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
const rivet = (ctx, x, y, r = 0.9, col = '#e8eef8') => { dot(ctx, x, y, r + 0.45, 'rgba(30,20,50,.55)'); dot(ctx, x, y, r, col); dot(ctx, x - r * 0.3, y - r * 0.3, r * 0.35, 'rgba(255,255,255,.9)'); };
const gem = (ctx, x, y, r, col) => {
  F(ctx, poly(ctx, [[x, y - r], [x + r, y - r * 0.2], [x + r * 0.6, y + r], [x - r * 0.6, y + r], [x - r, y - r * 0.2]]), col, 1.1, { shade: false });
  fine(ctx, [[x - r, y - r * 0.2], [x + r, y - r * 0.2]], 'rgba(255,255,255,.5)', 0.4);
  fine(ctx, [[x, y - r], [x - r * 0.35, y - r * 0.2], [x - r * 0.6, y + r]], 'rgba(255,255,255,.45)', 0.4);
  fine(ctx, [[x, y - r], [x + r * 0.35, y - r * 0.2], [x + r * 0.6, y + r]], 'rgba(0,0,0,.18)', 0.4);
  dot(ctx, x - r * 0.3, y - r * 0.35, r * 0.2, 'rgba(255,255,255,.95)');
};
const catEyes = (ctx, x, y) => {
  ctx.fillStyle = '#ffe27a';
  for (const dx of [-3.2, 3.2]) { ctx.beginPath(); ctx.ellipse(x + dx, y, 1.5, 1.9, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#2a1c3a';
  for (const dx of [-3.2, 3.2]) { ctx.beginPath(); ctx.ellipse(x + dx, y, 0.5, 1.6, 0, 0, TAU); ctx.fill(); }
  dot(ctx, x - 3.6, y - 0.8, 0.4); dot(ctx, x + 2.8, y - 0.8, 0.4);
};
const DETAIL = {
  cardboard: (c) => {
    // dark inside the open top with two eyes peeking out
    c.fillStyle = '#3a2410'; c.beginPath(); c.ellipse(32, 30.5, 19, 3, 0, 0, TAU); c.fill();
    catEyes(c, 32, 30.2);
    c.save(); c.beginPath(); c.rect(10, 30, 44, 26); c.clip();
    c.fillStyle = grad(c, 10, 0, 54, 0, [[0, 'rgba(255,255,255,.14)'], [0.55, 'rgba(255,255,255,0)'], [1, 'rgba(60,30,10,.28)']]); c.fillRect(10, 30, 44, 26);
    for (let x = 12; x < 54; x += 2.1) fine(c, [[x, 31], [x, 37]], 'rgba(120,76,36,.30)', 0.45);
    for (let y = 40; y < 56; y += 3.4) fine(c, [[10, y], [54, y + 0.4]], 'rgba(120,76,36,.14)', 0.4);
    c.restore();
    // tape: gloss, torn edge and a seam
    fine(c, [[29, 38], [29, 55]], 'rgba(255,255,255,.45)', 0.7); fine(c, [[35.4, 38], [35.4, 55]], 'rgba(120,90,40,.25)', 0.5);
    c.fillStyle = '#f2dfae'; c.beginPath(); c.moveTo(27, 56); for (let i = 0; i < 6; i++) c.lineTo(27 + i * 2 + 1, 56 + (i % 2 ? 1.6 : 0)); c.lineTo(37, 56); c.closePath(); c.fill();
    // a shipping label with a cat stamp
    c.save(); c.translate(44.5, 47); c.rotate(-0.08); F(c, rect(-5, -4.5, 10, 9), '#fff8ea', 0.8, { shade: false });
    pawPrint(c, 0, -0.6, 2.1, '#c9552f'); for (const y of [2.4, 3.6]) fine(c, [[-3.6, y], [3.6, y]], '#8a6a4a', 0.4); c.restore();
    // scuffs and corner highlights
    fine(c, [[12, 55], [13.2, 31.5]], 'rgba(255,255,255,.28)', 0.6); fine(c, [[53, 31.5], [51.4, 55]], 'rgba(60,30,10,.25)', 0.6);
    for (const [x, y, x2, y2] of [[15, 52, 19, 51], [47, 34, 50, 33.5], [38, 54, 42, 53.4]]) fine(c, [[x, y], [x2, y2]], 'rgba(255,240,210,.4)', 0.5);
    for (const [x, y] of [[8, 24], [57, 24]]) fine(c, [[x - 1.5, y + 1], [x + 1.5, y - 1]], 'rgba(255,255,255,.35)', 0.5);
  },
  basket: (c) => {
    // a yarn ball and a toy mouse in the blanket
    F(c, ell(null, 42, 29, 4.2, 4.2), '#ff8fb7', 1.2); curve(c, 'rgba(255,255,255,.5)', 0.5, (x) => { x.arc(42, 29, 2.6, 0.4, 3.4); }); curve(c, 'rgba(160,50,90,.5)', 0.5, (x) => { x.arc(42, 29, 3.4, 3.6, 6.1); });
    // blanket stitching
    for (let x = 12; x < 54; x += 3) fine(c, [[x, 31.6], [x + 1.4, 31.9]], 'rgba(255,255,255,.7)', 0.5);
    // the weave: alternating strands with a tiny shadow under each
    c.save(); c.beginPath(); c.moveTo(8, 33); c.lineTo(56, 33); c.lineTo(50, 56); c.quadraticCurveTo(32, 62, 14, 56); c.closePath(); c.clip();
    for (let row = 0; row < 7; row++) { const y = 35 + row * 3.3; for (let col = 0; col < 14; col++) { const x = 8 + col * 3.7 + (row % 2) * 1.85; c.fillStyle = (row + col) % 2 ? 'rgba(255,230,170,.22)' : 'rgba(110,64,20,.22)'; c.fillRect(x, y, 3.2, 2.6); } }
    c.fillStyle = grad(c, 8, 0, 56, 0, [[0, 'rgba(255,255,255,.12)'], [0.6, 'rgba(255,255,255,0)'], [1, 'rgba(60,30,10,.30)']]); c.fillRect(8, 33, 48, 30);
    c.restore();
    // a twisted rope rim and a braided handle
    for (let x = 9; x < 56; x += 2.4) fine(c, [[x, 33.6], [x + 1.2, 31.4]], 'rgba(140,86,30,.55)', 0.7);
    for (let i = 0; i < 9; i++) { const t = i / 8, hx = 14 + 36 * t, hy = 30 - Math.sin(t * Math.PI) * 22.5; fine(c, [[hx - 0.9, hy + 1.1], [hx + 0.9, hy - 1.1]], 'rgba(255,230,160,.55)', 0.6); }
    fine(c, [[18, 24], [22, 17]], 'rgba(255,255,255,.4)', 0.7);
    pawPrint(c, 32, 46, 3.6, '#fff0d0');
  },
  silver: (c) => {
    c.save(); c.beginPath(); c.roundRect(8, 28, 48, 28, 4); c.clip();
    c.fillStyle = grad(c, 8, 28, 56, 56, [[0, 'rgba(255,255,255,.28)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(30,50,90,.32)']]); c.fillRect(8, 28, 48, 28);
    for (let x = 9; x < 56; x += 1.6) fine(c, [[x, 29], [x, 55]], 'rgba(255,255,255,.07)', 0.35);
    c.restore();
    c.save(); c.beginPath(); c.moveTo(8, 30); c.bezierCurveTo(8, 10, 56, 10, 56, 30); c.closePath(); c.clip();
    c.fillStyle = grad(c, 0, 12, 0, 30, [[0, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(8, 10, 48, 20);
    for (const x of [24, 30, 36, 42]) curve(c, 'rgba(90,120,170,.25)', 0.5, (g) => { g.moveTo(x, 12); g.lineTo(x + 0.6, 30); });
    c.restore();
    // riveted straps and an etched row of tiny fish
    for (const x of [17, 47]) for (const y of [22, 31, 41, 51]) rivet(c, x, y, 0.8);
    for (let i = 0; i < 4; i++) { const x = 21 + i * 4.4; fine(c, [[x, 53], [x + 2.2, 51.6], [x + 3.6, 53], [x + 2.2, 54.4], [x, 53]], 'rgba(40,70,120,.45)', 0.4); }
    // a corner bracket and the lock plate with a cat head keyhole
    for (const [x, y] of [[8, 28], [56, 28], [8, 56], [56, 56]]) { dot(c, x, y, 1.9, '#7f93ad'); rivet(c, x + (x < 32 ? 1.6 : -1.6), y + (y < 40 ? 1.6 : -1.6), 0.55); }
    F(c, rrect(27, 46, 10, 11, 2.2), '#ffd860', 1.2); dot(c, 32, 50.6, 1.3, '#4a2c08'); fine(c, [[32, 51.4], [32, 54.6]], '#4a2c08', 1.1);
    F(c, poly(c, [[30.4, 49.4], [30.8, 47.6], [31.8, 48.6]]), '#ffd860', 0.4, { shade: false }); F(c, poly(c, [[33.6, 49.4], [33.2, 47.6], [32.2, 48.6]]), '#ffd860', 0.4, { shade: false });
    gem(c, 32, 20, 2.6, '#5ab4f0');
    glint(c, 20, 18, 3.8); glint(c, 49, 24, 3); glint(c, 12, 46, 2.4);
  },
  golden: (c) => {
    c.save(); c.beginPath(); c.roundRect(8, 28, 48, 28, 4); c.clip();
    c.fillStyle = grad(c, 8, 28, 56, 56, [[0, 'rgba(255,255,255,.4)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(140,70,0,.35)']]); c.fillRect(8, 28, 48, 28);
    // filigree swirls on the front panels
    for (const sx of [-1, 1]) { const x0 = 32 + sx * 15; curve(c, 'rgba(160,92,10,.55)', 0.6, (g) => { g.moveTo(x0, 52); g.bezierCurveTo(x0 + sx * 3, 44, x0 - sx * 2, 38, x0 + sx * 2, 33); }); curve(c, 'rgba(160,92,10,.45)', 0.5, (g) => { g.moveTo(x0 + sx * 2, 33); g.bezierCurveTo(x0 + sx * 5, 34, x0 + sx * 5, 38, x0 + sx * 2, 38); }); curve(c, 'rgba(255,255,255,.4)', 0.4, (g) => { g.moveTo(x0 + 0.5, 52); g.bezierCurveTo(x0 + sx * 3.5, 44, x0 - sx * 1.5, 38, x0 + sx * 2.5, 33); }); }
    for (let x = 9; x < 56; x += 2.6) dot(c, x, 54.6, 0.45, 'rgba(255,248,200,.8)');
    c.restore();
    c.save(); c.beginPath(); c.moveTo(8, 30); c.bezierCurveTo(8, 8, 56, 8, 56, 30); c.closePath(); c.clip();
    c.fillStyle = grad(c, 0, 10, 0, 30, [[0, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(8, 8, 48, 22);
    for (let i = 0; i < 6; i++) curve(c, 'rgba(170,100,10,.3)', 0.45, (g) => { g.moveTo(14 + i * 7.2, 12.5 + Math.abs(i - 2.5) * 1.1); g.lineTo(14.4 + i * 7.2, 29); });
    c.restore();
    for (const x of [17, 47]) for (const y of [20, 29, 40, 50]) rivet(c, x, y, 0.8, '#fff0b0');
    // jewels, a little crown over the cat face relief with whiskers
    gem(c, 22, 20, 2.6, '#ee5a6a'); gem(c, 32, 17.6, 3, '#5ab4f0'); gem(c, 42, 20, 2.6, '#5cc86a');
    F(c, poly(c, [[27, 33], [28.5, 29.6], [30.6, 32.4], [32, 28.6], [33.4, 32.4], [35.5, 29.6], [37, 33]]), '#ffe27a', 0.9);
    dot(c, 28.5, 29.6, 0.7, '#ee5a6a'); dot(c, 32, 28.6, 0.8, '#5ab4f0'); dot(c, 35.5, 29.6, 0.7, '#ee5a6a');
    for (const sx of [-1, 1]) for (const dy of [-1, 0.6]) fine(c, [[32 + sx * 6, 42 + dy], [32 + sx * 13, 41 + dy * 2.4]], 'rgba(255,248,230,.95)', 0.5);
    for (const [x, y, s] of [[10, 18, 3.8], [55, 14, 3.2], [49, 53, 2.8], [12, 52, 2.4], [32, 6, 3], [58, 40, 2.4]]) glint(c, x, y, s);
  },
};
const heroCache = new Map();
// the big picture of a box (a canvas, cached): soft shadow underneath, the base drawing and the fine detail layer
export function boxHero(tier, px = 320) {
  const key = tier + px;
  if (heroCache.has(key)) return heroCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = px;
  const ctx = c.getContext('2d'); ctx.scale(px / 64, px / 64); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  soft(ctx, 32, 58.5, 24, 3.2, 0.25);
  const base = BOX_ICONS[BOX_BY_ID[tier].icon]; if (base) base(ctx);
  const det = DETAIL[tier]; if (det) { try { det(ctx); } catch (e) { /* the fine detail is a bonus: never break the page over it */ } }
  heroCache.set(key, c);
  return c;
}
