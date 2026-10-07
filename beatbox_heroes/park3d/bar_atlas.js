// Bar decal atlas (Stage and Club Artist): one 1024x1024 canvas with every poster, neon sign, menu, jukebox front, mat and logo in the bar. Returns { tex, rect }.
// Also the two LIVE canvases of the bar: drawChalkboard(g, w, h, info) and drawBanner(g, w, h, info) (redrawn when the programme or the day changes).
import { THREE } from './kit.js';
import { rr, FONT } from './venue_kit.js';

const INK = '#2b2438', CREAM = '#f5ead2', PINK = '#ff4f8b', TEAL = '#29d3c7', YEL = '#ffd23f', VIO = '#7b5cff', LIME = '#9dff4a', ORANGE = '#ff8a3d', RED = '#e0453f', CYAN = '#35f2e0';
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function txt(g, s, x, y, size, color, o) { o = o || {}; g.font = (o.weight || 'bold') + ' ' + size + 'px ' + FONT; g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; if (o.stroke) { g.lineWidth = o.sw || size * 0.14; g.strokeStyle = o.stroke; g.lineJoin = 'round'; g.strokeText(s, x, y); } if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.gb || size * 0.4; } g.fillStyle = color; g.fillText(s, x, y); g.shadowBlur = 0; }
const grad = (g, x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([t, c]) => gr.addColorStop(t, c)); return gr; };
// neon tube text: dark halo, colour glow, hot white core
function neon(g, s, x, y, size, color, o) { o = o || {}; g.font = (o.weight || '900') + ' ' + size + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.shadowColor = color; g.shadowBlur = size * 0.5; g.fillStyle = color; g.fillText(s, x, y); g.fillText(s, x, y); g.shadowBlur = size * 0.1; g.shadowColor = '#fff'; g.fillStyle = o.core || '#fff4f8'; g.save(); g.globalAlpha = 0.9; g.font = (o.weight || '900') + ' ' + size * 0.92 + 'px ' + FONT; g.fillText(s, x, y); g.restore(); g.shadowBlur = 0; }

