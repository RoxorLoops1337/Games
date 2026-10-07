// CHARACTER PORTRAIT: head-and-shoulders bust rendered to a canvas through the SHARED renderer (a small render target, then readPixels), for dialogs, the creator thumbs
// and the battle VS splash. Lazy: nothing is built until the first call; disposePortraits() frees the studio (character, scene, render target).
//   const canvas = portrait(look, { mood: 'angry', size: 192, renderer, bg: null, clip: 'idle' })   // -> HTMLCanvasElement (transparent background unless opts.bg), or null without a renderer
// The renderer comes from opts.renderer or from the ctx of the last createCharacter() call (every Park3D ctx has ctx.renderer). Safe to call many times: one studio is reused.
import { THREE } from './kit.js';
import { createCharacter } from './characters.js';

let STUDIO = null, LAST_RENDERER = null;
export function setPortraitRenderer(r) { LAST_RENDERER = r || null; }
// the studio rig: warm key, cool rim, soft sky fill. Exported so the beauty-sheet tool and the portraits agree on how a character looks.
export function addStudioLights(scene) {
  const hemi = new THREE.HemisphereLight(0xfff0dd, 0x6a5a9a, 1.35), key = new THREE.DirectionalLight(0xffe2b8, 2.5), rim = new THREE.DirectionalLight(0x9bb8ff, 0.9);
  key.position.set(2.2, 3.2, 3.4); rim.position.set(-3, 2, -2.5); scene.add(hemi, key, rim, key.target, rim.target); return { hemi, key, rim };
}
function studio(renderer) {
  if (STUDIO && STUDIO.renderer === renderer) return STUDIO; if (STUDIO) disposePortraits();
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(24, 1, 0.1, 30), lights = addStudioLights(scene), char = createCharacter({ quality: 'high' }, null);
  scene.add(char.object); STUDIO = { renderer, scene, camera, lights, char, rt: null, rtSize: 0 }; return STUDIO;
}
export function disposePortraits() { if (!STUDIO) return; try { STUDIO.char.dispose(); if (STUDIO.rt) STUDIO.rt.dispose(); } catch (e) { /* ignore */ } STUDIO = null; }

export function portrait(look, opts) {
  opts = opts || {}; const renderer = opts.renderer || LAST_RENDERER; if (!renderer || typeof document === 'undefined') return null;
  const w = Math.max(16, Math.round(opts.width || opts.size || 128)), h = Math.max(16, Math.round(opts.height || opts.size || 128)), S = studio(renderer), char = S.char;
  char.setLook(look); char.setMood(opts.mood || 'neutral', true); char.play(opts.clip || 'idle', opts.playOpts || {});
  const L = char.anim.life; L.blinkT = 99; L.blink = 0; L.gazeT = 99; L.gaze = [0, 0];
  // frame: from the chest to the top of whatever is on the head (hats, hair), centred on the head
  const pos = char.object.getObjectByName('char_lit').geometry.attributes.position; let top = 1.6; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > top) top = y; }
  const bottom = 0.84, hh = Math.max(top + 0.06 - bottom, 0.95) * (opts.zoom ? 1 / opts.zoom : 1), cy = (bottom + top + 0.06) / 2 + (opts.dy || 0), cam = S.camera, fov = 24, dist = (hh * 0.5) / Math.tan((fov * Math.PI) / 360);
  cam.fov = fov; cam.aspect = w / h; cam.position.set(Math.sin(opts.yaw || 0.12) * dist, cy + 0.02, Math.cos(opts.yaw || 0.12) * dist); cam.lookAt(0, cy, 0); cam.updateProjectionMatrix();
  cam.updateMatrixWorld(); char.lookAt(cam.position); for (let i = 0; i < 6; i++) char.update(1 / 30, i / 30);
  // render to an sRGB render target (multisampled when the GPU can), read it back, flip, put it on a canvas
  if (!S.rt || S.rt.width !== w || S.rt.height !== h) { if (S.rt) S.rt.dispose(); S.rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, depthBuffer: true }); S.rt.texture.colorSpace = THREE.SRGBColorSpace; }
  const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearAlpha(), prevColor = renderer.getClearColor(new THREE.Color()), prevAuto = renderer.autoClear, prevXR = renderer.xr && renderer.xr.enabled;
  const bg = opts.bg ? new THREE.Color(opts.bg) : null;
  try {
    if (renderer.xr) renderer.xr.enabled = false; renderer.autoClear = true; renderer.setRenderTarget(S.rt); renderer.setClearColor(bg || 0x000000, bg ? 1 : 0); renderer.clear(); renderer.render(S.scene, cam);
    const buf = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(S.rt, 0, 0, w, h, buf);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    g.putImageData(img, 0, 0); return cv;
  } catch (e) { console.error('[characters] portrait failed: ' + (e && e.message || e)); return null; }
  finally { renderer.setRenderTarget(prevRT); renderer.setClearColor(prevColor, prevClear); renderer.autoClear = prevAuto; if (renderer.xr) renderer.xr.enabled = prevXR; }
}
