// Midnight Mog cat artist: every cat, card art and rarity frame is procedural canvas 2D (no image files).
// Cats are drawn in unit space: u = size/32, feet-centre at (x,y), cats face +x (facing:-1 mirrors).
// Static layers (body, head, ears, hats, armour) are baked once per (cat, size bucket) into an offscreen
// "core" bitmap; each frame only the animated parts are drawn live: tail, legs, eyes, mouth, props, glow.
// Render code never mutates sim state and never calls Math.random (a local hash varies each cat).
import {
  PAL, RARITY, ROLE_COLOR, rgba, mix, shade, glow, prism, ramp, font, rarityColor,
} from '../palette.js';
import { CATS, CAT_BY_ID } from '../data/cats.js';
import { CARD_BY_ID } from '../data/cards.js';

const TAU = Math.PI * 2;
const INK = PAL.ink;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const outCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const inOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
const outBack = (t) => { t = clamp(t, 0, 1) - 1; return 1 + 2.70158 * t * t * t + 1.70158 * t * t; };
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const frac = (v) => v - Math.floor(v);

/** Small integer hash to 0..1 (deterministic, no Math.random). */
export function hash(n) {
  n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- canvas helpers (OffscreenCanvas, or a DOM canvas, or null in bare node) ----------
function makeCanvas(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  try { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); } catch (e) { /* fall through */ }
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
  } catch (e) { /* fall through */ }
  return null;
}
function ctxScale(ctx) {
  try {
    const m = ctx.getTransform();
    const s = Math.hypot(fin(m.a, 1), fin(m.b, 0));
    return s > 0.01 ? s : 1;
  } catch (e) { return 1; }
}

const glowCache = new Map();
function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const cv = makeCanvas(64, 64);
  if (cv) {
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.35, rgba(color, 0.45)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  glowCache.set(color, cv);
  return cv;
}
/** Additive bloom from a cached sprite (falls back to palette glow()). */
export function bloom(ctx, x, y, r, color, a = 0.6) {
  if (!(r > 0) || !(a > 0)) return;
  const s = glowSprite(color);
  if (!s) { glow(ctx, x, y, r, color, a); return; }
  const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pa * clamp(a, 0, 1);
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
}

// ---------- tiny path helpers ----------
function poly(c, pts) { c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
function ell(c, x, y, rx, ry, rot = 0) { c.moveTo(x + rx, y); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
/** fill with an ink outline stroked first (outline half-width ol outside). Path must already be built. */
function inked(c, fill, ol = 1) {
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = ol * 2; c.stroke();
  c.fillStyle = fill; c.fill();
}
function starPath(c, x, y, r, pts = 5, inner = 0.45, rot = -Math.PI / 2) {
  for (let i = 0; i < pts * 2; i++) {
    const rr = i % 2 ? r * inner : r, a = rot + (i * Math.PI) / pts;
    if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}
function heartPath(c, x, y, s) {
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.9, y - s * 1.1, x, y - s * 0.4);
  c.bezierCurveTo(x + s * 0.9, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
  c.closePath();
}
function diamond(c, x, y, r) { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); }

// ---------- fur palette (everything derived from palette.js) ----------
const ORANGE = ROLE_COLOR.brawler;
const F = {
  ginger: mix(ORANGE, PAL.ink, 0.2),
  gingerDk: mix(ORANGE, PAL.ink, 0.5),
  gingerLt: mix(ORANGE, PAL.bone, 0.4),
  cream: mix(PAL.bone, ORANGE, 0.3),
  tan: mix(ORANGE, PAL.boneDim, 0.5),
  white: mix(PAL.bone, PAL.boneDim, 0.15),
  grey: mix(PAL.slate, PAL.boneDim, 0.4),
  greyDk: mix(PAL.slate, PAL.ink, 0.35),
  scrap: mix(mix(ORANGE, PAL.slate, 0.55), PAL.ink, 0.1),
  charcoal: mix(PAL.ink3, PAL.slate, 0.3),
  black: mix(PAL.ink3, PAL.ink, 0.3),
  lilac: mix(PAL.violetHi, PAL.bone, 0.5),
  plum: mix(PAL.violet, PAL.ink, 0.25),
  steel: mix(ROLE_COLOR.tank, PAL.boneDim, 0.55),
  sage: mix(PAL.lime, PAL.slate, 0.62),
  ice: mix(PAL.cyan, PAL.bone, 0.7),
  rose: mix(PAL.magenta, PAL.bone, 0.45),
  silver: mix(PAL.bone, PAL.slate, 0.35),
  void: mix(PAL.ink, PAL.violet, 0.3),
};

// ---------- per-cat signature specs ----------
// fur/f2/f3: base, pattern, third tone. pat: tabby calico tux points spots ember galaxy void plain.
// acc: accessory names (see ACC_BACK / ACC_FRONT). hat: cone witch top bicorne nurse crownhat cap tiny.
// brow: calm grumpy fierce smug sleepy wide sly cute. mouth: cat smile frown open grin fang flat.
const SPEC = {
  scrap_tabby: { fur: F.scrap, f2: F.greyDk, pat: 'tabby', paw: 'bandage', acc: ['spikecollar', 'scar', 'tornear'], brow: 'grumpy', mouth: 'frown' },
  biscuit_bruiser: { fur: F.tan, f2: F.gingerDk, pat: 'tabby', bw: 1.28, hs: 1.05, paw: 'bandage', acc: ['biscuitband', 'spikecollar'], brow: 'fierce', mouth: 'open' },
  whisker_scout: { fur: F.grey, f2: F.greyDk, pat: 'plain', acc: ['scope', 'scarf'], brow: 'calm', mouth: 'cat', bow: 'short' },
  calico_dart: { fur: F.white, f2: F.ginger, f3: F.black, pat: 'calico', acc: ['headband', 'quiver3'], brow: 'smug', mouth: 'smile', bow: 'short' },
  spark_kit: { fur: F.cream, f2: F.gingerLt, pat: 'plain', scale: 0.92, hat: 'tiny', acc: ['boltmark', 'staticfur'], brow: 'wide', mouth: 'open' },
  fizz_mog: { fur: F.rose, f2: F.ginger, pat: 'plain', hat: 'cone', hatCol: PAL.magentaDeep, acc: ['fizzband'], brow: 'wide', mouth: 'grin' },
  nurse_purrnell: { fur: F.white, f2: F.grey, pat: 'plain', acc: ['nursecap', 'heartmark', 'bell'], brow: 'calm', mouth: 'smile' },
  bell_kitten: { fur: F.cream, f2: F.gingerLt, pat: 'plain', scale: 0.88, hs: 1.1, acc: ['bigbell', 'ribbon'], brow: 'cute', mouth: 'smile' },
  snare_stray: { fur: F.tan, f2: F.gingerDk, pat: 'tabby', acc: ['goggles', 'yarnpaws'], brow: 'sly', mouth: 'cat' },
  tack_tabby: { fur: F.ginger, f2: F.gingerDk, pat: 'tabby', acc: ['pincushion', 'goggles'], brow: 'sly', mouth: 'smile' },
  tin_can_tom: { fur: F.grey, f2: F.greyDk, pat: 'tabby', acc: ['tincan'], shield: 'lid', brow: 'grumpy', mouth: 'flat' },
  cushion_cat: { fur: F.lilac, f2: F.plum, pat: 'plain', bw: 1.1, acc: ['cushion'], shield: 'cushion', brow: 'sleepy', mouth: 'smile' },
  ember_mog: { fur: F.charcoal, f2: PAL.magenta, f3: ORANGE, pat: 'ember', paw: 'dark', acc: ['spikecollar', 'flamecrest'], brow: 'fierce', mouth: 'fang' },
  sir_purrcival: { fur: F.cream, f2: F.gingerLt, pat: 'plain', acc: ['cape', 'knighthelm'], shield: 'round', brow: 'calm', mouth: 'smile' },
  duchess_noir: { fur: F.black, f2: F.charcoal, pat: 'plain', paw: 'dark', acc: ['pearls', 'fascinator'], brow: 'smug', mouth: 'smile', bow: 'recurve' },
  storm_whisker: { fur: F.ice, f2: F.grey, pat: 'plain', hat: 'cone', hatCol: PAL.violet, acc: ['boltmark'], whisk: 'spark', brow: 'wide', mouth: 'open' },
  moonbeam_medic: { fur: F.white, f2: F.ice, pat: 'plain', bw: 1.05, acc: ['moonhood', 'moonpendant'], brow: 'calm', mouth: 'smile' },
  tripwire_tabitha: { fur: F.scrap, f2: F.greyDk, pat: 'tabby', acc: ['wirespool', 'goggles', 'belt'], brow: 'sly', mouth: 'smile' },
  rooftop_rascal: { fur: F.ginger, f2: F.white, pat: 'tux', acc: ['capback', 'bandana'], brow: 'smug', mouth: 'grin' },
  hex_hisser: { fur: F.black, f2: PAL.magenta, pat: 'plain', paw: 'dark', hat: 'witch', hatCol: PAL.plum, acc: ['hexmarks'], brow: 'fierce', mouth: 'fang' },
  gizmo_gato: { fur: F.tan, f2: F.gingerDk, pat: 'plain', acc: ['geartank', 'loupe', 'belt'], brow: 'wide', mouth: 'cat' },
  tuxedo_tempest: { fur: F.black, f2: F.white, pat: 'tux', hat: 'top', acc: ['monocle', 'bowtie', 'collarjewel'], brow: 'smug', mouth: 'smile' },
  baron_von_fluff: { fur: F.silver, f2: F.grey, pat: 'plain', scale: 1.08, bw: 1.15, hs: 1.12, acc: ['ruff', 'pickelhaube', 'medals', 'moustache'], shield: 'round', brow: 'grumpy', mouth: 'flat' },
  nyx_longshot: { fur: F.black, f2: PAL.violetHi, pat: 'galaxy', paw: 'dark', acc: ['cloak', 'hood'], brow: 'fierce', mouth: 'flat', bow: 'long' },
  captain_catnip: { fur: F.sage, f2: F.greyDk, pat: 'plain', hat: 'bicorne', acc: ['epaulets', 'leafemblem'], brow: 'smug', mouth: 'grin' },
  kaz_kung_fu: { fur: F.white, f2: F.charcoal, pat: 'points', paw: 'dark', acc: ['headband', 'gi'], brow: 'fierce', mouth: 'flat' },
  madame_mousetrap: { fur: F.plum, f2: F.lilac, pat: 'plain', acc: ['veilhat', 'trapbrooch'], brow: 'smug', mouth: 'smile' },
  lord_lunar_lynx: { fur: F.silver, f2: F.greyDk, pat: 'spots', hs: 1.05, acc: ['cloak', 'tufts', 'ruff'], crown: true, brow: 'calm', mouth: 'flat', bow: 'moon' },
  empress_whiskerwind: { fur: F.lilac, f2: F.white, pat: 'plain', hs: 1.05, hat: 'crownhat', acc: ['mane', 'longwhisk'], brow: 'smug', mouth: 'smile' },
  big_mama_maine: { fur: F.ginger, f2: F.gingerDk, pat: 'tabby', scale: 1.1, bw: 1.2, hs: 1.12, acc: ['kittens', 'ruff', 'tufts', 'scar'], crown: true, brow: 'calm', mouth: 'smile' },
  cheshire_void: { fur: F.void, f2: PAL.violetHi, pat: 'void', paw: 'dark', acc: ['voidgrin'], fade: true, brow: 'wide', mouth: 'grin' },
  mother_of_nine_lives: { fur: F.white, f2: F.ice, pat: 'plain', acc: ['robe', 'heartmark', 'halo9'], tails: 9, brow: 'calm', mouth: 'smile' },
};
const FALLBACK_SPEC = { fur: F.grey, f2: F.greyDk, pat: 'plain', acc: [], brow: 'calm', mouth: 'cat' };

const BUILD = {
  brawler: { bw: 1.18, bh: 1.0, hs: 1.0, earH: 5.2, earW: 1.15, limb: 5.4, leg: 1.0 },
  archer: { bw: 0.9, bh: 0.96, hs: 0.95, earH: 9.4, earW: 0.85, limb: 3.8, leg: 1.1 },
  mage: { bw: 0.95, bh: 1.0, hs: 0.98, earH: 7.4, earW: 1.0, limb: 4.2, leg: 1.0 },
  support: { bw: 1.12, bh: 1.1, hs: 1.12, earH: 6.4, earW: 1.1, limb: 4.8, leg: 0.9 },
  trapper: { bw: 1.08, bh: 0.86, hs: 0.98, earH: 8.4, earW: 0.95, limb: 4.2, leg: 0.85 },
  tank: { bw: 1.22, bh: 1.08, hs: 1.02, earH: 5.0, earW: 1.15, limb: 5.8, leg: 0.95 },
};
const ROLE_SCALE = { brawler: 1, archer: 1, mage: 1, support: 1, trapper: 1, tank: 1.25 };

const GEOM = new Map();
/** Geometry in unit space for a cat (cached). */
function geomFor(catId) {
  if (GEOM.has(catId)) return GEOM.get(catId);
  const cat = CAT_BY_ID[catId];
  const role = cat ? cat.role : 'brawler';
  const S = SPEC[catId] || FALLBACK_SPEC;
  const B = BUILD[role];
  const crouch = role === 'trapper';
  const g = { role, rarity: cat ? cat.rarity : 'common', S, B };
  g.scale = (S.scale || 1) * ROLE_SCALE[role];
  g.brx = 8.8 * B.bw * (S.bw || 1); g.bry = 6.3 * B.bh;
  g.bx = crouch ? -3.2 : -2; g.by = crouch ? -6.4 : -8.4;
  g.hr = 8 * B.hs * (S.hs || 1);
  g.hrx = g.hr * 1.1; g.hry = g.hr * 0.96;
  g.hx = crouch ? 7.2 : 5.4 + (S.bw ? (S.bw - 1) * 2 : 0);
  g.hy = g.by - g.bry * 0.45 - g.hr * 0.9;
  g.earH = B.earH * (S.hs || 1); g.limb = B.limb;
  g.tailX = g.bx - g.brx * 0.92; g.tailY = g.by - 1.2;
  g.legBack = g.bx - g.brx * 0.5; g.legFront = g.bx + g.brx * 0.62;
  g.top = g.hy - g.hry; // head top
  g.eyeCol = S.eyeCol || ROLE_COLOR[role];
  g.ph = hash(strHash(catId)) ;
  g.seed = strHash(catId);
  GEOM.set(catId, g);
  return g;
}

// ---------- baked core: ears, body, head, hats, armour, markings ----------
let OL = 1.2; // outline half width in units for the core currently being painted

function mkPart(path, cx, cy, rx, ry) { return { path, cx, cy, rx, ry, sz: Math.min(rx, ry) * 2 }; }
function beanPath(cx, cy, rx, ry, k) {
  return (c, ox, oy) => {
    const x = cx + ox, y = cy + oy;
    c.moveTo(x + rx, y);
    c.bezierCurveTo(x + rx, y + ry * k, x + rx * k, y + ry, x, y + ry);
    c.bezierCurveTo(x - rx * k, y + ry, x - rx, y + ry * k, x - rx, y);
    c.bezierCurveTo(x - rx, y - ry * k, x - rx * k, y - ry, x, y - ry);
    c.bezierCurveTo(x + rx * k, y - ry, x + rx, y - ry * k, x + rx, y);
    c.closePath();
  };
}
function bodyPart(g) { return mkPart(beanPath(g.bx, g.by, g.brx, g.bry, 0.62), g.bx, g.by, g.brx, g.bry); }
function headPart(g) { return mkPart(beanPath(g.hx, g.hy, g.hrx, g.hry, 0.575), g.hx, g.hy, g.hrx, g.hry); }

/** Crescent ear geometry: sharp sickle with the tip leaning outward. side -1 far/left, +1 near/right. */
export function earGeom(g, side) {
  const k = side < 0 ? 0 : 1;
  if (g.ears && g.ears[k]) return g.ears[k];
  const B = g.B;
  const P = (deg) => { const a = (deg * Math.PI / 180) * side; return [g.hx + 1.0 + Math.sin(a) * g.hrx * 0.96, g.hy - Math.cos(a) * g.hry * 0.96]; };
  const I = P(12), O = P(30 + 36 * Math.min(1.3, B.earW)), m = P(40);
  const T = [m[0] + side * (1.6 + 0.7 * B.earW), m[1] - g.earH];
  const cI = [(I[0] + T[0]) / 2 - side * 0.7, (I[1] + T[1]) / 2 + 0.6];
  const cO = [(O[0] + T[0]) / 2 + side * (1.4 + 0.5 * B.earW), (O[1] + T[1]) / 2 - 0.8];
  const e = { I, O, T, cI, cO };
  if (!g.ears) g.ears = [null, null];
  g.ears[k] = e;
  return e;
}
function earPart(g, side) {
  const e = earGeom(g, side);
  const path = (c, ox, oy) => {
    c.moveTo(e.I[0] + ox, e.I[1] + oy);
    c.quadraticCurveTo(e.cI[0] + ox, e.cI[1] + oy, e.T[0] + ox, e.T[1] + oy);
    c.quadraticCurveTo(e.cO[0] + ox, e.cO[1] + oy, e.O[0] + ox, e.O[1] + oy);
    c.lineTo(g.hx + ox, g.hy + oy); c.closePath();
  };
  const p = mkPart(path, (e.I[0] + e.O[0] + e.T[0]) / 3, (e.I[1] + e.O[1] + e.T[1]) / 3, 3.2, g.earH * 0.45);
  p.sz = 3.2;
  return p;
}

function halftone(c, part, col, sp) {
  const n = Math.ceil(Math.max(part.rx, part.ry) / sp) + 3;
  const d = sp * 0.7071;
  c.fillStyle = col; c.beginPath();
  for (let a = -n; a <= n; a++) {
    for (let b = -n; b <= n; b++) {
      const x = part.cx + (a + b) * d, y = part.cy + (a - b) * d;
      const nx = (x - part.cx) / part.rx, ny = (y - part.cy) / part.ry;
      if (nx * nx + ny * ny > 1.35) continue;
      const dk = smooth(0.1, 1.0, (nx + ny) * 0.7071);
      const r = 1.1 * dk;
      if (r < 0.2) continue;
      c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
    }
  }
  c.fill();
}

/** Outline, 3-tone fill, halftone, magenta bounce, cyan rim, hot spot (bible sections 6 to 8). */
function paintPart(c, part, base, o = {}) {
  const ol = o.ol != null ? o.ol : OL;
  c.beginPath(); part.path(c, 0, 0);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = ol * 2; c.stroke();
  c.fillStyle = base; c.fill();
  c.save();
  c.beginPath(); part.path(c, 0, 0); c.clip();
  if (o.pattern) o.pattern(c);
  const sh = clamp(part.sz * 0.3, 0.8, 2.8);
  if (o.shadow !== false) {
    c.beginPath(); part.path(c, 0, 0); part.path(c, -sh, -sh * 0.9);
    c.fillStyle = shade(base, -0.35); c.fill('evenodd');
    if (o.halftone !== false) halftone(c, part, shade(base, -0.5), 3);
    c.globalAlpha = 0.5; c.fillStyle = shade(base, 0.25);
    c.beginPath(); ell(c, part.cx - part.rx * 0.3, part.cy - part.ry * 0.38, part.rx * 0.4, part.ry * 0.28, -0.4); c.fill();
    c.globalAlpha = 1;
  }
  if (o.bounce !== false) {
    c.globalAlpha = 0.4; c.fillStyle = PAL.magenta;
    c.beginPath(); part.path(c, 0, 0); part.path(c, 0, -Math.min(1.0, sh * 0.6)); c.fill('evenodd'); c.globalAlpha = 1;
  }
  if (o.rim !== false) {
    const r = Math.min(0.85, sh * 0.5);
    c.globalAlpha = 0.85; c.fillStyle = PAL.cyan;
    c.beginPath(); part.path(c, 0, 0); part.path(c, r, r); c.fill('evenodd'); c.globalAlpha = 1;
    if (o.hot) {
      c.fillStyle = PAL.bone; c.globalAlpha = 0.9; c.beginPath();
      ell(c, part.cx - part.rx * 0.55, part.cy - part.ry * 0.7, 1.0, 0.6, -0.6); c.fill(); c.globalAlpha = 1;
    }
  }
  c.restore();
}

function pawCol(S) {
  if (S.paw === 'dark') return shade(S.fur, -0.12);
  if (S.paw === 'bandage') return F.white;
  if (S.pat === 'tux' || S.pat === 'calico') return F.white;
  return mix(S.fur, PAL.bone, 0.5);
}

// ----- fur patterns, painted inside the clip of body or head -----
function patBody(c, g, S) {
  const { bx, by, brx, bry } = g;
  c.lineCap = 'round';
  if (S.pat === 'tabby') {
    c.strokeStyle = S.f2; c.lineWidth = 1.6; c.globalAlpha = 0.85;
    for (let i = 0; i < 4; i++) {
      const x = bx - brx * 0.62 + i * brx * 0.42;
      c.beginPath(); c.moveTo(x, by - bry * 1.1); c.quadraticCurveTo(x + 1.8, by - bry * 0.3, x + 0.4, by + bry * 0.2); c.stroke();
    }
    c.globalAlpha = 1;
  } else if (S.pat === 'calico') {
    c.fillStyle = S.f2; c.beginPath(); ell(c, bx - 3, by - 2.6, 4.6, 3.6, 0.3); c.fill();
    c.fillStyle = S.f3; c.beginPath(); ell(c, bx + 3.6, by + 1.6, 3.4, 2.8, -0.2); c.fill();
    c.fillStyle = S.f2; c.beginPath(); ell(c, bx - 7, by + 2.6, 2.8, 2.4); c.fill();
  } else if (S.pat === 'tux') {
    c.fillStyle = S.f2; c.beginPath(); ell(c, bx + brx * 0.66, by + bry * 0.1, brx * 0.38, bry * 0.85); c.fill();
    c.beginPath(); ell(c, bx + 1, by + bry * 0.95, brx * 0.55, bry * 0.34); c.fill();
  } else if (S.pat === 'spots') {
    c.fillStyle = S.f2; c.globalAlpha = 0.6;
    for (let i = 0; i < 11; i++) {
      const x = bx + (hash(g.seed + i * 7) * 2 - 1) * brx * 0.9, y = by + (hash(g.seed + i * 13 + 5) * 2 - 1) * bry * 0.8;
      c.beginPath(); ell(c, x, y, 0.9 + hash(g.seed + i) * 0.7, 0.8 + hash(g.seed + i + 40) * 0.5, hash(i) * 3); c.fill();
    }
    c.globalAlpha = 1;
  } else if (S.pat === 'ember') {
    glowCracks(c, [[bx - 6, by - bry, bx - 4, by - 2, bx - 6, by + 1, bx - 3.5, by + bry], [bx + 1, by - bry, bx + 3, by - 3, bx + 1, by, bx + 4, by + 3], [bx + brx * 0.7, by - 2, bx + brx * 0.45, by + 1.5, bx + brx * 0.7, by + 4]], S);
  } else if (S.pat === 'galaxy' || S.pat === 'void') {
    c.fillStyle = S.pat === 'void' ? shade(S.f2, -0.55) : PAL.violet; c.globalAlpha = 0.5;
    c.beginPath(); ell(c, bx - 1, by - 1, brx * 0.8, bry * 0.7, 0.2); c.fill(); c.globalAlpha = 1;
    stars(c, g, bx, by, brx, bry, 12, 11);
  }
}
function patHead(c, g, S) {
  const { hx, hy, hrx, hry } = g;
  const cx = hx + 1.2;
  c.lineCap = 'round';
  if (S.pat === 'tabby') {
    c.strokeStyle = S.f2; c.lineWidth = 1.5; c.globalAlpha = 0.9;
    for (let i = -1; i <= 1; i++) {
      c.beginPath(); c.moveTo(cx + i * 2.6, hy - hry * 1.05); c.lineTo(cx + i * 2.4, hy - hry * (i === 0 ? 0.3 : 0.5)); c.stroke();
    }
    for (let s = -1; s <= 1; s += 2) for (let j = 0; j < 2; j++) {
      c.beginPath(); c.moveTo(cx + s * hrx * 1.05, hy + hry * (0.1 + j * 0.3)); c.lineTo(cx + s * (hrx * 0.62), hy + hry * (0.18 + j * 0.3)); c.stroke();
    }
    c.globalAlpha = 1;
  } else if (S.pat === 'calico') {
    c.fillStyle = S.f2; c.beginPath(); ell(c, hx - 4.2, hy - 3.4, 4.8, 4.2, 0.4); c.fill();
    c.fillStyle = S.f3; c.beginPath(); ell(c, hx + 6, hy - 4.6, 3, 2.6); c.fill();
  } else if (S.pat === 'tux') {
    c.fillStyle = S.f2; c.beginPath(); ell(c, cx, hy + hry * 0.5, hrx * 0.52, hry * 0.44); c.fill();
    c.beginPath(); ell(c, cx, hy - hry * 0.05, 1.5, hry * 0.75); c.fill();
  } else if (S.pat === 'points') {
    c.fillStyle = S.f2; c.globalAlpha = 0.92;
    c.beginPath(); ell(c, cx, hy + hry * 0.38, hrx * 0.66, hry * 0.7); c.fill(); c.globalAlpha = 1;
  } else if (S.pat === 'spots') {
    c.fillStyle = S.f2; c.globalAlpha = 0.65;
    for (let i = 0; i < 6; i++) { c.beginPath(); ell(c, cx + (hash(g.seed + i * 3) * 2 - 1) * hrx * 0.8, hy - hry * 0.55 + hash(g.seed + i * 5) * hry * 0.6, 0.8, 0.7); c.fill(); }
    c.strokeStyle = S.f2; c.lineWidth = 1.1;
    for (let s = -1; s <= 1; s += 2) { c.beginPath(); c.moveTo(cx + s * hrx * 1.0, hy + hry * 0.15); c.lineTo(cx + s * hrx * 0.55, hy + hry * 0.3); c.stroke(); }
    c.globalAlpha = 1;
  } else if (S.pat === 'ember') {
    glowCracks(c, [[hx - 3, hy - hry, hx - 1.5, hy - hry * 0.5, hx - 3.2, hy - hry * 0.2], [hx + 5, hy - hry, hx + 4, hy - hry * 0.6, hx + 6, hy - hry * 0.3]], S);
  } else if (S.pat === 'galaxy' || S.pat === 'void') {
    stars(c, g, hx, hy, hrx, hry, 7, 29);
  }
}
function glowCracks(c, lines, S) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    c.strokeStyle = pass ? S.f3 : rgba(S.f2, 0.45); c.lineWidth = pass ? 0.8 : 2.4;
    for (const l of lines) { c.beginPath(); c.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) c.lineTo(l[i], l[i + 1]); c.stroke(); }
  }
}
function stars(c, g, x, y, rx, ry, n, salt) {
  for (let i = 0; i < n; i++) {
    const sx = x + (hash(g.seed + i * 11 + salt) * 2 - 1) * rx * 0.85, sy = y + (hash(g.seed + i * 17 + salt) * 2 - 1) * ry * 0.85;
    const big = hash(g.seed + i * 3 + salt) > 0.7;
    c.fillStyle = big ? PAL.bone : (i % 3 ? PAL.violetHi : PAL.cyan);
    c.beginPath();
    if (big) { starPath(c, sx, sy, 1.15, 4, 0.3); } else { ell(c, sx, sy, 0.5, 0.5); }
    c.fill();
  }
}

