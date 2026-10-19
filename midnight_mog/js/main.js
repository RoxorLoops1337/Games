// Midnight Mog: the integrator. Builds the App object (docs/UI.md), owns the frame loop, the screen router, the persistent bottom
// navigation, saving, the offline welcome-back, the tutorial hand-off and the global error boundary.
//
//   createGame(env)  headless friendly: env = {canvas, window?, document?, storage?, now?, seed?, audio?, tzOffsetMin?, uiOpts?}
//                    returns {app, ui, router, screens, tut, tick(dt), startGame(mode), save(), dispose(), ...}
//   boot()           browser entry: finds #game, creates the game, runs requestAnimationFrame.
//
// Saving: app.setProfile() marks the profile dirty and it is written at the end of the frame; app.save() writes now.
// The profile is also written every 10 seconds, on pagehide, when the tab is hidden and on beforeunload. A damaged main save
// falls back to the backup, and a copy of the damaged text is kept under midnight_mog_save_v1_damaged, never thrown away.
import { createUI } from './ui/shell.js';
import { createAudio } from './audio.js';
import { newProfile, loadFromStorage, saveToStorage, tryDeserialize, serialize, SAVE_KEY } from './sim/profile.js';
import { offlineGain, applyOffline, touch } from './sim/offline.js';
import * as TOWN from './sim/town.js';
import { toGlobal } from './sim/progression.js';
import { hash32 } from './data/buildings.js';
import { makeRng } from './rng.js';
import { openCrate } from './sim/loot.js';
import { formatNum, formatTime, drawText, wrapText } from './render/text.js';
import { PAL, rgba } from './palette.js';
import { loadSettings, applySettings, saveSettings, defaultSettings, META_SCREENS } from './ui/screens_meta.js';
import { battleScreen } from './ui/screens_battle.js';
import { DECK_SCREENS } from './ui/screens_deck.js';
import { townScreen } from './ui/screens_town.js';
import { crateScreen } from './ui/screens_crate.js';
import { titleScreen } from './ui/screens_title.js';
import { HUB_SCREENS, NAV_H, NAV_TABS, activeTabOf, drawNav, navBadges } from './ui/screens_hub.js';
import { createTutorial, stepOf, withStep, TUT_DONE } from './ui/tutorial.js';

export const VERSION = '1.0';
export const DAMAGED_KEY = 'midnight_mog_save_v1_damaged';
export const PREV_KEY = 'midnight_mog_save_v1_prev';
const AUTOSAVE_EVERY = 10;              // seconds
const NAV_HIDDEN = new Set(['title', 'battle', 'nine_lives']);
const NO_BACK = new Set(['title', 'battle']);
const OFFLINE_MIN_SECONDS = 60;

/** localStorage-like object that lives in memory (private windows, blocked storage, tests). */
export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, get size() { return m.size; } };
}
function pickStorage(win) {
  try {
    const s = win && win.localStorage;
    if (!s) return null;
    const k = '__mog_probe';
    s.setItem(k, '1'); s.removeItem(k);
    return s;
  } catch (e) { return null; }
}
function randomSeed(win) {
  try {
    const c = win && win.crypto;
    if (c && c.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] >>> 0; }
  } catch (e) { /* fall through */ }
  return (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
}

/**
 * The free key of the tutorial should open on something worth a cheer. Crate rolls are a pure function of (profile seed, open
 * counters), so look for a seed whose first free alley crate gives a new cat or card of rare or better. Odds are untouched:
 * this only picks which of the equally likely new games the player gets, and every later roll uses the normal tables.
 */
export function pickTutorialSeed(base, nowMs) {
  const start = base >>> 0;
  let card = -1;
  for (let i = 0; i < 600; i++) {
    const seed = (start + i * 7919) >>> 0;
    try {
      const p0 = newProfile(seed, nowMs);
      p0.town.keys = { alley_crate: 1 };
      const rng = makeRng(hash32(seed, 'crate:alley_crate:0:0:1k'));
      const r = openCrate(p0, 'alley_crate', rng, { count: 1, useKey: true });
      const d = r.drops[0];
      if (!d || !d.isNew || d.rarity === 'common') continue;
      if (d.kind === 'cat') return seed;                 // a new cat is the best first crate
      if (d.kind === 'card' && card < 0) card = seed;     // a new card is the fallback
    } catch (e) { return start; }
  }
  return card >= 0 ? card : start;
}

