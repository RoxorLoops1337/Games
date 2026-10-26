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

await t('share card: a tall stack is scaled down so its top never reaches the subtitle', async () => {
  const { shareStack } = await import('../stacking_cats/share.js');
  for (let n = 0; n <= 5; n++) {
    const { cell, step, bottom } = shareStack(n);
    const topOfStack = bottom - cell - Math.max(0, n - 1) * step;
    assert.ok(topOfStack >= 200, `${n} cats: the top of the stack (${topOfStack}) must stay below the subtitle line`);
    assert.ok(cell <= 250 && cell >= 150, `${n} cats: cats stay a readable size (${cell})`);
  }
  assert.equal(shareStack(1).cell, 250, 'a short stack keeps the full size');
});

await t('share card: cats that do not fit on the tower are counted, not silently dropped', async () => {
  const { shareExtra } = await import('../stacking_cats/share.js');
  assert.equal(shareExtra(0), 0);
  assert.equal(shareExtra(5), 0);
  assert.equal(shareExtra(8), 3);
});

await t('idleHop: a tower cat now and then hops once, each cat on its own beat', async () => {
  const { idleHop } = await import('../stacking_cats/art_util.js');
  let peak = 0, hopping = 0;
  for (let tt = 0; tt < 60; tt += 0.05) { const h = idleHop(tt, 3); assert.ok(h >= 0 && h <= 1, 'lift stays between 0 and 1'); peak = Math.max(peak, h); if (h > 0) hopping++; }
  assert.ok(peak > 0.95, 'a hop reaches its top');
  assert.ok(hopping < 1200 * 0.2, 'cats are on the ground most of the time');
  const a = [], b = [];
  for (let tt = 0; tt < 30; tt += 0.1) { a.push(idleHop(tt, 1) > 0); b.push(idleHop(tt, 2) > 0); }
  assert.notDeepEqual(a, b, 'two cats do not hop in unison');
});

await t('waveProgress: share of the wave already beaten, always between 0 and 1', async () => {
  const { waveProgress } = await import('../stacking_cats/art_util.js');
  assert.equal(waveProgress(10, 10, 20), 0, 'a fresh wave is at the start');
  assert.equal(waveProgress(0, 5, 20), 0.75);
  assert.equal(waveProgress(0, 0, 20), 1);
  assert.equal(waveProgress(0, 0, 0), 0, 'no total means no bar');
  assert.ok(waveProgress(40, 0, 20) >= 0 && waveProgress(0, 0, 20) <= 1, 'summons cannot push it out of range');
});

await t('dangerLevel: a soft warning only when a cat is nearly out of health', async () => {
  const { dangerLevel } = await import('../stacking_cats/art_util.js');
  const cat = (hp, max = 100) => ({ hp, max });
  assert.equal(dangerLevel([]), 0, 'no cats, no warning');
  assert.equal(dangerLevel([cat(100), cat(80)]), 0, 'healthy team');
  assert.equal(dangerLevel([cat(30), cat(90)]), 0, 'exactly at the threshold is still calm');
  assert.ok(dangerLevel([cat(15), cat(90)]) > 0.3 && dangerLevel([cat(15), cat(90)]) < 0.7, 'half way into the red zone');
  assert.equal(dangerLevel([cat(0, 100), cat(90)]), 0, 'fallen cats do not count');
  assert.ok(dangerLevel([cat(1)]) > 0.9 && dangerLevel([cat(1)]) <= 1, 'nearly dead is the strongest warning');
});

await t('clearLine: a short wave summary for the cleared banner', async () => {
  const { clearLine } = await import('../stacking_cats/art_util.js');
  assert.equal(clearLine({ kills: 12, coins: 18.6, time: 41.2 }), '12 mice \u00B7 +18 coins \u00B7 41s');
  assert.equal(clearLine({ kills: 1, coins: 9, time: 8 }), '1 mouse \u00B7 +9 coins \u00B7 8s');
  assert.equal(clearLine({ kills: 0, coins: 0, time: 3 }), '3s', 'nothing to brag about, just the time');
  assert.equal(clearLine(null), '', 'no report, no line');
});

await t('confirmTap: the first tap arms, a second tap within three seconds confirms', async () => {
  const { confirmTap } = await import('../stacking_cats/art_util.js');
  assert.deepEqual(confirmTap(0, 10), { fire: false, armedAt: 10 }, 'first tap only arms');
  assert.deepEqual(confirmTap(10, 12.5), { fire: true, armedAt: 0 }, 'second tap in time fires and resets');
  assert.deepEqual(confirmTap(10, 13.5), { fire: false, armedAt: 13.5 }, 'too slow: it arms again instead');
  assert.equal(confirmTap(0, 0.5).fire, false, 'time zero is not an armed tap');
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
