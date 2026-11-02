// 02-animal-art (round 3): the in-run outfit hats, drawn in the same cel style as the animals and
// baked once per hat. The old emoji glyph looked different on every phone; these never do.
import { INK, shade } from './art_draw.js';
const TAU = Math.PI * 2;
const circ = (x, y, r) => g => { g.beginPath(); g.arc(x, y, r, 0, TAU); };
const ell = (x, y, rx, ry, rot = 0) => g => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); };
const poly = pts => g => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
const rrect = (x, y, w, h, r) => g => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };

// flat cel: base, one shadow crescent, one gloss streak, ink outline
function fill(g, base, path, o = {}) {
  const lw = o.lw == null ? 2.6 : o.lw, sh = o.sh || shade(base, 0.3);
  g.save(); path(g); g.clip(); g.fillStyle = sh; g.fillRect(-200, -200, 400, 400);
  g.save(); g.translate(2.2, -2.2); path(g); g.fillStyle = base; g.fill(); g.restore();
  if (o.gloss !== false) { g.globalAlpha = 0.55; g.strokeStyle = '#fff'; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.arc(o.gx || 0, o.gy || 0, o.gr || 14, -1.3, -0.5); g.stroke(); }
  g.restore();
  if (lw) { g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = INK; path(g); g.stroke(); }
}
function spark(g, x, y, r, col = '#fff8ec') {
  g.save(); g.translate(x, y); g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, rr = i % 2 ? r * 0.22 : r; if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 1.4; g.strokeStyle = INK; g.stroke(); g.restore();
}
function ln(g, pts, w, col) { g.lineWidth = w; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }

