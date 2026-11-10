// Frozen screens under a modal (ui/core.js frame loop, ui/frame_state.js): while a screen pushed with app.push is on top, everything below it
// neither updates nor redraws, takes no input, keeps its tweens, timers and clock where they stood, and resumes to the identical outcome.
// The lower stack is painted once into ONE snapshot canvas and painted again only when it is stale. Every block failed on the old loop
// (which updated and drew every screen of the stack every frame) before the change.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key, fakeCtx, installDom } from './graftwork_lib.mjs';
import { createFrameState } from '../graftwork/ui/frame_state.js';
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';
import * as WD from '../graftwork/engine/ward.js';
import { ENEMIES } from '../graftwork/data/index.js';
import combat from '../graftwork/ui/combat.js';
import pause, { installPause, drawPauseOverlay } from '../graftwork/ui/pause.js';
import settings from '../graftwork/ui/settings.js';
import deckview from '../graftwork/ui/deckview.js';
import * as TR from '../graftwork/ui/transitions.js';
import * as LAYOUT from '../graftwork/ui/layout_registry.js';
import { say, installToast, drawInstallToast } from '../graftwork/ui/install.js';

const DT = 1 / 60;
let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', String(e && e.stack).split('\n').slice(0, 6).join('\n')); process.exitCode = 1; Math.random = realRandom; } };
// a seeded Math.random whose state can be set aside while a modal is open (the claim is about the frozen screen, not about what a modal rolls)
const RNG = { s: 1 };
const realRandom = Math.random;
function seedRandom(seed) { RNG.s = seed >>> 0; Math.random = () => { RNG.s = (RNG.s + 0x6D2B79F5) | 0; let x = Math.imul(RNG.s ^ (RNG.s >>> 15), 1 | RNG.s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const realKey = (app, k, extra) => { const e = { key: k, preventDefault() {}, ...(extra || {}) }; app.pressedKeys.push(e); const s = app.top(); if (s && s.key && s.key(app, e)) e.preventDefault(); app.tick(DT); };
const r4 = (v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
// a counting screen: every update and draw is logged with what the screen could see at that moment
function probe(name, o = {}) {
  const p = { name, updates: 0, draws: 0, seen: [], ...o };
  p.update = function (app, dt) { p.updates++; p.lastDt = dt; if (o.onUpdate) o.onUpdate(app, dt); };
  p.draw = function (app) { p.draws++; p.seen.push({ t: app.t, dt: app.dt, blocked: !!app.blocked, keys: app.pressedKeys.length, mx: app.mouse.x, pressed: !!app.mouse.pressed, released: !!app.mouse.released }); if (o.onDraw) o.onDraw(app); };
  return p;
}

// ---------------------------------------------------------------- 1. the bookkeeping (pure)
await t('frame state: who is on top, the clock a covered screen keeps, who owns a tween, when the snapshot is stale', () => {
  const Z = createFrameState(), a = { name: 'a' }, b = { name: 'b' }, c = { name: 'c' };
  assert.equal(Z.retop([a], { t: 1, sceneT: 1 }, 0).covered, null, 'the first screen covers nobody');
  assert.equal(Z.retop([a], { t: 2, sceneT: 2 }, 5), null, 'same top: nothing happened');
  let ch = Z.retop([a, b], { t: 3, sceneT: 3 }, 100);
  assert.equal(ch.covered, a); assert.equal(ch.uncovered, null); assert.equal(Z.clocks.get(a).t, 3, 'the covered screen keeps the clock it stopped at');
  assert.ok(Z.isLive(b, [a, b]), 'the top screen owns live time'); assert.ok(!Z.isLive(a, [a, b]), 'a covered owner is frozen');
  assert.ok(Z.isLive(undefined, [a, b]), 'no owner: nobody to wait for'); assert.ok(Z.isLive(c, [a, b]), 'an owner that left the stack: runs out as before');
  ch = Z.retop([a, b, c], { t: 9, sceneT: 9 }, 150); assert.equal(ch.covered, b); assert.equal(Z.clocks.size, 2);
  ch = Z.retop([a, b], { t: 20, sceneT: 20 }, 400); assert.equal(ch.uncovered, b); assert.equal(ch.clock.t, 9); assert.equal(ch.ms, 250, 'how long it stood still');
  ch = Z.retop([a], { t: 30, sceneT: 30 }, 1100); assert.equal(ch.uncovered, a); assert.equal(ch.clock.t, 3); assert.equal(ch.ms, 1000); assert.equal(Z.clocks.size, 0);
  Z.retop([a, b], { t: 4, sceneT: 4 }, 0); Z.retop([c], { t: 5, sceneT: 5 }, 0); assert.equal(Z.clocks.size, 0, 'screens that left the stack keep no clock');
  // staleness
  const S = createFrameState(); assert.equal(S.stale(100, 50), 'stack', 'a new stack is always painted'); S.painted(100, 50);
  assert.equal(S.stale(100, 50), ''); assert.equal(S.stale(100, 50), '');
  assert.equal(S.stale(120, 50), 'resize', 'another backing store'); S.painted(120, 50); assert.equal(S.stale(120, 50), '');
  S.markDirty('look'); assert.equal(S.stale(120, 50), 'look'); S.markDirty('asked'); assert.equal(S.stale(120, 50), 'look', 'the first reason stays'); S.painted(120, 50);
  S.markDirty(); assert.equal(S.stale(120, 50), 'asked'); S.painted(120, 50);
  assert.deepEqual(S.why, { stack: 1, resize: 1, look: 1, asked: 1 }); assert.equal(S.paints, 4);
  S.forget(); assert.equal(S.stale(120, 50), 'stack');
});

// ---------------------------------------------------------------- 2. no update, no draw, no input, no time
await t('a screen under a modal gets no update and no draw (one snapshot paint, blocked, without keys, pointer or time)', async () => {
  const app = await makeApp({ meta: { settings: {} } });
  const base = probe('base'), mid = probe('mid'), top = probe('top');
  app.register('base', base); app.register('mid', mid); app.register('top', top);
  app.go('base'); frames(app, 10);
  assert.equal(base.updates, 10); assert.equal(base.draws, 10);
  const t0 = app.t;
  app.push('mid'); base.seen.length = 0;
  app.mouse.x = 300; app.mouse.y = 300;
  for (let i = 0; i < 60; i++) { app.mouse.pressed = i % 7 === 0; app.mouse.released = i % 7 === 1; app.pressedKeys.push({ key: 'e' }); app.tick(DT); }
  assert.equal(base.updates, 10, 'no update while covered'); assert.equal(base.draws, 11, 'one draw: the snapshot');
  assert.equal(mid.updates, 60); assert.equal(mid.draws, 60); assert.equal(app.frozen, true, 'app.frozen says so');
  const s = base.seen[0];
  assert.equal(s.dt, 0, 'no time passes in the snapshot paint'); assert.ok(Math.abs(s.t - t0) < 1e-9, 'it is painted at the instant it stopped');
  assert.equal(s.blocked, true); assert.equal(s.keys, 0, 'no keys'); assert.equal(s.mx, -999, 'no pointer'); assert.equal(s.pressed, false); assert.equal(s.released, false);
  assert.ok(mid.seen.every((q) => !q.blocked && q.dt > 0), 'the modal is live');
  assert.ok(mid.seen.some((q) => q.keys > 0 && q.mx === 300), 'and it has the keys and the pointer');
  assert.ok(Math.abs(app.t - (t0 + 60 * DT)) < 1e-6, 'the modal has its own running clock');
  // three deep: only the top one runs, the snapshot holds both lower screens
  app.push('top'); const md = mid.draws, bd = base.draws; frames(app, 40);
  assert.equal(base.updates, 10); assert.equal(mid.updates, 60); assert.equal(base.draws, bd + 1, 'the lower stack is painted once more for the new top'); assert.equal(mid.draws, md + 1);
  assert.equal(top.updates, 40); assert.equal(app.frameState.clocks.size, 2);
  app.pop(); frames(app, 5); assert.equal(mid.updates, 65); assert.equal(base.updates, 10); assert.equal(base.draws, bd + 2);
  app.pop(); frames(app, 5); assert.equal(base.updates, 15, 'uncovered: it runs again'); assert.equal(app.frozen, false);
  assert.ok(Math.abs(app.t - (t0 + 5 * DT)) < 1e-6, 'and its clock goes on from where it stopped (no jump)');
  assert.equal(app.frameState.clocks.size, 0);
  // a stack changed behind app.push (tests do it) is noticed at the next tick
  app.stack.push(mid); const bu = base.updates; frames(app, 8); assert.equal(base.updates, bu, 'a spliced-in screen freezes the rest too'); app.stack.pop(); frames(app, 2); assert.equal(base.updates, bu + 2);
});

// ---------------------------------------------------------------- 3. tweens and timers have an owner
await t('a tween and an after-timer of the covered screen pause and resume; the modal\'s own run', async () => {
  const mk = async () => {
    const app = await makeApp({ meta: { settings: {} } });
    const obj = { x: 0 }, log = [];
    app.register('base', probe('base')); app.go('base');
    app.tween(obj, { x: 100 }, 1000, 'linear', () => log.push('tween@' + app.frame)); app.after(500, () => log.push('timer@' + app.frame));
    return { app, obj, log };
  };
  // control: no modal
  const A = await mk(); const xa = []; for (let i = 0; i < 80; i++) { A.app.tick(DT); xa.push(r4(A.obj.x)); }
  // with a modal from live frame 10 to live frame 11, open for 3 seconds
  const B = await mk(); const xb = []; const mlog = [], mobj = { k: 0 };
  B.app.register('modal', { enter(app) { app.tween(mobj, { k: 1 }, 300, 'linear', () => mlog.push('mtween')); app.after(200, () => mlog.push('mtimer')); }, draw() {} });
  for (let i = 0; i < 10; i++) { B.app.tick(DT); xb.push(r4(B.obj.x)); }
  const x10 = B.obj.x; assert.ok(x10 > 10 && x10 < 20);
  B.app.push('modal');
  B.app.after(0, () => mlog.push('zero')); // made by the modal: due at once
  frames(B.app, 180);
  assert.equal(B.obj.x, x10, 'the covered screen\'s tween stood still for 3 s'); assert.deepEqual(B.log, [], 'and its timer did not fire');
  assert.equal(B.app.timers.filter((q) => q.owner && q.owner.name === 'base').length, 1, 'the timer remembers the screen that made it');
  assert.equal(mobj.k, 1, 'the modal\'s tween ran'); assert.deepEqual(mlog.sort(), ['mtimer', 'mtween', 'zero']);
  B.app.pop();
  for (let i = 10; i < 80; i++) { B.app.tick(DT); xb.push(r4(B.obj.x)); }
  assert.deepEqual(xb, xa, 'frame for frame the same tween as without the modal');
  assert.deepEqual(B.log.map((s) => s.split('@')[0]), A.log.map((s) => s.split('@')[0]));
  assert.deepEqual(B.log.map((s) => +s.split('@')[1] - 180), A.log.map((s) => +s.split('@')[1]), 'both fired after the same amount of live time');
  // a timer the base made in the very tick it was covered waits too; one whose owner left the stack runs out
  const C = await mk(); let late = 0, orphan = 0;
  C.app.register('modal', { draw() {} }); C.app.register('other', { draw() {} });
  C.app.after(0, () => late++); C.app.push('modal'); frames(C.app, 30); assert.equal(late, 0, 'due but frozen'); C.app.pop(); frames(C.app, 1); assert.equal(late, 1);
  // a timer a covered screen makes while it is painted into the snapshot is its own: it waits with it
  let painted = 0, fired = 0; const base = C.app.top(), d0 = base.draw; base.draw = function (a) { d0.call(this, a); if (a.blocked && !painted++) a.after(50, () => fired++); };
  C.app.push('modal'); frames(C.app, 30); assert.equal(painted, 1); assert.equal(fired, 0, 'made during the snapshot paint: frozen with its screen'); C.app.pop(); frames(C.app, 5); assert.equal(fired, 1); base.draw = d0;
  C.app.push('modal'); C.app.after(400, () => orphan++); C.app.go('other'); frames(C.app, 30); assert.equal(orphan, 1, 'app.go: nobody is frozen any more');
  assert.equal(C.app.frozen, false);
});

// ---------------------------------------------------------------- 4. the snapshot: one canvas, painted when stale, released
await t('the snapshot: painted once, again on resize and app.refreshBelow, one canvas, released when the stack is back to one screen', async () => {
  const made = []; const ce = globalThis.document.createElement;
  installDom(); globalThis.document.createElement = (tag) => { const c = { tag, width: 0, height: 0, getContext: () => (c.g || (c.g = fakeCtx())), style: {} }; made.push(c); return c; };
  try {
    const app = await makeApp({ meta: { settings: {} } });
    const base = probe('base'), modal = probe('modal');
    app.register('base', base); app.register('modal', modal); app.go('base'); frames(app, 5);
    const blits = []; const di = app.ctx.drawImage; app.ctx.drawImage = function (im, ...a) { blits.push(im); return di.call(this, im, ...a); };
    const Z = app.frameState; assert.equal(Z.snap, null);
    made.length = 0;
    app.push('modal'); frames(app, 50);
    assert.equal(Z.paints, 1); assert.deepEqual(Z.why, { stack: 1 }); assert.equal(base.draws, 6);
    assert.equal(made.length, 1, 'one canvas'); const cv = Z.snap; assert.equal(cv, made[0]);
    assert.equal(cv.width, app.canvas.width); assert.equal(cv.height, app.canvas.height, 'the size of the backing store');
    assert.equal(blits.filter((b) => b === cv).length, 49, 'every later frame blits it under the modal');
    // resize: another backing store
    globalThis.window.innerWidth = 1000; globalThis.window.innerHeight = 462; globalThis.window.devicePixelRatio = 2; app.resize();
    frames(app, 20);
    assert.equal(Z.paints, 2); assert.equal(Z.why.resize, 1); assert.equal(base.draws, 7); assert.equal(base.updates, 5, 'painted, never updated');
    assert.equal(cv.width, app.canvas.width); assert.ok(app.canvas.width > 1280, 'the snapshot follows the device pixel ratio: ' + app.canvas.width);
    assert.equal(made.length, 1, 'still the one canvas');
    // the modal asks
    app.refreshBelow(); app.refreshBelow(); frames(app, 20);
    assert.equal(Z.paints, 3); assert.equal(Z.why.asked, 1, 'two requests in one frame are one paint'); assert.equal(base.draws, 8);
    // a quality tier change repaints (lighter scene, other sprites), with or without another backing store
    app.perf.q.setMode('low', 0); frames(app, 10); assert.equal(Z.paints, 4); assert.equal(base.draws, 9);
    app.perf.q.setMode('high', 0); frames(app, 10); assert.equal(Z.paints, 5);
    const before = Z.paints; frames(app, 200); assert.equal(Z.paints, before, 'nothing changed: nothing is painted again');
    // closed: released
    app.pop(); frames(app, 3);
    assert.equal(Z.snap, null, 'no snapshot is kept'); assert.equal(cv.width, 0); assert.equal(cv.height, 0, 'its backing store is given back');
    // twenty rounds, three deep: never more than one snapshot alive, every canvas released
    app.register('top', probe('top')); made.length = 0;
    for (let i = 0; i < 20; i++) {
      app.push('modal'); frames(app, 3); app.push('top'); frames(app, 3);
      assert.equal(made.filter((c) => c.width > 0).length, 1, 'one live snapshot');
      app.pop(); frames(app, 2); app.pop(); frames(app, 2);
      assert.equal(made.filter((c) => c.width > 0).length, 0, 'none after closing');
    }
    assert.ok(made.length <= 20, 'one canvas per opening at most: ' + made.length);
    app.push('modal'); frames(app, 2); app.go('base'); frames(app, 2); assert.equal(Z.snap, null, 'app.go from under a modal releases it too');
  } finally { globalThis.document.createElement = ce; globalThis.window.innerWidth = 1280; globalThis.window.innerHeight = 720; globalThis.window.devicePixelRatio = 1; }
});

// ---------------------------------------------------------------- 5. the real boot: settings, cosmetics, fullscreen, transitions, things that go on
await t('real boot: every look-changing setting repaints the frozen title once; saving, the toast and the quality controller go on', async () => {
  installDom();
  const canvas = { getContext: () => fakeCtx(), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} };
  globalThis.document.getElementById = () => null;
  globalThis.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; })();
  let rafCb = null; const raf0 = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = (f) => { rafCb = f; return 1; };
  const { boot } = await import('../graftwork/main.js');
  const { app, flow } = boot(canvas);
  globalThis.requestAnimationFrame = raf0;
  const title = app.screens.title, Z = app.frameState;
  let titleDraws = 0; const td = title.draw; title.draw = function (a) { titleDraws++; return td.call(this, a); };
  frames(app, 30); assert.equal(titleDraws, 30);
  flow.openSettings(); frames(app, 30);
  assert.equal(app.top().name, 'settings'); assert.equal(titleDraws, 31, 'the title under Settings: one paint'); assert.equal(Z.paints, 1);
  const st = app.shared.meta.settings, row = (label) => { const q = app.top().rows.find((x) => x.label === label); assert.ok(q, 'row ' + label); return q; };
  const saved = () => JSON.parse(globalThis.localStorage.getItem('graftwork_meta_v1')).settings;
  // each of these changes what the frozen screen looks like: exactly one more paint each, and it is saved
  const LOOK = [['Text size', 'textScale'], ['High contrast text', 'highContrast'], ['Colorblind mode', 'colorblind'], ['Colorblind palette', 'colorblindMode'], ['Reduced motion', 'reducedMotion'], ['Effects quality', 'quality'], ['Graphics', 'graphics'], ['Screen flashes', 'flashes']];
  for (const [label, k] of LOOK) {
    const p0 = Z.paints, d0 = titleDraws, v0 = st[k];
    row(label).act(1); frames(app, 6);
    assert.notEqual(st[k], v0, label + ' changed'); assert.deepEqual(saved()[k], st[k], label + ' is saved while the title is frozen');
    assert.equal(Z.paints, p0 + 1, label + ': one repaint, got ' + (Z.paints - p0)); assert.equal(titleDraws, d0 + 1, label + ': the title is drawn once');
  }
  assert.equal(app.textScale, st.textScale / 100, 'the setting is applied (main.js overlay runs under a modal)'); assert.equal(app.highContrast, true);
  // fullscreen: the change event resizes and repaints (the title shows the fullscreen state)
  { const p0 = Z.paints; app.fsSync && app.fsSync(); if (!app.fsSync) app.resize(); frames(app, 4); assert.equal(Z.paints, p0 + 1, 'fullscreen / resize repaints'); }
  // a picture that finishes loading repaints
  { const { assets } = await import('../graftwork/ui/assets.js'); const p0 = Z.paints; assets.ver++; frames(app, 4); assert.equal(Z.paints, p0 + 1, 'art arriving repaints'); }
  // the toast of the install flow is not frozen
  say('hello', 2); const t0 = installToast().t; frames(app, 30); assert.ok(installToast().t < t0 - 0.4, 'the toast keeps running over a modal');
  void drawInstallToast;
  // wardrobe cosmetics: a save repaints (the card back and the hero tint show on the title)
  realKey(app, 'Escape'); frames(app, 3); assert.equal(app.stack.length, 1);
  flow.openWardrobe(); frames(app, 10); { const p0 = Z.paints; flow.saveMeta(); frames(app, 3); assert.equal(Z.paints, p0 + 1, 'a cosmetics save repaints'); }
  realKey(app, 'Escape'); frames(app, 3); assert.equal(app.stack.length, 1); assert.equal(Z.snap, null);
  // the quality controller measures the modal's own frames, and a calm modal idles at 30 fps over a busy screen whose tween is frozen
  app.register('busy', { name: 'busy', draw() {} }); app.go('busy'); app.tween({ x: 0 }, { x: 1 }, 600000); // a screen that is never calm, with a long tween
  let ticks = 0; const tk = app.tick; app.tick = (raw) => { ticks++; return tk(raw); };
  let now = performance.now() + 100; // the loop was started by boot: drive its rAF callback by hand
  const run = (ms) => { const n0 = ticks; for (let e = 0; e < ms; e += 1000 / 60) { now += 1000 / 60; const f = rafCb; rafCb = null; globalThis.requestAnimationFrame = (g) => { rafCb = g; return 1; }; f(now); globalThis.requestAnimationFrame = raf0; } return ticks - n0; };
  app.perf.gov.lastInput = -1e9; app.perf.gov.enteredAt = -1e9;
  assert.ok(run(1000) >= 58, 'the busy screen alone runs at full rate');
  flow.openSettings(); app.perf.gov.lastInput = -1e9; app.perf.gov.enteredAt = -1e9; run(600); // the open tween of Settings runs out
  const f0 = app.perf.q.frames, idle = run(2000);
  assert.ok(idle >= 56 && idle <= 64, 'Settings over a busy screen idles at 30 fps: ' + idle + ' ticks in 2 s');
  assert.ok(app.perf.q.frames - f0 >= 50, 'the quality controller keeps sampling the modal frames');
  app.stop(); app.tick = tk;
});

await t('real boot: a screen wipe and a boss plate caught by Pause stand still, are part of the snapshot and finish as without it', async () => {
  const { boot } = await import('../graftwork/main.js');
  const mkCanvas = () => ({ getContext: () => fakeCtx(), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} });
  const scenario = (pauseAt, hold) => {
    seedRandom(77);
    const { app, flow } = boot(mkCanvas());
    app.shared.meta.settings.reducedMotion = false; app.shared.meta.settings.quality = 'off';
    frames(app, 20);
    flow.start({ hero: 'odile', seed: 'frozen-wipe' });
    const run = app.shared.run; run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'boss', enemies: ['the_matron'] }; flow.route();
    const T = app.tr, trace = []; let stills = 0;
    const dT = TR.drawTransitions; void dT;
    const snap = () => `${app.current}|w${T.wipe ? r4(T.wipe.t) : '-'}|i${T.intro ? r4(T.intro.t) : '-'}|q${combat.api().queueLen}|t${r4(combat.api().state().t)}`;
    for (let i = 0; i < 200; i++) {
      if (i === pauseAt) {
        const before = snap(), keep = RNG.s, p0 = app.frameState.paints;
        flow.openPause(); for (let k = 0; k < hold; k++) { app.tick(DT); assert.equal(snap(), before, 'frozen under Pause at frame ' + k); }
        assert.equal(app.frameState.paints, p0 + 1, 'the wipe is painted into the snapshot, once'); stills = app.frameState.paints - p0;
        realKey(app, 'Escape'); assert.equal(app.stack.length, 1, 'Esc resumes'); assert.equal(snap(), before, 'the closing frame moves nothing'); RNG.s = keep;
      }
      app.tick(DT); trace.push(snap());
    }
    return { trace, stills, started: T.started, finished: T.finished, intros: T.intros };
  };
  const A = scenario(-1, 0);
  assert.ok(A.trace.some((s) => /\|w0\.\d/.test(s)), 'the scenario has a wipe'); assert.ok(A.trace.some((s) => /\|i0\.\d/.test(s)), 'and a boss plate');
  const wipeFrame = A.trace.findIndex((s) => /\|w0\.[12]/.test(s)), plateFrame = A.trace.findIndex((s) => /\|i0\.[3-9]/.test(s));
  assert.ok(wipeFrame >= 0 && plateFrame > 0);
  for (const at of [wipeFrame + 1, plateFrame + 1]) {
    const B = scenario(at, 150);
    assert.deepEqual(B.trace, A.trace, 'paused at live frame ' + at + ': the wipe, the plate and the fight go on frame for frame as without Pause');
    assert.equal(B.finished, A.finished); assert.equal(B.started, A.started);
  }
  Math.random = realRandom;
});

