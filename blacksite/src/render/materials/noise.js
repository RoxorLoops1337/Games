// Field synthesis for the procedural material library.
//
// Pure typed-array maths: no THREE, no DOM, no canvas. Keeping the expensive
// half of the texture system free of both is what lets it be timed and eyeballed
// in Node — the GPU never sees any of this, it only receives the bytes at the end.
//
// Two structural decisions worth knowing:
//
// 1. Octaves are built by upsampling a small *wrapped* lattice into the full
//    field, not by hashing per texel. Same value noise either way, but the
//    lattice version costs a handful of ops per texel and is exactly tileable by
//    construction. A visible seam is the fastest way to make a wall read as a
//    demo rather than a place.
// 2. Every generator is anisotropic (`fx`, `fy` rather than one frequency).
//    Almost every real surface is directional — wood grain, water running down
//    concrete, wind ripples in sand, brushed metal — and stretching an isotropic
//    field afterwards would break the wrap.

import { mulberry32 } from '../../core/state.js';

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a, b, t) => a + (b - a) * t;

export function sstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-9));
  return t * t * (3 - 2 * t);
}

// Shortest signed distance between two points on a wrapped 0..1 axis, so a
// feature placed near the edge of the tile still measures its size correctly.
export function wrapDelta(d) {
  d -= Math.floor(d);
  return d > 0.5 ? d - 1 : d;
}

export function field(size, v = 0) {
  const f = new Float32Array(size * size);
  if (v) f.fill(v);
  return f;
}

// ── value noise ──────────────────────────────────────────────────────────────

function lattice(fx, fy, seed) {
  const rnd = mulberry32(seed | 0);
  const l = new Float32Array(fx * fy);
  for (let i = 0; i < l.length; i++) l[i] = rnd();
  return l;
}

// Per-axis interpolation tables. Computed once per octave and reused down the
// whole field, which is where the speed comes from.
function axis(size, freq) {
  const i0 = new Int32Array(size), i1 = new Int32Array(size), w = new Float32Array(size);
  const s = freq / size;
  for (let i = 0; i < size; i++) {
    const g = i * s, a = Math.floor(g);
    let f = g - a;
    f = f * f * (3 - 2 * f);      // smoothstep, so the lattice leaves no creases
    i0[i] = ((a % freq) + freq) % freq;
    i1[i] = (i0[i] + 1) % freq;
    w[i] = f;
  }
  return { i0, i1, w };
}

export const MODE = { VALUE: 0, RIDGE: 1, BILLOW: 2 };

export function addOctave(out, size, fx, fy, amp, seed, mode = 0) {
  fx = Math.max(1, Math.round(fx)); fy = Math.max(1, Math.round(fy));
  const lat = lattice(fx, fy, seed);
  const ax = axis(size, fx), ay = axis(size, fy);
  const xi0 = ax.i0, xi1 = ax.i1, xw = ax.w;
  for (let y = 0; y < size; y++) {
    const r0 = ay.i0[y] * fx, r1 = ay.i1[y] * fx, wy = ay.w[y], row = y * size;
    if (mode === 0) {
      // Split rather than branching per texel: this is the hottest loop in the
      // whole library and the shape check does not belong inside it.
      for (let x = 0; x < size; x++) {
        const a0 = xi0[x], a1 = xi1[x], wx = xw[x];
        const t0 = lat[r0 + a0], b0 = lat[r1 + a0];
        const top = t0 + (lat[r0 + a1] - t0) * wx, bot = b0 + (lat[r1 + a1] - b0) * wx;
        out[row + x] += (top + (bot - top) * wy) * amp;
      }
    } else {
      for (let x = 0; x < size; x++) {
        const a0 = xi0[x], a1 = xi1[x], wx = xw[x];
        const t0 = lat[r0 + a0], b0 = lat[r1 + a0];
        const top = t0 + (lat[r0 + a1] - t0) * wx, bot = b0 + (lat[r1 + a1] - b0) * wx;
        const v = top + (bot - top) * wy;
        out[row + x] += (mode === 1 ? 1 - Math.abs(v * 2 - 1) : Math.abs(v * 2 - 1)) * amp;
      }
    }
  }
  return out;
}

// Bilinear wrapped magnification. A field whose highest octave is well below
// the target resolution carries no information at that resolution, so it is
// synthesised small and blown up — one pass instead of three, and the result is
// identical to within a fraction of a value.
export function upsample(src, srcSize, dstSize) {
  const out = field(dstSize), s = srcSize / dstSize, m = srcSize - 1;
  const i0 = new Int32Array(dstSize), i1 = new Int32Array(dstSize), w = new Float32Array(dstSize);
  for (let i = 0; i < dstSize; i++) {
    const g = i * s, a = Math.floor(g);
    i0[i] = a & m; i1[i] = (a + 1) & m; w[i] = g - a;
  }
  for (let y = 0; y < dstSize; y++) {
    const r0 = i0[y] * srcSize, r1 = i1[y] * srcSize, wy = w[y], row = y * dstSize;
    for (let x = 0; x < dstSize; x++) {
      const a0 = i0[x], a1 = i1[x], wx = w[x];
      const top = src[r0 + a0] + (src[r0 + a1] - src[r0 + a0]) * wx;
      const bot = src[r1 + a0] + (src[r1 + a1] - src[r1 + a0]) * wx;
      out[row + x] = top + (bot - top) * wy;
    }
  }
  return out;
}

