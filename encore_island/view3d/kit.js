// Encore Island 3D, shared kit. Every model module builds with this so the whole island shares one look and one budget.
//   * W / palette / rng / colour helpers / canvas textures
//   * installLook(): one global shading patch (cloud shadows, rim light, beat pulse) for every MeshStandardMaterial
//   * Builder: declarative "box / ball / cyl ..." parts merged into one vertex-coloured mesh per material (few draw calls)
//   * outline, blob shadows, light rig, moods, pooled instancing, disposal
// Y is up. The 2D game maps x -> x, y -> z at W = 0.02 (one world unit is 50 px).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const W = 0.02, TAU = Math.PI * 2, PI = Math.PI, INK = 0x2d170f;
export const C = {
  ink: 0x2d170f, cream: 0xfff4e6, pink: 0xff7eb6, hotPink: 0xff4d8d, mint: 0x9af0b4, green: 0x6fd36a, gold: 0xffd84d, orange: 0xff9a2e,
  violet: 0x7a5cd8, deepViolet: 0x3a2a86, teal: 0x46c8c0, sky: 0x8fe3f0, deepSea: 0x4fb4d4, blossom: 0xff9cc6, blossom2: 0xffc2dc,
  sand: 0xf6e7c8, stone: 0xaeb6c8, wood: 0x9a6a48, grass: 0xa4e59c, grass2: 0x7fd66e, cliff: 0x8a6ac0, white: 0xffffff,
};
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth = (u) => u * u * (3 - 2 * u);
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const hash01 = (n) => { let x = (n | 0) * 374761393 + 668265263; x = (x ^ (x >>> 13)) * 1274126177; x = x ^ (x >>> 16); return (x >>> 0) / 4294967296; };
export const hex = (n) => '#' + (typeof n === 'number' ? n.toString(16).padStart(6, '0') : String(n).replace('#', ''));
const _ca = new THREE.Color(), _cb = new THREE.Color();
/** mix two colours (hex numbers or css strings) into a NEW THREE.Color */
export function mixc(a, b, t) { _ca.set(a); _cb.set(b); return _ca.clone().lerp(_cb, clamp(t, 0, 1)); }
/** colour with a little lightness jitter, for natural variation */
export function jc(c, amt = 0.08, r = Math.random) { const k = new THREE.Color(c); const o = (r() - 0.5) * 2 * amt; return k.offsetHSL((r() - 0.5) * amt * 0.25, 0, o); }

// ---------------------------------------------------------------- quality knobs (the engine sets these before models build)
/** detail 0 = low, 1 = medium, 2 = high; `seg(n)` scales a segment count. Models should build ONCE at the detail current at build time. */
export const Q = { detail: 2, shadows: true, tier: 'high' };
export const seg = (n) => Math.max(3, Math.round(n * (Q.detail === 0 ? 0.55 : Q.detail === 1 ? 0.85 : 1.15)));
export const icoDetail = (n) => Math.max(0, Math.min(4, n + (Q.detail === 0 ? -1 : Q.detail === 1 ? 0 : 1)));

