// MAP: the hex map (DESIGN 4.8 and 5.3). Generation rules over 300 seeds x 3 Acts, Spell geometry against an independent
// reference for every Spell x direction x many anchors, unmuting and walking semantics on hand-built maps, pixel round trips,
// saves and determinism. Every check below re-derives its answer with its own small BFS and hex math instead of asking MAP.
//
// The suite boots map.js alone on a bare DATA (`skip: data_*`) so a broken content file elsewhere can never fail it; the encounter
// section installs its own fake pools with DATA.addEncounters, and the last section replays a few maps against whatever real content
// files exist. It prints one ASCII map and the generator statistics (not asserted) so a human can eyeball them.
// MAP_TEST_SEEDS=N (default 300) changes how many seeds per Act the generation rules run over: a soak run of 2000 takes a few minutes.
import { boot, harness } from './hocus_vocus_lib.mjs';

const t = harness('hocus_vocus map');
const api = boot({ only: ['map'], skip: ['data_*'] });
const { MAP, DATA, U } = api;
const E = DATA.ECONOMY, EM = E.map;

// ------------------------------------------------------------------ independent helpers (never call MAP for the answer)
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const key = (q, r) => q + ',' + r;
const hex = (a, b) => { const dq = b.q - a.q, dr = b.r - a.r; return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2; };
const T = (M, q, r) => M.tiles[key(q, r)];
const nbrs = (M, tl) => DIRS.map((d) => T(M, tl.q + d[0], tl.r + d[1])).filter(Boolean);
const all = (M) => Object.keys(M.tiles).map((k) => M.tiles[k]);
const colOf = (tl) => tl.q + Math.floor(tl.r / 2);
const px = (tl, s = 1) => ({ x: s * Math.sqrt(3) * (tl.q + tl.r / 2), y: s * 1.5 * tl.r });
const oneOf = (arr, x) => arr.indexOf(x) >= 0;
const LANDMARKS = DATA.LISTS.landmarks;
const expectedCount = (type, nonBlock, ch) => {
  let c = Math.min(E.countMax[type] === undefined ? Infinity : E.countMax[type], Math.max(E.countMin[type] || 0, Math.round(E.dist[type] * nonBlock)));
  if (type === 'elite' && ch === 3) c = Math.min(E.countMax.elite, c + 1);
  return c;
};
// fewest paints from the unmuted set to the target over hidden non-block tiles (Infinity when cut off), boss included
function paintCost(M, target) {
  const dist = new Map(), queue = [];
  all(M).forEach((tl) => { if (tl.type !== 'block' && !tl.painted && nbrs(M, tl).some((n) => n.painted)) { dist.set(key(tl.q, tl.r), 1); queue.push(tl); } });
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h], d = dist.get(key(c.q, c.r));
    nbrs(M, c).forEach((n) => { if (n.type !== 'block' && !n.painted && !dist.has(key(n.q, n.r))) { dist.set(key(n.q, n.r), d + 1); queue.push(n); } });
  }
  const v = dist.get(key(target.q, target.r));
  return v === undefined ? Infinity : v;
}
// walk distance over all non-block tiles from a source list
function flood(M, sources) {
  const dist = new Map(), queue = sources.slice();
  sources.forEach((s) => dist.set(key(s.q, s.r), 0));
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h], d = dist.get(key(c.q, c.r));
    nbrs(M, c).forEach((n) => { if (n.type !== 'block' && !dist.has(key(n.q, n.r))) { dist.set(key(n.q, n.r), d + 1); queue.push(n); } });
  }
  return dist;
}
const ringOf = (M) => all(M).filter((tl) => tl.type !== 'block' && hex(M.start, tl) <= EM.startRing);
// blank map builder for hand-checked semantics: every tile empty and hidden
function blank(cols, rows) {
  const M = { v: 1, chapter: 1, seed: 0, cols, rows, tiles: {}, start: null, boss: null, pos: null };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const q = c - Math.floor(r / 2); M.tiles[key(q, r)] = { q, r, type: 'empty', painted: false, known: false, done: false, diff: 0, content: {} }; }
  return M;
}
const cr = (M, col, row) => T(M, col - Math.floor(row / 2), row);            // tile by (column, row)
const setPainted = (M, list) => { list.forEach((x) => { x.painted = true; x.known = true; }); return M; };
const cells = (list) => list.map((c) => key(c[0], c[1]));

// ------------------------------------------------------------------ the 900 generated maps, built once
const CHAPTERS = [1, 2, 3], SEEDS = Math.max(1, +process.env.MAP_TEST_SEEDS || 300);          // MAP_TEST_SEEDS=2000 for a soak run
const MAPS = [];
const t0 = Date.now();
for (const ch of CHAPTERS) for (let s = 1; s <= SEEDS; s++) { const seed = s * 7919 + ch * 104729; MAPS.push({ ch, seed, M: MAP.generate({ chapter: ch, seed }) }); }
const genMs = Date.now() - t0;

// run one rule over every map, collect failures, report the first few in one assertion
function rule(name, fn, subset) {
  const bad = [];
  (subset || MAPS).forEach((m) => { const why = fn(m.M, m.ch, m.seed); if (why) bad.push(`ch${m.ch} seed ${m.seed}: ${why}`); });
  t.ok(bad.length === 0, `${name} (${bad.length} of ${(subset || MAPS).length} maps fail; first: ${bad.slice(0, 3).join(' | ')})`);
}

// ================================================================== API and coordinates
t.test('public API surface', () => {
  ['generate', 'key', 'parse', 'neighbors', 'dist', 'canPaint', 'paint', 'pathToPaint', 'canBrush', 'brushCells', 'applyBrush', 'canMove', 'move', 'walkPath', 'solve',
    'progress', 'toPixel', 'fromPixel', 'corners', 'bounds', 'serialize', 'deserialize', 'tilesOf', 'painted', 'frontier', 'isWalkable', 'hexRing', 'direction', 'dirOf', 'reachable',
    'colRow', 'fromColRow', 'hexRange', 'tile', 'spine', 'unresolved', 'brushAnchors', 'tileTarget', 'audit', 'ascii'].forEach((f) => t.eq(typeof MAP[f], 'function', 'MAP.' + f));
  t.deep(MAP.DIRS, DIRS, 'DIRS order E NE NW W SW SE');
  t.eq(MAP.VERSION, 1, 'version');
  DIRS.forEach((d, i) => {
    const p = MAP.toPixel(d[0], d[1], 100), ang = ((Math.atan2(-p.y, p.x) * 180 / Math.PI) + 360) % 360;
    t.near(ang, i * 60, 1e-6, 'DIRS[' + i + '] points ' + i * 60 + ' degrees (counter-clockwise on screen)');
  });
  t.eq(MAP.key(3, -2), '3,-2', 'key'); t.deep(MAP.parse('3,-2'), { q: 3, r: -2 }, 'parse');
});
t.test('offset layout: column = q + floor(r / 2), conversion both ways', () => {
  let n = 0;
  for (let row = 0; row < EM.rows; row++) for (let col = 0; col < EM.cols; col++) {
    const a = MAP.fromColRow(col, row);
    t.eq(a.q, col - Math.floor(row / 2), 'q'); t.eq(a.r, row, 'r');
    t.deep(MAP.colRow(a.q, a.r), { col, row }, 'round trip'); n++;
  }
  t.eq(n, 273, '21 x 13 tiles');
  t.deep(MAP.colRow(0, 0), { col: 0, row: 0 }, 'hex (0,0) is column 0 row 0');
  t.deep(MAP.colRow(0, 1), { col: 0, row: 1 }, 'odd row: q 0 is column 0');
  t.deep(MAP.colRow(-1, 2), { col: 0, row: 2 }, 'row 2 shifts q by -1');
  t.eq(MAP.dist(0, 0, 3, 0), 3, 'dist along a row'); t.eq(MAP.dist(0, 0, 0, 3), 3, 'dist SE'); t.eq(MAP.dist(0, 0, 2, -2), 2, 'dist NE'); t.eq(MAP.dist(1, 1, -2, 4), 3, 'dist SW');
  let bad = 0;
  for (let i = 0; i < 200; i++) { const a = { q: (i * 7) % 11 - 5, r: (i * 5) % 9 - 4 }, b = { q: (i * 3) % 13 - 6, r: (i * 11) % 7 - 3 }; if (MAP.dist(a.q, a.r, b.q, b.r) !== hex(a, b) || MAP.dist(a.q, a.r, b.q, b.r) !== MAP.dist(b.q, b.r, a.q, a.r)) bad++; }
  t.eq(bad, 0, 'dist is the cube distance and symmetric');
});
t.test('hexRing, hexRange, direction, dirOf', () => {
  for (let rad = 0; rad <= 6; rad++) {
    const ring = MAP.hexRing(2, -1, rad), want = rad === 0 ? 1 : 6 * rad;
    t.eq(ring.length, want, 'ring ' + rad + ' size'); t.eq(new Set(cells(ring)).size, want, 'ring cells unique');
    t.ok(ring.every((c) => hex({ q: 2, r: -1 }, { q: c[0], r: c[1] }) === rad), 'ring ' + rad + ' is at exactly that distance');
    t.eq(MAP.hexRange(0, 0, rad).length, 1 + 3 * rad * (rad + 1), 'range ' + rad + ' size');
  }
  t.deep(MAP.hexRing(0, 0, 1), [[-1, 1], [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0]], 'ring 1 order: SW corner first, then E NE NW W SW SE steps');
  t.deep(MAP.hexRing(0, 0, -1), [], 'negative radius');
  for (let d = -13; d <= 13; d++) t.deep(MAP.direction(d), DIRS[((d % 6) + 6) % 6], 'direction wraps ' + d);
  const M = blank(5, 5);
  for (let d = 0; d < 6; d++) {
    for (let k = 1; k <= 5; k++) t.eq(MAP.dirOf(M, 3, 3, 3 + DIRS[d][0] * k, 3 + DIRS[d][1] * k), d, 'dirOf straight ' + d + ' x' + k);
    // slightly off the axis still snaps to it: a step along d plus a step along d+1 sits between them and lands on one of the two
    const between = MAP.dirOf(M, 3, 3, 3 + DIRS[d][0] * 3 + DIRS[(d + 1) % 6][0], 3 + DIRS[d][1] * 3 + DIRS[(d + 1) % 6][1]);
    t.ok(between === d || between === (d + 1) % 6, 'off-axis target between ' + d + ' and ' + (d + 1));
  }
  t.eq(MAP.dirOf(M, 2, 2, 2, 2), 0, 'target is the origin');
  t.eq(MAP.dirOf(M, 0, 0, 5, 0), 0, 'east'); t.eq(MAP.dirOf(M, 0, 0, -5, 2), 3, 'west-ish'); t.eq(MAP.dirOf(M, 0, 0, 0, 7), 5, 'SE'); t.eq(MAP.dirOf(M, 0, 0, 4, -8), 2, 'up left-ish is NW');
});

