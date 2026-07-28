// Navigation for the enemy simulation.
//
// The level is an AABB soup with no authored navmesh, so the nav representation
// is derived at load: drop a ray on every cell of a uniform grid, keep the ones a
// body can actually stand in, and connect neighbours whose floors are within a
// step of each other. It is a 2.5D grid — one floor height per XZ cell — which is
// exactly wrong for a catwalk stacked over a corridor and exactly right for
// everything else, and it costs one raycast per cell to build instead of an
// offline bake this project has no pipeline for.
//
// A* runs incrementally. A request keeps its own open list between ticks and the
// whole flock shares one expansion budget per tick, so eight enemies asking for a
// path across the map at the same moment cost the same frame time as one asking
// eight times in a row — the answer just arrives a few frames later. Nobody can
// see a 40 ms hitch coming from AI and forgive it, but everybody accepts an enemy
// that takes a beat to commit to a route.
//
// Pure data in, pure data out. No Three.js, no DOM.

import { queryAABB, groundBelow, lineOfSight } from '../world/collision.js';

export const NAV_CELL = 0.8;         // metres per nav cell
export const NAV_AGENT_R = 0.33;     // slightly under the body radius — see buildNav
export const NAV_AGENT_H = 1.72;     // headroom a standing body needs
export const NAV_STEP = 0.45;        // floor difference two neighbours may have
export const NAV_MAX_CELLS = 320000; // hard ceiling; the cell size grows to fit
export const NAV_MAX_EXPANSIONS = 9000; // per request, before it settles for the best-so-far

// ── build ────────────────────────────────────────────────────────────────────

export function buildNav(world, opts = {}) {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  const wb = world.bounds || { min: { x: -80, y: -8, z: -80 }, max: { x: 80, y: 40, z: 80 } };
  const gb = world.grid && world.grid.bounds;

  // Intersect the authored bounds with what the geometry actually occupies —
  // a level that fills a quarter of its bounds should not pay for the other
  // three quarters of empty cells.
  const min = {
    x: Math.max(wb.min.x, gb ? gb.min.x - 1 : wb.min.x),
    z: Math.max(wb.min.z, gb ? gb.min.z - 1 : wb.min.z),
  };
  const max = {
    x: Math.min(wb.max.x, gb ? gb.max.x + 1 : wb.max.x),
    z: Math.min(wb.max.z, gb ? gb.max.z + 1 : wb.max.z),
  };
  if (!(max.x > min.x) || !(max.z > min.z)) { min.x = wb.min.x; min.z = wb.min.z; max.x = wb.max.x; max.z = wb.max.z; }

  let cell = opts.cell || NAV_CELL;
  let nx = Math.max(1, Math.ceil((max.x - min.x) / cell));
  let nz = Math.max(1, Math.ceil((max.z - min.z) / cell));
  while (nx * nz > NAV_MAX_CELLS) {
    cell *= 1.25;
    nx = Math.max(1, Math.ceil((max.x - min.x) / cell));
    nz = Math.max(1, Math.ceil((max.z - min.z) / cell));
  }

  const n = nx * nz;
  const nav = {
    cell, nx, nz,
    x0: min.x, z0: min.z,
    x1: min.x + nx * cell, z1: min.z + nz * cell,
    walk: new Uint8Array(n),
    h: new Float32Array(n),
    surface: new Uint8Array(n),
    walkable: 0,
    // Incremental A* bookkeeping, shared by every agent.
    queue: [], seq: 0, expansions: 0, requests: 0, solved: 0, failed: 0,
    staticsRef: world.statics, staticsLen: world.statics ? world.statics.length : 0,
    buildMs: 0,
  };

  const top = (gb ? Math.max(gb.max.y, wb.max.y) : wb.max.y) + 1;
  const drop = top - Math.min(gb ? gb.min.y : wb.min.y, wb.min.y) + 2;
  const probe = [];
  const r = opts.agentR != null ? opts.agentR : NAV_AGENT_R;
  const hh = opts.agentH != null ? opts.agentH : NAV_AGENT_H;

  for (let iz = 0; iz < nz; iz++) {
    const z = min.z + (iz + 0.5) * cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = min.x + (ix + 0.5) * cell;
      const g = groundBelow(world, x, top, z, drop);
      const i = iz * nx + ix;
      if (!g) { nav.h[i] = wb.min.y; continue; }
      nav.h[i] = g.y;
      nav.surface[i] = g.surface | 0;
      // The probe radius is a hair under the body radius on purpose: the
      // collision resolver lets a body's centre sit exactly `radius` from a
      // wall face, so testing the full radius would mark every cell along
      // every wall unwalkable and enemies would refuse to hug cover.
      queryAABB(world.grid,
        { x: x - r, y: g.y + 0.12, z: z - r },
        { x: x + r, y: g.y + hh, z: z + r }, probe);
      if (probe.length) continue;
      nav.walk[i] = 1;
      nav.walkable++;
    }
  }

  nav.buildMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - t0;
  return nav;
}

