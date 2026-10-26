// Drawings for the relics added in the second loot update (commons to mythics): same 64x64 board and cel-shaded style as art_icons.js,
// keyed by the plain character that cats.js uses as the relic's icon. art_icons.js merges RELIC_ICONS into its own table.
// NOTE: keep every drawing on whole lines; never put a // comment in the middle of a line that holds code after it.
import { TAU, INK, mix, cel, ell, poly, star, line } from './art_util.js';

const BOX = [0, 0, 64, 64];
const P = (build) => { const p = new Path2D(); build(p); return p; };
const F = (ctx, path, fill, lw = 2, o = {}) => cel(ctx, path, fill, { box: BOX, lw, ...o });
const circ = (x, y, r) => ell(null, x, y, r, r);
const dot = (ctx, x, y, r, col = 'rgba(255,255,255,.85)') => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const ln = (ctx, pts, col, lw = 2) => line(ctx, pts, col, lw);
const glint = (ctx, x, y, s = 4) => { ctx.fillStyle = '#fff'; ctx.fill(star(x, y, s, s * 0.28, 4)); };
const curve = (ctx, col, lw, fn) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); fn(ctx); ctx.stroke(); };
// a line with a dark outline under it, for thin bones and wires
const wire = (ctx, pts, col, lw) => { ln(ctx, pts, INK, lw + 2.4); ln(ctx, pts, col, lw); };
const rect = (x, y, w, h) => P((p) => { p.rect(x, y, w, h); });
// a soft glow behind the big prizes
const halo = (ctx, x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const heartPath = (x, y, k) => P((p) => { p.moveTo(x, y + k * 0.9); p.bezierCurveTo(x - k * 1.5, y - k * 0.1, x - k * 0.9, y - k * 1.0, x, y - k * 0.3); p.bezierCurveTo(x + k * 0.9, y - k * 1.0, x + k * 1.5, y - k * 0.1, x, y + k * 0.9); p.closePath(); });

const GOLD = '#ffc83a', GOLD2 = '#e8962a', RED = '#ee5a6a', PINK = '#ff8fb7', BLUE = '#5ab4f0', GREEN = '#5cc86a', PURPLE = '#9a6ae0', BROWN = '#b87a48', SILVER = '#cdd6e6', CREAM = '#fff0d0', ORANGE = '#ff9a3a';

export const RELIC_ICONS = {
  // ------------------------------------------------------------ common
  '🍪': (c) => {
    F(c, P((p) => { p.moveTo(8, 52); p.lineTo(18, 18); p.bezierCurveTo(32, 4, 52, 12, 58, 34); p.closePath(); }), '#ffd23f', 2.2);
    curve(c, GOLD2, 5, (x) => { x.moveTo(18, 18); x.bezierCurveTo(32, 4, 52, 12, 58, 34); });
    for (const [x, y, r] of [[26, 32, 3.6], [40, 26, 2.8], [22, 44, 2.6], [44, 40, 3.2]]) dot(c, x, y, r, '#e8a020');
    glint(c, 30, 20, 3.4);
  },
  '🏅': (c) => {
    F(c, circ(32, 32, 23), '#d9884a', 2.4);
    curve(c, '#f0b078', 2.4, (x) => { x.arc(32, 32, 18, 0, TAU); });
    F(c, ell(null, 32, 38, 8, 6), '#b86a30', 1.6, { shade: false });
    for (const [x, y] of [[22, 29], [28.5, 23], [35.5, 23], [42, 29]]) F(c, ell(null, x, y, 3, 3.8), '#b86a30', 1.4, { shade: false });
    curve(c, 'rgba(255,255,255,.7)', 2, (x) => { x.arc(32, 32, 20, 3.5, 4.6); });
    glint(c, 46, 16, 3.4);
  },
  '🪡': (c) => {
    curve(c, RED, 3, (x) => { x.moveTo(50, 11); x.bezierCurveTo(63, 16, 56, 32, 42, 30); x.bezierCurveTo(30, 28, 28, 42, 40, 46); });
    F(c, poly(c, [[47, 5], [54, 9], [18, 57], [12, 58]]), SILVER, 1.8);
    F(c, ell(null, 50.5, 8.5, 1.8, 3.6, 0.55), '#4a3a70', 1, { shade: false });
    ln(c, [[44, 14], [18, 52]], '#ffffff', 1.4);
    glint(c, 15, 52, 3.2);
  },
  '🎾': (c) => {
    F(c, circ(30, 34, 22), '#e8c890', 2.4);
    for (const r of [-0.9, -0.1, 0.7]) curve(c, '#b88a50', 1.8, (x) => { x.ellipse(30, 34, 21, 9, r, 0, TAU); });
    curve(c, '#e8c890', 3.4, (x) => { x.moveTo(46, 50); x.bezierCurveTo(54, 56, 46, 62, 58, 60); });
    glint(c, 20, 22, 4);
  },
  '🌻': (c) => {
    curve(c, '#2e8a3e', 3.4, (x) => { x.moveTo(32, 60); x.bezierCurveTo(30, 44, 34, 30, 32, 12); });
    for (const [y, s] of [[48, 1], [48, -1], [36, 1], [36, -1], [24, 1], [24, -1]]) {
      F(c, ell(null, 32 + s * 10, y, 10, 4.8, s * -0.6), GREEN, 1.7);
      ln(c, [[32 + s * 3, y + 2], [32 + s * 15, y - 5]], '#2e8a3e', 1);
    }
    F(c, ell(null, 32, 10, 5, 7), '#c8a8ff', 1.7);
    for (const [x, y] of [[27, 14], [37, 14]]) F(c, circ(x, y, 3), '#b088f0', 1.4, { shade: false });
    glint(c, 46, 12, 3.4);
  },
  '🧸': (c) => {
    curve(c, PINK, 2.8, (x) => { x.moveTo(11, 42); x.bezierCurveTo(0, 40, 2, 26, 12, 28); });
    F(c, ell(null, 28, 42, 20, 14), '#c8ccd8', 2.2);
    F(c, ell(null, 47, 38, 11, 9), '#c8ccd8', 2.2);
    F(c, circ(40, 26, 7), '#c8ccd8', 2);
    F(c, circ(40, 26, 4), PINK, 1.2, { shade: false });
    F(c, circ(52, 27, 6), '#c8ccd8', 2);
    F(c, circ(52, 27, 3.4), PINK, 1.2, { shade: false });
    dot(c, 57, 38, 2.6, RED); dot(c, 50, 35, 2, '#2a1c3a');
    ln(c, [[57, 41], [63, 43]], '#7a6a8a', 1.2); ln(c, [[57, 39], [63, 37]], '#7a6a8a', 1.2);
    F(c, ell(null, 22, 54, 5, 3), PINK, 1.4); F(c, ell(null, 38, 54, 5, 3), PINK, 1.4);
    glint(c, 24, 34, 3);
  },
  '🪵': (c) => {
    F(c, rect(10, 50, 44, 9), BROWN, 2);
    F(c, rect(25, 14, 14, 37), '#e8c890', 2);
    for (let y = 20; y < 50; y += 6) ln(c, [[25, y], [39, y + 4]], '#b88a50', 1.8);
    F(c, rect(21, 9, 22, 6), BROWN, 2);
    ln(c, [[44, 22], [49, 34]], '#8a5a30', 1.4); ln(c, [[47, 21], [52, 33]], '#8a5a30', 1.4);
    glint(c, 18, 40, 3);
  },
  '🧲': (c) => {
    F(c, poly(c, [[50, 32], [61, 21], [58, 32], [61, 43]]), CREAM, 1.8);
    for (const x of [20, 27, 34, 41]) { wire(c, [[x, 32], [x + 5, 19]], CREAM, 2.2); wire(c, [[x, 32], [x + 5, 45]], CREAM, 2.2); }
    wire(c, [[14, 32], [52, 32]], CREAM, 3.2);
    F(c, ell(null, 11, 32, 9, 7), CREAM, 2);
    dot(c, 9, 30, 2.2, '#2a1c3a');
    glint(c, 24, 24, 3);
  },
  '🪀': (c) => {
    curve(c, INK, 8.4, (x) => { x.ellipse(32, 26, 22, 14, 0, 0, TAU); });
    curve(c, RED, 5.6, (x) => { x.ellipse(32, 26, 22, 14, 0, 0, TAU); });
    F(c, rect(27, 36, 10, 6), GOLD2, 1.6);
    F(c, circ(32, 50, 10), GOLD, 2.2);
    ln(c, [[23, 52], [41, 52]], INK, 1.8); dot(c, 32, 57, 2, INK);
    curve(c, 'rgba(255,255,255,.8)', 2, (x) => { x.arc(32, 50, 7, 3.4, 4.5); });
    glint(c, 52, 14, 3.4);
  },
  '🌟': (c) => {
    F(c, star(32, 32, 29, 17, 10, 0.1), '#ffe08a', 2);
    F(c, circ(32, 32, 14), GOLD, 2.4);
    curve(c, 'rgba(255,255,255,.75)', 2.2, (x) => { x.arc(32, 32, 9, 3.5, 4.7); });
    glint(c, 24, 24, 3.6);
  },
  '⭐': (c) => {
    F(c, poly(c, [[16, 3], [31, 26], [25, 32], [10, 10]]), RED, 1.8);
    F(c, poly(c, [[48, 3], [33, 26], [39, 32], [54, 10]]), BLUE, 1.8);
    F(c, circ(32, 42, 19), GOLD, 2.4);
    curve(c, GOLD2, 2.2, (x) => { x.arc(32, 42, 14, 0, TAU); });
    F(c, star(32, 42, 11, 5, 5), '#fff3b0', 1.6);
    for (const [x, y, r] of [[22, 50, 2.2], [42, 52, 1.8], [38, 34, 1.6]]) dot(c, x, y, r, 'rgba(120,100,80,.45)');
  },
  '🪁': (c) => {
    F(c, P((p) => { for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, r = i % 2 ? 20 : 25, x = 32 + Math.cos(a) * r, y = 34 + Math.sin(a) * r; if (i) p.lineTo(x, y); else p.moveTo(x, y); } p.closePath(); }), '#a89a8c', 2);
    for (const r of [0.5, 1.4, 2.4]) curve(c, '#7a6a5c', 1.6, (x) => { x.ellipse(32, 34, 17, 8, r, 0, TAU); });
    curve(c, '#a89a8c', 2.2, (x) => { x.moveTo(54, 22); x.bezierCurveTo(62, 14, 60, 6, 56, 4); });
    dot(c, 26, 34, 3, '#fff'); dot(c, 38, 34, 3, '#fff'); dot(c, 27, 35, 1.6, '#2a1c3a'); dot(c, 39, 35, 1.6, '#2a1c3a');
    ln(c, [[28, 42], [36, 42]], '#4a3a3a', 1.6);
  },
  '🥄': (c) => {
    F(c, rect(22, 49, 20, 6), SILVER, 2);
    F(c, P((p) => { p.moveTo(7, 27); p.bezierCurveTo(9, 54, 55, 54, 57, 27); p.closePath(); }), SILVER, 2.4);
    F(c, ell(null, 32, 27, 25, 8), '#e8eef8', 2);
    F(c, ell(null, 32, 28, 20, 5), '#9aa8c0', 1.2, { shade: false });
    F(c, ell(null, 30, 41, 7, 3.4), BLUE, 1.2, { shade: false });
    F(c, poly(c, [[37, 41], [43, 37], [43, 45]]), BLUE, 1.2, { shade: false });
    curve(c, 'rgba(255,255,255,.85)', 2.2, (x) => { x.moveTo(12, 34); x.bezierCurveTo(14, 42, 20, 47, 26, 48); });
    glint(c, 52, 16, 3.4);
  },
  '🏓': (c) => {
    ln(c, [[3, 24], [17, 24]], '#9ad0ff', 2.6); ln(c, [[1, 32], [15, 32]], '#9ad0ff', 2.6); ln(c, [[5, 40], [17, 40]], '#9ad0ff', 2.6);
    F(c, circ(40, 32, 19), '#fff5e0', 2.4);
    curve(c, 'rgba(255,255,255,.9)', 2.4, (x) => { x.arc(40, 32, 14, 3.6, 4.8); });
    curve(c, '#ffb070', 1.6, (x) => { x.arc(40, 32, 15, 0.2, 1.4); });
    glint(c, 54, 14, 3.6);
  },

  // ------------------------------------------------------------ rare
  '💀': (c) => {
    for (const s of [-1, 1]) { wire(c, [[32 + s * 12, 38], [32 + s * 28, 34]], '#e8e4f0', 1.6); wire(c, [[32 + s * 12, 42], [32 + s * 27, 46]], '#e8e4f0', 1.6); }
    F(c, poly(c, [[19, 22], [18, 7], [30, 15]]), '#f4f0e8', 1.8);
    F(c, poly(c, [[45, 22], [46, 7], [34, 15]]), '#f4f0e8', 1.8);
    F(c, circ(32, 31, 16), '#f4f0e8', 2.2);
    F(c, ell(null, 32, 47, 10, 7), '#f4f0e8', 2);
    for (const x of [25, 39]) F(c, ell(null, x, 31, 4.4, 5.4), '#2a1c3a', 1.2, { shade: false });
    F(c, poly(c, [[32, 37], [29, 42], [35, 42]]), '#2a1c3a', 1, { shade: false });
    for (const x of [27, 32, 37]) ln(c, [[x, 45], [x, 51]], '#8a7a88', 1.3);
    glint(c, 50, 12, 3.4);
  },
  '🏺': (c) => {
    F(c, poly(c, [[12, 22], [20, 8], [28, 20]]), PINK, 1.8);
    F(c, poly(c, [[36, 20], [44, 8], [52, 22]]), PINK, 1.8);
    for (const x of [18, 42]) F(c, rect(x, 48, 9, 11), '#ff7aa8', 1.8);
    F(c, ell(null, 30, 36, 22, 17), PINK, 2.4);
    F(c, ell(null, 52, 38, 8, 7), '#ff7aa8', 2);
    for (const x of [50, 55]) dot(c, x, 38, 1.4, '#9a2a50');
    dot(c, 44, 32, 2.2, '#2a1c3a');
    curve(c, '#ff7aa8', 2.6, (x) => { x.moveTo(8, 32); x.bezierCurveTo(0, 26, 4, 18, 11, 22); });
    ln(c, [[20, 20], [36, 20]], '#7a2a4a', 2.4);
    F(c, circ(28, 10, 6), GOLD, 1.8);
    curve(c, GOLD2, 1.4, (x) => { x.arc(28, 10, 3, 0, TAU); });
    glint(c, 14, 36, 3.4);
  },
  '🪤': (c) => {
    F(c, P((p) => { p.moveTo(20, 8); p.lineTo(42, 8); p.lineTo(42, 34); p.bezierCurveTo(52, 36, 60, 42, 58, 52); p.bezierCurveTo(56, 60, 34, 58, 26, 57); p.bezierCurveTo(14, 54, 20, 42, 20, 34); p.closePath(); }), '#8ac8ff', 2.2);
    F(c, rect(19, 6, 24, 8), '#ffffff', 1.8);
    for (const y of [20, 28]) ln(c, [[21, y], [41, y]], '#ffffff', 3);
    F(c, ell(null, 50, 52, 8, 5), PINK, 1.4, { shade: false });
    F(c, poly(c, [[52, 3], [43, 19], [50, 19], [42, 33], [58, 14], [51, 14]]), GOLD, 1.8);
    glint(c, 12, 22, 3.2); glint(c, 58, 30, 2.6);
  },
  '🍄': (c) => {
    F(c, P((p) => { p.moveTo(22, 34); p.bezierCurveTo(22, 46, 24, 54, 22, 58); p.lineTo(42, 58); p.bezierCurveTo(40, 54, 42, 46, 42, 34); p.closePath(); }), CREAM, 2);
    F(c, P((p) => { p.moveTo(6, 36); p.bezierCurveTo(4, 8, 60, 8, 58, 36); p.bezierCurveTo(44, 40, 20, 40, 6, 36); p.closePath(); }), '#b05ad8', 2.4);
    for (const [x, y, r] of [[20, 24, 4.4], [34, 18, 3.4], [46, 26, 4], [30, 31, 2.6]]) F(c, circ(x, y, r), '#fff5ff', 1.2, { shade: false });
    for (const [x, y, r] of [[8, 14, 2], [56, 10, 2.4], [60, 24, 1.6], [4, 28, 1.8]]) dot(c, x, y, r, '#9ae88a');
    glint(c, 12, 12, 3);
  },
  '🪣': (c) => {
    F(c, ell(null, 12, 30, 4.5, 4.5), '#5a6478', 1.8); F(c, ell(null, 52, 30, 4.5, 4.5), '#5a6478', 1.8);
    F(c, P((p) => { p.moveTo(7, 28); p.bezierCurveTo(9, 54, 55, 54, 57, 28); p.closePath(); }), '#7a8498', 2.4);
    F(c, ell(null, 32, 28, 25, 8), '#a8b2c6', 2);
    F(c, ell(null, 32, 29, 20, 5), '#3a4458', 1.2, { shade: false });
    for (const x of [12, 22, 32, 42, 52]) dot(c, x, 31, 1.6, '#d8dff0');
    F(c, P((p) => { p.moveTo(24, 38); p.lineTo(40, 38); p.lineTo(40, 46); p.bezierCurveTo(40, 52, 32, 54, 32, 54); p.bezierCurveTo(32, 54, 24, 52, 24, 46); p.closePath(); }), BLUE, 1.6, { shade: false });
    glint(c, 15, 40, 3.2);
  },
  '🧨': (c) => {
    F(c, rect(16, 26, 13, 30), RED, 2); F(c, rect(35, 26, 13, 30), RED, 2);
    F(c, rect(25, 20, 14, 38), '#ff7a8a', 2);
    for (const [x, w] of [[16, 13], [25, 14], [35, 13]]) { ln(c, [[x, 32], [x + w, 32]], GOLD, 2.4); ln(c, [[x, 50], [x + w, 50]], GOLD, 2.4); }
    curve(c, '#8a5a30', 2.2, (x) => { x.moveTo(32, 20); x.bezierCurveTo(30, 12, 42, 10, 42, 4); });
    F(c, star(44, 5, 6, 2.6, 5), GOLD, 1.4);
    glint(c, 20, 38, 3);
  },
  '🎈': (c) => {
    ln(c, [[13, 4], [13, 60]], INK, 4.4); ln(c, [[13, 4], [13, 60]], BROWN, 2.4);
    dot(c, 13, 4, 3.2, GOLD);
    F(c, P((p) => { p.moveTo(15, 8); p.lineTo(58, 8); p.lineTo(50, 20); p.lineTo(58, 32); p.lineTo(15, 32); p.closePath(); }), '#ffd23f', 2.2);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; F(c, ell(null, 34 + Math.cos(a) * 7, 20 + Math.sin(a) * 7, 3.4, 1.8, a), GOLD2, 1, { shade: false }); }
    F(c, circ(34, 20, 4.6), BROWN, 1.4, { shade: false });
    glint(c, 22, 13, 3);
  },
  '🎐': (c) => {
    F(c, rect(8, 6, 48, 6), BROWN, 2);
    for (const [x, h] of [[13, 30], [25, 40], [37, 28], [48, 36]]) {
      ln(c, [[x + 3, 12], [x + 3, 16]], INK, 1.6);
      F(c, rect(x, 16, 7, h), '#5ad0c8', 1.8);
      ln(c, [[x + 2, 19], [x + 2, 16 + h - 4]], 'rgba(255,255,255,.7)', 1.4);
    }
    ln(c, [[32, 12], [32, 52]], INK, 1.4);
    F(c, circ(32, 55, 4.4), GOLD, 1.8);
    glint(c, 56, 24, 3);
  },
  // ------------------------------------------------------------ epic
  '🥠': (c) => {
    F(c, P((p) => { p.moveTo(4, 38); p.bezierCurveTo(0, 10, 34, 4, 54, 24); p.bezierCurveTo(62, 34, 56, 54, 40, 54); p.bezierCurveTo(24, 54, 8, 52, 4, 38); p.closePath(); }), '#f0b860', 2.4);
    F(c, P((p) => { p.moveTo(10, 40); p.bezierCurveTo(20, 24, 40, 22, 52, 34); p.bezierCurveTo(40, 36, 24, 40, 18, 50); p.closePath(); }), '#c8801e', 1.6, { shade: false });
    F(c, poly(c, [[26, 38], [59, 25], [61, 34], [30, 46]]), '#ffffff', 1.8);
    ln(c, [[34, 38], [55, 30]], '#e05a6a', 1.4); ln(c, [[36, 42], [57, 34]], '#e05a6a', 1.4);
    curve(c, 'rgba(255,255,255,.55)', 2.2, (x) => { x.moveTo(8, 30); x.bezierCurveTo(12, 20, 20, 14, 30, 13); });
    glint(c, 52, 10, 3.6);
  },
  '🧿': (c) => {
    curve(c, 'rgba(154,106,224,.55)', 5, (x) => { x.arc(32, 32, 28, 0.4, 2.6); });
    curve(c, 'rgba(154,106,224,.55)', 5, (x) => { x.arc(32, 32, 28, 3.5, 5.7); });
    F(c, ell(null, 12, 34, 5, 11, 0.3), '#e8cfa0', 1.8); F(c, ell(null, 52, 34, 5, 11, -0.3), '#e8cfa0', 1.8);
    F(c, rect(24, 26, 16, 22), '#e8cfa0', 2);
    F(c, rect(24, 46, 7, 13), '#e8cfa0', 1.8); F(c, rect(33, 46, 7, 13), '#e8cfa0', 1.8);
    F(c, circ(32, 16, 11), '#e8cfa0', 2.2);
    for (const x of [28, 36]) { dot(c, x, 14, 2.6, '#2a1c3a'); ln(c, [[x - 1, 13], [x + 1, 15]], '#e8cfa0', 0.8); }
    for (let i = 0; i < 3; i++) ln(c, [[27 + i * 4, 20], [27 + i * 4, 23]], '#7a4a30', 1.2);
    ln(c, [[26, 21.5], [38, 21.5]], '#7a4a30', 1.2);
    ln(c, [[29, 34], [35, 40]], '#7a4a30', 1.2); ln(c, [[35, 34], [29, 40]], '#7a4a30', 1.2);
    wire(c, [[46, 28], [36, 38]], SILVER, 1.4); dot(c, 47, 27, 3, RED);
  },
  '🕯': (c) => {
    curve(c, INK, 5, (x) => { x.arc(32, 10, 7, Math.PI, TAU); });
    curve(c, GOLD2, 2.6, (x) => { x.arc(32, 10, 7, Math.PI, TAU); });
    F(c, poly(c, [[20, 16], [44, 16], [46, 22], [18, 22]]), '#6a5a8a', 2);
    F(c, P((p) => { p.moveTo(19, 22); p.lineTo(45, 22); p.lineTo(43, 48); p.lineTo(21, 48); p.closePath(); }), '#ffd070', 2.2);
    F(c, P((p) => { p.moveTo(32, 27); p.bezierCurveTo(42, 36, 38, 46, 32, 46); p.bezierCurveTo(26, 46, 22, 36, 32, 27); p.closePath(); }), ORANGE, 1.6);
    F(c, P((p) => { p.moveTo(32, 34); p.bezierCurveTo(37, 39, 35, 45, 32, 45); p.bezierCurveTo(29, 45, 27, 39, 32, 34); p.closePath(); }), '#fff3b0', 1, { shade: false });
    ln(c, [[27, 22], [27, 48]], 'rgba(106,90,138,.7)', 1.4); ln(c, [[37, 22], [37, 48]], 'rgba(106,90,138,.7)', 1.4);
    F(c, poly(c, [[18, 48], [46, 48], [44, 55], [20, 55]]), '#6a5a8a', 2);
    glint(c, 52, 16, 3.4);
  },
  '🥁': (c) => {
    wire(c, [[10, 6], [38, 24]], '#e8c890', 2.4); wire(c, [[54, 6], [26, 24]], '#e8c890', 2.4);
    dot(c, 10, 6, 3.6, '#e8c890'); dot(c, 54, 6, 3.6, '#e8c890');
    F(c, rect(8, 26, 48, 28), RED, 2.4);
    for (let i = 0; i < 4; i++) { ln(c, [[8 + i * 12, 28], [20 + i * 12, 52]], '#e8c890', 1.8); ln(c, [[20 + i * 12, 28], [8 + i * 12, 52]], '#e8c890', 1.8); }
    F(c, ell(null, 32, 26, 24, 7), '#fff3d8', 2.2);
    F(c, ell(null, 32, 54, 24, 6), GOLD2, 2);
    glint(c, 16, 24, 3);
  },
  '🔱': (c) => {
    wire(c, [[54, 3], [38, 19], [47, 22], [31, 36]], '#fff3a0', 4.6);
    F(c, rect(28.5, 40, 7, 16), GOLD2, 2);
    F(c, poly(c, [[32, 28], [37, 42], [27, 42]]), SILVER, 2);
    F(c, rect(23, 54, 18, 6), '#6a5a8a', 2);
    for (const [x, y] of [[12, 20], [52, 44], [12, 48]]) glint(c, x, y, 3.2);
  },

  // ------------------------------------------------------------ legendary
  '🪞': (c) => {
    halo(c, 32, 38, 30, 'rgba(255,214,90,.7)');
    curve(c, INK, 4.6, (x) => { x.moveTo(8, 2); x.quadraticCurveTo(14, 22, 32, 20); x.quadraticCurveTo(50, 22, 56, 2); });
    curve(c, GOLD2, 2.4, (x) => { x.moveTo(8, 2); x.quadraticCurveTo(14, 22, 32, 20); x.quadraticCurveTo(50, 22, 56, 2); });
    F(c, heartPath(32, 40, 21), GOLD, 2.6);
    F(c, heartPath(32, 41, 14.5), '#fff3d8', 1.6, { shade: false });
    F(c, circ(32, 43, 7), '#2a1c3a', 1.2, { shade: false });
    F(c, poly(c, [[26, 40], [26, 33], [32, 37]]), '#2a1c3a', 1, { shade: false });
    F(c, poly(c, [[38, 40], [38, 33], [32, 37]]), '#2a1c3a', 1, { shade: false });
    for (const x of [29.5, 34.5]) F(c, ell(null, x, 43, 1.5, 2.2), '#ffe35a', 0.6, { shade: false });
    dot(c, 32, 21, 3.2, RED);
    glint(c, 16, 28, 3.6); glint(c, 50, 54, 3);
  },
  '⚗': (c) => {
    halo(c, 32, 36, 30, 'rgba(255,170,70,.55)');
    F(c, P((p) => { p.moveTo(14, 16); p.bezierCurveTo(5, 30, 5, 46, 14, 58); p.lineTo(50, 58); p.bezierCurveTo(59, 46, 59, 30, 50, 16); p.closePath(); }), BROWN, 2.4);
    F(c, ell(null, 32, 16, 18, 5.4), '#8a5a30', 2);
    for (const x of [24, 32, 40]) ln(c, [[x, 22], [x + (x - 32) * 0.1, 56]], 'rgba(60,30,10,.4)', 1.4);
    for (const y of [26, 50]) curve(c, INK, 5.4, (x) => { x.moveTo(9, y); x.quadraticCurveTo(32, y + 6, 55, y); });
    for (const y of [26, 50]) curve(c, GOLD, 3.2, (x) => { x.moveTo(9, y); x.quadraticCurveTo(32, y + 6, 55, y); });
    F(c, star(32, 40, 7, 3.2, 5), '#fff3b0', 1.4);
    curve(c, '#4a3a30', 2.4, (x) => { x.moveTo(32, 12); x.bezierCurveTo(30, 6, 40, 4, 40, -1); });
    F(c, star(42, 3, 6, 2.6, 5), ORANGE, 1.2);
    glint(c, 14, 34, 3.2);
  },
  '🪄': (c) => {
    halo(c, 34, 32, 30, 'rgba(150,200,255,.6)');
    for (let k = 2; k >= 0; k--) {
      c.save(); c.globalAlpha = [1, 0.5, 0.26][k];
      const dx = k * 10;
      for (const [dy, bend] of [[-16, 8], [0, 0], [16, -8]]) {
        const pts = (x) => { x.moveTo(10 + dx, 32); x.bezierCurveTo(20 + dx, 32 + bend, 30 + dx, 32 + dy * 0.7, 42 + dx, 32 + dy); };
        if (k === 0) curve(c, INK, 7.4, pts);
        curve(c, k === 0 ? '#f4faff' : '#9cc8ff', 4.6, pts);
      }
      c.restore();
    }
    F(c, poly(c, [[2, 26], [13, 26], [7.5, 36]]), PINK, 1.8);
    glint(c, 54, 8, 3.8); glint(c, 56, 54, 3.2);
  },
  '🗝': (c) => {
    halo(c, 36, 24, 30, 'rgba(160,190,255,.6)');
    wire(c, [[8, 60], [40, 12]], BROWN, 4);
    F(c, P((p) => { p.moveTo(36, 8); p.bezierCurveTo(66, 0, 64, 40, 34, 42); p.bezierCurveTo(52, 34, 54, 16, 36, 8); p.closePath(); }), '#d8e6ff', 2.4);
    curve(c, 'rgba(255,255,255,.85)', 2, (x) => { x.moveTo(40, 12); x.bezierCurveTo(54, 10, 58, 28, 44, 36); });
    glint(c, 56, 8, 3.8); glint(c, 20, 30, 3);
  },
  '🍯': (c) => {
    halo(c, 32, 34, 31, 'rgba(255,214,90,.75)');
    F(c, ell(null, 32, 43, 16, 13), GOLD, 2.4);
    for (const [x, y, rot] of [[13, 29, -0.45], [24, 18, -0.12], [40, 18, 0.12], [51, 29, 0.45]]) F(c, ell(null, x, y, 6.6, 8.6, rot), GOLD, 2.2);
    ln(c, [[21, 38], [43, 38]], 'rgba(255,255,255,.0)', 1);
    curve(c, 'rgba(255,255,255,.8)', 2.2, (x) => { x.moveTo(20, 46); x.bezierCurveTo(22, 40, 28, 38, 34, 38); });
    for (const [x, y] of [[24, 14], [11, 24]]) dot(c, x, y, 1.8, 'rgba(255,255,255,.85)');
    glint(c, 54, 12, 4); glint(c, 8, 52, 3.2);
  },
  '🌈': (c) => {
    halo(c, 30, 34, 30, 'rgba(255,200,230,.55)');
    F(c, circ(30, 34, 21), '#fff5ec', 2.4);
    c.save(); c.clip(circ(30, 34, 20));
    ['#ff5a6a', '#ff9a3a', '#ffd23f', '#5cc86a', '#5ab4f0', '#9a6ae0'].forEach((col, i) => curve(c, col, 6.2, (x) => { x.moveTo(4, 8 + i * 7.4); x.quadraticCurveTo(30, 26 + i * 7.4, 58, 8 + i * 7.4 + 6); }));
    c.restore();
    curve(c, '#6a4a5a', 2.4, (x) => { x.arc(30, 34, 21, 0, TAU); });
    curve(c, '#ff5a6a', 3.4, (x) => { x.moveTo(46, 50); x.lineTo(52, 58); });
    curve(c, '#ffd23f', 3.4, (x) => { x.moveTo(52, 58); x.lineTo(58, 52); });
    curve(c, '#5ab4f0', 3.4, (x) => { x.moveTo(58, 52); x.lineTo(62, 60); });
    glint(c, 20, 22, 4); glint(c, 54, 14, 3.2);
  },
  // ------------------------------------------------------------ mythic
  '🧷': (c) => {
    halo(c, 32, 30, 32, 'rgba(255,214,90,.8)');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ln(c, [[32 + Math.cos(a) * 24, 30 + Math.sin(a) * 24], [32 + Math.cos(a) * 31, 30 + Math.sin(a) * 31]], 'rgba(255,230,140,.9)', 1.6); }
    F(c, poly(c, [[8, 44], [8, 8], [26, 28]]), GOLD, 2.2); F(c, poly(c, [[56, 44], [56, 8], [38, 28]]), GOLD, 2.2);
    F(c, poly(c, [[12, 38], [12, 16], [22, 28]]), PINK, 1.2, { shade: false }); F(c, poly(c, [[52, 38], [52, 16], [42, 28]]), PINK, 1.2, { shade: false });
    F(c, poly(c, [[22, 40], [26, 10], [32, 24], [38, 10], [42, 40]]), GOLD, 2.2);
    F(c, rect(8, 40, 48, 14), GOLD, 2.4);
    ln(c, [[10, 44], [54, 44]], 'rgba(255,255,255,.55)', 1.6);
    F(c, circ(32, 28, 4.4), RED, 1.6); dot(c, 31, 27, 1.2, '#fff');
    for (const [x, col] of [[16, BLUE], [26, GREEN], [38, GREEN], [48, BLUE]]) F(c, circ(x, 48, 3), col, 1.2, { shade: false });
    F(c, circ(32, 48, 3.6), RED, 1.2, { shade: false });
    glint(c, 12, 6, 3.6); glint(c, 56, 4, 3);
  },
  '⌛': (c) => {
    halo(c, 32, 32, 32, 'rgba(160,140,255,.65)');
    const lem = (x) => { for (let i = 0; i <= 60; i++) { const t = (i / 60) * TAU, d = 1 + Math.sin(t) * Math.sin(t), px = 32 + 26 * Math.cos(t) / d, py = 32 + 24 * Math.sin(t) * Math.cos(t) / d; if (i) x.lineTo(px, py); else x.moveTo(px, py); } };
    curve(c, INK, 9, lem);
    const g = c.createLinearGradient(6, 0, 58, 0); g.addColorStop(0, '#7ad8ff'); g.addColorStop(0.5, '#e8c8ff'); g.addColorStop(1, '#c08aff');
    curve(c, g, 6, lem);
    F(c, circ(32, 32, 10), '#fff8e8', 2.2);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ln(c, [[32 + Math.cos(a) * 7.4, 32 + Math.sin(a) * 7.4], [32 + Math.cos(a) * 8.8, 32 + Math.sin(a) * 8.8]], INK, 1); }
    ln(c, [[32, 32], [32, 26]], INK, 1.8); ln(c, [[32, 32], [37, 34]], INK, 1.8);
    glint(c, 10, 12, 3.6); glint(c, 56, 52, 3.4);
  },
  '📜': (c) => {
    halo(c, 32, 34, 32, 'rgba(255,120,160,.7)');
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; ln(c, [[32 + Math.cos(a) * 25, 36 + Math.sin(a) * 25], [32 + Math.cos(a) * 31, 36 + Math.sin(a) * 31]], 'rgba(255,200,220,.9)', 1.6); }
    F(c, poly(c, [[12, 28], [12, 8], [28, 20]]), GOLD, 2.2); F(c, poly(c, [[52, 28], [52, 8], [36, 20]]), GOLD, 2.2);
    F(c, poly(c, [[16, 24], [16, 14], [24, 20]]), PINK, 1.2, { shade: false }); F(c, poly(c, [[48, 24], [48, 14], [40, 20]]), PINK, 1.2, { shade: false });
    F(c, heartPath(32, 38, 22), '#ff4a78', 2.8);
    F(c, ell(null, 32, 44, 6.4, 5), '#ffd0dc', 1.2, { shade: false });
    for (const [x, y] of [[23.5, 36], [29, 31], [35, 31], [40.5, 36]]) F(c, ell(null, x, y, 2.4, 3.2), '#ffd0dc', 1.1, { shade: false });
    curve(c, 'rgba(255,255,255,.8)', 2.4, (x) => { x.moveTo(14, 38); x.bezierCurveTo(14, 30, 20, 24, 27, 24); });
    glint(c, 50, 54, 3.6); glint(c, 8, 54, 3);
  },
};
