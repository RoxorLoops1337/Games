// Park3D entry. Thin shim over host.js (the reusable world host): builds ONE world through createHost and runs its own loop, exposes window.Park3D for the game and for tests.
//   window.Park3D = { init, createHost, WORLDS, THREE, kit, PAL }   createHost(canvas, { embedded, quality, onLost }) is the API for the embedded game (see host.js)
//   Park3D.init(canvasOrSelector, { scene:'park'|'flat', look, quality, time, seed, onSpot({id,scene}), onNpc({id}) }) -> Promise<api>   (scene also from ?scene=flat)
//   api: { sceneName, setLook(look), setTime(t), setQuality(q), teleport(spotId), activate(id), talk(npcId), npcs, player, scene, camera, renderer, stats(), dispose(), ready:true }
//   events on ctx.events: 'spot' {id, scene}, 'spotDone', 'npc' {id}, 'time' (name). The game bridge answers a spot by emitting 'spotDone' (api.done(id)).
import * as THREE from 'three';
import * as kit from './kit.js';
import { PAL } from './palette.js';
import { MINIS } from './mg_index.js';
import { createHost, createRenderer } from './host.js';
import { WORLDS } from './worlds.js';
import { playTape } from './tape.js';

const NOP = () => {};

// Mini game path: the game owns its scene, camera and (optionally) its own render(); main only runs the loop and the DPR/size handling.
function initMini(name, ctx, opts, canvas, renderer, scene, camera, events) {
  // never leave a silent black screen: a failed game shows the reason and a one-tap retry in low quality
  const hud = opts.hud; let bannerShown = false;
  const banner = (msg) => {
    try { console.error('[park3d] ' + msg); } catch (e) { /* ignore */ }
    if (!hud || bannerShown) return; bannerShown = true;
    const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:12px;right:12px;top:30%;padding:14px;border-radius:14px;background:#2a1b4dee;color:#fff0c9;font:600 14px/1.4 system-ui,sans-serif;z-index:20;pointer-events:auto;text-align:center';
    const b = document.createElement('button'); b.textContent = 'RETRY IN LOW QUALITY'; b.style.cssText = 'margin-top:10px;padding:10px 16px;border:0;border-radius:12px;background:#ffc65c;color:#2b1a00;font:800 14px system-ui,sans-serif';
    b.onclick = () => { const u = new URL(location.href); u.searchParams.set('q', 'low'); location.replace(u.href); };
    d.textContent = msg.slice(0, 220); d.appendChild(document.createElement('br')); d.appendChild(b); hud.appendChild(d);
  };
  if (name === 'rhythm') ctx.postRung = 2; // the busking stage stacks a lot of additive glow: 8-bit post avoids half-float overflow (black screen on some GPUs). ?rung=0..3 overrides
  let mg; try { mg = MINIS[name](ctx, opts); } catch (e) { banner('This game could not start: ' + (e && e.message || e)); mg = { group: new THREE.Group(), update: NOP }; }
  scene.add(mg.group); if (opts.onResult) events.on('minigame', opts.onResult);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); banner('The phone ran out of graphics memory.'); if (ctx.quality !== 'low') { const u = new URL(location.href); u.searchParams.set('q', 'low'); setTimeout(() => location.replace(u.href), 400); } });
  // ?debug=1 prints what the GPU and the renderer are doing, so a black screen on a phone can be diagnosed from one screenshot
  let dbg = null; try { if (hud && new URLSearchParams(location.search).get('debug')) { dbg = document.createElement('pre'); dbg.style.cssText = 'position:absolute;left:6px;top:96px;margin:0;padding:6px;background:#000c;color:#9dff4a;font:10px/1.25 monospace;z-index:30;pointer-events:none;max-width:96%;white-space:pre-wrap'; hud.appendChild(dbg); renderer.debug.onShaderError = (gl, prog, vs, fs) => { dbgErr.push('SHADER ' + String(gl.getProgramInfoLog(prog)).slice(0, 160)); }; } } catch (e) { /* ignore */ }
  const dbgErr = []; let dbgT = 0;
  function dbgText() { try { const gl = renderer.getContext(), x = (n) => (gl.getExtension(n) ? 1 : 0), inf = renderer.info, L = ctx.lighting || mg.lighting, st = L && L.stats ? L.stats() : {}; return ['mini ' + name + '  q=' + ctx.quality + '  dpr=' + renderer.getPixelRatio().toFixed(2) + '  buf=' + gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight, 'gl2=' + (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) + ' float=' + x('EXT_color_buffer_float') + ' half=' + x('EXT_color_buffer_half_float') + ' maxTex=' + gl.getParameter(gl.MAX_TEXTURE_SIZE) + ' units=' + gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), 'calls=' + inf.render.calls + ' tris=' + inf.render.triangles + ' geos=' + inf.memory.geometries + ' tex=' + inf.memory.textures, 'composer=' + st.composer + ' rung=' + st.rung + '  glErr=' + gl.getError() + (gl.isContextLost() ? '  CONTEXT LOST' : ''), 'fails=' + fails + '  ' + dbgErr.slice(-3).join(' | ')].join('\n'); } catch (e) { return 'debug failed: ' + e.message; } }
  let last = performance.now(), t = 0, running = true, raf = 0, fails = 0;
  function resize() { const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, ctx.quality === 'high' ? 2 : ctx.quality === 'med' ? 1.5 : 1.25); renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (mg.resize) mg.resize(w, h, dpr); }
  window.addEventListener('resize', resize); try { resize(); } catch (e) { banner('Resize failed: ' + (e && e.message || e)); }
  function frame(now) {
    raf = requestAnimationFrame(frame); if (!running) return; const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; t += dt;
    try { mg.update(dt, t); if (mg.render) mg.render(); else renderer.render(scene, camera); fails = 0; } catch (e) {
      if (++fails === 3) banner('Draw error: ' + (e && e.message || e));
      try { renderer.render(scene, camera); } catch (e2) { /* ignore */ } if (dbg) dbgErr.push(String(e && e.message || e).slice(0, 120));
    }
    if (dbg && (dbgT += dt) > 0.5) { dbgT = 0; dbg.textContent = dbgText(); }
  }
  raf = requestAnimationFrame(frame);
  const api = { ready: true, mini: true, sceneName: name, game: mg, scene, camera, renderer, ctx, events, setLook(l) { if (mg.setLook) mg.setLook(l); }, start(o) { if (mg.start) mg.start(o); }, stats() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; }, pause(v) { running = !v; }, dispose() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); if (mg.dispose) mg.dispose(); renderer.dispose(); } };
  window.__park = api; return api;
}

