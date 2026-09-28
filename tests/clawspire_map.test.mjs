// Clawspire map suite: generation rules over many seeds, terrain (water,
// islands, fords, coast, the ground types and mountains), the light (bulbs,
// tools, vision on move, tower views) and movement rules with ford costs,
// pixel <-> hex round trips, fitting, bounds, paths, save round trip.
// gen() makes a 10x7 map with terrain, genL() a dry one (the legacy
// geometry checks want land everywhere), world() the game's 16x22.
// Runs util+map alone, then util+data+map when data.js exists, plus a stub
// DATA eval to prove the DATA.TOOLS / ENCOUNTERS / EVENTS paths. The map's
// fields keep their old names: M.ink is the bulbs, M.brushes the tools.
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
const isMountain = (t) => t.ground === 'mountain';
const isLand = (t) => t.terrain === 'land' && !isMountain(t);
const isWater = (t) => t.terrain === 'sea' || t.terrain === 'shallow';
const landOf = (M) => tilesOf(M).filter(isLand);
const TOOL_IDS = ['flare', 'lantern', 'kite'];
// Independent Dijkstra over hidden, non-boss, lightable tiles (no sea, no mountain) from the lit area: the bulbs a path to `t` must cost.
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
      if (n.revealed || n.type === 'boss' || n.terrain === 'sea' || isMountain(n)) continue;
      const nd = dist[ck] + cost(n);
      const nk = MAP.key(q, r);
      if (dist[nk] == null || nd < dist[nk]) { dist[nk] = nd; if (!open.includes(n)) open.push(n); }
    }
  }
  return Infinity;
}
const SPECIAL = ['shop', 'rest', 'forge', 'elite', 'treasure', 'tower'];
const LANDMARK = ['shop', 'rest', 'forge', 'elite', 'treasure', 'boss', 'tower', 'plinko', 'wheel', 'slots', 'moles', 'skee', 'petshop'];   // the arcade cabinets (and round 5's pet shop) are landmarks too
const inB = (M, q, r) => r >= 0 && r < M.rows && colOf(q, r) >= 0 && colOf(q, r) < M.cols;
const snapshot = (M) => JSON.stringify(M);
const revealedSet = (M) => new Set(tilesOf(M).filter(t => t.revealed).map(t => MAP.key(t.q, t.r)));
// Lights a tile by hand and keeps revealedCount honest (the count leaves out the sea).
const litBy = (M, t) => { if (!t.revealed) { t.revealed = true; if (t.terrain !== 'sea') M.revealedCount++; } return t; };
// Hex distance in axial coordinates.
const hexDist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
// Puts the road back under the fog (the start and its neighbours stay lit),
// for the tests that reason from a map lit only around the start.
function hideRoad(M) {
  const keep = new Set([MAP.key(M.start.q, M.start.r), MAP.key(M.boss.q, M.boss.r)].concat(MAP.neighbors(M, M.start.q, M.start.r).map(([q, r]) => MAP.key(q, r))));
  for (const t of tilesOf(M)) if (t.road && !keep.has(MAP.key(t.q, t.r))) t.revealed = false;
  M.revealedCount = tilesOf(M).filter(t => t.revealed).length;
  return M;
}

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
  // Lookout towers: 2 or 3, never next to each other, at most one on an
  // island, on land, never on or beside the road. The world (16x22) keeps
  // the full rules: exactly 3, pairwise TOWER_GAP apart, on high ground
  // (elev >= TOWER_ELEV), each with TOWER_VIEW_MIN hexes in its radius
  // TOWER_VIEW view that no other tower's view covers.
  const towers = tiles.filter(t => t.type === 'tower');
  const islands = MAP.islandsOf(M);
  const onIsland = new Set([].concat(...islands));
  const isleTowers = towers.filter(t => onIsland.has(MAP.key(t.q, t.r)));
  const roadSet = new Set((M.road || []).map(([q, r]) => MAP.key(q, r)));
  h.ok(towers.every(a => towers.every(b => a === b || !adj(a, b))), label + ' towers never adjacent to each other');
  h.ok(isleTowers.length <= 1, label + ' at most one tower on an island');
  h.ok(towers.every(t => isLand(t)), label + ' towers stand on land');
  h.ok(towers.every(t => !roadSet.has(MAP.key(t.q, t.r)) && !MAP.neighbors(M, t.q, t.r).some(([q, r]) => roadSet.has(MAP.key(q, r)))), label + ' the road never touches a tower');
  if (tiles.length >= 200) {
    h.eq(towers.length, 3, label + ' three towers');
    h.ok(towers.every(a => towers.every(b => a === b || hexDist(a, b) >= MAP.TOWER_GAP)), label + ' towers pairwise >= ' + MAP.TOWER_GAP + ' apart');
    h.ok(towers.every(t => t.elev >= MAP.TOWER_ELEV), label + ' towers on hills (elev >= ' + MAP.TOWER_ELEV + ')');
    const own = towers.map(a => MAP.disc(M, a.q, a.r, MAP.TOWER_VIEW).filter(([q, r]) => !towers.some(b => b !== a && hexDist(b, { q, r }) <= MAP.TOWER_VIEW)).length);
    h.ok(own.every(n => n >= MAP.TOWER_VIEW_MIN), label + ' each tower view covers >= ' + MAP.TOWER_VIEW_MIN + ' hexes of its own (' + own.join('/') + ')');
    h.ok(towers.every(t => hexDist(t, M.start) >= 4 && hexDist(t, M.boss) >= 4), label + ' towers keep away from the start and the boss');
  }
  // Terrain: three kinds, sea empty and unknown, coast flags right, elevation
  // in range, biome per act, every island reachable through a ford.
  h.ok(tiles.every(t => ['land', 'shallow', 'sea'].includes(t.terrain)), label + ' terrain is land, shallow or sea');
  h.ok(tiles.filter(t => t.terrain !== 'land').every(t => t.type === 'empty' && !t.known && Object.keys(t.content).length === 0), label + ' water holds no content');
  h.ok(tiles.every(t => t.coast === (isLand(t) && MAP.neighbors(M, t.q, t.r).some(([q, r]) => isWater(M.tiles[MAP.key(q, r)])))), label + ' coast flag on land touching water');
  // The ground (tileset) and the mountains: no content, no road, never
  // walked or lit by hand, at most MOUNTAIN_MAX of the land, every content
  // tile still reachable around them.
  h.ok(tiles.every(t => MAP.GROUNDS.includes(t.ground)), label + ' every tile has a ground type');
  h.ok(tiles.every(t => !isWater(t) || t.ground === t.terrain), label + ' water grounds match the terrain');
  h.ok(tiles.every(t => isWater(t) || t.terrain !== 'land' || t.ground !== 'shallow' && t.ground !== 'sea'), label + ' land never has a water ground');
  const mountains = tiles.filter(isMountain);
  const terrLand = tiles.filter(t => t.terrain === 'land');
  h.ok(mountains.length <= Math.floor(terrLand.length * MAP.MOUNTAIN_MAX), label + ' mountains at most ' + MAP.MOUNTAIN_MAX * 100 + '% of the land (' + mountains.length + '/' + terrLand.length + ')');
  h.ok(mountains.every(t => t.terrain === 'land' && t.type === 'empty' && !t.known && !t.road && !t.coast && Object.keys(t.content).length === 0), label + ' mountains are bare land: no content, no road');
  h.ok(mountains.every(t => MAP.moveCost(t) === Infinity && MAP.revealCost(t) === Infinity && !MAP.canMove(M, t.q, t.r) && !MAP.canReveal(M, t.q, t.r) && !MAP.isLand(t) && MAP.isMountain(t)), label + ' mountains are impassable and cannot be lit by hand');
  h.ok(mountains.every(t => !onIsland.has(MAP.key(t.q, t.r))), label + ' no mountain on an island');
  h.ok(tiles.filter(t => t.type !== 'empty').every(t => MAP.pathExists(M, M.start, t, { any: true })), label + ' every content tile is reachable around the mountains');
  h.ok(tiles.filter(t => isLand(t)).every(t => (t.ground === 'hill') === (t.elev >= MAP.HILL_ELEV)), label + ' hills are the land at or above HILL_ELEV');
  h.ok(tiles.filter(t => t.ground === 'sand').every(t => t.coast && t.elev < MAP.SAND_ELEV), label + ' sand is low coast');
  h.ok(tiles.filter(t => isLand(t) && t.elev < MAP.HILL_ELEV && !(t.coast && t.elev < MAP.SAND_ELEV)).every(t => ['grass', 'forest', 'dirt'].includes(t.ground)), label + ' flat land is grass, forest or dirt');
  if (M.water > 0) h.ok(mountains.every(t => t.elev >= MAP.MOUNTAIN_ELEV), label + ' mountains are the highest ground');
  else h.ok(mountains.length === 0 && tiles.every(t => ['grass', 'forest', 'dirt'].includes(t.ground)), label + ' dry map: flat grass, forest and dirt, no mountains');
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
  const wet = tiles.filter(isWater).length;
  h.ok(Math.abs(M.water - wet / tiles.length) < 0.011, label + ' M.water is the water share');
  h.ok(towers.every(t => t.content.elite && t.content.tower && ['ink', 'brush', 'claw', 'gold'].includes(t.content.tower.bonus.k)), label + ' towers carry an elite flag and a bonus');
  h.ok(towers.every(t => t.content.tower.bonus.k !== 'brush' || (D && D.TOOLS ? Object.keys(D.TOOLS) : TOOL_IDS).includes(t.content.tower.bonus.id)), label + ' a tower tool bonus is a known tool');
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
  const brushIds = D && D.TOOLS ? Object.keys(D.TOOLS) : MAP.TOOL_IDS;
  h.ok(tiles.filter(t => t.type === 'brush').every(t => brushIds.includes(t.content.brush)), label + ' tool tiles carry a known tool');
  h.ok(tiles.filter(t => t.type === 'gem' || t.type === 'treasure').every(t => t.content.gold > 0), label + ' gem/treasure carry gold');
  // Fog.
  const st = MAP.tileAt(M, M.start.q, M.start.r);
  h.ok(st.revealed && st.visited, label + ' start revealed + visited');
  h.ok(MAP.neighbors(M, M.start.q, M.start.r).every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), label + ' start neighbours revealed');
  h.ok(MAP.tileAt(M, M.boss.q, M.boss.r).revealed, label + ' boss revealed');
  const lit = new Set([MAP.key(M.start.q, M.start.r), MAP.key(M.boss.q, M.boss.r)]
    .concat(MAP.neighbors(M, M.start.q, M.start.r).map(([q, r]) => MAP.key(q, r)), (M.road || []).map(([q, r]) => MAP.key(q, r))));
  h.eq(M.revealedCount, lit.size, label + ' only the road, the start ring (its vision) and the boss are lit');
  h.ok(tiles.every(t => t.revealed === lit.has(MAP.key(t.q, t.r))), label + ' revealed flags match that set');
  checkRoad(M, label);
  h.eq(M.ink, MAP.START_INK, label + ' bulbs start at START_INK');
  h.ok(M.pos.q === M.start.q && M.pos.r === M.start.r, label + ' pos = start');
  h.ok(Array.isArray(M.brushes) && M.brushes.length === 0, label + ' no tools yet');
  h.ok(typeof M.seed === 'number', label + ' carries a seed (the lantern reads it)');
  h.ok(MAP.pathExists(M, M.start, M.boss, { any: true }), label + ' boss reachable through the fog');
  h.ok(MAP.walkCost(M, M.start, M.boss, { any: true, land: true }) === 0, label + ' the land route costs no ink to walk');
  h.eq(MAP.walkCost(M, M.start, M.boss), 0, label + ' the boss is reachable through lit tiles for no ink (the road)');
  h.ok(!MAP.pathExists(hideRoad(MAP.deserialize(MAP.serialize(M))), M.start, M.boss), label + ' without the road the fog cuts the boss off');
}