// ---------------------------------------------------------------- 6. combat: an enemy turn interrupted by each modal
const audioRec = () => { const calls = []; const a = new Proxy({ calls, SFX_NAMES: [] }, { get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : (...args) => { calls.push(k === 'sfx' ? 'sfx:' + args[0] : k + ':' + args.filter((x) => typeof x !== 'object').join(',')); return undefined; }) }); return a; };
async function fightRig(o = {}) {
  seedRandom(4242);
  const run = RUN.newRun({ hero: 'marrow', seed: 'frozen-fight' });
  run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['orderly', 'crutchling'] };
  if (o.hp) run.hp = o.hp;
  const meta = META.loadMeta(); meta.settings = {};
  const audio = audioRec(), routed = [];
  const app = await makeApp({ run, meta, audio });
  app.shared.flow = { RUN, META, route() { routed.push(run.phase); }, openDeck() { app.push('deckview', {}); }, openSettings() { app.push('settings', {}); }, saveMeta() { app.refreshBelow('look'); } };
  app.register('combat', combat); app.register('pause', pause); app.register('settings', settings); app.register('deckview', deckview);
  installPause(app); app.overlay = (a) => drawPauseOverlay(a);
  app.go('combat', { run });
  return { app, run, audio, routed };
}
const engineOf = (c) => JSON.stringify([c.turn, c.energy, c.over || '', c.player.hp, c.player.block, c.player.st, c.enemies.map((e) => [e.def.id, e.hp, e.block, e.st, !!e.dead]), c.hand.map((k) => k.uid), c.drawPile.length, c.discard.length]);
const animOf = (S) => JSON.stringify({ t: r4(S.t), wait: r4(S.wait), q: S.q.length, skip: !!S.skip, en: S.energy, later: S.later.length, spr: S.spr.length, vig: r4(S.vig), lamp: r4(S.lamp), dark: r4(S.dark),
  banner: S.banner ? r4(S.banner.t) : -1, P: [S.P.hp, S.P.block, r4(S.P.attack), r4(S.P.trail)], hk: [r4(S.heroKick || 0), r4(S.heroHit || 0)], combo: r4(S.combo.shown),
  eds: S.eds.map((e) => [e.hp, e.block, r4(e.x), r4(e.scale), r4(e.atkT), r4(e.dying), r4(e.intentT), r4(e.intentOut), r4(e.spawnT), r4(e.stunT || 0), r4(e.anim.sq), r4(e.anim.hit)]),
  hand: S.hand.map((d) => [d.uid, r4(d.x), r4(d.y), r4(d.s), r4(d.alpha === undefined ? 1 : d.alpha)]), fx: [r4(S.fx.stop), r4(S.fx.slow), S.fx.floats.length], dgr: [S.dgr.on, r4(S.dgr.t), r4(S.dgr.pulse)], end: S.ending ? r4(S.ending.t) : -1 });
