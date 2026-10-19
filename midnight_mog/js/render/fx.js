// Midnight Mog FX: pooled particles, rings, beams, floating numbers, banners and screen juice, driven by battle events.
// Render-only. Never touches sim state, never calls Math.random (a seeded mulberry in the fx object varies everything,
// so the same event stream always looks the same). No allocation in update/draw: one Float32Array particle pool with
// swap-remove, preallocated ring/beam/floater/banner/delay slots, cached glow sprites.
//
// USAGE (per frame, in this order)
//   const fx = createFx(seed?);
//   consume(fx, battle.events /* drained list */, layout, battle);     // maps every event type to juice
//   if (fx.hitstop > 0) skip the sim step; else step(sim, dt * fx.timeScale);
//   update(fx, realDt);
//   ctx.translate(fx.shake.x, fx.shake.y); (optional ctx.rotate(fx.shake.r))      // trauma shake
//   ... draw world and sprites (use hitFlashOf / popOf for per-unit flash and squash) ...
//   draw(ctx, fx, t);                                                // world-space layers (+ overlay unless fx.autoOverlay=false)
//   ctx.restore(); drawOverlay(ctx, fx) when autoOverlay is false and you want it above the HUD.
//
// PUBLIC API
//   createFx(seed=1) -> fx            consume(fx, events, layout, battle)         update(fx, dt)        draw(ctx, fx, t)
//   drawOverlay(ctx, fx)              flash / vignette / chromatic split / banners (screen space, no shake)
//   setLayout(fx, layout)             emit(fx, type, x, y, o)  fire one effect by hand at TILE coords (lab, UI, crate screens)
//   burstAt(fx, px, py, color, n, o)  screen-space burst for UI code (px,py in canvas px)
//   hitFlashOf(fx, uid) popOf(fx, uid) castOf(fx, uid) -> 0..1 decaying per-unit pulses for sprite o.hitFlash / scale pops
//   setQuality(fx, 0..2, auto=false)  setReducedMotion(fx, bool)   clearFx(fx)     fxStats(fx)
// STATE the app may read: fx.shake {x,y,r}, fx.flash {color,alpha}, fx.hitstop (s), fx.timeScale, fx.chroma, fx.quality, fx.trauma
import { PAL, ROLE_COLOR, ENEMY_COLOR, RARITY, rgba, mix, shade, prism } from '../palette.js';
import { CAT_BY_ID } from '../data/cats.js';
import { ENEMY_BY_ID } from '../data/enemies.js';
import { drawText, formatNum } from './text.js';

const TAU = Math.PI * 2;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const outCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const outBack = (t) => { t = clamp(t, 0, 1) - 1; return 1 + 2.70158 * t * t * t + 1.70158 * t * t; };

// ------------------------------------------------------------------------------------------------ colours
const COLS = [];            // interned colour strings, particles store the index
const COLMAP = new Map();
function ci(hex) {
  let i = COLMAP.get(hex);
  if (i === undefined) { i = COLS.length; COLS.push(hex); COLMAP.set(hex, i); }
  return i;
}
const C = {
  bone: ci(PAL.bone), boneDim: ci(PAL.boneDim), cyan: ci(PAL.cyan), magenta: ci(PAL.magenta), lime: ci(PAL.lime),
  ink: ci(PAL.ink), violet: ci(PAL.violet), violetHi: ci(PAL.violetHi), orange: ci(ROLE_COLOR.brawler), mage: ci(ROLE_COLOR.mage),
  tank: ci(ROLE_COLOR.tank), gold: ci(PAL.gold), goldHot: ci(PAL.goldHot), ink3: ci(PAL.ink3), magentaDeep: ci(PAL.magentaDeep),
  limeDeep: ci(PAL.limeDeep), cyanDeep: ci(PAL.cyanDeep), slate: ci(PAL.slate),
};
// element -> [main, accent]
const ELEM = {
  phys: [C.bone, C.boneDim], fire: [C.orange, C.magenta], elec: [C.cyan, C.bone], poison: [C.lime, C.limeDeep],
  holy: [C.bone, C.cyan], shadow: [C.mage, C.violetHi], void: [C.violetHi, C.magenta], bleed: [C.magenta, C.magentaDeep],
};
const elem = (e) => ELEM[e] || ELEM.phys;
const ENEMY_TINTS = [C.magenta, C.orange, C.lime, C.mage];
const RARITY_CI = { common: C.boneDim, rare: C.cyan, epic: C.magenta, legend: C.gold, mythic: C.goldHot };
const CURRENCY_CI = { fish: C.bone, yarn: C.magenta, gems: C.cyan, tokens: C.lime, key: C.cyan };

