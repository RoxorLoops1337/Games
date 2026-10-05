// ART.map: the map page of Hocus Vocus, the muted Gloss and the live candy hexes (js/art_map.js), headless on the strict canvas stub.
//
// What this pins down:
//   * every DATA.LISTS.mapKinds id has real art (ART.has), the extras (frame, paper, route, brushPreview, fogEdge, token, paintBloom) exist, the
//     gallery sheets are registered
//   * the hex geometry agrees with MAP (corner i at 60 * i - 30 degrees, side d faces MAP.DIRS[d], toPixel spacing)
//   * every kind x tile x done x seed x size x t draws without a throw or a canvas issue, blits one sprite around (x, y) at about the right size
//   * caching: cached per (kind, tile, done, seed % 8, size rung); a repeat bakes nothing, seed 8 = seed 0, another tile or done bakes; sizes on the
//     same rung share a sprite, which is what keeps a smooth zoom from re-baking a hundred sprites every frame
//   * bad input never throws: unknown kinds and tiles, NaN, Infinity, zero and negative sizes, missing options
//   * paintBloom (0 draws nothing, 1 leaves the settled hex, in between it clips, balanced save and restore), token (leader larger, walk versus idle,
//     flip, one hero, none), route, brushPreview (the union outline of a flower of seven hexes has 18 outer sides and 24 inner ones), fogEdge (one strip
//     per masked side), paper (deterministic, moves with the camera, bounded work at every zoom), frame (a window of at least 1180 x 640 on 1280 x 720)
//   * reduce motion and low quality still draw cleanly, and reduce motion freezes what should freeze
//   * the gallery sheets render (the page sheet with and without MAP), and a performance smoke test: a full page of hexes stays far below 4 ms
//   * the Hocus Vocus look (HV_ART_AUDIO 7): the Act (opts.chapter 1 to 3) picks the live ground of bare Path hexes, the paper and the touches near the
//     party, muted ground stays perfectly still while live hexes near the party move, the tour poster frame chases its marquee bulbs, the token ring
//     wears the leader's colour, the reveal is a film peeling back with sparkles riding the front
import { boot, harness } from './hocus_vocus_lib.mjs';
// Wall-clock budgets are strict with RB_PERF=1 on an idle machine; otherwise 4x slack so a loaded CI box cannot flake the check.
const PERF_SLACK = process.env.RB_PERF ? 1 : 4;

const t = harness('hocus_vocus art map');
const api = boot({ only: ['util', 'data', 'art', 'art_cast_kit', 'art_cast', 'art_icons', 'art_map', 'map'], continue: true });
const { ART, DATA, U, MAP } = api;
const L = DATA.LISTS;
const errs = (api._errors || []).filter((e) => !/art_icons/.test(e.file || ''));
t.ok(errs.length === 0, 'art_map loads without errors: ' + JSON.stringify(errs));
const warns = (api._warnings || []).filter((e) => !/art_icons/.test(e.file || ''));
t.ok(warns.length === 0, 'art_map loads without warnings: ' + JSON.stringify(warns));
const doc = api._doc;
const newCtx = () => doc.createElement('canvas').getContext('2d');
const issues = () => api._issues.map((i) => `${i.kind}: ${i.detail} @ ${i.at}`).slice(0, 4).join(' | ');
const clean = () => { api._resetCounts(); };
const stats = () => ART.sprite.stats();
const M = ART.map;

const ids = new WeakMap();
let idN = 0;
const idOf = (o) => { if (!ids.has(o)) ids.set(o, ++idN); return ids.get(o); };
// a recording context: every call and property write becomes a string, so two drawings can be compared
function recorder() {
  const log = [], calls = [];
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : typeof v === 'string' ? v : v && v._kind ? 'grad' : v && typeof v === 'object' ? 'obj#' + idOf(v) : String(v));
  const real = newCtx();
  const proxy = new Proxy(real, {
    get(target, key) {
      const v = target[key];
      if (typeof v === 'function') return (...a) => { log.push(key + '(' + a.map(fmt).join(',') + ')'); calls.push({ name: key, args: a }); return v.apply(target, a); };
      return v;
    },
    set(target, key, v) { target[key] = v; log.push('=' + String(key) + ':' + fmt(v)); return true; },
  });
  return { ctx: proxy, log, calls, real };
}
const record = (fn) => { const r = recorder(); fn(r.ctx); return r; };
const count = (log, name) => log.filter((l) => l.startsWith(name + '(')).length;
const balance = (fn) => { const r = record(fn); return [count(r.log, 'save'), count(r.log, 'restore'), r.real._stack.length]; };
const drawImages = (r) => r.calls.filter((c) => c.name === 'drawImage').map((c) => c.args);

const SIZES = [12, 20, 27.6, 34, 46, 55, 64, 78, 92, 120, 300];
const TS = [0, 0.37, 1.9, 44.1];
const TILES = L.tiles;
const SIZE_CLASS = [1.7, 2.6];                                   // sprite width over hex width bounds (the box pads the hex a little)

// ------------------------------------------------------------------ registration
t.test('every map kind has real art and the API is in place', () => {
  L.mapKinds.forEach((k) => t.ok(ART.has('map', k), `ART.has(map, ${k})`));
  ['hex', 'paintBloom', 'token', 'frame', 'paper', 'route', 'brushPreview', 'fogEdge', 'frameInner', 'corners', 'warm', 'brushEdges', 'edgeMasks', 'washOf', 'worldBox', 'bakedSize'].forEach((n) => t.eq(typeof M[n], 'function', 'ART.map.' + n));
  ['paintBloom', 'token', 'frame', 'paper', 'route', 'brushPreview', 'fogEdge'].forEach((n) => t.ok(ART.has('map', n), `ART.has(map, ${n})`));
});
t.test('gallery sheets are registered: map_kinds, map_page, map_frame, map_bloom (plus map_token and map_paper)', () => {
  ['map_kinds', 'map_page', 'map_frame', 'map_bloom', 'map_token', 'map_paper'].forEach((n) => t.eq(typeof ART.sheets[n], 'function', 'sheet ' + n));
});

// ------------------------------------------------------------------ geometry
t.test('corners: corner i sits at 60 * i - 30 degrees like MAP.corners, and side d faces MAP.DIRS[d]', () => {
  const size = 46, mine = M.corners(10, 20, size), theirs = MAP.corners(10, 20, size);
  t.eq(mine.length, 6, 'six corners');
  for (let i = 0; i < 6; i++) { t.near(mine[i].x, theirs[i].x, 1e-6, `corner ${i} x`); t.near(mine[i].y, theirs[i].y, 1e-6, `corner ${i} y`); }
  const g = M.geom;
  for (let d = 0; d < 6; d++) {
    const dv = MAP.DIRS[d], nb = MAP.toPixel(dv[0], dv[1], size), a = mine[g.sideCorners[d][0]], b = mine[g.sideCorners[d][1]];
    t.near((a.x + b.x) / 2 - 10, nb.x / 2, 1e-6, `side ${d} midpoint x is half the neighbour offset`);
    t.near((a.y + b.y) / 2 - 20, nb.y / 2, 1e-6, `side ${d} midpoint y is half the neighbour offset`);
    t.near(Math.atan2(nb.y, nb.x), Math.atan2(Math.sin(g.sideAngle[d]), Math.cos(g.sideAngle[d])), 1e-9, `side ${d} angle`);
    t.near(Math.hypot(a.x - b.x, a.y - b.y), size, 1e-6, `side ${d} is one radius long`);
  }
  t.eq(M.corners(0, 0, -3).length, 6, 'a bad size still gives six corners');
});
t.test('frame window: at least 1180 x 640 on 1280 x 720, centred, and it scales with the surface', () => {
  const i = M.frameInner(1280, 720);
  t.ok(i.w >= 1180 && i.h >= 640, `inner ${i.w}x${i.h}`);
  t.near(i.x * 2 + i.w, 1280, 1, 'centred horizontally'); t.near(i.y * 2 + i.h, 720, 1, 'centred vertically');
  const j = M.frameInner(1920, 1080); t.ok(j.w > i.w && j.h > i.h, 'a bigger surface has a bigger window');
  t.ok(M.frameInner(0, 0).w > 0, 'zero size falls back to the design size');
});

