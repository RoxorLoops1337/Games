// CHARACTER BODY: head with jaw, ears, nose, eyes, brows, mouth, cheeks, marks, facial hair, neck, arms, hands, legs.
// All coordinates absolute rest space (feet y=0). Head features are placed with facePt() so they hug the faceted head.
import { THREE } from './kit.js';
import { C, mix, shade, lite, skinShade, INK, CREAM, K, K2, BI, MB, loft, ball, box, tube, lerp, clamp, sstep, dims, restWorld } from './char_geo.js';

// ------------------------------------------------------------------ head surface model (head-local: origin at neck top, chin about y=0.02)
export const HY = 0.98;
export const HR = [
  { y: -0.03, rx: 0.08, rz: 0.08, cz: 0.03 }, { y: 0.02, rx: 0.14, rz: 0.14, cz: 0.05 }, { y: 0.075, rx: 0.225, rz: 0.21, cz: 0.035 }, { y: 0.15, rx: 0.283, rz: 0.248, cz: 0.018 },
  { y: 0.24, rx: 0.305, rz: 0.27, cz: 0 }, { y: 0.33, rx: 0.31, rz: 0.277, cz: -0.005 }, { y: 0.41, rx: 0.292, rz: 0.27, cz: -0.015 }, { y: 0.49, rx: 0.245, rz: 0.245, cz: -0.03 },
  { y: 0.545, rx: 0.17, rz: 0.18, cz: -0.035 }, { y: 0.585, rx: 0.07, rz: 0.085, cz: -0.035 },
];
export const HEAD_TOP = 0.605, HN = 12, HA0 = Math.PI / HN, SQ = 0.82;
const sp = (s, e) => Math.sign(s) * Math.pow(Math.abs(s), e);
export function ringAt(y) {
  if (y <= HR[0].y) return HR[0]; const L = HR.length; if (y >= HR[L - 1].y) return HR[L - 1];
  let j = 0; while (HR[j + 1].y < y) j++; const a = HR[j], b = HR[j + 1], t = (y - a.y) / (b.y - a.y);
  return { y, rx: lerp(a.rx, b.rx, t), rz: lerp(a.rz, b.rz, t), cz: lerp(a.cz, b.cz, t) };
}
export function headP(th, y) { const r = ringAt(y); return [r.rx * sp(Math.sin(th), SQ), y, r.cz + r.rz * sp(Math.cos(th), SQ)]; }
export function faceZ(x, y) {
  const pts = []; for (let i = 0; i < HN; i++) pts.push(headP(HA0 + (i / HN) * Math.PI * 2, y));
  let best = -1e9; for (let i = 0; i < HN; i++) { const p = pts[i], q = pts[(i + 1) % HN]; if ((p[0] - x) * (q[0] - x) <= 0 && p[0] !== q[0]) { const t = (x - p[0]) / (q[0] - p[0]), z = p[2] + t * (q[2] - p[2]); if (z > best) best = z; } }
  return best;
}
export function facePt(x, y) {
  const z = faceZ(x, y), e = 0.012, zx = (faceZ(x + e, y) - faceZ(x - e, y)) / (2 * e), zy = (faceZ(x, y + e) - faceZ(x, y - e)) / (2 * e), l = Math.hypot(zx, zy, 1);
  return { x, y, z, n: [-zx / l, -zy / l, 1 / l] };
}
export const H = (x, y, z) => [x, HY + y, z];                     // head-local -> absolute
export const HDIR = [0, 0, 1];
const ell = (rx, ry, n, cx, cy, rot) => { const p = [], cr = Math.cos(rot || 0), sr = Math.sin(rot || 0); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, u = Math.cos(a) * rx, v = Math.sin(a) * ry; p.push([(cx || 0) + u * cr - v * sr, (cy || 0) + u * sr + v * cr]); } return p; };
// project a 2D face-plane polygon (head-local x,y) onto the head surface with an outward offset
function onFace(pts, off, sy) { return pts.map(([x, y]) => { const f = facePt(x, y); return [x + f.n[0] * off, HY + y + f.n[1] * off, f.z + f.n[2] * off]; }); }
function faceDecal(mb, pts, col, bone, off, flat, nh) { const w = onFace(pts, off); const f = facePt(pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length); mb.poly(w, col, bone, f.n, { flat: flat, nh: nh !== false }); }