// ================================================================== pixels
t.test('pixel helpers: geometry, exact round trip for every tile, jitter inside the hex', () => {
  const s = 46, w = Math.sqrt(3) * s;
  t.deep(MAP.toPixel(0, 0, s), { x: 0, y: 0 }, 'origin is the centre of hex (0,0)');
  t.near(MAP.toPixel(1, 0, s).x, w, 1e-9, 'width sqrt(3) * size'); t.near(MAP.toPixel(0, 1, s).y, 1.5 * s, 1e-9, 'row pitch 1.5 * size');
  t.near(MAP.toPixel(0, 1, s).x, w / 2, 1e-9, 'odd row shifted right by half a width'); t.near(MAP.toPixel(-1, 2, s).x, 0, 1e-9, 'row 2 column 0 is straight under column 0');
  t.eq(MAP.toPixel(2, 3).x, MAP.toPixel(2, 3, EM.hexSize).x, 'size defaults to ECONOMY.map.hexSize');
  const M = MAPS[0].M;
  let bad = 0, jit = 0;
  all(M).forEach((tl) => {
    const p = MAP.toPixel(tl.q, tl.r, s), back = MAP.fromPixel(p.x, p.y, s);
    if (back.q !== tl.q || back.r !== tl.r) bad++;
    for (let a = 0; a < 12; a++) {                                         // inside the inscribed circle every point belongs to this hex
      const ang = a * Math.PI / 6 + 0.1, rad = 0.8 * (w / 2);
      const f = MAP.fromPixel(p.x + rad * Math.cos(ang), p.y + rad * Math.sin(ang), s);
      if (f.q !== tl.q || f.r !== tl.r) jit++;
    }
    const cs = MAP.corners(p.x, p.y, s);
    if (cs.length !== 6 || cs.some((c) => Math.abs(Math.hypot(c.x - p.x, c.y - p.y) - s) > 1e-9)) bad++;
    for (let i = 0; i < 6; i++) if (Math.abs(Math.hypot(cs[i].x - cs[(i + 1) % 6].x, cs[i].y - cs[(i + 1) % 6].y) - s) > 1e-9) bad++;
  });
  t.eq(bad, 0, 'fromPixel(toPixel(tile)) is the tile and every hex has six corners at radius size'); t.eq(jit, 0, 'jittered points map to their own hex');
  const c0 = MAP.corners(0, 0, 10);
  t.near(c0[0].x, 10 * Math.cos(-Math.PI / 6), 1e-9, 'corner 0 is top-right'); t.ok(c0[0].y < 0 && c0[5].y < c0[0].y && Math.abs(c0[5].x) < 1e-9, 'pointy top: corner 5 is straight up');
  const b = MAP.bounds(M, s);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  all(M).forEach((tl) => { const p = MAP.toPixel(tl.q, tl.r, s); MAP.corners(p.x, p.y, s).forEach((c) => { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }); });
  t.near(b.x0, x0, 1e-6, 'bounds x0 is tight'); t.near(b.y0, y0, 1e-6, 'bounds y0 is tight'); t.near(b.x1, x1, 1e-6, 'bounds x1 is tight'); t.near(b.y1, y1, 1e-6, 'bounds y1 is tight');
  t.eq(MAP.fromPixel(-0.001, 0.001, s).q + 0, 0, 'no negative zero');
});