export function createGame(env = {}) {
  const win = env.window !== undefined ? env.window : (typeof window !== 'undefined' ? window : null);
  const doc = env.document !== undefined ? env.document : (typeof document !== 'undefined' ? document : null);
  const canvas = env.canvas || (doc && doc.getElementById ? doc.getElementById('game') : null);
  if (!canvas) throw new Error('midnight_mog: no canvas');
  const clock = env.now || (() => Date.now());
  const tz = env.tzOffsetMin !== undefined ? env.tzOffsetMin : (() => { try { return new Date().getTimezoneOffset(); } catch (e) { return 0; } })();
  let storage = env.storage || pickStorage(win);
  let notice = null;
  if (!storage) { storage = memoryStorage(); notice = 'Saving is blocked in this browser, so progress will be lost when you close the tab. Try a normal (non private) window.'; }

  // ------------------------------------------------------------------------------------------ settings, audio, ui
  const settings = loadSettings(storage);
  let audio = null;
  if (env.audio !== undefined) audio = env.audio;
  else { try { audio = createAudio(); } catch (e) { audio = null; } }

  const ui = createUI(canvas, env.uiOpts || {});
  const baseSafe = { top: 0, bottom: 0, left: 0, right: 0 };
  const origResize = ui.resize;
  ui.resize = function (...a) { const r = origResize.apply(ui, a); Object.assign(baseSafe, ui.safe); return r; };
  Object.assign(baseSafe, ui.safe);
  ui.onSound = (name) => { if (audio) { try { audio.sfx(name); } catch (e) { /* audio is optional */ } } };

  // ------------------------------------------------------------------------------------------ the App
  const dayOf = (ms) => Math.max(0, Math.floor((ms - tz * 60000) / 86400000));
  let dirty = false, saveWarned = false, pendingOffline = null, offlineShown = false, saveClock = 0, lastDay = -1, badgeAt = -9, badges = { battle: 0, deck: 0, town: 0, crates: 0, more: 0 };
  let frameNo = 0;
  let crash = null, crashCount = 0, crashAt = 0, started = false, disposed = false;

  const app = {
    profile: null,
    settings,
    audio,
    hasSave: false,
    saveInfo: null,
    bootNotice: notice,
    now: () => clock(),
    dayIndex: () => dayOf(clock()),
    toast: (msg, kind) => ui.toast(msg, kind || 'info'),
    rng: (key) => makeRng(hash32((app.profile && app.profile.seed) || 1, key)),
    setProfile(p) { if (!p) return; app.profile = p; dirty = true; },
    save() { return save(); },
    router: null,
    nav: null,
    startGame: null,
    io: undefined,
  };

  // ------------------------------------------------------------------------------------------ saving
  function save() {
    if (!app.profile) return false;
    dirty = false;
    // lastSeen only moves while nothing is waiting in the welcome-back panel, so closing the tab with it open loses nothing
    if (!pendingOffline) app.profile = touch(app.profile, clock());
    const ok = saveToStorage(app.profile, storage);
    if (!ok && !saveWarned) { saveWarned = true; ui.toast('Could not save. Storage may be full or blocked.', 'error'); }
    if (ok) saveWarned = false;
    return ok;
  }

  // ------------------------------------------------------------------------------------------ load
  function loadProfile() {
    let mainText = null;
    try { mainText = storage.getItem(SAVE_KEY); } catch (e) { mainText = null; }
    const loaded = loadFromStorage(storage);
    if (mainText && !tryDeserialize(mainText)) {
      try { storage.setItem(DAMAGED_KEY, mainText.slice(0, 2e6)); } catch (e) { /* keep going */ }
      notice = loaded
        ? 'Your save looked damaged, so the last good backup was restored. A copy of the damaged file is kept in this browser.'
        : 'Your save could not be read, so a fresh game was prepared. A copy of the damaged file is kept in this browser; Settings can import it if you have a backup.';
    }
    app.bootNotice = notice;
    if (loaded) {
      app.profile = loaded; app.hasSave = true;
    } else {
      app.profile = newProfile(env.seed !== undefined ? env.seed : randomSeed(win), clock());
      app.hasSave = false;
    }
    refreshSaveInfo();
  }
  function refreshSaveInfo() {
    const p = app.profile;
    if (!app.hasSave) { app.saveInfo = null; return; }
    app.saveInfo = { stage: Math.max(1, toGlobal(p.progress.district, p.progress.stage)), ago: Math.max(0, (clock() - (p.lastSeen || 0)) / 1000) };
  }

  // ------------------------------------------------------------------------------------------ screens and router
  const screens = {};
  for (const s of [titleScreen, battleScreen, townScreen, crateScreen, ...DECK_SCREENS, ...META_SCREENS, ...HUB_SCREENS]) screens[s.id] = s;
  let cur = { id: '', screen: null, params: null };
  const stack = [];

  function switchTo(id, params, o) {
    o = o || {};
    const next = screens[id];
    if (!next) { ui.toast('Unknown screen ' + id, 'error'); return false; }
    if (cur.screen && !o.back && !(params && params.reset) && cur.id !== id && !NO_BACK.has(cur.id) && !o.replace) {
      stack.push({ id: cur.id, params: cur.params });
      if (stack.length > 14) stack.shift();
    }
    if (params && params.reset) stack.length = 0;
    if (cur.screen && cur.screen.exit) { try { cur.screen.exit(app); } catch (e) { reportError(e, 'exit ' + cur.id); } }
    ui.toastY = undefined;
    cur = { id, screen: next, params: params || null };
    try { next.enter(app, params || {}); } catch (e) {
      reportError(e, 'enter ' + id);
      if (id !== 'hub') { ui.toast('That screen hiccuped. Back to the hub.', 'warn'); cur = { id: '', screen: null, params: null }; return switchTo('hub', {}, { replace: true }); }
      throw e;
    }
    return true;
  }
  const router = {
    go(id, params, o) {
      const kind = (o && o.kind) || (id === 'battle' ? 'iris' : 'fade');
      if (!cur.screen || ui.transitioning || (ui.trans && ui.trans.fired)) return switchTo(id, params, o);
      ui.transition(kind, () => switchTo(id, params, o));
      return true;
    },
    back() {
      let e = stack.pop();
      while (e && e.id === cur.id) e = stack.pop();
      const to = e || { id: 'hub', params: {} };
      return router.go(to.id, to.params, { back: true, kind: 'fade' });
    },
    get current() { return cur.id; },
    get depth() { return stack.length; },
  };
  app.router = router;
  app.nav = (tabId) => {
    const tab = NAV_TABS.find((t) => t.id === tabId);
    if (!tab) return;
    if (cur.id === tab.screen) return;
    router.go(tab.screen, { reset: true }, { kind: 'fade' });
  };

  // ------------------------------------------------------------------------------------------ tutorial
  const tut = createTutorial(app);

  function routeAfterStart() {
    const plan = stepOf(app.profile) < TUT_DONE ? tut.begin() : null;
    if (plan && plan.screen === 'battle') return router.go('battle', tut.battleParams(), { kind: 'iris' });
    if (plan) return router.go(plan.screen, { reset: true }, { kind: 'fade' });
    return router.go('hub', { reset: true }, { kind: 'fade' });
  }
  app.startGame = function (mode) {
    if (started && cur.id !== 'title') return;
    started = true;
    if (audio) { try { audio.resume(); } catch (e) { /* optional */ } }
    const now = clock();
    if (mode === 'new') {
      try { const prev = storage.getItem(SAVE_KEY); if (prev) storage.setItem(PREV_KEY, prev); } catch (e) { /* ignore */ }
      const seed = env.seed !== undefined ? env.seed : pickTutorialSeed(randomSeed(win), now);
      let p = newProfile(seed, now);
      p = withStep(p, 1);
      p = TOWN.refresh(p, dayOf(now));
      app.profile = p; app.hasSave = true; pendingOffline = null; offlineShown = false;
      save();
    } else {
      let p = app.profile;
      p = TOWN.refresh(p, dayOf(now));
      app.profile = p;
      if (stepOf(p) >= TUT_DONE) {
        const gain = offlineGain(p, now);
        if (gain.seconds >= OFFLINE_MIN_SECONDS && (gain.fish > 0 || gain.yarn > 0)) { pendingOffline = gain; offlineShown = false; }
      }
      dirty = true;
    }
    lastDay = dayOf(now);
    routeAfterStart();
  };

  // ------------------------------------------------------------------------------------------ offline welcome-back
  function maybeOfflineDialog() {
    if (!pendingOffline || offlineShown || tut.active || cur.id === 'title' || cur.id === 'battle' || ui.hasDialog() || ui.transitioning) return;
    offlineShown = true;
    const g = pendingOffline;
    const bits = [];
    if (g.fish > 0) bits.push(formatNum(g.fish) + ' fish');
    if (g.yarn > 0) bits.push(formatNum(g.yarn) + ' yarn');
    ui.dialog({
      id: 'offline', title: 'Welcome back', dismiss: false, height: 118,
      text: 'The cats kept the lights on for ' + formatTime(g.seconds) + (g.capped ? ' (that is the cap, nap domes raise it)' : '') + '. They earned ' + bits.join(' and ') + ' while you were away.',
      buttons: [{ id: 'ok', label: 'COLLECT', kind: 'positive' }],
      onPick: () => {
        const r = applyOffline(app.profile, clock());
        pendingOffline = null;
        app.setProfile(r.profile);
        save();
        if (audio) { try { audio.sfx('reward_key'); } catch (e) { /* optional */ } }
      },
    });
  }

  // ------------------------------------------------------------------------------------------ frame
  function navVisible() {
    if (!cur.screen || NAV_HIDDEN.has(cur.id) || crash) return false;
    if (cur.id === 'crates' && crateScreen.state && crateScreen.state.mode !== 'shop') return false;
    return true;
  }
  function layoutFor(navShown) {
    ui.safe.bottom = baseSafe.bottom + (navShown ? NAV_H : 0);
    ui.content.h = Math.max(100, ui.h - ui.safe.top - ui.safe.bottom);
  }

  // Dynamic resolution. A battle whose frames take longer than ~23 ms for two half second windows in a row gets a smaller backing store
  // (x0.78 per step, never below 0.5); the canvas is stretched by CSS so layout, input and text sizes do not change. Settings quality
  // 'low' caps the scale at 0.75. The scale is kept for the session: a device that needed it once will need it again.
  const ADAPT = { n: 0, sum: 0, bad: 0, auto: 1 };
  function applyRenderScale() {
    const cap = (app.settings && app.settings.quality === 'low') ? 0.75 : (app.settings && app.settings.quality === 'medium') ? 0.9 : 1;
    const want = Math.min(cap, ADAPT.auto);
    if (Math.abs(want - ui.renderScale) < 0.001) return;
    ui.renderScale = want;
    try { ui.resize(); } catch (e) { /* ignore */ }
  }
  function adaptRender(dtRaw) {
    if (cur.id !== 'battle' || ui.transitioning) { ADAPT.n = 0; ADAPT.sum = 0; return; }
    if (!(dtRaw > 0) || dtRaw > 0.25) return;       // tab switches and stalls say nothing about the renderer
    ADAPT.sum += dtRaw; ADAPT.n++;
    if (ADAPT.n < 30) return;
    const avg = ADAPT.sum / ADAPT.n; ADAPT.n = 0; ADAPT.sum = 0;
    ADAPT.bad = avg > 0.0235 ? ADAPT.bad + 1 : 0;
    if (ADAPT.bad >= 2 && ADAPT.auto > 0.5) { ADAPT.auto = Math.max(0.5, ADAPT.auto * 0.78); ADAPT.bad = 0; applyRenderScale(); }
  }

  function tick(dtRaw) {
    if (disposed) return;
    if (started && !crash) { adaptRender(dtRaw); if (frameNo++ % 60 === 0) applyRenderScale(); }
    let dt = Number.isFinite(dtRaw) ? dtRaw : 1 / 60;
    dt = dt > 0.25 ? 1 / 60 : Math.min(0.1, Math.max(0, dt));
    if (crash) { drawCrash(dt); return; }
    try {
      frameBody(dt);
    } catch (e) {
      reportError(e, 'frame ' + cur.id);
      recoverUI();
      crashCount++;
      const nowT = clock();
      if (nowT - crashAt > 5000) crashCount = 1;
      crashAt = nowT;
      crash = { message: String((e && e.message) || e).slice(0, 160), screen: cur.id, fatal: crashCount >= 3 };
    }
  }
  function frameBody(dt) {
    const showNav = navVisible();
    layoutFor(showNav);
    ui.begin(dt);
    const ctx = ui.ctx;
    if (!cur.screen) { ui.clear(PAL.void); ui.end(); return; }
    if (tut.active) tut.update(app, dt, ui, cur.id);
    cur.screen.update(app, dt, ui);
    if (audio && cur.id !== 'battle') { try { audio.update(dt); } catch (e) { /* optional */ } }
    cur.screen.draw(ctx, app, ui);
    if (showNav) {
      const t = ui.t;
      if (t - badgeAt > 0.5) { badges = navBadges(app.profile, clock(), dayOf(clock())); badgeAt = t; }
      const tap = drawNav(ctx, ui, app, activeTabOf(cur.id), badges, baseSafe.bottom);
      if (tap) app.nav(tap);
    }
    if (tut.active) tut.draw(ctx, app, ui, cur.id);
    maybeOfflineDialog();
    ui.end();
    // housekeeping
    saveClock += dt;
    if (saveClock >= AUTOSAVE_EVERY) { saveClock = 0; save(); } else if (dirty) save();
    const day = dayOf(clock());
    if (started && day !== lastDay) { lastDay = day; app.setProfile(TOWN.refresh(app.profile, day)); }
  }
  function recoverUI() {
    try { ui.resize(); } catch (e) { /* ignore */ }
    try { ui.closeDialog(); } catch (e) { /* ignore */ }
    try { ui.end(); } catch (e) { /* ignore */ }
    try { ui.layer = 0; } catch (e) { /* ignore */ }
  }
  function reportError(e, where) {
    try { if (typeof console !== 'undefined' && !env.quiet) console.error('[midnight_mog] ' + where + ':', e); } catch (err) { /* ignore */ }
    lastError = { where, message: String((e && e.message) || e) };
  }
  let lastError = null;

  // ------------------------------------------------------------------------------------------ the error panel (the save is never touched here)
  function drawCrash(dt) {
    let ok = true;
    try {
      layoutFor(false);
      ui.begin(dt);
      const ctx = ui.ctx, c = ui.content;
      ui.clear(PAL.void);
      ui.background('rooftop_row', { dim: 0.5 });
      const w = Math.min(c.w - 24, 440), x = c.x + (c.w - w) / 2;
      const h = 372, y = Math.max(ui.safe.top + 12, (ui.h - h) / 2);
      ui.panel({ x, y, w, h }, { title: 'WHOOPS', glow: true });
      drawText(ctx, 'The cats knocked something over.', x + w / 2, y + 68, { size: 17, kind: 'display', align: 'center', color: PAL.bone, maxWidth: w - 32 });
      const lines = wrapText(ctx, 'Your progress is safe. It was saved before this happened and nothing below touches it.', w - 40, { size: 14, kind: 'body', weight: 600 });
      lines.forEach((l, i) => drawText(ctx, l, x + w / 2, y + 98 + i * 18, { size: 14, kind: 'body', weight: 600, align: 'center', color: PAL.boneDim, maxWidth: w - 32 }));
      drawText(ctx, crash.message, x + w / 2, y + 98 + lines.length * 18 + 12, { size: 11, kind: 'body', weight: 600, align: 'center', color: rgba(PAL.magenta, 0.9), maxWidth: w - 32 });
      let by = y + 178;
      if (!crash.fatal && ui.button('crash:retry', { x: x + 20, y: by, w: w - 40, h: 52 }, 'TRY AGAIN', { kind: 'primary', size: 20 })) recoverTo(crash.screen && screens[crash.screen] && crash.screen !== 'battle' ? crash.screen : 'hub');
      by += 62;
      if (ui.button('crash:home', { x: x + 20, y: by, w: w - 40, h: 48 }, 'BACK TO THE HUB', { kind: 'secondary', size: 17 })) recoverTo('hub');
      by += 58;
      const half = (w - 48) / 2;
      if (ui.button('crash:export', { x: x + 20, y: by, w: half, h: 46 }, 'EXPORT SAVE', { kind: 'info', size: 14 })) exportSave();
      if (ui.button('crash:reload', { x: x + 28 + half, y: by, w: half, h: 46 }, 'RELOAD GAME', { kind: 'secondary', size: 14 })) { try { win.location.reload(); } catch (e) { recoverTo('hub'); } }
      ui.end();
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      // the ui itself is broken: bare canvas message and a tap to reload
      try {
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#0b0716'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f4ecff'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('The cats knocked something over. Your save is safe.', canvas.width / 2, canvas.height / 2);
        ctx.fillText('Reload the page to continue.', canvas.width / 2, canvas.height / 2 + 28);
      } catch (e2) { /* nothing left to do */ }
    }
  }
  function recoverTo(id) {
    crash = null;
    cur = { id: '', screen: null, params: null };
    try { switchTo(id, {}, { replace: true }); } catch (e) { crash = { message: 'Could not open ' + id, screen: '', fatal: true }; }
  }
  function exportSave() {
    try {
      const text = serialize(app.profile);
      if (win && doc && win.URL && win.Blob) {
        const a = doc.createElement('a');
        a.href = win.URL.createObjectURL(new win.Blob([text], { type: 'application/json' }));
        a.download = 'midnight_mog_save.json';
        doc.body.appendChild(a); a.click(); a.remove();
      }
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------------------------------ lifecycle hooks (browser)
  const listeners = [];
  function on(target, type, fn, opts) { if (target && target.addEventListener) { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); } }
  function pauseBattle() {
    try {
      const st = battleScreen.state;
      if (cur.id === 'battle' && st && st.b && !st.b.over && !st.paused && !st.result) battleScreen.ctl.pause();
    } catch (e) { /* ignore */ }
  }
  if (win) {
    on(win, 'pagehide', () => { save(); });
    on(win, 'beforeunload', () => { save(); });
    on(win, 'error', (ev) => { reportError(ev && (ev.error || ev.message), 'window'); });
    on(win, 'unhandledrejection', (ev) => { reportError(ev && ev.reason, 'promise'); });
    const unlock = () => { if (audio) { try { audio.resume(); } catch (e) { /* optional */ } } };
    // touch pointerdown is not a user activation in Chrome (the context would be born suspended and log a warning): wait for pointerup
    on(win, 'pointerdown', (ev) => { if (!ev || ev.pointerType === 'mouse') unlock(); }, { capture: true });
    on(win, 'pointerup', unlock, { capture: true });
    on(win, 'keydown', unlock, { capture: true });
  }
  if (doc) {
    on(doc, 'visibilitychange', () => {
      if (doc.hidden) { pauseBattle(); if (started) save(); }
      else if (started && !pendingOffline && !tut.active && cur.id !== 'battle') {
        const g = offlineGain(app.profile, clock());
        if (g.seconds >= 300 && (g.fish > 0 || g.yarn > 0)) { pendingOffline = g; offlineShown = false; }
      }
    });
  }

  // ------------------------------------------------------------------------------------------ boot
  loadProfile();
  applySettings(app, ui);
  switchTo('title', {});

  const game = {
    app, ui, router, screens, tut, settings, storage, canvas,
    tick, save, startGame: app.startGame,
    get screenId() { return cur.id; },
    get crash() { return crash; },
    get lastError() { return lastError; },
    get pendingOffline() { return pendingOffline; },
    get badges() { return badges; },
    get navShown() { return navVisible(); },
    get renderScale() { return ui.renderScale; },
    triggerError(msg) { throw new Error(msg || 'test error'); },
    saveSettingsNow() { saveSettings(app.settings, storage); },
    dispose() { disposed = true; for (const [t, ty, fn, o] of listeners) { try { t.removeEventListener(ty, fn, o); } catch (e) { /* ignore */ } } },
  };
  return game;
}

// ------------------------------------------------------------------------------------------------ browser entry
export function boot() {
  const canvas = document.getElementById('game');
  const game = createGame({ canvas });
  window.__midnightMog = game;
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.remove();
  window.__mogReady = true;
  let last = performance.now();
  function loop(ts) {
    requestAnimationFrame(loop);
    const raw = (ts - last) / 1000;
    last = ts;
    if (document.hidden) return;
    game.tick(raw);
  }
  requestAnimationFrame((ts) => { last = ts; loop(ts); });
  return game;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.getElementById && document.getElementById('game') && !window.__mogNoBoot) {
  try { boot(); } catch (e) { try { console.error('[midnight_mog] boot failed', e); } catch (e2) { /* ignore */ } window.__mogBootError = String((e && e.message) || e); }
}