// ------------------------------------------------------------------ head, neck
export function buildHead(mb, ctx) {
  const sk = ctx.skin, K_h = K('head');
  const cc = (k) => skinShade(sk, 0.62 + k * 0.38);
  const rings = HR.map((r, i) => ({ y: HY + r.y, rx: r.rx, rz: r.rz, cz: r.cz, sk: K_h, c: i === 0 ? cc(0.3) : i === 1 ? cc(0.55) : i === 2 ? cc(0.9) : i === 3 ? lite(sk, 0.03) : i === HR.length - 1 ? lite(sk, 0.06) : i >= 6 ? lite(sk, 0.05) : lite(sk, 0.025) }));
  loft(mb, rings, { n: HN, a0: HA0, sq: SQ, caps: 't', capTip: [0, HY + HEAD_TOP, -0.035], capCol: lite(sk, 0.05) });
  // neck
  const nk = (y, r, s) => ({ y, rx: r, rz: r * 0.92, cz: 0.012, sk: s, c: cc(y < 0.9 ? 0.62 : 0.8) });
  loft(mb, [nk(0.84, 0.095, K2('chest', 'neck', 0.4)), nk(0.915, 0.082, K('neck')), nk(HY + 0.01, 0.08, K('head'))], { n: 8, caps: 'b' });
  // ears
  [1, -1].forEach((s) => { const e = H(s * 0.3, 0.255, -0.012); ball(mb, e, [0.03, 0.052, 0.05], cc(0.95), K_h, { detail: 0 }); ball(mb, [e[0] + s * 0.012, e[1] - 0.004, e[2] + 0.006], [0.018, 0.032, 0.03], cc(0.62), K_h, { detail: 0, nh: true }); });
  // nose: a soft button with a lighter bridge
  const nf = facePt(0, 0.185); ball(mb, [0, HY + 0.185, nf.z + 0.012], [0.034, 0.028, 0.034], lite(sk, 0.06), K_h, { detail: 0, col2: lite(sk, 0.1), nh: true });
}

