// GRAFTWORK hero art. drawHero: FEET at (x,y), facing RIGHT. o: { scale, t, hurt 0..1, attack -1..1, dying 0..1 }
// drawPortrait(ctx, heroId, cx, cy, size): a bust (head and shoulders) centred at (cx,cy), fitted in a size x size circle.
import { K } from './enemies.js';
import { keyLamp } from './backgrounds.js';
import { lnw } from './linework.js';
const { C, INK, poly, line, limb, ell, circ, rect, seam, staple, bandage, wrap, glow, flame, eye, dots, mouthStitch, thread, coin, stage, prepA, text0 } = K;
const TAU = Math.PI * 2;

const HERO_SIZE = { marrow: [110, 180], wick: [100, 160], odile: [100, 185] };
const SKIN = { marrow: '#d9b89a', wick: '#f0cfae', odile: '#ead4bc' };

// wet specular: a small white glint that slides with the key lamp swing
function spec(ctx, x, y, r, A, k = 1) { const sw = A.L ? A.L.swing * 10 : 0; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ell(ctx, x + sw, y, r * 1.5, r * 0.8, C('#fff', 1, 0.7 * k), 0, -0.6); circ(ctx, x + sw + r, y + r * 0.8, r * 0.4, C('#fff', 1, 0.9 * k), 0); ctx.restore(); }
function head(ctx, x, y, rx, ry, skin, tilt = 0) {
  ell(ctx, x, y, rx, ry, C(skin), 2.8, tilt);
  ell(ctx, x - rx * 0.3, y - ry * 0.35, rx * 0.3, ry * 0.18, C('#fff', 1, 0.2), 0);
}
function ear(ctx, x, y, skin) { ell(ctx, x, y, 4, 6, C(skin, 0.92), 2); }
// the gloved/bare hand
function hand(ctx, x, y, r, skin) { circ(ctx, x, y, r, C(skin), 2.4); }

