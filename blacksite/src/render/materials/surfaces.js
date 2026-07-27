// The recipes: one function per material, each returning packed byte arrays.
//
// Every recipe follows the same shape — synthesise a few fields, run one pass
// over the texels to turn them into height/albedo/roughness/metalness, then hand
// off to `finish()` which derives cavity occlusion, presses dirt into the
// crevices and Sobels the normal out of the height. Nothing here knows about
// THREE or the GPU.
//
// Three rules run through all of it, and they are what separate a surface that
// reads as a material from one that reads as noise on a box:
//
// * **Roughness variation carries the shot.** Albedo is what a texture looks
//   like in a paint program; roughness is what it looks like under a light.
//   Every recipe varies it — polish where things are walked on, dust where they
//   are not, a hard step across a rust front.
// * **Nothing is straight.** Every seam, stripe and panel edge is displaced by
//   a low-frequency field before it is drawn, because the eye finds a
//   mathematically straight line instantly and reads it as synthetic.
// * **Macro before micro.** A low-frequency layer at roughly the size of a wall
//   is applied on top of the detail, so a 40 m façade does not read as one tile
//   repeated eighty times.

import * as N from './noise.js';
import { mulberry32 } from '../../core/state.js';

const TAU = Math.PI * 2;

function surf(size) {
  const n = size * size;
  return {
    size, n,
    h: new Float32Array(n),                 // height, nominally around 0.5
    r: new Float32Array(n),                 // roughness, absolute
    m: new Float32Array(n),                 // metalness, absolute
    cr: new Float32Array(n), cg: new Float32Array(n), cb: new Float32Array(n),
    a: null,                                // cutout alpha, allocated on demand
  };
}

// Draws into a wrapped disc without touching the rest of the field — how bolt
// heads, tie holes, nails and knots get placed without a per-texel test for
// each of them.
function stampDisc(size, cx, cy, r, fn) {
  const x0 = Math.floor((cx - r) * size), x1 = Math.ceil((cx + r) * size);
  const y0 = Math.floor((cy - r) * size), y1 = Math.ceil((cy + r) * size);
  const m = size - 1;
  for (let y = y0; y <= y1; y++) {
    const v = y / size, yy = y & m;
    for (let x = x0; x <= x1; x++) {
      const u = x / size, dx = u - cx, dy = v - cy;
      const d = Math.hypot(dx, dy) / r;
      if (d > 1) continue;
      fn(yy * size + (x & m), d, Math.atan2(dy, dx));
    }
  }
}

// ── shared finish ────────────────────────────────────────────────────────────

// Packs a finished surface. Occlusion, roughness and metalness share one RGB
// texture in the glTF convention (R=AO, G=rough, B=metal): three reads exactly
// those channels, so all three maps cost one sampler and one upload.
export function finish(S, o = {}) {
  const size = S.size, n = S.n;
  const ao = N.cavityAO(S.h, size, o.ao);
  const dirt = o.dirt != null ? o.dirt : 0.55;
  const dr = o.dirtColor ? o.dirtColor[0] : 0.11;
  const dg = o.dirtColor ? o.dirtColor[1] : 0.10;
  const db = o.dirtColor ? o.dirtColor[2] : 0.09;

  const albedo = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    // Cavity dirt is multiplied into albedo as well as exported as an AO map.
    // The AO map only attenuates ambient light; the albedo term is what makes a
    // crevice stay dark when the sun is straight down it, which is the read the
    // eye actually uses to judge depth.
    const k = 1 - (1 - ao[i]) * dirt;
    const cr = S.cr[i] * k + dr * (1 - k);
    const cg = S.cg[i] * k + dg * (1 - k);
    const cb = S.cb[i] * k + db * (1 - k);
    const j = i * 4;
    albedo[j] = N.clamp01(cr) * 255;
    albedo[j + 1] = N.clamp01(cg) * 255;
    albedo[j + 2] = N.clamp01(cb) * 255;
    albedo[j + 3] = S.a ? N.clamp01(S.a[i]) * 255 : 255;
    orm[j] = ao[i] * 255;
    // Grit settles in the crevices, and grit is rough.
    orm[j + 1] = N.clamp01(S.r[i] + (1 - ao[i]) * (o.crevRough != null ? o.crevRough : 0.10)) * 255;
    orm[j + 2] = N.clamp01(S.m[i]) * 255;
    orm[j + 3] = 255;
  }
  // Sobel gradients are per-texel differences, so the same height field yields a
  // flatter normal at higher resolution unless the strength tracks the texel size.
  const strength = (o.normal != null ? o.normal : 6) * (size / 512);
  return { size, albedo, orm, normal: N.sobelNormal(S.h, size, strength), alpha: !!S.a };
}

// ── detail normals ───────────────────────────────────────────────────────────

