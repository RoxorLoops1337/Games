// Paths: placement, neighbor connectivity, A* pathfinding.
import { tile, tileAvgHeight, tileMaxHeight } from './world.js';

export const PATH_FOOT = 'foot';
export const PATH_QUEUE = 'queue';

export function canPlacePath(terrain, tx, ty) {
  const t = tile(terrain, tx, ty);
  if (!t) return false;
  if (t.water) return false;
  if (t.ride) return false;
  if (t.scenery) return false;
  if (t.path) return false; // already a path
  return true;
}

export function placePath(terrain, tx, ty, type) {
  if (!canPlacePath(terrain, tx, ty)) return false;
  const t = tile(terrain, tx, ty);
  t.path = { type, height: Math.round(tileAvgHeight(t)) };
  return true;
}

export function removePath(terrain, tx, ty) {
  const t = tile(terrain, tx, ty);
  if (!t || !t.path) return false;
  t.path = null;
  return true;
}

// Walkable neighbors of a path tile. Steps in 4 cardinal directions; height delta must be <= 2.
// Also allows stepping onto ride entrances (terminal nodes for pathfinding into a ride queue/entrance).
const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export function pathNeighbors(terrain, tx, ty) {
  const out = [];
  const t = tile(terrain, tx, ty);
  if (!t || !t.path) return out;
  for (const d of DIRS) {
    const nx = tx + d.dx, ny = ty + d.dy;
    const nt = tile(terrain, nx, ny);
    if (!nt) continue;
    if (nt.path) {
      // can step between adjacent paths only if height differs by <= 2
      if (Math.abs(nt.path.height - t.path.height) <= 2) out.push({ tx: nx, ty: ny, kind: 'path' });
    } else if (nt.rideEntrance != null && Math.abs(Math.round(tileAvgHeight(nt)) - t.path.height) <= 2) {
      out.push({ tx: nx, ty: ny, kind: 'entrance', rideId: nt.rideEntrance });
    } else if (nt.rideExit != null && Math.abs(Math.round(tileAvgHeight(nt)) - t.path.height) <= 2) {
      out.push({ tx: nx, ty: ny, kind: 'exit', rideId: nt.rideExit });
    }
  }
  return out;
}

// A* pathfinding on the path graph. Returns array of {tx,ty} or null.
// Goals: a Set of "tx,ty" keys representing acceptable destinations.
export function findPath(terrain, fromTx, fromTy, goalSet, opts = {}) {
  const maxNodes = opts.maxNodes || 4000;
  const start = `${fromTx},${fromTy}`;
  if (goalSet.has(start)) return [{ tx: fromTx, ty: fromTy }];
  const open = new Map();    // key -> {f}
  const came = new Map();    // key -> prevKey
  const g = new Map();
  g.set(start, 0);
  open.set(start, 0);
  let expanded = 0;
  // Heuristic: minimum manhattan distance to any goal
  const goals = [];
  for (const k of goalSet) {
    const [gx, gy] = k.split(',').map(Number);
    goals.push([gx, gy]);
  }
  function h(tx, ty) {
    let best = Infinity;
    for (const [gx, gy] of goals) {
      const d = Math.abs(gx - tx) + Math.abs(gy - ty);
      if (d < best) best = d;
    }
    return best;
  }
  while (open.size) {
    // pop lowest f
    let bestKey = null, bestF = Infinity;
    for (const [k, f] of open) {
      if (f < bestF) { bestF = f; bestKey = k; }
    }
    if (!bestKey) break;
    open.delete(bestKey);
    if (goalSet.has(bestKey)) {
      // reconstruct
      const out = [];
      let cur = bestKey;
      while (cur) {
        const [cx, cy] = cur.split(',').map(Number);
        out.unshift({ tx: cx, ty: cy });
        cur = came.get(cur);
      }
      return out;
    }
    expanded++;
    if (expanded > maxNodes) break;
    const [cx, cy] = bestKey.split(',').map(Number);
    const ct = tile(terrain, cx, cy);
    if (!ct || !ct.path) continue;
    const neighbors = pathNeighbors(terrain, cx, cy);
    for (const n of neighbors) {
      const nk = `${n.tx},${n.ty}`;
      // queue paths are higher cost when not destination (peeps avoid queues)
      const nt = tile(terrain, n.tx, n.ty);
      let stepCost = 1;
      if (nt.path && nt.path.type === PATH_QUEUE && !goalSet.has(nk)) stepCost = 5;
      if (nt.litter > 100) stepCost += 0.2;
      const tentative = (g.get(bestKey) ?? Infinity) + stepCost;
      if (tentative < (g.get(nk) ?? Infinity)) {
        g.set(nk, tentative);
        came.set(nk, bestKey);
        open.set(nk, tentative + h(n.tx, n.ty));
      }
    }
  }
  return null;
}

// Find nearest tile of any kind matching predicate, BFS over path graph from start.
export function nearestPath(terrain, fromTx, fromTy, predicate, maxNodes = 1000) {
  const start = `${fromTx},${fromTy}`;
  const visited = new Set([start]);
  const q = [{ tx: fromTx, ty: fromTy }];
  let expanded = 0;
  while (q.length && expanded < maxNodes) {
    const cur = q.shift();
    expanded++;
    const t = tile(terrain, cur.tx, cur.ty);
    if (t && predicate(t, cur.tx, cur.ty)) return cur;
    for (const n of pathNeighbors(terrain, cur.tx, cur.ty)) {
      const k = `${n.tx},${n.ty}`;
      if (visited.has(k)) continue;
      visited.add(k);
      q.push({ tx: n.tx, ty: n.ty });
    }
  }
  return null;
}

// Compute the connection-mask sprite key for a path: 4 bits NESW indicating connected sides.
export function pathConnections(terrain, tx, ty) {
  const t = tile(terrain, tx, ty);
  if (!t || !t.path) return 0;
  let mask = 0;
  const dirs = [
    { dx: 0, dy: -1, bit: 1 },
    { dx: 1, dy: 0, bit: 2 },
    { dx: 0, dy: 1, bit: 4 },
    { dx: -1, dy: 0, bit: 8 },
  ];
  for (const d of dirs) {
    const n = tile(terrain, tx + d.dx, ty + d.dy);
    if (!n) continue;
    if (n.path && Math.abs(n.path.height - t.path.height) <= 2) mask |= d.bit;
    else if (n.rideEntrance != null || n.rideExit != null) mask |= d.bit;
  }
  return mask;
}
