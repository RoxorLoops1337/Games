// BEATBOX HEROES r3 -- vig.js (VIG). The ACTION VIGNETTE runtime (park3d/VIGNETTES.md): every finished action gets a short staged scene, played with the cutscene engine
// (park3d/cine.js) in the world that is up, then handed back exactly where the action left the player. Classic script, loaded after r3/cine.js. Nothing here runs in 2D.
//
// HOW IT WORKS
//   1. An action finishes (G.do, the stream button, the bed, the booth, an activity intro). Core.apply runs AT ONCE as always (the save is never late); its effects are held.
//   2. V.pick(signal) maps it to a vignette id (VIGNETTES.md section 8; a world module may add its own pick). The id is looked up in the CURRENT world's module
//      park3d/vig_<worldId>.js (loaded lazily through R3.core.loadVig, preloaded when the world comes up). No module or no id: no vignette, the effects play at once.
//   3. The length form comes from the repeat counter (localStorage bbh:vig<slot>: { id: { n, last } }): FIRST (n 0), FULL (n 1..4), SHORT (5+), MICRO (the same id less than
//      20 s ago, Settings SCENES: OFF, or a vignette still running: spam never queues). Settings SCENES: SHORT forces SHORT. Automated browsers default to MICRO (V.force overrides).
//   4. The reel plays. At its PAY cue the held effects land (toasts, HUD numbers, sfx, banners); the HUD and toasts that the action handler fires itself are held until PAY too.
//      Tap once = PAY now, hand back 300 ms later. Tap twice, hold 0.4 s, Escape = hand back at once. The watchdog ends any reel (MICRO 2.5 s, FIRST 14 s, else 9 s).
//   5. Hand back (VIGNETTES.md 0.5): the engine puts every actor on its mark, the camera glides 300 ms into the controls camera, the letterbox retracts, controls come back,
//      the menu that was open is visible again (it was only hidden), the props are removed.
//
//   BBH.R3Vig.play(id | [id, fallback...], o) -> Promise<info>   o: { pay(), form, action, fx, pre, from }  info: { id, ok, form, skipped, t, errors, error? }  Never rejects.
//   BBH.R3Vig.pick(sig) -> id | [ids] | null      sig = { action, fx, pre, post, place, hot, spot }
//   BBH.R3Vig.form(id, o)  BBH.R3Vig.count(id) -> { n, last }  BBH.R3Vig.load(worldId) -> Promise<module | null>  BBH.R3Vig.has(id, worldId?)  BBH.R3Vig.enabled()
//   BBH.R3Vig.playing (id or null)  .cur ({ id, form, cine })  .last (info)  .log ('id:form' strings)  .force ('first'|'full'|'short'|'micro'|null, tests and tools)  .onReel = fn(cine, id, form)
//   ?vig=0 turns vignettes off, ?vig=first|full|short|micro forces a form. Settings: E.settings.scenes 'full' (default) | 'short' | 'off' (SCENES row in Settings > graphics).
// Hooks installed here (3D place scenes only; each falls through to the old path when there is no vignette):
//   G.do (any action), G.goLive (the desk stream), G.vigBefore('sleep', S, go) (places.js bed row), G.showMorning (the wake up before the morning card),
//   E.go into an activity from the flat (INTRO vignettes: beat maker, recorder, wardrobe, the training games), BBH.Train.idle (the booth bookend), E.toast warn (REFUSAL micro scenes),
//   the wardrobe exit (the mirror check after equipping), G.graphicsRow (the SCENES setting).
(function (root) {
  'use strict';
  const BBH = root.BBH, E = BBH && (BBH.Eng || BBH.E), R3 = BBH && BBH.R3, G = BBH && BBH.G, Core = BBH && BBH.Core;
  if (!E || !R3 || !G || !Core || !E.scenes3d) return;
  const FORMS = ['first', 'full', 'short', 'micro'], MAX = { first: 14, full: 9, short: 6, micro: 2.5 };
  const V = BBH.R3Vig = { playing: null, cur: null, last: null, log: [], mods: {}, force: null, onReel: null, FORMS, MAX };
  const $ = (id) => document.getElementById(id), nop = () => {};
  const safe = (fn, d) => { try { return fn(); } catch (e) { console.error('[r3 vig]', e); return d; } };
  let qs = null; try { qs = new URLSearchParams(root.location.search); } catch (e) { qs = new URLSearchParams(''); }
  const param = qs.get('vig');
  V.test = !!(root.navigator && root.navigator.webdriver) && !param;
  V.reduce = () => safe(() => !!E.settings.reduce || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches), false);
  V.setting = () => { const s = E.settings && E.settings.scenes; return s === 'short' || s === 'off' ? s : 'full'; };
  const sceneUp = () => { const S = E.scene; return E.sceneName === 'place' && !!S && !!S.is3d && !!S.w && S.w === R3.world && !E.pendingSwitch; };
  V.enabled = (o) => param !== '0' && !!(R3.on && R3.active && R3.host && R3.world) && (!!(o && o.anyScene) || sceneUp());

  /* ------------------------------------------------------------------ the repeat counter (a NEW key per save slot; losing it only means FIRST forms again) */
  let cache = null;
  const KEY = () => 'bbh:vig' + (G.slot || 0);
  V.counts = () => { const k = KEY(); if (cache && cache.k === k) return cache.v; let v = {}; try { v = JSON.parse(E.store.getItem(k) || '{}') || {}; } catch (e) { v = {}; } cache = { k, v }; return v; };
  V.count = (id) => Object.assign({ n: 0, last: 0 }, V.counts()[id]);
  V.bump = (id) => { const c = V.counts(), e = c[id] || (c[id] = { n: 0, last: 0 }); e.n++; e.last = Date.now(); safe(() => E.store.setItem(KEY(), JSON.stringify(c))); };
  V.resetCounts = () => { cache = null; safe(() => E.store.removeItem(KEY())); };
  V.form = function (id, o) {
    o = o || {}; if (FORMS.indexOf(o.form) >= 0) return o.form; if (FORMS.indexOf(V.force) >= 0) return V.force; if (FORMS.indexOf(param) >= 0) return param;
    if (V.test) return 'micro';
    const s = V.setting(), e = V.count(id);
    if (s === 'off' || (e.last && Date.now() - e.last < 20000)) return 'micro';
    if (s === 'short') return 'short';
    return !e.n ? 'first' : e.n < 5 ? 'full' : 'short';
  };

  /* ------------------------------------------------------------------ world modules (park3d/vig_<worldId>.js), loaded lazily, missing = no vignettes there */
  V.load = function (wid) {
    let m = V.mods[wid]; if (m) return m.p;
    const core = R3.core || root.Park3D; m = V.mods[wid] = { p: null, m: null, done: false };
    m.p = (core && typeof core.loadVig === 'function' ? Promise.resolve().then(() => core.loadVig(wid)) : Promise.reject(new Error('no vignette loader in this build')))
      .then((mod) => { m.m = mod && mod.VIGNETTES ? mod : null; m.done = true; return m.m; }, () => { m.m = null; m.done = true; return null; });
    return m.p;
  };
  const modOf = (wid) => { const m = V.mods[wid || (R3.world && R3.world.id)]; return (m && m.m) || null; };
  V.has = (id, wid) => { const m = modOf(wid); return !!(m && typeof m.VIGNETTES[id] === 'function'); };
  const first = (ids, wid) => (Array.isArray(ids) ? ids : [ids]).find((k) => k && V.has(k, wid)) || null;
  // the engine chunk and the module of every world that comes up are fetched while the player looks around
  let lastW = null;
  if (R3.onTick) R3.onTick(() => { const w = R3.world; if (!w || w === lastW || param === '0') return; lastW = w; V.load(w.id); if (BBH.R3Cine && BBH.R3Cine.load) BBH.R3Cine.load().catch(nop); safe(watchExit); });

  /* ------------------------------------------------------------------ the trigger table (VIGNETTES.md section 8). A world module can answer first: export function pick(sig) */
  const MINGLE = ['juice', 'napkin', 'liproll', 'bars', 'awkward'];
  V.pick = function (sig) {
    const a = sig.action || {}, fx = sig.fx || [], pre = sig.pre || {}, n = pre.n || {}, m = modOf();
    if (m && typeof m.pick === 'function') { const r = safe(() => m.pick(sig)); if (r !== undefined) return r; }
    switch (a.t) {
      case 'eat': return 'p1.eat.' + a.food;
      case 'nap': return 'p1.nap';
      case 'wait': return sig.hot === 'couch' ? 'p1.couch.rest' : sig.hot === 'bench' ? 'p1.bench.rest' : 'p1.wait';
      case 'stream': return n.streams ? 'p1.stream' : ['p2.first.stream', 'p1.stream'];
      case 'train': return a.where === 'coach' ? 'p1.coach.free.' + a.stat : a.q === 0.4 ? 'p1.train.quick' : null;
      case 'job': return 'p1.job.' + a.job;
      case 'jamWatch': return 'p1.jam.listen';
      case 'mingle': { const f = fx.find((x) => x.t === 'mingle'); return 'p1.mingle.' + (f ? f.id || MINGLE[f.i] : 'chat'); }
      case 'date': return n.dates ? 'p1.date' : ['p2.date.first', 'p1.date'];
      case 'recruit': return 'p2.crew.' + a.id;
      case 'buy': return 'p1.shop.buy';
      case 'equip': return sig.place === 'shop' ? 'p1.shop.wear' : null;
      case 'release': return n.songs ? 'p1.release' : ['p2.release', 'p1.release'];
      case 'coach': return 'p1.coach.pro';
      default: return null;
    }
  };
  // refusals (Core said no, or the UI did): a MICRO scene in the gameplay camera, then the toast (VIGNETTES.md 2.15)
  const REFUSE = [
    [/not enough cash|costs \$|you need \$\d|^You need \$/i, 'p1.refuse.cash'], [/too tired/i, 'p1.refuse.tired'], [/too early to sleep/i, 'p1.refuse.sleep'], [/too late for a nap/i, 'p1.refuse.nap'],
    [/already watched/i, 'p1.refuse.tape'], [/fans to go live|already streamed/i, 'p1.refuse.stream'], [/too sparse|songs earning/i, 'p1.refuse.release'], [/too late to train|it is too late/i, 'p1.refuse.late'],
    [/closed|not open|day off/i, 'p1.refuse.closed'], [/nobody here/i, 'p1.refuse.nojam'], [/come back in \d+ day|busy\. come back/i, 'p1.refuse.coach'], [/get to know them/i, 'p1.refuse.date'],
  ];
  V.refusalId = (text) => { const r = REFUSE.find((x) => x[0].test(String(text || ''))); return r ? r[1] : null; };

  /* ------------------------------------------------------------------ hold: toasts and HUD numbers wait for PAY */
  const H = { on: false, q: [], hud: null, upd: null, own: false };
  const toast0 = E.toast;
  function holdOn() {
    if (H.on) return; H.on = true; H.q = []; const hud = E.hudEl;
    if (hud && typeof hud.update === 'function' && !hud.__vig) { H.hud = hud; H.upd = hud.update; H.own = Object.prototype.hasOwnProperty.call(hud, 'update'); hud.update = function () {}; hud.__vig = 1; }
  }
  // the HUD comes back (MICRO does not hold the numbers: it is over in a moment and plays in the gameplay camera with the HUD on screen)
  function hudBack() { const hud = H.hud; H.hud = null; if (hud) { if (H.own) hud.update = H.upd; else delete hud.update; delete hud.__vig; safe(() => { if (hud.isConnected !== false && G.ch) hud.update(G.ch); }); } }
  function holdOff() {
    if (!H.on) return; H.on = false; hudBack();
    const q = H.q.splice(0); q.forEach((t) => safe(() => toast0.apply(E, t)));
  }
  E.toast = function (text, kind) {
    if (H.on) { H.q.push([text, kind]); return undefined; }
    if (kind === 'warn' && !V.playing && V.enabled()) { const id = V.refusalId(text); if (id && V.has(id)) { const args = arguments; V.play(id, { form: 'micro', pay: () => toast0.apply(E, args) }); return undefined; } }
    return toast0.apply(E, arguments);
  };

  /* ------------------------------------------------------------------ the player */
  const audio = {
    sfx: (n, o) => E.sfx(n, o), drum: (id, o) => safe(() => E.A().drum(id, o)), now: () => safe(() => E.A().now(), 0),
    music: (id, o) => E.music(id, o), stop: (f) => safe(() => E.A().music.stop(f)),
  };
  function cast() {
    const names = { hero: (G.ch && G.ch.name) || 'YOU' }, looks = {};
    for (const id in Core.NPCS) { names[id] = Core.NPCS[id].name; looks[id] = Core.NPCS[id].look; }
    return { names, looks };
  }
  function chrome(on, pay) {
    document.body.classList.toggle('vig-on', !!on);
    if (!$('vig-css')) { const st = document.createElement('style'); st.id = 'vig-css'; st.textContent = 'body.vig-on #hud3, body.vig-on #stage, body.vig-on #r3kit .k3-lay, body.vig-on #glwrap .p3-go, body.vig-on #glwrap .p3-stick { visibility: hidden !important; } body.vig-on #r3kit { z-index: 36; }'; document.head.appendChild(st); }
  }
  // dispose a prop tree the vignette added (shared materials flagged persist survive)
  function drop(x) {
    if (typeof x === 'function') { safe(x); return; }
    if (!x || !x.isObject3D) return; if (x.parent) x.parent.remove(x);
    x.traverse((o) => { if (o.userData && typeof o.userData.dispose === 'function') safe(() => o.userData.dispose()); if (o.geometry && !o.isSprite) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach((m) => { if (!(m.userData && m.userData.persist)) { if (m.map && !(m.map.userData && m.map.userData.persist)) m.map.dispose(); m.dispose(); } }); });
  }
  // cut the running vignette now (a second action came in): PAY lands, nothing is left on screen
  // the black layer a bedtime scene left up (keepDip) goes away: the next scene covered it, or the morning card is coming
  V.unkeep = () => { const k = V.kept; if (!k) return; V.kept = null; clearTimeout(k.t); safe(() => k.scr.dispose()); };
  V.cut = function () { const c = V.cur; if (!c) return; safe(() => c.pay()); safe(() => c.cine.skip()); };
  V.skip = () => { if (V.cur) safe(() => V.cur.cine.skip()); };
  V.tap = () => { if (V.cur) safe(() => V.cur.tap()); };

  V.play = function (id, o) {
    o = o || {}; let paid = false;
    const pay = () => { if (paid) return; paid = true; safe(() => { if (o.pay) o.pay(); }); };
    const ids = Array.isArray(id) ? id : [id], w = R3.world, out = (err) => { pay(); const info = { id: ids[0], ok: false, error: err }; V.last = info; return info; };
    if (!V.enabled(o) || !w) return Promise.resolve(out('off'));
    if ((BBH.R3Cine && BBH.R3Cine.playing) || (BBH.Tape && BBH.Tape.playing)) return Promise.resolve(out('busy'));
    if (V.cur) { V.cut(); o = Object.assign({}, o, { form: 'micro' }); }
    const wid = w.id; V.playing = ids[0];
    const engine = BBH.R3Cine && BBH.R3Cine.load ? BBH.R3Cine.load() : Promise.reject(new Error('no cutscene engine'));
    return Promise.all([engine, V.load(wid)]).then(([M, mod]) => {
      const vid = mod && first(ids, wid);
      if (!vid) { V.playing = null; return out(mod ? 'missing' : 'nomodule'); }
      if (R3.world !== w || !V.enabled(o) || (BBH.R3Cine && BBH.R3Cine.playing)) { V.playing = null; return out('gone'); }
      return run(M, mod, vid, w, o, pay, () => paid);
    }).catch((e) => { console.error('[r3 vig] ' + ids[0], e); V.playing = null; V.cur = null; chrome(false); return out(String(e && e.message || e)); });
  };

  function run(M, mod, vid, w, o, pay, isPaid) {
    const form = V.form(vid, o), cnt = V.count(vid), micro = form === 'micro', reduce = V.reduce(), ch = G.ch, S = E.scene;
    const owned = [], ticks = []; let cine = null, scr = null, offTick = null;
    const ctx = {
      id: vid, form, n: cnt.n, ch, pre: o.pre || ch, action: o.action || null, fx: o.fx || [], world: w, A: (w.terrain && w.terrain.anchors) || {}, reduce, low: R3.quality === 'low', q: R3.quality,
      hour: safe(() => Core.hourOf(ch.minutes), 12), night: safe(() => Core.nightness(ch.minutes), 0.3), look: ch && ch.look, name: (ch && ch.name) || 'You', place: S && S.id, spot: S && S.activeSpot, hot: S && S.lastHot,
      morning: o.morning || null, ev: o.morning && o.morning.ev !== undefined ? o.morning.ev : -1, extra: o.extra || {},
      foxy: safe(() => { const f = (w.npcs || []).find((x) => x && x.id === 'foxy'); return !!(f && f.object.visible); }, false),
      pick: (k) => safe(() => BBH.rng(((ch && ch.day) || 1) * 131 + cnt.n * 7 + vid.length).int(Math.max(1, k)), 0),
      own: (x) => { owned.push(x); return x; }, tick: (fn) => { ticks.push(fn); }, now: () => (cine ? cine.state().real : 0),
      note: (midi, dur, nt) => safe(() => { const A = E.A(); if (A.note) A.note(midi, dur, nt); }), sfx: (n, so) => safe(() => E.sfx(n, so)),
      PAY: { do: 'call', fn: () => doPay() },
    };
    const doPay = () => { if (isPaid()) return; pay(); };
    if (micro) hudBack();
    let spec = null;
    try { spec = mod.VIGNETTES[vid](ctx); } catch (e) { console.error('[r3 vig] reel ' + vid + ' threw', e); spec = null; }
    if (!spec || !Array.isArray(spec.events) || !spec.events.length) { V.playing = null; pay(); owned.forEach(drop); const info = { id: vid, ok: false, form, error: 'empty' }; V.last = info; return info; }
    const lb = spec.letterbox !== undefined ? spec.letterbox : (form === 'first' || form === 'full'), hide = spec.hide !== undefined ? spec.hide : !micro;
    const reel = { id: 'vig.' + vid, events: spec.events.filter(Boolean), cast: spec.cast, end: spec.end, keep: spec.keep, tail: spec.tail === undefined ? 0.12 : spec.tail, max: Math.min(spec.max || MAX[form], MAX[form] + 4) };
    let taps = 0, endT = null;
    const tap = () => { taps++; if (taps === 1) { doPay(); endT = setTimeout(() => { if (cine) cine.end(); }, 300); } else if (cine) cine.skip(); };
    scr = M.createScreen({ box: $('glwrap'), canvas: $('gl'), reduce, low: ctx.low, holdMs: 400, onTap: tap, onSkip: () => { doPay(); if (cine) cine.skip(); } });
    if (spec.dipIn) scr.dip(1, 0, '#07040e');
    if (V.kept) { const k = V.kept; V.kept = null; clearTimeout(k.t); setTimeout(() => safe(() => k.scr.dispose()), 60); }
    if (lb) scr.letterbox('scope', reduce ? 0 : 420);
    chrome(hide, false); if (spec.holdSync) safe(() => R3.holdSync(true));
    const cs = cast(), t0 = performance.now();
    const cleanProps = () => { ticks.length = 0; owned.splice(0).forEach(drop); };
    cine = M.createCine(w, reel, { screen: scr, audio, names: cs.names, looks: cs.looks, reduce, low: ctx.low, blendOut: micro ? 0 : (spec.blendOut || 300), max: reel.max, controls: micro ? false : undefined,
      onFinish: () => { doPay(); cleanProps(); if (lb) scr.letterbox(0, 300); scr.skipUI(false); scr.clearSub(150); } });
    ctx.api = cine;
    const cur = V.cur = { id: vid, form, cine, scr, ctx, pay: doPay, tap }; V.playing = vid;
    // MICRO never holds the input: a tap goes on to the game (the open menu), and the next action cuts this scene short
    if (micro) safe(() => { scr.root.style.pointerEvents = 'none'; });
    safe(() => R3.setBeatSource(() => cine.pulse));
    const st0 = micro && w.controls && w.controls.state ? safe(() => w.controls.state(), null) : null;
    const p = cine.play();
    if (w.onFrame) offTick = w.onFrame(() => {
      if (BBH.R3Cine && BBH.R3Cine.playing && !cine.done) { doPay(); cine.skip(); return; }   // a story film wants the camera: the vignette steps aside at once
      // MICRO keeps the controls live: the moment the player walks off (a tap on the world, a spot, the stick) the scene is over
      if (micro && !cine.done && w.controls && w.controls.state) { const st = safe(() => w.controls.state(), null); if (st && (st.moving || (st0 && st.spot !== st0.spot && st.spot))) { doPay(); cine.skip(); return; } }
      for (let i = 0; i < ticks.length; i++) { try { ticks[i](); } catch (e) { console.error('[r3 vig] tick', e); ticks.splice(i--, 1); } }
    }, 'pre');
    if (form === 'first') setTimeout(() => { if (V.cur === cur) scr.skipUI(true); }, 700);
    if (V.onReel) safe(() => V.onReel(cine, vid, form));
    return p.then((res) => {
      clearTimeout(endT); if (offTick) safe(offTick); cleanProps(); doPay();
      // keepDip: the reel ended on black and the next thing is a world load (bedtime -> the morning): the black layer stays up until the next vignette covers it, 4 s at most
      if (spec.keepDip && !res.skipped) { if (V.kept) safe(() => V.kept.scr.dispose()); const k = V.kept = { scr, t: setTimeout(() => { if (V.kept === k) { V.kept = null; safe(() => scr.dispose()); } }, 4000) }; safe(() => { scr.letterbox(0, 0); scr.root.style.pointerEvents = 'none'; }); } else safe(() => scr.dispose());
      if (spec.holdSync) safe(() => R3.holdSync(false));
      if (V.cur === cur) { V.cur = null; V.playing = null; chrome(false); safe(() => R3.setBeatSource(null)); }   // (a vignette that cut this one short owns the chrome and the beat now)
      V.bump(vid); V.log.push(vid + ':' + form);
      const info = { id: vid, ok: true, form, skipped: !!res.skipped, t: +((performance.now() - t0) / 1000).toFixed(2), errors: res.errors || 0 }; V.last = info; return info;
    });
  }

  /* ------------------------------------------------------------------ G.do: every action can have its vignette */
  const NO_VIG = { flag: 1, at: 1, rename: 1, seqsave: 1, travel: 1, story: 1, meet: 1, tape: 1, perform: 1, battle: 1, trainIdle: 1, trainGame: 1, sleep: 1 };
  const do0 = G.do;
  G.do = function (action, hand) {
    if (!action || NO_VIG[action.t] || !V.enabled()) return do0.apply(G, arguments);
    const S = E.scene, pre = G.ch, r = Core.apply(pre, action, Math.random);
    const warn = r.fx.some((f) => f.t === 'toast' && f.kind === 'warn');
    const id = warn ? null : safe(() => V.pick({ action, fx: r.fx, pre, post: r.char, place: S && S.id, hot: S && S.lastHot, spot: S && S.activeSpot }), null);
    const vid = id ? first(id) : null;
    if (!vid) { G.setChar(r.char); G.play(r.fx, hand); return r; }
    holdOn(); G.setChar(r.char);
    V.play(vid, { action, fx: r.fx, pre, pay: () => { holdOff(); G.play(r.fx, hand); } });
    return r;
  };
  // the desk GO LIVE: in 3D the stream is a vignette at the desk, not a flash of the screen
  const live0 = G.goLive;
  if (live0) G.goLive = function () { if (!V.enabled() || !first(['p1.stream', 'p2.first.stream'])) return live0.apply(G, arguments); if (G.ch.fans < Core.STREAM_MIN_FANS) { E.toast('You need ' + Core.STREAM_MIN_FANS + ' fans to go live.', 'warn'); return undefined; } return G.do({ t: 'stream' }); };

  /* ------------------------------------------------------------------ bedtime (places.js bed row): the scene first, then the old sleep path (fade, Core, the morning) */
  G.vigBefore = function (kind, S, go) {
    if (kind !== 'sleep' || !V.enabled() || !first('p1.sleep')) return false;
    V.play('p1.sleep', { extra: { late: Core.hourOf(G.ch.minutes) < 6 } }).then(() => go(), () => go());
    return true;
  };
  /* ------------------------------------------------------------------ the morning: wake up in bed (and the morning event), then the morning card */
  const morning0 = G.showMorning;
  G.showMorning = function (then) {
    const f = G.pendingMorning, w = R3.world, args = arguments;
    if (!f || f.cause !== 'sleep' || f.day === 2 || !w || w.id !== 'flat' || !(R3.on && R3.active) || param === '0' || !first('p1.wake', 'flat')) { V.unkeep(); return morning0.apply(G, args); }
    // the place scene is not "up" yet (the card comes before the world is playable): anyScene relaxes the scene check, the controls stay off afterwards like the card wants
    const go = () => { V.unkeep(); morning0.apply(G, args); };
    V.play('p1.wake', { morning: f, anyScene: true }).then(go, go);
    return undefined;
  };

  /* ------------------------------------------------------------------ INTRO vignettes: an activity launched from a place gets a lead-in, then the scene loads */
  const INTRO = { seq: (a) => (a && a.train ? 'p1.train.play.make' : 'p1.beatmaker.in'), studio: () => 'p1.record.in', tuner: (a) => (a && a.train ? 'p1.train.play.tune' : 'p1.tune.in'), ear: () => 'p1.train.play.ear',
    pose: () => 'p1.train.play.pose', rhythm: (a) => (a && a.mode === 'train' ? 'p1.train.play.beat' : null), creator: (a) => (a && a.mode === 'wardrobe' ? 'p1.wardrobe.in' : null) };
  const go0 = E.go;
  E.go = function (name, args, o) {
    const mk = INTRO[name], S = E.scene;
    if (!mk || V.playing || !V.enabled() || (o && o.noVig)) return go0.apply(E, arguments);
    const id = safe(() => mk(args || {}), null), vid = id && first(id);
    if (!vid || V.form(vid) === 'micro') return go0.apply(E, arguments);   // an intro has no MICRO: a repeat (or SCENES: OFF) goes straight into the activity
    const spot = S && S.activeSpot, all = arguments;
    if (name === 'creator') V.wardrobeFrom = { look: JSON.stringify(G.ch && G.ch.look), at: Date.now() };
    V.play(vid, { action: { t: 'go', scene: name, args } }).then(() => { if (E.scene === S && S && !S.activeSpot && spot) S.activeSpot = spot; go0.apply(E, all); });
    return undefined;
  };
  /* ------------------------------------------------------------------ the booth: IDLE training gets its entry beat (the ticks are never interrupted) */
  const T = BBH.Train;
  if (T && typeof T.idle === 'function') {
    const idle0 = T.idle;
    T.idle = function (S, stat, minutes, where) {
      const id = 'p1.train.idle.' + stat, vid = first(id);
      if (!vid || V.playing || !V.enabled() || !S || !S.is3d || V.form(vid) === 'micro') return idle0.apply(T, arguments);   // the bookend has no MICRO: the ticks start at once
      const all = arguments; V.play(vid, { action: { t: 'trainIdle', stat, minutes, where } }).then(() => { if (E.scene === S) idle0.apply(T, all); });
      return null;
    };
  }
  /* ------------------------------------------------------------------ the wardrobe exit: back from the creator with a new look -> the mirror check */
  function watchExit() {
    const wf = V.wardrobeFrom; if (!wf) return;
    if (Date.now() - wf.at > 15 * 60000) { V.wardrobeFrom = null; return; }
    if (E.sceneName === 'creator') return;
    if (!sceneUp() || E.scene.id !== 'home') { if (E.sceneName !== 'place') V.wardrobeFrom = null; return; }
    V.wardrobeFrom = null; const now = JSON.stringify(G.ch && G.ch.look); if (now === wf.look) return;
    const slot = safe(() => { const a = JSON.parse(wf.look), b = G.ch.look; return ['hat', 'glasses', 'top', 'bottom', 'shoes'].find((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])) || 'top'; }, 'top');
    setTimeout(() => { if (sceneUp() && !V.playing) V.play('p1.wardrobe', { extra: { slot } }); }, 450);
  }
  if (R3.onTick) R3.onTick(() => { if (V.wardrobeFrom && E.sceneName === 'place' && sceneUp()) safe(watchExit); });

  /* ------------------------------------------------------------------ Settings: SCENES FULL / SHORT / OFF (next to GRAPHICS) */
  const gr0 = G.graphicsRow;
  G.graphicsRow = function () {
    const row = gr0 ? safe(() => gr0.apply(G, arguments), null) : null, cur = V.setting(), lab = { full: 'FULL', short: 'SHORT', off: 'OFF' }, next = { full: 'short', short: 'off', off: 'full' };
    const b = E.btn('SCENES: ' + lab[cur], cur === 'full' ? 'green' : '', null); b.setAttribute('data-set', 'scenes');
    b.addEventListener('click', () => { const s = next[V.setting()]; E.settings.scenes = s; b.textContent = 'SCENES: ' + lab[s]; b.className = 'btn ' + (s === 'full' ? 'green' : ''); safe(() => E.saveSettings()); E.sfx('click'); });
    if (!row) return b; const wrap = E.h('div.col', { style: { gap: '7px' } }); wrap.append(row, b); return wrap;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
