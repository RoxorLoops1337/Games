// World: isometric coords, terrain grid, paths, scenery.
// Coordinates:
//   Tile (tx, ty) integer.  World (x, y, z) — z in height units (1/8 tile).
//   Screen (sx, sy) — pixel coords on canvas relative to camera origin.
// Iso projection is 2:1 with rotation (4 cardinal rotations).

export const TILE_W = 64;          // base tile width in pixels at zoom 1
export const TILE_H = 32;          // base tile height
export const HEIGHT_UNIT = 4;      // pixels per height unit at zoom 1 (8 units/tile = 32px)
export const MAP_SIZE = 64;

// Surface / edge enums
export const SURFACE = { GRASS: 0, SAND: 1, DIRT: 2, ROCK: 3, MARTIAN: 4, ICE: 5 };
export const SURFACE_COLORS = ['#5cb154', '#e0c878', '#8a6a3a', '#7a7a82', '#c44a4a', '#e8f0ff'];
export const SURFACE_DARK   = ['#3f8a3a', '#b89858', '#5e4520', '#535360', '#9c2a2a', '#aac0d8'];

export function rot(rotation, tx, ty, size) {
  // returns rotated tile coords for rendering. 4 rotations.
  switch (rotation & 3) {
    case 0: return { tx, ty };
    case 1: return { tx: ty, ty: size - 1 - tx };
    case 2: return { tx: size - 1 - tx, ty: size - 1 - ty };
    case 3: return { tx: size - 1 - ty, ty: tx };
  }
}

export function tileToScreen(tx, ty, z, cam) {
  // iso projection — applies rotation by transforming tile coords.
  const s = cam.zoom;
  const size = cam.mapSize;
  const r = rot(cam.rotation, tx, ty, size);
  const wx = r.tx - r.ty;
  const wy = r.tx + r.ty;
  return {
    sx: wx * (TILE_W / 2) * s - cam.x,
    sy: wy * (TILE_H / 2) * s - z * HEIGHT_UNIT * s - cam.y,
  };
}

// Inverse: given a screen position, find approximate tile (ignoring slope; caller refines).
export function screenToTile(sx, sy, z, cam) {
  const s = cam.zoom;
  const size = cam.mapSize;
  const wx = (sx + cam.x) / ((TILE_W / 2) * s);
  const wy = (sy + cam.y + z * HEIGHT_UNIT * s) / ((TILE_H / 2) * s);
  const rtx = (wx + wy) / 2;
  const rty = (wy - wx) / 2;
  // un-rotate
  let tx, ty;
  switch (cam.rotation & 3) {
    case 0: tx = rtx; ty = rty; break;
    case 1: tx = size - 1 - rty; ty = rtx; break;
    case 2: tx = size - 1 - rtx; ty = size - 1 - rty; break;
    case 3: tx = rty; ty = size - 1 - rtx; break;
  }
  return { tx: Math.floor(tx), ty: Math.floor(ty) };
}

export function makeTerrain(size = MAP_SIZE) {
  const tiles = new Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      tiles[y * size + x] = {
        // four corner heights: N (top), E (right), S (bottom), W (left)
        hN: 2, hE: 2, hS: 2, hW: 2,
        surface: SURFACE.GRASS,
        water: 0,           // water height (0 = no water)
        owned: true,
        litter: 0,          // 0–255, accumulates
        mowed: 200,         // 0–255, decays
        watered: 200,       // 0–255, decays (gardens)
        path: null,         // {type:'foot'|'queue', height, queueRide?}
        scenery: null,      // {type, rot}
        ride: null,         // ride id occupying this tile (footprint)
        rideEntrance: null, // ride id with entrance here
        rideExit: null,     // ride id with exit here
      };
    }
  }
  return { size, tiles };
}

export function tile(terrain, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= terrain.size || ty >= terrain.size) return null;
  return terrain.tiles[ty * terrain.size + tx];
}

export function tileAvgHeight(t) {
  if (!t) return 0;
  return (t.hN + t.hE + t.hS + t.hW) / 4;
}

