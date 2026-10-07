// Terrain helpers (Environment Artist A). A tiny geometry writer ("Buf") with a transform stack, hand-painted vertex colour helpers,
// value noise, spline sampling and a collision store. Everything is non-indexed, flat shaded and vertex coloured, so a whole module merges to a few meshes.
import { THREE, rng } from './kit.js';

// ---------- colour helpers (linear [r,g,b] arrays, converted once from sRGB hex) ----------
const _c = new THREE.Color();
export const col = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const SHADE = col('#4a3a78'); // violet shadow tint used for baked AO (never grey, never black)
export const aoTint = (c, k) => mix(mul(c, 1 - 0.3 * k), SHADE, 0.34 * k);
export const warmUp = (c, k) => [c[0] * (1 + 0.1 * k), c[1] * (1 + 0.03 * k), c[2] * (1 - 0.06 * k)];

// ---------- noise ----------
function hash(ix, iz, seed) { let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function vnoise(x, z, seed) { seed = seed || 0; const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed); return lerp(lerp(a, b, u), lerp(c, d, u), v); }
export const fbm = (x, z, seed) => vnoise(x, z, seed) * 0.58 + vnoise(x * 2.07 + 7.3, z * 2.07 + 3.1, (seed || 0) + 1) * 0.29 + vnoise(x * 4.3 + 1.7, z * 4.3 + 9.2, (seed || 0) + 2) * 0.13;