function marrow(ctx, A) {
  const t = A.t, b = A.b, sk = SKIN.marrow, sway = Math.sin(t * 1.5) * 1.5 - A.mv * 7, att = A.att;
  // trousers and boots
  rect(ctx, -20, -64, 16, 62, C('#2a2630'), 3, 2.6); rect(ctx, 3, -64, 16, 62, C('#2a2630'), 3, 2.6);
  poly(ctx, [-27, -9, -4, -9, 0, 0, -29, 0], C('#16110f'), 2.6); poly(ctx, [3, -9, 26, -9, 32, 0, 3, 0], C('#16110f'), 2.6);
  ctx.save(); ctx.translate(sway * 0.4, 0);
  // long coat with swaying hem
  ctx.beginPath(); ctx.moveTo(-30, -136 + b); ctx.lineTo(30, -136 + b); ctx.lineTo(38, -60); ctx.lineTo(42 + sway, -26);
  for (let i = 0; i < 5; i++) ctx.lineTo(42 + sway * (1 + (i + 1) * 0.35) - (i + 0.5) * 17, i % 2 ? -26 : -20 + Math.sin(t * 2 + i - A.mv * 2) * 2);
  ctx.lineTo(-42 + sway, -26); ctx.lineTo(-38, -60); ctx.closePath(); ctx.fillStyle = C('#2c2832'); ctx.fill(); ctx.lineWidth = lnw(3); ctx.strokeStyle = C(INK); ctx.stroke();
  line(ctx, [-30, -134 + b, -36, -60, -40, -28], C('#4a4452', 1, 0.8), 2);
  // apron over the coat
  poly(ctx, [-20, -124 + b, 20, -124 + b, 26, -34, -26, -34], C('#e8dcc4'), 2.8);
  poly(ctx, [-20, -124 + b, -8, -134 + b, 8, -134 + b, 20, -124 + b, 12, -124 + b, 0, -128 + b, -12, -124 + b], C('#d6c7a6'), 2.2);
  line(ctx, [-18, -122 + b, -30, -134 + b], C('#d6c7a6'), 2.4); line(ctx, [18, -122 + b, 30, -134 + b], C('#d6c7a6'), 2.4);
  line(ctx, [-26, -76, -34, -80, -30, -66], C('#d6c7a6'), 3); // tie
  // blood
  const bl = C('#9e0f2e'), bl2 = C('#6e0a20');
  poly(ctx, [-16, -100, -4, -108, 8, -98, 14, -84, 4, -72, -10, -76, -18, -88], bl, 0);
  poly(ctx, [6, -60, 20, -64, 24, -48, 14, -38, 4, -46], bl, 0); poly(ctx, [-22, -56, -12, -60, -8, -46, -20, -42], bl2, 0);
  for (const [x, y, l] of [[-4, -74, 14], [10, -84, 20], [16, -48, 10], [-14, -46, 12]]) { const dl = l + Math.sin(t * 1.3 + x) * 2; line(ctx, [x, y, x, y + dl], bl, 2.6); circ(ctx, x, y + dl, 2.4, bl, 0); }
  line(ctx, [-20, -110, -12, -112, -6, -106], bl2, 2);
  // pockets and tools
  rect(ctx, -18, -66, 14, 14, C('#d6c7a6'), 2, 2); line(ctx, [-14, -66, -14, -76], C('#cfd4d6'), 2.4); line(ctx, [-9, -66, -8, -74], C('#cfd4d6'), 2.4);
  seam(ctx, [0, -126 + b, 2, -90, 0, -36], 8, 3.4, C('#8a7a5a'));
  // back arm (rolled sleeve) holding a rag
  limb(ctx, [-26, -126 + b, -42, -102, -38, -80], C('#2c2832'), 11);
  rect(ctx, -46, -92, 16, 9, C('#4a4452'), 3, 2.2);
  limb(ctx, [-38, -86, -38, -72], C(sk), 8); hand(ctx, -38, -68, 6, sk); seam(ctx, [-40, -86, -36, -78], 5, 3);
  ctx.restore();
  // head
  ear(ctx, -14, -148 + b, sk); ear(ctx, 13, -148 + b, sk);
  rect(ctx, -6, -144 + b, 12, 12, C(sk, 0.9), 2, 2.2);
  head(ctx, 0, -152 + b, 15, 18, sk);
  poly(ctx, [-15, -160 + b, -10, -172 + b, 6, -173 + b, 15, -162 + b, 10, -165 + b, -2, -168 + b, -12, -162 + b], C('#2a1f1a'), 2.4);
  for (let i = 0; i < 9; i++) circ(ctx, -8 + (i % 3) * 7 + (i > 5 ? 1.5 : 0), -138 + b + Math.floor(i / 3) * 3 - (i % 2), 0.8, C('#3a2a22'), 0); // stubble
  // round glasses
  for (const gx of [-6, 7]) { circ(ctx, gx, -152 + b, 6.4, C('#cfe8e4', 1, 0.3), 2.2); ctx.strokeStyle = C('#a58c4a'); ctx.lineWidth = lnw(1.4); ctx.beginPath(); ctx.arc(gx, -152 + b, 6.4, 0, TAU); ctx.stroke(); eye(ctx, gx + 1, -152 + b, 3, 0.8, 0, A.blink); }
  spec(ctx, -9, -155 + b, 1.8, A); spec(ctx, 4, -155 + b, 1.8, A, 0.8);
  line(ctx, [0, -152 + b, 1, -152 + b], C('#a58c4a'), 1.6); line(ctx, [-12, -153 + b, -14, -152 + b], C('#a58c4a'), 1.4);
  line(ctx, [-12, -160 + b, -2, -162 + b], C(INK), 2); line(ctx, [2, -162 + b, 13, -160 + b], C(INK), 2);
  line(ctx, [2, -150 + b, 6, -144 + b, 2, -143 + b], C(sk, 0.7), 1.6);
  mouthStitch(ctx, 2, -139 + b, 12, 2.6, '#6e0a20', 4);
  // saw arm: shoulder -> elbow -> hand, saw along the forearm
  const sx = 26, sy = -124 + b, a = -0.3 + att * 1.15, a1 = a * 0.55 + 0.7;
  const ex = sx + Math.cos(a1) * 25, ey = sy + Math.sin(a1) * 25, hx = ex + Math.cos(a) * 25, hy = ey + Math.sin(a) * 25;
  limb(ctx, [sx, sy, ex, ey], C('#2c2832'), 11); rect(ctx, ex - 7, ey - 5, 14, 11, C('#4a4452'), 3, 2.2);
  limb(ctx, [ex, ey, hx, hy], C(sk), 8); seam(ctx, [ex + 3, ey + 2, hx - 2, hy - 2], 5, 3, C('#7a3a3a'));
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
  poly(ctx, [-4, -9, 12, -9, 12, 9, -4, 9], C('#6a4a2a'), 2.6); circ(ctx, 4, 0, 1.8, C('#c9ced0'), 1);
  const tx = [12, -5, 14, -7, 22, -5, 26, -7, 34, -5, 38, -7, 46, -5, 50, -7, 58, -5, 62, -7, 74, -3, 76, 5];
  const pts = []; for (let i = 0; i < 20; i += 1) { const x = 14 + i * 3.1; pts.push(x, 5 + (i % 2 ? 0 : 3.4)); }
  ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(74, -3); ctx.lineTo(78, 5); for (let i = pts.length - 2; i >= 0; i -= 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.lineTo(12, 5); ctx.closePath(); ctx.fillStyle = C('#e8e4d6'); ctx.fill(); ctx.lineWidth = lnw(2.4); ctx.strokeStyle = C(INK); ctx.lineJoin = 'round'; ctx.stroke();
  line(ctx, [16, -2, 70, -1], C('#fff', 1, 0.7), 1.6); poly(ctx, [40, 0, 52, 1, 50, 5, 38, 4], C('#9e0f2e'), 0);
  circ(ctx, 28, 0, 1.6, C('#9a9a98'), 1); circ(ctx, 52, -1, 1.6, C('#9a9a98'), 1);
  ctx.restore();
  // bone saw sweep: crescent trail around the elbow
  if (att > 0.08) { for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(ex, ey, 52 + k * 8, a - 1.1 * att + k * 0.08, a + 0.15); ctx.strokeStyle = C('#f3ecd8', 1, 0.34 * att * (1 - k * 0.22)); ctx.lineWidth = lnw(9 - k * 2); ctx.lineCap = 'round'; ctx.stroke(); } }
  hand(ctx, hx, hy, 6.5, sk);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(a); spec(ctx, 20 + (A.L ? A.L.swing * 60 : 0), -2, 2.2, A); ctx.restore();
  stitchGlow(ctx, A, 0, -96 + b);
}

