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

// A host keeps ONE post chain for every world: createSharedPost(renderer, S) builds it with no scene yet, each world's lighting calls post.bind({ scene, camera, S }) and
// post.unbind(S) on dispose. bind never touches the render targets (they are only rebuilt on a quality change or a fallback-ladder step), so a world switch re-creates nothing.
const EMPTY = { scene: null, camera: null };
export function createSharedPost(renderer, S) {
  if (!EMPTY.scene) { EMPTY.scene = new THREE.Scene(); EMPTY.camera = new THREE.PerspectiveCamera(); }
  const post = createPost({ renderer, scene: EMPTY.scene, camera: EMPTY.camera, canvas: renderer.domElement }, S || defaultState());
  post.shared = true; return post;
}
function defaultState() { return { bloom: 0.3, bloomThr: 1.25, vig: 0.5, sat: 1.1, tilt: 1, gShadow: new THREE.Color('#e9dcff'), gHigh: new THREE.Color('#ffefd6') }; }

export function createPost(ctx, S) {
  const renderer = ctx.renderer; let scene = ctx.scene, camera = ctx.camera, rp = null;
  let comp = null, bloom = null, grade = null, tiltH = null, tiltV = null, tier = 'high', W = 540, H = 960, DPR = 1, overlay = null, active = false;
  const tmpV = new THREE.Vector2();
  const stats = { sceneCalls: 0, sceneTris: 0, totalCalls: 0, rung: 0, builds: 0 };
  // Fallback ladder for GPUs (many phones) that cannot render to half-float or multisampled targets: those show a black frame.
  // rung 0 = HDR half-float + MSAA, 1 = half-float no MSAA, 2 = 8-bit no MSAA, 3 = no composer (same as low).
  // base = what this device can do (found by the framebuffer probe at build and the blank-frame guard; it only ever goes down); floor = what the bound world asks for (ctx.postRung, e.g. the rhythm
  // stage needs 8-bit post against half-float overflow). The chain runs at rung = max(base, floor), and only rebuilds when that changes.
  let base = 0, floor = 0, rung = 0, frames = 0, blankRun = 0, forceBlank = 0; const px4 = new Uint8Array(4); const PTS = [[0.5, 0.5], [0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75], [0.5, 0.9], [0.5, 0.1]], ptv = new Int16Array(PTS.length * 3);
  (function pickStartRung() { try { const r = parseInt(new URLSearchParams(location.search).get('rung'), 10); if (r >= 0 && r <= 3) { base = r; return; } } catch (e) { /* ignore */ } if (ctx.postRung > 0) floor = ctx.postRung; try { const x = renderer.extensions; if (!x.has('EXT_color_buffer_float')) base = Math.max(base, x.has('EXT_color_buffer_half_float') ? 1 : 2); } catch (e) { base = 2; } })();
  rung = Math.max(base, floor); stats.rung = rung;

  function makeOverlay() {
    if (overlay || typeof document === 'undefined' || !ctx.canvas || !ctx.canvas.parentElement) return;
    const p = ctx.canvas.parentElement; try { if (getComputedStyle(p).position === 'static') p.style.position = 'relative'; } catch (e) { /* ignore */ }
    overlay = document.createElement('div'); overlay.setAttribute('data-park3d', 'vignette');
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;display:none;background:radial-gradient(ellipse 85% 75% at 50% 46%, rgba(43,36,56,0) 55%, rgba(80,50,110,0.38) 100%)';
    p.appendChild(overlay);
  }
  function disposeComposer() { if (!comp) return; comp.passes.forEach((p) => p.dispose && p.dispose()); comp.dispose(); comp = bloom = grade = tiltH = tiltV = rp = null; }
  // is the composer's draw target renderable on this GPU? an incomplete framebuffer is what turns into a black frame, so test it at build, before anything is shown
  function targetOK(rt) {
    try { const gl = renderer.getContext(), prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER); renderer.setRenderTarget(prev); return st === gl.FRAMEBUFFER_COMPLETE; } catch (e) { return true; }
  }
  function build(q) {
    disposeComposer(); tier = q; makeOverlay(); stats.builds++;
    frames = 0; blankRun = 0; rung = Math.max(base, floor); stats.rung = rung;
    if (q === 'low' || rung >= 3) { active = false; if (overlay) overlay.style.display = 'block'; return; }
    active = true; if (overlay) overlay.style.display = 'none';
    const rt = new THREE.WebGLRenderTarget(Math.max(2, W * DPR), Math.max(2, H * DPR), { type: rung >= 2 ? THREE.UnsignedByteType : THREE.HalfFloatType, samples: rung === 0 ? (q === 'high' ? 4 : 2) : 0 });
    if (!targetOK(rt)) { rt.dispose(); base = rung + 1; try { console.warn('Park3D: post target incomplete on rung ' + rung + ', using rung ' + base); } catch (e) { /* ignore */ } build(q); return; }
    comp = new EffectComposer(renderer, rt); comp.setPixelRatio(DPR); comp.setSize(W, H);
    rp = new RenderPass(scene, camera); const orig = rp.render.bind(rp);
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
  // What a BROKEN frame looks like at the canvas: the grade pass turns an empty (all zero) input into its lift colour (uLift * 0.75 = 32,27,42 in 8 bit) plus +-4 of grain, and a NaN frame (half-float
  // overflow) reads pure black. A valid frame, however dark (night, the bar, a stage), is never exactly that colour at all 7 well spread points, because the lit scene sits on top of the lift.
  const SIG = [32, 27, 42], TOL = 9;
  function checkBlank() {
    // armed from the 3rd frame after a build or a bind (the world is up and has rendered), then every 3rd frame up to frame 45: about 14 tiny reads per world, never on later frames
    frames++; if (frames < 3 || frames > 45 || frames % 3) return false;
    const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    try { gl.bindFramebuffer(gl.FRAMEBUFFER, null); for (let i = 0; i < PTS.length; i++) { gl.readPixels((w * PTS[i][0]) | 0, (h * PTS[i][1]) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px4); ptv[i * 3] = px4[0]; ptv[i * 3 + 1] = px4[1]; ptv[i * 3 + 2] = px4[2]; } } catch (e) { return false; }
    let sig = true, nan = true; for (let i = 0; i < PTS.length; i++) for (let k = 0; k < 3; k++) { const v = ptv[i * 3 + k]; if (Math.abs(v - SIG[k]) > TOL) sig = false; if (v > 6) nan = false; }
    let flat = true, mean = 0; for (let i = 0; i < PTS.length; i++) { mean += (ptv[i * 3] + ptv[i * 3 + 1] + ptv[i * 3 + 2]) / 3; for (let k = 0; k < 3; k++) if (Math.abs(ptv[i * 3 + k] - ptv[k]) > 10) flat = false; } mean /= PTS.length;
    let blank = sig || nan || (flat && mean < 40); if (forceBlank > 0) { forceBlank--; blank = true; }
    blankRun = blank ? blankRun + 1 : 0;
    if (blankRun >= 2) { base = rung + 1; try { console.warn('Park3D: blank frame on post rung ' + rung + ', falling back to rung ' + base); } catch (e) { /* ignore */ } build(tier); return true; }
    return false;
  }
  return {
    stats,
    _forceBlank(n) { forceBlank = n; },
    get active() { return active; }, get tierName() { return tier; }, get state() { return S; },
    // hand the chain to another world (no render target is touched); the blank-frame guard re-arms so the new world is checked too
    bind(b) { scene = b.scene; camera = b.camera; if (b.S) S = b.S; if (rp) { rp.scene = scene; rp.camera = camera; } frames = 0; blankRun = 0; },
    // the bound world's minimum rung (host: ctx.postRung of the world being built, 0 on unload). Rebuilds only when the effective rung changes, and only between worlds (under the load cover).
    setFloor(n) { n = Math.max(0, Math.min(3, n | 0)); if (n === floor) return; floor = n; if (Math.max(base, floor) !== rung && (comp || (tier !== 'low' && rung >= 3))) build(tier); else { rung = Math.max(base, floor); stats.rung = rung; } },
    get rung() { return rung; }, get baseRung() { return base; },
    unbind(Sref) { if (Sref && Sref !== S) return; scene = EMPTY.scene; camera = EMPTY.camera; if (rp) { rp.scene = scene; rp.camera = camera; } },
    setQuality(q) { if (q !== tier || (!comp && q !== 'low')) build(q); },
    resize(w, h, dpr) { if (w === W && h === H && dpr === DPR) return; W = w; H = h; DPR = dpr; applySize(); },
    update(t) {
      if (bloom) { bloom.strength = Math.min(1.6, Math.max(0, S.bloom || 0)); bloom.threshold = rung >= 2 ? Math.min(S.bloomThr, 0.88) : S.bloomThr; bloom.radius = 0.3; }
      if (tiltH) { const k = (S.tilt === undefined ? 1 : S.tilt) * DPR; tiltH.uniforms.uAmount.value = tiltV.uniforms.uAmount.value = k; } // interiors use a gentler tilt-shift
      if (grade) { const u = grade.uniforms; u.uTime.value = t; u.uVig.value = S.vig; u.uSat.value = S.sat; u.uShadow.value.copy(S.gShadow); u.uHigh.value.copy(S.gHigh); u.uGrain.value = tier === 'high' ? 0.035 : 0.028; }
    },
    render() {
      renderer.info.reset(); // info.autoReset is off, so the stats the lead reads cover the whole frame (scene + post), not just the last quad
      // a ladder step renders the SAME frame again on the new chain right away, so a rung change never leaves the broken frame on screen
      if (comp) { comp.render(); if (checkBlank()) { renderer.info.reset(); if (comp) comp.render(); else renderer.render(scene, camera); } } else renderer.render(scene, camera);
      stats.totalCalls = renderer.info.render.calls; if (!comp) { stats.sceneCalls = stats.totalCalls; stats.sceneTris = renderer.info.render.triangles; }
    },
    dispose() { disposeComposer(); if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay); overlay = null; },
  };
}
