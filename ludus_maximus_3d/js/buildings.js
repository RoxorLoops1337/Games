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
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const colOf = (hex) => { if (Array.isArray(hex)) return hex; const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const rngOf = (seed) => { let s = (seed | 0) || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

// palette (sRGB hex, converted to linear by three)
const C = {
  plaster: 0xe3c490, plaster2: 0xf0e2c2, trav: 0xe8dcc0, marble: 0xf4efe4, clay: 0xc97a48, wood: 0x9a6a3c, wood2: 0x6a4426, woodLt: 0xb98650, dark: 0x2a2118,
  iron: 0x565a63, bronze: 0xc08a3e, gold: 0xf5c545, purple: 0x6a2470, red: 0xb5352a, green: 0x5b7a3a, leaf: 0x56782f, leaf2: 0x7a9040, sand: 0xdcb47e,
  cream: 0xf0e4c6, soil: 0x6b4a2e, water: 0x4aa3a6, coal: 0x2a1a14, stone: 0xb9ab92, rope: 0xc9b07a, teal: 0x2f8f86,
};
const WIN = [2.9, 1.5, 0.55];       // lit window HDR (blooms when glow=1)

// ---------------------------------------------------------------------------------------------
// shared materials + uniforms
// ---------------------------------------------------------------------------------------------
export const buildingUniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uHL: { value: new Float32Array(MAXPLOT) }, uGl: { value: new Float32Array(MAXPLOT) } };

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
    key, uniforms: { uHL: buildingUniforms.uHL, uTime: buildingUniforms.uTime, uWind: buildingUniforms.uWind },
    vPars: `attribute float aPlot; varying float vHL; uniform float uHL[${MAXPLOT}]; uniform float uTime, uWind;\n${vPars}`,
    vBody: `vHL = uHL[int(aPlot + 0.5)];\n${vBody}`,
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
    key: 'bld_glow', uniforms: { uGl: glArr === buildingUniforms.uGl ? buildingUniforms.uGl : { value: glArr }, uTime: buildingUniforms.uTime },
    vPars: `attribute float aPlot; varying float vGl; varying vec2 vEm; uniform float uGl[${MAXPLOT}];`,
    vBody: 'vGl = uGl[int(aPlot + 0.5)]; vEm = uv;',
    fPars: 'varying float vGl; varying vec2 vEm; uniform float uTime;',
    fBody: 'float lit = max(vEm.y, 0.12 + vGl * 3.4); diffuseColor.rgb *= mix(1.0, lit * (0.93 + 0.07 * sin(uTime * 8.0 + vEm.x * 40.0)), step(0.5, vEm.x));',
  });
  return m;
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
    metal: litPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.5, emissive: 0x1c1208, emissiveIntensity: 0.6 }), 'bld_metal'),
    cloth: litPatch(new THREE.MeshStandardMaterial({ map: cloth.map, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 'bld_cloth', {
      vBody: 'float swF = uv.x; transformed += normal * (sin(uTime * 2.3 + transformed.x * 0.9 + transformed.y * 0.7 + swF * 4.0) * 0.5 + 0.5) * 0.12 * swF * uWind;',
    }),
    glow: makeGlowMaterial(),
  };
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

class Kit {
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
    if (o.gold) { for (const s of [-1, 1]) this.cone('metal', 0.11, 0.42, cx + s * (w / 2 + ro + 0.02), yr - 0.1, cz, C.gold, { seg: 5 }); }
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
      this.cone('masonry', r, 0.34 + this.rnd() * 0.18, px, y + 0.26, pz, this.rnd() > 0.7 ? C.leaf2 : hex, { seg: 5, ao: 0.5 });
    }
  }
}

function finish(k, id, lv, H) { return k; }

// ---------------------------------------------------------------------------------------------
// the buildings. Each fn(k, lv) authors into the kit (origin = pad center, front = +z).
// ---------------------------------------------------------------------------------------------
const DESIGN = {};
// @@DESIGNS

// ---------------------------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------------------------
export const BUILDING_IDS = Object.keys(DESIGN);
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