// ---------- splines ----------
// pts: [[x,z],...]. Returns equidistant samples [{x,z,tx,tz,s}] with .len and .closed
export function curve(pts, closed, step) {
  step = step || 0.5; const n = pts.length, segs = closed ? n : n - 1, get = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]), dense = [];
  for (let i = 0; i < segs; i++) { const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2); for (let k = 0; k < 24; k++) { const t = k / 24, t2 = t * t, t3 = t2 * t; const f = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3); dense.push([f(0), f(1)]); } }
  if (!closed) dense.push(pts[n - 1]); else dense.push(dense[0]);
  const cum = [0]; for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const L = cum[cum.length - 1], cnt = Math.max(3, Math.round(L / step)), out = [], N = closed ? cnt : cnt + 1; let j = 0;
  for (let i = 0; i < N; i++) { const s = (i / cnt) * L; while (j < cum.length - 2 && cum[j + 1] < s) j++; const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]); out.push({ x: lerp(dense[j][0], dense[j + 1][0], f), z: lerp(dense[j][1], dense[j + 1][1], f), s }); }
  for (let i = 0; i < out.length; i++) { const a = out[closed ? (i - 1 + out.length) % out.length : Math.max(0, i - 1)], b = out[closed ? (i + 1) % out.length : Math.min(out.length - 1, i + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; out[i].tx = tx / l; out[i].tz = tz / l; }
  out.len = L; out.closed = !!closed; return out;
}

// ---------- the geometry writer ----------
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
export class Buf {
  constructor(o) { o = o || {}; this.p = []; this.c = []; this.g = []; this.uv = o.uv ? [] : null; this.alpha = !!o.alpha; this.m = new THREE.Matrix4(); this.st = []; this.r = o.rng || rng(11); this.gy = 0; }
  push(x, y, z, ry, s, rx, rz) { this.st.push(this.m.clone()); _m.compose(_p.set(x || 0, y || 0, z || 0), _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0, 'YXZ')), _s.set(s || 1, s || 1, s || 1)); this.m.multiply(_m); return this; }
  pop() { this.m.copy(this.st.pop()); return this; }
  at(x, y, z, ry, s, fn) { this.push(x, y, z, ry, s); fn(this); this.pop(); return this; }
  _v3(a) { _v.set(a[0], a[1], a[2]).applyMatrix4(this.m); this.p.push(_v.x, _v.y, _v.z); this.g.push(this.gy); }
  _c3(c) { this.c.push(c[0], c[1], c[2]); if (this.alpha) this.c.push(c[3] === undefined ? 1 : c[3]); }
  tri(a, b, c, ca, cb, cc) { this._v3(a); this._v3(b); this._v3(c); cb = cb || ca; cc = cc || ca; this._c3(ca); this._c3(cb); this._c3(cc); }
  quad(a, b, c, d, ca, cb, cc, cd) { cb = cb || ca; cc = cc || ca; cd = cd || ca; this.tri(a, b, c, ca, cb, cc); this.tri(a, c, d, ca, cc, cd); }
  // textured quad (needs uv:true): corners a,b,c,d counter clockwise, uv rect u0,v0 (bottom left) u1,v1 (top right)
  uquad(a, b, c, d, u0, v0, u1, v1, ca) { this.tri(a, b, c, ca); this.tri(a, c, d, ca); this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1); }
  tint(c, t) { const k = 1 + (this.r() - 0.5) * 2 * t; return [c[0] * k, c[1] * k, c[2] * k]; }
  // box standing on y0. o: {ry, taper(top scale), base(AO 0..1), tint, top(colour), bottom(bool), rx, rz}
  box(cx, y0, cz, w, h, d, color, o) {
    o = o || {}; const tp = o.taper === undefined ? 1 : o.taper, hw = w / 2, hd = d / 2, th = hw * tp, td = hd * tp, bk = o.base === undefined ? 0.22 : o.base, tt = o.tint === undefined ? 0.05 : o.tint;
    this.push(cx, y0, cz, o.ry || 0, 1, o.rx || 0, o.rz || 0);
    const b = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]], t = [[-th, h, -td], [th, h, -td], [th, h, td], [-th, h, td]];
    const sides = [[3, 2], [2, 1], [1, 0], [0, 3]];
    for (let k = 0; k < 4; k++) { const c = this.tint(color, tt), lo = aoTint(c, bk), hi = mul(c, 1.05), i = sides[k][0], j = sides[k][1]; this.quad(b[i], b[j], t[j], t[i], lo, lo, hi, hi); }
    const tc = o.top ? this.tint(o.top, tt) : mul(this.tint(color, tt), 1.1); this.quad(t[0], t[3], t[2], t[1], tc);
    if (o.bottom) this.quad(b[0], b[1], b[2], b[3], aoTint(color, 0.7));
    this.pop(); return this;
  }
  // revolve a profile [[r,y,colour],...] (outside going up, then over the lip, then down the inside)
  lathe(prof, seg, cx, y0, cz, o) {
    o = o || {}; const tt = o.tint === undefined ? 0.04 : o.tint, rot = o.rot || 0, sx = o.sx || 1, sz = o.sz || 1; this.push(cx, y0, cz, o.ry || 0, o.s || 1);
    const P = (i, a) => [prof[i][0] * Math.cos(a) * sx, prof[i][1], prof[i][0] * Math.sin(a) * sz];
    for (let k = 0; k < seg; k++) {
      const a0 = rot + (k / seg) * Math.PI * 2, a1 = rot + ((k + 1) / seg) * Math.PI * 2, tk = 1 + (this.r() - 0.5) * 2 * tt;
      for (let i = 0; i < prof.length - 1; i++) {
        const r0 = prof[i][0], r1 = prof[i + 1][0]; if (r0 === 0 && r1 === 0) continue; const A = P(i, a1), B = P(i, a0), C = P(i + 1, a0), D = P(i + 1, a1), c0 = mul(prof[i][2], tk), c1 = mul(prof[i + 1][2], tk);
        if (r0 === 0) this.tri(A, C, D, c0, c1, c1); else if (r1 === 0) this.tri(A, B, C, c0, c0, c1); else this.quad(A, B, C, D, c0, c0, c1, c1);
      }
    }
    this.pop(); return this;
  }
  // tapered prism: radius rb at the bottom to rt on top, with a cap
  cyl(cx, y0, cz, rb, rt, h, seg, color, o) { o = o || {}; const lo = aoTint(color, o.base === undefined ? 0.25 : o.base), hi = mul(color, 1.06); return this.lathe([[rb, 0, lo], [rt, h, hi], [0, h, mul(hi, 1.08)]], seg, cx, y0, cz, o); }
  // square pyramid roof / spire
  pyr(cx, y0, cz, w, h, color, ry) { const lo = mul(color, 0.92), hi = mul(color, 1.08); return this.lathe([[w * 0.7071, 0, lo], [0, h, hi]], 4, cx, y0, cz, { rot: Math.PI / 4, ry: ry || 0 }); }
  // faceted blob (rocks, bushes, lumps). colour by height: lo at the bottom, hi on top
  blob(cx, cy, cz, rx, ry, rz, lo, hi, o) {
    o = o || {}; const g = new THREE.IcosahedronGeometry(1, o.detail === undefined ? 1 : o.detail), ng = g.index ? g.toNonIndexed() : g, pos = ng.attributes.position, seen = new Map(), j = o.jit === undefined ? 0.2 : o.jit;
    for (let i = 0; i < pos.count; i++) { const key = pos.getX(i).toFixed(3) + pos.getY(i).toFixed(3) + pos.getZ(i).toFixed(3); let d = seen.get(key); if (!d) { d = [(this.r() - 0.5) * j, (this.r() - 0.5) * j, (this.r() - 0.5) * j]; seen.set(key, d); } pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]); }
    this.push(cx, cy, cz, o.ry || 0, 1, o.rx || 0, o.rz || 0);
    for (let i = 0; i < pos.count; i += 3) { const k = 1 + (this.r() - 0.5) * 0.12, pts = [], cs = []; for (let q = 0; q < 3; q++) { const x = pos.getX(i + q), y = pos.getY(i + q), z = pos.getZ(i + q); pts.push([x * rx, y * ry, z * rz]); cs.push(mul(mix(lo, hi, sat((y + 1) / 2)), k)); } this.tri(pts[0], pts[1], pts[2], cs[0], cs[1], cs[2]); }
    this.pop(); g.dispose(); if (ng !== g) ng.dispose(); return this;
  }
  // flat polygon lying on the ground (counter clockwise seen from above). pts [[x,z],...] fan triangulated
  poly(pts, y, color) { for (let i = 1; i < pts.length - 1; i++) this.tri([pts[0][0], y, pts[0][1]], [pts[i + 1][0], y, pts[i + 1][1]], [pts[i][0], y, pts[i][1]], color); }
  // finished geometry. ao: bake violet contact darkening relative to each vertex' ground level
  geometry(ao) {
    const P = new Float32Array(this.p), C = new Float32Array(this.c), n = P.length / 3, cs = this.alpha ? 4 : 3;
    if (ao) for (let i = 0; i < n; i++) { const y = P[i * 3 + 1] - this.g[i], k = 0.55 * (1 - smooth(0, 0.6, y)), hi = smooth(0.6, 3.4, y); const c = aoTint([C[i * cs], C[i * cs + 1], C[i * cs + 2]], k), w = 1 + 0.05 * hi; C[i * cs] = c[0] * w; C[i * cs + 1] = c[1] * w; C[i * cs + 2] = c[2] * w; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, cs)); if (this.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
}

