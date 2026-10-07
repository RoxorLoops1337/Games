// BEATBOX HEROES r3 -- r3_core.js (PLAT). BBH.R3: the bridge between the classic 2D game and the Park3D WebGL host (PORT_PLAN 2.3, 2.7, 2.8, 2.9, 2.10).
// Classic script, loaded after engine.js and before screens.js. In 2D mode (default, ?r=2d, WebGL failure) NOTHING here touches the game: R3.on stays false, E.pickScene returns the 2D scenes.
//
//   R3.on          true while 3D is usable (booted, not demoted). Scenes pick siblings with E.pickScene only when on.
//   R3.active      true while a 3D scene is presented (body.r3, #gl visible, the E loop calls R3.tick instead of drawing the 2D canvas)
//   R3.mode        effective mode of this session 'auto'|'3d'|'2d' (from ?r=3d|2d|auto, else localStorage bbh:r3.mode, else 'auto');  R3.stored() = persisted state {mode,q,fail,bootMs}
//   R3.status      'idle' | 'off' (2D by choice) | 'booting' | 'ready' | 'failed' (boot failure, 2D) | 'demoted' (live fallback after boot);  R3.reason says why
//   R3.host / R3.world / R3.quality           the Park3D host, its current world (null when none), the quality tier
//   R3.boot()      decide mode, probe capabilities, download the core chunk, create the host, warm the title world (see boot3d.js; runs by itself at page load)
//   R3.load(worldId, args) -> Promise<world|null>     host.load plus a spinner chip after 250 ms; args.reuse:true returns the resident world when it has the same id. Rejects when 3D is off.
//   R3.show(is3d)  presents or hides the 3D layer (E.go calls it for every scene change);  R3.tick(dtMs)  one frame (E loop);  R3.onTick(fn) -> unsubscribe
//   R3.syncChar(ch) maps the save to the world: Core.nightness -> setTime, Core.hourOf + day -> setClock, day % 5 === 0 -> rain, ch.look -> setLook (throttled 1 Hz, instantly on place change;
//                   also called from a wrapper around G.setChar). title and creator worlds ignore Core time and look (R3.FIXED).
//   R3.demote(reason, detail)  live fallback: re-enters the current scene's 2D sibling with the same args and persists bbh:r3.fail (except reason 'user').
//   R3.setMode('auto'|'3d'|'2d'|'classic') -> {mode, reload}   persists, resets fail, '2d' demotes live. Settings GRAPHICS row: AUTO / 3D / CLASSIC (reload the page when .reload is true).
//   R3.setQuality(q)  R3.listen(name, fn) -> unsubscribe  (events: ready, fail, demote, show, quality)   E.hooks = { dialogLine, dialogEnd, sheetOpen, sheetClose, uiBlock } are filled here.
(function (root) {
  'use strict';
  const BBH = root.BBH = root.BBH || {};
  const E = BBH.Eng || BBH.E;
  if (!E) { console.error('[r3] engine.js must load first'); return; }
  const R3 = BBH.R3 = BBH.R3 || {};
  const KEY = 'bbh:r3';
  R3.AUTO_3D = false;                                         // M4 flips this: AUTO then picks 3D on capable devices (until then 3D is opt-in: ?r=3d or Settings GRAPHICS)
  R3.auto3d = () => R3.AUTO_3D === true || root.BBH_R3_AUTO3D === true;   // window.BBH_R3_AUTO3D lets tests (and a future remote flag) preview the M4 flip
  R3.FIXED = { title: 1, creator: 1 };                        // worlds that ignore Core time, weather and look
  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ state */
  const S = { mode: 'auto', modeSrc: 'default', status: 'idle', reason: '', detail: '', host: null, active: false, demoted: null, quality: null, qForced: false, probe: null, held: null,
    bootMs: 0, box: { x: 0, w: 360, h: 640 }, acc: 0, ch: null, pend: false, lastSyncT: 0, lastPlace: null, last: { w: null, n: -1, hr: -1, day: -1, wx: '', look: '' }, ticks: [], subs: {}, resizeBound: false, bootP: null };
  const def = (k, get) => Object.defineProperty(R3, k, { get, enumerable: true, configurable: true });
  def('on', () => S.status === 'ready' && !!S.host && !S.demoted);
  def('active', () => S.active);
  def('mode', () => S.mode); def('status', () => S.status); def('reason', () => S.reason); def('detail', () => S.detail); def('host', () => S.host); def('quality', () => S.quality);
  def('world', () => (S.host && S.host.world) || null); def('bootMs', () => S.bootMs); def('demoted', () => S.demoted);

  /* ------------------------------------------------- persisted state (bbh:r3) */
  function read() { try { const o = JSON.parse(E.store.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function write(patch) { const st = Object.assign({ mode: 'auto', q: null, fail: null, bootMs: 0 }, read(), patch); try { E.store.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } return st; }
  R3.stored = () => Object.assign({ mode: 'auto', q: null, fail: null, bootMs: 0 }, read());
  const emit = (n, d) => { (S.subs[n] || []).slice().forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); };
  R3.listen = (n, f) => { (S.subs[n] = S.subs[n] || []).push(f); return () => { S.subs[n] = (S.subs[n] || []).filter((x) => x !== f); }; };
  R3.onTick = (f) => { S.ticks.push(f); return () => { S.ticks = S.ticks.filter((x) => x !== f); }; };

  /* ---------------------------------------------------- DOM chrome (splash, hiccup) */
  function splash(mode, msg) {
    const el = $('boot3'); if (!el) return;
    if (!mode) { el.classList.add('off'); setTimeout(() => { if (el.classList.contains('off')) el.style.display = 'none'; }, 420); return; }
    el.classList.remove('off'); el.classList.toggle('chip', mode === 'chip'); el.style.display = 'flex';
    const m = el.querySelector('.b3-msg'); if (m && msg) m.textContent = msg;
  }
  function hiccup(on) {
    let el = $('r3hiccup');
    if (!on) { if (el) el.style.display = 'none'; return; }
    if (!el) { el = document.createElement('div'); el.id = 'r3hiccup'; el.textContent = 'Graphics hiccup, one moment...'; el.style.cssText = 'position:fixed;left:50%;top:40%;transform:translateX(-50%);z-index:46;padding:12px 18px;border-radius:16px;background:rgba(23,16,43,.9);color:#fff6e8;font:700 14px "Trebuchet MS",system-ui,sans-serif;pointer-events:none'; document.body.appendChild(el); }
    el.style.display = 'block';
  }

  /* ------------------------------------------------------------------- layout */
  // #glwrap and #fx share one box: a 9:16 column (full height on tall phones, a phone column on desktop), centred. They sit OUTSIDE the scaled #stage.
  R3.resize = function () {
    const vw = root.innerWidth, vh = root.innerHeight, w = Math.max(2, Math.floor(Math.min(vw, vh * 9 / 16))), x = Math.floor((vw - w) / 2), dpr = Math.min(2, root.devicePixelRatio || 1);
    S.box = { x, w, h: vh };
    for (const id of ['glwrap', 'fx']) { const el = $(id); if (el) { el.style.left = x + 'px'; el.style.top = '0'; el.style.width = w + 'px'; el.style.height = vh + 'px'; } }
    const fx = $('fx'); if (fx) { const fw = Math.round(w * dpr), fh = Math.round(vh * dpr); if (fx.width !== fw || fx.height !== fh) { fx.width = fw; fx.height = fh; } }
    if (S.host) { try { S.host.resize(w, vh); } catch (e) { console.error(e); } }
  };
  function shakeReset() { for (const id of ['glwrap', 'fx']) { const el = $(id); if (el) el.style.transform = ''; } }
  R3.shakeBy = function (dx, dy) {
    const k = S.box.w / 360, t = dx || dy ? 'translate(' + (dx * k).toFixed(1) + 'px,' + (dy * k).toFixed(1) + 'px)' : '';
    for (const id of ['glwrap', 'fx']) { const el = $(id); if (el) el.style.transform = t; }
  };

  /* ---------------------------------------------------------------- show / load */
  R3.show = function (is3d) {
    const b = !!is3d && R3.on; if (b === S.active) return;
    const was = S.active; S.active = b; document.body.classList.toggle('r3', b);
    if (b) { R3.resize(); S.acc = 0; try { S.host.pause(false); } catch (e) { /* ignore */ } }
    else { shakeReset(); if (S.host) { try { S.host.pause(true); if (was) S.host.unload(); } catch (e) { console.error(e); } } }
    emit('show', b);
  };
  R3.load = function (id, args) {
    const host = S.host; if (!host || S.demoted) return Promise.reject(new Error('3D is not available'));
    args = args || {}; if (args.reuse && host.world && host.world.id === id) return Promise.resolve(host.world);
    const timer = setTimeout(() => splash('chip', 'LOADING'), 250), done = () => { clearTimeout(timer); const el = $('boot3'); if (el && el.classList.contains('chip')) splash(null); };
    return host.load(id, args).then((w) => { done(); return w; }, (e) => { done(); throw e; });
  };
  R3.pause = function (b) { if (!S.host) return; try { if (b) S.host.pause(true); else if (S.active) S.host.pause(false); } catch (e) { /* ignore */ } };

  /* --------------------------------------------------------------------- tick */
  R3.tick = function (dt) {
    const host = S.host; if (!host || !S.active || S.demoted) return;
    if (S.quality === 'low') { S.acc += dt; if (S.acc < 30) return; dt = S.acc; S.acc = 0; }   // low tier: 30 fps cap (the E loop keeps running at display rate)
    const w = host.world; if (w) { try { w.setBeat(E.beat()); } catch (e) { /* ignore */ } }
    host.tick(dt / 1000);
    if (S.probe) S.probe.push(dt);
    pollSync();
    for (let i = 0; i < S.ticks.length; i++) { try { S.ticks[i](dt); } catch (e) { console.error(e); } }
  };

  /* ------------------------------------------------- Core time, weather, look -> world */
  function applySync() {
    const w = S.host && S.host.world, ch = S.ch || (BBH.G && BBH.G.ch), C = BBH.Core; if (!w || !ch || !C || R3.FIXED[w.id]) return;
    const L = S.last, fresh = L.w !== w; L.w = w;
    try {
      if (!w.mini && typeof ch.minutes === 'number') {
        const n = C.nightness(ch.minutes), hr = C.hourOf(ch.minutes), wx = ch.day % 5 === 0 ? 'rain' : 'clear';
        if (fresh || n !== L.n) { L.n = n; w.setTime(n, fresh); }
        if (fresh || hr !== L.hr || ch.day !== L.day) { L.hr = hr; L.day = ch.day; w.setClock({ hour: hr, day: ch.day }); }
        if (fresh || wx !== L.wx) { L.wx = wx; w.setWeather(wx); }
      }
      if (ch.look) { const lk = JSON.stringify(ch.look); if (fresh || lk !== L.look) { L.look = lk; w.setLook(ch.look); } }
    } catch (e) { console.error('[r3] syncChar failed', e); }
  }
  R3.sync = applySync;
  R3.syncChar = function (ch) {
    S.ch = ch; if (!S.host || !ch) return;
    const now = performance.now(), place = ch.place;
    if (place !== S.lastPlace || now - S.lastSyncT >= 1000) { S.lastPlace = place; S.lastSyncT = now; S.pend = false; applySync(); } else S.pend = true;
  };
  function wrapSetChar() {
    const G = BBH.G; if (!G || typeof G.setChar !== 'function' || G.setChar._r3) return;
    const orig = G.setChar; const f = function (ch) { const r = orig.apply(this, arguments); try { if (R3.on) R3.syncChar(ch); } catch (e) { console.error(e); } return r; }; f._r3 = 1; G.setChar = f;
  }
  function pollSync() {
    wrapSetChar(); const G = BBH.G, now = performance.now();
    if (G && G.ch && G.ch !== S.ch) R3.syncChar(G.ch); else if (S.pend && now - S.lastSyncT >= 1000) { S.pend = false; S.lastSyncT = now; applySync(); }
  }

  /* ------------------------------------------------------------- engine hooks */
  const world = () => (S.active && S.host && S.host.world) || null;
  const hooks = E.hooks = E.hooks || {};
  hooks.dialogLine = (line) => { const w = world(); if (!w || !line || !line.who) return; try { w.focus(line.who, { dist: 5, ms: 450 }); const n = (w.npcs || []).find((x) => x && x.id === line.who); if (n && n.setMood) n.setMood(line.mood || 'neutral'); } catch (e) { /* ignore */ } };
  hooks.dialogEnd = () => { const w = world(); if (w) { try { w.release(); } catch (e) { /* ignore */ } } };
  const inset = (px) => { const w = world(); if (w && w.controls && typeof w.controls.setViewInset === 'function') { try { w.controls.setViewInset({ bottom: px }); } catch (e) { /* ignore */ } } };
  hooks.sheetOpen = (el) => { let h = 0; try { h = el && el.getBoundingClientRect ? Math.round(el.getBoundingClientRect().height) : 0; } catch (e) { h = 0; } inset(h); };
  hooks.sheetClose = () => inset(0);
  hooks.uiBlock = (n) => { const w = world(); if (w && w.controls && typeof w.controls.setEnabled === 'function') { try { w.controls.setEnabled(!n); } catch (e) { /* ignore */ } } };
  // the first scene change after 'boot' waits while the 3D boot is in flight (E.go calls this), then replays
  R3.hold = function (name, args, o) { if (S.status !== 'booting' || name === 'boot') return false; S.held = [name, args, o]; return true; };
  function release() { const h = S.held; S.held = null; if (h) E.go(h[0], h[1], h[2]); }

  /* ------------------------------------------------------ quality, fail, demote */
  R3.setQuality = function (q) {
    if (!q || q === S.quality) return; S.quality = q; write({ q }); if (S.host) { try { S.host.setQuality(q); } catch (e) { console.error(e); } } S.acc = 0; emit('quality', q);
  };
  function teardownHost() { const h = S.host; S.host = null; if (h) { try { h.dispose(); } catch (e) { /* ignore */ } } }
  function uninstallUI() { try { if (BBH.R3UI && BBH.R3UI.uninstall) BBH.R3UI.uninstall(); } catch (e) { /* ignore */ } }
  function fail(reason, detail) {            // boot failure: stay 2D, remember it
    if (S.status !== 'booting') return false;
    S.status = 'failed'; S.reason = reason; S.detail = String(detail || '');
    write({ fail: { reason, detail: S.detail.slice(0, 120), t: Date.now() } });
    S.probe = null; hiccup(false); teardownHost(); uninstallUI(); splash(null); emit('fail', { reason, detail: S.detail }); release(); return true;
  }
  R3.demote = function (reason, detail) {
    if (S.demoted) return false;
    if (S.status === 'booting') return fail(reason, detail);
    if (S.status !== 'ready') return false;
    const sc = E.scene, name = E.sceneName, args = E.sceneArgs, was3d = !!(S.active && sc && sc.is3d);
    S.demoted = reason; S.status = 'demoted'; S.reason = reason; S.detail = String(detail || ''); S.probe = null;
    if (reason !== 'user') write({ fail: { reason, detail: S.detail.slice(0, 120), t: Date.now() } });
    hiccup(false);
    if (was3d) { try { E.go(name, args, { nofade: true }); } catch (e) { console.error(e); } }   // 3D sibling leave() runs with the host still alive, then the 2D scene enters
    if (S.active) { S.active = false; document.body.classList.remove('r3'); }
    shakeReset(); teardownHost(); uninstallUI(); emit('demote', { reason, detail: S.detail });
    return true;
  };
  R3.setMode = function (m) {
    m = String(m || '').toLowerCase(); if (m === 'classic') m = '2d'; if (m !== 'auto' && m !== '3d' && m !== '2d') return null;
    const patch = { mode: m }; if (m !== '2d') patch.fail = null; if (m === 'auto') patch.q = null; write(patch);
    if (m === '2d') { if (S.status === 'ready') R3.demote('user'); return { mode: m, reload: false }; }
    const wants3d = m === '3d' || R3.auto3d(); return { mode: m, reload: wants3d && S.status !== 'ready' && S.status !== 'booting' };
  };

  // internals for boot3d.js
  R3._ = { S, read, write, splash, hiccup, fail, release, teardownHost, wrapSetChar, applySync,
    ready(host, bootMs) {
      S.host = host; S.status = 'ready'; S.reason = ''; S.bootMs = Math.round(bootMs); write({ bootMs: S.bootMs, fail: null });
      host.events.on('worldReady', () => { S.last.w = null; applySync(); });
      wrapSetChar(); S.ch = (BBH.G && BBH.G.ch) || null;
      if (!S.resizeBound) { S.resizeBound = true; root.addEventListener('resize', R3.resize); root.addEventListener('orientationchange', R3.resize); }
      R3.resize(); host.pause(true); splash(null); emit('ready', { bootMs: S.bootMs }); release();
    } };
  const gl = $('gl');
  if (gl) gl.addEventListener('pointerdown', () => { try { E.unlockAudio(); } catch (e) { /* ignore */ } }, { passive: true });   // the old #cv listener only fires in 2D scenes
})(typeof globalThis !== 'undefined' ? globalThis : this);
