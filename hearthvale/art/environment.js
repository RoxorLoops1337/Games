// Hearthvale ENVIRONMENT kit: trees, rocks, clay, stump, the four valley fields, the notice board, the plaza, village plots,
// the floating island with its sea, and scatter helpers. All procedural, no image files.
//
// RESEARCH NOTES (10 bullets: what I learned, and how each one is used below)
//  1. Stylized tree packs build canopies from a few fat overlapping solid blobs, not alpha cards: cards cost heavy overdraw on
//     mobile and a flat card has no rounded light profile (ArtStation "Trees and Canopies"). -> every canopy is 3 to 8 lumpy blobs.
//  2. The same packs use a vertex-colour gradient channel as a wind mask. -> uv.x of every baked vertex is a sway weight (0 trunk,
//     rising toward the leaf tips) and one shared shader displaces it; no game code needed (it self-ticks via onBeforeRender).
//  3. Soft "balloon" shading comes from normals, not from geometry: radial normals tilted toward +Y make a low-poly blob read as a
//     lit, fluffy leaf mass. -> `lump()` writes its own normals (radial blended 25% up); rocks keep flat facet normals instead.
//  4. Painterly colour is a 3-stop vertex ramp (cool dark underside -> true colour -> warm light top) plus a tiny per-face value
//     jitter, which is also the cheapest "baked AO". -> `tone()` + `facet` + a world-height AO falloff near the ground.
//  5. Floating-island kits use a wide flat grass top, a thin dark topsoil lip, then layered strata bands of earth and stone that
//     taper inward below (two materials: grass top / rock). -> islandModel: noisy outline, 6 hard-edged strata rings, boulders.
//  6. Stylized water = shallow-to-deep colour bands from distance-to-shore, a bright shoreline glow and noise-driven foam at the
//     bank. Real depth-buffer shaders are overkill here. -> vertex bands that follow the island outline + a scrolling sine foam.
//  7. Cozy rocks: chunky low subdivision, flat shaded, mossy on up-facing normals, with a few pale crystal bipyramids as accents.
//  8. Grass is clumps of a few spiky prongs (3-sided open cones, 3 tris each) instanced by the hundred; flowers come in patches of
//     5 to 7 heads, never single dots.
//  9. Soft contact shadows: a 3-ring disc with per-vertex ALPHA (centre 30%, rim 0%) fakes AO for ~30 tris and never z-fights.
// 10. Cozy diorama readability: warm light / cool shadow hue shift, calm big shapes, and detail clusters at entrances (gates, path
//     starts, wells) with the owner colour used as a trim accent, not a flood fill.
//
// Notes for integrators:
//  - Every builder returns a THREE.Group with origin on the ground. Geometry is baked once per key and SHARED between calls
//    (do not dispose it). Everything static is already one mesh per material (what mergeStatic would give).
//  - All matte props share ONE material (`envMat`) with a built-in wind shader; sway needs no per-frame code.
//  - Lanterns use the exported `lanternMat`: drive its emissiveIntensity at night (or copy the buildings.js one into it).
import * as THREE from 'three';
import { rng as krng, roundedBoxGeo } from './artkit.js';
import { P } from './palette.js';

// ------------------------------------------------------------------ small math
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (x, y = 0) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), u), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v); };
const fbm = (x, y) => vn(x, y) * 0.6 + vn(x * 2.1 + 5, y * 2.1 + 3) * 0.28 + vn(x * 4.3 + 9, y * 4.3 + 1) * 0.12;
const col = (c) => (c && c.isColor ? c : new THREE.Color(c));
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ colour ramp (cool dark -> base -> warm light)
const _dk = new THREE.Color(), _t = new THREE.Color();
const LIGHT = new THREE.Color('#fff0b0'), COOL = [0.6, 0.72, 0.92];
function tone(base, t, grad, out) {
  out.copy(base); if (grad <= 0) return out;
  if (t < 0.5) { const k = (0.5 - t) * 2 * grad; out.r *= 1 - (1 - COOL[0]) * k; out.g *= 1 - (1 - COOL[1]) * k; out.b *= 1 - (1 - COOL[2]) * k; }
  else { const k = (t - 0.5) * 2 * grad; out.lerp(LIGHT, 0.26 * k); out.multiplyScalar(1 + 0.08 * k); }
  return out;
}

// ------------------------------------------------------------------ materials
const WIND = { value: 0 };
const windTick = () => { WIND.value = performance.now() * 0.001; };
function windify(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWindT = WIND;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindT;').replace('#include <begin_vertex>',
      `vec3 transformed = vec3( position );
       float wW = uv.x; if ( wW > 0.0 ) { float ph = uv.y;
         transformed.x += ( sin( uWindT * 1.7 + ph + position.x * 0.5 + position.z * 0.35 ) + 0.35 * sin( uWindT * 3.3 + ph * 2.0 ) ) * 0.05 * wW;
         transformed.z += cos( uWindT * 1.45 + ph * 1.3 + position.z * 0.45 ) * 0.032 * wW; }`);
  };
  m.customProgramCacheKey = () => 'hv-wind';
  return m;
}
export const envMat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }));
const glossMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05 });
const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.9 });
export const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffb830', emissiveIntensity: 0.5, roughness: 0.6 });
const shadowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
const MATS = { matte: envMat, gloss: glossMat, water: waterMat, lantern: lanternMat, shadow: shadowMat };

// ------------------------------------------------------------------ unit geometry (cached). All have position, normal; y0/y1 in userData
const GC = new Map();
const gc = (k, f) => { let g = GC.get(k); if (!g) { g = f(); g.computeBoundingBox(); g.userData.y0 = g.boundingBox.min.y; g.userData.y1 = g.boundingBox.max.y; GC.set(k, g); } return g; };
const G = {
  /** fluffy blob: displaced icosphere with radial normals tilted up (soft balloon light). detail 0/1/2 = 20/80/180 tris */
  lump: (detail = 1, seed = 1, jit = 0.1, up = 0.25) => gc(`lump${detail},${seed},${jit},${up}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, n = g.attributes.normal, s = seed * 1.7 + 0.3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + jit * (Math.sin(x * 3.1 + s) * Math.sin(y * 2.7 + s * 1.3) + 0.7 * Math.sin(z * 3.7 + s * 0.7 + x * 1.3)) / 1.7;
      p.setXYZ(i, x * f, y * f, z * f); const l = Math.hypot(x, y + up, z); n.setXYZ(i, x / l, (y + up) / l, z / l);
    }
    return g;
  }),
  /** faceted rock: flat normals, flattened base. detail 0/1 = 20/80 tris */
  rock: (detail = 1, seed = 1, jit = 0.2) => gc(`rock${detail},${seed},${jit}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, s = seed * 2.3 + 1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + jit * (Math.sin(x * 5.3 + s) * Math.cos(y * 4.1 + s * 1.7) + 0.8 * Math.sin(z * 4.7 + s + y * 2) ) / 1.8;
      p.setXYZ(i, x * f, Math.max(y * f, -0.55), z * f);
    }
    g.computeVertexNormals(); return g;
  }),
  /** open or closed tapered cylinder, base radius 1, height 1, bottom at y=0; r = top/bottom ratio */
  cyl: (ratio = 1, seg = 8, open = false) => gc(`cyl${ratio},${seg},${open}`, () => { const g = new THREE.CylinderGeometry(ratio, 1, 1, seg, 1, open); g.translate(0, 0.5, 0); return g; }),
  /** rounded box base at y=0 (centre in x/z) */
  box: () => gc('box', () => { const g = roundedBoxGeo(1, 1, 1, 0.14, 1).clone(); g.translate(0, 0.5, 0); return g; }),
  plain: () => gc('plain', () => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; }),
  octa: () => gc('octa', () => { const g = new THREE.OctahedronGeometry(1, 0); g.computeVertexNormals(); return g; }),
  /** flat disc facing up, unit radius */
  disc: (seg = 14) => gc(`disc${seg}`, () => { const g = new THREE.CircleGeometry(1, seg); g.rotateX(-Math.PI / 2); return g; }),
  lathe: (profile, seg = 14) => gc(`lathe${JSON.stringify(profile)},${seg}`, () => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg)),
  /** log end / stump top with growth rings, facing up, unit radius, own colours */
  rings: () => gc('rings', () => polarGeo([{ r: 0, y: 0, c: () => '#a8703f' }, { r: 0.28, y: 0, c: () => '#a8703f' }, { r: 0.36, y: 0, c: () => '#ecc88c' }, { r: 0.62, y: 0, c: () => '#e3b97c' }, { r: 0.7, y: 0, c: () => '#b9814a' }, { r: 0.9, y: 0, c: () => '#d9a766' }, { r: 1, y: 0, c: () => '#8a5a3a' }], 12)),
};