// The second normal map, blended in at close range. Without one, every surface
// goes glassy-smooth as the player walks up to it — the base map's texels are
// several centimetres across at 30 cm from the lens, and the absence of any
// structure below that is the single most visible "not shipped" tell in first
// person. Cheap to make: it is a normal map only, tiny, and shared by everything.
export function detailNormal(size, kind, seed = 7) {
  const h = N.field(size);
  if (kind === 'metal') {
    // Bead-blasted steel: isotropic pitting crossed with faint drawing lines.
    const pit = N.fbm(size, { freq: size >> 3, oct: 3, seed, gain: 0.62 });
    const draw = N.fbm(size, { fx: size >> 1, fy: 3, oct: 2, seed: seed + 5 });
    const scr = N.fbm(size, { fx: size >> 1, fy: 7, oct: 1, seed: seed + 9 });
    for (let i = 0; i < h.length; i++) {
      h[i] = pit[i] * 0.55 + draw[i] * 0.25 + N.sstep(0.78, 0.95, scr[i]) * 0.5;
    }
    return N.sobelNormal(h, size, 3.2 * (size / 256));
  }
  if (kind === 'fabric') {
    const weft = N.fbm(size, { fx: size >> 2, fy: 5, oct: 2, seed });
    const warpF = N.fbm(size, { fx: 5, fy: size >> 2, oct: 2, seed: seed + 3 });
    for (let i = 0; i < h.length; i++) h[i] = weft[i] * 0.5 + warpF[i] * 0.5;
    return N.sobelNormal(h, size, 2.4 * (size / 256));
  }
  // Grit: sharp small aggregate over a softer sand bed. Two octave families at
  // unrelated scales so it never resolves into a pattern when tiled 30× across
  // a wall.
  const fine = N.fbm(size, { freq: size >> 2, oct: 2, seed, gain: 0.7 });
  const mid = N.fbm(size, { freq: size >> 4, oct: 3, seed: seed + 11 });
  const spik = N.worley(size, size >> 4, seed + 17, 1);
  for (let i = 0; i < h.length; i++) {
    h[i] = fine[i] * 0.5 + mid[i] * 0.3 + (1 - N.sstep(0.0, 0.45, spik.f1[i])) * 0.32;
  }
  return N.sobelNormal(h, size, 3.6 * (size / 256));
}

// ── concrete ─────────────────────────────────────────────────────────────────

// Poured-in-place concrete, thirty years into a desert. Formwork lines from the
// shuttering boards, tie-rod holes on the board grid, exposed aggregate where
// the surface has spalled, and rain staining that runs *down from the seams* —
// water collects on the ledge a board joint makes and bleeds from there, which
// is why streaks in the real world are anchored rather than randomly placed.
export function concrete(size, seed = 101, o = {}) {
  const S = surf(size), inv = 1 / size;
  const macro = N.fbm(size, { freq: 2, oct: 3, seed: seed + 1, lo: 4 });
  const meso = N.fbm(size, { freq: 9, oct: 3, seed: seed + 2, lo: 2 });
  const grain = N.fbm(size, { freq: 37, oct: 3, seed: seed + 3, gain: 0.62 });
  const chip = N.fbm(size, { freq: 6, oct: 3, seed: seed + 4, mode: N.MODE.BILLOW, lo: 4 });
  const wob = N.fbm(size, { freq: 5, oct: 2, seed: seed + 6, lo: 4 });
  const runs = N.fbm(size, { fx: 22, fy: 2, oct: 3, seed: seed + 7 });
  const agg = N.worley(size, Math.max(6, size >> 5), seed + 5, 1, 2);
  const boards = o.boards || 3, joints = o.joints || 2;
  const tint = o.tint || [1.0, 0.995, 1.02];

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, u = x * inv;
      const mac = macro[i], mes = meso[i], gr = grain[i];

      const vb = v * boards + (wob[i] - 0.5) * 0.06;
      const dv = vb - Math.round(vb);
      const seamV = 1 - N.sstep(0.006, 0.030, Math.abs(dv));
      const ub = u * joints + (wob[i] - 0.5) * 0.05;
      const seamU = 1 - N.sstep(0.005, 0.026, Math.abs(ub - Math.round(ub)));
      const seam = Math.max(seamV, seamU * 0.75);

      // Aggregate: stones just under the surface, revealed where the cement
      // skin has broken away.
      const pebble = 1 - N.sstep(0.18, 0.62, agg.f1[i]);
      const spall = N.sstep(0.52, 0.80, chip[i] * 0.8 + seam * 0.42 + mes * 0.2);
      const pit = N.sstep(0.79, 0.95, gr);            // trapped air bubbles
      const speck = gr - 0.5;                         // sand in the cement paste

      // Rain runs downward from whichever seam is above, fading as it goes.
      const below = vb - Math.floor(vb);
      const stain = N.clamp01(runs[i] * 1.7 - 0.5) * (1 - N.sstep(0.02, 0.75, below)) * 0.9;

      let base = 0.46 + mac * 0.13 + mes * 0.05 + speck * 0.17;
      base *= 1 - spall * 0.10 - pit * 0.15;
      let cr = base * tint[0], cg = base * tint[1], cb = base * tint[2];

      // Exposed stones are darker and browner than the paste around them.
      const stone = pebble * spall;
      cr = N.mix(cr, 0.30 + agg.id[i] * 0.20, stone * 0.8);
      cg = N.mix(cg, 0.285 + agg.id[i] * 0.19, stone * 0.8);
      cb = N.mix(cb, 0.265 + agg.id[i] * 0.17, stone * 0.8);

      // Staining is warm — it is dust and iron, not clean water.
      cr = N.mix(cr, 0.21, stain * 0.62); cg = N.mix(cg, 0.175, stain * 0.62); cb = N.mix(cb, 0.14, stain * 0.62);

      // Efflorescence: salt bloom pushed out of the slab. Kept faint — a strong
      // one is a landmark, and a landmark is what makes a repeat obvious.
      const eff = N.sstep(0.70, 0.93, mes * 0.7 + gr * 0.4) * (1 - stain);
      cr = N.mix(cr, 0.74, eff * 0.20); cg = N.mix(cg, 0.735, eff * 0.20); cb = N.mix(cb, 0.715, eff * 0.20);

      S.cr[i] = cr; S.cg[i] = cg; S.cb[i] = cb;
      S.h[i] = 0.5 + mes * 0.05 + speck * 0.09 - seam * 0.11 - spall * 0.05
        + stone * 0.035 - pit * 0.11;
      // Smooth where feet and hands have polished it, chalky everywhere else.
      S.r[i] = 0.90 - N.sstep(0.55, 0.92, mac) * 0.17 + gr * 0.05 + spall * 0.04 - stain * 0.06;
      S.m[i] = 0;
    }
  }

  // Tie-rod holes sit on the formwork grid: board joint crossings, every other one.
  const rnd = mulberry32(seed * 7919);
  for (let by = 0; by < boards; by++) {
    for (let bx = 0; bx < joints * 2; bx++) {
      if (rnd() < 0.35) continue;
      const cx = (bx + 0.5) / (joints * 2), cy = (by + 0.35 + rnd() * 0.3) / boards;
      const r = 0.018 + rnd() * 0.006, lip = rnd() * 0.5;
      stampDisc(size, cx, cy, r, (i, d, ang) => {
        // The rim is broken, not a circle: the plug that filled the hole came
        // out and took some of the surface with it.
        const bite = 1 + Math.cos(ang * 3 + lip * 9) * 0.10 + Math.cos(ang * 7) * 0.05;
        const cone = 1 - N.sstep(0.5 * bite, 1.0 * bite, d);
        S.h[i] -= cone * 0.20;
        S.cr[i] *= 1 - cone * 0.34; S.cg[i] *= 1 - cone * 0.34; S.cb[i] *= 1 - cone * 0.32;
        S.r[i] = N.clamp01(S.r[i] + cone * 0.05);
      });
    }
  }

  return finish(S, {
    normal: o.normal || 7, dirt: 0.5, dirtColor: [0.13, 0.115, 0.10], crevRough: 0.08,
  });
}