// The nav grid is derived from the static set, so it only needs rebuilding when
// the level itself is swapped. Cheap identity check, not a deep compare.
export function navStale(nav, world) {
  if (!nav) return true;
  return nav.staticsRef !== world.statics ||
    nav.staticsLen !== (world.statics ? world.statics.length : 0);
}

// ── cell access ──────────────────────────────────────────────────────────────

export function cellX(nav, x) { return Math.floor((x - nav.x0) / nav.cell); }
export function cellZ(nav, z) { return Math.floor((z - nav.z0) / nav.cell); }
export function cellIndex(nav, x, z) {
  const ix = cellX(nav, x), iz = cellZ(nav, z);
  if (ix < 0 || iz < 0 || ix >= nav.nx || iz >= nav.nz) return -1;
  return iz * nav.nx + ix;
}
export function cellCenter(nav, i, out = { x: 0, y: 0, z: 0 }) {
  const ix = i % nav.nx, iz = (i / nav.nx) | 0;
  out.x = nav.x0 + (ix + 0.5) * nav.cell;
  out.z = nav.z0 + (iz + 0.5) * nav.cell;
  out.y = nav.h[i];
  return out;
}
export function walkableAt(nav, x, z) {
  const i = cellIndex(nav, x, z);
  return i >= 0 && nav.walk[i] === 1;
}
export function heightAt(nav, x, z, fallback = 0) {
  const i = cellIndex(nav, x, z);
  return i >= 0 && nav.walk[i] ? nav.h[i] : fallback;
}

// Spiral outward for somewhere a body could actually be. Used to snap spawns,
// goals and cover points onto the graph — a goal in the middle of a wall would
// otherwise burn a whole search budget proving itself unreachable.
export function nearestWalkable(nav, x, z, maxR = 6, refY = null) {
  const i0 = cellIndex(nav, x, z);
  if (i0 >= 0 && nav.walk[i0] && (refY == null || Math.abs(nav.h[i0] - refY) < 2.5)) return i0;
  const rings = Math.max(1, Math.ceil(maxR / nav.cell));
  const cx = cellX(nav, x), cz = cellZ(nav, z);
  let best = -1, bestD = Infinity;
  for (let r = 1; r <= rings; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = cx + dx, iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= nav.nx || iz >= nav.nz) continue;
        const i = iz * nav.nx + ix;
        if (!nav.walk[i]) continue;
        if (refY != null && Math.abs(nav.h[i] - refY) > 2.5) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    if (best >= 0) return best;
  }
  return best;
}

// ── traversability between two arbitrary points ──────────────────────────────

const _a = { x: 0, y: 0, z: 0 }, _b = { x: 0, y: 0, z: 0 };

// The string-pulling predicate. Samples the corridor between two points at half
// a cell, three lanes wide, and requires every sample to be walkable and within
// a step of the interpolated floor; then one line-of-sight ray at chest height
// as a veto for anything the coarse grid rounded away. Conservative on ramps —
// it can reject a shortcut that was fine — which costs a slightly less elegant
// path and never a body walking through a wall.
export function navClear(nav, world, ax, az, ay, bx, bz, by) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return true;
  const ux = dx / len, uz = dz / len;
  const px = -uz * NAV_AGENT_R, pz = ux * NAV_AGENT_R;
  const steps = Math.max(1, Math.ceil(len / (nav.cell * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = ax + dx * t, z = az + dz * t;
    const hy = ay + (by - ay) * t;
    for (let lane = -1; lane <= 1; lane++) {
      const i = cellIndex(nav, x + px * lane, z + pz * lane);
      if (i < 0 || !nav.walk[i]) return false;
      if (Math.abs(nav.h[i] - hy) > NAV_STEP + 0.25) return false;
    }
  }
  _a.x = ax; _a.y = ay + 0.9; _a.z = az;
  _b.x = bx; _b.y = by + 0.9; _b.z = bz;
  return lineOfSight(world, _a, _b, 0.05);
}

// ── binary heap ──────────────────────────────────────────────────────────────

function heap() { return { i: [], f: [], g: [], n: 0 }; }

function heapPush(H, idx, f, g) {
  let k = H.n++;
  H.i[k] = idx; H.f[k] = f; H.g[k] = g;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (H.f[p] <= H.f[k]) break;
    swap(H, p, k); k = p;
  }
}

