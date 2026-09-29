// UI core suite: the stage, the screen manager, overlays, keys, toasts, tooltips, every shared component, settings, and GAME (main.js).
//
// The modules other engineers write at the same time (art, audio, meta, run, combat, map, the data_* content files) are LEFT OUT of the
// sandbox with `skip`, and small fakes are installed into the page instead, so this suite tests ui.js and main.js and nothing else.
// A last section boots against whatever real modules exist as a smoke test that only asserts UI-side behaviour (no console.error).
import { boot, harness } from './rogue_book_lib.mjs';

const t = harness('rogue_book ui');
const SKIP = ['data_*', 'art*', 'audio', 'combat', 'map', 'run', 'meta'];

// ---------------------------------------------------------------------------------------------------- fakes installed into the page
const FAKES = `
globalThis.__log = { sfx: [], music: [], vol: [], calls: [], icons: [], art: [], medals: [], speed: [], saves: [], records: [], claims: [], chapters: [], order: [], cleared: 0, checks: 0, chEnd: 0, n: 0, next: 2, chapterEnded: false, failSave: false, saved: null, newRun: null };
globalThis.AUDIO = { ready: false, init() { __log.calls.push('init'); }, resume() { __log.calls.push('resume'); }, suspend() { __log.calls.push('suspend'); }, sfx(id) { __log.sfx.push(id); }, music(id) { __log.music.push(id); }, setVolume(k, v) { __log.vol.push([k, v]); }, duck() {}, intensity() {} };
globalThis.ART = { res: 1, tk: { opt: {} }, sprite: Object.assign(function () {}, { clear() { __log.calls.push('spriteClear'); } }),
  icon: { draw(ctx, kind, id, x, y, size) { __log.icons.push([kind, id, size]); } }, card: { draw(ctx, id, w, h) { __log.art.push([typeof id === 'string' ? id : id.id, w, h]); } }, hero: { medallion(ctx, id) { __log.medals.push(id); } } };
globalThis.SCENE = { speed(k) { __log.speed.push(k); } };
globalThis.META = { _s: {}, _t: {}, get(k) { return this._s[k]; }, set(k, v) { this._s[k] = v; }, save() { return true; }, load() { __log.order.push('META.load'); },
  saveRun(R) { __log.saves.push(R.id); return !__log.failSave; }, loadRun() { return __log.saved; }, clearRun() { __log.cleared++; }, hasRun() { return !!__log.saved; },
  unlockedSet() { return { card: ['x'], relic: [], gem: [] }; }, tutorial(f) { return !!this._t[f]; }, setTutorial(f) { this._t[f] = 1; },
  check() { __log.checks++; return []; }, recordRun(R, outcome) { __log.records.push(outcome); return { inkstones: 7, newAchievements: [] }; }, dailySeed() { return 20260101; },
  markLore() {}, trialMax() { return 0; }, isUnlocked() { return true; },
  bus: (function () { const m = {}; return { on(t, f) { (m[t] = m[t] || []).push(f); }, emit(t, d) { (m[t] || []).forEach((f) => f(d)); } }; })() };
globalThis.MAP = { key(q, r) { return q + ',' + r; }, neighbors() { return []; } };
globalThis.RUN = {
  newRun(o) { __log.newRun = o; return { id: 'r' + (++__log.n), seed: o.seed, chapter: 1, heroes: o.heroes.map((id) => ({ id, hp: 50, maxHp: 50 })), deck: [], relics: [], gems: [], brushes: [], gold: 60, ink: 10, inkMax: 14, map: { pos: { q: 0, r: 0 } }, node: null, stats: {}, flags: {} }; },
  startChapter(R, n) { R.chapter = n; R.map = { pos: { q: 0, r: 0 } }; __log.chapters.push(n); },
  dailyHeroes() { return ['kuro', 'suzu']; },
  finishNode(R) { R.node = null; return { chapterEnded: __log.chapterEnded }; },
  chapterEnd() { __log.chEnd++; return { next: __log.next, healed: [], maxHp: 8 }; },
  summary(R) { return { score: 123, victory: false, chapter: R.chapter, heroes: R.heroes }; },
  combatInit() { return {}; }, combatDone() {}, claim(R, rw, choice) { __log.claims.push(choice); },
};
`;

const CARDS = {
  t_slash: { name: 'Test Slash', hero: 'hanae', type: 'attack', rarity: 'common', cost: 1, fx: [{ op: 'dmg', n: 6 }], up: { fx: [{ op: 'dmg', n: 9 }] }, slots: ['red'], art: { m: 'slash', c: 'rose', hero: true }, flavor: 'A test quote.' },
  t_guard: { name: 'Test Guard With A Very Long Name', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 2, fx: [{ op: 'block', n: 8 }], up: { cost: 1 }, kw: ['exhaust'], slots: ['blue', 'any'], art: { m: 'shield', c: 'azure' } },
  t_rare: { name: 'Test Bloom', hero: 'suzu', type: 'power', rarity: 'rare', cost: 3, fx: [{ op: 'status', s: 'bloom', n: 2 }], up: { cost: 2 }, slots: ['gold', 'gold'], art: { m: 'bloom', c: 'gold' } },
  t_x: { name: 'Test Storm', hero: 'raiga', type: 'attack', rarity: 'rare', cost: 'X', fx: [{ op: 'dmg', n: 4, hits: 2 }], up: { kw: ['retain'] }, slots: [], art: { m: 'lightning', c: 'amber' } },
  t_start: { name: 'Test Jab', hero: 'raiga', type: 'attack', rarity: 'starter', cost: 0, fx: [{ op: 'dmg', n: 3 }], up: { fx: [{ op: 'dmg', n: 5 }] }, slots: ['red'], art: { m: 'fist', c: 'amber' } },
  t_curse: { name: 'Test Regret', hero: 'curse', type: 'curse', rarity: 'token', kw: ['unplayable'], fx: [], slots: [], art: { m: 'skull', c: 'ink' } },
  t_status: { name: 'Test Blot', hero: 'status', type: 'status', rarity: 'token', kw: ['unplayable'], fx: [], slots: [], art: { m: 'void', c: 'ash' } },
};
const GEMS = { t_ruby: { name: 'Test Ruby', color: 'red', tier: 1, mod: { dmg: 2 }, art: { cut: 'round' } }, t_topaz: { name: 'Test Topaz', color: 'gold', tier: 2, mod: { draw: 1 }, art: { cut: 'star' } } };

// opts.autoboot here means: install the fakes first, THEN run GAME.boot() (the loader's own autoboot would fire before the fakes exist)
function fresh(opts = {}) {
  const auto = !!opts.autoboot;
  const g = boot({ only: ['ui', 'main'], skip: SKIP, ...opts, autoboot: false });
  if (g._errors.length) throw new Error('boot errors: ' + JSON.stringify(g._errors.map((e) => e.message)));
  g._run(FAKES);
  g.DATA.add('cards', JSON.parse(JSON.stringify(CARDS)));
  g.DATA.add('gems', JSON.parse(JSON.stringify(GEMS)));
  g.log = g._run('__log');
  if (auto) g.GAME.boot();
  return g;
}
const $$ = (g, sel) => Array.from(g._doc.querySelectorAll(sel));
const $ = (g, sel) => g._doc.querySelector(sel);
const inst = (id, up, gems) => ({ uid: 1, id, up: up ? 1 : 0, gems: gems || [] });
const settle = (g) => g._settle();
const errCount = (g) => g._console.error.length;

// ==================================================================================================== boot and namespace
await t.test('ui.js and main.js load headless, declare their namespaces and touch nothing while loading', () => {
  const g = boot({ only: ['ui', 'main'], skip: SKIP });
  t.eq(g._errors.length, 0, 'no load errors');
  t.eq(typeof g.UI, 'object', 'UI is defined');
  t.eq(typeof g.GAME, 'object', 'GAME is defined');
  ['go', 'overlay', 'modal', 'confirm', 'toast', 'card', 'relic', 'gem', 'status', 'heroBadge', 'stat', 'btn', 'tip', 'transition', 'tween', 'frame', 'applySettings', 'toStage', 'announce', 'anchorEl', 'menuButton', 'cardBack', 'floatText', 'pulse', 'shake', 'onKey', 'canvasOn', 'after', 'live', 'init', 'resize'].forEach((k) => t.ok(k in g.UI, 'UI.' + k + ' exists'));
  ['boot', 'newRun', 'continueRun', 'enterNode', 'nodeDone', 'abandon', 'toTitle', 'debug'].forEach((k) => t.ok(k in g.GAME, 'GAME.' + k + ' exists'));
  ['open', 'quickRun', 'win', 'lose', 'setGold', 'addRelic', 'skipChapter', 'freeze', 'tick', 'combat'].forEach((k) => t.eq(typeof g.GAME.debug[k], 'function', 'GAME.debug.' + k));
  t.eq(g.UI.W, 1280, 'stage width'); t.eq(g.UI.H, 720, 'stage height');
  t.ok(g.UI.bus && typeof g.UI.bus.emit === 'function', 'UI.bus exists from load');
});

// ==================================================================================================== stage, scaling, portrait
await t.test('resize: scale, letterbox offset, pixel ratio, compact class, canvas backing store', () => {
  const g = fresh({ dpr: 2 });
  g.UI.init();
  const stage = $(g, '#stage');
  t.eq(g.UI.scale, 1, 'scale 1 at 1280x720'); t.eq(g.UI.px, 2, 'px = clamp(scale*dpr,1,2) = 2 at dpr 2');
  t.eq($(g, '#view').width, 2560, 'view backing store is 1280 * px'); t.eq($(g, '#over').height, 1440, 'over backing store is 720 * px');
  t.ok(g.log.calls.indexOf('spriteClear') >= 0, 'ART.sprite.clear runs when px changes');
  t.eq(g._run('ART.res'), 2, 'ART.res mirrors UI.px');
  g._resize(640, 360);
  t.eq(g.UI.scale, 0.5, 'scale 0.5'); t.ok(stage.classList.contains('compact'), 'compact below 0.75');
  t.ok(/scale\(0\.5\)/.test(stage.style.transform), 'stage transform scales');
  t.eq(stage.style.getPropertyValue('--scale'), '0.5', '--scale is set for --hit');
  g._resize(1600, 720);
  t.eq(g.UI.scale, 1, 'letterboxed by height'); t.eq(g.UI.ox, 160, 'centred horizontally'); t.eq(g.UI.oy, 0, 'no vertical offset');
  t.near(g.UI.toStage(160 + 640, 360).x, 640, 0.001, 'toStage undoes the offset'); t.near(g.UI.toStage(160 + 640, 360).y, 360, 0.001, 'toStage y');
  t.ok(!stage.classList.contains('compact'), 'compact class removed again');
  g._resize(1280, 720);
  t.eq(g.UI.px, 2, 'px back to 2');
});

await t.test('init is idempotent: no listener growth across repeated init and screen changes', async () => {
  const g = fresh();
  g.UI.init();
  const before = { key: g._listeners('keydown'), rs: g._listeners('resize'), vis: g._listeners('visibilitychange') };
  g.UI.init(); g.UI.init();
  g.UI.screens.a = { enter() {} }; g.UI.screens.b = { enter(p, r) { g.UI.onKey(() => {}); g.UI.canvasOn('pointerdown', () => {}); } };
  for (let i = 0; i < 5; i++) { await g.UI.go(i % 2 ? 'a' : 'b', { i }, { force: true }); }
  t.eq(g._listeners('keydown'), before.key, 'keydown listeners stay put'); t.eq(g._listeners('resize'), before.rs, 'resize listeners stay put'); t.eq(g._listeners('visibilitychange'), before.vis, 'visibility listeners stay put');
  t.eq(g._listeners('pointerdown') <= 2, true, 'canvas handlers are removed at leave (only the audio arm listener remains on document)');
});

