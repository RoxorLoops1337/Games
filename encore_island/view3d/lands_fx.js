// Encore Island 3D, lands: shared effect pieces (all GPU animated off LOOK.t, so a frame allocates nothing).
//   ringMesh   flat ground decal: ring / dashed ring / progress arc / soft glow disc (additive)
//   moteField  instanced glow or star billboards that rise (portals, beacons) or twinkle in orbit (disco ball, secrets)
//   beamMesh   open additive cone / pillar with a fading gradient and scrolling stripes
//   cloth      waving pennants (many flags merged into one draw call)
//   spriteMesh textured or glow quad, optionally facing the camera
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOOK, TAU, PI, clamp, rng, softTex, canvasTex, FONT } from './kit.js';

const fin = (m, own = true) => { m.userData.noCast = true; m.userData.noLook = true; m.userData.own = own; return m; };
const OUT = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n'; // same output path as MeshBasicMaterial (linear target in the engine, sRGB in the lab)
export const easeBack = (t) => { t = clamp(t, 0, 1); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const _c = new THREE.Color();
/** hex number or css string -> THREE.Color (new) */
export const col = (c, m = 1) => { const k = new THREE.Color(c); if (m !== 1) k.multiplyScalar(m); return k; };

// ---------------------------------------------------------------- ground rings
const RING_V = 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RING_F = `varying vec2 vP; uniform float uT, uA, uIn, uOut, uDash, uSpeed, uSoft, uProg, uGlow; uniform vec3 uCol;
void main(){
  float r = length(vP), ang = atan(vP.y, vP.x), e = max(uSoft, 0.004);
  float a = smoothstep(uIn - e, uIn + e, r) * (1.0 - smoothstep(uOut - e, uOut + e, r));
  if (uGlow > 0.0) a = pow(clamp(1.0 - r, 0.0, 1.0), uGlow);
  if (uDash > 0.5) a *= step(0.5, fract(ang / 6.2831853 * uDash + uT * uSpeed));
  if (uProg > -0.5) { float p = fract((ang + 1.5707963) / 6.2831853 + 1.0); a *= step(p, uProg); }
  gl_FragColor = vec4(uCol, a * uA);${OUT}
}`;
const _ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2);
_ringGeo.userData.sharedGeo = true;
/** o: { c, a, r (world radius), in, out (0..1 of r), dash, speed, soft, prog, glow, y, add } */
export function ringMesh(o = {}) {
  const m = fin(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uT: LOOK.t, uA: { value: o.a ?? 1 }, uIn: { value: o.in ?? 0.85 }, uOut: { value: o.out ?? 1 }, uDash: { value: o.dash ?? 0 }, uSpeed: { value: o.speed ?? 0.3 }, uSoft: { value: o.soft ?? 0.02 }, uProg: { value: o.prog ?? -1 }, uGlow: { value: o.glow ?? 0 }, uCol: { value: col(o.c ?? 0xffffff) } },
    vertexShader: RING_V, fragmentShader: RING_F }));
  const mesh = new THREE.Mesh(_ringGeo, m); mesh.userData.sharedGeo = true; mesh.scale.set(o.r ?? 1, 1, o.r ?? 1); mesh.position.y = o.y ?? 0.1; mesh.renderOrder = o.order ?? 3; mesh.userData.mat = m; mesh.userData.u = m.uniforms; return mesh;
}

