// post.js : hand-rolled post pipeline for Hearthvale (no EffectComposer: fewer passes, full control of formats).
//
// RESEARCH NOTES (what shaped the design)
//  - Bloom: progressive dual-filter chain (Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare", 2014;
//    Bjorge, "Bandwidth-efficient rendering", SIGGRAPH 2015): 5-tap downsample, 9-tap tent upsample that ADDS into the bigger mip.
//    Karis average on the first (thresholded) tap set kills fireflies from single hot pixels. Small kernels per pass = low bandwidth,
//    which is what matters on tilers. A published low-power mobile benchmark found mip-chain bloom the cheapest of the common options.
//    Pastel scenes: threshold ABOVE the daylight pastel range (HDR linear ~1.5) with a soft knee, so only emissives (lanterns, windows,
//    sparkles boosted in the Fx shader, sun) glow; strength stays low so nothing washes out.
//  - Tilt-shift: a miniature look = depth-of-field band along screen Y (focus line near the look target), blur growing with distance
//    from the band. Done as a spiral disc blur of a half-res copy, only where the mask is above zero (branch), strength follows zoom.
//  - Contact AO: a cheap depth-only "alchemy lite" (8 depth taps at a world-space radius) tinted lavender, never black. Needs a depth
//    texture, so only on high. Art bible: fake AO strength <= 0.18.
//  - Colour grade: after tone mapping, in display space: lift/gamma/gain, lavender shadow and warm highlight split tone, vibrance
//    (boosts dull colours more than saturated ones) and saturation, contrast around 0.5. Defaults reproduce the old CSS filter
//    (saturate 1.25, contrast 1.06) so the look does not shift, then add gentle richness.
//  - MSAA: render the scene into a multisampled half-float target (4 samples high, 2 medium); low uses an FXAA-lite edge softener
//    in the grade pass (Lottes FXAA 2 style directional blur). Half-float so ACES tone mapping can run after bloom.
//  - Dynamic resolution + live tier changes live in quality.js (Adaptive). Shader programs for a new tier are compiled with compileAsync
//    BEFORE the swap so a tier change never hitches.
//  - God rays: screen-space radial march toward the sun reading the SKY MASK (alpha 0 = sky) so the shafts leak between roofs and trees.
//  - Sky mask: the sky dome and clouds were never tone mapped; they write alpha 0 into the target and the grade pass skips tone mapping
//    for them (mix by alpha), so the pastel sky keeps exactly its old colours.
//  - Stylised water, soft particles, cloud shadows and atmosphere live in scene.js (they are scene materials, not post).
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN = `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform vec3 uThr; varying vec2 vUv;
vec4 thr(vec4 c){
  #ifdef THRESH
  float br = max(max(c.r, c.g), c.b); float k = uThr.y;
  float soft = clamp(br - uThr.x + k, 0.0, 2.0 * k); soft = soft * soft / (4.0 * k + 1e-4);
  float w = max(soft, br - uThr.x) / max(br, 1e-4);
  c.rgb *= w * (1.0 / (1.0 + max(br - 3.0, 0.0)));   // soft clamp of fireflies
  #endif
  return c;
}
vec4 s(vec2 o){ return thr(texture2D(tSrc, vUv + o * uTexel)); }
void main(){
  vec4 c = s(vec2(0.0)) * 4.0 + s(vec2(-1.0,-1.0)) + s(vec2(1.0,-1.0)) + s(vec2(-1.0,1.0)) + s(vec2(1.0,1.0));
  #ifdef THRESH
  float a = (texture2D(tSrc, vUv).a * 4.0 + texture2D(tSrc, vUv + vec2(-1.0,-1.0) * uTexel).a + texture2D(tSrc, vUv + vec2(1.0,-1.0) * uTexel).a + texture2D(tSrc, vUv + vec2(-1.0,1.0) * uTexel).a + texture2D(tSrc, vUv + vec2(1.0,1.0) * uTexel).a) * 0.125;
  gl_FragColor = vec4(c.rgb * 0.125, a);
  #else
  gl_FragColor = c * 0.125;
  #endif
}`;