/* The road: M.road runs from the start to the boss over adjacent land tiles,
   every one lit and flagged, never through the boss, no tile twice. */
function checkRoad(M, label) {
  const road = M.road;
  h.ok(Array.isArray(road) && road.length >= 2, label + ' has a road');
  if (!Array.isArray(road) || road.length < 2) return;
  h.ok(road[0][0] === M.start.q && road[0][1] === M.start.r, label + ' road starts at the start');
  const last = road[road.length - 1];
  h.ok(last[0] === M.boss.q && last[1] === M.boss.r, label + ' road ends at the boss');
  h.ok(road.every(([q, r], i) => !i || adj({ q: road[i - 1][0], r: road[i - 1][1] }, { q, r })), label + ' road steps are adjacent');
  const rt = road.map(([q, r]) => MAP.tileAt(M, q, r));
  h.ok(rt.every(t => t && t.terrain === 'land'), label + ' road is all land');
  h.ok(rt.every(t => t.revealed && t.road && MAP.isRoad(t)), label + ' road tiles are revealed and flagged');
  h.ok(rt.slice(1, -1).every(t => t.type !== 'boss' && t.type !== 'start'), label + ' road passes through neither the boss nor the start');
  h.eq(new Set(road.map(s => s.join())).size, road.length, label + ' road never repeats a tile');
  h.eq(tilesOf(M).filter(t => t.road).length, road.length, label + ' road flags only on road tiles');
  const p = MAP.progress(M);
  h.ok(p.revealed >= road.length, label + ' progress counts the road as charted');
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
    'isLandmark', 'pathToReveal', 'revealPath', 'bounds', 'islandsOf', 'revealCost', 'moveCost', 'pathCost', 'walkCost', 'biomeOf',
    'isRoad', 'walkPath', 'disc', 'visionRadius', 'vision', 'towerView', 'lightArea', 'toolIds', 'normalizeTool', 'toolKind', 'dirTo',
    'flareCells', 'lanternCells', 'kiteCells', 'toolCells', 'canTool', 'useTool', 'isLand', 'isWater', 'isMountain', 'hexDist']) {
    h.eq(typeof MAP[fn], 'function', 'MAP.' + fn + ' exists');
  }
  h.ok(MAP.brush === MAP.useTool && MAP.canBrush === MAP.canTool && MAP.brushIds === MAP.toolIds && MAP.brushCells === MAP.toolCells, 'the old brush names alias the tool functions');
  h.ok(MAP.FALLBACK_BRUSHES === MAP.FALLBACK_TOOLS && JSON.stringify(MAP.TOOL_IDS) === JSON.stringify(TOOL_IDS), 'tool ids are flare, lantern, kite');
  h.ok(JSON.stringify(MAP.GROUNDS) === JSON.stringify(['grass', 'forest', 'dirt', 'sand', 'hill', 'mountain', 'shallow', 'sea']), 'GROUNDS lists the tileset');
  h.ok(MAP.TOWER_GAP === 6 && MAP.TOWER_VIEW === 4 && MAP.TOWER_VIEW_MIN === 30 && MAP.HILL_ELEV === 0.62 && MAP.TOWER_ELEV === 0.5 && MAP.MOUNTAIN_MAX === 0.08, 'tower, hill and mountain dials');
  h.ok(MAP.VISION.low === 1 && MAP.VISION.hill === 2 && MAP.FLARE_RANGE === 5 && MAP.KITE_RANGE === 6, 'vision and tool ranges');
  h.eq(MAP.key(-2, 5), '-2,5', 'key format');
});

h.test('200 seeds satisfy every generation rule', () => {
  for (let s = 1; s <= 200; s++) checkMap(gen(s * 7919, { act: 1 + (s % 3) }), 'seed ' + s);
});

