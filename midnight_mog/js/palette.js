// Midnight Mog palette: "Midnight Neon Baroque". See docs/STYLE_BIBLE.md.
// Pure module: no DOM access at import time. Safe to import from node.
// GOLD (and the gold-based ramps) are reserved for rarity and best loot only.

export const PAL = Object.freeze({
  // ground
  void: '#05030c',      // deepest background, letterbox
  ink: '#0b0716',       // main background, outlines
  ink2: '#150c28',      // raised panels, building bodies
  ink3: '#21123d',      // panel fill highlights, windows off
  violet: '#5b2a86',    // mid shadow, fog, secondary lines
  violetHi: '#8a4bd1',  // violet highlights, tab inactive text
  // neon
  magenta: '#ff2e88',   // primary accent: danger, bounce light, enemy glow, CTA
  magentaDeep: '#a3125b',
  lime: '#b6ff2e',      // success, heal, energy, nature, trapper
  limeDeep: '#5f9a0a',
  cyan: '#19e6ff',      // rim light, mana, UI focus, player side
  cyanDeep: '#0a7e9c',
  // neutrals
  bone: '#f4ecff',      // text, eye highlights, rim hot spot
  boneDim: '#b9a9d6',   // secondary text
  slate: '#6b5f86',     // disabled, common rarity base
  violetText: '#a97be8', // violetHi lifted for TEXT on dark panels (5.5:1 or better on ink2 and ink3; violetHi itself is 3.3:1 and is for fills and strokes)
  slateText: '#9a8fb4',  // slate lifted for muted TEXT (5.8:1 on ink3); slate stays the disabled stroke and fill colour
  // reserved
  gold: '#ffc83d',      // RARITY AND BEST LOOT ONLY
  goldDeep: '#a9701a',
  goldHot: '#fff0a8',
  // semantic
  hp: '#ff2e88',
  hpBack: '#3a0f2a',
  energy: '#19e6ff',
  heal: '#b6ff2e',
  danger: '#ff2e88',
  ok: '#b6ff2e',
  info: '#19e6ff',
  shadow: '#05030c',
  // sky / city gradient stops, top to bottom
  sky: ['#05030c', '#150c28', '#3b1466', '#8a2a8f', '#ff2e88'],
});

// Rarity: id -> {name, color, glow, ramp:[dark..light], ornament}
// ornament is a tier key read by frame/ornament drawing code (see bible section 8).
export const RARITY = Object.freeze({
  common: Object.freeze({
    name: 'Common', order: 0, color: '#8f84a8', glow: '#6b5f86',
    ramp: ['#1b1430', '#3a3050', '#6b5f86', '#8f84a8', '#c9c0dc'],
    ornament: 'plain', glowAlpha: 0.0, stars: 1,
  }),
  rare: Object.freeze({
    name: 'Rare', order: 1, color: '#19e6ff', glow: '#19e6ff',
    ramp: ['#062a3a', '#0a5a74', '#0a7e9c', '#19e6ff', '#b8f8ff'],
    ornament: 'corners', glowAlpha: 0.35, stars: 2,
  }),
  epic: Object.freeze({
    name: 'Epic', order: 2, color: '#ff2e88', glow: '#ff2e88',
    ramp: ['#3a0f2a', '#7a0f48', '#c21a6a', '#ff2e88', '#ffb3d6'],
    ornament: 'filigree', glowAlpha: 0.5, stars: 3,
  }),
  legend: Object.freeze({
    name: 'Legend', order: 3, color: '#ffc83d', glow: '#ffc83d',
    ramp: ['#3a2406', '#a9701a', '#e0a02a', '#ffc83d', '#fff0a8'],
    ornament: 'crown', glowAlpha: 0.7, stars: 4,
  }),
  mythic: Object.freeze({
    name: 'Mythic', order: 4, color: '#fff0a8', glow: '#ffffff',
    // prismatic: cycle through ramp by time (see prism()); first/last are gold-hot bookends
    ramp: ['#ffc83d', '#ff2e88', '#b6ff2e', '#19e6ff', '#fff0a8'],
    ornament: 'halo', glowAlpha: 0.9, stars: 5,
  }),
});

