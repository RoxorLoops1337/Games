// The post-processing chain.
//
// Order, and why it is that order:
//
//   scene    world → HDR + depth        the only geometry pass the chain owns
//   ao       GTAO from depth            half res, denoised
//   vol      light shafts through the sun's shadow map
//   resolve  AO onto indirect, shafts added, viewmodel drawn on top
//   blur     depth-reconstructed motion blur, world only
//   taa      jittered temporal resolve
//   bloom    threshold + mip pyramid, from the stabilised frame
//   comp     exposure → AgX → grade → grain/aberration/vignette → sRGB
//
// Three placements in there are load-bearing rather than arbitrary. The
// viewmodel is drawn *after* the world-space effects, so the depth buffer they
// read never contains a gun 40 cm from the lens. Motion blur runs before TAA,
// because blurring an already-accumulated frame re-smears history that TAA just
// worked to clean up. And bloom is sampled from the post-TAA image: bloom of a
// noisy frame is a strobe light, bloom of a stable one is a glow.
//
// Every stage is independently switchable and independently droppable. Missing
// float targets take out motion blur and TAA (both need signed and HDR data);
// a missing depth texture takes out AO, volumetrics, motion blur and TAA at
// once, leaving scene → bloom → composite → FXAA, which is still a picture. If
// the chain throws for any reason it latches off and falls back to a plain
// forward render for the rest of the session, because a black screen that logs
// once is worse than no post at all.

import * as THREE from 'three';
import { bestHDRType, makeRT, halton, disposeAll } from './passes/common.js';
import { createScenePass, findSun } from './passes/scene.js';
import { createAOPass } from './passes/ao.js';
import { createVolumetricPass } from './passes/volumetrics.js';
import { createResolvePass } from './passes/resolve.js';
import { createBloomPass } from './passes/bloom.js';
import { createMotionBlurPass } from './passes/motionblur.js';
import { createTAAPass } from './passes/taa.js';
import { createCompositePass } from './passes/composite.js';
import { createFXAAPass } from './passes/fxaa.js';

