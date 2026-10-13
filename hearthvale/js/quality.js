// Quality tiers for Hearthvale: pure logic (no three.js, no DOM needed), so it can be unit tested in Node.
//   TIERS      what each tier switches on (read by post.js and scene.js)
//   detectTier pick a starting tier from GPU renderer string, device pixel ratio, memory/cores hints, screen size
//   Adaptive   live controller with hysteresis: drops fast when frames stay slow, climbs back slowly and only
//              when comfortable, never oscillates (a failed climb locks the upgrade out for a growing time)
//   load/saveChoice  the manual choice persists in localStorage 'hearthvale.quality' ('auto' or a tier name)

export const ORDER = ['low', 'medium', 'high'];
export const KEY = 'hearthvale.quality';
const CAP_KEY = 'hearthvale.qualitycap';

/**
 * Every tier is a full description so nothing else has to know tier names.
 *   post     0 = render straight to the canvas (CSS filter fallback), 1 = scene target + grade pass
 *   msaa     samples of the scene render target (0 = none; low relies on the edge softening in the grade pass)
 *   bloom    bloom mips (0 = off); bloomK strength multiplier
 *   dof      tilt-shift blur on/off, rays = god rays, ao = depth contact AO, flare = sun disc and lens glow
 *   shadow   shadow map size (0 = off); water = 0 plain, 1 sparkle + depth tint, 2 + caustic ripples; cloudShadow 0/1
 *   prMax    cap on the device pixel ratio
 */
export const TIERS = {
  low:    { post: 1, msaa: 0, bloom: 0, bloomK: 0,    dof: 0, rays: 0, ao: 0, flare: 0, grain: 0, shadow: 1024, water: 0, cloudShadow: 0, rim: 0, prMax: 1.5 },
  medium: { post: 1, msaa: 2, bloom: 3, bloomK: 0.8,  dof: 0, rays: 0, ao: 0, flare: 1, grain: 0, shadow: 1536, water: 1, cloudShadow: 1, rim: 1, prMax: 2 },
  high:   { post: 1, msaa: 4, bloom: 4, bloomK: 1.0,  dof: 1, rays: 1, ao: 1, flare: 1, grain: 0, shadow: 2048, water: 2, cloudShadow: 1, rim: 1, prMax: 2 },
};
export const isTier = (t) => Object.prototype.hasOwnProperty.call(TIERS, t);

/** True for software rasterisers (SwiftShader, llvmpipe...): no use pretending they are GPUs. */
export const isSoftwareRenderer = (s) => /swiftshader|llvmpipe|software|softpipe|mesa offscreen|microsoft basic/i.test(String(s || ''));

