// Hearthvale FX: a phone-cheap particle system. TWO draw calls total (one alpha-blended InstancedBufferGeometry mesh, one additive),
// both drawing billboard quads from a single procedurally painted atlas (circle, star, heart, leaf, puff, ring, coin, confetti, drop).
//
// ROUND 2 "Happy Light". WHAT I LEARNED (research notes)
//  1. Juice is mostly timing: a fast pop in (ease-out-back), a slow ease-out, alpha fading over the last 30-40% of life. Linear fades look dead.
//  2. Cheap particles = camera-facing quads in ONE instanced draw call; per-instance data (position, size, rotation, tile, colour) in vertex
//     attributes, billboarding done in the vertex shader from the view matrix. No per-particle objects, no per-spawn allocation.
//  3. Pool in structure-of-arrays Float32Arrays, kill by swap-with-last (O(1)), compact so instanceCount = live count. Hard cap protects phones.
//  4. Cozy smoke is whiter-pastel and SOFT: big low-alpha puffs that rise slowly, grow, swirl and fade; never grey, never hard-edged.
//  5. Sparkles are warm (butter-peach) additive rounded 4-point stars that twinkle (scale with |sin|) and drift up; additive adds glow without bloom.
//  6. Confetti is candy-coloured rects and dots that tumble: fake the 3D flip by squashing one quad axis with cos(age*spin), drag + lazy sway.
//  7. Life-sim feelings are small floating icons: hearts (love), musical notes (singing, happy work), pink petals drifting, pop stars (reward),
//     each with an ease-out-back pop-in, a sine sway and a long soft fade. Bursts radiate with drag so they hang in the air a moment.
//  8. Leaves swirl (rotate the velocity vector), petals flutter (squash one axis with cos), dust motes drift in sunbeams (tiny, slow, twinkling, additive).
//  9. Ground rings/ripples are flat quads (flag in the shader) that expand with ease-out and fade; two staggered rings read as a soft ripple.
// 10. Night: tint the alpha layer by a light uniform (setLight) so white smoke is not glowing at midnight; the additive layer stays bright.

import * as THREE from 'three';

