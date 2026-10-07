// CHARACTER GEOMETRY KIT (owned by the Character Artist). Hand-built faceted geometry for the chibi characters.
// Everything is emitted into a MeshBuilder (MB) as flat-coloured, rigidly or 2-bone skinned triangles with a baked AO tint.
// Absolute rest coordinates (metres, feet at y=0, +z forward, character LEFT = +x). The skeleton in BONES is defined here too.
import { THREE } from './kit.js';

// ------------------------------------------------------------------ colour helpers (inputs are sRGB hex or THREE.Color)
export const C = (h) => (h && h.isColor ? h.clone() : new THREE.Color(h || '#ff00ff'));
export const mix = (a, b, t) => C(a).lerp(C(b), t);
const VIOLET = new THREE.Color('#3b2a66'), WARM = new THREE.Color('#fff0d0');
export const shade = (a, k) => { const c = C(a); c.multiplyScalar(k); return c.lerp(VIOLET, Math.max(0, 1 - k) * 0.22); };       // hue-shifted darker (cool violet shadows)
export const lite = (a, k) => { const c = C(a); c.lerp(WARM, k); return c; };                                                      // lighter toward warm cream
export const skinShade = (a, k) => { const c = C(a); c.multiplyScalar(k); return c.lerp(new THREE.Color('#8a2f45'), Math.max(0, 1 - k) * 0.16); }; // warm blood-red shadows for skin
export const INK = '#2b2438', CREAM = '#fff2dc';

// ------------------------------------------------------------------ body dimensions per body type
export function dims(body) {
  const b = body === 'boy' ? 1 : body === 'girl' ? -1 : 0;
  return { b, shX: 0.225 + 0.012 * b, hipX: 0.1 - 0.006 * b, chestRx: 0.178 + 0.012 * b, chestRz: 0.14, waistRx: 0.15 - 0.004 * b, hipRx: 0.165 - 0.01 * b, shoulderRx: 0.205 + 0.014 * b };
}

// ------------------------------------------------------------------ skeleton
// [name, parent, x, y, z] rest local offsets. Legs and arms hang along -y with identity rest rotation.
export function boneSpec(d) {
  return [
    ['hips', null, 0, 0.5, 0], ['spine', 'hips', 0, 0.07, 0], ['chest', 'spine', 0, 0.14, 0], ['neck', 'chest', 0, 0.2, 0], ['head', 'neck', 0, 0.07, 0],
    ['shL', 'chest', d.shX, 0.155, 0], ['elL', 'shL', 0, -0.19, 0], ['wrL', 'elL', 0, -0.165, 0],
    ['shR', 'chest', -d.shX, 0.155, 0], ['elR', 'shR', 0, -0.19, 0], ['wrR', 'elR', 0, -0.165, 0],
    ['thL', 'hips', d.hipX, -0.04, 0], ['knL', 'thL', 0, -0.2, 0], ['anL', 'knL', 0, -0.175, 0],
    ['thR', 'hips', -d.hipX, -0.04, 0], ['knR', 'thR', 0, -0.2, 0], ['anR', 'knR', 0, -0.175, 0],
    ['eyeL', 'head', 0.124, 0.27, 0.262], ['eyeR', 'head', -0.124, 0.27, 0.262], ['mouth', 'head', 0, 0.118, 0.255],
    ['cheekL', 'head', 0.2, 0.14, 0.13], ['cheekR', 'head', -0.2, 0.14, 0.13], ['browL', 'head', 0.124, 0.352, 0.268], ['browR', 'head', -0.124, 0.352, 0.268],
    ['puffL', 'head', 0.2, 0.5, -0.02], ['puffR', 'head', -0.2, 0.5, -0.02], ['hairB', 'head', 0, 0.42, -0.25], ['hairB2', 'hairB', 0, -0.2, -0.02],
    ['hairSL', 'head', 0.285, 0.26, -0.02], ['hairSR', 'head', -0.285, 0.26, -0.02], ['brim', 'head', 0, 0.37, 0.27], ['tail', 'head', 0, 0.34, -0.27], ['beard', 'head', 0, 0.06, 0.2],
    ['chain', 'chest', 0, 0.2, 0.12], ['cape', 'chest', 0, 0.2, -0.14], ['hem', 'hips', 0, 0.02, 0],
  ];
}
export const BONE_NAMES = boneSpec(dims('neutral')).map((s) => s[0]);
export const BI = {}; BONE_NAMES.forEach((n, i) => { BI[n] = i; });
// skin descriptors: [bone1, bone2, weightOf2]
export const K = (n) => [BI[n], BI[n], 0];
export const K2 = (a, b, w) => [BI[a], BI[b], w];
export const side = (s, n) => n + (s > 0 ? 'L' : 'R');            // s = +1 left (+x), -1 right (-x)

