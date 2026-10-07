// One small canvas atlas for every decal in the terrain (tags, stickers, flyers, signs, chalk) plus the big graffiti mural canvas.
// Fonts are only used as a fallback; the big letters are drawn as fat marker strokes so they look the same on every device.
import { THREE, canvasTex } from './kit.js';

const INK = '#2B2438', CREAM = '#FFF2DC', PINK = '#FF4F8B', TEAL = '#29D3C7', YEL = '#FFD23F', VIO = '#7B5CFF', LIME = '#9DFF4A', ORANGE = '#FF8A3D';
const FONT = '"Trebuchet MS", "Arial Black", system-ui, sans-serif';

// stroke letters in a unit box. M move, L line, C cubic
const LETTERS = {
  B: [['M', 0, 0], ['L', 0, 1], ['M', 0, 0], ['L', 0.5, 0], ['C', 0.98, 0, 0.98, 0.5, 0.5, 0.5], ['L', 0, 0.5], ['M', 0, 0.5], ['L', 0.55, 0.5], ['C', 1.06, 0.5, 1.06, 1, 0.55, 1], ['L', 0, 1]],
  E: [['M', 0.92, 0], ['L', 0, 0], ['L', 0, 1], ['L', 0.92, 1], ['M', 0, 0.5], ['L', 0.7, 0.5]],
  A: [['M', 0, 1], ['L', 0.5, 0], ['L', 1, 1], ['M', 0.2, 0.66], ['L', 0.8, 0.66]],
  T: [['M', 0, 0], ['L', 1, 0], ['M', 0.5, 0], ['L', 0.5, 1]],
  O: [['M', 0.5, 0], ['C', 0.8, 0, 1, 0.22, 1, 0.5], ['C', 1, 0.78, 0.8, 1, 0.5, 1], ['C', 0.2, 1, 0, 0.78, 0, 0.5], ['C', 0, 0.22, 0.2, 0, 0.5, 0]],
  X: [['M', 0, 0], ['L', 1, 1], ['M', 1, 0], ['L', 0, 1]],
};
function strokeLetter(g, ch, x, y, w, h, lw, color, cap) {
  const P = (u, v) => [x + u * w, y + v * h]; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = color; g.beginPath();
  for (const c of LETTERS[ch]) { if (c[0] === 'M') g.moveTo(...P(c[1], c[2])); else if (c[0] === 'L') g.lineTo(...P(c[1], c[2])); else g.bezierCurveTo(...P(c[1], c[2]), ...P(c[3], c[4]), ...P(c[5], c[6])); }
  g.stroke();
}
const mulc = (hex, k) => { const n = parseInt(hex.slice(1), 16), r = Math.min(255, ((n >> 16) & 255) * k), gg = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k); return `rgb(${r | 0},${gg | 0},${b | 0})`; };
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ------------------------------------------------------------------ the mural (2048 x 512, painted onto the brick wall)
export function muralTexture() {
  return canvasTex(2048, 512, (g, W, H) => {
    const R = rnd(99);
    // sprayed backdrop: indigo to violet to a hot magenta glow low on the wall, with soft spray clouds
    let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2A2A6A'); gr.addColorStop(0.55, '#4A3A8C'); gr.addColorStop(1, '#8A3F7E'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const cloud = (x, y, r, c, a) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c.replace('A', a)); rg.addColorStop(1, c.replace('A', 0)); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
    cloud(300, 120, 340, 'rgba(41,211,199,A)', 0.35); cloud(1000, 430, 520, 'rgba(255,79,139,A)', 0.4); cloud(1700, 110, 380, 'rgba(123,92,255,A)', 0.45); cloud(1900, 420, 300, 'rgba(41,211,199,A)', 0.28); cloud(80, 450, 260, 'rgba(255,210,63,A)', 0.2);
    // brick course lines show through the paint
    g.strokeStyle = 'rgba(20,10,50,0.22)'; g.lineWidth = 3; for (let y = 22; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); const off = ((y / 32) | 0) % 2 ? 40 : 0; for (let x = off; x < W; x += 80) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } }
    // skyline silhouette along the bottom with lit windows
    g.fillStyle = '#231A48'; let x = 0; const wins = []; while (x < W) { const bw = 60 + R() * 90, bh = 40 + R() * 90; g.fillRect(x, H - bh, bw, bh); for (let wy = H - bh + 12; wy < H - 10; wy += 22) for (let wx = x + 10; wx < x + bw - 12; wx += 20) if (R() < 0.42) wins.push([wx, wy]); x += bw + 4; }
    wins.forEach(([wx, wy]) => { g.fillStyle = R() < 0.7 ? '#FFC46B' : '#35F2E0'; g.fillRect(wx, wy, 9, 11); });
    // sound waves, equaliser bars and stars on the flanks
    g.lineCap = 'round'; for (let k = 0; k < 5; k++) { g.strokeStyle = ['#29D3C7', '#FFD23F', '#FF4F8B', '#9B7BFF', '#29D3C7'][k]; g.lineWidth = 12; g.globalAlpha = 0.85 - k * 0.12; g.beginPath(); g.arc(120, 250, 70 + k * 42, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(1930, 250, 70 + k * 42, Math.PI - 0.9, Math.PI + 0.9); g.stroke(); } g.globalAlpha = 1;
    const eq = (x0, dir) => { for (let i = 0; i < 6; i++) { const bh = 70 + R() * 150, bx = x0 + dir * i * 34; g.fillStyle = [PINK, YEL, TEAL, VIO, PINK, TEAL][i]; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.roundRect(bx - 12, 360 - bh, 24, bh, 8); g.fill(); g.stroke(); } };
    eq(30, 1); eq(2018, -1);
    const star = (cx, cy, r, c) => { g.fillStyle = c; g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); };
    star(260, 70, 36, YEL); star(1830, 60, 30, PINK); star(1500, 40, 22, CREAM); star(520, 450, 24, TEAL); star(1700, 460, 28, YEL);
    // the big word: BEAT BOX in fat marker letters, extruded shadow, ink outline, neon fill, glint
    const word = [['B', PINK], ['E', YEL], ['A', TEAL], ['T', '#9B7BFF'], null, ['B', TEAL], ['O', YEL], ['X', PINK]];
    const LW = 176, LH = 250, STEP = 218, X0 = 150, Y0 = 108; let xx = X0; const drops = [];
    const pos = []; word.forEach((w, i) => { if (!w) { xx += 70; return; } pos.push([w, xx, Y0 + [10, -8, 14, -4, 0, 6, -10, 8][i], ((i * 37) % 7 - 3) * 0.012]); xx += STEP; });
    // soft dark halo behind the word for contrast
    cloud(1000, 250, 700, 'rgba(25,14,60,A)', 0.45);
    pos.forEach(([w, x0, y0, rot]) => {
      g.save(); g.translate(x0 + LW / 2, y0 + LH / 2); g.rotate(rot); g.translate(-(x0 + LW / 2), -(y0 + LH / 2));
      for (let e = 16; e >= 1; e--) strokeLetter(g, w[0], x0 + e * 1.1, y0 + e * 1.3, LW, LH, 70 + 26, mulc(w[1], 0.38 + (16 - e) * 0.012));
      strokeLetter(g, w[0], x0, y0, LW, LH, 70 + 26, INK);
      strokeLetter(g, w[0], x0, y0, LW, LH, 70, w[1]);
      strokeLetter(g, w[0], x0 - 7, y0 - 8, LW, LH, 20, 'rgba(255,242,220,0.65)');
      g.restore();
      for (let k = 0; k < 2; k++) if (R() < 0.8) drops.push([x0 + 20 + R() * (LW - 40), y0 + LH + 38, w[1]]);
    });
    // drips running down from the letters
    drops.forEach(([dx, dy, c]) => { const len = 30 + R() * 90; g.fillStyle = INK; g.beginPath(); g.roundRect(dx - 10, dy - 6, 20, len + 8, 10); g.fill(); g.fillStyle = c; g.beginPath(); g.roundRect(dx - 6, dy - 4, 12, len, 6); g.fill(); g.beginPath(); g.arc(dx, dy + len, 10, 0, 7); g.fill(); });
    // glint sparkles and a crown over the first B
    const spark = (cx, cy, r) => { g.fillStyle = CREAM; g.beginPath(); g.moveTo(cx, cy - r); g.quadraticCurveTo(cx, cy, cx + r, cy); g.quadraticCurveTo(cx, cy, cx, cy + r); g.quadraticCurveTo(cx, cy, cx - r, cy); g.quadraticCurveTo(cx, cy, cx, cy - r); g.fill(); };
    spark(190, 120, 22); spark(1470, 118, 18); spark(1860, 100, 24); spark(940, 90, 15);
    g.fillStyle = YEL; g.strokeStyle = INK; g.lineWidth = 8; g.lineJoin = 'round'; g.beginPath(); g.moveTo(190, 78); g.lineTo(196, 22); g.lineTo(230, 52); g.lineTo(258, 10); g.lineTo(284, 52); g.lineTo(320, 22); g.lineTo(326, 78); g.closePath(); g.fill(); g.stroke();
    // splatter dots
    for (let i = 0; i < 90; i++) { g.fillStyle = [PINK, TEAL, YEL, CREAM][(R() * 4) | 0]; g.globalAlpha = 0.5 + R() * 0.5; g.beginPath(); g.arc(R() * W, R() * H, 2 + R() * 5, 0, 7); g.fill(); } g.globalAlpha = 1;
    // little signature tag bottom right
    g.fillStyle = CREAM; g.font = `italic 900 40px ${FONT}`; g.save(); g.translate(1740, 492); g.rotate(-0.04); g.strokeStyle = INK; g.lineWidth = 8; g.strokeText('beeamgee was here', 0, 0); g.fillText('beeamgee was here', 0, 0); g.restore();
  });
}