// ================================================================== generation
t.test('shape of a generated map (900 maps)', () => {
  rule('layout, columns, types, flags', (M, ch) => {
    if (M.v !== 1 || M.chapter !== ch || M.cols !== 21 || M.rows !== 13) return 'header';
    if (Object.keys(M.tiles).length !== 273) return 'tile count';
    const types = DATA.LISTS.tiles;
    for (const r of [0, 12]) for (const c of [0, 20]) if (!cr(M, c, r)) return 'corner missing';
    for (const tl of all(M)) {
      if (M.tiles[key(tl.q, tl.r)] !== tl) return 'key mismatch';
      const cl = colOf(tl); if (cl < 0 || cl > 20 || tl.r < 0 || tl.r > 12) return 'tile off the page ' + key(tl.q, tl.r);
      if (!oneOf(types, tl.type)) return 'type ' + tl.type;
      if (typeof tl.painted !== 'boolean' || typeof tl.known !== 'boolean' || typeof tl.done !== 'boolean' || tl.done) return 'flags';
      if (typeof tl.diff !== 'number' || tl.diff < 0 || tl.diff > 1 || !tl.content || typeof tl.content !== 'object') return 'diff/content';
    }
    if (colOf(M.start) !== EM.startCol || colOf(M.boss) !== EM.bossCol) return 'start and boss columns ' + colOf(M.start) + ', ' + colOf(M.boss);
    if (Math.abs(M.start.r - M.boss.r) > 6) return 'rows apart';
    if (T(M, M.start.q, M.start.r).type !== 'start' || T(M, M.boss.q, M.boss.r).type !== 'boss') return 'start or boss type';
    if (M.pos.q !== M.start.q || M.pos.r !== M.start.r) return 'pos';
    if (!Number.isInteger(M.attempts) || M.attempts < 1 || M.attempts > 41) return 'attempts ' + M.attempts;
    if (all(M).filter((x) => x.type === 'start').length !== 1 || all(M).filter((x) => x.type === 'boss').length !== 1) return 'one start, one boss';
  });
  rule('ring painted and empty, nothing else painted', (M) => {
    for (const tl of all(M)) {
      const ring = hex(M.start, tl) <= EM.startRing;
      if (ring && tl.type === 'block') return 'Void in the ring';
      if (tl.painted !== ring) return 'painted flag at ' + key(tl.q, tl.r);
      if (ring && tl.type !== 'empty' && tl.type !== 'start') return 'ring content at ' + key(tl.q, tl.r) + ' ' + tl.type;
      if (tl.type === 'block' && tl.painted) return 'Void painted';
    }
  });
  rule('known: landmarks and painted tiles only', (M) => {
    for (const tl of all(M)) if (tl.known !== (tl.painted || oneOf(LANDMARKS, tl.type))) return `known at ${key(tl.q, tl.r)} (${tl.type}, painted ${tl.painted}) is ${tl.known}`;
  });
  rule('no Void near the start (first frontier stays open)', (M) => { for (const tl of all(M)) if (tl.type === 'block' && hex(M.start, tl) <= 3) return 'Void within 3 of the start'; });
  const starts = new Set(MAPS.map((m) => m.M.start.r)), bosses = new Set(MAPS.map((m) => m.M.boss.r));
  t.ok(starts.size >= 4 && bosses.size >= 4, 'start and boss rows vary (' + [...starts].sort() + ' / ' + [...bosses].sort() + ')');
  t.ok([...starts].concat([...bosses]).every((r) => r >= 3 && r <= 9), 'start and boss stay near the middle rows');
});
t.test('counts follow DATA.tileCount (plus one elite in Act 3), Void share 8 to 16 percent, clustered', () => {
  rule('tile counts', (M, ch) => {
    const nonBlock = all(M).filter((x) => x.type !== 'block').length;
    for (const type of Object.keys(E.dist)) {
      const have = all(M).filter((x) => x.type === type).length, want = expectedCount(type, nonBlock, ch);
      if (have !== want) return `${type}: ${have} != ${want}`;
      if (have < (E.countMin[type] || 0) || have > (E.countMax[type] === undefined ? 1e9 : E.countMax[type])) return type + ' outside min/max';
      if (MAP.tileTarget(type, nonBlock, ch) !== want) return 'tileTarget ' + type;
    }
  });
  rule('Void share', (M) => { const b = all(M).filter((x) => x.type === 'block').length / 273; if (b < 0.08 || b > 0.16) return 'share ' + b.toFixed(3); });
  const avg = (ch) => { const l = MAPS.filter((m) => m.ch === ch); return l.reduce((s, m) => s + all(m.M).filter((x) => x.type === 'block').length / 273, 0) / l.length; };
  t.ok(avg(1) > 0.105 && avg(1) < 0.145, 'chapter 1 averages about blockFrac: ' + avg(1).toFixed(3));
  t.ok(avg(3) > avg(1) + 0.015 && avg(3) <= 0.16, 'chapter 3 has a bit more Void: ' + avg(3).toFixed(3) + ' vs ' + avg(1).toFixed(3));
  rule('chapter 3 has one extra elite, other chapters do not', (M, ch) => {
    const nonBlock = all(M).filter((x) => x.type !== 'block').length, plain = DATA.tileCount('elite', nonBlock), have = all(M).filter((x) => x.type === 'elite').length;
    if (have !== (ch === 3 ? Math.min(E.countMax.elite, plain + 1) : plain)) return `elites ${have}, plain ${plain}`;
  });
  rule('Void comes in blots and rivers: no lone tile, few large masses', (M) => {
    const blocks = all(M).filter((x) => x.type === 'block');
    if (blocks.some((b) => !nbrs(M, b).some((n) => n.type === 'block'))) return 'a lone Void tile';
    const seen = new Set(); let comps = 0, biggest = 0;
    blocks.forEach((b) => {
      if (seen.has(key(b.q, b.r))) return;
      comps++; let size = 0; const st = [b]; seen.add(key(b.q, b.r));
      while (st.length) { const c = st.pop(); size++; nbrs(M, c).forEach((n) => { if (n.type === 'block' && !seen.has(key(n.q, n.r))) { seen.add(key(n.q, n.r)); st.push(n); } }); }
      biggest = Math.max(biggest, size);
    });
    if (comps > 10) return comps + ' separate masses (salt and pepper)';
    if (blocks.length / comps < 3) return 'masses too small on average';
    if (biggest > 34) return 'one mass of ' + biggest;
  });
});
t.test('connectivity: start to boss, every tile and every landmark reachable, boss has open neighbours', () => {
  rule('all non-block tiles reachable from the start', (M) => {
    const d = flood(M, [T(M, M.start.q, M.start.r)]);
    for (const tl of all(M)) if (tl.type !== 'block' && !d.has(key(tl.q, tl.r))) return `${tl.type} at ${key(tl.q, tl.r)} unreachable`;
    if (!d.has(key(M.boss.q, M.boss.r))) return 'boss unreachable';
  });
  rule('boss has at least 2 (we build 3) non-block neighbours', (M) => { const n = nbrs(M, M.boss).filter((x) => x.type !== 'block').length; if (n < 3) return 'only ' + n; });
  rule('landmarks are never walled in (each has an open neighbour)', (M) => { for (const tl of all(M)) if (oneOf(LANDMARKS, tl.type) && !nbrs(M, tl).some((n) => n.type !== 'block')) return 'walled in ' + tl.type; });
});
t.test('solvability: minInk within ECONOMY.map.solve, matches MAP.solve, retries are rare', () => {
  rule('minInk (own BFS) in 16..22 and equal to MAP.solve', (M) => {
    const mine = paintCost(M, M.boss), s = MAP.solve(M);
    if (!(mine >= EM.solve.min && mine <= EM.solve.max)) return 'minInk ' + mine;
    if (!s.ok || s.minInk !== mine || s.path.length !== mine) return `MAP.solve says ${s.minInk}, own BFS ${mine}`;
    const last = s.path[s.path.length - 1]; if (last[0] !== M.boss.q || last[1] !== M.boss.r) return 'solve path does not end at the boss';
  });
  const tried = MAPS.reduce((n, m) => n + (m.M.attempts > 1 ? 1 : 0), 0), hist = {};
  MAPS.forEach((m) => { hist[m.M.attempts] = (hist[m.M.attempts] || 0) + 1; });
  t.ok(tried / MAPS.length < 0.08, 'fewer than 8 percent of maps needed a retry: ' + JSON.stringify(hist));
  t.ok(MAPS.every((m) => m.M.attempts <= 40), 'no map fell through to the safe layout at the default settings');
  const floor = EM.bossCol - EM.startCol - EM.startRing;
  t.eq(floor, 16, 'floor is the column geometry');
  const spread = new Set(MAPS.map((m) => paintCost(m.M, m.M.boss)));
  t.ok(spread.size >= 6 && Math.min(...spread) === 16, 'the cheapest route varies over 16..22: ' + [...spread].sort());
  rule('the cheapest routes are not single file (open room beside the route)', (M) => {
    const ring = ringOf(M), dR = flood(M, ring), dB = flood(M, [M.boss]), min = dR.get(key(M.boss.q, M.boss.r));
    let near = 0; all(M).forEach((tl) => { const k = key(tl.q, tl.r); if (tl.type !== 'block' && dR.get(k) > 0 && dR.get(k) + dB.get(k) <= min + 2) near++; });
    if (near / min < 2.4) return 'corridor width ' + (near / min).toFixed(2);
  });
});
t.test('the spine is a real cheapest route; wells sit on it and beside it', () => {
  rule('spine: minInk long, adjacent chain from the ring edge to the boss over open ground', (M) => {
    const sp = MAP.spine(M);
    if (sp.length !== paintCost(M, M.boss)) return 'length ' + sp.length;
    const ring = ringOf(M).map((x) => key(x.q, x.r));
    if (!DIRS.some((d) => oneOf(ring, key(sp[0][0] + d[0], sp[0][1] + d[1]))) || oneOf(ring, key(sp[0][0], sp[0][1]))) return 'does not start next to the ring';
    for (let i = 0; i < sp.length; i++) {
      const tl = T(M, sp[i][0], sp[i][1]);
      if (!tl || tl.type === 'block' || oneOf(ring, key(tl.q, tl.r))) return 'bad tile ' + i;
      if (i && MAP.dist(sp[i - 1][0], sp[i - 1][1], sp[i][0], sp[i][1]) !== 1) return 'gap at ' + i;
    }
    if (sp[sp.length - 1][0] !== M.boss.q || sp[sp.length - 1][1] !== M.boss.r) return 'ends elsewhere';
  });
  // side of the route's direction of travel: nearest route tile by pixel distance, tangent over two tiles each way, perpendicular offset at least 1.2
  const sideOf = (M, sp, w) => {
    let k = 0, bd = 1e9; sp.forEach((c, i) => { const d = Math.hypot(px(c).x - px(w).x, px(c).y - px(w).y); if (d < bd - 1e-9) { bd = d; k = i; } });
    const a = px(sp[Math.max(0, k - 2)]), b = px(sp[Math.min(sp.length - 1, k + 2)]), c = px(sp[k]), p = px(w);
    const tx = b.x - a.x, ty = b.y - a.y, cross = (tx * (p.y - c.y) - ty * (p.x - c.x)) / Math.hypot(tx, ty);
    return Math.abs(cross) < 1.2 ? 0 : cross < 0 ? -1 : 1;
  };
  rule('wells: count, ink, at least 3 within 3 hexes of the cheapest route, never all on one side', (M) => {
    const sp = MAP.spine(M).map((c) => T(M, c[0], c[1])), wells = all(M).filter((x) => x.type === 'well');
    if (wells.some((w) => w.content.ink !== E.wellInk)) return 'well ink';
    const near = wells.filter((w) => sp.some((c) => hex(c, w) <= EM.wells.within));
    if (near.length < EM.wells.count) return 'only ' + near.length + ' near';
    const sides = near.map((w) => sideOf(M, sp, w));
    if (!(sides.some((s) => s < 0) && sides.some((s) => s > 0))) return 'all on one side ' + sides;
  });
  rule('wells near the cheapest route holds for ANY cheapest route, not just the spine', (M) => {
    // own path: walk back from the boss taking the first predecessor, then check the wells against it
    const dR = flood(M, ringOf(M)); let c = T(M, M.boss.q, M.boss.r); const path = [c];
    while (dR.get(key(c.q, c.r)) > 1) { const want = dR.get(key(c.q, c.r)) - 1; c = nbrs(M, c).find((n) => n.type !== 'block' && dR.get(key(n.q, n.r)) === want); path.push(c); }
    const near = all(M).filter((x) => x.type === 'well' && path.some((p) => hex(p, x) <= 3)).length;
    if (near < 3) return 'only ' + near;
  });
  rule('three wells on the route at positions the starting Ink can pay for (a pure rush is solvable on wells alone)', (M) => {
    const sp = MAP.spine(M).map((c) => T(M, c[0], c[1]));
    if (sp.filter((x) => x.type === 'well').length < 3) return 'fewer than 3 wells on the spine';
    let ink = E.startInk;
    for (const tl of sp) { if (ink < 1) return 'ran dry before ' + key(tl.q, tl.r); ink -= E.paintCost; if (tl.type === 'well') ink = Math.min(E.inkMax, ink + E.wellInk); }
  });
  rule('a rush meets a sane number of fights (at most 7 enemies on the cheapest route, never an elite on it)', (M) => {
    const sp = MAP.spine(M).map((c) => T(M, c[0], c[1]));
    if (sp.filter((x) => x.type === 'enemy').length > 7) return 'too many fights on the route';
    if (sp.some((x) => x.type === 'elite')) return 'elite on the route';
  });
});
t.test('spine ignores unmuted flags and solve tracks them', () => {
  const fresh = MAP.generate({ chapter: 2, seed: 61 }), played = playedPage(61, 2, 80);
  t.deep(MAP.spine(played), MAP.spine(fresh), 'the spine of a half painted page is the spine of the fresh page');
  t.eq(MAP.spine(fresh).length, MAP.solve(fresh).minInk, 'on a fresh page it is exactly minInk cells long');
  t.ok(MAP.solve(played).minInk < MAP.solve(fresh).minInk || MAP.solve(played).minInk === 0, 'while solve shrinks as the page is painted');
});
t.test('placement rules: elites, camps, shops, chests, forges, gem caches, Buskers', () => {
  const minPair = (M, type) => { const a = all(M).filter((x) => x.type === type); let m = 99; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) m = Math.min(m, hex(a[i], a[j])); return m; };
  rule('elites never within 3 hexes of the start or boss, spread apart', (M) => {
    for (const e of all(M).filter((x) => x.type === 'elite')) if (hex(M.start, e) < 4 || hex(M.boss, e) < 4) return 'elite too close ' + key(e.q, e.r);
    if (minPair(M, 'elite') < 4) return 'elites ' + minPair(M, 'elite') + ' apart';
  });
  rule('camps, shops, chests, forges, gem caches and brushes are spread out', (M) => {
    const want = { camp: 3, shop: 4, chest: 3, forge: 5, gemcache: 4, brush: 4 };
    for (const k of Object.keys(want)) if (minPair(M, k) < want[k]) return `${k} only ${minPair(M, k)} apart`;
  });
  rule('one camp and one shop near the middle of the route, a camp before the boss, a shop early', (M) => {
    const sp = MAP.spine(M).map((c) => T(M, c[0], c[1])), L = sp.length;
    const mid = (x) => sp.some((c, i) => hex(c, x) <= 3 && (i + 1) / L >= 0.3 && (i + 1) / L <= 0.7);
    if (!all(M).some((x) => x.type === 'camp' && mid(x))) return 'no mid camp';
    if (!all(M).some((x) => x.type === 'shop' && mid(x))) return 'no mid shop';
    if (!all(M).some((x) => x.type === 'camp' && hex(M.boss, x) >= 3 && hex(M.boss, x) <= 7)) return 'no camp before the boss';
    if (!all(M).some((x) => x.type === 'shop' && x.diff <= 0.4 && x.diff >= 0.1)) return 'no early shop';
  });
  rule('most elites guard a chest next to them', (M) => {
    const es = all(M).filter((x) => x.type === 'elite'), guarded = es.filter((e) => all(M).some((c) => c.type === 'chest' && hex(c, e) <= 2)).length;
    if (guarded < Math.ceil(es.length * 0.5)) return `${guarded} of ${es.length} guard a chest`;
  });
  rule('a brush rack within reach early', (M) => { if (!all(M).some((x) => x.type === 'brush' && x.diff <= 0.45)) return 'no early brush'; });
});
t.test('content payloads', () => {
  rule('chest, brush, well, shop, enemy, elite, boss contents', (M) => {
    let relic = 0, gems = 0;
    for (const tl of all(M)) {
      const c = tl.content;
      if (tl.type === 'chest') {
        if (!(c.gold >= E.gold.chest[0] && c.gold <= E.gold.chest[1] && Number.isInteger(c.gold))) return 'chest gold';
        if (typeof c.gems !== 'boolean' || (c.relic === null) !== c.gems) return 'exactly one of relic and gems';
        if (c.relic !== null && !oneOf(['common', 'uncommon', 'rare'], c.relic)) return 'relic rarity ' + c.relic;
        if (c.relic) relic++; else gems++;
      } else if (tl.type === 'brush') { if (!DATA.brushes[c.id]) return 'brush id ' + c.id; }
      else if (tl.type === 'well') { if (c.ink !== E.wellInk) return 'well ink'; }
      else if (tl.type === 'shop') { if (!Number.isInteger(c.seed) || !c.shop || c.shop.seed !== c.seed) return 'shop seed'; }
      else if (tl.type === 'enemy') { if (c.tier !== 'normal' || c.enc !== undefined) return 'enemy hint'; }
      else if (tl.type === 'elite') { if (c.tier !== 'elite' || c.enc !== undefined) return 'elite hint'; }
      else if (Object.keys(c).length) return `${tl.type} should have empty content`;
    }
    if (!relic || !gems) return 'a page needs both relic and gem chests: ' + relic + '/' + gems;
  });
  const shopSeeds = new Set(); MAPS.slice(0, 50).forEach((m) => all(m.M).filter((x) => x.type === 'shop').forEach((s) => shopSeeds.add(s.content.seed)));
  t.ok(shopSeeds.size > 200, 'shop seeds differ per tile');
  const brushKinds = new Set(); MAPS.forEach((m) => all(m.M).filter((x) => x.type === 'brush').forEach((b) => brushKinds.add(b.content.id)));
  t.deep([...brushKinds].sort(), Object.keys(DATA.brushes).sort(), 'every brush appears on some racks');
  const rel = MAPS.reduce((n, m) => n + all(m.M).filter((x) => x.type === 'chest' && x.content.relic).length, 0), gm = MAPS.reduce((n, m) => n + all(m.M).filter((x) => x.type === 'chest' && x.content.gems).length, 0);
  t.ok(Math.abs(rel - gm) / (rel + gm) < 0.2, 'relic and gem chests are about even: ' + rel + '/' + gm);
});
t.test('diff = clamp(dist(start, tile) / dist(start, boss)) to 2 decimals, and it rises with distance', () => {
  rule('diff formula', (M) => {
    const total = hex(M.start, M.boss);
    for (const tl of all(M)) { const want = Math.min(1, Math.max(0, Math.round(hex(M.start, tl) / total * 100) / 100)); if (tl.diff !== want) return `diff ${tl.diff} != ${want} at ${key(tl.q, tl.r)}`; }
  });
  const M = MAPS[5].M, near = all(M).filter((x) => hex(M.start, x) <= 5), far = all(M).filter((x) => hex(M.start, x) >= 12);
  const mean = (l) => l.reduce((s, x) => s + x.diff, 0) / l.length;
  t.ok(mean(far) > mean(near) + 0.4, 'far tiles are harder'); t.eq(T(M, M.start.q, M.start.r).diff, 0, 'start diff 0'); t.eq(T(M, M.boss.q, M.boss.r).diff, 1, 'boss diff 1');
  const eDiff = MAPS.flatMap((m) => all(m.M).filter((x) => x.type === 'elite').map((x) => x.diff)), eMean = eDiff.reduce((a, b) => a + b, 0) / eDiff.length;
  t.ok(Math.min(...eDiff) >= 0.2 && eMean > 0.45 && eMean < 0.75, 'elites are never at the very start and sit mid page on average (' + eMean.toFixed(2) + ')');
});
t.test('the audit passes on every fresh map and catches planted defects', () => {
  rule('MAP.audit is clean', (M) => { const a = MAP.audit(M); if (a.length) return a.join('; '); });
  const base = MAPS[3].M;
  const plant = (fn) => { const M = MAP.deserialize(MAP.serialize(base)); fn(M); return MAP.audit(M); };
  t.ok(plant((M) => { all(M).find((x) => x.type === 'well').type = 'empty'; }).length > 0, 'a missing well is caught');
  t.ok(plant((M) => { T(M, M.boss.q, M.boss.r).type = 'empty'; }).length > 0, 'a boss that is not typed boss');
  t.ok(plant((M) => { all(M).filter((x) => x.type === 'block').forEach((b) => { if (hex(M.start, b) <= 5) b.type = 'empty'; }); M.tiles[key(M.start.q + 2, M.start.r)].type = 'block'; }).length > 0, 'Void inside the ring');
  t.ok(plant((M) => { M.pos = { q: M.boss.q, r: M.boss.r }; }).length > 0, 'not on the start');
  t.ok(plant((M) => { all(M).forEach((x) => { if (x.type === 'block') x.type = 'empty'; }); }).length > 0, 'no Void at all');
  t.ok(plant((M) => { all(M).find((x) => x.type === 'elite').type = 'empty'; all(M).find((x) => x.type === 'empty' && hex(M.start, x) === 4).type = 'elite'; }).length > 0, 'an elite too close to the start');
});
t.test('determinism: same arguments same map, different seeds and Acts differ, no hidden state', () => {
  for (const ch of CHAPTERS) for (let s = 1; s <= 40; s++) {
    const seed = s * 7919 + ch * 104729, a = JSON.stringify(MAP.generate({ chapter: ch, seed })), b = JSON.stringify(MAP.generate({ seed, chapter: ch }));
    t.ok(a === b, `ch${ch} seed ${seed} regenerates identically`);
    t.ok(a === JSON.stringify(MAPS[(ch - 1) * SEEDS + s - 1].M), `ch${ch} seed ${seed} matches the earlier build (generation order does not matter)`);
  }
  const uniq = new Set(MAPS.map((m) => JSON.stringify(m.M)));
  t.eq(uniq.size, MAPS.length, 'all 900 pages differ');
  const layout = (M) => all(M).map((x) => x.type).join(',');
  t.ok(new Set(MAPS.map((m) => layout(m.M))).size === MAPS.length, 'and their layouts differ');
  for (let s = 1; s <= 30; s++) {
    const seed = s * 31;
    t.ok(layout(MAP.generate({ chapter: 1, seed })) !== layout(MAP.generate({ chapter: 2, seed })), 'the chapter number changes the stream (seed ' + seed + ')');
  }
  t.ok(JSON.stringify(MAP.generate({ chapter: 1, seed: 5 })) !== JSON.stringify(MAP.generate({ chapter: 1, seed: 6 })), 'seed 5 and 6 differ');
  const noArgs = MAP.generate(), weird = [MAP.generate({}), MAP.generate({ chapter: 7, seed: -5 }), MAP.generate({ chapter: 2, seed: 3.7 }), MAP.generate({ chapter: 'x', seed: NaN }), MAP.generate({ chapter: 2, seed: 0xffffffff })];
  [noArgs].concat(weird).forEach((M, i) => t.eq(MAP.audit(M).length, 0, 'odd arguments still give a valid page #' + i + ': ' + MAP.audit(M).join('; ')));
  t.eq(noArgs.chapter, 1, 'chapter defaults to 1'); t.eq(weird[1].chapter, 7, 'chapter 7 is accepted'); t.eq(JSON.stringify(MAP.generate({ chapter: 1, seed: 0 })), JSON.stringify(noArgs), 'seed defaults to 0');
  t.eq(MAP.generate({ chapter: 1, seed: 77 }).seed, 77, 'M.seed echoes the seed given');
});
t.test('retries: an impossible solve range falls back to the safe layout in bounded time', () => {
  const saved = JSON.stringify(EM.solve);
  EM.solve = { min: 40, max: 50 };
  const M = MAP.generate({ chapter: 1, seed: 99 });
  EM.solve = JSON.parse(saved);
  t.eq(M.attempts, 41, 'forty retries then the safe layout');
  t.ok(paintCost(M, M.boss) >= 16 && paintCost(M, M.boss) < 40, 'the safe layout is still a valid page (cheapest route ' + paintCost(M, M.boss) + ')');
  const dead = flood(M, [T(M, M.start.q, M.start.r)]); t.ok(all(M).every((x) => x.type === 'block' || dead.has(key(x.q, x.r))), 'and it is connected');
  t.eq(MAP.audit(MAP.generate({ chapter: 1, seed: 99 })).length, 0, 'the default range is restored');
  const safeLayouts = new Set(); EM.solve = { min: 40, max: 50 }; for (let s = 1; s <= 12; s++) safeLayouts.add(all(MAP.generate({ chapter: 2, seed: s })).map((x) => x.type).join('')); EM.solve = JSON.parse(saved);
  t.eq(safeLayouts.size, 12, 'safe pages still differ by seed');
  // the safe layout is a valid map on its own: connected, cheapest route inside the real range, counts right, and it never needs a retry to be right
  EM.solve = { min: 40, max: 50 };
  const safeMaps = []; for (const ch of CHAPTERS) for (let s = 1; s <= 40; s++) safeMaps.push({ ch, seed: s * 31 + ch, M: MAP.generate({ chapter: ch, seed: s * 31 + ch }) });
  EM.solve = JSON.parse(saved);
  rule('safe layout: connected, route 16..22, counts, boss neighbours (audit apart from the solve range)', (M) => {
    const cost = paintCost(M, M.boss);
    if (cost < 16 || cost > 22) return 'route ' + cost;
    const d = flood(M, [T(M, M.start.q, M.start.r)]);
    if (all(M).some((x) => x.type !== 'block' && !d.has(key(x.q, x.r)))) return 'not connected';
    const nonBlock = all(M).filter((x) => x.type !== 'block').length;
    for (const type of Object.keys(E.dist)) if (all(M).filter((x) => x.type === type).length !== expectedCount(type, nonBlock, M.chapter)) return 'count of ' + type;
    const share = all(M).filter((x) => x.type === 'block').length / 273; if (share < 0.08 || share > 0.16) return 'void share ' + share;
    if (M.attempts !== 41) return 'attempts ' + M.attempts;
  }, safeMaps);
  // retry semantics: a map that needed a second candidate IS the first candidate of seed U.hash(seed, 'retry', 1)
  const retried = MAPS.filter((m) => m.M.attempts === 2);
  t.ok(retried.length > 0, 'some pages needed a retry (' + retried.length + ')');
  retried.forEach((m) => {
    const alt = MAP.generate({ chapter: m.ch, seed: U.hash(m.seed, 'retry', 1) });
    t.ok(alt.attempts === 1 && JSON.stringify(alt.tiles) === JSON.stringify(m.M.tiles) && JSON.stringify(alt.start) === JSON.stringify(m.M.start), `ch${m.ch} seed ${m.seed}: attempt 2 uses U.hash(seed, 'retry', 1)`);
  });
});
t.test('save round trip', () => {
  const base = MAPS[10].M;
  const M = MAP.deserialize(MAP.serialize(base));
  t.deep(M, base, 'deserialize(serialize(M)) equals M');
  const fresh = MAP.serialize(base);
  t.eq(JSON.stringify(fresh), JSON.stringify(JSON.parse(JSON.stringify(fresh))), 'serialize output is plain JSON');
  t.eq(fresh.v, 1, 'version field');
  const walk = (o) => { if (typeof o === 'function') return true; if (o && typeof o === 'object') return Object.keys(o).some((k) => walk(o[k])); return false; };
  t.ok(!walk(fresh), 'no functions anywhere');
  // play a little, save, load, compare
  const P = MAP.deserialize(MAP.serialize(base));
  for (let i = 0; i < 25; i++) { const f = MAP.frontier(P); MAP.paint(P, f[i * 7 % f.length].q, f[i * 7 % f.length].r); }
  const step = MAP.walkPath(P, P.start.q + 1, P.start.r); MAP.move(P, step[0][0], step[0][1]);
  const done = MAP.painted(P).filter((x) => x.type !== 'empty' && x.type !== 'start'); if (done.length) done[0].done = true;
  const Q = MAP.deserialize(JSON.parse(JSON.stringify(MAP.serialize(P))));
  t.deep(Q, P, 'a half-played page survives a JSON trip');
  t.eq(MAP.painted(Q).length, MAP.painted(P).length, 'painted flags preserved'); t.deep(Q.pos, P.pos, 'pos preserved');
  if (done.length) t.ok(T(Q, done[0].q, done[0].r).done, 'done flag preserved');
  Q.tiles[key(P.start.q, P.start.r)].painted = false; t.ok(T(P, P.start.q, P.start.r).painted, 'deserialize copies: the original is untouched');
  const S = MAP.serialize(P); S.tiles[key(P.start.q, P.start.r)].type = 'boss'; t.eq(T(P, P.start.q, P.start.r).type, 'start', 'serialize copies too');
  t.eq(MAP.deserialize(null), null, 'null'); t.eq(MAP.deserialize({}), null, 'empty object'); t.eq(MAP.deserialize('x'), null, 'string');
  const wrong = MAP.serialize(base); wrong.v = 2; t.eq(MAP.deserialize(wrong), null, 'other version is refused');
  const holes = MAP.serialize(base); delete holes.tiles[Object.keys(holes.tiles)[5]]; t.eq(MAP.deserialize(holes), null, 'a missing tile is refused');
  const typo = MAP.serialize(base); typo.tiles[Object.keys(typo.tiles)[5]].type = 'lava'; t.eq(MAP.deserialize(typo), null, 'an unknown tile type is refused');
  const mess = MAP.serialize(base); const k0 = Object.keys(mess.tiles)[9]; mess.tiles[k0].painted = 1; mess.tiles[k0].done = 'yes'; mess.tiles[k0].content = 5; mess.tiles[k0].diff = 'x'; mess.pos = { q: 999, r: 999 };
  const fixed = MAP.deserialize(mess);
  t.ok(fixed && fixed.tiles[k0].painted === true && fixed.tiles[k0].done === true && typeof fixed.tiles[k0].diff === 'number' && typeof fixed.tiles[k0].content === 'object', 'sloppy flags are normalised');
  t.deep(fixed.pos, fixed.start, 'a bad pos falls back to the start');
  const blk = all(base).find((x) => x.type === 'block'); const evil = MAP.serialize(base); evil.tiles[key(blk.q, blk.r)].painted = true; t.eq(MAP.deserialize(evil).tiles[key(blk.q, blk.r)].painted, false, 'Void is never painted');
  const extra = MAP.serialize(base); extra.note = 'kept'; t.eq(MAP.deserialize(extra).note, 'kept', 'unknown top-level fields survive');
});