function wick(ctx, A) {
  const t = A.t, b = A.b, sk = SKIN.wick, att = A.att, sway = Math.sin(t * 1.9) * 1.5 - A.mv * 6;
  // boots too big, patched trousers
  rect(ctx, -17, -46, 14, 44, C('#5a4636'), 3, 2.6); rect(ctx, 3, -46, 14, 44, C('#5a4636'), 3, 2.6); bandage(ctx, -10, -30, 14, 9, 0.2, '#b79a6a');
  poly(ctx, [-24, -9, -3, -9, 2, 0, -26, 0], C('#2b2622'), 2.6); poly(ctx, [3, -9, 24, -9, 30, 0, 2, 0], C('#2b2622'), 2.6);
  ctx.save(); ctx.translate(sway * 0.4, 0);
  // shirt and wax-stained apron
  poly(ctx, [-24, -92 + b, 24, -92 + b, 24, -44, -24, -44], C('#cdb48a'), 3);
  poly(ctx, [-18, -88 + b, 18, -88 + b, 24, -38, -24, -38], C('#e8dcc4'), 2.8);
  line(ctx, [-16, -86 + b, -22, -94 + b], C('#d6c7a6'), 2.4); line(ctx, [16, -86 + b, 22, -94 + b], C('#d6c7a6'), 2.4);
  const wx = C('#f4e6b0');
  for (const [x, y, r] of [[-10, -70, 7], [8, -56, 6], [-2, -84, 4], [14, -76, 5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = wx; ctx.fill(); line(ctx, [x, y, x + 1, y + r * 2.4 + Math.sin(t + x) * 2], wx, 3); circ(ctx, x + 1, y + r * 2.4 + 2, 2, wx, 0); }
  rect(ctx, -14, -56, 28, 12, C('#d6c7a6'), 2, 2); line(ctx, [-8, -56, -8, -46], C(INK, 1, 0.4), 1.2); line(ctx, [8, -56, 8, -46], C(INK, 1, 0.4), 1.2);
  line(ctx, [-6, -56, -6, -66], C('#e8dcc4'), 2.4); line(ctx, [-1, -56, 1, -68], C('#c9ced0'), 2.4); // snuffer & wick scissors in pocket
  seam(ctx, [0, -88 + b, 0, -42], 8, 3.2, C('#a58c4a'));
  // scarf
  poly(ctx, [-18, -92 + b, 18, -92 + b, 17, -100 + b, -17, -100 + b], C('#b3263a'), 2.6);
  poly(ctx, [-10, -92 + b, -4, -92 + b, -8 + Math.sin(t * 2) * 3, -62, -16 + Math.sin(t * 2) * 3, -64], C('#b3263a'), 2.4); line(ctx, [-12, -72, -6, -74], C('#e0b848'), 2);
  // left arm holding an oily rag
  limb(ctx, [-20, -90 + b, -34, -72, -30, -52], C('#cdb48a'), 8); rect(ctx, -34, -78, 10, 8, C('#a58c6a'), 2, 2); hand(ctx, -30, -48, 5.4, sk);
  poly(ctx, [-34, -46, -26, -46, -24, -32, -36, -34], C('#8a7a5a'), 2);
  ctx.restore();
  // big head, flame hair
  const hy = -118 + b;
  ear(ctx, -17, hy + 2, sk); ear(ctx, 17, hy + 2, sk);
  head(ctx, 0, hy, 18, 20, sk);
  glow(ctx, 0, hy - 28, 56, '#ff8a2b', 0.4);
  ctx.save(); ctx.translate(0, hy - 10); ctx.rotate(-A.mv * 0.35 + Math.sin(t * 5.3) * 0.04); ctx.translate(0, -(hy - 10));
  for (const [fx, fy, s, sd] of [[-12, -4, 1.5, 0], [10, -2, 1.7, 2], [0, -12, 2.4, 1], [-3, 0, 1.1, 4]]) flame(ctx, fx, hy - 14 + fy * 0.4, s, t, sd);
  ctx.restore();
  circ(ctx, -10, hy - 6, 4, C('#e8944a'), 0); // singed hairline
  // face
  for (const [x, y] of [[-8, 6], [-4, 8], [8, 6], [11, 7]]) circ(ctx, x, hy + y - 2, 0.9, C('#b87a52'), 0);
  eye(ctx, -6, hy - 1, 5, 0.8, 0, A.blink); eye(ctx, 8, hy - 1, 5, 0.8, 0, A.blink);
  line(ctx, [-12, hy - 9, -2, hy - 8], C(INK), 1.8); line(ctx, [4, hy - 8, 14, hy - 9], C(INK), 1.8);
  circ(ctx, -11, hy + 5, 3.2, C('#f4a0a8', 1, 0.6), 0); circ(ctx, 14, hy + 5, 3.2, C('#f4a0a8', 1, 0.6), 0);
  mouthStitch(ctx, 2, hy + 10, 10, 3.2, '#6e0a20', 3);
  bandage(ctx, -9, hy - 12, 11, 5, -0.5);
  // candle arm: raised, thrusts forward on attack
  const sx = 20, sy = -88 + b, a = -1.15 + att * 0.9 + Math.sin(t * 2.2) * 0.04;
  const ex = sx + Math.cos(a + 0.5) * 20, ey = sy + Math.sin(a + 0.5) * 20, hx = ex + Math.cos(a) * 18, hy2 = ey + Math.sin(a) * 18;
  limb(ctx, [sx, sy, ex, ey, hx, hy2], C('#cdb48a'), 8); rect(ctx, ex - 5, ey - 4, 10, 9, C('#a58c6a'), 2, 2);
  { const th = a + Math.PI / 2 - 0.1 + (att > 0 ? -0.3 * att : 0), tx = hx + 39 * Math.sin(th), ty = hy2 - 39 * Math.cos(th);
    if (att > 0.1) for (let k = 1; k < 6; k++) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; flame(ctx, tx - k * 15 * att, ty + k * 2, Math.max(0.3, 1.5 - k * 0.22), t - k * 0.05, k); ctx.restore(); }
    glow(ctx, tx - 20 * Math.max(0, att), ty, 30 + 20 * Math.max(0, att), '#ffb347', 0.35 * (0.7 + 0.3 * Math.sin(t * 17))); }
  ctx.save(); ctx.translate(hx, hy2); ctx.rotate(a + Math.PI / 2 - 0.1 + (att > 0 ? -0.3 * att : 0));
  rect(ctx, -6, -34, 12, 38, C('#f1e8c8'), 3, 2.8); line(ctx, [-3, -30, -3, -14], C('#fff', 1, 0.6), 1.8);
  for (const [x, l] of [[3, 12], [-4, 8]]) { line(ctx, [x, -33, x, -33 + l + Math.sin(t * 1.5 + x) * 2], wx, 3); }
  line(ctx, [0, -34, 0, -39], C(INK), 2.4);
  glow(ctx, 0, -50, 36, '#ffb347', 0.6); ctx.save(); ctx.translate(0, -39); ctx.rotate(-A.mv * 0.5 + Math.sin(t * 9) * 0.05); ctx.translate(0, 39); flame(ctx, 0, -39, 1.3 * (0.92 + 0.08 * Math.sin(t * 13)), t, 5, true); ctx.restore();
  ctx.restore();
  hand(ctx, hx, hy2, 5.6, sk);
  stitchGlow(ctx, A, 0, -70 + b);
  for (let i = 0; i < 3; i++) { const f = (t * 0.7 + i * 0.33) % 1; circ(ctx, hx + Math.sin(i * 4 + t * 2) * 12, hy2 - 50 - f * 40, 1.6, C('#ffc247', 1, 1 - f), 0); }
}

function odile(ctx, A) {
  const t = A.t, b = A.b, sk = SKIN.odile, att = A.att, sway = Math.sin(t * 1.4) * 1.4 - A.mv * 7;
  const coat = '#5a2446', trim = '#d9b440';
  // legs and elegant shoes
  rect(ctx, -14, -70, 11, 68, C('#1c1620'), 3, 2.4); rect(ctx, 3, -70, 11, 68, C('#1c1620'), 3, 2.4);
  poly(ctx, [-20, -8, -3, -8, 2, 0, -22, 0], C('#0c0a10'), 2.4); poly(ctx, [3, -8, 20, -8, 28, 0, 3, 0], C('#0c0a10'), 2.4); circ(ctx, 22, -4, 1.4, C(trim), 0);
  ctx.save(); ctx.translate(sway * 0.4, 0);
  // coat tails with sway
  poly(ctx, [-22, -52, 22, -52, 36 + sway, -8, 20, -22 + Math.sin(t * 2) * 2, 0, -12, -20, -22 + Math.sin(t * 2 + 1) * 2, -36 + sway, -8], C(coat), 3);
  line(ctx, [-36 + sway, -9, -20, -22, 0, -12, 20, -22, 36 + sway, -9], C(trim), 2.4);
  // torso and waistcoat
  poly(ctx, [-24, -132 + b, 24, -132 + b, 22, -52, -22, -52], C(coat), 3);
  poly(ctx, [-12, -128 + b, 12, -128 + b, 12, -62, 0, -54, -12, -62], C('#e0c26a'), 2.4);
  for (let i = 0; i < 4; i++) circ(ctx, 0, -118 + i * 15 + b * 0.3, 2.2, C('#7a5a1a'), 1.2);
  poly(ctx, [-24, -132 + b, -12, -128 + b, -4, -100, -14, -72, -22, -52], C(coat, 0.8), 2.4); poly(ctx, [24, -132 + b, 12, -128 + b, 4, -100, 14, -72, 22, -52], C(coat, 0.8), 2.4);
  line(ctx, [-22, -52, 22, -52], C(trim), 3); line(ctx, [-24, -130 + b, -13, -128 + b], C(trim), 2.4);
  // watch chain
  ctx.beginPath(); ctx.moveTo(-8, -100); ctx.quadraticCurveTo(0, -86 + Math.sin(t * 2) * 1, 10, -98); ctx.strokeStyle = C(trim); ctx.lineWidth = lnw(1.8); ctx.stroke();
  // cravat, high collar
  poly(ctx, [-12, -134 + b, 12, -134 + b, 8, -118 + b, 0, -108 + b, -8, -118 + b], C('#f3ecd8'), 2.2); circ(ctx, 0, -120 + b, 3.2, C('#b3263a'), 1.6);
  poly(ctx, [-24, -132 + b, -14, -146 + b, -8, -134 + b], C(coat, 0.7), 2.4); poly(ctx, [24, -132 + b, 14, -146 + b, 8, -134 + b], C(coat, 0.7), 2.4);
  seam(ctx, [-18, -92, -20, -64], 8, 3.4, C(trim)); staple(ctx, 18, -88, 0.3, 0.9);
  // satchel of keys on the near hip
  ctx.save(); ctx.translate(-22, -62); ctx.rotate(Math.sin(t * 1.4) * 0.04);
  line(ctx, [-4, -34, 6, 6], C('#5a3a20'), 3.4);
  rect(ctx, -12, -4, 26, 24, C('#7a5030'), 5, 2.6); poly(ctx, [-12, -4, 14, -4, 14, 6, 0, 10, -12, 6], C('#5a3a20'), 2.2); circ(ctx, 1, 8, 2.4, C(trim), 1.2);
  for (let i = 0; i < 3; i++) { const sw2 = Math.sin(t * 3 + i * 1.4 + att * 2) * 3 + Math.sin(t * 11 + i * 2.1) * 0.8 * Math.abs(A.mv * 6 + att) - A.mv * 6; line(ctx, [-6 + i * 6, 18, -8 + i * 6 + sw2, 28], C(trim), 1.4); ctx.save(); ctx.translate(-8 + i * 6 + sw2, 29); ctx.rotate(sw2 * 0.05); circ(ctx, 0, 0, 2.6, null, 1.6); ctx.strokeStyle = C(trim); ctx.lineWidth = lnw(1.5); ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.stroke(); line(ctx, [0, 2.4, 0, 9], C(trim), 1.8); line(ctx, [0, 7, 3, 7], C(trim), 1.6); ctx.restore(); }
  ctx.restore();
  // back arm with rings, hand at the lapel
  limb(ctx, [-22, -126 + b, -34, -104, -24, -88], C(coat), 9); rect(ctx, -29, -96, 11, 7, C('#f3ecd8'), 2, 1.8);
  hand(ctx, -22, -84, 5, sk); for (const dx of [-3, 0, 3]) circ(ctx, -22 + dx, -88, 1.7, C(trim), 0.8);
  ctx.restore();
  // head: elegant updo and monocle
  const hy = -154 + b;
  rect(ctx, -5, hy + 10, 10, 10, C(sk, 0.92), 2, 2);
  ear(ctx, -13, hy + 2, sk);
  head(ctx, 0, hy, 14, 17, sk);
  ctx.beginPath(); ctx.arc(0, hy - 3, 15.5, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(10, hy - 6); ctx.lineTo(-10, hy - 8); ctx.closePath(); fs0(ctx, C('#c9a227'));
  circ(ctx, -2, hy - 22, 8, C('#c9a227'), 2.4); line(ctx, [-8, hy - 22, 4, hy - 22], C('#a8821a'), 1.2); // bun
  poly(ctx, [-12, hy - 13, 10, hy - 17, 14, hy - 12, -10, hy - 12], C('#2a1a20'), 2); circ(ctx, 12, hy - 16, 2.6, C('#b3263a'), 1.2); // hatband
  eye(ctx, -5, hy + 1, 3.6, 0.8, 0, A.blink, '#4a6a3a'); eye(ctx, 7, hy + 1, 3.4, 0.8, 0, A.blink, '#4a6a3a');
  line(ctx, [-10, hy - 5, -1, hy - 5], C('#7a5a1a'), 1.8); line(ctx, [3, hy - 6, 12, hy - 5], C('#7a5a1a'), 1.8);
  // monocle on the leading eye with chain
  ctx.beginPath(); ctx.arc(7, hy + 1, 6.4, 0, TAU); ctx.fillStyle = C('#fff', 1, 0.18); ctx.fill(); ctx.strokeStyle = C(trim); ctx.lineWidth = lnw(1.8); ctx.stroke(); spec(ctx, 5, hy - 1, 1.8, A); ctx.beginPath(); ctx.moveTo(8, hy + 7); ctx.quadraticCurveTo(12, hy + 22, 6, hy + 30); ctx.strokeStyle = C(trim); ctx.lineWidth = lnw(1.2); ctx.stroke();
  line(ctx, [2, hy + 6, 4, hy + 10], C(sk, 0.7), 1.4);
  mouthStitch(ctx, 3, hy + 11, 9, 1.4, '#7a1f2e', 3);
  circ(ctx, -10, hy + 8, 2.4, C('#f4a0a8', 1, 0.5), 0);
  // cane arm: planted cane that thrusts on attack
  const sx = 22, sy = -126 + b, a = 0.9 - att * 1.2 - (att < 0 ? 0.3 : 0);
  const ex = sx + Math.cos(a) * 24, ey = sy + Math.sin(a) * 24, hx = ex + Math.cos(a - 0.5) * 22, hy2 = ey + Math.sin(a - 0.5) * 22;
  limb(ctx, [sx, sy, ex, ey], C(coat), 9); rect(ctx, ex - 5, ey - 4, 10, 9, C('#f3ecd8'), 2, 1.8);
  limb(ctx, [ex, ey, hx, hy2], C(coat), 8); hand(ctx, hx, hy2, 5, sk); for (const dx of [-3, 0, 3]) circ(ctx, hx + dx + 1, hy2 - 3, 1.6, C(trim), 0.8); circ(ctx, hx + 4, hy2 + 2, 1.8, C('#b3263a'), 0.8);
  if (A.fl > 0) for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(hx, hy2, 98 - k * 4, -0.25 + att * 0.6 + Math.PI / 2 - A.fl * TAU * 0.8 - k * 0.1, -0.25 + att * 0.6 + Math.PI / 2 - A.fl * TAU * 0.8 + 0.5); ctx.strokeStyle = C('#f2e3a8', 1, 0.28 * (1 - k * 0.18)); ctx.lineWidth = lnw(7 - k); ctx.stroke(); }
  ctx.save(); ctx.translate(hx, hy2); ctx.rotate(-0.25 + att * 0.6 - (att < 0 ? att * 0.5 : 0) + A.fl * TAU);
  const len = 104; line(ctx, [0, -6, 0, len], C(INK), 6); line(ctx, [0, -6, 0, len], C('#2a1a20'), 3.4); line(ctx, [-0.8, -2, -0.8, len - 4], C('#fff', 1, 0.2), 1);
  circ(ctx, 0, -8, 7, C(trim), 2.4); ell(ctx, -2, -10, 2.4, 1.6, C('#fff', 1, 0.6), 0); spec(ctx, 1, -10, 1.6, A); rect(ctx, -3.5, len - 6, 7, 6, C(trim), 1, 2);
  ctx.restore();
  stitchGlow(ctx, A, -2, -100 + b);
}
function fs0(ctx, fill) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lnw(2.6); ctx.strokeStyle = C(INK); ctx.stroke(); }

