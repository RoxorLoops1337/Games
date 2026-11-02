// Small baked icons drawn with canvas, exported as data URLs (no image files).
// In a headless environment without a document every icon is an empty string.
const cache = {};
const S = 64;
function mk(draw) {
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); if (!g) return '';
  g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g); return c.toDataURL();
}
const grad = (g, y0, y1, a, b) => { const q = g.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; };
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function star(g, cx, cy, R, r, n = 5) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } g.closePath(); }
const OUT = '#2a1408';
function fillStroke(g, fill, w = 3) { g.fillStyle = fill; g.fill(); g.lineWidth = w; g.strokeStyle = OUT; g.stroke(); }

const DRAW = {
  // wooden chest body and lid are separate icons so CSS can lift the lid
  chestBody: g => {
    rr(g, 8, 30, 48, 28, 5); fillStroke(g, grad(g, 30, 58, '#c8843a', '#8a4d1e'));
    g.fillStyle = '#ffd84d'; g.fillRect(8, 38, 48, 5); g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(8, 38, 48, 5);
    rr(g, 27, 36, 10, 14, 3); fillStroke(g, grad(g, 36, 50, '#ffe98a', '#e0a020'), 2.5);
    g.fillStyle = OUT; g.beginPath(); g.arc(32, 42, 2, 0, 7); g.fill(); g.fillRect(31, 42, 2, 5);
  },
  chestLid: g => {
    g.beginPath(); g.moveTo(8, 34); g.lineTo(8, 24); g.quadraticCurveTo(32, 2, 56, 24); g.lineTo(56, 34); g.closePath(); fillStroke(g, grad(g, 6, 34, '#e0a05a', '#a35f26'));
    g.fillStyle = '#ffd84d'; g.fillRect(8, 28, 48, 6); g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(8, 28, 48, 6);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(22, 18, 8, 3, -0.5, 0, 7); g.fill();
  },
  chest: g => { DRAW.chestBody(g); DRAW.chestLid(g); },
  gift: g => {
    rr(g, 10, 26, 44, 30, 4); fillStroke(g, grad(g, 26, 56, '#ff6d9a', '#c02a5a'));
    rr(g, 6, 18, 52, 12, 4); fillStroke(g, grad(g, 18, 30, '#ff8db0', '#d83a6a'));
    g.fillStyle = '#ffe14a'; g.fillRect(28, 18, 8, 38); g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(28, 18, 8, 38);
    g.beginPath(); g.ellipse(23, 13, 9, 6, -0.4, 0, 7); fillStroke(g, '#ffe14a', 2.5); g.beginPath(); g.ellipse(41, 13, 9, 6, 0.4, 0, 7); fillStroke(g, '#ffe14a', 2.5);
  },
  bolt: g => { g.beginPath(); g.moveTo(38, 4); g.lineTo(14, 36); g.lineTo(28, 36); g.lineTo(22, 60); g.lineTo(50, 24); g.lineTo(35, 24); g.closePath(); fillStroke(g, grad(g, 4, 60, '#fff27a', '#ffa81f')); },
  star: g => { star(g, 32, 34, 28, 12); fillStroke(g, grad(g, 6, 60, '#fff27a', '#ffa81f')); },
  crown: g => {
    g.beginPath(); g.moveTo(8, 50); g.lineTo(6, 20); g.lineTo(20, 34); g.lineTo(32, 12); g.lineTo(44, 34); g.lineTo(58, 20); g.lineTo(56, 50); g.closePath(); fillStroke(g, grad(g, 12, 50, '#ffe98a', '#e09a1c'));
    g.fillStyle = '#ff4d6d'; g.beginPath(); g.arc(32, 40, 4.5, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#4fb8ff'; g.beginPath(); g.arc(17, 42, 3, 0, 7); g.fill(); g.beginPath(); g.arc(47, 42, 3, 0, 7); g.fill();
  },
  tag: g => {
    g.beginPath(); g.moveTo(6, 32); g.lineTo(28, 8); g.lineTo(56, 8); g.lineTo(56, 36); g.lineTo(32, 58); g.closePath(); fillStroke(g, grad(g, 8, 58, '#ff7a8a', '#d02a4a'));
    g.fillStyle = '#fff'; g.beginPath(); g.arc(44, 20, 5, 0, 7); g.fill(); g.stroke();
  },
  note: g => {
    g.fillStyle = OUT; g.fillRect(26, 10, 5, 36); g.fillRect(46, 6, 5, 36); g.beginPath(); g.moveTo(26, 8); g.lineTo(51, 2); g.lineTo(51, 14); g.lineTo(26, 20); g.fill();
    g.beginPath(); g.ellipse(21, 47, 10, 7.5, -0.4, 0, 7); fillStroke(g, '#9dff6d'); g.beginPath(); g.ellipse(41, 43, 10, 7.5, -0.4, 0, 7); fillStroke(g, '#9dff6d');
  },
  heart: g => { g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(-6, 30, 12, 4, 32, 20); g.bezierCurveTo(52, 4, 70, 30, 32, 56); g.closePath(); fillStroke(g, grad(g, 8, 56, '#ff7a9a', '#d02a4a')); },
  speaker: g => {
    g.beginPath(); g.moveTo(6, 24); g.lineTo(18, 24); g.lineTo(34, 10); g.lineTo(34, 54); g.lineTo(18, 40); g.lineTo(6, 40); g.closePath(); fillStroke(g, grad(g, 10, 54, '#b8c8ff', '#6a7ee0'));
    g.strokeStyle = '#4fb8ff'; g.lineWidth = 5; g.beginPath(); g.arc(36, 32, 10, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(36, 32, 20, -0.9, 0.9); g.stroke();
  },
  clock: g => {
    g.beginPath(); g.arc(32, 34, 24, 0, 7); fillStroke(g, grad(g, 10, 58, '#ffffff', '#c8d4ee'));
    g.strokeStyle = OUT; g.lineWidth = 4; g.beginPath(); g.moveTo(32, 34); g.lineTo(32, 18); g.moveTo(32, 34); g.lineTo(44, 40); g.stroke();
    g.fillStyle = '#ff4d6d'; g.beginPath(); g.arc(32, 8, 5, 0, 7); g.fill(); g.lineWidth = 2; g.stroke();
  },
  mic: g => {
    rr(g, 22, 4, 20, 32, 10); fillStroke(g, grad(g, 4, 36, '#c8d0e0', '#7a86a0'));
    g.strokeStyle = OUT; g.lineWidth = 2; for (let y = 12; y < 32; y += 6) { g.beginPath(); g.moveTo(24, y); g.lineTo(40, y); g.stroke(); }
    g.strokeStyle = '#7a86a0'; g.lineWidth = 5; g.beginPath(); g.arc(32, 28, 16, 0.1, Math.PI - 0.1); g.stroke(); g.fillStyle = '#7a86a0'; g.fillRect(30, 44, 4, 10); g.fillRect(20, 54, 24, 5);
  },
  sparkle: g => { star(g, 32, 32, 28, 7, 4); fillStroke(g, grad(g, 4, 60, '#ffffff', '#ff9ad6')); star(g, 50, 12, 9, 2.5, 4); g.fillStyle = '#fff'; g.fill(); },
  egg: g => { g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(54, 4, 58, 56, 32, 58); g.bezierCurveTo(6, 56, 10, 4, 32, 4); fillStroke(g, grad(g, 4, 58, '#fff6dc', '#f0c88a')); g.fillStyle = '#ff9ad6'; g.beginPath(); g.arc(24, 36, 4, 0, 7); g.arc(38, 28, 3.5, 0, 7); g.arc(40, 44, 3, 0, 7); g.fill(); },
  coins: g => { for (const [x, y] of [[22, 44], [42, 44], [32, 28]]) { g.beginPath(); g.ellipse(x, y, 16, 10, 0, 0, 7); fillStroke(g, grad(g, y - 10, y + 10, '#ffe98a', '#e0a020'), 2.5); } },
  cart: g => { g.strokeStyle = OUT; g.lineWidth = 4; g.beginPath(); g.moveTo(4, 10); g.lineTo(14, 10); g.lineTo(20, 40); g.lineTo(50, 40); g.stroke(); g.beginPath(); g.moveTo(16, 18); g.lineTo(56, 18); g.lineTo(50, 36); g.lineTo(19, 36); g.closePath(); fillStroke(g, grad(g, 18, 36, '#9dff6d', '#4ab04a'), 3); for (const x of [24, 46]) { g.beginPath(); g.arc(x, 52, 5, 0, 7); fillStroke(g, '#fff', 2.5); } },

  // hats and accessories for the wardrobe, drawn to sit on a head (anchor near the bottom centre; glasses sit on the eyes)
  hat_overalls: g => {   // a straw hat with a wheat ear
    g.beginPath(); g.ellipse(32, 44, 29, 9, 0, 0, 7); fillStroke(g, grad(g, 36, 52, '#f6d98a', '#d6a64a'));
    g.beginPath(); g.moveTo(15, 42); g.quadraticCurveTo(14, 14, 32, 13); g.quadraticCurveTo(50, 14, 49, 42); g.closePath(); fillStroke(g, grad(g, 13, 42, '#ffe9a0', '#e2b552'));
    g.fillStyle = '#c0392b'; g.fillRect(15, 33, 34, 6); g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(15, 33, 34, 6);
    g.strokeStyle = '#7a9a1c'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(46, 36); g.lineTo(54, 12); g.stroke();
    for (const [x, y] of [[54, 12], [51, 19], [57, 18], [49, 26], [55, 25]]) { g.beginPath(); g.ellipse(x, y, 2.6, 4.2, 0.5, 0, 7); fillStroke(g, '#ffd84d', 1.4); }
  },
  hat_jacket: g => {   // a sparkle tiara
    g.beginPath(); g.moveTo(6, 48); g.lineTo(10, 24); g.lineTo(21, 38); g.lineTo(32, 14); g.lineTo(43, 38); g.lineTo(54, 24); g.lineTo(58, 48); g.closePath(); fillStroke(g, grad(g, 14, 48, '#fff6a0', '#f0b020'));
    g.fillStyle = '#ff7eb6'; g.beginPath(); g.arc(32, 38, 4.5, 0, 7); g.fill(); g.lineWidth = 2; g.stroke();
    star(g, 32, 7, 6, 2.4, 4); g.fillStyle = '#fff'; g.fill(); star(g, 10, 16, 5, 2, 4); g.fill(); star(g, 54, 16, 5, 2, 4); g.fill();
  },
  hat_wig: g => {   // a rainbow wig: bands of colour over the top of the head
    const cols = ['#ff5a78', '#ffb04d', '#ffe14a', '#6fe08a', '#4fb8ff', '#b06cff'];
    for (let i = 0; i < cols.length; i++) { const r = 29 - i * 4; g.beginPath(); g.arc(32, 50, r, Math.PI, 0); g.closePath(); g.fillStyle = cols[i]; g.fill(); if (!i) { g.lineWidth = 3; g.strokeStyle = OUT; g.stroke(); } }
    g.beginPath(); g.ellipse(7, 52, 5, 9, 0.1, 0, 7); fillStroke(g, '#ff5a78', 2.5); g.beginPath(); g.ellipse(57, 52, 5, 9, -0.1, 0, 7); fillStroke(g, '#b06cff', 2.5);
  },
  hat_tux: g => {   // a soft top hat
    g.beginPath(); g.ellipse(32, 48, 28, 7, 0, 0, 7); fillStroke(g, grad(g, 42, 54, '#4a5270', '#232840'));
    rr(g, 15, 8, 34, 40, 5); fillStroke(g, grad(g, 8, 48, '#4a5270', '#232840'));
    g.fillStyle = '#ff4d6d'; g.fillRect(15, 34, 34, 7); g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(15, 34, 34, 7);
    g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(20, 12, 4, 20);
  },
  hat_bloom: g => {   // a flower crown
    g.strokeStyle = '#4a9a3a'; g.lineWidth = 5; g.beginPath(); g.moveTo(4, 44); g.quadraticCurveTo(32, 30, 60, 44); g.stroke();
    for (const [x, y, c] of [[12, 42, '#ff9ac0'], [32, 32, '#ffd0e4'], [52, 42, '#ff9ac0'], [22, 35, '#fff3a0'], [42, 35, '#fff3a0']]) {
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; g.beginPath(); g.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.4, 0, 7); fillStroke(g, c, 1.6); }
      g.beginPath(); g.arc(x, y, 3.2, 0, 7); fillStroke(g, '#ffb020', 1.4);
    }
  },
  hat_sun: g => {   // round sunny shades
    g.strokeStyle = OUT; g.lineWidth = 4; g.beginPath(); g.moveTo(26, 30); g.quadraticCurveTo(32, 26, 38, 30); g.stroke();
    g.beginPath(); g.arc(17, 34, 13, 0, 7); fillStroke(g, grad(g, 20, 48, '#ffb04d', '#c0481c')); g.beginPath(); g.arc(47, 34, 13, 0, 7); fillStroke(g, grad(g, 20, 48, '#ffb04d', '#c0481c'));
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.beginPath(); g.arc(17, 34, 8, 3.6, 4.6); g.stroke(); g.beginPath(); g.arc(47, 34, 8, 3.6, 4.6); g.stroke();
  },
  hat_pumpkin: g => {   // a pumpkin hat with a leafy stem
    for (const [x, w] of [[16, 15], [48, 15], [26, 18], [38, 18]]) { g.beginPath(); g.ellipse(x, 36, w * 0.6, 20, 0, 0, 7); fillStroke(g, grad(g, 16, 56, '#ffb04d', '#e0701c'), 2.5); }
    g.beginPath(); g.ellipse(32, 36, 9, 20, 0, 0, 7); fillStroke(g, grad(g, 16, 56, '#ffc060', '#e8801c'), 2.5);
    g.fillStyle = OUT; g.beginPath(); g.moveTo(22, 30); g.lineTo(28, 36); g.lineTo(16, 36); g.fill(); g.beginPath(); g.moveTo(42, 30); g.lineTo(48, 36); g.lineTo(36, 36); g.fill();
    g.beginPath(); g.moveTo(20, 44); g.quadraticCurveTo(32, 54, 44, 44); g.lineWidth = 3.5; g.stroke();
    rr(g, 28, 6, 8, 11, 3); fillStroke(g, '#6a8a2a', 2.5);
  },
  hat_snow: g => {   // a knitted snow beanie with a pompom
    g.beginPath(); g.moveTo(8, 46); g.quadraticCurveTo(8, 12, 32, 12); g.quadraticCurveTo(56, 12, 56, 46); g.closePath(); fillStroke(g, grad(g, 12, 46, '#ffffff', '#bfe9ff'));
    rr(g, 5, 38, 54, 13, 6); fillStroke(g, grad(g, 38, 51, '#ff5a78', '#c02a4a'));
    g.strokeStyle = 'rgba(160,200,230,.9)'; g.lineWidth = 2; for (let x = 14; x < 54; x += 8) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x - 2, 36); g.stroke(); }
    g.beginPath(); g.arc(32, 9, 7, 0, 7); fillStroke(g, '#ffffff', 2.5);
  },
};

export function iconURL(name) {
  if (name in cache) return cache[name];
  return (cache[name] = DRAW[name] ? mk(DRAW[name]) : '');
}
export const ICON_NAMES = Object.keys(DRAW);
// an <img> tag string, class `cico`, optional size in px
export function ico(name, px) {
  const u = iconURL(name);
  return u ? `<img class="cico" src="${u}" alt=""${px ? ` style="width:${px}px;height:${px}px"` : ''}>` : '';
}