// ------------------------------------------------------------------ the Builder: collects parts into one coloured geometry per material
const _m = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color(), _bc = new THREE.Color(), _mc = new THREE.Color();
class Builder {
  constructor(floor = 0) { this.floor = floor; this.T = new THREE.Matrix4(); this.sets = {}; for (const k of ['matte', 'gloss', 'water', 'lantern', 'shadow']) this.sets[k] = { pos: [], nor: [], col: [], uv: [] }; this.tris = 0; }
  /** run fn with an extra placement transform (x,y,z, uniform scale, yaw) */
  xf(x, y, z, sc, yaw, fn) { const old = this.T; this.T = new THREE.Matrix4().multiplyMatrices(old, new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), new THREE.Vector3(sc, sc, sc))); fn(this); this.T = old; return this; }
  /**
   * add a cached/unit geometry. o: p [x,y,z], s number|[x,y,z], r [rx,ry,rz] (order YXZ), c colour, grad (tone strength, default .6), m set name,
   * ao (ground darkening 0..1, default .3), aoH (height of the falloff), facet (per-face value jitter), seed, moss {c, amt}, sw (wind weight 0..1)
   */
  add(g, o = {}) {
    const set = this.sets[o.m || 'matte'], px = o.p || [0, 0, 0], sc = o.s == null ? 1 : o.s, s = typeof sc === 'number' ? [sc, sc, sc] : sc, r = o.r || [0, 0, 0];
    _m.compose(_v.set(px[0], px[1], px[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ')), new THREE.Vector3(s[0], s[1], s[2])); _m.premultiply(this.T); _n3.getNormalMatrix(_m);
    const p = g.attributes.position, n = g.attributes.normal, gcol = g.attributes.color, idx = g.index, cnt = idx ? idx.count : p.count;
    const y0 = g.userData.y0 ?? 0, y1 = g.userData.y1 ?? 1, ih = 1 / Math.max(1e-6, y1 - y0), grad = o.grad ?? 0.6, ao = o.ao ?? 0.3, aoH = o.aoH ?? 0.45, facet = o.facet || 0, seed = o.seed || 0;
    if (!gcol) _bc.copy(col(o.c ?? '#ffffff'));
    const shadow = o.m === 'shadow'; let phase = 0;
    const cx = _m.elements[12], cz = _m.elements[14]; phase = (hash(cx * 0.37, cz * 0.53) * TAU);
    let fj = 1;
    for (let k = 0; k < cnt; k++) {
      const i = idx ? idx.getX(k) : k;
      if (facet && k % 3 === 0) fj = 1 + (hash(k * 0.173 + seed, seed * 3.1 + (k % 7)) - 0.5) * 2 * facet;
      _v.fromBufferAttribute(p, i); const t = (_v.y - y0) * ih; _v.applyMatrix4(_m);
      set.pos.push(_v.x, _v.y, _v.z);
      let nx = 0, ny = 1, nz = 0; if (n) { _v.fromBufferAttribute(n, i).applyMatrix3(_n3).normalize(); nx = _v.x; ny = _v.y; nz = _v.z; }
      set.nor.push(nx, ny, nz);
      if (shadow) { set.col.push(gcol.getX(i), gcol.getY(i), gcol.getZ(i), gcol.getW(i)); set.uv.push(0, 0); continue; }
      if (gcol) _c.setRGB(gcol.getX(i), gcol.getY(i), gcol.getZ(i)); else tone(_bc, t, grad, _c);
      if (o.moss) { const mk = sstep(0.4, 0.85, ny) * (o.moss.amt ?? 1); if (mk > 0) { tone(_mc.set(o.moss.c), clamp(t * 0.6 + 0.4), 0.5, _t); _c.lerp(_t, mk); } }
      if (fj !== 1) _c.multiplyScalar(fj);
      if (ao > 0) { const yy = _v.y - this.floor; _c.multiplyScalar(1 - ao * Math.pow(1 - sstep(0, aoH, yy), 1.5)); }
      set.col.push(_c.r, _c.g, _c.b);
      set.uv.push(o.swc != null ? o.swc : o.sw ? o.sw * (0.25 + 0.75 * t) : 0, o.ph != null ? o.ph : phase);
    }
    this.tris += cnt / 3; return this;
  }
  // ---- shorthands
  box(w, h, d, x, y, z, c, o = {}) { return this.add(G.box(), { p: [x, y, z], s: [w, h, d], c, ...o }); }
  plain(w, h, d, x, y, z, c, o = {}) { return this.add(G.plain(), { p: [x, y, z], s: [w, h, d], c, ...o }); }
  cyl(rt, rb, h, x, y, z, c, o = {}) { return this.add(G.cyl(rb > 0 ? rt / rb : 0, o.seg || 8, o.open), { p: [x, y, z], s: [rb, h, rb], c, ...o }); }
  lump(r, x, y, z, c, o = {}) { const s = o.s || [1, 1, 1]; const ss = typeof s === 'number' ? [s, s, s] : s; return this.add(G.lump(o.d ?? 1, o.seed || 1, o.jit ?? 0.1, o.up ?? 0.25), { p: [x, y, z], c, ...o, s: [r * ss[0], r * ss[1], r * ss[2]] }); }
  rock(r, x, y, z, c, o = {}) { const s = o.s || [1, 1, 1]; const ss = typeof s === 'number' ? [s, s, s] : s; return this.add(G.rock(o.d ?? 1, o.seed || 1, o.jit ?? 0.2), { p: [x, y, z], c, grad: 0.7, facet: 0.07, seed: o.seed || 1, ...o, s: [r * ss[0], r * ss[1], r * ss[2]] }); }
  /** soft contact shadow */
  shadow(x, z, r, op = 0.3, sx = 1, sz = 1, y = 0.03) {
    const set = this.sets.shadow, seg = 10, dark = [0.05, 0.12, 0.08]; y += this.floor;
    const ring = (rad, a, i) => [x + Math.cos(i / seg * TAU) * rad * sx, y, z + Math.sin(i / seg * TAU) * rad * sz, a];
    const push = (q) => { set.pos.push(q[0], q[1], q[2]); set.nor.push(0, 1, 0); set.col.push(dark[0], dark[1], dark[2], q[3]); set.uv.push(0, 0); };
    for (let i = 0; i < seg; i++) {
      const c0 = [x, y, z, op], a0 = ring(r * 0.5, op * 0.7, i), a1 = ring(r * 0.5, op * 0.7, i + 1), b0 = ring(r, 0, i), b1 = ring(r, 0, i + 1);
      for (const q of [c0, a1, a0, a0, a1, b0, a1, b1, b0]) push(q);
    }
    this.tris += seg * 3; return this;
  }
  /** add a raw coloured BufferGeometry (own colours/normals), transformed by the current xf */
  geo(g, set = 'matte', o = {}) { return this.add(g, { m: set, ao: 0, ...o }); }
  bake() {
    const out = { tris: this.tris };
    for (const [k, s] of Object.entries(this.sets)) {
      if (!s.pos.length) continue; const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, k === 'shadow' ? 4 : 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
      g.computeBoundingSphere(); out[k] = g;
    }
    return out;
  }
}
const BAKED = new Map();
/** bake (once) and cache by key. build(b) fills a Builder. */
function baked(key, build, floor = 0) { let e = BAKED.get(key); if (!e) { const b = new Builder(floor); build(b); e = b.bake(); BAKED.set(key, e); } return e; }
function instantiate(e, { shadows = true } = {}) {
  const g = new THREE.Group();
  for (const k of ['matte', 'gloss', 'water', 'lantern', 'shadow']) {
    if (!e[k]) continue; if (k === 'shadow' && !shadows) continue;
    const m = new THREE.Mesh(e[k], MATS[k]); if (k === 'shadow') { m.renderOrder = 1; } else { m.castShadow = k !== 'water' && k !== 'lantern'; m.receiveShadow = true; }
    if (k === 'matte') m.onBeforeRender = windTick; m.name = ''; g.add(m);
  }
  return g;
}
const make = (key, build, floor = 0, opt) => instantiate(baked(key, build, floor), opt);

// ------------------------------------------------------------------ generic geometry makers
/** polar grid: rows = [{ r, y, c(x,z,theta,row) -> colour, wob? }], first row r=0 is the centre. Smooth normals. */
function polarGeo(rows, segs = 32, o = {}) {
  const pos = [], colr = [], idx = [], wob = o.wob || ((th) => 1);
  for (let i = 0; i < rows.length; i++) {
    const R = rows[i];
    for (let j = 0; j <= segs; j++) {
      const th = (j % segs) / segs * TAU, rr = R.r * (R.r > 0 ? wob(th, i) : 1), x = Math.cos(th) * rr, z = Math.sin(th) * rr, y = typeof R.y === 'function' ? R.y(x, z, th) : R.y;
      pos.push(x, y, z); const c = col(R.c(x, z, th, i)); colr.push(c.r, c.g, c.b);
    }
  }
  const W = segs + 1;
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    if (o.flip) { idx.push(a, c, b, b, c, d); } else { idx.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (o.nUp) { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { n.setXYZ(i, n.getX(i) * (1 - o.nUp), lerp(n.getY(i), 1, o.nUp), n.getZ(i) * (1 - o.nUp)); } }
  g.computeBoundingBox(); g.userData.y0 = g.boundingBox.min.y; g.userData.y1 = g.boundingBox.max.y; return g;
}
/**
 * Sweep a profile along a path. rings = array of arrays of {x,y,z,c}. cut = Set of ring indices after which no strip is made.
 * flip reverses the winding. Smooth normals (duplicate a ring to get a hard edge).
 */
function sweepGeo(rings, { cut, flip, orient } = {}) {
  const pos = [], colr = [], K = rings[0].length;
  for (const ring of rings) for (const q of ring) { pos.push(q.x, q.y, q.z); const c = col(q.c); colr.push(c.r, c.g, c.b); }
  const build = (fl) => {
    const idx = []; for (let i = 0; i < rings.length - 1; i++) { if (cut && cut.has(i)) continue; for (let k = 0; k < K - 1; k++) { const a = i * K + k, b = a + 1, c = a + K, d = c + 1; if (fl) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  let g = build(!!flip);
  if (orient) { // 'up': the highest vertices must face up; 'out': normals must face away from the Y axis
    const p = g.attributes.position, n = g.attributes.normal; let maxY = -1e9, s = 0; for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i));
    for (let i = 0; i < p.count; i++) { if (orient === 'up') { if (p.getY(i) > maxY - 0.004) s += n.getY(i); } else s += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i); }
    if (s < 0) g = build(!flip);
  }
  g.computeBoundingBox(); g.userData.y0 = g.boundingBox.min.y; g.userData.y1 = g.boundingBox.max.y; return g;
}
/** flat triangles list [[x,y,z,colour]*3...] -> geometry (up-facing if wound CCW seen from above) */
function triGeo(tris, up = true) {
  const pos = [], colr = []; for (let t of tris) { if (up) { const ux = t[1][0] - t[0][0], uz = t[1][2] - t[0][2], vx = t[2][0] - t[0][0], vz = t[2][2] - t[0][2]; if (uz * vx - ux * vz < 0) t = [t[0], t[2], t[1]]; } for (const v of t) { pos.push(v[0], v[1], v[2]); const c = col(v[3]); colr.push(c.r, c.g, c.b); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.computeVertexNormals();
  g.computeBoundingBox(); g.userData.y0 = g.boundingBox.min.y; g.userData.y1 = g.boundingBox.max.y; return g;
}
const paint = (x, z, a, b, sc = 0.5, lo = 0.35, hi = 0.65) => col(a).clone().lerp(col(b), sstep(lo, hi, fbm(x * sc + 11, z * sc + 7)));
const ang = (x, z) => Math.atan2(z, x);
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// ------------------------------------------------------------------ small prop parts (write into a Builder)
const WOOD = P.wood, WOOD_D = P.bark;
function mushroomInto(b, x, z, s = 1, y = 0, cap = '#e8564a') {
  b.cyl(0.035 * s, 0.05 * s, 0.1 * s, x, y, z, '#f6ead0', { seg: 6, ao: 0.1 });
  b.lump(0.11 * s, x, y + 0.11 * s, z, cap, { d: 1, s: [1, 0.7, 1], jit: 0.04, grad: 0.7, ao: 0 });
  for (const [dx, dz, rr] of [[0.04, 0.04, 0.025], [-0.05, 0.02, 0.02], [0.0, -0.06, 0.022]]) b.lump(rr * s, x + dx * s, y + 0.17 * s, z + dz * s, '#fffaf0', { d: 0, grad: 0, ao: 0 });
}
function tuftInto(b, x, y, z, s = 1, c = P.grassDark, n = 5, sw = 1) {
  const r = krng(Math.floor(x * 97 + z * 57 + 3));
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, lean = 0.12 + r() * 0.35, h = (0.2 + r() * 0.2) * s, rad = 0.032 * s;
    b.add(G.cyl(0, 3, true), { p: [x + Math.cos(a) * 0.04 * s, y, z + Math.sin(a) * 0.04 * s], s: [rad, h, rad], r: [lean, a, 0], c, grad: 0.9, ao: 0, sw });
  }
}
function flowerInto(b, x, y, z, color, s = 1, h = 0.18) {
  b.add(G.cyl(0, 3, true), { p: [x, y, z], s: [0.012 * s, h * s, 0.012 * s], c: '#4f9a3a', grad: 0.3, ao: 0, sw: 0.9 });
  b.lump(0.055 * s, x, y + h * s, z, color, { d: 0, s: [1, 0.6, 1], jit: 0.05, grad: 0.4, ao: 0, sw: 0.9 }); b.lump(0.02 * s, x, y + h * s + 0.02 * s, z, '#ffd24a', { d: 0, grad: 0, ao: 0, sw: 0.9 });
}
const FLOWERS = ['#ef7fb0', '#fff6e0', '#ffd24a', '#a78bf0', '#ff8a5c', '#6fb4f0'];
function logInto(b, x, y, z, len, rad, yaw, c = '#a8683f') {
  // horizontal log centred at (x,y,z) on the ground, axis direction d = (-cos yaw, 0, sin yaw)
  const dx = -Math.cos(yaw), dz = Math.sin(yaw), cy = y + rad;
  b.add(G.cyl(1, 8), { p: [x - dx * len / 2, cy, z - dz * len / 2], s: [rad, len, rad], r: [0, yaw, Math.PI / 2], c, grad: 0.6, ao: 0.2 });
  b.add(G.rings(), { p: [x + dx * (len / 2 + 0.004), cy, z + dz * (len / 2 + 0.004)], s: rad * 0.98, r: [0, yaw, Math.PI / 2], ao: 0 });
  b.add(G.rings(), { p: [x - dx * (len / 2 + 0.004), cy, z - dz * (len / 2 + 0.004)], s: rad * 0.98, r: [0, yaw, -Math.PI / 2], ao: 0 });
}

// =================================================================== 1. RESOURCE NODES
export const TREE_SPECIES = ['oak', 'pine', 'birch', 'apple'];
const SPECIES_BY_SEED = ['oak', 'pine', 'birch', 'apple', 'oak', 'oak', 'pine', 'birch', 'oak', 'apple'];
const LEAF = {
  oak: ['#4fa845', '#58b04a', '#47a04c'], pine: ['#2f8f58', '#2a8660', '#389a5a'], birch: ['#8fd45a', '#a2d95a', '#86cf62'], apple: ['#62b84a', '#58b552', '#6cbd4c'],
};
/** write one tree of the given species into builder b (origin at trunk base, ~1 unit footprint). lod 0 = hero (about 650 tris), 1 = forest (about 250) */
function treeInto(b, sp, v, lod) {
  const r = krng(v * 977 + sp.length * 131 + 7), j = (a) => (r() - 0.5) * 2 * a, hi = lod === 0, lc = LEAF[sp][v % 3], sw = 0.5;
  const L = (x, y, z, rad, c, o = {}) => b.lump(rad, x + j(0.035), y + j(0.03), z + j(0.035), c, { d: 1, seed: v + 2, jit: 0.1, grad: 0.95, ao: 0, sw, ...o });
  const dark = col(lc).clone().multiplyScalar(0.82), light = col('#9be065').lerp(col(lc), 0.35);
  const trunk = (rb, rt, h, c, seg = 7, lean = 0) => b.add(G.lathe([[rb * 1.5, 0], [rb * 1.12, 0.1 * h], [rt * 1.05, 0.5 * h], [rt, h]], seg), { p: [0, 0, 0], s: 1, c, grad: 0.5, ao: 0.35, aoH: 0.3, r: [0, 0, lean] });
  if (sp === 'oak') {
    trunk(0.13, 0.085, 0.95, P.bark, hi ? 7 : 5);
    if (hi) { b.cyl(0.03, 0.045, 0.34, 0.03, 0.62, 0, P.bark, { seg: 5, r: [0, 0, -0.75], ao: 0 }); b.cyl(0.03, 0.045, 0.3, -0.02, 0.7, 0, P.bark, { seg: 5, r: [0, 0, 0.7], ao: 0 }); }
    if (hi) {
      L(0, 1.4, 0, 0.5, lc, { d: 2, sy: 1 }); L(-0.33, 1.14, 0.08, 0.37, dark, {}); L(0.33, 1.2, -0.06, 0.36, dark, {}); L(0.02, 1.2, 0.34, 0.34, dark, {}); L(-0.06, 1.28, -0.33, 0.33, lc, {});
      L(0.04, 1.86, 0.0, 0.33, lc, { s: [1, 0.92, 1] }); L(0.22, 1.97, 0.12, 0.2, light, { d: 0 }); L(-0.26, 1.58, 0.3, 0.17, light, { d: 0 }); L(0.3, 1.58, -0.22, 0.15, light, { d: 0 });
    } else { L(0, 1.32, 0, 0.5, lc, {}); L(-0.3, 1.1, 0.1, 0.34, dark, { d: 0 }); L(0.3, 1.14, -0.06, 0.34, dark, { d: 0 }); L(0.04, 1.78, 0, 0.34, lc, { d: 1 }); L(0.2, 1.9, 0.1, 0.17, light, { d: 0 }); }
  } else if (sp === 'pine') {
    trunk(0.1, 0.07, 0.8, P.barkDark, hi ? 7 : 5);
    const tiers = hi ? [[0.55, 0.74, 0.5], [0.46, 1.16, 0.48], [0.36, 1.56, 0.46], [0.25, 1.95, 0.5]] : [[0.55, 0.78, 0.5], [0.42, 1.28, 0.48], [0.27, 1.78, 0.5]];
    tiers.forEach(([rad, y, sy], i) => { L(j(0.04), y, j(0.04), rad, i % 2 ? dark : lc, { s: [1, sy, 1], jit: 0.14, up: 0.45, seed: v + i }); });
    if (hi) { L(0.36, 0.7, 0.14, 0.2, dark, { d: 0, s: [1, 0.6, 1] }); L(-0.34, 0.74, -0.18, 0.2, dark, { d: 0, s: [1, 0.6, 1] }); L(0.0, 1.12, -0.38, 0.17, lc, { d: 0, s: [1, 0.6, 1] }); }
    L(0.0, tiers[tiers.length - 1][1] + 0.3, 0, 0.13, light, { d: 0, s: [1, 1.5, 1], up: 0.1 });
  } else if (sp === 'birch') {
    b.add(G.lathe([[0.1, 0], [0.075, 0.2], [0.06, 0.9], [0.05, 1.5]], hi ? 7 : 5), { c: '#f1ead8', grad: 0.35, ao: 0.4, aoH: 0.3, r: [0, 0, 0.05] });
    if (hi) for (const [y, a] of [[0.25, 0.4], [0.5, 2.6], [0.78, 1.2], [1.05, 4.1], [1.3, 0.2]]) b.add(G.lump(0, 1, 0.1, 0), { p: [Math.sin(a) * 0.07 * (1 - y * 0.2) + 0.03 * y, y, Math.cos(a) * 0.07 * (1 - y * 0.2)], s: [0.045, 0.025, 0.03], r: [0, a, 0], c: '#3a3228', grad: 0, ao: 0 });
    if (hi) { L(0.0, 1.7, 0, 0.36, lc, { s: [1, 1.25, 1] }); L(-0.26, 1.45, 0.1, 0.27, dark, { s: [1, 1.1, 1] }); L(0.27, 1.52, -0.05, 0.26, dark, { s: [1, 1.1, 1] }); L(0.06, 2.1, 0.04, 0.27, lc, { s: [1, 1.2, 1] }); L(0.0, 1.42, 0.28, 0.23, dark, { d: 0 }); L(0.16, 2.0, 0.16, 0.16, light, { d: 0 }); L(-0.18, 1.78, 0.2, 0.14, light, { d: 0 }); }
    else { L(0.0, 1.7, 0, 0.38, lc, { s: [1, 1.25, 1] }); L(-0.25, 1.45, 0.1, 0.26, dark, { d: 0, s: [1, 1.1, 1] }); L(0.26, 1.5, -0.05, 0.25, dark, { d: 0, s: [1, 1.1, 1] }); L(0.06, 2.1, 0.04, 0.27, light, { d: 0, s: [1, 1.2, 1] }); }
  } else { // apple
    trunk(0.15, 0.1, 0.78, P.bark, hi ? 7 : 5);
    const cs = [[0, 1.2, 0, 0.55, lc, 2], [-0.4, 1.0, 0.1, 0.38, dark, 1], [0.4, 1.05, -0.05, 0.38, dark, 1], [0.0, 1.05, 0.4, 0.36, dark, 1], [-0.05, 1.08, -0.4, 0.34, lc, 1], [0.04, 1.62, 0, 0.36, lc, 1]];
    if (hi) { for (const [x, y, z, rad, c, d] of cs) L(x, y, z, rad, c, { d: d === 2 ? 1 : 1, s: [1, 0.86, 1] }); L(0.2, 1.8, 0.1, 0.2, light, { d: 0 }); }
    else { L(0, 1.2, 0, 0.55, lc, { s: [1, 0.86, 1] }); L(-0.38, 1.0, 0.1, 0.36, dark, { d: 0 }); L(0.4, 1.05, -0.05, 0.36, dark, { d: 0 }); L(0.04, 1.62, 0, 0.34, lc, { d: 0 }); }
    const na = hi ? 8 : 4;
    for (let i = 0; i < na; i++) { const c = cs[i % 5], a = j(Math.PI) + i * 2.4, e = -0.15 + r() * 0.5, rr = c[3] * 0.96; const ap = [c[0] + Math.cos(a) * Math.cos(e) * rr, c[1] + Math.sin(e) * rr * 0.86, c[2] + Math.sin(a) * Math.cos(e) * rr];
      b.lump(0.075, ap[0], ap[1], ap[2], '#e5392f', { d: 0, grad: 0.5, ao: 0, jit: 0.04 }); if (hi) b.lump(0.025, ap[0], ap[1] + 0.07, ap[2], '#5a3a22', { d: 0, grad: 0, ao: 0 }); }
  }
}
const SHADOW_R = { oak: 0.78, pine: 0.66, birch: 0.62, apple: 0.82 };
/** baked tree entry (geometry shared; used by scatter instancing) */
export function bakedTree(sp, v = 0, lod = 0) { return baked(`tree:${sp}:${v}:${lod}`, (b) => { treeInto(b, sp, v, lod); b.shadow(0, 0, SHADOW_R[sp], 0.34, 1, 1, 0.03); }); }
/** Tree resource node. Species chosen by seed (oak 40%, pine/birch/apple 20% each). ~1 unit footprint, 1.8 to 2.6 tall. opts: { species, lod } */
export function treeModel(seed = 0, opts = {}) {
  const s = Math.abs(Math.floor(seed)), sp = opts.species || SPECIES_BY_SEED[s % 10], v = Math.floor(s / 10) % 3 + (sp === 'oak' ? 0 : 0);
  const g = instantiate(bakedTree(sp, v, opts.lod || 0)); const h = hash(s * 1.3, 4.1);
  g.rotation.y = h * TAU; g.scale.setScalar(0.94 + 0.14 * hash(s, 9.7)); g.userData = { species: sp, topY: sp === 'pine' ? 2.5 : sp === 'birch' ? 2.4 : sp === 'oak' ? 2.2 : 1.9 };
  return g;
}

function stumpInto(b, big = false) {
  const s = big ? 1.25 : 1;
  b.add(G.lathe([[0.36 * s, 0], [0.28 * s, 0.06], [0.22 * s, 0.3 * s], [0.215 * s, 0.34 * s]], 9), { c: P.bark, grad: 0.7, ao: 0.4, aoH: 0.25 });
  b.add(G.rings(), { p: [0, 0.34 * s + 0.004, 0], s: 0.215 * s, ao: 0 });
  for (const [a, rr] of [[0.6, 0.27], [2.7, 0.26], [4.5, 0.25]]) b.lump(0.09 * s, Math.cos(a) * rr * s, 0.04, Math.sin(a) * rr * s, P.barkDark, { d: 0, s: [1.4, 0.55, 0.8], grad: 0.5, ao: 0.1, jit: 0.05 });
  b.lump(0.06 * s, 0.1 * s, 0.37 * s, -0.12 * s, P.leafLight, { d: 0, s: [1.3, 0.7, 1], grad: 0.6, ao: 0 });
}
/** The cut tree: a chunky stump with growth rings and a green sprout. ~0.7 wide. */
export function stumpModel() { return make('stump', (b) => { stumpInto(b); b.shadow(0, 0, 0.55, 0.3); }); }

function boulderCluster(b, seed, big = 1) {
  const r = krng(seed * 31 + 5), warm = r() < 0.5, base = warm ? ['#aaa59c', '#bdb8ad', '#8f8a82'] : [P.stone, P.stoneLight, P.stoneDark];
  const part = (rad, x, z, sx, sy, sz, i) => {
    const y = rad * sy * 0.55 * 0.9; b.rock(rad, x, y, z, base[i % 3], { s: [sx, sy, sz], d: 1, seed: seed + i, r: [0, r() * TAU, 0], moss: { c: '#6b9a3a', amt: 0.9 }, ao: 0.4, aoH: 0.35 });
    return [x, y, z, rad * sx, rad * sy, rad * sz];
  };
  const m = part(0.46 * big, 0, 0, 1.15, 0.95, 1.0, 0), s1 = part(0.31 * big, 0.5 * big, 0.2 * big, 1, 0.85, 1, 1), s2 = part(0.25 * big, -0.4 * big, 0.28 * big, 1.1, 0.8, 1, 2), s3 = part(0.15 * big, -0.1 * big, -0.5 * big, 1, 0.8, 1, 1);
  // pale crystals from the main boulder and one smaller
  const cr = (cx, cy, cz, h, tx, tz, c = '#e8f4ff') => b.add(G.octa(), { m: 'gloss', p: [cx, cy, cz], s: [h * 0.28, h, h * 0.28], r: [tx, 0, tz], c, grad: 0.5, ao: 0 });
  cr(m[0] + 0.12 * big, m[1] + m[4] * 0.85, m[2] - 0.08 * big, 0.2 * big, 0.2, -0.25); cr(m[0] - 0.08 * big, m[1] + m[4] * 0.95, m[2] + 0.1 * big, 0.14 * big, -0.3, 0.2, '#cfe4f4'); cr(s1[0], s1[1] + s1[4] * 0.8, s1[2], 0.12 * big, 0.2, 0.25, '#f2faff');
  // ore speckles: small pale chips pressed into the faces
  for (let i = 0; i < 7; i++) { const t = [m, s1, s2][i % 3], a = r() * TAU, e = 0.1 + r() * 0.5; const x = t[0] + Math.cos(a) * Math.cos(e) * t[3] * 0.93, y = t[1] + Math.sin(e) * t[4] * 0.9, z = t[2] + Math.sin(a) * Math.cos(e) * t[5] * 0.93; b.add(G.rock(0, 3 + i, 0.15), { p: [x, y, z], s: 0.04 * big, c: i % 2 ? '#e9f1f5' : '#f3d58a', grad: 0.3, ao: 0 }); }
  tuftInto(b, m[0] + 0.02, m[1] + m[4] * 0.88, m[2], 0.8 * big, P.leaf, 4, 0.7);
}
/** Stone resource node: faceted boulder cluster, mossy top, pale crystals and ore speckles. 1x1 footprint, ~0.8 tall. */
export function rockModel(seed = 0) { const s = Math.abs(Math.floor(seed)) % 6; const g = instantiate(baked(`rock:${s}`, (b) => { boulderCluster(b, s); b.shadow(0.05, 0.05, 0.78, 0.34); })); g.rotation.y = hash(seed, 2.2) * TAU; return g; }

function clayInto(b, seed) {
  const r = krng(seed * 13 + 3);
  // earthen bowl: raised rim, wet clay inside
  b.add(G.lathe([[0.7, 0], [0.64, 0.06], [0.56, 0.17], [0.46, 0.18], [0.38, 0.1], [0.3, 0.07], [0.0, 0.07]], 14), { c: '#9a6a43', grad: 0.8, ao: 0.4, aoH: 0.2, facet: 0.04, seed });
  b.lump(0.4, 0, 0.075, 0, '#d4703a', { m: 'gloss', d: 1, s: [1, 0.12, 1], jit: 0.06, grad: 0.7, ao: 0 });
  b.lump(0.14, -0.1, 0.1, 0.06, '#e68a4c', { m: 'gloss', d: 1, s: [1.2, 0.6, 1], jit: 0.1, grad: 0.7, ao: 0 });
  for (const [x, z, rad] of [[0.52, -0.3, 0.17], [-0.5, -0.32, 0.14], [0.2, 0.58, 0.15]]) b.lump(rad, x, rad * 0.55 + 0.03, z, '#c96f3e', { m: 'gloss', d: 1, s: [1.1, 0.7, 1], jit: 0.12, grad: 0.8, ao: 0.1, seed: r() * 9 });
  for (let i = 0; i < 3; i++) { const a = r() * TAU; b.rock(0.045, Math.cos(a) * 0.62, 0.03, Math.sin(a) * 0.62, '#8f8a82', { d: 0, seed: i }); }
  // shovel stuck in the clay
  b.cyl(0.018, 0.02, 0.62, -0.12, 0.1, 0.1, WOOD, { seg: 5, r: [0.1, 0, 0.32], ao: 0 }); b.box(0.12, 0.04, 0.05, -0.31, 0.7, 0.17, WOOD_D, { r: [0.1, 0, 0.32], ao: 0 });
  b.box(0.12, 0.17, 0.025, -0.1, 0.05, 0.1, '#9aa3ad', { r: [0.1, 0, 0.32], ao: 0, grad: 0.6 });
}
/** Clay pit node: round earthen bowl, shiny wet clay, a shovel and mounds. 1x1 footprint, ~0.3 tall (shovel 0.75). */
export function clayModel(seed = 0) { const s = Math.abs(Math.floor(seed)) % 3; const g = instantiate(baked(`clay:${s}`, (b) => { clayInto(b, s); b.shadow(0, 0, 0.9, 0.3); })); g.rotation.y = hash(seed, 6.1) * TAU; return g; }

/** triangle count of an object tree (InstancedMesh counts every instance) */
export function countTris(o) {
  let n = 0; o.traverse((m) => { if (!m.isMesh) return; const g = m.geometry, t = g.index ? g.index.count / 3 : g.attributes.position.count / 3; n += t * (m.isInstancedMesh ? m.count : 1); }); return Math.round(n);
}

// =================================================================== SMALL SCATTER PIECES
const smallModel = (key, build, shadow) => { const g = instantiate(baked(key, (b) => { build(b); if (shadow) b.shadow(0, 0, shadow, 0.22); })); return g; };
function tuftClump(b, v) { const c = [P.grassDark, P.leaf, '#6fb84a', '#8cc84e'][v % 4]; tuftInto(b, 0, 0, 0, 1.15, c, 6, 1); tuftInto(b, 0.05, 0, 0.03, 0.8, '#a6dd62', 3, 1); }
/** a clump of spiky grass blades (about 20 tris), sways in the wind shader. */
export function tuftModel(seed = 0) { return smallModel(`tuft:${Math.abs(seed | 0) % 4}`, (b) => tuftClump(b, Math.abs(seed | 0))); }
function bushInto(b, v, lod = 0) {
  const r = krng(v * 41 + 9), c = ['#4fa845', '#5cb44a', '#3f9a50'][v % 3], dark = col(c).clone().multiplyScalar(0.8), light = '#8fdc62', d = lod ? 0 : 1;
  b.lump(0.36, 0, 0.27, 0, c, { d, seed: v, grad: 0.95, ao: 0.25, aoH: 0.3, s: [1.1, 0.85, 1], sw: 0.3 });
  b.lump(0.27, -0.3, 0.2, 0.12, dark, { d, seed: v + 1, grad: 0.95, ao: 0.25, aoH: 0.3, sw: 0.3 }); b.lump(0.26, 0.28, 0.2, -0.1, dark, { d, seed: v + 2, grad: 0.95, ao: 0.25, aoH: 0.3, sw: 0.3 });
  b.lump(0.2, 0.0, 0.5, 0.0, light, { d: 0, grad: 0.8, ao: 0, sw: 0.3 });
  if (!lod && v % 3 !== 2) for (let i = 0; i < 5; i++) { const a = i * 1.9 + r(), e = 0.2 + r() * 0.8; b.lump(0.04, Math.cos(a) * 0.36 * Math.cos(e) * 1.1, 0.27 + Math.sin(e) * 0.3, Math.sin(a) * 0.36 * Math.cos(e), v % 3 === 0 ? '#e8564a' : '#fff6e0', { d: 0, grad: 0.3, ao: 0 }); }
}
/** a round shrub with berries or blossoms. lod 1 is the cheap instanced version. */
export function bushModel(seed = 0, opts = {}) { const v = Math.abs(seed | 0) % 3, lod = opts.lod || 0; const g = smallModel(`bush:${v}:${lod}`, (b) => bushInto(b, v, lod), 0.6); g.rotation.y = hash(seed, 3) * TAU; return g; }
function flowerPatchInto(b, v) {
  const r = krng(v * 17 + 4), pal = [[0, 2], [3, 1], [4, 2], [5, 1], [0, 1]][v % 5];
  b.lump(0.2, 0, 0.04, 0, '#58b04a', { d: 0, s: [1.4, 0.4, 1.4], grad: 0.8, ao: 0.1, sw: 0.4 });
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + r() * 0.5, rr = 0.06 + r() * 0.17; flowerInto(b, Math.cos(a) * rr, 0.03, Math.sin(a) * rr, FLOWERS[pal[i % 2]], 0.95 + r() * 0.5, 0.15 + r() * 0.1); }
}
/** a patch of 6 flowers on a leaf mound */
export function flowerPatch(seed = 0) { return smallModel(`flowers:${Math.abs(seed | 0) % 5}`, (b) => flowerPatchInto(b, Math.abs(seed | 0))); }
/** two or three toadstools */
export function mushroomModel(seed = 0) { const v = Math.abs(seed | 0) % 2; return smallModel(`mush:${v}`, (b) => { mushroomInto(b, 0, 0, 1, 0, v ? '#e8564a' : '#e8923a'); mushroomInto(b, 0.14, 0.08, 0.65, 0, v ? '#e8564a' : '#e8923a'); mushroomInto(b, -0.1, 0.12, 0.5, 0, '#f6d27a'); }, 0.3); }
function stoneInto(b, v) { const c = [P.stone, '#b6b1a6', P.stoneLight][v % 3]; b.rock(0.2, 0, 0.1, 0, c, { d: 1, seed: v, s: [1.2, 0.8, 1], moss: { c: '#6b9a3a', amt: 0.8 }, ao: 0.4 }); b.rock(0.11, 0.24, 0.05, 0.1, c, { d: 0, seed: v + 3, s: [1, 0.8, 1] }); }
export function stoneModel(seed = 0) { const v = Math.abs(seed | 0) % 3; return smallModel(`stone:${v}`, (b) => stoneInto(b, v), 0.4); }
/** a wooden picket-rail fence segment of length len along X (centred), ~0.65 tall */
export function fenceModel(len = 2, opts = {}) {
  const n = Math.max(1, Math.round(len / 1.0)), step = len / n, c = opts.color || P.woodLight;
  return smallModel(`fence:${len.toFixed(2)}:${c}`, (b) => {
    for (let i = 0; i <= n; i++) { const x = -len / 2 + i * step; b.box(0.13, 0.62, 0.13, x, 0, 0, c, { grad: 0.7, ao: 0.35 }); b.lump(0.085, x, 0.64, 0, c, { d: 0, grad: 0.6, ao: 0, s: [1, 0.8, 1] }); }
    for (const y of [0.18, 0.38]) b.box(len, 0.075, 0.06, 0, y, 0.06, WOOD, { grad: 0.6, ao: 0.2 });
  });
}
/** a dirt path ribbon through points ([x,z] | {x,z} | Vector3). opts: width (0.9), color. Lies on y=0 (raised 0.02 to 0.05). */
export function pathModel(points, opts = {}) {
  const w = opts.width || 0.9, pts = points.map((p) => (Array.isArray(p) ? new THREE.Vector3(p[0], 0, p[1]) : new THREE.Vector3(p.x, 0, p.z)));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), len = curve.getLength(), N = Math.max(4, Math.ceil(len / 0.5));
  const mid = col(opts.color || P.path), edge = col(opts.edge || '#b7a766'), rim = col('#8fb552'), rings = [], prof = [[-1, 0, rim], [-0.82, 0.03, edge], [-0.45, 0.05, mid], [0, 0.055, mid], [0.45, 0.05, mid], [0.82, 0.03, edge], [1, 0, rim]];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t), d = curve.getTangentAt(t), nx = -d.z, nz = d.x, ww = w * 0.5 * (1 + 0.14 * Math.sin(i * 1.3) + 0.08 * Math.sin(i * 2.9 + 1)) * (t < 0.04 || t > 0.96 ? 0.75 : 1), v = 0.94 + 0.06 * hash(i, 1);
    rings.push(prof.map(([u, y, c]) => ({ x: p.x + nx * u * ww * (u === 1 || u === -1 ? 1.15 : 1), y, z: p.z + nz * u * ww * (u === 1 || u === -1 ? 1.15 : 1), c: c.clone().multiplyScalar(v) })));
  }
  const g = sweepGeo(rings, { orient: 'up' });
  const b = new Builder(0); b.geo(g, 'matte', { ao: 0 }); const out = instantiate(b.bake(), {}); out.children.forEach((m) => { m.castShadow = false; }); return out;
}