const PAINT = { marrow, wick, odile };
function pick(heroId) { return PAINT[heroId] ? heroId : 'marrow'; }

// faint pulsing stitch glow over the heart: a heartbeat that slows and stops while dying
function stitchGlow(ctx, A, x, y) {
  const d = A.dying; if (!(d > 0.02)) return;
  const live = 1 - Math.min(1, Math.max(0, (d - 0.55) / 0.35)); if (live <= 0) return;
  const ph = (A.t * (1.2 * (1 - d) + 0.25)) % 1, pulse = Math.exp(-ph * 7) * live;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, 22 + pulse * 16, '#ff3a4e', 0.1 + pulse * 0.4);
  ctx.strokeStyle = C('#ff6a6a', 1, 0.25 + pulse * 0.6); ctx.lineWidth = lnw(1.6); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y + 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}

// ---- engraved compositing (scratch canvases: body, hatch band, rim) ----
const R = 2, SW = 360, SH = 340, OX = 180, OY = 300;
let SC = null, HATCH = null;
function mkc(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function scratch() {
  if (SC) return SC;
  if (typeof document === 'undefined' || !document.createElement) return null;
  SC = { body: mkc(SW * R, SH * R), band: mkc(SW * R, SH * R), rim: mkc(SW * R, SH * R) };
  for (const k of ['body', 'band', 'rim']) { SC[k + 'g'] = SC[k].getContext('2d'); if (!SC[k + 'g']) { SC = null; return null; } }
  const h = mkc(SW * R, SH * R), g = h.getContext('2d');
  if (g) { g.strokeStyle = 'rgba(70,40,24,0.9)'; g.lineWidth = lnw(1.1 * R); g.beginPath(); for (let k = -SH * R; k < SW * R; k += 5 * R) { g.moveTo(k, SH * R); g.lineTo(k + SH * R, 0); } g.stroke(); g.lineWidth = lnw(0.8 * R); g.beginPath(); for (let k = -SH * R; k < SW * R; k += 5 * R) { g.moveTo(k, 0); g.lineTo(k + SH * R, SH * R); } g.stroke(); }
  HATCH = h; return SC;
}
const LAMPCOL = { marrow: '#ffd9a0', wick: '#ffb060', odile: '#ffe6a0' }, CASTCOL = { marrow: '#b3263a', wick: '#ff8a2b', odile: '#f2c14e' }, HEADY = { marrow: -152, wick: -118, odile: -154 };
const MV = {}; // per-hero motion memory for secondary motion
const ease = (x) => x * x * (3 - 2 * x), cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// resolve animation state options into drawing parameters
function resolve(o, id) {
  const r = { att: Math.max(-1, Math.min(1, o.attack || 0)), hurt: cl(o.hurt || 0), sy: 1, sx: 1, rot: 0, lunge: 0, fl: 0, cast: 0, vic: 0 };
  const p = cl(o.p != null ? o.p : (o.stateT != null ? o.stateT : 0)), st = o.state || 'idle';
  if (st === 'hurt') { r.hurt = Math.max(r.hurt, 1 - p); const q = p * 6; r.sy = 1 - 0.2 * Math.exp(-q * 0.9) * Math.cos(q * 2.2); r.sx = 1 + (1 - r.sy) * 0.8; }
  else if (st === 'attack') {
    if (p < 0.32) r.att = -ease(p / 0.32) * 0.85;
    else if (p < 0.55) r.att = -0.85 + ease((p - 0.32) / 0.23) * 1.85;
    else r.att = 1 - ease((p - 0.55) / 0.45);
    r.lunge = Math.max(0, r.att) * 56; if (id === 'odile') r.fl = cl((p - 0.3) / 0.5);
    if (r.att < 0) r.rot = r.att * 0.05; else r.rot = r.att * -0.04;
  } else if (st === 'cast') { r.cast = Math.sin(p * Math.PI); r.att = -0.9 * r.cast; r.sy = 1 + 0.03 * r.cast; r.rot = 0.04 * r.cast; }
  else if (st === 'victory') {
    r.vic = 1; const k = p < 0.4 ? ease(p / 0.4) : 1 - ease(Math.min(1, (p - 0.4) / 0.3)) * 0.0; r.sy = p < 0.4 ? 1 + 0.1 * k : 1.1 - 0.1 * ease(Math.min(1, (p - 0.4) / 0.35)); r.sx = 2 - r.sy > 1 ? 1 - (r.sy - 1) * 0.4 : 1;
    r.att = -0.75 * ease(Math.min(1, p / 0.5)); r.rot = -0.05 * ease(Math.min(1, p / 0.6));
  }
  return r;
}

// Equipped outfit tint (meta.loadout.tint): a colour wash over the figure and a soft-light wash on portraits. null = standard issue.
let heroTint = null;
export function setHeroTint(color) { heroTint = typeof color === 'string' ? color : null; }
export function drawHero(ctx, heroId, x, y, o = {}) {
  try {
    const id = pick(heroId), sz = HERO_SIZE[id];
    const A = prepA(o, 'hero_' + id, '#c9b48a', sz[0], sz[1]);
    A.def = null; A.st = K.NOST; A.dying = cl(o.dying || 0); A.L = keyLamp(o.t || 0);
    const rs = resolve(o, id), d = A.dying, low = o.lowHp === true ? 1 : cl(+o.lowHp || 0), s = o.scale || 1, m = o.flip ? -1 : 1;
    // secondary motion: velocity of the lunge/hurt offset
    const mem = MV[id] || (MV[id] = { p: 0, v: 0, t: -1 }), off = rs.lunge - rs.hurt * 16, tt = o.t || 0;
    if (mem.t < 0 || Math.abs(tt - mem.t) > 0.5) { mem.p = off; mem.v = 0; }
    else if (tt !== mem.t) { const dt = Math.max(0.008, Math.min(0.1, tt - mem.t)); mem.v += ((off - mem.p) / dt / 300 - mem.v) * Math.min(1, dt * 12); mem.p = off; }
    mem.t = tt; A.mv = Math.max(-1.2, Math.min(1.2, mem.v)) * m; A.fl = rs.fl;
    A.att = rs.att; A.hurt = rs.hurt;
    const brSpeed = 1 + low * 0.9, br = 1 + 0.015 * Math.sin(tt * 1.7 * brSpeed);
    // collapse transform
    const dd = d * d * (3 - 2 * d), tremble = low * (1 - d);
    const jx = tremble * Math.sin(tt * 43) * 0.9, jy = tremble * Math.sin(tt * 37 + 1) * 0.6;
    const sy = rs.sy * br * (1 - 0.34 * dd) * (1 - 0.02 * low), sx = rs.sx * (1 + 0.12 * dd), rot = rs.rot - 0.5 * dd * d - 0.05 * low;
    const sc = scratch(), Lm = A.L, lx = Lm.x * m, ly = Lm.y;
    const flashK = Math.min(0.85, rs.hurt * 1.2);
    const px = x + (rs.lunge - rs.hurt * 16) * s * m, hb = HEADY[id];
    // contact shadow (flattened ellipse, blurred core, falls away from the lamp)
    ctx.save(); ctx.translate(px - lx * 16 * s, y + 1); ctx.scale(1, 0.16); ctx.globalAlpha = 0.45 * (1 - d * 0.5) * (1 - Math.min(0.5, rs.lunge / 120));
    { const rr = sz[0] * 0.62 * s * (1 + dd * 0.35), gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); gr.addColorStop(0, 'rgba(8,4,2,0.95)'); gr.addColorStop(0.6, 'rgba(8,4,2,0.5)'); gr.addColorStop(1, 'rgba(8,4,2,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill(); }
    ctx.restore();
    // cast glow behind the figure
    if (rs.cast > 0.02 || rs.vic) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const k = rs.cast || 0.5 * (o.p != null ? Math.sin(cl(o.p) * Math.PI) : 0.5); glow(ctx, px, y - sz[1] * 0.55 * s, sz[1] * 0.7 * s, rs.vic ? '#F2C14E' : CASTCOL[id], 0.45 * k); ctx.restore(); }
    if (!sc) {
      ctx.save(); ctx.translate(px, y); ctx.scale(s * m * sx, s * sy); ctx.rotate(rot * m); PAINT[id](ctx, A); ctx.restore();
    } else {
      const { bodyg: g } = sc;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, SW * R, SH * R); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.setTransform(R, 0, 0, R, 0, 0); g.translate(OX + jx, OY + jy); g.scale(sx, sy); g.rotate(rot);
      PAINT[id](g, A);
      if (d > 0.05) collapseDetail(g, id, d, A);
      g.setTransform(R, 0, 0, R, 0, 0);
      // lamp wash on the face and torso, desaturation when hurt badly, hurt flash
      g.globalCompositeOperation = 'source-atop';
      { const hx = OX + lx * 10, hy = OY + hb * sy + ly * 8, rg = g.createRadialGradient(hx, hy, 2, hx, hy, 46); rg.addColorStop(0, 'rgba(255,214,150,0.30)'); rg.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = rg; g.fillRect(hx - 50, hy - 50, 100, 100); }
      if (heroTint) { g.save(); g.globalAlpha = 0.38; g.fillStyle = heroTint; g.fillRect(0, 0, SW, SH); g.restore(); }
      if (low > 0 || d > 0) { g.fillStyle = `rgba(122,116,108,${Math.min(0.5, 0.34 * low + 0.3 * d)})`; g.fillRect(0, 0, SW, SH); }
      if (flashK > 0) { g.fillStyle = `rgba(255,255,255,${flashK * 0.7})`; g.fillRect(0, 0, SW, SH); }
      g.globalCompositeOperation = 'source-over';
      // hatch band on the shadow side
      const b = sc.bandg; b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, SW * R, SH * R); b.drawImage(HATCH, 0, 0);
      b.globalCompositeOperation = 'destination-in'; b.drawImage(sc.body, 0, 0);
      b.globalCompositeOperation = 'destination-out'; b.drawImage(sc.body, lx * 12 * R, ly * 12 * R);
      // rim light on the lit side
      const rg2 = sc.rimg; rg2.setTransform(1, 0, 0, 1, 0, 0); rg2.globalCompositeOperation = 'source-over'; rg2.clearRect(0, 0, SW * R, SH * R); rg2.drawImage(sc.body, 0, 0);
      rg2.globalCompositeOperation = 'source-in'; rg2.fillStyle = LAMPCOL[id]; rg2.fillRect(0, 0, SW * R, SH * R);
      rg2.globalCompositeOperation = 'destination-out'; rg2.drawImage(sc.body, -lx * 1.8 * R, -ly * 1.8 * R);
      rg2.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(px, y); ctx.scale(s * m, s);
      if (d > 0.85) ctx.globalAlpha = 1 - (d - 0.85) / 0.15 * 0.25;
      ctx.drawImage(sc.body, -OX, -OY, SW, SH);
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.34 * (d > 0.85 ? 0.8 : 1); ctx.drawImage(sc.band, -OX, -OY, SW, SH);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 * (1 - d * 0.5); ctx.drawImage(sc.rim, -OX, -OY, SW, SH);
      ctx.restore();
    }
    // victory / cast sparks
    if (rs.cast > 0.1 || rs.vic) for (let i = 0; i < 6; i++) { const f = (tt * 0.8 + i / 6) % 1; ctx.fillStyle = C(rs.vic ? '#F5E6A8' : CASTCOL[id], 1, (1 - f) * 0.8); ctx.fillRect(px + Math.sin(i * 5.1 + tt) * 40 * s, y - 60 * s - f * 130 * s, 2.4, 2.4); }
  } catch (e) {
    if (globalThis.__GW_ART_THROW) throw e;
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  }
}

