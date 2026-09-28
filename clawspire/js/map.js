// Clawspire -- the overworld. A hex map sunk in darkness that the player
// lights up (bulbs, tools, the view from a tower, the lie of the land) and
// walks one hex at a time. The field names keep their old spelling: M.ink
// is the bulbs, M.brushes the tools, tile.revealed means lit.
//
// Coordinate convention (everything in this file and every caller uses it):
//   * Axial (q, r), pointy-top hexes. Row r runs 0..rows-1 top to bottom.
//   * The map is an "odd-r" offset rectangle: offset column c = q + floor(r / 2)
//     runs 0..cols-1, so row r holds q = -floor(r/2) .. cols-1-floor(r/2) and
//     odd rows sit half a hex to the right. On screen the map is a rectangle.
//   * toPixel(q, r, size) = (size + sqrt3*size*(q + r/2), size + 1.5*size*r),
//     so hex (0,0) (top-left) is centred at (size, size). fromPixel inverts it
//     with cube rounding. MAP.size() gives the extra {ox, oy} to centre a map,
//     MAP.bounds() the world box a camera pans over.
//
// Terrain: every tile has terrain 'land' | 'shallow' | 'sea', a ground type
// for the tileset (GROUNDS: grass, forest, dirt, sand, hill, mountain,
// shallow, sea), elev 0..1 (land height by rank, or depth for water), coast
// (land touching water) and biome (per act). Sea holds nothing and is never
// walked; it can be lit (seen) by rings and tower views. A shallow is a
// ford: it costs SHALLOW_COST bulbs to light by hand and SHALLOW_COST to
// wade, and it is what joins an island to the mainland. A mountain is land
// nobody walks: no content, no road, flares stop at it, at most
// MOUNTAIN_MAX of the land. Islands carry the best content.
//
// Light: a hex next to the lit area is lit for one bulb (reveal), a chain
// of them for their sum (pathToReveal / revealPath). Standing on a hex
// lights the ring around it for free (vision: one ring on lowland, two on a
// hill, applied by move). Tools (useTool): a flare lights a straight line
// from the player, a lantern the rings around any lit hex, a kite a patch
// anywhere within KITE_RANGE. A tower taken lights everything within
// TOWER_VIEW (towerView).
//
// The road: the guaranteed land route from the start to the boss is lit
// from the first moment (tile.road, M.road in walking order), so the boss
// can always be reached without spending a bulb; bulbs are for what lies
// off it. It meanders, passes a rest and a shop, never touches a tower and
// its tiles keep whatever content they rolled. walkPath() plans a
// click-to-travel walk over lit tiles for the game's auto-walk.
//
// Pure data + functions: no DOM, no global randomness (every roll comes from
// the rng handed to generate), and M is plain JSON so it saves as-is.
const MAP = (() => {
  const SQRT3 = Math.sqrt(3);
  // Axial neighbour directions, clockwise from east.
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const TYPES = ['empty', 'fight', 'elite', 'treasure', 'gem', 'ink', 'brush', 'event',
    'shop', 'rest', 'boss', 'start', 'forge', 'tower',
    // ARCADE: the mini-game cabinets (placed off the road after it is carved)
    'plinko', 'wheel', 'slots',
    // PETS (round 5): whack-a-mole, skee-ball and the pet shop, one of each per map
    'moles', 'skee', 'petshop'];
  const TERRAINS = ['land', 'shallow', 'sea'];
  // Ground types (the tileset). Land is one of the first six; water keeps
  // its terrain name. A mountain is terrain 'land' with ground 'mountain'
  // so old code that only knows the three terrains still loads it.
  const GROUNDS = ['grass', 'forest', 'dirt', 'sand', 'hill', 'mountain', 'shallow', 'sea'];
  const HILL_ELEV = 0.62;       // land at or above this is a hill (two rings of vision, the hill tile)
  const TOWER_ELEV = 0.5;       // a tower wants high ground
  const SAND_ELEV = 0.03;       // low coast is sand
  const MOUNTAIN_ELEV = 0.86;   // the highest land may turn to mountain...
  const MOUNTAIN_MAX = 0.08;    // ...up to this share of the land
  const MOUNTAIN_TARGET = 0.06;
  const FOREST_SHARE = 0.3, DIRT_SHARE = 0.15;   // of the flat land, by a second noise
  // Vision: rings lit for free around the hex the player stands on.
  const VISION = { low: 1, hill: 2 };
  // Lookout towers: 3 per map on hills, TOWER_GAP apart (and from the start
  // and the boss), each with a radius TOWER_VIEW view that must add
  // TOWER_VIEW_MIN hexes no other tower sees. At most one on an island.
  const TOWER_VIEW = 4, TOWER_GAP = 6, TOWER_VIEW_MIN = 30;
  const BIOMES = { 1: 'cellar', 2: 'foundry', 3: 'vault' };
  // Share of the placeable land tiles per type, and the hard minimums.
  // Bulb boxes sit at 10% of the land: the 16x22 world has long walks.
  const DIST = {
    fight: 0.28, empty: 0.16, gem: 0.10, ink: 0.10, event: 0.08, treasure: 0.04,
    brush: 0.04, shop: 0.04, rest: 0.05, forge: 0.03, elite: 0.03, tower: 0.035,
  };
  const MINS = { shop: 3, rest: 3, forge: 2, elite: 2, treasure: 2, brush: 2, ink: 4, tower: 2 };
  const MAXS = { tower: 3 };
  // Placement order: constrained types first so they always find a spot.
  // Towers go first of all (see placeTowers), off the main axis.
  const SPECIALS = ['elite', 'shop', 'rest', 'forge', 'treasure', 'brush', 'ink', 'event', 'gem'];
  // Types that read better spread out: avoid putting two side by side.
  const SPREAD = { shop: 1, rest: 1, forge: 1, elite: 1, treasure: 1 };
  // Landmarks: hidden tiles of these types are drawn as a dim silhouette in
  // the fog from the start, so the player can plan where to spend ink.
  const LANDMARKS = { shop: 1, rest: 1, forge: 1, elite: 1, treasure: 1, boss: 1, tower: 1, plinko: 1, wheel: 1, slots: 1, moles: 1, skee: 1, petshop: 1 };
  // Tower bonuses (rolled at generate, awarded after the tower fight on top
  // of the relic and the view). game.js applies them; the ids match its fx
  // kinds ('ink' is bulbs, 'brush' a tool).
  const TOWER_BONUS = ['ink', 'brush', 'claw', 'gold'];
  const TOWER_INK = 2, TOWER_GOLD = 60;
  const FALLBACK_UPGRADES = ['grabs', 'width', 'grip', 'speed', 'prongs', 'rubber', 'magnet'];
  const START_INK = 10;   // bulbs per act; game.js reads DATA.ECONOMY.startInk and passes it in
  // Bulbs a run can expect to find on one act's map along a sensible route
  // (start 10, a few boxes at 2, half the fights at 1, elites and towers at
  // 2): the number the balance pass should reason from.
  const INK_PER_ACT_HINT = 24;
  const DEFAULT_COLS = 16, DEFAULT_ROWS = 22;
  const HEX = 46;         // the game's fixed hex size in stage px (the camera scales it)
  const WATER = 0.28;     // target share of water (sea + shallow) hexes (lands near 0.30 after the islands)
  const SHALLOW_COST = 2; // bulbs to light a ford by hand, and again to wade it
  // The road runs ROAD_MEANDER[0]..[1] times the straight hex distance from
  // the start to the boss (bends are added until it does, on maps with the
  // rows to bend in). ROAD_TOLL keeps it off the heaviest content when a
  // route around exists; fights, events and shops on it are the run.
  const ROAD_MEANDER = [1.15, 1.6];
  const ROAD_TOLL = { elite: 12, tower: 12 };
  const FIT_MARGIN = 4;   // px kept free around the map by size()

  // The tools (DATA.TOOLS when loaded, this table otherwise). A flare
  // lights a straight line of FLARE_RANGE from the player and stops at
  // mountains and open water (a ford is lit and stops it too); a lantern
  // hung on any lit hex lights its ring and LANTERN_OUTER of the second
  // ring's land, chosen by the map seed; a kite flown over any dark hex
  // within KITE_RANGE of the player lights it and its ring.
  const TOOL_IDS = ['flare', 'lantern', 'kite'];
  const FLARE_RANGE = 5, KITE_RANGE = 6, LANTERN_OUTER = 0.5;
  const FALLBACK_TOOLS = {
    flare: { id: 'flare', name: 'Flare', icon: '*', kind: 'line', text: 'Lights 5 hexes in a straight line from where you stand.' },
    lantern: { id: 'lantern', name: 'Lantern', icon: 'o', kind: 'ring', text: 'Hang it on a lit hex: lights the ring around it and half of the next.' },
    kite: { id: 'kite', name: 'Kite', icon: '^', kind: 'patch', text: 'Fly it over any dark hex within 6: lights it and its ring.' },
  };
  // Brush ids from saves made before the tools all load as a lantern.
  const OLD_BRUSHES = { line3: 'lantern', splash: 'lantern', drip: 'lantern', comb: 'lantern' };

  function hashN(str) {
    if (typeof U !== 'undefined' && U.hashStr) return U.hashStr(str);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const key = (q, r) => q + ',' + r;
  const hexDist = (aq, ar, bq, br) => Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br));

  function tileAt(M, q, r) {
    return (M && M.tiles[key(q, r)]) || null;
  }

  function inBounds(M, q, r) {
    if (r < 0 || r >= M.rows) return false;
    const c = q + Math.floor(r / 2);
    return c >= 0 && c < M.cols;
  }

  // In-bounds axial neighbours as [[q, r], ...].
  function neighbors(M, q, r) {
    const out = [];
    for (const [dq, dr] of DIRS) {
      if (inBounds(M, q + dq, r + dr)) out.push([q + dq, r + dr]);
    }
    return out;
  }

  function isAdjacent(aq, ar, bq, br) {
    for (const [dq, dr] of DIRS) if (aq + dq === bq && ar + dr === br) return true;
    return false;
  }

  function isLandmark(tile) {
    return !!(tile && LANDMARKS[tile.type]);
  }
  // A tile of the lit start-to-boss road.
  function isRoad(tile) {
    return !!(tile && tile.road);
  }

  const isSea = (t) => !!t && t.terrain === 'sea';
  const isWater = (t) => !!t && (t.terrain === 'sea' || t.terrain === 'shallow');
  const isMountain = (t) => !!t && t.ground === 'mountain';
  // Walkable land: terrain land that is not a mountain.
  const isLand = (t) => !!t && (t.terrain || 'land') === 'land' && !isMountain(t);
  // Bulbs to light a tile by hand: 1 on land, SHALLOW_COST on a ford, never
  // for sea or a mountain (those are only ever lit by rings and views).
  function revealCost(t) {
    if (!t || isSea(t) || isMountain(t)) return Infinity;
    return t.terrain === 'shallow' ? SHALLOW_COST : 1;
  }
  // Bulbs to step onto a tile: free on land, SHALLOW_COST to wade a ford,
  // never for sea or a mountain.
  function moveCost(t) {
    if (!t || isSea(t) || isMountain(t)) return Infinity;
    return t.terrain === 'shallow' ? SHALLOW_COST : 0;
  }
  // Hex distance from the hill or lowland the player stands on that is lit
  // for free: two rings on a hill, one elsewhere (the start counts as lowland).
  function visionRadius(t) {
    if (!t || t.type === 'start') return VISION.low;
    return isLand(t) && (t.elev || 0) >= HILL_ELEV ? VISION.hill : VISION.low;
  }
  // Every in-bounds hex within `radius` of (q, r), the centre first.
  function disc(M, q, r, radius) {
    const out = [];
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
        if (inBounds(M, q + dq, r + dr)) out.push([q + dq, r + dr]);
      }
    }
    return out;
  }
  // Lights one tile of any terrain (sea included: it is seen, not charted).
  // Returns true when it was dark.
  function lightTile(M, t) {
    if (!t || t.revealed) return false;
    t.revealed = true;
    if (!isSea(t)) M.revealedCount++;
    return true;
  }
  // Lights everything within `radius` of (q, r); returns the tiles that were dark.
  function lightArea(M, q, r, radius) {
    const out = [];
    for (const [cq, cr] of disc(M, q, r, radius)) { const t = M.tiles[key(cq, cr)]; if (lightTile(M, t)) out.push(t); }
    return out;
  }
  // Terrain vision from (q, r): what standing there lights for free.
  function vision(M, q, r) {
    if (!inBounds(M, q, r)) return [];
    return lightArea(M, q, r, visionRadius(M.tiles[key(q, r)]));
  }
  // The view from a tower at (q, r): radius TOWER_VIEW, land, sea, all.
  function towerView(M, q, r) {
    if (!inBounds(M, q, r)) return [];
    return lightArea(M, q, r, TOWER_VIEW);
  }
  function pathCost(M, path) {
    let n = 0;
    for (const s of path || []) { const t = s && M.tiles[key(s[0], s[1])]; n += revealCost(t); }
    return n;
  }
  const biomeOf = (act) => BIOMES[act] || BIOMES[((Math.max(1, act | 0) - 1) % 3) + 1];

  // A lit tile the light may grow from (the boss only once visited).
  function isFoothold(t) {
    return !!t && t.revealed && (t.type !== 'boss' || t.visited);
  }

  // The boss tile is lit from the start but it is not a foothold: the light
  // must grow out from where the player has actually been, or the far side
  // of the map could be lit open from the boss's doorstep.
  function touchesRevealed(M, q, r) {
    return neighbors(M, q, r).some(([nq, nr]) => isFoothold(M.tiles[key(nq, nr)]));
  }

  // Cheapest chain of dark tiles from the lit area to (q, r), in lighting
  // order, ending on (q, r) itself: what "light the way" would reveal.
  // Multi-source Dijkstra (bucket queue, costs are 1 or SHALLOW_COST) from
  // every foothold through dark, non-boss tiles that can be lit by hand (no
  // sea, no mountains); pathCost() gives the bulbs. Empty when the target is
  // lit, out of bounds, sea, a mountain, the boss, already touching the lit
  // area (that is a plain reveal) or unreachable.
  function pathToReveal(M, q, r) {
    if (!inBounds(M, q, r)) return [];
    const goal = M.tiles[key(q, r)];
    if (goal.revealed || goal.type === 'boss' || revealCost(goal) === Infinity || touchesRevealed(M, q, r)) return [];
    const goalK = key(q, r);
    const dist = {}, parent = {};
    const buckets = [[]];
    for (const k in M.tiles) if (isFoothold(M.tiles[k])) { dist[k] = 0; parent[k] = null; buckets[0].push(k); }
    for (let d = 0; d < buckets.length; d++) {
      const b = buckets[d];
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const ck = b[i];
        if (dist[ck] !== d) continue;           // a stale entry, improved since
        if (ck === goalK) {
          const out = [];
          for (let at = ck; at && !isFoothold(M.tiles[at]); at = parent[at]) out.push([M.tiles[at].q, M.tiles[at].r]);
          return out.reverse();
        }
        const ct = M.tiles[ck];
        for (const [nq, nr] of neighbors(M, ct.q, ct.r)) {
          const k = key(nq, nr);
          const t = M.tiles[k];
          if (t.revealed || t.type === 'boss' || revealCost(t) === Infinity) continue;
          const nd = d + revealCost(t);
          if (dist[k] != null && dist[k] <= nd) continue;
          dist[k] = nd; parent[k] = ck;
          (buckets[nd] || (buckets[nd] = [])).push(k);
        }
      }
    }
    return [];
  }

  // Lights a whole path (as returned by pathToReveal) for pathCost() bulbs.
  // Refuses, spending nothing, when the bulbs are short or any step could
  // not be lit in order. Returns the lit tiles or null.
  function revealPath(M, path) {
    if (!Array.isArray(path) || !path.length) return null;
    const seen = {};
    for (const step of path) {
      if (!step || !inBounds(M, step[0], step[1])) return null;
      const k = key(step[0], step[1]);
      const t = M.tiles[k];
      if (t.revealed || t.type === 'boss' || revealCost(t) === Infinity || seen[k]) return null;
      const ok = touchesRevealed(M, t.q, t.r) || neighbors(M, t.q, t.r).some(([nq, nr]) => seen[key(nq, nr)]);
      if (!ok) return null;
      seen[k] = 1;
    }
    if (M.ink < pathCost(M, path)) return null;
    const out = [];
    for (const [pq, pr] of path) {
      const t = M.tiles[key(pq, pr)];
      t.revealed = true;
      M.ink -= revealCost(t);
      M.revealedCount++;
      out.push(t);
    }
    return out;
  }

  // The tool table: DATA.TOOLS (or its BRUSHES alias) when present, else the fallback.
  function toolTable() {
    if (typeof DATA !== 'undefined' && DATA) {
      const T = DATA.TOOLS || DATA.BRUSHES;
      if (T && Object.keys(T).length) return T;
    }
    return FALLBACK_TOOLS;
  }
  // Available tool ids.
  function toolIds() { return Object.keys(toolTable()); }
  // A tool id as it is today: old brush ids map to the lantern.
  function normalizeTool(id) { return OLD_BRUSHES[id] || id; }
  function toolKind(id) {
    const d = toolTable()[id] || FALLBACK_TOOLS[id];
    return (d && d.kind) || (FALLBACK_TOOLS[id] && FALLBACK_TOOLS[id].kind) || null;
  }
  // The axial direction (index into DIRS) in which (q, r) lies from `from`:
  // the nearest of the six by angle, or -1 for the same hex.
  function dirTo(M, from, q, r) {
    if (!from || (from.q === q && from.r === r)) return -1;
    const a = toPixel(from.q, from.r, 10), b = toPixel(q, r, 10);
    const vx = b.x - a.x, vy = b.y - a.y;
    let best = -1, bd = -Infinity;
    DIRS.forEach(([dq, dr], i) => {
      const p = toPixel(from.q + dq, from.r + dr, 10);
      const ux = p.x - a.x, uy = p.y - a.y;
      const d = (vx * ux + vy * uy) / Math.hypot(ux, uy);
      if (d > bd) { bd = d; best = i; }
    });
    return best;
  }
  // The hexes a flare fired from `from` (default pos) in direction `dir`
  // lights: up to FLARE_RANGE in a straight line, stopping at the map's
  // edge, a mountain or open water (neither is lit); a ford is lit and
  // stops it too.
  function flareCells(M, dir, from) {
    from = from || M.pos;
    if (!(dir >= 0 && dir < 6) || !from) return [];
    const [dq, dr] = DIRS[dir];
    const out = [];
    for (let i = 1; i <= FLARE_RANGE; i++) {
      const cq = from.q + dq * i, cr = from.r + dr * i;
      if (!inBounds(M, cq, cr)) break;
      const t = M.tiles[key(cq, cr)];
      if (isSea(t) || isMountain(t)) break;
      out.push([cq, cr]);
      if (t.terrain === 'shallow') break;
    }
    return out;
  }
  // The hexes a lantern hung on (q, r) lights: the ring of six, plus the
  // land hexes of the second ring that the map seed picks (about half).
  function lanternCells(M, q, r) {
    const out = [];
    for (const [cq, cr] of disc(M, q, r, 2)) {
      const d = hexDist(q, r, cq, cr);
      if (d === 0) continue;
      const t = M.tiles[key(cq, cr)];
      if (d === 1) { out.push([cq, cr]); continue; }
      if (!isLand(t) && !isMountain(t)) continue;
      if ((hashN('lantern:' + (M.seed || 0) + ':' + q + ',' + r + ':' + cq + ',' + cr) % 1000) / 1000 < LANTERN_OUTER) out.push([cq, cr]);
    }
    return out;
  }
  // The hexes a kite flown over (q, r) lights: the hex and its ring.
  function kiteCells(M, q, r) { return disc(M, q, r, 1); }
  // What using tool `id` on (q, r) would light ([] when it cannot be used
  // there). A flare ignores (q, r) when `dir` is given, else fires toward it.
  function toolCells(M, id, q, r, dir) {
    id = normalizeTool(id);
    const kind = toolKind(id);
    if (!M || !kind) return [];
    if (kind === 'line') {
      if (!(dir >= 0)) dir = dirTo(M, M.pos, q, r);
      return flareCells(M, dir);
    }
    if (!inBounds(M, q, r)) return [];
    const t = M.tiles[key(q, r)];
    if (kind === 'ring') return t.revealed ? lanternCells(M, q, r) : [];
    if (kind === 'patch') return (!t.revealed && !isSea(t) && M.pos && hexDist(M.pos.q, M.pos.r, q, r) <= KITE_RANGE) ? kiteCells(M, q, r) : [];
    return [];
  }
  // Index of a copy of the tool in M.brushes (old ids count), or -1.
  function toolIndex(M, id) {
    id = normalizeTool(id);
    for (let i = 0; i < (M.brushes || []).length; i++) if (normalizeTool(M.brushes[i]) === id) return i;
    return -1;
  }
  function canTool(M, id, q, r, dir) {
    if (!M || toolIndex(M, id) < 0) return false;
    return toolCells(M, id, q, r, dir).length > 0;
  }
  // Uses one copy of the tool: lights its cells (no bulbs spent) and takes
  // the copy. Returns the tiles that were dark, or null when it cannot be
  // used there.
  function useTool(M, id, q, r, dir) {
    if (!canTool(M, id, q, r, dir)) return null;
    const out = [];
    for (const [cq, cr] of toolCells(M, id, q, r, dir)) { const t = M.tiles[key(cq, cr)]; if (lightTile(M, t)) out.push(t); }
    M.brushes.splice(toolIndex(M, id), 1);
    return out;
  }

  // Least bulbs needed to walk from `from` to `to` (wading fords costs
  // SHALLOW_COST each, land is free), or -1 when there is no way. Default
  // walks lit tiles only; opts.any ignores the dark (used to prove the
  // boss is reachable at generate time), opts.land allows land only. The
  // boss tile is never passed *through*, only ended on, since stepping on it
  // starts the boss fight. Sea and mountains are never walked.
  function walkCost(M, from, to, opts) {
    opts = opts || {};
    if (!from || !to || !inBounds(M, from.q, from.r) || !inBounds(M, to.q, to.r)) return -1;
    const ok = (t) => moveCost(t) < Infinity && (opts.any || t.revealed) && (!opts.land || isLand(t));
    const goal = key(to.q, to.r);
    if (!ok(M.tiles[goal])) return -1;
    const startK = key(from.q, from.r);
    if (startK === goal) return 0;
    const dist = { [startK]: 0 };
    const buckets = [[startK]];
    for (let d = 0; d < buckets.length; d++) {
      const b = buckets[d];
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const ck = b[i];
        if (dist[ck] !== d) continue;
        const ct = M.tiles[ck];
        if (ck !== startK && ct.type === 'boss') continue;
        for (const [nq, nr] of neighbors(M, ct.q, ct.r)) {
          const k = key(nq, nr);
          const t = M.tiles[k];
          if (!ok(t)) continue;
          const nd = d + moveCost(t);
          if (dist[k] != null && dist[k] <= nd) continue;
          if (k === goal) return nd;
          dist[k] = nd;
          (buckets[nd] || (buckets[nd] = [])).push(k);
        }
      }
    }
    return -1;
  }

  // BFS-style reachability on top of walkCost. opts.ink caps the ink the
  // walk may spend on fords (used by the ink rescue).
  function pathExists(M, from, to, opts) {
    const c = walkCost(M, from, to, opts);
    if (c < 0) return false;
    return !(opts && opts.ink != null) || c <= opts.ink;
  }

  // The steps of an auto-walk from pos to a lit tile: [[q, r], ...] after
  // pos, ending on (q, r), or null when (q, r) is pos, hidden, sea, out of
  // bounds or cut off from pos by fog. Dijkstra over lit non-sea tiles,
  // never through the boss: cheapest by ink first (a ford is SHALLOW_COST),
  // then by steps, then skirting content that still resolves (a walk to a
  // far rest should not blunder into a fight on the way) and, last of all,
  // keeping to the road. The ink is not checked: a ford the player cannot
  // pay is where the walk stops.
  function walkPath(M, q, r) {
    if (!M || !M.pos || !inBounds(M, q, r)) return null;
    const goal = key(q, r);
    const gt = M.tiles[goal];
    if (!gt.revealed || moveCost(gt) === Infinity) return null;
    const startK = key(M.pos.q, M.pos.r);
    if (goal === startK) return null;
    const stepCost = (t) => 1000 * moveCost(t) + 8 +
      (t.type !== 'empty' && t.type !== 'start' && !t.visited && !t.done ? 2 : 0) + (t.road ? 0 : 1);
    const dist = { [startK]: 0 }, parent = { [startK]: null };
    const open = [startK];
    const closed = {};
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const ck = open.splice(bi, 1)[0];
      if (closed[ck]) continue;
      closed[ck] = 1;
      if (ck === goal) {
        const out = [];
        for (let at = ck; at && at !== startK; at = parent[at]) out.push([M.tiles[at].q, M.tiles[at].r]);
        return out.reverse();
      }
      const ct = M.tiles[ck];
      if (ck !== startK && ct.type === 'boss') continue;
      for (const [nq, nr] of neighbors(M, ct.q, ct.r)) {
        const k = key(nq, nr);
        const t = M.tiles[k];
        if (!t.revealed || moveCost(t) === Infinity || closed[k]) continue;
        const nd = dist[ck] + stepCost(t);
        if (dist[k] != null && dist[k] <= nd) continue;
        dist[k] = nd; parent[k] = ck; open.push(k);
      }
    }
    return null;
  }

  // Per-type counts for n placeable tiles: the bible's shares with random
  // rounding, the minimums enforced, fight/empty absorbing the remainder.
  function rollCounts(n, rng) {
    const counts = {};
    let used = 0;
    for (const t of ['tower'].concat(SPECIALS)) {
      const base = n * DIST[t];
      let c = Math.floor(base) + (rng() < base - Math.floor(base) ? 1 : 0);
      c = Math.max(c, MINS[t] || 0);
      if (MAXS[t]) c = Math.min(c, MAXS[t]);
      counts[t] = c;
      used += c;
    }
    // Only tiny maps can overflow; trim optional types, never below minimums.
    for (const t of ['gem', 'event', 'ink', 'treasure', 'brush', 'rest', 'shop', 'forge', 'tower']) {
      while (used > n && counts[t] > (MINS[t] || 0)) { counts[t]--; used--; }
    }
    const rest = Math.max(0, n - used);
    counts.fight = Math.round(rest * DIST.fight / (DIST.fight + DIST.empty));
    counts.empty = rest - counts.fight;
    return counts;
  }

  function diffOf(M, q, r) {
    const c = q + Math.floor(r / 2);
    return Math.round((c / Math.max(1, M.cols - 1)) * 100) / 100;
  }

  // Content rolls use their own rng stream so the layout is identical with
  // or without DATA loaded.
  function rollContent(M, t, crng, used) {
    const act = M.act;
    const content = { seed: Math.floor(crng() * 1e9) };
    const enc = (typeof DATA !== 'undefined' && DATA && DATA.ENCOUNTERS) ? DATA.ENCOUNTERS[act] : null;
    const pickEnc = (list) => (list && list.length ? crng.pick(list).slice() : null);
    switch (t.type) {
      case 'fight': case 'elite': case 'tower': {
        content.diff = diffOf(M, t.q, t.r);
        if (t.type !== 'fight') content.elite = true;
        if (t.type === 'tower') content.tower = { bonus: rollTowerBonus(crng) };
        if (enc) {
          const list = t.type === 'fight' ? enc.normal : (t.type === 'tower' && enc.tower && enc.tower.length ? enc.tower : enc.elite);
          // Harder fights later: bias the pick toward the back of the list.
          if (list && list.length && t.type === 'fight') {
            const i = U.clamp(Math.floor((content.diff * 0.7 + crng() * 0.5) * list.length), 0, list.length - 1);
            content.enc = list[i].slice();
          } else {
            const e = pickEnc(list);
            if (e) content.enc = e;
          }
        }
        break;
      }
      case 'boss':
        content.diff = 1;
        content.boss = true;
        if (enc) { const e = pickEnc(enc.boss); if (e) content.enc = e; }
        break;
      case 'treasure':
        content.gold = crng.int(20, 35) + 10 * (act - 1);
        content.relic = true;
        break;
      case 'gem':
        content.gold = crng.int(8, 16) + 4 * (act - 1);
        break;
      case 'ink':
        content.ink = (typeof DATA !== 'undefined' && DATA && DATA.ECONOMY && DATA.ECONOMY.inkTile) || (crng() < 0.35 ? 2 : 1);
        break;
      case 'brush':
        content.brush = crng.pick(toolIds());
        break;
      case 'event':
        if (typeof DATA !== 'undefined' && DATA && DATA.EVENTS) {
          const ids = Object.keys(DATA.EVENTS);
          // Avoid repeating an event on the same map while fresh ones remain.
          const fresh = ids.filter((id) => !used[id]);
          const id = fresh.length ? crng.pick(fresh) : (ids.length ? crng.pick(ids) : null);
          if (id) { content.event = id; used[id] = 1; }
        }
        break;
      default:
        break;
    }
    return content;
  }

  // The bonus a tower pays out on top of its relic and its view. Tool and
  // claw ids come from DATA when it is loaded, else from the fallback lists.
  function rollTowerBonus(crng) {
    const k = crng.pick(TOWER_BONUS);
    if (k === 'ink') return { k, n: TOWER_INK };
    if (k === 'gold') return { k, n: TOWER_GOLD };
    if (k === 'brush') return { k, id: crng.pick(toolIds()) };
    let ups = FALLBACK_UPGRADES;
    if (typeof DATA !== 'undefined' && DATA && DATA.CLAW_UPGRADES && Object.keys(DATA.CLAW_UPGRADES).length) ups = Object.keys(DATA.CLAW_UPGRADES);
    return { k, u: crng.pick(ups) };
  }

  // ------------------------------------------------------------ terrain
  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

  // Two octaves of seeded value noise sampled at every hex centre (in hex
  // widths, so odd rows really sit half a hex over). Roughly 0..1.
  function noiseMap(M, rng) {
    const octave = (spacing, w) => {
      const nw = Math.ceil((M.cols + 2) / spacing) + 3, nh = Math.ceil((M.rows + 2) / spacing) + 3;
      const lat = new Array(nw * nh);
      for (let i = 0; i < lat.length; i++) lat[i] = rng();
      return (x, y) => {
        const fx = x / spacing + 1, fy = y / spacing + 1;
        const x0 = Math.min(nw - 2, Math.max(0, Math.floor(fx))), y0 = Math.min(nh - 2, Math.max(0, Math.floor(fy)));
        const tx = smooth(Math.min(1, Math.max(0, fx - x0))), ty = smooth(Math.min(1, Math.max(0, fy - y0)));
        const v = (x, y) => lat[y * nw + x];
        return w * lerp(lerp(v(x0, y0), v(x0 + 1, y0), tx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx), ty);
      };
    };
    const o1 = octave(3.4, 0.62), o2 = octave(1.6, 0.38);
    const n = {};
    for (const k in M.tiles) { const t = M.tiles[k]; const x = t.q + t.r / 2, y = t.r * 0.866; n[k] = o1(x, y) + o2(x, y); }
    return n;
  }

  // Connected groups of land (through land only). The first group holds
  // the start (the mainland); the rest are islands, largest first.
  function landGroups(M) {
    const seen = {};
    const groups = [];
    const grow = (k0) => {
      const out = [k0];
      seen[k0] = 1;
      for (let i = 0; i < out.length; i++) {
        const t = M.tiles[out[i]];
        for (const [nq, nr] of neighbors(M, t.q, t.r)) {
          const k = key(nq, nr);
          if (!seen[k] && isLand(M.tiles[k])) { seen[k] = 1; out.push(k); }
        }
      }
      return out;
    };
    const sk = key(M.start.q, M.start.r);
    groups.push(isLand(M.tiles[sk]) ? grow(sk) : []);
    for (const k in M.tiles) if (!seen[k] && isLand(M.tiles[k])) groups.push(grow(k));
    const main = groups.shift();
    groups.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
    return [main].concat(groups);
  }
  // Island tile keys, largest island first (M.islands is a count; this recomputes the groups).
  function islandsOf(M) { return landGroups(M).slice(1); }

  // Shortest chain of tiles from any of `from` (keys) to a tile passing
  // `goal`, stepping only through tiles passing `via`. Returns the keys
  // strictly between, or null.
  function bridge(M, from, via, goal) {
    const parent = {};
    const queue = [];
    for (const k of from) { parent[k] = null; queue.push(k); }
    for (let i = 0; i < queue.length; i++) {
      const ck = queue[i];
      const ct = M.tiles[ck];
      for (const [nq, nr] of neighbors(M, ct.q, ct.r)) {
        const k = key(nq, nr);
        if (k in parent) continue;
        const t = M.tiles[k];
        if (goal(t)) {
          const out = [];
          for (let at = ck; at && parent[at] !== null; at = parent[at]) out.push(at);
          return out;
        }
        if (!via(t)) continue;
        parent[k] = ck;
        queue.push(k);
      }
    }
    return null;
  }

  // The terrain layer: noise -> sea level at the water percentile -> two
  // majority smoothing passes -> start/boss disks and a carved land route
  // -> islands trimmed or carved to the wanted count -> one ford (shallows)
  // per island -> elevation, coast flags, biome. Deterministic in rng.
  function buildTerrain(M, rng, water, wantIslands) {
    const keys = Object.keys(M.tiles);
    const T = M.tiles;
    const set = (k, terr) => { T[k].terrain = terr; };
    if (!(water > 0)) {
      for (const k of keys) { set(k, 'land'); T[k].elev = 0.35; }
    } else {
      const noise = noiseMap(M, rng);
      const sorted = keys.map((k) => noise[k]).sort((a, b) => a - b);
      const level = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * water))];
      for (const k of keys) set(k, noise[k] < level ? 'sea' : 'land');
      // Majority smoothing: kills lone puddles and lone rocks.
      for (let pass = 0; pass < 2; pass++) {
        const next = {};
        for (const k of keys) {
          const t = T[k];
          let sea = 0, land = 0;
          for (const [nq, nr] of neighbors(M, t.q, t.r)) { if (isSea(T[key(nq, nr)])) sea++; else land++; }
          next[k] = t.terrain === 'sea' ? (land >= 4 ? 'land' : 'sea') : (sea >= 4 ? 'sea' : 'land');
        }
        for (const k of keys) set(k, next[k]);
      }
      // Elevation from the noise: land above sea level, depth below it.
      for (const k of keys) {
        const n = noise[k];
        T[k].elev = n >= level ? Math.min(1, (n - level) / Math.max(0.05, 1 - level)) : Math.min(1, (level - n) / Math.max(0.05, level));
      }
    }
    // Protected land: the start and boss with their neighbours.
    const protectedK = {};
    for (const p of [M.start, M.boss]) {
      protectedK[key(p.q, p.r)] = 1;
      for (const [nq, nr] of neighbors(M, p.q, p.r)) protectedK[key(nq, nr)] = 1;
    }
    for (const k in protectedK) { if (!isLand(T[k])) { set(k, 'land'); T[k].elev = 0.1; } }
    // A guaranteed land route: cheapest start-to-boss walk that hugs land
    // and crosses water only where it is narrow, raised to land.
    {
      const sk = key(M.start.q, M.start.r), bk = key(M.boss.q, M.boss.r);
      const dist = { [sk]: 0 }, parent = { [sk]: null };
      const buckets = [[sk]];
      let found = false;
      for (let d = 0; d < buckets.length && !found; d++) {
        const b = buckets[d];
        if (!b) continue;
        for (let i = 0; i < b.length && !found; i++) {
          const ck = b[i];
          if (dist[ck] !== d) continue;
          if (ck === bk) { found = true; break; }
          const ct = T[ck];
          for (const [nq, nr] of neighbors(M, ct.q, ct.r)) {
            const k = key(nq, nr);
            const nd = d + (isLand(T[k]) ? 1 : 4);
            if (dist[k] != null && dist[k] <= nd) continue;
            dist[k] = nd; parent[k] = ck;
            (buckets[nd] || (buckets[nd] = [])).push(k);
          }
        }
      }
      for (let at = bk; at; at = parent[at]) {
        protectedK[at] = 1;
        if (!isLand(T[at])) { set(at, 'land'); T[at].elev = 0.08; }
      }
    }
    // Islands: drown the rocks, join the surplus, carve what is missing.
    const drown = () => {
      for (const g of landGroups(M).slice(1)) if (g.length < 3) for (const k of g) { set(k, 'sea'); T[k].elev = 0.2; }
    };
    drown();
    for (let guard = 0; guard < 24; guard++) {
      const groups = landGroups(M);
      const islands = groups.slice(1);
      if (islands.length === wantIslands) break;
      if (islands.length > wantIslands) {
        // Join the smallest island to the mainland through the shortest sea.
        const isle = islands[islands.length - 1];
        const mainK = {};
        for (const k of groups[0]) mainK[k] = 1;
        const path = bridge(M, isle, (t) => isSea(t), (t) => !!mainK[key(t.q, t.r)]);
        if (path) for (const k of path) { set(k, 'land'); T[k].elev = 0.12; }
        else for (const k of isle) set(k, 'sea');
        drown();
        continue;
      }
      // Carve: a 7-hex blob deep in the mainland with a one-hex moat around
      // it. Best spot = farthest from anything protected.
      const mainK = {};
      for (const k of groups[0]) mainK[k] = 1;
      let best = null, bestScore = -1;
      for (const k of groups[0]) {
        if (protectedK[k]) continue;
        const t = T[k];
        let ok = true;
        for (const [nq, nr] of neighbors(M, t.q, t.r)) { const nk = key(nq, nr); if (!mainK[nk] || protectedK[nk]) { ok = false; break; } }
        if (!ok) continue;
        let near = 99;
        for (const pk in protectedK) { const p = T[pk]; const d = hexDist(t.q, t.r, p.q, p.r); if (d < near) near = d; }
        if (near < 3) continue;
        const score = Math.min(near, 6) + rng() * 2;
        if (score > bestScore) { bestScore = score; best = t; }
      }
      if (!best) break;
      for (const k of keys) {
        const t = T[k];
        const d = hexDist(t.q, t.r, best.q, best.r);
        if (d === 2 && !protectedK[k]) { set(k, 'sea'); T[k].elev = 0.35; }
        else if (d <= 1) { set(k, 'land'); T[k].elev = Math.max(T[k].elev || 0, 0.45); }
      }
      drown();
    }
    // Fords: the shortest sea crossing from each island to the mainland (or,
    // failing that, through other islands) becomes shallows.
    const groups = landGroups(M);
    const mainK = {};
    for (const k of groups[0]) mainK[k] = 1;
    for (const isle of groups.slice(1)) {
      const toMain = (t) => !!mainK[key(t.q, t.r)];
      let path = bridge(M, isle, (t) => isSea(t) || t.terrain === 'shallow', toMain);
      if (!path) path = bridge(M, isle, (t) => !isLand(t) || !toMain(t), toMain);
      if (!path) continue;
      for (const k of path) if (isSea(T[k])) { set(k, 'shallow'); T[k].elev = 0; }
    }
    // Height by rank: the noise is bell shaped, so land elevation is
    // re-spread over 0..1 (squared, so hills stay the upper fifth) before
    // the mountains, hills and sand are read off it. Dry maps stay flat.
    if (water > 0) {
      const land = keys.filter((k) => isLand(T[k]));
      land.sort((a, b) => (T[a].elev - T[b].elev) || ((T[a].q + T[a].r * 0.37) - (T[b].q + T[b].r * 0.37)));
      land.forEach((k, i) => { const p = land.length > 1 ? i / (land.length - 1) : 0.5; T[k].elev = p * p; });
    }
    placeMountains(M, rng, protectedK, water > 0);
    // Coast flags, biome, rounding.
    for (const k of keys) {
      const t = T[k];
      t.coast = isLand(t) && neighbors(M, t.q, t.r).some(([nq, nr]) => isWater(T[key(nq, nr)]));
      t.elev = Math.round((t.elev || 0) * 100) / 100;
      t.biome = M.biome;
    }
    assignGrounds(M, rng);
    M.islands = groups.length - 1;
    let wet = 0;
    for (const k of keys) if (isWater(T[k])) wet++;
    M.water = Math.round((wet / keys.length) * 100) / 100;
  }

  // Mountains: the highest mainland hexes, never protected ground (the
  // start and boss disks, the carved route), never on an island, only
  // where the mainland stays in one piece without them, MOUNTAIN_TARGET of
  // the land (MOUNTAIN_MAX at most). Sets ground = 'mountain'.
  function placeMountains(M, rng, protectedK, wet) {
    const T = M.tiles;
    for (const k in T) delete T[k].ground;
    if (!wet) return;
    const groups = landGroups(M);
    const main = groups[0];
    const mainK = {};
    for (const k of main) mainK[k] = 1;
    let landN = 0;
    for (const k in T) if (isLand(T[k])) landN++;
    const want = Math.round(landN * MOUNTAIN_TARGET), cap = Math.floor(landN * MOUNTAIN_MAX);
    // Never a ford's landing (the fords are already laid): no mountain
    // beside a shallow.
    const cand = main.filter((k) => !protectedK[k] && T[k].elev >= MOUNTAIN_ELEV &&
      !neighbors(M, T[k].q, T[k].r).some(([nq, nr]) => T[key(nq, nr)].terrain === 'shallow'))
      .map((k) => ({ k, s: T[k].elev + rng() * 0.02 })).sort((a, b) => b.s - a.s).map((c) => c.k);
    const sk = key(M.start.q, M.start.r);
    let size = main.length, placed = 0;
    // The mainland minus the mountains so far stays connected from the start.
    const connected = () => {
      const seen = { [sk]: 1 };
      const q = [sk];
      for (let i = 0; i < q.length; i++) {
        const t = T[q[i]];
        for (const [nq, nr] of neighbors(M, t.q, t.r)) { const k = key(nq, nr); if (!seen[k] && mainK[k] && isLand(T[k])) { seen[k] = 1; q.push(k); } }
      }
      return q.length === size;
    };
    for (const k of cand) {
      if (placed >= Math.min(want, cap)) break;
      T[k].ground = 'mountain';
      size--;
      if (connected()) { placed++; continue; }
      delete T[k].ground;
      size++;
    }
  }

  // The ground under every tile: water keeps its terrain name, mountains
  // stay, hills sit at HILL_ELEV, low coast is sand, and the rest is grass,
  // forest or dirt by a second, softer noise (by rank, so every map has its
  // woods and its bare patches).
  function assignGrounds(M, rng) {
    const T = M.tiles;
    const veg = noiseMap(M, rng);
    const flat = [];
    for (const k in T) {
      const t = T[k];
      if (isWater(t)) { t.ground = t.terrain; continue; }
      if (isMountain(t)) continue;
      if (t.elev >= HILL_ELEV) { t.ground = 'hill'; continue; }
      if (t.coast && t.elev < SAND_ELEV) { t.ground = 'sand'; continue; }
      flat.push(k);
    }
    flat.sort((a, b) => (veg[a] - veg[b]) || (a < b ? -1 : 1));
    flat.forEach((k, i) => {
      const p = flat.length > 1 ? i / (flat.length - 1) : 0.5;
      T[k].ground = p >= 1 - FOREST_SHARE ? 'forest' : p < DIRT_SHARE ? 'dirt' : 'grass';
    });
  }

  // Island content: the best things live across the water. Largest island
  // first: a treasure, an elite (never beside start or boss), half the time
  // a shop. Spread rules are relaxed on islands, there is no room for them.
  // Towers are placed on their own (placeTowers) and may use an island too.
  function placeIslandContent(M, islands, counts, rng, eliteOk) {
    islands.forEach((isle) => {
      const cells = rng.shuffle(isle).filter((k) => M.tiles[k].type === 'empty');
      const give = (type) => {
        const k = cells.shift();
        if (!k) return false;
        M.tiles[k].type = type;
        counts[type]--;
        return true;
      };
      if (counts.treasure > 0) give('treasure');
      const ek = cells.find((k) => eliteOk(M.tiles[k].q, M.tiles[k].r));
      if (ek && counts.elite > 0) { cells.splice(cells.indexOf(ek), 1); M.tiles[ek].type = 'elite'; counts.elite--; }
      if (counts.shop > 0 && rng() < 0.5) give('shop');
    });
  }

  // Lookout towers: a greedy farthest-first pick over empty land hexes on
  // high ground (elev >= TOWER_ELEV) at least TOWER_GAP from each other,
  // the start and the boss, each maximising the hexes its TOWER_VIEW view
  // would light that no earlier tower's view (nor the start's ring, nor the
  // boss) lights, and adding at least TOWER_VIEW_MIN of them; at most one
  // tower stands on an island. Maps too small for those rules relax them
  // in steps (a closer gap, then any land that is not adjacent). Returns
  // the cells taken; throws when even the minimum will not fit.
  function placeTowers(M, n, rng) {
    const T = M.tiles;
    const placed = [];
    const isleOf = {};
    islandsOf(M).forEach((isle, i) => { for (const k of isle) isleOf[k] = i + 1; });
    let islandUsed = false;
    const covered = {};
    covered[key(M.boss.q, M.boss.r)] = 1;
    for (const [q, r] of disc(M, M.start.q, M.start.r, VISION.low)) covered[key(q, r)] = 1;
    const gain = (t) => { let g = 0; for (const [q, r] of disc(M, t.q, t.r, TOWER_VIEW)) if (!covered[key(q, r)]) g++; return g; };
    // The road never touches a tower, so a tower and its ring must leave
    // the mainland joined from the start to the boss (with the earlier
    // towers' rings barred too).
    const barred = {};
    const sk = key(M.start.q, M.start.r), bk = key(M.boss.q, M.boss.r);
    // ...and (until the last resort) must not push the shortest land walk
    // past the road's ceiling, or more than a step past what it already is.
    const straight = Math.max(1, hexDist(M.start.q, M.start.r, M.boss.q, M.boss.r));
    const shortest = (bar) => {
      const seen = { [sk]: 0 };
      const queue = [sk];
      for (let i = 0; i < queue.length; i++) {
        if (queue[i] === bk) return seen[bk];
        const c = T[queue[i]];
        for (const [nq, nr] of neighbors(M, c.q, c.r)) { const k = key(nq, nr); if (seen[k] == null && !bar[k] && isLand(T[k])) { seen[k] = seen[queue[i]] + 1; queue.push(k); } }
      }
      return Infinity;
    };
    const limit = Math.max(shortest({}) + 1, ROAD_MEANDER[1] * straight - 1);
    const roadStillFits = (t, anyLength) => {
      const bar = Object.assign({}, barred);
      for (const [q, r] of disc(M, t.q, t.r, 1)) bar[key(q, r)] = 1;
      delete bar[sk]; delete bar[bk];
      const d = shortest(bar);
      return anyLength ? d < Infinity : d <= limit;
    };
    // gap: between towers; ends: from the start and the boss.
    const passes = [
      { gap: TOWER_GAP, ends: TOWER_GAP, min: TOWER_VIEW_MIN, elev: TOWER_ELEV },
      { gap: TOWER_GAP, ends: Math.max(2, TOWER_GAP - 2), min: TOWER_VIEW_MIN, elev: TOWER_ELEV },
      { gap: Math.max(2, Math.floor(TOWER_GAP / 2)), ends: Math.max(2, Math.floor(TOWER_GAP / 2)), min: Math.floor(TOWER_VIEW_MIN / 2), elev: TOWER_ELEV },
      { gap: 2, ends: 2, min: 0, elev: 0, anyLength: true },
    ];
    for (const P of passes) {
      while (placed.length < n) {
        let best = null, bs = -1;
        for (const k in T) {
          const t = T[k];
          if (t.type !== 'empty' || !isLand(t) || (t.elev || 0) < P.elev) continue;
          if (hexDist(t.q, t.r, M.start.q, M.start.r) < P.ends || hexDist(t.q, t.r, M.boss.q, M.boss.r) < P.ends) continue;
          if (placed.some(([pq, pr]) => hexDist(pq, pr, t.q, t.r) < P.gap)) continue;
          if (isleOf[k] && islandUsed) continue;
          const g = gain(t);
          if (g < P.min) continue;
          const s = g + rng() * 0.5;
          if (s > bs && roadStillFits(t, P.anyLength)) { bs = s; best = t; }
        }
        if (!best) break;
        best.type = 'tower';
        placed.push([best.q, best.r]);
        if (isleOf[key(best.q, best.r)]) islandUsed = true;
        else for (const [q, r] of disc(M, best.q, best.r, 1)) barred[key(q, r)] = 1;
        for (const [q, r] of disc(M, best.q, best.r, TOWER_VIEW)) covered[key(q, r)] = 1;
      }
      if (placed.length >= n) break;
    }
    if (placed.length < Math.min(n, MINS.tower)) throw new Error('MAP.generate: could not place tower');
    return placed;
  }

  // ------------------------------------------------------------ the road
  // Cheapest land walk from fromK to any key in `goals` under `weight` (a
  // per-tile cost), never through the boss unless it is a goal. Returns the
  // keys after fromK up to the goal ([] when fromK is a goal), or null.
  function landRoute(M, fromK, goals, weight) {
    const dist = { [fromK]: 0 }, parent = { [fromK]: null };
    const open = [fromK];
    const closed = {};
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const ck = open.splice(bi, 1)[0];
      if (closed[ck]) continue;
      closed[ck] = 1;
      if (goals[ck]) {
        const out = [];
        for (let at = ck; at && at !== fromK; at = parent[at]) out.push(at);
        return out.reverse();
      }
      const ct = M.tiles[ck];
      if (ct.type === 'boss' && ck !== fromK) continue;
      for (const [nq, nr] of neighbors(M, ct.q, ct.r)) {
        const k = key(nq, nr);
        const t = M.tiles[k];
        if (!isLand(t) || closed[k]) continue;
        if (t.type === 'boss' && !goals[k]) continue;
        const nd = dist[ck] + weight(t);
        if (!(nd < Infinity) || (dist[k] != null && dist[k] <= nd)) continue;
        dist[k] = nd; parent[k] = ck; open.push(k);
      }
    }
    return null;
  }

  // The road: a land-only route from the start to the boss over the
  // mainland, routed past the rest and the shop with the least detour
  // (within one hex of each), with bends added off the axis until it runs
  // ROAD_MEANDER times the straight distance. A seeded wobble per tile
  // keeps it from running dead straight. Sets tile.road and tile.revealed
  // on its tiles and M.road = [[q, r], ...] from the start to the boss.
  // Deterministic in rng. Returns M.road (null only if the boss is cut off
  // from the mainland, which buildTerrain prevents).
  function carveRoad(M, rng) {
    const T = M.tiles;
    const sk = key(M.start.q, M.start.r), bk = key(M.boss.q, M.boss.r);
    const main = {};
    for (const k of landGroups(M)[0]) main[k] = 1;
    if (!main[bk]) return null;
    const straight = Math.max(1, hexDist(M.start.q, M.start.r, M.boss.q, M.boss.r));
    const mid = M.start.r;
    const colOf = (t) => t.q + Math.floor(t.r / 2);
    const wob = {};
    for (const k in T) wob[k] = rng() * 6;
    // Towers and their doorsteps are barred (the road never touches a
    // tower); when that walls the boss in, they are merely dear.
    const towerK = {};
    for (const k in T) if (T[k].type === 'tower') { towerK[k] = 1; for (const [nq, nr] of neighbors(M, T[k].q, T[k].r)) towerK[key(nq, nr)] = 1; }
    delete towerK[sk]; delete towerK[bk];
    let barTowers = true;
    const weight = (t) => 10 + wob[key(t.q, t.r)] + (ROAD_TOLL[t.type] || 0) + (towerK[key(t.q, t.r)] ? (barTowers ? Infinity : ROAD_TOLL.tower) : 0);
    // Mainland tiles of a type by detour (start -> tile -> boss minus the
    // straight line), a little luck mixed in.
    const candidates = (type) => {
      const out = [];
      for (const k in main) {
        const t = T[k];
        if (t.type !== type) continue;
        out.push({ t, d: hexDist(M.start.q, M.start.r, t.q, t.r) + hexDist(t.q, t.r, M.boss.q, M.boss.r) - straight + rng() * 1.5 });
      }
      return out.sort((a, b) => a.d - b.d).map((c) => c.t);
    };
    // Goal set "within one hex of t" on the mainland, never the boss itself.
    const near = (t) => {
      const g = {};
      g[key(t.q, t.r)] = 1;
      for (const [nq, nr] of neighbors(M, t.q, t.r)) { const k = key(nq, nr); if (main[k] && k !== bk) g[k] = 1; }
      delete g[bk];
      return g;
    };
    // Nearest mainland tile to offset column c, row r (never the start or
    // boss): the row offset matters most, a bend is there to leave the axis.
    const bendAt = (c, r) => {
      let best = null, bd = Infinity;
      for (const k in main) {
        if (k === sk || k === bk) continue;
        const t = T[k];
        const d = Math.abs(colOf(t) - c) + Math.abs(t.r - r) * 2 + rng() * 0.01;
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    };
    const anchors = [];
    // Route start -> anchors (by column) -> boss. Tiles already on the road
    // are barred so the road never crosses itself; when that walls a
    // segment in (a stop in a corner) they are merely dear, and the loop
    // that leaves is cut out.
    const route = () => {
      const wps = anchors.slice().sort((a, b) => a.c - b.c).map((a) => a.goal).concat([{ [bk]: 1 }]);
      let at = sk;
      const keys = [sk];
      const used = { [sk]: 1 };
      const w = (t) => weight(t) + (used[key(t.q, t.r)] ? 40 : 0);
      const wBar = (t) => used[key(t.q, t.r)] ? Infinity : weight(t);
      for (const g of wps) {
        const seg = landRoute(M, at, g, wBar) || landRoute(M, at, g, w);
        if (!seg) return null;
        for (const k of seg) { keys.push(k); used[k] = 1; }
        if (seg.length) at = seg[seg.length - 1];
      }
      const idx = {};
      const out = [];
      for (const k of keys) {
        if (idx[k] != null) { while (out.length > idx[k] + 1) delete idx[out.pop()]; continue; }
        idx[k] = out.length; out.push(k);
      }
      return out[out.length - 1] === bk ? out : null;
    };
    const hits = (road, goal) => road.some((k) => goal[k]);
    const ratio = (road) => (road.length - 1) / straight;
    const err = (road) => { const x = ratio(road); return x < ROAD_MEANDER[0] ? ROAD_MEANDER[0] - x : x > ROAD_MEANDER[1] ? x - ROAD_MEANDER[1] : 0; };
    // The stops: a rest and a shop among the three of each with the least
    // detour, in the pairing the road really passes both of and stays
    // under the ceiling with (the water, the mountains and the tower rings
    // can wall a stop off); else the rest alone, else the shop alone.
    const pickStops = () => {
      const rests = [null].concat(candidates('rest').slice(0, 3)), shops = [null].concat(candidates('shop').slice(0, 3));
      let bestScore = -1, bestAnchors = [];
      for (const rt of rests) {
        for (const sh of shops) {
          anchors.length = 0;
          if (rt) anchors.push({ c: colOf(rt), goal: near(rt) });
          if (sh) anchors.push({ c: colOf(sh), goal: near(sh) });
          const road = route();
          if (!road || !anchors.every((a) => hits(road, a.goal))) continue;
          const under = ratio(road) <= ROAD_MEANDER[1];
          const score = (under ? 100 : 0) + (rt ? 10 : 0) + (sh ? 5 : 0) - (under ? 0 : err(road));
          if (score > bestScore) { bestScore = score; bestAnchors = anchors.slice(); }
        }
      }
      anchors.length = 0;
      for (const a of bestAnchors) anchors.push(a);
    };
    pickStops();
    let best = route();
    if (!best) { barTowers = false; pickStops(); best = route(); }
    // Too long already (the stops sit far off a route the water, the
    // mountains and the towers bend anyway): drop the stop whose loss
    // helps most, again while that helps.
    for (let guard = 0; best && anchors.length && ratio(best) > ROAD_MEANDER[1] && guard < 4; guard++) {
      let bi = -1, be = err(best), broad = null;
      for (let i = anchors.length - 1; i >= 0; i--) {
        const a = anchors.splice(i, 1)[0];
        const road = route();
        anchors.splice(i, 0, a);
        if (road && err(road) < be) { be = err(road); bi = i; broad = road; }
      }
      if (bi < 0) break;
      anchors.splice(bi, 1);
      best = broad;
    }
    // Too straight: bend into the widest column gap, first one side of the
    // axis then the other, reaching further each round. A bend that makes
    // the road too long, or changes nothing, is dropped.
    let side = rng() < 0.5 ? 1 : -1;
    for (let reach = 2; best && ratio(best) < ROAD_MEANDER[0] && reach <= 5; reach++) {
      for (let flip = 0; flip < 2 && ratio(best) < ROAD_MEANDER[0]; flip++) {
        const cols = [0].concat(anchors.map((a) => a.c), [M.cols - 1]).sort((a, b) => a - b);
        let gi = 0;
        for (let i = 1; i < cols.length; i++) if (cols[i] - cols[i - 1] > cols[gi + 1] - cols[gi]) gi = i - 1;
        const c = Math.round((cols[gi] + cols[gi + 1]) / 2);
        const r = Math.max(0, Math.min(M.rows - 1, mid + side * reach));
        side = -side;
        const b = bendAt(c, r);
        if (!b) continue;
        anchors.push({ c: colOf(b), goal: near(b) });
        const road = route();
        if (!road || road.length <= best.length || ratio(road) > ROAD_MEANDER[1]) { anchors.pop(); continue; }
        best = road;
      }
    }
    if (!best) { anchors.length = 0; best = route(); }
    if (!best) return null;
    M.road = best.map((k) => [T[k].q, T[k].r]);
    for (const k of best) { T[k].road = true; T[k].revealed = true; }
    return M.road;
  }

  // MAP.generate({act, rng, cols=16, rows=22, ink=10, brushes=[], water=0.30, islands}) -> M.
  // cols is clamped to >= 9 and rows to >= 3 so the minimums always fit.
  // water is the share of water hexes (0 = an all-land map); islands the
  // number wanted (default 2..4 on big maps, 1 on small ones, 0 when dry).
  // ink is the bulbs, brushes the tools (the fields keep their old names).
  function generate(opts) {
    opts = opts || {};
    const rng = opts.rng || U.rng(1);
    const cols = Math.max(9, Math.floor(opts.cols || DEFAULT_COLS));
    const rows = Math.max(3, Math.floor(opts.rows || DEFAULT_ROWS));
    const act = opts.act || 1;
    const seed = Math.floor(rng() * 4294967296);
    const crng = U.rng(Math.floor(rng() * 4294967296));
    const midR = Math.floor(rows / 2);
    const start = { q: -Math.floor(midR / 2), r: midR };
    const boss = { q: cols - 1 - Math.floor(midR / 2), r: midR };
    // Tiny maps (the clamped 9x3 floor) stay dry: 27 tiles cannot hold the
    // minimums and a third of water.
    const water = cols * rows < 60 ? 0 : (opts.water != null ? opts.water : WATER);
    const M = {
      act, biome: biomeOf(act), cols, rows, seed, tiles: {}, start, boss, pos: { q: start.q, r: start.r },
      ink: opts.ink != null ? opts.ink : START_INK,
      brushes: (opts.brushes || []).map(normalizeTool), revealedCount: 0, islands: 0, water: 0, road: [],
    };
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const q = c - Math.floor(r / 2);
        M.tiles[key(q, r)] = { q, r, type: 'empty', terrain: 'land', ground: 'grass', elev: 0, coast: false, biome: M.biome, revealed: false, visited: false, road: false, content: {} };
        cells.push([q, r]);
      }
    }
    const n = cols * rows;
    const wantIslands = opts.islands != null ? opts.islands : (!(water > 0) ? 0 : n >= 200 ? rng.int(2, 4) : n >= 60 ? 1 : 0);
    buildTerrain(M, rng, water, wantIslands);
    M.tiles[key(start.q, start.r)].type = 'start';
    M.tiles[key(boss.q, boss.r)].type = 'boss';

    const free = cells.filter(([q, r]) => { const t = M.tiles[key(q, r)]; return t.type === 'empty' && isLand(t); });
    const counts = rollCounts(free.length, rng);
    const eliteOk = (q, r) => !isAdjacent(q, r, start.q, start.r) && !isAdjacent(q, r, boss.q, boss.r);
    const islands = islandsOf(M);
    placeTowers(M, counts.tower, rng);
    placeIslandContent(M, islands, counts, rng, eliteOk);
    const nearTower = (q, r) => neighbors(M, q, r).some(([nq, nr]) => M.tiles[key(nq, nr)].type === 'tower');
    let pool = rng.shuffle(free.filter(([q, r]) => M.tiles[key(q, r)].type === 'empty'));
    const take = (type, n, allowed) => {
      // First pass honours the spread rule and keeps specials off the
      // towers' doorsteps, second pass fills whatever is left.
      for (let pass = 0; pass < 2 && n > 0; pass++) {
        const keep = [];
        for (const cell of pool) {
          const [q, r] = cell;
          if (n > 0 && allowed(q, r) && (pass === 1 || (!nearTower(q, r) && (!SPREAD[type] ||
            !neighbors(M, q, r).some(([nq, nr]) => M.tiles[key(nq, nr)].type === type))))) {
            M.tiles[key(q, r)].type = type;
            n--;
          } else keep.push(cell);
        }
        pool = keep;
      }
      if (n > 0) throw new Error('MAP.generate: could not place ' + type);
    };
    for (const t of SPECIALS) take(t, Math.max(0, counts[t]), t === 'elite' ? eliteOk : () => true);
    take('fight', counts.fight, () => true);
    // Anything left stays 'empty'.

    const usedEvents = {};
    for (const [q, r] of cells) {
      const t = M.tiles[key(q, r)];
      t.content = isLand(t) ? rollContent(M, t, crng, usedEvents) : {};
      t.known = isLandmark(t);
    }

    // Light: the road (start to boss), the start's vision (one ring, it
    // counts as lowland) and the boss are lit; the start is visited.
    if (!carveRoad(M, rng)) throw new Error('MAP.generate: boss unreachable by land');
    const st = M.tiles[key(start.q, start.r)];
    st.revealed = true; st.visited = true;
    vision(M, start.q, start.r);
    M.tiles[key(boss.q, boss.r)].revealed = true;
    placeArcade(M);   // ARCADE: mini-game cabinets off the road, roaming monsters
    M.revealedCount = countRevealed(M);

    if (!pathExists(M, start, boss, { any: true, land: true })) throw new Error('MAP.generate: boss unreachable by land');
    return M;
  }

  // ================================================================ ARCADE
  /* Arcade cabinets and roaming monsters (DESIGN.md "Arcade"). Placed after
     the road is carved, on their own rng stream drawn from M.seed, so the
     terrain, the content rolls and the road of every seed stay exactly what
     they were. A cabinet (plinko, wheel, slots) takes an empty land hex at
     least ARC_ROAD_GAP off the road (a detour), ARC_GAP from the others,
     never on a tower's doorstep; it is a landmark (its silhouette shows in
     the dark). Monsters (M.roam) stand on empty mainland hexes away from
     the start and the boss, asleep until their hex is lit and the player
     comes within ROAM_SIGHT; awake, each takes one step toward the player
     every time the player walks (roamStep), over lit empty or cleared land
     only, never onto the start or the boss. They never block anything: a
     walk onto one (or one onto the player) is a normal fight. */
  const ARC_GAMES = ['plinko', 'wheel', 'slots'];
  const ARC_COUNT = [2, 3];
  const ARC_ROAD_GAP = 2, ARC_GAP = 5;
  const ROAM_N = { 1: 3, 2: 4, 3: 5 };
  const ROAM_SIGHT = 4, ROAM_START = 5, ROAM_BOSS = 3, ROAM_GAP = 4;

  function isArcade(t) { return !!t && (ARC_GAMES.indexOf(t.type) >= 0 || ARC_R5.indexOf(t.type) >= 0); }

  // What a cabinet holds: plays (plinko tokens, wheel spins, free slot
  // pulls) and a seed; the game keeps its live session in content.arc.
  function arcContent(M, t, g, rng) {
    const a = rng(), b = rng();
    const tokens = g === 'plinko' ? 1 + (a < 0.6 ? 1 : 0) + (b < 0.25 ? 1 : 0) : 1 + (a < (g === 'wheel' ? 0.35 : 0.3) ? 1 : 0);
    return { seed: Math.floor(rng() * 1e9), diff: diffOf(M, t.q, t.r), tokens, game: g };
  }

  function placeArcade(M) {
    const rng = U.rng((((M.seed >>> 0) ^ 0x5eed7a3c) >>> 0) || 1);
    const T = M.tiles;
    const road = M.road || [];
    const free = [];
    for (const k in T) {
      const t = T[k];
      if (t.type !== 'empty' || !isLand(t) || t.road) continue;
      let d = Infinity;
      for (const s of road) { const x = hexDist(t.q, t.r, s[0], s[1]); if (x < d) d = x; }
      const tower = neighbors(M, t.q, t.r).some(([q, r]) => T[key(q, r)].type === 'tower');
      if (!tower && hexDist(t.q, t.r, M.start.q, M.start.r) >= 3 && hexDist(t.q, t.r, M.boss.q, M.boss.r) >= 2) free.push({ t, d });
    }
    const n = rng() < 0.5 ? ARC_COUNT[0] : ARC_COUNT[1];
    const games = rng.shuffle(ARC_GAMES.slice()).slice(0, n);
    const placed = [];
    // Relax in steps on small maps: nearer the road, closer together.
    const passes = [[ARC_ROAD_GAP, ARC_GAP], [ARC_ROAD_GAP, 3], [1, 3], [1, 2]];
    for (const g of games) {
      let pick = null;
      for (const [rg, gap] of passes) {
        const cand = free.filter((f) => f.t.type === 'empty' && f.d >= rg && placed.every((p) => hexDist(p.q, p.r, f.t.q, f.t.r) >= gap));
        if (cand.length) { pick = rng.pick(cand).t; break; }
      }
      if (!pick) break;
      pick.type = g;
      pick.known = true;
      pick.content = arcContent(M, pick, g, rng);
      placed.push(pick);
    }
    placeRoamers(M, rng);
    placeR5(M, placed);   // PETS (round 5): whack-a-mole, skee-ball, the pet shop
    return placed;
  }

  /* Round 5 (DESIGN.md "Pets"): one whack-a-mole, one skee-ball and one pet
     shop per map, by the cabinets' own rules (an empty land hex off the road,
     ARC_GAP from the other cabinets, 3 from the start, 2 from the boss, never
     on a tower's doorstep or a monster's hex, relaxed in steps on small maps).
     Their own rng stream from M.seed and placed after everything else, so
     every older roll (terrain, content, road, cabinets, monsters) is
     unchanged. The pet shop leans toward the start (the nearest third of its
     spots): your first buddy should not wait for the boss. */
  const ARC_R5 = ['moles', 'skee'];
  const PET_TILE = 'petshop';
  function placeR5(M, placed) {
    const rng = U.rng((((M.seed >>> 0) ^ 0x9e7a5eed) >>> 0) || 3);
    const T = M.tiles, road = M.road || [];
    const roam = {};
    for (const m of M.roam || []) roam[key(m.q, m.r)] = 1;
    const free = [];
    for (const k in T) {
      const t = T[k];
      if (t.type !== 'empty' || !isLand(t) || t.road || roam[k]) continue;
      let d = Infinity;
      for (const s of road) { const x = hexDist(t.q, t.r, s[0], s[1]); if (x < d) d = x; }
      const tower = neighbors(M, t.q, t.r).some(([q, r]) => T[key(q, r)].type === 'tower');
      if (!tower && hexDist(t.q, t.r, M.start.q, M.start.r) >= 3 && hexDist(t.q, t.r, M.boss.q, M.boss.r) >= 2) free.push({ t, d, s: hexDist(t.q, t.r, M.start.q, M.start.r) });
    }
    const all = placed.slice(), out = [];
    const passes = [[ARC_ROAD_GAP, ARC_GAP], [ARC_ROAD_GAP, 3], [1, 3], [1, 2], [1, 1]];
    for (const g of [PET_TILE].concat(ARC_R5)) {
      let pick = null;
      for (const [rg, gap] of passes) {
        let cand = free.filter((f) => f.t.type === 'empty' && f.d >= rg && all.every((p) => hexDist(p.q, p.r, f.t.q, f.t.r) >= gap));
        if (!cand.length) continue;
        if (g === PET_TILE) { cand = cand.slice().sort((a, b) => a.s - b.s || a.t.q - b.t.q || a.t.r - b.t.r); cand = cand.slice(0, Math.max(1, Math.ceil(cand.length / 3))); }
        pick = rng.pick(cand).t;
        break;
      }
      if (!pick) continue;
      pick.type = g;
      pick.known = true;
      const a = rng(), seed = Math.floor(rng() * 1e9);
      pick.content = g === PET_TILE ? { seed, diff: diffOf(M, pick.q, pick.r), game: g }
        : { seed, diff: diffOf(M, pick.q, pick.r), tokens: 1 + (a < 0.3 ? 1 : 0), game: g };
      all.push(pick); out.push(pick);
    }
    return out;
  }

  // The fight a monster starts: a normal encounter by its column (like a
  // fight tile). The rng is drawn either way so the positions never depend
  // on DATA being loaded.
  function roamEnc(M, t, rng) {
    const u = rng();
    const enc = (typeof DATA !== 'undefined' && DATA && DATA.ENCOUNTERS) ? DATA.ENCOUNTERS[M.act] : null;
    const list = enc && enc.normal;
    if (!list || !list.length) return null;
    const i = U.clamp(Math.floor((diffOf(M, t.q, t.r) * 0.7 + u * 0.5) * list.length), 0, list.length - 1);
    return list[i].slice();
  }

  function placeRoamers(M, rng) {
    const want = ROAM_N[M.act] || 3;
    const main = {};
    for (const k of landGroups(M)[0] || []) main[k] = 1;
    const keys = [];
    for (const k in M.tiles) {
      const t = M.tiles[k];
      if (main[k] && t.type === 'empty' && isLand(t) && hexDist(t.q, t.r, M.start.q, M.start.r) >= ROAM_START && hexDist(t.q, t.r, M.boss.q, M.boss.r) >= ROAM_BOSS) keys.push(k);
    }
    M.roam = [];
    for (const k of rng.shuffle(keys)) {
      if (M.roam.length >= want) break;
      const t = M.tiles[k];
      if (M.roam.some((m) => hexDist(m.q, m.r, t.q, t.r) < ROAM_GAP)) continue;
      M.roam.push({ id: 'm' + M.roam.length, q: t.q, r: t.r, awake: false, enc: roamEnc(M, t, rng) });
    }
    return M.roam;
  }

  function roamAt(M, q, r) {
    for (const m of (M && M.roam) || []) if (m.q === q && m.r === r) return m;
    return null;
  }
  // Where a monster may stand: lit land, not the start or the boss; empty,
  // cleared, or a plain pickup / fight / event it prowls over (it takes
  // nothing). Landmarks (shops, rests, forges, towers, elites, treasure,
  // the arcade cabinets) stay off limits until cleared.
  const ROAM_OVER = { empty: 1, fight: 1, gem: 1, ink: 1, brush: 1, event: 1 };
  function roamOk(t) {
    return !!t && !!t.revealed && isLand(t) && t.type !== 'boss' && t.type !== 'start' && (!!ROAM_OVER[t.type] || !!t.done);
  }
  // A monster may step onto the player only on plain land (not the start, the boss or a ford).
  function roamAmbushOk(t) { return !!t && isLand(t) && t.type !== 'boss' && t.type !== 'start'; }
  // Hops from the player over the hexes a monster may walk (a BFS).
  function roamDist(M) {
    const d = {};
    const P = M.pos;
    d[key(P.q, P.r)] = 0;
    const Q = [[P.q, P.r]];
    for (let i = 0; i < Q.length; i++) {
      const [q, r] = Q[i], dd = d[key(q, r)];
      for (const [nq, nr] of neighbors(M, q, r)) {
        const k = key(nq, nr);
        if (d[k] != null || !roamOk(M.tiles[k])) continue;
        d[k] = dd + 1;
        Q.push([nq, nr]);
      }
    }
    return d;
  }
  // The hex monster m steps to next: the player's own when adjacent (an
  // ambush, unless hold or the player's hex forbids it), else the neighbour
  // fewest hops from the player (ties in DIRS order), else null.
  function roamNext(M, m, dist, occ, hold) {
    dist = dist || roamDist(M);
    const P = M.pos;
    const here = dist[key(m.q, m.r)];
    let best = null, bd = here == null ? Infinity : here;
    for (const [nq, nr] of neighbors(M, m.q, m.r)) {
      if (nq === P.q && nr === P.r) {
        if (!hold && roamAmbushOk(M.tiles[key(nq, nr)])) return [nq, nr];
        continue;
      }
      const k = key(nq, nr);
      if (occ && occ[k]) continue;
      const v = dist[k];
      if (v != null && v < bd) { bd = v; best = [nq, nr]; }
    }
    return best;
  }
  /* One monster turn, after the player's step: sleepers whose hex is lit
     and within ROAM_SIGHT wake (and hold still this turn: the telegraph),
     the awake step one hex toward the player. opts.hold: the player's hex
     is busy (content resolving), so nobody steps onto it. Returns {woke:
     [m], moved: [{m, from: [q, r]}], ambush: m | null} (the first monster
     to reach the player; the rest wait). */
  function roamStep(M, opts) {
    opts = opts || {};
    const out = { woke: [], moved: [], ambush: null };
    const list = (M && M.roam) || [];
    if (!list.length) return out;
    const P = M.pos;
    const fresh = {};
    for (const m of list) {
      if (m.awake) continue;
      const t = M.tiles[key(m.q, m.r)];
      if (t && t.revealed && hexDist(m.q, m.r, P.q, P.r) <= ROAM_SIGHT) { m.awake = true; fresh[m.id] = 1; out.woke.push(m); }
    }
    const dist = roamDist(M);
    const occ = {};
    for (const m of list) occ[key(m.q, m.r)] = 1;
    for (const m of list) {
      if (!m.awake || fresh[m.id]) continue;
      const nx = roamNext(M, m, dist, occ, opts.hold);
      if (!nx) continue;
      if (nx[0] === P.q && nx[1] === P.r) { out.ambush = m; break; }
      const from = [m.q, m.r];
      delete occ[key(m.q, m.r)];
      m.q = nx[0]; m.r = nx[1];
      occ[key(m.q, m.r)] = 1;
      out.moved.push({ m, from });
    }
    return out;
  }
  // The telegraph: each awake monster's next hex if the player stood still.
  function roamPlan(M) {
    const out = [];
    const list = (M && M.roam) || [];
    if (!list.some((m) => m.awake)) return out;
    const dist = roamDist(M);
    const occ = {};
    for (const m of list) occ[key(m.q, m.r)] = 1;
    for (const m of list) if (m.awake) out.push({ m, next: roamNext(M, m, dist, occ, false) });
    return out;
  }
  function roamRemove(M, id) {
    if (!M || !M.roam) return null;
    const i = M.roam.findIndex((m) => m.id === id);
    return i >= 0 ? M.roam.splice(i, 1)[0] : null;
  }
  // ================================================================ /ARCADE

  // ================================================================ SECRET (round 6)
  /* The secret act (DESIGN.md "Secret act (round 6)"). secKeys places an
     act's golden key after generate (the game calls it; generate itself is
     untouched, so every seed's map is exactly what it was): 'roam' puts it
     in the roaming monster farthest from the start, 'arcade' makes it the
     jackpot of any cabinet on the map, 'dark' drops it on the empty dark
     land hex farthest from the road (the start breaks ties, then a hash of
     the seed). A kind the map cannot hold (no monsters, no cabinets) falls
     back to 'dark'. M.sec = {kind, want, got, q, r | id}. secRoom builds THE
     BACK ROOM: a 6 x 3 slice of the machine's insides in the 'machine'
     biome, a lit catwalk (the road) start -> boss that zigzags through the
     rows (6 or 7 hexes), one side hex off it, everything else the dark void
     of the cabinet (sea terrain: seen, never walked). 7 or 8 walkable hexes:
     elites with the strongest affixes, the service counter (a legendary
     shop), a treasure on the longer walk, a rest, a forge on the side, and
     THE MACHINE on the boss hex. */
  const SEC_BIOME = 'machine';
  const SEC_ROOM = { cols: 6, rows: 3, maxRoad: 7 };
  function secKeys(M, kind) {
    if (!M || !M.tiles) return null;
    const T = M.tiles, road = M.road || [];
    const want = kind;
    if (kind === 'roam' && M.roam && M.roam.length) {
      let best = null, bd = -1;
      for (const m of M.roam) { const d = hexDist(m.q, m.r, M.start.q, M.start.r); if (d > bd || (d === bd && best && m.id < best.id)) { bd = d; best = m; } }
      return (M.sec = { kind: 'roam', want, id: best.id, got: false });
    }
    if (kind === 'arcade' && Object.keys(T).some((k) => isArcade(T[k]) && T[k].type !== PET_TILE)) return (M.sec = { kind: 'arcade', want, got: false });
    const roam = {};
    for (const m of M.roam || []) roam[key(m.q, m.r)] = 1;
    let best = null, bs = -Infinity;
    for (const k in T) {
      const t = T[k];
      if (t.type !== 'empty' || !isLand(t) || t.road || roam[k]) continue;
      let d = road.length ? Infinity : hexDist(t.q, t.r, M.start.q, M.start.r);
      for (const s of road) { const x = hexDist(t.q, t.r, s[0], s[1]); if (x < d) d = x; }
      const sc = (t.revealed ? -1000 : 0) + d * 100 + hexDist(t.q, t.r, M.start.q, M.start.r) + (hashN((M.seed >>> 0) + ':key:' + k) % 97) / 100;
      if (sc > bs) { bs = sc; best = t; }
    }
    if (!best) return (M.sec = null);
    return (M.sec = { kind: 'dark', want, q: best.q, r: best.r, got: false });
  }
  // The dark key's hex (null when this map has none, or it was taken).
  function secKeyAt(M, q, r) {
    const s = M && M.sec;
    return !!(s && s.kind === 'dark' && !s.got && s.q === q && s.r === r);
  }
  function secRoom(opts) {
    opts = opts || {};
    const rng = opts.rng || U.rng(7);
    const { cols, rows } = SEC_ROOM;
    const seed = Math.floor(rng() * 4294967296);
    const start = { q: 0, r: 1 }, boss = { q: cols - 1, r: 1 };
    const M = {
      act: 3, biome: SEC_BIOME, cols, rows, seed, tiles: {}, start, boss, pos: { q: start.q, r: start.r },
      ink: opts.ink != null ? opts.ink : START_INK, brushes: (opts.brushes || []).map(normalizeTool),
      revealedCount: 0, islands: 0, water: 0, road: [], roam: [], room: true,
    };
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const q = c - Math.floor(r / 2);
      M.tiles[key(q, r)] = { q, r, type: 'empty', terrain: 'sea', ground: 'sea', elev: 0.5, coast: false, biome: SEC_BIOME, revealed: false, visited: false, road: false, known: false, content: {} };
      cells.push([q, r]);
    }
    // the catwalk: the cheapest walk over random weights (a zigzag), never longer than maxRoad
    let path = null;
    for (let tries = 0; tries < 12 && !path; tries++) {
      const w = {};
      for (const [q, r] of cells) w[key(q, r)] = 1 + rng() * 3;
      const dist = {}, prev = {}, open = [[start.q, start.r]];
      dist[key(start.q, start.r)] = 0;
      while (open.length) {
        open.sort((a, b) => dist[key(a[0], a[1])] - dist[key(b[0], b[1])]);
        const [q, r] = open.shift(), k0 = key(q, r);
        if (q === boss.q && r === boss.r) break;
        for (const [nq, nr] of neighbors(M, q, r)) {
          const k = key(nq, nr), d = dist[k0] + w[k];
          if (dist[k] == null || d < dist[k]) { dist[k] = d; prev[k] = k0; open.push([nq, nr]); }
        }
      }
      const out = [];
      for (let k = key(boss.q, boss.r); k; k = prev[k]) { const t = M.tiles[k]; out.unshift([t.q, t.r]); if (k === key(start.q, start.r)) break; }
      if (out.length >= 6 && out.length <= SEC_ROOM.maxRoad && out[0][0] === start.q && out[0][1] === start.r) path = out;
    }
    if (!path) { path = []; for (let c = 0; c < cols; c++) path.push([c, 1]); }
    const land = (t, type) => { t.terrain = 'land'; t.ground = 'grass'; t.elev = 0.3; t.type = type; };
    const inner = path.length - 2;
    const plan = inner >= 5 ? ['elite', 'shop', 'elite', 'treasure', 'rest'] : ['elite', 'shop', 'elite', 'rest'];
    const elites = (opts.elites || []).filter((x) => Array.isArray(x) && x.length);
    let ei = 0;
    path.forEach(([q, r], i) => {
      const t = M.tiles[key(q, r)];
      const type = i === 0 ? 'start' : i === path.length - 1 ? 'boss' : plan[Math.min(plan.length - 1, i - 1)];
      land(t, type);
      t.road = true; t.revealed = true;
      if (type === 'elite') t.content = { enc: (elites[ei++ % Math.max(1, elites.length)] || ['frostknight']).slice(), diff: 1, sec: true };
      else if (type === 'shop') t.content = { sec: true };
      else if (type === 'treasure') t.content = { gold: 40 };
      else if (type === 'boss') t.content = { enc: ['machine'], sec: true };
      M.road.push([q, r]);
    });
    // one side hex off the catwalk: the service bench (a forge)
    const onRoad = {};
    for (const [q, r] of path) onRoad[key(q, r)] = 1;
    const side = [];
    for (let i = 1; i < path.length - 2; i++) for (const [nq, nr] of neighbors(M, path[i][0], path[i][1])) if (!onRoad[key(nq, nr)] && !side.some((s) => s[0] === nq && s[1] === nr)) side.push([nq, nr]);
    if (side.length) { const [q, r] = side[Math.floor(rng() * side.length)]; land(M.tiles[key(q, r)], 'forge'); }
    for (const k in M.tiles) M.tiles[k].known = isLandmark(M.tiles[k]);
    const st = M.tiles[key(start.q, start.r)];
    st.visited = true;
    vision(M, start.q, start.r);
    M.tiles[key(boss.q, boss.r)].revealed = true;
    M.revealedCount = countRevealed(M);
    return M;
  }
  // ================================================================ /SECRET

  // ================================================================ LORE (round 9)
  /* Decorative landmarks (DESIGN.md "Lore and the weekly challenge (round 9)"):
     a broken jukebox, a pile of lost tickets and an old high score board on
     empty land, one of each per map. Only the game reads them: M.lore =
     [{k, q, r}], placed on their own rng drawn from M.seed after everything
     else, so the terrain, the content, the road, the cabinets, the monsters
     and the keys are untouched and no tile changes type. A landmark stands a
     hex or three off the road where it can be seen, never on the start, the
     boss, a golden key or a monster's hex, LORE_GAP apart (small maps relax
     the rules in steps). The Back Room has none. */
  const LORE_KINDS = ['jukebox', 'tickets', 'hiscore'];
  const LORE_GAP = 4;
  function lorePlace(M) {
    if (!M || !M.tiles || M.room || !M.start || !M.boss) return [];
    const rng = U.rng((((M.seed >>> 0) ^ 0x10ae5a1d) >>> 0) || 1);
    const T = M.tiles, road = M.road || [], sec = M.sec || {}, roam = Array.isArray(M.roam) ? M.roam : [];
    const free = [];
    for (const k in T) {
      const t = T[k];
      if (t.type !== 'empty' || t.terrain !== 'land' || !isLand(t) || t.road) continue;
      if (hexDist(t.q, t.r, M.start.q, M.start.r) < 2 || hexDist(t.q, t.r, M.boss.q, M.boss.r) < 2) continue;
      if (sec.q === t.q && sec.r === t.r) continue;
      if (roam.some((m) => m && m.q === t.q && m.r === t.r)) continue;
      let d = Infinity;
      for (const s of road) { const x = hexDist(t.q, t.r, s[0], s[1]); if (x < d) d = x; }
      free.push({ t, d: road.length ? d : 2 });
    }
    const out = [];
    // [nearest to the road, farthest, gap to the others]
    const passes = [[1, 3, LORE_GAP], [1, 5, 3], [1, 99, 2], [0, 99, 1]];
    for (const kind of rng.shuffle(LORE_KINDS.slice())) {
      let pick = null;
      for (const [d0, d1, gap] of passes) {
        const cand = free.filter((f) => f.d >= d0 && f.d <= d1 && out.every((o) => hexDist(o.q, o.r, f.t.q, f.t.r) >= gap));
        if (cand.length) { pick = rng.pick(cand).t; break; }
      }
      if (!pick) break;
      out.push({ k: kind, q: pick.q, r: pick.r });
    }
    // listed by kind, so a save and a fresh placement read the same
    return out.sort((a, b) => LORE_KINDS.indexOf(a.k) - LORE_KINDS.indexOf(b.k));
  }
  // The landmark on a hex, or null (M.lore, as the game placed it).
  function loreAt(M, q, r) {
    const L = M && Array.isArray(M.lore) ? M.lore : [];
    for (const x of L) if (x && x.q === q && x.r === r) return x;
    return null;
  }
  // ================================================================ /LORE

  // Charted hexes: lit tiles that are not sea (lit sea is seen, not charted).
  function countRevealed(M) {
    let n = 0;
    for (const k in M.tiles) { const t = M.tiles[k]; if (t.revealed && !isSea(t)) n++; }
    return n;
  }

  // Dark, in bounds, lightable by hand (no sea, no mountain), touching the
  // lit area, and the bulbs for it.
  function canReveal(M, q, r) {
    if (!inBounds(M, q, r)) return false;
    const t = M.tiles[key(q, r)];
    return !t.revealed && M.ink >= revealCost(t) && touchesRevealed(M, q, r);
  }

  // Spends the bulbs; returns the tile, or null if the reveal is not allowed.
  function reveal(M, q, r) {
    if (!canReveal(M, q, r)) return null;
    const t = M.tiles[key(q, r)];
    t.revealed = true;
    M.ink -= revealCost(t);
    M.revealedCount++;
    return t;
  }

  // One step onto an adjacent lit tile (a ford also needs the bulbs to wade it).
  function canMove(M, q, r) {
    if (!inBounds(M, q, r)) return false;
    const t = M.tiles[key(q, r)];
    return t.revealed && M.ink >= moveCost(t) && isAdjacent(M.pos.q, M.pos.r, q, r);
  }

  // Steps onto the tile and lights what can be seen from it (vision).
  function move(M, q, r) {
    if (!canMove(M, q, r)) return null;
    const t = M.tiles[key(q, r)];
    M.ink -= moveCost(t);
    M.pos = { q, r };
    t.visited = true;
    vision(M, q, r);
    return t;
  }

  // Tiles the player can step onto right now.
  function reachable(M) {
    return neighbors(M, M.pos.q, M.pos.r).map(([q, r]) => M.tiles[key(q, r)]).filter((t) => canMove(M, t.q, t.r));
  }

  // Dark tiles on the lit frontier that a bulb could light right now.
  // opts.brush ignores the bulbs (the frontier itself).
  function revealable(M, opts) {
    const out = [];
    const ignoreInk = opts && opts.brush;
    if (!ignoreInk && M.ink < 1) return out;
    for (const k in M.tiles) {
      const t = M.tiles[k];
      if (!t.revealed && revealCost(t) < Infinity && (ignoreInk || M.ink >= revealCost(t)) && touchesRevealed(M, t.q, t.r)) out.push(t);
    }
    return out;
  }

  // Hex centre in pixels; hex (0,0) sits at (size, size).
  // orient 'h' (default): columns run left to right, pointy-top hexes.
  // orient 'v': the same layout transposed for a portrait climb, (x, y) ->
  // (y, -x): column index maps to screen y bottom to top (the boss is at the
  // top), row index to screen x, and every hex becomes flat-top. Only the
  // positions transform; the generator and every rule stay column based.
  function toPixel(q, r, size, orient) {
    const x = size + SQRT3 * size * (q + r / 2), y = size + 1.5 * size * r;
    return orient === 'v' ? { x: y, y: -x } : { x, y };
  }

  // Pixel to axial with cube rounding (inverse of toPixel).
  function fromPixel(x, y, size, orient) {
    if (orient === 'v') { const hx = -y, hy = x; x = hx; y = hy; }
    const px = x - size, py = y - size;
    const fr = py / (1.5 * size);
    const fq = px / (SQRT3 * size) - fr / 2;
    const fs = -fq - fr;
    let rq = Math.round(fq), rr = Math.round(fr);
    const rs = Math.round(fs);
    const dq = Math.abs(rq - fq), dr = Math.abs(rr - fr), ds = Math.abs(rs - fs);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return { q: rq + 0, r: rr + 0 }; // +0 turns -0 into 0
  }

  // Six corner points of a hex centred at (x, y): pointy-top for 'h'
  // (clockwise from the top-right), flat-top for 'v' (the transposed hex is
  // the pointy one turned 30 degrees; clockwise from the right).
  function hexCorners(x, y, size, orient) {
    const pts = [];
    const off = orient === 'v' ? 0 : -30;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i + off);
      pts.push({ x: x + size * Math.cos(a), y: y + size * Math.sin(a) });
    }
    return pts;
  }

  // Fit the whole map inside w x h with a FIT_MARGIN px margin.
  // Returns {size, ox, oy}: draw hex (q,r) at toPixel(q,r,size,orient) + (ox, oy).
  // 'h': width = sqrt3*size*(cols + 0.5) (odd rows stick out half a hex),
  // height = size*(1.5*(rows-1) + 2). 'v' swaps the two. `max` caps the hex
  // size (the map is still centred). The map is centred in the box.
  function size(M, w, h, orient, max) {
    const half = M.rows > 1 ? 0.5 : 0;
    const m = FIT_MARGIN * 2;
    const across = SQRT3 * (M.cols + half), down = 1.5 * (M.rows - 1) + 2;
    const v = orient === 'v';
    let s = v ? Math.min((w - m) / down, (h - m) / across) : Math.min((w - m) / across, (h - m) / down);
    if (max > 0) s = Math.min(s, max);
    s = Math.max(1, s);
    const spanX = SQRT3 * s * (M.cols + half);   // extent along the columns
    const spanY = s * (1.5 * (M.rows - 1) + 2);  // extent along the rows
    // Unshifted 'h': the left edge sits at s - sqrt3/2*s and the top at 0.
    const lead = s - (SQRT3 / 2) * s;
    if (!v) return { size: s, ox: (w - spanX) / 2 - lead, oy: (h - spanY) / 2 };
    // 'v': x runs 0..spanY, y runs -(lead + spanX)..-lead.
    return { size: s, ox: (w - spanY) / 2, oy: (h - spanX) / 2 + lead + spanX };
  }

  // World box of the whole map at a fixed hex size: draw hex (q,r) at
  // toPixel(q,r,size,orient) + (ox, oy) and every hex lies in 0..w x 0..h.
  // What a camera pans over.
  function bounds(M, size, orient) {
    const half = M.rows > 1 ? 0.5 : 0;
    const spanX = SQRT3 * size * (M.cols + half), spanY = size * (1.5 * (M.rows - 1) + 2);
    const lead = size - (SQRT3 / 2) * size;
    if (orient === 'v') return { w: spanY, h: spanX, ox: 0, oy: lead + spanX };
    return { w: spanX, h: spanY, ox: -lead, oy: 0 };
  }

  // Charted share: sea never counts, it cannot be revealed.
  function progress(M) {
    let total = 0;
    for (const k in M.tiles) if (!isSea(M.tiles[k])) total++;
    const revealed = countRevealed(M);
    return { revealed, total, pct: Math.round((revealed / Math.max(1, total)) * 100) };
  }

  // M is plain JSON already; serialize is a detached deep copy.
  function serialize(M) {
    return JSON.parse(JSON.stringify(M));
  }

  function deserialize(o) {
    if (!o || !o.tiles || !o.cols || !o.rows) return null;
    const M = JSON.parse(JSON.stringify(o));
    // Old brush ids (line3, splash, drip, comb) load as lanterns.
    M.brushes = (M.brushes || []).map(normalizeTool);
    M.ink = M.ink || 0;
    M.seed = (M.seed || 0) >>> 0;
    M.pos = M.pos || { q: M.start.q, r: M.start.r };
    M.biome = M.biome || biomeOf(M.act || 1);
    // Saves from before the road carry none: they keep playing without one
    // (the game's ink rescue is the last resort there).
    M.road = Array.isArray(M.road) ? M.road.filter((s) => Array.isArray(s) && M.tiles[key(s[0], s[1])]) : [];
    const onRoad = {};
    for (const s of M.road) onRoad[key(s[0], s[1])] = 1;
    // Saves from before landmarks carry no `known`, saves from before the
    // terrain no terrain: derive both.
    for (const k in M.tiles) {
      const t = M.tiles[k];
      t.road = !!(t.road || onRoad[k]);
      if (t.known == null) t.known = isLandmark(t);
      if (t.type === 'tower' && !(t.content && t.content.tower)) t.content = Object.assign({}, t.content, { tower: { bonus: { k: 'ink', n: TOWER_INK } } });
      if (TERRAINS.indexOf(t.terrain) < 0) t.terrain = 'land';
      if (typeof t.elev !== 'number') t.elev = 0.35;
      if (t.coast == null) t.coast = false;
      if (!t.biome) t.biome = M.biome;
      if (!t.content) t.content = {};
      if (t.content.brush) t.content.brush = normalizeTool(t.content.brush);
      if (t.content.tower && t.content.tower.bonus && t.content.tower.bonus.k === 'brush') t.content.tower.bonus.id = normalizeTool(t.content.tower.bonus.id);
      // Saves from before the tileset carry no ground: read it off the
      // terrain (water), the height (hills) and the coast (sand).
      if (GROUNDS.indexOf(t.ground) < 0 || (t.ground === 'mountain' && t.terrain !== 'land') || (isWater(t) && t.ground !== t.terrain)) {
        t.ground = isWater(t) ? t.terrain : t.elev >= HILL_ELEV ? 'hill' : (t.coast && t.elev < SAND_ELEV) ? 'sand' : 'grass';
      }
    }
    // ARCADE: saves from before the roaming monsters carry none.
    M.roam = Array.isArray(M.roam) ? M.roam.filter((m) => m && M.tiles[key(m.q, m.r)]) : [];
    if (M.islands == null) M.islands = islandsOf(M).length;
    if (M.water == null) { let wet = 0, n = 0; for (const k in M.tiles) { n++; if (isWater(M.tiles[k])) wet++; } M.water = Math.round((wet / Math.max(1, n)) * 100) / 100; }
    M.revealedCount = countRevealed(M);
    return M;
  }

  return {
    TYPES, TERRAINS, GROUNDS, BIOMES, DIRS, DIST, MINS, MAXS, LANDMARKS, TOWER_BONUS, TOWER_INK, TOWER_GOLD, START_INK, INK_PER_ACT_HINT,
    DEFAULT_COLS, DEFAULT_ROWS, HEX, WATER, SHALLOW_COST, FIT_MARGIN, ROAD_MEANDER, ROAD_TOLL,
    HILL_ELEV, TOWER_ELEV, SAND_ELEV, MOUNTAIN_MAX, MOUNTAIN_ELEV, VISION, TOWER_VIEW, TOWER_GAP, TOWER_VIEW_MIN,
    TOOL_IDS, FALLBACK_TOOLS, FALLBACK_BRUSHES: FALLBACK_TOOLS, OLD_BRUSHES, FLARE_RANGE, KITE_RANGE, LANTERN_OUTER,
    generate, key, tileAt, inBounds, neighbors, isAdjacent, isLandmark, isRoad, biomeOf, islandsOf, isLand, isWater, isMountain, hexDist,
    revealCost, moveCost, pathCost, walkCost, walkPath,
    canReveal, reveal, pathToReveal, revealPath,
    disc, visionRadius, vision, towerView, lightArea,
    toolIds, normalizeTool, toolKind, dirTo, flareCells, lanternCells, kiteCells, toolCells, canTool, useTool,
    // the old brush names, kept for callers and saves from before the tools
    brushIds: toolIds, brushCells: toolCells, canBrush: canTool, brush: useTool,
    canMove, move, reachable, revealable,
    toPixel, fromPixel, hexCorners, size, bounds, pathExists, progress, serialize, deserialize,
    // ARCADE: cabinets and roaming monsters
    ARC_GAMES, ARC_ROAD_GAP, ARC_GAP, ROAM_N, ROAM_SIGHT, ROAM_START, ROAM_BOSS,
    isArcade, placeArcade, roamAt, roamOk, roamDist, roamNext, roamStep, roamPlan, roamRemove,
    // PETS (round 5): whack-a-mole, skee-ball, the pet shop
    ARC_R5, PET_TILE, placeR5,
    // SECRET (round 6): the golden keys and the Back Room
    SEC_BIOME, SEC_ROOM, secKeys, secKeyAt, secRoom,
    // LORE (round 9): the decorative landmarks (a jukebox, lost tickets, the old high score board)
    LORE_KINDS, LORE_GAP, lorePlace, loreAt,
  };
})();
