// World B: interiors, stage, creator, icons and fx sprites.
import { ok, eq, between, done, load } from './beatbox_heroes_lib.mjs';
const BBH = load('pix', 'font', 'catalog', 'world_b');
const { World, Pix } = BBH;
const get = (id, v) => World.builders[id](v);

const SPECS = [
  ['home', 'day', ['bed', 'desk', 'booth', 'kitchen', 'couch', 'wardrobe', 'door'], ['stand', 'bed', 'desk', 'booth', 'kitchen', 'couch', 'wardrobe', 'foxy']],
  ['home', 'night', ['bed', 'desk', 'booth', 'kitchen', 'couch', 'wardrobe', 'door'], ['stand', 'bed', 'desk', 'booth', 'kitchen', 'couch', 'wardrobe', 'foxy']],
  ['shop', 'day', ['hats', 'racks', 'counter', 'mirror', 'door'], ['stand', 'clerk']],
  ['shop', 'night', ['hats', 'racks', 'counter', 'mirror', 'door'], ['stand', 'clerk']],
  ['studio', 'day', ['mic', 'mixer', 'door'], ['stand']],
  ['studio', 'night', ['mic', 'mixer', 'door'], ['stand']],
  ['bar', 'night', ['stage', 'counter', 'door'], ['stand', 'rohzel', 'stage']],
  ['stage', 'pink', [], ['player', 'opponent', 'judge1', 'judge2', 'judge3']],
  ['stage', 'cyan', [], ['player', 'opponent', 'judge1', 'judge2', 'judge3']],
  ['stage', 'lime', [], ['player', 'opponent', 'judge1', 'judge2', 'judge3']],
  ['stage', 'gold', [], ['player', 'opponent', 'judge1', 'judge2', 'judge3']],
  ['creator', null, [], ['hero']],
  ['hoodmap', 'day', ['home', 'park', 'shop', 'studio', 'bar'], ['home', 'park', 'shop', 'studio', 'bar']],
  ['hoodmap', 'dusk', ['home', 'park', 'shop', 'studio', 'bar'], ['home', 'park', 'shop', 'studio', 'bar']],
  ['hoodmap', 'night', ['home', 'park', 'shop', 'studio', 'bar'], ['home', 'park', 'shop', 'studio', 'bar']],
];

const hashes = {};
for (const [id, v, hots, spots] of SPECS) {
  const name = id + (v ? ':' + v : '');
  const t0 = Date.now();
  const s = get(id, v);
  const ms = Date.now() - t0;
  ok(ms < 1500, `${name} builds quickly (${ms}ms)`);
  eq(s.w, 360, name + ' w'); eq(s.h, 640, name + ' h');
  eq(s.id, id, name + ' id'); eq(s.variant || null, v, name + ' variant');
  ok(s.layers && s.layers.length === 1 && s.layers[0].pix instanceof Pix && s.layers[0].speed === 1, name + ' single layer');
  const p = s.layers[0].pix;
  eq(p.w, 360, name + ' pix w'); eq(p.h, 640, name + ' pix h');
  ok(s.fg === null || (s.fg instanceof Pix && s.fg.w === 360 && s.fg.h === 640), name + ' fg shape');
  between(s.floorY, 260, 620, name + ' floorY');
  for (const h of hots) {
    const hs = s.hotspots.find((q) => q.id === h);
    ok(!!hs, name + ' hotspot ' + h);
    if (hs) ok(hs.x >= 0 && hs.y >= 0 && hs.w > 4 && hs.h > 4 && hs.x + hs.w <= 360 && hs.y + hs.h <= 640 && typeof hs.label === 'string', name + ' hotspot rect ' + h);
  }
  for (const h of s.hotspots) ok(h.x >= 0 && h.y >= 0 && h.x + h.w <= 360 && h.y + h.h <= 640, name + ' hotspot inside ' + h.id);
  for (const sp of spots) {
    const q = s.spots[sp];
    ok(!!q, name + ' spot ' + sp);
    if (q) ok(q.x >= 0 && q.x < 360 && q.y > 130 && q.y < 640, name + ' spot in range ' + sp);
  }
  ok(Array.isArray(s.lights) && s.lights.length >= 1, name + ' lights');
  for (const l of s.lights) ok(l.x >= 0 && l.x <= 360 && l.y >= 0 && l.y <= 640 && l.r > 0 && l.a > 0 && /^#/.test(l.color) && ['window', 'lamp', 'neon', 'screen', 'fire'].includes(l.kind), name + ' light ' + l.kind);
  ok(p.countOpaque() / (360 * 640) >= 0.7, name + ' opaque ratio');
  let black = 0; const d = p.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) black++;
  eq(black, 0, name + ' no pure black pixels');
  if (s.fg) { let fb = 0; for (let i = 0; i < s.fg.data.length; i += 4) if (s.fg.data[i + 3] > 0 && s.fg.data[i] + s.fg.data[i + 1] + s.fg.data[i + 2] === 0) fb++; eq(fb, 0, name + ' fg no pure black'); }
  hashes[name] = p.hash();
}
// determinism: re-evaluating the module gives a fresh builder cache, and every scene must come out pixel-identical
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const path = req.resolve('../beatbox_heroes/world_b.js');
  delete req.cache[path];
  const World2 = req(path);
  for (const [id, v] of SPECS) {
    const name = id + (v ? ':' + v : '');
    eq(World2.builders[id](v).layers[0].pix.hash(), hashes[name], name + ' deterministic across builds');
  }
}
// cached: same object on second call
ok(get('home', 'day') === get('home', 'day'), 'scene cache returns the same object');
// stage variants differ
{
  const hs = ['pink', 'cyan', 'lime', 'gold'].map((v) => get('stage', v).layers[0].pix.hash());
  eq(new Set(hs).size, 4, 'stage variants differ');
  ok(get('home', 'day').layers[0].pix.hash() !== get('home', 'night').layers[0].pix.hash(), 'home day != night');
  ok(get('shop', 'day').layers[0].pix.hash() !== get('shop', 'night').layers[0].pix.hash(), 'shop day != night');
  ok(get('studio', 'day').layers[0].pix.hash() !== get('studio', 'night').layers[0].pix.hash(), 'studio day != night');
}