function heapPop(H, out) {
  if (H.n === 0) return false;
  out.i = H.i[0]; out.f = H.f[0]; out.g = H.g[0];
  H.n--;
  if (H.n > 0) {
    H.i[0] = H.i[H.n]; H.f[0] = H.f[H.n]; H.g[0] = H.g[H.n];
    let k = 0;
    for (;;) {
      const l = k * 2 + 1, r = l + 1;
      let m = k;
      if (l < H.n && H.f[l] < H.f[m]) m = l;
      if (r < H.n && H.f[r] < H.f[m]) m = r;
      if (m === k) break;
      swap(H, m, k); k = m;
    }
  }
  return true;
}

function swap(H, a, b) {
  let t = H.i[a]; H.i[a] = H.i[b]; H.i[b] = t;
  t = H.f[a]; H.f[a] = H.f[b]; H.f[b] = t;
  t = H.g[a]; H.g[a] = H.g[b]; H.g[b] = t;
}

// ── incremental A* ───────────────────────────────────────────────────────────

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const _pop = { i: 0, f: 0, g: 0 };

function octile(nav, a, b) {
  const ax = a % nav.nx, az = (a / nav.nx) | 0;
  const bx = b % nav.nx, bz = (b / nav.nx) | 0;
  const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
  return (dx + dz - 0.58578644 * Math.min(dx, dz)) * nav.cell;
}

/**
 * Queue a path. Returns a request handle whose `status` goes
 * 'pending' → 'done' | 'partial' | 'failed'. `partial` means the search ran out
 * of budget and the path leads to the closest node it reached, which is a far
 * better answer for an enemy than standing still and admitting defeat.
 */
export function requestPath(nav, from, to, opts = {}) {
  const req = {
    id: ++nav.seq,
    owner: opts.owner || null,
    status: 'pending',
    path: null,
    expansions: 0,
    maxNodes: opts.maxNodes || NAV_MAX_EXPANSIONS,
    from: { x: from.x, y: from.y, z: from.z },
    to: { x: to.x, y: to.y, z: to.z },
    si: -1, gi: -1,
    heap: null, g: null, came: null,
    best: -1, bestH: Infinity,
    smooth: opts.smooth !== false,
  };
  nav.requests++;
  nav.queue.push(req);
  return req;
}

export function cancelPath(nav, req) {
  if (!req || req.status !== 'pending') return;
  req.status = 'cancelled';
  const k = nav.queue.indexOf(req);
  if (k >= 0) nav.queue.splice(k, 1);
}

/**
 * Spend up to `budget` node expansions across every pending request, oldest
 * first. Call once per simulation tick.
 */
export function stepPaths(nav, world, budget) {
  let left = budget;
  while (left > 0 && nav.queue.length) {
    const req = nav.queue[0];
    if (req.status !== 'pending') { nav.queue.shift(); continue; }
    if (!req.heap) {
      if (!initRequest(nav, req)) { nav.queue.shift(); continue; }
      if (req.status !== 'pending') { nav.queue.shift(); continue; }
    }
    const used = expand(nav, world, req, left);
    left -= used;
    nav.expansions += used;
    if (req.status !== 'pending') nav.queue.shift();
    else if (used === 0) break;   // budget exhausted mid-request
  }
  return budget - left;
}

function initRequest(nav, req) {
  req.si = nearestWalkable(nav, req.from.x, req.from.z, 4, req.from.y);
  req.gi = nearestWalkable(nav, req.to.x, req.to.z, 6, req.to.y);
  if (req.si < 0 || req.gi < 0) { req.status = 'failed'; nav.failed++; return true; }
  if (req.si === req.gi) {
    req.path = [{ x: req.from.x, y: nav.h[req.si], z: req.from.z },
                { x: req.to.x, y: nav.h[req.gi], z: req.to.z }];
    req.status = 'done'; nav.solved++;
    return true;
  }
  req.heap = heap();
  req.g = new Map();
  req.came = new Map();
  req.g.set(req.si, 0);
  heapPush(req.heap, req.si, octile(nav, req.si, req.gi), 0);
  req.best = req.si; req.bestH = octile(nav, req.si, req.gi);
  return true;
}