// ------------------------------------------------------------------ the decal atlas (1024 x 1024)
export const ATLAS_RECTS = {
  tagA: [0, 0, 512, 256], tagB: [512, 0, 512, 256],
  smiley: [0, 256, 256, 256], burst: [256, 256, 256, 256], vinyl: [512, 256, 256, 256], yo: [768, 256, 256, 256],
  fly1: [0, 512, 256, 256], fly2: [256, 512, 256, 256], fly3: [512, 512, 256, 256], fly4: [768, 512, 256, 256],
  start: [0, 768, 512, 128], gate: [0, 896, 512, 128], hop: [512, 768, 256, 256], busk: [768, 768, 256, 128], chalk: [768, 896, 256, 128],
};
export function makeAtlas() {
  const rects = {}; const tex = canvasTex(1024, 1024, (g, W, H) => {
    const R = rnd(7); g.clearRect(0, 0, W, H);
    const cell = (k, fn) => { const [x, y, w, h] = ATLAS_RECTS[k]; g.save(); g.beginPath(); g.rect(x + 3, y + 3, w - 6, h - 6); g.clip(); g.translate(x, y); fn(w, h); g.restore(); rects[k] = [(x + 3) / W, 1 - (y + h - 3) / H, (x + w - 3) / W, 1 - (y + 3) / H]; };
    const tag = (txt, c1, c2, w, h, rot) => { g.save(); g.translate(w / 2, h / 2 + 10); g.rotate(rot); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic 900 118px ${FONT}`; g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 22; g.strokeText(txt, 0, 0); g.strokeStyle = c2; g.lineWidth = 9; g.strokeText(txt, 4, 4); g.fillStyle = c1; g.fillText(txt, 0, 0); g.strokeStyle = c2; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(-190, 64); g.quadraticCurveTo(0, 92, 190, 54); g.stroke(); g.restore(); [-120, -20, 90].forEach((dx) => { g.fillStyle = c1; g.beginPath(); g.roundRect(w / 2 + dx, h / 2 + 62, 9, 40 + R() * 40, 4); g.fill(); }); };
    cell('tagA', (w, h) => { tag('BEATZ', PINK, YEL, w, h, -0.06); });
    cell('tagB', (w, h) => { tag('ZOE', TEAL, '#9B7BFF', w, h, 0.05); g.fillStyle = YEL; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 18 : 40; g.lineTo(430 + Math.cos(a) * r, 70 + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); });
    cell('smiley', (w, h) => { g.fillStyle = INK; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.fill(); g.fillStyle = YEL; g.beginPath(); g.arc(128, 128, 102, 0, 7); g.fill(); g.fillStyle = INK; g.beginPath(); g.ellipse(94, 100, 11, 20, 0, 0, 7); g.ellipse(162, 100, 11, 20, 0, 0, 7); g.fill(); g.lineWidth = 12; g.lineCap = 'round'; g.strokeStyle = INK; g.beginPath(); g.arc(128, 140, 52, 0.25, Math.PI - 0.25); g.stroke(); });
    cell('burst', (w, h) => { g.fillStyle = INK; g.beginPath(); for (let i = 0; i < 24; i++) { const a = (i * Math.PI) / 12, r = i % 2 ? 76 : 118; g.lineTo(128 + Math.cos(a) * (r + 10), 128 + Math.sin(a) * (r + 10)); } g.fill(); g.fillStyle = PINK; g.beginPath(); for (let i = 0; i < 24; i++) { const a = (i * Math.PI) / 12, r = i % 2 ? 76 : 118; g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g.fill(); g.fillStyle = CREAM; g.font = `900 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BEAT', 128, 112); g.fillText('ME!', 128, 168); });
    cell('vinyl', (w, h) => { g.fillStyle = INK; g.beginPath(); g.arc(128, 128, 116, 0, 7); g.fill(); g.strokeStyle = '#4a4068'; g.lineWidth = 3; for (let r = 40; r < 112; r += 14) { g.beginPath(); g.arc(128, 128, r, 0, 7); g.stroke(); } g.fillStyle = TEAL; g.beginPath(); g.arc(128, 128, 36, 0, 7); g.fill(); g.fillStyle = INK; g.beginPath(); g.arc(128, 128, 7, 0, 7); g.fill(); });
    cell('yo', (w, h) => { g.fillStyle = INK; g.beginPath(); g.roundRect(18, 28, 220, 150, 40); g.moveTo(70, 170); g.lineTo(54, 236); g.lineTo(120, 176); g.fill(); g.fillStyle = CREAM; g.beginPath(); g.roundRect(30, 40, 196, 126, 32); g.fill(); g.fillStyle = INK; g.font = `900 92px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('YO!', 128, 106); });
    const flyer = (k, bg, head, lines, extra) => cell(k, (w, h) => { g.save(); g.translate(128, 128); g.rotate((R() - 0.5) * 0.05); g.translate(-128, -128); g.fillStyle = 'rgba(40,24,60,0.35)'; g.fillRect(20, 20, 220, 228); g.fillStyle = bg; g.fillRect(12, 12, 220, 228); g.fillStyle = head; g.fillRect(12, 12, 220, 70); g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 40px ${FONT}`; lines[0].split('|').forEach((t, i, a) => g.fillText(t, 122, 47 + (i - (a.length - 1) / 2) * 34)); g.font = `bold 24px ${FONT}`; lines.slice(1).forEach((t, i) => g.fillText(t, 122, 112 + i * 34)); if (extra) extra(); g.fillStyle = INK; for (let i = 0; i < 6; i++) g.fillRect(14 + i * 36, 228, 22, 12); g.restore(); });
    flyer('fly1', '#FFF2DC', PINK, ['BEAT|BATTLE', 'FRI 8PM', 'FREE ENTRY', 'BRING A MIC'], () => { g.fillStyle = TEAL; g.beginPath(); g.arc(122, 200, 16, 0, 7); g.fill(); });
    flyer('fly2', '#FFE9A8', ORANGE, ['LOST|CAT', 'ORANGE, SHY', 'ANSWERS TO', '"SNARE"'], () => { g.fillStyle = INK; g.beginPath(); g.moveTo(106, 200); g.lineTo(112, 184); g.lineTo(122, 194); g.lineTo(132, 184); g.lineTo(138, 200); g.fill(); });
    flyer('fly3', '#D9F5EF', TEAL, ['ODD|JOBS', 'FLYERS $$', 'ASK AT GATE', 'START TODAY'], () => { g.fillStyle = YEL; g.fillRect(70, 190, 104, 22); });
    flyer('fly4', '#E7DDFF', '#9B7BFF', ['LESSONS', 'LEARN TO', 'BOX BEATS', 'BENCH 3PM'], null);
    cell('start', (w, h) => { g.fillStyle = INK; g.fillRect(0, 0, w, h); g.fillStyle = YEL; g.fillRect(6, 6, w - 12, h - 12); g.fillStyle = INK; for (let i = 0; i < 32; i++) { g.fillRect(i * 16 + 6, 6, 8, 8); g.fillRect(i * 16 + 14, 14, 8, 8); g.fillRect(i * 16 + 6, h - 22, 8, 8); g.fillRect(i * 16 + 14, h - 14, 8, 8); } g.font = `900 78px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = CREAM; g.lineWidth = 12; g.strokeText('START', w / 2, h / 2 + 4); g.fillStyle = INK; g.fillText('START', w / 2, h / 2 + 4); });
    cell('gate', (w, h) => { g.fillStyle = '#1d1a3b'; g.fillRect(0, 0, w, h); g.strokeStyle = PINK; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); g.strokeStyle = TEAL; g.lineWidth = 3; g.strokeRect(16, 16, w - 32, h - 32); g.font = `900 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = CREAM; g.shadowColor = PINK; g.shadowBlur = 14; g.fillText('BEAT BOX PARK', w / 2, h / 2 + 3); g.shadowBlur = 0; });
    cell('hop', (w, h) => { g.strokeStyle = 'rgba(255,242,220,0.9)'; g.lineWidth = 7; g.lineCap = 'round'; g.fillStyle = 'rgba(255,242,220,0.95)'; g.font = `bold 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; const bx = (x, y, n) => { g.strokeRect(x, y, 64, 64); g.fillText(String(n), x + 32, y + 34); }; bx(96, 176, 1); bx(96, 112, 2); bx(32, 48, 3); bx(96, 48, 4); bx(160, 48, 5); g.strokeRect(96, 0, 64, 40); });
    cell('busk', (w, h) => { g.fillStyle = '#C79A6A'; g.fillRect(0, 0, w, h); g.fillStyle = '#B58559'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.strokeStyle = '#9A6B44'; g.lineWidth = 3; for (let x = 20; x < w; x += 36) { g.beginPath(); g.moveTo(x, 12); g.lineTo(x, h - 12); g.stroke(); } g.fillStyle = INK; g.font = `900 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BUSK HERE', w / 2, 52); g.fillStyle = PINK; g.font = `900 30px ${FONT}`; g.fillText('tips = love', w / 2, 92); });
    cell('chalk', (w, h) => { g.strokeStyle = 'rgba(255,242,220,0.9)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(60, 44); g.bezierCurveTo(30, 10, 0, 50, 60, 90); g.bezierCurveTo(120, 50, 90, 10, 60, 44); g.stroke(); g.strokeStyle = 'rgba(255,214,120,0.9)'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 16 : 36; g.lineTo(150 + Math.cos(a) * r, 60 + Math.sin(a) * r); } g.closePath(); g.stroke(); g.strokeStyle = 'rgba(140,230,255,0.9)'; g.beginPath(); g.arc(214, 40, 20, 0, 7); g.moveTo(214, 60); g.lineTo(214, 108); g.stroke(); });
  });
  return { tex, rect: rects };
}