// home nav graph: nodes inside the scene, every spot is a node, edges valid, graph connected
for (const v of ['day', 'night']) {
  const s = get('home', v), nav = s.nav, name = 'home:' + v + ' nav';
  ok(nav && nav.nodes && Array.isArray(nav.edges), name + ' exists');
  for (const k of Object.keys(nav.nodes)) { const n = nav.nodes[k]; ok(n.x >= 0 && n.x < 360 && n.y >= 0 && n.y < 640, name + ' node inside ' + k); }
  for (const k of Object.keys(s.spots)) { ok(!!nav.nodes[k], name + ' has node for spot ' + k); if (nav.nodes[k]) eq(nav.nodes[k], s.spots[k], name + ' node equals spot ' + k); }
  for (const [a, b] of nav.edges) ok(nav.nodes[a] && nav.nodes[b] && a !== b, name + ' edge valid ' + a + '-' + b);
  const adj = {}; for (const k in nav.nodes) adj[k] = [];
  for (const [a, b] of nav.edges) { adj[a].push(b); adj[b].push(a); }
  const seen = new Set(), st = [Object.keys(nav.nodes)[0]];
  while (st.length) { const c = st.pop(); if (seen.has(c)) continue; seen.add(c); for (const n of adj[c]) st.push(n); }
  eq(seen.size, Object.keys(nav.nodes).length, name + ' connected');
  for (const [a, b] of nav.edges) ok(Math.hypot(nav.nodes[a].x - nav.nodes[b].x, nav.nodes[a].y - nav.nodes[b].y) < 260, name + ' edge not absurdly long');
}
// hoodmap variants differ
{
  const hs = ['day', 'dusk', 'night'].map((v) => get('hoodmap', v).layers[0].pix.hash());
  eq(new Set(hs).size, 3, 'hoodmap variants differ');
}
// icons
const ICONS = 'energy food mood cash fans level mus tech ori show lock check cross heart star note mic hat glasses shirt pants shoe sleep eat train busk battle shop home park bar studio gear sound mute back left right coin trophy clock sun moon dice shuffle camera palette wand'.split(' ');
for (const n of ICONS) {
  const ic = World.icon(n);
  ok(ic instanceof Pix && ic.w === 16 && ic.h === 16, 'icon ' + n + ' is 16x16');
  ok(ic.countOpaque() > 20, 'icon ' + n + ' has pixels (' + ic.countOpaque() + ')');
  ok(World.icon(n) === ic, 'icon ' + n + ' cached');
  let black = 0; for (let i = 0; i < ic.data.length; i += 4) if (ic.data[i + 3] > 0 && ic.data[i] + ic.data[i + 1] + ic.data[i + 2] === 0) black++;
  eq(black, 0, 'icon ' + n + ' has no pure black');
}
ok(new Set(ICONS.map((n) => World.icon(n).hash())).size >= ICONS.length - 3, 'icons are mostly distinct');

// fx
for (const n of ['note', 'note2', 'star', 'heart', 'spark', 'puff', 'drop']) { const f = World.fx(n); ok(f instanceof Pix && f.countOpaque() > 3, 'fx ' + n); }
{
  const ring = World.fx('ring'); ok(Array.isArray(ring) && ring.length === 3 && ring.every((q) => q instanceof Pix), 'fx ring frames');
  ok(ring[0].w < ring[1].w && ring[1].w < ring[2].w, 'ring frames grow');
  const coin = World.fx('coin'); ok(Array.isArray(coin) && coin.length === 4 && coin.every((q) => q instanceof Pix && q.countOpaque() > 3), 'fx coin spin');
  const conf = World.fx('confetti'); ok(Array.isArray(conf) && conf.length === 4 && conf.every((q) => q instanceof Pix && q.w === 3 && q.h === 4), 'fx confetti 3x4');
}
done();
