// Hand-built icon set (no emoji, no image files): every item, snack, building, route and badge is drawn on a 64x64 board in
// the same fine-line, cel-shaded style as the cats. `iconCanvas(key)` serves the canvas games and `installGlyphs(root)`
// swaps any known emoji in the page for its drawn icon, so data files can keep using plain characters as ids.
import { TAU, INK, mix, shade, lineOf, cel, ell, poly, star, line } from './art_util.js';
import { RELIC_ICONS } from './art_relics.js';

const BOX = [0, 0, 64, 64];
const P = (build) => { const p = new Path2D(); build(p); return p; };
const F = (ctx, path, fill, lw = 2, o = {}) => cel(ctx, path, fill, { box: BOX, lw, ...o });
const circ = (x, y, r) => ell(null, x, y, r, r);
const dot = (ctx, x, y, r, col = 'rgba(255,255,255,.85)') => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const ln = (ctx, pts, col, lw = 2) => line(ctx, pts, col, lw);
const glint = (ctx, x, y, s = 4) => { ctx.fillStyle = '#fff'; ctx.fill(star(x, y, s, s * 0.28, 4)); };
const curve = (ctx, col, lw, fn) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); fn(ctx); ctx.stroke(); };

const GOLD = '#ffc83a', GOLD2 = '#e8962a', RED = '#ee5a6a', PINK = '#ff8fb7', BLUE = '#5ab4f0', GREEN = '#5cc86a', PURPLE = '#9a6ae0', BROWN = '#b87a48', SILVER = '#cdd6e6', CREAM = '#fff0d0', ORANGE = '#ff9a3a';

// ---- little building blocks
function sack(ctx, col, mark) {
  F(ctx, P((p) => { p.moveTo(22, 20); p.bezierCurveTo(10, 32, 8, 56, 32, 58); p.bezierCurveTo(56, 56, 54, 32, 42, 20); p.closePath(); }), col, 2);
  F(ctx, P((p) => { p.moveTo(21, 14); p.lineTo(30, 20); p.lineTo(32, 12); p.lineTo(34, 20); p.lineTo(43, 14); p.lineTo(42, 22); p.lineTo(22, 22); p.closePath(); }), mix(col, '#fff', 0.2), 1.8);
  if (mark) mark(ctx);
}
function heart(ctx, x, y, s, col, lw = 2) {
  F(ctx, P((p) => { p.moveTo(x, y + s * 0.9); p.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.9, y - s * 1.0, x, y - s * 0.3); p.bezierCurveTo(x + s * 0.9, y - s * 1.0, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); p.closePath(); }), col, lw);
}
function fishShape(ctx, body, fin, stripe) {
  F(ctx, P((p) => { p.moveTo(48, 32); p.lineTo(60, 20); p.lineTo(58, 32); p.lineTo(60, 44); p.closePath(); }), fin, 1.8);
  F(ctx, P((p) => { p.moveTo(8, 32); p.bezierCurveTo(16, 14, 40, 14, 50, 32); p.bezierCurveTo(40, 50, 16, 50, 8, 32); p.closePath(); }), body, 2);
  if (stripe) for (const x of [24, 33, 41]) ln(ctx, [[x, 21], [x + 2, 43]], stripe, 2.2);
  dot(ctx, 18, 28, 3.4, '#fff'); dot(ctx, 18.6, 28.2, 1.7, INK);
}
function gear(ctx, x, y, r, col) {
  const p = new Path2D();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rr = i % 2 ? r * 0.8 : r; const sx = x + Math.cos(a - 0.1) * rr, sy = y + Math.sin(a - 0.1) * rr; i ? p.lineTo(sx, sy) : p.moveTo(sx, sy); p.lineTo(x + Math.cos(a + 0.1) * rr, y + Math.sin(a + 0.1) * rr); }
  p.closePath(); F(ctx, p, col, 2);
  F(ctx, circ(x, y, r * 0.38), '#6a5a8a', 1.6);
}
function bell(ctx, col) {
  F(ctx, P((p) => { p.moveTo(14, 46); p.bezierCurveTo(16, 40, 14, 14, 32, 12); p.bezierCurveTo(50, 14, 48, 40, 50, 46); p.closePath(); }), col, 2);
  F(ctx, P((p) => { p.rect(10, 44, 44, 7); }), mix(col, '#000', 0.12), 1.8);
  F(ctx, circ(32, 55, 5), mix(col, '#a06a10', 0.4), 1.6);
  F(ctx, circ(32, 10, 3.5), mix(col, '#fff', 0.3), 1.5);
  glint(ctx, 23, 24, 4);
}
function crown(ctx, x, y, w, col) {
  F(ctx, P((p) => { p.moveTo(x - w, y + w * 0.7); p.lineTo(x - w * 1.05, y - w * 0.5); p.lineTo(x - w * 0.5, y); p.lineTo(x, y - w * 0.8); p.lineTo(x + w * 0.5, y); p.lineTo(x + w * 1.05, y - w * 0.5); p.lineTo(x + w, y + w * 0.7); p.closePath(); }), col, 1.8);
  dot(ctx, x, y + w * 0.1, w * 0.17, RED);
}
function note(ctx, x, y, col) {
  F(ctx, ell(null, x, y, 9, 6.5, -0.4), col, 2);
  ctx.strokeStyle = lineOf(col); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 7, y - 2); ctx.lineTo(x + 7, y - 30); ctx.stroke();
}
function flame(ctx, x, y, s, a, b) {
  F(ctx, P((p) => { p.moveTo(x, y - s * 1.3); p.bezierCurveTo(x + s * 0.2, y - s * 0.6, x + s * 1.1, y - s * 0.4, x + s * 0.9, y + s * 0.5); p.bezierCurveTo(x + s * 0.7, y + s * 1.1, x - s * 0.7, y + s * 1.1, x - s * 0.9, y + s * 0.4); p.bezierCurveTo(x - s * 1.1, y - s * 0.2, x - s * 0.2, y - s * 0.5, x, y - s * 1.3); p.closePath(); }), a, 2);
  F(ctx, P((p) => { p.moveTo(x, y - s * 0.2); p.bezierCurveTo(x + s * 0.5, y + s * 0.2, x + s * 0.6, y + s * 0.5, x + s * 0.3, y + s * 0.75); p.bezierCurveTo(x, y + s * 0.95, x - s * 0.5, y + s * 0.8, x - s * 0.5, y + s * 0.4); p.bezierCurveTo(x - s * 0.5, y + s * 0.1, x - s * 0.1, y, x, y - s * 0.2); p.closePath(); }), b, 1.4, { shade: false });
}