// ---------------------------------------------------------------- motes (instanced billboards, motion in the vertex shader)
const MOTE_V = `attribute vec4 aSeed; uniform float uT, uH, uR, uSize, uSpeed, uSway, uMode, uCone; varying vec2 vUv; varying float vA; varying float vM;
void main(){
  vec3 p; float a;
  if (uMode < 0.5) {
    float ph = fract(aSeed.x + uT * uSpeed * (0.6 + 0.8 * aSeed.y)), ang = aSeed.z * 6.2831853, rad = sqrt(aSeed.w) * uR * (1.0 - uCone * ph);
    p = vec3(cos(ang) * rad + sin(uT * 1.5 + aSeed.x * 20.0) * uSway * ph, ph * uH, sin(ang) * rad + cos(uT * 1.3 + aSeed.y * 20.0) * uSway * ph);
    a = pow(sin(ph * 3.14159), 0.7);
  } else {
    vec3 d = normalize(vec3(aSeed.z * 2.0 - 1.0, aSeed.w * 1.4 - 0.7, aSeed.y * 2.0 - 1.0)); float w = uT * 0.6 * (aSeed.x - 0.5) * 2.0, cs = cos(w), sn = sin(w);
    d = vec3(d.x * cs + d.z * sn, d.y, -d.x * sn + d.z * cs); p = d * uR * (0.75 + 0.35 * aSeed.x) + vec3(0.0, uH, 0.0);
    a = pow(0.5 + 0.5 * sin(uT * 3.0 + aSeed.x * 40.0 + aSeed.y * 9.0), 3.0);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0); mv.xy += position.xy * uSize * (0.55 + aSeed.y * 0.9) * (0.4 + 0.6 * a);
  vUv = uv; vA = a; vM = aSeed.y; gl_Position = projectionMatrix * mv;
}`;
const MOTE_F = `varying vec2 vUv; varying float vA; varying float vM; uniform vec3 uCol, uCol2; uniform float uStar, uOpacity;
void main(){
  vec2 c = vUv - 0.5; float d = length(c) * 2.0, g = pow(max(0.0, 1.0 - d), 2.0), s = 0.0;
  if (uStar > 0.5) { s = pow(max(0.0, 1.0 - sqrt(abs(c.x * 2.0)) - sqrt(abs(c.y * 2.0))), 1.3) * 1.6; }
  float k = max(g * (uStar > 0.5 ? 0.35 : 1.0), s) * vA * uOpacity;
  gl_FragColor = vec4(mix(uCol, uCol2, vM) * 1.3, k);${OUT}
}`;
/** o: { n, h (rise), r (spread / orbit radius), size (world), speed, sway, mode: 'rise'|'orbit', cone (0..1 narrowing), c, c2, star, seed, opacity } */
export function moteField(o = {}) {
  const n = o.n ?? 16, g = new THREE.InstancedBufferGeometry(), pl = new THREE.PlaneGeometry(1, 1), r = rng(o.seed ?? 3), sd = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) sd[i] = r();
  g.index = pl.index; g.setAttribute('position', pl.attributes.position); g.setAttribute('uv', pl.attributes.uv); g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 4)); g.instanceCount = n;
  const m = fin(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: LOOK.t, uH: { value: o.h ?? 2 }, uR: { value: o.r ?? 0.5 }, uSize: { value: o.size ?? 0.14 }, uSpeed: { value: o.speed ?? 0.3 }, uSway: { value: o.sway ?? 0.15 }, uMode: { value: o.mode === 'orbit' ? 1 : 0 }, uCone: { value: o.cone ?? 0 },
      uCol: { value: col(o.c ?? 0xffffff) }, uCol2: { value: col(o.c2 ?? o.c ?? 0xffffff) }, uStar: { value: o.star ? 1 : 0 }, uOpacity: { value: o.opacity ?? 1 } },
    vertexShader: MOTE_V, fragmentShader: MOTE_F }));
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.userData.u = m.uniforms; return mesh;
}

// ---------------------------------------------------------------- beams / pillars of light
const BEAM_V = 'varying float vY; varying float vAng; void main(){ vY = uv.y; vAng = uv.x * 6.2831853; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const BEAM_F = `uniform float uT, uA, uFall, uStr, uSpd, uBase; uniform vec3 uCol; varying float vY; varying float vAng;
void main(){ float a = uA * pow(clamp(1.0 - vY, 0.0, 1.0), uFall) * smoothstep(0.0, uBase, vY) * (0.78 + 0.22 * sin(vAng * uStr + vY * 9.0 - uT * uSpd)); gl_FragColor = vec4(uCol, a);${OUT} }`;
/** open cone / pillar from y = 0 (radius r0) up to y = h (radius r1). o: { c, a, fall, stripes, spd, base, add (false = normal blending: reads on pale ground) }. The gradient runs on uv.y, so geometry may be merged / tilted freely (see beamGeo). */
export const beamGeo = (r0, r1, h, seg = 20) => new THREE.CylinderGeometry(r1, r0, h, seg, 1, true).translate(0, h / 2, 0);
export function beamMesh(r0, r1, h, o = {}) {
  const g = o.geo || beamGeo(r0, r1, h, o.seg);
  const m = fin(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uT: LOOK.t, uA: { value: o.a ?? 0.4 }, uFall: { value: o.fall ?? 1.2 }, uStr: { value: o.stripes ?? 5 }, uSpd: { value: o.spd ?? 2 }, uBase: { value: o.base ?? 0.05 }, uCol: { value: col(o.c ?? 0xffe98a) } },
    vertexShader: BEAM_V, fragmentShader: BEAM_F }));
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 5; mesh.userData.u = m.uniforms; return mesh;
}

// ---------------------------------------------------------------- waving cloth (pennants, flags): geometry local x runs 0..w from the pole
const CLOTH_V = `attribute vec3 aCol; attribute float aPh; uniform float uT; varying vec2 vUv; varying vec3 vC; varying float vW;
void main(){ vec3 p = position; float k = uv.x, w = sin(uv.x * 7.0 - uT * 5.0 + aPh); p.z += w * 0.09 * k; p.y += cos(uv.x * 5.0 - uT * 4.0 + aPh) * 0.035 * k; vW = w * k; vUv = uv; vC = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const CLOTH_F = `varying vec2 vUv; varying vec3 vC; varying float vW; uniform sampler2D uMap; uniform float uHasMap;
void main(){ vec3 c = vC * (0.9 + 0.2 * vW); if (uHasMap > 0.5) { vec4 t = texture2D(uMap, vUv); c = mix(c, t.rgb, t.a); } gl_FragColor = vec4(c, 1.0);${OUT} }`;
/** one cloth strip, vertex colour a (left/top) to b (bottom) so a pennant has a gradient; ph = wave phase */
export function clothGeo(w, h, a, b, ph = 0, seg = 8, taper = 0) {
  const g = new THREE.PlaneGeometry(w, h, seg, 2).translate(w / 2, 0, 0), p = g.attributes.position, cA = new THREE.Color(a), cB = new THREE.Color(b ?? a), n = p.count, cc = new Float32Array(n * 3), pp = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = (p.getY(i) / h) + 0.5, k = _c.copy(cA).lerp(cB, 1 - t); cc[i * 3] = k.r; cc[i * 3 + 1] = k.g; cc[i * 3 + 2] = k.b; pp[i] = ph; if (taper) p.setY(i, p.getY(i) * (1 - taper * p.getX(i) / w)); }
  g.setAttribute('aCol', new THREE.BufferAttribute(cc, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(pp, 1)); return g;
}
export function clothMesh(geo, map) {
  const m = fin(new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: false, uniforms: { uT: LOOK.t, uMap: { value: map || null }, uHasMap: { value: map ? 1 : 0 } }, vertexShader: CLOTH_V, fragmentShader: CLOTH_F }));
  const mesh = new THREE.Mesh(geo, m); mesh.castShadow = false; return mesh;
}
/** merge cloth strips placed by a matrix list: items [{ g, x, y, z, ry, s }] */
export function clothMerge(items) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), list = items.map((it) => { const g = it.g.clone(); m.compose(new THREE.Vector3(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.ry || 0, 0)), new THREE.Vector3(it.s || 1, it.s || 1, it.s || 1)); g.applyMatrix4(m); return g; });
  const g = mergeGeometries(list, false); list.forEach((x) => x.dispose()); return g;
}