async function init(target, opts) {
  opts = opts || {};
  const canvas = typeof target === 'string' ? document.querySelector(target) : target;
  const q = opts.quality || (Math.min(window.devicePixelRatio || 1, 3) >= 2.5 ? 'med' : 'high');
  let sceneName = opts.scene; if (!sceneName) { try { sceneName = new URLSearchParams(location.search).get('scene'); } catch (e) { /* ignore */ } } sceneName = sceneName === 'flat' ? 'flat' : MINIS[sceneName] ? sceneName : 'park';
  if (MINIS[sceneName]) { // mini games keep their own loop, banner and debug overlay (embedded game uses createHost instead)
    const renderer = createRenderer(canvas, opts.preserve);
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, 9 / 16, 0.5, 200);
    const events = kit.emitter(); const ctx = { THREE, kit, PAL, scene, camera, renderer, events, rng: kit.rng(opts.seed || 1337), quality: q, canvas, sceneName };
    return initMini(sceneName, ctx, opts, canvas, renderer, scene, camera, events);
  }
  // park and flat: one host, one world, own RAF + resize listener; the world object is the legacy api (window.__park)
  const host = createHost(canvas, { embedded: false, quality: q, preserve: opts.preserve, seed: opts.seed });
  const api = await host.load(sceneName, opts);
  api.dispose = () => host.dispose(); api.host = host;
  return api;
}
const Park3D = { init, createHost, WORLDS, THREE, kit, PAL, playTape };
window.Park3D = Park3D;
export default Park3D;
