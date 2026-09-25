// Clawspire map suite: generation rules over many seeds, terrain (water,
// islands, fords, coast), fog / ink / brush / movement rules with ford
// costs, pixel <-> hex round trips, fitting, bounds, paths, save round trip.
// gen() makes a 10x7 map with terrain, genL() a dry one (the legacy
// geometry checks want land everywhere), world() the game's 16x22.
// Runs util+map alone, then util+data+map when data.js exists, plus a stub
// DATA eval to prove the DATA.BRUSHES / ENCOUNTERS / EVENTS paths.
import fs from 'fs';
import path from 'path';
import { harness, boot, source, DIR } from './clawspire_lib.mjs';

const h = harness('clawspire map');
const { U, MAP } = boot({ only: ['util', 'map'] });
const SQRT3 = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const colOf = (q, r) => q + Math.floor(r / 2);
const adj = (a, b) => DIRS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
const tilesOf = (M) => Object.values(M.tiles);
const gen = (seed, extra) => MAP.generate(Object.assign({ act: 1, rng: U.rng(seed), cols: 10, rows: 7 }, extra || {}));
const genL = (seed, extra) => gen(seed, Object.assign({ water: 0 }, extra || {}));
const world = (seed, extra) => MAP.generate(Object.assign({ act: 1, rng: U.rng(seed) }, extra || {}));
const isLand = (t) => t.terrain === 'land';
const landOf = (M) => tilesOf(M).filter(isLand);
// Independent Dijkstra over hidden, non-boss, non-sea tiles from the lit area: the ink a path to `t` must cost.
function inkTo(M, t) {
  const lit = tilesOf(M).filter(x => x.revealed && (x.type !== 'boss' || x.visited));
  const dist = {};
  const cost = (x) => x.terrain === 'shallow' ? 2 : 1;
  const open = [];
  for (const l of lit) { dist[MAP.key(l.q, l.r)] = 0; open.push(l); }
  while (open.length) {
    open.sort((a, b) => dist[MAP.key(a.q, a.r)] - dist[MAP.key(b.q, b.r)]);
    const c = open.shift();
    const ck = MAP.key(c.q, c.r);
    if (c === t) return dist[ck];
    for (const [q, r] of MAP.neighbors(M, c.q, c.r)) {
      const n = M.tiles[MAP.key(q, r)];
      if (n.revealed || n.type === 'boss' || n.terrain === 'sea') continue;
      const nd = dist[ck] + cost(n);
      const nk = MAP.key(q, r);
      if (dist[nk] == null || nd < dist[nk]) { dist[nk] = nd; if (!open.includes(n)) open.push(n); }
    }
  }
  return Infinity;
}
const SPECIAL = ['shop', 'rest', 'forge', 'elite', 'treasure', 'tower'];
const LANDMARK = ['shop', 'rest', 'forge', 'elite', 'treasure', 'boss', 'tower'];
const inB = (M, q, r) => r >= 0 && r < M.rows && colOf(q, r) >= 0 && colOf(q, r) < M.cols;
const snapshot = (M) => JSON.stringify(M);
const revealedSet = (M) => new Set(tilesOf(M).filter(t => t.revealed).map(t => MAP.key(t.q, t.r)));

/* Checks every structural rule the bible and the brief put on a fresh map. */
function checkMap(M, label, D) {
  const tiles = tilesOf(M);
  h.eq(tiles.length, M.cols * M.rows, label + ' tile count = cols*rows');
  let bad = 0;
  for (let r = 0; r < M.rows; r++) {
    for (let c = 0; c < M.cols; c++) {
      const q = c - Math.floor(r / 2);
      const t = M.tiles[MAP.key(q, r)];
      if (!t || t.q !== q || t.r !== r) bad++;
    }
  }
  h.eq(bad, 0, label + ' rectangle holds q = -floor(r/2) .. cols-1-floor(r/2) per row');
  const mid = Math.floor(M.rows / 2);
  h.ok(M.start.r === mid && colOf(M.start.q, M.start.r) === 0, label + ' start at left middle');
  h.ok(M.boss.r === mid && colOf(M.boss.q, M.boss.r) === M.cols - 1, label + ' boss at right middle');
  const n = {};
  for (const t of tiles) n[t.type] = (n[t.type] || 0) + 1;
  h.ok(tiles.every(t => MAP.TYPES.includes(t.type)), label + ' only known tile types');
  h.eq(n.start, 1, label + ' one start');
  h.eq(n.boss, 1, label + ' one boss');
  h.eq(MAP.tileAt(M, M.start.q, M.start.r).type, 'start', label + ' start tile typed');
  h.eq(MAP.tileAt(M, M.boss.q, M.boss.r).type, 'boss', label + ' boss tile typed');
  for (const [t, min] of Object.entries({ shop: 3, rest: 3, forge: 2, elite: 2, treasure: 2, brush: 2, ink: 4, tower: 2 })) {
    h.ok((n[t] || 0) >= min, `${label} ${t} >= ${min} (got ${n[t] || 0})`);
  }
  h.ok((n.tower || 0) <= 3, label + ' at most 3 towers');
  // Tiny clamped maps are mostly minimums; real sizes must stay fight heavy.
  const land = landOf(M);
  if (tiles.length >= 45) h.ok((n.fight || 0) >= Math.floor(0.2 * land.length), label + ' plenty of fights');
  // Landmarks: known exactly on the landmark types, from the start.
  h.ok(tiles.every(t => t.known === LANDMARK.includes(t.type)), label + ' known flag exactly on landmark types');
  h.ok(tiles.every(t => MAP.isLandmark(t) === LANDMARK.includes(t.type)), label + ' isLandmark agrees');
  // Towers: islands first (one each while towers remain), at least one on
  // the mainland, never next to each other. Mainland towers sit off the
  // axis; on a dry map they keep the old edge rule (top or bottom row,
  // columns 3..cols-3, no special beside them).
  const towers = tiles.filter(t => t.type === 'tower');
  const islands = MAP.islandsOf(M);
  const onIsland = new Set([].concat(...islands));
  const mainTowers = towers.filter(t => !onIsland.has(MAP.key(t.q, t.r)));
  const isleTowers = towers.filter(t => onIsland.has(MAP.key(t.q, t.r)));
  h.ok(mainTowers.length >= 1, label + ' at least one tower on the mainland');
  h.ok(mainTowers.every(t => t.r !== M.start.r), label + ' mainland towers off the start-boss axis');
  h.ok(towers.every(a => towers.every(b => a === b || !adj(a, b))), label + ' towers never adjacent to each other');
  if (islands.length && towers.length >= 2) h.ok(isleTowers.length >= 1, label + ' an island holds a tower');
  h.ok(isleTowers.length <= islands.length && islands.every(isle => isle.filter(k => M.tiles[k].type === 'tower').length <= 1), label + ' at most one tower per island');
  if (!(M.water > 0)) {
    h.ok(towers.every(t => t.r === 0 || t.r === M.rows - 1), label + ' dry map: towers on the top or bottom row');
    h.ok(towers.every(t => colOf(t.q, t.r) >= 3 && colOf(t.q, t.r) <= M.cols - 3), label + ' dry map: towers in columns 3..cols-3');
    if (tiles.length >= 60) {
      h.ok(towers.every(t => MAP.neighbors(M, t.q, t.r).every(([q, r]) => !SPECIAL.includes(M.tiles[MAP.key(q, r)].type))),
        label + ' dry map: towers not adjacent to another special');
    }
  }
  // Terrain: three kinds, sea empty and unknown, coast flags right, elevation
  // in range, biome per act, every island reachable through a ford.
  h.ok(tiles.every(t => ['land', 'shallow', 'sea'].includes(t.terrain)), label + ' terrain is land, shallow or sea');
  h.ok(tiles.filter(t => t.terrain !== 'land').every(t => t.type === 'empty' && !t.known && Object.keys(t.content).length === 0), label + ' water holds no content');
  h.ok(tiles.every(t => t.coast === (isLand(t) && MAP.neighbors(M, t.q, t.r).some(([q, r]) => !isLand(M.tiles[MAP.key(q, r)])))), label + ' coast flag on land touching water');
  h.ok(tiles.every(t => typeof t.elev === 'number' && t.elev >= 0 && t.elev <= 1), label + ' elev in 0..1');
  h.ok(tiles.every(t => t.biome === MAP.BIOMES[M.act]) && M.biome === MAP.BIOMES[M.act], label + ' biome follows the act');
  h.ok(isLand(MAP.tileAt(M, M.start.q, M.start.r)) && isLand(MAP.tileAt(M, M.boss.q, M.boss.r)), label + ' start and boss on land');
  h.ok(MAP.neighbors(M, M.start.q, M.start.r).every(([q, r]) => isLand(M.tiles[MAP.key(q, r)])), label + ' start neighbourhood is land');
  h.ok(MAP.pathExists(M, M.start, M.boss, { any: true, land: true }), label + ' a land route joins start and boss');
  h.eq(M.islands, islands.length, label + ' M.islands counts the islands');
  h.ok(islands.every(isle => isle.length >= 3), label + ' islands have at least 3 hexes');
  h.ok(islands.every(isle => isle.every(k => !MAP.neighbors(M, M.tiles[k].q, M.tiles[k].r).some(([q, r]) => isLand(M.tiles[MAP.key(q, r)]) && !isle.includes(MAP.key(q, r))))), label + ' islands touch no other land');
  h.ok(land.every(t => MAP.pathExists(M, M.start, t, { any: true })), label + ' every land hex reachable through fords');
  if (islands.length) h.ok(tiles.some(t => t.terrain === 'shallow'), label + ' islands come with fords');
  const wet = tiles.filter(t => !isLand(t)).length;
  h.ok(Math.abs(M.water - wet / tiles.length) < 0.011, label + ' M.water is the water share');
  h.ok(towers.every(t => t.content.elite && t.content.tower && ['ink', 'brush', 'claw', 'gold'].includes(t.content.tower.bonus.k)), label + ' towers carry an elite flag and a bonus');
  const elites = tiles.filter(t => t.type === 'elite');
  h.ok(elites.every(e => !adj(e, M.start)), label + ' no elite next to start');
  h.ok(MAP.neighbors(M, M.boss.q, M.boss.r).every(([q, r]) => M.tiles[MAP.key(q, r)].type !== 'elite'),
    label + ' boss neighbours hold no elite');
  const fights = tiles.filter(t => t.type === 'fight' || t.type === 'elite');
  h.ok(fights.every(t => typeof t.content.diff === 'number' && t.content.diff >= 0 && t.content.diff <= 1),
    label + ' fight diff in 0..1');
  h.ok(fights.every(t => Math.abs(t.content.diff - colOf(t.q, t.r) / (M.cols - 1)) < 0.006),
    label + ' fight diff follows column distance');
  h.ok(tiles.filter(t => t.type === 'ink').every(t => t.content.ink >= 1 && t.content.ink <= 2), label + ' ink tiles give 1-2');
  const brushIds = D && D.BRUSHES ? Object.keys(D.BRUSHES) : Object.keys(MAP.FALLBACK_BRUSHES);
  h.ok(tiles.filter(t => t.type === 'brush').every(t => brushIds.includes(t.content.brush)), label + ' brush tiles carry a known brush');
  h.ok(tiles.filter(t => t.type === 'gem' || t.type === 'treasure').every(t => t.content.gold > 0), label + ' gem/treasure carry gold');
  // Fog.
  const st = MAP.tileAt(M, M.start.q, M.start.r);
  h.ok(st.revealed && st.visited, label + ' start revealed + visited');
  h.ok(MAP.neighbors(M, M.start.q, M.start.r).every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), label + ' start neighbours revealed');
  h.ok(MAP.tileAt(M, M.boss.q, M.boss.r).revealed, label + ' boss revealed');
  h.eq(M.revealedCount, 2 + MAP.neighbors(M, M.start.q, M.start.r).length, label + ' only start, neighbours and boss revealed');
  h.eq(M.ink, MAP.START_INK, label + ' ink starts at START_INK');
  h.ok(M.pos.q === M.start.q && M.pos.r === M.start.r, label + ' pos = start');
  h.ok(Array.isArray(M.brushes) && M.brushes.length === 0, label + ' no brushes yet');
  h.ok(MAP.pathExists(M, M.start, M.boss, { any: true }), label + ' boss reachable through the fog');
  h.ok(MAP.walkCost(M, M.start, M.boss, { any: true, land: true }) === 0, label + ' the land route costs no ink to walk');
  h.ok(!MAP.pathExists(M, M.start, M.boss), label + ' boss not reachable through revealed tiles on a fresh map');
}