/** Rough strength class of a GPU string: 0 weak, 1 mid, 2 strong, -1 unknown. */
export function gpuClass(renderer) {
  const s = String(renderer || '').toLowerCase();
  if (!s) return -1;
  if (isSoftwareRenderer(s)) return 0;
  if (/rtx|rx 6|rx 7|radeon pro|apple (m\d|gpu)|geforce (gtx 1[0-9]{3}|gtx 16|gtx 20)|arc a[5-9]|adreno \(tm\) (7[3-9]|8)|adreno 7[3-9]|adreno 8|mali-g7[1-9]|mali-g[89]|immortalis|xclipse 9|xclipse 5/.test(s)) return 2;
  if (/adreno( \(tm\))? ?(5|6[3-9]|7[0-2])|adreno \(tm\) (6[3-9]|7[0-2])|mali-g(5[2-9]|6|7[0-6])|apple a1[2-9]|powervr (gt|b)|geforce|radeon|intel\(r\) (iris|uhd|arc)|iris|vega|xclipse|tegra/.test(s)) return 1;
  if (/adreno( \(tm\))? ?[2-5]\d\d|adreno \(tm\) [2-5]\d\d|mali-4|mali-t|mali-g[1-5]\d?\b|powervr|sgx|vivante|intel.*(hd|gma)|llvm|angle \(.*(hd graphics [2-5])/.test(s)) return 0;
  return -1;
}

/**
 * Pick the starting tier. env = { renderer, dpr, mem (GB, 0 unknown), cores (0 unknown), mobile, width, height, software, cap }.
 *   cap = highest tier a previous session on this device had to fall back to (never start above it).
 */
export function detectTier(env = {}) {
  const dpr = env.dpr || 1, mem = env.mem || 0, cores = env.cores || 0, px = (env.width || 1280) * (env.height || 800) * dpr * dpr;
  const g = env.software ? 0 : gpuClass(env.renderer);
  let score = g < 0 ? (env.mobile ? 0.5 : 1.5) : g + (env.mobile ? 0 : 0.5);   // unknown: desktops lean medium/high, phones lean low/medium
  if (mem && mem <= 2) score -= 1; else if (mem && mem <= 4) score -= 0.5; else if (mem >= 8) score += 0.25;
  if (cores && cores <= 2) score -= 1; else if (cores && cores <= 4) score -= 0.25; else if (cores >= 8) score += 0.25;
  if (px > 4.5e6) score -= 0.5;                      // very many pixels to fill
  if (px > 8e6) score -= 0.5;
  let t = score >= 2.2 ? 'high' : score >= 1 ? 'medium' : 'low';
  if (env.software) t = 'low';
  if (env.cap && isTier(env.cap) && ORDER.indexOf(env.cap) < ORDER.indexOf(t)) t = env.cap;
  return t;
}

/** Device pixel ratio the renderer should start with for this tier. */
export const startPixelRatio = (tier, dpr) => Math.max(0.75, Math.min(dpr || 1, (TIERS[tier] || TIERS.medium).prMax));

/**
 * Live controller. Feed it every frame with step(dtSeconds). It returns null or { tier, pr, reason }.
 *   - ignores the first `warm` frames and spikes (dt > 0.2 s: tab switch, shader compile, GC)
 *   - exponential moving average of frame time; the first second after start is a "probe" with a quicker drop
 *   - drops: ms > downMs for downSecs  -> lower tier first; at the lowest tier lower the pixel ratio (floor prMin)
 *   - climbs: ms < upMs for upSecs and at least `cool` seconds since the last change -> restore pixel ratio first, then tier
 *   - hysteresis: a climb that is followed by a drop within `regretSecs` doubles the lock-out before the next climb (max 8 min)
 */
export class Adaptive {
  constructor(o = {}) {
    this.tier = o.tier || 'medium'; this.minTier = o.minTier || 'low'; this.maxTier = o.maxTier || 'high';
    this.pr = o.pr || 1; this.prMax = o.prMax || this.pr; this.prMin = o.prMin || 0.75;
    this.downMs = o.downMs || 24; this.upMs = o.upMs || 15; this.downSecs = o.downSecs || 1.6; this.upSecs = o.upSecs || 7;
    this.probeSecs = o.probeSecs ?? 1.2; this.warm = o.warm ?? 20; this.cool = o.cool ?? 6; this.regretSecs = o.regretSecs ?? 40;
    this.ms = 16.7; this.frames = 0; this.bad = 0; this.good = 0; this.sinceChange = 0; this.age = 0;
    this.lock = 0; this.lockLen = 30; this.lastUp = -1e9; this.clock = 0; this.enabled = o.enabled !== false;
  }
  setTier(t) { this.tier = t; this.bad = this.good = 0; this.sinceChange = 0; }
  _lo() { return ORDER.indexOf(this.minTier); }
  _hi() { return ORDER.indexOf(this.maxTier); }
  step(dt) {
    this.clock += dt; this.age += dt; this.sinceChange += dt; this.frames++;
    if (!this.enabled || this.frames <= this.warm) return null;
    if (dt > 0.2) return null;                                  // spike: not representative
    this.ms += (dt * 1000 - this.ms) * 0.08;
    if (this.lock > 0) this.lock -= dt;
    const probing = this.age < this.warm / 60 + this.probeSecs + 1;
    if (this.ms > this.downMs) { this.bad += dt; this.good = 0; } else if (this.ms < this.upMs) { this.good += dt; this.bad = Math.max(0, this.bad - dt * 2); } else { this.bad = Math.max(0, this.bad - dt); this.good = Math.max(0, this.good - dt * 0.5); }
    const i = ORDER.indexOf(this.tier);
    if (this.bad >= (probing ? this.downSecs * 0.6 : this.downSecs) && this.sinceChange >= 1.5) {   // at least 1.5 s between drops: judge the effect of the last one
      this.bad = 0; this.good = 0; this.sinceChange = 0;
      if (this.clock - this.lastUp < this.regretSecs) { this.lockLen = Math.min(480, this.lockLen * 2); this.lock = this.lockLen; }
      if (i > this._lo()) { this.tier = ORDER[i - 1]; return { tier: this.tier, pr: this.pr, reason: 'slow' }; }
      if (this.pr > this.prMin + 0.001) { this.pr = Math.max(this.prMin, +(this.pr - 0.1).toFixed(2)); return { tier: this.tier, pr: this.pr, reason: 'slow-pr' }; }
      return null;
    }
    if (this.good >= this.upSecs && this.sinceChange >= this.cool && this.lock <= 0) {
      this.good = 0; this.sinceChange = 0;
      if (this.pr < this.prMax - 0.001) { this.pr = Math.min(this.prMax, +(this.pr + 0.1).toFixed(2)); return { tier: this.tier, pr: this.pr, reason: 'fast-pr' }; }
      if (i < this._hi()) { this.tier = ORDER[i + 1]; this.lastUp = this.clock; return { tier: this.tier, pr: this.pr, reason: 'fast' }; }
    }
    return null;
  }
}

// ---------- persistence (every access guarded: private windows and blocked storage must not break anything) ----------
export function loadChoice(storage) {
  try { const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null); const v = s && s.getItem(KEY); return v === 'auto' || isTier(v) ? v : 'auto'; } catch { return 'auto'; }
}
export function saveChoice(v, storage) {
  try { const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null); if (s) s.setItem(KEY, v); } catch { /* blocked */ }
}
/** A tier the live controller had to drop to on this device; used as a start cap for 14 days. */
export function loadCap(storage, now = Date.now()) {
  try { const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null); const [t, at] = String((s && s.getItem(CAP_KEY)) || '').split(':'); return isTier(t) && now - (+at || 0) < 14 * 864e5 ? t : null; } catch { return null; }
}
export function saveCap(t, storage, now = Date.now()) {
  try { const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null); if (s && isTier(t)) s.setItem(CAP_KEY, t + ':' + now); } catch { /* blocked */ }
}
