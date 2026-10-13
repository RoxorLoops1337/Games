// Ludus Maximus 3D: boot, renderer, post, quality governor, main loop, test hooks (window.__LM3D).
// Robustness (see .claude/skills/ludus3d-performance): rAF is re-armed before the frame runs (a throwing frame never kills the loop),
// loop + audio pause while the tab is hidden, WebGL context loss shows an overlay and restores, resize/orientation are coalesced,
// prefers-reduced-motion is mirrored into post/feel/hub, the tier is auto-picked from the device when ?tier= is absent.
import * as THREE from 'three';
import { createPost, createDynamicRes, TIERS, detectTier, saveTierCap } from './post.js';
import { createAudio } from './audio.js';
import { Game } from './game.js';
import { demoHunt } from './beast_fx.js'; // BEAST: ?demo=1&hunt=...
import * as ET from './envtex.js'; // PERF: procedural textures are baked in a worker / read from IndexedDB while the rest of the game loads

const BT = window.__bootT = { t0: performance.now() }; const mark = (k) => { BT[k] = Math.round(performance.now() - BT.t0); };   // boot phase timings (ms since this module ran), see stats().boot
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('gl'), ui = document.getElementById('ui');
const fail = (m) => { const e = document.getElementById('err'); e.textContent = m || e.textContent; e.style.display = 'flex'; };

// anything thrown before the game is up (createPost, scene setup) must not leave "Forging the arena" on screen forever
const bootFail = (e) => { if (!window.__LM3D) fail('The arena could not start: ' + ((e && (e.message || e.reason && e.reason.message)) || 'unknown error') + '. Reload to try again.'); };
addEventListener('error', bootFail); addEventListener('unhandledrejection', bootFail);