// ── painted steel, rust, gunmetal ────────────────────────────────────────────

// One generator, three materials. Paint over steel fails in a specific order:
// water finds the seams and bolts first, rust creeps out from there, the paint
// above it lifts into blisters, the blisters flake and leave a bright metal rim
// around a dark brown patch. Driving all of that from one rust mask keeps the
// story consistent instead of scattering three unrelated noise layers.
export function metal(size, seed = 211, o = {}) {
  const S = surf(size), inv = 1 / size;
  const paint = o.paint || [0.345, 0.375, 0.355];
  const rustBias = o.rust != null ? o.rust : 0.0;      // 0 painted, 1 fully rusted
  const paintMetal = o.paintMetal != null ? o.paintMetal : 0.02;
  const paintRough = o.paintRough != null ? o.paintRough : 0.42;
  const panelsU = o.panelsU != null ? o.panelsU : 2, panelsV = o.panelsV != null ? o.panelsV : 2;

  const macro = N.fbm(size, { freq: 2, oct: 3, seed: seed + 1, lo: 4 });
  const wob = N.fbm(size, { freq: 6, oct: 2, seed: seed + 2, lo: 4 });
  const wx = N.fbm(size, { freq: 4, oct: 2, seed: seed + 3, lo: 4 });
  const wy = N.fbm(size, { freq: 4, oct: 2, seed: seed + 4, lo: 4 });
  // Warping the rust field is what turns a blob into a bleed.
  const rustN = N.warp(N.fbm(size, { freq: 5, oct: 4, seed: seed + 5, lo: 2 }), size, wx, wy, 0.10);
  const rustTone = N.fbm(size, { freq: 13, oct: 3, seed: seed + 6, lo: 2 });
  const fine = N.fbm(size, { freq: 51, oct: 2, seed: seed + 7, gain: 0.6 });
  const scratch = N.fbm(size, { fx: size >> 2, fy: 5, oct: 2, seed: seed + 8 });
  const blist = N.worley(size, Math.max(8, size >> 4), seed + 9, 1, 2);

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, u = x * inv;
      const mac = macro[i], fi = fine[i];

      const uu = u * panelsU + (wob[i] - 0.5) * 0.02;
      const vv = v * panelsV + (wob[i] - 0.5) * 0.02;
      const du = Math.abs(uu - Math.round(uu)), dv = Math.abs(vv - Math.round(vv));
      const seam = Math.max(1 - N.sstep(0.004, 0.016, du), 1 - N.sstep(0.004, 0.016, dv));
      const nearSeam = Math.max(1 - N.sstep(0.01, 0.12, du), 1 - N.sstep(0.01, 0.12, dv));

      // Rust starts where water sits: seams, and the lower half of the panel.
      const wet = rustN[i] * 0.78 + nearSeam * 0.30 + N.sstep(0.3, 1.0, v) * 0.16 + rustBias;
      const rust = N.sstep(0.44, 0.70, wet);
      const front = N.sstep(0.30, 0.46, wet) * (1 - N.sstep(0.52, 0.68, wet));  // the blister band

      const blister = N.sstep(0.55, 0.95, 1 - blist.f1[i]) * front;
      const flake = N.sstep(0.62, 0.85, 1 - blist.f1[i]) * front * N.sstep(0.5, 0.9, blist.id[i]);
      const scr = N.sstep(0.82, 0.96, scratch[i]) * (1 - rust);

      // Paint: orange peel, a couple of percent of colour drift, semi-gloss.
      let cr = paint[0] * (0.9 + mac * 0.22) + fi * 0.03;
      let cg = paint[1] * (0.9 + mac * 0.22) + fi * 0.03;
      let cb = paint[2] * (0.9 + mac * 0.22) + fi * 0.03;
      let rough = paintRough + fi * 0.10 - N.sstep(0.6, 1.0, mac) * 0.10;
      let metalness = paintMetal;

      // Rust, ramped from near-black scale to bright orange bloom, with the
      // fine field breaking it up — smooth rust reads as a coffee stain.
      const tone = N.clamp01(rustTone[i] * 1.15 + fi * 0.5 - 0.32);
      const rr = N.mix(0.20, 0.60, tone), rg = N.mix(0.085, 0.275, tone), rb = N.mix(0.045, 0.105, tone);
      cr = N.mix(cr, rr, rust); cg = N.mix(cg, rg, rust); cb = N.mix(cb, rb, rust);
      rough = N.mix(rough, 0.95 - tone * 0.06, rust);
      metalness = N.mix(metalness, 0.22, rust);

      // Bare steel: under a flake, and along scratches. Bright, because for a
      // metal the albedo *is* the reflectance — dark steel reads as dark paint.
      const bare = Math.max(flake, scr);
      cr = N.mix(cr, 0.71, bare); cg = N.mix(cg, 0.725, bare); cb = N.mix(cb, 0.745, bare);
      rough = N.mix(rough, 0.30, bare);
      metalness = N.mix(metalness, 0.92, bare);

      S.cr[i] = cr; S.cg[i] = cg; S.cb[i] = cb;
      S.r[i] = rough; S.m[i] = metalness;
      S.h[i] = 0.5 + fi * 0.02 - seam * 0.16 + blister * 0.05 - flake * 0.05
        + rust * 0.02 + scr * -0.01;
    }
  }

  // Bolt heads along the seams. Domed, with a shadowed collar and a rust weep
  // below — bolts are the first thing to go and the eye reads them as scale.
  const rnd = mulberry32(seed * 104729);
  const perSeam = Math.max(4, Math.round(6 * (size / 512) + 4));
  for (let s = 0; s < panelsU; s++) {
    for (let k = 0; k < perSeam; k++) {
      if (rnd() < 0.12) continue;
      const cx = s / panelsU, cy = (k + 0.5) / perSeam;
      const r = 0.012 + rnd() * 0.004, rustyBolt = rnd();
      stampDisc(size, cx, cy, r, (i, d, ang) => {
        const dome = Math.sqrt(Math.max(0, 1 - d * d));
        const head = 1 - N.sstep(0.78, 0.94, d);
        S.h[i] += head * dome * 0.10 - (1 - head) * 0.05;
        const hexFace = 0.5 + 0.5 * Math.cos(ang * 6);
        const shade = 0.75 + hexFace * 0.25;
        S.cr[i] = N.mix(S.cr[i], N.mix(0.38, 0.70, rustyBolt) * shade, head * 0.85);
        S.cg[i] = N.mix(S.cg[i], N.mix(0.19, 0.71, rustyBolt) * shade, head * 0.85);
        S.cb[i] = N.mix(S.cb[i], N.mix(0.09, 0.73, rustyBolt) * shade, head * 0.85);
        S.r[i] = N.mix(S.r[i], N.mix(0.88, 0.34, rustyBolt), head * 0.8);
        S.m[i] = N.mix(S.m[i], N.mix(0.30, 0.9, rustyBolt), head * 0.8);
      });
    }
  }

  return finish(S, {
    normal: o.normal || 6, dirt: 0.45, dirtColor: [0.09, 0.075, 0.06], crevRough: 0.12,
  });
}