// plays: the opening, End Turn, `into` live frames of the enemy turn, the modal (hook), then to the end of the sequence; returns the per-frame record after the hook
async function enemyTurn(hook, o = {}) {
  const R = await fightRig(o), { app, audio } = R;
  for (let i = 0; i < 600 && combat.api().busy; i++) app.tick(DT);
  const a = combat.api(); assert.ok(a.canAct, 'the fight is ready');
  click(app, a.endTurn.x, a.endTurn.y); frames(app, 30); click(app, a.endTurn.x, a.endTurn.y); app.mouse.x = app.mouse.y = -999;
  assert.equal(a.c.turn, 2, 'the engine resolved the enemy turn at once'); assert.ok(combat.api().queueLen > 5, 'and its animation is queued: ' + combat.api().queueLen);
  frames(app, o.into || 24);
  const S = combat.api().state(), mid = { q: combat.api().queueLen, anim: animOf(S), engine: engineOf(a.c) };
  assert.ok(mid.q > 0 && combat.api().busy, 'the modal opens in the middle of the sequence');
  const calls0 = audio.calls.length, keep = RNG.s;
  const info = hook ? await hook(R, mid) : null;
  RNG.s = keep; const during = audio.calls.splice(calls0); // what sounded while the modal was open is the modal's business
  const rec = [];
  for (let i = 0; i < 900; i++) { const c0 = audio.calls.length; app.tick(DT); rec.push(animOf(combat.api().state()) + '|' + audio.calls.slice(c0).join(',')); if (!combat.api().busy && i > 60 && rec.length > 120) break; }
  assert.ok(!combat.api().busy, 'the enemy turn finished');
  return { rec, engine: engineOf(a.c), anim: animOf(combat.api().state()), mid, during, info, R };
}
const stillFrozen = (R, mid, k) => { assert.equal(animOf(combat.api().state()), mid.anim, 'the animation stands still (' + k + ')'); assert.equal(engineOf(combat.api().c), mid.engine); };

