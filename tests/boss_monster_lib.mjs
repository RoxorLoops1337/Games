// Shared headless loader for No Room For Heroes tests. Evaluates the game's inline
// <script> in a stubbed DOM and returns the internals you ask for.
//
//   import { loadGame } from './boss_monster_lib.mjs';
//   const A = loadGame('freshGame,drawChampion,get G(){return G;},set G(v){G=v;}');
//
// The expose string is the body of an object literal, so plain names, getters
// and setters all work. Stubs are the proven set from boss_monster_relics.test.mjs
// plus an Image stub (fires onload immediately so sprite arrays read as loaded).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function loadGame(expose) {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'boss_monster', 'index.html'), 'utf8');
  let code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'canvas') return { width: 800, height: 480 };
    if (k === 'measureText') return () => ({ width: 10 });
    return noop;
  } });
  const mkEl = () => new Proxy({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, appendChild: noop, remove: noop, setAttribute: noop, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 480 }), setPointerCapture: noop,
    querySelector: () => mkEl(), querySelectorAll: () => [], innerHTML: '', textContent: '', value: '',
    width: 800, height: 480, children: [], dataset: {},
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = '' + v; }, removeItem: k => { delete store[k]; } };
  global.requestAnimationFrame = noop; global.cancelAnimationFrame = noop;
  global.AudioContext = function () { return new Proxy({}, { get() { return () => new Proxy({}, { get() { return noop; } }); } }); };
  global.webkitAudioContext = global.AudioContext;
  global.Image = class {
    constructor() { this._ok = false; }
    set src(v) { this._src = v; if (this.onload) this.onload(); }
    get src() { return this._src; }
    get width() { return 100; } get height() { return 100; }
  };
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  if (typeof globalThis.performance?.now !== 'function') def('performance', { now: () => Date.now() });
  def('navigator', { userAgent: 'node', maxTouchPoints: 0, vibrate: noop });
  global.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
  global.devicePixelRatio = 1;
  global.document = new Proxy({ getElementById: () => mkEl(), createElement: () => mkEl(), querySelector: () => mkEl(),
    querySelectorAll: () => [], addEventListener: noop, body: mkEl(), documentElement: mkEl(), hidden: false, visibilityState: 'visible' },
    { get(t, k) { return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, { get(t, k) { return (k in t) ? t[k] : undefined; }, set(t, k, v) { t[k] = v; return true; } });
  global.window.addEventListener = noop;
  global.setTimeout = () => 0; global.setInterval = () => 0; global.clearTimeout = noop; global.clearInterval = noop;

  // the game uses top-level const/let; rebind to var so they land on the shared scope
  code = code.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var');
  eval('(function(){' + code + '\nglobalThis.__api={' + expose + '};})()');
  return globalThis.__api;
}

// tiny assertion helper shared by the suites
export function harness(name) {
  let pass = 0, fail = 0;
  return {
    ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } },
    done() {
      console.log(`${name}: ${pass} passed, ${fail} failed`);
      process.exit(fail ? 1 : 0);
    },
  };
}
