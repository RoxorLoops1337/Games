// Headless loader for Frietkot Tycoon. Evals the game's inline <script> in a
// stubbed DOM and returns the pure logic surface it hangs on globalThis.__FT.
//   import { loadFT } from './frietkot_tycoon_lib.mjs';
//   const FT = loadFT();
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function loadFT() {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'frietkot_tycoon', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const ctx = new Proxy({}, { get(_t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'canvas') return { width: 192, height: 128 };
    if (k === 'measureText') return () => ({ width: 6 });
    return noop;
  } });
  const mkEl = () => new Proxy({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, appendChild: noop, remove: noop, setAttribute: noop, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 192, height: 128 }),
    querySelector: () => mkEl(), querySelectorAll: () => [], innerHTML: '', textContent: '', value: '',
    width: 192, height: 128, children: [], dataset: {},
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = '' + v; }, removeItem: k => { delete store[k]; } };
  global.requestAnimationFrame = noop; global.cancelAnimationFrame = noop;
  global.setInterval = () => 0; global.clearInterval = noop; global.setTimeout = () => 0; global.clearTimeout = noop;
  global.confirm = () => true;
  global.document = new Proxy({ getElementById: () => mkEl(), createElement: () => mkEl(), querySelector: () => mkEl(),
    querySelectorAll: () => [], addEventListener: noop, body: mkEl(), documentElement: mkEl(), readyState: 'complete' },
    { get(t, k) { return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, { get(t, k) { return (k in t) ? t[k] : undefined; }, set(t, k, v) { t[k] = v; return true; } });
  global.window.addEventListener = noop;

  eval('(function(){' + code + '\n})()');
  return globalThis.__FS;
}
