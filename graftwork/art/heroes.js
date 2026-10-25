// GRAFTWORK hero art. drawHero: FEET at (x,y), facing RIGHT. o: { scale, t, hurt 0..1, attack -1..1, dying 0..1 }
// drawPortrait(ctx, heroId, cx, cy, size): a bust (head and shoulders) centred at (cx,cy), fitted in a size x size circle.
import { K } from './enemies.js';
const { C, INK, poly, line, limb, ell, circ, rect, seam, staple, bandage, wrap, glow, flame, eye, dots, mouthStitch, thread, coin, stage, prepA, text0 } = K;
const TAU = Math.PI * 2;

const HERO_SIZE = { marrow: [110, 180], wick: [100, 160], odile: [100, 185] };
const SKIN = { marrow: '#d9b89a', wick: '#f0cfae', odile: '#ead4bc' };

function head(ctx, x, y, rx, ry, skin, tilt = 0) {
  ell(ctx, x, y, rx, ry, C(skin), 2.8, tilt);
  ell(ctx, x - rx * 0.3, y - ry * 0.35, rx * 0.3, ry * 0.18, C('#fff', 1, 0.2), 0);
}
function ear(ctx, x, y, skin) { ell(ctx, x, y, 4, 6, C(skin, 0.92), 2); }
// the gloved/bare hand
function hand(ctx, x, y, r, skin) { circ(ctx, x, y, r, C(skin), 2.4); }

