// PUPPET WALK (design/ART_MODULAR.md section 7): a walk that is correct by construction and needs no new art. The standing sprite is analysed once from its own
// alpha: the hip line (where the silhouette opens into two legs) and the valley column between the legs. The sprite is then cut into a LEFT leg, a RIGHT leg and an
// UPPER body (cached offscreen canvases) and posed like a cardboard puppet with a real step cycle. Actors without two legs get a body gait (hop, waddle, roll, flap).
//
//   analyseAlpha(alpha, w, h)          pure: { ok, legs, hip, valley, ... } all in fractions of the image (testable with synthetic masks)
//   classify(id, an)                   'legged' | 'hop' | 'waddle' | 'roll' | 'flap'  (data/gaits.js entry wins, else the analysis)
//   geomOf(an, tune) / geomFor(e, tune) { D0, pu, legH, H, stride } the leg geometry the pose needs, in figure heights. pu = TUCK: how far the leg part runs UP under
//                                      the garment, so the real hip (the pivot) is hidden under cloth and the hem never opens a gap on a swing
//   walkPuppet(phase, speed, kind, tune, out, geom)   the pose at a stride phase (steps, a contact at every integer; one foot per step, cycle = 2 steps)
//   footPoint(pose, side, geom)        where a leg part's sole ends up, from the part transform alone (the check that drawing and the step cycle agree)
//   prepare(img, def, id, scale)       analysis + part canvases, cached per image and size bucket (null in node / when pixels cannot be read)
//   drawLegged(g, pp, pose, s, ox, oy) legs behind (each leg = tucked extension + shin + boot slices), then the upper body over them, then the swaying hem band
// Units: x is forward (+) and y is up (+) for feet, `down` is the body drop, everything in FIGURE HEIGHTS (H = the opaque height of the sprite). Angles in radians,
// canvas sign (+ = clockwise); a forward swing of a hanging leg therefore uses a NEGATIVE angle. No allocation per frame: walkPuppet fills the `out` it is given.
import { gaitEntry } from '../data/gaits.js';
import { clampOrdered as clamp, TAU, offscreen as mkc } from './util.js';

// tuck: leg part runs this far (figure heights) up under the garment; garment: secondary sway of the hem band (0 = rigid cloth); hemLag: how many steps the cloth lags
// the legs; strideMax: the longest step (figure heights) the stride may reach (the Ward pace is tuned against it, see ui/ward.js PACE)
export const TUNE = { swing: 32, lift: 0.085, bob: 0.024, sway: 0.014, lean: 0.045, twist: 0.04, squash: 0.05, duty: 0.58, strideK: 1, tuck: 0.18, garment: 1, hemLag: 0.16, strideMax: 0.44 };
export const TUNE_DEFAULT = { ...TUNE };
const DEG = Math.PI / 180;
const CLIP_MARGIN = 0.04; // legs are clipped above the hip row minus this (figure heights)
const BOOT = 0.14; // the lowest part of the visible leg (fraction of it) is drawn unscaled, so a stretch never distorts the boot
const HEM_BAND = 0.2; // the garment band: this much of the figure height above the hip swings as cloth
export const DEBUG = { outlines: false }; // the lab draws the leg slices and the pivots
export const SWAY_MAX = 0.17, HEM_DY_MAX = 0.02; // bounds of the garment sway the tests check (skew per unit height, figure heights)
const sstep = (u) => u * u * (3 - 2 * u);

