// buildings.js : authored procedural buildings for the Ludus Maximus hub (no model files, no textures on disk).
//   createBuilding(id, level, opts) -> { group, update(t,dt), setGlow(0..1), footprint:{w,d,h}, fx, tris, calls, dispose }
//   buildParts(id, level, opts)     -> cached merged geometry per material + fx emitters (the hub merges these for all plots)
//   BUILDING_IDS, FOOT {w:8, d:5.4}, buildingUniforms (shared uTime/uWind/uHL/uGl), getLib() shared materials
// Local frame: origin at the pad center on the ground, +z = front (faces the gate / default camera), +y up.
// Every building is <= 6 draw calls (masonry, roof, wood, metal, cloth, glow) and <= 6k triangles at level 5.
// Materials are SHARED. Highlight (hover/select) and window glow are per-plot uniform arrays indexed by the
// `aPlot` vertex attribute (absent on standalone buildings -> index 0), so the hub can merge all plots by material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial, prepGeo, createFlames } from './envfx.js';
import { makeStoneTexture, makeRoofTexture, makeClothTexture, tfbm } from './envtex.js';

export const FOOT = { w: 8.0, d: 5.4 };
export const MAXPLOT = 20;
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const colOf = (hex) => { if (Array.isArray(hex)) return hex; const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const rngOf = (seed) => { let s = (seed | 0) || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

// palette (sRGB hex, converted to linear by three)
const C = {
  plaster: 0xe3c490, plaster2: 0xf0e2c2, trav: 0xe8dcc0, marble: [1.1, 1.08, 1.0], clay: 0xc97a48, wood: 0xb08050, wood2: 0x86603c, woodLt: 0xc99a62, dark: 0x2a2118,
  iron: 0x565a63, bronze: 0xc08a3e, gold: 0xf5c545, purple: 0x6a2470, red: 0xb5352a, green: 0x5b7a3a, leaf: 0x56782f, leaf2: 0x7a9040, sand: 0xdcb47e,
  cream: 0xf0e4c6, soil: 0x6b4a2e, water: 0x4aa3a6, coal: 0x2a1a14, stone: 0xb9ab92, rope: 0xc9b07a, teal: 0x2f8f86,
};
const WIN = [2.9, 1.5, 0.55];       // lit window HDR (blooms when glow=1)

// ---------------------------------------------------------------------------------------------
// shared materials + uniforms
// ---------------------------------------------------------------------------------------------
export const buildingUniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uHL: { value: new Float32Array(MAXPLOT) }, uGl: { value: new Float32Array(MAXPLOT) }, uOff: { value: Array.from({ length: MAXPLOT }, () => new THREE.Vector3()) } };   // MOVE: uOff[plot+1] lifts / shifts a whole plot (rearrange mode and cinematic), index 0 stays zero

function woodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const r = rngOf(7);
  x.fillStyle = '#c9b79b'; x.fillRect(0, 0, 256, 256);
  const planks = 6, pw = 256 / planks;
  for (let p = 0; p < planks; p++) {
    const tone = 0.82 + r() * 0.18; x.fillStyle = `rgb(${Math.round(214 * tone)},${Math.round(188 * tone)},${Math.round(150 * tone)})`; x.fillRect(p * pw + 1, 0, pw - 2, 256);
    for (let i = 0; i < 26; i++) { const gx = p * pw + 2 + r() * (pw - 4); x.strokeStyle = `rgba(80,52,28,${0.10 + r() * 0.2})`; x.lineWidth = 0.7 + r() * 1.2; x.beginPath(); x.moveTo(gx, 0); x.bezierCurveTo(gx + (r() - 0.5) * 8, 80, gx + (r() - 0.5) * 8, 170, gx + (r() - 0.5) * 4, 256); x.stroke(); }
    x.fillStyle = 'rgba(60,38,20,0.55)'; x.fillRect(p * pw, 0, 1.5, 256);
    const kn = r() * 220 + 18; x.fillStyle = 'rgba(70,44,24,0.45)'; x.beginPath(); x.ellipse(p * pw + pw / 2, kn, 3, 5, 0, 0, TAU); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
let LIB = null;
/** Extra fragment hook (rim highlight) on top of patchMaterial. */
function litPatch(mat, key, { vBody = '', vPars = '' } = {}) {
  patchMaterial(mat, {
    key, uniforms: { uHL: buildingUniforms.uHL, uTime: buildingUniforms.uTime, uWind: buildingUniforms.uWind, uOff: buildingUniforms.uOff },
    vPars: `attribute float aPlot; varying float vHL; uniform float uHL[${MAXPLOT}]; uniform vec3 uOff[${MAXPLOT}]; uniform float uTime, uWind;\n${vPars}`,
    vBody: `vHL = uHL[int(aPlot + 0.5)];\n${vBody}\ntransformed += uOff[int(aPlot + 0.5)];`,
    fPars: 'varying float vHL;',
  });
  const inner = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    inner(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
      `{ float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.0); outgoingLight += vec3(1.0, 0.70, 0.28) * vHL * (0.07 + 0.55 * rim); }\n#include <opaque_fragment>`);
  };
  return mat;
}
export function makeGlowMaterial(glArr = buildingUniforms.uGl) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  patchMaterial(m, {
    key: 'bld_glow', uniforms: { uGl: glArr === buildingUniforms.uGl ? buildingUniforms.uGl : { value: glArr }, uTime: buildingUniforms.uTime, uOff: buildingUniforms.uOff },
    vPars: `attribute float aPlot; varying float vGl; varying vec2 vEm; uniform float uGl[${MAXPLOT}]; uniform vec3 uOff[${MAXPLOT}];`,
    vBody: 'vGl = uGl[int(aPlot + 0.5)]; vEm = uv; transformed += uOff[int(aPlot + 0.5)];',
    fPars: 'varying float vGl; varying vec2 vEm; uniform float uTime;',
    fBody: 'float lit = max(vEm.y, 0.12 + vGl * 3.4); diffuseColor.rgb *= mix(1.0, lit * (0.93 + 0.07 * sin(uTime * 8.0 + vEm.x * 40.0)), step(0.5, vEm.x));',
  });
  return m;
}

