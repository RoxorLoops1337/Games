// CHARACTER GEAR: glasses and accessories (neck, ears, hand, wrist, back). Face gear hugs the head through facePt().
// Everything that rests on the character finds its seat with a surface probe: rays against the real triangles of the head, hair, hat, top, bottom and arms of THIS look,
// so chains lie on the cloth, straps run over the hair and the shoulders, headphones sit on whatever is on the head and wristwear wraps the cuff or the skin, for every body type.
import { C, mix, mixS, shade, lite, K, K2, BI, MB, loft, ball, box, tubePT, lerp, clamp, mat, INK, CREAM } from './char_geo.js';
import { HY, facePt, ringAt, buildHead, buildArms, armSkin } from './char_body.js';
import { buildHair, buildHat, HAT_COVER } from './char_hair.js';
import { buildTop, buildBottom, wearMeta, bodyR, torsoFront, torsoSk } from './char_wear.js';
import { MIC, micMatrix } from './char_props.js';
import { THREE } from './kit.js';

// ------------------------------------------------------------------ surface probe
// probe(mbs).ray(o, d) -> distance along the unit direction d from o to the first triangle (either side), or -1. Triangles carry a padded AABB so most are rejected by a slab test.
// keep(boneA, boneB) filters triangles by the skin of their first vertex (to probe the torso without the sleeves, or one arm alone)
export function probe(mbs, keep) {
  const L = []; mbs.forEach((m) => { for (let t = 0; t < m.P.length / 9; t++) if (!keep || keep(m.S[t * 9], m.S[t * 9 + 1])) for (let k = 0; k < 9; k++) L.push(m.P[t * 9 + k]); });
  const n = L.length, P = Float32Array.from(L);
  const nt = n / 9, B = new Float32Array(nt * 6);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const a = P[t * 9 + k], b = P[t * 9 + 3 + k], c = P[t * 9 + 6 + k]; B[t * 6 + k] = Math.min(a, b, c) - 1e-4; B[t * 6 + 3 + k] = Math.max(a, b, c) + 1e-4; }
  // |normal.y| per triangle: horizontal rays may skip near-flat plates (hat brims) so a strap tucks under a brim instead of jumping out to its rim
  const NY = new Float32Array(nt); for (let t = 0; t < nt; t++) { const q = t * 9, ux = P[q + 3] - P[q], uy = P[q + 4] - P[q + 1], uz = P[q + 5] - P[q + 2], vx = P[q + 6] - P[q], vy = P[q + 7] - P[q + 1], vz = P[q + 8] - P[q + 2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; NY[t] = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1); }
  const ray = (o, d, far, flat) => {
    let best = far || 3; const iv = [1 / (d[0] || 1e-12), 1 / (d[1] || 1e-12), 1 / (d[2] || 1e-12)];
    for (let t = 0; t < nt; t++) {
      if (flat && NY[t] > flat) continue;
      let t0 = 0, t1 = best, j = t * 6, k = 0;
      for (; k < 3; k++) { const a = (B[j + k] - o[k]) * iv[k], b = (B[j + 3 + k] - o[k]) * iv[k]; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); if (t0 > t1) break; }
      if (k < 3) continue;
      const q = t * 9, ax = P[q], ay = P[q + 1], az = P[q + 2], e1x = P[q + 3] - ax, e1y = P[q + 4] - ay, e1z = P[q + 5] - az, e2x = P[q + 6] - ax, e2y = P[q + 7] - ay, e2z = P[q + 8] - az;
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
      const id = 1 / det, sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az, u = (sx * px + sy * py + sz * pz) * id; if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * id; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * id; if (tt > 1e-6 && tt < best) best = tt;
    }
    return best < (far || 3) ? best : -1;
  };
  // nearest surface point within cap of p: { d, q } or null
  const near = (p, cap) => { let best = null, bd = cap; for (let t = 0; t < nt; t++) { const j = t * 6; if (p[0] < B[j] - bd || p[0] > B[j + 3] + bd || p[1] < B[j + 1] - bd || p[1] > B[j + 4] + bd || p[2] < B[j + 2] - bd || p[2] > B[j + 5] + bd) continue; const q0 = t * 9, c = closest(p, [P[q0], P[q0 + 1], P[q0 + 2]], [P[q0 + 3], P[q0 + 4], P[q0 + 5]], [P[q0 + 6], P[q0 + 7], P[q0 + 8]]), d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]); if (d < bd) { bd = d; best = { d, q: c }; } } return best; };
  return { ray, near, tris: nt, P, NY };
}
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
// closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5)
function closest(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], dt = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], at = (u, v, w) => [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], d1 = dt(ab, ap), d2 = dt(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dt(ab, bp), d4 = dt(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(0, d1 / (d1 - d3), 0);
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dt(ab, cp), d6 = dt(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, 0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
  const dn = 1 / (va + vb + vc); return at(0, vb * dn, vc * dn);
}
// push p straight away from the nearest surface of the set until it is at least r clear (a band or tube centre over a slope the probing ray met at a slant)
function push(pr, p, r) {
  let q = p.slice();
  for (let it = 0; it < 3; it++) { const n = pr.near(q, r); if (!n || n.d >= r - 1e-4) break; const dir = n.d > 1e-6 ? [(q[0] - n.q[0]) / n.d, (q[1] - n.q[1]) / n.d, (q[2] - n.q[2]) / n.d] : [0, 1, 0]; q = [n.q[0] + dir[0] * r, n.q[1] + dir[1] * r, n.q[2] + dir[2] * r]; }
  return q;
}
// shoot a ray at `at` from `far` metres outside along dir; returns the first surface point backed off by `off` (out of the surface), or fb
const shoot = (pr, at, dir, off, fb, far, reach, flat) => { far = far || 1.2; const d = nrm(dir), o = [at[0] - d[0] * far, at[1] - d[1] * far, at[2] - d[2] * far], t = pr.ray(o, d, reach || far * 2, flat); if (t < 0) return fb; return [o[0] + d[0] * (t - off), o[1] + d[1] * (t - off), o[2] + d[2] * (t - off)]; };
// probe sets per build (ctx is fresh for every setLook): head = head + hair + hat, cover = hair + hat, hat = hat only, skull = head only; torso = top + bottom + neck (+ crop midriff); arm = top + arms
function probes(ctx, what) {
  const k = ctx.gearProbe || (ctx.gearProbe = {}); if (k[what]) return k[what];
  const mk = (f) => { const m = new MB(5); f(m); return m; };
  if (what === 'head' || what === 'cover' || what === 'hat' || what === 'skull') {
    const hid = (ctx.look.hat && ctx.look.hat.id) || 'none', hc = HAT_COVER[hid] || 0, h = k.mbH || (k.mbH = mk((m) => buildHead(m, ctx))), r = k.mbR || (k.mbR = mk((m) => buildHair(m, ctx, hc))), t = k.mbT || (k.mbT = mk((m) => buildHat(m, new MB(6), ctx)));
    k[what] = what === 'head' ? probe([h, r, t]) : what === 'cover' ? probe([r, t]) : what === 'hat' ? probe([t]) : probe([h]);
  } else if (what === 'torso') {
    const d = ctx.d, meta = wearMeta(ctx.look), mid = mk((m) => { if (meta.top.f === 'tank' && meta.top.crop) loft(m, [0.46, 0.52, 0.58, 0.64].map((y) => { const b = bodyR(y, d); return { y, rx: b.rx + 0.006, rz: b.rz + 0.006, cz: 0.004, c: '#fff' }; }), { n: 10, sq: 0.8 }); });
    k[what] = probe([k.mbH || (k.mbH = mk((m) => buildHead(m, ctx))), k.mbTop || (k.mbTop = mk((m) => buildTop(m, ctx, d))), mk((m) => buildBottom(m, ctx, d)), mid], (a, b) => !ARM[a] && !ARM[b]);
  } else if (what === 'torsoAll') {
    // the shoulders with the sleeve caps on them: what a loop round the neck lies on from above
    k[what] = probe([k.mbH || (k.mbH = mk((m) => buildHead(m, ctx))), k.mbTop || (k.mbTop = mk((m) => buildTop(m, ctx, ctx.d)))]);
  } else k[what] = probe([k.mbTop || (k.mbTop = mk((m) => buildTop(m, ctx, ctx.d))), mk((m) => buildArms(m, ctx, ctx.d, wearMeta(ctx.look).sleeveEnd))], (a) => ARML[a]);
  return k[what];
}
const ARM = {}, ARML = {}; ['shL', 'elL', 'wrL', 'shR', 'elR', 'wrR'].forEach((n, i) => { ARM[BI[n]] = 1; if (i < 3) ARML[BI[n]] = 1; });
// head-local horizontal ray at geometric angle th (0 = front, +x = character left) and head-local height y: the outer surface of the set, pushed out by off
const around = (pr, th, y, off, fbR, flat) => { const cz = ringAt(Math.max(0.02, Math.min(0.585, y))).cz, u = [Math.sin(th), 0, Math.cos(th)], p = shoot(pr, [0, HY + y, cz], [-u[0], 0, -u[2]], off, null, 1.2, 0, flat); return p || [u[0] * (fbR + off), HY + y, cz + u[2] * (fbR + off)]; };
// body-space helpers on the torso set: onto the front (ray -z), the back (ray +z), from above (ray -y), around a vertical axis at (ax, az)
const FRONT = (pr, x, y, off, look, d) => shoot(pr, [x, y, 0], [0, 0, -1], off, [x, y, torsoFront(look, d, y) + off]);
const BACK = (pr, x, y, off, look, d) => shoot(pr, [x, y, 0], [0, 0, 1], off, [x, y, -torsoFront(look, d, y) - off]);
// DOWN starts just under the chin so the head never catches it; RING starts `far` out from the axis (keep it short for a limb)
const DOWN = (pr, x, z, off) => shoot(pr, [x, 0.5, z], [0, -1, 0], off, [x, 0.905 + off, z], 0.475);
const RING = (pr, ax, az, th, y, off, fbR, far) => { const u = [Math.sin(th), 0, Math.cos(th)], p = shoot(pr, [ax, y, az], [-u[0], 0, -u[2]], off, null, far || 0.8); return p || [ax + u[0] * (fbR + off), y, az + u[2] * (fbR + off)]; };

// ------------------------------------------------------------------ small builders
// flat strap / ribbon (top and both edges; the face against the body is left out) along pts with per-point outward normals ns (the face lies on the surface): width w, thickness th, colour col (or fn(t)), skin sk (or fn(t))
function ribbon(mb, pts, ns, w, th, col, sk, closed) {
  const N = pts.length, cf = typeof col === 'function' ? col : () => C(col), sf = typeof sk === 'function' ? sk : () => sk, R = [];
  for (let i = 0; i < N; i++) {
    const a = pts[closed ? (i - 1 + N) % N : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % N : Math.min(N - 1, i + 1)], tg = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), n0 = ns[i];
    const dn = n0[0] * tg[0] + n0[1] * tg[1] + n0[2] * tg[2], n = nrm([n0[0] - tg[0] * dn, n0[1] - tg[1] * dn, n0[2] - tg[2] * dn]), s = nrm([n[1] * tg[2] - n[2] * tg[1], n[2] * tg[0] - n[0] * tg[2], n[0] * tg[1] - n[1] * tg[0]]), p = pts[i];
    const q = (u, v) => [p[0] + s[0] * u + n[0] * v, p[1] + s[1] * u + n[1] * v, p[2] + s[2] * u + n[2] * v], t = i / Math.max(1, N - 1);
    R.push({ c: [q(-w / 2, -th / 2), q(w / 2, -th / 2), q(w / 2, th / 2), q(-w / 2, th / 2)], n, s, col: cf(t), sk: sf(t) });
  }
  const M = closed ? N : N - 1;
  for (let i = 0; i < M; i++) {
    const A = R[i], Bq = R[(i + 1) % N];
    for (let f = 1; f < 4; f++) {
      const f2 = (f + 1) % 4, hint = f === 0 ? [-A.n[0], -A.n[1], -A.n[2]] : f === 2 ? A.n : f === 1 ? A.s : [-A.s[0], -A.s[1], -A.s[2]], ca = f === 2 ? A.col : shade(A.col, 0.8), cb = f === 2 ? Bq.col : shade(Bq.col, 0.8);
      mb.triH(A.c[f], A.c[f2], Bq.c[f2], hint, ca, ca, cb, A.sk, A.sk, Bq.sk); mb.triH(A.c[f], Bq.c[f2], Bq.c[f], hint, ca, cb, cb, A.sk, Bq.sk, Bq.sk);
    }
  }
  if (!closed) [[R[0], -1], [R[N - 1], 1]].forEach(([e, sg]) => { const a = pts[sg < 0 ? 0 : N - 1], b = pts[sg < 0 ? 1 : N - 2], hint = [(a[0] - b[0]), (a[1] - b[1]), (a[2] - b[2])]; mb.triH(e.c[0], e.c[1], e.c[2], hint, e.col, e.col, e.col, e.sk, e.sk, e.sk); mb.triH(e.c[0], e.c[2], e.c[3], hint, e.col, e.col, e.col, e.sk, e.sk, e.sk); });
}
// a short cylinder (headphone cup, medal, watch face) centred at c with its axis ax; the -ax face is the pad (towards the body)
function puck(mb, c, ax, R, dep, shell, pad, sk, n) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(c[0], c[1], c[2]), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...nrm(ax))), new THREE.Vector3(1, 1, 1));
  const rings = pad ? [{ y: -dep / 2, rx: R * 0.8, rz: R * 0.8, c: shade(pad, 0.8), sk }, { y: -dep * 0.2, rx: R * 0.98, rz: R * 0.98, c: pad, sk }, { y: -dep * 0.15, rx: R * 1.02, rz: R * 1.02, c: shell, sk }, { y: dep / 2, rx: R * 0.86, rz: R * 0.86, c: lite(shell, 0.08), sk }]
    : [{ y: -dep / 2, rx: R, rz: R, c: shade(shell, 0.8), sk }, { y: dep / 2, rx: R, rz: R, c: shell, sk }];
  loft(mb, rings, { n: n || 8, caps: 'bt', m, capCol: lite(shell, 0.16), capColB: shade(pad || shell, 0.6) });
}
// smooth a radius profile: running max over a window (rides over hair clumps) then a box blur
const smoothR = (r, w) => { const mx = r.map((_, i) => Math.max(...r.slice(Math.max(0, i - w), i + w + 1))); return mx.map((_, i) => { const s = mx.slice(Math.max(0, i - 1), i + 2); return s.reduce((a, b) => a + b, 0) / s.length; }); };