// ------------------------------------------------------------------------------------------------ sprites
function makeCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  } catch (e) { /* no canvas */ }
  return null;
}
const SPR = new Map();      // colour index -> soft glow sprite (white-hot core, colour falloff)
let INKSPR; let sprBroken = false;
function glowSprite(i) {
  let s = SPR.get(i);
  if (s !== undefined) return s;
  s = null;
  if (!sprBroken) {
    const c = makeCanvas(64, 64);
    const g = c && c.getContext ? c.getContext('2d') : null;
    if (g && g.createRadialGradient) {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(PAL.bone, 0.95));
      gr.addColorStop(0.12, rgba(mix(COLS[i], PAL.bone, 0.55), 0.85));
      gr.addColorStop(0.4, rgba(COLS[i], 0.38));
      gr.addColorStop(1, rgba(COLS[i], 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      s = c;
    }
  }
  SPR.set(i, s);
  return s;
}
function inkSprite() {
  if (INKSPR !== undefined) return INKSPR;
  INKSPR = null;
  const c = makeCanvas(64, 64);
  const g = c && c.getContext ? c.getContext('2d') : null;
  if (g && g.createRadialGradient) {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(PAL.ink, 0.85)); gr.addColorStop(0.55, rgba(PAL.ink, 0.45)); gr.addColorStop(1, rgba(PAL.ink, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    INKSPR = c;
  }
  return INKSPR;
}
function dot(ctx, i, x, y, r) {
  const s = glowSprite(i);
  if (s) ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  else { ctx.fillStyle = COLS[i]; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill(); }
}

// ------------------------------------------------------------------------------------------------ pools
// particle fields
const X = 0, Y = 1, VX = 2, VY = 3, LIFE = 4, MAX = 5, S0 = 6, S1 = 7, DRAG = 8, GRAV = 9, ROT = 10, VR = 11, AL = 12, COL = 13,
  SH = 14, TX = 15, TY = 16, SEEK = 17, STRIDE = 18;
// shapes
const SH_GLOW = 0, SH_SPARK = 1, SH_SHARD = 2, SH_STAR4 = 3, SH_SMOKE = 4, SH_COIN = 5, SH_EMBER = 6, SH_PLUS = 7, SH_STAR5 = 8,
  SH_CONFETTI = 9, SH_ARROW = 10;
const POOL = 2400;
const CAPQ = [650, 1300, 2300];
const QM = [0.34, 0.7, 1];
// ring types
const R_RING = 0, R_GROUND = 1, R_SLASH = 2, R_PILLAR = 3, R_CROSS = 4, R_HEX = 5, R_RUNE = 6, R_FLASH = 7, R_SMOKE = 8;
const RING_N = 96, BEAM_N = 48, FLOAT_N = 96, BANNER_N = 4, DELAY_N = 96, BEAM_PTS = 40;
// beam kinds
const B_BOLT = 0, B_LINE = 1, B_TRAIL = 2, B_TRACER = 3;
// floater kinds
const F_DMG = 0, F_CRIT = 1, F_HEAL = 2, F_SHIELD = 3, F_LABEL = 4, F_ENERGY = 5, F_LOOT = 6, F_BIG = 7;
// delayed action kinds
const D_MERGE = 1, D_FIREWORK = 2, D_RING = 3, D_SPARKS = 4, D_CONFETTI = 5, D_SMOKEFALL = 6;

export function createFx(seed = 1) {
  const fx = {
    seed: seed >>> 0, rs: (seed >>> 0) || 1, t: 0,
    quality: 2, auto: true, reducedMotion: false, autoOverlay: true, banners: true,
    shake: { x: 0, y: 0, r: 0 }, trauma: 0, flash: { color: PAL.bone, alpha: 0, add: true }, flashDecay: 3.5,
    hitstop: 0, timeScale: 1, slowT: 0, slowScale: 1, chroma: 0,
    vig: { color: C.magenta, alpha: 0, hold: 0 },
    layout: null, u: 1, tw: 56, th: 56, W: 390, H: 800,
    px: 0, py: 0,
    n: 0, P: new Float32Array(POOL * STRIDE),
    rings: [], beams: [], floaters: [], bannerSlots: [], delays: [],
    nextRing: 0, nextBeam: 0, nextFloat: 0, nextDelay: 0,
    units: new Map(), hitAt: new Map(), popAt: new Map(), castAt: new Map(),
    ema: 1 / 60, lowT: 0, highT: 0, lootRow: 0, lastEventT: 0, stats: { dropped: 0, events: 0 },
  };
  for (let i = 0; i < RING_N; i++) fx.rings.push({ on: false, type: 0, x: 0, y: 0, r0: 0, r1: 0, w: 2, life: 0, max: 1, col: 0, rot: 0, a: 1, a1: 0, sq: 1 });
  for (let i = 0; i < BEAM_N; i++) fx.beams.push({ on: false, kind: 0, n: 0, pts: new Float32Array(BEAM_PTS * 2), life: 0, max: 1, col: 0, col2: 0, w: 2, a: 1 });
  for (let i = 0; i < FLOAT_N; i++) {
    fx.floaters.push({ on: false, text: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 16, col: 0, kind: 0, pop: 1, hold: 0,
      o: { size: 16, kind: 'display', color: PAL.bone, align: 'center', baseline: 'middle', glow: 0, alpha: 1, scale: 1, rotate: 0, stroke: true } });
  }
  for (let i = 0; i < BANNER_N; i++) fx.bannerSlots.push({ on: false, text: '', sub: '', life: 0, max: 1, col: 0, kind: 0, o: { size: 40, kind: 'display', color: PAL.bone, align: 'center', baseline: 'middle', glow: 0, alpha: 1, scale: 1, gradient: null }, o2: { size: 15, kind: 'body', color: PAL.boneDim, align: 'center', baseline: 'middle', alpha: 1, scale: 1 } });
  for (let i = 0; i < DELAY_N; i++) fx.delays.push({ on: false, t: 0, kind: 0, x: 0, y: 0, a: 0, b: 0, c: 0, d: 0 });
  return fx;
}

// ------------------------------------------------------------------------------------------------ small helpers
function rr(fx) { // mulberry32
  let t = (fx.rs = (fx.rs + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rs = (fx, a, b) => a + (b - a) * rr(fx);
function strHash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const qn = (fx, n) => Math.max(1, Math.round(n * QM[fx.quality]));

function pp(fx, shape, x, y, vx, vy, life, s0, s1, col, drag, grav, alpha) {
  if (fx.n >= CAPQ[fx.quality] || !(life > 0)) { fx.stats.dropped++; return -1; }
  const P = fx.P, o = fx.n * STRIDE;
  P[o + X] = fin(x); P[o + Y] = fin(y); P[o + VX] = fin(vx); P[o + VY] = fin(vy);
  P[o + LIFE] = life; P[o + MAX] = life; P[o + S0] = fin(s0, 1); P[o + S1] = fin(s1, 1);
  P[o + DRAG] = drag || 0; P[o + GRAV] = grav || 0; P[o + ROT] = 0; P[o + VR] = 0;
  P[o + AL] = alpha === undefined ? 1 : alpha; P[o + COL] = col; P[o + SH] = shape; P[o + SEEK] = 0;
  return fx.n++;
}
function pex(fx, i, rot, vr, tx, ty, seek) {
  if (i < 0) return;
  const P = fx.P, o = i * STRIDE;
  P[o + ROT] = rot; P[o + VR] = vr; P[o + TX] = tx; P[o + TY] = ty; P[o + SEEK] = seek;
}
/** Radial burst. cA/cB alternate. speeds in px/s (already unit-scaled by the caller). */
function radial(fx, x, y, n, shape, v0, v1, life, s0, s1, cA, cB, drag, grav, ang0, arc, alpha) {
  n = qn(fx, n);
  for (let i = 0; i < n; i++) {
    const a = ang0 + (arc >= TAU - 0.01 ? (i / n) * TAU + rs(fx, -0.2, 0.2) : rs(fx, 0, arc));
    const v = rs(fx, v0, v1);
    const i2 = pp(fx, shape, x, y, Math.cos(a) * v, Math.sin(a) * v, life * rs(fx, 0.7, 1.15), s0, s1, i & 1 ? cB : cA, drag, grav, alpha);
    if (shape === SH_SHARD || shape === SH_CONFETTI || shape === SH_STAR4 || shape === SH_STAR5) pex(fx, i2, rr(fx) * TAU, rs(fx, -9, 9), 0, 0, 0);
  }
}
function ring(fx, type, x, y, r0, r1, w, life, col, a, rot, sq) {
  const R = fx.rings;
  let r = null;
  for (let k = 0; k < RING_N; k++) { const c = R[(fx.nextRing + k) % RING_N]; if (!c.on) { r = c; fx.nextRing = (fx.nextRing + k + 1) % RING_N; break; } }
  if (!r) { r = R[fx.nextRing]; fx.nextRing = (fx.nextRing + 1) % RING_N; }
  r.on = true; r.type = type; r.x = fin(x); r.y = fin(y); r.r0 = fin(r0); r.r1 = fin(r1); r.w = w; r.life = life; r.max = life;
  r.col = col; r.a = a === undefined ? 1 : a; r.rot = rot || 0; r.sq = sq || 1;
  return r;
}
function beam(fx, kind, life, col, col2, w, a) {
  const B = fx.beams;
  let b = null;
  for (let k = 0; k < BEAM_N; k++) { const c = B[(fx.nextBeam + k) % BEAM_N]; if (!c.on) { b = c; fx.nextBeam = (fx.nextBeam + k + 1) % BEAM_N; break; } }
  if (!b) { b = B[fx.nextBeam]; fx.nextBeam = (fx.nextBeam + 1) % BEAM_N; }
  b.on = true; b.kind = kind; b.n = 0; b.life = life; b.max = life; b.col = col; b.col2 = col2; b.w = w; b.a = a === undefined ? 1 : a;
  return b;
}
function bpt(b, x, y) { if (b.n < BEAM_PTS) { b.pts[b.n * 2] = fin(x); b.pts[b.n * 2 + 1] = fin(y); b.n++; } }

function floater(fx, kind, text, x, y, size, col, o) {
  const F = fx.floaters;
  let f = null;
  for (let k = 0; k < FLOAT_N; k++) { const c = F[(fx.nextFloat + k) % FLOAT_N]; if (!c.on) { f = c; fx.nextFloat = (fx.nextFloat + k + 1) % FLOAT_N; break; } }
  if (!f) { f = F[fx.nextFloat]; fx.nextFloat = (fx.nextFloat + 1) % FLOAT_N; }
  const u = fx.u;
  f.on = true; f.text = text; f.x = fin(x) + rs(fx, -5, 5) * u; f.y = fin(y); f.kind = kind; f.col = col;
  f.size = size * u; f.pop = kind === F_CRIT || kind === F_BIG ? 1.4 : 1;
  if (kind === F_BIG || kind === F_LABEL || kind === F_LOOT) {
    const half = Math.min(fx.W * 0.5 - 4, text.length * f.size * 0.34 * (kind === F_BIG ? 1.4 : 1));
    f.x = clamp(f.x, half + 4, fx.W - half - 4);
  }
  f.vx = rs(fx, -18, 18) * u; f.vy = -(kind === F_LABEL ? 34 : kind === F_CRIT ? 70 : 58) * u;
  f.life = f.max = kind === F_LABEL ? 1.1 : kind === F_CRIT ? 1.0 : kind === F_LOOT ? 1.5 : 0.85;
  f.hold = 0;
  if (o) { if (o.life) f.life = f.max = o.life; if (o.vy !== undefined) f.vy = o.vy * u; if (o.vx !== undefined) f.vx = o.vx * u; if (o.pop) f.pop = o.pop; }
  return f;
}

function delay(fx, t, kind, x, y, a, b, c, d) {
  const D = fx.delays;
  let e = null;
  for (let k = 0; k < DELAY_N; k++) { const q = D[(fx.nextDelay + k) % DELAY_N]; if (!q.on) { e = q; fx.nextDelay = (fx.nextDelay + k + 1) % DELAY_N; break; } }
  if (!e) return;
  e.on = true; e.t = t; e.kind = kind; e.x = x; e.y = y; e.a = a || 0; e.b = b || 0; e.c = c || 0; e.d = d || 0;
}

function banner(fx, kind, text, sub, col, life) {
  if (!fx.banners) return;
  const S = fx.bannerSlots;
  let s = null;
  if (kind !== 2) for (let i = 0; i < BANNER_N; i++) if (S[i].on && S[i].kind !== 2 && S[i].life > 0.1) S[i].life = 0.1; // one big banner at a time
  for (let i = 0; i < BANNER_N; i++) if (!S[i].on) { s = S[i]; break; }
  if (!s) { s = S[0]; for (let i = 1; i < BANNER_N; i++) if (S[i].life < s.life) s = S[i]; }
  s.on = true; s.text = text; s.sub = sub || ''; s.kind = kind; s.col = col; s.life = s.max = life || 1.8;
}

// screen juice
function trauma(fx, v) { fx.trauma = Math.min(1, fx.trauma + (fx.reducedMotion ? 0 : v)); }
function flashScr(fx, color, a, decay, add) {
  const f = fx.flash;
  if (a >= f.alpha || f.color !== color) { f.color = color; f.alpha = Math.max(a, f.alpha * 0.5); }
  f.add = add !== false; fx.flashDecay = decay || 3.5;
}
function stop(fx, s) { if (!fx.reducedMotion || s <= 0.05) fx.hitstop = Math.max(fx.hitstop, Math.min(0.2, s)); }
function slowmo(fx, dur, scale) { if (fx.reducedMotion) return; fx.slowT = Math.max(fx.slowT, dur); fx.slowScale = scale; }
function chroma(fx, v) { if (!fx.reducedMotion) fx.chroma = Math.max(fx.chroma, v); }
function vignette(fx, col, a) { if (a >= fx.vig.alpha) { fx.vig.color = col; fx.vig.alpha = a; } }

// ------------------------------------------------------------------------------------------------ layout mapping
export function setLayout(fx, layout) {
  if (!layout) return;
  if (fx.layout === layout && fx.W === layout.w) return;
  fx.layout = layout;
  fx.W = fin(layout.w, 390); fx.H = fin(layout.h, 800);
  let tw = 0, th = 0;
  try {
    if (typeof layout.tile === 'function') { const t = layout.tile(1, 0); tw = fin(t && t.w); th = fin(t && t.h); }
  } catch (e) { /* ignore */ }
  if (!(tw > 0) && layout.field) tw = layout.field.w / 10;
  if (!(th > 0) && layout.field) th = layout.field.h / 5;
  if (!(tw > 0)) tw = 56;
  if (!(th > 0)) th = tw;
  fx.tw = tw; fx.th = th;
  fx.u = clamp(Math.min(tw, th * 1.15) / 56, 0.4, 3);
}
/** Tile coords -> canvas px of the body centre, written to fx.px / fx.py. */
function loc(fx, x, y) {
  const L = fx.layout;
  x = fin(x); y = fin(y);
  if (L && typeof L.colX === 'function' && typeof L.laneY === 'function') {
    fx.px = fin(L.colX(x), x * fx.tw); fx.py = fin(L.laneY(y), y * fx.th) - fx.th * 0.12;
  } else { fx.px = x * fx.tw + fx.tw * 0.5; fx.py = y * fx.th + fx.th * 0.5; }
}
function baseLoc(fx) {
  const L = fx.layout;
  if (L && L.baseRect) { fx.px = L.baseRect.x + L.baseRect.w * 0.5; fx.py = L.baseRect.y + L.baseRect.h * 0.5; } else loc(fx, 0, 2);
}
function rectCentre(fx, r, fb) {
  if (r) { fx.px = r.x + r.w * 0.5; fx.py = r.y + r.h * 0.5; } else { fx.px = fx.W * 0.5; fx.py = fb; }
}
const fieldCentre = (fx) => { const f = fx.layout && fx.layout.field; if (f) { fx.px = f.x + f.w * 0.5; fx.py = f.y + f.h * 0.5; } else { fx.px = fx.W * 0.5; fx.py = fx.H * 0.4; } };

function unitOf(fx, uid) { return uid ? fx.units.get(uid) : undefined; }
/** 1 cat side, 2 enemy side, 0 unknown. */
function sideOf(fx, uid) {
  if (uid === 0) return 1;
  const u = fx.units.get(uid);
  return u ? (u.side === 'cat' ? 1 : 2) : 0;
}
function tintOfUnit(fx, u) {
  if (!u) return C.magenta;
  if (u.side === 'cat') { const c = CAT_BY_ID[u.id]; return c ? ci(ROLE_COLOR[c.role] || PAL.cyan) : C.cyan; }
  return ENEMY_TINTS[strHash(u.id || '') % 4];
}
function refresh(fx, b) {
  if (!b) return;
  const m = fx.units;
  if (m.size > 1500) m.clear();
  const us = b.units, es = b.enemies;
  if (us) for (let i = 0; i < us.length; i++) m.set(us[i].uid, us[i]);
  if (es) for (let i = 0; i < es.length; i++) m.set(es[i].uid, es[i]);
}
function mark(map, uid, t) { if (map.size > 600) map.clear(); map.set(uid, t); }

/** 0..1 hit flash of a unit (feed to drawCat/drawEnemy o.hitFlash). */
export function hitFlashOf(fx, uid) { const t = fx.hitAt.get(uid); return t === undefined ? 0 : clamp(1 - (fx.t - t) / 0.12, 0, 1); }
/** 0..1 pop pulse after spawn or merge (scale the sprite by 1 + 0.25 * outBack-ish). */
export function popOf(fx, uid) { const t = fx.popAt.get(uid); return t === undefined ? 0 : clamp(1 - (fx.t - t) / 0.45, 0, 1); }
/** 0..1 pulse after a cast. */
export function castOf(fx, uid) { const t = fx.castAt.get(uid); return t === undefined ? 0 : clamp(1 - (fx.t - t) / 0.4, 0, 1); }

// ------------------------------------------------------------------------------------------------ consume
export function consume(fx, events, layout, battle) {
  if (layout) setLayout(fx, layout);
  if (!events || !events.length) { if (battle && fx.units.size === 0) refresh(fx, battle); return; }
  refresh(fx, battle);
  fx.lootRow = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev) continue;
    fx.stats.events++;
    try { handle(fx, ev, battle); } catch (e) { fx.stats.errors = (fx.stats.errors || 0) + 1; if (fx.debug) throw e; }
  }
}

/** Fire one effect by hand: type is any battle event type, o is the event payload (tile coordinates). */
export function emit(fx, type, x, y, o) {
  const ev = Object.assign({ type, x, y }, o || {});
  handle(fx, ev, null);
}

function handle(fx, ev, b) {
  switch (ev.type) {
    case 'hit': return onHit(fx, ev);
    case 'crit': return onCrit(fx, ev);
    case 'death': return onDeath(fx, ev);
    case 'spawn': return onSpawn(fx, ev);
    case 'cast': return onCast(fx, ev);
    case 'heal': return onHeal(fx, ev);
    case 'status': return onStatus(fx, ev);
    case 'shield': return onShield(fx, ev);
    case 'base_hit': return onBaseHit(fx, ev);
    case 'chain': return onChain(fx, ev);
    case 'pierce': return onPierce(fx, ev);
    case 'aoe': return onAoe(fx, ev);
    case 'knockback': return onKnockback(fx, ev);
    case 'pull': return onPull(fx, ev);
    case 'execute': return onExecute(fx, ev);
    case 'trap_set': return onTrapSet(fx, ev);
    case 'trap_trigger': return onTrapTrigger(fx, ev);
    case 'barricade': return onBarricade(fx, ev);
    case 'aura': return onAura(fx, ev);
    case 'energy': return onEnergy(fx, ev);
    case 'draw': return onDraw(fx, ev);
    case 'revive': return onRevive(fx, ev);
    case 'wave': return onWave(fx, ev);
    case 'rule': return onRule(fx, ev);
    case 'reward': return onReward(fx, ev);
    case 'cleanse': return onCleanse(fx, ev);
    case 'taunt': return onTaunt(fx, ev);
    case 'reflect': return onReflect(fx, ev);
    case 'attack': return onAttack(fx, ev);
    case 'merge': return onMerge(fx, ev);
    case 'burrow': return onBurrow(fx, ev);
    case 'emerge': return onEmerge(fx, ev);
    case 'summon_call': return onSummonCall(fx, ev);
    case 'loot': return onLoot(fx, ev);
    case 'win': return onWin(fx, ev);
    case 'lose': return onLose(fx, ev);
    default: return undefined;
  }
}

// ------------------------------------------------------------------------------------------------ handlers
function onHit(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  const tgtU = unitOf(fx, ev.tgt);
  const side = tgtU ? (tgtU.side === 'cat' ? 1 : 2) : 2;
  const srcU = unitOf(fx, ev.src);
  const el = elem(ev.element);
  const amt = fin(ev.amount);
  const isDot = !!ev.dot;
  const rel = tgtU && tgtU.maxHp > 0 ? clamp(amt / tgtU.maxHp, 0, 1) : 0.1;
  const heavy = rel > 0.22;
  mark(fx.hitAt, ev.tgt, fx.t);
  // direction the impact flies: away from the source
  let dir = side === 1 ? -1 : 1;
  if (srcU) dir = srcU.x <= fin(ev.x) ? 1 : -1;
  const aim = dir > 0 ? 0 : Math.PI;
  const cMain = side === 1 ? C.magenta : el[0];
  const cAcc = side === 1 ? C.bone : el[1];
  if (amt > 0) {
    if (!isDot) {
      radial(fx, x, y, ev.crit ? 12 : 5 + (heavy ? 5 : 0), SH_SPARK, 140 * u, 320 * u, 0.28, 2.2 * u, 0.6 * u, cMain, cAcc, 5, 120 * u, aim, 1.9, 1);
      pex0(fx, pp(fx, SH_GLOW, x, y, 0, 0, 0.14, 26 * u * (1 + rel), 8 * u, side === 1 ? C.magenta : C.bone, 0, 0, 0.9));
      if (heavy && fx.quality > 0) ring(fx, R_RING, x, y, 4 * u, 30 * u, 3 * u, 0.2, cMain, 0.8);
    } else {
      radial(fx, x, y, 2, SH_EMBER, 20 * u, 50 * u, 0.5, 3 * u, 0.5 * u, el[0], el[1], 1, -60 * u, -Math.PI / 2, 1.2, 0.9);
    }
    if (tgtU && side === 2 && !isDot && fx.quality > 0 && heavy) ring(fx, R_SLASH, x, y, 16 * u, 20 * u, 5 * u, 0.16, C.bone, 0.9, aim + (rr(fx) - 0.5), 1);
  }
  if (ev.absorbed > 0) {
    ring(fx, R_HEX, x, y, 6 * u, 26 * u, 2 * u, 0.24, C.cyan, 0.9, rr(fx), 1);
    radial(fx, x, y, 4, SH_SPARK, 80 * u, 180 * u, 0.22, 1.8 * u, 0.5 * u, C.cyan, C.bone, 6, 0, aim, 2.4, 1);
  }
  if (amt >= 0.5) {
    const txt = formatNum(Math.round(amt)) + (ev.crit ? '!' : '');
    if (ev.crit) floater(fx, F_CRIT, txt, x, y - 12 * u, 30, C.cyan);
    else if (isDot) floater(fx, F_DMG, txt, x, y - 8 * u, 13, el[0], { life: 0.6 });
    else floater(fx, F_DMG, txt, x, y - 12 * u, side === 1 ? 17 : heavy ? 22 : 18, side === 1 ? C.magenta : C.bone);
  }
  if (heavy && !isDot) stop(fx, 0.03);
  if (side === 1 && !isDot) trauma(fx, 0.03);
}
function pex0(fx, i) { if (i >= 0) pex(fx, i, 0, 0, 0, 0, 0); }

function onCrit(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  trauma(fx, 0.17);
  stop(fx, 0.045);
  ring(fx, R_FLASH, x, y, 40 * u, 40 * u, 0, 0.16, C.cyan, 0.9);
  ring(fx, R_CROSS, x, y, 44 * u, 44 * u, 0, 0.26, C.bone, 1, 0.3);
  radial(fx, x, y, 8, SH_STAR4, 80 * u, 210 * u, 0.4, 7 * u, 1 * u, C.cyan, C.bone, 4, 40 * u, 0, TAU, 1);
  ring(fx, R_RING, x, y, 6 * u, 40 * u, 4 * u, 0.22, C.cyan, 0.9);
}

function onDeath(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  const side = ev.side === 'cat' ? 1 : 2;
  const un = unitOf(fx, ev.uid);
  const main = side === 1 ? C.cyan : (un ? tintOfUnit(fx, un) : C.magenta);
  const boss = !!ev.boss;
  const k = boss ? 2.6 : ev.kind === 'minion' || ev.kind === 'barricade' ? 0.7 : 1;
  if (ev.expired) {
    radial(fx, x, y, 6, SH_SMOKE, 10 * u, 40 * u, 0.5, 6 * u, 18 * u, C.ink, C.ink, 2, -20 * u, 0, TAU, 0.8);
    radial(fx, x, y, 5, SH_SPARK, 40 * u, 100 * u, 0.3, 1.6 * u, 0.4 * u, C.bone, C.boneDim, 5, 90 * u, -Math.PI / 2, 2.2, 1);
    return;
  }
  // pop, flash, shard burst, ink ring, smoke, coin
  pex0(fx, pp(fx, SH_GLOW, x, y, 0, 0, 0.22, 46 * u * k, 12 * u, C.bone, 0, 0, 1));
  pex0(fx, pp(fx, SH_GLOW, x, y, 0, 0, 0.4, 70 * u * k, 20 * u, main, 0, 0, 0.9));
  radial(fx, x, y, Math.round(11 * k), SH_SHARD, 70 * u * k, 230 * u * k, 0.55, 4.5 * u, 1 * u, main, C.bone, 3, 380 * u, 0, TAU, 1);
  radial(fx, x, y, Math.round(9 * k), SH_SPARK, 120 * u * k, 320 * u * k, 0.35, 2.2 * u, 0.4 * u, main, C.bone, 5, 150 * u, 0, TAU, 1);
  radial(fx, x, y, Math.round(3 * k), SH_SMOKE, 8 * u, 38 * u, 0.7, 8 * u * k, 24 * u * k, C.ink, C.ink, 2, -34 * u, 0, TAU, 0.85);
  ring(fx, R_SMOKE, x, y, 4 * u, 38 * u * k, 7 * u, 0.4, C.ink, 0.7);
  ring(fx, R_RING, x, y, 4 * u, 52 * u * k, 4 * u, 0.3, main, 0.9);
  if (side === 2 && ev.kind !== 'minion') {
    const n = boss ? 7 : 1;
    for (let i = 0; i < n; i++) {
      const c = pp(fx, SH_COIN, x, y - 4 * u, rs(fx, -30, 30) * u * (boss ? 3 : 1), -rs(fx, 170, 250) * u, 0.85, 4.5 * u, 4.5 * u, C.bone, 0.5, 520 * u, 1);
      pex(fx, c, rr(fx) * TAU, rs(fx, 6, 10), 0, 0, 0);
    }
    pex0(fx, pp(fx, SH_STAR4, x, y - 14 * u, 0, -40 * u, 0.5, 9 * u, 1 * u, C.bone, 2, 0, 1));
  }
  trauma(fx, boss ? 0.8 : 0.035);
  if (boss) {
    stop(fx, 0.14);
    flashScr(fx, PAL.bone, 0.32, 4);
    chroma(fx, 0.5);
    slowmo(fx, 0.6, 0.3);
    ring(fx, R_GROUND, x, y + 10 * u, 10 * u, 180 * u, 10 * u, 0.7, C.magenta, 0.9, 0, 0.45);
    ring(fx, R_RING, x, y, 10 * u, 140 * u, 6 * u, 0.5, C.bone, 0.9);
    ring(fx, R_CROSS, x, y, 120 * u, 120 * u, 0, 0.5, C.bone, 1, 0.2);
    delay(fx, 0.12, D_FIREWORK, x - 40 * u, y - 30 * u, C.magenta, C.bone, 0.8);
    delay(fx, 0.22, D_FIREWORK, x + 40 * u, y - 20 * u, C.lime, C.bone, 0.8);
    banner(fx, 1, 'BOSS DOWN', '', C.bone, 1.8);
  } else if (side === 2) {
    stop(fx, ev.kind === 'minion' ? 0 : 0.025);
    mark(fx.popAt, ev.uid, fx.t);
  }
}

function onSpawn(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  mark(fx.popAt, ev.uid, fx.t);
  if (ev.side === 'cat') {
    ring(fx, R_GROUND, x, y + 12 * u, 4 * u, 34 * u, 3 * u, 0.4, C.cyan, 0.9, 0, 0.45);
    radial(fx, x, y + 10 * u, 6, SH_SPARK, 40 * u, 110 * u, 0.4, 1.8 * u, 0.4 * u, C.cyan, C.bone, 3, -80 * u, -Math.PI / 2, 1.4, 1);
    radial(fx, x, y + 14 * u, 3, SH_SMOKE, 12 * u, 30 * u, 0.4, 5 * u, 12 * u, C.ink3, C.ink3, 3, 0, Math.PI, Math.PI, 0.6);
    ring(fx, R_PILLAR, x, y + 12 * u, 22 * u, 52 * u, 0, 0.32, C.cyan, 0.6);
    return;
  }
  const un = unitOf(fx, ev.uid);
  const tint = un ? tintOfUnit(fx, un) : C.magenta;
  if (ev.boss) {
    const e = ENEMY_BY_ID[ev.id];
    ring(fx, R_GROUND, x, y + 12 * u, 10 * u, 200 * u, 10 * u, 0.7, C.magenta, 0.95, 0, 0.45);
    ring(fx, R_RING, x, y, 10 * u, 130 * u, 6 * u, 0.45, C.bone, 0.9);
    ring(fx, R_PILLAR, x, y + 20 * u, 70 * u, 190 * u, 0, 0.8, C.magenta, 0.9);
    radial(fx, x, y, 22, SH_SPARK, 160 * u, 420 * u, 0.5, 2.6 * u, 0.5 * u, C.magenta, C.bone, 4, 0, 0, TAU, 1);
    trauma(fx, 0.55); chroma(fx, 0.5); flashScr(fx, PAL.magenta, 0.4, 3); vignette(fx, C.magenta, 0.55); stop(fx, 0.08);
    banner(fx, 1, e ? e.name.split(',')[0] : 'BOSS', 'BOSS ARRIVES', C.magenta, 2.1);
    return;
  }
  const k = ev.minion || ev.split ? 0.6 : ev.elite ? 1.4 : 1;
  ring(fx, R_RING, x, y, 3 * u, 26 * u * k, 2.5 * u, 0.28, tint, 0.9);
  radial(fx, x, y, ev.elite ? 10 : 4, SH_SPARK, 40 * u, 130 * u, 0.35, 1.8 * u, 0.4 * u, tint, C.bone, 4, 0, 0, TAU, 1);
  if (ev.elite) {
    ring(fx, R_HEX, x, y, 8 * u, 46 * u, 2.5 * u, 0.5, C.lime, 0.9, 0.2);
    ring(fx, R_GROUND, x, y + 12 * u, 6 * u, 54 * u, 3 * u, 0.5, tint, 0.9, 0, 0.45);
    floater(fx, F_LABEL, 'ELITE', x, y - 30 * u, 13, C.lime);
  }
  if (ev.split && fx.quality > 0) radial(fx, x, y, 4, SH_SMOKE, 10 * u, 30 * u, 0.4, 4 * u, 10 * u, C.ink, C.ink, 2, 0, 0, TAU, 0.7);
}

function onCast(fx, ev) {
  const u = fx.u;
  if (ev.src) {
    const un = unitOf(fx, ev.src);
    mark(fx.castAt, ev.src, fx.t);
    loc(fx, ev.x !== undefined ? ev.x : un ? un.x : 4, ev.y !== undefined ? ev.y : un ? un.y : 2);
    const x = fx.px, y = fx.py;
    const col = tintOfUnit(fx, un);
    ring(fx, R_RUNE, x, y + 14 * u, 8 * u, 44 * u, 2 * u, 0.55, col, 0.9, rs(fx, 0, 3), 0.45);
    ring(fx, R_RING, x, y, 6 * u, 40 * u, 3 * u, 0.3, col, 0.9);
    ring(fx, R_PILLAR, x, y + 14 * u, 20 * u, 70 * u, 0, 0.4, col, 0.55);
    radial(fx, x, y + 6 * u, 8, SH_STAR4, 30 * u, 100 * u, 0.55, 5 * u, 1 * u, col, C.bone, 2, -120 * u, -Math.PI / 2, 1.6, 1);
    if (ev.name && !ev.echo && !/_ability$/.test(String(ev.name))) floater(fx, F_LABEL, String(ev.name), x, y - 34 * u, 13, col);   // enemy abilities carry only a raw id, never show it
    if (ev.echo) { ring(fx, R_RING, x, y, 10 * u, 70 * u, 2 * u, 0.4, C.bone, 0.8); floater(fx, F_LABEL, 'ECHO', x, y - 46 * u, 12, C.bone); }
    return;
  }
  // card cast
  if (ev.x || ev.y) loc(fx, ev.x, ev.y); else fieldCentre(fx);
  const x = fx.px, y = fx.py;
  const col = ev.cardType === 'trap' ? C.magenta : ev.cardType === 'summon' ? C.cyan : ev.cardType === 'build' ? C.lime : C.mage;
  ring(fx, R_RUNE, x, y + 14 * u, 12 * u, 62 * u, 2.5 * u, 0.6, col, 0.9, rs(fx, 0, 3), 0.45);
  ring(fx, R_FLASH, x, y, 54 * u, 54 * u, 0, 0.22, col, 0.8);
  radial(fx, x, y, 12, SH_STAR4, 40 * u, 150 * u, 0.6, 6 * u, 1 * u, col, C.bone, 2, -100 * u, 0, TAU, 1);
  if (ev.name && !ev.echo) floater(fx, F_LABEL, String(ev.name), x, y - 44 * u, 14, C.bone, { life: 1.2 });
  if (ev.echo) floater(fx, F_LABEL, 'ECHO', x, y - 58 * u, 12, C.cyan);
}

function onHeal(fx, ev) {
  if (ev.base) baseLoc(fx); else loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  const k = ev.base ? 1.8 : 1;
  const n = qn(fx, ev.base ? 8 : 4);
  for (let i = 0; i < n; i++) {
    const p = pp(fx, SH_PLUS, x + rs(fx, -14, 14) * u * k, y + rs(fx, 0, 10) * u, rs(fx, -14, 14) * u, -rs(fx, 40, 90) * u, 0.8, 5.5 * u * k, 4 * u, i & 1 ? C.lime : C.bone, 1, 0, 1);
    pex(fx, p, 0, 0, 0, 0, 0);
  }
  pex0(fx, pp(fx, SH_GLOW, x, y, 0, 0, 0.4, 36 * u * k, 12 * u, C.lime, 0, 0, 0.8));
  ring(fx, R_RING, x, y + 6 * u, 6 * u, 30 * u * k, 2.5 * u, 0.35, C.lime, 0.8);
  if (fin(ev.amount) >= 0.5) floater(fx, F_HEAL, '+' + formatNum(Math.round(ev.amount)), x, y - 16 * u, ev.base ? 22 : 16, C.lime);
}

function onStatus(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  const s = String(ev.status || '');
  if (s === 'stun') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      const p = pp(fx, SH_STAR5, x + Math.cos(a) * 14 * u, y - 22 * u + Math.sin(a) * 4 * u, -Math.sin(a) * 60 * u, Math.cos(a) * 14 * u, 0.7, 5 * u, 3 * u, C.bone, 1, 0, 1);
      pex(fx, p, 0, 6, 0, 0, 0);
    }
    floater(fx, F_LABEL, 'STUN', x, y - 34 * u, 12, C.bone);
  } else if (s === 'dot') {
    const el = elem(ev.element);
    radial(fx, x, y - 6 * u, 4, SH_EMBER, 10 * u, 40 * u, 0.6, 3.5 * u, 0.6 * u, el[0], el[1], 1, 40 * u, Math.PI / 2, 1.2, 1);
    ring(fx, R_RING, x, y, 4 * u, 22 * u, 2 * u, 0.3, el[0], 0.7);
  } else if (s === 'buff' || s === 'debuff') {
    const up = s === 'buff';
    const col = up ? C.lime : C.magenta;
    for (let i = 0; i < 3; i++) {
      const p = pp(fx, SH_ARROW, x + (i - 1) * 9 * u, y + (up ? 6 : -18) * u, 0, (up ? -1 : 1) * 46 * u, 0.7, 5 * u, 4 * u, col, 1, 0, 1);
      pex(fx, p, up ? 0 : Math.PI, 0, 0, 0, 0);
    }
    ring(fx, R_GROUND, x, y + 12 * u, 4 * u, 26 * u, 2 * u, 0.4, col, 0.8, 0, 0.45);
    if (ev.stat) floater(fx, F_LABEL, String(ev.stat).toUpperCase() + (up ? ' UP' : ' DOWN'), x, y - 30 * u, 11, col, { life: 0.9 });
  } else if (s === 'reflect') {
    ring(fx, R_HEX, x, y, 8 * u, 34 * u, 2.5 * u, 0.5, C.cyan, 0.9, 0.1);
  } else {
    ring(fx, R_RING, x, y, 4 * u, 26 * u, 2 * u, 0.3, C.boneDim, 0.7);
  }
}

function onShield(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  ring(fx, R_HEX, x, y, 8 * u, 36 * u, 3 * u, 0.5, C.cyan, 0.95, rr(fx));
  ring(fx, R_FLASH, x, y, 34 * u, 34 * u, 0, 0.3, C.cyan, 0.6);
  radial(fx, x, y, 6, SH_STAR4, 30 * u, 90 * u, 0.5, 4.5 * u, 1 * u, C.cyan, C.bone, 3, 0, 0, TAU, 1);
  if (fin(ev.amount) >= 0.5) floater(fx, F_SHIELD, '+' + formatNum(Math.round(ev.amount)), x, y - 18 * u, 16, C.cyan);
}

function onBaseHit(fx, ev) {
  baseLoc(fx);
  const x = fx.px, y = fx.py, u = fx.u;
  const b = fin(ev.amount);
  const big = clamp(b / 40, 0.4, 2);
  trauma(fx, 0.3 + 0.1 * big);
  stop(fx, 0.06);
  flashScr(fx, PAL.magenta, 0.32, 5);
  vignette(fx, C.magenta, 0.6);
  chroma(fx, 0.45);
  ring(fx, R_RING, x + 10 * u, y, 8 * u, 70 * u, 6 * u, 0.35, C.magenta, 0.95);
  ring(fx, R_CROSS, x + 6 * u, y, 60 * u, 60 * u, 0, 0.3, C.bone, 0.9, 0.7);
  radial(fx, x + 10 * u, y, 12, SH_SPARK, 120 * u, 330 * u, 0.4, 2.4 * u, 0.5 * u, C.magenta, C.bone, 4, 200 * u, -Math.PI / 2, Math.PI, 1);
  radial(fx, x + 10 * u, y, 5, SH_SHARD, 70 * u, 200 * u, 0.6, 4 * u, 1 * u, C.violetHi, C.bone, 3, 420 * u, -Math.PI / 2, Math.PI, 1);
  if (b >= 0.5) floater(fx, F_BIG, '-' + formatNum(Math.round(b)), x + 44 * u, y - 24 * u, 26, C.magenta, { vy: -46 });
}

function onChain(fx, ev) {
  const path = ev.path;
  if (!path || path.length < 2) return;
  const el = ev.element === 'phys' || !ev.element ? ELEM.elec : elem(ev.element), u = fx.u;
  const bm = beam(fx, B_BOLT, 0.34, el[0], el[1], 4.2 * u, 1);
  const segs = path.length - 1;
  const sub = clamp(Math.floor((BEAM_PTS - 2) / segs), 1, 5);
  let px = 0, py = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (!p) continue;
    loc(fx, p.x, p.y);
    const x = fx.px, y = fx.py;
    if (i > 0) {
      const dx = x - px, dy = y - py, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      for (let k = 1; k < sub; k++) {
        const f = k / sub, j = rs(fx, -1, 1) * 13 * u;
        bpt(bm, px + dx * f + nx * j, py + dy * f + ny * j);
      }
    }
    bpt(bm, x, y);
    px = x; py = y;
    ring(fx, R_FLASH, x, y, 22 * u, 22 * u, 0, 0.2, el[0], 0.8);
    radial(fx, x, y, 4, SH_SPARK, 50 * u, 170 * u, 0.25, 1.8 * u, 0.4 * u, el[0], el[1], 5, 60 * u, 0, TAU, 1);
  }
}