// ------------------------------------------------------------------ hex
t.test('every kind, tile, done, seed and size draws without a throw or a canvas issue and blits one sprite around (x, y)', () => {
  clean();
  const ctx = newCtx();
  let n = 0;
  L.mapKinds.forEach((kind) => {
    const tiles = kind === 'painted' || kind === 'known' ? TILES : [undefined];
    tiles.forEach((tile) => [false, true].forEach((done) => [0, 1, 7, 8, -3, 1234567].forEach((seed) => SIZES.forEach((size) => {
      const r = record((c) => M.hex(c, kind, 100, 50, size, { tile, seed, done, t: TS[n++ % TS.length] }));
      const imgs = drawImages(r);
      t.ok(imgs.length >= 1, `${kind}/${tile}/${size}: at least one sprite blitted`);
      const main = imgs[0], cx = main[1] + main[3] / 2, cy = main[2] + main[4] / 2;
      t.ok(Math.abs(cx - 100) < 0.01 && Math.abs(cy - 50) < 0.01, `${kind}/${tile}/${size}: sprite centred on the hex (${cx}, ${cy})`);
      const ratio = main[3] / (Math.sqrt(3) * size);
      t.ok(ratio >= SIZE_CLASS[0] / 1.75 && ratio <= SIZE_CLASS[1] / 1.5, `${kind}/${tile}/${size}: sprite width ratio ${ratio.toFixed(2)}`);
      t.ok(main[3] > 0 && main[4] > 0 && isFinite(main[3] + main[4]), 'finite size');
    }))));
  });
  t.eq(issues(), '', 'no canvas issues from any hex');
});
t.test('unknown kinds and tiles, and hostile numbers, never throw and still draw something', () => {
  clean();
  const ctx = newCtx();
  [['nope', {}], [undefined, {}], [null, null], ['painted', { tile: 'nope' }], ['painted', { tile: 42 }], ['known', { tile: 'empty' }], ['known', { tile: 'block' }], ['known', {}], ['painted', { tile: 'block' }], ['ground', { tile: 'enemy' }]].forEach(([k, o]) => {
    const r = record((c) => M.hex(c, k, 0, 0, 46, o));
    t.ok(drawImages(r).length >= 1, `kind ${String(k)} ${JSON.stringify(o)} draws a sprite`);
  });
  [NaN, Infinity, -Infinity, 0, -5, undefined, null, '46'].forEach((sz) => t.ok(drawImages(record((c) => M.hex(c, 'painted', 0, 0, sz, { tile: 'enemy' }))).length >= 1, `size ${String(sz)} draws`));
  [NaN, Infinity, undefined, null].forEach((x) => t.ok(drawImages(record((c) => M.hex(c, 'fog', x, x, 46, { seed: x, t: x }))).length >= 1, `position ${String(x)} draws`));
  M.hex(ctx, 'fog', 0, 0, 46); M.hex(ctx, 'fog', 0, 0, 46, null);
  t.eq(issues(), '', 'no canvas issues from bad input');
});
t.test('ground is the walkable pale wash and block-tile painted hexes fall back to the void', () => {
  const g = record((c) => M.hex(c, 'ground', 0, 0, 46, { tile: 'enemy', seed: 2 })), p = record((c) => M.hex(c, 'painted', 0, 0, 46, { tile: 'empty', seed: 2 }));
  t.deep(drawImages(g).map((a) => a.slice(1)), drawImages(p).map((a) => a.slice(1)), 'ground equals painted empty, whatever tile is passed');
  const b = record((c) => M.hex(c, 'painted', 0, 0, 46, { tile: 'block', seed: 2 })), v = record((c) => M.hex(c, 'block', 0, 0, 46, { seed: 2 }));
  t.deep(drawImages(b).map((a) => a.slice(1)), drawImages(v).map((a) => a.slice(1)), 'a painted block tile draws the void');
});
t.test('caching: per (kind, tile, done, seed % 8, size rung), and a repeat bakes nothing', () => {
  ART.sprite.clear();
  const ctx = newCtx();
  M.hex(ctx, 'painted', 0, 0, 46, { tile: 'enemy', seed: 3 });
  const a = M.info().baked, m0 = stats().misses;
  M.hex(ctx, 'painted', 0, 0, 46, { tile: 'enemy', seed: 3 });
  t.eq(stats().misses, m0, 'the same hex twice bakes once');
  M.hex(ctx, 'painted', 10, 10, 46, { tile: 'enemy', seed: 11 });
  t.eq(M.info().baked, a, 'seed 11 is the same variant as seed 3 (seed % 8)');
  M.hex(ctx, 'painted', 0, 0, 46, { tile: 'enemy', seed: 4 });
  t.eq(M.info().baked, a + 1, 'another seed % 8 is another sprite');
  M.hex(ctx, 'painted', 0, 0, 46, { tile: 'chest', seed: 3 });
  t.eq(M.info().baked, a + 2, 'another tile is another sprite');
  M.hex(ctx, 'painted', 0, 0, 46, { tile: 'chest', seed: 3, done: true });
  t.eq(M.info().baked, a + 3, 'done is another sprite');
  M.hex(ctx, 'painted', 0, 0, 46.9, { tile: 'chest', seed: 3, done: true });
  t.eq(M.info().baked, a + 3, 'a size on the same rung shares the sprite');
  const m1 = stats().misses;
  M.hex(ctx, 'painted', 0, 0, 46.9, { tile: 'chest', seed: 3, done: true });
  t.eq(stats().misses, m1, 'and nothing at all is baked underneath');
  t.eq(M.bakedSize(46), 46, 'the design size is a rung of its own');
  t.ok(M.bakedSize(60) > 46 && M.bakedSize(30) < 46, 'sizes move up and down the ladder');
  t.ok(Math.abs(M.bakedSize(77) / 77 - 1) < 0.07, 'a rung is within 7 percent of any size');
  t.ok(M.bakedSize(1e6) < 200 && M.bakedSize(1e-6) > 5, 'the ladder is bounded');
});
t.test('a smooth zoom is amortised: crossing a rung with 100 hexes does not bake 100 sprites in one frame', () => {
  ART.sprite.clear();
  const ctx = newCtx();
  const draw = (size, tt) => { for (let i = 0; i < 100; i++) M.hex(ctx, 'painted', i * 10, 0, size, { tile: TILES[1 + (i % 12)], seed: i, t: tt }); };
  draw(46, 1);
  const base = M.info().baked;
  draw(60, 2);                                                   // a new rung: the neighbours exist, so only a few are baked this frame
  const baked = M.info().baked - base;
  t.ok(baked <= M.info().bakesPerFrame + 1, `frame after a rung change baked ${baked} hex sprites (budget ${M.info().bakesPerFrame})`);
  for (let f = 3; f < 40; f++) draw(60, f);
  t.ok(M.info().baked - base <= 100, 'the new rung fills in over the next frames');
  const end = M.info().baked;
  draw(60, 99);
  t.eq(M.info().baked, end, 'and then it is all cached');
});
t.test('warm() bakes a screen ahead of time', () => {
  ART.sprite.clear();
  const n = M.warm(46);
  t.ok(n > 100, `warm baked ${n} sprites`);
  const a = M.info().baked;
  const ctx = newCtx();
  TILES.filter((x) => x !== 'block').forEach((tile, i) => M.hex(ctx, 'painted', 0, 0, 46, { tile, seed: i }));
  ['fog', 'edge', 'block', 'path', 'hover', 'target'].forEach((k) => M.hex(ctx, k, 0, 0, 46, { seed: 5 }));
  ['boss', 'shop', 'camp', 'forge', 'elite', 'chest'].forEach((tile) => M.hex(ctx, 'known', 0, 0, 46, { tile, seed: 6 }));
  t.eq(M.info().baked, a, 'after warm the first real draws are free');
  t.eq(M.warm(46), 0, 'warming twice bakes nothing new');
  t.ok(M.warm(46, { tiles: ['enemy'], done: true }) >= 8, 'done variants can be requested');
});
t.test('draws are pure functions of their arguments: same call log, another seed or tile another one', () => {
  const log = (kind, o) => record((c) => M.hex(c, kind, 5, 6, 46, o)).log.join('|');
  t.eq(log('painted', { tile: 'shop', seed: 2, t: 1 }), log('painted', { tile: 'shop', seed: 2, t: 1 }), 'deterministic');
  t.ok(log('edge', { seed: 1, t: 0.2 }) !== log('edge', { seed: 1, t: 0.9 }), 'the edge glow animates with t');
  t.ok(log('painted', { tile: 'camp', seed: 1, t: 0.2 }) !== log('painted', { tile: 'camp', seed: 1, t: 0.9 }), 'a camp flickers with t');
  t.eq(log('painted', { tile: 'enemy', seed: 1, t: 0.2 }), log('painted', { tile: 'enemy', seed: 1, t: 0.9 }), 'an enemy hex is still');
  t.eq(log('painted', { tile: 'camp', seed: 1, t: 5, done: true }), log('painted', { tile: 'camp', seed: 1, t: 9, done: true }), 'a done hex is still');
  t.eq(log('fog', { seed: 1, t: 0.2 }), log('fog', { seed: 1, t: 8.2 }), 'fog is still');
});
t.test('save and restore stay balanced for every kind, tile and helper', () => {
  L.mapKinds.forEach((k) => TILES.forEach((tile) => { const [s, e, open] = balance((c) => M.hex(c, k, 0, 0, 55, { tile, seed: 2, t: 1.3 })); t.eq(s, e, `${k}/${tile} save/restore (${s}/${e})`); t.eq(open, 0, `${k}/${tile} leaves nothing open`); }));
});