// ------------------------------------------------------------------ glasses
const proj = (pts, off) => pts.map(([x, y]) => { const f = facePt(x, y); return [x + f.n[0] * off, HY + y + f.n[1] * off, f.z + f.n[2] * off]; });
const P1 = (x, y, off) => proj([[x, y]], off)[0];
// split long outline edges so a wide lens or frame follows the curve of the face instead of cutting a chord through it
const dense = (pts, mx) => { const out = []; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], k = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / mx)); for (let j = 0; j < k; j++) out.push([lerp(p[0], q[0], j / k), lerp(p[1], q[1], j / k)]); }); return out; };
const ellp = (rx, ry, n, cx, cy, fn) => { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; let u = Math.cos(a) * rx, v = Math.sin(a) * ry; if (fn) { const q = fn(u, v); u = q[0]; v = q[1]; } p.push([cx + u, cy + v]); } return p; };
const rrect = (w, h, r, cx, cy) => { const pts = []; [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], q) => { const a0 = q * Math.PI / 2; [0, 0.5, 1].forEach((k) => { const a = a0 + k * Math.PI / 2; pts.push([cx + sx * (w - r) + Math.cos(a) * r, cy + sy * (h - r) + Math.sin(a) * r]); }); }); return pts; };
const mirror = (s) => (pts) => pts.map(([u, v]) => [u * s, v]);
// COLOUR ZONES as the 2D draws them (chars_acc.js glasses()): lens: [top, bottom] gradient of the lens fill (a fixed tint, or 'col' for the frame colour's own ramp),
// rim: frame colour (default the look colour; 'dark' = mix(colour, ink, 0.5)). look.glasses.color2, when given, replaces the lens tint.
const GL = {
  round: { shape: (cx, cy) => ellp(0.074, 0.072, 12, cx, cy), clear: 1 }, gold_round: { shape: (cx, cy) => ellp(0.074, 0.072, 12, cx, cy), rim: '#e8b923', lens: ['#e8a54a', '#8a3f6a'], thin: 1 },
  nerd: { shape: (cx, cy) => rrect(0.078, 0.062, 0.02, cx, cy), clear: 1 },
  shades: { shape: (cx, cy, s) => mirror(s)([[-0.075, 0.0], [-0.078, 0.055], [0.078, 0.055], [0.076, 0.0], [0.03, -0.055], [-0.03, -0.055]]).map(([u, v]) => [cx + u, cy + v]), dark: 1, lens: ['#3a3060', '#14102a'], rimCol: 1 },
  wayfarer: { shape: (cx, cy, s) => mirror(s)([[-0.085, 0.0], [-0.085, 0.052], [0.08, 0.062], [0.08, 0.0], [0.04, -0.05], [-0.04, -0.05]]).map(([u, v]) => [cx + u, cy + v]), dark: 1, lens: ['#3a3060', '#14102a'], rimCol: 1 },
  aviator: { shape: (cx, cy) => ellp(0.078, 0.078, 12, cx, cy, (u, v) => [u, v < 0 ? v * 0.95 : v * 0.8]), dark: 1, rim: '#d4a017', lens: ['#2f5a6a', '#9fd0c8'] },
  oversized: { shape: (cx, cy) => rrect(0.092, 0.082, 0.03, cx, cy), dark: 1, lens: ['#2c2548', '#0f0c1e'], rimDark: 1 },
  sport: { shape: (cx, cy, s) => mirror(s)([[-0.09, 0.0], [-0.09, 0.05], [0.09, 0.055], [0.085, -0.02], [0.03, -0.055], [-0.05, -0.045]]).map(([u, v]) => [cx + u, cy + v]), dark: 1, lens: 'col', rim: '#1a1630' },
  heart: { shape: (cx, cy) => { const p = []; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, x = 16 * Math.pow(Math.sin(a), 3), y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); p.push([cx + x * 0.0046, cy + y * 0.0046]); } return p; }, dark: 1, lens: 'col', rimDeep: 1 },
  star: { shape: (cx, cy) => { const p = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.04 : 0.088; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }, dark: 1, lens: 'col', rimDeep: 1 },
  goggles: { shape: (cx, cy) => ellp(0.082, 0.082, 10, cx, cy), dark: 1, rim: '#d4a017', lens: ['#7ad8ff', '#2a6a98'], strap: 1 },
};
export const GLASS_EY = 0.275, GLASS_OFF = 0.024;
export function buildGlasses(mb, glow, ctx) {
  const g = ctx.look.glasses || {}, id = g.id || 'none'; if (id === 'none') return;
  const col = C(g.color || '#17141f'), K_h = K('head'), ey = GLASS_EY, off = GLASS_OFF;
  // lens / panel fill: a fan around a projected centre over a densified outline, so a wide lens follows the curve of the face instead of cutting into it
  // c may be fn(v) (v = 0 at the top of the outline, 1 at the bottom) for a lens gradient
  const fan = (shape, ctr, o, c, m, centre) => { const n = shape.length, S = proj(shape, o), Cc = P1(ctr[0], ctr[1], o), f = facePt(ctr[0], ctr[1]), ys = shape.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys), cf = typeof c === 'function' ? (i) => c((y1 - shape[i][1]) / (y1 - y0 || 1)) : () => c, cc = C(centre || cf(0)); for (let i = 0; i < n; i++) (m || mb).triH(Cc, S[i], S[(i + 1) % n], f.n, cc, cf(i), cf((i + 1) % n), K_h, K_h, K_h, true, true); };
  // a frame ring between two matching outlines (outer, inner), two triangles per segment, every vertex projected onto the face
  const band2 = (A, B, o, c) => { const n = A.length, PA = proj(A, o), PB = proj(B, o), cc = C(c); for (let i = 0; i < n; i++) { const j = (i + 1) % n, h = facePt(A[i][0], A[i][1]).n; mb.triH(PA[i], PA[j], PB[j], h, cc, cc, cc, K_h, K_h, K_h, true, true); mb.triH(PA[i], PB[j], PB[i], h, cc, cc, cc, K_h, K_h, K_h, true, true); } };
  // a grid panel over the face rect [x0,x1]x[y0,y1] at offset o (visors, bars)
  const panel = (x0, x1, y0, y1, cols, rows, o, cf, m) => { for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) { const a = lerp(x0, x1, i / cols), b = lerp(x0, x1, (i + 1) / cols), c0 = lerp(y1, y0, r / rows), c1 = lerp(y1, y0, (r + 1) / rows), q = proj([[a, c0], [b, c0], [b, c1], [a, c1]], o), f = facePt((a + b) / 2, (c0 + c1) / 2), cc = C(cf(r, i)); (m || mb).triH(q[0], q[1], q[2], f.n, cc, cc, cc, K_h, K_h, K_h, true, true); (m || mb).triH(q[0], q[2], q[3], f.n, cc, cc, cc, K_h, K_h, K_h, true, true); } };
  // temple arm from a hinge on the frame along the side of the head, over the top of the ear, then hooked down behind it
  const skull = probes(ctx, 'skull'), cz3 = ringAt(0.3).cz, thE = Math.atan2(0.3, -0.012 - cz3);
  const temple = (s, hx, hy, ho, r, c) => { const h = P1(s * hx, hy, ho), th0 = Math.atan2(Math.abs(h[0]), h[2] - ringAt(hy).cz), pts = [h];
    for (let i = 1; i <= 4; i++) { const t = i / 4, th = lerp(th0 + 0.12, thE, t), y = lerp(hy, 0.303, Math.pow(t, 0.7)); pts.push(around(skull, s * th, y, r + 0.003, 0.3)); }
    pts.push(around(skull, s * (thE + 0.2), 0.29, r + 0.003, 0.3), around(skull, s * (thE + 0.32), 0.255, r * 0.5, 0.3)); tubePT(mb, pts, r, c, { n: 3, sk: K_h, nh: true }); };
  // a strap around the back of the head over hair and hat, from (s*hx, hy) on one side of the face to the other side
  const strap = (hx, hy, yb, r, c, n) => { const head = probes(ctx, 'head'), h0 = P1(-hx, hy, off + 0.004), h1 = P1(hx, hy, off + 0.004), thA = Math.atan2(hx, h0[2] - ringAt(hy).cz) + 0.15, N = 15, raw = [], ths = [], ys = [];
    for (let i = 0; i < N; i++) { const t = i / (N - 1), th = lerp(-thA, -(Math.PI * 2 - thA), t), y = lerp(hy, yb, Math.min(1, Math.sin(t * Math.PI) * 2.2)); ths.push(th); ys.push(y); raw.push(Math.max(...[-r, 0, r].map((dy) => { const p = around(head, th, y + dy, 0, 0.3, 0.8); return Math.hypot(p[0], p[2] - ringAt(y).cz); }))); }
    const R = smoothR(raw, 1), pts = [h0].concat(ths.map((th, i) => { const cz = ringAt(ys[i]).cz, rr = R[i] + r + 0.004; return [Math.sin(th) * rr, HY + ys[i], cz + Math.cos(th) * rr]; }), [h1]); tubePT(mb, pts, r, c, { n: n || 3, sk: K_h, nh: true }); };
  if (id === 'chromeshield' || id === 'visor_shield') {
    const cols = 8, rows = 3, top = C('#dcf0f9'), mid = C(g.color2 || '#3e5a80'), bot = C('#f0c79e'), x0 = -0.21, x1 = 0.21, y1 = 0.345, y0 = 0.205;
    const ytop = (x) => y1 - 0.012 * Math.pow(Math.abs(x) / 0.21, 2), ybot = (x) => y0 + 0.035 * Math.pow(Math.abs(x) / 0.21, 2) + (Math.abs(x) < 0.04 ? 0.012 : 0);
    const V = []; for (let i = 0; i <= cols; i++) { const x = lerp(x0, x1, i / cols), c2 = []; for (let r = 0; r <= rows; r++) c2.push([x, lerp(ytop(x), ybot(x), r / rows)]); V.push(c2); }
    const rc = (r) => (r === 0 ? top : r === 1 ? mid : bot);
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) mb.poly(proj([V[i][r], V[i + 1][r], V[i + 1][r + 1], V[i][r + 1]], off + 0.004), rc(r), K_h, facePt(V[i][r][0], V[i][r][1]).n, { flat: true, nh: true });
    for (let i = 0; i < cols; i++) mb.poly(proj([V[i][0], V[i + 1][0], [V[i + 1][0][0], V[i + 1][0][1] + 0.014], [V[i][0][0], V[i][0][1] + 0.014]], off + 0.001), C('#9fb4cc'), K_h, facePt(V[i][0][0], V[i][0][1]).n, { flat: true, nh: true });
    [[-0.13, 0.05], [0.04, 0.036]].forEach(([x, w]) => mb.poly(proj([[x, 0.335], [x + w, 0.335], [x + w - 0.05, 0.225], [x - 0.05, 0.225]], off + 0.007), CREAM, K_h, facePt(x, 0.28).n, { flat: true, nh: true }));
    [1, -1].forEach((s) => temple(s, 0.205, 0.28, off + 0.002, 0.009, C('#9fb4cc')));
    return;
  }
  if (id === 'neonbar') {
    const gc = C(g.color && g.color !== '#17141f' ? g.color : '#2ee6ff').multiplyScalar(1.1);
    panel(-0.212, 0.212, 0.242, 0.308, 8, 1, off + 0.001, () => INK); panel(-0.2, 0.2, 0.25, 0.3, 8, 1, off + 0.005, () => gc, glow);
    [1, -1].forEach((s) => temple(s, 0.205, 0.29, off + 0.002, 0.008, INK)); return;
  }
  if (id === 'vr') {
    // a headset with depth: a curved front plate standing off the face, walls back to the face, a glowing strip, a strap around the head over the hair
    // 2D: the plate in the glasses colour around a black visor with cyan lenses
    const fo = 0.068, x0 = -0.215, x1 = 0.215, y0 = 0.212, y1 = 0.345, shell = col, vis = C('#120d1f');
    panel(x0, x1, y0, y1, 6, 2, fo, (r, i) => (i === 0 || i === 5 ? (r ? shade(shell, 0.85) : shell) : r ? shade(vis, 0.9) : lite(vis, 0.05)));
    const per = []; for (let i = 0; i <= 6; i++) per.push([lerp(x0, x1, i / 6), y1]); per.push([x1, (y0 + y1) / 2]); for (let i = 6; i >= 0; i--) per.push([lerp(x0, x1, i / 6), y0]); per.push([x0, (y0 + y1) / 2]);
    const A = proj(per, 0.004), Bq = proj(per, fo); for (let i = 0; i < per.length; i++) { const j = (i + 1) % per.length, mx = (per[i][0] + per[j][0]) / 2, my = (per[i][1] + per[j][1]) / 2, hint = [mx, (my - 0.27) * 3, 0.02], c = shade(shell, 0.78); mb.triH(A[i], A[j], Bq[j], hint, c, c, c, K_h, K_h, K_h, true); mb.triH(A[i], Bq[j], Bq[i], hint, c, c, c, K_h, K_h, K_h, true); }
    panel(-0.17, 0.17, 0.262, 0.29, 6, 1, fo + 0.004, () => C(g.color2 || '#2ee6ff').multiplyScalar(1.1), glow);
    strap(0.205, 0.27, 0.355, 0.014, shade(col, 0.7)); return;
  }
  if (id === 'eyepatch') {
    const pc = mixS(col, '#3a3050', 0.2); fan(ellp(0.075, 0.065, 10, 0.124, ey), [0.124, ey], off - 0.004, pc);
    // the strap runs from the patch over the forehead and the hair to the far side of the head, around the back and over the near ear back to the patch
    const head = probes(ctx, 'head'), a = P1(0.08, ey + 0.055, off - 0.004), b = P1(0.192, ey + 0.03, off - 0.004), path = [a];
    const capY = (ctx.look.hat && ctx.look.hat.id && ctx.look.hat.id !== 'none') ? 0.36 : 1, keys = [[0.0, 0.4], [-0.35, 0.45], [-0.8, 0.47], [-1.3, 0.45], [-1.8, 0.42], [-2.4, 0.39], [-Math.PI, 0.37], [-3.88, 0.35], [-4.43, 0.33], [-4.88, 0.315]];
    for (let i = 0; i < keys.length - 1; i++) for (let k = 0; k < 3; k++) { const t = k / 3, th = lerp(keys[i][0], keys[i + 1][0], t), y = Math.min(capY, lerp(keys[i][1], keys[i + 1][1], t)); path.push(around(head, th, y, 0.012, 0.3, 0.8)); }
    path.push(around(head, keys[keys.length - 1][0], Math.min(capY, keys[keys.length - 1][1]), 0.012, 0.3, 0.8));
    path.push(b); tubePT(mb, path, 0.007, mixS(col, '#3a3050', 0.35), { n: 3, sk: K_h, nh: true }); return;
  }
  if (id === 'monocle') {
    const c = ellp(0.078, 0.078, 12, -0.124, ey), ci = ellp(0.064, 0.064, 12, -0.124, ey); band2(c, ci, off, col);
    // the cord sags along the cheek to the ear
    tubePT(mb, [P1(-0.124, ey - 0.078, off), P1(-0.15, 0.17, 0.012), P1(-0.21, 0.16, 0.01), around(skull, -1.25, 0.18, 0.01, 0.3), around(skull, -1.5, 0.205, 0.008, 0.3)], 0.004, (t) => (Math.round(t * 8) % 2 ? lite(col, 0.25) : col), { n: 3, sk: K_h, nh: true }); return;
  }
  if (id === 'pixel') {
    // "deal with it": a pixel-stepped black frame with white pixel glints, one strip across the bridge, flat on the face
    const p = 0.026, x0 = 0.046, yT = ey + 0.052, dk = col, wh = C(g.color2 || mixS(col, '#ffffff', 0.38)), rows = [[0, 5], [0, 5], [1, 5], [2, 4]], glint = { '1,1': 1, '1,2': 1, '2,2': 1 };
    [1, -1].forEach((s) => rows.forEach(([a, b], r) => { for (let c = a; c <= b; c++) { const u0 = s * (x0 + c * p), u1 = s * (x0 + (c + 1) * p), v0 = yT - r * p, v1 = yT - (r + 1) * p; panel(Math.min(u0, u1), Math.max(u0, u1), v1, v0, 1, 1, off, () => (glint[r + ',' + c] ? wh : dk)); } }));
    panel(-x0, x0, yT - p, yT, 2, 1, off, () => dk); [1, -1].forEach((s) => temple(s, x0 + 6 * p, yT - p / 2, off, 0.008, dk)); return;
  }
  const spec = GL[id] || GL.shades;
  [1, -1].forEach((s) => {
    const cx = s * 0.124, shape = dense(spec.shape(cx, ey, s), 0.042), n = shape.length, ctr = [cx, ey], sc = (k) => shape.map(([x, y]) => [ctr[0] + (x - ctr[0]) * k, ctr[1] + (y - ctr[1]) * k]);
    if (spec.clear) band2(shape, sc(0.8), off, spec.rim ? C(spec.rim) : col);
    else {
      const rimC = spec.rim ? C(spec.rim) : spec.rimDark ? mixS(col, '#17141f', 0.5) : spec.rimDeep ? shade(col, 0.6) : spec.rimCol ? col : shade(col, 0.55), outer = sc(spec.thin ? 1.08 : 1.12);
      const L2 = g.color2 ? [lite(C(g.color2), 0.25), shade(C(g.color2), 0.7)] : spec.lens === 'col' ? [lite(col, 0.15), shade(col, 0.82)] : spec.lens ? spec.lens.map(C) : [mix(col, '#2a2440', 0.4), mix(col, '#2a2440', 0.7)], lensC = mix(L2[0], L2[1], 0.5);
      fan(shape, ctr, off + 0.004, (v) => mix(L2[0], L2[1], v), null, lite(lensC, 0.1)); band2(outer, shape, off + (spec.strap ? 0.006 : 0.002), rimC);
      if (spec.strap) for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = P1(outer[i][0], outer[i][1], 0.004), b = P1(outer[j][0], outer[j][1], 0.004), c2 = P1(outer[j][0], outer[j][1], off + 0.006), d2 = P1(outer[i][0], outer[i][1], off + 0.006), hint = [outer[i][0] - cx, outer[i][1] - ey, 0], rc = shade(rimC, 0.75); mb.triH(a, b, c2, hint, rc, rc, rc, K_h, K_h, K_h, true); mb.triH(a, c2, d2, hint, rc, rc, rc, K_h, K_h, K_h, true); }
      mb.poly(proj([[cx - 0.04 * s, ey + 0.045], [cx - 0.01 * s, ey + 0.045], [cx - 0.05 * s, ey - 0.02], [cx - 0.075 * s, ey - 0.02]], off + 0.007), lite(lensC, 0.5), K_h, facePt(cx, ey).n, { flat: true, nh: true });
    }
  });
  // bridge (a small arch resting just above the nose) + temples, or the goggle strap
  const bc = spec.rim ? C(spec.rim) : spec.rimDark ? C('#17141f') : spec.rimCol ? col : shade(col, 0.6), bx = spec.clear ? 0.053 : 0.046;
  tubePT(mb, [0, 1, 2, 3, 4].map((i) => { const t = i / 4, x = lerp(-bx, bx, t); return P1(x, ey + 0.012 + 0.012 * Math.sin(t * Math.PI), off + 0.001); }), 0.007, bc, { n: 3, sk: K_h, nh: true });
  if (spec.strap) strap(0.2, ey, 0.36, 0.02, '#8a5a30', 3);
  else [1, -1].forEach((s) => { const sh = spec.shape(s * 0.124, ey, s); let hx = 0, hy = ey; sh.forEach(([x, y]) => { if (Math.abs(x) > hx - 0.004 && y >= ey - 0.01) { if (Math.abs(x) > hx) hy = y; hx = Math.max(hx, Math.abs(x)); } }); temple(s, Math.min(hx, 0.215), Math.max(hy, ey + 0.005), off + 0.001, 0.008, bc); });
}