// absolute rest positions of every bone (root space)
export function restWorld(d) { const w = {}; boneSpec(d).forEach(([n, p, x, y, z]) => { const q = p ? w[p] : [0, 0, 0]; w[n] = [q[0] + x, q[1] + y, q[2] + z]; }); return w; }

// ------------------------------------------------------------------ MeshBuilder
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
export class MB {
  constructor(seed) { this.P = []; this.Cl = []; this.S = []; this.H = []; this.seed = (seed || 7) >>> 0; }
  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  get tris() { return this.H.length; }
  // one triangle. a,b,c = [x,y,z]; ca,cb,cc = Color; sa,sb,sc = [i,j,w]; nh = exclude from outline hull; flat = no baked shading
  tri(a, b, c, ca, cb, cc, sa, sb, sc, nh, flat) {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _c.set(c[0], c[1], c[2]);
    _n.crossVectors(_b.sub(_a), _c.sub(_a)); const l = _n.length(); if (l < 1e-9) return; _n.multiplyScalar(1 / l);
    let f = 1; if (!flat) { const k = _n.y * 0.5 + 0.5; f = (0.94 + 0.18 * k) + (this.rnd() - 0.5) * 0.05; }
    const cols = [ca, cb || ca, cc || ca], pts = [a, b, c], sks = [sa, sb || sa, sc || sa];
    for (let i = 0; i < 3; i++) { const p = pts[i], q = cols[i], s = sks[i]; this.P.push(p[0], p[1], p[2]); this.Cl.push(Math.min(1.3, q.r * f), Math.min(1.3, q.g * f * (flat ? 1 : 0.995)), Math.min(1.3, q.b * f * (flat ? 1 : 1.02))); this.S.push(s[0], s[1], s[2]); }
    this.H.push(nh ? 1 : 0);
  }
  // triangle with winding fixed so its normal agrees with hint (a [x,y,z] direction)
  triH(a, b, c, hint, ca, cb, cc, sa, sb, sc, nh, flat) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0) this.tri(a, b, c, ca, cb, cc, sa, sb, sc, nh, flat); else this.tri(a, c, b, ca, cc, cb, sa, sc, sb, nh, flat);
  }
  // convex polygon fan (decals, lens shapes): pts [[x,y,z]...], hint = outward normal
  poly(pts, col, sk, hint, o) {
    o = o || {}; const c = C(col), s = sk || K('head');
    if (!hint) hint = [0, 0, 1];
    let cx = 0, cy = 0, cz = 0; pts.forEach((p) => { cx += p[0]; cy += p[1]; cz += p[2]; }); const m = pts.length, ctr = [cx / m, cy / m, cz / m];
    const cc = o.centre ? C(o.centre) : c;
    for (let i = 0; i < m; i++) this.triH(ctr, pts[i], pts[(i + 1) % m], hint, cc, c, c, s, s, s, o.nh !== false, o.flat);
  }
}

// ------------------------------------------------------------------ primitives
const _m = new THREE.Matrix4(), _v = new THREE.Vector3();
function xf(m, p) { if (!m) return p; _v.set(p[0], p[1], p[2]).applyMatrix4(m); return [_v.x, _v.y, _v.z]; }
export function mat(pos, rot, scl) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ')); return new THREE.Matrix4().compose(new THREE.Vector3(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0), q, new THREE.Vector3(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1)); }