// ------------------------------------------------------------------ paint bloom
t.test('paintBloom: 0 draws nothing, 1 leaves the settled hex (with a tile) or nothing (neutral), the middle clips and stays balanced', () => {
  clean();
  const zero = record((c) => M.paintBloom(c, 0, 0, 46, 0, { tile: 'enemy' }));
  t.eq(zero.calls.length, 0, 'p = 0 draws nothing');
  t.eq(record((c) => M.paintBloom(c, 0, 0, 46, 0)).calls.length, 0, 'neutral p = 0 draws nothing');
  const one = record((c) => M.paintBloom(c, 40, 30, 46, 1, { tile: 'enemy', seed: 5 })), settled = record((c) => M.hex(c, 'painted', 40, 30, 46, { tile: 'enemy', seed: 5 }));
  t.deep(drawImages(one).map((a) => a.slice(1)), drawImages(settled).map((a) => a.slice(1)), 'p = 1 equals the painted hex');
  t.eq(record((c) => M.paintBloom(c, 0, 0, 46, 1)).calls.length, 0, 'neutral p = 1 has faded away');
  [0.03, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.99].forEach((p) => {
    [{ tile: 'chest', seed: 2 }, { tile: 'boss', fromX: -60, fromY: 10 }, { tile: 'nope' }, {}, { ox: 20, oy: -10 }].forEach((o) => {
      const r = record((c) => M.paintBloom(c, 10, 10, 46, p, o));
      t.ok(r.calls.length > 0, `p=${p} ${JSON.stringify(o)} draws`);
      t.eq(count(r.log, 'save'), count(r.log, 'restore'), `p=${p} balanced`);
      t.eq(r.real._stack.length, 0, 'nothing left open');
      t.ok(count(r.log, 'clip') >= 1, `p=${p} clips to the hex`);
    });
  });
  const withTile = record((c) => M.paintBloom(c, 0, 0, 46, 0.3, { tile: 'well', seed: 1 }));
  t.ok(drawImages(withTile).length >= 1, 'with a tile the painted sprite is revealed inside the blot');
  const neutral = record((c) => M.paintBloom(c, 0, 0, 46, 0.3));
  t.eq(drawImages(neutral).length, 0, 'neutral needs no sprite');
  [NaN, Infinity, -1, 2, undefined].forEach((p) => { M.paintBloom(newCtx(), 0, 0, 46, p, {}); M.paintBloom(newCtx(), NaN, 0, NaN, p, { tile: 'enemy' }); });
  t.eq(issues(), '', 'no canvas issues from any bloom');
});
t.test('paintBloom spreads: later frames touch more of the hex than earlier ones and droplets fly mid-way', () => {
  const clipArea = (p) => {
    const r = record((c) => M.paintBloom(c, 0, 0, 46, p, { tile: 'enemy', seed: 3 }));
    const i = r.calls.findIndex((c) => c.name === 'clip' && r.calls.slice(0, r.calls.indexOf(c)).filter((x) => x.name === 'lineTo').length > 10);
    const path = [];
    for (let k = i - 1; k >= 0 && r.calls[k].name !== 'beginPath'; k--) if (r.calls[k].name === 'lineTo' || r.calls[k].name === 'moveTo') path.push(r.calls[k].args);
    if (path.length < 3) return 0;
    let a = 0;
    for (let k = 0; k < path.length; k++) { const p1 = path[k], p2 = path[(k + 1) % path.length]; a += p1[0] * p2[1] - p2[0] * p1[1]; }
    return Math.abs(a) / 2;
  };
  const a1 = clipArea(0.08), a2 = clipArea(0.2), a3 = clipArea(0.4);
  t.ok(a1 > 0 && a2 > a1 && a3 > a2, `blot area grows: ${a1.toFixed(0)} < ${a2.toFixed(0)} < ${a3.toFixed(0)}`);
  const mid = record((c) => M.paintBloom(c, 0, 0, 46, 0.3, {}));
  t.ok(count(mid.log, 'arc') >= 3, 'droplets are drawn mid-bloom');
});