// ------------------------------------------------------------------ boombox (hand prop and NPC bench prop). Built around the origin facing +z; c = centre, rot = euler, sc = scale.
export function boombox(mb, glow, c, rot, sc, sk, colour, parts) {
  sc = sc || 1; const M = mat(c, rot), E = M.elements, P = (x, y, z) => { const v = [x * sc, y * sc, z * sc]; return [E[0] * v[0] + E[4] * v[1] + E[8] * v[2] + E[12], E[1] * v[0] + E[5] * v[1] + E[9] * v[2] + E[13], E[2] * v[0] + E[6] * v[1] + E[10] * v[2] + E[14]]; };
  const body = C(colour || '#c0392b'), dark = C('#2b2a3f'), sil = C('#c9d3e6'), nz = [E[8], E[9], E[10]];
  box(mb, c, [0.36 * sc, 0.21 * sc, 0.11 * sc], body, sk, { rot, col2: lite(body, 0.12) });
  [-1, 1].forEach((s) => {
    const ring = [], ring2 = [], z2 = parts ? 0.056 : 0.062;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ring.push(P(s * 0.105 + Math.cos(a) * 0.06, -0.015 + Math.sin(a) * 0.06, 0.057)); ring2.push(P(s * 0.105 + Math.cos(a) * 0.043, -0.015 + Math.sin(a) * 0.043, z2)); }
    for (let i = 0; i < 8; i++) { mb.triH(ring[i], ring[(i + 1) % 8], ring2[(i + 1) % 8], nz, sil, sil, shade(sil, 0.7), sk, sk, sk, true); mb.triH(ring[i], ring2[(i + 1) % 8], ring2[i], nz, sil, shade(sil, 0.7), shade(sil, 0.7), sk, sk, sk, true); mb.triH(P(s * 0.105, -0.015, 0.066), ring2[i], ring2[(i + 1) % 8], nz, dark, dark, dark, sk, sk, sk, true); }
  });
  mb.poly([P(-0.05, 0.045, 0.0565), P(0.05, 0.045, 0.0565), P(0.05, 0.085, 0.0565), P(-0.05, 0.085, 0.0565)], '#17141f', sk, nz, { flat: true, nh: true });
  mb.poly([P(-0.04, 0.052, 0.058), P(0.04, 0.052, 0.058), P(0.04, 0.078, 0.058), P(-0.04, 0.078, 0.058)], '#9dff4a', sk, nz, { flat: true, nh: true, centre: '#e8ffd0' });
  tubePT(mb, [P(-0.13, 0.105, 0), P(-0.1, 0.16, 0), P(0.1, 0.16, 0), P(0.13, 0.105, 0)], 0.011 * sc, sil, { n: 4, sk, nh: true });
  tubePT(mb, [P(0.14, 0.105, -0.03), P(0.26, 0.3, -0.06)], 0.004 * sc, sil, { n: 3, sk, nh: true });
  if (glow) [[0.12, '#9dff4a'], [0.145, '#ffd23f'], [0.17, '#ff3ea5']].forEach(([x, c2]) => glow.poly([P(x * 0.9, 0.07, 0.0575), P(x * 0.9 + 0.018, 0.07, 0.0575), P(x * 0.9 + 0.018, 0.092, 0.0575), P(x * 0.9, 0.092, 0.0575)], C(c2).multiplyScalar(1.15), sk, nz, { flat: true, nh: true }));
}
// boombox handle height above the box centre (box-local, before scale): the hand clip of the boombox puts this bar through the fist
export const BOX_HANDLE_Y = 0.16;