// ----- accessories (static, baked). c is the core context in unit space. -----
const ROLEC = (g) => ROLE_COLOR[g.role];
function bandAcross(c, g, y, h, col, tilt = 0) {
  // headband across the head at height y (relative to hy)
  const p = mkPart((cc, ox, oy) => {
    cc.moveTo(g.hx - g.hrx * 0.98 + ox, g.hy + y + oy + tilt); cc.lineTo(g.hx + g.hrx * 1.02 + ox, g.hy + y + oy - tilt);
    cc.lineTo(g.hx + g.hrx * 1.02 + ox, g.hy + y + h + oy - tilt); cc.lineTo(g.hx - g.hrx * 0.98 + ox, g.hy + y + h + oy + tilt); cc.closePath();
  }, g.hx, g.hy + y + h / 2, g.hrx, h / 2);
  c.save(); c.beginPath(); headPart(g).path(c, 0, 0); c.clip();
  paintPart(c, p, col, { ol: OL * 0.8, halftone: false });
  c.restore();
}
function coneHat(c, g, col, H, bend, brim, band) {
  const cx = g.hx + 0.8, y0 = g.top + 1.4;
  const brimP = mkPart((cc, ox, oy) => ell(cc, cx + ox, y0 + 0.6 + oy, brim, brim * 0.27, -0.06), cx, y0 + 0.6, brim, brim * 0.27);
  paintPart(c, brimP, shade(col, -0.2), { halftone: false });
  const hw = brim * 0.62;
  const cone = mkPart((cc, ox, oy) => {
    cc.moveTo(cx - hw + ox, y0 + 0.4 + oy);
    cc.quadraticCurveTo(cx - hw * 0.5 + bend * 0.15 + ox, y0 - H * 0.55 + oy, cx + bend + ox, y0 - H + oy);
    cc.quadraticCurveTo(cx + hw * 0.55 + bend * 0.4 + ox, y0 - H * 0.45 + oy, cx + hw + ox, y0 + 0.4 + oy);
    cc.closePath();
  }, cx + bend * 0.3, y0 - H * 0.45, hw, H * 0.5);
  paintPart(c, cone, col, { hot: true });
  if (band) {
    c.save(); c.beginPath(); cone.path(c, 0, 0); c.clip();
    c.fillStyle = band; c.fillRect(cx - hw - 1, y0 - 2.4, hw * 2 + 2, 2.2);
    c.restore();
  }
  return { cx, y0, H, bend };
}
function pointStar(c, x, y, r, col) { c.beginPath(); starPath(c, x, y, r, 4, 0.35); c.fillStyle = col; c.fill(); }

function domeHelm(c, g, col, w, h, plume) {
  // dome over the crown between the ears
  const cx = g.hx + 1, y0 = g.top + 2.2;
  const p = mkPart((cc, ox, oy) => {
    cc.moveTo(cx - w + ox, y0 + 2 + oy);
    cc.bezierCurveTo(cx - w + ox, y0 - h * 1.3 + oy, cx + w + ox, y0 - h * 1.3 + oy, cx + w + ox, y0 + 2 + oy);
    cc.closePath();
  }, cx, y0 - h * 0.35, w, h * 0.7);
  paintPart(c, p, col, { hot: true });
  return { cx, y0 };
}

function neckBand(c, g, col, th = 2.2, dip = 2.6) {
  const x = g.hx + 0.8, y = g.hy + g.hry * 0.84, w = g.hrx * 0.8;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y + dip * 2, x + w, y);
  c.strokeStyle = INK; c.lineWidth = th + OL * 1.4; c.stroke();
  c.strokeStyle = col; c.lineWidth = th; c.stroke();
  c.strokeStyle = rgba(PAL.bone, 0.28); c.lineWidth = 0.5;
  c.beginPath(); c.moveTo(x - w, y - th * 0.3); c.quadraticCurveTo(x, y + dip * 2 - th * 0.3, x + w, y - th * 0.3); c.stroke();
  return { x, y, w, dip };
}
const ACC_BACK = {
  cape(c, g, S, col) {
    const x0 = g.bx + g.brx * 0.35, y0 = g.by - g.bry * 0.95;
    const p = mkPart((cc, ox, oy) => {
      cc.moveTo(x0 + ox, y0 + oy);
      cc.quadraticCurveTo(g.bx - g.brx * 1.3 + ox, g.by - g.bry * 0.9 + oy, g.bx - g.brx * 1.5 + ox, g.by + g.bry * 0.9 + oy);
      cc.lineTo(g.bx - g.brx * 0.1 + ox, g.by + g.bry * 0.8 + oy); cc.closePath();
    }, g.bx - g.brx * 0.5, g.by, g.brx * 0.8, g.bry);
    paintPart(c, p, col || mix(ROLE_COLOR.tank, PAL.ink, 0.45), { rim: true });
  },
  quiver3(c, g) {
    c.save(); c.translate(g.bx - 2, g.by - g.bry * 0.7); c.rotate(-0.45);
    for (let i = -1; i <= 1; i++) {
      c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath(); c.moveTo(i * 1.8, 0); c.lineTo(i * 2.6, -9.5); c.stroke();
      c.strokeStyle = PAL.boneDim; c.lineWidth = 0.8; c.beginPath(); c.moveTo(i * 1.8, 0); c.lineTo(i * 2.6, -9.5); c.stroke();
      c.fillStyle = i === 0 ? PAL.magenta : PAL.cyan; c.beginPath(); poly(c, [i * 2.6 - 1.2, -9.6, i * 2.6 + 1.2, -9.6, i * 2.6, -12]); c.fill();
    }
    const q = mkPart((cc, ox, oy) => { cc.moveTo(-3.6 + ox, oy); cc.lineTo(3.6 + ox, oy); cc.lineTo(2.8 + ox, 9 + oy); cc.lineTo(-2.8 + ox, 9 + oy); cc.closePath(); }, 0, 4.5, 3.2, 4.5);
    paintPart(c, q, mix(F.ginger, PAL.ink, 0.45), { halftone: false, rim: false });
    c.restore();
  },
  pincushion(c, g) {
    const x = g.bx - 1, y = g.by - g.bry - 0.6;
    const p = mkPart(beanPath(x, y, 5.6, 3.4, 0.62), x, y, 5.6, 3.4);
    paintPart(c, p, PAL.magentaDeep, { halftone: false });
    for (let i = 0; i < 6; i++) {
      const px = x - 4 + i * 1.65, py = y - 1.5 - (i % 2) * 0.8;
      c.strokeStyle = PAL.boneDim; c.lineWidth = 0.55; c.beginPath(); c.moveTo(px, py + 2); c.lineTo(px + (i - 3) * 0.5, py - 3.4); c.stroke();
      c.fillStyle = i % 3 === 0 ? PAL.cyan : PAL.bone; c.beginPath(); ell(c, px + (i - 3) * 0.5, py - 3.6, 0.95, 0.95); c.fill();
    }
  },
  kittens(c, g) {
    const cols = [F.cream, F.charcoal, F.gingerLt];
    for (let i = 0; i < 3; i++) {
      const x = g.bx - 13.5 + i * 3.9, y = g.by - g.bry * 0.55 - (i === 1 ? 2.2 : 0.4) - i * 0.6;
      const head = mkPart(beanPath(x, y, 3.2, 2.9, 0.575), x, y, 3.2, 2.9);
      for (let s = -1; s <= 1; s += 2) {
        const ear = mkPart((cc, ox, oy) => { cc.moveTo(x + s * 0.6 + ox, y - 1.8 + oy); cc.lineTo(x + s * 1.6 + ox, y - 4.6 + oy); cc.lineTo(x + s * 2.9 + ox, y - 1.2 + oy); cc.closePath(); }, x + s * 1.8, y - 2.5, 1.2, 1.4);
        paintPart(c, ear, cols[i], { halftone: false, bounce: false, ol: OL * 0.8 });
      }
      paintPart(c, head, cols[i], { halftone: false, ol: OL * 0.8 });
      c.fillStyle = [PAL.lime, PAL.cyan, PAL.magenta][i];
      c.beginPath(); ell(c, x - 1.0, y + 0.1, 0.55, 0.7); ell(c, x + 1.1, y + 0.1, 0.55, 0.7); c.fill();
    }
  },
  geartank(c, g) {
    const x = g.bx - 1, y = g.by - g.bry - 0.2, r = 5.2;
    c.save(); c.translate(x, y);
    c.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rr = i % 2 ? r * 0.86 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); inked(c, mix(F.gingerDk, PAL.slate, 0.4), OL * 0.8);
    c.beginPath(); ell(c, 0, 0, r * 0.5, r * 0.5); c.fillStyle = PAL.ink2; c.fill();
    c.beginPath(); ell(c, 0, 0, r * 0.22, r * 0.22); c.fillStyle = PAL.cyan; c.fill();
    c.restore();
  },
  mane(c, g, S) {
    const p = mkPart((cc, ox, oy) => {
      cc.moveTo(g.hx - g.hrx * 0.9 + ox, g.hy - g.hry * 0.2 + oy);
      cc.quadraticCurveTo(g.hx - g.hrx * 1.9 + ox, g.hy + g.hry * 0.9 + oy, g.bx - g.brx * 1.5 + ox, g.by + g.bry + oy);
      cc.quadraticCurveTo(g.bx - g.brx * 0.3 + ox, g.by + g.bry * 1.0 + oy, g.hx + g.hrx * 0.2 + ox, g.hy + g.hry * 1.1 + oy);
      cc.closePath();
    }, g.hx - g.hrx * 0.6, g.hy + g.hry * 0.8, g.hrx * 1.1, g.hry * 1.0);
    paintPart(c, p, S.f2, { rim: true });
  },
  robe(c, g) {
    const p = mkPart((cc, ox, oy) => {
      cc.moveTo(g.bx + g.brx * 0.5 + ox, g.by - g.bry * 0.8 + oy);
      cc.quadraticCurveTo(g.bx - g.brx * 1.6 + ox, g.by - g.bry + oy, g.bx - g.brx * 1.5 + ox, g.by + g.bry * 1.0 + oy);
      cc.lineTo(g.bx + g.brx * 0.9 + ox, g.by + g.bry * 1.0 + oy); cc.closePath();
    }, g.bx - g.brx * 0.3, g.by, g.brx * 1.1, g.bry);
    paintPart(c, p, mix(PAL.bone, PAL.cyan, 0.3), { rim: true });
    c.save(); c.beginPath(); p.path(c, 0, 0); c.clip();
    c.strokeStyle = PAL.violetHi; c.lineWidth = 1; c.globalAlpha = 0.8;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(g.bx - g.brx * 1.5, g.by + g.bry * (0.2 + i * 0.22)); c.lineTo(g.bx + g.brx * 0.9, g.by + g.bry * (0.2 + i * 0.22)); c.stroke(); }
    c.restore();
  },
  cushion(c, g) {
    const x = g.bx - 2.4, y = g.by - g.bry * 0.8, w = 6.4, h = 5.6;
    const p = mkPart((cc, ox, oy) => {
      cc.moveTo(x - w + ox, y - h + oy); cc.quadraticCurveTo(x + ox, y - h * 1.35 + oy, x + w + ox, y - h + oy);
      cc.quadraticCurveTo(x + w * 1.2 + ox, y + oy, x + w + ox, y + h + oy);
      cc.quadraticCurveTo(x + ox, y + h * 1.3 + oy, x - w + ox, y + h + oy);
      cc.quadraticCurveTo(x - w * 1.2 + ox, y + oy, x - w + ox, y - h + oy); cc.closePath();
    }, x, y, w, h);
    c.save(); c.translate(0, 0); c.rotate(0);
    paintPart(c, p, mix(PAL.magenta, PAL.violet, 0.55), { rim: true });
    c.fillStyle = PAL.bone; c.beginPath(); ell(c, x, y, 1.0, 1.0); c.fill();
    c.strokeStyle = shade(PAL.magentaDeep, -0.2); c.lineWidth = 0.6;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * w * 0.8, y + Math.sin(a) * h * 0.8); c.stroke(); }
    c.restore();
  },
  ruff(c, g, S) {
    const x = g.hx + 0.8, y = g.hy + g.hry * 0.1, n = 12;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU, a2 = ((i + 1) / n) * TAU;
      const rx = g.hrx * 1.0, ry = g.hry * 1.0, R = 1.36, r2 = 1.04;
      if (i === 0) c.moveTo(x + Math.cos(a0) * rx * r2, y + Math.sin(a0) * ry * r2);
      c.lineTo(x + Math.cos(a1) * rx * R, y + Math.sin(a1) * ry * R);
      c.lineTo(x + Math.cos(a2) * rx * r2, y + Math.sin(a2) * ry * r2);
    }
    c.closePath(); inked(c, shade(S.fur, 0.14), OL * 0.9);
    c.save(); c.clip(); c.strokeStyle = rgba(shade(S.fur, -0.4), 0.5); c.lineWidth = 0.6;
    for (let i = 0; i < n; i++) { const a = ((i + 0.5) / n) * TAU; c.beginPath(); c.moveTo(x + Math.cos(a) * g.hrx * 1.0, y + Math.sin(a) * g.hry); c.lineTo(x + Math.cos(a) * g.hrx * 1.22, y + Math.sin(a) * g.hry * 1.22); c.stroke(); }
    c.restore();
  },
  hood(c, g) {
    const p = mkPart(beanPath(g.hx - 0.6, g.hy + 0.6, g.hrx * 1.22, g.hry * 1.24, 0.6), g.hx - 0.6, g.hy + 0.6, g.hrx * 1.22, g.hry * 1.24);
    paintPart(c, p, mix(PAL.violet, PAL.ink, 0.5), { rim: true });
  },
  moonhood(c, g) {
    const p = mkPart(beanPath(g.hx - 0.4, g.hy + 0.8, g.hrx * 1.22, g.hry * 1.28, 0.6), g.hx - 0.4, g.hy + 0.8, g.hrx * 1.22, g.hry * 1.28);
    paintPart(c, p, mix(PAL.cyanDeep, PAL.ink, 0.35), { rim: true });
  },
};
ACC_BACK.cloak = (c, g, S) => ACC_BACK.cape(c, g, S, g.S === SPEC.lord_lunar_lynx ? mix(PAL.cyanDeep, PAL.ink, 0.45) : mix(PAL.violet, PAL.ink, 0.35));

