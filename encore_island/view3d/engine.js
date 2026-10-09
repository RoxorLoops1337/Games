// Encore Island 3D, the engine. Created lazily by js/view.js when the player picks 3D.
//   createView({ canvas, quality }) -> { frame(dt), overlay(ctx), resize(vw, vh, dpr), project(x, y, h), stats(), setQuality(q), dispose() }
// The 2D game keeps running underneath (simulation, input, camera easing, HUD): this view only DRAWS. It reads the 2D camera state (CAM, scl)
// so framing, zoom per area and tutorial arrows behave identically in both views. Modules (see README.md) self-sync from S; a module that throws
// repeatedly is switched off so the rest of the island keeps rendering.
import * as THREE from 'three';
import * as kit from './kit.js';
import { bakeActor } from './bake.js';
import { Post } from './post.js';
import { TIERS, ORDER, detectTier, Adaptive } from './quality.js';
import { labels, drawLabels, drawFloats3 } from './overlay.js';
import { STYLE } from '../../encore_island_3d/js/characters.js';

const D2R = Math.PI / 180, W = kit.W;
const FOV = 32, PITCH = 52 * D2R;
const PERF = typeof location !== 'undefined' && /[?&]perf\b/.test(location.search);
const MODULES = ['fx3d', 'env3d', 'loot3d', 'heroes3d', 'foes3d', 'hub3d', 'lands3d', 'backstage3d'];
const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export async function createView(opts = {}) {
  const canvas = opts.canvas, onProgress = opts.onProgress || (() => {});
  kit.installLook();
  // pick a tier BEFORE creating the real context (it decides whether the default framebuffer needs MSAA)
  let probe = null; try { const c = document.createElement('canvas'); probe = c.getContext('webgl2') || c.getContext('webgl'); } catch (e) { /* no gl */ }
  if (!probe) throw new Error('WebGL unavailable');
  const pref = opts.quality || 'auto', tierName = detectTier(probe, pref); try { const ex = probe.getExtension('WEBGL_lose_context'); if (ex) ex.loseContext(); } catch (e) { /* ignore */ }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tierName === 'low', stencil: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.autoClear = false; renderer.info.autoReset = false; renderer.setClearColor(0xbfe8f4, 1);
  const post = new Post(renderer);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xbfe8f4, 60, 200);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 800);
  const rig = kit.makeLightRig(scene, { shadows: true, size: 2048, extent: 30 });
  const world = new THREE.Group(), dyn = new THREE.Group(); world.name = 'world'; dyn.name = 'dyn'; scene.add(world, dyn);
  const blobs = new kit.BlobShadows(640); scene.add(blobs.mesh);
  const focus = { x: 0, z: 0 }, mods = {}, order = [], fails = {}, ms = {};
  const V = { THREE, kit, scene, camera, renderer, rig, LOOK: kit.LOOK, Q: kit.Q, W, world, dyn, blobs, labels, mods, focus, quality: { tier: tierName, detail: 2, shadows: true, dpr: 1, particles: 1, decor: 1 }, moodOverride: null,
    bake: (actor, o) => bakeActor(actor, Object.assign({ cast: V.quality.shadows }, o || {})), heightAt: (x, z) => (mods.env && mods.env.heightAt ? mods.env.heightAt(x, z) : 0), S: () => S, project: null };
  const st = { tier: TIERS[tierName], tierName, scale: 1, vw: 1, vh: 1, dpr: 1, lost: false, frames: 0, last: 0 };
  const adaptive = new Adaptive(tierName, (c) => { if (c.tier !== st.tierName) applyTier(c.tier); st.scale = c.scale; applySize(); }, { locked: pref !== 'auto', floor: 'low' });

  function applyTier(name) {
    const t = TIERS[name]; st.tier = t; st.tierName = name; V.quality.tier = name; V.quality.detail = t.detail; V.quality.shadows = t.shadows; V.quality.particles = t.particles; V.quality.decor = t.decor; kit.Q.detail = t.detail; kit.Q.tier = name; kit.Q.shadows = t.shadows;
    renderer.shadowMap.enabled = t.shadows; rig.setShadows(t.shadows, t.shadowSize || 1024);
    if (t.post) { renderer.toneMapping = THREE.NoToneMapping; post.configure({ bloom: t.bloom, levels: t.levels, msaa: t.msaa, tilt: t.tilt, half: t.half }); }
    else { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; }
    applySize();
  }
  function applySize() {
    const dpr = Math.max(0.5, Math.min(st.dpr, st.tier.dprMax) * st.scale); V.quality.dpr = dpr;
    renderer.setPixelRatio(dpr); renderer.setSize(st.vw, st.vh, false); canvas.style.width = st.vw + 'px'; canvas.style.height = st.vh + 'px';
    if (st.tier.post) { post.setSize(Math.round(st.vw * dpr), Math.round(st.vh * dpr)); if (!post.verify() && st.tierName !== 'low') { console.warn('[3d] post chain unsupported on this GPU, using the low tier'); applyTier('low'); return; } }
    camera.aspect = st.vw / st.vh; fitCamera();
  }

  // ---- camera: mirrors the 2D camera (CAM = look-at in 2D px, scl = px per world px) so both views frame the same area ----
  // On the title screen it instead orbits the stage low and wide (a slow cinematic), and eases into the gameplay camera when the player taps to start.
  let fovKick = 0, shakeX = 0, shakeY = 0, tb = 1;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _la = new THREE.Vector3(), _lb = new THREE.Vector3();
  function fitCamera(dt) {
    const d = (st.vh / scl * W) / (2 * Math.tan(FOV * 0.5 * D2R)), tx = CAM.x * W, tz = CAM.y * W;
    if (dt !== undefined) tb += ((S.started ? 0 : 1) - tb) * Math.min(1, dt * 1.7); else if (S.started && tb < 0.001) tb = 0;
    _a.set(tx + shakeX, d * Math.sin(PITCH) + shakeY, tz + d * Math.cos(PITCH)); _la.set(tx, 0, tz);
    let fov = FOV + fovKick, vo = 0.04;
    if (tb > 0.002) { // title orbit around the stage
      const k = tb * tb * (3 - 2 * tb), ang = (S.t || 0) * 0.11 + 0.5, r = 27 + Math.sin((S.t || 0) * 0.2) * 2, sx = STAGE.x * W, sz = STAGE.y * W;
      _b.set(sx + Math.sin(ang) * r, 8.5 + Math.sin((S.t || 0) * 0.27) * 0.8, sz + Math.cos(ang) * r); _lb.set(sx, 2.4, sz - 1);
      _a.lerp(_b, k); _la.lerp(_lb, k); fov = FOV + (46 - FOV) * k; vo = 0.04 * (1 - k);
    }
    camera.fov = fov; camera.near = Math.max(0.5, d * 0.08); camera.far = d * 7 + 200; camera.position.copy(_a); camera.lookAt(_la);
    camera.setViewOffset(st.vw, st.vh, 0, st.vh * vo, st.vw, st.vh); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
    V.camDist = d;
  }
  const _v = new THREE.Vector3(), PR = { x: 0, y: 0, k: 1, ok: false };
  function projectW(x, y, z) { _v.set(x, y, z).project(camera); PR.ok = _v.z < 1 && _v.z > -1; PR.x = (_v.x * 0.5 + 0.5) * st.vw; PR.y = (-_v.y * 0.5 + 0.5) * st.vh; PR.k = scl; return PR; }
  V.projectW = projectW; V.project = (x2d, y2d, h) => { const p = projectW(x2d * W, (h || 0) * W, y2d * W); return { x: p.x, y: p.y, k: p.k, ok: p.ok }; };

  // ---- modules ----
  async function load(name) {
    try {
      const m = await import('./' + name + '.js'); if (!m.init) return;
      const inst = await m.init(V); if (!inst) return; inst.name = name; mods[name === 'env3d' ? 'env' : name.replace(/3d$/, '')] = inst; order.push(inst); fails[name] = 0; ms[name] = 0;
    } catch (e) { console.warn('[3d] module ' + name + ' failed to load: ' + e.message); }
  }
  applyTier(tierName); resize0();
  function resize0() { st.vw = Math.max(2, innerWidth); st.vh = Math.max(2, innerHeight); st.dpr = Math.min(2, window.devicePixelRatio || 1); applySize(); }
  STYLE.flat = false; STYLE.boost = 0;
  for (let i = 0; i < MODULES.length; i++) { onProgress(i / MODULES.length, MODULES[i]); await load(MODULES[i]); await nextFrame(); }
  for (const make of (typeof VIEW3D !== 'undefined' ? VIEW3D : [])) { try { const inst = make(V); if (inst && inst.update) { inst.name = 'feature' + order.length; fails[inst.name] = 0; ms[inst.name] = 0; order.push(inst); } } catch (e) { console.warn('[3d] feature visual failed: ' + e.message); } }
  onProgress(1, 'ready');
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); st.lost = true; api.lost = true; });

  // ---- frame ----
  const STAMP = { n: 0 };
  function updateJuice(dt) {
    const p = S.player; const target = p.dashT > 0 ? 5.5 : S.ultCasting > 0 ? 3 : 0; fovKick += (target - fovKick) * Math.min(1, dt * 10);
    const shk = JUICE.shake > 0 && S.settings.shake; shakeX = shk ? (Math.random() - 0.5) * JUICE.shake * W * 0.9 : 0; shakeY = shk ? (Math.random() - 0.5) * JUICE.shake * W * 0.6 : 0; JUICE.shake = Math.max(0, JUICE.shake - dt * 22);
  }
  const api = {
    V, lost: false, mods,
    frame(dt) {
      if (st.lost) return; const t0 = performance.now(); st.frames++; renderer.info.reset();
      dt = Math.min(dt || 0.016, 0.05); updateJuice(dt); fitCamera(dt);
      kit.LOOK.t.value = S.t; const bt = beatNow() % 1; kit.LOOK.beat.value = Math.max(0, 1 - bt * 3.2) * (encoreOn() ? 1 : 0.6);
      labels.clear(); blobs.begin(); focus.x = S.player.x * W; focus.z = S.player.y * W;
      for (let i = 0; i < order.length; i++) {
        const m = order[i]; if (m.disabled) continue; const a = performance.now();
        try { m.update(dt, S.t, focus); fails[m.name] = 0; } catch (e) { if (++fails[m.name] === 1) console.warn('[3d] ' + m.name + ': ' + (e && e.stack || e)); if (fails[m.name] > 30) { m.disabled = true; console.warn('[3d] ' + m.name + ' switched off'); } }
        ms[m.name] = ms[m.name] * 0.9 + (performance.now() - a) * 0.1;
      }
      blobs.end();
      const mood = V.moodOverride || (mods.env && mods.env.getMood ? mods.env.getMood() : kit.DEFAULT_MOOD); rig.follow(focus.x, focus.z); rig.apply(mood);
      if (!scene.background) scene.background = new THREE.Color(mood.skyMid); else if (scene.background.isColor) scene.background.set(mood.skyMid);
      renderer.setClearColor(mood.skyMid, 1);
      if (st.tier.post) { post.u.exposure.value = mood.exposure || 1.05; post.render(scene, camera, S.t, kit.LOOK.beat.value * (encoreOn() ? 0.9 : 0.35)); }
      else { renderer.setRenderTarget(null); renderer.toneMappingExposure = mood.exposure || 1.05; renderer.clear(); renderer.render(scene, camera); }
      const now = performance.now(); if (st.last) adaptive.feed((now - st.last) / 1000); st.last = now; st.cost = now - t0;
    },
    overlay(ctx) {
      if (st.lost) return; drawLabels(ctx, projectW, st.vw, st.vh, scl); drawFloats3(ctx, projectW, S, scl);
      if (PERF) { // ?perf in the URL: tier, resolution scale, draw calls, triangles, per-module JS ms
        const s = api.stats(), L = [s.tier + '  x' + s.scale + '  dpr ' + (+s.dpr).toFixed(2), s.calls + ' calls  ' + Math.round(s.tris / 1000) + 'k tris  ' + s.geos + ' geo  ' + s.tex + ' tex', 'frame ' + s.cpuMs + ' ms', Object.entries(s.mods).map(([k, v]) => k.replace('3d', '') + ' ' + v).join('  ')];
        ctx.fillStyle = 'rgba(20,10,50,0.7)'; ctx.fillRect(6, vh - 138, Math.min(vw - 12, 330), 62); ctx.fillStyle = '#d8ffd8'; ctx.font = '10px monospace'; ctx.textAlign = 'left'; for (let i = 0; i < L.length; i++) ctx.fillText(L[i], 12, vh - 124 + i * 13);
      }
    },
    resize(vw, vh, dpr) { st.vw = vw; st.vh = vh; st.dpr = Math.min(2, dpr || 1); applySize(); },
    project: V.project, projectW,
    setQuality(q) { const t = detectTier(renderer.getContext(), q); adaptive.locked = q !== 'auto'; adaptive.tier = t; adaptive.ceil = t; adaptive.scale = 1; st.scale = 1; applyTier(t); },
    stats() { const r = renderer.info; return { tier: st.tierName, scale: st.scale, dpr: V.quality.dpr, calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, cpuMs: +(st.cost || 0).toFixed(2), mods: Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, +v.toFixed(2)])) }; },
    dispose() { for (const m of order) { try { m.dispose && m.dispose(); } catch (e) { /* ignore */ } } post.dispose(); renderer.dispose(); },
  };
  if (typeof window !== 'undefined') window.__V3 = api;
  return api;
}
