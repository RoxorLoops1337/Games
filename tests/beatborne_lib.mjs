// Shared headless loader for BEATBORNE. Evaluates the game's inline <script>
// against a stubbed DOM and hands back window.BB -- the game's own test export.
//
//   import { load } from './beatborne_lib.mjs';
//   const BB = load();
//
// The game detects HEADLESS from process.versions.node, so audio, the frame
// loop and the DOM screens all no-op on their own; the stubs below exist so
// the render suite can drive draw() without any of them noticing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function stubCtx() {
  const calls = { fill: 0, stroke: 0, fillText: 0, drawImage: 0, gradient: 0 };
  const noop = () => {};
  const grad = { addColorStop: noop };
  const ctx = new Proxy({ calls, canvas: { width: 960, height: 540 } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => { calls.gradient++; return grad; };
      if (k === 'measureText') return s => ({ width: String(s).length * 6 });
      if (k === 'fill') return () => { calls.fill++; };
      if (k === 'stroke') return () => { calls.stroke++; };
      if (k === 'fillText') return () => { calls.fillText++; };
      if (k === 'save' || k === 'restore') return noop;
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}

export function load() {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'beatborne', 'index.html'), 'utf8');
  let code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = stubCtx();
  const mkEl = () => new Proxy({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    setAttribute: noop, getContext: () => ctx, setPointerCapture: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    querySelector: () => mkEl(), querySelectorAll: () => [], closest: () => null,
    innerHTML: '', textContent: '', value: '', width: 960, height: 540, children: [],
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  const store = {};
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  def('localStorage', {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = '' + v; },
    removeItem: k => { delete store[k]; },
  });
  def('requestAnimationFrame', () => 0);
  def('cancelAnimationFrame', noop);
  def('devicePixelRatio', 1);
  def('matchMedia', () => ({ matches: false, addEventListener: noop, addListener: noop }));
  if (typeof globalThis.performance?.now !== 'function') def('performance', { now: () => Date.now() });
  def('document', new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(), querySelector: () => mkEl(),
    querySelectorAll: () => [], addEventListener: noop, body: mkEl(), documentElement: mkEl(),
    hidden: false, visibilityState: 'visible', readyState: 'complete',
  }, { get(t, k) { return (k in t) ? t[k] : noop; } }));
  def('window', new Proxy(globalThis, {
    get(t, k) { return (k in t) ? t[k] : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  }));
  globalThis.window.addEventListener = noop;
  globalThis.window.innerWidth = 960; globalThis.window.innerHeight = 540;

  // top-level const/let must land on the shared scope so the eval can see them
  code = code.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var');
  eval('(function(){' + code + '\n})()');
  const BB = globalThis.BB;
  if (!BB) throw new Error('beatborne did not export window.BB');
  BB.stubCtx = stubCtx;
  BB.mkEl = mkEl;
  return BB;
}

/* ---- a very small assertion kit, same shape as the other suites here ---- */
let passed = 0;
export function ok(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; throw new Error(msg); }
  passed++;
}
export function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
export function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + ' +/-' + tol + ')'); }
export function between(v, lo, hi, msg) { ok(v >= lo && v <= hi, msg + ' (got ' + v + ', want ' + lo + '..' + hi + ')'); }
export function done(name) { console.log('  ' + name + ': ' + passed + ' checks passed'); passed = 0; }
