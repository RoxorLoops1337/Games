// Inkwoven -- UI core: the stage, the screen manager, overlays, tooltips, input and every shared DOM component (owner: UI core).
// This header is the contract of record for ui.js. Styles live in css/base.css (class names below are the ones it defines).
//
// STAGE       UI.W UI.H (1280 x 720)   UI.scale UI.px UI.ox UI.oy (live)   UI.layers {view, screens, overlays, over, tips, toasts}   UI.stageEl
//   UI.init()                 idempotent; GAME.boot calls it. Resize and orientation listeners, audio arming on the first pointer or key, visibility.
//   UI.resize()               scale = min(vw/1280, vh/720) of the VISUAL viewport, translate + scale on #stage, class `compact` below 0.75, px = clamp(scale*dpr,1,2)
//                             (canvas backing stores, ART.res, ART.sprite.clear), and the #rotate panel ("Turn your device sideways", Play anyway) in portrait at scale < 0.6
//   UI.toStage(clientX, clientY) -> {x, y} in stage px          UI.frame(now) called by GAME's single rAF loop        UI.setClock(nowMs) re-aligns dt to a virtual clock
//   UI.perf(on)               the ?perf=1 frame-time overlay
// SETTINGS    UI.opt (stable object: reduceMotion shake textScale speed fastAnim damageNumbers colorblind quality)   UI.applySettings()   UI.getSetting(k)
//   UI.setSetting(k, v)       META.set + save + applySettings         UI.cycleSpeed() -> 0|1|2 (the combat Z key)
//   applySettings sets --ts on #stage, body classes reduce-motion / colorblind / low, ART.tk.opt, SCENE.speed(k), AUDIO.setVolume, AUDIO.options. quality 'auto' drops to low
//   when the 2 s average frame time is above 24 ms.
// SCREENS     UI.screens {}   UI.go(name, params, {transition:'page'|'ink'|'fade'|'none', force}) -> Promise   UI.back()   UI.current (the screen object)
//   UI.currentName  UI.params  UI.epoch  UI.live() -> () => bool   UI.after(ms, fn)  UI.tween(obj, {k: v}, ms, ease, onUpdate) -> Promise
//   UI.canvasOn(type, fn(e, stagePoint), {passive, always})   UI.onKey(fn(e) -> true when handled, {overlay}) -> off   UI.transition(kind, midFn) -> Promise
//   A screen is {enter(params, root), leave?, update?(dt, t), draw?(ctx, t), onKey?(e), music?: id | (params) => id | null, pausable?: bool, transition?: kind}, called
//   with `this` = the screen object. enter may return a promise (waited for at most 4 s). helpers registered while a screen is current are disposed at leave.
//   go is serialised, drops a repeat of the same name + params within 400 ms (force overrides), shows a tidy "still being written" page with Back for an
//   unregistered name, and turns a throwing enter / update / draw into the error modal ("Something tore the page") plus window.__errors.
//   UI.run (getter) / UI.setRun(R): the current run, set by GAME; every route also passes params.R.        UI.hooks.toTitle: GAME installs its toTitle here.
//   Esc: closes the top overlay, else reaches screen.onKey, else opens the pause overlay on map, combat, reward, shop, event, camp, forge, chest, gemcache.
//   Enter and Space activate role=button elements, arrows move focus spatially. Every UI animation runs on the frame clock, so GAME.debug.tick is exact; with
//   window.__HEADLESS tween / after / transition resolve on the next microtask.
// OVERLAYS    UI.overlays {}   UI.overlay.open(name, params) -> Promise<result>   .close(result?) .top() .count() .has(name) .closeAll(result?)
//   UI.modal({title, body: string|Node, html?, buttons:[{label, kind, cb, result}], dismiss}) -> close fn      UI.confirm({title, body, yes, no, danger}) -> Promise<bool>
//   An overlay is {open(params, root, close), close?(root, result), dismiss?: false, cancelResult?}; the root is a `.overlay.o-NAME` flex box over a dim backdrop and
//   the screen behind is inert while it is open. Esc and a press that starts on the backdrop dismiss with cancelResult unless dismiss is false (also settable per call).
//   Built in here: modal, confirm, cardPick {title, cards, n, optional, confirm} -> [uid], legend, relics, deck (basic viewer), settings. main.js adds pause.
// FEEDBACK    UI.toast(text, kind 'info'|'good'|'bad'|'warn'|'achievement', {persist, id, ms}) -> {close, el}   UI.floatText(x, y, text, kind)   UI.pulse(el)   UI.shake(el)
//   UI.announce(text) writes the aria-live region        UI.anchorEl(selector | anchor name) -> el|null        UI.menuButton() -> the 56 px pause button
// TOOLTIPS    UI.tip.attach(el, () => html|Node|null, {side, follow, wide, delay}) -> off (mouse hover after 70 ms, touch long press 400 ms, closes on pointerup)
//   UI.tip.show(content, {x0,y0,x1,y1}, opts)   UI.tip.showFor(el, content, opts)   UI.tip.hide()   UI.tip.open   UI.tip.card(inst, {x, y, size, scale}) big preview + glossary
//   UI.tip.swallowClick(el, ms) -> off: a long press that opened a tip must not also act, but a touch browser still sends the click when the finger lifts. attach arms this
//   itself after a long press showed its tip; a screen with its own press preview (the shop shelf) arms it on pointerup. One-shot, capture phase, only for a click inside el
//   within ms (default 600) of arming, and cancelled by the next pointerdown anywhere, so a later mouse or keyboard click is never lost.
//   A tip whose anchor leaves the page (a screen rebuilt under the pointer) is hidden at once and never opens for a detached anchor.
//   UI.tip.kw(word, n) -> Node|null   UI.tip.status(id, n)   UI.tip.info(word, n) -> {key, name, text, kind, status} | null (DATA.keywords and DATA.statuses, by key or name)
//   `.kw[data-kw]` spans inside card text open glossary bubbles on hover or long press by themselves.
// COMPONENTS  UI.card(inst | id, {size:'mini'|'deck'|'hand'|'reward'|'big', unit, C, selected, disabled, playable, showGems, onclick, class, tip}) -> el
//     el.rbUpdate({unit, C, inst, refresh, selected, disabled, playable}) or UI.cardUpdate(el, patch): live numbers and glows; classes a screen adds survive.
//     Given C (and neither disabled nor playable) the card dims itself from C.canPlay. Classes: card c-SIZE t-TYPE r-RARITY h-HERO up sel dis play junk nocost x-cost.
//     Parts: .c-in > .c-face (.c-head .c-name, .c-art canvas, .c-type, .c-text .c-rules) .c-cost .c-socks .c-sock. el.rbResolved is the DATA.resolveCard result.
//   UI.cardBack(size)   UI.relic(id, {size:'xs'|'sm'|'md'|'lg', onclick, tip})   UI.gem(id, {size, selected, onclick, tip})   UI.status(id, n, {size, tip}) (el.rbSet(n))
//   UI.heroBadge(heroId, {size:'sm'|'md'|'lg', hp, maxHp, selected, onclick}) (el.rbSet({hp, maxHp, selected}))   UI.stat(kind, value, {size, max, tip}) (el.rbSet(v, {animate, max}))
//   UI.btn(label, {kind:'primary'|'secondary'|'ghost', size:'sm'|'lg', icon, key, disabled, reason, sfx, breathe, danger, tip, onclick}) (a soft aria-disabled state: click gives
//     the reason as a toast and ui_error; el.rbSet({label, disabled, reason}))   UI.setDisabled(el, on, reason)
//   UI.panel({kind:'paper'|'dark', torn, gold, title, class}, ...children) -> el with .body      UI.hanko(text, {size})   UI.divider()   UI.bar(v, max, 'hp'|'ink'|'xp'|'boss')
//   UI.tabs(items, {value, onchange})   UI.seg(items, {value, onchange})   UI.toggle({value, onchange})   UI.slider({min, max, step, value, onchange, format})   UI.settingsPanel()
//   UI.icon(kind, id, size, opts) canvas   UI.medallion(heroId, size) canvas   UI.vars(el, {'--x': v}) (setProperty; assigning style['--x'] does nothing in a browser)
//   UI.resolveCard(inst, ctx)   UI.plain(html)   UI.el = U.el   UI.esc
// UI.bus = U.bus() emits 'screen' {name, params} after every enter and 'overlay' {name, open}. ART, AUDIO, META and SCENE are only ever reached through typeof checks,
// so every component works with any of them missing (placeholder painters, silent audio); a throwing ART call is caught and warned once.
const UI = (() => {
  'use strict';

  // ==================================================================================================================
  // small helpers
  // ==================================================================================================================
  const W = 1280, H = 720;
  const clamp = U.clamp;
  const $id = (id) => document.getElementById(id);
  const mk = (tag, props, ...kids) => U.el(tag, props, ...kids);
  const isHeadless = () => !!window.__HEADLESS;
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : 0);
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { return dflt; } };
  // Later waves (or a bare test page) may not define these namespaces yet: never touch them except through these accessors.
  const AR = () => (typeof ART !== 'undefined' ? ART : null);
  const AU = () => (typeof AUDIO !== 'undefined' ? AUDIO : null);
  const ME = () => (typeof META !== 'undefined' ? META : null);
  // hygiene-allow(layers): SCENE loads after ui.js; applySettings reaches it at call time only, DESIGN 5.8
  const SC = () => (typeof SCENE !== 'undefined' ? SCENE : null);
  const isFn = (o, name) => !!o && typeof o[name] === 'function';
  const warned = {};
  const warnOnce = (key, msg, e) => {
    if (warned[key]) return;
    warned[key] = true;
    console.warn('[ui] ' + msg + (e ? ': ' + (e.message || e) : ''));
  };
  const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : '');
  const px2 = (n) => Math.round(n * 100) / 100;

  // Every error the UI catches lands here (tools/rogue_book/shot.mjs reads window.__errors) and in the console.
  function logError(where, e) {
    const err = e && e.message !== undefined ? e : new Error(String(e));
    try { (window.__errors || (window.__errors = [])).push({ screen: where, message: String(err.message), stack: String(err.stack || '') }); } catch (x) { /* nothing */ }
    console.error('[ui] ' + where + ': ' + err.message + (err.stack ? '\n' + err.stack : ''));
    return err;
  }

  // ------------------------------------------------------------------------------------------------------------------
  // state
  // ------------------------------------------------------------------------------------------------------------------
  const S = {
    inited: false, wrap: null, stage: null, view: null, over: null, sr: null, vctx: null, octx: null,
    scale: 1, px: 1, ox: 0, oy: 0, vw: W, vh: H,
    clock: { last: null, t: 0, ms: 0 },
    cur: null, epoch: 0, queue: [], busy: false, lastGo: { key: '', at: -1e9 }, history: [],
    overlays: [], ovSeq: 0,
    tweens: [], timers: [], timerSeq: 0,
    keyHandlers: [], keySeq: 0,
    trans: null, tq: Promise.resolve(), overDirty: false, transCount: 0,
    rotate: null, rotating: false, playAnyway: false, fullscreenTried: false,
    frameAcc: 0, frameN: 0, qualityDropped: false, osReduce: false,
    fit: [], srFlip: false, errShown: {}, run: null, hooks: {},
    perf: null, perfAcc: 0, perfFrames: 0, perfLast: 0,
    audioArmed: false, tipTimer: 0,
  };

  const UI_OPT = { reduceMotion: false, reduceMotionSetting: null, shake: 1, textScale: 1, speed: 1, fastAnim: 0, damageNumbers: true, colorblind: false, quality: 'high', qualitySetting: 'auto' };

  // ==================================================================================================================
  // stage, scaling, DOM scaffolding
  // ==================================================================================================================
  const LAYER_IDS = ['view', 'screens', 'overlays', 'over', 'tips', 'toasts'];
  const layers = {};

  // index.html declares every layer; a test page or gallery that does not gets a minimal scaffold so UI never crashes.
  function ensureDom() {
    const body = document.body;
    let wrap = $id('wrap'), stage = $id('stage');
    if (!wrap) { wrap = mk('div', { id: 'wrap' }); body.appendChild(wrap); }
    if (!stage) { stage = mk('div', { id: 'stage' }); wrap.appendChild(stage); }
    LAYER_IDS.forEach((id) => {
      let e = $id(id);
      if (!e) {
        e = mk(id === 'view' || id === 'over' ? 'canvas' : 'div', { id, width: id === 'view' || id === 'over' ? W : undefined, height: id === 'view' || id === 'over' ? H : undefined });
        stage.appendChild(e);
      }
      layers[id] = e;
    });
    if (!$id('sr')) wrap.appendChild(mk('div', { id: 'sr', role: 'status', 'aria-live': 'polite' }));
    S.wrap = wrap; S.stage = stage; S.view = layers.view; S.over = layers.over; S.sr = $id('sr');
    S.vctx = safe(() => S.view.getContext('2d'), null);
    S.octx = safe(() => S.over.getContext('2d'), null);
  }

  function ensureInit() { if (!S.inited) api.init(); }

  function viewportSize() {
    const vv = window.visualViewport;
    const zoomed = !!(vv && vv.scale && vv.scale > 1.02);
    let vw = (vv && vv.width) || window.innerWidth || W;
    let vh = (vv && vv.height) || window.innerHeight || H;
    if (zoomed) { vw = S.vw; vh = S.vh; }                 // the user pinch-zoomed the page: leave the stage where it is
    return { vw: Math.max(1, vw), vh: Math.max(1, vh), zoomed };
  }

  // Where the pointer is on the 1280 x 720 stage. Uses our own transform state, so it is exact and testable headless.
  function toStage(clientX, clientY) {
    return { x: (clientX - S.ox) / S.scale, y: (clientY - S.oy) / S.scale };
  }

  // ==================================================================================================================
  // settings
  // ==================================================================================================================
  function getSetting(k) {
    let v;
    try { const m = ME(); if (isFn(m, 'get')) v = m.get(k); } catch (e) { v = undefined; }
    if (v === undefined) { const d = DATA.SETTINGS && DATA.SETTINGS[k]; v = d ? d.def : undefined; }
    return typeof DATA.cleanSetting === 'function' ? DATA.cleanSetting(k, v) : v;
  }

  const SPEEDS = [1, 1.6, 2.5];

  function applySettings() {
    const o = UI_OPT;
    const rm = getSetting('reduceMotion');
    o.reduceMotionSetting = rm;
    o.reduceMotion = rm === null || rm === undefined ? !!S.osReduce : !!rm;
    o.shake = getSetting('shake');
    o.textScale = getSetting('textScale');
    o.fastAnim = getSetting('fastAnim');
    o.speed = SPEEDS[o.fastAnim] || 1;
    o.damageNumbers = getSetting('damageNumbers');
    o.colorblind = !!getSetting('colorblind');
    o.qualitySetting = getSetting('quality');
    o.quality = o.qualitySetting === 'auto' ? (S.qualityDropped ? 'low' : 'high') : o.qualitySetting;
    if (S.stage) S.stage.style.setProperty('--ts', String(o.textScale));
    const body = safe(() => document.body, null);
    if (body) {
      body.classList.toggle('reduce-motion', o.reduceMotion);
      body.classList.toggle('colorblind', o.colorblind);
      body.classList.toggle('low', o.quality === 'low');
    }
    const ar = AR();
    if (ar && ar.tk) {
      if (ar.tk.opt && typeof ar.tk.opt === 'object') { ar.tk.opt.reduceMotion = o.reduceMotion; ar.tk.opt.quality = o.quality; }
      else ar.tk.opt = { reduceMotion: o.reduceMotion, quality: o.quality };
    }
    const sc = SC();
    if (isFn(sc, 'speed')) safe(() => sc.speed(o.speed));
    const au = AU();
    if (isFn(au, 'setVolume')) safe(() => { au.setVolume('music', getSetting('musicVol')); au.setVolume('sfx', getSetting('sfxVol')); });
    if (isFn(au, 'options')) safe(() => au.options({ calm: !!o.reduceMotion, lite: o.quality === 'low' }));
    return o;
  }

  function setSetting(k, v) {
    try { const m = ME(); if (isFn(m, 'set')) { m.set(k, v); if (isFn(m, 'save')) m.save(); } } catch (e) { warnOnce('set:' + k, 'could not store setting ' + k, e); }
    return applySettings();
  }

  function cycleSpeed() {
    const next = (getSetting('fastAnim') + 1) % 3;
    setSetting('fastAnim', next);
    api.toast('Speed x' + SPEEDS[next], 'info');
    return next;
  }

  // ==================================================================================================================
  // resize
  // ==================================================================================================================
  function resize() {
    if (!S.inited) { ensureDom(); }
    const m = viewportSize();
    const { vw, vh } = m;
    S.vw = vw; S.vh = vh;
    const scale = Math.max(0.05, Math.min(vw / W, vh / H));
    S.scale = scale;
    S.ox = px2((vw - W * scale) / 2);
    S.oy = px2((vh - H * scale) / 2);
    const st = S.stage;
    st.style.transform = 'translate(' + S.ox + 'px, ' + S.oy + 'px) scale(' + px2(scale * 10000) / 10000 + ')';
    st.style.setProperty('--scale', String(px2(scale * 10000) / 10000));
    st.classList.toggle('compact', scale < 0.75);
    const dpr = window.devicePixelRatio || 1;
    const pxNew = clamp(scale * dpr, 1, 2);
    if (Math.abs(pxNew - S.px) > 0.001 || S.view.width !== Math.round(W * pxNew)) {
      S.px = pxNew;
      [S.view, S.over].forEach((c) => { c.width = Math.round(W * pxNew); c.height = Math.round(H * pxNew); });
      const ar = AR();
      if (ar) { ar.res = pxNew; if (isFn(ar.sprite, 'clear')) safe(() => ar.sprite.clear()); }
      iconCache.clear();
    }
    api.scale = S.scale; api.px = S.px; api.ox = S.ox; api.oy = S.oy;
    checkRotate();
  }

  // ---- portrait: there is no portrait layout, so a friendly panel asks the player to turn the device
  function wantsRotate() {
    const iw = window.innerWidth || W, ih = window.innerHeight || H;
    return ih > iw * 1.1 && S.scale < 0.6;
  }

  function buildRotate() {
    const play = mk('button', { class: 'btn btn-secondary', type: 'button', text: 'Play anyway' });
    const full = mk('button', { class: 'btn btn-primary', type: 'button', text: 'Full screen and rotate' });
    play.addEventListener('click', () => { S.playAnyway = true; checkRotate(); });
    full.addEventListener('click', () => {
      // the orientation lock only works in fullscreen, and only after a tap: try, and never complain
      if (S.fullscreenTried) return;
      S.fullscreenTried = true;
      safe(() => {
        const de = document.documentElement;
        const p = de.requestFullscreen ? de.requestFullscreen() : null;
        const lock = () => { if (window.screen && window.screen.orientation && window.screen.orientation.lock) return window.screen.orientation.lock('landscape'); return null; };
        if (p && p.then) p.then(lock, () => {}).then(() => {}, () => {}); else lock();
      });
    });
    const book = mk('div', { class: 'rot-book', 'aria-hidden': 'true' }, mk('i', { class: 'rp rp1' }), mk('i', { class: 'rp rp2' }), mk('i', { class: 'rp rp3' }), mk('i', { class: 'rot-phone' }));
    return mk('div', { id: 'rotate', role: 'alertdialog', 'aria-label': 'Turn your device sideways', hidden: true },
      mk('div', { class: 'rot-card' }, book,
        mk('h2', { text: 'Turn your device sideways' }),
        mk('p', { text: 'Echowake is a landscape journey. Rotate your phone and the land will open wide.' }),
        mk('div', { class: 'rot-btns' }, full, play)));
  }

  function checkRotate() {
    const want = wantsRotate();
    if (!want) S.playAnyway = false;                         // rotating back resets the choice
    const show = want && !S.playAnyway;
    if (show && !S.rotate) { S.rotate = buildRotate(); S.wrap.appendChild(S.rotate); }
    if (S.rotate) S.rotate.hidden = !show;
    if (show !== S.rotating) {
      S.rotating = show;
      const au = AU();
      if (au) safe(() => (show ? isFn(au, 'suspend') && au.suspend() : isFn(au, 'resume') && au.resume()));
      if (!show) S.clock.last = null;                         // no dt spike when the game wakes up
    }
  }

  // ==================================================================================================================
  // init: DOM listeners, audio arming, visibility, settings
  // ==================================================================================================================
  function init() {
    if (S.inited) return;
    ensureDom();
    S.inited = true;
    api.layers = layers;
    api.stageEl = S.stage;
    S.osReduce = !!safe(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, false);
    const mq = safe(() => window.matchMedia('(prefers-reduced-motion: reduce)'), null);
    if (mq && mq.addEventListener) mq.addEventListener('change', (e) => { S.osReduce = !!e.matches; applySettings(); });
    applySettings();
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', onResize); window.visualViewport.addEventListener('scroll', onResize); }
    document.addEventListener('visibilitychange', () => {
      S.clock.last = null;
      const au = AU();
      if (document.hidden) { if (isFn(au, 'suspend')) safe(() => au.suspend()); }
      else if (isFn(au, 'resume') && !S.rotating) safe(() => au.resume());
    });
    // audio may only start inside a user gesture
    const arm = () => {
      if (S.audioArmed) return;
      S.audioArmed = true;
      document.removeEventListener('pointerdown', arm, true);
      document.removeEventListener('keydown', arm, true);
      const au = AU();
      if (isFn(au, 'init')) safe(() => au.init());
      if (isFn(au, 'resume')) safe(() => au.resume());
    };
    document.addEventListener('pointerdown', arm, true);
    document.addEventListener('keydown', arm, true);
    document.addEventListener('keydown', onKeyDown);
    installDelegates();
  }

  // ==================================================================================================================
  // clock, timers, tweens
  // ==================================================================================================================
  // Every UI animation runs on the frame clock (UI.frame), never on wall-clock timers, so GAME.debug.tick is deterministic.
  function register(rec, off) { if (rec) rec.offs.push(off); return off; }

  function addTimer(ms, fn, rec) {
    const t = { at: S.clock.ms + Math.max(0, ms), fn, id: ++S.timerSeq, dead: false };
    S.timers.push(t);
    const off = () => { t.dead = true; };
    if (rec) rec.offs.push(off);
    return off;
  }

  function runTimers() {
    if (!S.timers.length) return;
    const due = S.timers.filter((t) => !t.dead && t.at <= S.clock.ms).sort((a, b) => a.at - b.at || a.id - b.id);
    due.forEach((t) => { t.dead = true; try { t.fn(); } catch (e) { logError('timer', e); } });
    S.timers = S.timers.filter((t) => !t.dead);
  }

  function after(ms, fn) {
    const rec = S.cur;
    if (isHeadless()) {
      let dead = false;
      Promise.resolve().then(() => { if (!dead && (!rec || S.cur === rec)) { try { fn(); } catch (e) { logError('after', e); } } });
      return register(rec, () => { dead = true; });
    }
    return addTimer(ms, fn, rec);
  }

  // like after(), but survives screen changes and is never short-circuited headless (toasts, floats, tooltips)
  function afterGlobal(ms, fn) { return addTimer(ms, fn, null); }

  function tween(obj, to, ms, ease, onUpdate) {
    const rec = S.cur;
    const fn = typeof ease === 'function' ? ease : (U.ease[ease || 'outQuad'] || U.ease.outQuad);
    const keys = Object.keys(to || {});
    return new Promise((resolve) => {
      const tw = { obj, keys, to, from: {}, ms: Math.max(1, ms || 1), t: 0, fn, onUpdate, resolve, dead: false };
      keys.forEach((k) => { tw.from[k] = Number(obj[k]) || 0; });
      if (isHeadless()) {
        keys.forEach((k) => { obj[k] = to[k]; });
        if (onUpdate) safe(() => onUpdate(obj, 1));
        Promise.resolve().then(resolve);
        return;
      }
      S.tweens.push(tw);
      register(rec, () => { if (!tw.dead) { tw.dead = true; resolve(); } });
    });
  }

  function runTweens(dt) {
    if (!S.tweens.length) return;
    const ms = dt * 1000;
    S.tweens.forEach((tw) => {
      if (tw.dead) return;
      tw.t += ms;
      const p = clamp(tw.t / tw.ms, 0, 1), e = tw.fn(p);
      tw.keys.forEach((k) => { tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e; });
      if (tw.onUpdate) { try { tw.onUpdate(tw.obj, p); } catch (x) { logError('tween', x); tw.dead = true; tw.resolve(); return; } }
      if (p >= 1) { tw.keys.forEach((k) => { tw.obj[k] = tw.to[k]; }); tw.dead = true; tw.resolve(); }
    });
    S.tweens = S.tweens.filter((tw) => !tw.dead);
  }

  // ==================================================================================================================
  // the frame
  // ==================================================================================================================
  function frame(nowMs) {
    ensureInit();
    if (S.rotating) { S.clock.last = nowMs; return; }
    const c = S.clock;
    if (c.last === null || nowMs < c.last) c.last = nowMs;
    const raw = nowMs - c.last;
    c.last = nowMs;
    const dt = clamp(raw / 1000, 0, 0.05);
    c.t += dt; c.ms += dt * 1000;
    trackQuality(raw);
    runTimers();
    runTweens(dt);
    if (tipS.owner && tipS.el && tipS.owner.isConnected === false) tipHide();       // the anchor was removed with no pointerleave (a screen or card rebuilt under the pointer): never leave its bubble stuck
    const rec = S.cur;
    if (rec && !rec.dead.update && typeof rec.def.update === 'function') {
      try { rec.def.update(dt, c.t); } catch (e) { rec.dead.update = true; fail(rec.name + '.update', e); }
    }
    const ctx = S.vctx;
    if (ctx) {
      ctx.setTransform(S.px, 0, 0, S.px, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0d0b1e';
      ctx.fillRect(0, 0, W, H);
      if (rec && !rec.dead.draw && typeof rec.def.draw === 'function') {
        ctx.save();
        try { rec.def.draw(ctx, c.t); } catch (e) { rec.dead.draw = true; fail(rec.name + '.draw', e); } finally { ctx.restore(); }
        ctx.setTransform(S.px, 0, 0, S.px, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    drawTransition(dt);
    fitCards();
    if (S.perf) perfTick(raw);
  }

  // quality:'auto' drops to low when the 2 s average frame time is above 24 ms
  function trackQuality(raw) {
    if (raw <= 0 || raw > 250) return;
    S.frameAcc += raw; S.frameN++;
    if (S.frameAcc < 2000) return;
    const avg = S.frameAcc / S.frameN;
    S.frameAcc = 0; S.frameN = 0;
    if (avg > 24 && UI_OPT.qualitySetting === 'auto' && !S.qualityDropped) {
      S.qualityDropped = true;
      applySettings();
    }
  }

  function perfTick(raw) {
    S.perfAcc += raw; S.perfFrames++;
    if (S.perfAcc < 500) return;
    const ms = S.perfAcc / S.perfFrames;
    S.perf.textContent = Math.round(1000 / ms) + ' fps  ' + ms.toFixed(1) + ' ms  q:' + UI_OPT.quality + '  px:' + S.px.toFixed(2);
    S.perfAcc = 0; S.perfFrames = 0;
  }

  function perf(on) {
    ensureInit();
    if (on && !S.perf) { S.perf = mk('div', { class: 'perf', 'aria-hidden': 'true' }); S.stage.appendChild(S.perf); }
    if (!on && S.perf) { S.perf.remove(); S.perf = null; }
  }

  // GAME.debug.tick drives frames with a virtual clock: this aligns dt to it.
  function setClock(nowMs) { S.clock.last = nowMs; }

  // ==================================================================================================================
  // errors: a screen that throws must never brick the game
  // ==================================================================================================================
  function toTitle() {
    if (typeof S.hooks.toTitle === 'function') { safe(() => S.hooks.toTitle()); return; }
    api.go('title', null, { force: true });
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => api.toast('Copied', 'good'), () => api.toast('Could not copy', 'bad')); return true; }
    } catch (e) { /* fall through */ }
    api.toast('Could not copy', 'bad');
    return false;
  }

  function fail(where, e) {
    const err = logError(where, e);
    const key = where + '|' + err.message;
    if (S.errShown[key]) return;
    S.errShown[key] = true;
    try {
      api.modal({
        title: 'Something broke the rhythm',
        body: mk('div', { class: 'm-err' },
          mk('p', { text: 'The music skipped a beat in ' + where + '. Everything up to your last save is safe.' }),
          mk('pre', { class: 'm-pre', text: String(err.message).slice(0, 300) })),
        buttons: [
          { label: 'Back to Title', kind: 'primary', cb: () => { toTitle(); } },
          { label: 'Copy details', kind: 'secondary', cb: () => { copyText(where + ': ' + err.message + '\n' + (err.stack || '')); return false; } },
        ],
        dismiss: true,
      });
    } catch (x) { console.error('[ui] the error modal itself failed: ' + x.message); }
  }

  // ==================================================================================================================
  // screen manager
  // ==================================================================================================================
  const PAUSABLE = { map: 1, combat: 1, reward: 1, shop: 1, event: 1, camp: 1, forge: 1, chest: 1, gemcache: 1 };

  function emit(type, data) {
    try { api.bus.emit(type, data); } catch (e) { logError('bus ' + type, e); }
  }

  function paramKey(p) {
    if (p == null) return '';
    if (typeof p !== 'object') return String(p);
    const out = [];
    Object.keys(p).forEach((k) => {
      const v = p[k];
      if (v == null || typeof v !== 'object') { out.push(k + '=' + (typeof v === 'function' ? 'fn' : String(v))); return; }
      const sub = [];
      Object.keys(v).forEach((k2) => { const w = v[k2]; if (w == null || typeof w !== 'object') sub.push(k2 + '=' + (typeof w === 'function' ? 'fn' : String(w))); });
      out.push(k + '{' + sub.join(',') + '}');
    });
    return out.join('&');
  }

  function raceTimeout(p, ms, label) {
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; warnOnce('to:' + label, label + ' did not settle in ' + ms + ' ms, continuing'); resolve(); } }, ms);
      p.then(() => { if (!done) { done = true; clearTimeout(t); resolve(); } }, (e) => { if (!done) { done = true; clearTimeout(t); logError(label, e); resolve(); } });
    });
  }

  function prettyName(name) {
    return String(name).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  }

  // Shown when a screen that a later wave has not written yet is asked for: tidy, and it always has a way back.
  function soonDef(name) {
    return {
      placeholder: true,
      enter(params, root) {
        const back = api.btn('Back', { kind: 'secondary', onclick: () => api.back() });
        const home = api.btn('Title', { kind: 'ghost', onclick: () => toTitle() });
        const box = api.panel({ kind: 'paper', torn: true, title: prettyName(name), class: 'soon-panel' },
          mk('p', { class: 'soon-text', text: 'This part of the music is still being written.' }),
          mk('div', { class: 'row center gap' }, back, home));
        root.appendChild(mk('div', { class: 'soon' }, box));
      },
    };
  }

  function leaveCurrent() {
    S.epoch++;                                  // from here on no callback of the old screen is live()
    api.epoch = S.epoch;
    const rec = S.cur;
    closeAllOverlays();
    if (api.tip) api.tip.hide();
    if (!rec) return;
    try { if (typeof rec.def.leave === 'function') rec.def.leave.call(rec.def); } catch (e) { logError(rec.name + '.leave', e); }
    rec.offs.splice(0).forEach((off) => safe(off));
    safe(() => rec.root.remove());              // removed even when leave() threw or is missing
    S.cur = null; api.current = null; api.currentName = '';
  }

  async function swapTo(name, def, params) {
    leaveCurrent();
    const root = mk('div', { class: 'screen s-' + name });
    layers.screens.appendChild(root);
    const rec = { name, def, root, params, epoch: S.epoch, offs: [], dead: {} };
    S.cur = rec; api.current = def; api.currentName = name; api.params = params;
    try {
      const r = typeof def.enter === 'function' ? def.enter.call(def, params, root) : undefined;
      if (r && typeof r.then === 'function') await raceTimeout(r, 4000, name + '.enter');
    } catch (e) { rec.dead.update = true; rec.dead.draw = true; fail(name + '.enter', e); }
    return rec;
  }

  function applyMusic(def, params) {
    const au = AU();
    if (!isFn(au, 'music')) return;
    let m = def.music;
    if (typeof m === 'function') m = safe(() => def.music(params));
    if (m === undefined) return;                // undefined keeps whatever plays
    safe(() => au.music(m));
  }

  async function runGo(item) {
    let def = api.screens[item.name];
    if (!def) def = soonDef(item.name);
    S.stage.classList.add('busy');
    const kind = item.opts.transition || def.transition || 'fade';
    let rec = null;
    try {
      await api.transition(kind, async () => { rec = await swapTo(item.name, def, item.params); });
    } finally { S.stage.classList.remove('busy'); }
    if (rec && S.cur === rec) {
      S.history.push({ name: item.name, params: item.params });
      if (S.history.length > 12) S.history.shift();
      applyMusic(def, item.params);
      emit('screen', { name: item.name, params: item.params });
    }
  }

  function pump() {
    if (S.busy) return;
    const item = S.queue.shift();
    if (!item) return;
    S.busy = true;
    runGo(item).catch((e) => fail('UI.go(' + item.name + ')', e)).then(() => { S.busy = false; item.resolve(); pump(); });
  }

  function go(name, params, opts) {
    ensureInit();
    opts = opts || {};
    const key = name + '|' + paramKey(params);
    const t = now();
    if (!opts.force && key === S.lastGo.key && t - S.lastGo.at < 400) return Promise.resolve();   // a double tap
    S.lastGo = { key, at: t };
    return new Promise((resolve) => { S.queue.push({ name, params, opts, resolve }); pump(); });
  }

  function back() {
    const cur = S.history.pop();                 // the screen we are on
    const prev = S.history.pop();
    if (!prev || (cur && prev.name === cur.name && paramKey(prev.params) === paramKey(cur.params))) return go('title', null, { force: true });
    return go(prev.name, prev.params, { force: true });
  }

  function live() { const e = S.epoch; return () => S.epoch === e; }

  function canvasOn(type, fn, opts) {
    ensureInit();
    const h = (e) => {
      if (S.overlays.length && !(opts && opts.always)) return;
      fn(e, toStage(e.clientX, e.clientY));
    };
    S.view.addEventListener(type, h, opts && opts.passive === false ? { passive: false } : undefined);
    const off = () => S.view.removeEventListener(type, h);
    register(S.cur, off);
    return off;
  }

  // ==================================================================================================================
  // transitions: shoji door slide, sound-ring wipe, fade. Painted on #over, driven by the frame clock.
  // ==================================================================================================================
  const DUR = { fade: [220, 260], ink: [420, 480], page: [340, 380] };
  const INK_BLOBS = (() => {
    const r = U.rng(0x1eaf5);
    const out = [];
    for (let i = 0; i < 12; i++) out.push({ x: 40 + r() * 1200, y: 30 + r() * 660, R: 360 + r() * 260, d: r() * 0.4, s: r() * 6.28 });
    return out;
  })();

  function pickTip() {
    const tips = DATA.tips || [];
    if (!tips.length) return null;
    S.transCount++;
    return tips[U.rng(U.hash('tip', S.transCount, S.epoch))() * tips.length | 0];
  }

  function normKind(kind) { return kind === 'page' || kind === 'ink' || kind === 'fade' || kind === 'none' ? kind : 'fade'; }

  function transition(kind, midFn) {
    ensureInit();
    kind = normKind(kind);
    const run = () => new Promise((resolve) => {
      const finishMid = () => Promise.resolve().then(() => (midFn ? midFn() : undefined)).then(() => resolve(), (e) => { logError('transition', e); resolve(); });
      if (isHeadless() || kind === 'none' || !S.octx) { finishMid(); return; }
      const reduce = UI_OPT.reduceMotion;
      const d = reduce ? [75, 75] : DUR[kind];
      S.trans = { kind: reduce ? 'fade' : kind, phase: 'out', t: 0, out: d[0], in: d[1], mid: midFn, resolve, midDone: false, tip: !reduce && kind === 'ink' ? pickTip() : null, hold: kind === 'ink' && !reduce ? 380 : 0 };
    });
    S.tq = S.tq.then(run, run);
    return S.tq;
  }

  function paintFade(ctx, a) {
    ctx.fillStyle = 'rgba(13,11,30,' + clamp(a, 0, 1).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  function paintInk(ctx, cover, seedShift) {
    if (cover <= 0.001) return;
    // sound-ring wipe: each blob centre sends out a night-filled disc with a bright cyan ring edge and two fainter rings trailing inside
    ctx.strokeStyle = '#5ff5ff';
    ctx.lineWidth = 3;
    INK_BLOBS.forEach((b) => {
      const local = clamp((cover - b.d) / (1 - b.d), 0, 1);
      const r = b.R * U.ease.outCubic(local);
      if (r < 2) return;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0d0b1e';
      ctx.fill();
      if (local < 0.98) {
        ctx.globalAlpha = 0.9 * (1 - local * 0.6);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        for (let k = 1; k <= 2; k++) {
          const rr = r - k * 26 - seedShift * 2;
          if (rr < 4) continue;
          ctx.globalAlpha = 0.5 / k;
          ctx.strokeStyle = k === 1 ? '#7a6bff' : '#5ff5ff';
          ctx.beginPath();
          ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#5ff5ff';
      }
    });
    const full = U.smooth((cover - 0.82) / 0.18);
    if (full > 0) paintFade(ctx, full);
  }

  function paintPage(ctx, phase, p) {
    const e = U.ease.inOutQuad(clamp(p, 0, 1));
    // shoji door: out, it slides in from the right and covers the screen; in, it slides away to the left. A lacquer frame round rice-paper panes on a 4 x 3 kumiko grid.
    let x0, x1;
    if (phase === 'out') { x0 = W * (1 - e); x1 = W + 40; } else { x0 = -40; x1 = W * (1 - e); }
    if (x1 <= x0 + 1) return;
    const w = x1 - x0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, w, H);
    ctx.clip();
    ctx.fillStyle = '#1b1430';
    ctx.fillRect(x0, 0, w, H);
    // panes are laid out on the door's full width (W + 40) from its moving leading edge, so the grid travels with the door
    const full = W + 40, left = phase === 'out' ? x0 : x1 - full;
    const cols = 4, rows = 3, m = 14, pw = (full - m * (cols + 1)) / cols, ph = (H - m * (rows + 1)) / rows;
    ctx.fillStyle = '#f1eff5';
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) ctx.fillRect(left + m + c * (pw + m), m + r * (ph + m), pw, ph);
    ctx.strokeStyle = 'rgba(27,20,48,0.35)'; ctx.lineWidth = 1;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const px = left + m + c * (pw + m), py = m + r * (ph + m);
      ctx.beginPath();
      for (let k = 1; k < 3; k++) { ctx.moveTo(px + pw * k / 3, py); ctx.lineTo(px + pw * k / 3, py + ph); ctx.moveTo(px, py + ph * k / 3); ctx.lineTo(px + pw, py + ph * k / 3); }
      ctx.stroke();
    }
    ctx.restore();
    // a shadow on the screen beside the moving edge
    const edge = phase === 'out' ? x0 : x1;
    const sx = phase === 'out' ? edge - 40 : edge;
    const sg = ctx.createLinearGradient(sx, 0, sx + 40, 0);
    if (phase === 'out') { sg.addColorStop(0, 'rgba(13,11,30,0)'); sg.addColorStop(1, 'rgba(13,11,30,0.5)'); }
    else { sg.addColorStop(0, 'rgba(13,11,30,0.5)'); sg.addColorStop(1, 'rgba(13,11,30,0)'); }
    ctx.fillStyle = sg;
    ctx.fillRect(sx, 0, 40, H);
  }

  function paintTip(ctx, text, alpha) {
    if (!text || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px Georgia, "Hiragino Mincho ProN", serif';
    ctx.fillStyle = '#f5c96a';
    ctx.fillText('A NOTE FROM THE ROAD', W / 2, 590);
    ctx.font = 'italic 24px Georgia, "Hiragino Mincho ProN", serif';
    ctx.fillStyle = '#f3e6c8';
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > 780 && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 626 + i * 30));
    ctx.restore();
  }

  function drawTransition(dt) {
    const tr = S.trans, ctx = S.octx;
    if (!ctx) return;
    if (!tr) {
      if (S.overDirty) { ctx.setTransform(S.px, 0, 0, S.px, 0, 0); ctx.clearRect(0, 0, W, H); S.overDirty = false; }
      return;
    }
    tr.t += dt * 1000;
    ctx.setTransform(S.px, 0, 0, S.px, 0, 0);
    ctx.clearRect(0, 0, W, H);
    S.overDirty = true;
    const k = tr.kind;
    const paint = (phase, p) => {
      if (k === 'fade') paintFade(ctx, phase === 'out' ? U.ease.outQuad(p) : 1 - U.ease.outQuad(p));
      else if (k === 'ink') paintInk(ctx, phase === 'out' ? p : 1 - p, phase === 'out' ? 0 : 3);
      else paintPage(ctx, phase, p);
    };
    if (tr.phase === 'out') {
      paint('out', clamp(tr.t / tr.out, 0, 1));
      if (tr.t >= tr.out) {
        tr.phase = 'mid'; tr.t = 0;
        Promise.resolve().then(() => (tr.mid ? tr.mid() : undefined)).then(() => { tr.midDone = true; }, (e) => { logError('transition', e); tr.midDone = true; });
      }
    } else if (tr.phase === 'mid') {
      paintFade(ctx, 1);
      if (tr.tip) paintTip(ctx, tr.tip, clamp(tr.t / 160, 0, 1));
      if (tr.midDone && tr.t >= tr.hold) { tr.phase = 'in'; tr.t = 0; }
    } else {
      paint('in', clamp(tr.t / tr.in, 0, 1));
      if (tr.tip) paintTip(ctx, tr.tip, 1 - clamp(tr.t / (tr.in * 0.6), 0, 1));
      if (tr.t >= tr.in) { S.trans = null; ctx.clearRect(0, 0, W, H); S.overDirty = false; tr.resolve(); }
    }
  }

  // ==================================================================================================================
  // overlays: a stack of panels above the screen. Esc closes the top one; the screen behind is inert while any is open.
  // ==================================================================================================================
  function dismissible(rec) { return !(rec.def.dismiss === false || (rec.params && rec.params.dismiss === false)); }
  function cancelValue(rec) { return rec.params && rec.params.cancelResult !== undefined ? rec.params.cancelResult : rec.def.cancelResult; }

  function refreshInert() {
    const n = S.overlays.length;
    safe(() => { layers.screens.inert = n > 0; if (n) layers.screens.setAttribute('aria-hidden', 'true'); else layers.screens.removeAttribute('aria-hidden'); });
    S.overlays.forEach((r, i) => safe(() => { r.root.inert = i < n - 1; }));
    if (S.stage) S.stage.classList.toggle('has-overlay', n > 0);
  }

  function focusFirst(root) {
    safe(() => {
      const t = root.querySelector('[data-autofocus]') || root.querySelector('button:not([disabled]), [role=button], [tabindex="0"]');
      if (t && t.focus) t.focus();
    });
  }

  function overlayOpen(name, params) {
    ensureInit();
    let def = api.overlays[name];
    let p = params;
    let useName = name;
    if (!def) {
      warnOnce('ov:' + name, 'overlay "' + name + '" is not registered yet');
      def = api.overlays.modal; useName = 'modal';
      p = { title: prettyName(name), body: 'This part of the music is still being written.' };
    }
    const rec = {
      id: ++S.ovSeq, name: useName, def, params: p, offs: [], closed: false, resolve: null,
      root: mk('div', { class: 'overlay o-' + useName, role: 'dialog', 'aria-modal': 'true' }),
      prevFocus: safe(() => document.activeElement, null),
    };
    const promise = new Promise((res) => { rec.resolve = res; });
    layers.overlays.appendChild(rec.root);
    S.overlays.push(rec);
    refreshInert();
    if (api.tip) api.tip.hide();
    // the backdrop dismisses only when the press STARTED on it: dragging a slider out of a panel must not close the overlay
    let downOnRoot = false;
    rec.root.addEventListener('pointerdown', (e) => { downOnRoot = e.target === rec.root; });
    rec.root.addEventListener('click', (e) => { if (e.target === rec.root && (downOnRoot || e.detail === 0) && dismissible(rec)) closeOverlay(rec, cancelValue(rec)); downOnRoot = false; });
    try { def.open.call(def, p, rec.root, (result) => closeOverlay(rec, result)); } catch (e) { logError('overlay ' + useName, e); closeOverlay(rec, undefined); return promise; }
    emit('overlay', { name: useName, open: true });
    if (!rec.closed) focusFirst(rec.root);
    return promise;
  }

  function closeOverlay(rec, result) {
    if (!rec || rec.closed) return;
    rec.closed = true;
    const i = S.overlays.indexOf(rec);
    if (i >= 0) S.overlays.splice(i, 1);
    try { if (typeof rec.def.close === 'function') rec.def.close.call(rec.def, rec.root, result); } catch (e) { logError('overlay close ' + rec.name, e); }
    rec.offs.splice(0).forEach((off) => safe(off));
    S.keyHandlers = S.keyHandlers.filter((h) => h.tag !== rec.id);
    safe(() => rec.root.remove());
    refreshInert();
    if (api.tip) api.tip.hide();
    emit('overlay', { name: rec.name, open: false });
    if (!S.overlays.length && rec.prevFocus && rec.prevFocus.focus && rec.prevFocus !== document.body) safe(() => rec.prevFocus.focus());
    rec.resolve(result);
  }

  function closeAllOverlays(result) { S.overlays.slice().reverse().forEach((r) => closeOverlay(r, result)); }

  const overlay = {
    open: overlayOpen,
    close(result) { const top = S.overlays[S.overlays.length - 1]; if (top) closeOverlay(top, result); },
    top() { const t = S.overlays[S.overlays.length - 1]; return t ? { name: t.name, root: t.root, params: t.params } : null; },
    count() { return S.overlays.length; },
    has(name) { return S.overlays.some((r) => r.name === name); },
    closeAll: closeAllOverlays,
  };

  // ==================================================================================================================
  // keys
  // ==================================================================================================================
  function isTyping(t) {
    if (!t || !t.localName) return false;
    if (t.localName === 'textarea' || t.localName === 'select') return true;
    if (t.localName === 'input') return !/^(button|checkbox|radio|submit)$/.test(t.type);
    return !!t.isContentEditable;
  }

  function onKey(fn, opts) {
    ensureInit();
    const top = S.overlays[S.overlays.length - 1];
    const overlayFlag = !!(opts && opts.overlay);
    const h = { fn, overlay: overlayFlag, id: ++S.keySeq, tag: overlayFlag && top ? top.id : null };
    S.keyHandlers.push(h);
    const off = () => { S.keyHandlers = S.keyHandlers.filter((x) => x !== h); };
    if (h.tag === null) register(S.cur, off); else top.offs.push(off);
    return off;
  }

  const FOCUSABLE = 'button:not([disabled]), [role=button], [tabindex="0"], input:not([disabled]), select:not([disabled])';

  function focusMove(dir, root) {
    root = root || (S.overlays.length ? S.overlays[S.overlays.length - 1].root : layers.screens);
    const items = Array.from(root.querySelectorAll(FOCUSABLE)).filter((e) => !e.hidden && !e.closest('[hidden]') && e.getAttribute('aria-disabled') !== 'true' && e.getBoundingClientRect().width > 0);
    if (!items.length) return null;
    const cur = document.activeElement && items.indexOf(document.activeElement) >= 0 ? document.activeElement : null;
    if (!cur) { items[0].focus(); return items[0]; }
    const cr = cur.getBoundingClientRect(), cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    let best = null, bestScore = Infinity;
    items.forEach((e) => {
      if (e === cur) return;
      const r = e.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy;
      const across = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 1) return;
      const score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = e; }
    });
    if (best) best.focus();
    return best;
  }

  function onKeyDown(e) {
    if (S.rotating) return;
    const t = e.target;
    const top = S.overlays[S.overlays.length - 1] || null;
    const list = S.keyHandlers.slice().reverse();
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (top) { if (!h.overlay) continue; if (h.tag !== null && h.tag !== top.id) continue; }
      let r;
      try { r = h.fn(e); } catch (x) { logError('onKey', x); }
      if (r === true || e.defaultPrevented) return;
    }
    if (isTyping(t)) { if (e.key === 'Escape' && t.blur) t.blur(); return; }
    if (top) {
      if (e.key === 'Escape') { if (dismissible(top)) { e.preventDefault(); closeOverlay(top, cancelValue(top)); } return; }
    } else if (S.cur && typeof S.cur.def.onKey === 'function' && !S.cur.dead.key) {
      let r;
      try { r = S.cur.def.onKey.call(S.cur.def, e); } catch (x) { S.cur.dead.key = true; fail(S.cur.name + '.onKey', x); }
      if (r === true || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        const pausable = S.cur.def.pausable !== undefined ? S.cur.def.pausable : !!PAUSABLE[S.cur.name];
        if (pausable && !S.busy) { e.preventDefault(); overlayOpen('pause'); }
        return;
      }
    } else if (e.key === 'Escape' && S.cur && !S.busy && (S.cur.def.pausable !== undefined ? S.cur.def.pausable : !!PAUSABLE[S.cur.name])) {
      e.preventDefault(); overlayOpen('pause'); return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && t && t.getAttribute && t.getAttribute('role') === 'button' && t.localName !== 'button') { e.preventDefault(); t.click(); return; }
    if (top && e.key === 'Tab' && !top.root.contains(document.activeElement)) { e.preventDefault(); focusFirst(top.root); return; }
    if (/^Arrow(Left|Right|Up|Down)$/.test(e.key)) { if (focusMove(e.key)) e.preventDefault(); }
  }

  // ==================================================================================================================
  // toasts, floating text, pulse and shake
  // ==================================================================================================================
  function announce(text) {
    if (!S.sr) return;
    S.srFlip = !S.srFlip;
    S.sr.textContent = String(text) + (S.srFlip ? ' ' : '');
  }

  function toast(text, kind, opts) {
    ensureInit();
    kind = kind || 'info';
    opts = opts || {};
    const list = layers.toasts;
    if (opts.id) {
      const ex = Array.from(list.children).find((c) => c.dataset && c.dataset.tid === opts.id);
      if (ex) { const tx = ex.querySelector('.t-text'); if (tx) tx.textContent = text; return { close() { ex.remove(); }, el: ex }; }
    }
    const mark = mk('i', { class: 't-mark', 'aria-hidden': 'true' });
    const node = mk('div', { class: 'toast tk-' + kind + (opts.persist ? ' persist' : ''), role: 'status', dataset: opts.id ? { tid: opts.id } : undefined }, mark, mk('span', { class: 't-text', text }));
    let off = null;
    const close = () => { if (off) off(); if (!node.parentNode) return; if (isHeadless()) node.remove(); else { node.classList.add('out'); afterGlobal(240, () => node.remove()); } };
    if (opts.persist) node.appendChild(mk('button', { class: 'toast-x', type: 'button', 'aria-label': 'Dismiss', text: 'x', onclick: close }));
    list.appendChild(node);
    const shown = Array.from(list.children).filter((c) => !c.classList.contains('out') && !c.classList.contains('persist'));
    while (shown.length > 4) { const old = shown.shift(); old.remove(); }
    if (!opts.persist) off = afterGlobal(opts.ms || (kind === 'achievement' ? 4200 : 2600), close);
    announce(text);
    return { close, el: node };
  }

  function floatText(x, y, text, kind) {
    ensureInit();
    const f = mk('div', { class: 'float f-' + (kind || 'info'), text: String(text), style: { left: px2(x) + 'px', top: px2(y) + 'px' } });
    layers.tips.appendChild(f);
    f.addEventListener('animationend', () => f.remove());
    afterGlobal(1500, () => f.remove());
    return f;
  }

  function retrigger(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;                        // restart the CSS animation
    el.classList.add(cls);
    afterGlobal(ms, () => el.classList.remove(cls));
  }
  function pulse(el) { retrigger(el, 'pulse', 520); }
  function shake(el) {
    if (UI_OPT.reduceMotion || UI_OPT.shake === 0) { retrigger(el, 'flash-bad', 260); return; }
    retrigger(el, 'shake', 380);
  }

  function anchorEl(sel) {
    if (!sel) return null;
    const s = DATA.LISTS.tutAnchors.indexOf(sel) >= 0 ? '[data-tut="' + sel + '"]' : sel;
    const roots = [layers.overlays, layers.screens, layers.tips];
    for (let i = 0; i < roots.length; i++) { const f = safe(() => roots[i].querySelector(s), null); if (f) return f; }
    return null;
  }

  // ==================================================================================================================
  // icons: ART.icon.draw into small cached sprites, copied into DOM canvases. A missing or throwing ART never breaks a screen.
  // ==================================================================================================================
  const iconCache = new Map();
  const GEM_CSS = { red: '#e8383d', blue: '#5fb4ff', green: '#3fd6b0', gold: '#f5c96a', any: '#f3e6c8' };
  const STAT_CSS = { gold: '#f5c96a', ink: '#7a6bff', hp: '#e8383d', energy: '#5ff5ff', brush: '#3fd6b0', inkstone: '#8a86a8', block: '#5fb4ff' };
  const KIND_CSS = { buff: '#f5c96a', debuff: '#b0245c', resource: '#5fb4ff' };
  const RARITY_CSS = { common: '#b9ad8a', uncommon: '#c6d0e6', rare: '#f5c96a', boss: '#e8383d', shop: '#3fd6b0', starter: '#b9ad8a', token: '#8a86a8' };
  const PALETTE_CSS = { rose: '#ff7eb6', crimson: '#e8383d', amber: '#ff9a2e', gold: '#f5c96a', jade: '#3fd6b0', teal: '#2fb8b0', azure: '#5fb4ff', indigo: '#3b2a7a', violet: '#7a6bff', ink: '#241a3a', moon: '#dfe8ff', ash: '#8a86a8' };

  // engraved glyphs so colour is never the only signal: sword, shield, leaf, star, prism ring
  function glyph(ctx, name, x, y, r) {
    ctx.save();
    ctx.strokeStyle = 'rgba(20,15,46,0.85)'; ctx.fillStyle = 'rgba(255,248,240,0.92)'; ctx.lineWidth = Math.max(1, r * 0.22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (name === 'red') { ctx.moveTo(x - r * 0.6, y + r * 0.6); ctx.lineTo(x + r * 0.6, y - r * 0.6); ctx.moveTo(x - r * 0.15, y + r * 0.05); ctx.lineTo(x + r * 0.15, y + r * 0.35); ctx.stroke(); }
    else if (name === 'blue') { ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x + r * 0.6, y - r * 0.4); ctx.lineTo(x + r * 0.5, y + r * 0.2); ctx.quadraticCurveTo(x, y + r * 0.8, x, y + r * 0.8); ctx.quadraticCurveTo(x, y + r * 0.8, x - r * 0.5, y + r * 0.2); ctx.lineTo(x - r * 0.6, y - r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (name === 'green') { ctx.moveTo(x - r * 0.6, y + r * 0.5); ctx.quadraticCurveTo(x - r * 0.5, y - r * 0.6, x + r * 0.6, y - r * 0.6); ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.5, x - r * 0.6, y + r * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (name === 'gold') { for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r * 0.3 : r * 0.75; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else { ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  function fallbackIcon(ctx, kind, id, x, y, size, opts) {
    opts = opts || {};
    const r = size * 0.42;
    ctx.save();
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.strokeStyle = '#140f2e';
    let fill = '#8a86a8', label = '';
    if (kind === 'gem') {
      const slot = String(id).indexOf('slot:') === 0;
      const col = slot ? String(id).slice(5) : (DATA.gems[id] ? DATA.gems[id].color : 'any');
      fill = GEM_CSS[col] || '#f3e6c8';
      ctx.globalAlpha = slot ? 0.35 : 1;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.85, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.85, y); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      glyph(ctx, col, x, y, r * 0.75);
      ctx.restore();
      return;
    }
    if (kind === 'stat') { fill = STAT_CSS[id] || fill; label = String(id)[0] || ''; }
    else if (kind === 'status') { const st = DATA.statuses[id]; fill = KIND_CSS[st ? st.kind : 'buff'] || fill; label = String(id)[0] || ''; }
    else if (kind === 'relic') { const rl = DATA.relics[id]; fill = RARITY_CSS[rl ? rl.rarity : 'common']; label = String(id)[0] || ''; }
    else if (kind === 'type') { fill = { attack: '#e8383d', skill: '#5fb4ff', power: '#f5c96a', curse: '#7a6bff', status: '#8a86a8' }[id] || fill; label = String(id)[0] || ''; }
    else { label = String(id)[0] || ''; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#140f2e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.round(size * 0.44) + 'px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(label.toUpperCase(), x, y + size * 0.02);
    if (opts.n !== undefined && opts.n !== null) { ctx.fillStyle = '#fff8f0'; ctx.fillText(String(opts.n), x + r * 0.7, y + r * 0.7); }
    ctx.restore();
  }

  function drawIcon(ctx, kind, id, x, y, size, opts) {
    const ar = AR();
    if (ar && isFn(ar.icon, 'draw')) {
      try { ar.icon.draw(ctx, kind, id, x, y, size, opts || {}); return; } catch (e) { warnOnce('icon:' + kind, 'ART.icon.draw threw for ' + kind + ':' + id, e); }
    }
    fallbackIcon(ctx, kind, id, x, y, size, opts);
  }

  function optKey(o) { return o ? (o.dim ? 'd' : '') + (o.glow ? 'g' : '') + (o.on ? 'o' : '') + (o.done ? 'x' : '') + (o.color || '') + (o.n !== undefined && o.n !== null ? 'n' + o.n : '') : ''; }

  function offscreen(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * S.px)); c.height = Math.max(1, Math.round(h * S.px));
    const g = c.getContext('2d');
    g.setTransform(S.px, 0, 0, S.px, 0, 0);
    return { c, g };
  }

  function iconSprite(kind, id, size, opts) {
    const key = kind + '|' + id + '|' + size + '|' + S.px.toFixed(2) + '|' + optKey(opts);
    let spr = iconCache.get(key);
    if (spr) return spr;
    const o = offscreen(size, size);
    drawIcon(o.g, kind, id, size / 2, size / 2, size, opts);
    if (iconCache.size > 700) iconCache.delete(iconCache.keys().next().value);
    iconCache.set(key, o.c);
    return o.c;
  }

  // a DOM canvas that shows the icon; sized in stage px, backed at UI.px
  function iconCanvas(kind, id, size, opts, cls) {
    const spr = iconSprite(kind, id, size, opts);
    const c = mk('canvas', { class: 'ico' + (cls ? ' ' + cls : ''), width: spr.width, height: spr.height, style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' });
    safe(() => c.getContext('2d').drawImage(spr, 0, 0));
    return c;
  }

  // round hero face: ART.hero.medallion (x,y = centre), or a coloured disc with the initial
  function medalCanvas(heroId, size) {
    const key = 'medal|' + heroId + '|' + size + '|' + S.px.toFixed(2);
    let spr = iconCache.get(key);
    if (!spr) {
      const o = offscreen(size, size);
      let ok = false;
      const ar = AR();
      if (ar && isFn(ar.hero, 'medallion')) { try { ar.hero.medallion(o.g, heroId, size / 2, size / 2, size / 2 - 1); ok = true; } catch (e) { warnOnce('medal', 'ART.hero.medallion threw', e); } }
      if (!ok) {
        const h = DATA.heroes[heroId] || { color: '#8a86a8', name: '?' };
        o.g.beginPath(); o.g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); o.g.fillStyle = h.color; o.g.fill();
        o.g.fillStyle = '#140f2e'; o.g.textAlign = 'center'; o.g.textBaseline = 'middle'; o.g.font = '900 ' + Math.round(size * 0.5) + 'px Georgia, serif';
        o.g.fillText(String(h.name)[0], size / 2, size / 2 + 1);
      }
      spr = o.c; iconCache.set(key, spr);
    }
    const c = mk('canvas', { class: 'ico medal-c', width: spr.width, height: spr.height, style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' });
    safe(() => c.getContext('2d').drawImage(spr, 0, 0));
    return c;
  }

  function vars(el, map) { Object.keys(map).forEach((k) => el.style.setProperty(k, String(map[k]))); return el; }

  // ==================================================================================================================
  // glossary and tooltips: manga speech bubbles
  // ==================================================================================================================
  const KIND_LABEL = { buff: 'Buff', debuff: 'Debuff', resource: 'Resource', keyword: 'Keyword' };

  // word is a key of DATA.keywords or DATA.statuses, or a display name ("Front row", "Poison")
  function kwInfo(word, n) {
    if (word == null) return null;
    const raw = String(word);
    const key = raw.toLowerCase().replace(/[^a-z]/g, '');
    let d = DATA.keywords[raw] || DATA.keywords[key];
    if (d) return { key: DATA.keywords[raw] ? raw : key, name: d.name, text: d.text, kind: 'keyword', status: false };
    d = DATA.statuses[raw] || DATA.statuses[key];
    if (d) {
      const id = DATA.statuses[raw] ? raw : key;
      let text = d.text;
      if (n !== undefined && n !== null && typeof DATA.statusText === 'function') {
        const t = safe(() => DATA.statusText(id, n), null);
        // statusText reads "Poison 4: At the start...": the bubble title already says that, so drop the prefix
        if (t) text = t.indexOf(':') > 0 && t.indexOf(d.name) === 0 && t.indexOf(':') < d.name.length + 5 ? t.slice(t.indexOf(':') + 1).trim() : t;
      }
      return { key: id, name: d.name, text, kind: d.kind, status: true, stack: d.stack, hero: d.hero };
    }
    const lower = raw.toLowerCase();
    const k2 = Object.keys(DATA.keywords).find((k) => DATA.keywords[k].name.toLowerCase() === lower);
    if (k2) return kwInfo(k2);
    const s2 = Object.keys(DATA.statuses).find((k) => DATA.statuses[k].name.toLowerCase() === lower);
    if (s2) return kwInfo(s2, n);
    return null;
  }

  function bubbleBody(title, kind, kindLabel, text, extra) {
    const head = mk('div', { class: 'tk-head' }, mk('b', { class: 'tk-name', text: title }));
    if (kindLabel) head.appendChild(mk('span', { class: 'tk-kind k-' + (kind || 'keyword'), text: kindLabel }));
    const body = mk('div', { class: 'tk' }, head, mk('p', { class: 'tk-text', text: text || '' }));
    if (extra) body.appendChild(extra);
    return body;
  }

  function kwNode(word, n) {
    const info = kwInfo(word, n);
    if (!info) return null;
    const body = bubbleBody(info.name + (info.status && n ? ' ' + n : ''), info.kind, KIND_LABEL[info.kind] || '', info.text);
    if (info.status) {
      const ico = iconCanvas('status', info.key, 30, {}, 'tk-ico');
      body.insertBefore(ico, body.firstChild);
    }
    return body;
  }

  const tipS = { el: null, cardEl: null, timer: 0, owner: null };

  function elRect(el) {
    const r = el.getBoundingClientRect();
    const a = toStage(r.left, r.top), b = toStage(r.right, r.bottom);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }

  function placeTip(node, rect, side) {
    const w = node.offsetWidth || 240, h = node.offsetHeight || 80, gap = 14;
    const fits = { top: rect.y0 - h - gap >= 6, bottom: rect.y1 + h + gap <= H - 6, left: rect.x0 - w - gap >= 6, right: rect.x1 + w + gap <= W - 6 };
    let s = side || 'top';
    if (!fits[s]) {
      const order = { top: ['bottom', 'right', 'left'], bottom: ['top', 'right', 'left'], left: ['right', 'top', 'bottom'], right: ['left', 'top', 'bottom'] }[s] || ['bottom'];
      s = order.find((o) => fits[o]) || s;
    }
    const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
    let x, y, tail;
    if (s === 'top' || s === 'bottom') {
      x = clamp(cx - w / 2, 6, Math.max(6, W - w - 6)); y = s === 'top' ? rect.y0 - h - gap : rect.y1 + gap;
      y = clamp(y, 6, Math.max(6, H - h - 6)); tail = clamp(cx - x, 18, Math.max(18, w - 18));
    } else {
      y = clamp(cy - h / 2, 6, Math.max(6, H - h - 6)); x = s === 'left' ? rect.x0 - w - gap : rect.x1 + gap;
      x = clamp(x, 6, Math.max(6, W - w - 6)); tail = clamp(cy - y, 18, Math.max(18, h - 18));
    }
    node.classList.remove('tip-top', 'tip-bottom', 'tip-left', 'tip-right');
    node.classList.add('tip-' + s);
    node.style.left = px2(x) + 'px'; node.style.top = px2(y) + 'px';
    node.style.setProperty('--tail', px2(tail) + 'px');
    return s;
  }

  function tipHide() {
    if (tipS.timer) { clearTimeout(tipS.timer); tipS.timer = 0; }
    if (tipS.el) { tipS.el.remove(); tipS.el = null; }
    if (tipS.cardEl) { tipS.cardEl.remove(); tipS.cardEl = null; }
    tipS.owner = null;
  }

  // content: an HTML string or a Node. rect: {x0,y0,x1,y1} in stage px (an element, or a point for a follow-the-pointer tip).
  function tipShow(content, rect, opts) {
    ensureInit();
    opts = opts || {};
    if (tipS.el) { tipS.el.remove(); tipS.el = null; }
    if (!content) return null;
    const node = mk('div', { class: 'tip' + (opts.wide ? ' tip-wide' : ''), role: 'tooltip' }, mk('div', { class: 'tip-in' }), mk('i', { class: 'tip-tail', 'aria-hidden': 'true' }));
    const inner = node.firstChild;
    if (typeof content === 'string') inner.innerHTML = content; else inner.appendChild(content);
    layers.tips.appendChild(node);
    placeTip(node, rect, opts.side);
    tipS.el = node;
    return node;
  }

  // A long press that opened a tip must not also act: touch browsers still send the click when the finger lifts. This arms ONE capture-phase click suppressor
  // for a click inside `el`; it expires after `ms` (the click follows pointerup within a few ms) and the next pointerdown anywhere cancels it, so a stale arm can never
  // swallow a later mouse click or a keyboard Enter on the same element.
  let swallowOff = null;
  function swallowClick(el, ms) {
    if (swallowOff) swallowOff();
    let timer = 0;
    const off = () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', off, true);
      if (timer) { clearTimeout(timer); timer = 0; }
      if (swallowOff === off) swallowOff = null;
    };
    const onClick = (e) => {
      if (!(el && e.target && el.contains(e.target))) return;
      off();
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', off, true);
    timer = setTimeout(off, ms === undefined ? 600 : ms);
    swallowOff = off;
    return off;
  }

  function attach(el, fn, opts) {
    opts = opts || {};
    let pressTimer = 0, byTouch = false, pressShown = false;
    const content = () => { let c; try { c = fn(); } catch (e) { warnOnce('tip', 'tooltip content threw', e); c = null; } return c; };
    const showFor = (e) => {
      if (el.isConnected === false) return;                       // the anchor left the page while a timer ran: its rect is 0,0 and the tip would stick top left
      const c = content();
      if (!c) return;
      tipS.owner = el;
      const rect = opts.follow && e && e.clientX !== undefined ? (() => { const p = toStage(e.clientX, e.clientY); return { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; })() : elRect(el);
      tipShow(c, rect, { side: opts.side, wide: opts.wide });
    };
    const enter = (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
      if (tipS.timer) clearTimeout(tipS.timer);
      tipS.timer = setTimeout(() => { tipS.timer = 0; showFor(e); }, opts.delay === undefined ? 70 : opts.delay);
    };
    const leave = () => { if (tipS.owner === el || tipS.timer) tipHide(); };
    const down = (e) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      byTouch = true; pressShown = false;
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { pressTimer = 0; showFor(e); pressShown = tipS.owner === el && !!tipS.el; }, 400);       // a 400 ms long press; a tap still clicks
    };
    const up = (e) => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
      if (byTouch && tipS.owner === el) tipHide();
      if (pressShown && e && e.type === 'pointerup') swallowClick(el);       // the finger that read the tip must not also press the button (a cancel sends no click)
      pressShown = false;
      byTouch = false;
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    if (opts.follow) el.addEventListener('pointermove', (e) => { if (tipS.owner === el && tipS.el) placeTip(tipS.el, (() => { const p = toStage(e.clientX, e.clientY); return { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; })(), opts.side); });
    el.addEventListener('focusin', () => { if (safe(() => el.matches(':focus-visible'), false)) showFor(null); });
    el.addEventListener('focusout', leave);
    el.rbTip = fn;
    return () => { el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave); el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  }

  // Big card preview with the glossary entries of everything on it beside it.
  function tipCard(inst, o) {
    ensureInit();
    o = o || {};
    if (tipS.cardEl) { tipS.cardEl.remove(); tipS.cardEl = null; }
    const size = CARD_SIZES()[o.size] ? o.size : 'big';
    const card = api.card(inst, { size, unit: o.unit, C: o.C, showGems: true, tip: false });
    card.classList.add('in-tip');
    card.removeAttribute('tabindex');
    const words = [];
    card.querySelectorAll('.kw').forEach((k) => { const w = k.dataset.kw; if (w && words.indexOf(w) < 0) words.push(w); });
    (card.rbResolved && card.rbResolved.kw || []).forEach((k) => { if (words.indexOf(k) < 0 && DATA.keywords[k]) words.push(k); });
    const col = mk('div', { class: 'tip-kwcol' });
    words.slice(0, 5).forEach((w) => { const n = kwNode(w); if (n) col.appendChild(mk('div', { class: 'tip tip-static' }, mk('div', { class: 'tip-in' }, n))); });
    const wrap = mk('div', { class: 'tip-cardwrap' }, card, col);
    const cw = CARD_SIZES()[size][0], ch = CARD_SIZES()[size][1];
    const scale = o.scale || 1;
    const x = o.x !== undefined ? o.x : Math.round((W - cw * scale) / 2 - 90);
    const y = o.y !== undefined ? o.y : 52;
    wrap.style.left = px2(x) + 'px'; wrap.style.top = px2(y) + 'px';
    if (scale !== 1) wrap.style.transform = 'scale(' + scale + ')';
    if (x + cw * scale + 250 > W) wrap.classList.add('kw-left');
    layers.tips.appendChild(wrap);
    tipS.cardEl = wrap;
    void ch;
    return wrap;
  }

  const tip = {
    attach, show: tipShow, hide: tipHide, card: tipCard, info: kwInfo, swallowClick,
    kw(word, n) { return kwNode(word, n); },
    status(id, n) { return kwNode(id, n); },
    showFor(el, content, opts) { return tipShow(content, elRect(el), opts); },
    get open() { return !!(tipS.el || tipS.cardEl); },
  };

  // ==================================================================================================================
  // delegated handlers on the stage: click sounds, keyword tooltips inside card text, disabled feedback
  // ==================================================================================================================
  function sfx(id) { const au = AU(); if (isFn(au, 'sfx')) safe(() => au.sfx(id)); }

  function installDelegates() {
    const st = S.stage;
    let lastHover = null, lastHoverAt = -1e9, kwHold = 0;
    st.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('button, [role=button]') : null;
      if (!b || !st.contains(b)) return;
      if (b.getAttribute('aria-disabled') === 'true') { sfx('ui_error'); shake(b); return; }
      if (b.dataset && b.dataset.sfx === 'none') return;
      if (b.classList.contains('card')) { sfx('card_pick'); return; }
      sfx(b.dataset && b.dataset.sfx ? b.dataset.sfx : 'ui_click');
    });
    st.addEventListener('pointerover', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const t = e.target;
      if (!t || !t.closest) return;
      const b = t.closest('button, [role=button]');
      if (b && b !== lastHover) {
        lastHover = b;
        const at = now();
        if (at - lastHoverAt > 70 && b.getAttribute('aria-disabled') !== 'true') { lastHoverAt = at; sfx(b.classList.contains('card') ? 'card_hover' : 'ui_hover'); }
      }
      const k = t.closest('.kw');
      if (k && k.dataset.kw && !k.closest('.in-tip')) {
        const n = kwNode(k.dataset.kw);
        if (n) { tipS.owner = k; tipShow(n, elRect(k), { side: 'top' }); }
      }
    });
    st.addEventListener('pointerout', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.kw') && tipS.owner && tipS.owner.classList && tipS.owner.classList.contains('kw')) tipHide();
      if (t && t.closest && t.closest('button, [role=button]') === lastHover && !(e.relatedTarget && lastHover && lastHover.contains && lastHover.contains(e.relatedTarget))) lastHover = null;
    });
    st.addEventListener('pointerdown', (e) => {
      if (kwHold) { clearTimeout(kwHold); kwHold = 0; }
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') { if (tipS.el && tipS.owner && !tipS.owner.contains(e.target)) tipHide(); return; }
      if (tipS.el || tipS.cardEl) { if (!(e.target.closest && e.target.closest('.tip'))) tipHide(); }
      const k = e.target && e.target.closest ? e.target.closest('.kw') : null;
      if (k && k.dataset.kw) kwHold = setTimeout(() => { kwHold = 0; const n = kwNode(k.dataset.kw); if (n) { tipS.owner = k; tipShow(n, elRect(k), { side: 'top' }); } }, 400);
    });
    st.addEventListener('pointerup', () => { if (kwHold) { clearTimeout(kwHold); kwHold = 0; } if (tipS.owner && tipS.owner.classList && tipS.owner.classList.contains('kw')) tipHide(); });
  }

  const CARD_SIZES = () => DATA.LISTS.cardSizes;

  // ==================================================================================================================
  // the card: the most important component in the game
  // ==================================================================================================================
  const TYPE_LABEL = { attack: 'Attack', skill: 'Skill', power: 'Power', curse: 'Curse', status: 'Status' };
  // fractions of the card width, mirrored in base.css (.c-art and friends)
  const ART_W = 0.895, ART_H = 0.61, ART_H_MINI = 1.06;

  function basicResolve(inst) {
    const isObj = inst && typeof inst === 'object';
    const id = isObj ? inst.id : inst;
    const def = DATA.cards[id] || { id, name: String(id), type: 'skill', rarity: 'common', cost: 1, slots: [], hero: 'hanae', art: { m: 'void', c: 'ink' }, fx: [] };
    const up = isObj && inst.up ? 1 : 0;
    const upd = (up && def.up) || {};
    const cost = upd.cost !== undefined ? upd.cost : def.cost;
    const slots = (def.slots || []).slice();
    return {
      inst: isObj ? inst : { uid: 0, id, up, gems: slots.map(() => null) }, def, id, name: def.name + (up ? '+' : ''),
      cost: cost === 'X' ? 0 : cost, costX: cost === 'X', type: def.type, rarity: def.rarity,
      kw: (upd.kw || def.kw || []).slice(), slots, gems: (isObj && inst.gems) || slots.map(() => null), fx: upd.fx || def.fx || [],
      hero: def.hero, up: !!up, playableType: ['attack', 'skill', 'power'].indexOf(def.type) >= 0 ? def.type : null, art: def.art,
    };
  }

  function resolveCard(inst, ctx) {
    let r = null;
    if (typeof DATA.resolveCard === 'function') {
      try { r = DATA.resolveCard(inst, ctx); } catch (e) { warnOnce('resolve:' + (inst && inst.id || inst), 'DATA.resolveCard threw for ' + (inst && inst.id || inst), e); }
    }
    if (r && r.name) return r;
    return basicResolve(inst);
  }

  function opHtml(o) {
    const n = (v) => '<span class="num">' + (typeof v === 'number' ? v : v && v.base !== undefined ? v.base : 'X') + '</span>';
    const kw = (k, label) => '<span class="kw" data-kw="' + k + '">' + label + '</span>';
    switch (o.op) {
      case 'dmg': return 'Deal ' + n(o.n) + ' damage' + (o.hits > 1 ? ' ' + n(o.hits) + ' times' : '') + (o.tgt === 'all' ? ' to ALL enemies' : '') + '.';
      case 'block': return 'Gain ' + n(o.n) + ' ' + kw('block', 'Block') + '.';
      case 'heal': return 'Heal ' + n(o.n) + '.';
      case 'status': { const st = DATA.statuses[o.s]; return (o.n < 0 ? 'Lose ' : 'Gain ') + n(Math.abs(o.n)) + ' ' + kw(o.s, st ? st.name : o.s) + '.'; }
      case 'draw': return 'Draw ' + n(o.n) + ' card' + (o.n === 1 ? '' : 's') + '.';
      case 'energy': return 'Gain ' + n(o.n) + ' Energy.';
      case 'swap': return kw('swap', 'Swap') + ' rows.';
      default: return cap(o.op) + '.';
    }
  }

  // Used only while data_text.js is absent, so the UI still shows something readable.
  function fallbackCardHtml(R) {
    const parts = [];
    if (R.kw && R.kw.length) parts.push(R.kw.map((k) => '<span class="kw" data-kw="' + k + '">' + cap(k) + '</span>').join('. ') + '.');
    (R.fx || []).forEach((o) => { if (o && o.op) parts.push(opHtml(o)); });
    return parts.join(' ') || '&nbsp;';
  }

  function cardRulesHtml(inst, R, ctx) {
    let html = '';
    if (typeof DATA.cardHtml === 'function') {
      try { html = DATA.cardHtml(inst, ctx); } catch (e) { warnOnce('cardHtml:' + R.id, 'DATA.cardHtml threw for ' + R.id, e); }
    }
    return html || fallbackCardHtml(R);
  }

  const plainOf = (html) => String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

  function drawCardArt(canvas, R, inst, aw, ah) {
    const g = canvas.getContext('2d');
    g.setTransform(S.px, 0, 0, S.px, 0, 0);
    const ar = AR();
    if (ar && isFn(ar.card, 'draw')) {
      try { g.save(); ar.card.draw(g, inst && typeof inst === 'object' ? inst : R.id, aw, ah, 0); g.restore(); return; } catch (e) { warnOnce('cardart:' + R.id, 'ART.card.draw threw for ' + R.id, e); }
    }
    const col = PALETTE_CSS[R.art && R.art.c] || '#3b2a7a';
    const gr = g.createLinearGradient(0, 0, aw, ah);
    gr.addColorStop(0, U.color.lighten(col, 0.25)); gr.addColorStop(1, U.color.shadow(col));
    g.fillStyle = gr; g.fillRect(0, 0, aw, ah);
    g.fillStyle = 'rgba(255,248,240,0.55)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 ' + Math.round(ah * 0.55) + 'px Georgia, serif';
    g.fillText(String((R.art && R.art.m) || R.name)[0].toUpperCase(), aw / 2, ah / 2);
  }

  function socketEl(color, gemId, dimPx, showTip) {
    const filled = !!gemId;
    const s = mk('span', { class: 'c-sock sc-' + color + (filled ? ' filled' : ''), 'aria-label': filled ? 'Socketed ' + ((DATA.gems[gemId] && DATA.gems[gemId].name) || gemId) : 'Empty ' + color + ' socket', dataset: filled ? { gem: gemId } : undefined },
      iconCanvas('gem', filled ? gemId : 'slot:' + color, dimPx, { on: filled }));
    if (showTip) {
      attach(s, () => {
        if (filled) {
          const g = DATA.gems[gemId] || {};
          return bubbleBody(g.name || gemId, 'keyword', 'Tier ' + (g.tier || 1), typeof DATA.gemText === 'function' ? safe(() => DATA.gemText(gemId), '') : '');
        }
        return bubbleBody(color === 'any' ? 'Prism slot' : cap(color) + ' slot', 'keyword', 'Empty', (DATA.keywords[color === 'any' ? 'prism' : 'slot'] || {}).text || '');
      }, { side: 'top' });
    }
    return s;
  }

  function uidOf(inst) { return inst && typeof inst === 'object' && inst.uid !== undefined ? String(inst.uid) : ''; }

  function card(instOrId, o) {
    ensureInit();
    o = o || {};
    const sizes = CARD_SIZES();
    const size = sizes[o.size] ? o.size : 'hand';
    const cw = sizes[size][0];
    const st = { unit: o.unit, C: o.C, selected: !!o.selected, disabled: o.disabled, playable: o.playable };
    let ctx = st.unit || st.C ? { unit: st.unit, C: st.C } : undefined;
    let R = resolveCard(instOrId, ctx);
    const def = R.def || DATA.cards[R.id] || {};
    const hero = DATA.heroes[R.hero] || null;
    const junk = R.type === 'curse' || R.type === 'status';
    const root = mk('div', { class: 'card c-' + size + ' t-' + R.type + ' r-' + R.rarity + (hero ? ' h-' + R.hero : ' h-none') + (junk ? ' junk' : '') + (o.class ? ' ' + o.class : ''), role: 'button', tabindex: '0', dataset: { id: R.id, size } });
    if (uidOf(instOrId)) root.dataset.uid = uidOf(instOrId);
    vars(root, { '--hc': hero ? hero.color : R.type === 'curse' ? '#7a6bff' : '#8a86a8', '--hc2': hero ? hero.dark : R.type === 'curse' ? '#140f2e' : '#4a4766' });

    const nameEl = mk('span', { class: 'c-name' });
    const plus = mk('i', { class: 'c-plus', text: '+', 'aria-hidden': 'true' });
    const head = mk('div', { class: 'c-head' }, nameEl);
    const costNum = mk('b', { class: 'c-costn' });
    const cost = mk('div', { class: 'c-cost', 'aria-hidden': 'true' }, mk('i', { class: 'c-costfx' }), costNum);
    const rules = mk('div', { class: 'c-rules' });
    const textBox = mk('div', { class: 'c-text' }, rules);
    const aw = cw * ART_W, ah = cw * (size === 'mini' ? ART_H_MINI : ART_H);
    const artCanvas = mk('canvas', { class: 'c-artc', width: Math.round(aw * S.px), height: Math.round(ah * S.px), 'aria-hidden': 'true' });
    const art = mk('div', { class: 'c-art' }, artCanvas, mk('i', { class: 'c-gloss' }));
    const face = mk('div', { class: 'c-face' }, head, art);
    let socks = null;

    if (size !== 'mini') {
      const tico = iconCanvas('type', R.type, Math.round(cw * 0.085), {}, 'c-tico');
      const strip = mk('div', { class: 'c-type' }, tico, mk('span', { class: 'c-tname', text: TYPE_LABEL[R.type] || cap(R.type) }));
      if (hero) strip.appendChild(mk('span', { class: 'c-medal', 'aria-hidden': 'true' }, medalCanvas(R.hero, Math.round(cw * 0.105))));
      else strip.appendChild(mk('span', { class: 'c-medal c-sigil', 'aria-hidden': 'true' }));
      face.appendChild(strip);
      face.appendChild(textBox);
      if (size === 'big' || size === 'reward') { if (def.flavor) textBox.appendChild(mk('p', { class: 'c-flavor', text: def.flavor })); }
      const slots = R.slots || [];
      if (slots.length && o.showGems !== false) {
        socks = mk('div', { class: 'c-socks' });
        const dimPx = Math.round(cw * 0.118);
        slots.forEach((col, i) => socks.appendChild(socketEl(col, (R.gems || [])[i] || null, dimPx, size !== 'hand')));
      }
    }
    const inn = mk('div', { class: 'c-in' }, face, cost, mk('div', { class: 'c-orn', 'aria-hidden': 'true' }, mk('i', { class: 'spk k1' }), mk('i', { class: 'spk k2' }), mk('i', { class: 'spk k3' }), mk('i', { class: 'spk k4' }), mk('i', { class: 'shine' })));
    if (socks) inn.appendChild(socks);
    root.insertBefore(inn, root.firstChild);
    drawCardArt(artCanvas, R, instOrId, aw, ah);

    let lastCost = null;
    function paintDynamic(popCost) {
      const nm = String(R.name || '').replace(/\+$/, '');
      nameEl.textContent = nm;
      if (R.up) nameEl.appendChild(plus);
      root.style.setProperty('--nf', String(nm.length > 20 ? 0.72 : nm.length > 16 ? 0.8 : nm.length > 13 ? 0.9 : 1));
      const html = cardRulesHtml(instOrId, R, ctx);
      const plain = plainOf(html);
      rules.innerHTML = html;
      const eff = plain.length * UI_OPT.textScale;
      rules.style.setProperty('--tf', eff <= 72 ? '1' : eff <= 92 ? '0.92' : eff <= 112 ? '0.85' : '0.8');
      const costTxt = R.costX ? 'X' : R.cost === undefined || R.cost === null ? '' : String(R.cost);
      costNum.textContent = costTxt;
      cost.hidden = costTxt === '';
      root.classList.toggle('nocost', costTxt === '');
      root.classList.toggle('x-cost', !!R.costX);
      const base = def.cost;
      root.classList.toggle('cost-down', typeof base === 'number' && typeof R.cost === 'number' && !R.costX && R.cost < base);
      root.classList.toggle('cost-up', typeof base === 'number' && typeof R.cost === 'number' && !R.costX && R.cost > base);
      if (popCost && lastCost !== null && lastCost !== costTxt) pulse(cost);
      lastCost = costTxt;
      root.dataset.cost = costTxt;
      root.setAttribute('aria-label', nm + (R.up ? ' plus' : '') + '. ' + (TYPE_LABEL[R.type] || R.type) + (costTxt ? ', cost ' + costTxt : '') + '. ' + plain);
      root.rbResolved = R;
    }
    // state classes are toggled one by one so classes a screen adds to the card (dragging, fanned...) survive updates
    function paintClasses() {
      root.classList.toggle('up', !!R.up);
      root.classList.toggle('sel', !!st.selected);
      root.classList.toggle('dis', !!st.disabled);
      root.classList.toggle('play', !!st.playable && !st.disabled);
      root.setAttribute('aria-pressed', st.selected ? 'true' : 'false');
      if (st.disabled) root.setAttribute('aria-disabled', 'true'); else root.removeAttribute('aria-disabled');
    }
    function autoState() {
      if (st.C && typeof st.C.canPlay === 'function' && o.playable === undefined && o.disabled === undefined && R.playableType !== null && root.dataset.uid) {
        const r = safe(() => st.C.canPlay(Number(root.dataset.uid)), null);
        if (r) { st.playable = !!r.ok; st.disabled = !r.ok; }
      }
    }
    autoState();
    paintDynamic(false);
    paintClasses();

    // live updates: pass unit / C to refresh the numbers, or selected / disabled / playable for the glows
    root.rbUpdate = function (patch) {
      patch = patch || {};
      let dyn = false;
      ['unit', 'C'].forEach((k) => { if (k in patch) { st[k] = patch[k]; dyn = true; } });
      if (patch.refresh || patch.inst) { if (patch.inst) { instOrId = patch.inst; } dyn = true; }
      ['selected', 'disabled', 'playable'].forEach((k) => { if (k in patch) st[k] = patch[k]; });
      if (dyn) {
        ctx = st.unit || st.C ? { unit: st.unit, C: st.C } : undefined;
        R = resolveCard(instOrId, ctx);
        if (!('disabled' in patch) && !('playable' in patch)) { o.playable = undefined; o.disabled = undefined; autoState(); }
        paintDynamic(true);
        root.rbFit = 0; S.fit.push(root);
      }
      paintClasses();
      return root;
    };
    if (typeof o.onclick === 'function') root.addEventListener('click', (e) => o.onclick(e, instOrId, root));
    // a mini card shows only its name and cost, so hovering explains it
    if (o.tip !== false && size === 'mini') attach(root, () => bubbleBody(String(R.name).replace(/\+$/, ''), 'keyword', TYPE_LABEL[R.type] || '', plainOf(cardRulesHtml(instOrId, R, ctx))), { side: 'top' });
    S.fit.push(root); root.rbFit = 0;
    return root;
  }

  function cardUpdate(el, patch) { if (el && typeof el.rbUpdate === 'function') el.rbUpdate(patch); return el; }

  // auto-shrink the rules text (down to 0.8) when it still overflows after layout; then it scrolls
  function fitCards() {
    if (!S.fit.length) return;
    const n = Math.min(S.fit.length, 10);
    for (let i = 0; i < n; i++) {
      const c = S.fit.shift();
      if (!c.isConnected) { c.rbFit = (c.rbFit || 0) + 1; if (c.rbFit < 40) S.fit.push(c); continue; }
      const box = c.querySelector('.c-text'), rules = c.querySelector('.c-rules');
      if (!box || !rules) continue;
      let f = parseFloat(rules.style.getPropertyValue('--tf')) || 1, guard = 0;
      while (box.scrollHeight > box.clientHeight + 1 && f > 0.8 && guard++ < 4) { f = Math.max(0.8, f - 0.05); rules.style.setProperty('--tf', String(Math.round(f * 100) / 100)); }
    }
  }

  function cardBack(size) {
    const sizes = CARD_SIZES();
    const sz = sizes[size] ? size : 'deck';
    return mk('div', { class: 'card back c-' + sz, 'aria-label': 'Face-down card', dataset: { size: sz } },
      mk('div', { class: 'c-in' }, mk('div', { class: 'c-face' }, mk('i', { class: 'back-drop' }), mk('i', { class: 'back-ring' }), mk('b', { class: 'back-word', text: 'ECHOWAKE' }))));
  }

  // ==================================================================================================================
  // relics, gems, statuses, hero badges, stat pills
  // ==================================================================================================================
  const RELIC_PX = { xs: 28, sm: 40, md: 56, lg: 84 };
  const GEM_PX = { xs: 22, sm: 32, md: 44, lg: 64 };
  const STATUS_PX = { xs: 22, sm: 28, md: 36, lg: 48 };
  const STAT_PX = { sm: 22, md: 30, lg: 42 };

  function relic(id, o) {
    o = o || {};
    const size = RELIC_PX[o.size] ? o.size : 'md';
    const def = DATA.relics[id] || { name: String(id), text: '', rarity: 'common' };
    const clickable = typeof o.onclick === 'function';
    const root = mk('span', { class: 'relic rar-' + def.rarity + ' sz-' + size + (o.class ? ' ' + o.class : ''), role: clickable ? 'button' : 'img', tabindex: '0', 'aria-label': def.name + '. ' + (typeof DATA.relicText === 'function' ? safe(() => DATA.relicText(id), def.text) : def.text), dataset: { id } },
      iconCanvas('relic', id, RELIC_PX[size] - 8, {}));
    if (clickable) root.addEventListener('click', (e) => o.onclick(e, id, root));
    if (o.tip !== false) attach(root, () => bubbleBody(def.name, 'keyword', cap(def.rarity), typeof DATA.relicText === 'function' ? safe(() => DATA.relicText(id), def.text) : def.text), { side: o.side || 'bottom' });
    return root;
  }

  function gem(id, o) {
    o = o || {};
    const size = GEM_PX[o.size] ? o.size : 'md';
    const def = DATA.gems[id] || { name: String(id), color: 'red', tier: 1 };
    const root = mk('span', { class: 'gem gc-' + def.color + ' tier-' + def.tier + ' sz-' + size + (o.selected ? ' sel' : '') + (o.class ? ' ' + o.class : ''), role: typeof o.onclick === 'function' ? 'button' : 'img', tabindex: '0', 'aria-label': def.name + ', tier ' + def.tier, dataset: { id } },
      iconCanvas('gem', id, GEM_PX[size] - 6, {}), mk('i', { class: 'gem-pips', text: '' }));
    const pips = root.querySelector('.gem-pips');
    for (let i = 0; i < (def.tier || 1); i++) pips.appendChild(mk('b', { class: 'pip' }));
    if (typeof o.onclick === 'function') root.addEventListener('click', (e) => o.onclick(e, id, root));
    if (o.tip !== false) attach(root, () => bubbleBody(def.name, 'keyword', 'Tier ' + def.tier + ' ' + cap(def.color), typeof DATA.gemText === 'function' ? safe(() => DATA.gemText(id), '') : ''), { side: o.side || 'top' });
    return root;
  }

  function status(id, n, o) {
    o = o || {};
    const size = STATUS_PX[o.size] ? o.size : 'md';
    const def = DATA.statuses[id] || { name: String(id), kind: 'buff', text: '' };
    const num = mk('b', { class: 'n', text: n === undefined || n === null ? '' : String(n) });
    const root = mk('span', { class: 'status k-' + def.kind + ' s-' + id + ' sz-' + size + (o.class ? ' ' + o.class : ''), role: 'img', tabindex: o.focusable === false ? undefined : '0', 'aria-label': (typeof DATA.statusText === 'function' ? safe(() => DATA.statusText(id, n), def.name + (n === undefined ? '' : ' ' + n)) : def.name + (n === undefined ? '' : ' ' + n)), dataset: { s: id } },
      iconCanvas('status', id, STATUS_PX[size], {}), num);
    root.rbSet = (v) => { num.textContent = v === undefined || v === null ? '' : String(v); n = v; root.setAttribute('aria-label', typeof DATA.statusText === 'function' ? safe(() => DATA.statusText(id, v), def.name + ' ' + v) : def.name + ' ' + v); };
    if (o.tip !== false) attach(root, () => kwNode(id, n), { side: o.side || 'bottom' });
    return root;
  }

  function heroBadge(heroId, o) {
    o = o || {};
    const size = { sm: 44, md: 64, lg: 96 }[o.size] ? o.size : 'md';
    const dim = { sm: 44, md: 64, lg: 96 }[size];
    const h = DATA.heroes[heroId] || { name: String(heroId), title: '', color: '#8a86a8', dark: '#4a4766', maxHp: 1 };
    const fill = mk('i', { class: 'hp-fill' });
    const hpTxt = mk('em', { class: 'hp-txt' });
    const bar = mk('span', { class: 'hpbar' }, fill, hpTxt);
    const info = mk('span', { class: 'b-info' }, mk('b', { class: 'b-name', text: h.name }), size === 'lg' ? mk('span', { class: 'b-title', text: h.title }) : null, bar);
    const root = mk('div', { class: 'badge sz-' + size + ' h-' + heroId + (o.selected ? ' sel' : '') + (o.class ? ' ' + o.class : ''), role: typeof o.onclick === 'function' ? 'button' : 'group', tabindex: typeof o.onclick === 'function' ? '0' : undefined, 'aria-label': h.name + (h.title ? ', ' + h.title : ''), dataset: { hero: heroId } },
      mk('span', { class: 'medal' }, medalCanvas(heroId, dim)), info);
    vars(root, { '--hc': h.color, '--hc2': h.dark });
    root.rbSet = (p) => {
      p = p || {};
      if (p.selected !== undefined) root.classList.toggle('sel', !!p.selected);
      const hp = p.hp === undefined ? o.hp : p.hp, mx = p.maxHp === undefined ? o.maxHp : p.maxHp;
      if (hp === undefined || hp === null) { bar.hidden = true; return; }
      bar.hidden = false;
      const max = mx || h.maxHp || 1;
      fill.style.width = clamp((hp / max) * 100, 0, 100) + '%';
      hpTxt.textContent = hp + '/' + max;
      root.classList.toggle('down', hp <= 0);
      root.classList.toggle('low', hp > 0 && hp / max < 0.3);
      if (p.hp !== undefined) o.hp = p.hp;
      if (p.maxHp !== undefined) o.maxHp = p.maxHp;
    };
    root.rbSet({ hp: o.hp, maxHp: o.maxHp });
    if (typeof o.onclick === 'function') root.addEventListener('click', (e) => o.onclick(e, heroId, root));
    return root;
  }

  const STAT_TIP = {
    gold: ['Gold', 'Spend it at peddlers. Keep some for the next shop.'], ink: ['Echo', null], hp: ['Health', 'Hit points. A hero at 0 is downed.'],
    energy: ['Energy', 'Spend Energy to play cards. It refills every turn.'], brush: ['Songs', null], inkstone: ['Chimes', 'Earned every run. Spend them in the Hall of Echoes to unlock new content.'], block: ['Block', null],
  };

  function stat(kind, value, o) {
    o = o || {};
    const size = STAT_PX[o.size] ? o.size : 'md';
    const val = mk('b', { class: 'val' });
    const root = mk('span', { class: 'stat st-' + kind + ' sz-' + size + (o.class ? ' ' + o.class : ''), role: 'img', tabindex: o.focusable === false ? undefined : '0', dataset: { stat: kind } },
      iconCanvas('stat', kind, STAT_PX[size], {}, 'st-ico'), val);
    const cur = { n: typeof value === 'number' ? value : 0, txt: value };
    const paint = (v, max) => {
      const txt = max !== undefined && max !== null ? v + '/' + max : String(v);
      val.textContent = txt;
      root.setAttribute('aria-label', (STAT_TIP[kind] ? STAT_TIP[kind][0] : kind) + ' ' + txt);
    };
    paint(value, o.max);
    root.rbSet = (v, opts) => {
      opts = opts || {};
      const max = opts.max !== undefined ? opts.max : o.max;
      if (opts.animate && typeof v === 'number' && typeof cur.n === 'number' && v !== cur.n && !UI_OPT.reduceMotion) {
        const proxy = { n: cur.n };
        tween(proxy, { n: v }, 450, 'outCubic', () => paint(Math.round(proxy.n), max));
        pulse(root);
      } else { paint(v, max); pulse(root); }
      cur.n = typeof v === 'number' ? v : cur.n;
    };
    if (o.tip !== false && STAT_TIP[kind]) attach(root, () => {
      const t = STAT_TIP[kind];
      const text = t[1] || (DATA.keywords[kind] && DATA.keywords[kind].text) || '';
      return bubbleBody(t[0], 'keyword', '', text);
    }, { side: o.side || 'bottom' });
    return root;
  }

  // ==================================================================================================================
  // buttons, panels, dividers, bars, and small form controls, in the game's own look (styles in css/base.css)
  // ==================================================================================================================
  function setDisabled(el, on, reason) {
    el.classList.toggle('is-disabled', !!on);
    if (on) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
    el.rbReason = on ? reason : undefined;
    return el;
  }

  // UI.btn('Label', {kind:'primary'|'secondary'|'ghost', size:'sm'|'lg', icon:{kind,id,size}|node, key:'E', disabled, reason, sfx, breathe, onclick})
  function btn(label, o) {
    if (label && typeof label === 'object' && !label.nodeType) { o = label; label = o.label; }
    o = o || {};
    const kind = o.kind || 'secondary';
    const b = mk('button', { type: 'button', class: 'btn btn-' + kind + (o.size ? ' btn-' + o.size : '') + (o.danger ? ' btn-danger' : '') + (o.breathe ? ' breathe' : '') + (o.class ? ' ' + o.class : ''), dataset: o.sfx ? { sfx: o.sfx } : undefined });
    if (o.icon) b.appendChild(o.icon.nodeType ? o.icon : iconCanvas(o.icon.kind, o.icon.id, o.icon.size || 22, {}, 'btn-ico'));
    b.appendChild(mk('span', { class: 'btn-label', text: label === undefined || label === null ? '' : String(label) }));
    if (o.key) b.appendChild(mk('kbd', { class: 'btn-key', text: o.key, 'aria-hidden': 'true' }));
    b.appendChild(mk('i', { class: 'btn-shine', 'aria-hidden': 'true' }));
    if (o.disabled) setDisabled(b, true, o.reason);
    if (typeof o.onclick === 'function') {
      b.addEventListener('click', (e) => {
        if (b.getAttribute('aria-disabled') === 'true' || b.disabled) { if (b.rbReason) toast(b.rbReason, 'warn'); return; }
        o.onclick(e, b);
      });
    }
    if (o.tip) attach(b, typeof o.tip === 'function' ? o.tip : () => bubbleBody(String(label), 'keyword', '', String(o.tip)), { side: o.side || 'top' });
    b.rbSet = (p) => {
      p = p || {};
      if (p.label !== undefined) b.querySelector('.btn-label').textContent = p.label;
      if (p.disabled !== undefined) setDisabled(b, p.disabled, p.reason);
      return b;
    };
    return b;
  }

  function appendKids(parent, kids) {
    kids.flat(3).forEach((k) => { if (k !== null && k !== undefined && k !== false) parent.appendChild(k.nodeType ? k : document.createTextNode(String(k))); });
    return parent;
  }

  // UI.panel({kind:'paper'|'dark', torn, gold, title, class}, ...children) -> element with .body (the content box) and .panelEl
  function panel(o, ...kids) {
    o = o || {};
    const p = mk('div', { class: 'panel p-' + (o.kind || 'paper') + (o.gold ? ' p-gold' : '') + (o.torn ? ' torn' : '') + (o.class ? ' ' + o.class : '') });
    if (o.title) p.appendChild(mk('h2', { class: 'p-title' }, mk('span', { text: o.title })));
    const body = mk('div', { class: 'p-body' });
    appendKids(body, kids);
    p.appendChild(body);
    const root = o.torn ? mk('div', { class: 'panel-wrap' }, p) : p;
    root.body = body; root.panelEl = p;
    return root;
  }

  function hanko(text, o) {
    o = o || {};
    return mk('span', { class: 'hanko' + (o.size ? ' hk-' + o.size : '') + (o.class ? ' ' + o.class : ''), 'aria-hidden': o.label ? undefined : 'true', 'aria-label': o.label, text: text === undefined ? '' : String(text) });
  }
  function divider(o) { return mk('i', { class: 'brush-div' + (o && o.class ? ' ' + o.class : ''), 'aria-hidden': 'true' }); }

  // UI.bar(value, max, kind 'hp'|'ink'|'xp'|'boss') -> el with .rbSet(value, max)
  function bar(value, max, kind, o) {
    o = o || {};
    const fill = mk('i', { class: 'fill' });
    const txt = mk('em', { class: 'bar-txt' });
    const root = mk('div', { class: 'bar bk-' + (kind || 'hp') + (o.class ? ' ' + o.class : ''), role: 'progressbar', 'aria-valuemin': '0' }, fill, txt);
    root.rbSet = (v, m) => {
      const mx = m === undefined ? max : m;
      max = mx;
      fill.style.width = clamp(mx ? (v / mx) * 100 : 0, 0, 100) + '%';
      txt.textContent = o.text === false ? '' : v + '/' + mx;
      root.setAttribute('aria-valuenow', String(v)); root.setAttribute('aria-valuemax', String(mx));
    };
    root.rbSet(value, max);
    return root;
  }

  // UI.tabs([{id,label}], {value, onchange}) -> tablist element
  function tabs(items, o) {
    o = o || {};
    const root = mk('div', { class: 'tabs', role: 'tablist' });
    let cur = o.value !== undefined ? o.value : items[0] && items[0].id;
    const btns = items.map((it) => {
      const b = mk('button', { type: 'button', class: 'tab' + (it.id === cur ? ' on' : ''), role: 'tab', 'aria-selected': it.id === cur ? 'true' : 'false', dataset: { id: it.id } }, mk('span', { text: it.label }));
      b.addEventListener('click', () => { if (cur === it.id) return; cur = it.id; btns.forEach((x) => { const on = x.dataset.id === it.id; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); }); if (o.onchange) o.onchange(it.id); });
      root.appendChild(b);
      return b;
    });
    root.rbSet = (id) => { cur = id; btns.forEach((x) => { const on = x.dataset.id === String(id); x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); }); };
    return root;
  }

  // UI.seg([{value,label}], {value, onchange}) -> segmented control (radio group)
  function seg(items, o) {
    o = o || {};
    const root = mk('div', { class: 'seg', role: 'radiogroup', 'aria-label': o.label });
    let cur = o.value;
    const same = (a, b) => a === b;
    const btns = items.map((it) => {
      const b = mk('button', { type: 'button', class: 'seg-b' + (same(it.value, cur) ? ' on' : ''), role: 'radio', 'aria-checked': same(it.value, cur) ? 'true' : 'false' }, mk('span', { text: it.label }));
      b.addEventListener('click', () => { cur = it.value; btns.forEach((x, i) => { const on = same(items[i].value, cur); x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); }); if (o.onchange) o.onchange(it.value); });
      root.appendChild(b);
      return b;
    });
    root.rbSet = (v) => { cur = v; btns.forEach((x, i) => { const on = same(items[i].value, v); x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); }); };
    return root;
  }

  function toggle(o) {
    o = o || {};
    let on = !!o.value;
    const b = mk('button', { type: 'button', class: 'toggle' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': o.label }, mk('i', { class: 'knob' }));
    const set = (v) => { on = !!v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); };
    b.addEventListener('click', () => { set(!on); if (o.onchange) o.onchange(on); });
    b.rbSet = set;
    return b;
  }

  function slider(o) {
    o = o || {};
    const min = o.min === undefined ? 0 : o.min, max = o.max === undefined ? 1 : o.max, step = o.step === undefined ? 0.05 : o.step;
    const input = mk('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(o.value === undefined ? min : o.value), 'aria-label': o.label, class: 'range' });
    const val = mk('b', { class: 's-val' });
    const fmt = o.format || ((v) => Math.round(v * 100) + '%');
    const paint = () => { const v = Number(input.value); input.style.setProperty('--p', String(clamp(((v - min) / (max - min || 1)) * 100, 0, 100)) + '%'); val.textContent = fmt(v); };
    input.addEventListener('input', () => { paint(); if (o.onchange) o.onchange(Number(input.value)); });
    paint();
    const root = mk('div', { class: 'slider' }, input, val);
    root.rbSet = (v) => { input.value = String(v); paint(); };
    return root;
  }

  // the whole settings form, bound to META: used by the settings overlay here and reusable by the settings screen
  function settingsPanel() {
    const S1 = (k) => getSetting(k);
    const row = (label, ctl, hint) => mk('div', { class: 'set-row' }, mk('div', { class: 'set-label' }, mk('b', { text: label }), hint ? mk('span', { class: 'set-hint', text: hint }) : null), ctl);
    const root = mk('div', { class: 'settings-form' },
      mk('h3', { class: 'set-h', text: 'Sound' }),
      row('Music', slider({ label: 'Music volume', value: S1('musicVol'), onchange: (v) => setSetting('musicVol', v) })),
      row('Effects', slider({ label: 'Effects volume', value: S1('sfxVol'), onchange: (v) => { setSetting('sfxVol', v); sfx('ui_click'); } })),
      divider(),
      mk('h3', { class: 'set-h', text: 'Display' }),
      row('Text size', seg([{ value: 1, label: 'Normal' }, { value: 1.15, label: 'Large' }, { value: 1.3, label: 'Larger' }], { label: 'Text size', value: S1('textScale'), onchange: (v) => setSetting('textScale', v) })),
      row('Colorblind aids', toggle({ label: 'Colorblind aids', value: S1('colorblind'), onchange: (v) => setSetting('colorblind', v) }), 'Patterns and larger gem glyphs'),
      row('Damage numbers', toggle({ label: 'Damage numbers', value: S1('damageNumbers'), onchange: (v) => setSetting('damageNumbers', v) })),
      row('Quality', seg([{ value: 'auto', label: 'Auto' }, { value: 'high', label: 'High' }, { value: 'low', label: 'Low' }], { label: 'Quality', value: S1('quality'), onchange: (v) => { S.qualityDropped = false; setSetting('quality', v); } })),
      divider(),
      mk('h3', { class: 'set-h', text: 'Motion' }),
      row('Reduce motion', seg([{ value: null, label: 'Auto' }, { value: true, label: 'On' }, { value: false, label: 'Off' }], { label: 'Reduce motion', value: S1('reduceMotion'), onchange: (v) => setSetting('reduceMotion', v) })),
      row('Screen shake', slider({ label: 'Screen shake', value: S1('shake'), step: 0.25, onchange: (v) => setSetting('shake', v) })),
      row('Animation speed', seg([{ value: 0, label: 'Normal' }, { value: 1, label: 'Fast' }, { value: 2, label: 'Faster' }], { label: 'Animation speed', value: S1('fastAnim'), onchange: (v) => setSetting('fastAnim', v) })),
      row('Hints', toggle({ label: 'Hints', value: S1('hints'), onchange: (v) => setSetting('hints', v) }), 'Short tips during your first run'));
    return root;
  }

  function menuButton() {
    const b = mk('button', { type: 'button', class: 'menu-btn', 'aria-label': 'Menu', dataset: { sfx: 'ui_open' } }, mk('i', { class: 'mb-l' }), mk('i', { class: 'mb-l' }), mk('i', { class: 'mb-l' }));
    b.addEventListener('click', () => { if (!S.busy && !S.overlays.some((r) => r.name === 'pause')) overlayOpen('pause'); });
    return b;
  }

  // ==================================================================================================================
  // default overlays: modal, confirm, cardPick, legend, relics, deck (basic), settings. Later files replace any of them.
  // ==================================================================================================================
  const overlays = {
    modal: {
      open(p, root, close) {
        p = p || {};
        const list = p.buttons && p.buttons.length ? p.buttons : [{ label: 'OK', kind: 'primary' }];
        const row = mk('div', { class: 'row center gap m-btns' });
        list.forEach((b, i) => {
          const el = btn(b.label, {
            kind: b.kind || (i === list.length - 1 ? 'primary' : 'secondary'), size: 'lg',
            onclick: () => { let r; if (b.cb) { try { r = b.cb(close); } catch (e) { logError('modal button', e); } } if (r !== false) close(b.result !== undefined ? b.result : b.label); },
          });
          if (i === list.length - 1) el.setAttribute('data-autofocus', '');
          row.appendChild(el);
        });
        const body = typeof p.body === 'string' ? mk('p', { class: 'm-text', text: p.body }) : p.body;
        const box = panel({ kind: 'paper', torn: true, title: p.title, class: 'modal' }, body, p.html ? mk('div', { class: 'm-html', html: p.html }) : null, row);
        root.appendChild(box);
      },
    },
    confirm: {
      cancelResult: false,
      open(p, root, close) {
        p = p || {};
        const no = btn(p.no || 'Cancel', { kind: 'secondary', size: 'lg', onclick: () => close(false), sfx: 'ui_back' });
        const yes = btn(p.yes || 'Yes', { kind: 'primary', size: 'lg', danger: !!p.danger, onclick: () => close(true) });
        (p.danger ? no : yes).setAttribute('data-autofocus', '');
        onKey((e) => { if (e.key === 'y' || e.key === 'Y') { close(true); return true; } if (e.key === 'n' || e.key === 'N') { close(false); return true; } return false; }, { overlay: true });
        const body = typeof p.body === 'string' ? mk('p', { class: 'm-text', text: p.body }) : p.body;
        root.appendChild(panel({ kind: 'paper', torn: true, title: p.title || 'Are you sure?', class: 'modal confirm' + (p.danger ? ' danger' : '') }, body, mk('div', { class: 'row center gap m-btns' }, no, yes)));
      },
    },
    // cardPick {title, cards:[inst], n:1, optional:false, confirm:'Choose'} -> [uid]; exactly min(n, cards) unless optional
    cardPick: {
      cancelResult: [],
      open(p, root, close) {
        p = p || {};
        const cards = p.cards || [];
        const n = Math.max(1, p.n || 1);
        const need = p.optional ? 0 : Math.min(n, cards.length);
        const picked = [];
        const grid = mk('div', { class: 'pick-grid' + (cards.length > 8 ? ' many' : '') });
        const ok = btn(p.confirm || 'Choose', { kind: 'primary', size: 'lg', onclick: () => close(picked.slice()) });
        const count = mk('span', { class: 'pick-count' });
        const refresh = () => {
          setDisabled(ok, picked.length < need || picked.length > n, 'Choose ' + need);
          count.textContent = picked.length + ' / ' + (p.optional ? 'up to ' + n : need);
        };
        cards.forEach((inst) => {
          const c = card(inst, { size: cards.length > 8 ? 'deck' : cards.length > 4 ? 'reward' : 'big', showGems: true, onclick: () => {
            const i = picked.indexOf(inst.uid);
            if (i >= 0) picked.splice(i, 1);
            else { if (n === 1) picked.length = 0; if (picked.length < n) picked.push(inst.uid); }
            grid.querySelectorAll('.card').forEach((el) => el.rbUpdate({ selected: picked.indexOf(Number(el.dataset.uid)) >= 0 }));
            refresh();
          } });
          c.rbUpdate({ selected: false });
          grid.appendChild(c);
        });
        refresh();
        const foot = mk('div', { class: 'row center gap m-btns' }, count, p.optional ? btn('Skip', { kind: 'ghost', size: 'lg', onclick: () => close([]) }) : null, ok);
        root.appendChild(panel({ kind: 'dark', title: p.title || 'Choose a card', class: 'pick-panel' }, grid, foot));
        if (cards.length && need === cards.length && !p.optional) { /* nothing to choose: the caller normally auto-resolves, but stay usable */ }
      },
    },
    legend: {
      open(p, root, close) {
        const col = (title, ids, src) => {
          const c = mk('div', { class: 'legend-col' }, mk('h3', { text: title }));
          ids.forEach((id) => {
            const d = src[id];
            const r = mk('div', { class: 'legend-row' });
            if (src === DATA.statuses) r.appendChild(iconCanvas('status', id, 30, {}));
            r.appendChild(mk('div', {}, mk('b', { text: d.name }), mk('p', { text: d.text })));
            c.appendChild(r);
          });
          return c;
        };
        const body = mk('div', { class: 'legend-grid' },
          col('Buffs', Object.keys(DATA.statuses).filter((k) => DATA.statuses[k].kind === 'buff'), DATA.statuses),
          col('Debuffs', Object.keys(DATA.statuses).filter((k) => DATA.statuses[k].kind === 'debuff'), DATA.statuses),
          col('Resources', Object.keys(DATA.statuses).filter((k) => DATA.statuses[k].kind === 'resource'), DATA.statuses),
          col('Words', Object.keys(DATA.keywords), DATA.keywords));
        root.appendChild(panel({ kind: 'dark', title: 'Glossary', class: 'legend-panel' }, body, mk('div', { class: 'row center' }, btn('Close', { kind: 'secondary', size: 'lg', onclick: () => close() }))));
      },
    },
    relics: {
      open(p, root, close) {
        p = p || {};
        const R = S.run;
        const ids = p.relics || (R && R.relics) || [];
        const grid = mk('div', { class: 'relic-grid' });
        ids.forEach((id) => {
          const d = DATA.relics[id] || { name: id, text: '' };
          grid.appendChild(mk('div', { class: 'relic-row' }, relic(id, { size: 'lg', tip: false }), mk('div', {}, mk('b', { text: d.name }), mk('p', { text: typeof DATA.relicText === 'function' ? safe(() => DATA.relicText(id), d.text) : d.text }))));
        });
        if (!ids.length) grid.appendChild(mk('p', { class: 'empty', text: 'No treasures yet. Elites, chests and shops hold them.' }));
        root.appendChild(panel({ kind: 'dark', title: 'Treasures', class: 'relics-panel' }, grid, mk('div', { class: 'row center' }, btn('Close', { kind: 'secondary', size: 'lg', onclick: () => close() }))));
      },
    },
    // a basic deck viewer; screen_node.js replaces it with the full version (sorting, socket UI)
    deck: {
      cancelResult: null,
      open(p, root, close) {
        p = p || {};
        const R = S.run;
        const cards = p.cards || (R && R.deck) || [];
        const mode = p.mode || 'view';
        const grid = mk('div', { class: 'pick-grid many' });
        cards.forEach((inst) => grid.appendChild(card(inst, { size: 'deck', onclick: mode === 'view' ? undefined : () => close(inst.uid) })));
        if (!cards.length) grid.appendChild(mk('p', { class: 'empty', text: 'Nothing here.' }));
        const title = p.title || (mode === 'view' ? 'Your deck (' + cards.length + ')' : 'Choose a card');
        root.appendChild(panel({ kind: 'dark', title, class: 'pick-panel' }, grid, mk('div', { class: 'row center' }, btn(mode === 'view' ? 'Close' : 'Cancel', { kind: 'secondary', size: 'lg', onclick: () => close(mode === 'view' ? undefined : null) }))));
      },
    },
    settings: {
      open(p, root, close) {
        root.appendChild(panel({ kind: 'paper', torn: true, title: 'Settings', class: 'modal settings' }, settingsPanel(), mk('div', { class: 'row center' }, btn('Done', { kind: 'primary', size: 'lg', onclick: () => close() }))));
      },
    },
  };

  // ==================================================================================================================
  // public API
  // ==================================================================================================================
  const api = {
    W, H, scale: 1, px: 1, ox: 0, oy: 0, layers, stageEl: null, opt: UI_OPT,
    screens: {}, overlays, overlay, bus: U.bus(), hooks: S.hooks,
    epoch: 0, current: null, currentName: '', params: null,
    init, resize, frame, setClock, perf, applySettings, setSetting, getSetting, cycleSpeed,
    go, back, live, after, tween, canvasOn, onKey, transition, focusMove,
    modal(o) {
      ensureInit();
      const before = S.ovSeq;
      overlayOpen('modal', o || {});
      const rec = S.overlays.find((r) => r.id === before + 1);
      return (result) => { if (rec) closeOverlay(rec, result); };
    },
    confirm(o) { return overlayOpen('confirm', o || {}); },
    toast, menuButton, announce, anchorEl, floatText, pulse, shake, toStage,
    card, cardUpdate, cardBack, relic, gem, status, heroBadge, stat, btn, setDisabled, panel, hanko, divider, bar, tabs, seg, toggle, slider, settingsPanel,
    icon: iconCanvas, medallion: medalCanvas, vars, el: mk, esc: U.esc, plain: plainOf, resolveCard, kwInfo,
    tip, fail, toTitle,
    setRun(R) { S.run = R; return R; },
    get run() { return S.run; },
    get time() { return S.clock.t; },
    get rotating() { return S.rotating; },
    get busy() { return S.busy || !!S.trans; },
  };
  return api;
})();
