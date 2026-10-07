// Shared helpers for the flora modules (Environment Artist B). Pure geometry and colour utilities, no scene state.
import { THREE, jitter } from './kit.js';
// faceted blob where detail 0 really means 20 faces (kit.blob treats 0 as 1)
export function blob(radius, detail, r, squash) { const g = new THREE.IcosahedronGeometry(radius, detail); g.scale(1, squash || 1, 1); return jitter(g, radius * 0.22, r); }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// clone + transform a geometry: opts {x,y,z, rx,ry,rz, s | sx,sy,sz}
export function xf(geo, o) {
  const g = geo.clone(); o = o || {};
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
  _v.set(o.x || 0, o.y || 0, o.z || 0); const s = o.s === undefined ? 1 : o.s; _s.set(o.sx || s, o.sy || s, o.sz || s);
  _m.compose(_v, _q, _s); g.applyMatrix4(_m); return g;
}
export const col = (c) => (c && c.isColor ? c.clone() : new THREE.Color(c));
export const mix = (a, b, t) => col(a).lerp(col(b), Math.max(0, Math.min(1, t)));
export const smooth = (t) => t * t * (3 - 2 * t);

// SUN direction used for baked "backlit" highlights (matches the lighting module default: sun from -x, +y, +z)
export const SUN = new THREE.Vector3(-12, 16, 10).normalize();

// Per-face painted canopy: bottom dark teal, top warm, sun-facing faces get a backlit highlight, per-face hue jitter, baked AO toward the inside.
// pal = { lo, mid, hi, glint }, centre = canopy centre (for AO), r = canopy radius
export function paintCanopy(geo, r, pal, centre, rad) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
  centre = centre || { x: 0, y: 0, z: 0 }; rad = rad || 1;
  g.computeBoundingBox(); const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), tmp = new THREE.Color();
  const lo = col(pal.lo), mid = col(pal.mid), hi = col(pal.hi), glint = col(pal.glint);
  for (let i = 0; i < n; i += 3) {
    A.fromBufferAttribute(p, i); B.fromBufferAttribute(p, i + 1); C.fromBufferAttribute(p, i + 2);
    N.subVectors(C, B).cross(_v.subVectors(A, B)).normalize();
    const cx = (A.x + B.x + C.x) / 3, cy = (A.y + B.y + C.y) / 3, cz = (A.z + B.z + C.z) / 3;
    const h = (cy - y0) / Math.max(1e-6, y1 - y0);
    const sun = Math.max(0, N.dot(SUN)), up = N.y * 0.5 + 0.5;
    // distance from canopy centre: faces deep inside the clump are darker (cheap AO)
    const dx = cx - centre.x, dy = cy - centre.y, dz = cz - centre.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) / rad;
    let t = h * 0.55 + up * 0.35 + sun * 0.25 - (1 - Math.min(1, d)) * 0.12;
    t += (r() - 0.5) * 0.14;
    if (t < 0.5) tmp.copy(lo).lerp(mid, t / 0.5); else tmp.copy(mid).lerp(hi, (t - 0.5) / 0.5);
    if (sun > 0.55 && h > 0.35) tmp.lerp(glint, (sun - 0.55) * 0.9);
    for (let k = 0; k < 3; k++) { a[(i + k) * 3] = tmp.r; a[(i + k) * 3 + 1] = tmp.g; a[(i + k) * 3 + 2] = tmp.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}

// one vertical gradient colour with a little warm-from-the-sun on faces looking at the light (used for trunks, rocks, pots, planters)
export function paintSolid(geo, bottom, top, r, sunAmt) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
  g.computeBoundingBox(); const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), tmp = new THREE.Color(), cb = col(bottom), ct = col(top);
  const warm = col('#ffd2a0'); sunAmt = sunAmt === undefined ? 0.18 : sunAmt;
  for (let i = 0; i < n; i += 3) {
    A.fromBufferAttribute(p, i); B.fromBufferAttribute(p, i + 1); C.fromBufferAttribute(p, i + 2); N.subVectors(C, B).cross(_v.subVectors(A, B)).normalize();
    const f = (r() - 0.5) * 0.06, sun = Math.max(0, N.dot(SUN));
    for (let k = 0; k < 3; k++) { const t = (p.getY(i + k) - y0) / Math.max(1e-6, y1 - y0); tmp.copy(cb).lerp(ct, t); tmp.lerp(warm, sun * sunAmt); a[(i + k) * 3] = tmp.r + f; a[(i + k) * 3 + 1] = tmp.g + f; a[(i + k) * 3 + 2] = tmp.b + f; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}

// gives every vertex of a geometry the same uv (used so that plain-coloured parts can share a textured material)
export function constUV(geo, u, v) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; } geo.setAttribute('uv', new THREE.BufferAttribute(a, 2)); return geo;
}

// Cheap sway: patches a Lambert material so vertices above the ground move with two sines. Shared time uniform in material.userData.sway.
// instanced:true uses the instance translation as phase, otherwise the (world space) vertex position.
export function addSway(mat, opts) {
  opts = opts || {}; const amp = opts.amp || 0.06, hgt = opts.height || 0.4, freq = opts.freq || 1.6, inst = !!opts.instanced;
  const uni = { value: 0 }; mat.userData.sway = uni;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSwayT = uni;
    sh.vertexShader = 'uniform float uSwayT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${inst ? 'vec2 swp = instanceMatrix[3].xz;' : 'vec2 swp = position.xz;'}
      float swh = ${inst ? 'position.y' : 'max(position.y,0.0)'} / ${hgt.toFixed(3)};
      float swph = swp.x * 0.61 + swp.y * 0.83;
      float swv = (sin(uSwayT * ${freq.toFixed(2)} + swph) * 0.7 + sin(uSwayT * ${(freq * 1.7).toFixed(2)} + swph * 1.9) * 0.3) * ${amp.toFixed(3)} * swh * swh;
      transformed.x += swv; transformed.z += swv * 0.55;`);
  };
  return mat;
}

// 2D soft keep-out helper
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
