// Procedural art for the Cat Kingdom buildings. Drawn into a 120x120 box, base at y=112.
// Level 0 is a ghostly blueprint with scaffolding; each level adds something to the building.
import { TAU, INK, mix, shade, lineOf, ell, poly, fillPath, star, line } from './art_util.js';

const P = (d) => new Path2D(d);
function box(ctx, x, y, w, h, c, lw = 1.2) { fillPath(ctx, P(`M${x} ${y} h${w} v${h} h${-w} z`), c, lw); }
function roof(ctx, x, y, w, h, c) { fillPath(ctx, P(`M${x - 4} ${y} L${x + w / 2} ${y - h} L${x + w + 4} ${y} Z`), c, 1.3); }
function door(ctx, x, y, w, h) { fillPath(ctx, P(`M${x} ${y} v${-h + w / 2} a${w / 2} ${w / 2} 0 0 1 ${w} 0 v${h - w / 2} z`), '#5a3a2a', 1); }
function win(ctx, x, y, r, glowy = true) { fillPath(ctx, ell(ctx, x, y, r, r), glowy ? '#ffe9a0' : '#bfe6ff', 1); ctx.strokeStyle = 'rgba(80,50,30,.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); }
function sparkle(ctx, x, y, r, c = '#fff6b0') { ctx.fillStyle = c; ctx.fill(star(x, y, r, r * 0.32, 4)); }
function smoke(ctx, x, y) { ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + i * 3, y - i * 7, 3 + i, 0, TAU); ctx.fill(); } }
function flag(ctx, x, y, c) { line(ctx, [[x, y], [x, y - 16]], '#6a4a2a', 1.6); fillPath(ctx, P(`M${x} ${y - 16} l12 4 l-12 5 z`), c, 0.9); }

