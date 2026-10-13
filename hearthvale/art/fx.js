// Hearthvale FX: a phone-cheap particle system. Particles are billboard quads from ONE procedurally painted atlas, drawn in THREE instanced draw calls:
// 1 alpha-blended layer, 1 additive layer, and (only while it is visible) 1 soft rainbow arc mesh. Budget: 900 live particles (600 alpha + 300 additive).
// Why 900 and 3 draw calls (round 3): fireworks and level-ups spawn trails (every spark drops glow dots) and the rainbow is a real arc mesh, not a billboard;
// everything else (pooled structure-of-arrays, swap-with-last, zero allocation per spawn) is unchanged.
//
// ROUND 2 "Happy Light". WHAT I LEARNED (research notes)
//  1. Juice is mostly timing: a fast pop in (ease-out-back), a slow ease-out, alpha fading over the last 30-40% of life. Linear fades look dead.
//  2. Cheap particles = camera-facing quads in ONE instanced draw call; per-instance data (position, size, rotation, tile, colour) in vertex
//     attributes, billboarding done in the vertex shader from the view matrix. No per-particle objects, no per-spawn allocation.
//  3. Pool in structure-of-arrays Float32Arrays, kill by swap-with-last (O(1)), compact so instanceCount = live count. Hard cap protects phones.
//  4. Cozy smoke is whiter-pastel and SOFT: big low-alpha puffs that rise slowly, grow, swirl and fade; never grey, never hard-edged.
//  5. Sparkles are warm (butter-peach) additive rounded 4-point stars that twinkle (scale with |sin|) and drift up; additive adds glow without bloom.
//  6. Confetti is candy-coloured rects and dots that tumble: fake the 3D flip by squashing one quad axis with cos(age*spin), drag + lazy sway.
//  7. Life-sim feelings are small floating icons: hearts, notes, petals, pop stars, each with an ease-out-back pop-in, a sine sway and a long soft fade.
//  8. Leaves swirl (rotate the velocity vector), petals flutter (squash one axis with cos), dust motes drift in sunbeams.
//  9. Ground rings/ripples are flat quads (flag in the shader) that expand with ease-out and fade; two staggered rings read as a soft ripple.
// 10. Night: tint the alpha layer by a light uniform (setLight) so white smoke is not glowing at midnight; the additive layer stays bright.
// ROUND 3 "more juice"
// 11. Things that LAND bounce (restitution 0.3 to 0.55) and then lie FLAT on the ground (confetti, coins, wood chips): the tiny landing reads as physical.
// 12. Trails: a fast spark drops soft glow dots at a fixed interval (one pooled particle each). Rockets, fireworks and sparkle trails use it. The dots
//     shrink and fade, so a few of them look like a comet tail without any ribbon geometry.
// 13. Every pop has THREE layers: a flat shockwave on the ground, a bright flash, and the icons. Colour variety comes from small palettes, never random hues.
// 14. Bigger on spawn: most particles overshoot (ease-out-back) in their first 12 percent, so they "pop" instead of fading in.

import * as THREE from 'three';

const CAP_A = 600, CAP_B = 300; // alpha layer, additive layer: 900 live particles max
const STR = 24, X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9, ROT = 10, VR = 11, CR = 12, CG = 13, CB = 14, CA = 15, TYPE = 16, TILE = 17, PH = 18, FLAT = 19, AUX = 20, AUX2 = 21, GY = 22, TR = 23;
// tile ids in the 4x4 atlas
const T_CIRCLE = 0, T_STAR = 1, T_HEART = 2, T_LEAF = 3, T_PUFF = 4, T_RING = 5, T_COIN = 6, T_RECT = 7, T_DROP = 8, T_NOTE = 9, T_PETAL = 10, T_STAR5 = 11, T_GEAR = 12, T_GLOW = 13, T_STAR4 = 14;
// particle behaviours
const K_SMOKE = 0, K_DUST = 1, K_SPARK = 2, K_CONF = 3, K_COIN = 4, K_LEAF = 5, K_DROP = 6, K_RING = 7, K_HEART = 8, K_FLASH = 9, K_FOAM = 10, K_NOTE = 11, K_PETAL = 12, K_STARPOP = 13, K_HPOP = 14, K_MOTE = 15,
  K_CHIP = 16, K_SWIRL = 17, K_TRAILDOT = 18, K_ROCKET = 19, K_FWSPARK = 20, K_GEAR = 21, K_COMET = 22;

let atlasCache = null;
function makeAtlas() {
  if (atlasCache) return atlasCache;
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S * 4; const x = c.getContext('2d');
  const at = (i, f) => { x.save(); x.translate((i % 4) * S + S / 2, Math.floor(i / 4) * S + S / 2); f(); x.restore(); };
  const rad = (r, stops) => { const g = x.createRadialGradient(0, 0, 0, 0, 0, r); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
  at(T_CIRCLE, () => { x.fillStyle = rad(28, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); x.beginPath(); x.arc(0, 0, 28, 0, 7); x.fill(); });
  at(T_STAR, () => {
    x.fillStyle = rad(16, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); x.beginPath(); x.arc(0, 0, 16, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineJoin = 'round'; x.lineWidth = 3; x.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, r = i % 2 ? 7.5 : 26; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); x.stroke();
  });
  at(T_HEART, () => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, 24); x.bezierCurveTo(-34, 0, -22, -26, 0, -11); x.bezierCurveTo(22, -26, 34, 0, 0, 24); x.fill(); x.fillStyle = 'rgba(0,0,0,0.12)'; x.beginPath(); x.moveTo(0, 24); x.bezierCurveTo(30, 2, 26, -14, 6, -14); x.bezierCurveTo(18, -4, 14, 10, 0, 24); x.fill(); x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.ellipse(-13, -9, 5, 3, -0.7, 0, 7); x.fill(); });
  at(T_LEAF, () => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(-26, 8); x.quadraticCurveTo(-8, -28, 26, -12); x.quadraticCurveTo(10, 24, -26, 8); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(-24, 8); x.quadraticCurveTo(0, -2, 22, -10); x.stroke(); });
  at(T_PUFF, () => { // an isotropic fluffy cloud: a core and six lobes around it (rotation then never shows a "long" shape)
    const blobs = [[0, 0, 16]]; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; blobs.push([Math.cos(a) * 11, Math.sin(a) * 11, 10 + (i % 2)]); }
    for (const [px, py, r] of blobs) { x.fillStyle = rad(r, [[0, 'rgba(255,255,255,0.75)'], [0.55, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]); x.save(); x.translate(px, py); x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); }
  });
  at(T_RING, () => { x.strokeStyle = rad(29, [[0.55, 'rgba(255,255,255,0)'], [0.82, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); x.lineWidth = 12; x.beginPath(); x.arc(0, 0, 21, 0, 7); x.stroke(); });
  at(T_COIN, () => { x.fillStyle = '#c9a23a'; x.beginPath(); x.arc(0, 0, 26, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 21, 0, 7); x.fill(); x.fillStyle = '#d8b24a'; x.beginPath(); x.arc(0, 0, 14, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(-8, -8, 6, 3, -0.8, 0, 7); x.fill(); });
  at(T_RECT, () => { x.fillStyle = '#fff'; const r = 5; x.beginPath(); x.moveTo(-18 + r, -11); x.lineTo(18 - r, -11); x.quadraticCurveTo(18, -11, 18, -11 + r); x.lineTo(18, 11 - r); x.quadraticCurveTo(18, 11, 18 - r, 11); x.lineTo(-18 + r, 11); x.quadraticCurveTo(-18, 11, -18, 11 - r); x.lineTo(-18, -11 + r); x.quadraticCurveTo(-18, -11, -18 + r, -11); x.fill(); });
  at(T_DROP, () => { x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 20, 0, 7); x.fill(); x.fillStyle = 'rgba(0,0,0,0.12)'; x.beginPath(); x.arc(5, 6, 14, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.arc(-7, -7, 6, 0, 7); x.fill(); });
  at(T_NOTE, () => {
    x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
    x.save(); x.translate(-7, 15); x.rotate(-0.45); x.beginPath(); x.ellipse(0, 0, 12, 8.5, 0, 0, 7); x.fill(); x.restore();
    x.lineWidth = 6; x.beginPath(); x.moveTo(3, 13); x.lineTo(3, -22); x.stroke();
    x.lineWidth = 6.5; x.beginPath(); x.moveTo(3, -22); x.bezierCurveTo(8, -12, 24, -14, 20, 2); x.stroke();
  });
  at(T_PETAL, () => {
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, 25); x.bezierCurveTo(-24, 14, -22, -16, -5, -25); x.quadraticCurveTo(0, -19, 5, -25); x.bezierCurveTo(22, -16, 24, 14, 0, 25); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.07)'; x.beginPath(); x.moveTo(0, 25); x.bezierCurveTo(14, 18, 18, 0, 12, -16); x.bezierCurveTo(10, 0, 6, 14, 0, 25); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.08)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 22); x.lineTo(0, -10); x.stroke();
  });
  at(T_STAR5, () => {
    x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineJoin = 'round'; x.lineWidth = 9; x.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 9 : 19; x.lineTo(Math.cos(a) * r, Math.sin(a) * r + 1); } x.closePath(); x.fill(); x.stroke();
    x.fillStyle = 'rgba(0,0,0,0.09)'; x.beginPath(); x.moveTo(0, 2); x.lineTo(16, 10); x.lineTo(24, 14); x.lineTo(8, 22); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(-6, -8, 5, 3, -0.8, 0, 7); x.fill();
  });
  at(T_GEAR, () => { // a chunky gear: 8 rounded teeth, a hole and a soft inner shade
    x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineJoin = 'round'; x.lineWidth = 5; x.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, w = 0.2; for (const [da, r] of [[-w - 0.14, 18], [-w, 25], [w, 25], [w + 0.14, 18]]) x.lineTo(Math.cos(a + da) * r, Math.sin(a + da) * r); }
    x.closePath(); x.fill(); x.stroke(); x.fillStyle = 'rgba(0,0,0,0.1)'; x.beginPath(); x.arc(0, 0, 13, 0, 7); x.fill(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(0, 0, 7, 0, 7); x.fill(); x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.ellipse(-12, -13, 5, 3, -0.8, 0, 7); x.fill();
  });
  at(T_GLOW, () => { x.fillStyle = rad(31, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.6)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]); x.beginPath(); x.arc(0, 0, 31, 0, 7); x.fill(); });
  at(T_STAR4, () => { // a thin four point glint over a soft glow
    x.fillStyle = rad(14, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); x.beginPath(); x.arc(0, 0, 14, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -30); x.quadraticCurveTo(3, -3, 30, 0); x.quadraticCurveTo(3, 3, 0, 30); x.quadraticCurveTo(-3, 3, -30, 0); x.quadraticCurveTo(-3, -3, 0, -30); x.fill();
  });
  const t = new THREE.CanvasTexture(c); t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.colorSpace = THREE.NoColorSpace; return (atlasCache = t);
}

