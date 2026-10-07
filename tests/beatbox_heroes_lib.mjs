// Shared helpers for the Beatbox Heroes suites.
//   const { ok, eq, near, between, done, load } = await import('./beatbox_heroes_lib.mjs');
//   load('pix','font','catalog','chars')   // evaluates beatbox_heroes/<name>.js in order into globalThis.BBH
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const ROOT = path.join(here, '..', 'beatbox_heroes');

let passed = 0, failed = 0;
const suite = path.basename(process.argv[1] || 'suite').replace(/\.test\.mjs$/, '');

export function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error('  FAIL: ' + msg); }
}
export const eq = (a, b, msg) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
export const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b} +-${tol})`);
export const between = (v, lo, hi, msg) => ok(v >= lo && v <= hi, `${msg} (got ${v}, want ${lo}..${hi})`);
export function done() {
  console.log(`${suite}: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
export function load(...names) {
  for (const n of names) require(path.join(ROOT, n + '.js'));
  return globalThis.BBH;
}