// ------------------------------------------------------------------ face
const EYE_RADIUS = { round: 1.22, sharp: 1.1, sleepy: 1.15, wide: 1.4, lashes: 1.2, cat: 1.2, happy: 1.2, star: 1.3 };
export function buildFace(mb, glow, ctx) {
  const look = ctx.look, eyes = look.eyes || {}, style = eyes.style || 'round', iris = lite(C(eyes.color || '#4a2c1a'), 0.12).multiplyScalar(1.25), sk = ctx.skin;
  const hairC = C(look.hair && look.hair.color || '#2a2024'), brow = mix(hairC, INK, 0.45);
  [1, -1].forEach((s) => {
    const bn = K(s > 0 ? 'eyeL' : 'eyeR'), ex = s * 0.124, ey = 0.27, R = EYE_RADIUS[style] || 1, ox = s;   // ox: outward direction
    const E = (pts, col, off, g, flat) => { const w = pts.map(([u, v]) => [ex + u, ey + v]); const arr = onFace(w, off); const f = facePt(ex, ey); (g ? glow : mb).poly(arr, col, bn, f.n, { flat: flat || !!g, nh: true }); };
    const hi = (r, u, v) => E(ell(r, r * 1.05, 6, u, v), CREAM, 0.0185, true);
    if (style === 'happy') {
      const arc = [], top = [], bot = []; for (let i = 0; i <= 6; i++) { const t = i / 6, u = (t - 0.5) * 0.09, v = 0.018 * Math.cos((t - 0.5) * Math.PI); top.push([u, v + 0.011]); bot.push([u, v - 0.006]); }
      for (let i = 0; i < 6; i++) E([top[i], top[i + 1], bot[i + 1], bot[i]], INK, 0.009);
      void arc;
    } else if (style === 'star') {
      E(ell(0.046 * R, 0.056 * R, 10, 0, 0), INK, 0.009);
      const st = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.017 : 0.04; st.push([Math.cos(a) * r, Math.sin(a) * r * 1.1]); } E(st, iris, 0.013, true);
      hi(0.008, -0.012, 0.02);
    } else {
      const tilt = style === 'sharp' ? 0.28 * ox : style === 'cat' ? 0.4 * ox : 0, hy = style === 'sleepy' ? 0.78 : style === 'sharp' ? 0.72 : style === 'cat' ? 0.82 : 1;
      if (style === 'wide') E(ell(0.054, 0.064, 10, 0, 0), '#f3e6d3', 0.008, false, false);
      E(ell(0.042 * R, 0.054 * R * hy, 10, 0, 0, tilt), INK, 0.0095);
      E(ell(0.033 * R, 0.044 * R * hy, 9, 0, -0.004 * hy, tilt), iris, 0.0125);
      if (style === 'cat') E(ell(0.008, 0.04, 6, 0, -0.002, tilt), INK, 0.0145); else E(ell(0.017 * R, 0.024 * R * hy, 7, 0, -0.005 * hy, tilt), INK, 0.0145);
      if (style === 'sleepy') { E([[-0.052 * R, 0.05], [0.052 * R, 0.05], [0.05 * R, 0.0], [-0.05 * R, 0.0]].map(([u, v]) => [u, v + 0.0]), skinShade(sk, 0.82), 0.0165); E([[-0.052 * R, 0.0], [0.052 * R, 0.0], [0.05 * R, -0.008], [-0.05 * R, -0.006]], INK, 0.0175); }
      if (style === 'sharp') E([[-0.05 * ox - 0.0, 0.052], [0.05 * ox, 0.02 + 0.03], [0.05 * ox, 0.012], [-0.05 * ox, 0.03]], INK, 0.0165);
      if (style === 'lashes') [0, 1, 2].forEach((i) => { const a = 0.6 + i * 0.4; E([[ox * (0.036 + i * 0.006), 0.038 + i * 0.008], [ox * (0.036 + i * 0.006 + 0.04 * Math.cos(a)), 0.038 + i * 0.008 + 0.034 * Math.sin(a)], [ox * (0.044 + i * 0.006), 0.04 + i * 0.008]], INK, 0.0145); });
      hi(0.0105 * R, -0.011 * ox * 0 - 0.011, 0.017 * hy); hi(0.0055, 0.013, -0.017 * hy);
    }
    // brows (bone rotates for expression)
    const bid = look.brows === undefined ? 'soft' : look.brows;
    if (bid !== 'none') {
      const th = bid === 'thick' ? 0.026 : bid === 'thin' ? 0.011 : 0.017, arch = bid === 'arched' ? 0.02 : bid === 'straight' ? 0 : 0.008, len = 0.052, by = 0.352, bx = s * 0.124, bnn = K(s > 0 ? 'browL' : 'browR'), pt = [];
      const top = [], bot = []; for (let i = 0; i <= 4; i++) { const t = i / 4, u = (t - 0.5) * 2 * len * ox, v = arch * Math.sin(t * Math.PI) - (bid === 'soft' ? 0.012 * (1 - t) : 0) + (bid === 'straight' ? 0.004 * t : 0); top.push([bx + u, by + v + th / 2]); bot.push([bx + u, by + v - th / 2]); }
      void pt; for (let i = 0; i < 4; i++) { const w = onFace([top[i], top[i + 1], bot[i + 1], bot[i]], 0.011); mb.poly(w, brow, bnn, [0, 0, 1], { nh: true, flat: true }); }
    }
    // cheeks (puff bones)
    const cb = ctx.rest[s > 0 ? 'cheekL' : 'cheekR']; ball(mb, cb, [0.052, 0.05, 0.05], skinShade(sk, 0.98), K(s > 0 ? 'cheekL' : 'cheekR'), { detail: 0, nh: true });
    if ((look.marks || []).indexOf('blush') >= 0) faceDecal(mb, ell(0.04, 0.026, 8, s * 0.2, 0.17, 0), mix(sk, '#ff5f8a', 0.45), K('head'), 0.006, true);
  });
  // mouth: closed smile strip (static) + open mouth shape (bone 'mouth' scales it)
  const mc = mix('#6b2a35', INK, 0.2), my = 0.118, K_h = K('head');
  for (let i = 0; i < 6; i++) { const a = (i / 6 - 0.5) * 2, b = ((i + 1) / 6 - 0.5) * 2, ya = 0.016 * a * a, yb = 0.016 * b * b; faceDecal(mb, [[a * 0.058, my + ya + 0.007], [b * 0.058, my + yb + 0.007], [b * 0.058, my + yb - 0.004], [a * 0.058, my + ya - 0.004]], mc, K_h, 0.007, true); }
  const mo = [], mt = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; mo.push([Math.cos(a) * 0.055, my + 0.004 - Math.sin(a) * 0.075]); }
  const mp = mo.slice(); const fm = facePt(0, my);
  mb.poly(onFace(mp, 0.0105), '#4a1d2b', K('mouth'), fm.n, { nh: true, flat: true });
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; mt.push([Math.cos(a) * 0.035, my - 0.025 - Math.sin(a) * 0.035]); }
  mb.poly(onFace(mt, 0.0125), '#e0708a', K('mouth'), fm.n, { nh: true, flat: true });
  // marks
  (look.marks || []).forEach((m) => {
    if (m === 'freckles') [[-1, 0.2, 0.17], [-1, 0.24, 0.155], [-1, 0.2, 0.14], [1, 0.2, 0.17], [1, 0.24, 0.155], [1, 0.2, 0.14], [0, 0.0, 0]].forEach(([s, ux, uy], i) => { if (!s) return; const x = s * (0.12 + i * 0.0), y = 0.2; void x; void y; });
    if (m === 'freckles') { const dots = [[0.16, 0.19], [0.21, 0.2], [0.185, 0.165], [0.235, 0.175], [0.145, 0.15]]; [1, -1].forEach((s) => dots.forEach(([x, y]) => faceDecal(mb, ell(0.007, 0.007, 4, s * x, y, 0.4), mix(sk, '#6b3a22', 0.55), K_h, 0.005, true))); }
    if (m === 'beauty') faceDecal(mb, ell(0.009, 0.009, 5, -0.11, 0.1, 0), INK, K_h, 0.006, true);
    if (m === 'scar') faceDecal(mb, [[0.09, 0.36], [0.1, 0.36], [0.165, 0.22], [0.155, 0.22]], mix(sk, '#d98a8a', 0.5), K_h, 0.006, true);
    if (m === 'bandaid') faceDecal(mb, [[-0.2, 0.19], [-0.14, 0.23], [-0.125, 0.205], [-0.185, 0.165]], '#f2c9a0', K_h, 0.007, true);
    if (m === 'starpaint') { const st = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.012 : 0.03; st.push([-0.2 + Math.cos(a) * r, 0.2 + Math.sin(a) * r]); } faceDecal(mb, st, '#ffd23f', K_h, 0.007, true); }
    if (m === 'tear') faceDecal(mb, [[0.145, 0.205], [0.165, 0.205], [0.155, 0.16]], '#4fa3ff', K_h, 0.007, true);
    if (m === 'warpaint') [1, 0.7].forEach((k, i) => faceDecal(mb, [[-0.27, 0.22 - i * 0.04], [-0.1, 0.21 - i * 0.04], [-0.1, 0.19 - i * 0.04], [-0.27, 0.2 - i * 0.04]], '#e63946', K_h, 0.006, true));
  });
}

