// Offline copy: the committed sw-manifest.json is current (any change under graftwork/ forces `node tools/graftwork_sw_build.mjs`), the service worker's pure logic,
// the page-side state machine, and the scope rules (nothing outside /graftwork/, no lab or design files precached).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildManifest, serialize, MANIFEST_PATH } from '../tools/graftwork_sw_build.mjs';
import * as O from '../graftwork/ui/offline.js';

// ---- freshness
{
  const fresh = serialize(buildManifest()), cur = fs.readFileSync(MANIFEST_PATH, 'utf8');
  assert.equal(cur, fresh, 'graftwork/sw-manifest.json is stale: run node tools/graftwork_sw_build.mjs');
  const m = JSON.parse(cur);
  assert.ok(m.version && m.count === Object.keys(m.files).length && m.count > 100);
  assert.equal(m.bytes, Object.values(m.files).reduce((a, v) => a + v.s, 0));
  for (const p of Object.keys(m.files)) assert.ok(!/^(lab|design|tests|tools)\//.test(p) && !/\.md$/.test(p), 'not precached: ' + p);
  for (const p of ['index.html', 'main.js', 'manifest.webmanifest', 'icons/icon-192.png', 'ui/title.js', 'ui/install.js', 'assets/ward/manifest.json']) assert.ok(m.files[p], 'precached: ' + p);
  for (const p of ['sw.js', 'sw-logic.js', 'sw-manifest.json', 'package.json']) assert.ok(!m.files[p], 'managed separately: ' + p);
  assert.ok(m.bytes < 20 * 1048576, 'offline copy stays under 20 MB: ' + m.bytes);
  const m2 = buildManifest(); assert.equal(m2.version, m.version, 'deterministic');
  assert.ok(!/[—–]/.test(cur));
}

// ---- pure logic (sw-logic.js is a classic script: load it in a sandbox)
const ctx = { self: undefined }; ctx.self = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(new URL('../graftwork/sw-logic.js', import.meta.url), 'utf8'), ctx);
const L = ctx.GW_SW;
assert.equal(L.pathKey('/graftwork/', '/graftwork/'), 'index.html'); assert.equal(L.pathKey('/graftwork/ui/title.js', '/graftwork/'), 'ui/title.js');
assert.equal(L.pathKey('/graftwork/assets/ward/a%20b.webp', '/graftwork/'), 'assets/ward/a b.webp');
for (const out of ['/', '/hearthvale/index.html', '/graftwork', '/graftworkx/a.js', '/api/board']) assert.equal(L.pathKey(out, '/graftwork/'), null, 'outside scope: ' + out);
assert.equal(L.classify(null, 'cors'), 'network');
assert.equal(L.classify('index.html', 'navigate'), 'network-first'); assert.equal(L.classify('ui/title.js', 'cors'), 'network-first'); assert.equal(L.classify('sw-manifest.json', 'cors'), 'network-first');
assert.equal(L.classify('assets/ward/manifest.json', 'cors'), 'network-first'); assert.equal(L.classify('assets/ward/rooms/x@2x.webp', 'no-cors'), 'swr');
assert.equal(L.classify('x.woff2', 'cors'), 'cache-first'); assert.equal(L.classify('lab/anim.html', 'navigate'), 'network'); assert.equal(L.classify('design/README.md', 'cors'), 'network');
assert.equal(L.cacheName('abc'), 'graftwork-v-abc'); assert.ok(L.isOurCache('graftwork-v-abc') && !L.isOurCache('clawspire-v1') && !L.isOurCache('graftwork-meta'));
assert.equal(L.compareVersions(null, 'a'), 'none'); assert.equal(L.compareVersions('a', 'a'), 'same'); assert.equal(L.compareVersions('a', 'b'), 'changed');
{
  const o = { files: { a: { h: '1', s: 10 }, b: { h: '2', s: 20 }, gone: { h: '9', s: 1 } } }, n = { files: { a: { h: '1', s: 10 }, b: { h: '3', s: 25 }, c: { h: '4', s: 5 } } };
  const d = L.diffManifests(o, n); assert.deepEqual([...d.reuse], ['a']); assert.deepEqual([...d.fetch].sort(), ['b', 'c']); assert.deepEqual([...d.remove], ['gone']); assert.equal(d.fetchBytes, 30);
  assert.deepEqual([...L.diffManifests(null, n).fetch].sort(), ['a', 'b', 'c'], 'no old copy: everything downloads');
}
{ const p = L.progress(3, 10, 500, 1000); assert.equal(p.pct, 50); assert.equal(L.progress(0, 0, 0, 0).pct, 0); assert.equal(L.progress(9, 9, 2000, 1000).pct, 100); }
assert.ok(L.validManifest({ version: 'v', files: { a: {} } })); assert.ok(!L.validManifest({ version: 'v', files: {} })); assert.ok(!L.validManifest(null));

