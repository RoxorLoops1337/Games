// Encore Island 3D, post-processing. A small purpose-built chain instead of EffectComposer:
//   scene -> HDR render target (MSAA on high) -> bloom mip chain (threshold, 4 downsamples, additive upsamples) -> one composite pass
//   that does bloom add, tilt-shift (cheap miniature depth of field), exposure, Khronos-neutral tone mapping, split-tone grade, saturation, vignette, dither.
// Everything past the scene render costs about 12 tiny full-screen draws; on the low tier the chain is skipped and the renderer tone maps directly.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const LUMA = 'float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }';
const FS_DOWN = `${LUMA} uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; uniform float uKnee; uniform float uFirst; varying vec2 vUv;
vec3 pre(vec3 c){ if (uFirst < 0.5) return c; float l = lum(c); float k = clamp((l - uThresh + uKnee) / (2.0 * uKnee), 0.0, 1.0); k = k * k; float w = max(k * uKnee * 2.0, l - uThresh) / max(l, 1e-4); return c * clamp(w, 0.0, 1.0); }
void main(){ vec2 o = uTexel * 0.5; vec3 c = pre(texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb) + pre(texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb) + pre(texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb) + pre(texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb);
  c *= 0.25; if (uFirst > 0.5) c = min(c, vec3(24.0)); gl_FragColor = vec4(c, 1.0); }`;
const FS_UP = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uMix; varying vec2 vUv;
void main(){ vec2 o = uTexel; vec3 c = texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb
  + 0.5 * (texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb);
  gl_FragColor = vec4(c / 6.0 * uMix, 1.0); }`;
const FS_BLUR = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.2270; c += (texture2D(tSrc, vUv + uDir * 1.3846).rgb + texture2D(tSrc, vUv - uDir * 1.3846).rgb) * 0.3162; c += (texture2D(tSrc, vUv + uDir * 3.2308).rgb + texture2D(tSrc, vUv - uDir * 3.2308).rgb) * 0.0703; gl_FragColor = vec4(c, 1.0); }`;
const FS_COMP = `uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tBlur; uniform float uBloom; uniform float uExposure; uniform float uTilt; uniform float uTiltCenter; uniform float uVig; uniform float uSat; uniform float uTime; uniform float uPunch;
uniform vec3 uShadow; uniform vec3 uHigh; uniform vec2 uRes; varying vec2 vUv;
${LUMA}
vec3 neutral(vec3 c){ const float s = 0.8 - 0.04; const float d = 0.15; float x = min(c.r, min(c.g, c.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off; float p = max(c.r, max(c.g, c.b)); if (p < s) return c; float dd = 1.0 - s; float np = 1.0 - dd * dd / (p + dd - s); c *= np / p; float g = 1.0 - 1.0 / (d * (p - np) + 1.0); return mix(c, vec3(np), g); }
vec3 oetf(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  if (uTilt > 0.0) { float d = abs(vUv.y - uTiltCenter); float m = smoothstep(0.18, 0.62, d) * uTilt; c = mix(c, texture2D(tBlur, vUv).rgb, m); }
  c += texture2D(tBloom, vUv).rgb * uBloom * (1.0 + uPunch * 0.45);
  c *= uExposure;
  c = neutral(c);
  float l = lum(c); c = mix(vec3(l), c, uSat);
  c += uShadow * (1.0 - smoothstep(0.0, 0.5, l)) * 0.06 + uHigh * smoothstep(0.45, 1.0, l) * 0.05;
  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y; c *= 1.0 - uVig * smoothstep(0.35, 1.05, length(q) * 1.15);
  c = oetf(clamp(c, 0.0, 1.0)); c += (hash(vUv * uRes + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0); }`;

function mat(fs, uniforms, blend) {
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, blending: blend || THREE.NoBlending, transparent: !!blend });
}
const RT = (w, h, type, samples = 0, depth = false) => new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, samples, generateMipmaps: false });

