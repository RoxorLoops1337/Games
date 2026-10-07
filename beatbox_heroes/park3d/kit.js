// Park3D kit: small helpers every module shares so the whole scene reads as ONE art style.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export { THREE, mergeGeometries };

// deterministic random (mulberry32)
export function rng(seed) { let s = seed >>> 0; const f = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f.range = (a, b) => a + (b - a) * f(); f.pick = (arr) => arr[Math.floor(f() * arr.length)]; return f; }

// THE house material: flat-shaded, vertex-coloured, matte. Use this for almost everything.
// Lambert is the house shader (cheap on phones, takes shadows and vertex colours). Use MeshStandardMaterial for at most one hero prop.
export function flatMat(opts) { return new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, flatShading: true }, opts)); }
export function solidMat(color, opts) { return new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, opts)); }
export function glowMat(color, intensity) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity || 1), toneMapped: false }); }

// paint a whole geometry one colour (adds a 'color' attribute)
export function paint(geo, color) { const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; }
// vertical gradient + cheap baked AO: darker/cooler near the bottom (y), optional per-face random tint for hand-painted faceting
export function paintGradient(geo, bottom, top, opts) {
  opts = opts || {}; const pos = geo.attributes.position, n = pos.count, a = new Float32Array(n * 3), cb = new THREE.Color(bottom), ct = new THREE.Color(top), tmp = new THREE.Color();
  geo.computeBoundingBox(); const y0 = geo.boundingBox.min.y, y1 = geo.boundingBox.max.y, r = opts.rng || Math.random, tint = opts.facetTint === undefined ? 0.05 : opts.facetTint;
  for (let i = 0; i < n; i += 3) { const face = (r() - 0.5) * tint; for (let k = 0; k < 3 && i + k < n; k++) { const t = (pos.getY(i + k) - y0) / Math.max(1e-6, y1 - y0); tmp.copy(cb).lerp(ct, t); a[(i + k) * 3] = tmp.r + face; a[(i + k) * 3 + 1] = tmp.g + face; a[(i + k) * 3 + 2] = tmp.b + face; } }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
// push vertices around so spheres and cones look hand-modelled, not CAD (call on non-indexed geometry)
export function jitter(geo, amount, r) { r = r || Math.random; const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, seen = new Map(); for (let i = 0; i < p.count; i++) { const key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3); let d = seen.get(key); if (!d) { d = [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]; seen.set(key, d); } p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]); } g.computeVertexNormals(); return g; }
// faceted blob (icosphere, few subdivisions, jittered)
export function blob(radius, detail, r, squash) { const g = new THREE.IcosahedronGeometry(radius, detail || 1); g.scale(1, squash || 1, 1); return jitter(g, radius * 0.22, r); }
export function nonIndexed(geo) { return geo.index ? geo.toNonIndexed() : geo; }

// quick mesh constructors that return NON-INDEXED, painted geometry (so flatShading and per-face colour work and merging is trivial)
export function box(w, h, d, color, x, y, z) { const g = paint(nonIndexed(new THREE.BoxGeometry(w, h, d)), color); g.translate(x || 0, y || 0, z || 0); return g; }
export function cyl(rt, rb, h, seg, color, x, y, z) { const g = paint(nonIndexed(new THREE.CylinderGeometry(rt, rb, h, seg || 6)), color); g.translate(x || 0, y || 0, z || 0); return g; }
export function merged(geos) { return mergeGeometries(geos.map(nonIndexed), false); }
export function mesh(geo, mat, opts) { const m = new THREE.Mesh(geo, mat || flatMat()); m.castShadow = !opts || opts.cast !== false; m.receiveShadow = !opts || opts.receive !== false; return m; }

// canvas-drawn texture for murals, signs, windows
export function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// tiny event emitter for module to module messages (spot activated, quality changed...)
export function emitter() { const m = {}; return { on(k, f) { (m[k] = m[k] || []).push(f); }, emit(k, v) { (m[k] || []).forEach((f) => f(v)); } }; }
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
