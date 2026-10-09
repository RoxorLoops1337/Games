// Encore Island 3D, effects: ONE GPU particle system + ground rings / light beams / sparkle sprites + lightning ribbons (3 draw calls total).
//   * particles live in preallocated ring buffers (start position, velocity, gravity, birth, life ...) and are animated entirely in the vertex shader,
//     so a burst costs a few typed-array writes and no allocation. Blending is premultiplied: per particle `add` 0 = candy "over", 1 = additive glow.
//   * the 2D game's own effect arrays (S.parts, S.fx, S.fly) are re-drawn every frame from a rewritten "bridge" tail of the same buffers.
//   * API (also stored on V.fx):  burst  ring  puff  confetti  beam  zap  glowAt (immediate glow for other modules)  flyers (S.fly hand-off to loot3d)
// Units: WORLD units (x*W, h, y*W). Never touches S except to read. update order requirement: none (immediates are cleared after render).
import * as THREE from 'three';
import * as kit from './kit.js';

const W = kit.W, PI = Math.PI;
const RING = 2200, BRIDGE = 1000, N = RING + BRIDGE, ZMAX = 360, GMAX = 420, FLY_MAX = 160;
const rnd = Math.random, easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), easeOut = (t) => 1 - Math.pow(1 - t, 3);
const _col = new THREE.Color(), _cc = new Map();
/** css/hex colour -> cached [r,g,b] in linear working space (the shaders output linear, the renderer converts) */
function rgb(c) {
  let v = _cc.get(c); if (v) return v;
  try { _col.set(c); } catch (e) { _col.set(0xffffff); }
  v = [_col.r, _col.g, _col.b]; _cc.set(c, v); return v;
}
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------------------------------------ particle shader
// attributes: aP0 (xyz start, size) aV (xyz velocity, gravity) aT (birth, life, drag, spin) aC (rgb, kind) aE (sizeEnd, additive 0..1, fade-in, fade-out start)
// kinds: 0 soft glow, 1 candy disc, 2 sparkle star, 3 confetti, 4 velocity streak
const P_VS = `
uniform float uT;
attribute vec4 aP0, aV, aT, aC, aE;
varying vec2 vC; varying vec4 vCol; varying float vK, vSh, vAdd;
void main() {
  float age = uT - aT.x, life = aT.y;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float u = age / life, d = aT.z, grav = aV.w;
  float D = d > 0.0 ? (1.0 - exp(-d * age)) / d : age;
  vec3 pos = aP0.xyz;
  pos.xz += aV.xz * D;
  pos.y += aV.y * (grav > 0.0 ? age : D) - 0.5 * grav * age * age;
  if (grav > 0.0) pos.y = max(pos.y, 0.05);
  float kind = floor(aC.w + 0.01), seed = fract(sin(dot(aP0.xyz, vec3(12.9898, 78.233, 37.719)) + aT.x * 3.1) * 43758.5453);
  float sz = aP0.w * mix(1.0, aE.x, u);
  float env = smoothstep(0.0, max(aE.z, 0.001), u) * (1.0 - smoothstep(aE.w, 1.0, u));
  vec2 c = position.xy; vec3 wp;
  if (kind > 3.5) {
    vec3 vel = vec3(aV.x * exp(-d * age), aV.y - grav * age, aV.z * exp(-d * age));
    float sp = length(vel) + 0.001; vec3 ax = vel / sp, tc = normalize(cameraPosition - pos), sd = normalize(cross(ax, tc) + vec3(1e-5));
    wp = pos + ax * c.y * sz * (0.6 + sp * 0.18) + sd * c.x * sz * 0.32;
  } else {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float ang = seed * 6.2832 + aT.w * age, ca = cos(ang), sa = sin(ang);
    vec2 q = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
    if (kind > 2.5 && kind < 3.5) q.x *= cos(age * 7.0 + seed * 6.2832);
    wp = pos + (right * q.x + up * q.y) * sz;
  }
  vC = c; vK = kind; vAdd = aE.y; vSh = cos(age * 7.0 + seed * 6.2832); vCol = vec4(aC.rgb, env);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const P_FS = `
