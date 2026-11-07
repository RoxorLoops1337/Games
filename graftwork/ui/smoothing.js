// imageSmoothingQuality policy (pure, no DOM). Round 2 perf: setting 'high' for every frame cost about a quarter of a title frame on a software raster,
// but it only matters when a big source is shrunk a lot (mipmapped filtering stops shimmer and aliasing). Everything else is a 1:1 or mild
// scale where bilinear ('low') is visually the same: the sharpness the owner asked for comes from the DEVICE resolution of the sources
// (@2x sprites, face caches at device scale), not from the filter.
//   ratio = source px per DEVICE px along the worse axis (2 = the source is twice as wide as it is drawn)
import { FLAGS } from './perf_flags.js';
// upscale: magnification above which 'high' (bicubic, sharper than bilinear) is kept for a BIG source (upMin px on its short side: the 1280x720 backdrops and plates that
// a phone draws 1.3 to 1.9x); 0 = never. Measured at no cost in combat and about 7 percent in the Ward, and it keeps the look the owner asked for.
export const SMOOTH = { downscale: 2, minSource: 96, upscale: FLAGS.smoothUp, upMin: 512 };
export function smoothingFor(srcW, srcH, dstW, dstH) {
  const sw = Math.abs(srcW), sh = Math.abs(srcH), dw = Math.abs(dstW), dh = Math.abs(dstH);
  if (!(sw > 0 && sh > 0 && dw > 0 && dh > 0)) return 'low';
  if (Math.min(sw, sh) < SMOOTH.minSource) return 'low'; // a small source cannot alias much and is cheap anyway
  const r = Math.max(sw / dw, sh / dh);
  if (r > SMOOTH.downscale) return 'high';
  if (SMOOTH.upscale > 0 && r < 1 / SMOOTH.upscale && Math.min(sw, sh) >= SMOOTH.upMin) return 'high';
  return 'low';
}
// device px per logical px of the current transform (uniform part)
export function deviceScale(ctx) {
  if (!ctx || typeof ctx.getTransform !== 'function') return NaN;
  const m = ctx.getTransform(); if (!m || typeof m.a !== 'number') return NaN; return Math.hypot(m.a, m.b) || 1; // NaN: a fake context, callers fall back to their default
}
// Sets ctx.imageSmoothingQuality only when it differs. It reads the live value instead of remembering one: ctx.save()/restore() also restore it.
export function setSmoothing(ctx, q) {
  try { if (ctx.imageSmoothingQuality !== q) ctx.imageSmoothingQuality = q; } catch (e) { /* fake ctx */ }
}
// drawImage with the policy applied: dx/dy/dw/dh in the CURRENT transform's units, src size from the image. Returns the quality used.
export function drawImageSmart(ctx, img, dx, dy, dw, dh, sw, sh) {
  if (sw === undefined) { sw = img.naturalWidth || img.width || 0; sh = img.naturalHeight || img.height || 0; }
  const k = deviceScale(ctx), q = smoothingFor(sw, sh, dw * k, dh * k);
  setSmoothing(ctx, q);
  ctx.drawImage(img, dx, dy, dw, dh);
  return q;
}
// the per-frame default: the frame loop resets to 'low'; code that needs 'high' goes through drawImageSmart
export const DEFAULT_QUALITY = 'low';
export function resetSmoothing(ctx) { try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = DEFAULT_QUALITY; } catch (e) { /* fake ctx */ } }

// Instance-level drawImage: the quality is chosen per call from the real source and device sizes, so no screen needs to know about it.
// Only the main context gets it (offscreen caches keep the browser default 'low'). 3-argument calls are 1:1 and stay as they are.
export function installSmartDraw(ctx) {
  if (!ctx || ctx.__smart || typeof ctx.drawImage !== 'function' || typeof ctx.getTransform !== 'function') return false;
  const raw = ctx.drawImage;
  const stats = ctx.__smart = { calls: 0, high: 0 };
  ctx.drawImage = function (im, a, b, c, d, e, f, g, h) {
    const n = arguments.length;
    if (n >= 5) {
      let sw, sh, dw, dh;
      if (n >= 9) { sw = c; sh = d; dw = g; dh = h; } else { sw = im.naturalWidth || im.width || 0; sh = im.naturalHeight || im.height || 0; dw = c; dh = d; }
      let q = 'low';
      if (sw >= SMOOTH.minSource && sh >= SMOOTH.minSource) { const m = this.getTransform(), k = m && typeof m.a === 'number' ? Math.hypot(m.a, m.b) : NaN; q = smoothingFor(sw, sh, dw * k, dh * k); }
      stats.calls++; if (q === 'high') stats.high++;
      if (this.imageSmoothingQuality !== q) this.imageSmoothingQuality = q;
    }
    return raw.apply(this, arguments);
  };
  return true;
}