export class Post {
  constructor(renderer) {
    this.r = renderer; this.quad = new FullScreenQuad(null); this.on = true; this.w = 2; this.h = 2;
    const gl = renderer.getContext(), webgl2 = renderer.capabilities.isWebGL2, ext = renderer.extensions;
    this.hdr = webgl2 && (ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float'));
    this.type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType; this.maxSamples = webgl2 ? Math.min(4, renderer.capabilities.maxSamples || 0) : 0;
    this.cfg = { bloom: 0.55, thresh: 0.95, knee: 0.5, levels: 5, msaa: true, tilt: 0.65, exposure: 1.08, vig: 0.28, sat: 1.12, half: false };
    this.u = { exposure: { value: 1.08 }, bloom: { value: 0.55 }, tilt: { value: 0 }, tiltCenter: { value: 0.5 }, vig: { value: 0.28 }, sat: { value: 1.12 }, punch: { value: 0 }, shadow: { value: new THREE.Color(0.35, 0.3, 0.7) }, high: { value: new THREE.Color(1.0, 0.8, 0.5) } };
    this.mDown = mat(FS_DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0.95 }, uKnee: { value: 0.5 }, uFirst: { value: 1 } });
    this.mUp = mat(FS_UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } }, THREE.CustomBlending);
    this.mUp.blendEquation = THREE.AddEquation; this.mUp.blendSrc = THREE.OneFactor; this.mUp.blendDst = THREE.OneFactor;
    this.mBlur = mat(FS_BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mComp = mat(FS_COMP, { tScene: { value: null }, tBloom: { value: null }, tBlur: { value: null }, uBloom: this.u.bloom, uExposure: this.u.exposure, uTilt: this.u.tilt, uTiltCenter: this.u.tiltCenter, uVig: this.u.vig, uSat: this.u.sat, uTime: { value: 0 }, uPunch: this.u.punch, uShadow: this.u.shadow, uHigh: this.u.high, uRes: { value: new THREE.Vector2(1, 1) } });
    this.rtScene = null; this.mips = []; this.blurA = null; this.blurB = null;
  }
  configure(c) { Object.assign(this.cfg, c); this.u.exposure.value = this.cfg.exposure; this.u.bloom.value = this.cfg.bloom; this.u.vig.value = this.cfg.vig; this.u.sat.value = this.cfg.sat; this.u.tilt.value = this.cfg.tilt; this.mDown.uniforms.uThresh.value = this.cfg.thresh; this.mDown.uniforms.uKnee.value = this.cfg.knee; this.alloc(); }
  setSize(w, h) { this.w = Math.max(2, w | 0); this.h = Math.max(2, h | 0); this.mComp.uniforms.uRes.value.set(this.w, this.h); this.alloc(); }
  alloc() {
    this.free(); const { w, h } = this, samples = this.cfg.msaa ? this.maxSamples : 0;
    this.rtScene = RT(w, h, this.type, samples, true);
    let mw = w >> 1, mh = h >> 1; if (this.cfg.half) { mw = w >> 2; mh = h >> 2; }
    for (let i = 0; i < this.cfg.levels && mw >= 4 && mh >= 4; i++) { this.mips.push(RT(mw, mh, this.type)); mw >>= 1; mh >>= 1; }
    if (this.cfg.tilt > 0) { const bw = Math.max(8, w >> 2), bh = Math.max(8, h >> 2); this.blurA = RT(bw, bh, this.type); this.blurB = RT(bw, bh, this.type); }
  }
  free() { if (this.rtScene) this.rtScene.dispose(); for (const m of this.mips) m.dispose(); this.mips.length = 0; if (this.blurA) { this.blurA.dispose(); this.blurB.dispose(); this.blurA = this.blurB = null; } }
  pass(material, target, clear) { this.quad.material = material; this.r.setRenderTarget(target); if (clear) { this.r.setClearColor(0x000000, 1); this.r.clear(true, false, false); } this.quad.render(this.r); }
  /** Render scene through the chain to the screen. `punch` (0..1) is a beat pulse that swells the bloom. */
  render(scene, camera, t, punch) {
    const r = this.r; if (!this.rtScene) this.alloc();
    r.setRenderTarget(this.rtScene); r.clear(); r.render(scene, camera);
    const mips = this.mips, bloomOn = this.cfg.bloom > 0 && mips.length;
    this.mComp.uniforms.tScene.value = this.rtScene.texture; this.mComp.uniforms.uTime.value = t % 17; this.u.punch.value = punch || 0;
    if (bloomOn) {
      const d = this.mDown.uniforms; d.tSrc.value = this.rtScene.texture; d.uTexel.value.set(1 / this.w, 1 / this.h); d.uFirst.value = 1; this.pass(this.mDown, mips[0]);
      for (let i = 1; i < mips.length; i++) { d.tSrc.value = mips[i - 1].texture; d.uTexel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height); d.uFirst.value = 0; this.pass(this.mDown, mips[i]); }
      const u = this.mUp.uniforms; for (let i = mips.length - 2; i >= 0; i--) { u.tSrc.value = mips[i + 1].texture; u.uTexel.value.set(1 / mips[i + 1].width, 1 / mips[i + 1].height); u.uMix.value = 1; this.pass(this.mUp, mips[i]); }
      this.mComp.uniforms.tBloom.value = mips[0].texture;
    } else this.mComp.uniforms.tBloom.value = this.rtScene.texture, this.u.bloom.value = 0;
    if (this.blurA && this.cfg.tilt > 0) {
      const d = this.mDown.uniforms; d.tSrc.value = this.rtScene.texture; d.uTexel.value.set(1 / this.w, 1 / this.h); d.uFirst.value = 0; d.uThresh.value = this.cfg.thresh; this.pass(this.mDown, this.blurA);
      const b = this.mBlur.uniforms; b.tSrc.value = this.blurA.texture; b.uDir.value.set(1 / this.blurA.width, 0); this.pass(this.mBlur, this.blurB); b.tSrc.value = this.blurB.texture; b.uDir.value.set(0, 1 / this.blurA.height); this.pass(this.mBlur, this.blurA);
      this.mComp.uniforms.tBlur.value = this.blurA.texture;
    } else this.u.tilt.value = 0;
    if (bloomOn) this.u.bloom.value = this.cfg.bloom; if (this.blurA) this.u.tilt.value = this.cfg.tilt;
    this.pass(this.mComp, null); r.setRenderTarget(null);
  }
  dispose() { this.free(); for (const m of [this.mDown, this.mUp, this.mBlur, this.mComp]) m.dispose(); this.quad.dispose(); }
}