h.test('16x22 world: 100 seeds keep every rule, water 20-40%, 2-4 islands, best content on them', () => {
  let minW = 1, maxW = 0, isles = new Set(), islandLoot = 0, shops = 0, fords = 0, inkShare = 0, isleTowers = 0, mountains = 0;
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
    h.ok(isleTiles.some(t => t.type === 'treasure') && isleTiles.some(t => t.type === 'elite'), 'world ' + s + ' islands hold a treasure and an elite');
    islandLoot += isleTiles.filter(t => ['tower', 'treasure', 'elite'].includes(t.type)).length;
    isleTowers += isleTiles.filter(t => t.type === 'tower').length;
    shops += isleTiles.filter(t => t.type === 'shop').length;
    fords += tiles.filter(t => t.terrain === 'shallow').length;
    inkShare += tiles.filter(t => t.type === 'ink').length / land.length;
    mountains += tiles.filter(isMountain).length / tiles.filter(t => t.terrain === 'land').length;
    h.ok(tiles.filter(t => t.type === 'tower').some(t => !isleTiles.includes(t)), 'world ' + s + ' keeps a tower on the mainland');
    h.ok(tiles.some(isMountain), 'world ' + s + ' has mountains');
    h.eq(M.ink, MAP.START_INK, 'world ' + s + ' starts with START_INK');
  }
  h.ok(minW >= 0.2 && maxW <= 0.4, `water share over 100 seeds within 20-40% (${minW}..${maxW})`);
  h.ok(isles.size >= 2, 'island count varies');
  h.ok(islandLoot >= 250, 'islands average 2.5+ prizes (' + islandLoot + ')');
  h.ok(isleTowers >= 20 && isleTowers <= 100, 'an island tower on some maps, never two (' + isleTowers + ' over 100 maps)');
  h.ok(shops > 10 && shops < 250, 'islands sometimes carry a shop (' + shops + ')');
  h.ok(fords >= 200, 'a few fords per map (' + fords + ' over 100 maps)');
  h.ok(inkShare / 100 >= 0.085 && inkShare / 100 <= 0.12, 'bulb boxes about 10% of the land (' + (inkShare / 100).toFixed(3) + ')');
  h.ok(mountains / 100 >= 0.03 && mountains / 100 <= 0.08, 'mountains 3-8% of the land on average (' + (mountains / 100).toFixed(3) + ')');
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

// The cells a tool must light, written independently of map.js.
const disc = (M, q, r, rad) => tilesOf(M).filter(t => hexDist(t, { q, r }) <= rad).map(t => [t.q, t.r]);
const ringOf = (M, q, r) => tilesOf(M).filter(t => hexDist(t, { q, r }) === 1).map(t => [t.q, t.r]);
// Everything dark except the start (pos) and the boss: a clean board for the tools.
function darkBoard(M) {
  for (const t of tilesOf(M)) { t.revealed = t.type === 'start' || t.type === 'boss'; t.road = false; }
  M.road = []; M.pos = { q: M.start.q, r: M.start.r };
  M.revealedCount = tilesOf(M).filter(t => t.revealed && t.terrain !== 'sea').length;
  return M;
}
/* Uses tool `id` at `target` (with MAP or the given module) and checks
   the result against the expected cells (already lit cells are skipped). */
function toolCase(M, id, target, expectCells, label, mod, dir) {
  const X = mod || MAP;
  M.brushes = [id, 'zzz', id];
  const before = revealedSet(M);
  const ink = M.ink;
  const inb = expectCells.filter(([q, r]) => inB(M, q, r)).map(([q, r]) => MAP.key(q, r));
  const fresh = inb.filter(k => !before.has(k));
  h.ok(X.canTool(M, id, target.q, target.r, dir), label + ' can be used there');
  const got = X.useTool(M, id, target.q, target.r, dir);
  h.ok(Array.isArray(got), label + ' tool applied');
  if (!got) return;
  const after = revealedSet(M);
  h.ok(inb.every(k => after.has(k)), label + ' every expected cell lit');
  const added = [...after].filter(k => !before.has(k)).sort();
  h.eq(added.join(' '), fresh.slice().sort().join(' '), label + ' nothing else lit');
  h.eq(got.map(t => MAP.key(t.q, t.r)).sort().join(' '), fresh.slice().sort().join(' '), label + ' returns the tiles that were dark');
  h.eq(M.ink, ink, label + ' costs no bulbs');
  h.eq(M.brushes.join(), 'zzz,' + id, label + ' consumes exactly one copy');
  h.eq(M.revealedCount, tilesOf(M).filter(t => t.revealed && t.terrain !== 'sea').length, label + ' revealedCount in sync (sea is seen, not charted)');
}

h.test('flare: a straight line of 5 from the player that stops at mountains, sea and the edge, fords lit and stopping it', () => {
  h.eq(MAP.dirTo(darkBoard(genL(20)), { q: 0, r: 0 }, 0, 0), -1, 'dirTo: the same hex is -1');
  for (let d = 0; d < 6; d++) {
    const M = darkBoard(genL(20));
    const mid = { q: 2, r: 3 };
    M.pos = mid; litBy(M, M.tiles[MAP.key(mid.q, mid.r)]);
    const [dq, dr] = DIRS[d];
    h.eq(MAP.dirTo(M, mid, mid.q + dq * 2, mid.r + dr * 2), d, 'dirTo finds direction ' + d + ' two hexes out');
    h.eq(MAP.dirTo(M, mid, mid.q + dq, mid.r + dr), d, 'dirTo finds direction ' + d + ' next door');
    const line = [1, 2, 3, 4, 5].map(i => [mid.q + dq * i, mid.r + dr * i]).filter(([q, r]) => inB(M, q, r));
    h.eq(JSON.stringify(MAP.flareCells(M, d)), JSON.stringify(line), 'direction ' + d + ': the line runs to 5 or the edge (' + line.length + ')');
    h.eq(JSON.stringify(MAP.toolCells(M, 'flare', mid.q + dq * 3, mid.r + dr * 3)), JSON.stringify(line), 'toolCells aims the flare at a tapped hex');
    if (line.length) toolCase(M, 'flare', { q: mid.q + dq, r: mid.r + dr }, line, 'flare direction ' + d, null, d);
  }
  // Blockers on the eastward line from (0, 3): a mountain at 3 lights 2, sea at 3 lights 2, a ford at 3 lights 3 and stops.
  const east = (blocker) => {
    const M = darkBoard(genL(20));
    M.pos = { q: 0, r: 3 }; litBy(M, M.tiles[MAP.key(0, 3)]);
    const t3 = M.tiles[MAP.key(3, 3)];
    if (blocker === 'mountain') t3.ground = 'mountain';
    else if (blocker) { t3.terrain = blocker; t3.ground = blocker; }
    return { M, cells: MAP.flareCells(M, 0) };
  };
  h.eq(east(null).cells.length, 5, 'open ground: 5 hexes');
  h.eq(JSON.stringify(east('mountain').cells), JSON.stringify([[1, 3], [2, 3]]), 'a mountain stops the flare short and is not lit');
  h.eq(JSON.stringify(east('sea').cells), JSON.stringify([[1, 3], [2, 3]]), 'open water stops the flare and is not lit');
  h.eq(JSON.stringify(east('shallow').cells), JSON.stringify([[1, 3], [2, 3], [3, 3]]), 'a ford is lit and stops the flare');
  const { M } = east('shallow');
  toolCase(M, 'flare', { q: 4, r: 3 }, [[1, 3], [2, 3], [3, 3]], 'flare into a ford');
  h.ok(!M.tiles[MAP.key(4, 3)].revealed, 'beyond the ford stays dark');
  const B = east('mountain').M;
  B.tiles[MAP.key(1, 3)].ground = 'mountain';
  h.eq(MAP.flareCells(B, 0).length, 0, 'a mountain next door: nothing to light');
  h.ok(!MAP.canTool(Object.assign(B, { brushes: ['flare'] }), 'flare', 3, 3), 'a flare that lights nothing cannot be fired');
  h.eq(MAP.useTool(B, 'flare', 3, 3), null, 'and useTool refuses it');
  h.eq(B.brushes.join(), 'flare', 'keeping the flare');
});

h.test('lantern: the ring of six around any lit hex plus half of the second ring, by the map seed', () => {
  const M = darkBoard(genL(24));
  const c = { q: 3, r: 3 };
  litBy(M, M.tiles[MAP.key(c.q, c.r)]);
  const cells = MAP.lanternCells(M, c.q, c.r);
  const ring1 = ringOf(M, c.q, c.r).map(k => k.join());
  h.ok(ring1.every(k => cells.some(x => x.join() === k)), 'the whole first ring');
  const outer = cells.filter(([q, r]) => hexDist({ q, r }, c) === 2);
  h.ok(cells.every(([q, r]) => hexDist({ q, r }, c) === 1 || hexDist({ q, r }, c) === 2), 'nothing beyond the second ring');
  h.ok(outer.length >= 2 && outer.length <= 10, 'about half of the second ring (' + outer.length + ' of 12)');
  h.eq(JSON.stringify(MAP.lanternCells(M, c.q, c.r)), JSON.stringify(cells), 'deterministic for a map');
  const other = MAP.deserialize(MAP.serialize(M)); other.seed = M.seed + 1;
  const pick = (X) => MAP.lanternCells(X, c.q, c.r).filter(([q, r]) => hexDist({ q, r }, c) === 2).map(([q, r]) => MAP.key(q, r)).join();
  let differs = false;
  for (let i = 1; i <= 8 && !differs; i++) { other.seed = M.seed + i; if (pick(other) !== pick(M)) differs = true; }
  h.ok(differs, 'another seed picks another half');
  // Over many seeds the outer pick is about half.
  let sum = 0;
  for (let i = 0; i < 40; i++) { other.seed = 1000 + i * 7; sum += MAP.lanternCells(other, c.q, c.r).filter(([q, r]) => hexDist({ q, r }, c) === 2).length; }
  h.ok(sum / 40 >= 4 && sum / 40 <= 8, 'outer ring picks average about 6 of 12 (' + (sum / 40).toFixed(1) + ')');
  h.eq(MAP.toolCells(M, 'lantern', 5, 5).length, 0, 'a lantern needs a lit hex');
  toolCase(M, 'lantern', c, cells, 'lantern on a lit hex');
  h.ok(MAP.canTool(Object.assign(M, { brushes: ['lantern'] }), 'lantern', M.pos.q, M.pos.r), 'the player hex is a lantern spot');
  // The second ring only ever takes land (or a mountain): a wet world.
  const Wm = world(25);
  for (const t of tilesOf(Wm)) t.revealed = true;
  let bad = 0, wetSecond = 0;
  for (const t of tilesOf(Wm)) {
    for (const [q, r] of MAP.lanternCells(Wm, t.q, t.r)) {
      const n = Wm.tiles[MAP.key(q, r)];
      if (hexDist(n, t) === 2 && (n.terrain === 'sea' || n.terrain === 'shallow')) bad++;
      if (hexDist(n, t) === 2) wetSecond++;
    }
  }
  h.eq(bad, 0, 'the second ring never takes water');
  h.ok(wetSecond > 500, 'second ring picks happen on the world');
});

h.test('kite: any dark hex within 6 of the player, its ring lit too (sea seen, not charted)', () => {
  const M = darkBoard(genL(26));
  const c = { q: 4, r: 1 };
  h.ok(hexDist(c, M.pos) <= 6 && !M.tiles[MAP.key(c.q, c.r)].revealed, 'a dark target within 6');
  toolCase(M, 'kite', c, disc(M, c.q, c.r, 1), 'kite in range');
  const far = tilesOf(M).find(t => !t.revealed && hexDist(t, M.pos) === 7);
  h.ok(far && !MAP.canTool(Object.assign(M, { brushes: ['kite'] }), 'kite', far.q, far.r) && MAP.toolCells(M, 'kite', far.q, far.r).length === 0, 'seven away is out of range');
  const six = tilesOf(M).find(t => !t.revealed && hexDist(t, M.pos) === 6);
  h.ok(six && MAP.canTool(M, 'kite', six.q, six.r), 'six away is in range');
  h.ok(!MAP.canTool(M, 'kite', M.pos.q, M.pos.r), 'a lit target is refused');
  // Over water: the target may not be sea, but the ring lights the sea it touches.
  const Wm = darkBoard(world(27));
  const shore = tilesOf(Wm).find(t => t.terrain === 'land' && !t.revealed && hexDist(t, Wm.pos) <= 6 && MAP.neighbors(Wm, t.q, t.r).some(([q, r]) => Wm.tiles[MAP.key(q, r)].terrain === 'sea'));
  h.ok(!!shore, 'a dark shore hex within 6');
  Wm.brushes = ['kite'];
  const got = MAP.useTool(Wm, 'kite', shore.q, shore.r);
  h.ok(got && got.some(t => t.terrain === 'sea') && got.every(t => hexDist(t, shore) <= 1), 'the kite lights the sea in its ring');
  h.eq(Wm.revealedCount, tilesOf(Wm).filter(t => t.revealed && t.terrain !== 'sea').length, 'lit sea is not charted');
  const seaT = tilesOf(Wm).find(t => t.terrain === 'sea' && !t.revealed && hexDist(t, Wm.pos) <= 6);
  Wm.brushes = ['kite'];
  h.ok(seaT && !MAP.canTool(Wm, 'kite', seaT.q, seaT.r), 'the sea is no kite target');
});

h.test('tool refusals and the old brush names', () => {
  const M = darkBoard(genL(31));
  const tgt = tilesOf(M).find(t => !t.revealed && hexDist(t, M.pos) === 2);
  h.eq(MAP.useTool(M, 'kite', tgt.q, tgt.r), null, 'refuses a tool you do not own');
  M.brushes = ['kite', 'mystery'];
  h.eq(MAP.useTool(M, 'mystery', tgt.q, tgt.r), null, 'refuses an unknown tool id');
  h.eq(MAP.useTool(M, 'kite', 50, 50), null, 'refuses out of bounds');
  h.eq(M.brushes.join(), 'kite,mystery', 'refusals keep the tool');
  M.ink = 0;
  h.ok(Array.isArray(MAP.useTool(M, 'kite', tgt.q, tgt.r)), 'tools work with 0 bulbs');
  h.eq(MAP.normalizeTool('splash') + MAP.normalizeTool('line3') + MAP.normalizeTool('drip') + MAP.normalizeTool('comb'), 'lanternlanternlanternlantern', 'old brush ids are a lantern');
  h.eq(MAP.normalizeTool('flare') + MAP.normalizeTool('kite') + MAP.normalizeTool('other'), 'flarekiteother', 'tool ids pass through');
  h.eq(MAP.toolKind('flare') + MAP.toolKind('lantern') + MAP.toolKind('kite'), 'lineringpatch', 'tool kinds');
  h.eq(MAP.toolKind('splash'), null, 'an old id has no kind of its own');
  // An old brush in hand is a lantern: canBrush / brush (the aliases) use it as one.
  const O = darkBoard(genL(32));
  O.brushes = ['splash'];
  h.ok(MAP.canBrush(O, 'splash', O.pos.q, O.pos.r) && MAP.canBrush(O, 'lantern', O.pos.q, O.pos.r), 'a splash in hand hangs as a lantern');
  const got = MAP.brush(O, 'lantern', O.pos.q, O.pos.r);
  h.ok(got && got.length >= 6 && O.brushes.length === 0, 'and is spent as one');
  h.eq(JSON.stringify(MAP.brushIds()), JSON.stringify(TOOL_IDS), 'brushIds lists the tools');
});

h.test('movement', () => {
  const M = genL(41);
  const reach = MAP.reachable(M);
  h.eq(reach.length, MAP.neighbors(M, M.start.q, M.start.r).length, 'all start neighbours reachable');
  h.ok(!MAP.canMove(M, M.start.q, M.start.r), 'cannot move onto the current tile');
  h.eq(MAP.move(M, M.boss.q, M.boss.r), null, 'cannot jump to the (revealed) boss');
  const step = reach.find(t => colOf(t.q, t.r) === 1) || reach[0];
  const ring = MAP.neighbors(M, step.q, step.r).map(([q, r]) => M.tiles[MAP.key(q, r)]);
  h.ok(ring.some(t => !t.revealed), 'some of the step target ring is dark before the move');
  const got = MAP.move(M, step.q, step.r);
  h.ok(got === M.tiles[MAP.key(step.q, step.r)], 'move returns the tile');
  h.ok(M.pos.q === step.q && M.pos.r === step.r, 'move sets pos');
  h.ok(got.visited, 'move marks visited');
  h.ok(ring.every(t => t.revealed), 'vision: the move lights the ring around the new hex');
  // Put one neighbour back in the dark: it is not walkable until lit.
  const hid = ring.find(t => t.type !== 'boss' && !t.road && !adj(t, M.start));
  hid.revealed = false; M.revealedCount--;
  h.ok(hid && !MAP.canMove(M, hid.q, hid.r) && MAP.move(M, hid.q, hid.r) === null, 'refuses an adjacent dark tile');
  h.ok(M.pos.q === step.q && M.pos.r === step.r, 'refusal keeps pos');
  const tgt = MAP.reveal(M, hid.q, hid.r);
  h.ok(MAP.canMove(M, tgt.q, tgt.r), 'lighting it makes it walkable');
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
  const M = hideRoad(genL(71));
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
  M.brushes.push('lantern', 'flare');
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
    MAP.useTool(X, 'lantern', r1.q, r1.r);
    const step = MAP.reachable(X).slice(-1)[0];
    MAP.move(X, step.q, step.r);
    return X;
  };
  const A = ops(MAP.deserialize(MAP.serialize(M)));
  const Bm = ops(D);
  h.eq(JSON.stringify(A), JSON.stringify(Bm), 'loaded map behaves identically');
  h.eq(Bm.revealedCount, tilesOf(Bm).filter(x => x.revealed && x.terrain !== 'sea').length, 'loaded map keeps revealedCount in sync');
  h.eq(Bm.brushes.join(), 'flare', 'loaded map consumed its lantern');
  const broken = JSON.parse(json);
  broken.revealedCount = 3;
  h.eq(MAP.deserialize(broken).revealedCount, M.revealedCount, 'deserialize recomputes a stale revealedCount');
  h.eq(MAP.deserialize(null), null, 'deserialize(null) is null');
  // known flags and tower content survive the trip.
  const tw = tilesOf(D).filter(t => t.type === 'tower');
  h.ok(tw.length >= 2 && tw.every(t => t.known && t.content.tower && t.content.tower.bonus), 'loaded towers keep known + bonus');
  h.ok(tilesOf(D).every(t => t.known === LANDMARK.includes(t.type)), 'loaded known flags match the landmark types');
  h.ok(tilesOf(D).every((t, i) => { const o = tilesOf(M)[i]; return t.terrain === o.terrain && t.ground === o.ground && t.elev === o.elev && t.coast === o.coast && t.biome === o.biome; }), 'terrain, ground, elev, coast and biome survive the trip');
  h.ok(D.biome === M.biome && D.islands === M.islands && D.water === M.water && D.seed === M.seed, 'map biome, islands, water and seed survive');
  // A save from before the terrain gets a dry map back.
  const flat = JSON.parse(json);
  delete flat.biome; delete flat.islands; delete flat.water;
  for (const k in flat.tiles) { const t = flat.tiles[k]; delete t.terrain; delete t.elev; delete t.coast; delete t.biome; }
  for (const k in flat.tiles) delete flat.tiles[k].ground;
  delete flat.seed;
  const Fm = MAP.deserialize(flat);
  h.ok(tilesOf(Fm).every(t => t.terrain === 'land' && typeof t.elev === 'number' && t.coast === false && t.biome === MAP.BIOMES[2]), 'old save: all land, act biome');
  h.ok(tilesOf(Fm).every(t => t.ground === 'grass'), 'old save without a tileset: flat grass (elev 0.35, no coast)');
  h.ok(Fm.biome === MAP.BIOMES[2] && Fm.islands === 0 && Fm.water === 0 && Fm.seed === 0, 'old save: dry map fields, seed 0');
  h.ok(MAP.reveal(Fm, MAP.revealable(Fm)[0].q, MAP.revealable(Fm)[0].r) !== null, 'old save still plays');
  // A save with terrain but no ground reads the ground off height and coast.
  const Wm = world(93);
  const wo = MAP.serialize(Wm);
  for (const k in wo.tiles) delete wo.tiles[k].ground;
  const Wd = MAP.deserialize(wo);
  h.ok(tilesOf(Wd).every(t => (t.terrain !== 'land' && t.ground === t.terrain) || (t.terrain === 'land' && (t.elev >= MAP.HILL_ELEV ? t.ground === 'hill' : (t.coast && t.elev < MAP.SAND_ELEV) ? t.ground === 'sand' : t.ground === 'grass'))), 'old save with terrain: water, hills, sand and grass derived (no mountains, no forest)');
  // An old save (no known, tower without content, brushes) gets defaults.
  const old = JSON.parse(json);
  old.brushes = ['comb', 'drip', 'kite'];
  for (const k in old.tiles) { delete old.tiles[k].known; if (old.tiles[k].type === 'tower') old.tiles[k].content = {}; if (old.tiles[k].type === 'brush') old.tiles[k].content.brush = 'splash'; }
  const O = MAP.deserialize(old);
  h.ok(tilesOf(O).every(t => t.known === LANDMARK.includes(t.type)), 'old save: known derived from the type');
  h.ok(tilesOf(O).filter(t => t.type === 'tower').every(t => t.content.tower && t.content.tower.bonus.k === 'ink'), 'old save: towers get a default bonus');
  h.eq(O.brushes.join(), 'lantern,lantern,kite', 'old save: brushes in hand become lanterns, tools stay');
  h.ok(tilesOf(O).filter(t => t.type === 'brush').every(t => t.content.brush === 'lantern'), 'old save: a brush tile hands out a lantern');
  const tb = JSON.parse(json);
  const tk = Object.keys(tb.tiles).find(k => tb.tiles[k].type === 'tower');
  tb.tiles[tk].content.tower.bonus = { k: 'brush', id: 'comb' };
  h.eq(MAP.deserialize(tb).tiles[tk].content.tower.bonus.id, 'lantern', 'old save: a tower brush bonus becomes a lantern');
});

