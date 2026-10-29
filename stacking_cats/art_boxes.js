// Drawings for the four lootboxes (cardboard box, wicker basket, silver fish chest, golden cat chest): same 64x64 board and cel-shaded
// style as art_icons.js, keyed by the plain character that BOXES in cats.js uses. art_icons.js merges BOX_ICONS into its own table.
// NOTE: keep every drawing on whole lines; never put a // comment in the middle of a line that holds code after it.
import { TAU, INK, cel, ell, poly, star, line, mix, mulberry } from './art_util.js';
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

// ---------------------------------------------------------------- hero drawings: the same boxes drawn big and juicy for the opening screen
// Every hero chest is drawn on a 100 x 100 board in two parts that overlay exactly: the BODY (contact shadow, the base with an empty
// dark inside where the lid sits, its surface detail) and the LID (closed, with its hollow rim showing along the bottom edge so it
// still looks whole while it flies and spins). boxHero is the body with the lid on top. boxParts hands out the layers plus the hinge
// and seam anchors, boxCrackOverlay the glowing cracks the opening screen fades in per tap.
const U = 100;
const grad = (ctx, x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
const vgrad = (ctx, y0, y1, stops) => grad(ctx, 0, y0, 0, y1, stops);
const radial = (ctx, x, y, r0, r1, stops) => { const g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
const rrp = (x, y, w, h, r) => P((p) => { p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath(); });
const ovl = (x, y, rx, ry, rot = 0) => P((p) => { p.ellipse(x, y, rx, ry, rot, 0, TAU); });
const fillP = (ctx, path, style) => { ctx.fillStyle = style; ctx.fill(path); };
const inkP = (ctx, path, lw = 2.6, col = INK) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(path); };
const inside = (ctx, path, fn) => { ctx.save(); ctx.clip(path); fn(); ctx.restore(); };
// a light (or dark) band hugging the inside of an edge: the path is stroked a little shifted and clipped to itself
const edge = (ctx, path, dx, dy, col, lw) => inside(ctx, path, () => { ctx.save(); ctx.translate(dx, dy); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(path); ctx.restore(); });
const fine = (ctx, pts, col, lw = 0.6) => ln(ctx, pts, col, lw);
const sparkle = (ctx, x, y, s, a = 1) => { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = radial(ctx, x, y, 0, s * 1.6, [[0, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]); ctx.beginPath(); ctx.arc(x, y, s * 1.6, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fill(star(x, y, s, s * 0.22, 4)); ctx.restore(); };
// a soft glossy blob: white in the middle fading out, the plastic toy shine
const sheen = (ctx, x, y, rx, ry, rot = 0, a = 0.75) => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx); ctx.fillStyle = radial(ctx, 0, 0, 0, rx, [[0, `rgba(255,255,255,${a})`], [0.55, `rgba(255,255,255,${a * 0.45})`], [1, 'rgba(255,255,255,0)']]); ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore(); };
const rivet = (ctx, x, y, r = 1.5, col = '#eef4fb', dark = '#5a6a86') => {
  dot(ctx, x + 0.35, y + 0.5, r + 0.7, 'rgba(25,15,40,.55)');
  ctx.fillStyle = radial(ctx, x - r * 0.35, y - r * 0.4, r * 0.1, r * 1.2, [[0, '#ffffff'], [0.35, col], [1, dark]]); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.55; ctx.stroke();
};
const gem = (ctx, x, y, r, col, deep) => {
  const p = poly(ctx, [[x, y - r], [x + r * 0.95, y - r * 0.25], [x + r * 0.6, y + r * 0.9], [x - r * 0.6, y + r * 0.9], [x - r * 0.95, y - r * 0.25]]);
  dot(ctx, x, y + 0.6, r * 1.15, 'rgba(25,15,40,.4)');
  fillP(ctx, p, radial(ctx, x - r * 0.3, y - r * 0.4, r * 0.1, r * 1.3, [[0, mix(col, '#ffffff', 0.55)], [0.45, col], [1, deep || mix(col, '#1a1030', 0.5)]]));
  ctx.save(); ctx.clip(p);
  fillP(ctx, poly(ctx, [[x - r * 0.45, y - r * 0.2], [x + r * 0.45, y - r * 0.2], [x + r * 0.28, y + r * 0.45], [x - r * 0.28, y + r * 0.45]]), 'rgba(255,255,255,.28)');
  fine(ctx, [[x - r, y - r * 0.25], [x + r, y - r * 0.25]], 'rgba(255,255,255,.55)', 0.4);
  fine(ctx, [[x, y - r], [x - r * 0.45, y - r * 0.2], [x - r * 0.6, y + r]], 'rgba(255,255,255,.4)', 0.4);
  fine(ctx, [[x, y - r], [x + r * 0.45, y - r * 0.2], [x + r * 0.6, y + r]], 'rgba(0,0,0,.2)', 0.4);
  ctx.restore();
  inkP(ctx, p, Math.max(0.7, r * 0.22));
  dot(ctx, x - r * 0.32, y - r * 0.42, r * 0.2, '#fff');
};
const contact = (ctx, cx, cy, rx, ry, a = 0.5) => { ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.fillStyle = radial(ctx, 0, 0, 0, rx, [[0, `rgba(20,8,36,${a})`], [0.6, `rgba(20,8,36,${a * 0.5})`], [1, 'rgba(20,8,36,0)']]); ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore(); };
// the empty inside seen through the open top: the rim's top face, then the deep dark hole with a little light on the back wall
const hollow = (ctx, rimPath, holePath, rimCol, y0, y1) => {
  fillP(ctx, rimPath, rimCol); inkP(ctx, rimPath, 2.2);
  fillP(ctx, holePath, vgrad(ctx, y0, y1, [[0, '#5a3550'], [0.35, '#2a1630'], [1, '#0d0614']]));
  inside(ctx, holePath, () => { contact(ctx, 50, y1, 30, 4, 0.6); fillP(ctx, rrp(0, y0 - 2, U, 2.6, 0), 'rgba(0,0,0,.35)'); });
  inkP(ctx, holePath, 1.4);
};
// the hollow underside of a lid: a dark crescent just under its front edge, so a lid in flight shows its inside rim
const lidLip = (ctx, x0, x1, y, depth = 2.6) => {
  const p = P((q) => { q.moveTo(x0 + 1, y - 0.6); q.quadraticCurveTo(50, y + depth * 1.4, x1 - 1, y - 0.6); q.quadraticCurveTo(50, y + depth * 0.4, x0 + 1, y - 0.6); q.closePath(); });
  fillP(ctx, p, '#160b20'); inkP(ctx, p, 1.1);
};
// a rope of little twisted bumps along a path made of points (rim rope, braided handle)
const braid = (ctx, pts, r, col, dark) => {
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i], p = ovl(x, y, r, r * 0.62, -0.7);
    fillP(ctx, p, radial(ctx, x - r * 0.3, y - r * 0.35, r * 0.1, r * 1.1, [[0, mix(col, '#ffffff', 0.5)], [0.5, col], [1, dark]]));
    inkP(ctx, p, 0.8, mix(dark, INK, 0.5));
  }
};
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
const along = (n, fn) => Array.from({ length: n }, (_, i) => fn(i / (n - 1)));

