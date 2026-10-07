// Park3D HOST (owner PLAT). One renderer, one canvas, one loop; worlds come and go through load()/unload().
//   const host = createHost(canvas, { embedded, quality, onLost, preserve, seed })
//   host.load(worldId, args) -> Promise<world | null>   unload previous world, build, warm one frame; null when a newer load()/unload() superseded it; rejects when the id is unknown or the build throws
//   host.unload()  host.tick(dt)  host.pause(b)  host.resize(w?, h?)  host.setQuality('low'|'med'|'high')  host.stats()  host.leakReport()  host.dispose()
//   host.world (current world or null)  host.events (persistent emitter: 'worldReady' {id}, 'quality' {q}, 'contextlost' {n, second})  host.renderer  host.shared  host.quality  host.demoted
//   embedded:true  -> NO own RAF and NO window resize listener: the game loop calls host.tick(dt) and host.resize(w, h).  embedded:false (Park3D.init shim, dev pages) -> own RAF + resize listener.
//   onLost({phase:'lost'|'restored'|'demote', n, second, reason, id}): context-loss hook. After 'lost' the host waits 2 s for webglcontextrestored and rebuilds the same world;
//   a second loss within 60 s, no restore in 2 s or a failed rebuild gives phase 'demote' (the game then switches to its 2D scene) and the host stops drawing.
//
// WORLD OBJECT (what load() resolves to, also window.__park):
//   { id, sceneName, ready, ctx, events, scene, camera, renderer, terrain, flora, lighting, spots, controls, player, npcs[], profile, args,
//     setTime(n|'day'|'dusk'|'night', instant?), setWeather('clear'|'rain'), setClock({hour,day}), setLook(look), setBeat(b), focus(target, opts), release(), walkToSpot(id, {run}), done(spotId),
//     setSpotState(id, {locked, reason, goal, badge}), activate(id), teleport(id), talk(npcId), setQuality(q), stats(), pause(b), dispose() }
//   The thin pass-throughs call lighting / controls / spots / npcs / the world module when THEY implement the method and silently do nothing otherwise, so missing methods never throw.
// WORLD MODULE CONTRACT: see worlds.js. ctx.shared = { post, shadowMap }: created ONCE per host. post stays null until fx_post.js exports createSharedPost(renderer) (LIGHT), then it is passed on.
// Disposal: scene graph through kit.disposeTree (geometries, materials, textures, canvas textures, shadow maps), lighting.dispose() (post targets), renderer.renderLists.dispose(),
//   every window/document/canvas listener and DOM node added while building (controls, ui3d have no dispose) is removed. Resources flagged userData.persist (shared character materials) survive.
import * as THREE from 'three';
import * as kit from './kit.js';
import { PAL } from './palette.js';
import { createCharacter, sharedMats } from './characters.js';
import { createNPC } from './char_npc.js';
import { buildLighting } from './lighting.js';
import { buildSpots } from './spots.js';
import { createControls } from './controls.js';
import { WORLDS } from './worlds.js';
import * as FX from './fx_post.js';

export const DEFAULT_LOOK = { name: 'Tay', body: 'neutral', skin: '#c68b5e', hair: { style: 'twists', color: '#1a1420' }, hat: { id: 'fitted', color: '#17141f' }, top: { id: 'oversized', color: '#ffd23f', color2: '#e63946' }, bottom: { id: 'camo', color: '#5a6b3a' }, shoes: { id: 'retro', color: '#f7f2e8' } };
// per-profile budgets from PORT_PLAN 2.9 (advisory: host.stats().over lists what a world exceeds)
export const BUDGETS = { out: { tris: 150000, calls: 120 }, in: { tris: 100000, calls: 70 }, studio: { tris: 100000, calls: 70 }, club: { tris: 120000, calls: 90 }, stage: { tris: 120000, calls: 90 } };

const NOP = () => {};
const has = (o, k) => !!o && typeof o[k] === 'function';
function safe(name, fn, fallback) { try { return fn(); } catch (e) { console.error('[park3d] ' + name + ' failed: ' + (e && e.stack || e)); return fallback; } }
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createRenderer(canvas, preserve) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!preserve });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  return renderer;
}

// record every listener added on these targets while fn runs, so unload can remove them (controls.js and ui3d.js add window/canvas listeners and have no dispose)
function trackListeners(targets, rec, fn) {
  for (const t of targets) { const orig = t.addEventListener; t.addEventListener = function (type, h, o) { rec.push({ t, type, h, o }); return orig.call(this, type, h, o); }; }
  try { return fn(); } finally { for (const t of targets) { try { delete t.addEventListener; } catch (e) { /* ignore */ } } }
}