// ---------------------------------------------------------------- analysis (pure)
// alpha: Uint8 values 0..255 (w x h). Returns fractions of the image so the result is the same for @1x, @2x and @3x files.
function alphaOfRGBA(px, w, h) { const a = new Uint8Array(w * h); for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3]; return a; }
export function analyseAlpha(a, w, h, o = {}) {
  const T = o.thr === undefined ? 40 : o.thr;
  let top = -1, bot = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y * w + x] > T) { if (top < 0) top = y; bot = y; if (x < left) left = x; if (x > right) right = x; }
  if (top < 0) return { ok: false, legs: false, reason: 'empty' };
  const Hb = bot - top + 1, Wb = right - left + 1, minRun = Math.max(2, Math.round(0.04 * Wb)), merge = Math.max(1, Math.round(0.012 * Wb));
  const runs = []; // reused per call: [s0, e0, s1, e1, ...]
  const runsAt = (y) => { // significant runs of a row, short gaps merged
    runs.length = 0; let s = -1, e = -1;
    for (let x = left; x <= right + 1; x++) {
      const on = x <= right && a[y * w + x] > T;
      if (on) { if (s < 0) s = x; else if (x - e > merge + 1) { if (e - s + 1 >= minRun) runs.push(s, e); s = x; } e = x; }
    }
    if (s >= 0 && e - s + 1 >= minRun) runs.push(s, e);
    return runs.length / 2;
  };
  const out = { ok: true, top: top / h, bot: (bot + 1) / h, left: left / w, right: (right + 1) / w, legs: false, hip: 0, valley: 0, legTopL: 0, legTopR: 0, footL: 0, footR: 0, bottomFill: 0, reason: '' };
  // bottom fill: how much of the width the bottom band covers (a slime sits on a wide solid base, a pair of legs does not)
  { const b0 = Math.max(top, bot - Math.round(0.12 * Hb)); let sum = 0, n = 0; for (let y = b0; y <= bot; y++) { let c = 0; for (let x = left; x <= right; x++) if (a[y * w + x] > T) c++; sum += c / Wb; n++; } out.bottomFill = sum / Math.max(1, n); }
  const y0 = bot - Math.floor(0.55 * Hb), n2 = new Int8Array(h), gapC = new Float32Array(h); // run count per row and the centre of the gap between the two widest runs
  for (let y = bot; y >= y0; y--) {
    const n = runsAt(y); n2[y] = n;
    if (n >= 2) { // gap centre between the two widest runs (adjacent in x order)
      let bi = -1, bw = -1, bj = -1, bw2 = -1; for (let i = 0; i < n; i++) { const ww = runs[i * 2 + 1] - runs[i * 2]; if (ww > bw) { bw2 = bw; bj = bi; bw = ww; bi = i; } else if (ww > bw2) { bw2 = ww; bj = i; } }
      const p = Math.min(bi, bj), q = Math.max(bi, bj); gapC[y] = (runs[p * 2 + 1] + runs[q * 2]) / 2 + 0.5;
    }
  }
  // the legs begin at the lowest row (within the bottom quarter) that already shows two legs, and reach up while two legs persist (short single-run misses allowed)
  let start = -1; for (let y = bot; y >= bot - Math.floor(0.3 * Hb); y--) if (n2[y] >= 2) { start = y; break; }
  if (start < 0) { out.reason = 'no valley in the lower body'; return out; }
  let hip = start, miss = 0; const allow = Math.max(2, Math.round(0.03 * Hb));
  for (let y = start; y >= y0; y--) { if (o.minHip && y / h < o.minHip) break; if (n2[y] >= 2) { hip = y; miss = 0; } else if (++miss > allow) break; }
  const legH = (bot - hip + 1) / Hb; let two = 0, three = 0, rows = 0; const gaps = [];
  for (let y = hip; y <= bot; y++) { rows++; if (n2[y] >= 2) { two++; gaps.push(gapC[y]); } if (n2[y] >= 4) three++; }
  if (legH < 0.07 || legH > 0.56) { out.reason = 'leg band ' + legH.toFixed(2); return out; }
  if (two / rows < 0.45) { out.reason = 'legs merge (' + (two / rows).toFixed(2) + ')'; return out; }
  if (three / rows > 0.4) { out.reason = 'more than two legs'; return out; }
  gaps.sort((p, q) => p - q); const valley = gaps[gaps.length >> 1];
  // leg tops and soles: centroid of the opaque columns of each half in the first rows below the hip and in the bottom rows
  const cen = (ya, yb, xa, xb) => { let s = 0, c = 0; for (let y = ya; y <= yb; y++) for (let x = xa; x < xb; x++) if (a[y * w + x] > T) { s += x + 0.5; c++; } return c ? s / c : (xa + xb) / 2; };
  const vx = Math.round(valley), th = Math.min(bot, hip + Math.max(1, Math.round(0.03 * Hb))), bh = Math.max(hip, bot - Math.max(1, Math.round(0.04 * Hb)));
  out.legs = true; out.hip = hip / h; out.valley = valley / w; out.hipRow = hip; out.legH = legH;
  out.legTopL = cen(hip, th, left, vx) / w; out.legTopR = cen(hip, th, vx, right + 1) / w; out.footL = cen(bh, bot, left, vx) / w; out.footR = cen(bh, bot, vx, right + 1) / w;
  out.gapW = (() => { let s = 0, c = 0; for (let y = hip; y <= bot; y++) if (n2[y] >= 2) { s++; c++; } return c ? s / c : 0; })();
  // the left and right halves must both hold something of the leg band
  const half = (xa, xb) => { let c = 0; for (let y = hip; y <= bot; y++) for (let x = xa; x < xb; x++) if (a[y * w + x] > T) c++; return c / (rows * Wb); };
  if (half(left, vx) < 0.02 || half(vx, right + 1) < 0.02) { out.legs = false; out.reason = 'one half is empty'; }
  return out;
}