// ------------------------------------------------------------------ accessories
// where every accessory ended up (rest pose, body space), for the tests: { neck: { path, pend }, ears: [...], wrist: {...}, back: {...} }
export function buildAccessories(mb, glow, ctx, api) {
  const acc = ctx.look.acc || {}, d = ctx.d, look = ctx.look, W = ctx.rest, hatId = (look.hat && look.hat.id) || 'none', K_h = K('head'), info = {};
  const A = (slot) => { const a = acc[slot]; return a && a.id && a.id.indexOf('none') !== 0 ? a : null; };
  const tsk = (y) => torsoSk(Math.min(y, 0.9));
  // ---- neck
  const nk = A('neck');
  if (nk) {
    const cc = C(nk.color || '#d4a017'), id = nk.id, pr = probes(ctx, 'torso'), F = (x, y, o) => FRONT(pr, x, y, o, look, d), yTop = 0.912;
    // the collar radius around the neck at the chain height (the shirt's neck trim, a turtleneck, a hood at the back)
    const neckAt = (th, y, o) => RING(pr, 0, 0.012, th, y, o, 0.11);
    if (id === 'chain' || id === 'cubanchain' || id === 'dogtags' || id === 'medal' || id === 'lanyard') {
      const flat = id === 'lanyard' || id === 'medal', th = id === 'cubanchain' ? 0.013 : id === 'dogtags' ? 0.0055 : id === 'chain' ? 0.0075 : 0.004, w = id === 'lanyard' ? 0.03 : 0.026, o = flat ? th / 2 + 0.003 : th + 0.003;
      const bot = id === 'chain' ? 0.76 : id === 'cubanchain' ? 0.8 : id === 'lanyard' ? 0.66 : id === 'medal' ? 0.72 : 0.74;
      // closed loop: behind the neck on the collar, over the top of the shoulders, then a U down the chest to `bot`
      const side = neckAt(Math.PI / 2, yTop, o), xs = Math.abs(side[0]), pts = [], ns = [];
      const add = (p, n) => { pts.push(p); ns.push(n); };
      [0.06, 0.1].forEach((z) => add(DOWN(pr, xs, z, o), [0, 1, 0]));
      const NU = 10; for (let i = 1; i < NU; i++) { const ph = lerp(Math.PI / 2, -Math.PI / 2, i / NU), x = xs * 1.02 * Math.sin(ph), y = bot + (yTop - 0.02 - bot) * (1 - Math.cos(ph)); add(F(x, y, o), [0, 0, 1]); }
      [0.1, 0.06].forEach((z) => add(DOWN(pr, -xs, z, o), [0, 1, 0]));
      for (let i = 0; i <= 6; i++) { const a = lerp(-Math.PI / 2, -Math.PI * 1.5, i / 6); add(neckAt(a, yTop, o), [Math.sin(a), 0, Math.cos(a)]); }
      // rays meet a hood collar or an overall strap at a slant: push every point straight off the nearest surface to its clearance
      for (let i = 0; i < pts.length; i++) pts[i] = push(pr, pts[i], o);
      // a wide collar (hood collar) moves the loop out over the shoulders: there it lies on top of the sleeve caps, never under them
      const all = probes(ctx, 'torsoAll'); for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p[1] < 0.84 || p[2] > 0.12) continue; const dn = DOWN(all, p[0], p[2], o); if (dn[1] > p[1]) pts[i] = [p[0], dn[1], p[2]]; pts[i] = push(all, pts[i], o); }
      // 2D: dog tag chains are silver (the tags take the colour), a cuban chain is mix(colour, gold, 0.5), the medal ribbon red on the right and blue on the left
      const skf = (p) => K2('chest', 'chain', clamp((0.88 - p[1]) / (0.88 - bot + 1e-3), 0, 1) * 0.5), base = id === 'lanyard' ? C(nk.color || '#e63946') : id === 'medal' ? C('#3a5fcd') : id === 'dogtags' ? C('#c9d3e6') : id === 'cubanchain' ? mixS(cc, '#e8b923', 0.5) : cc, colf = (t) => mix(base, id === 'dogtags' ? C('#8a96b0') : lite(base, 0.3), 0.5 + 0.5 * Math.sin(t * 70));
      if (flat) ribbon(mb, pts, ns, w, th, (t) => (id === 'medal' && pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))][0] < 0 ? C(nk.color2 || '#e63946') : colf(t)), (t) => skf(pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))]), true);
      else tubePT(mb, pts, th, colf, { n: 3, closed: true, sk: (t) => skf(pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))]) });
      // pendants hang from the bottom of the U and lie on the chest: z from the probe, tilt from the local slope
      const ck = K2('chest', 'chain', 0.5), lean = (x, y0, y1) => { const a = F(x, y0, 0), b = F(x, y1, 0); return Math.atan2(a[2] - b[2], y0 - y1); }, seat = (x, y, dep) => F(x, y, dep / 2 + 0.002);
      if (id === 'dogtags') { [[-0.012, 0.045, 0.12, cc], [0.014, 0.06, -0.1, shade(cc, 0.85)]].forEach(([x, dy, rz, c2]) => { const y = bot - dy, p = seat(x, y, 0.006); box(mb, p, [0.042, 0.06, 0.006], c2, ck, { rot: [lean(x, y + 0.03, y - 0.03), 0, rz] }); }); }
      if (id === 'medal') { const y = bot - 0.035, p = seat(0, y, 0.014), a = lean(0, y + 0.04, y - 0.04); puck(mb, p, [0, -Math.sin(a), Math.cos(a)], 0.048, 0.014, C('#ffd23f'), null, ck, 8); info.pend = p; }
      if (id === 'lanyard') {
        // the pass: a cream card with a clip bar in the strap colour and a photo square (2D)
        const y = bot - 0.06, p = seat(0, y, 0.006), a = lean(0, y + 0.045, y - 0.045), nz = [0, -Math.sin(a), Math.cos(a)], up = [0, Math.cos(a), Math.sin(a)], on = (u, v, e) => [p[0] + u, p[1] + up[1] * v + nz[1] * e, p[2] + up[2] * v + nz[2] * e];
        box(mb, p, [0.07, 0.09, 0.006], '#f7f2e8', ck, { rot: [a, 0, 0] });
        mb.poly([on(-0.03, 0.044, 0.004), on(0.03, 0.044, 0.004), on(0.03, 0.03, 0.004), on(-0.03, 0.03, 0.004)], C(nk.color2 || nk.color || '#e63946'), ck, nz, { flat: true });
        mb.poly([on(-0.024, 0.016, 0.004), on(0.0, 0.016, 0.004), on(0.0, -0.01, 0.004), on(-0.024, -0.01, 0.004)], C('#4a3a6a'), ck, nz, { flat: true });
        mb.poly([on(0.006, 0.006, 0.004), on(0.026, 0.006, 0.004), on(0.026, -0.0, 0.004), on(0.006, -0.0, 0.004)], C('#9a8ab8'), ck, nz, { flat: true });
      }
      if (id === 'cubanchain') {
        // the pendant: a gold block (mix(colour, gold, 0.5)) with an iced face (2D)
        const y = bot - 0.03, p = seat(0, y, 0.016), a = lean(0, y + 0.03, y - 0.03), nz = [0, -Math.sin(a), Math.cos(a)], up = [0, Math.cos(a), Math.sin(a)], on = (u, v, e) => [p[0] + u, p[1] + up[1] * v + nz[1] * e, p[2] + up[2] * v + nz[2] * e], gc = mixS(cc, '#e8b923', 0.5);
        box(mb, p, [0.05, 0.054, 0.014], gc, ck, { rot: [a, 0, 0], col2: lite(gc, 0.25) });
        mb.poly([on(-0.014, 0.016, 0.0075), on(0.014, 0.016, 0.0075), on(0.014, -0.016, 0.0075), on(-0.014, -0.016, 0.0075)], C(nk.color2 || '#d8f4ff'), ck, nz, { flat: true, centre: '#ffffff' }); info.pend = p;
      }
      info.neck = { path: pts, r: flat ? th / 2 : th };
    }
    if (id === 'scarf') {
      // wraps: rings sized from the probed collar per direction; a tail hangs down the chest on the cloth
      const ys = [0.896, 0.928, 0.96, 0.985], ring = (y, o) => { const f = neckAt(0, y, o)[2], b = -neckAt(Math.PI, y, o)[2], x = (Math.abs(neckAt(Math.PI / 2, y, o)[0]) + Math.abs(neckAt(-Math.PI / 2, y, o)[0])) / 2; return { rx: x, rz: (f + b) / 2, cz: (f - b) / 2 }; };
      const R = ys.map((y, i) => Object.assign(ring(y, i === 0 ? 0.004 : 0.024), { y, c: i === 0 ? shade(cc, 0.75) : i === 3 ? lite(cc, 0.1) : i % 2 ? cc : shade(cc, 0.9), sk: y > 0.95 ? K2('chest', 'neck', 0.6) : K('chest') }));
      R.forEach((r, i) => { if (i) { r.rx = Math.max(r.rx, R[i - 1].rx - 0.004); r.rz = Math.max(r.rz, R[i - 1].rz - 0.004); } });
      const stripe = C(nk.color2 || mixS(cc, '#ffffff', 0.55)); loft(mb, R, { n: 8, caps: '', sq: 0.9, fc: (i, j) => (j > 0 && i % 2 ? (j === 1 ? stripe : shade(stripe, 0.9)) : null) });
      const tp = [], tn = []; [[0.06, 0.9], [0.068, 0.84], [0.075, 0.78], [0.08, 0.72]].forEach(([x, y], i) => { tp.push(i === 0 ? [x, y, R[0].cz + R[0].rz * 0.95 + 0.012] : F(x, y, 0.013)); tn.push([0, 0, 1]); });
      ribbon(mb, tp, tn, 0.07, 0.022, (t) => (Math.round(t * 3) % 2 ? stripe : mix(cc, '#ffffff', 0.04 + 0.06 * t)), (t) => K2('chest', 'chain', t * 0.5), false);
      info.neck = { path: tp, r: 0.011 };
    }
    if (id === 'bowtie') {
      const y = 0.9, kz = Math.max(F(0, y - 0.006, 0)[2], neckAt(0, y + 0.01, 0)[2]), z = kz + 0.012, sk = K('chest');
      [1, -1].forEach((s) => { const wz = Math.max(F(s * 0.042, y - 0.006, 0)[2], kz - 0.01) + 0.012; box(mb, [s * 0.04, y, (z + wz) / 2], [0.066, 0.064, 0.022], cc, sk, { rot: [0, 0, s * Math.PI / 2], taper: 0.35, col2: lite(cc, 0.1) }); });
      ball(mb, [0, y, z + 0.004], [0.016, 0.02, 0.014], C(nk.color2 || lite(cc, 0.25)), sk, { detail: 0 }); info.neck = { path: [[0, y, z - 0.011]], r: 0 };
    }
    if (id === 'hpneck') {
      // headphones resting around the neck: the cups flop onto the shoulders either side of the neck, pads down, clear of the jaw; the band runs behind the neck
      const sk = K('chest'), R = 0.06, dep = 0.048, shell = cc, pad = C(nk.color2 || mixS(cc, '#17141f', 0.6)), cups = [];
      [1, -1].forEach((s) => { const th = s * 1.1, u = [Math.sin(th), 0, Math.cos(th)], nr = neckAt(th, 0.93, 0), rr = Math.hypot(nr[0], nr[2] - 0.012) + R * 0.9 + 0.012, ax = nrm([u[0] * 0.45, 1, u[2] * 0.45]), c = [u[0] * rr, 0, 0.012 + u[2] * rr];
        const e1 = nrm([ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]]), e2 = nrm([ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]]);
        let y = 0; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, rim = i < 9 ? R : 0, of = [-ax[0] * dep / 2 + (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)) * rim, -ax[1] * dep / 2 + (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)) * rim, -ax[2] * dep / 2 + (e1[2] * Math.cos(a) + e2[2] * Math.sin(a)) * rim]; y = Math.max(y, DOWN(pr, c[0] + of[0], c[2] + of[2], 0)[1] + 0.003 - of[1]); }
        c[1] = y; puck(mb, c, ax, R, dep, shell, pad, sk, 8); cups.push({ c, u, ax }); });
      const band = [], top = (k) => { const q = cups[k]; return [q.c[0] - q.u[0] * R * 0.75 + q.ax[0] * dep * 0.3, q.c[1] + q.ax[1] * dep * 0.3, q.c[2] - q.u[2] * R * 0.75 + q.ax[2] * dep * 0.3]; };
      band.push(top(0)); for (let i = 1; i < 8; i++) { const a = lerp(1.1 + 0.15, Math.PI * 2 - 1.1 - 0.15, i / 8), y = top(0)[1] + 0.012 * Math.sin((i / 8) * Math.PI); band.push(push(pr, neckAt(a, y, 0.02), 0.02)); } band.push(top(1));
      tubePT(mb, band, 0.016, shade(cc, 0.75), { n: 4, sk }); info.neck = { cups, path: band, r: 0.016 };
    }
  }
  // ---- ears
  const er = A('ears');
  if (er && !(er.id === 'hpears' && hatId === 'headphonehat')) {
    const cc = C(er.color || '#d4a017'), id = er.id;
    if (id === 'hpears') {
      // big headphones: cups over the ears (or over the hair or hat that covers them), the band over whatever is on top of the head
      const head = probes(ctx, 'head'), R = 0.088, dep = 0.06, cy = HY + 0.258, czc = -0.014, shell = shade(cc, 0.95), pad = C(er.color2 || mixS(cc, '#17141f', 0.55)), cups = [];
      [1, -1].forEach((s) => { let mx = 0.33; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, rr = i ? R * 0.92 : 0, hit = shoot(head, [0, cy + Math.sin(a) * rr, czc + Math.cos(a) * rr], [-s, 0, 0], 0, null, 1); if (hit) mx = Math.max(mx, Math.abs(hit[0])); }
        const c = [s * (mx + dep / 2 + 0.004), cy, czc]; puck(mb, c, [s, 0, 0], R, dep, shell, pad, K_h, 8); cups.push(c); });
      // the band is a sprung arch: the upper convex hull of every head, hair and hat vertex near its plane (pushed out by the band radius), from one cup top to the other,
      // so it rides over a crown, a bun or the rim of a brim and never cuts through one
      // a wide brim (cowboy, bucket, top hat...) right over the cups: the headphones are worn under the hat, the band hidden by its crown
      const yT = cy + R * 0.9, hp = probes(ctx, 'hat'), HT = hp.P, xc = Math.min(Math.abs(cups[0][0]), Math.abs(cups[1][0])); let under = false;
      for (let t = 0; t < hp.tris && !under; t++) { if (hp.NY[t] < 0.75) continue; for (let k = 0; k < 3; k++) { const q = t * 9 + k * 3; if (HT[q + 1] > yT - 0.03 && HT[q + 1] < cy + 0.25 && Math.abs(HT[q]) > xc - 0.03 && Math.abs(HT[q + 2] - czc) < 0.15) under = true; } }
      const band = [];
      if (!under) {
        const raw = [[cups[1][0], yT], [cups[0][0], yT]], HP = head.P;
        for (let i = 0; i < HP.length; i += 3) { const x = HP[i], y = HP[i + 1]; if (y < cy || Math.abs(HP[i + 2] - czc) > 0.1) continue; const l = Math.hypot(x, y - cy) || 1, k = (l + 0.026) / l; raw.push([x * k, cy + (y - cy) * k]); }
        for (let i = 0; i < 41; i++) { const a = lerp(0.1, Math.PI - 0.1, i / 40), u = [Math.cos(a), Math.sin(a), 0]; [-0.02, 0, 0.02].forEach((dz) => { const hit = shoot(head, [0, cy, czc + dz], [-u[0], -u[1], 0], 0, null, 1.4); if (hit) { const r = Math.hypot(hit[0], hit[1] - cy) + 0.026; raw.push([Math.cos(a) * r, cy + Math.sin(a) * r]); } }); }
        raw.sort((p, q) => p[0] - q[0] || p[1] - q[1]); const hull = []; for (const p of raw) { while (hull.length >= 2) { const a = hull[hull.length - 2], b = hull[hull.length - 1]; if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) hull.pop(); else break; } hull.push(p); }
        const arch = [[cups[1][0], yT]].concat(hull.filter((p) => p[1] > yT + 0.004), [[cups[0][0], yT]]);
        arch.forEach((p, k) => { if (k) { const q = arch[k - 1], n = Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 0.05); for (let j = 1; j < n; j++) band.push([lerp(q[0], p[0], j / n), lerp(q[1], p[1], j / n), czc]); } band.push([p[0], p[1], czc]); });
        tubePT(mb, band, 0.02, shade(cc, 0.75), { n: 3, sk: K_h });
        [0, 1].forEach((k) => box(mb, [cups[k][0], cy + R * 0.95, czc], [0.03, 0.05, 0.04], shade(cc, 0.6), K_h));
      }
      info.ears = { cups, band: under ? null : band, R, dep };
    } else {
      // earrings hang from the lobes; hair over the ears pushes them out onto the hair, a hat over the ears (hood) hides them
      const cover = probes(ctx, 'cover'), hat = probes(ctx, 'hat'), list = [];
      [1, -1].forEach((s) => {
        const lobe = [s * 0.305, HY + 0.205, -0.012], th = s * Math.atan2(0.305, -0.012 - ringAt(0.205).cz), hb = K(s > 0 ? 'hairSL' : 'hairSR'), drop = id === 'hoops' ? 0.1 : id === 'dangles' ? 0.09 : 0.02;
        let hid = false; for (const y of [0.2, 0.23, 0.26, 0.29]) for (const dt of [-0.12, 0, 0.12]) { const p = around(hat, th + s * dt, y, 0, 0); if (p[0] * s > 0.29) hid = true; } if (hid) return;
        let cr = 0; for (let k = 0; k <= 4; k++) { const y = 0.205 - drop * k / 4, p = around(cover, th, y, 0, 0); cr = Math.max(cr, Math.hypot(p[0], p[2] - ringAt(y).cz)); }
        const push = Math.max(0, cr - 0.302), sx = s * push, L = [lobe[0] + sx, lobe[1], lobe[2]], sk = push > 0 ? K_h : hb; list.push({ s, lobe: L, push });
        if (id === 'studs' || id === 'iced') ball(mb, [L[0] + s * 0.012, L[1] - 0.004, L[2] + 0.01], [0.014, 0.014, 0.014], id === 'iced' ? '#e8f4ff' : cc, K_h, { detail: 0, nh: true });
        if (id === 'hoops') { const pts = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; pts.push([L[0] + s * 0.016, L[1] - 0.046 + Math.cos(a) * 0.046, L[2] + 0.008 + Math.sin(a) * 0.046]); } tubePT(mb, pts, 0.0085, cc, { n: 3, closed: true, sk, nh: true }); }
        if (id === 'dangles') {
          const top = [L[0] + s * 0.014, L[1], L[2] + 0.008], sc = [L[0] + s * 0.018, L[1] - 0.068, L[2] + 0.01]; tubePT(mb, [top, [sc[0], sc[1] + 0.022, sc[2]]], 0.004, cc, { n: 3, sk, nh: true });
          const nv = nrm([s * 0.55, 0, 0.84]), up = [0, 1, 0], rt = nrm([up[1] * nv[2] - up[2] * nv[1], up[2] * nv[0] - up[0] * nv[2], up[0] * nv[1] - up[1] * nv[0]]), st = [];
          for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.01 : 0.024; st.push([Math.cos(a) * r, Math.sin(a) * r]); }
          const at = (u, v, o) => [sc[0] + rt[0] * u + nv[0] * o, sc[1] + v, sc[2] + rt[2] * u + nv[2] * o], yc = C('#ffd23f'), yd = shade(yc, 0.75);
          for (let i = 0; i < 10; i++) { const j = (i + 1) % 10, a = st[i], b = st[j]; mb.triH(at(0, 0, 0.005), at(a[0], a[1], 0.005), at(b[0], b[1], 0.005), nv, yc, yc, yc, sk, sk, sk, true); mb.triH(at(0, 0, -0.005), at(a[0], a[1], -0.005), at(b[0], b[1], -0.005), [-nv[0], 0, -nv[2]], yd, yd, yd, sk, sk, sk, true);
            const e = [(a[0] + b[0]) * rt[0], (a[1] + b[1]), (a[0] + b[0]) * rt[2]]; mb.triH(at(a[0], a[1], 0.005), at(b[0], b[1], 0.005), at(b[0], b[1], -0.005), e, yd, yd, yd, sk, sk, sk, true); mb.triH(at(a[0], a[1], 0.005), at(b[0], b[1], -0.005), at(a[0], a[1], -0.005), e, yd, yd, yd, sk, sk, sk, true); }
        }
      });
      info.ears = { list };
    }
  }
  // ---- wrist (left): wraps the bare forearm just above the wrist, or the sleeve cuff when the sleeve reaches the wrist; skinned exactly like the arm there
  const wr = A('wrist');
  if (wr) {
    const cc = C(wr.color || '#2ee6ff'), id = wr.id, s = 1, x = s * d.shX, sl = wearMeta(look).sleeveEnd, cuff = 0.915 - Math.min(1, sl) * 0.405, pr = probes(ctx, 'arm'), bare = cuff > W.wrL[1] + 0.09;
    const y0 = bare ? W.wrL[1] + 0.022 : cuff + 0.006, rAt = (y) => { let r = 0; for (let i = 0; i < 24; i++) { const p = RING(pr, x, 0, (i / 24) * Math.PI * 2, y, 0, 0.05, 0.2); r = Math.max(r, Math.hypot(p[0] - x, p[2])); } return r; };
    const rings = [], ring = (y, h, c, extra) => { const r = Math.max(rAt(y + h / 2), rAt(y - h / 2), rAt(y)) / Math.cos(Math.PI / 8) + 0.004 + (extra || 0), sk = armSkin(s, y); loft(mb, [{ y: y + h / 2, rx: r, rz: r, cx: x, c: lite(c, 0.06), sk }, { y: y - h / 2, rx: r, rz: r, cx: x, c: shade(c, 0.88), sk }], { n: 8, caps: '' }); rings.push({ y, h, r }); return r; };
    // 2D: watch: a dark strap and face, the hands in the wear colour; iced watch: a gold band and bezel round an iced face
    if (id === 'watch' || id === 'icedwatch') { const ice = id === 'icedwatch', y = y0 + 0.018, r = ring(y, 0.032, C(ice ? '#e8b923' : '#2a2236')), sk = armSkin(s, y), fx = x + r + 0.004; puck(mb, [fx, y, 0], [1, 0, 0], 0.024, 0.014, C(ice ? '#e8b923' : '#2a2236'), null, sk, 8);
      const fc = (pts, c) => mb.poly(pts.map(([v, w]) => [fx + 0.0075, y + v, w]), c, sk, [1, 0, 0], { flat: true, nh: true });
      if (ice) fc([[0.017, 0], [0, 0.017], [-0.017, 0], [0, -0.017]], C('#d8f4ff')); else { const hc = C(wr.color2 || wr.color || '#2ee6ff'); fc([[0.013, -0.002], [0.013, 0.002], [0, 0.002], [0, -0.002]], hc); fc([[-0.002, 0], [0.002, 0], [0.002, 0.01], [-0.002, 0.01]], hc); } if (ice) glow.poly([[fx + 0.0085, y + 0.012, -0.01], [fx + 0.0085, y + 0.012, 0.01], [fx + 0.0085, y - 0.008, 0]], C('#ffffff').multiplyScalar(0.95), sk, [1, 0, 0], { flat: true, nh: true }); }
    if (id === 'wristband') ring(y0 + 0.026, 0.048, cc);
    // 2D: three bangles: the wear colour (lightened), yellow, pink; stacked bands: the wear colour, yellow, pink, cyan
    if (id === 'bracelets') [C(wr.color2 || mixS(cc, '#ffffff', 0.25)), C('#ffe14d'), mixS('#ff4fa3', '#ffffff', 0.25)].forEach((c, i) => ring(y0 + 0.008 + i * 0.017, 0.012, c, i * 0.0015));
    if (id === 'stackedbands') [0.01, 0.029, 0.048, 0.067].forEach((o, i) => ring(y0 + o, 0.017, i ? C(['#ffe14d', '#ff4fa3', '#2ee6ff'][i - 1]) : cc, i * 0.0015));
    info.wrist = { x, rings, bare };
  }
  // ---- hand: mic or boombox in the right hand
  const hd = A('hand');
  if (hd) {
    const id = hd.id, s = -1, x = s * d.shX, wy = W.wrR[1], sk = K('wrR');
    if (/mic/.test(id)) {
      const gold = id === 'goldmic' ? C('#e8b923') : null, neon = id === 'neonmic';
      const nc = C(hd.color2 || hd.color || '#2ee6ff'), head = neon ? nc : gold || C('#aeb4cc'), handle = gold ? shade(gold, 0.75) : neon ? mixS(nc, '#17141f', 0.5) : C('#3a3850'), m = micMatrix(x, wy, 0), hy = MIC.head, t0 = -MIC.tail, R = MIC.r;
      // built along +y around the grip, then turned onto the mic axis: cable end below the fist, handle through it, a flared neck, the ball grille with its band
      loft(mb, [{ y: t0, rx: 0.015, rz: 0.015, c: shade(handle, 0.6), sk }, { y: t0 + 0.05, rx: 0.019, rz: 0.019, c: shade(handle, 0.85), sk }, { y: hy - 0.05, rx: 0.025, rz: 0.025, c: handle, sk }, { y: hy - 0.03, rx: 0.03, rz: 0.03, c: lite(handle, 0.2), sk }], { n: 6, caps: 'bt', m });
      ball(mb, [0, hy, 0], [R, R * 1.25, R], head, sk, { detail: 0, col2: lite(head, 0.25), m });
      loft(mb, [{ y: hy + 0.012, rx: R + 0.002, rz: R + 0.002, c: neon ? C('#2b2a3f') : shade(head, 0.45), sk }, { y: hy - 0.014, rx: R + 0.002, rz: R + 0.002, c: neon ? C('#2b2a3f') : shade(head, 0.45), sk }], { n: 6, caps: '', nh: true, m });
      if (neon) { const g = (p) => { const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(m); return [v.x, v.y, v.z]; }; glow.poly([[-0.028, hy + 0.03, R - 0.002], [0.028, hy + 0.03, R - 0.002], [0.028, hy + 0.012, R + 0.003], [-0.028, hy + 0.012, R + 0.003]].map(g), lite(nc, 0.2).multiplyScalar(1.1), sk, new THREE.Vector3(0, 0, 1).transformDirection(m).toArray(), { flat: true, nh: true }); }
    }
    // the handle bar goes through the middle of the fist (the hand loft is 1.25x the wrist profile; its knuckle ring sits 0.075 * 1.25 below the wrist; the bar sits low in it so the box hangs clear of the fingers)
    if (id === 'boombox') { const sc = 0.9, fy = wy - 0.075 * 1.25 - 0.022; boombox(mb, glow, [x, fy - (BOX_HANDLE_Y + 0.011) * sc, 0.012], [0, Math.PI / 2, 0], sc, sk, hd.color || '#c0392b'); info.hand = { fist: [x, fy, 0.012] }; }
  }
  // ---- back
  const bk = A('back');
  if (bk) {
    const cc = C(bk.color || '#6b6b80'), id = bk.id, sk = K('chest'), pr = probes(ctx, 'torso'), Bk = (x, y, o) => BACK(pr, x, y, o, look, d), Fr = (x, y, o) => FRONT(pr, x, y, o, look, d);
    // support plane z = a + b*(y - yc) touching the back over a footprint (the pack never sinks in, a tilt follows the hood or a big puffer)
    const plane = (xs, ys, yc) => { const pts = []; xs.forEach((x) => ys.forEach((y) => pts.push([y - yc, Bk(x, y, 0)[2]]))); let best = null; for (let b = -0.5; b <= 0.501; b += 0.05) { let a = 1e9; pts.forEach(([dy, z]) => { a = Math.min(a, z - b * dy); }); let cost = 0; pts.forEach(([dy, z]) => { cost += z - a - b * dy; }); if (!best || cost < best.cost) best = { a, b, cost }; } return best; };
    const strapAt = (pts, ns, w, c) => ribbon(mb, pts, ns, w, 0.012, c, (t) => tsk(pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))][1]), false);
    const o = 0.009;
    if (id === 'backpack') {
      const yc = 0.72, H2 = 0.15, D2 = 0.065, pl = plane([-0.12, 0, 0.12], [0.6, 0.66, 0.72, 0.78, 0.86], yc), al = Math.atan(pl.b), ca = Math.cos(al), sa = Math.sin(al), fz = (y) => pl.a + pl.b * (y - yc) - 0.002;
      const c = [0, yc + sa * D2, fz(yc) - ca * D2]; box(mb, c, [0.26, 0.3, 0.13], cc, sk, { taper: 0.92, rot: [al, 0, 0] }); box(mb, [0, c[1] - 0.06 * ca + sa * 0.075, c[2] - ca * 0.075 - 0.06 * sa], [0.2, 0.12, 0.03], C(bk.color2 || shade(cc, 0.8)), sk, { rot: [al, 0, 0] });
      const straps = [];
      [1, -1].forEach((s) => { const x = s * 0.095, pts = [[x, yc + H2 * 0.85, fz(yc + H2 * 0.85) + 0.004], Bk(x * 1.05, 0.875, o), DOWN(pr, x * 1.12, -0.05, o), DOWN(pr, x * 1.16, 0.03, o), Fr(x * 1.22, 0.85, o), Fr(x * 1.3, 0.75, o), Fr(s * 0.14, 0.66, o), RING(pr, 0, 0, s * Math.PI / 2, 0.62, o - 0.02, 0.15), [x * 1.1, yc - H2 * 0.85, fz(yc - H2 * 0.85) + 0.004]];
        const ns = [[0, 0, -1], [0, 0, -1], [0, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, 1], [0, 0, 1], [s, 0, 0], [0, 0, -1]]; strapAt(pts, ns, 0.036, (t) => (t > 0.6 && t < 0.68 ? C('#cfd3e6') : shade(cc, 0.85))); straps.push(pts); });
      info.back = { plane: pl, yc, front: fz, straps };
    }
    if (id === 'cape') {
      // rows hang just behind the back (probed per row across its width), tied at the front of the collar with a cord and a clasp
      const ys = [0.9, 0.72, 0.56, 0.38], rows = []; let prev = 0;
      ys.forEach((y, i) => { const rx = 0.14 + i * 0.05, rz = 0.026, zb = Math.min(...[-0.6, -0.3, 0, 0.3, 0.6].map((k) => Bk(k * rx, y, 0)[2])); let cz = zb - rz - 0.008; if (i) cz = Math.min(cz, prev + 0.01); prev = cz; rows.push({ y, rx, rz, cz, c: mix(cc, shade(cc, 0.7), i / 3), sk: i < 1 ? K('chest') : K2('chest', 'cape', clamp(i / 2, 0, 1)) }); });
      loft(mb, rows, { n: 8, caps: '', a0: 0 });
      const r0 = rows[0], cord = [[r0.rx * 0.92, r0.y, r0.cz + 0.01], RING(pr, 0, 0.012, 1.25, 0.905, 0.008, 0.11), RING(pr, 0, 0.012, 0.6, 0.9, 0.008, 0.11), RING(pr, 0, 0.012, -0.6, 0.9, 0.008, 0.11), RING(pr, 0, 0.012, -1.25, 0.905, 0.008, 0.11), [-r0.rx * 0.92, r0.y, r0.cz + 0.01]];
      tubePT(mb, cord, 0.009, shade(cc, 0.6), { n: 3, sk }); const fc = RING(pr, 0, 0.012, 0, 0.9, 0.012, 0.11); ball(mb, fc, [0.02, 0.02, 0.012], '#ffd23f', sk, { detail: 0 });
      info.back = { rows, cord };
    }
    if (id === 'wings') {
      const roots = [];
      [1, -1].forEach((s) => { const zr = Bk(s * 0.09, 0.8, 0)[2] - 0.006, p = (x, y, z) => [s * x, y, z - (-0.14) + zr]; roots.push(p(0.08, 0.8, -0.14)); const col = C(bk.color || '#ff3ea5').multiplyScalar(1.05), col2 = C(bk.color2 || lite(C(bk.color || '#ff3ea5'), 0.45)).multiplyScalar(1.05);
        [[-1, 1], [1, -1]].forEach(([hz]) => { glow.triH(p(0.08, 0.8, -0.14), p(0.5, 1.1, -0.2), p(0.35, 0.8, -0.2), [0, 0, hz], col, col2, col, sk, sk, sk, true, true); glow.triH(p(0.08, 0.78, -0.14), p(0.35, 0.8, -0.2), p(0.4, 0.55, -0.2), [0, 0, hz], col, col2, col2, sk, sk, sk, true, true); }); });
      info.back = { roots };
    }
    if (id === 'guitar') {
      // body low on the back, the neck up over the left shoulder along one axis; slung on a strap over that shoulder and across the chest
      const bc = [-0.04, 0.6], ax = [Math.sin(0.5), Math.cos(0.5)], at = (k) => [bc[0] + ax[0] * k, bc[1] + ax[1] * k], pl = plane([-0.15, -0.04, 0.07], [0.46, 0.6, 0.74], 0.6), zb = pl.a - 0.004, gz = zb - 0.06, rz = -0.5, wood = C('#b5573f'), sk2 = K('chest');
      ball(mb, [bc[0], bc[1], gz], [0.16, 0.2, 0.06], wood, sk2, { detail: 1, rot: [0, 0, rz] }); ball(mb, [bc[0] + ax[0] * 0.03, bc[1] + ax[1] * 0.03, gz - 0.058], [0.05, 0.05, 0.006], '#3a2a20', sk2, { detail: 0, rot: [0, 0, rz] });
      const nc = at(0.37), hs = at(0.58), s0 = at(0.3), s1 = at(-0.17); box(mb, [nc[0], nc[1], gz], [0.04, 0.34, 0.03], '#7a5238', sk2, { rot: [0, 0, rz] }); box(mb, [hs[0], hs[1], gz], [0.05, 0.08, 0.035], '#3a2a20', sk2, { rot: [0, 0, rz] });
      const pts = [[s0[0], s0[1], gz + 0.02], Bk(0.13, 0.86, o), DOWN(pr, 0.13, -0.04, o), DOWN(pr, 0.13, 0.04, o), Fr(0.1, 0.82, o), Fr(0.02, 0.72, o), Fr(-0.08, 0.62, o), Fr(-0.14, 0.54, o), RING(pr, 0, 0, -Math.PI / 2, 0.52, o, 0.16), Bk(-0.13, 0.5, o), [s1[0], s1[1], gz + 0.03]];
      strapAt(pts, [[0, 0, -1], [0, 0, -1], [0, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, 0, -1]], 0.032, '#3a2a1a');
      info.back = { gz, zb, bc, strap: pts };
    }
    if (id === 'crossbody') {
      // a small bag at the front of the right hip, its strap over the left shoulder, diagonally across chest and back
      const bw = 0.124, bx = -Math.min(0.1, d.shX - 0.074 - bw / 2), by = 0.6, bh = 0.1, bd = 0.055; let zf = -1; [-0.055, 0, 0.055].forEach((u) => [-0.04, 0, 0.04].forEach((v) => { zf = Math.max(zf, Fr(bx + u, by + v, 0)[2]); }));
      const bz = zf + bd / 2 + 0.003, bsk = tsk(by); box(mb, [bx, by, bz], [bw, bh, bd], cc, bsk, { col2: lite(cc, 0.1) }); box(mb, [bx, by + 0.02, bz + bd / 2 + 0.003], [bw * 0.92, bh * 0.6, 0.006], shade(cc, 0.8), bsk); box(mb, [bx, by + 0.0, bz + bd / 2 + 0.007], [0.018, 0.012, 0.004], '#d4a017', bsk);
      const front = [[bx + bw / 2 - 0.004, by + bh / 2, bz], Fr(-0.05, 0.68, o), Fr(0.03, 0.76, o), Fr(0.1, 0.84, o), DOWN(pr, 0.125, 0.05, o), DOWN(pr, 0.125, -0.04, o), Bk(0.11, 0.84, o), Bk(0.02, 0.74, o), Bk(-0.08, 0.64, o), RING(pr, 0, 0, -Math.PI / 2, 0.6, o, 0.16), [bx - bw / 2 + 0.004, by + bh / 2, bz]];
      strapAt(front, [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, -1], [0, 0, -1], [-1, 0, 0], [0, 0, 1]], 0.026, C(bk.color2 || shade(cc, 0.9)));
      info.back = { bag: [bx, by, bz, bw, bh, bd], zf, strap: front };
    }
  }
  if (api) api.gearInfo = info;
}