await t('combat: Pause, Settings, the deck view and Pause > Deck freeze an enemy turn mid-sequence and it resumes to the identical end', async () => {
  const A = await enemyTurn(null);
  assert.ok(A.rec.length > 100, 'control: the rest of the sequence is ' + A.rec.length + ' frames');
  const HOOKS = {
    pause: async (R, mid) => {
      const { app } = R; let ups = 0; const u0 = combat.update; void u0;
      app.push('pause', {}); for (let k = 0; k < 240; k++) { if (k === 100) { app.mouse.x = 400; app.mouse.y = 600; } app.tick(DT); if (k % 40 === 0) stillFrozen(R, mid, 'pause ' + k); }
      app.refreshBelow(); frames(app, 3); stillFrozen(R, mid, 'after a repaint'); // painting the fight again moves nothing in it
      globalThis.window.innerWidth = 1100; app.resize(); frames(app, 3); globalThis.window.innerWidth = 1280; app.resize(); frames(app, 3); stillFrozen(R, mid, 'after a resize');
      app.mouse.x = app.mouse.y = -999; frames(app, 2); realKey(app, 'Escape'); assert.equal(app.stack.length, 1, 'Esc resumes'); stillFrozen(R, mid, 'the closing frame');
      return ups;
    },
    settings: async (R, mid) => { const { app } = R; app.shared.flow.openSettings(); frames(app, 200); stillFrozen(R, mid, 'settings'); realKey(app, 'Escape'); assert.equal(app.stack.length, 1); },
    deck: async (R, mid) => { const { app } = R; app.shared.flow.openDeck(); for (let k = 0; k < 200; k++) { if (k === 50) { app.mouse.x = 640; app.mouse.wheel = 300; } app.tick(DT); } stillFrozen(R, mid, 'deck'); app.mouse.x = app.mouse.y = -999; frames(app, 2);
      const e = { key: 'Escape', preventDefault() {} }; app.pressedKeys.push(e); app.top().key(app, e); assert.equal(app.stack.length, 1, 'the deck view closes in the keydown itself, between two frames'); },
    pauseDeck: async (R, mid) => {
      const { app } = R; const Z = app.frameState;
      app.push('pause', {}); frames(app, 40); assert.equal(Z.paints, 1);
      pause.sel = 2; realKey(app, 'Enter'); frames(app, 60); assert.deepEqual(app.stack.map((s) => s.name), ['combat', 'pause', 'deckview'], 'three deep');
      assert.equal(Z.paints, 2, 'the snapshot is of the whole lower stack: painted again with Pause in it'); stillFrozen(R, mid, 'three deep');
      const anim = deckview.anim; assert.equal(anim, 1, 'the deck view opened from Pause runs on its own clock (it used to stay invisible: Pause stopped all time)');
      realKey(app, 'Escape'); frames(app, 20); assert.deepEqual(app.stack.map((s) => s.name), ['combat', 'pause'], 'Esc closes the deck only'); assert.equal(Z.paints, 3); stillFrozen(R, mid, 'back on Pause');
      realKey(app, 'Escape'); assert.deepEqual(app.stack.map((s) => s.name), ['combat'], 'Esc again resumes'); assert.equal(Z.snap, null);
    },
  };
  for (const name of Object.keys(HOOKS)) {
    const B = await enemyTurn(HOOKS[name]);
    assert.equal(B.rec.length, A.rec.length, name + ': the rest of the sequence takes the same number of frames');
    for (let i = 0; i < A.rec.length; i++) if (A.rec[i] !== B.rec[i]) assert.fail(`${name}: frame ${i} after the modal differs\n  no modal: ${A.rec[i].slice(0, 400)}\n  ${name}: ${B.rec[i].slice(0, 400)}`);
    assert.equal(B.engine, A.engine, name + ': the same engine state'); assert.equal(B.anim, A.anim);
    assert.ok(!B.during.some((s) => /^sfx:(hit|block|enemy|intent|draw|loseHp|turn)/i.test(s)), name + ': no fight sound while the modal is open: ' + B.during.join(' '));
  }
  Math.random = realRandom;
});