// =================================================================== INSTANCING HELPERS
/** InstancedMesh from a baked entry (geometry shared) and items [{x,y,z,s,yaw}] */
function instancedFrom(e, items, { cast = true, tint = 0.07, seed = 1 } = {}) {
  if (!items.length || !e.matte) return null;
  const im = new THREE.InstancedMesh(e.matte, envMat, items.length), m = new THREE.Matrix4(), c = new THREE.Color(), r = krng(seed * 7 + items.length);
  items.forEach((it, i) => { m.compose(new THREE.Vector3(it.x, it.y || 0, it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it.yaw || 0, 0)), new THREE.Vector3().setScalar(it.s || 1)); im.setMatrixAt(i, m); c.setRGB(1 + (r() - 0.5) * 2 * tint, 1 + (r() - 0.5) * 2 * tint * 0.7, 1 + (r() - 0.5) * 2 * tint); im.setColorAt(i, c); });
  im.instanceMatrix.needsUpdate = true; im.castShadow = cast; im.receiveShadow = true; im.onBeforeRender = windTick; im.frustumCulled = false; return im;
}
const slotOrigin = (i) => { const a = i / 16 * TAU - Math.PI / 2; return [Math.cos(a) * 40, Math.sin(a) * 40]; };
const FIELD_ANG = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
/** default no-go zones for decoration: plaza, the four valley fields, the 16 village plots */
export function isFree(x, z, pad = 0) {
  const r = Math.hypot(x, z); if (r < 10.8 + pad) return false;
  for (const a of FIELD_ANG) if (Math.hypot(x - Math.cos(a) * 13, z - Math.sin(a) * 13) < 4.7 + pad) return false;
  for (let i = 0; i < 16; i++) { const [ox, oz] = slotOrigin(i); if (Math.abs(x - ox) < 9.2 + pad && Math.abs(z - oz) < 9.2 + pad) return false; }
  return true;
}

// =================================================================== 2. VALLEY FIELDS
const FY = 0.1;   // top of every field/plaza base
/** round dressed ground disc: top at FY, soft lip, dark earth skirt. colorFn(x,z) -> colour */
function fieldBase(b, R, colorFn, { rows = 5, segs = 40, carve } = {}) {
  const rr = []; for (let i = 0; i < rows; i++) rr.push(R * (i / (rows - 1)) * (i === rows - 1 ? 0.95 : 1));
  const skirt = col('#8a6240'), R0 = rows - 1;
  const mk = (r, y, c) => ({ r, y, c });
  const R_ = [];
  for (let i = 0; i < rows; i++) { const r = R * Math.min(1, (i / (rows - 1)) * 1.0) * 0.95; R_.push({ r, y: (x, z) => FY + (carve ? carve(x, z) : 0), c: colorFn }); }
  R_.push({ r: R * 1.0, y: FY - 0.005, c: (x, z) => colorFn(x, z).clone().multiplyScalar(0.92) });
  R_.push({ r: R * 1.04, y: FY - 0.045, c: () => skirt.clone().lerp(col('#a4784a'), 0.4) });
  R_.push({ r: R * 1.04, y: 0, c: () => skirt });
  const wob = (th, i) => 1 + (0.035 * Math.sin(th * 3 + 1) + 0.02 * Math.sin(th * 7 + 2)) * Math.min(1, i / (rows - 1));
  b.geo(polarGeo(R_, segs, { wob, nUp: 0.15 }), 'matte', { ao: 0 });
}
const dirtPath = (x, z, t = 1) => { const px = 0.22 * Math.sin(z * 1.1); const d = Math.abs(x - px); return z > 0.4 ? t * (1 - sstep(0.42, 0.7, d + (fbm(x * 3, z * 3) - 0.5) * 0.25)) : 0; };

function treeFieldStatic(b) {
  const A = col('#80c04e'), B = col('#5fa142'), litter = col('#b8924f'), dirt = col('#d1b27a');
  fieldBase(b, 3.6, (x, z) => {
    let c = paint(x, z, A, B, 0.6); const dd = Math.hypot(x, z - 0.45), cl = sstep(1.5, 1.0, dd + (fbm(x * 2, z * 2) - 0.5) * 0.6);
    c = c.lerp(litter, sstep(0.62, 0.8, fbm(x * 1.4 + 3, z * 1.4)) * 0.45); c.lerp(dirt, cl * 0.95); c.lerp(dirt, dirtPath(x, z) * 0.95); return c;
  });
  b.shadow(0, 0, 4.1, 0.18, 1, 1, 0.0);
  // logging area in the clearing
  b.xf(-0.55, FY, 0.2, 1, 0.4, () => stumpInto(b, true)); b.shadow(-0.55, 0.2, 0.55, 0.28, 1, 1, 0.01);
  b.xf(0.55, FY, 0.75, 1, 1.2, () => stumpInto(b, false));
  // axe stuck in the big stump
  b.cyl(0.022, 0.026, 0.55, -0.55, FY + 0.34 * 1.25, 0.2, WOOD, { seg: 5, r: [0.2, 0.5, 0.35], ao: 0 }); b.box(0.2, 0.11, 0.03, -0.66, FY + 0.34 * 1.25 + 0.38, 0.2, '#9aa3ad', { r: [0.2, 0.5, 0.35], ao: 0, grad: 0.6 });
  // log pile + a fallen log
  logInto(b, -1.45, FY, 1.6, 1.0, 0.15, 0.2, '#a9693f'); logInto(b, -1.4, FY, 1.9, 1.0, 0.15, 0.1, '#b87445'); logInto(b, -1.43, FY + 0.22, 1.75, 1.0, 0.14, 0.15, '#9a5f38');
  logInto(b, 1.4, FY, -0.2, 1.3, 0.16, 2.1, '#8f5a36'); b.shadow(-1.4, 1.75, 0.8, 0.25, 1.2, 0.8, 0.01);
  // signpost at the path start
  b.cyl(0.04, 0.05, 0.85, 0.9, FY, 2.95, WOOD_D, { seg: 6 }); b.box(0.5, 0.17, 0.05, 0.9, FY + 0.5, 2.97, P.woodLight, { r: [0, -0.2, 0.03], grad: 0.5, ao: 0 }); b.box(0.3, 0.13, 0.05, 0.88, FY + 0.7, 2.93, P.woodLight, { r: [0, 0.3, -0.04], grad: 0.5, ao: 0 });
  for (const [x, z, s] of [[-1.9, 0.6, 1], [2.4, 1.2, 0.8], [1.1, -1.9, 1.1], [-2.5, -1.0, 0.8]]) { mushroomInto(b, x, z, s, FY); mushroomInto(b, x + 0.18 * s, z + 0.1, 0.6 * s, FY); }
  for (const [x, z, s] of [[-2.7, 1.5, 1], [2.9, -0.3, 1.1], [-0.4, -2.9, 1.2], [1.6, 2.5, 0.9]]) b.xf(x, FY, z, s, x, () => bushInto(b, 1, 1));
}
function treeFieldSway(b) { const r = krng(5); for (let i = 0; i < 26; i++) { const a = r() * TAU, rr = 0.8 + r() * 2.7; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (Math.abs(x) < 0.7 && z > 0.4) continue; tuftInto(b, x, FY, z, 1.1 + r() * 0.5, r() < 0.5 ? P.leafDark : P.leaf, 6, 1); }
  for (let i = 0; i < 6; i++) { const a = r() * TAU, rr = 1.8 + r() * 1.4, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (Math.abs(x) < 0.8 && z > 0.4) continue; for (let k = 0; k < 3; k++) flowerInto(b, x + r() * 0.2, FY, z + r() * 0.2, FLOWERS[(i + k) % 6], 1, 0.16); } }