// ---------------------------------------------------------------- canvas textures (guarded so headless tests can build models without a DOM)
export const HAS_DOM = typeof document !== 'undefined' && !!document.createElement;
export function canvasTex(w, h, draw, opt = {}) {
  if (!HAS_DOM) { const t = new THREE.Texture(); t.userData.headless = true; return t; }
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opt.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opt.aniso || 4; t.generateMipmaps = opt.mip !== false; t.minFilter = opt.mip === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
export function rrPath(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function starPath(g, cx, cy, ro, ri, n = 5, rot = -PI / 2) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i / (n * 2) * TAU, r = i % 2 ? ri : ro, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); }
export const FONT = '"Arial Rounded MT Bold","Trebuchet MS","Segoe UI",system-ui,-apple-system,sans-serif';
export function fitFont(g, txt, maxW, size) { g.font = `900 ${size}px ${FONT}`; const w = g.measureText(txt).width; return w > maxW ? size * maxW / w : size; }
/** glossy sticker lettering: ink outline, cream rim, candy gradient fill (same look as the 2D game's stickerText) */
export function stickerText(g, txt, cx, cy, size, c1, c2, sw = size * 0.2) {
  g.font = `900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
  g.strokeStyle = '#2d170f'; g.lineWidth = sw + 10; g.strokeText(txt, cx, cy + size * 0.07); g.lineWidth = sw; g.strokeText(txt, cx, cy);
  g.strokeStyle = '#fff4e6'; g.lineWidth = sw * 0.55; g.strokeText(txt, cx, cy);
  const gr = g.createLinearGradient(0, cy - size * 0.5, 0, cy + size * 0.5); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillText(txt, cx, cy);
}
/** soft round gradient sprite texture, shared (glows, blob shadows, particles) */
const _soft = {};
export function softTex(kind = 'glow') {
  if (_soft[kind]) return _soft[kind];
  return (_soft[kind] = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    if (kind === 'shadow') { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
    else if (kind === 'ring') { gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.72, 'rgba(255,255,255,0)'); gr.addColorStop(0.86, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
    else { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { mip: false }));
}

// ---------------------------------------------------------------- the look: shared uniforms + one patch for every MeshStandardMaterial
/** Shared, live uniforms. The engine writes them every frame; models may read `LOOK.beat.value` (0..1 pulse on each beat). */
export const LOOK = {
  t: { value: 0 }, beat: { value: 0 }, cloud: { value: 0.32 }, rim: { value: new THREE.Color(0x8fd8ff) }, rimAmt: { value: 0.55 },
  warm: { value: new THREE.Color(0xffd9a0) }, // sun-facing bounce
};
const LK_GLSL = `
varying vec3 vLkW;
uniform float uLkT; uniform float uLkBeat; uniform float uLkCloud; uniform vec3 uLkRim; uniform float uLkRimAmt;
float lkH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lkN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lkH(i), lkH(i + vec2(1.0, 0.0)), f.x), mix(lkH(i + vec2(0.0, 1.0)), lkH(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
let _lookOn = false;
/** Patch MeshStandardMaterial once, before any material compiles. Idempotent. Materials with userData.noLook skip it. */
export function installLook() {
  if (_lookOn) return; _lookOn = true;
  const proto = THREE.MeshStandardMaterial.prototype;
  const patch = function (shader) {
    if (this.userData && this.userData.noLook) return;
    shader.uniforms.uLkT = LOOK.t; shader.uniforms.uLkBeat = LOOK.beat; shader.uniforms.uLkCloud = LOOK.cloud; shader.uniforms.uLkRim = LOOK.rim; shader.uniforms.uLkRimAmt = LOOK.rimAmt;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLkW;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 lkp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            lkp = instanceMatrix * lkp;
          #endif
          vLkW = (modelMatrix * lkp).xyz; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LK_GLSL)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          if (uLkCloud > 0.001) {
            vec2 q = vLkW.xz * 0.05 + vec2(uLkT * 0.022, uLkT * 0.012);
            float n = lkN(q) * 0.62 + lkN(q * 2.31 + 7.1) * 0.38;
            float sh = smoothstep(0.46, 0.66, n) * uLkCloud;
            reflectedLight.directDiffuse *= 1.0 - sh; reflectedLight.directSpecular *= 1.0 - sh;
          }
          vec3 lkN3 = normalize(normal); float fr = pow(1.0 - clamp(dot(lkN3, normalize(vViewPosition)), 0.0, 1.0), 2.4);
          reflectedLight.indirectDiffuse += uLkRim * fr * uLkRimAmt * (0.5 + 0.5 * lkN3.y) * (0.7 + 0.5 * uLkBeat);
        }`);
  };
  proto.onBeforeCompile = patch;
  proto.customProgramCacheKey = function () { return (this.userData && this.userData.noLook) ? 'nolook' : 'look1'; };
}

// ---------------------------------------------------------------- materials
const _m = new Map();
/** cached lit material. opts: { vc: vertex colours, flat, rough, metal, emissive, ei, side, transparent, opacity, noCast } */
export function lit(color = 0xffffff, o = {}) {
  const key = [color, o.vc ? 1 : 0, o.flat ? 1 : 0, o.rough ?? 0.8, o.metal ?? 0, o.emissive ?? 0, o.ei ?? 0, o.side ?? 0, o.opacity ?? 1].join('|');
  let m = _m.get(key); if (m) return m;
  m = new THREE.MeshStandardMaterial({ color: o.vc ? 0xffffff : color, vertexColors: !!o.vc, flatShading: !!o.flat, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 0, side: o.side ?? THREE.FrontSide, transparent: (o.opacity ?? 1) < 1 || !!o.transparent, opacity: o.opacity ?? 1 });
  if (o.noCast) m.userData.noCast = true;
  _m.set(key, m); return m;
}
/** vertex-coloured smooth / faceted solids (the Builder default buckets) */
export const SOLID = lit(0xffffff, { vc: true });
export const FLAT = lit(0xffffff, { vc: true, flat: true });
export const SHINY = lit(0xffffff, { vc: true, rough: 0.3, metal: 0.25 });
export const GOLD = lit(0xffffff, { vc: true, rough: 0.28, metal: 0.3, emissive: 0x6a4000, ei: 0.5 });
export const SOFT = lit(0xffffff, { vc: true, rough: 1 });
/** unlit glowing material (colour may exceed 1 so bloom picks it up): glow(1.9, 1.3, 0.5) */
const _g = new Map();
export function glow(r = 1, g = 1, b = 1, o = {}) {
  const key = [r, g, b, o.opacity ?? 1, o.add ? 1 : 0, o.vc ? 1 : 0].join('|'); let m = _g.get(key); if (m) return m;
  m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: (o.opacity ?? 1) < 1 || !!o.add, opacity: o.opacity ?? 1, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add && (o.opacity ?? 1) >= 1, vertexColors: !!o.vc, fog: o.fog !== false, side: o.side ?? THREE.FrontSide });
  m.userData.noCast = true; _g.set(key, m); return m;
}

// ---------------------------------------------------------------- shape helpers
const _gc = new Map();
/** cache a geometry by key (always returned non-indexed so Builders can merge it) */
export function G(key, fn) { let g = _gc.get(key); if (!g) { g = fn(); if (g.index) g = g.toNonIndexed(); for (const k of ['uv', 'uv1']) if (!(g.userData && g.userData.keepUv)) g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); _gc.set(key, g); } return g; }
export const GB = {
  box: () => G('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (n, rt = 1) => G('cyl' + n + '_' + rt, () => new THREE.CylinderGeometry(rt, 1, 1, n)),
  tube: (n) => G('tube' + n, () => new THREE.CylinderGeometry(1, 1, 1, n, 1, true)),
  cone: (n) => G('cone' + n, () => new THREE.ConeGeometry(1, 1, n)),
  ico: (d) => G('ico' + d, () => new THREE.IcosahedronGeometry(1, d)),
  oct: () => G('oct', () => new THREE.OctahedronGeometry(1, 0)),
  tor: (tube, n, s) => G('tor' + tube + '_' + n + '_' + s, () => new THREE.TorusGeometry(1, tube, n, s)),
  sph: (w, h) => G('sph' + w + '_' + h, () => new THREE.SphereGeometry(1, w, h)),
  /** unit rounded box (size 1, corner radius r as a fraction of the box); smooth normals, `s` segments per corner */
  rbox: (r = 0.18, s = 3) => G('rbox' + r + '_' + s, () => roundedBoxGeo(1, 1, 1, r, s)),
};
/** rounded box built from a subdivided cube pushed to a rounded shape. Medium-poly friendly bevels for buildings and props. */
export function roundedBoxGeo(w, h, d, r = 0.1, s = 3) {
  const g = new THREE.BoxGeometry(1, 1, 1, s * 2, s * 2, s * 2), p = g.attributes.position, v = new THREE.Vector3(), q = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).multiplyScalar(2); // -1..1 cube
    q.set(clamp(v.x * w / 2, -hx, hx), clamp(v.y * h / 2, -hy, hy), clamp(v.z * d / 2, -hz, hz));
    const n = v.clone().multiplyVectors(v, new THREE.Vector3(w / 2, h / 2, d / 2)).sub(q); if (n.lengthSq() < 1e-9) n.set(0, 1, 0); n.normalize();
    p.setXYZ(i, q.x + n.x * r, q.y + n.y * r, q.z + n.z * r);
  }
  g.computeVertexNormals(); return g;
}
/** lathe from a [[radius, y], ...] profile (towers, vases, lamp posts, bells) */
export function latheGeo(profile, n = 16) { return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), n); }
/** icosphere with smooth low-frequency noise; for rocks, bushes, clouds, tree crowns (faceted when toNonIndexed + flat material) */
export function blobGeo(detail = 2, amp = 0.12, seed = 1, sy = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, r = rng(seed), ph = [r() * 6, r() * 6, r() * 6], v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); const k = 1 + amp * (Math.sin(v.x * 3.1 + ph[0]) + Math.sin(v.y * 2.7 + ph[1]) + Math.sin(v.z * 3.4 + ph[2])) / 3; p.setXYZ(i, v.x * k, v.y * k * sy, v.z * k); }
  g.computeVertexNormals(); return g;
}
export function rrShape(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
export function starShape(n, ro, ri) { const s = new THREE.Shape(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU + PI / 2, r = i % 2 ? ri : ro, x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
/** beveled extrusion centred on z = 0 (cache key required) */
export function extr(shape, depth, bev, key) { return G(key, () => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: seg(8) }); g.translate(0, 0, -depth / 2); return g; }); }

// ---------------------------------------------------------------- Builder: merged vertex-coloured models
const UP = new THREE.Vector3(0, 1, 0);
const _mat = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
/**
 * Declarative model builder. Parts are appended in the builder's current local frame (`at(x,y,z,yaw)` / `local(fn)`),
 * coloured per vertex, and merged into ONE mesh per material on build(). Colours: a number, or { m: material, c: colour } to choose a bucket.
 *   const b = new Builder(); b.rbox(0xff7eb6, 0, 0.5, 0, 1, 1, 1, 0.12); b.ball(C.gold, 0, 1.2, 0, 0.3); const group = b.build();
 * Part helpers take (colour, x, y, z, ...size, rx, ry, rz). The `b*` forms sit ON the ground (y is the bottom).
 */
export class Builder {
  constructor(o = {}) { this.buckets = new Map(); this.org = new THREE.Matrix4(); this.ao = o.ao ?? 0.22; this.smoothDefault = o.smooth !== false; this.stack = []; }
  at(x = 0, y = 0, z = 0, yaw = 0) { this.org.compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, yaw), _one); return this; }
  /** run fn in a sub-frame, then restore */
  local(x, y, z, yaw, fn) { const so = this.org.clone(); this.org.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw || 0), _one)); fn(this); this.org.copy(so); return this; }
  part(g, c, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    const bucket = typeof c === 'object' && c.m ? c.m : (this.smoothDefault ? SOLID : FLAT), col = typeof c === 'object' && c.m ? c.c : c;
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _mat.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); _mat.premultiply(this.org);
    const n = g.attributes.position.count, out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.attributes.position.array), 3));
    out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.attributes.normal.array), 3));
    out.applyMatrix4(_mat);
    if (bucket.vertexColors) { const k = new THREE.Color(col), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; } out.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    let list = this.buckets.get(bucket); if (!list) this.buckets.set(bucket, list = []); list.push(out); return this;
  }
  box(c, x, y, z, w, h, d, rx, ry, rz) { return this.part(GB.box(), c, x, y, z, w, h, d, rx, ry, rz); }
  bbox(c, x, y, z, w, h, d, rx, ry, rz) { return this.part(GB.box(), c, x, y + h / 2, z, w, h, d, rx, ry, rz); }
  /** rounded box centred at (x,y,z); r = corner radius as a fraction of the smallest side */
  rbox(c, x, y, z, w, h, d, r = 0.15, ry = 0, rx = 0, rz = 0) { const k = Math.min(w, h, d) * r, key = 'rb' + w.toFixed(3) + '_' + h.toFixed(3) + '_' + d.toFixed(3) + '_' + k.toFixed(3) + '_' + Q.detail; return this.part(G(key, () => roundedBoxGeo(w, h, d, k, Q.detail >= 2 ? 3 : 2)), c, x, y, z, 1, 1, 1, rx, ry, rz); }
  brbox(c, x, y, z, w, h, d, r = 0.15, ry = 0) { return this.rbox(c, x, y + h / 2, z, w, h, d, r, ry); }
  cyl(c, x, y, z, r, h, n = seg(14), rt = 1) { return this.part(GB.cyl(n, rt), c, x, y + h / 2, z, r, h, r, 0, 0, 0); }
  cylc(c, x, y, z, r, h, n = seg(14), rx = 0, ry = 0, rz = 0, rt = 1, sz) { return this.part(GB.cyl(n, rt), c, x, y, z, r, h, sz || r, rx, ry, rz); }
  cone(c, x, y, z, r, h, n = seg(12)) { return this.part(GB.cone(n), c, x, y + h / 2, z, r, h, r, 0, 0, 0); }
  conec(c, x, y, z, r, h, n = seg(12), rx = 0, ry = 0, rz = 0) { return this.part(GB.cone(n), c, x, y, z, r, h, r, rx, ry, rz); }
  ball(c, x, y, z, r, sy = 1, sz, d = icoDetail(1)) { return this.part(GB.ico(d), c, x, y, z, r, r * sy, sz ? r * sz : r, 0, 0, 0); }
  sph(c, x, y, z, r, sy = 1, sz) { return this.part(GB.sph(seg(16), seg(12)), c, x, y, z, r, r * sy, sz ? r * sz : r, 0, 0, 0); }
  tor(c, x, y, z, R, tube, n = seg(8), s = seg(20), rx = 0, ry = 0, rz = 0) { return this.part(GB.tor(tube / R, n, s), c, x, y, z, R, R, R, rx, ry, rz); }
  shape(g, c, x, y, z, s = 1, rx = 0, ry = 0, rz = 0) { return this.part(g.index ? g.toNonIndexed() : g, c, x, y, z, s, s, s, rx, ry, rz); }
  lathe(c, profile, x, y, z, n = seg(18)) { const key = 'lathe' + profile.flat().join(',') + n; return this.part(G(key, () => latheGeo(profile, n)), c, x, y, z, 1, 1, 1); }
  /** a flat-ish disc on the ground (paving, plates): radius r, thickness h */
  disc(c, x, y, z, r, h = 0.05, n = seg(40)) { return this.cyl(c, x, y, z, r, h, n); }
  /** build the merged group. Vertex colours get a soft bottom-to-top ambient-occlusion gradient (strength `ao`). */
  build(o = {}) {
    const grp = new THREE.Group(); const aoK = o.ao ?? this.ao;
    for (const [mat, list] of this.buckets) {
      const geom = mergeGeometries(list, false); list.forEach((d) => d.dispose());
      if (aoK > 0 && mat.vertexColors && geom.attributes.color) { geom.computeBoundingBox(); const bb = geom.boundingBox, y0 = bb.min.y, hh = Math.max(0.001, bb.max.y - y0), pp = geom.attributes.position, cc = geom.attributes.color;
        for (let i = 0; i < pp.count; i++) { const k = 1 - aoK * Math.pow(1 - (pp.getY(i) - y0) / hh, 1.6); cc.setXYZ(i, cc.getX(i) * k, cc.getY(i) * k, cc.getZ(i) * k); } }
      const m = new THREE.Mesh(geom, mat); m.castShadow = !mat.userData.noCast && o.cast !== false; m.receiveShadow = !!mat.isMeshStandardMaterial && o.receive !== false; grp.add(m);
    }
    this.buckets.clear(); return grp;
  }
  /** merged BufferGeometry of the first bucket only (for instancing). Disposes nothing shared. */
  geometry() { const list = [...this.buckets.values()][0]; const g = mergeGeometries(list, false); list.forEach((d) => d.dispose()); this.buckets.clear(); return g; }
}

// ---------------------------------------------------------------- outlines (the 2D game's inked silhouette)
const _ol = new Map();
/** back-face hull material: thickness in world units, extruded along the normal in the vertex shader (one shared material per colour+width) */
export function outlineMat(color = INK, width = 0.03) {
  const key = color + '|' + width; let m = _ol.get(key); if (m) return m;
  m = new THREE.ShaderMaterial({ side: THREE.BackSide, fog: false, uniforms: { uC: { value: new THREE.Color(color) }, uW: { value: width } },
    vertexShader: 'uniform float uW; void main(){ vec3 p = position + normalize(normal) * uW; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }' });
  m.userData.noCast = true; m.userData.noLook = true; _ol.set(key, m); return m;
}
/** add an inked hull to a mesh (no-op for geometry without normals). Returns the hull mesh. */
export function addOutline(mesh, width = 0.03, color = INK) { const h = new THREE.Mesh(mesh.geometry, outlineMat(color, width)); h.castShadow = false; h.receiveShadow = false; h.renderOrder = -1; mesh.add(h); return h; }

// ---------------------------------------------------------------- blob shadows (cheap grounding for anything that does not earn a shadow-map cast)
/** One instanced draw call for many soft contact shadows. `add(x, z, radius, alpha, y)` per frame between begin() and end(). */
export class BlobShadows {
  constructor(max = 256) {
    this.max = max; this.n = 0;
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: softTex('shadow'), color: 0x1a0a3a, transparent: true, depthWrite: false, opacity: 1, fog: false });
    mat.userData.noCast = true; mat.userData.noLook = true;
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false; this.mesh.renderOrder = -2; this.mesh.count = 0;
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); geo.setAttribute('aA', this.alpha);
    mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aA; varying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vA;'); };
    mat.customProgramCacheKey = () => 'blob';
    this._m = new THREE.Matrix4();
  }
  begin() { this.n = 0; }
  add(x, z, r, a = 0.35, y = 0.03) { if (this.n >= this.max) return; this._m.makeScale(r * 2, 1, r * 2); this._m.setPosition(x, y, z); this.mesh.setMatrixAt(this.n, this._m); this.alpha.setX(this.n, a); this.n++; }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true; }
}

// ---------------------------------------------------------------- light rig + moods
/** A mood is a plain object; moods blend with lerpMood(). Environment supplies one per biome. */
export const DEFAULT_MOOD = { skyTop: '#5fb8e8', skyMid: '#a8e4f4', skyLow: '#fff1d8', fog: '#bfe8f4', fogNear: 60, fogFar: 190, sun: '#fff0d0', sunI: 2.5, sunDir: [-0.45, 0.8, 0.4], hemiSky: '#cfe8ff', hemiGround: '#e6c8ff', hemiI: 0.9, exposure: 1.05, rim: '#8fd8ff', water: '#46c8d0', waterDeep: '#2a8ab8' };
const _lc = new THREE.Color();
export function lerpMood(a, b, t, out = {}) {
  for (const k in a) { const va = a[k], vb = b[k]; if (typeof va === 'number') out[k] = lerp(va, vb, t); else if (typeof va === 'string') out[k] = '#' + _lc.set(va).lerp(new THREE.Color(vb), t).getHexString(); else if (Array.isArray(va)) out[k] = va.map((x, i) => lerp(x, vb[i], t)); else out[k] = va; }
  return out;
}
/** Sun + hemisphere + optional shadows that follow a focus point on a texel grid (no shimmer). */
export function makeLightRig(scene, o = {}) {
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xe6c8ff, 0.9), sun = new THREE.DirectionalLight(0xfff0d0, 2.5);
  const ext = o.extent ?? 26, size = o.size ?? 2048;
  sun.castShadow = !!o.shadows; sun.shadow.mapSize.set(size, size);
  const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 120; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2.5;
  scene.add(hemi, sun, sun.target);
  const dir = new THREE.Vector3(-0.45, 0.8, 0.4).normalize(), focus = new THREE.Vector3();
  const rig = { hemi, sun, dir, ext,
    follow(x, z) { const texel = (ext * 2) / size * 8; focus.set(Math.round(x / texel) * texel, 0, Math.round(z / texel) * texel); sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(dir, 60); sun.target.updateMatrixWorld(); },
    setShadows(on, mapSize) { sun.castShadow = !!on; if (mapSize && mapSize !== sun.shadow.mapSize.x) { sun.shadow.mapSize.set(mapSize, mapSize); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } },
    apply(m) { sun.color.set(m.sun); sun.intensity = m.sunI; dir.set(m.sunDir[0], m.sunDir[1], m.sunDir[2]).normalize(); hemi.color.set(m.hemiSky); hemi.groundColor.set(m.hemiGround); hemi.intensity = m.hemiI; LOOK.rim.value.set(m.rim); if (scene.fog) { scene.fog.color.set(m.fog); scene.fog.near = m.fogNear; scene.fog.far = m.fogFar; } } };
  return rig;
}

// ---------------------------------------------------------------- pooled instancing
/** A fixed-size InstancedMesh with free-list slots: add() -> id, set(id, x,y,z, yaw, scale, colour?), remove(id). `count` stays minimal. */
export class InstPool {
  constructor(geo, mat, max = 64, o = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.count = 0; this.max = max; this.free = []; this.top = 0; this.live = new Uint8Array(max);
    this.mesh.castShadow = o.cast ?? false; this.mesh.receiveShadow = o.receive ?? false; this.mesh.frustumCulled = false; this._m = new THREE.Matrix4();
    if (o.colors) { this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); }
  }
  add() { const id = this.free.length ? this.free.pop() : this.top++; if (id >= this.max) { this.top = this.max; return -1; } this.live[id] = 1; if (id + 1 > this.mesh.count) this.mesh.count = id + 1; return id; }
  set(id, x, y, z, yaw = 0, sx = 1, sy = sx, sz = sx, col) { if (id < 0) return; _q.setFromAxisAngle(UP, yaw); this._m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); this.mesh.setMatrixAt(id, this._m); if (col !== undefined && this.mesh.instanceColor) this.mesh.setColorAt(id, col); this.dirty = true; }
  remove(id) { if (id < 0 || !this.live[id]) return; this.live[id] = 0; this._m.makeScale(0, 0, 0); this.mesh.setMatrixAt(id, this._m); this.free.push(id); this.dirty = true; }
  flush() { if (!this.dirty) return; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; this.dirty = false; }
}
/** Dispose geometry + (non shared) textures of a subtree. Shared kit materials are never disposed. */
export function disposeTree(o) { o.traverse((n) => { if (n.geometry && !n.userData.sharedGeo) n.geometry.dispose(); }); }
export const _tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), v2: new THREE.Vector3(), c: new THREE.Color(), up: UP };
export { THREE };