/** Roof tiles: muted terracotta with per-patch variation (ochre, brown, dull replacement tiles), large-scale weathering, rain streaks and moss on shaded low slopes (HUB-VISUAL). */
function roofWeather(mat) {
  const inner = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    inner(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vRW; varying vec3 vRN;
      float rfh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rfn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rfh(i), rfh(i + vec2(1.0, 0.0)), f.x), mix(rfh(i + vec2(0.0, 1.0)), rfh(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 wp = vRW; float up = clamp(vRN.y, 0.0, 1.0);
        vec2 cell = floor(vec2(wp.x * 1.15 + wp.y * 0.8, wp.z * 1.15 + wp.y * 0.8));
        float h1 = rfh(cell), h2 = rfh(cell + 17.3);
        vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.3, 0.59, 0.11));
        c = mix(vec3(l), c, 0.62) * vec3(1.04, 0.97, 0.9);
        c *= 0.82 + 0.34 * h1;
        c = mix(c, c * vec3(1.2, 1.05, 0.76), step(0.8, h2) * 0.85);
        c = mix(c, vec3(l) * vec3(0.98, 0.92, 0.86) * 0.95, step(0.92, h1) * 0.75);
        float w = rfn(wp.xz * 0.21 + wp.y * 0.1); c *= 0.86 + 0.26 * w;
        float mo = smoothstep(0.56, 0.78, rfn(wp.xz * 0.5 + vec2(wp.y * 0.35, 3.7))) * (1.0 - up * 0.3);
        c = mix(c, vec3(0.2, 0.25, 0.085) * (0.8 + 0.4 * h1), mo * 0.62);
        float st = rfn(vec2((wp.x + wp.z) * 2.4, wp.y * 0.12)); c *= 0.93 + 0.12 * st;
        diffuseColor.rgb = c; }`);
  };
}
export function getLib() {
  if (LIB) return LIB;
  const stone = makeStoneTexture(512, { bx: 4, by: 6, base: 0xe3d3ad, tint: 0xb89a66, seed: 31 });
  const roofT = makeRoofTexture(256, 5), cloth = makeClothTexture(256);
  cloth.map.repeat.set(3, 3); cloth.map.needsUpdate = true;
  const wood = woodTexture();
  LIB = {
    masonry: litPatch(new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: 1.6, vertexColors: true, roughness: 0.93 }), 'bld_masonry'),
    roof: litPatch(new THREE.MeshStandardMaterial({ map: roofT.map, bumpMap: roofT.bump, bumpScale: 2.2, vertexColors: true, roughness: 0.82 }), 'bld_roof'),
    wood: litPatch(new THREE.MeshStandardMaterial({ map: wood, vertexColors: true, roughness: 0.88 }), 'bld_wood'),
    metal: litPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.22, emissive: 0x2a1c0a, emissiveIntensity: 0.8 }), 'bld_metal'),
    cloth: litPatch(new THREE.MeshStandardMaterial({ map: cloth.map, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 'bld_cloth', {
      vBody: 'float swF = uv.x; transformed += normal * (sin(uTime * 2.3 + transformed.x * 0.9 + transformed.y * 0.7 + swF * 4.0) * 0.5 + 0.5) * 0.12 * swF * uWind;',
    }),
    glow: makeGlowMaterial(),
  };
  roofWeather(LIB.roof);
  LIB.roof.color.setRGB(0.86, 0.66, 0.5);
  LIB.roof.emissive.setRGB(0.06, 0.032, 0.026); LIB.masonry.emissive.setRGB(0.05, 0.04, 0.06); LIB.wood.emissive.setRGB(0.05, 0.035, 0.04); LIB.cloth.emissive.setRGB(0.03, 0.02, 0.04); LIB.masonry.color.setRGB(1.12, 1.08, 1.02); LIB.wood.color.setRGB(1.08, 1.05, 1.0);
  return LIB;
}
const MATS = ['masonry', 'roof', 'wood', 'metal', 'cloth', 'glow'];

// ---------------------------------------------------------------------------------------------
// geometry kit
// ---------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const TEX = { masonry: 3, roof: 2.4, wood: 1.6, metal: 1, cloth: 1, glow: 1 };

function boxG(w, h, d, texM, centered) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / texM, uv.getY(i) * dims[f][1] / texM); }
  if (!centered) g.translate(0, h / 2, 0);
  return g;
}

export class Kit {
  constructor(seed, accent) {
    this.P = {}; for (const m of MATS) this.P[m] = [];
    this.fx = { flames: [], smoke: [], sparks: [] };
    this.rnd = rngOf(seed); this.H = 6; this.accent = accent; this.M = new THREE.Matrix4();
  }
  at(x, y, z, ry, fn) { const keep = this.M.clone(); _m.makeRotationY(ry || 0).setPosition(x, y, z); this.M.multiply(_m); fn(); this.M.copy(keep); }
  _pt(x, y, z) { return _v.set(x, y, z).applyMatrix4(this.M).toArray(); }
  /** finalize a local geometry: transform by TRS opts, then kit transform, paint vertex colors, store. */
  _add(mat, g, hex, o = {}) {
    g = prepGeo(g);
    if (o.x || o.y || o.z || o.rx || o.ry || o.rz) {
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q, _s); g.applyMatrix4(_m);
    }
    g.applyMatrix4(this.M);
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, uv = g.attributes.uv;
    const base = colOf(hex), H = this.H, ao = o.ao === undefined ? 1 : o.ao, jit = 1 + (this.rnd() - 0.5) * 0.07;
    const em = o.em;
    let y0 = 1e9, y1 = -1e9; if (o.sway) for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let i = 0; i < p.count; i++) {
      let k = 1;
      if (mat !== 'glow') {
        const y = p.getY(i), ny = n.getY(i);
        k = lerp(0.62, 1.0, clamp(y / H)); k = 1 - ao * (1 - k);
        if (y < 0.5) k *= 0.8 + 0.2 * Math.max(0, y) / 0.5;
        if (ny > 0.6) k *= 1.06; else if (ny < -0.5) k *= 0.55;
        k *= jit;
      }
      c.setXYZ(i, base[0] * k, base[1] * k, base[2] * k);
      if (mat === 'glow') uv.setXY(i, em ? em[0] : 0, em ? em[1] : 0);
      else if (o.sway) uv.setXY(i, Math.pow((p.getY(i) - y0) / Math.max(0.01, y1 - y0), 1.5) * o.sway, uv.getY(i));
    }
    this.P[mat].push(g);
  }
  box(mat, w, h, d, x, y, z, hex, o = {}) { const g = boxG(w, h, d, TEX[mat], o.c); this._add(mat, g, hex, Object.assign({ x, y, z }, o)); }
  cyl(mat, rT, rB, h, x, y, z, hex, o = {}) {
    const g = new THREE.CylinderGeometry(rT, rB, h, o.seg || 8, 1, !!o.open); g.translate(0, o.c ? 0 : h / 2, 0);
    const uv = g.attributes.uv, su = (TAU * (rT + rB) * 0.5) / TEX[mat], sv = h / TEX[mat]; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    this._add(mat, g, hex, Object.assign({ x, y, z }, o));
  }
  cone(mat, r, h, x, y, z, hex, o = {}) {
    const g = new THREE.ConeGeometry(r, h, o.seg || 8, 1, false); g.translate(0, h / 2, 0);
    const uv = g.attributes.uv, su = (TAU * r * 0.6) / TEX[mat], sv = Math.hypot(r, h) / TEX[mat]; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    this._add(mat, g, hex, Object.assign({ x, y, z }, o));
  }
  sphere(mat, r, x, y, z, hex, o = {}) {
    const g = o.half ? new THREE.SphereGeometry(r, o.seg || 10, o.hseg || 5, 0, TAU, 0, Math.PI / 2) : new THREE.SphereGeometry(r, o.seg || 8, o.hseg || 6);
    if (o.sy) g.scale(o.sx || 1, o.sy, o.sz || 1);
    const uv = g.attributes.uv, su = (TAU * r) / TEX[mat], sv = (Math.PI * r) / TEX[mat]; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    this._add(mat, g, hex, Object.assign({ x, y, z }, o));
  }
  lathe(mat, pts, x, y, z, hex, o = {}) {
    const g = new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), o.seg || 8);
    const rm = pts.reduce((a, p) => a + p[0], 0) / pts.length, len = pts[pts.length - 1][1] - pts[0][1];
    const uv = g.attributes.uv, su = (TAU * rm) / TEX[mat], sv = len / TEX[mat]; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    this._add(mat, g, hex, Object.assign({ x, y, z }, o));
  }
  tor(mat, R, r, x, y, z, hex, o = {}) { const g = new THREE.TorusGeometry(R, r, o.tseg || 5, o.seg || 14); this._add(mat, g, hex, Object.assign({ x, y, z }, o)); }
  /** flat polygon (3 or 4 points, local coords). o.out = outward normal hint; uv along first edge. */
  poly(mat, pts, hex, o = {}) {
    const P = pts.map((p) => new THREE.Vector3(...p));
    const tris = pts.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
    const n = new THREE.Vector3().crossVectors(P[1].clone().sub(P[0]), P[2].clone().sub(P[0])).normalize();
    const flip = o.out && n.dot(new THREE.Vector3(...o.out)) < 0; if (flip) n.negate();
    const ux = P[1].clone().sub(P[0]).normalize(), vx = new THREE.Vector3().crossVectors(n, ux);
    const pos = [], nor = [], uvs = [];
    for (const t of tris) { const idx = flip ? [t[0], t[2], t[1]] : t; for (const i of idx) { pos.push(P[i].x, P[i].y, P[i].z); nor.push(n.x, n.y, n.z); const d = P[i].clone().sub(P[0]); uvs.push(d.dot(ux) / TEX[mat], d.dot(vx) / TEX[mat]); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    this._add(mat, g, hex, o);
  }
  /** cloth sheet grid. p0 + pu*(i/nu) + pv*(j/nv); the v=0 edge is fixed (sway grows with uv.x = j/nv). sag(u,v) -> extra offset along pn. */
  sheet(p0, pu, pv, nu, nv, hex, o = {}) {
    const pos = [], uvs = [], idx = [], pn = new THREE.Vector3().crossVectors(new THREE.Vector3(...pu), new THREE.Vector3(...pv)).normalize();
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, s = o.sag ? o.sag(u, v) : 0;
      pos.push(p0[0] + pu[0] * u + pv[0] * v + pn.x * s, p0[1] + pu[1] * u + pv[1] * v + pn.y * s, p0[2] + pu[2] * u + pv[2] * v + pn.z * s);
      uvs.push(v, u);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    this._add('cloth', g, hex, { ao: o.ao === undefined ? 0.5 : o.ao });
  }
  flame(x, y, z, s = 0.7) { const p = this._pt(x, y, z); this.fx.flames.push({ x: p[0], y: p[1], z: p[2], s }); }
  smoke(x, y, z, o = {}) { const p = this._pt(x, y, z); this.fx.smoke.push(Object.assign({ x: p[0], y: p[1], z: p[2], r: 0.3, rate: 1, tint: 0 }, o)); }
  spark(x, y, z, o = {}) { const p = this._pt(x, y, z); this.fx.sparks.push(Object.assign({ x: p[0], y: p[1], z: p[2], rate: 1 }, o)); }

  // ---------------------------------------------------------------- composite pieces
  /** gabled tile roof, ridge along local x, centered at (cx,cz), walls top at y. */
  gable(cx, cz, w, d, y, rise, o = {}) {
    const over = o.over ?? 0.45, ro = o.overEnd ?? 0.3, t = 0.17, a = Math.atan2(rise, d / 2), half = d / 2 + over, ye = y - over * Math.tan(a), yr = y + rise;
    const L = half / Math.cos(a), tint = o.tint || 0xffffff;
    for (const s of [1, -1]) {
      const my = (ye + yr) / 2, mz = s * half / 2;
      this.box('roof', w + 2 * ro, t, L, cx, my - Math.cos(a) * t / 2, cz + mz - s * Math.sin(a) * t / 2, tint, { c: true, rx: s * a });
      // fascia + rafter tails
      this.box('wood', w + 2 * ro, 0.13, 0.06, cx, ye - 0.1, cz + s * (half - 0.02), C.wood2, { c: true });
      const nT = Math.floor((w + 2 * ro) / 0.62);
      for (let i = 0; i < nT; i++) this.box('wood', 0.1, 0.1, 0.34, cx - (w + 2 * ro) / 2 + 0.31 + i * 0.62, ye - 0.16, cz + s * (half - 0.2), C.wood2, { c: true, rx: -s * a * 0.9 });
    }
    this.cyl('roof', 0.15, 0.15, w + 2 * ro + 0.1, cx, yr + 0.02, cz, o.ridge || tint, { rz: Math.PI / 2, c: true, seg: 6 });
    if (o.gold) { this.cyl('metal', 0.1, 0.1, w + 2 * ro + 0.14, cx, yr + 0.13, cz, C.gold, { rz: Math.PI / 2, c: true, seg: 6 }); for (const s of [-1, 1]) this.cone('metal', 0.11, 0.42, cx + s * (w / 2 + ro + 0.02), yr - 0.1, cz, C.gold, { seg: 5 }); }
    if (!o.noGable) for (const s of [1, -1]) this.poly('masonry', [[cx + s * w / 2, y, cz - d / 2], [cx + s * w / 2, y, cz + d / 2], [cx + s * w / 2, yr - 0.1, cz]], o.gableHex || C.plaster, { out: [s, 0, 0] });
    return yr;
  }
  /** single-slope roof falling toward +z (lean-to). */
  shed(cx, cz, w, d, yHigh, yLow, o = {}) {
    const t = 0.16, a = Math.atan2(yHigh - yLow, d), L = Math.hypot(d, yHigh - yLow) + (o.over ?? 0.35);
    this.box('roof', w + 0.5, t, L, cx, (yHigh + yLow) / 2 - t / 2, cz, o.tint || 0xffffff, { c: true, rx: a });
    this.box('wood', w + 0.5, 0.14, 0.07, cx, yLow - 0.12, cz + d / 2 + 0.12, C.wood2, { c: true });
  }
  /** rectangular hip roof (pyramid when w==d). */
  hip(cx, cz, w, d, y, rise, o = {}) {
    const ov = o.over ?? 0.42, x0 = cx - w / 2 - ov, x1 = cx + w / 2 + ov, zb = cz - d / 2 - ov, zf = cz + d / 2 + ov, yr = y + rise, ye = y - ov * (rise / (Math.min(w, d) / 2));
    const r = Math.min(w, d) / 2, rx0 = cx - (w / 2 - r), rx1 = cx + (w / 2 - r), tint = o.tint || 0xffffff;
    this.poly('roof', [[x0, ye, zf], [x1, ye, zf], [rx1, yr, cz], [rx0, yr, cz]], tint, { out: [0, 1, 1] });
    this.poly('roof', [[x1, ye, zb], [x0, ye, zb], [rx0, yr, cz], [rx1, yr, cz]], tint, { out: [0, 1, -1] });
    this.poly('roof', [[x1, ye, zf], [x1, ye, zb], [rx1, yr, cz]], tint, { out: [1, 1, 0] });
    this.poly('roof', [[x0, ye, zb], [x0, ye, zf], [rx0, yr, cz]], tint, { out: [-1, 1, 0] });
    // eave board ring
    this.box('wood', x1 - x0, 0.14, 0.07, cx, ye - 0.12, zf, C.wood2, { c: true }); this.box('wood', x1 - x0, 0.14, 0.07, cx, ye - 0.12, zb, C.wood2, { c: true });
    this.box('wood', 0.07, 0.14, zf - zb, x0, ye - 0.12, cz, C.wood2, { c: true }); this.box('wood', 0.07, 0.14, zf - zb, x1, ye - 0.12, cz, C.wood2, { c: true });
    if (o.finial !== false) this.cone('metal', 0.1, o.gold ? 0.5 : 0.34, cx, yr - 0.02, cz, o.gold ? C.gold : C.iron, { seg: 5 });
    return yr;
  }
  col(x, z, h, r = 0.26, y0 = 0, hex = C.marble) {
    this.box('masonry', r * 2.7, 0.2, r * 2.7, x, y0, z, hex);
    this.lathe('masonry', [[r * 1.0, 0.2], [r * 1.0, 0.3], [r * 0.9, 0.3 + h * 0.5], [r * 0.78, h - 0.28]], x, y0, z, hex, { seg: 8 });
    this.box('masonry', r * 2.5, 0.12, r * 2.5, x, y0 + h - 0.3, z, hex); this.box('masonry', r * 3.0, 0.16, r * 3.0, x, y0 + h - 0.18, z, hex);
  }
  win(x, y, z, w = 0.62, h = 0.85, o = {}) {
    this.box('masonry', w + 0.26, h + 0.26, 0.12, x, y - 0.13, z, o.frame || C.trav);
    this.box('glow', w, h, 0.05, x, y, z + 0.07, WIN, { em: [1, 0], ao: 0 });
    this.box('wood', w + 0.02, 0.06, 0.1, x, y + h * 0.5, z + 0.1, C.wood2); // mullion
    if (o.shut !== false) for (const s of [-1, 1]) this.box('wood', w * 0.5, h, 0.05, x + s * (w / 2 + w * 0.22), y, z + 0.14, C.wood, { ry: s * 1.1 });
  }
  /** arched door (round top), facing +z at wall z. */
  door(x, z, w = 1.1, h = 1.9, o = {}) {
    const r = w / 2;
    this.cyl('masonry', r + 0.15, r + 0.15, 0.2, x, h - r, z + 0.02, o.frame || C.trav, { rx: Math.PI / 2, c: true, seg: 12 });
    this.box('masonry', 0.18, h - r, 0.2, x - r - 0.08, 0, z + 0.02, o.frame || C.trav); this.box('masonry', 0.18, h - r, 0.2, x + r + 0.08, 0, z + 0.02, o.frame || C.trav);
    this.cyl('wood', r, r, 0.12, x, h - r, z + 0.1, C.wood2, { rx: Math.PI / 2, c: true, seg: 12 });
    this.box('wood', w, h - r, 0.12, x, 0, z + 0.1, C.wood2);
    this.box('metal', 0.05, h - r, 0.03, x, 0, z + 0.17, C.iron);
    for (let i = 0; i < 3; i++) { this.box('metal', w * 0.9, 0.06, 0.03, x, 0.45 + i * 0.5, z + 0.17, C.iron); }
    if (o.glowSlit) this.box('glow', w * 0.7, 0.16, 0.05, x, h + 0.35, z + 0.07, WIN, { em: [1, 0], ao: 0 });
  }
  torch(x, y, z, o = {}) {
    this.box('metal', 0.07, 0.07, 0.34, x, y, z - 0.1 * (o.dz || 0), C.iron, { c: true, ry: o.ry || 0 });
    this.cyl('metal', 0.14, 0.05, 0.26, x, y + 0.05, z, C.bronze, { seg: 7 });
    this.cyl('wood', 0.025, 0.03, 0.55, x, y - 0.3, z, C.wood2, { seg: 5 });
    this.flame(x, y + 0.28, z, o.s || 0.75);
  }
  brazier(x, z, y = 0, s = 1, o = {}) {
    this.cyl('metal', 0.04 * s, 0.05 * s, 0.9 * s, x, y, z, C.iron, { seg: 6 });
    for (let i = 0; i < 3; i++) this.box('metal', 0.04 * s, 0.5 * s, 0.04 * s, x + Math.cos(i * 2.09) * 0.2 * s, y, z + Math.sin(i * 2.09) * 0.2 * s, C.iron, { rz: Math.cos(i * 2.09) * 0.4, rx: -Math.sin(i * 2.09) * 0.4 });
    this.cyl('metal', 0.34 * s, 0.14 * s, 0.26 * s, x, y + 0.9 * s, z, o.gold ? C.gold : C.bronze, { seg: 9 });
    this.cyl('glow', 0.27 * s, 0.27 * s, 0.03, x, y + 1.14 * s, z, [2.8, 0.9, 0.2], { seg: 8, em: [1, 1.0], ao: 0 });
    this.flame(x, y + 1.14 * s, z, 0.85 * s);
  }
  barrel(x, z, y = 0, s = 1, hex = C.wood) {
    this.lathe('wood', [[0.2 * s, 0], [0.26 * s, 0.14 * s], [0.28 * s, 0.34 * s], [0.26 * s, 0.56 * s], [0.2 * s, 0.7 * s]], x, y, z, hex, { seg: 8 });
    for (const yy of [0.12, 0.58]) this.cyl('metal', 0.255 * s, 0.255 * s, 0.04, x, y + yy * s, z, C.iron, { seg: 8 });
    this.cyl('wood', 0.2 * s, 0.2 * s, 0.02, x, y + 0.7 * s, z, C.woodLt, { seg: 8 });
  }
  amphora(x, z, y = 0, s = 1, hex = C.clay, o = {}) {
    this.lathe('masonry', [[0.0, 0], [0.09 * s, 0], [0.2 * s, 0.22 * s], [0.24 * s, 0.45 * s], [0.18 * s, 0.7 * s], [0.08 * s, 0.86 * s], [0.08 * s, 0.98 * s], [0.13 * s, 1.03 * s]], x, y, z, hex, Object.assign({ seg: 8 }, o));
  }
  crate(x, z, y = 0, s = 1, hex = C.wood, ry = 0) { this.box('wood', 0.55 * s, 0.4 * s, 0.45 * s, x, y, z, hex, { ry }); this.box('wood', 0.58 * s, 0.05 * s, 0.1 * s, x, y + 0.2 * s, z, C.wood2, { ry }); }
  sack(x, z, y = 0, hex = C.rope) { this.sphere('cloth', 0.22, x, y + 0.14, z, hex, { sy: 0.8, seg: 6, hseg: 5 }); }
  bench(x, z, w = 1.4, ry = 0, y = 0) { this.at(x, y, z, ry, () => { this.box('wood', w, 0.07, 0.34, 0, 0.4, 0, C.woodLt); for (const s of [-1, 1]) this.box('wood', 0.07, 0.4, 0.3, s * (w / 2 - 0.12), 0, 0, C.wood2); }); }
  table(x, z, w = 1.5, d = 0.8, ry = 0, y = 0) { this.at(x, y, z, ry, () => { this.box('wood', w, 0.07, d, 0, 0.78, 0, C.woodLt); for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box('wood', 0.07, 0.78, 0.07, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), C.wood2); }); }
  /** vertical banner on a pole: pole at (x,z) from y0 to y1, cloth hangs from a crossbar. */
  banner(x, z, y0, y1, hex, o = {}) {
    const w = o.w ?? 0.8, h = o.h ?? 1.7, ry = o.ry || 0;
    this.at(x, 0, z, ry, () => {
      if (!o.noPole) this.cyl('wood', 0.045, 0.06, y1 - y0, 0, y0, 0, C.wood2, { seg: 6 });
      if (!o.noPole) this.cone('metal', 0.07, 0.2, 0, y1 - 0.02, 0, o.gold ? C.gold : C.bronze, { seg: 5 });
      const yb = o.bar ?? (y1 - 0.25);
      this.box('wood', w + 0.2, 0.05, 0.05, 0, yb, 0, C.wood2, { c: true });
      this.sheet([-w / 2, yb - 0.02, 0.04], [w, 0, 0], [0, -h, 0], 3, 4, hex, { sag: (u, v) => Math.sin(u * Math.PI) * 0.05 * v });
      this.box('metal', w * 0.95, 0.05, 0.03, 0, yb - h, 0.05, o.trim || C.gold, { c: true });
      this.cyl('metal', 0.2, 0.2, 0.025, 0, yb - h * 0.45, 0.07, o.emblem || C.gold, { rx: Math.PI / 2, c: true, seg: 8 });
    });
  }
  /** striped awning sloping down toward +z from wall at z0 (top edge height yTop) to z0+len (yBot). */
  awning(cx, z0, w, len, yTop, yBot, cA, cB, o = {}) {
    const n = Math.max(2, Math.round(w / 0.5)), sw = w / n;
    for (let i = 0; i < n; i++) this.sheet([cx - w / 2 + i * sw, yTop, z0], [sw, 0, 0], [0, yBot - yTop, len], 1, 3, i % 2 ? cB : cA, { sag: (u, v) => -Math.sin(v * Math.PI) * 0.08, ao: 0.3 });
    // scalloped valance
    for (let i = 0; i < n; i++) this.poly('cloth', [[cx - w / 2 + i * sw, yBot, z0 + len], [cx - w / 2 + (i + 1) * sw, yBot, z0 + len], [cx - w / 2 + (i + 0.5) * sw, yBot - 0.2, z0 + len + 0.03]], i % 2 ? cA : cB, { out: [0, 0, 1], ao: 0.3 });
    if (o.poles !== false) for (const s of [-1, 1]) this.cyl('wood', 0.05, 0.05, yBot + 0.02, cx + s * (w / 2 - 0.08), 0, z0 + len - 0.05, C.wood2, { seg: 5 });
  }
  statue(x, z, y = 0, s = 1, hex = C.bronze, o = {}) {
    this.box('masonry', 0.8 * s, 0.7 * s, 0.8 * s, x, y, z, C.marble); this.box('masonry', 0.92 * s, 0.1 * s, 0.92 * s, x, y + 0.7 * s, z, C.marble);
    const b = y + 0.8 * s;
    this.lathe('metal', [[0.0, 0], [0.15 * s, 0.02 * s], [0.17 * s, 0.5 * s], [0.14 * s, 0.7 * s], [0.07 * s, 0.82 * s], [0, 0.84 * s]], x, b, z, hex, { seg: 7, ao: 0.4 });
    this.lathe('metal', [[0.1 * s, 0], [0.12 * s, 0.1 * s], [0.12 * s, 0.5 * s]], x, b + 0.0, z, hex, { seg: 6, ao: 0.4 });
    this.sphere('metal', 0.1 * s, x, b + 0.9 * s, z, hex, { seg: 7, hseg: 5 });
    this.cyl('metal', 0.02 * s, 0.02 * s, 1.5 * s, x + 0.2 * s, b + 0.02, z + 0.04 * s, hex, { seg: 4 });                     // spear
    this.cyl('metal', 0.22 * s, 0.22 * s, 0.05 * s, x - 0.2 * s, b + 0.5 * s, z + 0.12 * s, hex, { rx: Math.PI / 2, c: true, seg: 8 }); // shield
    if (o.helm !== false) this.cone('metal', 0.06 * s, 0.14 * s, x, b + 0.98 * s, z, o.plume || hex, { seg: 5 });
  }
  /** raised herb bed: soil box + clumps */
  bed(x, z, w, d, y = 0, hex = C.leaf) {
    this.box('wood', w + 0.12, 0.24, d + 0.12, x, y, z, C.wood2); this.box('masonry', w, 0.24, d, x, y + 0.04, z, C.soil, { ao: 0.6 });
    const nx = Math.max(2, Math.round(w / 0.32)), nz = Math.max(1, Math.round(d / 0.32));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const px = x - w / 2 + (i + 0.5) * w / nx + (this.rnd() - 0.5) * 0.08, pz = z - d / 2 + (j + 0.5) * d / nz + (this.rnd() - 0.5) * 0.08, r = 0.1 + this.rnd() * 0.07;
      this.cone('cloth', r, 0.34 + this.rnd() * 0.18, px, y + 0.26, pz, this.rnd() > 0.7 ? C.leaf2 : hex, { seg: 5, ao: 0.5, sway: 0.5 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// the buildings. Each fn(k, lv) authors into the kit (origin = pad center, front = +z).
// ---------------------------------------------------------------------------------------------
const DESIGN = {};
// @@DESIGNS
const acc = (k) => k.accent;
const quoins = (k, w, h, d, z0, hex = C.trav) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('masonry', 0.3, h, 0.3, sx * (w / 2), 0, z0 + sz * (d / 2), hex); };
const steps = (k, x, z, w, n = 2, y = 0) => { for (let i = 0; i < n; i++) k.box('masonry', w - i * 0.3, 0.14, 0.42, x, y + i * 0.14, z + (n - 1 - i) * 0.4, C.trav); };

// ---------------------------------------------------------------- BARRACKS: long insula, balcony storey, wing tower
DESIGN.barracks = (k, lv) => {
  const w = lv >= 2 ? 7.2 : 6.0, d = 3.7, z0 = -0.6, h = 2.5, zf = z0 + d / 2;
  k.H = lv >= 3 ? 6.4 : 4.4;
  k.box('masonry', w + 0.3, 0.5, d + 0.3, 0, 0, z0, C.trav);
  k.box('masonry', w, h - 0.5, d, 0, 0.5, z0, C.plaster);
  quoins(k, w, h, d, z0);
  k.box('wood', w + 0.12, 0.15, 0.1, 0, h - 0.22, zf + 0.02, C.wood2);
  for (const sx of [-1, 1]) k.box('wood', 0.15, h - 0.5, 0.1, sx * (w / 2 - 0.1), 0.5, zf + 0.02, C.wood2);
  k.door(0, zf, 1.1, 1.9, { glowSlit: true }); steps(k, 0, zf + 0.3, 2.2, 2);
  const xs = lv >= 2 ? [-1.9, 1.9, -3.0, 3.0] : [-1.9, 1.9];
  for (const x of xs) { if (lv >= 4 && x < -2.5) continue; k.win(x, 1.15, zf + 0.0, 0.6, 0.85); }
  for (const sz of [-0.9, 0.7]) k.at(-w / 2, 0, z0 + sz, -Math.PI / 2, () => k.win(0, 1.15, 0, 0.55, 0.8));
  let roofTop;
  if (lv < 3) roofTop = k.gable(0, z0, w, d, h, 1.35, { gold: false });
  else {
    k.box('masonry', w + 0.5, 0.2, d + 0.5, 0, h, z0, C.trav);
    const uw = w - 1.6, ud = d - 1.3, uz = z0 - 0.65, uh = 2.0, y1 = h + 0.2, uzf = uz + ud / 2;
    k.box('masonry', uw, uh, ud, 0, y1, uz, C.plaster2);
    k.box('wood', uw + 0.1, 0.14, 0.1, 0, y1 + 0.08, uzf + 0.02, C.wood2); k.box('wood', uw + 0.1, 0.14, 0.1, 0, y1 + uh - 0.18, uzf + 0.02, C.wood2);
    for (let i = 0; i <= 5; i++) k.box('wood', 0.13, uh, 0.1, -uw / 2 + 0.07 + i * (uw - 0.14) / 5, y1, uzf + 0.02, C.wood2);
    for (const x of [-1.5, 1.5]) k.win(x, y1 + 0.7, uzf, 0.55, 0.8);
    k.door(0, uzf, 0.9, 1.6);
    roofTop = k.gable(0, uz, uw, ud, y1 + uh, 1.1, { gableHex: C.plaster2, gold: lv >= 5 });
    const rz = zf + 0.4, ry = y1;
    for (let x = -w / 2 + 0.1; x <= w / 2 + 0.05; x += 0.62) { if (lv >= 4 && x < -1.3) continue; k.box('wood', 0.07, 0.8, 0.07, x, ry, rz, C.wood); }
    const x0 = lv >= 4 ? -1.3 : -w / 2, x1 = w / 2 + 0.1;
    k.box('wood', x1 - x0, 0.07, 0.1, (x0 + x1) / 2, ry + 0.8, rz, C.woodLt); k.box('wood', x1 - x0, 0.05, 0.06, (x0 + x1) / 2, ry + 0.42, rz, C.wood);
    k.box('wood', 0.07, 0.07, 0.8, w / 2 + 0.1, ry + 0.8, z0 + d / 2 - 0.35, C.woodLt);
    for (const x of [-2.4, 2.4]) { if (lv >= 4 && x < 0) continue; k.banner(x, rz + 0.05, 0, 0, acc(k), { noPole: true, bar: ry + 1.0, w: 0.7, h: 1.35, gold: lv >= 5 }); }
  }
  if (lv >= 2) { const cx = w / 2 - 0.9, ch = lv >= 3 ? h + 3.6 : h + 2.6; k.box('masonry', 0.7, ch - 0.6, 0.7, cx, lv >= 3 ? h : h - 0.1, z0 - d / 2 + 0.7, C.trav); k.box('masonry', 0.9, 0.18, 0.9, cx, ch - 0.35, z0 - d / 2 + 0.7, C.trav); k.smoke(cx, ch - 0.2, z0 - d / 2 + 0.7, { r: 0.22, rate: 0.5 }); }
  if (lv >= 4) {
    const wx = -2.4, wz = zf + 0.75;
    k.box('masonry', 2.4, 3.2, 1.5, wx, 0, wz, C.plaster2); quoins(k, 2.4, 3.2, 1.5, wz); k.box('masonry', 2.7, 0.2, 1.8, wx, 3.1, wz, C.trav);
    k.win(wx, 1.5, wz + 0.75, 0.55, 0.9); k.win(wx, 2.4, wz + 0.75, 0.45, 0.55, { shut: false });
    k.hip(wx, wz, 2.4, 1.5, 3.3, 1.25, { gold: lv >= 5 });
    k.banner(-3.8, zf + 1.5, 0, 5.2, acc(k), { gold: lv >= 5 });
    k.torch(-0.95, 2.0, zf + 0.2); k.torch(0.95, 2.0, zf + 0.2);
  } else if (lv >= 2) k.torch(0.95, 2.0, zf + 0.2);
  if (lv >= 5) {
    k.box('metal', w + 0.5, 0.07, 0.05, 0, h + 0.1, zf + 0.26, C.gold); k.tor('metal', 0.3, 0.05, 0, 2.38, zf + 0.12, C.gold, { seg: 12 });
    k.brazier(1.9, zf + 1.1, 0, 0.85, { gold: true });
  }
  k.bench(2.3, zf + 0.75, 1.3); k.barrel(3.3, zf + 0.7); k.barrel(3.65, zf + 0.35, 0, 0.9); k.sack(1.3, zf + 0.55, 0); if (lv < 4) { k.crate(-3.0, zf + 0.6); k.crate(-2.5, zf + 0.5, 0, 0.8, C.woodLt, 0.4); }
  return { h: lv >= 3 ? 6.2 : 4.0 };
};

// ---------------------------------------------------------------- PALAESTRA: colonnaded training court, dummies, racks
const palus = (k, x, z, ry = 0) => k.at(x, 0, z, ry, () => {
  k.cyl('wood', 0.09, 0.11, 1.8, 0, 0, 0, C.wood, { seg: 6 }); k.cyl('masonry', 0.22, 0.26, 0.2, 0, 0, 0, C.stone, { seg: 6 });
  k.cyl('cloth', 0.19, 0.17, 0.6, 0, 0.92, 0, C.rope, { seg: 7 }); k.sphere('cloth', 0.12, 0, 1.62, 0, C.rope, { seg: 6, hseg: 5 });
  k.box('wood', 0.8, 0.08, 0.08, 0, 1.38, 0, C.wood2, { c: true }); k.cyl('metal', 0.19, 0.19, 0.04, 0.0, 1.08, 0.22, C.bronze, { rx: Math.PI / 2, c: true, seg: 8 });
  k.box('wood', 0.07, 0.08, 0.5, 0.3, 1.38, 0.2, C.woodLt, { c: true });
});
const rack = (k, x, z, ry = 0, n = 5) => k.at(x, 0, z, ry, () => {
  for (const s of [-1, 1]) k.box('wood', 0.09, 1.4, 0.09, s * 0.55, 0, 0, C.wood2);
  k.box('wood', 1.3, 0.08, 0.1, 0, 1.3, 0, C.wood2, { c: true }); k.box('wood', 1.2, 0.07, 0.1, 0, 0.55, 0, C.wood2, { c: true }); k.box('wood', 1.1, 0.07, 0.4, 0, 0.1, 0.1, C.wood2, { c: true });
  for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5); k.box('metal', 0.045, 0.95, 0.025, t * 0.95, 0.35, 0.1 + (i % 2) * 0.03, i % 2 ? C.iron : C.wood, { rz: t * 0.12 + 0.08, c: false }); }
});
DESIGN.palaestra = (k, lv) => {
  k.H = 4.6;
  const zb = -2.35, wallH = 2.9, colH = 2.4;
  k.box('masonry', 7.7, 0.5, 0.6, 0, 0, zb, C.trav); k.box('masonry', 7.6, wallH - 0.5, 0.4, 0, 0.5, zb, C.plaster);
  const nb = lv >= 3 ? 6 : 5, span = 6.6;
  const bx = (i, n) => -span / 2 + i * span / (n - 1);
  const colHex = lv >= 5 ? C.marble : C.trav;
  for (let i = 0; i < nb; i++) k.col(bx(i, nb), zb + 1.25, colH, 0.23, 0, colHex);
  k.box('masonry', 7.4, 0.3, 0.5, 0, colH, zb + 1.25, C.trav);
  k.shed(0, zb + 0.75, 7.4, 1.5, wallH + 0.05, colH + 0.15);
  if (lv >= 5) k.box('metal', 7.5, 0.06, 0.06, 0, colH + 0.3, zb + 1.52, C.gold);
  for (const s of [-1, 1]) {
    if (lv >= 2) {
      const len = lv >= 3 ? 3.7 : 2.4, zc = zb + 0.25 + len / 2, x = s * 3.85;
      k.box('masonry', 0.4, 0.5, len, x, 0, zc, C.trav); k.box('masonry', 0.35, wallH - 0.5 - 0.3, len, x, 0.5, zc, C.plaster);
      const n = lv >= 3 ? 4 : 3;
      for (let i = 0; i < n; i++) k.col(s * 3.05, zb + 1.25 + 0.0 + (i + 0.6) * (len - 1.1) / n * 1.0, colH - 0.1, 0.2, 0, colHex);
      k.box('masonry', 0.4, 0.26, len - 0.3, s * 3.05, colH - 0.1, zc + 0.1, C.trav);
      k.at(x, 0, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, () => k.shed(0, -0.6, len + 0.5, 1.2, wallH - 0.05, colH + 0.0));
    }
  }
  if (lv >= 4) for (let i = 0; i < nb - 1; i++) k.banner((bx(i, nb) + bx(i + 1, nb)) / 2, zb + 1.45, 0, 0, acc(k), { noPole: true, bar: colH - 0.1, w: 0.6, h: 1.4, gold: lv >= 5 });
  if (lv >= 4) { k.torch(-3.7, 2.2, zb + 0.35, { dz: 0 }); k.torch(3.7, 2.2, zb + 0.35); }
  // court curbs
  for (const s of [-1, 1]) k.box('masonry', 0.3, 0.2, 4.6, s * 3.95, 0, 0.3, C.trav);
  k.box('masonry', 3.0, 0.18, 0.3, -2.4, 0, 2.6, C.trav); k.box('masonry', 3.0, 0.18, 0.3, 2.4, 0, 2.6, C.trav);
  // props
  palus(k, -1.6, -0.2, 0.2); palus(k, 1.4, 0.0, -0.3); if (lv >= 3) palus(k, -0.1, 1.2, 0.0); if (lv >= 4) palus(k, 2.9, 1.3, -0.6);
  rack(k, -3.1, zb + 0.55, 0.0); if (lv >= 3) rack(k, 3.0, zb + 0.55, 0.0, 4);
  k.sphere('masonry', 0.2, -3.2, 0.2, 1.7, C.stone, { seg: 7 }); k.sphere('masonry', 0.26, -2.8, 0.26, 1.9, C.stone, { seg: 7 });
  k.cyl('masonry', 0.09, 0.09, 1.2, 2.5, 0.12, 2.0, C.iron, { rz: Math.PI / 2, c: true, seg: 6 }); k.cyl('masonry', 0.28, 0.28, 0.1, 1.95, 0.28, 2.0, C.iron, { rz: Math.PI / 2, c: true, seg: 8 }); k.cyl('masonry', 0.28, 0.28, 0.1, 3.05, 0.28, 2.0, C.iron, { rz: Math.PI / 2, c: true, seg: 8 });
  if (lv >= 3) for (let i = 0; i < 4; i++) k.cyl('metal', 0.26, 0.26, 0.05, -2.9 + i * 1.95, 1.7, zb + 0.32, i % 2 ? C.bronze : C.iron, { rx: Math.PI / 2, c: true, seg: 9 });
  if (lv >= 5) { k.statue(0, -0.9, 0, 1.15, C.gold); k.brazier(-3.5, 2.4, 0, 0.9, { gold: true }); k.brazier(3.5, 2.4, 0, 0.9, { gold: true }); }
  return { h: 3.4 };
};

// ---------------------------------------------------------------- KITCHEN: oven dome, chimney smoke, striped serving awning
DESIGN.kitchen = (k, lv) => {
  k.H = 4.8;
  const bw = 4.6, bd = 3.9, bh = 2.7, bx = -1.65, bz = -0.8, zf = bz + bd / 2;
  k.box('masonry', bw + 0.3, 0.5, bd + 0.3, bx, 0, bz, C.trav); k.box('masonry', bw, bh - 0.5, bd, bx, 0.5, bz, C.plaster2); quoins(k, bw, bh, bd, bz);
  k.box('wood', bw + 0.1, 0.14, 0.1, bx, bh - 0.2, zf + 0.02, C.wood2);
  k.door(bx - 0.4, zf, 1.0, 1.85); k.win(bx - 1.7, 1.2, zf, 0.55, 0.7); k.win(bx + 1.2, 1.2, zf, 0.55, 0.7);
  k.at(bx - bw / 2, 0, bz, -Math.PI / 2, () => { k.win(0.7, 1.2, 0, 0.55, 0.75); k.win(-0.9, 1.2, 0, 0.55, 0.75); });
  k.gable(bx, bz, bw, bd, bh, 1.3, { gold: lv >= 5, tint: lv >= 5 ? 0xfff0d8 : 0xffffff });
  // oven (right back) with dome, mouth glow
  const ox = 2.55, oz = -1.45;
  k.box('masonry', 2.3, 1.0, 1.9, ox, 0, oz, C.stone); k.sphere('masonry', 1.05, ox, 1.0, oz, 0xd9b890, { half: true, sy: 0.85, seg: 12 });
  k.box('glow', 0.75, 0.5, 0.06, ox, 0.28, oz + 0.96, [3.0, 1.1, 0.3], { em: [1, 1.0], ao: 0 }); k.box('masonry', 0.95, 0.12, 0.2, ox, 0.8, oz + 0.9, C.trav); k.box('masonry', 0.16, 0.56, 0.2, ox - 0.5, 0.24, oz + 0.9, C.trav); k.box('masonry', 0.16, 0.56, 0.2, ox + 0.5, 0.24, oz + 0.9, C.trav);
  const chH = lv >= 3 ? 5.4 : 4.5; k.box('masonry', 0.62, chH - 0.9, 0.62, ox + 0.5, 0.9, oz - 0.5, C.stone); k.box('masonry', 0.85, 0.2, 0.85, ox + 0.5, chH - 0.1, oz - 0.5, C.trav); k.smoke(ox + 0.5, chH + 0.15, oz - 0.5, { r: 0.28, rate: 1.4 });
  if (lv >= 3) { k.box('masonry', 1.6, 0.8, 1.4, 0.55, 0, -2.2, C.stone); k.sphere('masonry', 0.75, 0.55, 0.8, -2.2, 0xd9b890, { half: true, sy: 0.85, seg: 10 }); k.box('glow', 0.5, 0.35, 0.05, 0.55, 0.2, -1.48, [3.0, 1.1, 0.3], { em: [1, 1.0], ao: 0 }); k.box('masonry', 0.5, 2.8, 0.5, 0.2, 0.8, -2.7, C.stone); k.smoke(0.2, 3.7, -2.7, { r: 0.2, rate: 0.9 }); }
  // serving counter + awning
  const aw = lv >= 2 ? 3.4 : 2.5, ax = 2.5;
  k.box('wood', aw, 0.9, 0.6, ax, 0, 1.6, C.wood); k.box('masonry', aw + 0.12, 0.08, 0.7, ax, 0.9, 1.6, C.marble);
  k.awning(ax, 0.0, aw, 2.2, 2.75, 2.1, 0xb5352a, C.cream);
  k.box('wood', aw + 0.2, 0.1, 0.1, ax, 2.72, 0.0, C.wood2, { c: true });
  for (let i = 0; i < 4; i++) { k.cone('masonry', 0.07, 0.3, ax - 1.1 + i * 0.7, 1.82, 2.1, i % 2 ? C.leaf : 0xc9a050, { seg: 5 }); k.cyl('cloth', 0.012, 0.012, 0.28, ax - 1.1 + i * 0.7, 2.06, 2.1, C.rope, { seg: 3 }); }
  k.amphora(ax - 0.9, 1.6, 0.98, 0.45, C.clay); k.amphora(ax - 0.4, 1.58, 0.98, 0.4, 0xb86a3c); k.crate(ax + 0.3, 1.6, 0.98, 0.9); k.sack(ax + 0.9, 1.6, 0.98);
  if (lv >= 2) { k.table(-3.0, 1.9, 1.5, 0.8); k.bench(-3.0, 2.3, 1.4); k.barrel(-0.6, 1.55); k.barrel(-0.25, 1.35, 0, 0.9); }
  // cauldron on tripod
  k.at(0.6, 0, 1.6, 0, () => { for (let i = 0; i < 3; i++) k.cyl('wood', 0.025, 0.025, 1.0, Math.cos(i * 2.09) * 0.28, 0, Math.sin(i * 2.09) * 0.28, C.wood2, { seg: 4, rz: -Math.cos(i * 2.09) * 0.3, rx: Math.sin(i * 2.09) * 0.3 }); k.sphere('metal', 0.3, 0, 0.5, 0, C.coal, { half: true, sy: -0.8, seg: 9 }); k.box('glow', 0.4, 0.04, 0.4, 0, 0.18, 0, [2.6, 0.8, 0.2], { em: [1, 1.0], ao: 0 }); });
  k.smoke(0.6, 1.2, 1.6, { r: 0.18, rate: 0.5, tint: 1 });
  // wood pile
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) k.cyl('wood', 0.1, 0.1, 1.0, -3.8 + (r * 0.1) + i * 0.21 + r * 0.1, 0.1 + r * 0.17, 2.2, i % 2 ? C.wood2 : C.woodLt, { rz: Math.PI / 2, c: true, seg: 6 });
  if (lv >= 4) { k.at(bx, 0, bz, 0, () => { k.box('masonry', 1.0, 0.7, 0.9, 0, bh + 1.45, 0, C.plaster2); k.gable(0, 0, 1.0, 0.9, bh + 2.15, 0.5, { over: 0.2, overEnd: 0.15 }); for (let i = 0; i < 4; i++) k.box('wood', 0.04, 0.35, 0.02, -0.38 + i * 0.25, bh + 1.6, 0.46, C.wood2); }); k.torch(-1.2, 2.0, zf + 0.2); for (let i = 0; i < 3; i++) k.cyl('metal', 0.14, 0.12, 0.16, bx - 1.0 + i * 0.5, 1.9, zf + 0.12, lv >= 5 ? C.gold : C.bronze, { seg: 8 }); }
  if (lv >= 5) { k.banner(4.0, 2.4, 0, 4.3, acc(k), { gold: true }); k.box('metal', bw + 0.4, 0.07, 0.05, bx, bh + 0.02, zf + 0.5, C.gold); }
  return { h: chH };
};



// ---------------------------------------------------------------- BATH HOUSE: domed rotunda, portico, steaming wings, plunge pools
DESIGN.bath = (k, lv) => {
  k.H = 5.2;
  const cz = -1.0, R = lv >= 2 ? 1.95 : 1.75, wh = 2.7, marble = 0xefe4cc;
  k.cyl('masonry', R + 0.2, R + 0.2, 0.4, 0, 0, cz, C.trav, { seg: 12 });
  k.cyl('masonry', R, R, wh - 0.4, 0, 0.4, cz, marble, { seg: 12 });
  k.cyl('masonry', R + 0.14, R + 0.14, 0.2, 0, wh - 0.2, cz, C.trav, { seg: 12 });
  const n = 6; for (let i = 0; i < n; i++) { const a = i / n * TAU + 0.5; k.at(Math.sin(a) * R * 0.96, 0, cz + Math.cos(a) * R * 0.96, a, () => k.win(0, 1.15, 0.0, 0.5, 0.95, { shut: false })); }
  const domeR = R + 0.12; k.sphere('masonry', domeR, 0, wh, cz, lv >= 5 ? 0xfff0d0 : 0xf2e4c8, { half: true, sy: 0.82, seg: 14, hseg: 6 }); k.cyl('metal', domeR + 0.04, domeR + 0.04, 0.1, 0, wh + 0.02, cz, lv >= 4 ? C.gold : C.bronze, { seg: 14 });
  k.cyl('metal', 0.34, 0.4, 0.18, 0, wh + domeR * 0.82 - 0.08, cz, lv >= 5 ? C.gold : C.bronze, { seg: 10 }); k.sphere('metal', 0.16, 0, wh + domeR * 0.82 + 0.14, cz, lv >= 5 ? C.gold : C.bronze, { seg: 7, hseg: 5 });
  k.smoke(0, wh + domeR * 0.82 + 0.3, cz, { r: 0.35, rate: 1.0, tint: 1 });
  // portico
  const pz = cz + R - 0.1, cn = lv >= 3 ? 4 : 2, pw = lv >= 3 ? 3.6 : 1.8, ph = 2.45;
  k.box('masonry', pw + 1.0, 0.3, 2.0, 0, 0, pz + 0.8, C.trav);
  for (let i = 0; i < cn; i++) k.col(-pw / 2 + (cn === 1 ? 0 : i * pw / (cn - 1)), pz + 1.55, ph, 0.22, 0.3, marble);
  k.box('masonry', pw + 0.7, 0.32, 0.55, 0, 0.3 + ph, pz + 1.55, C.trav);
  k.at(0, 0, pz + 0.6, Math.PI / 2, () => k.gable(0, 0, 1.9, pw + 0.7, 0.62 + ph, 0.7, { over: 0.15, overEnd: 0.2, gableHex: marble, gold: lv >= 5 }));
  steps(k, 0, pz + 2.2, pw + 0.4, 2, 0); k.door(0, cz + R - 0.02 + 0.0, 1.0, 1.8, { frame: marble });
  if (lv >= 2) for (const s of [-1, 1]) {
    const wx = s * 3.0, wz = -1.55, wd = 2.3;
    k.box('masonry', 2.0, 0.4, wd + 0.2, wx, 0, wz, C.trav); k.box('masonry', 1.8, 2.3, wd, wx, 0.4, wz, marble);
    k.at(wx, 0, wz, 0, () => { k.win(0, 1.3, wd / 2, 0.5, 0.8, { shut: false }); });
    if (lv >= 4) { k.sphere('masonry', 1.0, wx, 2.7, wz, 0xf2e4c8, { half: true, sy: 0.8, seg: 10 }); k.sphere('metal', 0.1, wx, 3.5, wz, lv >= 5 ? C.gold : C.bronze, { seg: 6, hseg: 4 }); }
    else k.hip(wx, wz, 1.8, wd, 2.7, 1.0, { finial: false });
    k.box('masonry', 0.5, 1.3, 0.5, wx + s * 0.55, 2.7, wz - 0.6, C.stone); k.smoke(wx + s * 0.55, 4.1, wz - 0.6, { r: 0.22, rate: 0.9, tint: 1 });
  }
  if (lv >= 3) for (const s of [-1, 1]) {
    const px = s * 3.0, pzz = 1.2;
    k.box('masonry', 2.0, 0.34, 2.0, px, 0, pzz, marble, { ao: 0.5 });
    k.box('glow', 1.6, 0.04, 1.6, px, 0.3, pzz, [0.10, 0.34, 0.38], { em: [0, 0], ao: 0 });
    k.at(px, 0, pzz, 0, () => { for (const [x, z, w, d] of [[0, -0.9, 2.0, 0.2], [0, 0.9, 2.0, 0.2], [-0.9, 0, 0.2, 1.6], [0.9, 0, 0.2, 1.6]]) k.box('masonry', w, 0.14, d, x, 0.34, z, marble); });
  }
  if (lv >= 4) { k.statue(-3.7, 2.4, 0, 0.8, 0xe8e0d0, { helm: false }); k.statue(3.7, 2.4, 0, 0.8, 0xe8e0d0, { helm: false }); }
  if (lv >= 2) { k.torch(-1.0, 1.9, pz + 0.6); k.torch(1.0, 1.9, pz + 0.6); }
  if (lv >= 5) { k.brazier(-pw / 2 - 0.55, pz + 2.2, 0, 0.8, { gold: true }); k.brazier(pw / 2 + 0.55, pz + 2.2, 0, 0.8, { gold: true }); for (const s of [-1, 1]) k.banner(s * 1.8, pz + 1.7, 0, 0, acc(k), { noPole: true, bar: 2.3, w: 0.5, h: 1.2, gold: true }); k.box('metal', 2 * R + 0.5, 0.06, 0.06, 0, wh - 0.05, cz + R + 0.15, C.gold); }
  return { h: 5.0 };
};

// ---------------------------------------------------------------- INFIRMARY: courtyard of herb beds, wings, healer's staff
DESIGN.infirmary = (k, lv) => {
  k.H = 4.4;
  const bz = -1.55, bd = 2.3, bh = 2.5, bw = 7.2, zf = bz + bd / 2;
  k.box('masonry', bw + 0.3, 0.45, bd + 0.3, 0, 0, bz, C.trav); k.box('masonry', bw, bh - 0.45, bd, 0, 0.45, bz, 0xf3e8cc); quoins(k, bw, bh, bd, bz);
  k.box('wood', bw + 0.1, 0.14, 0.1, 0, bh - 0.2, zf + 0.02, C.wood2);
  for (const x of [-2.6, -1.6, 1.6, 2.6]) k.win(x, 1.1, zf, 0.55, 0.8);
  k.door(0, zf, 1.3, 2.0, { glowSlit: true }); steps(k, 0, zf + 0.3, 2.4, 2);
  k.hip(0, bz, bw, bd, bh, 1.25, { tint: 0xfff0dc, gold: lv >= 5 });
  // green banners flanking the door
  for (const s of [-1, 1]) k.banner(s * 1.2, zf + 0.12, 0, 0, 0x2f8f5a, { noPole: true, bar: 2.5, w: 0.5, h: 1.25, emblem: 0xf6f0e0, trim: lv >= 5 ? C.gold : 0xd8d0b8 });
  // healer staff sign on a post
  const staff = (x, z, s = 1) => { k.cyl('wood', 0.05, 0.06, 2.6 * s, x, 0, z, C.wood2, { seg: 6 }); k.cyl('metal', 0.035, 0.035, 1.0 * s, x, 2.6 * s, z, lv >= 3 ? C.gold : C.bronze, { seg: 5 }); for (let i = 0; i < 3; i++) k.tor('metal', 0.1 * s, 0.025, x, (2.8 + i * 0.22) * s, z, lv >= 3 ? C.gold : C.bronze, { rx: Math.PI / 2, seg: 8, tseg: 4 }); k.sphere('metal', 0.06 * s, x, 3.66 * s, z, lv >= 3 ? C.gold : C.bronze, { seg: 5, hseg: 4 }); };
  staff(-3.6, 1.2);
  // fence + beds
  const fz = 2.4; for (let x = -3.9; x <= 3.9; x += 0.65) { if (Math.abs(x) < 0.9) continue; k.box('wood', 0.06, 0.6, 0.06, x, 0, fz, C.wood); }
  k.box('wood', 2.9, 0.05, 0.05, -2.45, 0.5, fz, C.woodLt); k.box('wood', 2.9, 0.05, 0.05, 2.45, 0.5, fz, C.woodLt);
  k.bed(-2.4, 0.9, 2.4, 0.8); k.bed(2.4, 0.9, 2.4, 0.8, 0, C.leaf2); if (lv >= 2) { k.bed(-2.4, 1.85, 2.4, 0.5, 0, C.leaf2); k.bed(2.4, 1.85, 2.4, 0.5); }
  k.box('masonry', 1.0, 0.1, 3.0, 0, 0.0, 1.0, C.trav);
  if (lv >= 2) { const wx = -3.3, wz = 0.15; k.box('masonry', 1.7, 0.45, 2.3, wx, 0, wz, C.trav); k.box('masonry', 1.5, 2.0, 2.1, wx, 0.45, wz, 0xf3e8cc); k.win(wx, 1.0, wz + 1.05, 0.5, 0.75); k.hip(wx, wz, 1.5, 2.1, 2.45, 1.0, { tint: 0xfff0dc, finial: false }); }
  if (lv >= 3) { const wx = 3.3, wz = 0.15; k.box('masonry', 1.7, 0.45, 2.3, wx, 0, wz, C.trav); k.box('masonry', 1.5, 2.0, 2.1, wx, 0.45, wz, 0xf3e8cc); k.win(wx, 1.0, wz + 1.05, 0.5, 0.75); k.hip(wx, wz, 1.5, 2.1, 2.45, 1.0, { tint: 0xfff0dc, finial: false }); }
  if (lv >= 4) { // shaded walkway over the path
    for (const x of [-0.9, 0.9]) for (const z of [0.2, 1.4]) k.box('wood', 0.1, 2.3, 0.1, x, 0, z, C.wood);
    k.box('wood', 2.1, 0.1, 0.1, 0, 2.3, 0.2, C.wood2, { c: true }); k.box('wood', 2.1, 0.1, 0.1, 0, 2.3, 1.4, C.wood2, { c: true });
    for (let i = 0; i < 4; i++) k.sheet([-0.95 + i * 0.5, 2.33, 0.2], [0.5, 0, 0], [0, 0, 1.2], 1, 2, i % 2 ? 0xe9f0e2 : 0x3f9a62, { ao: 0.2 });
    k.torch(-1.9, 1.8, zf + 0.2); k.torch(1.9, 1.8, zf + 0.2);
  }
  if (lv >= 5) { k.box('metal', bw + 0.4, 0.07, 0.05, 0, bh + 0.0, zf + 0.35, C.gold); staff(3.6, 1.2); k.statue(0, 1.95, 0, 0.8, C.gold, { helm: false }); k.brazier(-1.8, 2.0, 0, 0.8, { gold: true }); k.brazier(1.8, 2.0, 0, 0.8, { gold: true }); }
  return { h: 4.0 };
};

// ---------------------------------------------------------------- FORGE: open smithy, glowing hearth, tall chimney, anvil
DESIGN.forge = (k, lv) => {
  k.H = 5.5;
  const zb = -2.3, wallH = 3.1, sw = lv >= 2 ? 7.4 : 5.6, sx = lv >= 2 ? 0 : -0.8;
  k.box('masonry', sw, 0.5, 0.7, sx, 0, zb, C.trav); k.box('masonry', sw - 0.1, wallH - 0.5, 0.5, sx, 0.5, zb, 0xc9b99a);
  for (const x of [sx - sw / 2 + 0.2, sx + sw / 2 - 0.2]) k.box('masonry', 0.4, wallH, 0.7, x, 0, zb, C.trav);
  // hearth + chimney
  const hx = 1.5 + (lv >= 2 ? 0 : -0.8);
  k.box('masonry', 2.2, 1.15, 1.2, hx, 0, zb + 0.85, C.stone); k.box('masonry', 1.2, 0.2, 1.3, hx, 1.15, zb + 0.85, C.trav);
  k.box('masonry', 1.6, 1.4, 0.9, hx, 1.3, zb + 0.6, C.stone); k.box('masonry', 1.1, 1.2, 0.8, hx, 2.7, zb + 0.4, C.stone);
  const chh = lv >= 4 ? 6.8 : 5.6; k.box('masonry', 0.9, chh - 3.8, 0.8, hx, 3.8, zb + 0.1, C.stone); k.box('masonry', 1.15, 0.22, 1.05, hx, chh - 0.1, zb + 0.1, lv >= 5 ? C.gold : C.trav); k.smoke(hx, chh + 0.1, zb + 0.1, { r: 0.4, rate: 1.6, tint: -1 });
  k.box('glow', 1.0, 0.55, 0.1, hx, 0.55, zb + 1.47, [3.2, 1.2, 0.3], { em: [1, 1.2], ao: 0 }); k.box('glow', 1.2, 0.12, 0.7, hx, 1.17, zb + 0.95, [3.6, 1.6, 0.4], { em: [1, 1.5], ao: 0 });
  k.box('masonry', 0.15, 0.7, 0.25, hx - 0.65, 0.4, zb + 1.5, C.trav); k.box('masonry', 0.15, 0.7, 0.25, hx + 0.65, 0.4, zb + 1.5, C.trav);
  k.spark(hx, 1.3, zb + 1.1, { rate: 1.4 });
  // roof + posts
  const rz = zb + 1.9; k.shed(sx, rz - 0.15, sw - 0.1, 3.8, wallH + 0.1, 2.5);
  for (const x of [sx - sw / 2 + 0.3, sx + sw / 2 - 0.3, sx + (lv >= 2 ? -1.2 : 0)]) { k.box('wood', 0.2, 2.5, 0.2, x, 0, 1.6, C.wood2); k.box('wood', 0.18, 0.5, 0.1, x, 2.0, 1.45, C.wood2, { rz: 0.5 }); }
  k.box('wood', sw - 0.3, 0.2, 0.2, sx, 2.45, 1.6, C.wood2, { c: true });
  // anvil on stump
  const ax = -0.6 + (lv >= 2 ? 0 : -0.8), az = 0.2;
  k.cyl('wood', 0.3, 0.34, 0.62, ax, 0, az, C.wood, { seg: 8 });
  k.box('metal', 0.28, 0.14, 0.26, ax, 0.62, az, C.iron); k.box('metal', 0.18, 0.12, 0.2, ax, 0.74, az, C.iron); k.box('metal', 0.62, 0.12, 0.28, ax, 0.84, az, lv >= 5 ? C.gold : 0x6a6e78); k.cone('metal', 0.14, 0.34, ax + 0.45, 0.9, az, lv >= 5 ? C.gold : 0x6a6e78, { rz: -Math.PI / 2, seg: 5, y: 0.9 });
  k.box('glow', 0.14, 0.02, 0.1, ax - 0.1, 0.96, az, [3.2, 1.4, 0.4], { em: [1, 1.0], ao: 0 }); k.spark(ax - 0.1, 1.0, az, { rate: 0.8 });
  k.box('wood', 1.1, 0.5, 0.6, ax - 1.7, 0, az - 0.1, C.wood2); k.box('glow', 0.95, 0.03, 0.5, ax - 1.7, 0.46, az - 0.1, [0.15, 0.3, 0.4], { em: [0, 0], ao: 0 }); // quench trough
  // bellows + grindstone + rack + charcoal
  k.at(hx - 1.3, 0, zb + 1.4, 0.4, () => { k.box('wood', 0.5, 0.18, 0.7, 0, 0.5, 0, C.wood2); k.box('cloth', 0.45, 0.14, 0.6, 0, 0.66, 0, 0x6a3f2a, { ao: 0.3 }); k.cone('metal', 0.06, 0.6, 0, 0.55, -0.3, C.iron, { rx: -Math.PI / 2, y: 0.55, seg: 5 }); k.box('wood', 0.07, 0.5, 0.07, 0, 0.0, 0.3, C.wood2); });
  k.cyl('masonry', 0.45, 0.45, 0.14, sx - sw / 2 + 0.9, 0.55, 0.3, C.stone, { rz: Math.PI / 2, c: true, seg: 10 }); for (const s of [-1, 1]) k.box('wood', 0.08, 0.9, 0.5, sx - sw / 2 + 0.9 + s * 0.2, 0, 0.3, C.wood2);
  for (let i = 0; i < 6; i++) { k.box('metal', 0.05, 1.0, 0.025, sx - sw / 2 + 1.2 + i * 0.28, 1.1, zb + 0.32, i % 2 ? C.iron : 0x8a8e96, { rz: (i - 2.5) * 0.04 }); } k.box('wood', 1.9, 0.07, 0.07, sx - sw / 2 + 1.9, 2.15, zb + 0.34, C.wood2, { c: true }); k.box('wood', 1.9, 0.07, 0.07, sx - sw / 2 + 1.9, 1.1, zb + 0.34, C.wood2, { c: true });
  for (let i = 0; i < 6; i++) k.sphere('masonry', 0.2 + (i % 3) * 0.05, hx + 1.7 + (i % 3) * 0.28 - 0.3, 0.14, zb + 1.0 + (i > 2 ? 0.35 : 0), C.coal, { seg: 5, hseg: 4 });
  if (lv >= 3) { const ex = sx + sw / 2 + (lv >= 2 ? -0.55 : 1.0); void ex; k.box('masonry', 1.8, 0.45, 2.4, 3.4, 0, 0.3, C.trav); k.box('masonry', 1.6, 2.3, 2.2, 3.4, 0.45, 0.3, C.plaster); k.gable(3.4, 0.3, 2.2, 1.6, 2.75, 1.0, { over: 0.3 }); k.door(3.4, 1.4, 0.9, 1.7); }
  if (lv >= 4) { // jib crane + torches
    k.box('wood', 0.2, 3.4, 0.2, -3.6, 0, 1.9, C.wood2); k.box('wood', 1.7, 0.16, 0.16, -2.85, 3.3, 1.9, C.wood2, { c: true }); k.box('wood', 0.14, 1.1, 0.14, -3.2, 2.35, 1.9, C.wood2, { rz: 0.9 });
    k.cyl('metal', 0.012, 0.012, 1.2, -2.2, 2.1, 1.9, C.iron, { seg: 3 }); k.box('metal', 0.18, 0.08, 0.08, -2.2, 2.0, 1.9, C.iron); k.box('metal', 0.5, 0.3, 0.3, -2.2, 1.7, 1.9, C.iron, { c: true });
    k.torch(sx - sw / 2 + 0.35, 2.0, 1.75); k.torch(sx + sw / 2 - 0.35, 2.0, 1.75);
  }
  if (lv >= 5) { k.banner(-3.0, -0.2, 0, 5.0, acc(k), { gold: true, w: 0.9, h: 2.0 }); k.brazier(0.8, 1.9, 0, 0.9, { gold: true }); k.box('metal', sw + 0.3, 0.07, 0.07, sx, wallH + 0.05, zb + 0.5, C.gold); }
  return { h: chh };
};

// ---------------------------------------------------------------- MARKET: striped stalls, goods, lanterns
const GOODS = {
  fruit: (k, x, z, y) => { for (let i = 0; i < 9; i++) k.sphere('cloth', 0.1, x - 0.5 + (i % 5) * 0.25, y + 0.1 + (i > 4 ? 0.14 : 0), z + (i % 2) * 0.1 - 0.05, [0xd2412b, 0xe8a030, 0x8ab040, 0xd2412b, 0xe8a030][i % 5], { seg: 5, hseg: 4, ao: 0.5 }); },
  cloth: (k, x, z, y) => { for (let i = 0; i < 4; i++) k.cyl('cloth', 0.12, 0.12, 0.5, x - 0.45 + i * 0.3, y + 0.12, z, [C.purple, 0x2f78c4, C.red, 0xe0a41b][i], { rz: Math.PI / 2, rx: 0, c: false, seg: 7, ry: 0 }); },
  pots: (k, x, z, y) => { for (let i = 0; i < 4; i++) k.amphora(x - 0.5 + i * 0.33, z, y, 0.42, i % 2 ? C.clay : 0xb86a3c); },
  baskets: (k, x, z, y) => { for (let i = 0; i < 3; i++) { k.cyl('wood', 0.2, 0.15, 0.2, x - 0.4 + i * 0.4, y, z, C.woodLt, { seg: 7 }); for (let j = 0; j < 4; j++) k.sphere('cloth', 0.08, x - 0.4 + i * 0.4 + (j - 1.5) * 0.06, y + 0.24, z + (j % 2) * 0.05, [0xe8c860, 0x8ab040, 0xc9a050][i], { seg: 4, hseg: 3 }); } },
  fish: (k, x, z, y) => { k.box('wood', 1.1, 0.1, 0.5, x, y, z, C.wood2); for (let i = 0; i < 5; i++) k.box('metal', 0.18, 0.04, 0.07, x - 0.4 + i * 0.2, y + 0.1, z + (i % 2) * 0.08 - 0.04, 0x9aa8b8, { ry: 0.3 * (i % 3 - 1) }); },
  spice: (k, x, z, y) => { for (let i = 0; i < 4; i++) k.cone('masonry', 0.17, 0.26, x - 0.45 + i * 0.3, y, z, [0xd9a020, 0xb5352a, 0x8a9a40, 0xc86a2a][i], { seg: 7, ao: 0.4 }); },
};
DESIGN.market = (k, lv) => {
  k.H = 4;
  const slots = [[0, -1.2, 0], [-2.6, 1.2, 1], [-2.6, -1.2, 2], [2.6, 1.2, 3], [2.6, -1.2, 4], [0, 1.2, 5]];
  const goods = ['fruit', 'cloth', 'pots', 'baskets', 'spice', 'fish'];
  const cols = [[0xb5352a, C.cream], [C.purple, C.cream], [0x2f8f5a, C.cream], [0xe0a41b, C.cream], [0x2f78c4, C.cream], [C.red, 0xf6e8c0]];
  const n = Math.min(6, lv + 1);
  for (let i = 0; i < n; i++) {
    const [x, z, gi] = slots[i], big = i === 0 && lv >= 3;
    const [cA, cB] = cols[i];
    k.at(x, 0, z, 0, () => {
      for (const sx of [-1, 1]) { k.box('wood', 0.09, 2.25, 0.09, sx * 1.0, 0, -0.7, C.wood2); k.box('wood', 0.09, 1.95, 0.09, sx * 1.0, 0, 0.75, C.wood2); }
      for (let j = 0; j < 4; j++) k.sheet([-1.1 + j * 0.55, 2.32, -0.8], [0.55, 0, 0], [0, -0.38, 1.7], 1, 3, j % 2 ? cB : cA, { sag: (u, v) => -Math.sin(v * Math.PI) * 0.07, ao: 0.25 });
      for (let j = 0; j < 4; j++) k.poly('cloth', [[-1.1 + j * 0.55, 1.94, 0.9], [-1.1 + (j + 1) * 0.55, 1.94, 0.9], [-1.1 + (j + 0.5) * 0.55, 1.74, 0.92]], j % 2 ? cA : cB, { out: [0, 0, 1], ao: 0.3 });
      k.box('wood', 2.2, 0.85, 0.6, 0, 0, 0.35, C.wood); k.box('wood', 2.3, 0.07, 0.7, 0, 0.85, 0.35, C.woodLt);
      GOODS[goods[gi]](k, 0, 0.35, 0.92);
      k.box('wood', 2.2, 0.8, 0.12, 0, 0, -0.65, C.wood2); // back shelf
      if (lv >= 5) { k.box('metal', 2.3, 0.06, 0.06, 0, 2.3, 0.93, C.gold, { c: true }); k.box('glow', 0.14, 0.2, 0.14, 0.0, 1.72, 0.55, WIN, { em: [1, 0], ao: 0 }); k.cyl('metal', 0.1, 0.1, 0.03, 0, 1.92, 0.55, C.gold, { seg: 6 }); }
      else if (lv >= 4 && i % 2 === 0) k.box('glow', 0.12, 0.18, 0.12, 0, 1.72, 0.55, WIN, { em: [1, 0], ao: 0 });
    });
    void big;
  }
  if (lv >= 4) { k.banner(-3.9, 2.35, 0, 4.4, acc(k), {}); }
  if (lv >= 5) { k.banner(3.9, 2.35, 0, 4.4, acc(k), { gold: true }); }
  if (lv >= 2) { k.crate(3.6, 2.4, 0, 1, C.wood, 0.3); k.barrel(-3.6, 2.4); }
  if (lv >= 3) { k.cyl('masonry', 0.5, 0.55, 0.7, 0.0, 0.0, 0.3, C.stone, { seg: 9, c: false }); }
  return { h: 3.4 };
};

// ---------------------------------------------------------------- SCOUT TOWER: tall stone shaft, timber lookout, beacon, banner
DESIGN.scout = (k, lv) => {
  const hts = [4.6, 6.3, 8.1, 9.9, 11.6], H = hts[lv - 1], r0 = 1.45, rt = 1.12, cz = -0.5, ry = Math.PI / 8;
  k.H = H;
  k.cyl('masonry', r0 + 0.3, r0 + 0.15, 0.7, 0, 0, cz, C.trav, { seg: 8, ry });
  k.cyl('masonry', r0, rt, H - 0.7, 0, 0.7, cz, C.plaster, { seg: 8, ry }); // shaft
  for (const yy of [H * 0.38, H * 0.7]) k.cyl('masonry', lerp(r0, rt, (yy - 0.7) / (H - 0.7)) + 0.1, lerp(r0, rt, (yy - 0.7) / (H - 0.7)) + 0.1, 0.18, 0, yy, cz, C.trav, { seg: 8, ry });
  const ap = (r) => r * Math.cos(Math.PI / 8);
  const ra = (y) => ap(lerp(r0, rt, (y - 0.7) / (H - 0.7)));
  k.door(0, cz + ap(r0 + 0.2) - 0.06, 1.0, 1.8, { glowSlit: false });
  for (let yy = 2.8; yy < H - 1.8; yy += 1.9) { k.box('glow', 0.14, 0.62, 0.05, 0, yy, cz + ra(yy) + 0.02, WIN, { em: [1, 0], ao: 0 }); k.box('masonry', 0.3, 0.8, 0.08, 0, yy - 0.08, cz + ra(yy) - 0.01, C.trav); }
  for (const s of [-1, 1]) k.at(0, 0, cz, s * Math.PI / 2, () => { const yy = H * 0.55; k.box('glow', 0.14, 0.62, 0.05, 0, yy, ra(yy) + 0.02, WIN, { em: [1, 0], ao: 0 }); });
  // top: corbel ring + parapet / hoarding
  const rtop = rt + 0.38; k.cyl('masonry', rtop, rt, 0.4, 0, H - 0.4, cz, C.trav, { seg: 8, ry }); k.cyl('masonry', rtop, rtop, 0.18, 0, H, cz, C.trav, { seg: 8, ry });
  if (lv === 1) {
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + ry * 0 + Math.PI / 8; k.box('masonry', 0.45, 0.45, 0.3, Math.sin(a) * (rtop - 0.15), H + 0.18, cz + Math.cos(a) * (rtop - 0.15), C.trav, { ry: a }); }
    k.box('wood', 0.9, 0.9, 0.9, 0.0, H + 0.18, cz, C.wood2);
  } else {
    const hh = 1.25 + (lv >= 3 ? 0.15 : 0);
    k.cyl('wood', rtop - 0.05, rtop - 0.05, hh, 0, H + 0.18, cz, C.wood, { seg: 8, ry });
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; k.box('wood', 0.12, hh + 0.1, 0.12, Math.sin(a) * (rtop - 0.02), H + 0.18, cz + Math.cos(a) * (rtop - 0.02), C.wood2, { ry: a }); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; k.at(0, 0, cz, a, () => { k.box('glow', 0.7, 0.45, 0.05, 0, H + 0.55, rtop * Math.cos(Math.PI / 8) - 0.02, [1.2, 0.7, 0.3], { em: [1, 0], ao: 0 }); k.box('wood', 0.9, 0.08, 0.1, 0, H + 0.45, rtop * Math.cos(Math.PI / 8) + 0.03, C.wood2); }); }
    k.cyl('wood', rtop + 0.12, rtop + 0.12, 0.14, 0, H + 0.18 + hh, cz, C.wood2, { seg: 8, ry });
    const rh = 1.6; k.cone('roof', rtop + 0.45, rh, 0, H + 0.32 + hh, cz, lv >= 5 ? 0xffe0b0 : 0xffffff, { seg: 8, ry });
    k.cyl('wood', 0.04, 0.05, 1.6, 0, H + 0.32 + hh + rh - 0.05, cz, C.wood2, { seg: 5 });
  }
  const top = lv === 1 ? H + 1.2 : H + 0.32 + (lv >= 3 ? 1.4 : 1.25) + 1.6;
  // pennant at top
  if (lv >= 2) { k.cyl('wood', 0.04, 0.05, 1.3, 0, top - 0.1, cz, C.wood2, { seg: 5 }); k.sheet([0.0, top + 1.1, cz], [0.0, 0, 1.0], [0, -0.55, 0.0], 3, 2, acc(k), { sag: (u, v) => Math.sin(u * 3) * 0.04 }); if (lv >= 5) k.sphere('metal', 0.1, 0, top + 1.25, cz, C.gold, { seg: 6, hseg: 4 }); }
  else { k.cyl('wood', 0.04, 0.05, 1.4, 0.0, H + 0.6, cz, C.wood2, { seg: 5 }); k.sheet([0.0, H + 1.9, cz], [0.0, 0, 0.9], [0, -0.5, 0.0], 3, 2, acc(k)); }
  // ladder (lv1-2) / gatehouse (lv4+) / torches
  if (lv <= 2) { for (const s of [-1, 1]) k.box('wood', 0.07, Math.min(H - 0.4, 4.2), 0.07, s * 0.45, 0, cz + 1.0 + 0.6, C.wood2, { rx: -0.25 }); for (let i = 0; i < 7; i++) k.box('wood', 0.9, 0.05, 0.05, 0, 0.5 + i * 0.5, cz + 1.2 + 0.5 - i * 0.1 + 0.3 - 0.2, C.wood); }
  if (lv >= 3) { k.torch(-0.95, 1.9, cz + 1.3); k.torch(0.95, 1.9, cz + 1.3); }
  if (lv >= 4) { const gz = 1.2; k.box('masonry', 3.6, 0.4, 2.0, 0, 0, gz, C.trav); k.box('masonry', 3.3, 1.9, 1.8, 0, 0.4, gz, C.plaster2); k.gable(0, gz, 3.3, 1.8, 2.3, 0.9, { over: 0.3 }); k.door(0.9, gz + 0.9, 0.9, 1.7); k.win(-0.8, 1.2, gz + 0.9, 0.5, 0.7); k.brazier(-2.6, 2.1, 0, 0.9); }
  if (lv >= 5) { k.box('metal', 2 * rtop + 0.1, 0.06, 0.06, 0, H + 0.08, cz + rtop * 0.92, C.gold); k.banner(2.6, 1.4, 0, 4.2, acc(k), { gold: true }); }
  return { w: 4.0, d: 4.4, h: top + 1.2 };
};

// ---------------------------------------------------------------- SPARRING RING: sand circle, palisade, benches
DESIGN.sparring = (k, lv) => {
  k.H = 3.5;
  const R = 2.35, cz = -0.1;
  k.cyl('masonry', R + 0.1, R + 0.1, 0.07, 0, 0, cz, 0xf3e0b4, { seg: 24, ao: 0.3 });
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; k.box('masonry', 0.7, lv >= 3 ? 0.34 : 0.2, 0.34, Math.sin(a) * (R + 0.2), 0, cz + Math.cos(a) * (R + 0.2), C.trav, { ry: a }); }
  const np = lv >= 2 ? 20 : 8;
  for (let i = 0; i < np; i++) {
    const a = (i + 0.5) / np * TAU; if (lv >= 2 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - 0) < 0.0) continue;
    const gate = lv >= 2 && Math.cos(a) > 0.93; if (gate) continue;
    const x = Math.sin(a) * (R + 0.2), z = cz + Math.cos(a) * (R + 0.2), ph = lv >= 2 ? 1.25 : 0.95;
    k.cyl('wood', 0.07, 0.08, ph, x, 0.1, z, C.wood, { seg: 6 });
    if (lv >= 5) k.cone('metal', 0.09, 0.2, x, 0.1 + ph, z, C.gold, { seg: 5 }); else if (lv >= 2) k.cone('wood', 0.08, 0.12, x, 0.1 + ph, z, C.wood2, { seg: 5 });
  }
  const rings = lv >= 2 ? [0.5, 0.95] : [0.55, 0.9];
  for (const yy of rings) { if (lv >= 2) { k.tor('wood', R + 0.2, 0.04, 0, 0.1 + yy, cz, C.woodLt, { rx: Math.PI / 2, seg: 36, tseg: 4 }); } else k.tor('cloth', R + 0.2, 0.025, 0, 0.1 + yy, cz, C.red, { rx: Math.PI / 2, seg: 24, tseg: 4, ao: 0.2 }); }
  // wooden swords + marks
  k.at(-3.5, 0, -1.0, 0.4, () => rack(k, 0, 0, 0, 4));
  for (let i = 0; i < 2; i++) k.box('wood', 0.06, 0.9, 0.025, 1.3 + i * 0.2, 0.1, 0.9 + i * 0.1, C.woodLt, { rz: 0.2 + i * 0.15 });
  if (lv >= 3) { k.bench(-3.6, 1.1, 1.8, Math.PI / 2); k.bench(3.6, 1.1, 1.8, Math.PI / 2); k.bench(-3.6, 0.2, 1.8, Math.PI / 2); k.bench(3.6, 0.2, 1.8, Math.PI / 2); }
  if (lv >= 4) {
    for (const z of [-1.7, -0.3]) k.box('wood', 0.1, 2.2, 0.1, 3.95, 0, z, C.wood2);
    k.at(3.95, 0, -1.0, -Math.PI / 2, () => k.awning(0, 0.0, 1.8, 1.6, 2.3, 1.95, C.red, C.cream, { poles: false }));
    k.torch(-1.2, 1.6, cz + R + 0.5); k.torch(1.2, 1.6, cz + R + 0.5);
  }
  if (lv >= 5) { k.banner(-3.9, 2.4, 0, 3.8, acc(k), { gold: true }); k.brazier(3.5, 2.2, 0, 0.9, { gold: true }); k.brazier(-3.5, -2.2, 0, 0.9, { gold: true });
    for (const s of [-1, 1]) k.box('metal', 1.6, 0.07, 0.07, 0, 3.1, -2.4, C.gold, { rz: s * 0.7, c: true });
    k.cyl('wood', 0.07, 0.08, 3.0, 0, 0, -2.4, C.wood2, { seg: 6 }); k.cyl('metal', 0.3, 0.3, 0.05, 0, 2.7, -2.33, C.gold, { rx: Math.PI / 2, c: true, seg: 8 }); }
  return { h: 3.4 };
};

// ---------------------------------------------------------------- STANDS: tiered grandstand, awning, editor's box
DESIGN.stands = (k, lv) => {
  k.H = 4.6;
  const rows = lv >= 5 ? 5 : lv >= 3 ? 4 : 3, W = 7.4, stone = lv >= 3, step = 0.5, dz = 0.82, z0 = 1.6;
  for (let r = 0; r < rows; r++) {
    const z = z0 - r * dz, y = r * step;
    if (stone && r < 2) k.box('masonry', W, step + y, dz, 0, 0, z, C.trav);
    else { k.box('wood', W, 0.14, dz, 0, y + step - 0.14, z, C.woodLt); for (const x of [-W / 2 + 0.2, 0, W / 2 - 0.2]) k.box('wood', 0.16, y + step - 0.14, dz - 0.1, x, 0, z, C.wood2); }
    k.box('wood', W - 0.2, 0.08, 0.26, 0, y + step + 0.12, z + dz * 0.15, C.wood, { c: false }); // seat plank
  }
  const topY = rows * step;
  // back wall + posts
  k.box('masonry', W, topY + 1.0, 0.4, 0, 0, z0 - rows * dz + 0.2, stone ? C.plaster : C.wood2);
  const pzs = z0 - (rows - 1) * dz;
  for (const x of lv >= 2 ? [-W / 2 + 0.2, -W / 4, 0, W / 4, W / 2 - 0.2] : [-W / 2 + 0.2, W / 2 - 0.2]) k.box('wood', 0.2, topY + 2.2, 0.2, x, 0, pzs, C.wood2);
  // front rail
  for (let x = -W / 2 + 0.1; x <= W / 2; x += 0.6) k.box('wood', 0.06, 0.7, 0.06, x, 0, z0 + dz / 2 + 0.05, C.wood);
  k.box('wood', W, 0.07, 0.08, 0, 0.7, z0 + dz / 2 + 0.05, C.woodLt);
  if (lv >= 2) { // awning over the upper rows
    const aw = W, len = rows * dz * 0.95;
    k.awning(0, z0 - rows * dz + 0.3, aw, len, topY + 2.4, topY + 1.6, lv >= 4 ? C.purple : C.red, C.cream, { poles: false });
    k.box('wood', W + 0.2, 0.12, 0.12, 0, topY + 2.35, z0 - rows * dz + 0.3, C.wood2, { c: true });
  } else { k.box('wood', W, 0.12, 2.2, 0, topY + 2.2, pzs + 0.9, C.wood2); }
  if (lv >= 4) { // editor's box at the front
    k.box('masonry', 1.7, 0.5, 1.3, 0, 0, z0 + dz / 2 + 0.7, C.marble); k.box('wood', 1.5, 0.12, 1.1, 0, 0.5, z0 + dz / 2 + 0.7, C.woodLt);
    k.sheet([-0.85, 1.0, z0 + dz / 2 + 1.36], [1.7, 0, 0], [0, -0.95, 0], 4, 3, C.purple, { sag: (u, v) => Math.sin(u * Math.PI * 3) * 0.04 });
    for (const s of [-1, 1]) k.cyl('wood', 0.05, 0.05, 1.9, s * 0.8, 0.5, z0 + dz / 2 + 1.25, C.wood2, { seg: 5 });
    k.sheet([-0.9, 2.4, z0 + dz / 2 + 1.28], [1.8, 0, 0], [0, 0, -1.3], 3, 2, C.purple, { sag: (u, v) => -Math.sin(u * Math.PI) * 0.05 });
    k.torch(-1.4, 1.3, z0 + dz / 2 + 0.9); k.torch(1.4, 1.3, z0 + dz / 2 + 0.9);
  }
  const bx = W / 2 + 0.05;
  for (const s of [-1, 1]) { k.banner(s * bx, z0 + 0.6, 0, 3.6 + (lv >= 3 ? 0.6 : 0), lv >= 2 ? acc(k) : C.red, { gold: lv >= 5, w: 0.7, h: 1.5 }); }
  if (lv >= 5) { k.box('metal', W + 0.2, 0.07, 0.07, 0, 0.78, z0 + dz / 2 + 0.05, C.gold); for (const x of [-2.5, 2.5]) k.brazier(x, z0 + dz / 2 + 0.7, 0, 0.8, { gold: true }); }
  return { h: topY + 2.6 };
};

// ---------------------------------------------------------------- SHRINE: marble temple on a stepped podium, altar flame
DESIGN.shrine = (k, lv) => {
  k.H = 5.0;
  const m = C.marble, pw = lv >= 4 ? 5.6 : 4.4;
  for (let i = 0; i < 3; i++) k.box('masonry', pw + 1.0 - i * 0.5, 0.17, 4.6 - i * 0.5, 0, i * 0.17, -0.2 + i * 0.0, m);
  const y0 = 0.51;
  const cw = lv >= 4 ? 3.8 : 2.8, cd = lv >= 2 ? 3.2 : 2.0, cz = -0.9, ch = 2.5;
  if (lv >= 2) {
    k.box('masonry', cw, ch, cd, 0, y0, cz, 0xd8c29a); k.box('masonry', cw + 0.18, 0.2, cd + 0.18, 0, y0 + ch - 0.1, cz, C.trav);
    k.box('masonry', 1.0, 1.8, 0.1, 0, y0, cz + cd / 2 + 0.0, 0x1f1612); k.statue(0, cz + cd / 2 - 0.5, y0, 0.55, C.gold, { helm: false });
    for (const s of [-1, 1]) k.at(s * cw / 2, 0, cz, s * Math.PI / 2, () => k.win(0, y0 + 1.2, 0.0, 0.4, 0.8, { shut: false, frame: m }));
  }
  const cn = lv >= 4 ? 6 : lv >= 3 ? 4 : 2, span = lv >= 4 ? 4.6 : lv >= 3 ? 3.2 : 2.0, fz = lv >= 2 ? cz + cd / 2 + 1.1 : 0.0, colH = 2.3;
  for (let i = 0; i < cn; i++) k.col(-span / 2 + i * span / Math.max(1, cn - 1), fz, colH, 0.21, y0, lv >= 5 ? 0xfaf2e0 : m);
  k.box('masonry', span + 0.8, 0.32, 0.5, 0, y0 + colH, fz, C.trav);
  if (lv >= 5) k.box('metal', span + 0.84, 0.06, 0.06, 0, y0 + colH + 0.32, fz + 0.26, C.gold);
  const roofLen = lv >= 2 ? (fz - (cz - cd / 2)) + 0.6 : 1.8;
  k.at(0, 0, (lv >= 2 ? (fz + (cz - cd / 2)) / 2 : 0), Math.PI / 2, () => k.gable(0, 0, roofLen, span + 0.9, y0 + colH + 0.32, lv >= 4 ? 1.1 : 0.85, { over: 0.22, overEnd: 0.25, gableHex: m, gold: lv >= 5 }));
  if (lv >= 5) for (const s of [-1, 1]) k.statue(s * (span / 2 + 0.9), fz + 0.3, 0.0, 0.7, C.gold);
  // altar + brazier
  const az = fz + 1.5; k.box('masonry', 0.9, 0.7, 0.7, 0, 0, az + 0.2, m); k.box('masonry', 1.1, 0.1, 0.9, 0, 0.7, az + 0.2, C.trav);
  k.cyl('metal', 0.26, 0.15, 0.2, 0, 0.8, az + 0.2, lv >= 4 ? C.gold : C.bronze, { seg: 8 }); k.cyl('glow', 0.2, 0.2, 0.02, 0, 1.0, az + 0.2, [2.8, 0.9, 0.2], { seg: 7, em: [1, 1.0], ao: 0 }); k.flame(0, 1.0, az + 0.2, 0.9);
  k.smoke(0, 1.5, az + 0.2, { r: 0.12, rate: 0.35, tint: 1 });
  if (lv >= 3) { k.brazier(-pw / 2 - 0.1, 2.2, 0, 0.85, { gold: lv >= 5 }); k.brazier(pw / 2 + 0.1, 2.2, 0, 0.85, { gold: lv >= 5 }); }
  // laurel garlands between columns
  if (lv >= 5) for (let i = 0; i < cn - 1; i++) { const x = -span / 2 + (i + 0.5) * span / (cn - 1); k.sheet([x - 0.5 * span / (cn - 1) + 0.2, y0 + colH - 0.05, fz + 0.3], [span / (cn - 1) - 0.4, 0, 0], [0, -0.45, 0], 4, 2, C.green, { sag: (u, v) => Math.sin(u * Math.PI) * 0.0, ao: 0.4 }); }
  return { h: 4.6 };
};

// ---------------------------------------------------------------- HALL OF LEGENDS: marble hall, pediment, statue plinths (one per legend slot)
DESIGN.hall = (k, lv) => {
  k.H = 5.6;
  const slots = [0, 1, 2, 3, 4, 6][lv], m = C.marble, W = lv >= 3 ? 7.4 : 6.0;
  for (let i = 0; i < 2; i++) k.box('masonry', W + 0.7 - i * 0.4, 0.2, 5.2 - i * 0.4, 0, i * 0.2, 0.0, m);
  const y0 = 0.4, hd = 3.0, hz = -1.0, hh = 3.2, hw = W - 0.8;
  k.box('masonry', hw, hh, hd, 0, y0, hz, 0xd2b890); k.box('masonry', hw + 0.2, 0.28, hd + 0.2, 0, y0 + hh - 0.14, hz, m);
  k.box('masonry', hw + 0.14, 0.4, hd + 0.14, 0, y0, hz, C.trav);
  const fz = hz + hd / 2 + 1.0, cn = lv >= 3 ? 6 : 4, span = lv >= 3 ? 5.0 : 3.4, colH = 2.8;
  for (let i = 0; i < cn; i++) k.col(-span / 2 + i * span / (cn - 1), fz, colH, 0.23, y0, m);
  k.box('masonry', span + 0.9, 0.38, 0.6, 0, y0 + colH, fz, m);
  if (lv >= 2) k.box('metal', span + 0.7, 0.14, 0.04, 0, y0 + colH + 0.1, fz + 0.32, lv >= 5 ? C.gold : C.bronze);
  k.at(0, 0, (fz + hz - hd / 2) / 2 + 0.1, Math.PI / 2, () => k.gable(0, 0, fz - (hz - hd / 2) + 0.7, span + 1.0, y0 + colH + 0.38, 1.05, { over: 0.2, overEnd: 0.25, gableHex: m, tint: 0x8a8590, ridge: lv >= 5 ? C.gold : 0x8a8590, gold: lv >= 5 }));
  k.cyl('metal', 0.3, 0.3, 0.05, 0, y0 + colH + 0.7, fz + 0.2, lv >= 5 ? C.gold : C.bronze, { rx: Math.PI / 2, c: true, seg: 10 }); // shield relief in the pediment
  k.door(0, hz + hd / 2, 1.5, 2.3, { frame: m });
  for (const s of [-1, 1]) { const wx = s * (hw / 2 + 0.1); if (lv >= 2) { k.win(s * (hw / 2 - 0.9), y0 + 1.3, hz + hd / 2, 0.5, 1.0, { shut: false, frame: m }); } void wx; }
  steps(k, 0, fz + 0.5, span + 1.0, 3, 0.0);
  // statue plinths: one per legend slot
  const xs = slots <= 1 ? [0] : Array.from({ length: slots }, (_, i) => -3.4 + i * (6.8 / (slots - 1)));
  const gc = [0xd8a65a, C.bronze, 0xc9d0dc, C.gold, 0xd8a65a, C.bronze];
  xs.forEach((x, i) => { const onFront = Math.abs(x) < span / 2 + 0.4 && slots > 2 ? 2.3 : 2.1; void onFront; k.statue(x, 2.45, 0, 1.0, lv >= 5 ? C.gold : gc[i % gc.length], { plume: acc(k) }); });
  if (lv >= 3) { k.torch(-span / 2 - 0.6, 2.1, fz + 0.5); k.torch(span / 2 + 0.6, 2.1, fz + 0.5); }
  if (lv >= 4) for (const s of [-1, 1]) k.banner(s * (W / 2 + 0.2), -0.3, 0, 4.4, acc(k), { gold: lv >= 5, w: 0.8, h: 1.8 });
  if (lv >= 5) { k.box('metal', hw + 0.3, 0.07, 0.07, 0, y0 + hh + 0.12, hz + hd / 2 + 0.12, C.gold); }
  return { h: 5.6 };
};


// ---------------------------------------------------------------------------------------------
// rear yards: every building gets some back-of-house life (woodpiles, laundry, stores, herb tubs...) so its back is never a blank wall (HUB-VISUAL)
// ---------------------------------------------------------------------------------------------
const REAR = { barracks: 'laundry', kitchen: 'stores', bath: 'wood', infirmary: 'herbs', forge: 'coal', market: 'crates', scout: 'ladder', sparring: 'racks', stands: 'barrels', shrine: 'vines', hall: 'garden', palaestra: 'racks' };
function rearYard(k, id, lv) {
  const r = rngOf(id.length * 977 + lv * 31 + 5), z = -2.93, kind = REAR[id] || 'stores', keep = k.H; k.H = 6;
  const pile = (x, n) => { for (let j = 0; j < n; j++) for (let i = 0; i < n - j; i++) k.box('wood', 1.3, 0.2, 0.2, x - (n - j - 1) * 0.11 + i * 0.22, 0.02 + j * 0.2, z + (r() - 0.5) * 0.06, i % 2 ? C.wood : C.woodLt, { ao: 0.5 }); };
  const tub = (x, zz, s = 1, hex = C.wood2) => { k.cyl('wood', 0.26 * s, 0.22 * s, 0.5 * s, x, 0, zz, hex, { seg: 6 }); k.cyl('metal', 0.27 * s, 0.27 * s, 0.04, x, 0.28 * s, zz, C.iron, { seg: 6 }); };
  const jar = (x, zz, s = 1, hex = C.clay) => k.cone('masonry', 0.24 * s, 0.7 * s, x, 0, zz, hex, { seg: 6, ao: 0.5 });
  const crate = (x, zz, s = 1, y = 0) => k.box('wood', 0.5 * s, 0.38 * s, 0.42 * s, x, y, zz, C.wood, { ry: (r() - 0.5) * 0.6 });
  const tunic = [C.cream, C.red, 0xcaa05a, C.teal, 0xd8cfc0];
  if (kind === 'laundry') {
    const xa = -3.1, xb = 3.1, y = 2.3 + (lv >= 3 ? 0.3 : 0);
    for (const x of [xa, xb]) k.cyl('wood', 0.04, 0.05, y + 0.25, x, 0, z - 0.05, C.wood2, { seg: 5 });
    k.box('wood', xb - xa, 0.025, 0.025, 0, y + 0.2, z - 0.05, C.rope, { c: true });
    for (let i = 0; i < 4; i++) { const x = xa + 0.55 + i * 1.45 + (r() - 0.5) * 0.2, w = 0.62 + r() * 0.2; k.sheet([x, y + 0.2, z - 0.05], [w, 0, 0], [0, -(0.7 + r() * 0.3), 0], 2, 3, tunic[(i + lv) % tunic.length], { ao: 0.35 }); }
    pile(-2.4, 3); tub(2.4, z + 0.1, 1.0);
  } else if (kind === 'stores') { jar(-3.3, z + 0.05, 1.1); jar(-2.8, z - 0.02, 0.9, 0xb9723f); jar(-2.35, z + 0.08, 1.0); crate(2.3, z, 1.0); crate(2.9, z + 0.04, 0.9); crate(2.6, z + 0.02, 0.8, 0.38); k.sack(1.6, z + 0.06, 0, C.rope); k.sack(1.35, z - 0.02, 0, C.cream); }
  else if (kind === 'wood') { pile(-2.8, 4); pile(2.3, 3); k.box('wood', 1.7, 0.1, 0.5, 0.0, 0, z, C.wood2); tub(0.4, z + 0.05, 1.1); }
  else if (kind === 'herbs') { for (let i = 0; i < 3; i++) { const x = -2.9 + i * 0.75; tub(x, z, 0.9, C.clay); for (let b = 0; b < 3; b++) k.cone('cloth', 0.1, 0.45 + r() * 0.2, x + (b - 1) * 0.1, 0.44, z + (r() - 0.5) * 0.1, b % 2 ? C.leaf : C.leaf2, { seg: 4, sway: 0.6, ao: 0.4 }); } jar(2.7, z, 1.0); jar(3.1, z + 0.05, 0.8); k.bench(1.6, z + 0.1, 1.3); }
  else if (kind === 'coal') { k.cone('masonry', 0.7, 0.55, -2.8, 0, z + 0.05, C.coal, { seg: 6, ao: 0.4 }); k.cone('masonry', 0.5, 0.4, -2.2, 0, z, 0x3a2a22, { seg: 5, ao: 0.4 }); tub(2.2, z + 0.05, 1.2, 0x5a4a3a); k.box('metal', 1.2, 0.07, 0.07, 3.0, 0.85, z, C.iron); pile(0.2, 3); }
  else if (kind === 'crates') { crate(-3.2, z); crate(-2.6, z + 0.03, 1.1); crate(-2.9, z + 0.02, 0.9, 0.4); jar(2.4, z + 0.04, 1.2); jar(2.9, z, 1.0); jar(3.3, z + 0.05, 0.8); k.sack(0.2, z + 0.05, 0, C.rope); k.sack(0.55, z, 0, C.cream); }
  else if (kind === 'ladder') { for (const s of [-1, 1]) k.box('wood', 0.07, 3.0, 0.07, 1.6 + s * 0.26, 0, z + 0.05 - 0.3, C.wood2, { rx: -0.2 }); for (let i = 0; i < 5; i++) k.box('wood', 0.52, 0.05, 0.05, 1.6, 0.4 + i * 0.5, z - 0.18 - i * 0.05, C.woodLt); tub(-2.4, z, 1.0); jar(-3.0, z + 0.05, 1.0); }
  else if (kind === 'racks') { for (let i = 0; i < 2; i++) { const x = -3.0 + i * 1.2; k.box('wood', 0.9, 0.06, 0.06, x, 0.9, z, C.wood2); k.box('wood', 0.9, 0.06, 0.06, x, 0.45, z, C.wood2); for (const s of [-1, 1]) k.box('wood', 0.07, 1.1, 0.07, x + s * 0.45, 0, z, C.wood2); for (let b = 0; b < 3; b++) k.box('wood', 0.05, 1.0, 0.05, x - 0.28 + b * 0.28, 0, z - 0.04, C.woodLt, { rz: 0.1 }); } tub(2.6, z + 0.05, 1.0); tub(3.1, z, 0.9); }
  else if (kind === 'barrels') { tub(-3.2, z, 1.1); tub(-2.6, z + 0.04, 1.0); tub(-2.9, z + 0.02, 0.9); crate(2.7, z, 1.0); crate(3.2, z + 0.03, 0.9); }
  else if (kind === 'vines') { for (let i = 0; i < 4; i++) { const x = -3.2 + i * 0.85; k.cone('cloth', 0.22, 1.0 + r() * 0.4, x, 0, z, i % 2 ? C.leaf : C.green, { seg: 5, sway: 0.5, ao: 0.4 }); } for (let i = 0; i < 3; i++) k.cone('cloth', 0.2, 0.9 + r() * 0.3, 1.9 + i * 0.6, 0, z + 0.02, C.leaf2, { seg: 5, sway: 0.5, ao: 0.4 }); jar(0.4, z + 0.06, 1.0); }
  else { for (let i = 0; i < 4; i++) k.cone('cloth', 0.26, 0.8 + r() * 0.5, -3.2 + i * 0.9, 0, z, i % 2 ? C.leaf : C.leaf2, { seg: 5, sway: 0.5, ao: 0.4 }); k.bench(2.6, z + 0.1, 1.5); jar(1.5, z + 0.04, 0.9); }
  k.H = keep;
}
// ---------------------------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------------------------
export const BUILDING_IDS = Object.keys(DESIGN);
export { MATS, C as PALETTE, DESIGN };
const CACHE = new Map();
const ACC_DEFAULT = 0x6a2470;

/** Merged geometry per material for (id, level). Cached. Geometries are shared: clone before transforming. */
export function buildParts(id, level, opts = {}) {
  level = clamp(Math.round(level || 1), 1, 5);
  const accent = opts.accent ?? ACC_DEFAULT, key = `${id}|${level}|${accent}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const fn = DESIGN[id]; if (!fn) throw new Error('unknown building ' + id);
  const k = new Kit(id.length * 131 + level * 17 + 3, accent); k.H = 6;
  const info = fn(k, level) || {};
  if (!opts.noRear) rearYard(k, id, level);
  const parts = {}; let tris = 0, calls = 0;
  for (const m of MATS) { if (k.P[m].length) { const g = mergeGeometries(k.P[m], false); g.computeBoundingSphere(); parts[m] = g; tris += g.attributes.position.count / 3; calls++; } }
  const res = { id, level, parts, fx: k.fx, tris: Math.round(tris), calls, footprint: { w: info.w || FOOT.w, d: info.d || FOOT.d, h: info.h || 5 } };
  CACHE.set(key, res); return res;
}

