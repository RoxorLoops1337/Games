// CHARACTER HAIR AND HATS. Both are built on headShell(): a conforming shell over the faceted head with a per-angle hairline.
// th = angle from +z (front) toward +x (character left). t = 0 at the hairline, 1 at the crown.
// FIT RULES (tests/beatbox_heroes_hair3d.test.mjs audits every hair x hat):
//   shells clear the head's ring ridges (no scalp poking through thin cuts) and close their hairline edge down to the scalp (skirt), so hair never floats as a hollow cap;
//   under a covering hat (HAT_COVER >= 0.7) the hair is cut at the hat's lower edge and squeezed inside the hat (hatFit: ray casts against the hat's own dome),
//   tails, braids and pigtails start below that edge, and crown pieces (buns, spikes, curls) hide; band hats (headband, crown, visor, cat ears, earmuffs) ride on the hair surface (hairSurf).
import { C, mix, mixS, shade, lite, liteL, K, K2, MB, ball, strand, lerp, clamp, sstep } from './char_geo.js';
import { HY, HEAD_TOP, HN, HA0, SQ, HR, headP, ringAt, buildHead } from './char_body.js';

const absA = (th) => { let a = th % (Math.PI * 2); if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return Math.abs(a); };
const front = (th) => Math.max(0, Math.cos(th));
const kf = (keys, a) => { for (let i = 0; i < keys.length - 1; i++) if (a <= keys[i + 1][0]) { const t = (a - keys[i][0]) / (keys[i + 1][0] - keys[i][0]); return lerp(keys[i][1], keys[i + 1][1], t); } return keys[keys.length - 1][1]; };
const CENTRE = [0, 0.3, -0.01], CEN = [0, HY + 0.3, -0.01];
const T_TOP = 0.565;
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len3 = (a) => Math.hypot(a[0], a[1], a[2]), nrm3 = (a) => { const l = len3(a) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; }, dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const addS = (a, d, s) => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s];

// ------------------------------------------------------------------ ray casts against a triangle soup (MB.P layout: 9 floats per triangle). Hits are [t, facing] sorted by t; facing > 0: the ray leaves through the triangle's front
function hits(P, o, d) {
  const out = [];
  for (let i = 0; i < P.length; i += 9) {
    const ax = P[i], ay = P[i + 1], az = P[i + 2], e1x = P[i + 3] - ax, e1y = P[i + 4] - ay, e1z = P[i + 5] - az, e2x = P[i + 6] - ax, e2y = P[i + 7] - ay, e2z = P[i + 8] - az;
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az, u = (sx * px + sy * py + sz * pz) * inv; if (u < -1e-6 || u > 1 + 1e-6) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < -1e-6 || u + v > 1 + 1e-6) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t <= 1e-6) continue;
    out.push([t, (e1y * e2z - e1z * e2y) * d[0] + (e1z * e2x - e1x * e2z) * d[1] + (e1x * e2y - e1y * e2x) * d[2]]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
// distance from the head centre to the faceted head mesh along d (the real triangles, ears and nose included; every head shares one shape)
let HEADP = null;
function headR(d) {
  if (!HEADP) { const m = new MB(9); buildHead(m, { skin: C('#c68b5e') }); HEADP = m.P; }
  const h = hits(HEADP, CEN, d); if (h.length) return h[h.length - 1][0];
  const e = 2 / SQ, inside = (x, y, z) => { y -= HY; if (y < 0.02 || y > HEAD_TOP) return false; const r = ringAt(y); return Math.pow(Math.abs(x) / r.rx, e) + Math.pow(Math.abs(z - r.cz) / r.rz, e) < 1; };
  let lo = 0, hi = 0.8; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (inside(CEN[0] + d[0] * m, CEN[1] + d[1] * m, CEN[2] + d[2] * m)) lo = m; else hi = m; } return lo;
}
// outermost surface (hair shell tris P if given, else the head) along d from the head centre
function surfT(P, d) { let t = headR(d); if (P) { const h = hits(P, CEN, d); if (h.length && h[h.length - 1][0] > t) t = h[h.length - 1][0]; } return t; }
const dirTo = (th, y) => { const p = headP(th, clamp(y, 0.03, 0.585)); return nrm3([p[0] - CEN[0], HY + y - CEN[1], p[2] - CEN[2]]); };

// shell over the head. o: cols, rows, yb(th), thick(th,t), lift(th,t), col(th,t), sk(th,t), apexLift, nh, flat, jag, hangScale,
//   fit (covering hat: the shell stops just inside its lower edge and is squeezed under it), gap (clearance under the hat), skirt (close the hairline edge down to the scalp), clear (ridge clearance)
// returns the grid G (G.apex: top point, null when the shell has no top fan)
export function headShell(mb, o) {
  const cols = o.cols || HN, rows = o.rows || 3, a0 = Math.PI / cols, G = [], TS = [], fit = o.fit || null, gap = o.gap === undefined ? 0.008 : o.gap, clear = o.clear === undefined ? 0.005 : o.clear, cz07 = ringAt(0.07).cz;
  for (let i = 0; i < cols; i++) {
    const th = a0 + (i / cols) * Math.PI * 2, yb = o.yb(absA(th)) + (o.jag ? ((i * 5) % 3 - 1) * o.jag : 0), rim = fit ? fit.rim(th) : null, yTop = rim === null ? T_TOP : clamp(rim + (o.tuck || 0.03), yb + 0.002, T_TOP), col = [], ts = [];
    for (let j = 0; j <= rows; j++) {
      const y = lerp(yb, yTop, j / rows), t = clamp((y - yb) / (T_TOP - yb), 0, 1), hang = y < 0.07;
      let p0 = headP(th, hang ? 0.07 : y); if (hang) p0 = [p0[0] * (o.hangScale || 1), y, p0[2]];
      let nx, ny, nz; if (hang) { const l = Math.hypot(p0[0], p0[2] - cz07) || 1; nx = p0[0] / l; ny = 0; nz = (p0[2] - cz07) / l; } else { const dx = p0[0] - CENTRE[0], dy = y - CENTRE[1], dz = p0[2] - CENTRE[2], l = Math.hypot(dx, dy, dz) || 1; nx = dx / l; ny = dy / l; nz = dz / l; }
      const th2 = o.thick(th, t), lf = o.lift ? o.lift(th, t) : 0, b = [p0[0], HY + y, p0[2]], P = [b[0] + nx * th2, b[1] + ny * th2 + lf, b[2] + nz * th2];
      P.b = b; P.n = [nx, ny, nz]; P.hang = hang; P.y = y; col.push(P); ts.push(t);
    }
    col.th = th; col.rim = rim; G.push(col); TS.push(ts);
  }
  const push = (P, s) => { P[0] += P.n[0] * s; P[1] += P.n[1] * s; P[2] += P.n[2] * s; };
  // ridge clearance: a chord between two rows must not dip under the head's ring edges (thin cuts showed scalp stripes)
  for (const col of G) for (let j = 0; j < col.length - 1; j++) {
    const A = col[j], B = col[j + 1]; if (A.hang || B.hang) continue;
    for (const r of HR) { if (r.y <= A.y || r.y >= B.y) continue; const H = headP(col.th, r.y), Ha = [H[0], HY + r.y, H[2]], d = nrm3(sub3(Ha, CEN)), need = len3(sub3(Ha, CEN)) + clear, X = segRay(A, B, d), have = dot3(sub3(X, CEN), d); if (have < need) { push(A, need - have); push(B, need - have); } }
  }
  let apex = null;
  if (!fit) {
    let ax = 0, ay = 0, az = 0; for (let i = 0; i < cols; i++) { const p = G[i][rows]; ax += p[0] / cols; ay += p[1] / cols; az += p[2] / cols; }
    apex = [ax, ay + 0.014 + (o.apexLift || 0), az];
    // the top fan must clear the head's last ring and its tip
    let need = HY + HEAD_TOP + clear - apex[1]; for (const col of G) { const T0 = col[rows], H = headP(col.th, 0.585), Ha = [H[0], HY + 0.585, H[2]], d = nrm3(sub3(Ha, CEN)), X = segRay(T0, apex, d), def = len3(sub3(Ha, CEN)) + clear - dot3(sub3(X, CEN), d); if (def > 0) need = Math.max(need, def * 2.2); }
    if (need > 0) apex[1] += need;
  }
  // squeeze under a covering hat: every vertex stays gap inside the hat's last surface along its own ray; below the lower edge the hair may flare out again gradually
  if (fit) for (const col of G) {
    const offR = col.rim === null ? null : fit.lim(dirTo(col.th, col.rim + 0.004)) - headR(dirTo(col.th, col.rim)) - gap;
    for (const P of col) {
      for (let it = 0; it < 3; it++) { const v = sub3(P, CEN), L = fit.lim(nrm3(v)), have = len3(v); if (!(L < 9) || have <= L - gap) break; const bo = len3(sub3(P, P.b)), want = Math.max(0.003, bo - (have - (L - gap))); scaleTo(P, want); }
      if (offR !== null && !P.hang && P.y < col.rim) { const mx = Math.max(0.004, offR + 0.9 * (col.rim - P.y)), bo = len3(sub3(P, P.b)); if (bo > mx) scaleTo(P, mx); }
    }
  }
  const ca = (th, t) => (o.col ? C(o.col(th, t)) : C('#ff00ff')), sa = (th, t) => (o.sk ? o.sk(th, t) : K('head')), nh = !!o.nh;
  for (let i = 0; i < cols; i++) {
    const i2 = (i + 1) % cols, thm = (G[i].th + G[i].th + (Math.PI * 2) / cols) / 2;
    for (let j = 0; j < rows; j++) {
      const A = G[i][j], B = G[i2][j], Cc = G[i2][j + 1], D = G[i][j + 1], t0 = TS[i][j], t1 = TS[i][j + 1], hint = [(A[0] + B[0]) / 2, (A[1] + D[1]) / 2 - HY - 0.3, (A[2] + B[2]) / 2 + 0.01];
      // under a covering hat the hair near and above its edge rides the head rigidly (a spring there would push it through the hat)
      const rig = (P) => o.rigid || fit && G[i].rim !== null && P.y > G[i].rim - 0.07, stripe = o.flatHair ? 1 : (i % 2 ? 0.93 : 1.04), c0 = ca(thm, t0).multiplyScalar(stripe), c1 = ca(thm, t1).multiplyScalar(stripe), s0 = rig(A) ? K('head') : sa(thm, t0), s1 = rig(D) ? K('head') : sa(thm, t1);
      mb.triH(A, B, Cc, hint, c0, c0, c1, s0, s0, s1, nh, o.flat); mb.triH(A, Cc, D, hint, c0, c1, c1, s0, s1, s1, nh, o.flat);
    }
    if (apex) { const top0 = G[i][rows], top1 = G[i2][rows], ct = ca(thm, 1), st = sa(thm, 1); mb.triH(apex, top0, top1, [0, 1, 0], ct, ct, ct, st, st, st, nh, o.flat); }
    // skirt: the hairline edge folds down to the scalp, so the shell reads as a solid volume and never as a hollow lid
    if (o.skirt) {
      const A = G[i][0], B = G[i2][0]; const oa = len3(sub3(A, A.b)), ob = len3(sub3(B, B.b)); if (A.hang || B.hang || oa < 0.009 && ob < 0.009) continue;
      const Ai = addS(A.b, A.n, 0.0015), Bi = addS(B.b, B.n, 0.0015), m0 = headP(thm, Math.max(0.07, A.y - 0.03)), m1 = headP(thm, A.y), hint = nrm3([m0[0] - m1[0], m0[1] - m1[1] - 0.004, m0[2] - m1[2]]);
      const cs = ca(thm, 0).multiplyScalar(oa + ob > 0.04 ? 0.72 : 0.96), s0 = sa(thm, 0), kh = K('head');
      mb.triH(A, B, Bi, hint, cs, cs, cs, s0, s0, kh, true, o.flat); mb.triH(A, Bi, Ai, hint, cs, cs, cs, s0, kh, kh, true, o.flat);
    }
  }
  G.apex = apex; return G;
}
function scaleTo(P, off) { const v = sub3(P, P.b), l = len3(v) || 1e-9; P[0] = P.b[0] + v[0] / l * off; P[1] = P.b[1] + v[1] / l * off; P[2] = P.b[2] + v[2] / l * off; }
// point on segment AB closest to the ray CEN + s d
function segRay(A, B, d) {
  const u = sub3(B, A), w = sub3(A, CEN), a = dot3(u, u), b = dot3(u, d), c = 1, dd = dot3(u, w), e = dot3(d, w), den = a * c - b * b;
  const s = den > 1e-12 ? clamp((b * e - c * dd) / den, 0, 1) : 0; return addS(A, u, s);
}