// the gait of an actor: a data/gaits.js entry wins, else legs found = legged, else a wide solid base hops and anything else waddles
export function classify(id, an) {
  const e = gaitEntry(id); if (e && e.gait) return e.gait;
  if (an && an.ok && an.legs) return 'legged';
  if (an && an.ok && an.bottomFill >= 0.7) return 'hop';
  return an && an.ok ? 'waddle' : null;
}
// leg geometry in figure heights. The pivot of each leg is a virtual hip above the visible leg top (the leg is hidden under the skirt or coat), pu above it.
export function geomOf(an, tune = TUNE) {
  const H = an && an.ok ? an.bot - an.top : 1, legH = an && an.legs ? (an.bot - an.hip) / H : 0.3, pu = clamp(tune.tuck === undefined ? TUNE.tuck : tune.tuck, 0, 0.4), D0 = legH + pu;
  return { H, legH, pu, D0, ex: 0, stride: strideOf({ D0 }, tune) };
}
// the geometry of a prepared actor for a tune (the tuck can differ per actor and per lab slider), cached per tuck
export function geomFor(e, tune = TUNE) {
  const k = (tune.tuck === undefined ? TUNE.tuck : tune.tuck).toFixed(3); if (!e.geoms) e.geoms = new Map();
  let g = e.geoms.get(k); if (!g) { g = e.an && e.an.ok ? geomOf(e.an, tune) : e.geom; e.geoms.set(k, g); if (e.geoms.size > 12) e.geoms.delete(e.geoms.keys().next().value); }
  return g;
}
// per actor tune: data/gaits.js `tune` (and the short form `tuck`, `garment`) over the global TUNE (which the lab edits live)
export function tuneFor(id) {
  const e = gaitEntry(id); if (!e || !(e.tune || e.tuck !== undefined || e.garment !== undefined)) return TUNE;
  if (!e.tuneObj) { e.tuneObj = Object.assign(Object.create(TUNE), e.tune || null); if (e.tuck !== undefined) e.tuneObj.tuck = e.tuck; if (e.garment !== undefined) e.tuneObj.garment = e.garment; }
  return e.tuneObj;
}
// steps per second at a walking speed (px/s) for a stride (figure heights) and a figure height in px: what the eye reads as the pace of the legs
export const cadence = (speed, stride, figPx) => (stride > 0 && figPx > 0 ? speed / (stride * figPx) : 0);
// stride length per STEP (one foot to the other), in figure heights: what the legs can reach with the swing limit, so no foot is dragged farther than the legs allow
export function strideOf(geom, tune = TUNE) {
  const D0 = geom && geom.D0 ? geom.D0 : 0.3;
  // reach: the swing limit at the foot's lowest lifted height (half the lift is used as the typical raise), so a short leg takes a shorter step and the leg part never has to slide off its hip
  return clamp(1.1 * (D0 - 0.5 * liftOf(geom, tune)) * Math.tan(tune.swing * DEG) / tune.duty, 0.2, tune.strideMax || 0.44) * (tune.strideK || 1);
}
// the foot lift in figure heights: at most 40 percent of the visible leg, so a short leg is never lifted out of its garment
const liftOf = (geom, tune = TUNE) => (geom && geom.legH ? Math.min(tune.lift, 0.4 * geom.legH) : tune.lift);
export const STRIDE_OF = { legged: 0.3, hop: 0.55, waddle: 0.3, roll: 0.36, flap: 0.42 };