const sgnpow = (s, e) => Math.sign(s) * Math.pow(Math.abs(s), e);
// Ring loft: the workhorse. rings = [{ y, rx, rz, cx, cz, c, sk, sq, rot }], axis = y (apply o.m to reorient).
// o: n (sides, default 8), a0 (start angle), caps ('b','t','bt'), capTip ([x,y,z] apex for top cap), m (Matrix4), nh, fc(i,j)=>Color for per-facet colour, sq default squareness exponent
export function loft(mb, rings, o) {
  o = o || {}; const n = o.n || 8, a0 = o.a0 === undefined ? Math.PI / n : o.a0, M = o.m || null, flip = M && M.determinant() < 0, nh = !!o.nh;
  const R = rings.map((r) => {
    const col = C(r.c || '#ff00ff'), e = r.sq || o.sq || 1, pts = [];
    for (let i = 0; i < n; i++) { const th = a0 + (i / n) * Math.PI * 2 + (r.rot || 0); pts.push(xf(M, [(r.cx || 0) + r.rx * sgnpow(Math.sin(th), e), r.y, (r.cz || 0) + r.rz * sgnpow(Math.cos(th), e)])); }
    return { pts, col, sk: r.sk || K('hips'), ctr: xf(M, [r.cx || 0, r.y, r.cz || 0]) };
  });
  const T = (a, b, c, ca, cb, cc, sa, sb, sc) => { if (flip) mb.tri(a, c, b, ca, cc, cb, sa, sc, sb, nh, o.flat); else mb.tri(a, b, c, ca, cb, cc, sa, sb, sc, nh, o.flat); };
  for (let j = 0; j < R.length - 1; j++) {
    const r0 = R[j], r1 = R[j + 1];
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n, A = r0.pts[i], B = r0.pts[i2], Cc = r1.pts[i2], D = r1.pts[i];
      if (o.fc) { const fc = o.fc(i, j) || r0.col; T(A, B, Cc, fc, fc, fc, r0.sk, r0.sk, r1.sk); T(A, Cc, D, fc, fc, fc, r0.sk, r1.sk, r1.sk); }
      else { T(A, B, Cc, r0.col, r0.col, r1.col, r0.sk, r0.sk, r1.sk); T(A, Cc, D, r0.col, r1.col, r1.col, r0.sk, r1.sk, r1.sk); }
    }
  }
  const caps = o.caps || '';
  if (caps.indexOf('b') >= 0) { const r = R[0], hint = M ? new THREE.Vector3(0, -1, 0).transformDirection(M).toArray() : [0, -1, 0]; for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; mb.triH(r.ctr, r.pts[i], r.pts[i2], hint, r.col, r.col, r.col, r.sk, r.sk, r.sk, nh, o.flat); } }
  if (caps.indexOf('t') >= 0) { const r = R[R.length - 1], apex = o.capTip ? xf(M, o.capTip) : r.ctr, hint = M ? new THREE.Vector3(0, 1, 0).transformDirection(M).toArray() : [0, 1, 0]; const cc = o.capCol ? C(o.capCol) : r.col; for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; mb.triH(apex, r.pts[i], r.pts[i2], hint, cc, r.col, r.col, r.sk, r.sk, r.sk, nh, o.flat); } }
}

// faceted ball / ellipsoid (icosphere detail 0 = 20 tris, 1 = 80). o: col2 (top colour), detail, jit, nh, m, flat
const _ico = {};
function icoPositions(detail) {
  if (_ico[detail]) return _ico[detail];
  const g = new THREE.IcosahedronGeometry(1, detail).toNonIndexed(), p = g.attributes.position.array; _ico[detail] = Float32Array.from(p); return _ico[detail];
}
const _rm = new THREE.Matrix4(), _re = new THREE.Euler();
function rotM(r) { _re.set(r[0], r[1], r[2], 'YXZ'); return _rm.makeRotationFromEuler(_re); }
export function ball(mb, c, r, col, sk, o) {
  o = o || {}; const p = icoPositions(o.detail || 0), rr = Array.isArray(r) ? r : [r, r, r], M = o.m || null, c1 = C(col), c2 = o.col2 ? C(o.col2) : c1, s = sk || K('head'), jit = o.jit || 0;
  const v = []; const jm = {};
  for (let i = 0; i < p.length; i += 3) {
    let x = p[i], y = p[i + 1], z = p[i + 2];
    if (jit) { const key = x.toFixed(3) + y.toFixed(3) + z.toFixed(3); let j = jm[key]; if (!j) { j = jm[key] = [(mb.rnd() - 0.5) * jit, (mb.rnd() - 0.5) * jit, (mb.rnd() - 0.5) * jit]; } x += j[0]; y += j[1]; z += j[2]; }
    let px = x * rr[0], py = y * rr[1], pz = z * rr[2];
    if (o.rot) { _v.set(px, py, pz).applyMatrix4(rotM(o.rot)); px = _v.x; py = _v.y; pz = _v.z; }
    v.push([c[0] + px, c[1] + py, c[2] + pz, y]);
  }
  const flip = M && M.determinant() < 0;
  for (let i = 0; i < v.length; i += 3) {
    const cl = [0, 1, 2].map((k) => c1.clone().lerp(c2, Math.max(0, Math.min(1, v[i + k][3] * 0.5 + 0.5))));
    const a = xf(M, v[i]), b = xf(M, v[i + 1]), d = xf(M, v[i + 2]);
    if (flip) mb.tri(a, d, b, cl[0], cl[2], cl[1], s, s, s, o.nh, o.flat); else mb.tri(a, b, d, cl[0], cl[1], cl[2], s, s, s, o.nh, o.flat);
  }
}