const forcedTier = TIERS[q.get('tier')] ? q.get('tier') : null;
const tier = forcedTier || detectTier();
// PERF: start baking the hub textures NOW (the hub is what the player sees first); the arena set queues behind it for the idle build. ?texq=1 forces full-size textures.
ET.configure({ tier, force: q.get('texq') });
const tex = { hub: ET.prepare(ET.PLAN.hub(), { prio: 0, cache: q.get('texcache') !== '0' }), arena: ET.prepare(ET.PLAN.arena().concat(tier === 'high' ? ET.PLAN.themes() : []), { prio: 5, cache: q.get('texcache') !== '0' }) };
mark('tex0');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch (e) { fail('WebGL is not available on this device. Try another browser, or enable hardware acceleration.'); throw e; }
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.localClippingEnabled = true; renderer.info.autoReset = false;

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 1500);
const audio = createAudio({ seed: 1337 });
const dummy = new THREE.Scene();
const post = createPost(renderer, dummy, camera, { tier });
const DENSITY = { low: 0.45, medium: 0.7, high: 1 };
/** one place that moves every tier-aware subsystem; the governor calls it on demotion */
function applyTier(name) {
  if (!TIERS[name] || name === post.tier) return;
  post.setTier(name); game.tier = name;
  try { game.hub && game.hub.setTier && game.hub.setTier(name); } catch (e) { console.warn('hub.setTier', e && e.message); }
  const fv = game.fightView; if (fv) { fv.tier = name; fv.arena && fv.arena.setDensity(DENSITY[name]); }
  if (name === 'low') PWR.demoted = true;
  if (!forcedTier) saveTierCap(name);   // remembered 14 days, so the next load starts at the tier this device can hold
}
// ---------------------------------------------------------------- frame pacing: display refresh, battery / thermal frame-rate cap
// The loop never trusts 60: the display refresh (vsync) is estimated from the raw rAF gaps (lower quartile of 120, so a slow frame never inflates it).
//  - >= 100 Hz panels (120 / 144 / 165 / 240) render every round(Hz/60)th vsync: ~60 fps, half the GPU work and heat of a 120 fps loop that the sim does not need.
//  - 30 fps cap when (a) the governor had to demote to the low tier (steadier frames, less heat), (b) battery under 20% and not charging, (c) the OS reports CPU pressure
//    serious / critical (Compute Pressure API, Chrome; held 20 s after it clears), (d) the hub has had no input for 5 s (ambient life only), (e) ?fps=N (tests).
//  - A display locked to 30 Hz (iOS low power mode, battery savers) is detected too: the governor then judges frames against 33 ms, not 16.7 (see post.js lock30).
// Fights on a capable 60 Hz device stay uncapped. stats().pacing shows the live numbers; ?perf=1 draws them.
const PWR = { demoted: false, saver: false, hot: false, hotUntil: 0, pressure: '', lastInput: performance.now(), cap: 0, minGap: 0 };
const RG = { ring: new Float32Array(120), i: 0, n: 0, vsync: 16.7, hz: 60, prev: 0, tight30: 0, capRun: 0 };
for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => { PWR.lastInput = performance.now(); }, { passive: true, capture: true });
try { navigator.getBattery && navigator.getBattery().then((b) => { const f = () => { PWR.saver = !b.charging && b.level < 0.2; }; f(); b.addEventListener('levelchange', f); b.addEventListener('chargingchange', f); }).catch(() => {}); } catch (e) { /* no battery API */ }
try { if (typeof PressureObserver !== 'undefined') { const po = new PressureObserver((recs) => { const st = recs[recs.length - 1].state; PWR.pressure = st; if (st === 'serious' || st === 'critical') { PWR.hot = true; PWR.hotUntil = 0; } else if (PWR.hot && !PWR.hotUntil) PWR.hotUntil = performance.now() + 20000; }); po.observe('cpu', { sampleInterval: 2000 }).catch(() => {}); } } catch (e) { /* no Compute Pressure API */ }
function sampleRefresh(gap) {
  RG.capRun = PWR.cap ? RG.capRun + 1 : 0;   // a capped loop alternates work / skip frames, so a slow frame cannot hide the vsync: that window is "certain"
  RG.ring[RG.i++ % 120] = gap; if (++RG.n % 120 !== 0) return;
  const a = Array.from(RG.ring).sort((x, y) => x - y), q1 = a[30];
  if (q1 > 3.5 && q1 < 60) { RG.vsync = q1; RG.hz = 1000 / q1; dyn.setVsync(q1, RG.capRun >= 120); }
}
const fpsCap = (now) => {
  PWR.cap = 0; PWR.minGap = 0;
  if (PWR.hot && PWR.hotUntil && now > PWR.hotUntil) PWR.hot = false;
  if (q.get('fps')) PWR.cap = +q.get('fps');
  else if ((PWR.demoted && post.tier === 'low') || PWR.saver || PWR.hot || (game.scene === 'hub' && now - PWR.lastInput > 5000 && !document.querySelector('.lx-scrim'))) PWR.cap = 30;
  if (PWR.cap) PWR.minGap = 1000 / PWR.cap - 3;
  if (RG.hz >= 100 && (!PWR.cap || PWR.cap > 60)) { const d = Math.round(RG.hz / 60); PWR.minGap = Math.max(PWR.minGap, (d - 0.35) * RG.vsync); if (!PWR.cap) PWR.cap = 60; }
  return PWR.cap;
};
const dyn = createDynamicRes(post, { onTierDemote() { const order = ['high', 'medium', 'low']; const i = order.indexOf(post.tier); if (i < order.length - 1) applyTier(order[i + 1]); } });
post.setScene = (s) => { post.composer.passes[0].scene = s; };

const game = new Game({ renderer, camera, post, audio, ui, tier, tex }); game.noWarm = !!q.get('nowarm'); game.noJit = !!q.get('nojit');
mark('game');

// ---------------------------------------------------------------- resize / orientation (coalesced into one rAF; iOS reports stale sizes right after rotation)
let rw = 0, rh = 0, rzQueued = false;
const resize = (force) => {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  if (!force && w === rw && h === rh) return; rw = w; rh = h;
  camera.aspect = w / h; camera.updateProjectionMatrix(); post.setSize(w, h); game.resize(w, h);
};
const queueResize = () => { if (rzQueued) return; rzQueued = true; requestAnimationFrame(() => { rzQueued = false; resize(); }); };
addEventListener('resize', queueResize);
addEventListener('orientationchange', () => { queueResize(); setTimeout(queueResize, 250); setTimeout(queueResize, 900); });
if (window.visualViewport) visualViewport.addEventListener('resize', queueResize);
// iOS Safari: swallow the page-zoom gestures that user-scalable=no no longer stops
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