// ---- the icons, keyed by the character the data files use (variation selectors are stripped)
const D = {
  '🪙': (c) => { F(c, circ(32, 32, 24), GOLD, 2.2); F(c, circ(32, 32, 17), GOLD2, 1.4, { shade: false }); F(c, circ(32, 32, 15), shade(GOLD, 0.15), 1, { shade: false }); c.fillStyle = mix(GOLD2, INK, 0.2); for (const [x, y, r] of [[32, 36, 5], [24, 28, 2.6], [32, 24, 2.6], [40, 28, 2.6]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); } glint(c, 20, 20, 4.5); },
  '💎': (c) => { F(c, poly(c, [[10, 24], [20, 10], [44, 10], [54, 24], [32, 56]]), '#6ad6f0', 2.2); ln(c, [[10, 24], [54, 24]], '#2a7aa8', 1.6); ln(c, [[20, 10], [25, 24], [32, 56], [39, 24], [44, 10]], '#2a7aa8', 1.4); F(c, poly(c, [[25, 24], [32, 10], [39, 24]]), '#c8f6ff', 1.2, { shade: false }); glint(c, 18, 17, 4); },
  '🍣': (c) => { F(c, ell(null, 32, 40, 24, 13), '#fffaf0', 2); F(c, P((p) => { p.moveTo(8, 34); p.bezierCurveTo(14, 12, 50, 12, 56, 34); p.bezierCurveTo(44, 40, 20, 40, 8, 34); p.closePath(); }), '#ff8a5a', 2); for (const x of [20, 30, 40]) ln(c, [[x, 22], [x + 3, 34]], '#ffd2b0', 2.2); F(c, P((p) => { p.rect(28, 20, 8, 28); }), '#2e3a3a', 1.4, { shade: false }); glint(c, 17, 26, 3.5); },
  '🧶': (c) => { F(c, circ(30, 32, 22), PINK, 2.2); for (const [a, b] of [[[14, 24], [44, 22]], [[10, 34], [48, 36]], [[18, 46], [42, 14]]]) curve(c, '#c85a88', 2, (x) => { x.moveTo(a[0], a[1]); x.quadraticCurveTo(30, (a[1] + b[1]) / 2 + 12, b[0], b[1]); }); curve(c, '#c85a88', 2.4, (x) => { x.moveTo(46, 48); x.bezierCurveTo(58, 52, 50, 60, 60, 58); }); glint(c, 20, 20, 4); },
  '🗡': (c) => { F(c, poly(c, [[14, 52], [10, 40], [44, 8], [54, 10], [56, 20], [24, 54]]), SILVER, 2); ln(c, [[18, 46], [48, 14]], '#fff', 2); F(c, poly(c, [[8, 46], [18, 56], [14, 60], [4, 50]]), '#a05a30', 1.8); F(c, poly(c, [[12, 36], [28, 52], [24, 56], [8, 40]]), GOLD, 1.8); },
  '🛏': (c) => { F(c, P((p) => { p.moveTo(8, 20); p.bezierCurveTo(24, 12, 40, 12, 56, 20); p.bezierCurveTo(52, 32, 52, 36, 56, 46); p.bezierCurveTo(40, 54, 24, 54, 8, 46); p.bezierCurveTo(12, 36, 12, 32, 8, 20); p.closePath(); }), '#ffb8d0', 2.2); for (const [x, y] of [[8, 20], [56, 20], [8, 46], [56, 46]]) F(c, circ(x, y, 4.5), '#ffe08a', 1.6); curve(c, '#d86a98', 2, (x) => { x.moveTo(20, 32); x.quadraticCurveTo(32, 26, 44, 32); }); glint(c, 22, 24, 4); },
  '🍀': (c) => {
    // a four leaf clover: four hearts turned so their points meet in the middle, each with a vein, and a curving stem
    curve(c, '#2e8a3e', 3.6, (x) => { x.moveTo(32, 32); x.bezierCurveTo(36, 44, 30, 52, 40, 60); });
    for (let k = 0; k < 4; k++) {
      c.save(); c.translate(32, 31); c.rotate(k * Math.PI / 2);
      heart(c, 0, -11.5, 9.6, GREEN, 1.9);
      ln(c, [[0, -4.5], [0, -17]], '#2e8a3e', 1.5);
      c.restore();
    }
    dot(c, 32, 31, 2.6, '#c8f5a8'); glint(c, 20, 14, 3.4);
  },
  '💰': (c) => sack(c, '#d8a24a', (x) => { x.fillStyle = INK; x.font = '800 22px sans-serif'; x.textAlign = 'center'; F(x, circ(32, 42, 10), GOLD, 1.8); curve(x, mix(GOLD2, INK, 0.3), 2.2, (q) => { q.moveTo(28, 42); q.quadraticCurveTo(32, 36, 36, 42); q.moveTo(28, 42); q.quadraticCurveTo(32, 48, 36, 42); }); glint(x, 16, 36, 3.5); }),
  '🔮': (c) => { F(c, P((p) => { p.moveTo(14, 58); p.lineTo(20, 46); p.lineTo(44, 46); p.lineTo(50, 58); p.closePath(); }), '#7a5aa8', 2); F(c, circ(32, 28, 21), '#a58cf0', 2.2); F(c, ell(null, 32, 31, 15, 15), '#c8b8ff', 1, { shade: false }); glint(c, 24, 20, 5); glint(c, 40, 34, 3); dot(c, 28, 36, 1.8); },
  '🌼': (c) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; F(c, ell(null, 32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15, 9, 5.5, a), '#fff', 1.6, { shade: false }); } F(c, circ(32, 32, 9), '#ffd23a', 2); dot(c, 29, 29, 2.2); },
  '🐱': (c) => { F(c, poly(c, [[10, 30], [12, 6], [28, 16]]), ORANGE, 2); F(c, poly(c, [[54, 30], [52, 6], [36, 16]]), ORANGE, 2); F(c, ell(null, 32, 36, 24, 20), ORANGE, 2.2); F(c, poly(c, [[14, 22], [15, 12], [22, 17]]), '#ffc0c8', 1, { shade: false }); F(c, poly(c, [[50, 22], [49, 12], [42, 17]]), '#ffc0c8', 1, { shade: false }); for (const x of [23, 41]) { F(c, ell(null, x, 35, 4.6, 5.6), '#3a2a50', 1.2, { shade: false }); dot(c, x - 1.3, 33, 1.8); } F(c, poly(c, [[29, 42], [35, 42], [32, 46]]), '#ff7a98', 1.2, { shade: false }); curve(c, INK, 1.6, (x) => { x.moveTo(32, 46); x.quadraticCurveTo(28, 51, 24, 48); x.moveTo(32, 46); x.quadraticCurveTo(36, 51, 40, 48); }); },
  '🔥': (c) => flame(c, 32, 34, 20, '#ff6a3a', '#ffd23a'),
  '🏆': (c) => { curve(c, GOLD2, 4, (x) => { x.moveTo(14, 16); x.bezierCurveTo(0, 18, 4, 38, 22, 36); x.moveTo(50, 16); x.bezierCurveTo(64, 18, 60, 38, 42, 36); }); F(c, P((p) => { p.moveTo(14, 10); p.lineTo(50, 10); p.bezierCurveTo(50, 36, 42, 42, 32, 42); p.bezierCurveTo(22, 42, 14, 36, 14, 10); p.closePath(); }), GOLD, 2.2); F(c, P((p) => { p.rect(28, 41, 8, 10); }), GOLD2, 1.6); F(c, P((p) => { p.rect(18, 50, 28, 8); }), '#8a5a30', 1.8); glint(c, 22, 20, 4.5); },
  '🥫': (c) => { F(c, P((p) => { p.rect(14, 14, 36, 40); }), '#c8d0e0', 2); F(c, P((p) => { p.rect(14, 24, 36, 20); }), '#ff7a5a', 1.6, { shade: false }); F(c, ell(null, 32, 14, 18, 5), '#e8eef8', 1.8); F(c, circ(32, 34, 6), CREAM, 1.2, { shade: false }); dot(c, 28, 32, 1.8, '#ffb888'); },
  '🪧': (c) => { F(c, P((p) => { p.rect(29, 14, 6, 44); }), BROWN, 2); F(c, P((p) => { p.moveTo(10, 14); p.lineTo(44, 14); p.lineTo(54, 23); p.lineTo(44, 32); p.lineTo(10, 32); p.closePath(); }), '#e6b274', 2); F(c, P((p) => { p.moveTo(54, 40); p.lineTo(22, 40); p.lineTo(12, 47); p.lineTo(22, 54); p.lineTo(54, 54); p.closePath(); }), '#d29a5a', 2); ln(c, [[16, 23], [38, 23]], '#8a5a30', 2); ln(c, [[26, 47], [48, 47]], '#8a5a30', 2); dot(c, 31.5, 17, 1.4, '#7a4a28'); },
  '🍓': (c) => { F(c, P((p) => { p.moveTo(32, 56); p.bezierCurveTo(10, 44, 8, 22, 22, 20); p.bezierCurveTo(28, 18, 30, 22, 32, 22); p.bezierCurveTo(34, 22, 36, 18, 42, 20); p.bezierCurveTo(56, 22, 54, 44, 32, 56); p.closePath(); }), '#ee4a5e', 2.2); for (const [x, y] of [[24, 32], [34, 28], [42, 38], [30, 42], [38, 48], [22, 42]]) ell(c, x, y, 1.3, 1.9), dot(c, x, y, 1.5, '#ffe9a8'); F(c, P((p) => { p.moveTo(32, 21); p.lineTo(22, 14); p.lineTo(28, 18); p.lineTo(26, 10); p.lineTo(32, 16); p.lineTo(38, 10); p.lineTo(36, 18); p.lineTo(42, 14); p.closePath(); }), GREEN, 1.8); glint(c, 20, 30, 3.5); },
  '🎀': (c) => {
    F(c, P((p) => { p.moveTo(30, 30); p.bezierCurveTo(22, 14, 6, 16, 8, 30); p.bezierCurveTo(8, 44, 22, 46, 30, 34); p.closePath(); }), PINK, 2);
    F(c, P((p) => { p.moveTo(34, 30); p.bezierCurveTo(42, 14, 58, 16, 56, 30); p.bezierCurveTo(56, 44, 42, 46, 34, 34); p.closePath(); }), PINK, 2);
    F(c, P((p) => { p.moveTo(30, 36); p.lineTo(20, 56); p.lineTo(27, 53); p.lineTo(30, 58); p.lineTo(34, 40); p.closePath(); }), '#ff6f9f', 1.8);
    F(c, P((p) => { p.moveTo(34, 36); p.lineTo(44, 56); p.lineTo(37, 53); p.lineTo(34, 58); p.lineTo(30, 40); p.closePath(); }), '#ff6f9f', 1.8);
    ln(c, [[14, 26], [22, 24]], '#ffd0e2', 2); ln(c, [[50, 26], [42, 24]], '#ffd0e2', 2);
    F(c, P((p) => { p.moveTo(26, 28); p.bezierCurveTo(26, 24, 38, 24, 38, 28); p.lineTo(38, 38); p.bezierCurveTo(38, 42, 26, 42, 26, 38); p.closePath(); }), '#ff8fb7', 2);
    glint(c, 30, 30, 3.5);
  },
  '🐚': (c) => {
    // a scallop shell with ridges and a pearl
    F(c, P((p) => { p.moveTo(32, 54); p.bezierCurveTo(8, 48, 4, 24, 14, 16); p.bezierCurveTo(24, 8, 40, 8, 50, 16); p.bezierCurveTo(60, 24, 56, 48, 32, 54); p.closePath(); }), '#ffc6dc', 2.2);
    for (const [x2, y2] of [[12, 22], [20, 14], [32, 10], [44, 14], [52, 22]]) ln(c, [[32, 52], [x2, y2]], '#e08aac', 1.8);
    F(c, P((p) => { p.moveTo(24, 54); p.lineTo(40, 54); p.lineTo(38, 58); p.lineTo(26, 58); p.closePath(); }), '#e8a0bc', 1.6);
    F(c, circ(32, 36, 5.5), '#ffffff', 1.6); glint(c, 30, 34, 2.4);
  },
  '🧥': (c) => {
    // a hooded midnight cloak with a clasp and a trailing hem
    F(c, P((p) => { p.moveTo(32, 8); p.bezierCurveTo(20, 8, 16, 18, 14, 30); p.bezierCurveTo(12, 42, 8, 52, 6, 58); p.lineTo(24, 54); p.lineTo(32, 58); p.lineTo(40, 54); p.lineTo(58, 58); p.bezierCurveTo(56, 52, 52, 42, 50, 30); p.bezierCurveTo(48, 18, 44, 8, 32, 8); p.closePath(); }), '#2f5aa8', 2.2);
    F(c, P((p) => { p.moveTo(32, 12); p.bezierCurveTo(24, 12, 22, 22, 26, 30); p.lineTo(32, 36); p.lineTo(38, 30); p.bezierCurveTo(42, 22, 40, 12, 32, 12); p.closePath(); }), '#0f1f44', 1.8, { shade: false });
    ln(c, [[32, 36], [32, 56]], '#1f3d7a', 1.8);
    F(c, circ(32, 38, 3.2), '#ffd84a', 1.6); glint(c, 31, 37, 1.6);
    dot(c, 24, 20, 1.3, '#ffffff'); dot(c, 41, 44, 1.3, '#ffffff'); dot(c, 17, 46, 1.1, '#ffffff');
  },
  '🪝': (c) => {
    // three sharpened claws: slim, separate crescent talons curving up to the right, with a golden wrap at the base
    for (const o of [9, 25, 41]) {
      F(c, P((p) => { p.moveTo(o - 3.5, 58); p.bezierCurveTo(o - 9, 36, o + 3, 16, o + 17, 5); p.bezierCurveTo(o + 11, 22, o + 9, 42, o + 3.5, 58); p.closePath(); }), '#f3f6ff', 2);
      ln(c, [[o - 1, 50], [o + 5, 28]], '#ffffff', 1.4);
    }
    F(c, P((p) => { p.rect(3, 47, 52, 10); }), GOLD2, 2);
    glint(c, 56, 10, 3.2);
  },
  '🧺': (c) => {
    // a woven cat bed: a rim, a soft blanket and weave lines
    F(c, P((p) => { p.moveTo(8, 30); p.bezierCurveTo(8, 56, 56, 56, 56, 30); p.closePath(); }), '#d9a05a', 2);
    for (const [x1, y1, x2, y2] of [[16, 36, 20, 50], [26, 38, 28, 53], [38, 38, 36, 53], [48, 36, 44, 50]]) ln(c, [[x1, y1], [x2, y2]], '#a8743a', 1.6);
    ln(c, [[12, 40], [52, 40]], '#a8743a', 1.6); ln(c, [[16, 47], [48, 47]], '#a8743a', 1.6);
    F(c, P((p) => { p.moveTo(14, 30); p.bezierCurveTo(16, 18, 48, 18, 50, 30); p.bezierCurveTo(40, 36, 24, 36, 14, 30); p.closePath(); }), PINK, 2);
    ln(c, [[22, 26], [26, 31]], '#ffd0e2', 1.8); ln(c, [[34, 25], [38, 30]], '#ffd0e2', 1.8);
    F(c, P((p) => { p.moveTo(6, 30); p.bezierCurveTo(6, 25, 58, 25, 58, 30); p.bezierCurveTo(58, 34, 6, 34, 6, 30); p.closePath(); }), '#e8b46a', 2);
    glint(c, 46, 22, 3.4);
  },
  '🧤': (c) => { F(c, P((p) => { p.moveTo(20, 56); p.lineTo(18, 34); p.bezierCurveTo(10, 30, 8, 22, 14, 20); p.bezierCurveTo(18, 19, 20, 24, 22, 28); p.lineTo(22, 14); p.bezierCurveTo(22, 8, 30, 8, 30, 14); p.lineTo(30, 10); p.bezierCurveTo(30, 4, 38, 4, 38, 10); p.lineTo(38, 12); p.bezierCurveTo(38, 6, 46, 6, 46, 12); p.lineTo(46, 38); p.bezierCurveTo(46, 48, 44, 52, 42, 56); p.closePath(); }), BLUE, 2.2); F(c, P((p) => { p.rect(19, 50, 24, 9); }), CREAM, 2); for (const x of [24, 30, 36]) ln(c, [[x, 51], [x, 58]], '#c9b89a', 1.6); for (const [x, y] of [[30, 30], [38, 24], [30, 20]]) dot(c, x, y, 1.8, 'rgba(255,255,255,.8)'); glint(c, 40, 40, 3.2); },
  '🍙': (c) => { F(c, P((p) => { p.moveTo(32, 10); p.bezierCurveTo(40, 10, 56, 38, 54, 46); p.bezierCurveTo(52, 54, 40, 56, 32, 56); p.bezierCurveTo(24, 56, 12, 54, 10, 46); p.bezierCurveTo(8, 38, 24, 10, 32, 10); p.closePath(); }), '#fffaf0', 2.2); F(c, P((p) => { p.moveTo(20, 56); p.lineTo(22, 40); p.lineTo(42, 40); p.lineTo(44, 56); p.closePath(); }), '#2e3a3a', 1.8, { shade: false }); for (const [x, y] of [[26, 26], [36, 22], [32, 32], [40, 31], [24, 36]]) dot(c, x, y, 1.3, '#e8dcc4'); glint(c, 22, 24, 3.4); },
  '🌿': (c) => { ln(c, [[32, 58], [32, 12]], '#2e8a3e', 3); for (const [y, s] of [[44, 1], [34, -1], [24, 1], [16, -1]]) F(c, ell(null, 32 + s * 11, y, 12, 5.5, s * -0.5), GREEN, 1.8); F(c, ell(null, 32, 10, 5, 8), GREEN, 1.8); },
  '🥛': (c) => { F(c, P((p) => { p.moveTo(18, 12); p.lineTo(46, 12); p.lineTo(42, 56); p.lineTo(22, 56); p.closePath(); }), '#f4f8ff', 2); F(c, P((p) => { p.moveTo(19.5, 26); p.lineTo(44.5, 26); p.lineTo(42, 56); p.lineTo(22, 56); p.closePath(); }), '#fff', 1, { shade: false }); F(c, P((p) => { p.rect(18, 10, 28, 5); }), BLUE, 1.6); curve(c, '#b8d4f0', 2, (x) => { x.moveTo(24, 32); x.lineTo(26, 50); }); dot(c, 32, 40, 3, '#ffe0e8'); },
  '🍘': (c) => { F(c, ell(null, 32, 34, 24, 21), '#f0c27a', 2.2); F(c, ell(null, 32, 34, 18, 15), '#f8d9a0', 1, { shade: false }); F(c, P((p) => { p.rect(26, 12, 12, 44); }), '#2e3a3a', 1.6, { shade: false }); dot(c, 18, 28, 1.6, '#c88a3a'); dot(c, 46, 40, 1.6, '#c88a3a'); dot(c, 20, 44, 1.6, '#c88a3a'); glint(c, 18, 22, 3.5); },
  '🐟': (c) => fishShape(c, BLUE, '#3a8ad0', null),
  '🐠': (c) => fishShape(c, ORANGE, '#ffd23a', '#fff'),
  '🌶': (c) => { F(c, P((p) => { p.moveTo(14, 18); p.bezierCurveTo(30, 8, 56, 16, 56, 34); p.bezierCurveTo(56, 50, 36, 58, 8, 54); p.bezierCurveTo(28, 50, 38, 38, 28, 28); p.bezierCurveTo(22, 22, 18, 22, 14, 18); p.closePath(); }), '#ee3a3a', 2.2); F(c, P((p) => { p.moveTo(10, 18); p.bezierCurveTo(8, 8, 18, 6, 24, 12); p.lineTo(18, 24); p.closePath(); }), GREEN, 1.8); glint(c, 40, 22, 4); },
  '🥤': (c) => { ln(c, [[36, 6], [40, 22]], '#ff6a98', 4); F(c, P((p) => { p.moveTo(14, 20); p.lineTo(50, 20); p.lineTo(44, 58); p.lineTo(20, 58); p.closePath(); }), '#ffe08a', 2); F(c, P((p) => { p.moveTo(16, 34); p.lineTo(48, 34); p.lineTo(44, 58); p.lineTo(20, 58); p.closePath(); }), '#ff7a8a', 1, { shade: false }); F(c, ell(null, 32, 20, 18, 5), '#fff', 1.8); },
  '🦴': (c) => { F(c, P((p) => { p.moveTo(18, 22); p.bezierCurveTo(8, 14, 6, 28, 14, 30); p.bezierCurveTo(6, 34, 10, 48, 20, 42); p.lineTo(46, 20); p.bezierCurveTo(54, 14, 58, 28, 50, 32); p.bezierCurveTo(58, 36, 52, 52, 44, 44); p.closePath(); }), '#fff4e0', 2.2); },
  '🍦': (c) => { F(c, poly(c, [[18, 30], [46, 30], [32, 60]]), '#e8a860', 2); ln(c, [[24, 36], [36, 52]], '#b87a38', 1.6); ln(c, [[40, 36], [28, 52]], '#b87a38', 1.6); F(c, ell(null, 32, 28, 17, 8), PINK, 2); F(c, ell(null, 32, 18, 13, 8), '#fff0f6', 2); F(c, circ(32, 8, 4.5), '#ff5a7a', 1.6); glint(c, 24, 18, 3.5); },
  '🍗': (c) => { F(c, P((p) => { p.moveTo(30, 6); p.bezierCurveTo(54, 4, 62, 30, 44, 42); p.bezierCurveTo(32, 50, 12, 38, 18, 20); p.bezierCurveTo(20, 12, 24, 8, 30, 6); p.closePath(); }), '#c8763a', 2.2); F(c, P((p) => { p.moveTo(28, 40); p.lineTo(18, 54); p.lineTo(8, 52); p.lineTo(8, 56); p.lineTo(16, 62); p.lineTo(22, 58); p.lineTo(36, 46); p.closePath(); }), '#fff4e0', 1.8); glint(c, 32, 16, 4.5); },
  '🍱': (c) => { F(c, P((p) => { p.rect(6, 14, 52, 40); }), '#b8553a', 2); F(c, P((p) => { p.rect(10, 18, 44, 32); }), '#fff0d8', 1.4, { shade: false }); F(c, P((p) => { p.rect(30, 18, 3, 32); }), '#b8553a', 1, { shade: false }); F(c, ell(null, 20, 34, 8, 8), '#fff', 1.4); dot(c, 20, 34, 3, '#e83a4a'); F(c, ell(null, 43, 28, 8, 5), '#ff8a5a', 1.4); F(c, ell(null, 43, 41, 8, 5), GREEN, 1.4); },
  '🔔': (c) => bell(c, GOLD),
  '🛎': (c) => { F(c, P((p) => { p.moveTo(8, 44); p.bezierCurveTo(8, 24, 20, 18, 32, 18); p.bezierCurveTo(44, 18, 56, 24, 56, 44); p.closePath(); }), GOLD, 2.2); F(c, P((p) => { p.rect(4, 44, 56, 9); }), GOLD2, 1.8); F(c, P((p) => { p.rect(28, 10, 8, 9); }), '#d8d8e8', 1.6); F(c, ell(null, 32, 9, 8, 3.5), '#f4f4ff', 1.5); glint(c, 20, 30, 4.5); },
  '🧐': (c) => { F(c, circ(30, 30, 20), '#cfeaff', 2.4, { line: GOLD2 }); curve(c, GOLD2, 4, (x) => { x.arc(30, 30, 20, 0, TAU); }); curve(c, '#fff', 2, (x) => { x.arc(30, 30, 14, 3.6, 4.7); }); dot(c, 30, 32, 8, '#ffcf3a'); dot(c, 30, 32, 8, 'rgba(160,100,0,.35)'); dot(c, 30, 32, 6.4, '#ffd84a'); dot(c, 30, 32, 3.4, '#2a1c3a'); dot(c, 27.6, 29.6, 1.5, '#fff'); curve(c, GOLD2, 2.2, (x) => { x.moveTo(44, 46); x.bezierCurveTo(56, 52, 50, 62, 58, 62); }); },
  '🦺': (c) => { F(c, P((p) => { p.moveTo(14, 8); p.lineTo(26, 8); p.lineTo(32, 18); p.lineTo(38, 8); p.lineTo(50, 8); p.lineTo(54, 56); p.lineTo(10, 56); p.closePath(); }), '#3ab8c8', 2.2); for (const y of [26, 36, 46]) for (let x = 16; x < 50; x += 8) { c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(x + (y % 20 ? 4 : 0), y, 3.6, Math.PI, 0); c.fill(); } ln(c, [[32, 18], [32, 56]], '#1e7a88', 2); },
  '📿': (c) => { for (let i = 0; i < 9; i++) { const a = Math.PI * (0.05 + (i / 8) * 0.9); const x = 32 + Math.cos(a) * 24, y = 16 + Math.sin(a) * 30; F(c, poly(c, [[x - 4, y - 3], [x + 4, y - 3], [x + Math.cos(a) * 8, y + Math.sin(a) * 8 + 1]]), SILVER, 1.4, { shade: false }); } curve(c, '#b83a5a', 6, (x) => { x.arc(32, 16, 24, 0.12, Math.PI - 0.12); }); curve(c, '#ff7a98', 2, (x) => { x.arc(32, 14, 24, 0.5, 1.3); }); F(c, circ(32, 44, 4.4), GOLD, 1.6); },
  '🦷': (c) => { F(c, P((p) => { p.moveTo(14, 8); p.bezierCurveTo(30, 4, 46, 6, 50, 10); p.bezierCurveTo(52, 30, 44, 44, 34, 58); p.bezierCurveTo(30, 40, 24, 24, 14, 8); p.closePath(); }), '#fffaf0', 2.2); F(c, P((p) => { p.moveTo(34, 58); p.bezierCurveTo(37, 52, 40, 48, 43, 42); p.lineTo(34, 44); p.closePath(); }), '#e83a4a', 1.2, { shade: false }); glint(c, 24, 14, 3.6); },
  '💖': (c) => { heart(c, 32, 32, 20, PINK, 2.4); glint(c, 22, 24, 4.5); glint(c, 52, 12, 4); glint(c, 12, 50, 3); },
  '❤': (c) => { heart(c, 32, 30, 22, RED, 2.4); glint(c, 22, 22, 4.5); },
  '🧣': (c) => { F(c, P((p) => { p.moveTo(8, 20); p.bezierCurveTo(24, 36, 40, 36, 56, 20); p.lineTo(56, 32); p.bezierCurveTo(40, 48, 24, 48, 8, 32); p.closePath(); }), '#e8503a', 2.2); F(c, P((p) => { p.moveTo(38, 40); p.lineTo(52, 40); p.lineTo(54, 60); p.lineTo(40, 60); p.closePath(); }), '#e8503a', 2); for (const y of [46, 53]) ln(c, [[40, y], [53, y]], '#ffd23a', 2.4); ln(c, [[16, 28], [20, 38]], '#ffd23a', 2.4); ln(c, [[32, 36], [32, 46]], '#ffd23a', 2.4); ln(c, [[48, 28], [44, 38]], '#ffd23a', 2.4); },
  '📯': (c) => {
    // two crossed metal whistles: a flat mouthpiece, a round chamber with a sound slot and a ring
    for (const [a, col] of [[-0.5, '#ffd84a'], [Math.PI + 0.5, '#ffc83a']]) {
      c.save(); c.translate(32, 40); c.rotate(a);
      F(c, P((p) => { p.rect(-26, -5, 24, 10); }), '#e8962a', 1.8);
      F(c, circ(15, 0, 11), col, 2);
      F(c, ell(null, 15, -5, 5, 2.2), '#3a2a50', 1, { shade: false });
      F(c, circ(15, 3, 2.8), '#fff3b0', 1, { shade: false });
      curve(c, '#8a6a30', 2.2, (x) => { x.arc(27, -3, 3.6, 0, TAU); });
      c.restore();
    }
    glint(c, 32, 8, 3.4); glint(c, 8, 56, 3);
  },

  '💍': (c) => { curve(c, GOLD2, 7, (x) => { x.arc(32, 40, 15, 0, TAU); }); curve(c, GOLD, 3.5, (x) => { x.arc(32, 40, 15, 0, TAU); }); F(c, poly(c, [[24, 20], [40, 20], [46, 10], [32, 4], [18, 10]]), '#ff5a5a', 2); ln(c, [[18, 10], [46, 10]], '#ffb0b0', 1.4); ln(c, [[24, 20], [32, 4], [40, 20]], '#b82a3a', 1.2); glint(c, 27, 12, 3.5); },
  '❄': (c) => { for (let i = 0; i < 3; i++) { c.save(); c.translate(32, 32); c.rotate((i * Math.PI) / 3); ln(c, [[0, -26], [0, 26]], '#6ab8ee', 4.6); ln(c, [[0, -26], [0, 26]], '#dff4ff', 2); for (const s of [-1, 1]) for (const y of [-15, 15]) { ln(c, [[0, y], [8, y + s * 9 * Math.sign(y)]], '#6ab8ee', 3.8); ln(c, [[0, y], [8, y + s * 9 * Math.sign(y)]], '#dff4ff', 1.6); } c.restore(); } F(c, circ(32, 32, 5), '#fff', 1.6); },
  '🪨': (c) => { F(c, P((p) => { p.moveTo(8, 46); p.lineTo(12, 22); p.lineTo(28, 10); p.lineTo(46, 14); p.lineTo(56, 32); p.lineTo(52, 52); p.lineTo(26, 56); p.closePath(); }), '#8a92b0', 2.2); F(c, poly(c, [[36, 14], [26, 34], [34, 34], [28, 54], [44, 28], [35, 28], [42, 14]]), '#ffd23a', 1.8); },
  '🧀': (c) => { F(c, P((p) => { p.moveTo(6, 44); p.lineTo(50, 18); p.lineTo(58, 28); p.lineTo(58, 50); p.lineTo(6, 50); p.closePath(); }), '#ffd23a', 2.2); F(c, P((p) => { p.moveTo(6, 44); p.lineTo(58, 44); p.lineTo(58, 50); p.lineTo(6, 50); p.closePath(); }), '#e8a81a', 1.6, { shade: false }); for (const [x, y, r] of [[22, 40, 3.4], [38, 36, 4.6], [50, 46, 2.6], [34, 28, 2.6]]) { c.fillStyle = '#e8a81a'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); } crown(c, 24, 18, 12, '#ff9a3a'); },
  '⏳': (c) => { F(c, P((p) => { p.rect(10, 6, 44, 6); p.rect(10, 52, 44, 6); }), '#a05a30', 2); F(c, P((p) => { p.moveTo(14, 12); p.lineTo(50, 12); p.bezierCurveTo(50, 28, 36, 28, 36, 32); p.bezierCurveTo(36, 36, 50, 36, 50, 52); p.lineTo(14, 52); p.bezierCurveTo(14, 36, 28, 36, 28, 32); p.bezierCurveTo(28, 28, 14, 28, 14, 12); p.closePath(); }), '#dff4ff', 2, { shade: false }); F(c, P((p) => { p.moveTo(26, 46); p.lineTo(38, 46); p.lineTo(46, 52); p.lineTo(18, 52); p.closePath(); }), '#ffc83a', 1.2, { shade: false }); ln(c, [[32, 30], [32, 44]], '#ffc83a', 2); },
  '🐲': (c) => { F(c, poly(c, [[16, 20], [12, 4], [26, 14]]), '#ffe08a', 1.8); F(c, poly(c, [[48, 20], [52, 4], [38, 14]]), '#ffe08a', 1.8); heart(c, 32, 34, 21, '#d83a58', 2.4); for (const [x, y] of [[24, 32], [32, 38], [40, 32], [28, 46], [36, 46]]) curve(c, '#8a1a38', 1.6, (q) => { q.arc(x, y, 4, Math.PI, 0); }); glint(c, 22, 24, 4.2); },
  '🪶': (c) => { F(c, P((p) => { p.moveTo(10, 56); p.bezierCurveTo(8, 24, 30, 6, 56, 6); p.bezierCurveTo(56, 34, 40, 52, 10, 56); p.closePath(); }), '#eaf6ff', 2.2); ln(c, [[10, 56], [48, 14]], '#8ab8e0', 2.2); for (let i = 0; i < 5; i++) { const t = 0.2 + i * 0.16, x = 10 + 38 * t, y = 56 - 42 * t; ln(c, [[x, y], [x + 7, y + 7]], '#b8d8f0', 1.6); ln(c, [[x, y], [x - 7, y - 6]], '#b8d8f0', 1.6); } },
  '🎭': (c) => { F(c, P((p) => { p.moveTo(6, 22); p.bezierCurveTo(20, 14, 44, 14, 58, 22); p.bezierCurveTo(58, 44, 46, 52, 38, 44); p.lineTo(32, 38); p.lineTo(26, 44); p.bezierCurveTo(18, 52, 6, 44, 6, 22); p.closePath(); }), '#4a3a78', 2.2); for (const x of [20, 44]) { F(c, P((p) => { p.moveTo(x - 8, 30); p.lineTo(x + 8, 28); p.lineTo(x + 5, 36); p.closePath(); }), '#ffe0f0', 1.2, { shade: false }); } ln(c, [[10, 22], [54, 22]], '#8a6ad0', 1.6); glint(c, 16, 24, 3); },
  '🥋': (c) => { F(c, P((p) => { p.moveTo(10, 8); p.lineTo(26, 8); p.lineTo(32, 24); p.lineTo(38, 8); p.lineTo(54, 8); p.lineTo(58, 56); p.lineTo(6, 56); p.closePath(); }), '#fff', 2.2); F(c, P((p) => { p.rect(6, 36, 52, 8); }), '#2e2a3a', 1.8); F(c, P((p) => { p.moveTo(26, 44); p.lineTo(22, 58); p.lineTo(30, 56); p.lineTo(34, 44); p.moveTo(34, 44); p.lineTo(38, 58); p.lineTo(46, 54); p.lineTo(38, 44); }), '#2e2a3a', 1.6); },
  '♨': (c) => { F(c, P((p) => { p.moveTo(6, 40); p.lineTo(58, 40); p.bezierCurveTo(58, 56, 48, 58, 32, 58); p.bezierCurveTo(16, 58, 6, 56, 6, 40); p.closePath(); }), '#6ac8f0', 2.2); F(c, ell(null, 32, 40, 26, 6), '#aee8ff', 1.8); for (const x of [20, 32, 44]) curve(c, '#fff', 3.4, (q) => { q.moveTo(x, 34); q.bezierCurveTo(x - 8, 26, x + 8, 20, x, 8); }); },
  '🔭': (c) => { ln(c, [[26, 40], [14, 60]], '#8a5a30', 4); ln(c, [[34, 40], [46, 60]], '#8a5a30', 4); c.save(); c.translate(32, 28); c.rotate(-0.5); F(c, P((p) => { p.rect(-22, -6, 20, 12); }), '#6a82d0', 2); F(c, P((p) => { p.rect(-4, -8, 22, 16); }), '#8aa2f0', 2); F(c, P((p) => { p.rect(18, -10, 10, 20); }), GOLD, 2); c.restore(); glint(c, 52, 8, 3.5); },
  '⛩': (c) => { F(c, P((p) => { p.rect(14, 22, 7, 38); p.rect(43, 22, 7, 38); }), '#e8503a', 2); F(c, P((p) => { p.rect(10, 30, 44, 6); }), '#e8503a', 1.8); F(c, P((p) => { p.moveTo(2, 14); p.bezierCurveTo(16, 20, 48, 20, 62, 14); p.lineTo(58, 24); p.lineTo(6, 24); p.closePath(); }), '#3a2a50', 2); },
  '⚡': (c) => { F(c, poly(c, [[36, 2], [12, 34], [28, 34], [22, 62], [52, 24], [34, 24], [44, 2]]), '#ffd23a', 2.4); glint(c, 30, 16, 3.4); },
  '🎯': (c) => { F(c, circ(32, 32, 26), '#fff', 2.2); F(c, circ(32, 32, 19), '#e8503a', 1.6, { shade: false }); F(c, circ(32, 32, 12), '#fff', 1.6, { shade: false }); F(c, circ(32, 32, 6), '#e8503a', 1.6, { shade: false }); ln(c, [[32, 32], [54, 10]], '#8a5a30', 3); F(c, poly(c, [[50, 6], [58, 6], [58, 14], [54, 12]]), '#5ab4f0', 1.4, { shade: false }); },
  '✨': (c) => { c.fillStyle = '#ffd23a'; c.strokeStyle = '#c8841a'; c.lineWidth = 2; for (const [x, y, r] of [[26, 34, 22], [48, 14, 11], [48, 50, 9]]) { const p = star(x, y, r, r * 0.3, 4); c.fill(p); c.stroke(p); } glint(c, 22, 28, 4); },
  '🛡': (c) => { F(c, P((p) => { p.moveTo(10, 8); p.lineTo(54, 8); p.lineTo(54, 32); p.bezierCurveTo(54, 48, 42, 56, 32, 60); p.bezierCurveTo(22, 56, 10, 48, 10, 32); p.closePath(); }), '#5a8ae0', 2.2); F(c, P((p) => { p.moveTo(32, 8); p.lineTo(54, 8); p.lineTo(54, 32); p.bezierCurveTo(54, 48, 42, 56, 32, 60); p.closePath(); }), '#3a6ac0', 1, { shade: false }); F(c, star(32, 32, 12, 5), GOLD, 1.6); },
  '⚙': (c) => gear(c, 32, 32, 25, '#a8b4cc'),
  '🎵': (c) => note(c, 24, 48, '#9a6ae0'),
  '♪': (c) => note(c, 24, 48, '#9a6ae0'),
  '♫': (c) => { note(c, 18, 50, '#9a6ae0'); note(c, 40, 42, '#ff8fb7'); ln(c, [[25, 20], [47, 12]], INK, 4); },
  '⏸': (c) => { F(c, P((p) => { p.roundRect(16, 12, 12, 40, 4); p.roundRect(36, 12, 12, 40, 4); }), '#fff', 2.4, { line: INK }); },
  '❚': (c) => { F(c, P((p) => { p.rect(20, 10, 10, 44); p.rect(36, 10, 10, 44); }), '#fff', 2, { line: INK }); },
  '☀': (c) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; F(c, poly(c, [[32 + Math.cos(a - 0.14) * 20, 32 + Math.sin(a - 0.14) * 20], [32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30], [32 + Math.cos(a + 0.14) * 20, 32 + Math.sin(a + 0.14) * 20]]), '#ffb02a', 1.4, { shade: false }); } F(c, circ(32, 32, 17), '#ffd23a', 2.2); glint(c, 26, 26, 4.5); },
  '☠': (c) => { F(c, P((p) => { p.moveTo(10, 30); p.bezierCurveTo(10, 4, 54, 4, 54, 30); p.bezierCurveTo(54, 40, 48, 42, 46, 46); p.lineTo(46, 54); p.lineTo(18, 54); p.lineTo(18, 46); p.bezierCurveTo(16, 42, 10, 40, 10, 30); p.closePath(); }), '#f4f0ff', 2.2); for (const x of [23, 41]) F(c, ell(null, x, 31, 6.4, 7.4), '#3a2a50', 1.2, { shade: false }); F(c, poly(c, [[29, 40], [35, 40], [32, 45]]), '#3a2a50', 1, { shade: false }); for (const x of [24, 32, 40]) ln(c, [[x, 48], [x, 54]], INK, 1.8); },
  '🌙': (c) => { F(c, P((p) => { p.moveTo(40, 6); p.bezierCurveTo(14, 6, 6, 34, 20, 50); p.bezierCurveTo(32, 62, 52, 56, 58, 42); p.bezierCurveTo(40, 50, 26, 34, 40, 6); p.closePath(); }), '#ffe08a', 2.2); glint(c, 52, 14, 4); glint(c, 56, 28, 2.6); },
  '💨': (c) => { for (const [y, w, x0] of [[18, 40, 14], [32, 46, 6], [46, 34, 18]]) { curve(c, '#fff', 7, (q) => { q.moveTo(x0, y); q.lineTo(x0 + w, y); q.arc(x0 + w, y - 7, 7, Math.PI / 2, -Math.PI * 0.9, true); }); curve(c, '#b8c8ee', 3.2, (q) => { q.moveTo(x0, y); q.lineTo(x0 + w, y); q.arc(x0 + w, y - 7, 7, Math.PI / 2, -Math.PI * 0.9, true); }); } },
  '🐀': (c) => { F(c, circ(16, 14, 11), '#ffc0c8', 2); F(c, circ(44, 14, 11), '#ffc0c8', 2); F(c, P((p) => { p.moveTo(8, 38); p.bezierCurveTo(8, 14, 56, 14, 56, 38); p.bezierCurveTo(56, 52, 46, 56, 32, 56); p.bezierCurveTo(18, 56, 8, 52, 8, 38); p.closePath(); }), '#b8a8c0', 2.2); for (const x of [22, 42]) { F(c, circ(x, 34, 4.6), '#3a2a50', 1.2, { shade: false }); dot(c, x - 1.2, 32.6, 1.7); } F(c, circ(32, 44, 4), '#ff7a98', 1.2, { shade: false }); for (const s of [-1, 1]) for (const dy of [-2, 3]) ln(c, [[32 + s * 6, 46 + dy * 0.4], [32 + s * 22, 44 + dy * 2]], INK, 1.2); },
  '👑': (c) => crown(c, 32, 32, 26, GOLD),
  '🧱': (c) => { F(c, P((p) => { p.rect(6, 12, 52, 40); }), '#d8683a', 2); for (const y of [25, 38]) ln(c, [[6, y], [58, y]], '#7a2e18', 2); for (const [x, y] of [[32, 12], [19, 25], [45, 25], [32, 38], [19, 52], [45, 52]]) ln(c, [[x, y], [x, y + 13]], '#7a2e18', 2); glint(c, 14, 18, 3.5); },
  '🐾': (c) => { F(c, P((p) => { p.moveTo(32, 30); p.bezierCurveTo(46, 30, 54, 46, 46, 54); p.bezierCurveTo(40, 58, 36, 52, 32, 52); p.bezierCurveTo(28, 52, 24, 58, 18, 54); p.bezierCurveTo(10, 46, 18, 30, 32, 30); p.closePath(); }), '#ff8fb7', 2.2); for (const [x, y, r] of [[13, 28, 5.6], [24, 15, 6], [40, 15, 6], [51, 28, 5.6]]) F(c, ell(null, x, y, r, r * 1.2), '#ff8fb7', 2, { shade: false }); },
  '🪑': (c) => { F(c, P((p) => { p.rect(8, 22, 48, 12); }), '#d8a05a', 2); F(c, P((p) => { p.rect(12, 34, 7, 24); p.rect(45, 34, 7, 24); }), '#a8723a', 1.8); F(c, P((p) => { p.rect(10, 24, 44, 6); }), '#ff8fb7', 1.4, { shade: false }); },
  '☕': (c) => { curve(c, '#fff', 4, (x) => { x.moveTo(24, 22); x.bezierCurveTo(16, 14, 28, 10, 22, 2); x.moveTo(36, 22); x.bezierCurveTo(28, 14, 40, 10, 34, 2); }); curve(c, INK, 11, (x) => { x.arc(50, 38, 6, -1.4, 1.5); }); curve(c, '#fff', 7, (x) => { x.arc(50, 38, 6, -1.4, 1.5); }); F(c, P((p) => { p.moveTo(8, 26); p.lineTo(50, 26); p.bezierCurveTo(50, 54, 40, 58, 29, 58); p.bezierCurveTo(18, 58, 8, 54, 8, 26); p.closePath(); }), '#fff', 2.2); F(c, ell(null, 29, 28, 20, 4), '#8a5230', 1.4, { shade: false }); heart(c, 29, 44, 5, PINK, 1.4); },
  '🎓': (c) => { F(c, poly(c, [[32, 12], [60, 26], [32, 40], [4, 26]]), '#3a3a58', 2.2); F(c, P((p) => { p.moveTo(16, 32); p.lineTo(16, 44); p.bezierCurveTo(24, 52, 40, 52, 48, 44); p.lineTo(48, 32); p.lineTo(32, 40); p.closePath(); }), '#4a4a70', 2); ln(c, [[56, 28], [56, 46]], GOLD, 2.4); F(c, circ(56, 48, 3.4), GOLD, 1.4); },
  '🕊': (c) => { F(c, P((p) => { p.moveTo(8, 36); p.bezierCurveTo(14, 44, 30, 54, 46, 40); p.bezierCurveTo(52, 34, 54, 28, 52, 22); p.bezierCurveTo(46, 20, 44, 26, 38, 26); p.bezierCurveTo(30, 26, 26, 30, 8, 36); p.closePath(); }), '#fff', 2.2); F(c, P((p) => { p.moveTo(30, 28); p.bezierCurveTo(30, 12, 40, 6, 52, 4); p.bezierCurveTo(50, 18, 44, 26, 34, 32); p.closePath(); }), '#eaf2ff', 2); F(c, circ(52, 18, 7), '#fff', 2); dot(c, 54, 16.6, 1.6, INK); F(c, poly(c, [[58, 18], [64, 20], [58, 22]]), ORANGE, 1.2, { shade: false }); },
  '🔒': (c) => { curve(c, '#8a92b0', 7, (x) => { x.arc(32, 24, 12, Math.PI, 0); x.lineTo(44, 30); x.moveTo(20, 24); x.lineTo(20, 30); }); F(c, P((p) => { p.rect(10, 28, 44, 30); }), GOLD, 2.2); F(c, circ(32, 41, 5), '#6a4a1a', 1.4, { shade: false }); ln(c, [[32, 44], [32, 51]], '#6a4a1a', 3); },
  '🎁': (c) => { F(c, P((p) => { p.rect(6, 28, 52, 30); }), '#a8683a', 2.2); F(c, P((p) => { p.moveTo(6, 30); p.bezierCurveTo(6, 8, 58, 8, 58, 30); p.closePath(); }), '#c88048', 2.2); F(c, P((p) => { p.rect(6, 26, 52, 6); p.rect(28, 12, 8, 46); }), GOLD, 1.6); F(c, P((p) => { p.rect(26, 34, 12, 12); }), '#fff0b0', 1.6); dot(c, 32, 40, 2, '#a06a10'); glint(c, 16, 20, 4); },
  '📊': (c) => { for (const [x, h, col] of [[10, 22, '#ff8fb7'], [26, 40, '#ffd23a'], [42, 30, '#5ab4f0']]) F(c, P((p) => { p.rect(x, 56 - h, 13, h); }), col, 2); ln(c, [[6, 58], [58, 58]], INK, 2.6); },
  '⛶': (c) => { for (const [x, y, sx, sy] of [[10, 10, 1, 1], [54, 10, -1, 1], [10, 54, 1, -1], [54, 54, -1, -1]]) { ln(c, [[x, y + sy * 18], [x, y], [x + sx * 18, y]], INK, 9); ln(c, [[x, y + sy * 18], [x, y], [x + sx * 18, y]], '#fff', 5); } },
  '💫': (c) => { curve(c, '#fff', 7, (x) => { x.arc(32, 32, 16, 0.4, 5.6); x.arc(32, 32, 8, 5.6, 0.4, true); }); curve(c, '#ffb02a', 3.2, (x) => { x.arc(32, 32, 16, 0.4, 5.6); x.arc(32, 32, 8, 5.6, 0.4, true); }); for (const [x, y, r] of [[50, 22, 8], [14, 16, 6], [46, 52, 6]]) F(c, star(x, y, r, r * 0.45), '#ffd23a', 1.8); },
  '💢': (c) => { for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { c.save(); c.translate(32, 32); c.rotate(a + Math.PI / 4); F(c, P((p) => { p.moveTo(2, -2); p.bezierCurveTo(10, -4, 20, -12, 26, -26); p.bezierCurveTo(14, -22, 6, -14, 2, -2); p.closePath(); }), '#ee3a4a', 1.8, { shade: false }); c.restore(); } },
  '★': (c) => { F(c, star(32, 33, 28, 12), '#ffd23a', 2.4); glint(c, 25, 24, 4.5); },
  '♥': (c) => { heart(c, 32, 30, 22, RED, 2.4); glint(c, 22, 22, 4.5); },
};

