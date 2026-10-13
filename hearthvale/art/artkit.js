// Shared kit for Hearthvale's art modules. Soft, rounded, toy-like forms; no image files.
// Do not edit from an art module: put module-specific helpers in your own file.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const matCache = new Map();
/** Soft matte material (the village look). opts: emissive, emissiveIntensity, transparent, opacity, side, vertexColors, flat */
export function soft(color, o = {}) {
  const k = color + JSON.stringify(o);
  let m = matCache.get(k);
  if (!m) { const { flat, ...rest } = o; m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, flatShading: !!flat, ...rest }); matCache.set(k, m); }
  return m;
}
/** Glossy variant for water, glass, metal, glazed things. */
export function gloss(color, o = {}) { return soft(color, { roughness: 0.28, metalness: 0.05, ...o }); }

const geoCache = new Map();
const cached = (k, f) => { let g = geoCache.get(k); if (!g) { g = f(); geoCache.set(k, g); } return g; };

/** Box with rounded edges and corners (radius r), smooth normals. Unit-size geometry is cached; scale the mesh. */
export function roundedBoxGeo(w = 1, h = 1, d = 1, r = 0.08, seg = 3) {
  return cached(`rb${w},${h},${d},${r},${seg}`, () => {
    const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2); const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const inner = new THREE.Vector3(Math.max(-c.x, Math.min(c.x, v.x)), Math.max(-c.y, Math.min(c.y, v.y)), Math.max(-c.z, Math.min(c.z, v.z)));
      const dir = v.clone().sub(inner); if (dir.lengthSq() > 1e-10) { dir.normalize().multiplyScalar(r); v.copy(inner).add(dir); } p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  });
}
const shadowy = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };
/** Rounded box whose BOTTOM face sits at y. */
export function rbox(w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
  const { r = Math.min(0.08, w / 4, h / 4, d / 4), mat } = o; const m = new THREE.Mesh(roundedBoxGeo(w, h, d, r), mat || soft(color, o.m)); m.position.set(x, y + h / 2, z); return shadowy(m);
}
/** Cylinder, bottom at y. rt = top radius, rb = bottom radius. Smooth shaded. */
export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, o = {}) {
  const seg = o.seg || 14; const m = new THREE.Mesh(cached(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), o.mat || soft(color, o.m)); m.position.set(x, y + h / 2, z); return shadowy(m);
}
/** Cone / pyramid, bottom at y. seg 4 = pyramid roof (rotated 45deg so edges face the walls). */
export function cone(r, h, color, x = 0, y = 0, z = 0, o = {}) {
  const seg = o.seg || 4; const m = new THREE.Mesh(cached(`co${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), o.mat || soft(color, o.m)); m.position.set(x, y + h / 2, z); m.rotation.y = o.rot ?? (seg === 4 ? Math.PI / 4 : 0); return shadowy(m);
}
/** Smooth sphere / ellipsoid centred at y. */
export function ball(r, color, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(cached(`sp${o.seg || 16}`, () => new THREE.SphereGeometry(1, o.seg || 16, Math.max(8, (o.seg || 16) / 2))), o.mat || soft(color, o.m)); m.scale.set(r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1)); m.position.set(x, y, z); return shadowy(m);
}
/** Faceted blob (low poly rock / foliage clump): icosahedron with detail 1 and a little seeded jitter, centred at y. */
export function blob(r, color, x = 0, y = 0, z = 0, o = {}) {
  const seed = o.seed || 1, detail = o.detail ?? 1;
  const g = cached(`bl${seed},${detail},${o.jit ?? 0.12}`, () => { const g = new THREE.IcosahedronGeometry(1, detail); const p = g.attributes.position; let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280); const memo = new Map(); for (let i = 0; i < p.count; i++) { const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; let f = memo.get(key); if (!f) { f = 1 + (rnd() - 0.5) * 2 * (o.jit ?? 0.12); memo.set(key, f); } p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); } g.computeVertexNormals(); return g; });
  const m = new THREE.Mesh(g, o.mat || soft(color, { flat: o.flat ?? true, ...o.m })); m.scale.set(r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1)); m.position.set(x, y, z); return shadowy(m);
}
/** Capsule (rounded cylinder) with its bottom at y. */
export function capsule(r, len, color, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(cached(`ca${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 12)), o.mat || soft(color, o.m)); m.position.set(x, y + r + len / 2, z); return shadowy(m);
}
/** Lathe: profile = [[radius, y], ...] revolved around Y. Great for barrels, pots, domes, towers, fountains. */
export function lathe(profile, color, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(cached(`la${JSON.stringify(profile)},${o.seg || 16}`, () => new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), o.seg || 16)), o.mat || soft(color, { side: THREE.DoubleSide, ...o.m })); m.position.set(x, y, z); return shadowy(m);
}
/** Triangular prism (gable roof) along X: width w (x), height h, depth d (z). Bottom at y. */
export function gable(w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
  const g = cached(`ga${w},${h},${d}`, () => { const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath(); const e = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }); e.translate(0, 0, -w / 2); e.rotateY(Math.PI / 2); e.computeVertexNormals(); return e; });
  const m = new THREE.Mesh(g, o.mat || soft(color, o.m)); m.position.set(x, y, z); return shadowy(m);
}
/** Flat soft blob shadow on the ground (fake ambient occlusion) under props that do not cast real shadows. */
export function groundShadow(r = 0.6, opacity = 0.25, sx = 1, sz = 1) {
  const m = new THREE.Mesh(cached('gs', () => new THREE.CircleGeometry(1, 20)), new THREE.MeshBasicMaterial({ color: 0x24330f, transparent: true, opacity, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.scale.set(r * sx, r * sz, 1); m.position.y = 0.02; m.renderOrder = 1; m.castShadow = false; m.receiveShadow = false; return m;
}
/** Darken a mesh toward its bottom with vertex colours: instant cartoon ambient occlusion. strength 0..1. */
export function bakeAO(mesh, strength = 0.35) {
  const g = mesh.geometry.clone(); g.computeBoundingBox(); const bb = g.boundingBox, p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y); const k = 1 - strength * (1 - t) * (1 - t); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); mesh.geometry = g;
  mesh.material = mesh.material.clone(); mesh.material.vertexColors = true; return mesh;
}
export const group = (...kids) => { const g = new THREE.Group(); for (const k of kids) if (k) g.add(k); return g; };
export const tag = (obj, name) => { obj.name = name; return obj; };
/** deterministic rng for jitter inside models */
export function rng(seed) { let a = (seed | 0) + 0x9e3779b9; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Draw-call saver: merge every STATIC mesh of a finished model into one mesh per material.
 * Meshes that are named (e.g. 'spin', 'crops', 'body', 'arm') or carry userData.keep stay separate so the game can animate them;
 * their parents' transforms are preserved. Call once at the end of a builder. Budget: aim for <= 12 meshes per building after merging.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(); const buckets = new Map(); const keep = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    let animated = false; for (let p = o; p && p !== root; p = p.parent) if ((p.name && p.name !== '') || p.userData.keep) animated = true;
    if (animated) { keep.push(o); return; }
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : ''); let b = buckets.get(key); if (!b) { b = { mat: o.material, geos: [], cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder }; buckets.set(key, b); } b.geos.push(g);
  });
  const out = new THREE.Group(); out.name = root.name; out.userData = root.userData; out.position.copy(root.position); out.rotation.copy(root.rotation); out.scale.copy(root.scale);
  for (const b of buckets.values()) { const m = new THREE.Mesh(mergeGeometries(b.geos, false), b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.order; out.add(m); }
  for (const o of keep) { const top = (() => { let p = o; while (p.parent && p.parent !== root) p = p.parent; return p; })(); if (!out.children.includes(top)) { top.parent.remove(top); top.applyMatrix4(new THREE.Matrix4()); out.add(top); } }
  return out;
}