function onPierce(fx, ev) {
  loc(fx, ev.x1, ev.y1); const ax = fx.px, ay = fx.py;
  loc(fx, ev.x2, ev.y2); const bx = fx.px, by = fx.py;
  const el = ev.element === 'phys' || !ev.element ? ELEM.elec : elem(ev.element), u = fx.u;
  const bm = beam(fx, B_LINE, 0.32, el[0], el[1], 6 * u, 1);
  bpt(bm, ax, ay); bpt(bm, bx, by);
  ring(fx, R_FLASH, ax, ay, 28 * u, 28 * u, 0, 0.2, el[0], 0.9);
  ring(fx, R_CROSS, bx, by, 40 * u, 40 * u, 0, 0.28, C.bone, 0.9, 0.2);
  const n = qn(fx, 12), len = bx - ax;
  for (let i = 0; i < n; i++) {
    const f = rr(fx);
    pex0(fx, pp(fx, SH_SPARK, ax + len * f, ay + rs(fx, -4, 4) * u, Math.sign(len || 1) * rs(fx, 100, 260) * u, rs(fx, -30, 30) * u, 0.3, 1.8 * u, 0.4 * u, i & 1 ? el[0] : C.bone, 5, 0, 1));
  }
  radial(fx, bx, by, 6, SH_SPARK, 80 * u, 220 * u, 0.3, 2 * u, 0.4 * u, el[0], el[1], 5, 100 * u, 0, TAU, 1);
}