// Fractal sum. Lacunarity defaults to 2.13 rather than 2 on purpose: octaves at
// exactly doubling frequencies line their features up and the result reads as a
// grid. An irrational-ish ratio never repeats inside the tile.
// `lo` synthesises at 1/lo resolution and magnifies — see `upsample`.
export function fbm(size, o = {}) {
  if (o.lo > 1) {
    const s2 = Math.max(32, (size / o.lo) | 0);
    if (s2 < size) return upsample(fbm(s2, { ...o, lo: 1 }), s2, size);
  }
  const oct = o.oct || 4, gain = o.gain != null ? o.gain : 0.5, lac = o.lac || 2.13;
  let fx = o.fx != null ? o.fx : (o.freq || 4);
  let fy = o.fy != null ? o.fy : (o.freq || 4);
  const out = field(size);
  let amp = 1, sum = 0;
  for (let i = 0; i < oct; i++) {
    if (fx > size * 0.5 && fy > size * 0.5) break;    // past Nyquist it is just noise
    addOctave(out, size, fx, fy, amp, (o.seed || 1) * 2654435761 + i * 40503, o.mode || 0);
    sum += amp; amp *= gain; fx *= lac; fy *= lac;
  }
  if (sum > 0) { const inv = 1 / sum; for (let i = 0; i < out.length; i++) out[i] *= inv; }
  return out;
}

// Bilinear wrapped lookup, for warping one field by another. Sizes are always
// powers of two here, so the wrap is a mask rather than a modulo.
export function sample(f, size, u, v) {
  const m = size - 1;
  u = (u - Math.floor(u)) * size; v = (v - Math.floor(v)) * size;
  const x0 = Math.floor(u), y0 = Math.floor(v);
  const fxr = u - x0, fyr = v - y0;
  const xa = x0 & m, ya = y0 & m, x1 = (x0 + 1) & m, y1 = (y0 + 1) & m;
  const r0 = ya * size, r1 = y1 * size;
  const top = f[r0 + xa] + (f[r0 + x1] - f[r0 + xa]) * fxr;
  const bot = f[r1 + xa] + (f[r1 + x1] - f[r1 + xa]) * fxr;
  return top + (bot - top) * fyr;
}

// Pushes a field around by another field. Domain warping is the cheapest way to
// stop noise looking like noise: it turns statistically uniform blobs into
// flow, which is what rust bleed, wood grain and veins actually look like.
export function warp(src, size, wx, wy, amt) {
  const out = field(size), inv = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      out[i] = sample(src, size, x * inv + (wx[i] - 0.5) * amt, y * inv + (wy[i] - 0.5) * amt);
    }
  }
  return out;
}

// ── worley / cellular ────────────────────────────────────────────────────────

// F1 (distance to nearest feature point), F2−F1 (cell borders, i.e. cracks and
// mortar) and a per-cell random id so each pebble can get its own colour.
export function worley(size, cells, seed, jitter = 1, lo = 1) {
  cells = Math.max(2, Math.round(cells));
  // Large cells resolve fine at a quarter of the resolution; the borders are
  // the only sharp thing in the field and they survive the magnification.
  if (lo > 1) {
    const s2 = Math.max(64, (size / lo) | 0);
    if (s2 < size && cells < s2 / 8) {
      const w = worley(s2, cells, seed, jitter, 1);
      return {
        f1: upsample(w.f1, s2, size), f2: upsample(w.f2, s2, size), id: upsample(w.id, s2, size),
      };
    }
  }
  const rnd = mulberry32((seed | 0) ^ 0x9e37);
  const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
  const pid = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) {
    const cx = i % cells, cy = (i / cells) | 0;
    px[i] = (cx + 0.5 + (rnd() - 0.5) * jitter) / cells;
    py[i] = (cy + 0.5 + (rnd() - 0.5) * jitter) / cells;
    pid[i] = rnd();
  }
  const f1 = field(size), f2 = field(size), id = field(size);
  const inv = 1 / size, scale = cells * 1.4;
  // Walked cell by cell rather than texel by texel: the nine candidate points
  // are gathered once per cell and the pixels inside it just measure against
  // them. Wrapping is folded into the gathered coordinates, so the inner loop
  // has no modulo and no floor in it at all.
  const nx = new Float64Array(9), ny = new Float64Array(9), nid = new Float64Array(9);
  for (let cy = 0; cy < cells; cy++) {
    const y0 = Math.ceil(cy * size / cells), y1 = Math.min(size, Math.ceil((cy + 1) * size / cells));
    for (let cx = 0; cx < cells; cx++) {
      const x0 = Math.ceil(cx * size / cells), x1 = Math.min(size, Math.ceil((cx + 1) * size / cells));
      let c = 0;
      for (let oy = -1; oy <= 1; oy++) {
        let gy = cy + oy, sy = 0;
        if (gy < 0) { gy += cells; sy = -1; } else if (gy >= cells) { gy -= cells; sy = 1; }
        for (let ox = -1; ox <= 1; ox++) {
          let gx = cx + ox, sx = 0;
          if (gx < 0) { gx += cells; sx = -1; } else if (gx >= cells) { gx -= cells; sx = 1; }
          const k = gy * cells + gx;
          nx[c] = px[k] + sx; ny[c] = py[k] + sy; nid[c] = pid[k]; c++;
        }
      }
      for (let y = y0; y < y1; y++) {
        const v = y * inv, row = y * size;
        for (let x = x0; x < x1; x++) {
          const u = x * inv;
          let d1 = 9, d2 = 9, best = 0;
          for (let j = 0; j < 9; j++) {
            const dx = nx[j] - u, dy = ny[j] - v;
            const d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; best = nid[j]; } else if (d < d2) d2 = d;
          }
          const s1 = Math.sqrt(d1), i = row + x;
          f1[i] = Math.min(1, s1 * scale);
          f2[i] = Math.min(1, (Math.sqrt(d2) - s1) * scale);
          id[i] = best;
        }
      }
    }
  }
  return { f1, f2, id };
}