// ---------------------------------------------------------------- the four chests
const DOME_BODY = () => P((p) => { p.moveTo(15, 55); p.lineTo(85, 55); p.lineTo(84.5, 81); p.quadraticCurveTo(84.5, 88.5, 77, 88.5); p.lineTo(23, 88.5); p.quadraticCurveTo(15.5, 88.5, 15.5, 81); p.closePath(); });
const DOME_RIM = () => P((p) => { p.moveTo(15, 55.5); p.lineTo(19.5, 46.5); p.quadraticCurveTo(50, 43.6, 80.5, 46.5); p.lineTo(85, 55.5); p.closePath(); });
const DOME_HOLE = () => P((p) => { p.moveTo(20.5, 54.5); p.lineTo(23.5, 48.6); p.quadraticCurveTo(50, 46.4, 76.5, 48.6); p.lineTo(79.5, 54.5); p.closePath(); });
const DOME_LID = (top = 17) => P((p) => { p.moveTo(12.5, 57.5); p.lineTo(87.5, 57.5); p.lineTo(87.5, 42); p.bezierCurveTo(87.5, 24, 71, top, 50, top); p.bezierCurveTo(29, top, 12.5, 24, 12.5, 42); p.closePath(); });

const CHESTS = {
  // ---------- cardboard: a cosy kraft box with taped flaps, a paw stamp and a cat peeking out of the hand hole
  cardboard: {
    hinge: [50, 45.5], seam: [50, 57, 76], glow: ['#fffaf0', '#ffe6b0', '#ffc070'],
    silhouette: () => [rrp(15, 54, 70, 33.5, 3.5), P((p) => { p.moveTo(17, 27); p.lineTo(83, 27); p.lineTo(89, 41); p.lineTo(89, 57.5); p.lineTo(11, 57.5); p.lineTo(11, 41); p.closePath(); })],
    body(c) {
      const front = rrp(15, 54, 70, 33.5, 3.5);
      hollow(c, P((p) => { p.moveTo(15, 55); p.lineTo(20, 45); p.lineTo(80, 45); p.lineTo(85, 55); p.closePath(); }), P((p) => { p.moveTo(20, 54); p.lineTo(23.5, 47.6); p.lineTo(76.5, 47.6); p.lineTo(80, 54); p.closePath(); }), '#a86c34', 47, 54);
      fillP(c, front, vgrad(c, 54, 88, [[0, '#e0a25e'], [0.5, '#c98446'], [1, '#a7652e']]));
      inside(c, front, () => {
        for (let x = 17; x < 85; x += 2.2) fine(c, [[x, 55], [x + 0.3, 87]], 'rgba(120,70,30,.13)', 0.7);
        fillP(c, rrp(15, 54, 70, 5, 0), 'rgba(90,50,20,.25)');
        fillP(c, rrp(15, 54, 9, 34, 0), 'rgba(255,230,190,.12)');
        fillP(c, P((p) => { p.moveTo(70, 54); p.lineTo(85, 54); p.lineTo(85, 88); p.lineTo(66, 88); p.closePath(); }), 'rgba(80,40,15,.18)');
        contact(c, 60, 92, 40, 9, 0.35);
      });
      DETAIL.cardboard(c);
      edge(c, front, 1.4, 1.4, 'rgba(255,236,200,.55)', 1.6);
      inkP(c, front, 2.8);
    },
    lid(c) {
      const top = poly(c, [[17, 27], [83, 27], [89, 41], [11, 41]]);
      const front = rrp(11, 40.5, 78, 17, 2.5);
      fillP(c, top, vgrad(c, 27, 41, [[0, '#f2c07c'], [1, '#dc9e5a']]));
      inside(c, top, () => {
        for (let x = 10; x < 92; x += 2.4) fine(c, [[x, 27], [50 + (x - 50) * 1.12, 41]], 'rgba(140,80,30,.10)', 0.7);
        fillP(c, poly(c, [[17, 27], [50, 27], [50, 41], [11, 41]]), 'rgba(255,240,210,.12)');
        sheen(c, 34, 31, 14, 3.2, -0.05, 0.4);
      });
      inkP(c, top, 2.6);
      fine(c, [[50, 27.5], [50, 40.5]], 'rgba(110,60,25,.55)', 0.9);
      lidLip(c, 11, 89, 57.5, 2.2);
      fillP(c, front, vgrad(c, 40.5, 57.5, [[0, '#e8ae68'], [1, '#c4803e']]));
      inside(c, front, () => {
        for (let x = 12; x < 89; x += 2.2) fine(c, [[x, 41], [x, 57]], 'rgba(120,70,30,.12)', 0.7);
        fillP(c, rrp(11, 54.5, 78, 3, 0), 'rgba(90,45,15,.28)');
        sheen(c, 26, 45, 12, 2.2, 0, 0.35);
      });
      edge(c, front, 1.2, 1.2, 'rgba(255,240,210,.5)', 1.4);
      inkP(c, front, 2.6);
      // the tape: across the top and down the front, glossy with torn ends
      const tape = P((p) => { p.moveTo(44.5, 27); p.lineTo(55.5, 27); p.lineTo(56.5, 41); p.lineTo(56.5, 60.2); p.lineTo(54.6, 61.4); p.lineTo(52.4, 60.2); p.lineTo(50.2, 61.6); p.lineTo(48, 60.2); p.lineTo(45.6, 61.4); p.lineTo(43.5, 60.2); p.lineTo(43.5, 41); p.closePath(); });
      fillP(c, tape, vgrad(c, 27, 61, [[0, 'rgba(250,236,196,.96)'], [0.5, 'rgba(240,220,170,.94)'], [1, 'rgba(226,200,150,.94)']]));
      inside(c, tape, () => { fillP(c, rrp(44, 27, 3, 35, 0), 'rgba(255,255,255,.5)'); fillP(c, rrp(53.5, 27, 3, 35, 0), 'rgba(160,120,60,.2)'); for (let y = 30; y < 60; y += 3.5) fine(c, [[44, y], [57, y + 0.6]], 'rgba(255,255,255,.18)', 0.5); });
      inkP(c, tape, 1.2, '#6a4422');
      pawPrint(c, 50, 49.5, 3.4, 'rgba(200,80,60,.75)');
      // a scuffed corner and a few highlight glints on the edges
      fine(c, [[12.5, 42], [16, 41.2]], 'rgba(255,255,255,.7)', 1);
      sparkle(c, 21, 31, 2.6, 0.9); sparkle(c, 80, 44, 1.8, 0.7);
    },
  },
  // ---------- basket: honey wicker with a braided rim, a plush cushion peeking out, a bow on the handle and a paw toggle latch
  basket: {
    hinge: [50, 47], seam: [50, 57, 74], glow: ['#fffaf0', '#ffe0b8', '#ffb37a'],
    silhouette: () => [P((p) => { p.moveTo(11, 54); p.lineTo(89, 54); p.lineTo(81, 84); p.quadraticCurveTo(80, 89.5, 74, 89.5); p.lineTo(26, 89.5); p.quadraticCurveTo(20, 89.5, 19, 84); p.closePath(); }), P((p) => { p.moveTo(12, 57.5); p.lineTo(88, 57.5); p.lineTo(87, 46); p.bezierCurveTo(86, 33, 70, 29, 50, 29); p.bezierCurveTo(30, 29, 14, 33, 13, 46); p.closePath(); }), ovl(50, 22, 16, 11)],
    body(c) {
      const front = P((p) => { p.moveTo(13, 57); p.lineTo(87, 57); p.lineTo(81, 84); p.quadraticCurveTo(80, 89.5, 74, 89.5); p.lineTo(26, 89.5); p.quadraticCurveTo(20, 89.5, 19, 84); p.closePath(); });
      hollow(c, P((p) => { p.moveTo(12, 57.5); p.lineTo(18, 47); p.quadraticCurveTo(50, 44, 82, 47); p.lineTo(88, 57.5); p.closePath(); }), P((p) => { p.moveTo(18, 56.5); p.lineTo(22, 49.4); p.quadraticCurveTo(50, 46.8, 78, 49.4); p.lineTo(82, 56.5); p.closePath(); }), '#b97a38', 48, 56.5);
      fillP(c, front, vgrad(c, 57, 90, [[0, '#f2b860'], [0.55, '#d98e3e'], [1, '#a95f22']]));
      inside(c, front, () => {
        for (let row = 0; row < 9; row++) {
          const y = 58.5 + row * 3.6;
          for (let col = -1; col < 13; col++) {
            const x = 12 + col * 6.4 + (row % 2) * 3.2, s = ovl(x + 2.8, y + 1.6, 3.1, 1.75);
            fillP(c, s, vgrad(c, y, y + 3.3, [[0, 'rgba(255,226,160,.85)'], [0.6, 'rgba(226,150,70,.4)'], [1, 'rgba(120,64,20,.5)']]));
            fine(c, [[x + 1, y + 0.7], [x + 3.6, y + 0.6]], 'rgba(255,250,220,.55)', 0.5);
          }
          fine(c, [[12, y + 3.45], [88, y + 3.45]], 'rgba(90,45,12,.45)', 0.6);
        }
        for (let x = 18; x < 84; x += 6.4) fine(c, [[x, 57], [50 + (x - 50) * 0.86, 90]], 'rgba(110,56,16,.32)', 1.1);
        c.fillStyle = grad(c, 13, 0, 87, 0, [[0, 'rgba(255,240,210,.2)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(70,30,10,.34)']]); c.fillRect(0, 50, U, 45);
        contact(c, 50, 93, 42, 8, 0.3);
      });
      edge(c, front, 1.4, 1.2, 'rgba(255,236,190,.5)', 1.6);
      inkP(c, front, 2.8);
      // the braided rope rim
      braid(c, along(22, (t) => [13.5 + t * 73, 59.2 + Math.sin(t * Math.PI) * 0.8]), 2.6, '#e8a54e', '#8a4e18');
      DETAIL.basket(c);
    },
    lid(c) {
      const lid = P((p) => { p.moveTo(12, 57.5); p.lineTo(88, 57.5); p.lineTo(87, 46); p.bezierCurveTo(86, 33, 70, 29, 50, 29); p.bezierCurveTo(30, 29, 14, 33, 13, 46); p.closePath(); });
      // the handle first so the lid covers its ends: a braided arch with a pink bow
      const arch = (t) => [36 + t * 28, 33 - Math.sin(t * Math.PI) * 19];
      c.strokeStyle = INK; c.lineWidth = 7.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(36, 34); c.bezierCurveTo(37, 8, 63, 8, 64, 34); c.stroke();
      c.strokeStyle = '#c47c34'; c.lineWidth = 4.6; c.stroke();
      braid(c, along(13, arch), 2.2, '#f0b260', '#8a4e18');
      lidLip(c, 12, 88, 57.5, 2.4);
      fillP(c, lid, vgrad(c, 29, 58, [[0, '#f6c272'], [0.5, '#df9a48'], [1, '#b56c2a']]));
      inside(c, lid, () => {
        for (let row = 0; row < 8; row++) {
          const y = 29 + row * 3.6;
          for (let col = -1; col < 14; col++) {
            const x = 10 + col * 6.4 + (row % 2) * 3.2, cy = y + 1.6 + Math.pow((x + 2.8 - 50) / 40, 2) * 6;
            fillP(c, ovl(x + 2.8, cy, 3.1, 1.75), vgrad(c, cy - 1.7, cy + 1.7, [[0, 'rgba(255,232,170,.85)'], [0.6, 'rgba(226,150,70,.35)'], [1, 'rgba(120,64,20,.45)']]));
          }
        }
        c.fillStyle = grad(c, 12, 0, 88, 0, [[0, 'rgba(255,240,210,.2)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(70,30,10,.32)']]); c.fillRect(0, 25, U, 35);
        sheen(c, 33, 36, 15, 4, -0.18, 0.55);
      });
      edge(c, lid, 1.4, 1.4, 'rgba(255,240,200,.55)', 1.6);
      inkP(c, lid, 2.8);
      // a braided band along the lid edge
      braid(c, along(24, (t) => [13 + t * 74, 54.6]), 2.1, '#f2b25c', '#8a4e18');
      // the bow on the handle
      for (const s of [-1, 1]) {
        const w = P((p) => { p.moveTo(50, 14.5); p.bezierCurveTo(50 + s * 5, 7.5, 50 + s * 11, 9, 50 + s * 10, 15); p.bezierCurveTo(50 + s * 9, 19, 50 + s * 4, 17.5, 50, 14.5); p.closePath(); });
        fillP(c, w, vgrad(c, 8, 19, [[0, '#ffb3cf'], [1, '#e8527f']])); inside(c, w, () => sheen(c, 50 + s * 6, 11.5, 4, 1.5, 0, 0.7)); inkP(c, w, 1.4);
        const tail = poly(c, [[50, 15], [50 + s * 3.4, 22.5], [50 + s * 5.6, 21], [50 + s * 1.6, 15]]);
        fillP(c, tail, '#e8527f'); inkP(c, tail, 1.2);
      }
      const knot = ovl(50, 14.8, 2.6, 2.4); fillP(c, knot, '#ff8fb7'); inkP(c, knot, 1.2); dot(c, 49.2, 14, 0.8, '#fff');
      // the latch loop hanging from the lid front
      const loop = P((p) => { p.moveTo(46.8, 55); p.lineTo(46.8, 60.5); p.quadraticCurveTo(50, 63.4, 53.2, 60.5); p.lineTo(53.2, 55); });
      c.strokeStyle = INK; c.lineWidth = 3.2; c.stroke(loop); c.strokeStyle = '#b06a2a'; c.lineWidth = 1.6; c.stroke(loop);
      sparkle(c, 24, 38, 2.6, 0.9); sparkle(c, 62, 13, 1.8, 0.8);
    },
  },
  // ---------- silver: brushed steel with riveted straps, an enamel fish on the lid and a gold paw latch
  silver: {
    hinge: [50, 46], seam: [50, 56.5, 76], glow: ['#ffffff', '#dff4ff', '#ffd77a'],
    silhouette: () => [DOME_BODY(), DOME_LID(17)],
    body(c) {
      const front = DOME_BODY();
      hollow(c, DOME_RIM(), DOME_HOLE(), '#8ea2bf', 47, 54.5);
      fillP(c, front, vgrad(c, 55, 89, [[0, '#d7e3f2'], [0.45, '#a9bcd6'], [1, '#6f82a3']]));
      inside(c, front, () => {
        const r = mulberry(31);
        for (let y = 56; y < 89; y += 0.9) fine(c, [[15, y], [85, y + (r() - 0.5) * 0.4]], `rgba(${r() < 0.5 ? '255,255,255' : '40,60,100'},${0.05 + r() * 0.08})`, 0.5);
        c.fillStyle = grad(c, 15, 0, 85, 0, [[0, 'rgba(255,255,255,.25)'], [0.3, 'rgba(255,255,255,0)'], [0.75, 'rgba(255,255,255,0)'], [0.86, 'rgba(255,255,255,.22)'], [1, 'rgba(40,60,110,.25)']]); c.fillRect(0, 50, U, 45);
        fillP(c, rrp(15, 55, 70, 4.5, 0), 'rgba(30,40,80,.28)');
        contact(c, 50, 94, 42, 9, 0.3);
      });
      DETAIL.silver(c);
      edge(c, front, 1.3, 1.3, 'rgba(255,255,255,.7)', 1.5);
      edge(c, front, -1.4, 0, 'rgba(160,220,255,.6)', 1.4);
      inkP(c, front, 2.8);
    },
    lid(c) {
      const lid = DOME_LID(17);
      lidLip(c, 12.5, 87.5, 57.5, 2.4);
      fillP(c, lid, vgrad(c, 17, 58, [[0, '#f4f9ff'], [0.35, '#c9d7ea'], [0.75, '#94a8c6'], [1, '#71859f']]));
      inside(c, lid, () => {
        const r = mulberry(17);
        for (let y = 18; y < 58; y += 0.9) fine(c, [[12, y], [88, y + (r() - 0.5) * 0.4]], `rgba(${r() < 0.5 ? '255,255,255' : '40,60,100'},${0.04 + r() * 0.07})`, 0.5);
        c.fillStyle = grad(c, 12, 0, 88, 0, [[0, 'rgba(255,255,255,.2)'], [0.35, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,0)'], [1, 'rgba(40,60,110,.3)']]); c.fillRect(0, 15, U, 45);
        // the trim band along the bottom of the lid
        const band = rrp(10, 49.5, 80, 8, 0); fillP(c, band, vgrad(c, 49.5, 57.5, [[0, '#b8c8de'], [0.5, '#8296b4'], [1, '#5a6c8c']])); fine(c, [[10, 49.8], [90, 49.8]], 'rgba(255,255,255,.75)', 0.8); fine(c, [[10, 49.2], [90, 49.2]], INK, 1);
        // the big curved specular streak
        const streak = P((p) => { p.moveTo(18, 40); p.bezierCurveTo(20, 26, 32, 21, 46, 20.5); p.bezierCurveTo(34, 23.5, 25, 29, 23.5, 40); p.closePath(); });
        fillP(c, streak, 'rgba(255,255,255,.85)');
        sheen(c, 40, 26, 16, 4.5, -0.15, 0.6);
      });
      // straps over the dome
      for (const x of [27, 73]) {
        const s = rrp(x - 4, 10, 8, 47.5, 0);
        inside(c, lid, () => { fillP(c, s, grad(c, x - 4, 0, x + 4, 0, [[0, '#6a7c9c'], [0.35, '#b2c2da'], [1, '#55678a']])); inkP(c, s, 1.6); });
        for (const y of [30, 40, 52]) rivet(c, x, y, 1.4);
      }
      edge(c, lid, 1.4, 1.6, 'rgba(255,255,255,.8)', 1.6);
      edge(c, lid, -1.6, 0.4, 'rgba(150,215,255,.7)', 1.6);
      inkP(c, lid, 2.8);
      // the enamel fish emblem with a gold rim
      c.save(); c.translate(50, 36.5);
      const fish = P((p) => { p.moveTo(-11, 0); p.bezierCurveTo(-6, -8, 5, -8, 8, 0); p.bezierCurveTo(5, 8, -6, 8, -11, 0); p.closePath(); p.moveTo(7, 0); p.lineTo(14, -6.5); p.quadraticCurveTo(12, 0, 14, 6.5); p.closePath(); });
      c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 4.6; c.stroke(fish); c.strokeStyle = '#ffd24a'; c.lineWidth = 2.4; c.stroke(fish);
      fillP(c, fish, grad(c, 0, -7, 0, 7, [[0, '#8fdcff'], [0.5, '#3aa0ec'], [1, '#1f5fb8']]));
      inside(c, fish, () => {
        for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j++) { c.strokeStyle = 'rgba(200,240,255,.55)'; c.lineWidth = 0.6; c.beginPath(); c.arc(-3 + i * 2.8, j * 2.8, 1.8, -1.2, 1.2); c.stroke(); }
        sheen(c, -3, -3.5, 7, 2, -0.1, 0.8);
      });
      c.strokeStyle = 'rgba(255,248,200,.9)'; c.lineWidth = 0.6; c.stroke(fish);
      dot(c, -6.5, -1, 1.7, '#fff'); dot(c, -6.2, -0.9, 1, INK); dot(c, -6.6, -1.4, 0.35, '#fff');
      c.restore();
      // the gold paw latch hanging over the seam
      const hasp = rrp(45, 51, 10, 12, 3);
      fillP(c, hasp, vgrad(c, 51, 63, [[0, '#fff2a0'], [0.5, '#ffc93a'], [1, '#c77d10']])); inkP(c, hasp, 1.8);
      pawPrint(c, 50, 57.4, 2.4, '#8a4e08'); sheen(c, 47.5, 53.5, 2.6, 1.2, 0, 0.9);
      sparkle(c, 25, 27, 3.2); sparkle(c, 80, 33, 2, 0.8); sparkle(c, 62, 22, 1.6, 0.7);
    },
  },
  // ---------- golden: regal gold with a cat head crest, a row of jewels, velvet panels and a whiskered cat face lock, glowing
  golden: {
    hinge: [50, 46], seam: [50, 56.5, 76], glow: ['#ffffff', '#fff0a8', '#ffb830'],
    silhouette: () => [DOME_BODY(), DOME_LID(18), ovl(50, 16, 14, 11)],
    body(c, o = {}) {
      if (o.halo !== false) { c.fillStyle = radial(c, 50, 55, 4, 50, [[0, 'rgba(255,226,120,.55)'], [0.5, 'rgba(255,200,80,.22)'], [1, 'rgba(255,190,60,0)']]); c.fillRect(0, 0, U, U); }
      const front = DOME_BODY();
      hollow(c, DOME_RIM(), DOME_HOLE(), '#c98a1a', 47, 54.5);
      fillP(c, front, vgrad(c, 55, 89, [[0, '#ffe27a'], [0.4, '#f6b52c'], [1, '#b8670c']]));
      inside(c, front, () => {
        c.fillStyle = grad(c, 15, 0, 85, 0, [[0, 'rgba(255,255,230,.35)'], [0.3, 'rgba(255,255,255,0)'], [0.75, 'rgba(255,255,255,0)'], [0.88, 'rgba(255,250,210,.3)'], [1, 'rgba(120,50,0,.3)']]); c.fillRect(0, 50, U, 45);
        fillP(c, rrp(15, 55, 70, 4.5, 0), 'rgba(120,50,0,.3)');
        contact(c, 50, 94, 42, 9, 0.3);
      });
      DETAIL.golden(c);
      edge(c, front, 1.3, 1.3, 'rgba(255,255,230,.85)', 1.6);
      edge(c, front, -1.4, 0, 'rgba(255,240,170,.7)', 1.4);
      inkP(c, front, 2.8, '#2a1408');
    },
    lid(c) {
      const lid = DOME_LID(18);
      // the cat head crest sits on top of the dome, drawn first so the dome edge overlaps its chin
      const head = P((p) => { p.moveTo(38, 21); p.lineTo(37.5, 6.5); p.lineTo(45, 11.5); p.quadraticCurveTo(50, 10.2, 55, 11.5); p.lineTo(62.5, 6.5); p.lineTo(62, 21); p.bezierCurveTo(61, 27.5, 39, 27.5, 38, 21); p.closePath(); });
      fillP(c, head, vgrad(c, 6, 26, [[0, '#fff6b8'], [0.5, '#ffcc40'], [1, '#d48612']]));
      inside(c, head, () => { sheen(c, 44, 14, 6, 3, -0.3, 0.8); for (const s of [-1, 1]) fillP(c, poly(c, [[50 + s * 10.5, 8.6], [50 + s * 8.6, 13.4], [50 + s * 6, 12]]), '#ff8fb7'); });
      inkP(c, head, 2.2, '#2a1408');
      for (const s of [-1, 1]) gem(c, 50 + s * 4.6, 17.4, 2.3, '#5cd87a', '#1a7a3a');
      fillP(c, poly(c, [[48.4, 20.4], [51.6, 20.4], [50, 22]]), '#ff6f9a');
      for (const s of [-1, 1]) for (const dy of [-0.6, 1]) fine(c, [[50 + s * 7, 21 + dy], [50 + s * 14.5, 20 + dy * 2.2]], '#2a1408', 0.7);
      lidLip(c, 12.5, 87.5, 57.5, 2.4);
      fillP(c, lid, vgrad(c, 18, 58, [[0, '#fff7c4'], [0.3, '#ffd65a'], [0.75, '#f0a424'], [1, '#b8680c']]));
      inside(c, lid, () => {
        c.fillStyle = grad(c, 12, 0, 88, 0, [[0, 'rgba(255,255,230,.25)'], [0.35, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,0)'], [1, 'rgba(120,50,0,.35)']]); c.fillRect(0, 15, U, 45);
        // velvet panels between the gold ribs, then the ribs
        for (const [x0, x1] of [[17, 31], [69, 83]]) {
          const v = P((p) => { p.moveTo(x0, 49); p.lineTo(x0 + (x0 < 50 ? 1.5 : 0), 33); p.quadraticCurveTo((x0 + x1) / 2, x0 < 50 ? 25 : 25, x1 - (x0 < 50 ? 0 : 1.5), 30); p.lineTo(x1, 49); p.closePath(); });
          fillP(c, v, vgrad(c, 25, 49, [[0, '#d8345a'], [1, '#7a1030']])); inside(c, v, () => { for (let i = 0; i < 6; i++) dot(c, x0 + 3 + (i % 2) * 7, 33 + Math.floor(i / 2) * 6, 0.7, 'rgba(255,220,120,.7)'); sheen(c, x0 + 4, 34, 4, 6, 0, 0.3); }); inkP(c, v, 1.2, '#4a0a1c');
        }
        const band = rrp(10, 49.5, 80, 8, 0); fillP(c, band, vgrad(c, 49.5, 57.5, [[0, '#ffe680'], [0.5, '#e8a020'], [1, '#a85a08']])); fine(c, [[10, 49.8], [90, 49.8]], 'rgba(255,255,220,.85)', 0.8); fine(c, [[10, 49.2], [90, 49.2]], '#2a1408', 1);
        for (let x = 13; x < 88; x += 3) dot(c, x, 56, 0.55, 'rgba(255,250,210,.8)');
        const streak = P((p) => { p.moveTo(17, 41); p.bezierCurveTo(19, 27, 32, 22, 46, 21.5); p.bezierCurveTo(34, 24.5, 24, 30, 22.5, 41); p.closePath(); });
        fillP(c, streak, 'rgba(255,255,255,.9)');
        sheen(c, 42, 27, 17, 5, -0.15, 0.65);
      });
      for (const x of [33.5, 66.5]) { const rib = P((p) => { p.moveTo(x - 2.4, 57.5); p.lineTo(x - 2.4, 26); p.quadraticCurveTo(x, 23.5, x + 2.4, 25.5); p.lineTo(x + 2.4, 57.5); p.closePath(); }); inside(c, lid, () => { fillP(c, rib, grad(c, x - 2.4, 0, x + 2.4, 0, [[0, '#c87810'], [0.4, '#fff0a0'], [1, '#b06408']])); inkP(c, rib, 1.1, '#5a2a04'); }); }
      edge(c, lid, 1.4, 1.6, 'rgba(255,255,230,.9)', 1.6);
      edge(c, lid, -1.6, 0.4, 'rgba(255,240,170,.8)', 1.6);
      inkP(c, lid, 2.8, '#2a1408');
      // the jewel row on the trim band and a big sapphire up front
      for (const [x, col, deep] of [[22, '#ff4f6a', '#8a0a2a'], [40, '#5cd87a', '#126a32'], [60, '#5cd87a', '#126a32'], [78, '#ff4f6a', '#8a0a2a']]) gem(c, x, 53.5, 2.4, col, deep);
      gem(c, 50, 38, 5.2, '#4aa8ff', '#123a9a');
      // the latch tongue over the seam
      const hasp = P((p) => { p.moveTo(45.5, 52); p.lineTo(54.5, 52); p.lineTo(54.5, 59); p.quadraticCurveTo(50, 63.5, 45.5, 59); p.closePath(); });
      fillP(c, hasp, vgrad(c, 52, 62, [[0, '#fff4b0'], [0.5, '#ffc830'], [1, '#b86a08']])); inkP(c, hasp, 1.6, '#2a1408'); gem(c, 50, 57.2, 1.8, '#ff4f6a', '#8a0a2a');
      sparkle(c, 24, 28, 3.6); sparkle(c, 82, 36, 2.4, 0.9); sparkle(c, 58, 8, 2.2, 0.9); sparkle(c, 14, 50, 1.8, 0.7);
    },
  },
};

const DETAIL = {
  cardboard: (c) => {
    // the hand hole with a cat peeking out, a red paw stamp, "this way up" arrows and a little shipping label
    const hole = rrp(60, 62, 17, 7, 3.5);
    fillP(c, hole, vgrad(c, 62, 69, [[0, '#1a0c14'], [1, '#3a2018']])); inkP(c, hole, 1.6, '#5a3416');
    for (const dx of [-3.2, 3.2]) { const e = ovl(68.5 + dx, 65.6, 1.6, 2); fillP(c, e, '#ffe27a'); dot(c, 68.5 + dx, 65.7, 0.55, '#1a0c14'); c.fillStyle = '#1a0c14'; c.fillRect(68.5 + dx - 0.35, 64, 0.7, 3.2); dot(c, 68 + dx, 64.9, 0.4, '#fff'); }
    fine(c, [[60.5, 69.6], [76.5, 69.6]], 'rgba(255,230,190,.55)', 0.8);
    c.save(); c.translate(29, 72); c.rotate(-0.12);
    c.strokeStyle = 'rgba(196,62,48,.8)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, 6.6, 0, TAU); c.stroke();
    pawPrint(c, 0, 0.6, 3.2, 'rgba(196,62,48,.82)'); c.restore();
    for (const x of [58.5, 63.5]) { fine(c, [[x, 82], [x, 76]], 'rgba(90,50,20,.6)', 1); fine(c, [[x - 1.6, 77.6], [x, 76], [x + 1.6, 77.6]], 'rgba(90,50,20,.6)', 1); }
    c.save(); c.translate(73, 79); c.rotate(0.06); const lab = rrp(-6, -4, 12, 8, 1); fillP(c, lab, '#fff8ea'); inkP(c, lab, 0.8, '#8a6a4a'); for (const y of [-1.5, 0.5, 2.3]) fine(c, [[-4, y], [4 - (y > 1 ? 2 : 0), y]], 'rgba(120,90,60,.7)', 0.5); c.restore();
    // scuffs on the corners
    for (const [x, y, x2, y2] of [[17, 86, 21, 85.6], [80, 56.5, 83.5, 57], [40, 85.8, 44, 85.4]]) fine(c, [[x, y], [x2, y2]], 'rgba(255,240,210,.55)', 0.7);
    sparkle(c, 18.5, 58.5, 1.8, 0.8);
  },
  basket: (c) => {
    // the plush cushion draped over the front rim (its top tucks under the lid), stitched, with a tassel, and a paw toggle latch
    const cush = P((p) => { p.moveTo(17, 55); p.lineTo(43, 55); p.bezierCurveTo(44, 60, 41, 66, 36, 68.5); p.bezierCurveTo(31, 71, 27, 66, 24, 67); p.bezierCurveTo(20, 68, 17, 64, 17, 60); p.closePath(); });
    fillP(c, cush, vgrad(c, 55, 70, [[0, '#c8b0ff'], [0.5, '#9a7ae8'], [1, '#6a4cc0']]));
    inside(c, cush, () => { for (let x = 15; x < 46; x += 5) for (let y = 55; y < 72; y += 5) { fine(c, [[x, y], [x + 5, y + 5]], 'rgba(255,255,255,.18)', 1.2); fine(c, [[x + 5, y], [x, y + 5]], 'rgba(255,255,255,.18)', 1.2); } sheen(c, 26, 58.5, 8, 2.6, -0.1, 0.7); });
    inkP(c, cush, 1.8);
    c.save(); c.setLineDash([1.2, 1.4]); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(19.5, 60); c.bezierCurveTo(20, 64, 23, 65.4, 25, 64.6); c.bezierCurveTo(29, 63.4, 32, 67.6, 36, 65.6); c.bezierCurveTo(40, 63.4, 41.2, 59.6, 40.6, 57); c.stroke(); c.restore();
    c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.moveTo(36, 68.4); c.lineTo(37, 72.5); c.stroke();
    const tas = P((p) => { p.moveTo(37, 72); p.lineTo(39.4, 77.5); p.lineTo(34.8, 77.5); p.closePath(); }); fillP(c, tas, '#ffd24a'); inkP(c, tas, 1.1);
    dot(c, 37, 72.2, 1.6, '#ffd24a'); c.strokeStyle = INK; c.lineWidth = 0.8; c.beginPath(); c.arc(37, 72.2, 1.6, 0, TAU); c.stroke();
    // the paw toggle, carved wood
    const tog = ovl(50, 64.2, 5.4, 4.6); fillP(c, tog, radial(c, 48.5, 62.8, 0.5, 6, [[0, '#ffd89a'], [0.6, '#b87434'], [1, '#7a4416']])); inkP(c, tog, 1.6);
    pawPrint(c, 50, 64.6, 2.3, '#5a2c0c');
    sheen(c, 48, 62.4, 2.4, 1, 0, 0.8);
    sparkle(c, 80, 66, 1.8, 0.75); sparkle(c, 24, 84, 1.5, 0.6);
  },
  silver: (c) => {
    // riveted straps carrying on down the body, corner brackets, the lock plate with a keyhole and an etched fish row
    for (const x of [27, 73]) {
      const s = rrp(x - 4, 55, 8, 33.5, 0);
      inside(c, DOME_BODY(), () => { fillP(c, s, grad(c, x - 4, 0, x + 4, 0, [[0, '#5e7090'], [0.35, '#aebfd8'], [1, '#4e6084']])); inkP(c, s, 1.6); });
      for (const y of [62, 72, 82]) rivet(c, x, y, 1.4);
    }
    for (const [x, y, sx, sy] of [[15.5, 55, 1, 1], [84.5, 55, -1, 1], [15.5, 88.5, 1, -1], [84.5, 88.5, -1, -1]]) {
      const b = poly(c, [[x, y], [x + sx * 7, y], [x, y + sy * 7]]); fillP(c, b, '#7d8fae'); inkP(c, b, 1.2); rivet(c, x + sx * 2.2, y + sy * 2.2, 0.9);
    }
    const plate = rrp(42, 62, 16, 16, 4);
    fillP(c, plate, vgrad(c, 62, 78, [[0, '#f0f6ff'], [0.5, '#a9bcd6'], [1, '#6a7ea0']])); inkP(c, plate, 1.8);
    sheen(c, 46, 64.5, 4, 1.4, 0, 0.9);
    dot(c, 50, 69.4, 2, '#1e1630'); c.fillStyle = '#1e1630'; c.beginPath(); c.moveTo(48.8, 70); c.lineTo(51.2, 70); c.lineTo(51.8, 74.4); c.lineTo(48.2, 74.4); c.closePath(); c.fill();
    for (const [x, y] of [[44, 64], [56, 64], [44, 76], [56, 76]]) rivet(c, x, y, 0.75);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const x = 50 + s * (39 - i * 4.8) - 2; fine(c, [[x, 84], [x + 2.2, 82.6], [x + 3.6, 84], [x + 2.2, 85.4], [x, 84]], 'rgba(40,60,110,.5)', 0.6); fine(c, [[x + 3.6, 84], [x + 4.8, 83], [x + 4.8, 85], [x + 3.6, 84]], 'rgba(40,60,110,.5)', 0.6); }
    sparkle(c, 21, 60, 1.8, 0.8); sparkle(c, 80, 79, 1.6, 0.6);
  },
  golden: (c) => {
    // velvet panels with gold fish filigree, a whiskered cat face lock with jewel eyes, studs along the base and a few glints
    for (const [x0, x1] of [[19, 38], [62, 81]]) {
      const v = rrp(x0, 61, x1 - x0, 22, 3);
      fillP(c, v, vgrad(c, 61, 83, [[0, '#d8345a'], [1, '#6a0c28']])); inside(c, v, () => sheen(c, x0 + 5, 64, 6, 2, 0, 0.35)); inkP(c, v, 1.4, '#4a0a1c');
      const cx = (x0 + x1) / 2, s = x0 < 50 ? 1 : -1;
      const f = P((p) => { p.moveTo(cx - s * 6, 72); p.bezierCurveTo(cx - s * 2, 67, cx + s * 4, 68, cx + s * 5, 72); p.bezierCurveTo(cx + s * 4, 76, cx - s * 2, 77, cx - s * 6, 72); p.moveTo(cx + s * 5, 72); p.lineTo(cx + s * 8.4, 69); p.lineTo(cx + s * 8.4, 75); p.closePath(); });
      c.strokeStyle = '#3a0a14'; c.lineWidth = 2.2; c.stroke(f); c.strokeStyle = '#ffd24a'; c.lineWidth = 1.1; c.stroke(f);
      dot(c, cx - s * 3, 71.4, 0.7, '#ffd24a');
      for (const y of [64, 80]) for (const dx of [-6, 0, 6]) dot(c, cx + dx, y, 0.55, 'rgba(255,220,120,.8)');
    }
    // the cat face lock
    const face = P((p) => { p.moveTo(41, 64); p.lineTo(41.5, 58.5); p.lineTo(46, 61.6); p.quadraticCurveTo(50, 60.6, 54, 61.6); p.lineTo(58.5, 58.5); p.lineTo(59, 64); p.bezierCurveTo(61, 72, 56, 78.5, 50, 78.5); p.bezierCurveTo(44, 78.5, 39, 72, 41, 64); p.closePath(); });
    fillP(c, face, radial(c, 46, 64, 1, 16, [[0, '#fff8c8'], [0.45, '#ffd24a'], [1, '#c07010']])); inkP(c, face, 1.8, '#2a1408');
    for (const s of [-1, 1]) { gem(c, 50 + s * 4, 67.4, 2, '#5cd87a', '#126a32'); }
    fillP(c, poly(c, [[48.6, 71], [51.4, 71], [50, 72.6]]), '#ff6f9a');
    dot(c, 50, 74.6, 1.1, '#2a1408'); c.fillStyle = '#2a1408'; c.fillRect(49.5, 74.6, 1, 2.2);
    for (const s of [-1, 1]) for (const dy of [-0.8, 0.9]) fine(c, [[50 + s * 6, 72 + dy], [50 + s * 14, 71 + dy * 2.4]], '#2a1408', 0.7);
    for (let x = 18; x < 84; x += 3.2) dot(c, x, 86.2, 0.7, 'rgba(255,250,210,.85)');
    for (const [x, y] of [[18.5, 58], [81.5, 58]]) gem(c, x, y, 1.6, '#4aa8ff', '#123a9a');
    sparkle(c, 21, 66, 2, 0.9); sparkle(c, 79, 84, 1.8, 0.8); sparkle(c, 60, 82, 1.4, 0.7);
  },
};
const heroCache = new Map();
const blank = (px) => { const c = document.createElement('canvas'); c.width = c.height = px; return c; };
const board = (c, px) => { const x = c.getContext('2d'); x.scale(px / U, px / U); x.lineJoin = 'round'; x.lineCap = 'round'; return x; };
const safe = (fn) => { try { fn(); } catch (e) { /* the art is a bonus: never break the page over it */ } };
const chest = (tier) => CHESTS[tier] || CHESTS.cardboard;
const layer = (tier, px, part, o) => {
  const key = tier + ':' + part + ':' + px + (o ? JSON.stringify(o) : '');
  if (heroCache.has(key)) return heroCache.get(key);
  const c = blank(px), ctx = board(c, px), ch = chest(tier);
  if (part === 'body') { if (!o || o.shadow !== false) contact(ctx, 50, 89.5, 40, 6.5, 0.55); safe(() => ch.body(ctx, o || {})); }
  if (part === 'lid') safe(() => ch.lid(ctx));
  heroCache.set(key, c);
  return c;
};
// the big picture of a box (a canvas, cached): the body with its lid closed on top
export function boxHero(tier, px = 320) {
  const key = tier + px;
  if (heroCache.has(key)) return heroCache.get(key);
  const c = blank(px), ctx = c.getContext('2d');
  ctx.drawImage(layer(tier, px, 'body'), 0, 0); ctx.drawImage(layer(tier, px, 'lid'), 0, 0);
  heroCache.set(key, c);
  return c;
}

// the light that pours out of an opening chest: a hot core on the seam, a soft halo and a fan of rays, transparent at the edges
const glowLayer = (tier, px) => {
  const key = tier + ':glow:' + px;
  if (heroCache.has(key)) return heroCache.get(key);
  const c = blank(px), ctx = board(c, px), ch = chest(tier), [hot, warm, deep] = ch.glow, [sx, sy] = ch.seam;
  safe(() => {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, sx, sy, 0, 50, [[0, rgba(warm, 0.55)], [0.35, rgba(deep, 0.22)], [1, rgba(deep, 0)]]); ctx.fillRect(0, 0, U, U);
    const r = mulberry(7 + tier.length);
    for (let i = 0; i < 15; i++) {
      const a = -Math.PI / 2 + (i - 7) * 0.2 + (r() - 0.5) * 0.08, len = 38 + r() * 14, w = 0.035 + r() * 0.05;
      ctx.fillStyle = radial(ctx, sx, sy, 0, len, [[0, rgba(hot, 0.5)], [0.4, rgba(warm, 0.22)], [1, rgba(deep, 0)]]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, len, a - w, a + w); ctx.closePath(); ctx.fill();
    }
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.18);
    ctx.fillStyle = radial(ctx, 0, 0, 0, 44, [[0, rgba(hot, 1)], [0.3, rgba(hot, 0.7)], [0.7, rgba(warm, 0.25)], [1, rgba(deep, 0)]]); ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = radial(ctx, sx, sy, 0, 14, [[0, rgba(hot, 0.9)], [1, rgba(warm, 0)]]); ctx.beginPath(); ctx.arc(sx, sy, 14, 0, TAU); ctx.fill();
  });
  heroCache.set(key, c);
  return c;
};