// DEATH: seams split along the torso, patches slump off, dropped threads
function collapseDetail(g, id, d, A) {
  const top = id === 'wick' ? -88 : -128, bot = id === 'wick' ? -44 : -52, split = Math.min(1, d * 1.4), n = 6;
  g.save();
  g.strokeStyle = C('#1a0c08', 1, 0.8); g.lineWidth = lnw(1 + split * 6); g.lineCap = 'round'; g.beginPath(); g.moveTo(0, top); for (let i = 1; i <= n; i++) g.lineTo(Math.sin(i * 2.3) * 2 * split, top + (bot - top) * i / n); g.stroke();
  g.strokeStyle = C('#d6c7a6', 1, 0.8); g.lineWidth = lnw(1.2);
  for (let i = 0; i < n; i++) { if ((i * 37 % 10) / 10 < d * 0.9) continue; const yy = top + (bot - top) * (i + 0.5) / n; g.beginPath(); g.moveTo(-4 - split * 3, yy - 3); g.lineTo(4 + split * 3, yy + 3); g.moveTo(-4 - split * 3, yy + 3); g.lineTo(4 + split * 3, yy - 3); g.stroke(); }
  const dd = d * d;
  for (let i = 0; i < 3; i++) { g.save(); g.translate(-14 + i * 14 + (i - 1) * dd * 10, top + 18 + i * 14 + dd * (30 + i * 16)); g.rotate((i - 1) * dd * 0.9); g.fillStyle = C('#c9b48a', 1, 0.95); g.strokeStyle = C(INK); g.lineWidth = lnw(1.6); g.fillRect(-7, -6, 14, 12); g.strokeRect(-7, -6, 14, 12); g.setLineDash([2, 2]); g.beginPath(); g.moveTo(-5, 0); g.lineTo(5, 0); g.stroke(); g.restore(); }
  g.restore();
}