function treeFieldStuff(b) {
  const r = krng(11), placed = [], SP = ['oak', 'pine', 'birch', 'apple', 'oak', 'pine', 'oak'];
  let guard = 0; while (placed.length < 13 && guard++ < 400) {
    const a = r() * TAU, rr = 1.6 + r() * 1.75, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (Math.hypot(x, z - 0.45) < 1.35) continue; if (Math.abs(x - 0.22 * Math.sin(z * 1.1)) < 0.85 && z > 0.2) continue; if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 0.98)) continue;
    placed.push([x, z]);
  }
  placed.forEach(([x, z], i) => { const sp = SP[i % SP.length], v = i % 3, s = 0.82 + 0.28 * r(); b.xf(x, FY, z, s, r() * TAU, () => { treeInto(b, sp, v, i % 3 === 0 ? 0 : 1); }); b.shadow(x, z, SHADOW_R[sp] * s, 0.3, 1, 1, 0.01); });
}

// ---- Riverbank Clay
const RIVER = new THREE.CatmullRomCurve3([[-3.6, 0, -0.9], [-2.7, 0, -2.0], [-1.3, 0, -2.75], [0.3, 0, -2.9], [1.9, 0, -2.45], [3.0, 0, -1.6], [3.6, 0, -0.55]].map((p) => new THREE.Vector3(...p)));
const RIVER_PTS = RIVER.getSpacedPoints(40);
const riverW = (t) => 0.1 + 0.5 * Math.sin(Math.PI * t) ** 0.7;
function riverDist(x, z) { let best = 9, bt = 0; for (let i = 0; i < RIVER_PTS.length; i++) { const d = Math.hypot(RIVER_PTS[i].x - x, RIVER_PTS[i].z - z); if (d < best) { best = d; bt = i / (RIVER_PTS.length - 1); } } return best - riverW(bt); }
function clayFieldStatic(b) {
  const sand = col('#e4cc96'), mud = col('#a77c4d'), wet = col('#8d6a41'), tan = col('#cfa972'), path = col('#e9d6a2');
  fieldBase(b, 3.6, (x, z) => {
    const rd = riverDist(x, z); let c = paint(x, z, tan, '#c19460', 0.7); c.lerp(sand, sstep(0.9, 0.35, rd) * 0.8); c.lerp(wet, sstep(0.3, 0.0, rd)); c.lerp(path, dirtPath(x, z) * 0.7);
    const pd = Math.hypot(x - 0.05, z - 0.3); c.lerp(wet, sstep(1.9, 1.5, pd) * 0.5); return c;
  }, { rows: 9, segs: 56, carve: (x, z) => -0.07 * (1 - sstep(-0.1, 0.5, riverDist(x, z))) });
  // river water
  const rings = []; const N = 24;
  for (let i = 0; i <= N; i++) { const t = i / N, p = RIVER.getPointAt(t), d = RIVER.getTangentAt(t), w = riverW(t) * 1.02; const nx = -d.z, nz = d.x, y = FY - 0.045; rings.push([[-1, '#7fd6ea'], [-0.5, '#58bfe6'], [0, '#3fa9d9'], [0.5, '#58bfe6'], [1, '#7fd6ea']].map(([u, c]) => ({ x: p.x + nx * u * w, y: y + (u === 0 ? 0 : 0.004), z: p.z + nz * u * w, c }))); }
  b.geo(sweepGeo(rings, { orient: 'up' }), 'water', { ao: 0 });
  // plank bridge across the river
  { const t = 0.5, p = RIVER.getPointAt(t), d = RIVER.getTangentAt(t), yaw = Math.atan2(-d.z, d.x); b.xf(p.x, FY - 0.05, p.z, 1, yaw, () => { for (let i = 0; i < 6; i++) b.box(0.26, 0.05, 1.5, -0.65 + i * 0.26, 0.0, 0, i % 2 ? '#c9965a' : '#d7a669', { r: [0, hash(i, 2) * 0.06 - 0.03, 0], grad: 0.5, ao: 0.1 }); for (const z of [-0.74, 0.74]) { b.box(1.7, 0.05, 0.06, 0, 0.1, z, WOOD_D, { ao: 0 }); } }); }
  // the pit: raised earthen rim + wet clay inside + a puddle
  b.xf(0.1, FY, 0.3, 1, 0, () => {
    b.add(G.lathe([[1.62, -0.02], [1.5, 0.08], [1.32, 0.2], [1.14, 0.2], [0.98, 0.1], [0.9, 0.04], [0.0, 0.04]], 20), { c: '#a5693f', grad: 0.9, ao: 0.35, aoH: 0.25, facet: 0.04, seed: 3 });
    b.lump(0.96, 0, 0.05, 0, '#c9622f', { m: 'gloss', d: 2, s: [1, 0.05, 1], jit: 0.03, grad: 0.9, ao: 0 }); b.lump(0.5, 0.25, 0.085, -0.1, '#4eb4e0', { m: 'water', d: 1, s: [1.1, 0.03, 0.9], jit: 0.08, grad: 0.5, ao: 0 });
    b.shadow(0, 0, 1.9, 0.2, 1, 1, 0.0);
  });
  // shovels in the rim, a bucket, a wheelbarrow of clay
  for (const [x, z, a] of [[-0.9, 1.3, 0.3], [1.5, 0.9, -0.5]]) { b.cyl(0.02, 0.025, 0.85, x, FY + 0.1, z, WOOD, { seg: 5, r: [0.15, a, 0.3], ao: 0 }); b.box(0.15, 0.2, 0.03, x + 0.03, FY + 0.08, z - 0.02, '#9aa3ad', { r: [0.15, a, 0.3], ao: 0, grad: 0.6 }); }
  b.xf(1.5, FY, 2.0, 1, 0.5, () => { b.cyl(0.17, 0.13, 0.26, 0, 0, 0, '#a8723f', { seg: 8 }); b.cyl(0.14, 0.14, 0.02, 0, 0.255, 0, '#6b4328', { seg: 8, ao: 0 }); });
  b.xf(-1.9, FY, 1.55, 1, 0.9, () => {
    b.box(0.9, 0.2, 0.55, 0, 0.3, 0, '#b98a52', { r: [0, 0, 0.05], grad: 0.6 }); b.lump(0.3, 0, 0.47, 0, '#c96f3e', { m: 'gloss', d: 1, s: [1.4, 0.6, 1.0], jit: 0.1, ao: 0 });
    b.add(G.cyl(1, 12), { p: [0.52, 0.2, -0.13], s: [0.2, 0.06, 0.2], r: [0, 0, Math.PI / 2], c: '#5d4a38', grad: 0.4 }); b.add(G.cyl(1, 12), { p: [0.52, 0.2, 0.13], s: [0.2, 0.06, 0.2], r: [0, 0, Math.PI / 2], c: '#5d4a38', grad: 0.4 });
    for (const z of [-0.2, 0.2]) b.cyl(0.02, 0.025, 0.9, -0.3, 0.3, z, WOOD, { seg: 5, r: [0, 0, 1.2], ao: 0 });
    b.shadow(0, 0, 0.7, 0.25, 1.1, 0.7, 0.01);
  });
  for (const [x, z] of [[-2.3, 0.3], [2.4, 0.7], [-0.6, 2.7], [2.1, 2.3], [-1.6, -1.2]]) { b.rock(0.12 + hash(x, z) * 0.08, x, FY + 0.05, z, '#9b968c', { d: 0, seed: x * 3, s: [1.2, 0.8, 1] }); }
  for (const [x, z] of [[-1.6, 2.6], [1.0, -1.3]]) b.xf(x, FY, z, 1, x, () => bushInto(b, 2, 1));
}
function claySway(b) {
  const r = krng(17);
  for (let k = 0; k < 7; k++) { const t = 0.12 + 0.76 * (k / 6) + (r() - 0.5) * 0.04, p = RIVER.getPointAt(t), d = RIVER.getTangentAt(t), side = k % 2 ? 1 : -1, w = riverW(t); const cx = p.x + -d.z * (w + 0.18) * side * -1, cz = p.z + d.x * (w + 0.18) * side * -1; if (Math.hypot(cx, cz) > 3.3) continue;
    for (let i = 0; i < 7; i++) { const x = cx + (r() - 0.5) * 0.35, z = cz + (r() - 0.5) * 0.35, h = 0.55 + r() * 0.45, lean = (r() - 0.5) * 0.35; b.add(G.cyl(0, 3, true), { p: [x, FY, z], s: [0.028, h, 0.028], r: [lean, r() * TAU, 0], c: '#7aa63e', grad: 0.9, ao: 0, sw: 1.1 }); if (i % 3 === 0) b.lump(0.035, x + lean * h * 0.9, FY + h * 0.95, z, '#7a4a2a', { d: 0, s: [1, 2.6, 1], grad: 0.4, ao: 0, sw: 1.1 }); } }
  for (let i = 0; i < 10; i++) { const a = r() * TAU, rr = 1.9 + r() * 1.4, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (riverDist(x, z) < 0.4 || Math.hypot(x - 0.1, z - 0.3) < 1.7 || (Math.abs(x) < 0.7 && z > 0.4)) continue; tuftInto(b, x, FY, z, 0.9, '#7fb348', 5, 1); }
}
function clayFieldStuff(b) {
  const r = krng(23), mounds = [[0.1, 0.3, 1.3, 0.0, 0.34], [0.1, 0.3, 1.2, 1.1, 0.3], [0.1, 0.3, 1.35, 2.3, 0.3], [0.1, 0.3, 1.25, 3.4, 0.26], [0.1, 0.3, 1.4, 4.4, 0.32], [0.1, 0.3, 1.3, 5.4, 0.28]];
  for (const [cx, cz, rr, a, s] of mounds) { const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; if (Math.abs(x) < 0.6 && z > 1.5) continue; b.lump(s, x, FY + s * 0.4, z, '#c96f3e', { m: 'gloss', d: 1, s: [1.2, 0.72, 1.05], jit: 0.12, seed: a * 3, grad: 0.9, ao: 0.1 }); b.lump(s * 0.45, x - 0.05, FY + s * 0.78, z - 0.04, '#e58a50', { m: 'gloss', d: 0, s: [1.2, 0.7, 1], ao: 0 }); b.shadow(x, z, s * 1.5, 0.25, 1, 1, 0.01); }
  // stack of fired clay bricks beside the pit
  b.xf(-1.9, FY, -0.4, 1, 0.3, () => { for (let i = 0; i < 6; i++) b.box(0.4, 0.14, 0.2, ((i % 3) - 1) * 0.43, Math.floor(i / 3) * 0.14, 0, i % 2 ? '#d7773f' : '#c9622f', { m: 'gloss', grad: 0.6 }); b.shadow(0, 0, 0.9, 0.22, 1.2, 0.6, 0.01); });
  b.xf(1.7, FY, -0.9, 1, -0.4, () => { for (let i = 0; i < 3; i++) b.box(0.36, 0.13, 0.18, (i - 1) * 0.4, 0, 0, '#c9622f', { m: 'gloss', grad: 0.6 }); b.box(0.36, 0.13, 0.18, 0, 0.13, 0, '#d7773f', { m: 'gloss', grad: 0.6 }); });
}

// ---- Granite Quarry
function quarryColor(x, z) {
  let c = paint(x, z, '#aaa69c', '#988f84', 0.9); c.lerp(col('#cdbf9c'), sstep(0.6, 0.75, fbm(x * 1.2 + 4, z * 1.2)) * 0.5); c.lerp(col('#ddd2b0'), dirtPath(x, z) * 0.85); return c;
}
function ledgeInto(b, rIn, rOut, h, a0, a1, seed) {
  const r = krng(seed), step = 0.24, n = Math.max(2, Math.round((a1 - a0) / step)), rings = [], cut = new Set(); const stone = ['#b4b0a8', '#a39f98', '#bdb8ae', '#98948f'];
  for (let j = 0; j < n; j++) {
    const aa = a0 + (a1 - a0) * j / n, bb = a0 + (a1 - a0) * (j + 1) / n, jr = (r() - 0.5) * 0.12, jh = (r() - 0.5) * 0.07, c0 = col(stone[Math.floor(r() * 4)]);
    for (const [a, k] of [[aa + 0.006, 0.84], [(aa + bb) / 2, 1], [bb - 0.006, 0.84]]) {
      const ri = rIn + jr, ro = rOut, hh = h + jh, cc = (m) => c0.clone().multiplyScalar(m * k);
      const pr = [[ri, 0, cc(0.8)], [ri, hh - 0.07, cc(0.95)], [ri + 0.06, hh, cc(1.12)], [ro, hh + 0.01, cc(1.14)], [ro, 0, cc(0.8)]];
      rings.push(pr.map(([rad, y, c]) => ({ x: Math.cos(a) * rad, y: FY + y, z: Math.sin(a) * rad, c })));
    }
  }
  const g = sweepGeo(rings, { orient: 'up' });
  b.geo(g, 'matte', { ao: 0.3, aoH: 0.3 });
}
function rockFieldStatic(b) {
  fieldBase(b, 3.6, quarryColor, { rows: 6 });
  const D = Math.PI / 180;
  ledgeInto(b, 2.0, 2.65, 0.4, 205 * D, 335 * D, 1); ledgeInto(b, 2.65, 3.2, 0.78, 195 * D, 345 * D, 2); ledgeInto(b, 3.2, 3.56, 1.16, 185 * D, 355 * D, 3);
  for (const [a, rr, h, s] of [[205, 2.35, 0.4, 0.38], [335, 2.35, 0.4, 0.38], [195, 2.95, 0.78, 0.42], [345, 2.95, 0.78, 0.42], [185, 3.38, 1.16, 0.32], [355, 3.38, 1.16, 0.32]]) b.rock(s, Math.cos(a * D) * rr, FY + s * 0.4, Math.sin(a * D) * rr, '#a39f98', { d: 1, seed: a, s: [1.1, 0.9, 1.1], moss: { c: '#6b9a3a', amt: 0.7 } });
  b.shadow(0, -2.4, 2.2, 0.16, 1.5, 0.7, 0.0);
  // moss and grass on the top ledge
  for (let i = 0; i < 9; i++) { const a = (190 + 160 * hash(i, 1)) * D; b.lump(0.2, Math.cos(a) * 3.4, FY + 1.18, Math.sin(a) * 3.4, '#6fb04a', { d: 0, s: [1.5, 0.4, 1.2], grad: 0.7, ao: 0 }); }
  // cut stone blocks stacked near the path, a barrel, a pickaxe in a block
  b.xf(1.5, FY, 1.2, 1, 0.5, () => { b.box(0.7, 0.32, 0.45, 0, 0, 0, '#c4bfb4', { grad: 0.8, facet: 0.03 }); b.box(0.7, 0.32, 0.45, 0.02, 0.32, 0, '#b9b4a9', { r: [0, 0.1, 0], grad: 0.8 }); b.box(0.5, 0.28, 0.4, 0.8, 0, 0.1, '#bdb8ad', { r: [0, -0.2, 0], grad: 0.8 }); b.shadow(0.3, 0, 0.9, 0.25, 1.2, 0.7, 0.01);
    b.cyl(0.02, 0.025, 0.55, 0.0, 0.62, 0.0, WOOD, { seg: 5, r: [0, 0, 0.9], ao: 0 }); b.box(0.36, 0.05, 0.05, -0.2, 0.9, 0, '#6e747c', { r: [0, 0, 0.9], ao: 0, grad: 0.5 }); });
  b.xf(-1.4, FY, 1.4, 1, 0, () => { b.add(G.lathe([[0.2, 0], [0.24, 0.12], [0.25, 0.27], [0.24, 0.42], [0.2, 0.46]], 10), { c: '#a8723f', grad: 0.6 }); b.add(G.lathe([[0.2, 0.46], [0.22, 0.2]], 10), { c: '#a8723f' }); for (const y of [0.1, 0.36]) b.cyl(0.255, 0.255, 0.035, 0, y, 0, '#4a4036', { seg: 10, ao: 0 }); b.shadow(0, 0, 0.4, 0.25); });
  // crane mast + boom (static part)
  b.xf(CRANE[0], FY, CRANE[1], 1, CRANE_YAW, () => craneStatic(b));
  // lantern post at the path start
  b.cyl(0.04, 0.05, 1.0, -0.95, FY, 3.0, '#5a4630', { seg: 6 }); b.box(0.2, 0.22, 0.2, -0.95, FY + 1.0, 3.0, '#ffe08a', { m: 'lantern', ao: 0 }); b.cyl(0.0, 0.17, 0.12, -0.95, FY + 1.22, 3.0, '#5a4630', { seg: 6, ao: 0 });
  for (const [x, z] of [[-2.2, 0.0], [2.5, 0.3], [-0.2, 1.9], [0.3, -1.2], [2.2, -0.6], [-1.0, -1.7]]) b.rock(0.08 + hash(x, z) * 0.07, x, FY + 0.04, z, '#9b968c', { d: 0, seed: x * 3, s: [1.2, 0.8, 1] });
}
const CRANE = [1.3, -1.0], CRANE_YAW = Math.atan2(-1.5, -1.3);
function craneStatic(b) {
  const wd = '#a8723f';
  b.cyl(0.1, 0.13, 2.5, 0, 0, 0, wd, { seg: 7, grad: 0.7 }); b.lump(0.15, 0, 2.55, 0, '#6b4328', { d: 0, s: [1, 0.7, 1], ao: 0 });
  for (const z of [-0.5, 0.5]) b.cyl(0.055, 0.07, 2.2, 0, 0, z, wd, { seg: 6, r: [z > 0 ? -0.2 : 0.2, 0, 0], ao: 0.3 });
  b.cyl(0.07, 0.085, 2.2, -0.04, 2.3, 0, wd, { seg: 6, r: [0, 0, -1.43], grad: 0.7, ao: 0 });   // boom pointing +x, slightly raised
  b.cyl(0.04, 0.05, 1.5, 0.0, 1.6, 0, wd, { seg: 5, r: [0, 0, -0.78], ao: 0 });       // brace
  b.box(1.0, 0.05, 1.0, 0, 0, 0, '#8f8a82', { ao: 0 });
}
function craneHoist(b) {
  b.cyl(0.012, 0.012, 1.2, 0, -1.2, 0, '#d8c8a0', { seg: 4, ao: 0, grad: 0.2 }); b.box(0.34, 0.3, 0.34, 0, -1.5, 0, '#c4bfb4', { grad: 0.8, ao: 0, facet: 0.04 });
  b.cyl(0.02, 0.02, 0.1, 0, -0.1, 0, '#6e747c', { seg: 5, ao: 0 });
}
function rockFieldStuff(b) {
  const spots = [[1.2, 0.5, 0.9], [-1.0, -0.1, 1.1], [0.1, -1.2, 1.0], [-0.1, 1.2, 0.8], [-1.7, -1.0, 0.8]];
  spots.forEach(([x, z, s], i) => { b.xf(x, FY, z, s * 1.35, i * 1.9, () => boulderCluster(b, i + 1, 1)); b.shadow(x, z, s * 1.2, 0.3, 1.1, 1, 0.01); });
}
function rockFieldSway(b) { const r = krng(3); for (let i = 0; i < 12; i++) { const a = r() * TAU, rr = 0.5 + r() * 2.9, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (Math.abs(x) < 0.6 && z > 0.4) continue; if (z < -1.6 && Math.abs(x) < 2.6) continue; tuftInto(b, x, FY, z, 0.9, '#8dbb55', 4, 1); } }