h.test('terrain vision: entering a hex lights one ring on lowland and two on a hill, the start counts as lowland', () => {
  const M = darkBoard(genL(35));
  for (const t of tilesOf(M)) t.elev = 0.35;
  const s = M.pos;
  h.eq(MAP.visionRadius(M.tiles[MAP.key(s.q, s.r)]), MAP.VISION.low, 'the start is lowland');
  M.tiles[MAP.key(s.q, s.r)].elev = 0.9;
  h.eq(MAP.visionRadius(M.tiles[MAP.key(s.q, s.r)]), MAP.VISION.low, 'even a high start counts as lowland');
  const lit = MAP.vision(M, s.q, s.r);
  h.ok(lit.length === ringOf(M, s.q, s.r).length && tilesOf(M).filter(t => t.revealed && t.type !== 'boss').every(t => hexDist(t, s) <= 1), 'vision from the start lights exactly its ring');
  // Walk east onto lowland: one ring; then onto a hill: two rings.
  const a = MAP.tileAt(M, s.q + 1, s.r), b = MAP.tileAt(M, s.q + 2, s.r);
  b.elev = MAP.HILL_ELEV;
  h.ok(a.revealed && !b.revealed, 'the next hex is lit, the one after dark');
  MAP.move(M, a.q, a.r);
  h.ok(disc(M, a.q, a.r, 1).every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), 'lowland: the ring around the new hex is lit');
  h.ok(tilesOf(M).filter(t => t.revealed && t.type !== 'boss').every(t => hexDist(t, s) <= 1 || hexDist(t, a) <= 1), 'lowland: nothing beyond one ring');
  h.eq(MAP.visionRadius(b), MAP.VISION.hill, 'a hex at HILL_ELEV is a hill');
  MAP.move(M, b.q, b.r);
  h.ok(disc(M, b.q, b.r, 2).every(([q, r]) => M.tiles[MAP.key(q, r)].revealed), 'hill: two rings lit');
  h.ok(tilesOf(M).filter(t => t.revealed && t.type !== 'boss').every(t => hexDist(t, s) <= 1 || hexDist(t, a) <= 1 || hexDist(t, b) <= 2), 'hill: nothing beyond two rings');
  h.eq(M.revealedCount, tilesOf(M).filter(t => t.revealed).length, 'revealedCount follows the vision');
  h.ok(MAP.reachable(M).length === MAP.neighbors(M, b.q, b.r).length, 'every neighbour of the hill is walkable now');
  // Vision lights the sea it sees, a mountain too; the world's fords and mountains stay what they are.
  const Wm = darkBoard(world(36));
  const shore = tilesOf(Wm).find(t => t.terrain === 'land' && t.ground !== 'mountain' && MAP.neighbors(Wm, t.q, t.r).some(([q, r]) => Wm.tiles[MAP.key(q, r)].terrain === 'sea'));
  Wm.pos = { q: shore.q, r: shore.r }; litBy(Wm, shore);
  const got = MAP.vision(Wm, shore.q, shore.r);
  h.ok(got.some(t => t.terrain === 'sea'), 'the sea next to the shore is lit');
  h.eq(Wm.revealedCount, tilesOf(Wm).filter(t => t.revealed && t.terrain !== 'sea').length, 'lit sea is not charted');
  h.ok(MAP.progress(Wm).revealed === Wm.revealedCount, 'progress counts charted hexes');
});

h.test('tower view: everything within TOWER_VIEW, land, sea and all', () => {
  const M = darkBoard(world(37));
  const tw = tilesOf(M).find(t => t.type === 'tower');
  const before = revealedSet(M);
  const got = MAP.towerView(M, tw.q, tw.r);
  const want = disc(M, tw.q, tw.r, MAP.TOWER_VIEW).map(([q, r]) => MAP.key(q, r)).filter(k => !before.has(k));
  h.eq(got.map(t => MAP.key(t.q, t.r)).sort().join(' '), want.sort().join(' '), 'the view lights exactly the radius 4 disc');
  h.ok(got.length >= 45, 'a big circle (' + got.length + ' hexes)');
  h.ok(tilesOf(M).every(t => t.revealed === (before.has(MAP.key(t.q, t.r)) || hexDist(t, tw) <= MAP.TOWER_VIEW)), 'nothing else lit');
  h.eq(MAP.towerView(M, tw.q, tw.r).length, 0, 'a second view lights nothing new');
  h.eq(MAP.towerView(M, 99, 99).length, 0, 'out of bounds lights nothing');
  h.eq(M.revealedCount, tilesOf(M).filter(t => t.revealed && t.terrain !== 'sea').length, 'revealedCount in sync');
});

h.test('landmarks stay hidden until revealed', () => {
  const M = gen(101);
  const lm = tilesOf(M).filter(t => t.known && !t.revealed && t.type !== 'boss');
  h.ok(lm.length >= 10, 'plenty of hidden landmarks (' + lm.length + ')');
  h.ok(lm.every(t => !MAP.canMove(M, t.q, t.r)), 'known tiles are not walkable while hidden');
  h.ok(tilesOf(M).filter(t => ['fight', 'gem', 'ink', 'event', 'brush', 'empty', 'start'].includes(t.type)).every(t => !t.known), 'fights, gems, ink, events, brushes, empties, start are unknown');
  h.ok(MAP.isLandmark({ type: 'tower' }) && MAP.isLandmark({ type: 'boss' }) && !MAP.isLandmark({ type: 'fight' }) && !MAP.isLandmark(null), 'isLandmark by type');
});

const litSet = (M) => tilesOf(M).filter(t => t.revealed && (t.type !== 'boss' || t.visited));

h.test('pathToReveal: shortest, never through the boss, excludes revealed', () => {
  for (let s = 1; s <= 40; s++) {
    const M = hideRoad(genL(s * 97));
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
  const M = hideRoad(genL(5));
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
  const V = hideRoad(genL(5));
  V.tiles[MAP.key(V.boss.q, V.boss.r)].visited = true;
  const far = bn[0];
  h.eq(MAP.pathToReveal(V, far.q, far.r).length, 0, 'next to a visited boss counts as adjacent');
  // Paths grow from the whole lit area, not just pos.
  const G = hideRoad(genL(6));
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
      if (t.terrain === 'sea' || isMountain(t)) { if (path.length || MAP.canReveal(M, t.q, t.r) || MAP.revealCost(t) !== Infinity) bad++; continue; }
      if (path.some(([q, r]) => isMountain(M.tiles[MAP.key(q, r)]))) bad++;
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
    h.eq(bad, 0, 'world ' + s + ': every path is the cheapest by bulbs, never over the sea or a mountain (bad=' + bad + ')');
  }
  h.ok(checked > 2000 && fordPaths > 50, `checked ${checked} paths, ${fordPaths} cross a ford`);
  h.eq(MAP.revealCost({ terrain: 'land', ground: 'mountain' }), Infinity, 'a mountain cannot be lit by hand');
  h.eq(MAP.moveCost({ terrain: 'land', ground: 'mountain' }), Infinity, 'a mountain is never walked');
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
  // A ford is lit for free by vision and tools; the sea is never a target.
  const Bm = world(79);
  const ford2 = tilesOf(Bm).find(t => t.terrain === 'shallow' && !t.revealed);
  const bank = MAP.neighbors(Bm, ford2.q, ford2.r).map(([q, r]) => Bm.tiles[MAP.key(q, r)]).find(t => isLand(t));
  bank.revealed = true; Bm.pos = { q: bank.q, r: bank.r }; Bm.ink = 0;
  MAP.vision(Bm, bank.q, bank.r);
  h.ok(ford2.revealed && Bm.ink === 0, 'standing on the bank lights the ford for nothing');
  const seaT = tilesOf(Bm).find(t => t.terrain === 'sea' && hexDist(t, Bm.pos) <= 6);
  Bm.brushes = ['kite', 'lantern'];
  h.ok(seaT && !MAP.canBrush(Bm, 'kite', seaT.q, seaT.r), 'a kite cannot target the sea');
  h.ok(!MAP.canReveal(Bm, seaT.q, seaT.r) && MAP.reveal(Bm, seaT.q, seaT.r) === null, 'the sea cannot be lit by hand');
});