function onAoe(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  const rad = clamp(fin(ev.radius, 1), 0.3, 6) * fx.tw;
  const e = String(ev.element || 'phys');
  const el = elem(e);
  const k = clamp(rad / (fx.tw * 1.5), 0.4, 2.5);
  ring(fx, R_GROUND, x, y + 12 * u, rad * 0.2, rad, 6 * u, 0.5, el[0], 0.95, 0, 0.45);
  ring(fx, R_RING, x, y, rad * 0.15, rad * 0.85, 5 * u, 0.35, el[1], 0.8);
  ring(fx, R_FLASH, x, y, rad * 0.9, rad * 0.9, 0, 0.24, el[0], 0.75);
  trauma(fx, 0.05 + 0.07 * k);
  const n = Math.round(10 + 8 * k);
  if (e === 'fire' || e === 'bleed') {
    radial(fx, x, y, n, SH_EMBER, 40 * u, rad * 1.6, 0.8, 4.5 * u, 0.5 * u, el[0], el[1], 2, -150 * u, 0, TAU, 1);
    radial(fx, x, y, 4, SH_SMOKE, 10 * u, 40 * u, 0.7, 8 * u, 26 * u, C.ink, C.ink, 2, -50 * u, 0, TAU, 0.7);
  } else if (e === 'elec') {
    radial(fx, x, y, n, SH_SPARK, 80 * u, rad * 2.2, 0.3, 2 * u, 0.4 * u, el[0], el[1], 4, 0, 0, TAU, 1);
    for (let i = 0; i < 3; i++) {
      const bm = beam(fx, B_BOLT, 0.22, el[0], el[1], 2 * u, 1);
      const a = rs(fx, 0, TAU);
      bpt(bm, x, y);
      bpt(bm, x + Math.cos(a) * rad * 0.35 + rs(fx, -6, 6) * u, y + Math.sin(a) * rad * 0.2 + rs(fx, -6, 6) * u);
      bpt(bm, x + Math.cos(a) * rad * 0.7, y + Math.sin(a) * rad * 0.4);
    }
  } else if (e === 'poison') {
    radial(fx, x, y, n, SH_GLOW, 20 * u, rad * 0.9, 0.9, 6 * u, 2 * u, el[0], el[1], 1.5, -60 * u, 0, TAU, 0.8);
  } else if (e === 'holy') {
    ring(fx, R_PILLAR, x, y + 14 * u, rad * 0.5, rad * 2, 0, 0.6, C.bone, 0.8);
    radial(fx, x, y, n, SH_STAR4, 20 * u, rad * 1.1, 0.8, 6 * u, 1 * u, C.bone, C.cyan, 2, -90 * u, 0, TAU, 1);
  } else if (e === 'shadow' || e === 'void') {
    for (let i = 0; i < qn(fx, 12); i++) {
      const a = rs(fx, 0, TAU), d = rad * rs(fx, 0.7, 1.15);
      pex0(fx, pp(fx, SH_SMOKE, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, 0, 0, 0.5, 8 * u, 4 * u, C.ink, 0, 0, 0.8));
      const j = fx.n - 1; if (j >= 0) pex(fx, j, 0, 0, x, y, 9);
    }
    radial(fx, x, y, 8, SH_SPARK, 60 * u, rad * 1.4, 0.4, 2 * u, 0.4 * u, el[0], el[1], 3, 0, 0, TAU, 1);
  } else {
    radial(fx, x, y, n, SH_SPARK, 80 * u, rad * 1.8, 0.35, 2.4 * u, 0.4 * u, el[0], el[1], 4, 160 * u, 0, TAU, 1);
    radial(fx, x, y, 6, SH_SHARD, 60 * u, rad * 1.0, 0.6, 4 * u, 1 * u, C.boneDim, C.violetHi, 3, 400 * u, -Math.PI / 2, Math.PI, 1);
  }
}

function onKnockback(fx, ev) {
  loc(fx, ev.x0, ev.y); const ax = fx.px, ay = fx.py;
  loc(fx, ev.x1, ev.y); const bx = fx.px, by = fx.py;
  const u = fx.u;
  const bm = beam(fx, B_TRAIL, 0.35, C.bone, C.magenta, 7 * u, 0.9);
  bpt(bm, ax, ay); bpt(bm, bx, by);
  ring(fx, R_RING, ax, ay, 4 * u, 34 * u, 3 * u, 0.2, C.bone, 0.9);
  const n = qn(fx, 5);
  for (let i = 0; i < n; i++) {
    const f = i / n;
    pex0(fx, pp(fx, SH_SMOKE, lerp(ax, bx, f), by + 12 * u, 0, -rs(fx, 5, 20) * u, 0.4, 4 * u, 11 * u, C.boneDim, 2, 0, 0.55));
  }
}

function onPull(fx, ev) {
  loc(fx, ev.x0, ev.y0); const ax = fx.px, ay = fx.py;
  loc(fx, ev.x1, ev.y1); const bx = fx.px, by = fx.py;
  const u = fx.u;
  const bm = beam(fx, B_TRAIL, 0.35, C.violetHi, C.bone, 6 * u, 0.9);
  bpt(bm, ax, ay); bpt(bm, bx, by);
  ring(fx, R_RING, bx, by, 46 * u, 8 * u, 3 * u, 0.3, C.violetHi, 0.9);
  const n = qn(fx, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const j = pp(fx, SH_SPARK, bx + Math.cos(a) * 40 * u, by + Math.sin(a) * 26 * u, 0, 0, 0.3, 2 * u, 0.5 * u, i & 1 ? C.violetHi : C.bone, 0, 0, 1);
    pex(fx, j, 0, 0, bx, by, 14);
  }
}

function onExecute(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  if (ev.fizzle) {
    radial(fx, x, y, 4, SH_SMOKE, 10 * u, 30 * u, 0.5, 4 * u, 12 * u, C.slate, C.slate, 2, -20 * u, 0, TAU, 0.8);
    floater(fx, F_LABEL, 'RESIST', x, y - 26 * u, 12, C.boneDim);
    return;
  }
  if (!ev.killed) { ring(fx, R_SLASH, x, y, 22 * u, 28 * u, 5 * u, 0.2, C.magenta, 0.9, -0.7, 1); return; }
  stop(fx, 0.09); trauma(fx, 0.3); flashScr(fx, PAL.bone, 0.14, 8);
  ring(fx, R_SLASH, x, y, 30 * u, 36 * u, 8 * u, 0.3, C.bone, 1, -0.8, 1);
  ring(fx, R_SLASH, x, y, 30 * u, 36 * u, 8 * u, 0.3, C.magenta, 1, 0.8 + Math.PI, 1);
  ring(fx, R_CROSS, x, y, 70 * u, 70 * u, 0, 0.32, C.magenta, 1, 0.8);
  radial(fx, x, y, 14, SH_SPARK, 140 * u, 380 * u, 0.4, 2.4 * u, 0.4 * u, C.magenta, C.bone, 5, 100 * u, 0, TAU, 1);
  floater(fx, F_BIG, 'EXECUTE', x, y - 30 * u, 20, C.magenta, { vy: -40 });
}

