// Stacking Cats service worker. Bump VERSION to bust the cache.
// Fonts and icons: cache first. index.html, page loads and code (js): network first, so a deploy is never
// stuck behind a stale cache, with the cache as the offline fallback. /api/ is never touched.
const VERSION = 'sc-v87';
const CACHE = 'stacking-cats-' + VERSION;
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest',
  'main.js', 'sim.js', 'cats.js', 'relics.js', 'i18n.js', 'lang/da.js', 'lang/da_ui.js', 'lang/da_data.js', 'lang/da_story.js', 'audio.js', 'post.js', 'daily.js', 'savecode.js', 'kingdom_scene.js',
  'art_util.js', 'art_cats.js', 'art_world.js', 'art_kingdom.js', 'art_icons.js',
  'pwa.js', 'haptics.js', 'share.js', 'cosmetics.js', 'story.js', 'intro.js', 'meow_bank.js', 'meow_voice.js', 'art_relics.js', 'art_boxes.js', 'chest_fx.js', 'reveal_fx.js', 'meows.aff2147f.wav',
  'fonts/lilitaone-latin.woff2', 'fonts/baloo2-latin.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('stacking-cats-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;                  // leaderboards and cloud data always go to the network
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  const fresh = req.mode === 'navigate' || /(\/|\.html|\.js|\.webmanifest)$/.test(url.pathname);
  if (fresh) {
    e.respondWith(
      fetch(req).then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? 'index.html' : req, copy)); } return res; })
        .catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req).then((r) => r || caches.match('./')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
