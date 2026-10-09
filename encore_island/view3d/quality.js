// Encore Island 3D, quality tiers + adaptive resolution.
// A tier is a bundle of costs (post chain, MSAA, shadows, pixel ratio cap, model detail). Auto picks one from the device, then Adaptive
// watches real frame times and trades resolution first, tier second, so a phone holds its frame rate and a desktop gets the full show.
export const TIERS = {
  low: { name: 'low', post: false, msaa: false, bloom: 0, tilt: 0, levels: 0, half: false, shadows: false, shadowSize: 0, dprMax: 1, detail: 0, particles: 0.4, decor: 0.5 },
  medium: { name: 'medium', post: true, msaa: true, bloom: 0.5, tilt: 0, levels: 4, half: true, shadows: true, shadowSize: 1024, dprMax: 1.25, detail: 1, particles: 0.7, decor: 0.8 },
  high: { name: 'high', post: true, msaa: true, bloom: 0.58, tilt: 0.6, levels: 5, half: false, shadows: true, shadowSize: 2048, dprMax: 1.75, detail: 2, particles: 1, decor: 1 },
};
export const ORDER = ['low', 'medium', 'high'];

/** Look at the device (GPU string, touch, cores, memory) and return a tier name. `pref` forces one when it is not 'auto'. */
export function detectTier(renderer, pref = 'auto') {
  if (pref && pref !== 'auto' && TIERS[pref]) return pref;
  let gpu = '', mobile = false, cores = 8, mem = 8;
  try {
    const gl = renderer.getContext ? renderer.getContext() : renderer, ex = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ex ? String(gl.getParameter(ex.UNMASKED_RENDERER_WEBGL)) : '';
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''; mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
    cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 8; mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 8;
  } catch (e) { /* keep defaults */ }
  if (/swiftshader|llvmpipe|software|basic render|softpipe/i.test(gpu)) return 'low';
  if (mobile) return (cores <= 4 || mem <= 3) ? 'low' : 'medium';
  if (cores <= 2 || mem <= 2) return 'medium';
  return 'high';
}

/**
 * Frame-time governor. feed(dt) every rendered frame; it calls onChange({ scale, tier }) when it decides to move.
 * Resolution scale goes 1 -> 0.6 first; if still slow it drops a tier (and resets the scale to 0.85); after a long calm stretch it climbs back.
 */
export class Adaptive {
  constructor(tier, onChange, opts = {}) {
    this.tier = tier; this.scale = 1; this.onChange = onChange; this.min = opts.minScale ?? 0.6; this.floor = opts.floor ?? 'low'; this.ceil = tier; this.locked = !!opts.locked;
    this.acc = 0; this.n = 0; this.cool = 3; this.calm = 0; this.slowRuns = 0; this.t = 0;
  }
  feed(dt) {
    if (this.locked || dt > 0.25) return; // tab switches and breakpoints are not performance
    this.acc += dt; this.n++; this.t += dt; this.cool -= dt; if (this.t < 1) return;
    const avg = this.acc / this.n; this.acc = 0; this.n = 0; this.t = 0; if (this.cool > 0) return;
    if (avg > 0.0225) { this.slowRuns++; this.calm = 0; } else if (avg < 0.0185) { this.calm++; this.slowRuns = 0; } else { this.slowRuns = 0; }
    if (this.slowRuns >= 2) { this.slowRuns = 0; this.down(); }
    else if (this.calm >= 8) { this.calm = 0; this.up(); }
  }
  down() {
    if (this.scale > this.min + 0.01) { this.scale = Math.max(this.min, +(this.scale - 0.15).toFixed(2)); this.fire(); }
    else { const i = ORDER.indexOf(this.tier); if (i > ORDER.indexOf(this.floor)) { this.tier = ORDER[i - 1]; this.scale = 0.85; this.fire(); } }
  }
  up() {
    if (this.scale < 0.99) { this.scale = Math.min(1, +(this.scale + 0.1).toFixed(2)); this.fire(); }
    else { const i = ORDER.indexOf(this.tier), c = ORDER.indexOf(this.ceil); if (i < c) { this.tier = ORDER[i + 1]; this.scale = 0.8; this.fire(); } }
  }
  fire() { this.cool = 4; this.onChange({ scale: this.scale, tier: this.tier }); }
}