Object.assign(D, RELIC_ICONS);   // the relics of the second loot update live in art_relics.js (merged before ICON_KEYS is read)
// a few spare pictures other code asks for by name
const ALIAS = { '🍣': '🍣' };
export const ICON_KEYS = Object.keys(D);
const strip = (s) => String(s).replace(/️/g, '');
export const hasIcon = (k) => !!D[strip(k)];

const cache = new Map();
// the icon as a 2x canvas (128 px), cached
export function iconCanvas(key) {
  const k = ALIAS[strip(key)] || strip(key);
  let c = cache.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const f = D[k];
    if (f) { try { f(ctx); } catch (e) { /* a broken icon must never break the page */ } }
    cache.set(k, c);
  }
  return c;
}
const urls = new Map();
export function iconURL(key) {
  const k = strip(key);
  let u = urls.get(k);
  if (!u) { u = iconCanvas(k).toDataURL('image/png'); urls.set(k, u); }
  return u;
}

// replace known emoji in text nodes with <img class="gi"> and keep doing so as the page changes
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let RX = null;
function swapText(node) {
  const text = node.nodeValue;
  if (!text || !RX) return;
  RX.lastIndex = 0;
  if (!RX.test(text)) return;
  RX.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0, m;
  while ((m = RX.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const img = document.createElement('img');
    img.className = 'gi'; img.alt = ''; img.draggable = false; img.src = iconURL(m[0]);
    frag.appendChild(img);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  node.parentNode.replaceChild(frag, node);
}
function walk(root) {
  if (root.nodeType === 3) { if (!/^(SCRIPT|STYLE|TEXTAREA|CANVAS)$/.test(root.parentNode.nodeName)) swapText(root); return; }
  if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|CANVAS|IMG|INPUT)$/.test(root.nodeName)) return;
  const tw = document.createTreeWalker(root, 4);
  const list = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) list.push(n);
  for (const n of list) if (!/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)) swapText(n);
}
export function installGlyphs(root) {
  RX = new RegExp('(?:' + ICON_KEYS.map(esc).join('|') + ')\\uFE0F?', 'gu');
  walk(root);
  const mo = new MutationObserver((list) => {
    mo.disconnect();
    for (const m of list) {
      if (m.type === 'characterData') walk(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
    mo.observe(root, { childList: true, characterData: true, subtree: true });
  });
  mo.observe(root, { childList: true, characterData: true, subtree: true });
  return mo;
}
