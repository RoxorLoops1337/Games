// Procedural anime-style cat sprites: big sparkly eyes, fine tinted outlines, soft cel shading.
// Each cat is drawn once into a 120x120 box (feet at y=107, centre x=60) and cached by main.js.
import { TAU, INK, mix, shade, lineOf, ell, cel, poly, fillPath, star, line, mirror } from './art_util.js';

const BOX = [0, 0, 120, 120];
const COOL = new Set(['shadow', 'ronin', 'nibbles', 'cyber', 'dusty', 'hawkeye', 'hexa', 'draco', 'leo', 'zeus', 'blizzard', 'mecha', 'volcano']);

function rod(ctx, x1, y1, x2, y2, w, color) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = lineOf(color); ctx.lineWidth = w + 1.6;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function dot(ctx, x, y, r, fill, lw = 0.8) { fillPath(ctx, ell(ctx, x, y, r, r), fill, lw); }
function flame(ctx, x, y, s, c1 = '#ff6a2b', c2 = '#ffd23f') {
  const f = (k, col) => {
    const p = new Path2D();
    p.moveTo(x, y);
    p.bezierCurveTo(x - 7 * s * k, y - 6 * s * k, x - 3 * s * k, y - 13 * s * k, x, y - 20 * s * k);
    p.bezierCurveTo(x + 2 * s * k, y - 12 * s * k, x + 8 * s * k, y - 8 * s * k, x, y);
    ctx.fillStyle = col; ctx.fill(p);
  };
  f(1, c1); f(0.6, c2);
}
function bolt(ctx, x, y, s, fill, lw = 0.9) {
  fillPath(ctx, poly(ctx, [[x + 3 * s, y - 9 * s], [x - 4 * s, y + 1 * s], [x, y + 1 * s], [x - 3 * s, y + 9 * s], [x + 5 * s, y - 2 * s], [x + 1 * s, y - 2 * s]]), fill, lw);
}
const sparkle = (ctx, x, y, r, col = '#fff') => { ctx.fillStyle = col; ctx.fill(star(x, y, r, r * 0.3, 4)); };