export function makeBarAtlas() {
  const W = 1024, H = 1024, rect = {}, jobs = [];
  const item = (name, x, y, w, h, fn) => { rect[name] = [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H]; jobs.push([x, y, w, h, fn]); };
  // ---- posters 160x224
  item('poster_open', 0, 0, 160, 224, (g, w, h) => { g.fillStyle = grad(g, 0, 0, 0, h, [[0, '#7b5cff'], [1, '#2f2766']]); g.fillRect(0, 0, w, h); g.fillStyle = YEL; g.beginPath(); g.arc(80, 82, 34, 0, 7); g.fill(); g.fillStyle = INK; g.fillRect(74, 98, 12, 50); g.beginPath(); g.arc(80, 74, 20, 0, 7); g.fill(); g.fillStyle = '#ff9ab8'; g.beginPath(); g.arc(80, 74, 14, 0, 7); g.fill(); txt(g, 'OPEN', 80, 166, 34, CREAM, { stroke: INK }); txt(g, 'MIC', 80, 198, 34, YEL, { stroke: INK }); });
  item('poster_batt', 164, 0, 160, 224, (g, w, h) => { g.fillStyle = grad(g, 0, 0, 0, h, [[0, '#ff4f8b'], [1, '#6a1f5a']]); g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,210,63,0.92)'; g.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.283, r = i % 2 ? 42 : 72; g.lineTo(80 + Math.cos(a) * r, 84 + Math.sin(a) * r); } g.closePath(); g.fill(); txt(g, 'VS', 80, 88, 50, INK); txt(g, 'BATTLE', 80, 170, 38, CREAM, { stroke: INK }); txt(g, 'SAT 9PM', 80, 202, 20, YEL); });
  item('poster_show', 328, 0, 160, 224, (g, w, h) => { g.fillStyle = grad(g, 0, 0, 0, h, [[0, '#ffd23f'], [1, '#e8604a']]); g.fillRect(0, 0, w, h); g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = INK; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -1.57 + (i / 10) * 6.283, r = i % 2 ? 22 : 50; g.lineTo(80 + Math.cos(a) * r, 80 + Math.sin(a) * r); } g.closePath(); g.fill(); txt(g, 'FRI', 80, 150, 36, INK); txt(g, 'SHOWCASE', 80, 188, 25, CREAM, { stroke: INK }); });
  item('poster_kara', 492, 0, 160, 224, (g, w, h) => { g.fillStyle = grad(g, 0, 0, 0, h, [[0, '#35f2e0'], [1, '#2f5fa8']]); g.fillRect(0, 0, w, h); g.fillStyle = INK; for (let i = 0; i < 5; i++) { g.fillRect(24 + i * 25, 40 + (i % 3) * 14, 14, 70 - (i % 3) * 14); } g.fillStyle = PINK; g.fillRect(14, 126, 132, 8); txt(g, 'KARAOKE', 80, 168, 29, CREAM, { stroke: INK }); txt(g, 'SUNDAY', 80, 198, 26, YEL, { stroke: INK }); });
  item('poster_tour', 656, 0, 160, 224, (g, w, h) => { g.fillStyle = INK; g.fillRect(0, 0, w, h); g.fillStyle = grad(g, 0, 0, 0, 120, [[0, '#ff8a3d'], [1, '#d9433f']]); g.fillRect(10, 10, w - 20, 120); g.fillStyle = INK; g.beginPath(); g.arc(80, 70, 40, 0, 7); g.fill(); g.strokeStyle = '#6a5a90'; g.lineWidth = 2; for (let r = 12; r < 40; r += 6) { g.beginPath(); g.arc(80, 70, r, 0, 7); g.stroke(); } g.fillStyle = YEL; g.beginPath(); g.arc(80, 70, 11, 0, 7); g.fill(); txt(g, 'BOOM BAP', 80, 158, 28, YEL); txt(g, 'WORLD TOUR', 80, 190, 21, CREAM); });
  // ---- neon signs (always lit): beer mug, OPEN, EXIT, FRESH JUICE, LIVE
  item('sign_beer', 0, 230, 256, 256, (g, w, h) => {
    g.lineJoin = 'round'; g.lineCap = 'round'; const c = '#ffb23a'; g.shadowColor = c; g.shadowBlur = 16; g.strokeStyle = c; g.lineWidth = 9; rr(g, 52, 70, 96, 120, 12); g.stroke(); g.beginPath(); g.moveTo(148, 100); g.quadraticCurveTo(206, 96, 204, 130); g.quadraticCurveTo(204, 164, 146, 160); g.stroke();
    g.strokeStyle = '#fff6d8'; g.lineWidth = 3.5; g.shadowBlur = 4; rr(g, 52, 70, 96, 120, 12); g.stroke(); g.shadowBlur = 16; g.strokeStyle = c; g.lineWidth = 9; g.beginPath(); g.arc(78, 62, 20, Math.PI, 0); g.arc(110, 58, 24, Math.PI, 0); g.arc(138, 66, 16, Math.PI, 0); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,178,58,0.35)'; g.fillRect(60, 130, 80, 52); neon(g, 'COLD', 128, 218, 40, '#ff3d9a'); });
  item('sign_open', 260, 230, 256, 110, (g, w, h) => { g.strokeStyle = '#35f2e0'; g.shadowColor = '#35f2e0'; g.shadowBlur = 14; g.lineWidth = 6; rr(g, 8, 8, w - 16, h - 16, 18); g.stroke(); g.shadowBlur = 0; neon(g, 'OPEN', w / 2, h / 2 + 3, 62, '#ff3d9a'); });
  item('sign_exit', 260, 344, 160, 64, (g, w, h) => { g.fillStyle = '#2b1230'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff5a5a'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8); neon(g, 'EXIT', w / 2, h / 2 + 2, 40, '#ff5a5a', { core: '#ffe0e0' }); });
  item('sign_juice', 424, 344, 256, 100, (g, w, h) => { g.strokeStyle = '#9dff4a'; g.shadowColor = '#9dff4a'; g.shadowBlur = 12; g.lineWidth = 5; rr(g, 6, 6, w - 12, h - 12, 22); g.stroke(); g.shadowBlur = 0; neon(g, 'FRESH JUICE', w / 2, h / 2 + 3, 40, '#9dff4a', { core: '#f2ffd8' }); });
  item('sign_live', 684, 344, 128, 64, (g, w, h) => { g.fillStyle = '#7a1018'; rr(g, 2, 2, w - 4, h - 4, 12); g.fill(); g.strokeStyle = '#ffd0d0'; g.lineWidth = 3; g.stroke(); neon(g, 'LIVE', w / 2, h / 2 + 2, 40, '#ff5a5a', { core: '#fff0f0' }); });
  // ---- chalk menu 256x160
  item('menu', 0, 490, 256, 160, (g, w, h) => { g.fillStyle = '#2d3a34'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b4784c'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); txt(g, 'JUICE BAR', w / 2, 24, 22, '#f5ead2', { weight: 'bold' }); const L = [['GREEN MACHINE', '4'], ['BEET DROP', '4'], ['MANGO LASSI', '5'], ['GINGER SHOT', '2'], ['CHILL TEA', '2']]; L.forEach((l, i) => { g.font = 'bold 15px ' + FONT; g.textAlign = 'left'; g.fillStyle = i % 2 ? '#ffd8a0' : '#cfe8d0'; g.fillText(l[0], 22, 54 + i * 21); g.textAlign = 'right'; g.fillText('$' + l[1], w - 22, 54 + i * 21); }); });
  // ---- record sleeves strip 256x128
  item('records', 260, 450, 256, 128, (g, w, h) => { const R = rnd(21), cs = [PINK, TEAL, YEL, VIO, LIME, ORANGE, '#f5ead2', '#e8604a']; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const x = 4 + i * 63, y = 4 + j * 62; g.fillStyle = cs[(R() * 8) | 0]; g.fillRect(x, y, 56, 56); g.fillStyle = INK; g.beginPath(); g.arc(x + 28, y + 28, 18, 0, 7); g.fill(); g.fillStyle = cs[(R() * 8) | 0]; g.beginPath(); g.arc(x + 28, y + 28, 6, 0, 7); g.fill(); } });
  // ---- jukebox front 128x192
  item('jukebox', 520, 450, 128, 192, (g, w, h) => { g.fillStyle = grad(g, 0, 0, 0, h, [[0, '#7b2f8f'], [1, '#3b1f5c']]); g.fillRect(0, 0, w, h); g.fillStyle = grad(g, 0, 0, w, 0, [[0, '#ff3d9a'], [0.5, '#ffd23f'], [1, '#35f2e0']]); g.beginPath(); g.moveTo(10, 90); g.lineTo(10, 40); g.quadraticCurveTo(64, -14, 118, 40); g.lineTo(118, 90); g.closePath(); g.fill(); g.fillStyle = '#17102b'; g.beginPath(); g.moveTo(22, 90); g.lineTo(22, 44); g.quadraticCurveTo(64, 2, 106, 44); g.lineTo(106, 90); g.closePath(); g.fill(); g.fillStyle = '#ffe9a0'; for (let i = 0; i < 4; i++) g.fillRect(30, 46 + i * 11, 68, 6); g.fillStyle = '#2b2438'; g.fillRect(14, 104, 100, 54); g.fillStyle = '#35f2e0'; for (let i = 0; i < 6; i++) g.fillRect(20 + i * 15, 112, 10, 8); g.fillStyle = '#ff3d9a'; g.beginPath(); g.arc(64, 142, 10, 0, 7); g.fill(); txt(g, 'HITS', 64, 176, 20, YEL); });
  item('sandwich', 660, 450, 128, 192, (g, w, h) => { g.fillStyle = '#26343a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b4784c'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); txt(g, 'TONIGHT', w / 2, 34, 22, '#f5ead2'); g.fillStyle = '#ffd8a0'; g.fillRect(18, 52, w - 36, 3); txt(g, 'LIVE', w / 2, 92, 34, YEL); txt(g, 'MUSIC', w / 2, 126, 30, '#ff9ab8'); g.fillStyle = '#cfe8d0'; g.beginPath(); g.arc(34, 168, 6, 0, 7); g.arc(64, 168, 6, 0, 7); g.arc(94, 168, 6, 0, 7); g.fill(); });
  item('mat', 800, 450, 192, 96, (g, w, h) => { g.fillStyle = '#3b2655'; g.fillRect(0, 0, w, h); g.strokeStyle = YEL; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); txt(g, 'WELCOME', w / 2, 34, 32, CREAM); txt(g, 'BEATBOXERS', w / 2, 66, 22, PINK); });
  item('logo_stage', 0, 656, 320, 100, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); txt(g, 'THE BAR', w / 2, h / 2 + 2, 66, '#ffe9a0', { stroke: '#7a4a10', sw: 8, glow: '#ffb23a', gb: 14 }); });
  item('photos', 330, 656, 192, 96, (g, w, h) => { const cs = ['#ff9ab8', '#8fd6c0', '#ffd23f']; for (let i = 0; i < 3; i++) { g.save(); g.translate(34 + i * 62, 48); g.rotate((i - 1) * 0.12); g.fillStyle = '#f5ead2'; g.fillRect(-26, -34, 52, 66); g.fillStyle = cs[i]; g.fillRect(-21, -29, 42, 44); g.fillStyle = INK; g.beginPath(); g.arc(0, -10, 8, 0, 7); g.fill(); g.fillRect(-9, -2, 18, 14); g.restore(); } });
  item('dart', 530, 656, 128, 128, (g, w, h) => { g.fillStyle = '#17102b'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? RED : '#2f8f6a'; g.beginPath(); g.arc(64, 64, 56 - i * 11, 0, 7); g.fill(); g.fillStyle = i % 2 ? CREAM : INK; for (let k = 0; k < 10; k++) { g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 56 - i * 11, k * 0.628, k * 0.628 + 0.314); g.closePath(); g.fill(); } } g.fillStyle = RED; g.beginPath(); g.arc(64, 64, 6, 0, 7); g.fill(); });
  item('eq', 664, 656, 256, 100, (g, w, h) => { g.fillStyle = '#17102b'; g.fillRect(0, 0, w, h); const cs = [PINK, YEL, TEAL, VIO, LIME]; for (let i = 0; i < 20; i++) { const bh = 12 + ((i * 53) % 66); g.fillStyle = cs[i % 5]; g.fillRect(6 + i * 12, h - 6 - bh, 9, bh); } });
  item('bottles', 0, 790, 256, 64, (g, w, h) => { const cs = ['#2f8f6a', '#c05a2a', '#7b5cff', '#e8b64a', '#d9433f', '#35c8d8', '#9a7ad0']; for (let i = 0; i < 16; i++) { const bh = 26 + (i * 17) % 28; g.fillStyle = cs[i % cs.length]; g.fillRect(6 + i * 15, h - bh - 4, 11, bh); g.fillRect(9 + i * 15, h - bh - 14, 5, 10); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(8 + i * 15, h - bh, 2, bh - 8); } });
  item('tips', 270, 790, 128, 64, (g, w, h) => { g.fillStyle = '#f5ead2'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8604a'; g.fillRect(0, 0, w, 22); txt(g, 'TIPS = LOVE', w / 2, 12, 14, '#f5ead2'); txt(g, 'be kind', w / 2, 44, 18, INK); });
  item('rohzel', 410, 790, 160, 64, (g, w, h) => { g.fillStyle = '#26343a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b4784c'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6); txt(g, 'MON CLOSED', w / 2, 22, 20, '#ffd8a0'); txt(g, 'ask Rohzel', w / 2, 46, 16, '#cfe8d0'); });
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
  jobs.forEach(([x, y, w, h, fn]) => { g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h); g.restore(); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  Object.keys(rect).forEach((k) => { const r = rect[k], e = 1.2; r[0] += e / W; r[2] -= e / W; r[1] += e / H; r[3] -= e / H; });
  return { tex, rect };
}

// ---- live canvases ----------------------------------------------------------------------------------------------------------------
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const PROGRAMMES = {
  closed: { id: 'closed', name: 'Closed', desc: 'Rohzel\'s day off.', tag: 'CLOSED', color: '#9a8ab0' },
  openmic: { id: 'openmic', name: 'Open Mic', desc: 'Sign up, play a set.', tag: 'OPEN MIC', color: '#35f2e0' },
  showcase: { id: 'showcase', name: 'Friday Showcase', desc: 'Paid slot. Needs 50 fans and 5 open mics.', tag: 'SHOWCASE', color: '#ffd23f' },
  battle: { id: 'battle', name: 'Battle Night', desc: 'Step up. Beat the ladder.', tag: 'BATTLE NIGHT', color: '#ff4f8b' },
  karaoke: { id: 'karaoke', name: 'Karaoke Sunday', desc: 'No pressure. Just vibes.', tag: 'KARAOKE', color: '#9dff4a' },
};
// same table as Core.barProgramme (day % 7: 0 closed, 1..3 open mic, 4 showcase, 5 battle, 6 karaoke). Core wins when it is loaded.
export function programmeFor(day, Core) {
  try { if (Core && Core.barProgramme) { const p = Core.barProgramme(day); return Object.assign({}, PROGRAMMES[p.id] || PROGRAMMES.openmic, p); } } catch (e) { /* fall through */ }
  const d = ((day % 7) + 7) % 7; return PROGRAMMES[d === 0 ? 'closed' : d <= 3 ? 'openmic' : d === 4 ? 'showcase' : d === 5 ? 'battle' : 'karaoke'];
}
export function dayNameFor(day, Core) { try { if (Core && Core.dayName) return Core.dayName(day); } catch (e) { /* ignore */ } return DAY_NAMES[((day % 7) + 7) % 7]; }

// chalkboard 256x340: tonight's programme and the day name in chalk
export function drawChalkboard(g, w, h, info) {
  info = info || {}; const prog = info.programme || PROGRAMMES.openmic, day = info.dayName || 'Tuesday', R = rnd(77);
  g.fillStyle = '#24312e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.02 + R() * 0.03) + ')'; g.fillRect(R() * w, R() * h, 30 + R() * 80, 2 + R() * 4); }
  g.strokeStyle = '#b4784c'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12); g.strokeStyle = '#8a5a38'; g.lineWidth = 3; g.strokeRect(13, 13, w - 26, h - 26);
  g.save(); g.shadowColor = 'rgba(255,255,255,0.35)'; g.shadowBlur = 3;
  txt(g, 'TONIGHT', w / 2, 46, 30, '#f5ead2'); g.strokeStyle = '#f5ead2'; g.lineWidth = 2; g.beginPath(); g.moveTo(34, 70); g.lineTo(w - 34, 70); g.stroke();
  txt(g, day.toUpperCase(), w / 2, 100, 26, '#ffd8a0');
  const tag = prog.tag || prog.name.toUpperCase(), words = tag.split(' '); const col = prog.color || '#35f2e0'; const big = words.length > 1 ? words : [tag];
  big.forEach((wd, i) => txt(g, wd, w / 2, 150 + i * 42, wd.length > 6 ? 38 : 48, col));
  g.strokeStyle = col; g.lineWidth = 3; g.setLineDash([10, 8]); g.strokeRect(24, 120, w - 48, big.length * 42 + 22); g.setLineDash([]);
  const desc = (prog.desc || '').split(/(?<=[.!?])\s+/).slice(0, 3); const y0 = 150 + big.length * 42 + 36; desc.forEach((l, i) => txt(g, l, w / 2, y0 + i * 24, 15, '#cfe8d0', { weight: 'normal' }));
  if (info.hour !== undefined) txt(g, String(info.hour % 24).padStart(2, '0') + ':00 doors open', w / 2, h - 34, 15, '#ffd8a0', { weight: 'normal' }); else txt(g, 'doors 18:00', w / 2, h - 34, 15, '#ffd8a0', { weight: 'normal' });
  g.restore();
}
// banner 512x128 hung over the stage: the programme in big letters; battle night gets crossed mics and a red field
export function drawBanner(g, w, h, info) {
  info = info || {}; const prog = info.programme || PROGRAMMES.openmic, battle = prog.id === 'battle'; const tag = prog.tag || prog.name.toUpperCase();
  const c0 = battle ? '#e0243f' : prog.id === 'showcase' ? '#d9a02a' : prog.id === 'karaoke' ? '#2f9a6a' : prog.id === 'closed' ? '#5a4a78' : '#6a3fd0', c1 = battle ? '#7a1030' : prog.id === 'showcase' ? '#8a5a10' : prog.id === 'karaoke' ? '#1f6a50' : prog.id === 'closed' ? '#2f2548' : '#3b2088';
  g.fillStyle = grad(g, 0, 0, 0, h, [[0, c0], [1, c1]]); g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.1)'; for (let i = -2; i < 14; i++) { g.beginPath(); g.moveTo(i * 44, 0); g.lineTo(i * 44 + 22, 0); g.lineTo(i * 44 + 22 - 30, h); g.lineTo(i * 44 - 30, h); g.closePath(); g.fill(); }
  g.strokeStyle = '#ffe9a0'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(12, 12, w - 24, h - 24);
  if (battle) { [-1, 1].forEach((s) => { g.save(); g.translate(w / 2 + s * 205, h / 2); g.rotate(s * 0.6); g.fillStyle = '#ffe9a0'; g.fillRect(-5, -44, 10, 70); g.beginPath(); g.arc(0, -52, 15, 0, 7); g.fill(); g.restore(); }); }
  txt(g, tag, w / 2, h / 2 + 4, tag.length > 9 ? 62 : 78, '#fff6dc', { stroke: '#2b1238', sw: 12 });
}
