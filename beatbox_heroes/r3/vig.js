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

  /* ------------------------------------------------------------------ THE TOWN (thrift shop, Sound Lab, bar: park3d/vig_shop.js, vig_lab.js, vig_bar.js). Actions with no Core call get a hook here */
  // the shop TRY ON (a tile tap changes the panel's look, no Core): the MICRO swap plays and swaps the look at its half turn; the try on camera and the drag to spin stay as they are
  const P3 = E.scenes3d.place;
  if (P3 && typeof P3.tryOn === 'function') {
    const try0 = P3.tryOn;
    P3.tryOn = function () {
      const sh = this.shop, tt = this._try, w = this.w, sc = this;
      if (tt && tt.k && sh && sh.el && sh.el.isConnected && w && sh.tab === tt.tab && !(V.cur && V.cur.form !== 'micro')) {
        const k = JSON.stringify(sh.look);
        if (k !== tt.k && V.enabled() && first('p1.shop.tryon')) {
          const from = safe(() => JSON.parse(tt.k), null); tt.k = k;   // the scene's own setLook is skipped: the vignette swaps the look on its beat
          const restore = () => safe(() => { if (sc.w === w) { const s = sc.shop; w.setLook(s && s.el && s.el.isConnected ? s.look : G.ch.look); } });
          V.play('p1.shop.tryon', { form: 'micro', extra: { from, to: JSON.parse(k), tab: sh.tab, restore } }).then((i) => { if (!i.ok) restore(); });
        }
      }
      return try0.apply(this, arguments);
    };
  }
  // the bar stage: the walk up before a set and the walk out before a battle (INTRO, then the venue). The World Cup finals belong to their own films
  const STAGE_IN = (a) => (a && a.mode === 'perform' && /^(openmic|showcase|karaoke)$/.test(a.kind) ? 'p1.stage.in.' + a.kind : a && a.mode === 'battle' && !a.final ? 'p1.battle.walkout' : null);
  const goT = E.go;
  E.go = function (name, args, o) {
    const S = E.scene;
    if (name !== 'rhythm' || V.playing || !V.enabled() || (o && o.noVig) || !S || S.id !== 'bar') return goT.apply(E, arguments);
    const vid = first(STAGE_IN(args || {}));
    if (!vid || V.form(vid) === 'micro') return goT.apply(E, arguments);
    const spot = S.activeSpot, all = arguments;
    V.play(vid, { action: { t: 'go', scene: name, args } }).then(() => { if (E.scene === S && S && !S.activeSpot && spot) S.activeSpot = spot; goT.apply(E, all); });
    return undefined;
  };
  // after the set: the bow (p1.stage.out) or the verdict in the room (p1.battle.verdict) once the bar is up again. Core decided in the venue (G.doHold); the scene waits for the
  // place and steps aside for a story film (firstWin, firstLoss, firstShowcase, champion), a story dialog or the morning
  const hold0 = G.doHold;
  if (hold0) G.doHold = function (action) { const r = hold0.apply(G, arguments); if (action && (action.t === 'perform' || action.t === 'battle')) V.lastSet = { action, fx: r.fx, at: Date.now() }; return r; };
  const ret0 = G.takeReturn;
  if (ret0) G.takeReturn = function (id) {
    const t = ret0.apply(G, arguments), L = V.lastSet; V.lastSet = null; V.outPending = null;
    if (t && id === 'bar' && t.scene === 'rhythm' && L && Date.now() - L.at < 10 * 60000) V.outPending = { L, at: 0, films: (BBH.R3Cine && BBH.R3Cine.log.length) || 0 };
    return t;
  };
  const OUT_OF = (a) => (a.t === 'battle' ? (a.final ? null : 'p1.battle.verdict') : /^(openmic|showcase|karaoke)$/.test(a.kind) ? 'p1.stage.out' : null);
  if (R3.onTick) R3.onTick(() => {
    const p = V.outPending; if (!p) return;
    if (E.sceneName !== 'place' || !E.scene || E.scene.id !== 'bar' || G.pendingMorning) { V.outPending = null; return; }
    if (!sceneUp()) return;
    if (!p.at) { p.at = Date.now(); return; }
    if (Date.now() - p.at < 450) return;
    V.outPending = null;
    const C = BBH.R3Cine; if ((C && (C.playing || C.log.length > p.films)) || V.playing || document.querySelector('.k3-dlg, #ui .dialog')) return;
    const id = OUT_OF(p.L.action), vid = id && first(id);
    if (vid) V.play(vid, { action: p.L.action, fx: p.L.fx });
  });
  // the Sound Lab JUKEBOX (a track from the mixer's jukebox sheet): a bar of the new track (MICRO)
  const mus0 = E.music;
  if (mus0) E.music = function (id) {
    const r = mus0.apply(E, arguments), S = E.scene, ttl = S && S.sheetEl && S.sheetEl.querySelector && S.sheetEl.querySelector('.h2');
    if (S && S.id === 'studio' && ttl && /^\s*JUKEBOX/.test(ttl.textContent || '') && !V.playing && V.enabled() && first('p3.jukebox.lab')) V.play('p3.jukebox.lab', { form: 'micro', extra: { track: id } });
    return r;
  };
  /* ------------------------------------------------------------------ THE PARK, DOORS, TRAVEL (park3d/vig_park.js, vig_doors.js, vig_hood.js; VIGNETTES.md 2.8, 2.9, 2.13) */
  // The park's activities leave the place scene, so they get an INTRO here (busk, jam, run) and an OUTRO when the result card hands back to the park: the held effects (toasts, banners,
  // the coach line) land on PAY. A story beat or a morning in the held effects means a film (or the morning card) owns the moment: no outro then, the old path runs untouched.
  // Doors: p1.door.out before a place is left (the LEAVE button, the door ring), p1.door.in.<place> when a travel lands (not on a first visit: the arrival lines and films own that),
  // p1.travel.map on the hood map before GO THERE travels (the door then plays SHORT). Like the intros, doors have no MICRO: a repeat or SCENES: OFF goes straight through.
  // A world without its own door scene gets the generic one of vig_doors.js (filled into the gaps of that world's table; the world module always wins).
  if (!$('vig-css-park')) { const st = document.createElement('style'); st.id = 'vig-css-park'; st.textContent = 'body.vig-on .p3-go { visibility: hidden !important; }'; document.head.appendChild(st); }
  INTRO.run = () => 'p1.run.in';
  const rhythmIn = INTRO.rhythm;
  INTRO.rhythm = (a) => rhythmIn(a) || (a && a.mode === 'perform' && (a.kind === 'busk' || a.kind === 'jam') && E.scene && E.scene.id === 'park' ? 'p1.' + a.kind + '.in' : null);
  const holdPark = G.doHold;
  if (holdPark) G.doHold = function (action) { const pre = G.ch, h = holdPark.apply(G, arguments); if (h && typeof h === 'object') { h.action = action; h.pre = pre; } return h; };
  const OUTRO = { busk: 'p1.busk.out', jam: 'p1.jam.out' };
  const fin0 = G.finishActivity;
  if (fin0) G.finishActivity = function (held, back) {
    const a = held && held.action, fx = (held && held.fx) || [], to = back && typeof back === 'object' ? back.args && back.args.id : back;
    const id = a ? (a.t === 'perform' ? OUTRO[a.kind] : a.t === 'run' ? 'p1.run.out' : null) : null;
    const owned = fx.some((f) => f.t === 'story' || f.t === 'morning') || safe(() => !!(Core.storyArrive && Core.storyArrive(G.ch, 'park')), true) || (G.storyQ && G.storyQ.length);
    const again = !!(G.activityReturn && G.activityReturn.mode === 'again');   // PLAY AGAIN goes straight back into the activity: the old path
    if (!id || to !== 'park' || owned || again || param === '0' || !(R3.on && R3.active) || typeof held.play !== 'function' || !first(id, 'park')) return fin0.apply(G, arguments);
    const play = held.play, t0 = Date.now(); let hand = null, done = false;
    const flush = () => { if (done) return; done = true; held.play = play; safe(() => play.call(held, hand || {})); };
    held.play = (h) => { hand = h; };   // the old path asks for the effects now: they wait for the park
    safe(() => fin0.call(G, held, back), null);
    if (G.pendingMorning) { flush(); return undefined; }
    const poll = () => {
      if (done) return;
      const up = sceneUp() && E.scene.id === 'park' && R3.world.id === 'park';
      if (!up) { if ((E.sceneName === 'place' && !E.pendingSwitch && E.scene && E.scene.id !== 'park') || Date.now() - t0 > 45000) flush(); else setTimeout(poll, 120); return; }   // somewhere else, or the park never came
      if (V.playing || (BBH.R3Cine && BBH.R3Cine.playing)) { flush(); return; }
      holdOn(); V.play(id, { action: a, fx, pre: held.pre, pay: () => { holdOff(); flush(); } }).then(() => { holdOff(); flush(); });
    };
    setTimeout(poll, 60);
    return undefined;
  };
  // the door scenes a world module lacks come from vig_doors.js
  const DOOR_IDS = /^p1\.door\.(out|in\.)/;
  function doorsFor(wid) {
    return Promise.all([V.load(wid), V.load('doors')]).then(([, d]) => {
      const e = V.mods[wid]; if (!d || !e) return; if (!e.m) e.m = { VIGNETTES: {} };
      for (const k in d.VIGNETTES) if (DOOR_IDS.test(k) && typeof e.m.VIGNETTES[k] !== 'function') safe(() => { e.m.VIGNETTES[k] = d.VIGNETTES[k]; });
    }, nop);
  }
  let doorW = null;
  if (R3.onTick) R3.onTick(() => { const w = R3.world; if (!w || w === doorW || param === '0') return; doorW = w; if (w.id !== 'hood' && w.id !== 'street') doorsFor(w.id); });
  const doorForm = (vid, o) => { const f = V.form(vid, o); return f === 'micro' && FORMS.indexOf(V.force) < 0 && FORMS.indexOf(param) < 0 ? null : f; };
  // leaving a place: the door scene first, then the old path
  const P3park = E.scenes3d.place;
  if (P3park && typeof P3park.leave2 === 'function') {
    const leave0 = P3park.leave2;
    P3park.leave2 = function () {
      const S = this, all = arguments, vid = first('p1.door.out');
      if (!vid || V.playing || S.__vigLeave || !V.enabled() || E.scene !== S || !doorForm(vid)) return leave0.apply(S, all);
      S.__vigLeave = true; safe(() => S.closeSheet && S.closeSheet());
      const go = () => { S.__vigLeave = false; if (E.scene === S && E.sceneName === 'place') leave0.apply(S, all); };
      V.play(vid, { action: { t: 'leave', from: S.id } }).then(go, go);
      return undefined;
    };
  }
  // travelling: the hood map hop first (GO THERE), then the travel; the arrival door when the place comes up
  let arrive = null;
  const enter0 = G.enterPlace;
  if (enter0) G.enterPlace = function (to) {
    const all = arguments, ch = G.ch, ok = safe(() => Core.canEnter(ch, to).ok, false), mapUp = E.sceneName === 'map' && R3.world && R3.world.id === 'hood' && E.scene && E.scene.w === R3.world;
    const mark = () => { arrive = { to, at: Date.now(), first: !(ch && ch.flags && ch.flags['visited_' + to]), story: safe(() => !!(Core.storyArrive && Core.storyArrive(ch, to)), true), form: mapUp ? 'short' : null }; };
    if (ok && mapUp && !V.playing && param !== '0' && first('p1.travel.map', 'hood') && doorForm('p1.travel.map')) {
      const S = E.scene; V.play('p1.travel.map', { anyScene: true, extra: { to }, action: { t: 'travel', to } }).then(() => { if (E.scene === S) { mark(); enter0.apply(G, all); } });
      return true;
    }
    const r = enter0.apply(G, all); if (r) mark(); return r;
  };
  if (R3.onTick) R3.onTick(() => {
    const ar = arrive; if (!ar) return;
    if (Date.now() - ar.at > 90000) { arrive = null; return; }
    if (!sceneUp() || E.scene.id !== ar.to) return;
    arrive = null; if (ar.first || ar.story || V.playing || (BBH.R3Cine && BBH.R3Cine.playing) || (G.storyQ && G.storyQ.length)) return;
    const vid = first('p1.door.in.' + ar.to), form = vid && (ar.form || doorForm(vid));
    if (vid && form) V.play(vid, { form, action: { t: 'travel', to: ar.to } });
  });

  /* ------------------------------------------------------------------ MILESTONES (park3d/vig_milestones.js; VIGNETTES.md section 3: level ups, new sounds, trophies, unlocks, fans, money, rent, crew, ladder) */
  // The milestone table is the shared BASE of every world's table (its prototype): a world's own entry always wins, Object.keys of a world's table stays the world's own ids.
  // That is how the shared trigger table reaches the action milestones (recruit -> p2.crew.<id>, the first stream, the first release). The rest has no action of its own, so it is
  // QUEUED here: the progress fx (levelup, achievement, unlock, soundUnlocked, with their sfx and the "New sound" toast) are held out of G.play, the save is watched for the fan and
  // money lines, the first $0, a new rung on the ladder, and the Sunday morning for the rent. The queue plays once the place is QUIET (the place scene up, no vignette, no story film,
  // no story waiting, no dialog, card or menu sheet, no morning, no stage outro pending) for 0.9 s: a world scene (rent, ladder, release) first, then every progress beat waiting COLLAPSED into
  // one scene (one beat: its own scene; one beat with only unlocks or its level trophy riding along: that beat's scene; several: p2.beats with all of them on one card). At most
  // two scenes chain. PAY lands the held fx: MICRO (and SCENES: OFF, automated browsers) shows the old banners; a staged form shows its own card instead of the banners it covers.
  // A beat that waits more than 2 minutes (a long set, the street) or that a story film covered (the first win's film, the champion) gets its old banner and no scene.
  const MS = V.ms = { q: [], log: [], mod: null, idleAt: 0, busy: false, lastApply: null, max: 120000 };
  const C3 = () => BBH.R3Cine;
  MS.on = () => param !== '0' && !!(R3.on && R3.active && R3.host);
  const link = () => { const ms = MS.mod; if (!ms) return; for (const k in V.mods) { if (k === 'milestones' || k === 'doors') continue; const e = V.mods[k], t = e && e.m && e.m.VIGNETTES; if (t && t !== ms.VIGNETTES && Object.getPrototypeOf(t) !== ms.VIGNETTES) safe(() => Object.setPrototypeOf(t, ms.VIGNETTES)); } };
  MS.load = (wid) => Promise.all([V.load('milestones'), wid ? V.load(wid) : null]).then(([m]) => { if (m) { MS.mod = m; link(); } return m; }, () => null);
  let msW = null;
  if (R3.onTick) R3.onTick(() => { const w = R3.world; if (!w || w === msW || param === '0') return; msW = w; MS.load(w.id); });
  // the fx a scene owns: achievements a story film or a P1 scene already stages keep their banner
  const ACH_SCENE = { fans100: 'p2.fans.100', fans500: 'p2.fans.500', fans2000: 'p2.fans.2000', rich: 'p2.money.500', firstsong: 'p2.release' };
  const ACH_OWNED = { streamer: 1, firstbattle: 1, worldcup: 1, showcase: 1 };
  const SFX_OF = { levelup: 'levelup', ach: 'achievement', unlock: 'unlock', sound: 'unlock' };
  function itemOf(f) {
    if (f.t === 'levelup') return { k: 'levelup', level: f.level, f };
    if (f.t === 'soundUnlocked') return { k: 'sound', id: f.id, name: f.name, f };
    if (f.t === 'unlock') return { k: 'unlock', name: f.name, group: f.group, id: f.id, f };
    if (f.t === 'achievement' && !ACH_OWNED[f.id]) return { k: 'ach', id: f.id, name: f.name, desc: f.desc, scene: ACH_SCENE[f.id] || null, home: f.id === 'firstsong' ? 'flat' : null, f };
    return null;
  }
  const playMs = (fx) => { if (fx && fx.length) safe(() => play0.call(G, fx, {})); };
  MS.add = function (e) { e.at = Date.now(); e.films = (C3() && C3().log.length) || 0; MS.q.push(e); MS.idleAt = 0; return e; };
  // G.play: the progress beats wait for the queue, everything else plays now
  const play0 = G.play;
  G.play = function (fx, hand) {
    if (!Array.isArray(fx) || !MS.on()) return play0.apply(G, arguments);
    const h = hand || {}, items = [], held = [], rest = [];
    for (const f of fx) { const it = f && !h[f.t] ? itemOf(f) : null; if (it) { items.push(it); held.push(f); } else rest.push(f); }
    if (!items.length) return play0.apply(G, arguments);
    const names = {}; items.forEach((i) => { names[SFX_OF[i.k]] = 1; }); const snd = items.some((i) => i.k === 'sound'), keep = [];
    for (const f of rest) { if ((f.t === 'sfx' && names[f.name]) || (snd && f.t === 'toast' && /^New sound: /.test(f.text || ''))) held.push(f); else keep.push(f); }
    play0.call(G, keep, hand);
    MS.add({ kind: 'beats', items, held });
    return undefined;
  };
  // the save: fans and money lines, the first $0 of the week, a new rung on the ladder (only saves that come out of Core.apply count, never a load or a test seed)
  const apply0 = Core.apply;
  Core.apply = function (ch0, a) { const r = apply0.apply(Core, arguments); if (r && r.char && ch0 && a && a.t !== 'flag') MS.lastApply = { pre: ch0, post: r.char, a }; return r; };
  const set0 = G.setChar;
  G.setChar = function (ch) {
    const L0 = MS.lastApply, r = set0.apply(G, arguments);
    if (L0 && ch && ch === L0.post) { MS.lastApply = null; if (MS.on()) safe(() => watch(L0.pre, ch, L0.a)); }
    return r;
  };
  const solo = (id, o) => MS.add(Object.assign({ kind: 'solo', id, held: [], items: [] }, o));
  function watch(pre, post, a) {
    if ((pre.fans || 0) < 25 && post.fans >= 25 && !V.count('p2.fans.25').n) solo('p2.fans.25');
    if ((pre.cash || 0) < 100 && post.cash >= 100 && !V.count('p2.money.100').n && !(post.ach && post.ach.rich && !(pre.ach && pre.ach.rich))) solo('p2.money.100');
    if ((pre.cash || 0) > 0 && post.cash === 0 && a.t !== 'sleep') {
      const cs = V.counts(), e = cs['p2.broke'];
      if (!e || !(e.day > 0) || post.day - e.day >= 7) { cs['p2.broke'] = Object.assign(e || { n: 0, last: 0 }, { day: post.day }); solo('p2.broke'); }
    }
    if (a.t === 'battle' && !a.final) {
      const opp = Object.keys(post.beat || {}).find((k) => !(pre.beat || {})[k]);
      if (opp) solo('p2.ladder', { home: 'bar', extra: { opp }, cover: ['firstWin', 'champion'] });
    }
  }
  // Sunday morning: the rent, paid or covered by Foxy (after the wake up and the morning card)
  const morn0 = G.showMorning;
  G.showMorning = function () {
    const f = G.pendingMorning;
    if (f && MS.on() && Array.isArray(f.lines)) safe(() => {
      const paid = f.lines.find((l) => /^Rent paid: \$(\d+)/.test(l)), short = f.lines.find((l) => /could not cover rent/i.test(l));
      if (paid) solo('p2.rent.paid', { home: 'flat', extra: { amount: +paid.match(/\$(\d+)/)[1] } });
      else if (short) { const m = short.match(/owe \$(\d+)/); solo('p2.rent.short', { home: 'flat', extra: { debt: m ? +m[1] : 75 } }); }
    });
    return morn0.apply(G, arguments);
  };
  // quiet: nothing else owns the screen (an open menu sheet too: the player is choosing, the milestone waits until it is closed)
  MS.quiet = () => {
    if (!MS.on() || !sceneUp() || V.playing || V.cur || MS.busy || V.outPending || G.pendingMorning || E.pendingSwitch) return false;
    const C = C3(); if ((C && C.playing) || (G.storyQ && G.storyQ.length) || (BBH.Tape && BBH.Tape.playing)) return false;
    return !document.querySelector('#r3kit .k3-dlg, #r3kit .k3-modal, #ui .dialog, #ui .full, #ui .sheet');
  };
  // what one pending batch of beats becomes: { id, extra, shown (the fx its card covers) }
  function scenePlan(items) {
    const lvl = items.some((i) => i.k === 'levelup');
    const minor = (i) => i.k === 'unlock' || (lvl && i.k === 'ach' && /^level\d+$/.test(i.id || ''));
    const major = items.filter((i) => !minor(i)), level = Math.max(0, ...items.filter((i) => i.k === 'levelup').map((i) => i.level || 0));
    const extra = { items: items.map((i) => ({ k: i.k, id: i.id, name: i.name, desc: i.desc, level: i.level, group: i.group })), level: level || undefined };
    if (!major.length) return items.length === 1 ? { id: 'p2.unlock.cosmetic', extra, shown: items } : { id: 'p2.beats', extra, shown: items };
    if (major.length === 1) {
      const m = major[0], shown = [m].concat(items.filter((i) => lvl && m.k === 'levelup' && i.k === 'ach'));
      const id = m.k === 'levelup' ? 'p2.levelup' : m.k === 'sound' ? 'p2.sound.' + m.id : m.scene || 'p2.ach';
      return { id, extra: Object.assign(extra, { name: m.name, desc: m.desc }), shown, home: m.home || null };
    }
    return { id: 'p2.beats', extra, shown: items };
  }
  // PAY: the held fx land; a staged form drops the banners (and their sounds, the new sound toast) of the beats its own card shows
  function payFor(held, shown, form) {
    if (form === 'micro' || !shown.length) return held;
    const fs = new Set(shown.map((i) => i.f)), names = {}; shown.forEach((i) => { names[SFX_OF[i.k]] = 1; }); const snd = shown.some((i) => i.k === 'sound');
    return held.filter((f) => !fs.has(f) && !(f.t === 'sfx' && names[f.name]) && !(snd && f.t === 'toast' && /^New sound: /.test(f.text || '')));
  }
  function run1(id, extra, held, shown, then) {
    const wid = R3.world && R3.world.id; MS.busy = true;
    MS.load(wid).then(() => {
      const vid = first(id) ? id : null, form = vid ? V.form(vid) : 'micro';
      if (!vid || !MS.quiet0()) { MS.busy = false; playMs(held); then(); return; }
      MS.log.push(vid + ':' + form); MS.vid = vid;
      const p = MS.cur = V.play(vid, { form, extra, pay: () => playMs(payFor(held, shown || [], form)) }).then(() => { MS.busy = false; MS.idleAt = 0; MS.cur = null; MS.vid = null; then(); });
      return p;
    }).catch((e) => { console.error('[r3 vig] milestone', e); MS.busy = false; playMs(held); then(); });
  }
  // the player's next move wins: an activity, the booth, the door while a milestone plays: the milestone is cut (its reward lands) and the move goes on a moment later with its own scene
  const yieldTo = (fn) => function () {
    if (!(MS.cur && V.cur && V.cur.id === MS.vid)) return fn.apply(this, arguments);
    const self = this, args = arguments, p = MS.cur; V.cut(); p.then(() => fn.apply(self, args), () => fn.apply(self, args)); return undefined;
  };
  E.go = yieldTo(E.go);
  if (BBH.Train && typeof BBH.Train.idle === 'function') BBH.Train.idle = yieldTo(BBH.Train.idle);
  if (P3park && typeof P3park.leave2 === 'function') P3park.leave2 = yieldTo(P3park.leave2);
  MS.quiet0 = () => { MS.busy = false; const q = MS.quiet(); MS.busy = true; return q; };
  if (R3.onTick) R3.onTick(() => {
    if (!MS.q.length || MS.busy) return;
    const now = Date.now(), C = C3(), wid = R3.world && R3.world.id;
    // too late, or a story film staged the moment: the old banner, no scene
    for (let i = MS.q.length - 1; i >= 0; i--) {
      const e = MS.q[i], filmed = !!(e.cover && C && C.log.slice(e.films).some((x) => e.cover.indexOf(x) >= 0));
      if (now - e.at > MS.max || filmed || !MS.on()) { MS.q.splice(i, 1); playMs(e.held); }
    }
    if (!MS.q.length) return;
    if (!MS.quiet()) { MS.idleAt = 0; return; }
    if (!MS.idleAt) { MS.idleAt = now; return; }
    if (now - MS.idleAt < 900) return;
    // a world scene first (in its world), then the beats collapsed
    const si = MS.q.findIndex((e) => e.kind === 'solo' && (!e.home || e.home === wid));
    if (si >= 0) { const e = MS.q.splice(si, 1)[0]; run1(e.id, e.extra || {}, e.held, [], () => {}); return; }
    const beats = MS.q.filter((e) => e.kind === 'beats'); if (!beats.length) return;
    const items = [].concat(...beats.map((e) => e.items)), held = [].concat(...beats.map((e) => e.held)), plan = scenePlan(items);
    if (plan.home && plan.home !== wid) { if (beats.some((e) => now - e.at > 30000)) { plan.id = 'p2.ach'; plan.home = null; } else return; }   // the first release waits for the flat a little
    MS.q = MS.q.filter((e) => e.kind !== 'beats');
    run1(plan.id, plan.extra, held, plan.shown, () => {});
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