const ACC_FRONT = {
  spikecollar(c, g) {
    const nb = neckBand(c, g, PAL.ink3, 2.4, 2.4);
    for (let i = -2; i <= 2; i++) {
      const tt = i * 0.38, sx = nb.x + tt * nb.w, sy = nb.y + nb.dip * (1 - tt * tt) + 0.9;
      c.beginPath(); poly(c, [sx - 0.9, sy - 0.2, sx + tt * 0.9, sy + 2.6, sx + 0.9, sy - 0.2]); inked(c, PAL.boneDim, OL * 0.4);
    }
  },
  scar(c, g) {
    const ex = g.hx + 1.3 - g.hrx * 0.42, ey = g.hy + g.hry * 0.1;
    c.strokeStyle = PAL.magenta; c.lineWidth = 0.9; c.lineCap = 'round'; c.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(ex - 2.4 + i * 1.7, ey - 4.4); c.lineTo(ex - 0.6 + i * 1.7, ey + 4.6); c.stroke(); }
    c.globalAlpha = 1;
  },
  tornear(c, g) {
    const e = earGeom(g, 1);
    const mx = (e.cO[0] + e.T[0]) / 2 + 0.2, my = (e.cO[1] + e.T[1]) / 2;
    c.save(); c.globalCompositeOperation = 'destination-out';
    c.beginPath(); poly(c, [mx - 0.4, my - 1.6, mx + 2.4, my + 0.2, mx - 0.4, my + 1.8]); c.fill(); c.restore();
  },
  biscuitband(c, g) {
    bandAcross(c, g, -g.hry * 0.62, 2.8, PAL.magentaDeep, 0.4);
    const x = g.hx + 1.2, y = g.hy - g.hry * 0.62 + 1.4;
    c.beginPath(); ell(c, x, y, 2.6, 2.6); inked(c, F.tan, OL * 0.6);
    c.fillStyle = F.gingerDk; for (let i = 0; i < 4; i++) { c.beginPath(); ell(c, x + Math.cos(i * 1.7) * 1.2, y + Math.sin(i * 1.7) * 1.2, 0.35, 0.35); c.fill(); }
  },
  scope(c, g) {
    const x = g.hx + 1.3 + g.hrx * 0.42, y = g.hy + g.hry * 0.1;
    c.strokeStyle = INK; c.lineWidth = 1.3; c.beginPath(); c.moveTo(g.hx - g.hrx, y - 1.5); c.lineTo(x - 3.4, y); c.stroke();
    c.beginPath(); ell(c, x, y, 3.8, 3.8); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
    c.lineWidth = 1.1; c.strokeStyle = PAL.boneDim; c.stroke();
    c.fillStyle = rgba(PAL.cyan, 0.18); c.fill();
  },
  scarf(c, g) {
    const nb = neckBand(c, g, PAL.cyanDeep, 3.2, 2.6);
    c.beginPath(); poly(c, [nb.x - nb.w * 0.5, nb.y + 3.1, nb.x - nb.w * 0.5 - 2.2, nb.y + 6.4, nb.x - nb.w * 0.5 + 1.6, nb.y + 6]); inked(c, PAL.cyanDeep, OL * 0.6);
  },
  headband(c, g) {
    bandAcross(c, g, -g.hry * 0.55, 2.6, PAL.magenta, 0.5);
    const kx = g.hx - g.hrx * 0.98, ky = g.hy - g.hry * 0.55 + 1.5;
    c.beginPath(); poly(c, [kx, ky, kx - 4.5, ky - 1.2, kx - 4, ky + 0.8]); inked(c, PAL.magenta, OL * 0.6);
    c.beginPath(); poly(c, [kx, ky, kx - 4.2, ky + 2.6, kx - 2.4, ky + 3.4]); inked(c, shade(PAL.magenta, -0.2), OL * 0.6);
  },
  boltmark(c, g) {
    const x = g.hx + 1.2, y = g.hy - g.hry * 0.38;
    c.beginPath(); poly(c, [x + 0.8, y - 3, x - 1.6, y + 0.2, x - 0.1, y + 0.2, x - 0.9, y + 3, x + 1.7, y - 0.4, x + 0.2, y - 0.4]);
    inked(c, PAL.cyan, OL * 0.45);
  },
  staticfur(c, g, S) {
    for (let i = 0; i < 7; i++) {
      const a = -2.4 + i * 0.5 + (i > 3 ? 0.2 : 0);
      const px = g.hx + 1 + Math.cos(a) * g.hrx * 0.92, py = g.hy + Math.sin(a) * g.hry * 0.92;
      const l = 3.4 + hash(g.seed + i) * 2;
      c.beginPath(); poly(c, [px - Math.sin(a) * 1.3, py + Math.cos(a) * 1.3, px + Math.cos(a) * l, py + Math.sin(a) * l, px + Math.sin(a) * 1.3, py - Math.cos(a) * 1.3]);
      inked(c, S.f2, OL * 0.6);
    }
  },
  fizzband(c, g) {
    const cx = g.hx + 0.8, y = g.top - 0.6;
    for (let i = 0; i < 5; i++) {
      c.beginPath(); ell(c, cx - 3.4 + i * 1.7, y - (i % 2) * 1.2, 0.8, 0.8); c.fillStyle = rgba(PAL.bone, 0.85); c.fill();
    }
  },
  nursecap(c, g) {
    const cx = g.hx + 1, y0 = g.top + 2.4;
    const p = mkPart((cc, ox, oy) => {
      cc.moveTo(cx - 5.6 + ox, y0 + 1.5 + oy); cc.lineTo(cx - 4.6 + ox, y0 - 5 + oy); cc.quadraticCurveTo(cx + ox, y0 - 6.4 + oy, cx + 4.6 + ox, y0 - 5 + oy);
      cc.lineTo(cx + 5.6 + ox, y0 + 1.5 + oy); cc.closePath();
    }, cx, y0 - 2, 5.6, 3.8);
    paintPart(c, p, PAL.bone, { rim: true });
    c.fillStyle = PAL.lime; c.fillRect(cx - 0.6, y0 - 4.8, 1.2, 4.2); c.fillRect(cx - 2.1, y0 - 3.3, 4.2, 1.2);
  },
  heartmark(c, g) {
    const x = g.bx + g.brx * 0.5, y = g.by + 0.4;
    c.beginPath(); heartPath(c, x, y, 2.5); inked(c, PAL.lime, OL * 0.5);
    c.fillStyle = rgba(PAL.bone, 0.8); c.beginPath(); ell(c, x - 0.8, y - 0.7, 0.5, 0.4); c.fill();
  },
  bell(c, g) { ACC_FRONT.bigbell(c, g, null, 0.7); },
  bigbell(c, g, _S, s = 1) {
    const nb = neckBand(c, g, PAL.magenta, 2.2, 2.6);
    const bx = nb.x, by = nb.y + nb.dip + 2.2 * s;
    c.beginPath(); c.moveTo(bx - 2.5 * s, by + 2 * s); c.quadraticCurveTo(bx - 2.6 * s, by - 3 * s, bx, by - 3 * s); c.quadraticCurveTo(bx + 2.6 * s, by - 3 * s, bx + 2.5 * s, by + 2 * s); c.closePath();
    inked(c, PAL.bone, OL * 0.6);
    c.fillStyle = PAL.boneDim; c.fillRect(bx - 2.5 * s, by + 1.2 * s, 5 * s, 0.8 * s);
    c.beginPath(); ell(c, bx, by + 2.4 * s, 0.7 * s, 0.7 * s); c.fillStyle = PAL.ink; c.fill();
  },
  ribbon(c, g) {
    const x = g.hx - g.hrx * 0.5, y = g.top + 3.2;
    c.beginPath(); poly(c, [x, y, x - 4, y - 2.4, x - 4, y + 2.4]); inked(c, PAL.magenta, OL * 0.6);
    c.beginPath(); poly(c, [x, y, x + 4, y - 2.4, x + 4, y + 2.4]); inked(c, PAL.magenta, OL * 0.6);
    c.beginPath(); ell(c, x, y, 1.3, 1.3); inked(c, shade(PAL.magenta, 0.3), OL * 0.4);
  },
  goggles(c, g) {
    const y = g.hy - g.hry * 0.62;
    bandAcross(c, g, -g.hry * 0.78, 2.2, PAL.ink3, 0);
    for (let s = -1; s <= 1; s += 2) {
      const x = g.hx + 1.2 + s * 3.4;
      c.beginPath(); ell(c, x, y, 2.9, 2.9); inked(c, PAL.slate, OL * 0.7);
      c.beginPath(); ell(c, x, y, 1.9, 1.9); c.fillStyle = mix(PAL.cyan, PAL.ink, 0.35); c.fill();
      c.fillStyle = rgba(PAL.bone, 0.85); c.beginPath(); ell(c, x - 0.6, y - 0.7, 0.55, 0.45); c.fill();
    }
  },
  yarnpaws(c, g) {
    const x = g.bx + g.brx * 0.8, y = g.by + g.bry * 0.55;
    c.beginPath(); ell(c, x, y, 3.2, 3.2); inked(c, PAL.magenta, OL * 0.6);
    c.strokeStyle = shade(PAL.magenta, -0.4); c.lineWidth = 0.55;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x, y, 2.6, i * 1.1, i * 1.1 + 1.7); c.stroke(); }
    c.strokeStyle = PAL.magenta; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x - 3, y + 1); c.quadraticCurveTo(x - 6, y + 4, x - 9, y + 2.4); c.stroke();
  },
  tincan(c, g) {
    const cx = g.hx + 1, y0 = g.top + 3.2, w = g.hrx * 0.62, h = 8.4;
    const p = mkPart((cc, ox, oy) => { cc.moveTo(cx - w + ox, y0 + oy); cc.lineTo(cx - w + ox, y0 - h + oy); cc.lineTo(cx + w + ox, y0 - h + oy); cc.lineTo(cx + w + ox, y0 + oy); cc.closePath(); }, cx, y0 - h / 2, w, h / 2);
    paintPart(c, p, F.steel, { hot: true });
    c.save(); c.beginPath(); p.path(c, 0, 0); c.clip();
    c.fillStyle = PAL.magenta; c.fillRect(cx - w, y0 - h * 0.62, w * 2, 2.4);
    c.fillStyle = rgba(PAL.bone, 0.85); c.fillRect(cx - w, y0 - h, w * 2, 1.1);
    c.fillStyle = rgba(PAL.ink, 0.35); for (let i = 0; i < 3; i++) c.fillRect(cx - w + 1 + i * 1.8, y0 - h + 1.2, 0.6, h - 1.4);
    c.restore();
    const bp = mkPart((cc, ox, oy) => { cc.moveTo(g.hx - g.hrx * 0.98 + ox, g.hy - g.hry * 0.4 + oy); cc.lineTo(g.hx + g.hrx * 1.02 + ox, g.hy - g.hry * 0.4 + oy); cc.lineTo(g.hx + g.hrx * 1.02 + ox, g.hy - g.hry * 0.18 + oy); cc.lineTo(g.hx - g.hrx * 0.98 + ox, g.hy - g.hry * 0.18 + oy); cc.closePath(); }, g.hx, g.hy - g.hry * 0.3, g.hrx, 1.5);
    c.save(); c.beginPath(); headPart(g).path(c, 0, 0); c.clip(); paintPart(c, bp, F.steel, { ol: OL * 0.8, halftone: false }); c.restore();
  },
  knighthelm(c, g) {
    const h = domeHelm(c, g, F.steel, g.hrx * 0.64, 8.6);
    c.fillStyle = INK; c.fillRect(h.cx - g.hrx * 0.5, h.y0 - 1.6, g.hrx, 1.4);
    bandAcross(c, g, -g.hry * 0.5, 2.4, F.steel, 0);
    // plume
    c.beginPath(); c.moveTo(h.cx, h.y0 - 8.2); c.bezierCurveTo(h.cx - 3, h.y0 - 14, h.cx - 9, h.y0 - 10, h.cx - 11, h.y0 - 4);
    c.bezierCurveTo(h.cx - 7, h.y0 - 8, h.cx - 3, h.y0 - 7, h.cx + 0.4, h.y0 - 5.6); c.closePath(); inked(c, PAL.magenta, OL * 0.7);
  },
  pickelhaube(c, g) {
    const h = domeHelm(c, g, F.steel, g.hrx * 0.66, 8.8);
    c.beginPath(); poly(c, [h.cx - 1, h.y0 - 8.4, h.cx, h.y0 - 14, h.cx + 1, h.y0 - 8.4]); inked(c, PAL.bone, OL * 0.6);
    bandAcross(c, g, -g.hry * 0.5, 2.6, F.steel, 0);
    c.fillStyle = PAL.cyan; c.beginPath(); starPath(c, h.cx, h.y0 - 4.2, 1.7, 4, 0.4); c.fill();
  },
  medals(c, g) {
    const x = g.bx + g.brx * 0.45, y = g.by + 1.6;
    const cols = [PAL.cyan, PAL.magenta, PAL.bone];
    for (let i = 0; i < 3; i++) {
      c.beginPath(); ell(c, x - 3 + i * 2.8, y + (i % 2) * 0.6, 1.2, 1.2); inked(c, cols[i], OL * 0.4);
    }
  },
  moustache(c, g) {
    const x = g.hx + 1.2, y = g.hy + g.hry * 0.5;
    c.strokeStyle = INK; c.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      c.lineWidth = 2.6; c.beginPath(); c.moveTo(x + s * 0.4, y); c.quadraticCurveTo(x + s * 4, y + 1.6, x + s * 5.6, y - 1.6); c.stroke();
      c.lineWidth = 1.2; c.strokeStyle = PAL.bone; c.beginPath(); c.moveTo(x + s * 0.4, y); c.quadraticCurveTo(x + s * 4, y + 1.6, x + s * 5.6, y - 1.6); c.stroke(); c.strokeStyle = INK;
    }
  },
  fascinator(c, g) {
    const x = g.hx + g.hrx * 0.1, y = g.top + 2.6;
    const p = mkPart((cc, ox, oy) => ell(cc, x + ox, y + oy, 5.4, 2.1, -0.28), x, y, 5.4, 2.1);
    paintPart(c, p, PAL.ink3, { halftone: false });
    c.beginPath(); c.moveTo(x + 3.5, y - 1.4); c.bezierCurveTo(x + 8, y - 10, x + 14, y - 4, x + 9, y + 2.6); c.bezierCurveTo(x + 10, y - 3, x + 6, y - 5, x + 3.5, y - 0.4); c.closePath();
    inked(c, PAL.magenta, OL * 0.6);
    c.strokeStyle = rgba(PAL.bone, 0.7); c.lineWidth = 0.5; c.beginPath(); c.moveTo(x + 3.8, y - 1); c.quadraticCurveTo(x + 9, y - 6, x + 8, y + 1); c.stroke();
  },
  pearls(c, g) {
    const y = g.hy + g.hry * 0.9, x = g.hx + 0.4;
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI;
      const px = x - Math.cos(a) * g.hrx * 0.72, py = y + Math.sin(a) * 2.8 - 0.4;
      c.beginPath(); ell(c, px, py, 1.1, 1.1); inked(c, PAL.bone, OL * 0.4);
    }
  },
  monocle(c, g) {
    const x = g.hx + 1.3 + g.hrx * 0.42, y = g.hy + g.hry * 0.1;
    c.beginPath(); ell(c, x, y, 3.5, 3.5); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
    c.lineWidth = 1.1; c.strokeStyle = PAL.cyan; c.stroke(); c.fillStyle = rgba(PAL.cyan, 0.15); c.fill();
    c.lineWidth = 0.6; c.strokeStyle = PAL.boneDim; c.beginPath(); c.moveTo(x + 2.6, y + 2.4); c.quadraticCurveTo(x + 5, y + 7, x + 2, y + 12); c.stroke();
  },
  bowtie(c, g) {
    const x = g.hx + 0.8, y = g.hy + g.hry * 0.84 + 3.4;
    c.beginPath(); poly(c, [x, y, x - 3.6, y - 2, x - 3.6, y + 2]); inked(c, PAL.magenta, OL * 0.5);
    c.beginPath(); poly(c, [x, y, x + 3.6, y - 2, x + 3.6, y + 2]); inked(c, PAL.magenta, OL * 0.5);
    c.beginPath(); ell(c, x, y, 1.1, 1.3); inked(c, shade(PAL.magenta, -0.3), OL * 0.4);
  },
  epaulets(c, g) {
    const x = g.bx - 3.5, y = g.by - g.bry + 1.6;
    c.beginPath(); poly(c, [x - 3, y - 1.2, x + 3, y - 1.2, x + 2.4, y + 1.6, x - 2.4, y + 1.6]); inked(c, PAL.magenta, OL * 0.5);
    c.fillStyle = PAL.bone; for (let i = 0; i < 4; i++) c.fillRect(x - 2.2 + i * 1.5, y + 1.6, 0.6, 1.5);
  },
  leafemblem(c, g) {
    const x = g.bx + g.brx * 0.5, y = g.by + 0.4;
    c.beginPath(); c.moveTo(x - 2.4, y + 2); c.quadraticCurveTo(x - 3, y - 3, x + 2.4, y - 2.6); c.quadraticCurveTo(x + 3, y + 2.4, x - 2.4, y + 2); c.closePath(); inked(c, PAL.lime, OL * 0.5);
    c.strokeStyle = shade(PAL.lime, -0.5); c.lineWidth = 0.5; c.beginPath(); c.moveTo(x - 1.8, y + 1.4); c.lineTo(x + 1.6, y - 1.6); c.stroke();
  },
  gi(c, g) {
    const x = g.bx + g.brx * 0.3, y = g.by + g.bry * 0.2;
    c.beginPath(); poly(c, [x - 4, y - g.bry, x + 5.4, y - g.bry, x + 1.6, y + 0.8, x - 0.6, y + 0.8]); c.save(); c.clip();
    c.fillStyle = PAL.bone; c.fillRect(x - 6, y - g.bry - 1, 14, g.bry + 3);
    c.restore(); c.lineWidth = 1; c.strokeStyle = shade(PAL.boneDim, -0.2); c.beginPath(); c.moveTo(x - 4, y - g.bry); c.lineTo(x - 0.6, y + 0.8); c.lineTo(x + 5.4, y - g.bry); c.stroke();
    const p = mkPart((cc, ox, oy) => { cc.moveTo(g.bx - g.brx * 0.1 + ox, g.by + g.bry * 0.15 + oy); cc.lineTo(g.bx + g.brx * 0.9 + ox, g.by + g.bry * 0.15 + oy); cc.lineTo(g.bx + g.brx * 0.9 + ox, g.by + g.bry * 0.55 + oy); cc.lineTo(g.bx - g.brx * 0.1 + ox, g.by + g.bry * 0.55 + oy); cc.closePath(); }, g.bx + g.brx * 0.4, g.by + g.bry * 0.35, g.brx * 0.5, 1.8);
    paintPart(c, p, PAL.ink3, { halftone: false, ol: OL * 0.7 });
    c.beginPath(); poly(c, [g.bx + g.brx * 0.2, g.by + g.bry * 0.4, g.bx - g.brx * 0.3, g.by + g.bry * 1.0, g.bx - g.brx * 0.1, g.by + g.bry * 1.05]); inked(c, PAL.ink3, OL * 0.5);
  },
  veilhat(c, g) {
    const x = g.hx + 1, y = g.top + 2.4;
    const p = mkPart((cc, ox, oy) => { cc.moveTo(x - 6 + ox, y + 1.5 + oy); cc.quadraticCurveTo(x - 5 + ox, y - 5 + oy, x + ox, y - 5.4 + oy); cc.quadraticCurveTo(x + 5 + ox, y - 5 + oy, x + 6 + ox, y + 1.5 + oy); cc.closePath(); }, x, y - 2, 6, 3.4);
    paintPart(c, p, PAL.ink3, { rim: true });
    c.beginPath(); ell(c, x + 3.6, y - 3.2, 2.2, 2.2); inked(c, PAL.magenta, OL * 0.5);
    c.strokeStyle = shade(PAL.magentaDeep, -0.3); c.lineWidth = 0.5; c.beginPath(); c.arc(x + 3.6, y - 3.2, 1.2, 0, 4.4); c.stroke();
    c.save(); c.beginPath(); c.moveTo(x - 6, y + 1); c.lineTo(x + 6, y + 1); c.lineTo(x + 5, y + 4.6); c.lineTo(x - 5, y + 4.6); c.closePath(); c.clip();
    c.strokeStyle = rgba(PAL.bone, 0.28); c.lineWidth = 0.4;
    for (let i = -6; i < 8; i += 1.6) { c.beginPath(); c.moveTo(x + i, y + 1); c.lineTo(x + i + 3, y + 8); c.moveTo(x + i + 3, y + 1); c.lineTo(x + i, y + 8); c.stroke(); }
    c.restore();
  },
  trapbrooch(c, g) {
    const x = g.bx + g.brx * 0.5, y = g.by + 0.6;
    c.beginPath(); c.rect(x - 2.6, y - 1.6, 5.2, 3.2); inked(c, F.gingerLt, OL * 0.4);
    c.strokeStyle = PAL.bone; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x - 2.2, y - 0.6); c.lineTo(x + 2.2, y - 0.6); c.moveTo(x - 1.6, y - 2.6); c.lineTo(x + 1.6, y + 0.4); c.stroke();
  },
  tufts(c, g, S) {
    for (let s = -1; s <= 1; s += 2) {
      const e = earGeom(g, s);
      c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath(); c.moveTo(e.T[0] - s * i * 0.5, e.T[1] + 0.6); c.lineTo(e.T[0] + s * (0.7 + i * 0.5), e.T[1] - 3.6 + i * 0.4); c.stroke();
        c.strokeStyle = S.f2; c.lineWidth = 1.0; c.beginPath(); c.moveTo(e.T[0] - s * i * 0.5, e.T[1] + 0.6); c.lineTo(e.T[0] + s * (0.7 + i * 0.5), e.T[1] - 3.6 + i * 0.4); c.stroke();
      }
    }
  },
  capback(c, g) {
    const cx = g.hx + 0.6, y0 = g.top + 2.4;
    const p = mkPart((cc, ox, oy) => {
      cc.moveTo(cx - 5.6 + ox, y0 + 1 + oy); cc.bezierCurveTo(cx - 5.6 + ox, y0 - 8 + oy, cx + 5.6 + ox, y0 - 8 + oy, cx + 5.6 + ox, y0 + 1 + oy); cc.closePath();
    }, cx, y0 - 2.4, 5.6, 3.8);
    paintPart(c, p, PAL.ink3, { hot: true });
    c.beginPath(); c.moveTo(cx - 5.2, y0 + 0.4); c.lineTo(cx - 11, y0 + 0.6); c.lineTo(cx - 10.6, y0 + 2.2); c.lineTo(cx - 5.4, y0 + 2); c.closePath(); inked(c, PAL.magenta, OL * 0.6);
    pointStar(c, cx + 0.2, y0 - 2.4, 1.5, PAL.cyan);
  },
  bandana(c, g) {
    const x = g.hx + 0.6, y = g.hy + g.hry * 0.92;
    c.beginPath(); poly(c, [x - g.hrx * 0.8, y - 1.6, x + g.hrx * 0.8, y - 1.6, x + 0.4, y + 5.2]); inked(c, PAL.magentaDeep, OL * 0.8);
    c.fillStyle = PAL.bone; for (let i = 0; i < 4; i++) { c.beginPath(); ell(c, x - 3.4 + i * 2.2, y - 0.2 + (i % 2) * 1.6, 0.55, 0.55); c.fill(); }
  },
  belt(c, g) {
    const y = g.by + g.bry * 0.45;
    const p = mkPart((cc, ox, oy) => { cc.moveTo(g.bx - g.brx * 0.92 + ox, y - 1.2 + oy); cc.lineTo(g.bx + g.brx * 0.92 + ox, y - 1.2 + oy); cc.lineTo(g.bx + g.brx * 0.92 + ox, y + 1.4 + oy); cc.lineTo(g.bx - g.brx * 0.92 + ox, y + 1.4 + oy); cc.closePath(); }, g.bx, y, g.brx * 0.9, 1.3);
    c.save(); c.beginPath(); bodyPart(g).path(c, 0, 0); c.clip(); paintPart(c, p, mix(F.ginger, PAL.ink, 0.6), { halftone: false, ol: OL * 0.7 }); c.restore();
    for (let i = 0; i < 3; i++) {
      const x = g.bx - 3.4 + i * 3.8;
      c.beginPath(); c.rect(x - 1.5, y + 0.4, 3, 3); inked(c, PAL.ink3, OL * 0.5);
      c.fillStyle = i === 1 ? PAL.cyan : PAL.magenta; c.beginPath(); ell(c, x, y + 1.9, 0.7, 0.7); c.fill();
    }
  },
  wirespool(c, g) {
    const x = g.bx + g.brx * 0.1, y = g.by - g.bry - 0.2;
    c.beginPath(); ell(c, x, y, 3.4, 3.4); inked(c, PAL.slate, OL * 0.6);
    c.strokeStyle = PAL.cyan; c.lineWidth = 0.7; for (let r = 2.6; r > 0.8; r -= 0.9) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  },
  loupe(c, g) {
    const x = g.hx + 1.3 + g.hrx * 0.42, y = g.hy + g.hry * 0.1;
    c.beginPath(); ell(c, x, y, 3.9, 3.9); c.lineWidth = 2.6; c.strokeStyle = INK; c.stroke();
    c.lineWidth = 1.4; c.strokeStyle = PAL.slate; c.stroke(); c.fillStyle = rgba(PAL.cyan, 0.16); c.fill();
    c.strokeStyle = PAL.boneDim; c.lineWidth = 0.6; for (let i = 0; i < 6; i++) { const a = i * 1.047; c.beginPath(); c.moveTo(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2); c.lineTo(x + Math.cos(a) * 4.6, y + Math.sin(a) * 4.6); c.stroke(); }
  },
  hexmarks(c, g) {
    const hexAt = (x, y, r) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); };
    c.lineWidth = 0.7; c.strokeStyle = PAL.magenta;
    hexAt(g.hx + 1.2, g.hy - g.hry * 0.38, 2.2); c.stroke();
    c.fillStyle = PAL.magenta; c.beginPath(); ell(c, g.hx + 1.2, g.hy - g.hry * 0.38, 0.6, 0.6); c.fill();
    hexAt(g.bx + 2, g.by - 1, 3.2); c.stroke(); hexAt(g.bx - 3.4, g.by + 2, 2); c.stroke();
  },
  moonpendant(c, g) {
    const x = g.bx + g.brx * 0.55, y = g.by - 1;
    c.beginPath(); c.arc(x, y, 2.4, 0.6, TAU - 0.6); c.arc(x + 1.1, y, 1.9, TAU - 0.9, 0.9, true); c.closePath(); inked(c, PAL.bone, OL * 0.4);
  },
  longwhisk(c, g) {
    c.strokeStyle = rgba(PAL.bone, 0.6); c.lineWidth = 0.5; c.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) for (let j = 0; j < 3; j++) {
      const x = g.hx + 1.2 + s * 2.4, y = g.hy + g.hry * 0.4 + j * 0.8;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + s * 8, y - 2 + j * 2.4, x + s * 14, y + 4 + j * 2, x + s * 17, y - 3 + j * 3); c.stroke();
    }
  },
  voidgrin() { /* drawn live so the grin can widen */ },
};
ACC_FRONT.moonhood = (c, g) => {
  const x = g.hx + 1.2, y = g.hy - g.hry * 0.42;
  c.beginPath(); c.arc(x, y, 2.5, 0.5, TAU - 0.5); c.arc(x + 1.2, y, 1.9, TAU - 0.8, 0.8, true); c.closePath(); inked(c, PAL.bone, OL * 0.4);
};
ACC_FRONT.hood = (c, g) => {
  pointStar(c, g.hx + 1.2, g.hy - g.hry * 0.55, 1.3, PAL.cyan);
};

function drawWhiskers(c, g, S) {
  const x = g.hx + 1.2, y = g.hy + g.hry * 0.42;
  c.lineCap = 'round';
  if (S.whisk === 'spark') {
    for (let s = -1; s <= 1; s += 2) for (let j = -1; j <= 1; j++) {
      const x0 = x + s * 2.2, y0 = y + j * 0.7;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + s * 4, y0 + j * 2.2); c.lineTo(x0 + s * 6, y0 + j * 2.2 - 1.6); c.lineTo(x0 + s * 9, y0 + j * 3.4);
      c.strokeStyle = rgba(PAL.cyan, 0.5); c.lineWidth = 2.2; c.stroke(); c.strokeStyle = PAL.bone; c.lineWidth = 0.6; c.stroke();
    }
    return;
  }
  c.strokeStyle = rgba(PAL.bone, 0.62); c.lineWidth = 0.45;
  for (let s = -1; s <= 1; s += 2) for (let j = -1; j <= 1; j++) {
    c.beginPath(); c.moveTo(x + s * 2.6, y + 0.4 + j * 0.7); c.quadraticCurveTo(x + s * 6, y + j * 1.4 + 0.2, x + s * 9.6, y + j * 2.8 + 0.8); c.stroke();
  }
}

