// Dungeon Pusher's service worker — offline after the first visit.
//
// Strategy: the SHELL (navigations / index.html) rides network-first so a
// fresh deploy always lands, falling back to the cache when the connection
// is gone. Everything else in scope (art sheets, relic icons, the manifest)
// is cache-first and backfills the cache as the game streams it in — after
// one full session the whole run works in airplane mode.
//
// Bump CACHE to force a clean slate; activate() sweeps every older dp- cache.
const CACHE = 'dp-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon_192.png', './icon_512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.indexOf('dp-') === 0 && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // the shell: network-first, cache fallback
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // everything else: cache-first, backfill on the way through
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