// ── sand ─────────────────────────────────────────────────────────────────────

// Wind-rippled dune sand. The ripples are two sine trains at integer lattice
// directions — integer so the tile still wraps — warped by low-frequency noise
// so they meander the way real ripples do around obstacles. Crests are pale and
// dry, troughs collect the darker coarse grains that the wind cannot lift.
export function sand(size, seed = 307, o = {}) {
  const S = surf(size), inv = 1 / size;
  const macro = N.fbm(size, { freq: 2, oct: 3, seed: seed + 1, lo: 4 });
  const dune = N.fbm(size, { freq: 3, oct: 2, seed: seed + 2, lo: 4 });
  const bend = N.fbm(size, { freq: 3, oct: 2, seed: seed + 3, lo: 4 });
  const bend2 = N.fbm(size, { freq: 5, oct: 2, seed: seed + 4, lo: 4 });
  const grains = N.fbm(size, { freq: Math.max(8, size >> 3), oct: 2, seed: seed + 5, gain: 0.65 });
  const peb = N.worley(size, Math.max(6, size >> 5), seed + 6, 1, 2);
  const light = o.light || [0.735, 0.615, 0.435];
  const dark = o.dark || [0.44, 0.355, 0.245];
  const rf = o.rippleFreq || 11;

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, u = x * inv;
      const r1 = Math.sin((u * rf + v * (rf >> 2) + (bend[i] - 0.5) * 1.8) * TAU);
      const r2 = Math.sin((u * 2 - v * 7 + (bend2[i] - 0.5) * 1.4) * TAU);
      // Ripple crests are sharp and troughs are broad — sand is not a sine wave.
      // Amplitude follows the macro field: wind leaves patches it barely touched.
      const amp = 0.45 + macro[i] * 0.85;
      const rip = ((Math.sign(r1) * Math.pow(Math.abs(r1), 0.7)) * 0.7 + r2 * 0.22) * amp;
      const crest = N.clamp01(rip * 0.5 + 0.5);

      const stone = 1 - N.sstep(0.04, 0.26, peb.f1[i]);
      const t = N.clamp01(0.35 + macro[i] * 0.5 + crest * 0.5 - grains[i] * 0.25);
      let cr = N.mix(dark[0], light[0], t), cg = N.mix(dark[1], light[1], t), cb = N.mix(dark[2], light[2], t);
      cr = N.mix(cr, 0.42 + peb.id[i] * 0.16, stone * 0.5);
      cg = N.mix(cg, 0.38 + peb.id[i] * 0.14, stone * 0.5);
      cb = N.mix(cb, 0.33 + peb.id[i] * 0.12, stone * 0.5);

      S.cr[i] = cr; S.cg[i] = cg; S.cb[i] = cb;
      S.h[i] = 0.5 + rip * 0.055 + dune[i] * 0.06 + grains[i] * 0.02 + stone * 0.03;
      // Loose sand is uniformly rough; the variation comes from the packed
      // troughs, which are very slightly smoother.
      S.r[i] = 0.955 - crest * 0.03 + grains[i] * 0.03 - stone * 0.18;
      S.m[i] = 0;
    }
  }
  return finish(S, {
    normal: o.normal || 5, dirt: 0.30, dirtColor: [0.20, 0.16, 0.11], crevRough: 0.03,
  });
}

