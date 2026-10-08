// CHARACTER BODY: head with jaw, ears, nose, eyes, brows, mouth, cheeks, marks, facial hair, neck, arms, hands, legs.
// All coordinates absolute rest space (feet y=0). Head features are placed with facePt() so they hug the faceted head.
import { THREE } from './kit.js';
import { C, mix, shade, lite, skinShade, INK, CREAM, K, K2, BI, MB, loft, ball, box, tube, lerp, clamp, sstep, dims, restWorld } from './char_geo.js';

// ------------------------------------------------------------------ head surface model (head-local: origin at neck top, chin about y=0.02)
export const HY = 0.98;
export const HR = [
  { y: 0.02, rx: 0.14, rz: 0.14, cz: 0.05 }, { y: 0.075, rx: 0.225, rz: 0.21, cz: 0.035 }, { y: 0.15, rx: 0.283, rz: 0.248, cz: 0.018 },
  { y: 0.24, rx: 0.305, rz: 0.27, cz: 0 }, { y: 0.33, rx: 0.31, rz: 0.277, cz: -0.005 }, { y: 0.43, rx: 0.285, rz: 0.268, cz: -0.02 },
  { y: 0.55, rx: 0.16, rz: 0.17, cz: -0.035 }, { y: 0.585, rx: 0.07, rz: 0.085, cz: -0.035 },
];
export const HEAD_TOP = 0.605, HN = 10, HA0 = Math.PI / HN, SQ = 0.82;
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
  const rings = HR.map((r, i) => ({ y: HY + r.y, rx: r.rx, rz: r.rz, cz: r.cz, sk: K_h, c: i === 0 ? cc(0.6) : i === 1 ? cc(0.9) : i === 2 ? lite(sk, 0.02) : i === 3 ? lite(sk, 0.03) : i === HR.length - 1 ? lite(sk, 0.06) : i >= 6 ? lite(sk, 0.05) : lite(sk, 0.025) }));
  loft(mb, rings, { hullHalf: true, hullCaps: 't', n: HN, a0: HA0, sq: SQ, caps: 'bt', capTip: [0, HY + HEAD_TOP, -0.035], capCol: lite(sk, 0.05) });
  // neck
  const nk = (y, r, s) => ({ y, rx: r, rz: r * 0.92, cz: 0.012, sk: s, c: cc(y < 0.9 ? 0.62 : 0.8) });
  loft(mb, [nk(0.86, 0.095, K2('chest', 'neck', 0.4)), nk(HY + 0.01, 0.08, K('neck'))], { n: 6, caps: 'b' });
  // ears
  [1, -1].forEach((s) => { const e = H(s * 0.3, 0.255, -0.012); ball(mb, e, [0.03, 0.052, 0.05], cc(0.95), K_h, { detail: 0 }); });
  // nose: a soft button with a lighter bridge
  const nf = facePt(0, 0.185); ball(mb, [0, HY + 0.178, nf.z + 0.002], [0.03, 0.024, 0.026], lite(sk, 0.1), K_h, { detail: 0, col2: lite(sk, 0.18), nh: true });
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
      if (style === 'cat') E(ell(0.008, 0.04, 6, 0, -0.002, tilt), INK, 0.0145); else E(ell(0.017 * R, 0.024 * R * hy, 5, 0, -0.005 * hy, tilt), INK, 0.0145);
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
    const cb = ctx.rest[s > 0 ? 'cheekL' : 'cheekR']; ball(mb, cb, [0.052, 0.05, 0.05], skinShade(sk, 0.98), K(s > 0 ? 'cheekL' : 'cheekR'), { detail: 0, nh: true, rot: [0.55, 0.6, 0.35] });
    if ((look.marks || []).indexOf('blush') >= 0) faceDecal(mb, ell(0.04, 0.026, 8, s * 0.2, 0.17, 0), mix(sk, '#ff5f8a', 0.45), K('head'), 0.006, true);
  });
  // mouth: closed smile strip (bone lipS, scaled for expression) + frown strip (bone lipF) + open mouth shape (bone 'mouth' scales it)
  const mc = mix('#6b2a35', INK, 0.2), my = 0.118, K_h = K('head');
  for (let i = 0; i < 6; i++) { const a = (i / 6 - 0.5) * 2, b = ((i + 1) / 6 - 0.5) * 2, ya = 0.016 * a * a, yb = 0.016 * b * b; faceDecal(mb, [[a * 0.058, my + ya + 0.007], [b * 0.058, my + yb + 0.007], [b * 0.058, my + yb - 0.004], [a * 0.058, my + ya - 0.004]], mc, K('lipS'), 0.007, true); }
  for (let i = 0; i < 6; i++) { const a = (i / 6 - 0.5) * 2, b = ((i + 1) / 6 - 0.5) * 2, ya = 0.016 * (1 - a * a) - 0.004, yb = 0.016 * (1 - b * b) - 0.004; faceDecal(mb, [[a * 0.05, my + ya + 0.007], [b * 0.05, my + yb + 0.007], [b * 0.05, my + yb - 0.004], [a * 0.05, my + ya - 0.004]], mc, K('lipF'), 0.007, true); }   // frown strip (hidden by scaling its bone flat)
  const mo = [], mt = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; mo.push([Math.cos(a) * 0.055, my + 0.004 - Math.sin(a) * 0.075]); }
  const mp = mo.slice(); const fm = facePt(0, my);
  mb.poly(onFace(mp, 0.0105), '#4a1d2b', K('mouth'), fm.n, { nh: true, flat: true });
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; mt.push([Math.cos(a) * 0.035, my - 0.025 - Math.sin(a) * 0.035]); }
  mb.poly(onFace(mt, 0.0125), '#e0708a', K('mouth'), fm.n, { nh: true, flat: true });
  // age lines (look.age === 'old'): forehead creases and crow's feet
  if (look.age === 'old') {
    const wl = skinShade(sk, 0.7);
    [0.395, 0.415].forEach((y, i) => faceDecal(mb, [[-0.1 + i * 0.01, y], [0.1 - i * 0.01, y], [0.095 - i * 0.01, y - 0.006], [-0.095 + i * 0.01, y - 0.006]], wl, K('head'), 0.006, true));
    [1, -1].forEach((s) => [0.0, 0.03].forEach((o) => faceDecal(mb, [[s * 0.205, 0.28 - o], [s * 0.245, 0.285 - o + 0.012], [s * 0.245, 0.279 - o + 0.012], [s * 0.205, 0.274 - o]], wl, K('head'), 0.006, true)));
    [1, -1].forEach((s) => faceDecal(mb, [[s * 0.1, 0.2], [s * 0.14, 0.17], [s * 0.145, 0.176], [s * 0.105, 0.206]], wl, K('head'), 0.006, true));
  }
  // marks
  (look.marks || []).forEach((m) => {
    if (m === 'freckles') [[-1, 0.2, 0.17], [-1, 0.24, 0.155], [-1, 0.2, 0.14], [1, 0.2, 0.17], [1, 0.24, 0.155], [1, 0.2, 0.14], [0, 0.0, 0]].forEach(([s, ux, uy], i) => { if (!s) return; const x = s * (0.12 + i * 0.0), y = 0.2; void x; void y; });
    if (m === 'freckles') { const dots = [[0.16, 0.19], [0.21, 0.2], [0.185, 0.165], [0.235, 0.175], [0.145, 0.15]]; [1, -1].forEach((s) => dots.forEach(([x, y]) => faceDecal(mb, ell(0.007, 0.007, 4, s * x, y, 0.4), mix(sk, '#6b3a22', 0.55), K_h, 0.005, true))); }
    if (m === 'beauty') faceDecal(mb, ell(0.009, 0.009, 5, -0.11, 0.1, 0), INK, K_h, 0.006, true);
    if (m === 'scar') faceDecal(mb, [[0.09, 0.36], [0.1, 0.36], [0.165, 0.22], [0.155, 0.22]], mix(sk, '#d98a8a', 0.5), K_h, 0.006, true);
    if (m === 'bandaid') faceDecal(mb, [[-0.2, 0.19], [-0.14, 0.23], [-0.125, 0.205], [-0.185, 0.165]], '#f2c9a0', K_h, 0.007, true);
    if (m === 'starpaint') { const st = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.012 : 0.03; st.push([-0.2 + Math.cos(a) * r, 0.2 + Math.sin(a) * r]); } faceDecal(mb, st, '#ffd23f', K_h, 0.007, true); }
    if (m === 'goldgrill') { const gc = '#e8b923'; for (let i = 0; i < 5; i++) { const a = -0.55 + i * 0.275, b = a + 0.275, ya = 0.016 * a * a, yb = 0.016 * b * b; faceDecal(mb, [[a * 0.058, my + ya - 0.0035], [b * 0.058, my + yb - 0.0035], [b * 0.058, my + yb - 0.0125], [a * 0.058, my + ya - 0.0125]], i % 2 ? '#fff0b0' : gc, K('lipS'), 0.0114, true); } }
    if (m === 'eyebrowslit') [0.0, 0.026].forEach((o) => faceDecal(mb, [[0.124 - 0.006 + o, 0.352 + 0.026], [0.124 + 0.004 + o, 0.352 + 0.026], [0.124 - 0.007 + o, 0.352 - 0.02], [0.124 - 0.017 + o, 0.352 - 0.02]], skinShade(sk, 1.0), K('browL'), 0.0125, true));
    if (m === 'tear') faceDecal(mb, [[0.145, 0.205], [0.165, 0.205], [0.155, 0.16]], '#4fa3ff', K_h, 0.007, true);
    if (m === 'warpaint') [1, 0.7].forEach((k, i) => faceDecal(mb, [[-0.27, 0.22 - i * 0.04], [-0.1, 0.21 - i * 0.04], [-0.1, 0.19 - i * 0.04], [-0.27, 0.2 - i * 0.04]], '#e63946', K_h, 0.006, true));
  });
}

