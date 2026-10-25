// Procedural art for the mice and rats, the nests and the parallax backdrops.
import { TAU, INK, mix, shade, lineOf, ell, cel, poly, fillPath, star, line, mulberry, hash, outlineCanvas, rimLight, texturize } from './art_util.js';

const B = [-20, -50, 20, 0];
function limb(ctx, x, y, rx, ry, fill, lw = 0.9) { fillPath(ctx, ell(ctx, x, y, rx, ry), fill, lw); }
function rod(ctx, x1, y1, x2, y2, w, color) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = lineOf(color); ctx.lineWidth = w + 1.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

// ---------------------------------------------------------------- mice and rats (face left, feet at 0,0)
let curElite = false;
function mouseBody(ctx, o) {
  const fur = o.fur, belly = o.belly || shade(fur, 0.5), inner = o.inner || '#ffb3c8';
  // tail
  ctx.lineCap = 'round';
  ctx.strokeStyle = lineOf('#f1a6b8'); ctx.lineWidth = 3.6;
  ctx.beginPath(); ctx.moveTo(8, -9); ctx.bezierCurveTo(26, -4, 30, -20, 38, -22); ctx.stroke();
  ctx.strokeStyle = '#f7bccb'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(8, -9); ctx.bezierCurveTo(26, -4, 30, -20, 38, -22); ctx.stroke();
  // far ear and body
  fillPath(ctx, ell(ctx, 4, -41, 8, 8.4), fur, 1);
  cel(ctx, ell(ctx, 2, -13, 11.5, 12.5), fur, { box: [-10, -26, 14, 0] });
  ctx.save(); ctx.clip(ell(ctx, 2, -13, 11.5, 12.5)); ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(-3, -10, 7, 9.5, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.strokeStyle = lineOf(fur); ctx.lineWidth = 1; ctx.stroke(ell(ctx, 2, -13, 11.5, 12.5));
  limb(ctx, -4, -1.8, 5, 2.8, fur); limb(ctx, 8, -1.8, 5, 2.8, fur);
  // head
  fillPath(ctx, ell(ctx, -9, -42, 7.6, 8), fur, 1); fillPath(ctx, ell(ctx, -9, -42, 4.5, 4.9), inner, 0.5);
  fillPath(ctx, ell(ctx, 4, -41, 8, 8.4), fur, 1); fillPath(ctx, ell(ctx, 4.5, -41, 5, 5.4), inner, 0.5);
  const head = new Path2D(); head.ellipse(-5, -31, 13.5, 11.8, 0, 0, TAU);
  cel(ctx, head, fur, { box: [-19, -43, 9, -19] });
  cel(ctx, ell(ctx, -16, -27.5, 7.4, 5.2), shade(fur, 0.22), { shade: false, lw: 0.9 });
  fillPath(ctx, ell(ctx, -22.4, -29.6, 2.5, 2.2), '#ff8fa8', 0.7); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-23, -30.4, 0.7, 0, TAU); ctx.fill();
  // eye: big and shiny, with a mean brow
  const eyeC = o.eye || '#2a1a3a';
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-8.6, -33, 4.2, 4.8, 0.1, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.fillStyle = eyeC; ctx.beginPath(); ctx.ellipse(-9.4, -32.8, 2.6, 3.7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-10.2, -34.4, 1.1, 0, TAU); ctx.fill();
  // threat cue: narrowed upper lid and a red glint in the eye (stronger on elites)
  ctx.save(); ctx.beginPath(); ctx.ellipse(-8.6, -33, 4.2, 4.8, 0.1, 0, TAU); ctx.clip();
  ctx.fillStyle = fur; ctx.beginPath(); ctx.moveTo(-14, -39); ctx.lineTo(-3, -39); ctx.lineTo(-3, -34.6); ctx.lineTo(-14, -36.8); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-14, -36.8); ctx.lineTo(-3, -34.6); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = curElite ? 'rgba(255,50,50,.95)' : 'rgba(255,60,60,.5)'; ctx.beginPath(); ctx.arc(-8.2, -31.2, curElite ? 1.25 : 0.95, 0, TAU); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.9;
  ctx.beginPath(); ctx.moveTo(-14.2, -36.6); ctx.lineTo(-3.2, -40.4); ctx.stroke();
  // grin with a little fang
  ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-21, -25.6); ctx.quadraticCurveTo(-16, -22.4, -10.6, -25); ctx.stroke();
  fillPath(ctx, poly(ctx, [[-18, -24.6], [-16.6, -24], [-17.4, -21]]), '#fff', 0.5);
  fillPath(ctx, poly(ctx, [[-14, -24], [-12.8, -24.6], [-13.4, -21.4]]), '#fff', 0.5);
  // scar
  if (o.scar !== false) { ctx.strokeStyle = 'rgba(170,60,80,.7)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-4, -28); ctx.lineTo(1, -33); ctx.moveTo(-5.2, -32); ctx.lineTo(-0.4, -28.6); ctx.stroke(); }
  // front paw
  limb(ctx, -11, -14, 3.6, 3.4, fur);
}
function dagger(ctx, x = -13, y = -14, len = 15) {
  rod(ctx, x, y, x - len, y - len * 0.55, 2.4, '#dfe6f2');
  rod(ctx, x + 1, y + 0.5, x - 2.5, y - 1.3, 3.4, '#7a4a2a');
}

