// Battle tab side buttons (round 6, agent 19): one baked icon set (same chunky outline, same top-left light
// as the tab bar icons) instead of ten different system emoji. Headless: no document, so emoji stay.
const OUT = '#2a1408', S = 64, cache = {};
const grad = (g, y0, y1, a, b) => { const q = g.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; };
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const fs = (g, fill, w = 3) => { g.fillStyle = fill; g.fill(); g.lineWidth = w; g.strokeStyle = OUT; g.stroke(); };
const shine = (g, x, y, w, h) => { g.fillStyle = 'rgba(255,255,255,.38)'; g.fillRect(x, y, w, h); };

const DRAW = {
  calendar: g => {
    rr(g, 8, 12, 48, 46, 8); fs(g, grad(g, 12, 58, '#ffffff', '#d8e4ff'));
    rr(g, 8, 12, 48, 16, 8); fs(g, grad(g, 12, 28, '#ff7aa8', '#e03a6e'));
    g.fillStyle = '#e03a6e'; g.fillRect(9, 22, 46, 6);
    g.strokeStyle = OUT; g.lineWidth = 4; for (const x of [20, 44]) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 17); g.stroke(); }
    g.fillStyle = '#6a7ab8'; for (const [x, y] of [[17, 36], [29, 36], [41, 36], [17, 47], [29, 47]]) { g.beginPath(); g.arc(x + 3, y + 3, 3.2, 0, 7); g.fill(); }
    g.fillStyle = '#ff5cb8'; g.beginPath(); g.arc(44, 50, 4.6, 0, 7); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
  },
  ribbon: g => {
    for (const k of [-1, 1]) { g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + k * 8, 60); g.lineTo(32 + k * 15, 52); g.lineTo(32 + k * 21, 60); g.lineTo(32 + k * 20, 32); g.closePath(); fs(g, grad(g, 32, 60, '#ff8ab8', '#c42a68'), 2.8); }
    for (const k of [-1, 1]) { g.beginPath(); g.moveTo(32, 24); g.bezierCurveTo(32 + k * 14, 2, 32 + k * 30, 10, 32 + k * 26, 24); g.bezierCurveTo(32 + k * 30, 38, 32 + k * 14, 44, 32, 28); g.closePath(); fs(g, grad(g, 6, 40, '#ffb0d2', '#e0407a')); }
    g.beginPath(); g.arc(32, 26, 8, 0, 7); fs(g, grad(g, 18, 34, '#ffd0e4', '#e0407a'));
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(29, 23, 3, 2, -0.6, 0, 7); g.fill();
  },
  basket: g => {
    g.strokeStyle = OUT; g.lineWidth = 5.5; g.beginPath(); g.moveTo(14, 28); g.quadraticCurveTo(32, -6, 50, 28); g.stroke();
    g.strokeStyle = '#c98a44'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(14, 28); g.quadraticCurveTo(32, -6, 50, 28); g.stroke();
    g.fillStyle = '#7ad060'; for (const [x, y] of [[22, 26], [32, 22], [42, 26]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke(); }
    g.beginPath(); g.moveTo(6, 28); g.lineTo(58, 28); g.lineTo(51, 58); g.quadraticCurveTo(50, 60, 48, 60); g.lineTo(16, 60); g.quadraticCurveTo(14, 60, 13, 58); g.closePath(); fs(g, grad(g, 28, 60, '#e8b068', '#a8642a'));
    g.strokeStyle = 'rgba(80,40,10,.45)'; g.lineWidth = 2; for (let y = 36; y < 58; y += 8) { g.beginPath(); g.moveTo(10, y); g.lineTo(54, y); g.stroke(); }
    shine(g, 14, 31, 4, 24);
  },
  tent: g => {
    g.beginPath(); g.moveTo(32, 4); g.lineTo(32, 14); g.strokeStyle = OUT; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.moveTo(32, 4); g.lineTo(46, 8); g.lineTo(32, 11); g.closePath(); fs(g, '#ffd84d', 2);
    g.beginPath(); g.moveTo(32, 12); g.lineTo(58, 34); g.lineTo(6, 34); g.closePath(); fs(g, grad(g, 12, 34, '#ff8ab8', '#e0407a'));
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 12); g.lineTo(38, 34); g.lineTo(26, 34); g.closePath(); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    rr(g, 8, 34, 48, 24, 4); fs(g, grad(g, 34, 58, '#ffffff', '#ffc4de'));
    g.fillStyle = '#e0407a'; for (const x of [8, 24, 40]) g.fillRect(x, 35, 8, 22);
    g.beginPath(); g.moveTo(26, 58); g.lineTo(26, 46); g.quadraticCurveTo(32, 38, 38, 46); g.lineTo(38, 58); g.closePath(); fs(g, '#3a2a68', 2.5);
  },
  dress: g => {
    g.beginPath(); g.moveTo(24, 6); g.lineTo(28, 6); g.lineTo(32, 14); g.lineTo(36, 6); g.lineTo(40, 6); g.lineTo(42, 22); g.lineTo(48, 58); g.quadraticCurveTo(32, 64, 16, 58); g.lineTo(22, 22); g.closePath(); fs(g, grad(g, 6, 62, '#d8b4ff', '#8a4ce0'));
    rr(g, 21, 24, 22, 6, 3); fs(g, '#ffd84d', 2.5);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(26, 32); g.lineTo(22, 56); g.lineTo(27, 56); g.lineTo(30, 32); g.closePath(); g.fill();
  },
  trophy: g => {
    for (const k of [-1, 1]) { g.beginPath(); g.moveTo(32 + k * 17, 14); g.quadraticCurveTo(32 + k * 31, 14, 32 + k * 26, 28); g.quadraticCurveTo(32 + k * 22, 34, 32 + k * 14, 34); g.strokeStyle = OUT; g.lineWidth = 7; g.stroke(); g.strokeStyle = '#ffc83d'; g.lineWidth = 3; g.stroke(); }
    g.beginPath(); g.moveTo(14, 8); g.lineTo(50, 8); g.lineTo(48, 26); g.quadraticCurveTo(45, 42, 32, 42); g.quadraticCurveTo(19, 42, 16, 26); g.closePath(); fs(g, grad(g, 8, 42, '#fff3a0', '#f0a818'));
    shine(g, 19, 11, 4, 18);
    g.fillStyle = '#ffd84d'; g.fillRect(29, 41, 6, 8); g.strokeStyle = OUT; g.lineWidth = 2.5; g.strokeRect(29, 41, 6, 8);
    rr(g, 18, 49, 28, 10, 4); fs(g, grad(g, 49, 59, '#ff8ab8', '#c42a68'));
  },
  book: g => {
    g.beginPath(); g.moveTo(32, 14); g.quadraticCurveTo(20, 8, 5, 12); g.lineTo(5, 52); g.quadraticCurveTo(20, 48, 32, 56); g.quadraticCurveTo(44, 48, 59, 52); g.lineTo(59, 12); g.quadraticCurveTo(44, 8, 32, 14); g.closePath(); fs(g, grad(g, 8, 56, '#ffffff', '#cfdcff'));
    g.beginPath(); g.moveTo(32, 14); g.lineTo(32, 56); g.stroke();
    g.strokeStyle = '#8a9ad8'; g.lineWidth = 2.4; for (const y of [22, 29, 36]) { g.beginPath(); g.moveTo(10, y); g.lineTo(27, y + 1.5); g.stroke(); g.beginPath(); g.moveTo(37, y + 1.5); g.lineTo(54, y); g.stroke(); }
    g.beginPath(); g.moveTo(44, 12); g.lineTo(44, 30); g.lineTo(49, 25); g.lineTo(54, 30); g.lineTo(54, 12); g.closePath(); fs(g, '#ff5cb8', 2.5);
  },
  ticket: g => {
    g.save(); g.translate(32, 32); g.rotate(-0.28); g.translate(-32, -32);
    g.beginPath(); g.moveTo(4, 16); g.lineTo(60, 16); g.lineTo(60, 26); g.arc(60, 32, 6, -Math.PI / 2, Math.PI / 2, true); g.lineTo(60, 48); g.lineTo(4, 48); g.lineTo(4, 38); g.arc(4, 32, 6, Math.PI / 2, -Math.PI / 2, true); g.closePath(); fs(g, grad(g, 16, 48, '#ffe98a', '#f0a820'));
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(120,60,0,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(22, 20); g.lineTo(22, 44); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#c42a68'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? 4.5 : 10; g.lineTo(42 + Math.cos(a) * d, 32 + Math.sin(a) * d); } g.closePath(); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    g.restore();
  },
  wheel: g => {
    g.beginPath(); g.arc(32, 32, 27, 0, 7); fs(g, '#fff', 3.5);
    const cols = ['#ff5cb8', '#ffd84d', '#4fd8f0', '#8a5cf0', '#7ad060', '#ff8a4a'];
    cols.forEach((c, i) => { g.beginPath(); g.moveTo(32, 32); g.arc(32, 32, 23, i * Math.PI / 3 - Math.PI / 2, (i + 1) * Math.PI / 3 - Math.PI / 2); g.closePath(); g.fillStyle = c; g.fill(); g.lineWidth = 1.6; g.strokeStyle = OUT; g.stroke(); });
    g.beginPath(); g.arc(32, 32, 6, 0, 7); fs(g, grad(g, 26, 38, '#fff3a0', '#f0a818'), 2.5);
    g.beginPath(); g.moveTo(32, 2); g.lineTo(26, 12); g.lineTo(38, 12); g.closePath(); fs(g, '#ff3d5a', 2.5);
  },
  swap: g => {
    for (const [y, k] of [[20, 1], [44, -1]]) {
      const x0 = k > 0 ? 8 : 56, x1 = k > 0 ? 44 : 20;
      g.beginPath(); g.moveTo(x0, y - 7); g.lineTo(x1, y - 7); g.lineTo(x1, y - 15); g.lineTo(x1 + k * 20, y); g.lineTo(x1, y + 15); g.lineTo(x1, y + 7); g.lineTo(x0, y + 7); g.closePath();
      fs(g, grad(g, y - 15, y + 15, k > 0 ? '#9af0ff' : '#ffc0e0', k > 0 ? '#2fa8d8' : '#e0407a'));
    }
  },
};
const BY_LABEL = { 'Sign in': 'calendar', 'Fan Fund': 'ribbon', Backstage: 'basket', Wardrobe: 'dress', Trophies: 'trophy', Preview: 'book', Pass: 'ticket', Goals: 'wheel', Swap: 'swap' };