// ------------------------------------------------------------------ token
t.test('token: the leader is larger and in front, walk when moving, idle otherwise, flipped when heading left', () => {
  const calls = [];
  const orig = ART.hero.draw;
  ART.hero.draw = (ctx, id, o) => { calls.push({ id, o }); return orig(ctx, id, o); };
  try {
    M.token(newCtx(), ['hanae', 'kuro'], 100, 100, 1.2, false);
    t.eq(calls.length, 2, 'two heroes drawn'); t.eq(calls[0].id, 'kuro', 'the second hero is drawn first, behind'); t.eq(calls[1].id, 'hanae', 'the leader last, in front');
    t.ok(calls[1].o.s > calls[0].o.s, 'the leader is larger');
    t.ok(calls[1].o.s > 0.15 && calls[1].o.s < 0.5, 'a chibi token size, not a full sprite');
    t.eq(calls[0].o.pose, 'idle', 'idle when standing'); t.eq(calls[0].o.shadow, false, 'the token draws its own shadow');
    t.ok(calls[1].o.y > 100, 'feet stand on the lower half of the hex');
    calls.length = 0; M.token(newCtx(), ['suzu', 'raiga'], 100, 100, 1.2, true);
    t.eq(calls[0].o.pose, 'walk', 'walk when moving'); t.ok(!calls[0].o.flip, 'faces right');
    calls.length = 0; M.token(newCtx(), ['suzu', 'raiga'], 100, 100, 1.2, true, { dir: -1 });
    t.ok(calls[0].o.flip && calls[1].o.flip, 'flipped when heading left');
    calls.length = 0; M.token(newCtx(), 'hanae', 100, 100, 1, false);
    t.eq(calls.length, 1, 'a lone id (a string) draws one hero');
    calls.length = 0; M.token(newCtx(), ['hanae'], 100, 100, 1, false);
    t.eq(calls.length, 1, 'a one-element party draws one hero');
    calls.length = 0; M.token(newCtx(), [], 100, 100, 1, false); M.token(newCtx(), null, 0, 0, 0, false); M.token(newCtx(), [5, {}], 0, 0, 0, false);
    t.eq(calls.length, 0, 'nobody to draw draws nothing');
    calls.length = 0; M.token(newCtx(), ['hanae', 'kuro'], 0, 0, 0, false, { size: 92 }); const big = calls[1].o.s; calls.length = 0; M.token(newCtx(), ['hanae', 'kuro'], 0, 0, 0, false, { size: 46 });
    t.near(big / calls[1].o.s, 2, 1e-9, 'token scales with the hex size');
    calls.length = 0; M.token(newCtx(), ['hanae', 'nobody'], 0, 0, 0, true);
    t.eq(calls.length, 2, 'an unknown hero id still draws (the hero placeholder)');
  } finally { ART.hero.draw = orig; }
  t.eq(issues(), '', 'no canvas issues');
});
t.test('token bobs: the height changes with t when standing, and moves faster when walking', () => {
  const ys = (mv) => [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((tt) => { const c = []; const orig = ART.hero.draw; ART.hero.draw = (ctx, id, o) => { c.push(o.y); }; M.token(newCtx(), ['hanae'], 0, 0, tt, mv); ART.hero.draw = orig; return c[0]; });
  const still = ys(false), walk = ys(true);
  t.ok(Math.max(...still) - Math.min(...still) > 0.2, 'idle bob');
  t.ok(Math.max(...walk) - Math.min(...walk) > Math.max(...still) - Math.min(...still), 'the walking hop is bigger');
  ART.tk.opt = { reduceMotion: true, quality: 'high' };
  const rm = ys(false); ART.tk.opt = { reduceMotion: false, quality: 'high' };
  t.ok(Math.max(...rm) - Math.min(...rm) < Math.max(...still) - Math.min(...still), 'reduce motion damps the bob');
});

// ------------------------------------------------------------------ route
t.test('route: dabs along the path, an end ring and a cost pill; affordable or not; any number of points', () => {
  clean();
  const pts = [[0, 0], [80, 20], [160, 0], [240, 40]];
  const r = record((c) => M.route(c, pts, 1.1, { cost: 3 }));
  t.ok(drawImages(r).length >= 8, `dabs drawn: ${drawImages(r).length}`);
  t.ok(r.calls.some((c) => c.name === 'fillText' && c.args[0] === '3'), 'the cost is written in the pill');
  const bad = record((c) => M.route(c, pts, 1.1, { cost: 5, affordable: false }));
  t.ok(bad.log.join('|') !== r.log.join('|'), 'an unaffordable route looks different');
  t.ok(bad.calls.some((c) => c.name === 'fillText' && c.args[0] === '5'), 'still shows the cost');
  const objs = record((c) => M.route(c, pts.map(([x, y]) => ({ x, y })), 1.1, { cost: 3 }));
  t.eq(objs.log.join('|'), r.log.join('|'), '{x, y} points equal [x, y] points');
  const short = record((c) => M.route(c, [[0, 0], [30, 0]], 0, {})), long = record((c) => M.route(c, [[0, 0], [600, 0]], 0, {}));
  t.ok(drawImages(long).length > drawImages(short).length * 3, 'a longer path has more dabs');
  t.eq(record((c) => M.route(c, [[5, 5]], 1, { cost: 1 })).calls.some((c) => c.name === 'fillText'), true, 'one point: just the end marker and the pill');
  t.eq(record((c) => M.route(c, [], 1, { cost: 1 })).calls.length, 0, 'no points, no drawing');
  t.eq(record((c) => M.route(c, null, 1, {})).calls.length, 0, 'null points, no drawing');
  t.ok(!record((c) => M.route(c, pts, 1, { cost: 3, pill: false })).calls.some((c) => c.name === 'fillText'), 'pill:false hides the pill');
  t.ok(record((c) => M.route(c, pts, 1, { label: 'Free' })).calls.some((c) => c.name === 'fillText' && c.args[0] === 'Free'), 'a label replaces the number');
  const m0 = record((c) => M.route(c, pts, 1.0, { cost: 3 })).log.join('|'), m1 = record((c) => M.route(c, pts, 1.31, { cost: 3 })).log.join('|');
  t.ok(m0 !== m1, 'the dabs march with t');
  [NaN, Infinity, undefined].forEach((tt) => M.route(newCtx(), [[0, 0], [NaN, 5], [Infinity, 1], [50, 50]], tt, { cost: NaN, size: NaN }));
  t.eq(balance((c) => M.route(c, pts, 2, { cost: 3 }))[2], 0, 'balanced');
  [0.3, 1, 2].forEach((sz) => M.route(newCtx(), pts, 1, { cost: 12, size: 46 * sz }));
  t.eq(issues(), '', 'no canvas issues');
});

// ------------------------------------------------------------------ brush preview
t.test('brushEdges: a lone hex has six outer sides; a flower of seven has 18 outer and 24 inner; a line of three has 14 outer and 4 inner', () => {
  const size = 46, st = size * Math.sqrt(3);
  const one = M.brushEdges([[0, 0]], size); t.eq(one.outer.length, 6, 'one hex, six outer'); t.eq(one.inner.length, 0, 'no inner sides');
  const flower = [[0, 0]].concat(MAP.DIRS.map((d) => { const p = MAP.toPixel(d[0], d[1], size); return [p.x, p.y]; }));
  const f = M.brushEdges(flower, size); t.eq(f.outer.length, 18, 'flower outer sides'); t.eq(f.inner.length, 24, 'flower inner sides (6 spokes and 6 rim links, each shared side counted from both hexes)');
  const line = M.brushEdges([[0, 0], [st, 0], [2 * st, 0]], size); t.eq(line.outer.length, 14, 'line outer'); t.eq(line.inner.length, 4, 'line inner (2 links counted twice)');
  const objs = M.brushEdges(flower.map(([x, y]) => ({ x, y })), size); t.eq(objs.outer.length, 18, '{x, y} points work too');
  t.eq(M.brushEdges([], size).outer.length, 0, 'empty set');
});
t.test('brushPreview: valid and invalid shapes draw, with a marching outline, and never throw', () => {
  clean();
  const size = 46, flower = [[0, 0]].concat(MAP.DIRS.map((d) => { const p = MAP.toPixel(d[0], d[1], size); return [p.x + 300, p.y + 200]; }));
  flower[0] = [300, 200];
  const ok = record((c) => M.brushPreview(c, flower, size, true, 1)), bad = record((c) => M.brushPreview(c, flower, size, false, 1));
  t.ok(ok.log.join('|') !== bad.log.join('|'), 'invalid looks different');
  t.ok(count(ok.log, 'setLineDash') >= 2, 'a dashed outline');
  t.ok(ok.log.join('|') !== record((c) => M.brushPreview(c, flower, size, true, 1.4)).log.join('|'), 'the outline marches with t');
  t.ok(count(ok.log, 'fill') >= 1, 'the shape is washed');
  [[], null, [[0, 0]], [{ x: 5, y: 5 }, { x: 5 + 46 * Math.sqrt(3), y: 5 }]].forEach((h) => [true, false, undefined].forEach((v) => M.brushPreview(newCtx(), h, size, v, 0.3)));
  [NaN, Infinity, undefined, 0].forEach((sz) => M.brushPreview(newCtx(), flower, sz, true, NaN));
  t.eq(balance((c) => M.brushPreview(c, flower, size, false, 2))[2], 0, 'balanced');
  t.eq(issues(), '', 'no canvas issues');
});

// ------------------------------------------------------------------ fog edge
t.test('fogEdge: one strip per masked side, void rims and fog washes, rotated to the side', () => {
  clean();
  const cells = [{ x: 100, y: 100, mask: 0b000101 }, { x: 300, y: 100, mask: 0b111111 }, { x: 500, y: 100, voidMask: 0b000011, mask: 0b100000 }, { x: 700, y: 100, mask: 0 }, null, { x: 9, y: 9 }];
  const r = record((c) => M.fogEdge(c, cells, 46, 1));
  t.eq(drawImages(r).length, 2 + 6 + 3, 'a drawImage per set bit');
  t.eq(count(r.log, 'rotate'), 11, 'each strip is rotated into place');
  const rots = r.calls.filter((c) => c.name === 'rotate').map((c) => c.args[0]);
  const want = (d) => M.geom.sideAngle[d] - Math.PI / 2;
  t.near(rots[0], want(0), 1e-9, 'side 0 (E) rotation'); t.near(rots[1], want(2), 1e-9, 'side 2 (NW) rotation');
  t.eq(balance((c) => M.fogEdge(c, cells, 46, 1))[2], 0, 'balanced');
  t.eq(record((c) => M.fogEdge(c, [], 46, 1)).calls.length, 0, 'no cells, no drawing');
  t.eq(record((c) => M.fogEdge(c, null, 46, 1)).calls.length, 0, 'null cells, no drawing');
  [NaN, 0, -4, Infinity].forEach((sz) => M.fogEdge(newCtx(), cells, sz, NaN));
  M.fogEdge(newCtx(), [{ x: NaN, y: Infinity, mask: 63, voidMask: 63 }], 46, 0);
  t.eq(issues(), '', 'no canvas issues');
  // strips are cached: 4 variants per kind and rung
  ART.sprite.clear();
  const many = []; for (let i = 0; i < 60; i++) many.push({ x: i * 37, y: i * 11, mask: 63 });
  M.fogEdge(newCtx(), many, 46, 0);
  t.ok(stats().count <= 8, `strips are cached by variant (${stats().count} sprites for 360 strips)`);
});
t.test('edgeMasks turns a neighbour predicate into the two masks', () => {
  const m = M.edgeMasks(0, 0, (q, r) => (q === 1 && r === 0 ? 'fog' : q === 0 && r === 1 ? 'void' : 'painted'));
  t.eq(m.mask, 1, 'east is fog, bit 0'); t.eq(m.voidMask, 1 << 5, 'south-east (MAP.DIRS[5] = [0, 1]) is void, bit 5');
  t.deep(M.edgeMasks(0, 0, () => 'fog'), { mask: 63, voidMask: 0 }, 'all fog');
});

// ------------------------------------------------------------------ paper
t.test('paper: draws at every camera and zoom without issues, deterministically, and moves with the camera', () => {
  clean();
  const ctx = newCtx();
  [[0, 0, 1], [800, 400, 1], [800, 400, 0.6], [800, 400, 2], [-500, -400, 1], [4000, 3000, 0.6], [800, 400, 0.05], [800, 400, 50], [NaN, Infinity, NaN]].forEach(([x, y, z]) => {
    [[1280, 720], [640, 360], [300, 200], [1920, 1080], [0, 0]].forEach(([w, h]) => M.paper(ctx, w, h, x, y, z, { t: 1 }));
  });
  t.eq(issues(), '', 'no canvas issues from the paper');
  const a = record((c) => M.paper(c, 1280, 720, 800, 400, 1)).log.join('|');
  t.eq(a, record((c) => M.paper(c, 1280, 720, 800, 400, 1)).log.join('|'), 'deterministic');
  t.ok(a !== record((c) => M.paper(c, 1280, 720, 900, 400, 1)).log.join('|'), 'a different camera paints differently');
  t.ok(a !== record((c) => M.paper(c, 1280, 720, 800, 400, 1.5)).log.join('|'), 'a different zoom paints differently');
  t.eq(a, record((c) => M.paper(c, 1280, 720, 800, 400, 1, { t: 99 })).log.join('|'), 'the paper does not animate');
  t.eq(balance((c) => M.paper(c, 1280, 720, 100, 100, 0.7))[2], 0, 'balanced');
});
t.test('paper work is bounded at every zoom, and doodles show in the margins as well as over the page', () => {
  const work = (x, y, z) => record((c) => M.paper(c, 1280, 720, x, y, z)).calls.filter((c) => c.name === 'drawImage').length;
  [0.2, 0.3, 0.6, 1, 2, 6].forEach((z) => t.ok(work(800, 400, z) < 400, `zoom ${z}: ${work(800, 400, z)} blits`));
  const noDoodles = record((c) => M.paper(c, 1280, 720, 800, 400, 0.6, { doodles: false })).calls.filter((c) => c.name === 'drawImage').length;
  t.ok(work(800, 400, 0.6) > noDoodles, 'doodles add blits over the page');
  const wb = M.worldBox();
  t.ok(wb.x1 - wb.x0 > 1600 && wb.y1 - wb.y0 > 850, 'the world box is the page');
  const far = record((c) => M.paper(c, 1280, 720, wb.x1 + 900, wb.y0 - 500, 1)).calls.filter((c) => c.name === 'drawImage').length;
  const farOff = record((c) => M.paper(c, 1280, 720, wb.x1 + 900, wb.y0 - 500, 1, { doodles: false })).calls.filter((c) => c.name === 'drawImage').length;
  t.ok(far > farOff, 'margin doodles appear outside the page');
});

// ------------------------------------------------------------------ frame
t.test('frame: baked once per size, leaves the window open, keeps balance, animates a little', () => {
  clean(); ART.sprite.clear();
  const ctx = newCtx();
  M.frame(ctx, 1280, 720, 0);
  const a = stats();
  M.frame(ctx, 1280, 720, 1.7);
  t.eq(stats().misses, a.misses, 'the second frame bakes nothing');
  M.frame(ctx, 640, 360, 0);
  t.eq(stats().misses, a.misses + 1, 'another size is another sprite');
  t.ok(record((c) => M.frame(c, 1280, 720, 0.3)).log.join('|') !== record((c) => M.frame(c, 1280, 720, 1.9)).log.join('|'), 'the ribbon sways and the corners twinkle');
  ART.tk.opt = { reduceMotion: true, quality: 'high' };
  const s0 = record((c) => M.frame(c, 1280, 720, 0.3)), s1 = record((c) => M.frame(c, 1280, 720, 1.9));
  ART.tk.opt = { reduceMotion: false, quality: 'high' };
  t.ok(s0.calls.length > 0 && s1.calls.length > 0, 'reduce motion still draws');
  [[1280, 720], [1600, 900], [844, 390], [320, 200], [0, 0], [NaN, NaN]].forEach(([w, h]) => M.frame(ctx, w, h, 0.5));
  t.eq(balance((c) => M.frame(c, 1280, 720, 1))[2], 0, 'balanced');
  t.eq(issues(), '', 'no canvas issues');
});
t.test('the frame sprite has a transparent window: it clears the window and keeps every edge inside the margin', () => {
  ART.sprite.clear();
  const calls = [];
  const proto = Object.getPrototypeOf(newCtx());
  const orig = proto.clearRect;
  proto.clearRect = function (...a) { calls.push(a); return orig.apply(this, a); };
  try { M.frame(newCtx(), 1280, 720, 0); } finally { proto.clearRect = orig; }
  const i = M.frameInner(1280, 720);
  t.ok(calls.some((c) => c[0] === i.x && c[1] === i.y && c[2] === i.w && c[3] === i.h), 'clearRect opens exactly the inner window');
});

// ------------------------------------------------------------------ modes
t.test('reduce motion and low quality still draw every piece cleanly', () => {
  clean();
  [{ reduceMotion: true, quality: 'high' }, { reduceMotion: false, quality: 'low' }, { reduceMotion: true, quality: 'low' }].forEach((opt) => {
    ART.tk.opt = opt; ART.sprite.clear();
    const ctx = newCtx();
    L.mapKinds.forEach((k) => TILES.forEach((tile) => M.hex(ctx, k, 0, 0, 46, { tile, seed: 1, t: 2 })));
    M.paper(ctx, 1280, 720, 800, 400, 1); M.frame(ctx, 1280, 720, 1); M.token(ctx, ['hanae', 'kuro'], 0, 0, 1, true);
    M.route(ctx, [[0, 0], [100, 0]], 1, { cost: 2 }); M.brushPreview(ctx, [[0, 0], [80, 0]], 46, true, 1); M.fogEdge(ctx, [{ x: 0, y: 0, mask: 63 }], 46, 1); M.paintBloom(ctx, 0, 0, 46, 0.4, { tile: 'enemy' });
  });
  ART.tk.opt = { reduceMotion: false, quality: 'high' };
  t.eq(issues(), '', 'no canvas issues in any mode');
});

// ------------------------------------------------------------------ sheets
t.test('every map gallery sheet renders (the page sheet falls back to a private page headless) and none leaves a canvas issue', async () => {
  clean();
  for (const name of ['map_kinds', 'map_page', 'map_frame', 'map_bloom', 'map_token', 'map_paper']) {
    const canvas = doc.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
    const before = api._counts.drawImage || 0;
    await ART.sheets[name](canvas, { w: 1600, h: 900, t: 0.5 });
    t.ok((api._counts.drawImage || 0) > before, `${name} composited sprites`);
  }
  t.eq(issues(), '', 'no canvas issues from any sheet');
});
t.test('the page sheet also renders a page built with MAP.generate', async () => {
  const canvas = doc.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
  t.ok(!!MAP, 'MAP is loaded in this suite');
  const before = api._counts.drawImage || 0;
  await ART.sheets.map_page(canvas, { w: 1600, h: 900, t: 1.2, zoom: 0.6 });
  t.ok((api._counts.drawImage || 0) > before + 50, 'a real page draws many hexes');
  await ART.sheets.map_page(canvas, { w: 844, h: 390, t: 0, zoom: 2, moving: true });
  t.eq(issues(), '', 'no canvas issues');
});

// ------------------------------------------------------------------ a real page, and performance
function pageHexes(chapter, seed, paintedFrac) {
  const Mp = MAP.generate({ chapter, seed });
  const sol = MAP.solve(Mp);
  (sol.path || []).slice(0, Math.floor((sol.path || []).length * paintedFrac)).forEach((c) => MAP.paint(Mp, c[0], c[1]));
  MAP.frontier(Mp).slice(0, 6).forEach((T) => { try { MAP.applyBrush(Mp, 'splash', T.q, T.r, 0); } catch (e) { /* fine */ } });
  return Mp;
}
function drawMapScreen(ctx, Mp, size, tt, camX, camY) {
  const inner = M.frameInner(1280, 720), z = size / 46;
  M.paper(ctx, 1280, 720, camX, camY, z, { t: tt });
  const kindAt = (q, r) => { const T = MAP.tile(Mp, q, r); if (!T) return 'off'; if (T.painted) return 'painted'; return T.type === 'block' ? 'void' : 'fog'; };
  const cells = [];
  let drawn = 0;
  Object.keys(Mp.tiles).map((k) => Mp.tiles[k]).forEach((T) => {
    const p = MAP.toPixel(T.q, T.r, size), x = 640 + p.x - camX * z, y = 360 + p.y - camY * z;
    if (x < inner.x - size || x > inner.x + inner.w + size || y < inner.y - size || y > inner.y + inner.h + size) return;
    drawn++;
    if (T.painted) { M.hex(ctx, 'painted', x, y, size, { tile: T.type, seed: T.q * 31 + T.r, done: T.done, t: tt }); const m = M.edgeMasks(T.q, T.r, kindAt); if (m.mask | m.voidMask) cells.push({ x, y, mask: m.mask, voidMask: m.voidMask }); }
    else if (T.known && T.type !== 'block') M.hex(ctx, 'known', x, y, size, { tile: T.type, seed: T.q * 31 + T.r, t: tt });
    else M.hex(ctx, 'fog', x, y, size, { seed: T.q * 31 + T.r, t: tt });
  });
  M.fogEdge(ctx, cells, size, tt);
  M.token(ctx, ['hanae', 'kuro'], 640, 360, tt, false, { size });
  M.frame(ctx, 1280, 720, tt);
  return drawn;
}
t.test('a real page draws at every chapter, seed and zoom from 0.6 to 2.0 without issues', () => {
  clean();
  const ctx = newCtx();
  [1, 2, 3].forEach((ch) => [7, 20260101].forEach((seed) => [0.6, 1, 1.5, 2].forEach((z) => {
    const Mp = pageHexes(ch, seed, 0.5);
    const drawn = drawMapScreen(ctx, Mp, 46 * z, 1.1, 800, 450);
    t.ok(drawn > 5, `chapter ${ch} seed ${seed} zoom ${z}: ${drawn} hexes in view`);
  })));
  t.eq(issues(), '', 'no canvas issues from a real page');
});
t.test('paper: the chunk blits tile the view with no gap at any zoom or camera (no seams)', () => {
  [[0.6, 0, 0], [1, 700.3, 411.7], [1.37, -250.5, 90.2], [2, 1500, 800.9]].forEach(([z, cx, cy]) => {
    const rects = drawImages(record((c) => M.paper(c, 1280, 720, cx, cy, z, { doodles: false }))).filter((a) => a.length === 5).map((a) => ({ x: a[1], y: a[2], w: a[3], h: a[4] }));
    t.ok(rects.length >= 2, `zoom ${z}: ${rects.length} chunk blits`);
    let gaps = 0;
    for (let x = 0; x < 1280; x += 23) for (let y = 0; y < 720; y += 19) if (!rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) gaps++;
    t.eq(gaps, 0, `zoom ${z}: sample points not covered by a chunk`);
  });
});
t.test('performance smoke: a full screen of about 120 visible hexes with fog edge, token and frame is far below 4 ms once warm', () => {
  const Mp = pageHexes(1, 20260101, 0.6), ctx = newCtx();
  ART.sprite.clear();
  let drawn = drawMapScreen(ctx, Mp, 46, 0, 800, 450);
  for (let i = 0; i < 6; i++) drawMapScreen(ctx, Mp, 46, 0.1 * i, 800, 450);
  const N = 40, t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) drawn = drawMapScreen(ctx, Mp, 46, 1 + i * 0.016, 800 + i, 450);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  t.ok(drawn >= 60, `hexes in view: ${drawn}`);
  t.ok(ms < 4 * PERF_SLACK, `a full screen took ${ms.toFixed(2)} ms per frame on the recording stub (budget 4 ms, the real canvas does the same calls)`);
  const before = stats().misses;
  for (let i = 0; i < 5; i++) drawMapScreen(ctx, Mp, 46, 3 + i, 800, 450);
  t.eq(stats().misses, before, 'no baking once warm');
});
t.test('sprite memory of a whole page stays modest: under 12 million pixels at zoom 2 and a 2x display', () => {
  ART.sprite.clear();
  const prevRes = ART.res; ART.res = 2;
  const Mp = pageHexes(1, 20260101, 0.9), ctx = newCtx();
  drawMapScreen(ctx, Mp, 92, 0, 800, 450); drawMapScreen(ctx, Mp, 92, 1, 800, 450);
  const px = stats().pixels;
  ART.res = prevRes; ART.sprite.clear();
  t.ok(px < 12e6, `${(px / 1e6).toFixed(1)} million pixels`);
});