// ------------------------------------------------------------------ facial hair
export function buildFacial(mb, ctx) {
  const f = ctx.look.facial; if (!f || f === 'none') return; const hc = C(ctx.look.hair && ctx.look.hair.color || '#2a2024'), K_h = K('head'), sk = ctx.skin;
  const bearded = f === 'beard' || f === 'longbeard';
  if (f === 'stubble') { const col = mix(sk, hc, 0.32); loft(mb, [0.0, 0.07, 0.14, 0.2].map((y, i) => ({ y: HY + y - 0.0, rx: ringAt(y).rx * 1.012, rz: ringAt(y).rz * 1.012, cz: ringAt(y).cz, sk: K_h, c: i === 0 ? shade(col, 0.7) : col })), { n: HN, a0: HA0, sq: SQ, caps: '', flat: false }); }
  if (f === 'mustache' || f === 'goatee' || bearded) {
    const m = [[0, 0.16], [0.03, 0.152], [0.08, 0.138], [0.05, 0.168]]; void m;
    [1, -1].forEach((s) => { faceDecal(mb, [[s * 0.004, 0.148], [s * 0.1, 0.133], [s * 0.095, 0.158], [s * 0.004, 0.172]], hc, K_h, 0.014, false, false); });
    ball(mb, [0, HY + 0.152, facePt(0, 0.15).z + 0.016], [0.045, 0.014, 0.014], hc, K_h, { detail: 0 });
  }
  if (f === 'goatee') ball(mb, [0, HY + 0.045, facePt(0, 0.05).z + 0.008], [0.04, 0.055, 0.03], hc, K_h, { detail: 0 });
  if (bearded) {
    const long = f === 'longbeard', top = [], rows = long ? 6 : 4;
    // beard shell: wraps jaw (all angles except the mouth wedge) down past the chin; long beard flows down the chest on the spring bone
    const cols = 12; const rowsY = long ? [0.16, 0.1, 0.03, -0.06, -0.17, -0.27] : [0.17, 0.1, 0.03, -0.04];
    for (let j = 0; j < rowsY.length - 1; j++) for (let i = 0; i < cols; i++) {
      const th0 = HA0 + (i / cols) * Math.PI * 2, th1 = HA0 + ((i + 1) / cols) * Math.PI * 2, thm = (th0 + th1) / 2, aF = Math.abs(((thm + Math.PI) % (Math.PI * 2)) - Math.PI);
      const vtx = (th, jj) => { const y = rowsY[jj], yc = Math.max(y, 0.0), p = headP(th, Math.max(0.01, yc)), sc = 1 + 0.07 + (jj >= 2 ? 0.05 : 0), sagY = y < 0 ? y : 0, ext = Math.max(0, -y) * 0.0; void ext; const tf = long && y < 0 ? 0.95 - (-y) * 0.9 : 1; return [p[0] * sc * tf, HY + y + (jj > 0 ? 0 : 0) + (y > 0 ? 0 : 0) + sagY * 0 + (y < 0 ? 0 : 0), p[2] * sc * tf + (y < 0 ? 0.03 : 0.0) + (y < 0 && long ? 0.04 : 0)]; };
      // skip the mouth gap: front columns above y=0.1 are left open (mustache covers them)
      if (aF < 0.7 && j < 1) continue;
      const rowBone = (jj) => (long && rowsY[jj] < 0 ? K2('beard', 'beard', 0) : K_h);
      const a = vtx(th0, j), b = vtx(th1, j), c = vtx(th1, j + 1), d = vtx(th0, j + 1);
      const col0 = mix(hc, lite(hc, 0.3), j / rowsY.length), col1 = mix(hc, lite(hc, 0.3), (j + 1) / rowsY.length);
      const hint = [(a[0] + b[0]) / 2, 0.05, (a[2] + b[2]) / 2 - 0.0]; const sA = rowBone(j), sB = rowBone(j + 1);
      mb.triH(a, b, c, hint, col0, col0, col1, sA, sA, sB); mb.triH(a, c, d, hint, col0, col1, col1, sA, sB, sB);
    }
    void top;
    // chin point so the beard has a silhouette
    const tip = long ? [0, HY - 0.36, 0.2] : [0, HY - 0.07, 0.2]; ball(mb, tip, long ? [0.07, 0.09, 0.05] : [0.06, 0.04, 0.05], mix(hc, lite(hc, 0.3), 0.5), long ? K('beard') : K_h, { detail: 0 });
  }
}