// ── desert hardpan ───────────────────────────────────────────────────────────

// The floor of the site: sun-baked dirt that has cracked into plates, gravel
// pressed into it, and sand drifted over the top wherever the wind put it. The
// drift mask is the important part — a ground plane with one uniform material
// is the tell that gives away every procedural level, and it costs one extra
// noise field to blend two.
export function ground(size, seed = 409, o = {}) {
  const S = surf(size), inv = 1 / size;
  const plates = N.worley(size, Math.max(4, size >> 6), seed + 1, 0.9, 2);
  const grav = N.worley(size, Math.max(10, size >> 4), seed + 2, 1, 2);
  const macro = N.fbm(size, { freq: 2, oct: 3, seed: seed + 3, lo: 4 });
  const drift = N.fbm(size, { freq: 3, oct: 3, seed: seed + 4, lo: 4 });
  const grit = N.fbm(size, { freq: Math.max(8, size >> 3), oct: 2, seed: seed + 5, gain: 0.6 });
  const bend = N.fbm(size, { freq: 3, oct: 2, seed: seed + 6, lo: 4 });
  const crackWob = N.fbm(size, { freq: 17, oct: 2, seed: seed + 7, lo: 2 });

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, u = x * inv;
      // Cell borders are the cracks; the wobble keeps them from looking like a
      // Voronoi diagram, which is exactly what they are.
      const crack = 1 - N.sstep(0.02, 0.13, plates.f2[i] + (crackWob[i] - 0.5) * 0.08);
      const stone = 1 - N.sstep(0.06, 0.30, grav.f1[i]);
      const rip = Math.sin((u * 9 + v * 2 + (bend[i] - 0.5) * 1.6) * TAU);
      // Sand wins most of the floor; the cracked hardpan shows through where the
      // wind has scoured it. Two materials on one plane is the whole point.
      const drifted = N.sstep(0.34, 0.62, drift[i] * 0.85 + macro[i] * 0.35);

      const dirtT = N.clamp01(0.4 + macro[i] * 0.45 + plates.id[i] * 0.25 - grit[i] * 0.3);
      let cr = N.mix(0.345, 0.52, dirtT), cg = N.mix(0.275, 0.415, dirtT), cb = N.mix(0.205, 0.295, dirtT);
      cr = N.mix(cr, 0.38 + grav.id[i] * 0.16, stone * 0.6);
      cg = N.mix(cg, 0.355 + grav.id[i] * 0.15, stone * 0.6);
      cb = N.mix(cb, 0.325 + grav.id[i] * 0.13, stone * 0.6);
      // Sand on top, lighter and yellower, hiding the cracks where it is deep.
      const sT = N.clamp01(0.45 + rip * 0.4 + grit[i] * 0.3);
      cr = N.mix(cr, N.mix(0.545, 0.775, sT), drifted);
      cg = N.mix(cg, N.mix(0.445, 0.655, sT), drifted);
      cb = N.mix(cb, N.mix(0.325, 0.475, sT), drifted);
      // Not every plate cracks: the macro field decides which stretches of
      // hardpan broke up and which merely dried.
      const ck = crack * (1 - drifted) * (0.25 + macro[i] * 1.0);
      cr *= 1 - ck * 0.5; cg *= 1 - ck * 0.5; cb *= 1 - ck * 0.46;

      S.cr[i] = cr; S.cg[i] = cg; S.cb[i] = cb;
      S.h[i] = 0.5 + (1 - plates.f1[i]) * -0.02 + grit[i] * 0.025 + stone * 0.05 * (1 - drifted * 0.6)
        - ck * 0.16 + rip * 0.035 * drifted;
      S.r[i] = 0.93 + grit[i] * 0.05 - stone * 0.20 - drifted * 0.02;
      S.m[i] = 0;
    }
  }
  return finish(S, {
    normal: o.normal || 6, dirt: 0.45, dirtColor: [0.14, 0.105, 0.07], crevRough: 0.05,
  });
}

// ── wood ─────────────────────────────────────────────────────────────────────