/** Standalone building: Group with <= 6 meshes (+ own flame instances when opts.ownFlames !== false). */
export function createBuilding(id, level, opts = {}) {
  const R = buildParts(id, level, opts), lib = getLib();
  const group = new THREE.Group(); group.name = `bld_${id}_${R.level}`;
  const glowU = new Float32Array(MAXPLOT), glowMat = makeGlowMaterial(glowU);
  for (const m of MATS) {
    if (!R.parts[m]) continue;
    const mesh = new THREE.Mesh(R.parts[m], m === 'glow' ? glowMat : lib[m]);
    mesh.castShadow = m !== 'glow' && m !== 'cloth'; mesh.receiveShadow = m !== 'glow'; mesh.name = m; group.add(mesh);
  }
  let flames = null;
  if (opts.ownFlames !== false && R.fx.flames.length) { flames = createFlames(R.fx.flames, { glowScale: 3.2 }); group.add(flames.group); }
  return {
    id, level: R.level, group, footprint: R.footprint, fx: R.fx, tris: R.tris, calls: R.calls + (flames ? 2 : 0),
    update(t, dt) { buildingUniforms.uTime.value = t; if (flames) flames.update(t, glowU[0]); },
    setGlow(v) { glowU[0] = v; },
    dispose() { glowMat.dispose(); },
  };
}