// ================================================================== Spells
// independent reference implementation of DESIGN 4.8
function refBrush(M, id, q, r, dir) {
  const b = DATA.brushes[id], o = T(M, q, r), mod = (d) => ((d % 6) + 6) % 6;
  if (!o) return { ok: false, cells: [] };
  const free = (a, c) => { const x = T(M, a, c); return !!x && !x.painted && x.type !== 'block'; };
  const touches = (a, c) => DIRS.some((d) => { const x = T(M, a + d[0], c + d[1]); return !!x && x.painted && x.type !== 'block'; });
  let cs = [], originOk = false;
  if (b.kind === 'line') { originOk = o.painted && Number.isInteger(dir); if (originOk) for (let k = 1; k <= b.len; k++) cs.push([q + DIRS[mod(dir)][0] * k, r + DIRS[mod(dir)][1] * k]); }
  else if (b.kind === 'fan') { originOk = o.painted && Number.isInteger(dir); if (originOk) [-1, 0, 1].forEach((k) => cs.push([q + DIRS[mod(dir + k)][0], r + DIRS[mod(dir + k)][1]])); }
  else if (b.kind === 'ring') { originOk = o.painted; cs = DIRS.map((d) => [q + d[0], r + d[1]]); }
  else if (b.kind === 'blob') { originOk = free(q, r) && touches(q, r); cs = [[q, r]].concat(DIRS.map((d) => [q + d[0], r + d[1]])); }
  else if (b.kind === 'dot') { originOk = free(q, r) && hex(M.pos, o) <= 4; cs = [[q, r]]; }
  cs = originOk ? cs.filter((c) => free(c[0], c[1])) : [];
  return { ok: originOk && cs.length > 0, cells: cs };
}
// a half-unmuted real map: some hexes unmuted by chains and by a Spell, so hidden, unmuted and Void tiles all sit next to each other
function playedPage(seed, ch, paints) {
  const M = MAP.generate({ chapter: ch, seed });
  const rng = U.rng(seed);
  for (let i = 0; i < paints; i++) { const f = MAP.frontier(M); if (!f.length) break; const p = f[Math.floor(rng() * f.length)]; MAP.paint(M, p.q, p.r); }
  return M;
}
t.test('Spell kinds in DATA.brushes are exactly the geometries implemented', () => {
  const ids = Object.keys(DATA.brushes);
  t.ok(ids.length >= 6, 'six brushes'); t.deep(ids.map((i) => DATA.brushes[i].kind).sort(), ['blob', 'dot', 'fan', 'line', 'line', 'ring'], 'kinds: line x2, fan, blob, ring, dot');
  t.deep(ids.filter((i) => DATA.brushes[i].kind === 'line').map((i) => DATA.brushes[i].len).sort(), [3, 5], 'stroke 3 and wave 5');
  const M = blank(13, 11); setPainted(M, [cr(M, 6, 5)]);
  t.deep(MAP.canBrush(M, 'nope', 5, 5, 0), { ok: false, reason: 'brush' }, 'unknown brush id');
  t.deep(MAP.brushCells(M, 'nope', 5, 5, 0), [], 'no cells for an unknown id');
  DATA.LISTS.brushKinds.forEach((k) => t.ok(ids.some((i) => DATA.brushes[i].kind === k), 'a brush of kind ' + k));
});
t.test('Spell geometry by hand: one unmuted hex in the middle of a blank map', () => {
  const M = blank(15, 11), P = cr(M, 7, 5); setPainted(M, [P]); M.pos = { q: P.q, r: P.r };
  const at = (k, d) => [P.q + DIRS[d][0] * k, P.r + DIRS[d][1] * k];
  for (let d = 0; d < 6; d++) {
    t.deep(MAP.brushCells(M, 'stroke', P.q, P.r, d), [1, 2, 3].map((k) => at(k, d)), 'stroke dir ' + d + ': three hexes nearest first');
    t.deep(MAP.brushCells(M, 'wave', P.q, P.r, d), [1, 2, 3, 4, 5].map((k) => at(k, d)), 'wave dir ' + d + ': five hexes');
    t.deep(MAP.brushCells(M, 'fan', P.q, P.r, d), [-1, 0, 1].map((k) => at(1, (d + k + 6) % 6)), 'fan dir ' + d + ': neighbours dir-1, dir, dir+1');
    // splash: anchor is the neighbour in direction d, hidden and touching the unmuted hex
    const A = at(1, d), sp = MAP.brushCells(M, 'splash', A[0], A[1], 0);
    t.eq(sp.length, 6, 'splash next to one painted hex paints 6 (its 7 cells minus the painted one)'); t.deep(sp[0], A, 'splash starts on the anchor');
    t.ok(!cells(sp).includes(key(P.q, P.r)), 'splash never repaints');
  }
  t.deep(MAP.brushCells(M, 'halo', P.q, P.r, 0), DIRS.map((d) => [P.q + d[0], P.r + d[1]]), 'halo: the six neighbours in DIRS order');
  const far = at(4, 0); t.deep(MAP.brushCells(M, 'blot', far[0], far[1], 0), [far], 'blot at distance 4');
  t.deep(MAP.brushCells(M, 'blot', at(5, 0)[0], at(5, 0)[1], 0), [], 'blot at distance 5 is out of range');
  t.deep(MAP.canBrush(M, 'blot', at(5, 0)[0], at(5, 0)[1], 0), { ok: false, reason: 'origin', need: 'hidden-near' }, 'blot out of range reason');
  t.deep(MAP.canBrush(M, 'blot', at(3, 2)[0], at(3, 2)[1], 0), { ok: true }, 'blot does not need to touch painted ground');
  t.deep(MAP.canBrush(M, 'blot', P.q, P.r, 0), { ok: false, reason: 'origin', need: 'hidden-near' }, 'blot on a painted hex');
});
t.test('Spell rules: origin rules, reasons, direction handling', () => {
  const M = blank(15, 11), P = cr(M, 7, 5), H = cr(M, 3, 3); setPainted(M, [P]); M.pos = { q: P.q, r: P.r };
  t.deep(MAP.canBrush(M, 'stroke', H.q, H.r, 0), { ok: false, reason: 'origin', need: 'painted' }, 'a line must start on a painted hex');
  t.deep(MAP.canBrush(M, 'fan', H.q, H.r, 0), { ok: false, reason: 'origin', need: 'painted' }, 'a fan must start on a painted hex');
  t.deep(MAP.canBrush(M, 'halo', H.q, H.r, 0), { ok: false, reason: 'origin', need: 'painted' }, 'a halo must start on a painted hex');
  t.deep(MAP.canBrush(M, 'splash', H.q, H.r, 0), { ok: false, reason: 'origin', need: 'hidden-adjacent' }, 'a splash anchor must touch painted ground');
  t.deep(MAP.canBrush(M, 'splash', P.q, P.r, 0), { ok: false, reason: 'origin', need: 'hidden-adjacent' }, 'a splash anchor must be hidden');
  t.deep(MAP.canBrush(M, 'stroke', 999, 999, 0), { ok: false, reason: 'off' }, 'off the page');
  t.deep(MAP.canBrush(M, 'stroke', P.q, P.r, undefined), { ok: false, reason: 'dir' }, 'a line needs a direction'); t.deep(MAP.canBrush(M, 'fan', P.q, P.r, 1.5), { ok: false, reason: 'dir' }, 'and an integer one');
  t.deep(MAP.canBrush(M, 'halo', P.q, P.r, undefined), { ok: true }, 'a halo ignores the direction');
  t.deep(MAP.brushCells(M, 'stroke', P.q, P.r, 6), MAP.brushCells(M, 'stroke', P.q, P.r, 0), 'directions wrap mod 6'); t.deep(MAP.brushCells(M, 'stroke', P.q, P.r, -1), MAP.brushCells(M, 'stroke', P.q, P.r, 5), 'negative directions wrap');
  const A = cr(M, 8, 5); M.tiles[key(A.q, A.r)].type = 'block';
  t.deep(MAP.canBrush(M, 'splash', A.q, A.r, 0), { ok: false, reason: 'void' }, 'splash on Void'); t.deep(MAP.canBrush(M, 'blot', A.q, A.r, 0), { ok: false, reason: 'void' }, 'blot on Void');
  // Void and unmuted hexes are skipped without stopping a line; the map edge is too
  const L = blank(9, 7), O = cr(L, 1, 3); setPainted(L, [O]); L.pos = { q: O.q, r: O.r };
  cr(L, 3, 3).type = 'block'; setPainted(L, [cr(L, 4, 3)]);
  t.deep(MAP.brushCells(L, 'wave', O.q, O.r, 0), [cr(L, 2, 3), cr(L, 5, 3), cr(L, 6, 3)].map((x) => [x.q, x.r]), 'wave E over a Void hex and a painted hex: cells 1, 4 and 5 paint, 2 (Void) and 3 (painted) are skipped and the line goes on (RULE: skipped, not stopped)');
  t.deep(MAP.brushCells(L, 'stroke', O.q, O.r, 0), [[cr(L, 2, 3).q, 3]], 'stroke covers k = 1..3 whatever is skipped');
  t.deep(MAP.brushCells(L, 'wave', O.q, O.r, 3), [[cr(L, 0, 3).q, 3]], 'a wave west from column 1 keeps the one hex that exists (column 0) and drops the rest');
  const W0 = cr(L, 0, 3); setPainted(L, [W0]);
  t.deep(MAP.brushCells(L, 'wave', W0.q, W0.r, 3), [], 'the wave going west off the page from column 0 paints nothing'); t.deep(MAP.canBrush(L, 'wave', W0.q, W0.r, 3), { ok: false, reason: 'nothing' }, 'so it is not ok: nothing');
  const E1 = cr(L, 7, 3); setPainted(L, [E1]);
  t.deep(MAP.brushCells(L, 'wave', E1.q, E1.r, 0), [[cr(L, 8, 3).q, 3]], 'a wave that leaves the page keeps the hexes that exist');
  const corner = cr(L, 0, 0); setPainted(L, [corner]); L.pos = { q: corner.q, r: corner.r };
  t.deep(MAP.brushCells(L, 'halo', corner.q, corner.r, 0), [[corner.q + 1, 0], [corner.q, 1]], 'a halo in the page corner (row 0, column 0) paints the 2 neighbours that exist: E and SE');
  t.deep(MAP.brushCells(L, 'fan', corner.q, corner.r, 2), [], 'a fan aimed NW off the page paints nothing');
  t.deep(MAP.brushCells(L, 'fan', corner.q, corner.r, 1), [[corner.q + 1, 0]], 'a fan aimed NE keeps only its E hex');
  // a Spell whose cells are all already unmuted is not ok
  const R = blank(7, 5), C = cr(R, 3, 2); setPainted(R, [C].concat(DIRS.map((d) => T(R, C.q + d[0], C.r + d[1]))));
  t.deep(MAP.canBrush(R, 'halo', C.q, C.r, 0), { ok: false, reason: 'nothing' }, 'halo with nothing new');
  t.deep(MAP.applyBrush(R, 'halo', C.q, C.r, 0), [], 'applyBrush returns [] when not ok');
});
t.test('applyBrush paints exactly brushCells and returns those tiles', () => {
  const M = blank(15, 11), P = cr(M, 7, 5); setPainted(M, [P]); M.pos = { q: P.q, r: P.r };
  cr(M, 9, 5).type = 'block';
  const want = MAP.brushCells(M, 'wave', P.q, P.r, 0), got = MAP.applyBrush(M, 'wave', P.q, P.r, 0);
  t.deep(got.map((x) => [x.q, x.r]), want, 'returned tiles are the cells'); t.ok(got.every((x) => x.painted && x.known && M.tiles[key(x.q, x.r)] === x), 'painted, known, and the live tile objects');
  t.eq(all(M).filter((x) => x.painted).length, 1 + want.length, 'nothing else changed'); t.ok(!cr(M, 9, 5).painted, 'Void never painted by a brush');
  t.eq(MAP.canBrush(M, 'wave', P.q, P.r, 0).ok, false, 'the same brush finds nothing new the second time'); t.deep(MAP.applyBrush(M, 'wave', P.q, P.r, 0), [], 'so applying again does nothing');
});
t.test('Spell geometry against the reference: every Spell x every direction x many anchors on played maps', () => {
  let checked = 0, bad = [];
  const pages = [playedPage(11, 1, 0), playedPage(12, 2, 15), playedPage(13, 3, 45), playedPage(14, 1, 90), playedPage(15, 2, 140)];
  for (const M of pages) {
    const tiles = all(M);
    for (const id of Object.keys(DATA.brushes)) for (let d = 0; d < 6; d++) for (let i = 0; i < tiles.length; i += 3) {
      const tl = tiles[i], ref = refBrush(M, id, tl.q, tl.r, d), got = MAP.brushCells(M, id, tl.q, tl.r, d), can = MAP.canBrush(M, id, tl.q, tl.r, d);
      checked++;
      if (JSON.stringify(got) !== JSON.stringify(ref.cells) || can.ok !== ref.ok) { bad.push(`${id} d${d} at ${key(tl.q, tl.r)}: got ${JSON.stringify(got)} ok ${can.ok}, want ${JSON.stringify(ref.cells)} ok ${ref.ok}`); continue; }
      if (got.some((c) => { const x = T(M, c[0], c[1]); return !x || x.painted || x.type === 'block'; })) bad.push('bad cell from ' + id);
      if (new Set(cells(got)).size !== got.length) bad.push('duplicate cells from ' + id);
      if (!can.ok && got.length) bad.push('cells although not ok from ' + id);
      if (can.ok && !got.length) bad.push('ok but no cells from ' + id);
      if (id === 'stroke' && got.length > 3 || id === 'wave' && got.length > 5 || id === 'fan' && got.length > 3 || id === 'halo' && got.length > 6 || id === 'splash' && got.length > 7 || id === 'blot' && got.length > 1) bad.push('too many cells from ' + id);
    }
  }
  t.ok(bad.length === 0, `${checked} brush placements agree with the reference: ${bad.slice(0, 3).join(' | ')}`);
  t.ok(checked > 10000, 'a thorough sweep (' + checked + ' placements)');
  // applying on a live map: the unmuted set grows by exactly the promised cells and canPaint agrees afterwards
  const M = pages[3], anchors = MAP.brushAnchors(M, 'splash');
  t.ok(anchors.length > 0 && anchors.every((a) => refBrush(M, 'splash', a.q, a.r, 0).ok), 'brushAnchors lists exactly the legal splash anchors');
  const all6 = MAP.brushAnchors(M, 'wave'); t.ok(all6.every((a) => a.dirs.length > 0 && a.dirs.every((d) => refBrush(M, 'wave', a.q, a.r, d).ok)), 'wave anchors carry working directions');
  t.ok(all6.length === all(M).filter((x) => [0, 1, 2, 3, 4, 5].some((d) => refBrush(M, 'wave', x.q, x.r, d).ok)).length, 'and none is missing');
  const before = all(M).filter((x) => x.painted).length, a = anchors[0], cellsWanted = MAP.brushCells(M, 'splash', a.q, a.r, 0);
  const tilesPainted = MAP.applyBrush(M, 'splash', a.q, a.r, 0);
  t.eq(all(M).filter((x) => x.painted).length, before + cellsWanted.length, 'painted count grew by the promised cells'); t.eq(tilesPainted.length, cellsWanted.length, 'and the return value matches');
  t.ok(cellsWanted.every((c) => MAP.canPaint(M, c[0], c[1]).reason === 'painted'), 'they now read as painted');
});
t.test('Spells on fresh generated maps: the start ring gives every Spell somewhere to go', () => {
  let bad = 0;
  MAPS.slice(0, 120).forEach((m) => {
    const M = m.M;
    for (const id of Object.keys(DATA.brushes)) if (MAP.brushAnchors(M, id).length === 0) bad++;
    if (MAP.canBrush(M, 'halo', M.start.q + 2, M.start.r, 0).ok !== true) bad++;             // ring rim: the outer ring tiles have hidden neighbours
    if (MAP.canBrush(M, 'blot', M.start.q + 4, M.start.r, 0).ok !== (T(M, M.start.q + 4, M.start.r).type !== 'block')) bad++;
  });
  t.eq(bad, 0, 'brushes always have a legal anchor on a fresh page');
});