function onTrapSet(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  const r = clamp(fin(ev.radius, 1), 0.4, 3) * fx.tw * 0.55;
  ring(fx, R_RUNE, x, y + 14 * u, r * 0.3, r, 2.5 * u, 0.8, C.magenta, 0.95, rs(fx, 0, 3), 0.45);
  ring(fx, R_GROUND, x, y + 14 * u, r * 0.2, r * 1.2, 2.5 * u, 0.45, C.magenta, 0.8, 0, 0.45);
  radial(fx, x, y + 12 * u, 6, SH_SPARK, 20 * u, 80 * u, 0.5, 1.8 * u, 0.4 * u, C.magenta, C.bone, 3, -70 * u, -Math.PI / 2, 1.6, 1);
}

function onTrapTrigger(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  trauma(fx, 0.22); stop(fx, 0.04);
  ring(fx, R_FLASH, x, y, 60 * u, 60 * u, 0, 0.22, C.magenta, 0.9);
  ring(fx, R_GROUND, x, y + 12 * u, 6 * u, 70 * u, 5 * u, 0.4, C.magenta, 0.95, 0, 0.45);
  ring(fx, R_CROSS, x, y, 50 * u, 50 * u, 0, 0.28, C.bone, 0.9, 0.5);
  radial(fx, x, y, 14, SH_SPARK, 100 * u, 300 * u, 0.4, 2.2 * u, 0.4 * u, C.magenta, C.bone, 4, 260 * u, -Math.PI / 2, Math.PI, 1);
  radial(fx, x, y, 4, SH_SHARD, 60 * u, 180 * u, 0.5, 4 * u, 1 * u, C.boneDim, C.magenta, 3, 420 * u, -Math.PI / 2, Math.PI, 1);
}

function onBarricade(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  ring(fx, R_GROUND, x, y + 14 * u, 4 * u, 40 * u, 3 * u, 0.4, C.boneDim, 0.8, 0, 0.45);
  radial(fx, x, y + 14 * u, 8, SH_SHARD, 40 * u, 160 * u, 0.5, 4 * u, 1.5 * u, C.boneDim, C.violetHi, 3, 380 * u, -Math.PI / 2, Math.PI, 1);
  radial(fx, x, y + 16 * u, 4, SH_SMOKE, 10 * u, 30 * u, 0.5, 5 * u, 14 * u, C.ink3, C.ink3, 2, -20 * u, Math.PI, Math.PI, 0.7);
  trauma(fx, 0.05);
}

function onAura(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  const r = clamp(fin(ev.radius, 1.5), 0.5, 6) * fx.tw;
  ring(fx, R_GROUND, x, y + 14 * u, r * 0.2, r, 3 * u, 0.9, C.lime, 0.6, 0, 0.45);
  ring(fx, R_RUNE, x, y + 14 * u, r * 0.5, r * 0.7, 2 * u, 1.1, C.cyan, 0.7, 0, 0.45);
  radial(fx, x, y + 8 * u, 10, SH_GLOW, 10 * u, 60 * u, 1.0, 5 * u, 1 * u, C.lime, C.cyan, 1, -50 * u, 0, TAU, 0.7);
}

function onEnergy(fx, ev) {
  const L = fx.layout;
  rectCentre(fx, L && L.handRect, fx.H * 0.88);
  const x = (L && L.handRect ? L.handRect.x + L.handRect.w * 0.12 : fx.W * 0.12), y = L && L.handRect ? L.handRect.y : fx.py, u = fx.u;
  const a = fin(ev.amount);
  const col = a >= 0 ? C.cyan : C.magenta;
  radial(fx, x, y, 10, SH_SPARK, 30 * u, 140 * u, 0.5, 2 * u, 0.4 * u, col, C.bone, 3, -80 * u, -Math.PI / 2, 1.8, 1);
  ring(fx, R_FLASH, x, y, 40 * u, 40 * u, 0, 0.3, col, 0.8);
  if (a !== 0) floater(fx, F_ENERGY, (a > 0 ? '+' : '') + formatNum(Math.round(a * 10) / 10, { decimals: 1 }), x + 20 * u, y - 10 * u, 20, col);
}

function onDraw(fx, ev) {
  const L = fx.layout;
  const r = L && L.handRect;
  const y = r ? r.y + 6 * fx.u : fx.H * 0.86, x0 = r ? r.x : 0, w = r ? r.w : fx.W, u = fx.u;
  const n = clamp(fin(ev.count, 1), 1, 5);
  for (let i = 0; i < n; i++) {
    const bm = beam(fx, B_TRACER, 0.22, C.cyan, C.bone, 2.4 * u, 0.9);
    const yy = y + i * 3 * u;
    bpt(bm, x0 + w * 0.08, yy); bpt(bm, x0 + w * (0.4 + 0.1 * i), yy - 4 * u);
  }
  ring(fx, R_FLASH, x0 + w * 0.5, y, w * 0.4, w * 0.4, 0, 0.18, C.cyan, 0.3);
  radial(fx, x0 + w * 0.3, y, 6, SH_SPARK, 80 * u, 200 * u, 0.3, 1.8 * u, 0.4 * u, C.cyan, C.bone, 5, 0, -0.4, 0.8, 1);
}

function onRevive(fx, ev) {
  if (ev.base) baseLoc(fx); else loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  const k = ev.base ? 2 : 1;
  ring(fx, R_PILLAR, x, y + 14 * u, 36 * u * k, 150 * u * k, 0, 0.9, C.lime, 0.9);
  ring(fx, R_GROUND, x, y + 14 * u, 6 * u, 60 * u * k, 4 * u, 0.6, C.lime, 0.9, 0, 0.45);
  ring(fx, R_RING, x, y, 6 * u, 48 * u * k, 3 * u, 0.5, C.bone, 0.9);
  radial(fx, x, y + 10 * u, Math.round(12 * k), SH_PLUS, 20 * u, 80 * u, 0.9, 6 * u, 4 * u, C.lime, C.bone, 1, -140 * u, -Math.PI / 2, 1.8, 1);
  radial(fx, x, y + 10 * u, 10, SH_STAR4, 30 * u, 120 * u, 0.8, 5 * u, 1 * u, C.bone, C.lime, 2, -120 * u, -Math.PI / 2, 1.8, 1);
  floater(fx, F_BIG, 'REVIVE', x, y - 34 * u, 18, C.lime, { vy: -36 });
  if (ev.base) { flashScr(fx, PAL.lime, 0.4, 2.4); trauma(fx, 0.2); vignette(fx, C.lime, 0.4); }
}

function onWave(fx, ev) {
  if (ev.phase !== undefined && ev.boss) {
    // boss phase change
    loc(fx, ev.x, ev.y);
    const x = fx.px, y = fx.py, u = fx.u;
    trauma(fx, 0.55); chroma(fx, 0.6); stop(fx, 0.1); flashScr(fx, PAL.magenta, 0.26, 4); vignette(fx, C.magenta, 0.6);
    ring(fx, R_GROUND, x, y + 14 * u, 10 * u, 190 * u, 9 * u, 0.7, C.magenta, 0.95, 0, 0.45);
    ring(fx, R_RING, x, y, 10 * u, 150 * u, 6 * u, 0.5, C.bone, 0.9);
    ring(fx, R_CROSS, x, y, 110 * u, 110 * u, 0, 0.45, C.magenta, 1, 0.3);
    radial(fx, x, y, 26, SH_SPARK, 150 * u, 420 * u, 0.5, 2.6 * u, 0.5 * u, C.magenta, C.bone, 4, 0, 0, TAU, 1);
    banner(fx, 1, String(ev.name || 'PHASE').toUpperCase(), 'PHASE ' + (fin(ev.phase) + 1), C.magenta, 2.1);
    return;
  }
  const boss = !!ev.isBossWave;
  if (boss) {
    trauma(fx, 0.3); chroma(fx, 0.5); flashScr(fx, PAL.magenta, 0.25, 3); vignette(fx, C.magenta, 0.4);
  } else chroma(fx, 0.12);
  banner(fx, boss ? 1 : 0, boss ? 'BOSS WAVE' : String(ev.name || 'WAVE').toUpperCase(), ev.waves ? ev.wave + ' / ' + ev.waves : '', boss ? C.magenta : C.cyan, boss ? 2.2 : 1.6);
}

function onRule(fx, ev) {
  const txt = String(ev.rule || 'rule').replace(/_/g, ' ').toUpperCase();
  banner(fx, 2, txt, '', C.violetHi, 1.5);
}

function onReward(fx, ev) {
  const L = fx.layout;
  const r = L && L.topBar;
  const col = CURRENCY_CI[ev.resource] === undefined ? C.bone : CURRENCY_CI[ev.resource];
  const x = r ? r.x + r.w * 0.5 : fx.W * 0.5, y = r ? r.y + r.h + 10 * fx.u : fx.H * 0.12, u = fx.u;
  const txt = (ev.pct ? '+' + Math.round(fin(ev.pct) * (Math.abs(ev.pct) <= 5 ? 100 : 1)) + '%' : ev.flat ? '+' + formatNum(ev.flat) : '+') + ' ' + String(ev.resource || '').toUpperCase();
  floater(fx, F_LABEL, txt, x, y, 14, col, { life: 1.3 });
  radial(fx, x, y, 8, SH_STAR4, 20 * u, 90 * u, 0.6, 5 * u, 1 * u, col, C.bone, 2, 0, 0, TAU, 1);
}

function onCleanse(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  ring(fx, R_RING, x, y + 4 * u, 6 * u, 34 * u, 2.5 * u, 0.4, C.lime, 0.8);
  radial(fx, x, y + 8 * u, 8, SH_STAR4, 20 * u, 80 * u, 0.7, 4.5 * u, 1 * u, C.bone, C.lime, 2, -100 * u, -Math.PI / 2, 1.8, 1);
}

function onTaunt(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  const r = clamp(fin(ev.radius, 2), 0.5, 6) * fx.tw;
  for (let i = 0; i < 3; i++) delay(fx, i * 0.09, D_RING, x, y + 12 * u, r, r * 0.15, C.tank);
  ring(fx, R_GROUND, x, y + 12 * u, r * 0.2, r, 3 * u, 0.5, C.magenta, 0.7, 0, 0.45);
  floater(fx, F_LABEL, 'TAUNT', x, y - 34 * u, 12, C.tank);
}

function onReflect(fx, ev) {
  const a = unitOf(fx, ev.src), t = unitOf(fx, ev.tgt), u = fx.u;
  if (a) {
    loc(fx, a.x, a.y);
    const x = fx.px, y = fx.py;
    ring(fx, R_HEX, x, y, 8 * u, 36 * u, 3 * u, 0.35, C.cyan, 0.95, 0.4);
    if (t) {
      loc(fx, t.x, t.y);
      const bm = beam(fx, B_BOLT, 0.2, C.cyan, C.bone, 2 * u, 1);
      bpt(bm, x, y); bpt(bm, (x + fx.px) / 2 + rs(fx, -8, 8) * u, (y + fx.py) / 2 + rs(fx, -8, 8) * u); bpt(bm, fx.px, fx.py);
      radial(fx, fx.px, fx.py, 5, SH_SPARK, 60 * u, 170 * u, 0.25, 1.8 * u, 0.4 * u, C.cyan, C.bone, 5, 0, 0, TAU, 1);
      if (fin(ev.amount) >= 0.5) floater(fx, F_SHIELD, formatNum(Math.round(ev.amount)), fx.px, fx.py - 16 * u, 15, C.cyan);
    }
  }
}

function onAttack(fx, ev) {
  const u = fx.u;
  const sUnit = unitOf(fx, ev.src);
  const cat = sUnit ? sUnit.side === 'cat' : ev.tx > ev.x;
  const col = cat ? C.cyan : C.magenta;
  loc(fx, ev.x, ev.y); const ax = fx.px, ay = fx.py;
  loc(fx, ev.tx, ev.ty); const bx = fx.px, by = fx.py;
  if (ev.ranged) {
    pex0(fx, pp(fx, SH_GLOW, ax + (bx > ax ? 12 : -12) * u, ay, 0, 0, 0.1, 14 * u, 4 * u, col, 0, 0, 0.9));
    if (fx.quality > 0) { const bm = beam(fx, B_TRACER, 0.12, col, C.bone, 2.4 * u, 0.7); bpt(bm, ax, ay); bpt(bm, bx, by); }
  } else {
    ring(fx, R_SLASH, bx, by, 14 * u, 17 * u, 3.5 * u, 0.14, cat ? C.bone : C.magenta, 0.9, (bx >= ax ? 0 : Math.PI) + rs(fx, -0.9, 0.9), 1);
    if (fx.quality > 0) radial(fx, bx, by, 2, SH_SPARK, 60 * u, 150 * u, 0.18, 1.6 * u, 0.4 * u, col, C.bone, 6, 0, bx >= ax ? 0 : Math.PI, 1.2, 1);
  }
}

function onMerge(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py, u = fx.u;
  loc(fx, ev.fx, ev.fy);
  const ox = fx.px, oy = fx.py;
  const cat = CAT_BY_ID[ev.id];
  const rc = ci(cat ? ROLE_COLOR[cat.role] || PAL.cyan : PAL.cyan);
  if (ev.gone) {
    // the partner is sucked into the keeper
    const bm = beam(fx, B_TRAIL, 0.3, rc, C.bone, 9 * u, 0.9);
    bpt(bm, x, y); bpt(bm, ox, oy);
    const n = qn(fx, 10);
    for (let i = 0; i < n; i++) {
      const j = pp(fx, SH_GLOW, x + rs(fx, -8, 8) * u, y + rs(fx, -10, 8) * u, rs(fx, -40, 40) * u, rs(fx, -60, 10) * u, 0.3, 7 * u, 3 * u, i & 1 ? rc : C.bone, 0, 0, 1);
      pex(fx, j, 0, 0, ox, oy, 26);
    }
    ring(fx, R_RING, x, y, 36 * u, 4 * u, 3 * u, 0.25, rc, 0.9);
    return;
  }
  mark(fx.popAt, ev.uid, fx.t);
  const m = clamp(fin(ev.merged, 1), 1, 3);
  stop(fx, 0.05 + 0.02 * m);
  delay(fx, 0.14, D_MERGE, x, y, rc, m, fin(ev.stars, 1));
}