function expand(nav, world, req, budget) {
  const nx = nav.nx, nz = nav.nz, cell = nav.cell;
  let used = 0;
  while (used < budget) {
    if (!heapPop(req.heap, _pop)) { finish(nav, world, req, false); return used; }
    const cur = _pop.i, curG = _pop.g;
    const known = req.g.get(cur);
    if (known !== undefined && curG > known + 1e-6) continue;   // stale heap entry
    if (cur === req.gi) { finish(nav, world, req, true); return used; }
    used++;
    req.expansions++;
    if (req.expansions >= req.maxNodes) { finish(nav, world, req, false); return used; }

    const cx = cur % nx, cz = (cur / nx) | 0;
    const ch = nav.h[cur];
    for (let d = 0; d < 8; d++) {
      const ix = cx + DX[d], iz = cz + DZ[d];
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
      const ni = iz * nx + ix;
      if (!nav.walk[ni]) continue;
      const dh = nav.h[ni] - ch;
      if (Math.abs(dh) > NAV_STEP) continue;
      if (d >= 4) {
        // No corner cutting: a diagonal is only legal if both of the orthogonal
        // cells it squeezes past are open. Without this, enemies clip the inside
        // corner of every doorway and shoulder-check the frame.
        const oa = cz * nx + ix, ob = iz * nx + cx;
        if (!nav.walk[oa] || !nav.walk[ob]) continue;
      }
      // Climbing costs more than walking, so a route round a crate beats a route
      // over it when both are open.
      const step = (d >= 4 ? 1.41421356 : 1) * cell + Math.abs(dh) * 1.6;
      const ng = curG + step;
      const prev = req.g.get(ni);
      if (prev !== undefined && ng >= prev - 1e-6) continue;
      req.g.set(ni, ng);
      req.came.set(ni, cur);
      const h = octile(nav, ni, req.gi);
      if (h < req.bestH) { req.bestH = h; req.best = ni; }
      heapPush(req.heap, ni, ng + h * 1.05, ng);   // mild weight: 5% longer, far fewer nodes
    }
  }
  return used;
}

function finish(nav, world, req, reachedGoal) {
  const end = reachedGoal ? req.gi : req.best;
  if (end < 0 || (!reachedGoal && end === req.si)) {
    req.status = 'failed'; req.path = null; nav.failed++;
    req.heap = null; req.g = null; req.came = null;
    return;
  }
  const chain = [];
  let cur = end, guard = 0;
  while (cur !== undefined && guard++ < 100000) {
    chain.push(cur);
    if (cur === req.si) break;
    cur = req.came.get(cur);
  }
  chain.reverse();

  const pts = [];
  for (let k = 0; k < chain.length; k++) pts.push(cellCenter(nav, chain[k]));
  // Snap the ends to the real request so an agent does not walk to the middle of
  // its own cell before setting off.
  if (pts.length) {
    pts[0] = { x: req.from.x, y: nav.h[req.si], z: req.from.z };
    if (reachedGoal) pts[pts.length - 1] = { x: req.to.x, y: nav.h[req.gi], z: req.to.z };
  }
  req.path = req.smooth ? smoothPath(nav, world, pts) : pts;
  req.status = reachedGoal ? 'done' : 'partial';
  nav.solved++;
  req.heap = null; req.g = null; req.came = null;
}

/**
 * String-pulling. A raw grid path is a staircase; walking it looks like a
 * pathfinder moving a token. Greedily skip every waypoint the agent can reach
 * directly and what is left is the line a person would have walked.
 */
export function smoothPath(nav, world, pts) {
  if (!pts || pts.length <= 2) return pts;
  const out = [pts[0]];
  let anchor = 0;
  while (anchor < pts.length - 1) {
    let next = anchor + 1;
    for (let j = pts.length - 1; j > anchor + 1; j--) {
      const a = pts[anchor], b = pts[j];
      if (navClear(nav, world, a.x, a.z, a.y, b.x, b.z, b.y)) { next = j; break; }
    }
    out.push(pts[next]);
    anchor = next;
  }
  return out;
}

/**
 * Blocking search, for tests and for the rare case a caller genuinely cannot
 * wait. Same solver, run to completion.
 */
export function findPath(nav, world, from, to, opts = {}) {
  const req = requestPath(nav, from, to, opts);
  let guard = 0;
  while (req.status === 'pending' && guard++ < 200) stepPaths(nav, world, 2000);
  const k = nav.queue.indexOf(req);
  if (k >= 0) nav.queue.splice(k, 1);
  return req;
}