// ------------------------------------------------------------------ the Hocus Vocus look (HV_ART_AUDIO 7)
const logOf = (fn) => record(fn).log.join('|');
t.test('the Act picks the live ground of bare Path hexes and nothing else; unknown Acts clamp to 1 to 3', () => {
  const ground = (ch) => logOf((c) => M.hex(c, 'painted', 5, 6, 46, { tile: 'empty', seed: 2, chapter: ch }));
  t.ok(ground(1) !== ground(2) && ground(2) !== ground(3) && ground(1) !== ground(3), 'Path ground differs in the three Acts');
  t.eq(ground(undefined), ground(1), 'no Act means Act I');
  t.eq(ground(0), ground(1), 'Act 0 clamps to Act I'); t.eq(ground(9), ground(3), 'Act 9 clamps to Act III'); t.eq(ground(NaN), ground(1), 'NaN is Act I'); t.eq(ground('2'), ground(1), 'a string is Act I');
  const same = (tile) => logOf((c) => M.hex(c, 'painted', 5, 6, 46, { tile, seed: 2, chapter: 1 })) === logOf((c) => M.hex(c, 'painted', 5, 6, 46, { tile, seed: 2, chapter: 3 }));
  ['enemy', 'camp', 'boss', 'shop', 'start'].forEach((tile) => t.ok(same(tile), tile + ' looks the same in every Act'));
  t.eq(logOf((c) => M.hex(c, 'ground', 5, 6, 46, { seed: 2, chapter: 2 })), ground(2), 'the ground kind follows the Act too');
  t.eq(logOf((c) => M.hex(c, 'fog', 5, 6, 46, { seed: 2, chapter: 1 })), logOf((c) => M.hex(c, 'fog', 5, 6, 46, { seed: 2, chapter: 3 })), 'the muted Gloss is the same in every Act');
  t.ok(M.washOf('empty').c === '#f6d9a6' && M.washOf('enemy').c === '#e8553f' && M.washOf('block').c === '#e6d9ff', 'the candy table: sand, tomato, Gloss opal');
});
t.test('warm(): another Act bakes only its bare ground', () => {
  ART.sprite.clear();
  M.warm(46);
  t.eq(M.warm(46, { chapter: 2 }), 8, 'eight variants of Path ground, nothing else');
  t.eq(M.warm(46, { chapter: 2 }), 0, 'and then it is cached');
  t.eq(M.warm(46, { chapter: 3 }), 8, 'Act III likewise');
});
t.test('paper: each Act has its own ground and doodle set; an unknown Act is Act I; chunks are cached per Act', () => {
  const p = (ch) => logOf((c) => M.paper(c, 1280, 720, 800, 400, 1, { chapter: ch }));
  t.ok(p(1) !== p(2) && p(2) !== p(3) && p(1) !== p(3), 'three Acts, three papers');
  t.eq(p(undefined), p(1), 'no Act means Act I'); t.eq(p(7), p(3), 'Act 7 clamps to Act III'); t.eq(p(-2), p(1), 'a negative Act is Act I');
  const wb = M.worldBox();
  const blits = (ch) => record((c) => M.paper(c, 1280, 720, wb.x0 + (wb.x1 - wb.x0) * 0.15, wb.y0 + (wb.y1 - wb.y0) * 0.86, 1, { chapter: ch })).calls.filter((c) => c.name === 'drawImage').length;
  const noD = (ch) => record((c) => M.paper(c, 1280, 720, wb.x0 + (wb.x1 - wb.x0) * 0.15, wb.y0 + (wb.y1 - wb.y0) * 0.86, 1, { chapter: ch, doodles: false })).calls.filter((c) => c.name === 'drawImage').length;
  [1, 2, 3].forEach((ch) => t.ok(blits(ch) > noD(ch), 'Act ' + ch + ': a doodle stands in that corner'));
  ART.sprite.clear(); const m0 = stats().misses;
  M.paper(newCtx(), 1280, 720, 800, 400, 1, { chapter: 1 }); const m1 = stats().misses;
  M.paper(newCtx(), 1280, 720, 800, 400, 1, { chapter: 1 }); t.eq(stats().misses, m1, 'a second Act I paper bakes nothing');
  M.paper(newCtx(), 1280, 720, 800, 400, 1, { chapter: 2 }); t.ok(stats().misses > m1, 'Act II bakes its own chunks');
  t.ok(m1 > m0, 'the first paper baked chunks');
  t.eq(issues(), '', 'no canvas issues');
});
t.test('muted ground is perfectly still; live hexes near the party move, the others do not', () => {
  const log = (kind, o) => logOf((c) => M.hex(c, kind, 5, 6, 46, o));
  ['fog', 'block', 'known'].forEach((kind) => t.eq(log(kind, { tile: 'boss', seed: 3, t: 0.2 }), log(kind, { tile: 'boss', seed: 3, t: 8.7 }), kind + ' does not move'));
  [1, 2, 3].forEach((ch) => {
    const near = (tt) => log('painted', { tile: 'enemy', seed: 5, t: tt, near: true, chapter: ch }), far = (tt) => log('painted', { tile: 'enemy', seed: 5, t: tt, near: false, chapter: ch });
    t.eq(far(0.3), far(2.9), 'Act ' + ch + ': a live hex away from the party is still');
    t.ok(near(0.3) !== near(1.1), 'Act ' + ch + ': a live hex near the party moves');
    t.ok(near(0.3) !== far(0.3), 'Act ' + ch + ': near adds touches');
  });
  const n = (ch) => log('painted', { tile: 'enemy', seed: 5, t: 1.3, near: true, chapter: ch });
  t.ok(n(1) !== n(2) && n(2) !== n(3) && n(1) !== n(3), 'each Act has its own touch (bunting and petals, a tiny screen, fairy bulbs)');
  ART.tk.opt = { reduceMotion: true, quality: 'high' };
  t.eq(log('painted', { tile: 'enemy', seed: 5, t: 1.3, near: true, chapter: 1 }), log('painted', { tile: 'enemy', seed: 5, t: 1.3, near: false, chapter: 1 }), 'reduced motion: nothing moves near the party');
  ART.tk.opt = { reduceMotion: false, quality: 'low' };
  t.eq(log('painted', { tile: 'enemy', seed: 5, t: 1.3, near: true, chapter: 2 }), log('painted', { tile: 'enemy', seed: 5, t: 1.3, near: false, chapter: 2 }), 'low quality: nothing moves near the party');
  ART.tk.opt = { reduceMotion: false, quality: 'high' };
  t.ok(log('painted', { tile: 'camp', seed: 5, t: 0.2 }) !== log('painted', { tile: 'camp', seed: 5, t: 0.9 }), 'the green room still glows and flickers');
  t.ok(log('painted', { tile: 'boss', seed: 5, t: 0.2 }) !== log('painted', { tile: 'boss', seed: 5, t: 0.9 }), 'the Headliner hex chases its marquee bulbs');
  t.ok(log('painted', { tile: 'forge', seed: 5, t: 0.2 }) !== log('painted', { tile: 'forge', seed: 5, t: 0.9 }), 'the studio light breathes');
  t.ok(log('painted', { tile: 'well', seed: 5, t: 0.2 }) !== log('painted', { tile: 'well', seed: 5, t: 0.9 }), 'the tea stall steams');
  t.eq(issues(), '', 'no canvas issues');
});
t.test('the poster frame: marquee bulbs chase along the top margin and stand still under reduced motion', () => {
  const my = M.frameInner(1280, 720).y, br = Math.max(5, my * 0.34);
  const bulbs = (tt) => record((c) => M.frame(c, 1280, 720, tt)).calls.filter((c) => c.name === 'drawImage' && Math.abs(c.args[3] - br * 2) < 0.01 && c.args[2] < my).map((c) => Math.round(c.args[1] + c.args[3] / 2));
  const a = bulbs(0), b = bulbs(0.4), c2 = bulbs(1);
  t.ok(a.length >= 4 && a.length <= 8, 'about one bulb in five is lit (' + a.length + ')');
  t.ok(a.join() !== b.join() && b.join() !== c2.join(), 'the lit bulbs move along');
  t.ok(a.every((x, i) => i === 0 || x > a[i - 1]), 'bulbs are drawn left to right');
  ART.tk.opt = { reduceMotion: true, quality: 'high' };
  t.eq(bulbs(0).join(), bulbs(5).join(), 'reduced motion: the pattern stands still');
  ART.tk.opt = { reduceMotion: false, quality: 'high' };
  t.eq(M.frameInner(1280, 720).x, 44, 'the window stays exactly 44, 36, 1192, 648'); t.eq(M.frameInner(1280, 720).y, 36); t.eq(M.frameInner(1280, 720).w, 1192); t.eq(M.frameInner(1280, 720).h, 648);
});
t.test('the token ring wears the leader colour (and a lone unknown id gets the gold ring)', () => {
  const ring = (ids) => logOf((c) => M.token(c, ids, 100, 100, 1.2, false));
  t.ok(ring(['hanae', 'kuro']).indexOf('rgba(255,126,182') >= 0, 'Jasmin leads in pink');
  t.ok(ring(['kuro', 'hanae']).indexOf('rgba(63,207,106') >= 0, 'RoxorLoops leads in green');
  t.ok(ring(['suzu']).indexOf('rgba(167,123,255') >= 0, 'RawClaw leads in violet'); t.ok(ring(['raiga']).indexOf('rgba(255,154,46') >= 0, 'Andy leads in orange');
  t.ok(ring(['nobody']).indexOf('rgba(255,216,77') >= 0, 'an unknown id gets the gold ring');
  t.ok(!/rgba\(255,126,182/.test(ring(['kuro', 'hanae'])), 'the second hero does not colour the ring');
  t.eq(count(record((c) => M.token(c, ['hanae', 'kuro'], 0, 0, 1, false, { ring: false })).log, 'setLineDash'), 0, 'ring:false draws no ring');
});
t.test('the reveal: the film peels back with pink and green sparkles riding the front, rings escape, a note rises', () => {
  clean();
  const mid = record((c) => M.paintBloom(c, 0, 0, 46, 0.3, { tile: 'chest', seed: 2, note: 3 }));
  t.ok(count(mid.log, 'quadraticCurveTo') >= 9 * 4, 'nine sparkles ride the wavefront (' + count(mid.log, 'quadraticCurveTo') + ' curve segments)');
  t.ok(mid.log.some((l) => l === '=fillStyle:#ff7eb6') && mid.log.some((l) => l === '=fillStyle:#7dffa0'), 'pink and green sparkles');
  t.ok(mid.log.some((l) => l.startsWith('=strokeStyle:rgba(251,249,255')), 'the opal lip of the curling film');
  t.ok(mid.log.some((l) => l === 'clip(evenodd)'), 'the film is drawn outside the wavefront only');
  const early = record((c) => M.paintBloom(c, 0, 0, 46, 0.1, { tile: 'chest', seed: 2 })), late = record((c) => M.paintBloom(c, 0, 0, 46, 0.95, { tile: 'chest', seed: 2 }));
  t.ok(count(early.log, 'quadraticCurveTo') > count(late.log, 'quadraticCurveTo'), 'the sparkles are gone when the film has peeled away');
  t.eq(drawImages(record((c) => M.paintBloom(c, 0, 0, 46, 0.5, { seed: 1 }))).length, 0, 'the neutral bloom still needs no sprite');
  t.eq(issues(), '', 'no canvas issues');
});
t.test('route: cream note heads with a pink outline, a Vox capsule for the cost (pink to mint), red and shaking when unaffordable', () => {
  const pts = [[0, 0], [80, 20], [160, 0]];
  const ok = record((c) => M.route(c, pts, 1.1, { cost: 3 })), bad = record((c) => M.route(c, pts, 1.1, { cost: 3, affordable: false }));
  t.ok(ok.log.some((l) => l.startsWith('=fillStyle:grad')) || ok.calls.some((c) => c.name === 'createLinearGradient'), 'the capsule is a gradient');
  t.ok(count(ok.log, 'createLinearGradient') >= 2, 'a capsule gradient and the Vox orb gradient');
  t.ok(bad.log.some((l) => l === '=fillStyle:#e8383d'), 'the unaffordable capsule is red');
  t.ok(!ok.log.some((l) => l === '=fillStyle:#e8383d'), 'the affordable capsule is not');
  t.ok(ok.log.some((l) => l === '=strokeStyle:#2d170f'), 'the warm outline of the cast');
  t.ok(ok.calls.some((c) => c.name === 'fillText' && c.args[0] === '3'), 'the cost is still written');
});
t.test('spotted landmarks are drawn as one ghost sprite each under the film', () => {
  ART.sprite.clear();
  const r = record((c) => ['boss', 'shop', 'camp', 'forge', 'elite', 'chest'].forEach((tile) => M.hex(c, 'known', 0, 0, 46, { tile, seed: 1 })));
  t.eq(drawImages(r).length, 6, 'one sprite per landmark');
  t.eq(issues(), '', 'no canvas issues');
});
t.test('every Hocus Vocus sheet renders: the Path ground in every Act, the doodle sheet, a page in each Act', async () => {
  clean();
  for (const [name, params] of [['map_kinds', {}], ['map_doodles', {}], ['map_paper', { chapter: 3 }], ['map_page', { chapter: 1 }], ['map_page', { chapter: 2 }], ['map_page', { chapter: 3 }], ['map_frame', { chapter: 2, guides: 1 }]]) {
    const canvas = doc.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
    const before = api._counts.drawImage || 0;
    await ART.sheets[name](canvas, Object.assign({ w: 1600, h: 900, t: 0.7 }, params));
    t.ok((api._counts.drawImage || 0) > before, `${name} ${JSON.stringify(params)} composited sprites`);
  }
  t.ok(typeof ART.sheets.map_doodles === 'function', 'the doodle sheet is registered');
  t.eq(issues(), '', 'no canvas issues from any sheet');
});

t.done();
