// FX post module (Lighting and VFX Artist): EffectComposer chain per quality tier.
//   high: RenderPass (MSAA x4, half-float) > UnrealBloom (half-res) > tilt-shift H > tilt-shift V > OutputPass (ACES + sRGB) > grade (vignette, split tone, grain)
//   med : RenderPass (MSAA x2) > UnrealBloom > OutputPass > grade
//   low : no composer at all (renderer.render directly) + a CSS vignette overlay
import { THREE } from './kit.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const TILT = { uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uTexel: { value: new THREE.Vector2(1 / 540, 1 / 960) }, uFocus: { value: 0.42 }, uAmount: { value: 1.6 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir, uTexel; uniform float uFocus, uAmount; varying vec2 vUv;
    void main(){ float d = clamp((abs(vUv.y - uFocus) - 0.16) / 0.42, 0.0, 1.0); float b = d * d * uAmount; vec4 c = texture2D(tDiffuse, vUv);
      if (b < 0.06) { gl_FragColor = c; return; } vec2 s = uDir * uTexel * b; vec4 sum = c * 0.2270;
      sum += (texture2D(tDiffuse, vUv + s) + texture2D(tDiffuse, vUv - s)) * 0.1945; sum += (texture2D(tDiffuse, vUv + s * 2.0) + texture2D(tDiffuse, vUv - s * 2.0)) * 0.1216;
      sum += (texture2D(tDiffuse, vUv + s * 3.0) + texture2D(tDiffuse, vUv - s * 3.0)) * 0.0540; sum += (texture2D(tDiffuse, vUv + s * 4.0) + texture2D(tDiffuse, vUv - s * 4.0)) * 0.0162; gl_FragColor = sum; }` };

// final grade runs AFTER tone mapping, in display space, so the colours read exactly as authored
const GRADE = { uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 0.56 }, uVig: { value: 0.5 }, uGrain: { value: 0.03 }, uSat: { value: 1.1 }, uShadow: { value: new THREE.Color('#e9dcff') }, uHigh: { value: new THREE.Color('#ffefd6') }, uLift: { value: new THREE.Color('#2b2438') } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uAspect, uVig, uGrain, uSat; uniform vec3 uShadow, uHigh, uLift; varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114));
      c *= mix(uShadow, uHigh, smoothstep(0.12, 0.7, l)) ; c = mix(vec3(l), c, uSat); c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
      vec2 q = (vUv - 0.5) * vec2(1.0, 1.15); float v = smoothstep(0.28, 0.8, length(q)); c = mix(c, c * vec3(0.66, 0.52, 0.82), v * uVig);
      c += (hash(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * uGrain * (1.1 - l);
      c = uLift * 0.75 + c * (1.0 - uLift * 0.75); c = min(c, vec3(1.0, 0.953, 0.86)); gl_FragColor = vec4(c, 1.0); }` };

export function createPost(ctx, S) {
  const renderer = ctx.renderer, scene = ctx.scene, camera = ctx.camera;
  let comp = null, bloom = null, grade = null, tiltH = null, tiltV = null, tier = 'high', W = 540, H = 960, DPR = 1, overlay = null, active = false;
  const tmpV = new THREE.Vector2();
  const stats = { sceneCalls: 0, sceneTris: 0, totalCalls: 0 };

  function makeOverlay() {
    if (overlay || typeof document === 'undefined' || !ctx.canvas || !ctx.canvas.parentElement) return;
    const p = ctx.canvas.parentElement; try { if (getComputedStyle(p).position === 'static') p.style.position = 'relative'; } catch (e) { /* ignore */ }
    overlay = document.createElement('div'); overlay.setAttribute('data-park3d', 'vignette');
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;display:none;background:radial-gradient(ellipse 85% 75% at 50% 46%, rgba(43,36,56,0) 55%, rgba(80,50,110,0.38) 100%)';
    p.appendChild(overlay);
  }
  function disposeComposer() { if (!comp) return; comp.passes.forEach((p) => p.dispose && p.dispose()); comp.renderTarget1.dispose(); comp.renderTarget2.dispose(); comp = bloom = grade = tiltH = tiltV = null; }
  function build(q) {
    disposeComposer(); tier = q; makeOverlay();
    if (q === 'low') { active = false; if (overlay) overlay.style.display = 'block'; return; }
    active = true; if (overlay) overlay.style.display = 'none';
    const rt = new THREE.WebGLRenderTarget(Math.max(2, W * DPR), Math.max(2, H * DPR), { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 2 });
    comp = new EffectComposer(renderer, rt); comp.setPixelRatio(DPR); comp.setSize(W, H);
    const rp = new RenderPass(scene, camera); const orig = rp.render.bind(rp);
    rp.render = function (r, wb, rb, dt, ma) { orig(r, wb, rb, dt, ma); stats.sceneCalls = r.info.render.calls; stats.sceneTris = r.info.render.triangles; };
    comp.addPass(rp);
    bloom = new UnrealBloomPass(tmpV.set(W * DPR, H * DPR), S.bloom, 0.4, 0.85); comp.addPass(bloom);
    if (q === 'high') {
      const mk = (dx, dy) => { const p = new ShaderPass(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(TILT.uniforms), vertexShader: TILT.vertexShader, fragmentShader: TILT.fragmentShader, depthTest: false, depthWrite: false })); p.uniforms.uDir.value.set(dx, dy); return p; };
      tiltH = mk(1, 0); tiltV = mk(0, 1); comp.addPass(tiltH); comp.addPass(tiltV);
    }
    comp.addPass(new OutputPass());
    grade = new ShaderPass(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(GRADE.uniforms), vertexShader: GRADE.vertexShader, fragmentShader: GRADE.fragmentShader, depthTest: false, depthWrite: false })); comp.addPass(grade);
    applySize();
  }
  function applySize() {
    if (!comp) return; comp.setPixelRatio(DPR); comp.setSize(W, H);
    const px = Math.max(1, W * DPR), py = Math.max(1, H * DPR);
    if (tiltH) { tiltH.uniforms.uTexel.value.set(1 / px, 1 / py); tiltV.uniforms.uTexel.value.set(1 / px, 1 / py); tiltH.uniforms.uAmount.value = tiltV.uniforms.uAmount.value = 1.0 * DPR; }
    if (grade) grade.uniforms.uAspect.value = W / H;
  }
  return {
    stats,
    get active() { return active; },
    setQuality(q) { if (q !== tier || (!comp && q !== 'low')) build(q); },
    resize(w, h, dpr) { W = w; H = h; DPR = dpr; applySize(); },
    update(t) {
      if (bloom) { bloom.strength = S.bloom; bloom.threshold = S.bloomThr; bloom.radius = 0.3; }
      if (grade) { const u = grade.uniforms; u.uTime.value = t; u.uVig.value = S.vig; u.uSat.value = S.sat; u.uShadow.value.copy(S.gShadow); u.uHigh.value.copy(S.gHigh); u.uGrain.value = tier === 'high' ? 0.035 : 0.028; }
    },
    render() {
      renderer.info.reset(); // info.autoReset is off, so the stats the lead reads cover the whole frame (scene + post), not just the last quad
      if (comp) comp.render(); else renderer.render(scene, camera);
      stats.totalCalls = renderer.info.render.calls; if (!comp) { stats.sceneCalls = stats.totalCalls; stats.sceneTris = renderer.info.render.triangles; }
    },
    dispose() { disposeComposer(); if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay); overlay = null; },
  };
}