const VERT = `
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
varying vec2 vUv; varying vec4 vC;
void main(){
  float c = cos(iA.w), s = sin(iA.w);
  vec2 q = position.xy * iB.xy; q = vec2(c*q.x - s*q.y, s*q.x + c*q.y);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = iA.xyz + (iB.w < 0.5 ? right*q.x + up*q.y : vec3(q.x, 0.0, -q.y));
  float tile = iB.z; float col = mod(tile, 4.0); float row = floor(tile / 4.0);
  vUv = (vec2(col, 3.0 - row) + uv) * 0.25; vC = iC;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FRAG = `
uniform sampler2D uMap; uniform float uLight; varying vec2 vUv; varying vec4 vC;
void main(){ vec4 t = texture2D(uMap, vUv); float a = vC.a * t.a; if (a < 0.004) discard; gl_FragColor = vec4(vC.rgb * t.rgb * uLight, a); }`;

class Layer {
  constructor(cap, additive, map, scene) {
    this.cap = cap; this.n = 0; this.cur = 0; this.d = new Float32Array(cap * STR);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage); this.aB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage); this.aC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1); g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv); g.setAttribute('iA', this.aA); g.setAttribute('iB', this.aB); g.setAttribute('iC', this.aC); g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: map }, uLight: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 11 : 10; this.mesh.visible = false; scene.add(this.mesh);
  }
  /** returns base offset into d for a fresh particle (recycles round-robin when full) */
  alloc() { let i; if (this.n < this.cap) i = this.n++; else { i = this.cur = (this.cur + 1) % this.cap; } return i * STR; }
}

// shared scratch, no per-spawn allocation
const _rgb = { r: 1, g: 1, b: 1 }, _rgb2 = { r: 1, g: 1, b: 1 }, _col = new THREE.Color();
const rnd = Math.random, rr = (a, b) => a + (b - a) * Math.random(), pickI = (n) => (Math.random() * n) | 0;
const bk = (p) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2); // ease-out-back, p in 0..1
const pop = (age, dur) => (age >= dur ? 1 : Math.max(0.02, bk(age / dur)));
const PAL_CONF = ['#ff8fb5', '#ffe27a', '#8fe8c8', '#8fd0ff', '#c9a8ff', '#ffb27a', '#ff9fa8', '#b5f08a'];
const PAL_NOTE = ['#ff8fb5', '#8fd0ff', '#b79cff', '#7fe3b0', '#ffd24a'];
const PAL_PETAL = ['#ffb7d0', '#ffc9dc', '#ff9ec2', '#ffd6e6'];
const PAL_STAR = ['#ffd84a', '#fff0a0', '#ffb84a', '#8fe8c8', '#8fd0ff', '#ffb0d0'];
const PAL_HEART = ['#ff7fa8', '#ff9ec0', '#ffb3d0', '#ff8a8a', '#ffa8e0'];
const PAL_WOOD = ['#e0a96b', '#c58a52', '#f0c88a', '#a8704a'];
const PAL_GEAR = ['#b79cff', '#8fd8ff', '#ffd24a', '#8fe8c8'];
const FW_PAL = [['#ff5f8f', '#ff9fd0'], ['#ffc02a', '#ff8a3a'], ['#4fc8ff', '#7fe8d0'], ['#7fe04a', '#d8f04a'], ['#b07cff', '#ff7fd0'], ['#ff8a4a', '#ffd24a']];
const RAINBOW = ['#ff8fa8', '#ffb27a', '#ffe27a', '#9be8b8', '#8fd0ff', '#b79cff', '#e0a0ff'];
const px = (p) => (p.x !== undefined ? p.x : p[0]), py = (p) => (p.y !== undefined ? p.y : p[1]), pz = (p) => (p.z !== undefined ? p.z : p[2]);

/** The rainbow: 7 soft pastel bands on an arc, vertex-coloured with alpha fading toward both feet. One mesh, one draw call, built once. */
function makeRainbow() {
  const SEG = 30, B = 7, W = 0.22, R0 = 3.0, pos = [], col = [], idx = [], c = new THREE.Color();
  for (let b = 0; b < B; b++) {
    c.set(RAINBOW[b]); const r0 = R0 - b * W, r1 = r0 - W * 1.02;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI, ca = Math.cos(a), sa = Math.sin(a), al = Math.min(1, Math.sin(a) * 2.2) * 0.62;
      pos.push(ca * r0, sa * r0, 0, ca * r1, sa * r1, 0); col.push(c.r, c.g, c.b, al, c.r, c.g, c.b, al);
    }
    for (let i = 0; i < SEG; i++) { const k = b * (SEG + 1) * 2 + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1, fog: false });
  const mesh = new THREE.Mesh(g, m); mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 9; return mesh;
}

const ALL_FX = new Set();

export class Fx {
  constructor(scene) {
    this.scene = scene; this.tex = makeAtlas(); this.A = new Layer(CAP_A, false, this.tex, scene); this.Add = new Layer(CAP_B, true, this.tex, scene); this.light = 1;
    /** per-instance time scale (slow motion for dramatic moments; 0 freezes). Multiplied with the global Fx.timeScale. */
    this.timeScale = 1;
    this.rb = makeRainbow(); scene.add(this.rb); this.rbAge = -1; this.rbLife = 6;
    ALL_FX.add(this);
  }
  get count() { return this.A.n + this.Add.n; }
  /** 0..1 daylight multiplier for the alpha layer (smoke/dust/confetti) and the rainbow; sparkles stay bright */
  setLight(v) { this.light = v; this.A.mat.uniforms.uLight.value = v; this.rb.material.color.setScalar(0.45 + 0.55 * v); }
  _rgb(c) { _col.set(c); _col.getRGB(_rgb, THREE.SRGBColorSpace); }
  _rgb2(c) { _col.set(c); _col.getRGB(_rgb2, THREE.SRGBColorSpace); }
  /** low-level spawn. Returns nothing. o: delay seconds (negative start age), rot, vr, flat (lies on the ground), aux, aux2, gy (ground height for bounces) */
  _p(L, type, tile, x, y, z, vx, vy, vz, life, s0, s1, cr, cg, cb, ca, o) {
    const d = L.d, b = L.alloc();
    d[b + X] = x; d[b + Y] = y; d[b + Z] = z; d[b + VX] = vx; d[b + VY] = vy; d[b + VZ] = vz; d[b + AGE] = o && o.delay ? -o.delay : 0; d[b + LIFE] = life; d[b + S0] = s0; d[b + S1] = s1;
    d[b + ROT] = o && o.rot !== undefined ? o.rot : 0; d[b + VR] = o && o.vr !== undefined ? o.vr : 0; d[b + CR] = cr; d[b + CG] = cg; d[b + CB] = cb; d[b + CA] = ca; d[b + TYPE] = type; d[b + TILE] = tile; d[b + PH] = rnd() * 6.283; d[b + FLAT] = o && o.flat ? 1 : 0; d[b + AUX] = o && o.aux !== undefined ? o.aux : 0; d[b + AUX2] = o && o.aux2 !== undefined ? o.aux2 : 0;
    d[b + GY] = o && o.gy !== undefined ? o.gy : -99; d[b + TR] = 0;
  }
  /** spawn from inside the simulation loop: never recycles (a full layer drops the spawn so the particle being stepped is never overwritten) */
  _pp(L, type, tile, x, y, z, vx, vy, vz, life, s0, s1, cr, cg, cb, ca, o) { if (L.n >= L.cap) return; this._p(L, type, tile, x, y, z, vx, vy, vz, life, s0, s1, cr, cg, cb, ca, o); }
  /* ---------------------------------------------------------------- public effects (round 1 and 2) */
  /** chimney / workshop smoke: 3 big SOFT white-lavender puffs, rising slowly, growing, swirling, fading */
  smoke(x, y, z) {
    for (let i = 0; i < 3; i++) { const g = rr(0.96, 1); this._p(this.A, K_SMOKE, T_PUFF, x + rr(-0.05, 0.05), y, z + rr(-0.05, 0.05), rr(-0.05, 0.15), rr(0.4, 0.65), rr(-0.05, 0.05), rr(3.0, 4.0), rr(0.34, 0.46), rr(1.3, 1.8), g, g * 0.975, 1, 0.42, { delay: i * 0.25, rot: rnd() * 6.28, vr: rr(-0.4, 0.4) }); }
  }
  /** ground poof: building placed, footsteps, landing (warm cream puffs) */
  dust(x, y, z) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + rnd(), sp = rr(0.6, 1.4); this._p(this.A, K_DUST, T_PUFF, x + Math.cos(a) * 0.1, y + 0.05, z + Math.sin(a) * 0.1, Math.cos(a) * sp, rr(0.2, 0.6), Math.sin(a) * sp, rr(0.55, 0.85), rr(0.5, 0.7), rr(1.3, 1.8), 1, 0.96, 0.88, 0.7, { rot: rnd() * 6.28, vr: rr(-1.5, 1.5) }); }
  }
  /** twinkling warm stars: a coloured star (so it stays warm on a bright meadow) plus an additive glow twin. Default warm butter-gold. */
  sparkle(x, y, z, color = '#ffc247') {
    this._rgb(color); const r = _rgb.r, g = _rgb.g, bl = _rgb.b;
    for (let i = 0; i < 9; i++) {
      const a = rnd() * 6.283, el = rr(-0.2, 1), sp = rr(0.5, 1.6), px = x + rr(-0.15, 0.15), py = y + rr(-0.05, 0.2), pz = z + rr(-0.15, 0.15), vx = Math.cos(a) * sp * (1 - el * 0.4), vy = 0.6 + el * 1.2, vz = Math.sin(a) * sp * (1 - el * 0.4), life = rr(0.7, 1.2), s0 = rr(0.38, 0.66), rot = rnd() * 3, vr = rr(-3, 3), dl = rnd() * 0.15;
      this._p(this.A, K_SPARK, i % 3 === 0 ? T_STAR4 : T_STAR, px, py, pz, vx, vy, vz, life, s0 * 0.8, 0.05, r, g, bl, 1, { rot, vr, delay: dl });
      this._p(this.Add, K_SPARK, T_STAR, px, py, pz, vx, vy, vz, life, s0 * 1.2, 0.06, r * 0.7 + 0.3, g * 0.7 + 0.3, bl * 0.7 + 0.2, 0.7, { rot, vr, delay: dl });
    }
    this._p(this.Add, K_FLASH, T_GLOW, x, y + 0.1, z, 0, 0, 0, 0.5, 0.3, 1.1, r * 0.6 + 0.4, g * 0.6 + 0.4, bl * 0.6 + 0.3, 0.45);
  }
  /** celebration confetti burst in candy colours (rects and dots) that tumbles down, bounces and lies on the ground for a moment */
  confetti(x, y, z) {
    for (let i = 0; i < 32; i++) {
      this._rgb(PAL_CONF[pickI(PAL_CONF.length)]); const a = rnd() * 6.283, sp = rr(0.8, 3.0), dot = i % 4 === 0;
      this._p(this.A, K_CONF, dot ? T_CIRCLE : T_RECT, x, y, z, Math.cos(a) * sp, rr(3, 6.4), Math.sin(a) * sp, rr(2.2, 3.0), dot ? rr(0.18, 0.26) : rr(0.24, 0.36), dot ? rr(0.18, 0.26) : rr(0.24, 0.36), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 6.28, vr: rr(-5, 5), aux: rr(6, 14), gy: 0.05 });
    }
  }
  /** gold coin jumps up and arcs, with a flash and sparkles */
  coinPop(x, y, z) {
    this._p(this.A, K_COIN, T_COIN, x, y, z, rr(-0.35, 0.35), 4.8, rr(-0.35, 0.35), 1.0, 0.56, 0.56, 1, 0.86, 0.3, 1, { aux: rr(8, 12) });
    this._p(this.Add, K_FLASH, T_GLOW, x, y + 0.1, z, 0, 0, 0, 0.35, 0.2, 1.1, 1, 0.88, 0.45, 0.85);
    this._rgb('#ffe9a0'); for (let i = 0; i < 3; i++) this._p(this.Add, K_SPARK, T_STAR4, x + rr(-0.1, 0.1), y + rr(0, 0.25), z + rr(-0.1, 0.1), rr(-0.8, 0.8), rr(0.5, 1.5), rr(-0.8, 0.8), rr(0.45, 0.8), rr(0.3, 0.46), 0.05, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: rnd() * 0.12 });
  }
  /** a few leaves swirling down in a little spiral */
  leaf(x, y, z) {
    const gr = ['#7fdc5a', '#5fc84e', '#b5e85a', '#ffb24a'];
    for (let i = 0; i < 5; i++) { this._rgb(gr[pickI(gr.length)]); const a = rnd() * 6.283, sp = rr(0.3, 1.0); this._p(this.A, K_LEAF, T_LEAF, x + rr(-0.2, 0.2), y + rr(0, 0.3), z + rr(-0.2, 0.2), Math.cos(a) * sp, rr(0.6, 1.6), Math.sin(a) * sp, rr(1.6, 2.4), rr(0.26, 0.36), rr(0.26, 0.36), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 6.28, vr: rr(-3, 3), delay: i * 0.06, aux: rr(4, 7), aux2: (rnd() < 0.5 ? -1 : 1) * rr(1.8, 3.2) }); }
  }
  /** water splash: droplets + foam + soft double ripple ring (also fine as a rain-drop hit) */
  splash(x, y, z) {
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.283, sp = rr(0.4, 1.3); this._p(this.A, K_DROP, T_DROP, x, y + 0.03, z, Math.cos(a) * sp, rr(2.6, 4.2), Math.sin(a) * sp, rr(0.5, 0.75), rr(0.12, 0.18), rr(0.06, 0.1), 0.78, 0.94, 1, 0.9); }
    this._p(this.A, K_FOAM, T_PUFF, x, y + 0.08, z, 0, 0.4, 0, 0.5, 0.25, 0.65, 0.95, 1, 1, 0.55, { rot: rnd() * 6 });
    this._p(this.A, K_RING, T_RING, x, y + 0.04, z, 0, 0, 0, 0.8, 0.2, 1.3, 0.85, 0.97, 1, 0.8, { flat: true });
    this._p(this.A, K_RING, T_RING, x, y + 0.045, z, 0, 0, 0, 0.8, 0.12, 0.85, 0.85, 0.97, 1, 0.6, { flat: true, delay: 0.12 });
  }
  /** expanding ground ring (level-up, selection, ripple) */
  ring(x, y, z, color = '#ffffff') {
    this._rgb(color);
    this._p(this.A, K_RING, T_RING, x, y + 0.05, z, 0, 0, 0, 0.8, 0.3, 2.6, _rgb.r, _rgb.g, _rgb.b, 0.95, { flat: true });
    this._p(this.A, K_RING, T_RING, x, y + 0.06, z, 0, 0, 0, 0.7, 0.2, 1.7, _rgb.r, _rgb.g, _rgb.b, 0.8, { flat: true, delay: 0.14 });
    this._p(this.Add, K_FLASH, T_GLOW, x, y + 0.2, z, 0, 0, 0, 0.4, 0.4, 1.4, _rgb.r, _rgb.g, _rgb.b, 0.5);
  }
  /** floating hearts (happy villager, animal petted) */
  hearts(x, y, z) {
    for (let i = 0; i < 5; i++) { this._rgb(PAL_HEART[i % 3]); this._p(this.A, K_HEART, T_HEART, x + rr(-0.25, 0.25), y, z + rr(-0.25, 0.25), 0, rr(0.8, 1.3), 0, rr(1.4, 1.9), rr(0.4, 0.54), rr(0.4, 0.54), _rgb.r, _rgb.g, _rgb.b, 1, { delay: i * 0.12, rot: rr(-0.35, 0.35), aux: rr(2, 4) }); }
  }
  /** a burst of hearts radiating outward then floating (adopt an animal, big love moment) */
  heartsBurst(x, y, z) {
    for (let i = 0; i < 10; i++) { this._rgb(PAL_HEART[i % PAL_HEART.length]); const a = (i / 10) * 6.283 + rr(-0.2, 0.2), sp = rr(0.9, 1.7); this._p(this.A, K_HPOP, T_HEART, x, y, z, Math.cos(a) * sp, rr(0.9, 2.0), Math.sin(a) * sp, rr(1.1, 1.6), rr(0.34, 0.5), rr(0.34, 0.5), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rr(-0.5, 0.5), delay: rnd() * 0.08 }); }
    this._p(this.Add, K_FLASH, T_GLOW, x, y, z, 0, 0, 0, 0.45, 0.4, 1.4, 1, 0.7, 0.85, 0.5);
  }
  /** one floating musical note (singing, cheerful work). colour optional */
  note(x, y, z, color) {
    this._rgb(color || PAL_NOTE[pickI(PAL_NOTE.length)]);
    this._p(this.A, K_NOTE, T_NOTE, x + rr(-0.1, 0.1), y, z + rr(-0.1, 0.1), 0, rr(0.55, 0.8), 0, rr(1.5, 2.0), rr(0.52, 0.64), rr(0.52, 0.64), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rr(-0.2, 0.2), aux: rr(2.5, 3.5) });
  }
  /** pink petals drifting down in the breeze (blossom trees, happy places) */
  petal(x, y, z) {
    for (let i = 0; i < 4; i++) { this._rgb(PAL_PETAL[pickI(PAL_PETAL.length)]); this._p(this.A, K_PETAL, T_PETAL, x + rr(-0.3, 0.3), y + rr(0, 0.3), z + rr(-0.3, 0.3), rr(-0.2, 0.4), rr(0.1, 0.5), rr(-0.3, 0.3), rr(2.2, 3.2), rr(0.17, 0.26), rr(0.17, 0.26), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 6.28, vr: rr(-1.8, 1.8), delay: i * 0.18, aux: rr(3, 6) }); }
  }
  /** a pop star: big puffy star that boings in, with a ring of tiny sparkles (quest done, upgrade, reward) */
  star(x, y, z, color = '#ffd84a') {
    this._rgb(color);
    this._p(this.A, K_STARPOP, T_STAR5, x, y, z, 0, 0.5, 0, 1.1, 0.74, 0.74, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rr(-0.25, 0.25) });
    this._p(this.Add, K_FLASH, T_GLOW, x, y, z, 0, 0, 0, 0.5, 0.4, 1.6, _rgb.r, _rgb.g, _rgb.b, 0.55);
    this._rgb('#fff0b0'); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + 0.3; this._p(this.Add, K_SPARK, T_STAR4, x, y, z, Math.cos(a) * 1.5, Math.sin(a) * 1.2 + 0.4, Math.sin(a * 2) * 0.4, rr(0.5, 0.8), rr(0.26, 0.38), 0.05, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: 0.04 }); }
  }
  /** tiny dust motes floating in a sunbeam (ambient; call now and then near a window or tree) */
  mote(x, y, z) {
    for (let i = 0; i < 3; i++) { this._p(this.Add, K_MOTE, T_CIRCLE, x + rr(-0.5, 0.5), y + rr(0, 0.8), z + rr(-0.5, 0.5), 0, 0, 0, rr(3.5, 5.5), rr(0.07, 0.13), 0.05, 1, 0.95, 0.75, 0.6, { delay: rnd() * 0.5, aux: rr(0.5, 1.5) }); }
  }
  /* ---------------------------------------------------------------- ROUND 3 effects */
  /** a burst of stars and hearts (a villager is thrilled, a quest is done, a happy crowd) with a pink-gold flash and a small ground ring */
  cheer(x, y, z) {
    for (let i = 0; i < 7; i++) { this._rgb(PAL_HEART[i % PAL_HEART.length]); const a = (i / 7) * 6.283 + rr(-0.25, 0.25), sp = rr(1.3, 2.4); this._p(this.A, K_HPOP, T_HEART, x, y, z, Math.cos(a) * sp, rr(1.4, 2.8), Math.sin(a) * sp, rr(1.2, 1.7), rr(0.38, 0.54), rr(0.38, 0.54), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rr(-0.5, 0.5), delay: rnd() * 0.08 }); }
    for (let i = 0; i < 9; i++) { this._rgb(PAL_STAR[i % PAL_STAR.length]); const a = (i / 9) * 6.283 + rr(-0.2, 0.2) + 0.3, sp = rr(1.2, 2.9); this._p(this.A, K_HPOP, T_STAR5, x, y, z, Math.cos(a) * sp, rr(1.8, 3.6), Math.sin(a) * sp, rr(1.0, 1.5), rr(0.28, 0.42), rr(0.28, 0.42), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rr(-1, 1), vr: rr(-3, 3), delay: rnd() * 0.1 }); }
    this._p(this.Add, K_FLASH, T_GLOW, x, y, z, 0, 0, 0, 0.5, 0.5, 2.0, 1, 0.82, 0.7, 0.6);
    this._p(this.A, K_RING, T_RING, x, y - 0.5 > 0.06 ? 0.06 : y, z, 0, 0, 0, 0.7, 0.3, 1.8, 1, 0.8, 0.9, 0.7, { flat: true });
    this._rgb('#fff0a0'); for (let i = 0; i < 5; i++) this._p(this.Add, K_SPARK, T_STAR4, x + rr(-0.3, 0.3), y + rr(-0.1, 0.4), z + rr(-0.3, 0.3), rr(-1, 1), rr(0.4, 1.4), rr(-1, 1), rr(0.5, 0.9), rr(0.28, 0.44), 0.05, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: rnd() * 0.2 });
  }
  /** LEVEL UP: a ground shockwave (3 pastel rings and a glow disc), two spiralling rings of rising stars, a tall flash and confetti */
  levelUp(x, y, z) {
    this._rgb('#ffe27a'); this._p(this.A, K_RING, T_RING, x, y + 0.06, z, 0, 0, 0, 1.1, 0.4, 4.4, _rgb.r, _rgb.g, _rgb.b, 0.95, { flat: true });
    this._rgb('#ff9ec4'); this._p(this.A, K_RING, T_RING, x, y + 0.07, z, 0, 0, 0, 1.0, 0.3, 3.2, _rgb.r, _rgb.g, _rgb.b, 0.9, { flat: true, delay: 0.12 });
    this._rgb('#8fe8c8'); this._p(this.A, K_RING, T_RING, x, y + 0.08, z, 0, 0, 0, 0.9, 0.2, 2.2, _rgb.r, _rgb.g, _rgb.b, 0.85, { flat: true, delay: 0.24 });
    this._p(this.Add, K_FLASH, T_GLOW, x, y + 0.05, z, 0, 0, 0, 0.8, 0.6, 4.2, 1, 0.9, 0.5, 0.6, { flat: true });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283, R = 0.85, w = 3.4; this._rgb(PAL_STAR[i % PAL_STAR.length]); this._p(this.A, K_SWIRL, T_STAR5, x + Math.cos(a) * R, y + 0.15, z + Math.sin(a) * R, -Math.sin(a) * R * w, rr(2.6, 3.4), Math.cos(a) * R * w, rr(1.4, 1.9), rr(0.36, 0.5), rr(0.24, 0.34), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-2.5, 2.5), aux2: w, delay: i * 0.035 }); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + 0.4, R = 0.5, w = -4.6; this._rgb('#fff0b0'); this._p(this.Add, K_SWIRL, T_STAR4, x + Math.cos(a) * R, y + 0.1, z + Math.sin(a) * R, -Math.sin(a) * R * w, rr(3.4, 4.2), Math.cos(a) * R * w, rr(1.1, 1.5), rr(0.4, 0.55), rr(0.2, 0.3), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-3, 3), aux2: w, delay: 0.2 + i * 0.04 }); }
    this._p(this.Add, K_FLASH, T_GLOW, x, y + 1.0, z, 0, 0.6, 0, 0.9, 0.6, 3.0, 1, 0.92, 0.55, 0.55, { delay: 0.1 });
    this.confetti(x, y + 1.1, z);
  }
  /** a building goes up: dust clouds puff out all around its footprint (w x h tiles), wood chips fly and bounce, sparkles at the corners */
  build(x, y, z, w = 2, h = 2) {
    const hw = w / 2, hh = h / 2, per = 2 * (w + h), n = Math.min(16, 8 + ((w + h) | 0));
    for (let i = 0; i < n; i++) {
      let t = (i / n) * per, ex, ez; if (t < w) { ex = -hw + t; ez = -hh; } else if (t < w + h) { ex = hw; ez = -hh + (t - w); } else if (t < 2 * w + h) { ex = hw - (t - w - h); ez = hh; } else { ex = -hw; ez = hh - (t - 2 * w - h); }
      const l = Math.hypot(ex, ez) || 1, sp = rr(0.5, 1.2);
      this._p(this.A, K_DUST, T_PUFF, x + ex, y + 0.12, z + ez, (ex / l) * sp, rr(0.3, 0.8), (ez / l) * sp, rr(0.8, 1.3), rr(0.7, 0.95), rr(1.9, 2.6), 1, 0.96, 0.88, 0.75, { rot: rnd() * 6.28, vr: rr(-1.2, 1.2), delay: rnd() * 0.12 });
    }
    for (let i = 0; i < 12; i++) { this._rgb(PAL_WOOD[i % 4]); const a = rnd() * 6.283, sp = rr(1.0, 3.0); this._p(this.A, K_CHIP, T_RECT, x + rr(-hw, hw) * 0.6, y + 0.5, z + rr(-hh, hh) * 0.6, Math.cos(a) * sp, rr(3.2, 5.8), Math.sin(a) * sp, rr(1.6, 2.2), rr(0.1, 0.17), rr(0.1, 0.17), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 6.28, vr: rr(-9, 9), aux: rr(8, 14), gy: y + 0.05, delay: rnd() * 0.1 }); }
    this._rgb('#ffe9a0'); for (const [sx, sz] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) for (let k = 0; k < 2; k++) this._p(this.Add, K_SPARK, T_STAR4, x + sx, y + 0.2, z + sz, rr(-0.4, 0.4), rr(0.8, 1.8), rr(-0.4, 0.4), rr(0.7, 1.1), rr(0.3, 0.48), 0.05, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: 0.15 + rnd() * 0.25 });
  }
  /** a crop or resource is collected: a leafy burst, little bits in the item colour that arc and drop, a pop star and sparkles */
  harvest(x, y, z, color = '#ffd84a') {
    this._rgb(color); const r = _rgb.r, g = _rgb.g, b = _rgb.b;
    this._p(this.Add, K_FLASH, T_GLOW, x, y + 0.2, z, 0, 0, 0, 0.45, 0.3, 1.5, r * 0.6 + 0.4, g * 0.6 + 0.4, b * 0.6 + 0.3, 0.7);
    this._p(this.A, K_RING, T_RING, x, y + 0.05, z, 0, 0, 0, 0.6, 0.2, 1.5, r, g, b, 0.8, { flat: true });
    const gr = ['#7fdc5a', '#5fc84e', '#b5e85a', '#9be86a'];
    for (let i = 0; i < 6; i++) { this._rgb2(gr[pickI(gr.length)]); const a = (i / 6) * 6.283 + rnd() * 0.5, sp = rr(0.8, 1.6); this._p(this.A, K_LEAF, T_LEAF, x, y + 0.3, z, Math.cos(a) * sp, rr(1.6, 2.6), Math.sin(a) * sp, rr(1.3, 1.9), rr(0.28, 0.38), rr(0.28, 0.38), _rgb2.r, _rgb2.g, _rgb2.b, 1, { rot: rnd() * 6.28, vr: rr(-4, 4), delay: i * 0.025, aux: rr(4, 7), aux2: (rnd() < 0.5 ? -1 : 1) * rr(2, 3.4) }); }
    for (let i = 0; i < 5; i++) { const a = rnd() * 6.283, sp = rr(0.8, 1.8); this._p(this.A, K_DROP, T_CIRCLE, x, y + 0.3, z, Math.cos(a) * sp, rr(2.6, 4.4), Math.sin(a) * sp, rr(0.7, 1.0), rr(0.14, 0.2), rr(0.1, 0.14), r, g, b, 1); }
    this._p(this.A, K_STARPOP, T_STAR5, x, y + 0.7, z, 0, 0.8, 0, 0.9, 0.5, 0.5, r, g, b, 1, { rot: rr(-0.2, 0.2) });
    for (let i = 0; i < 5; i++) this._p(this.Add, K_SPARK, T_STAR4, x + rr(-0.2, 0.2), y + rr(0.2, 0.6), z + rr(-0.2, 0.2), rr(-1, 1), rr(0.8, 1.8), rr(-1, 1), rr(0.6, 1.0), rr(0.28, 0.42), 0.05, r * 0.6 + 0.4, g * 0.6 + 0.4, b * 0.6 + 0.3, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: rnd() * 0.15 });
  }
  /** crafting: gears and notes bubble up from a workshop, with a puff and sparkles */
  craft(x, y, z) {
    for (let i = 0; i < 3; i++) { this._rgb(PAL_GEAR[(i + pickI(2)) % 4]); this._p(this.A, K_GEAR, T_GEAR, x + rr(-0.2, 0.2), y, z + rr(-0.2, 0.2), 0, rr(1.3, 1.9), 0, rr(1.3, 1.8), rr(0.4, 0.54), rr(0.4, 0.54), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 6.28, vr: rr(1.5, 3.5) * (i % 2 ? -1 : 1), aux: rr(2.5, 4), delay: i * 0.15 }); }
    for (let i = 0; i < 2; i++) this.note(x + rr(-0.3, 0.3), y + 0.1, z + rr(-0.3, 0.3));
    this._p(this.A, K_DUST, T_PUFF, x, y - 0.05, z, rr(-0.2, 0.2), 0.5, rr(-0.2, 0.2), 0.8, 0.4, 1.2, 1, 0.97, 0.9, 0.55, { rot: rnd() * 6 });
    this._rgb('#fff0b0'); for (let i = 0; i < 4; i++) this._p(this.Add, K_SPARK, T_STAR4, x + rr(-0.3, 0.3), y + rr(0, 0.3), z + rr(-0.3, 0.3), rr(-0.8, 0.8), rr(0.6, 1.5), rr(-0.8, 0.8), rr(0.5, 0.8), rr(0.26, 0.4), 0.05, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: rnd() * 0.2 });
  }
  /** n gold coins (3..16) burst up, arc, bounce on the ground (restitution 0.55), spin flat and fade. y = spawn height, the ground is y 0.05. */
  coinBurst(x, y, z, n = 8) {
    n = Math.max(3, Math.min(16, n | 0));
    this._p(this.Add, K_FLASH, T_GLOW, x, y, z, 0, 0, 0, 0.4, 0.3, 1.5, 1, 0.86, 0.4, 0.8);
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + rnd(), sp = rr(0.8, 2.3); this._p(this.A, K_COIN, T_COIN, x, y, z, Math.cos(a) * sp, rr(4.2, 7), Math.sin(a) * sp, rr(1.7, 2.2), rr(0.46, 0.6), rr(0.46, 0.6), 1, 0.86, 0.3, 1, { aux: rr(10, 16), gy: 0.05, delay: i * 0.035 }); }
    this._rgb('#ffe9a0'); for (let i = 0; i < 5; i++) this._p(this.Add, K_SPARK, T_STAR4, x + rr(-0.2, 0.2), y + rr(0, 0.3), z + rr(-0.2, 0.2), rr(-1.2, 1.2), rr(0.6, 1.8), rr(-1.2, 1.2), rr(0.5, 0.9), rr(0.3, 0.46), 0.05, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: rnd() * 0.2 });
  }
  /** FESTIVAL FIREWORK: a rocket whistles up (dropping glow dots), then bursts into a sphere of coloured stars that each leave a trail, with a flash and a crackle */
  fireworks(x, y, z) {
    const pal = pickI(FW_PAL.length); this._rgb('#ffd890');
    this._p(this.Add, K_ROCKET, T_STAR4, x, y, z, rr(-0.4, 0.4), rr(5.4, 6.4), rr(-0.4, 0.4), rr(0.85, 1.05), 0.36, 0.3, _rgb.r, _rgb.g, _rgb.b, 1, { aux: pal, rot: rnd() * 3, vr: 4 });
    this._p(this.Add, K_FLASH, T_GLOW, x, y + 0.1, z, 0, 0, 0, 0.3, 0.2, 0.9, 1, 0.8, 0.4, 0.6);
  }
  /** a soft pastel rainbow arc (a real mesh: the third draw call) that grows with a bounce, hangs for a few seconds and fades. yaw rotates it around Y. */
  rainbow(x, y, z, yaw = 0) {
    this.rb.position.set(x, y, z); this.rb.rotation.y = yaw; this.rbAge = 0; this.rb.visible = true; this.rb.scale.set(0.05, 0.05, 0.05); this.rb.material.opacity = 0;
    for (let i = 0; i < 10; i++) { const a = (i / 9) * Math.PI, R = 2.55 + rr(-0.3, 0.3); this._rgb(RAINBOW[i % 7]); this._p(this.Add, K_SPARK, T_STAR4, x + Math.cos(a) * R * Math.cos(yaw), y + Math.sin(a) * R, z - Math.cos(a) * R * Math.sin(yaw), rr(-0.2, 0.2), rr(0.2, 0.6), rr(-0.2, 0.2), rr(0.8, 1.3), rr(0.3, 0.5), 0.05, _rgb.r * 0.5 + 0.5, _rgb.g * 0.5 + 0.5, _rgb.b * 0.5 + 0.5, 1, { rot: rnd() * 3, vr: rr(-2, 2), delay: 0.5 + i * 0.08 }); }
  }
  /** a comet of sparkles flies from point a to point b ({x,y,z} or [x,y,z]) in 0.6 s, trailing glow dots, and pops into a little burst at b (a gift, healing, a message) */
  sparkleTrail(a, b, color = '#ffe27a') {
    const ax = px(a), ay = py(a), az = pz(a), bx = px(b), by = py(b), bz = pz(b), T = 0.6; this._rgb(color);
    this._p(this.Add, K_COMET, T_STAR4, ax, ay, az, (bx - ax) / T, (by - ay) / T + 1.2, (bz - az) / T, T, 0.5, 0.4, _rgb.r * 0.5 + 0.5, _rgb.g * 0.5 + 0.5, _rgb.b * 0.5 + 0.5, 1, { rot: rnd() * 3, vr: 5, aux: bx, aux2: bz });
    this._p(this.Add, K_FLASH, T_GLOW, ax, ay, az, 0, 0, 0, 0.3, 0.2, 0.8, _rgb.r, _rgb.g, _rgb.b, 0.6);
  }
  /** a slow pastel water ripple: three thin flat rings expanding one after another */
  ripple(x, y, z, color = '#9fe8ff') {
    this._rgb(color);
    for (let i = 0; i < 3; i++) this._p(this.A, K_RING, T_RING, x, y + 0.04 + i * 0.002, z, 0, 0, 0, 1.4, 0.15, 1.7 - i * 0.2, _rgb.r, _rgb.g, _rgb.b, 0.75 - i * 0.12, { flat: true, delay: i * 0.22 });
  }
  /** a soft glowing pulse on the ground (select, place, a worker arrives) with a quick thin ring and a few sparkles rising. color optional, y optional ground height. */
  groundPulse(x, z, color = '#ffe27a', y = 0.05) {
    this._rgb(color);
    this._p(this.Add, K_FLASH, T_GLOW, x, y, z, 0, 0, 0, 0.7, 0.5, 2.6, _rgb.r, _rgb.g, _rgb.b, 0.6, { flat: true });
    this._p(this.A, K_RING, T_RING, x, y + 0.01, z, 0, 0, 0, 0.55, 0.3, 1.8, _rgb.r, _rgb.g, _rgb.b, 0.9, { flat: true });
    for (let i = 0; i < 4; i++) { const a = rnd() * 6.283, r = rr(0.2, 0.9); this._p(this.Add, K_SPARK, T_STAR4, x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r, 0, rr(0.6, 1.3), 0, rr(0.5, 0.9), rr(0.26, 0.4), 0.05, _rgb.r * 0.5 + 0.5, _rgb.g * 0.5 + 0.5, _rgb.b * 0.5 + 0.5, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: rnd() * 0.25 }); }
  }
  /* ---------------------------------------------------------------- simulation */
  update(dt) {
    dt *= this.timeScale * Fx.timeScale; if (dt <= 0) return;
    if (dt > 0.1) dt = 0.1;
    this._step(this.A, dt); this._step(this.Add, dt); this._stepRainbow(dt);
  }
  _stepRainbow(dt) {
    if (this.rbAge < 0) return; const a = (this.rbAge += dt), L = this.rbLife, m = this.rb;
    if (a >= L) { m.visible = false; this.rbAge = -1; return; }
    const g = a < 0.9 ? bk(a / 0.9) : 1, s = Math.max(0.01, g); m.scale.set(s, s * (0.9 + 0.1 * s), s);
    m.material.opacity = Math.min(1, a / 0.5) * (a > L - 1.6 ? (L - a) / 1.6 : 1) * (0.92 + 0.08 * Math.sin(a * 2.4));
  }
  _step(L, dt) {
    const d = L.d; const A = L.aA.array, Bq = L.aB.array, C = L.aC.array; let i = 0;
    while (i < L.n) {
      const b = i * STR; d[b + AGE] += dt; const age = d[b + AGE], life = d[b + LIFE];
      if (age >= life) { // swap-remove (a rocket or comet finishes with its burst first)
        const ty0 = d[b + TYPE]; if (ty0 === K_ROCKET) this._explode(d, b); else if (ty0 === K_COMET) this._cometEnd(d, b);
        const last = (L.n - 1) * STR; if (b !== last) for (let k = 0; k < STR; k++) d[b + k] = d[last + k]; L.n--; continue;
      }
      let o = i * 4, alpha = 0, size = 0, sy = 1;
      if (age < 0) { Bq[o] = Bq[o + 1] = 0; C[o + 3] = 0; i++; continue; }
      const u = age / life, ph = d[b + PH], ty = d[b + TYPE];
      let vx = d[b + VX], vy = d[b + VY], vz = d[b + VZ];
      const ca = d[b + CA], s0 = d[b + S0], s1 = d[b + S1];
      switch (ty) {
        case K_SMOKE: {
          vx += Math.cos(age * 1.7 + ph) * 0.45 * dt; vz += Math.sin(age * 1.3 + ph) * 0.3 * dt; vy *= 1 - 0.18 * dt; vx *= 1 - 0.4 * dt; vz *= 1 - 0.4 * dt;
          const e = 1 - (1 - u) * (1 - u); size = s0 + (s1 - s0) * e; alpha = ca * Math.min(1, u / 0.12) * (1 - u) * (1 - u) * 1.4; if (alpha > ca) alpha = ca; d[b + ROT] += d[b + VR] * dt; break;
        }
        case K_DUST: { const dr = Math.exp(-3.2 * dt); vx *= dr; vz *= dr; vy *= dr; const e = 1 - (1 - u) * (1 - u); size = (s0 + (s1 - s0) * e) * pop(age, 0.18); alpha = ca * Math.min(1, u / 0.1) * (1 - u); d[b + ROT] += d[b + VR] * dt; break; }
        case K_FOAM: { const e = 1 - (1 - u) * (1 - u); size = s0 + (s1 - s0) * e; vy *= Math.exp(-3 * dt); alpha = ca * (1 - u) * Math.min(1, u / 0.1); break; }
        case K_SPARK: { vy -= 0.8 * dt; const dr = Math.exp(-1.5 * dt); vx *= dr; vz *= dr; const tw = 0.45 + 0.55 * Math.abs(Math.sin(age * 22 + ph)); size = (s0 + (s1 - s0) * u * u) * tw * pop(age, 0.12); alpha = ca * Math.min(1, u / 0.06) * (u > 0.55 ? (1 - u) / 0.45 : 1); d[b + ROT] += d[b + VR] * dt; break; }
        case K_CONF: {
          const gy = d[b + GY];
          if (d[b + FLAT] === 0) {
            vy -= 8 * dt; if (vy < -1.5) vy = -1.5 + (vy + 1.5) * Math.exp(-6 * dt); const dr = Math.exp(-1.6 * dt); vx *= dr; vz *= dr; vx += Math.sin(age * 5 + ph) * 0.9 * dt;
            sy = Math.cos(age * d[b + AUX] + ph); d[b + ROT] += d[b + VR] * dt;
            if (d[b + Y] + vy * dt <= gy && vy < 0) { d[b + FLAT] = 1; vx *= 0.3; vz *= 0.3; vy = 0; d[b + Y] = gy; }
          } else { vx *= Math.exp(-6 * dt); vz *= Math.exp(-6 * dt); vy = 0; sy = 0.62; }
          size = s0 * pop(age, 0.1); alpha = ca * (u > 0.78 ? (1 - u) / 0.22 : 1); break;
        }
        case K_CHIP: {
          const gy = d[b + GY];
          if (d[b + FLAT] === 0) {
            vy -= 12 * dt; sy = 0.55 + 0.45 * Math.cos(age * d[b + AUX] + ph); d[b + ROT] += d[b + VR] * dt;
            if (d[b + Y] + vy * dt <= gy && vy < 0) { if (-vy > 1.2) { vy = -vy * 0.4; vx *= 0.65; vz *= 0.65; d[b + VR] *= 0.5; } else { d[b + FLAT] = 1; vx = vz = vy = 0; d[b + Y] = gy; } }
          } else { sy = 0.6; }
          size = s0 * pop(age, 0.08); alpha = ca * (u > 0.7 ? (1 - u) / 0.3 : 1); break;
        }
        case K_COIN: {
          const gy = d[b + GY]; vy -= 13 * dt; size = s0 * pop(age, 0.1); sy = 1;
          if (d[b + FLAT] === 0) {
            const w = Math.abs(Math.cos(age * d[b + AUX])); d[b + AUX2] = w;
            if (gy > -90 && d[b + Y] + vy * dt <= gy && vy < 0) { if (-vy > 1.6) { vy = -vy * 0.55; vx *= 0.7; vz *= 0.7; d[b + AUX] *= 0.6; this._pp(this.Add, K_SPARK, T_STAR4, d[b + X], gy + 0.1, d[b + Z], 0, 0.5, 0, 0.35, 0.3, 0.05, 1, 0.9, 0.5, 0.9, { rot: rnd() * 3 }); } else { d[b + FLAT] = 1; vx = vz = vy = 0; d[b + Y] = gy; d[b + AUX2] = 1; } }
          } else d[b + AUX2] = 1;
          alpha = ca * (u > 0.8 ? (1 - u) / 0.2 : 1); break;
        }
        case K_LEAF: { const sw = d[b + AUX2] * dt, cw = Math.cos(sw), sn = Math.sin(sw), nvx = vx * cw - vz * sn; vz = vx * sn + vz * cw; vx = nvx; vy -= 3 * dt; if (vy < -0.9) vy = -0.9; const dr = Math.exp(-1.2 * dt); vx *= dr; vz *= dr; vx += Math.sin(age * d[b + AUX] + ph) * 1.4 * dt; size = s0 * pop(age, 0.1); sy = 0.55 + 0.45 * Math.cos(age * 5 + ph); alpha = ca * (u > 0.7 ? (1 - u) / 0.3 : 1) * Math.min(1, u / 0.05); d[b + ROT] += d[b + VR] * dt; break; }
        case K_DROP: { vy -= 13 * dt; size = s0 + (s1 - s0) * u; sy = 1 + Math.min(1.2, Math.abs(vy) * 0.18); alpha = ca * (u > 0.6 ? (1 - u) / 0.4 : 1); break; }
        case K_RING: { const e = 1 - (1 - u) * (1 - u) * (1 - u); size = s0 + (s1 - s0) * e; alpha = ca * (1 - u) * (1 - u) * Math.min(1, u / 0.05); break; }
        case K_HEART: {
          vx = Math.sin(age * d[b + AUX] + ph) * 0.35; vy *= 1 - 0.5 * dt; const p = pop(age, 0.18 * life), beat = 1 + Math.sin(age * 9 + ph) * 0.05 * Math.min(1, age * 2);
          size = s0 * p * beat; sy = 1 / beat; alpha = ca * (u > 0.6 ? (1 - u) / 0.4 : 1); break;
        }
        case K_NOTE: {
          const p = pop(age, 0.16 * life); vx = Math.sin(age * d[b + AUX] + ph) * 0.4; vy *= 1 - 0.35 * dt;
          size = s0 * p; d[b + ROT] = Math.sin(age * d[b + AUX] + ph) * 0.3; alpha = ca * (u > 0.62 ? (1 - u) / 0.38 : 1); break;
        }
        case K_PETAL: {
          vy -= 0.9 * dt; if (vy < -0.45) vy = -0.45 + (vy + 0.45) * Math.exp(-5 * dt); vx += Math.sin(age * 2.2 + ph) * 1.1 * dt; vz += Math.cos(age * 1.7 + ph) * 0.8 * dt; const dr = Math.exp(-1.0 * dt); vx *= dr; vz *= dr;
          size = s0; sy = 0.35 + 0.65 * Math.abs(Math.cos(age * d[b + AUX] + ph)); alpha = ca * (u > 0.65 ? (1 - u) / 0.35 : 1) * Math.min(1, u / 0.06); d[b + ROT] += d[b + VR] * dt; break;
        }
        case K_STARPOP: {
          const p = Math.min(1, u / 0.22), pp = p >= 1 ? 1 : Math.max(0.01, bk(p)); vy *= 1 - 1.5 * dt;
          size = s0 * (p >= 1 ? 1 + Math.sin((u - 0.22) * 14) * 0.05 * (1 - u) : pp); alpha = ca * (u > 0.6 ? (1 - u) / 0.4 : 1); break;
        }
        case K_HPOP: {
          vy -= 0.5 * dt; const dr = Math.exp(-2.2 * dt); vx *= dr; vz *= dr; vy *= Math.exp(-0.6 * dt); d[b + ROT] += d[b + VR] * dt;
          size = s0 * pop(age, 0.15 * life); alpha = ca * (u > 0.55 ? (1 - u) / 0.45 : 1); break;
        }
        case K_MOTE: { vx = Math.sin(age * 0.8 * d[b + AUX] + ph) * 0.1; vy = 0.04 + Math.sin(age * 0.6 + ph * 2) * 0.05; vz = Math.cos(age * 0.7 * d[b + AUX] + ph) * 0.08; size = s0 * (0.7 + 0.3 * Math.sin(age * 2.4 + ph)); alpha = ca * Math.sin(u * 3.1416) * (0.6 + 0.4 * Math.sin(age * 3 + ph)); break; }
        case K_FLASH: { const e = 1 - (1 - u) * (1 - u); size = s0 + (s1 - s0) * e; alpha = ca * (1 - u) * (1 - u); break; }
        case K_SWIRL: { // helix: rotate the velocity about Y so the star circles its centre while it rises and slows
          const sw = d[b + AUX2] * dt, cw = Math.cos(sw), sn = Math.sin(sw), nvx = vx * cw - vz * sn; vz = vx * sn + vz * cw; vx = nvx; vy *= Math.exp(-0.9 * dt);
          size = (s0 + (s1 - s0) * u) * pop(age, 0.14) * (0.75 + 0.25 * Math.abs(Math.sin(age * 14 + ph))); alpha = ca * (u > 0.5 ? (1 - u) / 0.5 : 1); d[b + ROT] += d[b + VR] * dt; break;
        }
        case K_TRAILDOT: { vy += 0.25 * dt; size = s0 * (1 - u * 0.85); alpha = ca * (1 - u) * (1 - u); break; }
        case K_GEAR: { vy *= Math.exp(-0.6 * dt); vx = Math.sin(age * d[b + AUX] + ph) * 0.35; size = s0 * pop(age, 0.2); d[b + ROT] += d[b + VR] * dt; alpha = ca * (u > 0.6 ? (1 - u) / 0.4 : 1); break; }
        case K_ROCKET: { // whistles up, wobbling, dropping gold glow dots
          vy -= 3.5 * dt; vx += Math.sin(age * 9 + ph) * 0.6 * dt; size = s0 * (0.85 + 0.15 * Math.abs(Math.sin(age * 30))); alpha = 1; d[b + ROT] += d[b + VR] * dt;
          d[b + TR] += dt; if (d[b + TR] > 0.025) { d[b + TR] = 0; this._pp(this.Add, K_TRAILDOT, T_GLOW, d[b + X], d[b + Y] - 0.05, d[b + Z], rr(-0.15, 0.15), rr(-0.3, 0.1), rr(-0.15, 0.15), 0.45, 0.24, 0.05, 1, 0.8, 0.4, 0.85); }
          break;
        }
        case K_FWSPARK: {
          vy -= 3.0 * dt; const dr = Math.exp(-1.7 * dt); vx *= dr; vz *= dr; vy *= Math.exp(-0.6 * dt);
          const tw = 0.7 + 0.3 * Math.abs(Math.sin(age * 26 + ph)); size = (s0 + (s1 - s0) * u) * tw * pop(age, 0.1); alpha = ca * (u > 0.45 ? Math.pow((1 - u) / 0.55, 1.4) : 1); d[b + ROT] += d[b + VR] * dt;
          d[b + TR] += dt; if (d[b + TR] > 0.06 && u < 0.8) { d[b + TR] = 0; this._pp(this.Add, K_TRAILDOT, T_GLOW, d[b + X], d[b + Y], d[b + Z], 0, -0.1, 0, 0.45, 0.28, 0.04, d[b + CR], d[b + CG], d[b + CB], 0.95); }
          break;
        }
        case K_COMET: { // flies a lifted arc to the target; a glowing head dropping bright dots
          vy -= 4.0 * dt; size = s0 * (0.85 + 0.15 * Math.abs(Math.sin(age * 24))); alpha = 1; d[b + ROT] += d[b + VR] * dt;
          d[b + TR] += dt; if (d[b + TR] > 0.02) { d[b + TR] = 0; this._pp(this.Add, K_TRAILDOT, T_GLOW, d[b + X], d[b + Y], d[b + Z], rr(-0.2, 0.2), rr(-0.1, 0.4), rr(-0.2, 0.2), 0.5, 0.2, 0.04, d[b + CR], d[b + CG], d[b + CB], 0.8); if (rnd() < 0.5) this._pp(this.Add, K_SPARK, T_STAR4, d[b + X], d[b + Y], d[b + Z], rr(-0.4, 0.4), rr(0.1, 0.6), rr(-0.4, 0.4), 0.5, 0.2, 0.04, 1, 0.95, 0.7, 1, { rot: rnd() * 3, vr: rr(-3, 3) }); }
          break;
        }
      }
      d[b + VX] = vx; d[b + VY] = vy; d[b + VZ] = vz;
      d[b + X] += vx * dt; d[b + Y] += vy * dt; d[b + Z] += vz * dt;
      if (d[b + FLAT] === 0 && d[b + Y] < 0.02 && (ty === K_LEAF || ty === K_DROP || ty === K_PETAL)) { alpha *= 0.0; }
      A[o] = d[b + X]; A[o + 1] = d[b + Y]; A[o + 2] = d[b + Z]; A[o + 3] = d[b + ROT];
      const sx = ty === K_COIN ? Math.max(0.12, d[b + AUX2]) * size : size;
      Bq[o] = sx; Bq[o + 1] = Math.abs(sy) * size + 0.0001; Bq[o + 2] = d[b + TILE]; Bq[o + 3] = d[b + FLAT];
      C[o] = d[b + CR]; C[o + 1] = d[b + CG]; C[o + 2] = d[b + CB]; C[o + 3] = alpha;
      i++;
    }
    L.mesh.visible = L.n > 0; L.mesh.geometry.instanceCount = L.n;
    if (L.n > 0) { L.aA.needsUpdate = L.aB.needsUpdate = L.aC.needsUpdate = true; }
  }
  /** the rocket at d[b..] reached its apex: flash, a ring and a sphere of trailing stars (two layers of speed), then a crackle of delayed glints */
  _explode(d, b) {
    const x = d[b + X], y = d[b + Y], z = d[b + Z], pal = FW_PAL[d[b + AUX] | 0], L = this.Add;
    this._rgb(pal[0]); this._rgb2(pal[1]); const r0 = _rgb.r, g0 = _rgb.g, b0 = _rgb.b, r1 = _rgb2.r, g1 = _rgb2.g, b1 = _rgb2.b, style = pickI(3);
    this._pp(L, K_FLASH, T_GLOW, x, y, z, 0, 0, 0, 0.55, 0.8, 4.5, r1, g1, b1, 0.8);
    this._pp(L, K_FLASH, T_GLOW, x, y, z, 0, 0, 0, 0.9, 0.6, 2.6, r0, g0, b0, 0.5);
    const n = 22;
    for (let i = 0; i < n; i++) {
      let dx, dy, dz; const k = i + 0.5, ph = Math.acos(1 - (2 * k) / n), th = Math.PI * (1 + Math.sqrt(5)) * k; // fibonacci sphere: even coverage
      if (style === 1) { dx = Math.cos(th); dy = Math.sin(th) * 0.35; dz = Math.sin(th + 1.6) * 0.35 + Math.sin(th) * 0.0; const a = (i / n) * 6.283; dx = Math.cos(a); dy = 0.08 * Math.sin(a * 3); dz = Math.sin(a); } else { dx = Math.sin(ph) * Math.cos(th); dy = Math.cos(ph); dz = Math.sin(ph) * Math.sin(th); }
      const sp = rr(3.0, 4.6) * (i % 2 ? 0.7 : 1), c = i % 2 ? 1 : 0;
      this._pp(L, K_FWSPARK, i % 3 === 0 ? T_STAR4 : T_STAR, x, y, z, dx * sp, dy * sp, dz * sp, rr(1.1, 1.5), rr(0.4, 0.55), 0.12, c ? r1 : r0, c ? g1 : g0, c ? b1 : b0, 1, { rot: rnd() * 3, vr: rr(-4, 4) });
    }
    for (let i = 0; i < 8; i++) this._pp(L, K_SPARK, T_STAR4, x + rr(-0.6, 0.6), y + rr(-0.6, 0.6), z + rr(-0.6, 0.6), rr(-0.8, 0.8), rr(-0.4, 0.6), rr(-0.8, 0.8), rr(0.5, 0.9), rr(0.3, 0.46), 0.05, r1, g1, b1, 1, { rot: rnd() * 3, vr: rr(-4, 4), delay: 0.35 + rnd() * 0.5 });
  }
  _cometEnd(d, b) {
    const x = d[b + X], y = d[b + Y], z = d[b + Z], r = d[b + CR], g = d[b + CG], bl = d[b + CB], L = this.Add;
    this._pp(L, K_FLASH, T_GLOW, x, y, z, 0, 0, 0, 0.4, 0.3, 1.4, r, g, bl, 0.8);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + 0.4; this._pp(L, K_SPARK, T_STAR4, x, y, z, Math.cos(a) * 1.2, rr(0.2, 1.2), Math.sin(a) * 1.2, rr(0.5, 0.8), rr(0.28, 0.4), 0.05, r, g, bl, 1, { rot: rnd() * 3, vr: rr(-3, 3) }); }
  }
  /** remove every live particle and hide the rainbow */
  clear() { this.A.n = 0; this.Add.n = 0; this.A.mesh.visible = this.Add.mesh.visible = false; this.rbAge = -1; this.rb.visible = false; }
  /** clear every Fx instance (scene change, "stop all effects") */
  static clear() { for (const f of ALL_FX) f.clear(); }
  dispose() {
    for (const L of [this.A, this.Add]) { this.scene.remove(L.mesh); L.mesh.geometry.dispose(); L.mat.dispose(); }
    this.scene.remove(this.rb); this.rb.geometry.dispose(); this.rb.material.dispose(); ALL_FX.delete(this);
    this.tex.dispose(); atlasCache = null;
  }
}
/** global time scale for every Fx (1 = normal, 0.3 = slow motion, 0 = frozen); multiplied with each instance's own timeScale */
Fx.timeScale = 1;