// ---------------------------------------------------------------- face
function eye(ctx, x, y, color, cool, flip, variant) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  if (variant === 'happy') {
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6.2, 2.4); ctx.quadraticCurveTo(0, -6.4, 6.2, 2.4); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-6.2, 2.4); ctx.lineTo(-8.6, 0.6); ctx.stroke();
    ctx.restore();
    return;
  }
  if (variant === 'blink' || variant === 'hurt') {
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (variant === 'blink') { ctx.moveTo(-6.4, -0.5); ctx.quadraticCurveTo(0, 5.4, 6.4, -0.5); }
    else { ctx.moveTo(-6, -5); ctx.lineTo(4, 0); ctx.lineTo(-6, 5); }
    ctx.stroke();
    if (variant === 'blink') { ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-6.4, -0.5); ctx.lineTo(-9, -2.6); ctx.stroke(); }
    ctx.restore();
    return;
  }
  const ry = cool ? 6.6 : 8.4, rx = cool ? 6.6 : 6.4;
  const g = ctx.createLinearGradient(0, -ry, 0, ry);
  g.addColorStop(0, shade(color, -0.55)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, 0.45));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1b1426';
  ctx.beginPath(); ctx.ellipse(0, 0.6, cool ? 1.7 : 2.9, ry * 0.62, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = shade(color, -0.45); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.ellipse(0, 0, rx - 0.5, ry - 0.5, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-2, -ry * 0.38, cool ? 1.7 : 2.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(2.3, ry * 0.4, 1.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(3.2, -ry * 0.1, 0.7, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  // upper lid and lash flick
  ctx.strokeStyle = INK; ctx.lineWidth = 1.9; ctx.lineCap = 'round';
  ctx.beginPath();
  if (cool) { ctx.moveTo(-rx - 1, -2.2); ctx.quadraticCurveTo(0, -ry - 2.4, rx + 1.5, -ry * 0.4); }
  else { ctx.moveTo(-rx - 1, -1.5); ctx.quadraticCurveTo(0, -ry - 4.4, rx + 1, -1.6); }
  ctx.stroke();
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(-rx - 1, cool ? -2.2 : -1.5); ctx.lineTo(-rx - 3.4, cool ? -4.4 : -3.6); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,20,60,.45)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(0, 0, ry - 0.4, 0.35, Math.PI - 0.35); ctx.stroke();
  ctx.restore();
}

function face(ctx, A, id, variant) {
  const cool = COOL.has(id);
  eye(ctx, 46, 59, A.eye, cool, false, variant);
  eye(ctx, 74, 59, A.eye, cool, true, variant);
  // blush
  ctx.fillStyle = 'rgba(255,110,140,.38)';
  ctx.beginPath(); ctx.ellipse(38, 69, 5.2, 3, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(82, 69, 5.2, 3, 0, 0, TAU); ctx.fill();
  // nose and mouth
  fillPath(ctx, poly(ctx, [[57.4, 65.6], [62.6, 65.6], [60, 68.4]]), '#ff8fa8', 0.7);
  ctx.strokeStyle = INK; ctx.lineWidth = 0.95; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(60, 68.4); ctx.lineTo(60, 70.2); ctx.stroke();
  ctx.beginPath();
  if (variant === 'hurt') { ctx.ellipse(60, 72.6, 2.6, 3.2, 0, 0, TAU); ctx.fillStyle = '#5a2236'; ctx.fill(); }
  else if (variant === 'happy') { ctx.moveTo(53, 70.6); ctx.quadraticCurveTo(60, 82, 67, 70.6); ctx.closePath(); ctx.fillStyle = '#5a2236'; ctx.fill(); ctx.fillStyle = '#ff8fa8'; ctx.beginPath(); ctx.ellipse(60, 75.4, 3.4, 2, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(53, 70.6); ctx.quadraticCurveTo(60, 82, 67, 70.6); ctx.closePath(); ctx.stroke(); }
  else if (cool) { ctx.moveTo(54, 71.4); ctx.quadraticCurveTo(57, 73.4, 60, 70.4); ctx.quadraticCurveTo(64, 74.2, 67.6, 71); }
  else { ctx.moveTo(53.6, 71); ctx.quadraticCurveTo(57, 74.6, 60, 70.4); ctx.quadraticCurveTo(63, 74.6, 66.4, 71); }
  ctx.stroke();
  // whisker pad dots
  ctx.fillStyle = 'rgba(60,35,80,.45)';
  for (const [x, y] of [[52, 72.4], [54.4, 74.2], [50.6, 74.6], [68, 72.4], [65.6, 74.2], [69.4, 74.6]]) { ctx.beginPath(); ctx.arc(x, y, 0.5, 0, TAU); ctx.fill(); }
  // whiskers: dark strand with a pale highlight strand beside it
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.45;
  for (const [dy, ex] of [[-3, -17], [0, -19], [3, -16]]) {
    ctx.beginPath(); ctx.moveTo(32, 69.5 + dy); ctx.quadraticCurveTo(24, 69.5 + dy * 1.6, 32 + ex, 69.5 + dy * 2.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(88, 69.5 + dy); ctx.quadraticCurveTo(96, 69.5 + dy * 1.6, 88 - ex, 69.5 + dy * 2.4); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(50,30,70,.5)'; ctx.lineWidth = 0.7;
  for (const [dy, ex] of [[-3, -17], [0, -19], [3, -16]]) {
    ctx.beginPath(); ctx.moveTo(32, 70 + dy); ctx.quadraticCurveTo(24, 70 + dy * 1.6, 32 + ex, 70 + dy * 2.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(88, 70 + dy); ctx.quadraticCurveTo(96, 70 + dy * 1.6, 88 - ex, 70 + dy * 2.4); ctx.stroke();
  }
}

// ---------------------------------------------------------------- fur patterns
function pattern(ctx, A, headPath, bodyPath) {
  const dk = shade(A.fur, -0.3);
  ctx.save();
  ctx.lineCap = 'round';
  if (A.pat === 'stripes') {
    ctx.save(); ctx.clip(headPath);
    ctx.strokeStyle = dk; ctx.lineWidth = 2.4;
    for (const [x, d] of [[60, 0], [52, -0.25], [68, 0.25]]) { ctx.beginPath(); ctx.moveTo(60 + (x - 60) * 1.2, 29); ctx.quadraticCurveTo(x + d * 8, 36, x + d * 4, 43); ctx.stroke(); }
    ctx.lineWidth = 2;
    for (const y of [60, 67]) { ctx.beginPath(); ctx.moveTo(27, y); ctx.lineTo(36, y + 1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(93, y); ctx.lineTo(84, y + 1); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.clip(bodyPath); ctx.lineWidth = 2.4; ctx.strokeStyle = dk;
    for (const x of [44, 52, 68, 76]) { ctx.beginPath(); ctx.moveTo(x, 78); ctx.quadraticCurveTo(x + (x < 60 ? -3 : 3), 86, x + (x < 60 ? -2 : 2), 94); ctx.stroke(); }
    ctx.restore();
  } else if (A.pat === 'spots') {
    ctx.save(); ctx.clip(headPath); ctx.fillStyle = dk;
    for (const [x, y, r] of [[40, 40, 3.4], [78, 38, 2.8], [90, 56, 3.2], [31, 55, 2.6]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.clip(bodyPath); ctx.fillStyle = dk;
    for (const [x, y, r] of [[42, 88, 3.4], [78, 92, 3], [66, 82, 2.4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.restore();
  } else if (A.pat === 'bolt') {
    bolt(ctx, 60, 38, 1.1, A.accent, 0.7);
  } else if (A.pat === 'patch') {
    ctx.save(); ctx.clip(headPath); ctx.fillStyle = A.accent; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.ellipse(76, 50, 14, 15, 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(36, 36, 9, 9, 0, 0, TAU); ctx.fill();
    ctx.restore();
  } else if (A.pat === 'tux') {
    ctx.save(); ctx.clip(headPath); ctx.fillStyle = '#3b3548';
    ctx.beginPath(); ctx.moveTo(20, 20); ctx.lineTo(100, 20); ctx.lineTo(100, 48); ctx.quadraticCurveTo(60, 38, 20, 48); ctx.fill();
    ctx.restore();
  } else if (A.pat === 'stars') {
    ctx.save(); ctx.clip(headPath); ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const [x, y, r] of [[36, 38, 2], [84, 40, 2.4], [92, 62, 1.6], [28, 62, 1.8], [70, 34, 1.5]]) ctx.fill(star(x, y, r, r * 0.4, 4));
    ctx.restore();
    ctx.save(); ctx.clip(bodyPath); ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (const [x, y, r] of [[45, 88, 2.2], [76, 92, 2], [62, 84, 1.5]]) ctx.fill(star(x, y, r, r * 0.4, 4));
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- accessories
// back(ctx,A) draws behind everything, front(ctx,A) draws over the finished cat.
const hat = {
  cowboy(ctx, c, band) {
    ctx.save();
    fillPath(ctx, new Path2D('M30 30 Q60 38 90 30 Q96 24 86 24 Q80 26 76 24 L74 12 Q60 8 46 12 L44 24 Q40 26 34 24 Q24 24 30 30 Z'), c, 1);
    ctx.fillStyle = band; ctx.fillRect(45, 22, 30, 3.5);
    ctx.restore();
  },
};
const ACC = {
  tabby: {
    front(ctx, A) {
      // red scarf with a little bell and a bandage on the nose
      fillPath(ctx, new Path2D('M40 80 Q60 90 80 80 L82 86 Q60 96 38 86 Z'), A.accent, 1);
      fillPath(ctx, new Path2D('M74 86 L84 102 L76 100 L72 92 Z'), shade(A.accent, -0.15), 0.9);
      dot(ctx, 60, 91, 2.6, '#ffd23f', 0.7);
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(66, 66, 8, 3); ctx.strokeStyle = lineOf('#eee'); ctx.lineWidth = 0.5; ctx.strokeRect(66, 66, 8, 3);
    },
  },
  ember: {
    front(ctx) {
      flame(ctx, 60, 33, 1.0); flame(ctx, 47, 34, 0.7); flame(ctx, 73, 34, 0.7);
      flame(ctx, 100, 66, 0.9);
    },
  },
  sparky: {
    front(ctx, A) {
      // goggles pushed up and electric cheek fluff
      ctx.fillStyle = '#4a5a78'; ctx.fillRect(38, 33, 44, 5);
      dot(ctx, 48, 35.5, 5.5, '#bfe6ff', 0.9); dot(ctx, 72, 35.5, 5.5, '#bfe6ff', 0.9);
      sparkle(ctx, 46, 34, 2, '#fff'); sparkle(ctx, 70, 34, 2, '#fff');
      ctx.strokeStyle = A.accent; ctx.lineWidth = 1.4;
      line(ctx, [[22, 70], [27, 67], [25, 73], [31, 71]], '#4aa8ff', 1.3);
      line(ctx, [[98, 70], [93, 67], [95, 73], [89, 71]], '#4aa8ff', 1.3);
    },
  },
  buckshot: {
    back() {},
    front(ctx, A) {
      fillPath(ctx, new Path2D('M42 82 Q60 92 78 82 L72 92 L60 98 L48 92 Z'), A.accent, 0.9);
      hat.cowboy(ctx, '#7a4a2a', '#2f1c10');
      rod(ctx, 30, 99, 94, 88, 4.2, '#4b3a30'); rod(ctx, 30, 99, 62, 94, 5, '#8a5a34');
      dot(ctx, 48, 99, 5, A.fur, 0.9); dot(ctx, 70, 96, 5, A.fur, 0.9);
    },
  },
  mochi: {
    body: { chubby: 1.22 },
    front(ctx, A) {
      // pink bow, sleepy-happy look, rice flour dusting
      fillPath(ctx, new Path2D('M60 30 L48 22 Q44 30 48 36 Z M60 30 L72 22 Q76 30 72 36 Z'), A.accent, 1);
      dot(ctx, 60, 30, 3.2, shade(A.accent, -0.15), 0.8);
      sparkle(ctx, 88, 40, 3, '#ffdce8'); sparkle(ctx, 30, 82, 2.4, '#ffdce8');
    },
  },
  yuki: {
    front(ctx, A) {
      // knit hat with pompom, snowball in paws
      fillPath(ctx, new Path2D('M30 36 Q32 12 60 10 Q88 12 90 36 Q60 28 30 36 Z'), '#5bb8ff', 1);
      fillPath(ctx, new Path2D('M28 34 Q60 25 92 34 L92 40 Q60 31 28 40 Z'), '#ffffff', 1);
      for (const x of [42, 56, 70, 82]) line(ctx, [[x, 12], [x + 2, 28]], 'rgba(255,255,255,.55)', 1.3);
      dot(ctx, 60, 8, 5, '#ffffff', 0.9);
      fillPath(ctx, star(86, 44, 4.5, 1.8, 6), '#bfeaff', 0.6);
      dot(ctx, 60, 98, 8, '#ffffff', 0.9);
    },
  },
  hawkeye: {
    front(ctx, A) {
      fillPath(ctx, new Path2D('M31 38 Q60 6 89 38 Q60 26 31 38 Z'), A.accent, 1);       // cap
      fillPath(ctx, ell(ctx, 74, 59, 11, 11), 'rgba(255,230,120,.28)', 1.8, '#ffd23f');   // scope lens
      line(ctx, [[63, 59], [85, 59]], 'rgba(255,230,120,.8)', 0.6); line(ctx, [[74, 48], [74, 70]], 'rgba(255,230,120,.8)', 0.6);
      rod(ctx, 26, 100, 98, 86, 3.6, '#39475a'); rod(ctx, 26, 100, 52, 95, 5.4, '#5a3d2a');
      dot(ctx, 50, 99, 5, A.fur, 0.9);
    },
  },
  boomer: {
    back(ctx) { dot(ctx, 94, 92, 11, '#2c2a3a', 1); line(ctx, [[94, 82], [98, 74], [104, 74]], '#caa86a', 1.4); sparkle(ctx, 105, 73, 3.2, '#ffcc33'); },
    front(ctx, A) {
      fillPath(ctx, new Path2D('M29 40 Q60 2 91 40 Q60 28 29 40 Z'), '#8a6a4a', 1);
      dot(ctx, 44, 33, 6, '#9fd8ff', 1.1); dot(ctx, 76, 33, 6, '#9fd8ff', 1.1); ctx.fillStyle = '#5a4030'; ctx.fillRect(48, 31.5, 24, 3);
      dot(ctx, 60, 98, 10, '#3b3b4f', 1); line(ctx, [[60, 89], [64, 83]], '#caa86a', 1.3); sparkle(ctx, 66, 81, 3.4, '#ff8f3d');
    },
  },
  biscuit: {
    back(ctx) {
      // a rolling pin held behind her back
      line(ctx, [[96, 104], [104, 84]], '#b98a52', 3.6); dot(ctx, 96, 105, 3.2, '#8a6236', 0.8); dot(ctx, 104, 83, 3.2, '#8a6236', 0.8);
    },
    front(ctx, A) {
      // a soft baker's cap and a dusting of flour on one cheek
      fillPath(ctx, new Path2D('M38 36 Q34 14 52 14 Q60 4 70 14 Q86 14 82 36 Q60 28 38 36 Z'), '#fffaf0', 1);
      line(ctx, [[44, 30], [76, 30]], 'rgba(200,185,160,.7)', 0.8);
      for (const [x, y] of [[44, 70], [48, 73], [42, 75]]) dot(ctx, x, y, 1.6, 'rgba(255,255,255,.85)', 0);
      // a little loaf on the belly
      fillPath(ctx, ell(ctx, 60, 98, 11, 6.5), '#d9954a', 1); line(ctx, [[54, 96], [57, 100]], '#f2c88a', 0.9); line(ctx, [[60, 95], [63, 99]], '#f2c88a', 0.9);
    },
  },
  pearl: {
    back(ctx) {
      // a little fin-shaped tail ribbon behind her
      fillPath(ctx, new Path2D('M92 108 q12 -4 16 -16 q-2 14 -16 24 Z'), '#ff9ad0', 0.8);
    },
    front(ctx, A) {
      // a shell crown on her head, a pearl necklace and a few floating bubbles
      fillPath(ctx, new Path2D('M42 36 Q60 -2 78 36 Q60 27 42 36 Z'), '#ff9ad0', 1.4);
      line(ctx, [[60, 8], [60, 30]], '#d8609e', 1.2); line(ctx, [[51, 13], [52, 31]], '#d8609e', 1); line(ctx, [[69, 13], [68, 31]], '#d8609e', 1);
      dot(ctx, 60, 8, 3.4, '#ffffff', 1);
      for (let i = 0; i < 5; i++) dot(ctx, 46 + i * 7, 92 + Math.sin(i * 0.8) * 3 + 2, 2.6, '#ffffff', 0.7);
      for (const [x, y, r] of [[92, 56, 4], [98, 44, 3], [88, 40, 2.4]]) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
    },
  },
  pudding: {
    front(ctx, A) {
      fillPath(ctx, new Path2D('M36 36 L40 16 Q60 10 80 16 L84 36 Q60 28 36 36 Z'), '#ffffff', 1);
      ctx.fillStyle = '#ff4f6d'; ctx.fillRect(57, 17, 6, 14); ctx.fillRect(53, 21, 14, 6);
      fillPath(ctx, new Path2D('M85 70 q-5 -6 -9 -1 q-3 5 9 11 q12 -6 9 -11 q-4 -5 -9 1 Z'), '#ff6b9a', 0.7);
      rod(ctx, 88, 102, 98, 84, 2.4, '#ffd9e6'); fillPath(ctx, new Path2D('M98 78 q-4 -5 -7 -1 q-2 4 7 9 q9 -5 7 -9 q-3 -4 -7 1 Z'), '#ff6b9a', 0.8);
    },
  },
  shadow: {
    front(ctx, A) {
      // headband with metal plate, face mask, flowing scarf tails
      ctx.fillStyle = '#d4324b'; ctx.beginPath(); ctx.moveTo(29, 42); ctx.quadraticCurveTo(60, 30, 91, 42); ctx.lineTo(91, 48); ctx.quadraticCurveTo(60, 37, 29, 48); ctx.fill(); ctx.strokeStyle = lineOf('#d4324b'); ctx.lineWidth = 0.9; ctx.stroke();
      fillPath(ctx, new Path2D('M53 36 h14 v9 h-14 z'), '#c9d1e0', 0.9); line(ctx, [[57, 38], [63, 43]], '#7a8296', 1);
      fillPath(ctx, new Path2D('M92 44 L108 38 L103 46 L110 50 L94 50 Z'), '#d4324b', 0.9);
      fillPath(ctx, new Path2D('M36 70 Q60 86 84 70 Q84 80 60 86 Q36 80 36 70 Z'), '#1c1a28', 1);
      fillPath(ctx, star(94, 100, 8, 3, 4), '#cfd6e6', 0.9);
    },
  },
  ronin: {
    back(ctx) { rod(ctx, 92, 30, 74, 96, 3.2, '#e8e8f0'); rod(ctx, 91, 24, 87, 36, 4.8, '#2b2b3a'); },
    front(ctx, A) {
      fillPath(ctx, new Path2D('M20 42 Q60 -2 100 42 Q60 34 20 42 Z'), '#d9b46a', 1);
      for (const x of [34, 46, 60, 74, 86]) line(ctx, [[60, 12], [x, 40]], 'rgba(120,80,30,.4)', 0.8);
      fillPath(ctx, new Path2D('M38 86 Q60 96 82 86 L82 93 Q60 103 38 93 Z'), A.accent, 0.9);
    },
  },
  merlin: {
    front(ctx, A) {
      fillPath(ctx, new Path2D('M28 38 Q56 32 92 38 Q82 28 70 -2 Q62 18 52 22 Q36 26 28 38 Z'), '#5b3fd0', 1);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(30, 35, 60, 4);
      ctx.fill(star(62, 22, 4, 1.6, 5)); ctx.fill(star(72, 12, 2.6, 1, 5));
      fillPath(ctx, new Path2D('M42 80 Q60 110 78 80 Q60 88 42 80 Z'), '#ffffff', 0.9);   // beard
      rod(ctx, 96, 108, 96, 54, 3, '#6a4a2a'); dot(ctx, 96, 50, 6, '#d9b8ff', 1); sparkle(ctx, 96, 50, 4, '#fff');
    },
  },
  cutlass: {
    front(ctx, A) {
      fillPath(ctx, new Path2D('M26 36 Q40 10 60 12 Q80 10 94 36 Q60 26 26 36 Z'), '#2c2a3a', 1);
      fillPath(ctx, new Path2D('M26 36 Q60 26 94 36 L94 40 Q60 31 26 40 Z'), '#d9b14a', 0.8);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(60, 25, 3.2, 0, TAU); ctx.fill(); ctx.fillRect(58, 27, 4, 3);
      fillPath(ctx, ell(ctx, 46, 59, 8.5, 9.5), '#22202c', 1); line(ctx, [[30, 44], [60, 36], [76, 30]], '#22202c', 1);
      fillPath(ctx, new Path2D('M38 86 Q60 96 82 86 L82 93 Q60 103 38 93 Z'), A.accent, 0.9);
    },
  },
  sprout: {
    front(ctx, A) {
      fillPath(ctx, new Path2D('M60 32 Q44 26 40 12 Q58 12 60 32 Z'), '#7fd957', 1);
      fillPath(ctx, new Path2D('M60 32 Q76 26 80 12 Q62 12 60 32 Z'), '#5fbf3f', 1);
      line(ctx, [[60, 32], [60, 20]], '#3f8f3f', 0.9);
      dot(ctx, 36, 42, 4.2, '#ffb3d1', 0.8); dot(ctx, 36, 42, 1.4, '#ffd23f', 0.5);
      fillPath(ctx, new Path2D('M42 82 Q60 92 78 82 L74 90 L60 96 L46 90 Z'), '#7fd957', 0.9);
    },
  },
  gizmo: {
    front(ctx, A) {
      fillPath(ctx, new Path2D('M34 38 Q60 10 86 38 Q60 30 34 38 Z'), '#ffcc33', 1);
      ctx.fillStyle = '#e6a800'; ctx.fillRect(56, 14, 8, 20);
      dot(ctx, 48, 40, 5, '#9fd8ff', 1); dot(ctx, 72, 40, 5, '#9fd8ff', 1); ctx.fillStyle = '#4a6a8a'; ctx.fillRect(48, 38.6, 24, 2.6);
      rod(ctx, 90, 104, 100, 80, 3.4, '#9aa6b8'); fillPath(ctx, ell(ctx, 101, 77, 5, 5), '#9aa6b8', 1); dot(ctx, 101, 77, 1.8, '#ffffff00', 0.1);
      fillPath(ctx, star(30, 96, 7, 5, 8), '#b0b8c8', 0.9); dot(ctx, 30, 96, 2, '#6c7688', 0.6);
    },
  },
  lyra: {
    front(ctx, A) {
      fillPath(ctx, new Path2D('M30 38 Q60 8 90 38 Q60 30 30 38 Z'), '#8a4bd0', 1);
      fillPath(ctx, new Path2D('M82 30 Q100 14 106 4 Q96 22 88 36 Z'), '#ffe27a', 0.9);
      for (const [x, c] of [[40, '#ff9ac6'], [52, '#ffd23f'], [68, '#9fe0ff'], [80, '#ff9ac6']]) dot(ctx, x, 34, 2.6, c, 0.6);
      fillPath(ctx, ell(ctx, 80, 98, 11, 9, -0.5), '#c9824a', 1); rod(ctx, 86, 92, 100, 78, 2.6, '#8a5a34');
      dot(ctx, 79, 98, 2.6, '#3b2414', 0.5);
      sparkle(ctx, 24, 40, 3, '#ffe27a');
    },
  },
  nibbles: {
    back(ctx, A) { fillPath(ctx, new Path2D('M24 74 Q60 64 96 74 L108 108 Q60 98 12 108 Z'), '#7a1230', 1); fillPath(ctx, new Path2D('M30 76 Q60 68 90 76 L98 104 Q60 96 22 104 Z'), '#c01c3a', 0.5); },
    front(ctx, A) {
      fillPath(ctx, new Path2D('M36 78 L44 90 L54 80 Z'), '#7a1230', 0.9); fillPath(ctx, new Path2D('M84 78 L76 90 L66 80 Z'), '#7a1230', 0.9);
      fillPath(ctx, new Path2D('M54.5 72 L56.5 78 L58.5 72 Z'), '#fff', 0.5); fillPath(ctx, new Path2D('M61.5 72 L63.5 78 L65.5 72 Z'), '#fff', 0.5);
      ctx.fillStyle = '#2b1838'; ctx.beginPath(); ctx.moveTo(58, 33); ctx.lineTo(60, 44); ctx.lineTo(62, 33); ctx.fill();
    },
  },
  zeus: {
    back(ctx) { for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.95 + i * 0.5; fillPath(ctx, ell(ctx, 60 + Math.cos(a) * 34, 56 + Math.sin(a) * 30, 12, 10), '#f4f8ff', 0.9); } },
    front(ctx, A) {
      for (let i = 0; i < 7; i++) { const a = -2.7 + i * 0.5; dot(ctx, 60 + Math.cos(a) * 28, 34 + Math.sin(a) * 6 + 4, 2.6, '#7fbf5a', 0.6); }
      bolt(ctx, 96, 94, 2.4, '#ffe14d', 1.1);
      sparkle(ctx, 28, 36, 3, '#ffe14d');
    },
  },
  volcano: {
    body: { chubby: 1.1 },
    front(ctx, A) {
      fillPath(ctx, poly(ctx, [[36, 34], [30, 14], [46, 28]]), '#3a2420', 1); fillPath(ctx, poly(ctx, [[84, 34], [90, 14], [74, 28]]), '#3a2420', 1);
      ctx.strokeStyle = '#ff7a1f'; ctx.lineWidth = 1.5;
      for (const pts of [[[44, 40], [48, 46], [45, 52]], [[78, 38], [74, 46], [79, 53]], [[50, 92], [56, 98], [52, 104]], [[72, 90], [68, 97], [74, 103]]]) line(ctx, pts, '#ff9f1f', 1.5);
      flame(ctx, 100, 66, 0.8, '#ff5a1f', '#ffd23f');
    },
  },
  blizzard: {
    back(ctx) { fillPath(ctx, new Path2D('M26 76 Q60 66 94 76 L104 108 Q60 98 16 108 Z'), '#78c8ff', 1); fillPath(ctx, new Path2D('M26 76 Q60 66 94 76 L96 84 Q60 74 24 84 Z'), '#ffffff', 0.8); },
    front(ctx, A) {
      for (const [x, h] of [[44, 16], [52, 22], [60, 26], [68, 22], [76, 16]]) fillPath(ctx, poly(ctx, [[x - 4, 34], [x, 34 - h], [x + 4, 34]]), '#bfeaff', 0.9);
      line(ctx, [[40, 34], [80, 34]], '#78c8ff', 1.4);
      rod(ctx, 98, 108, 98, 62, 2.6, '#cfe8ff'); fillPath(ctx, star(98, 58, 8, 3, 6), '#e8f8ff', 0.9);
    },
  },
  dusty: {
    back(ctx) { fillPath(ctx, new Path2D('M26 76 L94 76 L100 106 L20 106 Z'), '#b0703a', 1); for (const x of [32, 44, 56, 68, 80, 92]) line(ctx, [[x, 78], [x - 2, 104]], '#7a4a2a', 0.8); },
    front(ctx, A) {
      hat.cowboy(ctx, '#c9a066', '#7a4a2a');
      fillPath(ctx, star(40, 92, 6, 2.6, 5), '#ffd23f', 0.8);
      rod(ctx, 80, 100, 98, 90, 4.4, '#6c7688'); rod(ctx, 76, 102, 82, 98, 5.6, '#5a3d2a');
    },
  },
  cyber: {
    front(ctx, A) {
      fillPath(ctx, new Path2D('M30 52 Q60 44 90 52 L90 66 Q60 58 30 66 Z'), 'rgba(255,59,212,.55)', 1.4, '#ff3bd4');
      line(ctx, [[36, 56], [84, 56]], 'rgba(255,255,255,.7)', 0.7);
      fillPath(ctx, poly(ctx, [[34, 38], [32, 18], [46, 30]]), '#aeb8c8', 1); fillPath(ctx, poly(ctx, [[86, 38], [88, 18], [74, 30]]), '#aeb8c8', 1);
      dot(ctx, 33, 24, 1.6, '#ff3bd4', 0.3); dot(ctx, 87, 24, 1.6, '#ff3bd4', 0.3);
      dot(ctx, 60, 90, 4, '#ff3bd4', 0.9); line(ctx, [[48, 88], [72, 88]], '#2a8a88', 1);
      rod(ctx, 80, 100, 102, 92, 5, '#3a4a5a'); dot(ctx, 104, 91.5, 2.4, '#ff3bd4', 0.5);
    },
  },
  boo: {
    body: { ghost: true },
    front(ctx) {
      sparkle(ctx, 24, 40, 3, '#b9f5ff'); sparkle(ctx, 98, 34, 2.4, '#fff'); sparkle(ctx, 92, 96, 2.8, '#b9f5ff');
    },
  },
  draco: {
    body: { chubby: 1.12 },
    back(ctx, A) {
      fillPath(ctx, new Path2D('M30 84 Q6 70 8 48 Q22 56 28 68 Q20 50 30 38 Q36 58 40 74 Z'), '#a82f3f', 1);
      fillPath(ctx, new Path2D('M90 84 Q114 70 112 48 Q98 56 92 68 Q100 50 90 38 Q84 58 80 74 Z'), '#a82f3f', 1);
    },
    front(ctx, A) {
      fillPath(ctx, new Path2D('M38 34 Q30 12 40 4 Q44 22 50 30 Z'), '#ffcc33', 1); fillPath(ctx, new Path2D('M82 34 Q90 12 80 4 Q76 22 70 30 Z'), '#ffcc33', 1);
      for (const x of [52, 60, 68]) fillPath(ctx, poly(ctx, [[x - 3, 33], [x, 26], [x + 3, 33]]), '#ffcc33', 0.7);
      ctx.fillStyle = 'rgba(255,217,160,.9)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(60, 84 + i * 6, 11, 2.8, 0, 0, Math.PI); ctx.fill(); }
      flame(ctx, 102, 66, 0.9);
    },
  },
  halo: {
    back(ctx) {
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(60, 84); ctx.scale(s, 1);
        fillPath(ctx, new Path2D('M16 4 Q50 -34 56 -4 Q46 -10 40 -4 Q44 6 34 6 Q36 14 22 14 Z'), '#ffffff', 1);
        ctx.restore();
      }
    },
    front(ctx) {
      ctx.strokeStyle = '#ffd966'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.ellipse(60, 15, 15, 5, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,246,176,.7)'; ctx.lineWidth = 1; ctx.stroke();
      rod(ctx, 92, 108, 94, 56, 2.6, '#ffe9a0'); sparkle(ctx, 94, 52, 6, '#fff6b0');
    },
  },
  mecha: {
    body: { chubby: 1.15 },
    front(ctx, A) {
      fillPath(ctx, new Path2D('M28 40 Q60 8 92 40 L92 34 Q60 2 28 34 Z'), '#7a869a', 1);
      fillPath(ctx, new Path2D('M34 32 Q60 14 86 32 L86 38 Q60 22 34 38 Z'), '#c9d2e0', 0.8);
      line(ctx, [[60, 20], [60, 6]], '#7a869a', 1.6); dot(ctx, 60, 5, 2.6, '#ff3a3a', 0.7);
      for (const s of [-1, 1]) { fillPath(ctx, new Path2D(`M${60 + s * 38} 72 h${s * 14} v16 h${-s * 14} z`), '#aab4c4', 1); dot(ctx, 60 + s * 45, 80, 3, '#ff5d3a', 0.7); }
      for (const [x, y] of [[46, 88], [74, 88], [60, 100]]) dot(ctx, x, y, 1.4, '#6c7688', 0.4);
      line(ctx, [[40, 94], [80, 94]], 'rgba(60,70,90,.55)', 0.8);
    },
  },
  hexa: {
    back(ctx) { fillPath(ctx, new Path2D('M28 76 Q60 66 92 76 L102 108 Q60 98 18 108 Z'), '#3a2057', 1); },
    front(ctx, A) {
      fillPath(ctx, new Path2D('M24 38 Q60 30 96 38 Q90 32 76 28 Q68 8 62 -4 Q56 14 46 26 Q32 30 24 38 Z'), '#4a2a70', 1);
      ctx.fillStyle = '#9bff6b'; ctx.fillRect(40, 30, 38, 4); ctx.fillStyle = '#ffd23f'; ctx.fillRect(56, 29, 8, 6);
      rod(ctx, 98, 108, 94, 54, 2.8, '#6a4a2a'); dot(ctx, 94, 50, 5, '#9bff6b', 0.9); sparkle(ctx, 94, 50, 3.4, '#fff');
    },
  },
  nori: {
    front(ctx, A) {
      fillPath(ctx, new Path2D('M36 36 L38 18 Q30 10 40 4 Q50 -2 60 4 Q70 -2 80 4 Q90 10 82 18 L84 36 Q60 28 36 36 Z'), '#ffffff', 1);
      line(ctx, [[40, 30], [80, 30]], 'rgba(60,40,70,.35)', 1);
      fillPath(ctx, new Path2D('M42 84 Q60 94 78 84 L82 108 L38 108 Z'), '#ffffff', 1);
      fillPath(ctx, ell(ctx, 92, 94, 9, 7), '#fff6ee', 1); fillPath(ctx, ell(ctx, 92, 92.4, 7, 3.8), '#ff8f8f', 0.7);
      ctx.fillStyle = '#2b3a2a'; ctx.fillRect(86, 94.4, 12, 3.4);
    },
  },
  leo: {
    body: { chubby: 1.18 },
    back(ctx, A) {
      fillPath(ctx, new Path2D('M24 76 Q60 62 96 76 L106 108 Q60 98 14 108 Z'), '#a8341c', 1);
      for (let i = 0; i < 12; i++) { const a = -Math.PI + (i / 11) * Math.PI * 1.25 - 0.1; fillPath(ctx, ell(ctx, 60 + Math.cos(a) * 33, 58 + Math.sin(a) * 30, 12, 9, a), A.accent, 1); }
    },
    front(ctx) {
      fillPath(ctx, new Path2D('M38 32 L38 16 L48 24 L60 10 L72 24 L82 16 L82 32 Q60 26 38 32 Z'), '#ffd23f', 1);
      for (const [x, y, c] of [[48, 26, '#ff4a5a'], [60, 21, '#6ad0ff'], [72, 26, '#ff4a5a']]) dot(ctx, x, y, 2.2, c, 0.5);
      fillPath(ctx, new Path2D('M36 84 Q60 94 84 84 L84 92 Q60 102 36 92 Z'), '#f4f0e8', 0.9);
    },
  },
  nebula: {
    back(ctx) {
      fillPath(ctx, new Path2D('M26 76 Q60 64 94 76 L106 108 Q60 96 14 108 Z'), '#2a2260', 1);
      ctx.save(); ctx.clip(new Path2D('M26 76 Q60 64 94 76 L106 108 Q60 96 14 108 Z'));
      const g = ctx.createLinearGradient(14, 80, 106, 108); g.addColorStop(0, 'rgba(255,155,240,.55)'); g.addColorStop(1, 'rgba(90,200,255,.45)'); ctx.fillStyle = g; ctx.fillRect(10, 70, 100, 40); ctx.restore();
    },
    front(ctx, A) {
      fillPath(ctx, new Path2D('M34 36 Q44 10 70 12 Q56 18 56 30 Q66 34 80 30 Q70 40 34 36 Z'), '#ffe14d', 1);
      sparkle(ctx, 24, 36, 4, '#ffe14d'); sparkle(ctx, 98, 30, 3, '#ff9bf0'); sparkle(ctx, 100, 90, 3.6, '#9fe0ff'); sparkle(ctx, 20, 86, 2.6, '#ffe14d');
    },
  },
};

// ---------------------------------------------------------------- main
export function drawCat(ctx, d, variant = 'open') {
  const A = d.art, id = d.id, acc = ACC[id] || {}, B = acc.body || {};
  const fur = A.fur, belly = A.belly;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (B.ghost) ctx.globalAlpha = 0.93;

  acc.back && acc.back(ctx, A);

  // mane behind the head for the lion
  if (A.pat === 'mane') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      fillPath(ctx, ell(ctx, 60 + Math.cos(a) * 28, 56 + Math.sin(a) * 25, 11, 9, a), A.accent, 1);
    }
  }

  // tail: tapered from a thick root to a slim tip, with a lighter tip and breed bands
  const tailFur = id === 'boo' ? null : fur;
  if (tailFur) {
    const P = [[76, 102], [102, 106], [112, 88], [102, 64]], L = [], R = [], N = 14;
    const at = (u) => { const m = 1 - u; return [0, 1].map((k) => m * m * m * P[0][k] + 3 * m * m * u * P[1][k] + 3 * m * u * u * P[2][k] + u * u * u * P[3][k]); };
    for (let i = 0; i <= N; i++) {
      const u = i / N, c = at(u), c2 = at(Math.min(1, u + 0.02)), c1 = at(Math.max(0, u - 0.02));
      const dx = c2[0] - c1[0], dy = c2[1] - c1[1], l = Math.hypot(dx, dy) || 1, w = 6.2 - 1.7 * u + Math.sin(u * 3.1) * 0.5 + (u > 0.93 ? -(u - 0.93) * 18 : 0);
      L.push([c[0] - (dy / l) * w, c[1] + (dx / l) * w]); R.push([c[0] + (dy / l) * w, c[1] - (dx / l) * w]);
    }
    const tp = poly(ctx, [...L, ...R.reverse()]);
    cel(ctx, tp, fur, { shade: false, lw: 1.1 });
    ctx.save(); ctx.clip(tp);
    const dk = shade(fur, -0.3);
    ctx.strokeStyle = shade(fur, -0.14); ctx.lineWidth = 1; ctx.globalAlpha = 0.12;
    ctx.beginPath(); for (let i = 1; i < N; i++) { const c = at(i / N); ctx.moveTo(c[0] + 2.6, c[1] - 2); ctx.lineTo(c[0] + 4.4, c[1] + 0.6); } ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = shade(fur, 0.28); ctx.lineWidth = 1.4; ctx.globalAlpha = 0.2;
    ctx.beginPath(); for (let i = 0; i <= N; i++) { const c = at(i / N); i ? ctx.lineTo(c[0] - 2.4 + i * 0.12, c[1] - 1) : ctx.moveTo(c[0] - 2.4, c[1] - 1); } ctx.stroke();
    ctx.globalAlpha = 1;
    if (A.pat === 'stripes') {
      ctx.strokeStyle = dk; ctx.lineWidth = 2.4;
      for (const u of [0.3, 0.48, 0.66, 0.84]) { const c = at(u), c2 = at(u + 0.02); const dx = c2[0] - c[0], dy = c2[1] - c[1], l = Math.hypot(dx, dy); ctx.beginPath(); ctx.moveTo(c[0] - (dy / l) * 8, c[1] + (dx / l) * 8); ctx.lineTo(c[0] + (dy / l) * 8, c[1] - (dx / l) * 8); ctx.stroke(); }
    } else if (A.pat === 'spots') {
      ctx.fillStyle = dk; for (const u of [0.35, 0.6]) { const c = at(u); ctx.beginPath(); ctx.arc(c[0] + 1, c[1], 2.2, 0, TAU); ctx.fill(); }
    } else if (A.pat === 'patch') {
      ctx.fillStyle = A.accent; ctx.globalAlpha = 0.85; const c = at(0.5); ctx.beginPath(); ctx.ellipse(c[0], c[1], 6, 6, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = A.pat === 'stripes' ? dk : belly;
    ctx.beginPath(); for (let i = 11; i <= N; i++) { const c = at(i / N); ctx.moveTo(c[0] + 7, c[1]); ctx.arc(c[0], c[1], 7, 0, TAU); } ctx.fill();
    ctx.restore();
    ctx.strokeStyle = lineOf(fur); ctx.lineWidth = 1.1; ctx.stroke(tp);
  }

  // body
  const bs = B.chubby || 1;
  let bodyPath;
  if (B.ghost) {
    bodyPath = new Path2D('M38 86 Q36 72 60 70 Q84 72 82 86 L84 106 Q78 100 72 108 Q66 100 60 108 Q54 100 48 108 Q42 100 36 106 Z');
  } else {
    const ry = 17 * bs, rx = 21 * bs;
    bodyPath = ell(ctx, 60, 107 - ry, rx, ry);
  }
  cel(ctx, bodyPath, fur, { box: B.ghost ? [34, 70, 86, 108] : [38, 72, 82, 107] });
  if (!B.ghost) {
    ctx.save(); ctx.clip(bodyPath);
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(60, 100, 12 * bs, 14 * bs, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = lineOf(fur); ctx.lineWidth = 1.1; ctx.stroke(bodyPath);
    // feet
    for (const x of [46, 74]) cel(ctx, ell(ctx, x, 105.4, 8.5, 4.6), fur, { shade: false });
  }
  // front paws: toe bumps, toe lines and a small pad
  for (const x of [49, 71]) {
    const paw = ell(ctx, x, 97, 5.8, 6.4);
    cel(ctx, paw, fur, { shade: false, box: [x - 6, 91, x + 6, 103] });
    ctx.strokeStyle = lineOf(fur); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x - 1.9, 98.8); ctx.lineTo(x - 1.9, 102.2); ctx.moveTo(x + 1.9, 98.8); ctx.lineTo(x + 1.9, 102.2); ctx.stroke();
    for (const dx of [-3.8, 0, 3.8]) { ctx.fillStyle = shade(fur, 0.12); ctx.beginPath(); ctx.arc(x + dx, 102.2, 1.9, 0, Math.PI); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,150,170,.35)'; ctx.beginPath(); ctx.ellipse(x, 94.6, 1.7, 1.1, 0, 0, TAU); ctx.fill();
  }
  // chest fluff
  if (!B.ghost) {
    ctx.strokeStyle = shade(belly, -0.1); ctx.lineWidth = 0.8; ctx.globalAlpha = 0.35;
    for (const [dx, dy] of [[-4, 0], [0, 1.5], [4, 0]]) { ctx.beginPath(); ctx.moveTo(60 + dx - 1.2, 86 + dy); ctx.lineTo(60 + dx, 90 + dy); ctx.lineTo(60 + dx + 1.2, 86 + dy); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  // ears
  const earOuter = new Path2D('M31 52 Q24 22 35 14 Q48 20 57 31 Z');
  const earInner = new Path2D('M34 46 Q30 27 36 20 Q45 25 51 32 Z');
  const earTx = (fn) => { fn(); mirror(ctx, 120, fn); };
  earTx(() => { cel(ctx, earOuter, fur, { shade: false }); ctx.fillStyle = A.pat === 'tux' ? '#3b3548' : '#ffb3c8'; ctx.fill(earInner);
    ctx.save(); ctx.clip(earInner); ctx.fillStyle = A.pat === 'tux' ? '#2a2536' : '#e88aa8'; ctx.beginPath(); ctx.ellipse(40, 44, 9, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(fur, 0.55); ctx.lineWidth = 0.8; ctx.globalAlpha = 0.45;
    for (const [x, y, ex, ey] of [[48, 33, 42, 30], [47, 38, 40, 35], [44, 43, 38, 40]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = lineOf(fur); ctx.lineWidth = 0.7; ctx.stroke(earInner);
    ctx.strokeStyle = shade(fur, -0.22); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(34.6, 15.6); ctx.lineTo(35.4, 19.6); ctx.stroke(); });

  // head
  const head = new Path2D('M60 27 C81 27 94 40 94 57 C94 71 81 81 60 81 C39 81 26 71 26 57 C26 40 39 27 60 27 Z');
  cel(ctx, head, fur, { box: [26, 27, 94, 81] });
  // cheek tufts
  for (const s of [-1, 1]) {
    const x = 60 + s * 34;
    const tuft = new Path2D(`M${x} 62 L${x + s * 6} 68 L${x + s * 1} 70 L${x + s * 5} 76 L${x - s * 4} 74 Z`);
    cel(ctx, tuft, fur, { shade: false, lw: 0.9 });
  }
  // muzzle
  ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(60, 71, 11, 7.5, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.clip(head);
  // soft cheek shade under the eyes, brighter forehead, and short fur strokes
  for (const s of [-1, 1]) { ctx.fillStyle = 'rgba(80,40,110,.12)'; ctx.beginPath(); ctx.ellipse(60 + s * 28, 76, 9, 5.5, s * 0.5, 0, TAU); ctx.fill(); }
  ctx.lineWidth = 0.8; ctx.lineCap = 'round';
  // a few tiny cheek-edge strokes that follow the face outline
  for (const [x, y, dx, dy] of [[31, 64, 3, 1], [30, 69, 3.4, 0.4], [89, 64, -3, 1], [90, 69, -3.4, 0.4]]) { ctx.strokeStyle = shade(fur, -0.2); ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.restore();
  pattern(ctx, A, head, bodyPath);
  ctx.strokeStyle = lineOf(fur); ctx.lineWidth = 1.15; ctx.stroke(head);

  face(ctx, A, id, variant);
  acc.front && acc.front(ctx, A);
  ctx.globalAlpha = 1;
}
