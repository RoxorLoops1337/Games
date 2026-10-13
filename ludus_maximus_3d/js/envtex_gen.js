// envtex_gen.js : the pure pixel generators behind envtex.js. NO three.js, NO DOM, so the same code runs on the main thread (fallback)
// and inside js/envtex_worker.js (normal path). One spec in, two byte buffers out:
//   color : w*h*4 RGBA (alpha 255), bump : w*h single channel. Rows are written BOTTOM-UP (row 0 = the last image row) so a DataTexture with flipY=false
//   shows exactly what a CanvasTexture (flipY=true) of the old canvas bake showed. Uint8ClampedArray on purpose: same rounding as ImageData.
// Bump version GEN_VERSION when ANY generator below changes its output: the IndexedDB cache in envtex.js is keyed by it.
export const GEN_VERSION = 3;   // 3: cache records carry a checksum and the spec key (integrity check); the generators themselves are unchanged since 2

function hash(ix, iy, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export { hash };
/** Tileable value noise. x,y in lattice units, `per` = lattice period (wraps). */
export function tnoise(x, y, per, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % per) + per) % per, x1 = (((xi + 1) % per) + per) % per, y0 = ((yi % per) + per) % per, y1 = (((yi + 1) % per) + per) % per;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function tfbm(x, y, per, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * tnoise(x * f, y * f, per * f, seed + i * 17); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** per-pixel bake into the two buffers. fn(u, v, px, py, res) fills res.c = [r,g,b] and res.h = 0..1 */
function bake(w, h, fn) {
  const color = new Uint8ClampedArray(w * h * 4), bump = new Uint8ClampedArray(w * h), res = {};
  for (let y = 0; y < h; y++) {
    const row = h - 1 - y;
    for (let x = 0; x < w; x++) {
      fn(x / w, y / h, x, y, res);
      const o = row * w + x, i = o * 4;
      color[i] = res.c[0]; color[i + 1] = res.c[1]; color[i + 2] = res.c[2]; color[i + 3] = 255;
      bump[o] = Math.max(0, Math.min(255, res.h * 255));
    }
  }
  return { w, h, color, bump };
}

const GEN = {
  /** Sun-baked raked sand: blotches, wind ripples, grain speckle. Tile = ~4 m. */
  sand({ size, seed }) {
    const A = hex(0xe6cfa2), B = hex(0xcdae7e), C = hex(0xf6e6c4), D = hex(0xa98a60);   // warm pale golden sand, low saturation
    return bake(size, size, (u, v, px, py, o) => {
      const big = tfbm(u * 4, v * 4, 4, 4, seed);
      const warp = tfbm(u * 8, v * 8, 8, 3, seed + 5);
      const rip = Math.sin((v * 22 + warp * 3.2) * Math.PI * 2 * 0.5 * 2) * 0.5 + 0.5; // 22 ripples, integer -> tiles
      const grain = hash(px, py, seed + 9);
      const fine = tfbm(u * 64, v * 64, 64, 2, seed + 2);
      let t = clamp01(big * 1.4 - 0.2);
      let c = mix3(A, B, t * 0.8);
      c = mix3(c, C, clamp01(rip * 0.16 + fine * 0.28 - 0.1));
      if (grain > 0.93) c = mix3(c, C, 0.5); else if (grain < 0.06) c = mix3(c, D, 0.45);
      o.c = c; o.h = 0.45 + rip * 0.07 + fine * 0.25 + (grain - 0.5) * 0.18;
    });
  },
  /** Travertine ashlar blocks. Tile covers bx x by blocks. Mortar is dark + recessed (its width is 3.2 px at 512, proportional below/above). */
  stone({ size, bx, by, base, tint, seed, mortar }) {
    const A = hex(base), T = hex(tint), M = hex(mortar), mw = 3.2 * (size / 512);
    return bake(size, size, (u, v, px, py, o) => {
      const row = Math.floor(v * by), off = (row % 2) * 0.5;
      const fu = ((u * bx + off) % 1 + 1) % 1, fv = (v * by) % 1;
      const col = Math.floor(u * bx + off);
      const id = hash(((col % bx) + bx) % bx, row, seed);
      const ex = Math.min(fu, 1 - fu) * (size / bx), ey = Math.min(fv, 1 - fv) * (size / by);
      const e = Math.min(ex, ey);
      const edge = clamp01(e / mw);                                      // 0 mortar -> 1 face
      const n1 = tfbm(u * 16, v * 16, 16, 4, seed);
      const n2 = tfbm(u * 64, v * 64, 64, 2, seed + 3);
      const pit = tnoise(u * 90, v * 90, 90, seed + 6) > 0.8 ? 1 : 0;
      let c = mix3(A, T, clamp01(id * 0.55 + n1 * 0.6 - 0.25));
      const sh = 0.86 + n2 * 0.22 - pit * 0.12 + (id - 0.5) * 0.08;
      c = [c[0] * sh, c[1] * sh, c[2] * sh];
      c = mix3(M, c, edge);
      o.c = c; o.h = edge * (0.55 + n1 * 0.25 + n2 * 0.1) - pit * 0.12;
    });
  },
  /** Marble with warped veins. Tile = ~2 m. */
  marble({ size, seed }) {
    const W = hex(0xf2ede2), G = hex(0x9a96a0), Wm = hex(0xe3d8c3);
    return bake(size, size, (u, v, px, py, o) => {
      const w1 = tfbm(u * 4, v * 4, 4, 4, seed), w2 = tfbm(u * 8 + 3, v * 8, 8, 3, seed + 4);
      const vein = Math.abs(Math.sin((u * 6 + w1 * 4.5 + w2 * 1.2) * Math.PI));
      const line = Math.pow(1 - vein, 14);
      let c = mix3(W, Wm, clamp01(w2 * 1.2 - 0.3));
      c = mix3(c, G, line * 0.55);
      o.c = c; o.h = 0.7 + w2 * 0.1 - line * 0.05;
    });
  },
  /** Terrain/grass detail (grayscale-ish, multiplies vertex colors). Tile ~6 m. */
  ground({ size, seed }) {
    return bake(size, size, (u, v, px, py, o) => {
      const a = tfbm(u * 12, v * 12, 12, 4, seed), b = tfbm(u * 96, v * 96, 96, 2, seed + 1);
      const blades = hash(px, py, seed) > 0.9 ? 0.08 : 0;
      const k = clamp01(0.72 + (a - 0.5) * 0.5 + (b - 0.5) * 0.28 + blades) * 255;
      o.c = [k, k * 0.99, k * 0.96]; o.h = 0.4 + a * 0.4 + b * 0.2;
    });
  },
  /** Woven cloth (grayscale). Tile covers 32 threads. */
  cloth({ size }) {
    return bake(size, size, (u, v, px, py, o) => {
      const n = 32, a = Math.floor(u * n), b = Math.floor(v * n);
      const over = (a + b) % 2 === 0;
      const fu = (u * n) % 1, fv = (v * n) % 1;
      const thread = over ? Math.sin(fu * Math.PI) : Math.sin(fv * Math.PI);
      const k = (0.78 + thread * 0.22 + (hash(a, b, 5) - 0.5) * 0.06) * 255;
      o.c = [k, k, k]; o.h = 0.4 + thread * 0.4;
    });
  },
  /** Terracotta roof tiles (curved rows). Tile = 2 m x 2 m (8 columns x 8 rows). */
  roof({ size, seed }) {
    return bake(size, size, (u, v, px, py, o) => {
      const cols = 8, rows = 8;
      const row = Math.floor(v * rows), off = (row % 2) * 0.5;
      const fu = ((u * cols + off) % 1 + 1) % 1, fv = (v * rows) % 1;
      const id = hash(Math.floor(u * cols + off) % cols, row, seed);
      const curve = Math.sin(fu * Math.PI);                       // convex tile profile
      const lap = Math.min(1, fv * 3);                            // shaded overlap at the tile top edge
      const n = tfbm(u * 24, v * 24, 24, 3, seed);
      const k = 0.55 + curve * 0.4 + lap * 0.12 + (id - 0.5) * 0.18 + (n - 0.5) * 0.2;
      const c = mix3(hex(0x8f3d22), hex(0xcf7a48), clamp01(k - 0.35));
      o.c = [c[0] * (0.7 + k * 0.45), c[1] * (0.7 + k * 0.45), c[2] * (0.7 + k * 0.45)];
      o.h = 0.3 + curve * 0.5 - (1 - lap) * 0.15;
    });
  },
};

/** Canonical cache key of a spec ("sand:size=1024,seed=3"): same spec, same key, on the main thread, in the worker and in IndexedDB. */
export function specKey(s) { return s.k + ':' + Object.keys(s).filter((p) => p !== 'k').sort().map((p) => p + '=' + s[p]).join(','); }
/** spec -> { w, h, color, bump } (buffers are fresh and transferable) */
export function generate(spec) { const g = GEN[spec.k]; if (!g) throw new Error('envtex: unknown texture kind ' + spec.k); return g(spec); }

// ---------------------------------------------------------------- fallback colour + integrity (pure: unit-tested in tests/ludus_maximus_3d_structure.test.mjs)
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/**
 * Average sRGB colour [r,g,b] (0..255) of the texture a spec bakes. Used (1) as the neutral stand-in while the real bytes are still being baked (the surface shows
 * sand / stone / wood of the right hue instead of an unlit default), and (2) as the plausibility reference for cached or worker-made bytes: a cache entry whose
 * mean colour is far from this is corrupt or stale and is thrown away. Measured against the generators: every kind is within 12 per channel.
 */
export function fallbackColor(spec) {
  let c;
  switch (spec.k) {
    case 'sand': c = mixc(hex(0xe6cfa2), hex(0xcdae7e), 0.35); break;
    case 'stone': { const face = mixc(hex(spec.base), hex(spec.tint), 0.38).map((x) => x * 0.96); c = mixc(face, hex(spec.mortar), 0.02); break; }
    case 'marble': c = mixc(hex(0xf2ede2), hex(0xe3d8c3), 0.4); break;
    case 'ground': c = [187, 185, 180]; break;
    case 'cloth': c = [232, 232, 232]; break;
    case 'roof': c = [197, 105, 61]; break;
    default: c = [190, 175, 150];
  }
  return c.map((x) => Math.max(0, Math.min(255, Math.round(x))));
}
/** mean [r,g,b] of an RGBA byte array from up to `n` evenly strided pixels */
export function meanColor(color, n = 2048) {
  const px = color.length >> 2; if (!px) return [0, 0, 0];
  const step = Math.max(1, Math.floor(px / n)); let r = 0, g = 0, b = 0, k = 0;
  for (let i = 0; i < px; i += step) { r += color[i * 4]; g += color[i * 4 + 1]; b += color[i * 4 + 2]; k++; }
  return [r / k, g / k, b / k];
}
/** 32-bit FNV-style hash over every byte (read as 32-bit words when aligned: ~2 ms for a 1024 px RGBA tile) */
export function bytesHash(u8) {
  let h = (0x811c9dc5 ^ u8.length) | 0, i = 0;
  if ((u8.byteOffset & 3) === 0) { const w = new Uint32Array(u8.buffer, u8.byteOffset, u8.length >> 2); for (; i < w.length; i++) h = Math.imul(h ^ w[i], 16777619) ^ (h >>> 15); i = w.length << 2; }
  for (; i < u8.length; i++) h = Math.imul(h ^ u8[i], 16777619);
  return h >>> 0;
}
/** one number for a bake result (color + bump) */
export const bakeHash = (r) => (bytesHash(r.color) ^ Math.imul(bytesHash(r.bump), 31)) >>> 0;
/** sane size, sane mean colour and not a flat fill: false for anything a generator can not have produced (all zero, all green, truncated, wrong tile size) */
export function plausible(spec, r, tol = 48) {
  if (!r || !r.color || !r.bump || !(r.w > 0) || r.w !== spec.size || r.h !== spec.size) return false;
  if (r.color.length !== r.w * r.h * 4 || r.bump.length !== r.w * r.h) return false;
  const m = meanColor(r.color), f = fallbackColor(spec);
  if (!(Math.abs(m[0] - f[0]) <= tol && Math.abs(m[1] - f[1]) <= tol && Math.abs(m[2] - f[2]) <= tol)) return false;
  let lo = 255, hi = 0; const st = Math.max(1, r.bump.length >> 10);
  for (let i = 0; i < r.bump.length; i += st) { const v = r.bump[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  return hi - lo >= 4;   // every generator has relief (cloth is the flattest: 0.4..0.8 of 255)
}
/** is a cache record usable for `key` at generator version `ver`? (record = { v, key, w, h, hash, color, bump } with color / bump as typed arrays) */
export function cacheRecordOk(rec, key, ver, spec) {
  if (!rec || rec.v !== ver || rec.key !== key || !rec.color || !rec.bump) return false;
  if (rec.color.byteLength !== rec.w * rec.h * 4 || rec.bump.byteLength !== rec.w * rec.h) return false;
  if (bakeHash(rec) !== rec.hash) return false;
  return spec ? plausible(spec, rec) : true;
}