// ------------------------------------------------------------------ hat fit (covering hats) and hair surface (band hats), both cached
const FIT = {};
function hatFit(id) {
  if (!((HAT_COVER[id] || 0) >= 0.7)) return null; if (FIT[id]) return FIT[id];
  const m = new MB(3); buildHat(m, new MB(4), { look: { hat: { id, color: '#888888' } }, fitOnly: true });
  const P = m.P, rimC = {}, any = (th, y) => hits(P, CEN, dirTo(th, y)).length > 0;
  const lim = (d) => { const h = hits(P, CEN, d); for (let k = h.length - 1; k >= 0; k--) if (h[k][1] > 0) return h[k][0]; return Infinity; };
  const rim = (th) => { const k = th.toFixed(4); if (k in rimC) return rimC[k]; let r = null; for (let y = -0.12; y <= 0.62; y += 0.01) if (any(th, y)) { let lo = y - 0.01, hi = y; for (let i = 0; i < 6; i++) { const md = (lo + hi) / 2; if (any(th, md)) hi = md; else lo = md; } r = hi; break; } rimC[k] = r; return r; };
  return (FIT[id] = { P, lim, rim });
}
const SURF = {};
function hairSurf(style) {
  if (SURF[style]) return SURF[style];
  const shell = new MB(5), extra = new MB(6); buildHair(extra, { look: { hair: { style }, hat: { id: 'none' } }, skin: C('#c68b5e') }, 0, shell);
  let top = HY + HEAD_TOP; for (const P of [shell.P, extra.P]) for (let i = 1; i < P.length; i += 3) top = Math.max(top, P[i]);
  return (SURF[style] = { P: style === 'bald' ? null : shell.P, top });
}
// point on the outer surface (head or hair shell) at angle th and head-local height y, pushed out by e along the horizontal from the head axis
function ride(sf, th, y, e) {
  const r = ringAt(y), O = [0, HY + y, r.cz], hp = headP(th, y), d = nrm3([hp[0], 0, hp[2] - r.cz]); let t = Math.hypot(hp[0], hp[2] - r.cz);
  if (sf && sf.P) { const h = hits(sf.P, O, d); if (h.length && h[h.length - 1][0] > t) t = h[h.length - 1][0]; }
  const p = addS(O, d, t + e); p.d = d; return p;
}
// a closed ring band riding the surface between head-local heights y0 and y1 (outer wall, inner lining, top and bottom lips)
// colTop: the top lip (a lighter stitched edge), default the band colour
function bandRing(mb, sf, y0, y1, e, n, col, colIn, a0, skf, colTop) {
  const sk = skf || K('head'), A = [], B = [], Ai = [], Bi = [];
  for (let i = 0; i < n; i++) { const th = (a0 || 0) + (i / n) * Math.PI * 2; A.push(ride(sf, th, y0, e)); B.push(ride(sf, th, y1, e)); Ai.push(ride(sf, th, y0, -0.006)); Bi.push(ride(sf, th, y1, -0.006)); }
  const cI = C(colIn || shade(col, 0.6)), cO = C(col), cT = colTop ? C(colTop) : cO;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n, out = nrm3([A[i].d[0] + A[i2].d[0], 0, A[i].d[2] + A[i2].d[2]]);
    mb.triH(A[i], A[i2], B[i2], out, cO, cO, cO, sk, sk, sk); mb.triH(A[i], B[i2], B[i], out, cO, cO, cO, sk, sk, sk);
    mb.triH(B[i], B[i2], Bi[i2], [0, 1, 0], cT, cT, cI, sk, sk, sk, true); mb.triH(B[i], Bi[i2], Bi[i], [0, 1, 0], cT, cI, cI, sk, sk, sk, true);
    mb.triH(A[i], A[i2], Ai[i2], [0, -1, 0], cI, cI, cI, sk, sk, sk, true); mb.triH(A[i], Ai[i2], Ai[i], [0, -1, 0], cI, cI, cI, sk, sk, sk, true);
  }
  return { A, B };
}

// ------------------------------------------------------------------ hairlines
const HL = {
  high: (a) => kf([[0, 0.45], [0.5, 0.44], [1.0, 0.38], [1.5, 0.31], [2.0, 0.27], [2.6, 0.21], [3.15, 0.18]], a),
  fringe: (a) => kf([[0, 0.38], [0.5, 0.385], [1.0, 0.36], [1.5, 0.3], [2.0, 0.26], [2.6, 0.2], [3.15, 0.18]], a),
  faded: (a) => kf([[0, 0.45], [0.5, 0.45], [1.0, 0.41], [1.5, 0.37], [2.0, 0.35], [2.6, 0.32], [3.15, 0.3]], a),
  bob: (a) => kf([[0, 0.39], [0.6, 0.38], [1.0, 0.2], [1.5, 0.0], [2.2, -0.04], [3.15, -0.05]], a),
  long: (a) => kf([[0, 0.4], [0.6, 0.39], [1.0, 0.15], [1.4, -0.12], [2.2, -0.34], [3.15, -0.36]], a),
};

// fringe blades along the front hairline: hair, not a swim cap. Roots tuck under the shell edge (rootOff below its outer surface), tips lie close to the forehead
// tip: dyed ends (look.hair.tip), the blade tips take it like the 2D fringe ends do
function fringe(mb, base, hi, yb, n, len, spread, rootOff, fit, tip) {
  const K_h = K('head');
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, th = (t - 0.5) * 2 * spread, w = spread * 2 / n * 0.5, rim = fit ? fit.rim(th) : null; let y0 = yb(Math.abs(th)) + 0.022; if (rim !== null) { if (rim < yb(Math.abs(th)) + 0.025) continue; y0 = Math.min(y0, rim - 0.012); }
    const yt = yb(Math.abs(th)) - len * (0.7 + 0.5 * ((k * 7) % 3) / 2) * (1 - 0.35 * Math.abs(th) / Math.max(0.5, spread));
    const out = (a, y, e) => { const d = dirTo(a, y); return addS(CEN, d, headR(d) + e); };
    // root pair, a mid pair lying on the forehead (a flat blade would cut into the curved brow), the tip
    const ym = (y0 + yt) / 2, A = out(th - w, y0, rootOff), B = out(th + w, y0, rootOff), L = out(th - w * 0.6, ym, 0.011), R = out(th + w * 0.6, ym, 0.011), M = out(th, yt, 0.009);
    const c0 = mix(base, hi, 0.05 + 0.2 * ((k * 3) % 2)), cm = tip ? mix(c0, tip, 0.55) : mix(c0, shade(base, 0.85), 0.5), hint = nrm3(sub3(L, CEN)), ct = tip ? shade(tip, 0.92) : shade(base, 0.85);
    mb.triH(A, B, R, hint, c0, c0, cm, K_h, K_h, K_h); mb.triH(A, R, L, hint, c0, cm, cm, K_h, K_h, K_h); mb.triH(L, R, M, hint, cm, cm, ct, K_h, K_h, K_h);
  }
}
// a strip lying on the shell surface (part line), points found by casting onto the shell
function partLine(mb, shellP, px, col) {
  const K_h = K('head'), ys = [0.44, 0.49, 0.54, 0.575], pts = ys.map((y) => { const r = ringAt(y), th = Math.asin(clamp(px / r.rx, -0.99, 0.99)), d = dirTo(th, y); return addS(CEN, d, surfT(shellP, d) + 0.003); });
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], up = nrm3(sub3(a, CEN)); mb.triH([a[0] - 0.008, a[1], a[2]], [a[0] + 0.008, a[1], a[2]], [b[0] + 0.006, b[1], b[2]], up, col, col, col, K_h, K_h, K_h, true, true); mb.triH([a[0] - 0.008, a[1], a[2]], [b[0] + 0.006, b[1], b[2]], [b[0] - 0.006, b[1], b[2]], up, col, col, col, K_h, K_h, K_h, true, true); }
}
// pyramid spike rooted inside the surface along d (base square perpendicular to d), tip leaning by lean
function spike(mb, shellP, d, b, ht, lean, cb, ct) {
  const K_h = K('head'), c = addS(CEN, d, surfT(shellP, d) - 0.012), e1 = nrm3(Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [d[2], 0, -d[0]]), e2 = nrm3([d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]]);
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [c[0] + (e1[0] * u + e2[0] * v) * b, c[1] + (e1[1] * u + e2[1] * v) * b, c[2] + (e1[2] * u + e2[2] * v) * b]), up = nrm3(addS(d, lean, 1)), tp = addS(c, up, ht + 0.012);
  for (let q = 0; q < 4; q++) { const a = pts[q], bb = pts[(q + 1) % 4]; mb.triH(tp, a, bb, sub3([(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2, (a[2] + bb[2]) / 2], c), ct, cb, cb, K_h, K_h, K_h); }
}
// a ray from the head centre toward head-local direction (x, y, z offsets from the centre)
const dirV = (x, y, z) => nrm3([x, y, z]);