// Sun-bleached planking: grey silvered face, warm brown in the splits where the
// weather has not reached, grain that actually runs along the board.
export function wood(size, seed = 503, o = {}) {
  const S = surf(size), inv = 1 / size;
  const rows = o.rows || 4;
  const grainF = N.fbm(size, { fx: 3, fy: Math.max(8, size >> 3), oct: 4, seed: seed + 1 });
  const longF = N.fbm(size, { fx: 2, fy: 9, oct: 3, seed: seed + 2, lo: 2 });
  const macro = N.fbm(size, { freq: 2, oct: 3, seed: seed + 3, lo: 4 });
  const wob = N.fbm(size, { fx: 3, fy: 30, oct: 2, seed: seed + 4, lo: 2 });
  const grey = N.fbm(size, { freq: 7, oct: 3, seed: seed + 5, lo: 2 });
  const edge = N.fbm(size, { fx: 13, fy: 2, oct: 2, seed: seed + 6, lo: 2 });
  const rnd = mulberry32(seed * 6151);
  const off = new Float32Array(rows);
  for (let i = 0; i < rows; i++) off[i] = rnd();

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, u = x * inv;
      // Boards are sawn, not extruded: the gap between them wanders by a
      // millimetre or two down its length.
      const rv = v * rows + (edge[i] - 0.5) * 0.05;
      const row = ((Math.floor(rv) % rows) + rows) % rows;
      const inRow = rv - Math.floor(rv);
      const gap = 1 - N.sstep(0.010, 0.045, Math.min(inRow, 1 - inRow));

      // Grain: rings pulled into ridges, plus long fibre streaks. The ring
      // frequency shifts per board so no two boards read as the same plank.
      const rings = Math.abs((grainF[i] * (9 + off[row] * 6) + off[row] * 3) % 1 - 0.5) * 2;
      const grainL = 1 - N.sstep(0.25, 0.85, rings);
      const fibre = N.sstep(0.55, 0.95, longF[i]);
      const split = N.sstep(0.90, 0.99, longF[i] * 0.7 + wob[i] * 0.4);

      const silver = N.sstep(0.35, 0.85, grey[i] * 0.7 + macro[i] * 0.5);
      let cr = N.mix(0.455, 0.275, grainL), cg = N.mix(0.325, 0.185, grainL), cb = N.mix(0.205, 0.110, grainL);
      cr = N.mix(cr, 0.47, silver * 0.75); cg = N.mix(cg, 0.455, silver * 0.75); cb = N.mix(cb, 0.425, silver * 0.75);
      cr *= 1 - fibre * 0.08; cg *= 1 - fibre * 0.08; cb *= 1 - fibre * 0.07;
      cr *= 1 - split * 0.6; cg *= 1 - split * 0.6; cb *= 1 - split * 0.6;
      cr *= 1 - gap * 0.75; cg *= 1 - gap * 0.75; cb *= 1 - gap * 0.75;

      S.cr[i] = cr; S.cg[i] = cg; S.cb[i] = cb;
      S.h[i] = 0.5 + grainL * 0.03 + longF[i] * 0.03 - split * 0.10 - gap * 0.22
        + (off[row] - 0.5) * 0.02;
      // Weathered wood is chalky-rough; the unweathered grain valleys less so.
      S.r[i] = 0.80 + silver * 0.14 - grainL * 0.05 + fibre * 0.03;
      S.m[i] = 0;
    }
  }

  // Nail heads, two per board end, sunk and bleeding rust into the grain.
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < 4; k++) {
      if (rnd() < 0.25) continue;
      const cx = (k + 0.5) / 4 + (rnd() - 0.5) * 0.08, cy = (r + 0.5) / rows + (rnd() - 0.5) * 0.4 / rows;
      stampDisc(size, cx, cy, 0.010, (i, d) => {
        const head = 1 - N.sstep(0.6, 1.0, d);
        S.h[i] -= head * 0.07;
        S.cr[i] = N.mix(S.cr[i], 0.20, head * 0.8);
        S.cg[i] = N.mix(S.cg[i], 0.115, head * 0.8);
        S.cb[i] = N.mix(S.cb[i], 0.075, head * 0.8);
        S.r[i] = N.mix(S.r[i], 0.75, head);
        S.m[i] = N.mix(S.m[i], 0.5, head * 0.7);
      });
    }
  }
  return finish(S, { normal: o.normal || 6, dirt: 0.5, dirtColor: [0.10, 0.08, 0.055], crevRough: 0.06 });
}

// ── glass ────────────────────────────────────────────────────────────────────

// Dirty float glass. Almost all of the read is in the roughness and the alpha:
// clean glass is invisible, and what tells the player there is a pane there at
// all is the dust film, the rain runs and the greasy handprints near the edges.
export function glass(size, seed = 601, o = {}) {
  const S = surf(size);
  S.a = new Float32Array(S.n);
  const wave = N.fbm(size, { freq: 3, oct: 2, seed: seed + 1 });
  const dust = N.fbm(size, { freq: 5, oct: 4, seed: seed + 2 });
  const runs = N.fbm(size, { fx: 14, fy: 2, oct: 3, seed: seed + 3 });
  const spat = N.fbm(size, { freq: Math.max(8, size >> 4), oct: 2, seed: seed + 4 });
  const scr = N.fbm(size, { fx: size >> 2, fy: 6, oct: 2, seed: seed + 5 });

  for (let i = 0; i < S.n; i++) {
    const grime = N.clamp01(dust[i] * 0.8 + N.clamp01(runs[i] * 1.5 - 0.45) * 0.6
      + N.sstep(0.72, 0.92, spat[i]) * 0.5);
    const scratch = N.sstep(0.86, 0.98, scr[i]);
    S.cr[i] = N.mix(0.62, 0.50, grime) + scratch * 0.2;
    S.cg[i] = N.mix(0.70, 0.47, grime) + scratch * 0.2;
    S.cb[i] = N.mix(0.68, 0.42, grime) + scratch * 0.2;
    S.r[i] = 0.045 + grime * 0.42 + scratch * 0.25;
    S.m[i] = 0;
    S.h[i] = 0.5 + wave[i] * 0.05 + grime * 0.01;
    // Alpha carries the dirt, so a filthy pane occludes and a clean one does not.
    S.a[i] = N.clamp01(0.20 + grime * 0.5 + scratch * 0.2);
  }
  return finish(S, { normal: o.normal || 2, dirt: 0.15, dirtColor: [0.16, 0.17, 0.15], crevRough: 0.02 });
}

// ── hazard paint ─────────────────────────────────────────────────────────────

