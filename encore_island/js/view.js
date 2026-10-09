'use strict';
// Encore Island — the 2D / 3D view switch. The simulation never knows which view is on: this file only decides how the world is DRAWN.
//   2D: the canvas renderer in render_world.js / render_actors.js (default).   3D: view3d/engine.js (three.js, loaded on demand, medium-poly),
//   drawn on a WebGL canvas UNDER the transparent 2D canvas, which keeps drawing the whole HUD, menus and world labels on top.
// The choice is remembered in its own localStorage key (not in the save). 3D falls back to 2D by itself when WebGL or the module is missing.
const VIEW = { mode: '2d', on3d: false, api: null, status: 'idle', quality: 'auto', note: '', progress: 0, err: '' };
const VIEW_KEY = 'encore_island_view_v1';
const VIEW_SRC = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) ? new URL('../view3d/engine.js', document.currentScript.src).href : './view3d/engine.js';
(function viewLoadPref() {
  try { const o = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); if (o.mode === '3d' || o.mode === '2d') VIEW.mode = o.mode; if (['auto', 'low', 'medium', 'high'].includes(o.q)) VIEW.quality = o.q; } catch (e) { /* default view */ }
})();
function viewSavePref() { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ mode: VIEW.mode, q: VIEW.quality })); } catch (e) { /* private mode */ } }
function viewSupported() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
function viewLoad() { // load and start the 3D engine once; resolves true when it is ready to draw
  if (VIEW.status === 'ready') return Promise.resolve(true);
  if (VIEW._p) return VIEW._p;
  VIEW.status = 'loading'; VIEW.progress = 0;
  VIEW._p = (async () => {
    try {
      if (typeof window.__EI_FORCE3D === 'undefined' && typeof window.__EI_HEADLESS__ !== 'undefined') throw new Error('headless');
      if (!viewSupported()) throw new Error('WebGL is not available');
      const cv3 = document.getElementById('game3d'); if (!cv3) throw new Error('no 3D canvas');
      const mod = await import(VIEW_SRC);
      VIEW.api = await mod.createView({ canvas: cv3, quality: VIEW.quality, onProgress: (p) => { VIEW.progress = p; } });
      VIEW.api.resize(vw, vh, dpr); VIEW.status = 'ready'; return true;
    } catch (e) { VIEW.status = 'failed'; VIEW.err = String(e && e.message || e); VIEW.api = null; VIEW._p = null; if (typeof console !== 'undefined') console.warn('[3d] ' + VIEW.err); return false; }
  })();
  return VIEW._p;
}
// switch views; resolves to whether the requested view is now showing
async function viewSet(mode) {
  if (mode === '3d') {
    VIEW.mode = '3d'; viewSavePref(); const ok = await viewLoad();
    if (!ok || VIEW.mode !== '3d') { if (!ok) { VIEW.mode = '2d'; VIEW.on3d = false; viewSavePref(); if (typeof toast === 'function' && S && S.toasts) toast('3D is not available on this device', 'star', 3.5); } return false; }
    VIEW.on3d = true; const c = document.getElementById('game3d'); if (c) c.style.display = 'block'; if (typeof CAM !== 'undefined') CAM.init = false; return true;
  }
  VIEW.mode = '2d'; VIEW.on3d = false; viewSavePref(); const c = document.getElementById('game3d'); if (c) c.style.display = 'none'; return true;
}
function viewSetQuality(q) { VIEW.quality = q; viewSavePref(); if (VIEW.api) VIEW.api.setQuality(q); }
// world (2D game px) -> screen px for the HUD (tutorial arrows, tap areas, screen effects). Same answer in both views. h = height above ground in px.
function w2s(x, y, h) {
  if (VIEW.on3d && VIEW.api) { const p = VIEW.api.project(x, y, h || 0); return { x: p.x, y: p.y, k: scl }; }
  return { x: vw / 2 + (x - CAM.x) * scl, y: vh * 0.46 + (y - CAM.y) * scl - (h || 0) * scl, k: scl };
}
function viewBoot() { if (VIEW.mode === '3d') viewSet('3d'); }
