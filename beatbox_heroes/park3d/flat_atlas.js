// Flat3D decal atlas (Interior Artist): one 2048x1024 canvas holding every poster, screen, sleeve, sign, rug, mat and notice in the flat.
// Canvas drawn so it needs no image files. Returns { tex, rect: { name: [u0,v0,u1,v1] } }.
import { THREE, canvasTex } from './kit.js';

const INK = '#2b2438', CREAM = '#f5ead2', PINK = '#ff4f8b', TEAL = '#29d3c7', YEL = '#ffd23f', VIO = '#7b5cff', LIME = '#9dff4a', ORANGE = '#ff8a3d', RED = '#e0453f', CYAN = '#35f2e0';
const FONT = '"Arial Black", "Trebuchet MS", system-ui, sans-serif';
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
function txt(g, s, x, y, size, color, o) { o = o || {}; g.font = `${o.weight || 'bold'} ${size}px ${FONT}`; g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; if (o.stroke) { g.lineWidth = o.sw || size * 0.14; g.strokeStyle = o.stroke; g.lineJoin = 'round'; g.strokeText(s, x, y); } g.fillStyle = color; g.fillText(s, x, y); }
const grad = (g, x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([t, c]) => gr.addColorStop(t, c)); return gr; };

export function makeFlatAtlas() {
  const W = 2048, H = 1024, rect = {}, jobs = [];
  const item = (name, x, y, w, h, fn) => { rect[name] = [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H]; jobs.push([x, y, w, h, fn]); };

  // ---- posters 256x360
  item('poster_a', 0, 0, 256, 360, (g, w, h) => { // BEAT BATTLE: burst and mic
    g.fillStyle = grad(g, 0, 0, 0, h, [[0, '#ff4f8b'], [1, '#7b2f8f']]); g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,210,63,0.9)'; g.beginPath(); for (let i = 0; i < 28; i++) { const a = (i / 28) * 6.283, r = i % 2 ? 70 : 118; g.lineTo(128 + Math.cos(a) * r, 150 + Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(128, 132, 44, 0, 7); g.fill(); g.fillStyle = '#ff9ab8'; g.beginPath(); g.arc(128, 132, 36, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 5; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(98 + i * 10, 108); g.lineTo(98 + i * 10 + 14, 160); g.stroke(); }
    g.fillStyle = INK; g.fillRect(118, 172, 20, 66);
    txt(g, 'BEAT', 128, 268, 52, CREAM, { stroke: INK }); txt(g, 'BATTLE', 128, 314, 44, YEL, { stroke: INK }); txt(g, 'FRI 9PM', 128, 345, 18, CREAM);
  });
  item('poster_b', 260, 0, 256, 360, (g, w, h) => { // vinyl only
    g.fillStyle = '#1f6670'; g.fillRect(0, 0, w, h); g.fillStyle = TEAL; g.fillRect(12, 12, w - 24, h - 24); g.fillStyle = INK; g.beginPath(); g.arc(128, 150, 100, 0, 7); g.fill();
    g.strokeStyle = '#4a4268'; g.lineWidth = 2; for (let r = 40; r < 100; r += 10) { g.beginPath(); g.arc(128, 150, r, 0, 7); g.stroke(); } g.fillStyle = YEL; g.beginPath(); g.arc(128, 150, 34, 0, 7); g.fill(); g.fillStyle = INK; g.beginPath(); g.arc(128, 150, 6, 0, 7); g.fill();
    txt(g, 'VINYL', 128, 288, 56, INK); txt(g, 'ONLY', 128, 332, 44, CREAM, { stroke: INK });
  });
  item('poster_c', 520, 0, 256, 360, (g, w, h) => { // boom bap tour
    g.fillStyle = grad(g, 0, 0, 0, h, [[0, '#ff8a3d'], [0.55, '#e8604a'], [1, '#5a386c']]); g.fillRect(0, 0, w, h);
    g.fillStyle = INK; for (let i = 0; i < 9; i++) { const bh = 40 + ((i * 53) % 90); g.fillRect(14 + i * 26, 250 - bh, 20, bh); g.fillStyle = i % 2 ? '#ffd23f' : INK; } g.fillStyle = YEL; g.beginPath(); g.arc(128, 90, 46, 0, 7); g.fill();
    txt(g, 'BOOM', 128, 286, 58, CREAM, { stroke: INK }); txt(g, 'BAP', 128, 332, 48, YEL, { stroke: INK });
  });
  item('poster_d', 780, 0, 256, 360, (g, w, h) => { // night skyline
    g.fillStyle = grad(g, 0, 0, 0, h, [[0, '#1b1950'], [0.7, '#7a3d8c'], [1, '#ff8a6a']]); g.fillRect(0, 0, w, h); g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(190, 70, 24, 0, 7); g.fill(); const R = rnd(5); g.fillStyle = INK; let x = 0;
    while (x < w) { const bw = 24 + R() * 30, bh = 80 + R() * 160; g.fillStyle = INK; g.fillRect(x, h - bh, bw, bh); g.fillStyle = YEL; for (let wy = h - bh + 10; wy < h - 10; wy += 16) for (let wx = x + 6; wx < x + bw - 8; wx += 12) if (R() < 0.4) g.fillRect(wx, wy, 5, 7); x += bw + 3; }
    txt(g, 'NEON CITY', 128, 36, 28, CREAM, { stroke: INK });
  });
  item('poster_e', 1040, 0, 256, 360, (g, w, h) => { // eq bars
    g.fillStyle = '#2b2438'; g.fillRect(0, 0, w, h); const cs = [PINK, YEL, TEAL, VIO, LIME, ORANGE]; for (let i = 0; i < 8; i++) { const bh = 60 + ((i * 97) % 190); for (let k = 0; k < bh; k += 14) { g.fillStyle = cs[(i + (k / 14 | 0)) % 6]; g.fillRect(14 + i * 29, 300 - k, 24, 11); } }
    txt(g, 'DROP THE', 128, 332, 26, CREAM); txt(g, 'BASS', 128, 40, 40, PINK, { stroke: INK });
  });
  item('rent', 1300, 0, 160, 220, (g, w, h) => { g.fillStyle = CREAM; g.fillRect(0, 0, w, h); g.fillStyle = RED; g.fillRect(0, 0, w, 40); txt(g, 'NOTICE', w / 2, 21, 24, CREAM); txt(g, 'RENT', w / 2, 78, 36, INK); txt(g, 'DUE', w / 2, 114, 36, INK); txt(g, 'the 1st!', w / 2, 154, 24, RED, { weight: 'normal' }); g.strokeStyle = '#8d8aa8'; g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(24, 180 + i * 12); g.lineTo(w - 24 - i * 14, 180 + i * 12); g.stroke(); } });
  item('mirror', 1464, 0, 128, 320, (g, w, h) => { g.fillStyle = grad(g, 0, 0, w, h, [[0, '#cfe3f0'], [0.5, '#9fc2d9'], [1, '#d9c7e6']]); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.moveTo(10, 0); g.lineTo(46, 0); g.lineTo(0, 120); g.lineTo(0, 70); g.fill(); g.beginPath(); g.moveTo(70, 0); g.lineTo(86, 0); g.lineTo(0, 230); g.lineTo(0, 200); g.fill(); g.fillStyle = 'rgba(123,79,136,0.35)'; g.fillRect(0, 200, w, 120); g.fillStyle = 'rgba(232,96,74,0.35)'; g.beginPath(); g.arc(74, 200, 28, 0, 7); g.fill(); g.fillRect(52, 220, 44, 100); });
  item('chalk', 1600, 0, 256, 180, (g, w, h) => { g.fillStyle = '#2f3a3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6f4f35'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 40; i++) g.fillRect((i * 37) % w, (i * 71) % h, 30, 3);
    txt(g, 'EAT YOUR GREENS', w / 2, 34, 22, '#f5ead2', { weight: 'normal' }); g.strokeStyle = '#9dff4a'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 52); g.lineTo(w - 40, 52); g.stroke(); const L = [['lentil dal', '#ffd23f'], ['kale + tahini', '#9dff4a'], ['oat milk x2', '#f5ead2'], ['mango!', '#ff8a3d']]; L.forEach((l, i) => txt(g, l[0], w / 2, 82 + i * 26, 19, l[1], { weight: 'normal' })); });
  item('mat', 1600, 190, 256, 128, (g, w, h) => { g.fillStyle = '#c8704a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8b878'; g.fillRect(8, 8, w - 16, h - 16); g.strokeStyle = '#7a4a32'; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28); txt(g, 'HOME', w / 2, h / 2 - 8, 44, '#5a386c'); txt(g, 'drop your beats here', w / 2, h - 30, 14, '#7a4a32', { weight: 'normal' }); });
  // ---- screens 320x180
  item('tv', 0, 370, 320, 180, (g, w, h) => { g.fillStyle = grad(g, 0, 0, w, h, [[0, '#2a1c5c'], [0.5, '#7b2f8f'], [1, '#ff4f8b']]); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,210,63,0.85)'; g.beginPath(); g.arc(240, 60, 26, 0, 7); g.fill();
    const R = rnd(9); g.fillStyle = '#1b1240'; for (let i = 0; i < 12; i++) { const bh = 20 + R() * 55; g.fillRect(i * 27, h - bh, 24, bh); } g.fillStyle = CYAN; for (let i = 0; i < 24; i++) { const bh = 8 + Math.abs(Math.sin(i * 0.7)) * 40; g.fillRect(8 + i * 13, 120 - bh / 2, 9, bh); }
    g.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1); txt(g, 'LIVE: BEAT NIGHT', 90, 20, 14, CREAM, { align: 'center' }); g.fillStyle = RED; g.beginPath(); g.arc(18, 20, 5, 0, 7); g.fill(); });
  item('monitor', 330, 370, 320, 180, (g, w, h) => { g.fillStyle = '#1c1830'; g.fillRect(0, 0, w, h); g.fillStyle = '#2d2750'; g.fillRect(0, 0, w, 22); g.fillStyle = RED; rr(g, 8, 4, 44, 14, 6); g.fill(); txt(g, 'LIVE', 30, 11, 11, CREAM); txt(g, '1.2k watching', 110, 11, 11, '#b9b7d0', { weight: 'normal' });
    g.fillStyle = '#3a2f6a'; g.fillRect(8, 30, 200, 130); g.fillStyle = '#c68b5e'; g.beginPath(); g.arc(108, 78, 24, 0, 7); g.fill(); g.fillStyle = '#17141f'; g.fillRect(84, 54, 48, 14); g.fillStyle = YEL; g.fillRect(80, 104, 56, 52); g.fillStyle = PINK; g.beginPath(); g.arc(108, 112, 10, 0, 7); g.fill();
    const R = rnd(21); for (let i = 0; i < 6; i++) { g.fillStyle = [PINK, TEAL, YEL, LIME, VIO, ORANGE][i]; g.fillRect(216, 32 + i * 21, 10, 10); g.fillStyle = '#9a96b8'; g.fillRect(232, 33 + i * 21, 30 + R() * 50, 7); } g.fillStyle = '#4b4478'; g.fillRect(216, 160, 96, 14); });
  item('occupied', 660, 370, 256, 80, (g, w, h) => { g.fillStyle = '#4a1218'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff6a5a'; g.lineWidth = 5; rr(g, 6, 6, w - 12, h - 12, 12); g.stroke(); txt(g, 'OCCUPIED', w / 2, h / 2 + 2, 38, '#ffb0a0', { stroke: '#ff3d3a', sw: 3 }); });
  item('beatsign', 660, 455, 256, 96, (g, w, h) => { g.fillStyle = '#1a1030'; g.fillRect(0, 0, w, h); g.strokeStyle = PINK; g.lineWidth = 7; g.lineJoin = 'round'; txt(g, 'BEAT', w / 2, h / 2 + 2, 66, '#ffd0e4', { stroke: PINK, sw: 9 }); });
  item('kicks', 660, 560, 192, 96, (g, w, h) => { g.fillStyle = '#10222a'; g.fillRect(0, 0, w, h); txt(g, 'KICKS', w / 2, h / 2 + 2, 54, '#c8fffa', { stroke: CYAN, sw: 8 }); });
  // ---- rug 512x340: afro-geometric
  item('rug', 930, 370, 512, 340, (g, w, h) => { g.fillStyle = '#e8d6b0'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f8f93'; g.fillRect(14, 14, w - 28, h - 28); g.fillStyle = '#f5ead2'; g.fillRect(26, 26, w - 52, h - 52); g.fillStyle = '#7d4f88'; g.fillRect(34, 34, w - 68, h - 68);
    const cs = [YEL, PINK, '#f5ead2', TEAL, ORANGE]; for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) { const cx = 78 + i * 45, cy = 70 + j * 48; g.fillStyle = cs[(i + j) % 5]; g.beginPath(); g.moveTo(cx, cy - 20); g.lineTo(cx + 18, cy); g.lineTo(cx, cy + 20); g.lineTo(cx - 18, cy); g.closePath(); g.fill(); g.fillStyle = '#2b2438'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(40,20,60,0.35)'; g.lineWidth = 3; for (let x = 0; x < w; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 8); g.stroke(); g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - 8); g.stroke(); } });
  item('rug2', 1450, 330, 140, 140, (g, w, h) => { g.fillStyle = '#ff9ab8'; g.fillRect(0, 0, w, h); const R = rnd(4); for (let i = 0; i < 160; i++) { g.fillStyle = R() < 0.5 ? '#ffc4d6' : '#e8708f'; g.fillRect(R() * w, R() * h, 3, 12); } });
  // ---- sleeves 128x128 (eight)
  const sleeves = [['#ff4f8b', '#2b2438', 'circle'], ['#35f2e0', '#7b5cff', 'stripes'], ['#ffd23f', '#e8604a', 'sun'], ['#7b5cff', '#ffd23f', 'tri'], ['#2b2438', '#9dff4a', 'eq'], ['#e8604a', '#f5ead2', 'face'], ['#2f8f93', '#ffd23f', 'grid'], ['#f5ead2', '#ff4f8b', 'bars']];
  sleeves.forEach((s, i) => item('rec' + i, i * 130, 720, 128, 128, (g, w, h) => {
    g.fillStyle = s[0]; g.fillRect(0, 0, w, h); g.fillStyle = s[1];
    if (s[2] === 'circle') { g.beginPath(); g.arc(64, 64, 40, 0, 7); g.fill(); g.fillStyle = s[0]; g.beginPath(); g.arc(64, 64, 12, 0, 7); g.fill(); }
    else if (s[2] === 'stripes') { for (let k = 0; k < 6; k++) g.fillRect(0, 10 + k * 22, w, 9); }
    else if (s[2] === 'sun') { g.beginPath(); g.arc(64, 86, 44, Math.PI, 0); g.fill(); for (let k = 0; k < 7; k++) { g.fillRect(8 + k * 17, 98, 10, 24); } }
    else if (s[2] === 'tri') { g.beginPath(); g.moveTo(64, 14); g.lineTo(114, 110); g.lineTo(14, 110); g.closePath(); g.fill(); }
    else if (s[2] === 'eq') { for (let k = 0; k < 7; k++) g.fillRect(12 + k * 16, 110 - (20 + ((k * 37) % 70)), 11, 20 + ((k * 37) % 70)); }
    else if (s[2] === 'face') { g.beginPath(); g.arc(64, 64, 44, 0, 7); g.fill(); g.fillStyle = s[0]; g.fillRect(44, 52, 12, 12); g.fillRect(72, 52, 12, 12); g.fillRect(48, 80, 32, 7); }
    else if (s[2] === 'grid') { for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if ((a + b) % 2 === 0) g.fillRect(14 + a * 25, 14 + b * 25, 25, 25); }
    else { g.fillRect(14, 14, 100, 14); g.fillRect(14, 100, 100, 14); g.beginPath(); g.arc(64, 64, 20, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(40,20,60,0.4)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  }));
  // ---- cassettes 64x44 x4
  [['#ffd23f', '#e8604a'], ['#35f2e0', '#2b2438'], ['#ff4f8b', '#f5ead2'], ['#9dff4a', '#2b2438']].forEach((c, i) => item('tape' + i, 1040 + i * 68, 720, 64, 44, (g, w, h) => { g.fillStyle = '#2b2438'; g.fillRect(0, 0, w, h); g.fillStyle = c[0]; g.fillRect(4, 4, w - 8, 22); g.fillStyle = c[1]; g.fillRect(4, 20, w - 8, 6); g.fillStyle = '#f5ead2'; g.beginPath(); g.arc(20, 33, 6, 0, 7); g.arc(44, 33, 6, 0, 7); g.fill(); g.fillStyle = '#2b2438'; g.fillRect(24, 31, 16, 4); }));
  // ---- photos, calendar, book spines
  item('photos', 1320, 720, 192, 96, (g, w, h) => { const cs = ['#ff9ab8', '#8fd6c0', '#ffd23f']; for (let i = 0; i < 3; i++) { g.save(); g.translate(34 + i * 62, 48); g.rotate((i - 1) * 0.12); g.fillStyle = '#f5ead2'; g.fillRect(-26, -34, 52, 66); g.fillStyle = cs[i]; g.fillRect(-21, -29, 42, 44); g.fillStyle = '#2b2438'; g.beginPath(); g.arc(0, -10, 8, 0, 7); g.fill(); g.fillRect(-10, -2, 20, 16); g.restore(); } });
  item('calendar', 1520, 720, 120, 150, (g, w, h) => { g.fillStyle = '#f5ead2'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8604a'; g.fillRect(0, 0, w, 32); txt(g, 'OCT', w / 2, 17, 20, '#f5ead2'); g.fillStyle = '#2b2438'; for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) g.fillRect(8 + c * 15, 42 + r * 20, 9, 11); g.fillStyle = '#ff4f8b'; g.beginPath(); g.arc(8 + 3 * 15 + 4, 42 + 20 * 2 + 5, 9, 0, 7); g.fill(); });
  item('spines', 1650, 720, 160, 70, (g, w, h) => { const R = rnd(33), cs = [PINK, TEAL, YEL, VIO, LIME, ORANGE, '#f5ead2', '#e8604a']; let x = 2; while (x < w - 6) { const bw = 7 + R() * 10; g.fillStyle = cs[(R() * 8) | 0]; g.fillRect(x, 4 + R() * 8, bw, h - 8); x += bw + 1; } });
  item('menu', 1830, 720, 200, 150, (g, w, h) => { g.fillStyle = '#f5ead2'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f9b5a'; g.fillRect(0, 0, w, 30); txt(g, 'FRIDGE LIST', w / 2, 16, 18, '#f5ead2'); const L = ['[x] chickpeas', '[x] spinach', '[ ] mango', '[ ] oat milk', '[x] basil']; L.forEach((l, i) => txt(g, l, 14, 48 + i * 20, 14, '#2b2438', { align: 'left', weight: 'normal' })); });
  item('eqwall', 1330, 830, 256, 100, (g, w, h) => { g.fillStyle = '#17102b'; g.fillRect(0, 0, w, h); const cs = [PINK, YEL, TEAL, VIO, LIME]; for (let i = 0; i < 20; i++) { const bh = 10 + ((i * 53) % 70); g.fillStyle = cs[i % 5]; g.fillRect(6 + i * 12, h - 8 - bh, 9, bh); } });
  item('door', 1800, 330, 180, 360, (g, w, h) => { g.fillStyle = '#3f8f8a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f6f70'; g.fillRect(14, 14, w - 28, 140); g.fillRect(14, 170, w - 28, 176); g.fillStyle = '#58b9b2'; g.fillRect(18, 18, w - 36, 6); g.fillRect(18, 174, w - 36, 6); g.fillStyle = YEL; g.beginPath(); g.arc(w - 30, 190, 8, 0, 7); g.fill(); txt(g, '4B', w / 2, 56, 40, '#f5ead2'); });

  item('runner', 1450, 480, 160, 230, (g, w, h) => { g.fillStyle = '#d9a46e'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f8f93'; g.fillRect(8, 0, w - 16, h); const cs = ['#ffd23f', '#e8604a', '#f5ead2', '#7d4f88']; for (let i = 0; i < 9; i++) { g.fillStyle = cs[i % 4]; g.fillRect(14, 12 + i * 24, w - 28, 10); g.fillStyle = '#2b2438'; g.fillRect(w / 2 - 6, 12 + i * 24 + 3, 12, 4); } g.fillStyle = '#d9a46e'; for (let x = 0; x < w; x += 8) { g.fillRect(x, 0, 4, 5); g.fillRect(x, h - 5, 4, 5); } });
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
  jobs.forEach(([x, y, w, h, fn]) => { g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h); g.restore(); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  // shrink rects by half a texel to avoid bleeding from neighbours
  Object.keys(rect).forEach((k) => { const r = rect[k], e = 1.2; r[0] += e / W; r[2] -= e / W; r[1] += e / H; r[3] -= e / H; });
  return { tex, rect };
}