// ================================================================== unmuting, chains, solve
t.test('canPaint reasons and paint semantics', () => {
  const M = playedPage(21, 1, 0), s = M.start;
  t.deep(MAP.canPaint(M, 999, 999), { ok: false, reason: 'off' }, 'off the page');
  t.deep(MAP.canPaint(M, s.q, s.r), { ok: false, reason: 'painted' }, 'painted');
  const blocks = all(M).filter((x) => x.type === 'block'); t.deep(MAP.canPaint(M, blocks[0].q, blocks[0].r), { ok: false, reason: 'void' }, 'Void');
  const far = all(M).find((x) => x.type !== 'block' && !x.painted && hex(s, x) >= 6); t.deep(MAP.canPaint(M, far.q, far.r), { ok: false, reason: 'far' }, 'far from painted ground');
  const edge = MAP.frontier(M); t.ok(edge.length > 0 && edge.every((x) => MAP.canPaint(M, x.q, x.r).ok && !x.painted && x.type !== 'block'), 'the frontier is exactly what canPaint accepts');
  const acc = all(M).filter((x) => MAP.canPaint(M, x.q, x.r).ok).length; t.eq(acc, edge.length, 'and nothing else is accepted');
  t.eq(edge.length, all(M).filter((x) => !x.painted && x.type !== 'block' && nbrs(M, x).some((n) => n.painted)).length, 'frontier matches an independent count');
  const pick = edge[0], p = MAP.paint(M, pick.q, pick.r); t.ok(p === pick && p.painted && p.known, 'paint returns the live tile, painted and known');
  t.eq(MAP.paint(M, pick.q, pick.r), null, 'painting twice returns null'); t.eq(MAP.paint(M, blocks[0].q, blocks[0].r), null, 'Void cannot be painted'); t.eq(MAP.paint(M, 999, 999), null, 'off the page');
  t.eq(MAP.paint(M, far.q, far.r) === far, true, 'paint is low level: it does not check adjacency (canPaint and pathToPaint do)'); far.painted = false; far.known = false;
  t.ok(MAP.canPaint(M, pick.q, pick.r).reason === 'painted', 'now painted');
});
t.test('pathToPaint: the cheapest chain, in unmuting order, against an independent BFS', () => {
  let bad = [], checked = 0;
  [playedPage(31, 1, 0), playedPage(32, 2, 30), playedPage(33, 3, 70)].forEach((M) => {
    all(M).forEach((tl, i) => {
      if (i % 2) return;
      const res = MAP.pathToPaint(M, tl.q, tl.r);
      if (tl.type === 'block' || tl.painted) { if (res !== null) bad.push('should be null at ' + key(tl.q, tl.r)); return; }
      const want = paintCost(M, tl); checked++;
      if (want === Infinity) { if (res !== null) bad.push('unreachable but got a path'); return; }
      if (!res || res.cost !== want || res.path.length !== want) { bad.push(`cost ${res && res.cost} != ${want} at ${key(tl.q, tl.r)}`); return; }
      const last = res.path[res.path.length - 1]; if (last[0] !== tl.q || last[1] !== tl.r) bad.push('does not end on the target');
      const first = T(M, res.path[0][0], res.path[0][1]); if (!nbrs(M, first).some((n) => n.painted)) bad.push('first cell does not touch painted ground');
      res.path.forEach((c, k) => { const x = T(M, c[0], c[1]); if (x.painted || x.type === 'block') bad.push('chain crosses painted or Void'); if (k && MAP.dist(res.path[k - 1][0], res.path[k - 1][1], c[0], c[1]) !== 1) bad.push('chain has a gap'); });
    });
  });
  t.ok(bad.length === 0, `pathToPaint over ${checked} targets: ${bad.slice(0, 3).join(' | ')}`); t.ok(checked > 200, 'enough targets checked (' + checked + ')');
  // unmuting the chain in order is always legal, ends unmuted, costs exactly `cost`, and solve drops by the chain's share
  const M = playedPage(34, 1, 10), boss = T(M, M.boss.q, M.boss.r), before = MAP.solve(M).minInk, res = MAP.pathToPaint(M, boss.q, boss.r);
  t.eq(res.cost, before, 'solve.minInk is the boss chain cost');
  res.path.forEach((c, k) => { t.ok(MAP.canPaint(M, c[0], c[1]).ok, 'chain cell ' + k + ' is paintable when its turn comes'); MAP.paint(M, c[0], c[1]); t.eq(MAP.solve(M).minInk, before - k - 1, 'solve drops by one per chain cell'); });
  t.ok(boss.painted, 'the boss ended up painted'); t.deep(MAP.solve(M), { ok: true, minInk: 0, path: [] }, 'solve once the boss is painted'); t.eq(MAP.pathToPaint(M, boss.q, boss.r), null, 'no path to a painted tile');
  // straightness: on an open map a chain along a row is a straight line, and along a diagonal too
  const B = blank(21, 9), S = cr(B, 1, 4); setPainted(B, [S]);
  const row = MAP.pathToPaint(B, cr(B, 12, 4).q, 4); t.ok(row.path.every((c) => c[1] === 4) && row.cost === 11, 'along a row the chain is straight');
  const diag = MAP.pathToPaint(B, cr(B, 8, 1).q, 1); t.eq(diag.cost, hex(S, cr(B, 8, 1)), 'a diagonal target costs its hex distance');
  // straightness: for several targets the chain's worst deviation from the line S -> target equals the best any shortest chain can do (own brute force)
  const devOf = (a, b, tl) => { const p = px(tl); return Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y); };
  [[8, 1], [10, 7], [15, 2], [18, 6], [9, 0], [20, 8]].forEach(([tc, trow]) => {
    const Tg = cr(B, tc, trow), a = px(S), b = px(Tg), res = MAP.pathToPaint(B, Tg.q, Tg.r);
    const got = Math.max(...res.path.map((c) => devOf(a, b, T(B, c[0], c[1]))));
    let best = Infinity;
    const rec = (c, worst) => { if (worst >= best) return; if (c === Tg) { best = worst; return; } DIRS.forEach((d) => { const n = T(B, c.q + d[0], c.r + d[1]); if (n && hex(n, Tg) === hex(c, Tg) - 1) rec(n, Math.max(worst, devOf(a, b, n))); }); };
    rec(S, 0);
    t.near(got, best, 1e-9, `the chain to column ${tc} row ${trow} is the straightest shortest chain (${got.toFixed(2)} of a hex width 1.73)`);
  });
  // Void forces a detour and the chain pays for it
  const W = blank(11, 7), S2 = cr(W, 1, 3); setPainted(W, [S2]); for (let r = 1; r <= 5; r++) cr(W, 5, r).type = 'block';
  const around = MAP.pathToPaint(W, cr(W, 9, 3).q, 3); t.ok(around.cost > hex(S2, cr(W, 9, 3)), 'a wall costs a detour'); t.eq(around.cost, paintCost(W, cr(W, 9, 3)), 'exactly the BFS cost');
  const sealed = blank(9, 5); setPainted(sealed, [cr(sealed, 0, 2)]); for (let r = 0; r < 5; r++) cr(sealed, 4, r).type = 'block';
  t.eq(MAP.pathToPaint(sealed, cr(sealed, 7, 2).q, 2), null, 'behind an unbroken wall there is no chain'); t.deep(MAP.solve(Object.assign(sealed, { boss: { q: cr(sealed, 7, 2).q, r: 2 } })), { ok: false, minInk: Infinity, path: [] }, 'solve reports a cut-off boss');
});