function drawHat(c, g, S) {
  const col = S.hatCol || PAL.violet;
  const rc = ROLEC(g);
  if (S.hat === 'cone' || S.hat === 'tiny' || S.hat === 'witch') {
    const tiny = S.hat === 'tiny', witch = S.hat === 'witch';
    const H = tiny ? 8 : witch ? 15 : 13.5;
    const h = coneHat(c, g, col, H, witch ? -6 : tiny ? 3 : 4.5, witch ? g.hrx * 1.28 : g.hrx * (tiny ? 0.95 : 1.1), rc);
    if (witch) {
      c.fillStyle = PAL.bone; c.fillRect(h.cx - 2, h.y0 - 3.6, 4, 2.6);
      c.fillStyle = col; c.fillRect(h.cx - 1, h.y0 - 2.9, 2, 1.2);
    } else if (!tiny) {
      pointStar(c, h.cx + h.bend * 0.3, h.y0 - H * 0.5, 1.7, PAL.bone);
      pointStar(c, h.cx - 1.5, h.y0 - H * 0.28, 0.9, PAL.cyan);
    } else {
      c.beginPath(); poly(c, [h.cx + 0.8, h.y0 - 5, h.cx - 1, h.y0 - 3.2, h.cx + 0.1, h.y0 - 3.2, h.cx - 0.8, h.y0 - 1.2, h.cx + 1.4, h.y0 - 3.6, h.cx + 0.4, h.y0 - 3.6]); c.fillStyle = PAL.cyan; c.fill();
    }
  } else if (S.hat === 'top') {
    const cx = g.hx + 0.8, y0 = g.top + 2, w = g.hrx * 0.58, H = 10.5;
    const brim = mkPart((cc, ox, oy) => ell(cc, cx + ox, y0 + oy, g.hrx * 0.98, 2.1), cx, y0, g.hrx * 0.98, 2.1);
    paintPart(c, brim, PAL.ink3, { halftone: false });
    const cyl = mkPart((cc, ox, oy) => { cc.moveTo(cx - w + ox, y0 + oy); cc.lineTo(cx - w * 0.92 + ox, y0 - H + oy); cc.quadraticCurveTo(cx + ox, y0 - H - 1.6 + oy, cx + w * 0.92 + ox, y0 - H + oy); cc.lineTo(cx + w + ox, y0 + oy); cc.closePath(); }, cx, y0 - H / 2, w, H / 2);
    paintPart(c, cyl, PAL.ink3, { hot: true });
    c.save(); c.beginPath(); cyl.path(c, 0, 0); c.clip(); c.fillStyle = rc; c.fillRect(cx - w, y0 - 3.4, w * 2, 2.4); c.restore();
    c.beginPath(); poly(c, [cx + 0.6, y0 - 8.8, cx - 1.4, y0 - 5.8, cx - 0.2, y0 - 5.8, cx - 1.2, y0 - 3.6, cx + 1.4, y0 - 6.6, cx + 0.2, y0 - 6.6]); c.fillStyle = PAL.cyan; c.fill();
  } else if (S.hat === 'bicorne') {
    const cx = g.hx + 0.8, y0 = g.top + 2.4;
    const p = mkPart((cc, ox, oy) => {
      cc.moveTo(cx - g.hrx * 1.08 + ox, y0 + 1 + oy); cc.quadraticCurveTo(cx - g.hrx * 0.3 + ox, y0 - 9 + oy, cx + ox, y0 - 5.4 + oy);
      cc.quadraticCurveTo(cx + g.hrx * 0.3 + ox, y0 - 9 + oy, cx + g.hrx * 1.1 + ox, y0 + 1 + oy);
      cc.quadraticCurveTo(cx + ox, y0 + 3.4 + oy, cx - g.hrx * 1.08 + ox, y0 + 1 + oy); cc.closePath();
    }, cx, y0 - 2, g.hrx * 1.05, 4.4);
    paintPart(c, p, mix(PAL.cyanDeep, PAL.ink, 0.5), { hot: true });
    c.fillStyle = PAL.bone; c.beginPath(); poly(c, [cx - 1.8, y0 - 2.4, cx + 0.2, y0 - 5, cx + 2.2, y0 - 2.4, cx + 0.2, y0 - 0.8]); c.fill();
    c.beginPath(); poly(c, [cx - 0.2, y0 - 3.8, cx + 0.5, y0 - 3.8, cx + 0.5, y0 - 1.6, cx - 0.2, y0 - 1.6]); c.fillStyle = PAL.lime; c.fill();
  } else if (S.hat === 'crownhat') {
    const cx = g.hx + 0.8, y0 = g.top + 2.6, w = g.hrx * 0.7;
    const spikes = [-1, -0.5, 0, 0.5, 1];
    const p = mkPart((cc, ox, oy) => {
      cc.moveTo(cx - w + ox, y0 + oy);
      for (let i = 0; i < spikes.length; i++) {
        const x = cx + spikes[i] * w, tall = 14 - Math.abs(spikes[i]) * 5;
        cc.lineTo(x + ox, y0 - tall + oy);
        if (i < spikes.length - 1) cc.lineTo(x + w * 0.25 + ox, y0 - 5 + oy);
      }
      cc.lineTo(cx + w + ox, y0 + oy); cc.closePath();
    }, cx, y0 - 6, w, 7);
    paintPart(c, p, RARITY.legend.ramp[2], { hot: true });
    c.save(); c.beginPath(); p.path(c, 0, 0); c.clip(); c.fillStyle = RARITY.legend.ramp[1]; c.fillRect(cx - w, y0 - 2.6, w * 2, 2.6); c.restore();
    for (let i = 0; i < spikes.length; i++) { c.beginPath(); ell(c, cx + spikes[i] * w, y0 - (14 - Math.abs(spikes[i]) * 5) - 0.4, 1.0, 1.0); c.fillStyle = i % 2 ? PAL.cyan : PAL.magenta; c.fill(); }
    c.beginPath(); ell(c, cx, y0 - 1.3, 1.3, 1.3); inked(c, PAL.cyan, OL * 0.4);
  }
}

/** Paint the static core of a cat in unit space (origin at feet centre). */
function paintCore(c, catId, ppu) {
  const g = geomFor(catId), S = g.S;
  OL = Math.max(1.1, 1.5 / ppu);
  const rid = g.rarity;
  // back layer
  for (const n of S.acc) if (ACC_BACK[n]) ACC_BACK[n](c, g, S);
  // ears (far first)
  const earBase = S.pat === 'points' ? S.f2 : S.fur;
  for (const side of [-1, 1]) {
    const ep = earPart(g, side);
    paintPart(c, ep, side < 0 ? shade(earBase, -0.12) : earBase, { halftone: false, hot: side > 0, ol: OL });
    const e = earGeom(g, side);
    // inner ear (magenta, alpha 0.7)
    c.save(); c.globalAlpha = 0.7; c.beginPath();
    const ix = (e.I[0] + e.O[0]) / 2, iy = (e.I[1] + e.O[1]) / 2 + 0.6;
    c.moveTo(lerp(e.I[0], ix, 0.35) + 0, lerp(e.I[1], iy, 0.35));
    c.quadraticCurveTo(lerp(e.cI[0], ix, 0.4), lerp(e.cI[1], iy, 0.4), lerp(e.T[0], ix, 0.38), lerp(e.T[1], iy, 0.4));
    c.quadraticCurveTo(lerp(e.cO[0], ix, 0.5), lerp(e.cO[1], iy, 0.5), lerp(e.O[0], ix, 0.35), lerp(e.O[1], iy, 0.35));
    c.closePath(); c.fillStyle = PAL.magenta; c.fill(); c.restore();
  }
  // body + head
  const bp = bodyPart(g), hp = headPart(g);
  paintPart(c, bp, S.fur, { pattern: (cc) => patBody(cc, g, S), hot: true });
  // belly fluff highlight
  paintPart(c, hp, S.fur, { pattern: (cc) => patHead(cc, g, S), hot: true });
  // muzzle, nose
  const mx = g.hx + 1.2, my = g.hy + g.hry * 0.42;
  c.fillStyle = S.pat === 'tux' ? S.f2 : shade(S.fur, 0.3); c.globalAlpha = 0.55;
  c.beginPath(); ell(c, mx, my + 0.4, 3.4, 2.5); c.fill(); c.globalAlpha = 1;
  c.beginPath(); poly(c, [mx - 1.1, my - 0.7, mx + 1.1, my - 0.7, mx, my + 0.5]); c.fillStyle = PAL.magenta; c.fill();
  drawWhiskers(c, g, S);
  // front accessories
  for (const n of S.acc) if (ACC_FRONT[n]) ACC_FRONT[n](c, g, S);
  if (S.hat) drawHat(c, g, S);
  // rarity ornaments baked into the core
  if (RARITY[rid].order >= 2) {
    const jx = g.hx + 0.8, jy = g.hy + g.hry * 1.0 + 1.6;
    c.beginPath(); diamond(c, jx, jy, 2.1); inked(c, RARITY[rid].order >= 4 ? PAL.cyan : RARITY[rid].color, OL * 0.5);
    c.fillStyle = rgba(PAL.bone, 0.85); c.beginPath(); ell(c, jx - 0.5, jy - 0.6, 0.45, 0.4); c.fill();
  }
  if (rid === 'legend' && S.crown && !S.hat) {
    const cx = g.hx + 0.8, y0 = g.top + 1.6, w = g.hrx * 0.58;
    c.beginPath(); c.moveTo(cx - w, y0);
    for (let i = 0; i < 5; i++) { c.lineTo(cx - w + (i + 0.5) * (w * 2 / 5), y0 - 4.2); c.lineTo(cx - w + (i + 1) * (w * 2 / 5), y0 - 1.6 + (i === 4 ? 1.6 : 0)); }
    c.lineTo(cx + w, y0 + 0.4); c.lineTo(cx - w, y0 + 0.4); c.closePath(); inked(c, RARITY.legend.ramp[3], OL * 0.7);
    c.fillStyle = RARITY.legend.ramp[1]; c.fillRect(cx - w, y0 - 1.0, w * 2, 1.4);
    c.fillStyle = PAL.magenta; c.beginPath(); ell(c, cx, y0 - 0.3, 0.9, 0.9); c.fill();
  }
  if (S.fade) {
    c.save(); c.globalCompositeOperation = 'destination-out';
    const gr = c.createLinearGradient(0, g.by - g.bry * 0.2, 0, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.92)');
    c.fillStyle = gr; c.fillRect(-30, g.by - g.bry * 0.2, 60, 14);
    c.restore();
  }
}

// ---------- core cache (baked static layers per cat and size bucket) ----------
const CORE_W = 60, CORE_H = 56, CORE_OX = 30, CORE_OY = 52;
const BUCKETS = [0.6, 0.9, 1.4, 2, 3, 4.5, 6.5];
const CORE = new Map();
const CORE_MAX = 180;
let bakeCount = 0;

function pickBucket(need) {
  for (let i = 0; i < BUCKETS.length; i++) if (BUCKETS[i] >= need * 0.88) return BUCKETS[i];
  return BUCKETS[BUCKETS.length - 1];
}
function getCore(catId, need) {
  const b = pickBucket(need), key = catId + '|' + b;
  let e = CORE.get(key);
  if (e !== undefined) { if (e) { CORE.delete(key); CORE.set(key, e); } return e; }
  const cv = makeCanvas(CORE_W * b, CORE_H * b);
  if (!cv) { CORE.set(key, null); return null; }
  const cx = cv.getContext('2d');
  cx.scale(b, b); cx.translate(CORE_OX, CORE_OY);
  paintCore(cx, catId, b);
  e = { cv, b, sil: {} };
  bakeCount++;
  CORE.set(key, e);
  if (CORE.size > CORE_MAX) CORE.delete(CORE.keys().next().value);
  return e;
}
function getSil(e, color) {
  let s = e.sil[color];
  if (s !== undefined) return s;
  s = makeCanvas(e.cv.width, e.cv.height);
  if (s) {
    const x = s.getContext('2d');
    x.drawImage(e.cv, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, s.width, s.height);
  }
  e.sil[color] = s;
  return s;
}
/** Draw the baked core in unit space (null cache falls back to painting live). */
function blitCore(c, catId, e, alpha, silColor) {
  if (e) {
    const src = silColor ? getSil(e, silColor) : e.cv;
    if (!src) return;
    const pa = c.globalAlpha; c.globalAlpha = pa * alpha;
    c.drawImage(src, -CORE_OX, -CORE_OY, CORE_W, CORE_H);
    c.globalAlpha = pa;
  } else if (!silColor) {
    const pa = c.globalAlpha; c.globalAlpha = pa * alpha;
    c.save(); paintCore(c, catId, 3); c.restore();
    c.globalAlpha = pa;
  }
}
/** Drop every baked bitmap (for tests or after a device-pixel-ratio change). */
export function clearCatCache() { CORE.clear(); glowCache.clear(); CARD_BG.clear(); }
export function catCacheStats() { return { cores: CORE.size, bakes: bakeCount }; }

// ---------- pose ----------
const P = {
  dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, walk: 0, walkAmp: 0, tailAmp: 1, tailCurl: 0.9, earBack: 0, eyeOpen: 1, mouth: 0,
  arm: 0, draw: 0, cast: 0, alpha: 1, xEyes: 0, sleep: 0, orbPush: 0, glowMul: 1, flash: 0, flashCol: null,
};
function computePose(anim, animT, t, ph, g, hitFlash) {
  P.dx = 0; P.dy = 0; P.rot = 0; P.sx = 1; P.sy = 1; P.walk = 0; P.walkAmp = 0; P.tailAmp = 1; P.tailCurl = 0.9;
  P.earBack = 0; P.eyeOpen = 1; P.mouth = 0; P.arm = 0; P.draw = 0; P.cast = 0; P.alpha = 1; P.xEyes = 0; P.sleep = 0;
  P.orbPush = 0; P.glowMul = 1;
  const a = animT;
  const breath = Math.sin(TAU * (t * 1.2 + ph));
  const melee = g.role === 'brawler' || g.role === 'tank';
  if (anim === 'walk') {
    const w = frac(t * 2.4 + ph);
    P.walk = w; P.walkAmp = 1; P.dy = -Math.abs(Math.sin(w * TAU)) * 1.3; P.rot = 0.07; P.tailAmp = 0.5; P.tailCurl = 0.1;
    P.sy = 1 + 0.012 * breath;
  } else if (anim === 'attack') {
    const wind = a < 0.3 ? outCubic(a / 0.3) : Math.max(0, 1 - (a - 0.3) / 0.12);
    const strike = a < 0.3 ? 0 : a < 0.5 ? outCubic((a - 0.3) / 0.2) : 1 - inOutSine((a - 0.5) / 0.5);
    const reach = g.role === 'tank' ? 0.62 : 1;
    P.mouth = strike > 0.2 ? 1 : 0;
    if (melee) {
      P.dx = -2.2 * wind + 5.2 * strike * reach; P.sx = 1 - 0.08 * wind + 0.13 * strike; P.sy = 1 + 0.04 * wind - 0.08 * strike;
      P.rot = -0.1 * wind + 0.15 * strike; P.arm = strike; P.tailAmp = 1.4;
    } else {
      P.draw = a < 0.3 ? wind : Math.max(0, 1 - (a - 0.3) / 0.07);
      P.dx = -1.1 * wind - 1.4 * strike; P.sx = 1 - 0.06 * wind + 0.06 * strike; P.sy = 1 + 0.03 * wind - 0.03 * strike;
      P.rot = -0.06 * wind + 0.05 * strike; P.arm = strike * 0.5; P.orbPush = strike; P.tailAmp = 1.3;
    }
  } else if (anim === 'cast') {
    const c1 = a < 0.25 ? outCubic(a / 0.25) : 0;
    const up = a < 0.25 ? 0 : a < 0.6 ? outCubic((a - 0.25) / 0.35) : 1 - inOutSine((a - 0.6) / 0.4);
    P.sy = 1 - 0.12 * c1 + 0.14 * up; P.sx = 1 + 0.08 * c1 - 0.08 * up; P.dy = -4 * up;
    P.cast = a > 0.2 && a < 0.92 ? Math.sin(Math.PI * (a - 0.2) / 0.72) : 0;
    P.arm = up; P.tailAmp = 1.7; P.glowMul = 1 + P.cast * 1.2; P.mouth = up > 0.5 ? 0.5 : 0;
  } else if (anim === 'hit') {
    const k = 1 - a;
    P.dx = -2.6 * k * k; P.rot = -0.14 * k; P.sy = 1 - 0.07 * k; P.sx = 1 + 0.05 * k; P.earBack = k > 0.15 ? 1 : 0;
    P.eyeOpen = a < 0.5 ? 0.2 : 1; P.mouth = 0.6 * k; P.tailAmp = 1.8;
  } else if (anim === 'die') {
    if (a < 0.12) { const s = 1 + 0.15 * outCubic(a / 0.12); P.sx = s; P.sy = s; }
    else {
      const k = (a - 0.12) / 0.88;
      P.sx = 1.15 - 0.15 * k; P.sy = 1.15 - 0.8 * inOutSine(k); P.rot = -1.35 * k * k; P.dx = -4 * k;
      P.alpha = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
    }
    P.xEyes = 1; P.eyeOpen = 0; P.tailAmp = 0; P.tailCurl = 0.3; P.earBack = 1;
  } else if (anim === 'sleep') {
    const sb = Math.sin(TAU * (t * 0.35 + ph));
    P.sy = 0.78 + 0.03 * sb; P.sx = 1.1 - 0.015 * sb; P.rot = 0.04; P.eyeOpen = 0; P.sleep = 1; P.tailAmp = 0.2; P.tailCurl = 2.3; P.earBack = 0.6;
  } else {
    P.sy = 1 + 0.015 * breath; P.sx = 1 - 0.008 * breath; P.rot = 0.012 * Math.sin(TAU * (t * 0.3 + ph));
  }
  // hit flash: 3 frames (bone silhouette, cyan tint, normal)
  const f = clamp(fin(hitFlash), 0, 1);
  if (f > 0.66) { P.flash = 1; P.flashCol = PAL.bone; }
  else if (f > 0.02) { P.flash = f * 0.9; P.flashCol = PAL.cyan; }
  else { P.flash = 0; P.flashCol = null; }
}

// ---------- live parts ----------
const TX = new Float32Array(16), TY = new Float32Array(16);
function drawTail(c, g, S, t, ph, base, angOff, lenMul, wMul, tipCol, ringCol, stripe) {
  const n = 7;
  const len = (g.role === 'trapper' ? 19 : g.role === 'tank' ? 12 : 15) * lenMul;
  const seg = len / n;
  let x = g.tailX, y = g.tailY, a = -2.25 + angOff;
  const curl = P.tailCurl, amp = 0.2 * P.tailAmp;
  TX[0] = x; TY[0] = y;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    a += curl / n + amp * Math.sin(t * 3 + ph * 6 - i * 0.6) * (0.4 + k);
    x += Math.cos(a) * seg; y += Math.sin(a) * seg;
    TX[i] = x; TY[i] = y;
  }
  const w0 = g.limb * 0.72 * wMul, w1 = g.limb * 0.34 * wMul;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = INK;
  for (let i = 0; i < n; i++) { c.lineWidth = lerp(w0, w1, i / n) + 2.4; c.beginPath(); c.moveTo(TX[i], TY[i]); c.lineTo(TX[i + 1], TY[i + 1]); c.stroke(); }
  for (let i = 0; i < n; i++) {
    let col = base;
    if (i >= n - 2) col = tipCol;
    else if (ringCol && i === 3) col = ringCol;
    else if (stripe && (i === 1 || i === 4)) col = stripe;
    c.strokeStyle = col; c.lineWidth = lerp(w0, w1, i / n);
    c.beginPath(); c.moveTo(TX[i], TY[i]); c.lineTo(TX[i + 1], TY[i + 1]); c.stroke();
  }
  // rim light on the upper left of the first segments
  c.strokeStyle = rgba(PAL.cyan, 0.6); c.lineWidth = 0.7;
  c.beginPath(); c.moveTo(TX[0] - 0.4, TY[0] - w0 * 0.35); for (let i = 1; i <= 3; i++) c.lineTo(TX[i] - 0.5, TY[i] - lerp(w0, w1, i / n) * 0.35); c.stroke();
  return n;
}

function limb(c, hx, hy, fx, fy, w, col, paw, bandage, rimOn) {
  c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = w + 2.6; c.beginPath(); c.moveTo(hx, hy); c.lineTo(fx, fy); c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(hx, hy); c.lineTo(fx, fy); c.stroke();
  if (rimOn) { c.strokeStyle = rgba(PAL.cyan, 0.4); c.lineWidth = 0.6; c.beginPath(); c.moveTo(hx - w * 0.32, hy); c.lineTo(fx - w * 0.32, fy - 0.4); c.stroke(); }
  c.beginPath(); ell(c, fx + 0.6, fy - 0.3, w * 0.5, w * 0.34); inked(c, paw, 0.7);
  if (bandage) {
    c.strokeStyle = shade(PAL.boneDim, -0.35); c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(fx - 1.2, fy - 2.6); c.lineTo(fx + 1.6, fy - 1.4); c.moveTo(fx - 1.2, fy - 1.6); c.lineTo(fx + 1.6, fy - 0.4); c.stroke();
  }
}
function drawLegs(c, g, S, flashCol, flashA) {
  const w = g.limb, hy = g.by + g.bry * 0.45;
  let paw = pawCol(S);
  let fur = S.fur;
  if (flashCol) { fur = mix(fur, flashCol, flashA); paw = mix(paw, flashCol, flashA); }
  const bandage = S.paw === 'bandage';
  const ph = P.walk * TAU;
  const spec = [[g.legBack - 1.8, 0, 1], [g.legFront + 1.6, Math.PI, 1], [g.legBack, Math.PI, 0], [g.legFront, 0, 0]];
  for (let i = 0; i < 4; i++) {
    const s = spec[i], far = s[2] === 1;
    const sw = Math.sin(ph + s[1]) * 2.6 * P.walkAmp, lift = Math.max(0, Math.cos(ph + s[1])) * 1.8 * P.walkAmp;
    let fx = s[0] + sw, fy = -lift - 0.4;
    if (i === 3 && P.arm > 0) { fx += P.arm * (g.role === 'brawler' ? 5.5 : 2.5); fy -= P.arm * (g.role === 'brawler' ? 5 : 3.2); }
    if (i === 1 && P.arm > 0 && g.role !== 'brawler') { fx += P.arm * 1.5; fy -= P.arm * 2.5; }
    limb(c, s[0], hy, fx, fy, w * (far ? 0.9 : 1), far ? shade(fur, -0.22) : fur, far ? shade(paw, -0.2) : paw, bandage && !far, !far);
  }
}

