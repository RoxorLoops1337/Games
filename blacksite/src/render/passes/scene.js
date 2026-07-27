// Pass 1 — the scene into an HDR buffer, plus the geometry buffers the rest of
// the chain reads.
//
// Two things here are deliberate and easy to get wrong.
//
// The world and the viewmodel are *not* drawn together. Everything downstream
// that reads depth — AO, volumetrics, motion blur, TAA reprojection — wants
// world geometry only: a weapon 40 cm from the lens has no meaningful world
// velocity, occludes nothing it should occlude, and would poison a depth-derived
// normal along its whole silhouette. So the world lands here with a depth
// texture attached, the effects run against that, and the viewmodel is drawn on
// top afterwards with the depth buffer cleared (`renderViewmodel`) so it can
// never clip into a doorway.
//
// The second is the silhouette mask. The two passes that still need to know
// where the weapon is — motion blur and the temporal filter — get it from one
// extra quarter-resolution draw of the viewmodel in flat white. That is a
// handful of triangles, and it is the difference between a stable weapon and a
// weapon that ghosts across the screen every time the player turns.

import * as THREE from 'three';
import { makeRT, makeDepthTexture } from './common.js';

export function createScenePass(renderer, engine, opts = {}) {
  const hdrType = opts.hdrType || THREE.UnsignedByteType;

  let color = null, mask = null, depthTex = null;
  let w = 1, h = 1;

  const maskMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, fog: false, depthTest: false, depthWrite: false, toneMapped: false,
  });

  function alloc(nw, nh) {
    w = Math.max(1, nw | 0); h = Math.max(1, nh | 0);
    free();
    color = makeRT(w, h, { type: hdrType, name: 'hdr.world', depth: true });
    depthTex = makeDepthTexture(renderer, w, h);
    if (depthTex) color.depthTexture = depthTex;
    // Quarter res is plenty: the mask is only ever used as a binary "is this the
    // weapon" test, and a soft edge there is harmless.
    mask = makeRT(Math.max(1, w >> 1), Math.max(1, h >> 1), { name: 'vm.mask' });
  }

  function free() {
    if (color) color.dispose();
    if (mask) mask.dispose();
    color = mask = depthTex = null;
  }

  const api = {
    get color() { return color; },
    get mask() { return mask; },
    get depthTexture() { return depthTex; },
    get hasDepth() { return !!depthTex; },

    resize(nw, nh) { alloc(nw, nh); },

    // World only. Background and fog come from the scene as configured by the
    // sky module; nothing here overrides them.
    renderWorld() {
      renderer.setRenderTarget(color);
      renderer.autoClear = true;
      renderer.clear(true, true, false);
      renderer.render(engine.scene, engine.camera);
    },

    // Draws the viewmodel into whatever target the chain has reached, clearing
    // depth first. Called after the world-space effects have run, so their
    // inputs stay clean.
    renderViewmodel(target) {
      renderer.setRenderTarget(target);
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(engine.view, engine.viewCam);
      renderer.autoClear = true;
    },

    // Flat-white silhouette of the viewmodel. `overrideMaterial` is set and
    // restored around the draw so the viewmodel module never sees it.
    renderMask() {
      const prev = engine.view.overrideMaterial;
      engine.view.overrideMaterial = maskMaterial;
      renderer.setRenderTarget(mask);
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, false);
      renderer.render(engine.view, engine.viewCam);
      engine.view.overrideMaterial = prev;
    },

    dispose() { free(); maskMaterial.dispose(); },
  };

  alloc(1, 1);
  return api;
}

// The chain needs the sun for both the AO composite and the light shafts, but
// `createPostFX` is only handed the sky. Rather than widen a signature that
// main.js already calls, find it: the brightest shadow-casting directional
// light in the scene is the sun by definition.
export function findSun(scene) {
  let best = null, bestI = -1;
  scene.traverse((o) => {
    if (o.isDirectionalLight && o.castShadow && o.intensity > bestI) { best = o; bestI = o.intensity; }
  });
  return best;
}