// ---------------------------------------------------------------- sprites
const _mats = new Map();
/** additive soft glow (flat = lying on the ground, else a camera-facing quad). size = world width. */
export function glowSprite(c, size, o = {}) {
  const key = 'g' + new THREE.Color(c).getHex() + '|' + (o.a ?? 1) + '|' + (o.map || 'glow');
  let m = _mats.get(key); if (!m) { m = fin(new THREE.MeshBasicMaterial({ map: softTex(o.map || 'glow'), color: col(c, o.k ?? 1), transparent: true, opacity: o.a ?? 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), false); _mats.set(key, m); }
  const mesh = new THREE.Mesh(_quad(!!o.flat), m); mesh.userData.sharedGeo = true; mesh.scale.set(size, size, size); mesh.renderOrder = o.order ?? 4; mesh.userData.billboard = !o.flat; return mesh;
}
const _q0 = {}; function _quad(flat) { const k = flat ? 'f' : 'b'; if (!_q0[k]) { _q0[k] = new THREE.PlaneGeometry(1, 1); if (flat) _q0[k].rotateX(-PI / 2); _q0[k].userData.sharedGeo = true; } return _q0[k]; }
/** textured quad (icons, lettering). Own material, dispose with the owner. */
export function texSprite(map, w, h = w, o = {}) {
  const m = fin(new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: o.alphaTest ?? 0.04, depthWrite: false, fog: false, opacity: o.a ?? 1 }));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.renderOrder = o.order ?? 5; mesh.userData.billboard = o.billboard !== false; return mesh;
}
/** make every sprite flagged billboard in `root` face the camera (fixed-yaw game camera: copying the quaternion is exact) */
export function faceCamera(root, camera) {
  if (!camera) return;
  root.traverse((o) => { if (o.userData.billboard && o.parent) { o.parent.getWorldQuaternion(_wq); o.quaternion.copy(_wq).invert().multiply(camera.quaternion); } });
}
const _wq = new THREE.Quaternion();

/** small canvas lettering texture (numbers on flags, '?' stickers); empty headless */
export function textTex(txt, c1 = '#fff4c0', c2 = '#ffc83a', size = 96) {
  return canvasTex(128, 128, (g, w, h) => {
    g.font = `900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.strokeStyle = '#2d170f'; g.lineWidth = size * 0.3; g.strokeText(txt, w / 2, h / 2 + 4); g.strokeStyle = '#fff4e6'; g.lineWidth = size * 0.14; g.strokeText(txt, w / 2, h / 2 + 4);
    const gr = g.createLinearGradient(0, h / 2 - size / 2, 0, h / 2 + size / 2); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillText(txt, w / 2, h / 2 + 4);
  });
}
/** dispose geometry (unless flagged sharedGeo) and the materials this file created per owner (userData.own); shared kit / cached glow materials stay alive */
export function disposeDeep(o) {
  o.traverse((n) => { if (n.geometry && !n.userData.sharedGeo) n.geometry.dispose(); const m = n.material; if (m && !Array.isArray(m) && m.userData.own) { if (m.map && m.userData.ownMap) m.map.dispose(); m.dispose(); } });
}

/** plate3d draws the sign icon / level badge a hair INSIDE the sign's front face when r < ~0.9 (icon z = 0.2 * sr, face at z = 0.11), so they vanish. Push them out. */
export function fixPlate(p) { if (p && p.sign) p.sign.children.forEach((c) => { if (c.renderOrder >= 4) c.position.z = Math.max(c.position.z, 0.14); }); return p; }
