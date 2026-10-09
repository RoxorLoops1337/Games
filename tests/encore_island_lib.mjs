// Shared headless loader for Encore Island suites: evaluates every js/*.js from index.html against a stubbed DOM and returns window.EI.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// loadEI({ bridge: true }) runs the classic scripts as real global scripts (S, HUB, geoOf ... become globals, as in a browser), so ES modules under test can use them
export function loadEI(opts = {}) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, '..', 'encore_island');
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
  let code = order.map(f => readFileSync(join(dir, f), 'utf8')).join('\n;\n');
  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: noop });
    if (k === 'canvas') return { width: 400, height: 800 };
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return noop;
  }, set() { return true; } });
  const mkEl = () => new Proxy({ style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, appendChild: noop, remove: noop, setAttribute: noop, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }), setPointerCapture: noop,
    querySelector: () => mkEl(), querySelectorAll: () => [], innerHTML: '', textContent: '', value: '', width: 400, height: 800, children: [], dataset: {} },
    { get(o, k) { return (k in o) ? o[k] : noop; }, set(o, k, v) { o[k] = v; return true; } });
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = '' + v; }, removeItem: k => { delete store[k]; } };
  global.requestAnimationFrame = noop;
  global.AudioContext = undefined; global.webkitAudioContext = undefined;
  global.Image = class { set src(v) { this._s = v; } get src() { return this._s; } get width() { return 64; } get height() { return 64; } };
  global.OffscreenCanvas = undefined;
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  def('navigator', { userAgent: 'node', maxTouchPoints: 0, vibrate: noop });
  global.devicePixelRatio = 1;
  global.document = new Proxy({ getElementById: () => mkEl(), createElement: () => mkEl(), querySelector: () => mkEl(), querySelectorAll: () => [],
    addEventListener: noop, body: mkEl(), documentElement: mkEl(), hidden: false }, { get(o, k) { return (k in o) ? o[k] : noop; } });
  global.window = new Proxy(global, { get(o, k) { return (k in o) ? o[k] : undefined; }, set(o, k, v) { o[k] = v; return true; } });
  global.window.addEventListener = noop; global.window.innerWidth = 400; global.window.innerHeight = 800; global.window.__EI_HEADLESS__ = true;
  global.setTimeout = () => 0; global.setInterval = () => 0; global.clearTimeout = noop; global.clearInterval = noop;
  code = code.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var');
  if (opts.bridge) { // run as true global scripts (what a browser does for classic scripts), so ES modules under test see S, HUB, geoOf ... as globals
    vm.runInThisContext(code + '\n;globalThis.__EI = window.EI;', { filename: 'encore_island/js (concatenated)' });
  } else eval('(function(){' + code + '\nglobalThis.__EI=window.EI;})()');
  const EI = globalThis.__EI; EI.boot(); return EI;
}