/** The merge payoff, run after the suction has landed. a = role colour, b = merged (1..3), c = stars. */
function mergeBurst(fx, x, y, rc, m, stars) {
  const u = fx.u, k = 1 + 0.4 * m;
  const max = m >= 3;
  flashScr(fx, PAL.bone, 0.06 + 0.04 * m, 7);
  trauma(fx, 0.2 + 0.12 * m);
  ring(fx, R_FLASH, x, y, 78 * u * k, 78 * u * k, 0, 0.34, rc, 0.55);
  ring(fx, R_FLASH, x, y, 28 * u * k, 28 * u * k, 0, 0.16, C.bone, 0.6);
  ring(fx, R_CROSS, x, y, 170 * u * k, 170 * u * k, 0, 0.55, C.bone, 0.9, 0.1);
  for (let i = 0; i <= m; i++) delay(fx, i * 0.07, D_RING, x, y, 10 * u, (110 + 52 * i) * u * k, i & 1 ? C.cyan : rc);
  ring(fx, R_GROUND, x, y + 14 * u, 10 * u, 190 * u * k, 7 * u, 0.7, rc, 0.95, 0, 0.45);
  ring(fx, R_PILLAR, x, y + 14 * u, 38 * u * k, 280 * u * k, 0, 0.8, rc, 0.85);
  // radial fireworks in three colours: long streaks, round glow shells, tumbling four-point stars
  radial(fx, x, y, 26 + 14 * m, SH_SPARK, 240 * u, 680 * u * k, 0.85, 3 * u, 0.4 * u, rc, C.bone, 2.4, 260 * u, 0, TAU, 1);
  radial(fx, x, y, 14 + 8 * m, SH_GLOW, 120 * u, 460 * u * k, 0.95, 9 * u, 2 * u, C.cyan, rc, 2.4, 70 * u, 0, TAU, 1);
  radial(fx, x, y, 10 + 5 * m, SH_STAR4, 120 * u, 420 * u * k, 1.0, 10 * u, 1.5 * u, C.bone, C.cyan, 2, 140 * u, 0, TAU, 1);
  // star pips rise: one per merge level, bigger and slower so they read
  for (let i = 0; i <= m; i++) {
    const j = pp(fx, SH_STAR5, x + (i - m / 2) * 22 * u, y - 24 * u, 0, -rs(fx, 40, 64) * u, 1.3, 11 * u, 8 * u, i & 1 ? C.bone : rc, 1.2, 0, 1);
    pex(fx, j, 0, 0, 0, 0, 0);
  }
  delay(fx, 0.2, D_SPARKS, x, y, rc, m);
  floater(fx, F_BIG, max ? 'MAX MERGE!' : 'MERGE +' + m, x, y - 52 * u, max ? 28 : 22, max ? C.bone : rc, { vy: -30, life: 1.2 });
  if (max) {
    chroma(fx, 0.6); slowmo(fx, 0.45, 0.35); vignette(fx, rc, 0.35);
    delay(fx, 0.12, D_FIREWORK, x - 74 * u, y - 46 * u, C.magenta, C.cyan, 0.9);
    delay(fx, 0.22, D_FIREWORK, x + 74 * u, y - 54 * u, C.lime, C.bone, 0.9);
    delay(fx, 0.1, D_CONFETTI, x, y - 20 * u, rc, 1);
  }
}

function onBurrow(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py + 12 * fx.u, u = fx.u;
  ring(fx, R_GROUND, x, y, 4 * u, 38 * u, 3 * u, 0.4, C.violetHi, 0.8, 0, 0.45);
  radial(fx, x, y, 8, SH_SHARD, 30 * u, 120 * u, 0.5, 3.5 * u, 1 * u, C.violetHi, C.violet, 3, 360 * u, -Math.PI / 2, Math.PI, 1);
  radial(fx, x, y, 4, SH_SMOKE, 8 * u, 24 * u, 0.5, 5 * u, 14 * u, C.ink3, C.ink3, 2, -10 * u, 0, TAU, 0.8);
}

function onEmerge(fx, ev) {
  loc(fx, ev.x, ev.y);
  const x = fx.px, y = fx.py + 12 * fx.u, u = fx.u;
  trauma(fx, 0.14);
  ring(fx, R_GROUND, x, y, 6 * u, 62 * u, 5 * u, 0.5, C.magenta, 0.9, 0, 0.45);
  ring(fx, R_SMOKE, x, y, 4 * u, 34 * u, 6 * u, 0.4, C.ink, 0.6);
  radial(fx, x, y, 12, SH_SHARD, 70 * u, 240 * u, 0.6, 4 * u, 1 * u, C.violetHi, C.boneDim, 3, 520 * u, -Math.PI / 2, Math.PI, 1);
  radial(fx, x, y, 6, SH_SPARK, 80 * u, 200 * u, 0.3, 2 * u, 0.4 * u, C.magenta, C.bone, 4, 100 * u, -Math.PI / 2, Math.PI, 1);
}

function onSummonCall(fx, ev) {
  const un = unitOf(fx, ev.uid), u = fx.u;
  if (un) loc(fx, un.x, un.y); else loc(fx, 9, 2);
  const x = fx.px, y = fx.py;
  ring(fx, R_RUNE, x, y + 14 * u, 10 * u, 66 * u, 3 * u, 0.8, C.magenta, 0.95, rs(fx, 0, 3), 0.45);
  ring(fx, R_PILLAR, x, y + 14 * u, 30 * u, 120 * u, 0, 0.7, C.magenta, 0.8);
  for (let i = 0; i < qn(fx, 10); i++) {
    const a = rs(fx, 0, TAU);
    const j = pp(fx, SH_GLOW, x + Math.cos(a) * 54 * u, y + Math.sin(a) * 30 * u + 10 * u, 0, 0, 0.45, 6 * u, 2 * u, i & 1 ? C.magenta : C.violetHi, 0, 0, 1);
    pex(fx, j, 0, 0, x, y + 8 * u, 10);
  }
  floater(fx, F_LABEL, 'CALLS x' + fin(ev.count, 1), x, y - 40 * u, 13, C.magenta);
  trauma(fx, 0.12);
}

function onLoot(fx, ev) {
  const L = fx.layout, u = fx.u;
  const kind = String(ev.kind || 'fish');
  const col = ev.rarity && RARITY_CI[ev.rarity] !== undefined ? RARITY_CI[ev.rarity] : CURRENCY_CI[kind] === undefined ? C.bone : CURRENCY_CI[kind];
  fieldCentre(fx);
  const x = fx.px, y = fx.py;
  const slot = ({ fish: 0.18, yarn: 0.4, gems: 0.62, tokens: 0.82, key: 0.9 })[kind];
  const tr = L && L.topBar;
  const tx = tr ? tr.x + tr.w * (slot === undefined ? 0.5 : slot) : fx.W * (slot === undefined ? 0.5 : slot);
  const ty = tr ? tr.y + tr.h * 0.5 : fx.H * 0.04;
  const amount = fin(ev.amount, 1);
  const n = qn(fx, clamp(Math.round(4 + Math.log10(Math.max(1, amount)) * 3), 4, 16));
  for (let i = 0; i < n; i++) {
    const a = rs(fx, 0, TAU), v = rs(fx, 60, 200) * u;
    const j = pp(fx, SH_COIN, x + rs(fx, -20, 20) * u, y + fx.lootRow * 22 * u, Math.cos(a) * v, Math.sin(a) * v - 120 * u, 1.0 + rr(fx) * 0.35, 5 * u, 3.5 * u, col, 1.5, 0, 1);
    pex(fx, j, rr(fx) * TAU, rs(fx, 6, 12), tx, ty, 9);
  }
  const rare = ev.rarity === 'legend' || ev.rarity === 'mythic';
  if (rare) { ring(fx, R_CROSS, x, y, 90 * u, 90 * u, 0, 0.8, C.goldHot, 1, 0.3); flashScr(fx, PAL.goldHot, 0.35, 3); }
  const label = kind === 'key' ? '+' + formatNum(amount) + ' ' + String(ev.id || 'key').replace(/_/g, ' ') : '+' + formatNum(amount) + ' ' + kind;
  floater(fx, F_LOOT, label, x, y + 28 * u + fx.lootRow * 22 * u, 18, col, { vy: -16, life: 1.8, vx: 0 });
  fx.lootRow++;
}

function onWin(fx, ev) {
  fieldCentre(fx);
  const x = fx.px, y = fx.py, u = fx.u;
  flashScr(fx, PAL.bone, 0.3, 4); chroma(fx, 0.4); trauma(fx, 0.25); slowmo(fx, 0.5, 0.4);
  banner(fx, 3, 'VICTORY', '', C.cyan, 3.2);
  const cols = [C.cyan, C.magenta, C.lime, C.bone, C.mage];
  for (let i = 0; i < 7; i++) {
    const fxx = fx.layout && fx.layout.field ? fx.layout.field.x + fx.layout.field.w * rs(fx, 0.1, 0.9) : fx.W * rs(fx, 0.1, 0.9);
    delay(fx, 0.1 + i * 0.17, D_FIREWORK, fxx, y - rs(fx, 40, 170) * u, cols[i % 5], cols[(i + 2) % 5], 1);
  }
  delay(fx, 0.05, D_CONFETTI, x, fx.layout && fx.layout.field ? fx.layout.field.y : 0, C.cyan, 3);
  ring(fx, R_RING, x, y, 20 * u, Math.max(fx.W, fx.H) * 0.7, 10 * u, 0.9, C.cyan, 0.8);
}

function onLose(fx, ev) {
  baseLoc(fx);
  const x = fx.px, y = fx.py, u = fx.u;
  flashScr(fx, PAL.magenta, 0.5, 2.0); trauma(fx, 0.85); chroma(fx, 0.8); stop(fx, 0.12); slowmo(fx, 0.7, 0.3);
  vignette(fx, C.magenta, 0.7); fx.vig.hold = 3;
  banner(fx, 4, 'OVERRUN', '', C.magenta, 3.4);
  ring(fx, R_RING, x, y, 10 * u, Math.max(fx.W, fx.H) * 0.8, 12 * u, 0.9, C.magenta, 0.9);
  ring(fx, R_SMOKE, x, y, 10 * u, 200 * u, 14 * u, 1.1, C.ink, 0.8);
  for (let i = 0; i < 5; i++) {
    const bm = beam(fx, B_BOLT, 0.6, C.magenta, C.bone, 2.6 * u, 1);
    let px = x + rs(fx, -10, 10) * u, py = y + rs(fx, -10, 10) * u;
    bpt(bm, px, py);
    const a = rs(fx, -1.2, 1.2);
    for (let k = 1; k < 7; k++) { px += Math.cos(a) * 26 * u + rs(fx, -10, 10) * u; py += Math.sin(a) * 26 * u + rs(fx, -10, 10) * u; bpt(bm, px, py); }
  }
  radial(fx, x, y, 22, SH_SHARD, 60 * u, 300 * u, 0.9, 5 * u, 1 * u, C.violetHi, C.magenta, 2, 300 * u, -Math.PI, Math.PI, 1);
  delay(fx, 0.2, D_SMOKEFALL, x, y, 0, 0);
}

// ------------------------------------------------------------------------------------------------ UI-side helpers
/** Screen-space burst for UI code (crate reveals, buttons). o = {n, speed, life, shape, color2, gravity, stars}. */
export function burstAt(fx, px, py, color, n, o) {
  o = o || {};
  const u = fx.u;
  const c = ci(color), c2 = ci(o.color2 || PAL.bone);
  radial(fx, px, py, n || 20, o.shape === 'star' ? SH_STAR4 : o.shape === 'glow' ? SH_GLOW : SH_SPARK, (o.speed || 120) * u * 0.4, (o.speed || 120) * u, o.life || 0.6, 3 * u, 0.5 * u, c, c2, 3, (o.gravity || 120) * u, 0, TAU, 1);
  if (o.ring !== false) ring(fx, R_RING, px, py, 6 * u, (o.ringR || 60) * u, 4 * u, 0.4, c, 0.9);
  if (o.flash) ring(fx, R_FLASH, px, py, (o.ringR || 60) * u * 1.4, (o.ringR || 60) * u * 1.4, 0, 0.25, c, 0.9);
}