// audio unlock on the first gesture (iOS needs touchend). audio.js suspends/resumes its own context on visibilitychange.
const unlock = () => { audio.unlock && audio.unlock().then((ok) => { if (ok) for (const ev of ['pointerdown', 'touchend', 'keydown']) removeEventListener(ev, unlock, true); }); };
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, unlock, true);

// ---------------------------------------------------------------- reduced motion (OS setting OR the in-game "reduce motion" pref class)
const mqRM = matchMedia('(prefers-reduced-motion: reduce)');
let rmApplied = null, driftBase = null;
function syncMotion() {
  const r = !!(mqRM.matches || (document.body && document.body.classList.contains('lx-reduce-motion')));
  if (r === rmApplied) return; rmApplied = r;
  post.reducedMotion = r;
  const st = game.fightView && game.fightView.feel && game.fightView.feel.state; if (st) st.reducedMotion = r;
  const orb = game.hub && game.hub.orbit; if (orb) { if (driftBase === null) driftBase = orb.drift; orb.drift = r ? false : driftBase; }
}
if (mqRM.addEventListener) mqRM.addEventListener('change', () => { rmApplied = null; syncMotion(); });
game.onFightView = () => { rmApplied = null; syncMotion(); };   // the FightView is built lazily: hand it the current reduced-motion state

// ---------------------------------------------------------------- frame-time recorder: spikes show up in __LM3D.stats().spikes
// work = CPU ms of game.frame + render submit (GPU time is async and not measured), gap = time since the previous rAF. A spike is work > spikeMs (25) or gap > 3x the median.
// A frame that created shader programs is tagged 'compile'. The first 45 frames after a resume are ignored (same rule as the dynamic-res governor).
const FT = { n: 0, ring: new Float32Array(120), ri: 0, sum: 0, max: 0, spikeMs: 25, spikes: [], spikeCount: 0, worst: 0, progs: 0, ignore: 45 };
function recordFrame(work, gap, tag) {
  FT.n++; FT.ring[FT.ri++ % 120] = work; FT.sum += work; if (work > FT.max) FT.max = work;
  const progs = renderer.info.programs ? renderer.info.programs.length : 0, compiled = progs !== FT.progs; FT.progs = progs;
  if (FT.ignore > 0) { FT.ignore--; return; }
  if (work > FT.spikeMs || (gap > 0 && FT.gapMed > 0 && gap > Math.max(60, FT.gapMed * 3))) {
    FT.spikeCount++; if (work > FT.worst) FT.worst = work;
    const fv = game.fightView; FT.spikes.push({ n: FT.n, work: +work.toFixed(1), gap: +gap.toFixed(1), scene: game.scene, phase: fv && game.scene === 'fight' ? fv.phase : '', cause: compiled ? 'compile' : tag || '', programs: progs });
    if (FT.spikes.length > 24) FT.spikes.shift();
  }
  if (gap > 0) FT.gapMed = FT.gapMed ? FT.gapMed + (Math.min(gap, 100) - FT.gapMed) * 0.05 : gap;
}
function frameStats() {
  const k = Math.min(FT.n, 120), a = Array.from(FT.ring.subarray(0, k)).sort((x, y) => x - y);
  return { frames: FT.n, avg: +(FT.sum / Math.max(1, FT.n)).toFixed(2), p95: +(a[Math.floor(k * 0.95)] || 0).toFixed(2), max: +FT.max.toFixed(1), spikeMs: FT.spikeMs, spikeCount: FT.spikeCount, worst: +FT.worst.toFixed(1), recent: FT.spikes.slice() };
}