await t.test('portrait: the rotate panel shows, Play anyway hides it, rotating back resets, audio is suspended and resumed', () => {
  const g = fresh();
  g.UI.init();
  t.ok(!$(g, '#rotate') || $(g, '#rotate').hidden, 'no rotate panel in landscape');
  g._resize(390, 844);
  const r = $(g, '#rotate');
  t.ok(r && !r.hidden, 'rotate panel is visible in portrait on a small screen'); t.ok(g.UI.rotating, 'UI.rotating');
  t.ok(g.log.calls.indexOf('suspend') >= 0, 'AUDIO.suspend when the panel appears');
  t.ok(/sideways/i.test(r.textContent), 'friendly copy'); t.ok(Array.from(r.querySelectorAll('button')).some((b) => /play anyway/i.test(b.textContent)), 'Play anyway button');
  let calls = 0;
  g.UI.screens.a = { enter() {}, update() { calls++; } };
  g.UI.go('a');
  g.UI.frame(100); g.UI.frame(116);
  t.eq(calls, 0, 'UI.frame does nothing while the rotate panel is up');
  Array.from(r.querySelectorAll('button')).find((b) => /play anyway/i.test(b.textContent)).click();
  t.ok(r.hidden && !g.UI.rotating, 'Play anyway dismisses it'); t.ok(g.log.calls.lastIndexOf('resume') > g.log.calls.indexOf('suspend'), 'AUDIO.resume after');
  g._resize(1280, 720); g._resize(390, 844);
  t.ok(!$(g, '#rotate').hidden, 'turning landscape and back to portrait asks again');
  g._resize(844, 390);
  t.ok($(g, '#rotate').hidden, 'landscape phone: no panel');
  g._resize(800, 900);
  t.ok($(g, '#rotate').hidden, 'a tall window with a big scale does not trigger it (scale >= 0.6)');
});

// ==================================================================================================== screen manager
await t.test('screen lifecycle: enter(params, root), leave, epoch, live, disposal of registered helpers', async () => {
  const g = fresh();
  const log = [];
  let offCalled = 0, afterFired = 0, tweenDone = 0, keyHits = 0;
  g.UI.screens.a = {
    enter(p, root) {
      log.push('a.enter:' + (p && p.x) + ':' + root.className);
      this.live = g.UI.live();
      g.UI.after(50, () => { afterFired++; });
      g.UI.tween({ v: 0 }, { v: 1 }, 100).then(() => { tweenDone++; });
      g.UI.onKey(() => { keyHits++; });
      root.appendChild(g._doc.createElement('b'));
    },
    leave() { log.push('a.leave'); },
  };
  g.UI.screens.b = { enter(p, root) { log.push('b.enter:' + root.className); } };
  await g.UI.go('a', { x: 7 });
  t.deep(log, ['a.enter:7:screen s-a'], 'enter gets params and a fresh root');
  t.eq(g.UI.currentName, 'a', 'currentName'); t.eq(g.UI.current, g.UI.screens.a, 'current is the screen object'); t.eq(g.UI.epoch, 1, 'epoch 1 after the first go');
  t.eq($$(g, '#screens .screen').length, 1, 'root is in #screens'); t.ok(g.UI.screens.a.live(), 'live() is true while current');
  t.deep(g.UI.params, { x: 7 }, 'UI.params');
  await g.UI.go('b');
  t.deep(log.slice(1), ['a.leave', 'b.enter:screen s-b'], 'leave then enter');
  t.eq(g.UI.epoch, 2, 'epoch increments on every go'); t.ok(!g.UI.screens.a.live(), 'old live() turns false');
  t.eq($$(g, '#screens .screen').length, 1, 'old root removed'); t.eq($$(g, '#screens .s-a').length, 0, 'no s-a left');
  await g._tick(300);
  t.eq(keyHits, 0, 'key handlers of a left screen are disposed');
  g._key('x');
  t.eq(keyHits, 0, 'and never fire');
});

await t.test('UI.go: a leave() that throws still removes the root; a screen without enter works; go is serialised FIFO', async () => {
  const g = fresh();
  const order = [];
  g.UI.screens.a = { enter() { order.push('a'); }, leave() { throw new Error('boom in leave'); } };
  g.UI.screens.b = { enter() { order.push('b'); } };
  g.UI.screens.c = {};
  g.UI.screens.d = { enter() { order.push('d'); return new Promise((r) => setTimeout(r, 200)).then(() => order.push('d.done')); } };
  await g.UI.go('a');
  await g.UI.go('b');
  t.eq($$(g, '#screens .s-a').length, 0, 'root removed although leave threw');
  t.ok(g._console.error.some((l) => /boom in leave/.test(l)), 'the throw was logged');
  await g.UI.go('c');
  t.eq(g.UI.currentName, 'c', 'a screen with no enter is fine');
  const p1 = g.UI.go('d'), p2 = g.UI.go('a', null, { force: true }), p3 = g.UI.go('b', null, { force: true });
  g._flush(500);
  await Promise.all([p1, p2, p3]);
  t.deep(order, ['a', 'b', 'd', 'd.done', 'a', 'b'], 'queued gos run in order, each after the previous enter settled');
  t.eq(g.UI.currentName, 'b', 'the last one wins');
});

await t.test('UI.go drops a repeat of the same target within 400 ms, unless forced', async () => {
  const g = fresh();
  let n = 0;
  g.UI.screens.a = { enter() { n++; } };
  await g.UI.go('a', { k: 1 });
  await g.UI.go('a', { k: 1 });
  t.eq(n, 1, 'double tap dropped');
  await g.UI.go('a', { k: 2 });
  t.eq(n, 2, 'different params are a different target');
  await g.UI.go('a', { k: 2 }, { force: true });
  t.eq(n, 3, 'force bypasses');
  g._flush(500);
  await g.UI.go('a', { k: 2 });
  t.eq(n, 4, 'after 400 ms the same target is allowed');
});

await t.test('a screen that throws in enter shows the recoverable error modal and logs to window.__errors', async () => {
  const g = fresh();
  g.UI.screens.bad = { enter() { throw new Error('enter exploded'); } };
  g.UI.screens.title = { enter(p, root) { root.appendChild(g._doc.createElement('i')); } };
  await g.UI.go('bad');
  t.ok(g._win.__errors.some((e) => e.screen === 'bad.enter' && /enter exploded/.test(e.message) && 'stack' in e), '__errors has {screen, message, stack}');
  t.eq(g.UI.overlay.count(), 1, 'the error modal is open');
  const modal = $(g, '.o-modal');
  t.ok(/Something tore the page/.test(modal.textContent), 'title'); t.ok(/Back to Title/.test(modal.textContent) && /Copy details/.test(modal.textContent), 'buttons');
  const back = Array.from(modal.querySelectorAll('button')).find((b) => /Back to Title/.test(b.textContent));
  back.click();
  await settle(g);
  t.eq(g.UI.currentName, 'title', 'Back to Title routes home'); t.eq(g.UI.overlay.count(), 0, 'and closes the modal');
  const before = g._win.__errors.length;
  await g.UI.go('bad', null, { force: true });
  t.eq(g.UI.overlay.count(), 0, 'the same failure does not stack a second modal');
  t.eq(g._win.__errors.length, before + 1, 'but it is still recorded');
});

await t.test('update and draw that throw are disabled after the first failure; update gets dt clamped to 0.05 and draw a context', async () => {
  const g = fresh();
  const seen = { dts: [], draws: 0, upd: 0 };
  g.UI.screens.a = { enter() {}, update(dt, t2) { seen.dts.push(dt); seen.upd++; if (seen.upd === 2) throw new Error('update failed'); }, draw(ctx, t2) { seen.draws++; if (typeof ctx.fillRect !== 'function') throw new Error('no ctx'); if (seen.draws === 3) throw new Error('draw failed'); } };
  await g.UI.go('a');
  g.UI.frame(1000); g.UI.frame(1016); g.UI.frame(1500); g.UI.frame(1516); g.UI.frame(1532);
  t.eq(seen.dts[0], 0, 'first frame has dt 0'); t.near(seen.dts[1], 0.016, 1e-9, 'dt in seconds'); t.eq(seen.upd, 2, 'update stopped being called after it threw');
  t.eq(seen.draws, 3, 'draw stopped after it threw');
  t.ok(g._win.__errors.some((e) => e.screen === 'a.update') && g._win.__errors.some((e) => e.screen === 'a.draw'), 'both recorded');
  const g2 = fresh();
  const dts = [];
  g2.UI.screens.a = { enter() {}, update(dt) { dts.push(dt); } };
  await g2.UI.go('a');
  g2.UI.frame(0); g2.UI.frame(500);
  t.eq(dts[1], 0.05, 'a 500 ms gap is clamped to 0.05 s');
  g2.UI.frame(400);
  t.eq(dts[2], 0, 'time going backwards gives dt 0');
});

