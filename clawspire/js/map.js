// Clawspire -- the overworld. A Roguebook style hex map the player reveals
// with ink and brushes, then walks one hex at a time.
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
// Terrain: every tile has terrain 'land' | 'shallow' | 'sea', elev 0..1 (land
// height, or depth for water), coast (land touching water) and biome (per act).
// Sea holds nothing, is never revealed and never walked. A shallow is a ford:
// it costs SHALLOW_COST ink to reveal and SHALLOW_COST ink to wade, and it is
// what joins an island to the mainland. Islands carry the best content.
//
// Pure data + functions: no DOM, no global randomness (every roll comes from
// the rng handed to generate), and M is plain JSON so it saves as-is.
const MAP = (() => {
  const SQRT3 = Math.sqrt(3);
  // Axial neighbour directions, clockwise from east.
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const TYPES = ['empty', 'fight', 'elite', 'treasure', 'gem', 'ink', 'brush', 'event',
    'shop', 'rest', 'boss', 'start', 'forge', 'tower'];
  const TERRAINS = ['land', 'shallow', 'sea'];
  const BIOMES = { 1: 'cellar', 2: 'foundry', 3: 'vault' };
  // Share of the placeable land tiles per type, and the hard minimums.
  // Ink pots sit at 10% of the land: the 16x22 world has long walks.
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
  const LANDMARKS = { shop: 1, rest: 1, forge: 1, elite: 1, treasure: 1, boss: 1, tower: 1 };
  // Tower bonuses (rolled at generate, awarded after the tower fight on top
  // of the relic). game.js applies them; the ids match its fx kinds.
  const TOWER_BONUS = ['ink', 'brush', 'claw', 'gold'];
  const TOWER_INK = 2, TOWER_GOLD = 60;
  const FALLBACK_UPGRADES = ['grabs', 'width', 'grip', 'speed', 'prongs', 'rubber', 'magnet'];
  const START_INK = 10;   // per act; game.js reads DATA.ECONOMY.startInk and passes it in
  // Ink a run can expect to find on one act's map along a sensible route
  // (start 10, a few pots at 2, half the fights at 1, elites and towers at
  // 2): the number the balance pass should reason from.
  const INK_PER_ACT_HINT = 24;
  const DEFAULT_COLS = 16, DEFAULT_ROWS = 22;
  const HEX = 46;         // the game's fixed hex size in stage px (the camera scales it)
  const WATER = 0.28;     // target share of water (sea + shallow) hexes (lands near 0.30 after the islands)
  const SHALLOW_COST = 2; // ink to reveal a ford, and again to wade it
  const FIT_MARGIN = 4;   // px kept free around the map by size()

  // Built-in brush shapes, used when DATA.BRUSHES is missing or lacks an id.
  // "Vertical" for comb means the same offset column (c = q + floor(r/2)),
  // which zigzags half a hex per row but reads as a straight column on screen.
  const FALLBACK_BRUSHES = {
    line3: (q, r) => [[q, r], [q + 1, r], [q + 2, r]],
    splash: (q, r) => [[q, r]].concat(DIRS.map(([dq, dr]) => [q + dq, r + dr])),
    drip: (q, r) => {
      const h = hash2(q, r);
      const i = h % 6;
      const j = (i + 1 + ((h >>> 3) % 5)) % 6; // always differs from i
      return [[q, r], [q + DIRS[i][0], r + DIRS[i][1]], [q + DIRS[j][0], r + DIRS[j][1]]];
    },
    comb: (q, r) => {
      const c = q + Math.floor(r / 2);
      const out = [];
      for (let d = -2; d <= 2; d++) out.push([c - Math.floor((r + d) / 2), r + d]);
      return out;
    },
  };

  function hash2(q, r) {
    if (typeof U !== 'undefined' && U.hashStr) return U.hashStr('drip:' + q + ',' + r);
    let h = Math.imul(q | 0, 73856093) ^ Math.imul(r | 0, 19349663);
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

  const isSea = (t) => !!t && t.terrain === 'sea';
  const isLand = (t) => !!t && (t.terrain || 'land') === 'land';
  // Ink to reveal a tile: 1 on land, SHALLOW_COST on a ford, never for sea.
  function revealCost(t) {
    if (!t || isSea(t)) return Infinity;
    return t.terrain === 'shallow' ? SHALLOW_COST : 1;
  }
  // Ink to step onto a tile: free on land, SHALLOW_COST to wade a ford.
  function moveCost(t) {
    if (!t || isSea(t)) return Infinity;
    return t.terrain === 'shallow' ? SHALLOW_COST : 0;
  }
  function pathCost(M, path) {
    let n = 0;
    for (const s of path || []) { const t = s && M.tiles[key(s[0], s[1])]; n += revealCost(t); }
    return n;
  }
  const biomeOf = (act) => BIOMES[act] || BIOMES[((Math.max(1, act | 0) - 1) % 3) + 1];

  // A revealed tile the ink may grow from (the boss only once visited).
  function isFoothold(t) {
    return !!t && t.revealed && (t.type !== 'boss' || t.visited);
  }

  // The boss tile is lit from the start but it is not a foothold: the ink
  // must grow out from where the player has actually been, or the far side
  // of the map could be painted open from the boss's doorstep.
  function touchesRevealed(M, q, r) {
    return neighbors(M, q, r).some(([nq, nr]) => isFoothold(M.tiles[key(nq, nr)]));
  }

  // Cheapest chain of hidden tiles from the lit area to (q, r), in reveal
  // order, ending on (q, r) itself: what "paint the path" would reveal.
  // Multi-source Dijkstra (bucket queue, costs are 1 or SHALLOW_COST) from
  // every foothold through hidden, non-boss, non-sea tiles; pathCost() gives
  // the ink. Empty when the target is revealed, out of bounds, sea, the boss,
  // already touching the lit area (that is a plain reveal) or unreachable.
  function pathToReveal(M, q, r) {
    if (!inBounds(M, q, r)) return [];
    const goal = M.tiles[key(q, r)];
    if (goal.revealed || goal.type === 'boss' || isSea(goal) || touchesRevealed(M, q, r)) return [];
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
          if (t.revealed || t.type === 'boss' || isSea(t)) continue;
          const nd = d + revealCost(t);
          if (dist[k] != null && dist[k] <= nd) continue;
          dist[k] = nd; parent[k] = ck;
          (buckets[nd] || (buckets[nd] = [])).push(k);
        }
      }
    }
    return [];
  }

  // Reveals a whole path (as returned by pathToReveal) for pathCost() ink.
  // Refuses, spending nothing, when the ink is short or any step could not
  // be revealed in order. Returns the revealed tiles or null.
  function revealPath(M, path) {
    if (!Array.isArray(path) || !path.length) return null;
    const seen = {};
    for (const step of path) {
      if (!step || !inBounds(M, step[0], step[1])) return null;
      const k = key(step[0], step[1]);
      const t = M.tiles[k];
      if (t.revealed || t.type === 'boss' || isSea(t) || seen[k]) return null;
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

  // Available brush ids: the data module's list when present, else the fallback set.
  function brushIds() {
    if (typeof DATA !== 'undefined' && DATA && DATA.BRUSHES) {
      const ids = Object.keys(DATA.BRUSHES);
      if (ids.length) return ids;
    }
    return Object.keys(FALLBACK_BRUSHES);
  }

  // Raw footprint of a brush (may include out-of-bounds cells), or null if unknown.
  function brushCells(brushId, q, r) {
    let fn = null;
    if (typeof DATA !== 'undefined' && DATA && DATA.BRUSHES && DATA.BRUSHES[brushId] &&
      typeof DATA.BRUSHES[brushId].cells === 'function') fn = DATA.BRUSHES[brushId].cells;
    else if (FALLBACK_BRUSHES[brushId]) fn = FALLBACK_BRUSHES[brushId];
    if (!fn) return null;
    const cells = fn(q, r) || [];
    // De-duplicate so a sloppy shape cannot double count.
    const seen = {};
    return cells.filter(([cq, cr]) => { const k = key(cq, cr); if (seen[k]) return false; seen[k] = 1; return true; });
  }

  // Least ink needed to walk from `from` to `to` (wading fords costs
  // SHALLOW_COST each, land is free), or -1 when there is no way. Default
  // walks revealed tiles only; opts.any ignores the fog (used to prove the
  // boss is reachable at generate time), opts.land allows land only. The
  // boss tile is never passed *through*, only ended on, since stepping on it
  // starts the boss fight. Sea is never walked.
  function walkCost(M, from, to, opts) {
    opts = opts || {};
    if (!from || !to || !inBounds(M, from.q, from.r) || !inBounds(M, to.q, to.r)) return -1;
    const ok = (t) => !isSea(t) && (opts.any || t.revealed) && (!opts.land || isLand(t));
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
        content.brush = crng.pick(brushIds());
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

  // The bonus a tower pays out on top of its relic. Brush and claw ids come
  // from DATA when it is loaded, else from the fallback lists.
  function rollTowerBonus(crng) {
    const k = crng.pick(TOWER_BONUS);
    if (k === 'ink') return { k, n: TOWER_INK };
    if (k === 'gold') return { k, n: TOWER_GOLD };
    if (k === 'brush') return { k, id: crng.pick(brushIds()) };
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
    // Coast flags, biome, rounding.
    for (const k of keys) {
      const t = T[k];
      t.coast = isLand(t) && neighbors(M, t.q, t.r).some(([nq, nr]) => !isLand(T[key(nq, nr)]));
      t.elev = Math.round((t.elev || 0) * 100) / 100;
      t.biome = M.biome;
    }
    M.islands = groups.length - 1;
    let wet = 0;
    for (const k of keys) if (!isLand(T[k])) wet++;
    M.water = Math.round((wet / keys.length) * 100) / 100;
  }

  // Island content: the best things live across the water. Largest island
  // first: a tower (all but one tower go to islands), a treasure, an elite
  // (never beside start or boss), half the time a shop. Spread rules are
  // relaxed on islands, there is no room for them. Returns the tower cells.
  function placeIslandContent(M, islands, counts, rng, eliteOk) {
    const towers = [];
    let spare = Math.max(0, counts.tower - 1);   // one tower stays on the mainland
    islands.forEach((isle) => {
      const cells = rng.shuffle(isle).filter((k) => M.tiles[k].type === 'empty');
      const give = (type) => {
        const k = cells.shift();
        if (!k) return false;
        M.tiles[k].type = type;
        counts[type]--;
        return true;
      };
      if (spare > 0) { const k = cells[0]; if (give('tower')) { spare--; towers.push([M.tiles[k].q, M.tiles[k].r]); } }
      if (counts.treasure > 0) give('treasure');
      const ek = cells.find((k) => eliteOk(M.tiles[k].q, M.tiles[k].r));
      if (ek && counts.elite > 0) { cells.splice(cells.indexOf(ek), 1); M.tiles[ek].type = 'elite'; counts.elite--; }
      if (counts.shop > 0 && rng() < 0.5) give('shop');
    });
    return towers;
  }

  // Mainland towers sit off the start-boss axis: top or bottom row, offset
  // columns 3..cols-3 when the land allows it, else anywhere at least two
  // rows off the axis. Never next to each other. Returns the cells taken.
  function placeTowers(M, n, rng, placed) {
    placed = placed || [];
    const main = landGroups(M)[0];
    const mid = M.start.r;
    const tiers = [
      (t) => (t.r === 0 || t.r === M.rows - 1) && t.q + Math.floor(t.r / 2) >= 3 && t.q + Math.floor(t.r / 2) <= M.cols - 3,
      (t) => Math.abs(t.r - mid) >= 2,
      (t) => t.r !== mid,
    ];
    for (const tier of tiers) {
      if (placed.length >= n) break;
      const cand = main.map((k) => M.tiles[k]).filter((t) => t.type === 'empty' && tier(t)).map((t) => [t.q, t.r]);
      for (const [q, r] of rng.shuffle(cand)) {
        if (placed.length >= n) break;
        if (placed.some(([pq, pr]) => isAdjacent(pq, pr, q, r))) continue;
        M.tiles[key(q, r)].type = 'tower';
        placed.push([q, r]);
      }
    }
    if (placed.length < Math.min(n, MINS.tower)) throw new Error('MAP.generate: could not place tower');
    return placed;
  }

  // MAP.generate({act, rng, cols=16, rows=22, ink=10, brushes=[], water=0.30, islands}) -> M.
  // cols is clamped to >= 9 and rows to >= 3 so the minimums always fit.
  // water is the share of water hexes (0 = an all-land map); islands the
  // number wanted (default 2..4 on big maps, 1 on small ones, 0 when dry).
  function generate(opts) {
    opts = opts || {};
    const rng = opts.rng || U.rng(1);
    const cols = Math.max(9, Math.floor(opts.cols || DEFAULT_COLS));
    const rows = Math.max(3, Math.floor(opts.rows || DEFAULT_ROWS));
    const act = opts.act || 1;
    const crng = U.rng(Math.floor(rng() * 4294967296));
    const midR = Math.floor(rows / 2);
    const start = { q: -Math.floor(midR / 2), r: midR };
    const boss = { q: cols - 1 - Math.floor(midR / 2), r: midR };
    // Tiny maps (the clamped 9x3 floor) stay dry: 27 tiles cannot hold the
    // minimums and a third of water.
    const water = cols * rows < 60 ? 0 : (opts.water != null ? opts.water : WATER);
    const M = {
      act, biome: biomeOf(act), cols, rows, tiles: {}, start, boss, pos: { q: start.q, r: start.r },
      ink: opts.ink != null ? opts.ink : START_INK,
      brushes: (opts.brushes || []).slice(), revealedCount: 0, islands: 0, water: 0,
    };
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const q = c - Math.floor(r / 2);
        M.tiles[key(q, r)] = { q, r, type: 'empty', terrain: 'land', elev: 0, coast: false, biome: M.biome, revealed: false, visited: false, content: {} };
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
    const towerCount = counts.tower;
    const towers = placeIslandContent(M, islands, counts, rng, eliteOk);
    placeTowers(M, towerCount, rng, towers);
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

    // Fog: start (visited), its neighbours and the boss are visible.
    const st = M.tiles[key(start.q, start.r)];
    st.revealed = true; st.visited = true;
    for (const [nq, nr] of neighbors(M, start.q, start.r)) M.tiles[key(nq, nr)].revealed = true;
    M.tiles[key(boss.q, boss.r)].revealed = true;
    M.revealedCount = countRevealed(M);

    if (!pathExists(M, start, boss, { any: true, land: true })) throw new Error('MAP.generate: boss unreachable by land');
    return M;
  }

  function countRevealed(M) {
    let n = 0;
    for (const k in M.tiles) if (M.tiles[k].revealed) n++;
    return n;
  }

  // Hidden, in bounds, not sea, touching the revealed area, and the ink for it.
  function canReveal(M, q, r) {
    if (!inBounds(M, q, r)) return false;
    const t = M.tiles[key(q, r)];
    return !t.revealed && !isSea(t) && M.ink >= revealCost(t) && touchesRevealed(M, q, r);
  }

  // Spends the reveal cost; returns the tile, or null if the reveal is not allowed.
  function reveal(M, q, r) {
    if (!canReveal(M, q, r)) return null;
    const t = M.tiles[key(q, r)];
    t.revealed = true;
    M.ink -= revealCost(t);
    M.revealedCount++;
    return t;
  }

  // A brush may target any hidden, non-sea tile touching the revealed area (no ink).
  function canBrush(M, brushId, q, r) {
    if (!inBounds(M, q, r) || M.brushes.indexOf(brushId) < 0) return false;
    if (!brushCells(brushId, q, r)) return false;
    const t = M.tiles[key(q, r)];
    return !t.revealed && !isSea(t) && touchesRevealed(M, q, r);
  }

  // Reveals the brush's in-bounds cells (sea stays sea) and consumes one
  // copy of the brush. Returns the tiles newly revealed (already revealed
  // cells are skipped), or null when the brush cannot be used there.
  function brush(M, brushId, q, r) {
    if (!canBrush(M, brushId, q, r)) return null;
    const out = [];
    for (const [cq, cr] of brushCells(brushId, q, r)) {
      if (!inBounds(M, cq, cr)) continue;
      const t = M.tiles[key(cq, cr)];
      if (t.revealed || isSea(t)) continue;
      t.revealed = true;
      M.revealedCount++;
      out.push(t);
    }
    M.brushes.splice(M.brushes.indexOf(brushId), 1);
    return out;
  }

  // One step onto an adjacent revealed tile (a ford also needs the ink to wade it).
  function canMove(M, q, r) {
    if (!inBounds(M, q, r)) return false;
    const t = M.tiles[key(q, r)];
    return t.revealed && !isSea(t) && M.ink >= moveCost(t) && isAdjacent(M.pos.q, M.pos.r, q, r);
  }

  function move(M, q, r) {
    if (!canMove(M, q, r)) return null;
    const t = M.tiles[key(q, r)];
    M.ink -= moveCost(t);
    M.pos = { q, r };
    t.visited = true;
    return t;
  }

  // Tiles the player can step onto right now.
  function reachable(M) {
    return neighbors(M, M.pos.q, M.pos.r).map(([q, r]) => M.tiles[key(q, r)]).filter((t) => canMove(M, t.q, t.r));
  }

  // Tiles that may be revealed right now. opts.brush ignores ink (brush targets).
  function revealable(M, opts) {
    const out = [];
    const ignoreInk = opts && opts.brush;
    if (!ignoreInk && M.ink < 1) return out;
    for (const k in M.tiles) {
      const t = M.tiles[k];
      if (!t.revealed && !isSea(t) && (ignoreInk || M.ink >= revealCost(t)) && touchesRevealed(M, t.q, t.r)) out.push(t);
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
    M.brushes = M.brushes || [];
    M.ink = M.ink || 0;
    M.pos = M.pos || { q: M.start.q, r: M.start.r };
    M.biome = M.biome || biomeOf(M.act || 1);
    // Saves from before landmarks carry no `known`, saves from before the
    // terrain no terrain: derive both.
    for (const k in M.tiles) {
      const t = M.tiles[k];
      if (t.known == null) t.known = isLandmark(t);
      if (t.type === 'tower' && !(t.content && t.content.tower)) t.content = Object.assign({}, t.content, { tower: { bonus: { k: 'ink', n: TOWER_INK } } });
      if (TERRAINS.indexOf(t.terrain) < 0) t.terrain = 'land';
      if (typeof t.elev !== 'number') t.elev = 0.35;
      if (t.coast == null) t.coast = false;
      if (!t.biome) t.biome = M.biome;
      if (!t.content) t.content = {};
    }
    if (M.islands == null) M.islands = islandsOf(M).length;
    if (M.water == null) { let wet = 0, n = 0; for (const k in M.tiles) { n++; if (!isLand(M.tiles[k])) wet++; } M.water = Math.round((wet / Math.max(1, n)) * 100) / 100; }
    M.revealedCount = countRevealed(M);
    return M;
  }

  return {
    TYPES, TERRAINS, BIOMES, DIRS, DIST, MINS, MAXS, LANDMARKS, TOWER_BONUS, TOWER_INK, TOWER_GOLD, START_INK, INK_PER_ACT_HINT,
    DEFAULT_COLS, DEFAULT_ROWS, HEX, WATER, SHALLOW_COST, FIT_MARGIN, FALLBACK_BRUSHES,
    generate, key, tileAt, inBounds, neighbors, isAdjacent, isLandmark, biomeOf, islandsOf,
    revealCost, moveCost, pathCost, walkCost,
    canReveal, reveal, pathToReveal, revealPath,
    brushCells, brushIds, canBrush, brush, canMove, move, reachable, revealable,
    toPixel, fromPixel, hexCorners, size, bounds, pathExists, progress, serialize, deserialize,
  };
})();
