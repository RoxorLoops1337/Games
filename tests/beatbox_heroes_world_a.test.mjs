// World A: title key art, logo, neon text, street (3 variants, 3 parallax layers), park (3 variants), intro plates 1..6.
import fs from 'node:fs';
import path from 'node:path';
const { ok, eq, between, done, load, ROOT } = await import('./beatbox_heroes_lib.mjs');
const BBH = load('pix', 'font', 'world_a');
const W = BBH.World;

ok(W && typeof W.scene === 'function', 'World.scene exists');
ok(W.builders && typeof W.builders === 'object', 'World.builders registry exists');
ok(W.cache && typeof W.cache === 'object', 'World.cache exists');
let threw = false; try { W.scene('no_such_scene'); } catch (e) { threw = /unknown scene/i.test(e.message); }
ok(threw, 'unknown scene ids throw a clear Error');
{ const src = fs.readFileSync(path.join(ROOT, 'world_a.js'), 'utf8'); ok(!src.includes(String.fromCharCode(8212)), 'world_a.js has no em dash'); }

// registry: world_b style registration works through the same dispatcher
W.builders.__probe = (v) => ({ id: '__probe', variant: v || null, w: 1, h: 1, layers: [], fg: null, floorY: 0, spots: {}, hotspots: [], lights: [], anim: [] });
eq(W.scene('__probe', 'x').variant, 'x', 'dispatcher calls registered builders with the variant');
ok(W.scene('__probe', 'x') === W.scene('__probe', 'x'), 'scenes are cached');
delete W.builders.__probe; delete W.cache['__probe:x'];

const list = [['title', undefined, 270, 480]];
for (const v of ['day', 'dusk', 'night']) { list.push(['street', v, 810, 480]); list.push(['park', v, 270, 480]); }
for (let i = 1; i <= 6; i++) list.push(['intro' + i, undefined, 270, 270]);

const hashScene = (s) => s.layers.map((l) => l.pix.hash()).join('-') + (s.fg ? ':' + s.fg.hash() : '');
const hashes = {};
for (const [id, v, w, h] of list) {
  const name = id + (v ? ':' + v : '');
  W.cache = {};
  const t0 = Date.now(); const s = W.scene(id, v); const ms = Date.now() - t0;
  between(ms, 0, 1500, name + ' builds in a sensible time');
  eq(s.id, id, name + ' id'); eq(s.w, w, name + ' w'); eq(s.h, h, name + ' h');
  ok(s.layers.length >= 1, name + ' has layers');
  ok(Array.isArray(s.hotspots) && Array.isArray(s.lights) && Array.isArray(s.anim) && s.spots && typeof s.spots === 'object', name + ' has the contract fields');
  between(s.floorY, h * 0.5, h, name + ' floorY sensible');
  for (const L of s.layers) {
    eq(L.pix.h, h, name + ' layer height');
    eq(L.pix.w, Math.round(270 + (w - 270) * L.speed), name + ' layer width follows the parallax rule (speed ' + L.speed + ')');
    between(L.speed, 0, 1, name + ' layer speed');
  }
  ok(s.layers[s.layers.length - 1].speed === 1, name + ' front layer moves with the camera');
  const back = s.layers[0].pix;
  ok(back.countOpaque() / (back.w * back.h) >= 0.6, name + ' background layer is at least 60% opaque');
  { // composite coverage
    const cov = new Uint8Array(w * h);
    for (const L of s.layers) for (let y = 0; y < h; y++) for (let x = 0; x < L.pix.w; x++) if (L.pix.data[(y * L.pix.w + x) * 4 + 3] > 127) cov[y * w + Math.min(w - 1, x)] = 1;
    let n = 0; for (let i = 0; i < cov.length; i++) n += cov[i];
    ok(w > 270 || n / cov.length > 0.985, name + ' single-screen scene is fully painted (' + (n / cov.length).toFixed(3) + ')');
  }
  if (s.fg) { eq(s.fg.w, w, name + ' fg width'); eq(s.fg.h, h, name + ' fg height'); }
  // no pure black anywhere
  let black = 0;
  for (const pix of [...s.layers.map((l) => l.pix), s.fg].filter(Boolean)) { const d = pix.data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] < 24) black++; }
  eq(black, 0, name + ' has no pure black pixels');
  for (const hs of s.hotspots) {
    ok(hs.x >= 0 && hs.y >= 0 && hs.x + hs.w <= w && hs.y + hs.h <= h && hs.w > 0 && hs.h > 0, name + ' hotspot ' + hs.id + ' inside the scene');
    ok(typeof hs.id === 'string' && typeof hs.label === 'string', name + ' hotspot ' + hs.id + ' has id+label');
  }
  for (const l of s.lights) {
    ok(l.x >= 0 && l.x <= w && l.y >= 0 && l.y <= h && l.r > 0 && l.a > 0 && l.a <= 1 && typeof l.color === 'string' && ['window', 'lamp', 'neon', 'screen', 'fire'].includes(l.kind), name + ' light ok ' + JSON.stringify(l));
  }
  for (const [k, sp] of Object.entries(s.spots)) ok(sp.x >= 0 && sp.x <= w && sp.y >= 0 && sp.y <= h, name + ' spot ' + k + ' in range');
  for (const a of s.anim) ok(typeof a.kind === 'string', name + ' anim hint has a kind');
  hashes[name] = hashScene(s);
}

