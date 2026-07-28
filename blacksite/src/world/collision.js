// Collision against an axis-aligned box soup.
//
// The level is authored as boxes, so this is all that is needed: a uniform grid
// for broadphase, a vertical-cylinder-vs-box resolver for characters, and a DDA
// raycast for bullets, line-of-sight and ground probes. Pure data in, pure data
// out — no Three.js, no DOM — so the headless suite drives it directly.
//
// Characters are resolved as a vertical cylinder rather than a true capsule.
// With a 1/120 s step nothing moves more than ~6 cm per tick, so discrete
// depenetration never tunnels, and a cylinder gives the flat-footed, predictable
// feel a shooter wants — a real capsule slides off the top edge of low cover.

import { SURFACE, STEP_HEIGHT } from '../core/constants.js';

export const CELL = 4;   // metres per broadphase cell

export function makeBox(min, max, surface = SURFACE.CONCRETE, opts = {}) {
  return {
    min: { x: Math.min(min.x, max.x), y: Math.min(min.y, max.y), z: Math.min(min.z, max.z) },
    max: { x: Math.max(min.x, max.x), y: Math.max(min.y, max.y), z: Math.max(min.z, max.z) },
    surface,
    // `thickness` is what a bullet has to chew through; it defaults to the
    // box's own smallest dimension, which is right for walls and slabs but
    // wrong for a solid pillar you should not be able to shoot through, hence
    // the override.
    thickness: opts.thickness != null ? opts.thickness
      : Math.min(max.x - min.x, max.y - min.y, max.z - min.z) * 100,
    solid: opts.solid !== false,      // false = bullets pass, bodies do not (railings, mesh)
    blocksSight: opts.blocksSight !== false,
    tag: opts.tag || '',
  };
}

export function boxFromCenter(cx, cy, cz, sx, sy, sz, surface, opts) {
  return makeBox(
    { x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2 },
    { x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2 },
    surface, opts,
  );
}

// ── broadphase ───────────────────────────────────────────────────────────────

export function buildGrid(statics, cell = CELL) {
  const grid = { cell, map: new Map(), bounds: null };
  if (!statics.length) return grid;
  const b = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
  for (const s of statics) {
    b.min.x = Math.min(b.min.x, s.min.x); b.max.x = Math.max(b.max.x, s.max.x);
    b.min.y = Math.min(b.min.y, s.min.y); b.max.y = Math.max(b.max.y, s.max.y);
    b.min.z = Math.min(b.min.z, s.min.z); b.max.z = Math.max(b.max.z, s.max.z);
  }
  grid.bounds = b;
  // The grid is 2D (XZ). Levels are wide and short, so a third axis would only
  // add empty cells and pointer chasing.
  for (let i = 0; i < statics.length; i++) {
    const s = statics[i];
    const x0 = Math.floor(s.min.x / cell), x1 = Math.floor(s.max.x / cell);
    const z0 = Math.floor(s.min.z / cell), z1 = Math.floor(s.max.z / cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = x * 73856093 ^ z * 19349663;
        let list = grid.map.get(k);
        if (!list) grid.map.set(k, list = []);
        list.push(s);
      }
    }
  }
  return grid;
}

export function queryAABB(grid, min, max, out = []) {
  out.length = 0;
  if (!grid || !grid.map.size) return out;
  const c = grid.cell;
  const x0 = Math.floor(min.x / c), x1 = Math.floor(max.x / c);
  const z0 = Math.floor(min.z / c), z1 = Math.floor(max.z / c);
  const seen = new Set();
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const list = grid.map.get(x * 73856093 ^ z * 19349663);
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (seen.has(s)) continue;
        seen.add(s);
        if (s.max.x < min.x || s.min.x > max.x) continue;
        if (s.max.y < min.y || s.min.y > max.y) continue;
        if (s.max.z < min.z || s.min.z > max.z) continue;
        out.push(s);
      }
    }
  }
  return out;
}

// ── raycast ──────────────────────────────────────────────────────────────────

// Slab test. Returns entry/exit distance along a normalised ray, or null.
export function rayBox(ox, oy, oz, dx, dy, dz, box) {
  let tmin = -Infinity, tmax = Infinity, nAxis = 0, nSign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const bmin = [box.min.x, box.min.y, box.min.z];
  const bmax = [box.max.x, box.max.y, box.max.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < bmin[a] || o[a] > bmax[a]) return null;
      continue;
    }
    const inv = 1 / d[a];
    let t1 = (bmin[a] - o[a]) * inv, t2 = (bmax[a] - o[a]) * inv;
    let sign = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { tmin, tmax, axis: nAxis, sign: nSign };
}