export function tileMaxHeight(t) {
  if (!t) return 0;
  return Math.max(t.hN, t.hE, t.hS, t.hW);
}

export function tileMinHeight(t) {
  if (!t) return 0;
  return Math.min(t.hN, t.hE, t.hS, t.hW);
}

export function isFlat(t) {
  return t && t.hN === t.hE && t.hE === t.hS && t.hS === t.hW;
}

// Validate that adjacent shared corners don't differ by more than 1.
// Adjust neighbors when raising/lowering to keep continuity.
const NEIGHBOR_CORNERS = [
  // edge name: tile-relative, neighbor-relative
  // North edge of (x,y) shares with South edge of (x, y-1):
  //   our hN, hE  <-> their hW, hS  (depends on layout; we use NESW ordering N=top E=right S=bottom W=left)
  // To keep it simple, share between cardinal neighbors:
  //   north neighbor (x, y-1): our hN==their hS; our hE==their hE? not quite. Standard RCT model:
  //   our N corner is shared with N-neighbor's S, our E corner is shared with E-neighbor's W (diagonals shared with diagonal neighbor).
];

// Simpler model: corners are conceptually at tile-corner positions. Each tile-corner is shared by up to 4 tiles.
// We'll store on each tile its 4 corners and use propagation: when raising tile (x,y)'s N corner, also adjust
// (x,y-1)'s S corner, (x-1,y-1)'s E corner, (x-1,y)'s ... wait need careful mapping.
// Convention used here: N = top (low ty), E = right (high tx), S = bottom (high ty), W = left (low tx).
// Corner N of tile (x,y) is the top corner shared with: tile(x, y-1).S, tile(x-1, y-1).E? No, top corner in iso is just shared between 2 tiles for an edge model.
// We'll use EDGE corners only (no diagonal sharing), and accept the limitation that diagonal slopes are visual approximations.
// Mapping:
//   tile(x,y).N == tile(x, y-1).S
//   tile(x,y).E == tile(x+1, y).W
//   tile(x,y).S == tile(x, y+1).N
//   tile(x,y).W == tile(x-1, y).E

function syncCorner(terrain, tx, ty, corner, val) {
  const t = tile(terrain, tx, ty);
  if (!t) return;
  t[corner] = val;
  switch (corner) {
    case 'hN': { const o = tile(terrain, tx, ty - 1); if (o) o.hS = val; break; }
    case 'hE': { const o = tile(terrain, tx + 1, ty); if (o) o.hW = val; break; }
    case 'hS': { const o = tile(terrain, tx, ty + 1); if (o) o.hN = val; break; }
    case 'hW': { const o = tile(terrain, tx - 1, ty); if (o) o.hE = val; break; }
  }
}

export function raiseCornerToward(terrain, tx, ty, corner, delta) {
  const t = tile(terrain, tx, ty);
  if (!t) return false;
  const cur = t[corner];
  const target = Math.max(0, Math.min(20, cur + delta));
  if (target === cur) return false;
  syncCorner(terrain, tx, ty, corner, target);
  // ensure shared corners stay within max 1 difference within the tile and with neighbors
  enforceSlopeRules(terrain, tx, ty);
  return true;
}

export function raiseTile(terrain, tx, ty, delta) {
  const t = tile(terrain, tx, ty);
  if (!t) return false;
  for (const c of ['hN', 'hE', 'hS', 'hW']) {
    syncCorner(terrain, tx, ty, c, Math.max(0, Math.min(20, t[c] + delta)));
  }
  enforceSlopeRules(terrain, tx, ty);
  return true;
}

export function levelTile(terrain, tx, ty, h) {
  const t = tile(terrain, tx, ty);
  if (!t) return;
  for (const c of ['hN', 'hE', 'hS', 'hW']) syncCorner(terrain, tx, ty, c, h);
  enforceSlopeRules(terrain, tx, ty);
}