const UP = `
uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uTexel; uniform float uMix; varying vec2 vUv;
void main(){
  vec4 co = texture2D(tLow, vUv + vec2(-1.0,-1.0) * uTexel) + texture2D(tLow, vUv + vec2(1.0,-1.0) * uTexel) + texture2D(tLow, vUv + vec2(-1.0,1.0) * uTexel) + texture2D(tLow, vUv + vec2(1.0,1.0) * uTexel);
  vec4 ed = texture2D(tLow, vUv + vec2(-1.0,0.0) * uTexel) + texture2D(tLow, vUv + vec2(1.0,0.0) * uTexel) + texture2D(tLow, vUv + vec2(0.0,-1.0) * uTexel) + texture2D(tLow, vUv + vec2(0.0,1.0) * uTexel);
  vec4 l = (co + ed * 2.0 + texture2D(tLow, vUv) * 4.0) * (1.0 / 16.0);
  vec4 h = texture2D(tHigh, vUv);
  gl_FragColor = vec4(h.rgb + l.rgb * uMix, h.a);
}`;

const GRADE = `
uniform sampler2D tScene; uniform sampler2D tBlur; uniform sampler2D tBloom; uniform sampler2D tRay; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uExposure; uniform float uBloom; uniform float uTilt; uniform float uTiltW; uniform float uFocusY;
uniform float uSat; uniform float uVib; uniform float uContrast; uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain; uniform vec3 uTintS; uniform vec3 uTintH; uniform float uSplit;
uniform float uVig; uniform vec3 uVigCol; uniform float uGrain; uniform float uTime; uniform vec4 uFlash; uniform vec4 uSun; uniform vec3 uSunCol; uniform float uRays;
uniform float uAO; uniform vec2 uCam; uniform float uFocal; uniform float uAoR; uniform float uSkyRaw; uniform vec3 uHaze;
varying vec2 vUv;
vec3 RRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= uExposure / 0.6; c = I * c; c = RRT(c); c = O * c; return clamp(c, 0.0, 1.0);
}
vec3 enc(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float zlin(float d){ return uCam.x * uCam.y / (uCam.y - d * (uCam.y - uCam.x)); }
vec4 S(vec2 uv){ return texture2D(tScene, uv); }
float cl(vec4 c){ float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); return l / (1.0 + l); }
vec4 scene(vec2 uv){
  #ifdef FXAA
  vec2 px = 1.0 / uRes;
  vec4 m = S(uv), nw = S(uv + vec2(-1.0,-1.0) * px), ne = S(uv + vec2(1.0,-1.0) * px), sw = S(uv + vec2(-1.0,1.0) * px), se = S(uv + vec2(1.0,1.0) * px);
  float lM = cl(m), lNW = cl(nw), lNE = cl(ne), lSW = cl(sw), lSE = cl(se);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.1)) return m;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -6.0, 6.0) * px;
  vec4 a = 0.5 * (S(uv + dir * (1.0 / 3.0 - 0.5)) + S(uv + dir * (2.0 / 3.0 - 0.5)));
  vec4 b = a * 0.5 + 0.25 * (S(uv + dir * -0.5) + S(uv + dir * 0.5));
  float lB = cl(b); return (lB < lMin || lB > lMax) ? a : b;
  #else
  return S(uv);
  #endif
}
void main(){
  vec2 uv = vUv; float asp = uRes.x / uRes.y;
  vec4 s = scene(uv);
  #ifdef DOF
  float m = smoothstep(uTiltW, 1.0, abs(uv.y - uFocusY) * 2.0); m = m * m * uTilt;
  if (m > 0.004) {
    vec4 b = vec4(0.0); float R = 0.016 * m;
    for (int i = 0; i < 10; i++) { float a = float(i) * 2.39996; float r = sqrt((float(i) + 0.5) / 10.0); b += texture2D(tBlur, uv + vec2(cos(a) / asp, sin(a)) * r * R); }
    s = mix(s, b * 0.1, clamp(m * 1.25, 0.0, 1.0));
  }
  #endif
  #ifdef AO
  float zc = zlin(texture2D(tDepth, uv).x);
  if (zc < uCam.y * 0.5) {
    float rpx = clamp(uAoR * uFocal / zc, 2.0, 46.0) / uRes.y; float occ = 0.0;
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398 + 0.3; float k = 0.45 + 0.55 * fract(float(i) * 0.618); vec2 o = vec2(cos(a) / asp, sin(a)) * rpx * k;
      float d = zc - zlin(texture2D(tDepth, uv + o).x); occ += smoothstep(0.12, 0.7, d) * (1.0 - smoothstep(1.2, 4.5, d)); }
    occ = occ * 0.125 * uAO; s.rgb *= mix(vec3(1.0), vec3(0.80, 0.76, 0.94), clamp(occ, 0.0, 0.9));
  }
  #endif
  vec3 hdr = s.rgb;
  #ifdef BLOOM
  hdr += texture2D(tBloom, uv).rgb * uBloom;
  #endif
  #ifdef RAYS
  if (uSun.z > 0.01) {
    vec2 dir = (uSun.xy - uv); float acc = 0.0, w = 1.0, tot = 0.0; vec2 p = uv;
    for (int i = 0; i < 12; i++) { p += dir * (0.9 / 12.0); acc += (1.0 - texture2D(tRay, p).a) * w; tot += w; w *= 0.92; }
    float fall = 1.0 / (1.0 + length(dir * vec2(asp, 1.0)) * 1.6);
    hdr += uSunCol * (acc / tot) * fall * uRays * uSun.z * (1.0 - 0.7 * s.a);
  }
  #endif
  #ifdef FLARE
  if (uSun.z > 0.01) {
    vec2 d = (uv - uSun.xy) * vec2(asp, 1.0); float r = length(d);
    float g = smoothstep(0.05, 0.03, r) * 1.6 + exp(-r * 8.0) * 0.45 + exp(-r * 2.2) * 0.12;
    vec2 gc = 0.5 + (0.5 - uSun.xy) * 0.7; float gr = length((uv - gc) * vec2(asp, 1.0));
    g += (smoothstep(0.09, 0.07, gr) - smoothstep(0.07, 0.05, gr)) * 0.12 * smoothstep(0.0, 0.5, length(uSun.xy - 0.5));
    hdr += uSunCol * g * uSun.z * (1.0 - 0.8 * s.a);
  }
  #endif
  vec3 hz = hdr + uHaze * 0.0;
  vec3 c = mix(clamp(hz, 0.0, 1.0), enc(aces(hz)), s.a * uSkyRaw + (1.0 - uSkyRaw));
  // grade (display space)
  c = pow(max(c * uGain + uLift, 0.0), 1.0 / uGamma);
  float l = lum(c);
  c = mix(c, c * uTintS, (1.0 - smoothstep(0.0, 0.62, l)) * uSplit);
  c = mix(c, c * uTintH, smoothstep(0.5, 1.0, l) * uSplit);
  l = lum(c); float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  c = mix(vec3(l), c, uSat * (1.0 + uVib * (1.0 - sat)));
  c = (c - 0.5) * uContrast + 0.5;
  vec2 q = (uv - 0.5) * vec2(1.0, 0.92); float v = smoothstep(0.38, 0.92, length(q) * 1.25);
  c = mix(c, c * uVigCol, v * uVig);
  c = mix(c, uFlash.rgb, uFlash.a);
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  #ifdef GRAIN
  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * uGrain;
  #endif
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const mk = (frag, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });
const rtOpts = (o = {}) => ({ type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, colorSpace: THREE.NoColorSpace, ...o });

export class Post {
  /** can the device do an HDR half-float scene target? (else View renders straight to the canvas) */
  static supported(r) { const e = r.extensions; return !!(r.capabilities.isWebGL2 && (e.has('EXT_color_buffer_float') || e.has('EXT_color_buffer_half_float'))); }

  constructor(renderer, scene, camera) {
    this.r = renderer; this.scene = scene; this.cam = camera; this.cfg = null; this.w = 2; this.h = 2; this.passCount = 0; this.stat = { sceneCalls: 0, sceneTris: 0 };
    this.floatMsaa = renderer.extensions.has('EXT_color_buffer_float');
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(tri, null); this.quad.frustumCulled = false; this.qs = new THREE.Scene(); this.qs.add(this.quad); this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // tunable look (defaults reproduce the old CSS filter, then add a little richness)
    this.U = {
      tScene: { value: null }, tBlur: { value: null }, tBloom: { value: null }, tRay: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(2, 2) },
      uExposure: { value: 1.1 }, uBloom: { value: 0.5 }, uTilt: { value: 0 }, uTiltW: { value: 0.52 }, uFocusY: { value: 0.5 },
      uSat: { value: 1.2 }, uVib: { value: 0.22 }, uContrast: { value: 1.05 }, uLift: { value: new THREE.Vector3(0.006, 0.004, 0.016) }, uGamma: { value: new THREE.Vector3(1.03, 1.02, 1.03) }, uGain: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uTintS: { value: new THREE.Vector3(0.97, 0.95, 1.05) }, uTintH: { value: new THREE.Vector3(1.04, 1.01, 0.95) }, uSplit: { value: 1 },
      uVig: { value: 0.55 }, uVigCol: { value: new THREE.Vector3(0.9, 0.88, 0.98) }, uGrain: { value: 0 }, uTime: { value: 0 }, uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
      uSun: { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, uSunCol: { value: new THREE.Vector3(1, 0.85, 0.6) }, uRays: { value: 0.1 },
      uAO: { value: 0.9 }, uCam: { value: new THREE.Vector2(0.5, 600) }, uFocal: { value: 1 }, uAoR: { value: 0.8 }, uSkyRaw: { value: 1 }, uHaze: { value: new THREE.Vector3() },
    };
    this.matCache = new Map(); this.mats = null; this.rt = {}; this.down = []; this.up = [];
    this.debug = ''; this.thr = 1.55;
  }

  /** shader define set for a tier config */
  defines(c) { const d = {}; if (c.bloom) d.BLOOM = 1; if (c.dof) d.DOF = 1; if (c.ao) d.AO = 1; if (c.rays) d.RAYS = 1; if (c.flare) d.FLARE = 1; if (c.grain) d.GRAIN = 1; if (!this.msaaOf(c)) d.FXAA = 1; return d; }
  msaaOf(c) { return this.floatMsaa ? Math.min(c.msaa, this.r.capabilities.maxSamples || 4) : 0; }
  gradeMat(c) { const d = this.defines(c), key = Object.keys(d).sort().join(','); let m = this.matCache.get(key); if (!m) { m = mk(GRADE, this.U, d); this.matCache.set(key, m); } return m; }
  helper(kind, thresh) { const key = kind + (thresh ? 'T' : ''); let m = this.matCache.get(key); if (!m) { m = kind === 'down' ? mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: new THREE.Vector3(1.5, 0.5, 0) } }, thresh ? { THRESH: 1 } : {}) : mk(UP, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } }); this.matCache.set(key, m); } return m; }

  /** compile the shaders a tier needs without drawing, then call back (so a tier switch never hitches on shader compilation) */
  prepare(c) {
    const mats = [this.gradeMat(c)]; if (c.bloom) mats.push(this.helper('down', true), this.helper('down', false), this.helper('up')); if (c.dof) mats.push(this.helper('down', false));
    const r = this.r, old = this.quad.material; const go = r.compileAsync ? (m) => { this.quad.material = m; return r.compileAsync(this.qs, this.qc); } : (m) => { this.quad.material = m; r.compile(this.qs, this.qc); return Promise.resolve(); };
    let p = Promise.resolve(); for (const m of mats) p = p.then(() => go(m)); return p.catch(() => {}).then(() => { this.quad.material = old; });
  }

  /** (re)allocate targets for config c at drawing-buffer size w x h */
  configure(c, w, h) {
    this.cfg = c; this.w = Math.max(2, w | 0); this.h = Math.max(2, h | 0); this.U.uRes.value.set(this.w, this.h);
    this.disposeTargets();
    const samples = this.msaaOf(c); this.samples = samples;
    const o = rtOpts({ depthBuffer: true, samples });
    this.rt.scene = new THREE.WebGLRenderTarget(this.w, this.h, o);
    if (c.ao) { const dt = new THREE.DepthTexture(this.w, this.h); this.rt.scene.depthTexture = dt; this.U.tDepth.value = dt; } else this.U.tDepth.value = null;
    const half = (k) => new THREE.WebGLRenderTarget(Math.max(1, Math.ceil(this.w / k)), Math.max(1, Math.ceil(this.h / k)), rtOpts());
    this.rt.blur = c.dof ? half(2) : null; this.U.tBlur.value = this.rt.blur && this.rt.blur.texture;
    this.down = []; this.up = [];
    for (let i = 0; i < c.bloom; i++) this.down.push(half(2 << i));
    for (let i = 0; i < c.bloom - 1; i++) this.up.push(half(2 << i));      // up[i] has the size of down[i]
    this.U.tBloom.value = c.bloom ? (this.up.length ? this.up[0].texture : this.down[0].texture) : null;
    this.U.tRay.value = c.rays && this.down[1] ? this.down[1].texture : null;
    this.U.tScene.value = this.rt.scene.texture; this.U.uBloom.value = 0.55 * (c.bloomK || 0);
    this.quadMat = this.gradeMat(c);
    this.passCount = 1 + (c.dof ? 1 : 0) + c.bloom + Math.max(0, c.bloom - 1) + 1;
  }
  disposeTargets() { for (const k of Object.keys(this.rt)) if (this.rt[k]) { if (this.rt[k].depthTexture) this.rt[k].depthTexture.dispose(); this.rt[k].dispose(); } this.rt = {}; for (const t of this.down) t.dispose(); for (const t of this.up) t.dispose(); this.down = []; this.up = []; }

  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qs, this.qc); }

  /** draw the whole frame to the canvas */
  render() {
    const r = this.r, c = this.cfg, U = this.U, info = r.info; info.reset();
    const cam = this.cam; U.uCam.value.set(cam.near, cam.far); U.uFocal.value = cam.projectionMatrix.elements[5] * this.h * 0.5;
    r.setRenderTarget(this.rt.scene); r.render(this.scene, cam);
    this.stat.sceneCalls = info.render.calls; this.stat.sceneTris = info.render.triangles;
    const scene = this.rt.scene.texture;
    if (c.dof) { const m = this.helper('down', false), u = m.uniforms; u.tSrc.value = scene; u.uTexel.value.set(1 / this.w, 1 / this.h); this.pass(m, this.rt.blur); }
    if (c.bloom) {
      let src = scene, sw = this.w, sh = this.h;
      for (let i = 0; i < c.bloom; i++) { const m = this.helper('down', i === 0), u = m.uniforms; u.tSrc.value = src; u.uTexel.value.set(1 / sw, 1 / sh); if (i === 0) u.uThr.value.set(this.thr, 0.5, 0); this.pass(m, this.down[i]); src = this.down[i].texture; sw = this.down[i].width; sh = this.down[i].height; }
      let low = this.down[c.bloom - 1].texture;
      for (let i = c.bloom - 2; i >= 0; i--) { const m = this.helper('up'), u = m.uniforms, lw = this.down[i + 1]; u.tLow.value = low; u.tHigh.value = this.down[i].texture; u.uTexel.value.set(1 / lw.width, 1 / lw.height); u.uMix.value = 1; this.pass(m, this.up[i]); low = this.up[i].texture; }
    }
    this.quad.material = this.quadMat; r.setRenderTarget(null); r.render(this.qs, this.qc);
  }
  dispose() { this.disposeTargets(); for (const m of this.matCache.values()) m.dispose(); }
}
