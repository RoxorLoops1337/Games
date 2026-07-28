// Gold Rush Arcade — render suite.
//
// The logic suite (coin_pusher.test.mjs) boots the game with no canvas ctx,
// which flips its HEADLESS switch and skips the entire draw half. That half is
// ~1500 lines and, until this suite, nothing executed it: a typo in a draw
// path shipped silently because every logic test still passed.
//
// Here the game is booted WITH a canvas context — a stub that records calls
// instead of rasterising — so the renderer actually runs. That catches the two
// things that matter without a GPU:
//
//   1. draw errors: every screen, every machine, driven for real frames
//   2. draw cost: the ops per frame are counted and held to a budget, so a
//      change that quietly triples the per-coin work fails here instead of on
//      someone's phone
//
// It cannot check pixels. Visual equivalence is verified separately by
// screenshotting the real page in Chromium and diffing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('coin_pusher-render');
t.eq = (a, b, msg) => t.ok(a === b, msg + ' [' + a + ' != ' + b + ']');

// ops that represent real rasterisation work, as opposed to bookkeeping
const PATHOPS = new Set(['beginPath', 'fill', 'stroke', 'arc', 'ellipse', 'fillRect',
  'fillText', 'strokeText', 'drawImage', 'createLinearGradient', 'createRadialGradient']);

function loadGame() {
  const count = {};
  const errors = [];
  const noop = () => {};
  const bump = (k) => { count[k] = (count[k] || 0) + 1; };

  const mkCtx = () => {
    const grad = { addColorStop: noop };
    const base = {
      canvas: { width: 480, height: 840 },
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => { bump('createLinearGradient'); return grad; },
      createRadialGradient: () => { bump('createRadialGradient'); return grad; },
      createPattern: () => grad,
      save: noop, restore: noop, setTransform: noop, translate: noop,
      rotate: noop, scale: noop, clip: noop, closePath: noop,
      moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
      rect: noop, clearRect: noop, strokeRect: noop,
    };
    for (const k of PATHOPS) if (!(k in base)) base[k] = () => bump(k);
    return new Proxy(base, {
      get(o, k) { return (k in o) ? o[k] : noop; },
      set(o, k, v) { o[k] = v; return true; },
    });
  };

  const mkCanvas = () => {
    const c2d = mkCtx();
    return new Proxy({
      width: 480, height: 840, style: {}, addEventListener: noop,
      getContext: () => c2d,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 840 }),
    }, { get(o, k) { return (k in o) ? o[k] : noop; }, set(o, k, v) { o[k] = v; return true; } });
  };

  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  };
  let rafCb = null;
  global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
  global.addEventListener = noop;
  global.devicePixelRatio = 2;
  global.innerWidth = 480; global.innerHeight = 840;
  global.document = {
    getElementById: () => mkCanvas(),
    createElement: (tag) => { if (tag === 'canvas') bump('createElement:canvas'); return mkCanvas(); },
    addEventListener: noop, hidden: false, body: mkCanvas(),
  };
  global.Image = function () { return {}; };
  global.window = new Proxy(global, {
    get(o, k) { return (k in o) ? o[k] : undefined; },
    set(o, k, v) { o[k] = v; return true; },
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'coin_pusher', 'index.html'), 'utf8');
  const code = html.match(/<script>\s*'use strict';([\s\S]*)<\/script>/)[1];
  eval('(function(){' + code + '\n})()');

  const CP = globalThis.CP;
  const frame = (ts) => {
    try { rafCb(ts); } catch (e) { errors.push(e.message); }
  };
  const drawOps = () => {
    let n = 0;
    for (const k of Object.keys(count)) if (PATHOPS.has(k)) n += count[k];
    return n;
  };
  const resetCount = () => { for (const k of Object.keys(count)) delete count[k]; };
  return { CP, count, errors, frame, drawOps, resetCount };
}

const G = loadGame();
const { CP, S } = { CP: G.CP, S: G.CP.S };

// -------- the renderer actually booted --------
t.ok(!CP.HEADLESS, 'canvas ctx accepted: the draw half is live');
t.ok(typeof CP.tick === 'function', 'sim API still exposed with a ctx present');