const EXPR = {
  calm: { top: 1.7, bot: 1.5, drop: 0, tilt: 0.5, brow: 0 },
  grumpy: { top: 0.95, bot: 1.4, drop: 1.4, tilt: 0.8, brow: 1 },
  fierce: { top: 1.15, bot: 1.2, drop: 2.0, tilt: 1.1, brow: 1.5 },
  smug: { top: 0.7, bot: 1.3, drop: -0.2, tilt: 0.9, brow: -0.6 },
  sleepy: { top: 0.5, bot: 1.1, drop: -0.5, tilt: 0.2, brow: 0 },
  wide: { top: 2.3, bot: 2.0, drop: 0, tilt: 0.3, brow: 0 },
  sly: { top: 1.0, bot: 1.1, drop: 0.5, tilt: 1.1, brow: 0.5 },
  cute: { top: 2.1, bot: 1.9, drop: 0, tilt: 0.2, brow: 0 },
};
function eyePath(c, ex, ey, s, w, E, open) {
  const ox = ex + s * w, oy = ey - E.tilt, ix = ex - s * w, iy = ey + E.drop * 0.5;
  c.moveTo(ox, oy);
  c.quadraticCurveTo(ex, ey - 2 * E.top * open + E.drop * 0.3, ix, iy);
  c.quadraticCurveTo(ex, ey + 2 * E.bot * open, ox, oy);
  c.closePath();
}
function drawFace(c, g, S, t, ph, glowAmt) {
  const E = EXPR[S.brow] || EXPR.calm;
  const col = g.eyeCol;
  const gap = g.hrx * 0.42, w = 2.7 * (g.hr / 8) * (S.brow === 'cute' ? 1.1 : 1);
  const cyc = 3.4 + hash(g.seed) * 1.6, bp = (t + ph * 7) % cyc;
  const blink = bp < 0.12 ? Math.sin((bp / 0.12) * Math.PI) : 0;
  let open = P.eyeOpen * (1 - blink * 0.95);
  const ex0 = g.hx + 1.2, ey = g.hy + g.hry * 0.08;
  const lookX = 0.5;
  for (let s = -1; s <= 1; s += 2) {
    const ex = ex0 + s * gap;
    let op = open;
    if (S.brow === 'sly' && s < 0) op *= 0.55;
    if (P.xEyes) {
      c.strokeStyle = INK; c.lineWidth = 1; c.lineCap = 'round'; c.beginPath();
      c.moveTo(ex - 1.7, ey - 1.7); c.lineTo(ex + 1.7, ey + 1.7); c.moveTo(ex + 1.7, ey - 1.7); c.lineTo(ex - 1.7, ey + 1.7); c.stroke();
      continue;
    }
    bloom(c, ex, ey, 5.4, col, 0.42 * glowAmt * (op > 0.2 ? 1 : 0.2));
    if (op < 0.14) {
      c.strokeStyle = INK; c.lineWidth = 0.9; c.lineCap = 'round'; c.beginPath();
      c.moveTo(ex - w, ey); c.quadraticCurveTo(ex, ey + (P.sleep ? 1.6 : 0.5), ex + w, ey); c.stroke();
      continue;
    }
    c.beginPath(); eyePath(c, ex, ey, s, w, E, op);
    c.fillStyle = col; c.fill();
    c.save(); c.clip();
    c.fillStyle = rgba(shade(col, 0.45), 0.7); c.fillRect(ex - w - 1, ey + 0.3, w * 2 + 2, 4);
    const ph2 = Math.max(0.4, (E.top + E.bot) * op * 0.95);
    c.fillStyle = INK; c.beginPath(); ell(c, ex + lookX * 0.5, ey - E.top * op * 0.12, 0.6 * (P.cast ? 0.8 : 1), ph2); c.fill();
    c.fillStyle = PAL.bone; c.beginPath(); ell(c, ex - 0.7 + lookX * 0.4, ey - E.top * op * 0.55, 0.55, 0.5); c.fill();
    c.restore();
    c.beginPath(); eyePath(c, ex, ey, s, w, E, op);
    c.lineWidth = 0.8; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
    // brow
    const bro = S.brow === 'smug' ? (s > 0 ? -1 : 0.2) : E.brow;
    if (bro !== 0 && S.brow !== 'wide' && S.brow !== 'cute' && S.brow !== 'sleepy') {
      c.strokeStyle = shade(S.fur, -0.65); c.lineWidth = 1.1; c.lineCap = 'round';
      c.beginPath(); c.moveTo(ex + s * (w + 0.5), ey - 3.0 - (bro < 0 ? 0.6 : 0)); c.lineTo(ex - s * (w * 0.6), ey - 2.6 + bro * 1.0 - (bro < 0 ? 1.6 : 0)); c.stroke();
    }
  }
}
function drawMouth(c, g, S, t) {
  const mx = g.hx + 1.2, my = g.hy + g.hry * 0.42;
  const kind = S.mouth || 'cat';
  c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = shade(S.fur, -0.7); c.lineWidth = 0.65;
  const open = Math.max(P.mouth, kind === 'open' ? 0.75 : 0);
  if (P.sleep) {
    c.beginPath(); c.moveTo(mx - 1.6, my + 1.6); c.quadraticCurveTo(mx, my + 2.3, mx + 1.6, my + 1.6); c.stroke(); return;
  }
  if (kind === 'grin' && S.fade) {
    // Cheshire grin: a huge crescent of teeth that breathes
    const gw = 8.6 + Math.sin(t * 2) * 0.5;
    c.beginPath(); c.moveTo(mx - gw, my - 0.4); c.quadraticCurveTo(mx, my + 9.5 + open * 2, mx + gw, my - 0.4); c.quadraticCurveTo(mx, my + 3.4, mx - gw, my - 0.4); c.closePath();
    inked(c, PAL.bone, 0.9);
    c.strokeStyle = PAL.ink; c.lineWidth = 0.5;
    for (let i = -6; i <= 6; i++) { const x = mx + i * gw / 6.8; const yy = my + 1.4 + (6.4 - Math.abs(i)) * 0.5 * 1.15; c.beginPath(); c.moveTo(x, my + 0.8 + (6 - Math.abs(i)) * 0.18); c.lineTo(x, yy + 1.4); c.stroke(); }
    bloom(c, mx, my + 3, 11, PAL.cyan, 0.25);
    return;
  }
  if (open > 0.3) {
    const r = 1.0 + open * 1.5;
    c.beginPath(); ell(c, mx, my + 2.1 + r * 0.3, 1.5 + open * 0.8, r); c.fillStyle = INK; c.fill();
    c.beginPath(); ell(c, mx, my + 2.5 + r * 0.6, 1.0 + open * 0.4, r * 0.45); c.fillStyle = PAL.magenta; c.fill();
    if (kind === 'fang' || kind === 'open') { c.fillStyle = PAL.bone; c.beginPath(); poly(c, [mx - 1.3, my + 1.2, mx - 0.5, my + 1.2, mx - 0.9, my + 2.4]); poly(c, [mx + 0.5, my + 1.2, mx + 1.3, my + 1.2, mx + 0.9, my + 2.4]); c.fill(); }
    return;
  }
  c.beginPath(); c.moveTo(mx, my + 0.5); c.lineTo(mx, my + 1.3); c.stroke();
  if (kind === 'flat') { c.beginPath(); c.moveTo(mx - 1.8, my + 1.9); c.lineTo(mx + 1.8, my + 1.9); c.stroke(); return; }
  if (kind === 'frown') { c.beginPath(); c.moveTo(mx - 2.2, my + 2.6); c.quadraticCurveTo(mx - 1.1, my + 1.2, mx, my + 1.4); c.quadraticCurveTo(mx + 1.1, my + 1.2, mx + 2.2, my + 2.6); c.stroke(); return; }
  const wide = kind === 'smile' || kind === 'grin' ? 1.5 : 1;
  c.beginPath(); c.moveTo(mx - 2.2 * wide, my + 1.5); c.quadraticCurveTo(mx - 1.1 * wide, my + 2.8, mx, my + 1.4); c.quadraticCurveTo(mx + 1.1 * wide, my + 2.8, mx + 2.2 * wide, my + 1.5); c.stroke();
  if (kind === 'grin') { c.fillStyle = PAL.bone; c.beginPath(); poly(c, [mx - 0.4, my + 1.5, mx + 0.4, my + 1.5, mx, my + 2.3]); c.fill(); }
  if (kind === 'fang') { c.fillStyle = PAL.bone; c.beginPath(); poly(c, [mx - 1.7, my + 1.9, mx - 0.9, my + 1.9, mx - 1.3, my + 3.1]); poly(c, [mx + 0.9, my + 1.9, mx + 1.7, my + 1.9, mx + 1.3, my + 3.1]); c.fill(); }
}

function bolt(c, x0, y0, x1, y1, seed, segs) {
  c.beginPath(); c.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    c.lineTo(lerp(x0, x1, k) + (hash(seed + i * 7) - 0.5) * 3.2, lerp(y0, y1, k) + (hash(seed + i * 13) - 0.5) * 3.2);
  }
  c.lineTo(x1, y1);
}
function crackle(c, x, y, t, seed, col, n, spread) {
  const k = Math.floor(t * 11);
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const a = hash(seed + k * 31 + i * 5) * TAU, r = spread * (0.5 + hash(seed + k * 17 + i) * 0.7);
    const x1 = x + Math.cos(a) * r, y1 = y + Math.sin(a) * r * 0.8;
    bolt(c, x, y, x1, y1, seed + k * 101 + i * 9, 3);
    c.strokeStyle = rgba(col, 0.4); c.lineWidth = 2.2; c.stroke();
    c.strokeStyle = PAL.bone; c.lineWidth = 0.55; c.stroke();
  }
}
function flame(c, x, y, s, t, seed, colA, colB) {
  const sw = Math.sin(t * 9 + seed) * 0.6;
  const prevOp = c.globalCompositeOperation; c.globalCompositeOperation = 'lighter';
  c.beginPath(); c.moveTo(x - s * 0.6, y); c.quadraticCurveTo(x - s * 0.8, y - s * 1.4, x + sw * s * 0.4, y - s * 2.6);
  c.quadraticCurveTo(x + s * 0.9, y - s * 1.2, x + s * 0.6, y); c.closePath();
  c.fillStyle = rgba(colA, 0.7); c.fill();
  c.beginPath(); c.moveTo(x - s * 0.3, y); c.quadraticCurveTo(x - s * 0.4, y - s * 0.9, x + sw * s * 0.2, y - s * 1.6); c.quadraticCurveTo(x + s * 0.5, y - s * 0.8, x + s * 0.3, y); c.closePath();
  c.fillStyle = rgba(colB, 0.9); c.fill();
  c.globalCompositeOperation = prevOp;
}
function bowDraw(c, g, S, bowKind, t) {
  const gx = g.hx + g.hrx * 0.55 + 4.5 + P.arm * 0, gy = g.by - 2.5;
  const r = bowKind === 'long' ? 11.5 : bowKind === 'moon' ? 10.5 : bowKind === 'recurve' ? 8.6 : 6.8;
  const pull = P.draw * 3.6;
  const wood = bowKind === 'moon' ? PAL.bone : bowKind === 'long' ? PAL.violetHi : bowKind === 'recurve' ? PAL.ink3 : mix(F.ginger, PAL.ink, 0.5);
  const tx = gx - r * 0.1, bulge = r * 0.85;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(tx, gy - r); c.quadraticCurveTo(gx + bulge, gy, tx, gy + r);
  if (bowKind === 'recurve') { c.moveTo(tx, gy - r); c.quadraticCurveTo(tx - 1.2, gy - r - 1.8, tx + 1.5, gy - r - 2.4); c.moveTo(tx, gy + r); c.quadraticCurveTo(tx - 1.2, gy + r + 1.8, tx + 1.5, gy + r + 2.4); }
  c.strokeStyle = INK; c.lineWidth = 3.2; c.stroke();
  c.strokeStyle = wood; c.lineWidth = 1.7; c.stroke();
  if (bowKind === 'moon' || bowKind === 'long') { bloom(c, gx + bulge * 0.4, gy, r * 0.9, bowKind === 'moon' ? PAL.cyan : PAL.violetHi, 0.35); }
  c.strokeStyle = PAL.cyan; c.lineWidth = 0.55;
  c.beginPath(); c.moveTo(tx, gy - r); c.lineTo(tx - pull, gy); c.lineTo(tx, gy + r); c.stroke();
  if (P.draw > 0.15) {
    c.strokeStyle = INK; c.lineWidth = 1.8; c.beginPath(); c.moveTo(tx - pull, gy); c.lineTo(gx + 7, gy); c.stroke();
    c.strokeStyle = PAL.bone; c.lineWidth = 0.8; c.beginPath(); c.moveTo(tx - pull, gy); c.lineTo(gx + 7, gy); c.stroke();
    c.beginPath(); poly(c, [gx + 7, gy - 1.2, gx + 10, gy, gx + 7, gy + 1.2]); c.fillStyle = PAL.cyan; c.fill();
  }
  if (bowKind === 'moon') { c.beginPath(); starPath(c, tx, gy - r - 1.4, 1.4, 4, 0.35); c.fillStyle = PAL.bone; c.fill(); }
}
function orbDraw(c, g, S, t, ph, back) {
  const a = t * 2.1 + ph * TAU;
  const front = Math.sin(a) >= 0;
  if (front === back) return;
  const rc = ROLE_COLOR.mage;
  const push = P.orbPush;
  const cx = g.hx + 1 + Math.cos(a) * g.hrx * 1.5 * (1 - push) + push * 14;
  const cy = g.top - 3 + Math.sin(a) * 2.8 - push * 5 - P.cast * 6;
  const r = 1.9 + P.cast * 1.6 + push * 1.2;
  for (let i = 3; i >= 1; i--) {
    const aa = a - i * 0.4;
    bloom(c, g.hx + 1 + Math.cos(aa) * g.hrx * 1.5, g.top - 3 + Math.sin(aa) * 2.8, 1.6 - i * 0.3, i % 2 ? PAL.cyan : rc, 0.5 - i * 0.12);
  }
  bloom(c, cx, cy, r * 3.4, rc, 0.7);
  c.beginPath(); ell(c, cx, cy, r, r); inked(c, rc, 0.6);
  c.fillStyle = PAL.bone; c.beginPath(); ell(c, cx - r * 0.3, cy - r * 0.3, r * 0.4, r * 0.4); c.fill();
}
function shieldDraw(c, g, S, t) {
  const kind = S.shield;
  if (!kind) return;
  const x = g.bx + g.brx + 3.2 + P.arm * 3.2, y = g.by - 0.6;
  const base = kind === 'cushion' ? mix(PAL.magenta, PAL.violet, 0.55) : kind === 'lid' ? F.steel : mix(ROLE_COLOR.tank, PAL.ink, 0.15);
  const h = kind === 'cushion' ? 7.4 : 8.2, w = kind === 'cushion' ? 3.6 : 2.7;
  const part = mkPart((cc, ox, oy) => {
    cc.moveTo(x + ox, y - h + oy); cc.quadraticCurveTo(x + w * 1.6 + ox, y - h * 0.5 + oy, x + w * 1.2 + ox, y + oy);
    cc.quadraticCurveTo(x + w * 1.6 + ox, y + h * 0.5 + oy, x + ox, y + h + oy);
    cc.quadraticCurveTo(x - w * 1.2 + ox, y + h * 0.5 + oy, x - w + ox, y + oy);
    cc.quadraticCurveTo(x - w * 1.2 + ox, y - h * 0.5 + oy, x + ox, y - h + oy); cc.closePath();
  }, x, y, w * 1.4, h);
  OL = 1.1;
  paintPart(c, part, base, { hot: true });
  c.save(); c.beginPath(); part.path(c, 0, 0); c.clip();
  if (kind === 'round') {
    c.fillStyle = F.cream; c.beginPath(); poly(c, [x - 0.2, y - 3.6, x + 2.6, y + 1.6, x - 2.2, y + 1.6]); c.fill();
    c.fillStyle = base; for (let i = 0; i < 3; i++) { c.beginPath(); ell(c, x - 0.6 + i * 0.8, y - 0.2 + (i % 2) * 0.8, 0.28, 0.28); c.fill(); }
  } else if (kind === 'lid') {
    c.strokeStyle = PAL.bone; c.lineWidth = 0.6; for (let i = 1; i <= 2; i++) { c.beginPath(); ell(c, x + 0.3, y, w * 0.5 * i, h * 0.3 * i); c.stroke(); }
    c.fillStyle = PAL.bone; c.beginPath(); ell(c, x + 0.4, y - h + 1.6, 0.9, 1.4); c.fill();
  } else {
    c.strokeStyle = shade(base, -0.45); c.lineWidth = 0.6; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x - w, y + i * 3); c.lineTo(x + w * 1.4, y + i * 3 + 0.6); c.stroke(); }
    c.fillStyle = PAL.bone; c.beginPath(); ell(c, x, y, 0.8, 0.8); c.fill();
  }
  c.restore();
  if (P.arm > 0.4) bloom(c, x + 2, y, 7, PAL.cyan, 0.5 * P.arm);
}
function clawSlash(c, g, col) {
  const x = g.hx + g.hrx + 2.5, y = g.by - 5;
  const a = P.arm;
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const ox = i * 2.1;
    c.beginPath(); c.moveTo(x + ox - 1.5, y - 6); c.quadraticCurveTo(x + ox + 7, y - 1, x + ox - 2.5, y + 7);
    c.strokeStyle = rgba(col, 0.55 * a); c.lineWidth = 3.4; c.stroke();
    c.strokeStyle = rgba(PAL.bone, a); c.lineWidth = 1; c.stroke();
  }
  c.restore();
}
function sparkle(c, x, y, r, col, a) {
  if (a <= 0.02) return;
  bloom(c, x, y, r * 2.4, col, 0.6 * a);
  const pa = c.globalAlpha; c.globalAlpha = pa * a;
  c.beginPath(); starPath(c, x, y, r, 4, 0.22); c.fillStyle = PAL.bone; c.fill();
  c.globalAlpha = pa;
}
function runeRing(c, rc, t, a) {
  if (a <= 0.02) return;
  c.save(); c.globalAlpha *= a;
  c.strokeStyle = rgba(rc, 0.9); c.lineWidth = 0.8;
  c.beginPath(); ell(c, 0, 0.6, 15, 4.2); c.stroke();
  c.beginPath(); ell(c, 0, 0.6, 10, 2.8); c.stroke();
  const prevOp = c.globalCompositeOperation; c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const an = t * 1.6 + (i * TAU) / 8;
    c.fillStyle = rgba(i % 2 ? PAL.bone : rc, 0.9);
    c.beginPath(); ell(c, Math.cos(an) * 12.5, 0.6 + Math.sin(an) * 3.5, 0.8, 0.8); c.fill();
  }
  c.globalCompositeOperation = prevOp;
  bloom(c, 0, 0, 16, rc, 0.4);
  c.restore();
}

/** Cat-specific animated props. */
function drawCatProps(c, g, S, id, t, ph, front) {
  if (front) {
    if (g.role === 'archer') bowDraw(c, g, S, S.bow || 'short', t);
    if (g.role === 'tank') shieldDraw(c, g, S, t);
    if (g.role === 'mage') orbDraw(c, g, S, t, ph, false);
    if (g.role === 'brawler' && P.arm > 0.25) clawSlash(c, g, ROLE_COLOR.brawler);
    switch (id) {
      case 'ember_mog': {
        for (let i = 0; i < 3; i++) flame(c, g.bx - 4 + i * 4.5, g.by - g.bry + 0.5, 2.1 + hash(i) * 0.7, t, i * 3.1, PAL.magenta, ORANGE);
        flame(c, g.hx + 1, g.top + 0.6, 1.5, t, 7, PAL.magenta, ORANGE);
        break;
      }
      case 'storm_whisker': crackle(c, g.hx + 1.2 + g.hrx * 0.9, g.hy + g.hry * 0.5, t, g.seed, PAL.cyan, 2, 6); crackle(c, g.hx + 1.2 - g.hrx * 0.9, g.hy + g.hry * 0.5, t, g.seed + 9, PAL.cyan, 2, 6); break;
      case 'spark_kit': crackle(c, g.hx + 1, g.top + 1, t, g.seed, PAL.cyan, 2, 6); break;
      case 'tuxedo_tempest': crackle(c, g.hx + 1.3 + g.hrx * 0.42, g.hy + g.hry * 0.1, t, g.seed, PAL.cyan, 2, 7); break;
      case 'empress_whiskerwind': {
        crackle(c, g.hx + 1, g.hy, t, g.seed, PAL.cyan, 3, 14);
        const prevOp = c.globalCompositeOperation; c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          c.strokeStyle = rgba(i === 1 ? PAL.magenta : PAL.cyan, 0.5); c.lineWidth = 0.9;
          c.beginPath(); c.ellipse(g.bx, g.by - 3, 15 - i * 2.4, 4.2, 0, t * 3 + i * 2, t * 3 + i * 2 + 2.2); c.stroke();
        }
        c.globalCompositeOperation = prevOp;
        break;
      }
      case 'fizz_mog': {
        for (let i = 0; i < 5; i++) {
          const k = frac(t * 0.55 + i * 0.2 + ph);
          sparkleBubble(c, g.hx + 1 + Math.sin(k * 7 + i) * 4, g.top - 6 - k * 14, 0.8 + (i % 3) * 0.35, 1 - k);
        }
        break;
      }
      case 'moonbeam_medic': {
        for (let i = 0; i < 2; i++) {
          const k = frac(t * 0.4 + i * 0.5 + ph), x = g.hx + 6 + Math.sin(k * 5 + i * 2) * 3, y = g.top - 2 - k * 12, al = Math.sin(k * Math.PI);
          const pa = c.globalAlpha; c.globalAlpha = pa * al;
          c.fillStyle = PAL.lime; c.beginPath(); ell(c, x, y, 1.1, 0.8, -0.4); c.fill();
          c.strokeStyle = PAL.lime; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x + 0.9, y - 0.2); c.lineTo(x + 0.9, y - 4); c.lineTo(x + 2.4, y - 3.2); c.stroke();
          c.globalAlpha = pa;
        }
        break;
      }
      case 'hex_hisser': {
        const x = g.hx + g.hrx + 6, y = g.top - 4 + Math.sin(t * 2) * 1.2, r = 3.4;
        bloom(c, x, y, r * 3, PAL.magenta, 0.5);
        c.save(); c.translate(x, y); c.rotate(t * 1.4); c.beginPath();
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        c.closePath(); c.strokeStyle = PAL.magenta; c.lineWidth = 0.9; c.stroke();
        c.beginPath(); poly(c, [0, -r * 0.6, r * 0.55, r * 0.35, -r * 0.55, r * 0.35]); c.strokeStyle = PAL.bone; c.lineWidth = 0.6; c.stroke();
        c.restore();
        break;
      }
      case 'gizmo_gato': {
        const x = g.bx + g.brx + 6.5, y = -1.2, wob = Math.sin(t * 9) * 0.25;
        c.beginPath(); ell(c, x, y - 1.5, 3, 1.9, wob); inked(c, F.tan, 0.6);
        c.beginPath(); ell(c, x + 2.8, y - 1.9, 1.3, 1.2); inked(c, F.tan, 0.6);
        c.beginPath(); c.arc(x - 1.5, y - 3.8, 1, 0, TAU); c.strokeStyle = PAL.cyan; c.lineWidth = 0.6; c.stroke();
        c.save(); c.translate(x - 0.6, y - 3.6); c.rotate(t * 5); c.strokeStyle = PAL.boneDim; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-1.6, 0); c.lineTo(1.6, 0); c.stroke(); c.restore();
        c.fillStyle = PAL.magenta; c.beginPath(); ell(c, x + 3.4, y - 2.1, 0.35, 0.35); c.fill();
        break;
      }
      case 'tripwire_tabitha': {
        const x = g.bx + g.brx + 3, y = -1.4;
        c.strokeStyle = rgba(PAL.cyan, 0.8); c.lineWidth = 0.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 12, y); c.stroke();
        const on = Math.sin(t * 6) > 0;
        c.fillStyle = on ? PAL.magenta : PAL.magentaDeep; c.beginPath(); ell(c, x + 12, y, 0.9, 0.9); c.fill();
        if (on) bloom(c, x + 12, y, 4, PAL.magenta, 0.7);
        break;
      }
      case 'bell_kitten': {
        for (let i = 0; i < 3; i++) { const k = frac(t * 0.7 + i / 3 + ph); sparkle(c, g.hx + 1 + (i - 1) * 6, g.hy + g.hry * 0.5 + 3 - k * 3, 0.9, PAL.cyan, Math.sin(k * Math.PI)); }
        break;
      }
      case 'big_mama_maine': break;
      default: break;
    }
  } else {
    // behind the body
    if (g.role === 'mage') orbDraw(c, g, S, t, ph, true);
    if (id === 'whisker_scout' || id === 'nyx_longshot') {
      // trailing scarf / hood tails
      const x0 = g.hx - g.hrx * 0.5, y0 = g.hy + g.hry * 0.95;
      const col = id === 'nyx_longshot' ? mix(PAL.violet, PAL.ink, 0.3) : PAL.cyanDeep;
      c.lineCap = 'round'; c.lineJoin = 'round';
      const pts = [];
      for (let i = 0; i <= 5; i++) pts.push(x0 - i * 3.2, y0 + 1.5 + Math.sin(t * 5 - i * 0.9 + ph * 3) * (0.5 + i * 0.28) + i * 0.3);
      for (let pass = 0; pass < 2; pass++) {
        c.strokeStyle = pass ? col : INK;
        for (let i = 0; i < 5; i++) { c.lineWidth = (pass ? 2.6 - i * 0.35 : 4.6 - i * 0.35); c.beginPath(); c.moveTo(pts[i * 2], pts[i * 2 + 1]); c.lineTo(pts[i * 2 + 2], pts[i * 2 + 3]); c.stroke(); }
      }
    }
  }
}
function sparkleBubble(c, x, y, r, a) {
  const pa = c.globalAlpha; c.globalAlpha = pa * clamp(a, 0, 1) * 0.9;
  c.beginPath(); ell(c, x, y, r, r); c.strokeStyle = PAL.bone; c.lineWidth = 0.5; c.stroke();
  c.fillStyle = rgba(PAL.bone, 0.18); c.fill();
  c.globalAlpha = pa;
}

function drawStarsRow(c, n, cx, y, r, col) {
  const gap = r * 2.5;
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * gap;
    c.beginPath(); starPath(c, x, y, r); c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = r * 0.7; c.stroke();
    c.fillStyle = col; c.fill();
  }
}
/** Star pips (merge level). Bone fill with a cyan bloom: never gold. */
export function drawStarPips(ctx, stars, cx, y, size, t = 0) {
  const n = clamp(Math.round(fin(stars, 0)), 0, 5);
  if (!n) return;
  const r = Math.max(1.5, size * 0.06);
  ctx.save();
  bloom(ctx, cx, y, r * (n * 1.7 + 1), PAL.cyan, 0.25);
  drawStarsRow(ctx, n, cx, y, r, PAL.bone);
  ctx.restore();
}

// ---------- drawCat ----------
/**
 * Draw one cat. (x,y) is the feet centre; size is the nominal height in px.
 * o = {t, level, stars, anim, animT, facing, hitFlash, shield, tint}
 * idle, walk and sleep loop on o.t; attack, cast, hit and die are driven by o.animT (0..1).
 */