// ---- Golden Meadow
const COLS_X = [-2.5, -2.05, -1.6, -1.15, -0.7, 0.7, 1.15, 1.6, 2.05, 2.5];
function wheatFieldStatic(b) {
  const soil = col('#c9a04e'), furrow = col('#a9803d'), straw = col('#ead08a'), edge = col('#a6c658');
  fieldBase(b, 3.6, (x, z) => {
    const r = Math.hypot(x, z); let c = paint(x, z, '#dcb855', '#d1aa4a', 0.8); const stripe = 0.5 + 0.5 * Math.cos(x * TAU / 0.45); c.lerp(furrow, stripe * 0.4 * (1 - sstep(2.8, 3.3, r)));
    c.lerp(straw, (1 - sstep(0.4, 0.75, Math.abs(x))) * 0.9 * sstep(-1.7, -0.5, z) + 0); c.lerp(edge, sstep(2.95, 3.35, r + (fbm(x * 2, z * 2) - 0.5) * 0.4)); c.lerp(col('#a6803e'), sstep(1.0, 0.7, Math.hypot(x, z + 1.45)) * 0.8); return c;
  });
  // scarecrow in the middle-back
  b.xf(0, FY, -1.45, 1, 0.2, () => {
    b.cyl(0.04, 0.055, 1.55, 0, 0, 0, WOOD_D, { seg: 6 }); b.cyl(0.03, 0.03, 1.2, -0.6, 1.0, 0, WOOD, { seg: 5, r: [0, 0, Math.PI / 2], ao: 0 });
    b.lump(0.3, 0, 0.92, 0, '#e8564a', { d: 1, s: [1, 1.15, 0.8], jit: 0.04, grad: 0.7, ao: 0 }); b.box(0.2, 0.2, 0.012, 0.06, 0.82, 0.215, '#4a90e0', { ao: 0, grad: 0 }); b.box(0.16, 0.16, 0.012, -0.1, 1.0, 0.2, '#f2d36b', { ao: 0, grad: 0 });
    for (const sx of [-1, 1]) { b.lump(0.14, sx * 0.62, 1.0, 0, '#e8564a', { d: 0, s: [1.2, 0.8, 0.8], ao: 0 }); for (let i = 0; i < 4; i++) b.add(G.cyl(0, 3, true), { p: [sx * 0.68, 1.0, (i - 1.5) * 0.04], s: [0.012, 0.18, 0.012], r: [0, 0, -sx * (1.0 + i * 0.12)], c: '#e8c34a', grad: 0.5, ao: 0 }); }
    b.lump(0.2, 0, 1.52, 0, '#e8d5a8', { d: 1, jit: 0.04, grad: 0.7, ao: 0 }); b.lump(0.03, -0.07, 1.55, 0.18, '#3a2a20', { d: 0, grad: 0, ao: 0 }); b.lump(0.03, 0.07, 1.55, 0.18, '#3a2a20', { d: 0, grad: 0, ao: 0 }); b.cyl(0.0, 0.2, 0.01, 0, 1.43, 0.2, '#3a2a20', { seg: 3, ao: 0 });
    b.cyl(0.4, 0.4, 0.04, 0, 1.64, 0, '#d9a84a', { seg: 12, ao: 0, grad: 0.5 }); b.cyl(0.14, 0.22, 0.22, 0, 1.66, 0, '#d9a84a', { seg: 10, ao: 0, grad: 0.7 }); b.cyl(0.222, 0.222, 0.05, 0, 1.68, 0, '#c04a3a', { seg: 10, ao: 0 });
    // a crow on the shoulder
    b.lump(0.07, 0.62, 1.12, 0, '#2a2a33', { d: 0, s: [1, 0.8, 1.4], grad: 0.5, ao: 0 }); b.lump(0.045, 0.62, 1.2, 0.07, '#2a2a33', { d: 0, grad: 0.3, ao: 0 }); b.cyl(0.0, 0.015, 0.05, 0.62, 1.2, 0.12, '#f2b632', { seg: 3, r: [Math.PI / 2, 0, 0], ao: 0 });
    b.shadow(0, 0, 0.7, 0.28, 1, 1, 0.01);
  });
  // hay bales and a pitchfork
  for (const [x, z, y, yaw] of [[2.55, 1.35, 0, 0.5], [2.1, 1.85, 0, 0.9], [2.4, 1.55, 0.5, 0.65]]) { b.add(G.cyl(1, 14), { p: [x, FY + 0.36 + y, z], s: [0.36, 0.55, 0.36], r: [0, yaw, Math.PI / 2], c: '#e3bd57', grad: 0.8, ao: 0.2, facet: 0.03 }); b.cyl(0.372, 0.372, 0.05, x, FY + y + 0.36 - 0.36 + 0.0, z, '#b9803a', { seg: 8, ao: 0, r: [0, yaw, Math.PI / 2], grad: 0 }); }
  b.shadow(2.35, 1.6, 1.2, 0.25, 1.2, 1, 0.01);
  b.cyl(0.015, 0.02, 0.95, -2.5, FY, 1.6, WOOD, { seg: 5, r: [0.2, 0, 0.1], ao: 0 }); b.box(0.2, 0.03, 0.03, -2.54, FY + 0.93, 1.5, '#6e747c', { r: [0.2, 0, 0.1], ao: 0 });
  for (const [x, z] of [[-2.9, -1.0], [-2.6, 2.0], [2.9, -1.1], [0.0, 3.0], [-1.0, 3.0]]) { for (let k = 0; k < 4; k++) flowerInto(b, x + (k - 1.5) * 0.12, FY, z + hash(k, x) * 0.2, k % 2 ? '#e8564a' : '#6fb4f0', 1, 0.2); }
  for (const [x, z] of [[-2.2, 2.2], [1.3, 2.9]]) b.xf(x, FY, z, 0.9, x, () => bushInto(b, 0, 1));
}
function wheatTuft(b, x, z, v, ripe) {
  const r = krng(Math.floor(x * 100 + z * 37) + v), n = 5, c0 = ripe ? '#d9ae3c' : '#b4c24a', c1 = ripe ? '#f6cc4e' : '#9bc050', ph = hash(x * 0.7, z * 0.9) * TAU;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, lean = 0.05 + r() * 0.22, h = 0.62 + r() * 0.22, bx = x + Math.cos(a) * 0.07, bz = z + Math.sin(a) * 0.07, dx = Math.sin(lean) * Math.sin(a), dy = Math.cos(lean), dz = Math.sin(lean) * Math.cos(a);
    b.add(G.cyl(0, 3, true), { p: [bx, FY, bz], s: [0.034, h, 0.034], r: [lean, a, 0], c: c0, grad: 0.7, ao: 0.25, aoH: 0.3, sw: 1.2, ph });
    b.add(G.cyl(0, 4, true), { p: [bx + dx * (h - 0.09), FY + dy * (h - 0.09), bz + dz * (h - 0.09)], s: [0.05, 0.2, 0.05], r: [lean, a, 0], c: c1, grad: 0.5, ao: 0, swc: 1.15, ph });
  }
}
function wheatFieldStuff(b) {   // lives inside the sway group
  const r = krng(31); let k = 0;
  for (const x0 of COLS_X) for (let z0 = -2.9; z0 <= 3.0; z0 += 0.44) {
    const x = x0 + (r() - 0.5) * 0.12, z = z0 + (r() - 0.5) * 0.12, rr = Math.hypot(x, z); if (rr > 3.05) continue; if (Math.hypot(x, z + 1.45) < 1.05) continue;
    wheatTuft(b, x, z, k++, r() > 0.08);
  }
}

const FIELD_PARTS = {
  tree: [treeFieldStatic, treeFieldStuff, treeFieldSway], clay: [clayFieldStatic, clayFieldStuff, claySway], rock: [rockFieldStatic, rockFieldStuff, rockFieldSway], wheat: [wheatFieldStatic, null, null],
};
/**
 * A round dressed valley field, radius ~3.6, centred at the origin, ground top at y = 0.10.
 * type 'tree' | 'clay' | 'rock' | 'wheat'. ang (optional, radians, the field's angle around the plaza) turns the model so its dirt path points to the plaza.
 * Children: `stuff` (the gatherable things: trees / clay mounds / boulders / wheat: scale it with the stock), `sway` (wind-driven grass,
 * reeds and wheat: rotate it a hair; for wheat it lives inside `stuff`), `hoist` (quarry crane block, swing it). userData.stuff is `stuff`.
 */
export function fieldModel(type, ang) {
  const [st, su, sw] = FIELD_PARTS[type] || FIELD_PARTS.tree, g = new THREE.Group(); g.name = `field_${type}`;
  const base = instantiate(baked(`field:${type}:base`, (b) => st(b), FY)); base.name = 'base'; g.add(base);
  const stuff = new THREE.Group(); stuff.name = 'stuff'; g.add(stuff); g.userData.stuff = stuff; g.userData.type = type;
  if (type === 'wheat') { const s = instantiate(baked('field:wheat:sway', (b) => wheatFieldStuff(b), FY)); s.name = 'sway'; stuff.add(s); }
  else {
    const e = instantiate(baked(`field:${type}:stuff`, (b) => su(b), FY)); e.children.slice().forEach((m) => stuff.add(m));
    const s = instantiate(baked(`field:${type}:sway`, (b) => sw(b), FY), { shadows: false }); s.name = 'sway'; g.add(s);
  }
  if (type === 'rock') { const h = instantiate(baked('field:rock:hoist', (b) => craneHoist(b))); h.name = 'hoist'; h.position.set(CRANE[0] + 2.1 * Math.cos(CRANE_YAW), FY + 2.55, CRANE[1] - 2.1 * Math.sin(CRANE_YAW)); h.rotation.y = CRANE_YAW; g.add(h); }
  if (typeof ang === 'number') g.rotation.y = Math.atan2(-Math.cos(ang), -Math.sin(ang));
  g.userData.radius = 3.6; return g;
}

// =================================================================== flags, lanterns (named animated parts)
function flagCloth(hex, trim = '#fff2cf', w = 0.85, h = 0.52) {
  return baked(`cloth:${hex}:${trim}:${w}`, (b) => {
    const s = new THREE.Shape(); s.moveTo(0, h / 2); s.lineTo(w, h / 2); s.lineTo(w * 0.76, 0); s.lineTo(w, -h / 2); s.lineTo(0, -h / 2); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }); g.translate(0, 0, -0.015); const p = g.attributes.position, c = new Float32Array(p.count * 3), main = col(hex), tr = col(trim), tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); tone(main, 0.5 + y / h * 0.6, 0.6, tmp); if (x < 0.1 || Math.abs(y) > h / 2 - 0.045) tmp.copy(tr); c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); b.geo(g, 'matte', { ao: 0, sw: 0.0 });
  });
}
/** a pennant group pivoting at its pole edge, cloth extends along +X. */
function flagGroup(name, hex, trim, w, h) { const g = instantiate(flagCloth(hex, trim, w, h)); g.name = name; g.children.forEach((m) => { m.onBeforeRender = windTick; }); return g; }
function lanternGroup(name, scale = 1) {
  const g = instantiate(baked(`lantern:${scale}`, (b) => {
    b.cyl(0.012, 0.012, 0.22, 0, -0.22, 0, '#4a4036', { seg: 4, ao: 0, grad: 0 }); b.cyl(0.0, 0.14, 0.1, 0, -0.32, 0, '#4a4036', { seg: 6, ao: 0, grad: 0.5 });
    b.box(0.2, 0.3, 0.2, 0, -0.62, 0, '#ffe08a', { m: 'lantern', ao: 0 }); b.box(0.24, 0.04, 0.24, 0, -0.64, 0, '#4a4036', { ao: 0, grad: 0 }); b.box(0.24, 0.04, 0.24, 0, -0.34, 0, '#4a4036', { ao: 0, grad: 0 });
    for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) b.box(0.025, 0.3, 0.025, x, -0.64, z, '#4a4036', { ao: 0, grad: 0 });
  })); g.name = name; g.scale.setScalar(scale); return g;
}