await t('combat: the low HP heartbeat rests under a modal and comes back; registry and tooltips of the fight are gone while it is frozen', async () => {
  const R = await fightRig({ hp: 6 }), { app, audio } = R;
  for (let i = 0; i < 600 && combat.api().busy; i++) app.tick(DT);
  frames(app, 30);
  const beats = audio.calls.filter((s) => /^heartbeat:/.test(s)); assert.ok(beats.length && !/^heartbeat:0/.test(beats[beats.length - 1]), 'arrange: the heart beats at 6 HP: ' + beats.join(' '));
  const bpm = beats[beats.length - 1];
  // registry while live: the fight's widgets and the pause button
  const ids = () => LAYOUT.getAll().map((q) => q.id);
  assert.ok(ids().some((id) => /^hand_/.test(id)) && ids().includes('pause_btn'), 'arrange: live registry');
  // a tooltip on a hand card
  const hr = LAYOUT.getAll().find((q) => /^hand_/.test(q.id)); app.mouse.x = hr.x + hr.w / 2; app.mouse.y = hr.y + 40; frames(app, 40);
  assert.ok(app.tipLayout && app.tipLayout.frame === app.frame, 'arrange: a card tip is showing');
  audio.calls.length = 0;
  app.push('pause', {}); frames(app, 30);
  assert.deepEqual(audio.calls.filter((s) => /^heartbeat:/.test(s)), ['heartbeat:0'], 'the heartbeat rests while the fight is frozen');
  const frozen = LAYOUT.getAll();
  assert.ok(!frozen.some((q) => /^(hand_|en\d|pause_btn|fs_btn)/.test(q.id)), 'no rectangle of the frozen fight is left in the registry: ' + frozen.map((q) => q.id).join(' '));
  assert.deepEqual(LAYOUT.findOutOfBounds(), []); assert.deepEqual(LAYOUT.findOverlaps(), []);
  assert.ok(!(app.tipLayout && app.tipLayout.frame === app.frame) && app.tip === null, 'and its tooltip is gone');
  // the deck view over it registers its own widgets, inside the stage
  pause.sel = 2; realKey(app, 'Enter'); frames(app, 30);
  const deck = LAYOUT.getAll().map((q) => q.id); assert.ok(deck.includes('deck-panel') && !deck.some((id) => /^hand_/.test(id)), 'the deck view owns the registry: ' + deck.slice(0, 6).join(' '));
  assert.deepEqual(LAYOUT.findOutOfBounds(), [], 'a modal over a frozen screen stays on the stage');
  realKey(app, 'Escape'); frames(app, 5); realKey(app, 'Escape');
  assert.deepEqual(audio.calls.filter((s) => /^heartbeat:/.test(s)), ['heartbeat:0', bpm], 'and it beats again when the fight goes on');
  frames(app, 3); assert.ok(ids().some((id) => /^hand_/.test(id)) && ids().includes('pause_btn'), 'the fight is back in the registry');
  Math.random = realRandom;
});