// ---------------------------------------------------------------------------------------------
// MOVE: construction sites (a building being rebuilt after the owner moved it), workers and the crane
// ---------------------------------------------------------------------------------------------
const SITE_CACHE = new Map();
const SITE_FRAC = [0.3, 0.55, 0.8];   // shell height (fraction of the finished building) per stage
const _scaleM = new THREE.Matrix4();
/** stage 0..2 from progress 0..1 (weeks done / weeks total). */
export const siteStage = (p) => (p < 0.34 ? 0 : p < 0.67 ? 1 : 2);
/**
 * A construction site for (id, level): the finished walls cut down to a partial height (no roof, glass, banners), timber scaffolding with planked decks and a ladder,
 * a tarp, stacked stone and timber, a rope fence at the front and (stage 2) the bare roof frame. Same shape as buildParts() so the hub merges it per material.
 * Also returns `workers`: local spots {x,y,z,ry} for the animated crew (hub InstancedMesh). Cached.
 */
export function buildSite(id, level, stage = 0, opts = {}) {
  stage = clamp(Math.round(stage), 0, 2);
  const full = buildParts(id, level, opts), accent = opts.accent ?? ACC_DEFAULT, key = `${id}|${full.level}|${stage}|${accent}`;
  if (SITE_CACHE.has(key)) return SITE_CACHE.get(key);
  const fp = full.footprint, f = SITE_FRAC[stage], top = Math.max(1.3, fp.h * f * 0.85);
  const k = new Kit(id.length * 71 + stage * 13 + 5, accent); k.H = 6;
  const hw = fp.w / 2 + 0.75, hd = fp.d / 2 + 0.75, H = Math.min(fp.h + 1.2, top + 1.9 + stage * 0.5), deck = [1.45, 2.9, 4.3].filter((y) => y < H - 0.5);
  // poles along the long sides and at the corners
  const nx = Math.max(2, Math.round(fp.w / 2.7)), px = []; for (let i = 0; i <= nx; i++) px.push(-hw + (2 * hw * i) / nx);
  for (const z of [-hd, hd]) for (const x of px) k.cyl('wood', 0.075, 0.09, H, x, 0, z, C.woodLt, { seg: 5, ao: 0.3 });
  // ledgers + planked decks on both long sides, a short deck across the back
  for (const y of deck) {
    for (const z of [-hd, hd]) { k.box('wood', 2 * hw + 0.2, 0.09, 0.09, 0, y - 0.08, z, C.wood2, { c: true, ao: 0.3 }); k.box('wood', 2 * hw, 0.07, 0.95, 0, y - 0.1, z + (z > 0 ? -0.35 : 0.35), C.wood, { c: true, ao: 0.35 }); }
    for (const x of [-hw, hw]) k.box('wood', 0.09, 0.09, 2 * hd, x, y - 0.08, 0, C.wood2, { c: true, ao: 0.3 });
    for (const z of [-hd, hd]) k.box('wood', 2 * hw, 0.06, 0.06, 0, y + 0.55, z, C.rope, { c: true, ao: 0.3 });   // guard rail
  }
  // diagonal braces on the front and the back face
  for (const z of [-hd, hd]) for (let i = 0; i < nx; i += 2) { const x0 = px[i], x1 = px[Math.min(nx, i + 1)]; const L = Math.hypot(x1 - x0, H - 0.4); k.box('wood', L, 0.07, 0.06, (x0 + x1) / 2, H / 2, z + (z > 0 ? 0.05 : -0.05), C.wood2, { c: true, rz: Math.atan2(H - 0.4, x1 - x0), ao: 0.3 }); }
  // ladder at the front-left, rungs every 0.4 m
  { const lx = -hw + 0.7, lh = deck.length ? deck[deck.length - 1] : 1.4; for (const s of [-0.2, 0.2]) k.box('wood', 0.07, lh + 0.4, 0.07, lx + s, 0, hd + 0.35, C.wood2, { rx: -0.14, ao: 0.3 }); for (let y = 0.35; y < lh; y += 0.4) k.box('wood', 0.46, 0.05, 0.05, lx, y, hd + 0.35 - y * 0.14, C.woodLt, { c: true, ao: 0.3 }); }
  // tarp hanging on the back (cloth sways) and a pennant
  k.sheet([-hw + 0.3, Math.max(1.2, H - 0.1), -hd - 0.12], [2 * hw - 0.6, 0, 0], [0, -Math.max(1.2, H - 0.6) * 0.9, 0], 3, 3, C.cream, { ao: 0.4 });
  if (stage >= 1) k.sheet([hw + 0.1, H - 0.2, -hd + 0.4], [0, 0, 2.2], [0, -1.7, 0], 2, 3, C.red, { ao: 0.4 });
  // stacked cut stone, timber, a barrel and a sawhorse near the front-right
  for (let i = 0; i < 6; i++) k.box('masonry', 0.72, 0.36, 0.42, hw - 0.9 + (i % 3) * 0.8 - 0.8, Math.floor(i / 3) * 0.36, hd + 1.05 + (i % 2) * 0.04, i % 2 ? C.trav : C.stone, { ry: (i % 3) * 0.05, ao: 0.4 });
  for (let i = 0; i < 5; i++) k.cyl('wood', 0.1, 0.1, 2.0, hw - 2.6, 0.1 + (i % 3) * 0.19 + (i > 2 ? 0.1 : 0), hd + 0.9 + (i % 3) * 0.2, C.woodLt, { seg: 5, rz: Math.PI / 2, c: true, ao: 0.4 });
  k.barrel(-hw - 0.2, hd + 0.9, 0, 0.8);
  for (const s of [-1, 1]) { k.box('wood', 0.07, 0.8, 0.07, -0.9 + s * 0.45, 0, hd + 1.9, C.wood2, { rx: 0.2 * s }); k.box('wood', 0.07, 0.8, 0.07, -0.9 + s * 0.45, 0, hd + 1.9, C.wood2, { rx: -0.2 * s }); k.box('wood', 1.4, 0.07, 0.12, -0.9, 0.7, hd + 1.9, C.wood, { c: true }); }
  // rope fence: stakes around the foot of the site, a rope between them at the front
  { const sx = [-hw - 0.5, -hw / 2, 0, hw / 2, hw + 0.5], z = hd + 1.8; for (const x of sx) k.box('wood', 0.07, 0.9, 0.07, x, 0, z, C.wood2, { ao: 0.3 }); k.box('wood', 2 * hw + 1.0, 0.025, 0.025, 0, 0.82, z, C.red, { c: true }); }
  // the partial shell: finished masonry / wood / metal squashed to the stage height, no roof, no windows, no banners
  const parts = {}, sc = new THREE.Matrix4().makeScale(1, f, 1), lift = new THREE.Matrix4();
  void _scaleM; void lift;
  for (const m of MATS) { const list = k.P[m].slice(); if ((m === 'masonry' || m === 'wood' || m === 'metal') && full.parts[m]) list.push(full.parts[m].clone().applyMatrix4(sc)); if (list.length) { const g = mergeGeometries(list, false); g.computeBoundingSphere(); parts[m] = g; } }
  // stage 2 adds the bare roof frame (ridge beam and rafters) on top of the shell
  if (stage === 2) { const k2 = new Kit(9, accent); k2.H = 6; const y0 = fp.h * f * 0.97, w2 = fp.w * 0.82, d2 = fp.d * 0.8; k2.box('wood', w2, 0.2, 0.2, 0, y0 + 1.3, 0, C.wood2, { c: true }); for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const x = -w2 / 2 + 0.3 + i * ((w2 - 0.6) / 5); k2.box('wood', 0.12, 0.12, d2 / 2 + 0.2, x, y0 + 0.65, s * d2 / 4, C.woodLt, { c: true, rx: -s * Math.atan2(1.3, d2 / 2) }); } if (k2.P.wood.length) parts.wood = mergeGeometries([parts.wood, ...k2.P.wood], false); }
  let tris = 0, calls = 0; for (const m of MATS) if (parts[m]) { tris += parts[m].attributes.position.count / 3; calls++; }
  // crew spots: ground, first deck, second deck, roof frame
  const w = [{ x: hw + 0.9, y: 0, z: 0.8, ry: Math.PI * 0.5 }, { x: -0.8, y: 0, z: hd + 0.6, ry: Math.PI }, { x: 1.4, y: 0, z: hd + 0.9, ry: Math.PI * 0.9 }];
  if (deck[0]) w.push({ x: -hw * 0.5, y: deck[0], z: hd - 0.35, ry: Math.PI }, { x: hw * 0.4, y: deck[0], z: -hd + 0.35, ry: 0 });
  if (deck[1]) w.push({ x: hw * 0.6, y: deck[1], z: hd - 0.35, ry: Math.PI }, { x: -hw * 0.2, y: deck[1], z: -hd + 0.35, ry: 0 });
  const res = { id, level: full.level, stage, parts, fx: { flames: [], smoke: [], sparks: [] }, tris: Math.round(tris), calls, footprint: full.footprint, workers: w.slice(0, 3 + stage * 2 + (deck.length > 1 ? 1 : 0)), site: true };
  SITE_CACHE.set(key, res); return res;
}