const ENEMY_ART = {
  mouse(ctx) { ctx.save(); ctx.scale(1.2, 1.2); mouseBody(ctx, { fur: '#b9b3cc' }); dagger(ctx); ctx.restore(); },
  scout(ctx) {
    mouseBody(ctx, { fur: '#d8cf9a', inner: '#ffc4b0' });
    ctx.fillStyle = '#e04a4a'; ctx.beginPath(); ctx.moveTo(-17, -38); ctx.quadraticCurveTo(-6, -46, 6, -36); ctx.lineTo(6, -33); ctx.quadraticCurveTo(-6, -42, -17, -34); ctx.fill();
    fillPath(ctx, poly(ctx, [[6, -37], [16, -42], [12, -36], [18, -33], [6, -33]]), '#e04a4a', 0.7);
    for (const y of [-20, -12]) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(30, y); ctx.stroke(); }
    dagger(ctx, -13, -14, 12);
  },
  slinger(ctx) {
    mouseBody(ctx, { fur: '#a9c2a4', inner: '#ffc4b0' });
    fillPath(ctx, new Path2D('M-16 -40 Q-6 -52 6 -40 Q-6 -43 -16 -40 Z'), '#6a8a4a', 1);
    fillPath(ctx, new Path2D('M6 -20 L16 -22 L18 -8 L8 -6 Z'), '#8a6a3a', 0.9);
    rod(ctx, -14, -14, -22, -24, 2.2, '#7a4a2a'); rod(ctx, -22, -24, -28, -30, 2.2, '#7a4a2a'); rod(ctx, -22, -24, -18, -31, 2.2, '#7a4a2a');
    ctx.strokeStyle = '#d4a050'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-28, -30); ctx.lineTo(-24, -26); ctx.lineTo(-18, -31); ctx.stroke();
    fillPath(ctx, ell(ctx, -24, -26.5, 2.2, 2.2), '#8a8a96', 0.6);
  },
  brute(ctx) {
    ctx.save(); ctx.scale(1.85, 1.85);
    mouseBody(ctx, { fur: '#6a6277', belly: '#a69eb8', inner: '#c98aa4', eye: '#d42a3a' });
    fillPath(ctx, new Path2D('M-4 -23 L10 -25 L12 -9 L-2 -6 Z'), '#4a3a30', 0.8);
    for (const [x, y] of [[0, -20], [4, -14], [8, -20], [6, -10]]) { ctx.fillStyle = '#c9c9d4'; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); }
    for (const x of [-16, -11, -6]) fillPath(ctx, poly(ctx, [[x, -22.4], [x + 1.6, -26], [x + 3.2, -22.4]]), '#c9c9d4', 0.5);
    ctx.fillStyle = '#10101a'; ctx.beginPath(); ctx.moveTo(1.4, -45.5); ctx.lineTo(4, -43.5); ctx.lineTo(1.2, -41.8); ctx.fill();
    rod(ctx, -11, -14, -26, -30, 3.6, '#8a5a34'); fillPath(ctx, ell(ctx, -26.5, -30.5, 4.6, 4.6), '#8a5a34', 0.8);
    for (const [x, y] of [[-28, -33], [-24, -34], [-29, -28]]) { ctx.fillStyle = '#d8d8e4'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 2); ctx.lineTo(x, y - 0.8); ctx.fill(); }
    ctx.restore();
  },
  armored(ctx) {
    ctx.save(); ctx.scale(1.12, 1.12);
    mouseBody(ctx, { fur: '#b5b0c0' });
    fillPath(ctx, new Path2D('M-19 -37 Q-5 -56 9 -37 Z'), '#aab4c4', 1.1);
    line(ctx, [[-19, -37], [9, -37]], '#6c7688', 1.4);
    for (const x of [-12, -5, 2]) { ctx.fillStyle = '#6c7688'; ctx.beginPath(); ctx.arc(x, -42, 0.9, 0, TAU); ctx.fill(); }
    fillPath(ctx, ell(ctx, -15, -14, 7, 8.4), '#8a9ab0', 1.1); fillPath(ctx, ell(ctx, -15, -14, 3.4, 4.2), '#c4cfe0', 0.6);
    dagger(ctx, -16, -16, 11);
    ctx.restore();
  },
  glider(ctx) {
    mouseBody(ctx, { fur: '#c7b9a5', inner: '#ffc4b0' });
    fillPath(ctx, new Path2D('M-34 -48 L8 -62 L38 -44 L2 -52 Z'), '#fffdf4', 1.1);
    fillPath(ctx, new Path2D('M2 -52 L8 -62 L38 -44 Z'), '#e8e2d0', 0.8);
    line(ctx, [[-34, -48], [2, -52]], 'rgba(120,100,70,.6)', 0.7);
    rod(ctx, -6, -48, -10, -38, 1.4, '#7a4a2a'); rod(ctx, 8, -50, 6, -38, 1.4, '#7a4a2a');
    dagger(ctx, -13, -14, 10);
  },
  bomber(ctx) {
    mouseBody(ctx, { fur: '#9aa0b8', eye: '#ff3a3a' });
    fillPath(ctx, ell(ctx, 12, -19, 11, 11), '#26242f', 1.1); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(8, -23, 3.4, 2, -0.6, 0, TAU); ctx.fill();
    line(ctx, [[13, -30], [16, -37], [21, -38]], '#caa86a', 1.4);
    ctx.fillStyle = '#ffcc33'; ctx.fill(star(22, -38.5, 4.4, 1.5, 6)); ctx.fillStyle = '#ff6a2b'; ctx.fill(star(22, -38.5, 2.6, 1, 6));
    line(ctx, [[-4, -6], [14, -14]], '#d44a4a', 2.2);
  },
  shaman(ctx) {
    ctx.save(); ctx.scale(1.18, 1.18);
    mouseBody(ctx, { fur: '#8a7ab0', inner: '#d9a6d0', eye: '#9bff6b' });
    fillPath(ctx, new Path2D('M-17 -37 Q-6 -58 8 -36 Q16 -20 14 -2 L-12 -2 L-8 -14 Q-20 -24 -17 -37 Z'), 'rgba(80,50,130,.92)', 1.1);
    ctx.fillStyle = 'rgba(155,255,107,.9)'; ctx.beginPath(); ctx.arc(-9, -32, 2.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-9.8, -33, 0.9, 0, TAU); ctx.fill();
    rod(ctx, -13, -2, -15, -44, 2.2, '#6a4a2a'); fillPath(ctx, ell(ctx, -15.4, -48, 4.6, 4.6), '#7fdc5a', 1); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(-16.6, -49.4, 1.3, 0, TAU); ctx.fill();
    ctx.restore();
  },  dasher(ctx) {
    // lean and fast: speed streaks behind it, a flying red bandana
    ctx.save(); ctx.scale(0.95, 0.95); ctx.rotate(-0.07);
    for (const [y, l] of [[-30, 22], [-22, 30], [-14, 18]]) line(ctx, [[22, y], [22 + l, y + 1]], 'rgba(255,255,255,.55)', 1.6);
    mouseBody(ctx, { fur: '#c9a98a', inner: '#ffc4b0', eye: '#ff4a4a' });
    fillPath(ctx, poly(ctx, [[-17, -42], [4, -45], [3, -39], [-16, -37]]), '#e8404a', 1);
    fillPath(ctx, poly(ctx, [[3, -43], [20, -50], [14, -44], [22, -41], [4, -40]]), '#e8404a', 0.9);
    dagger(ctx, -14, -15, 12);
    ctx.restore();
  },
  shield(ctx) {
    // a big round shield held in front: it soaks up burns, slows and poison until it breaks
    ctx.save(); ctx.scale(1.08, 1.08);
    mouseBody(ctx, { fur: '#aeb4c8', inner: '#ffc4cc' });
    fillPath(ctx, new Path2D('M-17 -38 Q-5 -50 8 -38 Z'), '#7a8aa8', 1.1);
    fillPath(ctx, ell(ctx, -21, -17, 14, 17), '#4a7ad8', 1.5);
    fillPath(ctx, ell(ctx, -21, -17, 10.5, 13.5), '#5c90ee', 0.9);
    ctx.strokeStyle = '#d8e4ff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(-21, -17, 14, 17, 0, 0, TAU); ctx.stroke();
    fillPath(ctx, star(-21, -17, 6, 2.6, 4), '#ffd23f', 0.8);
    for (const [x, y] of [[-21, -31], [-21, -3], [-33, -17], [-9, -17]]) { ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, TAU); ctx.fill(); }
    ctx.restore();
  },
  digger(ctx) {
    // hard hat with a lamp, goggles and a pickaxe, dusty from tunnelling
    ctx.save(); ctx.scale(1.08, 1.08);
    mouseBody(ctx, { fur: '#9a8068', inner: '#e0b090' });
    fillPath(ctx, new Path2D('M-18 -37 Q-5 -54 9 -37 Z'), '#ffcf3a', 1.1);
    line(ctx, [[-18, -37], [9, -37]], '#c8901a', 1.6);
    fillPath(ctx, ell(ctx, -15, -41, 3.4, 3), '#fff6b0', 0.9);
    ctx.fillStyle = 'rgba(255,255,200,.35)'; ctx.beginPath(); ctx.moveTo(-17, -41); ctx.lineTo(-34, -48); ctx.lineTo(-34, -33); ctx.fill();
    fillPath(ctx, ell(ctx, -8.5, -33, 5.6, 5.2), 'rgba(160,230,255,.55)', 1.2);
    rod(ctx, -4, -4, 12, -40, 2.4, '#7a4a2a');
    fillPath(ctx, new Path2D('M8 -43 Q14 -50 22 -44 L19 -41 Q14 -45 10 -40 Z'), '#aab4c4', 1);
    for (const [x, y] of [[8, -4], [16, -2], [-26, -2]]) { ctx.fillStyle = 'rgba(140,100,60,.8)'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill(); }
    ctx.restore();
  },
};