// ------------------------------------------------------------------ limbs (skin parts that clothing may leave exposed)
// arm rings from shoulder (u=0) to wrist (u=1); returns skin descriptor per u
const ARM_U = [0, 0.2, 0.4, 0.56, 0.75, 0.93, 1];
const armY = (u) => 0.885 - u * 0.375;
const armSk = (s, y) => (y > 0.73 ? K(side(s, 'sh')) : y > 0.63 ? K2(side(s, 'sh'), side(s, 'el'), (0.73 - y) / 0.1) : y > 0.56 ? K(side(s, 'el')) : K2(side(s, 'el'), side(s, 'wr'), clamp((0.56 - y) / 0.06, 0, 1) * 0.5));
const side = (s, n) => n + (s > 0 ? 'L' : 'R');
export const armRad = (u) => (u < 0.4 ? 0.068 : u < 0.6 ? 0.062 : u < 0.8 ? 0.057 : 0.05);
export const armSkin = armSk;
export function buildArms(mb, ctx, d, sleeveEnd) {
  const sk = ctx.skin;
  [1, -1].forEach((s) => {
    const rings = []; ARM_U.forEach((u) => { if (u < sleeveEnd - 0.12) return; const y = armY(u); rings.push({ y, rx: armRad(u), rz: armRad(u) * 0.95, cx: s * d.shX, sk: armSk(s, y), c: u > 0.9 ? skinShade(sk, 0.85) : sk }); });
    if (rings.length >= 2) loft(mb, rings, { n: 8, caps: sleeveEnd <= 0.02 ? 't' : '' });
    buildHand(mb, ctx, d, s);
  });
}
export function buildHand(mb, ctx, d, s) {
  const sk = ctx.skin, wr = K(side(s, 'wr')), x = s * d.shX, W = restWorld(d)[side(s, 'wr')][1], F = 1.25;
  const hr = (dy, rx, rz, cz, c) => ({ y: W - dy * F, rx: rx * F, rz: rz * F, cz: cz * F, cx: x, sk: dy < 0.01 ? K2(side(s, 'el'), side(s, 'wr'), 0.8) : wr, c });
  loft(mb, [hr(0.0, 0.046, 0.042, 0, skinShade(sk, 0.8)), hr(0.03, 0.062, 0.05, 0.004, sk), hr(0.075, 0.068, 0.054, 0.01, lite(sk, 0.03)), hr(0.11, 0.05, 0.04, 0.014, skinShade(sk, 0.92))], { n: 6, caps: 'bt', sq: 0.8, capCol: skinShade(sk, 0.9) });
  ball(mb, [x - s * 0.07, W - 0.075 * F, 0.04], [0.03, 0.045, 0.03], lite(sk, 0.04), wr, { detail: 0, rot: [0.5, 0, s * 0.35], nh: true });
  [-0.03, 0.0, 0.03].forEach((u) => mb.poly([[x + u * F - 0.004, W - 0.08 * F, 0.07 * F], [x + u * F + 0.004, W - 0.08 * F, 0.07 * F], [x + u * F + 0.004, W - 0.134 * F, 0.058 * F], [x + u * F - 0.004, W - 0.134 * F, 0.058 * F]], skinShade(sk, 0.55), wr, [0, 0, 1], { flat: false, nh: true }));
}
import { mat } from './char_geo.js';