varying vec2 vC; varying vec4 vCol; varying float vK, vSh, vAdd;
void main() {
  float r = length(vC), a = 0.0; vec3 col = vCol.rgb;
  if (vK < 0.5) { a = pow(max(0.0, 1.0 - r), 2.0); col *= 1.0 + a * 1.2; }
  else if (vK < 1.5) { a = smoothstep(1.0, 0.82, r); col = mix(col, vec3(1.0), 0.45 * smoothstep(0.1, 0.9, dot(vC, vec2(-0.55, 0.7)) * 0.9 + 0.4)); col *= 1.0 - 0.22 * smoothstep(0.5, 1.0, r); }
  else if (vK < 2.5) { vec2 p = abs(vC); float f = sqrt(p.x) + sqrt(p.y); a = max(1.0 - smoothstep(0.7, 1.0, f), 0.45 * pow(max(0.0, 1.0 - r), 2.0)); col = mix(col, vec3(1.0), smoothstep(0.55, 0.0, r)) * 1.25; }
  else if (vK < 3.5) { vec2 p = abs(vC); a = 1.0 - smoothstep(0.82, 1.0, max(p.x, p.y * 1.5)); col *= 0.72 + 0.4 * abs(vSh); }
  else { a = pow(max(0.0, 1.0 - abs(vC.x)), 1.6) * pow(max(0.0, 1.0 - abs(vC.y)), 0.55); col = mix(col, vec3(1.0), 0.5 * a) * 1.2; }
  a *= vCol.a;
  gl_FragColor = vec4(col * a, a * (1.0 - vAdd));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------------------------------------ glow shader (rings / beams / glow + sparkle sprites)
const G_VS = `
uniform float uT;
attribute float aK, aSel; attribute vec2 aUv;
attribute vec4 aPos, aScl, aCol, aTm;
varying vec2 vUv; varying vec4 vCol; varying float vK, vTh, vDash;
void main() {
  if (abs(aK - aSel) > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float life = aTm.y, age = uT - aTm.x, u = aTm.z, th = aTm.w, K = aK;
  if (life > 0.0) { u = age / life; if (age < 0.0 || u > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } }
  float env = 1.0;
  if (life > 0.0) env = K < 0.5 ? smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.5, 1.0, u)) : K < 1.5 ? 1.0 - u : pow(1.0 - u, 2.0) * smoothstep(0.0, 0.04, u);
  vec3 wp; vDash = 0.0;
  if (K < 1.5) {
    vec3 s = aScl.xyz;
    if (K > 0.5) { vDash = aScl.w; if (life > 0.0) { s.xz *= mix(0.25, 1.0, 1.0 - pow(1.0 - u, 3.0)); th *= 1.0 - 0.6 * u; } }
    else if (life > 0.0) s.y *= 1.0 - pow(1.0 - min(1.0, u * 5.0), 2.0);
    vec3 lp = position * s;
    if (K < 0.5) { float ct = cos(aScl.w), st = sin(aScl.w); lp = vec3(lp.x, lp.y * ct - lp.z * st, lp.y * st + lp.z * ct); }
    float cy = cos(aPos.w), sy = sin(aPos.w); lp = vec3(lp.x * cy + lp.z * sy, lp.y, -lp.x * sy + lp.z * cy);
    wp = aPos.xyz + lp;
  } else {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float cr = cos(aPos.w), sr = sin(aPos.w); vec2 q = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr);
    wp = aPos.xyz + (right * q.x + up * q.y) * aScl.x;
  }
  vUv = aUv; vK = K; vTh = th; vCol = vec4(aCol.rgb, aCol.a * env);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const G_FS = `
uniform float uT;
varying vec2 vUv; varying vec4 vCol; varying float vK, vTh, vDash;
void main() {
  float r = length(vUv), a = 0.0, nrm = 0.0; vec3 col = vCol.rgb;
  if (vK < 0.5) { a = pow(max(0.0, 1.0 - vUv.y), 1.25) * (0.62 + 0.38 * sin(vUv.x * 18.85 + uT * 1.7)) * smoothstep(0.0, 0.06, vUv.y) * 0.55; col = mix(col, vec3(1.0), 0.25 * (1.0 - vUv.y)); }          // light beam
  else if (vK < 1.5) { float d = abs(r - (1.0 - vTh * 0.5)); a = 1.0 - smoothstep(vTh * 0.22, vTh * 0.5, d); a *= r < 1.0 + vTh * 0.1 ? 1.0 : 0.0;
    a += 0.1 * (1.0 - smoothstep(0.0, 1.0, r)); a *= mix(1.0, 0.45 + 0.55 * cos(atan(vUv.y, vUv.x) * 3.0), vDash); nrm = 0.7; col = mix(col, vec3(1.0), 0.25 * a); }         // ground ring (mostly "over", so it reads on the pastel ground)
  else if (vK < 2.5) { a = pow(max(0.0, 1.0 - r), 2.0); col = mix(col, vec3(1.0), 0.5 * pow(max(0.0, 1.0 - r), 3.0)); }                                                         // glow sprite
  else { vec2 p = abs(vUv); float h = exp(-p.y * 10.0) * (1.0 - p.x), v = exp(-p.x * 10.0) * (1.0 - p.y); a = max(h, v) + 0.7 * pow(max(0.0, 1.0 - r * 1.7), 2.0); col = mix(col, vec3(1.0), clamp(a, 0.0, 1.0)); } // sparkle flare
  a *= vCol.a;
  gl_FragColor = vec4(col * a, a * nrm);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// ------------------------------------------------------------------------------------------------ lightning ribbon shader
const Z_VS = `
attribute vec4 aA, aB, aCol; varying vec2 vUv; varying vec4 vCol;
void main() {
  vec3 A = aA.xyz, B = aB.xyz, dir = B - A; vec3 mid = mix(A, B, 0.5), tc = normalize(cameraPosition - mid), sd = normalize(cross(dir, tc) + vec3(1e-5)), dn = normalize(dir + vec3(1e-5));
  vec3 p = mix(A, B, position.x) + sd * position.y * aA.w + dn * (position.x * 2.0 - 1.0) * aA.w * 0.6;
  vUv = position.xy; vCol = aCol; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const Z_FS = `
varying vec2 vUv; varying vec4 vCol;
void main() { float a = pow(max(0.0, 1.0 - abs(vUv.y)), 1.4) * vCol.a; gl_FragColor = vec4(vCol.rgb * a, 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const premult = (extra = {}) => Object.assign({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, fog: false, side: THREE.DoubleSide }, extra);
const iattr = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };

export function init(V) {
  const dynRoot = V.dyn || V.scene, uT = { value: 0 };
  let clock = 0;
  const lod = () => { const q = V.quality && V.quality.particles; return q === undefined ? 1 : Math.max(0.25, q); };

  // ---------------------------------------------------------------- particles
  const quad = new THREE.BufferGeometry(); quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); quad.setIndex([0, 1, 2, 0, 2, 3]);
  const pg = new THREE.InstancedBufferGeometry(); pg.index = quad.index; pg.setAttribute('position', quad.attributes.position); pg.instanceCount = N;
  const PA = {}; for (const k of ['aP0', 'aV', 'aT', 'aC', 'aE']) { PA[k] = iattr(N, 4); pg.setAttribute(k, PA[k]); }
  for (let i = 0; i < N; i++) PA.aT.array[i * 4] = 1e9; // never born
  const pmat = new THREE.ShaderMaterial({ vertexShader: P_VS, fragmentShader: P_FS, uniforms: { uT }, ...premult() });
  const pmesh = new THREE.Mesh(pg, pmat); pmesh.frustumCulled = false; pmesh.renderOrder = 20; pmesh.name = 'fx_particles'; dynRoot.add(pmesh);
  let head = 0, dLo = N, dHi = -1, bUsed = 0, bPrev = 0;
  /** write one particle into slot i. All times are in the module clock. */
  function put(i, x, y, z, vx, vy, vz, size, grav, birth, life, drag, spin, r, g, b, kind, sEnd, add, fin, fout) {
    const o = i * 4, p0 = PA.aP0.array, v = PA.aV.array, t = PA.aT.array, c = PA.aC.array, e = PA.aE.array;
    p0[o] = x; p0[o + 1] = y; p0[o + 2] = z; p0[o + 3] = size; v[o] = vx; v[o + 1] = vy; v[o + 2] = vz; v[o + 3] = grav;
    t[o] = birth; t[o + 1] = life; t[o + 2] = drag; t[o + 3] = spin; c[o] = r; c[o + 1] = g; c[o + 2] = b; c[o + 3] = kind;
    e[o] = sEnd; e[o + 1] = add; e[o + 2] = fin; e[o + 3] = fout;
  }
  function spawn(x, y, z, vx, vy, vz, size, grav, life, drag, spin, col, kind, sEnd, add, fin = 0.06, fout = 0.55, delay = 0) {
    const i = head; head = (head + 1) % RING; if (i < dLo) dLo = i; if (i > dHi) dHi = i;
    put(i, x, y, z, vx, vy, vz, size, grav, clock + delay, life, drag, spin, col[0], col[1], col[2], kind, sEnd, add, fin, fout);
  }
  const PASTEL = [0xff7eb6, 0xffd84d, 0x9af0b4, 0x8fe3f0, 0xc6a8ff, 0xfff4e6, 0xff9a2e];
  const tmpc = [0, 0, 0];
  const colorOf = (cs, i) => { if (!cs || !cs.length) return rgb(0xfff4e6); return rgb(cs[i % cs.length]); };
  /** radial burst of candy dots / stars. o: x y z n colors speed up size life grav star (bool or 0..1 chance) drag flash */
  function burst(o) {
    const n = Math.max(1, Math.round((o.n ?? 14) * lod())), sp = o.speed ?? 3.2, up = o.up ?? 1.6, size = o.size ?? 0.16, life = o.life ?? 0.75, grav = o.grav ?? 7, cs = o.colors, star = o.star === true ? 1 : o.star ? +o.star : 0, drag = o.drag ?? 1.4;
    for (let i = 0; i < n; i++) {
      const a = rnd() * PI * 2, cy = rnd() * 2 - 1, sr = Math.sqrt(1 - cy * cy), k = sp * (0.35 + 0.65 * rnd()), c = colorOf(cs, i), isStar = rnd() < star;
      const l = life * (0.7 + 0.5 * rnd()), s = size * (0.7 + 0.7 * rnd());
      spawn(o.x, o.y ?? 0.3, o.z, Math.cos(a) * sr * k, cy * k * 0.7 + up * (0.5 + 0.5 * rnd()), Math.sin(a) * sr * k, isStar ? s * 1.6 : s, grav, l, drag, (rnd() - 0.5) * 8, c, isStar ? 2 : 1, isStar ? 0.3 : 0.55, isStar ? 0.8 : 0.12);
    }
    if (o.flash !== false && n >= 5) spawn(o.x, o.y ?? 0.3, o.z, 0, 0, 0, size * 7, 0, 0.22, 0, 0, colorOf(cs, 0), 0, 0.3, 1, 0.02, 0.2);
  }
  function puff(x, y, z, n = 6, color = 0xfff4e6, up = 0.6) {
    n = Math.max(1, Math.round(n * lod())); const c = rgb(color);
    for (let i = 0; i < n; i++) { const a = rnd() * PI * 2, k = 0.5 + rnd() * 1.1; spawn(x, y, z, Math.cos(a) * k, up * (0.4 + rnd()), Math.sin(a) * k, 0.2 + rnd() * 0.16, 0, 0.55 + rnd() * 0.3, 2.6, (rnd() - 0.5) * 2, c, 1, 1.9, 0.12, 0.1, 0.4); }
  }
  /** one cheap drifting dot (trails and ambient sparkle for other modules). col is an [r,g,b] array from rgb() or a hex */
  function trail(x, y, z, col, size = 0.12, life = 0.4, kind = 0, add = 1) {
    const c = typeof col === 'object' ? col : rgb(col); spawn(x, y, z, (rnd() - 0.5) * 0.5, 0.25 + rnd() * 0.5, (rnd() - 0.5) * 0.5, size, 0, life, 1.5, (rnd() - 0.5) * 4, c, kind, 0.2, add, 0.05, 0.3);
  }
  function confetti(x, y, z, n = 40) {
    n = Math.max(2, Math.round(n * lod()));
    for (let i = 0; i < n; i++) { const a = rnd() * PI * 2, k = 1 + rnd() * 3.4; spawn(x, y, z, Math.cos(a) * k, 4.5 + rnd() * 4, Math.sin(a) * k, 0.1 + rnd() * 0.07, 6.5, 1.5 + rnd() * 1.1, 0.9, (rnd() - 0.5) * 14, rgb(PASTEL[(rnd() * PASTEL.length) | 0]), 3, 1, 0, 0.02, 0.75); }
    spawn(x, y, z, 0, 0, 0, 1.6, 0, 0.3, 0, 0, rgb(0xfff4e6), 0, 0.3, 1, 0.02, 0.3);
  }

  // ---------------------------------------------------------------- glow elements (rings, beams, sprites): transient ring buffer + immediate region
  // template geometry for all kinds merged into one buffer: kind 0 beam tube, 1 ring quad (flat), 2 glow quad, 3 flare quad (billboards)
  const pos = [], uv = [], kk = [], idx = [];
  const addV = (x, y, z, u, v, k) => { pos.push(x, y, z); uv.push(u, v); kk.push(k); return pos.length / 3 - 1; };
  { // beam: tapered open tube, y 0..1
    const S = 10; for (let i = 0; i <= S; i++) { const a = i / S * PI * 2; for (let j = 0; j < 2; j++) { const r = j ? 0.38 : 1; addV(Math.cos(a) * r, j, Math.sin(a) * r, i / S, j, 0); } }
    for (let i = 0; i < S; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const ring = addV(-1, 0, -1, -1, -1, 1); addV(1, 0, -1, 1, -1, 1); addV(1, 0, 1, 1, 1, 1); addV(-1, 0, 1, -1, 1, 1); idx.push(ring, ring + 2, ring + 1, ring, ring + 3, ring + 2);
    for (const k of [2, 3]) { const b = addV(-1, -1, 0, -1, -1, k); addV(1, -1, 0, 1, -1, k); addV(1, 1, 0, 1, 1, k); addV(-1, 1, 0, -1, 1, k); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  }
  const gg = new THREE.InstancedBufferGeometry(); gg.setIndex(idx); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2)); gg.setAttribute('aK', new THREE.Float32BufferAttribute(kk, 1));
  const GR = 160, GN = GR + GMAX, GA = { aPos: iattr(GN, 4), aScl: iattr(GN, 4), aCol: iattr(GN, 4), aTm: iattr(GN, 4), aSel: iattr(GN, 1) };
  for (const k in GA) gg.setAttribute(k, GA[k]); gg.instanceCount = GN;
  for (let i = 0; i < GN; i++) { GA.aTm.array[i * 4] = 1e9; GA.aTm.array[i * 4 + 1] = 1; }
  const gmat = new THREE.ShaderMaterial({ vertexShader: G_VS, fragmentShader: G_FS, uniforms: { uT }, ...premult() });
  const gmesh = new THREE.Mesh(gg, gmat); gmesh.frustumCulled = false; gmesh.renderOrder = 18; gmesh.name = 'fx_glow'; dynRoot.add(gmesh);
  let gHead = 0, gLo = GN, gHi = -1, imm = 0, immHi = 0, rendered = false, stale = 0;
  function gput(i, sel, x, y, z, yaw, sx, sy, sz, w, r, g, b, a, birth, life, p, q) {
    const o = i * 4, P = GA.aPos.array, S = GA.aScl.array, C = GA.aCol.array, T = GA.aTm.array;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = yaw; S[o] = sx; S[o + 1] = sy; S[o + 2] = sz; S[o + 3] = w; C[o] = r; C[o + 1] = g; C[o + 2] = b; C[o + 3] = a; T[o] = birth; T[o + 1] = life; T[o + 2] = p; T[o + 3] = q; GA.aSel.array[i] = sel;
  }
  function gspawn(sel, x, y, z, yaw, sx, sy, sz, w, c, a, life, th, delay = 0) {
    const i = gHead; gHead = (gHead + 1) % GR; if (i < gLo) gLo = i; if (i > gHi) gHi = i;
    gput(i, sel, x, y, z, yaw, sx, sy, sz, w, c[0], c[1], c[2], a, clock + delay, life, 0, th);
  }
  /** immediate glow element for this frame only. sel 0 beam (sx radius, sy height, sz radius, w tilt) 1 ring (sx=sz radius, w dash 0..1, th ring width) 2 glow sprite (sx radius) 3 sparkle flare (sx radius) */
  function glowAt(sel, x, y, z, yaw, sx, sy, sz, w, r, g, b, a, th = 0.16) {
    if (imm >= GMAX) return; gput(GR + imm, sel, x, y, z, yaw, sx, sy, sz, w, r, g, b, a, 0, 0, 0, th); imm++; if (imm > immHi) immHi = imm;
  }
  // immediates (glowAt) are cleared AFTER the render that drew them, so module update order does not matter. Geometry attributes are uploaded when the
  // renderer projects the scene (before onBeforeRender), so the dirty ranges are flagged in update(); slots unused this frame were parked (sel -1) after the last render.
  gmesh.onAfterRender = () => { const sel = GA.aSel.array; for (let i = 0; i < immHi; i++) sel[GR + i] = -1; imm = 0; immHi = 0; rendered = true; };

  function ring(x, z, r, color = 0xfff4c0, dur = 0.45) {
    const c = rgb(color); gspawn(1, x, 0.07, z, 0, r, 1, r, 0, c, 1, dur, 0.2);
    gspawn(1, x, 0.07, z, 0, r * 0.72, 1, r * 0.72, 0, c, 0.6, dur * 0.8, 0.12, 0.05);
    gspawn(2, x, 0.12, z, 0, r * 0.9, 1, 1, 0, c, 0.5, dur * 0.5, 0);
  }
  function beam(x, z, color = 0xffe98a, h = 4, dur = 1.2) {
    const c = rgb(color), r = Math.max(0.3, h * 0.12);
    gspawn(0, x, 0, z, 0, r, h, r, 0, c, 0.9, dur, 0); gspawn(0, x, 0, z, 1, r * 0.55, h * 1.1, r * 0.55, 0, rgb(0xffffff), 0.6, dur * 0.8, 0);
    gspawn(1, x, 0.07, z, 0, r * 2.2, 1, r * 2.2, 0.7, c, 0.9, dur * 0.7, 0.18); gspawn(2, x, 0.4, z, 0, r * 2.6, 1, 1, 0, c, 0.6, dur * 0.6, 0);
  }

  // ---------------------------------------------------------------- lightning
  const zg = new THREE.InstancedBufferGeometry(); const zq = new THREE.BufferGeometry();
  zg.setIndex([0, 1, 2, 0, 2, 3]); zg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
  const ZA = { aA: iattr(ZMAX, 4), aB: iattr(ZMAX, 4), aCol: iattr(ZMAX, 4) }; for (const k in ZA) zg.setAttribute(k, ZA[k]); zg.instanceCount = 0;
  const zmat = new THREE.ShaderMaterial({ vertexShader: Z_VS, fragmentShader: Z_FS, ...premult() });
  const zmesh = new THREE.Mesh(zg, zmat); zmesh.frustumCulled = false; zmesh.renderOrder = 22; zmesh.name = 'fx_zap'; dynRoot.add(zmesh);
  let zn = 0; const zcol = [0.7, 0.55, 1];
  const ZS = []; for (let i = 0; i < 10; i++) ZS.push({ pts: new Float32Array(3 * 10), n: 0, t: 0, life: 0, c: [0.7, 0.55, 1] });
  let zsHead = 0;
  function zap(points, color = 0xb89cff, life = 0.22) {
    const z = ZS[zsHead]; zsHead = (zsHead + 1) % ZS.length; const n = Math.min(10, points.length);
    for (let i = 0; i < n; i++) { const p = points[i]; z.pts[i * 3] = p.x ?? p[0]; z.pts[i * 3 + 1] = p.y ?? p[1]; z.pts[i * 3 + 2] = p.z ?? p[2]; }
    z.n = n; z.t = 0; z.life = life; z.c = rgb(color);
  }
  function seg(ax, ay, az, bx, by, bz, w, r, g, b, a) {
    if (zn >= ZMAX) return; const o = zn * 4, A = ZA.aA.array, B = ZA.aB.array, C = ZA.aCol.array;
    A[o] = ax; A[o + 1] = ay; A[o + 2] = az; A[o + 3] = w; B[o] = bx; B[o + 1] = by; B[o + 2] = bz; C[o] = r; C[o + 1] = g; C[o + 2] = b; C[o + 3] = a; zn++;
  }
  /** jagged bolt through n world points (xyz in flat array); the jitter changes ~30 times a second so it flickers like the 2D version */
  function bolt(P, n, c, a, tq) {
    for (let i = 0; i + 1 < n; i++) {
      const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2], bx = P[i * 3 + 3], by = P[i * 3 + 4], bz = P[i * 3 + 5], len = Math.hypot(bx - ax, by - ay, bz - az), amp = Math.min(0.5, 0.06 + len * 0.07), K = 4;
      let px = ax, py = ay, pz = az;
      for (let k = 1; k <= K; k++) {
        const f = k / K, last = k === K, s = tq * 13 + i * 7 + k;
        const qx = last ? bx : ax + (bx - ax) * f + (hash(s, 1) - 0.5) * 2 * amp, qy = last ? by : ay + (by - ay) * f + (hash(s, 2) - 0.5) * amp, qz = last ? bz : az + (bz - az) * f + (hash(s, 3) - 0.5) * 2 * amp;
        seg(px, py, pz, qx, qy, qz, 0.16, c[0], c[1], c[2], 0.75 * a); seg(px, py, pz, qx, qy, qz, 0.05, 1, 1, 1, a);
        px = qx; py = qy; pz = qz;
      }
    }
  }

  // ---------------------------------------------------------------- S.parts / S.fx / S.fly bridges
  const FL = []; for (let i = 0; i < FLY_MAX; i++) FL.push({ entry: null, kind: '', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, s: 1, e: 0 });
  let flN = 0; const seen = new WeakSet(), zbuf = new Float32Array(3 * 10);
  const getS = () => (typeof S !== 'undefined' ? S : null);
  /** 2D screen point + gravity-lift: reconstructs the particle's launch point to turn the 2D arc into ground travel plus believable height */
  function bridgeParts(s) {
    const parts = s.parts, np = Math.min(parts.length, 500), q0 = s.settings && s.settings.particles === false ? 0 : np, step = lod() < 0.6 ? 2 : 1;
    for (let i = parts.length - q0; i < parts.length && bUsed < BRIDGE - 12; i += step) {
      const q = parts[i], t = q.t, dur = q.dur; if (!(dur > 0) || t >= dur) continue;
      const c = rgb(q.color || '#ffffff'), star = !!q.star, rr = q.r || 3;
      let wx = q.x * W, wy, wz;
      if (q.g) { const y0 = q.y - q.vy * t + 210 * t * t, vy0 = q.vy - 420 * t; wz = (y0 + vy0 * t * 0.4) * W; wy = Math.max(0.06, -(vy0 * t * 0.6 + 210 * t * t) * W * 1.35 + 0.1); }
      else { wz = q.y * W; wy = 0.14 + (t / dur) * 0.5; }
      put(RING + bUsed++, wx, wy, wz, 0, 0, 0, rr * W * (star ? 2.9 : 1.9), 0, clock - t, dur, 0, star ? 6 : 0, c[0], c[1], c[2], star ? 2 : 1, star ? 0.6 : 0.7, star ? 0.75 : 0.1, 0.03, 0.5);
    }
  }
  function bridgeFx(s) {
    const fxs = s.fx;
    for (let i = 0; i < fxs.length; i++) {
      const q = fxs[i], u = q.t / q.dur; if (!(q.dur > 0) || u >= 1) continue;
      if (q.kind === 'ring') { const c = rgb(q.col || '#fff4c0'), r = q.r * W * (0.25 + 0.75 * easeOut(u)); glowAt(1, q.x * W, 0.07, q.y * W, 0, r, 1, r, 0, c[0], c[1], c[2], 1 - u, 0.2 * (1 - u * 0.7) + 0.05); glowAt(2, q.x * W, 0.14, q.y * W, 0, r * 0.8, 1, 1, 0, c[0], c[1], c[2], 0.35 * (1 - u)); }
      else if (q.kind === 'boom') {
        if (!seen.has(q)) { seen.add(q); burst({ x: q.x * W, y: 0.4, z: q.y * W, n: 28, colors: [0xff7eb6, 0xfff4e6, 0xffd84d, 0xc6a8ff], speed: 5.5, up: 3.2, size: 0.2, life: 0.8, star: 0.45 }); spawn(q.x * W, 0.35, q.y * W, 0, 0, 0, q.r * W * 1.5, 0, 0.3, 0, 0, rgb(0xffe0f0), 0, 0.5, 1, 0.02, 0.25); }
        const r = q.r * W * (0.4 + 0.75 * easeOut(u)); glowAt(1, q.x * W, 0.08, q.y * W, 0, r, 1, r, 0, 1, 0.42, 0.7, 1 - u, 0.24 * (1 - u * 0.6) + 0.04); glowAt(2, q.x * W, 0.2, q.y * W, 0, r * 0.9, 1, 1, 0, 1, 0.5, 0.75, 0.55 * (1 - u));
      } else if (q.kind === 'zap' && q.pts) {
        const n = Math.min(q.pts.length, 10), a = 1 - u, c = zcol; let m = 0;
        for (let k = 0; k < n; k++) { const p = q.pts[k]; const tower = k === 0; zbuf[m++] = p.x * W; zbuf[m++] = tower ? 1.55 : 0.4; zbuf[m++] = (p.y + (tower ? 80 : 14)) * W; }
        bolt(zbuf, n, c, a, Math.floor(clock * 30));
        for (let k = 0; k < n; k++) glowAt(2, zbuf[k * 3], zbuf[k * 3 + 1], zbuf[k * 3 + 2], 0, k ? 0.5 : 0.7, 1, 1, 0, 0.65, 0.5, 1, 0.7 * a);
      }
    }
  }
  const fpos = [0, 0, 0];
  function flightAt(f, e, out) { // 2D flight -> world: the 2D arc becomes height, the 2D y offset of the endpoints becomes a small z shift
    const sy = f.y0 + (f.y1 - f.y0) * e;
    out[0] = (f.x0 + (f.x1 - f.x0) * e) * W; out[2] = sy * W + 0.28 * e; out[1] = 0.22 + 0.4 * e + Math.sin(e * PI) * (f.arc || 40) * W * 1.1;
  }
  function bridgeFly(s, loot) {
    const fly = s.fly; flN = 0; let used = 0;
    for (let i = 0; i < fly.length && i < 150; i++) {
      const f = fly[i], u = (f.t - f.delay) / f.dur; if (u < 0 || u > 1.05) continue;
      const e = easeInOut(Math.min(1, Math.max(0, u))); flightAt(f, e, fpos);
      const gem = f.kind === 'gem', coin = f.kind === 'coin', c = gem ? rgb(0x8ff6ee) : rgb(0xffe98a);
      if (used < 120) { used++; for (let g = 1; g <= 3; g++) { const ue = Math.max(0, e - g * 0.07); flightAt(f, ue, tmpFly); if (bUsed < BRIDGE - 4) put(RING + bUsed++, tmpFly[0], tmpFly[1], tmpFly[2], 0, 0, 0, 0.22 - g * 0.04, 0, clock - 0.01, 0.1, 0, 0, c[0], c[1], c[2], 0, 0.8, 1, 0.01, 0.5); } }
      const fl = FL[flN]; if (!fl) continue;
      fl.entry = f.entry || null; fl.kind = f.kind; fl.x = fpos[0]; fl.y = fpos[1]; fl.z = fpos[2]; fl.s = (1 - 0.35 * e); fl.e = e;
      fl.yaw = coin ? (f.spin || 4) * f.t * 3 : gem ? f.t * 6 : Math.sin(f.t * 9) * 0.6; fl.pitch = 0.1; flN++;
    }
    if (loot && loot.setFlyers) loot.setFlyers(FL, flN);
    else for (let i = 0; i < flN && bUsed < BRIDGE - 2; i++) { // no loot module: a spinning glowing token is the stand-in
      const fl = FL[i], c = fl.kind === 'gem' ? rgb(0x6ee0d8) : rgb(0xffd84d); put(RING + bUsed++, fl.x, fl.y, fl.z, 0, 0, 0, 0.2 * fl.s, 0, clock - 0.01, 0.1, 0, 0, c[0], c[1], c[2], fl.kind === 'gem' ? 2 : 1, 1, 0.3, 0.01, 0.5);
    }
  }
  const tmpFly = [0, 0, 0];

  // ---------------------------------------------------------------- update
  function update(dt, t) {
    clock += dt; uT.value = clock;
    if (rendered) { rendered = false; stale = 0; } else if (++stale > 3) { imm = 0; stale = 0; } // headless / not rendered: do not let immediates pile up
    const s = getS(); bUsed = 0; zn = 0;
    if (s) {
      try { if (s.parts) bridgeParts(s); if (s.fx) bridgeFx(s); if (s.fly) bridgeFly(s, V.mods && (V.mods.loot || V.mods.loot3d)); } catch (e) { /* never throw into the frame loop */ }
    }
    // internal zaps (V.fx.zap)
    for (let i = 0; i < ZS.length; i++) { const z = ZS[i]; if (z.life <= 0) continue; z.t += dt; if (z.t >= z.life) { z.life = 0; continue; } bolt(z.pts, z.n, z.c, 1 - z.t / z.life, Math.floor(clock * 30)); }
    for (const k in GA) { const a = GA[k], c = k === 'aSel' ? 1 : 4; if (a.clearUpdateRanges) a.clearUpdateRanges(); if (gHi >= 0) a.addUpdateRange(gLo * c, (gHi - gLo + 1) * c); a.addUpdateRange(GR * c, GMAX * c); a.needsUpdate = true; }
    gLo = GN; gHi = -1;
    zg.instanceCount = zn; if (zn) { ZA.aA.needsUpdate = ZA.aB.needsUpdate = ZA.aCol.needsUpdate = true; } zmesh.visible = zn > 0;
    // clear the bridge tail that the previous frame used but this one did not
    for (let i = bUsed; i < bPrev; i++) PA.aT.array[(RING + i) * 4] = 1e9;
    const top = Math.max(bUsed, bPrev); bPrev = bUsed;
    // upload only what changed (ring slots spawned this frame + the bridge tail)
    for (const k in PA) { const a = PA[k]; if (a.clearUpdateRanges) a.clearUpdateRanges(); if (dHi >= 0) a.addUpdateRange(dLo * 4, (dHi - dLo + 1) * 4); if (top) a.addUpdateRange(RING * 4, top * 4); a.needsUpdate = dHi >= 0 || top > 0; }
    dLo = N; dHi = -1;
  }
  function dispose() { for (const m of [pmesh, gmesh, zmesh]) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); } }

  const api = { update, burst, ring, puff, confetti, beam, zap, glowAt, trail, rgb, dispose, get flyers() { return FL; }, get flyerCount() { return flN; }, get clock() { return clock; } };
  V.fx = api;
  return api;
}