// ---------------------------------------------------------------- 7. a Ward walk interrupted by Pause
await t('Ward: a walk interrupted by Pause resumes and triggers every room; the floor banner waits too', async () => {
  const wardMod = await import('../graftwork/ui/ward.js'); const ward = wardMod.default, { cellCenter, resetWardMem, wardInterlude } = wardMod;
  const NORMAL1 = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal' && !e.summonOnly && !e.minion).map((e) => e.id);
  const walk = async (pauseOn) => {
    resetWardMem(); seedRandom(99);
    const run = RUN.newRun({ hero: 'marrow', seed: 'frozen-walk', mode: 'ward' });
    const meta = { settings: { tips: false, textScale: 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } };
    const audio = audioRec(); const app = await makeApp({ run, meta, audio });
    app.register('ward', ward); app.register('pause', pause); app.register('base', { draw() {} }); installPause(app); app.overlay = (a) => drawPauseOverlay(a);
    const seen = [];
    const flow = { RUN, route() { const scr = run.phase === 'ward' ? 'ward' : 'base'; if (run.mode === 'ward' && scr !== 'ward' && wardInterlude(app, run, scr)) { seen.push('walk'); return; } seen.push(run.phase); app.go(scr, { run }); },
      openDeck() {}, openSettings() {}, saveMeta() {}, hasSave: () => false };
    app.shared.flow = flow;
    const w = run.ward; w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {}; w.nextRoom = 1;
    const m = () => [{ kind: 'monster', id: NORMAL1[0] }], ids = [];
    for (const [type, x, y, contents] of [['rm_entrance', 0, 2], ['rm_ward', 1, 2, m()], ['rm_corridor', 2, 2], ['rm_corridor', 3, 2], ['rm_ward', 4, 2, m()]]) { const id = 'r' + w.nextRoom++; w.rooms[id] = { id, type, x, y, on: true, level: 1, timers: { spawn: 3 }, contents: contents || [], upgrades: [] }; w.grid[y][x] = id; ids.push(id); }
    const th = 'r' + w.nextRoom++; w.rooms[th] = { id: th, type: 'rm_theatre', x: 8, y: 5, on: true, level: 1, timers: { spawn: 9 }, contents: [], upgrades: [] }; w.grid[5][8] = th; w.hero.room = ids[0]; WD.wardPower(run);
    w.phase = 'midday'; flow.route(); frames(app, 260);
    w.roll = { key: '1:midday', base: 4, sides: 4, bonus: 0, n: 4, lucky: 0 };
    for (const id of ids.slice(1)) { const r = w.rooms[id], c = cellCenter(r.x, r.y); click(app, c.x, c.y); frames(app, 2); }
    assert.deepEqual(w.route, ids.slice(1), 'arrange: the route is laid');
    const go = LAYOUT.getAll().find((q) => q.id === 'ward-act'); click(app, go.x + go.w / 2, go.y + 25); app.mouse.x = app.mouse.y = -999;
    const W = () => app.screens.ward.st, fought = [], trace = []; let paused = 0, live = 0, pauses = 0;
    const st = () => `${app.current}|${run.phase}|${w.hero.room}|${W().walk ? W().walk.i + ':' + r4(W().walk.t) : '-'}|${seen.length}`;
    for (let i = 0; i < 4000 && !(run.phase === 'ward' && app.current === 'ward' && !W().walk && live > 60 && fought.length === 2); i++) {
      if (run.phase === 'combat' && app.current === 'base') { fought.push(w.hero.room); RUN.resolveFight(run, { win: true, shattered: [], damageTaken: 0, turns: 3 }); flow.route(); continue; }
      if (run.phase === 'reward') { RUN.claimGold(run, run.pending); if (run.pending.buildChoice) WD.takeBuildChoice(run, null); RUN.afterReward(run); flow.route(); continue; }
      if (run.phase === 'graft') { RUN.skipGraft(run, 'gold'); RUN.afterGraft(run); flow.route(); continue; }
      // Pause in the middle of a step, twice: on the way to the first fight and on the corridor steps between the two
      if (pauseOn && app.current === 'ward' && W().walk && W().walk.t > 0.3 && W().walk.i < W().walk.stop && pauses < 2 && (pauses === 0 || fought.length === 1)) {
        pauses++; const before = st(), c0 = audio.calls.length, keep = RNG.s;
        realKey(app, 'Escape'); paused++; // the Esc tick is a live tick of the Ward (Pause opens at its end)
        const held = st(); assert.equal(app.top().name, 'pause', 'Esc pauses a walk');
        for (let k = 0; k < 300; k++) { app.tick(DT); if (k % 50 === 0) assert.equal(st(), held, 'the walk stands still under Pause'); }
        assert.ok(!audio.calls.slice(c0 + 1).some((s) => s === 'sfx:mapStep'), 'no step sounds while paused'); assert.equal(seen.length, +held.split('|')[4], 'no room fired while paused');
        realKey(app, 'Escape'); assert.equal(app.stack.length, 1); assert.equal(st(), held); RNG.s = keep; void before;
        trace.push(held); live++; continue;
      }
      app.tick(DT); live++; trace.push(st());
    }
    return { fought, seen, trace, live, ids, steps: audio.calls.filter((s) => s === 'sfx:mapStep').length, pauses, hero: w.hero.room, phase: w.phase };
  };
  const A = await walk(false), B = await walk(true);
  assert.deepEqual(A.fought, [A.ids[1], A.ids[4]], 'control: both fight rooms fire'); assert.ok(A.seen.includes('walk'), 'and the corridor steps are walked on the Ward: ' + A.seen.join(' '));
  if (process.env.DBG) { console.log(A.seen.join(' '), '|', A.fought, A.live, A.steps, '\n', [...new Set(A.trace.map((q) => q.replace(/:[\d.]+/, '')))].join('\n ')); console.log(B.seen.join(' '), B.pauses, B.live); }
  assert.equal(B.pauses, 2, 'the walk was paused twice');
  assert.deepEqual(B.fought, A.fought, 'paused: every room still fires, in order'); assert.deepEqual(B.seen, A.seen, 'the same screens in the same order');
  assert.equal(B.steps, A.steps, 'the same number of steps: ' + B.steps); assert.equal(B.hero, A.hero); assert.equal(B.phase, A.phase);
  assert.deepEqual(B.trace, A.trace, 'frame for frame the same walk as without Pause');
  // the Ward claims finger drags for its plans every frame it runs: frozen, it leaves them to the modal (the deck view over the Ward could not be scrolled by touch)
  { resetWardMem(); const run = RUN.newRun({ hero: 'marrow', seed: 'frozen-pan', mode: 'ward' });
    const app = await makeApp({ run, meta: { settings: { tips: false, reducedMotion: true }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } }, audio: audioRec() });
    app.register('ward', ward); app.register('deckview', deckview); app.shared.flow = { RUN, route() {}, openDeck() { app.push('deckview', {}); }, openSettings() {}, saveMeta() {} };
    app.go('ward', { run }); frames(app, 30); assert.equal(app.touchPan, false, 'arrange: on the Ward a finger drag is a plan drag');
    app.shared.flow.openDeck(); frames(app, 10); assert.equal(app.touchPan, true, 'under the deck view the Ward no longer takes the drag: the list scrolls');
    // and its button shortcuts are dead: E, E on the Pause menu used to end the morning behind it
    app.pop(); app.register('pause', pause); frames(app, 240); assert.equal(run.ward.phase, 'morning');
    app.push('pause', {}); frames(app, 10); key(app, 'e'); frames(app, 5); key(app, 'e'); frames(app, 5); key(app, 'g'); key(app, 'r'); frames(app, 5);
    assert.equal(run.ward.phase, 'morning', 'no key reaches a button of the frozen Ward'); assert.equal(app.top().name, 'pause'); }
  // the floor banner is timed by the wall clock as well: it must not run out behind a modal
  { resetWardMem(); const real = Date.now, pnow = globalThis.performance.now; let clock = 5e6; Date.now = () => clock; globalThis.performance.now = () => clock;
    try {
      const run = RUN.newRun({ hero: 'marrow', seed: 'frozen-banner', mode: 'ward' });
      const app = await makeApp({ run, meta: { settings: { tips: false } , tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } }, audio: audioRec() });
      app.register('ward', ward); app.register('pause', pause); app.shared.flow = { RUN, route() {}, openDeck() {}, openSettings() {}, saveMeta() {} };
      const step = (k) => { for (let i = 0; i < k; i++) { clock += 1000 / 60; app.tick(DT); } };
      app.go('ward', { run }); step(30); const S = app.screens.ward.st; assert.ok(S.banner && S.banner.t > 0.4 && S.banner.t < 0.6, 'arrange: the banner is half a second in');
      const bt = S.banner.t; app.push('pause', {}); step(600); assert.ok(S.banner, 'ten seconds under Pause: the banner is still there'); assert.equal(S.banner.t, bt, 'and it did not move');
      app.pop(); step(1); assert.ok(S.banner && Math.abs(S.banner.t - (bt + DT)) < 0.02, 'and it goes on from there: ' + (S.banner && S.banner.t)); step(200); assert.equal(S.banner, null, 'then runs out');
    } finally { Date.now = real; globalThis.performance.now = pnow; } }
  Math.random = realRandom;
});