// ---------------------------------------------------------------- the pose (pure)
const newLeg = () => ({ dx: 0, dy: 0, rot: 0, sy: 1, se: 1, ss: 1, len: 0 }); // se: stretch of the hidden extension, ss: of the shin, len: the leg length drawn (figure heights)
export function newPose() {
  return { kind: 'legged', ph: 0, w: 0, hop: 0, down: 0, sway: 0, lean: 0, twist: 0, sq: 1, sx: 1, rock: 0, hem: 0, hemS: 1, hemDy: 0, footLx: 0, footLy: 0, footRx: 0, footRy: 0, plantL: true, plantR: true, plant: 'LR', lead: 'L', stride: 0.3, a: 0, legL: newLeg(), legR: newLeg() };
}
const footX = (f, a, B) => { // forward offset of a foot from its rest spot over its own cycle f (0 = contact); stance moves back exactly as fast as the body moves forward
  if (f < B) return a * (1 - 2 * f / B);
  return -a + 2 * a * sstep((f - B) / (1 - B));
};
const footLift = (f, B, lift) => (f < B ? 0 : lift * Math.pow(Math.sin(Math.PI * (f - B) / (1 - B)), 0.85));
// speed: gait intensity 0..1 (the Ward's smoothed speed). At 1 it is the steady walk the tests check; below it the swing, bob and the foot spread fade to the idle pose.
export function walkPuppet(phase, speed, kind, tune = TUNE, out = newPose(), geom = null) {
  const ph = phase > 0 ? phase : 0, k = speed < 0 ? 0 : speed > 1.5 ? 1.5 : speed, sp = clamp(k, 0, 1), T = tune || TUNE;
  const o = out; o.kind = kind; o.ph = ph; o.w = k;
  o.hem = 0; o.hemS = 1; o.hemDy = 0; o.hop = 0; o.down = 0; o.sway = 0; o.lean = 0; o.twist = 0; o.sq = 1; o.sx = 1; o.rock = 0; o.plantL = o.plantR = false; o.plant = ''; o.footLx = o.footLy = o.footRx = o.footRy = 0;
  const fr = ph - Math.floor(ph), step = Math.floor(ph);
  if (kind === 'legged') {
    const g = geom || { D0: 0.3 }, B = T.duty, S = strideOf(g, T), a = B * S, D0 = g.D0, rest = sstep(clamp((k - 0.25) / 0.5, 0, 1)) || 0; // rest: feet together when the walk fades
    o.stride = S; o.a = a; o.lead = step % 2 === 0 ? 'L' : 'R';
    const fL = (ph * 0.5) - Math.floor(ph * 0.5), fR = (fL + 0.5) % 1;
    const LF = liftOf(g, T), xL = footX(fL, a, B) * rest, xR = footX(fR, a, B) * rest, yL = footLift(fL, B, LF) * sp, yR = footLift(fR, B, LF) * sp;
    o.footLx = xL; o.footLy = yL; o.footRx = xR; o.footRy = yR; o.plantL = fL < B; o.plantR = fR < B; o.plant = (o.plantL ? 'L' : '') + (o.plantR ? 'R' : '');
    o.down = T.bob * sp * 0.5 * (1 + Math.cos(TAU * (ph - 0.06)));
    o.sway = -T.sway * sp * Math.sin(TAU * (fL - 0.04));
    const pulse = Math.exp(-fr * 9);
    o.sq = 1 - T.squash * sp * pulse; // squash on the plant
    o.lean = T.lean * sp * (1 + 0.15 * Math.sin(Math.PI * ph)); // a lean into the direction
    o.twist = -T.twist * sp * Math.cos(Math.PI * ph); // the upper body counter-swings against the leading leg
    legSolve(o.legL, xL, yL, o, T, g); legSolve(o.legR, xR, yR, o, T, g);
    // GARMENT (follow-through): the hem band lags the legs by hemLag steps (cloth by sine lag), is pushed forward by the leading thigh, trails back a little while walking,
    // lifts when a foot lifts and sinks a beat after the body. Evaluated from the lagged phase, so it stays a pure function of the phase.
    const G = (T.garment === undefined ? 1 : T.garment) * sp * rest;
    if (G) {
      const p2 = ph - (T.hemLag === undefined ? 0.16 : T.hemLag), f2 = (p2 * 0.5) - Math.floor(p2 * 0.5), f3 = (f2 + 0.5) % 1;
      const dr = clamp((footX(f2, a, B) - footX(f3, a, B)) / (2 * a), -1, 1), liftN = clamp((footLift(f2, B, LF) + footLift(f3, B, LF)) / LF, 0, 1.2);
      o.hem = G * (-0.04 + 0.13 * dr);
      o.hemDy = G * (T.bob * 0.5 * (1 + Math.cos(TAU * (p2 - 0.06))) - T.bob * 0.5 * (1 + Math.cos(TAU * (ph - 0.06)))) * sp; // how far the hem trails the body drop (figure heights)
      o.hemS = 1 - G * 0.05 * liftN + o.hemDy / HEM_BAND; // the band hangs from its top edge: the lift and the lag are a stretch of the band, so no seam can open
    }
    return o;
  }
  o.stride = STRIDE_OF[kind] || 0.3;
  if (kind === 'hop') { // crouch, spring, land and squash
    const u = fr, air = Math.sin(Math.PI * u), cr = Math.pow(0.5 * (1 + Math.cos(TAU * u)), 5);
    o.hop = 0.16 * air * sp; o.sq = 1 + (0.13 * air - 0.2 * cr) * sp; o.sx = 1 - (0.1 * air - 0.16 * cr) * sp; o.lean = 0.05 * sp * air; o.plantL = o.plantR = u < 0.08 || u > 0.92; o.plant = o.plantL ? 'LR' : '';
  } else if (kind === 'waddle') { // corner to corner: tip onto one edge, then the other, a tiny bounce between
    o.rock = 0.1 * sp * Math.cos(Math.PI * ph); o.hop = 0.012 * sp * Math.abs(Math.sin(Math.PI * ph)); o.sway = 0.012 * sp * Math.sin(Math.PI * ph); o.lean = 0.03 * sp;
    o.sq = 1 - 0.025 * sp * Math.exp(-fr * 8); o.plantL = step % 2 === 0; o.plantR = !o.plantL; o.plant = o.plantL ? 'L' : 'R';
  } else if (kind === 'roll') { // a glide: wheel lean, a rattle twice per cycle, never a hop
    o.lean = 0.04 * sp; o.rock = 0.012 * sp * Math.sin(Math.PI * ph); o.down = 0.006 * sp * Math.sin(TAU * ph); o.sway = 0.004 * sp * Math.sin(TAU * ph + 1);
    o.plantL = o.plantR = true; o.plant = 'LR';
  } else { // flap: hover with a wing-beat squash
    o.hop = (0.05 + 0.035 * Math.sin(TAU * ph)) * sp; o.sq = 1 + 0.045 * Math.sin(TAU * ph + 1.2) * sp; o.sx = 1 - 0.03 * Math.sin(TAU * ph + 1.2) * sp; o.lean = 0.07 * sp; o.rock = 0.02 * Math.sin(TAU * ph * 0.5) * sp;
  }
  return o;
}
// One leg part: the foot target is in the GROUND frame (rest spot + forward offset, lifted by `lift`), the part is rotated toward it from the moved hip (clamped to
// the swing limit), and its length follows the distance to the foot: the HIDDEN extension under the garment takes the stretch and most of the squash (up to +12 percent
// and down to 50 percent), the shin the small rest (the boot is never scaled), and the part is translated by whatever is left, so the foot lands on the target exactly.
// Planted foot = target does not move.
function legSolve(L, off, lift, o, T, g) {
  const D0 = g.D0, e0 = g.pu !== undefined ? g.pu : D0 * 0.28, v0 = Math.max(1e-6, D0 - e0 - BOOT * (D0 - e0));
  // hip (virtual pivot) moved by the sway and the drop: (sway, +down); the foot is at (off, D0 - lift) from the REST pivot (ground frame, y down)
  const ux = off - o.sway, uy = D0 - lift - o.down, lim = T.swing * DEG;
  let th = Math.atan2(ux, uy); if (th > lim) th = lim; else if (th < -lim) th = -lim; // th: the foot swings toward +x
  const delta = Math.hypot(ux, uy) - D0;
  let dE, dS;
  if (delta < 0) { dE = Math.max(delta, -0.5 * e0); dS = Math.max(delta - dE, -0.15 * v0); } else { dE = Math.min(delta, 0.12 * e0); dS = Math.min(delta - dE, 0.08 * v0); }
  const len = D0 + dE + dS, rot = -th; // canvas rotation: a foot toward +x is a negative angle
  L.se = e0 > 0 ? 1 + dE / e0 : 1; L.ss = 1 + dS / v0; L.len = len; L.sy = len / D0;
  // part point (0, len) after rotate(rot): (len*sin(th), len*cos(th)); translate by what remains
  L.rot = rot; L.dx = off - len * Math.sin(th); L.dy = (D0 - lift) - len * Math.cos(th);
}
// where the sole of a leg part ends up (ground frame, relative to the REST pivot, x forward, y DOWN) from the part transform alone
export function footPoint(pose, side, geom, out = { x: 0, y: 0 }) {
  const L = side === 'L' ? pose.legL : pose.legR, D0 = geom && geom.D0 ? geom.D0 : 0.3, th = -L.rot, len = L.len || L.sy * D0;
  out.x = L.dx + len * Math.sin(th); out.y = L.dy + len * Math.cos(th); return out;
}