let WORKER_GEO = null;
/** one crew member (~150 triangles): legs, tunic, head, and an arm with a mallet flagged by `aArm` so the vertex shader can swing it. Vertex colors are linear. */
export function workerGeometry() {
  if (WORKER_GEO) return WORKER_GEO;
  const list = [], add = (g, rgb, arm = 0, ry = 0) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, c = new Float32Array(n * 3), a = new Float32Array(n).fill(arm); for (let i = 0; i < n; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aArm', new THREE.BufferAttribute(a, 1)); g.deleteAttribute('uv'); list.push(g); void ry; };
  const bx = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };
  add(bx(0.11, 0.46, 0.14, -0.08, 0, 0), [0.2, 0.14, 0.1]); add(bx(0.11, 0.46, 0.14, 0.08, 0, 0), [0.2, 0.14, 0.1]);                 // legs
  add(bx(0.34, 0.5, 0.2, 0, 0.44, 0), [0.62, 0.44, 0.24]);                                                                          // tunic
  add(bx(0.36, 0.08, 0.22, 0, 0.44, 0), [0.28, 0.16, 0.08]);                                                                        // belt
  const hd = new THREE.SphereGeometry(0.115, 6, 5); hd.translate(0, 1.07, 0); add(hd, [0.62, 0.38, 0.24]);                           // head
  add(bx(0.2, 0.05, 0.2, 0, 1.17, 0), [0.45, 0.4, 0.28]);                                                                           // cap
  add(bx(0.09, 0.09, 0.42, -0.23, 0.82, 0.18), [0.62, 0.38, 0.24], 1);                                                              // arm (swings about the shoulder)
  add(bx(0.07, 0.07, 0.07, 0.23, 0.82, 0), [0.62, 0.38, 0.24]);                                                                     // idle arm
  add(bx(0.2, 0.1, 0.1, -0.23, 0.79, 0.42), [0.16, 0.14, 0.14], 1);                                                                 // mallet head
  WORKER_GEO = mergeGeometries(list, false); return WORKER_GEO;
}
/** InstancedMesh of `n` workers; the hub sets the matrices every frame. instanceColor varies the tunics a little. */
export function makeWorkerMesh(n) {
  const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    key: 'bld_worker', uniforms: { uTime: buildingUniforms.uTime },
    vPars: 'attribute float aArm; uniform float uTime;',
    vBody: `if (aArm > 0.5) { float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7; float a = sin(uTime * 7.5 + ph) * 0.75 - 0.55; vec3 pv = vec3(-0.23, 0.82, 0.0); vec3 q = transformed - pv; float cs = cos(a), sn = sin(a); q = vec3(q.x, q.y * cs - q.z * sn, q.y * sn + q.z * cs); transformed = pv + q; }`,
  });
  const m = new THREE.InstancedMesh(workerGeometry(), mat, n); m.count = 0; m.frustumCulled = false; m.castShadow = true; m.name = 'site_workers';
  const col = new THREE.Color(); for (let i = 0; i < n; i++) { const t = 0.7 + ((i * 37) % 11) / 11 * 0.6; m.setColorAt(i, col.setRGB(t, t * (0.9 + ((i * 13) % 5) * 0.04), t * (0.8 + ((i * 7) % 4) * 0.08))); }
  return m;
}