// per-style recipe. returns nothing, adds into mb. shellOut (optional MB) receives the main shell instead of mb (hairSurf uses it)
export function buildHair(mb, ctx, hatCover, shellOut) {
  const look = ctx.look, h = look.hair || {}, style = h.style || 'crop', base = C(h.color || '#2a2024'), tip = h.tip ? C(h.tip) : null, sk = ctx.skin || C('#c68b5e');
  if (style === 'bald') return; void hatCover;
  const hatId = (look.hat && look.hat.id) || 'none', fit = hatFit(hatId), capped = !!fit, K_h = K('head'), hi = lite(base, 0.12);
  const colF = (th, t) => { let c = mix(shade(base, 0.82), hi, sstep(0, 1, t)); if (tip) c = c.lerp(tip, sstep(0.55, 0.0, t) * 0.9); return c; };
  // dyed ends on the lower edge of a top block (fades, high-top, undercut, top knot): the 2D tints the bottom of that block, not the faded sides
  const tipBand = (c, t, t0, t1) => (tip ? c.lerp(tip, sstep(t0 - 0.14, t0, t) * sstep(t1 + 0.2, t1, t) * 0.9) : c), toTip = (c, w) => (tip ? C(c).lerp(tip, w) : C(c));
  let shell = null;
  const S = (o) => { const tg = shellOut || mb, p0 = tg.P.length, G = headShell(tg, Object.assign({ col: colF, sk: () => K_h, jag: 0.014, fit, skirt: true, rigid: hatId === 'hood' }, o)); shell = tg.P.slice(p0); return G; };
  const fade = (th, t) => mix(sk, base, sstep(0.0, 0.8, t) * 0.92), fadeT = (th, t) => tipBand(fade(th, t), t, 0.32, 0.55);
  const rimAt = (th) => (fit ? fit.rim(th) : null), below = (th, y, m) => { const r = rimAt(th); return r === null ? y : Math.min(y, r - (m || 0.03)); };
  const onShell = (d, e) => addS(CEN, d, surfT(shell, d) + (e || 0));
  // hanging pieces (tails, braids): root inside the hair at head-local direction d, then the path, all as a parallel transported strand
  const root = (th, y, e) => onShell(dirTo(th, y), e === undefined ? -0.02 : e);
  // spring weight of hanging pieces: full without a hat, half under a covering hat, none under the hood (it hangs around them)
  const swing = !fit ? 1 : hatId === 'hood' ? 0 : 0.5, sw = (a, b, w) => K2(a, b, w * swing);
  // long shells sway on the side and back springs below t0; the front (face framing) stays on the head (the back spring pivots behind the skull and threw the fringe forward)
  const hangSk = (th, t, t0, w) => { if (t >= t0 || Math.cos(th) > 0.35) return K_h; const side = Math.abs(Math.sin(th)) > 0.6; return K2('head', side ? (Math.sin(th) > 0 ? 'hairSL' : 'hairSR') : 'hairB', (1 - t / t0) * w * (side && Math.cos(th) > 0 ? 0.6 : 1)); };
  switch (style) {
    case 'buzz': S({ yb: HL.high, rows: 3, thick: () => 0.012, col: (th, t) => mix(mix(sk, base, 0.7), base, t) }); break;
    case 'crop': S({ yb: HL.fringe, rows: 3, thick: (th, t) => 0.028 + 0.025 * Math.sin(t * Math.PI * 0.5) + 0.02 * front(th) * t }); fringe(mb, base, hi, HL.fringe, 6, 0.07, 0.85, 0.018, fit, tip); break;
    case 'sidepart': S({ yb: HL.fringe, rows: 4, thick: (th, t) => 0.03 + 0.03 * Math.sin(t * Math.PI * 0.5) + (th > 0 && th < 1.5 ? 0.035 * t : 0) }); fringe(mb, base, hi, HL.fringe, 5, 0.06, 0.8, 0.02, fit, tip); if (!capped) partLine(mb, shell, 0.09, shade(base, 0.5)); break;
    case 'quiff': S({ yb: HL.high, rows: 5, thick: (th, t) => 0.03 + 0.03 * t + 0.05 * Math.pow(front(th), 2) * t * t, lift: (th, t) => 0.05 * Math.pow(front(th), 2) * t * t }); break;
    case 'undercut': S({ yb: (a) => Math.max(HL.high(a), 0.36), rows: 4, thick: (th, t) => (t < 0.35 ? 0.011 : 0.05 + 0.03 * t), col: (th, t) => (t < 0.3 ? mix(mix(sk, base, 0.5), base, t / 0.3) : tipBand(colF(th, t), t, 0.36, 0.5)) }); break;
    case 'fade': case 'fadewave': case 'hightop': {
      const tall = style === 'hightop', wave = style === 'fadewave';
      S({ yb: HL.faded, rows: 5, thick: (th, t) => Math.max(0.01, 0.012 + (tall ? 0.085 : 0.045) * sstep(0.25, 0.8, t) + (wave ? 0.01 * Math.sin(t * 19) : 0)), lift: (th, t) => (tall ? 0.07 : 0) * sstep(0.5, 1, t), col: (th, t) => (wave ? tipBand(mix(fade(th, t), shade(base, 0.8 + 0.2 * Math.sin(t * 19 + th * 3) * 0.5 + 0.1), 0.25), t, 0.3, 0.42) : tipBand(fade(th, t), t, 0.3, 0.42)), apexLift: tall ? 0.07 : 0 }); break;
    }
    case 'waves': S({ yb: HL.fringe, rows: 6, thick: (th, t) => 0.035 + 0.025 * t + 0.006 * Math.sin(t * 22), col: (th, t) => mix(colF(th, t), shade(base, 0.75), 0.5 + 0.5 * Math.sin(t * 22 + 1)) }); fringe(mb, base, hi, HL.fringe, 5, 0.05, 0.8, 0.022, fit, tip); break;
    case 'curly': {
      // curls are clumps sitting half inside the shell surface; under a hat only the ones below its edge stay
      S({ yb: HL.fringe, rows: 4, thick: (th, t) => 0.045 + 0.04 * t });
      const ring = (n, y, r, ph) => { for (let i = 0; i < n; i++) { const th = ph + (i / n) * Math.PI * 2; if (front(th) > 0.8 && y < 0.45) continue; const rm = rimAt(th); if (rm !== null && y > rm - r * 0.6) continue; const d = dirTo(th, y), c = onShell(d, -r * 0.45); ball(mb, c, [r, r * 0.9, r], toTip(mix(base, hi, ((i + Math.round(y * 10)) % 3) / 4), y < 0.45 ? 0.75 : 0.2), K_h, { detail: 0, jit: 0.015 }); } };
      ring(8, 0.41, 0.075, HA0); ring(5, 0.51, 0.08, 0.2); if (!capped) ball(mb, onShell(dirV(0, 1, -0.08), -0.035), [0.09, 0.07, 0.09], hi, K_h, { detail: 0, jit: 0.015 });
      break;
    }
    case 'afro': {
      // under a covering hat the afro is squeezed: less volume, so it puffs out below the hat instead of standing off it like a lampshade
      const vol = capped ? 0.62 : 1; S({ cols: 16, yb: (a) => kf([[0, 0.46], [0.6, 0.45], [1.2, 0.3], [2.0, 0.12], [3.15, 0.06]], a), rows: 5, thick: (th, t) => 0.03 + (0.175 - 0.03) * vol * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5), 0.7) * (front(th) > 0.5 ? 0.55 + 0.45 * t : 1), apexLift: 0.03 }); break;
    }
    case 'bob': S({ yb: HL.bob, rows: 5, hangScale: 1.04, thick: (th, t) => (0.05 + 0.03 * Math.sin(t * Math.PI * 0.5)) * (t < 0.3 ? 0.9 : 1) + (t < 0.2 ? 0.03 : 0), sk: (th, t) => hangSk(th, t, 0.6, 0.8) }); fringe(mb, base, hi, HL.bob, 7, 0.07, 0.9, 0.03, fit, tip); break;
    case 'long': {
      // over a backpack the back of the hair falls outside the pack instead of through it
      const pack = look.acc && look.acc.back && look.acc.back.id === 'backpack' ? 0.075 : 0;
      S({ yb: HL.long, rows: 7, hangScale: 1.03, thick: (th, t) => 0.05 + 0.025 * Math.sin(t * Math.PI * 0.5) + (t < 0.4 ? 0.025 : 0) + pack * Math.pow(Math.max(0, -Math.cos(th)), 1.5) * sstep(0.48, 0.26, t), sk: (th, t) => hangSk(th, t, 0.7, 0.9) }); fringe(mb, base, hi, HL.long, 7, 0.07, 0.9, 0.03, fit, tip); if (!capped) partLine(mb, shell, 0.0, shade(base, 0.5)); break;
    }
    case 'mullet': S({ yb: (a) => kf([[0, 0.42], [1.0, 0.36], [1.8, 0.2], [2.6, -0.05], [3.15, -0.12]], a), rows: 5, thick: (th, t) => 0.035 + 0.03 * t, sk: (th, t) => (t < 0.5 && absA(th) > 1.9 ? K2('head', 'hairB', 1 - t / 0.5) : K_h) }); break;
    case 'ponytail': {
      S({ yb: HL.fringe, rows: 4, thick: (th, t) => 0.03 + 0.025 * t }); fringe(mb, base, hi, HL.fringe, 8, 0.06, 1.2, 0.018, fit, tip);
      const y0 = below(Math.PI, 0.45, 0.1); if (y0 < 0.14) break;
      const R = root(Math.PI, y0, -0.025), z0 = R[2], rise = capped ? -0.015 : 0.02;
      const pts = [R, [0, R[1] + rise, z0 - 0.09], [0, R[1] - 0.1, z0 - 0.17], [0, R[1] - 0.27, z0 - 0.17], [0, R[1] - 0.45 + (capped ? 0.05 : 0), z0 - 0.13]];
      strand(mb, pts, [0.05, 0.068, 0.062, 0.045, 0.014], (t) => toTip(colF(0, t < 0.2 ? 0.8 : 0.5 + 0.3 * (1 - t)), sstep(0.4, 0.85, t) * 0.9), { n: 6, sk: (t) => (t < 0.25 ? K_h : t < 0.6 ? sw('head', 'hairB', 0.6) : swing ? K2('hairB', 'hairB2', swing) : K_h), tip: 0.035 });
      strand(mb, [addS(R, nrm3(sub3(pts[1], R)), 0.035), addS(R, nrm3(sub3(pts[1], R)), 0.065)], 0.064, C('#ff3ea5'), { n: 6, sk: K_h, capStart: true }); break;
    }
    case 'pigtails': {
      S({ yb: HL.fringe, rows: 4, thick: (th, t) => 0.03 + 0.025 * t }); fringe(mb, base, hi, HL.fringe, 8, 0.06, 1.2, 0.018, fit, tip);
      [1, -1].forEach((s) => {
        const th = s * 1.75, y0 = below(th, 0.4, 0.08); if (y0 < 0.14) return; const R = root(th, y0, -0.02), o = nrm3([R[0], 0, R[2] + 0.02]), P1 = [R[0] + o[0] * 0.08, R[1] - 0.005, R[2] + o[2] * 0.08], P2 = [P1[0] + s * 0.03, P1[1] - 0.13, P1[2] - 0.01], P3 = [P2[0] + s * 0.005, P2[1] - 0.15, P2[2] + 0.01];
        const bone = s > 0 ? 'hairSL' : 'hairSR'; strand(mb, [R, P1, P2, P3], [0.045, 0.058, 0.05, 0.016], (t) => toTip(colF(0, 0.4 + 0.6 * (1 - t)), sstep(0.4, 0.85, t) * 0.9), { n: 6, sk: (t) => sw('head', bone, clamp(t * 1.3, 0, 1)), tip: 0.03 });
        const tie = nrm3(sub3(P1, R)); strand(mb, [addS(R, tie, 0.045), addS(R, tie, 0.07)], 0.058, C('#ffd23f'), { n: 6, sk: sw('head', bone, 0.1) });
      });
      break;
    }
    case 'buns': {
      S({ yb: HL.high, rows: 4, thick: (th, t) => 0.022 + 0.02 * t }); fringe(mb, base, hi, HL.high, 9, 0.07, 1.25, 0.016, fit, tip); if (!capped) partLine(mb, shell, 0.0, shade(base, 0.5));
      if (!capped) [1, -1].forEach((s) => { const d = dirV(s * 0.15, 0.3, -0.04), sf = onShell(d, 0), r = 0.115, c = addS(sf, d, r * 0.55), bone = K(s > 0 ? 'puffL' : 'puffR'), tc = C('#ffd23f'); ball(mb, c, [r, r * 0.95, r], base, bone, { detail: 1, col2: hi, jit: 0.04 }); strand(mb, [addS(sf, d, -0.01), addS(sf, d, 0.03)], 0.074, tc, { n: 6, sk: bone }); });
      break;
    }
    case 'topknot': case 'dreadbun': {
      const dread = style === 'dreadbun'; S({ yb: HL.faded, rows: 4, thick: (th, t) => 0.012 + 0.045 * sstep(0.3, 0.8, t), col: fadeT });
      if (!capped) { const d = dirV(0, 1, dread ? -0.25 : -0.2), sf = onShell(d, 0), r = dread ? 0.1 : 0.088, c = addS(sf, d, r * 0.6); ball(mb, c, [r, r * 0.95, r], base, dread ? K('puffL') : K_h, { detail: 1, col2: hi, jit: dread ? 0.04 : 0.025 }); if (dread) [-1, 1].forEach((s) => strand(mb, [[c[0] + s * 0.05, c[1] - 0.02, c[2] - 0.04], [c[0] + s * 0.11, c[1] - 0.07, c[2] - 0.11], [c[0] + s * 0.14, c[1] - 0.14, c[2] - 0.13]], [0.02, 0.017, 0.012], (t) => toTip(base, sstep(0.3, 1, t) * 0.9), { n: 4, tip: 0.02, sk: K_h })); }
      break;
    }
    case 'braids': case 'locs': case 'twists': {
      const long = style === 'locs', tw = style === 'twists', cnt = tw ? 9 : long ? 11 : 8, len = tw ? 0.17 : long ? 0.34 : 0.3;
      S({ yb: HL.fringe, rows: 3, thick: (th, t) => 0.03 + 0.03 * t });
      for (let i = 0; i < cnt; i++) {
        const ang = Math.PI * (0.42 + 1.16 * (i + 0.5) / cnt); if (tw && Math.cos(ang) > 0.55) continue;
        const y0 = below(ang, (tw ? 0.36 : 0.32) + (i % 3) * 0.03, 0.025); if (y0 < 0.14) continue; const R = root(ang, y0, -0.012), ox = Math.sin(ang), oz = Math.cos(ang), dl = len * (0.8 + 0.4 * ((i * 37) % 10) / 10), hb = Math.abs(ox) > 0.55 ? (ox > 0 ? 'hairSL' : 'hairSR') : 'hairB';
        strand(mb, [R, [R[0] + ox * 0.03, R[1] - dl * 0.45, R[2] + oz * 0.03], [R[0] + ox * 0.045, R[1] - dl, R[2] + oz * 0.045]], tw ? [0.032, 0.03, 0.018] : [0.026, 0.024, 0.014], (t) => (tip ? mix(base, tip, t) : mix(base, hi, 0.2 + 0.25 * ((i % 3) / 2) - t * 0.1)), { n: tw ? 4 : 5, sk: (t) => sw('head', hb, clamp(t * 1.1, 0, 1)), tip: 0.025, a0: i, twist: tw ? 0.7 : long ? 0 : 0.5 });
      }
      // twists: short nubs on the crown that follow the surface
      if (tw && !capped) [1, -1].forEach((s) => [0, 1, 2].forEach((k) => { const a = s * (0.45 + k * 0.45), d = dirTo(a, 0.5), R = onShell(d, -0.012), up = nrm3(addS(d, [0, 1, 0], 0.6)); strand(mb, [R, addS(R, up, 0.06)], [0.026, 0.016], mix(base, hi, 0.2), { n: 4, tip: 0.02, sk: K_h, twist: 0.6, capStart: true }); }));
      break;
    }
    case 'cornrows': {
      // tight rows over a thin scalp shell: each row follows the skull from the front hairline to the nape
      S({ yb: HL.high, rows: 3, thick: () => 0.015, col: () => mix(sk, base, 0.5), jag: 0.006 });
      const rowCol = shade(base, 0.9), hl = lite(base, 0.08);
      [-0.6, -0.3, 0, 0.3, 0.6].forEach((x, ri) => {
        const pts = []; for (let k = 0; k <= 6; k++) { const ph = lerp(0.56, Math.PI + 0.42, k / 6), d = nrm3([x * (0.85 + 0.15 * Math.sin(ph)), Math.sin(ph), Math.cos(ph)]), p = onShell(d, 0.004), rm = rimAt(Math.atan2(d[0], d[2])); if (rm !== null && p[1] - HY > rm - 0.03) continue; pts.push(p); }
        if (pts.length >= 2) strand(mb, pts, 0.019, (t) => toTip(Math.round(t * 6) % 2 ? rowCol : hl, sstep(0.55, 1, t) * 0.85), { n: 3, sk: K_h, tip: 0.012, capStart: true, a0: ri * 0.3 });
      });
      [-0.1, 0.1].forEach((x) => { if (below(Math.PI, 0.28, 0.04) < 0.14) return; const R = root(Math.PI - x * 1.5, below(Math.PI, 0.28, 0.04), -0.01); strand(mb, [R, [R[0] * 1.15, R[1] - 0.11, R[2] - 0.035], [R[0] * 1.25, R[1] - 0.22, R[2] - 0.02]], [0.024, 0.021, 0.012], (t) => toTip(base, sstep(0.2, 1, t) * 0.9), { n: 4, tip: 0.02, sk: (t) => sw('head', 'hairB', t), twist: 0.6 }); });
      break;
    }
    case 'mohawk': {
      S({ yb: HL.faded, rows: 3, thick: () => 0.009, col: (th, t) => mix(sk, base, 0.6 + 0.2 * t) });
      if (!capped) for (let row = -1; row <= 1; row++) for (let k = 0; k < 8; k++) {
        const ph = lerp(0.95, 2.75, k / 7), d = nrm3([row * 0.2, Math.sin(ph), Math.cos(ph)]), ht = (0.19 + 0.05 * Math.sin(k * 1.3)) * (row ? 0.62 : 1) * (k === 0 || k === 7 ? 0.7 : 1), cl = mix(base, tip || hi, 0.0), ct = tip ? C(tip) : lite(base, 0.2);
        spike(mb, shell, d, row ? 0.034 : 0.042, ht, [0, 0.35, -0.25], cl, ct);
      }
      break;
    }
    case 'spiky': case 'flame': {
      S({ yb: HL.fringe, rows: 3, thick: (th, t) => 0.03 + 0.015 * t });
      if (!capped) { const n = style === 'flame' ? 9 : 11; for (let k = 0; k < n; k++) { const th = HA0 + (k / n) * Math.PI * 2 + 0.2, el = k === 0 ? 1.45 : 0.95 + (k % 3) * 0.08, d = k === 0 ? dirV(0, 1, -0.08) : nrm3([Math.sin(th) * Math.cos(el), Math.sin(el), Math.cos(th) * Math.cos(el)]), ht = (style === 'flame' ? 0.2 : 0.12) + 0.04 * ((k * 5) % 3), lean = style === 'flame' ? [0, 0.6, -0.15] : [0, 0.25, 0]; spike(mb, shell, d, 0.04, ht, lean, base, tip ? C(tip) : style === 'flame' ? mixS(base, '#ffe14d', 0.8) : lite(base, 0.25)); } }
      break;
    }
    default: S({ yb: HL.fringe, rows: 4, thick: (th, t) => 0.03 + 0.025 * t });
  }
}

