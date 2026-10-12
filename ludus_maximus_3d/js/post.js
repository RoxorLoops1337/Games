// post.js : RenderPass -> UnrealBloomPass (emissive only, via HDR threshold) -> GradePass -> OutputPass
// GradePass = vignette + film grain + warm/cool split tone + chromatic aberration pulse + radial zoom blur + heat haze.
// Plus quality tiers and a dynamic resolution scaler.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Tier table. Consumers read: shadow (map size, 0 = off), crowd (density 0..1), dprCap, msaa, bloom (strength mult, 0 = pass off), bloomScale. */
export const TIERS = {
  high:   { dprCap: 2.0, msaa: 4, bloom: 1.0, bloomScale: 0.5,  shadow: 2048, crowd: 1.0, grain: 1, ca: 1, dust: 1.0 },
  medium: { dprCap: 1.5, msaa: 0, bloom: 0.8, bloomScale: 0.35, shadow: 1024, crowd: 0.8, grain: 1, ca: 1, dust: 0.6 },
  low:    { dprCap: 1.0, msaa: 0, bloom: 0.0, bloomScale: 0.25, shadow: 1024, crowd: 0.55, grain: 0, ca: 0, dust: 0.3 },
};
export function detectTier() {
  const mobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
  return mobile ? 'medium' : 'high';
}

export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 },
    uVignette: { value: 0.42 }, uVigSoft: { value: 0.55 },
    uGrain: { value: 0.028 },
    uShadowTint: { value: new THREE.Color(0.95, 0.93, 1.06) },   // cool violet-blue multiplier in shadows
    uHighTint: { value: new THREE.Color(1.12, 1.03, 0.88) },    // warm gold multiplier in highlights
    uSplit: { value: 1.0 },
    uSat: { value: 0.98 }, uContrast: { value: 1.12 }, uLift: { value: new THREE.Color(0.012, 0.008, 0.02) },
    uCA: { value: 0.0 },                                        // chromatic aberration amount (pulse 0..~0.012)
    uZoom: { value: 0.0 }, uZoomCenter: { value: new THREE.Vector2(0.5, 0.5) }, // radial zoom blur (0..~0.06)
    uHeat: { value: 0.0 },                                      // heat haze strength (0..~0.004)
    uHeatBand: { value: new THREE.Vector2(0.3, 0.55) },         // screen-y band (bottom,top) where haze acts
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uVigSoft, uGrain, uSplit, uSat, uContrast, uCA, uZoom, uHeat;
    uniform vec3 uShadowTint, uHighTint, uLift; uniform vec2 uZoomCenter, uHeatBand;
    varying vec2 vUv;
    float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec2 uv = vUv;
      if (uHeat > 0.0) {                       // heat haze: wobble inside a horizontal band, strongest in its middle
        float band = smoothstep(uHeatBand.x, uHeatBand.x + 0.1, uv.y) * smoothstep(uHeatBand.y + 0.1, uHeatBand.y, uv.y);
        uv.x += (vn(vec2(uv.x * 40.0, uv.y * 14.0 - uTime * 1.6)) - 0.5) * uHeat * band;
        uv.y += (vn(vec2(uv.x * 30.0 + 9.0, uv.y * 10.0 - uTime * 1.1)) - 0.5) * uHeat * 0.5 * band;
      }
      vec2 dc = uv - 0.5;
      vec3 col;
      if (uZoom > 0.0) {                       // radial zoom blur toward uZoomCenter
        vec2 dir = uv - uZoomCenter; col = vec3(0.0);
        for (int i = 0; i < 8; i++) { float k = float(i) / 7.0; col += texture2D(tDiffuse, uZoomCenter + dir * (1.0 - uZoom * k)).rgb; }
        col /= 8.0;
      } else if (uCA > 0.0) {                  // chromatic aberration: split R/B radially
        vec2 off = dc * uCA * (0.4 + length(dc) * 2.0);
        col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      } else col = texture2D(tDiffuse, uv).rgb;
      if (uZoom > 0.0 && uCA > 0.0) { vec2 off = dc * uCA; col.r = mix(col.r, texture2D(tDiffuse, uv + off).r, 0.6); col.b = mix(col.b, texture2D(tDiffuse, uv - off).b, 0.6); }
      // split tone (linear HDR, before tonemap): luminance picks shadow vs highlight tint
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 tint = mix(uShadowTint, uHighTint, smoothstep(0.02, 0.9, l));
      col *= mix(vec3(1.0), tint, uSplit);
      col += uLift * (1.0 - smoothstep(0.0, 0.25, l));                     // lifted violet blacks, never pure black
      l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.18) * uContrast + 0.18;
      float v = smoothstep(0.85, uVigSoft * 0.35, length(dc * vec2(1.0, 1.05)) );
      col *= mix(1.0 - uVignette, 1.0, v);
      float g = h21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
      col *= 1.0 + g * uGrain * 2.0;                                       // multiplicative: grain scales with brightness, safe in HDR
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, { tier = detectTier() } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const T = TIERS[tier];
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: T.msaa });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * T.bloomScale, size.y * T.bloomScale), 0.55, 0.65, 1.02);
  const grade = new ShaderPass(GradeShader);
  const output = new OutputPass();
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(grade); composer.addPass(output);
  const u = grade.uniforms;
  const api = {
    composer, bloom, grade, uniforms: u, tier, scale: 1, cssW: size.x, cssH: size.y,
    bloomBase: { strength: 0.55, radius: 0.65, threshold: 1.02 },
    setTier(name) {
      const t = TIERS[name]; if (!t) return; api.tier = name;
      for (const r of [composer.renderTarget1, composer.renderTarget2]) { r.samples = t.msaa; r.dispose(); }
      bloom.enabled = t.bloom > 0; bloom.strength = api.bloomBase.strength * t.bloom;
      u.uGrain.value = 0.028 * t.grain; api._ca = t.ca;
      api.setSize(api.cssW, api.cssH);
      return t;
    },
    /** css pixels; applies tier dpr cap * dynamic scale */
    setSize(w, h) {
      api.cssW = w; api.cssH = h;
      const t = TIERS[api.tier], pr = Math.min(window.devicePixelRatio || 1, t.dprCap) * api.scale;
      renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
      composer.setPixelRatio(pr); composer.setSize(w, h);
      bloom.resolution.set(w * pr * t.bloomScale, h * pr * t.bloomScale); bloom.setSize(w * pr * t.bloomScale * 2, h * pr * t.bloomScale * 2);
      return pr;
    },
    /** Short chromatic aberration punch on heavy hits. Decays in render(). */
    pulseCA(a = 0.012) { api._caPulse = a; },
    zoomPunch(a = 0.05, cx = 0.5, cy = 0.5) { api._zoomPulse = a; u.uZoomCenter.value.set(cx, cy); },
    render(dt, t) {
      u.uTime.value = t;
      api._caPulse = (api._caPulse || 0) * Math.exp(-dt * 9); api._zoomPulse = (api._zoomPulse || 0) * Math.exp(-dt * 7);
      u.uCA.value = (api._ca === 0 ? 0 : api._caPulse + 0.0008 * (api._ca === 0 ? 0 : 1)); // 0.0008 = permanent whisper of fringing
      u.uZoom.value = api._zoomPulse > 0.002 ? api._zoomPulse : 0;
      composer.render(dt);
    },
    dispose() { composer.dispose(); rt.dispose(); },
  };
  api._ca = T.ca;
  bloom.enabled = T.bloom > 0; bloom.strength = api.bloomBase.strength * T.bloom;
  u.uGrain.value = 0.028 * T.grain;
  return api;
}

