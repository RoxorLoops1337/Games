// Offline copy: the committed sw-manifest.json is current (any change under graftwork/ forces `node tools/graftwork_sw_build.mjs`), the service worker's pure logic,
// the page-side state machine, and the scope rules (nothing outside /graftwork/, no lab or design files precached).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
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

// ---- sw.js itself, run in a sandbox with a fake Cache API and network: a download is all or nothing, the pointer moves last, and
// nothing outside /graftwork/ is ever asked for
{
  const sw = fs.readFileSync(new URL('../graftwork/sw.js', import.meta.url), 'utf8');
  assert.ok(!/[—–]/.test(sw));
  const SC = '/graftwork/', sha16 = (b) => createHash('sha1').update(b).digest('hex').slice(0, 16);
  const manifestOf = (version, texts) => { const files = {}; let bytes = 0; for (const [p, t] of Object.entries(texts)) { const b = Buffer.from(t); files[p] = { h: sha16(b), s: b.length }; bytes += b.length; } return { version, bytes, count: Object.keys(files).length, files }; };
  // one worker: its caches, what it fetched, what it wrote (in order) and what it told the page
  function worker() {
    const stores = new Map(), puts = [], fetched = [], said = [], on = {};
    const net = { manifest: null, texts: {}, status: {} }; // what the network answers: the manifest, the bytes of each file, a status per file
    const keyOf = (k) => (typeof k === 'string' ? k : k.url);
    const cacheOf = (name) => { const m = stores.get(name); return { match: async (k) => { const r = m.get(keyOf(k)); return r ? r.clone() : undefined; }, put: async (k, r) => { puts.push([name, keyOf(k)]); m.set(keyOf(k), r); } }; };
    const box = {
      URL, Response, Request, Promise, Date, JSON, setTimeout, crypto: globalThis.crypto,
      location: { origin: 'https://games.test' }, registration: { scope: 'https://games.test' + SC }, clients: { claim: async () => {} }, skipWaiting: async () => {},
      BroadcastChannel: class { postMessage(m) { said.push(m); } },
      addEventListener: (n, fn) => { on[n] = fn; },
      importScripts: (f) => vm.runInContext(fs.readFileSync(new URL('../graftwork/' + f, import.meta.url), 'utf8'), box),
      caches: { open: async (name) => { if (!stores.has(name)) stores.set(name, new Map()); return cacheOf(name); }, keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name) },
      fetch: async (u) => {
        const url = String(u); fetched.push(url);
        if (url === SC + 'sw-manifest.json') return new Response(JSON.stringify(net.manifest), { status: 200 });
        const p = url.slice(SC.length);
        if (!(p in net.texts) || net.status[p]) return new Response('nf', { status: net.status[p] || 404 });
        return new Response(net.texts[p], { status: 200, headers: { 'content-type': 'text/plain' } });
      },
    };
    box.self = box; vm.createContext(box); vm.runInContext(sw, box);
    const send = async (data) => { const waits = []; on.message({ data, waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
    const state = async () => { const m = stores.get('graftwork-meta'), r = m && m.get(SC + '__state'); return r ? r.clone().json() : null; };
    return { stores, puts, fetched, said, net, send, state };
  }
  const V1 = { 'index.html': '<html>one</html>', 'main.js': 'export const a = 1;', 'ui/title.js': 'export const t = 1;', 'assets/ward/a.webp': 'RIFFone' };
  const V2 = { ...V1, 'main.js': 'export const a = 2;', 'ui/new.js': 'export const n = 1;' };
  const fileKeys = (texts) => Object.keys(texts).map((p) => SC + p);

  // a first download: every file and the manifest marker are in the new cache BEFORE the one write that moves the pointer
  const w = worker(); w.net.manifest = manifestOf('v1', V1); w.net.texts = V1;
  await w.send({ type: 'download' });
  assert.deepEqual([...w.stores.get('graftwork-v-v1').keys()].sort(), [...fileKeys(V1), SC + '__manifest'].sort(), 'the copy holds every file of the manifest and the marker');
  assert.deepEqual(await w.state(), { active: 'v1', pending: null, bytes: w.net.manifest.bytes, pendingBytes: 0 }, 'the new copy is the active one');
  const pointer = w.puts.map(([c]) => c).indexOf('graftwork-meta');
  assert.equal(pointer, w.puts.length - 1, 'the pointer is written once, after every file and after the manifest marker');
  assert.deepEqual(w.puts[pointer - 1], ['graftwork-v-v1', SC + '__manifest'], 'the marker is the last thing put into the copy');
  assert.equal(w.said.at(-1).state, 'ready'); assert.ok(w.said.some((m) => m.state === 'downloading' && m.pct === 100), 'progress reached 100%');
  assert.ok(w.fetched.length === 5 && w.fetched.every((u) => u.startsWith(SC)), 'the worker asks for nothing outside its scope (no api, no other game): ' + w.fetched);

  // an update where one file fails: the partial cache is deleted, the pointer does not move, the old copy keeps serving
  for (const [why, breakIt, msg] of [['a file answers 404', (n) => { n.status['ui/new.js'] = 404; }, /ui\/new\.js 404/], ['a file is not what the manifest says', (n) => { n.texts = { ...V2, 'main.js': 'export const a = 3;' }; }, /main\.js changed during download/]]) {
    const u = worker(); u.net.manifest = manifestOf('v1', V1); u.net.texts = V1; await u.send({ type: 'download' });
    u.net.manifest = manifestOf('v2', V2); u.net.texts = V2; breakIt(u.net);
    const before = u.puts.length; await u.send({ type: 'download' });
    assert.ok(!u.stores.has('graftwork-v-v2'), why + ': the partial cache is deleted');
    assert.ok(u.stores.has('graftwork-v-v1') && (await u.state()).active === 'v1' && (await u.state()).pending === null, why + ': the previous copy stays active');
    assert.ok(!u.puts.slice(before).some(([c]) => c === 'graftwork-meta'), why + ': the pointer was not written');
    assert.equal(u.said.at(-1).state, 'error'); assert.match(u.said.at(-1).message, msg);
  }
  // the same on a first download: nothing is left behind
  { const f = worker(); f.net.manifest = manifestOf('v1', V1); f.net.texts = V1; f.net.status['main.js'] = 500; await f.send({ type: 'download' });
    assert.ok(!f.stores.has('graftwork-v-v1') && (await f.state()) === null, 'a failed first download leaves no cache and no pointer'); assert.equal(f.said.at(-1).state, 'error'); }

  // an update that succeeds: unchanged files are copied from the old cache, only the changed ones are downloaded, and it waits for the next page load
  const u = worker(); u.net.manifest = manifestOf('v1', V1); u.net.texts = V1; await u.send({ type: 'download' });
  u.net.manifest = manifestOf('v2', V2); u.net.texts = V2; const asked = u.fetched.length; await u.send({ type: 'download' });
  assert.deepEqual(u.fetched.slice(asked).sort(), [SC + 'main.js', SC + 'sw-manifest.json', SC + 'ui/new.js'], 'only the manifest and the two changed files travel');
  assert.deepEqual([...u.stores.get('graftwork-v-v2').keys()].sort(), [...fileKeys(V2), SC + '__manifest'].sort());
  const st = await u.state(); assert.equal(st.active, 'v1'); assert.equal(st.pending, 'v2'); assert.equal(u.said.at(-1).state, 'update-ready');
  assert.ok(u.stores.has('graftwork-v-v1'), 'the running page keeps its copy until the next load');
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