const spriteCache = new Map();
export function enemySprite(type, elite) {
  const key = type + (elite ? '*' : '');
  if (spriteCache.has(key)) return spriteCache.get(key);
  const S = 2, W = 130, H = 130, ax = 65, ay = 110;
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const ctx = c.getContext('2d'); ctx.scale(S, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  curElite = !!elite;
  const draw = () => { ctx.save(); ctx.translate(ax, ay); ENEMY_ART[type](ctx); ctx.restore(); };
  if (elite) { ctx.shadowColor = '#ffcf3a'; ctx.shadowBlur = 10; draw(); draw(); ctx.shadowBlur = 0; }
  draw();
  if (elite) {
    ctx.save(); ctx.translate(ax, ay);
    const hy = { brute: -78, shaman: -62, armored: -58 }[type] || -52;
    fillPath(ctx, poly(ctx, [[-8, hy], [-8, hy - 8], [-4, hy - 4], [0, hy - 10], [4, hy - 4], [8, hy - 8], [8, hy]]), '#ffd23f', 0.9);
    ctx.restore();
  }
  texturize(c, { seed: hash(key), len: 6, lw: 1.3, count: 1700, dir: Math.PI / 2 + 0.3, spread: 1.4 });   // fur
  const r = { c: outlineCanvas(rimLight(c, 2, '#fff0c0', 0.4), 2, '#2a1840', 0.85), ax, ay, w: W, h: H };
  spriteCache.set(key, r);
  return r;
}

// ---------------------------------------------------------------- nests (drawn at 200x200, anchor bottom centre)
function nestBody(ctx, kind) {
  const door = () => { ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.moveTo(78, 192); ctx.lineTo(78, 160); ctx.quadraticCurveTo(100, 126, 122, 160); ctx.lineTo(122, 192); ctx.fill(); ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 2; ctx.stroke(); };
  const mound = (c) => { fillPath(ctx, new Path2D('M8 196 Q30 150 100 146 Q170 150 192 196 Z'), c, 1.4); };
  if (kind === 'cheese') {
    mound('#8fd36e');
    fillPath(ctx, new Path2D('M22 192 L40 100 L160 100 L178 192 Z'), '#ffd34a', 1.6);
    fillPath(ctx, new Path2D('M40 100 L100 54 L160 100 Z'), '#ffe27a', 1.6);
    for (const [x, y, r] of [[56, 120, 8], [140, 130, 10], [118, 108, 6], [60, 160, 9], [150, 168, 7], [96, 78, 5], [112, 70, 4]]) { ctx.fillStyle = '#e0a52a'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, TAU); ctx.fill(); }
    door();
    rod(ctx, 100, 54, 100, 20, 2, '#6a4a2a'); fillPath(ctx, new Path2D('M100 20 L128 28 L100 38 Z'), '#e04a4a', 1);
  } else if (kind === 'pipe') {
    mound('#6f8a5f');
    fillPath(ctx, new Path2D('M12 192 L12 106 Q12 90 30 90 L170 90 Q188 90 188 106 L188 192 Z'), '#7a9a86', 1.6);
    for (const x of [30, 100, 170]) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x - 3, 90, 6, 102); }
    fillPath(ctx, ell(ctx, 100, 70, 46, 12), '#8aa896', 1.4); fillPath(ctx, ell(ctx, 100, 68, 38, 8), '#2a4a3a', 1);
    door();
    ctx.fillStyle = '#9bdc4a'; for (const x of [20, 60, 140, 176]) { ctx.beginPath(); ctx.ellipse(x, 120 + (x % 3) * 8, 4, 12, 0, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(18 + i * 42, 94, 6, 14); }
  } else if (kind === 'castle') {
    mound('#6a7a6a');
    fillPath(ctx, new Path2D('M30 192 L30 100 L170 100 L170 192 Z'), '#9a9aa8', 1.6);
    for (const x of [14, 150]) { fillPath(ctx, new Path2D(`M${x} 192 L${x} 70 L${x + 36} 70 L${x + 36} 192 Z`), '#8a8a9a', 1.6); fillPath(ctx, new Path2D(`M${x - 4} 70 L${x + 18} 22 L${x + 40} 70 Z`), '#7a3a4a', 1.6); }
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#9a9aa8'; ctx.fillRect(40 + i * 28, 90, 16, 12); ctx.strokeStyle = lineOf('#9a9aa8'); ctx.lineWidth = 1; ctx.strokeRect(40 + i * 28, 90, 16, 12); }
    for (const [x, y] of [[32, 110], [168, 110], [32, 140], [168, 140]]) { ctx.fillStyle = '#1b1020'; ctx.fillRect(x - 3, y, 6, 14); }
    door();
    for (const x of [32, 168]) { rod(ctx, x, 24, x, 6, 1.6, '#6a4a2a'); fillPath(ctx, new Path2D(`M${x} 6 L${x + 14} 11 L${x} 16 Z`), '#c0304a', 0.8); }
  } else if (kind === 'trash') {
    mound('#6a6a5a');
    for (const [x, y, w, h, c] of [[20, 140, 60, 52, '#c9a56a'], [90, 150, 50, 42, '#9aa6b8'], [130, 120, 56, 72, '#b58a56'], [50, 100, 50, 40, '#8aa86a']]) {
      fillPath(ctx, new Path2D(`M${x} ${y} h${w} v${h} h${-w} z`), c, 1.4);
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + h * 0.4); ctx.lineTo(x + w, y + h * 0.4); ctx.stroke();
    }
    fillPath(ctx, ell(ctx, 100, 92, 40, 12), '#3a3a44', 1.4); fillPath(ctx, new Path2D('M60 92 L140 92 L120 60 L80 60 Z'), '#8a8a96', 1.4);
    door();
    fillPath(ctx, ell(ctx, 40, 180, 16, 16), '#2a2a32', 1.2); fillPath(ctx, ell(ctx, 40, 180, 7, 7), '#6a6a74', 0.8);
    for (const [x, y] of [[70, 82], [116, 78]]) { ctx.fillStyle = '#e04a4a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
  } else {
    mound('#5a5a9a');
    fillPath(ctx, new Path2D('M20 192 Q16 100 100 60 Q184 100 180 192 Z'), '#7a78c0', 1.6);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; for (const [x, y, r] of [[60, 120, 10], [140, 110, 8], [50, 160, 7], [150, 160, 12]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, TAU); ctx.fill(); }
    door();
    fillPath(ctx, new Path2D('M100 52 a22 22 0 1 0 14 38 a18 18 0 1 1 -14 -38 Z'), '#ffe9a0', 1.4);
    for (const [x, y, r] of [[30, 60, 5], [170, 70, 4], [150, 30, 3]]) { ctx.fillStyle = '#fff6c0'; ctx.fill(star(x, y, r, r * 0.4, 4)); }
  }
}
export function nestSprite(kind) {
  const key = 'nest_' + kind;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const S = 2, W = 200, H = 200;
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
  const ctx = c.getContext('2d'); ctx.scale(S, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  nestBody(ctx, kind);
  // art spans x 8..192, y 6..196 of the 200 box, so the 1px outline fits; nestOverlay shares these coordinates
  const r = { c: outlineCanvas(c, 2, '#2a1840', 0.85), ax: 100, ay: 192, w: W, h: H };
  spriteCache.set(key, r);
  return r;
}
// the angry glowing eyes in the doorway, blinking, plus cracks as it takes damage (drawn live)
export function nestOverlay(ctx, hpFrac, t) {
  const blink = Math.sin(t * 2.2) > 0.94 ? 0.2 : 1;
  ctx.fillStyle = '#ff3a3a';
  for (const x of [91, 109]) { ctx.beginPath(); ctx.ellipse(x, 168, 4.4, 5.4 * blink, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#fff'; for (const x of [90, 108]) { ctx.beginPath(); ctx.arc(x, 166, 1.2, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#1b1020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(85, 158); ctx.lineTo(97, 163); ctx.moveTo(115, 158); ctx.lineTo(103, 163); ctx.stroke();
  const cracks = hpFrac < 0.75 ? (hpFrac < 0.45 ? (hpFrac < 0.2 ? 3 : 2) : 1) : 0;
  ctx.strokeStyle = 'rgba(30,10,30,.8)'; ctx.lineWidth = 1.6;
  const C = [[[50, 120], [58, 134], [52, 146], [62, 158]], [[150, 110], [142, 126], [150, 140]], [[100, 100], [94, 112], [104, 120], [98, 130]]];
  for (let i = 0; i < cracks; i++) { ctx.beginPath(); C[i].forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
}

// ---------------------------------------------------------------- backdrops
// give a backdrop's canvases back right away (waiting for the garbage collector lets phones run out of canvas memory)
export function freeBackdrop(bd) {
  if (!bd) return;
  for (const k of ['sky', 'far', 'mid', 'gr', 'front', 'rays']) if (bd[k] && bd[k].width) bd[k].width = bd[k].height = 0;
}
export function resetWorldArt() { spriteCache.clear(); }
export function makeBackdrop(theme, seed) {
  const W = 960, H = 540;
  const rnd = mulberry(hash(theme.name) + seed);
  const night = theme.deco === 'star';
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.lineJoin = 'round'; return [c, x]; };

  const [sky, sx] = mk();
  const g = sx.createLinearGradient(0, 0, 0, 430); g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]);
  sx.fillStyle = g; sx.fillRect(0, 0, W, H);
  const sun = sx.createRadialGradient(740, 120, 8, 740, 120, 150);
  sun.addColorStop(0, night ? 'rgba(255,250,220,.9)' : 'rgba(255,255,230,.95)'); sun.addColorStop(0.25, night ? 'rgba(255,240,200,.3)' : 'rgba(255,240,190,.4)'); sun.addColorStop(1, 'rgba(255,255,255,0)');
  sx.fillStyle = sun; sx.fillRect(500, 0, 460, 300);
  sx.fillStyle = night ? '#fff7d6' : '#fffbe6'; sx.beginPath(); sx.arc(740, 120, 38, 0, TAU); sx.fill();
  if (night) { sx.fillStyle = theme.sky[0]; sx.beginPath(); sx.arc(754, 112, 32, 0, TAU); sx.fill(); sx.fillStyle = '#fff7d6'; sx.beginPath(); sx.arc(740, 120, 38, 0, TAU); sx.fill(); sx.fillStyle = 'rgba(40,30,100,.2)'; sx.beginPath(); sx.arc(748, 126, 32, 0, TAU); sx.fill(); }

  const hz = theme.haze || '#ffffff';
  const wrapX = (x, fn) => { fn(x); fn(x - W); fn(x + W); };
  const [far, fx] = mk();
  fx.fillStyle = mix(theme.far, hz, 0.22);
  fx.beginPath(); fx.moveTo(0, H);
  const ph = rnd() * 6, ph2 = rnd() * 6;
  for (let x = 0; x <= W; x += 8) { const a = x / W * TAU; fx.lineTo(x, 320 + Math.sin(a * 2 + ph) * 26 + Math.sin(a * 3 + ph2) * 14); }
  fx.lineTo(W, H); fx.fill();
  fx.fillStyle = mix(mix(theme.far, theme.sky[1], 0.35), hz, 0.12);
  fx.beginPath(); fx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) { const a = x / W * TAU; fx.lineTo(x, 350 + Math.sin(a * 3 + ph2 + 1) * 18 + Math.sin(a * 5 + ph) * 8); }
  fx.lineTo(W, H); fx.fill();

  const [mid, mx] = mk();
  const base = 404;
  const tree = (x, s, c1, c2) => {
    wrapX(x, (xx) => {
      mx.fillStyle = 'rgba(0,0,0,.18)'; mx.beginPath(); mx.ellipse(xx, base + 1, 26 * s, 4.5 * s, 0, 0, TAU); mx.fill();
      mx.fillStyle = '#6a4a3a'; mx.fillRect(xx - 3 * s, base - 30 * s, 6 * s, 30 * s);
      for (const [dx, dy, r, c] of [[-12, -42, 18, c2], [12, -42, 18, c2], [0, -56, 22, c1], [0, -38, 20, c1]]) {
        const cy = base + dy * s, tg = mx.createLinearGradient(0, cy - r * s, 0, cy + r * s);
        tg.addColorStop(0, shade(c, 0.16)); tg.addColorStop(1, shade(c, -0.14));
        mx.fillStyle = tg; mx.beginPath(); mx.arc(xx + dx * s, cy, r * s, 0, TAU); mx.fill();
        // leaf clumps: lighter on top, darker underneath
        for (let k = 0; k < 9; k++) {
          const an = rnd() * TAU, dd = Math.sqrt(rnd()) * r * s * 0.82, lx = xx + dx * s + Math.cos(an) * dd, ly = cy + Math.sin(an) * dd, up = Math.sin(an) < 0;
          mx.globalAlpha = 0.5; mx.fillStyle = up ? shade(c, 0.22) : shade(c, -0.2);
          mx.beginPath(); mx.ellipse(lx, ly, (2.4 + rnd() * 3) * s, (1.8 + rnd() * 2) * s, rnd() * 3, 0, TAU); mx.fill(); mx.globalAlpha = 1;
        }
      }
    });
  };
  const col = mix(theme.mid, hz, 0.1), dark = shade(col, -0.18), light = shade(col, 0.18);
  for (let i = 0; i < 9; i++) {
    const x = (i + rnd() * 0.7) * (W / 9), s = 0.8 + rnd() * 0.6;
    if (theme.deco === 'flower' || theme.deco === 'petal') tree(x, s, theme.deco === 'petal' ? '#ffa6c9' : light, theme.deco === 'petal' ? '#f27aa8' : col);
    else if (theme.deco === 'leaf') {
      wrapX(x, (xx) => { const w = 54 * s, h = (70 + rnd() * 50) * s; mx.fillStyle = i % 2 ? col : dark; mx.fillRect(xx - w / 2, base - h, w, h); mx.fillStyle = 'rgba(255,230,150,.75)'; for (let k = 0; k < 4; k++) mx.fillRect(xx - w / 2 + 8 + (k % 2) * 22, base - h + 12 + Math.floor(k / 2) * 24, 12, 14); });
    } else if (night) {
      wrapX(x, (xx) => { const w = 60 * s, h = (50 + rnd() * 60) * s; mx.fillStyle = i % 2 ? col : dark; mx.fillRect(xx - w / 2, base - h, w, h); mx.fillRect(xx + w * 0.2, base - h - 16, 10, 16); mx.fillStyle = 'rgba(255,225,120,.85)'; for (let k = 0; k < 3; k++) mx.fillRect(xx - w / 2 + 8 + (k % 2) * 24, base - h + 10 + Math.floor(k / 2) * 20, 10, 12); });
    } else if (theme.deco === 'hole') {
      wrapX(x, (xx) => { const w = 60 * s, h = 50 * s; mx.fillStyle = i % 2 ? '#e6b64a' : '#f2cc5e'; mx.beginPath(); mx.moveTo(xx - w / 2, base); mx.lineTo(xx - w / 2 + 10, base - h); mx.lineTo(xx + w / 2, base - h * 0.7); mx.lineTo(xx + w / 2, base); mx.fill(); mx.fillStyle = 'rgba(160,100,20,.55)'; for (const [dx, dy, r] of [[-10, -20, 6], [12, -34, 5], [8, -12, 4]]) { mx.beginPath(); mx.ellipse(xx + dx * s, base + dy * s, r * s, r * s * 0.8, 0, 0, TAU); mx.fill(); } });
    } else {
      wrapX(x, (xx) => { const h = (60 + rnd() * 40) * s, w = 40 * s; mx.fillStyle = '#6a8a7a'; mx.fillRect(xx - 2, base - 12, 4, 12); for (let k = 0; k < 3; k++) { mx.fillStyle = k % 2 ? '#7aa08a' : '#8ab89a'; mx.beginPath(); mx.moveTo(xx - w / 2 + k * 3, base - 10 - k * h * 0.28); mx.lineTo(xx, base - h * (0.5 + k * 0.28)); mx.lineTo(xx + w / 2 - k * 3, base - 10 - k * h * 0.28); mx.fill(); mx.fillStyle = '#fff'; mx.beginPath(); mx.moveTo(xx - 8 + k * 2, base - h * (0.38 + k * 0.28)); mx.lineTo(xx, base - h * (0.5 + k * 0.28)); mx.lineTo(xx + 8 - k * 2, base - h * (0.38 + k * 0.28)); mx.fill(); } });
    }
  }
  if (theme.deco === 'hole') { mx.fillStyle = '#8a5a14'; for (let i = 0; i < 12; i++) { const x = i * 84 + rnd() * 30; mx.beginPath(); mx.moveTo(x, 0); mx.lineTo(x + 26, 0); mx.lineTo(x + 13, 40 + rnd() * 50); mx.fill(); } }

  const [gr, gx] = mk();
  const top = 424;
  const gg = gx.createLinearGradient(0, top, 0, H); gg.addColorStop(0, theme.ground[0]); gg.addColorStop(0.12, theme.ground[1]); gg.addColorStop(0.13, theme.dirt); gg.addColorStop(1, shade(theme.dirt, -0.25));
  gx.fillStyle = gg; gx.beginPath(); gx.moveTo(0, top + 6);
  for (let x = 0; x <= W; x += 6) gx.lineTo(x, top + Math.sin(x / W * TAU * 3) * 3 + 2);
  gx.lineTo(W, H); gx.lineTo(0, H); gx.fill();
  // thin light edge along the top of the strip
  gx.strokeStyle = shade(theme.ground[0], 0.4); gx.globalAlpha = 0.7; gx.lineWidth = 1.5; gx.beginPath();
  for (let x = 0; x <= W; x += 6) { const y = top + Math.sin(x / W * TAU * 3) * 3 + 2; x ? gx.lineTo(x, y) : gx.moveTo(x, y); }
  gx.stroke(); gx.globalAlpha = 1;
  gx.fillStyle = theme.ground[0];
  for (let i = 0; i < 90; i++) { const x = rnd() * W, h = 5 + rnd() * 9; gx.beginPath(); gx.moveTo(x - 2, top + 4); gx.lineTo(x, top - h + 4); gx.lineTo(x + 2, top + 4); gx.fill(); }
  const dec = theme.deco;
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = top + 14 + rnd() * 90;
    if (dec === 'flower') { gx.fillStyle = ['#fff', '#ffd23f', '#ff9ac6'][i % 3]; gx.beginPath(); gx.arc(x, top + 3 + (i % 3), 2.6, 0, TAU); gx.fill(); }
    else if (dec === 'leaf') { gx.fillStyle = ['#d9532b', '#e8a22a', '#b8431f'][i % 3]; gx.beginPath(); gx.ellipse(x, y, 5, 2.6, rnd() * 3, 0, TAU); gx.fill(); }
    else if (dec === 'petal') { gx.fillStyle = 'rgba(255,190,215,.9)'; gx.beginPath(); gx.ellipse(x, y, 4, 2.2, rnd() * 3, 0, TAU); gx.fill(); }
    else if (dec === 'snow') { gx.fillStyle = 'rgba(255,255,255,.8)'; gx.beginPath(); gx.ellipse(x, y, 9, 2.4, 0, 0, TAU); gx.fill(); }
    else { gx.fillStyle = 'rgba(0,0,0,.14)'; gx.beginPath(); gx.ellipse(x, y, 6 + rnd() * 6, 2.6, 0, 0, TAU); gx.fill(); }
  }
  // a few stones or flowers in the mid ground
  const nProps = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < nProps; i++) {
    const x = rnd() * W, y = top + 20 + rnd() * 40, r = 2 + rnd() * 2.5;
    if (dec === 'flower' || dec === 'petal') {
      gx.strokeStyle = shade(theme.ground[1], -0.2); gx.lineWidth = 1; gx.beginPath(); gx.moveTo(x, y + 5); gx.lineTo(x, y); gx.stroke();
      gx.fillStyle = dec === 'petal' ? '#ffd0e2' : ['#fff', '#ffd23f', '#ff9ac6'][i % 3]; gx.beginPath(); gx.arc(x, y, r, 0, TAU); gx.fill();
      gx.fillStyle = '#ffcf3a'; gx.beginPath(); gx.arc(x, y, r * 0.35, 0, TAU); gx.fill();
    } else {
      gx.fillStyle = 'rgba(0,0,0,.2)'; gx.beginPath(); gx.ellipse(x + 1, y + r * 0.7, r * 1.4, r * 0.5, 0, 0, TAU); gx.fill();
      gx.fillStyle = shade(theme.dirt, 0.12 + rnd() * 0.12); gx.beginPath(); gx.ellipse(x, y, r * 1.3, r * 0.9, 0, 0, TAU); gx.fill();
      gx.fillStyle = 'rgba(255,255,255,.3)'; gx.beginPath(); gx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.3, 0, 0, TAU); gx.fill();
    }
  }
  for (let i = 0; i < 40; i++) { gx.fillStyle = 'rgba(255,255,255,.1)'; gx.fillRect(rnd() * W, top + 20 + rnd() * 90, 14 + rnd() * 26, 1.5); }

  // tall foreground tufts (drawn in front of the action) and soft sun rays
  // ground detail: soil grain, pebbles with a lit side, hairline cracks and a few faint paw prints
  texturize(gr, { seed: seed + 3, count: 8000, len: 7, lw: 1.2, dir: 0.05, spread: 0.7, alpha: 0.5, amp: 0.13, minLum: 35 });
  {
    const pc = shade(theme.dirt, -0.32), pl = shade(theme.dirt, 0.3);
    for (let i = 0; i < 80; i++) {
      const y = top + 20 + rnd() * (H - top - 34), x = rnd() * W, r = (1.4 + rnd() * 2.8) * (0.6 + (y - top) / 120);
      gx.fillStyle = 'rgba(30,18,10,.25)'; gx.beginPath(); gx.ellipse(x + 1, y + r * 0.7, r * 1.15, r * 0.5, 0, 0, TAU); gx.fill();
      gx.fillStyle = pc; gx.beginPath(); gx.ellipse(x, y, r, r * 0.72, 0, 0, TAU); gx.fill();
      gx.fillStyle = pl; gx.globalAlpha = 0.7; gx.beginPath(); gx.ellipse(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.28, 0, 0, TAU); gx.fill(); gx.globalAlpha = 1;
    }
    gx.strokeStyle = 'rgba(30,18,10,.22)'; gx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { let x = rnd() * W, y = top + 30 + rnd() * (H - top - 50); gx.beginPath(); gx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += 8 + rnd() * 12; y += (rnd() - 0.5) * 8; gx.lineTo(x, y); } gx.stroke(); }
    gx.fillStyle = 'rgba(30,18,10,.13)';
    for (let i = 0; i < 7; i++) {
      const x = 60 + rnd() * (W - 120), y = top + 36 + rnd() * (H - top - 70), a = -0.5 + rnd() * 1.0;
      gx.save(); gx.translate(x, y); gx.rotate(a);
      gx.beginPath(); gx.ellipse(0, 3, 5.5, 4.6, 0, 0, TAU); gx.fill();
      for (const [tx, ty] of [[-6, -4], [-2.2, -8], [2.2, -8], [6, -4]]) { gx.beginPath(); gx.ellipse(tx, ty, 1.9, 2.4, 0, 0, TAU); gx.fill(); }
      gx.restore();
    }
  }
  const [front, ftx] = mk();
  const tuft = theme.deco === 'snow' ? '#ffffff' : shade(theme.ground[1], -0.12);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W, h = 22 + rnd() * 26, n = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const bx = x + (k - n / 2) * 4, lean = (rnd() - 0.5) * 16;
      ftx.globalAlpha = 0.75; ftx.strokeStyle = shade(k % 2 ? tuft : shade(tuft, 0.14), (rnd() - 0.5) * 0.16); ftx.lineWidth = 3; ftx.lineCap = 'round';
      ftx.beginPath(); ftx.moveTo(bx, H + 2); ftx.quadraticCurveTo(bx + lean * 0.4, H - h * 0.6, bx + lean, H - h); ftx.stroke();
    }
  }
  const [rays, rx] = mk();
  if (!night) for (let i = 0; i < 6; i++) {
    const a0 = 1.7 + i * 0.2 + (rnd() - 0.5) * 0.08, spread = 0.025 + rnd() * 0.075, peak = 0.05 + rnd() * 0.05;
    const L = 520 + rnd() * 120, ca = Math.cos(a0), sa = Math.sin(a0);
    // along the shaft: bright near the sun, gone before the ground
    const gl = rx.createLinearGradient(740, 120, 740 + ca * L, 120 + sa * L);
    gl.addColorStop(0, `rgba(255,255,220,${peak})`); gl.addColorStop(0.6, `rgba(255,255,220,${peak * 0.5})`); gl.addColorStop(1, 'rgba(255,255,220,0)');
    const [sh, shx] = mk();
    shx.fillStyle = gl; shx.beginPath(); shx.moveTo(740, 120);
    shx.lineTo(740 + Math.cos(a0 - spread) * 900, 120 + Math.sin(a0 - spread) * 900); shx.lineTo(740 + Math.cos(a0 + spread) * 900, 120 + Math.sin(a0 + spread) * 900); shx.fill();
    // soft edges: multiply the shaft by a gradient across its width
    const px = -sa, py = ca, mxp = 740 + ca * L * 0.5, myp = 120 + sa * L * 0.5, hw = Math.tan(spread) * L * 0.5 + 1;
    const ge = shx.createLinearGradient(mxp - px * hw, myp - py * hw, mxp + px * hw, myp + py * hw);
    ge.addColorStop(0, 'rgba(0,0,0,0)'); ge.addColorStop(0.35, 'rgba(0,0,0,1)'); ge.addColorStop(0.65, 'rgba(0,0,0,1)'); ge.addColorStop(1, 'rgba(0,0,0,0)');
    shx.globalCompositeOperation = 'destination-in'; shx.fillStyle = ge; shx.fillRect(0, 0, W, H);
    rx.drawImage(sh, 0, 0);
    sh.width = sh.height = 0;                 // temp canvases are freed at once: phones cap total canvas memory
  }
  // fade everything out toward the ground so rays never wash over the characters
  rx.globalCompositeOperation = 'destination-in';
  const rf = rx.createLinearGradient(0, 200, 0, 420); rf.addColorStop(0, 'rgba(0,0,0,1)'); rf.addColorStop(1, 'rgba(0,0,0,0)');
  rx.fillStyle = rf; rx.fillRect(0, 0, W, H); rx.globalCompositeOperation = 'source-over';

  // depth of field and atmospheric haze: the distant layers are softer and drift toward the haze colour
  const soften = (cv, px, haze, hazeA) => {
    const [o, ox] = mk();
    if (typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype && px > 0) ox.filter = `blur(${px}px)`;
    ox.drawImage(cv, 0, 0); ox.filter = 'none';
    ox.globalCompositeOperation = 'source-atop'; ox.globalAlpha = hazeA; ox.fillStyle = haze; ox.fillRect(0, 0, W, H);
    cv.width = cv.height = 0;                 // the sharp source layer is not needed again
    return o;
  };
  texturize(far, { seed: seed + 5, count: 5000, len: 5, lw: 1.2, dir: 0.9, spread: 2.2, alpha: 0.32, amp: 0.06, minLum: 25 });
  texturize(mid, { seed: seed + 6, count: 7000, len: 4.5, lw: 1.2, dir: 0.6, spread: 2.6, alpha: 0.42, amp: 0.1, minLum: 25 });
  const farSoft = soften(far, 2.6, hz, 0.38), midSoft = soften(mid, 0.9, hz, 0.14);

  const stars = []; if (night) for (let i = 0; i < 70; i++) stars.push([rnd() * W, rnd() * 300, 0.6 + rnd() * 1.4, rnd() * 6]);
  const clouds = []; for (let i = 0; i < 5; i++) clouds.push([rnd() * W, 50 + rnd() * 130, 0.6 + rnd() * 0.8, 6 + rnd() * 8]);
  return { sky, far: farSoft, mid: midSoft, gr, front, rays, stars, clouds, night, deco: theme.deco, sun: { x: 740, y: 120 } };
}