// ------------------------------------------------------------------------------------------------ delayed actions
function runDelay(fx, e) {
  const u = fx.u;
  switch (e.kind) {
    case D_MERGE: mergeBurst(fx, e.x, e.y, e.a, e.b, e.c); break;
    case D_RING: ring(fx, R_RING, e.x, e.y, e.a, e.b, 4 * u, 0.4, e.c | 0, 0.9); break;
    case D_FIREWORK: {
      const k = e.c || 1;
      pex0(fx, pp(fx, SH_GLOW, e.x, e.y, 0, 0, 0.3, 60 * u * k, 20 * u, e.a | 0, 0, 0, 0.9));
      ring(fx, R_CROSS, e.x, e.y, 70 * u * k, 70 * u * k, 0, 0.35, C.bone, 1, 0.4);
      radial(fx, e.x, e.y, 30, SH_SPARK, 80 * u * k, 300 * u * k, 0.85, 2.6 * u, 0.4 * u, e.a | 0, e.b | 0, 3, 200 * u, 0, TAU, 1);
      radial(fx, e.x, e.y, 12, SH_EMBER, 40 * u * k, 200 * u * k, 1.0, 3.5 * u, 0.5 * u, e.b | 0, e.a | 0, 2, 220 * u, 0, TAU, 1);
      trauma(fx, 0.05);
      break;
    }
    case D_SPARKS:
      radial(fx, e.x, e.y, 14 + 6 * e.b, SH_EMBER, 80 * u, 420 * u, 1.3, 3.6 * u, 0.4 * u, e.a | 0, C.bone, 1.8, 320 * u, 0, TAU, 1);
      radial(fx, e.x, e.y, 10, SH_STAR4, 80 * u, 340 * u, 0.9, 6 * u, 1 * u, C.cyan, C.bone, 2.4, 220 * u, 0, TAU, 1);
      break;
    case D_CONFETTI: {
      const n = qn(fx, 60 * (e.b || 1));
      const wide = e.b > 1 ? fx.W : 140 * u;
      const cols = [C.cyan, C.magenta, C.lime, C.bone, e.a | 0];
      for (let i = 0; i < n; i++) {
        const x = e.b > 1 ? rs(fx, 0, wide) : e.x + rs(fx, -wide, wide) * 0.5;
        const j = pp(fx, SH_CONFETTI, x, e.b > 1 ? e.y - rs(fx, 0, 60) * u : e.y, rs(fx, -60, 60) * u, e.b > 1 ? rs(fx, 40, 140) * u : -rs(fx, 120, 340) * u, rs(fx, 1.6, 2.8), rs(fx, 3, 5) * u, rs(fx, 3, 5) * u, cols[i % 5], 1.2, 160 * u, 1);
        pex(fx, j, rr(fx) * TAU, rs(fx, -8, 8), 0, 0, 0);
      }
      break;
    }
    case D_SMOKEFALL: {
      const W = fx.W, H = fx.H;
      for (let i = 0; i < qn(fx, 26); i++) pex0(fx, pp(fx, SH_SMOKE, rs(fx, 0, W), -10 * u, rs(fx, -10, 10) * u, rs(fx, 30, 90) * u, rs(fx, 1.4, 2.4), 22 * u, 60 * u, C.ink, 0.2, 10 * u, 0.7));
      void H;
      break;
    }
    default: break;
  }
}

// ------------------------------------------------------------------------------------------------ update
export function update(fx, dt) {
  dt = clamp(fin(dt, 0), 0, 0.1);
  fx.t += dt;
  // adaptive quality from a smoothed frame time
  if (fx.auto && dt > 0) {
    fx.ema = fx.ema * 0.92 + dt * 0.08;
    if (fx.ema > 0.026) { fx.lowT += dt; fx.highT = 0; } else if (fx.ema < 0.0185) { fx.highT += dt; fx.lowT = 0; } else { fx.lowT = 0; fx.highT = 0; }
    if (fx.lowT > 0.7 && fx.quality > 0) { fx.quality--; fx.lowT = 0; fx.ema = 1 / 45; }
    else if (fx.highT > 5 && fx.quality < 2) { fx.quality++; fx.highT = 0; }
  }
  // time dilation
  if (fx.hitstop > 0) fx.hitstop = Math.max(0, fx.hitstop - dt);
  if (fx.slowT > 0) { fx.slowT -= dt; fx.timeScale = fx.slowT > 0 ? lerp(fx.slowScale, 1, clamp(1 - fx.slowT / 0.6, 0, 1) * 0.5) : 1; } else fx.timeScale = 1;
  const pdt = fx.hitstop > 0 ? dt * 0.06 : dt * Math.max(0.25, fx.timeScale);
  // delayed actions
  const D = fx.delays;
  for (let i = 0; i < DELAY_N; i++) {
    const e = D[i];
    if (!e.on) continue;
    e.t -= dt;
    if (e.t <= 0) { e.on = false; runDelay(fx, e); }
  }
  // particles (swap-remove)
  const P = fx.P;
  for (let i = 0; i < fx.n;) {
    const o = i * STRIDE;
    const life = P[o + LIFE] - pdt;
    if (life <= 0) {
      const last = (fx.n - 1) * STRIDE;
      if (o !== last) P.copyWithin(o, last, last + STRIDE);
      fx.n--;
      continue;
    }
    P[o + LIFE] = life;
    const seek = P[o + SEEK];
    if (seek > 0) {
      // pull toward the target, damping the old velocity so motes home in instead of orbiting
      const k = Math.min(1, seek * pdt);
      P[o + VX] += (P[o + TX] - P[o + X]) * seek * pdt * 3 - P[o + VX] * k * 0.5;
      P[o + VY] += (P[o + TY] - P[o + Y]) * seek * pdt * 3 - P[o + VY] * k * 0.5;
    }
    const d = P[o + DRAG];
    if (d > 0) { const f = Math.max(0, 1 - d * pdt); P[o + VX] *= f; P[o + VY] *= f; }
    P[o + VY] += P[o + GRAV] * pdt;
    P[o + X] += P[o + VX] * pdt;
    P[o + Y] += P[o + VY] * pdt;
    P[o + ROT] += P[o + VR] * pdt;
    i++;
  }
  // rings, beams, floaters, banners
  const R = fx.rings;
  for (let i = 0; i < RING_N; i++) { const r = R[i]; if (r.on) { r.life -= pdt; if (r.life <= 0) r.on = false; } }
  const B = fx.beams;
  for (let i = 0; i < BEAM_N; i++) { const b = B[i]; if (b.on) { b.life -= pdt; if (b.life <= 0) b.on = false; } }
  const F = fx.floaters;
  for (let i = 0; i < FLOAT_N; i++) {
    const f = F[i];
    if (!f.on) continue;
    f.life -= pdt;
    if (f.life <= 0) { f.on = false; continue; }
    f.x += f.vx * pdt; f.y += f.vy * pdt; f.vy *= Math.max(0, 1 - 1.6 * pdt); f.vx *= Math.max(0, 1 - 2 * pdt);
  }
  const S = fx.bannerSlots;
  for (let i = 0; i < BANNER_N; i++) { const s = S[i]; if (s.on) { s.life -= dt; if (s.life <= 0) s.on = false; } }
  // screen juice
  fx.trauma = Math.max(0, fx.trauma - dt * 1.5);
  const sh = fx.shake;
  if (fx.trauma > 0 && !fx.reducedMotion) {
    const a = fx.trauma * fx.trauma * 36 * fx.u, tt = fx.t;
    sh.x = a * (Math.sin(tt * 61.3) * 0.6 + Math.sin(tt * 97.1 + 1.3) * 0.4);
    sh.y = a * (Math.sin(tt * 53.7 + 2.1) * 0.6 + Math.sin(tt * 89.9 + 0.4) * 0.4);
    sh.r = a * 0.0016 * Math.sin(tt * 71.7 + 0.8);
  } else { sh.x = 0; sh.y = 0; sh.r = 0; }
  fx.flash.alpha = Math.max(0, fx.flash.alpha - dt * fx.flashDecay);
  fx.chroma = Math.max(0, fx.chroma - dt * 3.2);
  if (fx.vig.hold > 0) fx.vig.hold -= dt; else fx.vig.alpha = Math.max(0, fx.vig.alpha - dt * 1.6);
}

// ------------------------------------------------------------------------------------------------ draw
export function draw(ctx, fx, t) {
  ctx.save();
  const u = fx.u;
  // ground-level rings first (under particles)
  drawRings(ctx, fx, true);
  drawBeams(ctx, fx);
  drawParticles(ctx, fx, t);
  drawRings(ctx, fx, false);
  drawFloaters(ctx, fx);
  void u;
  ctx.restore();
  if (fx.autoOverlay) drawOverlay(ctx, fx);
}