// ---------------------------------------------------------------- loop, pause, context loss
let last = performance.now(), clock = 0, frames = 0, rafId = 0, paused = false, lost = false, frameErrs = 0;
const schedule = () => { if (!rafId && !paused && !lost) rafId = requestAnimationFrame(loop); };
const halt = () => { if (rafId) cancelAnimationFrame(rafId); rafId = 0; };
function loop(now) {
  rafId = 0; schedule();   // re-arm FIRST: an exception below must not stop the game
  if (q.get('manual')) { last = now; return; }
  const raw = now - RG.prev; RG.prev = now; if (raw > 2 && raw < 100) sampleRefresh(raw);
  if (game.warming) { last = now; return; }   // the idle shader warm-up owns the camera and the composer scene for a moment
  fpsCap(now); if (PWR.minGap && now - last < PWR.minGap) return;   // frame-rate cap (see PWR)
  const gap = now - last, dt = Math.min(0.1, gap / 1000); last = now;
  const w0 = performance.now();
  try {
    clock += dt; frames++;
    if ((frames & 15) === 0) syncMotion();
    dyn.setScene(game.scene === 'fight' ? 'fight' : 'hub');
    if (!PWR.cap || PWR.cap > 45) dyn.tick(dt * 1000); else dyn.reset(20);   // a capped 30 fps loop must not look slow to the governor (a 60 fps cap on a 120 Hz panel is judged normally)
    game.frame(dt, clock);
    renderer.info.reset(); post.render(dt, clock);
  } catch (e) { if (frameErrs++ < 5) console.error('frame', e); }
  recordFrame(performance.now() - w0, gap); if (perfEl) perfDraw(now);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { paused = true; halt(); }
  else { paused = false; last = performance.now(); dyn.reset(); FT.ignore = 45; queueResize(); schedule(); }
});
addEventListener('pageshow', (e) => { if (e.persisted) { last = performance.now(); dyn.reset(); schedule(); } });

const ctxBox = document.createElement('div'); ctxBox.className = 'lx-perf lx-perf-ctx'; ctxBox.setAttribute('role', 'alert'); ctxBox.hidden = true;
ctxBox.innerHTML = '<div class="lx-perf-card"><b>The arena lost its graphics</b><p>Your device reclaimed the graphics memory. Restoring the view, one moment...</p><button type="button" class="lx-perf-btn" hidden>Reload the game</button></div>';
document.body.append(ctxBox);
const ctxBtn = ctxBox.querySelector('button'); ctxBtn.addEventListener('click', () => location.reload());
let ctxTimer = 0;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); lost = true; halt(); ctxBox.hidden = false; ctxBtn.hidden = true;
  clearTimeout(ctxTimer); ctxTimer = setTimeout(() => { ctxBtn.hidden = false; }, 8000);
}, false);
canvas.addEventListener('webglcontextrestored', () => {
  clearTimeout(ctxTimer); lost = false; ctxBox.hidden = true; last = performance.now(); FT.ignore = 45;
  rzQueued = false; resize(true); dyn.hardReset(90); schedule();
}, false);

// ---------------------------------------------------------------- demo / slice
function makeDemoFight(o = {}) {
  if (o.hunt) return demoHunt(o); // BEAST: ?demo=1&hunt=lion|wolves|boars|bears|pride|menagerie|nemean|elephant
  const LM = globalThis.LM, D = globalThis.LM_D;
  const mk = (style, lvl, id, name) => LM.makeGlad({ style, lvl, id, name, r: LM.mulberry(id * 977 + lvl) });
  const a = mk(o.a || 'murmillo', o.lvl || 5, 1, o.an || 'Spartacus'), b = mk(o.b || 'thraex', o.lvl || 5, 2, o.bn || 'Crixus');
  if (o.ult2) a.ult2 = o.ult2;
  const A = [a], B = [b];
  if (o.team) { A.push(mk('retiarius', o.lvl || 5, 3, 'Oenomaus')); B.push(mk('hoplomachus', o.lvl || 5, 4, 'Gannicus')); }
  if (o.team >= 3) { A.push(mk('dimachaerus', o.lvl || 5, 5, 'Varro')); B.push(mk('murmillo', o.lvl || 5, 6, 'Castus')); }
  const ua = LM.mkUnits(A, 'A', {}), ub = LM.mkUnits(B, 'B', {});
  return LM.createFight(ua, ub, { autoA: o.auto !== false, hazards: o.haz ? 1 : 0 });
}