/**
 * Dynamic resolution scaler. Call tick(frameMs) every frame. Steps scale in 0.1 increments between min..1.
 * Drops fast (2 slow frames), recovers slowly (120 fast frames). Also reports when to demote the tier.
 */
export function createDynamicRes(post, { target = 1000 / 55, min = 0.55, onTierDemote } = {}) {
  let ema = target, slow = 0, fast = 0, cool = 0;
  return {
    get ms() { return ema; },
    tick(ms) {
      ms = Math.min(ms, 100); ema += (ms - ema) * 0.1; if (cool > 0) { cool--; return post.scale; }
      if (ema > target * 1.25) { slow++; fast = 0; } else if (ema < target * 0.8) { fast++; slow = 0; } else { slow = fast = 0; }
      if (slow > 20 && post.scale > min) { post.scale = Math.max(min, +(post.scale - 0.1).toFixed(2)); post.setSize(post.cssW, post.cssH); slow = 0; cool = 20; }
      else if (slow > 60 && post.scale <= min && onTierDemote) { onTierDemote(); slow = 0; cool = 90; }
      else if (fast > 120 && post.scale < 1) { post.scale = Math.min(1, +(post.scale + 0.1).toFixed(2)); post.setSize(post.cssW, post.cssH); fast = 0; cool = 90; }
      return post.scale;
    },
  };
}