// bust: head and shoulders. view window is [focus - span*0.55, focus + span*0.45] of the full figure.
const BUST = { marrow: [-146, 112], wick: [-112, 96], odile: [-146, 112] };
const BACK = { marrow: '#3a1a22', wick: '#4a2a1a', odile: '#3a2e1a' };
export function drawPortrait(ctx, heroId, cx, cy, size) {
  try {
    const id = pick(heroId), [focus, span] = BUST[id], sc = size / span;
    const tn = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const A = prepA({ t: tn }, 'portrait_' + id, '#c9b48a', 100, 100);
    A.def = null; A.st = K.NOST; A.mv = 0; A.fl = 0; A.L = keyLamp(tn);
    const col = id === 'wick' ? '#ff8a2b' : id === 'odile' ? '#f2c14e' : '#b3263a';
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, TAU); ctx.clip();
    ctx.fillStyle = C(BACK[id]); ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    glow(ctx, cx, cy - size * 0.1, size * 0.55, col, 0.5);
    ctx.save(); ctx.translate(cx, cy + size * 0.06); ctx.scale(sc, sc * (1 + 0.012 * Math.sin(tn * 1.7))); ctx.translate(0, -focus);
    PAINT[id](ctx, A);
    ctx.restore();
    // engraved plate: hatch on the shadow corner, key-lamp wash from the upper left, warm rim
    ctx.strokeStyle = 'rgba(30,16,10,0.34)'; ctx.lineWidth = lnw(1); ctx.beginPath();
    for (let k = 0; k < size * 0.9; k += 4) { ctx.moveTo(cx + size * 0.5 - k, cy + size * 0.5); ctx.lineTo(cx + size * 0.5, cy + size * 0.5 - k); }
    ctx.stroke();
    if (heroTint) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.85; ctx.fillStyle = heroTint; ctx.fillRect(cx - size / 2, cy - size / 2, size, size); ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = 'lighter';
    { const L = A.L, gx = cx + L.x * size * 0.55, gy = cy + L.y * size * 0.55, rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, size * 0.8); rg.addColorStop(0, 'rgba(255,220,160,0.22)'); rg.addColorStop(1, 'rgba(255,220,160,0)'); ctx.fillStyle = rg; ctx.fillRect(cx - size / 2, cy - size / 2, size, size); }
    ctx.globalCompositeOperation = 'source-over';
    { const rg = ctx.createRadialGradient(cx, cy, size * 0.3, cx, cy, size * 0.52); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(10,4,2,0.5)'); ctx.fillStyle = rg; ctx.fillRect(cx - size / 2, cy - size / 2, size, size); }
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 1, 0, TAU); ctx.lineWidth = lnw(3); ctx.strokeStyle = C(INK); ctx.stroke(); ctx.lineWidth = lnw(1.2); ctx.strokeStyle = C('#a58c4a'); ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 4, 0, TAU); ctx.stroke();
    ctx.lineWidth = lnw(1.5); ctx.strokeStyle = 'rgba(255,226,168,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 2, Math.PI * 0.9, Math.PI * 1.55); ctx.stroke(); ctx.restore();
  } catch (e) {
    if (globalThis.__GW_ART_THROW) throw e;
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  }
}