// Diagonal hazard stripes worn through to the concrete underneath. The stripe
// direction uses integer lattice steps so the diagonal still tiles, and the
// wear is heaviest along the stripe edges, where a painted lip chips first.
export function hazard(size, seed = 701, o = {}) {
  const S = surf(size), inv = 1 / size;
  const stripes = o.stripes || 5;
  const wob = N.fbm(size, { freq: 7, oct: 3, seed: seed + 1 });
  const wear = N.fbm(size, { freq: 4, oct: 4, seed: seed + 2 });
  const grit = N.fbm(size, { freq: 37, oct: 3, seed: seed + 3 });
  const scuff = N.fbm(size, { fx: 20, fy: 4, oct: 3, seed: seed + 4 });
  const macro = N.fbm(size, { freq: 2, oct: 2, seed: seed + 5 });
  const hot = o.color || [0.78, 0.545, 0.055];
  const cold = o.color2 || [0.075, 0.075, 0.082];

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, u = x * inv;
      const s = (u * stripes + v * stripes) + (wob[i] - 0.5) * 0.22;
      const band = s - Math.floor(s);
      const edge = Math.min(band, 1 - band);
      const stripe = N.sstep(0.24, 0.26, band) * (1 - N.sstep(0.74, 0.76, band));
      // Traffic wears a path; the path is a macro feature, the chipping a micro one.
      const worn = N.clamp01(N.sstep(0.42, 0.78, wear[i] * 0.7 + macro[i] * 0.5)
        + (1 - N.sstep(0.0, 0.05, edge)) * 0.55 + N.sstep(0.8, 0.95, grit[i]) * 0.4);

      let cr = N.mix(cold[0], hot[0], stripe), cg = N.mix(cold[1], hot[1], stripe), cb = N.mix(cold[2], hot[2], stripe);
      cr *= 0.86 + macro[i] * 0.28; cg *= 0.86 + macro[i] * 0.28; cb *= 0.86 + macro[i] * 0.28;
      const sub = 0.40 + grit[i] * 0.16;      // the concrete under the paint
      cr = N.mix(cr, sub, worn); cg = N.mix(cg, sub * 0.99, worn); cb = N.mix(cb, sub * 1.01, worn);
      const sc = N.sstep(0.78, 0.95, scuff[i]) * (1 - worn) * 0.5;
      cr *= 1 - sc * 0.5; cg *= 1 - sc * 0.5; cb *= 1 - sc * 0.48;

      S.cr[i] = cr; S.cg[i] = cg; S.cb[i] = cb;
      // Paint sits proud of the slab by a fraction of a millimetre; that lip is
      // what catches a grazing light and says "painted on" rather than "tinted".
      S.h[i] = 0.5 + (1 - worn) * 0.02 + grit[i] * 0.03 - worn * 0.02;
      S.r[i] = N.mix(0.52 + grit[i] * 0.10, 0.93, worn) - sc * 0.1;
      S.m[i] = 0;
    }
  }
  return finish(S, { normal: o.normal || 6, dirt: 0.5, dirtColor: [0.10, 0.09, 0.08], crevRough: 0.08 });
}

// ── rubber / asphalt ─────────────────────────────────────────────────────────

// Dark, matte, and easy to get wrong: a flat dark albedo with flat roughness
// reads as plastic. What makes rubber read is the polish — where a surface has
// been handled or driven on it goes smoother without going lighter.
export function rubber(size, seed = 809, o = {}) {
  const S = surf(size);
  const coarse = o.coarse || 0;              // 0 moulded rubber, 1 road asphalt
  const stip = N.worley(size, Math.max(8, size >> (coarse ? 4 : 3)), seed + 1, 1);
  const fine = N.fbm(size, { freq: Math.max(8, size >> 3), oct: 2, seed: seed + 2, gain: 0.6 });
  const macro = N.fbm(size, { freq: 2, oct: 3, seed: seed + 3, lo: 4 });
  const polish = N.fbm(size, { freq: 5, oct: 3, seed: seed + 4, lo: 4 });
  const oil = N.fbm(size, { freq: 4, oct: 4, seed: seed + 5, lo: 2 });

  for (let i = 0; i < S.n; i++) {
    const stone = 1 - N.sstep(0.05, 0.42, stip.f1[i]);
    const wornT = N.sstep(0.5, 0.85, polish[i] * 0.7 + macro[i] * 0.45);
    // Values are display-referred: a 4% reflectance black is ~0.22 here, and
    // authoring it as 0.04 is the classic way to end up with a hole in the frame.
    const base = (coarse ? 0.215 : 0.20) + macro[i] * 0.05 + fine[i] * 0.035;
    let cr = base, cg = base * 1.01, cb = base * 1.05;
    if (coarse) {
      cr = N.mix(cr, 0.30 + stip.id[i] * 0.12, stone * 0.75);
      cg = N.mix(cg, 0.295 + stip.id[i] * 0.115, stone * 0.75);
      cb = N.mix(cb, 0.29 + stip.id[i] * 0.11, stone * 0.75);
    }
    const slick = N.sstep(0.68, 0.92, oil[i]) * (coarse ? 1 : 0.4);
    cr *= 1 - slick * 0.35; cg *= 1 - slick * 0.32; cb *= 1 - slick * 0.18;

    S.cr[i] = cr; S.cg[i] = cg; S.cb[i] = cb;
    S.h[i] = 0.5 + fine[i] * 0.03 + stone * (coarse ? 0.05 : 0.02) - macro[i] * 0.01;
    S.r[i] = (coarse ? 0.88 : 0.80) + fine[i] * 0.08 - wornT * 0.30 - slick * 0.35;
    S.m[i] = coarse ? 0.0 : 0.03;
  }
  return finish(S, { normal: o.normal || 5, dirt: 0.35, dirtColor: [0.03, 0.03, 0.033], crevRough: 0.06 });
}

// ── flesh ────────────────────────────────────────────────────────────────────