// ---------------------------------------------------------------- prepare (offscreen parts, cached per image and size bucket)
const CACHE = new WeakMap(); // img -> { an, kind, parts: Map(bucket -> parts) }
const BUCKETS = [0.25, 0.375, 0.5, 0.75, 1];
const bucketFor = (r) => { for (const b of BUCKETS) if (r <= b * 1.04) return b; return 1; };
function analyseImage(img, o) {
  const iw = img.naturalWidth || img.width || 0, ih = img.naturalHeight || img.height || 0; if (!iw || !ih) return null;
  const opt = o || {}, k = Math.min(1, 160 / Math.max(iw, ih)); o = mkc(iw * k, ih * k); if (!o || !o.x.getImageData) return null;
  try { o.x.drawImage(img, 0, 0, o.c.width, o.c.height); const d = o.x.getImageData(0, 0, o.c.width, o.c.height).data; if (!d || d.length < o.c.width * o.c.height * 4) return null; const r = analyseAlpha(alphaOfRGBA(d, o.c.width, o.c.height), o.c.width, o.c.height, opt); return r; } catch (e) { return null; }
}
// a hand-set split (data/gaits.js `split: { hip, valley }`, fractions of the image) for figures whose legs touch in the silhouette, so the alpha cannot find the valley
function applySplit(an, sp) {
  if (!an || !an.ok || !sp) return an;
  const v = sp.valley, hip = sp.hip;
  Object.assign(an, { legs: true, manual: true, hip, valley: v, legH: (an.bot - hip) / (an.bot - an.top), legTopL: v - 0.035, legTopR: v + 0.035, footL: v - 0.04, footR: v + 0.04, reason: '' });
  return an;
}
// info for an actor image: { an, kind, geom } or null (pixels unreadable and no table entry). Cached.
export function infoOf(img, id) {
  let e = CACHE.get(img); if (e) return e.kind ? e : null;
  const ge = gaitEntry(id) || {}, an = applySplit(analyseImage(img, ge.minHip ? { minHip: ge.minHip } : null), ge.split), kind = classify(id, an);
  e = { an, kind, geom: an && an.ok ? geomOf(an, tuneFor(id)) : { H: 1, D0: 0.3, legH: 0.3, pu: 0.1, ex: 0, stride: 0.3 }, parts: new Map(), id, hang: ge.hang };
  CACHE.set(img, e); return e.kind ? e : null;
}
const tuckOf = (tune) => clamp(tune && tune.tuck !== undefined ? tune.tuck : TUNE.tuck, 0, 0.4);
const keyOf = (b, tune) => b + '|' + tuckOf(tune).toFixed(3);
// a legged actor falling back when the cut fails: kind waddle keeps it walking
export function prepare(img, id, devPerImg, tune) {
  const e = infoOf(img, id); if (!e) return null;
  if (e.kind !== 'legged' || !e.an || !e.an.legs) return e;
  const b = bucketFor(devPerImg), k = keyOf(b, tune || tuneFor(id)); let P = e.parts.get(k); if (P) return e;
  P = buildParts(img, e.an, b, tuckOf(tune || tuneFor(id)), e.hang); e.parts.set(k, P); if (e.parts.size > 4) { const first = e.parts.keys().next().value; if (first !== k) e.parts.delete(first); }
  return e;
}
// does a garment hang over the leg tops (an apron, skirt, coat)? the silhouette just above the hip is clearly wider than the two legs just below it
function hangOf(a, w, h, an, thr = 40) {
  const Hb = Math.round((an.bot - an.top) * h), hip = Math.round(an.hip * h), n = Math.max(3, Math.round(0.05 * Hb)), count = (ya, yb) => { let c = 0, r = 0; for (let y = ya; y <= yb; y++) { if (y < 0 || y >= h) continue; r++; for (let x = 0; x < w; x++) if (a[y * w + x] > thr) c++; } return r ? c / r : 0; };
  const above = count(hip - n, hip - 1), below = count(hip + 1, hip + n); return below > 0 ? above / below : 1;
}
const HANG_MIN = 1.2;
// the leg part with its TUCK: Ne rows above the hip filled from the leg's own top rows (each column continues up, a little darker as it goes under the cloth)
function tuckedLeg(Lg, ih, iw, Ne, res) {
  const nv = Lg.y1 - Lg.y0 + 1, cw = Lg.x1 - Lg.x0 + 1, o = mkc(cw, Ne + nv); if (!o) return null;
  o.x.drawImage(Lg.c, Lg.x0, Lg.y0, cw, nv, 0, Ne, cw, nv);
  if (Ne > 0) {
    const id = o.x.createImageData(cw, Ne), e = id.data, d = Lg.d, probe = Math.max(4, Math.round(0.12 * nv)), off = Math.round(0.08 * nv); // the first rows hold the painted shadow under the hem: the cloth colour a little lower is what continues upward
    const col = new Float32Array(cw * 3), has = new Uint8Array(cw);
    for (let x = 0; x < cw; x++) {
      let yt = -1; for (let y = 0; y < probe; y++) if (d[((Lg.y0 + y) * iw + Lg.x0 + x) * 4 + 3] >= 128) { yt = y; break; }
      if (yt < 0) continue;
      for (const y0 of [yt + off, yt]) { let r = 0, g2 = 0, b = 0, c = 0; for (let y = y0; y < Math.min(nv, y0 + Math.max(3, Math.round(0.2 * nv))); y++) { // a window of the leg's top fifth: the cloth, not one painted fringe row
         const i = ((Lg.y0 + y) * iw + Lg.x0 + x) * 4; if (d[i + 3] >= 128) { r += d[i]; g2 += d[i + 1]; b += d[i + 2]; c++; } } if (c) { col[x * 3] = r / c; col[x * 3 + 1] = g2 / c; col[x * 3 + 2] = b / c; has[x] = 1; break; } }
    }
    // a horizontal blur of the column colours (cloth texture would otherwise run up as vertical stripes); the two edge columns keep their own colour (the painted outline continues up)
    const win = Math.max(1, Math.round(0.12 * cw));
    for (let x = 0; x < cw; x++) {
      if (!has[x]) continue; let r = 0, g2 = 0, b = 0, c = 0; const edge = x < 2 || x >= cw - 2;
      if (edge) { r = col[x * 3]; g2 = col[x * 3 + 1]; b = col[x * 3 + 2]; c = 1; } else for (let q = Math.max(2, x - win); q <= Math.min(cw - 3, x + win); q++) if (has[q]) { r += col[q * 3]; g2 += col[q * 3 + 1]; b += col[q * 3 + 2]; c++; }
      if (!c) continue; r /= c; g2 /= c; b /= c;
      for (let j = 0; j < Ne; j++) { const sh = 1 - 0.2 * Math.pow((j + 1) / Ne, 0.9), i = ((Ne - 1 - j) * cw + x) * 4; e[i] = r * sh; e[i + 1] = g2 * sh; e[i + 2] = b * sh; e[i + 3] = 255; }
    }
    o.x.putImageData(id, 0, 0);
  }
  const W = Math.max(1, Math.round(cw * res)), Hh = Math.max(1, Math.round((Ne + nv) * res)), r = mkc(W, Hh); if (!r) return null;
  try { r.x.imageSmoothingEnabled = true; r.x.imageSmoothingQuality = 'high'; r.x.drawImage(o.c, 0, 0, cw, Ne + nv, 0, 0, W, Hh); } catch (e) { return null; }
  return { c: r.c, x: Lg.x0 / iw, y: (Lg.y0 - Ne) / ih, w: cw / iw, h: (Ne + nv) / ih, Ne, Nv: nv, Nb: Math.max(1, Math.round(BOOT * nv)) };
}
function buildParts(img, an, res, tuck, hangOv) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, H = an.bot - an.top, pad = 0.004;
  const full = mkc(iw, ih); if (!full) return { ok: false };
  let data; try { full.x.drawImage(img, 0, 0, iw, ih); data = full.x.getImageData(0, 0, iw, ih); } catch (e) { return { ok: false }; }
  const px = data.data, T = 40, y0 = Math.max(0, Math.floor(an.hip * ih)), y1 = Math.min(ih - 1, Math.ceil(an.bot * ih) - 1), bh = y1 - y0 + 1, vx = an.valley * iw;
  // who owns each pixel of the leg band: its connected blob when the two legs are separate blobs, else the column cut at the valley
  const lab = new Int16Array(iw * bh), area = [0], sx = [0]; let nl = 0; const stack = [];
  for (let y = 0; y < bh; y++) for (let x = 0; x < iw; x++) {
    const k = y * iw + x; if (lab[k] || px[((y + y0) * iw + x) * 4 + 3] <= T) continue;
    nl++; area.push(0); sx.push(0); lab[k] = nl; stack.push(k);
    while (stack.length) { const q = stack.pop(), qx = q % iw, qy = (q - qx) / iw; area[nl]++; sx[nl] += qx;
      if (qx > 0 && !lab[q - 1] && px[((qy + y0) * iw + qx - 1) * 4 + 3] > T) { lab[q - 1] = nl; stack.push(q - 1); }
      if (qx < iw - 1 && !lab[q + 1] && px[((qy + y0) * iw + qx + 1) * 4 + 3] > T) { lab[q + 1] = nl; stack.push(q + 1); }
      if (qy > 0 && !lab[q - iw] && px[((qy - 1 + y0) * iw + qx) * 4 + 3] > T) { lab[q - iw] = nl; stack.push(q - iw); }
      if (qy < bh - 1 && !lab[q + iw] && px[((qy + 1 + y0) * iw + qx) * 4 + 3] > T) { lab[q + iw] = nl; stack.push(q + iw); } }
  }
  const big = []; for (let l = 1; l <= nl; l++) if (area[l] >= 0.04 * iw * bh * 0.3) big.push(l);
  const side = new Int8Array(nl + 1).fill(-1); let sL = 0, sR = 0;
  for (const l of big) { side[l] = sx[l] / area[l] < vx ? 0 : 1; if (side[l] === 0) sL++; else sR++; }
  const byBlob = sL >= 1 && sR >= 1;
  const mkLeg = (want) => { // a natural-resolution canvas holding only the pixels this leg owns, their bounds and the pixel buffer
    const o = mkc(iw, ih); if (!o) return null; const id = o.x.createImageData(iw, ih), d = id.data; let x0 = iw, x1 = -1, yy0 = ih, yy1 = -1;
    for (let y = 0; y < bh; y++) for (let x = 0; x < iw; x++) {
      const si = ((y + y0) * iw + x) * 4, a = px[si + 3]; if (a === 0) continue;
      const l = lab[y * iw + x]; let own = byBlob && l && side[l] >= 0 ? side[l] : (x + 0.5 < vx ? 0 : 1); if (byBlob && (!l || side[l] < 0)) own = x + 0.5 < vx ? 0 : 1;
      if (own !== want) continue;
      d[si] = px[si]; d[si + 1] = px[si + 1]; d[si + 2] = px[si + 2]; d[si + 3] = a; if (x < x0) x0 = x; if (x > x1) x1 = x; const yy = y + y0; if (yy < yy0) yy0 = yy; if (yy > yy1) yy1 = yy;
    }
    if (x1 < 0) return null; o.x.putImageData(id, 0, 0); return { c: o.c, d, x0: Math.max(0, x0 - 1), x1: Math.min(iw - 1, x1 + 1), y0: yy0, y1: Math.min(ih - 1, yy1 + 1) };
  };
  const cropFrom = (src, ax, ay, bx, by) => { // pixels ax..bx, ay..by of a natural canvas -> a canvas at `res`
    const sw = Math.max(1, bx - ax + 1), sh = Math.max(1, by - ay + 1), o = mkc(sw * res, sh * res); if (!o) return null;
    try { o.x.imageSmoothingEnabled = true; o.x.imageSmoothingQuality = 'high'; o.x.drawImage(src, ax, ay, sw, sh, 0, 0, o.c.width, o.c.height); } catch (e) { return null; }
    return { c: o.c, x: ax / iw, y: ay / ih, w: sw / iw, h: sh / ih };
  };
  const L = mkLeg(0), R = mkLeg(1); if (!L || !R) return { ok: false };
  const Ne = Math.max(0, Math.min(Math.round(tuck * H * ih), Math.min(L.y0, R.y0) - 1));
  const legL = tuckedLeg(L, ih, iw, Ne, res), legR = tuckedLeg(R, ih, iw, Ne, res);
  // the upper body: everything above the hip. A GARMENT that hangs over the leg tops (apron, skirt, coat) keeps its hem crisp (one hairline row below the hip and NO fade: the legs
  // run under it); only bare legs (trousers) keep the short feathered overlap. A hanging garment also gets a hem BAND (the lowest HEM_BAND of the figure) that sways as cloth.
  const alpha = new Uint8Array(iw * ih); for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
  const hang = hangOv === undefined ? hangOf(alpha, iw, ih, an) : (hangOv ? 9 : 0), hung = hang >= HANG_MIN, ov = (hung ? 0 : 0.025) * H;
  const ux0 = Math.max(0, Math.floor((an.left - pad) * iw)), ux1 = Math.min(iw - 1, Math.ceil((an.right + pad) * iw) - 1), uy0 = Math.max(0, Math.floor((an.top - pad) * ih)), uy1 = hung ? Math.max(uy0 + 1, Math.floor(an.hip * ih) - 1) : Math.min(ih - 1, Math.ceil((an.hip + ov) * ih)); // a hanging hem ends exactly above the first leg row (no copied leg pixels under it)
  const bandTop = hung ? Math.max(uy0 + 4, Math.round((an.hip - HEM_BAND * H) * ih)) : -1;
  const upper = cropFrom(full.c, ux0, uy0, ux1, bandTop > 0 ? bandTop + 2 : uy1), band = bandTop > 0 ? cropFrom(full.c, ux0, bandTop, ux1, uy1) : null;
  if (!hung && upper) { const o = upper.c.getContext('2d'), fh = Math.max(1, Math.round(ov * ih * res)), gy = upper.c.height - fh; const gr = o.createLinearGradient(0, gy, 0, upper.c.height); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); o.globalCompositeOperation = 'destination-out'; o.fillStyle = gr; o.fillRect(0, gy, upper.c.width, fh); o.globalCompositeOperation = 'source-over'; }
  const fig = ih * H;
  return { ok: !!(upper && legL && legR), res, byBlob, upper, band, hang, hung, tuck, legL, legR, hipX: (an.legTopL + an.legTopR) / 2, hipY: an.hip, pivLx: an.legTopL, pivRx: an.legTopR, e0: Ne / fig, ext: Ne };
}
const partKey = (e, devPerImg, tune) => keyOf(bucketFor(devPerImg), tune);
export function partsOf(e, devPerImg, tune) { const P = e.parts.get(partKey(e, devPerImg, tune || tuneFor(e.id))); return P && P.ok ? P : null; }

