// hub.js : the management-side 3D world. A terraced hillside gladiator school you can orbit and tap.
//   const hub = createHub({ renderer, camera, audio, tier, post? });
//   hub.scene  (add to composer: post.setScene(hub.scene))     hub.group
//   hub.enter(S) / hub.exit()     attach input + camera, build from state S (LM.newGame() shape)
//   hub.refresh(S)                rebuild what changed (plots, glads, weather, time of day); selection is kept
//   hub.update(realDt, t)         every frame (orbit camera, sky, fx, ambient life)
//   hub.resize(w, h)              hub.pick(clientX, clientY) -> {type:'plot',i,empty,locked} | {type:'glad',id} | null
//   hub.focusPlot(i) / hub.focusGlad(id) / hub.setSelection(sel) / hub.setHover(sel) / hub.overview()
//   hub.on('pick'|'hover'|'select', fn)     hub.orbit (live camera state)    hub.stats()    hub.setHour(h) hub.setWeather(w)
// World: courtyard 48 x 38 m (walls at x=+-24, z=+-19), +z = front gate / downhill, -z = hill. 4 x 4 plots, row 0 at the front.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLudus } from './env_ludus.js';
import { createSky, createLightRig, applyTOD, TOD, lerpTOD, todFromHour } from './sky.js';
import { TIERS } from './post.js';
import { createFlames, prepGeo, patchMaterial } from './envfx.js';
import { makeSandTexture, tfbm } from './envtex.js';
import { Kit, buildParts, getLib, buildingUniforms, MATS, PALETTE as C, MAXPLOT, BUILDING_IDS } from './buildings.js';
import { createGladiator } from './gladiator.js';
import { JOINTS } from './rig.js';

const V3 = THREE.Vector3;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const TAU = Math.PI * 2;
const LMg = () => globalThis.LM, Dg = () => globalThis.LM_D;
const rngOf = (seed) => { let s = (seed | 0) || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const hashStr = (str) => { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); };

// ------------------------------------------------------------------------------------------ layout
export const LAYOUT = { COLS: 4, ROWS: 4, PX: 10.6, PZ: 7.8, X0: -15.9, Z0: 10.6, STEP: 0.55, BASE: 0.06, PAD: 0.1, CW: 24, CD: 19, WT: 1.2, WH: 3.2 };
const { COLS, PX, PZ, X0, Z0, STEP, BASE, PAD, CW, CD, WT, WH } = LAYOUT;
export const terraceH = (r) => BASE + STEP * clamp(r, 0, 3);
export const plotRC = (i) => [Math.floor(i / COLS), i % COLS];
export function plotCenter(i, out = new V3()) { const [r, c] = plotRC(i); return out.set(X0 + c * PX, terraceH(r) + PAD, Z0 - r * PZ); }
const rowOfZ = (z) => clamp(Math.floor((Z0 + PZ / 2 - z) / PZ), 0, 3);
/** ground height anywhere in the courtyard (terraces + pads). */
export function groundAt(x, z) {
  if (z > Z0 + PZ / 2) return 0.0;
  const r = rowOfZ(z), c = clamp(Math.round((x - X0) / PX), 0, 3), i = r * COLS + c, p = plotCenter(i);
  return terraceH(r) + (Math.abs(x - p.x) < 4.5 && Math.abs(z - p.z) < 3.1 ? PAD : 0);
}

// ------------------------------------------------------------------------------------------ weather / time of day
const WEATHER = {
  rain: { sunElev: 20, sunAz: 330, sunColor: 0xc8d0e0, sunInt: 1.1, hemiSky: 0x9aa6c0, hemiGround: 0x7a7468, hemiInt: 1.35, fog: 0x8c96a6, fogDensity: 0.0068, skyTop: 0x59667e, skyMid: 0x8793a4, skyHor: 0xb0b6bf, glow: 0xa0a8b8, cloudLit: 0xb4bcc8, cloudShade: 0x5a6272, cloudAmt: 0.95, stars: 0, exposure: 0.95, night: 0.15, sunSize: 0.012 },
  dust: { sunElev: 18, sunAz: 330, sunColor: 0xffa860, sunInt: 2.6, hemiSky: 0xcaa07a, hemiGround: 0xb07a46, hemiInt: 1.3, fog: 0xd9a066, fogDensity: 0.0082, skyTop: 0xb08a68, skyMid: 0xd9a470, skyHor: 0xe8b078, glow: 0xff9040, cloudLit: 0xf0c090, cloudShade: 0x9a6a48, cloudAmt: 0.7, stars: 0, exposure: 0.95, night: 0, sunSize: 0.03 },
  heat: { sunElev: 36, sunAz: 330, sunColor: 0xffd08a, sunInt: 4.2, hemiSky: 0xb4b2d8, hemiGround: 0xd29a5a, hemiInt: 1.25, fog: 0xf0cfa0, fogDensity: 0.0020, skyTop: 0x4a7cc8, skyMid: 0xeccaa0, skyHor: 0xffe4b8, glow: 0xffc070, cloudLit: 0xfff0d0, cloudShade: 0xb8a0a0, cloudAmt: 0.25, stars: 0, exposure: 1.0, night: 0, sunSize: 0.04 },
};
/** hour (0..24) + weather -> preset. Sun swings front-right (morning) to front-left (evening) so facades are always modelled by 3/4 light. */
export function presetFor(hour, weather = 'clear') {
  let base = weather === 'night' ? Object.assign({}, TOD.night) : todFromHour(clamp(hour, 6.2, 19.2));
  if (WEATHER[weather]) base = lerpTOD(base, WEATHER[weather], weather === 'rain' ? 0.85 : weather === 'dust' ? 0.7 : 0.55);
  if (weather !== 'night') { const f = clamp((hour - 7) / 12); base.sunAz = (40 - 85 * f + 360) % 360; base.sunElev = (weather === 'rain' ? 24 : 24 + 10 * Math.sin(Math.PI * f)) * (hour < 7 || hour > 18.4 ? 0.7 : 1); }
  return base;
}
const hourOf = (S) => 9 + (((S.week || 1) - 1) % 12) * 0.8;