export function drawBackdrop(ctx, bd, scroll, t) {
  const W = 960;
  ctx.drawImage(bd.sky, 0, 0);
  if (bd.night) for (const [x, y, r, p] of bd.stars) { ctx.fillStyle = `rgba(255,250,220,${0.45 + 0.45 * Math.sin(t * 2 + p)})`; ctx.fillRect(x, y, r, r); }
  ctx.fillStyle = bd.night ? 'rgba(200,190,255,.28)' : 'rgba(255,255,255,.75)';
  for (const [x, y, s, v] of bd.clouds) {
    const cx = ((x - t * v - scroll * 0.05) % (W + 200) + W + 200) % (W + 200) - 100;
    ctx.beginPath(); ctx.ellipse(cx, y, 46 * s, 14 * s, 0, 0, TAU); ctx.ellipse(cx - 24 * s, y + 4 * s, 28 * s, 11 * s, 0, 0, TAU); ctx.ellipse(cx + 26 * s, y + 5 * s, 30 * s, 11 * s, 0, 0, TAU); ctx.ellipse(cx + 4 * s, y - 9 * s, 24 * s, 12 * s, 0, 0, TAU); ctx.fill();
  }
  for (const [layer, k] of [[bd.far, 0.12], [bd.mid, 0.4], [bd.gr, 1]]) {
    const o = ((scroll * k) % W + W) % W;
    ctx.drawImage(layer, -o, 0); ctx.drawImage(layer, W - o, 0);
  }
}

export function drawRays(ctx, bd, t) {
  if (bd.night) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.11 + 0.05 * Math.sin(t * 0.7);
  ctx.drawImage(bd.rays, 0, 0); ctx.restore();
}
export function drawFront(ctx, bd, scroll) {
  const W = 960, o = ((scroll * 1.35) % W + W) % W;
  ctx.drawImage(bd.front, -o, 0); ctx.drawImage(bd.front, W - o, 0);
}