export function drawCat(ctx, catId, x, y, size, o) {
  o = o || {};
  size = fin(size, 32);
  if (!(size > 0)) return;
  const g = geomFor(catId);
  const S = g.S;
  const t = fin(o.t, 0);
  const anim = o.anim || 'idle';
  const animT = clamp(fin(o.animT, 0), 0, 1);
  const facing = o.facing < 0 ? -1 : 1;
  const stars = clamp(Math.round(fin(o.stars, 1)), 1, 5);
  const u = (size / 32) * g.scale * (1 + 0.05 * (stars - 1));
  const ph = g.ph;
  const rid = g.rarity, rar = RARITY[rid];
  computePose(anim, animT, t, ph, g, o.hitFlash);
  const c = ctx;
  c.save();
  c.translate(fin(x), fin(y));
  c.scale(u * facing, u);
  const need = ctxScale(ctx) * u;
  const core = getCore(catId, need);
  OL = Math.max(1.1, 1.5 / (core ? core.b : need));
  const rc = ROLE_COLOR[g.role];
  const dying = anim === 'die';
  const lod = o.lod > 0 ? 1 : 0;   // crowd level of detail (set by the battle screen): no auras, sparkles, mouth or role ring

  // ground: shadow and role ring (never moves with the pose)
  const fade = P.alpha;
  const gA = c.globalAlpha;
  c.globalAlpha = gA * fade;
  const rw = g.brx * 1.5 + 2.5;
  c.beginPath(); ell(c, 0, 0.6, rw, 2.8); c.fillStyle = rgba(PAL.ink, 0.55); c.fill();
  if (!lod) { c.beginPath(); ell(c, 0, 0.6, rw + 1.4, 3.5); c.strokeStyle = rgba(rc, 0.28); c.lineWidth = 0.8; c.stroke(); }

  // auras behind the cat
  if (lod) { /* skipped */ } else if (rar.order >= 3 && !dying) {
    const col = rid === 'mythic' ? prism(t, 0.3) : rar.color;
    bloom(c, 0, -15, 24, col, rar.glowAlpha * 0.55);
  } else if (rar.order === 2 && !dying) bloom(c, 0, -15, 18, rar.color, 0.16 + 0.06 * Math.sin(t * 3 + ph * 6));
  if (stars >= 2 && !lod) bloom(c, 0, -14, 20, PAL.cyan, 0.08 * stars);
  if (P.cast > 0) runeRing(c, rc, t, P.cast);
  if (anim === 'sleep') runeRing(c, rc, t, 0.0);

  // posed transform: lean, squash and stretch about the feet
  c.translate(P.dx, P.dy);
  c.rotate(P.rot);
  c.scale(P.sx, P.sy);
  const fl = P.flashCol, fa = P.flash;

  // mythic afterimage
  if (rid === 'mythic' && !dying && core && !lod) {
    c.save();
    for (let i = 2; i >= 1; i--) { c.translate(-2.4, 0); blitCore(c, catId, core, 0.14 / i * 1.4, null); }
    c.restore();
  }
  c.globalAlpha = gA * fade * (S.fade ? 1 : 1);

  drawCatProps(c, g, S, catId, t, ph, false);
  // tails
  const tipCol = mix(S.fur, rc, 0.7);
  const ring = rar.order >= 1 ? (rid === 'mythic' ? prism(t, 0.4) : rar.color) : null;
  const furC = S.pat === 'points' ? S.f2 : S.fur;
  let tcol = fl ? mix(furC, fl, fa) : furC;
  if (S.tails === 9) {
    for (let i = 0; i < 9; i += (lod ? 4 : 1)) {   // crowd level of detail: tails 0, 4 and 8 only
      const off = (i - 4) * 0.2;
      const cc = prism(t * 0.5 + i * 0.11, 0.4);
      drawTail(c, g, S, t + i * 0.37, ph, tcol, off, 0.85 + 0.12 * Math.cos((i - 4) * 0.5), 0.55, mix(furC, cc, 0.7), null, null);
    }
  } else {
    drawTail(c, g, S, t, ph, tcol, 0, S.tailLen || 1, 1, fl ? mix(tipCol, fl, fa) : tipCol, ring, S.pat === 'tabby' ? S.f2 : null);
    if (g.S === SPEC.ember_mog) flame(c, TX[7], TY[7], 2.4, t, 3, PAL.magenta, ORANGE);
  }
  if (!S.fade) drawLegs(c, g, S, fl, fa);

  // the baked core
  blitCore(c, catId, core, 1, null);
  if (fl && core) blitCore(c, catId, core, fa, fl);
  if (o.tint && core) blitCore(c, catId, core, 0.38, o.tint);

  // ear flick: draw darker tips back when hit is handled by dropping glow only (cheap)
  drawFace(c, g, S, t, ph, P.glowMul * (1 + fin(o.level, 1) * 0.004));
  if (!lod) drawMouth(c, g, S, t);

  drawCatProps(c, g, S, catId, t, ph, true);

  // heart / bolt glows on the chest pulse
  if (S.acc.indexOf('heartmark') >= 0 && !lod) bloom(c, g.bx + g.brx * 0.5, g.by + 0.4, 6, PAL.lime, 0.25 + 0.15 * Math.sin(t * 3 + ph * 6));

  // rarity live ornaments
  if (!dying && !lod) {
    if (rid === 'epic') {
      for (let i = 0; i < 3; i++) { const k = frac(t * 0.5 + i / 3 + ph); sparkle(c, -6 + i * 7 + Math.sin(k * 6 + i) * 2, -4 - k * 22, 0.9, rar.color, Math.sin(k * Math.PI)); }
    } else if (rid === 'legend' || rid === 'mythic') {
      const n = rid === 'mythic' ? 7 : 6;
      const hy = g.top - (S.hat ? 12 : 4);
      for (let i = 0; i < n; i++) {
        const a = t * (rid === 'mythic' ? 1.6 : 1.1) + (i * TAU) / n;
        const mx = g.hx + 1 + Math.cos(a) * 11.5, my = hy + Math.sin(a) * 2.8;
        const col = rid === 'mythic' ? prism(t * 0.4 + i / n, 0.5) : RARITY.legend.ramp[4];
        sparkle(c, mx, my, 0.75 + 0.3 * Math.sin(a * 2), col, Math.sin(a) > 0 ? 1 : 0.55);
      }
    }
    if (rid === 'mythic') {
      const hy = g.top - (S.hat ? 12 : 5);
      c.save(); c.lineWidth = 1.2; c.strokeStyle = prism(t, 0.35);
      c.beginPath(); ell(c, g.hx + 1, hy, 8.5, 2.4); c.stroke();
      c.strokeStyle = rgba(PAL.bone, 0.8); c.lineWidth = 0.4; c.stroke();
      c.restore();
      bloom(c, g.hx + 1, hy, 12, prism(t, 0.35), 0.45);
      for (let i = 0; i < 3; i++) {
        const a = -t * 1.3 + (i * TAU) / 3;
        c.beginPath(); starPath(c, Math.cos(a) * 15, -15 + Math.sin(a) * 6, 1.5, 5, 0.45); c.fillStyle = prism(t * 0.5 + i * 0.3, 0.4); c.fill();
      }
    }
    if (g.S === SPEC.mother_of_nine_lives) {
      const hy = g.top - 5;
      c.save(); c.lineWidth = 1.3; c.strokeStyle = PAL.cyan; c.beginPath(); ell(c, g.hx + 1, hy, 7, 2); c.stroke(); c.restore();
    }
  }
  if (anim === 'sleep') {
    for (let i = 0; i < 3; i++) {
      const k = frac(t * 0.3 + i / 3), zx = g.hx + 6 + k * 8, zy = g.top - 2 - k * 12, zs = 1.4 + k * 1.2;
      const pa = c.globalAlpha; c.globalAlpha = pa * Math.sin(k * Math.PI);
      c.strokeStyle = PAL.bone; c.lineWidth = 0.9; c.lineJoin = 'miter';
      c.beginPath(); c.moveTo(zx - zs, zy - zs); c.lineTo(zx + zs, zy - zs); c.lineTo(zx - zs, zy + zs); c.lineTo(zx + zs, zy + zs); c.stroke();
      c.globalAlpha = pa;
    }
  }
  if (o.shield) {
    const sa = typeof o.shield === 'number' ? clamp(o.shield, 0.2, 1) : 1;
    const pa = c.globalAlpha;
    c.globalAlpha = pa * sa;
    c.beginPath(); ell(c, 0, -15, 16, 19); c.fillStyle = rgba(PAL.cyan, 0.1); c.fill();
    c.lineWidth = 1.2; c.strokeStyle = rgba(PAL.cyan, 0.7); c.stroke();
    c.lineWidth = 0.5; c.strokeStyle = rgba(PAL.bone, 0.8); c.beginPath(); c.ellipse(0, -15, 16, 19, 0, -2.4 + Math.sin(t * 2), -1.6 + Math.sin(t * 2)); c.stroke();
    c.globalAlpha = pa;
  }
  c.restore();

  // star pips below the feet (screen space, not squashed)
  if (stars > 1 || o.showStars) {
    c.save(); c.translate(fin(x), fin(y)); c.scale(facing < 0 ? 1 : 1, 1);
    const pa = c.globalAlpha;
    c.globalAlpha = pa * fade;
    drawStarPips(c, stars, 0, 4 + size * 0.06, size, t);
    c.globalAlpha = pa;
    c.restore();
  }
}

// ---------- ornaments (UI helpers, all take (ctx, x, y, size, color, t)) ----------
function chamferPath(c, x, y, w, h, ch) {
  ch = Math.max(0, Math.min(ch, w / 2, h / 2));
  c.moveTo(x + ch, y); c.lineTo(x + w - ch, y); c.lineTo(x + w, y + ch); c.lineTo(x + w, y + h - ch);
  c.lineTo(x + w - ch, y + h); c.lineTo(x + ch, y + h); c.lineTo(x, y + h - ch); c.lineTo(x, y + ch); c.closePath();
}
function neonStroke(c, col, w) {
  const po = c.globalCompositeOperation;
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = rgba(col, 0.12); c.lineWidth = w * 4.2; c.stroke();
  c.strokeStyle = rgba(col, 0.3); c.lineWidth = w * 2.1; c.stroke();
  c.globalCompositeOperation = po;
  c.strokeStyle = col; c.lineWidth = w; c.stroke();
}
/** Diamond stud with ink rim and a bone catch-light. */
export function cornerStud(ctx, x, y, size, color, t = 0) {
  const r = Math.max(1, size);
  ctx.save();
  ctx.beginPath(); diamond(ctx, x, y, r);
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = r * 0.5; ctx.stroke();
  ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = rgba(PAL.bone, 0.85); ctx.beginPath(); diamond(ctx, x - r * 0.18, y - r * 0.22, r * 0.34); ctx.fill();
  ctx.restore();
}
/** Mirrored quadratic-spiral curls ending in a dot. dirX/dirY point into the card from the corner. */
export function filigreeCorner(ctx, x, y, size, color, t = 0, dirX = 1, dirY = 1) {
  const s = Math.max(2, size);
  ctx.save();
  ctx.translate(x, y); ctx.scale(dirX < 0 ? -1 : 1, dirY < 0 ? -1 : 1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let m = 0; m < 2; m++) {
    ctx.save();
    if (m) ctx.transform(0, 1, 1, 0, 0, 0);
    const N = 14, cx0 = s * 1.2, cy0 = s * 1.2;
    let ex = 0, ey = 0;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const k = i / N, ang = 3.5 + k * 5.0, rad = s * (1.0 - 0.72 * k);
      ex = cx0 + Math.cos(ang) * rad; ey = cy0 + Math.sin(ang) * rad;
      if (i) ctx.lineTo(ex, ey); else ctx.moveTo(ex, ey);
    }
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, s * 0.2) + 2; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, s * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, Math.max(1, s * 0.17), 0, TAU); ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
/** Crown spikes along a top edge starting at (x,y) of width w (spikes rise above y). */
export function crownEdge(ctx, x, y, w, size, color, t = 0) {
  const n = 5, s = Math.max(2, size);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y + 0.5);
  for (let i = 0; i < n; i++) {
    const cx = x + ((i + 0.5) / n) * w, mid = i === 2;
    ctx.lineTo(x + (i / n) * w + w / n * 0.2, y - s * 0.25);
    ctx.lineTo(cx, y - s * (mid ? 1.5 : 1.0));
    ctx.lineTo(x + ((i + 1) / n) * w - w / n * 0.2, y - s * 0.25);
  }
  ctx.lineTo(x + w, y + 0.5); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, s * 0.3); ctx.stroke();
  ctx.fillStyle = color; ctx.fill();
  for (let i = 0; i < n; i++) {
    const cx = x + ((i + 0.5) / n) * w, mid = i === 2;
    ctx.beginPath(); ctx.arc(cx, y - s * (mid ? 1.5 : 1.0) - s * 0.12, s * (mid ? 0.2 : 0.14), 0, TAU);
    ctx.fillStyle = mid ? PAL.magenta : PAL.bone; ctx.fill();
  }
  ctx.restore();
}
/** Rotating dashed halo ring with ticks and two orbiting stars. */
export function haloRing(ctx, x, y, size, color, t = 0) {
  const r = Math.max(2, size);
  ctx.save(); ctx.translate(x, y);
  const po = ctx.globalCompositeOperation;
  ctx.rotate(t * 0.35);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.setLineDash && ctx.setLineDash([r * 0.18, r * 0.07]);
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(color, 0.22); ctx.lineWidth = Math.max(3, r * 0.06); ctx.stroke();
  ctx.globalCompositeOperation = po;
  ctx.strokeStyle = rgba(color, 0.9); ctx.lineWidth = Math.max(1, r * 0.018); ctx.stroke();
  ctx.setLineDash && ctx.setLineDash([]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94); ctx.lineTo(Math.cos(a) * r * 1.06, Math.sin(a) * r * 1.06);
    ctx.strokeStyle = rgba(PAL.bone, 0.7); ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.rotate(-t * 0.7);
  for (let i = 0; i < 2; i++) { const a = i * Math.PI; ctx.beginPath(); starPath(ctx, Math.cos(a) * r * 1.04, Math.sin(a) * r * 1.04, Math.max(2, r * 0.07), 4, 0.35); ctx.fillStyle = PAL.bone; ctx.fill(); }
  ctx.restore();
}

function perimPoint(x, y, w, h, k) {
  const per = 2 * (w + h);
  let d = ((k % 1) + 1) % 1 * per;
  if (d < w) return [x + d, y];
  d -= w; if (d < h) return [x + w, y + d];
  d -= h; if (d < w) return [x + w - d, y + h];
  d -= w; return [x, y + h - d];
}

/**
 * Rarity frame around a card or portrait. (x,y) top-left. o = {layer:'all'|'back'|'front', alpha, chamfer}.
 * Mythic draws a halo behind the art on the 'back' layer; legend crown spikes rise above y.
 */
export function drawRarityFrame(ctx, rarityId, x, y, w, h, t, o) {
  o = o || {};
  const rid = RARITY[rarityId] ? rarityId : 'common';
  const rar = RARITY[rid];
  x = fin(x); y = fin(y); w = Math.max(4, fin(w, 10)); h = Math.max(4, fin(h, 10)); t = fin(t, 0);
  const layer = o.layer || 'all';
  const sc = clamp(Math.min(w, h) / 110, 0.6, 2.6);
  const ch = o.chamfer != null ? o.chamfer : 6 * Math.max(1, sc * 0.9);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.save();
  ctx.globalAlpha *= o.alpha != null ? clamp(o.alpha, 0, 1) : 1;
  const col = rid === 'mythic' ? prism(t, 0.35) : rar.color;
  if ((layer === 'all' || layer === 'back') && rar.order >= 1) {
    if (rid === 'mythic') {
      haloRing(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 0.64, col, t);
      bloom(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 0.8, col, 0.28);
    } else {
      const a = rar.glowAlpha * (rid === 'epic' ? 0.5 + 0.5 * pulse : 1);
      bloom(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 0.72, col, a * 0.45);
    }
  }
  if (layer === 'all' || layer === 'front') {
    ctx.lineJoin = 'round';
    // base frame
    ctx.beginPath(); chamferPath(ctx, x, y, w, h, ch);
    if (rid === 'common') {
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = rar.color; ctx.lineWidth = 2; ctx.stroke();
    } else if (rid === 'mythic') {
      ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
      // eight prism segments around the perimeter
      for (let i = 0; i < 8; i++) {
        const a = perimPoint(x, y, w, h, i / 8), b = perimPoint(x, y, w, h, (i + 1) / 8);
        const c1 = prism(t + i / 8 * 0.9, 0.35);
        ctx.beginPath();
        // corners: walk via the chamfer path would be exact; approximate with straight segment through corner when needed
        ctx.moveTo(a[0], a[1]);
        const per = 2 * (w + h), da = (i / 8) * per, db = ((i + 1) / 8) * per;
        const corners = [w, w + h, 2 * w + h];
        const cornerPts = [[x + w, y], [x + w, y + h], [x, y + h]];
        for (let k = 0; k < 3; k++) if (corners[k] > da && corners[k] < db) ctx.lineTo(cornerPts[k][0], cornerPts[k][1]);
        if (i === 7) ctx.lineTo(x, y);
        ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = c1; ctx.lineWidth = 2.6; ctx.stroke();
      }
      ctx.beginPath(); chamferPath(ctx, x + 4, y + 4, w - 8, h - 8, Math.max(2, ch - 3));
      ctx.strokeStyle = rgba(PAL.bone, 0.55); ctx.lineWidth = 1; ctx.stroke();
    } else if (rid === 'legend') {
      ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
      neonStroke(ctx, col, 2.2);
      ctx.beginPath(); chamferPath(ctx, x + 4.5, y + 4.5, w - 9, h - 9, Math.max(2, ch - 3));
      ctx.strokeStyle = rar.ramp[1]; ctx.lineWidth = 1.2; ctx.stroke();
    } else {
      ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
      neonStroke(ctx, col, rid === 'epic' ? 2.2 : 2);
    }
    // inner hairline
    if (rid !== 'mythic') {
      ctx.beginPath(); chamferPath(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(2, ch - 2));
      ctx.strokeStyle = rgba(PAL.bone, 0.08); ctx.lineWidth = 1; ctx.stroke();
    }
    // ornaments
    const s = 5 * sc;
    if (rid === 'rare') {
      cornerStud(ctx, x + ch * 0.3, y + ch * 0.3, s * 0.7, col, t); cornerStud(ctx, x + w - ch * 0.3, y + ch * 0.3, s * 0.7, col, t);
      cornerStud(ctx, x + ch * 0.3, y + h - ch * 0.3, s * 0.7, col, t); cornerStud(ctx, x + w - ch * 0.3, y + h - ch * 0.3, s * 0.7, col, t);
    } else if (rid === 'epic') {
      filigreeCorner(ctx, x + 2, y + 2, s * 1.1, col, t, 1, 1); filigreeCorner(ctx, x + w - 2, y + 2, s * 1.1, col, t, -1, 1);
      filigreeCorner(ctx, x + 2, y + h - 2, s * 1.1, col, t, 1, -1); filigreeCorner(ctx, x + w - 2, y + h - 2, s * 1.1, col, t, -1, -1);
      for (let i = 0; i < 4; i++) {
        const mx = i < 2 ? x + w / 2 : (i === 2 ? x : x + w), my = i < 2 ? (i ? y + h : y) : y + h / 2;
        cornerStud(ctx, mx, my, s * 0.55, col, t);
      }
    } else if (rid === 'legend') {
      crownEdge(ctx, x + w * 0.2, y, w * 0.6, s * 1.5, col, t);
      cornerStud(ctx, x + 1, y + h - 1, s * 0.6, col, t); cornerStud(ctx, x + w - 1, y + h - 1, s * 0.6, col, t);
      for (let i = 0; i < 5; i++) {
        const k = frac(t * 0.22 + i * 0.2), p = perimPoint(x, y, w, h, k + i * 0.2);
        const tw = Math.sin(frac(t * 0.9 + i * 0.37) * Math.PI);
        sparkle(ctx, p[0], p[1], 1.4 * sc, RARITY.legend.ramp[4], tw);
      }
    } else if (rid === 'mythic') {
      for (let i = 0; i < 4; i++) {
        const p = perimPoint(x, y, w, h, t * 0.08 + i * 0.25);
        ctx.beginPath(); starPath(ctx, p[0], p[1], 3.2 * sc, 5, 0.45); ctx.fillStyle = prism(t * 0.6 + i * 0.25, 0.4); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fill();
        bloom(ctx, p[0], p[1], 8 * sc, prism(t * 0.6 + i * 0.25, 0.4), 0.5);
      }
      cornerStud(ctx, x + 2, y + 2, s * 0.8, col, t); cornerStud(ctx, x + w - 2, y + 2, s * 0.8, col, t);
      cornerStud(ctx, x + 2, y + h - 2, s * 0.8, col, t); cornerStud(ctx, x + w - 2, y + h - 2, s * 0.8, col, t);
      // lens flare cross at the top left corner
      const fx = x + ch, fy = y + ch, fl = 14 * sc * (0.75 + 0.25 * Math.sin(t * 2.4));
      const po = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(PAL.bone, 0.85); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(fx - fl, fy); ctx.lineTo(fx + fl, fy); ctx.moveTo(fx, fy - fl); ctx.lineTo(fx, fy + fl); ctx.stroke();
      ctx.globalCompositeOperation = po;
      bloom(ctx, fx, fy, fl * 0.8, PAL.bone, 0.7);
    }
  }
  ctx.restore();
}