function marrow(ctx, A) {
  const t = A.t, b = A.b, sk = SKIN.marrow, sway = Math.sin(t * 1.5) * 1.5, att = A.att;
  // trousers and boots
  rect(ctx, -20, -64, 16, 62, C('#2a2630'), 3, 2.6); rect(ctx, 3, -64, 16, 62, C('#2a2630'), 3, 2.6);
  poly(ctx, [-27, -9, -4, -9, 0, 0, -29, 0], C('#16110f'), 2.6); poly(ctx, [3, -9, 26, -9, 32, 0, 3, 0], C('#16110f'), 2.6);
  ctx.save(); ctx.translate(sway * 0.4, 0);
  // long coat with swaying hem
  ctx.beginPath(); ctx.moveTo(-30, -136 + b); ctx.lineTo(30, -136 + b); ctx.lineTo(38, -60); ctx.lineTo(42 + sway, -26);
  for (let i = 0; i < 5; i++) ctx.lineTo(42 + sway - (i + 0.5) * 17, i % 2 ? -26 : -20 + Math.sin(t * 2 + i) * 2);
  ctx.lineTo(-42 + sway, -26); ctx.lineTo(-38, -60); ctx.closePath(); ctx.fillStyle = C('#2c2832'); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C(INK); ctx.stroke();
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
  for (const gx of [-6, 7]) { circ(ctx, gx, -152 + b, 6.4, C('#cfe8e4', 1, 0.3), 2.2); ctx.strokeStyle = C('#a58c4a'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(gx, -152 + b, 6.4, 0, TAU); ctx.stroke(); eye(ctx, gx + 1, -152 + b, 3, 0.8, 0, A.blink); }
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
  ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(74, -3); ctx.lineTo(78, 5); for (let i = pts.length - 2; i >= 0; i -= 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.lineTo(12, 5); ctx.closePath(); ctx.fillStyle = C('#e8e4d6'); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = C(INK); ctx.lineJoin = 'round'; ctx.stroke();
  line(ctx, [16, -2, 70, -1], C('#fff', 1, 0.7), 1.6); poly(ctx, [40, 0, 52, 1, 50, 5, 38, 4], C('#9e0f2e'), 0);
  circ(ctx, 28, 0, 1.6, C('#9a9a98'), 1); circ(ctx, 52, -1, 1.6, C('#9a9a98'), 1);
  ctx.restore();
  hand(ctx, hx, hy, 6.5, sk);
}

function wick(ctx, A) {
  const t = A.t, b = A.b, sk = SKIN.wick, att = A.att, sway = Math.sin(t * 1.9) * 1.5;
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
  for (const [fx, fy, s, sd] of [[-12, -4, 1.5, 0], [10, -2, 1.7, 2], [0, -12, 2.4, 1], [-3, 0, 1.1, 4]]) flame(ctx, fx, hy - 14 + fy * 0.4, s, t, sd);
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
  ctx.save(); ctx.translate(hx, hy2); ctx.rotate(a + Math.PI / 2 - 0.1 + (att > 0 ? -0.3 * att : 0));
  rect(ctx, -6, -34, 12, 38, C('#f1e8c8'), 3, 2.8); line(ctx, [-3, -30, -3, -14], C('#fff', 1, 0.6), 1.8);
  for (const [x, l] of [[3, 12], [-4, 8]]) { line(ctx, [x, -33, x, -33 + l + Math.sin(t * 1.5 + x) * 2], wx, 3); }
  line(ctx, [0, -34, 0, -39], C(INK), 2.4);
  glow(ctx, 0, -50, 36, '#ffb347', 0.6); flame(ctx, 0, -39, 1.3, t, 5, true);
  ctx.restore();
  hand(ctx, hx, hy2, 5.6, sk);
  for (let i = 0; i < 3; i++) { const f = (t * 0.7 + i * 0.33) % 1; circ(ctx, hx + Math.sin(i * 4 + t * 2) * 12, hy2 - 50 - f * 40, 1.6, C('#ffc247', 1, 1 - f), 0); }
}

function odile(ctx, A) {
  const t = A.t, b = A.b, sk = SKIN.odile, att = A.att, sway = Math.sin(t * 1.4) * 1.4;
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
  ctx.beginPath(); ctx.moveTo(-8, -100); ctx.quadraticCurveTo(0, -86 + Math.sin(t * 2) * 1, 10, -98); ctx.strokeStyle = C(trim); ctx.lineWidth = 1.8; ctx.stroke();
  // cravat, high collar
  poly(ctx, [-12, -134 + b, 12, -134 + b, 8, -118 + b, 0, -108 + b, -8, -118 + b], C('#f3ecd8'), 2.2); circ(ctx, 0, -120 + b, 3.2, C('#b3263a'), 1.6);
  poly(ctx, [-24, -132 + b, -14, -146 + b, -8, -134 + b], C(coat, 0.7), 2.4); poly(ctx, [24, -132 + b, 14, -146 + b, 8, -134 + b], C(coat, 0.7), 2.4);
  seam(ctx, [-18, -92, -20, -64], 8, 3.4, C(trim)); staple(ctx, 18, -88, 0.3, 0.9);
  // satchel of keys on the near hip
  ctx.save(); ctx.translate(-22, -62); ctx.rotate(Math.sin(t * 1.4) * 0.04);
  line(ctx, [-4, -34, 6, 6], C('#5a3a20'), 3.4);
  rect(ctx, -12, -4, 26, 24, C('#7a5030'), 5, 2.6); poly(ctx, [-12, -4, 14, -4, 14, 6, 0, 10, -12, 6], C('#5a3a20'), 2.2); circ(ctx, 1, 8, 2.4, C(trim), 1.2);
  for (let i = 0; i < 3; i++) { const sw2 = Math.sin(t * 3 + i * 1.4 + att * 2) * 3; line(ctx, [-6 + i * 6, 18, -8 + i * 6 + sw2, 28], C(trim), 1.4); ctx.save(); ctx.translate(-8 + i * 6 + sw2, 29); ctx.rotate(sw2 * 0.05); circ(ctx, 0, 0, 2.6, null, 1.6); ctx.strokeStyle = C(trim); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.stroke(); line(ctx, [0, 2.4, 0, 9], C(trim), 1.8); line(ctx, [0, 7, 3, 7], C(trim), 1.6); ctx.restore(); }
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
  ctx.beginPath(); ctx.arc(7, hy + 1, 6.4, 0, TAU); ctx.fillStyle = C('#fff', 1, 0.18); ctx.fill(); ctx.strokeStyle = C(trim); ctx.lineWidth = 1.8; ctx.stroke(); ctx.beginPath(); ctx.moveTo(8, hy + 7); ctx.quadraticCurveTo(12, hy + 22, 6, hy + 30); ctx.strokeStyle = C(trim); ctx.lineWidth = 1.2; ctx.stroke();
  line(ctx, [2, hy + 6, 4, hy + 10], C(sk, 0.7), 1.4);
  mouthStitch(ctx, 3, hy + 11, 9, 1.4, '#7a1f2e', 3);
  circ(ctx, -10, hy + 8, 2.4, C('#f4a0a8', 1, 0.5), 0);
  // cane arm: planted cane that thrusts on attack
  const sx = 22, sy = -126 + b, a = 0.9 - att * 1.2 - (att < 0 ? 0.3 : 0);
  const ex = sx + Math.cos(a) * 24, ey = sy + Math.sin(a) * 24, hx = ex + Math.cos(a - 0.5) * 22, hy2 = ey + Math.sin(a - 0.5) * 22;
  limb(ctx, [sx, sy, ex, ey], C(coat), 9); rect(ctx, ex - 5, ey - 4, 10, 9, C('#f3ecd8'), 2, 1.8);
  limb(ctx, [ex, ey, hx, hy2], C(coat), 8); hand(ctx, hx, hy2, 5, sk); for (const dx of [-3, 0, 3]) circ(ctx, hx + dx + 1, hy2 - 3, 1.6, C(trim), 0.8); circ(ctx, hx + 4, hy2 + 2, 1.8, C('#b3263a'), 0.8);
  ctx.save(); ctx.translate(hx, hy2); ctx.rotate(-0.25 + att * 0.6 - (att < 0 ? att * 0.5 : 0));
  const len = 104; line(ctx, [0, -6, 0, len], C(INK), 6); line(ctx, [0, -6, 0, len], C('#2a1a20'), 3.4); line(ctx, [-0.8, -2, -0.8, len - 4], C('#fff', 1, 0.2), 1);
  circ(ctx, 0, -8, 7, C(trim), 2.4); ell(ctx, -2, -10, 2.4, 1.6, C('#fff', 1, 0.6), 0); rect(ctx, -3.5, len - 6, 7, 6, C(trim), 1, 2);
  ctx.restore();
}
function fs0(ctx, fill) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = C(INK); ctx.stroke(); }

const PAINT = { marrow, wick, odile };

function pick(heroId) { return PAINT[heroId] ? heroId : 'marrow'; }

export function drawHero(ctx, heroId, x, y, o = {}) {
  try {
    const id = pick(heroId), sz = HERO_SIZE[id];
    const A = prepA(o, 'hero_' + id, '#c9b48a', sz[0], sz[1]);
    A.def = null; A.st = K.NOST; A.dying = o.dying || 0;
    stage(ctx, PAINT[id], A, sz[0], sz[1], x, y, o, 1, 1);
  } catch (e) {
    if (globalThis.__GW_ART_THROW) throw e;
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  }
}

// bust: head and shoulders. view window is [focus - span*0.55, focus + span*0.45] of the full figure.
const BUST = { marrow: [-146, 112], wick: [-112, 96], odile: [-146, 112] };
const BACK = { marrow: '#3a1a22', wick: '#4a2a1a', odile: '#3a2e1a' };
export function drawPortrait(ctx, heroId, cx, cy, size) {
  try {
    const id = pick(heroId), [focus, span] = BUST[id], sc = size / span;
    const A = prepA({ t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000 }, 'portrait_' + id, '#c9b48a', 100, 100);
    A.def = null; A.st = K.NOST;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, TAU); ctx.clip();
    ctx.fillStyle = C(BACK[id]); ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    glow(ctx, cx, cy - size * 0.1, size * 0.55, id === 'wick' ? '#ff8a2b' : id === 'odile' ? '#f2c14e' : '#b3263a', 0.5);
    ctx.translate(cx, cy + size * 0.06); ctx.scale(sc, sc); ctx.translate(0, -focus);
    PAINT[id](ctx, A);
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 1, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = C(INK); ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = C('#a58c4a'); ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 4, 0, TAU); ctx.stroke(); ctx.restore();
  } catch (e) {
    if (globalThis.__GW_ART_THROW) throw e;
    try { ctx.restore(); } catch (e2) { /* ignore */ }
  }
}