// ------------------------------------------------------------------ facial hair
// a decal with thickness: the top face at off1 plus side walls down to off0 (inside the skin), so it reads as attached from every angle
function faceSlab(mb, pts, off0, off1, col, bone) {
  const top = onFace(pts, off1), bot = onFace(pts, off0), n = pts.length, cx = top.reduce((a, p) => a + p[0], 0) / n, cy = top.reduce((a, p) => a + p[1], 0) / n, cz = top.reduce((a, p) => a + p[2], 0) / n, f = facePt(pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n), side = shade(col, 0.8);
  mb.poly(top, col, bone, f.n, { flat: false, nh: false });
  for (let i = 0; i < n; i++) { const i2 = (i + 1) % n, h = [(top[i][0] + top[i2][0]) / 2 - cx, (top[i][1] + top[i2][1]) / 2 - cy, (top[i][2] + top[i2][2]) / 2 - cz]; mb.triH(top[i], top[i2], bot[i2], h, side, side, side, bone, bone, bone, true); mb.triH(top[i], bot[i2], bot[i], h, side, side, side, bone, bone, bone, true); }
}
// a patch of facial hair over the head columns: rows (head-local y, top first), off(th, y) outward offset, keep(i, j, thm) which cells exist; tuck folds rows below the chin inward
function facePatch(mb, rowsY, off, keep, colF, skirt) {
  const K_h = K('head'), cols = HN, vtx = (th, y) => { const tuck = y < 0.03, p = headP(th, tuck ? 0.03 : y), r = ringAt(tuck ? 0.03 : y), l = Math.hypot(p[0], p[2] - r.cz) || 1, e = tuck ? -0.02 : off(th, y); return [p[0] + p[0] / l * e, HY + y, p[2] + (p[2] - r.cz) / l * e + (tuck ? 0.012 : 0)]; };
  for (let i = 0; i < cols; i++) {
    const th0 = HA0 + (i / cols) * Math.PI * 2, th1 = th0 + (Math.PI * 2) / cols, thm = (th0 + th1) / 2;
    for (let j = 0; j < rowsY.length - 1; j++) {
      if (!keep(i, j, thm)) continue;
      const a = vtx(th0, rowsY[j]), b = vtx(th1, rowsY[j]), c = vtx(th1, rowsY[j + 1]), d = vtx(th0, rowsY[j + 1]), c0 = colF(j), c1 = colF(j + 1), hint = [(a[0] + b[0]) / 2, 0.05 - (rowsY[j + 1] < 0.03 ? 0.4 : 0), (a[2] + b[2]) / 2 - 0.02];
      mb.triH(a, b, c, hint, c0, c0, c1, K_h, K_h, K_h); mb.triH(a, c, d, hint, c0, c1, c1, K_h, K_h, K_h);
      // close every open top edge down to the skin
      if (skirt && (j === 0 || !keep(i, j - 1, thm))) { const y = rowsY[j], ai = headP(th0, y), bi = headP(th1, y), A = [ai[0], HY + y, ai[2]], B = [bi[0], HY + y, bi[2]], sc = shade(c0, 0.85); mb.triH(a, b, B, [0, 1, 0], sc, sc, sc, K_h, K_h, K_h, true); mb.triH(a, B, A, [0, 1, 0], sc, sc, sc, K_h, K_h, K_h, true); }
    }
  }
}
export function buildFacial(mb, ctx) {
  const f = ctx.look.facial; if (!f || f === 'none') return; const hc = C(ctx.look.hair && ctx.look.hair.color || '#2a2024'), K_h = K('head'), sk = ctx.skin, bearded = f === 'beard' || f === 'longbeard', long = f === 'longbeard';
  const aF = (th) => Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
  // stubble: a shadow over the jaw, cheeks and sideburns only (not the nape), the sideburns reach up to the hairline in front of the ears
  if (f === 'stubble') { const col = mix(sk, hc, 0.32); facePatch(mb, [0.33, 0.22, 0.14, 0.07, 0.0], () => 0.0035, (i, j, th) => aF(th) < 2.0 && (j > 0 || aF(th) > 0.9 && aF(th) < 1.6), (j) => (j >= 4 ? shade(col, 0.7) : col), false); }
  if (f === 'mustache' || f === 'goatee' || bearded) {
    [1, -1].forEach((s) => faceSlab(mb, [[s * 0.004, 0.148], [s * 0.1, 0.133], [s * 0.095, 0.158], [s * 0.004, 0.172]], 0.002, 0.014, hc, K_h));
    ball(mb, [0, HY + 0.152, facePt(0, 0.15).z + 0.012], [0.045, 0.016, 0.016], hc, K_h, { detail: 0 });
  }
  if (f === 'goatee') ball(mb, [0, HY + 0.045, facePt(0, 0.05).z + 0.006], [0.04, 0.055, 0.03], hc, K_h, { detail: 0 });
  if (!bearded) return;
  // beard: jaw, chin and cheeks with the mouth left open, sideburns in front of the ears up to the hairline, nothing on the back of the head; the long beard hangs on the spring bone
  const rowsY = [0.34, 0.24, 0.16, 0.09, 0.03, -0.02], colF = (j) => mix(shade(hc, 0.92), lite(hc, 0.2), j / 6);
  facePatch(mb, rowsY, (th, y) => 0.016 + 0.006 * Math.max(0, 0.2 - y) / 0.2, (i, j, th) => { const a = aF(th); if (a > 2.25) return false; if (j <= 1) return a > 0.9 && a < 1.6; if (a < 0.35 && j < 4) return false; if (a > 1.6) return j >= 3; return true; }, colF, true);
  if (long) {
    const R = [[0.06, 0.17, 0.1, 0.14], [-0.05, 0.14, 0.1, 0.2], [-0.17, 0.1, 0.075, 0.235], [-0.27, 0.065, 0.05, 0.25], [-0.35, 0.025, 0.02, 0.255]].map(([y, rx, rz, cz], i) => ({ y: HY + y, rx, rz, cz, c: mix(hc, lite(hc, 0.35), i / 4), sk: K2('head', 'beard', clamp(i / 2, 0, 1)) }));
    loft(mb, R, { n: 6, sq: 0.9, caps: 't', hullHalf: false });
  } else ball(mb, [0, HY - 0.012, facePt(0, 0.03).z - 0.012], [0.075, 0.045, 0.05], mix(hc, lite(hc, 0.3), 0.5), K_h, { detail: 0 });
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
    if (rings.length >= 2) loft(mb, rings, { hullHalf: rings.length >= 4, n: 6, caps: sleeveEnd <= 0.02 ? 'b' : '', capColB: sk });
    buildHand(mb, ctx, d, s);
  });
}
export function buildHand(mb, ctx, d, s) {
  const sk = ctx.skin, wr = K(side(s, 'wr')), x = s * d.shX, W = restWorld(d)[side(s, 'wr')][1], F = 1.25;
  const hr = (dy, rx, rz, cz, c) => ({ y: W - dy * F, rx: rx * F, rz: rz * F, cz: cz * F, cx: x, sk: dy < 0.01 ? K2(side(s, 'el'), side(s, 'wr'), 0.8) : wr, c });
  loft(mb, [hr(0.0, 0.046, 0.042, 0, skinShade(sk, 0.8)), hr(0.03, 0.062, 0.05, 0.004, sk), hr(0.075, 0.068, 0.054, 0.01, lite(sk, 0.03)), hr(0.11, 0.05, 0.04, 0.014, skinShade(sk, 0.92))], { n: 6, caps: 'bt', sq: 0.8, capCol: skinShade(sk, 0.9) });
  ball(mb, [x - s * 0.07, W - 0.075 * F, 0.04], [0.03, 0.045, 0.03], lite(sk, 0.04), wr, { detail: 0, rot: [0.5, 0, s * 0.35], nh: true });
  [-0.03, 0.0, 0.03].forEach((u) => mb.poly([[x + u * F - 0.004, W - 0.075 * F, 0.074 * F], [x + u * F + 0.004, W - 0.075 * F, 0.074 * F], [x + u * F + 0.004, W - 0.105 * F, 0.066 * F], [x + u * F - 0.004, W - 0.105 * F, 0.066 * F]], skinShade(sk, 0.72), wr, [0, 0, 1], { flat: false, nh: true }));
}
import { mat } from './char_geo.js';