h.test('shape and module hygiene', () => {
  const src = fs.readFileSync(path.join(DIR, 'js', 'map.js'), 'utf8');
  h.ok(!/Math\.random/.test(src), 'map.js never uses Math.random');
  h.ok(!/\b(document|window)\./.test(src), 'map.js never touches the DOM');
  const top = src.split('\n').filter(l => /^(const|let|var|function|class)\b/.test(l));
  h.eq(top.length, 1, 'exactly one top-level declaration');
  h.ok(/^const MAP = \(\(\) => \{/.test(top[0] || ''), 'it is const MAP = (() => {');
  const mine = [src, fs.readFileSync(new URL(import.meta.url), 'utf8')];
  h.ok(mine.every(s => !s.includes(String.fromCharCode(0x2014))), 'no em dashes in map.js or this suite');
  for (const fn of ['generate', 'key', 'neighbors', 'canReveal', 'reveal', 'brush', 'canMove', 'move', 'toPixel',
    'fromPixel', 'pathExists', 'progress', 'serialize', 'deserialize', 'tileAt', 'reachable', 'revealable', 'hexCorners', 'size',
    'isLandmark', 'pathToReveal', 'revealPath', 'bounds', 'islandsOf', 'revealCost', 'moveCost', 'pathCost', 'walkCost', 'biomeOf']) {
    h.eq(typeof MAP[fn], 'function', 'MAP.' + fn + ' exists');
  }
  h.eq(MAP.key(-2, 5), '-2,5', 'key format');
});

h.test('200 seeds satisfy every generation rule', () => {
  for (let s = 1; s <= 200; s++) checkMap(gen(s * 7919, { act: 1 + (s % 3) }), 'seed ' + s);
});

h.test('16x22 world: 100 seeds keep every rule, water 20-40%, 2-4 islands, best content on them', () => {
  let minW = 1, maxW = 0, isles = new Set(), islandLoot = 0, shops = 0, fords = 0, inkShare = 0;
  for (let s = 1; s <= 100; s++) {
    const M = world(s * 131, { act: 1 + (s % 3) });
    checkMap(M, 'world ' + s);
    const tiles = tilesOf(M), land = landOf(M);
    h.ok(M.cols === 16 && M.rows === 22 && tiles.length === 352, 'world ' + s + ' is 16x22');
    minW = Math.min(minW, M.water); maxW = Math.max(maxW, M.water);
    isles.add(M.islands);
    h.ok(M.islands >= 2 && M.islands <= 4, 'world ' + s + ' has 2-4 islands (' + M.islands + ')');
    h.ok(M.water >= 0.2 && M.water <= 0.4, 'world ' + s + ' water share 20-40% (' + M.water + ')');
    const islands = MAP.islandsOf(M);
    const isleTiles = [].concat(...islands).map(k => M.tiles[k]);
    h.ok(isleTiles.some(t => t.type === 'tower') && isleTiles.some(t => t.type === 'treasure'), 'world ' + s + ' islands hold a tower and a treasure');
    islandLoot += isleTiles.filter(t => ['tower', 'treasure', 'elite'].includes(t.type)).length;
    shops += isleTiles.filter(t => t.type === 'shop').length;
    fords += tiles.filter(t => t.terrain === 'shallow').length;
    inkShare += tiles.filter(t => t.type === 'ink').length / land.length;
    h.ok(tiles.filter(t => t.type === 'tower').some(t => !isleTiles.includes(t)), 'world ' + s + ' keeps a tower on the mainland');
    h.eq(M.ink, MAP.START_INK, 'world ' + s + ' starts with START_INK');
  }
  h.ok(minW >= 0.2 && maxW <= 0.4, `water share over 100 seeds within 20-40% (${minW}..${maxW})`);
  h.ok(isles.size >= 2, 'island count varies');
  h.ok(islandLoot >= 300, 'islands average 3+ prizes (' + islandLoot + ')');
  h.ok(shops > 10 && shops < 250, 'islands sometimes carry a shop (' + shops + ')');
  h.ok(fords >= 200, 'a few fords per map (' + fords + ' over 100 maps)');
  h.ok(inkShare / 100 >= 0.085 && inkShare / 100 <= 0.12, 'ink pots about 10% of the land (' + (inkShare / 100).toFixed(3) + ')');
  h.ok(MAP.INK_PER_ACT_HINT >= 15 && MAP.INK_PER_ACT_HINT <= 40, 'INK_PER_ACT_HINT is a sane number');
  h.eq(MAP.SHALLOW_COST, 2, 'fords cost 2');
});

h.test('determinism and variety', () => {
  h.eq(snapshot(gen(42)), snapshot(gen(42)), 'same seed, same map');
  h.ok(snapshot(gen(42)) !== snapshot(gen(43)), 'different seeds differ');
  const layouts = new Set();
  for (let s = 1; s <= 20; s++) layouts.add(tilesOf(gen(s)).map(t => t.type).join());
  h.eq(layouts.size, 20, '20 seeds give 20 layouts');
});

h.test('other sizes and clamping', () => {
  checkMap(gen(5, { cols: 16, rows: 9 }), '16x9');
  checkMap(gen(6, { cols: 9, rows: 5 }), '9x5');
  const tiny = gen(7, { cols: 2, rows: 1 });
  h.ok(tiny.cols >= 9 && tiny.rows >= 3, 'tiny request clamps up');
  checkMap(tiny, 'clamped');
  const d = MAP.generate({ rng: U.rng(9) });
  h.ok(d.cols === 16 && d.rows === 22 && d.act === 1, 'defaults 16x22 act 1');
  h.ok(MAP.DEFAULT_COLS === 16 && MAP.DEFAULT_ROWS === 22, 'DEFAULT_COLS/ROWS exported as 16x22');
  h.eq(Object.keys(d.tiles).length, 352, 'default map has 352 tiles');
  h.eq(MAP.HEX, 46, 'HEX is the 46 px hex the game draws');
  h.ok(tilesOf(tiny).every(t => t.terrain === 'land') && tiny.water === 0, 'tiny maps stay dry');
  h.ok(tilesOf(genL(8)).every(t => t.terrain === 'land' && !t.coast), 'water: 0 gives an all-land map without coast');
  checkMap(genL(8), 'dry 10x7');
});

h.test('neighbours', () => {
  const M = gen(1);
  const mid = MAP.neighbors(M, 3, 3);
  h.eq(mid.length, 6, 'interior hex has 6 neighbours');
  const tl = MAP.neighbors(M, 0, 0);
  h.ok(tl.length === 2 && tl.every(([q, r]) => inB(M, q, r)), 'top-left corner has 2 in-bound neighbours');
  for (const t of tilesOf(M)) {
    const ns = MAP.neighbors(M, t.q, t.r);
    if (!ns.every(([q, r]) => inB(M, q, r) && adj(t, { q, r }))) { h.ok(false, 'neighbour out of bounds at ' + t.q + ',' + t.r); break; }
    const exp = DIRS.filter(([dq, dr]) => inB(M, t.q + dq, t.r + dr)).length;
    if (ns.length !== exp) { h.ok(false, 'neighbour count wrong at ' + t.q + ',' + t.r); break; }
  }
  h.ok(MAP.tileAt(M, 99, 99) === null, 'tileAt off the map is null');
});

h.test('reveal spends ink and respects adjacency', () => {
  const M = genL(11);
  const cand = MAP.revealable(M);
  h.ok(cand.length > 0, 'something is revealable at the start');
  h.ok(cand.every(t => !t.revealed && MAP.canReveal(M, t.q, t.r)), 'revealable() agrees with canReveal()');
  const all = tilesOf(M).filter(t => MAP.canReveal(M, t.q, t.r));
  h.eq(all.length, cand.length, 'revealable() lists every revealable tile');
  const t = cand[0];
  const before = M.revealedCount;
  const got = MAP.reveal(M, t.q, t.r);
  h.ok(got === M.tiles[MAP.key(t.q, t.r)] && got.revealed, 'reveal returns the tile, now revealed');
  h.eq(M.ink, MAP.START_INK - 1, 'reveal spends exactly 1 ink');
  h.eq(M.revealedCount, before + 1, 'revealedCount +1');
  h.eq(MAP.reveal(M, t.q, t.r), null, 'refuses an already revealed tile');
  h.eq(MAP.reveal(M, M.start.q, M.start.r), null, 'refuses the start');
  h.eq(M.ink, MAP.START_INK - 1, 'refusals cost nothing');
  const far = tilesOf(M).find(x => !x.revealed && !MAP.neighbors(M, x.q, x.r).some(([q, r]) => M.tiles[MAP.key(q, r)].revealed));
  h.ok(far && !MAP.canReveal(M, far.q, far.r) && MAP.reveal(M, far.q, far.r) === null, 'refuses a tile not touching the revealed area');
  h.ok(!MAP.canReveal(M, -5, 3) && MAP.reveal(M, 20, 20) === null, 'refuses out of bounds');
  h.eq(M.ink, MAP.START_INK - 1, 'still one ink down');
  // Chain reveals outward: each new tile opens its own neighbours.
  const outward = MAP.revealable(M).find(x => adj(x, got) && !adj(x, M.start));
  if (outward) h.ok(MAP.reveal(M, outward.q, outward.r) !== null, 'newly revealed tiles extend the frontier');
  while (M.ink > 0) { const c = MAP.revealable(M)[0]; MAP.reveal(M, c.q, c.r); }
  h.eq(M.ink, 0, 'ink runs out');
  const c = tilesOf(M).find(x => !x.revealed && MAP.neighbors(M, x.q, x.r).some(([q, r]) => M.tiles[MAP.key(q, r)].revealed));
  h.ok(!MAP.canReveal(M, c.q, c.r) && MAP.reveal(M, c.q, c.r) === null, 'refuses with 0 ink');
  h.eq(MAP.revealable(M).length, 0, 'revealable() is empty with 0 ink');
  h.ok(MAP.revealable(M, { brush: true }).length > 0, 'revealable({brush}) ignores ink');
  h.eq(M.ink, 0, 'ink never goes negative');
  h.eq(M.revealedCount, tilesOf(M).filter(x => x.revealed).length, 'revealedCount stays in sync');
});

// Expected footprints, written independently of map.js.
const EXPECT = {
  line3: (q, r) => [[q, r], [q + 1, r], [q + 2, r]],
  splash: (q, r) => [[q, r], ...DIRS.map(([a, b]) => [q + a, r + b])],
  comb: (q, r) => [-2, -1, 0, 1, 2].map(d => [colOf(q, r) - Math.floor((r + d) / 2), r + d]),
};

/* Applies brush `id` at `target` (with MAP or the given module) and checks
   the result against the expected footprint. */
function brushCase(M, id, target, expectCells, label, mod) {
  const X = mod || MAP;
  M.brushes = [id, 'zzz', id];
  const before = revealedSet(M);
  const ink = M.ink;
  const inb = expectCells.filter(([q, r]) => inB(M, q, r)).map(([q, r]) => MAP.key(q, r));
  const fresh = inb.filter(k => !before.has(k));
  const got = X.brush(M, id, target.q, target.r);
  h.ok(Array.isArray(got), label + ' brush applied');
  if (!got) return;
  const after = revealedSet(M);
  h.ok(inb.every(k => after.has(k)), label + ' every in-bounds cell revealed');
  const added = [...after].filter(k => !before.has(k)).sort();
  h.eq(added.join(' '), fresh.slice().sort().join(' '), label + ' nothing else revealed');
  h.eq(got.map(t => MAP.key(t.q, t.r)).sort().join(' '), fresh.slice().sort().join(' '), label + ' returns the newly revealed tiles');
  h.eq(M.ink, ink, label + ' costs no ink');
  h.eq(M.brushes.join(), 'zzz,' + id, label + ' consumes exactly one copy');
  h.eq(M.revealedCount, after.size, label + ' revealedCount in sync');
}

h.test('fallback brushes reveal exactly their in-bounds cells', () => {
  for (const id of ['line3', 'splash', 'comb']) {
    const M = genL(21);
    const tgt = MAP.revealable(M).find(t => colOf(t.q, t.r) === 2) || MAP.revealable(M)[0];
    brushCase(M, id, tgt, EXPECT[id](tgt.q, tgt.r), id + ' mid');
  }
  // Clipping: reveal the right and top edges by hand, then brush on the edge.
  for (const id of ['line3', 'splash', 'comb']) {
    const M = genL(22);
    const tgt = { q: M.cols - 2 - 0, r: 0 }; // row 0, column cols-2
    M.tiles[MAP.key(tgt.q - 1, 0)].revealed = true;
    M.revealedCount = tilesOf(M).filter(t => t.revealed).length;
    const cells = EXPECT[id](tgt.q, tgt.r);
    h.ok(cells.some(([q, r]) => !inB(M, q, r)), id + ' edge case really clips');
    brushCase(M, id, tgt, cells, id + ' edge');
  }
  // drip: target + 2 distinct neighbours, same pick every time for (q, r).
  const M = genL(23);
  const tgt = MAP.revealable(M)[0];
  const cells = MAP.brushCells('drip', tgt.q, tgt.r);
  h.eq(cells.length, 3, 'drip is 3 cells');
  h.ok(cells[0][0] === tgt.q && cells[0][1] === tgt.r, 'drip includes the target');
  h.ok(adj(tgt, { q: cells[1][0], r: cells[1][1] }) && adj(tgt, { q: cells[2][0], r: cells[2][1] }), 'drip extras are neighbours');
  h.ok(MAP.key(...cells[1]) !== MAP.key(...cells[2]), 'drip extras differ');
  h.eq(JSON.stringify(MAP.brushCells('drip', tgt.q, tgt.r)), JSON.stringify(cells), 'drip is deterministic');
  const spread = new Set();
  for (let q = 0; q < 6; q++) for (let r = 0; r < 6; r++) spread.add(JSON.stringify(MAP.brushCells('drip', q, r).slice(1).map(([a, b]) => [a - q, b - r])));
  h.ok(spread.size >= 6, 'drip varies with (q, r)');
  brushCase(M, 'drip', tgt, cells, 'drip');
  // comb reads as a vertical column on screen.
  const comb = MAP.brushCells('comb', 3, 3).map(([q, r]) => MAP.toPixel(q, r, 20).x);
  h.ok(Math.max(...comb) - Math.min(...comb) <= SQRT3 * 10 + 1e-9, 'comb stays within half a hex of vertical');
});

h.test('brush refusals', () => {
  const M = genL(31);
  const tgt = MAP.revealable(M)[0];
  h.eq(MAP.brush(M, 'splash', tgt.q, tgt.r), null, 'refuses a brush you do not own');
  M.brushes = ['splash', 'mystery'];
  h.eq(MAP.brush(M, 'mystery', tgt.q, tgt.r), null, 'refuses an unknown brush id');
  h.eq(MAP.brush(M, 'splash', M.start.q, M.start.r), null, 'refuses a revealed target');
  const far = tilesOf(M).find(x => !x.revealed && !MAP.neighbors(M, x.q, x.r).some(([q, r]) => M.tiles[MAP.key(q, r)].revealed));
  h.eq(MAP.brush(M, 'splash', far.q, far.r), null, 'refuses a target away from the revealed area');
  h.eq(MAP.brush(M, 'splash', 50, 50), null, 'refuses out of bounds');
  h.eq(M.brushes.join(), 'splash,mystery', 'refusals keep the brush');
  M.ink = 0;
  h.ok(Array.isArray(MAP.brush(M, 'splash', tgt.q, tgt.r)), 'brushes work with 0 ink');
});

h.test('movement', () => {
  const M = genL(41);
  const reach = MAP.reachable(M);
  h.eq(reach.length, MAP.neighbors(M, M.start.q, M.start.r).length, 'all start neighbours reachable');
  h.ok(!MAP.canMove(M, M.start.q, M.start.r), 'cannot move onto the current tile');
  h.eq(MAP.move(M, M.boss.q, M.boss.r), null, 'cannot jump to the (revealed) boss');
  const hiddenAdj = () => MAP.neighbors(M, M.pos.q, M.pos.r).map(([q, r]) => M.tiles[MAP.key(q, r)]).find(t => !t.revealed);
  const step = reach.find(t => colOf(t.q, t.r) === 1) || reach[0];
  const got = MAP.move(M, step.q, step.r);
  h.ok(got === M.tiles[MAP.key(step.q, step.r)], 'move returns the tile');
  h.ok(M.pos.q === step.q && M.pos.r === step.r, 'move sets pos');
  h.ok(got.visited, 'move marks visited');
  const hid = hiddenAdj();
  h.ok(hid && !MAP.canMove(M, hid.q, hid.r) && MAP.move(M, hid.q, hid.r) === null, 'refuses an adjacent hidden tile');
  h.ok(M.pos.q === step.q && M.pos.r === step.r, 'refusal keeps pos');
  const tgt = MAP.reveal(M, hid.q, hid.r);
  h.ok(MAP.canMove(M, tgt.q, tgt.r), 'revealing it makes it walkable');
  h.ok(MAP.reachable(M).includes(tgt), 'reachable() lists it');
  h.ok(MAP.reachable(M).every(t => MAP.canMove(M, t.q, t.r)), 'reachable() agrees with canMove()');
  h.eq(tilesOf(M).filter(t => MAP.canMove(M, t.q, t.r)).length, MAP.reachable(M).length, 'reachable() is complete');
  const farRevealed = tilesOf(M).find(t => t.revealed && !adj(t, M.pos) && !(t.q === M.pos.q && t.r === M.pos.r));
  h.ok(!MAP.canMove(M, farRevealed.q, farRevealed.r), 'refuses a non-adjacent revealed tile');
  h.ok(!MAP.canMove(M, 99, 0), 'refuses out of bounds');
  h.ok(MAP.move(M, M.start.q, M.start.r) !== null, 'can walk back to start');
});

h.test('toPixel / fromPixel round trip', () => {
  const M = gen(51);
  h.ok(MAP.toPixel(0, 0, 30).x === 30 && MAP.toPixel(0, 0, 30).y === 30, 'hex (0,0) centred at (size, size)');
  for (const size of [9, 23.5, 48]) {
    let bad = 0, badEdge = 0, badDist = 0;
    const inr = SQRT3 / 2 * size;
    for (const t of tilesOf(M)) {
      const p = MAP.toPixel(t.q, t.r, size);
      const b = MAP.fromPixel(p.x, p.y, size);
      if (b.q !== t.q || b.r !== t.r) bad++;
      for (let i = 0; i < 6; i++) {
        // Toward each edge midpoint (pointy-top: edges face 0, 60, ... deg) and each corner.
        const ae = (Math.PI / 3) * i, ac = ae - Math.PI / 6;
        const e = MAP.fromPixel(p.x + Math.cos(ae) * inr * 0.97, p.y + Math.sin(ae) * inr * 0.97, size);
        const c = MAP.fromPixel(p.x + Math.cos(ac) * size * 0.95, p.y + Math.sin(ac) * size * 0.95, size);
        if (e.q !== t.q || e.r !== t.r || c.q !== t.q || c.r !== t.r) badEdge++;
        // Just past the edge lands in the neighbour across it.
        const o = MAP.fromPixel(p.x + Math.cos(ae) * inr * 1.03, p.y + Math.sin(ae) * inr * 1.03, size);
        if (!adj(t, o)) badEdge++;
      }
      for (const [q, r] of MAP.neighbors(M, t.q, t.r)) {
        const n = MAP.toPixel(q, r, size);
        if (Math.abs(Math.hypot(n.x - p.x, n.y - p.y) - SQRT3 * size) > 1e-9) badDist++;
      }
    }
    h.eq(bad, 0, `centres round trip at size ${size}`);
    h.eq(badEdge, 0, `points near edges and corners stay inside (size ${size})`);
    h.eq(badDist, 0, `neighbour centres sqrt3*size apart (size ${size})`);
  }
  // The offset rectangle really is a rectangle: column 0 centres line up per row parity.
  const xs0 = [], xs1 = [];
  for (let r = 0; r < M.rows; r++) (r % 2 ? xs1 : xs0).push(MAP.toPixel(-Math.floor(r / 2), r, 20).x);
  h.ok(new Set(xs0).size === 1 && new Set(xs1).size === 1 && xs1[0] - xs0[0] === SQRT3 * 10, 'odd rows shoved half a hex right');
});

h.test('hexCorners and size()', () => {
  const pts = MAP.hexCorners(100, 50, 20);
  h.eq(pts.length, 6, '6 corners');
  h.ok(pts.every(p => Math.abs(Math.hypot(p.x - 100, p.y - 50) - 20) < 1e-9), 'corners at radius size');
  h.ok(pts.some(p => Math.abs(p.y - 30) < 1e-9 && Math.abs(p.x - 100) < 1e-9), 'pointy top');
  const mg = MAP.FIT_MARGIN;
  h.ok(mg >= 2 && mg <= 8, 'FIT_MARGIN is a small px margin');
  for (const [cols, rows] of [[10, 7], [9, 5], [16, 9]]) {
    const M = gen(61, { cols, rows });
    for (const [w, hh] of [[540, 600], [540, 960], [1200, 400], [320, 320]]) {
      const f = MAP.size(M, w, hh);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const t of tilesOf(M)) {
        const p = MAP.toPixel(t.q, t.r, f.size);
        for (const c of MAP.hexCorners(p.x + f.ox, p.y + f.oy, f.size)) {
          x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
        }
      }
      const tag = `${cols}x${rows} in ${w}x${hh}`;
      h.ok(x0 >= mg - 1e-6 && x1 <= w - mg + 1e-6 && y0 >= mg - 1e-6 && y1 <= hh - mg + 1e-6, tag + ` fits with ${mg}px margin`);
      h.ok(Math.abs(x0 - mg) < 1e-6 || Math.abs(y0 - mg) < 1e-6, tag + ' is as large as it can be');
      h.ok(Math.abs(x0 - (w - x1)) < 1e-6 && Math.abs(y0 - (hh - y1)) < 1e-6, tag + ' is centred');
    }
  }
});

h.test('pathExists', () => {
  const M = genL(71);
  h.ok(MAP.pathExists(M, M.start, M.pos), 'trivial path to self');
  h.ok(MAP.pathExists(M, M.start, { q: MAP.neighbors(M, M.start.q, M.start.r)[0][0], r: MAP.neighbors(M, M.start.q, M.start.r)[0][1] }), 'start to a neighbour');
  h.ok(!MAP.pathExists(M, M.start, M.boss), 'no revealed path yet');
  h.ok(MAP.pathExists(M, M.start, M.boss, { any: true }), 'a fogged path exists');
  // Reveal the middle row: now the boss is reachable on foot.
  for (let c = 0; c < M.cols; c++) M.tiles[MAP.key(c - Math.floor(M.start.r / 2), M.start.r)].revealed = true;
  h.ok(MAP.pathExists(M, M.start, M.boss), 'revealed corridor reaches the boss');
  h.ok(!MAP.pathExists(M, M.start, { q: 0, r: 0 }), 'hidden target is not reachable');
  h.ok(!MAP.pathExists(M, M.start, { q: 40, r: 0 }), 'out of bounds target is not reachable');
  // The boss is never walked through: two boss neighbours that only meet at the boss.
  const B = genL(72);
  for (const t of tilesOf(B)) t.revealed = false;
  const bn = MAP.neighbors(B, B.boss.q, B.boss.r).map(([q, r]) => ({ q, r }));
  let pair = null;
  for (const a of bn) for (const b of bn) if (!pair && a !== b && !adj(a, b)) pair = [a, b];
  h.ok(!!pair, 'found two boss neighbours that do not touch');
  for (const p of [...pair, B.boss]) B.tiles[MAP.key(p.q, p.r)].revealed = true;
  h.ok(!MAP.pathExists(B, pair[0], pair[1]), 'paths do not pass through the boss');
  h.ok(MAP.pathExists(B, pair[0], B.boss), 'but may end on it');
  // Control: the same shape around an ordinary tile does connect.
  const C = genL(73);
  for (const t of tilesOf(C)) t.revealed = false;
  const mid = { q: 3, r: 3 };
  const cn = MAP.neighbors(C, mid.q, mid.r).map(([q, r]) => ({ q, r }));
  const cp = [cn[0], cn.find(x => !adj(x, cn[0]) && x !== cn[0])];
  for (const p of [...cp, mid]) C.tiles[MAP.key(p.q, p.r)].revealed = true;
  h.ok(C.tiles[MAP.key(3, 3)].type !== 'boss' && MAP.pathExists(C, cp[0], cp[1]), 'an ordinary tile is walked through');
});

h.test('progress', () => {
  const M = genL(81);
  const p = MAP.progress(M);
  h.eq(p.total, 70, 'dry map: total = cols*rows');
  const Wt = gen(82);
  h.eq(MAP.progress(Wt).total, tilesOf(Wt).filter(t => t.terrain !== 'sea').length, 'wet map: total leaves out the sea');
  h.eq(p.revealed, M.revealedCount, 'revealed = revealedCount');
  h.eq(p.pct, Math.round(100 * p.revealed / 70), 'pct is a rounded percentage');
  const t = MAP.revealable(M)[0];
  MAP.reveal(M, t.q, t.r);
  h.eq(MAP.progress(M).revealed, p.revealed + 1, 'progress follows reveals');
  for (const x of tilesOf(M)) x.revealed = true;
  h.eq(MAP.progress(M).pct, 100, '100% when all revealed');
});

h.test('serialize / deserialize', () => {
  const M = gen(91, { act: 2 });
  const t = MAP.revealable(M)[0];
  MAP.reveal(M, t.q, t.r);
  MAP.move(M, t.q, t.r) || MAP.move(M, MAP.reachable(M)[0].q, MAP.reachable(M)[0].r);
  M.brushes.push('splash', 'line3');
  const o = MAP.serialize(M);
  const json = JSON.stringify(o);
  h.eq(json, JSON.stringify(M), 'serialize is deep-equal to M');
  const D = MAP.deserialize(JSON.parse(json));
  h.eq(JSON.stringify(D), JSON.stringify(M), 'deserialize round trip is deep-equal');
  o.tiles[MAP.key(0, 0)].type = 'shop';
  h.ok(M.tiles[MAP.key(0, 0)].type !== 'shop' || D.tiles[MAP.key(0, 0)].type !== 'shop', 'copies are detached');
  // Same ops on the original and the loaded copy give the same state.
  const ops = (X) => {
    const r1 = MAP.revealable(X)[2];
    MAP.reveal(X, r1.q, r1.r);
    const bt = MAP.revealable(X, { brush: true }).slice(-1)[0];
    MAP.brush(X, 'splash', bt.q, bt.r);
    const step = MAP.reachable(X).slice(-1)[0];
    MAP.move(X, step.q, step.r);
    return X;
  };
  const A = ops(MAP.deserialize(MAP.serialize(M)));
  const Bm = ops(D);
  h.eq(JSON.stringify(A), JSON.stringify(Bm), 'loaded map behaves identically');
  h.eq(Bm.revealedCount, tilesOf(Bm).filter(x => x.revealed).length, 'loaded map keeps revealedCount in sync');
  h.eq(Bm.brushes.join(), 'line3', 'loaded map consumed its brush');
  const broken = JSON.parse(json);
  broken.revealedCount = 3;
  h.eq(MAP.deserialize(broken).revealedCount, M.revealedCount, 'deserialize recomputes a stale revealedCount');
  h.eq(MAP.deserialize(null), null, 'deserialize(null) is null');
  // known flags and tower content survive the trip.
  const tw = tilesOf(D).filter(t => t.type === 'tower');
  h.ok(tw.length >= 2 && tw.every(t => t.known && t.content.tower && t.content.tower.bonus), 'loaded towers keep known + bonus');
  h.ok(tilesOf(D).every(t => t.known === LANDMARK.includes(t.type)), 'loaded known flags match the landmark types');
  h.ok(tilesOf(D).every((t, i) => { const o = tilesOf(M)[i]; return t.terrain === o.terrain && t.elev === o.elev && t.coast === o.coast && t.biome === o.biome; }), 'terrain, elev, coast and biome survive the trip');
  h.ok(D.biome === M.biome && D.islands === M.islands && D.water === M.water, 'map biome, islands and water survive');
  // A save from before the terrain gets a dry map back.
  const flat = JSON.parse(json);
  delete flat.biome; delete flat.islands; delete flat.water;
  for (const k in flat.tiles) { const t = flat.tiles[k]; delete t.terrain; delete t.elev; delete t.coast; delete t.biome; }
  const Fm = MAP.deserialize(flat);
  h.ok(tilesOf(Fm).every(t => t.terrain === 'land' && typeof t.elev === 'number' && t.coast === false && t.biome === MAP.BIOMES[2]), 'old save: all land, act biome');
  h.ok(Fm.biome === MAP.BIOMES[2] && Fm.islands === 0 && Fm.water === 0, 'old save: dry map fields');
  h.ok(MAP.reveal(Fm, MAP.revealable(Fm)[0].q, MAP.revealable(Fm)[0].r) !== null, 'old save still plays');
  // An old save (no known, tower without content) gets defaults.
  const old = JSON.parse(json);
  for (const k in old.tiles) { delete old.tiles[k].known; if (old.tiles[k].type === 'tower') old.tiles[k].content = {}; }
  const O = MAP.deserialize(old);
  h.ok(tilesOf(O).every(t => t.known === LANDMARK.includes(t.type)), 'old save: known derived from the type');
  h.ok(tilesOf(O).filter(t => t.type === 'tower').every(t => t.content.tower && t.content.tower.bonus.k === 'ink'), 'old save: towers get a default bonus');
});

h.test('landmarks stay hidden until revealed', () => {
  const M = gen(101);
  const lm = tilesOf(M).filter(t => t.known && !t.revealed && t.type !== 'boss');
  h.ok(lm.length >= 10, 'plenty of hidden landmarks (' + lm.length + ')');
  h.ok(lm.every(t => !MAP.canMove(M, t.q, t.r)), 'known tiles are not walkable while hidden');
  h.ok(tilesOf(M).filter(t => ['fight', 'gem', 'ink', 'event', 'brush', 'empty', 'start'].includes(t.type)).every(t => !t.known), 'fights, gems, ink, events, brushes, empties, start are unknown');
  h.ok(MAP.isLandmark({ type: 'tower' }) && MAP.isLandmark({ type: 'boss' }) && !MAP.isLandmark({ type: 'fight' }) && !MAP.isLandmark(null), 'isLandmark by type');
});

// Hex distance in axial coordinates.
const hexDist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
const litSet = (M) => tilesOf(M).filter(t => t.revealed && (t.type !== 'boss' || t.visited));

h.test('pathToReveal: shortest, never through the boss, excludes revealed', () => {
  for (let s = 1; s <= 40; s++) {
    const M = genL(s * 97);
    const lit = litSet(M);
    let bad = 0;
    for (const t of tilesOf(M)) {
      const path = MAP.pathToReveal(M, t.q, t.r);
      const adjacent = MAP.neighbors(M, t.q, t.r).some(([q, r]) => lit.some(l => l.q === q && l.r === r));
      if (t.revealed || t.type === 'boss' || adjacent) { if (path.length) bad++; continue; }
      if (!path.length) { bad++; continue; }
      const last = path[path.length - 1];
      if (last[0] !== t.q || last[1] !== t.r) bad++;
      if (path.some(([q, r]) => M.tiles[MAP.key(q, r)].revealed || M.tiles[MAP.key(q, r)].type === 'boss')) bad++;
      // chained: first touches the lit area, each next touches the previous
      if (!MAP.neighbors(M, path[0][0], path[0][1]).some(([q, r]) => lit.some(l => l.q === q && l.r === r))) bad++;
      for (let i = 1; i < path.length; i++) if (!adj({ q: path[i - 1][0], r: path[i - 1][1] }, { q: path[i][0], r: path[i][1] })) bad++;
      // shortest: no more tiles than the hex distance to the nearest lit tile
      const best = Math.min(...lit.map(l => hexDist(l, t)));
      if (path.length !== best) bad++;
    }
    h.eq(bad, 0, 'seed ' + s + ': every hidden tile has a correct shortest path (bad=' + bad + ')');
  }
  const M = genL(5);
  h.eq(MAP.pathToReveal(M, 40, 40).length, 0, 'out of bounds is empty');
  h.eq(MAP.pathToReveal(M, M.start.q, M.start.r).length, 0, 'revealed start is empty');
  h.eq(MAP.pathToReveal(M, M.boss.q, M.boss.r).length, 0, 'the boss is empty');
  const near = MAP.revealable(M)[0];
  h.eq(MAP.pathToReveal(M, near.q, near.r).length, 0, 'an adjacent hidden tile is empty (one-tap reveal)');
  // The boss's far neighbour must go around, never through the boss.
  const bn = MAP.neighbors(M, M.boss.q, M.boss.r).map(([q, r]) => M.tiles[MAP.key(q, r)]);
  for (const t of bn) {
    const path = MAP.pathToReveal(M, t.q, t.r);
    h.ok(path.length > 0 && !path.some(([q, r]) => q === M.boss.q && r === M.boss.r), 'boss neighbour path avoids the boss');
  }
  // Once the boss is visited it is a foothold like any lit tile.
  const V = genL(5);
  V.tiles[MAP.key(V.boss.q, V.boss.r)].visited = true;
  const far = bn[0];
  h.eq(MAP.pathToReveal(V, far.q, far.r).length, 0, 'next to a visited boss counts as adjacent');
  // Paths grow from the whole lit area, not just pos.
  const G = genL(6);
  const tgt = tilesOf(G).find(t => !t.revealed && colOf(t.q, t.r) === 3 && t.r === 3);
  const before = MAP.pathToReveal(G, tgt.q, tgt.r).length;
  for (const t of MAP.revealable(G)) t.revealed = true;
  const after = MAP.pathToReveal(G, tgt.q, tgt.r).length;
  h.ok(after < before, 'a wider lit area shortens the path (' + before + ' -> ' + after + ')');
});

h.test('terrain paths: sea impassable, fords cost 2, cheapest by ink', () => {
  let checked = 0, fordPaths = 0;
  for (let s = 1; s <= 12; s++) {
    const M = world(s * 211);
    let bad = 0;
    for (const t of tilesOf(M)) {
      const path = MAP.pathToReveal(M, t.q, t.r);
      if (t.terrain === 'sea') { if (path.length || MAP.canReveal(M, t.q, t.r) || MAP.revealCost(t) !== Infinity) bad++; continue; }
      const lit = MAP.neighbors(M, t.q, t.r).some(([q, r]) => { const n = M.tiles[MAP.key(q, r)]; return n.revealed && (n.type !== 'boss' || n.visited); });
      if (t.revealed || t.type === 'boss' || lit) { if (path.length) bad++; continue; }
      const want = inkTo(M, t);
      if (want === Infinity) { if (path.length) bad++; continue; }
      if (!path.length) { bad++; continue; }
      if (path.some(([q, r]) => M.tiles[MAP.key(q, r)].terrain === 'sea')) bad++;
      if (MAP.pathCost(M, path) !== want) bad++;
      if (path.some(([q, r]) => M.tiles[MAP.key(q, r)].terrain === 'shallow')) fordPaths++;
      checked++;
    }
    h.eq(bad, 0, 'world ' + s + ': every path is the cheapest by ink, never over the sea (bad=' + bad + ')');
  }
  h.ok(checked > 2000 && fordPaths > 50, `checked ${checked} paths, ${fordPaths} cross a ford`);
  h.eq(MAP.revealCost({ terrain: 'shallow' }), 2, 'revealCost of a ford is 2');
  h.eq(MAP.revealCost({ terrain: 'land' }), 1, 'revealCost of land is 1');
  h.eq(MAP.moveCost({ terrain: 'shallow' }), 2, 'moveCost of a ford is 2');
  h.eq(MAP.moveCost({ terrain: 'land' }), 0, 'walking land is free');
  h.eq(MAP.moveCost({ terrain: 'sea' }), Infinity, 'sea is never walked');
});

h.test('fords: reveal and wade at 2 ink, revealPath spends pathCost', () => {
  // A world where a ford is next to the light: put the light there ourselves.
  const M = world(77);
  const ford = tilesOf(M).find(t => t.terrain === 'shallow');
  const shore = MAP.neighbors(M, ford.q, ford.r).map(([q, r]) => M.tiles[MAP.key(q, r)]).find(t => isLand(t));
  h.ok(ford && shore, 'a ford with a land shore');
  shore.revealed = true; M.revealedCount++;
  M.ink = 1;
  h.ok(!MAP.canReveal(M, ford.q, ford.r) && MAP.reveal(M, ford.q, ford.r) === null, '1 ink cannot reveal a ford');
  h.ok(!MAP.revealable(M).includes(ford) && MAP.revealable(M, { brush: true }).includes(ford), 'revealable() lists it only when the ink or a brush allows');
  M.ink = 2;
  h.ok(MAP.reveal(M, ford.q, ford.r) === ford && ford.revealed && M.ink === 0, 'revealing a ford spends 2 ink');
  // Wading: adjacent + revealed is not enough, the ink must be there too.
  M.pos = { q: shore.q, r: shore.r };
  M.ink = 1;
  h.ok(!MAP.canMove(M, ford.q, ford.r) && MAP.move(M, ford.q, ford.r) === null && !MAP.reachable(M).includes(ford), '1 ink cannot wade');
  M.ink = 3;
  h.ok(MAP.reachable(M).includes(ford), 'with 2+ ink the ford is reachable');
  h.ok(MAP.move(M, ford.q, ford.r) === ford && M.pos.q === ford.q && M.ink === 1 && ford.visited, 'wading spends 2 ink');
  const back = MAP.move(M, shore.q, shore.r);
  h.ok(back === shore && M.ink === 1, 'stepping back onto land is free');
  h.eq(MAP.walkCost(M, shore, ford), 2, 'walkCost counts the ford');
  h.ok(MAP.pathExists(M, shore, ford, { ink: 2 }) && !MAP.pathExists(M, shore, ford, { ink: 1 }), 'pathExists honours an ink budget');
  // A painted path over a ford costs len + 1 (the ford counts double).
  const N = world(78);
  const isle = MAP.islandsOf(N)[0].map(k => N.tiles[k]);
  const tgt = isle.find(t => MAP.pathToReveal(N, t.q, t.r).length > 0);
  const path = MAP.pathToReveal(N, tgt.q, tgt.r);
  const fords = path.filter(([q, r]) => N.tiles[MAP.key(q, r)].terrain === 'shallow').length;
  h.ok(fords >= 1, 'the island path crosses a ford');
  const cost = MAP.pathCost(N, path);
  h.eq(cost, path.length + fords, 'pathCost = tiles + fords');
  N.ink = cost - 1;
  h.eq(MAP.revealPath(N, path), null, 'one ink short refuses');
  h.ok(path.every(([q, r]) => !N.tiles[MAP.key(q, r)].revealed) && N.ink === cost - 1, 'refusal reveals and spends nothing');
  N.ink = cost + 3;
  const got = MAP.revealPath(N, path);
  h.ok(got && got.length === path.length && N.ink === 3, 'revealPath spends exactly pathCost');
  h.eq(MAP.revealPath(N, [[N.tiles[Object.keys(N.tiles).find(k => N.tiles[k].terrain === 'sea')].q, N.tiles[Object.keys(N.tiles).find(k => N.tiles[k].terrain === 'sea')].r]]), null, 'a sea step is refused');
  // Brushes skip the sea.
  const Bm = world(79);
  const seaEdge = tilesOf(Bm).find(t => !t.revealed && t.terrain !== 'sea' && MAP.neighbors(Bm, t.q, t.r).some(([q, r]) => Bm.tiles[MAP.key(q, r)].terrain === 'sea'));
  for (const [q, r] of MAP.neighbors(Bm, seaEdge.q, seaEdge.r)) if (isLand(Bm.tiles[MAP.key(q, r)])) { Bm.tiles[MAP.key(q, r)].revealed = true; break; }
  Bm.brushes = ['splash'];
  const painted = MAP.brush(Bm, 'splash', seaEdge.q, seaEdge.r);
  h.ok(painted && painted.length >= 1 && painted.every(t => t.terrain !== 'sea'), 'a splash over the shore never reveals sea');
  h.ok(tilesOf(Bm).every(t => t.terrain !== 'sea' || !t.revealed), 'sea stays hidden');
  const seaT = tilesOf(Bm).find(t => t.terrain === 'sea' && MAP.neighbors(Bm, t.q, t.r).some(([q, r]) => Bm.tiles[MAP.key(q, r)].revealed));
  Bm.brushes = ['splash'];
  h.ok(seaT && !MAP.canBrush(Bm, 'splash', seaT.q, seaT.r), 'a brush cannot target the sea');
});

h.test('revealPath spends exactly path.length ink and refuses when short', () => {
  const M = genL(111);
  const far = tilesOf(M).find(t => !t.revealed && colOf(t.q, t.r) === 4 && t.r === 1);
  const path = MAP.pathToReveal(M, far.q, far.r);
  h.ok(path.length >= 3, 'a multi-tile path (' + path.length + ')');
  M.ink = path.length - 1;
  h.eq(MAP.revealPath(M, path), null, 'refuses with one ink short');
  h.eq(M.ink, path.length - 1, 'refusal spends nothing');
  h.ok(path.every(([q, r]) => !M.tiles[MAP.key(q, r)].revealed), 'refusal reveals nothing');
  M.ink = path.length + 2;
  const before = M.revealedCount;
  const got = MAP.revealPath(M, path);
  h.ok(Array.isArray(got) && got.length === path.length, 'reveals every tile on the path');
  h.eq(M.ink, 2, 'spends exactly path.length ink');
  h.eq(M.revealedCount, before + path.length, 'revealedCount in sync');
  h.ok(far.revealed && path.every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), 'target and path lit');
  h.eq(MAP.pathToReveal(M, far.q, far.r).length, 0, 'the target is revealed now');
  h.eq(MAP.revealPath(M, path), null, 'a second paint of the same path is refused');
  h.eq(MAP.revealPath(M, []), null, 'empty path refused');
  h.eq(MAP.revealPath(M, null), null, 'null path refused');
  // A broken chain (a gap) is refused whole.
  const N = genL(112);
  const t2 = tilesOf(N).find(t => !t.revealed && colOf(t.q, t.r) === 4 && t.r === 5);
  const p2 = MAP.pathToReveal(N, t2.q, t2.r);
  const gap = p2.slice(0, 1).concat(p2.slice(2));
  const ink0 = N.ink;
  h.eq(MAP.revealPath(N, gap), null, 'a path with a gap is refused');
  h.eq(N.ink, ink0, 'and costs nothing');
  h.ok(MAP.revealPath(N, p2) !== null, 'the intact path paints');
  // Painting through the boss is refused.
  const B = genL(113);
  h.eq(MAP.revealPath(B, [[B.boss.q, B.boss.r]]), null, 'boss tile refused');
});

