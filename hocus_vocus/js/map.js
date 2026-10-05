// Hocus Vocus: MAP: the hex map. Generation, unmuting (`paint`), Spells (`brush`), walking, pixel helpers, saves.
// Pure logic: no DOM, no clock, no banned random call. Everything is a pure function of its arguments and the seed.
// This header is the contract of record for RUN and the map screen (DESIGN.md 4.8 and 5.3 say the same thing shorter).
//
// COORDINATES
//   Pointy-top axial hexes (q, r), key 'q,r'. Layout is odd-r offset: column = q + floor(r / 2), row = r, and a tile exists iff
//   0 <= column < cols and 0 <= row < rows (ECONOMY.map.cols x rows, 21 x 13). Conversion: q = column - floor(row / 2), r = row.
//   MAP.DIRS (direction index 0..5, counter-clockwise on screen): E [1,0]  NE [1,-1]  NW [0,-1]  W [-1,0]  SW [-1,1]  SE [0,1].
//   Pixels: size is the centre-to-corner radius (ECONOMY.map.hexSize = 46). Hex width = sqrt(3) * size, row pitch = 1.5 * size,
//   x = size * sqrt(3) * (q + r / 2), y = 1.5 * size * r, so the centre of hex (0,0) is the pixel origin, odd rows sit half a width
//   to the right, and y grows downward. Corner i of a hex is at angle 60 * i - 30 degrees (i = 0 is top-right, then clockwise on screen).
//
// DATA SHAPES
//   M = { v:1, chapter, seed, cols, rows, tiles:{ 'q,r': T }, start:{q,r}, boss:{q,r}, pos:{q,r}, attempts }
//   T = { q, r, type, painted, known, done, diff, content }
//   type is one of DATA.LISTS.tiles. painted = revealed (walkable unless block). known = a dim landmark silhouette shows in the fog
//   (every tile of DATA.LISTS.landmarks from the start, and every painted tile). done = resolved (RUN sets it, MAP never does).
//   diff = clamp(dist(start, tile) / dist(start, boss), 0, 1) rounded to 2 decimals (no noise: it scales encounter picks).
//   attempts = how many candidate maps the generator built (1 = the first seed was fine, see GENERATION RULES).
//   content by type (a fresh object per tile, plain JSON):
//     enemy  {tier:'normal', enc?}      elite {tier:'elite', enc?}     enc is a DATA.encounters group id and is present only when the
//                                       Act has encounter pools (picked from tile.diff, weighted by w, varied across the map);
//                                       otherwise RUN chooses the group when the tile is entered.
//     boss {}  camp {}  forge {}  gemcache {}  empty {}  start {}  block {}  event {} (RUN picks the Detour (`fable`) when the tile is entered)
//     chest  {gold, relic, gems}        gold 45..75, relic = 'common'|'uncommon'|'rare' or null, gems = bool, exactly one of relic and gems
//     brush  {id}                       a DATA.brushes id (a Spell; the tile is the Busker)
//     well   {ink}                      ECONOMY.wellInk
//     shop   {seed, shop:{seed}}        seed is an integer; written twice because DESIGN 5.3 lists {seed} while 4.9 and RUN read content.shop.seed
//
// GENERATION RULES (MAP.generate)
//   * A 21 x 13 map, the start in column startCol (1) and the boss in column bossCol (19), both in rows 4..8 (so |dr| <= 4, inside the
//     documented |dr| <= 6). The start ring (every tile within startRing = 2 of the start) is painted and empty, the start tile is 'start'.
//   * Void ('block', the Blur to the player): about blockFrac (12 percent, Act 3 gets +3 points, never above 16 percent, never below 8) in blots, ridges, lakes
//     and rivers with fords, never a lone tile, never within 3 hexes of the start, never cutting the map: every non-block tile is
//     connected to the start, so no landmark or content tile can be unreachable. The boss keeps at least 3 non-block neighbours.
//   * Solvability: MAP.solve(fresh map).minInk lies in ECONOMY.map.solve.min..max (16..22). The cheapest routes are not single file (a
//     corridor-width gate) and the Void comes in at most 10 masses of at least 3 tiles on average, none over 34. Candidates that fail
//     are re-rolled with seed U.hash(seed, 'retry', k), k = 1, 2, ... up to 40 tries (about 3 percent of maps need a second one); if all
//     fail a deterministic "safe" layout (Void kept away from the straight line between start and boss) is returned.
//     M.attempts = the number of candidates built (41 means the safe layout).
//   * Counts: the number of tiles of each type is DATA.tileCount(type, nonBlock) (MAP.tileTarget adds the Act 3 rule: one extra elite).
//   * Placement, in this order. Elites: never within 3 hexes of the start or boss, at least 5 apart when possible, alternating near the
//     route and away from it, none ON the route. Wells: three sit ON the cheapest route at positions the starting Vox can pay for (so a
//     pure rush is solvable on wells alone). Camps and shops: spread out, one of each near the middle of the route, plus a camp shortly
//     before the boss and an early shop. Chests: about 60 percent of elites guard a chest within 2 hexes, the rest are spread and prefer
//     to sit off the route. Forges and gem caches: spread. The remaining wells: pairs on each side of the route within 3 hexes of it
//     (side = left or right of the direction of travel, so north or south of an eastward route), then scattered singles. Buskers (`brush` tiles):
//     one early, the rest spread. Events fill in. Enemies thicken around the cheapest route (at most 7 stand ON it).
//   * Encounter groups (when pools exist) are chosen per tile with their own seeded streams, so the LAYOUT never depends on which content
//     files are loaded. The Act number only changes the seed stream (and the two Act 3 rules above). Generation uses only
//     + - * / and sqrt (no exp, hypot, sin or cos), so a seed gives the same map in every browser.
//
// PUBLIC API (every function is pure except paint, applyBrush and move, which mutate M)
//   Basics
//     MAP.VERSION                          1
//     MAP.DIRS                             the six [dq, dr], frozen
//     MAP.key(q, r) -> 'q,r'               MAP.parse('q,r') -> {q, r}
//     MAP.colRow(q, r) -> {col, row}       MAP.fromColRow(col, row) -> {q, r}
//     MAP.dist(aq, ar, bq, br) -> int      hex distance
//     MAP.direction(dirIdx) -> [dq, dr]    any integer, wrapped mod 6
//     MAP.dirOf(M, q, r, tq, tr) -> 0..5   the direction whose pixel angle is nearest to the target hex (0 when the target is the origin;
//                                          an exact 30 degree tie goes to the counter-clockwise neighbour). For aiming a Spell by drag.
//     MAP.hexRing(q, r, radius) -> [[q,r]]   the cells at exactly that distance, SW corner first, going E, NE, NW, W, SW, SE (radius 0
//                                          is the centre; not clipped to the page; [] for a negative, NaN or absurd (> 200) radius)
//     MAP.hexRange(q, r, radius) -> [[q,r]]  centre then rings 1..radius (same limits)
//     MAP.tileTarget(type, nonBlock, chapter) -> int   expected tile count (DATA.tileCount plus the Act 3 extra elite)
//     MAP.LEGEND                           the glyph legend string MAP.ascii prints under a picture
//   Generation
//     MAP.generate({chapter, seed}) -> M   pure: the same arguments always give the same JSON. chapter defaults to 1, seed to 0.
//   Queries
//     MAP.tile(M, q, r) -> T | null        MAP.neighbors(M, q, r) -> [[q, r]] existing tiles in DIRS order (block tiles included)
//     MAP.tilesOf(M, type) -> [T]          row-major order       MAP.painted(M) -> [T]      MAP.frontier(M) -> [T] hidden, non-block,
//     MAP.isWalkable(t) -> bool            painted and not block  touching a painted tile (what canPaint accepts)
//     MAP.voidEdge(M) -> [T]               Void tiles touching a painted hex. Void is never `known` (fog hides it), so the map screen draws the
//                                          holes of this list: the ones the party can see from the painted ground
//     MAP.unresolved(M) -> [T]             painted, not done, content tiles reachable from pos (the mercy rule's question)
//     MAP.progress(M) -> {painted, total, pct, frac}   over non-block tiles; pct is an integer 0..100, frac is 0..1
//   Painting
//     MAP.canPaint(M, q, r) -> {ok, reason?}   reasons: 'off' (no such tile), 'void' (block), 'painted', 'far' (touches nothing painted)
//     MAP.paint(M, q, r) -> T | null       low level: marks painted and known, no Vox and no adjacency check; null for off-map, block
//                                          or already painted (so callers can count the non-null results)
//     MAP.pathToPaint(M, q, r) -> {path:[[q,r]...], cost} | null   the cheapest chain of hidden non-block hexes from the painted area to
//                                          the target, in painting order (first cell touches painted ground, last cell is the target),
//                                          cost = path.length. Among equal chains the straightest is returned. null when the target is
//                                          off-map, block, painted or unreachable.
//     MAP.solve(M) -> {ok, minInk, path}   fewest paints to connect the painted area to the boss (boss hex included); path is the chain.
//                                          {ok:true, minInk:0, path:[]} once the boss is painted; {ok:false, minInk:Infinity} if cut off.
//     MAP.spine(M) -> [[q, r]]             the canonical cheapest route of a FRESH map (ignores painted flags, treats every tile within
//                                          startRing of M.start as painted): the straightest chain from the ring edge to the boss,
//                                          minInk cells long, boss last. Content placement is keyed to it; a tutorial can point along it.
//   Spells (DATA.brushes, geometry exactly as DESIGN 4.8)
//     MAP.canBrush(M, id, q, r, dir) -> {ok, reason?, need?}   ok iff the origin rule holds and at least one cell is new.
//         reasons: 'brush' (unknown id) 'off' (no such tile) 'dir' (line and fan need an integer direction) 'origin' (origin rule failed,
//         need says what it wants: 'painted' | 'hidden-adjacent' | 'hidden-near') 'void' (blob or dot anchored on Void) 'nothing'.
//     MAP.brushCells(M, id, q, r, dir) -> [[q, r]]   only hexes that would newly paint: they exist, are unpainted and are not block.
//         Other cells are skipped WITHOUT stopping the Spell (RULE: a line passes over Void, painted hexes and the map edge without
//         painting them, and still covers k = 1..len). [] when not ok.
//         line (stroke 3, wave 5)  anchor painted; cells anchor + k * DIRS[dir], k = 1..len, nearest first
//         fan                      anchor painted; the neighbours in directions dir-1, dir, dir+1 (mod 6), in that order
//         blob (splash)            anchor hidden, non-block and touching painted ground; the anchor first, then its 6 neighbours
//         ring (halo)              anchor painted; its 6 neighbours in DIRS order
//         dot (blot)               anchor hidden, non-block, dist(M.pos, anchor) <= 4 (touching painted ground is not required)
//     MAP.applyBrush(M, id, q, r, dir) -> [T]   paints exactly brushCells and returns those tiles ([] when not ok). No Vox or Spell
//         accounting: RUN owns that.
//     MAP.brushAnchors(M, id) -> [{q, r, dirs}]   every anchor where the Spell would unmute something and the direction indices that work
//         (kinds that ignore dir list [0]); for highlighting legal anchors.
//   Walking
//     MAP.canMove(M, q, r) -> bool         painted, non-block and adjacent to M.pos
//     MAP.move(M, q, r) -> T | null        moves M.pos one step (null when canMove is false); RUN.step calls it
//     MAP.walkPath(M, q, r) -> [[q, r]] | null   the route the party walks, one step at a time, from M.pos (excluded) to the target:
//         only painted non-block hexes, the shortest and straightest route that avoids unresolved content tiles (walking is free, so the
//         party goes around trouble when that costs at most 8 extra steps; otherwise the shortest route), TRUNCATED so that it ends on the
//         first unresolved content tile (walking stops there and the tile triggers).
//         [] when the target is where the party stands, null when it is not painted, is Void or cannot be reached.
//     MAP.reachable(M) -> Set of 'q,r' keys   painted non-block tiles reachable from M.pos over painted non-block tiles (pos included)
//   Pixels (size defaults to ECONOMY.map.hexSize)
//     MAP.toPixel(q, r, size) -> {x, y}    the hex centre           MAP.fromPixel(x, y, size) -> {q, r}   cube rounding, exact inverse
//                                          (fromPixel returns the nearest hex even off the page: check MAP.tile(M, q, r) before using it)
//     MAP.corners(x, y, size) -> [{x, y} x6]                        MAP.bounds(M, size) -> {x0, y0, x1, y1}  the whole map, every hex outline
//   Saves
//     MAP.serialize(M) -> plain JSON object (a deep copy, version field v, painted, known and done preserved, no functions)
//     MAP.deserialize(o) -> M | null       null unless o.v === 1 and the tile set is complete and typed; normalises every flag
//   Checking and debugging
//     MAP.audit(M) -> [string]             rule violations of a FRESH generated map (counts, columns, ring, reachability, minInk range,
//                                          elite distances, wells, block share); [] when clean
//     MAP.ascii(M, {spine, fog}) -> string   a text picture, odd rows indented, glyphs in the legend printed by MAP.LEGEND
const MAP = (() => {
  const VERSION = 1;
  const SQ3 = Math.sqrt(3);
  const DIRS = Object.freeze([[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map((d) => Object.freeze(d)));
  const MAX_ATTEMPTS = 40;
  const MAX_RADIUS = 200;                          // hexRing and hexRange refuse anything bigger (the map is at most 99 wide)
  const NO_CONTENT = { empty: 1, start: 1, block: 1 };
  const BLOCK_FLOOR = 0.08, BLOCK_CEIL = 0.16;
  const AXES = [[1, 0], [0.5, SQ3 / 2], [-0.5, SQ3 / 2]];          // stretch directions for elongated blots (exact vectors, no sin or cos)
  const ROUTE_PULL = [1, 0.67, 0.45, 0.3, 0.2, 0.13, 0.09, 0.06, 0.04];   // how strongly enemies crowd the route by distance from it (a table, not exp)
  const SIDE_MIN = 1.4;                           // a tile counts as beside the route (north or south of it) when it is at least this far off its line
  const ENEMY_ROUTE_CAP = 7;                      // at most this many enemies on the cheapest route (a rush is a slog, never a wall)
  const DETOUR_CAP = 8;                           // walkPath goes around unresolved tiles only when that costs at most this many extra steps
  const WIDTH_GATE = 2.4;                       // corridor width gate: near-cheapest tiles per paint of the cheapest route
  const LEGEND = 'S start  B boss  # void  : painted  . path  e enemy  E elite  c chest  $ shop  ^ camp  ? fable  ~ well  b brush  g gem cache  f forge  * route';
  const GLYPH = { start: 'S', empty: '.', block: '#', enemy: 'e', elite: 'E', boss: 'B', chest: 'c', shop: '$', camp: '^', event: '?', well: '~', brush: 'b', gemcache: 'g', forge: 'f' };

  // Generation uses only + - * / and sqrt, which every engine rounds identically (Math.exp, hypot, sin and cos may differ in the last bit
  // between browsers, and one flipped comparison would make the same Daily Duet seed produce two different maps).
  const hyp = (x, y) => Math.sqrt(x * x + y * y);
  const eco = () => DATA.ECONOMY;
  const em = () => DATA.ECONOMY.map;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const isInt = Number.isInteger;

  // ------------------------------------------------------------------ coordinates
  const key = (q, r) => q + ',' + r;
  const parse = (k) => { const i = String(k).indexOf(','); return { q: +String(k).slice(0, i), r: +String(k).slice(i + 1) }; };
  const colRow = (q, r) => ({ col: q + Math.floor(r / 2), row: r });
  const fromColRow = (col, row) => ({ q: col - Math.floor(row / 2), r: row });
  const dist = (aq, ar, bq, br) => { const dq = bq - aq, dr = br - ar; return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2; };
  const direction = (d) => DIRS[((Math.floor(d) % 6) + 6) % 6].slice();          // a fresh array: DIRS itself is frozen
  const wrap6 = (d) => ((d % 6) + 6) % 6;

  function dirOf(M, q, r, tq, tr) {
    const dq = tq - q, dr = tr - r;
    if (!dq && !dr) return 0;
    const x = SQ3 * (dq + dr / 2), y = 1.5 * dr;
    let a = Math.atan2(-y, x) * 180 / Math.PI;               // 0 = east, counter-clockwise as drawn (y grows downward)
    if (a < 0) a += 360;
    return Math.floor((a + 30 + 1e-7) / 60) % 6;
  }

  function hexRing(q, r, radius) {
    radius = Math.floor(radius);
    if (!(radius >= 0) || radius > MAX_RADIUS) return [];                // negative, NaN, or absurd: nothing (Infinity must not loop)
    if (radius === 0) return [[q, r]];
    const out = [];
    let cq = q + DIRS[4][0] * radius, cr = r + DIRS[4][1] * radius;
    for (let d = 0; d < 6; d++) for (let s = 0; s < radius; s++) { out.push([cq, cr]); cq += DIRS[d][0]; cr += DIRS[d][1]; }
    return out;
  }
  function hexRange(q, r, radius) {
    radius = Math.floor(radius);
    if (!(radius >= 0) || radius > MAX_RADIUS) return [];
    let out = [];
    for (let k = 0; k <= radius; k++) out = out.concat(hexRing(q, r, k));
    return out;
  }

  // ------------------------------------------------------------------ pixels
  const sizeOf = (s) => (typeof s === 'number' && s > 0 ? s : em().hexSize);
  const toPixel = (q, r, size) => { const s = sizeOf(size); return { x: s * SQ3 * (q + r / 2), y: s * 1.5 * r }; };
  function fromPixel(x, y, size) {
    const s = sizeOf(size);
    const fq = (SQ3 / 3 * x - y / 3) / s, fr = (2 / 3 * y) / s;
    let rx = Math.round(fq), rz = Math.round(fr), ry = Math.round(-fq - fr);
    const dx = Math.abs(rx - fq), dy = Math.abs(ry - (-fq - fr)), dz = Math.abs(rz - fr);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return { q: rx + 0, r: rz + 0 };
  }
  function corners(x, y, size) {
    const s = sizeOf(size), out = [];
    for (let i = 0; i < 6; i++) { const a = (60 * i - 30) * Math.PI / 180; out.push({ x: x + s * Math.cos(a), y: y + s * Math.sin(a) }); }
    return out;
  }
  function bounds(M, size) {
    const s = sizeOf(size), w = SQ3 * s;
    return { x0: -w / 2, y0: -s, x1: w * (M.cols - 1) + w / 2 + (M.rows > 1 ? w / 2 : 0), y1: 1.5 * s * (M.rows - 1) + s };
  }

  // ------------------------------------------------------------------ grid model (index space, cached per map size)
  const MODELS = {};
  function model(cols, rows) {
    const id = cols + 'x' + rows;
    if (MODELS[id]) return MODELS[id];
    const n = cols * rows;
    const Q = new Array(n), R = new Array(n), X = new Array(n), Y = new Array(n);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        Q[i] = c - Math.floor(r / 2); R[i] = r;
        X[i] = SQ3 * (Q[i] + r / 2); Y[i] = 1.5 * r;
      }
    }
    const index = (q, r) => {
      if (!isInt(q) || !isInt(r) || r < 0 || r >= rows) return -1;
      const c = q + Math.floor(r / 2);
      return c < 0 || c >= cols ? -1 : r * cols + c;
    };
    const nbDir = new Array(n), nb = new Array(n);
    for (let i = 0; i < n; i++) {
      nbDir[i] = DIRS.map((d) => index(Q[i] + d[0], R[i] + d[1]));
      nb[i] = nbDir[i].filter((j) => j >= 0);
    }
    let D = null;                                                      // all-pairs hex distances (generation hammers dist), small maps only
    if (n <= 1024) {
      D = new Uint8Array(n * n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) D[i * n + j] = dist(Q[i], R[i], Q[j], R[j]);
    }
    return (MODELS[id] = { cols, rows, n, Q, R, X, Y, index, nb, nbDir, D });
  }
  const hd = (g, i, j) => (g.D ? g.D[i * g.n + j] : dist(g.Q[i], g.R[i], g.Q[j], g.R[j]));
  // perpendicular pixel distance of tile i from the line a-b (used to pick the straightest of several equal chains)
  function lineDev(g, i, a, b) {
    const ax = g.X[a], ay = g.Y[a], dx = g.X[b] - ax, dy = g.Y[b] - ay, len = hyp(dx, dy) || 1;
    return Math.abs((g.X[i] - ax) * dy - (g.Y[i] - ay) * dx) / len;
  }
  const pixDist = (g, i, j) => hyp(g.X[i] - g.X[j], g.Y[i] - g.Y[j]);

  function bfs(g, sources, pass) {
    const d = new Int32Array(g.n).fill(-1), queue = [];
    for (let k = 0; k < sources.length; k++) if (d[sources[k]] < 0) { d[sources[k]] = 0; queue.push(sources[k]); }
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h], nbs = g.nb[c];
      for (let k = 0; k < nbs.length; k++) { const nx = nbs[k]; if (d[nx] < 0 && pass(nx)) { d[nx] = d[c] + 1; queue.push(nx); } }
    }
    return d;
  }
  // The straightest of the shortest chains. `d` is a BFS field grown from `target` (target = 0); a chain steps to a neighbour whose d is
  // one lower. Dynamic programming over that DAG picks the chain that minimises its largest pixel deviation from the line ra -> rb,
  // then the sum of squared deviations. Returns {cells, max, sum} with the cells from the best source to the target (both included), or null.
  function chain(g, sources, d, target, ra, rb) {
    const memo = new Map();
    const better = (a, b) => !b || a.max < b.max - 1e-9 || (Math.abs(a.max - b.max) <= 1e-9 && a.sum < b.sum - 1e-9);
    const F = (c) => {
      let m = memo.get(c);
      if (m) return m;
      const own = lineDev(g, c, ra, rb);
      if (c === target) m = { max: own, sum: own * own, next: -1 };
      else {
        let best = null, bestNext = -1;
        for (const nx of g.nb[c]) {
          if (d[nx] !== d[c] - 1 || d[nx] < 0) continue;
          const f = F(nx);
          if (better(f, best)) { best = f; bestNext = nx; }
        }
        m = best ? { max: Math.max(own, best.max), sum: own * own + best.sum, next: bestNext } : { max: Infinity, sum: Infinity, next: -1 };
      }
      memo.set(c, m);
      return m;
    };
    let pick = -1, pm = null;
    for (const s of sources) { const f = F(s); if (better(f, pm)) { pm = f; pick = s; } }
    if (pick < 0 || pm.max === Infinity) return null;
    const cells = [pick];
    for (let c = pick; c !== target;) { c = memo.get(c).next; cells.push(c); }
    return { cells, max: pm.max, sum: pm.sum };
  }

  // The tile arrays of a live map: blocked (Void or missing) and painted, by index.
  function view(M) {
    const g = model(M.cols, M.rows);
    const blocked = new Uint8Array(g.n), painted = new Uint8Array(g.n);
    for (let i = 0; i < g.n; i++) {
      const t = M.tiles[g.Q[i] + ',' + g.R[i]];
      if (!t || t.type === 'block') blocked[i] = 1;
      else if (t.painted) painted[i] = 1;
    }
    return { g, blocked, painted };
  }

  // ------------------------------------------------------------------ queries
  const tile = (M, q, r) => (M && M.tiles && M.tiles[key(q, r)]) || null;
  function neighbors(M, q, r) {
    const out = [];
    for (const d of DIRS) if (M.tiles[key(q + d[0], r + d[1])]) out.push([q + d[0], r + d[1]]);
    return out;
  }
  const tilesOf = (M, type) => Object.values(M.tiles).filter((t) => t.type === type);
  const paintedTiles = (M) => Object.values(M.tiles).filter((t) => t.painted && t.type !== 'block');
  const isWalkable = (t) => !!t && !!t.painted && t.type !== 'block';
  const hasContent = (t) => !!t && !NO_CONTENT[t.type];
  const unresolvedTile = (t) => isWalkable(t) && !t.done && hasContent(t);
  const touchesPainted = (M, q, r) => DIRS.some((d) => { const n = M.tiles[key(q + d[0], r + d[1])]; return !!n && n.painted && n.type !== 'block'; });
  function frontier(M) {
    return Object.values(M.tiles).filter((t) => !t.painted && t.type !== 'block' && touchesPainted(M, t.q, t.r));
  }
  // Void tiles touching painted ground: the holes the party can see (Void is never `known`, the map screen shows holes only next to painted hexes)
  function voidEdge(M) {
    return Object.values(M.tiles).filter((t) => t.type === 'block' && touchesPainted(M, t.q, t.r));
  }
  function progress(M) {
    let painted = 0, total = 0;
    for (const t of Object.values(M.tiles)) { if (t.type === 'block') continue; total++; if (t.painted) painted++; }
    const frac = total ? painted / total : 0;
    return { painted, total, pct: Math.round(frac * 100), frac };
  }
  function reachable(M) {
    const out = new Set();
    const start = M.pos && tile(M, M.pos.q, M.pos.r);
    if (!isWalkable(start)) return out;
    const stack = [[start.q, start.r]];
    out.add(key(start.q, start.r));
    while (stack.length) {
      const c = stack.pop();
      for (const d of DIRS) {
        const k = key(c[0] + d[0], c[1] + d[1]);
        if (out.has(k) || !isWalkable(M.tiles[k])) continue;
        out.add(k); stack.push([c[0] + d[0], c[1] + d[1]]);
      }
    }
    return out;
  }
  function unresolved(M) {
    const reach = reachable(M);
    return Object.values(M.tiles).filter((t) => reach.has(key(t.q, t.r)) && unresolvedTile(t));
  }

  // ------------------------------------------------------------------ painting
  function canPaint(M, q, r) {
    const t = tile(M, q, r);
    if (!t) return { ok: false, reason: 'off' };
    if (t.type === 'block') return { ok: false, reason: 'void' };
    if (t.painted) return { ok: false, reason: 'painted' };
    return touchesPainted(M, q, r) ? { ok: true } : { ok: false, reason: 'far' };
  }
  function paint(M, q, r) {
    const t = tile(M, q, r);
    if (!t || t.type === 'block' || t.painted) return null;
    t.painted = true; t.known = true;
    return t;
  }
  function pathToPaint(M, q, r) {
    const { g, blocked, painted } = view(M);
    const ti = g.index(q, r);
    if (ti < 0 || blocked[ti] || painted[ti]) return null;
    const hidden = (i) => !blocked[i] && !painted[i];
    const d = bfs(g, [ti], hidden);
    let minD = Infinity;
    const starts = [];                                                    // hidden cells touching painted ground, with the painted cell the chain grows from
    for (let i = 0; i < g.n; i++) {
      if (d[i] < 0 || !hidden(i)) continue;
      let from = -1;
      for (const j of g.nb[i]) if (painted[j] && (from < 0 || pixDist(g, j, ti) < pixDist(g, from, ti))) from = j;
      if (from < 0) continue;
      if (d[i] < minD) { minD = d[i]; starts.length = 0; }
      if (d[i] === minD) starts.push([i, from]);
    }
    let best = null;
    for (const s of starts) {                                            // among the cheapest chains, the one straightest from its painted cell
      const c = chain(g, [s[0]], d, ti, s[1], ti);
      if (c && (!best || c.max < best.max - 1e-9 || (Math.abs(c.max - best.max) <= 1e-9 && c.sum < best.sum - 1e-9))) best = c;
    }
    if (!best) return null;
    const path = best.cells.map((i) => [g.Q[i], g.R[i]]);
    return { path, cost: path.length };
  }
  function solve(M) {
    const b = M.boss && tile(M, M.boss.q, M.boss.r);
    if (!b) return { ok: false, minInk: Infinity, path: [] };
    if (b.painted) return { ok: true, minInk: 0, path: [] };
    const p = pathToPaint(M, M.boss.q, M.boss.r);
    return p ? { ok: true, minInk: p.cost, path: p.path } : { ok: false, minInk: Infinity, path: [] };
  }

  // The cheapest chain of a fresh map, straightest of the equals. ring[i] marks the start ring, blocked[i] the Void.
  function routeOf(g, blocked, ring, startI, bossI) {
    const open = (i) => !blocked[i];
    const ringList = [];
    for (let i = 0; i < g.n; i++) if (ring[i] && !blocked[i]) ringList.push(i);
    const dR = bfs(g, ringList, open);
    const minInk = dR[bossI];
    if (minInk < 1) return { minInk: minInk < 0 ? -1 : 0, dR, dB: null, spine: [] };
    const dB = bfs(g, [bossI], open);
    const hiddenOnly = bfs(g, [bossI], (i) => !blocked[i] && !ring[i]);              // the chain runs over hidden ground only
    const firsts = [];
    for (let i = 0; i < g.n; i++) if (!ring[i] && !blocked[i] && hiddenOnly[i] === minInk - 1 && g.nb[i].some((j) => ring[j] && !blocked[j])) firsts.push(i);
    const best = chain(g, firsts, hiddenOnly, bossI, startI, bossI);
    if (!best) return { minInk: -1, dR, dB, spine: [] };
    let near = 0;
    for (let i = 0; i < g.n; i++) if (!blocked[i] && !ring[i] && dB[i] >= 0 && dR[i] > 0 && dR[i] + dB[i] <= minInk + 2) near++;
    return { minInk, dR, dB, spine: best.cells, width: near / minInk };
  }
  function ringMask(g, startI) {
    const ring = new Uint8Array(g.n);
    for (let i = 0; i < g.n; i++) if (hd(g, startI, i) <= em().startRing) ring[i] = 1;
    return ring;
  }
  function spine(M) {
    const { g, blocked } = view(M);
    const si = g.index(M.start.q, M.start.r), bi = g.index(M.boss.q, M.boss.r);
    if (si < 0 || bi < 0) return [];
    const route = routeOf(g, blocked, ringMask(g, si), si, bi);
    return route.spine.map((i) => [g.Q[i], g.R[i]]);
  }

  // ------------------------------------------------------------------ Spells (brushes)
  function brushPlan(M, id, q, r, dir) {
    const fail = (reason, need) => (need ? { ok: false, reason, need, cells: [] } : { ok: false, reason, cells: [] });
    const b = DATA.brushes[id];
    if (!b) return fail('brush');
    const o = tile(M, q, r);
    if (!o) return fail('off');
    const kind = b.kind;
    if ((kind === 'line' || kind === 'fan') && !isInt(dir)) return fail('dir');
    let cells = [];
    if (kind === 'line') {
      if (!o.painted) return fail('origin', 'painted');
      const d = DIRS[wrap6(dir)], len = b.len || 3;
      for (let k = 1; k <= len; k++) cells.push([q + d[0] * k, r + d[1] * k]);
    } else if (kind === 'fan') {
      if (!o.painted) return fail('origin', 'painted');
      for (let k = -1; k <= 1; k++) { const d = DIRS[wrap6(dir + k)]; cells.push([q + d[0], r + d[1]]); }
    } else if (kind === 'ring') {
      if (!o.painted) return fail('origin', 'painted');
      cells = DIRS.map((d) => [q + d[0], r + d[1]]);
    } else if (kind === 'blob') {
      if (o.type === 'block') return fail('void');
      if (o.painted || !touchesPainted(M, q, r)) return fail('origin', 'hidden-adjacent');
      cells = [[q, r]].concat(DIRS.map((d) => [q + d[0], r + d[1]]));
    } else if (kind === 'dot') {
      if (o.type === 'block') return fail('void');
      const at = M.pos || M.start;
      if (o.painted || !at || dist(at.q, at.r, q, r) > 4) return fail('origin', 'hidden-near');
      cells = [[q, r]];
    } else return fail('brush');
    cells = cells.filter((c) => { const t = tile(M, c[0], c[1]); return !!t && !t.painted && t.type !== 'block'; });
    if (!cells.length) return fail('nothing');
    return { ok: true, cells };
  }
  function canBrush(M, id, q, r, dir) {
    const p = brushPlan(M, id, q, r, dir);
    if (p.ok) return { ok: true };
    return p.need ? { ok: false, reason: p.reason, need: p.need } : { ok: false, reason: p.reason };
  }
  const brushCells = (M, id, q, r, dir) => brushPlan(M, id, q, r, dir).cells;
  function applyBrush(M, id, q, r, dir) {
    return brushPlan(M, id, q, r, dir).cells.map((c) => paint(M, c[0], c[1])).filter(Boolean);
  }
  function brushAnchors(M, id) {
    const b = DATA.brushes[id];
    if (!b) return [];
    const directional = b.kind === 'line' || b.kind === 'fan';
    const out = [];
    for (const t of Object.values(M.tiles)) {
      const dirs = [];
      if (directional) { for (let d = 0; d < 6; d++) if (brushPlan(M, id, t.q, t.r, d).ok) dirs.push(d); }
      else if (brushPlan(M, id, t.q, t.r, 0).ok) dirs.push(0);
      if (dirs.length) out.push({ q: t.q, r: t.r, dirs });
    }
    return out;
  }

  // ------------------------------------------------------------------ walking
  function canMove(M, q, r) {
    const t = tile(M, q, r);
    return isWalkable(t) && !!M.pos && dist(M.pos.q, M.pos.r, q, r) === 1;
  }
  function move(M, q, r) {
    if (!canMove(M, q, r)) return null;
    M.pos = { q, r };
    return tile(M, q, r);
  }
  function walkPath(M, q, r) {
    const { g, blocked, painted } = view(M);
    const pi = M.pos ? g.index(M.pos.q, M.pos.r) : -1, ti = g.index(q, r);
    if (pi < 0 || ti < 0 || blocked[ti] || !painted[ti]) return null;
    if (pi === ti) return [];
    const stop = (i) => unresolvedTile(M.tiles[g.Q[i] + ',' + g.R[i]]);
    const walk = (i) => painted[i] && !blocked[i];
    const direct = bfs(g, [ti], walk);
    if (direct[pi] < 0) return null;
    const clean = bfs(g, [ti], (i) => walk(i) && (i === pi || !stop(i)));   // walking is free, so go around trouble when that is not a huge detour
    const d = clean[pi] >= 0 && clean[pi] <= direct[pi] + DETOUR_CAP ? clean : direct;
    const full = chain(g, [pi], d, ti, pi, ti);
    if (!full) return null;
    const path = full.cells.slice(1);
    const cut = path.findIndex(stop);
    return (cut < 0 ? path : path.slice(0, cut + 1)).map((i) => [g.Q[i], g.R[i]]);
  }

  // ------------------------------------------------------------------ saves
  const serialize = (M) => U.deepCopy(M);
  function deserialize(o) {
    if (!o || typeof o !== 'object' || o.v !== VERSION) return null;
    const cols = o.cols, rows = o.rows;
    if (!isInt(cols) || !isInt(rows) || cols < 1 || rows < 1 || cols > 99 || rows > 99) return null;
    if (!o.tiles || typeof o.tiles !== 'object') return null;
    const g = model(cols, rows);
    const M = U.deepCopy(o);
    const tiles = {};
    for (let i = 0; i < g.n; i++) {
      const k = key(g.Q[i], g.R[i]);
      const s = M.tiles[k];
      if (!s || typeof s !== 'object' || DATA.LISTS.tiles.indexOf(s.type) < 0) return null;
      s.q = g.Q[i]; s.r = g.R[i];
      s.painted = s.type !== 'block' && !!s.painted;
      s.known = !!s.known || s.painted;
      s.done = !!s.done;
      s.diff = Number.isFinite(s.diff) ? s.diff : 0;
      if (!s.content || typeof s.content !== 'object' || Array.isArray(s.content)) s.content = {};
      tiles[k] = s;
    }
    M.tiles = tiles;
    const spot = (p) => (p && isInt(p.q) && isInt(p.r) && tiles[key(p.q, p.r)] ? { q: p.q, r: p.r } : null);
    const start = spot(M.start), boss = spot(M.boss);
    if (!start || !boss) return null;
    M.start = start; M.boss = boss; M.pos = spot(M.pos) || { q: start.q, r: start.r };
    M.chapter = isInt(M.chapter) && M.chapter > 0 ? M.chapter : 1;
    M.seed = Number.isFinite(M.seed) ? M.seed : 0;
    M.cols = cols; M.rows = rows; M.v = VERSION;
    return M;
  }

  // ------------------------------------------------------------------ generation: terrain
  function tileTarget(type, nonBlock, chapter) {
    let c = DATA.tileCount(type, nonBlock);
    if (type === 'elite' && chapter === 3) { const hi = eco().countMax.elite; c = Math.min(hi === undefined ? Infinity : hi, c + 1); }
    return c;
  }

  // Connected pockets of open tiles that the start cannot reach (arrays of indices).
  function pocketsOf(g, blocked, startI) {
    const seen = bfs(g, [startI], (i) => !blocked[i]);
    const out = [], mark = new Uint8Array(g.n);
    for (let i = 0; i < g.n; i++) {
      if (blocked[i] || seen[i] >= 0 || mark[i]) continue;
      const comp = [i]; mark[i] = 1;
      for (let h = 0; h < comp.length; h++) for (const nx of g.nb[comp[h]]) if (!blocked[nx] && seen[nx] < 0 && !mark[nx]) { mark[nx] = 1; comp.push(nx); }
      out.push(comp);
    }
    return out;
  }

  // How the Void clumps: number of separate masses and the size of the biggest (the gate keeps maps readable, never salt and pepper)
  function voidMasses(g, blocked) {
    const seen = new Uint8Array(g.n);
    let count = 0, biggest = 0;
    for (let i = 0; i < g.n; i++) {
      if (!blocked[i] || seen[i]) continue;
      count++; seen[i] = 1;
      const comp = [i];
      for (let h = 0; h < comp.length; h++) for (const nx of g.nb[comp[h]]) if (blocked[nx] && !seen[nx]) { seen[nx] = 1; comp.push(nx); }
      biggest = Math.max(biggest, comp.length);
    }
    return { count: count || 1, biggest };
  }

  function makeTerrain(g, rng, ctx) {
    const { startI, bossI, frac, safe } = ctx;
    const n = g.n, a = g.R[startI], b = g.R[bossI], mid = (a + b) / 2;
    const blocked = new Uint8Array(n);
    const dS = new Int32Array(n), dBo = new Int32Array(n);
    for (let i = 0; i < n; i++) { dS[i] = hd(g, startI, i); dBo[i] = hd(g, bossI, i); }
    const target = Math.round(n * frac), cap = Math.floor(n * BLOCK_CEIL);
    let cnt = 0;
    const list = [];                                                    // every Void tile so far, for spacing

    const segDist = (i) => {                                            // pixel distance from tile i to the segment start -> boss
      const ax = g.X[startI], ay = g.Y[startI], dx = g.X[bossI] - ax, dy = g.Y[bossI] - ay;
      const t = clamp(((g.X[i] - ax) * dx + (g.Y[i] - ay) * dy) / (dx * dx + dy * dy), 0, 1);
      return hyp(g.X[i] - (ax + t * dx), g.Y[i] - (ay + t * dy));
    };
    const canBlock = (i) => !blocked[i] && i !== bossI && dS[i] > 3 && !(safe && segDist(i) < 3.4);

    // add a feature if it keeps the map connected (tiny pockets are absorbed into the Void, anything worse rejects the feature)
    function tryFeature(cells, minSize) {
      const fresh = [];
      for (const i of cells) if (canBlock(i) && fresh.indexOf(i) < 0) fresh.push(i);
      if (fresh.length < (minSize || 2) || cnt + fresh.length > cap) return false;
      fresh.forEach((i) => { blocked[i] = 1; });
      const pockets = pocketsOf(g, blocked, startI);
      let extra = 0, fine = true;
      for (const p of pockets) { extra += p.length; if (p.length > 3 || p.indexOf(bossI) >= 0) fine = false; }
      if (!fine || cnt + fresh.length + extra > cap) { fresh.forEach((i) => { blocked[i] = 0; }); return false; }
      const absorbed = [];
      pockets.forEach((p) => p.forEach((i) => { blocked[i] = 1; absorbed.push(i); }));
      fresh.concat(absorbed).forEach((i) => list.push(i));
      cnt += fresh.length + absorbed.length;
      return true;
    }

    // a meandering line of Void from a map edge, one tile per row, drifting half a column left or right each step
    function riverCells(o) {
      const step = o.fromTop ? 1 : -1;
      let r = o.fromTop ? 0 : g.rows - 1;
      let q = o.col - Math.floor(r / 2), lastEast = rng.chance(0.5);
      const out = [];
      for (let k = 0; k < o.len; k++) {
        const i = g.index(q, r);
        if (i < 0) break;
        out.push(i);
        const bx = o.col + 0.25 + (o.tilt || 0) * k;                     // where the river wants to be (in columns)
        const cx = q + r / 2;
        let pEast = clamp(0.5 + (bx - cx) * 0.45, 0.08, 0.92);
        if (rng.chance(0.3)) pEast = lastEast ? 0.9 : 0.1;
        const east = rng.chance(pEast);
        lastEast = east;
        if (o.fromTop) { q = east ? q : q - 1; } else { q = east ? q + 1 : q; }
        r += step;
      }
      return out;
    }
    function fordRows(count, lo, hi) {
      const rows = [];
      let f = rng.int(lo, Math.max(lo, hi));
      for (let k = 0; k < count; k++) {
        rows.push(f);
        f = clamp(f + (k % 2 === 0 ? 1 : -1) * rng.int(3, 5) * (rng.chance(0.5) ? 1 : -1), 2, g.rows - 3);
      }
      return rows;
    }
    // a compact (or stretched) blob of Void grown from a centre tile
    function blotCells(centre, size, axis) {
      const set = [centre], inSet = new Set([centre]);
      while (set.length < size) {
        const cand = new Map();
        for (const i of set) for (const j of g.nb[i]) if (!inSet.has(j) && canBlock(j)) cand.set(j, 0);
        if (!cand.size) break;
        const entries = [...cand.keys()].map((j) => {
          let c = 0;
          for (const k of g.nb[j]) if (inSet.has(k)) c++;
          let w = 0.4 + c * c;
          if (axis) {
            const dx = g.X[j] - g.X[centre], dy = g.Y[j] - g.Y[centre], len = hyp(dx, dy) || 1;
            w *= 0.35 + Math.abs((dx * axis[0] + dy * axis[1]) / len) * 1.3;
          }
          return [j, w];
        });
        const pick = rng.weighted(entries);
        set.push(pick); inSet.add(pick);
      }
      return set;
    }
    function centre(minS, minB, sepFeature, rowLo, rowHi, colLo, colHi) {
      for (let t = 0; t < 70; t++) {
        const r = rng.int(rowLo === undefined ? 0 : rowLo, rowHi === undefined ? g.rows - 1 : rowHi);
        const c = rng.int(colLo === undefined ? 0 : colLo, colHi === undefined ? g.cols - 1 : colHi);
        const i = r * g.cols + c;
        if (!canBlock(i) || dS[i] < minS || dBo[i] < minB) continue;
        if (list.some((j) => hd(g, i, j) < sepFeature)) continue;
        return i;
      }
      return -1;
    }
    const blot = (size, colLo, colHi, rowLo, rowHi, axis) => {
      const c = centre(5, 3, 3, rowLo, rowHi, colLo, colHi);
      return c >= 0 && tryFeature(blotCells(c, size, axis), 2);
    };

    let kind = safe ? 'archipelago' : rng.weighted([['river', 30], ['canyon', 20], ['lake', 20], ['archipelago', 15], ['serpentine', 15]]);
    if (kind === 'river') {
      const cells = riverCells({ fromTop: rng.chance(0.5), col: rng.int(7, 14), len: g.rows, tilt: rng.range(-0.3, 0.3) });
      const fords = fordRows(rng.chance(0.75) ? 2 : 3, Math.max(2, Math.min(a, b) - 3), Math.min(g.rows - 3, Math.max(a, b) + 3));
      const wide = rng.chance(0.3) ? 1 : 0;
      tryFeature(cells.filter((i) => fords.every((f) => g.R[i] < f || g.R[i] > f + wide)), 3);
    } else if (kind === 'canyon') {
      const col = rng.int(8, 13), half = rng.int(1, 2), gm = Math.round(mid) + rng.int(-1, 1);
      const lo = gm - half, hi = gm + half;
      const thick = (cells) => cells.concat(cells.map((i) => g.nbDir[i][0]).filter((j) => j >= 0 && rng.chance(0.75)));
      tryFeature(thick(riverCells({ fromTop: true, col, len: lo, tilt: rng.range(-0.15, 0.15) })), 3);
      tryFeature(thick(riverCells({ fromTop: false, col: col + rng.int(-1, 2), len: g.rows - 1 - hi, tilt: rng.range(-0.15, 0.15) })), 3);
    } else if (kind === 'lake') {
      const axis = rng.chance(0.5) ? [0, 1] : null;
      for (let t = 0; t < 8; t++) {
        const c = centre(6, 5, 0, Math.max(2, Math.round(mid) - 1), Math.min(g.rows - 3, Math.round(mid) + 1), 9, 12);
        if (c >= 0 && tryFeature(blotCells(c, rng.int(9, 12), axis), 4)) break;
      }
      tryFeature(riverCells({ fromTop: rng.chance(0.5), col: rng.int(5, 16), len: rng.int(5, 8), tilt: rng.range(-0.3, 0.3) }), 3);
    } else if (kind === 'serpentine') {
      const flip = rng.chance(0.5);
      const top = { fromTop: !flip, col: rng.int(6, 9), len: rng.int(6, 9), tilt: rng.range(-0.15, 0.15) };
      const bot = { fromTop: flip, col: rng.int(12, 15), len: rng.int(6, 9), tilt: rng.range(-0.15, 0.15) };
      tryFeature(riverCells(top), 3);
      tryFeature(riverCells(bot), 3);
    } else {
      tryFeature(riverCells({ fromTop: rng.chance(0.5), col: rng.int(5, 16), len: rng.int(6, 9), tilt: rng.range(-0.3, 0.3) }), 3);
    }
    // fill the budget with blots: small groves and rocks, spaced apart so they never read as salt and pepper
    for (let t = 0; t < 60 && cnt < target - 1; t++) {
      const size = clamp(target - cnt, 2, rng.int(3, 6));
      blot(size, 2, g.cols - 1, undefined, undefined, rng.chance(0.4) ? rng.pick(AXES) : null);
    }
    // finish: no lone Void tiles, and the boss keeps at least three open neighbours
    for (let i = 0; i < n; i++) if (blocked[i] && !g.nb[i].some((j) => blocked[j])) { blocked[i] = 0; cnt--; }
    let open = g.nb[bossI].filter((j) => !blocked[j]).length;
    for (const j of rng.shuffle(g.nb[bossI])) {
      if (open >= 3) break;
      if (blocked[j]) { blocked[j] = 0; open++; cnt--; }
    }
    for (let i = 0; i < n; i++) if (blocked[i] && !g.nb[i].some((j) => blocked[j])) { blocked[i] = 0; cnt--; }
    return blocked;
  }

  // ------------------------------------------------------------------ generation: content
  function populate(g, blocked, ring, route, ctx, rng) {
    const n = g.n, startI = ctx.startI, bossI = ctx.bossI, chapter = ctx.chapter, E = eco();
    const typeOf = new Array(n).fill('empty'), used = new Uint8Array(n), placed = {};
    let nonBlock = 0;
    for (let i = 0; i < n; i++) { if (blocked[i]) { typeOf[i] = 'block'; used[i] = 1; } else { nonBlock++; if (ring[i]) used[i] = 1; } }
    used[bossI] = 1; typeOf[bossI] = 'boss'; typeOf[startI] = 'start';
    const counts = {};
    Object.keys(E.dist).forEach((t) => { counts[t] = tileTarget(t, nonBlock, chapter); });

    // measures: distance from the start and boss, progress along the map, and where each tile sits relative to the cheapest route
    // prog = share of the straight distance start -> boss; rprog = how far along the cheapest route the nearest route tile is (they differ on detours)
    // side = which side of the route's direction of travel the tile lies on (-1 north of an eastward route, +1 south, 0 when within 1.4 of the line);
    // sideOff = how far off the line it is in hex-width units, so a fallback can ask for a weaker side
    const dSt = new Int32Array(n), dBo = new Int32Array(n), dSp = new Int32Array(n), side = new Int8Array(n), sideOff = new Array(n), prog = new Array(n), rprog = new Array(n);
    const total = hd(g, startI, bossI) || 1, sp = route.spine;
    for (let i = 0; i < n; i++) {
      dSt[i] = hd(g, startI, i); dBo[i] = hd(g, bossI, i); prog[i] = clamp(dSt[i] / total, 0, 1);
      let bd = Infinity, near = Infinity, nearK = 0;
      for (let k = 0; k < sp.length; k++) {
        const hk = hd(g, i, sp[k]), pd = pixDist(g, i, sp[k]);
        if (hk < near || (hk === near && pd < bd - 1e-9)) { near = hk; nearK = k; bd = pd; }
      }
      dSp[i] = near; rprog[i] = (nearK + 1) / (sp.length || 1);
      const a = sp[Math.max(0, nearK - 2)], b = sp[Math.min(sp.length - 1, nearK + 2)], c = sp[nearK];
      const tx = g.X[b] - g.X[a], ty = g.Y[b] - g.Y[a], rx = g.X[i] - g.X[c], ry = g.Y[i] - g.Y[c], tl = hyp(tx, ty) || 1;
      const cross = (tx * ry - ty * rx) / tl;
      sideOff[i] = Math.abs(cross);
      side[i] = sideOff[i] >= SIDE_MIN ? (cross < 0 ? -1 : 1) : 0;
    }
    // nearest[type][i] = hex distance from tile i to the closest tile of that type placed so far (12 = none within reach), kept up to date by put()
    const nearest = {};
    const minDist = (i, types) => {
      let m = 12;
      for (const t of types) { const a = nearest[t]; if (a && a[i] < m) m = a[i]; }
      return m;
    };
    const put = (type, i) => {
      typeOf[i] = type; used[i] = 1; (placed[type] = placed[type] || []).push(i);
      const a = nearest[type] || (nearest[type] = new Int32Array(n).fill(12));
      for (let j = 0; j < n; j++) { const d = hd(g, i, j); if (d < a[j]) a[j] = d; }
    };

    // Best-candidate placement. spec: {sep, against:[types], filter(i) or [filter(i), ...], score(i), noise}. The separation relaxes one
    // step at a time when it cannot be met, a list of filters is tried in order, and the filter is dropped as a last resort, so a
    // placement only fails when the map is full.
    function place(type, count, specOf) {
      const out = [];
      for (let k = 0; k < count; k++) {
        const s = typeof specOf === 'function' ? specOf(k) : specOf;
        const against = s.against || [type];
        const noise = s.noise === undefined ? 0.6 : s.noise;
        let pick = -1;
        const filters = (Array.isArray(s.filter) ? s.filter : s.filter ? [s.filter] : []).concat([null]);
        for (let pass = 0; pick < 0 && pass < filters.length; pass++) {
          const f = filters[pass];
          for (let sepNow = s.sep || 0; pick < 0 && sepNow >= 0; sepNow--) {
            let bestS = -Infinity;
            for (let i = 0; i < n; i++) {
              if (used[i]) continue;
              if (f && !f(i)) continue;
              if (sepNow > 0 && minDist(i, against) < sepNow) continue;
              const sc = (s.score ? s.score(i) : 0) + rng() * noise;
              if (sc > bestS) { bestS = sc; pick = i; }
            }
          }
        }
        if (pick < 0) break;
        put(type, pick); out.push(pick);
      }
      return out;
    }
    const spreadOf = (types, cap) => (i) => 0.35 * Math.min(minDist(i, types), cap || 9);
    const near = (target, wgt) => (i) => -(wgt || 4) * Math.abs(prog[i] - target);
    const nearR = (target, wgt) => (i) => -(wgt || 4) * Math.abs(rprog[i] - target);

    // elites: spread along the map, alternating near the route and away from it, never near the start or the boss
    const nE = counts.elite;
    place('elite', nE, (k) => {
      const tp = 0.22 + 0.62 * (k + 0.5) / Math.max(1, nE), onRoute = k % 2 === 0, want = k % 2 === 0 ? -1 : 1;
      return {
        sep: 5, noise: 0.8,
        filter: (i) => dSt[i] >= 4 && dBo[i] >= 4 && dSp[i] >= 1,
        score: (i) => near(tp)(i) - (onRoute ? 0.5 * Math.abs(dSp[i] - 2) : 0.3 * Math.abs(dSp[i] - 5)) + (side[i] === want ? 0.5 : 0),
      };
    });

    // wells on the route itself, at positions the Vox can pay for, so a pure rush is solvable on wells alone
    const WELLS = em().wells, ranges = [[3, 7], [8, 12], [13, 16]];
    const nW = counts.well, onRoute = Math.min(WELLS.count, ranges.length, nW), L = sp.length;
    let lastPos = 0;
    for (let w = 0; w < onRoute; w++) {
      const capPos = Math.min(L - 1, E.startInk + w * E.wellInk - 2);
      const lo = Math.min(capPos, Math.max(ranges[w][0], lastPos + 3)), hi = Math.max(lo, Math.min(capPos, ranges[w][1]));
      let p = rng.int(lo, hi);
      while (p > 1 && used[sp[p - 1]]) p--;
      if (sp[p - 1] !== undefined && !used[sp[p - 1]]) put('well', sp[p - 1]);
      lastPos = p;
    }
    // camps and shops: one of each near the middle of the route, a camp before the boss, an early shop, the rest spread out
    const nC = counts.camp, nS = counts.shop;
    const midRoute = (i) => dSp[i] <= 2 && rprog[i] >= 0.35 && rprog[i] <= 0.65;
    place('camp', Math.min(1, nC), { sep: 0, filter: midRoute, score: (i) => nearR(0.5)(i) - 0.2 * dSp[i] });
    place('shop', Math.min(1, nS), { filter: (i) => midRoute(i) && minDist(i, ['camp']) >= 2, score: (i) => nearR(0.42)(i) - 0.2 * dSp[i] });
    if (nC > 1) place('camp', 1, { sep: 4, filter: (i) => dBo[i] >= 3 && dBo[i] <= 7 && dSp[i] <= 3, score: (i) => -2 * Math.abs(dBo[i] - 5) - 0.3 * dSp[i] });
    if (nS > 1) place('shop', 1, { sep: 5, filter: (i) => prog[i] >= 0.12 && prog[i] <= 0.38 && dSp[i] <= 4 && minDist(i, ['camp']) >= 2, score: (i) => near(0.25)(i) });
    place('camp', Math.max(0, nC - 2), { sep: 5, score: (i) => spreadOf(['camp', 'shop'], 8)(i) });
    place('shop', Math.max(0, nS - 2), { sep: 6, score: (i) => spreadOf(['shop', 'camp'], 8)(i) });
    // chests: many guard an elite (the tile text says so), the rest are spread and prefer to sit off the route
    const nCh = counts.chest, elites = rng.shuffle(placed.elite || []);
    const guards = Math.min(Math.max(0, nCh - 1), Math.ceil(elites.length * 0.6));
    for (let k = 0; k < guards; k++) {
      const e = elites[k];
      place('chest', 1, { sep: 3, filter: (i) => hd(g, i, e) <= 2, score: (i) => -2 * hd(g, i, e) + 0.3 * Math.min(dSp[i], 5) });
    }
    place('chest', nCh - guards, { sep: 4, score: (i) => spreadOf(['chest'], 8)(i) + 0.3 * Math.min(dSp[i], 5) + near(0.6, 1.5)(i) });
    // forges and gem caches
    place('forge', counts.forge, (k) => ({ sep: 6, score: (i) => (k === 0 ? near(0.55)(i) - 0.3 * dSp[i] : spreadOf(['forge'], 9)(i)) + (k === 0 ? 0 : 0.15 * Math.min(dSp[i], 5)) }));
    place('gemcache', counts.gemcache, { sep: 5, score: (i) => spreadOf(['gemcache'], 9)(i) + 0.25 * Math.min(dSp[i], 5) });
    // the remaining wells: pairs north and south of the route within reach of it, one more pair, then singles
    let remaining = nW - onRoute;
    const clusters = [{ want: -1, tp: 0.3 }, { want: 1, tp: 0.62 }, { want: 0, tp: 0.85 }];
    for (const c of clusters) {
      if (remaining <= 0) break;
      // the wanted side within reach of the route; if that side has no room, anywhere within reach
      const reach = (i) => dSp[i] >= 1 && dSp[i] <= WELLS.within;
      const head = place('well', 1, {
        sep: 3, noise: 0.5,
        filter: c.want === 0 ? [reach] : [(i) => reach(i) && side[i] === c.want, reach],
        score: (i) => near(c.tp)(i),
      })[0];
      remaining--;
      if (head !== undefined && remaining > 0) {
        place('well', 1, { sep: 0, filter: (i) => hd(g, i, head) <= 2 && dBo[i] >= 2, score: (i) => -hd(g, i, head) });
        remaining--;
      }
    }
    place('well', remaining, { sep: 3, noise: 1, score: (i) => -0.3 * Math.abs(dSp[i] - 3.5) + spreadOf(['well'], 6)(i) * 0.4 });
    // Buskers (`brush` tiles): one early, one within reach of the start, the rest spread
    place('brush', Math.min(1, counts.brush), { filter: (i) => prog[i] <= 0.42 && dSp[i] <= 4, score: (i) => near(0.22, 2)(i) });
    place('brush', Math.max(0, counts.brush - 1), { sep: 5, score: (i) => spreadOf(['brush'], 9)(i) });
    place('event', counts.event, { sep: 2, noise: 1, score: () => 0 });
    // enemies thicken around the cheapest route so a rush means fights, and thin out toward the map edges (at most ENEMY_ROUTE_CAP on the route)
    let cand = [], wts = [], wsum = 0;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const w = (0.55 + 1.4 * ROUTE_PULL[Math.min(dSp[i], ROUTE_PULL.length - 1)]) * (dSt[i] <= 3 ? 0.6 : 1);
      cand.push(i); wts.push(w); wsum += w;
    }
    const onSpine = new Set(sp);
    let spineFights = 0;
    for (let left = Math.min(counts.enemy, cand.length); left > 0 && cand.length; left--) {
      let r = rng() * wsum, k = 0;
      while (k < cand.length - 1 && (r -= wts[k]) >= 0) k++;
      const pick = cand[k];
      wsum -= wts[k];
      cand[k] = cand[cand.length - 1]; wts[k] = wts[wts.length - 1]; cand.pop(); wts.pop();
      put('enemy', pick);
      if (onSpine.has(pick) && ++spineFights === ENEMY_ROUTE_CAP) {
        const keep = [];
        wsum = 0;
        cand.forEach((i, x) => { if (!onSpine.has(i)) { keep.push(x); wsum += wts[x]; } });
        cand = keep.map((x) => cand[x]); wts = keep.map((x) => wts[x]);
      }
    }
    return { typeOf, placed, nonBlock, counts };
  }

  // ------------------------------------------------------------------ generation: assembling a candidate
  function build(chapter, seed, gs, safe) {
    const M0 = em();
    const cols = M0.cols, rows = M0.rows;
    const g = model(cols, rows);
    const rl = U.rng(U.hash(gs, 'ch' + chapter, 'layout'));
    const startRow = rl.int(4, 8), bossRow = rl.int(4, 8);
    const startI = startRow * cols + M0.startCol, bossI = bossRow * cols + M0.bossCol;
    const bump = chapter === 3 ? 0.03 : 0;
    const frac = clamp(M0.blockFrac + bump + rl.range(-0.02, 0.02), BLOCK_FLOOR + 0.01, BLOCK_CEIL - 0.005);
    const ctx = { startI, bossI, frac, safe, chapter };
    const blocked = makeTerrain(g, U.rng(U.hash(gs, 'ch' + chapter, 'terrain')), ctx);
    const ring = ringMask(g, startI);
    for (let i = 0; i < g.n; i++) if (ring[i]) blocked[i] = 0;
    const route = routeOf(g, blocked, ring, startI, bossI);
    let nb = 0;
    for (let i = 0; i < g.n; i++) if (blocked[i]) nb++;
    const span = eco().map.solve;
    const connected = pocketsOf(g, blocked, startI).length === 0;
    const masses = voidMasses(g, blocked);
    const good = connected && route.minInk >= span.min && route.minInk <= span.max
      && nb >= Math.ceil(g.n * BLOCK_FLOOR) && nb <= Math.floor(g.n * BLOCK_CEIL) && g.nb[bossI].filter((j) => !blocked[j]).length >= 3
      && (safe || (route.width >= WIDTH_GATE && masses.count <= 10 && nb / masses.count >= 3 && masses.biggest <= 34));
    if (!good && !safe) return null;
    const pop = populate(g, blocked, ring, route, ctx, U.rng(U.hash(gs, 'ch' + chapter, 'content')));
    return assemble(g, chapter, seed, gs, startI, bossI, ring, blocked, pop);
  }

  function assemble(g, chapter, seed, gs, startI, bossI, ring, blocked, pop) {
    const E = eco(), landmarks = DATA.LISTS.landmarks;
    const payload = U.rng(U.hash(gs, 'ch' + chapter, 'payload'));
    const tiles = {};
    const startQ = g.Q[startI], startR = g.R[startI], total = dist(startQ, startR, g.Q[bossI], g.R[bossI]) || 1;
    const chestRelic = {};
    const chests = pop.placed.chest || [];
    const flags = payload.shuffle(chests.map((_, k) => k < Math.ceil(chests.length / 2)));
    chests.forEach((i, k) => { chestRelic[i] = flags[k]; });
    const brushIds = Object.keys(DATA.brushes);
    let bag = [];
    for (let i = 0; i < g.n; i++) {
      const type = pop.typeOf[i], q = g.Q[i], r = g.R[i];
      let content = {};
      if (type === 'enemy') content = { tier: 'normal' };
      else if (type === 'elite') content = { tier: 'elite' };
      else if (type === 'chest') {
        const relic = chestRelic[i];
        content = { gold: payload.int(E.gold.chest[0], E.gold.chest[1]), relic: relic ? payload.weighted(Object.keys(E.relicWeights.chest).map((k) => [k, E.relicWeights.chest[k]])) : null, gems: !relic };
      } else if (type === 'brush') {
        if (!bag.length) bag = payload.shuffle(brushIds);
        content = { id: bag.pop() };
      } else if (type === 'well') content = { ink: E.wellInk };
      else if (type === 'shop') { const seedN = U.hash(gs, 'shop', q, r); content = { seed: seedN, shop: { seed: seedN } }; }
      const painted = !!ring[i] && type !== 'block';
      tiles[key(q, r)] = {
        q, r, type, painted, known: painted || landmarks.indexOf(type) >= 0, done: false,
        diff: clamp(Math.round(dist(startQ, startR, q, r) / total * 100) / 100, 0, 1), content,
      };
    }
    // encounter groups, when the Act has pools: own stream per tile, varied across the map, layout never depends on them
    const pools = DATA.encounters && DATA.encounters[chapter];
    if (pools) {
      const usedEnc = {};
      for (const t of Object.values(tiles)) {
        if (t.type !== 'enemy' && t.type !== 'elite') continue;
        const kind = t.type === 'elite' ? 'elite' : 'normal', all = pools[kind] || [];
        if (!all.length) continue;
        let cand = DATA.eligibleGroups(chapter, kind, t.diff);
        if (!cand.length) cand = all;
        const pick = U.rng(U.hash(gs, 'enc', t.q, t.r)).weighted(cand, (x) => (x.w > 0 ? x.w : 1) / (1 + (usedEnc[x.id] || 0)));
        if (pick) { t.content.enc = pick.id; usedEnc[pick.id] = (usedEnc[pick.id] || 0) + 1; }
      }
    }
    return {
      v: VERSION, chapter, seed, cols: g.cols, rows: g.rows, tiles,
      start: { q: startQ, r: startR }, boss: { q: g.Q[bossI], r: g.R[bossI] }, pos: { q: startQ, r: startR }, attempts: 1,
    };
  }

  function generate(opts) {
    opts = opts || {};
    const chapter = isInt(opts.chapter) && opts.chapter > 0 ? opts.chapter : 1;
    const seed = Number.isFinite(opts.seed) ? opts.seed : 0;
    for (let k = 0; k < MAX_ATTEMPTS; k++) {
      const M = build(chapter, seed, k === 0 ? seed : U.hash(seed, 'retry', k), false);
      if (M) { M.attempts = k + 1; return M; }
    }
    const M = build(chapter, seed, U.hash(seed, 'safe'), true);
    M.attempts = MAX_ATTEMPTS + 1;
    return M;
  }

  // ------------------------------------------------------------------ checking and debugging
  function audit(M) {
    const out = [], bad = (s) => out.push(s), E = eco(), EM = E.map;
    if (!M || M.v !== VERSION) return ['not a version 1 map'];
    const g = model(M.cols, M.rows);
    if (Object.keys(M.tiles).length !== g.n) bad('tile count ' + Object.keys(M.tiles).length + ' != ' + g.n);
    const s = tile(M, M.start.q, M.start.r), b = tile(M, M.boss.q, M.boss.r);
    if (!s || s.type !== 'start') bad('start tile missing or not typed start');
    if (!b || b.type !== 'boss') bad('boss tile missing or not typed boss');
    if (colRow(M.start.q, M.start.r).col !== EM.startCol) bad('start not in column startCol');
    if (colRow(M.boss.q, M.boss.r).col !== EM.bossCol) bad('boss not in column bossCol');
    if (Math.abs(M.start.r - M.boss.r) > 6) bad('start and boss more than 6 rows apart');
    if (M.pos.q !== M.start.q || M.pos.r !== M.start.r) bad('fresh map must stand on the start');
    const all = Object.values(M.tiles);
    const nonBlock = all.filter((t) => t.type !== 'block').length, nb = all.length - nonBlock;
    if (nb < all.length * BLOCK_FLOOR || nb > all.length * BLOCK_CEIL) bad('Void share ' + (nb / all.length).toFixed(3) + ' outside 8..16 percent');
    all.forEach((t) => {
      const ring = dist(M.start.q, M.start.r, t.q, t.r) <= EM.startRing;
      if (ring && t.type === 'block') bad('Void inside the start ring at ' + key(t.q, t.r));
      if (t.painted !== (ring && t.type !== 'block')) bad('painted flag wrong at ' + key(t.q, t.r));
      if (t.done) bad('done flag set on a fresh map at ' + key(t.q, t.r));
      if (t.type === 'block' && !neighbors(M, t.q, t.r).some((c) => M.tiles[key(c[0], c[1])].type === 'block')) bad('lone Void tile at ' + key(t.q, t.r));
      if (DATA.LISTS.landmarks.indexOf(t.type) >= 0 && !t.known) bad('landmark not known at ' + key(t.q, t.r));
    });
    Object.keys(E.dist).forEach((type) => {
      const want = tileTarget(type, nonBlock, M.chapter), have = tilesOf(M, type).length;
      if (have !== want) bad(type + ' count ' + have + ' != ' + want);
    });
    const reach = bfs(g, [g.index(M.start.q, M.start.r)], (i) => M.tiles[key(g.Q[i], g.R[i])].type !== 'block');
    all.forEach((t) => { if (t.type !== 'block' && reach[g.index(t.q, t.r)] < 0) bad('unreachable tile ' + key(t.q, t.r)); });
    if (neighbors(M, M.boss.q, M.boss.r).filter((c) => M.tiles[key(c[0], c[1])].type !== 'block').length < 2) bad('boss has fewer than 2 open neighbours');
    const sol = solve(M);
    if (!sol.ok || sol.minInk < EM.solve.min || sol.minInk > EM.solve.max) bad('minInk ' + sol.minInk + ' outside ' + EM.solve.min + '..' + EM.solve.max);
    tilesOf(M, 'elite').forEach((t) => {
      if (dist(M.start.q, M.start.r, t.q, t.r) < 4 || dist(M.boss.q, M.boss.r, t.q, t.r) < 4) bad('elite too close to the start or boss at ' + key(t.q, t.r));
    });
    const sp = spine(M);
    const nearWells = tilesOf(M, 'well').filter((t) => sp.some((c) => dist(c[0], c[1], t.q, t.r) <= EM.wells.within)).length;
    if (nearWells < EM.wells.count) bad('only ' + nearWells + ' wells near the cheapest route');
    return out;
  }

  function ascii(M, o) {
    o = o || {};
    const onSpine = new Set(o.spine ? spine(M).map((c) => key(c[0], c[1])) : []);
    const lines = [];
    for (let r = 0; r < M.rows; r++) {
      let line = r % 2 ? ' ' : '';
      for (let c = 0; c < M.cols; c++) {
        const t = M.tiles[key(c - Math.floor(r / 2), r)];
        let ch = t ? (GLYPH[t.type] || '!') : ' ';
        if (t && t.type === 'empty') ch = t.painted ? ':' : onSpine.has(key(t.q, t.r)) ? '*' : '.';
        if (t && o.fog && !t.painted && !t.known) ch = ' ';
        line += ch + ' ';
      }
      lines.push(line.replace(/\s+$/, ''));
    }
    return lines.join('\n');
  }

  return {
    VERSION, DIRS, LEGEND, key, parse, colRow, fromColRow, dist, direction, dirOf, hexRing, hexRange, tileTarget,
    generate, tile, neighbors, tilesOf, painted: paintedTiles, frontier, voidEdge, isWalkable, unresolved, progress,
    canPaint, paint, pathToPaint, solve, spine, canBrush, brushCells, applyBrush, brushAnchors,
    canMove, move, walkPath, reachable, toPixel, fromPixel, corners, bounds, serialize, deserialize, audit, ascii,
  };
})();