export function createHost(target, opts) {
  opts = opts || {};
  const canvas = typeof target === 'string' ? document.querySelector(target) : target;
  const embedded = !!opts.embedded;
  let quality = opts.quality || (Math.min(window.devicePixelRatio || 1, 3) >= 2.5 ? 'med' : 'high');
  const renderer = createRenderer(canvas, opts.preserve);
  const shared = { post: null, shadowMap: null };
  safe('shared post', () => { const k = 'createSharedPost'; if (has(FX, k)) shared.post = FX[k](renderer); }, null);
  safe('persist mats', () => { const M = sharedMats(); for (const k in M) if (M[k] && M[k].userData) M[k].userData.persist = true; }, null);
  const events = kit.emitter();
  const dom = canvas.parentElement || document.body;

  let cur = null, paused = false, lost = false, demoted = null, tokenSeq = 0, queue = Promise.resolve(), raf = 0, disposed = false;
  let W = 0, H = 0, lastLoadMs = 0, loads = 0, frames = 0, fpsT = 0, fps = 60, errs = 0, restoreTimer = 0, lostAt = [], reload = null, last = nowMs();

  // ------------------------------------------------------------------ size
  function dprFor(q, mini) { const d = window.devicePixelRatio || 1; return Math.min(d, q === 'high' ? 2 : mini ? (q === 'med' ? 1.5 : 1.25) : 1.5); }
  function resize(w, h) {
    W = w || canvas.clientWidth || window.innerWidth; H = h || canvas.clientHeight || window.innerHeight;
    const dpr = dprFor(quality, !!(cur && cur.mini)); renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    if (!cur) return;
    cur.camera.aspect = W / H; cur.camera.updateProjectionMatrix();
    if (cur.lighting && cur.lighting.resize) cur.lighting.resize(W, H, dpr); if (cur.mini && cur.mini.resize) cur.mini.resize(W, H, dpr);
  }
  const onWinResize = () => resize();

  // ------------------------------------------------------------------ build one world
  async function doLoad(id, args, tok) {
    const t0 = nowMs(); args = args || {};
    unloadNow();
    const def = WORLDS[id]; if (!def) throw new Error('unknown world "' + id + '"');
    const mod = await def(); if (tok !== tokenSeq || disposed) return null;
    const create = mod.default || mod.create; if (typeof create !== 'function') throw new Error('world "' + id + '" has no create()');
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 9 / 16, 0.5, 200), wevents = kit.emitter();
    const ctx = { THREE, kit, PAL, scene, camera, renderer, events: wevents, rng: kit.rng(args.seed || opts.seed || 1337), quality, canvas, worldId: id, sceneName: id, shared, host: api, timeName: String(args.time !== undefined ? args.time : 'dusk'), profile: 'out', embedded };
    const rec = [], before = new Set(dom.children), listenTargets = [canvas, window, document];
    let spec = null, w = null;
    try {
      spec = trackListeners(listenTargets, rec, () => create(ctx, args)); if (spec && typeof spec.then === 'function') spec = await spec;
      if (tok !== tokenSeq || disposed) { safe('stale dispose', () => { if (spec && spec.dispose) spec.dispose(); if (spec && spec.mini && spec.mini.dispose) spec.mini.dispose(); }, null); kit.disposeTree(scene); removeTracked(rec, before); return null; }
      w = trackListeners(listenTargets, rec, () => assemble(id, args, ctx, scene, camera, wevents, spec));
    } catch (e) { safe('cleanup', () => { if (spec && spec.dispose) spec.dispose(); kit.disposeTree(scene); scene.clear(); removeTracked(rec, before); renderer.renderLists.dispose(); }, null); throw e; }
    w.rec = rec; w.before = before; cur = w; window.__park = w.world; resize(W || undefined, H || undefined);
    if (args.warm !== false && opts.warm !== false && !w.mini) safe('warm', () => { w.step(0, 0); }, null);
    lastLoadMs = nowMs() - t0; loads++; last = nowMs();
    const info = { id }; wevents.emit('worldReady', info); events.emit('worldReady', info);
    return w.world;
  }

  function assemble(id, args, ctx, scene, camera, events, spec) {
    ctx.profile = spec.profile || 'out'; if (spec.camera) Object.assign(camera, spec.camera);
    const w = { id, args, ctx, scene, camera, events, spec, t: 0, mini: null, terrain: null, flora: null, lighting: null, spots: null, player: null, npcs: [], controls: null, step: NOP, world: null, rec: null, before: null };
    if (spec.mini) { // mini game: owns its content, camera and optional render()
      const mg = spec.mini; w.mini = mg; scene.add(mg.group); if (args.onResult) events.on('minigame', args.onResult);
      w.step = (dt, t) => { mg.update(dt, t); if (mg.render) mg.render(); else renderer.render(scene, camera); };
      w.world = makeWorld(w); return w;
    }
    const terrain = spec.terrain; if (terrain.group.parent !== scene) scene.add(terrain.group); w.terrain = terrain; ctx.terrain = terrain;
    const flora = spec.flora || { group: new THREE.Group(), update: NOP }; if (flora.group.parent !== scene) scene.add(flora.group); w.flora = flora;
    const lighting = safe('lighting', () => buildLighting(ctx, terrain), { group: new THREE.Group(), setTimeOfDay: NOP, update: NOP }); scene.add(lighting.group); w.lighting = lighting;
    const spots = safe('spots', () => buildSpots(ctx, terrain), { group: new THREE.Group(), spots: [], update: NOP, nearest: () => null, activate: NOP }); scene.add(spots.group); w.spots = spots;
    const player = safe('characters', () => createCharacter(ctx, args.look || DEFAULT_LOOK), { object: new THREE.Group(), setLook: NOP, play: NOP, update: NOP, anchors: {}, height: 1.6 }); scene.add(player.object); w.player = player;
    const npcs = (spec.npcSpecs || []).map((s) => {
      const nid = typeof s === 'string' ? s : s.id; const n = safe('npc ' + nid, () => (typeof s === 'string' ? createNPC(ctx, nid) : createNPC(ctx, nid, s)), { object: new THREE.Group(), update: NOP });
      scene.add(n.object); return n;
    });
    w.npcs = npcs; ctx.npcs = npcs; for (let i = 0; i < npcs.length; i++) { const n = npcs[i]; if (n.bindFlat) safe('npc bind', () => n.bindFlat(terrain, player.object)); }
    const controls = safe('controls', () => createControls(ctx, { player, terrain, spots, npcs, dom }), { update: NOP }); w.controls = controls;
    if (args.onSpot) events.on('spot', args.onSpot); if (args.onNpc) events.on('npc', args.onNpc);
    if (lighting.follow) lighting.follow(player.object);
    if (args.time !== undefined && lighting.setTimeOfDay) { lighting.setTimeOfDay(args.time); for (let i = 0; i < npcs.length; i++) if (npcs[i].setTime) npcs[i].setTime(args.time); }
    const sup = spec.update, pos = player.object.position;
    // per-frame order is the original Park3D frame; no allocations here
    w.step = (dt, t) => {
      controls.update(dt, t); player.update(dt, t); for (let i = 0; i < npcs.length; i++) npcs[i].update(dt, t); flora.update(dt, t); if (terrain.update) terrain.update(dt, t); spots.update(dt, t, pos); lighting.update(dt, t);
      if (sup) sup(dt, t); if (lighting.render) lighting.render(); else renderer.render(scene, camera);
    };
    w.world = makeWorld(w); return w;
  }

  // ------------------------------------------------------------------ the world object (public api)
  function makeWorld(w) {
    const { id, ctx, events: wev, lighting, controls, spots, npcs, player, terrain, spec, mini } = w;
    const world = { id, sceneName: id, ready: true, mini: !!mini, game: mini || undefined, args: w.args, ctx, events: wev, scene: w.scene, camera: w.camera, renderer, terrain, flora: w.flora, lighting, spots, controls, player, npcs, profile: ctx.profile, host: api, weather: 'clear', clock: null };
    const eachNpc = (k, a) => { for (let i = 0; i < npcs.length; i++) if (has(npcs[i], k)) npcs[i][k](a); };
    world.setTime = (v, instant) => { if (mini) { if (has(mini, 'setTime')) mini.setTime(v); return; } if (has(lighting, 'setTimeOfDay')) lighting.setTimeOfDay(v, instant); ctx.timeName = String(v); eachNpc('setTime', v); if (has(spec, 'setTime')) spec.setTime(v); wev.emit('time', v); };
    world.setWeather = (v) => { world.weather = v; if (has(lighting, 'setWeather')) lighting.setWeather(v); if (has(spec, 'setWeather')) spec.setWeather(v); if (has(mini, 'setWeather')) mini.setWeather(v); };
    world.setClock = (c) => { world.clock = c; if (has(lighting, 'setClock')) lighting.setClock(c); eachNpc('setClock', c); if (has(spec, 'setClock')) spec.setClock(c); };
    world.setLook = (l) => { if (mini) { if (has(mini, 'setLook')) mini.setLook(l); return; } if (has(player, 'setLook')) player.setLook(l); if (has(spec, 'setLook')) spec.setLook(l); };
    world.setBeat = (b) => { if (has(lighting, 'setBeat')) lighting.setBeat(b); eachNpc('setBeat', b); if (has(spec, 'setBeat')) spec.setBeat(b); if (has(mini, 'setBeat')) mini.setBeat(b); };
    world.focus = (t, o) => { let r; if (has(controls, 'focus')) r = controls.focus(t, o); if (has(spec, 'focus')) { const r2 = spec.focus(t, o); if (r === undefined) r = r2; } return r; };
    world.release = () => { if (has(controls, 'release')) controls.release(); if (has(spec, 'release')) spec.release(); };
    world.walkToSpot = (sid, o) => {
      if (has(controls, 'walkToSpot')) return controls.walkToSpot(sid, o);
      const s = spots && spots.spots && spots.spots.find((x) => x.id === sid); if (!s || !has(controls, 'tapWorld')) return false; controls.tapWorld(s.x, s.z, o); return true;
    };
    world.done = (sid) => { wev.emit('spotDone', { id: sid }); };
    world.setSpotState = (sid, st) => { if (has(spots, 'setSpotState')) spots.setSpotState(sid, st); if (has(spec, 'setSpotState')) spec.setSpotState(sid, st); };
    world.activate = (sid) => { if (has(spots, 'activate')) spots.activate(sid); };
    world.teleport = (sid) => { if (!spots || !spots.spots) return; const s = spots.spots.find((x) => x.id === sid); if (!s) return; const ind = !!(terrain && terrain.interior), px = ind ? s.x : s.x + 1.5, pz = ind ? s.z : s.z + 1.5; if (controls && controls.teleportTo) controls.teleportTo(px, pz); else player.object.position.set(px, 0, pz); };
    world.talk = (nid) => (controls && controls.talkTo ? controls.talkTo(nid) : false);
    world.start = (o) => { if (has(mini, 'start')) mini.start(o); };
    world.setQuality = (q) => api.setQuality(q);
    world.stats = () => api.stats();
    world.pause = (v) => api.pause(v);
    world.dispose = () => { if (cur === w) api.unload(); };
    return world;
  }

  // ------------------------------------------------------------------ teardown
  function removeTracked(rec, before) {
    for (let i = 0; i < rec.length; i++) { const r = rec[i]; try { r.t.removeEventListener(r.type, r.h, r.o); } catch (e) { /* ignore */ } }
    rec.length = 0;
    if (before) Array.from(dom.children).forEach((n) => { if (!before.has(n) && n !== canvas) { try { dom.removeChild(n); } catch (e) { /* ignore */ } } });
  }
  function unloadNow() {
    const w = cur; if (!w) return; cur = null;
    if (window.__park === w.world) window.__park = undefined;
    safe('unload event', () => w.events.emit('unload', { id: w.id }), null);
    safe('spec.dispose', () => { if (w.spec && w.spec.dispose) w.spec.dispose(); }, null);
    safe('mini.dispose', () => { if (w.mini && w.mini.dispose) w.mini.dispose(); }, null);
    safe('controls.dispose', () => { if (w.controls && w.controls.dispose) w.controls.dispose(); }, null);
    safe('spots.dispose', () => { if (w.spots && w.spots.dispose) w.spots.dispose(); }, null);
    safe('lighting.dispose', () => { if (w.lighting && w.lighting.dispose) w.lighting.dispose(); }, null);
    removeTracked(w.rec || [], w.before);
    safe('disposeTree', () => kit.disposeTree(w.scene), null);
    w.npcs.forEach((n) => safe('npc.dispose', () => { if (n.dispose) n.dispose(); }, null)); safe('player.dispose', () => { if (w.player && w.player.dispose) w.player.dispose(); }, null);
    w.scene.clear(); renderer.renderLists.dispose(); renderer.info.autoReset = true; renderer.toneMappingExposure = 1.0; renderer.setRenderTarget(null);
  }

  // ------------------------------------------------------------------ context loss
  function announce(phase, extra) { const info = Object.assign({ phase, id: reload && reload.id }, extra || {}); if (typeof opts.onLost === 'function') safe('onLost', () => opts.onLost(info), null); return info; }
  function demote(reason) { if (demoted) return; demoted = reason; clearTimeout(restoreTimer); announce('demote', { reason }); }
  function onCtxLost(e) {
    e.preventDefault(); lost = true; const t = nowMs(); lostAt.push(t); lostAt = lostAt.filter((x) => t - x < 60000); const second = lostAt.length > 1;
    if (cur) reload = { id: cur.id, args: cur.args };
    const info = { n: lostAt.length, second }; if (cur) cur.events.emit('contextlost', info); events.emit('contextlost', info); announce('lost', info);
    clearTimeout(restoreTimer); if (second) { demote('second-loss'); return; }
    restoreTimer = setTimeout(() => { if (lost) demote('no-restore'); }, 2000);
  }
  function onCtxRestored() {
    if (!lost) return; clearTimeout(restoreTimer); lost = false; if (demoted || !reload) return;
    api.load(reload.id, reload.args).then((wd) => { if (wd) announce('restored', {}); else demote('rebuild-failed'); }, () => demote('rebuild-failed'));
  }
  canvas.addEventListener('webglcontextlost', onCtxLost); canvas.addEventListener('webglcontextrestored', onCtxRestored);

  // ------------------------------------------------------------------ loop
  function tick(dt) {
    const w = cur; if (!w || paused || lost || demoted || disposed) return;
    dt = dt > 0.05 ? 0.05 : dt < 0 ? 0 : dt; w.t += dt;
    try { w.step(dt, w.t); } catch (e) { if (errs++ < 5) console.error('[park3d] frame failed: ' + (e && e.stack || e)); }
    frames++; fpsT += dt; if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  }
  function frame(now) { raf = requestAnimationFrame(frame); if (paused) return; const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; tick(dt); }
  if (!embedded) { window.addEventListener('resize', onWinResize); raf = requestAnimationFrame(frame); }

  // ------------------------------------------------------------------ public api
  const api = {
    renderer, canvas, shared, events, embedded,
    get world() { return cur ? cur.world : null; }, get quality() { return quality; }, get demoted() { return demoted; }, get lost() { return lost; }, get paused() { return paused; },
    load(id, args) { const tok = ++tokenSeq; const p = queue.then(() => (tok !== tokenSeq || disposed ? null : doLoad(id, args, tok))); queue = p.catch(() => null); return p; },
    unload() { tokenSeq++; unloadNow(); },
    tick, resize,
    pause(b) { paused = !!b; if (!paused) last = nowMs(); },
    setQuality(q) {
      if (!q) return; quality = q; if (cur) { cur.ctx.quality = q; if (cur.lighting && cur.lighting.setQuality) cur.lighting.setQuality(q); if (cur.mini && cur.mini.setQuality) cur.mini.setQuality(q); }
      resize(W || undefined, H || undefined); events.emit('quality', { q }); if (cur) cur.events.emit('quality', { q });
    },
    stats() {
      const i = renderer.info, w = cur, bud = BUDGETS[w && w.ctx.profile] || BUDGETS.out, over = [];
      if (w && i.render.triangles > bud.tris) over.push('tris'); if (w && i.render.calls > bud.calls) over.push('calls');
      return { fps: Math.round(fps), calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, programs: i.programs ? i.programs.length : 0, world: w ? w.id : null, quality, loadMs: Math.round(lastLoadMs), over };
    },
    // memory counters for the leak test (renderer.info.memory is never auto-reset)
    leakReport() { const i = renderer.info; return { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0, calls: i.render.calls, triangles: i.render.triangles, world: cur ? cur.id : null, loadMs: Math.round(lastLoadMs), loads }; },
    dispose() {
      if (disposed) return; disposed = true; tokenSeq++; cancelAnimationFrame(raf); clearTimeout(restoreTimer); window.removeEventListener('resize', onWinResize);
      canvas.removeEventListener('webglcontextlost', onCtxLost); canvas.removeEventListener('webglcontextrestored', onCtxRestored);
      unloadNow(); safe('shared post', () => { if (shared.post && shared.post.dispose) shared.post.dispose(); }, null); renderer.dispose();
    },
  };
  return api;
}