// =================================================================== 3. NOTICE BOARD
function boardStatic(b) {
  const stone = '#b9b2a4', wood = '#b47a45', woodD = '#8a5a3a', cork = '#d6b078';
  b.box(3.5, 0.15, 1.25, 0, 0, 0, stone, { grad: 0.7, ao: 0.4 }); b.box(3.1, 0.14, 0.95, 0, 0.15, 0, '#c9c2b4', { grad: 0.7, ao: 0.1 });
  const top = 0.29;
  for (const x of [-1.1, 1.1]) { b.box(0.34, 2.1, 0.34, x, top, 0, wood, { grad: 0.8, ao: 0.4, aoH: 0.5 }); b.box(0.42, 0.18, 0.42, x, top, 0, woodD, { grad: 0.5, ao: 0.1 }); b.box(0.42, 0.1, 0.42, x, top + 1.9, 0, woodD, { ao: 0 }); }
  // framed cork board
  b.box(2.2, 1.34, 0.14, 0, 0.95, -0.02, woodD, { grad: 0.6, ao: 0, r: 0 }); b.box(1.96, 1.1, 0.08, 0, 1.07, 0.08, cork, { grad: 0.5, ao: 0, facet: 0.02 });
  for (let i = -2; i <= 2; i++) b.plain(0.012, 1.06, 0.012, i * 0.38, 1.09, 0.125, '#b8915a', { ao: 0, grad: 0 });
  b.box(2.4, 0.09, 0.4, 0, 0.82, 0.14, woodD, { ao: 0, grad: 0.4 });
  const notes = [[-0.72, 1.72, 0.3, 0.36, 0.08, '#fffbe8'], [-0.3, 1.8, 0.26, 0.3, -0.06, '#fff0a8'], [0.14, 1.74, 0.3, 0.38, 0.05, '#e4f1ff'], [0.58, 1.8, 0.28, 0.32, -0.1, '#ffe2e2'], [-0.62, 1.3, 0.28, 0.3, -0.05, '#fff0a8'], [-0.18, 1.3, 0.34, 0.36, 0.07, '#ffffff'], [0.3, 1.32, 0.26, 0.3, -0.07, '#ffe6b0'], [0.7, 1.3, 0.3, 0.3, 0.06, '#e2f3dc']];
  notes.forEach(([x, y, w, h, rot, c], i) => {
    b.plain(w, h, 0.012, x, y - h / 2, 0.135, c, { r: [0, 0, rot], grad: 0.2, ao: 0 });
    for (let k = 0; k < 3; k++) b.plain(w * (0.7 - k * 0.12), 0.018, 0.006, x + Math.sin(rot) * 0.0, y - h * (0.38 + k * 0.17), 0.145, '#6b5a48', { r: [0, 0, rot], grad: 0, ao: 0 });
    b.lump(0.026, x - rot * 0.1, y - 0.03, 0.15, ['#e8564a', '#4a90e0', '#f2b632'][i % 3], { d: 0, grad: 0.4, ao: 0 });
  });
  b.lump(0.07, 0.6, 1.18, 0.15, '#ffd24a', { d: 1, s: [1, 1, 0.25], grad: 0.5, ao: 0 });   // a coin note
  // roof: two shingled slabs, ridge, scalloped front eave
  const roof = P.roofRed, th = 0.66, cs = Math.cos(th), sn = Math.sin(th), slabP = (sgn, t, u) => [0, 2.52 + t * cs - u * sn * 1, sgn * 0.36 + (t * sn * 1 + u * cs) * sgn * 1];
  for (const sgn of [-1, 1]) {
    b.box(3.4, 0.14, 0.98, 0, 2.52, sgn * 0.36, roof, { r: [sgn * th, 0, 0], grad: 0.95, ao: 0 });
    for (const u of [-0.3, 0.02, 0.34]) { const q = [0, 2.52 + 0.145 * cs - u * sn, sgn * (0.36 + 0.145 * sn + u * cs)]; b.plain(3.3, 0.03, 0.045, q[0], q[1], q[2], '#b8402f', { r: [sgn * th, 0, 0], ao: 0, grad: 0 }); }
  }
  for (let k = 0; k < 11; k++) { const q = [-1.5 + k * 0.3, 2.52 - 0.49 * sn + 0.02, 0.36 + 0.49 * cs + 0.0]; b.lump(0.11, q[0], q[1], q[2], k % 2 ? '#e0644f' : '#d9503d', { d: 0, s: [1.15, 0.6, 0.9], grad: 0.7, ao: 0 }); }
  b.add(G.cyl(1, 8), { p: [1.72, 2.96, 0], s: [0.1, 3.44, 0.1], r: [0, 0, Math.PI / 2], c: '#a83f2f', grad: 0.6, ao: 0 });
  // arms for the bell and the lantern, hanging crate and sack, flower pot
  for (const x of [-1.1, 1.1]) b.box(0.08, 0.08, 0.7, x, 2.18, 0.45, woodD, { ao: 0, grad: 0.4 });
  b.lump(0.24, 1.5, 0.44, 0.2, '#e6d3a3', { d: 1, s: [1, 1.1, 1], grad: 0.7, ao: 0.25 }); b.lump(0.07, 1.5, 0.7, 0.2, '#d4bf8c', { d: 0, ao: 0 }); b.shadow(1.5, 0.2, 0.55, 0.3, 1, 1, 0.15);
  b.box(0.42, 0.34, 0.4, -1.45, 0.29, 0.25, '#c58a52', { grad: 0.7, ao: 0.3 }); b.box(0.44, 0.04, 0.42, -1.45, 0.62, 0.25, '#a8683f', { ao: 0 });
  b.add(G.lathe([[0.1, 0], [0.15, 0.1], [0.17, 0.2]], 8), { p: [-1.45, 0.66, 0.25], c: '#c96f3e', grad: 0.6 }); for (let i = 0; i < 4; i++) flowerInto(b, -1.45 + (i - 1.5) * 0.06, 0.84, 0.25 + (i % 2) * 0.05, FLOWERS[i], 1.1, 0.12);
  b.lump(0.12, -1.45, 0.85, 0.25, '#58b04a', { d: 0, s: [1.2, 0.6, 1], ao: 0 });
  b.shadow(0, 0.1, 2.3, 0.28, 1.1, 0.55, 0.0);
}
const BELL_PROFILE = [[0.02, 0], [0.18, 0.02], [0.15, 0.1], [0.1, 0.2], [0.07, 0.25], [0.03, 0.27]];
/**
 * The Valley notice board (about 3.4 wide, 3.4 tall with banners). Origin on the ground, front faces +Z.
 * Named children: `flag` and `flag2` (pennants, pivot at their pole: rotate.y to wave), `lantern` (rotate.z to sway; uses the exported lanternMat),
 * `bell` (rotate.z to ring).
 */
export function boardModel() {
  const g = instantiate(baked('board', (b) => boardStatic(b))); g.name = 'board';
  for (const [sx, name, hex, trim] of [[-1, 'flag', '#37a3a0', '#fff2cf'], [1, 'flag2', '#e0709a', '#ffe7a3']]) {
    const pole = instantiate(baked('boardpole', (b) => { b.cyl(0.04, 0.055, 3.55, 0, 0, 0, '#8a5a3a', { seg: 6, grad: 0.6, ao: 0.3 }); b.lump(0.1, 0, 3.6, 0, '#ffd24a', { d: 1, grad: 0.7, ao: 0 }); b.cyl(0.1, 0.12, 0.12, 0, 0, 0, '#b9b2a4', { seg: 8, ao: 0.2 }); }));
    pole.position.set(sx * 1.72, 0.1, 0.0); g.add(pole);
    const f = flagGroup(name, hex, trim, 0.95, 0.6); f.position.set(sx * 1.72, 3.2, 0.0); if (sx < 0) f.scale.x = -1; g.add(f);
  }
  const lan = lanternGroup('lantern', 1.1); lan.position.set(-1.1, 2.2, 0.72); g.add(lan);
  const bell = instantiate(baked('bell', (b) => { b.add(G.lathe(BELL_PROFILE, 10), { m: 'gloss', c: '#ffd24a', grad: 0.8, ao: 0, p: [0, -0.3, 0] }); b.lump(0.045, 0, -0.32, 0, '#8a5a3a', { m: 'gloss', d: 0, ao: 0 }); b.cyl(0.01, 0.01, 0.05, 0, -0.05, 0, '#4a4036', { seg: 4, ao: 0 }); })); bell.name = 'bell'; bell.position.set(1.1, 2.17, 0.72); g.add(bell);
  g.userData.topY = 3.7; return g;
}