export const RARITY_ORDER = Object.freeze(['common', 'rare', 'epic', 'legend', 'mythic']);

// Role -> accent colour. Used for the role chip, ground ring, ability glow, eye colour.
export const ROLE_COLOR = Object.freeze({
  brawler: '#ff7a2e',  // ember orange (only role using orange; keeps it away from gold)
  archer: '#19e6ff',   // cyan
  mage: '#c46bff',     // ultraviolet
  support: '#b6ff2e',  // lime
  trapper: '#ff2e88',  // magenta
  tank: '#5aa2ff',     // steel blue
});

// Enemy faction tints (eye glow / rim). Enemies rim from the right in magenta.
export const ENEMY_COLOR = Object.freeze({
  vermin: '#ff2e88',
  feral: '#ff7a2e',
  tech: '#b6ff2e',
  spirit: '#c46bff',
  boss: '#ff2e88',
});

// ---------- helpers ----------

function parse(h) {
  let s = String(h).trim();
  if (s[0] === '#') s = s.slice(1);
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s.slice(0, 6), 16);
  if (!(n >= 0)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r, g, b) {
  const c = (v) => {
    v = Math.max(0, Math.min(255, Math.round(v)));
    return (v < 16 ? '0' : '') + v.toString(16);
  };
  return '#' + c(r) + c(g) + c(b);
}

/** hex -> 'rgba(r,g,b,a)' */
export function rgba(h, a = 1) {
  const [r, g, b] = parse(h);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}
export const hexToRgba = rgba;

/** Linear mix of two hex colours, t=0 -> a, t=1 -> b. Returns hex. */
export function mix(a, b, t) {
  const A = parse(a), B = parse(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** amt in -1..1: negative darkens toward ink, positive lightens toward bone. Returns hex. */
export function shade(h, amt) {
  return amt < 0 ? mix(h, PAL.ink, -amt) : mix(h, PAL.bone, amt);
}

/**
 * Neon bloom: additive radial gradient. Restores composite op and alpha.
 * color is hex; alpha 0..1 is the centre strength.
 */
export function glow(ctx, x, y, r, color, alpha = 0.6) {
  if (r <= 0 || alpha <= 0) return;
  const prevOp = ctx.globalCompositeOperation;
  const prevA = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.35, rgba(color, alpha * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevA;
}

/** Sample a rarity ramp (0..1) as a blended hex. Mythic loops: pass t that grows with time. */
export function ramp(rarityId, t) {
  const rp = (RARITY[rarityId] || RARITY.common).ramp;
  const n = rp.length;
  let x = rarityId === 'mythic' ? ((t % 1) + 1) % 1 * n : Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(x);
  const f = x - i;
  return mix(rp[i % n], rp[Math.min(i + 1, n - 1) % n], f);
}

/** Time-animated prismatic colour for mythic things. time in seconds. */
export function prism(time, speed = 0.35) {
  return ramp('mythic', time * speed);
}

/** Colour of a rarity (safe lookup). */
export function rarityColor(id) {
  return (RARITY[id] || RARITY.common).color;
}

/** Fonts: canvas font stacks. Use font(size, weight, kind). */
export const FONT = Object.freeze({
  display: '"Impact","Haettenschweiler","Arial Narrow Bold","Arial Black",sans-serif',
  body: '"Trebuchet MS","Segoe UI","Helvetica Neue",Arial,sans-serif',
  mono: '"Consolas","Menlo","Courier New",monospace',
});
export function font(size, weight = 700, kind = 'body') {
  return weight + ' ' + Math.round(size) + 'px ' + FONT[kind];
}
