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
//     with cube rounding. MAP.size() gives the extra {ox, oy} to centre a map.
//
// Pure data + functions: no DOM, no global randomness (every roll comes from
// the rng handed to generate), and M is plain JSON so it saves as-is.
const MAP = (() => {
  const SQRT3 = Math.sqrt(3);
  // Axial neighbour directions, clockwise from east.
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const TYPES = ['empty', 'fight', 'elite', 'treasure', 'gem', 'ink', 'brush', 'event',
    'shop', 'rest', 'boss', 'start', 'forge'];
  // Share of the non start/boss tiles per type, and the hard minimums.
  const DIST = {
    fight: 0.30, empty: 0.22, gem: 0.10, ink: 0.08, event: 0.08, treasure: 0.04,
    brush: 0.04, shop: 0.03, rest: 0.05, forge: 0.03, elite: 0.03,
  };
  const MINS = { shop: 2, rest: 3, forge: 2, elite: 2, treasure: 2, brush: 2, ink: 4 };
  // Placement order: constrained types first so they always find a spot.
  const SPECIALS = ['elite', 'shop', 'rest', 'forge', 'treasure', 'brush', 'ink', 'event', 'gem'];
  // Types that read better spread out: avoid putting two side by side.
  const SPREAD = { shop: 1, rest: 1, forge: 1, elite: 1, treasure: 1 };
  const START_INK = 5;

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

  function touchesRevealed(M, q, r) {
    return neighbors(M, q, r).some(([nq, nr]) => M.tiles[key(nq, nr)].revealed);
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

  // BFS from `from` to `to`. Default walks revealed tiles only; opts.any
  // ignores the fog (used to prove the boss is reachable at generate time).
  // The boss tile is never passed *through*, only ended on, since stepping on
  // it starts the boss fight.
  function pathExists(M, from, to, opts) {
    opts = opts || {};
    if (!from || !to || !inBounds(M, from.q, from.r) || !inBounds(M, to.q, to.r)) return false;
    const ok = (t) => opts.any || t.revealed;
    const goal = key(to.q, to.r);
    if (!ok(M.tiles[goal])) return false;
    const startK = key(from.q, from.r);
    if (startK === goal) return true;
    const seen = { [startK]: 1 };
    const queue = [[from.q, from.r]];
    while (queue.length) {
      const [q, r] = queue.shift();
      for (const [nq, nr] of neighbors(M, q, r)) {
        const k = key(nq, nr);
        if (seen[k]) continue;
        seen[k] = 1;
        if (k === goal) return true;
        const t = M.tiles[k];
        if (!ok(t) || t.type === 'boss') continue;
        queue.push([nq, nr]);
      }
    }
    return false;
  }

  // Per-type counts for n placeable tiles: the bible's shares with random
  // rounding, the minimums enforced, fight/empty absorbing the remainder.
  function rollCounts(n, rng) {
    const counts = {};
    let used = 0;
    for (const t of SPECIALS) {
      const base = n * DIST[t];
      let c = Math.floor(base) + (rng() < base - Math.floor(base) ? 1 : 0);
      c = Math.max(c, MINS[t] || 0);
      counts[t] = c;
      used += c;
    }
    // Only tiny maps can overflow; trim optional types, never below minimums.
    for (const t of ['gem', 'event', 'ink', 'treasure', 'brush', 'rest', 'shop', 'forge']) {
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
      case 'fight': case 'elite': {
        content.diff = diffOf(M, t.q, t.r);
        if (t.type === 'elite') content.elite = true;
        if (enc) {
          const list = t.type === 'elite' ? enc.elite : enc.normal;
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
        content.ink = crng() < 0.35 ? 2 : 1;
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

  // MAP.generate({act, rng, cols=12, rows=7, ink=5, brushes=[]}) -> M.
  // cols is clamped to >= 7 and rows to >= 3 so the minimums always fit.
  function generate(opts) {
    opts = opts || {};
    const rng = opts.rng || U.rng(1);
    const cols = Math.max(7, Math.floor(opts.cols || 12));
    const rows = Math.max(3, Math.floor(opts.rows || 7));
    const act = opts.act || 1;
    const crng = U.rng(Math.floor(rng() * 4294967296));
    const midR = Math.floor(rows / 2);
    const start = { q: -Math.floor(midR / 2), r: midR };
    const boss = { q: cols - 1 - Math.floor(midR / 2), r: midR };
    const M = {
      act, cols, rows, tiles: {}, start, boss, pos: { q: start.q, r: start.r },
      ink: opts.ink != null ? opts.ink : START_INK,
      brushes: (opts.brushes || []).slice(), revealedCount: 0,
    };
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const q = c - Math.floor(r / 2);
        M.tiles[key(q, r)] = { q, r, type: 'empty', revealed: false, visited: false, content: {} };
        cells.push([q, r]);
      }
    }
    M.tiles[key(start.q, start.r)].type = 'start';
    M.tiles[key(boss.q, boss.r)].type = 'boss';

    const free = cells.filter(([q, r]) => M.tiles[key(q, r)].type === 'empty');
    const counts = rollCounts(free.length, rng);
    let pool = rng.shuffle(free);
    const take = (type, n, allowed) => {
      // First pass honours the spread rule, second pass fills whatever is left.
      for (let pass = 0; pass < 2 && n > 0; pass++) {
        const keep = [];
        for (const cell of pool) {
          const [q, r] = cell;
          if (n > 0 && allowed(q, r) && (pass === 1 || !SPREAD[type] ||
            !neighbors(M, q, r).some(([nq, nr]) => M.tiles[key(nq, nr)].type === type))) {
            M.tiles[key(q, r)].type = type;
            n--;
          } else keep.push(cell);
        }
        pool = keep;
      }
      if (n > 0) throw new Error('MAP.generate: could not place ' + type);
    };
    const eliteOk = (q, r) => !isAdjacent(q, r, start.q, start.r) && !isAdjacent(q, r, boss.q, boss.r);
    for (const t of SPECIALS) take(t, counts[t], t === 'elite' ? eliteOk : () => true);
    take('fight', counts.fight, () => true);
    // Anything left stays 'empty'.

    const usedEvents = {};
    for (const [q, r] of cells) {
      const t = M.tiles[key(q, r)];
      t.content = rollContent(M, t, crng, usedEvents);
    }

    // Fog: start (visited), its neighbours and the boss are visible.
    const st = M.tiles[key(start.q, start.r)];
    st.revealed = true; st.visited = true;
    for (const [nq, nr] of neighbors(M, start.q, start.r)) M.tiles[key(nq, nr)].revealed = true;
    M.tiles[key(boss.q, boss.r)].revealed = true;
    M.revealedCount = countRevealed(M);

    if (!pathExists(M, start, boss, { any: true })) throw new Error('MAP.generate: boss unreachable');
    return M;
  }

  function countRevealed(M) {
    let n = 0;
    for (const k in M.tiles) if (M.tiles[k].revealed) n++;
    return n;
  }

  // Hidden, in bounds, touching the revealed area, and at least one ink.
  function canReveal(M, q, r) {
    if (!inBounds(M, q, r)) return false;
    const t = M.tiles[key(q, r)];
    return !t.revealed && M.ink >= 1 && touchesRevealed(M, q, r);
  }

  // Spends one ink; returns the tile, or null if the reveal is not allowed.
  function reveal(M, q, r) {
    if (!canReveal(M, q, r)) return null;
    const t = M.tiles[key(q, r)];
    t.revealed = true;
    M.ink -= 1;
    M.revealedCount++;
    return t;
  }

  // A brush may target any hidden tile touching the revealed area (no ink).
  function canBrush(M, brushId, q, r) {
    if (!inBounds(M, q, r) || M.brushes.indexOf(brushId) < 0) return false;
    if (!brushCells(brushId, q, r)) return false;
    return !M.tiles[key(q, r)].revealed && touchesRevealed(M, q, r);
  }

  // Reveals the brush's in-bounds cells and consumes one copy of the brush.
  // Returns the tiles newly revealed (already revealed cells are skipped),
  // or null when the brush cannot be used there.
  function brush(M, brushId, q, r) {
    if (!canBrush(M, brushId, q, r)) return null;
    const out = [];
    for (const [cq, cr] of brushCells(brushId, q, r)) {
      if (!inBounds(M, cq, cr)) continue;
      const t = M.tiles[key(cq, cr)];
      if (t.revealed) continue;
      t.revealed = true;
      M.revealedCount++;
      out.push(t);
    }
    M.brushes.splice(M.brushes.indexOf(brushId), 1);
    return out;
  }

  // One step onto an adjacent revealed tile.
  function canMove(M, q, r) {
    if (!inBounds(M, q, r)) return false;
    return M.tiles[key(q, r)].revealed && isAdjacent(M.pos.q, M.pos.r, q, r);
  }

  function move(M, q, r) {
    if (!canMove(M, q, r)) return null;
    const t = M.tiles[key(q, r)];
    M.pos = { q, r };
    t.visited = true;
    return t;
  }

  // Tiles the player can step onto right now.
  function reachable(M) {
    return neighbors(M, M.pos.q, M.pos.r).map(([q, r]) => M.tiles[key(q, r)]).filter((t) => t.revealed);
  }

  // Tiles that may be revealed right now. opts.brush ignores ink (brush targets).
  function revealable(M, opts) {
    const out = [];
    const ignoreInk = opts && opts.brush;
    if (!ignoreInk && M.ink < 1) return out;
    for (const k in M.tiles) {
      const t = M.tiles[k];
      if (!t.revealed && touchesRevealed(M, t.q, t.r)) out.push(t);
    }
    return out;
  }

  // Hex centre in pixels; hex (0,0) sits at (size, size).
  function toPixel(q, r, size) {
    return { x: size + SQRT3 * size * (q + r / 2), y: size + 1.5 * size * r };
  }

  // Pixel to axial with cube rounding (inverse of toPixel).
  function fromPixel(x, y, size) {
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

  // Six corner points of a pointy-top hex centred at (x, y), clockwise from the top-right.
  function hexCorners(x, y, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      pts.push({ x: x + size * Math.cos(a), y: y + size * Math.sin(a) });
    }
    return pts;
  }

  // Fit the whole map inside w x h with an 8px margin.
  // Returns {size, ox, oy}: draw hex (q,r) at toPixel(q,r,size) + (ox, oy).
  // Width = sqrt3*size*(cols + 0.5) (odd rows stick out half a hex),
  // height = size*(1.5*(rows-1) + 2). The map is centred in the box.
  function size(M, w, h) {
    const half = M.rows > 1 ? 0.5 : 0;
    const s = Math.max(1, Math.min((w - 16) / (SQRT3 * (M.cols + half)), (h - 16) / (1.5 * (M.rows - 1) + 2)));
    const mapW = SQRT3 * s * (M.cols + half);
    const mapH = s * (1.5 * (M.rows - 1) + 2);
    // Unshifted, the map's left edge is at s - sqrt3/2*s and its top at 0.
    return { size: s, ox: (w - mapW) / 2 - (s - (SQRT3 / 2) * s), oy: (h - mapH) / 2 };
  }

  function progress(M) {
    const total = M.cols * M.rows;
    const revealed = countRevealed(M);
    return { revealed, total, pct: Math.round((revealed / total) * 100) };
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
    M.revealedCount = countRevealed(M);
    return M;
  }

  return {
    TYPES, DIST, MINS, START_INK, FALLBACK_BRUSHES,
    generate, key, tileAt, inBounds, neighbors, isAdjacent, canReveal, reveal,
    brushCells, brushIds, canBrush, brush, canMove, move, reachable, revealable,
    toPixel, fromPixel, hexCorners, size, pathExists, progress, serialize, deserialize,
  };
})();