// =================================================================== 4. PLAZA
function plazaInto(b, R) {
  const k = R / 9, FYP = 0.1; b.floor = FYP;
  const mortar = col('#b99d6c');
  b.geo(polarGeo([{ r: 0, y: FYP - 0.012, c: () => mortar }, { r: R, y: FYP - 0.012, c: () => mortar }, { r: R + 0.12, y: 0, c: () => '#8a6e48' }], 48), 'matte', { ao: 0 });
  // cobbles: brick-pattern polar cells in 3 sand tones, paler lanes along the four axes where the paths come in
  const tones = ['#ecd9a0', '#e2cb8c', '#d6bc7c', '#f0e0b0'], lane = col('#f5ead0'), tris = [];
  const r0 = 2.75 * k, r1 = R - 0.4 * k, rowW = 0.8 * k; const rowsN = Math.max(3, Math.round((r1 - r0) / rowW)), rw = (r1 - r0) / rowsN;
  for (let i = 0; i < rowsN; i++) {
    const ra = r0 + i * rw, rb = ra + rw, rm = (ra + rb) / 2, n = Math.max(6, Math.round(TAU * rm / (0.95 * k))), off = (i % 2) * 0.5, g = 0.05 * k;
    for (let j = 0; j < n; j++) {
      const t0 = (j + off) / n * TAU, t1 = (j + 1 + off) / n * TAU, tm = (t0 + t1) / 2, dt = g / rm, h = hash(i * 13.1, j * 7.7);
      let base = col(tones[Math.floor(hash(i + 3.3, j * 1.7) * 3)]).clone();
      const axD = Math.abs(Math.sin(tm * 2)) * rm * 0.5; /* distance-ish to the nearest axis */ const toAxis = Math.min(...[0, 1, 2, 3].map((q) => Math.abs(Math.sin(tm - q * Math.PI / 2)) * rm));
      if (toAxis < 1.05 * k) base = col('#f6ecd2').clone().multiplyScalar(0.96 + h * 0.06); else base.multiplyScalar(0.97 + h * 0.06);
      if (i === rowsN - 1) base.lerp(col('#c9b27c'), 0.35);
      const P_ = (r, t, y, m) => [Math.cos(t) * r, y, Math.sin(t) * r, base.clone().multiplyScalar(m)];
      const A = P_(ra + g, t0 + dt, FYP + 0.004, 0.88), B = P_(ra + g, t1 - dt, FYP + 0.004, 0.88), C = P_(rb - g, t1 - dt, FYP + 0.004, 0.88), D = P_(rb - g, t0 + dt, FYP + 0.004, 0.88), Cc = P_(rm, tm, FYP + 0.026 + h * 0.008, 1.08);
      tris.push([A, B, Cc], [B, C, Cc], [C, D, Cc], [D, A, Cc]);
    }
  }
  b.geo(triGeo(tris), 'matte', { ao: 0 });
  // compass inlay under the board
  { const t = [], R1 = 2.6 * k, y = FYP + 0.012; const pt = (r, a, yy, c) => [Math.cos(a) * r, yy, Math.sin(a) * r, c];
    for (let i = 0; i < 40; i++) { const a0 = i / 40 * TAU, a1 = (i + 1) / 40 * TAU; t.push([pt(0, 0, y, '#f4e6c0'), pt(R1, a0, y, '#f4e6c0'), pt(R1, a1, y, '#f4e6c0')]);
      t.push([pt(R1 * 0.86, a0, y + 0.004, '#5aa9a5'), pt(R1, a0, y + 0.004, '#4a97a0'), pt(R1, a1, y + 0.004, '#4a97a0')], [pt(R1 * 0.86, a0, y + 0.004, '#5aa9a5'), pt(R1, a1, y + 0.004, '#4a97a0'), pt(R1 * 0.86, a1, y + 0.004, '#5aa9a5')]); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, al = a - 0.2, ar = a + 0.2, rr = i % 2 ? R1 * 0.55 : R1 * 0.8; t.push([pt(0, 0, y + 0.008, '#e8b53a'), pt(rr, a, y + 0.008, '#e8b53a'), pt(R1 * 0.2, al, y + 0.008, '#c9822f')], [pt(0, 0, y + 0.008, '#e8b53a'), pt(R1 * 0.2, ar, y + 0.008, '#c9822f'), pt(rr, a, y + 0.008, '#e8b53a')]); }
    const g = triGeo(t);
    b.geo(g, 'matte', { ao: 0 }); }
  // stone ring (curb): blocks with slits, two stone tones, a few mossy tops
  { const nB = Math.round(TAU * R / 1.3), rings = [], cut = new Set(); const sc = ['#c4bcae', '#b2aa9c', '#bdb5a6', '#aaa294'];
    for (let j = 0; j < nB; j++) { const a0 = j / nB * TAU + 0.004, a1 = (j + 1) / nB * TAU - 0.004, c0 = col(sc[j % 4]).clone().multiplyScalar(0.96 + hash(j, 4) * 0.08), mossy = hash(j, 9) > 0.8;
      for (const a of [a0, (a0 + a1) / 2, a1]) { const pr = [[R + 0.26 * k, 0.0, c0.clone().multiplyScalar(0.7)], [R + 0.26 * k, 0.2, c0.clone().multiplyScalar(0.92)], [R + 0.17 * k, 0.29, mossy ? col('#7fae4e') : c0.clone().multiplyScalar(1.18)], [R - 0.14 * k, 0.29, mossy ? col('#8fbd58') : c0.clone().multiplyScalar(1.18)], [R - 0.22 * k, 0.2, c0.clone().multiplyScalar(1.0)], [R - 0.22 * k, FYP, c0.clone().multiplyScalar(0.8)]];
        rings.push(pr.map(([rad, y, c]) => ({ x: Math.cos(a) * rad, y, z: Math.sin(a) * rad, c }))); }
      if (j < nB - 1) cut.add(rings.length - 1); }
    b.geo(sweepGeo(rings, { cut, orient: 'out' }), 'matte', { ao: 0.2, aoH: 0.3 }); }
  b.shadow(0, 0, R + 1.6, 0.0, 1, 1, 0.0);
  const place = (ang, rad, yawF, fn) => { const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad, yaw = yawF === 'in' ? Math.atan2(-Math.cos(ang), -Math.sin(ang)) : yawF || 0; b.xf(x, FYP, z, k, yaw, () => fn(x, z)); };
  const D45 = Math.PI / 4;
  // fountain at 45 deg
  place(D45, 5.6 * k, 0, () => {
    b.add(G.lathe([[1.15, 0], [1.2, 0.14], [1.17, 0.46], [1.05, 0.5], [1.0, 0.4], [0.0, 0.38]], 20), { c: '#c4bcae', grad: 0.8, ao: 0.3, aoH: 0.25, facet: 0.03 }); b.lump(0.98, 0, 0.36, 0, '#56c3ea', { m: 'water', d: 2, s: [1, 0.04, 1], jit: 0.0, grad: 0.4, ao: 0 });
    b.cyl(0.13, 0.19, 0.62, 0, 0.3, 0, '#c4bcae', { seg: 8, grad: 0.7 }); b.add(G.lathe([[0.55, 0.9], [0.58, 1.0], [0.5, 1.06], [0.35, 0.98], [0.0, 0.95]], 14), { c: '#cfc8ba', grad: 0.8, ao: 0 }); b.lump(0.42, 0, 0.97, 0, '#56c3ea', { m: 'water', d: 1, s: [1, 0.05, 1], jit: 0, ao: 0 });
    b.cyl(0.07, 0.1, 0.4, 0, 0.95, 0, '#c4bcae', { seg: 8, ao: 0 }); b.lump(0.14, 0, 1.43, 0, '#8fe0f4', { m: 'water', d: 1, grad: 0.5, ao: 0 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.lump(0.045, Math.cos(a) * 0.62, 0.72, Math.sin(a) * 0.62, '#9fe6f6', { m: 'water', d: 0, s: [1, 1.6, 1], ao: 0 }); b.lump(0.04, Math.cos(a) * 0.3, 1.25, Math.sin(a) * 0.3, '#9fe6f6', { m: 'water', d: 0, s: [1, 1.5, 1], ao: 0 }); }
    b.shadow(0, 0, 1.9, 0.28, 1, 1, 0.0);
  });
  // well at 135 deg
  place(Math.PI - D45, 5.6 * k, 0, () => {
    b.add(G.lathe([[0.78, 0], [0.8, 0.12], [0.78, 0.55], [0.66, 0.62], [0.52, 0.6], [0.5, 0.4]], 12), { c: '#c4bcae', grad: 0.8, ao: 0.3, aoH: 0.25, facet: 0.05 }); b.lump(0.5, 0, 0.36, 0, '#2f8fc0', { m: 'water', d: 1, s: [1, 0.04, 1], ao: 0, jit: 0 });
    for (const x of [-0.68, 0.68]) b.box(0.13, 1.5, 0.13, x, 0.5, 0, '#b47a45', { grad: 0.8, ao: 0.3 });
    b.add(G.cyl(1, 8), { p: [0.78, 1.55, 0], s: [0.07, 1.56, 0.07], r: [0, 0, Math.PI / 2], c: '#8a5a3a', grad: 0.6, ao: 0 }); b.box(0.04, 0.04, 0.3, 0.52, 1.5, 0.0, '#8a5a3a', { ao: 0 }); b.box(0.04, 0.04, 0.3, -0.52, 1.5, 0.0, '#8a5a3a', { ao: 0 });
    for (const sgn of [-1, 1]) { b.box(1.8, 0.1, 0.62, 0, 1.78, sgn * 0.22, '#4f86c6', { r: [sgn * 0.62, 0, 0], grad: 0.9, ao: 0 }); b.plain(1.7, 0.03, 0.04, 0, 1.98, sgn * 0.3, '#3c6ca6', { r: [sgn * 0.62, 0, 0], ao: 0, grad: 0 }); }
    b.add(G.cyl(1, 8), { p: [0.92, 2.04, 0], s: [0.06, 1.84, 0.06], r: [0, 0, Math.PI / 2], c: '#3c6ca6', grad: 0.5, ao: 0 });
    b.cyl(0.012, 0.012, 0.5, 0, 0.95, 0, '#d8c8a0', { seg: 4, ao: 0 }); b.cyl(0.13, 0.1, 0.18, 0, 0.78, 0, '#a8723f', { seg: 8, ao: 0 });
    b.shadow(0, 0, 1.4, 0.3, 1, 1, 0.0);
  });
  // flower beds at 225 and 315 (a small tree, and a big bloom mound)
  const bed = (ang, tree) => place(ang, 5.6 * k, 0, () => {
    b.add(G.lathe([[1.0, 0], [1.05, 0.1], [1.02, 0.28], [0.92, 0.3], [0.88, 0.18], [0.0, 0.2]], 18), { c: '#c4bcae', grad: 0.8, ao: 0.3, aoH: 0.25, facet: 0.03 }); b.lump(0.9, 0, 0.19, 0, '#6b4a30', { d: 1, s: [1, 0.12, 1], jit: 0, ao: 0 });
    const r = krng(ang * 100 | 0); for (let i = 0; i < 22; i++) { const a = r() * TAU, rr = (tree ? 0.35 : 0.1) + r() * 0.62; flowerInto(b, Math.cos(a) * rr, 0.2, Math.sin(a) * rr, FLOWERS[(i + (tree ? 0 : 2)) % 6], 1.15, 0.13 + r() * 0.1); }
    for (let i = 0; i < 6; i++) { const a = i * 1.05, rr = 0.55 + r() * 0.2; b.lump(0.2, Math.cos(a) * rr, 0.26, Math.sin(a) * rr, '#58b04a', { d: 0, s: [1.2, 0.6, 1.2], ao: 0, grad: 0.7, sw: 0.4 }); }
    if (tree) b.xf(0, 0.2, 0, 0.62, 1, () => treeInto(b, 'apple', 1, 0)); else for (let i = 0; i < 8; i++) { const a = i * 0.8; b.lump(0.2, Math.cos(a) * 0.3, 0.36 + (i % 2) * 0.1, Math.sin(a) * 0.3, FLOWERS[(i * 2) % 6], { d: 1, grad: 0.7, ao: 0, s: [1, 0.8, 1] }); }
    b.shadow(0, 0, 1.6, 0.25, 1, 1, 0.0);
  });
  bed(Math.PI + D45, true); bed(Math.PI * 1.75, false);
  // benches facing the middle at 22.5 + 90m
  for (let m = 0; m < 4; m++) place(Math.PI / 8 + m * Math.PI / 2, 6.5 * k, 'in', () => {
    b.box(1.35, 0.1, 0.44, 0, 0.34, 0, '#c58a52', { grad: 0.8, ao: 0.2 }); b.box(1.35, 0.3, 0.07, 0, 0.44, -0.2, '#b47a45', { grad: 0.8, ao: 0, r: [-0.12, 0, 0] });
    for (const x of [-0.52, 0.52]) { b.box(0.12, 0.34, 0.4, x, 0, 0, '#bdb5a6', { grad: 0.8, ao: 0.4 }); b.box(0.09, 0.5, 0.09, x, 0.34, -0.2, '#8a5a3a', { ao: 0, grad: 0.4 }); }
    b.shadow(0, -0.05, 1.0, 0.3, 1.2, 0.6, 0.0);
  });
  // planters at 67.5 + 90m
  for (let m = 0; m < 4; m++) place(Math.PI * 3 / 8 + m * Math.PI / 2, 6.9 * k, 0, () => {
    b.add(G.lathe([[0.42, 0], [0.5, 0.12], [0.52, 0.34], [0.46, 0.42], [0.4, 0.38]], 12), { c: '#c96f3e', grad: 0.8, ao: 0.3, aoH: 0.2 }); b.lump(0.4, 0, 0.38, 0, '#6b4a30', { d: 0, s: [1, 0.2, 1], ao: 0, jit: 0 });
    for (let i = 0; i < 3; i++) b.lump(0.2, Math.cos(i * 2.1) * 0.17, 0.5, Math.sin(i * 2.1) * 0.17, '#58b04a', { d: 1, s: [1, 0.85, 1], ao: 0, grad: 0.9, sw: 0.3 });
    for (let i = 0; i < 8; i++) { const a = i * 0.85 + m, rr = 0.1 + (i % 3) * 0.1; b.lump(0.07, Math.cos(a) * rr, 0.68 + (i % 2) * 0.05, Math.sin(a) * rr, FLOWERS[(i + m) % 6], { d: 0, ao: 0, grad: 0.6 }); }
    b.shadow(0, 0, 0.8, 0.28, 1, 1, 0.0);
  });
  // lamp posts flanking each path entrance
  for (let q = 0; q < 4; q++) for (const s of [-1, 1]) { const a = q * Math.PI / 2 + s * 0.14; place(a, R - 0.95 * k, 0, () => {
    b.add(G.lathe([[0.17, 0], [0.12, 0.12], [0.07, 0.3], [0.06, 1.8]], 8), { c: '#4a4036', grad: 0.6, ao: 0.2 }); b.lump(0.09, 0, 1.85, 0, '#4a4036', { d: 0, ao: 0 });
    b.box(0.26, 0.34, 0.26, 0, 1.78, 0, '#ffe08a', { m: 'lantern', ao: 0 }); b.cyl(0.0, 0.26, 0.2, 0, 2.1, 0, '#4a4036', { seg: 6, ao: 0, grad: 0.5 }); b.lump(0.05, 0, 2.33, 0, '#ffd24a', { d: 0, ao: 0 });
    b.cyl(0.14, 0.14, 0.04, 0, 1.74, 0, '#4a4036', { seg: 6, ao: 0 }); b.shadow(0, 0, 0.5, 0.25, 1, 1, 0.0);
  }); }
  // a few tufts and flowers in the cracks of the ring
  const r = krng(7); for (let i = 0; i < 22; i++) { const a = r() * TAU; const rr = R + (r() < 0.5 ? 0.45 : -0.0) * k; if (rr < R + 0.3) continue; tuftInto(b, Math.cos(a) * (R + 0.35 * k), 0.0, Math.sin(a) * (R + 0.35 * k), 0.8, P.grassDark, 3, 0.8); }
}
/**
 * The central valley square. Round, top at y = 0.10 (island top at 0). The middle 3 units hold the board (a compass inlay shows around it).
 * Cobbles, stone ring, fountain (45deg), well (135deg), two flower beds, 4 benches, 4 planters, 8 lamp posts at the 4 path entrances.
 * Lamp lanterns use the exported lanternMat.
 */
export function plazaModel(radius = 9) { const g = instantiate(baked(`plaza:${radius}`, (b) => plazaInto(b, radius)), { shadows: false }); g.name = 'plaza'; g.userData.radius = radius; return g; }

// =================================================================== 5. VILLAGE PLOT
const PLOT_N = 16, PH = 8.15;   // tiles per side; centre line of the border
function plotInto(b, hex) {
  const own = col(hex), ownL = own.clone().lerp(col('#ffffff'), 0.28), ownD = own.clone().multiplyScalar(0.72), TOP = 0.14; b.floor = TOP;
  // 16x16 grass tiles: gentle checker + painterly patches, darker near the border (cheap AO)
  { const tris = [], gA = col(P.grass), gB = col('#a6dc6c'), gD = col('#86c455');
    for (let i = 0; i < PLOT_N; i++) for (let j = 0; j < PLOT_N; j++) {
      const base = ((i + j) % 2 ? gA : gB).clone().lerp(gD, sstep(0.45, 0.8, fbm(i * 0.35 + 3, j * 0.35 + 8)) * 0.55).multiplyScalar(0.975 + hash(i, j) * 0.05);
      const corner = (x, z) => { const d = Math.min(8 - Math.abs(x), 8 - Math.abs(z)); return base.clone().multiplyScalar(0.84 + 0.16 * sstep(0, 1.6, d)); };
      const x0 = i - 8, z0 = j - 8, A = [x0, TOP, z0, corner(x0, z0)], B = [x0 + 1, TOP, z0, corner(x0 + 1, z0)], C = [x0 + 1, TOP, z0 + 1, corner(x0 + 1, z0 + 1)], D = [x0, TOP, z0 + 1, corner(x0, z0 + 1)];
      tris.push([A, D, C], [A, C, B]);
    }
    b.geo(triGeo(tris), 'matte', { ao: 0 }); }
  // border curb: stone blocks with slits; owner colour on top and outer lip, soil below
  { const rings = [], cut = new Set(), rad = 0.9, S = PH, seg = 5;
    // blocks (each a list of points) walk the rounded square; the gate on +Z, |x| < 1.3, is left open
    const side = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.45)); const out = []; for (let i = 0; i < n; i++) out.push([[x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n], [x0 + (x1 - x0) * (i + 1) / n, z0 + (z1 - z0) * (i + 1) / n]]); return out; };
    const R2 = S - rad, order = [];
    order.push(...side(1.3, S, R2, S), arcDec(R2, R2, Math.PI / 2, 0, rad, seg), ...side(S, R2, S, -R2), arcDec(R2, -R2, 0, -Math.PI / 2, rad, seg), ...side(R2, -S, -R2, -S), arcDec(-R2, -R2, -Math.PI / 2, -Math.PI, rad, seg), ...side(-S, -R2, -S, R2), arcDec(-R2, R2, Math.PI, Math.PI / 2, rad, seg), ...side(-R2, S, -1.3, S));
    const stones = ['#c4bcae', '#b8b0a2', '#cbc3b5'];
    order.forEach((blk, bi) => {
      const sc = col(stones[bi % 3]).clone().multiplyScalar(0.96 + hash(bi, 2) * 0.08);
      const pts2 = blk.length === 2 ? [blk[0], [(blk[0][0] + blk[1][0]) / 2, (blk[0][1] + blk[1][1]) / 2], blk[1]] : blk;
      pts2.forEach((p, pi) => {
        const nx0 = p[0], nz0 = p[1]; // outward normal = direction from the nearest point of the inner rounded square
        const cx = clamp(nx0, -R2, R2), cz = clamp(nz0, -R2, R2); let ux = nx0 - cx, uz = nz0 - cz; const ul = Math.hypot(ux, uz) || 1; if (ul < 1e-6) { ux = 0; uz = 1; } else { ux /= ul; uz /= ul; }
        const pr = [[0.2, -0.15, '#7a5638'], [0.2, 0.07, '#7a5638'], [0.2, 0.1, ownD], [0.2, 0.22, own], [0.13, 0.31, ownL], [-0.12, 0.31, ownL], [-0.2, 0.17, sc]];
        const edgeK = pi === 0 || pi === pts2.length - 1 ? 0.86 : 1;
        rings.push(pr.map(([u, y, c]) => { const cc = col(c).clone().multiplyScalar(edgeK); return { x: nx0 + ux * u, y, z: nz0 + uz * u, c: cc }; }));
      });
      cut.add(rings.length - 1);
    });
    b.geo(sweepGeo(rings, { cut, orient: 'out' }), 'matte', { ao: 0.0 });
  }
  // hedge bushes outside the border, owner-colour blossoms on some; none at the gate
  { const r = krng(hex.length * 7 + (own.getHex() % 997)); let n = 0;
    for (let s = 0; s < 4; s++) for (let i = 0; i < 6; i++) { const t = -6.9 + i * 2.78 + (r() - 0.5) * 0.4, off = PH + 0.52 + (r() - 0.5) * 0.12; let x, z; if (s === 0) { x = t; z = off; if (Math.abs(x) < 2.2) continue; } else if (s === 1) { x = off; z = t; } else if (s === 2) { x = t; z = -off; } else { x = -off; z = t; }
      const sc = 0.85 + r() * 0.5; b.lump(0.3 * sc, x, 0.14 + 0.2 * sc, z, ['#4fa845', '#5cb44a', '#46a04c'][n++ % 3], { d: 0, s: [1.3, 0.9, 1.0], jit: 0.12, seed: n, grad: 0.95, ao: 0.2, aoH: 0.3, r: [0, r() * 3, 0] });
      if (n % 2 === 0) b.lump(0.07, x + 0.12, 0.14 + 0.43 * sc, z + 0.05, own, { d: 0, grad: 0.4, ao: 0 }); } }
  // gate arch on the +Z side, owner colour
  { const gx = 1.45, gz = PH + 0.02;
    for (const sx of [-1, 1]) { b.box(0.56, 0.55, 0.56, sx * gx, 0.0, gz, '#c4bcae', { grad: 0.8, ao: 0.3, aoH: 0.3 }); b.box(0.34, 1.5, 0.34, sx * gx, 0.5, gz, own, { grad: 0.8, ao: 0.2 }); b.lump(0.2, sx * gx, 2.02, gz, ownL, { d: 1, grad: 0.7, ao: 0, s: [1, 0.9, 1] }); }
    const rings = []; for (let i = 0; i <= 10; i++) { const t = Math.PI - i / 10 * Math.PI, x = Math.cos(t) * gx, y = 1.78 + Math.sin(t) * 0.7, nl = Math.hypot(Math.cos(t) / gx, Math.sin(t) / 0.7), nx = Math.cos(t) / gx / nl, ny = Math.sin(t) / 0.7 / nl; rings.push([[-0.11, -0.11], [0.11, -0.11], [0.11, 0.11], [-0.11, 0.11], [-0.11, -0.11]].map(([a, zo]) => ({ x: x + nx * a, y: y + ny * a, z: gz + zo, c: a > 0 ? ownL : own }))); }
    b.geo(sweepGeo(rings, { orient: 'out' }), 'matte', { ao: 0 });
    b.lump(0.13, 0, 2.72, gz, '#ffd24a', { d: 1, grad: 0.7, ao: 0 });
    for (let i = 0; i < 4; i++) b.rock(0.19, 0.0 + (i % 2) * 0.1 - 0.05, 0.14 + 0.02, 6.9 - i * 0.85, '#d8d0be', { d: 0, s: [1.2, 0.2, 1], seed: i, grad: 0.5, ao: 0, facet: 0.03 }); }
  // corner posts: stone foot, wooden pole, gold cap (pennants are separate named children)
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = sx * (PH + 0.12), z = sz * (PH + 0.12); b.cyl(0.26, 0.32, 0.45, x, 0, z, '#c4bcae', { seg: 8, grad: 0.8, ao: 0.3, aoH: 0.3 }); b.cyl(0.06, 0.09, 2.1, x, 0.4, z, '#a8723f', { seg: 6, grad: 0.7, ao: 0 }); b.lump(0.1, x, 2.5, z, '#ffd24a', { d: 1, grad: 0.7, ao: 0 }); }
}
function arcDec(cx, cz, a0, a1, rad, seg) { const o = []; for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; o.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]); } return o; }
/**
 * A village's plot base, replacing the plain slab. Footprint exactly 16 x 16 tiles (tile (0,0) at -8,-8), top at y = 0.14, border out to +-8.33.
 * colorHex = owner colour (number or '#rrggbb'). toCentre (optional) = direction from the village toward the valley centre as {x,z} or an angle
 * (atan2(dz,dx)); the gate arch turns to the nearest quarter turn to face it (default +Z).
 * Children: `flag` (+ `flag2`, `flag3`, `flag4`): the pennants on the four corner posts, pivot at the pole, rotate.y to wave.
 */
export function plotModel(colorHex = '#e8564a', toCentre) {
  const hex = col(colorHex).getHexString(), g = instantiate(baked(`plot:${hex}`, (b) => plotInto(b, '#' + hex)), { shadows: false }); g.name = 'plot';
  const own = '#' + hex;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i) => { const f = flagGroup(i ? `flag${i + 1}` : 'flag', own, '#fff2cf', 1.15, 0.66); f.position.set(sx * (PH + 0.12), 2.45, sz * (PH + 0.12)); g.add(f); });
  const lan = lanternGroup('gatelantern', 0.8); lan.position.set(0, 2.38, PH + 0.02); g.add(lan);
  if (toCentre != null) { const d = typeof toCentre === 'number' ? { x: Math.cos(toCentre), z: Math.sin(toCentre) } : toCentre; g.rotation.y = Math.round(Math.atan2(d.x, d.z) / (Math.PI / 2)) * (Math.PI / 2); }
  g.userData.top = TOP_Y; return g;
}
const TOP_Y = 0.14;

// =================================================================== 6. SCATTER (instanced) + ISLAND
/**
 * Decorate a group with instanced life: forest rim of mixed trees, bushes, flower patches, mushrooms, grass tufts, stones.
 * rng = () => [0,1) (use rng(seed) from artkit). opts: R, shore(theta) outline radius, heightAt(x,z), isFree(x,z,pad), counts {trees,bushes,tufts,flowers,mushrooms,stones}.
 * USES InstancedMesh: one per species/variant (trees: 8, bushes 3, tufts 4, flowers 5, mushrooms 2, stones 3 = about 25 draw calls). Returns { name: triangles }.
 */
export function scatter(group, rng, o = {}) {
  const R = o.R || 66, shore = o.shore || (() => R), hy = o.heightAt || (() => 0), free = o.isFree || isFree, n = { trees: 100, bushes: 58, tufts: 420, flowers: 34, mushrooms: 14, stones: 40, ...(o.counts || {}) };
  const stats = {}, add = (name, entries) => { let t = 0; for (const [e, items, opt] of entries) { const im = instancedFrom(e, items, opt); if (!im) continue; im.name = name; group.add(im); t += (e.tris || 0) * items.length; } stats[name] = Math.round(t); };
  const grid = new Map(), taken = (x, z, rr) => { const cx = Math.floor(x / rr), cz = Math.floor(z / rr); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get((cx + i) + ',' + (cz + j)); if (l) for (const p of l) if (Math.hypot(p[0] - x, p[1] - z) < rr) return true; } const k = cx + ',' + cz; (grid.get(k) || grid.set(k, []).get(k)).push([x, z]); return false; };
  const pick = (cond, tries = 4000) => { for (let i = 0; i < tries; i++) { const th = rng() * TAU, s = shore(th), c = cond(th, s); if (c) return c; } return null; };
  // forest rim (instanced low-poly trees, 8 meshes)
  { const buckets = {}; let made = 0, guard = 0;
    while (made < n.trees && guard++ < 8000) { const th = rng() * TAU, s = shore(th), d = 1.8 + 12.5 * Math.pow(rng(), 1.5), r = s - d, x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (!free(x, z, 1.0) || vn(th * 5.3 + 2, d * 0.13) < 0.3 || taken(x, z, 1.9)) continue; const q = rng(), sp = q < 0.36 ? 'oak' : q < 0.62 ? 'pine' : q < 0.76 ? 'birch' : 'apple', v = rng() < 0.5 ? 0 : 1; (buckets[sp + v] ||= { sp, v, items: [] }).items.push({ x, y: hy(x, z) - 0.05, z, s: 1.15 + rng() * 0.7, yaw: rng() * TAU }); made++; }
    add('forest', Object.values(buckets).map((bk) => [bakedTree(bk.sp, bk.v, 1), bk.items, { seed: bk.v + 3, tint: 0.09 }])); }
  const spots = (count, minD, dMax, pad = 0.6) => { const out = []; let g = 0; while (out.length < count && g++ < count * 60) { const th = rng() * TAU, s = shore(th), d = minD + rng() * dMax, r = s - d, x = Math.cos(th) * r, z = Math.sin(th) * r; if (!free(x, z, pad) || vn(x * 0.11 + 7, z * 0.11) < 0.38) continue; out.push({ x, y: hy(x, z), z, yaw: rng() * TAU, s: 0.8 + rng() * 0.5 }); } return out; };
  const split = (arr, k) => Array.from({ length: k }, (_, i) => arr.filter((_, j) => j % k === i));
  { const sp = spots(n.bushes, 2, 48, 0.8), by = split(sp, 3); add('bushes', by.map((it, v) => [baked(`bush:${v}:1`, (b) => bushInto(b, v, 1)), it, { seed: v }])); }
  { const sp = spots(n.tufts, 0.5, 60, 0.3).map((p) => ({ ...p, s: 0.8 + rng() * 0.9 })), by = split(sp, 4); add('tufts', by.map((it, v) => [baked(`tuft:${v}`, (b) => tuftClump(b, v)), it, { cast: false, seed: v, tint: 0.1 }])); }
  { const sp = spots(n.flowers, 2, 56, 0.9), by = split(sp, 5); add('flowers', by.map((it, v) => [baked(`flowers:${v}`, (b) => flowerPatchInto(b, v)), it, { cast: false, seed: v, tint: 0.03 }])); }
  { const sp = spots(n.mushrooms, 2, 15, 0.8), by = split(sp, 2); add('mushrooms', by.map((it, v) => [baked(`mush:${v}`, (b) => { mushroomInto(b, 0, 0, 1, 0, v ? '#e8564a' : '#e8923a'); mushroomInto(b, 0.14, 0.08, 0.65, 0, v ? '#e8564a' : '#e8923a'); mushroomInto(b, -0.1, 0.12, 0.5, 0, '#f6d27a'); }), it, { seed: v }])); }
  { const sp = spots(n.stones, 1, 56, 0.8), by = split(sp, 3); add('stones', by.map((it, v) => [baked(`stone:${v}`, (b) => stoneInto(b, v)), it, { seed: v }])); }
  stats.total = Object.values(stats).reduce((a, b) => a + b, 0); return stats;
}