// leg skin rings (hip y=.46 to ankle .085)
const LEG_Y = [0.47, 0.37, 0.27, 0.19, 0.1];
const legSk = (s, y) => (y > 0.33 ? K(side(s, 'th')) : y > 0.22 ? K2(side(s, 'th'), side(s, 'kn'), (0.33 - y) / 0.11) : y > 0.14 ? K(side(s, 'kn')) : K2(side(s, 'kn'), side(s, 'an'), 0.5));
export const legSkin = legSk;
export const legRad = (y) => (y > 0.4 ? 0.082 : y > 0.3 ? 0.074 : y > 0.22 ? 0.066 : 0.056);
export function buildLegs(mb, ctx, d, legEndY, showFoot) {
  const sk = ctx.skin;
  [1, -1].forEach((s) => {
    const rings = []; LEG_Y.forEach((y) => { if (y > legEndY + 0.05) return; rings.push({ y, rx: legRad(y), rz: legRad(y), cx: s * d.hipX, sk: legSk(s, y), c: y < 0.15 ? skinShade(sk, 0.8) : sk }); });
    if (rings.length >= 2) loft(mb, rings, { n: 6, caps: 'bt' });
  });
}
export function restDims(body) { const d = dims(body); return { d, rest: restWorld(d) }; }
void THREE; void box; void tube; void sstep; void shade; void BI; void MB;