// ---- sw.js sanity: scope, no other game's paths, a failed download never moves the pointer
{
  const sw = fs.readFileSync(new URL('../graftwork/sw.js', import.meta.url), 'utf8');
  assert.ok(!/[—–]/.test(sw) && !/api\//.test(sw), 'no api calls in the worker');
  assert.ok(/caches\.delete\(name\)/.test(sw) && /writeState\(st\)/.test(sw), 'partial cache deleted on failure; pointer written only at the end');
  assert.ok(sw.lastIndexOf('await writeState(st); await cleanup()') > sw.indexOf("MAN_KEY, new Response"), 'pointer moves after the manifest marker, i.e. after every file');
}

// ---- page side
{
  O.resetOffline();
  assert.equal(O.offlineSupported(), false, 'headless: no service worker'); assert.equal(O.offlineLabel(), 'Not downloaded'); assert.equal(await O.downloadOffline(), false);
  O.S.state = 'none';
  O.apply({ type: 'state', state: 'none', latestBytes: 11534336 }); assert.equal(O.sizeNote(), '11.0 MB, best on wifi');
  O.apply({ type: 'state', state: 'downloading', pct: 37 }); assert.equal(O.offlineLabel(), 'Downloading 37%'); assert.equal(O.offlineReady(), false);
  O.apply({ type: 'state', state: 'ready', bytes: 14.2 * 1048576 }); assert.equal(O.offlineLabel(), 'Ready (14.2 MB)'); assert.equal(O.offlineReady(), true);
  O.apply({ type: 'state', state: 'update-ready' }); assert.match(O.offlineLabel(), /restart/i); assert.equal(O.offlineReady(), true);
  O.apply({ type: 'state', state: 'error', message: 'x' }); assert.match(O.offlineLabel(), /failed/);
  for (const t of ['Not downloaded', 'Downloading 5%', 'Ready (1.0 MB)', 'Update ready, restart to apply']) assert.ok(!/[—–]/.test(t));
  // supported host: registers sw.js at ./ and asks for a check; offer once, never with saveData
  const posted = [], sent = []; let msgHandler = null;
  const reg = { active: { postMessage: (m) => posted.push(m) } };
  const mk = (saveData) => ({ window: { isSecureContext: true, localStorage: (() => { const d = {}; return { getItem: (k) => d[k] || null, setItem: (k, v) => { d[k] = v; } }; })() }, navigator: { connection: { saveData }, serviceWorker: { register: (u, o) => { sent.push([u, o]); return Promise.resolve(reg); }, ready: Promise.resolve(reg) } }, channel: {} });
  const h = mk(false); O.initOffline(h); await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent[0], ['sw.js', { scope: './' }]); assert.deepEqual(posted[0], { type: 'check', apply: true });
  h.channel.onmessage({ data: { type: 'state', state: 'none', latestBytes: 5 } }); assert.equal(O.S.latestBytes, 5);
  await O.downloadOffline(); assert.deepEqual(posted.at(-1), { type: 'download' }); await O.removeOffline(); assert.deepEqual(posted.at(-1), { type: 'remove' });
  O.apply({ type: 'state', state: 'none' }); O.requestOffer(); assert.equal(O.offerDue(), true); O.clearOffer(); assert.equal(O.offerDue(), false); O.requestOffer(); assert.equal(O.offerDue(), false, 'asked once only');
  const hs = mk(true); O.initOffline(hs); await new Promise((r) => setTimeout(r, 10)); assert.equal(posted.at(-1).apply, false, 'saveData: no automatic update download'); O.requestOffer(); assert.equal(O.offerDue(), false, 'saveData: no offer');
  O.resetOffline();
}
console.log('sw ok');