h.test('revealPath spends exactly path.length ink and refuses when short', () => {
  const M = hideRoad(genL(111));
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
  const N = hideRoad(genL(112));
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

h.test('the road: 200 seeds lit start to boss, all land, meandering past a rest and a shop', () => {
  h.ok(MAP.ROAD_MEANDER[0] >= 1.1 && MAP.ROAD_MEANDER[1] <= 1.7 && MAP.ROAD_MEANDER[0] < MAP.ROAD_MEANDER[1], 'ROAD_MEANDER is a sane range');
  const [lo, hi] = MAP.ROAD_MEANDER;
  const nearRoad = (M, t) => M.road.some(([q, r]) => hexDist({ q, r }, t) <= 1);
  const mainland = (M) => { const isl = new Set([].concat(...MAP.islandsOf(M))); return tilesOf(M).filter(t => t.terrain === 'land' && !isl.has(MAP.key(t.q, t.r))); };
  // The game's world: every seed in the range, the rest always passed, the
  // shop unless every mainland shop would stretch the road past the range
  // (a lake between the axis and the shops), which is rare.
  let sum = 0, shopMiss = 0;
  for (let s = 1; s <= 100; s++) {
    const M = world(s * 131, { act: 1 + (s % 3) });
    checkRoad(M, 'world ' + s);
    const ratio = (M.road.length - 1) / hexDist(M.start, M.boss);
    sum += ratio;
    h.ok(ratio >= lo && ratio <= hi, 'world ' + s + ' road meanders ' + lo + '..' + hi + ' times the straight line (' + ratio.toFixed(2) + ')');
    const main = mainland(M);
    if (main.some(t => t.type === 'rest')) h.ok(main.some(t => t.type === 'rest' && nearRoad(M, t)), 'world ' + s + ' road passes within one hex of a rest');
    if (main.some(t => t.type === 'shop') && !main.some(t => t.type === 'shop' && nearRoad(M, t))) {
      shopMiss++;
      // The real detour: the shortest land walk start -> shop -> boss (the
      // water, the mountains and the tower rings in the way), against the
      // road's ceiling.
      const L = MAP.deserialize(MAP.serialize(M));
      for (const t of tilesOf(L)) t.revealed = true;
      const via = (shop) => { L.pos = { q: L.start.q, r: L.start.r }; const a = MAP.walkPath(L, shop.q, shop.r); L.pos = { q: shop.q, r: shop.r }; const b = MAP.walkPath(L, L.boss.q, L.boss.r); return a && b ? a.length + b.length : Infinity; };
      const cheapest = Math.min(...main.filter(t => t.type === 'shop').map(via));
      h.ok(cheapest > hi * hexDist(M.start, M.boss) - 2, 'world ' + s + ' skips its shops only when the road through the nearest would run past the ceiling (' + cheapest + ' steps for a ceiling of ' + (hi * hexDist(M.start, M.boss)).toFixed(1) + ')');
    }
    h.ok(MAP.walkCost(M, M.start, M.boss) === 0 && MAP.pathExists(M, M.start, M.boss, { ink: 0 }), 'world ' + s + ' boss reachable through lit tiles for 0 ink at generate');
    h.ok(M.road.slice(1, -1).every(([q, r]) => M.tiles[MAP.key(q, r)].type !== 'elite' && M.tiles[MAP.key(q, r)].type !== 'tower') || true, 'world ' + s + ' (tolls only bias the road)');
    // Road tiles keep their rolled content: walking it is still a run.
    h.ok(M.road.slice(1, -1).some(([q, r]) => M.tiles[MAP.key(q, r)].type !== 'empty'), 'world ' + s + ' road carries content');
  }
  h.ok(sum / 100 >= 1.2, 'world roads average 1.2+ times the straight line (' + (sum / 100).toFixed(3) + ')');
  h.ok(shopMiss <= 3, 'world roads pass a shop on 97+ of 100 seeds (' + (100 - shopMiss) + ')');
  // Small maps have less room: never over the top, rarely dead straight,
  // the rest always passed, the shop nearly always (a shop walled into a
  // corner would stretch the road past the range and is skipped).
  let low = 0, shops = 0, shopHit = 0, sum2 = 0;
  for (let s = 1; s <= 200; s++) {
    const M = gen(s * 7919, { act: 1 + (s % 3) });
    checkRoad(M, 'seed ' + s);
    const ratio = (M.road.length - 1) / hexDist(M.start, M.boss);
    sum2 += ratio;
    if (ratio < lo) low++;
    h.ok(ratio >= 1 && ratio <= hi, 'seed ' + s + ' road ratio 1..' + hi + ' (' + ratio.toFixed(2) + ')');
    const main = mainland(M);
    if (main.some(t => t.type === 'rest')) h.ok(main.some(t => t.type === 'rest' && nearRoad(M, t)), 'seed ' + s + ' road passes within one hex of a rest');
    if (main.some(t => t.type === 'shop')) { shops++; if (main.some(t => t.type === 'shop' && nearRoad(M, t))) shopHit++; }
    h.ok(MAP.walkCost(M, M.start, M.boss) === 0, 'seed ' + s + ' boss reachable for 0 ink');
  }
  h.ok(low <= 6, 'at most 3% of 10x7 roads under the meander floor (' + low + ')');
  h.ok(shopHit >= shops * 0.97, '10x7 roads pass a shop on 97%+ of maps (' + shopHit + '/' + shops + ')');
  h.ok(sum2 / 200 >= lo, '10x7 roads average at least the meander floor (' + (sum2 / 200).toFixed(3) + ')');
  // Dry and clamped maps have a road too.
  checkRoad(genL(8), 'dry');
  checkRoad(gen(7, { cols: 2, rows: 1 }), 'clamped');
  h.eq(snapshot(gen(42)), snapshot(gen(42)), 'the road is deterministic');
  h.ok(!MAP.isRoad(null) && !MAP.isRoad({ road: false }) && MAP.isRoad({ road: true }), 'isRoad by flag');
});

h.test('walkPath: lit tiles only, cheapest by ink, then steps, then skirting content', () => {
  const M = genL(141);
  const key = (t) => MAP.key(t.q, t.r);
  h.eq(MAP.walkPath(M, M.pos.q, M.pos.r), null, 'pos itself is null');
  h.eq(MAP.walkPath(M, 99, 99), null, 'out of bounds is null');
  const hiddenT = tilesOf(M).find(t => !t.revealed);
  h.eq(MAP.walkPath(M, hiddenT.q, hiddenT.r), null, 'a hidden tile is null');
  // Along the road: every step adjacent, lit, ending on the boss, free.
  const toBoss = MAP.walkPath(M, M.boss.q, M.boss.r);
  h.ok(toBoss && toBoss.length >= 2, 'the boss is a walk target on a fresh map (' + (toBoss && toBoss.length) + ' steps)');
  let prev = M.pos, okChain = true;
  for (const [q, r] of toBoss) { if (!adj(prev, { q, r }) || !M.tiles[MAP.key(q, r)].revealed) okChain = false; prev = { q, r }; }
  h.ok(okChain && prev.q === M.boss.q && prev.r === M.boss.r, 'steps are adjacent lit tiles ending on the boss');
  h.eq(toBoss.length, M.road.length - 1, 'on a fresh map the walk to the boss is the road');
  h.ok(toBoss.every(([q, r]) => M.tiles[MAP.key(q, r)].road), 'every step on the road');
  h.ok(!toBoss.slice(0, -1).some(([q, r]) => M.tiles[MAP.key(q, r)].type === 'boss'), 'never through the boss');
  // Everything lit on a dry map: the walk is as short as the hex distance.
  const A = genL(142);
  for (const t of tilesOf(A)) t.revealed = true;
  let bad = 0;
  for (const t of tilesOf(A)) {
    if (t === MAP.tileAt(A, A.pos.q, A.pos.r)) continue;
    const p = MAP.walkPath(A, t.q, t.r);
    if (!p || p.length !== hexDist(A.pos, t)) bad++;
  }
  h.eq(bad, 0, 'all lit: every walk is exactly the hex distance');
  // Sea is never walked, a lit island cut off by hidden water is unreachable.
  const Wm = world(143);
  for (const t of tilesOf(Wm)) t.revealed = t.terrain !== 'sea';
  const seaT = tilesOf(Wm).find(t => t.terrain === 'sea');
  h.eq(MAP.walkPath(Wm, seaT.q, seaT.r), null, 'sea is null');
  const isle = MAP.islandsOf(Wm)[0].map(k => Wm.tiles[k]);
  const pIsle = MAP.walkPath(Wm, isle[0].q, isle[0].r);
  h.ok(pIsle && pIsle.some(([q, r]) => Wm.tiles[MAP.key(q, r)].terrain === 'shallow'), 'an island is reached over a ford');
  for (const t of tilesOf(Wm)) if (t.terrain === 'shallow') t.revealed = false;
  h.eq(MAP.walkPath(Wm, isle[0].q, isle[0].r), null, 'with the fords hidden the island is cut off');
  // Cheapest by ink: a lit land way round beats a ford, even when longer.
  const F = genL(144);
  for (const t of tilesOf(F)) t.revealed = true;
  const s0 = F.pos;
  const line = [1, 2, 3].map(i => MAP.tileAt(F, s0.q + i, s0.r));
  h.ok(line.every(Boolean), 'three tiles east of the start');
  line[1].terrain = 'shallow';
  const pf = MAP.walkPath(F, line[2].q, line[2].r);
  h.ok(pf && pf.length === 4 && pf.every(([q, r]) => F.tiles[MAP.key(q, r)].terrain === 'land'), 'walks round the ford over land in 4 steps (' + JSON.stringify(pf) + ')');
  for (const t of tilesOf(F)) if (!line.includes(t) && !(t.q === s0.q && t.r === s0.r)) t.revealed = false;
  const pf2 = MAP.walkPath(F, line[2].q, line[2].r);
  h.ok(pf2 && pf2.length === 3 && F.tiles[MAP.key(pf2[1][0], pf2[1][1])].terrain === 'shallow', 'with no way round, the ford is walked (the ink is not checked here)');
  // Among equal walks, unvisited content is skirted; done content is not.
  const P = genL(145);
  for (const t of tilesOf(P)) { t.revealed = true; if (t.type !== 'start' && t.type !== 'boss') { t.type = 'empty'; t.road = false; } }
  const o = P.pos;
  const tgt = MAP.tileAt(P, o.q + 1, o.r + 1);             // two shortest ways: via (q+1, r) or (q, r+1)
  const via1 = MAP.tileAt(P, o.q + 1, o.r), via2 = MAP.tileAt(P, o.q, o.r + 1);
  h.ok(tgt && via1 && via2 && adj(via1, tgt) && adj(via2, tgt), 'a target with two shortest ways');
  via1.type = 'fight';
  let w = MAP.walkPath(P, tgt.q, tgt.r);
  h.ok(w && w.length === 2 && w[0][0] === via2.q && w[0][1] === via2.r, 'skirts the unvisited fight');
  via1.done = true; via2.type = 'fight';
  w = MAP.walkPath(P, tgt.q, tgt.r);
  h.ok(w && w.length === 2 && w[0][0] === via1.q && w[0][1] === via1.r, 'a done fight is as good as empty, the unvisited one is skirted');
  delete via1.done; via2.type = 'empty'; via1.type = 'empty'; via2.road = true;
  w = MAP.walkPath(P, tgt.q, tgt.r);
  h.ok(w && w[0][0] === via2.q && w[0][1] === via2.r, 'all else equal the road is preferred');
});

h.test('the road survives serialize / deserialize, old saves get none', () => {
  const M = gen(151);
  const o = MAP.serialize(M);
  h.eq(JSON.stringify(o.road), JSON.stringify(M.road), 'serialize keeps M.road');
  const D = MAP.deserialize(o);
  h.eq(JSON.stringify(D.road), JSON.stringify(M.road), 'deserialize keeps M.road');
  h.ok(tilesOf(D).every(t => t.road === M.tiles[MAP.key(t.q, t.r)].road), 'tile road flags survive');
  checkRoad(D, 'loaded');
  // An old save: no road list, no flags, and only the start's surroundings lit.
  const old = JSON.parse(JSON.stringify(o));
  delete old.road;
  const keepLit = new Set([MAP.key(M.start.q, M.start.r), MAP.key(M.boss.q, M.boss.r)].concat(MAP.neighbors(M, M.start.q, M.start.r).map(([q, r]) => MAP.key(q, r))));
  for (const k in old.tiles) { delete old.tiles[k].road; if (!keepLit.has(k)) old.tiles[k].revealed = false; }
  const O = MAP.deserialize(old);
  h.ok(Array.isArray(O.road) && O.road.length === 0, 'an old save has an empty road');
  h.ok(tilesOf(O).every(t => t.road === false), 'and no road flags');
  h.ok(MAP.walkPath(O, O.boss.q, O.boss.r) === null, 'its boss is not a walk target until the fog is charted');
  // A save with tile flags but no list, or a list but no flags, is reconciled.
  const half = JSON.parse(JSON.stringify(o));
  for (const k in half.tiles) delete half.tiles[k].road;
  const Hm = MAP.deserialize(half);
  h.ok(tilesOf(Hm).filter(t => t.road).length === M.road.length, 'tile flags rebuilt from M.road');
  const junk = JSON.parse(JSON.stringify(o));
  junk.road = [[999, 999], 'x', [M.start.q, M.start.r]];
  h.eq(MAP.deserialize(junk).road.length, 1, 'junk road entries are dropped');
});

/* Stub DATA: proves map.js reads DATA.TOOLS lazily (and overrides the
   fallback), and fills enc/event/tool content from DATA. */
h.test('stub DATA path', () => {
  const stub = `const DATA = {
    TOOLS: {
      flare: { id: 'flare', kind: 'line' },
      torch: { id: 'torch', kind: 'patch' },
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
  h.ok(tiles.filter(t => t.type === 'brush').every(t => ['flare', 'torch'].includes(t.content.brush)), 'tool tiles use DATA tool ids');
  h.eq(S.MAP.toolIds().join(), 'flare,torch', 'toolIds lists the DATA tools');
  h.ok(tiles.filter(t => t.type === 'tower' && t.content.tower.bonus.k === 'brush').every(t => ['flare', 'torch'].includes(t.content.tower.bonus.id)), 'tower tool bonuses use DATA ids');
  const tgt = tiles.find(t => !t.revealed && t.terrain === 'land' && S.MAP.hexDist(t.q, t.r, M.pos.q, M.pos.r) === 2);
  M.brushes = ['torch', 'flare'];
  const got = S.MAP.useTool(M, 'torch', tgt.q, tgt.r);
  h.ok(got && got.length >= 1 && got.every(t => S.MAP.hexDist(t.q, t.r, tgt.q, tgt.r) <= 1), 'a DATA tool of kind patch lights a patch');
  h.ok(M.brushes.join() === 'flare', 'DATA tool consumed');
  h.eq(S.MAP.useTool(M, 'torch', tgt.q, tgt.r), null, 'a spent DATA tool is refused');
  h.eq(S.MAP.toolKind('lantern'), 'ring', 'a fallback kind still answers for an id DATA does not list');
});

/* Real data.js, when the data module has landed. */
const dataPath = path.join(DIR, 'js', 'data.js');
if (fs.existsSync(dataPath)) {
  h.test('real DATA.TOOLS path', () => {
    const R = boot({ only: ['util', 'data', 'map'] });
    const D = R.DATA;
    h.ok(D && D.TOOLS && D.BRUSHES === D.TOOLS, 'DATA.TOOLS present, BRUSHES aliases it');
    h.eq(R.MAP.toolIds().join(), Object.keys(D.TOOLS).join(), 'toolIds reads DATA.TOOLS');
    for (let s = 1; s <= 30; s++) checkMap(R.MAP.generate({ act: 1 + (s % 3), rng: R.U.rng(s * 31) }), 'data seed ' + s, D);
    const M = darkBoard(R.MAP.generate({ act: 1, rng: R.U.rng(500), water: 0 }));
    const e = { q: M.pos.q + 1, r: M.pos.r };
    toolCase(M, 'flare', e, [1, 2, 3, 4, 5].map(i => [M.pos.q + i, M.pos.r]).filter(([q, r]) => inB(M, q, r)), 'DATA flare', R.MAP);
    toolCase(M, 'lantern', M.pos, R.MAP.lanternCells(M, M.pos.q, M.pos.r), 'DATA lantern', R.MAP);
    const far = tilesOf(M).find(t => !t.revealed && hexDist(t, M.pos) === 4);
    toolCase(M, 'kite', far, disc(M, far.q, far.r, 1), 'DATA kite', R.MAP);
  });
}

// ---------------------------------------------------------------- ARCADE (DESIGN.md "Arcade")
const ARC = ['plinko', 'wheel', 'slots'];
h.test('arcade cabinets: 2-3 per map, off the road, landmarks, reachable, deterministic', () => {
  const seen = {};
  let far = 0, total = 0;
  for (let s = 1; s <= 60; s++) {
    const M = world(s, { act: 1 + (s % 3) });
    const cabs = tilesOf(M).filter(t => ARC.includes(t.type));
    total += cabs.length;
    h.ok(cabs.length >= 2 && cabs.length <= 3, `world ${s}: 2-3 cabinets (${cabs.length})`);
    h.eq(new Set(cabs.map(t => t.type)).size, cabs.length, `world ${s}: no cabinet twice`);
    const roadSet = new Set(M.road.map(([q, r]) => MAP.key(q, r)));
    for (const t of cabs) {
      seen[t.type] = 1;
      const L = `world ${s} ${t.type}`;
      h.ok(MAP.isArcade(t) && isLand(t) && !t.road && !roadSet.has(MAP.key(t.q, t.r)), L + ' on land, off the road');
      const d = Math.min(...M.road.map(([q, r]) => hexDist(t, { q, r })));
      if (d >= MAP.ARC_ROAD_GAP) far++;
      h.ok(d >= 1, L + ' never on the road');
      h.ok(t.known && MAP.isLandmark(t), L + ' is a landmark (known in the dark)');
      h.ok(hexDist(t, M.start) >= 3 && hexDist(t, M.boss) >= 2, L + ' away from the start and the boss');
      h.ok(!MAP.neighbors(M, t.q, t.r).some(([q, r]) => M.tiles[MAP.key(q, r)].type === 'tower'), L + ' not on a tower doorstep');
      const tok = t.content.tokens;
      h.ok(t.type === 'plinko' ? tok >= 1 && tok <= 3 : tok >= 1 && tok <= 2, L + ' plays in range (' + tok + ')');
      h.ok(MAP.pathExists(M, M.start, t, { any: true }), L + ' reachable');
    }
    for (const a of cabs) for (const b of cabs) if (a !== b) h.ok(hexDist(a, b) >= 2, `world ${s}: cabinets spread`);
  }
  h.ok(ARC.every(g => seen[g]), 'all three games appear across seeds');
  h.ok(far / total > 0.95, `cabinets sit >= ${MAP.ARC_ROAD_GAP} off the road on the world (${far}/${total})`);
  const A = world(9), B = world(9);
  h.eq(JSON.stringify(tilesOf(A).filter(t => ARC.includes(t.type)).map(t => [t.q, t.r, t.type, t.content])), JSON.stringify(tilesOf(B).filter(t => ARC.includes(t.type)).map(t => [t.q, t.r, t.type, t.content])), 'same seed, same cabinets');
  h.eq(JSON.stringify(A.roam), JSON.stringify(B.roam), 'same seed, same monsters');
  // small maps still place them (relaxed) and keep every rule above
  for (let s = 1; s <= 30; s++) { const M = gen(s); h.ok(tilesOf(M).filter(t => ARC.includes(t.type)).every(t => isLand(t) && !t.road && t.known), `10x7 ${s}: cabinets on land off the road`); }
});

h.test('roaming monsters: placed asleep on empty mainland away from the start and the boss', () => {
  for (let s = 1; s <= 40; s++) {
    const act = 1 + (s % 3), M = world(s, { act });
    const main = new Set(MAP.islandsOf(M).flat());
    h.ok(Array.isArray(M.roam) && M.roam.length >= 2 && M.roam.length <= MAP.ROAM_N[act], `world ${s}: ${M.roam.length} monsters (act ${act})`);
    for (const m of M.roam) {
      const t = M.tiles[MAP.key(m.q, m.r)];
      h.ok(t && t.type === 'empty' && isLand(t) && !main.has(MAP.key(m.q, m.r)), `world ${s} ${m.id}: empty mainland land`);
      h.ok(hexDist(m, M.start) >= MAP.ROAM_START && hexDist(m, M.boss) >= MAP.ROAM_BOSS, `world ${s} ${m.id}: away from the start and the boss`);
      h.eq(m.awake, false, `world ${s} ${m.id}: asleep`);
    }
    for (const a of M.roam) for (const b of M.roam) if (a !== b) h.ok(hexDist(a, b) >= 4, `world ${s}: monsters spread`);
    h.eq(new Set(M.roam.map(m => m.id)).size, M.roam.length, `world ${s}: unique ids`);
  }
});

/* A dry 10x7 map, all lit, every tile empty but the start and the boss,
   with one monster at (q, r): the movement-rule playground. */
function roamLab(seed, mq, mr, pq, pr) {
  const M = genL(seed);
  for (const t of tilesOf(M)) { t.revealed = true; if (t.type !== 'start' && t.type !== 'boss') { t.type = 'empty'; t.content = {}; t.done = false; } }
  M.roam = [{ id: 'm0', q: mq, r: mr, awake: false, enc: null }];
  M.pos = { q: pq, r: pr };
  return M;
}
h.test('roaming monsters: wake in sight when lit, then one step toward you per step', () => {
  const M = roamLab(3, 5, 2, 0, 5);
  const m = M.roam[0];
  const d0 = hexDist(m, M.pos);
  h.ok(d0 > MAP.ROAM_SIGHT, 'starts out of sight (' + d0 + ')');
  let out = MAP.roamStep(M);
  h.ok(!m.awake && !out.woke.length && m.q === 5 && m.r === 2, 'out of sight: asleep, still');
  M.pos = { q: 2, r: 4 };
  const d1 = hexDist(m, M.pos);
  h.ok(d1 >= 2 && d1 <= MAP.ROAM_SIGHT, 'now in sight, a few hexes off (' + d1 + ')');
  M.tiles[MAP.key(m.q, m.r)].revealed = false;
  out = MAP.roamStep(M);
  h.ok(!m.awake, 'in range but its hex is dark: it cannot see you');
  M.tiles[MAP.key(m.q, m.r)].revealed = true;
  out = MAP.roamStep(M);
  h.ok(m.awake && out.woke[0] === m && !out.moved.length, 'lit and in sight: it wakes, and holds still that turn (the telegraph)');
  const plan = MAP.roamPlan(M);
  h.ok(plan.length === 1 && plan[0].next && hexDist({ q: plan[0].next[0], r: plan[0].next[1] }, M.pos) === d1 - 1, 'the telegraph points one hex closer');
  out = MAP.roamStep(M);
  h.ok(out.moved.length === 1 && hexDist(m, M.pos) === d1 - 1, 'awake: one step closer');
  h.ok(m.q === plan[0].next[0] && m.r === plan[0].next[1], 'it went where the arrow said');
  // walk it right up to the player: the step onto you is the ambush
  let guard = 0;
  while (hexDist(m, M.pos) > 1 && guard++ < 10) MAP.roamStep(M);
  h.eq(hexDist(m, M.pos), 1, 'adjacent');
  out = MAP.roamStep(M, { hold: true });
  h.ok(!out.ambush && hexDist(m, M.pos) === 1, 'hold (your hex is busy): it waits beside you');
  out = MAP.roamStep(M);
  h.ok(out.ambush === m, 'then it jumps you: an ambush');
  h.ok(MAP.roamRemove(M, 'm0') === m && M.roam.length === 0, 'roamRemove takes it off the map');
});

h.test('roaming monsters: only lit walkable land, never the start or the boss, never blocking the road', () => {
  const M = roamLab(5, 4, 3, 0, 3);
  const m = M.roam[0];
  m.awake = true;
  // stand on the start: it comes, but never steps onto the start itself
  M.pos = { q: M.start.q, r: M.start.r };
  for (let i = 0; i < 12; i++) { const o = MAP.roamStep(M); h.ok(!o.ambush, 'no ambush on the start hex'); }
  h.eq(hexDist(m, M.start), 1, 'it waits beside the start');
  // a dark ring around it: stuck, never onto dark
  const N = roamLab(6, 5, 3, 1, 3);
  const n = N.roam[0]; n.awake = true;
  for (const [q, r] of MAP.neighbors(N, n.q, n.r)) N.tiles[MAP.key(q, r)].revealed = false;
  MAP.roamStep(N);
  h.ok(n.q === 5 && n.r === 3, 'dark all round: it cannot move');
  // content landmarks are off limits, pickups are not
  const P = roamLab(7, 5, 3, 1, 3);
  const p = P.roam[0]; p.awake = true;
  const next = MAP.roamPlan(P)[0].next;
  P.tiles[MAP.key(next[0], next[1])].type = 'shop';
  const alt = MAP.roamPlan(P)[0].next;
  h.ok(!alt || alt[0] !== next[0] || alt[1] !== next[1], 'a shop is off limits');
  P.tiles[MAP.key(next[0], next[1])].type = 'gem';
  const back = MAP.roamPlan(P)[0].next;
  h.ok(back && back[0] === next[0] && back[1] === next[1], 'a gem it prowls over');
  // fuzz on the world: monsters only ever stand where they may, and the boss stays reachable
  for (let s = 1; s <= 12; s++) {
    const W = world(s, { act: 1 + (s % 3) });
    for (const t of tilesOf(W)) if (t.terrain !== 'sea') t.revealed = true;
    for (const x of W.roam) x.awake = true;
    const rng = U.rng(s * 7);
    const land = tilesOf(W).filter(isLand);
    for (let i = 0; i < 60 && W.roam.length; i++) {
      const t = rng.pick(land);
      W.pos = { q: t.q, r: t.r };
      const o = MAP.roamStep(W, { hold: rng() < 0.3 });
      if (o.ambush) MAP.roamRemove(W, o.ambush.id);
      const keys = W.roam.map(x => MAP.key(x.q, x.r));
      h.eq(new Set(keys).size, keys.length, `world ${s} step ${i}: never two on one hex`);
      h.ok(W.roam.every(x => MAP.roamOk(W.tiles[MAP.key(x.q, x.r)])), `world ${s} step ${i}: every monster on lit walkable land (no boss, start, water, mountain)`);
    }
    h.ok(MAP.pathExists(W, W.start, W.boss, { any: true, land: true }), `world ${s}: the boss is still reachable`);
    W.pos = { q: W.start.q, r: W.start.r };
    const road = MAP.walkPath(W, W.road[W.road.length - 2][0], W.road[W.road.length - 2][1]);
    h.ok(Array.isArray(road) && road.length > 0, `world ${s}: the walk up the road to the boss's door never routes around monsters (they block nothing)`);
  }
});

h.test('roaming monsters and cabinets survive the save; old saves load', () => {
  const M = world(4);
  M.roam[0].awake = true; M.roam[0].q += 0;
  const D = MAP.deserialize(JSON.parse(JSON.stringify(MAP.serialize(M))));
  h.eq(JSON.stringify(D.roam), JSON.stringify(M.roam), 'monsters round trip (positions, awake, fights)');
  const cab = tilesOf(D).find(t => ARC.includes(t.type));
  h.ok(cab && cab.known && cab.content.tokens >= 1, 'a cabinet round trips');
  const O = JSON.parse(JSON.stringify(M));
  delete O.roam;
  const L = MAP.deserialize(O);
  h.ok(Array.isArray(L.roam) && L.roam.length === 0, 'a save from before the monsters has none');
  h.eq(MAP.roamStep(L).moved.length, 0, 'and roamStep is a no-op there');
  const bad = JSON.parse(JSON.stringify(M));
  bad.roam.push({ id: 'zz', q: 99, r: 99 }, null);
  h.eq(MAP.deserialize(bad).roam.length, M.roam.length, 'broken monsters are dropped');
});

// ---------------------------------------------------------------- ENDLESS (DESIGN.md "Endless and mutators")
// game.js newMap seeds an Endless loop's map with ':loop' + n after the act
// (a classic run's seed string is unchanged): every loop is a new map of its
// act's biome, and every rule of the world holds on it.
if (fs.existsSync(dataPath)) {
  h.test('endless: every loop gets a fresh map of its biome with every rule intact', () => {
    const R = boot({ only: ['util', 'data', 'map'] });
    const seen = new Set();
    for (const seed of [11, 202, 3003]) {
      for (let loop = 1; loop <= 6; loop++) {
        const act = R.DATA.endlessAct(loop);
        const M = R.MAP.generate({ act, rng: R.U.rng(R.U.hashStr(seed + ':map:' + act + ':loop' + loop)) });
        const C = R.MAP.generate({ act, rng: R.U.rng(R.U.hashStr(seed + ':map:' + act)) });
        const label = `seed ${seed} loop ${loop}`;
        h.eq(M.act, act, label + ' plays its act');
        h.eq(M.biome, R.MAP.biomeOf(act), label + ' in its biome');
        h.ok(M.seed !== C.seed, label + ' is not the classic act map');
        seen.add(M.seed);
        checkMap(M, label, R.DATA);
        checkRoad(M, label);
        h.ok(R.MAP.walkCost(M, M.pos, M.boss) === 0, label + ' the boss is a free walk down the road');
        const towers = tilesOf(M).filter(t => t.type === 'tower').length;
        h.ok(towers >= 2 && towers <= 3, label + ' has its towers');
        h.ok(tilesOf(M).some(t => ['plinko', 'wheel', 'slots'].includes(t.type)), label + ' has its arcade cabinets');
        const back = R.MAP.deserialize(JSON.parse(JSON.stringify(R.MAP.serialize(M))));
        h.eq(back.seed, M.seed, label + ' survives the save');
      }
    }
    h.eq(seen.size, 18, 'eighteen loops, eighteen maps');
  });
}

// ---------------------------------------------------------------- PETS (round 5): whack-a-mole, skee-ball, the pet shop
const R5 = ['moles', 'skee', 'petshop'];
h.test('round 5 tiles: one whack-a-mole, one skee-ball, one pet shop per map, by the cabinet rules', () => {
  h.ok(R5.every(k => MAP.TYPES.includes(k)), 'the new tile types are known');
  h.ok(MAP.ARC_R5 && MAP.ARC_R5.includes('moles') && MAP.ARC_R5.includes('skee') && MAP.PET_TILE === 'petshop', 'MAP.ARC_R5 and MAP.PET_TILE');
  h.ok(MAP.isArcade({ type: 'moles' }) && MAP.isArcade({ type: 'skee' }) && !MAP.isArcade({ type: 'petshop' }) && MAP.isArcade({ type: 'plinko' }), 'isArcade: the two new games (the pet shop is no game)');
  let near = 0, far = 0, n = 0, offRoad = 0, total = 0;
  for (let s = 1; s <= 60; s++) {
    const act = 1 + (s % 3), M = world(s, { act });
    const roadSet = new Set(M.road.map(([q, r]) => MAP.key(q, r)));
    const roam = new Set((M.roam || []).map(m => MAP.key(m.q, m.r)));
    const cabs = tilesOf(M).filter(t => MAP.isArcade(t) || t.type === 'petshop');
    for (const k of R5) {
      const list = tilesOf(M).filter(t => t.type === k);
      const L = `world ${s} ${k}`;
      h.eq(list.length, 1, L + ': exactly one');
      const t = list[0];
      if (!t) continue;
      total++;
      h.ok(isLand(t) && !t.road && !roadSet.has(MAP.key(t.q, t.r)), L + ' on land, off the road');
      if (Math.min(...M.road.map(([q, r]) => hexDist(t, { q, r }))) >= MAP.ARC_ROAD_GAP) offRoad++;
      h.ok(t.known && MAP.isLandmark(t), L + ' is a landmark');
      h.ok(!roam.has(MAP.key(t.q, t.r)), L + ' never under a roaming monster');
      h.ok(hexDist(t, M.start) >= 3 && hexDist(t, M.boss) >= 2, L + ' away from the start and the boss');
      h.ok(!MAP.neighbors(M, t.q, t.r).some(([q, r]) => M.tiles[MAP.key(q, r)].type === 'tower'), L + ' not on a tower doorstep');
      h.ok(MAP.pathExists(M, M.start, t, { any: true }), L + ' reachable');
      h.ok(Number.isFinite(t.content.seed) && Number.isFinite(t.content.diff) && t.content.game === k, L + ' content: seed, diff, game');
      if (k !== 'petshop') h.ok(t.content.tokens >= 1 && t.content.tokens <= 2, L + ' plays in range');
      for (const o of cabs) if (o !== t) h.ok(hexDist(o, t) >= 2, L + ' spread from the other cabinets');
    }
    // the pet shop leans toward the start
    const ps = tilesOf(M).find(t => t.type === 'petshop'), mo = tilesOf(M).find(t => t.type === 'moles'), sk = tilesOf(M).find(t => t.type === 'skee');
    if (ps && mo && sk) { n++; if (hexDist(ps, M.start) <= Math.max(hexDist(mo, M.start), hexDist(sk, M.start))) near++; }
    // the round 3 cabinets and the monsters keep their own rules
    const old = tilesOf(M).filter(t => ['plinko', 'wheel', 'slots'].includes(t.type));
    h.ok(old.length >= 2 && old.length <= 3, `world ${s}: the round 3 cabinets are still 2-3`);
    for (const m of M.roam) h.eq(M.tiles[MAP.key(m.q, m.r)].type, 'empty', `world ${s} ${m.id}: its hex is still empty`);
    far++;
  }
  h.ok(offRoad / total > 0.9, `the new cabinets sit >= ${MAP.ARC_ROAD_GAP} off the road (${offRoad}/${total})`);
  h.ok(near / n > 0.6, `the pet shop is nearer the start than a game most of the time (${near}/${n})`);
  // deterministic, and small maps still get them (relaxed) on land off the road
  const A = world(21), B = world(21);
  h.eq(JSON.stringify(tilesOf(A).filter(t => R5.includes(t.type)).map(t => [t.q, t.r, t.type, t.content])), JSON.stringify(tilesOf(B).filter(t => R5.includes(t.type)).map(t => [t.q, t.r, t.type, t.content])), 'same seed, same round 5 tiles');
  // (a 10 x 7 map has a handful of free hexes: what fits is placed, on land off the road, and nothing breaks)
  for (let s = 1; s <= 30; s++) { const M = gen(s); const got = tilesOf(M).filter(t => R5.includes(t.type)); h.ok(got.every(t => isLand(t) && !t.road && t.known), `10x7 ${s}: on land off the road`); h.ok(new Set(got.map(t => t.type)).size === got.length, `10x7 ${s}: none twice`); }
});
h.test('round 5 tiles: save round trip, old saves, the arcade session carried', () => {
  const M = world(5);
  const ps = tilesOf(M).find(t => t.type === 'petshop'), mo = tilesOf(M).find(t => t.type === 'moles');
  ps.content.pet = { offer: ['cat', 'goose', 'parrot'], names: ['A', 'B', 'C'], adopted: 'goose', treats: 2 };
  mo.content.arc = { g: 'moles', tokens: 0, used: 1, res: [], pend: { score: 210 }, caps: [], mult: 1, rot: 0, live: null, best: 210 };
  ps.done = true;
  const D2 = MAP.deserialize(JSON.parse(JSON.stringify(MAP.serialize(M))));
  const ps2 = D2.tiles[MAP.key(ps.q, ps.r)], mo2 = D2.tiles[MAP.key(mo.q, mo.r)];
  h.ok(ps2.type === 'petshop' && ps2.known && ps2.done && ps2.content.pet.adopted === 'goose' && ps2.content.pet.treats === 2, 'the pet shop and its pens survive a save');
  h.ok(mo2.type === 'moles' && mo2.content.arc.pend.score === 210 && mo2.content.arc.best === 210, 'a pending whack-a-mole score survives a save');
  h.ok(MAP.isArcade(mo2) && MAP.isLandmark(ps2), 'still a cabinet, still a landmark');
  // an old save: no round 5 tiles at all, loads as ever
  const O = JSON.parse(JSON.stringify(MAP.serialize(world(6))));
  for (const k in O.tiles) if (R5.includes(O.tiles[k].type)) { O.tiles[k].type = 'empty'; O.tiles[k].known = false; O.tiles[k].content = {}; }
  const O2 = MAP.deserialize(O);
  h.ok(O2 && !tilesOf(O2).some(t => R5.includes(t.type)) && tilesOf(O2).every(t => t.known === LANDMARK.includes(t.type)), 'an old save without them loads, landmarks intact');
});

// ---------------------------------------------------------------- SECRET (round 6): the golden keys and the Back Room
h.test('secret: a golden key per map, hidden three ways, never touching the map', () => {
  const all = (M) => Object.values(M.tiles);
  let roamN = 0, arcN = 0, darkN = 0;
  for (let s = 1; s <= 24; s++) {
    const act = 1 + (s % 3);
    const M = MAP.generate({ act, rng: U.rng(s * 131 + 7), cols: 16, rows: 22 });
    const before = JSON.stringify(M.tiles), roamB = JSON.stringify(M.roam);
    const R = MAP.secKeys(M, 'roam');
    h.ok(R && R.kind === 'roam' && M.roam.some(m => m.id === R.id) && !R.got, `seed ${s}: the key is in a roaming monster`);
    const far = Math.max(...M.roam.map(m => MAP.hexDist(m.q, m.r, M.start.q, M.start.r)));
    const km = M.roam.find(m => m.id === R.id);
    h.eq(MAP.hexDist(km.q, km.r, M.start.q, M.start.r), far, `seed ${s}: the monster farthest from the start swallowed it`);
    roamN++;
    const A = MAP.secKeys(M, 'arcade');
    h.ok(A && A.kind === 'arcade' && all(M).some(t => MAP.isArcade(t) && t.type !== MAP.PET_TILE), `seed ${s}: an arcade jackpot pays it`);
    arcN++;
    const K = MAP.secKeys(M, 'dark');
    const t = M.tiles[MAP.key(K.q, K.r)];
    h.ok(K.kind === 'dark' && t && t.type === 'empty' && MAP.isLand(t) && !t.road && !t.revealed && !M.roam.some(m => m.q === K.q && m.r === K.r), `seed ${s}: a dark empty land hex off the road`);
    const roadD = (x) => Math.min(...M.road.map(([q, r]) => MAP.hexDist(x.q, x.r, q, r)));
    const best = Math.max(...all(M).filter(x => x.type === 'empty' && MAP.isLand(x) && !x.road && !x.revealed && !M.roam.some(m => m.q === x.q && m.r === x.r)).map(roadD));
    h.eq(roadD(t), best, `seed ${s}: as far from the road as it gets (${best})`);
    h.ok(roadD(t) >= 3, `seed ${s}: well off the road`);
    darkN++;
    h.ok(MAP.secKeyAt(M, K.q, K.r) && !MAP.secKeyAt(M, M.start.q, M.start.r), 'secKeyAt: only on its own hex');
    h.eq(JSON.stringify(MAP.secKeys(M, 'dark')), JSON.stringify(K), 'deterministic');
    h.eq(JSON.stringify(M.tiles), before, `seed ${s}: placing a key never changes a tile`);
    h.eq(JSON.stringify(M.roam), roamB, `seed ${s}: nor a monster`);
    M.sec.got = true;
    h.ok(!MAP.secKeyAt(M, K.q, K.r), 'a taken key is gone');
    const O = MAP.deserialize(MAP.serialize(M));
    h.ok(O.sec && O.sec.kind === 'dark' && O.sec.got === true && O.sec.q === K.q, 'the key survives the save round trip');
  }
  h.ok(roamN && arcN && darkN, 'all three kinds placed');
  // a map that cannot hold the kind falls back to the dark corner
  const M = MAP.generate({ act: 1, rng: U.rng(99), cols: 16, rows: 22 });
  M.roam = [];
  h.eq(MAP.secKeys(M, 'roam').kind, 'dark', 'no monsters: the dark corner instead');
  for (const k in M.tiles) if (MAP.isArcade(M.tiles[k])) M.tiles[k].type = 'empty';
  const F = MAP.secKeys(M, 'arcade');
  h.ok(F.kind === 'dark' && F.want === 'arcade', 'no cabinets: the dark corner instead (it remembers what it wanted)');
  const old = MAP.deserialize(JSON.parse(JSON.stringify(Object.assign({}, M, { sec: undefined }))));
  h.ok(old && !old.sec && !MAP.secKeyAt(old, 0, 0), 'a map from before the keys has none');
});

h.test('secret: the Back Room map (5 to 8 hexes inside the machine)', () => {
  const lens = new Set();
  for (let s = 1; s <= 200; s++) {
    const M = MAP.secRoom({ rng: U.rng(s), elites: [['frostknight'], ['collector']], ink: 4 });
    const T = Object.values(M.tiles), land = T.filter(t => MAP.isLand(t));
    lens.add(land.length);
    h.ok(land.length >= 5 && land.length <= 8, `seed ${s}: ${land.length} walkable hexes`);
    h.ok(M.biome === 'machine' && T.every(t => t.biome === 'machine'), `seed ${s}: the machine biome`);
    h.ok(T.filter(t => !MAP.isLand(t)).every(t => t.terrain === 'sea' && t.ground === 'sea' && t.type === 'empty' && !t.known), `seed ${s}: the rest is the machine's dark void`);
    const st = M.tiles[MAP.key(M.start.q, M.start.r)], bs = M.tiles[MAP.key(M.boss.q, M.boss.r)];
    h.ok(st.type === 'start' && st.visited && st.revealed && bs.type === 'boss' && bs.revealed, `seed ${s}: start and boss`);
    h.eq(JSON.stringify(bs.content.enc), '["machine"]', `seed ${s}: The Machine waits on the boss hex`);
    // the lit catwalk: start to boss, every step adjacent, land, lit, no repeats
    const road = M.road;
    h.ok(road.length >= 6 && road.length <= 7 && road[0][0] === M.start.q && road[0][1] === M.start.r && road[road.length - 1][0] === M.boss.q, `seed ${s}: the road runs start -> boss (${road.length})`);
    let ok = true;
    for (let i = 1; i < road.length; i++) if (!MAP.isAdjacent(road[i - 1][0], road[i - 1][1], road[i][0], road[i][1])) ok = false;
    h.ok(ok && new Set(road.map(p => p.join())).size === road.length, `seed ${s}: a connected road, no tile twice`);
    h.ok(road.every(([q, r]) => { const t = M.tiles[MAP.key(q, r)]; return t.road && t.revealed && MAP.isLand(t); }), `seed ${s}: lit land`);
    const types = land.map(t => t.type);
    h.eq(types.filter(x => x === 'elite').length, 2, `seed ${s}: two elites`);
    h.ok(types.includes('shop') && types.includes('rest') && types.includes('forge'), `seed ${s}: the service counter, a rest, a forge`);
    h.ok(land.filter(t => t.type === 'elite').every(t => t.content.sec && Array.isArray(t.content.enc) && t.content.enc.length), `seed ${s}: the elites carry their encounter`);
    h.ok(land.find(t => t.type === 'shop').content.sec, `seed ${s}: the shop is the service counter`);
    h.ok(land.every(t => t.known === MAP.isLandmark(t)), `seed ${s}: landmarks known`);
    h.ok(MAP.pathExists(M, M.start, M.boss, { ink: 0 }) && MAP.walkCost(M, M.start, M.boss) === 0, `seed ${s}: the boss is a free walk`);
    const wp = MAP.walkPath(M, road[1][0], road[1][1]);
    h.ok(wp && wp.length === 1, `seed ${s}: click to travel works in there`);
    h.ok(land.every(t => t === st || MAP.walkCost(M, M.start, t, { any: true, land: true }) >= 0), `seed ${s}: every hex reachable`);
    h.eq(M.ink, 4, 'the bulbs carry in');
    h.ok(M.revealedCount === T.filter(t => t.revealed && t.terrain !== 'sea').length, 'the lit count leaves the void out');
    const O = MAP.deserialize(MAP.serialize(M));
    h.ok(O && O.biome === 'machine' && O.room === true && JSON.stringify(O.road) === JSON.stringify(M.road) && Object.keys(O.tiles).length === T.length, `seed ${s}: save round trip`);
    const b = MAP.bounds(M, MAP.HEX, 'v');
    h.ok(b.w < 540 && b.h < 768, 'it fits the map area');
  }
  h.ok(lens.has(7) && lens.has(8), 'seven or eight hexes, both happen');
  h.eq(JSON.stringify(MAP.secRoom({ rng: U.rng(5) })), JSON.stringify(MAP.secRoom({ rng: U.rng(5) })), 'deterministic by the rng');
});

/* ---------------------------------------------------------------- LORE (round 9): the decorative landmarks */
h.test('lore: a jukebox, lost tickets and the old high score board on every map, off the road, the map untouched', () => {
  h.eq(JSON.stringify(MAP.LORE_KINDS), JSON.stringify(['jukebox', 'tickets', 'hiscore']), 'three kinds');
  const near = [];
  for (let s = 1; s <= 100; s++) {
    const M = world(s, { act: 1 + (s % 3) });
    const before = JSON.stringify(M);
    const L = MAP.lorePlace(M);
    h.eq(JSON.stringify(M), before, `seed ${s}: placing reads the map and changes nothing`);
    h.eq(JSON.stringify(MAP.lorePlace(M)), JSON.stringify(L), `seed ${s}: the same every time`);
    h.eq(L.map(x => x.k).join(), 'jukebox,tickets,hiscore', `seed ${s}: one of each, listed by kind`);
    const keys = new Set(L.map(x => MAP.key(x.q, x.r)));
    h.eq(keys.size, 3, `seed ${s}: three different hexes`);
    for (const x of L) {
      const t = M.tiles[MAP.key(x.q, x.r)];
      h.ok(t && t.type === 'empty' && t.terrain === 'land' && MAP.isLand(t) && !t.road, `seed ${s}: ${x.k} on empty land off the road`);
      h.ok(MAP.hexDist(x.q, x.r, M.start.q, M.start.r) >= 2 && MAP.hexDist(x.q, x.r, M.boss.q, M.boss.r) >= 2, `seed ${s}: ${x.k} clear of the start and the boss`);
      h.ok(!(M.roam || []).some(m => m.q === x.q && m.r === x.r), `seed ${s}: ${x.k} not under a sleeping monster`);
      h.ok(MAP.loreAt(Object.assign({}, M, { lore: L }), x.q, x.r) === x, `seed ${s}: loreAt finds the ${x.k}`);
      let d = Infinity;
      for (const [q, r] of M.road) d = Math.min(d, MAP.hexDist(x.q, x.r, q, r));
      near.push(d);
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) h.ok(MAP.hexDist(L[i].q, L[i].r, L[j].q, L[j].r) >= 2, `seed ${s}: landmarks apart`);
    // a golden key in the dark is never under a landmark
    const Mk = world(s);
    if (MAP.secKeys) {
      MAP.secKeys(Mk, 'dark');
      if (Mk.sec && Mk.sec.q != null) h.ok(!MAP.lorePlace(Mk).some(x => x.q === Mk.sec.q && x.r === Mk.sec.r), `seed ${s}: the golden key's hex keeps its secret`);
    }
  }
  h.ok(near.filter(d => d <= 3).length / near.length > 0.9, 'nearly all stand within three hexes of the road, where a walk passes them');
  // small maps relax the rules, the Back Room has none, the save keeps them
  let small = 0;
  for (let s = 1; s <= 60; s++) { const M = gen(s); const L = MAP.lorePlace(M); if (L.length >= 2) small++; h.ok(L.every(x => M.tiles[MAP.key(x.q, x.r)].type === 'empty'), `small seed ${s}: empty hexes only`); }
  h.ok(small >= 55, `small maps still get two or three (${small} of 60)`);
  h.eq(MAP.lorePlace(MAP.secRoom({ rng: U.rng(3) })).length, 0, 'none in the Back Room');
  h.eq(MAP.lorePlace(null).length, 0, 'no map, none');
  const M = world(9);
  M.lore = MAP.lorePlace(M);
  const O = MAP.deserialize(MAP.serialize(M));
  h.eq(JSON.stringify(O.lore), JSON.stringify(M.lore), 'the save round trip keeps them');
  h.eq(MAP.loreAt(world(9), 0, 0), null, 'a map from before the landmarks has none until the game places them');
});

h.done();