// ---------------------------------------------------------------- hidden performance overlay: ?perf=1 (or __LM3D.perf(true)); one <pre>, refreshed 4x per second
let perfEl = null, perfT = 0;
function perfOverlay(on) {
  if (!on) { if (perfEl) { perfEl.remove(); perfEl = null; } return !!perfEl; }
  if (perfEl) return true;
  perfEl = document.createElement('pre'); perfEl.className = 'lx-perfhud'; perfEl.setAttribute('aria-hidden', 'true');
  perfEl.style.cssText = 'position:fixed;left:4px;top:calc(env(safe-area-inset-top,0px) + 4px);margin:0;padding:4px 6px;z-index:98;pointer-events:none;font:10px/1.25 ui-monospace,Menlo,Consolas,monospace;color:#9fffb0;background:rgba(10,8,20,.72);border-radius:4px;white-space:pre;max-width:96vw;overflow:hidden';
  document.body.append(perfEl); return true;
}
function perfDraw(now) {
  if (!perfEl || now - perfT < 250) return; perfT = now;
  const i = renderer.info, k = Math.min(FT.n, 120), g = dyn.state ? dyn.state() : {}, mem = performance.memory, fr = FT.ring;
  let mx = 0, sm = 0; for (let j = 0; j < k; j++) { const v = fr[j]; sm += v; if (v > mx) mx = v; }
  const fps = Math.round(1000 / Math.max(1, FT.gapMed || 16.7));
  perfEl.textContent =
    `${game.scene}${game.scene === 'fight' && game.fightView ? ' ' + game.fightView.phase : ''} | tier ${post.tier} | scale ${post.scale.toFixed(2)}${g.ceil < 1 ? ' (cap ' + g.ceil + ')' : ''}${g.locked30 ? ' | 30Hz lock' : ''}\n` +
    `frame ${(FT.gapMed || 0).toFixed(1)} ms (~${fps} fps) | work ${(sm / Math.max(1, k)).toFixed(1)} avg ${mx.toFixed(1)} max\n` +
    `display ${RG.hz.toFixed(0)} Hz | fps cap ${PWR.cap || 'off'}${PWR.hot ? ' | HOT' : ''}${PWR.saver ? ' | battery saver' : ''}\n` +
    `gov ema ${g.ema} / target ${g.target} | best ${g.best} | up in ${Math.max(0, (g.wait || 0) - (g.fast || 0))}\n` +
    `draw ${i.render.calls} | tris ${(i.render.triangles / 1000).toFixed(0)}k | geo ${i.memory.geometries} tex ${i.memory.textures} prog ${i.programs ? i.programs.length : 0}\n` +
    `heap ${mem ? (mem.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : 'n/a'} | proc tex ${ET.residentMB(renderer).toFixed(1)} MB (K ${ET.quality().K}) | spikes ${FT.spikeCount}`;
}
let loseExt = null;
const api = {
  THREE, renderer, camera, post, game, audio, dyn, get tier() { return post.tier; }, forcedTier,
  get view() { return game.fightView || game.ensureFightView(); },
  stats() { const i = renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0, tier: post.tier, scale: post.scale, frames, spikes: frameStats(), decal: game.fightView && game.fightView.fx && game.fightView.fx.decalStats ? Object.assign({}, game.fightView.fx.decalStats) : null, warmMs: game.warmMs !== undefined ? game.warmMs : api.warmMs, fpsCap: PWR.cap, saver: PWR.saver, pacing: { hz: +RG.hz.toFixed(1), vsync: +RG.vsync.toFixed(2), cap: PWR.cap, hot: PWR.hot, pressure: PWR.pressure, gov: dyn.state && dyn.state() }, boot: Object.assign({}, BT), tex: ET.stats(), texQ: ET.quality(), mem: { texMB: +ET.residentMB(renderer).toFixed(1), log: game.memLog, fvBuildMs: game.fvBuildMs, jitMs: game.jitMs }, fv: !!game.fightView, cam: [camera.position.x, camera.position.y, camera.position.z].map((v) => +v.toFixed(1)), fov: +camera.fov.toFixed(1), scene: game.scene, phase: game.fightView && game.fightView.phase, shot: game.fightView && game.fightView.dir.pose.shot, lost, paused, reduced: rmApplied }; },
  makeDemoFight,
  startDemo(o = {}) { const F = makeDemoFight(o); api.F = F; game.setScene('fight'); return game.fightView.start(F, o); },   // setScene builds the FightView on demand
  // deterministic stepping for screenshots (headless software GL is slow): advance N frames of dt
  advance(seconds, dt = 1 / 30) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) { clock += dt; frames++; const w0 = performance.now(); game.frame(dt, clock); recordFrame(performance.now() - w0, 0, 'advance'); } renderer.info.reset(); post.render(dt, clock); return api.stats(); },
  resetSpikes() { FT.spikes.length = 0; FT.spikeCount = 0; FT.worst = 0; FT.max = 0; FT.n = 0; FT.sum = 0; FT.ignore = 0; FT.ring.fill(0); FT.ri = 0; },
  setSpikeMs(ms) { FT.spikeMs = ms; },
  /** test hooks: simulate GPU context loss / restore through WEBGL_lose_context */
  loseContext() { const x = loseExt || (loseExt = renderer.getContext().getExtension('WEBGL_lose_context')); if (x) x.loseContext(); return !!x; },   // the extension must be fetched BEFORE the loss (getExtension returns null on a lost context)
  restoreContext() { if (loseExt) loseExt.restoreContext(); return !!loseExt; },
  applyTier,
  perf(on) { return perfOverlay(on !== false); },
};
if (q.get('perf')) perfOverlay(true);
const hideBoot = () => { const b = document.getElementById('boot'); if (!b) return; setBoot(1); b.style.opacity = 0; b.style.pointerEvents = 'none'; setTimeout(() => b.remove(), 700); };
// ---------------------------------------------------------------- boot overlay: message + progress bar (modules, textures, hub, first frames)
let bootFrac = 0;
function setBoot(f, msg) {
  if (f > bootFrac) bootFrac = f; const el = document.getElementById('bootfill'); if (el) el.style.transform = 'scaleX(' + bootFrac.toFixed(3) + ')';
  if (msg) { const e = document.getElementById('bootmsg'); if (e) e.textContent = msg; }
}
const bootMsg = (m, f) => setBoot(f || 0, m);
const bootTick = setInterval(() => { const p = ET.progress(); if (p.total) setBoot(0.08 + 0.4 * (p.done / p.total)); }, 120);   // textures own 8 to 48 % of the bar
// Shader warm-up: the FightView (arena, crowd, fx, gore) is no longer part of the boot. It is built and its shaders compiled in idle time AFTER the hub is interactive
// (game.prewarm). Only a boot straight into a fight (?demo=1) waits for it, exactly like before, so the first gib / ultimate / hit finds its programs ready.
async function warmUp() {
  const t0 = performance.now();
  try { if (!q.get('nowarm')) { await game.prewarm({ immediate: true }); } else game.ensureFightView(); } catch (e) { console.warn('warm', e && e.message); }
  api.warmMs = Math.round(performance.now() - t0);
}
const nextFrames = (n) => new Promise((res) => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
// window.__LM3D is published once the game is ready (init + first scene), so test tools that wait for it never race the boot.
// api.idle resolves when the background build + warm-up is done (tools that measure programs or draw calls await it).
let idleDone; api.idle = new Promise((r) => { idleDone = r; }); game.onWarmed = () => { mark('warmed'); idleDone(true); };
(async () => {
  const reveal = async () => { await nextFrames(q.get('manual') ? 1 : 3); FT.ignore = 45; mark('reveal'); clearInterval(bootTick); hideBoot(); if (!q.get('demo')) game.markInteractive({ prewarm: !q.get('nowarm') && (!q.get('manual') || q.get('warm') === '1') }); };
  try {
    bootMsg('Raising the walls...', 0.06); await game.init(); mark('init'); resize(true); syncMotion(); setBoot(0.85);
    if (q.get('demo')) { bootMsg('Lighting the torches...', 0.88); await warmUp(); mark('warmed'); idleDone(true); }
    bootMsg('The gates open...', 0.95); window.__LM3D = api; schedule();
    if (q.get('demo')) { game.markInteractive({ prewarm: false }); const o = { a: q.get('a') || undefined, b: q.get('b') || undefined, lvl: +(q.get('lvl') || 5), team: +(q.get('team') || 0), auto: q.get('auto') !== '0', haz: q.get('haz') === '1', hunt: q.get('hunt') || undefined }; api.startDemo(o); await reveal(); return; }
    if (q.get('new')) { game.newGame({ name: 'Ludus Aurelia', color: 1 }); if (q.get('rich')) { game.S.gold += 5000; game.S.fame += 300; } game.setScene('hub'); game.refresh(); if (!game.S.glads.length && !q.get('empty')) game.open('recruit', { first: true }); await reveal(); return; }
    const booted = game.boot(); await reveal(); await booted;
  } finally { window.__LM3D = api; }
})();