// ---------------------------------------------------------------- 8. every run screen: frozen under Pause and the deck view, repainted, untouched
await t('every screen of a run stands still under Pause > Deck: no update, repaints that move nothing, the run payload is untouched', async () => {
  const { boot } = await import('../graftwork/main.js');
  const { serializeRun } = await import('../graftwork/engine/run.js');
  const canvas = { getContext: () => fakeCtx(), addEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), width: 1280, height: 720, setPointerCapture() {} };
  seedRandom(5);
  const { app, flow } = boot(canvas); app.shared.meta.settings.tips = false;
  const start = (hero, seed) => { flow.start({ hero, seed: 'frozen-' + seed, mode: 'ward' }); return app.shared.run; };
  const SCREENS = {
    ward: () => { start('marrow', 'ward'); },
    combat: () => { const run = start('wick', 'combat'); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['bedpan_slime', 'gauze_mummy'] }; app.go('combat', { run }); },
    reward: () => { const run = start('marrow', 'reward'); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'elite', enemies: ['the_resident'] }; RUN.resolveFight(run, { win: true, shattered: [], damageTaken: 9, turns: 4 }); app.go('reward', { run }); },
    graft: () => { const run = start('marrow', 'graft'); RUN.startGraftPick(run); app.go('graft', { run }); },
    shop: () => { const run = start('wick', 'shop'); run.phase = 'shop'; run.pending = RUN.makeShop(run); app.go('shop', { run }); },
    forge: () => { const run = start('odile', 'forge'); run.hp = Math.round(run.maxHp / 2); run.phase = 'forge'; run.pending = { kind: 'forge', used: false }; app.go('forge', { run }); },
    event: () => { const run = start('marrow', 'event'); RUN.startEvent(run); app.go('event', { run }); },
  };
  for (const name of Object.keys(SCREENS)) {
    SCREENS[name](); frames(app, 45);
    assert.equal(app.current, name, 'arrange: on ' + name);
    const scr = app.screens[name], run = app.shared.run; let ups = 0, draws = 0; const u0 = scr.update, d0 = scr.draw;
    if (u0) scr.update = function (a, dt) { ups++; return u0.call(this, a, dt); }; scr.draw = function (a) { draws++; return d0.call(this, a); };
    const before = serializeRun(run), Z = app.frameState, p0 = Z.paints, keep = RNG.s;
    flow.openPause(); frames(app, 20); app.refreshBelow(); frames(app, 3);
    flow.openDeck(); frames(app, 12); assert.deepEqual(app.stack.map((s) => s.name), [name, 'pause', 'deckview'], name + ': three deep');
    globalThis.window.innerWidth = 1000; app.resize(); frames(app, 3); globalThis.window.innerWidth = 1280; app.resize(); frames(app, 3);
    assert.equal(ups, 0, name + ': no update while covered'); assert.equal(draws, Z.paints - p0, name + ': drawn only for the ' + (Z.paints - p0) + ' snapshot paints'); assert.equal(Z.paints - p0, 5, name + ': open, asked, deck, resize, resize');
    assert.deepEqual(LAYOUT.findOutOfBounds(), [], name + ': the deck view over it stays on the stage');
    app.pop(); frames(app, 3); app.pop();
    assert.equal(serializeRun(run), before, name + ': the run is exactly as it was');
    RNG.s = keep; if (u0) scr.update = u0; scr.draw = d0; frames(app, 3); assert.equal(Z.snap, null);
  }
  Math.random = realRandom;
});

// ---------------------------------------------------------------- 9. the WebGL post layer holds the frozen screen's effects
await t('post: effect timers of the frozen screen wait under a modal', async () => {
  const { installPost } = await import('../graftwork/ui/post.js');
  const app = await makeApp({ meta: { settings: {} } }); installPost(app);
  let ups = 0; const u = app.post.update; app.post.update = (dt) => { ups++; return u(dt); };
  app.register('base', { draw() {} }); app.register('modal', { draw() {} }); app.go('base');
  for (let i = 0; i < 5; i++) { app.tick(DT); app.post.render(); } assert.equal(ups, 5);
  app.push('modal'); for (let i = 0; i < 20; i++) { app.tick(DT); app.post.render(); } assert.equal(ups, 5, 'no effect time passes while a modal is open');
  app.pop(); for (let i = 0; i < 3; i++) { app.tick(DT); app.post.render(); } assert.equal(ups, 8);
});

if (!process.exitCode) console.log(`graftwork frozen screens: ${n} checks ok`);