// street doors in order
for (const v of ['day', 'dusk', 'night']) {
  const s = W.scene('street', v), ids = s.hotspots.map((h) => h.id);
  eq(ids, ['park', 'home', 'shop', 'studio', 'bar'], 'street ' + v + ' door ids in x order');
  const want = { park: 70, home: 225, shop: 395, studio: 560, bar: 725 };
  for (const hs of s.hotspots) { between(hs.x + hs.w / 2, want[hs.id] - 12, want[hs.id] + 12, 'street ' + v + ' door ' + hs.id + ' x'); between(hs.w, 40, 60, 'door hotspot width'); }
  for (let i = 1; i < s.hotspots.length; i++) ok(s.hotspots[i].x > s.hotspots[i - 1].x, 'doors strictly increasing in x');
  eq(s.layers.map((l) => l.speed), [0.25, 0.6, 1], 'street ' + v + ' parallax speeds');
  between(s.floorY, 405, 420, 'street floorY about 412');
  ok(s.lights.length > 0 || v === 'day', 'street ' + v + ' has lights unless daytime');
}
for (const v of ['day', 'dusk', 'night']) {
  const s = W.scene('park', v);
  for (const id of ['spot', 'bench', 'gate']) ok(s.hotspots.some((h) => h.id === id), 'park ' + v + ' hotspot ' + id);
  for (const k of ['stand', 'busk', 'bench', 'beeamgee']) ok(s.spots[k], 'park ' + v + ' spot ' + k);
  if (v !== 'day') ok(s.lights.some((l) => l.kind === 'lamp'), 'park ' + v + ' has a lamp light');
}

// determinism: clear the cache, rebuild, compare hashes
for (const [id, v] of list) { const name = id + (v ? ':' + v : ''); W.cache = {}; eq(hashScene(W.scene(id, v)), hashes[name], name + ' is deterministic across builds'); }
ok(new Set(Object.values(hashes)).size === list.length, 'every scene/variant is visually distinct');

// logo + neon
W.cache = {};
const logo = W.logo();
between(logo.w, 200, 260, 'logo width');
between(logo.h, 50, 140, 'logo height');
ok(logo.countOpaque() > 2500, 'logo has substance');
ok(W.logo() === W.logo(), 'logo cached');
{ const a = W.logo().hash(); W.cache = {}; eq(W.logo().hash(), a, 'logo deterministic'); }
const n1 = W.neon('BAR', '#ff3ea5'), n2 = W.neon('BAR', '#ff3ea5', 2), n3 = W.neon('BAR', '#ff3ea5', 2, { off: true });
ok(n1.w > 15 && n1.h > 7, 'neon size');
ok(n2.w > n1.w && n2.h > n1.h, 'neon scale grows the sign');
ok(n1.countOpaque() > 0, 'neon has lit pixels');
ok(n2.data.length / 4 > n2.countOpaque(), 'neon has a translucent halo');
ok(n3.hash() !== n2.hash(), 'neon off variant differs');
eq(W.neon('LIVE', '#ff2f4f', 1).hash(), W.neon('LIVE', '#ff2f4f', 1).hash(), 'neon deterministic');
done();