// Walks the broadphase grid in ray order so a shot down a long corridor tests a
// handful of boxes instead of the whole level. `filter` can reject a box (used
// to let bullets through railings that still stop bodies).
export function raycast(world, origin, dir, maxDist = 500, filter = null) {
  const statics = world.statics;
  const grid = world.grid;
  const dx = dir.x, dy = dir.y, dz = dir.z;
  let best = null;

  const consider = (s) => {
    if (filter && !filter(s)) return;
    const r = rayBox(origin.x, origin.y, origin.z, dx, dy, dz, s);
    if (!r) return;
    const t = r.tmin >= 0 ? r.tmin : 0;
    if (t > maxDist) return;
    if (best && t >= best.t) return;
    best = { t, box: s, axis: r.axis, sign: r.sign, exit: r.tmax };
  };

  if (!grid || !grid.map.size) {
    for (let i = 0; i < statics.length; i++) consider(statics[i]);
  } else {
    const c = grid.cell;
    let cx = Math.floor(origin.x / c), cz = Math.floor(origin.z / c);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) < 1e-9 ? Infinity : Math.abs(c / dx);
    const tDeltaZ = Math.abs(dz) < 1e-9 ? Infinity : Math.abs(c / dz);
    let tMaxX = Math.abs(dx) < 1e-9 ? Infinity
      : (((dx > 0 ? cx + 1 : cx) * c) - origin.x) / dx;
    let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity
      : (((dz > 0 ? cz + 1 : cz) * c) - origin.z) / dz;
    const seen = new Set();
    let travelled = 0, guard = 0;
    while (travelled <= maxDist && guard++ < 4096) {
      const list = grid.map.get(cx * 73856093 ^ cz * 19349663);
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (seen.has(s)) continue;
          seen.add(s);
          consider(s);
        }
      }
      // Stop as soon as the nearest hit is provably closer than anything the
      // remaining cells could contain.
      if (best && best.t < travelled) break;
      if (tMaxX < tMaxZ) { travelled = tMaxX; cx += stepX; tMaxX += tDeltaX; }
      else { travelled = tMaxZ; cz += stepZ; tMaxZ += tDeltaZ; }
      if (!Number.isFinite(travelled)) break;
    }
  }

  if (!best) return null;
  const n = { x: 0, y: 0, z: 0 };
  if (best.axis === 0) n.x = best.sign; else if (best.axis === 1) n.y = best.sign; else n.z = best.sign;
  return {
    t: best.t,
    point: { x: origin.x + dx * best.t, y: origin.y + dy * best.t, z: origin.z + dz * best.t },
    normal: n,
    surface: best.box.surface,
    box: best.box,
    exit: best.exit,
  };
}

export function lineOfSight(world, from, to, pad = 0) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const hit = raycast(world, from, { x: dx / len, y: dy / len, z: dz / len }, len - pad,
    (s) => s.blocksSight);
  return !hit;
}

// ── character movement ───────────────────────────────────────────────────────

const _q = [];

