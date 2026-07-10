// Headless loader for The Collection. Evals the game's inline <script> in a
// stubbed DOM and returns the pure logic surface it hangs on globalThis.__TC.
//   import { loadTC } from './the_collection_lib.mjs';
//   const TC = loadTC();
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function loadTC() {
  const here = dirname(fileURLToPath(import.meta.url));
  const html = readFileSync(join(here, '..', 'the_collection', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const mkEl = () => new Proxy({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    setAttribute: noop, getAttribute: () => null,
    querySelector: () => mkEl(), querySelectorAll: () => [], innerHTML: '', textContent: '', value: '',
    children: [], dataset: {},
  }, { get(t, k) { return (k in t) ? t[k] : noop; }, set(t, k, v) { t[k] = v; return true; } });

  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = '' + v; }, removeItem: k => { delete store[k]; } };
  global.document = new Proxy({
    getElementById: () => mkEl(), createElement: () => mkEl(), querySelector: () => mkEl(),
    querySelectorAll: () => [], addEventListener: noop, body: mkEl(), documentElement: mkEl(), readyState: 'complete',
  }, { get(t, k) { return (k in t) ? t[k] : noop; } });
  global.window = new Proxy(global, { get(t, k) { return (k in t) ? t[k] : undefined; }, set(t, k, v) { t[k] = v; return true; } });
  global.window.addEventListener = noop;

  eval('(function(){' + code + '\n})()');
  return globalThis.__TC;
}
