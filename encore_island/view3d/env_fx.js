// Encore Island 3D environment: ambience. One GPU Points system around the focus (petals, pollen, dust, snow, sparkles, leaves, fireflies, confetti by
// biome, positions computed in the vertex shader from a seed and time, so the CPU does nothing per particle) and the cloud mist over the next locked land.
import * as THREE from 'three';
import * as kit from './kit.js';
import { W, outline } from './env_util.js';
import { makeCloudMat, tintCloud, cloudTex } from './env_sky.js';

// kind table by biome: vel (x, y, z units/s), sway amplitude, size (world), box (half extents x, y, z), y centre, shape 0 soft round / 1 tumbling ellipse / 2 spark, additive, colours, density
const KINDS = [
  { vel: [-0.35, -0.55, 0.15], sway: 1.1, size: 0.3, shape: 1, add: 0, cols: ['#ffc2dc', '#ffffff', '#ff9cc6'], dens: 0.8 },       // Blossom Bay: petals
  { vel: [0.25, 0.12, 0.1], sway: 0.9, size: 0.2, shape: 0, add: 0, cols: ['#ffffff', '#d4fff4', '#c6a8ff'], dens: 0.7 },             // Mint Meadow: pollen and seeds
  { vel: [1.4, 0.05, -0.25], sway: 0.35, size: 0.17, shape: 2, add: 1, cols: ['#ffd08a', '#fff0c8', '#ffb070'], dens: 0.75 },         // Sunset Dunes: wind-blown glitter
  { vel: [-0.3, -1.1, 0.12], sway: 0.8, size: 0.24, shape: 0, add: 0, cols: ['#ffffff', '#f2faff', '#d8eeff'], dens: 1.25 },            // Frost Fjord: flurries
  { vel: [0.0, 0.3, 0.0], sway: 0.7, size: 0.3, shape: 2, add: 1, cols: ['#ff9ad2', '#ffe98a', '#c6a8ff'], dens: 0.7 },               // Candy Canyon: rising sparkles
  { vel: [-0.3, -0.45, 0.2], sway: 1.2, size: 0.32, shape: 1, add: 0, cols: ['#8fdc4a', '#c8f07a', '#6cc26e'], dens: 0.55 },            // Lime Lagoon: whirling leaves
  { vel: [0.0, 0.0, 0.0], sway: 1.0, size: 0.36, shape: 2, add: 1, cols: ['#a8fff4', '#fff4a0', '#ff9ad2'], dens: 0.75, fly: 1 },       // Neon Night: fireflies
  { vel: [0.12, 0.28, 0.0], sway: 0.6, size: 0.26, shape: 2, add: 1, cols: ['#ffe48e', '#fff8d0', '#ffb640'], dens: 0.8 },             // Gold Gala: gold glitter
];
const PV = `
attribute vec4 aS; uniform float uT, uScale, uSize, uFade, uSway, uFly; uniform vec3 uFocus, uBox, uVel; uniform float uYc;
varying vec3 vCol; varying float vA, vRot; uniform vec3 uC0, uC1, uC2;
void main(){
  vec3 b = aS.xyz; float t = uT, ph = aS.w * 40.0; vec3 p;
  if (uFly > 0.5) { // fireflies: loiter on a lissajous around a fixed anchor
    vec3 a0 = b * uBox * 2.0; p = a0 + vec3(sin(t * 0.6 + ph) + sin(t * 1.3 + ph * 2.0) * 0.4, sin(t * 0.8 + ph * 1.7) * 0.5, cos(t * 0.5 + ph * 1.3) + cos(t * 1.1 + ph) * 0.4) * uSway;
  } else {
    p = b * uBox * 2.0 + uVel * t * (0.6 + aS.w * 0.8); p.x += sin(t * (0.7 + aS.x) + ph) * uSway; p.z += cos(t * (0.6 + aS.z) + ph * 1.3) * uSway * 0.7; p.y += sin(t * 1.1 + ph) * uSway * 0.15;
  }
  vec3 o = uFocus + vec3(0.0, uYc, 0.0); p = o + mod(p - o + uBox, uBox * 2.0) - uBox; p.y = max(p.y, 0.08);
  vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float k = aS.w < 0.33 ? 0.0 : aS.w < 0.66 ? 1.0 : 2.0; vCol = k < 0.5 ? uC0 : k < 1.5 ? uC1 : uC2;
  float edge = 1.0 - smoothstep(0.55, 1.0, length((p - o) / uBox)); float blink = uFly > 0.5 ? (0.25 + 0.75 * pow(0.5 + 0.5 * sin(t * (1.5 + aS.w * 2.5) + ph), 2.0)) : (0.65 + 0.35 * sin(t * 2.0 + ph));
  vA = uFade * edge * blink; vRot = t * (0.8 + aS.x * 1.5) + ph; gl_PointSize = clamp(uSize * (0.6 + aS.x * 0.9) * uScale / max(0.5, -mv.z), 1.0, 90.0);
}`;
const PF = `
varying vec3 vCol; varying float vA, vRot; uniform float uShape;
void main(){
  vec2 q = gl_PointCoord - 0.5; float a;
  if (uShape < 0.5) a = smoothstep(0.5, 0.15, length(q));
  else if (uShape < 1.5) { float c = cos(vRot), s = sin(vRot); vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * vec2(1.0, 1.0 + 1.6 * abs(sin(vRot * 0.5))); a = smoothstep(0.5, 0.36, length(r * vec2(0.8, 1.7))); }
  else { float d = length(q); a = smoothstep(0.5, 0.0, d); a = a * a + smoothstep(0.1, 0.0, min(abs(q.x), abs(q.y))) * smoothstep(0.5, 0.0, d) * 0.8; }
  gl_FragColor = vec4(vCol * (uShape > 1.5 ? 1.6 : 1.0), a * vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createAmbient(V) {
  const N = kit.Q.detail === 0 ? 120 : kit.Q.detail === 1 ? 240 : 380, geo = new THREE.BufferGeometry(), r = kit.rng(5), seed = new Float32Array(N * 4), pos = new Float32Array(N * 3);
  for (let i = 0; i < N * 4; i++) seed[i] = r(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aS', new THREE.BufferAttribute(seed, 4)); geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const U = { uT: kit.LOOK.t, uScale: { value: 600 }, uSize: { value: 0.15 }, uFade: { value: 0 }, uSway: { value: 1 }, uFly: { value: 0 }, uFocus: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(17, 5, 15) }, uVel: { value: new THREE.Vector3() }, uYc: { value: 3 }, uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uShape: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, fog: false }); mat.userData.noCast = true; mat.userData.noLook = true;
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 10; pts.name = 'ambient'; pts.userData.noBake = true;
  let kind = -1, want = 0, fade = 0; const sz = new THREE.Vector2();
  function apply(k) { const K = KINDS[k]; kind = k; U.uVel.value.set(K.vel[0], K.vel[1], K.vel[2]); U.uSway.value = K.sway; U.uSize.value = K.size; U.uShape.value = K.shape; U.uFly.value = K.fly || 0; U.uC0.value.set(K.cols[0]); U.uC1.value.set(K.cols[1]); U.uC2.value.set(K.cols[2]);
    mat.blending = K.add ? THREE.AdditiveBlending : THREE.NormalBlending; U.uBox.value.set(17, K.fly ? 3.2 : 5.2, 15); U.uYc.value = K.fly ? 1.6 : 3.2; geo.setDrawRange(0, Math.round(N * K.dens * Math.min(1, Math.max(0.15, V.quality && V.quality.particles !== undefined ? V.quality.particles : 1)))); mat.needsUpdate = true; }
  return {
    points: pts,
    /** bi: biome index of the island nearest the focus */
    update(dt, t, focus, cam, bi, renderer) {
      if (bi !== want) want = bi; if (kind !== want) { fade -= dt * 3; if (fade <= 0) { fade = 0; apply(want); } } else fade = Math.min(1, fade + dt * 1.5);
      U.uFade.value = fade * (kit.Q.detail === 0 ? 0.8 : 1); U.uFocus.value.set(focus.x, 0, focus.z);
      const h = renderer && renderer.getDrawingBufferSize ? renderer.getDrawingBufferSize(sz).y : 700; U.uScale.value = h * 0.5 * cam.projectionMatrix.elements[5];
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// ---- mist over the next, still locked land: a tinted ghost of its footprint under a bank of soft white puffs (the lock and the name are the HUD's job)
export function createMist(V) {
  const grp = new THREE.Group(); grp.name = 'mist'; grp.visible = false; let cur = -1, pu = null, ghost = null, puffs = null;
  const ct = cloudTex(), { mat: mm, U: mu } = makeCloudMat(ct, 0, 1); mu.uO.value = 0.93; const pg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const gm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); gm.userData.noCast = true; gm.userData.noLook = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), seeds = [];
  const NP = 34, rr = kit.rng(31); for (let i = 0; i < NP; i++) seeds.push({ a: rr() * 6.28, d: Math.sqrt(rr()) * 0.8, s: 1.8 + rr() * 2.0, ph: rr() * 6.28, y: rr() });
  function set(k) {
    if (k === cur) return; cur = k; if (puffs) { grp.remove(puffs); puffs.dispose(); puffs = null; } if (ghost) { grp.remove(ghost); ghost.geometry.dispose(); ghost = null; }
    if (k < 1) { grp.visible = false; return; }
    const g = geoOf(k), B = biomeOf(k), o = outline(g, 2), n = o.length / 2, pos = [], idx = [];
    pos.push(0, 0, 0); for (let i = 0; i < n; i++) pos.push(o[i * 2] * 0.96, 0, o[i * 2 + 1] * 0.96); for (let i = 0; i < n; i++) idx.push(0, 1 + (i + 1) % n, 1 + i);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setIndex(idx); gm.color.set(B.deep).lerp(new THREE.Color(0xffffff), 0.35);
    ghost = new THREE.Mesh(gg, gm); ghost.position.set(g.x * W, 0.02, g.y * W); ghost.renderOrder = -2; grp.add(ghost);
    puffs = new THREE.InstancedMesh(pg, mm, NP); puffs.frustumCulled = false; puffs.userData.k = k; puffs.userData.g = g; puffs.renderOrder = 2; grp.add(puffs); grp.visible = true;
  }
  return {
    group: grp, set,
    update(dt, t, mood, cam) {
      if (!puffs) return; const g = puffs.userData.g, R = g.r * W; tintCloud(mu, mood, cam);
      for (let i = 0; i < NP; i++) { const s = seeds[i], a = s.a + t * 0.05 * (i % 2 ? 1 : -1); pv.set(g.x * W + Math.cos(a) * R * s.d, 0.7 + s.y * 1.1 + Math.sin(t * 0.6 + s.ph) * 0.18, g.y * W + Math.sin(a) * R * s.d * 0.9); q.setFromAxisAngle(UP, s.ph); sv.set(s.s * 1.5, s.s * 1.5, 1); m4.compose(pv, q, sv); puffs.setMatrixAt(i, m4); }
      puffs.instanceMatrix.needsUpdate = true;
    },
    dispose() { set(-5); pg.dispose(); mm.dispose(); gm.dispose(); ct.dispose(); },
  };
}