function enforceSlopeRules(terrain, tx, ty) {
  // After modifying, the four corners of a tile should differ by at most 2 (RCT allows steep slopes).
  // Also recursively fix neighbors if their shared corner is now out of sync with their other corners.
  const queue = [[tx, ty]];
  const seen = new Set();
  const iter = (k) => { if (seen.has(k)) return false; seen.add(k); return true; };
  while (queue.length) {
    const [x, y] = queue.shift();
    if (!iter(`${x},${y}`)) continue;
    const t = tile(terrain, x, y);
    if (!t) continue;
    const minC = Math.min(t.hN, t.hE, t.hS, t.hW);
    // pull each corner up if it's >2 above the min — promotes neighbors too
    for (const c of ['hN', 'hE', 'hS', 'hW']) {
      if (t[c] > minC + 2) {
        const newMin = t[c] - 2;
        for (const o of ['hN', 'hE', 'hS', 'hW']) {
          if (t[o] < newMin) {
            syncCorner(terrain, x, y, o, newMin);
            // enqueue affected neighbor
            switch (o) {
              case 'hN': queue.push([x, y - 1]); break;
              case 'hE': queue.push([x + 1, y]); break;
              case 'hS': queue.push([x, y + 1]); break;
              case 'hW': queue.push([x - 1, y]); break;
            }
          }
        }
      }
    }
  }
}

// Initialize map with low rolling hills using cheap noise.
export function generateTerrain(terrain, seed = 1, options = {}) {
  const { water = true, hills = 0.8, baseHeight = 2 } = options;
  const size = terrain.size;
  // Simple value-noise: pick random heights at low-frequency lattice, then bilinear interpolate.
  function rand(x, y) {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 0xffffffff;
  }
  const step = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / step, fy = y / step;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const a = rand(ix, iy), b = rand(ix + 1, iy), c = rand(ix, iy + 1), d = rand(ix + 1, iy + 1);
      const top = a * (1 - tx) + b * tx;
      const bot = c * (1 - tx) + d * tx;
      const v = top * (1 - ty) + bot * ty;
      const h = Math.max(0, Math.min(12, Math.round(baseHeight + v * 6 * hills)));
      const t = terrain.tiles[y * size + x];
      t.hN = t.hE = t.hS = t.hW = h;
    }
  }
  // Run a couple of smoothing passes so adjacent corners line up at edges.
  for (let p = 0; p < 2; p++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = terrain.tiles[y * size + x];
        const n = tile(terrain, x, y - 1);
        const e = tile(terrain, x + 1, y);
        if (n) t.hN = Math.round((t.hN + n.hS) / 2);
        if (n) n.hS = t.hN;
        if (e) t.hE = Math.round((t.hE + e.hW) / 2);
        if (e) e.hW = t.hE;
      }
    }
  }
  // Random water in low areas, occasional sand near water.
  if (water) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = terrain.tiles[y * size + x];
        if (tileMaxHeight(t) <= 1) {
          t.water = 2;
          // sand around
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const n = tile(terrain, x + dx, y + dy);
            if (n && !n.water && Math.random() < 0.6) n.surface = SURFACE.SAND;
          }
        }
      }
    }
  }
  // Random surface patches
  for (let i = 0; i < 8; i++) {
    const cx = (Math.random() * size) | 0, cy = (Math.random() * size) | 0;
    const surf = Math.random() < 0.5 ? SURFACE.DIRT : SURFACE.SAND;
    const r = 3 + ((Math.random() * 4) | 0);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      const t = tile(terrain, x, y);
      if (t && !t.water && Math.hypot(x - cx, y - cy) <= r) t.surface = surf;
    }
  }
}

// Pick a likely entrance tile on the map edge with low elevation.
export function findEdgeEntrance(terrain) {
  const size = terrain.size;
  let best = null, bestH = 99;
  // sample bottom edge first
  for (let x = 5; x < size - 5; x++) {
    const t = tile(terrain, x, size - 2);
    if (!t || t.water) continue;
    const h = tileAvgHeight(t);
    if (h < bestH) { bestH = h; best = { tx: x, ty: size - 2 }; }
  }
  return best || { tx: size >> 1, ty: size - 2 };
}
