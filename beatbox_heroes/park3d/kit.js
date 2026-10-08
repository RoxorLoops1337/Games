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

// ---------- disposal (host.unload calls this on the whole world scene) ----------
// Frees GPU + CPU memory for everything under obj: geometries, materials, every texture a material holds (maps, shader uniforms, canvas textures),
// instanced meshes, skeletons, light shadow maps and render targets found in uniforms or userData.renderTarget. Anything flagged `userData.persist = true`
// (shared character materials, atlases other worlds reuse) is skipped, so shared resources are never thrown away. Safe to call twice.
const TEX_KEYS = ['map', 'lightMap', 'aoMap', 'emissiveMap', 'bumpMap', 'normalMap', 'displacementMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'envMap', 'gradientMap', 'specularMap', 'matcap', 'clearcoatMap', 'sheenColorMap', 'transmissionMap', 'thicknessMap'];
export function disposeTexture(t) {
  if (!t || (t.userData && t.userData.persist)) return;
  if (t.isRenderTarget) { t.dispose(); return; }
  const img = t.image; t.dispose();
  // iOS caps total canvas memory: shrink painted canvases so the backing store is released right away
  if (t.isCanvasTexture && img && typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) { img.width = 1; img.height = 1; }
}
export function disposeMaterial(m) {
  if (!m || (m.userData && m.userData.persist)) return;
  for (let i = 0; i < TEX_KEYS.length; i++) { const t = m[TEX_KEYS[i]]; if (t && t.isTexture) disposeTexture(t); }
  const u = m.uniforms; if (u) for (const k in u) { const v = u[k] && u[k].value; if (v && (v.isTexture || v.isRenderTarget)) disposeTexture(v); }
  m.dispose();
}
// LEAFY SHADOWS: low-poly canopies are a few big flat faces, so their sun shadow lands as one solid hard-edged slab (players read it as a "square shadow").
// leafShadow(mesh, { minY, scale, open, sat }) gives the mesh a shadow-only depth material that punches irregular holes into everything above minY (world y),
// so canopies cast dappled foliage shadows while trunks (below minY) stay solid. sat > 0: only vertices whose colour saturation (max - min channel) is above it
// get holes (foliage), so a merged props mesh keeps solid lamp posts and benches. The mesh itself renders unchanged. Works for Mesh and InstancedMesh.
export function leafShadow(mesh, o) {
  o = o || {}; const minY = o.minY === undefined ? 1.6 : o.minY, scale = o.scale || 1.7, open = o.open === undefined ? 0.42 : o.open, sat = o.sat || 0;
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLeaf = { value: new THREE.Vector4(minY, scale, open, sat) };
    sh.vertexShader = 'varying vec3 vLeafW; varying float vLeafS;\n' + (sat > 0 ? 'attribute vec3 color;\n' : '') + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  ' + (sat > 0 ? 'vLeafS = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));' : 'vLeafS = 1.0;') + '\n  { vec4 lw = vec4(transformed, 1.0);\n  #ifdef USE_INSTANCING\n  lw = instanceMatrix * lw;\n  #endif\n  vLeafW = (modelMatrix * lw).xyz; }');
    sh.fragmentShader = 'uniform vec4 uLeaf; varying vec3 vLeafW; varying float vLeafS;\nfloat lfH(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }\nfloat lfN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);\n  return mix(mix(mix(lfH(i), lfH(i + vec3(1,0,0)), f.x), mix(lfH(i + vec3(0,1,0)), lfH(i + vec3(1,1,0)), f.x), f.y), mix(mix(lfH(i + vec3(0,0,1)), lfH(i + vec3(1,0,1)), f.x), mix(lfH(i + vec3(0,1,1)), lfH(i + vec3(1,1,1)), f.x), f.y), f.z); }\n'
      + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (vLeafW.y > uLeaf.x && vLeafS > uLeaf.w) { vec3 q = vLeafW * uLeaf.y; float n = lfN(q) * 0.65 + lfN(q * 2.3 + 7.1) * 0.35; float fade = clamp((vLeafW.y - uLeaf.x) / 0.5, 0.0, 1.0); if (n < uLeaf.z * fade) discard; }');
  };
  m.customProgramCacheKey = () => 'leafShadow' + (sat > 0 ? 's' : '');
  mesh.customDepthMaterial = m; mesh.userData.leafShadow = true; return mesh;
}

export function disposeTree(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry && !(o.geometry.userData && o.geometry.userData.persist)) o.geometry.dispose();
    const m = o.material; if (m) { if (Array.isArray(m)) for (let i = 0; i < m.length; i++) disposeMaterial(m[i]); else disposeMaterial(m); }
    if (o.isInstancedMesh && o.dispose) o.dispose();
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.dispose) o.skeleton.dispose();
    if (o.customDepthMaterial) o.customDepthMaterial.dispose();
    if (o.isLight && o.shadow && o.shadow.dispose) o.shadow.dispose();
    if (o.userData && o.userData.renderTarget && o.userData.renderTarget.dispose) o.userData.renderTarget.dispose();
  });
}