// ================================================================== walking
t.test('canMove, move, walkPath on a hand-built map', () => {
  const M = blank(11, 5), row = (c) => cr(M, c, 2);
  M.start = { q: row(0).q, r: 2 }; M.boss = { q: row(10).q, r: 2 };
  for (let c = 0; c <= 6; c++) setPainted(M, [row(c)]);
  M.pos = { q: row(0).q, r: 2 };
  t.ok(MAP.canMove(M, row(1).q, 2), 'next painted hex'); t.ok(!MAP.canMove(M, row(2).q, 2), 'two away is not one step'); t.ok(!MAP.canMove(M, row(7).q, 2), 'hidden hex');
  t.ok(!MAP.canMove(M, row(0).q, 2), 'own hex'); t.ok(!MAP.canMove(M, 999, 999), 'off the page');
  const wall = cr(M, 1, 1); setPainted(M, [wall]); wall.type = 'block'; t.ok(!MAP.canMove(M, wall.q, wall.r), 'Void never (even if a bad flag says painted)');
  t.eq(MAP.move(M, row(2).q, 2), null, 'move refuses what canMove refuses'); t.deep(M.pos, { q: row(0).q, r: 2 }, 'and stays put');
  const step = MAP.move(M, row(1).q, 2); t.ok(step === row(1) && M.pos.q === row(1).q && M.pos.r === 2, 'move steps and returns the tile');
  MAP.move(M, row(0).q, 2);
  // plain walk: shortest path to the far end, excluding the start, including the target
  t.deep(MAP.walkPath(M, row(6).q, 2), [1, 2, 3, 4, 5, 6].map((c) => [row(c).q, 2]), 'straight along the painted row');
  t.deep(MAP.walkPath(M, row(0).q, 2), [], 'already there'); t.eq(MAP.walkPath(M, row(9).q, 2), null, 'hidden target'); t.eq(MAP.walkPath(M, wall.q, wall.r), null, 'Void target'); t.eq(MAP.walkPath(M, 999, 999), null, 'off the page');
  // unresolved content stops the walk ON that tile (one lane: no way around)
  row(3).type = 'enemy'; row(3).content = { tier: 'normal' };
  t.deep(MAP.walkPath(M, row(6).q, 2), [1, 2, 3].map((c) => [row(c).q, 2]), 'walking stops at the first unresolved content tile, which is entered and triggers');
  t.deep(MAP.walkPath(M, row(3).q, 2), [1, 2, 3].map((c) => [row(c).q, 2]), 'the target itself may be the content');
  row(3).done = true; t.deep(MAP.walkPath(M, row(6).q, 2), [1, 2, 3, 4, 5, 6].map((c) => [row(c).q, 2]), 'a resolved tile no longer stops the walk');
  row(3).done = false; row(5).type = 'well'; row(3).type = 'empty';
  t.deep(MAP.walkPath(M, row(6).q, 2), [1, 2, 3, 4, 5].map((c) => [row(c).q, 2]), 'an unresolved well stops the walk too (RUN.step drinks it)');
  row(5).type = 'start'; t.deep(MAP.walkPath(M, row(6).q, 2), [1, 2, 3, 4, 5, 6].map((c) => [row(c).q, 2]), 'start and empty tiles never stop the walk');
  // a clean detour is preferred to walking through trouble: paint the row above and the enemy can be walked around
  row(5).type = 'empty'; row(3).type = 'enemy';
  for (let c = 0; c <= 6; c++) setPainted(M, [cr(M, c, 3), cr(M, c, 1)]);
  const around = MAP.walkPath(M, row(6).q, 2);
  t.ok(around && around.length >= 6 && !around.some((c) => c[0] === row(3).q && c[1] === 2) && around[around.length - 1][0] === row(6).q, 'with a free way around, the walk goes around the enemy');
  t.ok(around.every((c, i) => MAP.dist(i ? around[i - 1][0] : M.pos.q, i ? around[i - 1][1] : M.pos.r, c[0], c[1]) === 1), 'and every step is one hex');
  t.deep(MAP.walkPath(M, row(3).q, 2).pop(), [row(3).q, 2], 'unless the enemy is where you asked to go');
  // walking from a tile that has unresolved content is allowed (the party is standing on it)
  const standing = MAP.deserialize(MAP.serialize(M)); standing.pos = { q: row(3).q, r: 2 };
  t.ok(MAP.walkPath(standing, row(6).q, 2).length >= 3, 'the tile you stand on does not block the first step');
  // moving one step at a time along a walkPath ends at the target
  const walker = MAP.deserialize(MAP.serialize(M)); walker.pos = { q: row(0).q, r: 2 }; T(walker, row(3).q, 2).done = true;
  for (const c of MAP.walkPath(walker, row(6).q, 2)) t.ok(MAP.move(walker, c[0], c[1]) !== null, 'every step of a walkPath is a legal move');
  t.deep(walker.pos, { q: row(6).q, r: 2 }, 'and the party arrives');
});
t.test('reachable, unresolved and progress', () => {
  const M = playedPage(41, 1, 0);
  const reach = MAP.reachable(M);
  t.eq(reach.size, all(M).filter((x) => x.painted).length, 'the start ring is one connected painted area'); t.ok(reach.has(key(M.pos.q, M.pos.r)), 'includes pos');
  // an island unmuted by a blot is not reachable from pos until it is connected
  const spot = all(M).find((x) => x.type === 'empty' && !x.painted && hex(M.pos, x) === 4 && MAP.canBrush(M, 'blot', x.q, x.r, 0).ok);
  t.ok(!!spot, 'a spot for a blot four hexes out'); MAP.applyBrush(M, 'blot', spot.q, spot.r, 0);
  t.ok(spot.painted && !MAP.reachable(M).has(key(spot.q, spot.r)), 'a painted island is not reachable over painted ground');
  const link = MAP.pathToPaint(M, spot.q + 0, spot.r + 0); t.eq(link, null, 'pathToPaint says it is already painted');
  const M2 = playedPage(42, 2, 60); const brute = new Set(); const st = [T(M2, M2.pos.q, M2.pos.r)]; brute.add(key(M2.pos.q, M2.pos.r));
  while (st.length) { const c = st.pop(); nbrs(M2, c).forEach((n) => { if (n.painted && n.type !== 'block' && !brute.has(key(n.q, n.r))) { brute.add(key(n.q, n.r)); st.push(n); } }); }
  t.deep([...MAP.reachable(M2)].sort(), [...brute].sort(), 'reachable equals an independent flood fill');
  M2.pos = { q: -999, r: -999 }; t.eq(MAP.reachable(M2).size, 0, 'no reachable tiles when pos is off the page');
  // unresolved: unmuted, not done, content, reachable
  const N = playedPage(43, 1, 40); const list = MAP.unresolved(N), reachN = MAP.reachable(N);
  t.deep(list.map((x) => key(x.q, x.r)), all(N).filter((x) => reachN.has(key(x.q, x.r)) && !x.done && !['empty', 'start', 'block'].includes(x.type)).map((x) => key(x.q, x.r)), 'unresolved matches its definition');
  list.forEach((x) => { x.done = true; }); t.eq(MAP.unresolved(N).length, 0, 'nothing unresolved once everything reachable is done');
  // progress
  const P = MAP.generate({ chapter: 1, seed: 9 }), pr = MAP.progress(P), nonBlock = all(P).filter((x) => x.type !== 'block').length;
  t.eq(pr.total, nonBlock, 'total counts non-block tiles'); t.eq(pr.painted, all(P).filter((x) => x.painted).length, 'painted counts the ring'); t.eq(pr.pct, Math.round(pr.painted / nonBlock * 100), 'pct is an integer percent'); t.near(pr.frac, pr.painted / nonBlock, 1e-12, 'frac is 0..1');
  all(P).forEach((x) => { if (x.type !== 'block') MAP.paint(P, x.q, x.r); }); t.deep(MAP.progress(P), { painted: nonBlock, total: nonBlock, pct: 100, frac: 1 }, 'everything painted is 100');
});
t.test('walkPath detour cap: a huge detour is not worth it, the party fights instead', () => {
  const M = blank(15, 9), L = (c, r) => cr(M, c, r);
  M.start = { q: L(0, 6).q, r: 6 }; M.boss = { q: L(14, 6).q, r: 6 };
  const lane = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10].map((c) => L(c, 6)); setPainted(M, lane);
  const enemy = L(5, 6); enemy.type = 'enemy'; enemy.content = { tier: 'normal' }; setPainted(M, [enemy]);
  M.pos = { q: L(3, 6).q, r: 6 };
  const direct = MAP.walkPath(M, L(8, 6).q, 6);
  t.deep(direct.map((c) => key(c[0], c[1])), [L(4, 6), L(5, 6)].map((x) => key(x.q, x.r)), 'with no way around the walk stops on the enemy');
  // a short way around (one row up) is taken
  setPainted(M, [L(4, 5), L(5, 5), L(6, 5)]);
  const short = MAP.walkPath(M, L(8, 6).q, 6);
  t.ok(short.length >= 5 && !short.some((c) => c[0] === enemy.q && c[1] === 6), 'a short detour is taken');
  // remove it and build a huge one: up column 3, along row 0, down column 9
  [L(4, 5), L(5, 5), L(6, 5)].forEach((x) => { x.painted = false; x.known = false; });
  const loop = []; for (let r = 5; r >= 0; r--) loop.push(L(3, r)); for (let c = 4; c <= 9; c++) loop.push(L(c, 0)); for (let r = 1; r <= 5; r++) loop.push(L(9, r));
  setPainted(M, loop);
  const far = MAP.walkPath(M, L(8, 6).q, 6);
  t.deep(far.map((c) => key(c[0], c[1])), [L(4, 6), L(5, 6)].map((x) => key(x.q, x.r)), 'a detour of more than 8 extra steps is not taken: the walk heads for the enemy and stops on it');
  // the loop alone (no direct lane through the enemy tile) is the only way, so it is taken however long
  enemy.painted = false; enemy.known = false;
  const only = MAP.walkPath(M, L(8, 6).q, 6);
  t.ok(only && only.length > 12 && only[only.length - 1][0] === L(8, 6).q, 'when it is the only way the long route is walked (' + (only && only.length) + ' steps)');
  enemy.painted = true;
});
t.test('voidEdge: the holes next to unmuted ground', () => {
  const M = MAP.generate({ chapter: 1, seed: 4 });
  t.eq(MAP.voidEdge(M).length, 0, 'no Void touches the start ring on a fresh page');
  const frontier = () => MAP.frontier(M);
  for (let i = 0; i < 90; i++) { const f = frontier(); if (!f.length) break; MAP.paint(M, f[(i * 5) % f.length].q, f[(i * 5) % f.length].r); }
  const edge = MAP.voidEdge(M), want = all(M).filter((x) => x.type === 'block' && nbrs(M, x).some((n) => n.painted));
  t.ok(edge.length > 0, 'after painting outward some Void is visible'); t.deep(edge.map((x) => key(x.q, x.r)), want.map((x) => key(x.q, x.r)), 'exactly the Void tiles touching a painted hex');
  t.ok(edge.every((x) => !x.known && !x.painted), 'Void stays unknown and unpainted');
});
t.test('guards: maps without pos or boss do not throw', () => {
  const M = blank(15, 9), P = cr(M, 4, 4); setPainted(M, [P]); M.start = { q: P.q, r: 4 };
  delete M.pos;
  t.deep(MAP.canBrush(M, 'blot', cr(M, 7, 4).q, 4, 0), { ok: true }, 'a blot falls back to the start when pos is missing');
  t.deep(MAP.canBrush(M, 'blot', cr(M, 10, 4).q, 4, 0), { ok: false, reason: 'origin', need: 'hidden-near' }, 'and still enforces the range from there');
  t.eq(MAP.canMove(M, cr(M, 5, 4).q, 4), false, 'canMove without pos'); t.eq(MAP.walkPath(M, cr(M, 5, 4).q, 4), null, 'walkPath without pos'); t.eq(MAP.reachable(M).size, 0, 'reachable without pos');
  delete M.start; t.deep(MAP.canBrush(M, 'blot', cr(M, 5, 4).q, 4, 0), { ok: false, reason: 'origin', need: 'hidden-near' }, 'with neither pos nor start a blot is refused, not thrown');
  t.deep(MAP.solve(M), { ok: false, minInk: Infinity, path: [] }, 'solve without a boss');
});
t.test('junk arguments never throw and never change the map', () => {
  const M = playedPage(51, 2, 30), snap = JSON.stringify(M);
  const junk = [undefined, null, NaN, Infinity, -Infinity, 'x', '3,4', {}, [], -1, 1e9, 0.5, true, () => 1];
  const brushes = ['nope', undefined, null, 'toString', '__proto__', 'constructor', 'hasOwnProperty', 7, {}];
  let calls = 0, threw = [];
  const tryIt = (name, fn) => { calls++; try { fn(); } catch (e) { threw.push(name + ': ' + e.message); } };
  for (const a of junk) for (const b of junk) {
    tryIt('canPaint', () => { const r = MAP.canPaint(M, a, b); if (typeof r.ok !== 'boolean') throw new Error('shape'); });
    tryIt('pathToPaint', () => { const r = MAP.pathToPaint(M, a, b); if (r !== null && !Array.isArray(r.path)) throw new Error('shape'); });
    tryIt('walkPath', () => { MAP.walkPath(M, a, b); });
    tryIt('canMove', () => { if (typeof MAP.canMove(M, a, b) !== 'boolean') throw new Error('shape'); });
    tryIt('neighbors', () => { MAP.neighbors(M, a, b); });
    tryIt('tile', () => { MAP.tile(M, a, b); });
    tryIt('dirOf', () => { MAP.dirOf(M, a, b, b, a); });
    tryIt('hexRing', () => { MAP.hexRing(a, b, junk[0]); MAP.hexRing(0, 0, a); });
    tryIt('toPixel', () => { MAP.toPixel(a, b, junk[1]); MAP.fromPixel(a, b, junk[3]); MAP.corners(a, b, junk[2]); });
    for (const id of brushes) for (const d of [undefined, NaN, 'x', 2, -7, 99]) {
      tryIt('canBrush', () => { const r = MAP.canBrush(M, id, a, b, d); if (typeof r.ok !== 'boolean' || (!r.ok && typeof r.reason !== 'string')) throw new Error('shape'); });
      tryIt('brushCells', () => { if (!Array.isArray(MAP.brushCells(M, id, a, b, d))) throw new Error('shape'); });
    }
  }
  for (const a of junk) { tryIt('deserialize', () => { MAP.deserialize(a); }); tryIt('tilesOf', () => { MAP.tilesOf(M, a); }); tryIt('brushAnchors', () => { MAP.brushAnchors(M, a); }); tryIt('paint', () => { MAP.paint(M, a, a); }); }
  t.ok(threw.length === 0, `${calls} junk calls: ${threw.slice(0, 3).join(' | ')}`);
  t.eq(JSON.stringify(M), snap, 'and the page is untouched');
  t.eq(MAP.paint(M, 'x', 'y'), null, 'paint of junk is null');
  t.deep(MAP.canBrush(M, 'toString', 3, 3, 0), { ok: false, reason: 'brush' }, 'a prototype property is not a brush');
  t.deep(MAP.canBrush(M, '__proto__', 3, 3, 0), { ok: false, reason: 'brush' }, '__proto__ is not a brush either');
});
t.test('queries: tilesOf, painted, isWalkable, neighbors, tile', () => {
  const M = MAPS[1].M;
  t.ok(MAP.tilesOf(M, 'well').every((x) => x.type === 'well') && MAP.tilesOf(M, 'well').length === all(M).filter((x) => x.type === 'well').length, 'tilesOf');
  t.deep(MAP.tilesOf(M, 'start').map((x) => [x.q, x.r]), [[M.start.q, M.start.r]], 'one start'); t.deep(MAP.tilesOf(M, 'nothing'), [], 'unknown type');
  const rows = MAP.tilesOf(M, 'enemy').map((x) => x.r * 100 + colOf(x)); t.deep(rows, rows.slice().sort((a, b) => a - b), 'tilesOf is in row-major order');
  t.ok(Array.isArray(MAP.painted(M)) && MAP.painted(M).length === ringOf(M).length, 'painted is an array of the ring');
  t.ok(MAP.isWalkable(T(M, M.start.q, M.start.r)) && !MAP.isWalkable(all(M).find((x) => !x.painted)) && !MAP.isWalkable(null) && !MAP.isWalkable({ type: 'block', painted: true }), 'isWalkable');
  t.eq(MAP.neighbors(M, M.start.q, M.start.r).length, 6, 'six neighbours mid-page'); t.eq(MAP.neighbors(M, -1, 0).length, 1, 'a hex left of the page touches only the first column');
  t.deep(MAP.neighbors(M, 0, 0), [[1, 0], [0, 1]], 'the page corner has two: E and SE'); t.deep(MAP.neighbors(M, M.start.q, M.start.r)[0], [M.start.q + 1, M.start.r], 'neighbors come in DIRS order');
  const blockTile = all(M).find((x) => x.type === 'block'); t.ok(MAP.neighbors(M, blockTile.q, blockTile.r).length >= 3, 'neighbors include Void tiles');
  t.ok(MAP.tile(M, M.boss.q, M.boss.r) === T(M, M.boss.q, M.boss.r) && MAP.tile(M, 500, 500) === null, 'tile lookup');
});