// every hat is drawn around (0,0) = the middle of the brim, about 60 units wide
export const HATS = {
  '🌾': g => {   // straw hat with a wheat sprig
    fill(g, '#f2cf7a', ell(0, 6, 32, 9), { sh: '#c99a42', gx: 0, gy: 6, gr: 22 });
    fill(g, '#f7dc92', poly([[-17, 6], [-14, -14], [-6, -20], [6, -20], [14, -14], [17, 6]]), { sh: '#d2a64c', gr: 12, gy: -4 });
    fill(g, '#9dff6d', rrect(-17, -3, 34, 8, 3), { gloss: false, sh: '#5fb85f', lw: 2 });
    for (const a of [0.2, 0.55]) { g.save(); g.translate(13, 0); g.rotate(a); for (let i = 0; i < 3; i++) fill(g, '#ffe14a', ell(0, -9 - i * 6, 3, 4.6, 0.3 * (i % 2 ? 1 : -1)), { gloss: false, lw: 1.6, sh: '#d49a1e' }); g.restore(); }
  },
  '✨': g => {   // sequin party hat
    fill(g, '#ffe14a', poly([[-19, 6], [0, -34], [19, 6]]), { sh: '#d49a1e', gx: -2, gy: -8, gr: 16 });
    for (const [x, y, c] of [[-6, -2, '#ff7eb6'], [5, -10, '#6fe3ff'], [4, 0, '#ffffff'], [-1, -18, '#ff7eb6']]) { g.fillStyle = c; circ(x, y, 2.4)(g); g.fill(); }
    fill(g, '#ff7eb6', ell(0, 6, 22, 5), { sh: '#c93a8f', gloss: false, lw: 2.2 });
    spark(g, 0, -36, 7, '#fff8ec'); spark(g, 22, -16, 4); spark(g, -24, -8, 3.4, '#ffd9ef');
  },
  '🌈': g => {   // rainbow wig: a ring of colourful puffs
    const cols = ['#ff5a78', '#ff9a2e', '#ffe14a', '#7ad04a', '#4fc8ff', '#b06cff'];
    cols.forEach((c, i) => { const a = Math.PI + (i / 5) * Math.PI; fill(g, c, circ(Math.cos(a) * 22, Math.sin(a) * 18 + 6, 11), { gloss: false, lw: 2.2, sh: shade(c, 0.28) }); });
    for (let i = 0; i < 3; i++) { const c = cols[2 + i], a = Math.PI + (0.3 + i * 0.7) / 2.1 * Math.PI; fill(g, c, circ(Math.cos(a) * 10, Math.sin(a) * 12 + 2, 9), { gloss: false, lw: 2, sh: shade(c, 0.25) }); }
    g.save(); g.globalAlpha = 0.7; g.strokeStyle = '#fff'; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.arc(-4, 2, 15, -2.6, -1.8); g.stroke(); g.restore();
    spark(g, 25, -12, 5);
  },
  '🎩': g => {   // top hat with a pink band
    fill(g, '#3a3f58', ell(0, 8, 28, 7), { sh: '#23263a', gloss: false });
    fill(g, '#4a5070', rrect(-17, -26, 34, 34, 4), { sh: '#2b2f48', gx: -2, gy: -8, gr: 20 });
    fill(g, '#ff7eb6', rrect(-17, -3, 34, 9, 1), { sh: '#c93a8f', gloss: false, lw: 2 });
    spark(g, 8, -14, 4.5, '#fff8ec');
  },
  '🌸': g => {   // flower crown
    const arc = [[-26, 4], [-14, -4], [0, -6], [14, -4], [26, 4]];
    ln(g, arc, 7, INK); ln(g, arc, 3.6, '#5fb85f');
    for (const [x, y, c, r] of [[-22, 3, '#ffb3cf', 7], [-8, -5, '#fff4dc', 7], [8, -5, '#ffb3cf', 7.5], [22, 3, '#c9a8ff', 7], [0, -9, '#ffe14a', 6.5]]) {
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - 1.57; fill(g, c, circ(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55), { gloss: false, lw: 1.6, sh: shade(c, 0.2) }); }
      fill(g, '#ffd84d', circ(x, y, r * 0.38), { gloss: false, lw: 1.5, sh: '#e0a82a' });
    }
  },
  '🕶️': g => {   // sunny shades pushed up on the head
    fill(g, '#2d2640', ell(-12, 0, 13, 9.5), { sh: '#171226', gx: -14, gy: -2, gr: 8 });
    fill(g, '#2d2640', ell(12, 0, 13, 9.5), { sh: '#171226', gx: 10, gy: -2, gr: 8 });
    ln(g, [[-2, -2], [2, -2]], 4, INK); ln(g, [[-24, -3], [-30, -8]], 3, INK); ln(g, [[24, -3], [30, -8]], 3, INK);
    ln(g, [[-18, -3], [-12, -6]], 2.2, '#ffb04d'); ln(g, [[6, -3], [12, -6]], 2.2, '#ffb04d');
    spark(g, 26, -14, 5, '#fff4b0');
  },
  '🎃': g => {   // pumpkin hat with a carved grin
    fill(g, '#5fb85f', rrect(-3, -30, 6, 12, 2), { gloss: false, sh: '#2f7a3a', lw: 2.2 });
    ln(g, [[3, -28], [10, -32], [14, -27]], 3.6, INK); ln(g, [[3, -28], [10, -32], [14, -27]], 1.6, '#7ad04a');
    fill(g, '#ff9a2e', ell(-11, -2, 13, 17), { sh: '#d6601a', gloss: false }); fill(g, '#ff9a2e', ell(11, -2, 13, 17), { sh: '#d6601a', gloss: false });
    fill(g, '#ffa94d', ell(0, -2, 13, 18), { sh: '#d6601a', gx: -3, gy: -3, gr: 12 });
    g.fillStyle = '#ffe14a'; for (const s of [-1, 1]) { poly([[s * 9 - 3.5, -6], [s * 9 + 3.5, -6], [s * 9, -11]])(g); g.fill(); }
    g.beginPath(); g.moveTo(-9, 4); g.quadraticCurveTo(0, 12, 9, 4); g.lineTo(6, 3); g.lineTo(3, 6); g.lineTo(0, 3); g.lineTo(-3, 6); g.lineTo(-6, 3); g.closePath(); g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  },
  '⛄': g => {   // knit beanie with a pompom
    const cap = poly([[-20, 8], [-17, -14], [-8, -22], [8, -22], [17, -14], [20, 8]]);
    fill(g, '#6fc8ff', cap, { sh: '#3d8fd6', gx: -2, gy: -6, gr: 16 });
    g.save(); cap(g); g.clip(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 7 - 4, -24); g.lineTo(i * 7 + 4, 4); g.stroke(); } g.restore();
    fill(g, '#ffffff', rrect(-22, -2, 44, 11, 5), { sh: '#c9d8f2', gloss: false, lw: 2.4 });
    fill(g, '#ffffff', circ(0, -27, 8), { sh: '#c9d8f2', gx: -1, gy: -27, gr: 5 });
    spark(g, 24, -18, 4.2, '#e6f8ff'); spark(g, -24, -12, 3.2, '#e6f8ff');
  },
};

const HAT_KEY = Object.create(null);   // the cache key string is built once per hat, not every frame
export function bakeHat(kit, hat) {
  if (!kit || !kit.bake) return null;
  const fn = HATS[hat]; if (!fn) return null;
  return kit.bake(HAT_KEY[hat] || (HAT_KEY[hat] = 'hat|' + hat), 86, 86, g => { g.translate(0, 8); fn(g); }, 2);
}