h.test("orient 'v': transposed positions, flat-top corners, fit", () => {
  const M = gen(121);
  // Every tile round-trips, neighbours keep their spacing, the transform is (x, y) -> (y, -x).
  for (const size of [9, 23.5, 41.8]) {
    let bad = 0, badT = 0, badDist = 0, badEdge = 0;
    for (const t of tilesOf(M)) {
      const ph = MAP.toPixel(t.q, t.r, size), pv = MAP.toPixel(t.q, t.r, size, 'v');
      if (Math.abs(pv.x - ph.y) > 1e-9 || Math.abs(pv.y + ph.x) > 1e-9) badT++;
      const b = MAP.fromPixel(pv.x, pv.y, size, 'v');
      if (b.q !== t.q || b.r !== t.r) bad++;
      for (const [q, r] of MAP.neighbors(M, t.q, t.r)) {
        const n = MAP.toPixel(q, r, size, 'v');
        if (Math.abs(Math.hypot(n.x - pv.x, n.y - pv.y) - SQRT3 * size) > 1e-9) badDist++;
      }
      // Flat-top: edges face 30, 90, ... degrees; just inside stays, just past lands on a neighbour.
      const inr = SQRT3 / 2 * size;
      for (let i = 0; i < 6; i++) {
        const ae = Math.PI / 6 + (Math.PI / 3) * i;
        const e = MAP.fromPixel(pv.x + Math.cos(ae) * inr * 0.97, pv.y + Math.sin(ae) * inr * 0.97, size, 'v');
        if (e.q !== t.q || e.r !== t.r) badEdge++;
        const o = MAP.fromPixel(pv.x + Math.cos(ae) * inr * 1.03, pv.y + Math.sin(ae) * inr * 1.03, size, 'v');
        if (!adj(t, o)) badEdge++;
      }
    }
    h.eq(badT, 0, `v is the transposed h layout at size ${size}`);
    h.eq(bad, 0, `v centres round trip at size ${size}`);
    h.eq(badDist, 0, `v neighbour centres sqrt3*size apart (size ${size})`);
    h.eq(badEdge, 0, `v edge points stay inside / cross to the neighbour (size ${size})`);
  }
  // Start at the bottom middle, boss at the top middle, same x.
  const ps = MAP.toPixel(M.start.q, M.start.r, 20, 'v'), pb = MAP.toPixel(M.boss.q, M.boss.r, 20, 'v');
  h.ok(Math.abs(ps.x - pb.x) < 1e-9 && pb.y < ps.y, 'start below the boss on the same column of pixels');
  h.ok(tilesOf(M).every(t => MAP.toPixel(t.q, t.r, 20, 'v').y <= ps.y + 1e-9 + SQRT3 * 20 / 2), 'nothing far below the start');
  // Corners: v is the pointy-top hex turned 30 degrees (flat-top).
  const ch = MAP.hexCorners(0, 0, 10), cv = MAP.hexCorners(0, 0, 10, 'v');
  h.eq(cv.length, 6, '6 corners');
  h.ok(cv.every(p => Math.abs(Math.hypot(p.x, p.y) - 10) < 1e-9), 'corners at radius size');
  h.ok(cv.some(p => Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y) < 1e-9), 'flat top: a corner points right');
  h.ok(!cv.some(p => Math.abs(p.y + 10) < 1e-9 && Math.abs(p.x) < 1e-9), 'no corner points straight up');
  const rot = ch.map(p => ({ x: p.x * Math.cos(Math.PI / 6) - p.y * Math.sin(Math.PI / 6), y: p.x * Math.sin(Math.PI / 6) + p.y * Math.cos(Math.PI / 6) }));
  h.ok(rot.every(r => cv.some(c => Math.hypot(c.x - r.x, c.y - r.y) < 1e-9)), 'v corners = h corners rotated by 30 degrees');
  // Fit: transposed extents inside the box with the margin, centred, as large as allowed.
  const mg = MAP.FIT_MARGIN;
  for (const [cols, rows] of [[10, 7], [9, 5], [16, 9]]) {
    const Mx = gen(122, { cols, rows });
    for (const [w, hh, max] of [[540, 768, 0], [540, 768, 44], [540, 960, 30], [320, 320, 0]]) {
      const f = MAP.size(Mx, w, hh, 'v', max);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const t of tilesOf(Mx)) {
        const p = MAP.toPixel(t.q, t.r, f.size, 'v');
        for (const c of MAP.hexCorners(p.x + f.ox, p.y + f.oy, f.size, 'v')) {
          x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
        }
      }
      const tag = `v ${cols}x${rows} in ${w}x${hh} max ${max}`;
      h.ok(x0 >= mg - 1e-6 && x1 <= w - mg + 1e-6 && y0 >= mg - 1e-6 && y1 <= hh - mg + 1e-6, tag + ' fits with the margin');
      h.ok(Math.abs(x0 - (w - x1)) < 1e-6 && Math.abs(y0 - (hh - y1)) < 1e-6, tag + ' is centred');
      if (max) h.ok(f.size <= max + 1e-9, tag + ' respects the cap');
      if (!max || f.size < max - 1e-9) h.ok(Math.abs(x0 - mg) < 1e-6 || Math.abs(y0 - mg) < 1e-6, tag + ' is as large as it can be');
    }
  }
  const f = MAP.size(gen(123), 540, 768, 'v', 44);
  h.ok(f.size >= 40 && f.size <= 44, 'default map on the stage map area gives 40..44 px hexes (got ' + f.size.toFixed(2) + ')');
  h.ok(f.size > MAP.size(gen(123), 540, 768).size * 1.3, 'the climb is much bigger than the landscape fit');
});