function drawRings(ctx, fx, ground) {
  const R = fx.rings;
  ctx.globalCompositeOperation = 'lighter';
  let normalDrawn = false;
  for (let i = 0; i < RING_N; i++) {
    const r = R[i];
    if (!r.on) continue;
    const isGround = r.type === R_GROUND || r.type === R_RUNE || r.type === R_SMOKE || r.type === R_PILLAR;
    if (isGround !== ground) continue;
    const k = clamp(1 - r.life / r.max, 0, 1);
    const e = outCubic(k);
    const rad = Math.max(0.5, lerp(r.r0, r.r1, e));
    const a = r.a * Math.pow(1 - k, 0.9);
    if (a <= 0.01) continue;
    const col = COLS[r.col];
    switch (r.type) {
      case R_RING:
        ctx.globalAlpha = a * 0.25; ctx.strokeStyle = col; ctx.lineWidth = r.w * 2.6 * (1 - k * 0.6) + 1;
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
        ctx.globalAlpha = a; ctx.lineWidth = Math.max(0.8, r.w * (1 - k * 0.7));
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
        break;
      case R_GROUND:
        ctx.globalAlpha = a * 0.3; ctx.strokeStyle = col; ctx.lineWidth = r.w * 2.4 * (1 - k * 0.6) + 1;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * r.sq, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = a; ctx.lineWidth = Math.max(0.8, r.w * (1 - k * 0.7));
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * r.sq, 0, 0, TAU); ctx.stroke();
        break;
      case R_SLASH: {
        const sweep = clamp(k * 3.2, 0, 1);
        const a0 = r.rot - 1.0, a1 = a0 + 2.0 * sweep;
        ctx.lineCap = 'round';
        ctx.globalAlpha = a * 0.35; ctx.strokeStyle = col; ctx.lineWidth = r.w * 2.4;
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, a0, a1 + 0.001); ctx.stroke();
        ctx.globalAlpha = a; ctx.strokeStyle = COLS[C.bone]; ctx.lineWidth = Math.max(1, r.w * (1 - k));
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, a0, a1 + 0.001); ctx.stroke();
        ctx.lineCap = 'butt';
        break;
      }
      case R_PILLAR: {
        const s = glowSprite(r.col);
        const h = rad, w = Math.max(6, r.r0 * 0.9 * (1 - k * 0.5));
        ctx.globalAlpha = a;
        if (s) ctx.drawImage(s, r.x - w, r.y - h, w * 2, h * 1.15);
        else { ctx.fillStyle = col; ctx.fillRect(r.x - w * 0.4, r.y - h, w * 0.8, h); }
        break;
      }
      case R_CROSS: {
        const s = glowSprite(r.col === C.magenta ? C.magenta : C.bone);
        const L = rad * (1.4 - k * 0.5);
        ctx.globalAlpha = a;
        if (s) {
          ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot * (1 + k));
          ctx.drawImage(s, -L, -L * 0.05, L * 2, L * 0.1);
          ctx.drawImage(s, -L * 0.05, -L, L * 0.1, L * 2);
          ctx.restore();
        } else { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r.x - L, r.y); ctx.lineTo(r.x + L, r.y); ctx.moveTo(r.x, r.y - L); ctx.lineTo(r.x, r.y + L); ctx.stroke(); }
        dot(ctx, r.col, r.x, r.y, rad * 0.35);
        break;
      }
      case R_HEX: {
        ctx.globalAlpha = a * 0.3; ctx.strokeStyle = col; ctx.lineWidth = r.w * 2.4;
        hexPath(ctx, r.x, r.y, rad, r.rot + k * 0.8); ctx.stroke();
        ctx.globalAlpha = a; ctx.lineWidth = Math.max(0.8, r.w * (1 - k * 0.5));
        hexPath(ctx, r.x, r.y, rad, r.rot + k * 0.8); ctx.stroke();
        break;
      }
      case R_RUNE: {
        const rot = r.rot + fx.t * 1.6;
        ctx.globalAlpha = a * 0.3; ctx.strokeStyle = col; ctx.lineWidth = r.w * 2.4;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * r.sq, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = a; ctx.lineWidth = Math.max(0.8, r.w * 0.8);
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * r.sq, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad * 0.62, rad * 0.62 * r.sq, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = col;
        for (let n = 0; n < 6; n++) {
          const an = rot + (n / 6) * TAU, px = r.x + Math.cos(an) * rad, py = r.y + Math.sin(an) * rad * r.sq, d = Math.max(1.5, r.w * 1.3);
          ctx.beginPath(); ctx.moveTo(px, py - d); ctx.lineTo(px + d, py); ctx.lineTo(px, py + d); ctx.lineTo(px - d, py); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case R_FLASH:
        ctx.globalAlpha = a; dot(ctx, r.col, r.x, r.y, rad);
        break;
      case R_SMOKE: {
        if (!normalDrawn) { normalDrawn = true; }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a * 0.7; ctx.strokeStyle = COLS[C.ink]; ctx.lineWidth = r.w * (1 + k);
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.62, 0, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        break;
      }
      default: break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function hexPath(ctx, x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.9; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath();
}

function drawBeams(ctx, fx) {
  const B = fx.beams, u = fx.u, q = fx.quality;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (let i = 0; i < BEAM_N; i++) {
    const b = B[i];
    if (!b.on || b.n < 2) continue;
    const k = clamp(1 - b.life / b.max, 0, 1);
    let a = b.a * (1 - k * k) * (b.kind === B_BOLT ? 0.8 + 0.2 * Math.sin(fx.t * 90 + i) : 1);
    if (a <= 0.01) continue;
    const w = b.w * (b.kind === B_TRAIL ? 1 - k : 1 - k * 0.5);
    const pts = b.pts;
    // bible: three layered strokes 6u / 3u / 1u at alpha .12 / .3 / 1.0
    const layers = q === 0 ? 1 : 3;
    for (let l = 0; l < layers; l++) {
      const lw = layers === 1 ? w * 1.8 : l === 0 ? w * 4.6 : l === 1 ? w * 2.2 : w * 0.9;
      ctx.globalAlpha = a * (layers === 1 ? 1 : l === 0 ? 0.2 : l === 1 ? 0.5 : 1);
      ctx.strokeStyle = l === 2 ? COLS[C.bone] : COLS[b.col];
      ctx.lineWidth = Math.max(0.6, lw);
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let p = 1; p < b.n; p++) ctx.lineTo(pts[p * 2], pts[p * 2 + 1]);
      ctx.stroke();
    }
    ctx.globalAlpha = a;
    dot(ctx, b.col, pts[0], pts[1], w * 4 + 6 * u);
    dot(ctx, b.col2, pts[(b.n - 1) * 2], pts[(b.n - 1) * 2 + 1], w * 5 + 8 * u);
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function starPath(ctx, x, y, r, rot, pts) {
  ctx.beginPath();
  const n = pts * 2;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU - Math.PI / 2, rad = i & 1 ? r * 0.42 : r;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawParticles(ctx, fx, t) {
  const P = fx.P, n = fx.n;
  // pass 1: opaque / ink shapes
  ctx.globalCompositeOperation = 'source-over';
  const ink = inkSprite();
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE, sh = P[o + SH];
    if (sh !== SH_SHARD && sh !== SH_SMOKE && sh !== SH_COIN && sh !== SH_CONFETTI) continue;
    const k = 1 - P[o + LIFE] / P[o + MAX];
    const fade = Math.min(1, (P[o + LIFE] / P[o + MAX]) * 3);
    const s = lerp(P[o + S0], P[o + S1], k);
    const x = P[o + X], y = P[o + Y];
    ctx.globalAlpha = P[o + AL] * fade;
    if (sh === SH_SMOKE) {
      if (ink) ctx.drawImage(ink, x - s, y - s, s * 2, s * 2);
      else { ctx.fillStyle = COLS[P[o + COL]]; ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, TAU); ctx.fill(); }
    } else if (sh === SH_SHARD) {
      const rot = P[o + ROT];
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = COLS[P[o + COL]]; ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
      ctx.strokeStyle = COLS[C.ink]; ctx.lineWidth = 1; ctx.strokeRect(-s, -s * 0.6, s * 2, s * 1.2);
      ctx.restore();
    } else if (sh === SH_COIN) {
      const sq = Math.abs(Math.cos(P[o + ROT]));
      ctx.fillStyle = COLS[P[o + COL]];
      ctx.strokeStyle = COLS[C.ink]; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.6, s * sq), s, 0, 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      const rot = P[o + ROT], flut = Math.abs(Math.sin(rot * 2.3));
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = COLS[P[o + COL]]; ctx.fillRect(-s, -s * 0.35 * (0.3 + flut), s * 2, s * 0.7 * (0.3 + flut));
      ctx.restore();
    }
  }
  // pass 2: additive glows
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE, sh = P[o + SH];
    if (sh === SH_SHARD || sh === SH_SMOKE || sh === SH_COIN || sh === SH_CONFETTI) continue;
    const k = 1 - P[o + LIFE] / P[o + MAX];
    const fade = Math.min(1, (P[o + LIFE] / P[o + MAX]) * 3);
    const s = lerp(P[o + S0], P[o + S1], k);
    const x = P[o + X], y = P[o + Y], c = P[o + COL];
    ctx.globalAlpha = P[o + AL] * fade;
    switch (sh) {
      case SH_GLOW: case SH_EMBER:
        dot(ctx, c, x, y, s * (sh === SH_EMBER ? 1.8 : 1));
        break;
      case SH_SPARK: {
        const vx = P[o + VX], vy = P[o + VY], sp = Math.hypot(vx, vy) || 1, len = Math.min(44, 2 + sp * 0.075);
        ctx.strokeStyle = COLS[c]; ctx.lineWidth = Math.max(0.8, s);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (vx / sp) * len, y - (vy / sp) * len); ctx.stroke();
        break;
      }
      case SH_STAR4: {
        const rot = P[o + ROT];
        ctx.fillStyle = COLS[c];
        ctx.beginPath();
        for (let m = 0; m < 8; m++) { const a = rot + (m / 8) * TAU, rad = m & 1 ? s * 0.28 : s * 1.2; const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; if (m === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.closePath(); ctx.fill();
        dot(ctx, c, x, y, s * 1.6);
        break;
      }
      case SH_STAR5: {
        ctx.fillStyle = COLS[c];
        starPath(ctx, x, y, s * 1.3, P[o + ROT], 5); ctx.fill();
        dot(ctx, c, x, y, s * 2.4);
        break;
      }
      case SH_PLUS: {
        const w = s * 0.42;
        ctx.fillStyle = COLS[c];
        ctx.fillRect(x - s, y - w, s * 2, w * 2); ctx.fillRect(x - w, y - s, w * 2, s * 2);
        dot(ctx, c, x, y, s * 2);
        break;
      }
      case SH_ARROW: {
        const rot = P[o + ROT];
        ctx.fillStyle = COLS[c];
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, s * 0.2); ctx.lineTo(s * 0.3, s * 0.2); ctx.lineTo(s * 0.3, s); ctx.lineTo(-s * 0.3, s); ctx.lineTo(-s * 0.3, s * 0.2); ctx.lineTo(-s * 0.9, s * 0.2); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      default: break;
    }
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  void t;
}

function drawFloaters(ctx, fx) {
  const F = fx.floaters;
  for (let i = 0; i < FLOAT_N; i++) {
    const f = F[i];
    if (!f.on) continue;
    const age = f.max - f.life;
    const o = f.o;
    const pop = outBack(clamp(age / 0.16, 0, 1));
    o.size = f.size;
    o.color = COLS[f.col];
    o.alpha = clamp(f.life / (f.max * 0.35), 0, 1);
    o.scale = f.kind === F_CRIT || f.kind === F_BIG ? lerp(0.4, f.pop, pop) : lerp(0.6, 1, pop);
    o.kind = f.kind === F_LABEL ? 'body' : 'display';
    o.glow = f.kind === F_CRIT || f.kind === F_BIG ? 10 : 0;
    o.rotate = f.kind === F_CRIT ? Math.sin(age * 22) * 0.06 * (1 - clamp(age / 0.4, 0, 1)) : 0;
    o.stroke = f.kind === F_LABEL ? 3 : true;
    drawText(ctx, f.text, f.x, f.y, o);
  }
}

// ------------------------------------------------------------------------------------------------ overlay
const VIG = new Map();   // colour index -> gradient in normalised space (box is -1..1), so it fits any aspect
function vigGrad(ctx, col) {
  let g = VIG.get(col);
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 1.35);
    g.addColorStop(0, rgba(COLS[col], 0));
    g.addColorStop(1, rgba(COLS[col], 1));
    VIG.set(col, g);
  }
  return g;
}
let scrA = null, scrB = null;

export function drawOverlay(ctx, fx) {
  const W = fx.W, H = fx.H;
  ctx.save();
  // vignette pulse (base hits, boss phases)
  if (fx.vig.alpha > 0.01) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, fx.vig.alpha);
    ctx.translate(W / 2, H / 2); ctx.scale(W / 2, H / 2);
    ctx.fillStyle = vigGrad(ctx, fx.vig.color);
    ctx.fillRect(-1, -1, 2, 2);
  }
  // flash
  if (fx.flash.alpha > 0.01) {
    ctx.globalCompositeOperation = fx.flash.add ? 'lighter' : 'source-over';
    ctx.globalAlpha = Math.min(1, fx.flash.alpha);
    ctx.fillStyle = fx.flash.color;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  drawBanners(ctx, fx);
  if (fx.chroma > 0.03 && fx.quality > 0 && !fx.reducedMotion) drawChroma(ctx, fx);
}

function drawChroma(ctx, fx) {
  const cv = ctx.canvas;
  if (!cv || !(cv.width > 0)) return;
  if (!scrA || scrA.width !== cv.width || scrA.height !== cv.height) {
    scrA = makeCanvas(cv.width, cv.height); scrB = makeCanvas(cv.width, cv.height);
    if (!scrA || !scrB) { scrA = scrB = null; return; }
  }
  const a = scrA.getContext('2d'), b = scrB.getContext('2d');
  if (!a || !b) return;
  const off = Math.max(1, fx.chroma * 3.5 * (cv.width / Math.max(1, fx.W)));
  a.globalCompositeOperation = 'copy'; a.drawImage(cv, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (let pass = 0; pass < 2; pass++) {
    b.globalCompositeOperation = 'copy'; b.drawImage(scrA, 0, 0);
    b.globalCompositeOperation = 'multiply'; b.fillStyle = pass ? PAL.magenta : PAL.cyan; b.fillRect(0, 0, cv.width, cv.height);
    ctx.globalAlpha = Math.min(0.5, fx.chroma * 0.55);
    ctx.drawImage(scrB, pass ? off : -off, 0);
  }
  ctx.restore();
}

function drawBanners(ctx, fx) {
  const S = fx.bannerSlots;
  const L = fx.layout;
  const cx = L && L.field ? L.field.x + L.field.w / 2 : fx.W / 2;
  const cy0 = L && L.field ? L.field.y + L.field.h * 0.36 : fx.H * 0.3;
  const u = Math.max(0.7, fx.u);
  for (let i = 0; i < BANNER_N; i++) {
    const s = S[i];
    if (!s.on) continue;
    const age = s.max - s.life;
    const inT = outBack(clamp(age / 0.32, 0, 1)), outT = clamp(s.life / 0.3, 0, 1);
    const al = Math.min(inT > 0.2 ? 1 : inT * 5, outT);
    if (al <= 0.01) continue;
    const col = COLS[s.col];
    if (s.kind === 2) {
      // small rule toast near the top
      const y = (L && L.topBar ? L.topBar.y + L.topBar.h : fx.H * 0.08) + 22 * u;
      s.o2.size = 12 * u; s.o2.color = col === PAL.violetHi ? PAL.bone : col; s.o2.alpha = al; s.o2.scale = 1;
      ctx.save(); ctx.globalAlpha = al * 0.7; ctx.fillStyle = rgba(PAL.ink, 0.8);
      const w = Math.min(fx.W - 24, 240 * u); chamfer(ctx, cx - w / 2, y - 12 * u, w, 24 * u, 6); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      drawText(ctx, s.text, cx, y, { size: 12 * u, kind: 'display', color: PAL.bone, align: 'center', baseline: 'middle', alpha: al, maxWidth: w - 16 });
      continue;
    }
    const cy = cy0 + (s.kind === 4 ? 0 : 0);
    const size = (s.kind >= 3 ? 64 : s.kind === 1 ? 54 : 44) * u;
    const bandH = size * 1.55;
    // diagonal ink band with neon edge lines
    ctx.save();
    ctx.globalAlpha = al * 0.82;
    const slide = (1 - inT) * fx.W * 0.5;
    ctx.fillStyle = rgba(PAL.ink, 0.8);
    ctx.fillRect(0, cy - bandH / 2, fx.W, bandH);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = al;
    ctx.fillStyle = col;
    ctx.fillRect(0, cy - bandH / 2, fx.W, 2); ctx.fillRect(0, cy + bandH / 2 - 2, fx.W, 2);
    ctx.globalAlpha = al * 0.25;
    ctx.fillRect(0, cy - bandH / 2 - 4, fx.W, 4); ctx.fillRect(0, cy + bandH / 2, fx.W, 4);
    ctx.restore();
    const o = s.o;
    o.size = size; o.color = PAL.bone; o.alpha = al; o.scale = 1; o.glow = 18 * u; o.glowColor = col;
    o.gradient = [PAL.bone, col === PAL.magenta ? PAL.magenta : PAL.cyan];
    o.maxWidth = fx.W - 28;
    drawText(ctx, s.text, cx + slide, cy - (s.sub ? size * 0.12 : 0), o);
    if (s.sub) drawText(ctx, s.sub, cx - slide, cy + size * 0.58, { size: 15 * u, kind: 'display', color: col, align: 'center', baseline: 'middle', alpha: al, track: 0.3 });
  }
}
function chamfer(ctx, x, y, w, h, c) {
  ctx.beginPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
}

// ------------------------------------------------------------------------------------------------ settings and stats
export function setQuality(fx, q, auto = false) { fx.quality = clamp(Math.round(fin(q, 2)), 0, 2); fx.auto = !!auto; }
export function setReducedMotion(fx, on) {
  fx.reducedMotion = !!on;
  if (on) { fx.trauma = 0; fx.chroma = 0; fx.slowT = 0; fx.timeScale = 1; fx.shake.x = fx.shake.y = fx.shake.r = 0; }
}
export function clearFx(fx) {
  fx.n = 0;
  for (const r of fx.rings) r.on = false;
  for (const b of fx.beams) b.on = false;
  for (const f of fx.floaters) f.on = false;
  for (const s of fx.bannerSlots) s.on = false;
  for (const d of fx.delays) d.on = false;
  fx.trauma = 0; fx.hitstop = 0; fx.timeScale = 1; fx.slowT = 0; fx.chroma = 0; fx.flash.alpha = 0; fx.vig.alpha = 0; fx.vig.hold = 0;
  fx.shake.x = fx.shake.y = fx.shake.r = 0;
}
export function fxStats(fx) {
  let rings = 0, beams = 0, floaters = 0;
  for (const r of fx.rings) if (r.on) rings++;
  for (const b of fx.beams) if (b.on) beams++;
  for (const f of fx.floaters) if (f.on) floaters++;
  return { particles: fx.n, rings, beams, floaters, quality: fx.quality, dropped: fx.stats.dropped, events: fx.stats.events, errors: fx.stats.errors || 0 };
}
void prism; void shade;