// ── filters ──────────────────────────────────────────────────────────────────

// Separable wrapped box blur, running-sum so cost is independent of radius.
// Two passes of it are close enough to a gaussian for an occlusion term.
export function blur(src, size, r) {
  if (r < 1) return Float32Array.from(src);
  const tmp = new Float32Array(size * size), out = new Float32Array(size * size);
  const w = r * 2 + 1, inv = 1 / w;
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + ((k % size) + size) % size];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + (x + r + 1) % size] - src[row + ((x - r) % size + size) % size];
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[(((k % size) + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = acc * inv;
      acc += tmp[((y + r + 1) % size) * size + x] - tmp[(((y - r) % size + size) % size) * size + x];
    }
  }
  return out;
}

// Box-average minification. Averaging rather than point-sampling matters here:
// a point-sampled reduction of a noisy height field aliases, and the alias then
// gets blurred into the occlusion term where it reads as blotches.
export function downsample(src, srcSize, dstSize) {
  const out = field(dstSize), k = srcSize / dstSize, inv = 1 / (k * k);
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      let acc = 0;
      for (let j = 0; j < k; j++) {
        const row = (y * k + j) * srcSize + x * k;
        for (let i = 0; i < k; i++) acc += src[row + i];
      }
      out[y * dstSize + x] = acc * inv;
    }
  }
  return out;
}

// Height → tangent-space normal, Sobel rather than a two-tap difference because
// a two-tap picks up the texel grid and prints it into the shading as a faint
// crosshatch under a sharp light.
export function sobelNormal(h, size, strength, out) {
  out = out || new Uint8Array(size * size * 4);
  const m = size - 1;
  for (let y = 0; y < size; y++) {
    const yp = ((y - 1) & m) * size, yc = y * size, yn = ((y + 1) & m) * size;
    for (let x = 0; x < size; x++) {
      const xp = (x - 1) & m, xc = x, xn = (x + 1) & m;
      const tl = h[yp + xp], tc = h[yp + xc], tr = h[yp + xn];
      const ml = h[yc + xp], mr = h[yc + xn];
      const bl = h[yn + xp], bc = h[yn + xc], br = h[yn + xn];
      const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const dy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      const nx = -dx * strength, ny = -dy * strength;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (yc + x) * 4;
      out[i] = (nx * l * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * l * 0.5 + 0.5) * 255;
      out[i + 2] = (l * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

// Cavity from a difference-of-blur: wherever the surface sits below its own
// local average it is in a crevice, and crevices are where dirt lives. This is
// the term that does most of the work of making a texture look used — a flat
// albedo with good cavity darkening reads better than a busy albedo without it.
export function cavityAO(h, size, o = {}) {
  const near = blur(h, size, Math.max(1, Math.round(size * (o.near || 0.012))));
  // The wide term is, by definition, low frequency — computing it at a quarter
  // resolution costs a sixteenth and is indistinguishable in the result.
  const q = Math.max(64, size >> 2);
  const wide = q < size
    ? upsample(blur(downsample(h, size, q), q, Math.max(2, Math.round(q * (o.wide || 0.06)))), q, size)
    : blur(h, size, Math.max(2, Math.round(size * (o.wide || 0.06))));
  const kn = o.kNear != null ? o.kNear : 9, kw = o.kWide != null ? o.kWide : 3.2;
  const out = field(size);
  for (let i = 0; i < out.length; i++) {
    const c = clamp01(1 - Math.max(0, near[i] - h[i]) * kn);
    const w = clamp01(1 - Math.max(0, wide[i] - h[i]) * kw);
    out[i] = clamp01(c * (0.55 + 0.45 * w));
  }
  return out;
}