export function sideIconURL(name) {
  if (name in cache) return cache[name];
  if (typeof document === 'undefined' || !DRAW[name]) return (cache[name] = '');
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); if (!g) return (cache[name] = '');
  g.lineJoin = 'round'; g.lineCap = 'round'; DRAW[name](g);
  return (cache[name] = c.toDataURL());
}
export const SIDE_ICON_NAMES = Object.keys(DRAW);
export function sideIconFor(label) { return BY_LABEL[label] || 'tent'; }   // the event button changes its name, its icon stays the tent

// swap the emoji in the side buttons for baked icons (the <b> holds the emoji, the rest is the label)
export function paintSideIcons(el) {
  for (const b of el.querySelectorAll('.sidebtn')) {
    const s = b.querySelector('b'); if (!s || s.querySelector('img')) continue;
    const u = sideIconURL(sideIconFor((b.lastChild && b.lastChild.nodeType === 3 ? b.lastChild.textContent : '').trim()));
    if (u) s.innerHTML = `<img class="sico" src="${u}" alt="" draggable="false">`;
  }
}
export function watchSideIcons(el) {
  if (!el || el.dataset.si) return; el.dataset.si = '1';
  paintSideIcons(el);
  if (typeof MutationObserver === 'function') new MutationObserver(() => paintSideIcons(el)).observe(el, { childList: true });
}
