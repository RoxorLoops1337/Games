// Stacking Cats: PWA files, haptics, share card. Headless, no browser.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const D = 'stacking_cats/';

// every module the game imports must be in the service worker's install list, or the game will not start offline
await t('the service worker pre-caches every game module and static file', () => {
  const sw = readFileSync(D + 'sw.js', 'utf8');
  const list = sw.slice(sw.indexOf('PRECACHE = ['), sw.indexOf('];', sw.indexOf('PRECACHE = [')));
  const missing = readdirSync(D).filter((f) => f.endsWith('.js') && f !== 'sw.js' && !list.includes("'" + f + "'"));
  assert.deepEqual(missing, [], 'not pre-cached: ' + missing.join(', '));
  for (const f of ['index.html', 'manifest.webmanifest']) assert.ok(list.includes("'" + f + "'"), f);
});

const fakeCtx = () => {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      return () => undefined;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
};
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };

const png = (f) => { const b = readFileSync(D + f); assert.equal(b.subarray(1, 4).toString(), 'PNG', f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

await t('manifest has the required fields and real icon files', () => {
  const m = JSON.parse(readFileSync(D + 'manifest.webmanifest', 'utf8'));
  assert.equal(m.name, 'Stacking Cats');
  assert.ok(['fullscreen', 'standalone'].includes(m.display));
  assert.ok(String(m.orientation).startsWith('landscape'));
  assert.equal(m.theme_color, '#150f26'); assert.equal(m.background_color, '#150f26');
  for (const k of ['start_url', 'scope']) assert.ok(!m[k].startsWith('/') && !/^https?:/.test(m[k]), k + ' must be relative');
  const sizes = new Set();
  for (const ic of m.icons) {
    assert.ok(existsSync(D + ic.src), ic.src);
    const [w, h] = png(ic.src); const [ew] = ic.sizes.split('x').map(Number);
    assert.equal(w, ew); assert.equal(h, ew); sizes.add(ic.sizes + ':' + ic.purpose);
  }
  assert.ok(sizes.has('192x192:any') && sizes.has('512x512:any') && sizes.has('512x512:maskable'));
  assert.deepEqual(png('icons/apple-touch-icon.png'), [180, 180]);
  const html = readFileSync(D + 'index.html', 'utf8');
  for (const s of ['rel="manifest"', 'rel="apple-touch-icon"', 'apple-mobile-web-app-capable']) assert.ok(html.includes(s), s);
});

await t('service worker parses, never touches /api/, versions its cache and lists real files', () => {
  execFileSync('node', ['--check', D + 'sw.js']);
  const sw = readFileSync(D + 'sw.js', 'utf8');
  assert.match(sw, /const VERSION = '/);
  assert.ok(sw.includes("'/api/'") && /includes\('\/api\/'\)\)\s*return/.test(sw), 'api requests are passed through');
  assert.ok(!/caches\.[a-z]+\([^)]*\/api\//.test(sw));
  assert.ok(sw.includes('caches.delete'), 'cleans old caches');
  const list = sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  for (const f of list) if (f !== './') assert.ok(existsSync(D + f), 'precache file missing: ' + f);
});

await t('pwa.js is safe to load without a browser', async () => {
  const p = await import('../stacking_cats/pwa.js');
  assert.equal(p.canInstall(), false); assert.equal(p.isIosSafari(), false);
  assert.equal(await p.promptInstall(), false);
  assert.doesNotThrow(() => p.registerPwa());
});

await t('haptics: no-op without vibrate, short patterns with it, respects settings', async () => {
  const h = await import('../stacking_cats/haptics.js');
  delete globalThis.navigator;
  for (const k of ['hit', 'crit', 'ko', 'boss', 'merge', 'ui']) assert.equal(h.buzz(k), false);
  const calls = [];
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (p) => { calls.push(p); return true; } }, configurable: true });
  for (const k of ['crit', 'ko', 'boss', 'merge', 'ui']) assert.equal(h.buzz(k), true, k);
  assert.equal(calls.length, 5);
  for (const p of calls) { const a = [].concat(p); assert.ok(a.length <= 3 && a.every((v) => v >= 8 && v <= 60), JSON.stringify(p)); }
  assert.equal(h.buzz('nonsense'), false);
  h.setHaptics(false); assert.equal(h.buzz('crit'), false); h.setHaptics(true);
  globalThis.matchMedia = () => ({ matches: true });
  assert.equal(h.buzz('crit'), false, 'off under reduced motion');
  delete globalThis.matchMedia;
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate() { throw new Error('boom'); } }, configurable: true });
  assert.doesNotThrow(() => h.buzz('ko'));
});

await t('share card draws for several runs without throwing', async () => {
  const { drawShareCard, shareRun, SHARE_W } = await import('../stacking_cats/share.js');
  const { CATS } = await import('../stacking_cats/cats.js');
  const runs = [
    { wave: 1, kills: 0, bossKills: 0, biggest: 0, diff: 'Cozy', cats: [] },
    { wave: 12, kills: 340, bossKills: 2, biggest: 5120, diff: 'Normal', cats: CATS.slice(0, 3).map((c) => c.id) },
    { wave: 40, kills: 99999, bossKills: 7, biggest: 3200000, diff: 'Hard', daily: true, cats: CATS.slice(0, 8).map((c) => c.id) },
    { cats: ['nope'] }, {},
  ];
  for (const r of runs) { const c = { getContext: () => fakeCtx() }; assert.equal(drawShareCard(c, r), true); assert.equal(c.width, SHARE_W); }
  assert.equal(drawShareCard({ getContext: () => null }, {}), false);
  assert.equal(drawShareCard(null, {}), false);
  assert.equal(await shareRun(runs[1]), 'failed');   // no toBlob in the fake canvas: reports failure, never throws
});

await t('no em dashes in the new files', () => {
  const files = ['manifest.webmanifest', 'sw.js', 'pwa.js', 'haptics.js', 'share.js', 'main.js', 'index.html'].map((f) => D + f).concat('tests/stacking_cats_pwa.test.mjs');
  for (const f of files) assert.ok(!readFileSync(f, 'utf8').includes(String.fromCharCode(0x2014)), f);
  assert.ok(readdirSync(D + 'icons').length >= 4);
});

console.log(n + ' passed');
