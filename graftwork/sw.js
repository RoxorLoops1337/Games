// Graftwork offline service worker. Scope: /graftwork/ only. Nothing is cached until the player taps "Download for offline play" (ui/app_panel.js).
// The offline copy is a versioned cache built from sw-manifest.json (tools/graftwork_sw_build.mjs): every file is downloaded and verified (size and hash)
// into graftwork-v-<version>; only a COMPLETE cache is ever made active, a failed or partial download is deleted and the previous copy stays.
// Code (html, js, json) is network-first (2.5 s, then the cache) so a deploy is never hidden behind stale code; images are stale-while-revalidate.
// A newer version downloads only the changed files into a new cache and becomes active on the NEXT page load (never under a running page).
importScripts('sw-logic.js');
const L = self.GW_SW, SCOPE = new URL(self.registration.scope).pathname, TIMEOUT = 2500, META = 'graftwork-meta', STATE_URL = SCOPE + '__state', MAN_KEY = SCOPE + '__manifest';
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('graftwork-sw') : null;
const say = (m) => { try { if (bc) bc.postMessage(m); } catch { /* no listeners */ } };
let job = null, last = { latestBytes: 0, latestVersion: null, error: '' };

async function readState() {
  try { const c = await caches.open(META), r = await c.match(STATE_URL); if (r) return Object.assign({ active: null, pending: null, bytes: 0, pendingBytes: 0 }, await r.json()); } catch { /* fresh */ }
  return { active: null, pending: null, bytes: 0, pendingBytes: 0 };
}
async function writeState(st) { const c = await caches.open(META); await c.put(STATE_URL, new Response(JSON.stringify(st), { headers: { 'content-type': 'application/json' } })); }
async function cleanup() {
  const st = await readState();
  for (const n of await caches.keys()) if (L.isOurCache(n) && n !== L.cacheName(st.active) && n !== L.cacheName(st.pending)) await caches.delete(n);
}
function status(extra) {
  return readState().then((st) => Object.assign({ type: 'state', state: st.active ? (st.pending ? 'update-ready' : 'ready') : 'none', version: st.active, bytes: st.bytes, latestVersion: last.latestVersion, latestBytes: last.latestBytes, error: last.error }, extra || {}));
}
async function promote() {
  const st = await readState(); if (!st.pending) return st;
  st.active = st.pending; st.bytes = st.pendingBytes; st.pending = null; st.pendingBytes = 0; await writeState(st); await cleanup(); say(await status()); return st;
}

self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting())); // nothing to precache here: the copy is built on request, so there is no half-filled state to wait for
self.addEventListener('activate', (e) => e.waitUntil((async () => { await self.clients.claim(); await cleanup(); })()));

function timeout(ms) { return new Promise((res) => setTimeout(() => res(null), ms)); }
async function networkFirst(req, cache, ck) {
  const net = fetch(req).then(async (r) => { if (r.ok) { try { await cache.put(ck, r.clone()); } catch { /* quota */ } } return r; });
  net.catch(() => {});
  try {
    const r = await Promise.race([net, timeout(TIMEOUT)]);
    if (r && r.ok) return r;
    const c = await cache.match(ck); if (c) return c;
    return r || net;
  } catch { const c = await cache.match(ck); if (c) return c; throw new Error('offline'); }
}
async function swr(e, req, cache, ck) {
  const m = await cache.match(ck);
  const net = fetch(req).then(async (r) => { if (r.ok) { try { await cache.put(ck, r.clone()); } catch { /* quota */ } } return r; }).catch(() => null);
  if (m) { e.waitUntil(net); return m; }
  return (await net) || Response.error();
}
async function cacheFirst(req, cache, ck) {
  const m = await cache.match(ck); if (m) return m;
  const r = await fetch(req); if (r.ok) { try { await cache.put(ck, r.clone()); } catch { /* quota */ } } return r;
}
async function handle(e, req, key, kind) {
  let st = await readState();
  if (req.mode === 'navigate' && st.pending) st = await promote();
  if (!st.active) return fetch(req);
  const cache = await caches.open(L.cacheName(st.active)), ck = new Request(SCOPE + key);
  if (kind === 'network-first') return networkFirst(req, cache, ck);
  if (kind === 'swr') return swr(e, req, cache, ck);
  return cacheFirst(req, cache, ck);
}
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const key = L.pathKey(url.pathname, SCOPE), kind = L.classify(key, req.mode);
  if (kind === 'network') return; // other games, dev tools, docs: the browser as usual
  e.respondWith(handle(e, req, key, kind));
});