// Depenetrates a vertical cylinder from every overlapping box, resolving along
// whichever axis has the least overlap. Returns what it touched so the caller
// can tell "landed" from "hit a wall".
function resolve(world, pos, radius, height, res) {
  res.ground = false; res.ceiling = false; res.wall = false;
  res.groundY = -Infinity; res.surface = SURFACE.CONCRETE;
  res.normal.x = 0; res.normal.y = 1; res.normal.z = 0;

  for (let iter = 0; iter < 4; iter++) {
    const feet = pos.y, top = pos.y + height;
    queryAABB(world.grid,
      { x: pos.x - radius, y: feet, z: pos.z - radius },
      { x: pos.x + radius, y: top, z: pos.z + radius }, _q);
    let moved = false;

    for (let i = 0; i < _q.length; i++) {
      const b = _q[i];
      // Closest point on the box footprint to the cylinder axis.
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      let ddx = pos.x - cx, ddz = pos.z - cz;
      let d2 = ddx * ddx + ddz * ddz;
      const inside = d2 < 1e-12;
      const d = inside ? 0 : Math.sqrt(d2);
      const xzPen = radius - d;
      if (xzPen <= 0) continue;

      const yPenUp = (b.max.y - feet);        // push the body up out of the top
      const yPenDown = (top - b.min.y);       // push the body down out of the bottom
      if (yPenUp <= 0 || yPenDown <= 0) continue;

      // Landing on top wins whenever the vertical overlap is the shallow one,
      // and also whenever it is inside step height — otherwise walking onto a
      // kerb shoves you sideways instead of up it.
      const vertical = Math.min(yPenUp, yPenDown);
      if (yPenUp <= yPenDown && (yPenUp <= xzPen || yPenUp <= STEP_HEIGHT)) {
        pos.y = b.max.y;
        res.ground = true; moved = true;
        if (b.max.y > res.groundY) { res.groundY = b.max.y; res.surface = b.surface; }
        continue;
      }
      if (yPenDown < yPenUp && yPenDown <= xzPen) {
        pos.y = b.min.y - height;
        res.ceiling = true; moved = true;
        continue;
      }
      // Otherwise it is a wall: push out along the shortest horizontal escape.
      if (inside) {
        // Dead centre of the footprint — pick the nearest face.
        const ex = Math.min(pos.x - b.min.x, b.max.x - pos.x);
        const ez = Math.min(pos.z - b.min.z, b.max.z - pos.z);
        if (ex < ez) { ddx = pos.x - (b.min.x + b.max.x) / 2 >= 0 ? 1 : -1; ddz = 0; }
        else { ddz = pos.z - (b.min.z + b.max.z) / 2 >= 0 ? 1 : -1; ddx = 0; }
      } else { ddx /= d; ddz /= d; }
      pos.x += ddx * xzPen; pos.z += ddz * xzPen;
      res.wall = true; moved = true;
      res.normal.x = ddx; res.normal.y = 0; res.normal.z = ddz;
      void vertical;
    }
    if (!moved) break;
  }
  return res;
}

const _res = { ground: false, ceiling: false, wall: false, groundY: 0, surface: 0, normal: { x: 0, y: 1, z: 0 } };

// Moves a cylinder by `delta`, sliding along whatever it hits. Axis-separated so
// a wall on X does not kill Z motion — the difference between sliding along a
// corridor and sticking to it.
export function moveCharacter(world, pos, delta, radius, height, out = {}) {
  out.ground = false; out.wall = false; out.ceiling = false;
  out.surface = SURFACE.CONCRETE;
  out.wallNormal = out.wallNormal || { x: 0, y: 0, z: 0 };

  // Y first, so landing is resolved before the horizontal slide reads `grounded`.
  if (delta.y !== 0) {
    pos.y += delta.y;
    resolve(world, pos, radius, height, _res);
    if (_res.ground) { out.ground = true; out.surface = _res.surface; }
    if (_res.ceiling) out.ceiling = true;
  }

  const beforeY = pos.y;
  if (delta.x !== 0 || delta.z !== 0) {
    pos.x += delta.x; pos.z += delta.z;
    resolve(world, pos, radius, height, _res);
    if (_res.wall) {
      out.wall = true;
      out.wallNormal.x = _res.normal.x; out.wallNormal.y = 0; out.wallNormal.z = _res.normal.z;
    }
    if (_res.ground) { out.ground = true; out.surface = _res.surface; }
    // The resolver may have stepped us up onto a kerb; anything taller than a
    // step is a wall we should not have climbed, so give the height back.
    if (pos.y - beforeY > STEP_HEIGHT + 1e-4) pos.y = beforeY;
  }

  // A final settle pass catches the corner case where the X and Z pushes
  // between them put us back inside a third box.
  resolve(world, pos, radius, height, _res);
  if (_res.ground) { out.ground = true; out.surface = _res.surface; }
  return out;
}

// Distance to the floor under a point, up to `maxDrop`. Used for coyote time,
// for AI ledge checks and for placing corpses and decals.
export function groundBelow(world, x, y, z, maxDrop = 6) {
  const hit = raycast(world, { x, y: y + 0.05, z }, { x: 0, y: -1, z: 0 }, maxDrop + 0.05);
  return hit ? { y: hit.point.y, surface: hit.surface, dist: hit.t - 0.05 } : null;
}