// ---------- card backdrops (baked once per kind, rarity, size) ----------
const CARD_BG = new Map();
function kindColors(kind, tint) {
  if (kind === 'spell') return [PAL.ink2, mix(PAL.violet, PAL.magenta, 0.4), PAL.cyan];
  if (kind === 'trap') return [PAL.ink2, mix(PAL.magentaDeep, PAL.ink, 0.45), PAL.magenta];
  if (kind === 'build') return [PAL.ink3, mix(PAL.violet, PAL.ink, 0.15), PAL.cyan];
  return [PAL.ink2, mix(tint || PAL.violet, PAL.ink, 0.68), tint || PAL.cyan];
}
function paintBackdrop(c, w, h, kind, rid, tint, seed) {
  const [top, bot, acc] = kindColors(kind, tint);
  const rar = RARITY[rid];
  const ch = Math.max(5, Math.min(w, h) * 0.05);
  c.save();
  c.beginPath(); chamferPath(c, 0, 0, w, h, ch); c.clip();
  const gr = c.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top); gr.addColorStop(1, bot);
  c.fillStyle = gr; c.fillRect(0, 0, w, h);
  const cx = w * 0.5, cy = h * 0.6;
  // rays
  const rays = rar.order >= 1 ? 14 : 8;
  c.globalAlpha = 0.07 + rar.order * 0.012;
  c.fillStyle = rar.order >= 1 ? rar.color : acc;
  if (rid === 'mythic') c.fillStyle = PAL.bone;
  const R = Math.hypot(w, h);
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * TAU, a1 = a0 + (TAU / rays) * 0.5;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); c.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); c.closePath(); c.fill();
  }
  c.globalAlpha = 1;
  const rg = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
  rg.addColorStop(0, rgba(acc, 0.38)); rg.addColorStop(0.5, rgba(acc, 0.1)); rg.addColorStop(1, rgba(acc, 0));
  c.fillStyle = rg; c.fillRect(0, 0, w, h);
  // distant city
  if (kind !== 'spell') {
    let x = -4, i = 0;
    while (x < w) {
      const bw = 8 + hash(seed + i) * 14, bh = h * (0.12 + hash(seed + i + 40) * 0.22);
      c.fillStyle = rgba(PAL.ink, 0.55); c.fillRect(x, h * 0.72 - bh * 0.4, bw, h);
      for (let wy = 0; wy < bh * 0.8; wy += 5) for (let wx = 2; wx < bw - 2; wx += 4) {
        if (hash(seed + i * 31 + wy * 7 + wx) < 0.24) { c.fillStyle = rgba(hash(seed + wx + wy) > 0.5 ? PAL.magenta : PAL.cyan, 0.55); c.fillRect(x + wx, h * 0.72 - bh * 0.4 + wy + 3, 1.6, 1.6); }
      }
      x += bw + 1; i++;
    }
  }
  // stars for spells
  if (kind === 'spell') for (let i = 0; i < 22; i++) {
    c.fillStyle = rgba(PAL.bone, 0.2 + hash(seed + i * 5) * 0.5);
    c.fillRect(hash(seed + i * 3) * w, hash(seed + i * 7 + 1) * h * 0.8, 1.2, 1.2);
  }
  // halftone field bottom
  c.fillStyle = rgba(PAL.ink, 0.5);
  c.beginPath();
  const sp = 4.2;
  for (let yy = h * 0.55, row = 0; yy < h; yy += sp * 0.7, row++) {
    const k = (yy - h * 0.55) / (h * 0.45);
    for (let xx = (row % 2) * sp * 0.5; xx < w; xx += sp) { const r = 0.2 + k * 1.3; c.moveTo(xx + r, yy); c.arc(xx, yy, r, 0, TAU); }
  }
  c.fill();
  // scanlines
  c.fillStyle = rgba(PAL.bone, 0.045);
  for (let yy = 0; yy < h; yy += 3) c.fillRect(0, yy, w, 1);
  // vignette
  const vg = c.createRadialGradient(cx, h * 0.5, Math.min(w, h) * 0.35, cx, h * 0.5, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(11,7,22,0)'); vg.addColorStop(1, rgba(PAL.ink, 0.6));
  c.fillStyle = vg; c.fillRect(0, 0, w, h);
  c.restore();
  // inner edge glow
  c.save();
  c.beginPath(); chamferPath(c, 1, 1, w - 2, h - 2, ch); c.strokeStyle = rgba(rar.order >= 1 ? rar.color : acc, 0.55); c.lineWidth = 1.6; c.stroke();
  c.beginPath(); chamferPath(c, 3.2, 3.2, w - 6.4, h - 6.4, Math.max(2, ch - 2)); c.strokeStyle = rgba(PAL.bone, 0.08); c.lineWidth = 1; c.stroke();
  c.restore();
}
function drawBackdrop(ctx, x, y, w, h, kind, rid, tint, seed) {
  const sc = clamp(Math.ceil(ctxScale(ctx)), 1, 3);
  const key = kind + '|' + rid + '|' + tint + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + sc;
  let cv = CARD_BG.get(key);
  if (cv === undefined) {
    cv = makeCanvas(w * sc, h * sc);
    if (cv) { const bc = cv.getContext('2d'); bc.scale(sc, sc); paintBackdrop(bc, w, h, kind, rid, tint, seed); }
    CARD_BG.set(key, cv);
    if (CARD_BG.size > 120) CARD_BG.delete(CARD_BG.keys().next().value);
  }
  if (cv) ctx.drawImage(cv, x, y, w, h);
  else { ctx.save(); ctx.translate(x, y); paintBackdrop(ctx, w, h, kind, rid, tint, seed); ctx.restore(); }
}

// ---------- cat portrait ----------
function catExtentU(g) { return -(g.top - g.earH) + (g.S.hat ? 15 : 0) + (g.S.fade ? 0 : 0); }
function paintCatInWindow(ctx, catId, x, y, w, h, o, pop) {
  const g = geomFor(catId);
  const ext = catExtentU(g);
  let u = Math.min((h * (o.crop === 'bust' ? 1.5 : 0.9)) / ext, (w * (o.crop === 'bust' ? 1.1 : 0.9)) / 38);
  if (o.crop === 'bust') u = Math.min(u, h * 1.4 / ext);
  const size = (u * 32) / g.scale;
  const fy = o.crop === 'bust' ? y + h * 1.18 : y + h * 0.93;
  drawCat(ctx, catId, x + w * 0.46, fy, size, {
    t: o.t, level: o.level, stars: o.stars, anim: o.anim || 'idle', animT: o.animT, facing: o.facing || 1,
    hitFlash: o.hitFlash, shield: o.shield, tint: o.tint,
  });
}
/** Roster / detail portrait: role-tinted backdrop with the cat standing in it. (x,y) top-left. o.crop = 'bust' zooms in. */
export function drawCatPortrait(ctx, catId, x, y, w, h, o) {
  o = o || {};
  x = fin(x); y = fin(y); w = Math.max(4, fin(w, 40)); h = Math.max(4, fin(h, 40));
  const cat = CAT_BY_ID[catId];
  const role = cat ? cat.role : 'brawler', rid = cat ? cat.rarity : 'common';
  const tint = ROLE_COLOR[role];
  ctx.save();
  drawBackdrop(ctx, x, y, w, h, 'cat', rid, tint, strHash(catId));
  ctx.beginPath(); chamferPath(ctx, x, y, w, h, Math.max(5, Math.min(w, h) * 0.05)); ctx.clip();
  const t = fin(o.t, 0);
  if (RARITY[rid].order >= 3) bloom(ctx, x + w * 0.46, y + h * 0.58, Math.max(w, h) * 0.55, rid === 'mythic' ? prism(t, 0.3) : RARITY[rid].color, 0.3);
  // floor glow
  const fg = ctx.createLinearGradient(0, y + h * 0.86, 0, y + h);
  fg.addColorStop(0, rgba(tint, 0)); fg.addColorStop(1, rgba(tint, 0.32));
  ctx.fillStyle = fg; ctx.fillRect(x, y + h * 0.86, w, h * 0.14);
  paintCatInWindow(ctx, catId, x, y, w, h, o, false);
  ctx.restore();
}

// ---------- card glyph painters (normalised to a -50..50 square) ----------
function solid(c, fill, lw = 2, k = 1) {
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = lw * 2; c.stroke();
  c.fillStyle = fill; c.fill();
  c.save(); c.clip();
  c.translate(-2 * k, -2 * k); c.strokeStyle = rgba(shade(fill, -0.4), 0.9); c.lineWidth = 4 * k; c.stroke(); c.translate(2 * k, 2 * k);
  c.translate(1.6 * k, 1.6 * k); c.strokeStyle = rgba(PAL.cyan, 0.9); c.lineWidth = 2.2 * k; c.stroke(); c.translate(-1.6 * k, -1.6 * k);
  c.translate(0, -1.8 * k); c.strokeStyle = rgba(PAL.magenta, 0.45); c.lineWidth = 2 * k; c.stroke();
  c.restore();
}
function pawPrint(c, x, y, s, fill) {
  c.beginPath(); ell(c, x, y + s * 0.2, s * 0.55, s * 0.45);
  for (let i = 0; i < 4; i++) { const a = -2.5 + i * 0.55; ell(c, x + Math.cos(a) * s * 0.78, y - s * 0.35 + Math.sin(a) * s * 0.5 - (i === 1 || i === 2 ? s * 0.3 : 0), s * 0.2, s * 0.26); }
  solid(c, fill, 1.4);
}
function leafPath(c, x, y, len, wid, rot) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -wid, len, 0); c.quadraticCurveTo(len * 0.5, wid, 0, 0); c.closePath();
  solid(c, PAL.limeDeep, 1.4);
  c.beginPath(); c.moveTo(len * 0.1, 0); c.lineTo(len * 0.88, 0); c.strokeStyle = PAL.lime; c.lineWidth = 1; c.stroke();
  c.restore();
}
function moonPath(c, x, y, r, off) {
  c.beginPath(); c.arc(x, y, r, 0.5, TAU - 0.5); c.arc(x + off, y, r * 0.78, TAU - 0.9, 0.9, true); c.closePath();
}
function fishPath(c, x, y, len, hh, rot) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath(); c.moveTo(-len / 2, 0); c.quadraticCurveTo(-len * 0.1, -hh, len * 0.35, -hh * 0.2); c.lineTo(len * 0.55, -hh * 0.9); c.lineTo(len * 0.55, hh * 0.9); c.lineTo(len * 0.35, hh * 0.2); c.quadraticCurveTo(-len * 0.1, hh, -len / 2, 0); c.closePath();
  solid(c, PAL.boneDim, 1.4);
  c.fillStyle = INK; c.beginPath(); c.arc(-len * 0.3, -hh * 0.15, hh * 0.13, 0, TAU); c.fill();
  c.restore();
}
function catHeadGlyph(c, x, y, s, fill, eye) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.beginPath(); c.moveTo(-1, -0.2); c.lineTo(-1.05, -1.25); c.lineTo(-0.3, -0.8); c.quadraticCurveTo(0, -0.9, 0.3, -0.8); c.lineTo(1.05, -1.25); c.lineTo(1, -0.2);
  c.quadraticCurveTo(1.05, 0.9, 0, 0.95); c.quadraticCurveTo(-1.05, 0.9, -1, -0.2); c.closePath();
  solid(c, fill, 1.8 / s, 1 / s);
  if (eye) {
    for (const sx of [-0.45, 0.45]) { c.beginPath(); c.moveTo(sx - 0.28, -0.1); c.quadraticCurveTo(sx, -0.38, sx + 0.28, -0.1); c.quadraticCurveTo(sx, 0.18, sx - 0.28, -0.1); c.closePath(); c.fillStyle = eye; c.fill(); }
  }
  c.restore();
}
function ringBurst(c, x, y, r, col, a, w = 1.6) {
  c.save(); c.globalAlpha *= a; c.beginPath(); c.arc(x, y, r, 0, TAU); neonStroke(c, col, w); c.restore();
}
function chevrons(c, x, y, n, s, up, col) {
  for (let i = 0; i < n; i++) {
    const yy = y + (up ? -1 : 1) * i * s * 0.9;
    c.beginPath(); c.moveTo(x - s, yy + (up ? s * 0.5 : -s * 0.5)); c.lineTo(x, yy + (up ? -s * 0.3 : s * 0.3)); c.lineTo(x + s, yy + (up ? s * 0.5 : -s * 0.5));
    neonStroke(c, col, 3.2 - i * 0.5);
  }
}