// ================================================================== encounters (fake pools) and the real content, if it exists
t.test('encounter pools: picked from tile.diff, weighted, varied, layout never depends on them', () => {
  const plain = boot({ only: ['map'], skip: ['data_*'] });
  const withPools = boot({ only: ['map'], skip: ['data_*'] });
  const D2 = withPools.DATA;
  [1, 2, 3].forEach((ch) => {
    const mins = [0, 0, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.8];
    D2.addEncounters(ch, {
      normal: mins.map((min, i) => ({ id: `ch${ch}_n${i}`, enemies: ['x'], w: 1 + (i % 3), min })),
      elite: [0, 1, 2].map((i) => ({ id: `ch${ch}_e${i}`, enemies: ['y'], w: 1, min: i === 2 ? 0.55 : 0.2 })),
    });
  });
  let bad = [], seen = new Set(), hard = 0;
  for (const ch of CHAPTERS) for (let s = 1; s <= 25; s++) {
    const seed = s * 977 + ch, A = plain.MAP.generate({ chapter: ch, seed }), B = withPools.MAP.generate({ chapter: ch, seed }), B2 = withPools.MAP.generate({ chapter: ch, seed });
    if (JSON.stringify(B) !== JSON.stringify(B2)) bad.push('not deterministic');
    if (A.attempts !== B.attempts) bad.push('attempts depend on pools');
    for (const k of Object.keys(A.tiles)) {
      const a = A.tiles[k], b = B.tiles[k];
      if (a.type !== b.type || a.diff !== b.diff || a.painted !== b.painted || a.known !== b.known) bad.push('layout differs at ' + k);
      if (a.type === 'block' || (a.type !== 'enemy' && a.type !== 'elite')) { if (JSON.stringify(a.content) !== JSON.stringify(b.content)) bad.push('content differs at ' + k); continue; }
      if (b.content.tier !== a.content.tier) bad.push('tier hint lost');
      const g = D2.groupById(b.content.enc);
      if (!g) { bad.push('unknown group ' + b.content.enc + ' at ' + k); continue; }
      if (b.content.enc.indexOf('ch' + ch + '_' + (b.type === 'elite' ? 'e' : 'n')) !== 0) bad.push('wrong chapter or tier pool: ' + b.content.enc);
      if (g.min > b.diff) bad.push(`group ${g.id} min ${g.min} above tile diff ${b.diff}`);
      seen.add(g.id); if (g.min >= 0.6) hard++;
    }
  }
  t.ok(bad.length === 0, 'pools: ' + bad.slice(0, 3).join(' | '));
  t.ok(seen.size >= 30, 'the picks use most of the pool (' + seen.size + ' of 45 groups)'); t.ok(hard > 0, 'hard groups appear on far tiles');
  // near the start only the easy groups are eligible
  const M = withPools.MAP.generate({ chapter: 1, seed: 5 }); const early = Object.values(M.tiles).filter((x) => x.type === 'enemy' && x.diff < 0.1);
  t.ok(early.every((x) => D2.groupById(x.content.enc).min === 0), 'a tile at diff < 0.1 only gets min 0 groups');
  // an Act with no pools (or only a boss) leaves enc undefined and never throws
  const M4 = withPools.MAP.generate({ chapter: 4, seed: 1 }); t.ok(Object.values(M4.tiles).every((x) => x.content.enc === undefined), 'chapter 4 has no pools: no enc');
  // elite pool empty, normal pool present
  const half = boot({ only: ['map'], skip: ['data_*'] }); half.DATA.addEncounters(1, { normal: [{ id: 'ch1_solo', enemies: ['x'], w: 1, min: 0.9 }] });
  const H = half.MAP.generate({ chapter: 1, seed: 8 }); t.ok(Object.values(H.tiles).filter((x) => x.type === 'enemy').every((x) => x.content.enc === 'ch1_solo'), 'no group is eligible below its min: fall back to the whole pool');
  t.ok(Object.values(H.tiles).filter((x) => x.type === 'elite').every((x) => x.content.enc === undefined), 'no elite pool: elites keep only the hint');
});
t.test('replay against whatever real content exists', () => {
  const real = boot({ only: ['map'] });
  const R = real.MAP, D = real.DATA;
  for (const ch of CHAPTERS) for (let s = 1; s <= 12; s++) {
    const M = R.generate({ chapter: ch, seed: s * 1237 + ch });
    t.eq(R.audit(M).length, 0, `real content ch${ch} seed ${s}: audit clean`);
    Object.values(M.tiles).forEach((x) => {
      if (x.type !== 'enemy' && x.type !== 'elite') return;
      const pool = (D.encounters[ch] || {})[x.type === 'elite' ? 'elite' : 'normal'] || [];
      if (!pool.length) { if (x.content.enc !== undefined) t.ok(false, 'enc without a pool'); return; }
      const g = D.groupById(x.content.enc);
      if (!g) { t.ok(false, 'unknown enc ' + x.content.enc); return; }
      if (!pool.includes(g) && !pool.some((p) => p.id === g.id)) t.ok(false, 'enc from the wrong pool');
    });
  }
  t.ok(true, 'real content replay finished');
});