h.test('bounds(): the world box the camera pans over', () => {
  const M = world(7);
  for (const orient of ['v', 'h']) {
    const b = MAP.bounds(M, 46, orient);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const t of tilesOf(M)) {
      const p = MAP.toPixel(t.q, t.r, 46, orient);
      for (const c of MAP.hexCorners(p.x + b.ox, p.y + b.oy, 46, orient)) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); }
    }
    h.ok(Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-6, orient + ': the box starts at the origin');
    h.ok(Math.abs(x1 - b.w) < 1e-6 && Math.abs(y1 - b.h) < 1e-6, orient + ': w x h is the exact extent');
  }
  const v = MAP.bounds(M, 46, 'v');
  h.ok(v.w > 1500 && v.w < 1580 && v.h > 1280 && v.h < 1340, `16x22 at 46 px is about 1540 x 1310 (${v.w.toFixed(0)} x ${v.h.toFixed(0)}), far bigger than the 540 x 768 map area`);
  const ps = MAP.toPixel(M.start.q, M.start.r, 46, 'v'), pb = MAP.toPixel(M.boss.q, M.boss.r, 46, 'v');
  h.ok(Math.abs(ps.x - pb.x) < 1e-9 && pb.y < ps.y && pb.y + v.oy > 0 && ps.y + v.oy < v.h, 'start at the bottom, boss at the top, same column of pixels');
});

