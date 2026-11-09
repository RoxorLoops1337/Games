// Pure helpers of the offline service worker (sw.js). A classic script (importScripts) that also loads in node tests: it sets self.GW_SW / globalThis.GW_SW.
// Nothing here touches the network or the Cache API.
(function (g) {
  var PREFIX = 'graftwork-v-';
  var IMG = /\.(png|webp|jpe?g|svg|ico)$/i, ASSET = /\.(woff2?|mp3|ogg|wav)$/i;
  var L = {
    PREFIX: PREFIX,
    cacheName: function (version) { return PREFIX + version; },
    isOurCache: function (name) { return typeof name === 'string' && name.indexOf(PREFIX) === 0; },
    // pathname -> manifest key ('' and a folder URL are index.html); null outside the scope (other games, the root)
    pathKey: function (pathname, scopePath) {
      if (pathname.indexOf(scopePath) !== 0) return null;
      var k = decodeURIComponent(pathname.slice(scopePath.length));
      return k === '' || k.slice(-1) === '/' ? k + 'index.html' : k;
    },
    // which strategy a request gets: 'network' (dev tools and docs, never cached), 'network-first' (pages, code, json: a deploy is picked up at once),
    // 'swr' (images: stale at once, refreshed behind), 'cache-first' (fonts, audio)
    classify: function (key, mode) {
      if (key === null) return 'network';
      if (/^(lab|design|tests|tools)\//.test(key) || /\.md$/i.test(key)) return 'network';
      if (mode === 'navigate' || key === 'index.html') return 'network-first';
      if (IMG.test(key)) return 'swr';
      if (ASSET.test(key)) return 'cache-first';
      return 'network-first'; // js, html, json, css, webmanifest
    },
    // 'none' (no offline copy), 'same', 'changed'
    compareVersions: function (active, latest) { return !active ? 'none' : active === latest ? 'same' : 'changed'; },
    // what a new version needs: files whose hash is unchanged are copied from the old cache, the rest are downloaded
    diffManifests: function (oldM, newM) {
      var reuse = [], fetchList = [], bytes = 0, o = (oldM && oldM.files) || {}, n = (newM && newM.files) || {};
      Object.keys(n).forEach(function (p) {
        if (o[p] && o[p].h === n[p].h) reuse.push(p); else { fetchList.push(p); bytes += n[p].s || 0; }
      });
      var remove = Object.keys(o).filter(function (p) { return !n[p]; });
      return { reuse: reuse, fetch: fetchList, remove: remove, fetchBytes: bytes };
    },
    progress: function (done, total, bytes, totalBytes) {
      var pct = totalBytes > 0 ? bytes / totalBytes : total > 0 ? done / total : 0;
      return { done: done, total: total, bytes: bytes, totalBytes: totalBytes, pct: Math.max(0, Math.min(100, Math.floor(pct * 100))) };
    },
    validManifest: function (m) { return !!(m && typeof m.version === 'string' && m.files && typeof m.files === 'object' && Object.keys(m.files).length > 0); },
  };
  g.GW_SW = L;
})(typeof self !== 'undefined' ? self : globalThis);