const GLYPH = {
  nap(c, t, A) {
    moonPath(c, -4, 0, 33, 14); solid(c, PAL.bone, 2);
    c.save(); c.translate(6, 12); c.beginPath(); ell(c, 0, 0, 15, 9); c.moveTo(12, -6); c.lineTo(16, -15); c.lineTo(20, -5); solid(c, F.charcoal, 1.8);
    c.beginPath(); c.moveTo(-4, -1); c.quadraticCurveTo(0, 2, 4, -1); c.strokeStyle = PAL.lime; c.lineWidth = 1.2; c.stroke(); c.restore();
    for (let i = 0; i < 3; i++) { const k = frac(t * 0.4 + i / 3); c.save(); c.globalAlpha *= Math.sin(k * Math.PI); c.beginPath(); const zx = 22 + k * 10, zy = -4 - k * 22, zs = 3 + i; c.moveTo(zx - zs, zy - zs); c.lineTo(zx + zs, zy - zs); c.lineTo(zx - zs, zy + zs); c.lineTo(zx + zs, zy + zs); neonStroke(c, PAL.cyan, 1.6); c.restore(); }
    c.beginPath(); heartPath(c, -22, -26, 6); solid(c, PAL.lime, 1.4);
  },
  flick(c, t, A) {
    c.beginPath(); c.moveTo(-34, 22); c.bezierCurveTo(-30, -26, 14, -34, 30, -8); c.bezierCurveTo(12, -22, -16, -12, -22, 24); c.closePath(); solid(c, F.ginger, 2);
    c.beginPath(); c.moveTo(18, -20); c.bezierCurveTo(26, -17, 30, -12, 31, -7); c.bezierCurveTo(25, -9, 20, -12, 14, -14); c.closePath(); solid(c, mix(F.ginger, PAL.cyan, 0.5), 1.4);
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(34, -10 + i * 11); c.lineTo(46, -10 + i * 11); neonStroke(c, PAL.cyan, 2); }
    for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-30 + i * 9, 32 - (i % 2) * 5, 2.4 - i * 0.3, 0, TAU); c.fillStyle = rgba(PAL.boneDim, 0.8); c.fill(); }
  },
  claws(c, t, A) {
    for (let i = 0; i < 3; i++) {
      const ox = -22 + i * 18;
      c.beginPath(); c.moveTo(ox - 8, -36); c.quadraticCurveTo(ox + 14, -4, ox - 2, 38); c.quadraticCurveTo(ox + 4, -2, ox - 8, -36); c.closePath(); solid(c, PAL.bone, 1.4);
      c.beginPath(); c.moveTo(ox - 6, -32); c.quadraticCurveTo(ox + 11, -4, ox, 34); neonStroke(c, PAL.magenta, 1.6);
    }
    pawPrint(c, 30, 28, 7, PAL.bone);
  },
  zoom(c, t, A) {
    for (let i = 0; i < 4; i++) { const k = i * 0.22; pawPrint(c, -34 + i * 20, 22 - i * 9 + (i % 2) * 6, 6 + i * 0.8, i === 3 ? PAL.bone : mix(PAL.bone, PAL.violet, 0.5 - i * 0.12)); }
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-44, -26 + i * 9); c.lineTo(-10 - i * 4 + Math.sin(t * 6 + i) * 3, -26 + i * 9); neonStroke(c, A, 1.6); }
    chevrons(c, 28, -8, 3, 9, true, PAL.lime);
  },
  furball(c, t, A) {
    c.beginPath(); c.arc(0, 0, 28, 0, TAU); solid(c, F.grey, 2);
    c.save(); c.beginPath(); c.arc(0, 0, 28, 0, TAU); c.clip();
    c.strokeStyle = shade(F.grey, -0.5); c.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { c.beginPath(); c.arc((hash(i) - 0.5) * 20, (hash(i + 9) - 0.5) * 20, 8 + hash(i + 3) * 24, hash(i + 5) * TAU, hash(i + 5) * TAU + 2.2 + hash(i) * 2); c.stroke(); }
    c.restore();
    c.beginPath(); c.moveTo(24, 18); c.bezierCurveTo(40, 30, 28, 44, 12, 38); neonStroke(c, PAL.cyan, 1.5);
    c.save(); c.translate(-32, -30); c.beginPath(); ell(c, 0, 0, 7, 5); c.moveTo(4, -1); c.arc(2, -2, 4, 0, TAU); solid(c, PAL.violetHi, 1.2); c.restore();
  },
  draw(c, t, A) {
    for (let i = -1; i <= 1; i++) {
      c.save(); c.rotate(i * 0.32); c.translate(i * 4, 4);
      c.beginPath(); chamferPath(c, -17, -30, 34, 52, 5); solid(c, i === 0 ? PAL.ink3 : PAL.ink2, 2);
      c.beginPath(); chamferPath(c, -13, -26, 26, 44, 3); c.strokeStyle = i === 0 ? PAL.cyan : PAL.violetHi; c.lineWidth = 1; c.stroke();
      c.restore();
    }
    catHeadGlyph(c, 0, -2, 11, F.charcoal, PAL.cyan);
    chevrons(c, 34, 16, 2, 7, false, PAL.cyan);
  },
  leafbolt(c, t, A) {
    leafPath(c, -30, 20, 44, 14, -0.9); leafPath(c, -26, 24, 40, 12, -0.4); leafPath(c, -20, 26, 36, 11, -1.3);
    c.beginPath(); c.moveTo(14, -34); c.lineTo(-6, -2); c.lineTo(8, -2); c.lineTo(-4, 34); c.lineTo(28, -8); c.lineTo(12, -8); c.lineTo(22, -34); c.closePath(); solid(c, PAL.cyan, 1.6);
    bloom(c, 10, 0, 30, PAL.cyan, 0.5 + 0.2 * Math.sin(t * 4));
  },
  mend(c, t, A) {
    moonPath(c, -6, 0, 34, 15); solid(c, F.ice, 2);
    c.beginPath(); c.moveTo(14, -22); c.lineTo(26, -22); c.lineTo(26, -10); c.lineTo(38, -10); c.lineTo(38, 2); c.lineTo(26, 2); c.lineTo(26, 14); c.lineTo(14, 14); c.lineTo(14, 2); c.lineTo(2, 2); c.lineTo(2, -10); c.lineTo(14, -10); c.closePath(); solid(c, PAL.lime, 1.6);
    for (let i = 0; i < 3; i++) sparkle(c, -26 + i * 14, 28 - i * 4 - frac(t * 0.5 + i * 0.3) * 6, 2.2, PAL.lime, 0.9);
  },
  milk(c, t, A) {
    c.beginPath(); c.moveTo(-14, -34); c.lineTo(14, -34); c.lineTo(22, -18); c.lineTo(22, 36); c.lineTo(-22, 36); c.lineTo(-22, -18); c.closePath(); solid(c, PAL.bone, 2);
    c.beginPath(); c.moveTo(-22, -4); c.lineTo(22, -4); c.lineTo(22, 20); c.lineTo(-22, 20); c.closePath(); c.fillStyle = PAL.lime; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
    c.beginPath(); c.moveTo(-8, 6); c.lineTo(-1, 14); c.moveTo(-1, 6); c.lineTo(-8, 14); c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke();
    for (let i = 0; i < 4; i++) { const k = frac(t * 0.5 + i * 0.25); c.beginPath(); c.arc(-14 + i * 10, -34 - k * 14, 2.4 + i * 0.5, 0, TAU); c.strokeStyle = PAL.lime; c.lineWidth = 1.2; c.stroke(); }
    c.beginPath(); c.moveTo(26, 36); c.quadraticCurveTo(30, 28, 34, 36); c.quadraticCurveTo(30, 44, 26, 36); c.fillStyle = PAL.lime; c.fill();
  },
  surge(c, t, A) {
    leafPath(c, -26, 30, 46, 16, -1.1);
    chevrons(c, 6, 18, 3, 16, true, PAL.lime);
    c.beginPath(); c.moveTo(24, -36); c.lineTo(12, -12); c.lineTo(22, -12); c.lineTo(14, 8); c.lineTo(34, -18); c.lineTo(25, -18); c.lineTo(34, -36); c.closePath(); solid(c, PAL.cyan, 1.4);
    bloom(c, 0, 0, 36, PAL.lime, 0.28);
  },
  flash(c, t, A) {
    const n = 12;
    c.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU + t * 0.2, r = i % 2 ? 16 : 40 - (i % 4 ? 8 : 0); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); solid(c, PAL.bone, 1.6);
    c.beginPath(); c.arc(0, 0, 14, 0, TAU); solid(c, PAL.cyan, 1.6);
    bloom(c, 0, 0, 52, PAL.cyan, 0.5 + 0.25 * Math.sin(t * 5));
    catHeadGlyph(c, 0, 1, 7, PAL.ink3, PAL.bone);
  },
  chain(c, t, A) {
    const pts = [[-34, 24], [-14, -22], [10, 18], [30, -26]];
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i]; c.lineTo((p[0] + q[0]) / 2 + 5 * Math.sin(t * 9 + i), (p[1] + q[1]) / 2 - 4); c.lineTo(q[0], q[1]); }
    neonStroke(c, PAL.cyan, 2.6);
    for (const p of pts) { c.beginPath(); c.arc(p[0], p[1], 6.5, 0, TAU); solid(c, PAL.ink3, 1.4); c.beginPath(); c.arc(p[0], p[1], 2.8, 0, TAU); c.fillStyle = PAL.bone; c.fill(); }
    bloom(c, 0, 0, 44, PAL.cyan, 0.35);
  },
  execute(c, t, A) {
    c.beginPath(); c.arc(0, 0, 30, 0, TAU); neonStroke(c, PAL.magenta, 2.4);
    c.beginPath(); c.arc(0, 0, 18, 0, TAU); c.strokeStyle = rgba(PAL.magenta, 0.6); c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(-44, 0); c.lineTo(-14, 0); c.moveTo(14, 0); c.lineTo(44, 0); c.moveTo(0, -44); c.lineTo(0, -14); c.moveTo(0, 14); c.lineTo(0, 44); neonStroke(c, PAL.magenta, 1.8);
    c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(0, -11, 9, 0); c.quadraticCurveTo(0, 11, -9, 0); solid(c, PAL.lime, 1.2);
    c.beginPath(); ell(c, 0, 0, 1.6, 6); c.fillStyle = INK; c.fill();
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(18 + i * 4, -30 + i * 3); c.lineTo(34 + i * 4, -6 + i * 3); neonStroke(c, PAL.bone, 1.2); }
  },
  barrage(c, t, A) {
    for (let i = 0; i < 5; i++) {
      const x = -30 + i * 14, y = 24 - i * 12 + Math.sin(t * 3 + i) * 2, r = 7 + i * 1.2;
      c.beginPath(); c.moveTo(x - r * 3, y + r * 1.2); c.lineTo(x, y - r * 0.6); c.lineTo(x, y + r * 0.6); c.closePath(); c.fillStyle = rgba(A, 0.18); c.fill();
      c.beginPath(); c.arc(x, y, r, 0, TAU); solid(c, F.grey, 1.6);
      c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip(); c.strokeStyle = shade(F.grey, -0.5); c.lineWidth = 0.8; c.beginPath(); c.arc(x - 2, y + 1, r * 0.7, 0.5, 3); c.stroke(); c.restore();
    }
  },
  mirror(c, t, A) {
    c.beginPath(); ell(c, 0, -2, 24, 32); solid(c, PAL.violetHi, 2.2);
    c.beginPath(); ell(c, 0, -2, 19, 27); c.fillStyle = mix(PAL.cyan, PAL.ink, 0.55); c.fill();
    c.strokeStyle = PAL.bone; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-4, -30); c.lineTo(3, -10); c.lineTo(-8, 4); c.lineTo(6, 18); c.moveTo(3, -10); c.lineTo(16, -14); c.stroke();
    for (let i = 0; i < 4; i++) { const a = -0.7 + i * 0.7; c.beginPath(); c.moveTo(34 + Math.cos(a) * 4, -10 + i * 14); c.lineTo(42, -14 + i * 14); c.lineTo(38, -4 + i * 14); c.closePath(); solid(c, PAL.cyan, 1); }
    c.beginPath(); c.moveTo(-8, 34); c.lineTo(8, 34); c.lineTo(5, 46); c.lineTo(-5, 46); c.closePath(); solid(c, PAL.violetHi, 1.4);
  },
  revive(c, t, A) {
    c.beginPath(); heartPath(c, 0, -2, 25); solid(c, PAL.lime, 2.2);
    pawPrint(c, 0, 0, 10, PAL.ink3);
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.95 + i * (Math.PI * 1.9 / 8); c.beginPath(); c.arc(Math.cos(a) * 40, 6 + Math.sin(a) * 30, 1.8, 0, TAU); c.fillStyle = i < 8 ? PAL.cyan : PAL.bone; c.fill(); }
    c.beginPath(); c.moveTo(-44, 34); c.bezierCurveTo(-24, 22, -14, 40, 10, 30); neonStroke(c, PAL.cyan, 1.6);
  },
  howl(c, t, A) {
    c.beginPath(); c.arc(8, -10, 24, 0, TAU); solid(c, PAL.bone, 2);
    c.fillStyle = rgba(PAL.boneDim, 0.5); for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0 + (i % 2) * 14, -20 + i * 8, 3 + i, 0, TAU); c.fill(); }
    c.beginPath(); c.moveTo(-34, 40); c.lineTo(-30, 8); c.lineTo(-22, -6); c.lineTo(-24, -16); c.lineTo(-12, -20); c.lineTo(-4, -12); c.lineTo(-14, -6); c.lineTo(-10, 6); c.lineTo(-6, 40); c.closePath(); solid(c, PAL.ink, 2);
    c.beginPath(); c.moveTo(-24, -16); c.lineTo(-26, -26); c.lineTo(-18, -20); c.closePath(); c.fillStyle = PAL.ink; c.fill();
    c.beginPath(); c.moveTo(-34, 40); c.lineTo(-30, 8); c.lineTo(-22, -6); c.lineTo(-24, -16); neonStroke(c, PAL.cyan, 1.4);
    for (let i = 0; i < 3; i++) ringBurst(c, -4, -14, 12 + ((t * 14 + i * 9) % 26), PAL.magenta, 1 - (((t * 14 + i * 9) % 26) / 26), 1.4);
  },
  meteor(c, t, A) {
    c.beginPath(); c.moveTo(-44, -40); c.quadraticCurveTo(-20, -14, 12, 0); c.quadraticCurveTo(-14, -26, -34, -42); c.closePath();
    const po = c.globalCompositeOperation; c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(PAL.magenta, 0.6); c.fill(); c.globalCompositeOperation = po;
    c.beginPath(); c.arc(14, 12, 26, 0, TAU); solid(c, PAL.magenta, 2.2);
    c.save(); c.beginPath(); c.arc(14, 12, 26, 0, TAU); c.clip(); c.strokeStyle = shade(PAL.magenta, -0.5); c.lineWidth = 1.3;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(14 + (hash(i) - 0.5) * 16, 12 + (hash(i + 7) - 0.5) * 16, 8 + hash(i + 2) * 22, hash(i + 4) * TAU, hash(i + 4) * TAU + 2.4); c.stroke(); }
    c.restore();
    for (let i = 0; i < 4; i++) flame(c, -24 + i * 8, -8 + i * 4, 6 - i, t, i * 2, PAL.magenta, PAL.bone);
    ringBurst(c, 14, 12, 34 + Math.sin(t * 4) * 3, PAL.cyan, 0.5, 1.2);
  },
  slam(c, t, A) {
    c.beginPath(); c.moveTo(-6, -42); c.lineTo(6, -42); c.lineTo(6, 26); c.lineTo(-6, 26); c.closePath(); solid(c, F.tan, 1.8);
    c.strokeStyle = shade(F.tan, -0.5); c.lineWidth = 1; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-6, -36 + i * 9); c.lineTo(6, -33 + i * 9); c.stroke(); }
    c.beginPath(); chamferPath(c, -26, 26, 52, 10, 3); solid(c, PAL.ink3, 1.8);
    for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; c.save(); c.globalAlpha *= 1 - k; c.beginPath(); ell(c, 0, 32, 20 + k * 28, 4 + k * 8); neonStroke(c, PAL.cyan, 2); c.restore(); }
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-6 + i * 3, -42); c.lineTo(-8 + i * 4, -50); c.strokeStyle = PAL.bone; c.lineWidth = 1; c.stroke(); }
  },
  starfall(c, t, A) {
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.25 + i / 6) % 1, x = -34 + i * 14 + k * 8, y = -44 + k * 86;
      c.beginPath(); c.moveTo(x - 10, y - 18); c.lineTo(x, y); neonStroke(c, prism(t + i * 0.15, 0.4), 1.4);
      c.beginPath(); starPath(c, x, y, 5 + (i % 3) * 2, 5, 0.45); solid(c, prism(t * 0.6 + i * 0.17, 0.4), 1.2);
    }
    catHeadGlyph(c, 0, 24, 13, F.charcoal, PAL.cyan);
  },
  tripwire(c, t, A) {
    c.beginPath(); chamferPath(c, -30, -4, 34, 32, 5); solid(c, F.steel, 2);
    c.beginPath(); ell(c, -13, -4, 17, 5); solid(c, PAL.bone, 1.6);
    fishPath(c, -13, 12, 20, 6, -0.2);
    c.beginPath(); c.moveTo(6, 24); c.lineTo(46, 24); neonStroke(c, PAL.magenta, 1.4);
    c.beginPath(); c.arc(40, 14, 5, Math.PI, 0); c.lineTo(45, 24); c.lineTo(35, 24); c.closePath(); solid(c, PAL.bone, 1.2);
    c.beginPath(); c.arc(40, 24, 1.8, 0, TAU); c.fillStyle = INK; c.fill();
  },
  post(c, t, A) {
    c.beginPath(); c.moveTo(-5, -34); c.lineTo(5, -34); c.lineTo(5, 28); c.lineTo(-5, 28); c.closePath(); solid(c, F.tan, 1.8);
    for (let i = 0; i < 5; i++) { const yy = -26 + i * 10; c.beginPath(); c.moveTo(5, yy - 4); c.lineTo(20, yy); c.lineTo(5, yy + 4); c.closePath(); solid(c, PAL.bone, 1.2); c.beginPath(); c.moveTo(-5, yy - 4); c.lineTo(-20, yy); c.lineTo(-5, yy + 4); c.closePath(); solid(c, PAL.bone, 1.2); }
    c.beginPath(); chamferPath(c, -28, 28, 56, 12, 3); solid(c, PAL.ink3, 1.8);
  },
  mousetrap(c, t, A) {
    c.beginPath(); chamferPath(c, -34, -12, 68, 34, 4); solid(c, F.tan, 2);
    c.strokeStyle = PAL.bone; c.lineWidth = 2; c.beginPath(); c.moveTo(-28, -2); c.lineTo(20, -2); c.lineTo(20, -30); c.lineTo(-8, -30); c.lineTo(-8, -2); c.stroke();
    c.beginPath(); c.moveTo(20, 6); c.quadraticCurveTo(32, 6, 30, 16); c.strokeStyle = PAL.boneDim; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.moveTo(-22, 14); c.lineTo(-12, 8); c.lineTo(-2, 14); c.lineTo(-22, 14); c.closePath(); solid(c, PAL.bone, 1.2);
    c.fillStyle = INK; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-14 + i * 5, 12, 0.9, 0, TAU); c.fill(); }
    c.beginPath(); c.arc(-26, 40, 0.1, 0, TAU);
    sparkle(c, 28, -22, 4, PAL.magenta, 0.7 + 0.3 * Math.sin(t * 5));
  },
  cloud(c, t, A) {
    c.beginPath(); c.arc(-14, 6, 17, 0, TAU); c.arc(8, -8, 21, 0, TAU); c.arc(24, 10, 15, 0, TAU); c.arc(0, 14, 15, 0, TAU);
    c.fillStyle = PAL.ink; c.strokeStyle = PAL.ink; c.lineWidth = 4; c.stroke();
    c.beginPath(); c.arc(-14, 6, 15, 0, TAU); c.arc(8, -8, 19, 0, TAU); c.arc(24, 10, 13, 0, TAU); c.arc(0, 14, 13, 0, TAU); c.fillStyle = mix(PAL.lime, PAL.ink3, 0.55); c.fill();
    leafPath(c, -10, 0, 22, 8, -0.5); leafPath(c, 4, 4, 20, 7, 0.4);
    for (let i = 0; i < 4; i++) { const k = frac(t * 0.4 + i * 0.25); sparkle(c, -20 + i * 14, 20 - k * 30, 2, PAL.lime, Math.sin(k * Math.PI)); }
  },
  laser(c, t, A) {
    c.save(); c.rotate(-0.5); c.beginPath(); chamferPath(c, -42, -5, 34, 10, 3); solid(c, PAL.slate, 1.6); c.beginPath(); c.arc(-9, 0, 3, 0, TAU); c.fillStyle = PAL.magenta; c.fill(); c.restore();
    const dx = 28 + Math.sin(t * 3) * 6, dy = 26 + Math.cos(t * 4) * 4;
    c.beginPath(); c.moveTo(-14, -20); c.lineTo(dx, dy); neonStroke(c, PAL.magenta, 1.2);
    c.beginPath(); c.arc(dx, dy, 4.5, 0, TAU); c.fillStyle = PAL.magenta; c.fill(); bloom(c, dx, dy, 16, PAL.magenta, 0.8);
    catHeadGlyph(c, 20, 30, 7, F.charcoal, PAL.cyan);
  },
  beartrap(c, t, A) {
    c.beginPath(); ell(c, 0, 20, 36, 8); solid(c, PAL.slate, 1.6);
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 34, 20); c.quadraticCurveTo(s * 34, -28, 0, -30);
      c.quadraticCurveTo(s * 20, -14, s * 22, 20); c.closePath(); solid(c, PAL.boneDim, 1.8);
      for (let i = 0; i < 5; i++) { const a = i / 5; c.beginPath(); c.moveTo(s * (28 - a * 20), 8 - a * 36); c.lineTo(s * (18 - a * 18), 4 - a * 34); c.lineTo(s * (26 - a * 20), -2 - a * 30); c.closePath(); c.fillStyle = PAL.bone; c.fill(); }
    }
    c.beginPath(); c.arc(0, -36, 7, Math.PI, 0); c.lineTo(6, -28); c.lineTo(-6, -28); c.closePath(); solid(c, PAL.bone, 1.4);
    c.beginPath(); c.arc(0, -28, 1.8, 0, TAU); c.fillStyle = INK; c.fill();
  },
  mine(c, t, A) {
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; c.beginPath(); c.moveTo(Math.cos(a - 0.14) * 24, Math.sin(a - 0.14) * 24); c.lineTo(Math.cos(a) * 38, Math.sin(a) * 38); c.lineTo(Math.cos(a + 0.14) * 24, Math.sin(a + 0.14) * 24); c.closePath(); solid(c, PAL.slate, 1.2); }
    c.beginPath(); c.arc(0, 0, 26, 0, TAU); solid(c, PAL.ink3, 2);
    const on = Math.sin(t * 6) > 0;
    c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fillStyle = on ? PAL.magenta : PAL.magentaDeep; c.fill();
    if (on) bloom(c, 0, 0, 30, PAL.magenta, 0.9);
    c.strokeStyle = PAL.cyan; c.lineWidth = 1.4; c.beginPath(); c.arc(0, 0, 18, 0.3, 2.6); c.stroke();
    catHeadGlyph(c, 0, 1, 5, PAL.ink, PAL.bone);
  },
  curse(c, t, A) {
    for (let i = 0; i < 2; i++) { c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + t * (i ? -0.5 : 0.5) + i * 0.5; c.lineTo(Math.cos(a) * (40 - i * 8), Math.sin(a) * (40 - i * 8)); } c.closePath(); neonStroke(c, PAL.magenta, 1.4); }
    catHeadGlyph(c, 0, 3, 26, PAL.ink, null);
    for (const sx of [-12, 12]) { c.beginPath(); c.moveTo(sx - 7, 0); c.quadraticCurveTo(sx, -9, sx + 7, 0); c.quadraticCurveTo(sx, 7, sx - 7, 0); c.fillStyle = PAL.lime; c.fill(); bloom(c, sx, 0, 14, PAL.lime, 0.8); c.beginPath(); ell(c, sx, 0, 1.4, 5); c.fillStyle = INK; c.fill(); }
    c.beginPath(); c.moveTo(-26, -26); c.lineTo(-26, -34); c.moveTo(26, -26); c.lineTo(26, -34); neonStroke(c, PAL.magenta, 1.2);
  },
  fishstand(c, t, A) {
    c.beginPath(); c.moveTo(-34, -6); c.lineTo(-28, -30); c.lineTo(28, -30); c.lineTo(34, -6); c.closePath(); solid(c, PAL.magenta, 1.8);
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 12 - 6, -30); c.lineTo(i * 12 + 6, -30); c.lineTo(i * 12 + 6, -6); c.lineTo(i * 12 - 6, -6); c.closePath(); if (i % 2) { c.fillStyle = PAL.bone; c.fill(); } }
    c.beginPath(); chamferPath(c, -30, 8, 60, 30, 3); solid(c, PAL.ink3, 1.8);
    fishPath(c, -12, 22, 22, 7, -0.3); fishPath(c, 12, 22, 22, 7, 0.25);
    c.beginPath(); c.moveTo(-30, -6); c.lineTo(-30, 34); c.moveTo(30, -6); c.lineTo(30, 34); c.strokeStyle = PAL.boneDim; c.lineWidth = 1.6; c.stroke();
  },
  box(c, t, A) {
    c.beginPath(); c.moveTo(-34, -4); c.lineTo(0, -22); c.lineTo(34, -4); c.lineTo(34, 34); c.lineTo(-34, 34); c.closePath(); solid(c, F.tan, 2);
    c.beginPath(); c.moveTo(-34, -4); c.lineTo(0, 12); c.lineTo(34, -4); c.strokeStyle = shade(F.tan, -0.5); c.lineWidth = 1.2; c.stroke();
    c.beginPath(); chamferPath(c, -10, 14, 20, 20, 3); solid(c, PAL.ink, 1.4);
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 6 - 1, 24); c.quadraticCurveTo(sx * 6, 20, sx * 6 + 2, 24); c.fillStyle = PAL.lime; c.fill(); }
    c.beginPath(); c.moveTo(0, -22); c.lineTo(0, -38); neonStroke(c, PAL.boneDim, 1); c.beginPath(); c.moveTo(0, -38); c.lineTo(14, -34); c.lineTo(0, -30); c.closePath(); solid(c, PAL.magenta, 1);
  },
  tree(c, t, A) {
    c.beginPath(); c.moveTo(-3, -40); c.lineTo(3, -40); c.lineTo(3, 30); c.lineTo(-3, 30); c.closePath(); solid(c, F.tan, 1.6);
    for (const [y, w, s] of [[-26, 26, 1], [-4, 20, -1], [16, 28, 1]]) { c.beginPath(); chamferPath(c, s > 0 ? -2 : -w + 2, y, w, 7, 3); solid(c, PAL.violetHi, 1.5); }
    c.beginPath(); chamferPath(c, -26, 30, 52, 9, 3); solid(c, PAL.ink3, 1.6);
    c.beginPath(); ell(c, 8, -32, 9, 5); solid(c, PAL.magentaDeep, 1.4);
    catHeadGlyph(c, 18, 9, 7, F.ginger, PAL.cyan);
  },
  garden(c, t, A) {
    c.beginPath(); chamferPath(c, -38, 20, 76, 16, 3); solid(c, PAL.ink3, 1.8);
    for (let i = 0; i < 4; i++) { const x = -26 + i * 17; c.beginPath(); c.moveTo(x, 20); c.quadraticCurveTo(x - 6, -4, x + (i - 1.5) * 4, -22 + (i % 2) * 8); c.strokeStyle = PAL.limeDeep; c.lineWidth = 3; c.stroke();
      leafPath(c, x, 6, 16, 6, -1.8); leafPath(c, x, 10, 16, 6, -0.9);
      c.beginPath(); c.arc(x + (i - 1.5) * 4, -22 + (i % 2) * 8, 5, 0, TAU); solid(c, i % 2 ? PAL.magenta : PAL.cyan, 1.2); }
    sparkle(c, 30, -26, 3, PAL.lime, 0.6 + 0.4 * Math.sin(t * 3));
  },
  sign(c, t, A) {
    c.beginPath(); c.moveTo(-6, 30); c.lineTo(-6, 40); c.moveTo(6, 30); c.lineTo(6, 40); c.strokeStyle = PAL.slate; c.lineWidth = 2.4; c.stroke();
    c.beginPath(); chamferPath(c, -36, -26, 72, 56, 8); solid(c, PAL.ink3, 2);
    c.beginPath(); c.moveTo(-18, 16); c.lineTo(-18, -6); c.lineTo(-24, -20); c.lineTo(-10, -10); c.quadraticCurveTo(0, -14, 10, -10); c.lineTo(24, -20); c.lineTo(18, -6); c.lineTo(18, 16); c.quadraticCurveTo(0, 26, -18, 16);
    const fl = Math.sin(t * 13) > 0.92 ? 0.4 : 1; c.save(); c.globalAlpha *= fl; neonStroke(c, PAL.magenta, 2.4); c.restore();
    for (const sx of [-8, 8]) { c.beginPath(); c.arc(sx, 0, 2.4, 0, TAU); c.fillStyle = PAL.cyan; c.fill(); }
    bloom(c, 0, 0, 50, PAL.magenta, 0.3 * fl);
  },
  tower(c, t, A) {
    c.beginPath(); c.moveTo(-16, -6); c.lineTo(16, -6); c.lineTo(16, -30); c.lineTo(0, -40); c.lineTo(-16, -30); c.closePath(); c.moveTo(-16, -6); c.lineTo(-16, 8); c.lineTo(16, 8); c.lineTo(16, -6); solid(c, mix(F.tan, PAL.ink, 0.3), 2);
    c.strokeStyle = shade(F.tan, -0.55); c.lineWidth = 1.2; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 10, -34); c.lineTo(i * 10, 8); c.stroke(); }
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 14, 8); c.lineTo(s * 24, 40); c.lineTo(s * 20, 40); c.lineTo(s * 10, 8); c.closePath(); solid(c, PAL.slate, 1.4); }
    c.beginPath(); c.moveTo(-24, 40); c.lineTo(24, 40); c.moveTo(0, 8); c.lineTo(0, 40); c.strokeStyle = PAL.slate; c.lineWidth = 2; c.stroke();
    for (let i = 0; i < 3; i++) { const k = frac(t * 0.6 + i / 3); c.beginPath(); c.arc(0, 14 + k * 24, 2.2, 0, TAU); c.fillStyle = PAL.cyan; c.globalAlpha *= 1 - k * 0.6; c.fill(); c.globalAlpha = 1; }
    c.beginPath(); c.arc(0, -16, 5, 0, TAU); c.fillStyle = PAL.cyan; c.fill(); bloom(c, 0, -16, 16, PAL.cyan, 0.5);
  },
  pylon(c, t, A) {
    c.beginPath(); c.moveTo(-6, -38); c.lineTo(6, -38); c.lineTo(14, 36); c.lineTo(-14, 36); c.closePath(); solid(c, PAL.slate, 2);
    c.strokeStyle = shade(PAL.slate, -0.5); c.lineWidth = 1.2; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-10 + i, -20 + i * 14); c.lineTo(10 - i, -8 + i * 14); c.stroke(); }
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-6, -34 + i * 8); c.bezierCurveTo(-26, -20 + i * 10, -30, 6 + i * 6, -44, 14 + i * 6); neonStroke(c, PAL.magenta, 1.3); c.beginPath(); c.moveTo(6, -34 + i * 8); c.bezierCurveTo(26, -20 + i * 10, 30, 6 + i * 6, 44, 14 + i * 6); neonStroke(c, PAL.magenta, 1.3); }
    c.beginPath(); c.arc(0, -42, 5, 0, TAU); c.fillStyle = PAL.magenta; c.fill(); bloom(c, 0, -42, 18, PAL.magenta, 0.8);
  },
  roof(c, t, A) {
    c.beginPath(); c.moveTo(-42, 4); c.lineTo(0, -28); c.lineTo(42, 4); c.lineTo(36, 8); c.lineTo(0, -18); c.lineTo(-36, 8); c.closePath(); solid(c, PAL.magentaDeep, 1.8);
    c.beginPath(); chamferPath(c, -34, 6, 68, 32, 3); solid(c, PAL.ink3, 1.8);
    c.strokeStyle = shade(PAL.ink3, 0.25); c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-34, 14 + i * 7); c.lineTo(34, 14 + i * 7); c.stroke(); }
    c.beginPath(); c.moveTo(0, -4); c.lineTo(14, 2); c.lineTo(14, 16); c.quadraticCurveTo(14, 26, 0, 32); c.quadraticCurveTo(-14, 26, -14, 16); c.lineTo(-14, 2); c.closePath(); solid(c, ROLE_COLOR.tank, 1.6);
    c.beginPath(); c.moveTo(0, 4); c.lineTo(0, 24); neonStroke(c, PAL.bone, 1.2);
  },
  burst(c, t, A) {
    c.beginPath(); starPath(c, 0, 0, 36, 8, 0.5, t * 0.3); solid(c, A, 2);
    c.beginPath(); c.arc(0, 0, 12, 0, TAU); solid(c, PAL.ink3, 1.6);
  },
};
const CARD_GLYPH = {
  cat_nap: 'nap', tail_flick: 'flick', pounce: 'claws', zoomies: 'zoom', fur_ball: 'furball', curious_cat: 'draw',
  catnip_stash: 'leafbolt', moonlit_mend: 'mend', sour_milk: 'milk', catnip_surge: 'surge', neon_flash: 'flash',
  lightning_whisker: 'chain', final_pounce: 'execute', hairball_barrage: 'barrage', shatter_mirror: 'mirror',
  second_wind: 'revive', midnight_howl: 'howl', meteor_of_yarn: 'meteor', scratch_post_slam: 'slam', starfall_purrade: 'starfall',
  tuna_tripwire: 'tripwire', spiky_scratch_post: 'post', mouse_trap_mk2: 'mousetrap', catnip_cloud: 'cloud',
  laser_pointer_decoy: 'laser', bear_trap_bell: 'beartrap', neon_mine: 'mine', black_cat_curse: 'curse',
  fish_stand: 'fishstand', cardboard_fort: 'box', cat_tree: 'tree', rooftop_garden: 'garden', neon_sign: 'sign',
  water_tower_pump: 'tower', yarn_pylon: 'pylon', fortified_roof: 'roof',
};
/** Ids of every non-summon card that has bespoke art. */
export const CARD_ART_IDS = Object.keys(CARD_GLYPH);

/**
 * Card art window. card = card object or id. (x,y) top-left of the art window.
 * Summon cards show the cat portrait in a framed cut-out whose head pops over the top edge (o.pop false to disable).
 */
export function drawCardArt(ctx, card, x, y, w, h, o) {
  o = o || {};
  if (typeof card === 'string') card = CARD_BY_ID[card];
  x = fin(x); y = fin(y); w = Math.max(4, fin(w, 40)); h = Math.max(4, fin(h, 40));
  const t = fin(o.t, 0);
  if (!card) { drawBackdrop(ctx, x, y, w, h, 'spell', 'common', null, 1); return; }
  const rid = RARITY[card.rarity] ? card.rarity : 'common';
  if (card.type === 'summon') {
    const catId = (card.effect && card.effect.cat) || String(card.id).replace(/^call_/, '');
    const cat = CAT_BY_ID[catId];
    const role = cat ? cat.role : 'brawler';
    const tint = ROLE_COLOR[role];
    ctx.save();
    drawBackdrop(ctx, x, y, w, h, 'cat', rid, tint, strHash(catId));
    // cut-out: the window clips the sides and bottom; the head pops over the top edge
    const pop = o.pop === false ? 0 : Math.min(h * 0.16, 22);
    ctx.beginPath(); ctx.rect(x - 1, y - pop, w + 2, h + pop + 1); ctx.clip();
    if (RARITY[rid].order >= 3) bloom(ctx, x + w * 0.46, y + h * 0.55, Math.max(w, h) * 0.55, rid === 'mythic' ? prism(t, 0.3) : RARITY[rid].color, 0.3);
    const fg = ctx.createLinearGradient(0, y + h * 0.86, 0, y + h);
    fg.addColorStop(0, rgba(tint, 0)); fg.addColorStop(1, rgba(tint, 0.3));
    ctx.fillStyle = fg; ctx.fillRect(x, y + h * 0.86, w, h * 0.14);
    paintCatInWindow(ctx, catId, x, y, w, h, o, true);
    ctx.restore();
    return;
  }
  const kind = card.type === 'trap' ? 'trap' : card.type === 'build' ? 'build' : 'spell';
  ctx.save();
  drawBackdrop(ctx, x, y, w, h, kind, rid, null, strHash(card.id));
  ctx.beginPath(); chamferPath(ctx, x, y, w, h, Math.max(5, Math.min(w, h) * 0.05)); ctx.clip();
  const k = Math.min(w, h) / 98;
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(k, k);
  const acc = kind === 'spell' ? PAL.cyan : kind === 'trap' ? PAL.magenta : PAL.lime;
  const rcol = rid === 'mythic' ? prism(t, 0.3) : RARITY[rid].color;
  if (RARITY[rid].order >= 1) bloom(ctx, 0, 0, 60, rcol, 0.22 + 0.06 * Math.sin(t * 2));
  const bob = Math.sin(t * 1.6 + strHash(card.id) * 0.1) * 1.6;
  ctx.translate(0, bob);
  const fn = GLYPH[CARD_GLYPH[card.id]] || GLYPH.burst;
  fn(ctx, t, acc);
  ctx.restore();
}

// ---------- public helpers ----------
export const CAT_IDS = CATS.map((c) => c.id);
/** Signature data (colours, accessories) for a cat, for tooltips and the lab. */
export function catSignature(catId) { const g = geomFor(catId); return { fur: g.S.fur, acc: g.S.acc.slice(), hat: g.S.hat || null, pattern: g.S.pat, brow: g.S.brow, mouth: g.S.mouth }; }
/** Bake the cores for a list of cats at the given on-screen pixel sizes (call during a loading screen). */
export function prewarmCats(ids, sizes) {
  const list = ids || CAT_IDS, sz = sizes || [64];
  for (const id of list) for (const s of sz) getCore(id, (s / 32) * geomFor(id).scale);
}