// ------------------------------------------------------------------ hats
// HAT_COVER: how much of the head a hat covers. >= 0.7 covering hats (hair is squeezed under them), below that band hats (they ride on the hair), halo floats
export const HAT_COVER = { flatcap: 0.7, ivy: 0.7, fitted: 1, cap: 1, capback: 1, snapback: 1, trucker: 1, beanie: 1, bucket: 1, bucketfur: 1, durag: 1, bandana: 1, beret: 1, fedora: 1, cowboy: 1, tophat: 1, hood: 1, pirate: 1, wizard: 1, chef: 1, visor: 0.5, crown: 0.5, headphonehat: 0.5, catears: 0.5, headband: 0.4, halo: 0, none: 0 };
// hats whose shape follows the hair under them (their geometry depends on the hair style)
export const HAT_RIDES = { visor: 1, crown: 1, headphonehat: 1, catears: 1, headband: 1, halo: 1 };
// curved plate (brim): inner and outer rings, flat slab with both faces
function plate(mb, ring, outRing, colT, colB, sk, skO) {
  const n = ring.length, so = (i) => (skO ? skO : sk(i));
  for (let i = 0; i < n - 1; i++) {
    const a = ring[i], b = ring[i + 1], c = outRing[i + 1], d = outRing[i], hu = [0, 1, 0];
    mb.triH(a, b, c, hu, colT, colT, colT, sk(i), sk(i + 1), so(i + 1)); mb.triH(a, c, d, hu, colT, colT, colT, sk(i), so(i + 1), so(i));
    mb.triH(a, b, c, [0, -1, 0], colB, colB, colB, sk(i), sk(i + 1), so(i + 1)); mb.triH(a, c, d, [0, -1, 0], colB, colB, colB, sk(i), so(i + 1), so(i));
  }
}
function ringPts(y, grow, a0, a1, n, lift) {
  const out = []; for (let i = 0; i <= n; i++) { const th = lerp(a0, a1, i / n), p = headP(th, y), l = Math.hypot(p[0], p[2] - ringAt(y).cz) || 1; out.push([p[0] + (p[0] / l) * grow, HY + y + (lift ? lift(i / n) : 0), p[2] + ((p[2] - ringAt(y).cz) / l) * grow]); }
  return out;
}
// rimC: the colour of the brim's outer edge (gold trim, neon edge), default the top colour fading to the underside
function brim(mb, y, g0, g1, a0, a1, droop, colT, colB, skf, n, rimC) {
  const inner = ringPts(y, g0, a0, a1, n || 8), outer = ringPts(y, g1, a0, a1, n || 8, () => -droop), rT = rimC ? C(rimC) : colT, rB = rimC ? C(rimC) : colB; plate(mb, inner, outer, colT, colB, skf);
  for (let i = 0; i < (n || 8); i++) { const a = outer[i], b = outer[i + 1], th = 0.012; mb.triH(a, b, [b[0], b[1] - th, b[2]], [(a[0] + b[0]) * 0.5, 0, (a[2] + b[2]) * 0.5], rT, rT, rB, skf(i), skf(i + 1), skf(i + 1)); mb.triH(a, [b[0], b[1] - th, b[2]], [a[0], a[1] - th, a[2]], [(a[0] + b[0]) * 0.5, 0, (a[2] + b[2]) * 0.5], rT, rB, rB, skf(i), skf(i + 1), skf(i)); }
  return { inner, outer };
}
// cap bill: tongue shaped (longest at the centre), droops toward its tip. innerF(th) -> [point, outward dir] (default: the head ring at y grown by g0)
function brimTongue(mb, y, g0, w, mid, half, droop, colT, colB, skf, n, innerF, rimC) {
  const inner = [], outer = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, th = mid + (t - 0.5) * 2 * half, wv = w * Math.pow(Math.max(0, Math.cos((t - 0.5) * Math.PI * 0.92)), 0.55); let p, dx, dz;
    if (innerF) { const r = innerF(th); p = r; dx = r.d[0]; dz = r.d[2]; } else { const q = headP(th, y), cz = ringAt(y).cz, l = Math.hypot(q[0], q[2] - cz) || 1; dx = q[0] / l; dz = (q[2] - cz) / l; p = [q[0] + dx * g0, HY + y, q[2] + dz * g0]; }
    inner.push(p); outer.push([p[0] + dx * wv, p[1] - droop * (wv / w), p[2] + dz * wv]);
  }
  const skO = K2('head', 'brim', 1), rT = rimC ? C(rimC) : colT, rB = rimC ? C(rimC) : colB; plate(mb, inner, outer, colT, colB, skf, skO);
  for (let i = 0; i < n; i++) { const a = outer[i], b = outer[i + 1], th = 0.014, hint = [(a[0] + b[0]) * 0.5, 0, (a[2] + b[2]) * 0.5]; mb.triH(a, b, [b[0], b[1] - th, b[2]], hint, rT, rT, rB, skO, skO, skO); mb.triH(a, [b[0], b[1] - th, b[2]], [a[0], a[1] - th, a[2]], hint, rT, rB, rB, skO, skO, skO); }
  return { inner, outer, skO };
}
// a flat decal on a shell surface (logos, badges): centre found by casting along d, polygon pts given in the surface's tangent frame
function badge(mb, P, d, pts, col, lift) {
  const c = addS(CEN, d, surfT(P, d) + (lift || 0.004)), n = d, e1 = nrm3(Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [n[2], 0, -n[0]]), e2 = nrm3([n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]);
  mb.poly(pts.map(([u, v]) => [c[0] + e1[0] * u + e2[0] * v, c[1] + e1[1] * u + e2[1] * v, c[2] + e1[2] * u + e2[2] * v]), col, K('head'), n, { nh: true, flat: true });
}
// a decal lying on the quad A B C D (A-B along u, A-D along v): the sub rectangle [u0,u1] x [v0,v1] (or a diamond with dia), lifted off the quad along hint, so trims (buckles, studs, stickers) sit on the surface they belong to
function decal(mb, A, B, Cc, D, u0, u1, v0, v1, col, hint, o) {
  o = o || {}; const at = (u, v) => { const p = [0, 1, 2].map((k) => lerp(lerp(A[k], B[k], u), lerp(D[k], Cc[k], u), v)); return addS(p, hint, o.lift || 0.003); }, um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  const pts = o.dia ? [at(um, v0), at(u1, vm), at(um, v1), at(u0, vm)] : [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]; mb.poly(pts, col, o.sk || K('head'), hint, { nh: true, flat: true, centre: o.centre });
}
const quadN = (A, B, D) => nrm3([(B[1] - A[1]) * (D[2] - A[2]) - (B[2] - A[2]) * (D[1] - A[1]), (B[2] - A[2]) * (D[0] - A[0]) - (B[0] - A[0]) * (D[2] - A[2]), (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0])]);
const outN = (A, B, D, ref) => { const n = quadN(A, B, D); return dot3(n, ref) < 0 ? [-n[0], -n[1], -n[2]] : n; };
// seal: a lip from a ring of hat points (absolute) down to the scalp beneath them, so the hat sits on the head instead of floating over a visible gap
function seal(mb, ring, col, closed) {
  const K_h = K('head'), cc = C(col), n = ring.length, m = closed ? n : n - 1;
  const inner = ring.map((p) => { const d = nrm3(sub3(p, CEN)); return addS(CEN, d, headR(d) + 0.002); });
  for (let i = 0; i < m; i++) { const i2 = (i + 1) % n, a = ring[i], b = ring[i2], hint = nrm3([0, -1, 0].map((v, k) => v * 1.5 - (a[k] + b[k] - 2 * CEN[k]) * 0.2)); mb.triH(a, b, inner[i2], hint, cc, cc, cc, K_h, K_h, K_h, true); mb.triH(a, inner[i2], inner[i], hint, cc, cc, cc, K_h, K_h, K_h, true); }
}
// HAT COLOUR ZONES follow the 2D sprites (chars_hair.js HAT.*): every zone the 2D paints in a colour of its own (a lighter snapback panel, a trucker mesh, a dark fedora band,
// a gold buckle, a beanie cuff and pom, bandana dots, pink inner ears) is a zone here too, in the same derived colour (mixS mixes in sRGB like the 2D does).
// look.hat.color2, when a look carries one, recolours the hat's accent zone (HAT_ACCENT names it); without it the zone keeps the 2D's derived colour.
// the beanie cuff rings: head-local heights (bottom, rolled middle, top) and their offsets out of the head; the crown shell sits about 0.06 out, so the cuff stands 0.025 proud of it
export const BEANIE_CUFF = { y: [0.375, 0.414, 0.455], off: [0.082, 0.094, 0.086] };
export const HAT_ACCENT = { cap: 'button', capback: 'strap', fitted: 'emblem', snapback: 'panel', trucker: 'mesh', beanie: 'pom', bandana: 'dots', headband: 'stitch', beret: 'stem', fedora: 'band', cowboy: 'band', tophat: 'band', catears: 'inner ears', crown: 'gems', visor: 'bill', wizard: 'band', headphonehat: 'band', durag: 'ties', pirate: 'skull', hood: 'drawstrings', bucket: 'eyelets', chef: 'band', bucketfur: 'tufts' };
const hh = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) % 1000 / 1000; };
const circ = (r, n, ry) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2) * r, Math.sin(i / n * Math.PI * 2) * (ry || r)]);
export function buildHat(mb, glow, ctx) {
  const look = ctx.look, ht = look.hat || {}, id = ht.id || 'none'; if (id === 'none' || !HAT_COVER[id] && HAT_COVER[id] !== 0) return;
  const fitOnly = !!ctx.fitOnly, deco = !fitOnly, col = C(ht.color || '#17141f'), a2 = (def) => (ht.color2 ? C(ht.color2) : C(def)), lt = liteL, K_h = K('head'), GOLD = '#e8c050', INK2 = '#120d1f', WH = '#ffffff';
  const bs = () => K_h, sf = HAT_RIDES[id] ? hairSurf((look.hair && look.hair.style) || 'bald') : null;
  // dome: a hat shell over the head; returns { G, P } (its triangles, for casting badges onto it)
  const dome = (yb, thick, rows, extra) => { const p0 = mb.P.length, G = headShell(mb, Object.assign({ flatHair: 0, yb: typeof yb === 'function' ? yb : () => yb, rows: rows || 5, thick: (th, t) => (typeof thick === 'function' ? thick(th, t) : thick), col: (th, t) => mix(shade(col, 0.88), lt(col, 0.06), t), sk: () => K_h, apexLift: 0.0, skirt: deco, clear: 0.007 }, extra || {})); return { G, P: mb.P.slice(p0) }; };
  const capBill = (D, ybF, a0, a1, w, droop, rimC) => brimTongue(mb, 0, 0, w, (a0 + a1) / 2, (a1 - a0) / 2, droop, lt(col, 0.08), shade(col, 0.55), bs, 6, (th) => { const y = ybF(th) + 0.008, d = dirTo(th, y), q = addS(CEN, d, surfT(D.P, d) - 0.006), cz = ringAt(y).cz; q.d = nrm3([q[0], 0, q[2] - cz]); return q; }, rimC);
  const top = (D, r, c) => { const a = D.G.apex; ball(mb, [a[0], a[1] + r * 0.4, a[2]], [r, r * 0.75, r], c, K_h, { detail: 0 }); };
  // a quad of a band (lower ring L, upper ring U, facet i) with its outward normal, for buckles and studs
  const facet = (L, U, i, hint) => { const n = L.length, i2 = (i + 1) % n; return [L[i], L[i2], U[i2], U[i], outN(L[i], L[i2], U[i], hint || [L[i][0] + L[i2][0], 0, L[i][2] + L[i2][2] + 0.06])]; };
  const onFacet = (F, u0, u1, v0, v1, c, o) => decal(mb, F[0], F[1], F[2], F[3], u0, u1, v0, v1, c, F[4], o);
  switch (id) {
    case 'fitted': case 'cap': case 'snapback': case 'trucker': case 'capback': {
      // 2D: six panels in the hat colour with a lighter button; snapback: a lighter front panel with a yellow star; trucker: a coloured front panel over a pale mesh with a yellow logo;
      // fitted: a yellow gem emblem and a foil sticker on the bill; capback: the strap opening (dark, gold snaps) faces forward
      const back = id === 'capback', yb = back ? (th) => 0.425 - 0.04 * (1 + Math.cos(th)) * 0.5 : (th) => 0.425 - 0.07 * (1 - Math.cos(th)) * 0.5, th0 = 0.034;
      const panel = id === 'snapback' ? a2(mixS(col, WH, 0.28)) : null, mesh = id === 'trucker' ? a2(mixS(col, '#e8e0f0', 0.5)) : null;
      const D = dome(yb, (a, t) => th0 + 0.015 * Math.sin(t * Math.PI * 0.6), 4, { col: (a, t) => (mesh && Math.cos(a) < 0.55 ? mix(shade(mesh, 0.84), mesh, t) : panel && Math.cos(a) > 0.55 ? mix(shade(panel, 0.9), panel, t) : mix(shade(col, 0.86), lt(col, 0.08), t)) });
      if (!deco) break;
      top(D, 0.022, id === 'cap' ? a2(mixS(col, WH, 0.3)) : mixS(col, WH, 0.3));
      const a0 = back ? Math.PI - 1.05 : -1.05, a1 = back ? Math.PI + 1.05 : 1.05, B = capBill(D, yb, a0, a1, 0.2, 0.04);
      if (id === 'fitted') {
        badge(mb, D.P, dirTo(0, 0.5), [[0, 0.04], [0.026, 0], [0, -0.04], [-0.026, 0]], a2('#ffe14d'));
        const A = B.inner[4], Bb = B.inner[5], Cc = B.outer[5], Dd = B.outer[4]; decal(mb, A, Bb, Cc, Dd, 0.15, 0.85, 0.42, 0.78, C('#c9f0ff'), outN(A, Bb, Dd, [0, 1, 0]), { lift: 0.002, sk: B.skO, centre: '#ffffff' });
      }
      if (id === 'snapback') badge(mb, D.P, dirTo(0, 0.49), Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.016 : 0.038; return [Math.cos(a) * r, Math.sin(a) * r]; }), C('#ffe14d'), 0.005);
      if (id === 'trucker') { badge(mb, D.P, dirTo(0, 0.5), [[-0.04, 0.012], [-0.02, 0.03], [0, 0.012], [0.02, 0.03], [0.04, 0.012], [0.04, -0.008], [-0.04, -0.008]], C('#ffe14d'), 0.005); badge(mb, D.P, dirTo(0, 0.462), [[-0.034, -0.006], [0.034, -0.006], [0.034, 0.006], [-0.034, 0.006]], C('#fff7b0'), 0.005); }
      if (id === 'capback') { badge(mb, D.P, dirTo(0, 0.43), [[-0.055, -0.024], [0.055, -0.024], [0.055, 0.024], [-0.055, 0.024]], a2(mixS(col, INK2, 0.55))); badge(mb, D.P, dirTo(0, 0.43), [[-0.04, -0.007], [0.04, -0.007], [0.04, 0.007], [-0.04, 0.007]], C('#e8d28a'), 0.007); }
      break;
    }
    case 'flatcap': case 'ivy': {
      const yb = (a) => 0.405 + 0.03 * Math.cos(a) - 0.04 * (1 - Math.cos(a)) * 0.5, D = dome(yb, (th, t) => 0.04 + 0.03 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.5) + 0.03 * front(th) * t, 3, { lift: (th, t) => -0.045 * t * t, col: (th, t) => mix(shade(col, 0.82), lt(col, 0.08), t), apexLift: -0.03 });
      if (!deco) break;
      capBill(D, yb, -1.0, 1.0, 0.1, 0.012); top(D, 0.012, a2(lt(col, 0.18))); break;
    }
    case 'beanie': {
      // 2D: ribbed dome, a lighter ribbed cuff band, a pom in mix(colour, white, 0.3)
      const D = dome(0.4, (a, t) => 0.055 + 0.02 * Math.sin(t * 3), 4, { skirt: false });
      // the turned-up cuff: a rolled band standing a clear step out from the crown (BEANIE_CUFF), 16 vertical ribs alternating light and dark, a dark seam on its top lip
      // where the crown goes in, its bottom lip closed down to the scalp
      const n = 16, a0 = Math.PI / n, R = (y, off) => { const out = []; for (let i = 0; i < n; i++) { const th = a0 + (i / n) * Math.PI * 2, d = dirTo(th, y); out.push(addS(CEN, d, headR(d) + off)); } return out; };
      const [yB, yM, yT] = BEANIE_CUFF.y, [oB, oM, oT] = BEANIE_CUFF.off, Bo = R(yB, oB), Mo = R(yM, oM), To = R(yT, oT), Ti = R(yT + 0.006, 0.045), Bi = R(yB, 0.014), cuff = mixS(col, WH, 0.24), seam = shade(col, 0.5);
      for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n, out = nrm3(sub3(Mo[i], CEN)), rib = i % 2 ? shade(cuff, 0.72) : cuff, rl = shade(rib, 0.86), K3 = (a, b, c, h, ca, cb, cc, nh) => mb.triH(a, b, c, h, ca, cb, cc, K_h, K_h, K_h, nh);
        K3(Bo[i], Bo[i2], Mo[i2], out, rl, rl, rib); K3(Bo[i], Mo[i2], Mo[i], out, rl, rib, rib); K3(Mo[i], Mo[i2], To[i2], out, rib, rib, rl); K3(Mo[i], To[i2], To[i], out, rib, rl, rl);
        K3(To[i], To[i2], Ti[i2], [0, 1, 0], seam, seam, seam, true); K3(To[i], Ti[i2], Ti[i], [0, 1, 0], seam, seam, seam, true); K3(Bo[i], Bo[i2], Bi[i2], [0, -1, 0], shade(rl, 0.7), shade(rl, 0.7), shade(rl, 0.7), true); K3(Bo[i], Bi[i2], Bi[i], [0, -1, 0], shade(rl, 0.7), shade(rl, 0.7), shade(rl, 0.7), true);
      }
      if (deco) top(D, 0.05, a2(mixS(col, WH, 0.3))); break;
    }
    case 'bucket': case 'bucketfur': {
      // 2D bucket: one colour, silver eyelets on the sides. Fuzzy bucket: mix(colour, cream, 0.28) fur with light and dark tufts
      const fur = id === 'bucketfur', bc = fur ? mixS(col, '#fff6ea', 0.28) : col, tuft = fur ? a2(lt(bc, 0.35)) : null;
      const D = dome(0.39, (a, t) => 0.06 + 0.012 * t, 4, { col: (a, t) => { if (fur) { const h = hh(Math.round(a * 3.2), Math.round(t * 9)); if (h < 0.22) return tuft; if (h < 0.4) return shade(bc, 0.8); } return mix(shade(bc, 0.86), lt(bc, 0.04), t); } });
      if (!deco) break;
      brim(mb, 0.415, 0.045, 0.2, 0, Math.PI * 2, 0.05, lt(bc, 0.04), shade(bc, 0.6), bs, 12, fur ? tuft : null);
      if (!fur) [1, -1].forEach((s) => badge(mb, D.P, dirTo(s * 1.45, 0.47), circ(0.012, 6), a2('#cfd3e6')));
      break;
    }
    case 'durag': {
      // 2D: silky dome with a dark centre seam, a darker band across the forehead (mix(colour, black, 0.2)), long striped tails
      const band = mixS(col, '#000000', 0.2);
      const D = dome((a) => 0.35 + (Math.cos(a) > 0.2 ? 0.07 : 0), 0.026, 5, { col: (a, t) => (Math.cos(a) > 0.2 && t < 0.3 ? mix(shade(band, 0.9), band, t * 3) : Math.abs(Math.sin(a)) < 0.1 && t > 0.3 ? shade(col, 0.7) : mix(shade(col, 0.9), lt(col, 0.1), t)) });
      if (!deco) break;
      const R = addS(CEN, dirTo(Math.PI, 0.36), surfT(D.P, dirTo(Math.PI, 0.36)) - 0.01);
      strand(mb, [R, [0, R[1] - 0.07, R[2] - 0.11], [0, R[1] - 0.22, R[2] - 0.17], [0, R[1] - 0.4, R[2] - 0.15]], [0.055, 0.065, 0.05, 0.02], (t) => (t > 0.2 && Math.floor(t * 7) % 2 ? lt(col, 0.14) : mix(col, shade(col, 0.8), t)), { n: 4, flatY: 0.45, up: [1, 0, 0], sk: (t) => K2('head', 'tail', clamp(t * 1.3, 0, 1)), tip: 0.02, capStart: true });
      [-1, 1].forEach((s) => { const Q = addS(CEN, dirTo(Math.PI - s * 0.35, 0.37), surfT(D.P, dirTo(Math.PI - s * 0.35, 0.37)) - 0.006); strand(mb, [Q, [Q[0] + s * 0.06, Q[1] - 0.05, Q[2] - 0.11], [Q[0] + s * 0.09, Q[1] - 0.12, Q[2] - 0.13]], [0.016, 0.014, 0.01], a2(shade(col, 0.85)), { n: 3, sk: (t) => K2('head', 'tail', t), tip: 0.01, capStart: true }); });
      break;
    }
    case 'bandana': {
      // 2D: the cloth carries a dotted print (light dots in a row around the head)
      const D = dome(0.4, 0.04, 4, {}); if (!deco) break;
      const dot = a2(mixS(col, WH, 0.6)); for (let k = 0; k < 9; k++) { const th = -2.0 + k * 0.5, y = 0.462 + (k % 2) * 0.042; badge(mb, D.P, dirTo(th, y), [[0, 0.017], [0.015, 0], [0, -0.017], [-0.015, 0]], dot); }
      const R = addS(CEN, dirTo(Math.PI - 0.25, 0.42), surfT(D.P, dirTo(Math.PI - 0.25, 0.42)) - 0.008); ball(mb, R, [0.04, 0.035, 0.035], shade(col, 0.85), K_h, { detail: 0 });
      strand(mb, [R, [R[0] + 0.08, R[1] - 0.08, R[2] - 0.08], [R[0] + 0.13, R[1] - 0.18, R[2] - 0.09]], [0.03, 0.035, 0.012], (t) => (Math.round(t * 4) % 2 ? dot : col), { n: 4, flatY: 0.45, up: [0, 0, 1], sk: (t) => K2('head', 'tail', t), tip: 0.02, capStart: true }); break;
    }
    case 'headband': { bandRing(mb, sf, 0.4, 0.46, 0.016, 16, col, null, HA0, null, a2(mixS(col, WH, 0.35))); break; }
    case 'beret': {
      // a soft dome with a wide flat puff on top, tipped to one side
      const D = dome(0.43, (a, t) => 0.03 + 0.01 * t, 3, { col: (a, t) => mix(shade(col, 0.85), col, t) });
      const a = D.G.apex; ball(mb, [a[0] + 0.05, a[1] - 0.045, a[2] + 0.005], [0.29, 0.085, 0.28], col, K_h, { detail: 1, col2: lt(col, 0.1), jit: 0.012, m: null, rot: [0, 0, -0.12] });
      if (deco) ball(mb, [a[0] + 0.035, a[1] + 0.045, a[2]], [0.02, 0.025, 0.02], a2(lt(col, 0.18)), K_h, { detail: 0 }); break;
    }
    case 'fedora': case 'cowboy': case 'tophat': {
      // 2D: fedora band mix(colour, ink, 0.45) with a gold buckle on the side; cowboy band mix(colour, ink, 0.5) with gold studs and a gold buckle in front; top hat: a red band with a gold buckle
      const tall = id === 'tophat', n = 10, a0r = Math.PI / 10, rb = ringAt(0.42), g = 0.045, yTop = tall ? 0.9 : 0.68;
      // crown: bottom ring follows the head shape, then straight up; the band wraps the lower crown
      const ringAtY = (y) => { const k = clamp((y - 0.42) / (0.5 - 0.42), 0, 1), k2 = clamp((y - 0.5) / (yTop - 0.5), 0, 1); return y <= 0.5 ? { rx: lerp(rb.rx + g, 0.25, k), rz: lerp(rb.rz + g, 0.245, k), cz: lerp(rb.cz, -0.03, k), sq: lerp(SQ, 0.9, k) } : { rx: lerp(0.25, tall ? 0.235 : 0.2, k2), rz: lerp(0.245, tall ? 0.235 : 0.22, k2), cz: -0.03, sq: 0.9 }; };
      const ring = (y, grow) => { const r = ringAtY(y), out = []; for (let i = 0; i < n; i++) { const th = a0r + (i / n) * Math.PI * 2; out.push([(r.rx + grow) * Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), r.sq), HY + y, r.cz + (r.rz + grow) * Math.sign(Math.cos(th)) * Math.pow(Math.abs(Math.cos(th)), r.sq)]); } return out; };
      const Rs = [0.42, 0.5, yTop].map((y) => ring(y, 0)), cols3 = [shade(col, 0.8), mix(col, lt(col, 0.1), 0.5), lt(col, 0.1)];
      for (let j = 0; j < 2; j++) for (let i = 0; i < n; i++) { const i2 = (i + 1) % n, A = Rs[j][i], B = Rs[j][i2], Cc = Rs[j + 1][i2], D = Rs[j + 1][i], out = nrm3([A[0] + B[0], 0, A[2] + B[2] + 0.06]); mb.triH(A, B, Cc, out, cols3[j], cols3[j], cols3[j + 1], K_h, K_h, K_h); mb.triH(A, Cc, D, out, cols3[j], cols3[j + 1], cols3[j + 1], K_h, K_h, K_h); }
      const capC = lt(col, 0.08), tp = [0, HY + yTop + (tall ? 0 : -0.025), -0.03]; for (let i = 0; i < n; i++) mb.triH(tp, Rs[2][i], Rs[2][(i + 1) % n], [0, 1, 0], capC, cols3[2], cols3[2], K_h, K_h, K_h);
      if (!deco) break;
      seal(mb, Rs[0], shade(col, 0.5), true);
      brim(mb, 0.42, 0.03, id === 'cowboy' ? 0.3 : 0.19, 0, Math.PI * 2, id === 'cowboy' ? -0.04 : 0.02, lt(col, 0.03), shade(col, 0.55), bs, 12);
      const b0 = ring(0.432, 0.008), b1 = ring(0.5, 0.008), cb = a2(tall ? '#c42a45' : mixS(col, INK2, id === 'cowboy' ? 0.5 : 0.45)); for (let i = 0; i < n; i++) { const i2 = (i + 1) % n, out = nrm3([b0[i][0] + b0[i2][0], 0, b0[i][2] + b0[i2][2] + 0.06]); mb.triH(b0[i], b0[i2], b1[i2], out, cb, cb, cb, K_h, K_h, K_h); mb.triH(b0[i], b1[i2], b1[i], out, cb, cb, cb, K_h, K_h, K_h); }
      // facet 9 faces the front, facet 0 the character's left (the 2D fedora's buckle side)
      onFacet(facet(b0, b1, id === 'fedora' ? 0 : 9), 0.3, 0.7, 0.12, 0.88, C(tall ? '#ffe14d' : GOLD), { centre: '#fff0a0' });
      if (id === 'cowboy') [0, 1, 2, 6, 7, 8].forEach((i) => onFacet(facet(b0, b1, i), 0.4, 0.6, 0.32, 0.68, C(GOLD), { dia: 1 }));
      break;
    }
    case 'crown': {
      // gold band riding on the hair, with five points standing on its top ring; the gems are the hat colour (2D)
      const n = 10, lo = [], up = [], inL = [], inU = [], gl = C('#ffd23f'), gd = shade('#d4a017', 0.8), gi = shade('#d4a017', 0.6), gem = a2(col);
      for (let i = 0; i < n; i++) { const th = HA0 + (i / n) * Math.PI * 2, p = ride(sf, th, 0.5, 0.004), q = addS(p, p.d, 0.018); q[1] += 0.08; lo.push(p); up.push(q); inL.push(addS(p, p.d, -0.012)); const qi = addS(q, q.d || p.d, -0.012); inU.push(qi); }
      for (let i = 0; i < n; i++) { const i2 = (i + 1) % n, out = nrm3([lo[i].d[0] + lo[i2].d[0], 0, lo[i].d[2] + lo[i2].d[2]]), inn = [-out[0], 0, -out[2]]; mb.triH(lo[i], lo[i2], up[i2], out, gd, gd, gl, K_h, K_h, K_h); mb.triH(lo[i], up[i2], up[i], out, gd, gl, gl, K_h, K_h, K_h); mb.triH(inL[i], inL[i2], inU[i2], inn, gi, gi, gi, K_h, K_h, K_h, true); mb.triH(inL[i], inU[i2], inU[i], inn, gi, gi, gi, K_h, K_h, K_h, true); mb.triH(up[i], up[i2], inU[i2], [0, 1, 0], gl, gl, gl, K_h, K_h, K_h, true); mb.triH(up[i], inU[i2], inU[i], [0, 1, 0], gl, gl, gl, K_h, K_h, K_h, true); }
      for (let i = 0; i < n; i += 2) { const a = up[i], b = up[(i + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.09, (a[2] + b[2]) / 2], o = nrm3([a[0] + b[0], 0, a[2] + b[2] + 0.06]); mb.triH(m, a, b, o, C('#fff2a8'), gl, gl, K_h, K_h, K_h); mb.triH(m, b, a, [-o[0], 0, -o[2]], C('#fff2a8'), gd, gd, K_h, K_h, K_h); const jc = [m[0] + o[0] * 0.004, m[1] - 0.072, m[2] + o[2] * 0.004]; mb.poly([[jc[0], jc[1] + 0.018, jc[2]], [jc[0] + o[2] * 0.014, jc[1], jc[2] - o[0] * 0.014], [jc[0], jc[1] - 0.018, jc[2]], [jc[0] - o[2] * 0.014, jc[1], jc[2] + o[0] * 0.014]], gem, K_h, o, { nh: true, flat: true, centre: mixS(gem, WH, 0.6) }); }
      break;
    }
    case 'halo': { const y = Math.max(HY + HEAD_TOP, sf ? sf.top : 0) + 0.15; strand(mb, Array.from({ length: 12 }, (_, i) => [Math.sin((i / 12) * 6.283) * 0.2, y, -0.035 + Math.cos((i / 12) * 6.283) * 0.2]), 0.016, C('#fff2a8'), { n: 3, sk: K_h, nh: true, up: [0, 1, 0], closed: true }); break; }
    case 'catears': {
      // 2D: band and ears in the hat colour, a pink inner ear
      bandRing(mb, sf, 0.43, 0.48, 0.014, 16, col, null, HA0); const pk = a2('#ff7ab6');
      [1, -1].forEach((s) => {
        const th = s * 0.62, P = [ride(sf, th - s * 0.16, 0.5, -0.01), ride(sf, th + s * 0.16, 0.5, -0.01), ride(sf, th, 0.555, -0.012)], c = [(P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3, (P[0][2] + P[1][2] + P[2][2]) / 3], out = P[2].d, tp = [c[0] + out[0] * 0.035, c[1] + 0.13, c[2] + out[2] * 0.035 - 0.01];
        for (let q = 0; q < 3; q++) mb.triH(tp, P[q], P[(q + 1) % 3], sub3([(P[q][0] + P[(q + 1) % 3][0]) / 2, (P[q][1] + P[(q + 1) % 3][1]) / 2, (P[q][2] + P[(q + 1) % 3][2]) / 2], c), q === 0 ? lt(col, 0.1) : col, col, col, K_h, K_h, K_h);
        const fc = [(tp[0] + P[0][0] + P[1][0]) / 3, (tp[1] + P[0][1] + P[1][1]) / 3, (tp[2] + P[0][2] + P[1][2]) / 3], fn = outN(tp, P[0], P[1], sub3([(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2, (P[0][2] + P[1][2]) / 2], c)), sh = (p, k) => addS([fc[0] + (p[0] - fc[0]) * k, fc[1] + (p[1] - fc[1]) * k, fc[2] + (p[2] - fc[2]) * k], fn, 0.003);
        mb.triH(sh(tp, 0.62), sh(P[0], 0.62), sh(P[1], 0.62), fn, pk, pk, pk, K_h, K_h, K_h, true, true);
      });
      break;
    }
    case 'visor': {
      // 2D: band in the hat colour, the bill tinted mix(colour, neon cyan, 0.45) with a neon cyan edge
      bandRing(mb, sf, 0.4, 0.465, 0.016, 16, col, null, HA0);
      brimTongue(mb, 0, 0, 0.17, 0, 1.15, 0.03, a2(mixS(col, '#2ee6ff', 0.45)), shade(col, 0.55), bs, 6, (th) => ride(sf, th, 0.425, 0.002), C('#2ee6ff').multiplyScalar(1.1)); break;
    }
    case 'headphonehat': {
      // fluffy earmuffs: a cup over each ear on the hair surface, joined by a band that arcs over the top of the head (2D: all in the hat colour, fluffy light flecks)
      const cup = (s) => ride(sf, s * 1.6, 0.27, 0.05), L = cup(1), R = cup(-1), band = [];
      [1, -1].forEach((s) => { const c = s > 0 ? L : R; ball(mb, c, [0.07, 0.105, 0.095], col, K_h, { detail: 1, jit: 0.02, col2: lt(col, 0.22) }); });
      for (let k = 0; k <= 6; k++) { const ps = lerp(1.2, -1.2, k / 6), d = nrm3([Math.sin(ps), Math.cos(ps), -0.06]); band.push(addS(CEN, d, surfT(sf && sf.P, d) + 0.016)); }
      strand(mb, [[L[0] - 0.01, L[1] + 0.06, L[2]]].concat(band, [[R[0] + 0.01, R[1] + 0.06, R[2]]]), 0.017, a2(shade(col, 0.9)), { n: 4, sk: K_h, tip: 0, up: [0, 0, 1], flatY: 0.6 }); break;
    }
    case 'chef': { dome(0.41, 0.04, 3, { col: (a, t) => mix(shade(col, 0.85), a2(col), 0.5 + 0.5 * t) }); if (deco) ball(mb, [0, HY + 0.68, -0.03], [0.24, 0.17, 0.24], col, K_h, { detail: 1, jit: 0.03, col2: lt(col, 0.2) }); break; }
    case 'wizard': {
      // 2D: a band mix(colour, yellow, 0.7) round the base of the cone and yellow stars on it
      const rb = ringAt(0.42), n = 10, ring = (y, rx, rz, cz, sq) => { const out = []; for (let i = 0; i < n; i++) { const th = Math.PI / n + (i / n) * Math.PI * 2; out.push([rx * Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), sq), HY + y, cz + rz * Math.sign(Math.cos(th)) * Math.pow(Math.abs(Math.cos(th)), sq)]); } return out; };
      const Rs = [ring(0.42, rb.rx + 0.04, rb.rz + 0.04, rb.cz, SQ), ring(0.7, 0.17, 0.17, -0.04, 1), ring(1.0, 0.07, 0.07, -0.12, 1)], cs = [shade(col, 0.8), col, lt(col, 0.1)], tipP = [0, HY + 1.15, -0.2];
      for (let j = 0; j < 2; j++) for (let i = 0; i < n; i++) { const i2 = (i + 1) % n, A = Rs[j][i], B = Rs[j][i2], Cc = Rs[j + 1][i2], D = Rs[j + 1][i], out = nrm3([A[0] + B[0], 0.3, A[2] + B[2] + 0.06]); mb.triH(A, B, Cc, out, cs[j], cs[j], cs[j + 1], K_h, K_h, K_h); mb.triH(A, Cc, D, out, cs[j], cs[j + 1], cs[j + 1], K_h, K_h, K_h); }
      for (let i = 0; i < n; i++) { const a = Rs[2][i], b = Rs[2][(i + 1) % n]; mb.triH(tipP, a, b, [a[0] + b[0], 0.2, a[2] + b[2] + 0.2], cs[2], cs[2], cs[2], K_h, K_h, K_h); }
      if (deco) {
        seal(mb, Rs[0], shade(col, 0.5), true); brim(mb, 0.42, 0.03, 0.2, 0, Math.PI * 2, 0.0, col, shade(col, 0.6), bs, 12);
        // the band: a ring standing just off the lower cone, its top lip closed back onto the cone
        const on = (y, e) => Rs[0].map((p, i) => { const q = Rs[1][i], k = (y - 0.42) / 0.28, x = lerp(p[0], q[0], k), z = lerp(p[2], q[2], k), cz = lerp(rb.cz, -0.04, k), l = Math.hypot(x, z - cz) || 1; return [x + x / l * e, HY + y, z + (z - cz) / l * e]; });
        const bc = a2(mixS(col, '#ffe14d', 0.7)), bl = on(0.432, 0.007), bu = on(0.475, 0.007), bi = on(0.475, -0.002);
        for (let i = 0; i < n; i++) { const i2 = (i + 1) % n, out = nrm3([bl[i][0] + bl[i2][0], 0.3, bl[i][2] + bl[i2][2] + 0.06]); mb.triH(bl[i], bl[i2], bu[i2], out, bc, bc, bc, K_h, K_h, K_h); mb.triH(bl[i], bu[i2], bu[i], out, bc, bc, bc, K_h, K_h, K_h); mb.triH(bu[i], bu[i2], bi[i2], [0, 1, 0], bc, bc, bc, K_h, K_h, K_h, true); mb.triH(bu[i], bi[i2], bi[i], [0, 1, 0], bc, bc, bc, K_h, K_h, K_h, true); }
        [[9, 0.25, 0.42, 0.62], [0, 0.55, 0.62, 0.82], [8, 0.6, 0.5, 0.7]].forEach(([i, u, v0, v1]) => { const i2 = (i + 1) % n, F = facet(Rs[0], Rs[1], i, [Rs[0][i][0] + Rs[0][i2][0], 0.3, Rs[0][i][2] + Rs[0][i2][2] + 0.06]); onFacet(F, u - 0.13, u + 0.13, v0, v1, C('#ffe14d'), { dia: 1, centre: '#fff7b0' }); });
      }
      break;
    }
    case 'pirate': {
      // 2D: gold trim along the edges, a white skull and crossbones in front
      const D = dome(0.4, 0.05, 4, {}); if (!deco) break; brim(mb, 0.425, 0.035, 0.14, -2.6, 2.6, 0.03, lt(col, 0.04), shade(col, 0.6), bs, 8, '#e8b923');
      const bone = a2('#fff2dc'), dd = dirTo(0, 0.49); badge(mb, D.P, dd, Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * 6.283) * 0.035, Math.sin(i / 6 * 6.283) * 0.032 + 0.012]), bone);
      [1, -1].forEach((s) => { const a = s * 0.5, ca = Math.cos(a), sa = Math.sin(a); badge(mb, D.P, dd, [[-0.05, -0.006], [0.05, -0.006], [0.05, 0.006], [-0.05, 0.006]].map(([u, v]) => [u * ca - v * sa, u * sa + v * ca - 0.024]), bone, 0.0035); });
      break;
    }
    case 'hood': {
      // 2D: the hood in its colour with cream drawstrings with gold tips hanging at the front
      const p0 = mb.P.length; headShell(mb, { yb: (a) => kf([[0, 0.43], [0.6, 0.42], [1.0, 0.3], [1.6, 0.24], [2.2, 0.0], [3.15, -0.04]], a), rows: 6, hangScale: 1.1, thick: (a, t) => 0.065 + 0.03 * t + (Math.cos(a) < 0 && t < 0.7 ? 0.04 : 0), col: (a, t) => mix(shade(col, 0.82), col, t), sk: (a, t) => (t < 0.5 ? K2('head', 'chest', 0.0) : K_h), skirt: deco, clear: 0.007 });
      if (!deco) break;
      const HP = mb.P.slice(p0), cord = a2('#f7f2e8');
      [1, -1].forEach((s) => { const d = dirTo(s * 1.3, 0.31), R = addS(CEN, d, surfT(HP, d) - 0.012), out = (y) => { const e = dirTo(s * 1.25, y); return addS(CEN, e, headR(e) + 0.022); }; strand(mb, [R, out(0.2), out(0.08)], 0.0065, (t) => (t > 0.8 ? C(GOLD) : cord), { n: 3, sk: K_h, tip: 0.008, capStart: true }); });
      break;
    }
    default: break;
  }
  void glow;
}