// -------- every screen renders without throwing --------
S.unlocked = ['gold', 'penny', 'neon', 'bandit'];
S.money = 100000; S.wallet = 100000; S.score = 50000;
let ts = 0;
for (const screen of ['lobby', 'shop', 'store', 'game']) {
  S.screen = screen;
  G.resetCount();
  for (let i = 0; i < 8; i++) G.frame(ts += 16.7);
  t.eq(G.errors.length, 0, 'screen renders clean: ' + screen +
       (G.errors.length ? ' -> ' + G.errors[0] : ''));
  t.ok(G.drawOps() > 0, 'screen actually draws something: ' + screen);
}

// -------- every machine renders, loaded and busy --------
for (const mach of ['gold', 'penny', 'neon', 'bandit']) {
  CP.setMachine(mach);
  CP.srand(2026);
  CP.reset();
  S.screen = 'game';
  S.wallet = 100000;
  for (let i = 0; i < 240; i++) { if (S.cd <= 0) CP.drop(20 + (i * 11) % 60); CP.tick(1 / 60); }
  G.resetCount();
  const before = G.errors.length;
  for (let i = 0; i < 10; i++) G.frame(ts += 16.7);
  t.eq(G.errors.length, before, 'machine renders clean: ' + mach +
       (G.errors.length > before ? ' -> ' + G.errors[G.errors.length - 1] : ''));
  t.ok(S.coins.length > 40, 'machine has a real pile to draw: ' + mach +
       ' (' + S.coins.length + ')');
}

// -------- the jackpot/fever/slot overlays draw --------
CP.setMachine('gold'); CP.srand(5); CP.reset(); S.screen = 'game';
S.fever = 5; S.meter = CP.C.METER_MAX;
CP.jackpot();
{
  const before = G.errors.length;
  for (let i = 0; i < 20; i++) { CP.tick(1 / 60); G.frame(ts += 16.7); }
  t.eq(G.errors.length, before, 'jackpot rain + fever frame render clean');
}
CP.setMachine('neon'); CP.srand(6); CP.reset(); S.screen = 'game';
CP.spinSlot();
{
  const before = G.errors.length;
  for (let i = 0; i < 30; i++) { CP.tick(1 / 60); G.frame(ts += 16.7); }
  t.eq(G.errors.length, before, 'neon slot overlay + peg board render clean');
}

// -------- the cached field layer --------
// The floor/gutters/lip are rendered once to an offscreen canvas and blitted.
// A machine switch must invalidate it, or you get the previous machine's floor.
{
  CP.setMachine('gold'); CP.srand(9); CP.reset(); S.screen = 'game';
  G.resetCount();
  for (let i = 0; i < 12; i++) G.frame(ts += 16.7);
  const madeFirst = G.count['createElement:canvas'] || 0;
  G.resetCount();
  for (let i = 0; i < 12; i++) G.frame(ts += 16.7);
  const madeSteady = G.count['createElement:canvas'] || 0;
  t.ok(madeFirst >= 1, 'field layer is built on the first frames of a machine');
  t.eq(madeSteady, 0, 'field layer is not rebuilt once it is warm');

  CP.setMachine('penny'); CP.reset();
  G.resetCount();
  for (let i = 0; i < 12; i++) G.frame(ts += 16.7);
  t.ok((G.count['createElement:canvas'] || 0) >= 1,
       'switching machines rebuilds the field layer');
}

// -------- draw-cost budget --------
// A guard rail, not a target: this is roughly 30% above where the renderer sits
// today, so ordinary work passes and a change that multiplies the per-coin path
// count trips it. If a feature genuinely needs more, move the number knowingly.
{
  CP.setMachine('gold'); CP.srand(4242); CP.reset(); S.screen = 'game';
  S.wallet = 100000;
  for (let i = 0; i < 300; i++) { if (S.cd <= 0) CP.drop(20 + (i * 7) % 60); CP.tick(1 / 60); }
  G.resetCount();
  const FR = 30;
  for (let i = 0; i < FR; i++) { CP.tick(1 / 60); G.frame(ts += 16.7); }
  const perFrame = G.drawOps() / FR;
  const perCoin = perFrame / Math.max(1, S.coins.length);
  t.ok(perFrame < 1800, 'draw ops per frame stay in budget (' + perFrame.toFixed(0) + ' < 1800)');
  t.ok(perCoin < 12, 'per-coin draw cost stays in budget (' + perCoin.toFixed(1) + ' < 12)');
  t.ok(perFrame > 100, 'the budget check is actually measuring a drawn frame');
}

// -------- no errors anywhere, ever --------
t.eq(G.errors.length, 0, 'no draw errors across the whole suite' +
     (G.errors.length ? ': ' + G.errors.join(' | ') : ''));

t.done();
