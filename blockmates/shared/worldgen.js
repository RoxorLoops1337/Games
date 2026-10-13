// Deterministic terrain. Everything is a pure function of (seed, x, y), so any chunk can be rebuilt on its own.
import { W, H, CHUNK, SEA, B, L_WATER, L_LAVA } from './data.js';

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function hash2(seed, x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function makeNoise(seed) {
  const n1 = (x) => {
    const xi = Math.floor(x), f = smooth(x - xi);
    return lerp(hash2(seed, xi, 7), hash2(seed, xi + 1, 7), f);
  };
  const n2 = (x, y, salt = 0) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = smooth(x - xi), fy = smooth(y - yi);
    const s = seed + salt * 977;
    const a = hash2(s, xi, yi), b = hash2(s, xi + 1, yi), c = hash2(s, xi, yi + 1), d = hash2(s, xi + 1, yi + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };
  return { n1, n2 };
}

export const BIOMES = ['tundra', 'forest', 'plains', 'desert', 'mountains'];

export class Terrain {
  constructor(seed) {
    this.seed = seed | 0;
    this.noise = makeNoise(this.seed);
    this.hcache = new Int16Array(W).fill(-1);
  }

  // continuous biome value in 0..1 drifting across the world
  biomeValue(x) {
    const { n1 } = this.noise;
    return n1(x / 150 + 3.3) * 0.75 + n1(x / 47) * 0.25;
  }
  biomeAt(x) {
    const v = this.biomeValue(x);
    if (v < 0.30) return 'tundra';
    if (v < 0.46) return 'forest';
    if (v < 0.60) return 'plains';
    if (v < 0.74) return 'desert';
    return 'mountains';
  }

  // first row of solid ground at column x (rows above are air or water)
  surface(x) {
    x = Math.max(0, Math.min(W - 1, x | 0));
    const c = this.hcache[x];
    if (c >= 0) return c;
    const { n1 } = this.noise;
    const bv = this.biomeValue(x);
    const mount = Math.max(0, bv - 0.68) * 5.5; // 0..1+
    let h = SEA - 3 + (n1(x / 90 + 11) - 0.5) * 16 + (n1(x / 37 + 5) - 0.5) * 9 + (n1(x / 13.7 + 2) - 0.5) * 4.4 + (n1(x / 5.3 + 7) - 0.5) * 1.6;
    h -= mount * (18 + n1(x / 31 + 9) * 26);
    if (bv < 0.30) h -= 2;
    const edge = smooth(Math.min(1, Math.min(x, W - 1 - x) / 90));
    h = lerp(SEA + 24, h, edge);
    const r = Math.max(8, Math.min(H - 60, Math.floor(h)));
    this.hcache[x] = r;
    return r;
  }

  isCave(x, y, surf) {
    const { n2 } = this.noise;
    const depth = y - surf;
    if (depth < 5) return false;
    // worm tunnels: ridged noise, thinner near the surface
    const a = Math.abs(n2(x / 17, y / 12, 1) - 0.5);
    const b = Math.abs(n2(x / 17 + 40, y / 12 + 17, 2) - 0.5);
    const thr = 0.035 + Math.min(1, depth / 60) * 0.035;
    if (a * a + b * b < thr * thr * 1.1) return true;
    // big caverns
    const c = n2(x / 28, y / 20, 3) * 0.7 + n2(x / 9, y / 7, 4) * 0.3;
    return depth > 22 && c > 0.76;
  }

  lakeLevel(x) { return SEA + 14 + Math.floor(hash2(this.seed, Math.floor(x / 56), 91) * 46); }

  oreAt(x, y, surf) {
    const { n2 } = this.noise;
    const d = y - SEA;
    const v = (salt, f) => n2(x / f, y / f, salt);
    if (d > 4 && v(10, 4.5) > 0.84) return B.coal_ore;
    if (d > 14 && v(11, 4) > 0.87) return B.copper_ore;
    if (d > 16 && v(12, 4) > 0.88) return B.tin_ore;
    if (d > 36 && v(13, 3.6) > 0.89) return B.iron_ore;
    if (d > 62 && v(14, 3.4) > 0.915) return B.gold_ore;
    if (d > 92 && v(15, 3.2) > 0.935) return B.titanium_ore;
    if (d > 100 && v(16, 3) > 0.955) return B.sunstone_ore;
    if (d > 18 && v(17, 6) > 0.86) return B.clay;
    if (d > 6 && v(18, 6) > 0.84) return B.gravel;
    return 0;
  }

  // plant/tree decisions per column
  treeCell(cell) {
    const x0 = cell * 5;
    const off = 1 + Math.floor(hash2(this.seed, cell, 31) * 3);
    const x = x0 + off;
    if (x < 6 || x > W - 7) return null;
    const biome = this.biomeAt(x);
    const dens = { forest: 0.85, plains: 0.22, tundra: 0.3, desert: 0.0, mountains: 0.08 }[biome];
    if (hash2(this.seed, cell, 32) >= dens) return null;
    const s = this.surface(x);
    if (s >= SEA - 1) return null; // underwater or on the beach
    const hgt = 4 + Math.floor(hash2(this.seed, cell, 33) * 4);
    const big = hash2(this.seed, cell, 34) > 0.8;
    return { x, s, hgt, big, biome };
  }
  topBlock(x, s) {
    const biome = this.biomeAt(x);
    if (s >= SEA - 1) return B.sand;
    if (biome === 'desert') return B.sand;
    if (biome === 'tundra') return B.snow;
    if (biome === 'mountains' && s < SEA - 24) return B.snow;
    if (biome === 'mountains' && s < SEA - 14) return B.stone;
    return B.grass;
  }

  chunk(cx) {
    const fg = new Uint8Array(CHUNK * H), bg = new Uint8Array(CHUNK * H), liq = new Uint8Array(CHUNK * H);
    const x0 = cx * CHUNK;
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx;
      const s = this.surface(x);
      const top = this.topBlock(x, s);
      const biome = this.biomeAt(x);
      const lake = this.lakeLevel(x);
      const col = lx * H;
      for (let y = 0; y < H; y++) {
        const i = col + y;
        if (y < s) {
          if (y >= SEA) liq[i] = (L_WATER << 4) | 8;
          continue;
        }
        const depth = y - s;
        // wall layer
        bg[i] = depth < 6 + Math.floor(hash2(this.seed, x, 55) * 4) ? B.dirt : B.stone;
        if (y >= H - 1) { fg[i] = B.bedrock; continue; }
        if (y >= H - 3 && hash2(this.seed, x, y) < 0.7) { fg[i] = B.bedrock; continue; }
        if (this.isCave(x, y, s)) {
          if (y > H - 30) liq[i] = (L_LAVA << 4) | 8;
          else if (y >= lake && y < lake + 24 && depth > 14) liq[i] = (L_WATER << 4) | 8;
          continue;
        }
        let id;
        if (depth === 0) id = top;
        else if (depth < 4 + Math.floor(hash2(this.seed, x, 56) * 3)) {
          id = top === B.sand ? B.sand : (top === B.stone ? B.stone : B.dirt);
        } else {
          id = B.stone;
          if (biome === 'desert' && depth < 22) id = B.sandstone;
          const ore = this.oreAt(x, y, s);
          if (ore) id = ore;
          if (y > H - 22 && hash2(this.seed, x * 3 + 1, y) < 0.05) id = B.obsidian;
          else if (y > SEA + 60 && hash2(this.seed, x, y + 5000) < 0.0035) id = B.crystal;
        }
        if (top === B.snow && depth === 1 && id === B.dirt) id = B.dirt;
        fg[i] = id;
      }
    }
    // plants, trees, cacti
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx;
      const s = this.surface(x);
      if (s < 2 || s >= SEA - 1) continue;
      const g = fg[lx * H + s];
      const above = lx * H + s - 1;
      if (g === B.grass && fg[above] === 0) {
        const r = hash2(this.seed, x, 61);
        if (r < 0.16) fg[above] = B.tallgrass;
        else if (r < 0.19) fg[above] = B.flower_red;
        else if (r < 0.215) fg[above] = B.flower_yellow;
        else if (r < 0.225) fg[above] = B.mushroom;
      }
      if (this.biomeAt(x) === 'desert' && g === B.sand && hash2(this.seed, x, 41) < 0.05 && hash2(this.seed, x - 1, 41) >= 0.05) {
        const hh = 2 + Math.floor(hash2(this.seed, x, 42) * 3);
        for (let k = 1; k <= hh; k++) fg[lx * H + s - k] = B.cactus;
      }
    }
    const c0 = Math.floor((x0 - 4) / 5), c1 = Math.floor((x0 + CHUNK + 4) / 5);
    for (let c = c0; c <= c1; c++) {
      const t = this.treeCell(c);
      if (!t) continue;
      const put = (x, y, id, onlyAir) => {
        const lx = x - x0;
        if (lx < 0 || lx >= CHUNK || y < 0 || y >= H) return;
        const i = lx * H + y;
        if (onlyAir && fg[i] !== 0 && fg[i] !== B.tallgrass && fg[i] !== B.flower_red && fg[i] !== B.flower_yellow && fg[i] !== B.mushroom) return;
        fg[i] = id;
      };
      for (let k = 1; k <= t.hgt; k++) put(t.x, t.s - k, B.log, false);
      const ty = t.s - t.hgt;
      const rad = t.big ? 3 : 2;
      for (let dy = -rad; dy <= 1; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad + 1) continue;
          if (dx === 0 && dy >= 0) continue;
          put(t.x + dx, ty + dy, B.leaves, true);
        }
      }
      put(t.x, ty, B.log, false);
      if (t.big) { put(t.x - 1, t.s - 1, B.log, true); put(t.x + 1, t.s - 1, B.log, true); }
    }
    return { fg, bg, liq };
  }
}

export function spawnPoint(terrain) {
  const x = Math.floor(W / 2);
  // prefer a friendly biome on dry land, then anything on dry land
  for (const pass of [0, 1]) {
    for (let dx = 0; dx < 500; dx++) {
      for (const sx of [x + dx, x - dx]) {
        const s = terrain.surface(sx);
        if (s >= SEA - 3) continue;
        const b = terrain.biomeAt(sx);
        if (pass === 0 && b !== 'plains' && b !== 'forest') continue;
        // a few flat tiles wide so nobody spawns on a spike
        if (Math.abs(terrain.surface(sx - 2) - s) > 1 || Math.abs(terrain.surface(sx + 2) - s) > 1) continue;
        return { x: sx + 0.5, y: s - 0.01 };
      }
    }
  }
  return { x: x + 0.5, y: terrain.surface(x) - 0.01 };
}