// the chest in layers for the opening choreography: body, lid and glow are px by px canvases that overlay at the same origin
// (body + lid = boxHero). hinge is the back edge of the lid in canvas px (transform-origin for a flip), seam the centre and width
// of the line where the lid meets the body, where the light leaks out.
export function boxParts(tier, px = 320) {
  const key = tier + ':parts:' + px;
  if (heroCache.has(key)) return heroCache.get(key);
  const ch = chest(tier), k = px / U;
  const parts = {
    body: layer(tier, px, 'body'), lid: layer(tier, px, 'lid'), glow: glowLayer(tier, px), w: px, h: px,
    hinge: { x: ch.hinge[0] * k, y: ch.hinge[1] * k }, seam: { x: ch.seam[0] * k, y: ch.seam[1] * k, w: ch.seam[2] * k },
  };
  heroCache.set(key, parts);
  return parts;
}

// glowing hairline cracks and light leaks for the tap before the chest bursts: level 1 a hint along the seam, 2 more and brighter,
// 3 split all over and blazing. Cracks stay on the chest (masked by its outline), the seam leak spills a little past it.
export function boxCrackOverlay(tier, level, px = 320) {
  const lv = Math.max(1, Math.min(3, level | 0)), key = tier + ':crack' + lv + ':' + px;
  if (heroCache.has(key)) return heroCache.get(key);
  const c = blank(px), ch = chest(tier), [hot, warm, deep] = ch.glow, [sx, sy, sw] = ch.seam, k = px / U;
  safe(() => {
    const cr = blank(px), x = board(cr, px), r = mulberry(101 + tier.length * 7);
    const cracks = [];
    const walk = (x0, y0, ang, len, depth) => {
      const pts = [[x0, y0]]; let a = ang, px0 = x0, py0 = y0;
      for (let s = 0; s < len; s++) { a += (r() - 0.5) * 1.1; px0 += Math.cos(a) * 3.2; py0 += Math.sin(a) * 3.2; pts.push([px0, py0]); if (depth < 1 && r() < 0.28) walk(px0, py0, a + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.5), Math.max(2, (len - s) >> 1), depth + 1); }
      cracks.push(pts);
    };
    const n = [0, 4, 8, 13][lv];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, ox = sx - sw / 2 + 4 + t * (sw - 8) + (r() - 0.5) * 4, down = i % 2 === 0;
      walk(ox, sy + (down ? 0.5 : -0.5), (down ? Math.PI / 2 : -Math.PI / 2) + (r() - 0.5) * 1.2, 2 + lv * 1.6 + Math.floor(r() * (lv + 1)), lv > 1 ? 0 : 1);
    }
    if (lv === 3) for (let i = 0; i < 3; i++) walk(25 + r() * 50, 66 + r() * 16, r() * TAU, 3 + Math.floor(r() * 3), 1);
    const pass = (col, lw, blur) => { x.strokeStyle = col; x.lineWidth = lw; x.shadowColor = col; x.shadowBlur = blur * k; for (const pts of cracks) { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.stroke(); } };
    pass(rgba(deep, 0.35 + lv * 0.1), 1.8 + lv * 0.5, 3 + lv);
    pass(rgba(warm, 0.85), 0.8 + lv * 0.25, 1.5);
    pass(rgba(hot, 1), 0.35 + lv * 0.12, 0);
    x.shadowBlur = 0;
    // keep the cracks on the chest itself
    const m = blank(px), mx = board(m, px); mx.fillStyle = '#000'; for (const p of ch.silhouette()) mx.fill(p);
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
    const o = board(c, px);
    // the seam leak: a hot line along the lid edge with a soft halo, wider and brighter each level
    o.globalCompositeOperation = 'lighter';
    o.save(); o.translate(sx, sy); o.scale(1, 0.12 + lv * 0.05);
    o.fillStyle = radial(o, 0, 0, 0, sw * (0.45 + lv * 0.08), [[0, rgba(hot, 0.35 + lv * 0.2)], [0.5, rgba(warm, 0.18 + lv * 0.1)], [1, rgba(deep, 0)]]); o.beginPath(); o.arc(0, 0, sw * (0.45 + lv * 0.08), 0, TAU); o.fill();
    o.restore();
    o.strokeStyle = rgba(hot, 0.5 + lv * 0.16); o.lineWidth = 0.5 + lv * 0.45; o.shadowColor = rgba(warm, 1); o.shadowBlur = (2 + lv * 2) * k;
    o.beginPath(); o.moveTo(sx - sw / 2 + 3, sy); o.quadraticCurveTo(sx, sy + 1.4, sx + sw / 2 - 3, sy); o.stroke(); o.shadowBlur = 0;
    if (lv === 3) for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.32, len = 14 + (i % 2) * 6; o.fillStyle = radial(o, sx, sy, 0, len, [[0, rgba(hot, 0.4)], [1, rgba(warm, 0)]]); o.beginPath(); o.moveTo(sx, sy); o.arc(sx, sy, len, a - 0.06, a + 0.06); o.closePath(); o.fill(); }
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'lighter'; o.drawImage(cr, 0, 0);
    cr.width = cr.height = 0; m.width = m.height = 0;
  });
  heroCache.set(key, c);
  return c;
}