// ------------------------------------------------------------------------------------------ small shaders (rings, links, smoke, sparks, rain)
function ringMaterial({ color = [2.0, 1.4, 0.5], width = 0.14, alpha = 1, speed = 1.2 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(...color) }, uW: { value: width }, uA: { value: alpha }, uSpeed: { value: speed } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying vec2 vP; varying vec2 vS; void main(){ vec3 c = instanceMatrix[3].xyz; vS = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz)); vP = position.xz * vS;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vP; varying vec2 vS; uniform float uTime, uW, uA, uSpeed; uniform vec3 uColor;
      void main(){ float r = min(1.2, min(vS.x, vS.y) * 0.5); vec2 q = abs(vP) - (vS * 0.5 - r); float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        float ring = 1.0 - smoothstep(0.0, uW, abs(d + uW * 0.5)); float glow = exp(-abs(d + uW) * 2.6) * 0.35;
        float ang = atan(vP.y, vP.x); float dash = 0.55 + 0.45 * sin(ang * 8.0 - uTime * uSpeed * 2.0);
        float a = (ring * (0.65 + 0.35 * dash) + glow * (0.6 + 0.4 * sin(uTime * 2.2))) * uA;
        gl_FragColor = vec4(uColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
function ringMesh(mat, n) {
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.renderOrder = 7; m.count = 0; m.name = 'ring';
  return m;
}
const LINK_VERT = `attribute vec3 aTan; attribute float aSide; attribute float aStr; varying vec2 vUv; varying float vStr; uniform float uW;
  void main(){ vUv = uv; vStr = aStr; vec3 V = normalize(cameraPosition - position); vec3 S = normalize(cross(normalize(aTan), V)); vec3 p = position + S * aSide * uW * (0.6 + 0.8 * aStr);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const LINK_FRAG = `varying vec2 vUv; varying float vStr; uniform float uTime; uniform vec3 uColor;
  void main(){ float edge = 1.0 - pow(abs(vUv.y * 2.0 - 1.0), 2.0); float flow = 0.55 + 0.45 * sin(vUv.x * 40.0 - uTime * 2.2); float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float a = edge * flow * ends * (0.30 + 0.7 * vStr); gl_FragColor = vec4(uColor * (1.2 + vStr), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const SMOKE_VERT = `attribute vec4 aSeed; attribute vec4 aOrg; uniform float uTime, uPR, uWind; varying float vA; varying float vTint;
  void main(){ float life = fract(uTime * (0.10 + aSeed.y * 0.05) * aOrg.w + aSeed.x); vec3 p = position;
    p.y += life * (3.2 + aSeed.z * 1.5); p.x += life * life * (1.8 + aSeed.y) * uWind + sin(life * 6.0 + aSeed.x * 20.0) * 0.18 * life; p.z += cos(life * 5.0 + aSeed.y * 20.0) * 0.15 * life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0); float sz = (0.5 + life * 2.4) * aOrg.z * 60.0; gl_PointSize = clamp(sz * uPR / -mv.z, 1.0, 90.0 * uPR);
    vA = smoothstep(0.0, 0.1, life) * (1.0 - life) * 0.55; vTint = aSeed.w; gl_Position = projectionMatrix * mv; }`;
const SMOKE_FRAG = `varying float vA; varying float vTint; uniform vec3 uLight, uDark;
  void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; float a = pow(max(1.0 - r, 0.0), 1.6) * vA; vec3 col = mix(uLight, uDark, clamp(vTint * -1.0, 0.0, 1.0)); col = mix(col, vec3(1.0), clamp(vTint, 0.0, 1.0) * 0.6);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const SPARK_VERT = `attribute vec4 aSeed; uniform float uTime, uPR; varying float vA;
  void main(){ float life = fract(uTime * (0.55 + aSeed.y * 0.5) + aSeed.x); vec3 v = vec3((aSeed.y - 0.5) * 1.8, 1.4 + aSeed.z * 1.6, (aSeed.w - 0.5) * 1.8); vec3 p = position + v * life * 0.9; p.y -= 3.2 * life * life;
    vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(60.0 * uPR / -mv.z * (1.0 - life * 0.6), 1.0, 8.0 * uPR); vA = (1.0 - life) * smoothstep(0.0, 0.05, life); gl_Position = projectionMatrix * mv; }`;
const SPARK_FRAG = `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - r) * vA; gl_FragColor = vec4(vec3(4.0, 1.8, 0.5) * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------------------------------ gladiator baking (1 SkinnedMesh per character)
const _tm = new THREE.Matrix4(), _inv = new THREE.Matrix4();
let SKIN_MAT = null;
function bakeSkinned(rig) {
  const bones = JOINTS.map((n) => rig.joints[n]), idx = new Map(bones.map((b, i) => [b, i]));
  rig.root.position.set(0, 0, 0); rig.root.rotation.set(0, 0, 0); rig.root.updateMatrixWorld(true);
  _inv.copy(rig.root.matrixWorld).invert();
  const sec = new Set(); for (const s of rig.secondary) { const m = s.mesh || s.group; if (m) m.traverse((o) => sec.add(o)); }
  const geos = [], hide = [];
  rig.root.traverse((o) => {
    if (!o.isMesh || !o.geometry || sec.has(o)) return;
    let b = o.parent; while (b && !idx.has(b)) b = b.parent;
    const bi = b ? idx.get(b) : 0;
    let g = o.geometry; g = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    _tm.multiplyMatrices(_inv, o.matrixWorld); g.applyMatrix4(_tm);
    const mat = Array.isArray(o.material) ? o.material[0] : o.material, base = mat && mat.color ? mat.color : new THREE.Color(1, 1, 1), n = g.attributes.position.count;
    const col = new Float32Array(n * 3), vc = g.attributes.color;
    for (let i = 0; i < n; i++) { const k = vc ? 1 : 1; col[i * 3] = (vc ? vc.getX(i) : 1) * base.r * k; col[i * 3 + 1] = (vc ? vc.getY(i) : 1) * base.g * k; col[i * 3 + 2] = (vc ? vc.getZ(i) : 1) * base.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geos.push(g); hide.push(o);
  });
  const geo = mergeGeometries(geos, false);
  SKIN_MAT = SKIN_MAT || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.08 });
  const sm = new THREE.SkinnedMesh(geo, SKIN_MAT); sm.frustumCulled = false; sm.castShadow = true; sm.receiveShadow = false; sm.name = 'glad_skin';
  rig.root.add(sm); sm.updateMatrixWorld(true);
  sm.bind(new THREE.Skeleton(bones));
  for (const o of hide) o.visible = false;
  for (const o of sec) o.visible = false;
  rig.secondary.length = 0;
  rig.skin = sm; rig.tris = geo.attributes.position.count / 3;
  return rig;
}

// ------------------------------------------------------------------------------------------ the hub
export function createHub({ renderer, camera, audio, tier = 'high', post = null } = {}) {
  const T = () => TIERS[tier] || TIERS.high;
  const dom = renderer.domElement;
  const scene = new THREE.Scene(), group = new THREE.Group(); group.name = 'hub'; scene.add(group);
  const lib = getLib();
  const listeners = {}; const emit = (type, a, b) => { (listeners[type] || []).forEach((f) => f(a, b)); };
  let S = null, entered = false, hubT = 0, maxGlads = tier === 'low' ? 5 : tier === 'medium' ? 8 : 12;

  // ---- sky, light, environment
  const sky = createSky(); scene.add(sky.mesh);
  const rig = createLightRig(scene, { shadowSize: T().shadow, shadowRadius: 36, shadowCenter: new V3(0, 1, 1), near: 1, far: 260 });
  const env = createLudus({ density: Math.max(0.5, T().crowd * 0.8) }); group.add(env.group);
  { // strip the env's own walls/portico/pool/torches: the hub builds its own lower wall and terraces
    const keep = new Set(['terrain', 'courtyard_floor', 'dust', 'birds', 'blobshadows']);
    const bb = new THREE.Box3(), kill = [];
    for (const ch of env.group.children) {
      if (keep.has(ch.name)) continue;
      if (ch.name === 'walls' || ch.name === 'roofs' || ch.name === 'flames') { kill.push(ch); continue; }
      bb.makeEmpty(); ch.updateMatrixWorld(true); bb.setFromObject(ch);
      if (!bb.isEmpty() && bb.max.y < 14 && Math.abs(bb.min.x) < 32 && Math.abs(bb.max.x) < 32 && Math.abs(bb.min.z) < 26 && Math.abs(bb.max.z) < 26) kill.push(ch);
    }
    for (const ch of kill) env.group.remove(ch);
  }

  // ---- merged world meshes (one per shared building material)
  const layers = {};
  for (const m of MATS) { const mesh = new THREE.Mesh(new THREE.BufferGeometry(), lib[m]); mesh.frustumCulled = false; mesh.castShadow = m !== 'glow' && m !== 'cloth'; mesh.receiveShadow = m !== 'glow'; mesh.name = 'hub_' + m; group.add(mesh); layers[m] = mesh; }
  const sandTex = makeSandTexture(512, 6); sandTex.map.repeat.set(1, 1); sandTex.map.needsUpdate = true;
  const sandMat = new THREE.MeshStandardMaterial({ map: sandTex.map, bumpMap: sandTex.bump, bumpScale: 0.8, vertexColors: true, roughness: 1 });
  const sandMesh = new THREE.Mesh(new THREE.BufferGeometry(), sandMat); sandMesh.receiveShadow = true; sandMesh.frustumCulled = false; sandMesh.name = 'hub_terrace_top'; group.add(sandMesh);
  const leafMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    key: 'hub_leaf', uniforms: { uTime: buildingUniforms.uTime, uWind: buildingUniforms.uWind },
    vPars: 'uniform float uTime, uWind;', vBody: 'transformed.xz += vec2(sin(uTime * 1.3 + transformed.x * 0.5), cos(uTime * 1.1 + transformed.z * 0.5)) * 0.12 * uv.x * uWind;',
  });
  const leafMesh = new THREE.Mesh(new THREE.BufferGeometry(), leafMat); leafMesh.castShadow = true; leafMesh.receiveShadow = false; leafMesh.frustumCulled = false; leafMesh.name = 'hub_foliage'; group.add(leafMesh);

  let flames = null, flameGroup = new THREE.Group(); group.add(flameGroup);
  // smoke + sparks (points)
  const smokeU = { uTime: { value: 0 }, uPR: { value: 1 }, uWind: { value: 1 }, uLight: { value: new THREE.Color(0xe8d8c4) }, uDark: { value: new THREE.Color(0x3a3430) } };
  const smoke = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: smokeU, vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false, fog: false })); smoke.frustumCulled = false; smoke.renderOrder = 6; group.add(smoke);
  const sparkU = { uTime: { value: 0 }, uPR: { value: 1 } };
  const sparks = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: sparkU, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sparks.frustumCulled = false; sparks.renderOrder = 6; group.add(sparks);

  // ---- rings (selection, hover, empty-plot pads) and synergy links
  const selMat = ringMaterial({ color: [2.2, 1.55, 0.5], width: 0.2 }), hovMat = ringMaterial({ color: [1.6, 1.2, 0.6], width: 0.12, alpha: 0.7 }), padMat = ringMaterial({ color: [1.5, 1.15, 0.5], width: 0.1, alpha: 0.45, speed: 0.5 });
  const selRing = ringMesh(selMat, 1), hovRing = ringMesh(hovMat, 1), padRings = ringMesh(padMat, 16);
  group.add(selRing, hovRing, padRings);
  const linkU = { uTime: { value: 0 }, uW: { value: 0.1 }, uColor: { value: new THREE.Color(1.0, 0.75, 0.28) } };
  const linkMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: linkU, vertexShader: LINK_VERT, fragmentShader: LINK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  linkMesh.frustumCulled = false; linkMesh.renderOrder = 8; group.add(linkMesh);
  let links = [];   // {a, b, base: aStr offset}

  // ---- rain
  const rainU = { uTime: { value: 0 }, uCenter: { value: new V3() }, uAmt: { value: 0 } };
  let rain;
  { const N = tier === 'low' ? 700 : 1600, pos = new Float32Array(N * 2 * 3), sd = new Float32Array(N * 2 * 4), r = rngOf(9);
    for (let i = 0; i < N; i++) { const a = r(), b = r(), c = r(), d = r(); for (let k = 0; k < 2; k++) { pos[(i * 2 + k) * 3] = a; pos[(i * 2 + k) * 3 + 1] = b; pos[(i * 2 + k) * 3 + 2] = c; sd[(i * 2 + k) * 4] = d; sd[(i * 2 + k) * 4 + 1] = k; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: rainU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform vec3 uCenter; varying float vA;
        void main(){ vec3 box = vec3(90.0, 50.0, 90.0); vec3 p = position * box; p.y -= uTime * (28.0 + aSeed.x * 8.0); p.x += uTime * 3.0; p = mod(p, box) - box * 0.5; p += vec3(uCenter.x, uCenter.y + 18.0, uCenter.z);
          p.y -= aSeed.y * 1.6; p.x -= aSeed.y * 0.2; vec4 mv = viewMatrix * vec4(p, 1.0); vA = exp(-(-mv.z) * 0.012) * 0.5; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uAmt; varying float vA; void main(){ gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * 1.4, vA * uAmt);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
    rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 9; group.add(rain); }

  // ---------------------------------------------------------------------------------------- static shell (walls, towers, gate, terraces, trees)
  let staticParts = null, staticFx = null, staticLeaf = null;
  function addPlotAttr(g, v = 0) { if (!g.attributes.aPlot) g.setAttribute('aPlot', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; }
  function buildStatic() {
    const k = new Kit(77, 0x6a2470); k.H = 7;
    const inX = CW - WT / 2, inZ = CD - WT / 2, GATE = 3.4;
    const wall = (w, h, d, x, y, z, hex = C.trav) => k.box('masonry', w, h, d, x, y, z, hex);
    const cap = (w, d, x, z, ry) => k.box('roof', w, 0.4, d, x, WH, z, 0xffffff, { ry });
    // perimeter wall with a darker plinth and tile cap
    for (const [w, d, x, z] of [[2 * CW + WT, WT, 0, -CD], [WT, 2 * CD, -CW, 0], [WT, 2 * CD, CW, 0]]) { wall(w + 0.0, 0.7, d + 0.2, x, 0, z, 0xcdb78f); wall(w, WH - 0.7, d, x, 0.7, z); cap(w + 0.3, d + 0.6, x, z); }
    const sw = CW - GATE - 1.3, FH = 1.7; for (const s of [-1, 1]) { wall(sw, 0.6, WT + 0.2, s * (GATE + 2.6 + sw / 2), 0, CD, 0xcdb78f); wall(sw, FH - 0.6, WT, s * (GATE + 2.6 + sw / 2), 0.6, CD); k.box('roof', sw + 0.3, 0.3, WT + 0.6, s * (GATE + 2.6 + sw / 2), FH, CD, 0xffffff); }
    // pilasters on the inner faces + buttresses outside
    for (let x = -CW + 5; x < CW - 2; x += 6.4) { if (Math.abs(x) < GATE + 4) { continue; } wall(0.7, WH - 0.2, 0.5, x, 0, -inZ + 0.1); wall(0.7, WH - 0.2, 0.5, x, 0, inZ - 0.1); wall(0.9, WH + 0.5, 0.9, x, 0, -CD - WT / 2 - 0.3); wall(0.9, WH + 0.5, 0.9, x, 0, CD + WT / 2 + 0.3); }
    for (let z = -CD + 5; z < CD - 3; z += 6.4) { wall(0.5, WH - 0.2, 0.7, -inX + 0.1, 0, z); wall(0.5, WH - 0.2, 0.7, inX - 0.1, 0, z); wall(0.9, WH + 0.5, 0.9, -CW - WT / 2 - 0.3, 0, z); wall(0.9, WH + 0.5, 0.9, CW + WT / 2 + 0.3, 0, z); }
    // corner towers
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * CW, cz = sz * CD;
      k.cyl('masonry', 2.55, 2.8, 6.4, cx, 0, cz, C.trav, { seg: 12 }); k.cyl('masonry', 2.9, 2.9, 0.4, cx, 6.2, cz, C.trav, { seg: 12 }); k.cone('roof', 3.3, 3.4, cx, 6.6, cz, 0xffffff, { seg: 12 });
      k.cone('metal', 0.14, 0.7, cx, 9.9, cz, C.gold, { seg: 5 });
      for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + Math.PI / 4; k.at(cx, 0, cz, a, () => k.box('glow', 0.18, 0.7, 0.06, 0, 4.2, 2.6, [2.9, 1.5, 0.55], { em: [1, 0], ao: 0 })); }
      k.banner(cx - sx * 2.2, cz - sz * 2.2, 0, 0, 0x6a2470, { noPole: true, bar: 5.9, w: 0.7, h: 1.6, gold: true, ry: sz > 0 ? 0 : Math.PI });
    }
    // gate: pylons, lintel, open timber doors, braziers, banners
    for (const s of [-1, 1]) {
      wall(2.6, WH + 2.4, WT + 1.2, s * (GATE + 1.3), 0, CD, C.trav); k.box('roof', 3.1, 0.5, WT + 1.8, s * (GATE + 1.3), WH + 2.4, CD, 0xffffff);
      k.at(s * (GATE + 1.3), 0, CD + WT / 2 + 0.7, 0, () => { k.banner(0, 0.05, 0, 0, 0x6a2470, { noPole: true, bar: WH + 1.9, w: 0.9, h: 2.4, gold: true }); });
      k.box('wood', 0.3, 3.8, 3.0, s * (GATE - 0.1), 0, CD - 0.1, C.wood2, { ry: s * 1.35 }); k.box('metal', 0.34, 0.12, 3.0, s * (GATE - 0.1), 2.8, CD - 0.1, C.iron, { ry: s * 1.35 }); k.box('metal', 0.34, 0.12, 3.0, s * (GATE - 0.1), 0.9, CD - 0.1, C.iron, { ry: s * 1.35 });
      k.brazier(s * (GATE + 0.0), inZ - 1.2, 0, 1.0, { gold: true });
    }
    wall(2 * GATE + 2.6, 1.7, WT + 1.2, 0, WH + 0.7, CD, C.trav); k.box('roof', 2 * GATE + 3.4, 0.5, WT + 1.8, 0, WH + 2.4, CD, 0xffffff);
    k.box('metal', 2 * GATE + 2.7, 0.1, 0.1, 0, WH + 0.62, CD + WT / 2 + 0.7, C.gold);
    // wall torches (inner faces)
    for (let x = -CW + 4; x < CW; x += 8) { if (Math.abs(x) < GATE + 3) continue; k.torch(x, 1.3, inZ - 0.15, { s: 0.8, dz: -1 }); k.torch(x + 4, 2.1, -inZ + 0.15, { s: 0.8 }); }
    for (const z of [-11, -3, 5, 13]) { k.at(-inX + 0.2, 0, z, Math.PI / 2, () => k.torch(0, 2.1, 0, { s: 0.8 })); k.at(inX - 0.2, 0, z, -Math.PI / 2, () => k.torch(0, 2.1, 0, { s: 0.8 })); }
    // terraces: retaining walls with coping, stairs at the central aisle
    for (let r = 0; r < 4; r++) {
      const zc = Z0 - r * PZ, h = terraceH(r), zb = r === 3 ? -inZ - 0.2 : zc - PZ / 2, zf = zc + PZ / 2;
      wall(2 * (inX + 0.1), h, zf - zb, 0, 0, (zf + zb) / 2, r === 0 ? 0xcdb78f : C.trav);
      if (r > 0) { wall(2 * inX, 0.12, 0.6, 0, h, zf - 0.05, C.marble); for (let j = 0; j < 3; j++) k.box('masonry', 2.4, (j + 1) * (STEP / 3.4), 0.42, 0, h - STEP, zf + 0.35 + (2 - j) * 0.42, C.trav); }
      else { k.box('masonry', 2 * inX, 0.1, 0.5, 0, 0, zf + 0.1, C.marble); }
    }
    // central flagged path from the gate to the first terrace
    k.box('masonry', 3.4, 0.05, CD - (Z0 + PZ / 2) + 0.3, 0, 0.0, (CD + (Z0 + PZ / 2)) / 2, 0xc9b48c);
    staticParts = k.P; staticFx = k.fx;
    // cypress + olive in the forecourt
    const lg = []; const r = rngOf(5);
    const cypress = (x, z, s) => { const prof = [[0.001, 0], [0.55, 0.15], [0.95, 1.3], [0.9, 3.0], [0.62, 5.0], [0.2, 6.6], [0.001, 7.1]].map(([a, y]) => new THREE.Vector2(a * s, y * s)); const g = new THREE.LatheGeometry(prof, 8); g.rotateY(r() * 3); g.translate(x, 0, z); lg.push(leafCol(g, [0.07, 0.17, 0.07], [0.15, 0.32, 0.1], 7.1 * s, 0.35)); };
    const olive = (x, z, s) => { const tr = new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 2.0 * s, 6); tr.translate(x, s, z); lg.push(leafCol(tr, [0.2, 0.13, 0.08], [0.28, 0.18, 0.1], 2 * s, 0)); for (let i = 0; i < 4; i++) { const sp = new THREE.IcosahedronGeometry(1.2 * s, 1); sp.scale(1, 0.72, 1); sp.translate(x + (r() - 0.5) * 1.6 * s, 2.4 * s + r() * 0.5 * s, z + (r() - 0.5) * 1.6 * s); lg.push(leafCol(sp, [0.2, 0.28, 0.12], [0.36, 0.46, 0.2], 3.4 * s, 0.6, 2.2 * s)); } };
    for (const x of [-19, -13.5, -8, 8, 13.5, 19]) cypress(x, 16.6 + (Math.abs(x) % 3) * 0.2, 0.8 + (Math.abs(x * 7) % 5) * 0.06);
    olive(-21.4, 16.2, 0.9); olive(21.4, 16.0, 1.0); olive(-5.8, 17.0, 0.7); olive(5.9, 17.2, 0.75);
    staticLeaf = lg;
  }
  function leafCol(g, lo, hi, H, sway, y0 = 0) {
    g = prepGeo(g.index ? g.toNonIndexed() : g); const p = g.attributes.position, c = g.attributes.color, uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { const t = clamp((p.getY(i) - y0) / H), up = clamp(n.getY(i) * 0.5 + 0.5), k = 0.55 + 0.45 * t * 0.0 + up * 0.0; c.setXYZ(i, lerp(lo[0], hi[0], t * 0.7 + up * 0.3) * (0.8 + 0.2 * up) * k, lerp(lo[1], hi[1], t * 0.7 + up * 0.3) * (0.8 + 0.2 * up) * k, lerp(lo[2], hi[2], t * 0.7 + up * 0.3) * (0.8 + 0.2 * up) * k); uv.setXY(i, sway * t * t, 0); }
    return g;
  }

  // ---------------------------------------------------------------------------------------- per-state dressing + building merge
  const plotSig = new Array(16).fill('');
  let builtRows = -1, sigAll = '', buildFx = { flames: [], smoke: [], sparks: [] };
  function rebuildWorld(St) {
    const lists = {}; for (const m of MATS) lists[m] = [];
    const push = (m, g) => { lists[m].push(addPlotAttr(g, 0)); };
    for (const m of MATS) for (const g of staticParts[m]) push(m, g);
    const accent = new THREE.Color(Dg().COLORS[St.color || 0].c).getHex();
    const k = new Kit(hashStr(St.seed || 'x'), accent); k.H = 6;
    const fx = { flames: staticFx.flames.slice(), smoke: staticFx.smoke.slice(), sparks: staticFx.sparks.slice() };
    const rows = St.rows || 2, pads = [], leafGeos = staticLeaf.slice(), r = rngOf(hashStr(St.seed || 'y'));
    // terrace tops (vertex colored sand / overgrown)
    const tops = [];
    for (let rr = 0; rr < 4; rr++) {
      const zc = Z0 - rr * PZ, zf = zc + PZ / 2, zb = rr === 3 ? -CD + WT / 2 - 0.2 : zc - PZ / 2, w = 2 * (CW - WT / 2 - 0.1), d = zf - zb, nx = 36, nz = Math.max(3, Math.round(d / 1.1));
      const g = new THREE.PlaneGeometry(w, d, nx, nz); g.rotateX(-Math.PI / 2); g.translate(0, terraceH(rr) + 0.012, (zf + zb) / 2);
      const p = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(p.count * 3), locked = rr >= rows;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), n = tfbm(x * 0.09 + 4, z * 0.09, 64, 3, 7), n2 = tfbm(x * 0.4, z * 0.4 + 9, 64, 2, 3);
        let cr = 0.9 + n * 0.16, cg = 0.88 + n * 0.14, cb = 0.84 + n * 0.1;
        if (locked) { const gm = clamp(0.35 + n2 * 1.1); cr = lerp(0.74, 0.40, gm) * (0.9 + n * 0.2); cg = lerp(0.62, 0.50, gm) * (0.9 + n * 0.2); cb = lerp(0.38, 0.22, gm); }
        // darker where the pad meets the terrace (soft contact) is baked by the pad itself
        col[i * 3] = cr; col[i * 3 + 1] = cg; col[i * 3 + 2] = cb;
        uv.setXY(i, x / 5, z / 5);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); tops.push(g);
    }
    // pads + locked dressing + buildings
    for (let i = 0; i < 16; i++) {
      const c = plotCenter(i), [rr] = plotRC(i), base = c.y - PAD, pl = St.plots[i], locked = rr >= rows;
      if (!locked) {
        k.box('masonry', 9.0, PAD, 6.2, c.x, base, c.z, 0xd8c8a6, { ao: 0.2 });
        k.box('masonry', 9.3, 0.05, 6.5, c.x, base, c.z, 0xb9a47c, { ao: 0.2 });
        if (!pl) pads.push(c);
      } else {
        for (let j = 0; j < 22; j++) { const x = c.x + (r() - 0.5) * 9.4, z = c.z + (r() - 0.5) * 6.6, hh = 0.45 + r() * 0.7; for (let b = 0; b < 3; b++) { const g = new THREE.ConeGeometry(0.1 + r() * 0.06, hh, 4); g.rotateZ((r() - 0.5) * 0.5); g.translate(x + (b - 1) * 0.12, base + hh / 2, z + (r() - 0.5) * 0.2); leafGeos.push(leafCol(g, [0.18, 0.28, 0.08], [0.46, 0.55, 0.18], hh, 0.7, base)); } }
        for (let j = 0; j < 4; j++) { const g = new THREE.IcosahedronGeometry(0.5 + r() * 0.4, 0); g.scale(1, 0.7, 1); g.translate(c.x + (r() - 0.5) * 8, base + 0.3, c.z + (r() - 0.5) * 5.4); leafGeos.push(leafCol(g, [0.2, 0.32, 0.1], [0.34, 0.46, 0.16], 1, 0.4, base)); }
        for (let j = 0; j < 3; j++) k.sphere('masonry', 0.3 + r() * 0.3, c.x + (r() - 0.5) * 8, base + 0.1, c.z + (r() - 0.5) * 5, 0xa8987c, { seg: 5, hseg: 3, sy: 0.7 });
        // for-sale post at the front corner
        const px = c.x - 3.9, pz = c.z + 2.6;
        k.cyl('wood', 0.07, 0.09, 2.2, px, base, pz, C.wood2, { seg: 6 }); k.box('wood', 1.0, 0.55, 0.07, px + 0.5, base + 1.35, pz, C.woodLt); k.box('wood', 1.0, 0.07, 0.09, px + 0.5, base + 1.9, pz, C.wood2);
        k.cyl('metal', 0.17, 0.17, 0.03, px + 0.5, base + 1.62, pz + 0.05, C.gold, { rx: Math.PI / 2, c: true, seg: 8 });
        k.sheet([px + 0.2, base + 1.7, pz + 0.06], [0.2, 0, 0], [0, -0.55, 0], 1, 2, 0xb5352a);
      }
      if (pl && !locked) {
        const R = buildParts(pl.b, pl.l, { accent });
        const T4 = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
        for (const m of MATS) if (R.parts[m]) { const g = R.parts[m].clone(); g.applyMatrix4(T4); addPlotAttr(g, i + 1).attributes.aPlot.array.fill(i + 1); lists[m].push(g); }
        for (const f of R.fx.flames) fx.flames.push({ x: f.x + c.x, y: f.y + c.y, z: f.z + c.z, s: f.s });
        for (const f of R.fx.smoke) fx.smoke.push(Object.assign({}, f, { x: f.x + c.x, y: f.y + c.y, z: f.z + c.z }));
        for (const f of R.fx.sparks) fx.sparks.push(Object.assign({}, f, { x: f.x + c.x, y: f.y + c.y, z: f.z + c.z }));
      }
    }
    // festival bunting
    const fest = LMg() ? LMg().fest(St, St.week) : '';
    if (fest) {
      const cols = [0xb5352a, 0xf5c545, 0x2f78c4, 0x2f8f5a, 0x6a2470, 0xf0e4c6];
      for (const zz of [Z0 - PZ / 2 + 0.2, Z0 - PZ * 1.5 + 0.2]) { const y0 = 4.4 + terraceH(rowOfZ(zz - 1)); for (const s of [-1, 1]) k.cyl('wood', 0.08, 0.1, 5.6, s * 22.6, terraceH(rowOfZ(zz - 1)), zz, C.wood2, { seg: 5 }); let prev = null; for (let j = 0; j <= 28; j++) { const t = j / 28, x = lerp(-22.6, 22.6, t), y = y0 + 0.5 - Math.sin(t * Math.PI) * 1.4; if (j > 0 && j % 1 === 0 && j < 28) k.sheet([x - 0.22, y, zz], [0.44, 0, 0], [0, -0.5, 0], 1, 2, cols[(j + hashStr(fest)) % cols.length], { ao: 0.2 }); if (prev) k.box('wood', Math.hypot(x - prev[0], y - prev[1]) + 0.02, 0.025, 0.025, (x + prev[0]) / 2, (y + prev[1]) / 2, zz, C.rope, { c: true, rz: Math.atan2(y - prev[1], x - prev[0]) }); prev = [x, y]; } }
    }
    for (const m of MATS) for (const g of k.P[m]) push(m, g);
    for (const f of k.fx.flames) fx.flames.push(f); for (const f of k.fx.smoke) fx.smoke.push(f);
    // assign merged geometry
    for (const m of MATS) {
      const mesh = layers[m]; if (mesh.geometry && mesh.userData.owned) mesh.geometry.dispose();
      mesh.geometry = lists[m].length ? mergeGeometries(lists[m], false) : new THREE.BufferGeometry(); mesh.userData.owned = true;
    }
    if (sandMesh.userData.owned) sandMesh.geometry.dispose(); sandMesh.geometry = mergeGeometries(tops.map((g) => g), false); sandMesh.userData.owned = true;
    if (leafMesh.userData.owned) leafMesh.geometry.dispose(); leafMesh.geometry = leafGeos.length ? mergeGeometries(leafGeos.map((g) => { if (!g.attributes.uv) return g; return g; }), false) : new THREE.BufferGeometry(); leafMesh.userData.owned = true;
    // pad rings
    padRings.count = pads.length; const mm = new THREE.Matrix4();
    pads.forEach((c, j) => { mm.makeScale(9.5, 1, 6.7).setPosition(c.x, c.y + 0.03, c.z); padRings.setMatrixAt(j, mm); }); padRings.instanceMatrix.needsUpdate = true;
    buildFx = fx; rebuildFx();
  }
  function rebuildFx() {
    flameGroup.clear(); if (flames) flames = null;
    if (buildFx.flames.length) { flames = createFlames(buildFx.flames, { glowScale: 3.2 }); flameGroup.add(flames.group); }
    // smoke: 18 puffs per emitter
    const sm = buildFx.smoke, np = tier === 'low' ? 10 : 18, r = rngOf(3);
    { const pos = new Float32Array(sm.length * np * 3), seed = new Float32Array(sm.length * np * 4), org = new Float32Array(sm.length * np * 4);
      sm.forEach((e, i) => { for (let j = 0; j < np; j++) { const q = i * np + j; pos[q * 3] = e.x + (r() - 0.5) * 0.15; pos[q * 3 + 1] = e.y; pos[q * 3 + 2] = e.z + (r() - 0.5) * 0.15; seed[q * 4] = j / np + r() * 0.03; seed[q * 4 + 1] = r(); seed[q * 4 + 2] = r(); seed[q * 4 + 3] = e.tint || 0; org[q * 4] = 0; org[q * 4 + 1] = 0; org[q * 4 + 2] = e.r || 0.3; org[q * 4 + 3] = e.rate || 1; } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); g.setAttribute('aOrg', new THREE.BufferAttribute(org, 4)); smoke.geometry.dispose(); smoke.geometry = g; }
    { const sp = buildFx.sparks, per = 10, pos = new Float32Array(sp.length * per * 3), seed = new Float32Array(sp.length * per * 4);
      sp.forEach((e, i) => { for (let j = 0; j < per; j++) { const q = i * per + j; pos[q * 3] = e.x; pos[q * 3 + 1] = e.y; pos[q * 3 + 2] = e.z; for (let a = 0; a < 4; a++) seed[q * 4 + a] = r(); seed[q * 4] = j / per + r() * 0.05; } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); sparks.geometry.dispose(); sparks.geometry = g; }
  }
  // ---- synergy links
  const hlTarget = new Float32Array(MAXPLOT), hlCur = new Float32Array(MAXPLOT);
  function rebuildLinks(St) {
    const LM = LMg(), D = Dg(); links = [];
    const seen = new Set();
    for (let i = 0; i < 16; i++) {
      const p = St.plots[i]; if (!p) continue;
      for (const n of LM.neighbors(i)) {
        const q = St.plots[n]; if (!q) continue;
        const a = D.BUILD[p.b].like.includes(q.b), b = D.BUILD[q.b].like.includes(p.b); if (!a && !b) continue;
        const key = Math.min(i, n) + '_' + Math.max(i, n); if (seen.has(key)) continue; seen.add(key);
        links.push({ a: Math.min(i, n), b: Math.max(i, n), mutual: a && b });
      }
    }
    const pos = [], tan = [], side = [], uvs = [], str = [], idx = []; const SEG = 18; let v = 0;
    links.forEach((L, li) => {
      const A = plotCenter(L.a), B = plotCenter(L.b), ha = buildParts(St.plots[L.a].b, St.plots[L.a].l).footprint.h, hb = buildParts(St.plots[L.b].b, St.plots[L.b].l).footprint.h;
      const ya = A.y + Math.min(ha, 4.6) * 0.8 + 0.4, yb = B.y + Math.min(hb, 4.6) * 0.8 + 0.4, peak = Math.max(ya, yb) + 1.6;
      const pa = new V3(A.x, ya, A.z - 0.5), pb = new V3(B.x, yb, B.z - 0.5), pm = pa.clone().add(pb).multiplyScalar(0.5); pm.y = peak;
      const curve = new THREE.QuadraticBezierCurve3(pa, pm, pb); const s0 = v;
      for (let s = 0; s <= SEG; s++) { const t = s / SEG, p = curve.getPoint(t), tg = curve.getTangent(t); for (const sd of [-1, 1]) { pos.push(p.x, p.y, p.z); tan.push(tg.x, tg.y, tg.z); side.push(sd); uvs.push(t, sd * 0.5 + 0.5); str.push(0); v++; } }
      for (let s = 0; s < SEG; s++) { const a = s0 + s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      L.range = [s0, v];
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aTan', new THREE.Float32BufferAttribute(tan, 3)); g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('aStr', new THREE.Float32BufferAttribute(str, 1)); g.setIndex(idx);
    linkMesh.geometry.dispose(); linkMesh.geometry = g; linkMesh.visible = links.length > 0; updateLinkStrength();
  }
  function updateLinkStrength() {
    const a = linkMesh.geometry.attributes.aStr; if (!a) return;
    links.forEach((L) => { const act = (sel && sel.type === 'plot' && (sel.i === L.a || sel.i === L.b)) || (hover && hover.type === 'plot' && (hover.i === L.a || hover.i === L.b)); const val = (act ? 1 : 0) + (L.mutual ? 0.15 : 0); for (let i = L.range[0]; i < L.range[1]; i++) a.setX(i, val); });
    a.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------- gladiators (ambient life)
  const actors = new Map();   // id -> actor
  class Actor {
    constructor(g, i) {
      this.g = g; this.id = g.id; this.rig = bakeSkinned(createGladiator(g)); this.rig.root.name = 'glad_' + g.id; group.add(this.rig.root);
      this.pos = new V3(); this.yaw = 0; this.goalYaw = 0; this.speed = 0; this.kind = 'idle'; this.timer = 1 + (i % 5) * 0.4; this.q = []; this.seed = hashStr(String(g.id)) % 1000; this.rnd = rngOf(this.seed + 11);
      this.home = new V3(); this.p2 = new V3(); this.dir = 1; this.partner = null; this.role = 0; this.sig = '';
    }
    dispose() { group.remove(this.rig.root); this.rig.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  }
  const TRAIN = new Set(['str', 'agi', 'end', 'skl', 'wil']);
  function plotWith(St, id) { return LMg().plotOf(St, id); }
  function assign(St) {
    const LM = LMg(); const act = (a) => a || 'rest';
    const list = [...actors.values()]; const used = {};
    const nextSlot = (key) => (used[key] = (used[key] || 0) + 1) - 1;
    const sparPairs = {};
    for (const a of list) {
      const g = a.g, kind = act(g.act), pP = plotWith(St, 'palaestra'), pS = plotWith(St, 'sparring'), pB = plotWith(St, 'barracks'), pM = plotWith(St, 'market'), pT = plotWith(St, 'scout'), pBa = plotWith(St, 'bath'), pSh = plotWith(St, 'shrine');
      let c = null, x = 0, z = 0, face = 0, mode = 'idle', armed = 0, sig = kind;
      const at = (pi, dx, dz) => { c = plotCenter(pi); x = c.x + dx; z = c.z + dz; };
      if (TRAIN.has(kind)) {
        if (kind === 'wil' && pSh >= 0) { const s = nextSlot('wil'); at(pSh, -1.4 + s * 1.3, 2.4); mode = 'still'; face = Math.PI; }
        else if (pP >= 0) {
          const dum = [[-1.6, -0.2], [1.4, 0.0], [-0.1, 1.2], [2.9, 1.3]]; const s = nextSlot('pal');
          if (kind === 'agi') { at(pP, -2.9, 2.2 + 0.0); mode = 'jog'; a.p2.set(c.x + 2.9, 0, z); armed = 0; }
          else { const d = dum[s % dum.length]; at(pP, d[0], d[1] + 1.15); mode = 'drill'; face = Math.PI; armed = 1; }
        } else { const s = nextSlot('yard'); x = -6 + s * 2.2; z = 15.6; mode = kind === 'agi' ? 'jog' : 'drill'; if (mode === 'jog') a.p2.set(x + 6, 0, z); face = Math.PI; armed = mode === 'drill' ? 1 : 0; }
      } else if (kind === 'spar') {
        const pi = pS >= 0 ? pS : pP; const s = nextSlot('spar'); const pair = Math.floor(s / 2), side = s % 2 ? 1 : -1;
        if (pi >= 0) at(pi, side * 1.0, -0.1 + (pair % 2) * 0.0); else { x = side * 1.0; z = 15.8; }
        mode = 'duel'; armed = 1; face = side > 0 ? -Math.PI / 2 : Math.PI / 2; a.role = s % 2; a.pair = pair; (sparPairs[pair] = sparPairs[pair] || []).push(a);
      } else if (kind === 'work') {
        const pi = pM >= 0 ? pM : pB; const s = nextSlot('work'); if (pi >= 0) at(pi, -2.4 + s * 1.2, 2.45); else { x = 4 + s * 1.3; z = 15.8; } mode = 'walk'; a.p2.set(x + 2.4, 0, z); face = 0; armed = 0;
      } else if (kind === 'spy') {
        const pi = pT >= 0 ? pT : pB; const s = nextSlot('spy'); if (pi >= 0) at(pi, -2.2 + s * 1.0, 2.0); else { x = -9 + s * 1.2; z = 15.8; } mode = 'watch'; face = 0.4; armed = 0;
      } else { // rest and everything else: lounge near barracks / bath
        const pi = pB >= 0 ? pB : pBa; const s = nextSlot('rest'); if (pi >= 0) at(pi, 1.0 + (s % 4) * 0.85, 2.1 + Math.floor(s / 4) * 0.7); else { x = -3 + s * 1.0; z = 15.6; } mode = 'still'; face = -0.5 + (s % 3) * 0.5; armed = 0;
      }
      sig = [kind, mode, Math.round(x * 10), Math.round(z * 10)].join('|');
      if (sig !== a.sig) {
        a.sig = sig; a.home.set(x, groundAt(x, z), z); a.pos.copy(a.home); a.yaw = a.goalYaw = face; a.kind = mode; a.armedWant = armed;
        a.rig.animator.armedTarget = armed; a.rig.animator.armed = armed; a.timer = 0.5 + a.rnd() * 1.5; a.dir = 1; a.partner = null;
        if (mode === 'jog' || mode === 'walk') { a.p2.y = a.home.y; }
        a.rig.root.position.copy(a.pos); a.rig.root.rotation.y = a.yaw;
      }
    }
    for (const k in sparPairs) { const [p, q] = sparPairs[k]; if (p && q) { p.partner = q; q.partner = p; p.rig.animator.armedTarget = q.rig.animator.armedTarget = 1; } else if (p) { p.partner = null; p.kind = 'drill'; } }
  }
  function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
  const ATT = ['attack1', 'attack2', 'attack3'];
  function updateActor(a, dt, t) {
    const an = a.rig.animator; a.timer -= dt;
    let move = 0, want = a.goalYaw;
    switch (a.kind) {
      case 'drill':
        if (a.timer <= 0) { const nm = ATT[Math.floor(a.rnd() * 3)]; try { an.play(nm, { speed: 0.75 + a.rnd() * 0.3 }); } catch (e) { /* clip missing */ } a.timer = 1.7 + a.rnd() * 1.8; if (a.rnd() < 0.12) { try { an.play('taunt'); } catch (e) { /* */ } a.timer += 1.4; } }
        break;
      case 'duel': {
        const p = a.partner; if (p) { const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z; want = Math.atan2(dx, dz); }
        if (a.timer <= 0 && p) {
          if (a.q.length === 0 && a.role === (Math.floor(t / 1.9) % 2)) { try { an.play(ATT[Math.floor(a.rnd() * 3)], { speed: 0.95 }); } catch (e) { /* */ } p.q.push({ t: 0.42, fn: () => { try { if (p.rnd() < 0.6) { p.rig.animator.play('block'); p.q.push({ t: 0.35, fn: () => p.rig.animator.release() }); } else p.rig.animator.hurt(1, 0.7); } catch (e) { /* */ } } }); a.timer = 1.5 + a.rnd() * 0.6; }
          else a.timer = 0.25;
        }
        break;
      }
      case 'jog': case 'walk': {
        if (a.pause > 0) { a.pause -= dt; break; }
        const tgt = a.dir > 0 ? a.p2 : a.home, dx = tgt.x - a.pos.x, dz = tgt.z - a.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.25) { a.dir *= -1; if (a.kind === 'walk') a.pause = 1.5 + a.rnd() * 2.5; break; }
        want = Math.atan2(dx, dz); move = a.kind === 'jog' ? 3.3 : 1.25; if (Math.abs(angDiff(a.yaw, want)) > 0.9) move *= 0.2; a.pos.x += (dx / d) * move * dt; a.pos.z += (dz / d) * move * dt; break;
      }
      case 'watch': want = a.goalYaw + Math.sin(t * 0.35 + a.seed) * 0.9; break;
      case 'still': if (a.timer <= 0) { a.goalYaw += (a.rnd() - 0.5) * 0.8; a.timer = 3 + a.rnd() * 4; if (a.rnd() < 0.15) { try { an.play('taunt'); } catch (e) { /* */ } } } want = a.goalYaw; break;
      default: break;
    }
    for (let i = a.q.length - 1; i >= 0; i--) { a.q[i].t -= dt; if (a.q[i].t <= 0) { const f = a.q[i].fn; a.q.splice(i, 1); f(); } }
    a.yaw += angDiff(a.yaw, want) * Math.min(1, dt * 7);
    an.setMove(move, 0);
    a.rig.root.position.set(a.pos.x, groundAt(a.pos.x, a.pos.z), a.pos.z); a.rig.root.rotation.y = a.yaw;
    a.rig.update(dt);
  }
  function syncGlads(St) {
    const want = (St.glads || []).slice(0, maxGlads), ids = new Set(want.map((g) => g.id));
    for (const [id, a] of actors) if (!ids.has(id)) { a.dispose(); actors.delete(id); }
    want.forEach((g, i) => { let a = actors.get(g.id); if (!a) { a = new Actor(g, i); actors.set(g.id, a); } else { a.g = g; } });
    assign(St);
  }

  // ---------------------------------------------------------------------------------------- orbit camera
  const D2R = Math.PI / 180, PITCH = [15 * D2R, 70 * D2R], DIST = [11, 132];
  const orb = { az: 0.45, pitch: 0.66, dist: 50, target: new V3(0, 1.5, 1.0), vAz: 0, vPitch: 0, vPan: new V3(), vZoom: 0, idleT: 0, touched: false, anim: null, follow: null, aspect: 1.6, enabled: false, drift: true };
  const overviewFor = (aspect) => {
    const vf = camera.fov * D2R, port = aspect < 0.95, halfW = port ? 23 : 29;
    return { az: port ? 0.28 : 0.5, pitch: port ? 0.72 : 0.52, dist: clamp(halfW / (Math.tan(vf / 2) * aspect) * (port ? 1.0 : 1.04), DIST[0], DIST[1]), target: new V3(0, 1.5, port ? 0.5 : 2.0) };
  };
  function clampOrbit() {
    orb.pitch = clamp(orb.pitch, PITCH[0], PITCH[1]); orb.dist = clamp(orb.dist, DIST[0], DIST[1]);
    orb.target.x = clamp(orb.target.x, -22, 22); orb.target.z = clamp(orb.target.z, -17, 19); orb.target.y = clamp(orb.target.y, 0, 5);
  }
  function applyCamera() {
    clampOrbit(); const cp = Math.cos(orb.pitch);
    camera.position.set(orb.target.x + Math.sin(orb.az) * cp * orb.dist, orb.target.y + Math.sin(orb.pitch) * orb.dist, orb.target.z + Math.cos(orb.az) * cp * orb.dist);
    camera.lookAt(orb.target);
  }
  function animateTo(to, dur = 0.9) { orb.anim = { t: 0, dur, from: { az: orb.az, pitch: orb.pitch, dist: orb.dist, target: orb.target.clone() }, to }; orb.vAz = orb.vPitch = orb.vZoom = 0; orb.vPan.set(0, 0, 0); }
  function overview(instant = false) {
    const o = overviewFor(orb.aspect); orb.follow = null;
    if (instant) { orb.az = o.az; orb.pitch = o.pitch; orb.dist = o.dist; orb.target.copy(o.target); applyCamera(); } else animateTo(o, 1.1);
    orb.touched = false;
  }
  function focusPlot(i, opt = {}) {
    const c = plotCenter(i), p = S && S.plots[i], h = p ? buildParts(p.b, p.l).footprint.h : 2.5, port = orb.aspect < 0.95;
    orb.follow = null;
    let az = orb.az; const front = Math.sin(az); if (Math.abs(front) > 0.7) az = Math.sign(front) * 0.7; // keep facades readable
    animateTo({ az, pitch: opt.pitch ?? clamp(orb.pitch, 0.5, 0.75), dist: opt.dist ?? (port ? 34 : 26) + h * 0.7, target: new V3(c.x, c.y + clamp(h * 0.42, 1.2, 3.4), c.z) }, opt.dur ?? 0.85);
    return c;
  }
  function focusGlad(id) {
    const a = actors.get(id); if (!a) return false;
    orb.follow = a; animateTo({ az: orb.az, pitch: clamp(orb.pitch, 0.35, 0.7), dist: orb.aspect < 0.95 ? 15 : 13, target: new V3(a.pos.x, a.pos.y + 1.0, a.pos.z) }, 0.8); return true;
  }
  function stepOrbit(dt, t) {
    if (orb.anim) {
      const A = orb.anim; A.t += dt; const e = ease(clamp(A.t / A.dur));
      orb.az = lerp(A.from.az, A.to.az, e); orb.pitch = lerp(A.from.pitch, A.to.pitch, e); orb.dist = lerp(A.from.dist, A.to.dist, e);
      const tt = A.to.target.clone(); if (orb.follow) tt.set(orb.follow.pos.x, orb.follow.pos.y + 1.0, orb.follow.pos.z);
      orb.target.lerpVectors(A.from.target, tt, e); if (A.t >= A.dur) orb.anim = null; orb.idleT = 0;
    } else {
      if (orb.follow) { const f = orb.follow; orb.target.x += (f.pos.x - orb.target.x) * Math.min(1, dt * 4); orb.target.z += (f.pos.z - orb.target.z) * Math.min(1, dt * 4); orb.target.y += (f.pos.y + 1.0 - orb.target.y) * Math.min(1, dt * 4); }
      orb.az += orb.vAz * dt; orb.pitch += orb.vPitch * dt; orb.dist *= Math.exp(orb.vZoom * dt); orb.target.addScaledVector(orb.vPan, dt);
      const k = Math.exp(-dt * 5.0); orb.vAz *= k; orb.vPitch *= k; orb.vZoom *= k; orb.vPan.multiplyScalar(k);
      orb.idleT += dt;
      if (orb.drift && orb.idleT > 8 && !orb.follow) { const w = clamp((orb.idleT - 8) / 3); orb.az += 0.035 * w * dt; orb.pitch += Math.cos(t * 0.11) * 0.012 * w * dt; orb.dist *= 1 + Math.sin(t * 0.07) * 0.0025 * w; }
    }
    applyCamera();
  }
  // ---- pointer input
  const ptrs = new Map(); let tap = null, pinch = null, lastHoverT = 0;
  const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const touchedNow = () => { orb.idleT = 0; orb.touched = true; orb.anim = null; };
  function onDown(e) {
    if (!orb.enabled) return; try { dom.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button, t: performance.now() });
    touchedNow(); orb.vAz = orb.vPitch = 0; orb.vPan.set(0, 0, 0);
    if (ptrs.size === 1) tap = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, id: e.pointerId };
    else { tap = null; const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
    e.preventDefault();
  }
  function panBy(dx, dy) {
    const H = dom.clientHeight || 600, s = (2 * Math.tan(camera.fov * D2R / 2) * orb.dist) / H, r = new V3(Math.cos(orb.az), 0, -Math.sin(orb.az)), f = new V3(-Math.sin(orb.az), 0, -Math.cos(orb.az));
    const sf = s / Math.max(0.35, Math.sin(orb.pitch));
    orb.target.addScaledVector(r, -dx * s).addScaledVector(f, dy * sf); orb.follow = null;
  }
  function onMove(e) {
    if (!orb.enabled) return;
    const p = ptrs.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse' && performance.now() - lastHoverT > 40) { lastHoverT = performance.now(); const h = pick(e.clientX, e.clientY); setHover(h && h.type === 'plot' && h.empty && h.locked ? h : h); emit('hover', h, e); } return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; touchedNow();
    if (tap) { tap.moved += Math.abs(dx) + Math.abs(dy); }
    if (ptrs.size === 1) {
      const dt = Math.max(0.008, (e.timeStamp - (p.lt || e.timeStamp - 16)) / 1000); p.lt = e.timeStamp;
      if (p.btn === 2 || p.btn === 1 || e.shiftKey || e.ctrlKey) panBy(dx, dy);
      else { const ka = 0.0062, kp = 0.0048; orb.az -= dx * ka; orb.pitch += dy * kp; orb.vAz = lerp(orb.vAz, -dx * ka / dt, 0.4); orb.vPitch = lerp(orb.vPitch, dy * kp / dt, 0.4); orb.follow = null; }
    } else if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (pinch.d > 1) { const k = pinch.d / Math.max(1, d); orb.dist *= k; orb.vZoom = Math.log(k) * 3; }
      panBy(mx - pinch.mx, my - pinch.my); pinch.d = d; pinch.mx = mx; pinch.my = my; tap = null;
    }
    clampOrbit(); e.preventDefault();
  }
  function onUp(e) {
    const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId); try { dom.releasePointerCapture(e.pointerId); } catch (err) { /* */ }
    if (tap && tap.id === e.pointerId && tap.moved < 9 && performance.now() - tap.t < 450) { const r = pick(e.clientX, e.clientY); emit('pick', r, e); if (hub.onPick) hub.onPick(r, e); orb.vAz = orb.vPitch = 0; }
    if (ptrs.size < 2) pinch = null; if (ptrs.size === 0) tap = null;
  }
  function onWheel(e) { if (!orb.enabled) return; e.preventDefault(); touchedNow(); const k = Math.exp(clamp(e.deltaY * (e.deltaMode === 1 ? 16 : 1), -300, 300) * 0.0011); orb.dist *= k; orb.vZoom = Math.log(k) * 2; clampOrbit(); }
  const onCtx = (e) => { if (orb.enabled) e.preventDefault(); };
  const onLeave = () => { setHover(null); };

  // ---------------------------------------------------------------------------------------- picking
  const _box = new THREE.Box3(), _hit = new V3(), _ray = new THREE.Ray();
  function pick(clientX, clientY) {
    if (!S) return null; const r = dom.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1); camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera); _ray.copy(raycaster.ray);
    let best = null, bt = 1e9;
    // gladiators: capsule-ish proxy (sphere chain)
    for (const a of actors.values()) {
      for (const yy of [0.35, 0.9, 1.45]) { const c = new V3(a.pos.x, a.pos.y + yy, a.pos.z), d = _ray.distanceSqToPoint(c); if (d < 0.5 * 0.5) { const t = c.clone().sub(_ray.origin).dot(_ray.direction); if (t > 0 && t < bt) { bt = t; best = { type: 'glad', id: a.id }; } } }
    }
    // plot buildings: footprint boxes
    const rows = S.rows || 2;
    for (let i = 0; i < 16; i++) {
      const [rr] = plotRC(i); if (rr >= rows) continue; const p = S.plots[i]; if (!p) continue;
      const c = plotCenter(i), fp = buildParts(p.b, p.l).footprint;
      _box.min.set(c.x - fp.w / 2, c.y, c.z - fp.d / 2); _box.max.set(c.x + fp.w / 2, c.y + Math.min(fp.h, 12), c.z + fp.d / 2);
      if (_ray.intersectBox(_box, _hit)) { const t = _hit.distanceTo(_ray.origin); if (t < bt) { bt = t; best = { type: 'plot', i, empty: false, locked: false }; } }
    }
    if (best) return best;
    // ground cells (empty pads and locked land)
    for (const h of [terraceH(1), 0.2, terraceH(3)]) {
      const plane = new THREE.Plane(new V3(0, 1, 0), -h); if (!_ray.intersectPlane(plane, _hit)) continue;
      const rr = rowOfZ(_hit.z), cc = Math.round((_hit.x - X0) / PX); if (cc < 0 || cc > 3) continue;
      const i = rr * COLS + cc, c = plotCenter(i);
      if (Math.abs(_hit.x - c.x) < PX / 2 - 0.2 && Math.abs(_hit.z - c.z) < PZ / 2 - 0.1 && Math.abs(c.y - PAD - h) < 0.9 && _hit.z < Z0 + PZ / 2 && _hit.z > -CD) return { type: 'plot', i, empty: !S.plots[i], locked: rr >= rows };
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------- selection / hover
  let sel = null, hover = null;
  const mm4 = new THREE.Matrix4();
  function ringFor(m, s, instant) {
    if (!s) { m.count = 0; return; }
    m.count = 1;
    if (s.type === 'plot') { const c = plotCenter(s.i); const p = S && S.plots[s.i]; const fp = p ? buildParts(p.b, p.l).footprint : { w: 8, d: 5.4 }; mm4.makeScale(Math.max(fp.w, 4.4) + 1.2, 1, Math.max(fp.d, 4.4) + 1.0).setPosition(c.x, c.y + 0.06, c.z); }
    else { const a = actors.get(s.id); if (!a) { m.count = 0; return; } mm4.makeScale(1.7, 1, 1.7).setPosition(a.pos.x, a.pos.y + 0.05, a.pos.z); }
    m.setMatrixAt(0, mm4); m.instanceMatrix.needsUpdate = true;
  }
  function setSelection(s) { sel = s && (s.type === 'plot' || s.type === 'glad') ? s : null; updateHL(); ringFor(selRing, sel); updateLinkStrength(); emit('select', sel); }
  function setHover(s) { const same = (hover === s) || (hover && s && hover.type === s.type && hover.i === s.i && hover.id === s.id); if (same) return; hover = s; updateHL(); updateLinkStrength(); if (dom && orb.enabled) dom.style.cursor = s ? 'pointer' : 'grab'; ringFor(hovRing, hover && !(sel && sel.type === hover.type && sel.i === hover.i && sel.id === hover.id) && (hover.type === 'glad' || (hover.type === 'plot' && (hover.empty || hover.locked))) ? hover : null); }
  function updateHL() {
    hlTarget.fill(0);
    if (hover && hover.type === 'plot' && !hover.empty) hlTarget[hover.i + 1] = 0.38;
    if (sel && sel.type === 'plot' && !sel.empty) hlTarget[sel.i + 1] = 1.0;
  }

  // ---------------------------------------------------------------------------------------- time of day + weather
  let tod = { from: null, to: null, k: 1, cur: null }, hourOverride = null, weatherNow = 'clear', weatherOverride = null;
  const nightU = { set value(v) { env.setNight(v); } };
  function setTarget(preset, instant) {
    if (instant || !tod.cur) { tod.cur = preset; tod.from = tod.to = preset; tod.k = 1; applyPreset(preset); }
    else { tod.from = tod.cur; tod.to = preset; tod.k = 0; }
  }
  function applyPreset(p) {
    applyTOD(p, { rig, scene, sky, renderer, nightUniforms: [nightU] });
    for (let i = 0; i < MAXPLOT; i++) buildingUniforms.uGl.value[i] = clamp(p.night * 1.2);
    flames && flames.update(hubT, p.night);
    smokeU.uLight.value.set(p.sunColor).lerp(new THREE.Color(0xd8d0e0), 0.45); smokeU.uDark.value.set(p.hemiGround).multiplyScalar(0.25);
    dust.setSunColor(p.sunColor);
  }
  const dust = env.dust;
  function weatherState(St) { return weatherOverride || (LMg() ? LMg().weather(St, 'w' + St.week) : 'clear'); }
  let rainAmt = 0, rainTarget = 0, heatTarget = 0;
  function refreshSky(St, instant) {
    weatherNow = weatherState(St); const h = hourOverride ?? hourOf(St);
    setTarget(presetFor(h, weatherNow), instant);
    rainTarget = weatherNow === 'rain' ? 1 : 0; heatTarget = weatherNow === 'heat' ? 1 : 0;
    dust.uniforms.uInt.value = weatherNow === 'dust' ? 3.2 : 1.5; dust.uniforms.uWind.value.set(weatherNow === 'dust' ? 3.2 : 0.5, 0.04, weatherNow === 'dust' ? 1.0 : 0.2);
    buildingUniforms.uWind.value = weatherNow === 'dust' ? 2.4 : weatherNow === 'rain' ? 1.8 : 1.0; smokeU.uWind.value = buildingUniforms.uWind.value;
  }

  // ---------------------------------------------------------------------------------------- public API
  const hub = {
    scene, group, orbit: orb, camera, audio, sky, rig, env, layout: LAYOUT,
    onPick: null,
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => { listeners[type] = listeners[type].filter((f) => f !== fn); }; },
    enter(St) {
      S = St; if (!staticParts) buildStatic();
      dom.style.touchAction = 'none'; dom.style.cursor = 'grab';
      dom.addEventListener('pointerdown', onDown); dom.addEventListener('pointermove', onMove); dom.addEventListener('pointerup', onUp); dom.addEventListener('pointercancel', onUp);
      dom.addEventListener('wheel', onWheel, { passive: false }); dom.addEventListener('contextmenu', onCtx); dom.addEventListener('pointerleave', onLeave);
      orb.enabled = true; entered = true; orb.aspect = (dom.clientWidth || 1100) / (dom.clientHeight || 650); camera.aspect = orb.aspect; camera.updateProjectionMatrix();
      hub.refresh(St, true); overview(true);
      return hub;
    },
    exit() {
      orb.enabled = false; entered = false; ptrs.clear();
      dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointermove', onMove); dom.removeEventListener('pointerup', onUp); dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel); dom.removeEventListener('contextmenu', onCtx); dom.removeEventListener('pointerleave', onLeave);
      setHover(null);
    },
    refresh(St, instant = false) {
      S = St; if (!staticParts) buildStatic();
      const sigs = St.plots.map((p) => (p ? p.b + ':' + p.l : '-')).join(',') + '|' + St.rows + '|' + (St.color || 0) + '|' + (LMg().fest(St, St.week) || '') + '|' + (St.seed || '');
      if (sigs !== sigAll) { sigAll = sigs; rebuildWorld(St); rebuildLinks(St); }
      syncGlads(St); refreshSky(St, instant || !tod.cur);
      if (sel && sel.type === 'plot') ringFor(selRing, sel);
      return hub;
    },
    update(realDt, t) {
      const dt = Math.min(realDt, 0.1); hubT = t != null ? t : hubT + dt;
      buildingUniforms.uTime.value = hubT; smokeU.uTime.value = hubT; sparkU.uTime.value = hubT; linkU.uTime.value = hubT; selMat.uniforms.uTime.value = hovMat.uniforms.uTime.value = padMat.uniforms.uTime.value = hubT;
      const pr = renderer.getPixelRatio(); smokeU.uPR.value = pr; sparkU.uPR.value = pr; dust.update(hubT, pr);
      if (orb.enabled) stepOrbit(dt, hubT); camera.updateMatrixWorld();
      // time of day blend
      if (tod.k < 1) { tod.k = Math.min(1, tod.k + dt / 1.8); tod.cur = lerpTOD(tod.from, tod.to, ease(tod.k)); applyPreset(tod.cur); }
      const night = tod.cur ? tod.cur.night : 0;
      sky.update(camera, hubT); env.update(hubT, dt); if (flames) flames.update(hubT, night);
      rig.sun.target.position.copy(rig.shadowCenter);
      // highlight easing + selection pulse
      for (let i = 0; i < MAXPLOT; i++) { const tg = hlTarget[i] * (i > 0 && sel && sel.type === 'plot' && sel.i + 1 === i ? 0.82 + 0.18 * Math.sin(hubT * 3.2) : 1); hlCur[i] += (tg - hlCur[i]) * Math.min(1, dt * 10); buildingUniforms.uHL.value[i] = hlCur[i]; }
      if (sel && sel.type === 'glad') ringFor(selRing, sel); if (hover && hover.type === 'glad') ringFor(hovRing, hover);
      // rain / heat
      rainAmt += (rainTarget - rainAmt) * Math.min(1, dt * 1.2); rain.visible = rainAmt > 0.02; rainU.uAmt.value = rainAmt; rainU.uTime.value = hubT; rainU.uCenter.value.copy(orb.target);
      if (post && post.uniforms && post.uniforms.uHeat) post.uniforms.uHeat.value += ((heatTarget * 0.6) - post.uniforms.uHeat.value) * Math.min(1, dt * 1.5);
      // ambient life: update only characters near the camera
      for (const a of actors.values()) { const d = a.pos.distanceTo(camera.position); a.rig.root.visible = d < 190; if (d < 95) updateActor(a, dt, hubT); }
    },
    resize(w, h) {
      orb.aspect = w / Math.max(1, h); camera.aspect = orb.aspect; camera.updateProjectionMatrix();
      if (!orb.touched && entered && !orb.anim) overview(true);
    },
    pick, focusPlot, focusGlad, setSelection, setHover, overview,
    getSelection: () => sel,
    plotCenter, groundAt,
    setHour(h) { hourOverride = h; if (S) refreshSky(S, false); },
    setWeather(w) { weatherOverride = w; if (S) refreshSky(S, false); },
    setTier(name) { tier = name; rig.setShadowSize(T().shadow); env.setDensity(Math.max(0.5, T().crowd)); maxGlads = tier === 'low' ? 5 : tier === 'medium' ? 8 : 12; if (S) syncGlads(S); },
    actors,
    stats() {
      let tris = 0; for (const a of actors.values()) tris += a.rig.tris || 0;
      return { glads: actors.size, gladTris: Math.round(tris), links: links.length, flames: buildFx.flames.length, smoke: buildFx.smoke.length, sparks: buildFx.sparks.length, weather: weatherNow, hour: tod.cur ? +(hourOverride ?? (S ? hourOf(S) : 0)).toFixed(1) : 0 };
    },
    dispose() { hub.exit(); for (const a of actors.values()) a.dispose(); actors.clear(); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
  return hub;
}
export { BUILDING_IDS };