/* Stub DATA: proves map.js reads DATA.BRUSHES lazily (and overrides the
   fallback), and fills enc/event/brush content from DATA. */
h.test('stub DATA path', () => {
  const stub = `const DATA = {
    BRUSHES: {
      line3: { id: 'line3', cells: (q, r) => [[q, r], [q, r + 1]] },
      dot: { id: 'dot', cells: (q, r) => [[q, r]] },
    },
    ENCOUNTERS: { 1: { normal: [['rat'], ['slime'], ['bat', 'bat']], elite: [['mimic']], boss: [['hoard']] } },
    EVENTS: { a: {}, b: {}, c: {} },
  };`;
  const src = source(['util', 'map']).replace('const MAP =', stub + '\nconst MAP =') + '\n;return { U, MAP };';
  const S = new Function(src)();
  const M = S.MAP.generate({ act: 1, rng: S.U.rng(123), cols: 10, rows: 7 });
  const P = gen(123);
  h.eq(tilesOf(M).map(t => t.type + t.terrain).join(), tilesOf(P).map(t => t.type + t.terrain).join(), 'layout and terrain identical with and without DATA');
  const tiles = tilesOf(M);
  h.ok(tiles.filter(t => t.type === 'fight').every(t => ['rat', 'slime', 'bat'].includes(t.content.enc[0])), 'fights get normal encounters');
  h.ok(tiles.filter(t => t.type === 'elite').every(t => t.content.enc[0] === 'mimic' && t.content.elite), 'elites get elite encounters');
  h.eq(S.MAP.tileAt(M, M.boss.q, M.boss.r).content.enc.join(), 'hoard', 'boss gets the boss encounter');
  h.ok(tiles.filter(t => t.type === 'event').every(t => ['a', 'b', 'c'].includes(t.content.event)), 'events get event ids');
  h.ok(tiles.filter(t => t.type === 'brush').every(t => ['line3', 'dot'].includes(t.content.brush)), 'brush tiles use DATA brush ids');
  const tgt = S.MAP.revealable(M).find(t => t.r < M.rows - 1);
  M.brushes = ['line3', 'dot'];
  const got = S.MAP.brush(M, 'line3', tgt.q, tgt.r);
  const exp = [[tgt.q, tgt.r], [tgt.q, tgt.r + 1]].filter(([q, r]) => !P.tiles[MAP.key(q, r)].revealed);
  h.eq(got.map(t => S.MAP.key(t.q, t.r)).sort().join(' '), exp.map(([q, r]) => MAP.key(q, r)).sort().join(' '), 'DATA.BRUSHES shape wins over the fallback');
  h.ok(M.brushes.join() === 'dot', 'DATA brush consumed');
  const other = S.MAP.revealable(M, { brush: true })[0];
  h.eq(S.MAP.brush(M, 'line3', other.q, other.r), null, 'a spent DATA brush is refused');
});

/* Real data.js, when the data module has landed. */
const dataPath = path.join(DIR, 'js', 'data.js');
if (fs.existsSync(dataPath)) {
  h.test('real DATA.BRUSHES path', () => {
    const R = boot({ only: ['util', 'data', 'map'] });
    const D = R.DATA;
    h.ok(D && D.BRUSHES, 'DATA.BRUSHES present');
    for (let s = 1; s <= 30; s++) checkMap(R.MAP.generate({ act: 1 + (s % 3), rng: R.U.rng(s * 31) }), 'data seed ' + s, D);
    for (const id of Object.keys(D.BRUSHES)) {
      const M = R.MAP.generate({ act: 1, rng: R.U.rng(500) });
      const tgt = R.MAP.revealable(M)[0];
      brushCase(M, id, tgt, D.BRUSHES[id].cells(tgt.q, tgt.r), 'DATA ' + id, R.MAP);
    }
  });
}

h.done();