const B = {
  dojo(ctx, l) {
    box(ctx, 26, 82, 68, 30, '#c9824a'); door(ctx, 53, 112, 14, 22);
    for (const x of [32, 82]) box(ctx, x, 86, 6, 26, '#a8643a', 0.8);
    const tiers = 1 + (l >= 3) + (l >= 5);
    for (let i = 0; i < tiers; i++) {
      const y = 82 - i * 22, w = 84 - i * 18;
      fillPath(ctx, P(`M${60 - w / 2 - 6} ${y} Q${60} ${y - 8} ${60 + w / 2 + 6} ${y} L${60 + w / 2 - 4} ${y - 14} Q60 ${y - 20} ${60 - w / 2 + 4} ${y - 14} Z`), '#c0304a', 1.3);
      if (i < tiers - 1) box(ctx, 60 - w / 2 + 12, y - 14, w - 24, 8, '#c9824a', 0.8);
    }
    if (l >= 2) flag(ctx, 98, 82, '#ffd23f');
    if (l >= 4) for (const x of [22, 98]) { fillPath(ctx, ell(ctx, x, 96, 4, 5), '#ff7a5a', 0.8); }
  },
  beds(ctx, l) {
    box(ctx, 28, 70, 56, 42, '#ffd1e0'); roof(ctx, 28, 70, 56, 28, '#e0708f'); door(ctx, 50, 112, 14, 22); win(ctx, 38, 88, 6); win(ctx, 74, 88, 6);
    box(ctx, 66, 46, 8, 16, '#b8685a', 0.9); smoke(ctx, 70, 42);
    if (l >= 2) { box(ctx, 84, 84, 22, 28, '#ffe3ee'); roof(ctx, 84, 84, 22, 14, '#e0708f'); }
    if (l >= 4) for (const x of [34, 46, 70]) { fillPath(ctx, ell(ctx, x, 110, 3, 3), ['#ff9ac6', '#ffd23f', '#fff'][x % 3], 0.5); }
    if (l >= 5) sparkle(ctx, 56, 30, 7, '#ffd23f');
  },
  yarn(ctx, l) {
    box(ctx, 26, 72, 68, 40, '#8fd3ff'); roof(ctx, 26, 72, 68, 22, '#7a5ad0'); door(ctx, 52, 112, 16, 24); win(ctx, 38, 90, 6, false);
    fillPath(ctx, ell(ctx, 60, 42, 16, 16), '#ff8fb7', 1.3);
    ctx.strokeStyle = '#d9507f'; ctx.lineWidth = 1; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(60, 42, 16, 6 + Math.abs(i) * 4, i * 0.6, 0, TAU); ctx.stroke(); }
    if (l >= 2) line(ctx, [[82, 88], [96, 100], [88, 108]], '#ff8fb7', 2);
    if (l >= 3) fillPath(ctx, star(86, 62, 9, 6.5, 8), '#c9d2e0', 1);
    if (l >= 5) sparkle(ctx, 80, 36, 6);
  },
  spa(ctx, l) {
    fillPath(ctx, ell(ctx, 60, 98, 42, 16), '#b8a58a', 1.3); fillPath(ctx, ell(ctx, 60, 97, 36, 12), '#7fd3ff', 1);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const x of [48, 62, 74]) { ctx.beginPath(); ctx.moveTo(x, 84); ctx.bezierCurveTo(x - 6, 72, x + 6, 64, x, 52); ctx.stroke(); }
    for (let i = 0; i < 5; i++) box(ctx, 14 + i * 5, 84, 3.4, 22, '#7fb86a', 0.6);
    if (l >= 3) { box(ctx, 96, 80, 10, 22, '#9aa6b8'); fillPath(ctx, P('M94 80 h14 l-7 -10 z'), '#8a96a8', 1); sparkle(ctx, 101, 74, 3, '#ffe9a0'); }
    if (l >= 5) { box(ctx, 56, 70, 8, 14, '#9aa6b8'); fillPath(ctx, ell(ctx, 60, 68, 6, 3), '#bfeaff', 0.8); }
  },
  tower(ctx, l) {
    const h = 44 + l * 6, y = 112 - h;
    box(ctx, 44, y, 32, h, '#aab4c4'); for (let i = 0; i < 4; i++) box(ctx, 42 + i * 9, y - 6, 7, 8, '#aab4c4', 0.9);
    fillPath(ctx, P(`M44 ${y - 6} h32 v6 h-32 z`), '#98a4b6', 0.6);
    door(ctx, 53, 112, 14, 20); win(ctx, 60, y + 14, 5, false);
    if (l >= 2) win(ctx, 60, y + 28, 4);
    flag(ctx, 60, y - 6, l >= 5 ? '#ffd23f' : '#c0304a');
    if (l >= 3) { line(ctx, [[76, y + 8], [94, y]], '#6a4a2a', 3); fillPath(ctx, ell(ctx, 95, y - 1, 3, 3), '#9fd8ff', 0.8); }
    if (l >= 5) sparkle(ctx, 60, y - 28, 6, '#ffd23f');
  },
  shrine(ctx, l) {
    for (const x of [34, 78]) box(ctx, x, 54, 8, 58, '#d9402e', 1);
    fillPath(ctx, P('M24 52 Q60 40 96 52 L96 60 L24 60 Z'), '#b8281c', 1.3); box(ctx, 30, 64, 60, 6, '#d9402e', 1);
    fillPath(ctx, ell(ctx, 60, 90, 8, 8), '#bfe6ff', 1);
    const gl = ctx.createRadialGradient(60, 90, 0, 60, 90, 16); gl.addColorStop(0, 'rgba(255,255,255,.8)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gl; ctx.fillRect(40, 70, 40, 40);
    if (l >= 2) for (const x of [20, 100]) { box(ctx, x - 3, 96, 6, 16, '#9aa6b8', 0.8); fillPath(ctx, ell(ctx, x, 94, 6, 5), '#ffe9a0', 0.8); }
    if (l >= 4) sparkle(ctx, 60, 30, 7, '#ffd23f');
    if (l >= 5) { sparkle(ctx, 30, 40, 4); sparkle(ctx, 92, 36, 4); }
  },
  vault(ctx, l) {
    box(ctx, 24, 56, 72, 56, '#9aa6b8'); fillPath(ctx, P('M20 56 L60 34 L100 56 Z'), l >= 5 ? '#ffd23f' : '#7a869a', 1.3);
    fillPath(ctx, ell(ctx, 60, 90, 16, 16), '#c9d2e0', 1.4); fillPath(ctx, ell(ctx, 60, 90, 9, 9), '#7a869a', 1); dot(ctx, 60, 90, 2.4, '#ffd23f');
    for (let i = 0; i < 3 + l; i++) fillPath(ctx, ell(ctx, 30 + i * 9, 108, 5, 2.6), '#ffd23f', 0.7);
    if (l >= 3) for (const x of [26, 86]) box(ctx, x, 60, 8, 52, '#b4bfcf', 0.9);
  },
  tent(ctx, l) {
    fillPath(ctx, P('M16 112 L60 36 L104 112 Z'), '#7a4ad0', 1.4); fillPath(ctx, P('M60 36 L60 112 L48 112 Z'), '#6a3ac0', 0.5);
    fillPath(ctx, P('M46 112 L60 84 L74 112 Z'), '#2a1a50', 1);
    for (const [x, y, r] of [[40, 90, 3], [80, 86, 3.4], [58, 62, 3], [72, 70, 2.4], [48, 76, 2.4]]) sparkle(ctx, x, y, r, '#ffe14d');
    const gl = ctx.createRadialGradient(92, 102, 0, 92, 102, 14); gl.addColorStop(0, 'rgba(200,160,255,.9)'); gl.addColorStop(1, 'rgba(200,160,255,0)'); ctx.fillStyle = gl; ctx.fillRect(76, 86, 32, 32);
    fillPath(ctx, ell(ctx, 92, 104, 6, 6), '#d9c9ff', 1); fillPath(ctx, P('M86 110 h12 l-2 4 h-8 z'), '#5a3a2a', 0.8);
    if (l >= 3) { flag(ctx, 60, 38, '#ff8fb7'); }
    if (l >= 5) { sparkle(ctx, 26, 60, 5); sparkle(ctx, 98, 54, 4); }
  },
  stall(ctx, l) {
    box(ctx, 26, 70, 68, 42, '#c9a066'); box(ctx, 26, 92, 68, 6, '#a8804a', 0.8);
    for (let i = 0; i < 6; i++) fillPath(ctx, P(`M${22 + i * 13} 52 h13 l-2 18 h-13 z`), i % 2 ? '#ffffff' : '#e0508a', 0.9);
    fillPath(ctx, P('M20 52 Q60 40 100 52 L96 56 L24 56 Z'), '#e0508a', 1);
    for (let i = 0; i < 2 + l; i++) fillPath(ctx, P(`M${32 + i * 14} 90 q6 -8 12 0 q-6 4 -12 0 z`), ['#ff9a6a', '#8fd3ff', '#ffd23f'][i % 3], 0.7);
    if (l >= 2) { box(ctx, 98, 94, 14, 18, '#a8804a', 0.9); fillPath(ctx, P('M99 98 q6 -6 12 0 q-6 4 -12 0 z'), '#8fd3ff', 0.6); }
    if (l >= 3) fillPath(ctx, P('M44 40 h32 v10 h-32 z'), '#fff8ef', 1);
  },
};
function dot(ctx, x, y, r, c) { fillPath(ctx, ell(ctx, x, y, r, r), c, 0.5); }

export function drawBuilding(ctx, id, lvl) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // grass patch under every building
  fillPath(ctx, ell(ctx, 60, 112, 52, 7), 'rgba(90,150,80,.55)', 0.6, 'rgba(60,110,60,.5)');
  ctx.save();
  if (lvl <= 0) {
    ctx.globalAlpha = 0.3; B[id](ctx, 1); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 2.4;
    for (const x of [30, 90]) { ctx.beginPath(); ctx.moveTo(x, 112); ctx.lineTo(x, 50); ctx.stroke(); }
    for (const y of [64, 84, 104]) { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(90, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(138,106,74,.7)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(30, 104); ctx.lineTo(90, 64); ctx.moveTo(90, 104); ctx.lineTo(30, 64); ctx.stroke();
  } else B[id](ctx, lvl);
  ctx.restore();
}
