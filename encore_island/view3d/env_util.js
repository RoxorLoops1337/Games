// Encore Island 3D environment: shared helpers (noise, island outlines, geometry accumulator, material patch chaining).
import * as THREE from 'three';
import * as kit from './kit.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const W = kit.W, TAU = kit.TAU;
/** water surface height. Islands are flat at y = 0; cliffs drop to here and the rock keeps tapering underwater. */
export const WY = -3.3;
export const px2 = (v) => v * W;

// ---- value noise (CPU side, for vertex colours and layout)
const hh = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
export function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return hh(ix, iy) * (1 - u) * (1 - v) + hh(ix + 1, iy) * u * (1 - v) + hh(ix, iy + 1) * (1 - u) * v + hh(ix + 1, iy + 1) * u * v; }
export function fbm(x, y, o = 3) { let a = 0.5, s = 0, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03; } return s / (1 - Math.pow(0.5, o)) * 0.5 + 0; }

/**
 * Island outline, the exact quadratic B-spline the 2D game strokes (blobPathTo): control points are the radius samples, the curve passes through
 * the midpoints. Returns Float32Array [x0, z0, x1, z1 ...] in WORLD units relative to the island centre, `sub` points per radius sample.
 */
export function outline(g, sub = 4) {
  const n = g.rad.length, out = new Float32Array(n * sub * 2), P = (i) => { i = ((i % n) + n) % n; const a = i / n * TAU; return [Math.cos(a) * g.rad[i] * W, Math.sin(a) * g.rad[i] * W]; };
  for (let i = 0; i < n; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), m0x = (a[0] + b[0]) / 2, m0y = (a[1] + b[1]) / 2, m1x = (b[0] + c[0]) / 2, m1y = (b[1] + c[1]) / 2;
    for (let s = 0; s < sub; s++) { const t = s / sub, u = 1 - t, k = (i * sub + s) * 2; out[k] = u * u * m0x + 2 * u * t * b[0] + t * t * m1x; out[k + 1] = u * u * m0y + 2 * u * t * b[1] + t * t * m1y; }
  }
  return out;
}

/** a lightweight vertex accumulator: many transformed template pieces become ONE geometry with colour, sway weight and phase attributes */
export class Acc {
  constructor() { this.p = []; this.n = []; this.c = []; this.sw = []; this.ph = []; this.cnt = 0; }
  /**
   * add a template (non-indexed position/normal/color + userData.h). Grey template vertices take `tint` (a Color) times their grey level,
   * coloured template vertices keep their colour. `sway` scales wind bend (0 = rigid), `ph` is the wind phase.
   */
  add(t, x, y, z, yaw, sx, sy, sz, tint, sway = 1, ph = 0, ao = 0.22) {
    const P = t.attributes.position.array, N = t.attributes.normal.array, Cc = t.attributes.color ? t.attributes.color.array : null, n = P.length / 3, h = t.userData.h || 1, y0 = t.userData.y0 || 0;
    const cs = Math.cos(yaw), sn = Math.sin(yaw), tr = tint ? tint.r : 1, tg = tint ? tint.g : 1, tb = tint ? tint.b : 1;
    for (let i = 0; i < n; i++) {
      const lx = P[i * 3] * sx, ly = P[i * 3 + 1] * sy, lz = P[i * 3 + 2] * sz;
      this.p.push(x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs);
      const nx = N[i * 3], nz = N[i * 3 + 2]; this.n.push(nx * cs + nz * sn, N[i * 3 + 1], -nx * sn + nz * cs);
      const f = clamp01((P[i * 3 + 1] - y0) / h), k = 1 - ao * Math.pow(1 - f, 1.6);
      let r = 1, g = 1, b = 1; if (Cc) { r = Cc[i * 3]; g = Cc[i * 3 + 1]; b = Cc[i * 3 + 2]; if (Math.abs(r - g) < 0.004 && Math.abs(g - b) < 0.004) { r *= tr; g *= tg; b *= tb; } }
      this.c.push(r * k, g * k, b * k); this.sw.push(sway * f * f); this.ph.push(ph);
    }
    this.cnt += n;
  }
  /** raw triangle soup for hand-made pieces (ground shadows, ribbons) */
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, col) {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz); for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.sw.push(0); this.ph.push(0); } this.cnt += 3;
  }
  /** triangle with per-vertex colours (Colors a, b, c) */
  triv(ax, ay, az, ca, bx, by, bz, cb, cx, cy, cz, cc) {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz); this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz); this.c.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b); this.sw.push(0, 0, 0); this.ph.push(0, 0, 0); this.cnt += 3;
  }
  build(withSway = true) {
    if (!this.cnt) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    if (withSway) { g.setAttribute('aSw', new THREE.BufferAttribute(new Float32Array(this.sw), 1)); g.setAttribute('aPh', new THREE.BufferAttribute(new Float32Array(this.ph), 1)); }
    g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
}
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** chain an extra shader patch after kit's look patch (which lives on MeshStandardMaterial.prototype) */
export function patchMat(mat, key, fn) {
  mat.onBeforeCompile = function (sh, r) { const base = THREE.MeshStandardMaterial.prototype.onBeforeCompile; if (base) base.call(this, sh, r); fn(sh, this); };
  mat.customProgramCacheKey = function () { const b = THREE.MeshStandardMaterial.prototype.customProgramCacheKey; return (b ? b.call(this) : '') + '|' + key; };
  return mat;
}

/** a template from a Builder callback: non-indexed position/normal/color with height metadata for AO and sway */
export function tpl(fn) {
  const b = new kit.Builder({ ao: 0 }); fn(b); const g = b.geometry(); g.computeBoundingBox(); g.userData.y0 = g.boundingBox.min.y; g.userData.h = Math.max(0.01, g.boundingBox.max.y - g.boundingBox.min.y); return g;
}
/** faceted (flat normals) noisy rock geometry for Builder.shape */
export function facetGeo(detail, amp, seed, sy = 1) { const g = kit.blobGeo(detail, amp, seed, sy).toNonIndexed(); g.computeVertexNormals(); return g; }

export const biomeIdx = (k) => (k <= 0 ? 0 : (k - 1) % 8);
/** safe global read (classic-script bindings are globals in the game, bridged in tests) */
export function G_(name) { try { return (0, eval)(name); } catch (e) { return undefined; } }
export function disposeGroup(grp) { grp.traverse((n) => { if (n.geometry && !n.userData.sharedGeo) n.geometry.dispose(); if (n.material && n.userData.ownMat) n.material.dispose(); }); }
/** >0 when the point (px, py relative to the island centre, in 2D game pixels) is inside the blob outline: radius left to the shore */
export function radiusSafe(g, dx, dy) {
  const d = Math.hypot(dx, dy); if (d < 1e-6) return 1; const n = g.rad.length; let t = ((Math.atan2(dy, dx) % TAU) + TAU) % TAU / TAU * n; const i = Math.floor(t) % n, j = (i + 1) % n; t -= Math.floor(t);
  return g.rad[i] * (1 - t) + g.rad[j] * t - d;
}

/** smooth (welded) noisy blob, non-indexed with smooth normals: tree crowns, bushes, clouds */
export function smoothBlob(d, amp, seed, sy) { const g = kit.blobGeo(d, amp, seed, sy); g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeVertices(g, 1e-4); m.computeVertexNormals(); const n = m.toNonIndexed(); n.deleteAttribute('uv'); return n; }