const CAP_A = 420, CAP_B = 180; // alpha layer, additive layer: 600 live particles max
const STR = 22, X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9, ROT = 10, VR = 11, CR = 12, CG = 13, CB = 14, CA = 15, TYPE = 16, TILE = 17, PH = 18, FLAT = 19, AUX = 20, AUX2 = 21;
// tile ids in the 4x4 atlas
const T_CIRCLE = 0, T_STAR = 1, T_HEART = 2, T_LEAF = 3, T_PUFF = 4, T_RING = 5, T_COIN = 6, T_RECT = 7, T_DROP = 8, T_NOTE = 9, T_PETAL = 10, T_STAR5 = 11;
// particle behaviours
const K_SMOKE = 0, K_DUST = 1, K_SPARK = 2, K_CONF = 3, K_COIN = 4, K_LEAF = 5, K_DROP = 6, K_RING = 7, K_HEART = 8, K_FLASH = 9, K_FOAM = 10, K_NOTE = 11, K_PETAL = 12, K_STARPOP = 13, K_HPOP = 14, K_MOTE = 15;

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
  at(T_PUFF, () => {
    for (const [px, py, r] of [[0, 2, 17], [-12, 5, 12], [12, 6, 12], [-5, -9, 12], [8, -7, 11]]) { x.fillStyle = rad(r, [[0, 'rgba(255,255,255,0.8)'], [0.55, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]); x.save(); x.translate(px, py); x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); }
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
    x.fillStyle = 'rgba(255,255,255,0.0)';
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
const _rgb = { r: 1, g: 1, b: 1 }, _col = new THREE.Color();
const rnd = Math.random, rr = (a, b) => a + (b - a) * Math.random();
const PAL_CONF = ['#ff8fb5', '#ffe27a', '#8fe8c8', '#8fd0ff', '#c9a8ff', '#ffb27a', '#ff9fa8', '#b5f08a'];
const PAL_NOTE = ['#ff8fb5', '#8fd0ff', '#b79cff', '#7fe3b0', '#ffd24a'];
const PAL_PETAL = ['#ffb7d0', '#ffc9dc', '#ff9ec2', '#ffd6e6'];

export class Fx {
  constructor(scene) {
    this.scene = scene; this.tex = makeAtlas(); this.A = new Layer(CAP_A, false, this.tex, scene); this.Add = new Layer(CAP_B, true, this.tex, scene); this.light = 1;
  }
  get count() { return this.A.n + this.Add.n; }
  /** 0..1 daylight multiplier for the alpha layer (smoke/dust/confetti); sparkles stay bright */
  setLight(v) { this.light = v; this.A.mat.uniforms.uLight.value = v; }
  _rgb(c) { _col.set(c); _col.getRGB(_rgb, THREE.SRGBColorSpace); }
  /** low-level spawn. Returns nothing. delay seconds (negative start age). */
  _p(L, type, tile, x, y, z, vx, vy, vz, life, s0, s1, cr, cg, cb, ca, o) {
    const d = L.d, b = L.alloc();
    d[b + X] = x; d[b + Y] = y; d[b + Z] = z; d[b + VX] = vx; d[b + VY] = vy; d[b + VZ] = vz; d[b + AGE] = o ? -(o.delay || 0) : 0; d[b + LIFE] = life; d[b + S0] = s0; d[b + S1] = s1;
    d[b + ROT] = o && o.rot !== undefined ? o.rot : 0; d[b + VR] = o && o.vr !== undefined ? o.vr : 0; d[b + CR] = cr; d[b + CG] = cg; d[b + CB] = cb; d[b + CA] = ca; d[b + TYPE] = type; d[b + TILE] = tile; d[b + PH] = rnd() * 6.283; d[b + FLAT] = o && o.flat ? 1 : 0; d[b + AUX] = o && o.aux !== undefined ? o.aux : 0; d[b + AUX2] = o && o.aux2 !== undefined ? o.aux2 : 0;
  }
  /* ---------------------------------------------------------------- public effects */
  /** chimney / workshop smoke: 3 big SOFT white-lavender puffs, rising slowly, growing, swirling, fading */
  smoke(x, y, z) {
    for (let i = 0; i < 3; i++) { const g = rr(0.96, 1); this._p(this.A, K_SMOKE, T_PUFF, x + rr(-0.05, 0.05), y, z + rr(-0.05, 0.05), rr(-0.05, 0.15), rr(0.4, 0.65), rr(-0.05, 0.05), rr(3.0, 4.0), rr(0.34, 0.46), rr(1.3, 1.8), g, g * 0.975, 1, 0.42, { delay: i * 0.25, rot: rnd() * 6.28, vr: rr(-0.4, 0.4) }); }
  }
  /** ground poof: building placed, footsteps, landing (warm cream puffs) */
  dust(x, y, z) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + rnd(), sp = rr(0.6, 1.4); this._p(this.A, K_DUST, T_PUFF, x + Math.cos(a) * 0.1, y + 0.05, z + Math.sin(a) * 0.1, Math.cos(a) * sp, rr(0.2, 0.6), Math.sin(a) * sp, rr(0.55, 0.85), rr(0.45, 0.65), rr(1.2, 1.7), 1, 0.96, 0.88, 0.7, { rot: rnd() * 6.28, vr: rr(-1.5, 1.5) }); }
  }
  /** twinkling warm stars: a coloured star (so it stays warm on a bright meadow) plus an additive glow twin. Default warm butter-gold. */
  sparkle(x, y, z, color = '#ffc247') {
    this._rgb(color); const r = _rgb.r, g = _rgb.g, bl = _rgb.b;
    for (let i = 0; i < 9; i++) {
      const a = rnd() * 6.283, el = rr(-0.2, 1), sp = rr(0.5, 1.6), px = x + rr(-0.15, 0.15), py = y + rr(-0.05, 0.2), pz = z + rr(-0.15, 0.15), vx = Math.cos(a) * sp * (1 - el * 0.4), vy = 0.6 + el * 1.2, vz = Math.sin(a) * sp * (1 - el * 0.4), life = rr(0.7, 1.2), s0 = rr(0.34, 0.6), rot = rnd() * 3, vr = rr(-3, 3), dl = rnd() * 0.15;
      this._p(this.A, K_SPARK, T_STAR, px, py, pz, vx, vy, vz, life, s0 * 0.8, 0.05, r, g, bl, 1, { rot, vr, delay: dl });
      this._p(this.Add, K_SPARK, T_STAR, px, py, pz, vx, vy, vz, life, s0 * 1.15, 0.06, r * 0.7 + 0.3, g * 0.7 + 0.3, bl * 0.7 + 0.2, 0.7, { rot, vr, delay: dl });
    }
  }
  /** celebration confetti burst in candy colours (rects and dots) */
  confetti(x, y, z) {
    for (let i = 0; i < 30; i++) {
      this._rgb(PAL_CONF[(rnd() * PAL_CONF.length) | 0]); const a = rnd() * 6.283, sp = rr(0.8, 2.8), dot = i % 4 === 0;
      this._p(this.A, K_CONF, dot ? T_CIRCLE : T_RECT, x, y, z, Math.cos(a) * sp, rr(3, 6.2), Math.sin(a) * sp, rr(1.8, 2.5), dot ? rr(0.16, 0.24) : rr(0.22, 0.34), dot ? rr(0.16, 0.24) : rr(0.22, 0.34), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 6.28, vr: rr(-5, 5), aux: rr(6, 14) });
    }
  }
  /** gold coin jumps up and arcs, with a flash and sparkles */
  coinPop(x, y, z) {
    this._p(this.A, K_COIN, T_COIN, x, y, z, rr(-0.35, 0.35), 4.8, rr(-0.35, 0.35), 1.0, 0.5, 0.5, 1, 0.86, 0.3, 1, { aux: rr(8, 12) });
    this._p(this.Add, K_FLASH, T_CIRCLE, x, y + 0.1, z, 0, 0, 0, 0.3, 0.15, 0.95, 1, 0.88, 0.45, 0.8);
    this._rgb('#ffe9a0'); for (let i = 0; i < 3; i++) this._p(this.Add, K_SPARK, T_STAR, x + rr(-0.1, 0.1), y + rr(0, 0.25), z + rr(-0.1, 0.1), rr(-0.8, 0.8), rr(0.5, 1.5), rr(-0.8, 0.8), rr(0.45, 0.8), rr(0.28, 0.42), 0.05, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: rnd() * 0.12 });
  }
  /** a few leaves swirling down in a little spiral */
  leaf(x, y, z) {
    const gr = ['#7fdc5a', '#5fc84e', '#b5e85a', '#ffb24a'];
    for (let i = 0; i < 5; i++) { this._rgb(gr[(rnd() * gr.length) | 0]); const a = rnd() * 6.283, sp = rr(0.3, 1.0); this._p(this.A, K_LEAF, T_LEAF, x + rr(-0.2, 0.2), y + rr(0, 0.3), z + rr(-0.2, 0.2), Math.cos(a) * sp, rr(0.6, 1.6), Math.sin(a) * sp, rr(1.6, 2.4), rr(0.24, 0.34), rr(0.24, 0.34), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 6.28, vr: rr(-3, 3), delay: i * 0.06, aux: rr(4, 7), aux2: (rnd() < 0.5 ? -1 : 1) * rr(1.8, 3.2) }); }
  }
  /** water splash: droplets + foam + soft double ripple ring (also fine as a rain-drop hit) */
  splash(x, y, z) {
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.283, sp = rr(0.4, 1.3); this._p(this.A, K_DROP, T_DROP, x, y + 0.03, z, Math.cos(a) * sp, rr(2.6, 4.2), Math.sin(a) * sp, rr(0.5, 0.75), rr(0.11, 0.17), rr(0.06, 0.1), 0.78, 0.94, 1, 0.9); }
    this._p(this.A, K_FOAM, T_PUFF, x, y + 0.08, z, 0, 0.4, 0, 0.5, 0.25, 0.65, 0.95, 1, 1, 0.55, { rot: rnd() * 6 });
    this._p(this.A, K_RING, T_RING, x, y + 0.04, z, 0, 0, 0, 0.8, 0.2, 1.3, 0.85, 0.97, 1, 0.8, { flat: true });
    this._p(this.A, K_RING, T_RING, x, y + 0.045, z, 0, 0, 0, 0.8, 0.12, 0.85, 0.85, 0.97, 1, 0.6, { flat: true, delay: 0.12 });
  }
  /** expanding ground ring (level-up, selection, ripple) */
  ring(x, y, z, color = '#ffffff') {
    this._rgb(color);
    this._p(this.A, K_RING, T_RING, x, y + 0.05, z, 0, 0, 0, 0.8, 0.3, 2.6, _rgb.r, _rgb.g, _rgb.b, 0.95, { flat: true });
    this._p(this.A, K_RING, T_RING, x, y + 0.06, z, 0, 0, 0, 0.7, 0.2, 1.7, _rgb.r, _rgb.g, _rgb.b, 0.8, { flat: true, delay: 0.14 });
    this._p(this.Add, K_FLASH, T_CIRCLE, x, y + 0.2, z, 0, 0, 0, 0.35, 0.4, 1.2, _rgb.r, _rgb.g, _rgb.b, 0.5);
  }
  /** floating hearts (happy villager, animal petted) */
  hearts(x, y, z) {
    const P = ['#ff7fa8', '#ff9ec0', '#ffb3d0'];
    for (let i = 0; i < 5; i++) { this._rgb(P[i % 3]); this._p(this.A, K_HEART, T_HEART, x + rr(-0.25, 0.25), y, z + rr(-0.25, 0.25), 0, rr(0.8, 1.3), 0, rr(1.4, 1.9), rr(0.36, 0.5), rr(0.36, 0.5), _rgb.r, _rgb.g, _rgb.b, 1, { delay: i * 0.12, rot: rr(-0.35, 0.35), aux: rr(2, 4) }); }
  }
  /** a burst of hearts radiating outward then floating (adopt an animal, big love moment) */
  heartsBurst(x, y, z) {
    const P = ['#ff7fa8', '#ff9ec0', '#ffb3d0', '#ffa8e0', '#ffc2a8'];
    for (let i = 0; i < 10; i++) { this._rgb(P[i % P.length]); const a = (i / 10) * 6.283 + rr(-0.2, 0.2), sp = rr(0.9, 1.7); this._p(this.A, K_HPOP, T_HEART, x, y, z, Math.cos(a) * sp, rr(0.9, 2.0), Math.sin(a) * sp, rr(1.1, 1.6), rr(0.3, 0.46), rr(0.3, 0.46), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rr(-0.5, 0.5), delay: rnd() * 0.08 }); }
    this._p(this.Add, K_FLASH, T_CIRCLE, x, y, z, 0, 0, 0, 0.4, 0.3, 1.1, 1, 0.7, 0.85, 0.5);
  }
  /** one floating musical note (singing, cheerful work). colour optional */
  note(x, y, z, color) {
    this._rgb(color || PAL_NOTE[(rnd() * PAL_NOTE.length) | 0]);
    this._p(this.A, K_NOTE, T_NOTE, x + rr(-0.1, 0.1), y, z + rr(-0.1, 0.1), 0, rr(0.55, 0.8), 0, rr(1.5, 2.0), rr(0.5, 0.6), rr(0.5, 0.6), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rr(-0.2, 0.2), aux: rr(2.5, 3.5) });
  }
  /** pink petals drifting down in the breeze (blossom trees, happy places) */
  petal(x, y, z) {
    for (let i = 0; i < 4; i++) { this._rgb(PAL_PETAL[(rnd() * PAL_PETAL.length) | 0]); this._p(this.A, K_PETAL, T_PETAL, x + rr(-0.3, 0.3), y + rr(0, 0.3), z + rr(-0.3, 0.3), rr(-0.2, 0.4), rr(0.1, 0.5), rr(-0.3, 0.3), rr(2.2, 3.2), rr(0.17, 0.26), rr(0.17, 0.26), _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 6.28, vr: rr(-1.8, 1.8), delay: i * 0.18, aux: rr(3, 6) }); }
  }
  /** a pop star: big puffy star that boings in, with a ring of tiny sparkles (quest done, upgrade, reward) */
  star(x, y, z, color = '#ffd84a') {
    this._rgb(color);
    this._p(this.A, K_STARPOP, T_STAR5, x, y, z, 0, 0.5, 0, 1.1, 0.7, 0.7, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rr(-0.25, 0.25) });
    this._p(this.Add, K_FLASH, T_CIRCLE, x, y, z, 0, 0, 0, 0.4, 0.3, 1.3, _rgb.r, _rgb.g, _rgb.b, 0.55);
    this._rgb('#fff0b0'); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283 + 0.3; this._p(this.Add, K_SPARK, T_STAR, x, y, z, Math.cos(a) * 1.5, Math.sin(a) * 1.2 + 0.4, Math.sin(a * 2) * 0.4, rr(0.5, 0.8), rr(0.22, 0.34), 0.05, _rgb.r, _rgb.g, _rgb.b, 1, { rot: rnd() * 3, vr: rr(-3, 3), delay: 0.04 }); }
  }
  /** tiny dust motes floating in a sunbeam (ambient; call now and then near a window or tree) */
  mote(x, y, z) {
    for (let i = 0; i < 3; i++) { this._p(this.Add, K_MOTE, T_CIRCLE, x + rr(-0.5, 0.5), y + rr(0, 0.8), z + rr(-0.5, 0.5), 0, 0, 0, rr(3.5, 5.5), rr(0.07, 0.13), 0.05, 1, 0.95, 0.75, 0.6, { delay: rnd() * 0.5, aux: rr(0.5, 1.5) }); }
  }
  /* ---------------------------------------------------------------- simulation */
  update(dt) {
    if (dt > 0.1) dt = 0.1;
    this._step(this.A, dt); this._step(this.Add, dt);
  }
  _step(L, dt) {
    const d = L.d; const A = L.aA.array, Bq = L.aB.array, C = L.aC.array; let i = 0;
    while (i < L.n) {
      const b = i * STR; d[b + AGE] += dt; const age = d[b + AGE], life = d[b + LIFE];
      if (age >= life) { // swap-remove
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
        case K_DUST: { const dr = Math.exp(-3.2 * dt); vx *= dr; vz *= dr; vy *= dr; const e = 1 - (1 - u) * (1 - u); size = s0 + (s1 - s0) * e; alpha = ca * Math.min(1, u / 0.1) * (1 - u); d[b + ROT] += d[b + VR] * dt; break; }
        case K_FOAM: { const e = 1 - (1 - u) * (1 - u); size = s0 + (s1 - s0) * e; vy *= Math.exp(-3 * dt); alpha = ca * (1 - u) * Math.min(1, u / 0.1); break; }
        case K_SPARK: { vy -= 0.8 * dt; const dr = Math.exp(-1.5 * dt); vx *= dr; vz *= dr; const tw = 0.45 + 0.55 * Math.abs(Math.sin(age * 22 + ph)); size = (s0 + (s1 - s0) * u * u) * tw; alpha = ca * Math.min(1, u / 0.06) * (u > 0.55 ? (1 - u) / 0.45 : 1); d[b + ROT] += d[b + VR] * dt; break; }
        case K_CONF: {
          vy -= 8 * dt; if (vy < -1.5) vy = -1.5 + (vy + 1.5) * Math.exp(-6 * dt); const dr = Math.exp(-1.6 * dt); vx *= dr; vz *= dr; vx += Math.sin(age * 5 + ph) * 0.9 * dt;
          size = s0; sy = Math.cos(age * d[b + AUX] + ph); alpha = ca * (u > 0.75 ? (1 - u) / 0.25 : 1); d[b + ROT] += d[b + VR] * dt; break;
        }
        case K_COIN: { vy -= 13 * dt; size = s0; sy = 1; const w = Math.abs(Math.cos(age * d[b + AUX])); d[b + AUX2] = w; alpha = ca * (u > 0.8 ? (1 - u) / 0.2 : 1); break; }
        case K_LEAF: { const sw = d[b + AUX2] * dt, cw = Math.cos(sw), sn = Math.sin(sw), nvx = vx * cw - vz * sn; vz = vx * sn + vz * cw; vx = nvx; vy -= 3 * dt; if (vy < -0.9) vy = -0.9; const dr = Math.exp(-1.2 * dt); vx *= dr; vz *= dr; vx += Math.sin(age * d[b + AUX] + ph) * 1.4 * dt; size = s0; sy = 0.55 + 0.45 * Math.cos(age * 5 + ph); alpha = ca * (u > 0.7 ? (1 - u) / 0.3 : 1) * Math.min(1, u / 0.05); d[b + ROT] += d[b + VR] * dt; break; }
        case K_DROP: { vy -= 13 * dt; size = s0 + (s1 - s0) * u; sy = 1 + Math.min(1.2, Math.abs(vy) * 0.18); alpha = ca * (u > 0.6 ? (1 - u) / 0.4 : 1); break; }
        case K_RING: { const e = 1 - (1 - u) * (1 - u) * (1 - u); size = s0 + (s1 - s0) * e; alpha = ca * (1 - u) * (1 - u) * Math.min(1, u / 0.05); break; }
        case K_HEART: {
          vx = Math.sin(age * d[b + AUX] + ph) * 0.35; vy *= 1 - 0.5 * dt; const p = Math.min(1, u / 0.18), pop = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2); // ease-out-back
          size = s0 * (p >= 1 ? 1 : Math.max(0.01, pop)); alpha = ca * (u > 0.6 ? (1 - u) / 0.4 : 1); break;
        }
        case K_NOTE: {
          const p = Math.min(1, u / 0.16), pop = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2); vx = Math.sin(age * d[b + AUX] + ph) * 0.4; vy *= 1 - 0.35 * dt;
          size = s0 * (p >= 1 ? 1 : Math.max(0.01, pop)); d[b + ROT] = Math.sin(age * d[b + AUX] + ph) * 0.3; alpha = ca * (u > 0.62 ? (1 - u) / 0.38 : 1); break;
        }
        case K_PETAL: {
          vy -= 0.9 * dt; if (vy < -0.45) vy = -0.45 + (vy + 0.45) * Math.exp(-5 * dt); vx += Math.sin(age * 2.2 + ph) * 1.1 * dt; vz += Math.cos(age * 1.7 + ph) * 0.8 * dt; const dr = Math.exp(-1.0 * dt); vx *= dr; vz *= dr;
          size = s0; sy = 0.35 + 0.65 * Math.abs(Math.cos(age * d[b + AUX] + ph)); alpha = ca * (u > 0.65 ? (1 - u) / 0.35 : 1) * Math.min(1, u / 0.06); d[b + ROT] += d[b + VR] * dt; break;
        }
        case K_STARPOP: {
          const p = Math.min(1, u / 0.22), pop = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2); vy *= 1 - 1.5 * dt;
          size = s0 * (p >= 1 ? 1 + Math.sin((u - 0.22) * 14) * 0.05 * (1 - u) : Math.max(0.01, pop)); alpha = ca * (u > 0.6 ? (1 - u) / 0.4 : 1); break;
        }
        case K_HPOP: {
          vy -= 0.5 * dt; const dr = Math.exp(-2.2 * dt); vx *= dr; vz *= dr; vy *= Math.exp(-0.6 * dt); const p = Math.min(1, u / 0.15), pop = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
          size = s0 * (p >= 1 ? 1 : Math.max(0.01, pop)); alpha = ca * (u > 0.55 ? (1 - u) / 0.45 : 1); break;
        }
        case K_MOTE: { vx = Math.sin(age * 0.8 * d[b + AUX] + ph) * 0.1; vy = 0.04 + Math.sin(age * 0.6 + ph * 2) * 0.05; vz = Math.cos(age * 0.7 * d[b + AUX] + ph) * 0.08; size = s0 * (0.7 + 0.3 * Math.sin(age * 2.4 + ph)); alpha = ca * Math.sin(u * 3.1416) * (0.6 + 0.4 * Math.sin(age * 3 + ph)); break; }
        case K_FLASH: { const e = 1 - (1 - u) * (1 - u); size = s0 + (s1 - s0) * e; alpha = ca * (1 - u) * (1 - u); break; }
      }
      d[b + VX] = vx; d[b + VY] = vy; d[b + VZ] = vz;
      d[b + X] += vx * dt; d[b + Y] += vy * dt; d[b + Z] += vz * dt;
      if (d[b + FLAT] === 0 && d[b + Y] < 0.02 && (ty === K_CONF || ty === K_LEAF || ty === K_COIN || ty === K_DROP || ty === K_PETAL)) { alpha *= 0.0; }
      A[o] = d[b + X]; A[o + 1] = d[b + Y]; A[o + 2] = d[b + Z]; A[o + 3] = d[b + ROT];
      const sx = ty === K_COIN ? Math.max(0.12, d[b + AUX2]) * size : size;
      Bq[o] = sx; Bq[o + 1] = Math.abs(sy) * size + 0.0001; Bq[o + 2] = d[b + TILE]; Bq[o + 3] = d[b + FLAT];
      C[o] = d[b + CR]; C[o + 1] = d[b + CG]; C[o + 2] = d[b + CB]; C[o + 3] = alpha;
      i++;
    }
    L.mesh.visible = L.n > 0; L.mesh.geometry.instanceCount = L.n;
    if (L.n > 0) { L.aA.needsUpdate = L.aB.needsUpdate = L.aC.needsUpdate = true; }
  }
  clear() { this.A.n = 0; this.Add.n = 0; this.A.mesh.visible = this.Add.mesh.visible = false; }
  dispose() {
    for (const L of [this.A, this.Add]) { this.scene.remove(L.mesh); L.mesh.geometry.dispose(); L.mat.dispose(); }
    this.tex.dispose(); atlasCache = null;
  }
}