// box (w,h,d) centred at c, optional euler rot, optional taper (top scale), per-face colours not needed (baked shading does the work)
export function box(mb, c, sz, col, sk, o) {
  o = o || {}; const M = mat(c, o.rot), cl = C(col), cl2 = o.col2 ? C(o.col2) : cl, s = sk || K('chest'), hx = sz[0] / 2, hy = sz[1] / 2, hz = sz[2] / 2, tp = o.taper === undefined ? 1 : o.taper;
  const P = (x, y, z) => xf(M, [x * (y > 0 ? tp : 1), y, z * (y > 0 ? tp : 1)]);
  const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
  const cc = (i) => (i === 2 || i === 3 || i === 6 || i === 7 ? cl2 : cl);
  const F = (i, j, k, l) => { const nrm = (() => { const a = v[i], b = v[j], d = v[k]; return [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])]; })(); const ctr = [0, 0, 0].map((_, q) => (v[0][q] + v[1][q] + v[2][q] + v[3][q] + v[4][q] + v[5][q] + v[6][q] + v[7][q]) / 8), fc = [0, 1, 2].map((q) => (v[i][q] + v[j][q] + v[k][q] + v[l][q]) / 4 - ctr[q]); const hint = fc; mb.triH(v[i], v[j], v[k], hint, cc(i), cc(j), cc(k), s, s, s, o.nh, o.flat); mb.triH(v[i], v[k], v[l], hint, cc(i), cc(k), cc(l), s, s, s, o.nh, o.flat); void nrm; };
  F(4, 5, 6, 7); F(1, 0, 3, 2); F(0, 4, 7, 3); F(5, 1, 2, 6); F(3, 7, 6, 2); F(0, 1, 5, 4);
}

// tube along a polyline. pts [[x,y,z]...], rad number|array|fn(t), col Color|fn(t). o: n sides, closed, tip (end cone apex extension), sk fn(t)->skin or skin, nh, caps
export function tube(mb, pts, rad, col, o) {
  o = o || {}; const n = o.n || 5, N = pts.length, closed = !!o.closed, nh = !!o.nh;
  const rf = typeof rad === 'function' ? rad : Array.isArray(rad) ? (t) => { const f = t * (rad.length - 1), i = Math.min(rad.length - 2, Math.floor(f)); return rad[i] + (rad[i + 1] - rad[i]) * (f - i); } : () => rad;
  const cf = typeof col === 'function' ? col : () => C(col), sf = typeof o.sk === 'function' ? o.sk : () => o.sk || K('head');
  const tan = [], P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  for (let i = 0; i < N; i++) { const a = P[closed ? (i - 1 + N) % N : Math.max(0, i - 1)], b = P[closed ? (i + 1) % N : Math.min(N - 1, i + 1)]; tan.push(b.clone().sub(a).normalize()); }
  let ref = Math.abs(tan[0].y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0); const rings = [];
  for (let i = 0; i < N; i++) {
    const t = i / Math.max(1, N - 1), tg = tan[i], u = new THREE.Vector3().crossVectors(tg, ref).normalize(); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); const v = new THREE.Vector3().crossVectors(tg, u).normalize(); ref = u.clone(); const r = rf(t), ring = [];
    for (let k = 0; k < n; k++) { const th = (k / n) * Math.PI * 2 + (o.a0 || 0); ring.push(P[i].clone().addScaledVector(u, Math.cos(th) * r).addScaledVector(v, Math.sin(th) * (o.flatY ? r * o.flatY : r)).toArray()); }
    rings.push({ ring, col: cf(t), sk: sf(t), ctr: P[i].toArray(), tg });
  }
  const M = closed ? N : N - 1;
  for (let i = 0; i < M; i++) {
    const r0 = rings[i], r1 = rings[(i + 1) % N];
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n, A = r0.ring[k], B = r0.ring[k2], Cc = r1.ring[k2], D = r1.ring[k];
      const mid = [(A[0] + Cc[0]) / 2 - (r0.ctr[0] + r1.ctr[0]) / 2, (A[1] + Cc[1]) / 2 - (r0.ctr[1] + r1.ctr[1]) / 2, (A[2] + Cc[2]) / 2 - (r0.ctr[2] + r1.ctr[2]) / 2];
      mb.triH(A, B, Cc, mid, r0.col, r0.col, r1.col, r0.sk, r0.sk, r1.sk, nh, o.flat); mb.triH(A, Cc, D, mid, r0.col, r1.col, r1.col, r0.sk, r1.sk, r1.sk, nh, o.flat);
    }
  }
  if (!closed) {
    const e = rings[N - 1], tip = o.tip ? new THREE.Vector3().copy(e.tg).multiplyScalar(o.tip).add(new THREE.Vector3(...e.ctr)).toArray() : e.ctr;
    for (let k = 0; k < n; k++) mb.triH(tip, e.ring[k], e.ring[(k + 1) % n], e.tg.toArray(), e.col, e.col, e.col, e.sk, e.sk, e.sk, nh, o.flat);
    if (o.capStart) { const s = rings[0]; for (let k = 0; k < n; k++) mb.triH(s.ctr, s.ring[k], s.ring[(k + 1) % n], s.tg.clone().negate().toArray(), s.col, s.col, s.col, s.sk, s.sk, s.sk, nh, o.flat); }
  }
}