await t.test('an unregistered screen shows the tidy placeholder with a working Back button', async () => {
  const g = fresh();
  g.UI.screens.home = { enter(p, root) { root.dataset.home = '1'; } };
  await g.UI.go('home');
  await g.UI.go('library');
  const soon = $(g, '.s-library .soon');
  t.ok(soon, 'placeholder rendered'); t.ok(/still being written/.test(soon.textContent), 'copy');
  const back = Array.from(soon.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Back');
  t.ok(back, 'Back button');
  back.click();
  await settle(g);
  t.eq(g.UI.currentName, 'home', 'Back returns to the previous screen');
  t.eq(errCount(g), 0, 'no console errors');
});

await t.test('music: string, function of params, undefined keeps, null stops', async () => {
  const g = fresh();
  g.UI.screens.a = { music: 'title', enter() {} };
  g.UI.screens.b = { music: (p) => 'map' + p.ch, enter() {} };
  g.UI.screens.c = { enter() {} };
  g.UI.screens.d = { music: null, enter() {} };
  await g.UI.go('a'); await g.UI.go('b', { ch: 2 }); await g.UI.go('c'); await g.UI.go('d');
  t.deep(g.log.music, ['title', 'map2', null], 'AUDIO.music called after each enter, skipped when undefined');
});

await t.test('the bus announces screens and overlays; UI.canvasOn works and is removed at leave; canvas handlers pause under an overlay', async () => {
  const g = fresh();
  const seen = [];
  g.UI.bus.on('screen', (e) => seen.push('screen:' + e.name));
  g.UI.bus.on('overlay', (e) => seen.push('overlay:' + e.name + ':' + e.open));
  const hits = [];
  g.UI.screens.a = { enter() { g.UI.canvasOn('pointerdown', (e, p) => hits.push(p)); } };
  g.UI.screens.b = { enter() {} };
  await g.UI.go('a');
  g._pointer('pointerdown', '#view', { x: 640, y: 360 });
  t.eq(hits.length, 1, 'canvasOn fires'); t.near(hits[0].x, 640, 0.001, 'with stage coordinates');
  g.UI.overlay.open('modal', { title: 'x' });
  g._pointer('pointerdown', '#view', { x: 10, y: 10 });
  t.eq(hits.length, 1, 'ignored while an overlay is open');
  g.UI.overlay.close();
  await g.UI.go('b');
  g._pointer('pointerdown', '#view', { x: 10, y: 10 });
  t.eq(hits.length, 1, 'removed at leave');
  t.deep(seen, ['screen:a', 'overlay:modal:true', 'overlay:modal:false', 'screen:b'], 'bus order');
});

// ==================================================================================================== frame clock, tweens, timers
await t.test('tween, after and transition resolve at once in headless mode and animate on the frame clock in realtime', async () => {
  const g = fresh();
  const o = { a: 0, b: 10 };
  const seen = [];
  await g.UI.tween(o, { a: 5, b: 0 }, 1000, 'outQuad', (obj, p) => seen.push(p));
  t.deep([o.a, o.b], [5, 0], 'headless tween jumps to the end'); t.eq(seen[seen.length - 1], 1, 'onUpdate gets the final progress');
  let fired = false;
  g.UI.after(999999, () => { fired = true; });
  await settle(g);
  t.ok(fired, 'after() runs on the next microtask headless');
  let mid = false;
  await g.UI.transition('page', () => { mid = true; });
  t.ok(mid, 'transition calls midFn');
  const r = fresh({ realtime: true });
  r.UI.init();
  const obj = { v: 0 };
  let done = false;
  r.UI.tween(obj, { v: 100 }, 200, 'linear').then(() => { done = true; });
  let now = 1000;
  r.UI.frame(now);
  for (let i = 0; i < 6; i++) { now += 16; r.UI.frame(now); }
  t.near(obj.v, 48, 1, 'realtime tween is frame driven (6 frames of 16 ms of 200 ms)');
  for (let i = 0; i < 12; i++) { now += 16; r.UI.frame(now); }
  await settle(r);
  t.ok(done && obj.v === 100, 'realtime tween finishes and resolves');
  let after = 0;
  r.UI.after(100, () => { after++; });
  for (let i = 0; i < 10; i++) { now += 16; r.UI.frame(now); }
  t.eq(after, 1, 'realtime after fires once on the frame clock');
});

await t.test('transitions in realtime: fade, ink and page complete on frames, paint #over, run midFn once, and shrink to a 150 ms fade under reduceMotion', async () => {
  const g = fresh({ realtime: true });
  g.UI.init();
  let now = 1000;
  const pump = (max) => { for (let i = 0; i < max; i++) { now += 16; g.UI.frame(now); } };
  const results = {};
  for (const kind of ['fade', 'ink', 'page']) {
    let mids = 0, done = false;
    g._resetCounts();
    const p = g.UI.transition(kind, () => { mids++; }).then(() => { done = true; });
    let frames = 0;
    while (!done && frames < 200) { pump(1); frames++; await settle(g); }
    results[kind] = frames;
    t.ok(done, kind + ' finished'); t.eq(mids, 1, kind + ' midFn ran exactly once');
    t.ok(g._counts.fillRect > 0 || g._counts.fill > 0, kind + ' painted on #over'); t.eq(g._issues.length, 0, kind + ': no canvas issues [' + g._issues.map((i) => i.detail).join('; ') + ']');
    await p;
  }
  t.ok(results.fade > 20 && results.fade < 60, 'fade lasts about half a second (' + results.fade + ' frames)');
  t.ok(results.ink > results.fade, 'ink is the longest');
  g._run('META.set("reduceMotion", true)');
  g.UI.applySettings();
  let done = false, n = 0;
  g.UI.transition('ink', () => {}).then(() => { done = true; });
  while (!done && n < 100) { pump(1); n++; await settle(g); }
  t.ok(n <= 14, 'reduceMotion makes every transition a ~150 ms fade (' + n + ' frames)');
});

// ==================================================================================================== overlays
await t.test('overlays: stack, results, Esc, inert screen, dismissal rules, unknown overlay fallback', async () => {
  const g = fresh();
  const opened = [];
  g.UI.overlays.demo = { open(p, root, close) { opened.push('demo'); root.appendChild(g._doc.createElement('button')); this.close_ = close; } };
  g.UI.overlays.sticky = { dismiss: false, open(p, root, close) { root.dataset.sticky = '1'; this.close_ = close; } };
  g.UI.overlays.cancel = { cancelResult: 'nope', open() {} };
  g.UI.screens.a = { enter(p, root) { root.appendChild(g._doc.createElement('button')); } };
  await g.UI.go('a');
  const p1 = g.UI.overlay.open('demo', { x: 1 });
  t.ok(p1 && typeof p1.then === 'function', 'open returns a promise'); t.eq(g.UI.overlay.count(), 1, 'one open'); t.ok($(g, '#overlays .o-demo'), 'root .overlay.o-demo in #overlays');
  t.ok($(g, '#screens').inert, 'the screen behind is inert'); t.ok(g.UI.overlay.has('demo'), 'has()');
  const p2 = g.UI.overlay.open('sticky');
  t.eq(g.UI.overlay.top().name, 'sticky', 'top is the newest'); t.ok($(g, '.o-demo').inert && !$(g, '.o-sticky').inert, 'lower overlays are inert too');
  g._key('Escape');
  t.eq(g.UI.overlay.count(), 2, 'Esc does nothing to a dismiss:false overlay');
  g.UI.overlays.sticky.close_('done');
  t.eq(await p2, 'done', 'close(result) resolves the promise'); t.ok(!$(g, '#screens').inert === false, 'still inert while demo is open');
  g._key('Escape');
  t.eq(g.UI.overlay.count(), 0, 'Esc closes the top overlay'); t.eq(await p1, undefined, 'dismissal resolves undefined by default'); t.ok(!$(g, '#screens').inert, 'screen usable again');
  const p3 = g.UI.overlay.open('cancel');
  g._key('Escape');
  t.eq(await p3, 'nope', 'cancelResult is what dismissal resolves');
  const p4 = g.UI.overlay.open('nothing_here');
  t.eq(g.UI.overlay.count(), 1, 'an unknown overlay opens the tidy fallback modal'); t.ok(/still being written/.test($(g, '.o-modal').textContent), 'copy');
  g.UI.overlay.close('ok');
  t.eq(await p4, 'ok', 'fallback resolves');
  const p5 = g.UI.overlay.open('demo');
  const kid = $(g, '.o-demo button');
  g._pointer('pointerdown', kid, { pointerType: 'mouse' });
  $(g, '.o-demo').dispatchEvent(new g._win.MouseEvent('click', { bubbles: true, detail: 1 }));
  t.eq(g.UI.overlay.count(), 1, 'a press that started inside the panel and ended on the backdrop does not dismiss (slider drags)');
  g._click($(g, '.o-demo'));
  t.eq(g.UI.overlay.count(), 0, 'clicking the backdrop dismisses');
  await p5;
});

await t.test('a screen leaving closes every overlay and resolves them', async () => {
  const g = fresh();
  g.UI.overlays.demo = { open() {} };
  g.UI.screens.a = { enter() {} }; g.UI.screens.b = { enter() {} };
  await g.UI.go('a');
  const p = g.UI.overlay.open('demo');
  await g.UI.go('b');
  t.eq(g.UI.overlay.count(), 0, 'closed'); t.eq(await p, undefined, 'resolved');
});

await t.test('keys: screen onKey, UI.onKey, overlay:true handlers, Esc precedence, pause on Esc, Enter on role=button, arrow focus', async () => {
  const g = fresh();
  const seen = [];
  let pauseOpened = 0;
  g.UI.overlays.pause = { open() { pauseOpened++; } };
  g.UI.screens.map = { onKey(e) { seen.push('screen:' + e.key); if (e.key === 'x') return true; return false; }, enter(p, root) { g.UI.onKey((e) => { seen.push('ui:' + e.key); return e.key === 'y'; }); } };
  g.UI.screens.title = { enter() {} };
  await g.UI.go('map');
  g._key('a');
  t.deep(seen, ['ui:a', 'screen:a'], 'UI.onKey handlers first, then screen.onKey');
  seen.length = 0;
  g._key('y'); t.deep(seen, ['ui:y'], 'a handler returning true consumes the key');
  seen.length = 0;
  g._key('Escape');
  t.eq(pauseOpened, 1, 'Esc on a pausable screen opens pause when the screen does not consume it');
  g.UI.overlay.close();
  await g.UI.go('title');
  g._key('Escape');
  t.eq(pauseOpened, 1, 'title is not pausable');
  await g.UI.go('map', null, { force: true });
  seen.length = 0;
  let ovKeys = 0;
  g.UI.overlays.demo = { open(p, root) { g.UI.onKey((e) => { ovKeys++; return false; }, { overlay: true }); } };
  g.UI.overlay.open('demo');
  g._key('q');
  t.eq(ovKeys, 1, 'overlay:true handler gets keys while its overlay is open'); t.deep(seen, [], 'screen handlers get nothing while an overlay is open');
  g.UI.overlay.close();
  g._key('q');
  t.eq(ovKeys, 1, 'and it is disposed with the overlay');
  // role=button activation and arrow navigation
  let clicks = 0;
  g.UI.screens.nav = { enter(p, root) {
    ['b1', 'b2'].forEach((id, i) => { const d = g._doc.createElement('div'); d.setAttribute('role', 'button'); d.setAttribute('tabindex', '0'); d.id = id; d._rect = { left: 100 + i * 200, top: 100, width: 80, height: 60 }; d.addEventListener('click', () => { clicks++; }); root.appendChild(d); });
  } };
  await g.UI.go('nav');
  $(g, '#b1').focus();
  g._key('Enter');
  t.eq(clicks, 1, 'Enter activates a role=button element'); g._key(' ');
  t.eq(clicks, 2, 'Space too');
  g._key('ArrowRight');
  t.eq(g._doc.activeElement && g._doc.activeElement.id, 'b2', 'ArrowRight moves focus to the next control on the right');
  g._key('ArrowLeft');
  t.eq(g._doc.activeElement && g._doc.activeElement.id, 'b1', 'ArrowLeft moves back');
});

// ==================================================================================================== modal, confirm, cardPick
await t.test('UI.modal: title, body, buttons with callbacks, returns a close function, dismiss rules', async () => {
  const g = fresh();
  let cb = 0;
  const close = g.UI.modal({ title: 'Hello', body: 'World text', buttons: [{ label: 'One', cb: () => { cb++; return false; } }, { label: 'Two', kind: 'primary' }] });
  const box = $(g, '.o-modal');
  t.ok(/Hello/.test(box.textContent) && /World text/.test(box.textContent), 'title and body');
  const btns = Array.from(box.querySelectorAll('.btn'));
  t.eq(btns.length, 2, 'two buttons'); t.ok(btns[1].classList.contains('btn-primary'), 'last button is primary by default');
  btns[0].click();
  t.eq(cb, 1, 'callback runs'); t.eq(g.UI.overlay.count(), 1, 'a callback returning false keeps it open');
  t.eq(typeof close, 'function', 'returns a close fn');
  close();
  t.eq(g.UI.overlay.count(), 0, 'close fn closes it');
  const p = g.UI.overlay.open('modal', { title: 'A', body: 'b', buttons: [{ label: 'Yes', result: 42 }] });
  $(g, '.o-modal .btn').click();
  t.eq(await p, 42, 'a button result resolves the overlay promise');
  g.UI.modal({ title: 'Pinned', body: 'x', dismiss: false });
  g._key('Escape');
  t.eq(g.UI.overlay.count(), 1, 'dismiss:false ignores Esc');
  g.UI.overlay.top().root.click();
  t.eq(g.UI.overlay.count(), 1, 'and the backdrop');
  g.UI.overlay.close();
  const node = g._doc.createElement('em'); node.textContent = 'node body';
  g.UI.modal({ title: 'N', body: node });
  t.ok($(g, '.o-modal em'), 'a Node body is appended as is'); g.UI.overlay.close();
});

await t.test('UI.confirm resolves true, false, and false on Esc; danger focuses No', async () => {
  const g = fresh();
  let p = g.UI.confirm({ title: 'Sure?', body: 'Really.', yes: 'Do it', no: 'Never mind' });
  const btns = Array.from($(g, '.o-confirm').querySelectorAll('.btn'));
  t.deep(btns.map((b) => b.textContent.trim()), ['Never mind', 'Do it'], 'labels');
  btns[1].click(); t.eq(await p, true, 'yes');
  p = g.UI.confirm({ title: 'Sure?' });
  Array.from($(g, '.o-confirm').querySelectorAll('.btn'))[0].click(); t.eq(await p, false, 'no');
  p = g.UI.confirm({ title: 'Sure?' });
  g._key('Escape'); t.eq(await p, false, 'Esc is no');
  p = g.UI.overlay.open('confirm', { title: 'x', danger: true });
  t.ok($(g, '.o-confirm .btn[data-autofocus]').textContent.trim() === 'Cancel', 'danger puts the initial focus on the safe choice');
  t.ok($(g, '.o-confirm .btn-primary').classList.contains('btn-danger'), 'danger styling');
  g._key('y'); t.eq(await p, true, 'y answers yes');
});

await t.test('cardPick: picks exactly min(n, cards), optional allows 0..n, Skip, and returns uids', async () => {
  const g = fresh();
  const cards = [{ uid: 11, id: 't_slash', up: 0, gems: [null] }, { uid: 12, id: 't_guard', up: 0, gems: [null, null] }, { uid: 13, id: 't_rare', up: 0, gems: [null, null] }];
  let p = g.UI.overlay.open('cardPick', { title: 'Pick', cards, n: 1 });
  const ok = () => Array.from($(g, '.o-cardPick').querySelectorAll('.btn')).find((b) => /Choose/.test(b.textContent));
  t.eq(ok().getAttribute('aria-disabled'), 'true', 'Choose is disabled until a card is picked');
  const cs = $$(g, '.o-cardPick .card');
  t.eq(cs.length, 3, 'a card per candidate');
  cs[1].click();
  t.ok(cs[1].classList.contains('sel'), 'selected class'); t.ok(!ok().getAttribute('aria-disabled'), 'Choose enabled');
  cs[2].click();
  t.ok(!cs[1].classList.contains('sel') && cs[2].classList.contains('sel'), 'n = 1 replaces the selection');
  ok().click();
  t.deep(await p, [13], 'resolves [uid]');
  p = g.UI.overlay.open('cardPick', { cards, n: 2, optional: false });
  const c2 = $$(g, '.o-cardPick .card');
  c2[0].click();
  t.eq($(g, '.o-cardPick .btn-primary').getAttribute('aria-disabled'), 'true', 'exactly 2 needed');
  c2[1].click(); c2[2].click();
  t.eq(c2.filter((c) => c.classList.contains('sel')).length, 2, 'never more than n selected');
  $(g, '.o-cardPick .btn-primary').click();
  t.eq((await p).length, 2, 'two returned');
  p = g.UI.overlay.open('cardPick', { cards, n: 2, optional: true });
  const skip = Array.from($(g, '.o-cardPick').querySelectorAll('.btn')).find((b) => /Skip/.test(b.textContent));
  t.ok(skip, 'optional picks have Skip'); t.ok(!$(g, '.o-cardPick .btn-primary').getAttribute('aria-disabled'), 'confirming with zero is allowed when optional');
  skip.click(); t.deep(await p, [], 'Skip resolves []');
  p = g.UI.overlay.open('cardPick', { cards, n: 1, optional: true });
  g._key('Escape'); t.deep(await p, [], 'Esc cancels with []');
});

await t.test('legend, relics and deck overlays open without errors', async () => {
  const g = fresh();
  g.UI.setRun({ deck: [{ uid: 1, id: 't_slash', up: 0, gems: [null] }], relics: [] });
  for (const name of ['legend', 'relics', 'deck', 'settings']) {
    const p = g.UI.overlay.open(name, {});
    t.ok($(g, '.o-' + name + ' .panel'), name + ' builds a panel');
    g.UI.overlay.close();
    await p;
  }
  t.ok(/No treasures/.test('No treasures yet'), 'sanity');
  t.eq(errCount(g), 0, 'no console errors');
});

// ==================================================================================================== toasts, floats, pulse, shake, announce
await t.test('toasts: kinds, auto-dismiss on the frame clock, cap of four, persistent and id de-duplication, announce', async () => {
  const g = fresh({ realtime: true });
  g.UI.init();
  g.UI.toast('one', 'good'); g.UI.toast('two', 'bad'); g.UI.toast('three', 'warn'); g.UI.toast('four', 'achievement'); g.UI.toast('five');
  const list = () => $$(g, '#toasts .toast');
  t.eq(list().length, 4, 'at most four visible');
  t.ok(list()[0].classList.contains('tk-bad'), 'oldest was dropped, kinds map to tk- classes'); t.ok(list()[3].classList.contains('tk-info'), 'default kind is info');
  t.ok(/five/.test($(g, '#sr').textContent), 'announced to the screen reader region');
  const h = g.UI.toast('stuck', 'warn', { persist: true, id: 'nosave' });
  g.UI.toast('stuck again', 'warn', { persist: true, id: 'nosave' });
  t.eq($$(g, '#toasts .toast[data-tid="nosave"]').length, 1, 'same id updates instead of stacking'); t.ok(/stuck again/.test($(g, '.toast[data-tid="nosave"]').textContent), 'text updated');
  t.ok($(g, '.toast[data-tid="nosave"] .toast-x'), 'persistent toast has a dismiss button');
  let now = 0;
  for (let i = 0; i < 300; i++) { now += 16; g.UI.frame(now); }
  t.eq($$(g, '#toasts .toast:not(.persist)').length, 0, 'ordinary toasts expire on the frame clock');
  t.eq($$(g, '#toasts .toast.persist').length, 1, 'the persistent one stays');
  $(g, '.toast-x').click();
  for (let i = 0; i < 30; i++) { now += 16; g.UI.frame(now); }
  t.eq($$(g, '#toasts .toast').length, 0, 'and can be dismissed');
  const f = g.UI.floatText(300, 200, '-7', 'crit');
  t.ok(f.classList.contains('f-crit') && f.textContent === '-7', 'floatText element'); t.eq(f.style.left, '300px', 'positioned in stage px');
  const el = g._doc.createElement('div');
  $(g, '#screens').appendChild(el);
  g.UI.pulse(el); t.ok(el.classList.contains('pulse'), 'pulse class');
  g.UI.shake(el); t.ok(el.classList.contains('shake'), 'shake class');
  g.UI.announce('Kappa attacks Hanae for 7'); t.ok(/Kappa attacks/.test($(g, '#sr').textContent), 'announce writes #sr');
});

await t.test('shake becomes a colour flash under reduceMotion or shake 0', () => {
  const g = fresh();
  g.UI.init();
  const el = g._doc.createElement('div');
  $(g, '#screens').appendChild(el);
  g._run('META.set("shake", 0)'); g.UI.applySettings();
  g.UI.shake(el);
  t.ok(el.classList.contains('flash-bad') && !el.classList.contains('shake'), 'no motion when shake is off');
});

// ==================================================================================================== tooltips
await t.test('glossary: keywords and statuses by key or name, with stacks', () => {
  const g = fresh();
  g.UI.init();
  const b = g.UI.tip.info('block');
  t.eq(b.name, 'Block', 'keyword by key'); t.eq(b.kind, 'keyword', 'kind keyword'); t.ok(/Absorbs damage/.test(b.text), 'text from DATA.keywords');
  const p = g.UI.tip.info('poison');
  t.eq(p.kind, 'debuff', 'status kind'); t.ok(p.status && p.stack === 'int', 'status flags');
  t.eq(g.UI.tip.info('Front row').key, 'front', 'by display name');
  t.eq(g.UI.tip.info('X cost').key, 'xcost', 'punctuation is ignored');
  t.eq(g.UI.tip.info('bloom').kind, 'resource', 'resource status');
  t.eq(g.UI.tip.info('nonsense'), null, 'unknown is null'); t.eq(g.UI.tip.kw('nonsense'), null, 'kw() of unknown is null');
  const node = g.UI.tip.kw('poison', 3);
  t.ok(node.querySelector('.tk-name') && /Poison 3/.test(node.querySelector('.tk-name').textContent), 'title carries the stack'); t.ok(node.querySelector('.tk-kind.k-debuff'), 'kind chip'); t.ok(node.querySelector('canvas'), 'status icon');
  g._run('DATA.statusText = (id, n) => "Poison " + n + ": lose " + n + " HP."');
  const n2 = g.UI.tip.kw('poison', 4);
  t.eq(n2.querySelector('.tk-text').textContent, 'lose 4 HP.', 'DATA.statusText is used with its duplicate "Name N:" prefix stripped');
});

await t.test('tip.attach: mouse hover after a short delay, hide on leave, touch long press 400 ms, closes on pointerup, never blocks click', async () => {
  const g = fresh();
  g.UI.init();
  const el = g._doc.createElement('button');
  $(g, '#screens').appendChild(el);
  let clicks = 0;
  el.addEventListener('click', () => { clicks++; });
  g.UI.tip.attach(el, () => 'Tip <b>content</b>');
  g._pointer('pointerenter', el, { pointerType: 'mouse' });
  t.eq($$(g, '#tips .tip').length, 0, 'not instant');
  g._flush(100);
  t.eq($$(g, '#tips .tip').length, 1, 'shown after the hover delay'); t.ok(/Tip content/.test($(g, '#tips .tip').textContent), 'content'); t.ok($(g, '#tips .tip .tip-tail'), 'has a tail'); t.ok(/tip-(top|bottom|left|right)/.test($(g, '#tips .tip').className), 'side class');
  g._pointer('pointerleave', el, { pointerType: 'mouse' });
  t.eq($$(g, '#tips .tip').length, 0, 'hidden on leave');
  g._pointer('pointerdown', el, { pointerType: 'touch' });
  g._flush(300);
  t.eq($$(g, '#tips .tip').length, 0, 'not before 400 ms');
  g._flush(150);
  t.eq($$(g, '#tips .tip').length, 1, 'long press shows it');
  g._pointer('pointerup', el, { pointerType: 'touch' });
  t.eq($$(g, '#tips .tip').length, 0, 'pointerup closes it');
  g._click(el, { pointerType: 'touch' });
  t.eq(clicks, 1, 'a tap still clicks');
  g._pointer('pointerdown', el, { pointerType: 'touch' }); g._pointer('pointerup', el, { pointerType: 'touch' }); g._flush(600);
  t.eq($$(g, '#tips .tip').length, 0, 'a short tap never shows the tip');
  g.UI.tip.attach(g._doc.createElement('i'), () => null);
  const e2 = g._doc.createElement('button'); $(g, '#screens').appendChild(e2);
  g.UI.tip.attach(e2, () => null);
  g._pointer('pointerenter', e2, { pointerType: 'mouse' }); g._flush(100);
  t.eq($$(g, '#tips .tip').length, 0, 'content returning null shows nothing');
  g.UI.tip.attach(e2, () => { throw new Error('bad tip'); });
  g._pointer('pointerleave', e2, { pointerType: 'mouse' }); g._pointer('pointerenter', e2, { pointerType: 'mouse' }); g._flush(100);
  t.eq($$(g, '#tips .tip').length, 0, 'a throwing content function is swallowed');
});

await t.test('keyword spans inside card text open glossary bubbles (hover and long press)', async () => {
  const g = fresh();
  g.UI.init();
  const c = g.UI.card(inst('t_guard'), { size: 'big' });
  $(g, '#screens').appendChild(c);
  const kw = c.querySelector('.kw');
  t.ok(kw && kw.dataset.kw === 'exhaust', 'the fallback text marks Exhaust with data-kw');
  g._pointer('pointerover', kw, { pointerType: 'mouse' });
  t.eq($$(g, '#tips .tip').length, 1, 'bubble on hover'); t.ok(/Exhaust/.test($(g, '#tips .tip').textContent), 'right entry');
  g._pointer('pointerout', kw, { pointerType: 'mouse' });
  t.eq($$(g, '#tips .tip').length, 0, 'gone on leave');
});

await t.test('tip.card: a big preview with the glossary of the words on it, replaced and hidden cleanly', () => {
  const g = fresh();
  g.UI.init();
  const w = g.UI.tip.card(inst('t_guard'), { x: 100, y: 60 });
  t.ok($(g, '#tips .tip-cardwrap .card.c-big'), 'a big card'); t.ok($$(g, '#tips .tip-kwcol .tip').length >= 1, 'keyword bubbles'); t.eq(w.style.left, '100px', 'positioned');
  t.ok($(g, '#tips .card').classList.contains('in-tip'), 'marked as a preview');
  g.UI.tip.card(inst('t_slash'));
  t.eq($$(g, '#tips .tip-cardwrap').length, 1, 'a second preview replaces the first');
  t.ok(g.UI.tip.open, 'tip.open');
  g.UI.tip.hide();
  t.eq($$(g, '#tips .tip-cardwrap').length, 0, 'hide removes it'); t.ok(!g.UI.tip.open, 'closed');
});

// ==================================================================================================== cards
await t.test('UI.card: structure for every kind of card, at every size', () => {
  const g = fresh();
  g.UI.init();
  const sizes = ['mini', 'deck', 'hand', 'reward', 'big'];
  const w = { mini: 72, deck: 168, hand: 190, reward: 240, big: 300 };
  for (const size of sizes) {
    for (const id of Object.keys(CARDS)) {
      const c = g.UI.card(inst(id, 0, []), { size });
      const tag = id + '@' + size;
      t.ok(c.classList.contains('card') && c.classList.contains('c-' + size), tag + ': card and size classes');
      t.eq(c.getAttribute('role'), 'button', tag + ': role'); t.eq(c.getAttribute('tabindex'), '0', tag + ': focusable');
      t.ok(c.querySelector('.c-name').textContent.length > 0, tag + ': name'); t.ok(c.querySelector('.c-cost'), tag + ': cost orb exists');
      t.ok(c.classList.contains('t-' + CARDS[id].type) && c.classList.contains('r-' + CARDS[id].rarity), tag + ': type and rarity classes');
      t.eq(!!c.querySelector('.c-text'), size !== 'mini', tag + ': text area except on mini');
      t.eq(!!c.querySelector('.c-socks'), size !== 'mini' && CARDS[id].slots.length > 0, tag + ': sockets when there are slots');
      const art = c.querySelector('.c-artc');
      t.ok(art && art.width === Math.round(w[size] * 0.895 * g.UI.px), tag + ': art canvas is backed at UI.px');
    }
  }
  t.ok(g.log.art.length > 0 && g.log.art.every((a) => a[1] > 0 && a[2] > 0), 'ART.card.draw is called with the window size');
  t.eq(errCount(g), 0, 'no console errors');
});

await t.test('UI.card: name, plus, cost, X cost, upgrade, sockets and gems, aria-label', () => {
  const g = fresh();
  g.UI.init();
  let c = g.UI.card(inst('t_slash', 1, ['t_ruby']), { size: 'hand' });
  t.eq(c.querySelector('.c-name').firstChild.textContent, 'Test Slash', 'name without the plus'); t.ok(c.querySelector('.c-plus'), 'plus element for an upgraded card'); t.ok(c.classList.contains('up'), 'up class');
  t.eq(c.querySelector('.c-costn').textContent, '1', 'cost 1'); t.eq(c.dataset.id, 't_slash', 'data-id');
  t.eq(c.querySelectorAll('.c-sock').length, 1, 'one socket'); t.ok(c.querySelector('.c-sock').classList.contains('filled') && c.querySelector('.c-sock').classList.contains('sc-red'), 'filled red socket'); t.eq(c.querySelector('.c-sock').dataset.gem, 't_ruby', 'gem id on the socket');
  t.ok(/Test Slash/.test(c.getAttribute('aria-label')) && /cost 1/.test(c.getAttribute('aria-label')) && /Attack/.test(c.getAttribute('aria-label')), 'aria-label has name, type and cost');
  t.ok(g.log.icons.some((i) => i[0] === 'gem' && i[1] === 't_ruby'), 'a filled socket draws the gem icon');
  c = g.UI.card(inst('t_guard', 0, [null, null]), { size: 'deck' });
  t.eq(c.querySelectorAll('.c-sock').length, 2, 'two sockets'); t.ok(c.querySelector('.sc-any'), 'a prism socket'); t.ok(g.log.icons.some((i) => i[0] === 'gem' && i[1] === 'slot:blue'), 'an empty socket draws slot:colour'); t.eq(c.querySelectorAll('.c-sock.filled').length, 0, 'none filled');
  t.ok(c.querySelector('.kw[data-kw="exhaust"]'), 'keyword highlight'); t.ok(c.style.getPropertyValue('--nf') === '0.72', 'a long name shrinks (--nf)');
  c = g.UI.card(inst('t_guard', 1, [null, null]), { size: 'deck' });
  t.eq(c.querySelector('.c-costn').textContent, '1', 'upgrade can lower the cost'); t.ok(c.classList.contains('cost-down'), 'cost-down class');
  c = g.UI.card(inst('t_x'), { size: 'hand' });
  t.eq(c.querySelector('.c-costn').textContent, 'X', 'X cost shows X'); t.ok(c.classList.contains('x-cost'), 'x-cost class');
  c = g.UI.card(inst('t_curse'), { size: 'hand' });
  t.ok(c.classList.contains('junk') && c.classList.contains('nocost'), 'a curse is junk and has no cost'); t.ok(c.querySelector('.c-cost').hidden, 'orb hidden');
  c = g.UI.card('t_rare', { size: 'reward' });
  t.eq(c.dataset.uid, undefined, 'a plain id has no uid'); t.ok(c.classList.contains('r-rare'), 'rare'); t.ok(c.querySelector('.shine'), 'shimmer element'); t.eq(c.querySelectorAll('.c-sock').length, 2, 'sockets from the def when given an id');
  c = g.UI.card(inst('t_slash'), { size: 'big' });
  t.eq(c.querySelector('.c-flavor').textContent, 'A test quote.', 'flavor on big cards');
  c = g.UI.card(inst('t_slash'), { size: 'hand' });
  t.ok(!c.querySelector('.c-flavor'), 'but not on hand cards');
  c = g.UI.card(inst('t_slash'), { size: 'hand', showGems: false });
  t.ok(!c.querySelector('.c-socks'), 'showGems:false hides sockets');
  c = g.UI.card(inst('does_not_exist'), { size: 'deck' });
  t.ok(c.classList.contains('card'), 'an unknown card id still renders'); t.eq(errCount(g), 0, 'and does not error');
});

await t.test('UI.card states and live updates keep classes a screen added', () => {
  const g = fresh();
  g.UI.init();
  const c = g.UI.card(inst('t_slash', 0, [null]), { size: 'hand', selected: true, playable: true });
  t.ok(c.classList.contains('sel') && c.classList.contains('play'), 'initial states'); t.eq(c.getAttribute('aria-pressed'), 'true', 'aria-pressed');
  c.classList.add('fanned');
  g.UI.cardUpdate(c, { selected: false, disabled: true });
  t.ok(!c.classList.contains('sel') && c.classList.contains('dis') && !c.classList.contains('play'), 'updated states (disabled wins over playable)'); t.eq(c.getAttribute('aria-disabled'), 'true', 'aria-disabled');
  t.ok(c.classList.contains('fanned'), 'a class added by a screen survives updates');
  g.UI.cardUpdate(c, { disabled: false, playable: true });
  t.ok(c.classList.contains('play') && !c.getAttribute('aria-disabled'), 'and back');
  let clicked = 0;
  const d = g.UI.card(inst('t_slash'), { size: 'hand', onclick: (e, i) => { clicked = i.id; } });
  d.click();
  t.eq(clicked, 't_slash', 'onclick gets the instance');
  g._run('DATA.resolveCard = (i) => ({ inst: i, def: DATA.cards[i.id], id: i.id, name: "Live", cost: 3, costX: false, type: "attack", rarity: "common", kw: [], slots: [], gems: [], fx: [], hero: "hanae", up: false, art: {} })');
  const e = g.UI.card(inst('t_slash'), { size: 'hand' });
  t.eq(e.querySelector('.c-costn').textContent, '3', 'DATA.resolveCard is the source of truth when present');
  let pops = 0;
  const s = g._run('DATA.resolveCard = (i, ctx) => ({ inst: i, def: DATA.cards[i.id], id: i.id, name: "Live", cost: ctx && ctx.unit ? 1 : 2, costX: false, type: "attack", rarity: "common", kw: [], slots: [], gems: [], fx: [], hero: "hanae", up: false, art: {} })');
  const f = g.UI.card(inst('t_slash'), { size: 'hand' });
  t.eq(f.querySelector('.c-costn').textContent, '2', 'cost before'); g.UI.cardUpdate(f, { unit: { id: 'hanae' } });
  t.eq(f.querySelector('.c-costn').textContent, '1', 'a ctx change re-renders the numbers'); t.ok(f.querySelector('.c-cost').classList.contains('pulse'), 'and the cost orb pops');
  g._run('delete DATA.resolveCard');
  const h = g.UI.card(inst('t_slash'), { size: 'hand', C: { canPlay: () => ({ ok: false, reason: 'energy' }) } });
  h.dataset.uid = '5';
  t.ok(true, 'card with C builds');
});

await t.test('UI.cardBack, relic, gem, status, stat, heroBadge', () => {
  const g = fresh();
  g.UI.init();
  const back = g.UI.cardBack('deck');
  t.ok(back.classList.contains('back') && back.classList.contains('c-deck'), 'card back');
  g.DATA.add('relics', { t_relic: { name: 'Test Lantern', rarity: 'rare', text: 'Glows.', hooks: [], art: { m: 'lantern' } } });
  const r = g.UI.relic('t_relic', { size: 'lg' });
  t.ok(r.classList.contains('rar-rare') && r.classList.contains('sz-lg'), 'relic rarity and size'); t.ok(/Test Lantern/.test(r.getAttribute('aria-label')), 'aria-label'); t.ok(r.rbTip, 'tooltip attached');
  t.ok(g.log.icons.some((i) => i[0] === 'relic' && i[1] === 't_relic'), 'relic icon drawn');
  let cl = 0;
  const r2 = g.UI.relic('t_relic', { onclick: () => { cl++; }, tip: false });
  t.eq(r2.getAttribute('role'), 'button', 'clickable relic is a button'); r2.click(); t.eq(cl, 1, 'onclick'); t.ok(!r2.rbTip, 'tip:false');
  const gm = g.UI.gem('t_topaz', { size: 'sm' });
  t.ok(gm.classList.contains('gc-gold') && gm.classList.contains('tier-2'), 'gem colour and tier'); t.eq(gm.querySelectorAll('.pip').length, 2, 'tier pips');
  const s = g.UI.status('poison', 4, { size: 'lg' });
  t.ok(s.classList.contains('k-debuff') && s.classList.contains('sz-lg'), 'status kind and size'); t.eq(s.querySelector('.n').textContent, '4', 'stack number'); s.rbSet(2); t.eq(s.querySelector('.n').textContent, '2', 'rbSet');
  t.ok(g.UI.status('bloom', 3).classList.contains('k-resource'), 'resource kind'); t.ok(g.UI.status('might', 1).classList.contains('k-buff'), 'buff kind');
  const st = g.UI.stat('gold', 137);
  t.eq(st.querySelector('.val').textContent, '137', 'stat value'); t.ok(st.classList.contains('st-gold'), 'stat kind'); t.ok(st.querySelector('canvas'), 'stat icon');
  st.rbSet(200); t.eq(st.querySelector('.val').textContent, '200', 'rbSet'); st.rbSet(150, { animate: true });
  t.eq(st.querySelector('.val').textContent, '150', 'animated set lands (headless)');
  const ink = g.UI.stat('ink', 9, { max: 14 });
  t.eq(ink.querySelector('.val').textContent, '9/14', 'value over max');
  const hb = g.UI.heroBadge('hanae', { size: 'lg', hp: 30, maxHp: 76 });
  t.ok(hb.classList.contains('h-hanae') && /Hanae/.test(hb.textContent), 'hero badge'); t.eq(hb.querySelector('.hp-txt').textContent, '30/76', 'hp text'); t.ok(/39/.test(hb.querySelector('.hp-fill').style.width), 'hp fill width');
  hb.rbSet({ hp: 0 }); t.ok(hb.classList.contains('down'), 'down at 0 hp');
  hb.rbSet({ hp: 10 }); t.ok(hb.classList.contains('low') && !hb.classList.contains('down'), 'low hp state');
  t.ok(g.log.medals.indexOf('hanae') >= 0, 'ART.hero.medallion is used');
  t.ok(g.UI.heroBadge('kuro', {}).querySelector('.hpbar').hidden, 'no hp given hides the bar');
  t.eq(errCount(g), 0, 'no console errors');
});

await t.test('a missing or throwing ART never breaks components', () => {
  const g = fresh();
  g._run('globalThis.ART = { card: { draw() { throw new Error("art broke"); } }, icon: { draw() { throw new Error("icon broke"); } }, hero: { medallion() { throw new Error("medal broke"); } } }');
  g.UI.init();
  const c = g.UI.card(inst('t_slash', 0, ['t_ruby']), { size: 'hand' });
  t.ok(c.querySelector('.c-artc'), 'card still built with the fallback painter'); t.ok(g.UI.stat('gold', 1).querySelector('canvas'), 'stat still built'); t.ok(g.UI.heroBadge('hanae', { hp: 1, maxHp: 2 }).querySelector('canvas'), 'badge still built');
  t.eq(errCount(g), 0, 'nothing reached console.error (warnings only)'); t.ok(g._console.warn.length >= 1, 'a warning says why');
  g._run('globalThis.ART = undefined');
  const d = g.UI.card(inst('t_slash'), { size: 'deck' });
  t.ok(d.classList.contains('card'), 'works with ART undefined');
  g._run('globalThis.AUDIO = undefined; globalThis.META = undefined; globalThis.SCENE = undefined');
  g.UI.applySettings(); g.UI.go('title'); g.UI.overlay.open('modal', { title: 'x' });
  t.ok(true, 'applySettings, go and overlays work without AUDIO, META and SCENE');
});

// ==================================================================================================== buttons, panels, controls
await t.test('UI.btn: kinds, soft disabled state with reason, sound, key hint', async () => {
  const g = fresh();
  g.UI.init();
  let n = 0;
  const b = g.UI.btn('Go', { kind: 'primary', size: 'lg', key: 'E', onclick: () => { n++; } });
  $(g, '#screens').appendChild(b);
  t.ok(b.classList.contains('btn-primary') && b.classList.contains('btn-lg'), 'classes'); t.eq(b.querySelector('.btn-label').textContent, 'Go', 'label'); t.eq(b.querySelector('.btn-key').textContent, 'E', 'key hint'); t.eq(b.getAttribute('type'), 'button', 'type=button');
  g._click(b);
  t.eq(n, 1, 'click'); t.ok(g.log.sfx.indexOf('ui_click') >= 0, 'ui_click sound');
  const d = g.UI.btn('Buy', { kind: 'secondary', disabled: true, reason: 'Not enough gold', onclick: () => { n++; } });
  $(g, '#screens').appendChild(d);
  t.eq(d.getAttribute('aria-disabled'), 'true', 'aria-disabled'); t.ok(d.classList.contains('is-disabled'), 'class');
  g._click(d);
  t.eq(n, 1, 'a disabled button does not run onclick'); t.ok($$(g, '#toasts .toast').some((x) => /Not enough gold/.test(x.textContent)), 'the reason is shown as a toast'); t.ok(g.log.sfx.indexOf('ui_error') >= 0, 'ui_error sound');
  d.rbSet({ disabled: false, label: 'Buy now' });
  t.eq(d.querySelector('.btn-label').textContent, 'Buy now', 'rbSet label'); g._click(d);
  t.eq(n, 2, 'enabled again');
  const sfxb = g.UI.btn('Back', { sfx: 'ui_back' }); $(g, '#screens').appendChild(sfxb); g._click(sfxb);
  t.ok(g.log.sfx.indexOf('ui_back') >= 0, 'data-sfx overrides the sound');
  const obj = g.UI.btn({ label: 'Obj', kind: 'ghost' });
  t.eq(obj.querySelector('.btn-label').textContent, 'Obj', 'options-object form');
});

await t.test('panel, hanko, divider, bar, tabs, seg, toggle, slider', () => {
  const g = fresh();
  g.UI.init();
  const p = g.UI.panel({ kind: 'paper', torn: true, title: 'Title' }, 'text', g._doc.createElement('b'));
  t.ok(p.classList.contains('panel-wrap') && p.panelEl.classList.contains('torn') && p.panelEl.classList.contains('p-paper'), 'torn panel is wrapped for its shadow'); t.ok(/Title/.test(p.textContent), 'title'); t.eq(p.body.childNodes.length, 2, 'children go in .body');
  const q = g.UI.panel({ kind: 'dark', gold: true });
  t.ok(q.classList.contains('panel') && q.classList.contains('p-dark') && q.classList.contains('p-gold'), 'plain dark gold panel is the panel itself');
  t.ok(g.UI.hanko('!').classList.contains('hanko'), 'hanko'); t.ok(g.UI.divider().classList.contains('brush-div'), 'divider');
  const bar = g.UI.bar(30, 60, 'hp');
  t.eq(bar.querySelector('.bar-txt').textContent, '30/60', 'bar text'); t.eq(bar.querySelector('.fill').style.width, '50%', 'bar fill'); bar.rbSet(60); t.eq(bar.querySelector('.fill').style.width, '100%', 'bar update'); bar.rbSet(500); t.eq(bar.querySelector('.fill').style.width, '100%', 'bar clamps');
  const seen = [];
  const tabs = g.UI.tabs([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], { onchange: (id) => seen.push(id) });
  t.eq(tabs.querySelectorAll('.tab.on').length, 1, 'one tab on'); tabs.querySelectorAll('.tab')[1].click(); t.deep(seen, ['b'], 'onchange'); t.eq(tabs.querySelectorAll('.tab')[1].getAttribute('aria-selected'), 'true', 'aria-selected');
  const sg = g.UI.seg([{ value: 1, label: 'One' }, { value: null, label: 'Auto' }], { value: 1, onchange: (v) => seen.push(v) });
  sg.querySelectorAll('.seg-b')[1].click(); t.eq(seen[seen.length - 1], null, 'seg supports null values'); t.eq(sg.querySelectorAll('.seg-b.on').length, 1, 'one on');
  const tg = g.UI.toggle({ value: false, onchange: (v) => seen.push(v) });
  tg.click(); t.eq(seen[seen.length - 1], true, 'toggle'); t.eq(tg.getAttribute('aria-checked'), 'true', 'aria-checked'); t.eq(tg.getAttribute('role'), 'switch', 'role switch');
  const sl = g.UI.slider({ value: 0.5, onchange: (v) => seen.push(v) });
  t.eq(sl.querySelector('.s-val').textContent, '50%', 'slider label'); g._input(sl.querySelector('input'), '0.8'); t.near(seen[seen.length - 1], 0.8, 1e-9, 'slider onchange'); t.eq(sl.querySelector('.s-val').textContent, '80%', 'label follows');
});

// ==================================================================================================== settings
await t.test('applySettings: --ts, body classes, UI.opt, ART.tk.opt, SCENE.speed, AUDIO volumes; OS reduced-motion is followed while the setting is Auto', () => {
  const g = fresh();
  g.UI.init();
  t.eq(g.UI.opt.textScale, 1, 'defaults'); t.eq(g.UI.opt.reduceMotion, false, 'reduceMotion false'); t.eq(g.UI.opt.quality, 'high', 'auto quality starts high'); t.eq(g.UI.opt.speed, 1, 'speed 1');
  const same = g.UI.opt;
  g._run('META.set("textScale", 1.3); META.set("colorblind", true); META.set("fastAnim", 2); META.set("quality", "low"); META.set("musicVol", 0.25); META.set("sfxVol", 0.5); META.set("reduceMotion", true); META.set("shake", 0.5)');
  g.UI.applySettings();
  t.ok(g.UI.opt === same, 'UI.opt keeps its identity'); t.eq(g.UI.opt.textScale, 1.3, 'textScale'); t.eq($(g, '#stage').style.getPropertyValue('--ts'), '1.3', '--ts on #stage');
  const cls = g._doc.body.classList;
  t.ok(cls.contains('reduce-motion') && cls.contains('colorblind') && cls.contains('low'), 'body classes'); t.eq(g.UI.opt.speed, 2.5, 'fastAnim 2 is x2.5'); t.eq(g.log.speed[g.log.speed.length - 1], 2.5, 'SCENE.speed');
  t.deep(g.log.vol.slice(-2), [['music', 0.25], ['sfx', 0.5]], 'AUDIO.setVolume'); t.eq(g._run('ART.tk.opt.quality'), 'low', 'ART.tk.opt.quality'); t.eq(g._run('ART.tk.opt.reduceMotion'), true, 'ART.tk.opt.reduceMotion');
  t.eq(g.UI.opt.shake, 0.5, 'shake');
  g._run('META.set("textScale", 99); META.set("colorblind", false); META.set("reduceMotion", null); META.set("quality", "auto")');
  g.UI.applySettings();
  t.eq(g.UI.opt.textScale, 1, 'an out-of-domain value falls back to the default'); t.ok(!cls.contains('colorblind') && !cls.contains('low') && !cls.contains('reduce-motion'), 'classes cleared');
  g._media('(prefers-reduced-motion: reduce)', true);
  t.eq(g.UI.opt.reduceMotion, true, 'Auto follows the OS media query'); t.ok(cls.contains('reduce-motion'), 'class follows');
  g._media('(prefers-reduced-motion: reduce)', false);
  t.eq(g.UI.opt.reduceMotion, false, 'and follows it back');
  g.UI.setSetting('textScale', 1.15);
  t.eq(g._run('META._s.textScale'), 1.15, 'setSetting stores through META'); t.eq(g.UI.opt.textScale, 1.15, 'and applies');
  g._run('META.set("fastAnim", 0)');
  t.eq(g.UI.cycleSpeed(), 1, 'cycleSpeed goes 0 to 1'); t.eq(g.UI.cycleSpeed(), 2, 'then 2'); t.eq(g.UI.cycleSpeed(), 0, 'then wraps');
});

await t.test('quality auto drops to low when the 2 s average frame time is above 24 ms, and only then', () => {
  const g = fresh();
  g.UI.init();
  let now = 0;
  for (let i = 0; i < 150; i++) { now += 16; g.UI.frame(now); }
  t.eq(g.UI.opt.quality, 'high', '16 ms frames keep high quality');
  for (let i = 0; i < 100; i++) { now += 40; g.UI.frame(now); }
  t.eq(g.UI.opt.quality, 'low', '40 ms frames drop to low'); t.ok(g._doc.body.classList.contains('low'), 'body.low');
  const g2 = fresh();
  g2._run('META.set("quality", "high")');
  g2.UI.init();
  now = 0;
  for (let i = 0; i < 100; i++) { now += 40; g2.UI.frame(now); }
  t.eq(g2.UI.opt.quality, 'high', 'an explicit High is never lowered');
});

await t.test('settingsPanel is bound to META', () => {
  const g = fresh();
  g.UI.init();
  const s = g.UI.settingsPanel();
  t.ok(s.querySelectorAll('.slider').length >= 3, 'sliders'); t.ok(s.querySelectorAll('.seg').length >= 3, 'segmented controls'); t.ok(s.querySelectorAll('.toggle').length >= 3, 'toggles');
  const large = Array.from(s.querySelectorAll('.seg-b')).find((b) => b.textContent === 'Large');
  large.click();
  t.eq(g._run('META._s.textScale'), 1.15, 'choosing Large stores textScale'); t.eq(g.UI.opt.textScale, 1.15, 'and applies it');
  g._input(s.querySelector('input'), '0.3');
  t.eq(g._run('META._s.musicVol'), 0.3, 'the first slider is music volume');
});

// ==================================================================================================== boot, GAME routing
await t.test('GAME.boot: order, first screen, __booted, #boot fades out and is removed, autoboot waits for DOMContentLoaded', async () => {
  const g = fresh({ autoboot: true });
  await g._tick(300);
  t.ok(g._win.__booted, 'window.__booted');
  t.eq(g.UI.currentName, 'title', 'lands on the title'); t.ok($(g, '.s-title .btn'), 'the placeholder title has its buttons');
  t.deep(g.log.order, ['META.load'], 'META.load ran');
  t.ok($(g, '#boot').classList.contains('out'), '#boot gets class out'); await g._tick(500);
  t.ok(!$(g, '#boot'), 'and is removed after 400 ms');
  t.ok(g.log.music.indexOf('title') >= 0, 'title music requested');
  t.eq(errCount(g), 0, 'no console errors');
  g.GAME.boot();
  t.eq($$(g, '#screens .screen').length, 1, 'boot is idempotent');
});

await t.test('GAME.boot: the loop is one rAF chain that stops while hidden and restarts on visibilitychange', async () => {
  const g = fresh({ autoboot: true, realtime: true });
  await g._tick(100);
  const frames = () => g._counts.fillRect || 0;
  const f0 = frames();
  await g._tick(160);
  t.ok(frames() > f0, 'frames are being drawn');
  g._hide();
  const f1 = frames();
  await g._tick(200);
  t.eq(frames(), f1, 'nothing runs while hidden');
  g._show();
  await g._tick(100);
  t.ok(frames() > f1, 'resumes after visibilitychange');
  g.GAME.debug.freeze(true);
  const f2 = frames();
  await g._tick(100);
  t.eq(frames(), f2, 'freeze stops the loop');
  g.GAME.debug.freeze(false);
  await g._tick(100);
  t.ok(frames() > f2, 'unfreeze restarts it');
  const n = await g.GAME.debug.tick(160, 16);
  t.eq(n, 160, 'tick resolves to the simulated ms');
});

await t.test('URL params: ?goto opens a screen with options, ?debug mirrors namespaces, ?freeze and ?ticks, ?seed', async () => {
  const g = fresh({ autoboot: true, search: '?goto=reward&gold=33&heroes=kuro,suzu&cards=t_slash,t_guard&seed=99&debug=1&notutorial=1&hp=10,20' });
  await g._tick(300);
  t.eq(g.UI.currentName, 'reward', '?goto');
  t.deep(g.GAME.params.opts.heroes, ['kuro', 'suzu'], 'list params'); t.eq(g.GAME.params.opts.gold, 33, 'numeric params'); t.eq(g.GAME.params.seed, 99, 'seed'); t.ok(g.GAME.params.notutorial, 'notutorial'); t.deep(g.GAME.params.opts.hp, [10, 20], 'hp pair');
  t.eq(g._win.GAME, g.GAME, '?debug=1 mirrors GAME on window'); t.ok(g._win.UI === g.UI, 'and UI');
  t.eq(g.GAME.state.R.heroes.map((h) => h.id).join(), 'kuro,suzu', 'the synthetic run has the requested heroes');
  t.eq(g._run('__log.newRun.seed'), 99, 'RUN.newRun got ?seed');
  t.eq(g.GAME.state.R.heroes[1].hp, 20, 'hp option applied');
  const f = fresh({ autoboot: true, search: '?goto=title&freeze=1&ticks=64' });
  await f._tick(200);
  t.ok(f._win.__booted, 'booted with freeze');
  const before = f._counts.fillRect || 0;
  await f._tick(200);
  t.eq(f._counts.fillRect || 0, before, '?freeze=1 froze the loop');
  const p = fresh({ autoboot: true, search: '?goto=uigallery&section=cards' });
  await p._tick(300);
  t.eq(p.UI.currentName, 'uigallery', 'the gallery screen exists for ?goto=uigallery'); t.ok($$(p, '.s-uigallery .card').length >= 4, 'and shows cards');
});

await t.test('GAME.newRun: unlocked set, seed rules, daily, story chain, saves, and the route to the map', async () => {
  const g = fresh({ autoboot: true, search: '?seed=7' });
  await g._tick(200);
  g.GAME.newRun({ heroes: ['hanae', 'kuro'], trial: 2 });
  await g._tick(200);
  const nr = g._run('__log.newRun');
  t.deep(nr.heroes, ['hanae', 'kuro'], 'heroes'); t.eq(nr.trial, 2, 'trial'); t.eq(nr.seed, 7, '?seed fixes the seed'); t.deep(nr.unlocked, { card: ['x'], relic: [], gem: [] }, 'META.unlockedSet is passed'); t.eq(nr.daily, false, 'not daily');
  t.eq(g.UI.currentName, 'map', 'to the map (no lore is registered, so no story pages)'); t.eq(g.UI.run, g.GAME.state.R, 'UI.run is the current run'); t.ok(g.UI.params.R === g.UI.run, 'params.R too');
  t.ok(g.log.saves.length >= 1, 'META.saveRun'); t.ok(g._run('META._t.intro'), 'the intro flag is set once');
  g.GAME.newRun({ daily: true });
  const nd = g._run('__log.newRun');
  t.eq(nd.seed, 20260101, 'daily seed from META.dailySeed'); t.deep(nd.heroes, ['kuro', 'suzu'], 'daily heroes from RUN.dailyHeroes'); t.eq(nd.trial, 0, 'daily is trial 0'); t.eq(nd.unlocked, undefined, 'daily unlocks everything'); t.eq(nd.daily, true, 'daily flag');
  const a = fresh({ autoboot: true });
  await a._tick(100);
  a.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  const s1 = a._run('__log.newRun.seed');
  t.eq(typeof s1, 'number', 'without ?seed the seed comes from the clock'); t.ok(s1 >= 0 && s1 <= 4294967295, 'a uint32');
  // story chain when lore exists
  const s = fresh({ autoboot: true });
  await s._tick(100);
  s.DATA.add('lore', { intro: { title: 'Intro', text: 'Once.' }, ch1_intro: { title: 'Ch1', text: 'Grove.' } });
  s.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  await s._tick(300);
  t.eq(s.UI.currentName, 'story', 'the first time: story pages first'); t.eq(s.UI.params.id, 'intro', 'intro first'); t.eq(s.UI.params.then.params.id, 'ch1_intro', 'then the chapter intro'); t.eq(s.UI.params.then.params.then.name, 'map', 'then the map');
  s.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  await s._tick(300);
  t.eq(s.UI.params.id, 'ch1_intro', 'the second run skips the once-only intro');
});

await t.test('GAME.enterNode routes every node kind; instants only toast; saves happen; unknown kinds fall back to the map', async () => {
  const g = fresh({ autoboot: true });
  await g._tick(100);
  g.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  await g._tick(200);
  const R = g.GAME.state.R;
  const cases = { combat: 'combat', reward: 'reward', shop: 'shop', event: 'event', camp: 'camp', forge: 'forge', chest: 'chest', gemcache: 'gemcache' };
  for (const kind of Object.keys(cases)) {
    const saves = g.log.saves.length;
    g.GAME.enterNode({ kind, tile: { q: 1, r: 1 }, rewards: kind === 'reward' ? { gold: 5, cards: [] } : undefined, source: 'combat' });
    await g._tick(120);
    t.eq(g.UI.currentName, cases[kind], kind + ' routes to its screen'); t.ok(g.UI.params.R === R, kind + ': params.R'); t.ok(g.log.saves.length > saves, kind + ': saved on entry');
    g._flush(500);
  }
  t.eq(g.UI.params.node.kind, 'gemcache', 'the node is passed as params.node');
  g.GAME.enterNode({ kind: 'reward', rewards: { gold: 9, cards: [] }, source: 'elite' });
  await g._tick(120);
  t.eq(g.UI.params.rewards.gold, 9, 'reward params carry rewards'); t.eq(g.UI.params.source, 'elite', 'and source');
  await g.GAME.enterNode({ kind: 'well', gained: 4, done: true });
  t.eq(g.UI.currentName, 'reward', 'a well does not change screens'); t.ok($$(g, '#toasts .toast').some((x) => /well/i.test(x.textContent)), 'it toasts'); t.ok(g.log.sfx.indexOf('well') >= 0, 'with the well sound');
  await g.GAME.enterNode({ kind: 'brush', id: 'stroke', done: true });
  t.ok($$(g, '#toasts .toast').some((x) => /brush/i.test(x.textContent)), 'brush toasts');
  g.GAME.enterNode({ kind: 'mystery' });
  await g._tick(120);
  t.eq(g.UI.currentName, 'map', 'unknown kind: back to the map with a warning'); t.ok(g._console.warn.some((w) => /unknown node kind/.test(w)), 'warned');
});

await t.test('GAME.nodeDone: back to the map, or the chapter flow: chapterClear, then story and map; the last boss is victory', async () => {
  const g = fresh({ autoboot: true });
  await g._tick(100);
  g.DATA.add('lore', { ch2_intro: { title: 'Two', text: 'Canals.' }, ch3_intro: { title: 'Three', text: 'Storm.' } });
  g.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  await g._tick(200);
  const R = g.GAME.state.R;
  R.node = { kind: 'shop', tile: { q: 1, r: 0 } };
  g.GAME.enterNode(R.node);
  await g._tick(200);
  g.GAME.nodeDone();
  await g._tick(200);
  t.eq(g.UI.currentName, 'map', 'a finished node returns to the map'); t.eq(R.node, null, 'RUN.finishNode cleared the node');
  // boss of chapter 1
  g._run('__log.chapterEnded = true; __log.next = 2');
  R.node = { kind: 'reward', rewards: { gold: 1, cards: [] }, source: 'boss' };
  g.GAME.nodeDone();
  await g._tick(200);
  t.eq(g.UI.currentName, 'chapterClear', 'after a boss: chapterClear'); t.eq(g.UI.params.chapter, 1, 'chapter cleared'); t.eq(g.UI.params.next, 2, 'next chapter'); t.eq(g._run('__log.chEnd'), 1, 'RUN.chapterEnd ran'); t.ok(g._run('__log.checks') >= 1, 'META.check runs at every chapterClear');
  t.deep(g._run('__log.chapters'), [2], 'the next chapter map was started by GAME (newRun already had a map)');
  g._run('__log.chapterEnded = false');
  g.GAME.nodeDone();
  await g._tick(200);
  t.eq(g.UI.currentName, 'story', 'chapterClear continues to the next chapter intro'); t.eq(g.UI.params.id, 'ch2_intro', 'story id'); t.eq(g.UI.params.then.name, 'map', 'then the map');
  R.chapter = 3;
  g._run('__log.chapterEnded = true; __log.next = "victory"');
  R.node = { kind: 'reward', rewards: { gold: 1, cards: [] }, source: 'boss' };
  g.GAME.nodeDone();
  await g._tick(200);
  t.eq(g.UI.currentName, 'victory', 'the chapter 3 boss ends in victory'); t.deep(g._run('__log.records'), ['win'], 'recorded as a win'); t.eq(g._run('__log.cleared'), 1, 'the saved run is cleared'); t.ok(g.UI.params.summary.score === 123, 'summary from RUN.summary'); t.ok(g.UI.params.summary.record.inkstones === 7, 'with the META record attached');
});

await t.test('defeat: recorded once from every path; combat:end lose routes to gameOver after the animation unless a screen left first', async () => {
  const g = fresh({ autoboot: true });
  await g._tick(100);
  g.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  await g._tick(200);
  g.GAME.enterNode({ kind: 'combat', tile: { q: 1, r: 1 }, enemies: ['x'] });
  await g._tick(200);
  g.UI.bus.emit('combat:end', { result: 'lose' });
  t.deep(g._run('__log.records'), ['lose'], 'recorded at once');
  t.eq(g.UI.currentName, 'combat', 'but the screen gets its death animation first');
  await g._tick(1700);
  t.eq(g.UI.currentName, 'gameOver', 'then gameOver'); t.eq(g._run('__log.records').length, 1, 'still recorded once'); t.eq(g.UI.params.summary.outcome, 'lose', 'summary.outcome');
  g.GAME.defeat();
  await g._tick(200);
  t.eq(g._run('__log.records').length, 1, 'defeat() again does not re-record');
  const h = fresh({ autoboot: true });
  await h._tick(100);
  h.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  await h._tick(200);
  h.GAME.enterNode({ kind: 'combat', tile: { q: 1, r: 1 }, enemies: ['x'] });
  await h._tick(200);
  h.UI.bus.emit('combat:end', { result: 'lose' });
  h.GAME.enterNode({ kind: 'defeat' });
  await h._tick(2000);
  t.eq(h.UI.currentName, 'gameOver', 'a screen that routes itself via enterNode(defeat) works'); t.eq(h._run('__log.records').length, 1, 'no double record');
  const w = fresh({ autoboot: true });
  await w._tick(100);
  w.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  await w._tick(200);
  w.GAME.enterNode({ kind: 'combat', tile: { q: 1, r: 1 }, enemies: ['x'] });
  await w._tick(200);
  w.UI.bus.emit('combat:end', { result: 'win' });
  w.GAME.nodeDone();
  await w._tick(200);
  t.eq(w._run('__log.records').length, 0, 'a win records nothing');
});

await t.test('abandon, toTitle, continueRun, and the one persistent "cannot be saved" toast', async () => {
  const g = fresh({ autoboot: true });
  await g._tick(100);
  g.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  await g._tick(200);
  let p = g.GAME.abandon();
  t.ok($(g, '.o-confirm'), 'abandon asks first');
  Array.from($(g, '.o-confirm').querySelectorAll('.btn'))[0].click();
  t.eq(await p, false, 'No keeps playing'); t.deep(g._run('__log.records'), [], 'nothing recorded');
  p = g.GAME.abandon();
  Array.from($(g, '.o-confirm').querySelectorAll('.btn'))[1].click();
  t.eq(await p, true, 'Yes abandons'); await g._tick(200);
  t.deep(g._run('__log.records'), ['abandon'], 'recorded as abandon'); t.eq(g.UI.currentName, 'title', 'back to the title'); t.eq(g.GAME.state.R, null, 'run cleared');
  t.ok($$(g, '#toasts .toast').some((x) => /Inkstones/.test(x.textContent)), 'shows the Inkstones earned');
  // continue
  g._run('__log.saved = { id: "saved1", chapter: 2, heroes: [{ id: "suzu", hp: 5, maxHp: 9 }], deck: [], relics: [], node: { kind: "shop", tile: { q: 2, r: 2 } }, map: {} }');
  await g.GAME.toTitle();
  await g._tick(200);
  t.ok(Array.from($$(g, '.s-title .btn')).some((b) => /Continue/.test(b.textContent)), 'Continue shows when META.hasRun()');
  await g.GAME.continueRun();
  await g._tick(200);
  t.eq(g.UI.currentName, 'shop', 'a saved node is re-entered'); t.eq(g.GAME.state.R.id, 'saved1', 'the loaded run is current');
  g._run('__log.saved = { id: "saved2", chapter: 1, heroes: [], deck: [], relics: [], node: null, map: {} }');
  await g.GAME.continueRun();
  await g._tick(200);
  t.eq(g.UI.currentName, 'map', 'no node: the map');
  g._run('__log.saved = null');
  await g.GAME.continueRun();
  t.ok($$(g, '#toasts .toast').some((x) => /no saved tale/i.test(x.textContent)), 'nothing to continue: a toast, no crash');
  g._run('__log.failSave = true');
  g.GAME.save(); g.GAME.save(); g.GAME.save();
  t.eq($$(g, '#toasts .toast[data-tid="nosave"]').length, 1, 'exactly one persistent save warning'); t.ok(/cannot be saved/.test($(g, '.toast[data-tid="nosave"]').textContent), 'copy');
});

await t.test('META.bus achievement and unlock events become toasts with sounds', async () => {
  const g = fresh({ autoboot: true });
  await g._tick(100);
  g.DATA.add('achievements', { t_ach: { name: 'Test Feat', text: 'Do it.', stat: { k: 'runs', gte: 1 } } });
  g._run('META.bus.emit("achievement", { id: "t_ach" }); META.bus.emit("unlock", { kind: "card", id: "t_slash" })');
  const texts = $$(g, '#toasts .toast').map((x) => x.textContent);
  t.ok(texts.some((x) => /Achievement: Test Feat/.test(x)), 'achievement toast'); t.ok(texts.some((x) => /Unlocked: Test Slash/.test(x)), 'unlock toast');
  t.ok($$(g, '#toasts .toast.tk-achievement').length === 1, 'achievement kind');
  t.ok(g.log.sfx.indexOf('achievement') >= 0 && g.log.sfx.indexOf('unlock') >= 0, 'sounds');
});

await t.test('the pause overlay: Resume, Deck, Treasures, Settings, How to play, Abandon, Save and quit', async () => {
  const g = fresh({ autoboot: true });
  await g._tick(100);
  g.GAME.newRun({ heroes: ['hanae', 'kuro'] });
  await g._tick(200);
  g._key('Escape');
  const box = $(g, '.o-pause');
  t.ok(box, 'Esc on the map opens pause');
  const labels = Array.from(box.querySelectorAll('.btn')).map((b) => b.textContent.trim());
  t.deep(labels, ['Resume', 'Deck', 'Treasures', 'Settings', 'How to play', 'Abandon run', 'Save and quit'], 'the seven entries in order');
  Array.from(box.querySelectorAll('.btn'))[1].click();
  t.eq(g.UI.overlay.count(), 2, 'Deck opens on top of pause'); t.ok($(g, '.o-deck'), 'deck overlay');
  g._key('Escape');
  t.eq(g.UI.overlay.count(), 1, 'Esc peels one layer');
  const saves = g.log.saves.length;
  Array.from(box.querySelectorAll('.btn'))[6].click();
  await g._tick(200);
  t.eq(g.UI.currentName, 'title', 'Save and quit goes to the title'); t.ok(g.log.saves.length > saves, 'after saving'); t.eq(g.UI.overlay.count(), 0, 'overlays closed');
  const m = g.UI.menuButton();
  $(g, '#screens').appendChild(m);
  t.ok(m.classList.contains('menu-btn'), 'menuButton'); m.click();
  t.eq(g.UI.overlay.count(), 1, 'the menu button opens pause'); m.click();
  t.eq(g.UI.overlay.count(), 1, 'and does not stack a second one');
});

await t.test('GAME.debug.open builds a run and jumps to every screen with the right params; quickRun; setGold; addRelic; skipChapter', async () => {
  const g = fresh({ autoboot: true, search: '?debug=1' });
  await g._tick(100);
  g.DATA.add('relics', { t_relic: { name: 'Test Lantern', rarity: 'rare', text: 'Glows.', hooks: [], art: { m: 'lantern' } } });
  for (const name of ['title', 'heroSelect', 'library', 'settings', 'howto', 'story']) { await g.GAME.debug.open(name, {}); t.eq(g.UI.currentName, name, 'open(' + name + ')'); }
  await g.GAME.debug.open('combat', { enemies: ['t_enemy_missing'], tier: 'elite', hp: [11, 22], heroes: ['suzu', 'raiga'], gold: 77 });
  t.eq(g.UI.currentName, 'combat', 'combat'); t.eq(g.UI.params.node.kind, 'combat', 'a combat node'); t.eq(g.UI.params.node.tier, 'elite', 'tier'); t.eq(g.GAME.state.R.gold, 77, 'gold'); t.deep(g.GAME.state.R.heroes.map((h) => h.hp), [11, 22], 'hp'); t.eq(g.GAME.state.R.node, g.UI.params.node, 'R.node is the node');
  let setup = null;
  g.UI.screens.combat = { enter() {}, debugSetup(o) { setup = o; }, debug() { return { C: 'c', win() { return 'won'; } }; } };
  await g.GAME.debug.open('combat', { hand: ['a', 'b'], turn: 3 });
  t.deep(setup.hand, ['a', 'b'], 'debugSetup gets hand'); t.eq(setup.turn, 3, 'and turn'); t.eq(g.GAME.debug.combat().C, 'c', 'debug.combat() reads the screen debug object'); t.eq(g.GAME.debug.win(), 'won', 'win() defers to the screen');
  await g.GAME.debug.open('reward', { source: 'elite', gold: 40, relics: ['t_relic'], gems: ['t_ruby'], cards: ['t_slash'] });
  t.eq(g.UI.currentName, 'reward', 'reward'); t.eq(g.UI.params.rewards.gold, 40, 'reward gold'); t.deep(g.UI.params.rewards.relics, ['t_relic'], 'relics'); t.eq(g.UI.params.rewards.tier, 'elite', 'tier from source'); t.eq(g.UI.params.node.kind, 'reward', 'R.node is a reward node');
  for (const name of ['shop', 'camp', 'forge', 'chest', 'gemcache', 'event']) { await g.GAME.debug.open(name, { seed: 5, id: 'x' }); t.eq(g.UI.currentName, name, 'open(' + name + ')'); t.eq(g.UI.params.node.kind, name, name + ' node'); }
  await g.GAME.debug.open('map', { chapter: 2, painted: 0.5, ink: 3 });
  t.eq(g.UI.currentName, 'map', 'map'); t.eq(g.GAME.state.R.ink, 3, 'ink'); t.eq(g.GAME.state.R.chapter, 2, 'chapter');
  await g.GAME.debug.open('chapterClear', { chapter: 1 });
  t.eq(g.UI.currentName, 'chapterClear', 'chapterClear'); t.eq(g.UI.params.chapter, 1, 'chapter param');
  await g.GAME.debug.open('gameOver', {}); t.eq(g.UI.currentName, 'gameOver', 'gameOver'); t.ok(g.UI.params.summary, 'with a summary');
  await g.GAME.debug.open('victory', { summary: { score: 5 } }); t.eq(g.UI.params.summary.score, 5, 'a given summary is used');
  const R = g.GAME.debug.quickRun({ heroes: ['hanae', 'kuro'], gold: 12 });
  await g._tick(100);
  t.eq(g.UI.currentName, 'map', 'quickRun goes to the map'); t.eq(R.gold, 12, 'and returns the run');
  g.GAME.debug.setGold(500); t.eq(g.GAME.state.R.gold, 500, 'setGold');
  g.GAME.debug.addRelic('t_relic'); t.deep(g.GAME.state.R.relics, ['t_relic'], 'addRelic');
  g._run('__log.next = 2');
  g.GAME.debug.skipChapter();
  await g._tick(200);
  t.eq(g.UI.currentName, 'chapterClear', 'skipChapter runs the chapter flow');
  await g.GAME.debug.open('uigallery', { section: 'controls' });
  t.eq(g.UI.currentName, 'uigallery', 'the gallery opens through debug.open');
  t.eq(errCount(g), 0, 'no console errors anywhere in that tour [' + g._console.error.slice(0, 2).join(' | ') + ']');
});

await t.test('the placeholder screens work end to end: heroSelect starts a run, reward claims and continues, end screens go home', async () => {
  const g = fresh({ autoboot: true });
  await g._tick(100);
  await g.UI.go('heroSelect', null, { force: true });
  const badges = $$(g, '.s-heroSelect .badge');
  t.eq(badges.length, 4, 'four heroes'); const start = () => Array.from($$(g, '.s-heroSelect .btn')).find((b) => /Begin/.test(b.textContent));
  t.eq(start().getAttribute('aria-disabled'), 'true', 'Begin is disabled until two are chosen');
  badges[0].click(); badges[1].click();
  t.ok(!start().getAttribute('aria-disabled'), 'two chosen enables Begin'); t.eq($$(g, '.s-heroSelect .badge.sel').length, 2, 'two badges selected');
  badges[2].click();
  t.eq($$(g, '.s-heroSelect .badge.sel').length, 2, 'choosing a third drops the oldest');
  start().click();
  await g._tick(200);
  t.eq(g.UI.currentName, 'map', 'Begin starts the run'); t.deep(g._run('__log.newRun.heroes'), ['kuro', 'suzu'], 'with the two most recent picks');
  await g.GAME.debug.open('reward', { cards: ['t_slash'] });
  $$(g, '.s-reward .card')[0].click();
  Array.from($$(g, '.s-reward .btn')).find((b) => /Take/.test(b.textContent)).click();
  await g._tick(200);
  t.eq(g._run('__log.claims[0].card'), 't_slash', 'the chosen card is claimed'); t.eq(g.UI.currentName, 'map', 'then nodeDone returns to the map');
  await g.GAME.debug.open('combat', {});
  $$(g, '.s-combat .btn').find((b) => /Win/.test(b.textContent)).click();
  await g._tick(300);
  t.eq(g.UI.currentName, 'reward', 'the placeholder combat Win leads to a reward even when COMBAT is not available');
  await g.GAME.debug.open('combat', {});
  $$(g, '.s-combat .btn').find((b) => /Lose/.test(b.textContent)).click();
  await g._tick(1800);
  t.eq(g.UI.currentName, 'gameOver', 'the placeholder combat Lose leads to gameOver');
  await g.GAME.debug.open('gameOver', {});
  Array.from($$(g, '.s-gameOver .btn')).find((b) => /title/i.test(b.textContent)).click();
  await g._tick(200);
  t.eq(g.UI.currentName, 'title', 'the end screen goes home');
  t.eq(errCount(g), 0, 'no console errors');
});

await t.test('UI.anchorEl finds tutorial anchors by name or selector', async () => {
  const g = fresh();
  g.UI.screens.a = { enter(p, root) { const d = g._doc.createElement('div'); d.setAttribute('data-tut', 'hand'); root.appendChild(d); } };
  await g.UI.go('a');
  t.ok(g.UI.anchorEl('hand'), 'by anchor name'); t.ok(g.UI.anchorEl('[data-tut="hand"]'), 'by selector'); t.eq(g.UI.anchorEl('energy'), null, 'null when absent'); t.eq(g.UI.anchorEl(''), null, 'null for empty');
});

// ==================================================================================================== smoke against the real modules that exist
await t.test('smoke: with every real module that exists, the gallery and placeholders open and no console.error comes from the UI', async () => {
  const g = boot({ only: ['ui', 'main'], autoboot: true, search: '?debug=1' });
  await g._tick(300);
  const ids = Object.keys(g.DATA.cards);
  const sections = ['cards', 'cards2', 'controls', 'chips', 'tips', 'modal', 'confirm', 'pick', 'legend', 'settings'];
  for (const sec of sections) { await g.GAME.debug.open('uigallery', { section: sec }); await g._tick(100); g.UI.overlay.closeAll(); g.UI.tip.hide(); }
  const bad = g._console.error.filter((l) => /\[ui\]/.test(l));
  t.eq(bad.length, 0, 'no [ui] console.error across ' + sections.length + ' gallery sections [' + bad.slice(0, 2).join(' | ') + ']');
  let built = 0;
  for (const id of ids) { const c = g.UI.card({ uid: 1, id, up: 0, gems: [] }, { size: 'hand' }); if (c.querySelector('.c-name')) built++; const c2 = g.UI.card({ uid: 2, id, up: 1, gems: [] }, { size: 'mini' }); if (c2.querySelector('.c-name')) built++; }
  t.eq(built, ids.length * 2, 'UI.card builds every real card (' + ids.length + ') at hand and mini size');
  t.eq(g._issues.filter((i) => /ui\.js/.test(i.at || '')).length, 0, 'no canvas issues from ui.js');
});

t.done();