export function createPostFX(G, engine, sky) {
  const renderer = engine.renderer;

  // ── capability probe ───────────────────────────────────────────────────────
  const hdrType = bestHDRType(renderer);
  const isHDR = hdrType === THREE.HalfFloatType;

  const passes = {};
  const caps = { hdr: isHDR, depth: false, ao: false, vol: false, blur: false, taa: false };

  let broken = false;
  let width = 1, height = 1;
  let frame = 0, clock = 0;
  let captured = false;

  try {
    passes.scene = createScenePass(renderer, engine, { hdrType });
    caps.depth = passes.scene.hasDepth;

    passes.resolve = createResolvePass(renderer);
    passes.bloom = createBloomPass(renderer, { hdrType, threshold: 0.85, knee: 0.6 });
    passes.composite = createCompositePass(renderer);
    passes.fxaa = createFXAAPass(renderer);

    if (caps.depth) {
      passes.ao = createAOPass(renderer, { radius: 0.9, intensity: 1.4 });
      passes.vol = createVolumetricPass(renderer, { hdrType });
      caps.ao = true;
      caps.vol = true;
    }
    // Velocity is signed and the accumulation buffer needs headroom above 1.0;
    // both are meaningless in an 8-bit target, so these two ride on HDR.
    if (caps.depth && isHDR) {
      passes.blur = createMotionBlurPass(renderer, { hdrType });
      passes.taa = createTAAPass(renderer, { hdrType, feedback: 0.90 });
      caps.blur = true;
      caps.taa = true;
    }
  } catch (err) {
    broken = true;
    console.warn('[postfx] could not build the chain, falling back to a forward render:', err);
  }

  // Full-resolution working buffers. `workA` carries a depth buffer because the
  // viewmodel is drawn into it; `workB` is a pure ping-pong and does not.
  let workA = null, workB = null, ldr = null;

  // ── camera snapshot ────────────────────────────────────────────────────────
  // TAA moves the projection by up to half a pixel every frame. Every pass that
  // reconstructs world positions must use the *unjittered* matrices or the whole
  // reconstruction wobbles in time with the jitter, so the chain works off this
  // snapshot rather than off the live camera.
  const cam = {
    projectionMatrix: new THREE.Matrix4(),
    matrixWorld: new THREE.Matrix4(),
    matrixWorldInverse: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    near: 0.06, far: 900,
  };
  const viewProj = new THREE.Matrix4();
  const prevViewProj = new THREE.Matrix4();
  const invViewProj = new THREE.Matrix4();
  let vpValid = false;

  const sunDir = new THREE.Vector3(0, 1, 0);
  const sunColor = new THREE.Color(1, 0.86, 0.68);
  let sun = null, sunSearch = 0;

  function captureCamera() {
    const c = engine.camera;
    // Element 8 and 9 are the only two the jitter touches, and they are exactly
    // zero for a symmetric frustum — so stripping the jitter is a store, not a
    // subtraction, and stays correct across an FOV change.
    c.projectionMatrix.elements[8] = 0;
    c.projectionMatrix.elements[9] = 0;
    cam.projectionMatrix.copy(c.projectionMatrix);
    cam.matrixWorld.copy(c.matrixWorld);
    cam.matrixWorldInverse.copy(c.matrixWorldInverse);
    cam.position.copy(c.position);
    cam.near = c.near; cam.far = c.far;

    prevViewProj.copy(viewProj);
    viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    invViewProj.copy(viewProj).invert();
    // The first frame has no previous frame; without this every pixel starts
    // with a screen-sized velocity and the opening frame is a white smear.
    if (!vpValid) { prevViewProj.copy(viewProj); vpValid = true; }
    captured = true;
  }

  function applyJitter() {
    const on = useTAA();
    const jx = on ? (halton(frame % 8 + 1, 2) - 0.5) * 2 / Math.max(1, width) : 0;
    const jy = on ? (halton(frame % 8 + 1, 3) - 0.5) * 2 / Math.max(1, height) : 0;
    engine.camera.projectionMatrix.elements[8] = jx;
    engine.camera.projectionMatrix.elements[9] = jy;
    // The viewmodel rides the same jitter, otherwise it is the one object in
    // the frame TAA cannot converge and it alone stays aliased.
    engine.viewCam.projectionMatrix.elements[8] = jx;
    engine.viewCam.projectionMatrix.elements[9] = jy;
  }

  function refreshSun() {
    // The scene graph is not stable at boot and lights can be added later, so
    // keep looking until one turns up, then stop paying for the traverse.
    if (!sun && (frame - sunSearch) >= 0) {
      sunSearch = frame + 30;
      sun = findSun(engine.scene);
    }
    if (sky && sky.sunDir) sunDir.copy(sky.sunDir).normalize();
    else if (sun) sunDir.copy(sun.position).sub(sun.target ? sun.target.position : ORIGIN).normalize();
    if (sky && sky.sunColor) sunColor.copy(sky.sunColor);
    else if (sun) sunColor.copy(sun.color);
  }
  const ORIGIN = new THREE.Vector3();

  // ── settings ───────────────────────────────────────────────────────────────
  const enabled = {
    ao: true, volumetrics: true, motionBlur: true, bloom: true,
    taa: true, grain: true, chromatic: true, vignette: true,
  };

  function useTAA() {
    return !broken && caps.taa && enabled.taa && !!passes.taa && G.settings.quality >= 1;
  }
  function useVol() {
    return caps.vol && enabled.volumetrics && G.settings.volumetrics !== false
      && !!passes.vol && passes.vol.enabled;
  }
  function useBlur() {
    return caps.blur && enabled.motionBlur && G.settings.motionBlur !== false && !!passes.blur;
  }
  function useAO() {
    return caps.ao && enabled.ao && !!passes.ao && passes.ao.enabled;
  }

  function applyTier() {
    const t = engine.tier;
    if (passes.ao) passes.ao.setSamples(t.ao);
    if (passes.vol) passes.vol.setSteps(t.vol);
    if (passes.bloom) passes.bloom.setMips(t.bloom);
    if (passes.taa) passes.taa.invalidate();
  }

  function applySettings() {
    if (!passes.composite) return;
    const u = passes.composite.uniforms;
    u.uGrain.value = (enabled.grain && G.settings.filmGrain !== false) ? 0.030 : 0.0;
    u.uChromatic.value = (enabled.chromatic && G.settings.chromatic !== false) ? 0.9 : 0.0;
    u.uVignette.value = enabled.vignette ? 0.55 : 0.0;
  }

  // ── allocation ─────────────────────────────────────────────────────────────
  function resize(w, h) {
    width = Math.max(1, Math.floor(w) || 1);
    height = Math.max(1, Math.floor(h) || 1);
    if (broken) return;
    try {
      disposeAll([workA, workB, ldr]);
      workA = makeRT(width, height, { type: hdrType, depth: true, name: 'work.a' });
      workB = makeRT(width, height, { type: hdrType, name: 'work.b' });
      ldr = makeRT(width, height, { name: 'ldr' });

      passes.scene.resize(width, height);
      passes.resolve.resize(width, height);
      passes.bloom.resize(width, height);
      passes.composite.resize(width, height);
      passes.fxaa.resize(width, height);
      if (passes.ao) passes.ao.resize(width, height);
      if (passes.vol) passes.vol.resize(width, height);
      if (passes.blur) passes.blur.resize(width, height);
      if (passes.taa) passes.taa.resize(width, height);
      vpValid = false;
    } catch (err) {
      broken = true;
      console.warn('[postfx] target allocation failed, falling back to a forward render:', err);
    }
  }

  // ── the frame ──────────────────────────────────────────────────────────────
  function forward() {
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    renderer.clear();
    renderer.render(engine.scene, engine.camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(engine.view, engine.viewCam);
    renderer.autoClear = true;
  }

  function renderChain() {
    if (!captured) captureCamera();
    refreshSun();
    applySettings();

    const scene = passes.scene;
    scene.renderWorld();

    // From here on the chain clears explicitly. Leaving autoClear on would make
    // the additive bloom upsample wipe the level it is supposed to add into.
    renderer.autoClear = false;

    const depth = scene.depthTexture;
    const needMask = useBlur() || useTAA();
    if (needMask) scene.renderMask();
    const maskTex = needMask ? scene.mask.texture : null;

    let aoTex = null;
    if (useAO()) {
      passes.ao.render(depth, cam, frame);
      aoTex = passes.ao.texture;
    }

    let volTex = null;
    if (useVol()) {
      passes.vol.render(depth, cam, sun, sunDir, sunColor, frame);
      volTex = passes.vol.texture;
    }

    passes.resolve.render(workA, scene.color.texture, aoTex, volTex, depth, cam, sun, sunDir);
    scene.renderViewmodel(workA);

    let cur = workA.texture;

    if (useBlur()) {
      passes.blur.render(workB, cur, depth, maskTex, cam, invViewProj, prevViewProj, frame);
      cur = workB.texture;
    }

    if (useTAA()) {
      cur = passes.taa.render(cur, depth, maskTex, cam, invViewProj, prevViewProj);
    }

    let bloomTex = null;
    if (enabled.bloom && passes.bloom.enabled) {
      passes.bloom.render(cur);
      bloomTex = passes.bloom.texture;
    }

    if (useTAA()) {
      passes.composite.render(null, cur, bloomTex, clock);
    } else {
      // No temporal filter, so the frame still needs edge work — and FXAA wants
      // the tonemapped image, which only exists after the composite.
      passes.composite.render(ldr, cur, bloomTex, clock);
      passes.fxaa.render(null, ldr.texture);
    }

    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    captured = false;
  }

  applyTier();
  applySettings();
  // main.js sizes the engine before the chain exists, so the first `resize` has
  // to come from here or nothing is ever allocated and the chain sits in its
  // fallback path forever.
  resize(engine.size.w * engine.size.dpr, engine.size.h * engine.size.dpr);

  const api = {
    // Exposed so a settings menu or a debug key can switch a single stage
    // without rebuilding anything.
    passes, caps, enabled,

    render() {
      if (broken || !workA) { forward(); return; }
      try {
        renderChain();
      } catch (err) {
        broken = true;
        renderer.autoClear = true;
        console.warn('[postfx] chain threw, falling back to a forward render:', err);
        forward();
      }
    },

    resize,

    setQuality() {
      if (broken) return;
      applyTier();
      applySettings();
    },

    update(dt) {
      frame++;
      clock += (dt || 0);
      if (broken) return;
      captureCamera();
      applyJitter();
    },

    // Tuning hooks — the grade lives here rather than in a constants file
    // because it is the one thing you want to change while looking at the game.
    get exposure() { return passes.composite ? passes.composite.uniforms.uExposure.value : 1; },
    set exposure(v) { if (passes.composite) passes.composite.uniforms.uExposure.value = v; },
    get bloomStrength() { return passes.composite ? passes.composite.uniforms.uBloom.value : 0; },
    set bloomStrength(v) { if (passes.composite) passes.composite.uniforms.uBloom.value = v; },

    dispose() {
      disposeAll([workA, workB, ldr]);
      for (const k in passes) if (passes[k] && passes[k].dispose) passes[k].dispose();
    },
  };

  return api;
}