// Draw the legged puppet. g is already translated to the feet point and mirrored; (ox, oy) is the contact point in def px, s world px per def px, dw/dh the def size.
// Pose units are figure heights; Hd is the figure height in def px.
// A LEG PART is three slices of one canvas: the hidden extension (top, takes the stretch), the shin and the boot (never scaled); pivot at the TOP of the extension (the real hip,
// under the garment). Layers: right (far) leg, left (near) leg, the upper body over the leg tops, then the swaying hem band over everything.
export function drawLegged(g, P, pose, s, ox, oy, dw, dh, Hd) {
  const k = s, Hk = Hd * k, dbg = DEBUG.outlines;
  // the legs are only seen BELOW the hem: a half plane in the body frame (hip row minus a margin) clips the tucked extension, so it can never poke out beside the garment
  // above the hem (the garment itself covers everything under it; the margin is deeper than the hem band can lift)
  const bx = (P.hipX * dw - ox) * k + pose.sway * Hk, by = (P.hipY * dh - oy) * k + pose.down * Hk, ba = pose.lean + pose.twist;
  g.save(); g.translate(bx, by); g.rotate(ba); g.beginPath(); g.rect(-Hk * 3, -CLIP_MARGIN * Hk, Hk * 6, Hk * 3); g.clip(); g.rotate(-ba); g.translate(-bx, -by);
  for (let k2 = 0; k2 < 2; k2++) {
    const i = 1 - k2; // 1 = right leg first (far), then 0 = left leg (near)
    const part = i ? P.legR : P.legL, L = i ? pose.legR : pose.legL, pvx = i ? P.pivRx : P.pivLx;
    g.save();
    g.translate((pvx * dw - ox) * k + L.dx * Hk, (part.y * dh - oy) * k + L.dy * Hk); g.rotate(L.rot);
    const cw = part.c.width, ch = part.c.height, x = (part.x - pvx) * dw * k, w = part.w * dw * k, tot = part.h * dh * k;
    if (part.Ne === undefined) { g.drawImage(part.c, x, 0, w, tot); } else { // sliced: [ext | shin | boot]
      const n = part.Ne + part.Nv, e = part.Ne / n, b = (part.Nb || 0) / n, eh = tot * e, bh = tot * b, sh = tot - eh - bh;
      const de = eh * (L.se === undefined ? 1 : L.se), ds = sh * (L.ss === undefined ? 1 : L.ss), c0 = ch * e, c1 = ch * (1 - b);
      // a slice maps the source rows [s0, s1] to the dest span [d0, d0 + dh], widened by one source row each side so the slices overlap and a seam never opens
      const sl = (s0, s1, d0, dh) => { if (s1 - s0 < 0.5 || dh <= 0) return; const k = dh / (s1 - s0), a = Math.max(0, s0 - 1), b2 = Math.min(ch, s1 + 1); g.drawImage(part.c, 0, a, cw, b2 - a, x, d0 - (s0 - a) * k, w, (b2 - a) * k); };
      sl(0, c0, 0, de); sl(c0, c1, de, ds); sl(c1, ch, de + ds, bh);
      if (dbg) { g.lineWidth = 1; g.strokeStyle = '#4af0ff'; g.strokeRect(x, 0, w, de); g.strokeStyle = '#ffe94a'; g.strokeRect(x, de, w, ds); g.strokeStyle = '#ff9a3a'; g.strokeRect(x, de + ds, w, bh); g.fillStyle = '#ff5ad0'; g.beginPath(); g.arc(0, 0, 3, 0, 7); g.fill(); }
    }
    g.restore();
  }
  g.restore();
  const u = P.upper;
  g.save();
  g.translate(bx, by); g.rotate(ba);
  g.drawImage(u.c, (u.x - P.hipX) * dw * k, (u.y - P.hipY) * dh * k, u.w * dw * k, u.h * dh * k);
  const bd = P.band;
  if (bd) { // the hem band hangs from its top edge (which never moves, so no seam opens): a shear, a small lift and a lagging drop
    g.save(); g.transform(1, 0, pose.hem || 0, pose.hemS === undefined ? 1 : pose.hemS, 0, (bd.y - P.hipY) * dh * k);
    g.drawImage(bd.c, (bd.x - P.hipX) * dw * k, 0, bd.w * dw * k, bd.h * dh * k);
    if (dbg) { g.lineWidth = 1; g.strokeStyle = '#ff5ad0'; g.strokeRect((bd.x - P.hipX) * dw * k, 0, bd.w * dw * k, bd.h * dh * k); }
    g.restore();
  }
  g.restore();
}