export function flesh(size, seed = 907, o = {}) {
  const S = surf(size);
  const wx = N.fbm(size, { freq: 4, oct: 2, seed: seed + 1 });
  const wy = N.fbm(size, { freq: 4, oct: 2, seed: seed + 2 });
  const mottle = N.warp(N.fbm(size, { freq: 6, oct: 4, seed: seed + 3 }), size, wx, wy, 0.08);
  const veins = N.warp(N.fbm(size, { freq: 5, oct: 3, seed: seed + 4, mode: N.MODE.RIDGE }), size, wx, wy, 0.12);
  const pores = N.worley(size, Math.max(12, size >> 3), seed + 5, 1);
  const wet = N.fbm(size, { freq: 8, oct: 3, seed: seed + 6 });

  for (let i = 0; i < S.n; i++) {
    const m = mottle[i], vn = N.sstep(0.72, 0.95, veins[i]);
    const pore = 1 - N.sstep(0.0, 0.5, pores.f1[i]);
    let cr = 0.50 + m * 0.20, cg = 0.30 + m * 0.13, cb = 0.255 + m * 0.10;
    cr = N.mix(cr, 0.34, vn * 0.6); cg = N.mix(cg, 0.135, vn * 0.6); cb = N.mix(cb, 0.16, vn * 0.6);
    cr *= 1 - pore * 0.18; cg *= 1 - pore * 0.20; cb *= 1 - pore * 0.20;
    S.cr[i] = cr; S.cg[i] = cg; S.cb[i] = cb;
    S.h[i] = 0.5 + m * 0.05 + vn * 0.03 - pore * 0.06;
    S.r[i] = 0.62 + m * 0.10 - N.sstep(0.6, 0.9, wet[i]) * 0.34;
    S.m[i] = 0;
  }
  return finish(S, { normal: o.normal || 5, dirt: 0.3, dirtColor: [0.14, 0.06, 0.05], crevRough: 0.04 });
}

// ── walkway grating ──────────────────────────────────────────────────────────

// Alpha-cut steel grating for gantries and catwalks. The holes are the whole
// point — a solid plate with a grating texture painted on it fools nobody once
// there is a light source under it — so this one exports a cutout alpha and is
// the only surface that must stay UV-mapped rather than triplanar.
export function grate(size, seed = 1103, o = {}) {
  const S = surf(size), inv = 1 / size;
  S.a = new Float32Array(S.n);
  const bars = o.bars || 8, cross = o.cross || 4;
  const barW = o.barW || 0.16, crossW = o.crossW || 0.11;
  const wob = N.fbm(size, { freq: 9, oct: 2, seed: seed + 1, lo: 2 });
  const spangle = N.worley(size, Math.max(10, size >> 3), seed + 2, 1);
  const rustN = N.fbm(size, { freq: 4, oct: 4, seed: seed + 3, lo: 2 });
  const fine = N.fbm(size, { freq: Math.max(8, size >> 3), oct: 2, seed: seed + 4 });

  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, u = x * inv;
      // Bearing bars run one way, cross rods the other; a texel is metal if it
      // is inside either. The edges wobble by a fraction of a bar width, which
      // is enough to stop the cutout reading as a stencil.
      const du = Math.abs((u * bars) % 1 - 0.5), dv = Math.abs((v * cross) % 1 - 0.5);
      const wobble = (wob[i] - 0.5) * 0.03;
      const bw = barW + wobble, cw = crossW + wobble;
      const inBar = du < bw ? 1 : 0, inCross = dv < cw ? 1 : 0;
      const solid = Math.max(inBar, inCross);

      // Bar tops are rounded and, being walked on, polished; the flanks keep
      // their mill finish and their rust.
      const dome = inBar ? Math.sqrt(Math.max(0, 1 - (du / bw) * (du / bw))) : 0;
      const rust = N.sstep(0.55, 0.82, rustN[i] * 0.8 + (inBar && inCross ? 0.25 : 0));
      const spang = N.sstep(0.25, 0.75, spangle.f1[i]);

      // Hot-dip galvanising leaves a spangle — crystal facets a few millimetres
      // across, each catching the light slightly differently.
      let cr = 0.66 + spang * 0.10 + fine[i] * 0.05;
      let cg = 0.675 + spang * 0.10 + fine[i] * 0.05;
      let cb = 0.695 + spang * 0.09 + fine[i] * 0.05;
      cr = N.mix(cr, 0.36, rust); cg = N.mix(cg, 0.18, rust); cb = N.mix(cb, 0.08, rust);

      S.cr[i] = cr; S.cg[i] = cg; S.cb[i] = cb;
      S.a[i] = solid;
      S.h[i] = 0.5 + dome * 0.10 + (inCross ? 0.03 : 0) + fine[i] * 0.02 - rust * 0.02;
      S.r[i] = N.mix(0.46 - dome * 0.16 + fine[i] * 0.08, 0.93, rust);
      S.m[i] = N.mix(0.88, 0.3, rust);
    }
  }
  return finish(S, { normal: o.normal || 5, dirt: 0.4, dirtColor: [0.07, 0.06, 0.05], crevRough: 0.08 });
}

// ── the table ────────────────────────────────────────────────────────────────

// `hero` marks the surfaces that cover the most pixels in a typical frame and
// therefore earn the full resolution; everything else is generated at half and
// leans on the detail normal for close-range structure.
export const RECIPES = {
  concrete: { fn: concrete, hero: true },
  metal: { fn: metal },
  rust: { fn: (s, seed) => metal(s, seed, { rust: 0.42, paint: [0.30, 0.16, 0.09], paintRough: 0.85 }) },
  gunmetal: { fn: (s, seed) => metal(s, seed, { paint: [0.30, 0.305, 0.32], paintMetal: 0.86, paintRough: 0.44, rust: -0.24, panelsU: 1, panelsV: 1 }) },
  sand: { fn: sand },
  sandFloor: { fn: ground, hero: true },
  wood: { fn: wood },
  glass: { fn: glass },
  paint: { fn: hazard },
  dark: { fn: rubber },
  asphalt: { fn: (s, seed) => rubber(s, seed, { coarse: 1 }) },
  flesh: { fn: flesh },
  gantry: { fn: grate },
};