// smooth interpolation helpers
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ final geometry + outline hull
export function finalize(mbs) {
  let nv = 0; mbs.forEach((m) => { nv += m.P.length / 3; });
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), nh = new Uint8Array(nv / 3);
  let o = 0, t = 0;
  mbs.forEach((m) => {
    pos.set(m.P, o * 3); col.set(m.Cl, o * 3);
    for (let i = 0; i < m.P.length / 3; i++) { const a = m.S[i * 3], b = m.S[i * 3 + 1], w = m.S[i * 3 + 2]; si[(o + i) * 4] = a; si[(o + i) * 4 + 1] = b; sw[(o + i) * 4] = 1 - w; sw[(o + i) * 4 + 1] = w; }
    for (let i = 0; i < m.H.length; i++) nh[t + i] = m.H[i]; o += m.P.length / 3; t += m.H.length;
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.computeVertexNormals(); g.userData.nh = nh; return g;
}
// hull geometry: triangles not flagged nh, with smoothed normals (averaged per unique position) in attribute hullN
export function makeHull(g) {
  const nh = g.userData.nh, pos = g.attributes.position.array, col = g.attributes.color.array, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array, nrm = g.attributes.normal.array, map = new Map(), key = (i) => Math.round(pos[i * 3] * 2000) + ',' + Math.round(pos[i * 3 + 1] * 2000) + ',' + Math.round(pos[i * 3 + 2] * 2000);
  const keep = []; for (let f = 0; f < nh.length; f++) if (!nh[f]) keep.push(f);
  keep.forEach((f) => { for (let k = 0; k < 3; k++) { const i = f * 3 + k, kk = key(i); let e = map.get(kk); if (!e) { e = [0, 0, 0]; map.set(kk, e); } e[0] += nrm[i * 3]; e[1] += nrm[i * 3 + 1]; e[2] += nrm[i * 3 + 2]; } });
  const n = keep.length * 3, p2 = new Float32Array(n * 3), c2 = new Float32Array(n * 3), s2 = new Uint16Array(n * 4), w2 = new Float32Array(n * 4), h2 = new Float32Array(n * 3);
  keep.forEach((f, fi) => { for (let k = 0; k < 3; k++) { const i = f * 3 + k, j = fi * 3 + k; p2.set(pos.subarray(i * 3, i * 3 + 3), j * 3); c2.set(col.subarray(i * 3, i * 3 + 3), j * 3); s2.set(si.subarray(i * 4, i * 4 + 4), j * 4); w2.set(sw.subarray(i * 4, i * 4 + 4), j * 4); const e = map.get(key(i)), l = Math.hypot(e[0], e[1], e[2]) || 1; h2[j * 3] = e[0] / l; h2[j * 3 + 1] = e[1] / l; h2[j * 3 + 2] = e[2] / l; } });
  const h = new THREE.BufferGeometry(); h.setAttribute('position', new THREE.BufferAttribute(p2, 3)); h.setAttribute('color', new THREE.BufferAttribute(c2, 3)); h.setAttribute('skinIndex', new THREE.BufferAttribute(s2, 4)); h.setAttribute('skinWeight', new THREE.BufferAttribute(w2, 4)); h.setAttribute('hullN', new THREE.BufferAttribute(h2, 3)); h.setAttribute('normal', new THREE.BufferAttribute(h2.slice(), 3));
  return h;
}