// leg skin rings (hip y=.46 to ankle .085)
const LEG_Y = [0.47, 0.37, 0.27, 0.19, 0.1];
const legSk = (s, y) => (y > 0.33 ? K(side(s, 'th')) : y > 0.22 ? K2(side(s, 'th'), side(s, 'kn'), (0.33 - y) / 0.11) : y > 0.14 ? K(side(s, 'kn')) : K2(side(s, 'kn'), side(s, 'an'), 0.5));
export const legSkin = legSk;
export const legRad = (y) => (y > 0.4 ? 0.075 : y > 0.3 ? 0.068 : y > 0.22 ? 0.06 : 0.05);
export function buildLegs(mb, ctx, d, legEndY, showFoot) {
  const sk = ctx.skin;
  [1, -1].forEach((s) => {
    const rings = []; LEG_Y.forEach((y) => { if (y > legEndY + 0.05) return; rings.push({ y, rx: legRad(y), rz: legRad(y), cx: s * d.hipX, sk: legSk(s, y), c: y < 0.15 ? skinShade(sk, 0.8) : sk }); });
    if (rings.length >= 2) loft(mb, rings, { n: 8, caps: 'bt' });
  });
}
export function restDims(body) { const d = dims(body); return { d, rest: restWorld(d) }; }
void THREE; void box; void tube; void sstep; void shade; void BI; void MB;