// ---------- collision store ----------
export function makeCollider() {
  const circles = [], boxes = [];
  return {
    circle(x, z, r) { circles.push([x, z, r]); },
    box(x, z, hw, hd, ry) { ry = ry || 0; boxes.push([x, z, hw, hd, Math.cos(ry), Math.sin(ry)]); },
    test(x, z) {
      for (let i = 0; i < circles.length; i++) { const c = circles[i], dx = x - c[0], dz = z - c[1]; if (dx * dx + dz * dz < c[2] * c[2]) return true; }
      for (let i = 0; i < boxes.length; i++) { const b = boxes[i], dx = x - b[0], dz = z - b[1], lx = dx * b[4] - dz * b[5], lz = dx * b[5] + dz * b[4]; if (Math.abs(lx) < b[2] && Math.abs(lz) < b[3]) return true; }
      return false;
    },
    count() { return circles.length + boxes.length; },
  };
}

// local distance helpers
export const dist2 = (x, z, a, b) => Math.hypot(x - a, z - b);
export function distToSamples(x, z, samples) { let best = 1e9; for (let i = 0; i < samples.length; i++) { const dx = x - samples[i].x, dz = z - samples[i].z, d = dx * dx + dz * dz; if (d < best) best = d; } return Math.sqrt(best); }
