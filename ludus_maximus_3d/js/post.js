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
const TIER_ORDER = ['low', 'medium', 'high'];
const TIER_KEY = 'ludus3d_tier_cap';
/** Highest tier a previous session on this device had to fall back to (written by the governor). null when unknown. */
export function savedTierCap() { try { const [v, t] = String(localStorage.getItem(TIER_KEY) || '').split(':'); return TIERS[v] && Date.now() - (+t || 0) < 14 * 864e5 ? v : null; } catch (e) { return null; } }
export function saveTierCap(name) { try { if (TIERS[name]) localStorage.setItem(TIER_KEY, name + ':' + Date.now()); } catch (e) { /* storage blocked */ } }
/**
 * Pick a tier from the device when no ?tier= is given. Phones/tablets (coarse pointer or touch UA):
 *   low  : <= 4 GB RAM or <= 4 cores, or unknown strength with a small screen;
 *   medium : >= 6 GB (or iOS, which hides deviceMemory) AND >= 6 cores.
 * Desktops: high, medium with <= 2 cores or <= 2 GB. (`env.software` forces low but main.js leaves it unset so automation keeps high.)
 * A tier the governor demoted to on this device earlier acts as a cap.
 */
export function detectTier(env = {}) {
  const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : {});
  const ua = nav.userAgent || '', cores = env.cores ?? nav.hardwareConcurrency ?? 0, mem = env.mem ?? nav.deviceMemory ?? 0;
  const coarse = env.coarse ?? (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  const w = env.width ?? (typeof innerWidth !== 'undefined' ? innerWidth : 1280);
  const mobile = /Android|iPhone|iPad|iPod|Mobi/i.test(ua) || (coarse && (w < 1100 || (nav.maxTouchPoints || 0) > 1)) || ((nav.maxTouchPoints || 0) > 1 && /Macintosh/.test(ua) && w < 1100);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
  let t;
  if (mobile) {
    const strong = (ios || mem >= 6) && (cores >= 6 || !cores);
    t = (mem && mem <= 4) || (cores && cores <= 4) ? 'low' : strong ? 'medium' : 'low';
  } else {
    t = (cores && cores <= 2) || (mem && mem <= 2) ? 'medium' : 'high';   // desktops stay high: the dynamic-res governor handles the rest
    if (env.software) t = 'low';
  }
  const cap = env.cap === undefined ? savedTierCap() : env.cap;
  if (cap && TIER_ORDER.indexOf(cap) < TIER_ORDER.indexOf(t)) t = cap;
  return t;
}
/** True for a software rasteriser (SwiftShader, llvmpipe): no use pretending it is a GPU. */
export function isSoftwareGL(renderer) {
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; return /swiftshader|llvmpipe|software/i.test(r); } catch (e) { return false; }
}
/**
 * Shadow-pass cost trim for gladiator rigs: every caster is one extra draw call per mesh, and a rig has ~11 tiny meshes.
 * Eyes and cloth flaps never cast; medium also drops hair/trim/plume, low also drops steel (weapon blades) and nets.
 */
const NO_CAST = { high: /^(eye|flap)$/, medium: /^(eye|flap|hair|trim|plume)$/, low: /^(eye|flap|hair|trim|plume|steel|net)$/ };
export function trimShadowCasters(root, tier = 'high') {
  const re = NO_CAST[tier] || NO_CAST.high; let n = 0;
  root.traverse((o) => { if (o.isMesh && o.castShadow && re.test(o.name || '')) { o.castShadow = false; n++; } });
  return n;
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
    pulseCA(a = 0.012) { if (!api.reducedMotion) api._caPulse = a; },
    zoomPunch(a = 0.05, cx = 0.5, cy = 0.5) { if (api.reducedMotion) return; api._zoomPulse = a; u.uZoomCenter.value.set(cx, cy); },
    /** prefers-reduced-motion: no CA pulse, no zoom blur, no heat-haze wobble, no film-grain flicker */
    reducedMotion: false,
    render(dt, t) {
      u.uTime.value = t;
      api._caPulse = (api._caPulse || 0) * Math.exp(-dt * 9); api._zoomPulse = (api._zoomPulse || 0) * Math.exp(-dt * 7);
      u.uCA.value = (api._ca === 0 ? 0 : api._caPulse + 0.0008 * (api._ca === 0 ? 0 : 1)); // 0.0008 = permanent whisper of fringing
      u.uZoom.value = api._zoomPulse > 0.002 ? api._zoomPulse : 0;
      if (api.reducedMotion) { u.uCA.value = 0; u.uZoom.value = 0; u.uHeat.value = 0; }
      composer.render(dt);
    },
    dispose() { bloom.dispose && bloom.dispose(); composer.dispose(); rt.dispose(); },
  };
  api._ca = T.ca;
  bloom.enabled = T.bloom > 0; bloom.strength = api.bloomBase.strength * T.bloom;
  u.uGrain.value = 0.028 * T.grain;
  return api;
}

/**
 * Dynamic resolution scaler. Call tick(frameMs) every frame. Steps scale in 0.1 increments between min..1.
 * Drops fast (20 slow frames), then demotes the tier after 150 more slow frames (2.5 s) at the floor.
 * Recovery: a 60 Hz display never produces frames under 16.7 ms, so "fast" is judged against the best frame time
 * seen recently (vsync) instead of an absolute 14 ms that could never be met. A recovery that fails (drop again within
 * 600 frames) doubles the wait before the next attempt (240 -> 480 -> ... 3840 frames), so a borderline device stops oscillating.
 * reset() ignores the next `warm` frames (scene switch, shader compile, tab resume) so one-off hitches never cost resolution.
 */
export function createDynamicRes(post, { target = 1000 / 55, min = 0.55, warm = 45, onTierDemote } = {}) {
  let ema = target, slow = 0, fast = 0, cool = 0, skip = warm, best = 1000, sinceUp = 1e9, wait = 240, bestAge = 0;
  const api = {
    get ms() { return ema; },
    get recoverWait() { return wait; },
    reset(frames = warm) { skip = frames; slow = fast = 0; ema = Math.min(ema, target); bestAge = 0; },
    tick(ms) {
      if (skip > 0) { skip--; return post.scale; }
      ms = Math.min(ms, 100); ema += (ms - ema) * 0.1; sinceUp++;
      if (ms >= 4) { if (ms < best) { best = ms; bestAge = 0; } else if (++bestAge > 600) { best = Math.min(best * 1.05, ema); bestAge = 0; } }   // vsync estimate drifts up when never re-hit
      if (cool > 0) { cool--; return post.scale; }
      const fastLim = Math.max(target * 0.8, best * 1.12);
      if (ema > target * 1.25) { slow++; fast = 0; } else if (ema < fastLim) { fast++; slow = 0; } else { slow = fast = 0; }
      if (slow > 20 && post.scale > min) {
        if (sinceUp < 600) wait = Math.min(3840, wait * 2);
        post.scale = Math.max(min, +(post.scale - 0.1).toFixed(2)); post.setSize(post.cssW, post.cssH); slow = 0; cool = 20;
      } else if (slow > 150 && post.scale <= min && onTierDemote) { onTierDemote(); slow = 0; cool = 90; best = 1000; }
      else if (fast > wait && post.scale < 1) { post.scale = Math.min(1, +(post.scale + 0.1).toFixed(2)); post.setSize(post.cssW, post.cssH); fast = 0; cool = 90; sinceUp = 0; }
      return post.scale;
    },
  };
  return api;
}
