// Drawings for the four lootboxes (cardboard box, wicker basket, silver fish chest, golden cat chest): same 64x64 board and cel-shaded
// style as art_icons.js, keyed by the plain character that BOXES in cats.js uses. art_icons.js merges BOX_ICONS into its own table.
// NOTE: keep every drawing on whole lines; never put a // comment in the middle of a line that holds code after it.
import { TAU, INK, cel, ell, poly, star, line } from './art_util.js';

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