/** The tower crane used in the move cinematic: { group, setPose({az, load, lift, show}) }. 3 meshes (mast and jib in one, rope, load), shared wood material. */
export function makeCrane() {
  const lib = getLib(), group = new THREE.Group(); group.name = 'move_crane';
  const kM = new Kit(3, 0x6a2470); kM.H = 12; const MH = 9.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kM.box('wood', 0.16, MH, 0.16, sx * 0.4, 0, sz * 0.4, C.wood2, { ao: 0.2 });
  for (let y = 0.9; y < MH; y += 1.5) { for (const s of [-1, 1]) { kM.box('wood', 0.9, 0.08, 0.08, 0, y, s * 0.4, C.woodLt, { c: true, ao: 0.2 }); kM.box('wood', 0.08, 0.08, 0.9, s * 0.4, y, 0, C.woodLt, { c: true, ao: 0.2 }); kM.box('wood', 1.2, 0.07, 0.07, 0, y + 0.7, s * 0.4, C.wood, { c: true, rz: 0.7 * s, ao: 0.2 }); } }
  kM.box('wood', 2.3, 0.35, 2.3, 0, 0, 0, C.stone, { ao: 0.3 }); kM.box('wood', 1.2, 0.4, 1.2, 0, MH, 0, C.iron, { ao: 0.2 });
  const mastGeo = mergeGeometries(kM.P.wood, false);
  const kJ = new Kit(4, 0x6a2470); kJ.H = 12; const L = 7.6;
  kJ.box('wood', 0.12, 0.12, L + 2.2, 0.28, 0.6, (L - 2.2) / 2, C.wood2, { c: true, ao: 0.2 }); kJ.box('wood', 0.12, 0.12, L + 2.2, -0.28, 0.6, (L - 2.2) / 2, C.wood2, { c: true, ao: 0.2 }); kJ.box('wood', 0.1, 0.1, L + 2.2, 0, 0.1, (L - 2.2) / 2, C.wood2, { c: true, ao: 0.2 });
  for (let z = -1.8, i = 0; z < L - 0.6; z += 0.9, i++) kJ.box('wood', 0.06, 0.06, 0.95, 0, 0.35, z + 0.45, C.woodLt, { c: true, rx: (i % 2 ? 1 : -1) * 0.66, ao: 0.2 });
  kJ.box('wood', 0.9, 0.7, 0.9, 0, 0.1, -2.3, C.stone, { ao: 0.3 }); kJ.cyl('wood', 0.1, 0.1, 0.9, 0, 0.35, L - 0.1, C.iron, { rz: Math.PI / 2, c: true, seg: 6 });
  // the mast is four posts around the axis, so it can turn with the jib: mast and jib are ONE mesh (one draw call) that rotates about y
  const jibGeo = mergeGeometries(kJ.P.wood, false); jibGeo.translate(0, MH + 0.2, 0);
  const jib = new THREE.Mesh(mergeGeometries([mastGeo, jibGeo], false), lib.wood); jib.castShadow = true; group.add(jib); const mast = jib, JY = MH + 0.2;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 4).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xc9b07a })); rope.frustumCulled = false; jib.add(rope);
  const kL = new Kit(6, 0x6a2470); kL.H = 3; kL.box('wood', 0.38, 0.3, 0.3, 0, -0.3, 0, C.iron, { ao: 0.4 }); for (let i = 0; i < 4; i++) kL.cyl('wood', 0.09, 0.09, 1.4, -0.28 + i * 0.19, -0.75 - (i % 2) * 0.1, 0, C.woodLt, { rz: Math.PI / 2, c: true, seg: 5, ry: 0.5, ao: 0.4 });
  const load = new THREE.Mesh(mergeGeometries(kL.P.wood, false), lib.wood); load.frustumCulled = false; load.castShadow = true; jib.add(load);
  const api = {
    group, jib, mast, rope, load, tipZ: L - 0.1, setShadows(on) { jib.castShadow = on; load.castShadow = on; },
    /** az = jib yaw (0 points +z), reach 0..1 of the jib, drop = metres the load hangs below the jib tip height, show = load visible */
    setPose({ az = 0, reach = 1, drop = 5, show = true } = {}) {
      jib.rotation.y = az; const z = 1.5 + (L - 1.7) * clamp(reach); rope.position.set(0, JY + 0.3, z); rope.scale.set(1, Math.max(0.2, drop), 1); load.position.set(0, JY + 0.3 - drop, z); load.visible = show; rope.visible = show;
    },
    dispose() { for (const m of [jib, rope, load]) { m.geometry && m.geometry.dispose(); } rope.material.dispose(); },
  };
  api.setPose(); return api;
}