async function sha16(buf) { const d = await crypto.subtle.digest('SHA-1', buf); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16); }
async function loadLatest() {
  const r = await fetch(SCOPE + 'sw-manifest.json', { cache: 'no-store' }); if (!r.ok) throw new Error('manifest ' + r.status);
  const m = await r.json(); if (!L.validManifest(m)) throw new Error('bad manifest'); return m;
}
// mode 'check' reports (and, with apply, refreshes an existing copy); mode 'download' builds the copy now (the player asked)
async function sync(mode, apply) {
  let st = await readState(), name = null;
  try {
    say(await status({ state: 'checking' }));
    const latest = await loadLatest(); last = { latestBytes: latest.bytes, latestVersion: latest.version, error: '' };
    const base = st.pending || st.active, cmp = L.compareVersions(base, latest.version);
    if (cmp === 'same') { say(await status()); return; }
    if (mode === 'check' && (!st.active || !apply)) { say(await status({ state: st.active ? 'update-available' : 'none' })); return; }
    name = L.cacheName(latest.version); await caches.delete(name);
    const next = await caches.open(name), baseCache = base ? await caches.open(L.cacheName(base)) : null;
    let oldM = null; if (baseCache) { const r = await baseCache.match(MAN_KEY); if (r) oldM = await r.json(); }
    const diff = L.diffManifests(oldM, latest); let done = 0, bytes = 0, lastSay = 0; const total = Object.keys(latest.files).length;
    const tick = (p, force) => { done++; bytes += latest.files[p].s; const t = Date.now(); if (force || t - lastSay > 120 || done === total) { lastSay = t; say(Object.assign({ type: 'state', state: 'downloading', version: st.active, latestVersion: latest.version, latestBytes: latest.bytes }, L.progress(done, total, bytes, latest.bytes))); } };
    const queue = [];
    for (const p of diff.reuse) { const r = baseCache && await baseCache.match(SCOPE + p); if (r) { await next.put(SCOPE + p, r); tick(p); } else queue.push(p); }
    for (const p of diff.fetch) queue.push(p);
    let i = 0;
    const worker = async () => {
      while (i < queue.length) {
        const p = queue[i++], want = latest.files[p], r = await fetch(SCOPE + p, { cache: 'no-store' });
        if (!r.ok) throw new Error(p + ' ' + r.status);
        const buf = await r.arrayBuffer();
        if (buf.byteLength !== want.s || (await sha16(buf)) !== want.h) throw new Error(p + ' changed during download');
        await next.put(SCOPE + p, new Response(buf, { headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream' } }));
        tick(p);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    await next.put(MAN_KEY, new Response(JSON.stringify(latest), { headers: { 'content-type': 'application/json' } }));
    st = await readState(); // complete: only now does the pointer move
    if (st.active) { st.pending = latest.version; st.pendingBytes = latest.bytes; } else { st.active = latest.version; st.bytes = latest.bytes; }
    await writeState(st); await cleanup(); say(await status());
  } catch (err) {
    if (mode === 'check' && !name) { say(await status()); return; } // offline at launch: the copy simply stays as it is, no error
    if (name) { try { await caches.delete(name); } catch { /* ignore */ } } // a partial cache is never kept: the previous copy (if any) stays active
    last.error = String((err && err.message) || err); say(await status({ state: 'error', message: last.error }));
  }
}
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'download' || d.type === 'check') { if (!job) { job = sync(d.type, d.apply !== false).finally(() => { job = null; }); } e.waitUntil(job); }
  else if (d.type === 'remove') e.waitUntil((async () => { for (const n of await caches.keys()) if (L.isOurCache(n) || n === META) await caches.delete(n); last.error = ''; say(await status()); })());
  else if (d.type === 'status') e.waitUntil(status().then(say));
});