// ---- island
const shoreOf = (R, th) => R * (1 + 0.035 * Math.sin(3 * th + 0.7) + 0.025 * Math.sin(5 * th + 2.1) + 0.02 * Math.sin(9 * th + 0.3) + 0.01 * Math.sin(17 * th + 1.3));
const ridgeAmp = (th) => 0.5 * (0.6 + 0.8 * vn(th * 6 + 3, 1.7));
const heightOf = (R) => (x, z) => { const r = Math.hypot(x, z), th = Math.atan2(z, x), d = shoreOf(R, th) - r; if (d > 12) return 0; return ridgeAmp(th) * sstep(12, 6, d) - 0.85 * sstep(2.5, 0, d); };
const STRATA = [ // y, radius factor, colour, noise group
  [0.0, 1.0, '#8fcb55', 0], [-0.28, 0.997, '#6aa042', 0], [-0.31, 0.996, '#6b4426', 1], [-1.2, 0.99, '#7d5230', 1], [-1.23, 0.99, '#c28a52', 2], [-2.3, 0.984, '#b97c48', 2],
  [-2.33, 0.978, '#d6ad72', 3], [-3.3, 0.972, '#c99f66', 3], [-3.33, 0.965, '#9a948c', 4], [-4.5, 0.955, '#8a847c', 4], [-4.53, 0.945, '#cfa874', 5], [-5.6, 0.93, '#bf9760', 5],
  [-5.63, 0.915, '#7d7770', 6], [-7.5, 0.86, '#6b6560', 6], [-9.5, 0.7, '#5b5651', 7],
];
const SEA_ROWS = [[-4, '#8fe3dc'], [0, '#8fe3dc'], [1.6, '#74d8e4'], [4, '#58c6ec'], [8, '#44b3e4'], [15, '#38a4dc'], [28, '#2f98d4'], [50, '#2a8ccb'], [90, '#2680c0'], [160, '#2478b8'], [300, '#2474b2'], [420, '#2474b2']];
function addFx(m, fragment, extraUniforms) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWindT = WIND; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vF;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvF = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vF; uniform float uWindT;').replace('#include <color_fragment>', '#include <color_fragment>\n' + fragment);
  };
  m.customProgramCacheKey = () => 'hvfx' + fragment.length; return m;
}
let _foamMat, _fallMat, _seaMat;
const foamMat = () => _foamMat ||= addFx(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true }), 'diffuseColor.a *= 0.72 + 0.28 * sin( vF.x * 5.0 - uWindT * 1.5 + vF.y * 9.0 );');
const fallMat = () => _fallMat ||= addFx(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88, side: THREE.DoubleSide, fog: true }), 'float sf = sin( vF.x * 38.0 ) * sin( vF.y * 1.7 - uWindT * 4.5 ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), 0.4 * smoothstep( 0.15, 1.0, sf ) );');
const seaMaterial = () => _seaMat ||= (() => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.1 });
  m.onBeforeCompile = (sh) => { sh.uniforms.uWindT = WIND; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSea;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSea = (modelMatrix * vec4( position, 1.0 )).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSea; uniform float uWindT;').replace('#include <color_fragment>', '#include <color_fragment>\nfloat w1 = sin( vSea.x * 0.33 + uWindT * 0.7 ) * sin( vSea.y * 0.29 - uWindT * 0.5 ); float w2 = sin( vSea.x * 0.9 - uWindT * 1.1 + vSea.y * 0.4 ) * sin( vSea.y * 0.8 + uWindT * 0.9 );\ndiffuseColor.rgb += vec3( 0.05, 0.07, 0.06 ) * smoothstep( 0.55, 1.0, w1 ) + vec3( 0.04, 0.05, 0.05 ) * smoothstep( 0.7, 1.0, w2 );'); };
  m.customProgramCacheKey = () => 'hvsea'; return m; })();
const rgba = (c, a) => { const k = col(c); return [k.r, k.g, k.b, a]; };
/** indexed strip geometry with RGBA vertex colours: rings[j] = [ [x,y,z,[r,g,b,a],u,v], ... ] along j, profile k */
function stripAlpha(rings) {
  const pos = [], colr = [], uv = [], idx = [], K = rings[0].length;
  for (const ring of rings) for (const q of ring) { pos.push(q[0], q[1], q[2]); colr.push(...q[3]); uv.push(q[4] || 0, q[5] || 0); }
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < K - 1; k++) { const a = j * K + k, b = a + 1, c = a + K, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const n = new Float32Array(pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return g;
}
/**
 * The floating island (replaces the game's cylinder terrain + sea). Radius R (default 66; the outline wobbles about 6 percent), top surface at y = 0,
 * flat inside (villages, plaza, fields sit on it), a rim ridge and rounded grass lip at the edge, strata cliffs down to the sea at y = seaY.
 * Contains: grass top, cliffs with strata bands and boulders, ocean (`ocean`), animated foam ring + stack foam (`foam`), 3 waterfalls with streams (`falls`),
 * and the scatter (instanced forest rim, bushes, flowers, mushrooms, tufts, stones). Remove the game's own sea / cliff / top / plaza / rim trees.
 * opts: { seaY (-4.2), seed (7), scatter (true), counts }.   userData: heightAt(x,z), shore(theta), seaY, scatter (tri stats).
 */
export function islandModel(R = 66, opts = {}) {
  const seaY = opts.seaY ?? -4.2, g = new THREE.Group(); g.name = 'island'; const SEG = 128, hy = heightOf(R), shore = (th) => shoreOf(R, th), r = krng(opts.seed || 7);
  // ---- grass top
  const fr = [0, 0.09, 0.18, 0.27, 0.36, 0.45, 0.55, 0.64, 0.73, 0.8, 0.85, 0.89, 0.92, 0.945, 0.965, 0.98, 0.99, 1.0];
  const topColor = (x, z) => { const rr = Math.hypot(x, z), th = Math.atan2(z, x), d = shore(th) - rr; let c = paint(x, z, '#9ad464', '#a9e072', 0.09, 0.4, 0.6); c.lerp(col('#86c455'), sstep(0.5, 0.75, fbm(x * 0.07 + 20, z * 0.07 + 5)) * 0.6);
    c.lerp(col('#6fb250'), sstep(18, 5, d) * (0.55 + 0.45 * vn(x * 0.35, z * 0.35))); c.lerp(col('#b9e47c'), sstep(2.2, 0.2, d) * 0.5); if (d < 0.5) c.lerp(col('#6aa042'), sstep(0.5, 0, d)); return c; };
  const rows = fr.map((f, i) => ({ r: f * R, y: (x, z) => hy(x, z), c: topColor }));
  g.add(Object.assign(new THREE.Mesh(polarGeo(rows, SEG, { wob: (th, i) => (i === 0 ? 1 : shore(th) / R), nUp: 0.25 }), envMat), { receiveShadow: true, name: 'top' }));
  // ---- cliff with strata bands (flat shaded, chunky) + boulders
  const ringsR = [], contact = new Float32Array(SEG);
  for (let j = 0; j <= SEG; j++) {
    const th = (j % SEG) / SEG * TAU, s = shore(th), ring = [];
    STRATA.forEach(([y, f, c, grp], k) => { const nz = (vn(th * 7 + grp * 5.3, grp * 1.7) - 0.5) * 2 * (0.5 + grp * 0.22) + (vn(th * 23 + grp, 3.1) - 0.5) * 0.7, rad = s * f + nz * (k === 0 ? 0.2 : 1), yy = k === 0 ? ridgeAmp(th) - 0.85 : y; const cc = col(c).clone().multiplyScalar(0.9 + 0.2 * hash(j, grp)); ring.push({ x: Math.cos(th) * rad, y: yy, z: Math.sin(th) * rad, c: cc, rad }); });
    if (j < SEG) { for (let k = 0; k < ring.length - 1; k++) if (ring[k].y >= seaY && ring[k + 1].y < seaY) { const t = (ring[k].y - seaY) / (ring[k].y - ring[k + 1].y); contact[j] = ring[k].rad + (ring[k + 1].rad - ring[k].rad) * t; } }
    ringsR.push(ring);
  }
  { let cg = sweepGeo(ringsR, { orient: 'out' }).toNonIndexed(); cg.computeVertexNormals(); cg.userData.y0 = -9.5; cg.userData.y1 = 0; const b = new Builder(0); b.geo(cg, 'matte', { ao: 0 });
    // rocks along the lip and boulders at the waterline
    for (let i = 0; i < 44; i++) { const th = r() * TAU, d = r() * 1.6 - 0.2, rr = shore(th) - d, x = Math.cos(th) * rr, z = Math.sin(th) * rr, sc = 0.5 + r() * 1.0; b.rock(sc, x, hy(x, z) + sc * 0.2, z, ['#a8a49a', '#b4b0a8', '#98948c'][i % 3], { d: 1, seed: i, s: [1.2, 0.8, 1], r: [0, r() * 6, 0], moss: { c: '#6fb04a', amt: 1 }, ao: 0 }); }
    for (let i = 0; i < 26; i++) { const j = Math.floor(r() * SEG), th = j / SEG * TAU, rr = contact[j] + 0.4 + r() * 1.3, sc = 0.7 + r() * 1.3, x = Math.cos(th) * rr, z = Math.sin(th) * rr; b.rock(sc, x, seaY + sc * 0.1, z, ['#8a847c', '#9a948c', '#75706a'][i % 3], { d: 1, seed: i + 50, s: [1.1, 0.9, 1], r: [0, r() * 6, 0], ao: 0 }); }
    const cl = instantiate(b.bake(), { shadows: false }); cl.name = 'cliff'; cl.children.forEach((m) => { m.receiveShadow = true; }); g.add(cl); }
  // ---- ocean following the cliff contact
  { const rowsO = []; for (let j = 0; j <= SEG; j++) { const jj = j % SEG, th = jj / SEG * TAU; rowsO.push(SEA_ROWS.map(([d, c]) => { const rad = contact[jj] + d; return { x: Math.cos(th) * rad, y: seaY, z: Math.sin(th) * rad, c }; })); }
    const og = sweepGeo(rowsO, { orient: 'up' }); const mesh = new THREE.Mesh(og, seaMaterial()); mesh.name = 'ocean'; mesh.receiveShadow = true; mesh.onBeforeRender = windTick; g.add(mesh); }
  // ---- foam: ring at the waterline + rings around the sea stacks + waterfall splashes
  const foam = new THREE.Group(); foam.name = 'foam';
  { const rowsF = []; const D = [[-0.6, 0], [0.0, 0.95], [0.5, 0.7], [1.1, 0.4], [1.8, 0.16], [2.6, 0]]; for (let j = 0; j <= SEG; j++) { const jj = j % SEG, th = jj / SEG * TAU, wv = 1 + 0.55 * (vn(th * 14 + 1, 2) - 0.5) * 2; rowsF.push(D.map(([d, a]) => { const dd = d > 0 ? d * wv : d, rad = contact[jj] + dd; return [Math.cos(th) * rad, seaY + 0.04, Math.sin(th) * rad, rgba('#ffffff', a), dd, th]; })); }
    const m = new THREE.Mesh(stripAlpha(rowsF), foamMat()); m.renderOrder = 2; m.onBeforeRender = windTick; foam.add(m); }
  // sea stacks with their own foam
  { const b = new Builder(0), rowsAll = []; for (let i = 0; i < 9; i++) { const j = Math.floor((i + r() * 0.8) / 9 * SEG), th = j / SEG * TAU, rr = contact[j % SEG] + 3.5 + r() * 7, x = Math.cos(th) * rr, z = Math.sin(th) * rr, sc = 1.1 + r() * 1.6;
      b.rock(sc, x, seaY + sc * 0.45, z, '#8f8a82', { d: 1, seed: i + 90, s: [1.1, 1.2, 1], moss: { c: '#6fb04a', amt: 0.7 }, ao: 0 }); b.rock(sc * 0.5, x + sc * 0.8, seaY + sc * 0.15, z + sc * 0.3, '#7d7870', { d: 0, seed: i + 7, ao: 0 });
      const ring = []; for (let q = 0; q <= 24; q++) { const a = q / 24 * TAU; ring.push([[x, seaY + 0.05, z, rgba('#fff', 0), 0, a], [x + Math.cos(a) * sc * 1.0, seaY + 0.05, z + Math.sin(a) * sc * 1.0, rgba('#fff', 0.9), 0.5, a], [x + Math.cos(a) * sc * 1.8, seaY + 0.05, z + Math.sin(a) * sc * 1.8, rgba('#fff', 0), 1.4, a]]); } rowsAll.push(ring); }
    const sk = instantiate(b.bake(), { shadows: false }); sk.name = 'stacks'; g.add(sk);
    for (const ringSet of rowsAll) { const m = new THREE.Mesh(stripAlpha(ringSet), foamMat()); m.renderOrder = 2; m.onBeforeRender = windTick; foam.add(m); } }
  g.add(foam);
  // ---- waterfalls: stream on the top surface, falling sheet down the cliff, splash foam
  const falls = new THREE.Group(); falls.name = 'falls';
  for (const th of [1.05, 3.0, 4.75]) {
    const s = shore(th), cth = Math.cos(th), sth = Math.sin(th), tx = -sth, tz = cth;
    const stream = []; for (let i = 0; i <= 14; i++) { const d = 17 - i * 1.15, rr = s - d, off = 0.9 * Math.sin(d * 0.45 + th * 3), w = 0.75 * (0.7 + 0.3 * Math.min(1, i / 6)) * (i === 0 ? 0.3 : 1); const cx = cth * rr + tx * off, cz = sth * rr + tz * off, y = hy(cx, cz) + 0.06; stream.push([[-1, '#7fd6ea'], [0, '#3fa9d9'], [1, '#7fd6ea']].map(([u, c]) => ({ x: cx + tx * u * w, y: y - (u === 0 ? 0.015 : 0), z: cz + tz * u * w, c }))); }
    const sb = new Builder(0); sb.geo(sweepGeo(stream, { orient: 'up' }), 'water', { ao: 0 }); const sm = instantiate(sb.bake(), { shadows: false }); falls.add(sm);
    const j0 = Math.round(th / TAU * SEG) % SEG, lipY = ridgeAmp(th) - 0.85, rows2 = []; const off0 = 0.9 * Math.sin(0.0 * 0.45 + th * 3);
    for (let i = 0; i <= 9; i++) { const y = lipY + 0.05 + (seaY + 0.1 - lipY) * i / 9; const ring = ringsR[j0]; let rad = ring[0].rad; for (let k = 0; k < ring.length - 1; k++) if (y <= ring[k].y && y >= ring[k + 1].y) { const t = (ring[k].y - y) / (ring[k].y - ring[k + 1].y); rad = ring[k].rad + (ring[k + 1].rad - ring[k].rad) * t; } rad += 0.28;
      const w = 1.05 + i * 0.05; rows2.push([-1, -0.5, 0, 0.5, 1].map((u, q) => [cth * rad + tx * (off0 + u * w), y, sth * rad + tz * (off0 + u * w), rgba(q % 2 ? '#ffffff' : '#bfeaf5', 1), (u + 1) / 2, i * 0.6])); }
    const fm = new THREE.Mesh(stripAlpha(rows2.map((rw) => rw)), fallMat()); fm.onBeforeRender = windTick; falls.add(fm);
    const sx = cth * (contact[j0] + 0.6) + tx * off0, sz = sth * (contact[j0] + 0.6) + tz * off0, ringS = []; for (let q = 0; q <= 20; q++) { const a = q / 20 * TAU; ringS.push([[sx, seaY + 0.06, sz, rgba('#fff', 0.9), 0.3, a], [sx + Math.cos(a) * 1.8, seaY + 0.06, sz + Math.sin(a) * 1.8, rgba('#fff', 0.5), 1.0, a], [sx + Math.cos(a) * 3.4, seaY + 0.06, sz + Math.sin(a) * 3.4, rgba('#fff', 0), 2.0, a]]); }
    const sp = new THREE.Mesh(stripAlpha(ringS), foamMat()); sp.renderOrder = 2; sp.onBeforeRender = windTick; foam.add(sp);
  }
  g.add(falls);
  g.userData = { heightAt: hy, shore, seaY, R };
  if (opts.scatter !== false) g.userData.scatter = scatter(g, krng(opts.seed || 7), { R, shore, heightAt: hy, counts: opts.counts });
  return g;
}