// ================================================================== human eyeball (printed, not asserted)
t.test('print one map and the generator statistics', () => {
  const M = MAP.generate({ chapter: 1, seed: 20260929 });
  console.log(`\nchapter 1 seed 20260929  minInk ${MAP.solve(M).minInk}  attempts ${M.attempts}  Void ${all(M).filter((x) => x.type === 'block').length}/273\n`);
  console.log(MAP.ascii(M, { spine: true })); console.log('\n' + MAP.LEGEND + '\n');
  console.log('as the player first sees it (fog, landmarks only):\n' + MAP.ascii(M, { fog: true }) + '\n');
  const mix = {}; MAPS.forEach((m) => all(m.M).forEach((x) => { mix[x.type] = (mix[x.type] || 0) + 1; }));
  console.log('tiles per page (average over ' + MAPS.length + '): ' + Object.keys(mix).sort().map((k) => k + ' ' + (mix[k] / MAPS.length).toFixed(1)).join(', '));
  const hist = {}; MAPS.forEach((m) => { const c = paintCost(m.M, m.M.boss); hist[c] = (hist[c] || 0) + 1; });
  console.log('cheapest route (paints): ' + JSON.stringify(hist) + '   generation: ' + (genMs / MAPS.length).toFixed(1) + ' ms per page');
  t.ok(genMs / MAPS.length < 150, 'generation is fast enough (' + (genMs / MAPS.length).toFixed(1) + ' ms per page)');
  t.ok(MAP.ascii(M).split('\n').length === 13, 'ascii has 13 rows');
});

t.done();
