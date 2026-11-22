// Million To One: everything drawn on the canvas. Reads a Race, never changes its rules
// (its display state for agents and hazards lives in WeakMap side stores, this.aux and this.eaux, never on core's objects).
// Art direction: cartoon biology. Squishy, glossy, a bit silly. No image files: every
// sprite, tile and glow is painted in code (much of it once, into cached offscreen canvases).
import { VIEW_W, channel, centre, zoneIndex, ZSTART, FORK_Y0, FORK_END, DEAD_Y, playBand } from './core.js';
import { ZONES, RACE_LEN } from './content.js';
import * as K from './content.js';
import * as CORE from './core.js';   // optional tuning (STYLE_KINDS, STYLE_WINDOW), read guarded   // optional line tables (RIVAL_STEAL, RIVAL_FAREWELLS), read guarded

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// a 2-d length (Math.hypot is variadic and several times slower in the per-agent and per-particle loops)
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const h1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const RGBC = new Map();
const rgb = (hex) => {
  let v = RGBC.get(hex);
  if (!v) { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0; v = [n >> 16, (n >> 8) & 255, n & 255]; RGBC.set(hex, v); }
  return v;
};
const css = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
// lerpC(a, b, t, out): with out it writes into that array (a reused scratch, no garbage per frame)
const lerpC = (a, b, t, out) => {
  const o = out || [0, 0, 0];
  o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t;
  return o;
};
const SCR = [0, 0, 0], WHITE = [255, 255, 255];                        // a scratch colour for css(lerpC(...)) one-liners
// how much the flesh outside the tube darkens, per zone (Rapids deeper, the Egg stays warm)
// (readability: the Sea's flesh 0.55 toward its own dark plum, so the tube's crimson reads off it; the Goo 0.45)
const DIM = { rapids: 0.6, egg: 0.18, launch: 0.28, acid: 0.45, fork: 0.5, sea: 0.55, goo: 0.45 };
const dimOf = (zi) => (ZONES[zi] ? DIM[ZONES[zi].id] ?? 0.3 : 0.3);
// the dark each zone's outer flesh dims toward (DEEP_K, rgb(0,0,10), unless listed): the Sea's a warm '#2a0410'
const DIM_COL = { sea: '#2a0410' };
const DIM_RGB = { sea: [42, 4, 16] };
const dimCss = (zi) => (ZONES[zi] && DIM_COL[ZONES[zi].id]) || 'rgb(0,0,10)';
// render-side tube colours [deep, lite] where a zone's own pair reads poorly: the Gate of Goo was a grey 1.6:1 (now a
// pearly periwinkle tube in a navy outside, about 3:1); the Launch Tube's lite leans 12% toward its pink glow
const TUBE_TINT = { goo: ['#1b1f44', '#6c78c4'], egg: ['#4a1630', '#f2b04a'], fork: ['#08102a', '#3a5cb8'] };
const GOO_RIM = 'rgba(42,10,36,0.6)';   // swimmer heads on the pale Goo (white on periwinkle reads ~4.5:1 with it)
const CAUS_COL = '#ffb08a';                   // the Sea's caustic net: warm peach, apart from the pink tissue
const CAUS_ACID = '#c8ff6a';                  // the Acid Lagoon's caustic net: lime light on the lagoon floor
// the far layer (farSpr): one baked silhouette per zone (the Egg keeps her own look), parallax, alpha, world spacing
// (landmarks that read at a glance: 0.40 to 0.45 (the Sea 0.36; the Launch 0.3, its pale swirls sit right under the
// white crowd), about 1300 apart, drawn 1.4x, with a 1 px rim light in the zone's wall colour along their top edges,
// baked in farSpr)
// (gaps: gap * par >= about 600, so at most two landmarks share the screen)
const FAR = { launch: { par: 0.18, al: 0.18, gap: 3300 }, acid: { par: 0.16, al: 0.42, gap: 3700 }, goo: { par: 0.17, al: 0.4, gap: 3500 },
  sea: { par: 0.15, al: 0.6, gap: 3000 }, fork: { par: 0.2, al: 0.45, gap: 3000 }, rapids: { par: 0.18, al: 0.42, gap: 3300 } };
// each zone's mood light: a cached 4 x 256 vertical gradient (screen space, 4 columns left to right) filled over the
// tube at 0.3 after the texture pass, blended by bt at the gates (THE EGG keeps her own light). Stops: [y, col, alpha]
const MOOD = {
  launch: [[0, '#ff7aa8', 0], [0.55, '#ff7aa8', 0.12], [1, '#ff4d8a', 0.7]],   // a pink backlight (pulses on the beat)
  acid: [[0, '#c8ff6a', 0], [0.65, '#c8ff6a', 0], [0.85, '#b8ff4a', 0.55], [1, '#9dff3c', 0.95]],   // lime underglow, bottom 35%
  goo: [[0, '#fff6e6', 0.55], [0.35, '#fbead0', 0.4], [0.7, '#fbead0', 0], [1, '#fbead0', 0]],   // a cool vanilla top light (gold is THE EGG's alone)
  // the Sea in 3 value bands: a bright coral light near the top (0.15), a crimson centre, a deep plum floor
  sea: [[0, '#ff9a7a', 0.12], [0.15, '#ff9a7a', 0.25], [0.3, '#d8303a', 0.25], [0.5, '#b0102c', 0.45], [0.72, '#5a0a34', 0.6], [1, '#2a0626', 0.9]],
  fork: [[0, '#1a2c66', 0.8], [0.5, '#2a3f80', 0.45], [1, '#1a2c66', 0.7]],   // cold (pink on the egg's branch: moodSpr)
  // the Sea's mood drifts over the zone from crimson (MOOD.sea) toward a magenta coral (seaB), in 8 baked steps
  seaB: [[0, '#ffa0a8', 0.12], [0.15, '#ffa0a8', 0.25], [0.3, '#e04070', 0.25], [0.5, '#d0306a', 0.45], [0.72, '#5a0a40', 0.6], [1, '#2a0630', 0.9]],
  rapids: [[0, '#ffffff', 0], [0.12, '#ffffff', 0.7], [0.2, '#ffffff', 0], [0.45, '#ffffff', 0], [0.55, '#ffffff', 0.55], [0.63, '#ffffff', 0], [0.85, '#ffffff', 0], [0.92, '#ffffff', 0.6], [1, '#ffffff', 0]],   // shimmer bands (they drift)
};
const FAR_W = 300, FAR_H = 500, FAR_K = 1.4;
const LENS_PAD = 3;   // the baked Goo lenses' margin (logical units)
{
  const LZ = ZONES.find((z) => z.id === 'launch');
  if (LZ) { const a = rgb(LZ.col[1]), b = rgb('#ff9ac0'), h2 = (v) => Math.round(v).toString(16).padStart(2, '0'); TUBE_TINT.launch = [LZ.col[0], '#' + h2(a[0] + (b[0] - a[0]) * 0.12) + h2(a[1] + (b[1] - a[1]) * 0.12) + h2(a[2] + (b[2] - a[2]) * 0.12)]; }
}
// the porridge Goo (ZONES goo col ['#2f2a24', '#857a66'], wall '#fff3dc') reads on its own pair: the periwinkle tint
// stays only while the zone still carries the old grey pair
{ const GZ = ZONES.find((z) => z.id === 'goo'); if (GZ && GZ.col && GZ.col[0] !== '#262a3a') delete TUBE_TINT.goo; }
// render-side overrides set AFTER that guard (so it never removes them):
// the Goo: a warm custard tube (lite) in a plum outside (deep), so the cream goo blobs and the dark slabs both read;
// the Acid Lagoon: a deep bottle-green interior, so the lime puddles pop at more than 3:1;
// the Launch Tube: pushed about 18 degrees toward violet (lite #8a2a8e), so it never reads like the red Sea
TUBE_TINT.goo = ['#3a1838', '#f2c4d8'];   // (a rosy pink tube in a deep plum: the cream blobs and the slabs read apart from it, no cardboard)   // (lite a toastier custard: the cream blobs and white crowd read on it)
//   // (a cool vanilla cream with caramel '#b8763a' accents: gold belongs to THE EGG)
TUBE_TINT.acid = ['#0c2218', '#265e38'];   // (lifted: the lagoon read as a black hole round its puddles)
TUBE_TINT.launch = ['#340c3e', '#8a2a8e'];
// Tube Rapids: its lite 12% lighter, so the bright channel reads against the deeper flesh round it (DIM 0.42)
// (readability pass: a brighter turquoise channel, '#18b4c4', against the deeper flesh round it, DIM 0.6)
{ const RZ = ZONES.find((z) => z.id === 'rapids'); if (RZ) TUBE_TINT.rapids = [RZ.col[0], '#18b4c4']; }
const GOO_SHADOW = '#9c86b0', GOO_LINE = '#c86a3a';   // the Goo blobs' lilac shadow; a caramel line
// the Goo's wet look (paintPiece, gateDress, drawWallStyle): a white specular crescent on the upper left of a lobe
// (radius 0.42 r, lineWidth 3 or less on a small lobe, alpha 0.6) and a 2 to 3 px dot; sx stretches it (the wobble)
function gooShine(g, x, y, r, sx = 1) {
  const ga = g.globalAlpha, rr = r * 0.42, lw = Math.min(3, Math.max(1, r * 0.3));
  g.globalAlpha = ga * 0.6; g.strokeStyle = '#ffffff'; g.lineWidth = lw; g.lineCap = 'round';
  g.beginPath(); g.ellipse(x - r * 0.12, y - r * 0.12, rr * sx, rr, 0, Math.PI * 1.02, Math.PI * 1.48); g.stroke();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - r * 0.12 + Math.cos(Math.PI * 1.65) * rr * 1.15 * sx, y - r * 0.12 + Math.sin(Math.PI * 1.65) * rr * 1.15, clamp(r * 0.14, 1, 1.5), 0, TAU); g.fill();
  g.globalAlpha = ga;
}
const zcol = (z) => (z && TUBE_TINT[z.id]) || z.col;
// a far landmark's bake trimmed to its alpha: the rows that hold anything (alpha > 2), split into 4 horizontal bands,
// each trimmed again in x and y (logical units of the FAR_W x FAR_H sprite, K pixels each), so drawFar blends only
// the painted parts. Sampled every 2nd pixel (once per bake); null when the pixels cannot be read (draw it whole).
function farBands(g, pw, ph, K) {
  let D;
  try { D = g.getImageData(0, 0, pw, ph).data; } catch (e) { return null; }
  if (!D || D.length < pw * ph * 4) return null;
  const rowHas = (y, x0, x1) => { for (let x = x0; x < x1; x += 2) if (D[(y * pw + x) * 4 + 3] > 2) return true; return false; };
  let y0 = 0, y1 = ph - 1;
  while (y0 < ph && !rowHas(y0, 0, pw)) y0 += 2;
  if (y0 >= ph) return [];
  while (y1 > y0 && !rowHas(y1, 0, pw)) y1 -= 2;
  const out = [], bh = Math.ceil((y1 + 1 - y0) / 4);
  for (let b = 0; b < 4; b++) {
    const by0 = y0 + b * bh, by1 = Math.min(ph, by0 + bh);
    let bx0 = pw, bx1 = -1, ry0 = -1, ry1 = -1;
    for (let y = by0; y < by1; y += 2) {
      let l = -1, r = -1;
      for (let x = 0; x < pw; x += 2) if (D[(y * pw + x) * 4 + 3] > 2) { l = x; break; }
      if (l < 0) continue;
      for (let x = pw - 1; x >= l; x -= 2) if (D[(y * pw + x) * 4 + 3] > 2) { r = x; break; }
      if (l < bx0) bx0 = l; if (r > bx1) bx1 = r;
      if (ry0 < 0) ry0 = y; ry1 = y;
    }
    if (bx1 < 0) continue;
    // a 2 px margin (the sampling step), clamped to the sprite, in logical units
    const X0 = Math.max(0, bx0 - 2), X1 = Math.min(pw, bx1 + 3), Y0 = Math.max(0, ry0 - 2), Y1 = Math.min(ph, ry1 + 3);
    out.push({ x0: X0 / K, x1: X1 / K, y0: Y0 / K, y1: Y1 / K });
  }
  return out;
}
const TRAIL_N = 26;                           // Kevin's trail ring
// cssQ(rgb array, a) / rgbaQ(r, g, b, a): css() cached per colour at 1/64 alpha steps, for the per-frame paths (the
// same string css() builds, made once)
const CSSK = new Map();
const rgbaQ = (r, g, b, al = 1) => {
  const k = ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
  let A = CSSK.get(k);
  if (!A) { if (CSSK.size > 256) CSSK.clear(); A = new Array(65); CSSK.set(k, A); }
  const q = Math.round(Math.max(0, Math.min(1, al)) * 64);
  return A[q] || (A[q] = `rgba(${r | 0},${g | 0},${b | 0},${q / 64})`);
};
const cssQ = (a, al = 1) => rgbaQ(a[0], a[1], a[2], al);
// hexA(hex, a): cached per colour at 1/64 alpha steps (it ran in per-frame paths: no array and string per call)
const HEXA = new Map();
const hexA = (hex, a) => {
  let A = HEXA.get(hex);
  if (!A) { if (HEXA.size > 96) HEXA.clear(); A = new Array(65); HEXA.set(hex, A); }
  const q = Math.round(Math.max(0, Math.min(1, a)) * 64);
  return A[q] || (A[q] = css(rgb(hex), q / 64));
};
// any CSS colour main.js passes ('#fff', '#ffd75c', 'rgba(r,g,b,a)') to [r, g, b], cached
const COLC = new Map();
const colOf = (s) => {
  s = String(s || '#fff');
  let v = COLC.get(s);
  if (!v) {
    if (s[0] === '#') { const h = s.length === 4 ? '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s; v = rgb(h); }
    else { const m = s.match(/[\d.]+/g) || []; v = [+m[0] || 0, +m[1] || 0, +m[2] || 0]; }
    if (COLC.size > 64) COLC.clear();
    COLC.set(s, v);
  }
  return v;
};
const FRUIT = ['#ff4d6d', '#5b7cff', '#ffa630', '#b84dff', '#ff6b9a'];
const CROWD = ['#f3f0ff', '#fff0f6', '#eefcff', '#fffbe8', '#f0fff4', '#f7efff'];
// (no '#5b7cff': that blue cap is Steve's alone)
const CAPS = ['#ff3d6e', '#2fd17a', '#ffa630', '#b84dff'];
// the crowd's faces never wear a rival's props (glasses, a stache, a bow, a cap, shades read as Tiffany, Brock, Steve,
// Gunther): their own small marks instead, cheap in head(). FACE_ACC_ALBUM keeps the old looks for the baby album
const FACE_ACC = [[], ['freckles'], ['curl'], ['bandaid'], ['teeth'], ['unibrow']];
const FACE_ACC_ALBUM = [[], ['glasses'], ['stache'], ['bow', 'lashes'], ['cap'], ['shades']];
// heat aura colours, mint to orange to red, quantised so the glow cache stays small
const HEAT = ['#96ffaa', '#b8ff8a', '#e0ff6a', '#ffe05c', '#ffbf4a', '#ff9a3c', '#ff7438', '#ff5a3c'];
// signature swims: tail beat (freq, amp, tail width) and a party trick each
// silhouettes: sx / sy body shape, blink period (dbl: a double blink), tilt (Gunther's lean, flips each roll)
const BOSS_LOOK = {
  Steve: { acc: ['cap'], cap: '#5b7cff', mouth: 'grin', freq: 11, amp: 8, wave: 4, sx: 1.05, sy: 1.05, blink: 2.6 },
  Brock: { acc: ['band', 'stache'], band: '#ff7a2f', brow: 'angry', freq: 12, amp: 9, tw: 4.6, flex: 5, sx: 1.22, sy: 0.95 },
  Tiffany: { acc: ['bow', 'lashes', 'glasses'], mouth: 'smirk', freq: 22, amp: 3.5, straight: 1, sx: 0.95, sy: 1.08, tw: 2.4, blink: 4.5, dbl: 1, read: 1 },
  Gunther: { acc: ['mohawk', 'shades'], mouth: 'grin', freq: 16, amp: 6, roll: 6, sy: 1.06, tilt: 0.08, blink: 2.0 },
  Chad: { acc: ['crown', 'shades'], mouth: 'smirk', freq: 14, amp: 6, strut: 1, quiff: 1, sy: 1.1 },
};
const NO_LOOK = Object.freeze({});
// the win's baby beat: it starts BABY_AT s after the win (audio's WIN_HEART_AT, the first heartbeat thump) and the
// baby-to-be portrait inside the egg reaches full alpha BABY_REVEAL_S s into it. Shared with audio.js, which plays its
// music-box note at BABY_AT + BABY_REVEAL_S (content.js may own the number: K.BABY_REVEAL_S wins when it is set)
export const BABY_AT = 1.6;
export const BABY_REVEAL_S = Number.isFinite(K.BABY_REVEAL_S) && K.BABY_REVEAL_S > 0 ? +K.BABY_REVEAL_S : 0.9;   // (an unknown rival's look: one shared empty record, not a {} a frame)
// a blink at phase u of a P-second cycle (dbl: two quick ones)
const blinkAt = (u, P, dbl) => { const k = ((u % P) + P) % P; return k < 0.12 || (!!dbl && k > 0.22 && k < 0.34); };
// a living blink (Kevin and the named rivals): a random 2.0 to 5.5 s wait, 15% of them doubled, the lid easing down
// 0.06 s, shut 0.04 s, back up 0.06 s. Returns the lid 0 (open) .. 1 (shut); S is the swimmer's own state object
const BLINK_D = 0.16, BLINK_GAP = 0.08;
const lidAt = (u) => { const v = u < 0.06 ? u / 0.06 : u < 0.1 ? 1 : u < BLINK_D ? 1 - (u - 0.1) / 0.06 : 0; return v * v * (3 - 2 * v); };
// (P, dbl: a rival's own look, BOSS_LOOK blink / dbl: it waits P x 0.8..1.2 between blinks, and with dbl every
// blink is a double; without P the old 2 to 5.5 s wait and a 15% double)
function blinkLid(S, dt, P, dbl) {
  const per = P > 0 ? P : 0;
  if (S.nt == null || S.nt !== S.nt) { S.nt = per ? per * Math.random() : 0.5 + Math.random() * 3; S.k = -1; S.dbl = 0; }
  if (S.k < 0) { S.nt -= dt; if (S.nt > 0) return 0; S.k = 0; S.dbl = per && dbl ? 1 : Math.random() < 0.15 ? 1 : 0; }
  S.k += dt;
  const end = S.dbl ? BLINK_D * 2 + BLINK_GAP : BLINK_D;
  if (S.k >= end) { S.k = -1; S.nt = per ? per * (0.8 + 0.4 * Math.random()) : 2 + Math.random() * 3.5; return 0; }
  return S.k < BLINK_D ? lidAt(S.k) : S.k < BLINK_D + BLINK_GAP ? 0 : lidAt(S.k - BLINK_D - BLINK_GAP);
}
// rival moves (systems event rivalMove): how long each phase plays
const MV_DUR = { tell: 0.6, hit: 0.35, countered: 0.5 };
// which accessory a baby inherits from Dad's strongest mutation (album portraits)
const MUT_ACC = { helmet: 'cap', spiky: 'mohawk', mosh: 'mohawk', hype: 'band', turbo: 'band', whip: 'band', nose: 'glasses', memory: 'glasses',
  nitro: 'shades', slick: 'shades', wingman: 'shades', sweet: 'bow', second: 'bow', lucky: 'crown', chain: 'crown', draft: 'stache', rush: 'stache' };
const FONT = '"Baloo 2", system-ui, sans-serif';
const TS = 1.25, TW = 440, TH = 720;          // backdrop tile: logical size and pixel scale
const MAXP = 420, MAXP_LITE = 260;            // particle ring buffer size (full / lite)
// the overdraw budget's drop order (overBudget(name, area)): the headroom, in screens, each optional layer leaves
// core's non-allocating channelInto(y, side, out) when it has one (else channel, which takes the same out object):
// every call here passes an out, from a ring of 8 scratch objects, so no channel lookup allocates in a frame
const CH_INTO = typeof CORE.channelInto === 'function' ? CORE.channelInto : channel;
const CH_RING = [{ c: 0, h: 0 }, { c: 0, h: 0 }, { c: 0, h: 0 }, { c: 0, h: 0 }, { c: 0, h: 0 }, { c: 0, h: 0 }, { c: 0, h: 0 }, { c: 0, h: 0 }];
let chI = 0;
const PB_R = { l: 0, r: 0 };
const DEEP_K = [0, 0, 10];   // the dark the backdrop dims toward
const RGB_RED5A = rgb('#ff3d5a'), RGB_MINT = rgb('#7dffb0');
const numAsc = (a, b) => a - b;
// line dash patterns, shared and never mutated (setLineDash copies them: no array literal per call)
const LD_10_12 = [10, 12], LD_12_8 = [12, 8], LD_12_9 = [12, 9], LD_2p4_2 = [2.4, 2], LD_4_5 = [4, 5], LD_5_6 = [5, 6], LD_6_6 = [6, 6], LD_8_6 = [8, 6];
const CLOSE_MIN_R = Number.isFinite(CORE.CLOSE_MIN) ? CORE.CLOSE_MIN : 62, CLOSE_BY_R = Number.isFinite(CORE.CLOSE_BY) ? CORE.CLOSE_BY : 22;   // playBand's reused out object
const chan = (y, side, out) => CH_INTO(y, side, out || CH_RING[chI = (chI + 1) & 7]);
// reused dash arrays (setLineDash copies them: no array literal per frame)
const DASH_DOT = [2, 4], DASH_RING = [4, 4], DASH_NONE = [], DASH_BRK = [3, 3], DASH_LOW = [5, 4], DASH_GUIDE = [1.5, 5];
const FILL_SLACK = { net2: 0.6, seaRay: 0.45, swell: 0.4, seaRbc: 0.3, vig2: 0.2, near: 0 };
const SPR = 2.5;                              // pixel scale of baked crowd heads
const TXT_MAX = 64;                           // baked text sprites kept (LRU)
const BAKES_PER_FRAME = 2;                    // new text sprites a frame may paint (pops beyond that wait a frame)
// precomputed rainbow strings (36 hues, 10 degrees apart) so hot loops never build colour strings
const HSL65 = [], HSL75 = [], HSL82 = [];
for (let i = 0; i < 36; i++) { HSL65.push(`hsl(${i * 10},100%,65%)`); HSL75.push(`hsl(${i * 10},100%,75%)`); HSL82.push(`hsl(${i * 10},100%,82%)`); }
const hueI = (deg) => ((Math.round(deg / 10) % 36) + 36) % 36;
const RINGC = [];
// the link kinds' chip colours (main.js LINK_CHIP): Kevin's STYLE tail wears one stripe per kind landed in the window
const LINK_COL_FB = { pass: '#fff4f8', rival: '#ffd75c', close: '#5ce1ff', dodge: '#5ce1ff', gate: '#d9b8ff', draft: '#b8f0ff', slingshot: '#ffd75c', weave: '#7dffb0',
  snipe: '#ff8fc8', bump: '#ffb36b', pop: '#f4eef7', domino: '#ffd75c', sugar: '#7dffb0', dna: '#ff8be0', trick: '#ffd75c', cash: '#7dffb0' };
// single source: content.js LINK_CHIP = { kind: [LABEL, colour] }; the literal above is the fallback while it is missing
const LINK_COL = K.LINK_CHIP && typeof K.LINK_CHIP === 'object'
  ? Object.assign({}, LINK_COL_FB, Object.fromEntries(Object.entries(K.LINK_CHIP).filter(([, v]) => Array.isArray(v) && v[1]).map(([k, v]) => [k, v[1]])))
  : LINK_COL_FB;
const SGN = [-1, 1], NODASH = [], DOT_POP = [0.5, 5.5], DASH_FORK = [2, 7], DASH_FORK_L = [2, 12], DASH_FOAM = [14, 30];   // shared, never mutated
const S_ZERO = [0], S_LEFT = [-1], S_RIGHT = [1], S_BOTH = [-1, 1];   // the sides() answers (constant: no array a call)
const forkWv = (dh) => Math.min(130, 10 + dh * 0.42);   // the far Fork silhouette's half width dh below its apex
// a pop word's fill on a bright floor: warm golds and oranges stay gold, everything else turns white
const BRIGHTC = new Map();
const brightCol = (col) => {
  let v = BRIGHTC.get(col);
  if (v === undefined) { const c = colOf(col); v = c[0] > 200 && c[1] > 120 && c[2] < 150 ? '#ffd75c' : '#ffffff'; if (BRIGHTC.size < 64) BRIGHTC.set(col, v); }
  return v;
};
const wallKey = (w) => ((w[0] | 0) << 16) | ((w[1] | 0) << 8) | (w[2] | 0);   // a colour's integer cache key
const seaFold = (y, bk) => (12 + 2 * Math.sin(y * TAU / 140)) * (1 + 0.03 * bk);   // the Sea wall's fleshy fold, 10..14 px (+3% on the beat)
const SHIELD_LBL = [];   // the shield count's 'x5' labels
const SPRINT_COL = rgb('#ff5a3c');
// per-kind shake: [base Hz, amplitude exponent, roll multiplier] (the default is 9 Hz, tr^1.3, 1: the old shake)
const SHAKE_KIND = { bonk: [6, 1.3, 1], goo: [6, 1.3, 1], bump: [10, 1.3, 1], swat: [10, 1.3, 1], shove: [10, 1.3, 1], blast: [10, 1.3, 1],
  shieldHit: [18, 1.6, 1], wingHit: [18, 1.6, 1], bite: [8, 1.3, 1.3], death: [8, 1.3, 1.3], player: [8, 1.3, 1.3], wbc: [8, 1.3, 1.3],
  frenzy: [12, 1.3, 1], frenzy1: [12, 1.3, 1], milestone: [12, 1.3, 1], second: [12, 1.3, 1], pass: [12, 1.3, 1], zone: [12, 1.3, 1] };
const KEVIN_HITS = new Set(['kevin', 'player', 'hit', 'shieldHit', 'wingHit', 'second', 'bonk', 'swat', 'acid', 'stuck', 'death']);
const FORK_I_R = Math.max(0, ZONES.findIndex((z) => z.fork));
// size hierarchy: the crowd at most 1.0, the named rivals 1.4, Kevin 1.56 (the hero silhouette, always the biggest)
const RIVAL_SC = 1.4, KEVIN_SC = 1.56;
const HEADWEAR = ['cap', 'mohawk', 'bow'];   // accessories on top of his head: the race bib drops 1.5 units under them
const TILE_CACHE = 5;                         // zone tiles kept baked
const PIECE_IDS = new Set(['launch', 'acid', 'goo', 'sea', 'fork', 'rapids', 'egg']);   // zones with midground set pieces
const GOO_I_R = ZONES.findIndex((z) => z.id === 'goo');
const EGG_I_R = ZONES.findIndex((z) => z.id === 'egg');
const NRIV = Array.isArray(K.RIVALS) ? K.RIVALS.length : 5;   // the named rivals are race.agents[0 .. NRIV - 1]
// every field drawPlayer's face code may set on its persistent options object (reset to undefined each frame)
const KEV_RESET = ['dizzy', 'mouth', 'ouch', 'brow', 'star', 'happy', 'puff', 'blush', 'tired', 'shock', 'wink', 'headK', 'amp', 'curl', 'tw', 'tlen',
  'sx', 'sy', 'lookY', 'crown', 'ko', 'tail', 'round', 'tipCol', 'shadesY', 'shadesR', 'shadesS', 'shadesOff', 'quiff', 'quiffK', 'cap', 'name', 'bob', 'nameCol', 'lbl', 'key', 'stripeN', 'lid', 'blushCol', 'heart', 'tiara', 'shadeCol', 'bib', 'bibFl', 'bibDown', 'mods', 'flapSide', 'twinkle'];
// in-race body mods: the mutations that change Kevin's own body (drawPlayer, scaled by the stack count)
const BODY_MOD = new Set(['tank', 'turbo', 'ram', 'antacid', 'magnet', 'goo', 'echo']);
// hazard readability: a dark outer outline and a cream top-left rim on every hazard
const TAIL_INK = 'rgba(42,10,36,0.5)', KEV_TAIL = '#ff5a8a';
const NEAR_MINT = '#7dffb0';   // a Big Macro's near-miss ring when it pays (or Kevin is inside it)
const DASH_GRAZE_R = Number.isFinite(CORE.DASH_GRAZE) ? CORE.DASH_GRAZE : 30;   // the heroes' tail under-layer
const HZ_INK = '#2a0a24', HZ_CREAM = 'rgba(255,244,226,0.7)';
// glow colours each zone's floaters use (prewarm bakes them before the gate)
const ZGLOW = { launch: ['#ff9ac0'], acid: ['#9dff3c', '#3d7a3a'], goo: ['#fff0c8', '#ffcf7a'], sea: ['#ff8a9c'], fork: ['#ff8be0', '#788cc8'], rapids: ['#ffffff'], egg: ['#ffd77a', '#fff3c0'] };
// burst colours the race throws most (prewarmRun bakes their dots during the countdown)
const BURST_COLS = ['#ffd75c', '#ff5cd2', '#7dffb0', '#5ce1ff', '#ffffff', '#8cdcff', '#f4eef7', '#9dff3c', '#ff8be0', '#9ae2ff', ...HEAT];
// the style ribbon (STYLE 4 and 5): three colours cycling down Kevin's trail
const RIBBON = ['#ff5cd2', '#5ce1ff', '#ffd75c'];
// a swallowed rival's signature item (rivalSwallow) and its colour
const RIVAL_ITEM = { Chad: 'crown', Tiffany: 'book', Brock: 'band', Gunther: 'mohawk', Steve: 'cap' };
const RIVAL_ITEM_COL = { crown: '#ffd75c', book: '#ff8be0', band: '#ff7a2f', mohawk: '#ff3d6e', cap: '#5b7cff' };
const GH_AL_DASH = [0.35, 0.22, 0.1], GH_AL_TRICK = [0.32, 0.2, 0.1];   // the afterimages' alphas, newest first
// signature tricks a rival shows the first time Kevin meets it (and how long one play of each lasts)
const MEET_TRICK = { Steve: 'wave', Brock: 'flex', Tiffany: 'peek', Gunther: 'roll', Chad: 'flick' };
const TRICK_DUR = { wave: 0.9, flex: 0.6, peek: 0.75, roll: 0.5, flick: 0.45, bow: 0.8, smug: 0.9 };
// a line for rival fn from an optional content table ({ Steve: [...] }, { Steve: '...' } or a plain array)
const lineOf = (tbl, fn, full) => {
  if (!tbl) return '';
  let v = Array.isArray(tbl) ? tbl : tbl[full] || tbl[fn] || tbl.default || tbl.any;
  if (Array.isArray(v)) v = v.length ? v[Math.floor(Math.random() * v.length)] : '';
  if (typeof v !== 'string') return '';
  // the line goes in a bubble over the speaker: a 'Steve: "..."' line drops its name and quotes
  const m = v.match(/^\s*\w+:\s*"/);
  return m ? v.slice(m[0].length).replace(/"\s*$/, '') : v;
};

// the same named rival (one agent, or two agent objects carrying the same rival index k)
const sameRival = (a, b) => a === b || (!!a && !!b && !!a.boss && !!b.boss && a.k != null && a.k === b.k);

function mk(w, h) {
  if (typeof document !== 'undefined') { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; }
  return new OffscreenCanvas(w, h);
}
// kept frame buckets (a frame reset is b.n = 0, never .length): a number bucket is { n, a } over a Float32Array(1024)
// that doubles when full and is kept; an object bucket is { n, a } over a plain array written by index
const nbuf = () => ({ n: 0, a: new Float32Array(1024) });
function nbFit(b, k) { if (b.n + k > b.a.length) { const a = new Float32Array(Math.max(b.a.length * 2, b.n + k)); a.set(b.a); b.a = a; } return b.a; }
function nb1(b, x) { const a = nbFit(b, 1); a[b.n++] = x; }
function nb3(b, x, y, z) { const a = nbFit(b, 3); a[b.n++] = x; a[b.n++] = y; a[b.n++] = z; }
function nb4(b, x, y, z, w) { const a = nbFit(b, 4); a[b.n++] = x; a[b.n++] = y; a[b.n++] = z; a[b.n++] = w; }
const obuf = () => ({ n: 0, a: [], b: [] });   // (b: a parallel array, e.g. each agent's aux record)
function seeded(s) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// a small stable id per face part name ('grin', 'angry' ...; 0 for none), for drawAgents' numeric face key
const FACE_IDS = new Map();
function faceId(s) { if (s == null) return 0; let v = FACE_IDS.get(s); if (v === undefined) { v = (FACE_IDS.size + 1) & 63; FACE_IDS.set(s, v); } return v; }
// a hexagon round (x, y) at radius r, turned a0, added to the current path (drawShields; no closure a frame)
function hexPath(c, x, y, r, a0) { for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU + a0, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (k) c.lineTo(px, py); else c.moveTo(px, py); } }
// set ctx to M * translate(x, y) * rotate(r) * scale(sx, sy) without save/restore
function setXf(c, m, x, y, r, sx, sy) {
  const cs = Math.cos(r), sn = Math.sin(r);
  c.setTransform((m.a * cs + m.c * sn) * sx, (m.b * cs + m.d * sn) * sx, (m.c * cs - m.a * sn) * sy, (m.d * cs - m.b * sn) * sy, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
}

export class Renderer {
  constructor(cv) {
    // every field the renderer used to add lazily mid-run (this.x || (this.x = ...), a first write in some zone),
    // declared up front so the renderer object keeps ONE hidden class all run: each lazy add changed its map and
    // threw the optimized draw code back to baseline (where every float op allocates). Numbers start NaN (the same
    // truthiness and arithmetic as undefined); the rest, and numbers some code tests against null, start undefined
    this.youOff = NaN; this.birthSwell = NaN; this.fdt = NaN; this.labelN = NaN; this.beatU = NaN; this.beatF = NaN;
    this.padW = NaN; this.padB = NaN; this.zoneFaceT = NaN; this.shHzT = NaN; this.shExp = NaN; this.shRotK = NaN;
    this.shHz = NaN; this.shPh = NaN; this.zi = NaN; this.bt = NaN; this.wcB = NaN; this.dimA = NaN;
    this.blendW = NaN; this.fsN = NaN; this.coilF = NaN; this.calmT = NaN; this.ticT = NaN; this.flapSd = NaN;
    this.bibSwapT = NaN; this.buddyX = NaN; this.buddyY = NaN; this.headK = NaN; this.youA = NaN; this.popGapK = NaN;
    this.headUp = NaN; this.imgScreens = NaN; this.imgWantS = NaN; this.lastDrawMs = NaN; this.trAddT = NaN;
    this.trAddA = NaN; this.youDropS = NaN; this.youDropT = NaN; this.youDropD = NaN; this.scrimGK = NaN;
    this.txtIxN = NaN; this.signPad = NaN; this.beatN = NaN; this.kLaunch = NaN; this.shRot = NaN; this.passN = NaN;
    this.passTI = NaN; this.zoneFaceD = NaN; this.gooWashH = NaN; this.wsGooK = NaN; this.wsGooH = NaN;
    this.youHold = NaN; this.net2K = NaN; this.seaRay2H = NaN; this.wsSeaK = NaN; this.rwK = NaN;
    this.eggTubeOn = NaN; this.fwGF = NaN; this.wsRapK = NaN; this.sunX = NaN; this.sunR = NaN; this.shaftH = NaN;
    this.joltT = NaN; this.popCh = NaN; this.popChT = NaN; this.cTier = 0; this.cTierN = 0;
    this.heroCv = undefined; this.bangSpr = undefined; this.race = undefined; this.ts = undefined;
    this.labelQ = undefined; this.beatOn = undefined; this.pvBeat = undefined; this.safeBack = undefined;
    this.worldM = undefined; this.wm = undefined; this.gooOn = undefined; this._wcO = undefined;
    this.wallSt = undefined; this.patM = undefined; this.moodC = undefined; this.sunY = undefined;
    this.pieces = undefined; this.farS = undefined; this.farRimD = undefined; this.slvM = undefined;
    this.hfB = undefined; this.acidImm = undefined; this.safeNow = undefined; this.gooSurf = undefined;
    this._wbcPrev = undefined; this.coilOn = undefined; this._vis = undefined; this._close = undefined;
    this._cand = undefined; this._tb = undefined; this._hb = undefined; this.bubL = undefined; this.kevO = undefined;
    this.kevCol = undefined; this.kLook = undefined; this.ticNext = undefined; this.kThreat = undefined;
    this.kVxL = undefined; this.bibRace = undefined; this.bibN = undefined; this.hookMU = undefined;
    this.hookModK = undefined; this.tlX = undefined; this.tlY = undefined; this.tlNX = undefined;
    this.tlNY = undefined; this.tlHW = undefined; this.tlLX = undefined; this.tlLY = undefined; this.tlRX = undefined;
    this.tlRY = undefined; this.youX = undefined; this.youY = undefined; this.streakL = undefined;
    this.drops = undefined; this.dropL = undefined; this.confB = undefined; this.confL = undefined;
    this._placed = undefined; this._wgP = undefined; this._wg = undefined; this.heroO = undefined;
    this.heroT = undefined; this.heroBk = undefined; this.drawEma = undefined; this.stripS = undefined;
    this.stripRace = undefined; this._cv = undefined; this._sx = undefined; this.kBk = undefined;
    this.firstRun = undefined; this.launchT = undefined; this._kevGlow = undefined; this.coachO = undefined;
    this.kStripes = undefined; this.hudEl = undefined; this.scrimG = undefined; this.txtIx = undefined;
    this.tutEl = undefined; this.labKeys = undefined; this.beatAt = undefined; this.punchAt = undefined;
    this.lcols = undefined; this._lsort = undefined; this.passC = undefined; this.passTs = undefined;
    this.ghostS = undefined; this.wbcM = undefined; this.wbcSprs = undefined; this.sightSprs = undefined;
    this.huffNew = undefined; this.bubF = undefined; this._bubC = undefined; this.bubLo = undefined;
    this.zoneFaceId = undefined; this.causP = undefined; this.causS = undefined; this.acidPM = undefined;
    this.acidFogG = undefined; this.shimG = undefined; this._acidPop = undefined; this.gooEdgeG = undefined;
    this.gooEdgeK = undefined; this.gooWashG = undefined; this.gooBokC = undefined; this.lensS = undefined;
    this.gooSpecG = undefined; this.wsGooB = undefined; this.wsGooC = undefined; this.wsGooA = undefined;
    this._gGaps = undefined; this._gSeg = undefined; this.colG = undefined; this.causL = undefined;
    this.seaL = undefined; this.seaRay2C = undefined; this.seaRay2G = undefined; this.clS = undefined;
    this.rcS = undefined; this.rcB = undefined; this.rcD = undefined; this._ys = undefined; this._xs = undefined;
    this.wsSeaA = undefined; this.rcF = undefined; this.forkNK = undefined; this.forkNF = undefined;
    this.forkNB = undefined; this.forkDark = undefined; this.rwD = undefined; this.rwL = undefined;
    this.pieceJobs = undefined; this._dvL = undefined; this._dvR = undefined; this._dvY = undefined;
    this.forkG = undefined; this.forkMouthG = undefined; this.shoalZ = -1; this.shoalC = ''; this.fsQ = undefined; this._fwL = undefined; this._fwG = undefined; this.bvig = undefined;
    this.wsRapA = undefined; this._wcK = undefined; this._wcS = undefined; this._cc = undefined;
    this._sun = undefined; this.shaftG = undefined; this.vsKO = undefined; this.vsRO = undefined;
    this.vsWC = undefined; this.eggB = undefined; this.eggBK = undefined; this.duelBub = undefined;
    this._dbR = undefined; this._dbH = undefined; this._dbD = undefined; this._bd = undefined;
    // an opaque context (the DOM HUD always overlaps the canvas, so a desynchronized one gains nothing and risks tearing)
    let ctx = null;
    try { ctx = cv.getContext('2d', { alpha: false }); } catch (e) { ctx = null; }
    this.cv = cv; this.ctx = ctx || cv.getContext('2d');
    this.pops = []; this.rings = []; this.time = 0;
    // Kevin's trail: a preallocated ring (x, y, hue), trH = next slot, trN = samples held
    this.trX = new Float32Array(TRAIL_N); this.trY = new Float32Array(TRAIL_N); this.trHue = new Float32Array(TRAIL_N); this.trH = 0; this.trN = 0;
    this.sDeep = [0, 0, 0]; this.sLite = [0, 0, 0]; this.sWall = [0, 0, 0]; this.vigs = []; this.bigBoxes = []; this.bigBoxN = 0;
    this.bankTarget = { x: 26, y: 24 }; this.onBankLand = null; this.breakVig = 0; this.heroOn = false; this.zoom = 1; this.zoomK = 0;
    this.glows = new Map(); this.dots = new Map(); this.tiles = new Map(); this.vig = null;
    this.txt = new Map(); this.heads = new Map();
    this.wbcState = new WeakMap(); this.duel = new Map();
    // per-agent display state (smoothed x, knockback, heading, timers, trick clocks) lives here, never on core's agents
    this.aux = new WeakMap(); this.eaux = new WeakMap();
    this.sq = 0; this.sqV = 0; this.prev = { dashT: 0, frenzyT: 0, inv: 0, stuck: 0, shield: 0, combo: 0 };
    this.pHit = 0; this.sweatT = 0; this.eggJig = 0; this.lastDrill = 0;
    this.s = 1; this.H = 800; this.camY = null; this.q = 1; this.dpr = 1;
    // feel: trauma shake, spring kick, rate-limited flash
    this._trauma = 0; this.kx = 0; this.ky = 0; this.kvx = 0; this.kvy = 0;
    this._flash = 0; this._fcol = '#fff'; this.lastFlashT = -9; this.flashRej = false;
    // the photosensitivity hard cap: the onset times of the last 4 flashes (full-screen, gate and edge flashes alike).
    // A 4th onset inside 1.0 s is refused even when lastFlashT was reset to skip the 0.5 s soft gap.
    // noFlash (set by main.js from Settings): every flash becomes the soft edge glow (shake, zoom and particles stay)
    this._flashOn = [-9, -9, -9, -9]; this._flashOnI = 0; this.noFlash = false;
    // set by main.js: beat (0..1 music pulse), reduced (reduced motion), lite (cheaper drawing)
    this.beat = 0; this.reduced = false; this.lite = false;
    // particles: a preallocated ring buffer
    this.P = []; for (let i = 0; i < MAXP; i++) this.P.push({ k: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, col: '#fff', size: 1, g: 0, rot: 0, vr: 0 });
    this.pHead = 0; this.pHW = 0;                 // pHW: one past the highest slot ever used (the update loop stops there)
    this.streaks = new Map(); this.ringSprs = new Map();
    this.probe = null; this.bakes = 0; this.textScale = 1;
    this.paidSeen = new WeakSet(); this.wallC = [255, 255, 255];
    this.tubeG = null; this.tubeGK = '';
    // set by main.js: padTop (CSS px hidden under the top HUD), nemesis (a rival's first name or null)
    this.padTop = 0; this.nemesis = null; this.cssK = 1; this.thumbY = null; this.thumbK = 0;
    // set by main.js: padBot (CSS px hidden under the bottom combo strip), teach (a teaching moment: sight rings louder)
    this.padBot = 0; this.teach = false;
    this.deepCss = '#2a0618'; this.tileJobs = new Map(); this.imp = null; this.ghosts = [];
    // directional trauma: the axis a hit came from shakes harder for a moment
    this.tAx = 1; this.tAy = 1; this.tDirT = 0;
    // per-frame wall cache (centre, half width, wobble every 11 px per side) and reused tube buffers
    this.wc = [null, null, null]; this.wcF = [-1, -1, -1]; this.wcY0 = 0; this.wcN = 0;
    this.tubeL = [new Float32Array(256), new Float32Array(256)]; this.tubeR = [new Float32Array(256), new Float32Array(256)]; this.tubeN = [0, 0];
    this.duelPool = []; this.labels = []; this.panic = []; this.crackLv = new Map(); this.crackSprs = new Map();
    // set by main.js (logical units): hudBottom (where the top HUD ends, default 110), bannerBox ({y0, y1} of a live
    // banner, or null), avoidRect ({x, y, w, h} of the DASH button, or null). Canvas text keeps out of all three.
    this.hudBottom = null; this.bannerBox = null; this.avoidRect = null;
    this.comboShown = false;
    // the pops' keep-out boxes (drawFx): the YOU tag (laid out before the pops), every name tag and every named rival
    // seen this frame, as (x, y, w, h) centre boxes in one preallocated buffer
    this.youKO = new Float32Array(4); this.youKOn = 0; this.koR = new Float32Array(4 * 48); this.koN = 0;   // set by main.js: true while the HUD's #combo counter is at opacity 1
    // read by main.js each frame: R.coachBandHit is true while any hazard, Big Macro, gate or pickup is drawn inside
    // the band where Coach's strip sits (hudB() to hudB() + 70 CSS px), so the UI fades #coach off it (reset every frame)
    this.coachBandHit = false; this.coachBox = null; this.claimL = null; this.f900 = null; this.dimZ = 0;
    this._clT = null; this.skF = null; this.dieO = null;   // (drawClutch's pick, drawSidekick's once-a-frame flags and Dieter's look)
    // duelBox ({y0, y1}, logical, set by main.js while the egg duel panel shows wherever it sits): name tags keep out of it
    this.duelBox = null;
    this.signBoxes = []; this.labRects = []; this.labRN = 0; this.pw = { nz: -1, i: 0 }; this.pwrI = 0;
    this.birthS = null;
    // R.marks (main.js): [{ y, kind: 'best' | 'grave', label }] drawn across the tube (see drawMarks)
    this._marks = []; this._marksNew = false;
    // R.coachStage (0 sticker .. 4 race bib) and R.coachEscort (gen 8: he swims zone 1 with Kevin), set by main.js in
    // start(); like R.marks, a value set before a run survives that run's first-frame reset
    this._coachStage = 0; this._coachEscort = false; this._coachNew = false; this.coach = null;
    this.resetRun();
    this.scr = {};
    this.frame = 0; this.ringN = 0; this.imgArea = 0; this.imgWant = 0; this.passRate = 0; this.edgeGold = 0;
    // drawAgents' per-frame helpers, built once (no closures a frame): the panic test and the tail beat rate
    this.pnN = 0; this.agFb = 430; this.agSlow = 1; this.agCoil = false;
    this.nearWB = (a, r, kev = true, A = null) => this.nearW(a, r, kev, A);
    this.frB = (a, A) => this.frOf(a, A);
    this.fillTubeB = () => this.fillTube();
    this.tbNp = 0; this.tbP2 = false; this.tbTP = null; this.tbW0 = null; this.tbW9 = null; this.tbWH = null; this.tbOy = 0;
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { this.txt.clear(); this.bangSpr = null; }).catch(() => {});
  }
  // R.marks: assigning a new array keeps it through the run's first frame (resetRun clears only stale marks)
  get marks() { return this._marks; }
  set marks(v) { this._marks = Array.isArray(v) ? v : []; this._marksNew = true; }
  get coachStage() { return this._coachStage; }
  set coachStage(v) { this._coachStage = clamp(Math.floor(+v || 0), 0, 4); this._coachNew = true; }
  get coachEscort() { return this._coachEscort; }
  set coachEscort(v) { this._coachEscort = !!v; this._coachNew = true; }
  // per-run display state (camY = null from main.js starts a new run)
  resetRun() {
    if (!this._marksNew) this._marks = [];
    if (!this._coachNew) { this._coachStage = 0; this._coachEscort = false; }
    this._marksNew = false; this._coachNew = false; this.corpses = []; this.coach = null;
    this.pPh = 0; this.pTw = 15; this.lean = 0; this.trH = 0; this.trN = 0; this.trailAcc = 0;
    this.banks = []; this.bubble = null; this.claimL = null; if (this.duelBub) this.duelBub.clear(); this.duelOn = false; this.desat = 0; this.ghostA = 0; this.ghostX = 0;
    this.linkRing = []; this.linkRH = 0; this.tracers = []; this.motes = []; this.rivalEaten = null;
    this.lastBreakT = -9; this.lastBankT = -9; this.lastZi = -1; this.gateFlash = 0; this.emberT = 0;
    this.lead = 0.34; this.pAng = null; this.pAngV = 0; this.prevE = null; this.prevOv = null; this.prevTier = 0;
    this.accKey = -1; this.accList = []; this.accRest = []; this.accBand = '#ff3d6e'; this.accNew = null; this.accT = 0;
    this.modCnt = {}; this.modNew = null; this.modT = -9; this.kTl = 34 * 1.15; this.kTw = 4.4; this.kSx = 1; this.kSy = 1;
    this.chompT = 0; this.winkT = 0; this.nearT = 0; this.winT = 0; this.overSeen = null; this.shardsDone = false;
    this.dieT = 0; this.dieSeen = null; this.dieWbc = null; this.diePop = 0; this.linkT = 0;
    this.youT = 0; this.prevPend = null; this.prevRT = null; this.endT = 0; this.stealSaid = false; this.thiefXY = null;
    this.eggCam = 0; this.eggBlinkAt = 0; this.eggBlinkT = -9; this.kPopT = -9; this.kBits = 0; this.kTier = 0; this.kTierT = -9; this.lateCam = false; this.lateReady = false; this.lateFrom = null; this.lateOver = null;
    this.ghosts = []; this.imp = null; this.books = []; this.wedge = null; this.vs = null; this.pvDashCd = null; this.dashRdyT = null; this.kThreatPop = null;
    this.oopsT = 0; this.oopsAt = -9; this.oopsKind = null; this.oopsId = 0;
    this.huffT = 0; this.wallT = 0; this.wallLast = -9; this.wallOn = false; this.dashAge = 9; this.headA = 0;
    this.buddyN = 0; this.buddyFly = []; this.sparkT = 0; this.bibGone = false; this.acidFz = 0; this.birthS = null;
    this.shLast = null; this.shChgT = null; this.popGlows = []; this.gooStr = 0;
    this.pf = null; if (this.wHit) this.wHit.t = 0; this.haloR = 0; this.haloOffT = null;
    // the first two zones are baked before the first frame needs them
    try { this.tile(0); this.tile(1); } catch (e) { /* no canvas yet */ }
  }
  resize(q = this.q) {
    this.q = q === 0 ? 0 : 1;
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    // stage 0 caps at 2, or 1.75 on a big screen where 2 would pass 1.2M canvas pixels
    const top = this.q === 0 ? (this.lite ? 1.25 : 1.5) : w * h * 4 > 1.2e6 ? 1.75 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, top);
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.s = this.cv.width / VIEW_W; this.H = this.cv.height / this.s; this.dpr = dpr; this.cssK = w > 0 ? VIEW_W / w : 1;
    // an opaque canvas starts black: paint the zone colour once so a resize never flashes
    const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = this.deepCss; c.fillRect(0, 0, this.cv.width, this.cv.height);
  }
  // the screen-space matrix (scale s, no shake) as a reused object for setXf (no getTransform() in the draw loop)
  scrM() { const M = this._scrM || (this._scrM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }); M.a = M.d = this.s || 1; return M; }
  // world -> screen (logical units; the canvas transform scales to pixels)
  sy(wy) { return this.H - (wy - this.camY); }
  // an agent's display state (one shape for every agent, created on first sight)
  ax(a) {
    let A = this.aux.get(a);
    if (!A) {
      // one hidden class for every agent: numbers start as numbers (NaN = not yet), A.init says track() has placed it
      // (trT starts at -9: 'the last trick was long ago'; met at -1: 'not met yet')
      A = { init: false, x: NaN, rx: NaN, oy: 0, py: 0, hd: 0, pk: 0, bt: 0, pt: 0, ah: false, av: 0, tf: NaN, tp: NaN, seen: -9, fn: null, kp: 0, jx: 0, ph: 0, sqU: NaN,
        gone: 0, tiltS: NaN, dl: NaN, shv: 0, dr: 0, swt: 0, ppt: NaN, pbt: NaN, ptt: NaN, pgl: false, tr: null, trT: -9, met: -1, dg: 0, drT: 0, dbT: 0,
        stm: 0, mvT: NaN, mvP: '', mvD: 0, mv: null, hop: 0, book: 0, scK: '', sc: '', lbl: null, oops: -1, oopsT: -9, oopsK: null, oopsD: 0, gasp: -9,
        // readable faces: the face key last frame (fk), when it last popped (popT) and the head scale this frame (headK)
        fk: -1, popT: -9, headK: 1,
        // reactive shades (Gunther, Chad): eased lift / tilt / scale, knocked off by a bump (shOff), back on at shBack
        shY: 0, shR: 0, shS: 1, shOff: 0, shBack: -9, shPb: 0,
        // behind Kevin (bh); the chase (chs on, cgp the last gap, cgv its rate, cswT the sweat clock); the pass wake (wkT, wkS)
        bh: 0, chs: 0, cgp: NaN, cgv: 0, cswT: 0, wkT: -9, wkS: 0,
        // every field drawAgents / track() / frOf() fill in later, here up front with a value of its final type (NaN
        // numbers, false flags, null objects), so every agent keeps ONE hidden class and number fields stay unboxed:
        // crowd variety (vk size, arch, vw tail width bucket, vsx / vsy head shape, vtl tail length, vam amp, vbt beat),
        // the per-frame HUD fade (hf), close flag and crossfade (cl, cf), coil spring (cz), last launch puff (lp), the
        // squared distance to Kevin (nd), a rival's cruising pace (rsp), sweat clock (swd), tinted tail key and fill
        // (tfK, tfC: tf itself is the tail beat rate), tired flag (tiredK), blink state (bk), its bubble (bub, bubT),
        // and the sidekicks (sk: Dieter's lagged spot, Gerald's sip clock; see drawSidekicks)
        vk: NaN, arch: NaN, vw: NaN, vsx: NaN, vsy: NaN, vtl: NaN, vam: NaN, vbt: NaN, hf: NaN, cl: NaN, cf: NaN, cz: NaN, lp: NaN, nd: NaN,
        rsp: NaN, swd: NaN, tfK: null, tfC: null, tiredK: NaN, bk: null, bub: null, bubT: NaN, sk: null, fq: NaN,
        // per swimmer: its blink period (bp, fixed) and this frame's far-head scale (fs, farS of its gap to Kevin)
        bp: NaN, fs: NaN,
        // the combo fright (comboFright): when this rival's 1 s beat started (cbT) and the COMBO_WORDS threshold it answers (cbK)
        cbT: -9, cbK: 0,
        // its alpha step while it fades under the HUD (hq: 0..3, -1 clear of it; the batched fade band in drawAgents)
        hq: -1 };
      this.aux.set(a, A);
    }
    return A;
  }
  // a hazard's (or a mark's) display state: last frame drawn, death time, popped, gold flash time, passed time
  ex(e) { let E = this.eaux.get(e); if (!E) { E = { seen: -9, deadT: null, corpse: 0, goldT: null, pt: null, wOn: false, wA: 0, wT: -1 }; this.eaux.set(e, E); } return E; }

  // ---------------------------------------------------------------- feel
  // addTrauma(a, dx, dy, hz): with a direction, that axis shakes 1.5x and the other 0.5x for 0.15 s. hz: the shake's
  // base frequency (a number), or a hit kind (SHAKE_KIND: 'bonk', 'bump', 'shieldHit', 'bite', 'frenzy' ...); without
  // it the shake keeps its frequency (impactFrame sets the kind of the hit it shows). An add of 0.2 or more starts
  // the shake on a random phase, so two hits never shake the same way
  addTrauma(a, dx, dy, hz) {
    if (hz != null) this.shakeAs(hz);
    if (a >= 0.2) this.shPh = (this.shPh || 0) + Math.random() * TAU;
    // a hit that jolted the camera this frame (impactFrame) shakes about 30% less; what was added this frame is
    // remembered so a jolt that lands after the shake can take its share back
    if (this.joltT === this.time) a *= 0.7;
    const t0 = this._trauma;
    this._trauma = Math.min(this.reduced ? 0.35 : 1, this._trauma + Math.max(0, a));
    if (this.trAddT !== this.time) { this.trAddT = this.time; this.trAddA = 0; }
    this.trAddA += this._trauma - t0;
    if (dx != null || dy != null) {
      const hx = Math.abs(+dx || 0) >= Math.abs(+dy || 0);
      this.tAx = hx ? 1.5 : 0.5; this.tAy = hx ? 0.5 : 1.5; this.tDirT = 0.15;
    }
    // a real hit snaps the spring at once, so even the first held frame of a hit-stop moves (not for reduced motion)
    if (a >= 0.2 && !this.reduced) {
      const ddx = +dx || 0, ddy = +dy || 0, dir = dx != null || dy != null;
      const sx = dir ? (ddx ? Math.sign(ddx) : 0) : Math.random() < 0.5 ? -1 : 1, sy = dir ? (ddy ? Math.sign(ddy) : 0) : Math.random() < 0.5 ? -1 : 1;
      this.kvx += sx * 260 * a; this.kvy += sy * 260 * a;
    }
  }
  // the shake's character for a hit kind (or a plain frequency): its base frequency (eased in over 0.1 s by drawFrame),
  // its amplitude curve (tr^1.6 for the sharp shield and wingman rattles, else tr^1.3) and its roll (1.3x for a bite)
  shakeAs(k) {
    const S = typeof k === 'number' ? null : SHAKE_KIND[k];
    if (typeof k === 'number') { if (!(k > 0)) return; this.shHzT = clamp(k, 2, 24); this.shExp = 1.3; this.shRotK = 1; return; }
    if (!S) return;
    this.shHzT = S[0]; this.shExp = S[1]; this.shRotK = S[2];
  }
  // old API: `shake = n` adds trauma n/14; a smaller value caps it (reduced-motion clamp)
  get shake() { return this._trauma * 14; }
  set shake(v) { const a = clamp((+v || 0) / 14, 0, 1); if (a < this._trauma - 1e-6) this._trauma = a; else if (a > this._trauma + 1e-6) this.addTrauma(a); }
  // a directional camera nudge that springs back
  kick(dx, dy) { const k = this.reduced ? 60 : 380; this.kvx += dx * k; this.kvy += dy * k; }
  // full-screen flash (photosensitive safety): a new flash less than 0.5 s after the last one (gate flashes
  // included) is ignored (main.js may reset lastFlashT to skip that soft gap for a big moment); a flash that would be
  // the 4th onset inside 1.0 s is ignored ALWAYS (the hard cap, flashOk). The drawn alpha is capped at 0.4, 0.25 for
  // red, for every flash, bypassed ones included (flash = 0.8 or 1 still draws at 0.4 / 0.25, see drawFrame); reduced
  // motion and R.noFlash get an edge glow only
  get flash() { return this._flash; }
  set flash(v) {
    v = +v || 0;
    if (v > this._flash + 0.01) {
      if (this.time - this.lastFlashT < 0.5 || !this.flashOk()) { this.flashRej = true; return; }
      this.lastFlashT = this.time; this.flashRej = false;
    }
    this._flash = v;
  }
  // the hard cap: true (and the onset is recorded) when a flash may start now, i.e. fewer than 3 onsets in the last 1.0 s
  flashCount(now = this.time) { let n = 0; for (const f of this._flashOn) if (now - f < 1.0 && now - f >= 0) n++; return n; }
  flashOk(now = this.time) {
    if (this.flashCount(now) >= 3) return false;
    this._flashOn[this._flashOnI] = now; this._flashOnI = (this._flashOnI + 1) % 4;
    return true;
  }
  get flashCol() { return this._fcol; }
  set flashCol(v) { if (!this.flashRej) this._fcol = v; }
  get parts() { return this.P; }
  set parts(v) { for (const q of this.P) q.life = 0; }

  // ---------------------------------------------------------------- public juice
  addP(k, x, y, vx, vy, life, col, size, g = 0, rot = 0, vr = 0) {
    const lim = this.lite ? MAXP_LITE : MAXP;
    if (this.pHead >= lim) this.pHead = 0;
    // a full buffer: look up to 8 slots ahead for a dead particle before overwriting a live one (the win climax survives)
    if (this.pHW >= lim && this.P[this.pHead].life > 0) {
      for (let i = 1; i <= 8; i++) { const j = (this.pHead + i) % lim; if (!(this.P[j].life > 0)) { this.pHead = j; break; } }
    }
    const q = this.P[this.pHead]; this.pHead = (this.pHead + 1) % lim;
    if (this.pHead === 0) this.pHW = Math.max(this.pHW, lim); else this.pHW = Math.max(this.pHW, this.pHead);
    q.k = k; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.max = life; q.col = col; q.size = size; q.g = g; q.rot = rot; q.vr = vr;
  }
  burst(x, y, col, n = 10, spd = 120, life = 0.6, size = 3) {
    n = Math.min(n, this.lite ? 18 : 60);
    // each particle lives life * 0.65..1.35 (no shared fade-out), and the first quarter leaves at 1.3x: a fast leading edge
    const lead = Math.ceil(n * 0.25);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = spd * (0.3 + Math.random()) * (i < lead ? 1.3 : 1);
      this.addP(i % 4 === 0 ? 1 : 0, x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.65 + 0.7 * Math.random()), col, size * (0.5 + Math.random()));
    }
  }
  // R.popFx(x, y, chain): a popped Big Macro, escalating with the pop chain (main.js counts it, 0.7 s apart at most)
  // the way the pop sound climbs. 1: the cream burst plus 4 lilac membrane shards; 2: 28 particles and a 44 px ring in
  // the chain's ring colour; 3: 34 particles (a third gold), a 60 px ring and a 6-spoke star of streaks; 4+: 40
  // particles, an 80 px gold ring, 10 shards and a 0.12 s white outline glow where the cell was. Half the counts on
  // lite; reduced motion keeps the counts and drops the spokes.
  popFx(x, y, chain = 1) {
    const ch = Math.max(1, chain | 0), lite = this.lite, cnt = (n) => (lite ? Math.ceil(n / 2) : n);
    this.popCh = ch; this.popChT = this.time;   // (impactFrame's pop jolt grows with the chain step)
    const shard = (n, col, v0, v1) => {
      for (let i = 0; i < n; i++) {
        const d = i / n * TAU + Math.random() * 0.5, v = v0 + Math.random() * (v1 - v0);
        this.addP(5, x, y, Math.cos(d) * v, Math.sin(d) * v, 0.5 + Math.random() * 0.15, col, 4 + Math.random() * 2, 0, d, (Math.random() * 2 - 1) * 12);
      }
    };
    if (ch <= 1) {
      this.burst(x, y, '#f4eef7', cnt(24), 220, 0.7, 4);
      shard(cnt(4), '#d9b8ff', 140, 240);
      return;
    }
    // it keeps escalating past chain 4: 5 throws 48, 6 and up 56 (all halved on lite)
    const n = ch === 2 ? 28 : ch === 3 ? 34 : ch === 4 ? 40 : ch === 5 ? 48 : 56, spd = ch === 2 ? 250 : ch === 3 ? 290 : ch === 4 ? 320 : ch === 5 ? 340 : 360;
    if (ch === 2) this.burst(x, y, '#f4eef7', cnt(n), spd, 0.7, 4);
    else {   // a third of it gold
      const g = Math.round(n / 3);
      this.burst(x, y, '#f4eef7', cnt(n - g), spd, 0.7, 4);
      this.burst(x, y, '#ffd75c', cnt(g), spd, 0.7, 4);
    }
    shard(cnt(ch >= 4 ? 10 : 4), '#d9b8ff', 150, 260);
    if (ch === 2) this.ring(x, y, this.ringCol(0.5), 44, 0.25, 4);
    else if (ch === 3) this.ring(x, y, this.ringCol(0.75), 60, 0.28, 4.5);
    else if (ch === 4) this.ring(x, y, '#ffd75c', 80, 0.32, 5);
    else {   // 5 and up: a 100 px gold ring and a 60 px white one inside it
      this.ring(x, y, '#ffd75c', 100, 0.36, 5.5);
      this.ring(x, y, '#ffffff', 60, 0.28, 4);
    }
    if (ch >= 6) {   // 6 and up: a 0.15 s gold glow round the screen edges (photosensitivity-gated) and confetti
      if (this.flashOk()) this.edgeGold = 0.15;
      this.confetti(x, y, lite ? 14 : 28);
    }
    if (ch >= 3 && !this.reduced) {   // the star: 6 spokes of fast streaks (2 per spoke, 1 on lite), turned per chain
      const a0 = Math.random() * TAU + ch * 0.4, per = lite ? 1 : 2;
      for (let s = 0; s < 6; s++) {
        const d = a0 + s * TAU / 6;
        for (let j = 0; j < per; j++) { const v = spd * 1.4 * (0.8 + 0.25 * j); this.addP(6, x, y, Math.cos(d) * v, Math.sin(d) * v, 0.32, ch >= 4 ? '#ffd75c' : '#ffffff', 3); }
      }
    }
    if (ch >= 4) {   // the dying cell's outline flashes white for 0.12 s
      const G = this.popGlows || (this.popGlows = []);
      G.push({ x, y, life: 0.12 }); if (G.length > 6) G.shift();
    }
  }
  // style: optional. 'think' draws it as one of Kevin's thoughts (italic cream on a soft plum plate with a little bubble
  // tail toward him, full for 0.8 s then fading, lifted 24 px over a pop born in the last 0.3 s), never a combo word
  pop(x, y, text, col = '#fff', size = 16, life = 1.1, style = null) {
    const size0 = +size || 16, small = size0 < 16, big = size0 >= 20, think = style === 'think' && !big, plate = size0 <= 16 && !think;
    // a big moment owns the stage: little pops keep quiet while one is up
    if (small && this.pops.some((q) => q.big)) return;
    if (big) {
      for (let i = this.pops.length - 1; i >= 0; i--) { const q = this.pops[i]; if (!q.big && Math.abs(q.x - x) < 80 && Math.abs((q.dy != null ? q.dy : q.y) - y) < 80) this.pops.splice(i, 1); }
    }
    if (small) life *= 0.7;
    if (!big) life = Math.max(0.9, +life || 0.9);   // small pops stay up at least 0.9 s (readable on a phone)
    size = Math.max(14, size0) * (this.textScale || 1);
    // big pops share ONE headline slot: a newcomer waits behind the live one, which then has at most 0.35 s left
    // (but stays up at least 0.6 s in all). At most two wait; the oldest waiting one gives way.
    if (big) {
      let nb = 0, b0 = null, b1 = null;   // one counting pass (no filter() garbage)
      for (const q of this.pops) if (q.big) { if (nb === 0) b0 = q; else if (nb === 1) b1 = q; nb++; }
      if (b0) b0.life = Math.min(b0.life, Math.max(0.35, 0.6 - b0.age));
      if (nb >= 3) this.pops.splice(this.pops.indexOf(b1), 1);
      if (this.pops.length >= 4) { const k = this.pops.findIndex((q) => !q.big); if (k >= 0) this.pops.splice(k, 1); }
      this.pops.push({ x, y, dy: y, text: String(text), col, size, big, age: 0, life, max: life, al: 1, rot: this.reduced ? 0 : (Math.random() - 0.5) * 0.25, think: false, plate: false });
      return;
    }
    // stack below any live pop it would overlap: spaced by the sprites' heights (about 1.7x the font size), the
    // newcomer at its 1.35x birth scale and a live one too while it is fresh (its first 0.18 s), 5% apart plus 4 CSS px
    const ck = this.cssK || 1, hNew = size * 1.7 * 1.35;
    for (let it = 0; it < 6; it++) {
      let hit = false;
      for (const q of this.pops) {
        if (q.big) continue;
        const qy = q.dy != null ? q.dy : q.y, hq = q.size * 1.7 * (q.age < 0.18 ? 1.35 : 1), gap = (hNew + hq) / 2 * 1.05 + 4 * ck;
        if (Math.abs(qy - y) < gap - 1e-6 && Math.abs(q.x - x) < 80) { y = qy - gap; hit = true; }
      }
      if (!hit) break;
    }
    // a thought keeps clear of what just happened: 24 px above any pop born in the last 0.3 s
    if (think) for (const q of this.pops) if (q.age < 0.3) { y += 24; break; }
    // at most 3 small ones live: drop the oldest first
    let ns = 0;
    for (const q of this.pops) if (!q.big) ns++;
    for (; ns >= 3; ns--) this.pops.splice(this.pops.findIndex((q) => !q.big), 1);
    this.pops.push({ x, y, dy: y, text: String(text), col: think ? '#fff4dc' : col, size, big, age: 0, life, max: life, al: 1, rot: this.reduced || think ? 0 : (Math.random() - 0.5) * 0.25, think, plate });
  }
  // an expanding shockwave ring at world (x, y)
  ring(x, y, col = '#fff', r = 70, life = 0.45, w = 5) {
    if (this.reduced && (this.ringN++ & 1)) return;
    this.rings.push({ x, y, col, r, life, max: life, w });
    if (this.rings.length > 16) this.rings.shift();
  }
  // party paper. With no position it rains from the top of the screen.
  confetti(x, y, n = 60) {
    const rain = x == null;
    n = Math.min(n, this.lite ? 50 : 120);
    if (this.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const col = ['#ffd75c', '#ff5c8a', '#5ce1ff', '#7dffb0', '#b84dff', '#ffffff'][i % 6];
      const px = rain ? Math.random() * VIEW_W : x, py = rain ? this.camY + this.H + 20 + Math.random() * 120 : y;
      const a = Math.random() * TAU, v = rain ? 40 : 160 + Math.random() * 260;
      this.addP(2, px, py, Math.cos(a) * v, rain ? -60 - Math.random() * 80 : Math.sin(a) * v + 160, 2.4, col, 3 + Math.random() * 3, 260, Math.random() * TAU, (Math.random() - 0.5) * 14);
    }
  }
  // a quick camera zoom-in on the player that springs back
  zoomPunch(amt = 0.08) { if (this.reduced) return; this.punchAt = this.time; this.zoomK = Math.max(this.zoomK, Math.min(0.25, amt)); }
  // the opposite: the camera pulls back a touch (a dash), easing home over about 0.3 s
  zoomPull(amt = 0.06) { if (this.reduced) return; this.zoomK = Math.min(this.zoomK, -Math.min(0.12, Math.abs(+amt || 0.06))); }
  // the combo ring shatters (main.js: core event 'comboBreak'; n is the chain that broke). Bigger chains throw
  // more and faster shards (10 to 24), grey the world out longer, and from 25 flash the edges red-violet
  comboBreak(x, y, n = 0) {
    if (this.time - this.lastBreakT < 0.3) return;
    if (this.haloR > 0) {   // the trick halo snaps out: a quick magenta ring and a few gold shards off its rim
      const hx = this.haloX, hy = this.haloY, R = this.haloR;
      this.ring(hx, hy, '#ff5cd2', R + 26, 0.22, 4);
      for (let i = 0; i < (this.lite ? 4 : 8); i++) { const a = i / 8 * TAU + Math.random() * 0.4; this.addP(5, hx + Math.cos(a) * R, hy - Math.sin(a) * R, Math.cos(a) * 200, -Math.sin(a) * 200, 0.35, '#ffd75c', 4); }
      this.haloR = 0; this.haloOffT = this.time;
    }
    n = Math.max(0, +n || 0);
    this.lastBreakT = this.time; this.desat = 0.2 + Math.min(0.35, n / 120);
    // (it shares the 0.5 s flash limiter: a flash or a gate flash just before means no edge flash)
    if (n >= 25 && this.time - this.lastFlashT >= 0.5 && this.flashOk()) { this.breakVig = 0.25; this.lastFlashT = this.time; }
    this.scatterBuddies();
    const col = this.ringCol(0.1), cnt = Math.round(clamp(10 + n / 4, 10, 24)), sp = 90 + 70 * clamp(n / 60, 0, 1);
    for (let i = 0; i < cnt; i++) {
      const a = i / cnt * TAU + Math.random() * 0.3, v = sp + Math.random() * sp;
      this.addP(5, x + Math.cos(a) * 30, y - Math.sin(a) * 30, Math.cos(a) * v, -Math.sin(a) * v, 0.55, col, 4 + Math.random() * 2, 0, a + Math.PI / 2, (Math.random() - 0.5) * 16);
    }
  }
  // a link landed with the combo timer nearly gone (main.js: core event 'clutch'): the ring snaps gold
  // and sparks fly off the end of the timer arc
  clutch(x, y) {
    const p = this.race && this.race.p;
    if (x == null && p) { x = p.x; y = p.y; }
    if (x == null) return;
    this.ring(x, y, '#ffd75c', 34, 0.22, 7);
    const f = p ? clamp((p.comboT || 0) / (p.comboMax || 1), 0, 1) : 0.1, a = -Math.PI / 2 + TAU * f;
    const ex = x + Math.cos(a) * 30, ey = y - Math.sin(a) * 30, n = this.lite || this.reduced ? 5 : 10;
    for (let i = 0; i < n; i++) {
      const an = a + (Math.random() - 0.5) * 2.2, v = 140 + Math.random() * 160;
      this.addP(1, ex, ey, Math.cos(an) * v, -Math.sin(an) * v, 0.35, i % 3 ? '#ffd75c' : '#ffffff', 2.4 + Math.random() * 1.6);
    }
    this.sqV -= 4;
  }
  // Kevin's misfortune (kind 'hit': 0.9 s, 'death': 1.2 s): the named rivals within 260 and the close crowd within 160 react
  oops(kind) {
    this.oopsKind = kind; this.oopsT = kind === 'death' ? 1.2 : 0.9; this.oopsDur = this.oopsT; this.oopsAt = this.time; this.oopsId = (this.oopsId || 0) + 1;
  }
  // Kevin flinches, then grins (main.js may call this on a 'close' or 'dodge' combo link; drawEnts also spots paid near misses)
  nearMiss() { if (this.nearT <= 0) this.nearT = 0.55; }
  // an impact frame (main.js on a hit): for sec seconds the hit thing (the nearest Big Mac or swimmer to world
  // x, y, or Kevin for kinds that hit him) turns into a white silhouette with radial white strokes, squashed
  // 1.25 x 0.8 along the hit axis; then it springs back over 120 ms
  impactFrame(x, y, kind = 'hit', sec = 0.06) {
    const race = this.race;
    if (x == null || y == null || !race || !race.p) return;
    const p = race.p, kev = KEVIN_HITS.has(kind);
    let tg = 'kevin', bd = kev ? -1 : hyp(p.x - x, p.y - y) * 1.2;
    if (!kev) {
      // (a Big Mac that died within the last 0.1 s still counts: its pop is the hit)
      for (const e of race.ents) { if (e.t !== 'wbc') continue; const E = this.ex(e); if (e.dead && !(E.deadT != null ? this.time - E.deadT < 0.1 : E.seen === this.frame)) continue; const d = hyp(e.x - x, e.y - y); if (d < bd && d < 60 + e.r) { bd = d; tg = e; } }
      for (const a of race.agents) { const A = this.aux.get(a); if (!a.alive || !A || A.seen !== this.frame || !A.init) continue; const d = hyp(A.rx - x, a.y - y); if (d < bd && d < 50) { bd = d; tg = a; } }
    }
    // a pop whose Big Mac the race already compacted away: last frame's drawn list still has it; failing that the
    // flash has no body (a point at x, y), never Kevin
    if (kind === 'pop' && tg === 'kevin') {
      for (const e of this._wbcPrev || []) { const d = hyp(e.x - x, e.y - y); if (d < 60 + e.r) { tg = e; break; } }
      if (tg === 'kevin') tg = this.popTg || (this.popTg = { x: 0, y: 0 });
      if (tg.t !== 'wbc') { tg.x = x; tg.y = y; }
    }
    const tA = tg === 'kevin' ? null : this.aux.get(tg);
    const tx = tg === 'kevin' ? p.x : tA && tA.init ? tA.rx : tg.x, ty = tg === 'kevin' ? p.y : tg.y;
    let dx = x - p.x, dy = -(y - p.y);
    if (tg !== 'kevin') { dx = tx - p.x; dy = -(ty - p.y); }
    const ang = hyp(dx, dy) < 4 ? -Math.PI / 2 : Math.atan2(dy, dx);
    const n = 6 + Math.floor(Math.random() * 3), st = [];
    for (let i = 0; i < n; i++) st.push(i / n * TAU + (Math.random() - 0.5) * 0.5, 18 + Math.random() * 22);
    this.imp = { tg, x, y, ang, t: clamp(+sec || 0.06, 0.02, 0.3), st };
    this.shakeAs(kind);
    this.hitDebris(kind, x, y, ang, p);
    // the jolt: the camera is knocked straight off the hit axis on the hit frame, and the spring brings it home
    // (a pop: 3 px + 1 a chain step, at most 6; a blast: 6 + n, at most 12, n read back from its hold of 40 + 15 n ms)
    const J = kind === 'pop' ? Math.min(6, 3 + ((this.time - this.popChT < 0.25 ? this.popCh : 1) - 1))
      : kind === 'blast' ? Math.min(12, 6 + Math.max(1, Math.round((sec * 1000 - 40) / 15)))
        : kind === 'bonk' ? 7 : kind === 'bump' ? 5 : kind === 'shieldHit' ? 9 : kind === 'player' || kind === 'death' ? 12 : 0;
    if (J) {
      const jl = this.reduced ? Math.min(2, J) : J;
      this.kx = clamp(-Math.cos(ang) * jl, -16, 16); this.ky = clamp(-Math.sin(ang) * jl, -16, 16);
      if (this.trAddT === this.time && this.trAddA > 0) { this._trauma = Math.max(0, this._trauma - 0.3 * this.trAddA); this.trAddA *= 0.7; }
      this.joltT = this.time;
    }
  }
  // debris thrown on the hit frame (so it hangs in the hit-stop with the world and bursts on release), along the
  // hit axis ang (screen space, Kevin toward the hit): bonk 10 lilac goo drops in a 110 degree cone off the goo,
  // bump 6 orange sparks out of both sides, swat 5 cyan flecks off the wall, shieldHit 12 gold shards in a ring,
  // player 16 pink chunks and a 90 px ring. Half as many on lite and for reduced motion.
  hitDebris(kind, x, y, ang, p) {
    const half = this.lite || this.reduced, cnt = (n) => (half ? Math.ceil(n / 2) : n);
    const shot = (k, sx, sy, d, v, life, col, size, g = 0) => this.addP(k, sx, sy, Math.cos(d) * v, -Math.sin(d) * v, life, col, size, g, d, (Math.random() - 0.5) * 16);
    if (kind === 'bonk') {
      const n = cnt(10), d0 = ang + Math.PI;
      for (let i = 0; i < n; i++) shot(3, x, y, d0 + (Math.random() - 0.5) * (110 * Math.PI / 180), 140 + Math.random() * 140, 0.5 + Math.random() * 0.2, '#d9b8ff', 2.4 + Math.random() * 1.6, 260);
    } else if (kind === 'bump') {
      const n = cnt(6);
      for (let i = 0; i < n; i++) shot(1, x, y, ang + (i % 2 ? 1 : -1) * Math.PI / 2 + (Math.random() - 0.5) * 0.6, 160 + Math.random() * 120, 0.35, '#ffb36b', 2.6 + Math.random());
    } else if (kind === 'swat') {
      const band = playBand(p.y, p.side, PB_R), sw = Math.abs(x - p.x) > 4 ? Math.sign(x - p.x) : p.x - band.l < band.r - p.x ? -1 : 1, n = cnt(5);
      for (let i = 0; i < n; i++) shot(1, p.x + sw * 12, p.y + (Math.random() - 0.5) * 16, (sw < 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.1, 170 + Math.random() * 120, 0.35, '#7fe9ff', 2.2 + Math.random());
    } else if (kind === 'shieldHit') {
      const n = cnt(12);
      for (let i = 0; i < n; i++) shot(5, p.x, p.y, i / n * TAU + Math.random() * 0.3, 150 + Math.random() * 90, 0.55, '#ffd75c', 4 + Math.random() * 2);
    } else if (kind === 'pop') {   // a Big Macro bursts: membrane shards in a full ring, pink goo drops, a quick white ring
      const n = cnt(8), m = cnt(5);
      for (let i = 0; i < n; i++) shot(5, x, y, i / n * TAU + Math.random() * 0.5, 160 + Math.random() * 120, 0.45, '#f4eef7', 4 + Math.random() * 2);
      for (let i = 0; i < m; i++) shot(3, x, y, Math.random() * TAU, 90 + Math.random() * 70, 0.5, '#ff8fc8', 2.4 + Math.random() * 1.4, 260);
      this.ring(x, y, '#ffffff', 50, 0.25, 4);
    } else if (kind === 'player' || kind === 'death') {
      const n = cnt(16);
      for (let i = 0; i < n; i++) shot(0, p.x, p.y, i / n * TAU + Math.random() * 0.4, 110 + Math.random() * 150, 0.6 + Math.random() * 0.3, i % 3 ? '#ff8fc8' : '#ffc2de', 3 + Math.random() * 2.5, 120);
      this.ring(p.x, p.y, '#ff8fc8', 90, 0.5, 5);
    }
  }
  // during the frame: is this target the white silhouette?
  // the hit-stop's white frame on its target; never with no flashes or reduced motion (impRing then: a 3 px white
  // outline ring round the target instead, so the hit still reads)
  // '800 <px>px FONT', one string per size, kept
  font800(px) { const F = this.f800 || (this.f800 = {}); return F[px] || (F[px] = `800 ${px}px ${FONT}`); }
  font900(px) { const F = this.f900 || (this.f900 = {}); return F[px] || (F[px] = `900 ${px}px ${FONT}`); }
  // css(this.wallC), rebuilt only when the wall colour changes (no colour string built per frame)
  wallCss() {
    const w = this.wallC; if (!w) return '#ffffff';
    const K = this._wcK || (this._wcK = [NaN, NaN, NaN]);
    if (K[0] !== w[0] || K[1] !== w[1] || K[2] !== w[2] || !this._wcS) { K[0] = w[0]; K[1] = w[1]; K[2] = w[2]; this._wcS = css(w); }
    return this._wcS;
  }
  isImp(tg) { return !this.noFlash && !this.reduced && this.impOn(tg); }
  impOn(tg) { return !!this.imp && this.imp.tg === tg && this.imp.t > 0; }
  impRing(tg) { return (this.noFlash || this.reduced) && this.impOn(tg); }
  // the squash (1 while held, then a 120 ms spring back with a small overshoot); pushes a transform, true if it did
  impSquash(tg, x, y) {
    const im = this.imp;
    if (!im || im.tg !== tg || this.reduced) return false;
    const e = im.t > 0 ? 0 : clamp(-im.t / 0.12, 0, 1), f = Math.cos(e * Math.PI) * (1 - e);
    if (Math.abs(f) < 0.01) return false;
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(im.ang); c.scale(1 - 0.2 * f, 1 + 0.25 * f); c.rotate(-im.ang); c.translate(-x, -y);
    return true;
  }
  drawImpact() {
    const im = this.imp;
    if (!im || im.t <= 0) return;
    const c = this.ctx, x = im.x, y = this.sy(im.y), n = this.reduced ? Math.ceil(im.st.length / 4) : im.st.length / 2;
    c.strokeStyle = '#ffffff'; c.lineCap = 'round'; c.lineWidth = 3; c.beginPath();
    for (let i = 0; i < n; i++) { const a = im.st[i * 2], L = im.st[i * 2 + 1], ca = Math.cos(a), sa = Math.sin(a); c.moveTo(x + ca * 14, y + sa * 14); c.lineTo(x + ca * (14 + L), y + sa * (14 + L)); }
    c.stroke();
  }
  // cash the combo in: pink DNA helices fly to the HUD (main.js: core event 'comboBank')
  comboBank(x, y, dna = 10) {
    this.lastBankT = this.lastBreakT = this.time;
    let n = Math.min(14, 4 + Math.round((+dna || 0) / 8));
    if (this.reduced || this.lite) n = Math.ceil(n / 2);
    const sx = x, sy = this.camY == null ? this.H * 0.7 : this.sy(y);
    for (let i = 0; i < n; i++) {
      this.banks.push({ x0: sx + (Math.random() - 0.5) * 20, y0: sy, cx: sx + (Math.random() - 0.5) * 160, cy: sy - 120 - Math.random() * 120,
        delay: i * 0.045, life: 0.75 + Math.random() * 0.2, t: 0, spin: Math.random() * TAU, i, n });
    }
    if (this.banks.length > 40) this.banks.splice(0, this.banks.length - 40);
  }
  // an overtake (main.js: core event 'pass'): streaks spray back past the rival you just passed, it squashes and
  // flashes a ring. n is the combo: 5 streaks in white at 0, 10 in col by a combo of 30 (half on lite)
  passFx(x, y, n = 0, col = '#ffd75c') {
    if (x == null || y == null) return;
    // (the spark colour in 8 steps toward col, cached: a fresh colour string per pass grew the streak buckets)
    const k = Math.round(clamp((+n || 0) / 30, 0, 1) * 7) / 7, PC = this.passC || (this.passC = new Map()), pk = col + '|' + k;
    let cc = PC.get(pk);
    if (!cc) { cc = css(lerpC(WHITE, colOf(col), k, SCR)); if (PC.size > 64) PC.clear(); PC.set(pk, cc); }
    // the second tier, past a combo of 30 (k2 0..1 by 100): a wider, thicker ring and faster sparks; from 60 two
    // white streaks at 1.4x; from 100 every 5th pass a ring in the combo colour (extras halved on lite)
    const nn = +n || 0, k2 = clamp((nn - 30) / 70, 0, 1), sp = 160 + 80 * k2;
    let cnt = Math.round(5 + 5 * k); if (this.lite) cnt = Math.ceil(cnt / 2);
    for (let i = 0; i < cnt; i++) {
      const a = (Math.random() * 2 - 1) * 25 * Math.PI / 180, v = sp + Math.random() * 100;
      this.addP(6, x + (Math.random() - 0.5) * 8, y - 4, Math.sin(a) * v, -Math.cos(a) * v, 0.3 + Math.random() * 0.12, cc, 2);
    }
    if (nn >= 60) {
      const ns = this.lite ? 1 : 2;
      for (let i = 0; i < ns; i++) {
        const a = (Math.random() * 2 - 1) * 12 * Math.PI / 180, v = (sp + Math.random() * 100) * 1.4;
        this.addP(6, x + (i ? 5 : -5), y - 4, Math.sin(a) * v, -Math.cos(a) * v, 0.36, '#ffffff', 2.4);
      }
    }
    this.ring(x, y, '#ffffff', 18 + 14 * k2, 0.25, 3 + 2 * k2);
    this.passN = (this.passN | 0) + 1;
    { const PT = this.passTs || (this.passTs = new Float64Array(16).fill(-9)); PT[this.passTI = ((this.passTI | 0) + 1) & 15] = this.time; }   // (passRate)
    if (nn >= 100 && this.passN % (this.lite ? 10 : 5) === 0) {
      const P = this.race && this.race.p, f = P ? clamp((P.comboT || 0) / (P.comboMax || 1), 0, 1) : 1;
      this.ring(x, y, this.ringCol(f), 34, 0.2, 4);
    }
    // squash the rival we just passed (the nearest one to the event)
    const race = this.race; let best = null, bd = 50;
    if (race && race.agents) for (const a of race.agents) {
      if (!a.alive || Math.abs(a.y - y) > 50) continue;
      const A = this.aux.get(a), ax = A && A.init ? A.rx : x, d = Math.abs(ax - x) + Math.abs(a.y - y) * 0.5;
      if (d < bd) { bd = d; best = a; }
    }
    if (best) this.ax(best).sqU = this.time + 0.12;
  }
  // a speech bubble over rival k (an agent, its index in race.agents, or a rival's name)
  say(k, text, dur = 2) { this.bubble = { k, text: String(text), life: dur, max: dur, lines: null, born: this.time }; }
  // R.duelSay(k, text, dur): a duel line in its own bubble over rival k (an agent, its index or its name), one bubble
  // per rival (a new line from the same rival replaces its old one), so two rivals can trade lines at the egg. Drawn
  // above that rival's duel spot (or above the swimmer before it has one), in its colour, at most 140 CSS px wide,
  // never over Kevin's duel spot or the egg's eyes. All of them clear when the duel ends.
  duelSay(k, text, dur = 1.2) {
    const M = this.duelBub || (this.duelBub = new Map()), a = this.rivalOf(this.race, k), key = a || k;
    const d = Math.max(0.2, +dur || 1.2);
    M.set(key, { k: key, a, text: String(text == null ? '' : text), life: d, max: d, born: this.time, lines: null, fs: 0, ts: 0, w: 0, h: 0 });
  }
  // R.claimSay(text, k, dur): the egg's claim line ('GUNTHER IS PUSHING IN!') on the canvas, centred just under the
  // HUD (R.hudBottom includes the duel panel) for dur s (default: until the swim ends), clear of a live banner. White
  // fpx(16) words with a 3 px ink edge on a rgba(20,2,18,.75) plate, pulsing 1.0 to 1.08 at 2 Hz (steady for reduced
  // motion), the words turning '#ff5c7a' once the claimer's drill bar (k: its agent, index or name) passes 60%.
  // R.claimSay(null) clears it; a new swim clears it too
  claimSay(text, k = null, dur = 0) {
    if (text == null || text === '') { this.claimL = null; return; }
    const d = +dur > 0 ? +dur : 1e9;
    this.claimL = { text: String(text), a: this.rivalOf(this.race, k), race: this.race, t0: this.time, until: this.time + d, w: 0, fs: 0 };
  }
  drawClaimLine(race) {
    const L = this.claimL;
    if (!L) return;
    if (L.race !== race || race.demo || (race.over && race.over.reason !== 'late') || this.time > L.until) { this.claimL = null; return; }
    const c = this.ctx, fs = this.fpx(16), red = this.reduced, a = L.a;
    c.font = this.font900(fs);
    if (L.fs !== fs) { L.fs = fs; L.w = c.measureText(L.text).width; }
    const d = race.drill, need = a ? a.need || (d && d.need) || 0 : 0, hot = need > 0 && (a.drill || 0) / need > 0.6;
    const w = Math.min(VIEW_W - 16, L.w + 26), h = Math.round(fs * 1.7), sc = red ? 1 : 1 + 0.04 * (1 - Math.cos((this.time - L.t0) * 2 * TAU));
    const x = VIEW_W / 2, cy = this.chevClear(this.hudB() + 10 + h / 2, h / 2 + 2, h / 2 + 2, this.hudB());
    if (cy !== cy) return;
    setXf(c, this.scrM(), x, cy, 0, sc, sc);   // (screen space: it sits under the HUD, never shakes or zooms)
    c.globalAlpha = Math.min(1, (this.time - L.t0) / 0.12, L.until - this.time > 0.25 ? 1 : (L.until - this.time) / 0.25);
    c.fillStyle = 'rgba(20,2,18,0.75)'; this.rrect(-w / 2, -h / 2, w, h, h / 2); c.fill();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = 6; c.strokeStyle = HZ_INK; c.strokeText(L.text, 0, 1, w - 14);
    c.fillStyle = hot ? '#ff5c7a' : '#ffffff'; c.fillText(L.text, 0, 1, w - 14);
    c.globalAlpha = 1; c.setTransform(this.worldM || this.scrM());
  }
  // a rival agent from an agent, its index in race.agents or its (first) name; null when none matches
  rivalOf(race, k) {
    if (k == null || !race || !race.agents) return null;
    if (typeof k === 'object') return k;
    if (typeof k === 'number') return race.agents[k] || null;
    const nm = String(k).toLowerCase(), AG = race.agents;
    for (let i = 0; i < AG.length; i++) { const q = AG[i]; if (q.boss && (q.boss.name.toLowerCase() === nm || q.boss.name.split(' ')[0].toLowerCase() === nm)) return q; }
    return null;
  }
  // the bubble rival a is speaking this frame (a duel bubble first, then this.bubble), or null
  bubOf(race, a) {
    const M = this.duelBub;
    if (M && M.size) for (const b of M.values()) if (b.life > 0 && (b.a || this.rivalOf(race, b.k)) === a) return b;
    const b = this.bubble;
    if (b && b.life > 0 && !b.ghost) { if (b.ra === undefined) b.ra = this.rivalOf(race, b.k); if (b.ra === a) return b; }
    return null;
  }

  // ---------------------------------------------------------------- cached sprites
  glow(col) {
    let g = this.glows.get(col);
    if (!g) {
      g = mk(64, 64); const x = g.getContext('2d'), c = rgb(col);
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, css(c, 1)); gr.addColorStop(0.35, css(c, 0.45)); gr.addColorStop(1, css(c, 0));
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); this.glows.set(col, g);
    }
    return g;
  }
  dglow(col, x, y, r, a = 1) {
    // (the area is counted in world units as drawn; a few callers draw under a local translate, which only skews the count)
    const ar = this.clipArea(x - r, y - r, r * 2, r * 2);
    if (a < 0.2 && this.overBudget(1)) { this.imgWant += ar; return; }
    const c = this.ctx; c.globalAlpha = a; c.drawImage(this.glow(col), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; this.imgArea += ar;
  }
  // a solid dot with a soft rim (particles)
  dot(col) {
    let g = this.dots.get(col);
    if (!g) {
      if (this.dots.size > 48) this.dots.clear();
      g = mk(32, 32); const x = g.getContext('2d');
      if (String(col)[0] !== '#') { x.fillStyle = col; x.beginPath(); x.arc(16, 16, 11, 0, TAU); x.fill(); }   // rgba()/hsl() colours: plain dot
      else {
        const c = rgb(col), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, css(c, 1)); gr.addColorStop(0.55, css(c, 1)); gr.addColorStop(0.7, css(c, 0.35)); gr.addColorStop(1, css(c, 0));
        x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      }
      this.dots.set(col, g);
    }
    return g;
  }
  // a thin bubble ring (particle kind 4), 32 px, drawn once per colour
  // ink: the Goo's version, the ring on a dark HZ_INK rim at 0.5 (white bubbles vanish on the pale periwinkle)
  ringSpr(col, ink = false) {
    const RS = ink ? this.ringSprsI || (this.ringSprsI = new Map()) : this.ringSprs;
    let g = RS.get(col);
    if (!g) {
      if (RS.size > 16) RS.clear();
      g = mk(32, 32); const x = g.getContext('2d');
      if (ink) { x.globalAlpha = 0.5; x.strokeStyle = HZ_INK; x.lineWidth = 4.2; x.beginPath(); x.arc(16, 16, 13.4, 0, TAU); x.stroke(); x.globalAlpha = 1; }
      x.strokeStyle = col; x.lineWidth = 2.2; x.beginPath(); x.arc(16, 16, ink ? 13.4 : 14, 0, TAU); x.stroke();
      RS.set(col, g);
    }
    return g;
  }
  // the neutral vignette per zone (lerp(zone deep, black, 0.55); the Egg a warm amber at 0.6), baked once.
  // sides: stage 1's version, which also bakes in the darkening the 34 px wall shadow stroke gives at full quality
  zoneVig(zi, sides) {
    const key = zi + (sides ? 7 : 0);
    let v = this.vigs[key];
    if (v) return v;
    const z = ZONES[zi], egg = z && z.id === 'egg', goo = z && z.id === 'goo';
    // (the Goo's edge is warmed halfway toward '#5a2a10', so the custard's frame reads warm brown, not grey)
    const col = egg ? [150, 86, 10] : goo ? lerpC(lerpC(rgb(zcol(z)[0]), [0, 0, 0], 0.55), rgb('#5a2a10'), 0.5) : lerpC(rgb(zcol(z)[0]), [0, 0, 0], 0.55), st = egg ? 0.6 : 1;
    v = mk(256, 256); const x = v.getContext('2d'), g = x.createRadialGradient(128, 150, 50, 128, 150, 190);
    // (the Goo's honey keeps its light: a softer outer stop, 0.45)
    g.addColorStop(0, css(col, 0)); g.addColorStop(0.6, css(col, 0.15 * st)); g.addColorStop(1, css(col, goo ? 0.3 : 0.75 * st));
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    if (z && z.id === 'acid') {   // the lagoon's lime light pooling down from the top (#c8ff6a at 0.10)
      const lp = x.createRadialGradient(128, -20, 10, 128, -20, 190);
      lp.addColorStop(0, 'rgba(200,255,106,0.1)'); lp.addColorStop(1, 'rgba(200,255,106,0)');
      x.fillStyle = lp; x.fillRect(0, 0, 256, 256);
    }
    if (z && z.id === 'sea') {   // the Sea's dark edges and its warm light from above, static in screen space: baked here
      const e = x.createLinearGradient(0, 0, 256, 0);
      e.addColorStop(0, 'rgba(30,0,8,0.45)'); e.addColorStop(0.25, 'rgba(30,0,8,0)'); e.addColorStop(0.75, 'rgba(30,0,8,0)'); e.addColorStop(1, 'rgba(30,0,8,0.45)');
      x.fillStyle = e; x.fillRect(0, 0, 256, 256);
      // a vertical value ramp: warm peach light over the top 25%, deep #3a0610 pooling over the bottom 30%, so the
      // big red Sea has a top and a bottom
      // (one vertical light gradient: '#e0605a' light from the top, fading by 45%, to '#3a0610' at the bottom)
      const tg = x.createLinearGradient(0, 0, 0, 256);
      tg.addColorStop(0, 'rgba(224,96,90,0.3)'); tg.addColorStop(0.45, 'rgba(224,96,90,0)'); tg.addColorStop(0.62, 'rgba(58,6,16,0)'); tg.addColorStop(1, 'rgba(58,6,16,0.6)');
      x.fillStyle = tg; x.fillRect(0, 0, 256, 256);
    }
    if (sides) {
      const d = lerpC(rgb(zcol(z)[0]), [0, 0, 0], 0.3), s = x.createLinearGradient(0, 0, 256, 0);
      s.addColorStop(0, css(d, 0.4)); s.addColorStop(0.16, css(d, 0)); s.addColorStop(0.84, css(d, 0)); s.addColorStop(1, css(d, 0.4));
      x.fillStyle = s; x.fillRect(0, 0, 256, 256);
    }
    return (this.vigs[key] = v);
  }
  // the two zone vignettes of a blend mixed into one 256 x 256 canvas (zi at 1 - 0.5 bt, zi + 1 at bt), repainted
  // only when bt has moved by 0.05 or more (or the zone / quality changed)
  blendVig(zi, sides, bt) {
    const B = this.bvig || (this.bvig = { cv: mk(256, 256), zi: -1, sides: null, bt: -1 });
    if (B.zi !== zi || B.sides !== sides || Math.abs(bt - B.bt) >= 0.05) {
      const a = this.zoneVig(zi, sides), b = this.zoneVig(zi + 1, sides), g = B.cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, 256, 256);
      g.globalAlpha = 1 - 0.5 * bt; g.drawImage(a, 0, 0);
      g.globalAlpha = bt; g.drawImage(b, 0, 0); g.globalAlpha = 1;
      B.zi = zi; B.sides = sides; B.bt = bt;
    }
    return B.cv;
  }
  // a gold edge glow (clear in the middle), baked once
  goldVig() {
    if (this._goldV) return this._goldV;
    const v = mk(128, 128), x = v.getContext('2d'), g = x.createRadialGradient(64, 64, 30, 64, 64, 92);
    g.addColorStop(0, 'rgba(255,215,92,0)'); g.addColorStop(0.6, 'rgba(255,200,80,0.35)'); g.addColorStop(1, 'rgba(255,190,60,1)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return (this._goldV = v);
  }
  vignette() {
    if (!this.vig) {
      const mkV = (inner) => {
        const k = mk(256, 256), x = k.getContext('2d'), g = x.createRadialGradient(128, 150, 50, 128, 150, 190);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, inner.replace('A', '0.15')); g.addColorStop(1, inner.replace('A', '0.75'));
        x.fillStyle = g; x.fillRect(0, 0, 256, 256); return k;
      };
      this.vig = [mkV('rgba(10,0,10,A)'), mkV('rgba(150,0,30,A)'), mkV('rgba(150,0,110,A)')];
    }
    return this.vig;
  }
  tile(zi) {
    const t = this.tiles.get(zi);
    if (t) return t;
    const job = this.tileJobs.get(zi) || this.tileJob(zi);
    while (!this.tiles.has(zi)) this.bakeStep(zi, job);   // needed now: finish the bake in one go
    return this.tiles.get(zi);
  }
  tileJob(zi) {
    const cv = mk(Math.round(TW * TS), Math.round(TH * TS)), g = cv.getContext('2d'); g.scale(TS, TS);
    const job = { cv, g, rnd: seeded(9001 + zi * 77), st: 0 };
    this.tileJobs.set(zi, job); return job;
  }
  // one stage of a tile bake (0 lumps, 1 detail, 2 speckle and its pattern); the last stage files it in the cache
  // The finished tile first becomes the inner tube pattern (a pattern keeps its own copy of the pixels), then
  // the backdrop's dim (dimOf) is baked into the tile itself, so no full-screen wash is drawn per frame
  bakeStep(zi, job) {
    paintTile(job.g, ZONES[zi], zi, job.st, job.rnd);
    if (++job.st < 3) return;
    this.tileJobs.delete(zi);
    if (this.tiles.size >= TILE_CACHE) {
      for (const k of this.tiles.keys()) if (k !== this.zi && k !== zi) { this.tiles.delete(k); if (this.pats) this.pats.delete(k); break; }
    }
    const pk = this.pats || (this.pats = new Map());
    pk.delete(zi);
    if (this.ctx && this.ctx.createPattern) { try { pk.set(zi, { t: job.cv, p: this.ctx.createPattern(job.cv, 'repeat') }); } catch (e) { /* no pattern */ } }
    const g = job.g; g.globalAlpha = dimOf(zi); g.fillStyle = dimCss(zi); g.fillRect(0, 0, TW, TH); g.globalAlpha = 1;
    this.tiles.set(zi, job.cv);
  }
  // the next zone's tile is baked over three frames well before its gate (no hitch at the blend)
  // then, one bake a frame: its vignette, its set pieces, its floaters' sprites, its glows and the gate's name
  // Budget: max(2, 0.12 * drawEma) ms a frame. A frame after a slow one (lastDrawMs > 1.5 * drawEma, measured against
  // this phone's own average, so a slow phone still bakes) sits out, except every 4th frame, which does one bake step:
  // within 3500 px of the gate the next zone is always on its way. Each bake is followed by a GPU 'touch' (the new
  // canvas drawn at alpha 0.004 off-screen) so its upload happens now, not at first sight.
  prewarm(p, zi) {
    const nz = zi + 1;
    if (!ZONES[nz] || !(p.y > ZSTART[nz] - 3500)) return;
    const ema = Number.isFinite(this.drawEma) && this.drawEma > 0 ? this.drawEma : 4, slow = +this.lastDrawMs > 1.5 * ema;
    if (slow && (this.frame & 3) !== 0) return;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), t0 = now(), budget = Math.max(2, 0.12 * ema);
    if (!this.tiles.has(nz)) {
      this.bakeStep(nz, this.tileJobs.get(nz) || this.tileJob(nz));
      if (this.tiles.has(nz)) { this.touch(this.tiles.get(nz)); const pt = this.pats && this.pats.get(nz); if (pt && pt.p) this.touchPat(pt.p); }
      return;
    }
    const pw = this.pw;
    if (pw.nz !== nz) { pw.nz = nz; pw.i = 0; pw.list = this.prewarmList(nz); }
    while (pw.i < pw.list.length) {
      const r = pw.list[pw.i]();
      if (r !== 'more') pw.i++;
      if (r && r !== true && r !== 'more') this.touch(r);
      if (r && (slow || now() - t0 > budget)) return;
    }
  }
  // draw a freshly baked canvas once, almost invisibly, outside the view (forces its GPU upload this frame)
  touch(cv) {
    const c = this.ctx;
    if (!c || !cv || !c.drawImage) return;
    const m = c.getTransform ? c.getTransform() : null;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.004;
    try { c.drawImage(cv, 0, 0, cv.width || 1, cv.height || 1, -4, -4, 1, 1); } catch (e) { /* not drawable */ }
    c.globalAlpha = 1; if (m) c.setTransform(m);
  }
  touchPat(pat) {
    const c = this.ctx;
    if (!c) return;
    const m = c.getTransform ? c.getTransform() : null;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 0.004; c.fillStyle = pat; c.fillRect(-4, -4, 1, 1);
    c.globalAlpha = 1; if (m) c.setTransform(m);
  }
  // the bakes for zone nz, in order; each returns true only when it really painted something
  prewarmList(nz) {
    const z = ZONES[nz], id = z.id, L = [], sides = this.q === 0;
    const has = (m, k, f) => () => { if (m.has(k)) return false; f(); return true; };
    // a job returns false (nothing to do), the canvas it baked (touched at once), true, or 'more' (call it again next)
    if (!this.lite) L.push(() => { if (this.vigs[nz + (sides ? 7 : 0)]) return false; return this.zoneVig(nz, sides); });
    if (PIECE_IDS.has(id)) for (let v = 0; v < 3; v++) L.push(() => this.pieceStep(id, v));
    if (FAR[id] && !this.lite) {
      L.push(() => { if (this.farS && this.farS.has(id)) return false; return this.farSpr(id, false); });
      L.push(() => this.farRim(id));
    }
    if (id === 'acid') L.push(() => { if (this.causS && this.causS.has(CAUS_ACID)) return false; return this.causticSpr(CAUS_ACID); });
    if (id === 'sea') {
      L.push(() => { if (this.causS && this.causS.has(CAUS_COL)) return false; return this.causticSpr(CAUS_COL); });
      L.push(() => { if (this.rcS) return false; return this.redCellSpr(); });
      L.push(() => { if (this.rcB) return false; return this.redCellBlur(); });
      L.push(() => { if (this.rcD) return false; return this.redCellDim(); });
      L.push(() => { if (this.rcF) return false; return this.redCellFore(); });
      for (let j = 0; j < 3; j++) L.push(() => { const C = this.clS || (this.clS = []); if (C[j]) return false; return this.clusterSpr(j); });
    }
    for (const col of ZGLOW[id] || []) L.push(() => { if (this.glows.has(col)) return false; const gq = this.glow(col); return (gq && gq.cv) || gq || true; });
    const nm = z.name.toUpperCase();
    L.push(() => { if (this.txt.has('pop|' + nm + '|' + z.wall + '|22')) return false; const tq = this.text(nm, z.wall, 22); return (tq && tq.cv) || true; });
    return L;
  }
  // R.prewarmRun(): ui calls it every frame of the 2, 1, GO countdown. Bakes the close-crowd heads (f 0..5,
  // ex 0..1, look -1..1, then the panic and awe faces) and the common burst dots, 3 a frame. Idempotent.
  prewarmRun() {
    const N = 36 + 18, D = BURST_COLS.length;
    let n = 0;
    while (this.pwrI < N + D && n < 3) {
      const i = this.pwrI++;
      if (i < 36) {
        const f = Math.floor(i / 6), ex = Math.floor(i / 3) % 2, look = (i % 3) - 1;
        if (!this.heads.has(f * 1000 + ex * 10 + look + 1)) { this.headSpr(f, 0, ex, look); n++; }
      } else if (i < N) {
        const j = i - 36, f = Math.floor(j / 3), ex = [2, 5, 6][j % 3];
        if (!this.heads.has(f * 1000 + ex * 10 + 1)) { this.headSpr(f, 0, ex, 0); n++; }
      } else {
        const col = BURST_COLS[i - N];
        if (!this.dots.has(col)) { this.dot(col); n++; }
      }
    }
    if (this.pwrI >= N + D) this.pwrI = N + D;
    return this.pwrI >= N + D;
  }
  // a 256 x 256 tileable caustic net (Sea): jittered lattice points joined by soft curves, drawn opaque, used at alpha 0.1
  causticSpr(col = CAUS_COL) {
    const CS = this.causS || (this.causS = new Map());
    if (CS.has(col)) return CS.get(col);
    const n = 5, st = 256 / n, rnd = seeded(4242), P = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) P.push([i * st + (rnd() - 0.5) * st * 0.7, j * st + (rnd() - 0.5) * st * 0.7]);
    const pt = (i, j) => { const q = P[((j % n + n) % n) * n + ((i % n + n) % n)]; return [q[0] + Math.floor(i / n) * 256, q[1] + Math.floor(j / n) * 256]; };
    const cv = mk(256, 256), g = cv.getContext('2d');
    g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 1.2;   // (thin: the net is light, never a mesh over the lane)
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      g.save(); g.translate(ox, oy); g.beginPath();
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = pt(i, j);
        for (const [b, bend] of [[pt(i + 1, j), 1], [pt(i, j + 1), -1]]) {
          const mx = (a[0] + b[0]) / 2 + bend * (b[1] - a[1]) * 0.25, my = (a[1] + b[1]) / 2 + bend * (a[0] - b[0]) * 0.25;
          g.moveTo(a[0], a[1]); g.quadraticCurveTo(mx, my, b[0], b[1]);
        }
      }
      g.stroke(); g.restore();
    }
    CS.set(col, cv); return cv;
  }
  redCellSpr() { return this.rcS || (this.rcS = paintRedCell()); }
  // a soft, out-of-focus red cell for the Sea's foreground (the cell sits at radius 40 of the 128 px sprite)
  redCellBlur() {
    if (this.rcB) return this.rcB;
    const cv = mk(128, 128), g = cv.getContext('2d');
    if ('filter' in g) g.filter = 'blur(5px)';
    g.drawImage(this.redCellSpr(), 16, 16, 96, 96);
    if ('filter' in g) g.filter = 'none';
    return (this.rcB = cv);
  }
  // the blurred red cell recoloured a dull '#7a1828' (the Sea's background cells and the near blur)
  redCellDim() {
    if (this.rcD) return this.rcD;
    const cv = mk(128, 128), g = cv.getContext('2d');
    g.drawImage(this.redCellBlur(), 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.75; g.fillStyle = '#7a1828'; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return (this.rcD = cv);
  }
  // the Sea's foreground cell: the blurred red cell recoloured '#ff6a7a' (cell radius 40 of the 128 px sprite)
  redCellFore() {
    if (this.rcF) return this.rcF;
    const cv = mk(128, 128), g = cv.getContext('2d');
    g.drawImage(this.redCellBlur(), 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.8; g.fillStyle = '#ff6a7a'; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return (this.rcF = cv);
  }
  // the Great Womb Sea's depth over the swimmers: 4 big defocused red cells (3 at stage 1; r 70 to 120, '#ff6a7a' at
  // 0.14, parallax 1.35, drifting about 10 px/s sideways), clipped to the outer bands (x < 80, x > 320) so the lane
  // stays clear. Only while the Sea has weight; not on lite; counted through the fill budget.
  drawSeaFore() {
    if (this.lite) return;
    const zA = ZONES[this.zi] ? ZONES[this.zi].id : '', zB = ZONES[this.zi + 1] ? ZONES[this.zi + 1].id : null, bt = zB ? this.bt : 0;
    const seaW = (zA === 'sea' ? 1 - bt : 0) + (zB === 'sea' ? bt : 0);
    if (!(seaW > 0.02) || !this.rcB) return;
    const c = this.ctx, t = this.time, red = this.reduced, n = this.q === 0 ? 3 : 4, LS = this.H + 520, cv = this.redCellFore();
    let any = false;
    for (let j = 0; j < n; j++) {
      const r = 70 + 50 * h1(j * 5.9 + 3), y = this.H + 260 - ((h1(j * 3.3 + 1.1) * LS - this.camY * 1.35 - (red ? 0 : t * 6)) % LS + LS) % LS;
      if (y < -r * 1.3 || y > this.H + r * 1.3) continue;
      if (!any) {
        if (this.overBudget('seaRbc', 160 * this.H * 0.5)) return;
        any = true; c.save(); c.beginPath(); c.rect(-40, -40, 120, this.H + 80); c.rect(320, -40, VIEW_W - 320 + 40, this.H + 80); c.clip();
        c.globalAlpha = seaW * 0.14;
      }
      const sd = j % 2 ? 1 : -1, x = (sd < 0 ? 10 : VIEW_W - 10) + sd * 12 * h1(j + 4.4) + (red ? 0 : 25 * Math.sin(t * 0.4 + j * 2.3)), S = r * 3.2;
      c.drawImage(cv, x - S / 2, y - S / 2, S, S);
      this.imgArea += Math.min(this.clipArea(x - S / 2, y - S / 2, S, S), 80 * Math.min(S, this.H));
    }
    if (any) { c.restore(); c.globalAlpha = 1; }
  }
  clusterSpr(j) { const L = this.clS || (this.clS = []); return L[j] || (L[j] = paintCluster(j)); }
  pieceSpr(id, v) {
    const m = this.pieces || (this.pieces = new Map()), key = id + v;
    let q = m.get(key); if (!q) { q = rimmed(paintPiece(id, v)); m.set(key, q); if (this.pieceJobs) this.pieceJobs.delete(key); }
    return q;
  }
  // prewarm's sliced piece bake: 64 logical rows a call ('more' until the last), then the rim pass files it
  pieceStep(id, v) {
    const m = this.pieces || (this.pieces = new Map()), key = id + v;
    if (m.has(key)) return false;
    const J = this.pieceJobs || (this.pieceJobs = new Map());
    let j = J.get(key);
    if (!j) { const pc = paintPiece(id, v, null, 0, 64); j = { pc, y: 64, h: pieceH(id) }; J.set(key, j); return 'more'; }
    if (j.y < j.h) { paintPiece(id, v, j.pc.cv, j.y, j.y + 64); j.y += 64; return 'more'; }
    J.delete(key);
    const q = rimmed(j.pc); m.set(key, q); return q.cv;
  }
  // the zone tile as a repeating pattern (the inner layer)
  // (made from the undimmed tile in bakeStep; a missing one falls back to the dimmed tile, a touch darker)
  tilePat(zi) {
    const pk = this.pats || (this.pats = new Map()), t = this.tile(zi);
    let q = pk.get(zi);
    if (!q || q.t !== t) { q = { t, p: this.ctx.createPattern ? this.ctx.createPattern(t, 'repeat') : null }; pk.set(zi, q); }
    return q.p;
  }
  // inner tile strength per zone (the Sea gets a stronger floor so its folds read)
  innerA(zi) { const id = ZONES[zi] && ZONES[zi].id; return id === 'sea' ? 0.38 : id === 'goo' ? 0.45 : id === 'rapids' ? 0.65 : 0.5; }   // (the Goo's custard needs its own light through)
  // text painted once (shadow, outline, fill, highlight at 2x); kind 'sign' draws a rounded plate
  // canWait: the caller can skip a frame (pops), so a frame never paints more than BAKES_PER_FRAME new sprites
  text(text, col, size, kind = 'pop', canWait = false) {
    size = Math.round(size);
    // the hot path: a nested index (kind, text, col, size) finds a live sprite without building its string key (that
    // concat was a per-call allocation, dozens a frame); the keyed LRU below stays the store
    const I1 = this.txtIx || (this.txtIx = new Map()), I2 = I1.get(kind), I3 = I2 && I2.get(text), I4 = I3 && I3.get(col), s0 = I4 && I4.get(size);
    if (s0 && !s0.dead && this.frame - (s0.f | 0) <= 60) return s0;
    const key = kind + '|' + text + '|' + col + '|' + size;
    let s = this.txt.get(key);
    // the LRU order is refreshed at most once a second per sprite (a Map delete + set every call cost more than it saved)
    if (s) { if (this.frame - (s.f | 0) > 60) { s.f = this.frame; this.txt.delete(key); this.txt.set(key, s); } if (s !== s0) this.txtIndex(kind, text, col, size, s); return s; }
    if (canWait && this.bakes >= BAKES_PER_FRAME) return null;
    this.bakes++;
    let reuse = null;   // the evicted sprite's canvas is resized and painted again (no new canvas per bake)
    // (the evicted sprite is flagged dead: a pop holding it drops it and bakes again)
    if (this.txt.size >= TXT_MAX) { const k0 = this.txt.keys().next().value, old = this.txt.get(k0); old.dead = true; reuse = old.cv; this.txt.delete(k0); }
    const K = 2, probe = this.probe || (this.probe = mk(4, 4).getContext('2d'));
    const font = kind === 'sign' || kind === 'signO' || kind === 'label' || kind === 'labelE' ? `800 ${size}px ${FONT}` : kind === 'think' ? `italic 800 ${size}px ${FONT}` : `900 ${size}px ${FONT}`;
    probe.font = font;
    const tw = Math.ceil(probe.measureText(text).width);
    if (kind === 'label' || kind === 'labelE') {   // a rival's name tag: a dark pill, a thick dark outline, the (already lifted) colour
      // ('labelE', the egg zone's: a darker 0.7 plate with a 2 px ink outline, so it reads on her gold)
      const pw = Math.ceil(tw + size * 0.9), ph = Math.ceil(size * 1.35), w = pw + 2, h = ph + 2;
      let cv = reuse;
      if (cv) { cv.width = w * K; cv.height = h * K; } else cv = mk(w * K, h * K);
      const g = cv.getContext('2d');
      g.setTransform(K, 0, 0, K, 0, 0); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const r = ph / 2;
      const eg = kind === 'labelE';
      g.fillStyle = eg ? 'rgba(20,2,18,0.7)' : 'rgba(20,0,20,0.55)'; g.beginPath(); g.moveTo(1 + r, 1); g.arcTo(1 + pw, 1, 1 + pw, 1 + ph, r); g.arcTo(1 + pw, 1 + ph, 1, 1 + ph, r); g.arcTo(1, 1 + ph, 1, 1, r); g.arcTo(1, 1, 1 + pw, 1, r); g.closePath(); g.fill();
      if (eg) { g.lineWidth = 2; g.strokeStyle = HZ_INK; g.stroke(); }
      g.lineWidth = Math.max(3, size * 0.3); g.strokeStyle = 'rgba(20,0,20,0.9)'; g.strokeText(text, w / 2, h / 2);
      g.fillStyle = col; g.fillText(text, w / 2, h / 2);
      s = { cv, w, h, pw, ph, f: this.frame }; this.txt.set(key, s); this.txtIndex(kind, text, col, size, s); return s;
    }
    // 'popP': a big pop (20 px and up) on a dark rounded plate (6 px padding) so it reads on any zone
    // ('popPn' / 'popSn': the same sprites without their plate, which drawFx paints live with its own long fade so
    // the words keep full alpha until the last 0.18 s; the plate rect rides on the sprite as pw, ph, pr)
    const noPl = kind === 'popPn' || kind === 'popSn';
    if (noPl) kind = kind === 'popPn' ? 'popP' : 'popS';
    const plate = kind === 'popP';
    let plR = null;
    const sg = kind === 'sign' || kind === 'signO';
    const th = kind === 'think';   // a thought: its soft plate (6 px padding, radius 10) needs a little more room
    const w = sg ? tw + 26 : th ? tw + 16 : tw + Math.ceil(size * 0.7) + 6 + (plate ? 6 : 0), h = sg ? (kind === 'signO' ? Math.max(32, Math.ceil(size * 1.3 + 10)) : 32) : th ? Math.ceil(size * 1.15 + 16) : Math.ceil(size * (plate ? 1.3 : 1.7) + (plate ? 16 : 0));
    let cv = reuse;
    if (cv) { cv.width = w * K; cv.height = h * K; } else cv = mk(w * K, h * K);
    const g = cv.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (sg) {
      // 'signO': an opaque plate, a cream fill and the col stroke (the Fork's PICK A TUBE reads over anything)
      const op = kind === 'signO', rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
      // ('signO' plate: solid #2a0a24 at alpha 1, a 2 px #ff9be0 rim, cream 800 text with a 3 px ink stroke; its
      // height follows the font so an fpx(18) line never spills off the plate)
      const ph = h - 4, ty = 1 + ph / 2;
      g.fillStyle = 'rgba(0,0,0,0.3)'; rr(3, 3, w - 4, ph, 10); g.fill();
      g.fillStyle = op ? '#2a0a24' : 'rgba(20,0,20,0.8)'; rr(1, 1, w - 4, ph, 10); g.fill();
      g.strokeStyle = op ? '#ff9be0' : col; g.lineWidth = 2; g.stroke();
      if (op) { g.lineWidth = 6; g.strokeStyle = HZ_INK; g.strokeText(text, (w - 2) / 2, ty); }
      g.fillStyle = op ? '#fff4f8' : col; g.fillText(text, (w - 2) / 2, ty);
    } else {
      const cx = w / 2, cy = h / 2;
      if (th) {   // the thought's plate: rgba(20,2,18,0.62), radius 10, 6 px round the words
        const pw = tw + 12, ph = size * 1.15 + 12, x0 = cx - pw / 2, y0 = cy - ph / 2, r = Math.min(10, ph / 2);
        g.fillStyle = 'rgba(20,2,18,0.62)'; g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + pw, y0, x0 + pw, y0 + ph, r); g.arcTo(x0 + pw, y0 + ph, x0, y0 + ph, r); g.arcTo(x0, y0 + ph, x0, y0, r); g.arcTo(x0, y0, x0 + pw, y0, r); g.closePath(); g.fill();
      }
      if (plate || kind === 'popS') {   // ('popS': a small pop's soft ink plate, radius 8, so it reads over the BEST line and goo)
        const ps = kind === 'popS', pw = ps ? tw + 10 : tw + 12 + size * 0.2, ph = ps ? size * 1.15 + 6 : size * 1.1 + 12, x0 = cx - pw / 2, y0 = cy - ph / 2, r = Math.min(ps ? 8 : 12, ph / 2);
        if (noPl) plR = { pw, ph, pr: r, pa: ps ? 0.55 : 0.65 };
        else { g.fillStyle = ps ? 'rgba(20,2,18,0.55)' : 'rgba(20,2,18,0.65)'; g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + pw, y0, x0 + pw, y0 + ph, r); g.arcTo(x0 + pw, y0 + ph, x0, y0 + ph, r); g.arcTo(x0, y0 + ph, x0, y0, r); g.arcTo(x0, y0, x0 + pw, y0, r); g.closePath(); g.fill(); }
      }
      g.fillStyle = 'rgba(30,0,30,0.55)'; g.fillText(text, cx + 1.5, cy + size * 0.14 + 1.5);
      // a 3 px #2a0a24 outline under the fill (the stroke is centred on the glyph edge: 6 px wide shows 3)
      g.lineWidth = kind === 'o2' || kind === 'think' ? 4 : Math.max(6, size * 0.32 + 2); g.strokeStyle = HZ_INK; g.strokeText(text, cx, cy);   // ('o2', 'think': a 2 px outline)
      g.fillStyle = col; g.fillText(text, cx, cy);
      if (size >= 16) { g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.fillText(text, cx, cy - size * 0.06); g.globalAlpha = 1; }
    }
    s = { cv, w, h, f: this.frame }; if (plR) { s.pw = plR.pw; s.ph = plR.ph; s.pr = plR.pr; s.pa = plR.pa; kind = kind + 'n'; }
    this.txt.set(key, s); this.txtIndex(kind, text, col, size, s); return s;
  }
  // text()'s nested index: emptied whenever it outgrows 4x the store (dead sprites only ever linger until then)
  txtIndex(kind, text, col, size, s) {
    const I1 = this.txtIx || (this.txtIx = new Map());
    if ((this.txtIxN = (this.txtIxN | 0) + 1) > TXT_MAX * 4) { I1.clear(); this.txtIxN = 1; }
    let I2 = I1.get(kind); if (!I2) { I2 = new Map(); I1.set(kind, I2); }
    let I3 = I2.get(text); if (!I3) { I3 = new Map(); I2.set(text, I3); }
    let I4 = I3.get(col); if (!I4) { I4 = new Map(); I3.set(col, I4); }
    I4.set(size, s);
  }
  ghostSpr(noHalo = false) {
    if (noHalo) return this.ghostN || (this.ghostN = this.paintGhost(true));
    return this.ghostS || (this.ghostS = this.paintGhost(false));
  }
  paintGhost(noHalo) {
    const K = 3, g0 = mk(16 * K, 26 * K), g = g0.getContext('2d'); g.scale(K, K); g.translate(8, 14);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 5, Math.PI, 0); g.lineTo(5, 6);
    for (let i = 0; i < 4; i++) g.lineTo(5 - (i + 0.5) * 2.5, 6 + (i % 2 ? 2 : -1));
    g.lineTo(-5, 6); g.closePath(); g.fill();
    g.fillStyle = '#2a1030'; g.font = `700 6px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('x x', 0, 0);
    if (!noHalo) { g.strokeStyle = '#ffd75c'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, -8, 4, 1.4, 0, 0, TAU); g.stroke(); }
    return g0;
  }
  helixSpr() {
    if (this.helixS) return this.helixS;
    const K = 3, h0 = mk(16 * K, 24 * K), g = h0.getContext('2d'); g.scale(K, K); g.translate(8, 12); g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.beginPath();
    for (let i = 0; i <= 8; i += 2) { const yy = -9 + i * 2.25, s = Math.sin(i * 0.8) * 5; g.moveTo(s, yy); g.lineTo(-s, yy); }
    g.stroke(); g.lineWidth = 2.2;
    for (let k = 0; k < 2; k++) { g.strokeStyle = k ? '#ffb3ec' : '#ff5cd2'; g.beginPath(); for (let i = 0; i <= 8; i++) { const yy = -9 + i * 2.25, xx = Math.sin(i * 0.8 + k * Math.PI) * 5; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); }
    return (this.helixS = h0);
  }
  // a close-crowd head (body, face, accessories, no tail) baked once per face x cap x expression x look
  headSpr(f, ci, ex, look) {
    const key = f * 1000 + ci * 100 + ex * 10 + (look + 1);
    let s = this.heads.get(key);
    if (s) return s;
    if (this.heads.size >= 160) this.heads.delete(this.heads.keys().next().value);
    s = mk(Math.ceil(20 * SPR), Math.ceil(34 * SPR));
    const g = s.getContext('2d'); g.setTransform(SPR, 0, 0, SPR, 10 * SPR, 19 * SPR);
    const o = { acc: FACE_ACC[f], cap: CAPS[ci], look };
    if (ex === 1) o.blink = 1;
    else if (ex === 2) { o.mouth = 'scared'; o.brow = 'worried'; o.look = 0; }
    else if (ex === 3) { o.brow = 'angry'; o.mouth = 'smirk'; }
    else if (ex === 4) { o.dizzy = 1; o.mouth = 'wobble'; }
    else if (ex === 5) { o.mouth = 'scared'; o.brow = 'worried'; o.shock = 1; o.look = 0; }
    else if (ex === 6 || ex === 7) { o.shock = 1; o.mouth = 'huge'; o.blush = 1; o.look = 0; if (ex === 7) o.star = '#ffd75c'; }   // awe (7: star-struck, FRENZY)
    this.head(g, CROWD[f], 0, o);
    this.heads.set(key, s); return s;
  }

  // ---------------------------------------------------------------- frame
  // draw(): one frame, timed (lastDrawMs: CPU ms of the last frame; prewarm sits out a frame after a slow one)
  draw(race, dt, ts = 1) {
    const pf = typeof performance !== 'undefined' ? performance : Date, t0 = pf.now();
    try { this.drawFrame(race, dt, ts); } finally {
      // drawEma: the slow average of the frame cost (alpha 0.05); prewarm compares the last frame against it
      const ms = pf.now() - t0;
      this.lastDrawMs = ms;
      this.drawEma = this.drawEma == null || !Number.isFinite(this.drawEma) ? ms : this.drawEma + (ms - this.drawEma) * 0.05;
    }
  }
  drawFrame(race, dt, ts = 1) {
    const c = this.ctx, p = race.p, wdt = dt * ts; this.time += dt; this.frame++; this.race = race; this.ts = ts; this.bakes = 0; this.fdt = dt;
    if (this.rivalEaten != null && this.rivalEatenF !== this.frame) this.rivalEaten = null;   // (set for one frame only)
    this.signBoxes.length = 0; this.labRN = 0; this.labelQ = true; this.labelN = 0; this.imgArea = 0; this.imgWant = 0; this.coachBandHit = false;
    const beat = this.reduced ? 0 : clamp(+this.beat || 0, 0, 1);
    if (this.camY == null) this.resetRun();
    // the beat clock: an onset is R.beat rising past 0.9 (beatOn for this frame); beatN counts them, beatU is the
    // continuous count (beatN + the fraction of the zone's beat since the last onset), for the rivals' grooves
    {
      const bv = clamp(+this.beat || 0, 0, 1), zb = (ZONES[this.zi | 0] && ZONES[this.zi | 0].beat) || 96;
      this.beatOn = (this.pvBeat == null ? 1 : this.pvBeat) < 0.9 && bv >= 0.9;
      this.pvBeat = bv;
      if (this.beatOn) { this.beatN = (this.beatN | 0) + 1; this.beatAt = this.time; }
      this.beatU = (this.beatN | 0) + clamp((this.time - (this.beatAt == null ? this.time : this.beatAt)) * zb / 60, 0, 1);
      this.beatF = this.beatU - Math.floor(this.beatU);
    }
    // camera: Kevin sits lower the faster he swims, so he sees more tube ahead. The lead is measured over the
    // visible band (under the top HUD), floored so he stays above the combo strip; a landscape-short canvas
    // (HUD in the gutter) uses a lower base. p.vy / 8 cancels the follow lag of the dt * 8 chase.
    // padBot: the bottom combo strip (CSS px). The lead band starts above it, so Kevin never swims under it.
    const padW = Math.max(0, +this.padTop || 0) * this.cssK, padB = Math.max(0, +this.padBot || 0) * this.cssK;
    const visH = Math.max(100, this.H - padW - padB);
    this.padW = padW; this.padB = padB;
    // high speed (systems lets the lateral cap reach 1.7x past vy 750): from vy 700 the lead eases down to 0.2
    // (0.16 on a short screen) by vy 1200, and past vy 900 the floor drops (0.26 to 0.18), so the tube ahead shows
    const short = this.H / VIEW_W < 1.2, base = short ? 0.22 : 0.34, pvy = p.vy || 0, lo = short ? 0.16 : 0.2;
    const floor = pvy > 900 ? Math.min(short ? 0.18 : 0.26, short ? lo : 0.18) : short ? 0.18 : 0.26;
    let wantLead = base - 0.08 * clamp((pvy - 420) / 900, 0, 1);
    if (pvy > 700) wantLead += (lo - wantLead) * clamp((pvy - 700) / 500, 0, 1);
    wantLead = race.drill ? 0.5 : Math.max(floor, wantLead);
    // R.thumbY (CSS px, or null): in portrait, a finger from 60 CSS px above to 140 CSS px below where Kevin would sit
    // raises the lead until he sits 110 CSS px above it, at most +0.16 of the visible band, eased by the dt * 3 below.
    // (Measured against his unraised spot, so the raise never switches itself off and never pumps.)
    const ty = this.thumbY, ck = this.cssK || 1;
    if (!short && !race.drill && ty != null && Number.isFinite(+ty) && this.eggCam < 1) {
      const thumbL = +ty * ck, kevBase = this.H - padB - visH * wantLead - clamp(pvy, 0, 2400) / 8;
      if (thumbL >= kevBase - 60 * ck && thumbL - kevBase < 140 * ck) {
        const need = (kevBase - (thumbL - 110 * ck)) / visH;
        wantLead += clamp(need, 0, 0.16);
      }
    }
    this.lead += (wantLead - this.lead) * Math.min(1, dt * 3);
    let target = p.y - padB - visH * this.lead + (race.drill ? 0 : clamp(p.vy || 0, 0, 2400) / 8);
    // the egg's close-up: once the drill starts (or Kevin is within 600 of her) the framing eases over 0.8 s until
    // her centre sits at about 32% of the screen (not about 12%), with both eyes clear of the live R.hudBottom and
    // Kevin kept above the bottom strip
    // a rival claimed the egg while Kevin was still swimming (over 'late', no drill): the camera pans up to show the
    // steal (0.5 s, a cut for reduced motion), framing her like the drill close-up, without waiting for Kevin
    const lateCam = !!(race.over && race.over.reason === 'late' && !race.drill && !race.demo);
    this.lateCam = lateCam;
    const eggOn = !!race.drill || lateCam || (p.y > RACE_LEN + 120 - 600 && ZONES[zoneIndex(p.y)].egg);
    this.eggCam = lateCam && this.reduced ? 1 : clamp((this.eggCam || 0) + (eggOn ? 1 : -1) * dt / (lateCam ? 0.5 : 0.8), 0, 1);
    let lateWant = null;
    if (this.eggCam > 0) {
      const u = this.eggCam * this.eggCam * (3 - 2 * this.eggCam), eyY = Math.max(0.32 * this.H, this.hudB() + 32);
      const want = lateCam ? RACE_LEN + 120 - this.H + eyY : Math.min(RACE_LEN + 120 - this.H + eyY, p.y - padB - 70);
      if (lateCam) lateWant = want;
      target += (want - target) * u;
    }
    this.camY = this.camY == null || (lateCam && this.reduced) ? target : this.camY + (target - this.camY) * Math.min(1, dt * (lateCam ? 14 : 8));
    // the steal's entrance waits until the pan is 80% there (drawEgg restarts winT then), so it plays in view
    if (!lateCam) this.lateReady = false;
    else if (!this.lateReady) {
      if (this.lateFrom == null || this.lateOver !== race.over) { this.lateOver = race.over; this.lateFrom = this.camY; }
      const span = Math.abs(lateWant - this.lateFrom);
      this.lateReady = this.reduced || span < 1 || (this.eggCam >= 0.8 && Math.abs(this.camY - this.lateFrom) >= 0.8 * span);
      if (this.lateReady) this.winT = 0;
    }
    this.react(race, dt, wdt);
    // trauma shake (smooth two-sine noise) + spring kick
    // during a hit freeze (ts 0) the shake and the zoom punch hold, so the hit lands at full strength on release
    const frz = this.ts === 0;
    this._trauma = Math.max(0, this._trauma - dt * (frz ? 0.9 : 1.8));
    const tr2 = this._trauma * this._trauma, tr15 = Math.pow(this._trauma, 1.5), T = this.time;
    // 9 and 13 Hz: slow enough never to alias into a one-frame strobe at 60 fps
    this.tDirT = Math.max(0, this.tDirT - dt);
    // reduced motion: trauma is capped at 0.35 (addTrauma) and the shake at 4 px, no hit-axis bias, the kick at +-4 px
    // (hit-stop and the edge glow carry the feedback)
    if (this.reduced && this._trauma > 0.35) this._trauma = 0.35;
    const ax = this.tDirT > 0 && !this.reduced ? this.tAx : 1, ay = this.tDirT > 0 && !this.reduced ? this.tAy : 1;
    // per-kind shake (shakeAs): the base frequency eases to its target over 0.1 s and a phase integrates it (no jump
    // when it changes); two sines at hz and 1.44 hz (9 and 13 Hz by default). Once the shake has died the default returns
    if (this._trauma < 0.03) { this.shHzT = 9; this.shExp = 1.3; this.shRotK = 1; }
    const hz0 = this.shHz || 9; this.shHz = hz0 + ((this.shHzT || 9) - hz0) * Math.min(1, dt / 0.1);
    this.shPh = (this.shPh || 0) + dt * this.shHz * TAU;
    if (this.shPh > 1e4 && this._trauma < 0.03) this.shPh = 0;   // (wrapped only while still: the two sines never jump)
    const PH = this.shPh;
    const amp = this.reduced ? 4 * Math.min(1, this._trauma / 0.35) : 16 * Math.pow(this._trauma, this.shExp || 1.3);
    const ox = ax * amp * (0.6 * Math.sin(PH) + 0.4 * Math.sin(PH * 1.444 + 1.3));
    const oy = ay * amp * (0.6 * Math.sin(PH * 1.444 + 2.1) + 0.4 * Math.sin(PH + 0.4));
    const rot = this.reduced ? 0 : 0.014 * tr2 * (this.shRotK || 1) * (0.5 * Math.sin(PH + 3.3) + 0.5 * Math.sin(PH * 1.444 + 0.9));
    this.kvx += (-220 * this.kx - 18 * this.kvx) * dt; this.kvy += (-220 * this.ky - 18 * this.kvy) * dt;
    const kLim = this.reduced ? 4 : 16;
    this.kx = clamp(this.kx + this.kvx * dt, -kLim, kLim); this.ky = clamp(this.ky + this.kvy * dt, -kLim, kLim);
    // zoom punch pivots on the player
    const zdt = frz ? dt * 0.15 : dt;
    // (the spree pull below holds its own small negative zoom: the 10/s decay leaves a zoomK in [target, 0] alone)
    const sprTgt = this.passRate >= 5 && !race.drill ? -(0.015 + 0.02 * clamp((this.passRate - 5) / 4, 0, 1)) : 0;
    if (!(sprTgt < 0 && this.zoomK <= 0 && this.zoomK >= sprTgt - 0.002)) this.zoomK *= Math.exp(-zdt * (this.zoomK < 0 ? 10 : 7));
    // a passing spree (passRate: passes in the last 0.6 s) drifts slowly into a slight pull-back (-0.015 at 5 passes
    // down to -0.035 at 9 and up; a dash's -0.06 wins), and never inside 0.25 s of a zoom punch (the 5/10-link and
    // ladder punches used to be erased within about 150 ms)
    { let n = 0; const PT = this.passTs; if (PT) for (let i = 0; i < 16; i++) if (T - PT[i] < 0.6) n++; this.passRate = n; }
    if (this.passRate >= 5 && !race.drill && !(this.time - (this.punchAt == null ? -9 : this.punchAt) < 0.25)) {
      const tgt = -(0.015 + 0.02 * clamp((this.passRate - 5) / 4, 0, 1));
      if (this.zoomK > tgt) this.zoomK += (tgt - this.zoomK) * Math.min(1, dt * 2);
    }
    if (Math.abs(this.zoomK) < 0.002 || this.reduced) this.zoomK = 0; const zk = 1 + this.zoomK;
    const px = p.x, py = this.sy(p.y);
    c.setTransform(this.s, 0, 0, this.s, 0, 0);
    c.translate(VIEW_W / 2 + ox + this.kx, this.H / 2 + oy + this.ky);
    if (rot) c.rotate(rot);
    c.translate(-VIEW_W / 2, -this.H / 2);
    if (zk !== 1) { c.translate(px, py); c.scale(zk, zk); c.translate(-px, -py); }
    // the win's money shot: 0.25 to 0.9 s after, the camera pushes in 1.0 -> 1.5 on the egg (and holds)
    const ovW = race.over && race.over.reason === 'win' && race.drill;
    const fz = ovW && !this.reduced ? clamp((this.endT - 0.25) / 0.65, 0, 1) : 0;
    if (fz > 0) {
      const u = fz * fz * (3 - 2 * fz), z = 1 + 0.5 * u, ex = centre(RACE_LEN), ey = this.sy(RACE_LEN + 120);
      c.translate(ex + (VIEW_W / 2 - ex) * u, ey + (this.H * 0.45 - ey) * u); c.scale(z, z); c.translate(-ex, -ey);
      this.zoom = 1.5;
    } else if (!race.over) this.zoom = 1;
    // the opaque tile covers -20..420: only paint the flat colour when the view could peek past it
    this.safeBack = Math.abs(ox + this.kx) + 7 * tr15 < 18 && this.zoomK >= 0;
    this.worldM = c.getTransform();
    {   // the world matrix, read once a frame into a reused object (setXf and the hot paths read it, no getTransform())
      const W = this.wm || (this.wm = typeof DOMMatrix !== 'undefined' ? new DOMMatrix() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), M = this.worldM;
      W.a = M.a; W.b = M.b; W.c = M.c; W.d = M.d; W.e = M.e; W.f = M.f;
    }

    const zi = zoneIndex(p.y), zn = ZONES[zi + 1];
    let bt = 0; if (zn) bt = clamp((p.y - (ZSTART[zi + 1] - 1500)) / 1500, 0, 1);
    // the blend needs the next zone's tile: one bake step a frame (never the whole tile at once), the blend held at 0
    // until it is ready (prewarm normally has it baked 2000 px earlier)
    if (zn && bt > 0 && !this.tiles.has(zi + 1)) {
      this.bakeStep(zi + 1, this.tileJobs.get(zi + 1) || this.tileJob(zi + 1));
      if (!this.tiles.has(zi + 1)) bt = 0;
    }
    this.zi = zi; this.bt = bt; this.gooOn = ZONES[zi].id === 'goo';   // (gooOn: rival heads get a dark rim on the pale goo)
    const z = ZONES[zi];
    const zc = zcol(z), zcn = zn ? zcol(zn) : null;   // (TUBE_TINT: the render-side tube colours)
    const deep = zn ? lerpC(rgb(zc[0]), rgb(zcn[0]), bt, this.sDeep) : rgb(zc[0]);
    if (this.frame % 30 === 1) this.deepCss = css(deep);
    this.prewarm(p, zi);
    const lite = zn ? lerpC(rgb(zc[1]), rgb(zcn[1]), bt, this.sLite) : rgb(zc[1]);
    const wall = zn ? lerpC(rgb(z.wall), rgb(zn.wall), bt, this.sWall) : rgb(z.wall);
    this.wallC = wall;
    this.buildWallCache(race);
    this.drawBack(deep, zi, bt, this.backStrips(race));
    this.drawRapidsFoam(zi, bt);
    this.drawTube(race, lite, wall, deep);
    this.drawScent(race);
    this.drawMarks(race, dt);
    this.drawEnts(race, dt);
    this.drawEgg(race, dt);
    this.drawAgents(race, dt);
    this.drawClutch(race);
    this.drawCoach(race, dt, wdt);
    this.drawPlayer(race, dt, wdt, beat);
    this.drawSeaFore();
    this.drawScrim(race);
    this.drawFx(race, dt, wdt);
    c.setTransform(this.worldM); this.drawTracers(race, dt);
    c.setTransform(this.worldM); this.drawYou(race);
    this.drawStealVig();
    // the speech bubble: laid out in drawAgents, drawn last of the world layers (over the scrim, the particles and the pops)
    c.setTransform(this.worldM); this.drawBubble();
    c.setTransform(this.worldM); this.drawDuelBubbles(race, dt);
    c.setTransform(this.worldM); this.drawClaimLine(race);
    if (this.pf) this.drawPhotoFinish(dt);
    // speed lines when you are flying
    // (and a passing spree or a long combo adds its own: passRate past 2 up to +0.5, combo past 20 up to +0.3,
    // tinted the combo ring's colour when no dash or FRENZY is on)
    const fx0 = (p.dashT > 0 ? 1 : 0) + (p.frenzyT > 0 ? 0.7 : 0);
    const fast = fx0 + clamp(((this.passRate | 0) - 2) / 8, 0, 0.5) + clamp(((p.combo || 0) - 20) / 80, 0, 0.3);
    if (fast > 0 && !race.drill) {
      const red = this.reduced, n = red ? 4 : this.dashAge < 0.15 && p.dashT > 0 ? 32 : 16, al = red ? 0.5 : 1;
      c.lineWidth = 1.6; c.lineCap = 'round';
      c.strokeStyle = p.frenzyT > 0 ? (red ? '#ffd75c' : HSL75[hueI(this.time * 500)]) : fx0 > 0 ? '#ffffff' : this.ringCol(clamp((p.comboT || 0) / (p.comboMax || 1), 0, 1));
      c.globalAlpha = Math.min(1, (p.frenzyT > 0 ? 0.16 : 0.14) * fast * al);
      c.beginPath();
      for (let i = 0; i < n; i++) { const x = (i * 97 + this.time * 31) % VIEW_W, y = ((i * 211 + this.time * 1500) % (this.H + 200)) - 100; c.moveTo(x, y); c.lineTo(x, y + 50 + 50 * fast); }
      c.stroke(); c.globalAlpha = 1;
    }
    // ---- screen space: threat chevrons, one vignette, the DNA fountain, combo-break grey, flash
    c.setTransform(this.s, 0, 0, this.s, 0, 0);
    this.drawEdgeLines(race);
    this.drawWarnings(race);
    this.drawForkSign();
    this.drawTellWedge();
    this.drawLateKevin(race);
    const vr = this.vignette()[1], ef = p.e / (p.maxE || 100);
    // full-screen layers: lite keeps to 5 (back tile, dark wash, tube, inner tile, one vignette); full blends two vignettes
    // lite skips every full-screen vignette (the low-energy pulse and the combo-break edge included)
    if (this.lite) { /* none */ } else if (ef < 0.25 && !race.over) {
      c.globalAlpha = this.reduced ? 0.6 : Math.max(0.7, clamp(0.55 + 0.35 * Math.sin(this.time * 8), 0, 1) * (1 - ef / 0.25 * 0.5));
      c.drawImage(vr, -20, -20, VIEW_W + 40, this.H + 40); this.imgArea += (VIEW_W + 40) * (this.H + 40);
    } else {
      const va = Math.min(1, 0.9 + 0.06 * beat), sides = this.q === 0;
      let vg;
      if (!zn || bt < 0.02 || (this.lite && bt < 0.5)) vg = this.zoneVig(zi, sides);
      else if (bt > 0.98) vg = this.zoneVig(zi + 1, sides);
      else vg = this.blendVig(zi, sides, bt);   // the crossfade: ONE pre-mixed vignette, not two full-screen draws
      c.globalAlpha = va; c.drawImage(vg, -20, -20, VIEW_W + 40, this.H + 40); this.imgArea += (VIEW_W + 40) * (this.H + 40);
    }
    // a second vignette over the first (the break edge, the gold edge) is the third layer the fill budget drops
    const VA = (VIEW_W + 40) * (this.H + 40);
    // a big combo break (25+) flashes the edges red-violet for 0.25 s (0.3 at most for reduced motion)
    if (this.breakVig > 0 && this.lite) this.breakVig = 0;
    if (this.breakVig > 0 && this.overBudget('vig2', VA)) this.breakVig = Math.max(0, this.breakVig - dt);
    else if (this.breakVig > 0) { this.imgArea += VA; c.globalAlpha = clamp(this.breakVig / 0.25, 0, 1) * (this.reduced ? 0.3 : 0.8); c.drawImage(this.vignette()[2], -20, -20, VIEW_W + 40, this.H + 40); this.breakVig = Math.max(0, this.breakVig - dt); }
    // a big pop chain's gold edge glow (popFx, 6 and up): 0.15 s, gated by flashOk there
    if (this.edgeGold > 0 && this.overBudget('vig2', VA)) this.edgeGold = Math.max(0, this.edgeGold - dt);
    else if (this.edgeGold > 0) {
      c.globalAlpha = clamp(this.edgeGold / 0.15, 0, 1) * (this.reduced ? 0.35 : 0.6);
      c.drawImage(this.goldVig(), -20, -20, VIEW_W + 40, this.H + 40); this.edgeGold = Math.max(0, this.edgeGold - dt); this.imgArea += (VIEW_W + 40) * (this.H + 40);
    }
    c.globalAlpha = 1;
    // full-screen image layers this frame, in screens (the backdrop tile rows as drawn, plus the vignettes)
    // (the zone vignette counted where it draws, above)
    this.imgScreens = this.imgArea / (VIEW_W * this.H);
    this.imgWantS = (this.imgArea + this.imgWant) / (VIEW_W * this.H);   // (imgWant: the layers the budget skipped)
    this.drawBanks(dt);
    this.drawMotes(dt);
    this.drawVs(dt);
    if (this.desat > 0) {   // the combo break greys the world out for a moment (a plain wash: 'saturation' blending is slow on phones)
      c.fillStyle = '#5a506e'; c.globalAlpha = 0.35 * Math.min(1.25, this.desat / 0.2);   // (no colour string built per frame)
      c.fillRect(-20, -20, VIEW_W + 40, this.H + 40); c.globalAlpha = 1;
    }
    if (this._flash > 0.02) {
      // (the cap holds for any value: flash = 0.8 or 1 draws at 0.4, or 0.25 for red, never brighter)
      const fc = colOf(this._fcol), cap = fc[0] > 1.6 * fc[1] ? 0.25 : 0.4;
      if (this.reduced || this.noFlash) {   // reduced motion / no flashes: a soft glow round the edges only, clear in the middle
        // (one gradient per colour and screen height, kept: no gradient or colour string built per frame)
        const FG = this.flashEdgeG || (this.flashEdgeG = { col: null, H: 0, g: null });
        if (FG.col !== this._fcol || FG.H !== this.H || !FG.g) {
          FG.col = this._fcol; FG.H = this.H;
          FG.g = c.createRadialGradient(VIEW_W / 2, this.H / 2, Math.min(VIEW_W, this.H) * 0.3, VIEW_W / 2, this.H / 2, hyp(VIEW_W, this.H) * 0.55);
          FG.g.addColorStop(0, css(fc, 0)); FG.g.addColorStop(1, css(fc, 1));
        }
        // (no flashes and reduced motion share the one cap: 0.25)
        c.fillStyle = FG.g; c.globalAlpha = Math.min(0.25, this._flash);
      } else { c.fillStyle = this._fcol; c.globalAlpha = Math.min(cap, this._flash); }
      c.fillRect(-20, -20, VIEW_W + 40, this.H + 40); c.globalAlpha = 1; this._flash -= dt * 3;
    } else this._flash = 0;
    if (this.birthS) this.drawBirth(dt);
    if (this.heroOn) this.drawHero();
    this._marksNew = false; this._coachNew = false;
  }
  // the pre-arrival steal (lateCam): Kevin is off the bottom of the shot, so a marker pins him there: his worried face
  // in a 28 px circle, a down arrow and how far behind he was (over.gapSec, when it is a number)
  drawLateKevin(race) {
    if (!this.lateCam) return;
    const p = race.p, bot = this.H - Math.min(this.padB || 0, 90);
    if (this.sy(p.y) < bot - 20) return;   // he is in the shot after all
    const c = this.ctx, red = this.reduced, al = clamp(this.eggCam / 0.5, 0, 1);
    if (al <= 0) return;
    const x = clamp(p.x, 34, VIEW_W - 34), y = bot - 46 + (red ? 0 : 2 * Math.sin(this.time * 5));
    c.globalAlpha = al;
    c.fillStyle = 'rgba(20,4,20,0.35)'; c.beginPath(); c.arc(x + 1.5, y + 2, 15, 0, TAU); c.fill();
    c.fillStyle = '#ffe3ef'; c.beginPath(); c.arc(x, y, 14, 0, TAU); c.fill();
    c.save(); c.clip();
    const o = this.lkO || (this.lkO = { ink: 1, mouth: 'scared', brow: 'worried', shock: 1, round: 0, look: 0 });
    o.acc = this.accList.filter((q) => q !== 'band'); o.band = this.kevCol || '#ff3d6e';
    c.translate(x, y + 2); c.scale(1.05, 1.05); this.head(c, '#ffffff', this.time * 12, o);
    c.restore();
    c.globalAlpha = al; c.strokeStyle = HZ_INK; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 14, 0, TAU); c.stroke();
    // the arrow: he is down there somewhere
    const ay = y + 19 + (red ? 0 : 2 * Math.sin(this.time * 8));
    c.beginPath(); c.moveTo(x - 7, ay); c.lineTo(x + 7, ay); c.lineTo(x, ay + 8); c.closePath();
    c.lineJoin = 'round'; c.strokeStyle = HZ_INK; c.lineWidth = 3; c.stroke(); c.fillStyle = '#fff4f8'; c.fill();
    const gs = race.over && race.over.gapSec;
    if (typeof gs === 'number' && Number.isFinite(gs)) {
      const tag = `${gs}s`, sp = this.text(tag, '#ffffff', this.fpx(13), 'label'), lx = this.labBeside(x, 14, sp.w, x > VIEW_W - 90 ? -1 : 1);
      c.drawImage(sp.cv, lx - sp.w / 2, y - sp.h / 2, sp.w, sp.h);
    }
    c.globalAlpha = 1;
  }
  // the HUD scrim: #hud's own gradient leaves the world half readable under it, so fruit by the mutation chips read as
  // more chips and goo hid under the GAS bar. Between the world and the fx: rgba(20,4,20,0.55) solid down to hudB(),
  // then a fade to nothing over 18 px. hudB() is read live (the egg cam moves it). Screen space, cached gradient.
  drawScrim(race) {
    if (race.demo || this.heroOn) return;
    // no HUD on screen (the title, the result): no scrim. R.hudScrim = false (main.js) also turns it off.
    if (this.hudScrim === false) return;
    if (this.hudEl === undefined) this.hudEl = typeof document !== 'undefined' ? document.getElementById('hud') : null;
    if (this.hudEl && this.hudEl.classList.contains('hide')) return;
    const hb = this.hudB();
    if (!(hb > 1)) return;
    const c = this.ctx, m = this.wm;
    c.setTransform(this.s, 0, 0, this.s, 0, 0);
    c.fillStyle = 'rgba(20,4,20,0.55)'; c.fillRect(-20, -20, VIEW_W + 40, hb + 20);
    if (!this.scrimG || this.scrimGK !== hb) {
      const g = c.createLinearGradient(0, hb, 0, hb + 18); g.addColorStop(0, 'rgba(20,4,20,0.55)'); g.addColorStop(1, 'rgba(20,4,20,0)');
      this.scrimG = g; this.scrimGK = hb;
    }
    c.fillStyle = this.scrimG; c.fillRect(-20, hb, VIEW_W + 40, 18);
    c.setTransform(m);
  }
  // Kevin is hot (FRENZY, a 15+ chain or a dash): the world stops and stares
  kevinHot(p) { return p.frenzyT > 0 || (p.combo || 0) >= 15 || p.dashT > 0; }
  // past 50 links the screen edges stream: hk2 = (combo - 50) / 100 gives 0 to 12 lines (6 on lite, none for reduced motion)
  drawEdgeLines(race) {
    const p = race.p, hk2 = clamp(((p.combo || 0) - 50) / 100, 0, 1);
    if (hk2 <= 0 || this.reduced || race.drill || race.over) return;
    const n = Math.round(12 * hk2 * (this.lite ? 0.5 : 1));
    if (!n) return;
    const c = this.ctx, t = this.time, H = this.H;
    c.lineCap = 'round'; c.lineWidth = 2; c.strokeStyle = p.frenzyT > 0 ? HSL82[hueI(t * 400)] : '#ffe9a8'; c.globalAlpha = 0.18 + 0.2 * hk2; c.beginPath();
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1, x = s < 0 ? 4 + h1(i * 3.3) * 26 : VIEW_W - 4 - h1(i * 3.3) * 26, sp = 900 + 500 * h1(i + 0.7);
      const y = ((h1(i * 7.1) * (H + 200) + t * sp) % (H + 200)) - 100, L = 40 + 60 * hk2;
      c.moveTo(x, y); c.lineTo(x, y + L);
    }
    c.stroke(); c.globalAlpha = 1;
  }

  // notice state changes on the player and add juice main.js does not have to ask for
  react(race, dt, wdt) {
    const p = race.p, pv = this.prev;
    // GO: the first simulated tick of a real run punches in on Kevin
    const rt = race.t == null ? null : +race.t;
    if ((this.prevRT === 0 || (this.prevRT === null && rt < 0.1)) && rt > 0 && !race.demo) this.zoomPunch(0.12);
    this.prevRT = rt;
    // a card pick (pending set -> null) shows the YOU marker again for 1.5 s
    if (this.prevPend && !race.pending && !race.demo) this.youT = 1.5;
    this.prevPend = race.pending || null; this.youT = Math.max(0, this.youT - dt);
    // the ending clock (uncapped, real time): reactions, sulks and the steal vignette read it
    if (race.over) this.endT += dt; else this.endT = 0;
    if (this.imp) { this.imp.t -= dt; if (this.imp.t < -0.12) this.imp = null; }
    if (p.dashT > pv.dashT + 0.2) { this.sqV -= 9; this.ring(p.x, p.y - 6, '#8cdcff', 46, 0.35, 4); this.zoomPull(0.06); this.dashAge = 0; }
    this.dashAge += dt;
    this.huffT = Math.max(0, this.huffT - dt);
    this.zoneFaceT = Math.max(0, (this.zoneFaceT || 0) - dt);
    // wall press (iPhones have no vibration, so this is the only feedback): the steer target clamped at the band's
    // edge (main.js clamps tx to it) with Kevin within 6 px of it bulges the tube wall 7 px outward over a 90 px
    // span on his y, squashes him 8% toward it and flicks 3 droplets off it (at most every 250 ms). The bulge holds
    // while he presses and springs back over 0.18 s (reduced motion: no overshoot, no droplets).
    this.wallT = Math.max(0, this.wallT - dt);
    const inp = race.input;
    let press = false;
    if (!race.demo && !race.over && !race.drill && !race.autopilot && inp && inp.tx != null) {
      const band = playBand(p.y, p.side, PB_R), s = p.x <= band.l + 6 ? -1 : p.x >= band.r - 6 ? 1 : 0;
      const atEdge = s < 0 ? inp.tx <= band.l + 2 : s > 0 ? inp.tx >= band.r - 2 : false;
      if (s && atEdge && Math.abs(inp.tx - p.x) < 8) {
        press = true;
        const sd = p.side || 0, wx = this.wallX(p.y, sd, s);
        this.wallT = 0.18; this.wallS = s; this.wallY = p.y; this.wallSd = sd; this.wallNear = Math.abs(wx - p.x) < 30;
        if (!this.wallOn && this.time - this.wallLast >= 0.25) {
          this.wallLast = this.time;
          if (!this.reduced && this.wallNear) {
            for (let i = 0; i < 3; i++) this.addP(3, wx + s * 3, p.y + (Math.random() - 0.5) * 30, -s * (60 + Math.random() * 70), 40 + Math.random() * 60, 0.45, '#ff8fc8', 2 + Math.random(), 260);
          }
        }
      }
    }
    this.wallOn = press;
    if (p.frenzyT > pv.frenzyT + 1) { this.zoomPunch(0.1); this.ring(p.x, p.y, '#ffd75c', 120, 0.6, 8); this.ring(p.x, p.y, '#ff5cd2', 80, 0.45, 5); }
    if (p.inv > pv.inv + 0.3) {
      if (!(this.pHit > 0) && !race.demo) this.oops('hit');   // the rivals near him enjoy it
      this.pHit = 0.35; this.ring(p.x, p.y, '#ffffff', 60, 0.35, 6);
      if (!this.reduced && !race.over) for (let s = -1; s <= 1; s += 2) this.addP(3, p.x + s * 9, p.y + 12, s * (50 + Math.random() * 40), 50 + Math.random() * 40, 0.55, '#9ae2ff', 2.4, 220);
    }
    if (p.stuck > pv.stuck + 0.2) this.sqV += 10;
    // a chain of 3+ that drops shatters its ring (unless main.js already said so, or it was banked)
    if (pv.combo >= 3 && p.combo < pv.combo && this.time - this.lastBankT > 0.3) this.comboBreak(p.x, p.y, pv.combo);
    // every link makes the chain feel bigger: a burst in the timer colour, a ring every 5, a punch every 10
    if (p.combo > pv.combo && !race.demo && !race.over) {
      const n = p.combo, cheap = this.lite || this.reduced, f = clamp((p.comboT || 0) / (p.comboMax || 1), 0, 1);
      let cnt = Math.min(3 + Math.floor(n / 4), 12); if (cheap) cnt = Math.ceil(cnt / 2);
      this.burst(p.x, p.y, this.ringCol(f), cnt, 110 + Math.min(n, 40) * 3, 0.45, 2.6);
      if (Math.floor(n / 5) > Math.floor(pv.combo / 5) && (!cheap || n % 10 === 0)) this.ring(p.x, p.y, this.ringCol(f), 26 + Math.min(n, 40), 0.4, 4);
      if (Math.floor(n / 10) > Math.floor(pv.combo / 10)) this.zoomPunch(cheap ? 0.02 : 0.04);
      this.sqV -= cheap ? 1.5 : 3; this.linkT = 0.08;   // a quick 1.12x stretch on every link
      this.pushLink(p, race.t);
    }
    const tier = p.frenzyT > 0 ? (p.tier || 0) : 0;
    if (tier > this.prevTier && !race.demo) {
      this.zoomPunch(this.lite ? 0.035 : 0.07);
      this.ring(p.x, p.y, '#ffd75c', 90, 0.5, 7);
      if (!this.lite) this.ring(p.x, p.y, '#ff5cd2', 60, 0.4, 5);
    }
    this.prevTier = tier;
    // micro reactions: gulp a snack, wink at an overtake, flinch then grin at a near miss
    if (this.prevE != null && p.e > this.prevE + 2) this.chompT = 0.14;
    if (this.prevOv != null && p.overtakes > this.prevOv) this.winkT = 0.4;
    this.prevE = p.e; this.prevOv = p.overtakes;
    this.linkT = Math.max(0, this.linkT - dt);
    this.chompT = Math.max(0, this.chompT - dt); this.winkT = Math.max(0, this.winkT - dt); this.nearT = Math.max(0, this.nearT - dt);
    this.accT = Math.max(0, this.accT - dt);
    pv.dashT = p.dashT; pv.frenzyT = p.frenzyT; pv.inv = p.inv; pv.stuck = p.stuck; pv.combo = p.combo;
    // squash and stretch spring: stretches long while dashing
    const want = p.dashT > 0 ? 0.24 : p.frenzyT > 0 ? 0.08 : 0;
    this.sqV += ((want - this.sq) * 260 - this.sqV * 13) * dt; this.sq = clamp(this.sq + this.sqV * dt, -0.4, 0.5);
    this.pHit = Math.max(0, this.pHit - dt);
    this.desat = Math.max(0, this.desat - dt); this.gateFlash = Math.max(0, this.gateFlash - dt); this.oopsT = Math.max(0, (this.oopsT || 0) - dt);
    // crossing into a new zone tears the gate membrane
    const zi = zoneIndex(p.y);
    if (this.lastZi >= 0 && zi > this.lastZi) {
      // Kevin reacts to the new zone (a live race only): a 1.1 s face beat (the Egg's hearts hold 1.5 s)
      if (!race.demo && !race.over && !race.drill && ZONES[zi]) { this.zoneFaceId = ZONES[zi].id; this.zoneFaceT = this.zoneFaceId === 'egg' ? 1.5 : 1.1; this.zoneFaceD = this.zoneFaceT; }
      this.confetti(p.x, p.y + 30, 28);
      this.gateTear(zi, p);
      if (this.reduced || this.noFlash) { this.flash = 0.1; this.flashCol = css(this.wallC); }
      else if (this.time - this.lastFlashT >= 0.5 && this.flashOk()) { this.gateFlash = 0.3; this.lastFlashT = this.time; }   // the same 0.5 s limiter (and hard cap) as flash
    }
    this.lastZi = zi;
    // steer ghost + body lean from the finger target (not for the autopilot demo)
    const tx = race.input && !race.demo && !race.autopilot ? race.input.tx : null;
    if (tx != null) { this.ghostA = 1; this.ghostX = tx; } else this.ghostA = Math.max(0, this.ghostA - dt / 0.25);
    const lw = tx != null ? clamp((tx - p.x) / 120, -1, 1) * 0.35 : 0;
    this.lean += (lw - this.lean) * Math.min(1, dt * 10);
    // trail sampled at 60 Hz of world time, whatever the screen rate
    this.trailAcc += wdt;
    for (let i = 0; i < 3 && this.trailAcc >= 1 / 60; i++) {
      this.trailAcc -= 1 / 60; const j = this.trH;
      this.trX[j] = p.x; this.trY[j] = p.y; this.trHue[j] = (this.time * 400) % 360;
      this.trH = (j + 1) % TRAIL_N; if (this.trN < TRAIL_N) this.trN++;
    }
    if (this.trailAcc > 1 / 20) this.trailAcc = 0;
    // embers from a hot combo
    // (from a chain of 200 they come 1.5x as fast, cycling through 6 hues: few colours, so the dot cache stays put)
    if (p.combo >= 3 && !race.drill) {
      const hot2 = p.combo >= 200;
      this.emberT += wdt * (2 + p.combo / 5) * (hot2 ? 1.5 : 1);
      while (this.emberT >= 1) {
        this.emberT -= 1;
        const hk = Math.min(p.combo, 50) / 50, ang = p.heading || 0;
        const col = hot2 && !this.reduced ? HSL75[(hueI(this.time * 240 + Math.random() * 60) / 6 | 0) * 6] : HEAT[Math.min(7, 3 + Math.round(hk * 4))];
        this.addP(0, p.x - Math.sin(ang) * 34 + (Math.random() - 0.5) * 8, p.y - 34, (Math.random() - 0.5) * 50, -30 - Math.random() * 40, 0.6 + Math.random() * 0.3, col, 1.4 + Math.random() * 1.4);
      }
    } else this.emberT = 0;
  }

  // the membrane tears: 10 to 14 shreds in the new wall colour fly off the gate line, plus 6 sparks in the zone's glows
  gateTear(zi, p) {
    const z = ZONES[zi]; if (!z) return;
    const wy = ZSTART[zi], side = wy >= FORK_Y0 ? (p.side || (this.race && this.race.eggSide) || 0) : 0, ch = chan(wy, side);
    const n = (this.reduced || this.lite ? 5 : 10) + Math.floor(Math.random() * 5), G = ZGLOW[z.id] || ['#ffffff'];
    for (let i = 0; i < n; i++) {
      const x = ch.c + (Math.random() * 2 - 1) * ch.h * 0.9, a = Math.atan2(1, (x - p.x) / 60) + (Math.random() - 0.5) * 0.8, v = 140 + Math.random() * 160;
      this.addP(5, x, wy + 4, Math.cos(a) * v, Math.sin(a) * v, 0.6 + Math.random() * 0.25, z.wall, 7 + Math.random() * 5, 0, Math.random() * TAU, (Math.random() - 0.5) * 18);
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU, v = 60 + Math.random() * 120;
      this.addP(0, p.x + (Math.random() - 0.5) * 40, wy + 10, Math.cos(a) * v, Math.abs(Math.sin(a)) * v + 40, 0.8, G[i % G.length], 2.4 + Math.random() * 1.6);
    }
  }

  // ---------------------------------------------------------------- backdrop
  // st: null for the full width, or a strip planner (backStrips): each 720 px tile row then draws only the flesh
  // beside the opaque tube(s) in that row's own screen band (stripsFor), so the Sea and the Fork stop painting whole
  // tiles under the tube
  tileLayer(k, a, par, st = null, tcv = null) {
    if (a <= 0.01) return;
    const c = this.ctx, t = tcv || this.tile(k), base = this.camY * par;
    c.globalAlpha = a;
    const k0 = Math.floor((base - 40) / TH), k1 = Math.floor((base + this.H + 40) / TH);
    for (let j = k0; j <= k1; j++) {
      const y = this.H - ((j + 1) * TH - base);
      const ya = Math.max(-40, y), yb = Math.min(this.H + 40, y + TH + 0.5);
      if (yb - ya < 0.5) continue;
      const n = st ? this.stripsFor(ya, yb) : -1;
      if (n < 0) { c.drawImage(t, -20, y, TW, TH + 0.5); this.imgArea += TW * (TH + 0.5); continue; }
      // only the on-screen part of the row (rows are 720 tall; the screen shows parts of two)
      const SX = this._sx, ks = t.height / TH, sy0 = Math.max(0, (ya - y) * ks), sh = Math.min(t.height - sy0, (yb - ya) * ks);
      for (let i = 0; i < n; i += 2) {
        const a1 = clamp(SX[i], -20, TW - 20), b1 = clamp(SX[i + 1], -20, TW - 20);
        if (b1 - a1 < 0.5) continue;
        c.drawImage(t, (a1 + 20) * TS, sy0, (b1 - a1) * TS, sh, a1, ya, b1 - a1, yb - ya);
        this.imgArea += (b1 - a1) * (yb - ya);
      }
    }
    c.globalAlpha = 1;
  }
  // zone zi's tile with zi + 1's mixed over it at bt (quantised to 0.04): one canvas, repainted only when the step
  // changes (about every 0.1 s through a blend). Both tiles carry their own baked dim, so the mix is the old two-layer look
  blendTile(zi, bt) {
    const q = Math.round(bt * 25) / 25, B = this.btile || (this.btile = { cv: null, zi: -1, q: -1, a: null, b: null });
    const ta = this.tile(zi), tb = this.tile(zi + 1);
    if (!B.cv || B.cv.width !== ta.width || B.cv.height !== ta.height) { B.cv = mk(ta.width, ta.height); B.zi = -1; }
    if (B.zi !== zi || B.q !== q || B.a !== ta || B.b !== tb) {
      const g = B.cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.drawImage(ta, 0, 0);
      g.globalAlpha = q; g.drawImage(tb, 0, 0); g.globalAlpha = 1;
      B.zi = zi; B.q = q; B.a = ta; B.b = tb;
    }
    return B.cv;
  }
  // the flesh is dimmed inside its baked tile (dimOf), so there is no full-screen wash any more
  drawBack(deep, zi, bt, st = null) {
    const c = this.ctx, zn = ZONES[zi + 1];
    const da = zn ? dimOf(zi) + (dimOf(zi + 1) - dimOf(zi)) * bt : dimOf(zi);
    this.dimA = da;
    this.dimZ = zn && bt > 0.5 ? zi + 1 : zi;   // (whose dim colour: the zone holding the screen)
    if (!this.safeBack) { c.fillStyle = cssQ(lerpC(deep, (ZONES[this.dimZ] && DIM_RGB[ZONES[this.dimZ].id]) || DEEP_K, da, SCR)); c.fillRect(-30, -30, VIEW_W + 60, this.H + 60); }
    // stage 1 and lite: one tile layer outside the middle of a blend (the next zone's alone past 85%)
    const cheap = this.lite || this.q === 0;
    // lite: ONE back-tile layer, snapped at bt 0.5 the way its vignette is
    if (this.lite) this.tileLayer(zn && bt >= 0.5 ? zi + 1 : zi, 1, 0.35, st);
    else if (zn && cheap && bt > 0.85) this.tileLayer(zi + 1, 1, 0.35, st);
    // full quality mid-blend: ONE pre-mixed tile (blendTile), not two full layers (the second was most of the
    // blend's overdraw: imgScreens 2.6 to 3.2 at the Fork to Rapids gate)
    else if (zn && !cheap && bt >= 0.98) this.tileLayer(zi + 1, 1, 0.35, st);
    else if (zn && !cheap && bt > 0.02) this.tileLayer(zi, 1, 0.35, st, this.blendTile(zi, bt));
    else {
      this.tileLayer(zi, 1, 0.35, st);
      if (zn && !(cheap && bt < 0.15)) this.tileLayer(zi + 1, bt, 0.35, st);
    }
  }
  // Tube Rapids, outside the tube: about 12 long foam streaks rushing down at 1.6x the camera (8 on lite), so the
  // flesh round the narrow tube reads as white water too. Drawn before the tube, which covers the middle.
  drawRapidsFoam(zi, bt) {
    const zA = ZONES[zi], zB = ZONES[zi + 1], w = (zA.id === 'rapids' ? 1 - bt : 0) + (zB && zB.id === 'rapids' ? bt : 0);
    if (w < 0.02) return;
    const c = this.ctx, n = this.lite ? 8 : 12, L = this.H + 420, cam = this.camY;
    c.globalAlpha = w * 0.5; c.strokeStyle = 'rgba(200,245,255,0.3)'; c.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      c.lineWidth = k ? 3.5 : 2; c.beginPath();
      for (let i = k; i < n; i += 2) {
        const side = i % 4 < 2 ? 0 : 1, x = side ? VIEW_W * (0.72 + 0.3 * h1(i * 4.7 + 3)) : VIEW_W * (0.28 - 0.3 * h1(i * 4.7 + 3));
        const y = this.H + 210 - ((h1(i * 2.9 + 1) * L - cam * 1.6) % L + L) % L, len = 100 + 120 * h1(i + 0.3);
        c.moveTo(x, y); c.quadraticCurveTo(x + Math.sin(i * 1.7) * 7, y + len * 0.5, x, y + len);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  // the opaque tube hides the middle of the backdrop, so each tile row draws only the flesh beside it (stripsFor).
  // A zoom-out, a shaking view or a wall cache from another frame keep the full draw. Returns the planner or null.
  backStrips(race) {
    if (this.zoomK < 0 || !this.safeBack) return null;
    const S = this.sides(race);
    for (const sd of S) if (this.wcF[sd + 1] !== this.frame) return null;
    this.stripS = S; this.stripRace = race;
    return S;
  }
  // the flesh strips of one screen band [ys0, ys1] (padded 12 px for the wall wobble and strokes) into this._sx as
  // [x0, x1] pairs; returns how many numbers, or -1 when the band must be drawn whole (it leaves the wall cache)
  stripsFor(ys0, ys1) {
    const S = this.stripS, race = this.stripRace, cam = this.camY, H = this.H;
    const w0 = cam + H - ys1, w1 = cam + H - ys0;
    const i0 = Math.floor((w0 - this.wcY0) / 11), i1 = Math.ceil((w1 - this.wcY0) / 11);
    if (i0 < 0 || i1 > this.wcN - 1) return -1;
    const CV = this._cv || (this._cv = new Float32Array(4)), SX = this._sx || (this._sx = new Float32Array(8));
    let nc = 0;
    const ps = race.p.side;
    for (const side of S) {
      const B = this.wc[side + 1], dead = side && race.eggSide && side !== race.eggSide;
      let maxL = -1e9, minR = 1e9, whole = true;
      for (let i = i0; i <= i1; i++) {
        const wy = this.wcY0 + i * 11;
        // where drawTube stops this tube (the far tube past the Fork, the wrong tube's dead end) it covers nothing
        if ((side && ps && side !== ps && wy > FORK_END + 200) || (dead && wy > DEAD_Y)) { whole = false; break; }
        const cx = B[i * 3], h = B[i * 3 + 1] + B[i * 3 + 2];
        if (cx - h > maxL) maxL = cx - h; if (cx + h < minR) minR = cx + h;
      }
      if (whole && minR - maxL >= 40 && nc < 4) { CV[nc++] = maxL + 12; CV[nc++] = minR - 12; }
    }
    if (nc === 4 && CV[2] < CV[0]) { const a = CV[0], b = CV[1]; CV[0] = CV[2]; CV[1] = CV[3]; CV[2] = a; CV[3] = b; }
    if (nc === 4 && CV[2] <= CV[1]) { CV[1] = Math.max(CV[1], CV[3]); nc = 2; }   // overlapping tubes merge
    let n = 0, x = -20;
    for (let i = 0; i < nc; i += 2) { if (CV[i] > x) { SX[n++] = x; SX[n++] = CV[i]; } x = Math.max(x, CV[i + 1]); }
    if (x < TW - 20) { SX[n++] = x; SX[n++] = TW - 20; }
    return n;
  }

  // the tubes on screen (constant arrays, shared: never mutate the answer)
  sides(race) {
    const y0 = this.camY;
    if (y0 + this.H < FORK_Y0) return S_ZERO;
    if (y0 > FORK_END + 200) return (race.p.side || race.eggSide) < 0 ? S_LEFT : S_RIGHT;
    return S_BOTH;
  }
  // sample each visible side's wall once per frame (11 px step) so wallX interpolates instead of calling channel()
  buildWallCache(race) {
    if (this.wcB === this.frame) return;
    this.wcB = this.frame;
    const step = 11, y0 = Math.floor((this.camY - 240) / step) * step, n = Math.ceil((this.H + 480) / step) + 2, t = this.time;
    this.wcY0 = y0; this.wcN = n;
    for (const side of this.sides(race)) {
      const k = side + 1; let B = this.wc[k];
      if (!B || B.length < n * 3) B = this.wc[k] = new Float32Array(n * 3 + 60);
      for (let i = 0, y = y0; i < n; i++, y += step) {
        const ch = chan(y, side, this._wcO || (this._wcO = { c: 0, h: 0 }));   // (one reused out object)
        B[i * 3] = ch.c; B[i * 3 + 1] = ch.h; B[i * 3 + 2] = Math.sin(y / 60 + t * 2) * 3 + Math.sin(y / 23 - t * 3) * 1.2;
      }
      this.wcF[k] = this.frame;
    }
  }
  drawTube(race, lite, wall, deep) {
    const c = this.ctx, y0 = this.camY - 60, y1 = this.camY + this.H + 60, step = this.lite ? 44 : 22, t = this.time;
    this.buildWallCache(race);
    // the outline into reused buffers (x, screen y pairs), at most two tubes
    let np = 0;
    const need = (Math.ceil((y1 - y0) / step) + 2) * 2;
    for (const side of this.sides(race)) {
      if (np >= 2) break;
      if (this.tubeL[np].length < need) { this.tubeL[np] = new Float32Array(need + 32); this.tubeR[np] = new Float32Array(need + 32); }
      const L = this.tubeL[np], R = this.tubeR[np];
      let m = 0;
      // the wrong tube really stops at DEAD_Y (the outside shows beyond its cap)
      const dead = side && race.eggSide && side !== race.eggSide;
      for (let y = y0; y <= y1; y += step) {
        const top = side && race.p.side && side !== race.p.side && y > FORK_END + 200;
        if (side && side !== (race.p.side || side) && y > FORK_END + 600) break;
        const yy = dead && y > DEAD_Y ? DEAD_Y : y, sy = this.sy(yy);
        L[m] = this.wallX(yy, side, -1); L[m + 1] = sy; R[m] = this.wallX(yy, side, 1); R[m + 1] = sy; m += 2;
        if (top) { this.cutT = this.frame; this.cutL = L[m - 2]; this.cutR = R[m - 2]; this.cutY = sy; }
        if (top || yy === DEAD_Y) break;
      }
      if (m >= 4) { this.tubeN[np] = m; np++; }
    }
    const TL = this.tubeL, TR = this.tubeR, TN = this.tubeN;
    // the outline is built ONCE a frame into Path2D objects (the tube, both walls, the walls 9 px in) and every fill
    // and stroke reuses them, instead of re-walking the points per call (that was most of ~466 lineTo a frame).
    // The path helpers are methods (tubePath, wallPath, wallPathH, fillTube, walls, wallsH: no closures a frame)
    const P2 = typeof Path2D !== 'undefined';
    this.tbNp = np; this.tbP2 = P2; this.tbTP = null; this.tbW0 = null; this.tbW9 = null; this.tbWH = null;
    const fillTube = this.fillTubeB;
    // the tube gradient only depends on two colours: cache it, keyed on the colours quantised to steps of 4
    // (an integer key, 18 bits per colour: no strings or arrays per frame)
    const gk = (((deep[0] >> 2) << 12) | ((deep[1] >> 2) << 6) | (deep[2] >> 2)) * 262144 + (((lite[0] >> 2) << 12) | ((lite[1] >> 2) << 6) | (lite[2] >> 2));
    if (gk !== this.tubeGK || !this.tubeG || !this.wallSt) {
      const qd = [(deep[0] >> 2) << 2, (deep[1] >> 2) << 2, (deep[2] >> 2) << 2], ql = [(lite[0] >> 2) << 2, (lite[1] >> 2) << 2, (lite[2] >> 2) << 2];
      const g = c.createLinearGradient(0, 0, VIEW_W, 0);
      g.addColorStop(0, css(qd)); g.addColorStop(0.5, css(ql)); g.addColorStop(1, css(qd));
      this.tubeG = g; this.tubeGK = gk;
      // [4]: the 34 px deep glow (0.55) and the 12 px wall glow (0.22) merged into one 26 px stroke: wall over deep,
      // pre-composited, at their combined alpha 1 - 0.45 * 0.78
      const aC = 1 - 0.45 * 0.78, mx = (i) => (wall[i] * 0.22 + deep[i] * 0.55 * 0.78) / aC;
      this.wallSt = [css(wall, 0.12), css(wall, 0.22), css(wall, 1), css(deep, 0.55), css([mx(0), mx(1), mx(2)], +aC.toFixed(3))];
    }
    const WS = this.wallSt;
    c.fillStyle = this.tubeG; fillTube();
    // (the Great Womb Sea's dark edges are baked into its zone vignette, zoneVig)
    const zA0 = ZONES[this.zi].id, zB0 = ZONES[this.zi + 1] ? ZONES[this.zi + 1].id : null;
    // the Gate of Goo gets the same framing, softer (0.35), in its own deep colour (read from ZONES)
    const gooW = (zA0 === 'goo' ? 1 - this.bt : 0) + (zB0 === 'goo' ? this.bt : 0);
    if (gooW > 0.01 && GOO_I_R >= 0) {
      const gc = zcol(ZONES[GOO_I_R])[0];
      if (!this.gooEdgeG || this.gooEdgeK !== gc) {
        const d = lerpC(rgb(gc), [0, 0, 0], 0.5), g = c.createLinearGradient(0, 0, VIEW_W, 0);
        g.addColorStop(0, css(d, 0.18)); g.addColorStop(0.25, css(d, 0)); g.addColorStop(0.75, css(d, 0)); g.addColorStop(1, css(d, 0.18));
        this.gooEdgeG = g; this.gooEdgeK = gc;
      }
      c.globalAlpha = gooW; c.fillStyle = this.gooEdgeG; fillTube(); c.globalAlpha = 1;
    }
    // inside the tube: the zone's texture at a faster parallax, soft inner shadow, then the floating stuff
    c.save();
    // no anti-aliased path clip (slow on phones): the inner tile is a pattern fill of the tube path, and the
    // floating stuff is clipped to the tubes' bounding box (a cheap rectangle clip). Lite fills only the dominant
    // zone of a blend and a little fainter; full quality fills both (zi at 1 - bt, zi + 1 at bt).
    const base = this.camY * 0.6;
    this.tbOy = ((this.H + base) % TH + TH) % TH;
    if (this.lite || this.q === 0) {   // lite and stage 1: only the dominant zone of a blend (lite a little fainter)
      const k = this.bt < 0.5 || !ZONES[this.zi + 1] ? this.zi : this.zi + 1;
      this.patFill(k, this.innerA(k) * (this.lite ? 0.25 / 0.38 : 1));
    } else {
      // (the second zone's inner tile is the last optional layer the fill budget drops: then the dominant one alone)
      const twoOk = !ZONES[this.zi + 1] || this.bt < 0.02 || this.bt > 0.98 || !this.overBudget('near', VIEW_W * this.H * 0.6);
      if (twoOk) {
        this.patFill(this.zi, this.innerA(this.zi) * (1 - this.bt));
        if (ZONES[this.zi + 1]) this.patFill(this.zi + 1, this.innerA(this.zi + 1) * this.bt);
      } else { const k = this.bt < 0.5 ? this.zi : this.zi + 1; this.patFill(k, this.innerA(k)); }
    }
    // the zone's mood light over the texture (one fill per zone, blended across the gate; stage 1 only the dominant
    // zone, lite none)
    if (this.q === 0 && !this.lite) { const k = this.bt < 0.5 || !ZONES[this.zi + 1] ? this.zi : this.zi + 1; this.moodFill(race, k, 1); }
    else if (!this.lite) {
      this.moodFill(race, this.zi, 1 - (ZONES[this.zi + 1] ? this.bt : 0));
      if (ZONES[this.zi + 1]) this.moodFill(race, this.zi + 1, this.bt);
    }
    // the floaters crossfade on bw (bt remapped so a zone under 0.15 of the blend is culled outright and the two
    // weights still sum to 1: no zone ever costs a full pass for a 5% look)
    const bw = ZONES[this.zi + 1] ? clamp((this.bt - 0.15) / 0.7, 0, 1) : 0;
    this.blendW = bw;
    // full quality clips the zone art to the tube itself (the same Path2D fillTube uses), so nothing spills past the
    // walls in a hard-edged rectangle: the sun, the far landmarks and the set pieces in one clip, the wall glows
    // unclipped (their outer half shades the flesh), then the floaters in a second clip
    const pathClip = this.q === 1 && !this.lite && P2;
    let lx = VIEW_W, rx = 0;
    if (pathClip) {
      if (!this.tbTP) { this.tbTP = new Path2D(); this.tubePath(this.tbTP); }
      c.clip(this.tbTP);
      this.drawSun(race, fillTube);
      this.farPre = this.frame;
      if (bw < 1) this.farOf(this.zi, 1 - bw);
      if (bw > 0) this.farOf(this.zi + 1, bw);
      this.drawPieces();
      this.drawShoal(race);
      c.restore(); c.save();
    } else {
      for (let k2 = 0; k2 < np; k2++) for (let i = 0; i < TN[k2]; i += 2) { if (TL[k2][i] < lx) lx = TL[k2][i]; if (TR[k2][i] > rx) rx = TR[k2][i]; }
      c.beginPath(); c.rect(lx - 4, -40, Math.max(0, rx - lx + 8), this.H + 80); c.clip();
      this.drawSun(race, fillTube);
      this.drawPieces();
      this.drawShoal(race);
    }
    c.lineJoin = 'round'; c.lineCap = 'butt';
    // the merged fat glow (bevel joins: the round ones cost the most on a 26 px stroke); stage 1 bakes its deep half
    // into the vignette and strokes only the thin wall glow further down
    if (!this.lite && this.q !== 0) { c.lineJoin = 'bevel'; c.strokeStyle = WS[4]; c.lineWidth = 26; this.wallsH(); c.lineJoin = 'round'; }
    c.strokeStyle = WS[0]; c.lineWidth = 8; this.walls(9);
    if (pathClip) c.clip(this.tbTP);
    if (bw < 1) this.drawNear(this.zi, 1 - bw);
    if (bw > 0) this.drawNear(this.zi + 1, bw);
    if (this.gateFlash > 0 && !this.reduced && !this.noFlash) {
      const red = wall[0] > 1.6 * wall[1];
      c.fillStyle = cssQ(wall, Math.min(red ? 0.25 : 0.35, (this.gateFlash / 0.3) * 0.35));
      fillTube();
    }
    c.restore();
    // stage 1 and lite keep the cheap rectangle clip: the two slivers between its edges and the walls are painted
    // back with the outside itself, so the floaters never end in a straight vertical edge
    if (!pathClip) this.repaintSlivers(lx - 5, rx + 5);
    this.drawForkSplit(race, deep);
    // each zone's own wall (blended across the gate), then glossy rims and waving cilia
    const zA = ZONES[this.zi].id, zB = ZONES[this.zi + 1] ? ZONES[this.zi + 1].id : null, bt = zB ? this.bt : 0;
    if (bw < 1) this.drawWallStyle(race, zA, 1 - bw, wall);
    if (zB && bw > 0) this.drawWallStyle(race, zB, bw, wall);
    const rapW = (zA === 'rapids' ? 1 - bt : 0) + (zB === 'rapids' ? bt : 0);
    c.lineJoin = 'round';
    if (!this.lite && this.q === 0) { c.lineJoin = 'bevel'; c.strokeStyle = WS[1]; c.lineWidth = 12; this.wallsH(); c.lineJoin = 'round'; }
    c.strokeStyle = WS[2]; c.lineWidth = 2.6; this.walls(0);
    // the Great Womb Sea's lit membrane: a 3.5 px coral '#ffb59a' wall with a 1 px '#ffe6d8' highlight inside it at 0.5
    const seaW = (zA === 'sea' ? 1 - bt : 0) + (zB === 'sea' ? bt : 0);
    if (seaW > 0.02) {
      c.globalAlpha = seaW; c.strokeStyle = '#ffb59a'; c.lineWidth = 3.5; this.walls(0);
      c.globalAlpha = seaW * 0.5; c.strokeStyle = '#ffe6d8'; c.lineWidth = 1;
      c.beginPath(); this.wallPath(c, 1.6); c.stroke();   // (a one-shot stroke: no Path2D per frame)
      c.globalAlpha = 1;
    }
    if (this.fwGF === this.frame) {   // the Fork's wrong tube: its wall drained of colour (drawForkSplit kept the points)
      const G = this._fwG.a, gn = this._fwG.n; c.globalAlpha = 0.8; c.strokeStyle = '#8a8a9c'; c.lineWidth = 3.2; c.beginPath();
      for (let k = 0; k < 2; k++) { c.moveTo(G[k], G[2]); for (let i = 3; i < gn; i += 3) c.lineTo(G[i + k], G[i + 2]); }
      c.stroke(); c.globalAlpha = 1;
    }
    this.drawDent(wall);
    this.drawWallHit(race, wall);
    if (rapW <= 0.98 && this.q !== 0) {   // the Rapids comb their own long cilia (stage 1 skips the wall cilia)
      c.globalAlpha = 1 - rapW;
      c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath();
      // the two sway phases, once a frame for every point index, shared by both walls of every tube
      let mMax = 0; for (let k = 0; k < np; k++) if (TN[k] > mMax) mMax = TN[k];
      if (!this.ciS || this.ciS.length < mMax) { this.ciS = new Float32Array(mMax + 32); this.ciS2 = new Float32Array(mMax + 32); }
      const CS = this.ciS, CS2 = this.ciS2;
      for (let i = 0; i < mMax; i += 2) { CS[i] = Math.sin(t * 6 + i * 0.45) * 5; CS2[i] = Math.sin(t * 6 + i * 0.45 + 1.2) * 4; }
      for (let k = 0; k < np; k++) {
        const L = TL[k], R = TR[k], m = TN[k];
        for (let i = 0; i < m; i += 2) {
          const sw = CS[i], sw2 = CS2[i];
          c.moveTo(L[i], L[i + 1]); c.quadraticCurveTo(L[i] + 5, L[i + 1] + sw2, L[i] + 9, L[i + 1] + sw);
          c.moveTo(R[i], R[i + 1]); c.quadraticCurveTo(R[i] - 5, R[i + 1] + sw2, R[i] - 9, R[i + 1] + sw);
        }
      }
      c.stroke(); c.globalAlpha = 1;
    }
    // the far tube past the Fork fades into the flesh instead of ending in a hard flat edge
    if (this.cutT === this.frame && this.cutY > -20 && this.cutY < this.H + 20) {
      const dc = lerpC(deep, (ZONES[this.dimZ | 0] && DIM_RGB[ZONES[this.dimZ | 0].id]) || DEEP_K, this.dimA || 0, SCR), g = c.createLinearGradient(0, this.cutY - 2, 0, this.cutY + 120);
      g.addColorStop(0, css(dc, 1)); g.addColorStop(1, css(dc, 0));
      c.fillStyle = g; c.fillRect(this.cutL - 8, this.cutY - 2, this.cutR - this.cutL + 16, 122);
    }
    // the Fork's signposts, over the walls and the divider
    this.flushForkSigns();
    // a fleshy gate at every zone threshold
    for (let i = 1; i < ZONES.length; i++) this.drawZoneGate(i, race);
    // the dead end of the wrong tube
    const ps = race.p.side;
    if (ps && ps !== race.eggSide) {
      const y = this.sy(DEAD_Y), ch = chan(DEAD_Y, ps);
      if (y > -80 && y < this.H + 80) {
        // the tube's outline already stops here; the floaters (clipped to a rectangle) are painted over with the
        // outside itself (the same backdrop layers, clipped to the dead end's column), so it reads as solid flesh
        c.save(); c.beginPath(); c.rect(ch.c - ch.h - 24, Math.max(-40, y - this.H - 80), ch.h * 2 + 48, Math.max(0, y + 1 - Math.max(-40, y - this.H - 80))); c.clip();
        this.drawBack(deep, this.zi, this.bt); c.restore();
        // a fleshy cap with a shadow pooling under it: this tube really does just stop
        if (!this.deadG) { this.deadG = c.createLinearGradient(0, 0, 0, 140); this.deadG.addColorStop(0, 'rgba(0,0,0,0.38)'); this.deadG.addColorStop(1, 'rgba(0,0,0,0)'); }
        c.save(); c.translate(0, y); c.fillStyle = this.deadG; c.fillRect(ch.c - ch.h, 0, ch.h * 2, 140); c.restore();
        c.fillStyle = cssQ(wall, 0.35); c.beginPath(); c.moveTo(ch.c - ch.h, y - 6); c.quadraticCurveTo(ch.c, y + 26, ch.c + ch.h, y - 6); c.quadraticCurveTo(ch.c, y + 40, ch.c - ch.h, y - 6); c.fill();
        c.strokeStyle = cssQ(wall); c.lineWidth = 3; c.beginPath(); c.moveTo(ch.c - ch.h, y); c.quadraticCurveTo(ch.c, y + 30, ch.c + ch.h, y); c.stroke();
        // a tumbleweed rolls past. There is nothing here.
        const tx = ch.c + Math.sin(t * 0.8) * ch.h * 0.6, ty = y + 40;
        c.save(); c.translate(tx, ty); c.rotate(t * 3); c.strokeStyle = 'rgba(220,170,120,0.8)'; c.lineWidth = 1.5; c.beginPath();
        for (let i = 0; i < 7; i++) { const a = i * 0.9; c.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); c.lineTo(Math.cos(a + 2.6) * 9, Math.sin(a + 2.6) * 9); }
        c.stroke(); c.restore();
        this.sign(ch.c, y + 80, 'NO EGG HERE', '#ff5c7a');
      }
    }
  }
  // drawTube's far landmarks for zone zi at weight a (full quality draws them in the tube clip; drawNear skips them then)
  // the million, still out there: a background shoal of up to 36 silhouette swimmers (16 on lite) at parallax 0.55,
  // swimming at 0.6 to 0.9 of the crowd's pace (so Kevin visibly passes them), wiggling at 10 to 14 Hz, in the zone's
  // mood colour 35% darker. Their number follows the HUD's place: n = round(36 * clamp((log10(place) - 2) / 4, 0, 1)),
  // so the top 100 swim alone. Two batched passes (clear of the HUD at 0.19; in its 40 px band at half that), each one
  // tail stroke and one head fill. Reduced motion: no drift, no wiggle. Nothing allocated a frame.
  drawShoal(race) {
    if (race.demo || race.over || race.drill) return;
    const place = Math.max(1, +race.rank || 1), cap = this.lite ? 16 : 36;
    const n = Math.min(cap, Math.round(36 * clamp((Math.log10(place) - 2) / 4, 0, 1)));
    if (n <= 0) return;
    const zi = this.bt > 0.5 && ZONES[this.zi + 1] ? this.zi + 1 : this.zi, z = ZONES[zi];
    if (!z) return;
    if (this.shoalZ !== zi) {
      const M = MOOD[z.id], src = M ? M[Math.floor(M.length / 2)][1] : zcol(z)[1];
      this.shoalZ = zi; this.shoalC = css(lerpC(rgb(src), [0, 0, 0], 0.35));
    }
    const c = this.ctx, H = this.H, cam = this.camY, red = this.reduced, t = red ? 0 : this.time, fb = this.agFb > 0 ? this.agFb : 430;
    const LT = H + 80, hb = race.demo ? -1e9 : this.hudB();
    // each swimmer once a frame into the kept buffer (x, y, angle, tail phase, band flag); the passes read it back
    const SB = this.shoalB || (this.shoalB = new Float32Array(36 * 5));
    let m = 0;
    for (let i = 0; i < n; i++) {
      const u0 = h1(i * 7.3 + 1.1) * LT / 0.55, v = fb * (0.6 + 0.3 * h1(i * 2.9 + 4.4));
      const sy = ((H * 0.5 - (u0 + v * t - cam) * 0.55) % LT + LT) % LT - 40;
      if (sy < hb || sy > H + 20) continue;
      const j = m * 5;
      SB[j] = VIEW_W * (0.08 + 0.84 * h1(i * 3.1 + 0.7)) + (red ? 0 : Math.sin(t * 0.4 + i * 1.3) * 10); SB[j + 1] = sy;
      SB[j + 2] = (h1(i + 9.1) - 0.5) * 0.5; SB[j + 3] = red ? 0 : t * (10 + 4 * h1(i * 1.9 + 2.2)) * TAU + i; SB[j + 4] = sy < hb + 40 ? 1 : 0;
      m++;
    }
    if (!m) return;
    c.fillStyle = this.shoalC; c.strokeStyle = this.shoalC; c.lineWidth = 1.6; c.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      let any = false;
      c.beginPath();
      for (let r = 0; r < m; r++) {
        const j = r * 5; if (SB[j + 4] !== pass) continue;
        const sx = SB[j], sy = SB[j + 1], ang = SB[j + 2];
        this.tailQ(c, sx - Math.sin(ang) * 3, sy + Math.cos(ang) * 3, ang, 11, 2.2, SB[j + 3]);
        any = true;
      }
      if (!any) continue;
      c.globalAlpha = pass ? 0.09 : 0.19; c.stroke();
      c.beginPath();
      for (let r = 0; r < m; r++) { const j = r * 5; if (SB[j + 4] !== pass) continue; c.moveTo(SB[j] + 2, SB[j + 1]); c.ellipse(SB[j], SB[j + 1], 2, 3, SB[j + 2], 0, TAU); }
      c.fill();
    }
    c.globalAlpha = 1;
  }
  farOf(zi, a) { if (a > 0.01 && ZONES[zi] && FAR[ZONES[zi].id]) this.drawFar(zi, a); }
  // the two slivers between the rect clip's edges (xl, xr) and the outer walls, one polygon per side, filled with the
  // outside's own tile (the backdrop layer at parallax 0.35, the same pattern transform tileLayer draws it with) at 1
  repaintSlivers(xl, xr) {
    const np = this.tbNp, TL = this.tubeL, TR = this.tubeR, TN = this.tubeN, c = this.ctx;
    if (!np || !(xr > xl)) return;
    let mM = 0; for (let k = 0; k < np; k++) if (TN[k] > mM) mM = TN[k];
    c.beginPath();
    for (let sd = 0; sd < 2; sd++) {
      const P = sd ? TR : TL, ex = sd ? xr : xl;
      let fy = 0, ly = 0, first = true;
      for (let i = 0; i < mM; i += 2) {
        let x = sd ? -1e9 : 1e9, y = 0, hit = false;
        for (let k = 0; k < np; k++) {
          if (TN[k] <= i) continue;
          const v = P[k][i];
          if (sd ? v > x : v < x) { x = v; y = P[k][i + 1]; hit = true; }
        }
        if (!hit) continue;
        if (first) { c.moveTo(ex, y); fy = y; first = false; }
        c.lineTo(x, y); ly = y;
      }
      if (!first) { c.lineTo(ex, ly); c.lineTo(ex, fy); c.closePath(); }
    }
    const zi = this.zi, zn = ZONES[zi + 1], bt = zn ? this.bt : 0, base = this.camY * 0.35;
    const M = this.slvM || (this.slvM = typeof DOMMatrix !== 'undefined' ? new DOMMatrix([1 / TS, 0, 0, 1 / TS, -20, 0]) : null);
    if (M) M.f = ((this.H + base) % TH + TH) % TH;
    if (zn && bt > 0.85) this.sliverFill(zi + 1, 1, M);
    else { this.sliverFill(zi, 1, M); if (zn && bt >= 0.15) this.sliverFill(zi + 1, bt, M); }
    // (the pattern is the undimmed tile: the backdrop's dim goes over it, as drawBack's tile carries it baked in)
    if (this.dimA > 0) { c.globalAlpha = this.dimA; c.fillStyle = dimCss(this.dimZ | 0); c.fill(); }
    c.globalAlpha = 1;
  }
  sliverFill(k, al, M) {
    const pat = this.tilePat(k), c = this.ctx;
    if (!pat || al <= 0.01) return;
    if (M && pat.setTransform) pat.setTransform(M);
    c.globalAlpha = al; c.fillStyle = pat; c.fill();
  }
  // drawTube's path helpers over this frame's outline buffers (tubeL / tubeR / tubeN, tbNp tubes)
  tubePath(g) {
    const TL = this.tubeL, TR = this.tubeR, TN = this.tubeN;
    for (let k = 0; k < this.tbNp; k++) {
      const L = TL[k], R = TR[k], m = TN[k];
      g.moveTo(L[0], L[1]);
      for (let i = 2; i < m; i += 2) g.lineTo(L[i], L[i + 1]);
      for (let i = m - 2; i >= 0; i -= 2) g.lineTo(R[i], R[i + 1]);
      g.closePath();
    }
  }
  wallPath(g, dx) { for (let k = 0; k < this.tbNp; k++) { addPts(g, this.tubeL[k], this.tubeN[k], dx); addPts(g, this.tubeR[k], this.tubeN[k], -dx); } }
  // the fat soft glow along the walls is blurry anyway: its path takes every 2nd point (and always the last one)
  wallPathH(g) {
    for (let k = 0; k < this.tbNp; k++) for (let sd = 0; sd < 2; sd++) {
      const P = sd ? this.tubeR[k] : this.tubeL[k], m = this.tubeN[k];
      g.moveTo(P[0], P[1]);
      for (let i = 4; i < m; i += 4) g.lineTo(P[i], P[i + 1]);
      if (((m - 2) & 3) !== 0) g.lineTo(P[m - 2], P[m - 1]);
    }
  }
  wallsH() {
    const c = this.ctx;
    if (!this.tbP2) { c.beginPath(); this.wallPathH(c); c.stroke(); return; }
    if (!this.tbWH) { this.tbWH = new Path2D(); this.wallPathH(this.tbWH); }
    c.stroke(this.tbWH);
  }
  fillTube() {
    const c = this.ctx;
    if (this.tbP2) { if (!this.tbTP) { this.tbTP = new Path2D(); this.tubePath(this.tbTP); } c.fill(this.tbTP); }
    else { c.beginPath(); this.tubePath(c); c.fill(); }
  }
  // both walls of every tube in one path, so each stroke style is a single stroke call
  walls(dx) {
    const c = this.ctx;
    if (!this.tbP2) { c.beginPath(); this.wallPath(c, dx); c.stroke(); return; }
    if (dx === 0) { if (!this.tbW0) { this.tbW0 = new Path2D(); this.wallPath(this.tbW0, 0); } c.stroke(this.tbW0); }
    else { if (!this.tbW9) { this.tbW9 = new Path2D(); this.wallPath(this.tbW9, dx); } c.stroke(this.tbW9); }
  }
  // zone k's inner texture as a pattern fill of the tube at alpha al (its offset: this.tbOy)
  patFill(k, al) {
    if (al <= 0.01) return;
    const pat = this.tilePat(k), c = this.ctx;
    if (!pat) return;
    if (pat.setTransform && typeof DOMMatrix !== 'undefined') { const M = this.patM || (this.patM = new DOMMatrix([1 / TS, 0, 0, 1 / TS, -20, 0])); M.f = this.tbOy; pat.setTransform(M); }
    c.globalAlpha = al; c.fillStyle = pat; this.fillTube(); c.globalAlpha = 1;
  }
  // zone zi's mood light (MOOD): its cached 4 x 256 gradient stretched over the screen as a pattern, ONE fill of the
  // tube at 0.3 x w. The Launch backlight breathes on this.beat, the Rapids bands drift, the Fork's pink sits on the
  // egg's branch only (one sprite per side). Skipped without pattern transforms (the tube would tile it).
  moodFill(race, zi, w) {
    const z = ZONES[zi];
    if (!z || !MOOD[z.id] || w <= 0.02) return;
    let v = 0;
    if (z.id === 'sea') v = Math.round(clamp((this.camY + this.H / 2 - ZSTART[zi]) / (z.len || 1), 0, 1) * 7);
    const es = z.id === 'fork' ? (race.eggSide || 1) : 0, M = this.moodSpr(z.id, es, v);
    if (!M || !M.pat || !M.pat.setTransform) return;
    const c = this.ctx, red = this.reduced;
    let al = (z.id === 'sea' ? 0.5 : 0.3) * w, f = 0;   // (the Sea's 3 value bands need more weight to read)
    if (z.id === 'launch') al *= red ? 0.75 : 0.55 + 0.45 * clamp(+this.beat || 0, 0, 1);
    if (z.id === 'rapids' && !red) f = (this.time * 36) % this.H;
    const X = M.m; X.a = VIEW_W / 4; X.d = this.H / 256; X.e = 0; X.f = f; M.pat.setTransform(X);
    c.globalAlpha = al; c.fillStyle = M.pat; this.fillTube(); c.globalAlpha = 1;
  }
  moodSpr(id, es, v = 0) {
    const MS = this.moodC || (this.moodC = new Map()), key = id + (es > 0 ? '+' : es < 0 ? '-' : '') + (v ? v : '');
    let M = MS.get(key);
    if (M) return M;
    M = { cv: null, pat: null, m: null };
    MS.set(key, M);
    if (typeof DOMMatrix === 'undefined') return M;
    const cv = mk(4, 256), g = cv.getContext('2d'), st = MOOD[id];
    const gr = g.createLinearGradient(0, 0, 0, 256);
    if (id === 'sea' && v > 0 && MOOD.seaB) {   // stop by stop toward the magenta coral (v / 7 of the way)
      const B = MOOD.seaB, u = v / 7;
      for (let i = 0; i < st.length; i++) { const A = st[i], Bq = B[i] || A; gr.addColorStop(A[0], css(lerpC(rgb(A[1]), rgb(Bq[1]), u, SCR), +(A[2] + (Bq[2] - A[2]) * u).toFixed(3))); }
    } else for (const [y, col, a] of st) gr.addColorStop(y, hexA(col, a));
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    if (id === 'fork') {   // the egg's branch: a pink glow down its two columns (the middle one softer)
      const g2 = g.createLinearGradient(0, 0, 0, 256);
      g2.addColorStop(0, hexA('#ff8be0', 0.15)); g2.addColorStop(0.5, hexA('#ff8be0', 0.7)); g2.addColorStop(1, hexA('#ff8be0', 0.35));
      g.fillStyle = g2; const x0 = es > 0 ? 2 : 0;
      g.globalAlpha = 1; g.fillRect(x0 + (es > 0 ? 1 : 0), 0, 1, 256); g.globalAlpha = 0.5; g.fillRect(x0 + (es > 0 ? 0 : 1), 0, 1, 256); g.globalAlpha = 1;
    }
    M.cv = cv; M.pat = this.ctx.createPattern(cv, 'repeat'); M.m = new DOMMatrix([1, 0, 0, 1, 0, 0]);
    return M;
  }
  // THE EGG as a sunrise: from the egg gate on she rises at parallax 0.15 behind everything in the tube, radius
  // 0.35 -> 1 of hers over the zone, with a halo breathing at 0.25 Hz; she hands over to the real egg (drawEgg) as it
  // comes into view. Sets this.sunX / sunY / sunR (null when off) for drawNear's light shafts.
  // The last 1500 px of the Rapids warm toward gold first (a wash over the tube, strongest at the top of the screen).
  drawSun(race, fillTube) {
    this.sunY = null;
    const c = this.ctx, p = race.p, zi = this.zi, id = ZONES[zi].id, nid = ZONES[zi + 1] ? ZONES[zi + 1].id : null;
    if (id === 'rapids' && nid === 'egg' && this.bt > 0.01) {
      if (!this.warmG || this.warmH !== this.H) {
        this.warmH = this.H; const g = c.createLinearGradient(0, 0, 0, this.H);
        g.addColorStop(0, 'rgba(255,196,96,0.34)'); g.addColorStop(0.6, 'rgba(255,170,90,0.12)'); g.addColorStop(1, 'rgba(255,150,90,0.04)');
        this.warmG = g;
      }
      c.globalAlpha = this.bt; c.fillStyle = this.warmG; fillTube(); c.globalAlpha = 1;
      this.dglow('#ffd77a', VIEW_W / 2, -40, 220, 0.45 * this.bt);
    }
    if (EGG_I_R < 0 || p.y < ZSTART[EGG_I_R]) return;
    const u = clamp((p.y - ZSTART[EGG_I_R]) / ZONES[EGG_I_R].len, 0, 1), R = 150 * (0.35 + 0.65 * u);
    const near = clamp(1 - (RACE_LEN - p.y) / 2500, 0, 1), al = 1 - clamp((near - 0.55) / 0.4, 0, 1);
    if (al <= 0.01 || race.drill) return;
    // (the horizon sits just under the HUD; the far camera drift at 0.15 lifts her 90 px over the zone as she grows)
    const hz = this.hudB() + 24, y = hz + R * 0.3 + (1 - u) * ZONES[EGG_I_R].len * 0.15 * 0.15, x = VIEW_W / 2;
    this.sunX = x; this.sunY = y; this.sunR = R;
    const hk = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 0.25 * TAU);
    this.dglow('#ffb86a', x, y, R * (2.6 + 0.3 * hk), al * (0.35 + 0.15 * hk));
    this.dglow('#fff3c0', x, y, R * 1.5, al * 0.3);
    c.globalAlpha = al; c.drawImage(this.sunSpr(), x - R, y - R, R * 2, R * 2); c.globalAlpha = 1;
  }
  // the sun disc, baked once: pearly cream core, gold, a rose rim
  sunSpr() {
    if (this._sun) return this._sun;
    const S = 256, cv = mk(S, S), g = cv.getContext('2d'), h = S / 2;
    const gr = g.createRadialGradient(h - 30, h - 34, 8, h, h, h - 2);
    gr.addColorStop(0, '#fffdf2'); gr.addColorStop(0.45, '#ffe4a0'); gr.addColorStop(0.85, '#f2b04a'); gr.addColorStop(1, '#e8806a');
    g.fillStyle = gr; g.beginPath(); g.arc(h, h, h - 2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,248,232,0.7)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(h - 44, h - 50, 26, 12, -0.7, 0, TAU); g.fill();
    this._sun = cv; return cv;
  }
  // the wall press's bulge amount: 1 while held, then a spring back over 0.18 s with a small inward overshoot
  // (reduced motion: a plain ease, no overshoot)
  wallK() {
    if (!(this.wallT > 0)) return 0;
    if (this.wallOn) return 1;
    const u = 1 - this.wallT / 0.18;
    return this.reduced ? (1 - u) * (1 - u) : Math.cos(u * Math.PI * 1.25) * (1 - u) * (1 - u * 0.4);
  }
  // Kevin pressed into the wall: a 90 px stretch of membrane bulges 7 px outward (two quadratic halves, so the
  // peak sits on his y) and springs back over 0.18 s
  // R.wallHit(side, strength): Kevin met a wall (side -1 left, 1 right; strength 0..1). For 0.18 s a glow streak runs
  // along that wall round his y (about 160 world px), the wall colour lifted 40%: alpha 0.5 for a slow lean, 0.85 and
  // 4 sparks off the wall past strength 0.6. Reduced motion keeps the streak, no sparks.
  wallHit(side, strength = 0.5) {
    const race = this.race, p = race && race.p;
    if (!p) return;
    const sd = side === 'left' ? -1 : side === 'right' ? 1 : (+side || 0) < 0 ? -1 : 1, st = clamp(+strength || 0, 0, 1);
    const W = this.wHit || (this.wHit = { s: 1, st: 0, y: 0, sd: 0, t: 0 });
    W.s = sd; W.st = st; W.y = p.y; W.sd = p.side || 0; W.t = 0.18;
    if (st > 0.6 && !this.reduced) {
      const wx = this.wallX(p.y, W.sd, sd), col = css(lerpC(this.wallC || WHITE, WHITE, 0.4, SCR));
      for (let i = 0; i < 4; i++) this.addP(1, wx - sd * 3, p.y + (Math.random() - 0.5) * 40, -sd * (120 + Math.random() * 140), (Math.random() - 0.5) * 160, 0.3, col, 2 + Math.random());
    }
  }
  drawWallHit(race, wall) {
    const W = this.wHit;
    if (!W || !(W.t > 0)) return;
    W.t -= this.fdt || 0;   // (real time: a hit-stop does not hold the streak)
    const k = clamp(W.t / 0.18, 0, 1), c = this.ctx, al = (W.st > 0.6 ? 0.85 : 0.5) * k;
    if (al <= 0.01) return;
    if (this.wHitK !== wallKey(wall)) { this.wHitK = wallKey(wall); this.wHitC = css(lerpC(wall, WHITE, 0.4, [0, 0, 0])); }
    c.strokeStyle = this.wHitC; c.lineCap = 'round'; c.lineJoin = 'round';
    // three nested strokes (160, 110, 60 px) so the streak is brightest at his y and fades along the wall
    for (let r = 0; r < 3; r++) {
      const half = 80 - r * 25;
      c.globalAlpha = al * (r === 0 ? 0.45 : 0.3); c.lineWidth = 4 + 2 * r * k; c.beginPath();
      for (let y = W.y - half, i = 0; y <= W.y + half + 0.1; y += 10, i++) { const x = this.wallX(y, W.sd, W.s) - W.s * 1.5, sy = this.sy(y); i ? c.lineTo(x, sy) : c.moveTo(x, sy); }
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  drawDent(wall) {
    if (!(this.wallT > 0) || !this.wallNear) return;
    const c = this.ctx, s = this.wallS, sd = this.wallSd, y = this.sy(this.wallY), K = this.wallK();
    if (y < -50 || y > this.H + 50 || Math.abs(K) < 0.01) return;
    const H = 45, x0 = this.wallX(this.wallY + H, sd, s), x1 = this.wallX(this.wallY - H, sd, s), xm = this.wallX(this.wallY, sd, s), bul = 7 * K;
    const xa = this.wallX(this.wallY + H / 2, sd, s), xb = this.wallX(this.wallY - H / 2, sd, s), xp = xm + s * bul;
    const curve = (o) => { c.moveTo(x0 - s * o, y - H); c.quadraticCurveTo(xa + s * bul * 0.9 - s * o, y - H / 2, xp - s * o, y); c.quadraticCurveTo(xb + s * bul * 0.9 - s * o, y + H / 2, x1 - s * o, y + H); };
    // the tube floor fills the gap the bulge opens (an inward overshoot is covered by the stroke alone)
    c.beginPath(); curve(0); c.lineTo(x1 - s * 3, y + H); c.lineTo(x0 - s * 3, y - H); c.closePath();
    c.fillStyle = this.tubeG; c.fill();
    c.strokeStyle = cssQ(wall); c.lineWidth = 2.6; c.lineCap = 'round';
    c.beginPath(); curve(0); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.2; c.beginPath(); curve(2); c.stroke();
  }
  // the inner edge of one wall (s = -1 left, 1 right) at world y, wobbling exactly like drawTube's outline
  // (interpolated from this frame's wall cache when it covers y, computed directly otherwise)
  wallX(y, side, s) {
    const k = side + 1, B = this.wc[k];
    if (B && this.wcF[k] === this.frame) {
      const u = (y - this.wcY0) / 11;
      if (u >= 0 && u < this.wcN - 1) {
        const i = u | 0, f = u - i, j = i * 3;
        const cx = B[j] + (B[j + 3] - B[j]) * f, h = B[j + 1] + (B[j + 4] - B[j + 1]) * f, wob = B[j + 2] + (B[j + 5] - B[j + 2]) * f;
        return cx + s * (h + wob);
      }
    }
    const ch = chan(y, side), t = this.time;
    const wob = Math.sin(y / 60 + t * 2) * 3 + Math.sin(y / 23 - t * 3) * 1.2;
    return ch.c + s * (ch.h + wob);
  }
  // midground set pieces at parallax 0.45, one every ~700 layer units (inside the tube clip, under the floaters):
  // acid crystal stalagmites and goo mucus curtains growing off the walls, Sea ceiling folds, Rapids rocks with wakes
  drawPieces() {
    const zA = ZONES[this.zi], zB = ZONES[this.zi + 1], bt = zB ? this.bt : 0;
    this.pieceLayer(zA.id, 1 - bt);
    if (zB) this.pieceLayer(zB.id, bt);
  }
  pieceLayer(id, a) {
    if (a <= 0.02 || !PIECE_IDS.has(id)) return;
    const c = this.ctx, race = this.race, t = this.time, SP = 420, base = this.camY * 0.45, m = this.wm;
    const side0 = this.camY > FORK_Y0 && race ? (race.p.side || race.eggSide || 0) : 0;
    const j0 = Math.floor((base - 300) / SP), j1 = Math.floor((base + this.H + 300) / SP);
    for (let j = j0; j <= j1; j++) {
      const v = ((j % 3) + 3) % 3, pc = this.pieceSpr(id, v);
      const y = this.H - (j * SP + h1(j * 1.7 + id.length) * 240 - base);
      if (y < -pc.h - 40 || y > this.H + pc.h + 40) continue;
      // decoration must never read as a hazard: the acid shards are soft lime glass at 0.45 to 0.55 (ink and hatch
      // belong to the real acid alone); the launch valves and the Fork's polyps 0.6 to 0.7, the Goo's curtains 0.55 to
      // 0.65, the rest sit back at 0.38 to 0.5
      const s = j % 2 ? 1 : -1, hj = h1(j * 4.1 + 2);
      const al = a * (id === 'acid' ? 0.45 + 0.1 * hj : id === 'launch' || id === 'fork' ? 0.6 + 0.1 * hj : id === 'goo' ? 0.55 + 0.1 * hj : 0.38 + 0.12 * hj);
      c.globalAlpha = al;
      if (id === 'rapids' || id === 'egg') {      // mid-stream (rapids: wake trailing down the screen; egg: corona clusters turning slowly)
        const x = VIEW_W * (0.2 + 0.6 * h1(j * 3.3 + 1));
        if (id === 'rapids') { setXf(c, m, x, y, 0, 0.8, 0.8); c.drawImage(pc.cv, -pc.w / 2, -60, pc.w, pc.h); }
        else { setXf(c, m, x, y, this.reduced ? j : t * 0.05 + j, 0.85, 0.85); c.drawImage(pc.cv, -pc.w / 2, -pc.h / 2, pc.w, pc.h); }
        continue;
      }
      const wx = clamp(this.wallX(this.camY + this.H - y, side0, s), 0, VIEW_W);
      // the sprite's base (acid: bottom edge; goo and Sea: top edge) sits on the wall and grows inward
      const sway = this.reduced ? 0 : Math.sin(t * 0.6 + j) * 0.03;
      const r = id === 'acid' ? (s < 0 ? Math.PI / 2 : -Math.PI / 2) : (s < 0 ? -Math.PI / 2 : Math.PI / 2);
      // the launch valves squeeze 15% on the beat
      const sq = id === 'launch' && !this.reduced ? 1 - 0.15 * clamp(+this.beat || 0, 0, 1) : 1;
      // goo at 0.75 (its drapes cap at 110, so a curtain covers at most about 40% of the tube), each one sagging slowly
      const sc = id === 'sea' ? 1.05 : id === 'fork' ? 1.45 : id === 'acid' ? 0.55 : 0.75;
      // (the Goo's curtains jiggle like jelly: 1 + 0.04 sin(2.2 t + j) across, the opposite along; still when reduced)
      const gx = id === 'goo' && !this.reduced ? 1 + 0.04 * Math.sin(t * 2.2 + j) : 1, gw = 2 - gx;
      // the Fork's signpost polyps lean up the tube (mirrored on the right wall), and point back down in the wrong tube
      const fl = id === 'fork' ? (s < 0 ? 1 : -1) * (side0 && race && side0 !== race.eggSide ? -1 : 1) : 1;
      setXf(c, m, wx - s * 2, y, r + sway, sc * sq * fl * gx, sc * (2 - sq) * gw);
      if (id === 'acid') c.drawImage(pc.cv, -pc.w / 2, -pc.h, pc.w, pc.h); else c.drawImage(pc.cv, -pc.w / 2, 0, pc.w, pc.h);
    }
    c.setTransform(m); c.globalAlpha = 1;
  }
  // the Fork reads as a Y: a far silhouette of the split slides in at parallax 0.45 from FORK_Y0 - 1500 and
  // hands over to the real divider (a dark wedge with a glowing rim); a pink scent river glows up the right tube
  drawForkSplit(race, deep) {
    const p = race.p, c = this.ctx, t = this.time, es = race.eggSide || 1, H = this.H;
    if (p.y < FORK_Y0 - 1500 || this.camY > FORK_END + 300) return;
    const nose = race.muts && race.muts.nose ? 1 : 0, pul = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3);
    const FZ = ZONES[FORK_I_R], dark = this.forkDark || (this.forkDark = css(lerpC(rgb(FZ.col[0]), [0, 0, 0], 0.6), 0.95));
    const rim = FZ.wall;   // the divider's rim and veins in the Fork's own wall colour (pink is the scent's)
    // 1) the far silhouette, until the real apex is half way down the screen
    const ysr = this.sy(FORK_Y0), camF = FORK_Y0 - H * 0.5, L = H * 0.5 + 0.45 * camF, ys = H - (L - this.camY * 0.45);
    const fin = clamp((p.y - (FORK_Y0 - 1500)) / 400, 0, 1), fout = clamp(1 - ysr / (H * 0.5), 0, 1);
    const pa = fin * fout * 0.8;
    if (pa > 0.01 && ys > -40 && ys < H + 40) {
      const cx = centre(FORK_Y0), top = Math.min(-40, ys - 400), wv = forkWv;
      c.globalAlpha = pa; c.fillStyle = dark; c.beginPath(); c.moveTo(cx, ys);
      for (let yy = ys - 20; yy >= top; yy -= 40) c.lineTo(cx + wv(ys - yy), yy);
      for (let yy = top; yy <= ys - 20; yy += 40) c.lineTo(cx - wv(ys - yy), yy);
      c.closePath(); c.fill();
      c.lineJoin = 'round'; c.strokeStyle = rim; c.lineWidth = 6; c.globalAlpha = pa * 0.25; c.stroke();
      c.lineWidth = 2; c.globalAlpha = pa * 0.8; c.stroke();
      // the scent river: pink glows up the egg's branch
      for (let k = 0; k < 6; k++) {
        const dh = 40 + k * 70, yy = ys - dh;
        if (yy < -60) break;
        this.dglow('#ff8be0', cx + es * (wv(dh) + 60 + dh * 0.12), yy, 64, pa * (0.5 + 0.3 * nose) * (0.6 + 0.4 * Math.sin(t * 3 - k * 0.8)));
      }
      c.globalAlpha = 1;
    }
    // 2) the real divider between the tubes, from the apex up to where the wrong tube is capped
    if (this.sides(race).length < 2) return;
    const y0 = Math.max(FORK_Y0, this.camY - 40), y1 = Math.min(FORK_END + 200, this.camY + H + 40);
    if (y1 <= y0) return;
    const XS = this._dvL || (this._dvL = nbuf()), XR = this._dvR || (this._dvR = nbuf()), YV = this._dvY || (this._dvY = nbuf());
    XS.n = 0; XR.n = 0; YV.n = 0;
    for (let y = y0; y <= y1 + 21; y += 22) {
      const yy = Math.min(y, y1), l = this.wallX(yy, -1, 1), r = this.wallX(yy, 1, -1);
      if (r - l < 1) { if (XS.n) break; continue; }
      nb1(XS, l); nb1(XR, r); nb1(YV, this.sy(yy));
      if (yy >= y1) break;
    }
    const xs = XS.a, xr = XR.a, yv = YV.a, dn = XS.n;
    if (dn >= 2) {
      this.forkDivPath(c, xs, xr, yv, dn);
      // a cached -1..1 gradient (dark at the edges, amethyst in the middle), stretched over the widest row:
      // the path is already built, so the transform set here only maps the gradient
      let lo = xs[0], hi = xr[0]; for (let i = 1; i < dn; i++) { if (xs[i] < lo) lo = xs[i]; if (xr[i] > hi) hi = xr[i]; }
      if (!this.forkG) {
        const dk = lerpC(rgb(ZONES[FORK_I_R].col[0]), [0, 0, 0], 0.6), g = c.createLinearGradient(-1, 0, 1, 0);
        g.addColorStop(0, css(dk, 0.95)); g.addColorStop(0.5, css(lerpC(dk, rgb(FZ.col[1]), 0.5), 0.95)); g.addColorStop(1, css(dk, 0.95));
        this.forkG = g;
      }
      const m = this.wm, hw = Math.max(1, (hi - lo) / 2);
      setXf(c, m, (lo + hi) / 2, 0, 0, hw, 1); c.fillStyle = this.forkG; c.fill(); c.setTransform(m);
      // faint veins wandering up the divider
      c.strokeStyle = rim; c.lineWidth = 2; c.globalAlpha = 0.18; c.lineCap = 'round'; c.beginPath();
      for (let k = 0; k < 4; k++) {
        const u = -0.6 + 0.4 * k;
        for (let i = 0; i < dn; i++) {
          const mid = (xs[i] + xr[i]) / 2, half = (xr[i] - xs[i]) / 2, wy = this.camY + H - yv[i];
          const vx = mid + u * half * 0.8 + (this.reduced ? 0 : Math.sin(wy / 55 + t * 0.8 + k * 1.9) * Math.min(5, half * 0.15));
          i ? c.lineTo(vx, yv[i]) : c.moveTo(vx, yv[i]);
        }
      }
      c.stroke(); c.globalAlpha = 1;
      this.forkDivPath(c, xs, xr, yv, dn); c.lineJoin = 'round'; c.strokeStyle = rim; c.lineWidth = 7; c.globalAlpha = 0.18 + 0.1 * pul; c.stroke();
      c.lineWidth = 2; c.globalAlpha = 0.75; c.stroke(); c.globalAlpha = 1;
      // a signpost every ~900 units (honest only with a good nose), inside the tube its arrow points at (clamped
      // between that tube's walls, 0.85x type when it would not fit), queued for the overlay pass after the walls
      // and the divider (flushForkSigns)
      const FQ = this.fsQ || (this.fsQ = []); this.fsN = 0;
      for (let wy = Math.ceil((y0 + 300) / 900) * 900; wy <= y1; wy += 900) {
        const l = this.wallX(wy, -1, 1), r = this.wallX(wy, 1, -1);
        if (r - l < 60) continue;
        const j = Math.round(wy / 900), txt = nose ? (es > 0 ? 'EGG THIS WAY →' : '← EGG THIS WAY') : j % 2 ? '??? →' : '← MAYBE';
        const sd = nose ? (es > 0 ? 1 : -1) : j % 2 ? 1 : -1, hl = this.wallX(wy, sd, -1), hr = this.wallX(wy, sd, 1);
        let fs = 15, w = this.text(txt, '#ff9be0', fs, 'sign').w;
        if (w > hr - hl - 4) { fs = Math.round(15 * 0.85); w = this.text(txt, '#ff9be0', fs, 'sign').w; }
        const x = w <= hr - hl ? clamp((hl + hr) / 2, hl + w / 2, hr - w / 2) : (hl + hr) / 2;
        const q = FQ[this.fsN] || (FQ[this.fsN] = { x: 0, y: 0, txt: '', fs: 15 });
        q.x = x; q.y = this.sy(wy); q.txt = txt; q.fs = fs; this.fsN++;
        if (this.fsN >= 8) break;
      }
    }
    // the scent river in the egg's tube
    const st = 90, ry0 = Math.ceil(y0 / st) * st;
    for (let y = ry0; y <= Math.min(FORK_END + 600, this.camY + H + 60); y += st) {
      const ch = chan(y, es), k = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3 - y / 140);
      this.dglow('#ff8be0', ch.c, this.sy(y), ch.h * 0.9, Math.min(1, 2 * (0.12 + 0.08 * k) * (1 + 0.5 * nose)));
    }
    // the tell, readable at a glance: a warm wash pulsing in the egg's tube, a cold dim wash and a greyed wall in the
    // wrong one (from the apex up to where each tube shows)
    {
      const tw0 = Math.max(FORK_Y0, this.camY - 40), stp = this.lite ? 44 : 22, warmK = this.reduced ? 0.6 : 0.6 + 0.4 * Math.sin(t * 2.6);
      const SD = this.sides(race);
      for (let si = 0; si < SD.length; si++) {
        const sd = SD[si];
        if (!sd || (p.side && sd !== p.side && this.camY > FORK_END)) continue;   // (the wrong tube, once Kevin is past the split)
        const egg = sd === es, top = Math.min(this.camY + H + 40, egg ? FORK_END + 600 : sd === p.side ? DEAD_Y : FORK_END + 200);
        if (top <= tw0) continue;
        const PB = this._fwL || (this._fwL = nbuf()); PB.n = 0;
        for (let y = tw0; ; y += stp) { const yy = Math.min(y, top); nb3(PB, this.wallX(yy, sd, -1), this.wallX(yy, sd, 1), this.sy(yy)); if (yy >= top) break; }
        const PL = PB.a, pn = PB.n;
        c.beginPath(); c.moveTo(PL[0], PL[2]);
        for (let i = 3; i < pn; i += 3) c.lineTo(PL[i], PL[i + 2]);
        for (let i = pn - 3; i >= 0; i -= 3) c.lineTo(PL[i + 1], PL[i + 2]);
        c.closePath();
        if (egg) {   // a pink haze at 0.25 (breathing a little), warmer with a good nose
          c.fillStyle = '#ff8be0'; c.globalAlpha = (race.muts && race.muts.nose ? 0.3 : 0.25) * (0.85 + 0.15 * warmK); c.fill(); this.eggTubeOn = this.frame;
        } else {
          // graded 35% toward a cold '#2a2f3c' and then 25% darker, in ONE fill: 0.4875 x the floor + 0.2625 x the grey
          // is 'rgb(22,24,31)' at 0.5125
          c.fillStyle = 'rgb(22,24,31)'; c.globalAlpha = 0.5125; c.fill();
          const G = this._fwG || (this._fwG = nbuf()); G.n = 0; nbFit(G, pn).set(PL.subarray(0, pn)); G.n = pn;   // (greyed after the walls)
          this.fwGF = this.frame;
        }
        c.globalAlpha = 1;
      }
    }
    // 10 to 14 heart motes rising up the egg's branch (warm pink, batched in one fill; still for reduced motion)
    if (this.eggTubeOn === this.frame) {
      const nh = this.lite ? 10 : 14, span = 1600, red = this.reduced;
      c.fillStyle = '#ffb0d8'; c.globalAlpha = 0.55; c.beginPath();
      for (let i = 0; i < nh; i++) {
        const wy = FORK_Y0 + 40 + ((h1(i * 2.3 + 7) * span + (red ? 0 : t * (34 + 20 * h1(i + 1.1)))) % span);
        const sy = this.sy(wy);
        if (sy < -12 || sy > H + 12) continue;
        const ch = chan(wy, es), hx = ch.c + (h1(i * 5.1 + 2) - 0.5) * ch.h * 1.3 + (red ? 0 : Math.sin(t * 1.4 + i * 1.7) * 6);
        heartP(c, hx, sy, 2.6 + 2.2 * h1(i + 0.6));
      }
      c.fill(); c.globalAlpha = 1;
    }
    // the egg branch's mouth: a '#ff8be0' gradient from the split 120 px up its tube (one cached -1..0 gradient)
    // and, across the wrong branch's mouth, a crooked strip of hazard tape (no glow, no sparkles: it is a dead end)
    if (this.sides(race).length > 1) {
      const sa = this.sy(FORK_Y0);
      if (sa > -40 && sa - 120 < H + 40) {
        if (!this.forkMouthG) { const g = c.createLinearGradient(0, 0, 0, -1); g.addColorStop(0, 'rgba(255,139,224,0.55)'); g.addColorStop(1, 'rgba(255,139,224,0)'); this.forkMouthG = g; }
        c.beginPath();
        for (let k = 0; k <= 4; k++) { const wy = FORK_Y0 + k * 30; k ? c.lineTo(this.wallX(wy, es, -1), this.sy(wy)) : c.moveTo(this.wallX(wy, es, -1), this.sy(wy)); }
        for (let k = 4; k >= 0; k--) { const wy = FORK_Y0 + k * 30; c.lineTo(this.wallX(wy, es, 1), this.sy(wy)); }
        c.closePath();
        const m = this.wm; setXf(c, m, 0, sa, 0, 1, 120); c.fillStyle = this.forkMouthG; c.globalAlpha = 1; c.fill(); c.setTransform(m);
      }
      if (!(p.side && p.side === es && this.camY > FORK_END)) this.forkTape(-es, FORK_Y0 + 170);
    }
  }
  // a crooked strip of hazard tape across tube sd's mouth at world y wy: 11 px tall, sagging and tilted 0.1 rad,
  // yellow with black stripes (3 calls: the band, the stripes, the ink outline)
  forkTape(sd, wy) {
    const c = this.ctx, xl = this.wallX(wy, sd, -1) + 2, xr = this.wallX(wy, sd, 1) - 2, sy = this.sy(wy);
    if (sy < -40 || sy > this.H + 40 || !(xr - xl > 20)) return;
    const len = xr - xl, tilt = 0.1 * sd, sag = this.reduced ? 6 : 6 + Math.sin(this.time * 1.3) * 1.5, hh = 5.5;
    // a point on the tape's centre line at u (0..1): x = xl + len u, y = sy + (u - 0.5) len tilt + 4 sag u (1 - u)
    const lt = len * tilt, s4 = sag * 4;
    c.beginPath();
    for (let i = 0; i <= 8; i++) { const u = i / 8, x = xl + len * u, y = sy + (u - 0.5) * lt + s4 * u * (1 - u) - hh; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    for (let i = 8; i >= 0; i--) { const u = i / 8; c.lineTo(xl + len * u, sy + (u - 0.5) * lt + s4 * u * (1 - u) + hh); }
    c.closePath(); c.globalAlpha = 0.95; c.fillStyle = '#ffd75c'; c.fill();
    c.globalAlpha = 0.9; c.strokeStyle = HZ_INK; c.lineWidth = 1.5; c.stroke();
    c.beginPath();
    for (let d = 0; d < len - 4; d += 14) {   // slanted stripes, 7 px wide
      const u0 = d / len, u1 = Math.min(1, (d + 7) / len), u2 = Math.min(1, (d + 4) / len), u3 = Math.min(1, (d + 11) / len);
      c.moveTo(xl + len * u0, sy + (u0 - 0.5) * lt + s4 * u0 * (1 - u0) + hh); c.lineTo(xl + len * u1, sy + (u1 - 0.5) * lt + s4 * u1 * (1 - u1) + hh);
      c.lineTo(xl + len * u3, sy + (u3 - 0.5) * lt + s4 * u3 * (1 - u3) - hh); c.lineTo(xl + len * u2, sy + (u2 - 0.5) * lt + s4 * u2 * (1 - u2) - hh); c.closePath();
    }
    c.fillStyle = '#1a0616'; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
  }
  // drawForkSplit's queued signposts (this.fsQ, fsN of them this frame), drawn once the walls are down
  flushForkSigns() {
    const n = this.fsN | 0; this.fsN = 0;
    for (let i = 0; i < n; i++) { const q = this.fsQ[i]; this.sign(q.x, q.y, q.txt, '#ff9be0', 'sign', q.fs); }
  }
  // the divider's outline (apex, left edge up, right edge down), built into the context's current path
  forkDivPath(c, xs, xr, yv, n) {
    c.beginPath(); c.moveTo((xs[0] + xr[0]) / 2, yv[0] + 6);
    for (let i = 0; i < n; i++) c.lineTo(xs[i], yv[i]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(xr[i], yv[i]);
    c.closePath();
  }
  // PICK A TUBE: pinned in screen space at padTop + 140 while its spot in the world is on screen (never on the bar).
  // Drawn after every hazard and warning, on an opaque plate (cream text, pink rim), and never under 0.85 alpha
  // while its spot is in the middle 70% of the screen
  drawForkSign() {
    const fy = this.sy(FORK_Y0 - 500);
    if (!(fy > -60 && fy < this.H + 60)) return;
    let al = clamp(Math.min((fy + 60) / 120, (this.H + 60 - fy) / 120), 0, 1);
    if (fy >= this.H * 0.15 && fy <= this.H * 0.85) al = 1;
    // while the choice is live (Kevin has no tube yet) the plate stays fully opaque: no fade, no 0.85 floor
    const p = this.race && this.race.p;
    if (p && !p.side) al = 1;
    const c = this.ctx; c.globalAlpha = al;
    this.sign(VIEW_W / 2, Math.max((this.padW || 0) + 140, this.hudB() + 12 * this.cssK + 15), '← PICK A TUBE →', '#ff9be0', 'signO', Math.max(18, this.fpx(18)));
    c.globalAlpha = 1;
  }
  // the egg duel's tell, readable on a phone: a soft vertical wedge from the rival's screen edge to 45% of the width,
  // in its colour at 0.28, pulsing at 6 Hz (steady for reduced motion), with a big chevron at mid-height pointing at
  // it. It lasts the 0.8 s tell window; a hit or a counter fades it out over 0.15 s.
  drawTellWedge() {
    const W = this.wedge;
    if (!W) return;
    const race = this.race, T = this.time, age = T - W.t0;
    let k = W.end != null ? 1 - (T - W.end) / 0.15 : age < 0.8 ? 1 : 1 - (age - 0.8) / 0.15;
    k = Math.min(k, 0.25 + age / 0.08);   // a quick fade in
    if (!race || race.over || k <= 0) { this.wedge = null; return; }
    const c = this.ctx, red = this.reduced, s = W.side, x0 = s < 0 ? 0 : VIEW_W, x1 = s < 0 ? VIEW_W * 0.45 : VIEW_W * 0.55;
    const pul = red ? 1 : 0.75 + 0.25 * Math.sin(age * 6 * TAU), al = clamp(k, 0, 1) * pul, col = colOf(W.col);
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, css(col, 0.28)); g.addColorStop(1, css(col, 0));
    c.globalAlpha = al; c.fillStyle = g; c.fillRect(Math.min(x0, x1), -20, Math.abs(x1 - x0), this.H + 40);
    // the chevron: 40 px, pointing out at the rival's edge
    const cx = s < 0 ? VIEW_W * 0.12 : VIEW_W * 0.88, cy = this.H * 0.5, R = 20 * (red ? 1 : 1 + 0.08 * Math.sin(age * 6 * TAU));
    c.beginPath(); c.moveTo(cx + s * R, cy); c.lineTo(cx - s * R * 0.4, cy - R); c.lineTo(cx - s * R * 0.4 + s * R * 0.55, cy); c.lineTo(cx - s * R * 0.4, cy + R); c.closePath();
    c.lineJoin = 'round'; c.globalAlpha = al * 0.9; c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke(); c.fillStyle = W.col; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.6; c.stroke();
    c.globalAlpha = 1;
  }
  // where the top HUD ends (logical): R.hudBottom when ui sets it, else 110. A landscape HUD is a side gutter
  // (its --hudB is the whole height): then only padTop counts.
  hudB() {
    let v = this.hudBottom == null ? 110 : +this.hudBottom;
    if (!Number.isFinite(v)) v = 110;
    if (v > this.H * 0.6 || this.H / VIEW_W < 1.2) v = this.padW || 0;
    return Math.max(0, v);
  }
  // the HUD fade: pickups, the crowd and particles passing under the top HUD ease (smoothstep) from 1.0 (hudB + 30)
  // down to 0.3 (hudB - 20), so the HUD band stays legible; bosses, hostiles and threat chevrons never fade. this.hfB
  // is set per pass (null: no fade, the attract demo)
  hudFade(sy) {
    const hb = this.hfB;
    if (hb == null) return 1;
    // 0.08 at the HUD's edge and above, eased (smoothstep) to 1 by 40 px under it
    const u = (sy - hb) / 40;
    if (u >= 1) return 1;
    if (u <= 0) return 0.08;
    return 0.08 + 0.92 * u * u * (3 - 2 * u);
  }
  // the HUD band for pickups and world objects (drawEnts): a linear ramp from 0.25 at the HUD's edge to 1 at 40 px under
  // it (0.08 once 20 px up under the HUD), so a fruit by the mutation chips never reads as one more chip; hbGlow says
  // whether a glow or halo may draw (never inside the band)
  hudBandA(sy) {
    const hb = this.hfB;
    if (hb == null) return 1;
    const u = (sy - hb) / 40;
    if (u >= 1) return 1;
    if (u >= 0) return 0.25 + 0.75 * u;
    return u <= -0.5 ? 0.08 : 0.25 + 0.34 * u;
  }
  hbGlow(sy) { return this.hfB == null || sy >= this.hfB + 40; }
  // a box (top y, height h, centre x, width w) moved clear of the HUD (12 CSS px gap) and any banner; null if it cannot fit
  clearTop(top, h, x, w) {
    top = Math.max(top, this.hudB() + 12 * this.cssK);
    const bb = this.bannerBox;
    if (bb && Number.isFinite(bb.y0) && Number.isFinite(bb.y1) && top < bb.y1 && top + h > bb.y0) top = bb.y1 + 4;
    if (top + h > this.H - (this.padB || 0) - 4) return null;
    if (x != null) for (let i = 0; i < this.signBoxes.length; i += 4) {
      const B = this.signBoxes;
      if (Math.abs(B[i] - x) < (B[i + 2] + w) / 2 && top < B[i + 1] + B[i + 3] && top + h > B[i + 1]) return null;
    }
    return top;
  }
  // where one side's wall dressing stops (world y): the far tube past the Fork ends at FORK_END + 200; -1e9 skips
  // that side outright once Kevin has picked his tube and the camera is past FORK_END
  wsEnd(side, ps, y1) {
    if (!(side && ps && side !== ps)) return y1;
    return this.camY > FORK_END ? -1e9 : Math.min(y1, FORK_END + 200);
  }
  // wsLaunch: the launch branch of drawWallStyle (its own method, so it optimizes on its own and inlines its helpers)
  wsLaunch(race, a, wall, c, t, y0, y1, ps, sides, ns, red) {
    const bk = red ? 0 : clamp(+this.beat || 0, 0, 1), len = 9 + 3 * bk, ys = Math.ceil(y0 / 36) * 36;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 0) { c.strokeStyle = 'rgba(150,20,70,0.55)'; c.lineWidth = 4; } else { c.strokeStyle = 'rgba(255,190,215,0.5)'; c.lineWidth = 1.4; }
      c.beginPath();
      for (let si = 0; si < ns; si++) {
        const side = sides[si], ye = this.wsEnd(side, ps, y1);
        for (let y = ys; y <= ye; y += 36) {
          const sy = this.sy(y);
          for (let k = 0; k < 2; k++) {
            const s = SGN[k], x = this.wallX(y, side, s);
            if (pass === 0) { c.moveTo(x, sy - 3); c.quadraticCurveTo(x - s * len * 0.6, sy - 1, x - s * len, sy + 3); }
            else { c.moveTo(x - s * 1, sy - 5); c.quadraticCurveTo(x - s * len * 0.6, sy - 3, x - s * (len - 1), sy + 1); }
          }
        }
      }
      c.stroke();
    }
  }
  // wsAcid: the acid branch of drawWallStyle (its own method, so it optimizes on its own and inlines its helpers)
  wsAcid(race, a, wall, c, t, y0, y1, ps, sides, ns, red) {
    // a corroded lime lip along each wall: 6 to 8 px of '#b6ff5c' at 0.8 with drip teeth hanging into the lane
    // (one fill a side), its underside traced in '#3d7a3a' (one stroke a side), so the wall reads as more than a hairline
    {
      const ga = c.globalAlpha, yl0 = Math.floor(y0 / 13) * 13;
      c.lineWidth = 2;
      for (let si = 0; si < ns; si++) {
        const side = sides[si], ye = this.wsEnd(side, ps, y1);
        if (ye < yl0) continue;
        for (let k = 0; k < 2; k++) {
          const s = SGN[k];
          c.beginPath();
          for (let y = yl0; y <= ye + 13; y += 13) { const sy = this.sy(y), x = this.wallX(y, side, s); y === yl0 ? c.moveTo(x, sy) : c.lineTo(x, sy); }
          for (let y = Math.floor((ye + 13 - yl0) / 13) * 13 + yl0; y >= yl0; y -= 13) {
            const hv = h1(y * 0.29 + s * 1.7), d = 6 + 2 * hv + ((y / 13) % 3 === 0 && hv > 0.3 ? 4 + 5 * hv : 0);   // a drip tooth every 3rd step
            c.lineTo(this.wallX(y, side, s) - s * d, this.sy(y));
          }
          c.closePath(); c.globalAlpha = ga * 0.8; c.fillStyle = '#b6ff5c'; c.fill();
          c.beginPath();
          for (let y = yl0; y <= ye + 13; y += 13) {
            const hv = h1(y * 0.29 + s * 1.7), d = 6 + 2 * hv + ((y / 13) % 3 === 0 && hv > 0.3 ? 4 + 5 * hv : 0), x = this.wallX(y, side, s) - s * d, sy = this.sy(y);
            y === yl0 ? c.moveTo(x, sy) : c.lineTo(x, sy);
          }
          c.globalAlpha = ga * 0.9; c.strokeStyle = '#3d7a3a'; c.stroke();
        }
      }
      c.globalAlpha = ga;
    }
    const ys = Math.ceil(y0 / 26) * 26;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 0) c.fillStyle = 'rgba(8,24,0,0.5)'; else { c.strokeStyle = 'rgba(200,255,120,0.35)'; c.lineWidth = 1; }
      c.beginPath();
      for (let si = 0; si < ns; si++) {
        const side = sides[si], ye = this.wsEnd(side, ps, y1);
        for (let y = ys; y <= ye; y += 26) {
          const sy = this.sy(y);
          for (let k = 0; k < 2; k++) {
            const s = SGN[k], hv = h1(y * 0.37 + s * 3.3);
            if (hv < 0.35) continue;
            const r = 1.6 + hv * 2.6, x = this.wallX(y, side, s) - s * (4 + hv * 3);
            if (pass === 0) { c.moveTo(x + r, sy); c.ellipse(x, sy, r, r * 0.7, 0, 0, TAU); }
            else { c.moveTo(x - r, sy + 0.8); c.ellipse(x, sy + 0.8, r, r * 0.7, 0, Math.PI, TAU); }
          }
        }
      }
      if (pass === 0) c.fill(); else c.stroke();
    }
    const n = 4, side0 = ns > 1 ? (ps || 1) : sides[0];
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1, k = ((t * 0.18 + i / n + h1(i) * 0.2) % 1), sy = -20 + k * (this.H + 40);
      const wy = this.camY + this.H - sy, x = this.wallX(wy, side0, s) - s * 5, al = Math.sin(k * Math.PI);
      c.globalAlpha = a * al * 0.9;
      c.strokeStyle = 'rgba(157,255,60,0.5)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, sy - 26); c.lineTo(x, sy - 5); c.stroke();
      c.fillStyle = '#9dff3c'; c.beginPath(); c.moveTo(x, sy - 7); c.quadraticCurveTo(x + 3.4, sy, x, sy + 3.2); c.quadraticCurveTo(x - 3.4, sy, x, sy - 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(x - 1.2, sy - 2, 1, 1.6);
    }
  }
  // wsGoo: the goo branch of drawWallStyle (its own method, so it optimizes on its own and inlines its helpers)
  wsGoo(race, a, wall, c, t, y0, y1, ps, sides, ns, red) {
    // wet: the rim is a screen-height gradient in the wall colour (0.55 at the top, 0.30 at the bottom), and every
    // lump (one each 107 px, the crest of its sin(y / 17)) carries a white specular crescent, jiggling like jelly
    if (this.wsGooK !== wallKey(wall) || this.wsGooH !== this.H) {
      this.wsGooK = wallKey(wall); this.wsGooH = this.H; this.wsGooB = css(lerpC(wall, WHITE, 0.5, SCR), 0.5); this.wsGooC = css(lerpC(wall, WHITE, 0.5, SCR), 0.6);
      const gg = c.createLinearGradient(0, 0, 0, this.H); gg.addColorStop(0, css(wall, 0.55)); gg.addColorStop(1, css(wall, 0.3)); this.wsGooA = gg;
    }
    // a 6 px rim over a 3 px caramel-brown '#6a3a18' line at 0.6 on each side (a 12 px under-stroke), so the cream
    // rim reads on the vanilla tube
    const ga0 = c.globalAlpha;
    for (let si = 0; si < ns; si++) {
      const side = sides[si], ye = this.wsEnd(side, ps, y1);
      for (let k = 0; k < 2; k++) {
        const s = SGN[k]; let first = true;
        c.beginPath();
        for (let y = Math.floor(y0 / 11) * 11; y <= ye; y += 11) { const x = this.wallX(y, side, s) - s * (5 + Math.sin(y / 17) * 6), sy = this.sy(y); if (first) { c.moveTo(x, sy); first = false; } else c.lineTo(x, sy); }
        if (!first) { c.globalAlpha = ga0 * 0.6; c.strokeStyle = '#6a3a18'; c.lineWidth = 12; c.stroke(); c.globalAlpha = ga0; c.strokeStyle = this.wsGooA; c.lineWidth = 6; c.stroke(); }
      }
    }
    // long wet specular streaks down both walls: 2 px white at 0.45, 140 of every 230 world px, 17 px inside the wall
    c.globalAlpha = ga0 * 0.45; c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath();
    for (let si = 0; si < ns; si++) {
      const side = sides[si], ye = this.wsEnd(side, ps, y1);
      for (let k = 0; k < 2; k++) {
        const s = SGN[k];
        for (let ya = Math.floor(y0 / 230) * 230 + (k ? 115 : 0); ya <= ye; ya += 230) {
          for (let j = 0; j <= 7; j++) { const y = ya + j * 20, x = this.wallX(y, side, s) - s * 17, sy = this.sy(y); if (j) c.lineTo(x, sy); else c.moveTo(x, sy); }
        }
      }
    }
    c.stroke(); c.globalAlpha = ga0;
    {   // the lumps' gloss (crests of sin(y / 17) sit at y = 17 (pi / 2 + 2 pi k))
      const P = 17 * TAU, ph0 = 17 * Math.PI / 2, ga = c.globalAlpha;
      for (let si = 0; si < ns; si++) {
        const side = sides[si], ye = this.wsEnd(side, ps, y1);
        for (let y = Math.ceil((y0 - ph0) / P) * P + ph0, i = 0; y <= ye; y += P, i++) {
          const sy = this.sy(y); if (sy < -12 || sy > this.H + 12) continue;
          for (let k = 0; k < 2; k++) {
            const s = SGN[k], wb = red ? 1 : 1 + 0.04 * Math.sin(t * 2.2 + i + k * 1.7), x = this.wallX(y, side, s) - s * 11;
            gooShine(c, x, sy, 7, wb);
          }
        }
      }
      c.globalAlpha = ga;
    }
    c.strokeStyle = this.wsGooB; c.fillStyle = this.wsGooC; c.lineWidth = 2.4;
    for (let si = 0; si < ns; si++) {
      const side = sides[si], ye = this.wsEnd(side, ps, y1);
      for (let y = Math.ceil(y0 / 300) * 300; y <= ye; y += 300) {
        const sy = this.sy(y), s = h1(y * 0.011) < 0.5 ? -1 : 1, x1 = this.wallX(y, side, s), x2 = this.wallX(y + 90, side, s), sy2 = this.sy(y + 90);
        const sag = 26 + (red ? 0 : Math.sin(t * 1.4 + y) * 6), mx = (x1 + x2) / 2 - s * sag, my = (sy + sy2) / 2 + 10;
        c.beginPath(); c.moveTo(x1, sy); c.quadraticCurveTo(mx, my + 14, x2, sy2); c.stroke();
        const d = red ? 0.5 : (t * 0.5 + h1(y)) % 1; c.beginPath(); c.arc(mx * 0.5 + (x1 + x2) * 0.25, my + 6 + d * 10, 2 + d, 0, TAU); c.fill();
      }
    }
  }
  // wsSea: the sea branch of drawWallStyle (its own method, so it optimizes on its own and inlines its helpers)
  wsSea(race, a, wall, c, t, y0, y1, ps, sides, ns, red) {
    // the Sea is wider than the screen: an off-screen wall is pinned to the screen edge so the folds always frame it
    const YB = this._ys || (this._ys = nbuf()), XB = this._xs || (this._xs = nbuf());
    if (this.wsSeaK !== wallKey(wall)) { this.wsSeaK = wallKey(wall); this.wsSeaA = css(wall, 0.7); }
    const ga = c.globalAlpha, bk = red ? 0 : clamp(+this.beat || 0, 0, 1);
    for (let si = 0; si < ns; si++) {
      const side = sides[si], ye = this.wsEnd(side, ps, y1);
      for (let k = 0; k < 2; k++) {
        const s = SGN[k];
        YB.n = 0; XB.n = 0;
        for (let y = Math.floor(y0 / 14) * 14; y <= ye; y += 14) {
          const wx = this.wallX(y, side, s);
          nb1(YB, y); nb1(XB, s < 0 ? Math.max(6, wx) : Math.min(VIEW_W - 6, wx));
        }
        const ys = YB.a, xs = XB.a, yn = YB.n;
        if (yn < 2) continue;
        // a 10 to 14 px fleshy fold: a '#7a0a20' body (one fill) with a '#ff7a5c' rim along its lane edge (one stroke),
        // breathing 3% on the beat
        c.beginPath();
        for (let i = 0; i < yn; i++) { const yy = this.sy(ys[i]); i ? c.lineTo(xs[i], yy) : c.moveTo(xs[i], yy); }
        for (let i = yn - 1; i >= 0; i--) c.lineTo(xs[i] - s * seaFold(ys[i], bk), this.sy(ys[i]));
        c.closePath(); c.fillStyle = '#7a0a20'; c.globalAlpha = ga * 0.9; c.fill();
        c.strokeStyle = '#ff7a5c'; c.lineWidth = 3; c.globalAlpha = ga; c.beginPath();
        for (let i = 0; i < yn; i++) { const x = xs[i] - s * seaFold(ys[i], bk), yy = this.sy(ys[i]); i ? c.lineTo(x, yy) : c.moveTo(x, yy); }
        c.stroke();
      }
    }
  }
  // wsFork: the fork branch of drawWallStyle (its own method, so it optimizes on its own and inlines its helpers)
  wsFork(race, a, wall, c, t, y0, y1, ps, sides, ns, red) {
    const es = race.eggSide || 0, step = this.lite ? 14 : 9, bk = red ? 0 : clamp(+this.beat || 0, 0, 1);
    // (cool cyan, so the Fork's violet reads apart from the Goo's periwinkle and the Sea's red)
    if (this.rwK !== wallKey(wall)) { this.rwK = wallKey(wall); this.rwD = css(lerpC(wall, rgb('#7fe8ff'), 0.6, SCR), 0.32); this.rwL = css(lerpC(rgb('#7fe8ff'), WHITE, 0.45, SCR), 1); }
    // the dim dots: a dashed stroke (2 px squares every step), one short subpath per two dots so the pattern restarts
    // on world-anchored rows (it never crawls along a slanted wall); no rects
    c.strokeStyle = this.rwD; c.lineWidth = 2; c.lineCap = 'butt'; c.setLineDash(this.lite ? DASH_FORK_L : DASH_FORK); c.lineDashOffset = 0; c.beginPath();
    const seg = step * 2, ys = Math.ceil(y0 / seg) * seg;
    for (let si = 0; si < ns; si++) {
      const side = sides[si], ye = this.wsEnd(side, ps, y1);
      for (let y = ys; y <= ye; y += seg) {
        const ya = y, yb = y + seg - 1;
        for (let k = 0; k < 2; k++) {
          const s = SGN[k];
          c.moveTo(this.wallX(ya, side, s) - s * 5, this.sy(ya)); c.lineTo(this.wallX(yb, side, s) - s * 5, this.sy(yb));
        }
      }
    }
    c.stroke(); c.setLineDash(NODASH); c.lineCap = 'round';
    c.globalAlpha = red ? a * 0.5 : a * (0.65 + 0.35 * bk); c.fillStyle = this.rwL; c.beginPath();   // (reduced: static dots at 0.5)
    const ys2 = Math.ceil(y0 / step) * step;
    for (let si = 0; si < ns; si++) {
      const side = sides[si];
      if (side && side !== es) continue;   // the wrong tube stays dark
      const ye = this.wsEnd(side, ps, y1);
      for (let y = ys2; y <= ye; y += step) {
        const k = red ? ((y / step) % 4 === 0 ? 0 : 1) : ((y / 260 - t * 1.8) % 1 + 1) % 1;
        if (k > 0.16) continue;
        const r = red ? 1.6 : 1.2 + 1.4 * (1 - k / 0.16) * (0.7 + 0.3 * bk), sy = this.sy(y);
        for (let kk = 0; kk < 2; kk++) { const s = SGN[kk], x = this.wallX(y, side, s) - s * 5; c.rect(x - r, sy - r, r * 2, r * 2); }
      }
    }
    c.fill();
  }
  // wsRapids: the rapids branch of drawWallStyle (its own method, so it optimizes on its own and inlines its helpers)
  wsRapids(race, a, wall, c, t, y0, y1, ps, sides, ns, red) {
    if (this.wsRapK !== wallKey(wall)) { this.wsRapK = wallKey(wall); this.wsRapA = css(lerpC(wall, WHITE, 0.35, SCR), 0.5); }
    c.strokeStyle = this.wsRapA; c.lineWidth = 1.6; c.beginPath();
    for (let si = 0; si < ns; si++) {
      const side = sides[si], ye = this.wsEnd(side, ps, y1);
      for (let y = Math.ceil(y0 / 12) * 12; y <= ye; y += 12) {
        const sy = this.sy(y);
        for (let k = 0; k < 2; k++) {
          const s = SGN[k], L = 18 + 8 * h1(y * 0.21 + s), x = this.wallX(y, side, s), w = red ? 0 : Math.sin(t * 14 + y * 0.09) * 5;
          c.moveTo(x, sy); c.quadraticCurveTo(x - s * L * 0.55, sy + L * 0.25 + w * 0.4, x - s * L * 0.7, sy + L * 0.7 + w);
        }
      }
    }
    c.stroke();
    // white water on the walls: a 2 px foam line 3 px inside each wall, and shimmer dashes racing downstream on it
    c.beginPath();
    for (let si = 0; si < ns; si++) {
      const side = sides[si], ye = this.wsEnd(side, ps, y1);
      for (let k = 0; k < 2; k++) {
        const s = SGN[k]; let first = true;
        for (let y = Math.ceil(y1 / 22) * 22; y >= y0; y -= 22) { if (y > ye) continue; const x = this.wallX(y, side, s) - s * 3, sy = this.sy(y); if (first) { c.moveTo(x, sy); first = false; } else c.lineTo(x, sy); }
      }
    }
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2; c.stroke();
    c.setLineDash(DASH_FOAM); c.lineDashOffset = red ? 0 : -t * 420; c.strokeStyle = 'rgba(235,255,255,0.95)'; c.lineWidth = 2.6; c.stroke();
    c.setLineDash(NODASH); c.lineDashOffset = 0;
  }
  // wsEgg: the egg branch of drawWallStyle (its own method, so it optimizes on its own and inlines its helpers)
  wsEgg(race, a, wall, c, t, y0, y1, ps, sides, ns, red) {
    for (let pass = 0; pass < 3; pass++) {
      const dx = pass === 1 ? 5 : 0;
      c.lineWidth = pass === 0 ? 24 : pass === 1 ? 10 : 3;
      c.beginPath();
      for (let si = 0; si < ns; si++) {
        const side = sides[si], ye = this.wsEnd(side, ps, y1);
        for (let k = 0; k < 2; k++) {
          const s = SGN[k]; let first = true;
          for (let y = Math.floor(y0 / 22) * 22; y <= ye; y += 22) { const x = this.wallX(y, side, s) - s * dx, sy = this.sy(y); if (first) { c.moveTo(x, sy); first = false; } else c.lineTo(x, sy); }
        }
      }
      c.strokeStyle = pass === 0 ? 'rgba(255,215,92,0.22)' : pass === 1 ? 'rgba(255,246,234,0.42)' : '#ffd75c'; c.stroke();
    }
    const bk = red ? 0 : clamp(+this.beat || 0, 0, 1);
    c.fillStyle = 'rgba(255,232,170,0.85)'; c.beginPath();
    for (let si = 0; si < ns; si++) {
      const side = sides[si], ye = this.wsEnd(side, ps, y1);
      for (let y = Math.ceil(y0 / 28) * 28; y <= ye; y += 28) {
        const sy = this.sy(y);
        for (let k = 0; k < 2; k++) { const s = SGN[k], x = this.wallX(y, side, s) - s * (3 + 2 * bk), yy = sy - 2 * bk * (h1(y * 0.13) > 0.5 ? 1 : -1); c.moveTo(x + 6, yy); c.arc(x, yy, 6, 0, TAU); }
      }
    }
    c.fill();
  }
  // per-zone wall dressing, drawn at alpha a (two calls blend across a zone gate). Plain loops over the module's SGN
  // and the constant sides() arrays: no closures, arrays or strings a frame once its colours are cached
  drawWallStyle(race, id, a, wall) {
    if (a <= 0.02) return;
    const c = this.ctx, t = this.time, y0 = this.camY - 40, y1 = this.camY + this.H + 40, ps = race.p.side;
    const sides = this.sides(race), ns = sides.length, red = this.reduced;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = a;
    if (id === 'launch') {         // muscle ribs every 36 px, squeezing on the beat
      this.wsLaunch(race, a, wall, c, t, y0, y1, ps, sides, ns, red);
    } else if (id === 'acid') {    // pitted, corroded wall and a few green drips sliding down it
      this.wsAcid(race, a, wall, c, t, y0, y1, ps, sides, ns, red);
    } else if (id === 'goo') {     // a lumpy, milky rim and a few strands sagging off it
      this.wsGoo(race, a, wall, c, t, y0, y1, ps, sides, ns, red);
    } else if (id === 'sea') {     // rugae: deep soft folds along the wall, shaded on the inside
      this.wsSea(race, a, wall, c, t, y0, y1, ps, sides, ns, red);
    } else if (id === 'fork') {    // cilia runway lights: dots 9 px apart (14 on lite) down both walls; pulses run up the right tube on the beat
      this.wsFork(race, a, wall, c, t, y0, y1, ps, sides, ns, red);
    } else if (id === 'rapids') {  // long combed cilia, raked downstream by the current and waving fast
      this.wsRapids(race, a, wall, c, t, y0, y1, ps, sides, ns, red);
    } else if (id === 'egg') {     // a soft golden glow, a pearly rim band, a gold line and corona bumps bobbing on the beat
      this.wsEgg(race, a, wall, c, t, y0, y1, ps, sides, ns, red);
    }
    c.globalAlpha = 1;
  }
  // two fleshy pillars and a sagging membrane in the new zone's wall colour; torn once you are through
  drawZoneGate(zi, race) {
    const wy = ZSTART[zi], y = this.sy(wy);
    if (y < -90 || y > this.H + 90) return;
    const c = this.ctx, t = this.time, side = wy >= FORK_Y0 ? (race.p.side || race.eggSide) : 0, ch = chan(wy, side);
    const col = ZONES[zi].wall, L = ch.c - ch.h, R = ch.c + ch.h, through = race.p.y > wy + 6;
    const sag = 16 + Math.sin(t * 2.2 + zi) * 4;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (!through) {
      // the membrane: the new zone's colour at 0.32 with its own tissue showing through at 0.5
      c.beginPath(); c.moveTo(L, y); c.quadraticCurveTo(ch.c, y + sag * 2, R, y); c.quadraticCurveTo(ch.c, y + sag * 2 - 10, L, y);
      c.fillStyle = hexA(col, 0.32); c.fill();
      const pat = this.tiles.has(zi) ? this.tilePat(zi) : null;
      if (pat) { c.globalAlpha = 0.5; c.fillStyle = pat; c.fill(); c.globalAlpha = 1; }
      c.strokeStyle = hexA(col, 0.85); c.lineWidth = 3; c.beginPath(); c.moveTo(L, y); c.quadraticCurveTo(ch.c, y + sag * 2, R, y); c.stroke();
      c.strokeStyle = hexA(col, 0.25); c.lineWidth = 1.2; c.beginPath();
      for (let i = 1; i < 6; i++) { const u = i / 6, x = L + (R - L) * u, dy = sag * 2 * 2 * u * (1 - u); c.moveTo(x, y + dy * 0.5 - 6); c.lineTo(x, y + dy); }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L + 18, y + 4); c.quadraticCurveTo(ch.c - 20, y + sag * 1.4, ch.c - 6, y + sag * 1.4); c.stroke();
    } else {   // torn flaps flutter from each pillar
      c.strokeStyle = hexA(col, 0.7); c.lineWidth = 3;
      for (let s = -1; s <= 1; s += 2) {
        const bx = s < 0 ? L : R, fl = Math.sin(t * 5 + s) * 6;
        c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx - s * 18, y + 14 + fl, bx - s * 10, y + 30 + fl); c.stroke();
      }
    }
    for (let s = -1; s <= 1; s += 2) {
      const bx = s < 0 ? L : R, w = this.reduced ? 15 : 15 + 3 * Math.sin(t * 2.2 + zi + s);   // 12 to 18, breathing
      c.fillStyle = hexA(col, 1); c.beginPath(); c.ellipse(bx, y, w, 30, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(bx + s * 4, y + 5, w * 0.6, 24, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(bx - s * 4, y - 12, 3, 9, s * 0.2, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(40,0,30,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(bx, y, w, 30, 0, 0, TAU); c.stroke();
    }
    this.gateDress(ZONES[zi].id, L, R, y, ch.c, sag, col, t);
    // the zone's name, printed on the membrane until you burst through it
    if (!through) {
      const sp = this.text(ZONES[zi].name.toUpperCase(), col, 22);
      c.drawImage(sp.cv, ch.c - sp.w / 2, y + sag * 1.15 - sp.h / 2 - 4, sp.w, sp.h);
    }
  }
  // one dressing per zone on its gate (only while the gate is on screen)
  gateDress(id, L, R, y, cx, sag, col, t) {
    const c = this.ctx, red = this.reduced;
    if (id === 'acid') {          // crystal shards on the pillars, drips sliding off them
      for (let s = -1; s <= 1; s += 2) {
        const bx = s < 0 ? L : R;
        for (let k = 0; k < 3; k++) {
          const hx = bx + s * (k - 1) * 5, ht = 14 + k % 2 * 8, lean = s * (k - 1) * 0.3;
          c.beginPath(); c.moveTo(hx - 4, y - 24); c.lineTo(hx + Math.sin(lean) * ht, y - 24 - ht); c.lineTo(hx + 4, y - 24); c.closePath();
          c.globalAlpha = 0.85; c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke(); c.globalAlpha = 1;
          c.fillStyle = '#4f8f12'; c.fill();
          c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5; c.stroke();
          c.fillStyle = '#b6ff5c'; c.beginPath(); c.moveTo(hx - 4, y - 24); c.lineTo(hx + Math.sin(lean) * ht, y - 24 - ht); c.lineTo(hx, y - 24); c.closePath(); c.fill();
        }
        const d = red ? 0.5 : (t * 0.8 + (s > 0 ? 0.5 : 0)) % 1;
        c.fillStyle = '#9dff3c'; c.globalAlpha = 1 - d; c.beginPath(); c.arc(bx - s * 6, y + 30 + d * 26, 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
      }
    } else if (id === 'goo') {    // wet drool strands sagging off the membrane line, each ending in a glossy drop
      const GZ = ZONES[GOO_I_R], wk = (GZ && GZ.wall) || '#fff3dc';
      // one cached 0..1 gradient for every strand (each drawn under translate(0, top) and scale(1, len + 6): a
      // vertical stretch leaves the near-vertical strand's 2.4 px width alone), not 4 new gradients a gate a frame
      if (this.gdGooK !== wk || !this.gdGooG) {
        const w0 = rgb(wk); this.gdGooK = wk;
        const g = c.createLinearGradient(0, 0, 0, 1); g.addColorStop(0, css(w0, 0.55)); g.addColorStop(1, css(w0, 0.3)); this.gdGooG = g;
      }
      const GG = this.gdGooG, cap0 = c.lineCap;
      for (let i = 1; i < 5; i++) {
        const u = i / 5, x = L + (R - L) * u, top = y + sag * 2 * 2 * u * (1 - u), len = 12 + 10 * h1(i * 3.7) + (red ? 0 : Math.sin(t * 1.6 + i) * 5);
        const wb = red ? 1 : 1 + 0.04 * Math.sin(t * 2.2 + i), sh = len + 6;
        c.save(); c.translate(0, top); c.scale(1, sh);
        c.strokeStyle = GG; c.fillStyle = GG; c.lineWidth = 2.4; c.lineCap = 'butt';
        c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + 2, len * 0.6 / sh, x, len / sh); c.stroke();
        c.beginPath(); c.ellipse(x, (len + 3) / sh, 4 * wb, 4 / sh, 0, 0, TAU); c.fill();
        c.restore(); c.lineCap = cap0;
        c.strokeStyle = 'rgba(42,26,16,0.45)'; c.lineWidth = 1; c.beginPath(); c.ellipse(x, top + len + 3, 4 * wb, 4, 0, 0, TAU); c.stroke();
        gooShine(c, x, top + len + 3, 4, wb);
      }
    } else if (id === 'sea') {    // puffy lips round each pillar top
      for (let s = -1; s <= 1; s += 2) {
        const bx = s < 0 ? L : R;
        c.fillStyle = '#c2213f'; c.beginPath(); c.ellipse(bx, y - 26, 16, 7, 0, 0, TAU); c.fill();
        c.fillStyle = '#ff9aa8'; c.beginPath(); c.ellipse(bx, y - 28, 12, 3.4, 0, 0, TAU); c.fill();
        c.strokeStyle = '#5a0018'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(bx - 12, y - 26); c.quadraticCurveTo(bx, y - 23, bx + 12, y - 26); c.stroke();
      }
    } else if (id === 'fork') {   // an arch of runway lights from pillar to pillar, a light chasing across it
      const ry = 46, n = 17, hw = (R - L) / 2, cc = colOf(col);
      c.strokeStyle = cssQ(cc, 0.3); c.lineWidth = 2; c.beginPath(); c.ellipse(cx, y - 26, hw, ry, 0, Math.PI, TAU); c.stroke();
      const lead = red ? -1 : Math.floor((t * 9) % (n + 4));
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * i / n, on = lead >= 0 && Math.abs(i - lead) <= 1, r = on ? 3 : 1.8;
        c.fillStyle = on ? '#ffffff' : css(lerpC(cc, WHITE, 0.5, SCR), 0.7); c.beginPath(); c.arc(cx - Math.cos(a) * hw, y - 26 - Math.sin(a) * ry, r, 0, TAU); c.fill();
      }
    } else if (id === 'rapids') { // river rocks at the pillar feet, with foam
      for (let s = -1; s <= 1; s += 2) {
        const bx = (s < 0 ? L : R) - s * 16;
        c.fillStyle = '#1d4652'; c.beginPath(); c.ellipse(bx, y + 22, 11, 8, 0.3 * s, 0, TAU); c.fill();
        c.fillStyle = '#3d7a8a'; c.beginPath(); c.ellipse(bx - 3, y + 19, 6, 4, -0.3, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.8)';
        for (let k = 0; k < 4; k++) { const a = Math.PI * (0.15 + 0.7 * k / 3), w = red ? 0 : Math.sin(t * 9 + k) * 1; c.beginPath(); c.arc(bx + Math.cos(a) * 13, y + 22 - Math.sin(a) * 10 + w, 1.8, 0, TAU); c.fill(); }
      }
    } else if (id === 'egg') {    // a golden arch with a bow on top
      const ry = 54; c.strokeStyle = '#ffd75c'; c.lineWidth = 6; c.beginPath(); c.ellipse(cx, y - 24, (R - L) / 2, ry, 0, Math.PI, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(cx, y - 26, (R - L) / 2 - 2, ry - 2, 0, Math.PI * 1.15, Math.PI * 1.6); c.stroke();
      const by = y - 24 - ry, wob = red ? 0 : Math.sin(t * 2) * 0.08;
      c.save(); c.translate(cx, by); c.rotate(wob); c.fillStyle = '#ff5ca8';
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-16, -13, -16, 0); c.quadraticCurveTo(-16, 13, 0, 0); c.quadraticCurveTo(16, -13, 16, 0); c.quadraticCurveTo(16, 13, 0, 0); c.fill();
      c.beginPath(); c.moveTo(-2, 2); c.lineTo(-8, 16); c.lineTo(-3, 14); c.closePath(); c.moveTo(2, 2); c.lineTo(8, 16); c.lineTo(3, 14); c.closePath(); c.fill();
      c.fillStyle = '#ff9bd0'; c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill(); c.restore();
    }
  }
  // a signpost plate, kept clear of the HUD, banners and other signs (skipped for the frame when it cannot fit)
  // an in-world label's centre x, moved so its baked box (width w) stays inside [8, VIEW_W - 8]
  labX(x, w) { return w >= VIEW_W - 16 ? VIEW_W / 2 : clamp(x, 8 + w / 2, VIEW_W - 8 - w / 2); }
  // a label beside a ring (centre cx, radius r, gap g): on side sd (1 right, -1 left), flipped to the other side when
  // its box would clip [8, VIEW_W - 8] there, then clamped; returns the label's centre x
  labBeside(cx, r, w, sd = 1, g = 6) {
    let x = cx + sd * (r + g + w / 2);
    if (x + w / 2 > VIEW_W - 8 || x - w / 2 < 8) { const x2 = cx - sd * (r + g + w / 2); if (x2 + w / 2 <= VIEW_W - 8 && x2 - w / 2 >= 8) x = x2; }
    return this.labX(x, w);
  }
  sign(x, y, text, col, kind = 'sign', fs = 15) {
    const s = this.text(text, col, fs, kind), b = this.reduced ? 0 : Math.sin(this.time * 3) * 2;
    x = this.labX(x, s.w);
    const top = this.clearTop(y - 15 + b, s.h, x, s.w);
    if (top == null) return false;
    this.signBoxes.push(x, top, s.w, s.h);
    this.ctx.drawImage(s.cv, x - s.w / 2, top, s.w, s.h);
    return true;
  }
  rrect(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // the far layer: the zone's landmark, baked once at 2x (300 x 500 logical) into a small cache (3 zones)
  // (rim false: prewarm's first slice, the silhouette alone; farRim adds the rim light as its own bake step)
  farSpr(id, rim = true) {
    const FS = this.farS || (this.farS = new Map());
    let cv = FS.get(id);
    if (cv) { if (rim) this.farRim(id); return cv; }
    if (FS.size >= 3) { const k0 = FS.keys().next().value; FS.delete(k0); }
    const K = 2, W = FAR_W, H = FAR_H;
    cv = mk(W * K, H * K); const g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, 0, 0);
    const rnd = seeded(id.length * 977 + id.charCodeAt(0) * 31);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (id === 'launch') {   // coiled tube loops with a pink glow
      // (dark plum '#4a1252', so the coils sit back behind the white crowd; farRim adds the wall-pink rim)
      const gr = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.6); gr.addColorStop(0, 'rgba(74,18,82,0.9)'); gr.addColorStop(1, 'rgba(74,18,82,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#4a1252';
      for (let i = 0; i < 4; i++) {
        const cy = 70 + i * 110, rx = 95 - i * 8, ry = 42;
        g.lineWidth = 22; g.beginPath(); g.ellipse(W / 2 + (i % 2 ? 18 : -18), cy, rx, ry, (i % 2 ? 0.2 : -0.2), 0, TAU); g.stroke();
      }
      g.lineWidth = 22; g.beginPath(); g.moveTo(W / 2 - 18, 0); g.lineTo(W / 2 - 18, 30); g.moveTo(W / 2 + 18, H - 30); g.lineTo(W / 2 + 18, H); g.stroke();
    } else if (id === 'acid') {   // a jagged crystal horizon: crystal spires rising off a dark ridge
      g.fillStyle = '#0a2412'; g.beginPath(); g.moveTo(0, H);
      let x = 0;
      while (x < W) { const w = 14 + rnd() * 26, h = 120 + rnd() * 260; g.lineTo(x + w * 0.2, H - 80 - rnd() * 20); g.lineTo(x + w * 0.5, H - 80 - h); g.lineTo(x + w * 0.8, H - 80 - rnd() * 20); x += w; }
      g.lineTo(W, H); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(200,255,106,0.5)'; g.lineWidth = 1.5; g.stroke();
    } else if (id === 'goo') {   // honey stalactites hanging from a ceiling, each ending in a drop
      g.fillStyle = '#c98a3a'; g.fillRect(0, 0, W, 40);
      for (let i = 0; i < 9; i++) {
        const x = 10 + i * (W - 20) / 8 + (rnd() - 0.5) * 14, w = 10 + rnd() * 16, L = 120 + rnd() * 300;
        g.beginPath(); g.moveTo(x - w, 30); g.quadraticCurveTo(x - w * 0.3, 30 + L * 0.6, x, 30 + L); g.quadraticCurveTo(x + w * 0.3, 30 + L * 0.6, x + w, 30); g.closePath(); g.fill();
        g.beginPath(); g.arc(x, 30 + L + 12, w * 0.45, 0, TAU); g.fill();
      }
    } else if (id === 'sea') {   // a huge Big Macro drifting far below: a lumpy cell with pseudopods and two eye holes
      g.fillStyle = '#2a0410'; g.beginPath();
      const cx = W / 2, cy = H / 2, R = 120;
      for (let k = 0; k <= 24; k++) { const an = k / 24 * TAU, rr = R * (1 + 0.16 * Math.sin(an * 5 + 1) + 0.08 * Math.sin(an * 3)); k ? g.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 1.4) : g.moveTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 1.4); }
      g.closePath(); g.fill();
      for (let k = 0; k < 4; k++) { const an = k * 1.7 + 0.5; g.beginPath(); g.ellipse(cx + Math.cos(an) * R * 1.05, cy + Math.sin(an) * R * 1.3, 34, 22, an, 0, TAU); g.fill(); }
      // a 2 px '#ff8a9c' rim round the whole outline: the body and pods stroked 4 px wide, then filled again on top
      // (the inner half and the seams between the lobes go back under the dark)
      const macro = (fn) => {
        g.beginPath();
        for (let k = 0; k <= 24; k++) { const an = k / 24 * TAU, rr = R * (1 + 0.16 * Math.sin(an * 5 + 1) + 0.08 * Math.sin(an * 3)); k ? g.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 1.4) : g.moveTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 1.4); }
        g.closePath(); fn();
        for (let k = 0; k < 4; k++) { const an = k * 1.7 + 0.5; g.beginPath(); g.ellipse(cx + Math.cos(an) * R * 1.05, cy + Math.sin(an) * R * 1.3, 34, 22, an, 0, TAU); fn(); }
      };
      g.strokeStyle = '#ff8a9c'; g.lineWidth = 4; macro(() => g.stroke());
      g.fillStyle = '#2a0410'; macro(() => g.fill());
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.ellipse(cx - 34, cy - 40, 16, 22, 0, 0, TAU); g.ellipse(cx + 34, cy - 40, 16, 22, 0, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    } else if (id === 'fork') {   // the Y split ahead: one tube parting into two
      g.strokeStyle = '#9aaee8'; g.lineWidth = 70;
      g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, H * 0.55); g.quadraticCurveTo(W / 2, H * 0.35, W * 0.18, H * 0.05); g.moveTo(W / 2, H * 0.55); g.quadraticCurveTo(W / 2, H * 0.35, W * 0.82, H * 0.05); g.stroke();
      g.strokeStyle = 'rgba(8,16,42,0.9)'; g.lineWidth = 44; g.stroke();
    } else if (id === 'rapids') {   // a waterfall lip with spray: the ledge, falling sheets and a mist of drops
      g.fillStyle = '#ffffff'; g.fillRect(0, 150, W, 14);
      g.strokeStyle = '#ffffff';
      for (let i = 0; i < 22; i++) { const x = 6 + i * (W - 12) / 21, L = 200 + rnd() * 120; g.lineWidth = 3 + rnd() * 5; g.beginPath(); g.moveTo(x, 162); g.quadraticCurveTo(x + (rnd() - 0.5) * 10, 162 + L * 0.5, x + (rnd() - 0.5) * 16, 162 + L); g.stroke(); }
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 70; i++) { const x = rnd() * W, y = 360 + rnd() * 130, r = 2 + rnd() * 6; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      for (let i = 0; i < 30; i++) { const x = rnd() * W, y = 120 + rnd() * 40, r = 1.5 + rnd() * 3; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    }
    // soft edges: every silhouette fades out over its outer 12% left and right and 6% top and bottom, so a landmark
    // never ends in a straight line (the Goo's ceiling band, the Acid's ridge ran to the sprite's edges)
    g.globalCompositeOperation = 'destination-in';
    const fx = g.createLinearGradient(0, 0, W, 0);
    fx.addColorStop(0, 'rgba(0,0,0,0)'); fx.addColorStop(0.12, 'rgba(0,0,0,1)'); fx.addColorStop(0.88, 'rgba(0,0,0,1)'); fx.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fx; g.fillRect(0, 0, W, H);
    const fy = g.createLinearGradient(0, 0, 0, H);
    fy.addColorStop(0, 'rgba(0,0,0,0)'); fy.addColorStop(0.06, 'rgba(0,0,0,1)'); fy.addColorStop(0.94, 'rgba(0,0,0,1)'); fy.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fy; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    cv.bands = farBands(g, cv.width, cv.height, K);
    FS.set(id, cv);
    if (this.farRimD) this.farRimD.delete(id);
    if (rim) this.farRim(id);
    return cv;
  }
  // the far sprite's rim light (once): the silhouette minus itself moved 1 unit down leaves its top edges, tinted the
  // zone's wall colour and laid on top. Returns the canvas when it painted, false when there was nothing to do
  farRim(id) {
    const D = this.farRimD || (this.farRimD = new Set()), cv = this.farS && this.farS.get(id);
    if (!cv || D.has(id)) return false;
    D.add(id);
    try {
      const zw = (ZONES.find((q) => q.id === id) || {}).wall || '#ffffff', r = mk(cv.width, cv.height), rg = r.getContext('2d'), K = cv.width / FAR_W;
      rg.drawImage(cv, 0, 0); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(cv, 0, K);
      rg.globalCompositeOperation = 'source-in'; rg.fillStyle = zw; rg.fillRect(0, 0, r.width, r.height);
      const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(r, 0, 0);
    } catch (e) { /* no rim */ }
    return cv;
  }
  // the zone's far landmarks (inside the tube clip, under everything in drawNear): one every FAR.gap world units of
  // the zone, scrolling at FAR.par, alternating sides, at FAR.al x the zone's weight a. Not on lite.
  drawFar(zi, a) {
    const z = ZONES[zi], F = FAR[z.id];
    if (!F) return;
    const c = this.ctx, cam = this.camY, mid = cam + this.H / 2, z0 = ZSTART[zi], z1 = ZSTART[zi + 1] != null ? ZSTART[zi + 1] : RACE_LEN + 2000;
    const reach = (this.H / 2 + FAR_H * FAR_K) / F.par, k0 = Math.max(0, Math.ceil((Math.max(z0, mid - reach) - z0) / F.gap)), k1 = Math.floor((Math.min(z1, mid + reach) - z0) / F.gap);
    if (k1 < k0) return;
    // fill rate: at most the 2 landmarks nearest the screen centre (stage 1 only the nearest; under a heavy frame on
    // stage 1 the second is the last thing dropped, see overBudget)
    const lim = this.q === 0 || this.overBudget(3) ? 1 : 2;
    let bA = -1, dA = 1e9, bB = -1, dB = 1e9;
    for (let k = k0; k <= k1; k++) {
      const wk = z0 + (k + 0.5) * F.gap;
      if (wk >= z1) continue;
      const yc = this.H / 2 - (wk - mid) * F.par;
      if (yc < -FAR_H * FAR_K * 0.6 || yc > this.H + FAR_H * FAR_K * 0.6) continue;
      const d = Math.abs(yc - this.H / 2);
      if (d < dA) { bB = bA; dB = dA; bA = k; dA = d; } else if (d < dB) { bB = k; dB = d; }
    }
    if (bA < 0) return;
    const cv = this.farSpr(z.id), t = this.time, B = cv.bands, K = cv.width / FAR_W, sea = z.id === 'sea';
    for (let n = 0; n < lim; n++) {
      const k = n ? bB : bA;
      if (k < 0) break;
      const wk = z0 + (k + 0.5) * F.gap, yc = this.H / 2 - (wk - mid) * F.par;
      const sd = k % 2 ? 1 : -1, drift = sea && !this.reduced ? Math.sin(t * 0.12 + k * 2) * 26 : 0;
      const xc = VIEW_W / 2 + sd * VIEW_W * (0.16 + 0.1 * h1(k * 3.7 + zi)) + drift, sc = (sea ? 1.1 + 0.25 * h1(k + 0.4) : 1) * FAR_K;
      const x0 = xc - FAR_W * sc / 2, y0 = yc - FAR_H * sc / 2;
      // the second landmark only while more than 40% of its painted height is on screen (a sliver costs a whole blend)
      if (n && B && B.length) {
        const ty = y0 + B[0].y0 * sc, by = y0 + B[B.length - 1].y1 * sc, vis = Math.min(by, this.H) - Math.max(ty, 0);
        if (!(vis > 0.4 * (by - ty))) continue;
      }
      c.globalAlpha = a * F.al;
      if (!B) this.img(cv, x0, y0, FAR_W * sc, FAR_H * sc);
      else for (let b = 0; b < B.length; b++) {   // only the painted bands, each trimmed to its own x range, on screen
        const Q = B[b], dy0 = y0 + Q.y0 * sc, dh = (Q.y1 - Q.y0) * sc;
        if (dy0 > this.H || dy0 + dh < 0) continue;
        const dx0 = x0 + Q.x0 * sc, dw = (Q.x1 - Q.x0) * sc;
        if (dx0 > VIEW_W || dx0 + dw < 0) continue;
        c.drawImage(cv, Q.x0 * K, Q.y0 * K, (Q.x1 - Q.x0) * K, (Q.y1 - Q.y0) * K, dx0, dy0, dw, dh);
        this.imgArea += this.clipArea(dx0, dy0, dw, dh);
      }
      // the Big Macro's eye holes glow '#ff8a9c' at 0.5 and blink at 0.5 Hz (steady for reduced motion)
      if (sea) {
        const per = 2, u = ((t + 3.1 * h1(k + 9.2)) % per + per) % per;
        const lid = this.reduced || u > 0.22 ? 1 : Math.abs(1 - u / 0.11);
        if (lid > 0.08) {
          const ex = x0 + (FAR_W / 2) * sc, ey = y0 + (FAR_H / 2 - 40) * sc;
          c.globalAlpha = a * 0.5; c.fillStyle = '#ff8a9c'; c.beginPath();
          c.ellipse(ex - 34 * sc, ey, 13 * sc, 19 * sc * lid, 0, 0, TAU); c.moveTo(ex + 47 * sc, ey); c.ellipse(ex + 34 * sc, ey, 13 * sc, 19 * sc * lid, 0, 0, TAU);
          c.fill();
        }
      }
    }
    c.globalAlpha = a;
  }
  // drawImage of a whole canvas at (x, y, w, h) that also adds its on-screen area to imgArea, so R.imgScreens counts
  // every big image layer honestly (the far landmarks, the caustic nets, the soft glows)
  img(cv, x, y, w, h) {
    this.ctx.drawImage(cv, x, y, w, h);
    this.imgArea += this.clipArea(x, y, w, h);
  }
  clipArea(x, y, w, h) {
    const x0 = x < 0 ? 0 : x, y0 = y < 0 ? 0 : y, x1 = x + w > VIEW_W ? VIEW_W : x + w, y1 = y + h > this.H ? this.H : y + h;
    return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
  }
  // stage 1's fill budget: what the image layers WOULD have cost last frame (imgWant, skipped layers included, so the
  // cut never switches itself back off) above about 4.0 screens drops, in order, the glows under 0.2 alpha (lvl 1,
  // past 4.0), the second Sea net (lvl 2, past 4.3) and the second far landmark (lvl 3, past 4.6)
  // With a layer name and its area it is the per-stage overdraw cap instead, read against this frame's running
  // imgArea: 3.0 screens at stage 0 (full quality), 2.2 at stage 1, 1.6 on lite. Each optional full-screen layer asks
  // before it draws, and they drop in FILL_SLACK order (net 2 first, then the swell bands, the second vignette, the
  // near tile's parallax), each needing that much more headroom. A dropped layer counts in imgWant.
  overBudget(lvl, area) {
    // (lvl 0: the Sea's net 2, the first thing dropped, at either stage: past 3.7 screens it goes before any glow; its
    // half-resolution layer costs about 10 ms against 4.65 ms for the direct path)
    if (area === undefined) return (this.q === 0 || lvl === 0) && (this.imgWantS || 0) > 4.0 + 0.3 * (lvl - 1);
    const cap = (this.lite ? 1.6 : this.q === 0 ? 2.2 : 3.0) - (FILL_SLACK[lvl] || 0);
    if (this.imgArea + area <= cap * VIEW_W * this.H) return false;
    this.imgWant += area; return true;
  }
  // a Goo lens's baked strokes (lens i, radius r): the 1.2 px outline at 0.18 and the 2.2 px highlight arc at 0.45,
  // at 2x, LENS_PAD logical units of margin round the r x 0.62 r ellipse
  lensSpr(i, r) {
    const LS = this.lensS || (this.lensS = new Map());
    let cv = LS.get(i);
    if (cv) return cv;
    const k = 2, w = (r + LENS_PAD) * 2, h = (r * 0.62 + LENS_PAD) * 2;
    cv = mk(Math.ceil(w * k), Math.ceil(h * k));
    const g = cv.getContext('2d');
    g.setTransform(cv.width / w, 0, 0, cv.height / h, (cv.width / w) * w / 2, (cv.height / h) * h / 2);
    g.beginPath(); g.ellipse(0, 0, r, r * 0.62, 0, 0, TAU); g.strokeStyle = 'rgba(240,244,255,0.18)'; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.ellipse(0, 0, r * 0.78, r * 0.44, 0, 3.55, 4.75); g.stroke();
    LS.set(i, cv);
    return cv;
  }
  // nearLaunch: the launch branch of drawNear (its own method, so it optimizes on its own and inlines its helpers)
  nearLaunch(zi, a, c, z, t, NT, cam, N, NB, pos, X) {
    // peristalsis: pink muscle rings squeezing to the beat
    const f = (z.beat || 96) / 60, n = NB(this.lite ? 3 : 7), bt = this.reduced ? 0 : clamp(+this.beat || 0, 0, 1);
    // a warm pink glow low in the tube, breathing with the beat
    this.dglow('#ff9ac0', VIEW_W / 2, this.H * 0.85, 240, a * (0.12 + 0.06 * bt));
    // the rings, batched (about 6 calls, was 32): each ring's (cx, y, rx, ry, core alpha) into a kept buffer, then ONE
    // fill of all the ellipses, ONE 10 px halo stroke, the 3 px cores in 3 alpha buckets and ONE highlight path
    const RB = this._lrB || (this._lrB = new Float32Array(5 * 8)), sw = this.reduced ? -1 : (t * f) % 1;
    let rn = 0;
    for (let i = 0; i <= n && rn < 8; i++) {
      const sweep = i === n;
      if (sweep && sw < 0) break;
      const y = sweep ? -30 + sw * (this.H + 60) : pos(i + 60, 1, 0);
      const k = sweep ? 1 - sw : this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * f * TAU - i * 0.9), ga = sweep ? Math.sin(sw * Math.PI) : 1;
      if (y < -40 || y > this.H + 40) continue;
      const ch = chan(cam + this.H - y, 0), j = rn * 5;
      RB[j] = ch.c; RB[j + 1] = y; RB[j + 2] = ch.h; RB[j + 3] = 14 + 6 * k; RB[j + 4] = (0.28 + 0.24 * k) * ga; rn++;
    }
    if (rn) {
      c.beginPath();
      for (let r = 0; r < rn; r++) { const j = r * 5, rx = RB[j + 2] * 0.98; c.moveTo(RB[j] + rx, RB[j + 1]); c.ellipse(RB[j], RB[j + 1], rx, RB[j + 3], 0, 0, TAU); }
      c.globalAlpha = a; c.fillStyle = 'rgba(255,120,170,0.05)'; c.fill();
      c.strokeStyle = 'rgba(255,140,190,0.07)'; c.lineWidth = 10; c.stroke();   // the halo
      c.strokeStyle = 'rgb(255,140,190)'; c.lineWidth = 3;
      for (let bk = 0; bk < 3; bk++) {   // the cores: alpha buckets 0..0.25, 0.25..0.4, 0.4+ (drawn at 0.2, 0.33, 0.47)
        let any = false;
        c.beginPath();
        for (let r = 0; r < rn; r++) {
          const j = r * 5, al = RB[j + 4], b = al < 0.25 ? 0 : al < 0.4 ? 1 : 2;
          if (b !== bk || al < 0.02) continue;
          const rx = RB[j + 2] * 0.98; c.moveTo(RB[j] + rx, RB[j + 1]); c.ellipse(RB[j], RB[j + 1], rx, RB[j + 3], 0, 0, TAU); any = true;
        }
        if (any) { c.globalAlpha = a * (bk === 0 ? 0.2 : bk === 1 ? 0.33 : 0.47); c.stroke(); }
      }
      c.beginPath();
      for (let r = 0; r < rn; r++) {
        const j = r * 5, rx = RB[j + 2] * 0.9, ry = RB[j + 3] * 0.8, y = RB[j + 1] - 2;
        c.moveTo(RB[j] + Math.cos(Math.PI * 1.1) * rx, y + Math.sin(Math.PI * 1.1) * ry); c.ellipse(RB[j], y, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9);
      }
      c.globalAlpha = a; c.strokeStyle = 'rgba(255,220,235,0.12)'; c.lineWidth = 1.2; c.stroke();
    }
    // pink speed streaks rushing past (24, 12 on lite)
    c.globalAlpha = a; c.strokeStyle = 'rgba(255,170,210,0.35)'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < NB(this.lite ? 12 : 24); i++) {
      const x = X(i + 300), y = pos(i + 300, 1, this.reduced ? 0 : 600 + 300 * h1(i + 0.9)), l = 30 + 50 * h1(i + 2.3);
      c.moveTo(x, y); c.lineTo(x, y - l);
    }
    c.stroke();
    c.lineWidth = 3;
    for (let i = 0; i < N(10); i++) this.dglow('#ff9ac0', X(i) + Math.sin(t * 0.7 + i) * 12, pos(i, 0.85, -10), 18 + h1(i) * 26, a * 0.22);
    c.globalAlpha = a; c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath();
    for (let i = 10; i < 10 + N(30); i++) { const x = X(i) + Math.sin(t + i) * 6, y = pos(i, 1, 12), r = 0.7 + h1(i + 0.3) * 1.8; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
    c.fill();
  }
  // nearFork: the fork branch of drawNear (its own method, so it optimizes on its own and inlines its helpers)
  nearFork(zi, a, c, z, t, NT, cam, N, NB, pos, X) {
    // the Fork is cool (its colours come from ZONES); pink is the scent alone: pheromone wisps and heart puffs,
    // all leaning toward the right tube
    const es = (this.race && this.race.eggSide) || 0;
    if (this.forkNK !== z.wall) { this.forkNK = z.wall; this.forkNF = css(lerpC(rgb(z.wall), WHITE, 0.25), 0.16); this.forkNB = css(lerpC(rgb(z.col[1]), WHITE, 0.3), 0.18); }
    // two big membrane bubbles drifting slowly (parallax 0.3), in the zone's own tint
    const LT = this.H + 520;
    c.strokeStyle = this.forkNB; c.lineWidth = 2;
    for (let i = 1; i < 3; i++) {
      const u = ((h1(i * 9.7 + 3) * LT - cam * 0.3 - t * (4 + i * 2)) % LT + LT) % LT, ny = this.H + 260 - u;
      const nx = VIEW_W * (0.2 + 0.3 * i) + (this.reduced ? 0 : Math.sin(t * 0.13 + i * 2.1) * 40);
      const r = 60 + 60 * h1(i * 4.4 + 1), wob = this.reduced ? 1 : 1 + 0.04 * Math.sin(t * 0.7 + i);
      c.globalAlpha = a; c.beginPath(); c.ellipse(nx, ny, r * wob, r / wob, 0, 0, TAU); c.stroke();
      c.beginPath(); c.ellipse(nx, ny, r * 0.82 * wob, r * 0.82 / wob, 0, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
    }
    // 10 to 14 pheromone wisps: 4 px bezier ribbons at 0.34, curling up and over toward the egg's tube
    {
      const n = this.lite ? 10 : 14, WL = this.H + 300;
      c.globalAlpha = a * 0.34; c.strokeStyle = '#ff9be0'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath();
      for (let i = 0; i < n; i++) {
        const y = this.H + 150 - ((h1(i * 6.1 + 5) * WL - cam * 0.9 - t * (22 + 14 * h1(i + 2))) % WL + WL) % WL;
        const up = clamp((this.H - y) / this.H, 0, 1), L = 70 + 50 * h1(i * 2.3), sw = this.reduced ? 0 : Math.sin(t * 1.1 + i * 1.7) * 14;
        const x = X(i + 200) + es * up * 40, lean = es * (26 + 22 * h1(i + 0.4));
        c.moveTo(x, y + L * 0.5);
        c.bezierCurveTo(x + sw - lean * 0.2, y + L * 0.15, x - sw + lean * 0.7, y - L * 0.2, x + lean, y - L * 0.5);
      }
      c.stroke(); c.globalAlpha = a;
    }
    // (no ZGLOW sparkle in the wrong branch: past the split, the glows on its side of the divider are skipped)
    const r0 = this.race, split = !!r0 && cam + this.H > FORK_Y0 && this.sides(r0).length > 1, dvx = split ? centre(Math.max(FORK_Y0, cam + this.H / 2)) : 0;
    for (let i = 0; i < N(8); i++) {
      const gx = X(i) + Math.sin(t * 0.7 + i) * 12;
      if (split && (gx - dvx) * es < 0) continue;
      this.dglow('#788cc8', gx, pos(i, 0.85, -10), 18 + h1(i) * 26, a * 0.16);
    }
    for (let i = 20; i < 20 + N(12); i++) {
      const y = pos(i, 0.95, 26 + h1(i) * 20), up = (this.H - y) / this.H;
      const x = X(i) + es * up * 70 + Math.sin(t * 1.3 + i) * 8;
      c.globalAlpha = a * (0.25 + 0.25 * Math.sin(t * 2 + i)); c.fillStyle = '#ff9be0';
      c.save(); c.translate(x, y); c.rotate(es * 0.35 + Math.sin(t + i) * 0.15); heart(c, 0, 0, 3 + h1(i + 1) * 4); c.restore();
    }
    c.globalAlpha = a; c.fillStyle = this.forkNF; c.beginPath();
    for (let i = 40; i < 40 + N(24); i++) { const x = X(i) + Math.sin(t + i) * 6, y = pos(i, 1, 12), r = 0.7 + h1(i + 0.3) * 1.8; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
    c.fill();
  }
  // nearEgg: the egg branch of drawNear (its own method, so it optimizes on its own and inlines its helpers)
  nearEgg(zi, a, c, z, t, NT, cam, N, NB, pos, X) {
    // swaying light shafts from the egg ahead, then golden corona cells drifting by
    if (!this.shaftG || this.shaftH !== this.H) {
      this.shaftH = this.H; this.shaftG = c.createLinearGradient(0, 0, 0, this.H * 1.2);
      this.shaftG.addColorStop(0, 'rgba(255,236,170,0.16)'); this.shaftG.addColorStop(1, 'rgba(255,236,170,0)');
    }
    const sunOn = this.sunY != null, sx0 = sunOn ? this.sunX : VIEW_W / 2, sy0 = sunOn ? this.sunY : -30, sr = sunOn ? this.sunR * 0.45 : VIEW_W * 0.25;
    for (let i = 0; i < 3; i++) {
      const sway = this.reduced ? 0 : Math.sin(t * 0.35 + i * 2.1) * 0.09;
      c.save(); c.translate(sx0 + (i - 1) * sr, sy0); c.rotate((i - 1) * 0.22 + sway);
      c.fillStyle = this.shaftG; c.beginPath(); c.moveTo(-14, 0); c.lineTo(14, 0); c.lineTo(46, this.H * 1.2); c.lineTo(-46, this.H * 1.2); c.closePath(); c.fill(); c.restore();
    }
    const n = NB(this.lite ? 6 : 14);
    for (let i = 0; i < n; i++) {
      const x = X(i + 90) + Math.sin(t * 0.6 + i) * 14, y = pos(i + 90, 0.9, 14 + h1(i) * 10), r = 6 + h1(i + 0.5) * 5;
      this.dglow('#ffd77a', x, y, r * 2.6, a * 0.22);
      c.globalAlpha = a; c.fillStyle = 'rgba(255,222,140,0.42)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,245,200,0.5)'; c.lineWidth = 1; c.stroke();
      c.fillStyle = 'rgba(200,140,40,0.35)'; c.beginPath(); c.arc(x + r * 0.2, y + r * 0.1, r * 0.35, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(x - r * 0.4, y - r * 0.4, r * 0.18, 0, TAU); c.fill();
    }
    c.globalAlpha = a; c.fillStyle = 'rgba(255,240,170,0.8)'; c.beginPath();
    for (let i = 10; i < 10 + N(30); i++) { const x = X(i) + Math.sin(t + i) * 6, y = pos(i, 1, 12), r = 0.7 + h1(i + 0.3) * 1.8; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
    c.fill();
    c.fillStyle = '#fff3c0';
    for (let i = 40; i < 40 + N(12); i++) { const k = 0.5 + 0.5 * Math.sin(t * 4 + i * 2); if (k < 0.3) continue; star4(c, X(i), pos(i, 0.95, 20), 2 + 4 * k); }
  }
  // nearAcid: the acid branch of drawNear (its own method, so it optimizes on its own and inlines its helpers)
  nearAcid(zi, a, c, z, t, NT, cam, N, NB, pos, X) {
    // the lagoon: light and air in the fluid, none of it inked or dashed (the real puddles stay the loudest lime).
    // A soft green lift mid-tube, a lime caustic net (0.07, parallax 0.6, turned 0.2 rad), two fog bands drifting
    // up at 8 px/s and 3 or 4 bubble columns rising off the walls
    {
      const ch = chan(cam + this.H * 0.5, 0);
      this.dglow('#3d7a3a', ch.c, this.H * 0.5, Math.max(60, ch.h * 2 * 0.6), a * 0.18);
      if (!this.lite) {   // the turned lime net: ONE pattern fill (its transform turns, scrolls and sways it)
        const pat = this.causPat(CAUS_ACID), S = 256;
        // (at 0.18, its sideways drift swaying at 0.3 Hz)
        const u = cam * 0.6 + (this.reduced ? 0 : t * 4), oy = ((u % S) + S) % S, ox = this.reduced ? 0 : (((t * 5 + 14 * Math.sin(t * 0.3 * TAU)) % S) + S) % S;
        if (pat && pat.setTransform) {
          const M = this.acidPM || (this.acidPM = new DOMMatrix()), cs = Math.cos(0.2), sn = Math.sin(0.2);
          M.a = cs; M.b = sn; M.c = -sn; M.d = cs; M.e = VIEW_W / 2 - cs * ox - sn * oy; M.f = this.H / 2 - sn * ox + cs * oy;
          pat.setTransform(M);
          c.globalAlpha = a * 0.18; c.fillStyle = pat; c.fillRect(-20, -20, VIEW_W + 40, this.H + 40);
          this.imgArea += VIEW_W * this.H;
        }
      }
      if (!this.acidFogG) { const g = c.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, 'rgba(157,255,60,0)'); g.addColorStop(0.5, 'rgba(157,255,60,1)'); g.addColorStop(1, 'rgba(157,255,60,0)'); this.acidFogG = g; }
      const FL = this.H + 240, m0 = this.wm;
      c.fillStyle = this.acidFogG; c.globalAlpha = a * 0.06;
      for (let i = 0; i < 2; i++) {
        const fy = this.H + 120 - ((h1(i * 5.3 + 2) * FL + cam * 0.5 + (this.reduced ? 0 : t * 8) + i * FL * 0.5) % FL + FL) % FL;
        setXf(c, m0, 0, fy, 0, 1, 1); c.fillRect(-20, -30, VIEW_W + 40, 60);
      }
      c.setTransform(m0);
      // the bubble columns: pinned to the walls (2 a side, 3 on lite), 6 to 10 bubbles each, r 2 to 5, 40 to 70 px/s
      const nc = this.lite ? 3 : 4, CH = 300;
      c.globalAlpha = a * 0.35; c.strokeStyle = '#b6ff5c'; c.lineWidth = 1.2; c.beginPath();
      for (let k = 0; k < nc; k++) {
        const base = pos(k + 400, 1, 0), wy = cam + this.H - base, cc = chan(wy, 0), sd = k % 2 ? 1 : -1;
        const bx = cc.c + sd * (cc.h - 12 - 6 * h1(k + 0.3)), nbub = 6 + Math.floor(h1(k * 1.7 + 4) * 5), sp = 40 + 30 * h1(k * 3.1 + 1);
        for (let b = 0; b < nbub; b++) {
          const u = (((this.reduced ? 0 : t * sp) + b * CH / nbub + h1(k * 9 + b) * 20) % CH + CH) % CH, y = base - u;
          const r = 2 + 3 * h1(k * 5 + b * 1.3), x = bx - sd * (this.reduced ? 0 : 2 * Math.sin(t * 3 + b + k)) - sd * u * 0.02;
          c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
        }
      }
      c.stroke(); c.globalAlpha = a;
    }
    {   // drips landing on the pool: 4 to 6 rings spreading 0 to 90 px over 2.4 s, 2 px lime, 0.22 fading to 0
      const nr = this.lite ? 4 : 6;
      c.strokeStyle = '#c8ff6a'; c.lineWidth = 2;
      for (let i = 0; i < nr; i++) {
        const ph = this.reduced ? 0.35 + 0.1 * i : t / 2.4 + h1(i * 3.9 + 1), u = ph - Math.floor(ph), r = 90 * u, cyc = Math.floor(ph) * 7;
        if (r < 1) continue;
        const x = X(i + 170 + cyc), y = pos(i + 170 + cyc, 1, 0);
        c.globalAlpha = a * 0.22 * (1 - u); c.beginPath(); c.ellipse(x, y, r, r * 0.55, 0, 0, TAU); c.stroke();
      }
      // a faint diagonal heat shimmer band drifting up the tube
      if (!this.shimG) { const g = c.createLinearGradient(0, -60, 0, 60); g.addColorStop(0, 'rgba(220,255,160,0)'); g.addColorStop(0.5, 'rgba(220,255,160,1)'); g.addColorStop(1, 'rgba(220,255,160,0)'); this.shimG = g; }
      const SL = this.H + 500, sy = this.H + 250 - (((this.reduced ? 0 : t * 50) + cam * 0.6) % SL + SL) % SL, m0 = this.wm;
      setXf(c, m0, VIEW_W / 2, sy, -0.45, 1, 1 + (this.reduced ? 0 : 0.15 * Math.sin(t * 1.7)));
      c.globalAlpha = a * 0.06; c.fillStyle = this.shimG; c.fillRect(-VIEW_W, -60, VIEW_W * 2, 120);
      c.setTransform(m0); c.globalAlpha = a;
    }
    if (this.q === 1 && !this.lite) {   // two faint fume wisps curling up (full quality only)
      c.lineCap = 'round'; c.strokeStyle = 'rgba(190,255,110,1)'; c.lineWidth = 34;
      for (let i = 0; i < 2; i++) {
        const y = pos(i + 140, 0.7, -14), x = VIEW_W * (0.3 + 0.4 * i), w = this.reduced ? 0 : Math.sin(t * 0.5 + i * 2) * 30;
        c.globalAlpha = a * 0.05; c.beginPath(); c.moveTo(x - 40, y + 80); c.bezierCurveTo(x + 30 + w, y + 30, x - 30 - w, y - 30, x + 20, y - 90); c.stroke();
      }
      c.globalAlpha = a;
    }
    for (let i = 0; i < N(4); i++) this.dglow('#9dff3c', X(i) + Math.sin(t * 0.4 + i * 2) * 60, pos(i, 0.6, 0), 90, a * 0.2);
    {   // the fizz: 20 to 30 tiny '#e6ffb0' bubbles rising 30 to 60 px/s with a wiggle (one path), and 2 or 3 lime
      // steam wisps ('#9dff3c' at 0.08) curling up (frozen for reduced motion)
      const red = this.reduced, nf = N(28), FH = this.H + 60;
      c.fillStyle = '#e6ffb0'; c.globalAlpha = a * 0.7; c.beginPath();
      for (let i = 0; i < nf; i++) {
        const j = i + 520, sp = 30 + 30 * h1(j + 0.4), u = (((red ? 0 : t * sp) + h1(j * 1.9) * FH + cam * 0.2) % FH + FH) % FH;
        const y = this.H + 30 - u, x = X(j) + (red ? 0 : 3 * Math.sin(t * 5 + j * 1.3)), r = 0.8 + 1.4 * h1(j + 2.2);
        c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
      }
      c.fill();
      const nw = this.lite ? 2 : 3;
      c.lineCap = 'round'; c.strokeStyle = '#9dff3c'; c.lineWidth = 22; c.globalAlpha = a * 0.08; c.beginPath();
      for (let i = 0; i < nw; i++) {
        const y = pos(i + 560, 0.8, red ? 0 : -18), x = VIEW_W * (0.2 + 0.3 * i), w = red ? 0 : Math.sin(t * 0.7 + i * 2.4) * 24;
        c.moveTo(x, y + 70); c.bezierCurveTo(x + 26 + w, y + 25, x - 26 - w, y - 25, x + 12, y - 70);
      }
      c.stroke(); c.globalAlpha = a;
    }
    {   // 3 or 4 streams of bubbles rising off the floor: each grows as it climbs and pops at the top
      const ns = this.lite ? 3 : 4, nb = this.lite ? 4 : 6, pops = this._acidPop || (this._acidPop = []);
      pops.length = 0;
      c.strokeStyle = 'rgba(210,255,150,0.6)'; c.lineWidth = 1.2; c.beginPath();
      for (let sI = 0; sI < ns; sI++) {
        const by = pos(sI + 150, 1, 0), bx = VIEW_W * (0.15 + 0.7 * h1(sI * 4.3 + 9));
        for (let b = 0; b < nb; b++) {
          const u = ((this.reduced ? 0.3 : t * 0.45) + b / nb + h1(sI + b * 0.1)) % 1, x = bx + Math.sin(u * 9 + sI + b) * 5, y = by - u * 220, r = 1.4 + 4.2 * u;
          if (u > 0.93) { pops.push(x, y, r); continue; }
          c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
        }
      }
      c.stroke();
      c.fillStyle = 'rgba(230,255,190,0.85)';
      for (let i = 0; i < pops.length; i += 3) star4(c, pops[i], pops[i + 1], pops[i + 2] * 1.3);
      if (pops.length) {   // each pop leaves a 4 px ring
        c.strokeStyle = 'rgba(230,255,190,0.7)'; c.lineWidth = 1.2; c.beginPath();
        for (let i = 0; i < pops.length; i += 3) { const rr = pops[i + 2] + 4; c.moveTo(pops[i] + rr, pops[i + 1]); c.arc(pops[i], pops[i + 1], rr, 0, TAU); }
        c.stroke();
      }
    }
    {   // 2 or 3 slow lime drips sliding down the walls ('#b6ff5c' at 0.5), stretching as they go
      const nd = this.lite ? 2 : 3, sideP = (this.race && this.race.p && this.race.p.side) || 0, DL = this.H + 200;
      c.fillStyle = '#b6ff5c'; c.globalAlpha = a * 0.5;
      for (let i = 0; i < nd; i++) {
        const sw = SGN[i & 1], y = this.H + 100 - ((h1(i * 4.1 + 6) * DL - cam - (this.reduced ? 0 : t * (14 + 8 * h1(i + 2)))) % DL + DL) % DL;
        if (y < -30 || y > this.H + 30) continue;
        const wx = this.wallX(cam + this.H - y, sideP, sw) - sw * 3, L = 7 + 5 * (this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.8 + i * 2));
        c.beginPath(); c.moveTo(wx, y - L * 1.6); c.quadraticCurveTo(wx - sw * 3.2, y, wx, y + L * 0.5); c.quadraticCurveTo(wx + sw * 0.4, y, wx, y - L * 1.6); c.fill();
        c.beginPath(); c.arc(wx - sw * 1.2, y + L * 0.1, 2.6, 0, TAU); c.fill();
      }
      c.globalAlpha = a;
    }
    {   // fizz: 20 to 30 tiny bright specks rising fast and wobbling (lite 12)
      const nz = N(this.lite ? 24 : 26) + 2, rm = this.reduced;
      c.globalAlpha = a; c.fillStyle = 'rgba(214,255,150,0.75)'; c.beginPath();
      for (let i = 0; i < nz; i++) {
        const j = i + 260, x = X(j) + (rm ? 0 : Math.sin(t * 7 + i * 1.7) * 2.5), y = pos(j, 1, rm ? 0 : -(90 + 70 * h1(j + 0.2))), r = 0.9 + h1(j + 0.9) * 1.1;
        c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
      }
      c.fill();
    }
    const n1 = 4 + N(12);   // (60% fewer drifting rings than before: the fizz carries the bubbling now)
    c.globalAlpha = a; c.strokeStyle = 'rgba(200,255,140,0.45)'; c.lineWidth = 1.2; c.beginPath();
    for (let i = 4; i < n1; i++) { const x = X(i) + Math.sin(t * 2 + i) * 5, y = pos(i, 1, -40 - h1(i) * 50), r = 1.5 + h1(i + 0.7) * 4.5; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath();
    for (let i = 4; i < n1; i++) { const x = X(i) + Math.sin(t * 2 + i) * 5, y = pos(i, 1, -40 - h1(i) * 50), r = 1.5 + h1(i + 0.7) * 4.5; c.moveTo(x - r * 0.3, y - r * 0.35); c.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU); }
    c.fill();
  }
  // nearGoo: the goo branch of drawNear (its own method, so it optimizes on its own and inlines its helpers)
  nearGoo(zi, a, c, z, t, NT, cam, N, NB, pos, X) {
    // an oil-slick sheen: 3 wide diagonal bands (about 20 degrees) drifting at parallax 0.4, cycling through the
    // hues at 0.06 (full quality only; not on lite or for reduced motion)
    if (this.q === 1 && !this.lite && !this.reduced) {
      const m0 = this.wm, SL = this.H + 400;
      for (let i = 0; i < 3; i++) {
        const w = 60 + 30 * h1(i * 5.1 + 2), sy = this.H + 200 - ((h1(i * 2.7 + 11) * SL - cam * 0.4 - t * 6) % SL + SL) % SL;
        setXf(c, m0, VIEW_W * (0.2 + 0.3 * i), sy, -0.35, 1, 1);
        c.globalAlpha = a * (0.05 + 0.02 * h1(i + 4.4)); c.fillStyle = HSL75[hueI(t * 40 + i * 120)];
        c.fillRect(-VIEW_W, -w / 2, VIEW_W * 2, w);
      }
      c.setTransform(m0); c.globalAlpha = a;
    }
    // everything moves slowly here (0.4x): mucus lenses sagging past, then thick glossy strands
    // the custard's depth: a top-to-bottom wash down the tube, honey '#f3d68f' at the top to '#c98a3a', at 0.25
    // (it replaced a grey mucus fog), then a honey light pooling in the middle
    if (!this.gooWashG || this.gooWashH !== this.H) {
      this.gooWashH = this.H; const g = c.createLinearGradient(0, 0, 0, this.H);
      // (top 0.25, bottom 0.35: the custard deepens toward the floor)
      g.addColorStop(0, 'rgba(241,230,204,0.25)'); g.addColorStop(1, 'rgba(184,118,58,0.35)'); this.gooWashG = g;
    }
    c.globalAlpha = a; c.fillStyle = this.gooWashG; c.fillRect(-20, -20, VIEW_W + 40, this.H + 40);
    this.dglow('#fff6e6', VIEW_W / 2, this.H * 0.4, 260, a * 0.14);
    // 2 large glossy ribbons turning slowly (about 0.05 rad/s): lighter cream '#fffaf0' at 0.08, 14 to 20 wide, each
    // with a thin white sheen along its crest at 0.15 (frozen for reduced motion): a sheen, never a stripe over the lane
    {
      const nr = 2, red = this.reduced, m0 = this.wm, RL = this.H + 700;
      c.lineCap = 'round';
      for (let i = 0; i < nr; i++) {
        const ry = this.H + 350 - ((h1(i * 6.1 + 2.2) * RL - cam * 0.3) % RL + RL) % RL;
        if (ry < -320 || ry > this.H + 320) continue;
        const ang = (red ? 0 : t * 0.05) + i * 2.1 + h1(i + 3.3), L = 230 + 70 * h1(i * 2.3), w = 14 + 6 * h1(i + 7.1), bend = 70 * (h1(i * 4.4) - 0.5) + 30;
        setXf(c, m0, VIEW_W * (0.25 + 0.25 * i), ry, ang, 1, 1);
        c.beginPath(); c.moveTo(-L, 0); c.bezierCurveTo(-L * 0.35, -bend, L * 0.35, bend, L, 0);
        c.globalAlpha = a * 0.08; c.strokeStyle = '#fffaf0'; c.lineWidth = w; c.stroke();
        c.globalAlpha = a * 0.15; c.strokeStyle = '#ffffff'; c.lineWidth = 2;
        const o = -w * 0.28; c.beginPath(); c.moveTo(-L * 0.8, o); c.bezierCurveTo(-L * 0.3, o - bend, L * 0.3, o + bend, L * 0.8, o); c.stroke();
      }
      c.setTransform(m0); c.globalAlpha = a;
    }
    // background bokeh lobes drifting slowly: lilac-tinted (toward GOO_SHADOW) at 0.12 at most, no shine, so the
    // cream and the wet shine belong to the real goo blobs alone
    if (!this.gooBokC) this.gooBokC = css(lerpC(rgb('#f6e7c4'), rgb(GOO_SHADOW), 0.6, [0, 0, 0]));
    c.fillStyle = this.gooBokC; c.globalAlpha = a * 0.12; c.beginPath();
    for (let i = 9; i < 9 + N(6); i++) {
      const lx = X(i), ly = pos(i, 0.35, 0), lr = 14 + h1(i) * 12, wb = this.reduced ? 1 : 1 + 0.05 * Math.sin(t * 1.3 + i);
      c.moveTo(lx + lr * wb, ly); c.ellipse(lx, ly, lr * wb, lr * 0.86 / wb, 0, 0, TAU);
      c.moveTo(lx + lr * 0.7 + lr * 0.6 * wb, ly + lr * 0.35); c.ellipse(lx + lr * 0.7, ly + lr * 0.35, lr * 0.6 * wb, lr * 0.55 / wb, 0, 0, TAU);
    }
    c.fill();
    c.globalAlpha = a;
    // the lenses: the soap-film rim strokes live (its hue cycles), the faint outline and the highlight arc are
    // baked per lens (lensSpr) and stretched by the same sag
    const m0 = this.wm;
    for (let i = 30; i < 30 + N(7); i++) {
      const x = X(i), y = pos(i, 0.4, 3), r = 30 + h1(i + 0.3) * 30, sag = this.reduced ? 1 : 1 + 0.08 * Math.sin(t * 0.9 + i * 1.7);
      if (!this.lite) {   // a soap-film rim: 2 px of cycling rainbow at 0.35 (reduced motion: frozen on one hue at 0.25)
        if (this.reduced) { c.globalAlpha = a * 0.25; c.strokeStyle = HSL65[0]; } else { c.globalAlpha = a * 0.35; c.strokeStyle = HSL75[hueI(t * 60 + i * 47)]; }
        setXf(c, m0, x, y, 0, 1, sag); c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, r, r * 0.62, 0, 0, TAU); c.stroke(); c.setTransform(m0);
      }
      const L = this.lensSpr(i, r), ph = (r * 0.62 + LENS_PAD) * sag;
      c.globalAlpha = a; c.drawImage(L, x - r - LENS_PAD, y - ph, (r + LENS_PAD) * 2, ph * 2);
    }
    // a soft white specular band down the middle 30% of the tube (0.10), breathing on the beat
    {
      const ch = chan(cam + this.H * 0.5, (this.race && this.race.p && this.race.p.side) || 0), bw = ch.h * 2 * 0.3, bk = this.reduced ? 0 : clamp(+this.beat || 0, 0, 1);
      if (!this.gooSpecG) { const g = c.createLinearGradient(-0.5, 0, 0.5, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); this.gooSpecG = g; }
      setXf(c, this.wm, ch.c, 0, 0, bw * (1 + 0.08 * bk), 1);
      c.globalAlpha = a * (0.1 + 0.04 * bk); c.fillStyle = this.gooSpecG; c.fillRect(-0.5, -20, 1, this.H + 40);
      c.setTransform(this.wm); c.globalAlpha = a;
    }
    // 5 or 6 cream strands ('#fff3dc' at 0.4) sagging between two anchors: each stretches thinner and lower over
    // about 4 s, then snaps, its two halves recoiling to the anchors (reduced motion: they just hang)
    c.lineCap = 'round'; c.strokeStyle = '#fff3dc';
    for (let i = 0; i < (this.lite ? 5 : 6); i++) {
      const x1 = X(i) - 60, x2 = x1 + 80 + h1(i + 2) * 140, y = pos(i, 0.36, 0), ye = y + h1(i + 9) * 20 - 10;
      const u = this.reduced ? 0.3 : (t * (0.2 + 0.08 * h1(i + 4)) + h1(i * 2.7)) % 1, xm = (x1 + x2) / 2;
      if (u < 0.82) {   // stretching: lower and thinner
        const k = u / 0.82, sag = 16 + 46 * k * k;
        c.globalAlpha = a * 0.4; c.lineWidth = 4.5 - 3 * k; c.beginPath(); c.moveTo(x1, y); c.quadraticCurveTo(xm, y + sag * 2, x2, ye); c.stroke();
        c.globalAlpha = a * 0.5; c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.moveTo(x1, y - 1); c.quadraticCurveTo(xm, y + sag * 2 - 1.5, x2, ye - 1); c.stroke(); c.strokeStyle = '#fff3dc';
      } else {   // snapped: two halves springing back, a drop falling off each
        const k = (u - 0.82) / 0.18, r = 1 - k, back = r * r, sag = 62 * back;
        c.globalAlpha = a * 0.4 * (1 - 0.5 * k); c.lineWidth = 2; c.beginPath();
        c.moveTo(x1, y); c.quadraticCurveTo(x1 + (xm - x1) * 0.5 * back, y + sag, x1 + (xm - x1) * back * 0.8, y + sag * 1.2 + 4);
        c.moveTo(x2, ye); c.quadraticCurveTo(x2 + (xm - x2) * 0.5 * back, ye + sag, x2 + (xm - x2) * back * 0.8, ye + sag * 1.2 + 4); c.stroke();
        c.fillStyle = '#fff3dc'; c.beginPath(); c.arc(xm - 10, y + 70 + 60 * k, 2.4, 0, TAU); c.moveTo(xm + 12, ye + 70 + 70 * k); c.arc(xm + 10, ye + 70 + 70 * k, 2, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = a;
  }
  // nearSea: the sea branch of drawNear (its own method, so it optimizes on its own and inlines its helpers)
  nearSea(zi, a, c, z, t, NT, cam, N, NB, pos, X) {
    // depth: 2 or 3 huge slow silhouettes far below ('#2a0410' at 0.10, parallax 0.15 to 0.2), lumpy cell masses
    // the size of the screen, so the widest zone has a floor under its fluid
    {
      const ns = this.lite ? 2 : 3, LS = this.H + 900;
      c.fillStyle = '#2a0410'; c.strokeStyle = '#ffb59a'; c.lineWidth = 2;
      for (let j = 0; j < ns; j++) {
        const par = 0.15 + 0.025 * j, R = 150 + 70 * h1(j * 2.9 + 4);
        const sy = this.H + 450 - ((h1(j * 7.3 + 2) * LS - cam * par - (this.reduced ? 0 : t * 3)) % LS + LS) % LS;
        if (sy < -R * 1.6 || sy > this.H + R * 1.6) continue;
        const sx = VIEW_W * (j % 2 ? 0.78 : 0.22) + (h1(j + 0.7) - 0.5) * 80, br = this.reduced ? 0 : Math.sin(t * 0.25 + j * 2) * 0.03;
        // (0.22, so the floor reads, with a 2 px coral rim along the top of each lobe at 0.25)
        c.globalAlpha = a * 0.22; c.beginPath();
        for (let k = 0; k < 4; k++) {
          const an = k * 1.6 + j, rr = k ? R * (0.55 + 0.2 * h1(j * 3 + k)) : R, ox = k ? Math.cos(an) * R * 0.7 : 0, oy = k ? Math.sin(an) * R * 0.5 : 0;
          c.moveTo(sx + ox + rr * (1 + br), sy + oy); c.ellipse(sx + ox, sy + oy, rr * (1 + br), rr * 0.78 * (1 - br), 0, 0, TAU);
        }
        c.fill();
        c.globalAlpha = a * 0.25; c.beginPath();
        for (let k = 0; k < 4; k++) {
          const an = k * 1.6 + j, rr = k ? R * (0.55 + 0.2 * h1(j * 3 + k)) : R, ox = k ? Math.cos(an) * R * 0.7 : 0, oy = k ? Math.sin(an) * R * 0.5 : 0;
          const ex = sx + ox, ey = sy + oy, rx = rr * (1 + br), ry = rr * 0.78 * (1 - br);
          c.moveTo(ex + Math.cos(Math.PI * 1.15) * rx, ey + Math.sin(Math.PI * 1.15) * ry); c.ellipse(ex, ey, rx, ry, 0, Math.PI * 1.15, Math.PI * 1.85);
        }
        c.stroke();
      }
      c.globalAlpha = a;
    }
    // a caustic light net at two depths, drifting slowly: both nets are pattern fills into one half-resolution
    // layer (seaNets), faded down the screen there, then ONE image here (about 70 draws became 1)
    const seaFold = this.seaNets(a, pos);
    {   // 6 to 8 soft coral blobs drifting at parallax 0.6 ('#ff9a7a' at 0.3, r 10 to 22: paler and smaller than a Big Macro)
      const nb = this.lite ? 6 : 8, red = this.reduced;
      c.fillStyle = '#ff9a7a'; c.globalAlpha = a * 0.3; c.beginPath();
      for (let i = 0; i < nb; i++) {
        const j = i + 330, bx = X(j) + (red ? 0 : Math.sin(t * 0.35 + i * 1.9) * 16), by = pos(j, 0.6, red ? 0 : 5 + 4 * h1(j)), r = 10 + 12 * h1(j + 0.7);
        if (by < -r || by > this.H + r) continue;
        c.moveTo(bx + r, by); c.ellipse(bx, by, r, r * 0.82, 0, 0, TAU);
        c.moveTo(bx + r * 0.9, by - r * 0.45); c.ellipse(bx + r * 0.45, by - r * 0.45, r * 0.45, r * 0.4, 0, 0, TAU);
      }
      c.fill(); c.globalAlpha = a;
    }
    // the god rays and the swell bands: ONE half-resolution layer (seaLayer), repainted every 3rd frame
    if (!seaFold) this.seaLayer(a, pos);
    // three god-ray wedges from the top ('#ffb08a' at 0.12): 90 to 120 px wide at the top, 160 where they fade out
    // (0.75 of the height), swaying at 0.08 Hz. Not on lite; counted through the fill budget.
    if (!this.lite) {
      const H = this.H, RH = H * 0.75, area = 3 * (75 + 160) / 2 * RH;
      if (!this.overBudget('seaRay', area)) {
        if (!this.seaGodG || this.seaGodH !== H) {
          this.seaGodH = H; const g = c.createLinearGradient(0, 0, 0, RH);
          g.addColorStop(0, 'rgba(255,176,138,1)'); g.addColorStop(0.55, 'rgba(255,176,138,0.45)'); g.addColorStop(1, 'rgba(255,176,138,0)'); this.seaGodG = g;
        }
        const red = this.reduced, m0 = this.wm;
        c.fillStyle = this.seaGodG; c.globalAlpha = a * 0.12; c.beginPath();
        for (let i = 0; i < 3; i++) {
          const w0 = 90 + 30 * h1(i * 4.7 + 1.3), sw = red ? 0 : Math.sin(t * 0.08 * TAU + i * 2.1) * 26, xt = VIEW_W * (0.22 + 0.28 * i) + (h1(i + 8.8) - 0.5) * 30;
          c.moveTo(xt - w0 / 2, 0); c.lineTo(xt + w0 / 2, 0); c.lineTo(xt + sw + 80, RH); c.lineTo(xt + sw - 80, RH); c.closePath();
        }
        c.fill(); c.setTransform(m0); c.globalAlpha = a;
        this.imgArea += area;
      }
    }
    // one or two huge translucent cell clusters drifting far below (each one baked sprite, slowly turning)
    const LT = this.H * 3, m = this.wm;
    c.globalAlpha = a * 0.4;
    for (let j = 0; j < (this.lite ? 2 : 3); j++) {
      const u = ((h1(j * 5.3 + 31) * LT - cam * 0.5 - t * 6) % LT + LT) % LT, ly = this.H + 160 - u;
      if (ly < -160 || ly > this.H + 160) continue;
      const lx = VIEW_W * (0.25 + 0.5 * h1(j + 7)), spr = this.clusterSpr(j);
      setXf(c, m, lx, ly, this.reduced ? j : t * 0.08 + j, 1, 1); c.drawImage(spr, -100, -100, 200, 200);
    }
    // red cells tumbling past: one baked 48 x 48 sprite, flipped by a y scale
    c.globalAlpha = a;
    // (moved back to parallax 0.5 and desaturated to a soft dark '#7a1828' at 0.45, so only the pickups are bright)
    const rc = this.redCellDim();
    c.globalAlpha = a * 0.45;
    for (let i = 0; i < N(16); i++) {
      const x = X(i) + Math.sin(t * 0.5 + i) * 18, y = pos(i, 0.5, 10 + h1(i) * 12), r = 7 + h1(i + 0.4) * 9;
      const rot = t * (0.3 + h1(i) * 0.6) + i, sx = 0.35 + 0.65 * Math.abs(Math.cos(rot)), D = r * 3.2;
      setXf(c, m, x, y, i, 1, sx); c.drawImage(rc, -D / 2, -D / 2, D, D);
    }
    c.globalAlpha = a;
    // 3 or 4 big blurry red cells drifting past close to the lens (parallax 1.35)
    const rb = this.redCellDim(), nf = this.lite ? 2 : 4;
    c.globalAlpha = a * 0.4;
    for (let i = 0; i < nf; i++) {
      const LF = this.H + 420, y = this.H + 210 - ((h1(i * 3.1 + 230) * LF - cam * 1.35 - 10 * t) % LF + LF) % LF, x = VIEW_W * (i % 2 ? 0.88 : 0.12) + (h1(i + 5.5) - 0.5) * 80 + (this.reduced ? 0 : Math.sin(t * 0.3 + i) * 14 + Math.sin(t * 0.4) * 12);   // (the near layer sways as one)
      const r = 40 + h1(i + 2.2) * 30, D = r * 3.2, rot = this.reduced ? i : t * 0.15 + i, sx = 0.55 + 0.45 * Math.abs(Math.cos(rot));
      setXf(c, m, x, y, i * 1.3, 1, sx); c.drawImage(rb, -D / 2, -D / 2, D, D);
    }
    c.globalAlpha = a;
    c.setTransform(m);
    c.fillStyle = 'rgba(255,190,200,0.25)'; c.beginPath();
    for (let i = 16; i < 16 + N(24); i++) { const x = X(i), y = pos(i, 1, 6), r = 1 + h1(i) * 1.5; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
    c.fill();
  }
  // nearRapids: the rapids branch of drawNear (its own method, so it optimizes on its own and inlines its helpers)
  nearRapids(zi, a, c, z, t, NT, cam, N, NB, pos, X) {
    // white water: fast streaks, foam chevrons with froth, eddies spinning off both walls, tumbling bubbles
    // 48 to 64 streaks (24 on lite, as before) in two widths, 1.8 and 2.4 px; 1 in 4 carries a bright head (not on lite)
    const ns = N(this.lite ? 48 : 60);
    c.strokeStyle = 'rgba(190,245,255,0.7)'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let w = 0; w < 2; w++) {
      c.lineWidth = w ? 2.4 : 1.8; c.beginPath();
      for (let i = w; i < ns; i += 2) { const x = X(i) + Math.sin(t + i) * 4, y = pos(i, 1, 700 + h1(i) * 400), l = 26 + h1(i + 1) * 70; c.moveTo(x, y); c.lineTo(x + Math.sin(i) * 3, y + l); }
      c.stroke();
    }
    // whitewater: 14 to 18 streaks (2 or 3 px, 50 to 110 px long, rgba(220,250,255,0.28)) moving down the screen at
    // 0.9x the camera plus 420 px/s per 0.22 of the zone's current (reduced motion: held still, fainter)
    {
      const nd = this.lite ? 14 : 18, rm = this.reduced, dr = 420 * (+z.current || 0.22) / 0.22;
      c.globalAlpha = a * (rm ? 0.6 : 1); c.strokeStyle = 'rgba(220,250,255,0.28)';
      for (let w = 0; w < 2; w++) {
        c.lineWidth = w ? 3 : 2; c.beginPath();
        for (let i = w; i < nd; i += 2) {
          const j = i + 140, x = X(j), y = rm ? pos(j, 0, 0) : pos(j, 0.9, dr * (0.85 + 0.3 * h1(j + 0.6))), l = 50 + 60 * h1(j + 1.3);
          c.moveTo(x, y - l); c.lineTo(x + Math.sin(j) * 2, y);
        }
        c.stroke();
      }
      c.globalAlpha = a;
    }
    // foam crescents peeling off the wall lips: 4 to 6, each reborn every 0.6 s at a new spot, curling inward and
    // fading over its 0.6 s (reduced motion: still, fainter)
    {
      const nc = this.lite ? 4 : 6, sideP = (this.race && this.race.p && this.race.p.side) || 0, rm = this.reduced;
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.lineCap = 'round';
      for (let i = 0; i < nc; i++) {
        const ph = rm ? 0.4 : t / 0.6 + i / nc, u = ph - Math.floor(ph), cyc = Math.floor(ph), sw = SGN[i & 1];
        const sy = this.H * (0.12 + 0.76 * h1(i * 7.3 + cyc * 1.91)) + (rm ? 0 : u * 60), wy = cam + this.H - sy, wx = this.wallX(wy, sideP, sw);
        const r = 6 + 8 * u;
        c.globalAlpha = a * (rm ? 0.25 : 0.5) * (1 - u); c.beginPath();
        c.arc(wx - sw * (3 + 10 * u), sy, r, sw < 0 ? -1.2 : Math.PI - 0.6, sw < 0 ? 0.6 : Math.PI + 1.2); c.stroke();
      }
      c.globalAlpha = a;
    }
    if (!this.lite) {
      c.fillStyle = 'rgba(235,252,255,0.85)'; c.beginPath();
      for (let i = 0; i < ns; i += 4) { const x = X(i) + Math.sin(t + i) * 4 + Math.sin(i) * 3, y = pos(i, 1, 700 + h1(i) * 400) + 26 + h1(i + 1) * 70, r = i % 8 ? 1.6 : 2; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.fill();
    }
    // standing waves: 2 foam zigzag bands fixed to the riverbed, their teeth breathing (1 band on lite)
    {
      const side = (this.race && this.race.p && this.race.p.side) || 0, nb = this.lite ? 1 : 2;
      c.strokeStyle = 'rgba(255,255,255,0.42)'; c.lineWidth = 2.5; c.beginPath();
      for (let b = 0; b < nb; b++) {
        const y = pos(b + 120, 1, 0), wy = cam + this.H - y, l = this.wallX(wy, side, -1) + 10, r = this.wallX(wy, side, 1) - 10;
        if (r - l < 30) continue;
        const amp = this.reduced ? 5 : 4 + 2.5 * Math.sin(t * 7 + b * 2), n = Math.max(4, Math.round((r - l) / 14));
        for (let k = 0; k <= n; k++) { const x = l + (r - l) * k / n, yy = y + (k % 2 ? -amp : amp); k ? c.lineTo(x, yy) : c.moveTo(x, yy); }
      }
      c.stroke();
    }
    // foam crests on the water's edges: small white caps curling off each wall every 26 px, racing downstream
    {
      const side = (this.race && this.race.p && this.race.p.side) || 0, st = 26, off = this.reduced ? 0 : (t * 260) % st;
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath();
      for (let sy = -st + off; sy < this.H + st; sy += st) {
        const wy = cam + this.H - sy, k = Math.round((wy + (this.reduced ? 0 : t * 260)) / st);
        for (let j = 0; j < 2; j++) {
          const s = SGN[j], x = this.wallX(wy, side, s) - s * (5 + 3 * h1(k * 1.9 + j)), w = 5 + 4 * h1(k * 2.3 + j * 7);
          c.moveTo(x, sy - w * 0.6); c.quadraticCurveTo(x - s * w, sy - w * 0.2, x - s * w * 0.5, sy + w * 0.5);
        }
      }
      c.stroke();
    }
    {   // 12 to 16 white foam chevrons riding down along the walls (pointing downstream), so the flow reads at the edges
      const side = (this.race && this.race.p && this.race.p.side) || 0, nc = this.lite ? 12 : 16, rm = this.reduced;
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
      for (let i = 0; i < nc; i++) {
        const j = i + 360, s2 = SGN[i & 1], y = pos(j, 1, rm ? 0 : 380 + 160 * h1(j)), wy = cam + this.H - y;
        if (y < -12 || y > this.H + 12) continue;
        const x = this.wallX(wy, side, s2) - s2 * (14 + 10 * h1(j + 0.4)), w = 5 + 3 * h1(j + 1.7);
        c.moveTo(x - w, y - w * 0.8); c.lineTo(x, y); c.lineTo(x + w, y - w * 0.8);
      }
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.beginPath();
    const nf = N(10);
    for (let i = 60; i < 60 + nf; i++) { const x = X(i), y = pos(i, 1, 520 + h1(i) * 200), w = 15 + h1(i + 0.5) * 15; c.moveTo(x - w, y - w * 0.45); c.lineTo(x, y); c.lineTo(x + w, y - w * 0.45); }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath();
    for (let i = 60; i < 60 + nf; i++) {
      const x = X(i), y = pos(i, 1, 520 + h1(i) * 200);
      for (let k = 0; k < 3; k++) { const fx = x + (k - 1) * 4 + Math.sin(t * 9 + i + k) * 1.5, fy = y + 4 + (k % 2) * 3, r = 1.2 + h1(i + k) * 1.2; c.moveTo(fx + r, fy); c.arc(fx, fy, r, 0, TAU); }
    }
    c.fill();
    // eddies: 2 to 4 per wall, little spirals turning against the flow
    const side = (this.race && this.race.p && this.race.p.side) || 0, ne = NB(this.lite ? 2 : 3);
    c.strokeStyle = 'rgba(220,250,255,0.4)'; c.lineWidth = 1.4; c.beginPath();
    for (let sw = -1; sw <= 1; sw += 2) for (let j = 0; j < ne; j++) {
      const i = 80 + j * 2 + (sw > 0 ? 1 : 0), y = pos(i, 1, 260), wy = cam + this.H - y, ex = this.wallX(wy, side, sw) - sw * (22 + h1(i) * 10);
      const rot = (this.reduced ? 0 : t * 4 * sw) + i;
      for (let k = 0; k <= 16; k++) { const an = rot + k * 0.55, r = 2 + k * 0.9, px = ex + Math.cos(an) * r, py = y + Math.sin(an) * r * 0.8; k ? c.lineTo(px, py) : c.moveTo(px, py); }
    }
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.1; c.beginPath();
    for (let i = 100; i < 100 + N(this.lite ? 14 : 20); i++) { const r = 1.8 + h1(i + 0.2) * 3, x = X(i) + Math.sin(t * 5 + i) * 6, y = pos(i, 1, 480 + h1(i) * 200); c.moveTo(x + r, y); c.ellipse(x, y, r * (1 + 0.15 * Math.sin(t * 11 + i)), r, 0, 0, TAU); }
    c.stroke();
  }
  // things floating in the fluid of the tube, one look per zone (drawn inside the tube clip)
  drawNear(zi, a) {
    if (a <= 0.01) return;
    const c = this.ctx, z = ZONES[zi], id = z.id, t = this.time, NT = this.H + 160, cam = this.camY, Lf = this.lite ? 0.5 : 1;
    // during a blend each zone's counts shrink with its weight (never under 35%), so two zones cost about one
    // (lite: every count at 50% at most, NB's 'already lite-sized' counts included)
    const Bk = Math.max(0.35, Math.min(1, a)), N = (n) => Math.max(1, Math.round(n * Lf * Bk)), NB = (n) => Math.max(1, Math.round(n * Bk * (this.lite ? 0.5 : 1)));
    const pos = (i, par, drift) => {
      const u = ((h1(i * 3.1 + zi) * NT - cam * par - drift * t) % NT + NT) % NT;
      return this.H + 80 - u;
    };
    const X = (i) => h1(i * 7.7 + zi * 13) * VIEW_W;
    if (!this.lite && FAR[id] && this.farPre !== this.frame) this.drawFar(zi, a);
    c.globalAlpha = a;
    if (id === 'launch') {
      this.nearLaunch(zi, a, c, z, t, NT, cam, N, NB, pos, X);
    } else if (id === 'fork') {
      this.nearFork(zi, a, c, z, t, NT, cam, N, NB, pos, X);
    } else if (id === 'egg') {
      this.nearEgg(zi, a, c, z, t, NT, cam, N, NB, pos, X);
    } else if (id === 'acid') {
      this.nearAcid(zi, a, c, z, t, NT, cam, N, NB, pos, X);
    } else if (id === 'goo') {
      this.nearGoo(zi, a, c, z, t, NT, cam, N, NB, pos, X);
    } else if (id === 'sea') {
      this.nearSea(zi, a, c, z, t, NT, cam, N, NB, pos, X);
    } else if (id === 'rapids') {
      this.nearRapids(zi, a, c, z, t, NT, cam, N, NB, pos, X);
    }
    c.globalAlpha = 1;
  }

  // the Great Womb Sea's light: 4 god rays fanning down from the top (swaying at 0.15 Hz, still for reduced motion; 3 on
  // lite and stage 1) and, at full quality, the 4 slow swell bands, painted into one canvas at half the canvas
  // resolution, every 3rd frame (they are soft: the half resolution and the 2-frame lag never show), then drawn as
  // one image at alpha a. The rays' gradient has its own key (seaRay2G, on the screen height and the layer)
  // a caustic net as a repeating pattern, 256 x 512: the lower row shifted half a tile, so the net never reads as
  // wallpaper (cached per colour and per context)
  causPat(col, g = this.ctx) {
    const CP = this.causP || (this.causP = new Map()), key = col + (g === this.ctx ? '' : '~');
    let q = CP.get(key);
    if (q && q.g === g) return q.p;
    const net = this.causticSpr(col), cv = mk(256, 512), x = cv.getContext('2d');
    x.drawImage(net, 0, 0); x.drawImage(net, 128, 256); x.drawImage(net, -128, 256);
    q = { g, p: g.createPattern ? g.createPattern(cv, 'repeat') : null }; CP.set(key, q);
    return q.p;
  }
  // the Sea's two caustic nets in one half-resolution layer, repainted every frame (they scroll with the camera, so a
  // 3-frame lag would judder): net 1 (parallax 0.5, 1.5x, 0.10), net 2 (parallax 0.85, 1.6x, turned 0.3 rad, 0.07, full
  // quality only and the first thing stage 1's budget drops), then one destination-in fade (light from above: full
  // in the top 35%, gone at 0.9 of the height). 4 calls into the layer and one image on the canvas
  seaNets(a, pos) {
    const L = this.causL || (this.causL = { cv: null, g: null, fg: null, fH: 0, M1: null, M2: null });
    const H = this.H, t = this.time, cam = this.camY, c = this.ctx;
    // net 2's weight: full quality only, eased so it never pops; the first optional layer the fill budget drops.
    // Governor stage 1 (R.resize(0): q 0) and lite both shed it outright (the single-pass branch below)
    const want2 = this.q === 1 && !this.lite && !(+this.lastDrawMs >= (this.drawEma || 99)) && !this.overBudget(0) && !this.overBudget('net2', VIEW_W * H * 0.9);
    this.net2K = (this.net2K || 0) + ((want2 ? 1 : 0) - (this.net2K || 0)) * 0.1;
    if (typeof DOMMatrix === 'undefined') return false;
    if (!L.M1) { L.M1 = new DOMMatrix(); L.M2 = new DOMMatrix(); }
    // net 1 at 1.5x (a wider, calmer net), its offsets wrapped on the scaled tile
    const S1 = 1.5, u1 = cam * 0.5 + t * 4, M1 = L.M1;
    M1.a = S1; M1.b = 0; M1.c = 0; M1.d = S1; M1.e = -(((t * 6) % (256 * S1) + 256 * S1) % (256 * S1)); M1.f = ((u1 % (512 * S1)) + 512 * S1) % (512 * S1);
    if (this.q === 0 || this.lite || !(this.net2K > 0.05)) {
      // no layer: net 1 straight onto the canvas in 3 bands that stand in for the fade (full to 0.35 H, 0.55 to
      // 0.62 H, 0.2 to 0.9 H); no clear, no destination-in, no extra image
      const pat = this.causPat(CAUS_COL, c);
      if (!pat || !pat.setTransform) return false;
      pat.setTransform(M1); c.fillStyle = pat;
      // (the middle 60% of the width at 0.7: the lane reads calmer than the flanks)
      const al = a * 0.16, xm0 = VIEW_W * 0.2, xm1 = VIEW_W * 0.8;
      for (let bi = 0; bi < 3; bi++) {   // (a plain loop: no closure a frame)
        const y = bi === 0 ? 0 : bi === 1 ? H * 0.35 : H * 0.62, h = bi === 0 ? H * 0.35 : bi === 1 ? H * 0.27 : H * 0.28, k = bi === 0 ? 1 : bi === 1 ? 0.55 : 0.2;
        c.globalAlpha = al * k; c.fillRect(0, y, xm0, h); c.fillRect(xm1, y, VIEW_W - xm1, h);
        c.globalAlpha = al * k * 0.7; c.fillRect(xm0, y, xm1 - xm0, h);
      }
      c.globalAlpha = a; this.imgArea += VIEW_W * H * 0.9;
      return false;
    }
    const k = (this.s || 1) * 0.5, W = Math.max(8, Math.ceil(VIEW_W * k)), Hp = Math.max(8, Math.ceil(H * k));
    if (!L.cv || L.cv.width !== W || L.cv.height !== Hp) { L.cv = mk(W, Hp); L.g = L.cv.getContext('2d'); L.fg = null; }
    const g = L.g, pat = this.causPat(CAUS_COL, g);
    if (!pat || !pat.setTransform) return false;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, Hp);
    g.setTransform(k, 0, 0, k, 0, 0);
    pat.setTransform(M1); g.fillStyle = pat; g.globalAlpha = 0.16; g.fillRect(0, 0, VIEW_W, H * 0.9);
    {
      const S2 = 1.6, u2 = cam * 0.85 + t * 7, oy2 = ((u2 % (512 * S2)) + 512 * S2) % (512 * S2), ox2 = ((-t * 5) % (256 * S2) + 256 * S2) % (256 * S2);
      const cs = Math.cos(0.3), sn = Math.sin(0.3), M2 = L.M2;
      M2.a = S2 * cs; M2.b = S2 * sn; M2.c = -S2 * sn; M2.d = S2 * cs; M2.e = VIEW_W / 2 - cs * ox2 - sn * oy2; M2.f = H / 2 - sn * ox2 + cs * oy2;
      pat.setTransform(M2); g.fillStyle = pat; g.globalAlpha = 0.1 * this.net2K; g.fillRect(0, 0, VIEW_W, H * 0.9);
    }
    if (!L.fg || L.fH !== H) {
      L.fH = H; L.fg = g.createLinearGradient(0, 0, 0, H);
      L.fg.addColorStop(0, 'rgba(0,0,0,1)'); L.fg.addColorStop(0.35, 'rgba(0,0,0,1)'); L.fg.addColorStop(0.9, 'rgba(0,0,0,0)'); L.fg.addColorStop(1, 'rgba(0,0,0,0)');
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.fillStyle = L.fg; g.fillRect(0, 0, VIEW_W, H);
    // the middle 60% of the width keeps 70% of the net (the lane reads calmer than the flanks)
    g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.3; g.fillStyle = '#000'; g.fillRect(VIEW_W * 0.2, 0, VIEW_W * 0.6, H);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // the god rays and swell bands (seaLayer's 3-frame repaint, same half-res size) folded in: the Sea composites
    // ONE half-resolution image, not two
    let folded = false;
    if (pos) { const S = this.seaPaint(pos); if (S && S.cv.width === W && S.cv.height === Hp) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(S.cv, 0, 0); folded = true; } }
    c.globalAlpha = a; c.drawImage(L.cv, 0, 0, W, Hp, 0, 0, VIEW_W, H); this.imgArea += VIEW_W * H;
    return folded;
  }
  // the god rays and the swell bands in their own half-resolution canvas, repainted every 3rd frame (returns it)
  seaPaint(pos) {
    const L = this.seaL || (this.seaL = { cv: null, g: null, f: -99, H: 0, M: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } });
    const k = (this.s || 1) * 0.5, W = Math.max(8, Math.ceil(VIEW_W * k)), Hp = Math.max(8, Math.ceil(this.H * k));
    if (!L.cv || L.cv.width !== W || L.cv.height !== Hp) { L.cv = mk(W, Hp); L.g = L.cv.getContext('2d'); L.f = -99; }
    if (this.frame - L.f >= 3 || this.frame < L.f || L.H !== this.H) {
      const g = L.g, H = this.H, t = this.time, red = this.reduced, M = L.M;
      L.f = this.frame; L.H = H; M.a = k; M.d = k;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, W, Hp);
      if (!this.seaRay2G || this.seaRay2H !== H || this.seaRay2C !== g) {
        this.seaRay2H = H; this.seaRay2C = g; this.seaRay2G = g.createLinearGradient(0, 0, 0, H);
        this.seaRay2G.addColorStop(0, 'rgba(255,184,166,1)'); this.seaRay2G.addColorStop(0.65, 'rgba(255,184,166,0.25)'); this.seaRay2G.addColorStop(1, 'rgba(255,184,166,0)');
      }
      g.fillStyle = this.seaRay2G;
      const nr = this.lite || this.q === 0 ? 3 : 4;
      for (let i = 0; i < nr; i++) {
        const w = 120 + 80 * h1(i * 3.3 + 7), sw = red ? 0 : Math.sin(t * 0.15 * TAU + i * 1.9) * 0.1;
        setXf(g, M, VIEW_W * (0.12 + 0.76 * (i + 0.5) / nr), -20, (i - (nr - 1) / 2) * 0.12 + sw, 1, 1);
        g.globalAlpha = (0.09 + 0.05 * h1(i + 12.3)) * (red ? 1 : 0.85 + 0.15 * Math.sin(t * 0.4 + i * 2.3));
        g.beginPath(); g.moveTo(-w * 0.25, 0); g.lineTo(w * 0.25, 0); g.lineTo(w * 0.5, H); g.lineTo(-w * 0.5, H); g.closePath(); g.fill();
      }
      // the swell bands (full quality only; frozen at t = 0 for reduced motion), the second layer the fill budget drops
      if (this.q === 1 && !this.lite && !this.overBudget('swell', VIEW_W * H * 0.3)) {
        g.setTransform(k, 0, 0, k, 0, 0); g.globalAlpha = 0.12; g.lineCap = 'round'; g.lineWidth = 56; g.strokeStyle = '#ff8a9c';
        for (let i = 0; i < 4; i++) {
          const y = pos(i + 200, 0.7, 8), ph = (red ? 0 : t * 0.5) + i * 1.7;
          g.beginPath(); g.moveTo(-20, y);
          g.bezierCurveTo(VIEW_W * 0.3, y + Math.sin(ph) * 26, VIEW_W * 0.7, y - Math.sin(ph) * 26, VIEW_W + 20, y + Math.sin(ph + 1) * 10); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    return L;
  }
  seaLayer(a, pos) {
    const L = this.seaPaint(pos), c = this.ctx;
    c.globalAlpha = a; c.drawImage(L.cv, 0, 0, L.cv.width, L.cv.height, 0, 0, VIEW_W, this.H); this.imgArea += VIEW_W * this.H;
  }
  drawScent(race) {
    const c = this.ctx, p = race.p;
    if (!(p.y > FORK_Y0 - 4000 && p.y < FORK_END)) return;
    const strong = race.muts.nose ? 1 : 0.45;
    // one fill colour and globalAlpha; the 18 motes are batched into 4 alpha steps (4 fills, not 18)
    c.fillStyle = '#ff96e6';
    for (let b = 1; b <= 4; b++) {
      let any = false;
      for (let i = 0; i < 18; i++) {
        const k = (this.time * 0.35 + i / 18) % 1;
        if (Math.min(4, Math.max(1, Math.ceil((1 - k) * 4))) !== b) continue;
        const wy = FORK_Y0 + 1200 - k * 3600;
        const ch = chan(Math.max(wy, FORK_Y0 + 10), race.eggSide);
        const x = ch.c + Math.sin(i * 7.1 + this.time * 2) * ch.h * 0.6 * (1 - k * 0.5), y = this.sy(wy);
        if (y < -20 || y > this.H + 20) continue;
        if (!any) { c.beginPath(); any = true; }
        if (i % 3 === 0) heartP(c, x, y, 3 + (i % 2) * 1.5); else { const r = 2.2 + (i % 3); c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      }
      if (any) { c.globalAlpha = (b - 0.5) / 4 * 0.9 * strong; c.fill(); }
    }
    c.globalAlpha = 1;
    if (race.muts.nose && !p.side) {
      const ch = chan(FORK_Y0 + 300, race.eggSide), y = this.sy(Math.min(p.y + 350, FORK_Y0 + 200));
      c.save(); c.translate(ch.c, y + Math.sin(this.time * 6) * 4); c.fillStyle = '#ff8be0'; c.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 6);
      c.beginPath(); c.moveTo(0, -26); c.lineTo(18, 0); c.lineTo(7, 0); c.lineTo(7, 22); c.lineTo(-7, 22); c.lineTo(-7, 0); c.lineTo(-18, 0); c.closePath(); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); c.restore();
    }
  }

  // R.marks: your best distance (a dashed gold line with a BEST flag at the left wall) and the graves of earlier
  // swimmers (a little X-eyed outline with a label). Only marks within the view plus 200 px, at most 2 a frame.
  // A grave Kevin passes floats up over 0.6 s with a tiny halo (reduced motion: it fades in place).
  drawMarks(race, dt) {
    const M = this._marks;
    if (!M || !M.length || race.demo) return;
    const c = this.ctx, p = race.p, t = this.time, red = this.reduced, y0 = this.camY - 200, y1 = this.camY + this.H + 200;
    const camMid = this.camY + this.H * 0.5;
    let drawn = 0;
    for (let i = 0; i < M.length && drawn < 2; i++) {
      const m = M[i];
      if (!m || !Number.isFinite(+m.y)) continue;
      const wy = +m.y;
      if (wy < y0 || wy > y1) continue;
      const side = wy >= FORK_Y0 ? (p.side || race.eggSide || 0) : 0, sy = this.sy(wy);
      const L = this.wallX(wy, side, -1), R = this.wallX(wy, side, 1);
      if (!(R - L > 20)) continue;
      if (m.kind === 'best') {
        drawn++;
        const sh = !red && Math.abs(wy - camMid) < 900 ? 0.8 + 0.2 * Math.sin(t * 1.5 * TAU) : 1;
        c.globalAlpha = 0.8 * sh; c.strokeStyle = '#ffd75c'; c.lineWidth = 3; c.lineCap = 'butt';
        c.setLineDash(LD_12_8); c.beginPath(); c.moveTo(L + 4, sy); c.lineTo(R - 4, sy); c.stroke(); c.setLineDash(NODASH);
        const s = this.text(String(m.label || 'BEST'), '#ffd75c', 13, 'label');
        // the flag sits at the left wall; when Kevin is within 70 px across and 120 px up or down of it, it flips to
        // the right wall (hysteresis: back at 85 / 140) so it never hides under him or his YOU tag
        const E = this.ex(m), fl0 = clamp(L + 8, 8, VIEW_W - s.w - 10), ky = this.sy(p.y);
        const near = (lim, vl) => Math.abs(fl0 + 2 + s.w / 2 - p.x) < lim + s.w / 2 && Math.abs(sy - s.h / 2 - ky) < vl;
        if (!E.flip && near(70, 120)) E.flip = 1; else if (E.flip && !near(85, 140)) E.flip = 0;
        const fx = E.flip ? clamp(R - 8 - s.w - 2, 8, VIEW_W - s.w - 10) : fl0;
        c.globalAlpha = sh; c.fillStyle = '#ffd75c'; c.fillRect(E.flip ? fx + s.w : fx, sy - s.h - 2, 2, s.h + 2);   // the flagpole
        c.drawImage(s.cv, E.flip ? fx : fx + 2, sy - s.h - 2, s.w, s.h);
        this.labRect((E.flip ? fx : fx + 2) + s.w / 2, sy - s.h / 2 - 2, s.w, s.h, 'best');
        c.globalAlpha = 1;
      } else if (m.kind === 'grave') {
        const E = this.ex(m);
        if (p.y > wy && E.pt == null) E.pt = t;
        const k = E.pt == null ? 0 : clamp((t - E.pt) / 0.6, 0, 1);
        if (k >= 1) continue;
        drawn++;
        const e = 1 - (1 - k) * (1 - k), ch = chan(wy, side);
        const gx0 = clamp(ch.c + (h1(wy * 0.013) - 0.5) * ch.h * 0.8, L + 20, R - 20);
        const gy = sy - (red ? 0 : 40 * e), dyK = Math.abs(gy + 10 - this.sy(p.y));
        // a grave (and its label) Kevin is about to swim over moves to the wall away from him (same hysteresis as BEST)
        if (!E.flip && k === 0 && Math.abs(gx0 - p.x) < 70 && dyK < 120) { E.flip = 1; E.gx = gx0 >= p.x ? L + 30 : R - 30; }
        else if (E.flip && k === 0 && !(Math.abs(gx0 - p.x) < 85 && dyK < 140)) E.flip = 0;
        const gx = E.flip ? clamp(E.gx, L + 20, R - 20) : gx0;
        c.globalAlpha = 1 - k;
        const g = this.graveSpr();
        c.drawImage(g, gx - 9, gy - 15, 18, 32);
        if (k > 0) { c.strokeStyle = '#ffd75c'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(gx, gy - 14, 5, 1.7, 0, 0, TAU); c.stroke(); }
        if (m.label) { const s = this.text(String(m.label), '#c9b6c2', 11), lx = this.labX(gx, s.w); c.drawImage(s.cv, lx - s.w / 2, gy + 20 - s.h / 2, s.w, s.h); this.labRect(lx, gy + 20, s.w, s.h, 'grave'); }
        c.globalAlpha = 1;
      }
    }
  }
  // a little swimmer outline with X eyes (about 60% of a crowd swimmer), baked once
  graveSpr() {
    if (this.graveS) return this.graveS;
    const K = 3, cv = mk(18 * K, 32 * K), g = cv.getContext('2d');
    g.setTransform(K * 0.62, 0, 0, K * 0.62, 9 * K, 12 * K);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#c9b6c2'; g.fillStyle = 'rgba(201,182,194,0.18)';
    g.lineWidth = 1.8; g.beginPath(); g.ellipse(0, 0, 7.5, 10, 0, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, 10); g.quadraticCurveTo(4, 16, -1, 22); g.quadraticCurveTo(-5, 27, 1, 31); g.stroke();
    g.lineWidth = 1.5; g.beginPath();
    for (let sx = -1; sx <= 1; sx += 2) { const ex = sx * 3.2, ey = -2.5; g.moveTo(ex - 1.6, ey - 1.6); g.lineTo(ex + 1.6, ey + 1.6); g.moveTo(ex + 1.6, ey - 1.6); g.lineTo(ex - 1.6, ey + 1.6); }
    g.moveTo(-2.6, 4.2); g.quadraticCurveTo(0, 3.2, 2.6, 4.2); g.stroke();
    return (this.graveS = cv);
  }

  // ---------------------------------------------------------------- hazards and pickups
  // what FRENZY makes Kevin immune to, read once a frame (core: tier 4 HYPER shrugs acid off, tier 5 GOD MODE or
  // nitro shrugs everything off; the goo mutation surfs the gates): acidImm, safeNow, gooSurf
  immFlags(race) {
    const p = race.p, fz = p.frenzyT > 0, m = race.muts || {};
    this.acidImm = fz && (p.tier | 0) >= 4;
    this.safeNow = fz && ((p.tier | 0) >= 5 || !!m.nitro);
    this.gooSurf = !!m.goo;
  }
  drawEnts(race, dt) {
    const c = this.ctx, top = this.camY + this.H + 80, bot = this.camY - 80, t = this.time, p = race.p;
    // collectibles fade out over 36 px as they slide under the top HUD (read live: the egg cam moves it), so fruit by
    // the mutation chips never passes for one more chip; hazards keep drawing (drawWarnings covers them up there)
    this.hfB = race.demo || race.over ? null : this.hudB();
    this.immFlags(race);
    // Coach's band (R.coachBandHit): hudB() to hudB() + 70 CSS px, live swims only
    const cbOn = !race.demo && !race.over && !race.drill, cb0 = cbOn ? this.hudB() : 0, cb1 = cb0 + 70 * (this.cssK || 1);
    for (const e of race.ents) {
      // a paid near miss (brushed it, never touched it) makes Kevin flinch, then grin
      if (e.paid && !this.paidSeen.has(e)) { this.paidSeen.add(e); if (e.near && !e.touched && !e.hit && !race.demo) { this.nearMiss(); this.ex(e).goldT = this.time; } }
      // a Big Mac drawn last frame that is dead now pops like a cartoon (drawCorpses)
      if (e.dead && e.t === 'wbc') { const E = this.ex(e); if (!E.corpse && E.seen === this.frame - 1) this.addCorpse(e); }
      if (e.dead || e.y > top + e.r || e.y < bot - (e.h || 0) - e.r) continue;
      const x = e.x, y = this.sy(e.y);
      if (cbOn && !this.coachBandHit) { const hh = e.t === 'gate' ? 16 : e.t === 'current' ? 10 : Math.min(40, e.r || 12); if (y + hh > cb0 && y - hh < cb1) this.coachBandHit = true; }
      switch (e.t) {
        case 'sugar': {
          const ci = Math.floor(Math.abs(e.x * 7 + e.y)) % FRUIT.length, col = FRUIT[ci], bob = Math.sin(t * 4 + e.y) * 2, yy = y + bob, r = e.r;
          const fa = this.hudBandA(yy);
          // the Great Womb Sea and the Launch Tube are fruit-coloured themselves: there the glow under it is cream
          const zd = ZONES[this.bt > 0.5 && ZONES[(this.zi | 0) + 1] ? (this.zi | 0) + 1 : this.zi | 0], pale = !!zd && (zd.id === 'sea' || zd.id === 'launch');
          if (this.hbGlow(yy)) { if (pale) this.dglow('#fff0dc', x, yy, r + 10, 0.35 * fa); else this.dglow(col, x, yy, r + 10, 0.5 * fa); }
          // a 2 px ink ring behind every fruit, so it never melts into the floor
          c.globalAlpha = fa * 0.55; c.strokeStyle = HZ_INK; c.lineWidth = 2; c.beginPath(); c.arc(x, yy, r + 1.5, 0, TAU); c.stroke();
          c.globalAlpha = fa;
          c.fillStyle = col; c.beginPath(); c.arc(x, yy, r, 0, TAU); c.fill();
          c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.arc(x + 2, yy + 2.5, r * 0.75, 0, Math.PI); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x - 3, yy - 3.5, 3, 2, -0.6, 0, TAU); c.fill();
          if (ci % 2 === 0) { c.fillStyle = 'rgba(255,240,150,0.85)'; for (let k = 0; k < 4; k++) c.fillRect(x - 4 + (k % 2) * 6, yy + (k >> 1) * 4 - 1, 1.4, 1.8); }
          c.fillStyle = '#5bd96b'; c.beginPath(); c.ellipse(x + 2, yy - r, 4.5, 2, -0.5, 0, TAU); c.fill();
          c.beginPath(); c.ellipse(x - 2, yy - r + 0.5, 3.5, 1.6, 0.6, 0, TAU); c.fill();
          c.globalAlpha = 1;
          break; }
        case 'dna': {
          const fa = this.hudBandA(y);
          if (this.hbGlow(y)) this.dglow('#ff5cd2', x, y, 26, (0.35 + 0.15 * Math.sin(t * 6)) * fa); c.globalAlpha = fa;
          c.lineCap = 'round';
          c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.4; c.beginPath();
          for (let i = 0; i <= 10; i += 2) { const yy = y - 14 + i * 2.8, s = Math.sin(t * 5 + i * 0.7) * 8; c.moveTo(x + s, yy); c.lineTo(x - s, yy); }
          c.stroke(); c.lineWidth = 3;
          for (let k = 0; k < 2; k++) { c.strokeStyle = k ? '#5ce1ff' : '#ff5cd2'; c.beginPath(); for (let i = 0; i <= 10; i++) { const yy = y - 14 + i * 2.8, xx = x + Math.sin(t * 5 + i * 0.7 + k * Math.PI) * 8; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); }
          if (Math.sin(t * 3 + e.y) > 0.9) { c.fillStyle = '#fff'; star4(c, x + 9, y - 12, 4); }
          c.globalAlpha = 1;
          break; }
        case 'shield': {
          const b = Math.sin(t * 4 + e.y) * 2, r = e.r, fa = this.hudBandA(y + b);
          if (this.hbGlow(y + b)) this.dglow('#ffd75c', x, y + b, r + 14, 0.45 * fa); c.globalAlpha = fa;
          c.fillStyle = '#ffd75c'; c.beginPath(); c.arc(x, y + b + 2, r * 0.85, Math.PI, 0); c.lineTo(x + r, y + b + 4); c.lineTo(x - r, y + b + 4); c.closePath(); c.fill();
          c.strokeStyle = '#b07a10'; c.lineWidth = 1.5; c.stroke();
          c.fillStyle = '#ff3d6e'; c.fillRect(x - 1.5, y + b - r * 0.8, 3, r * 0.9);
          c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - 4, y + b - 3, 2.5, 1.5, -0.6, 0, TAU); c.fill();
          c.globalAlpha = 1;
          break; }
        case 'alkali': {
          const r = e.r + Math.sin(t * 5 + e.y) * 1.5, fa = this.hudBandA(y);
          if (this.hbGlow(y)) this.dglow('#5cc8ff', x, y, r + 10, 0.4 * fa); c.globalAlpha = fa;
          c.fillStyle = 'rgba(92,200,255,0.3)'; c.strokeStyle = '#9ae2ff'; c.lineWidth = 2;
          c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(x - r * 0.4, y - r * 0.4, 2.2, 0, TAU); c.fill();
          c.font = this.font800(this.fpx(13)); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
          c.lineWidth = 2; c.strokeStyle = 'rgba(10,30,60,0.9)'; c.strokeText('pH', x, y + 1); c.fillStyle = '#e6f8ff'; c.fillText('pH', x, y + 1);
          c.globalAlpha = 1;
          break; }
        case 'acid': case 'goo': {
          const acid = e.t === 'acid', col = acid ? '#b6ff5c' : '#c79bff', seed = e.seed || 0;
          // a DRIFTER's track: a 2 px dotted line across its sway (x0 +- drift) on the puddle's row, a tick at each end
          if (e.drift && Number.isFinite(e.x0)) {
            const dr = +e.drift || CORE.DRIFT_AMP || 55, x0 = e.x0;
            c.globalAlpha = 0.35; c.strokeStyle = '#d6ff8a'; c.lineWidth = 2; c.lineCap = 'round'; c.setLineDash(DOT_POP);
            c.beginPath(); c.moveTo(x0 - dr, y); c.lineTo(x0 + dr, y); c.stroke(); c.setLineDash(NODASH);
            c.beginPath(); c.moveTo(x0 - dr, y - 6); c.lineTo(x0 - dr, y + 6); c.moveTo(x0 + dr, y - 6); c.lineTo(x0 + dr, y + 6); c.stroke();
            c.globalAlpha = 1;
          }
          // a dripper's glob (e.drop): a teardrop stretch with 2 speed lines while it falls (e.fall > 0), then a
          // 0.15 s splat squash as it lands
          let dropXf = false;
          if (e.drop) {
            const E = this.ex(e), falling = e.fall > 0;
            if (falling) E.landT = null; else if (E.landT == null) E.landT = this.time;
            let sx = 1, sy = 1;
            if (falling) { sx = 0.86; sy = 1.35; }
            else if (!this.reduced && this.time - E.landT < 0.15) { const u = (this.time - E.landT) / 0.15, q = Math.sin(u * Math.PI) * (1 - u * 0.4); sx = 1 + 0.3 * q; sy = 1 - 0.3 * q; }
            if (falling && !this.reduced) {
              c.strokeStyle = 'rgba(230,210,255,0.6)'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath();
              for (let k = -1; k <= 1; k += 2) { const lx = x + k * e.r * 0.4; c.moveTo(lx, y - e.r * 1.2); c.lineTo(lx, y - e.r * 1.2 - 16 - 6 * h1(k + Math.floor(t * 12))); }
              c.stroke();
            }
            if (sx !== 1 || sy !== 1) { c.save(); c.translate(x, y); c.scale(sx, sy); c.translate(-x, -y); dropXf = true; }
          }
          const imm = acid && this.acidImm;   // (HYPER FRENZY: acid cannot touch him, so it stops shouting)
          if (this.hbGlow(y - e.r)) this.dglow(col, x, y, e.r * 1.35, imm ? 0.08 : acid ? 0.22 : 0.16);   // (no glow in the HUD band)
          c.fillStyle = hexA(col, acid ? 0.5 : 0.3);   // (acid: bright lime on the bottle-green floor)
          // a puddle hugging the wall (within e.r + 24 of it) would melt into the '#b6ff5c' wall: a hotter '#e6ff4a'
          // fill at 0.55, an 8 px ink outline on its wall-facing half and a 3 px dark gap stroke just outside that
          if (acid && !imm) {
            const ch = chan(e.y, (p && p.side) || 0);
            if (Math.abs(e.x - ch.c) > ch.h - e.r - 24) {
              const a0 = e.x > ch.c ? -Math.PI / 2 : Math.PI / 2, rr = e.r * 1.1;
              c.lineCap = 'round';
              c.beginPath(); c.ellipse(x, y, rr + 5.5, (rr + 5.5) * 0.78, 0, a0, a0 + Math.PI); c.strokeStyle = '#061204'; c.lineWidth = 3; c.stroke();
              c.beginPath(); c.ellipse(x, y, rr, rr * 0.78, 0, a0, a0 + Math.PI); c.strokeStyle = HZ_INK; c.lineWidth = 8; c.stroke();
              c.fillStyle = 'rgba(230,255,74,0.55)';
            }
          }
          // honest edges: the membrane only wobbles OUTWARD (1.02 to 1.10 x r), so the drawn rim never sits inside
          // core's hitbox (hypot(dx, dy * 1.3) < r); the hazard tape (and goo's rim) traces that hitbox exactly
          for (let i = 0; i < 16; i++) { const an = i / 16 * TAU, rr = e.r * (1.02 + 0.04 * (1 + Math.sin(an * 3 + seed + t * 2))); BX[i] = x + Math.cos(an) * rr; BY[i] = y + Math.sin(an) * rr * 0.78; }
          smoothBlob(c, 16);
          // the dark outer outline: 3 px of '#1a0616' at 0.9 past the rim (a 6 px stroke, its inner half under the fill),
          // so acid and goo read by luminance as well as hue
          { const ga = c.globalAlpha; c.globalAlpha = ga * 0.9; c.strokeStyle = '#1a0616'; c.lineWidth = 6; c.stroke(); c.globalAlpha = ga; }
          c.fill();
          c.beginPath(); c.ellipse(x, y, e.r, e.r / 1.3, 0, 0, TAU);   // the true hitbox
          if (imm) {   // harmless for now: a still grey dash at 0.35
            c.lineWidth = 2.6; c.setLineDash(LD_6_6); c.globalAlpha = 0.35; c.strokeStyle = '#a0a0aa'; c.stroke(); c.setLineDash(NODASH); c.globalAlpha = 1;
          } else if (acid) {   // hazard tape: crawling black and lime dashes, so acid never reads as goo
            c.lineWidth = 2.6; c.setLineDash(LD_6_6); c.lineDashOffset = -t * 14; c.strokeStyle = 'rgba(24,40,0,0.85)'; c.stroke();
            c.lineDashOffset = -t * 14 + 6; c.strokeStyle = '#e6ff4a'; c.stroke(); c.setLineDash(NODASH); c.lineDashOffset = 0;
          } else { c.strokeStyle = hexA(col, 0.75); c.lineWidth = 2.2; c.stroke(); }
          if (e.pulse && e.swellT != null) {   // its rim just swelled over Kevin and spared him: a quick green 'phew' ring
            const E = this.ex(e);
            if (E.swT !== e.swellT) { E.swT = e.swellT; if (!race.demo && !race.over) { this.ring(p.x, p.y, '#7dffb0', 44, 0.35, 4); const PL = K.PHEW_LINES; this.pop(p.x + 34, p.y + 30, (Array.isArray(PL) && PL.length && PL[Math.floor(Math.random() * PL.length)]) || 'phew', '#7dffb0', 13, 0.9); } }
          }
          if (e.pulse && e.r0 > 0) {   // a pulsing puddle: a steady dashed ring at its biggest footprint (r0 * 1.05)
            c.strokeStyle = 'rgba(157,255,60,0.45)'; c.lineWidth = 1.5; c.setLineDash(LD_4_5);
            c.beginPath(); c.ellipse(x, y, e.r0 * 1.05, e.r0 * 1.05 / 1.3, 0, 0, TAU); c.stroke(); c.setLineDash(NODASH);
          }
          c.strokeStyle = HZ_CREAM; c.lineWidth = 1.6; c.beginPath(); c.ellipse(x, y, e.r * 0.86, e.r * 0.67, 0, Math.PI * 1.05, Math.PI * 1.5); c.stroke();   // cream top-left rim
          c.fillStyle = hexA(col, 0.18); c.beginPath(); c.ellipse(x, y + e.r * 0.1, e.r * 0.6, e.r * 0.42, 0, 0, TAU); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x - e.r * 0.35, y - e.r * 0.35, e.r * 0.18, e.r * 0.07, -0.5, 0, TAU); c.fill();
          for (let i = 0; i < 5; i++) {
            const k = (t * (acid ? 0.9 : 0.4) + i / 5 + seed) % 1, bx = x + Math.sin(i * 5 + seed) * e.r * 0.5, by = y + e.r * 0.4 - k * e.r * 0.8, br = 1.8 + 2.4 * (1 - k);
            c.strokeStyle = hexA(col, 0.9 * (1 - k)); c.lineWidth = 1.3; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.stroke();
            if (acid && k > 0.85) { c.fillStyle = 'rgba(220,255,150,0.8)'; star4(c, bx, by - 3, 3); }
          }
          if (!acid) { c.strokeStyle = 'rgba(230,200,255,0.4)'; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i < 3; i++) { const xx = x + (i - 1) * e.r * 0.4, l = 8 + 6 * Math.sin(t * 2 + i + seed); c.moveTo(xx, y + e.r * 0.65); c.lineTo(xx, y + e.r * 0.65 + l); } c.stroke(); }
          if (dropXf) c.restore();
          break; }
        case 'gate': this.drawGate(e, y, t); break;
        case 'cilia': this.drawCilia(e, y, t); break;
        case 'wbc': { this.ex(e).seen = this.frame; WBC_NOW.push(e); const sq = this.impSquash(e, x, y); this.wbcM = sq ? c.getTransform() : null; this.drawWbc(e, x, y, t, p, dt); this.wbcM = null; if (sq) c.restore(); break; }
        case 'current': {
          this.drawCurrent(e, y, t, p);
          break; }
      }
    }
    // (a dead Big Mac the race compacted away the same step still pops: last frame's list is checked too)
    const WP = this._wbcPrev || (this._wbcPrev = []);
    for (const e of WP) if (e.dead && !this.ex(e).corpse) this.addCorpse(e);
    WP.length = 0; for (const e of WBC_NOW) WP.push(e); WBC_NOW.length = 0;
    this.drawCorpses(dt);
  }
  // a dead Big Mac: 0 to 60 ms it swells 1.0 to 1.25, a white silhouette with x x eyes; then it pops into 6 to 8
  // goo chunks, a shock ring out to r * 1.8 and a cream splat that fades over 1.2 s (at most 6, 3 on lite)
  addCorpse(e) {
    const E = this.ex(e); E.corpse = 1; E.deadT = this.time;
    const C = this.corpses || (this.corpses = []), cap = this.lite ? 3 : 6;
    while (C.length >= cap) C.shift();
    const sat = [];
    for (let i = 0; i < 6; i++) sat.push(Math.random() * TAU, 0.9 + Math.random() * 0.6, 0.12 + Math.random() * 0.14);
    C.push({ x: e.x, y: e.y, r: e.r || 24, face: (e.hunt || 0) > 0.5 ? 1 : 0, t: 0, ch: null, sat });
  }
  drawCorpses(dt) {
    const C = this.corpses;
    if (!C || !C.length) return;
    const c = this.ctx, red = this.reduced;
    let n = 0;
    for (const q of C) {
      q.t += dt;
      if (q.t > 1.26) continue;
      C[n++] = q;
      const x = q.x, y = this.sy(q.y), r = q.r;
      if (y < -120 || y > this.H + 120) continue;
      if (q.t < 0.06) {   // the swell: a white silhouette, x x eyes, a wobbly mouth
        const s = r * (1 + 0.25 * (red ? 1 : q.t / 0.06));
        c.beginPath(); c.arc(x, y, s, 0, TAU); c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke(); c.fillStyle = '#ffffff'; c.fill();
        c.strokeStyle = '#4a3050'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath();
        for (let sx = -1; sx <= 1; sx += 2) { const ex = x + sx * s * 0.33, ey = y - s * 0.22, d = s * 0.13; c.moveTo(ex - d, ey - d); c.lineTo(ex + d, ey + d); c.moveTo(ex + d, ey - d); c.lineTo(ex - d, ey + d); }
        c.moveTo(x - s * 0.3, y + s * 0.35); for (let i = 1; i <= 6; i++) c.lineTo(x - s * 0.3 + i * s * 0.1, y + s * 0.35 + (i % 2 ? -2 : 2));
        c.stroke();
        continue;
      }
      const u = q.t - 0.06;
      if (!q.ch) {   // pop: 6 to 8 chunks, 180 to 280 px/s
        q.ch = []; const nc = 6 + Math.floor(Math.random() * 3);
        for (let i = 0; i < nc; i++) { const a = i / nc * TAU + Math.random() * 0.6, v = 180 + Math.random() * 100; q.ch.push(x, y, Math.cos(a) * v, Math.sin(a) * v, 2.5 + Math.random() * 2); }
        q.cy0 = y;
      }
      // the splat decal (world-anchored), fading over 1.2 s
      const sa = 0.55 * clamp(1 - u / 1.2, 0, 1);
      if (sa > 0.01) {
        c.globalAlpha = sa; c.fillStyle = '#fff1d6'; c.beginPath(); c.ellipse(x, y, r * 0.95, r * 0.8, 0, 0, TAU);
        for (let i = 0; i < q.sat.length; i += 3) { const a = q.sat[i], d = r * q.sat[i + 1], rr = r * q.sat[i + 2], px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.8; c.moveTo(px + rr, py); c.arc(px, py, rr, 0, TAU); }
        c.fill();
        c.fillStyle = 'rgba(214,190,150,0.5)'; c.beginPath(); c.ellipse(x + r * 0.15, y + r * 0.12, r * 0.5, r * 0.35, 0, 0, TAU); c.fill();
      }
      // the chunks (life 0.45 s, drag 4 / s), body coloured with an ink rim; they ride the screen with the splat
      if (u < 0.45) {
        const dr = Math.exp(-4 * dt), dy = y - q.cy0, P = q.ch;
        q.cy0 = y;
        c.globalAlpha = 1 - u / 0.45; c.beginPath();
        for (let i = 0; i < P.length; i += 5) {
          P[i] += P[i + 2] * dt; P[i + 1] += P[i + 3] * dt + dy; P[i + 2] *= dr; P[i + 3] *= dr;
          c.moveTo(P[i] + P[i + 4], P[i + 1]); c.arc(P[i], P[i + 1], P[i + 4], 0, TAU);
        }
        c.strokeStyle = HZ_INK; c.lineWidth = 2.5; c.stroke(); c.fillStyle = '#f6f0f8'; c.fill();
      }
      // the shock ring: 2 px, out to r * 1.8 over 0.2 s
      if (u < 0.2) {
        const k = u / 0.2; c.globalAlpha = 1 - k; c.strokeStyle = '#ffffff'; c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, r * (1 + 0.8 * (1 - (1 - k) * (1 - k))), 0, TAU); c.stroke();
      }
      c.globalAlpha = 1;
    }
    C.length = n;
  }
  // a sideways current band (e.y .. e.y + e.h, pushing e.dir): a faint cyan-white band with dashed ends, a solid
  // arrow head on the downstream wall at the entry edge, chevrons sliding across it, and while Kevin is inside,
  // three speed lines streaking past him (reduced motion: all static, no dash crawl)
  drawCurrent(e, y, t, p) {
    const c = this.ctx, y1 = this.sy(e.y + e.h), red = this.reduced, dir = e.dir || 1, L = e.x - e.r, R = e.x + e.r;
    c.fillStyle = 'rgba(220,245,255,0.10)'; this.rrect(L, y1, R - L, Math.max(1, y - y1), 18); c.fill();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.setLineDash(LD_12_9); c.lineDashOffset = red ? 0 : -t * 40 * dir;
    c.strokeStyle = 'rgba(225,248,255,0.55)'; c.lineWidth = 2; c.beginPath(); c.moveTo(L + 8, y); c.lineTo(R - 8, y); c.moveTo(L + 8, y1); c.lineTo(R - 8, y1); c.stroke();
    c.setLineDash(NODASH); c.lineDashOffset = 0;
    // the arrow head: 26 px, on the wall it pushes you toward, where you swim in
    const ax = (dir > 0 ? R : L) - dir * 22, ay = y - 18;
    c.beginPath(); c.moveTo(ax + dir * 13, ay); c.lineTo(ax - dir * 13, ay - 13); c.lineTo(ax - dir * 6, ay); c.lineTo(ax - dir * 13, ay + 13); c.closePath();
    c.strokeStyle = HZ_INK; c.lineWidth = 5; c.globalAlpha = 0.7; c.stroke(); c.globalAlpha = 1;
    c.fillStyle = '#e6f8ff'; c.fill();
    const rows = e.h > 350 ? 7 : 5;
    for (let i = 0; i < rows; i++) {
      const yy = y1 + (i + 0.5) * (y - y1) / rows, k = red ? (i * 0.37 + 0.3) % 1 : ((t * 0.9 * dir + i * 0.27) % 1 + 1) % 1, xx = e.x - e.r + k * e.r * 2;
      const al = Math.sin(k * Math.PI) * 0.65;
      c.strokeStyle = rgbaQ(200, 240, 255, al * 0.4); c.lineWidth = 9;
      c.beginPath(); c.moveTo(xx - 16 * dir, yy - 9); c.lineTo(xx, yy); c.lineTo(xx - 16 * dir, yy + 9); c.stroke();
      c.strokeStyle = rgbaQ(255, 255, 255, al); c.lineWidth = 4; c.stroke();
      c.strokeStyle = rgbaQ(255, 255, 255, al * 0.4); c.lineWidth = 1.5; c.beginPath(); c.moveTo(xx - 70 * dir, yy); c.lineTo(xx - 22 * dir, yy); c.stroke();
    }
    if (p.y > e.y && p.y < e.y + e.h && !this.race.drill) {   // Kevin is in it: the flow streaks past him
      const py = this.sy(p.y);
      c.strokeStyle = 'rgba(235,250,255,0.7)'; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 3; i++) {
        const u = red ? 0.35 + 0.15 * i : ((t * 2.6 + i * 0.37) % 1), sx = p.x - dir * 70 + dir * u * 140, sl = 18 + 10 * Math.sin(u * Math.PI);
        c.moveTo(sx, py - 14 + i * 14); c.lineTo(sx - dir * sl, py - 14 + i * 14);
      }
      c.stroke();
    }
  }
  // Tube Rapids cilia: a fat hair on one wall that swats you aside on the beat.
  // state 0 idles and sways, 1 trembles and glows white (the tell), 2 snaps right across its reach.
  // a hair's clock, read only from core's e.state and e.phase (and e.period): the idle fill 0..1 (the root pie),
  // the tremble's whiteness and the swat's progress. The tell (tremble + swat, 0.8 s) and the swat (0.35 s) are
  // core's lengths today; core may carry its own as e.tellT and e.swatT, and both readers here follow.
  ciliaClock(e) {
    const per = e.period || 2, ph = (e.phase || 0) * per, tell = e.tellT > 0 ? e.tellT : 0.8, swat = e.swatT > 0 ? e.swatT : 0.35;
    const C = this._cc || (this._cc = { st: 0, per: 0, ph: 0, idle: 0, swat: 0, tell: 0 });
    C.st = e.state | 0; C.per = per; C.ph = ph; C.tell = tell; C.swat = swat;
    C.idle = clamp(ph / Math.max(0.1, per - tell), 0, 1);
    return C;
  }
  // the root pie (radius r at x, y): fills over the idle phase, goes solid white for the tremble, flashes on the swat
  // (reduced motion: solid white, no flash)
  ciliaPie(C, x, y, r, wc) {
    const c = this.ctx;
    c.fillStyle = 'rgba(30,0,30,0.45)'; c.beginPath(); c.arc(x, y, r + 1, 0, TAU); c.fill();
    if (C.st === 0) {
      if (C.idle > 0.001) { c.fillStyle = cssQ(lerpC(wc, WHITE, 0.3, SCR)); c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * C.idle); c.closePath(); c.fill(); }
      return 1;
    }
    const fl = C.st === 2 && !this.reduced ? 0.5 + 0.5 * Math.sin(this.time * 40) : 1;
    c.fillStyle = C.st === 2 ? `rgba(255,255,255,${fl})` : '#ffffff'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    return fl;
  }
  // a cilia band's fill: white or the wall colour at q / 32 (soft: at 0.6 of that), cached per wall colour
  cilCss(white, wc, q, soft) {
    const wk = white ? -1 : wallKey(wc), CC = this.cilC || (this.cilC = new Map());
    let A = CC.get(wk);
    if (!A) { if (CC.size > 12) CC.clear(); A = new Array(66); CC.set(wk, A); }
    const i = q * 2 + soft;
    return A[i] || (A[i] = css(white ? WHITE : wc, +(q / 32 * (soft ? 0.6 : 1)).toFixed(4)));
  }
  drawCilia(e, y, t) {
    const c = this.ctx, s = -(e.wall || -1), bx = e.x, R = e.r, C = this.ciliaClock(e), st = C.st, per = C.per, ph = C.ph;
    const red = this.reduced, wc = this.wallC;
    // its reach: a translucent band exactly as tall as core's hit band (e.y +- 26), a solid core and a softer
    // (0.6) outer 10 px on each edge (0.10 at rest, rising through the idle and the tremble toward the swat)
    const bandA = st === 2 ? 0.28 : 0.1 + 0.14 * clamp(ph / Math.max(0.1, per - C.swat), 0, 1), bx0 = s > 0 ? bx : bx - R;
    // (bandA quantised to 1/32: its two fill strings come from a cache, never built a frame)
    const bq = clamp(Math.round(bandA * 32), 0, 32);
    c.fillStyle = this.cilCss(st === 2, wc, bq, 0); this.rrect(bx0, y - 16, R, 32, 10); c.fill();
    c.fillStyle = this.cilCss(st === 2, wc, bq, 1); c.beginPath();
    c.moveTo(bx0 + 6, y - 26); c.lineTo(bx0 + R - 6, y - 26); c.quadraticCurveTo(bx0 + R, y - 26, bx0 + R, y - 20); c.lineTo(bx0 + R, y - 16); c.lineTo(bx0, y - 16); c.lineTo(bx0, y - 20); c.quadraticCurveTo(bx0, y - 26, bx0 + 6, y - 26);
    c.moveTo(bx0, y + 16); c.lineTo(bx0 + R, y + 16); c.lineTo(bx0 + R, y + 20); c.quadraticCurveTo(bx0 + R, y + 26, bx0 + R - 6, y + 26); c.lineTo(bx0 + 6, y + 26); c.quadraticCurveTo(bx0, y + 26, bx0, y + 20); c.closePath();
    c.fill();
    // pose: angle from the wall (0 = straight across, + = combed downstream), length, sway
    const pose = (ang, len, sway) => ({ ang, len, sway, tx: bx + s * len * Math.cos(ang), ty: y + len * Math.sin(ang) + sway });
    let P, white = 0, ghosts = null;
    if (st === 0) P = pose(0.55, R * 0.55, Math.sin((e.phase || 0) * TAU) * 8);
    else if (st === 1) { white = clamp((ph - (per - C.tell)) / Math.max(0.05, C.tell - C.swat), 0, 1); P = pose(0.62 + 0.08 * white, R * (0.55 - 0.05 * white), red ? 0 : Math.sin(t * 30 * TAU) * 4); }
    else {
      const k = clamp((ph - (per - C.swat)) / C.swat, 0, 1), sn = 1 - Math.pow(1 - Math.min(1, k / 0.22), 3), back = k > 0.7 ? (k - 0.7) / 0.3 : 0;
      const f = sn * (1 - back);
      P = pose(0.62 * (1 - f), R * (0.55 + 0.45 * f), 0); white = 1 - back;
      if (!red && k < 0.7) ghosts = [pose(0.62 * (1 - f * 0.45), R * (0.55 + 0.45 * f * 0.45), 0), pose(0.62 * (1 - f * 0.75), R * (0.55 + 0.45 * f * 0.75), 0)];
    }
    const col = css(lerpC(wc, WHITE, white * 0.85, SCR));
    const hair = (q, al, ex = 0) => {
      const cx = bx + s * q.len * 0.45 * Math.cos(q.ang * 0.4), cy = y + q.len * 0.45 * Math.sin(q.ang * 0.4) + q.sway * 0.3;
      let px = bx, py = y; c.globalAlpha = al;
      for (let i = 1; i <= 4; i++) {
        const u = i / 4, v = 1 - u, nx = v * v * bx + 2 * v * u * cx + u * u * q.tx, ny = v * v * y + 2 * v * u * cy + u * u * q.ty;
        c.lineWidth = 10 - 6 * (i - 0.5) / 4 + ex; c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke(); px = nx; py = ny;
      }
    };
    c.lineCap = 'round'; c.strokeStyle = col;
    if (ghosts) { hair(ghosts[1], 0.16); hair(ghosts[0], 0.3); }
    if (white > 0.05) this.dglow('#ffffff', P.tx, P.ty, 14 + 10 * white, 0.55 * white);
    c.strokeStyle = HZ_INK; hair(P, 1, 4);   // the dark outer outline
    c.strokeStyle = col; hair(P, 1); c.globalAlpha = 1;
    // a glossy highlight and a root bulb on the wall
    c.strokeStyle = HZ_CREAM; c.lineWidth = 1.4; c.beginPath(); c.moveTo(bx + s * 4, y - 3); c.quadraticCurveTo(bx + s * P.len * 0.4, y - 3 + P.len * 0.18 * Math.sin(P.ang), P.tx - s * 4, P.ty - 2); c.stroke();
    c.fillStyle = cssQ(wc); c.beginPath(); c.ellipse(bx, y, 6, 9, 0, 0, TAU); c.fill();
    // the timer on the root: a radius-7 pie that fills over the idle phase, goes white for the tremble, flashes on the swat
    const pieX = bx + s * 3, fl = this.ciliaPie(C, pieX, y, 7, wc);
    if (st === 2) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.globalAlpha = 0.6 * fl; c.beginPath(); c.arc(pieX, y, 11, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    if (st === 1) {   // the tell: a little "!" at the tip
      this.dangerBadge(P.tx, P.ty - 17, 0.8);
    }
  }
  // goo walls with gaps (the 'gate' hazard)
  drawGate(e, y, t) {
    const c = this.ctx, ch = chan(e.y, e.side), L = ch.c - ch.h - 10, R = ch.c + ch.h + 10;
    // (reused buffers: the sorted gaps and the slab segments as [a0, b0, a1, b1, ...], no arrays per frame)
    const gaps = this._gGaps || (this._gGaps = []); gaps.length = 0;
    for (let i = 0; i < e.gaps.length; i++) gaps.push(e.gaps[i]);
    if (gaps.length > 1) gaps.sort(numAsc);
    let x0 = L;
    const SG = this._gSeg || (this._gSeg = []); SG.length = 0;
    for (const g of gaps) { SG.push(x0, g - e.gw / 2); x0 = g + e.gw / 2; }
    SG.push(x0, R);
    // goo slabs with lumpy edges and drips (GOD MODE / nitro: faded to 0.35 with gold sparkles, he swims right
    // through; the goo mutation: 0.5 with a little surfboard, he surfs it)
    const gA = this.safeNow ? 0.35 : this.gooSurf ? 0.5 : 1;
    c.lineJoin = 'round'; c.globalAlpha = gA;
    for (let si = 0; si < SG.length; si += 2) {
      const a = SG[si], b = SG[si + 1];
      if (b - a < 2) continue;
      c.beginPath(); c.moveTo(a, y - 10);
      for (let xx = a; xx <= b; xx += 7) c.lineTo(xx, y - 10 + Math.sin(xx / 9 + t * 3) * 2.5);
      c.lineTo(b, y - 10); c.quadraticCurveTo(b + 7, y, b, y + 10);
      for (let xx = b; xx >= a; xx -= 7) c.lineTo(xx, y + 10 + Math.sin(xx / 7 - t * 3) * 2.5);
      c.lineTo(a, y + 10); c.quadraticCurveTo(a - 7, y, a, y - 10);
      // (20 px thick; on the custard Goo a dark ink edge, then the 2 px '#5a3f2a' line at 0.7 just outside the fill)
      c.closePath(); c.strokeStyle = HZ_INK; c.lineWidth = 8; c.stroke();
      c.strokeStyle = GOO_LINE; c.lineWidth = 4; c.stroke();
      c.fillStyle = 'rgba(200,160,255,0.65)'; c.fill(); c.strokeStyle = '#f2e6ff'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(a + 4, y - 4); c.lineTo(b - 4, y - 4); c.stroke();
      // the dripping fingers: a 3 px ink outline at 0.85, the goo fill, a pale inner rim
      const finger = (xx, k, l) => { c.moveTo(xx - 2.5, y + 9); c.quadraticCurveTo(xx, y + 9 + l * 1.3, xx + 2.5, y + 9); c.moveTo(xx + 2 + k, y + 10 + l); c.arc(xx, y + 10 + l, 2 + k, 0, TAU); };
      c.beginPath();
      for (let xx = a + 10; xx < b - 6; xx += 23) { const k = ((t * 0.6 + xx * 0.013) % 1); finger(xx, k, 4 + 14 * k); }
      c.globalAlpha = 0.85 * gA; c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke(); c.globalAlpha = gA;
      c.fillStyle = 'rgba(220,190,255,0.85)'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5; c.stroke();
    }
    c.globalAlpha = 1;
    if (gA < 1) {
      for (let si = 0; si < SG.length; si += 2) {
        const a = SG[si], b = SG[si + 1];
        if (b - a < 24) continue;
        if (this.safeNow) {   // gold sparkles twinkling along the slab
          c.fillStyle = '#ffd75c';
          for (let xx = a + 14, i = 0; xx < b - 8; xx += 34, i++) { const k = this.reduced ? 0.7 : 0.5 + 0.5 * Math.sin(t * 6 + xx * 0.3); if (k > 0.25) star4(c, xx, y - 2 + (i % 2 ? 5 : -4), 2 + 3 * k); }
        } else if (b - a > 40) this.surfGlyph((a + b) / 2, y);
      }
    }
    // a DRIPPER's tell (core: e.drip, e.dripTell counts the DRIP_TELL 0.5 s down, e.dripX is the glob's column): a
    // lilac bead swells on the slab's underside (radius 4 -> DRIP_R * 0.7), wobbling, a faint dashed drop line runs
    // down to where the glob lands (y + 170: DRIP_FALL below the slab) and a ghost of the glob firms up there
    if (e.drip && e.dripTell > 0 && Number.isFinite(e.dripX)) {
      const red = this.reduced, DR = CORE.DRIP_R > 0 ? CORE.DRIP_R : 24, k = clamp(1 - e.dripTell / 0.5, 0, 1), bx = e.dripX;
      const r = 4 + (DR * 0.7 - 4) * k, wob = red ? 0 : Math.sin(t * 26) * 0.12 * k, ly = y + 170, by = y + 9 + r * 0.9;
      c.globalAlpha = 0.25 + 0.45 * k; c.fillStyle = 'rgba(199,155,255,0.35)'; c.strokeStyle = '#d9b8ff'; c.lineWidth = 2;
      c.setLineDash(DASH_FORK); c.lineDashOffset = red ? 0 : -t * 20;
      c.beginPath(); c.ellipse(bx, ly, DR, DR / 1.3, 0, 0, TAU); c.fill(); c.stroke();
      c.globalAlpha = 0.3 + 0.2 * k; c.lineWidth = 1.5; c.beginPath(); c.moveTo(bx, by + r * 1.1); c.lineTo(bx, ly - DR / 1.3 - 3); c.stroke();
      c.setLineDash(NODASH); c.lineDashOffset = 0;
      c.globalAlpha = 1; c.beginPath(); c.ellipse(bx, by, r * (1 + wob), r * (1.12 - wob), 0, 0, TAU);
      c.strokeStyle = HZ_INK; c.lineWidth = 3.5; c.stroke(); c.fillStyle = '#c79bff'; c.fill();
      c.strokeStyle = '#f2e6ff'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(bx - r * 0.35, by - r * 0.3, Math.max(1, r * 0.2), 0, TAU); c.fill();
    }
    // a sliding gate: two faint white ticks on the slab at each gap's travel extremes (g0 +- |slide|, inside lo..hi)
    if (e.slide && e.g0) {
      const sw = Math.abs(e.slide), lo = e.lo != null ? e.lo : -1e9, hi = e.hi != null ? e.hi : 1e9;
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath();
      for (let k = 0; k < e.g0.length; k++) {
        for (let q = 0; q < 2; q++) { const tx = clamp(e.g0[k] + SGN[q] * sw, lo, hi); c.moveTo(tx, y - 7); c.lineTo(tx, y + 7); }
      }
      c.stroke();
    }
    // the gaps glow and point the way; a faint column of light falls 140 units below each one
    if (!this.colG) { this.colG = c.createLinearGradient(0, 0, 0, 140); this.colG.addColorStop(0, 'rgba(255,255,255,0.16)'); this.colG.addColorStop(1, 'rgba(255,255,255,0)'); }
    if (y > (this.padW || 0) - 10 && y < this.H) {
      c.fillStyle = this.colG;
      for (const g of gaps) { const w = e.gw * 0.6; c.translate(g, y + 10); c.fillRect(-w / 2, 0, w, 140); c.translate(-g, -(y + 10)); }
    }
    // a closing gate (e.close): the gap edges wear a pulsing rim that brightens (white to gold) as the gap narrows
    if (e.close) {
      const E = this.ex(e); E.gw0 = Math.max(E.gw0 || 0, e.gw || 0);
      const k = E.gw0 > 0 ? clamp(1 - e.gw / E.gw0, 0, 1) : 0, pul = this.reduced ? 1 : 0.7 + 0.3 * Math.sin(t * (8 + 10 * k));
      c.lineCap = 'round'; c.beginPath();
      for (const g of gaps) for (let q = 0; q < 2; q++) { const s2 = SGN[q], ex = g + s2 * e.gw / 2; c.moveTo(ex, y - 11); c.quadraticCurveTo(ex - s2 * 3, y, ex, y + 11); }
      c.globalAlpha = (0.35 + 0.5 * k) * pul; c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke();
      c.globalAlpha = (0.45 + 0.55 * k) * pul; c.strokeStyle = k > 0.5 ? '#ffd75c' : '#ffffff'; c.lineWidth = 2.5 + 1.5 * k; c.stroke();
      c.globalAlpha = 1;
    }
    for (const g of gaps) {
      this.dglow('#ffffff', g, y, e.gw * 0.55, 0.12 + 0.06 * Math.sin(t * 5));
      c.strokeStyle = '#ffffff'; c.globalAlpha = 0.35 + 0.25 * Math.sin(t * 6); c.lineWidth = 2.5; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) { const yy = y + 34 + k * 12 - ((t * 30) % 12); c.beginPath(); c.moveTo(g - 8, yy + 6); c.lineTo(g, yy); c.lineTo(g + 8, yy + 6); c.stroke(); }
      c.globalAlpha = 1;
      // a closing gate: a 2 px cream tick at the gap's centre on the slab line, the spot it closes onto
      if (e.close) { c.fillStyle = HZ_INK; c.fillRect(g - 2, y - 8, 4, 16); c.fillStyle = '#fff0dc'; c.fillRect(g - 1, y - 7, 2, 14); }
    }
  }
  // a small surfboard (the goo mutation surfs gate slabs): a yellow board with a pink stripe and an ink rim
  surfGlyph(x, y) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(-0.25);
    c.beginPath(); c.ellipse(0, 0, 11, 3.6, 0, 0, TAU);
    c.strokeStyle = HZ_INK; c.lineWidth = 2.4; c.stroke(); c.fillStyle = '#ffd75c'; c.fill();
    c.strokeStyle = '#ff5c8a'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke();
    c.restore();
  }
  // the Lunger's reads (systems: e.crouch counts down from LUNGE_CROUCH s before a lunge, e.lunge is set during it, and
  // e.cool > 0 after one is its stun): a squashed, trembling crouch with an aim line to the target, motion streaks
  // while it flies, dizzy stars while it sulks. The target is e.lunge ({x, y}), else e.tx / e.ty, else Kevin.
  drawWbc(e, x, y, t, p, dt) {
    const c = this.ctx, red = this.reduced, E = this.ex(e), crouch = e.crouch > 0, lunging = !!e.lunge;
    if (lunging) E.lunged = 1; else if (!crouch && !(e.cool > 0)) E.lunged = 0;
    const stun = !lunging && !crouch && E.lunged && e.cool > 0;
    if (!crouch && !lunging && !stun) { this.drawWbcBody(e, x, y, t, p, dt); return; }
    const L = e.lunge && typeof e.lunge === 'object' ? e.lunge : null;
    const tx = L && Number.isFinite(L.x) ? L.x : Number.isFinite(e.tx) ? e.tx : p.x, ty = this.sy(L && Number.isFinite(L.y) ? L.y : Number.isFinite(e.ty) ? e.ty : p.y);
    if (crouch) {   // the aim line: dark under-stroke, danger fill, a ring on the spot
      const k = clamp(1 - e.crouch / (CORE.LUNGE_CROUCH || 0.45), 0, 1), dx = tx - x, dy = ty - y, dl = hyp(dx, dy) || 1, r0 = (e.r || 24) * 1.1;
      c.lineCap = 'round'; c.setLineDash(LD_8_6); c.lineDashOffset = red ? 0 : -t * 60;
      c.beginPath(); c.moveTo(x + dx / dl * r0, y + dy / dl * r0); c.lineTo(tx, ty);
      c.globalAlpha = 0.4 + 0.5 * k; c.strokeStyle = HZ_INK; c.lineWidth = 5; c.stroke();
      c.strokeStyle = this.dangerFill(); c.lineWidth = 2.5; c.stroke(); c.setLineDash(NODASH); c.lineDashOffset = 0;
      c.beginPath(); c.arc(tx, ty, 16 - 6 * k, 0, TAU); c.lineWidth = 2.5; c.stroke();
      c.globalAlpha = 1;
    }
    if (lunging && !red) {   // motion streaks trailing behind it
      let vx = +e.vx || 0, vy = -(+e.vy || 0);
      if (Math.abs(vx) + Math.abs(vy) < 1) { vx = tx - x; vy = ty - y; }
      const vl = hyp(vx, vy) || 1, ux = -vx / vl, uy = -vy / vl, r = e.r || 24;
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath();
      for (let i = -2; i <= 2; i++) { const ox = -uy * i * r * 0.35, oy = ux * i * r * 0.35, l = r * (1.1 + 0.5 * h1(i + 3 + Math.floor(t * 20))); c.moveTo(x + ux * r * 0.9 + ox, y + uy * r * 0.9 + oy); c.lineTo(x + ux * (r * 0.9 + l) + ox, y + uy * (r * 0.9 + l) + oy); }
      c.stroke();
    }
    if (crouch) {   // squashed down (sx 1.15, sy 0.8) and trembling
      const jx = red ? 0 : 1.6 * Math.sin(t * 61), jy = red ? 0 : 1.2 * Math.sin(t * 47 + 1);
      const b0 = this.wbcM || this.wm, M = this.wbcM = xfCompose(this.wbcC || (this.wbcC = {}), b0, x + jx, y + jy + (e.r || 24) * 0.12, 1.15, 0.8, x, y);
      c.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
      this.drawWbcBody(e, x, y, t, p, dt);
      this.wbcM = b0 === this.wm ? null : b0; c.setTransform(b0.a, b0.b, b0.c, b0.d, b0.e, b0.f);
    } else this.drawWbcBody(e, x, y, t, p, dt);
    if (stun) {   // dizzy: three stars circling over it
      const r = e.r || 24; c.fillStyle = '#ffd75c';
      for (let i = 0; i < 3; i++) { const a = (red ? 0 : t * 6) + i * TAU / 3; star4(c, x + Math.cos(a) * r * 0.8, y - r * 1.05 + Math.sin(a) * r * 0.25, 3.6); }
    }
  }
  // Big Mac: a white blood cell with a wobbly membrane, arms that reach for you, and table manners to match
  drawWbcBody(e, x, y, t, p, dt) {
    const c = this.ctx, hunt = e.hunt || 0, ph = e.ph || 0;
    let st = this.wbcState.get(e); if (!st) { st = { eating: 0, burp: 0, full: 0, tail: 0, alert: 0, bang: 0, spotT: 0, lgK: NaN, lg0: NaN, sulkT: -9 }; this.wbcState.set(e, st); }
    const spot = (e.spot || 0) > 0;
    // a dozing POPCORN cell (e.popcorn: it never hunts, a dash pops it) and a standing lunger each get their own look.
    // Only a lunger that WILL still pounce (lunged 0) wears the lunger look and stance; one that went off (crouching,
    // flying) keeps the look through it; a spent one (lunged 1 with no crouch: Kevin slipped past its window, or
    // lunged 2) looks like any Big Mac, so orange always means 'will pounce'
    const pc = !!e.popcorn && !e.dead, ready = !pc && !!e.lunger && !e.lunged, lg = ready || (!pc && !!e.lunger && (e.crouch > 0 || !!e.lunge));
    if (!pc && e.lunger) {
      // the haunches (lgK 1 while ready) ease back to the plain body over 0.2 s once it is spent without crouching, with
      // a small grey '...' sulk puff on that 0 -> 1 flip (a crouch takes the squash over itself: no ease, no puff)
      const lv = e.lunged | 0;
      if (st.lgK !== st.lgK) st.lgK = ready ? 1 : 0;
      if (st.lg0 === 0 && lv === 1 && !(e.crouch > 0) && !e.lunge && !e.dead) { st.sulkT = t; this.sulkPuff(e); }
      st.lg0 = lv;
      st.lgK = ready ? 1 : e.crouch > 0 || e.lunge ? 0 : Math.max(0, st.lgK - dt / 0.2);
    }
    if (st.k0 == null) st.k0 = ph;   // e.ph runs with time: a fixed per-cell seed for the kernels and the 'z' stagger
    if (pc) st.grump = Math.abs(+e.vx || 0) > 20 ? 0.6 : Math.max(0, (st.grump || 0) - dt);
    st.spotT = spot ? Math.min(0.35, st.spotT + dt) : Math.max(0, st.spotT - dt * 2);
    const py = this.sy(p.y), ang = Math.atan2(py - y, p.x - x), scared = !pc && !!this.safeNow;
    // its sight: a dashed 120-degree arc facing you while it has not locked on and is up to 600 ahead (louder
    // while teaching); when it spots you (e.spot) the arc turns red
    const ahead = e.y - p.y;
    if (!pc && !scared && ((hunt < 0.5 && ahead > -40 && ahead < 600) || st.spotT > 0)) {
      const R0 = e.sight || 440;
      if (hunt < 0.5) {   // spotted: the zone's danger colour (gold in the Sea and the Egg) over an ink under-stroke
        // one baked 120-degree arc sprite (dashed at full quality, solid on lite and stage 1), turned to face Kevin
        const plain = this.lite || this.q === 0, spr = this.sightSpr(spot ? (this.dangerFill() === '#ffd75c' ? 2 : 1) : 0, plain), k = R0 / SIGHT_R;
        const m = this.wbcM || this.wm;
        c.globalAlpha = spot ? 1 : this.teach ? 0.22 : 0.15;
        setXf(c, m, x, y, ang, k, k); c.drawImage(spr.cv, spr.x0, spr.y0, spr.w, spr.h);
        c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      }
      c.globalAlpha = 1;
    }
    // hunting: a pulsing white ring at the near-miss radius (e.r + 26); it flashes gold for 0.25 s when a dodge pays,
    // and stays gold while Kevin is inside it (the near miss shows as it happens)
    if (hunt > 0.5 && !pc) {
      // (mint, never gold: in the Sea gold means danger, mint means 'got away with it')
      const gE = this.ex(e), inRing = hyp(p.x - e.x, p.y - e.y) < e.r + 26, gold = inRing || (gE.goldT != null && t - gE.goldT < 0.25);
      c.globalAlpha = gold ? 0.6 : this.reduced ? 0.25 : 0.25 * (0.7 + 0.3 * Math.sin(t * 7)); c.strokeStyle = gold ? NEAR_MINT : '#ffffff'; c.lineWidth = gold ? 3 : 2;
      c.beginPath(); c.arc(x, y, e.r + 26, 0, TAU); c.stroke(); c.globalAlpha = 1;
    }
    if (e.eat > 0) { if (!st.eating) { st.eating = 1; st.tail = 1.1; } st.full = 1; }
    else if (st.eating) {
      st.eating = 0; st.burp = 0.7;
      this.pop(e.x + 10, e.y + e.r + 12, ['burp', 'BURP', 'urp', 'yum'][Math.floor(Math.random() * 4)], '#eaffc0', 12, 0.9);
      for (let i = 0; i < 4; i++) this.addP(4, e.x + (Math.random() - 0.5) * 10, e.y + e.r * 0.4, (Math.random() - 0.5) * 40, 40 + Math.random() * 50, 0.8, '#eaffc0', 2 + Math.random() * 3);
    }
    if (hunt > 0.5 && !st.alert) { st.alert = 1; st.bang = 0.3; } else if (hunt < 0.3) st.alert = 0;
    st.full = Math.max(0, st.full - dt * 0.3); st.burp = Math.max(0, st.burp - dt); st.tail = Math.max(0, st.tail - dt); st.bang = Math.max(0, st.bang - dt);
    const chomp = e.eat > 0 ? 0.5 + 0.5 * Math.sin(t * 40) : 0;
    const r = e.r * (1 + 0.06 * Math.sin(ph * 5) + 0.12 * st.full + 0.08 * Math.sin(st.burp * 20) * st.burp);
    // the wind-up after it spots you: a red ring closing in from r + 70 to r + 12 ('when the eyes go wide')
    const wind = spot && hunt < 0.5 ? clamp(st.spotT / 0.35, 0, 1) : 0;
    if (wind > 0) {
      const wr = e.r + 70 - 58 * (this.reduced ? 1 : wind * (2 - wind));
      const ww = wind > 0.5 ? 4 : 3;
      c.globalAlpha = 0.45 + 0.5 * wind; c.beginPath(); c.arc(x, y, wr, 0, TAU);
      c.strokeStyle = HZ_INK; c.lineWidth = ww + 3; c.stroke(); c.strokeStyle = this.dangerFill(); c.lineWidth = ww; c.stroke(); c.globalAlpha = 1;
    }
    // it has seen you: a dashed line of intent
    if (hunt > 0.5) {
      c.setLineDash(LD_5_6); c.lineDashOffset = this.reduced ? 0 : -t * 30;
      c.beginPath(); c.moveTo(x + Math.cos(ang) * r * 1.1, y + Math.sin(ang) * r * 1.1); c.lineTo(p.x - Math.cos(ang) * 14, py - Math.sin(ang) * 14);
      c.globalAlpha = 0.3 + 0.3 * hunt; c.strokeStyle = HZ_INK; c.lineWidth = 3; c.stroke();
      c.strokeStyle = this.dangerFill(); c.lineWidth = 1.6; c.stroke(); c.globalAlpha = 1;
      c.setLineDash(NODASH); c.lineDashOffset = 0;
    }
    this.dglow(pc ? '#fff2b0' : lg ? '#ffc08a' : hunt > 0.5 ? '#ff9ab4' : '#f4eef7', x, y, r + 22, 0.28 + 0.15 * hunt);
    // a standing lunger: squashed low and wide (1.15 x 0.88) on its haunches (the crouch squashes it further itself);
    // lgK eases it back to 1 x 1 once it is spent
    const hk = !pc && e.lunger && !(e.crouch > 0) && !e.lunge ? st.lgK : 0, lsq = hk > 0.001;
    const m0 = this.wbcM || this.wm, m = lsq ? xfCompose(this.wbcL || (this.wbcL = {}), m0, x, y + r * 0.08 * hk, 1 + 0.15 * hk, 1 - 0.12 * hk, x, y) : m0;
    if (lsq) c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    // pseudopod arms reaching for you while it hunts: two lobes in one path (ink stroke + fill), under the body
    const reach = hunt * (0.55 + 0.15 * (this.reduced ? 0 : Math.sin(t * 7)));
    if (reach > 0.05) {
      c.beginPath();
      for (let k = -1; k <= 1; k += 2) {
        const aa = ang + k * 0.75, L = r * (0.55 + 0.55 * reach), ax = x + Math.cos(aa) * L, ay = y + Math.sin(aa) * L;
        c.moveTo(ax + Math.cos(aa) * r * 0.5, ay + Math.sin(aa) * r * 0.5); c.ellipse(ax, ay, r * 0.5, r * 0.22, aa, 0, TAU);
      }
      c.strokeStyle = HZ_INK; c.lineWidth = 5; c.stroke(); c.fillStyle = '#f6f0f8'; c.fill();
    }
    // the membrane, rim, nucleus and kernels: one baked sprite per look (calm, hunting, popcorn, lunger) and wobble
    // phase (3, boiling at 5 Hz; popcorn dozes on one), scaled to r with the cell's pulse
    {
      const kind = pc ? 2 : lg ? 3 : hunt > 0.5 ? 1 : 0;
      const phI = pc ? ((st.k0 * 7) | 0) % 3 : this.reduced ? 0 : (Math.floor(t * 5 + st.k0 * 3) % 3 + 3) % 3;
      const spr = this.wbcSpr(kind, phI), k = r / WBC_RB;
      setXf(c, m, x, y, 0, k, k); c.drawImage(spr, -WBC_HS, -WBC_HS, WBC_HS * 2, WBC_HS * 2);
      c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    }
    this.drawPoppable(e, x, y, r, t, p);
    // eyes that follow you, angry brows when it is hunting
    const blink = ((t + ph) % 3.7) < 0.1 && hunt < 0.5 && !spot;
    const doze = pc && !(st.grump > 0), grump = pc && st.grump > 0;
    for (let sx = -1; sx <= 1; sx += 2) {
      const ex = x + sx * r * 0.33, ey = y - r * 0.25, er = r * (wind > 0 ? 0.3 + 0.05 * wind : spot ? 0.3 : 0.24);
      if (scared) {   // GOD MODE or nitro: wide eyes, tiny pupils on Kevin, worried brows
        const wr = r * 0.34, pr = r * 0.055;
        c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, wr, 0, TAU); c.fill(); c.strokeStyle = '#4a3050'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = '#1a0a1a'; c.beginPath(); c.arc(ex + Math.cos(ang) * wr * 0.35, ey + Math.sin(ang) * wr * 0.35, pr, 0, TAU); c.fill();
        c.strokeStyle = '#4a3050'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(ex - sx * wr * 0.8, ey - wr * 1.65); c.lineTo(ex + sx * wr * 0.95, ey - wr * 1.2); c.stroke();
        continue;
      }
      if (doze) {   // fast asleep: two 3 px closed-eye arcs
        c.strokeStyle = '#4a3050'; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.arc(ex, ey - er * 0.3, er * 0.7, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
        continue;
      }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill(); c.strokeStyle = '#4a3050'; c.lineWidth = 1.2; c.stroke();
      if (grump || lg) {   // a heavy lid over the top of the eye: grumpy (woken popcorn) or narrowed (a lunger sizing you up)
        const pr = r * 0.09, lk = grump ? 0.15 : 0.05;
        c.fillStyle = '#1a0a1a'; c.beginPath(); c.arc(ex + Math.cos(ang) * er * 0.4, ey + er * 0.25 + Math.sin(ang) * er * 0.2, pr, 0, TAU); c.fill();
        c.fillStyle = pc ? '#fff2b0' : '#f6f0f8'; c.beginPath(); c.moveTo(ex - er * 1.1, ey - er * 1.1); c.lineTo(ex + er * 1.1, ey - er * 1.1);
        c.lineTo(ex + er * 1.1, ey - sx * er * lk * 2 - er * 0.05); c.lineTo(ex - er * 1.1, ey + sx * er * lk * 2 - er * 0.05); c.closePath(); c.fill();
        c.strokeStyle = lg ? '#c0561a' : '#4a3050'; c.lineWidth = 2.4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(ex - er * 1.05, ey + sx * er * lk * 2 - er * 0.05); c.lineTo(ex + er * 1.05, ey - sx * er * lk * 2 - er * 0.05); c.stroke();
        continue;
      }
      if (blink) { c.strokeStyle = '#4a3050'; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - er, ey); c.lineTo(ex + er, ey); c.stroke(); }
      else {
        const pr = r * (wind > 0 ? 0.06 : spot ? 0.075 : 0.1 + 0.03 * hunt);
        c.fillStyle = '#1a0a1a'; c.beginPath(); c.arc(ex + Math.cos(ang) * er * 0.42, ey + Math.sin(ang) * er * 0.42, pr, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + Math.cos(ang) * er * 0.42 - pr * 0.35, ey + Math.sin(ang) * er * 0.42 - pr * 0.4, pr * 0.35, 0, TAU); c.fill();
      }
      if (hunt > 0.35) { c.strokeStyle = '#4a3050'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(ex - sx * er * 0.9, ey - er * (0.95 + 0.3 * (1 - hunt))); c.lineTo(ex + sx * er * 1.1, ey - er * 1.6); c.stroke(); }
    }
    // mouth: drooly when hunting, chomping when eating, a little tail sticking out after
    const mo = scared ? 0 : hunt * 0.25 + chomp * 0.2, my = y + r * 0.38;
    c.fillStyle = '#5a1030'; c.beginPath();
    if (scared) c.ellipse(x, my + r * 0.04, r * 0.13, r * 0.17, 0, 0, TAU); else c.ellipse(x, my, r * 0.42, r * (0.05 + mo), 0, 0, TAU);
    c.fill();
    if (scared) {   // and a sweat drop sliding down its side
      const d = this.reduced ? 0.3 : (t * 0.9 + ph) % 1, sx0 = x + r * 0.78, sy0 = y - r * 0.55 + d * r * 0.35;
      c.fillStyle = '#9ae2ff'; c.strokeStyle = HZ_INK; c.lineWidth = 1;
      c.beginPath(); c.moveTo(sx0, sy0 - r * 0.16); c.quadraticCurveTo(sx0 + r * 0.1, sy0, sx0, sy0 + r * 0.07); c.quadraticCurveTo(sx0 - r * 0.1, sy0, sx0, sy0 - r * 0.16); c.fill(); c.stroke();
    }
    if (mo > 0.12) {
      c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(x, my + r * mo * 0.5, r * 0.22, r * mo * 0.4, 0, 0, TAU); c.fill();
      c.fillStyle = '#fff';
      for (let i = -2; i <= 2; i++) { const tx = x + i * r * 0.15; c.beginPath(); c.moveTo(tx - 3, my - r * mo * 0.8); c.lineTo(tx + 3, my - r * mo * 0.8); c.lineTo(tx, my - r * mo * 0.3); c.fill(); }
      if (hunt > 0.8) { const d = (t * 1.5 + ph) % 1; c.fillStyle = 'rgba(200,240,255,0.8)'; c.beginPath(); c.ellipse(x + r * 0.25, my + r * mo + d * 10, 1.6, 2.4 + d * 2, 0, 0, TAU); c.fill(); }
    }
    if (st.tail > 0) {
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = st.riv ? 2.4 : 1.8; c.lineCap = 'round'; c.beginPath();
      const tx = x + r * 0.15, ty = my + 1, wig = this.reduced ? 0.4 : 1; c.moveTo(tx, ty);
      for (let i = 1; i <= 5; i++) c.lineTo(tx + i * 3, ty + i * 2.5 + Math.sin(t * 30 + i) * 2.5 * i / 5 * wig);
      c.stroke();
      if (st.riv) {   // a swallowed rival: the tail's last two segments in its colour, its item poking out of the mouth
        c.strokeStyle = st.riv.col; c.beginPath(); c.moveTo(tx + 9, ty + 7.5 + Math.sin(t * 30 + 3) * 1.5 * wig);
        for (let i = 4; i <= 5; i++) c.lineTo(tx + i * 3, ty + i * 2.5 + Math.sin(t * 30 + i) * 2.5 * i / 5 * wig);
        c.stroke();
        this.rivalItem(st.riv.item, x - r * 0.2, my - 2 + (this.reduced ? 0 : Math.sin(t * 9) * 1.2), -0.35 + (this.reduced ? 0 : Math.sin(t * 5) * 0.12), 1.1);
      }
    }
    if (st.riv && st.tail <= 0) {   // out it comes: a burp, the item spins away, the ghost rises from the Mac
      const R = st.riv; st.riv = null; st.burp = 0.7;
      const s0 = Math.random() < 0.5 ? -1 : 1;
      this.addP(2, e.x, e.y + r * 0.3, s0 * (50 + Math.random() * 40), 160 + Math.random() * 60, 0.6, RIVAL_ITEM_COL[R.item] || '#ffd75c', 10, 220, Math.random() * TAU, s0 * 14);
      this.pop(e.x + 10, e.y + r + 12, 'BURP', '#eaffc0', 13, 0.9);
      this.rivalGhost(R.a, { x: e.x, y: e.y + r * 0.4 });
    }
    if (st.full > 0.2) { c.strokeStyle = rgbaQ(150, 100, 200, st.full * 0.5); c.lineWidth = 1.2; c.beginPath(); c.arc(x, y + r * 0.62, r * 0.18, 0.2, Math.PI - 0.2); c.stroke(); }
    // the "!" when it spots you
    if (st.bang > 0) {
      const k = 1 - st.bang / 0.3, sc = backOut(Math.min(1, k / 0.6)), bx = x + r * 0.85, by = y - r * 1.15;
      c.save(); c.translate(bx, by); c.scale(sc, sc);
      c.fillStyle = '#2a0a24'; c.beginPath(); c.moveTo(-5, 7); c.lineTo(-10, 14); c.lineTo(2, 9.5); c.fill();   // its speech tail
      c.fillStyle = '#fff4f8'; c.beginPath(); c.moveTo(-4, 7); c.lineTo(-8, 12); c.lineTo(1, 9); c.fill();
      this.dangerBadge(0, 0, 1);
      c.restore();
    }
    if (this.isImp(e)) {   // impact frame: the whole cell goes white
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x, y, r * 1.1, r * 1.06, 0, 0, TAU); c.fill();
    } else if (this.impRing(e)) {   // (no flashes / reduced motion: a white outline ring instead)
      c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y, r * 1.1 + 3, r * 1.06 + 3, 0, 0, TAU); c.stroke();
    }
    if (lsq) c.setTransform(m0.a, m0.b, m0.c, m0.d, m0.e, m0.f);
    {   // the spent Lunger's sulk: a small grey '...' bubble off its top right, drifting up 8 px and fading over 0.9 s
      const u = (t - st.sulkT) / 0.9;
      if (u >= 0 && u < 1) {
        const sp = this.text('...', '#d8d0de', this.fpx(13), 'label', true);
        if (sp) { c.globalAlpha = Math.min(1, (1 - u) * 3); c.drawImage(sp.cv, x + r * 0.7 - sp.w / 2, y - r * 1.05 - (this.reduced ? 0 : 8 * u) - sp.h / 2, sp.w, sp.h); c.globalAlpha = 1; }
      }
    }
    if (doze) {   // a little 'z' drifting up 18 px every 1.2 s (staggered by e.ph; parked for reduced motion)
      const zs = this.text('z', '#fff4e2', this.fpx(11)), u = this.reduced ? 0.5 : ((t + st.k0 * 0.37) % 1.2) / 1.2;
      c.globalAlpha = this.reduced ? 0.85 : Math.sin(Math.PI * u);
      c.drawImage(zs.cv, x + r * 0.55 + 4 * u - zs.w / 2, y - r * 0.95 - 18 * u - zs.h / 2, zs.w, zs.h);
      c.globalAlpha = 1;
    }
  }
  // a spent Lunger's sulk: two grey puffs off its top (none for reduced motion or lite); its '...' bubble rides on
  // the cell itself for 0.9 s (drawWbcBody, st.sulkT)
  sulkPuff(e) {
    const r = e.r || 24;
    if (this.reduced || this.lite) return;
    for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; this.addP(4, e.x + s * r * 0.5, e.y + r * 0.7, s * (14 + Math.random() * 12), 26 + Math.random() * 16, 0.6, '#b8b0c0', 2.6 + Math.random() * 1.4); }
  }
  // the lethal decision, readable: while a dash is ready (no cooldown, more GAS than a dash costs) a Big Macro 0 to 500
  // ahead wears a small white crack badge at the top right of its membrane (3 ink-under-stroked lines at 0.8,
  // pulsing at 1.2 Hz, still for reduced motion) and a dotted white outline at e.r + 4: 'a dash pops this'. Both
  // hide while the dash cools down; during a dash the cracks widen on the cells within e.r + DASH_GRAZE of Kevin.
  drawPoppable(e, x, y, r, t, p) {
    const race = this.race, S = race && race.s;
    if (!S || race.demo || race.over || e.dead) return;
    const ahead = e.y - p.y, dashing = p.dashT > 0;
    const near = dashing && hyp(p.x - e.x, p.y - e.y) < e.r + DASH_GRAZE_R;
    if (!near && !(p.dashCd <= 0 && p.e > S.dashCost && ahead >= 0 && ahead <= 500)) return;
    const c = this.ctx, red = this.reduced, al = 0.8 * (red ? 1 : 0.8 + 0.2 * Math.sin(t * TAU * 1.2));
    if (!near) {   // the dotted outline
      c.globalAlpha = al; c.strokeStyle = '#ffffff'; c.lineWidth = 2.2; c.lineCap = 'round'; c.setLineDash(DOT_POP); c.lineDashOffset = 0;
      c.beginPath(); c.arc(x, y, e.r + 4, 0, TAU); c.stroke(); c.setLineDash(NODASH);
    }
    // the crack: three lines from one point on the membrane's top right (wider while a dash is grazing it)
    const w = near ? 2.2 : 1.3, cx = x + r * 0.62, cy = y - r * 0.62;
    c.globalAlpha = near ? 0.95 : al; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      c.strokeStyle = pass ? '#ffffff' : HZ_INK; c.lineWidth = (pass ? 1.6 : 3.6) * (near ? 1.35 : 1); c.beginPath();
      c.moveTo(cx, cy); c.lineTo(cx + 3 * w, cy - 6 * w); c.lineTo(cx + 1 * w, cy - 10 * w);
      c.moveTo(cx, cy); c.lineTo(cx + 7 * w, cy - 2 * w); c.lineTo(cx + 10 * w, cy - 4.5 * w);
      c.moveTo(cx, cy); c.lineTo(cx - 3 * w, cy - 5 * w);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  // a baked Big Macro body (kind 0 calm, 1 hunting, 2 popcorn, 3 lunger; wobble phase 0..2) at radius WBC_RB, 2.5x
  wbcSpr(kind, ph) {
    const L = this.wbcSprs || (this.wbcSprs = []), i = kind * 3 + ph;
    return L[i] || (L[i] = paintWbc(kind, ph));
  }
  // the sight arc (col 0 white, 1 red, 2 gold; plain: no dash), a 120-degree arc of radius SIGHT_R facing +x
  sightSpr(col, plain) {
    const L = this.sightSprs || (this.sightSprs = []), i = col * 2 + (plain ? 1 : 0);
    return L[i] || (L[i] = paintSight(col, plain));
  }
  // the danger badge every '!' wears (a rival's tell, a Big Macro spotting you, a hair about to swat, the chevrons):
  // a cream #fff4f8 disc (radius 11) in a 2.5 px #2a0a24 ring, the '!' in #ff1f4a with a 2 px dark stroke. It reads
  // on every zone (the reds of the Great Womb Sea and the Egg included) and for protan and deutan eyes, since it is
  // light-on-dark, not red-on-red. Baked once; sc scales it round (x, y).
  dangerBadge(x, y, sc = 1) {
    if (!this.bangSpr) {
      const K = 3, S = 28, cv = mk(S * K, S * K), g = cv.getContext('2d');
      g.setTransform(K, 0, 0, K, S * K / 2, S * K / 2);
      g.fillStyle = '#fff4f8'; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill();
      g.strokeStyle = '#2a0a24'; g.lineWidth = 2.5; g.stroke();
      g.font = `900 17px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = 4; g.strokeStyle = '#2a0a24'; g.strokeText('!', 0, 1);   // 2 px each side of the glyph
      g.fillStyle = '#ff1f4a'; g.fillText('!', 0, 1);
      this.bangSpr = cv;
    }
    this.ctx.drawImage(this.bangSpr, x - 14 * sc, y - 14 * sc, 28 * sc, 28 * sc);
  }
  // a warning chevron's fill: red, but gold where the zone itself is red or pink (the Great Womb Sea, the Egg)
  dangerFill() { const z = ZONES[this.zi | 0]; return z && (z.id === 'sea' || z.id === 'egg') ? '#ffd75c' : '#ff3d5a'; }
  // threats just above the visible band (under the top HUD, R.padTop): a lilac strip with bright notches at the
  // gaps of the next goo gate, and red chevrons for every Big Mac (and acid or goo in your lane) coming down
  drawWarnings(race) {
    const c = this.ctx, padW = this.padW || 0, top = this.camY + this.H - padW, t = this.time, red = this.reduced, p = race.p;
    const hb = race.demo || race.over ? 0 : this.hudB(), WP = this._wgP || (this._wgP = []), WG = this._wg || (this._wg = []);
    WG.length = 0;
    for (const e of race.ents) {
      if (e.dead) continue;
      const d = e.y - top;
      if (e.t === 'gate') {
        if (d <= 0 || d >= 650 || (e.side && p.side && e.side !== p.side)) continue;
        const k = 1 - d / 650, ch = chan(top, e.side || 0), L = Math.max(0, ch.c - ch.h), R = Math.min(VIEW_W, ch.c + ch.h);
        c.globalAlpha = 0.35 + 0.5 * k; c.fillStyle = 'rgb(200,160,255)'; c.fillRect(L, padW, R - L, 6); c.globalAlpha = 1;
        const pul = red ? 1 : 0.75 + 0.25 * Math.sin(t * 6 * TAU), sc = 0.8 + 0.3 * k;
        c.globalAlpha = pul; c.fillStyle = '#ffffff';
        // (the live gaps, as wide as core lets you through: gw - 12, never drawn wider than that)
        const sk = Math.min(1, sc);
        for (const g of e.gaps) { const w = Math.max(4, (e.gw - 12) * sk); this.rrect(g - w / 2, padW - 1, w, 8, 4); c.fill(); }
        c.globalAlpha = 1;
        if (e.close && e.gw0 > 0) {   // a closing gate: a dashed inner bracket at the narrowest it gets
          const wb = Math.max(4, (Math.max(CLOSE_MIN_R, e.gw0 - CLOSE_BY_R) - 12) * sk);
          c.strokeStyle = '#2a0a24'; c.lineWidth = 1.5; c.setLineDash(DASH_BRK); c.beginPath();
          for (const g of e.gaps) {
            const a0 = g - wb / 2, a1 = g + wb / 2;
            c.moveTo(a0 + 3, padW - 1); c.lineTo(a0, padW - 1); c.lineTo(a0, padW + 7); c.lineTo(a0 + 3, padW + 7);
            c.moveTo(a1 - 3, padW - 1); c.lineTo(a1, padW - 1); c.lineTo(a1, padW + 7); c.lineTo(a1 - 3, padW + 7);
          }
          c.stroke(); c.setLineDash(DASH_NONE);
        }
        if (e.close) { c.fillStyle = '#2a0a24'; for (const g of e.gaps) c.fillRect(g - 1, padW - 1, 2, 8); }   // (the centre it closes onto, as on the slab)
        if (e.slide && e.g0) {   // a sliding gate: a 2 px track under each notch spanning its sway
          const sw = Math.abs(e.slide), lo = e.lo != null ? e.lo : 0, hi = e.hi != null ? e.hi : VIEW_W;
          c.fillStyle = 'rgba(255,255,255,0.55)';
          for (const g0 of e.g0) { const a0 = clamp(g0 - sw, lo, hi), a1 = clamp(g0 + sw, lo, hi); c.fillRect(a0, padW + 8, Math.max(2, a1 - a0), 2); }
        }
        continue;
      }
      if (e.t === 'current') {   // a current 0 to 650 ahead: a pale cyan strip across its width, three chevrons
        // crawling toward the wall it pushes you to (static for reduced motion)
        if (d <= 0 || d >= 650) continue;
        const k = 1 - d / 650, dir = e.dir < 0 ? -1 : 1, L = clamp(e.x - e.r, 0, VIEW_W), R = clamp(e.x + e.r, 0, VIEW_W);
        if (R - L < 12) continue;
        c.globalAlpha = 0.3 + 0.45 * k; c.fillStyle = '#bff3ff'; c.fillRect(L, padW, R - L, 6);
        c.strokeStyle = HZ_INK; c.lineWidth = 1; c.strokeRect(L + 0.5, padW + 0.5, R - L - 1, 5);
        const span = R - L, cy = padW + 3, off = red ? 0.5 : (t * 0.9) % 1;
        c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
        for (let i = 0; i < 3; i++) {
          const u = (i / 3 + off / 3) % 1, cx = dir > 0 ? L + span * (0.2 + 0.6 * u) : R - span * (0.2 + 0.6 * u);
          c.moveTo(cx - dir * 5, cy - 5); c.lineTo(cx + dir * 5, cy); c.lineTo(cx - dir * 5, cy + 5);
        }
        c.strokeStyle = HZ_INK; c.lineWidth = 4; c.stroke();
        c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
        c.globalAlpha = 1;
        continue;
      }
      if (e.t === 'cilia') {   // a wall hair 0 to 700 ahead on Kevin's side: a notch as wide as its reach, on its wall,
        // with a tiny copy of its root pie (the swat's countdown reads before the hair is on screen)
        if (d < 0 || d > 700) continue;
        const ch = chan(e.y, p.side || 0);
        if (Math.abs(e.x - ch.c) > ch.h + 30) continue;   // a hair in the other tube
        const k = 1 - d / 700, wl = e.wall < 0 ? -1 : 1, xa = e.x - wl * e.r, x0 = clamp(Math.min(e.x, xa), 0, VIEW_W), x1 = clamp(Math.max(e.x, xa), 0, VIEW_W);
        if (x1 - x0 < 2) continue;
        c.globalAlpha = 0.45 + 0.5 * k; c.fillStyle = this.wallCss(); this.rrect(x0, padW - 1, x1 - x0, 8, 4); c.fill();
        c.globalAlpha = 1; c.strokeStyle = HZ_INK; c.lineWidth = 1.2; c.stroke();
        this.ciliaPie(this.ciliaClock(e), clamp(e.x - wl * 10, 10, VIEW_W - 10), padW + 14, 5, this.wallC);
        continue;
      }
      const wbc = e.t === 'wbc', blob = e.t === 'acid' || e.t === 'goo';
      if (!wbc && !blob) continue;
      // a hostile still under the HUD (on screen, but above hudB) keeps its chevron, pinned 6 px under the HUD
      const esy = this.sy(e.y), under = d < 0 && hb > padW + 1 && esy < hb && esy > padW - (e.r || 20);
      if (!under && (d < 0 || d > 700)) continue;
      const cy0 = under ? hb + 6 : padW + 14, k = under ? 1 : 1 - d / 700;
      let cy = cy0;
      if (wbc && e.popcorn) {   // a dozing POPCORN cell is no threat (a plain touch is a harmless boop): a small gold chevron (0.8) with a DASH label, steady
        // the icon (cy - 14 to cy + 5 with its ink) never sits behind a live banner (Coach's strip): within 6 px of
        // bannerBox it drops to bannerBox.y1 + 6, or sits the frame out when that would leave the screen
        // (chevClear: the banner box and Coach's own strip box, as the edge chevrons do; hazards get theirs from the
        // body.threat class, which drops #coach below their row, but a dozing cell never sets it)
        cy = this.chevClear(cy, 14, 30, hb);
        if (cy !== cy) continue;
        const x = clamp(e.x, 16, VIEW_W - 16), ps = this.text('DASH', '#ffd75c', this.fpx(11));
        c.save(); c.translate(x, cy); c.scale(0.8, 0.8); c.lineJoin = 'round';
        c.beginPath(); c.moveTo(0, -12); c.lineTo(12, 1); c.lineTo(5.5, 1); c.lineTo(0, -4.5); c.lineTo(-5.5, 1); c.lineTo(-12, 1); c.closePath();
        c.strokeStyle = HZ_INK; c.lineWidth = 9 / 0.8; c.stroke(); c.strokeStyle = '#fff4f8'; c.lineWidth = 3 / 0.8; c.stroke(); c.fillStyle = '#ffd75c'; c.fill();
        c.restore();
        // its DASH label clears the HUD and a live banner (Coach's tip strip) the way the signs do, or waits
        const lx = this.labX(x, ps.w), ltop = this.clearTop(cy + 10 - ps.h / 2, ps.h, lx, ps.w);
        if (ltop != null) { c.drawImage(ps.cv, lx - ps.w / 2, ltop, ps.w, ps.h); this.signBoxes.push(lx, ltop, ps.w, ps.h); }   // a neighbour's label then waits instead of overprinting it
        continue;
      }
      if (blob && e.t === 'acid' && this.acidImm) continue;   // (HYPER FRENZY: acid cannot touch him)
      if (blob) {   // only the pools in your lane, with hysteresis (on within r + 70, off past r + 110, a 0.15 s fade)
        const E = this.ex(e), dx = Math.abs(e.x - p.x), fdt = E.wT < 0 ? 0 : clamp(t - E.wT, 0, 0.1);
        E.wT = t;
        if (dx < e.r + 70) E.wOn = true; else if (dx > e.r + 110) E.wOn = false;
        E.wA = clamp(E.wA + (E.wOn ? 1 : -1) * (fdt > 0 ? fdt : 1 / 60) / 0.15, 0, 1);
        if (E.wA <= 0) continue;
        this.warnChev(e, clamp(e.x, 16, VIEW_W - 16), cy, k, E.wA, p);
        continue;
      }
      // Big Macs are grouped below (chevrons within 26 px merge into one with an 'x2' / 'x3' tag)
      if (WG.length < 24) { const g = WP[WG.length] || (WP[WG.length] = { e: null, x: 0, cy: 0, k: 0, rank: 0 }); g.e = e; g.x = clamp(e.x, 16, VIEW_W - 16); g.cy = cy; g.k = k;
        g.rank = ((e.hunt || 0) > 0 || (e.spot || 0) > 0 ? 3 : e.lunger && !e.lunged ? 2 : 1) + k * 0.5; WG.push(g); }
    }
    // the Big Mac chevrons, sorted by x; a run of them each within 26 px of the last (on one row) draws as ONE chevron
    // (the most dangerous member's: hunting, then a lunger, then the nearest), at the run's middle, tagged with the
    // count in that member's colour
    for (let i = 1; i < WG.length; i++) { const g = WG[i]; let j = i - 1; while (j >= 0 && WG[j].x > g.x) { WG[j + 1] = WG[j]; j--; } WG[j + 1] = g; }
    for (let i = 0; i < WG.length;) {
      let j = i + 1, lead = WG[i], sx = WG[i].x;
      while (j < WG.length && WG[j].x - WG[j - 1].x < 26 && WG[j].cy === WG[i].cy) { if (WG[j].rank > lead.rank) lead = WG[j]; sx += WG[j].x; j++; }
      const n = j - i, gx = n > 1 ? sx / n : lead.x;
      this.warnChev(lead.e, gx, lead.cy, lead.k, 1, p);
      if (n > 1) {
        const le = lead.e, tc = (le.hunt || 0) > 0 || (le.spot || 0) > 0 ? this.dangerFill() : le.lunger && !le.lunged ? '#ff9a3c' : '#fff4f8';
        const sp = this.text('x' + Math.min(9, n), tc, this.fpx(12), 'label');
        c.globalAlpha = 1; c.drawImage(sp.cv, clamp(gx + 20, sp.w / 2 + 2, VIEW_W - sp.w / 2 - 2) - sp.w / 2, lead.cy + 4 - sp.h / 2, sp.w, sp.h);
      }
      i = j;
    }
    c.globalAlpha = 1;
    this.drawThreatEdge(race);
  }
  // a chevron box (cy - up .. cy + dn) moved clear of a live banner and Coach's strip (R.bannerBox, which main.js sets
  // to the coach's box when no banner is up, and R.coachBox, the coach's box at all times when main.js sets it):
  // below the box, else above it (never over the HUD, top hb), else NaN: it sits the frame out. 6 px clearance
  chevClear(cy, up, dn, hb = 0) {
    const lo = Math.max(this.padW || 0, hb) + up, hi = this.H - (this.padB || 0) - dn;
    for (let k = 0; k < 2; k++) {
      const bb = k ? this.coachBox : this.bannerBox;
      if (!bb || !Number.isFinite(bb.y0) || !Number.isFinite(bb.y1) || !(cy - up < bb.y1 + 6 && cy + dn > bb.y0 - 6)) continue;
      if (bb.y1 + 6 + up <= hi) cy = bb.y1 + 6 + up;
      else if (bb.y0 - 6 - dn >= lo) cy = bb.y0 - 6 - dn;
      else return NaN;
    }
    return cy;
  }
  // one warning chevron (a Big Mac's, or an acid or goo pool's in your lane) at screen (x, cy), k 0..1 how close,
  // al its alpha (a pool's lane fade); the Big Mac's is red with a blob face, pulsing once it hunts or spots you
  warnChev(e, x, cy, k, al, p) {
    const c = this.ctx, t = this.time, red = this.reduced, wbc = e.t === 'wbc';
    const lng = wbc && e.lunger && !e.lunged;   // (orange means 'will pounce': a spent lunger gets the plain chevron)
    const sc = wbc ? 1 + 0.4 * k + 0.3 * clamp(((p.vy || 0) - 600) / 700, 0, 1) : 0.6 + 0.3 * k;
    const live = wbc && ((e.hunt || 0) > 0 || (e.spot || 0) > 0), dcol = this.dangerFill(), bc = wbc ? dcol : e.t === 'acid' ? '#7fcf1f' : '#a77bff';
    c.save(); c.translate(x, cy); c.scale(sc, sc);
    c.globalAlpha = al * (live && !red ? 0.72 + 0.28 * Math.sin(t * 6 * TAU) : 1);
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, -12); c.lineTo(12, 1); c.lineTo(5.5, 1); c.lineTo(0, -4.5); c.lineTo(-5.5, 1); c.lineTo(-12, 1); c.closePath();
    // a lunger: a second notch stacked behind (the double chevron of a thing that jumps), both orange
    if (lng) { c.moveTo(0, -20); c.lineTo(12, -7); c.lineTo(5.5, -7); c.lineTo(0, -12.5); c.lineTo(-5.5, -7); c.lineTo(-12, -7); c.closePath(); }
    // a 3 px #2a0a24 under-stroke outside a 1.5 px cream outline (screen px, whatever the chevron's scale)
    c.strokeStyle = HZ_INK; c.lineWidth = 9 / sc; c.stroke();
    c.strokeStyle = '#fff4f8'; c.lineWidth = 3 / sc; c.stroke();
    if (wbc) { c.fillStyle = lng ? '#ff9a3c' : dcol; c.fill(); }
    else { const ga = c.globalAlpha; c.globalAlpha = ga * 0.7; c.fillStyle = HZ_INK; c.fill(); c.globalAlpha = ga * 0.85; c.fillStyle = bc; c.fill(); c.globalAlpha = ga; }
    if (lng) {   // the lunger's '!!' plate where the face would be
      c.fillStyle = '#fff4f8'; c.beginPath(); c.ellipse(0, 11, 9, 7, 0, 0, TAU); c.fill(); c.strokeStyle = HZ_INK; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#ff6a1a';
      for (let ox = -3; ox <= 3; ox += 6) { c.fillRect(ox - 1.2, 6.2, 2.4, 5.4); c.beginPath(); c.arc(ox, 14.4, 1.3, 0, TAU); c.fill(); }
      if (live) { c.globalAlpha = al; this.dangerBadge(17, -13, 0.75); }
    } else if (wbc) {   // the blob face: a wobbly white cell with two eyes and a little mouth
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 11, 8, 7, 0, 0, TAU); c.fill(); c.strokeStyle = bc; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#1a0a1a'; c.beginPath(); c.arc(-2.6, 9.6, 1.3, 0, TAU); c.arc(2.6, 9.6, 1.3, 0, TAU); c.fill();
      c.fillStyle = '#5a1030'; c.beginPath(); c.ellipse(0, 13.6, 2.6, live ? 1.7 : 0.9, 0, 0, TAU); c.fill();
      // the wind-up, so the tell is never lost off screen: a red arc round the chevron fills over the spot
      // (full once it hunts), with a '!' badge
      if (live) {
        const f = (e.hunt || 0) > 0 ? 1 : clamp((e.spot || 0) / (e.spotT || 0.35), 0, 1);
        c.globalAlpha = al; c.lineCap = 'round';
        c.strokeStyle = 'rgba(42,10,36,0.55)'; c.lineWidth = 4; c.beginPath(); c.arc(0, 3, 21, 0, TAU); c.stroke();
        if (f > 0.01) { c.strokeStyle = dcol; c.lineWidth = 3; c.beginPath(); c.arc(0, 3, 21, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.stroke(); }
        this.dangerBadge(17, -13, 0.75);
      }
    } else {
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 11, 7, 0, TAU); c.fill(); c.strokeStyle = bc; c.lineWidth = 2; c.stroke();
      c.fillStyle = bc; c.fillRect(-1.2, 6.6, 2.4, 5.2); c.beginPath(); c.arc(0, 14.2, 1.3, 0, TAU); c.fill();
    }
    c.restore();
  }
  // the visual twin of the threat growl: the nearest hunting Big Mac within 300 that is off screen (or within 60 px
  // of an edge) gets a 22 px chevron on the screen border, pointing at it, alpha 1 - d / 300 (steady for reduced motion)
  drawThreatEdge(race) {
    const p = race.p, c = this.ctx;
    if (race.over || race.drill || race.demo) return;
    let best = null, bd = 300;
    for (const e of race.ents) {
      if (e.t !== 'wbc' || e.dead || !((e.hunt || 0) > 0.5)) continue;
      const d = hyp(e.x - p.x, e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    const top = (this.padW || 0), bot = this.H - (this.padB || 0), ex = best.x, ey = this.sy(best.y);
    if (ex > 60 && ex < VIEW_W - 60 && ey > top + 60 && ey < bot - 60) return;
    // where the ray from Kevin to the cell leaves the inset screen box
    const kx = p.x, ky = this.sy(p.y), dx = ex - kx, dy = ey - ky, M = 18;
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    let s = 1e9;
    if (dx > 0) s = Math.min(s, (VIEW_W - M - kx) / dx); else if (dx < 0) s = Math.min(s, (M - kx) / dx);
    if (dy > 0) s = Math.min(s, (bot - M - ky) / dy); else if (dy < 0) s = Math.min(s, (top + M - ky) / dy);
    if (!(s > 0) || s > 1e8) return;
    const x = clamp(kx + dx * s, M, VIEW_W - M), ang = Math.atan2(dy, dx);
    let y = clamp(ky + dy * s, top + M, bot - M);
    // never through a live banner (the coach's lines, a zone title): the chevron slides along the edge past it
    // (below it, or above it when below would leave the screen); 16 px is its half size at the pulse's peak
    const bb = this.bannerBox;
    if (bb && Number.isFinite(bb.y0) && Number.isFinite(bb.y1) && y + 16 > bb.y0 && y - 16 < bb.y1) {
      if (bb.y1 + 16 + 2 <= bot - M) y = bb.y1 + 18; else if (bb.y0 - 18 >= top + M) y = bb.y0 - 18; else return;
    }
    const pul = this.reduced ? 1 : 1 + 0.12 * Math.sin(this.time * 3 * TAU), m = this.scrM();
    c.globalAlpha = clamp(1 - bd / 300, 0, 1) * (this.reduced ? 1 : 0.85 + 0.15 * pul);
    setXf(c, m, x, y, ang, pul, pul);
    c.beginPath(); c.moveTo(11, 0); c.lineTo(-11, -11); c.lineTo(-5, 0); c.lineTo(-11, 11); c.closePath();
    // a 3 px ink under-stroke, a 1.5 px cream outline, then the fill (gold on the red zones)
    c.lineJoin = 'round'; c.strokeStyle = HZ_INK; c.lineWidth = 9 / pul; c.stroke(); c.strokeStyle = '#fff4f8'; c.lineWidth = 3 / pul; c.stroke(); c.fillStyle = this.dangerFill(); c.fill();
    c.setTransform(m); c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the egg
  eggSky(n) {
    const c = this.ctx, t = this.time;
    this.dglow('#ffd77a', VIEW_W / 2, -60, 240 + 220 * n, 0.5 * n);
    if (this.lite) return;   // lite: the glow alone, no shafts
    c.save(); c.translate(VIEW_W / 2, -90); c.fillStyle = `rgba(255,232,160,${0.05 * n})`;
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.24 + (this.reduced ? 0 : Math.sin(t * 0.25 + i * 1.3) * 0.05);
      c.save(); c.rotate(a); c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.lineTo(34, this.H * 1.3); c.lineTo(-34, this.H * 1.3); c.closePath(); c.fill(); c.restore();
    }
    c.restore();
  }
  // the static egg body (jelly coat, gradient, rim, shine) baked at the canvas pixel scale
  eggBody(R) {
    const k = Math.min(3, Math.max(1, this.s * (this.zoom || 1))), key = R + '|' + k.toFixed(2);
    if (this.eggB && this.eggBK === key) return this.eggB;
    const EB = R + 14, sz = Math.ceil(EB * 2 * k), cv = mk(sz, sz), g = cv.getContext('2d');
    g.setTransform(sz / (EB * 2), 0, 0, sz / (EB * 2), sz / 2, sz / 2);
    g.fillStyle = 'rgba(255,245,215,0.35)'; g.beginPath(); g.arc(0, 0, R + 9, 0, TAU); g.fill();
    const g2 = g.createRadialGradient(-45, -55, 20, 0, 0, R);
    g2.addColorStop(0, '#fffbe8'); g2.addColorStop(0.55, '#ffd77a'); g2.addColorStop(1, '#e8a33c');
    g.fillStyle = g2; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 6; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(-62, -78, 30, 14, -0.7, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(-30, -100, 6, 0, TAU); g.fill();
    this.eggB = cv; this.eggBK = key; return cv;
  }
  // the duel shows on her: a dent and a set of cracks at each drill point (Kevin's at PI / 2, each arrived rival's at its
  // duel angle q.an, in its colour). Dent depth 6 + 16 f; cracks at f >= 0.33 / 0.66 / 0.9 (3 / 5 / 8 lines, a glowing
  // seam at 0.9), baked per level and colour. Crossing a level bursts 6 jelly flecks (not for reduced motion). A win
  // flashes the cracks white, then they seal in a ring spreading from Kevin's breach; on a steal the thief's glow.
  // (called inside drawEgg's egg transform: local units, the egg centre at 0, 0)
  drawEggCracks(race, d, ex, ey, R, kx, ky, win, late) {
    const c = this.ctx, red = this.reduced, eT = this.endT, CL = this.crackLv;
    if (CL.size && CL.d !== d) CL.clear();   // a new duel starts clean
    CL.d = d;
    const thief = late ? race.eggTaken : null;
    const one = (key, an, f, col, glow) => {
      f = clamp(f, 0, 1);
      const lv = f >= 0.9 ? 3 : f >= 0.66 ? 2 : f >= 0.33 ? 1 : 0, prev = CL.get(key) || 0;
      if (lv > prev) {
        CL.set(key, lv);
        if (!red && !race.over) for (let i = 0; i < 6; i++) {   // jelly flecks spray off the shell
          const a = an + (Math.random() - 0.5) * 1.2, v = 90 + Math.random() * 110, px = ex + Math.cos(an) * R * kx, py = ey + Math.sin(an) * R * ky;
          this.addP(0, px, this.camY + this.H - py, Math.cos(a) * v, -Math.sin(a) * v, 0.55 + Math.random() * 0.25, '#fff3c0', 2 + Math.random() * 2, 260);
        }
      }
      // the win's seal: each crack set closes when the ring from Kevin's breach (PI / 2) reaches it
      let al = 1, flash = 0;
      if (win) {
        let da = Math.abs(an - Math.PI / 2) % TAU; if (da > Math.PI) da = TAU - da;
        flash = eT < 0.35 ? 1 - Math.abs(eT - 0.15) / 0.2 : 0;
        al = 1 - clamp((eT - (0.35 + 0.55 * da / Math.PI)) / 0.15, 0, 1);
        if (al <= 0) return;
      }
      const dep = 6 + 16 * f;
      c.save(); c.rotate(an); c.globalAlpha = al;
      // the dent: a shaded hollow with a lit inner lip
      c.fillStyle = 'rgba(140,60,16,0.42)'; c.beginPath(); c.ellipse(R - dep * 0.5, 0, dep * 0.5 + 2, 13 + dep * 0.7, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,248,226,0.8)'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(R - dep * 0.5, 0, dep * 0.5 + 2, 13 + dep * 0.7, 0, Math.PI * 0.6, Math.PI * 1.4); c.stroke();
      if (lv > 0) {
        const L = 56, H = 64;
        if (glow) { this.dglow(col, R - dep - 24, 0, 46, 0.55 * al * (red ? 1 : 0.75 + 0.25 * Math.sin(this.time * 8))); c.globalAlpha = al; }
        c.drawImage(this.crackSpr(lv, col, false), R - dep * 0.6 - L, -H / 2, L, H);
        if (flash > 0) { c.globalAlpha = al * flash; c.drawImage(this.crackSpr(lv, '#ffffff', true), R - dep * 0.6 - L, -H / 2, L, H); }
      }
      c.restore();
    };
    one('k', Math.PI / 2, d.me / d.need, '#5ce1ff', false);
    for (const [a, q] of this.duel) one(a, q.an, a.drill / Math.max(1e-6, a.need || d.need), a.boss ? a.boss.col : '#ff5c7a', !!thief && a === thief);
    if (win && eT > 0.3 && eT < 1.05) {   // the seal ring: gold, sweeping round the shell from Kevin's breach
      const u = clamp((eT - 0.35) / 0.55, 0, 1), sw = Math.PI * u;
      c.globalAlpha = 1 - clamp((eT - 0.9) / 0.15, 0, 1); c.strokeStyle = '#fff3c0'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.arc(0, 0, R - 2, Math.PI / 2 - sw, Math.PI / 2 + sw); c.stroke(); c.globalAlpha = 1;
    }
    c.globalAlpha = 1;
  }
  // one crack set, baked per level (1 to 3) and colour: rooted at the rim (the right edge), 3 / 5 / 8 jagged lines
  // reaching inward, with the colour along the seam (and a glow at level 3). white: the win's flash copy
  crackSpr(lv, col, white) {
    const key = lv * 2 + (white ? 1 : 0) + '|' + col;
    let cv = this.crackSprs.get(key);
    if (cv) return cv;
    if (this.crackSprs.size > 40) this.crackSprs.clear();
    const K = 2, L = 56, H = 64, n = lv === 1 ? 3 : lv === 2 ? 5 : 8, rnd = seeded(4242 + lv * 17);
    cv = mk(L * K, H * K); const g = cv.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0); g.lineCap = 'round'; g.lineJoin = 'round';
    const paths = [];
    for (let i = 0; i < n; i++) {
      // sharp zigzags fanning wide from the dent (some run along the shell), every other one with a short branch
      const sp = n > 1 ? (i / (n - 1) - 0.5) * 2.4 : 0, len = (0.35 + 0.65 * rnd()) * (L - 6) * (lv === 3 ? 1 : 0.6 + 0.15 * lv);
      let x = L - 2 - rnd() * 3, y = H / 2 + (rnd() - 0.5) * 8, a = Math.PI + sp, zz = rnd() < 0.5 ? 1 : -1;
      const pts = [x, y];
      for (let k = 0; k < 4; k++) {
        a += zz * (0.5 + 0.3 * rnd()); zz = -zz;
        const sl = len / 4 * (0.7 + 0.6 * rnd()); x += Math.cos(a) * sl; y += Math.sin(a) * sl; pts.push(x, y);
        if (k === 1 && i % 2 === 0) { const ba = a + zz * 0.9, bl = len * 0.22; paths.push([x, y, x + Math.cos(ba) * bl, y + Math.sin(ba) * bl, x + Math.cos(ba - zz * 0.5) * bl * 1.6, y + Math.sin(ba - zz * 0.5) * bl * 1.6]); }
      }
      paths.push(pts);
    }
    const stroke = (w, st) => { g.lineWidth = w; g.strokeStyle = st; g.beginPath(); for (const P of paths) { g.moveTo(P[0], P[1]); for (let k = 2; k < P.length; k += 2) g.lineTo(P[k], P[k + 1]); } g.stroke(); };
    if (white) { stroke(4.6, '#ffffff'); }
    else {
      if (lv === 3) { g.shadowColor = col; g.shadowBlur = 8; stroke(3.4, col); g.shadowBlur = 0; }
      stroke(3.2, '#5a2608');
      stroke(1.3, lv === 3 ? '#fffbe8' : col);
    }
    this.crackSprs.set(key, cv);
    return cv;
  }
  drawEgg(race, dt) {
    const c = this.ctx, x = centre(RACE_LEN);
    const t = this.time, R = 150, d = race.drill, over = race.over;
    this.duel.clear();
    // the duel's speech bubbles (duelSay) all go when the duel ends
    { const on = !!d && !over; if (this.duelOn && !on && this.duelBub) this.duelBub.clear(); this.duelOn = on; }
    // drill taps make her jiggle (tap rate read from drill progress)
    if (d) { const rate = Math.max(0, d.me - this.lastDrill) / Math.max(dt, 1e-3); this.lastDrill = d.me; this.eggJig += (Math.min(1, rate / 3) - this.eggJig) * Math.min(1, dt * 10); }
    else { this.lastDrill = 0; this.eggJig *= 0.9; }
    const lc = !!this.lateCam;   // the pre-arrival steal: framed like the close-up, Kevin far behind
    if (race.p.y > RACE_LEN - 4000 || lc) this.eggSky(lc ? Math.max(this.eggCam, clamp(1 - (RACE_LEN - race.p.y) / 4000, 0, 1)) : clamp(1 - (RACE_LEN - race.p.y) / 4000, 0, 1));
    let y = this.sy(RACE_LEN + 120);
    if (y < -900 || y > this.H + 500) return;
    const near = lc ? 1 : clamp(1 - (RACE_LEN - race.p.y) / 2500, 0, 1);
    const win = over && over.reason === 'win', late = over && over.reason === 'late';
    // the ending plays out over 1.2 s (reduced motion: straight to the final poses)
    if (over !== this.overSeen) {
      this.overSeen = over; this.winT = 0; this.shardsDone = false; this.stealSaid = false;
      if (win && d) this.zoomPunch(0.15);   // the seal ring fires
    }
    this.thiefXY = null;
    // (a win holds still for 0.25 s, then Kevin dives in by 0.9 s; a steal eases in over 1.2 s)
    if (over) this.winT = this.reduced ? 1.2 : win && d ? clamp((this.endT - 0.25) / 0.65, 0, 1) * 1.2 : lc && !this.lateReady ? 0 : Math.min(1.2, this.winT + dt);
    const wk = clamp(this.winT / 1.2, 0, 1), we = wk * wk * (3 - 2 * wk);
    const jig = this.eggJig, sx = 1 + Math.sin(t * 28) * 0.025 * jig + Math.sin(t * 2) * 0.01, sy2 = 2 - sx;
    // the duel: arrived named rivals spread round the lower arc, each with its own drill ring
    let leadB = null, leadF = 0;
    if (d || late) {
      // each arrived rival sits on its own side of the egg (a.eggSide: -1 left, +1 right), so its sprite and its
      // tell wedge agree; without one they alternate as before
      let k = 0, kl = 0, kr = 0;
      for (const a of race.agents) {
        if (!a.alive || !a.arrived || !a.boss) continue;
        const es = a.eggSide === -1 || a.eggSide === 1 ? a.eggSide : 0;
        const an = es ? Math.PI / 2 - es * (0.35 + 0.42 * (es < 0 ? kl++ : kr++)) : Math.PI / 2 + (k % 2 ? -1 : 1) * (0.35 + 0.3 * k);
        const q = this.duelPool[k] || (this.duelPool[k] = { x: 0, y: 0, ang: 0, an: 0, ring: 0 });   // reused, no garbage per frame
        q.x = x + Math.cos(an) * (R + 34); q.y = y + Math.sin(an) * (R + 34); q.ang = an - Math.PI / 2; q.an = an; q.ring = R + 50 + 10 * k;
        this.duel.set(a, q);
        const f = d ? a.drill / Math.max(1e-6, a.need || d.need) : 0; if (f > leadF) { leadF = f; leadB = a; }
        if (++k >= 5) break;
      }
    }
    // halo + god rays (static when reduced)
    this.dglow('#ffd77a', x, y, R * 2.3, 0.55 + (this.reduced ? 0 : 0.1 * Math.sin(t * 2)));
    if (!this.lite) {   // 12 rays in one path
      const r0 = this.reduced ? 0 : t * 0.08, Lr = R * 2.6;
      c.fillStyle = 'rgba(255,235,160,0.08)'; c.beginPath();
      for (let i = 1; i <= 12; i++) {
        const a = r0 + i * TAU / 12, ca = Math.cos(a), sa = Math.sin(a);
        c.moveTo(x, y); c.lineTo(x + ca * Lr + sa * 26, y + sa * Lr - ca * 26); c.lineTo(x + ca * Lr - sa * 26, y + sa * Lr + ca * 26); c.closePath();
      }
      c.fill();
    }
    // corona radiata: a fluffy cloud of helper cells
    c.fillStyle = 'rgba(255,225,160,0.75)'; c.beginPath();
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU + t * 0.1, rr = R + 18 + Math.sin(t * 2 + i * 1.7) * 5, cx = x + Math.cos(a) * rr * sx, cy = y + Math.sin(a) * rr * sy2, cr = 10 + (i % 3) * 2; c.moveTo(cx + cr, cy); c.arc(cx, cy, cr, 0, TAU); }
    c.fill();
    c.fillStyle = 'rgba(255,250,220,0.6)'; c.beginPath();
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU + t * 0.1, rr = R + 18 + Math.sin(t * 2 + i * 1.7) * 5, cx = x + Math.cos(a) * rr * sx - 3, cy = y + Math.sin(a) * rr * sy2 - 3; c.moveTo(cx + 3, cy); c.arc(cx, cy, 3, 0, TAU); }
    c.fill();
    const bsw = 1 + 0.08 * (this.birthS ? this.birthSwell || 0 : 0);   // the birth: she swells
    c.save(); c.translate(x, y); c.scale(sx * bsw, sy2 * bsw);
    // zona pellucida (jelly coat), then the egg itself: baked once per pixel scale, one drawImage a frame
    const eb = this.eggBody(R), EB = R + 14;
    c.drawImage(eb, -EB, -EB, EB * 2, EB * 2);
    if (d) this.drawEggCracks(race, d, x, y, R, sx * bsw, sy2 * bsw, win, late);
    // BABY_AT s after a win (the heartbeat's first thump) the baby-to-be glows faintly inside her, at full alpha
    // exactly BABY_REVEAL_S s later (audio plays its music-box note then); her soft pulse only starts after that
    const eT = this.endT, babyK = win && over.baby && eT > BABY_AT ? clamp((eT - BABY_AT) / BABY_REVEAL_S, 0, 1) : 0;
    if (babyK > 0) {
      this.dglow('#fff3c0', 0, -14, 92, 0.35 * babyK);
      const bp = this.reduced || babyK < 1 ? 1 : 0.85 + 0.15 * Math.cos((eT - BABY_AT - BABY_REVEAL_S) * 4);
      c.globalAlpha = 0.35 * babyK * bp;
      c.drawImage(this.babySpr(over.baby), -56, -70, 112, 112); c.globalAlpha = 1;
    }
    // somebody else got in first: there they are, smug, inside the membrane
    if (late) {
      let w = race.eggTaken || null;
      if (!w) for (const a of race.agents) if (a.alive && a.arrived && (!w || a.drill > w.drill)) w = a;
      if (w) {
        const L = w.boss ? (BOSS_LOOK[w.boss.name.split(' ')[0]] || {}) : null, f = (w.face || 0) % 6, q = this.duel.get(w);
        // steal: the winner eases in from its drilling spot, swelling 1.3 -> 1.7 with a squash
        const lx0 = q ? (q.x - x) / sx : 0, ly0 = q ? (q.y - y) / sy2 : 96, ly = ly0 + (96 - ly0) * we;
        let lx = lx0 + (0 - lx0) * we;
        const sq = Math.sin(wk * Math.PI) * 0.18, done = wk >= 1, red = this.reduced;
        // each thief has its own entrance on the ease-in
        const fn = w.boss ? w.boss.name.split(' ')[0] : '', arc = Math.sin(wk * Math.PI);
        let esx = 1 + sq, esy = 1 - sq, bow = 0;
        if (fn === 'Gunther' && !red) { const f = Math.cos(we * TAU); esy *= Math.abs(f) < 0.1 ? (f < 0 ? -0.1 : 0.1) : f; }   // a backflip in
        else if (fn === 'Brock' && !red) { lx += arc * 30 * (lx0 > 0 ? 1 : -1); esx *= 1 + 0.22 * arc; esy *= 1 - 0.1 * arc; }   // shoulder barge
        else if (fn === 'Steve' && done) bow = red ? 1 : Math.abs(Math.sin(t * 2.5));                                           // sorry, sorry
        if (bow) { esy *= 1 - 0.14 * bow; }
        this.thiefXY = { x: x + lx * sx, y: y + ly * sy2, a: w };
        if (!this.stealSaid && w.boss && (!lc || this.lateReady)) {
          this.stealSaid = true;
          const line = lineOf(K.RIVAL_STEAL, w.boss.name.split(' ')[0], w.boss.name);
          if (line) this.say(w, line, 2.4);
        }
        this.drawSwimmer(lx, ly, done ? Math.sin(t * 2) * 0.15 : (q ? q.ang : 0) * (1 - we), (1.3 + 0.4 * we) * 1.15, w.boss ? w.boss.col : CROWD[f], t * 12,
          { acc: L ? L.acc : FACE_ACC[f], cap: L ? L.cap : CAPS[Math.floor((w.ph || 0) * 10) % CAPS.length], band: L && L.band, quiff: L && L.quiff ? 1 : 0, mouth: bow ? 'wobble' : done ? 'huge' : 'grin', happy: done ? 1 : 0, blush: 1, taper: 1, sx: esx, sy: esy, crown: done && w.boss ? 1 : 0, look: fn === 'Chad' && wk > 0.5 ? 1.2 : 0,
            ink: w.boss ? 1 : 0, tipCol: w.boss ? w.boss.col : null, shadesY: done ? 3.2 : 0 });
        const sc2 = (1.3 + 0.4 * we) * 1.15;
        if (fn === 'Tiffany' && wk > 0.3) this.bookArt(lx + 13 * sc2, ly - 3 * sc2, 0.9 * sc2 * Math.min(1, (wk - 0.3) / 0.3), (t % 2.4));   // a bookmark in her place
        else if (fn === 'Chad' && wk > 0.5) this.mirrorArt(lx + 14 * sc2, ly - 8 * sc2, t);                                              // checks his reflection
      }
    }
    // the face. Sleepy far away, wide awake when you arrive, giggly when drilled.
    // her pupils follow Kevin's x (at most 6 px), and glance at a rival who is close to winning
    let lookX = clamp((race.p.x - x) / 60, -1, 1) * 6;
    if (leadB && leadF > 0.6 && (t % 1.6) < 0.8) { const q = this.duel.get(leadB); if (q) lookX = clamp((q.x - x) / 60, -1, 1) * 6; }
    // a slow blink (0.3 s, eased shut and open) every 2 to 4 s
    if (t >= this.eggBlinkAt) { this.eggBlinkT = t; this.eggBlinkAt = t + 2 + 2 * Math.random(); }
    const bu = (t - this.eggBlinkT) / 0.3, eggLid = bu >= 0 && bu < 1 ? Math.sin(bu * Math.PI) : 0;
    const ink = '#7a4a12';
    c.strokeStyle = ink; c.fillStyle = ink; c.lineCap = 'round'; c.lineWidth = 5;
    const awake = near > 0.35 || d || over;
    for (let s = -1; s <= 1; s += 2) {
      const ex = s * 46, ey = 2;
      if (win && s === 1 && eT > 1.9 && ((eT - 1.9) % 1.6) < 0.4) { c.beginPath(); c.arc(ex, ey + 4, 13, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }   // a wink
      else if (win) { c.fillStyle = '#ff3d6e'; heart(c, ex, ey, 18 + Math.sin(t * 10) * 2); c.fillStyle = ink; }
      else if (d && jig > 0.25) { c.beginPath(); c.moveTo(ex - 13, ey + 6); c.lineTo(ex, ey - 6); c.lineTo(ex + 13, ey + 6); c.stroke(); }
      else if (!awake) { c.beginPath(); c.arc(ex, ey - 2, 12, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
      else {
        const open = clamp((near - 0.35) / 0.4, 0.3, 1), blink = Math.max(0.08, 1 - eggLid);
        c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey, 17, 21 * open * blink, 0, 0, TAU); c.fill(); c.stroke();
        if (blink > 0.5) {
          const lx = late ? 6 : lookX, pr = Math.min(11 * open, Math.max(2, 21 * open * blink - 5));
          c.fillStyle = ink; c.beginPath(); c.ellipse(ex + lx, ey + 3 * blink, 9, pr, 0, 0, TAU); c.fill();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + lx - 3, ey - 2, 3.5, 0, TAU); c.fill(); c.beginPath(); c.arc(ex + lx + 3, ey + 6, 1.6, 0, TAU); c.fill();
        }
        c.fillStyle = ink;
        c.beginPath(); c.moveTo(ex - 14, ey - 30 - 6 * near); c.quadraticCurveTo(ex, ey - 38 - 8 * near, ex + 14, ey - 30 - 6 * near); c.stroke();
      }
    }
    // mouth
    c.lineWidth = 5; c.strokeStyle = ink;
    if (win) { c.fillStyle = '#9a3b20'; c.beginPath(); c.arc(0, 40, 30, 0.05 * Math.PI, 0.95 * Math.PI); c.closePath(); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0, 58, 14, 7, 0, 0, TAU); c.fill(); }
    else if (late) { c.beginPath(); c.moveTo(-14, 50); c.quadraticCurveTo(0, 42, 14, 50); c.stroke(); c.fillStyle = 'rgba(150,220,255,0.9)'; c.beginPath(); c.ellipse(88, -40, 7, 10, 0, 0, TAU); c.fill(); }
    else if (d) { const o = 8 + 10 * jig + Math.sin(t * 30) * 3 * jig; c.fillStyle = '#9a3b20'; c.beginPath(); c.ellipse(0, 46, 14 + 6 * jig, o, 0, 0, TAU); c.fill(); }
    else if (!awake) { c.beginPath(); c.arc(0, 44, 9, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); }
    else { c.beginPath(); c.arc(0, 38, 14 + 10 * near, 0.12 * Math.PI, 0.88 * Math.PI); c.stroke(); }
    const bl = babyK > 0 ? 0.35 * babyK : 0;   // and she blushes
    c.fillStyle = rgbaQ(255, 110, 140, Math.min(0.95, 0.4 + 0.3 * (near + jig) + bl));
    for (let s = -1; s <= 1; s += 2) { c.beginPath(); c.ellipse(s * 78, 32, 16 * (1 + 0.25 * babyK), 9 * (1 + 0.25 * babyK), 0, 0, TAU); c.fill(); }
    c.restore();
    // the seal: a gold ring (the winner's colour on a steal) swells off the membrane; the rivals' drill rings shatter
    if (win && d) {   // 0.25 to 0.9 s: three ripple rings in Kevin's colour close over the membrane behind him
      const u = clamp((this.endT - 0.25) / 0.65, 0, 1);
      if (u > 0 && u < 1) for (let i = 0; i < 3; i++) {
        const ui = clamp(u * 1.6 - i * 0.3, 0, 1);
        if (ui <= 0 || ui >= 1) continue;
        c.globalAlpha = Math.sin(ui * Math.PI) * 0.85; c.strokeStyle = this.kevCol || '#ff3d6e'; c.lineWidth = 6 * (1 - ui) + 1.5;
        c.beginPath(); c.arc(x, y, R + 4 + (50 + 28 * i) * (1 - ui), 0, TAU); c.stroke();
      }
      c.globalAlpha = 1;
    }
    if ((late || (win && !d)) && wk < 1) {
      const sc = late && race.eggTaken && race.eggTaken.boss ? race.eggTaken.boss.col : '#ffd75c';
      c.globalAlpha = 1 - we; c.strokeStyle = sc; c.lineWidth = 8 * (1 - we) + 1.5;
      c.beginPath(); c.arc(x, y, R + R * 1.6 * we, 0, TAU); c.stroke();
      if (win) { c.strokeStyle = '#ff5cd2'; c.lineWidth = 4 * (1 - we) + 1; c.beginPath(); c.arc(x, y, R + R * 1.2 * we, 0, TAU); c.stroke(); }
      c.globalAlpha = 1;
    }
    if ((win || late) && !this.shardsDone && d) {
      this.shardsDone = true;
      for (const [a, q] of this.duel) {
        if (late && a === race.eggTaken) continue;
        for (let i = 0; i < 8; i++) {
          const an = i / 8 * TAU + Math.random() * 0.3, px = x + Math.cos(an) * q.ring, py = y + Math.sin(an) * q.ring, v = 120 + Math.random() * 120;
          this.addP(5, px, this.camY + this.H - py, Math.cos(an) * v, -Math.sin(an) * v, 0.7, a.boss.col, 6 + Math.random() * 3, 0, an + Math.PI / 2, (Math.random() - 0.5) * 14);
        }
      }
    }
    // Zzz while she naps
    if (!awake) {
      c.fillStyle = 'rgba(255,240,200,0.85)'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) { const k = (t * 0.4 + i / 3) % 1; c.globalAlpha = Math.sin(k * Math.PI); c.font = `800 ${Math.round(14 + k * 16)}px ${FONT}`; c.fillText('z', x + 70 + k * 40 + Math.sin(k * 6) * 6, y - R * 0.6 - k * 70); }
      c.globalAlpha = 1;
    }
    if (d) {   // drill progress rings around the egg: yours, each named rival's, and the crowd's best
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 10; c.beginPath(); c.arc(x, y, R + 38, 0, TAU); c.stroke();
      c.strokeStyle = '#5ce1ff'; c.lineWidth = 8; c.beginPath(); c.arc(x, y, R + 38, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, d.me / d.need)); c.stroke();
      let outer = R + 50;
      for (const [a, q] of this.duel) {
        if (win || late) continue;    // shattered
        const f = Math.min(1, a.drill / Math.max(1e-6, a.need || d.need)), end = -Math.PI / 2 + TAU * f;
        c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, q.ring, 0, TAU); c.stroke();
        c.strokeStyle = a.boss.col; c.lineWidth = 4; c.beginPath(); c.arc(x, y, q.ring, -Math.PI / 2, end); c.stroke();
        if (f > 0.02) {
          const ly = y + Math.sin(end) * (q.ring + 4), lx = clamp(x + Math.cos(end) * (q.ring + 4), 40, VIEW_W - 40);
          const nm = a.boss.name.split(' ')[0];
          if (a === leadB) this.queueLabel(lx, ly, nm, a.boss.col, null, a, 2, 'lead', f > 0.7 ? (this.reduced ? 0.8 : 0.55 + 0.45 * Math.sin(t * 9)) : 0);
          else this.queueLabel(lx, ly, nm, a.boss.col, null, a, 2, 'small');
        }
        outer = q.ring + 10;
      }
      // the crowd's leader by its own drill fraction (each swimmer drills to its own a.need, as core does)
      let lead = 0; for (const a of race.agents) if (a.alive && a.arrived && !a.boss) lead = Math.max(lead, a.drill / Math.max(1e-6, a.need || d.need));
      if (lead > 0) { c.strokeStyle = '#ff5c7a'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, outer, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, lead)); c.stroke(); }
    }
  }

  // ---------------------------------------------------------------- swimmers
  // n: segments (7 near Kevin; the far crowd uses 3, which still reads as a wiggle at that size)
  // the wave: a tighter spatial phase (k * 8.5, about 1.35 waves down the tail) and an envelope that keeps a
  // little life at the root (0.25 + 0.75 k^2) so the whip reads; half amplitude for reduced motion
  // the whip: n samples down the tail, joined by quadratic curves through their midpoints (a smooth S, no elbows)
  tail(c, x, y, ang, len, amp, ph, n = 7) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    if (this.reduced) amp *= 0.5;
    c.moveTo(x, y);
    let qx = x, qy = y;
    for (let i = 1; i <= n; i++) {
      const k = i / n, off = Math.sin(ph - k * 8.5) * amp * (0.25 + 0.75 * k * k);
      const nx = x - sa * len * k + ca * off, ny = y + ca * len * k + sa * off;
      if (i === 1) { qx = nx; qy = ny; continue; }
      c.quadraticCurveTo(qx, qy, (qx + nx) / 2, (qy + ny) / 2); qx = nx; qy = ny;
    }
    c.lineTo(qx, qy);
  }
  // a far tail as ONE quadratic: through the whip's k = 0.5 sample (as the control, pushed out 2x so the curve
  // reaches it) to its tip
  tailQ(c, x, y, ang, len, amp, ph) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    if (this.reduced) amp *= 0.5;
    const o5 = Math.sin(ph - 4.25) * amp * 0.4375, o1 = Math.sin(ph - 8.5) * amp;
    const mx = x - sa * len * 0.5 + ca * o5, my = y + ca * len * 0.5 + sa * o5, ex = x - sa * len + ca * o1, ey = y + ca * len + sa * o1;
    c.moveTo(x, y); c.quadraticCurveTo(2 * mx - (x + ex) / 2, 2 * my - (y + ey) / 2, ex, ey);
  }
  // a tapered tail in local space (pointing down): ONE filled ribbon round a 13-point centreline (k = 0 .. 1), thick
  // near the head, whip-thin at the tip, a round cap on the tip. Normals come from the central difference, the half
  // width is hw(k) = w * (1.15 - 0.85 k) / 2 (never under 0.35), and each edge is quadratics through its midpoints.
  // curl: the tail lags a turn (follow-through), bending the tip sideways by curl * len at the very end
  // ink: an under-layer colour (the same ribbon at 1.6x hw, filled first); tip: a colour for the ribbon from k >= 0.62,
  // so a named rival reads by its tail alone; col: the tail's fill (null: the context's current fillStyle).
  // The centreline stays in this.tlX / tlY for tailStripes.
  taperTail(c, len, amp, ph, w, curl = 0, tip = null, ink = null, col = null, tipS = 8) {
    if (this.reduced) amp *= 0.5;
    const X = this.tlX || (this.tlX = new Float32Array(13)), Y = this.tlY || (this.tlY = new Float32Array(13));
    const NX = this.tlNX || (this.tlNX = new Float32Array(13)), NY = this.tlNY || (this.tlNY = new Float32Array(13)), HW = this.tlHW || (this.tlHW = new Float32Array(13));
    X[0] = 0; Y[0] = 8;
    for (let i = 1; i <= 12; i++) { const k = i / 12; X[i] = Math.sin(ph - k * 8.5) * amp * (0.25 + 0.75 * k * k) + curl * k * k * len; Y[i] = 8 + len * k; }
    for (let i = 0; i <= 12; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < 12 ? i + 1 : 12, tx = X[i1] - X[i0], ty = Y[i1] - Y[i0], l = Math.sqrt(tx * tx + ty * ty) || 1;
      NX[i] = -ty / l; NY[i] = tx / l; HW[i] = Math.max(0.35, w * (1.15 - 0.85 * i / 12) * 0.5);
    }
    if (ink) { c.fillStyle = ink; this.tailRibbon(c, 1.6, 0); }
    if (col) c.fillStyle = col;
    this.tailRibbon(c, 1, 0);
    if (tip) { c.fillStyle = tip; this.tailRibbon(c, 1, tipS); }   // (8 / 12: the first sample past k = 0.62; a named rival's from 6, k 0.45)
  }
  // the ribbon over taperTail's centreline from sample s to the tip (half widths x f), filled with the current style:
  // out along the left edge, round the tip, back along the right (s > 0 starts on the edge midpoints, so a tip ribbon
  // lies exactly on the main one)
  tailRibbon(c, f, s) {
    const X = this.tlX, Y = this.tlY, NX = this.tlNX, NY = this.tlNY, HW = this.tlHW;
    const LX = this.tlLX || (this.tlLX = new Float32Array(13)), LY = this.tlLY || (this.tlLY = new Float32Array(13));
    const RX = this.tlRX || (this.tlRX = new Float32Array(13)), RY = this.tlRY || (this.tlRY = new Float32Array(13));
    const i0 = s > 0 ? s - 1 : 0;
    for (let i = i0; i <= 12; i++) { const h = HW[i] * f, ox = NX[i] * h, oy = NY[i] * h; LX[i] = X[i] + ox; LY[i] = Y[i] + oy; RX[i] = X[i] - ox; RY[i] = Y[i] - oy; }
    const a = Math.max(1, s);
    c.beginPath();
    if (s === 0) c.moveTo(LX[0], LY[0]); else c.moveTo((LX[s - 1] + LX[s]) / 2, (LY[s - 1] + LY[s]) / 2);
    for (let i = a; i < 11; i++) c.quadraticCurveTo(LX[i], LY[i], (LX[i] + LX[i + 1]) / 2, (LY[i] + LY[i + 1]) / 2);
    c.quadraticCurveTo(LX[11], LY[11], LX[12], LY[12]);
    const an = Math.atan2(NY[12], NX[12]);
    c.arc(X[12], Y[12], HW[12] * f, an, an - Math.PI, true);   // the round cap (left normal, through the tangent, to the right)
    c.quadraticCurveTo(RX[11], RY[11], (RX[11] + RX[10]) / 2, (RY[11] + RY[10]) / 2);
    for (let i = 10; i > a; i--) c.quadraticCurveTo(RX[i], RY[i], (RX[i] + RX[i - 1]) / 2, (RY[i] + RY[i - 1]) / 2);
    if (s === 0) c.quadraticCurveTo(RX[1], RY[1], RX[0], RY[0]);
    else c.quadraticCurveTo(RX[s], RY[s], (RX[s] + RX[s - 1]) / 2, (RY[s] + RY[s - 1]) / 2);
    c.fill();
  }
  // a point at k (0 .. 1) on the last taperTail's drawn centreline (the quadratic through the sample midpoints)
  tailAt(k, out) {
    const X = this.tlX, Y = this.tlY, q = clamp(k * 12, 0.5, 11.5), i = Math.min(11, Math.max(1, Math.round(q))), u = clamp(q - (i - 0.5), 0, 1);
    const ax = (X[i - 1] + X[i]) / 2, ay = (Y[i - 1] + Y[i]) / 2, bx = (X[i] + X[i + 1]) / 2, by = (Y[i] + Y[i + 1]) / 2, v = 1 - u;
    out[0] = v * v * ax + 2 * u * v * X[i] + u * u * bx; out[1] = v * v * ay + 2 * u * v * Y[i] + u * u * by;
  }
  // Kevin's STYLE stripes: n short bands across his tapered tail (taperTail's own drawn curve: call it right after),
  // one per link kind in the STYLE window, spread from 22% to 78% of its length, each in that kind's chip colour
  tailStripes(c, len, amp, ph, w, curl, cols, n) {
    if (!this.tlX) return;
    const A = this._stA || (this._stA = [0, 0]), B = this._stB || (this._stB = [0, 0]), sl = 0.07;
    c.lineCap = 'butt';
    for (let i = 0; i < n; i++) {
      const k0 = n === 1 ? 0.45 : 0.22 + (0.56 - sl) * i / (n - 1), k1 = k0 + sl;
      this.tailAt(k0, A); this.tailAt(k1, B);
      c.strokeStyle = cols[i]; c.lineWidth = Math.max(0.7, w * (1.15 - (k0 + sl / 2) * 0.85)) * 1.08;
      c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
    }
    c.lineCap = 'round';
  }
  // per-agent display state: smoothed x, a knockback offset on y, heading (and its turn rate), bump and pass
  // timers, and an accumulated tail phase. fr(a) gives the tail beat rate; it is eased and integrated
  // (A.tp), so a rate change (a sprint, a scare, the end of the race) never snaps the tail.
  track(a, race, p, dt, sm, fr) {
    const tx = race.agentX(a), A = this.ax(a);
    A.x = tx;
    if (A.vk !== A.vk) {   // (NaN: not yet) crowd variety, fixed per swimmer from its phase hash (deterministic, never on core's object)
      const ar = a.boss ? 0 : h1(a.ph * 17) < 1 / 12 ? 1 : h1(a.ph * 19) < 1 / 15 ? 2 : 0;   // 1 'chonk', 2 'noodle'
      A.arch = ar;
      A.vk = a.boss ? 1 : Math.min(1.0, 0.82 + 0.2 * h1(a.ph * 13));                        // size (never past 1.0: the rivals and Kevin stay bigger)
      A.vw = Math.min(2, Math.floor(h1(a.ph * 7) * 3));                                       // tail width bucket: 0.85, 1, 1.15
      A.vsx = ar === 1 ? 1.12 : ar === 2 ? 0.85 : 1; A.vsy = ar === 1 ? 0.95 : ar === 2 ? 0.85 : 1;   // head shape
      A.vtl = 32 * A.vk * (ar === 2 ? 1.35 : 1); A.vam = ar === 1 ? 0.7 : 1; A.vbt = ar === 1 ? 0.85 : ar === 2 ? 1.2 : 1;
      A.bp = 2.6 + 2.2 * h1(a.ph * 5);   // each swimmer blinks on its own period (2.6 to 4.8 s)
    }
    if (fr) fr(a, A); else A.fq = 15;   // (frOf writes A.fq: a number field, no boxed return a swimmer)
    const f = A.fq;
    if (!A.init || A.seen !== this.frame - 1 || Math.abs(tx - A.rx) > 140) {
      if (!A.init) A.tp = a.ph;
      A.rx = tx; A.oy = 0; A.py = a.y; A.hd = 0; A.pk = a.kx; A.bt = 0; A.pt = 0; A.ah = a.y > p.y; A.av = 0; A.tf = f; A.init = true;
    }
    const ox = A.rx;
    A.rx += (tx - A.rx) * sm;
    const dy = a.y - A.py; if (dy < -4) A.oy -= dy; A.py = a.y; A.oy *= 1 - sm;
    // the crowd wanders: a slow personal sway on the heading (named rivals keep their own swims)
    const wan = a.boss ? 0 : 0.16 * Math.sin(this.time * (0.9 + (a.ph * 7 % 0.8)) + a.ph * 11);
    const vx = (A.rx - ox) / Math.max(dt, 1e-3), hd = clamp(Math.atan2(vx, Math.max(60, a.sp || 400)) + wan, -0.6, 0.6), hd0 = A.hd;
    A.hd += (hd - A.hd) * Math.min(1, dt * 10);
    A.av += ((A.hd - hd0) / Math.max(dt, 1e-3) - A.av) * Math.min(1, dt * 8);
    if (Math.abs(a.kx - A.pk) > 1) A.bt = 0.8;
    A.pk = a.kx; A.bt = Math.max(0, A.bt - dt);
    const ah = a.y > p.y; if (A.ah && !ah && Math.abs(a.y - p.y) < 300) A.pt = 0.7; A.ah = ah; A.pt = Math.max(0, A.pt - dt);
    A.tf += (f - A.tf) * Math.min(1, dt * 8);
    A.tp += A.tf * dt;
    A.seen = this.frame;
    return A;
  }
  // the start line: coilOn while the race clock has not started (race.t <= 0, not the demo). The first frame after
  // GO stamps launchT. coilSy(delay): -1 while a swimmer is still coiled (the crowd releases staggered by delay),
  // then its sy spring 1.3 -> 1 over 0.25 s (backOut), 1 once settled (and at once for reduced motion)
  coilTick(race) {
    if (this.coilF === this.frame) return;
    this.coilF = this.frame;
    const on = !race.demo && !race.over && race.t != null && race.t <= 0;
    if (this.coilOn && !on && !race.demo && race.t > 0) this.launchT = this.time;
    if (on) this.launchT = null;
    this.coilOn = on;
  }
  coilSy(delay = 0) {
    if (this.coilOn) return -1;
    if (this.launchT == null) return 1;
    const k = (this.time - this.launchT - delay) / 0.25;
    if (k < 0) return -1;
    if (k >= 1 || this.reduced) return 1;
    return 1.3 - 0.3 * backOut(k);
  }
  // three bubbles puffing off a tail end at world (x, y) as a swimmer springs off the line
  launchPuff(x, wy) {
    if (this.reduced) return;
    for (let i = 0; i < 3; i++) this.addP(4, x + (Math.random() - 0.5) * 10, wy - Math.random() * 8, (Math.random() - 0.5) * 50, -40 - Math.random() * 50, 0.6, '#ffffff', 1.6 + Math.random() * 1.2);
  }
  // the panic list this frame (this.panic, this.pnN entries of x, y, kev): the index of the first hunting Big Mac (or
  // the hot Kevin, unless kev is false; his radius is always 90) within r of agent a, or -1
  nearW(a, r, kev = true, A = null) {
    const PN = this.panic, pn = this.pnN, rx = (A || this.aux.get(a)).rx;
    for (let i = 0; i < pn; i += 3) { if (PN[i + 2] && !kev) continue; const rr = PN[i + 2] ? 90 : r, dx = rx - PN[i], dy = a.y - PN[i + 1]; if (dx * dx + dy * dy < rr * rr) return i; }
    return -1;
  }
  freq0(a) { const fb = this.agFb; return 11 + 9 * ((a.sp || fb) / fb) * (0.75 + 0.25 * (a.stam == null ? 1 : a.stam)); }
  // an agent's tail beat rate (track() eases and integrates it)
  frOf(a, A0) {
    const A = A0 || this.aux.get(a);
    A.fq = this.frRate(a, A);
  }
  frRate(a, A) {
    if (this.agCoil && this.coilSy((a.ph % 1) * 0.3) < 0) return 28;   // coiled on the line: a tight, fast flutter
    const fb = this.agFb, slow = this.agSlow, AX = this.aux, pn = this.pnN;
    if (a.boss) {
      const L = BOSS_LOOK[A.fn || (A.fn = a.boss.name.split(' ')[0])] || NO_LOOK, dq = this.duel.get(a), sprint = !dq && !a.arrived && !!a.sprint;
      // its cadence follows its real speed against its own cruising pace (0.6x to 1.4x), 0.72x while it tires;
      // at the egg the drill rate drives it (0.8x idle up to 1.5x); 1.25x while Kevin chases it down
      if (A.rsp !== A.rsp) { const RV = Array.isArray(K.RIVALS) ? K.RIVALS.find((r) => r && r.name === a.boss.name) : null; A.rsp = (RV && +RV.sp) || 1; }
      const rs = A.rsp;
      const cad = dq ? 0.8 + 0.7 * clamp((A.dr || 0) / 1, 0, 1) : clamp(Math.pow((a.sp || fb) / (fb * rs), 0.8), 0.6, 1.4) * (A.tiredK ? 0.72 : 1);
      return (L.freq || 15) * cad * (sprint ? 1.6 : 1) * (pn > 0 && this.nearW(a, 110, true, A) >= 0 ? 1.8 : 1) * (A.chs ? 1.25 : 1) * slow;
    }
    return this.freq0(a) * (A.vbt || 1) * (pn > 0 && this.nearW(a, 90, true, A) >= 0 ? 1.8 : 1) * slow;
  }
  // Kevin's ground glow: a soft pink radial gradient baked once (drawn at r 34 under his head)
  kevGlowSpr() {
    if (this._kevGlow) return this._kevGlow;
    const n = 96, cv = mk(n, n), g = cv.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, 'rgba(255,90,138,1)'); gr.addColorStop(0.35, 'rgba(255,90,138,0.75)'); gr.addColorStop(0.7, 'rgba(255,90,138,0.25)'); gr.addColorStop(1, 'rgba(255,90,138,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
    return (this._kevGlow = cv);
  }
  drawAgents(race, dt) {
    this.coilTick(race);
    const c = this.ctx, WM = this.worldM || c.getTransform(), top = this.camY + this.H + 40, bot = this.camY - 40, t = this.time, p = race.p;
    const H = this.H, cy = this.camY;   // (sy inlined: H - (wy - cy))
    const VB = this._vis || (this._vis = obuf()), CB = this._close || (this._close = obuf());
    VB.n = 0; CB.n = 0;
    // vA / cA run parallel to vis / close: each swimmer's aux record, looked up ONCE a frame (no Map.get per pass)
    const vis = VB.a, close = CB.a, vA = VB.b, cA = CB.b;
    const cap = this.lite ? 12 : 26, visCap = this.lite ? 90 : 150, sm = 1 - Math.exp(-16 * dt), fb = 430 * (1 + 0.06 * (race.gen || 0));
    // crowd panic: hunting Big Macs near the camera make the swimmers round them freak out (read by the tail rates)
    // (x, y, kev) triples; a hot Kevin joins the list with his own 90 px radius, so the crowd parts round him
    const PN = this.panic, ENTS = race.ents; let pn = 0;
    for (let ei = 0; ei < ENTS.length; ei++) {
      const e = ENTS[ei];
      if (e.t !== 'wbc' || e.dead || !(e.hunt > 0.5) || e.y > top + 400 || e.y < bot - 400) continue;
      if (pn + 2 >= PN.length) PN.push(0, 0, 0);
      PN[pn++] = e.x; PN[pn++] = e.y; PN[pn++] = 0;
    }
    const ov = race.over, red = this.reduced, hot = this.kevinHot(p) && !ov && !race.drill, fz = p.frenzyT > 0;
    if (hot && !red) { if (pn + 2 >= PN.length) PN.push(0, 0, 0); PN[pn++] = p.x; PN[pn++] = p.y; PN[pn++] = 1; }
    this.pnN = pn;
    const AX = this.aux, nearW = this.nearWB;
    const win = !!(ov && ov.reason === 'win'), late = !!(ov && ov.reason === 'late');
    // the win: from 0.4 s every visible rival reacts for 1.2 s; tails slow to 0.4x and the close crowd looks worried
    const reactK = win && this.endT > 0.9 ? clamp((this.endT - 0.9) / 0.7, 0, 1) : -1, slow = reactK >= 0 ? 0.4 : 1;
    const coilAny = this.coilOn || (this.launchT != null && this.time - this.launchT < 0.6);
    this.agFb = fb; this.agSlow = slow; this.agCoil = coilAny;
    const fr = this.frB;
    // behind Kevin (more than 40 units below him, in a live swim): the crowd and the rivals step back to 0.7
    const behOn = !race.demo && !ov && !race.drill, behY = p.y - 40;
    // the crowd near Kevin: every non-rival within 200 is a candidate; the nearest `cap` get baked heads (close), the
    // rest of them (overflow) draw as plain full-size heads with the far crowd. 170..200 is a 30 px crossfade: the far
    // head (now the same size and colour) draws under the baked one, which fades out (A.cf 1 -> 0)
    const CD = this._cand || (this._cand = obuf()); CD.n = 0;
    const cand = CD.a, kA = CD.b;
    this.hfB = race.demo || race.over ? null : this.hudB();
    let nFade = 0;   // crowd swimmers under the HUD (drawn faded outside the batches)
    const goDim = this.goK(race) > 0;   // the GO spotlight: the swimmers within 120 px of Kevin step back to 0.6
    // a teaching swim (R.teach, runs < 3): all race long the crowd within 90 px of Kevin steps back to 0.75
    const teachDim = !goDim && !!this.teach && !race.demo && !ov && !race.drill;
    // Kevin's ground glow, under the crowd, always on in a swim: a soft pink radial glow (r 34) pulsing 0.25 .. 0.4 at
    // 1.5 Hz (a still 0.3 for reduced motion), so he never gets lost in the crowd
    if (!race.demo && !ov) {
      const hr = 34, ha = red ? 0.3 : 0.325 + 0.075 * Math.sin(t * TAU * 1.5);
      c.globalAlpha = ha; c.drawImage(this.kevGlowSpr(), p.x - hr, H - (p.y - cy) - hr, hr * 2, hr * 2); c.globalAlpha = 1;
    }
    const AG = race.agents;
    for (let ai = 0; ai < AG.length; ai++) {
      const a = AG[ai];
      if (!a.alive) {   // a named rival who just dropped out near Kevin leaves as a ghost
        const A = AX.get(a);
        if (a.boss && A && A.seen === this.frame - 1 && !A.gone) { A.gone = 1; if (Math.abs(a.y - p.y) < 700 && !this.rivalSwallow(race, a, A)) this.rivalGhost(a); }
        continue;
      }
      if (a.y > top || a.y < bot) continue;
      if (p.side && a.y > FORK_Y0 && a.side !== p.side && a.y > FORK_END) continue;
      // the far crowd is capped (150, 90 on lite), never within 300 of Kevin and never a named rival
      if (!a.boss && VB.n >= visCap && Math.abs(a.y - p.y) >= 300) continue;
      const A = this.track(a, race, p, dt, sm, fr);
      A.cl = 0; A.cf = 0; A.hf = a.boss ? 1 : this.hudFade(H - (a.y + (A.oy || 0) - cy)); A.bh = behOn && a.y < behY ? 1 : 0;
      { const fu = (Math.abs(a.y - p.y) - 190) / 300; A.fs = 1 - 0.2 * (fu < 0 ? 0 : fu > 1 ? 1 : fu); }   // (farS, inlined: once a swimmer, no boxed return)
      if (goDim && !a.boss) { const dx = A.rx - p.x, dy = a.y - p.y; if (dx * dx + dy * dy < 14400) A.hf = Math.min(A.hf, 0.6); }
      else if (teachDim && !a.boss) { const dx = A.rx - p.x, dy = a.y - p.y; if (dx * dx + dy * dy < 8100) A.hf = Math.min(A.hf, 0.75); }
      if (!a.boss && Math.abs(a.y - p.y) < 200) { const dx = A.rx - p.x, dy = a.y - p.y; A.nd = dx * dx + dy * dy; kA[CD.n] = A; cand[CD.n++] = a; } else { vA[VB.n] = A; vis[VB.n++] = a; }
    }
    if (CD.n > cap) {   // nearest first (an insertion sort over the kept bucket: no comparator, no copy)
      for (let i = 1; i < CD.n; i++) { const a = cand[i], Ai = kA[i], d = Ai.nd; let j = i - 1; while (j >= 0 && kA[j].nd > d) { cand[j + 1] = cand[j]; kA[j + 1] = kA[j]; j--; } cand[j + 1] = a; kA[j + 1] = Ai; }
    }
    for (let i = 0; i < CD.n; i++) {
      const a = cand[i], A = kA[i];
      if (i < cap) { cA[CB.n] = A; close[CB.n++] = a; A.cl = 1; A.cf = clamp(1 - (Math.abs(a.y - p.y) - 170) / 30, 0, 1); }
      vA[VB.n] = A; vis[VB.n++] = a;   // (overflow, and the close ones fading out, draw a far head too; close ones at cf 1 skip it)
    }
    const nVis = VB.n, nClose = CB.n;
    const T = this.time, jit = red ? 0 : 2.5, oopsOn = this.oopsT > 0 && !race.demo;
    this.comboFright(race);
    // the close ones' display offsets: parting round a hot Kevin (12 px while within 90), the panic jitter, the coil
    for (let ci = 0; ci < nClose; ci++) {
      const a = close[ci], A = cA[ci];
      let kw = 0;
      if (hot && !red) { const dx = A.rx - p.x, dy = a.y - p.y; if (dx * dx + dy * dy < 8100) kw = dx >= 0 ? 12 : -12; }
      A.kp = (A.kp || 0) + (kw - (A.kp || 0)) * Math.min(1, dt * 10);
      // panic jitter (a hunting Big Mac within 110, not while bumped): tail and head shake together
      A.jx = jit && pn && !(Math.max(a.bumpT || 0, A.bt) > 0) && nearW(a, 110, false, A) >= 0 ? jit * Math.sin(T * 30 + a.ph) : 0;
      A.cz = coilAny ? this.coilSy((a.ph % 1) * 0.3) : 1;
      if (A.cz >= 0 && this.launchT != null && A.lp !== this.launchT && this.time - this.launchT < 0.6) { A.lp = this.launchT; if (!this.lite) this.launchPuff(A.rx + A.kp + A.jx, a.y + A.oy - 30); }
    }
    // tails, one formula for the whole crowd (len 32, amp 5.5 + 1.2 per face % 3, 8 px behind the head along its
    // heading): within 300 one stroke at 2.2 px / 0.92 (7 segments); past 300 the width and alpha ease off in two
    // bands (3 segments), and past 700 a head goes alone. Bevel joins (cheaper to stroke on a long path)
    c.lineCap = 'round'; c.lineJoin = 'bevel';
    // the far crowd's tails, sorted once into 18 kept buckets (behind * 9 + band * 3 + width bucket), so the passes
    // below never rescan the whole list; the ones fading under the HUD only count toward nFade
    const TB = this._tb || (this._tb = Array.from({ length: 18 }, obuf));
    for (let i = 0; i < 18; i++) TB[i].n = 0;
    for (let vi = 0; vi < nVis; vi++) {
      const a = vis[vi];
      if (a.boss) continue;
      const A = vA[vi];
      if (A.cl) continue;
      if (A.hf < 1) { nFade++; continue; }
      const wb = A.vw;
      if (wb !== 0 && wb !== 1 && wb !== 2) continue;
      const dy = Math.abs(a.y - p.y), b = dy < 300 ? 0 : dy < 500 ? 1 : dy < 700 ? 2 : 3;
      if (b < 3) { const L = TB[A.bh * 9 + b * 3 + wb]; L.b[L.n] = A; L.a[L.n++] = a; }
    }
    // (each band strokes once per tail width bucket, 2.2 x 0.85 / 1 / 1.15: three strokes a band, still batched;
    // the swimmers behind Kevin stroke after at 0.7 of it)
    c.strokeStyle = 'rgba(255,255,255,1)';
    // path budget: in the Launch Tube (the densest crowd) at stage 1 and on lite a far crowd tail within 300 takes 4
    // segments, not 7; past 500 every far tail is ONE quadratic (tailQ). The close swimmers keep their 7.
    const n0 = this.zi === 0 && (this.q === 0 || this.lite) ? 4 : 7;
    for (let bh = 0; bh < 2; bh++) for (let band = 0; band < 3; band++) {
      const e = band === 0 ? 0 : band === 1 ? 0.3 : 0.75;
      c.globalAlpha = (0.92 - 0.27 * e) * (bh ? 0.7 : 1);
      for (let wb = 0; wb < 3; wb++) {
        c.lineWidth = (2.2 - 0.7 * e) * (0.85 + 0.15 * wb); c.beginPath();
        let any = false;
        const TL = TB[bh * 9 + band * 3 + wb], TA = TL.a, TX = TL.b;
        for (let ti = 0; ti < TL.n; ti++) {
          const a = TA[ti], A = TX[ti], b = band;
          const h = A.hd || 0;
          const tx0 = A.rx - Math.sin(h) * 8, ty0 = H - (a.y + A.oy - cy) + Math.cos(h) * 8, am = (5.5 + ((a.face || 0) % 3) * 1.2) * A.vam;
          if (b === 2) this.tailQ(c, tx0, ty0, h, A.vtl, am, A.tp); else this.tail(c, tx0, ty0, h, A.vtl, am, A.tp, b ? 5 : n0);
          any = true;
        }
        if (band === 0) for (let ci = 0; ci < nClose; ci++) {
          const a = close[ci], A = cA[ci];
          if (A.vw !== wb || A.bh !== bh) continue;
          const x = A.rx + A.kp + A.jx, y = H - (a.y + A.oy - cy), ang = A.hd, ph = A.tp;
          A.ph = ph; if (A.hf < 1) { nFade++; continue; } this.tail(c, x - Math.sin(ang) * 8, y + Math.cos(ang) * 8, ang, A.vtl, A.cz < 0 ? 2.5 : (5.5 + ((a.face || 0) % 3) * 1.2) * A.vam, ph); any = true;
        }
        if (any) c.stroke();
      }
    }
    // the crowd under the HUD (its 40 px fade band): batched, the fade quantized to 4 alpha steps ((s + 0.5) / 4):
    // ONE tail stroke a step, and below one head fill and stroke per (step, colour pair), at most 12 buckets
    // (FB: kept buckets, step * 3 + face pair; A.hq holds each swimmer's step for the heads and eyes)
    const FB = this._fb || (this._fb = Array.from({ length: 12 }, obuf));
    for (let i = 0; i < 12; i++) FB[i].n = 0;
    if (nFade) {
      for (let vi = 0; vi < nVis; vi++) {
        const a = vis[vi];
        if (a.boss) continue;
        const A = vA[vi];
        if (!(A.hf < 1)) { A.hq = -1; continue; }
        const st = Math.min(3, Math.floor(A.hf * (A.bh ? 0.7 : 1) * 4));
        A.hq = st;
        const L = FB[st * 3 + ((((a.face || 0) % 6 + 6) % 6) >> 1)]; L.b[L.n] = A; L.a[L.n++] = a;
      }
      c.strokeStyle = '#ffffff'; c.lineWidth = 2;
      for (let st = 0; st < 4; st++) {
        let any = false;
        c.beginPath();
        for (let q = 0; q < 3; q++) {
          const L = FB[st * 3 + q], LA = L.a, LX = L.b;
          for (let li = 0; li < L.n; li++) {
            const a = LA[li], A = LX[li], cl = !!A.cl, h = A.hd || 0, x = A.rx + (cl ? (A.kp || 0) + (A.jx || 0) : 0), y = H - (a.y + A.oy - cy);
            this.tailQ(c, x - Math.sin(h) * 8, y + Math.cos(h) * 8, h, A.vtl || 32, (5.5 + ((a.face || 0) % 3) * 1.2) * (A.vam || 1), cl ? A.ph : A.tp);
            any = true;
          }
        }
        if (any) { c.globalAlpha = (st + 0.5) / 4 * 0.85; c.stroke(); }
      }
    }
    c.globalAlpha = 1; c.lineJoin = 'round';
    // far heads: 7.5 x 10 (the baked head's size) shrinking to 0.8x by 490, batched by face % 6 in the baked heads'
    // own colours, with their faint outline (the Goo's dark rim there); sorted once into 12 kept buckets
    // (behind * 6 + face), the ones behind Kevin at 0.7
    const HB = this._hb || (this._hb = Array.from({ length: 12 }, obuf));
    for (let i = 0; i < 12; i++) HB[i].n = 0;
    for (let vi = 0; vi < nVis; vi++) {
      const a = vis[vi];
      if (a.boss) continue;
      const A = vA[vi];
      if ((A.cl && A.cf >= 1) || A.hf < 1) continue;
      const L = HB[A.bh * 6 + (((a.face || 0) % 6 + 6) % 6)]; L.b[L.n] = A; L.a[L.n++] = a;
    }
    for (let hb = 0; hb < 12; hb++) {
      const L = HB[hb], LA = L.a, LX = L.b;
      if (!L.n) continue;
      c.globalAlpha = hb >= 6 ? 0.7 : 1; c.fillStyle = CROWD[hb % 6]; c.beginPath();
      for (let li = 0; li < L.n; li++) {
        const a = LA[li], A = LX[li];
        const k = A.fs * A.vk, x = A.rx + (A.cl ? A.kp + A.jx : 0), y = H - (a.y + A.oy - cy), q = A.sqU > T ? 1 : 0, rx = 7.5 * k * A.vsx * (1 + 0.25 * q), ry = 10 * k * A.vsy * (1 - 0.2 * q), h = A.hd || 0;
        c.moveTo(x + rx * Math.cos(h), y + rx * Math.sin(h)); c.ellipse(x, y, rx, ry, h, 0, TAU);
      }
      c.fill();
      if (this.gooOn) { c.strokeStyle = GOO_RIM; c.lineWidth = 1.5; } else { c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 1; }
      c.stroke();
    }
    c.globalAlpha = 1;
    if (nFade) {   // their heads under the HUD: one fill and one stroke per (alpha step, colour pair) bucket
      if (this.gooOn) { c.strokeStyle = GOO_RIM; c.lineWidth = 1.5; } else { c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 1; }
      for (let fb = 0; fb < 12; fb++) {
        const L = FB[fb], LA = L.a, LX = L.b;
        let any = false;
        c.beginPath();
        for (let li = 0; li < L.n; li++) {
          const a = LA[li], A = LX[li];
          if (A.cl && A.cf >= 1) continue;
          const k = A.fs * A.vk, x = A.rx + (A.cl ? A.kp + A.jx : 0), y = H - (a.y + A.oy - cy), h = A.hd || 0, rx = 7.5 * k * A.vsx;
          c.moveTo(x + rx * Math.cos(h), y + rx * Math.sin(h)); c.ellipse(x, y, rx, 10 * k * A.vsy, h, 0, TAU); any = true;
        }
        if (!any) continue;
        c.globalAlpha = ((fb / 3 | 0) + 0.5) / 4; c.fillStyle = CROWD[(fb % 3) * 2]; c.fill(); c.stroke();
      }
    }
    c.globalAlpha = 1;
    // their plain faces: two eyes (a blink every 3.3 s) turned with the head, within 320
    // (every eye at full opacity goes into one rect path and one fill, the ones behind Kevin into a second at 0.7;
    // the ones fading under the HUD draw alone)
    c.fillStyle = '#2a1030';
    let fStep = 0;
    for (let pass = 0; pass < 3; pass++) {
      if (pass < 2) { c.globalAlpha = pass ? 0.7 : 1; c.beginPath(); }
      else { if (!nFade) break; c.globalAlpha = (fStep + 0.5) / 4; c.beginPath(); }
      let eyeAny = false;
      for (let vi = 0; vi < nVis; vi++) {
        const a = vis[vi];
        if (a.boss || Math.abs(a.y - p.y) >= 320) continue;
        const A = vA[vi];
        if (A.cl && A.cf >= 1) continue;
        const full = !(A.hf < 1);
        if (pass < 2 ? !full || A.bh !== pass : full) continue;
        const k = A.fs * A.vk * A.vsy, y = H - (a.y + A.oy - cy), x = A.rx + (A.cl ? A.kp + A.jx : 0), h = A.hd || 0, ch = Math.cos(h) * k, sh = Math.sin(h) * k;
        const bp = A.bp;   // each swimmer blinks on its own period (2.6 to 4.8 s)
        const bl = ((t + a.ph * 3) % bp) < 0.12, ew = bl ? 2.4 * k : 1.6 * k, eh = bl ? 0.9 * k : 2.2 * k, ey = bl ? -1.55 : -1.4;
        if (!full && A.hq !== fStep) continue;
        for (let s2 = -1; s2 <= 1; s2 += 2) {
          const lx = s2 * 1.8, cx = x + lx * ch - ey * sh, cy2 = y + lx * sh + ey * ch;
          c.rect(cx - ew / 2, cy2 - eh / 2, ew, eh);
        }
        eyeAny = true;
      }
      if (eyeAny) c.fill();
      if (pass === 2 && fStep < 3 && nFade) { fStep++; pass--; }   // (the faded eyes: one fill per alpha step)
    }
    c.globalAlpha = 1;
    // the close ones: baked heads over their tails (fading out across 170..200)
    if (nClose) {
      const m = WM, nod = red ? 0 : 1.5 * clamp(+this.beat || 0, 0, 1);
      for (let ci = 0; ci < nClose; ci++) {
        const a = close[ci];
        const A = cA[ci], x = A.rx + (A.kp || 0), y = H - (a.y + A.oy - cy), f = (a.face || 0) % 6, ci2 = f === 4 ? Math.floor(a.ph * 10) % CAPS.length : 0;
        const behind = a.y < p.y, dx = Math.abs(x - p.x), bt = Math.max(a.bumpT || 0, A.bt), pt = Math.max(a.passT || 0, A.pt);
        const ky = a.y - p.y, kd2 = dx * dx + ky * ky;   // (squared distance to Kevin, once: no hyp() call a test)
        let ex = 0;
        if (bt > 0) ex = 4;
        else if (reactK >= 0) ex = 2;              // Kevin won: everyone else is worried now
        else if (pt > 0) ex = 5;
        else if (behind && p.y - a.y < 70) ex = 2;
        else if (!behind && dx < 22 && a.y - p.y < 100) ex = 3;
        else if (a === race.draftTarget && p.draft > 0.05) ex = 3;   // you are in its slipstream: it glares
        else if (((t + a.ph * 3) % A.bp) < 0.12) ex = 1;
        // Kevin is on fire: everyone within 200 stares in awe (star-struck in FRENZY)
        if (hot && ex !== 4 && ex !== 5 && kd2 < 40000) ex = fz && !red ? 7 : 6;
        let sx = 1, sy = 1;
        const jx = A.jx || 0;
        if (pn && ex !== 4 && nearW(a, 110, false, A) >= 0) ex = 5;   // panic (the shake itself is A.jx, set with the tail)
        // Kevin got hit (or died) within 160: a gasp for 0.3 s, then a smirk
        if (oopsOn && ex !== 4 && kd2 < 25600) ex = T - this.oopsAt < 0.3 ? 5 : 3;
        const look = ex === 2 || ex >= 5 ? 0 : kd2 < 3600 ? (p.x > x ? 1 : -1) : 0;
        if (A.bt > 0) { const e = 0.8 - A.bt; sy = 1 - 0.25 * Math.cos(e * 22) * Math.exp(-e * 7); sx = 1 + (1 - sy) * 0.8; }
        if (A.sqU > T) { sx *= 1.25; sy *= 0.8; }   // just got passed
        if (A.cz < 0) { sx *= 1.06; sy *= 0.88; } else if (A.cz !== 1) { sy *= A.cz; sx /= Math.sqrt(A.cz); }   // coiled / springing off
        const hit = this.isImp(a);
        if (hit) { sx *= 1.12; sy *= 0.88; }
        // a per-stroke pulse: the head stretches a touch on each tail beat (volume kept)
        const st = 1 + (red ? 0.025 : 0.05) * Math.max(0, Math.sin(A.ph));
        sx /= st; sy *= st;
        const vk = A.vk || 1; sx *= vk * (A.vsx || 1); sy *= vk * (A.vsy || 1);   // (its size and archetype)
        setXf(c, m, x + jx, y - nod, A.hd - Math.sin(A.ph) * 0.07, sx, sy);   // (nod: the close crowd's heads dip on the beat)
        c.globalAlpha = A.cf * A.hf * (A.bh ? 0.7 : 1); c.drawImage(this.headSpr(f, ci2, ex, look), -10, -19, 20, 34);
        if (hit) { c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 0, 8, 10.5, 0, 0, TAU); c.fill(); }
        else if (this.impRing(a)) { c.globalAlpha = 1; c.strokeStyle = '#ffffff'; c.lineWidth = 3 / Math.max(0.5, Math.min(sx, sy)); c.beginPath(); c.ellipse(0, 0, 11, 13.5, 0, 0, TAU); c.stroke(); }
      }
      c.setTransform(m); c.globalAlpha = 1;
      if (this.gooOn) {   // the Goo's dark head rims, one batched stroke
        c.strokeStyle = GOO_RIM; c.lineWidth = 1.5; c.beginPath();
        for (let ci = 0; ci < nClose; ci++) { const a = close[ci], A = cA[ci]; if (!(A.cf >= 0.5)) continue; const x = A.rx + (A.kp || 0) + (A.jx || 0), y = H - (a.y + A.oy - cy), h = A.hd || 0, rx = 8.6 * A.vk * A.vsx, ry = 11.2 * A.vk * A.vsy; c.moveTo(x + rx * Math.cos(h), y + rx * Math.sin(h)); c.ellipse(x, y, rx, ry, h, 0, TAU); }
        c.stroke();
      }
      c.fillStyle = '#ffd75c';
      for (let ci = 0; ci < nClose; ci++) { const a = close[ci], A = cA[ci]; if (Math.max(a.bumpT || 0, A.bt) > 0) { const x = A.rx + (A.kp || 0), y = H - (a.y + A.oy - cy); for (let i = 0; i < 2; i++) { const an = t * 8 + i * Math.PI; star4(c, x + Math.cos(an) * 10, y - 13 + Math.sin(an) * 3, 2.6); } } }
    }
    // the named rivals, each with a signature swim
    const o = this.scr;
    const wk = clamp(this.winT / 1.2, 0, 1), wo = 1 - (1 - wk) * (1 - wk);
    // the win's fling: 0.9 to 1.6 s after, the losers fly off the egg in slow motion (0.4x)
    const flingK = win ? clamp((this.endT - 0.9) / 0.7, 0, 1) : 0, fo = 1 - (1 - flingK) * (1 - flingK);
    const dft = race.draftTarget && p.draft > 0.05 ? race.draftTarget : null;
    this.labelQ = true;
    for (let vi = 0; vi < nVis; vi++) {
      const a = vis[vi];
      if (!a.boss) continue;
      const A = vA[vi], nm = a.boss.name, fn = A.fn || (A.fn = nm.split(' ')[0]), L = BOSS_LOOK[fn] || NO_LOOK, dq = this.duel.get(a), nem = !!this.nemesis && fn === this.nemesis;
      if (dq && late && a === race.eggTaken) continue;   // it is inside the egg now (drawEgg draws it)
      let x = A.rx, y = H - (a.y + A.oy - cy), ang = L.straight ? 0 : A.hd, sx = L.sx || 1, sy = L.sy || 1;
      if (dq) { x = dq.x; y = dq.y; ang = dq.ang; }
      if (L.tilt) ang += L.tilt * (A.tiltS || 1);
      // story beats: gloating right after passing you, a red-faced sprint for the egg, straining at the membrane
      const gloat = !dq && a.tauntT > 2.8, sprint = !dq && !a.arrived && !!a.sprint;
      let strain = 0, shv = 0, knocked = 0;
      const ph = A.tp, bt = Math.max(a.bumpT || 0, A.bt), pt = Math.max(a.passT || 0, A.pt);
      if (dq) {
        const prev = A.dl === A.dl ? A.dl : a.drill;   // (NaN: no reading yet)
        if (a.drill < prev - 1e-4) A.shv = 0.5;                       // Kevin's shove knocked it back
        A.dr = (A.dr || 0) + (Math.max(0, a.drill - prev) / Math.max(dt, 1e-3) - (A.dr || 0)) * Math.min(1, dt * 6);
        A.dl = a.drill; A.shv = Math.max(0, (A.shv || 0) - dt); shv = A.shv;
        const ca = Math.cos(dq.an), sa = Math.sin(dq.an);
        if (win && ov) {                      // flung off the egg in slow motion, turning
          knocked = flingK > 0 ? 1 : 0; const kb = 150 * fo; x += ca * kb; y += sa * kb; if (!red) ang += flingK * TAU * 0.45 * (a.ph > 0.5 ? 1 : -1);
        } else if (late && ov) {              // knocked off the egg, spinning
          knocked = 1; const kb = 60 * wo; x += ca * kb; y += sa * kb; ang += wo * TAU * (a.ph > 0.5 ? 1.3 : -1.3);
        } else if (!ov) {
          const rate = clamp((A.dr || 0) / 1, 0, 1.5), hb = Math.abs(Math.sin(t * 14 + a.ph * 5));
          strain = rate;
          const jab = red ? 0 : 5 * hb * rate; x -= ca * jab; y -= sa * jab;
          if (hb > 0.85 && rate > 0.2 && !red) { sy *= 0.86; sx *= 1.08; }   // squash on contact
          if (shv > 0) { const u = 1 - shv / 0.5, off = 15 * Math.exp(-5 * u) * Math.sin(18 * u); x += ca * off; y += sa * off; }
          A.swt = (A.swt || 0) - dt;
          if (rate > 0.2 && A.swt <= 0) {
            A.swt = 0.3; const sgn = Math.random() < 0.5 ? -1 : 1;
            this.addP(3, x + sgn * 10, this.camY + this.H - y + 12, sgn * (30 + Math.random() * 30), 30 + Math.random() * 30, 0.55, '#9ae2ff', 2.2, 220);
          }
        }
      }
      // signature tricks come from the race, never from a timer, and at least 2.5 s apart: Steve waves when
      // Kevin passes him, Brock flexes once a bump wears off, Gunther rolls when he taunts
      let want = null;
      if (L.wave && pt > 0 && !(A.ppt > 0)) want = 'wave';
      if (L.flex && bt <= 0 && A.pbt > 0) want = 'flex';
      if (L.roll && (a.tauntT || 0) > (A.ptt || 0) + 1) want = 'roll';
      if (L.read && pt > 0 && !(A.ppt > 0)) want = 'peek';                          // Tiffany looks up from her book
      if (L.quiff && ((pt > 0 && !(A.ppt > 0)) || (gloat && !A.pgl))) want = 'flick';   // Chad flicks his hair
      // gloating (the rising edge): Steve bows (sorry!), Brock flexes, Tiffany peeks over a raised book, smug
      let gw = false;
      if (gloat && !A.pgl) { const g = fn === 'Steve' ? 'bow' : fn === 'Brock' ? 'flex' : fn === 'Tiffany' ? 'smug' : null; if (g) { want = g; gw = true; } }
      // a rival who just taunted Kevin makes him huff
      if ((a.tauntT || 0) > (A.ptt || 0) + 1 && !ov && !race.demo) { if (!(this.huffT > 0)) this.huffNew = true; this.huffT = 0.8; }
      // the overtake: on the pass's rising edge Kevin's wake spins it away from his side (0.45 rad, decaying
      // exp(-6u) over 0.5 s, the tail curl kicked 0.4 the other way); reduced motion keeps the faces, drops the spin
      if (pt > 0 && !(A.ppt > 0) && !dq && !ov) { A.wkT = T; A.wkS = p.x < x ? 1 : -1; }
      A.ppt = pt; A.pbt = bt; A.ptt = a.tauntT || 0; A.pgl = gloat;
      if (want && !ov && (gw || T - A.trT >= 2.5)) { A.tr = want; A.trT = T; if (want === 'roll' && L.tilt) A.tiltS = -(A.tiltS || 1); }
      // Kevin's misfortune: each named rival within 260 (not duelling, not bumped) plays its own beat, at most every 2.5 s
      if (oopsOn && A.oops !== this.oopsId && !dq && !(bt > 0) && hyp(x - p.x, a.y - p.y) < 260) {
        A.oops = this.oopsId;
        if (T - A.trT >= 2.5) { A.oopsT = T; A.oopsK = this.oopsKind; A.oopsD = this.oopsDur || 0.9; A.trT = T; A.tr = null; }
      }
      // the first meeting: the first frame Kevin is within 400, the rival shows off its signature trick for 1.2 s
      const dK = hyp(x - p.x, a.y - p.y);
      if (A.met < 0 && dK < 400 && !ov && !dq) A.met = T;
      const meetT = A.met >= 0 && !ov ? T - A.met : 9, meet = meetT < 1.2;
      if (meet && MEET_TRICK[fn]) { const tr = MEET_TRICK[fn]; A.tr = tr; A.trT = T - (meetT % TRICK_DUR[tr]); }
      const trT = A.tr ? T - A.trT : 9;
      const smugK = A.tr === 'smug' && trT < 0.9 ? (red ? 1 : Math.min(1, trT / 0.15, (0.9 - trT) / 0.15)) : 0;
      const bowTr = A.tr === 'bow' && trT < 0.8 ? (red ? 1 : Math.sin(trT / 0.8 * Math.PI)) : 0;
      let waveK = A.tr === 'wave' && trT < 0.9 && !bt ? trT / 0.9 : -1;
      let rollK = A.tr === 'roll' && trT < 0.5 ? trT / 0.5 : -1;
      let flexK = A.tr === 'flex' && trT < 0.6 ? Math.sin(trT / 0.6 * Math.PI) : 0;
      // Tiffany's peek: the book drops 6 px in 0.15 s, comes back up after 0.6 s
      const peek = A.tr === 'peek' && trT < 0.75 ? (red ? 1 : trT < 0.15 ? trT / 0.15 : trT < 0.6 ? 1 : 1 - (trT - 0.6) / 0.15) : 0;
      // Chad's flick: the quiff springs 1 -> 1.35 (one overshoot, 0.45 s), the head tilts, a sparkle and a tooth glint
      let flick = A.tr === 'flick' && trT < 0.45 ? trT / 0.45 : -1;
      // a hunting Big Mac within 110: shock, a faster tail, and an 8 px 'nope' sidestep away from it
      const wi = dq ? -1 : pn ? nearW(a, 110, true, A) : -1;
      A.dg = (A.dg || 0) + ((wi >= 0 ? (x >= PN[wi] ? 8 : -8) : 0) - (A.dg || 0)) * Math.min(1, dt * 14);
      x += A.dg;
      // a rival 0 to 120 behind Kevin is hunting him
      const hunter = !dq && !ov && p.y - a.y >= 0 && p.y - a.y <= 120;
      // Kevin is in its slipstream: it looks back and glares; after 1.2 s it grits, kicks harder and blows bubbles at him
      const drafted = a === dft && !dq && !ov;
      A.drT = drafted ? (A.drT || 0) + dt : 0;
      const grit = drafted && A.drT > 1.2;
      if (grit) {
        A.dbT = (A.dbT || 0) - dt;
        if (A.dbT <= 0) {
          A.dbT = 0.6;
          for (let i = 0; i < 2; i++) this.addP(3, x + (i ? 5 : -5) + (Math.random() - 0.5) * 4, a.y + A.oy - 30, (i ? 1 : -1) * (6 + Math.random() * 10), -60 - Math.random() * 30, 0.6, '#9ae2ff', 2.2);
        }
      }
      // chased: Kevin is 30 to 180 below it, within 90 across and closing (not drafting it, no duel, not over). It looks
      // back at him, worried, grits its teeth under 80, sweats a drop every 0.6 s and kicks 1.25x faster, 1.2x wider
      const gap = a.y - p.y;
      if (A.cgp === A.cgp && dt > 0) A.cgv += ((gap - A.cgp) / Math.max(dt, 1e-3) - A.cgv) * Math.min(1, dt * 8);
      A.cgp = gap;
      const chased = !dq && !ov && !drafted && !race.demo && gap >= 30 && gap <= 180 && Math.abs(p.x - x) < 90 && A.cgv < -10;
      A.chs = chased ? 1 : 0;
      if (chased) {
        A.cswT -= dt;
        if (A.cswT <= 0) { A.cswT = 0.6; const sg = Math.random() < 0.5 ? -1 : 1; this.addP(3, x + sg * 11, a.y + A.oy + 12, sg * (30 + Math.random() * 30), 30 + Math.random() * 30, 0.6, '#9ae2ff', 2.4, 220); }
      } else A.cswT = 0.3;
      let wkC = 0;
      { const u = T - A.wkT; if (!red && u >= 0 && u < 0.5) { const e = Math.min(1, u / 0.04) * Math.exp(-6 * u); ang += A.wkS * 0.45 * e; wkC = -A.wkS * 0.4 * e; } }
      if (gloat) { const dx = clamp((p.x - x) / 120, -0.45, 0.45); ang += dx; }
      if (sprint) {   // puffs come off the tail end (behind it), never in front of its nose
        A.stm = (A.stm || 0) - dt;
        if (A.stm <= 0) { A.stm = 0.15; this.addP(0, x + (Math.random() - 0.5) * 8, a.y + A.oy - 30, (Math.random() - 0.5) * 24, -30 - Math.random() * 20, 0.5, '#f4eeff', 2 + Math.random() * 1.5); }
      }
      // grooves on the zone's beat (not for reduced motion): Steve bobs 2 px, Brock pumps 4% wider, Gunther's lean
      // flips every 4 beats, Chad struts one sway per 4 beats, Tiffany bobs on the off-beat (she would)
      const grv = !red && !dq && !ov, bk = grv ? clamp(+this.beat || 0, 0, 1) : 0, bu = this.beatU || 0;
      if (grv) {
        if (fn === 'Steve') y -= 2 * bk;
        else if (fn === 'Brock') sx *= 1 + 0.04 * bk;
        else if (fn === 'Gunther' && L.tilt) ang -= 2 * (Math.floor(bu / 4) % 2) * L.tilt * (A.tiltS || 1);
        else if (fn === 'Tiffany') y -= 1.5 * clamp(1 - Math.abs((this.beatF || 0) - 0.5) * 4, 0, 1);
      }
      if (L.strut && !dq) { const sw = grv ? Math.sin(bu * TAU / 4 + a.ph) : Math.sin(t * 3 + a.ph); ang += sw * 0.22; x += sw * 3; }
      // a rival move (rivalMove): the tell winds up, the hit lunges at the egg, a counter leaves it spinning
      const mvD = A.mvD || MV_DUR[A.mvP] || 0, mv = !ov && T - A.mvT < mvD ? A.mvP : null, mvK = mv ? (T - A.mvT) / mvD : 0;
      let bowK = 0, mirror = false, spinMv = 0;
      if (mv === 'tell') {
        const e = red ? 1 : 1 - mvK;
        sx *= 1 + 0.15 * e; sy *= 1 - 0.15 * e;
        if (A.mv === 'maxRep') flexK = Math.max(flexK, red ? 0.8 : Math.sin(mvK * Math.PI));
        else if (A.mv === 'hairCheck') mirror = true;
        else if (A.mv === 'sorry') bowK = red ? 1 : Math.sin(mvK * Math.PI);
      } else if (mv === 'hit') {
        if (!red) { y -= 22 * Math.sin(mvK * Math.PI); sy *= 1 + 0.12 * Math.sin(mvK * Math.PI); }
        if (A.mv === 'hairCheck') mirror = true;
      } else if (mv === 'countered') spinMv = red ? 0 : (1 - (1 - mvK) * (1 - mvK)) * TAU;
      // Gunther hops back 40 px for the dive (and springs forward again on the hit)
      const hopW = (mv === 'tell' || (A.mvP === 'tell' && T - A.mvT < 0.9)) && A.mv === 'stuntDive' ? 40 : 0;
      A.hop = (A.hop || 0) + (hopW - (A.hop || 0)) * (red ? 1 : Math.min(1, dt * 12));
      y += A.hop; ang += spinMv;
      bowK = Math.max(bowK, bowTr);
      if (bowK) { sy *= 1 - 0.15 * bowK; y -= 4 * bowK; }
      // the win: the losers react 0.9 to 1.6 s after (in slow motion), then the sulks
      const rk = reactK, endT = this.endT;
      let droop = 0, quiffK = 1, blushR = 0, turn = 0;
      if (win) {
        if (fn === 'Brock') droop = clamp((endT - 0.9) / 0.4, 0, 1) * (rk >= 0 && rk < 1 ? 0.5 : 1);
        if (fn === 'Chad') quiffK = 1 - 0.5 * clamp((endT - 0.9) / 0.5, 0, 1);   // the quiff flops
        if (rk >= 0 && rk < 1) {
          if (fn === 'Steve') { waveK = (rk * 1.2 % 0.9) / 0.9; blushR = 1; }
          else if (fn === 'Brock') flexK = 0.6 * Math.sin(rk * Math.PI);
          else if (fn === 'Gunther') rollK = rk;
          else if (fn === 'Chad') turn = Math.sin(Math.min(1, rk * 2) * Math.PI / 2);
        } else if (rk >= 1 && fn === 'Chad') turn = 1;
        if (fn === 'Tiffany' && !A.book && endT > 0.9) { A.book = 1; this.books.push({ a, t: 0, x, y, s: x < p.x ? -1 : 1 }); }
      }
      // the misfortune beat's body: Chad shakes with laughter (2 px at 20 Hz), and on a death Brock flexes, Steve
      // waves goodbye, Gunther rolls; Tiffany is smug either way
      const oopsK = T - A.oopsT < (A.oopsD || 0.9) && !dq ? (T - A.oopsT) / (A.oopsD || 0.9) : -1;
      if (oopsK >= 0) {
        const death = A.oopsK === 'death';
        if (fn === 'Chad' && !red) x += 2 * Math.sin(T * 20 * TAU);
        else if (fn === 'Brock' && death) flexK = Math.max(flexK, red ? 0.8 : Math.sin(oopsK * Math.PI));
        else if (fn === 'Steve' && death) waveK = oopsK;
        else if (fn === 'Gunther' && death && !red && oopsK < 0.5) rollK = oopsK / 0.5;
      }
      const smugO = oopsK >= 0 && fn === 'Tiffany' ? (red ? 1 : Math.min(1, oopsK / 0.15, (1 - oopsK) / 0.15)) : 0;
      // the start line: coiled, each named rival does its tic (Steve waves, Brock flexes, Tiffany has shut her book,
      // Chad flicks his quiff, Gunther does mini rolls), then springs off staggered
      const coilK = coilAny ? this.coilSy((a.ph % 1) * 0.3) : 1;
      if (coilK < 0 && !dq) {
        const u = T + a.ph * 3;
        if (fn === 'Steve') { const w = u % 1.4; waveK = w < 0.9 ? w / 0.9 : -1; }
        else if (fn === 'Brock') flexK = Math.max(flexK, 0.6);
        else if (fn === 'Chad') { const w = u % 1.6; flick = w < 0.45 ? w / 0.45 : -1; }
        else if (fn === 'Gunther' && !red) { const w = u % 1.8; if (w < 0.5) sx *= 0.775 + 0.225 * Math.cos(w / 0.5 * TAU); }
        sx *= 1.06; sy *= 0.88;
      } else if (coilK !== 1) { sy *= coilK; sx /= Math.sqrt(coilK); }
      if (coilK >= 0 && this.launchT != null && A.lp !== this.launchT && this.time - this.launchT < 0.6) { A.lp = this.launchT; this.launchPuff(x, a.y + A.oy - 30); }
      if (flick >= 0) {
        const sp = red ? 1 : Math.sin(flick * Math.PI) * 1.12 - 0.12 * Math.sin(flick * TAU);   // up, one overshoot, settle
        quiffK *= 1 + 0.35 * sp; ang += 0.25 * (red ? 1 : Math.sin(flick * Math.PI));
      }
      if (turn) ang += (x < p.x ? -1 : 1) * 0.9 * turn;
      // the combo fright's body (comboFright): Brock's tremble (1.5 units at 24 Hz, Gerald with him), Chad's quiff
      // sagging to 0.6, Steve's swoon (0.3 rad toward Kevin). Reduced motion: the faces only
      const cbU = (T - A.cbT) / (fn === 'Steve' && A.cbK >= 10 && A.cbK !== 20 ? 0.4 : 1), cbOn = cbU >= 0 && cbU < 1 && !dq && !ov;
      const cbMode = !cbOn ? 0 : A.cbK === 20 ? 1 : A.cbK >= 45 && fn === 'Chad' ? 2 : fn === 'Steve' ? 3 : 4;
      if (cbMode && !red) {
        if (cbMode === 1) x += 1.5 * RIVAL_SC * Math.sin(T * 24 * TAU);
        else if (cbMode === 2) quiffK *= 0.6;
        else if (cbMode === 3) ang += (p.x > x ? 1 : -1) * 0.3 * Math.sin(cbU * Math.PI);
      }
      if (rollK >= 0) { const r = Math.cos(rollK * TAU); sx *= Math.abs(r) < 0.08 ? (r < 0 ? -0.08 : 0.08) : r; }
      if (flexK > 0) { sx *= 1 + 0.12 * flexK; sy *= 1 + 0.08 * flexK; }
      if (droop) { sy *= 1 - 0.1 * droop; sx *= 1 + 0.06 * droop; }
      if (A.bt > 0) { const e = 0.8 - A.bt, q = 1 - 0.25 * Math.cos(e * 22) * Math.exp(-e * 7); sy *= q; sx *= 1 + (1 - q) * 0.8; }
      if (A.sqU > T) { sx *= 1.25; sy *= 0.8; }
      if (meet) this.dglow(a.boss.col, x, y, 74, 0.6 * (1 - meetT / 1.2));   // a spotlight for the introduction
      this.dglow(a.boss.col, x, y, 30, nem ? 0.5 : 0.35);
      let bodyCol = a.boss.col;
      if (sprint) { if (A.scK !== a.boss.col) { A.scK = a.boss.col; A.sc = css(lerpC(rgb(a.boss.col), SPRINT_COL, 0.25)); } bodyCol = A.sc; }
      o.name = nm; o.key = a; o.acc = L.acc; o.cap = L.cap; o.band = L.band; o.taper = 1; o.amp = L.amp * (grit ? 1.4 : 1); o.tw = L.tw; o.sx = sx; o.sy = sy; o.bob = L.strut ? Math.sin(t * 6 + a.ph) * 1.2 : 0;
      if (coilK < 0) o.amp = 2.5;
      o.look = clamp((p.x - x) / 50, -1.2, 1.2); o.dizzy = bt > 0 || shv > 0.15 || knocked || mv === 'countered' ? 1 : 0; o.shock = pt > 0 ? 1 : 0;
      // the face: scared only while Kevin is passing it (the pt window)
      o.mouth = bt > 0 ? 'wobble' : pt > 0 ? 'scared' : L.mouth; o.brow = bt > 0 ? undefined : pt > 0 ? 'worried' : (L.brow || (nem ? 'angry' : undefined));
      o.nameCol = nem ? '#ff4d5e' : undefined; o.quiff = L.quiff ? 1 : 0; o.quiffK = quiffK;
      { const bl = blinkLid(A.bk || (A.bk = { nt: NaN, k: -1, dbl: 0 }), dt, L.blink, L.dbl); o.blink = bl >= 0.95; o.lid = bl < 0.95 ? bl : 0; }
      o.happy = 0; o.blush = blushR; o.star = undefined; o.tired = 0; o.flash = 0; o.ring = 0; o.tail = undefined; o.flap = 1; o.crown = 0; o.wink = 0; o.ko = 0; o.lookY = 0;
      // Kevin's secondary motion: head counter-yaw, a tail that lags turns, a stroke surge on each beat
      o.yaw = 1; o.curl = red ? 0 : clamp(-(A.av || 0) * 0.22, -0.5, 0.5) + wkC;
      o.stretch = 1 + 0.05 * (red ? 0.5 : 1) * Math.max(0, Math.sin(ph));
      if (o.dizzy) o.mouth = 'wobble';
      else if (gloat) { o.mouth = 'grin'; o.brow = 'angry'; o.wink = 1; o.look = p.x > x ? 1.2 : -1.2; o.blink = false; }
      else if (strain > 0.2) { o.mouth = 'grit'; o.brow = 'angry'; o.tired = 1; }
      else if (drafted) { o.brow = 'angry'; o.look = clamp((p.x - x) / 30, -1.2, 1.2); if (grit) o.mouth = 'grit'; }
      else if (chased) { o.lookY = 1; o.look = clamp((p.x - x) / 30, -1.2, 1.2); o.brow = 'worried'; if (gap < 80) o.mouth = 'grit'; o.amp *= 1.2; o.blink = false; }
      else if (sprint) { o.mouth = 'pant'; o.brow = 'angry'; o.flap = 2; }
      else if (hunter && !(pt > 0)) { o.mouth = 'grit'; o.brow = 'angry'; o.look = p.x > x ? 1.2 : -1.2; }
      // a hot Kevin within 220: the rivals look at him, worried (Steve is just happy for him, and blushes)
      if (hot && dK < 220 && !dq && !(bt > 0)) {
        if (fn === 'Steve') { o.happy = 1; o.blush = 1; o.mouth = 'grin'; o.brow = undefined; }
        else { o.brow = 'worried'; o.look = clamp((p.x - x) / 30, -1.2, 1.2); o.blink = false; if (o.mouth === L.mouth) o.mouth = 'scared'; }
      }
      if (wi >= 0 && !(bt > 0) && nearW(a, 110, false, A) >= 0) { o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; o.look = 0; o.blink = false; }
      if (smugK > 0) { o.mouth = 'smirk'; o.look = p.x > x ? 1.2 : -1.2; o.blink = false; o.wink = 0; o.brow = 'angry'; }
      if (peek > 0) { o.shock = 1; o.look = 0; o.blink = false; }
      if (flick >= 0) { o.mouth = 'grin'; o.look = 1.2; }
      if (mirror) { o.look = 1.2; o.mouth = 'smirk'; o.blink = false; }
      if (bowK) { o.happy = 1; o.blush = 1; o.mouth = 'wobble'; }
      if (oopsK >= 0) {   // the beat (faces stay for reduced motion; the shakes and rolls go)
        const fx = p.x > x ? 1.2 : -1.2;
        if (fn === 'Chad') { o.mouth = 'huge'; o.happy = 1; o.blink = false; o.dizzy = 0; }
        else if (fn === 'Brock') { o.mouth = 'grin'; o.brow = 'angry'; }
        else if (fn === 'Steve') { o.mouth = 'scared'; o.brow = 'worried'; o.shock = 1; o.look = 0; o.blink = false; o.happy = 0; }
        else if (fn === 'Tiffany') { o.mouth = 'smirk'; o.brow = 'angry'; o.look = fx; o.blink = false; }
        else if (fn === 'Gunther') { o.mouth = 'grin'; o.look = fx; }
      }
      if (cbMode && !o.dizzy) {   // the combo fright's face
        const kl = p.x > x ? 1.2 : -1.2;
        if (cbMode === 1 || cbMode === 4) { o.mouth = 'scared'; o.brow = 'worried'; o.look = kl; o.blink = false; o.happy = 0; }
        else if (cbMode === 2) { o.mouth = 'smirk'; o.brow = 'worried'; o.look = kl; o.lid = 0.45; o.blink = false; o.happy = 0; }
        else { o.happy = 1; o.blush = 1; o.mouth = 'grin'; o.brow = undefined; o.blink = false; }
      }
      if (win && rk >= 0) {
        o.dizzy = rk < 0.15 && knocked ? 1 : 0;
        if (fn === 'Steve') { o.mouth = 'grin'; o.brow = undefined; o.happy = rk < 1 ? 1 : 0; o.blush = 1; }
        else if (fn === 'Brock') { o.mouth = rk < 1 ? 'grit' : 'wobble'; o.brow = 'worried'; }
        else if (fn === 'Tiffany') { o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; o.look = 0; o.blink = false; }
        else if (fn === 'Gunther') { o.mouth = 'wobble'; o.brow = undefined; }
        else if (fn === 'Chad') { o.mouth = 'smirk'; o.brow = 'angry'; o.look = p.x > x ? -1.2 : 1.2; }
      }
      if (this.isImp(a)) { o.flash = 1; o.tail = '#ffffff'; } else if (this.impRing(a)) o.ring = 1;
      // heroes stand out: an ink outline, and the last third of the tail in the rival's own colour
      o.ink = 1; o.tipCol = a.boss.col;
      // readable by tail alone: the whole tail tinted 40% toward the rival's colour (cached on the agent like A.sc),
      // the full-colour tip from sample 6 (k about 0.45), and never thinner than 3.0 (Tiffany's 2.4 too; her
      // straight, stiff swim stays). Kevin keeps the only fully pink tail; the crowd stays white.
      // (its own field tfC: A.tf is the tail beat rate track() eases, which this used to overwrite with a string)
      if (A.tfK !== a.boss.col) { A.tfK = a.boss.col; A.tfC = css(lerpC(WHITE, rgb(a.boss.col), 0.4)); }
      o.tf = A.tfC; o.tipS = 6; o.tw = Math.max(3.0, o.tw || 3.4);
      // reactive shades: they move with the face instead of hiding it. Shock (a pass, the panic face): pushed up
      // (-6, 0.85x) so the wide eyes show; dizzy (a bump, a shove, a counter): knocked askew (0.35 rad, +2.5), one
      // spiral eye showing; worried, gloating, winking or a smirk that is not its resting face: lowered (+3.2), the
      // eyes peeking over; happy, or the egg lost: lowered with the eyes shut. Chad's fly off on a bump.
      o.shadesY = 0; o.shadesR = 0; o.shadesS = 1; o.shadesOff = 0;
      if (L.acc && L.acc.includes('shades')) {
        const dz = !!o.dizzy || bt > 0 || shv > 0 || mv === 'countered', shk = !dz && (!!o.shock || pt > 0 || o.mouth === 'scared');
        const sulk = win && rk >= 0, hap = !dz && !shk && (!!o.happy || sulk);
        const pk = !dz && !shk && !hap && (o.brow === 'worried' || gloat || !!o.wink || smugK > 0 || (o.mouth === 'smirk' && L.mouth !== 'smirk'));
        if (hap && !o.happy) o.blink = true;
        const tY = shk ? -6 : dz ? 2.5 : hap || pk ? 3.2 : 0, tR = dz ? 0.35 : 0, tS = shk ? 0.85 : 1, k = red ? 1 : Math.min(1, dt * 14);
        A.shY += (tY - A.shY) * k; A.shR += (tR - A.shR) * k; A.shS += (tS - A.shS) * k;
        // Chad's fly off on the bump that dizzies him (a spinning dark scrap) and pop back on once it wears off
        if (fn === 'Chad' && bt > 0 && !(A.shPb > 0) && !red && !A.shOff) {
          A.shOff = 1;
          const s0 = Math.random() < 0.5 ? -1 : 1;
          this.addP(2, x, this.camY + this.H - (y - 4 * RIVAL_SC), s0 * (60 + Math.random() * 60), 150 + Math.random() * 60, 0.4, '#141420', 9, 220, Math.random() * TAU, s0 * (14 + Math.random() * 6));
        }
        if (A.shOff && !(bt > 0)) { A.shOff = 0; A.shBack = T; }
        A.shPb = bt;
        o.shadesY = A.shY; o.shadesR = A.shR; o.shadesOff = A.shOff;
        o.shadesS = A.shS * (T - A.shBack < 0.25 ? Math.max(0.05, backOut((T - A.shBack) / 0.25)) : 1);
      }
      if (meet) { const lb = A.lbl || (A.lbl = { fs: 0, ring: 1, sc: 1 }); lb.fs = this.fpx(16); lb.sc = Math.max(0.05, red ? 1 : backOut(Math.min(1, meetT / 0.3))); o.lbl = lb; } else o.lbl = null;
      // readable faces: a new face that lands with a story beat pops the head (popK)
      const beatOn = pt > 0 || gloat || smugK > 0 || oopsK >= 0 || meet || bt > 0 || (hot && dK < 220 && !dq) || flick >= 0 || bowK > 0;
      // tiring: a named rival that has burned its stamina flags late in the race (fade = (1 - stam) * 0.28 * y / RACE_LEN).
      // Past 0.06, with no story beat playing: it pants, its tail beats at 0.7x and droops, and it drips a sweat drop every 0.9 s
      const fade = (1 - (a.stam == null ? 1 : a.stam)) * 0.28 * a.y / RACE_LEN;
      A.tiredK = 0;
      if (fade > 0.06 && !beatOn && !dq && !ov && !sprint && !mv && !drafted && !(strain > 0.2) && wi < 0 && !o.dizzy) {
        A.tiredK = 1; o.mouth = 'pant'; o.tired = 1; o.amp *= 0.7; o.curl = (o.curl || 0) + (red ? 0.12 : 0.1 + 0.05 * Math.sin(t * 1.3 + a.ph));
        A.swd = (A.swd !== A.swd ? Math.random() * 0.9 : A.swd) - dt;
        if (A.swd <= 0) { A.swd = 0.9; const sg = Math.random() < 0.5 ? -1 : 1; this.addP(3, x + sg * 11, a.y + A.oy + 12, sg * (30 + Math.random() * 30), 30 + Math.random() * 30, 0.6, '#9ae2ff', 2.4, 220); }
      }
      if (!o.blink && (o.shock || o.happy || o.wink || o.dizzy || o.tired)) o.lid = 0;   // (a face that holds its eyes open)
      const faceKey = faceId(o.mouth) * 256 + faceId(o.brow) * 4 + (o.shock ? 2 : 0) + (o.dizzy ? 1 : 0);   // (a number: no string a rival a frame)
      if (faceKey !== A.fk) { if (beatOn && A.fk !== -1) A.popT = T; A.fk = faceKey; }
      A.headK = this.popK(A.popT, beatOn, T); o.headK = A.headK;
      // talking: while a bubble of its own is up (this.bubble or a duel bubble) the mouth flaps between an open shape
      // and its resting one every 0.075 s for min(0.15 n, 0.8 x the bubble's life) s (n = the line's length / 6, 2..7),
      // the head popping for 0.3 s on a new line. Reduced motion: the open mouth held 0.3 s, no flapping
      {
        const bb = this.bubOf(race, a);
        if (bb && !o.dizzy) {
          if (A.bub !== bb) { A.bub = bb; A.bubT = T; }
          const age = T - A.bubT, nf = clamp(Math.round(bb.text.length / 6), 2, 7), fw = Math.min(0.15 * nf, 0.8 * bb.max);
          const OPEN = fn === 'Brock' || fn === 'Chad' ? 'huge' : fn === 'Gunther' ? 'grin' : 'scared';
          if (red ? age < 0.3 : age < fw) {
            const op = red || Math.floor(age / 0.075) % 2 === 0;
            o.mouth = op ? OPEN : L.mouth; o.blink = false; o.lid = 0;
            if (op) o.sy = (o.sy || 1) * 1.03;
          }
          if (age < 0.3) { const u = age / 0.3; o.headK = Math.max(o.headK || 1, red ? 1.15 : 1 + 0.3 * Math.sin(u * Math.PI)); }
        } else if (!bb) A.bub = null;
      }
      const sq = this.impSquash(a, x, y), dimR = (goDim && dK < 120 ? 0.6 : 1) * (A.bh && !dq ? 0.7 : 1);
      if (dimR < 1) c.globalAlpha = dimR;
      this.drawSwimmer(x, y, ang, RIVAL_SC, bodyCol, ph, o);
      if (dimR < 1) c.globalAlpha = 1;
      if (sq) c.restore();
      // Tiffany reads while she cruises (and peeks over the book when Kevin passes)
      // (cruising: no pass, bump, sprint or duel; and always while she plays it by the book)
      const reading = L.read && !dq && !ov && !(coilK < 0) && (peek > 0 || smugK > 0 || smugO > 0 || (!(pt > 0) && !(bt > 0) && !sprint && wi < 0 && !(mv === 'countered')));
      if (reading || (mv && mv !== 'countered' && A.mv === 'byTheBook')) {
        const m = WM;
        setXf(c, m, x, y, ang, RIVAL_SC * sx, RIVAL_SC * sy);
        const book = A.mv === 'byTheBook' && (mv === 'tell' || mv === 'hit');
        if (book) {   // by the book: it opens wide (1.4x), three pages fan out of it; the hit underlines the rule in gold
          const op = red ? 1 : Math.min(1, mvK * 4 + (mv === 'hit' ? 1 : 0));
          this.bookArt(13, -8, 0.7 + 0.7 * op, 9);
          const fan = mv === 'hit' ? 1 : op;
          for (let i = 0; i < 3; i++) {
            c.save(); c.translate(13, -8); c.rotate((i - 1) * 0.5 * fan - 0.15); c.translate(0, -6 * fan);
            c.fillStyle = '#fffbe8'; c.fillRect(-2.2, -3.4, 4.4, 5.4); c.fillStyle = 'rgba(90,70,120,0.5)'; c.fillRect(-1.5, -2.2, 3, 0.5); c.fillRect(-1.5, -1, 3, 0.5);
            c.restore();
          }
          if (mv === 'hit') { const g = red ? 1 : 0.6 + 0.4 * Math.sin(mvK * Math.PI * 6); c.globalAlpha = g; c.fillStyle = '#ffd75c'; c.fillRect(13 - 7.5, -8 + 5, 15, 1.4); c.globalAlpha = 1; }
        } else this.bookArt(11, -4 + 6 * peek - 5 * Math.max(smugK, smugO), 0.7, (T + a.ph * 5) % 2.4);
        if (peek > 0) {   // two glints on her glasses
          c.fillStyle = '#ffffff'; c.globalAlpha = Math.min(1, peek * 1.5);
          star4(c, -2.2, -4.2, 1.2); star4(c, 4.2, -4.2, 1.2); c.globalAlpha = 1;
        }
        c.setTransform(m);
      }
      // the sidekicks: Gunther's cameraman Dieter and Brock's shake bottle Gerald (drawSidekick)
      if ((fn === 'Gunther' || fn === 'Brock') && !this.lite && dK < 500) this.drawSidekick(a, A, fn, x, y, ang, sx, sy, dt, bt, rollK, mv, flexK, ph);
      if (flick >= 0) {   // the sparkle at the quiff, a tooth glint for the first 0.3 s
        const m = WM;
        setXf(c, m, x, y, ang, RIVAL_SC * sx, RIVAL_SC * sy);
        c.fillStyle = '#fffbe0'; star4(c, 5.5, -15.5, 2.8 * (red ? 1 : 0.6 + 0.4 * Math.sin(flick * Math.PI)));
        if (flick * 0.45 < 0.3) { c.fillStyle = '#ffffff'; star4(c, 1.6, 3.2, 1.6); }
        c.setTransform(m);
      }
      if (mirror) this.mirrorArt(x + 13, y - 6, t);
      if (mv === 'tell') {   // the red '!' over its head
        const by = y - 48 * Math.max(1, sy) - (red ? 0 : 3 * Math.sin(mvK * Math.PI * 3));
        this.dangerBadge(x, by, 1);
      }
      if (mv === 'countered') { c.fillStyle = '#ffd75c'; for (let i = 0; i < 3; i++) { const an = t * 9 + i * TAU / 3; star4(c, x + Math.cos(an) * 15, y - 18 + Math.sin(an) * 4, 3.2); } }
      if (nem) {   // the nemesis: a pulsing anger vein at the top right of the head
        const ca = Math.cos(ang), sa = Math.sin(ang), lx = 7 * RIVAL_SC * sx, ly = -10 * RIVAL_SC * sy, vx = x + lx * ca - ly * sa, vy = y + lx * sa + ly * ca;
        this.angerVein(vx, vy, 3.4 * (red ? 1 : 1 + 0.18 * Math.sin(t * 8 + a.ph)));
      }
      if (bt > 0) { c.fillStyle = '#ffd75c'; for (let i = 0; i < 2; i++) { const an = t * 8 + i * Math.PI; star4(c, x + Math.cos(an) * 13, y - 17 + Math.sin(an) * 4, 3.2); } }
      if (waveK >= 0 && !bt) {   // Steve waves at you. Steve waves at everybody.
        const m = WM;
        setXf(c, m, x, y, ang, RIVAL_SC * sx, RIVAL_SC * sy); this.waveHand(waveK); c.setTransform(m);
      }
      if (flexK > 0.2) {   // Brock flexes. With what, nobody knows.
        c.globalAlpha = flexK * 0.8; c.fillStyle = '#fff';
        for (let s = -1; s <= 1; s += 2) { c.beginPath(); c.arc(x + s * (14 + 5 * flexK), y - 6 - 4 * flexK, 2.2 + 1.6 * flexK, 0, TAU); c.fill(); c.beginPath(); c.arc(x + s * (18 + 6 * flexK), y - 10 - 5 * flexK, 1.4 + flexK, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
      }
    }
    this.drawBooks(dt);
    this.drawGhosts(dt);
    this.flushLabels(race, dt);
  }
  // the rivals' sidekicks, at most one of each a frame, only within 500 of Kevin and never on lite (drawAgents' named
  // rival block calls it after the rival itself; x, y, ang, sx, sy are the rival's frame this frame). Per rival state
  // lives in A.sk (made once), the swimmer's look in this.dieO: no allocation a frame.
  // Dieter (with Gunther): a 0.55x swimmer (CROWD[3], a grey beanie, tail amp 4) trailing at local (-24, +20) on a
  // 0.25 s lerp, holding a 7 x 5 dark camera with a '#9ae2ff' lens and a 1 Hz red REC dot. Gunther's stunt (the dive's
  // tell or hit) or a roll fires a white star4 flash off it; a bump on Gunther makes him cry ('#9ae2ff' tears, a
  // 'wobble' mouth). Reduced motion: no lag, no flash.
  // Gerald (with Brock): an 8 x 12 shake bottle ('#f3e6ff', '#ff7a2f' lid, a bent straw, two dot eyes) held at local
  // (+13, +2). A tired Brock (A.tiredK) sips from it every 1.4 s; a flex (flexK > 0.2) bobs Gerald up 3 units.
  drawSidekick(a, A, fn, x, y, ang, sx, sy, dt, bt, rollK, mv, flexK, ph) {
    const F = this.skF || (this.skF = { d: -1, g: -1 });
    const c = this.ctx, T = this.time, red = this.reduced, m = this.worldM;
    const S = A.sk || (A.sk = { x: 0, y: 0, f: -9, fl: -9, roll: false, stunt: false });
    if (fn === 'Gunther') {
      if (F.d === this.frame) return;
      F.d = this.frame;
      const ca = Math.cos(ang), sa = Math.sin(ang), k = RIVAL_SC, tx = x + (-24 * ca - 20 * sa) * k, ty = y + (-24 * sa + 20 * ca) * k;
      if (red || S.f !== this.frame - 1 || Math.abs(S.x - tx) + Math.abs(S.y - ty) > 160) { S.x = tx; S.y = ty; }
      else { const u = 1 - Math.exp(-Math.max(0, dt) / 0.25); S.x += (tx - S.x) * u; S.y += (ty - S.y) * u; }
      S.f = this.frame;
      // the flash: on the rising edge of a roll or the stunt dive (its tell or hit)
      const roll = rollK >= 0, stunt = !!mv && mv !== 'countered' && A.mv === 'stuntDive';
      if (((roll && !S.roll) || (stunt && !S.stunt)) && !red && !this.noFlash) S.fl = T;
      S.roll = roll; S.stunt = stunt;
      const sad = bt > 0, s = 0.55 * RIVAL_SC, O = this.dieO || (this.dieO = { acc: [], amp: 4, mouth: 'grin', brow: undefined, look: 0.8, blink: false, stretch: 1, yaw: 1, ink: 0, taper: 0 });
      O.mouth = sad ? 'wobble' : 'grin'; O.brow = sad ? 'worried' : undefined; O.look = sad ? 0 : 0.8;
      this.drawSwimmer(S.x, S.y, ang, s, CROWD[3], ph * 1.2 + 1.3, O);
      setXf(c, m, S.x, S.y, ang, s, s);
      // the beanie: a grey dome over the top of the head, a ribbed band and a pom
      c.fillStyle = '#8d93a3'; c.beginPath(); c.ellipse(0, -5.4, 7.9, 5.6, 0, Math.PI, TAU); c.fill();
      c.fillStyle = '#6d7383'; c.fillRect(-8, -6.2, 16, 2.2);
      c.fillStyle = '#b3b8c4'; c.beginPath(); c.arc(0, -11.6, 2.1, 0, TAU); c.fill();
      if (sad) {   // tears rolling off both eyes
        const d = red ? 0.5 : (T * 2.2) % 1;
        c.fillStyle = '#9ae2ff'; c.beginPath();
        for (let i = 0; i < 2; i++) { const ex = i ? 2.8 : -2.8, ey = 1 + d * 6; c.moveTo(ex + 1.1, ey); c.ellipse(ex, ey, 1.1, 1.6, 0, 0, TAU); }
        c.fill();
      }
      // the camera, up at his right, aimed at Gunther: a dark body, the lens, the REC dot (1 Hz; held on for reduced motion)
      c.fillStyle = '#23222e'; c.fillRect(6, -6.5, 7, 5);
      c.fillStyle = '#9ae2ff'; c.beginPath(); c.arc(13.2, -4, 1.5, 0, TAU); c.fill();
      if (red || (T % 1) < 0.5) { c.fillStyle = '#ff3d3d'; c.beginPath(); c.arc(7.4, -5.2, 0.8, 0, TAU); c.fill(); }
      const fu = (T - S.fl) / 0.2;
      if (fu >= 0 && fu < 1) { c.globalAlpha = 1 - fu; c.fillStyle = '#ffffff'; star4(c, 13.2, -4, 5 + 6 * fu); c.globalAlpha = 1; }
      c.setTransform(m);
      return;
    }
    // Gerald
    if (F.g === this.frame) return;
    F.g = this.frame;
    const fk = clamp((flexK - 0.2) / 0.3, 0, 1);
    let gx = 13, gy = 2 - 3 * fk, gr = 0;
    if (A.cbK === 20 && T - A.cbT >= 0 && T - A.cbT < 1 && !red) gx += 1.2 * Math.sin(T * 24 * TAU + 1.3);   // (shaking with Brock)
    if (A.tiredK) {   // a sip every 1.4 s: up to the mouth, a tilt, back down
      const u = (T + a.ph * 3) % 1.4;
      if (u < 0.5) { const k = Math.sin(u / 0.5 * Math.PI); gx -= 6 * k; gy -= 5 * k; gr = -0.8 * k; }
    }
    setXf(c, m, x, y, ang, RIVAL_SC * sx, RIVAL_SC * sy);
    c.translate(gx, gy); if (gr) c.rotate(gr);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = '#ff5ca8'; c.lineWidth = 1; c.beginPath(); c.moveTo(1.4, -6.5); c.lineTo(1.4, -10); c.lineTo(-1.2, -12.2); c.stroke();   // the bent straw
    this.rrect(-4, -6, 8, 12, 2.6); c.fillStyle = '#f3e6ff'; c.fill(); c.strokeStyle = HZ_INK; c.lineWidth = 0.8; c.stroke();
    this.rrect(-4.4, -7.6, 8.8, 2.6, 1.1); c.fillStyle = '#ff7a2f'; c.fill(); c.stroke();
    c.fillStyle = '#2a1030'; c.beginPath(); c.arc(-1.6, -1.2, 0.85, 0, TAU); c.moveTo(2.45, -1.2); c.arc(1.6, -1.2, 0.85, 0, TAU); c.fill();
    c.setTransform(m);
  }
  // combos frighten the cast: this.cTier is the index of the highest COMBO_WORDS entry Kevin's combo has reached (-1
  // under the first, reset at combo 0). Each time it rises, ONE named rival seen within 400 px gets a 1 s beat
  // (A.cbT, A.cbK: the threshold): 20 goes to Brock (else the nearest) and trembles with 2 sweat drops; 45 and up to
  // Chad (his quiff sags, a side-eye); from 10, Steve swoons for 0.4 s; anyone else picked just looks scared
  comboFright(race) {
    const p = race.p, combo = race.demo || race.over ? 0 : p.combo | 0, CW = K.COMBO_WORDS;
    let ti = -1;
    if (Array.isArray(CW)) for (let i = 0; i < CW.length; i++) if (combo >= CW[i][0]) ti = i;
    if (combo <= 0) { this.cTier = -1; return; }
    if (ti <= this.cTier) { if (ti < this.cTier) this.cTier = ti; return; }
    this.cTier = ti;
    const thr = CW[ti][0], want = thr === 20 ? 'Brock' : thr >= 45 ? 'Chad' : thr >= 10 ? 'Steve' : null;
    if (!want) return;
    const AG = race.agents, nr = Math.min(NRIV, AG.length);
    let pick = null, pA = null, bd = 400, nm = null, nA = null;
    for (let k = 0; k < nr; k++) {
      const a = AG[k]; if (!a.alive || !a.boss) continue;
      const A = this.aux.get(a); if (!A || !A.init || A.seen < this.frame - 1) continue;
      const d = hyp(A.rx - p.x, a.y - p.y); if (d >= 400) continue;
      if (A.fn === want || (A.fn == null && a.boss.name && a.boss.name.split(' ')[0] === want)) { pick = a; pA = A; }
      if (d < bd) { bd = d; nm = a; nA = A; }
    }
    if (!pick) { pick = nm; pA = nA; }
    if (!pick) return;
    pA.cbT = this.time; pA.cbK = thr;
    if (thr === 20 && !this.reduced) {   // 2 sweat drops off the trembling head
      const hx = pA.rx, hy = pick.y + (pA.oy || 0) + 12;
      for (let i = 0; i < 2; i++) { const sg = i ? 1 : -1; this.addP(3, hx + sg * 11, hy, sg * (30 + Math.random() * 30), 30 + Math.random() * 30, 0.6, '#bfe8ff', 2.4, 220); }
    }
  }
  // the head scale of a face pop that started at popT: a backOut spring over 0.35 s (1 -> 1.35 -> 1.08), then 1.08
  // while the beat lasts and 1.0 at rest. Reduced motion: a plain 1.15x step for 0.35 s, no spring.
  popK(popT, beatOn, T) {
    const u = (T - popT) / 0.35;
    if (this.reduced) return u >= 0 && u < 1 ? 1.15 : 1;
    if (u >= 0 && u < 1) return u < 0.3 ? 1 + 0.35 * Math.sin(u / 0.3 * Math.PI / 2) : 1.08 + 0.27 * (1 - (u - 0.3) / 0.7) * (1 - (u - 0.3) / 0.7);
    return beatOn ? 1.08 : 1;
  }
  // a little waving hand in the rival's own (local) frame, at (10, -2): it turns and scales with the body
  waveHand(k) {
    const c = this.ctx, g = backOut(Math.min(1, k * 4)) / RIVAL_SC;
    c.save(); c.translate(10, -2); c.rotate(-0.4 + (this.reduced ? 0 : Math.sin(k * 18) * 0.5)); c.scale(g, g);
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(40,0,40,0.4)'; c.lineWidth = 0.9;
    c.beginPath(); c.arc(0, -5, 3.6, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.arc(-3.2, -4, 1.4, 0, TAU); c.fill(); c.stroke();
    c.restore();
  }
  // Tiffany's open book in the current (local) frame, centred at x, y; fl: seconds into its 2.4 s page cycle
  bookArt(x, y, sc, fl = 9) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.scale(sc, sc);
    c.fillStyle = '#5b7cff'; c.fillRect(-6, -4.5, 12, 9); c.fillStyle = '#fffbe8'; c.fillRect(-5, -3.5, 10, 7);
    c.fillStyle = 'rgba(90,70,120,0.45)'; for (let i = 0; i < 3; i++) { c.fillRect(-4.2, -2 + i * 1.8, 3.2, 0.5); c.fillRect(1, -2 + i * 1.8, 3.2, 0.5); }
    c.fillStyle = '#5b7cff'; c.fillRect(-0.6, -4.5, 1.2, 9); c.fillStyle = '#ff5ca8'; c.fillRect(3, -6, 1.4, 3);
    if (fl < 0.3 && !this.reduced) {   // a page turns over the spine
      const k = Math.cos(fl / 0.3 * Math.PI);
      c.fillStyle = '#fff3d0'; c.fillRect(Math.min(0, 5 * k), -3.5, Math.abs(5 * k) + 0.2, 7);
    }
    c.restore();
  }
  // Chad's hand mirror (screen space): a little rounded glass on a handle, with a glint
  mirrorArt(x, y, t) {
    const c = this.ctx;
    c.strokeStyle = '#b07a10'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y + 5); c.lineTo(x - 2, y + 11); c.stroke();
    c.fillStyle = '#ffd75c'; this.rrect(x - 4.5, y - 7, 9, 12, 3); c.fill();
    c.fillStyle = '#cfefff'; this.rrect(x - 3, y - 5.5, 6, 9, 2); c.fill();
    c.fillStyle = '#ffffff'; star4(c, x + 1.2, y - 3, 2 + (this.reduced ? 0 : Math.abs(Math.sin(t * 6))));
  }
  // a named rival's move (systems event rivalMove {k, move, phase: 'tell' | 'hit' | 'countered'}): drawAgents
  // plays it (a '!' and a wind-up, a lunge at the egg, a gold burst and a dizzy spin)
  rivalMove(ev) {
    const race = this.race;
    if (!ev || !race || !race.agents) return;
    let a = null;
    for (const q of race.agents) if (q.boss && (q === ev.k || q.k === ev.k)) { a = q; break; }
    if (!a || !MV_DUR[ev.phase]) return;
    const A = this.ax(a);
    A.mv = ev.move; A.mvP = ev.phase; A.mvT = this.time;
    A.mvD = ev.phase === 'tell' && ev.move === 'byTheBook' && +ev.t > 0 ? clamp(+ev.t, MV_DUR.tell, 2.5) : MV_DUR[ev.phase];
    // the tell wedge (screen space, drawTellWedge): 0.8 s on the rival's half of the screen; a hit or a counter fades it
    if (ev.phase === 'tell') {
      let side = ev.side === -1 || ev.side === 1 ? ev.side : a.eggSide === -1 || a.eggSide === 1 ? a.eggSide : 0;
      if (!side) { const q = this.duel.get(a); side = q ? (q.x < centre(RACE_LEN) ? -1 : 1) : A.init && A.rx < VIEW_W / 2 ? -1 : 1; }
      this.wedge = { a, side, col: a.boss.col, t0: this.time, end: null };
    } else if (this.wedge && this.wedge.a === a && this.wedge.end == null) this.wedge.end = this.time;
    // Tiffany's counter scatters her pages (drawBooks)
    if (ev.phase === 'countered' && ev.move === 'byTheBook' && A.init) {
      const q = this.duel.get(a), sx = q ? q.x : A.rx, sy = q ? q.y : this.sy(a.y + (A.oy || 0));
      for (let i = 0; i < 3; i++) this.books.push({ a, t: 0, x: sx + (i - 1) * 6, y: sy - 8, s: i === 1 ? (Math.random() < 0.5 ? -1 : 1) : i - 1, page: 1, sp: 0.7 + 0.3 * i });
      if (this.books.length > 8) this.books.splice(0, this.books.length - 8);
    }
    if (ev.phase === 'countered' && A.init) {
      const wy = a.y + (A.oy || 0), n = this.lite || this.reduced ? 5 : 10;
      for (let i = 0; i < n; i++) { const an = i / n * TAU, v = 120 + Math.random() * 80; this.addP(1, A.rx, wy, Math.cos(an) * v, Math.sin(an) * v, 0.4, i % 2 ? '#ffd75c' : '#fff3c0', 2.6); }
      this.ring(A.rx, wy, '#ffd75c', 40, 0.35, 4);
    }
  }
  // Tiffany drops her book when Kevin wins: it tumbles down the screen and fades
  drawBooks(dt) {
    const B = this.books;
    if (!B.length) return;
    const c = this.ctx; let n = 0;
    for (const b of B) {
      b.t += dt; if (b.t > 1.4) continue; B[n++] = b;
      const k = b.t / 1.4, fy = b.y + 8 + 90 * k * k, fx = b.x + b.s * (12 + 18 * k), r = b.s * (0.3 + k * 5);
      c.save(); c.translate(fx, fy); c.rotate(r * (b.page ? b.sp || 1 : 1)); c.globalAlpha = Math.min(1, (1 - k) * 3);
      if (b.page) { c.fillStyle = '#fffbe8'; c.fillRect(-3, -4, 6, 8); c.fillStyle = 'rgba(90,70,120,0.45)'; for (let i = 0; i < 3; i++) c.fillRect(-2, -2.4 + i * 1.8, 4, 0.5); }
      else this.bookArt(0, 0, 1);
      c.restore();
    }
    B.length = n; c.globalAlpha = 1;
  }
  // a named rival who dropped out: a ghost of them (their colour, their hat) rises 60 px with a halo over 1.6 s,
  // with a farewell line when content.js has RIVAL_FAREWELLS
  // (at: an optional world {x, y} it rises from, the Big Mac that ate it)
  rivalGhost(a, at = null) {
    const A = this.ax(a), fn = A.fn || (A.fn = a.boss.name.split(' ')[0]), gx = at ? at.x : A.rx, gy = at ? at.y : a.y + (A.oy || 0);
    const g = { fn, col: css(lerpC(rgb(a.boss.col), [255, 255, 255], 0.45)), halo: a.boss.col, x: gx, y: gy, t: 0, max: 1.6, ph: A.tp || 0, sx: gx, sy: this.sy(gy) };
    this.ghosts.push(g);
    if (this.ghosts.length > 4) this.ghosts.shift();
    const line = lineOf(K.RIVAL_FAREWELLS, fn, a.boss.name);
    if (line) { this.say(fn, line, 1.6); this.bubble.ghost = g; }
  }
  // a named rival swallowed by a Big Mac (one eating within 60 px as it drops out): for 2.5 s its signature item
  // pokes out of the Mac's mouth with its tail tip in its colour (the st.tail slot of wbcState), then a burp spins the
  // item out and the ghost rises from the Mac. R.rivalEaten = its rival index for that one frame (ui says a line)
  rivalSwallow(race, a, A) {
    let best = null, bd = 3600;
    for (const e of race.ents) {
      if (e.t !== 'wbc' || e.dead || !(e.eat > 0)) continue;
      const dx = e.x - (A.rx != null ? A.rx : a.x), dy = e.y - a.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return false;
    let st = this.wbcState.get(best); if (!st) { st = { eating: 0, burp: 0, full: 0, tail: 0, alert: 0, bang: 0, spotT: 0 }; this.wbcState.set(best, st); }
    const fn = A.fn || (A.fn = a.boss.name.split(' ')[0]);
    st.tail = 2.5; st.full = 1; st.riv = { a, fn, col: a.boss.col, item: RIVAL_ITEM[fn] || 'cap' };
    this.rivalEaten = a.k != null ? a.k : fn; this.rivalEatenF = this.frame;
    return true;
  }
  // the item poking out of a Big Mac's mouth (tip at x, y, pointing along ang)
  rivalItem(kind, x, y, ang, sc = 1) {
    const c = this.ctx, IC = RIVAL_ITEM_COL;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc, sc); c.lineJoin = 'round';
    c.strokeStyle = HZ_INK; c.lineWidth = 1.6;
    if (kind === 'crown') { c.fillStyle = IC.crown; c.beginPath(); c.moveTo(-6, 3); c.lineTo(-6, -3); c.lineTo(-3, 0); c.lineTo(0, -5); c.lineTo(3, 0); c.lineTo(6, -3); c.lineTo(6, 3); c.closePath(); c.stroke(); c.fill(); }
    else if (kind === 'book') { c.fillStyle = IC.book; c.beginPath(); c.rect(-5, -4, 10, 8); c.stroke(); c.fill(); c.fillStyle = '#fffbe8'; c.fillRect(-4, -3, 3.6, 6); c.fillRect(0.4, -3, 3.6, 6); }
    else if (kind === 'band') { c.strokeStyle = HZ_INK; c.lineWidth = 4.6; c.beginPath(); c.arc(0, 3, 6, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.strokeStyle = IC.band; c.lineWidth = 3; c.stroke(); }
    else if (kind === 'mohawk') { c.fillStyle = IC.mohawk; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(i * 2.2 - 1.6, 3); c.lineTo(i * 2.2, -3 - (2 - Math.abs(i)) * 1.5); c.lineTo(i * 2.2 + 1.6, 3); } c.stroke(); c.fill(); }
    else { c.fillStyle = IC.cap; c.beginPath(); c.arc(0, 2, 5, Math.PI, TAU); c.closePath(); c.stroke(); c.fill(); c.fillRect(0, 1, 8, 2); }
    c.restore();
  }
  drawGhosts(dt) {
    const G = this.ghosts;
    if (!G.length) return;
    const c = this.ctx, red = this.reduced, t = this.time, o = this.gho || (this.gho = {});
    let n = 0;
    for (const g of G) {
      g.t += dt; if (g.t >= g.max) continue; G[n++] = g;
      const k = g.t / g.max, e = 1 - (1 - k) * (1 - k), gx = g.x + (red ? 0 : Math.sin(g.t * 5) * 6), gy = this.sy(g.y) - 60 * e;
      const al = 0.8 * Math.min(1, (1 - k) / 0.3, g.t / 0.15), sc = RIVAL_SC * 1.1, L = BOSS_LOOK[g.fn] || {};
      g.sx = gx; g.sy = gy;
      this.dglow(g.halo, gx, gy, 38, 0.45 * al);
      o.acc = L.acc; o.cap = L.cap; o.band = L.band; o.quiff = L.quiff ? 1 : 0; o.taper = 1; o.amp = 3; o.tw = 2.6; o.tlen = 0.8;
      o.ko = 1; o.mouth = 'wobble'; o.tail = 'rgba(255,255,255,0.55)'; o.yaw = 0; o.stretch = 1;
      c.globalAlpha = al;
      this.drawSwimmer(gx, gy, red ? 0 : Math.sin(g.t * 3) * 0.2, sc, g.col, g.ph + g.t * 5, o);
      c.strokeStyle = '#ffd75c'; c.lineWidth = 1.8; c.beginPath(); c.ellipse(gx, gy - 16 * sc - (L.acc && L.acc.includes('crown') ? 6 : 0), 7, 2.4, 0, 0, TAU); c.stroke();
      c.globalAlpha = 1;
    }
    G.length = n;
  }
  // the cartoon anger mark: four little brackets round a centre (r is half its 6 px size)
  angerVein(x, y, r) {
    const c = this.ctx;
    c.strokeStyle = '#ff4d5e'; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath();
    for (let q = 0; q < 4; q++) {
      const a = q * Math.PI / 2 + Math.PI / 4, cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
      c.moveTo(cx + Math.cos(a + 2.2) * r * 0.75, cy + Math.sin(a + 2.2) * r * 0.75);
      c.quadraticCurveTo(cx, cy, cx + Math.cos(a - 2.2) * r * 0.75, cy + Math.sin(a - 2.2) * r * 0.75);
    }
    c.stroke();
  }
  // the speech bubble's place this frame (this.bubL, or null): above its speaker, but never within 70 px of
  // Kevin's centre (then below, or beside on the speaker's far side), clear of other tags, never under the HUD.
  // While the egg is drilled a line lasts 1.2 s at most.
  layoutBubble(race, dt) {
    this.bubL = null;
    const b = this.bubble;
    if (!b) return null;
    if (race.drill && b.max > 1.2) { b.life = Math.min(b.life, 1.2 - Math.min(1.2, b.max - b.life)); b.max = 1.2; }
    b.life -= dt; if (b.life <= 0) { this.bubble = null; return null; }
    let a = b.k;
    if (typeof a === 'number') a = race.agents[a];
    else if (typeof a === 'string') { const nm = a.toLowerCase(); a = race.agents.find((q) => q.alive && q.boss && (q.boss.name.toLowerCase() === nm || q.boss.name.split(' ')[0].toLowerCase() === nm)); }
    let hx, hy;
    if (b.ghost) { if (b.ghost.t >= b.ghost.max) return null; hx = b.ghost.sx; hy = b.ghost.sy; }
    else if (a && this.thiefXY && this.thiefXY.a === a) { hx = this.thiefXY.x; hy = this.thiefXY.y - 10; }
    else {
      const A = a && this.aux.get(a);
      if (!a || !a.alive || !A || A.seen !== this.frame) return null;
      const dq = this.duel.get(a); hx = dq ? dq.x : A.rx; hy = dq ? dq.y : this.sy(a.y + (A.oy || 0));
    }
    const c = this.ctx;
    const fs = this.fpx(11), BF = this.bubF || (this.bubF = {});
    c.font = BF[fs] || (BF[fs] = `800 ${fs}px ${FONT}`);
    if (!b.lines || b.fs !== fs) {
      b.fs = fs; b.lines = []; let line = '';
      const wrapW = Math.min(200, 134 * fs / 11);
      for (const w of b.text.split(' ')) { const tryL = line ? line + ' ' + w : w; if (line && c.measureText(tryL).width > wrapW) { b.lines.push(line); line = w; } else line = tryL; }
      if (line) b.lines.push(line);
      b.w = Math.min(wrapW + 16, Math.max(...b.lines.map((l) => c.measureText(l).width)) + 16);
    }
    const lh = fs + 2, w = b.w, h = b.lines.length * lh + 10, p = race.p, kx = p.x, ky = this.sy(p.y);
    // (b.w is the wrapped, text-scaled box, measured above: the plate keeps 10 px inside the screen)
    const fit = (x) => clamp(x, w / 2 + 10, VIEW_W - w / 2 - 10);
    // distance from Kevin's centre to a plate centred at x with its top at y
    const dK = (x, y) => { const dx = Math.max(x - w / 2 - kx, 0, kx - x - w / 2), dy = Math.max(y - ky, 0, ky - y - h); return hyp(dx, dy); };
    const far = hx >= kx ? 1 : -1;   // the speaker's side away from Kevin
    const C = this._bubC || (this._bubC = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    C[0][0] = fit(hx); C[0][1] = hy - 30 - h; C[0][2] = 0;                           // above
    const below = [fit(hx), hy + 26, 1], side = [fit(hx + far * (w / 2 + 18)), hy - h / 2, 2];
    const second = ky < hy ? below : side, third = ky < hy ? side : below;
    C[1][0] = second[0]; C[1][1] = second[1]; C[1][2] = second[2]; C[2][0] = third[0]; C[2][1] = third[1]; C[2][2] = third[2];
    let pick = C[0], best = -1;
    if (!(p && !race.demo) || dK(C[0][0], C[0][1]) >= 70) pick = C[0];
    else for (const q of C) { const d = dK(q[0], q[1]); if (d >= 70) { pick = q; break; } if (d > best) { best = d; pick = q; } }
    let bx = pick[0], by = pick[1], mode = pick[2];
    // a live banner (the coach's lines, 'TIFFANY IS AT THE DOOR!') owns its band: a plate within 6 px of it moves
    // just under it when that spot keeps 70+ px from Kevin and off the egg's face, else the bubble waits (null)
    const bbx = this.bannerBox, ex0 = centre(RACE_LEN), ey0 = this.sy(RACE_LEN + 120);
    const faceHit = (x, y) => !!race.drill && x + w / 2 > ex0 - 100 && x - w / 2 < ex0 + 100 && y + h > ey0 - 50 && y < ey0 + 78;
    const clearBanner = (x, y) => {   // the plate's top y clear of the banner, or NaN when it must wait
      if (!bbx || !Number.isFinite(bbx.y0) || !Number.isFinite(bbx.y1)) return y;
      if (!(y - 6 < bbx.y1 && y + h + 6 > bbx.y0)) return y;
      const ny = bbx.y1 + 6;
      return (!(p && !race.demo) || dK(x, ny) >= 70) && !faceHit(x, ny) ? ny : NaN;
    };
    // the egg duel: a plate never covers her face (eyes, mouth and cheeks: 100 x 50 / 78 round her centre). It
    // drops below the speaker, or goes beside it, or as a last resort clears the face box downwards
    if (race.drill) {
      const ex = centre(RACE_LEN), ey = this.sy(RACE_LEN + 120);
      const onFace = (x, y) => x + w / 2 > ex - 100 && x - w / 2 < ex + 100 && y + h > ey - 50 && y < ey + 78;
      if (onFace(bx, by)) {
        if (!onFace(below[0], below[1])) { pick = below; } else if (!onFace(side[0], side[1])) { pick = side; } else { pick = below; pick[1] = ey + 82; }
        by = pick[1]; mode = pick[1] >= hy ? 1 : pick[2];
        const D = this.bubDodge(pick[0], by, w, h, hx, race);
        const fy = clearBanner(D[0], D[1]); if (fy !== fy) return null;
        return this.placeBubble(c, a, D[0], fy, w, h, hx, hy, fy >= hy ? 1 : mode, lh, b);
      }
    }
    // never over another rival's tag: an above plate climbs over any tag it would cover (its own tag gives way instead)
    const LR = this.labRects, LK = this.labKeys || [];
    if (mode === 0) for (let it = 0; it < 4; it++) {
      let moved = false;
      for (let i = 0; i < this.labRN * 4; i += 4) {
        if (a && sameRival(LK[i >> 2], a)) continue;
        if (bx + w / 2 > LR[i] && bx - w / 2 < LR[i + 2] && by + h > LR[i + 1] && by < LR[i + 3]) { by = LR[i + 1] - h - 3; moved = true; }
      }
      if (!moved) break;
    }
    // never over a big centre pop (bubDodge: up, sideways, or under it)
    if (this.bigBoxN) { const D = this.bubDodge(bx, by, w, h, hx, race); if (D[0] !== bx || D[1] !== by) { bx = D[0]; by = D[1]; if (by >= hy) mode = 1; else if (mode === 1) mode = 0; } }
    { const fy = clearBanner(bx, by); if (fy !== fy) return null; if (fy !== by) { by = fy; if (by >= hy) mode = 1; else if (mode === 1) mode = 0; } }
    // never into the top-left 140 x 60 banner corner, or under the HUD: there it is dropped
    if ((bx - w / 2 < 140 && by < 60) || (!race.over && by < this.hudB())) return null;
    return this.placeBubble(c, a, bx, by, w, h, hx, hy, mode, lh, b);
  }
  // the first big pop box (this.bigBoxes: x, y, half w, half h, from the last drawFx) that a w x h rect centred on x
  // with its top at y would come within pad of: its index, or -1
  bigHit(x, y, w, h, pad = 4) {
    const BB = this.bigBoxes, n = this.bigBoxN;
    for (let j = 0; j < n; j += 4) if (Math.abs(BB[j] - x) < BB[j + 2] + w / 2 + pad && y < BB[j + 1] + BB[j + 3] + pad && y + h > BB[j + 1] - BB[j + 3] - pad) return j;
    return -1;
  }
  // a speech plate (centre bx, top by, w x h, speaker at hx) moved clear of the big pops: it climbs over one when the
  // space above is free of the HUD and the banner corner, else slides beside it (the speaker's side first), else
  // drops under it. Returns a reused [bx, by].
  bubDodge(bx, by, w, h, hx, race) {
    const D = this._bd || (this._bd = [0, 0]), BB = this.bigBoxes, top = race && race.over ? 0 : this.hudB();
    for (let it = 0; it < 3; it++) {
      const j = this.bigHit(bx, by, w, h); if (j < 0) break;
      const upY = BB[j + 1] - BB[j + 3] - 4 - h;
      if (upY >= top && !(bx - w / 2 < 140 && upY < 60) && this.bigHit(bx, upY, w, h) < 0) { by = upY; continue; }
      const sdx = BB[j + 2] + w / 2 + 6, l = BB[j] - sdx, r = BB[j] + sdx, okL = l - w / 2 >= 10, okR = r + w / 2 <= VIEW_W - 10;
      if (okL || okR) { bx = okR && (!okL || hx >= BB[j]) ? r : l; continue; }
      by = BB[j + 1] + BB[j + 3] + 4;
    }
    D[0] = bx; D[1] = by; return D;
  }
  placeBubble(c, a, bx, by, w, h, hx, hy, mode, lh, b) {
    // the same 10 px margin on the real screen: the world transform (shake, kick, the win's push-in) can carry a plate
    // that fits in world units past an edge (the egg thief by the left wall). Its tail keeps pointing at the speaker.
    let bxs = bx;
    {
      const m = c.getTransform(), k = this.s || 1, ax = m.a / k;
      if (ax > 0.05) {
        const sxL = (m.a * (bx - w / 2) + m.c * (by + h / 2) + m.e) / k, sxR = sxL + w * ax;
        if (sxL < 10) bxs += (10 - sxL) / ax; else if (sxR > VIEW_W - 10) bxs -= (sxR - VIEW_W + 10) / ax;
      }
    }
    const L = this.bubLo || (this.bubLo = {});
    L.a = a || null; L.bx = bxs; L.by = by; L.w = w; L.h = h; L.hx = hx; L.hy = hy; L.mode = mode; L.lh = lh; L.b = b;
    return (this.bubL = L);
  }
  drawBubble() {
    const L = this.bubL;
    if (!L) return;
    const c = this.ctx, b = L.b, { bx, by, w, h, hx, hy, lh } = L;
    const k = 1 - b.life / b.max, fade = Math.min(1, b.life * 4);
    let sc = backOut(Math.min(1, k * b.max / 0.25));
    // the tail points at the speaker from the plate's edge facing it
    let t0x, t0y, t1x, t1y, tipX, tipY;
    if (L.mode === 0) { const ex = clamp(hx, bx - w / 2 + 10, bx + w / 2 - 18); t0x = ex; t0y = by + h - 1; t1x = ex + 10; t1y = t0y; tipX = hx + 2; tipY = hy - 16; }
    else if (L.mode === 1) { const ex = clamp(hx, bx - w / 2 + 10, bx + w / 2 - 18); t0x = ex; t0y = by + 1; t1x = ex + 10; t1y = t0y; tipX = hx + 2; tipY = hy + 14; }
    else { const s = hx < bx ? -1 : 1, ex = s < 0 ? bx - w / 2 + 1 : bx + w / 2 - 1, ey = clamp(hy - 6, by + 6, by + h - 16); t0x = ex; t0y = ey; t1x = ex; t1y = ey + 10; tipX = hx - s * 12; tipY = hy - 4; }
    // the pop-in overshoot scales round the tail tip: never let it swing the plate past the 10 px screen margin
    if (sc > 1) {
      const m = c.getTransform(), ks = this.s || 1, ax = m.a / ks, tsx = (m.a * tipX + m.c * tipY + m.e) / ks;
      const l = tsx - (tipX - (bx - w / 2)) * ax, r = tsx + (bx + w / 2 + 2 - tipX) * ax;
      if (tsx - l > 1e-3 && l < 10 + (tsx - l) * (sc - 1)) sc = Math.max(1, Math.min(sc, (tsx - 10) / (tsx - l)));
      if (r - tsx > 1e-3) sc = Math.max(1, Math.min(sc, (VIEW_W - 10 - tsx) / (r - tsx)));
    }
    c.save(); c.globalAlpha = fade; c.translate(tipX, tipY); c.scale(sc, sc); c.translate(-tipX, -tipY);
    // a 0.5 drop shadow 3 px down-right, a 2 px ink outline (a 4 px stroke under the fill), then the white plate and tail
    const shape = (o) => { this.rrect(bx - w / 2 + o, by + o, w, h, 9); c.moveTo(t0x + o, t0y + o); c.lineTo(tipX + o, tipY + o); c.lineTo(t1x + o, t1y + o); c.closePath(); };
    c.fillStyle = 'rgba(30,0,30,0.5)'; shape(3); c.fill();
    shape(0); c.lineJoin = 'round'; c.strokeStyle = HZ_INK; c.lineWidth = 4; c.stroke();
    c.fillStyle = '#fff'; c.fill();
    // only the plate fades: once the pop-in's first 0.12 s are over the words hold at 0.92 or more
    if (k * b.max >= 0.12) c.globalAlpha = Math.max(0.92, fade);
    c.fillStyle = '#2a0a24'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < b.lines.length; i++) c.fillText(b.lines[i], bx, by + 5 + lh / 2 + i * lh);
    c.restore();
  }
  // the duel bubbles (duelSay): one per rival above its duel spot (or the swimmer), the plate in the rival's colour
  // with a 2 px ink outline and a tail at the speaker, 140 CSS px wide at most (the font shrinks to keep it to 2
  // lines, 9 px at the least), a 0.12 s pop-in. A plate that would cover Kevin's spot, the egg's eyes or another
  // duel bubble slides sideways (then up) until it is clear
  drawDuelBubbles(race, dt) {
    const M = this.duelBub;
    if (!M || !M.size) return;
    const c = this.ctx, ck = this.cssK || 1, ts = this.textScale || 1, maxW = 140 * ck, red = this.reduced;
    const kx = Number.isFinite(this.youX) ? this.youX : race.p.x, ky = Number.isFinite(this.youY) ? this.youY : this.sy(race.p.y);
    const ex = centre(RACE_LEN), ey = this.sy(RACE_LEN + 120) + 2, eggOn = !!race.drill || (race.over && race.over.reason === 'late');
    const PR = this._dbR || (this._dbR = nbuf()); PR.n = 0;
    const BF = this.bubF || (this.bubF = {});
    const HS = this._dbH || (this._dbH = { kx: 0, ky: 0, ex: 0, ey: 0, egg: false });
    HS.kx = kx; HS.ky = ky; HS.ex = ex; HS.ey = ey; HS.egg = !!eggOn;
    const DX = this._dbD || (this._dbD = new Float32Array(5));
    for (const [key, b] of M) {
      b.life -= dt;
      if (b.life <= 0) { M.delete(key); continue; }
      const a = b.a || this.rivalOf(race, b.k);
      if (!a || !a.boss || !a.alive) continue;
      let hx, hy;
      const dq = this.duel.get(a);
      if (dq) { hx = dq.x; hy = dq.y; }
      else { const A = this.aux.get(a); if (!A || A.seen !== this.frame) continue; hx = A.rx; hy = this.sy(a.y + (A.oy || 0)); }
      // wrap (once per line and text scale): shrink the font from 12 until the line fits 2 lines of maxW - 14
      if (!b.lines || b.ts !== ts) {
        b.ts = ts;
        for (let fs = Math.round(12 * ts); fs >= 9; fs--) {
          c.font = BF[fs] || (BF[fs] = `800 ${fs}px ${FONT}`);
          const L = []; let line = '';
          for (const w of b.text.split(' ')) { const tl = line ? line + ' ' + w : w; if (line && c.measureText(tl).width > maxW - 14) { L.push(line); line = w; } else line = tl; }
          if (line) L.push(line);
          let mw = 0; for (const l of L) mw = Math.max(mw, c.measureText(l).width);
          b.lines = L; b.fs = fs; b.w = Math.min(maxW, mw + 14);
          if (L.length <= 2 && mw <= maxW - 14) break;
        }
        b.h = b.lines.length * (b.fs + 2) + 8;
      }
      const w = b.w, h = b.h, fit = (x) => clamp(x, w / 2 + 8, VIEW_W - w / 2 - 8);
      let bx = fit(hx), by = hy - 30 - h;
      if (this.duelHits(bx, by, w, h)) {
        let done = false;
        const side = hx >= kx ? 1 : -1;
        DX[0] = 0; DX[1] = side * (w / 2 + 24); DX[2] = -DX[1]; DX[3] = side * (w + 30); DX[4] = -DX[3];
        for (let up = 0; up < 3 && !done; up++) {
          const yy = by - up * (h + 6);
          for (let di = 0; di < 5; di++) {
            const xx = fit(hx + DX[di]);
            if (!this.duelHits(xx, yy, w, h)) { bx = xx; by = yy; done = true; break; }
          }
        }
      }
      if (!race.over && by < this.hudB()) by = this.hudB();
      nb4(PR, bx, by, w, h);
      const col = a.boss.col || '#ffffff', age = this.time - b.born, sc = red ? 1 : backOut(Math.min(1, age / 0.12));
      const tipX = clamp(hx, bx - w / 2 - 30, bx + w / 2 + 30), tipY = hy < by ? hy + 14 : hy - 16, under = tipY > by + h / 2;
      const ex0 = clamp(tipX, bx - w / 2 + 9, bx + w / 2 - 17), ey0 = under ? by + h - 1 : by + 1;
      c.save(); c.globalAlpha = Math.min(1, b.life * 4);
      c.translate(tipX, tipY); c.scale(sc, sc); c.translate(-tipX, -tipY);
      const shape = (o) => { this.rrect(bx - w / 2 + o, by + o, w, h, 8); c.moveTo(ex0 + o, ey0 + o); c.lineTo(tipX + o, tipY + o); c.lineTo(ex0 + 9 + o, ey0 + o); c.closePath(); };
      c.fillStyle = 'rgba(30,0,30,0.45)'; shape(2.5); c.fill();
      shape(0); c.lineJoin = 'round'; c.strokeStyle = HZ_INK; c.lineWidth = 4; c.stroke();
      c.fillStyle = col; c.fill();
      const lh = b.fs + 2;
      c.font = BF[b.fs] || (BF[b.fs] = `800 ${b.fs}px ${FONT}`);
      // only the plate fades: once the 0.12 s pop-in is over the words hold at 0.92 or more
      if (age >= 0.12) c.globalAlpha = Math.max(0.92, c.globalAlpha);
      c.fillStyle = '#2a0a24'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < b.lines.length; i++) c.fillText(b.lines[i], bx, by + 4 + lh / 2 + i * lh);
      c.restore();
    }
  }
  // a duel plate (centre x, top y, w x h) would cover Kevin (a 64 x 64 box round him), the egg's eyes (92 x 46 round
  // each), another duel plate placed this frame (this._dbR) or a big centre pop (bigHit)
  duelHits(x, y, w, h) {
    const S = this._dbH, kx = S.kx, ky = S.ky;
    if (x + w / 2 > kx - 32 && x - w / 2 < kx + 32 && y + h > ky - 34 && y < ky + 30) return true;
    if (S.egg) for (let k = 0; k < 2; k++) { const cx = S.ex + SGN[k] * 46; if (x + w / 2 > cx - 46 && x - w / 2 < cx + 46 && y + h > S.ey - 25 && y < S.ey + 25) return true; }
    const B = this._dbR, PR = B.a;
    for (let j = 0; j < B.n; j += 4) if (x + w / 2 > PR[j] - PR[j + 2] / 2 - 3 && x - w / 2 < PR[j] + PR[j + 2] / 2 + 3 && y + h > PR[j + 1] - 3 && y < PR[j + 1] + PR[j + 3] + 3) return true;
    return this.bigBoxN > 0 && this.bigHit(x, y, w, h) >= 0;
  }
  drawSwimmer(x, y, ang, sc, col, ph, o = {}) {
    const c = this.ctx, st = o.stretch || 1;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc * (o.sx || 1), sc * (o.sy || 1));
    // tail (o.ink: Kevin and the named rivals get a 1.6x dark under-stroke first, so they read on pale floors)
    c.lineCap = 'round'; c.lineJoin = 'round';
    const tl = 34 * (0.8 + 0.2 * st) * (o.tlen || 1);
    if (o.ink && !o.taper) { c.strokeStyle = TAIL_INK; c.lineWidth = 2.2 * 1.6; c.beginPath(); this.tail(c, 0, 8, 0, tl, o.amp || 6, ph); c.stroke(); }
    c.strokeStyle = o.tail || 'rgba(255,255,255,0.92)';
    // (one tail only: the stripes ride on the tapered tail, the plain whip is for untapered swimmers alone)
    if (o.taper) {
      // (o.tf: a tinted fill that keeps the tip colour, for the named rivals; o.tail replaces both, Kevin's pink)
      this.taperTail(c, tl, o.amp || 6, ph, o.tw || 3.4, o.curl || 0, o.tail ? null : o.tipCol || null, o.ink ? TAIL_INK : null, o.tail || o.tf || 'rgba(255,255,255,0.92)', o.tipS || 8);
      if (o.stripeN > 0 && o.stripes) this.tailStripes(c, tl, o.amp || 6, ph, o.tw || 3.4, o.curl || 0, o.stripes, o.stripeN);
    } else { c.lineWidth = 2.2; c.beginPath(); this.tail(c, 0, 8, 0, 32, o.amp || 6, ph); c.stroke(); }
    // the head recoils against each tail stroke (x by -sin(ph) * amp * 0.12; half for reduced motion)
    { const rk = (o.amp || 6) * (this.reduced ? 0.06 : 0.12); if (rk) c.translate(-Math.sin(ph) * rk, 0); }
    if (o.yaw) c.rotate(-Math.sin(ph) * 0.06);   // the head counter-yaws against the tail beat
    // volume kept: the head narrows by what it lengthens (the head's share capped at 0.8 of the stretch, so a dash never
    // reads as a needle; the tail above keeps the full st)
    { const hs = 1 + (st - 1) * 0.8; c.scale(1 / hs, hs); }
    // o.headK: a face-change pop scales the head alone (round its centre, after the tail), so a new face reads
    const hk = o.headK || 1; if (hk !== 1) c.scale(hk, hk);
    // the Goo: a 1.5 px navy rim on every rival head, so they read on the pale periwinkle
    const gr = this.gooOn && !o.rim && o !== this.kevO && o !== this.ghO && o !== this.tsO && o !== this.buddyO;
    if (gr) { o.rim = GOO_RIM; o.rimW = 1.5 / sc; }
    this.head(c, col, ph, o);
    if (o.mods) this.headMods(c, o);   // Kevin's body mods in the head's own frame (ram's plate, antacid's rim, goo's drip)
    if (gr) { o.rim = undefined; o.rimW = undefined; }
    c.restore();
    if (o.name) {
      const ny = y - 23 * sc - (o.acc && o.acc.includes('crown') ? 6 : 0) - (o.quiff ? 3 : 0);
      if (this.labelQ) this.queueLabel(x, ny, o.name, o.nameCol || col, o.lbl || null, o.key || null, 1);
      else this.drawLabel(x, ny, o.name, o.nameCol || col);
    }
  }
  // name labels: queued while the egg and the rivals draw, then stacked so they never overlap ('BrockTiffany' at the
  // egg). (lbl: an optional {fs, ring, sc} for a punched-in label, the first meeting with a rival; key: the rival, one
  // tag per rival a frame, the higher pri wins; style 'tag' (a pill), 'lead' (the duel leader's pill, pulse = its ring
  // alpha) or 'small' (a plain name at the end of a drill ring))
  queueLabel(x, y, text, col, lbl = null, key = null, pri = 1, style = 'tag', pulse = 0) {
    const L = this.labels, i = this.labelN++;
    const q = L[i] || (L[i] = { x: 0, y: 0, text: '', col: '', w: 0, h: 0, fs: 0, ring: 0, sc: 1, key: null, pri: 0, style: 'tag', pulse: 0, skip: false, spr: null });
    q.x = x; q.y = y; q.text = text; q.col = col; q.w = 0; q.h = 0;
    q.fs = lbl ? lbl.fs : 0; q.ring = lbl ? lbl.ring : 0; q.sc = lbl ? lbl.sc : 1;
    q.key = key; q.pri = pri; q.style = style; q.pulse = pulse; q.skip = false; q.spr = null;
  }
  // a label's box, kept on screen ([8, VIEW_W - 8]) and out from under the DASH button (R.avoidRect); false: skip it
  labelFit(q, h) {
    const hw = q.w / 2;
    q.x = clamp(q.x, 8 + hw, VIEW_W - 8 - hw);
    const bb = this.bannerBox;   // a live banner owns its band: tags under it sit the frame out
    if (bb && Number.isFinite(bb.y0) && Number.isFinite(bb.y1) && q.y + h / 2 > bb.y0 && q.y - h / 2 < bb.y1) return false;
    const A = this.avoidRect;
    if (A && Number.isFinite(A.x) && Math.abs(q.x - (A.x + A.w / 2)) < hw + A.w / 2 && q.y + h / 2 > A.y && q.y - h / 2 < A.y + A.h) {
      q.y = A.y - h / 2 - 3;
      if (q.y - h / 2 < this.hudB()) return false;
    }
    // the top HUD (and the egg's duel panel under it, which R.hudBottom includes) plus R.signPad: a tag there is skipped
    const pad = Number.isFinite(+this.signPad) ? +this.signPad : 0;
    if (q.y - h / 2 < this.hudB() + pad) return false;
    const db = this.duelBox;
    if (db && Number.isFinite(db.y0) && Number.isFinite(db.y1) && q.y + h / 2 > db.y0 - pad && q.y - h / 2 < db.y1 + pad) return false;
    if (q.y + h / 2 > this.H - (this.padB || 0)) return false;   // under the bottom combo strip
    return true;
  }
  // every label drawn this frame (x0, y0, x1, y1; key in labKeys): speech plates keep off them
  labRect(x, y, w, h, key = null) {
    const R = this.labRects, i = this.labRN * 4; this.labRN++;
    R[i] = x - w / 2; R[i + 1] = y - h / 2; R[i + 2] = x + w / 2; R[i + 3] = y + h / 2;
    (this.labKeys || (this.labKeys = []))[i >> 2] = key;
  }
  // place the queued tags, lay the speech bubble out against them, drop the speaker's own tag where the bubble
  // covers it (the bubble names the speaker), then draw. No tags at all once the race is over.
  flushLabels(race, dt) {
    const c = this.ctx, n = this.labelN, L = this.labels, fs = this.fpx(13), h = fs;
    this.labelQ = false; this.labelN = 0;
    if (race.over || !n) { this.layoutBubble(race, dt); return; }
    // one tag per rival (by its rival index k, so two copies of Gunther never both get one): the higher priority
    // (the egg's drill ring tag) wins, else the first queued
    for (let i = 0; i < n; i++) {
      const q = L[i];
      if (q.key == null) continue;
      for (let j = 0; j < i; j++) {
        const r = L[j];
        if (r.skip || !sameRival(r.key, q.key)) continue;
        if (q.pri > r.pri) r.skip = true; else { q.skip = true; break; }
      }
    }
    // widths straight from the baked name-tag sprites (no measureText a frame); the egg zone's tags wear 'labelE'
    const zq = ZONES[this.zi | 0], eggZ = !!zq && zq.id === 'egg';
    for (let i = 0; i < n; i++) {
      const q = L[i]; if (q.skip) continue;
      if (q.style === 'small') { const sp = this.text(q.text, q.col, this.fpx(11)); q.spr = sp; q.w = sp.w * 0.85; q.h = sp.h * 0.6; continue; }
      const lfs = q.style === 'lead' ? Math.round(14 * (this.textScale || 1)) : q.fs || fs;
      const sp = this.text(q.text, this.labelCol(q.col), lfs, eggZ ? 'labelE' : 'label'); q.spr = sp;
      q.w = q.fs ? sp.w * q.sc : sp.w; q.h = q.fs ? q.fs * 1.35 * q.sc : sp.ph;
    }
    const SB = this._lsort || (this._lsort = obuf()); SB.n = 0;
    const S = SB.a;
    for (let i = 0; i < n; i++) if (!L[i].skip) S[SB.n++] = L[i];
    const m = SB.n;
    for (let i = 1; i < m; i++) { const q = S[i]; let j = i - 1; while (j >= 0 && S[j].x > q.x) { S[j + 1] = S[j]; j--; } S[j + 1] = q; }   // by x (stable)
    for (let i = 1; i < m; i++) {
      const q = S[i];
      for (let it = 0; it < 6; it++) {
        let hit = false;
        for (let j = 0; j < i; j++) { const r = S[j]; if (Math.abs(r.x - q.x) < (r.w + q.w) / 2 && Math.abs(r.y - q.y) < h) { q.y = r.y - h - 2; hit = true; } }
        if (!hit) break;
      }
    }
    // a label under a live big pop ('FINAL SPRINT!' on Brock's tag) sits this one out; so does one the HUD would hide
    const BB = this.bigBoxes, bn = this.bigBoxN;
    // Kevin's 60 px keep-out: a named rival's tag that would touch the circle round him (last frame's drawn spot, so the
    // egg shot's push-in counts) is nudged vertically clear of it, never onto his head (a tag above him moves up past
    // the circle, one level with or below him moves down)
    const kx = this.youX, ky = this.youY;
    if (Number.isFinite(kx) && Number.isFinite(ky)) for (let i = 0; i < m; i++) {
      const q = S[i];
      if (q.key == null) continue;
      const hh = Math.max(q.h, h) / 2, dx = Math.max(0, Math.abs(q.x - kx) - q.w / 2), dy = Math.max(0, Math.abs(q.y - ky) - hh);
      if (dx * dx + dy * dy >= 3600) continue;
      const need = Math.sqrt(Math.max(0, 3600 - dx * dx));
      q.y = q.y < ky - 8 ? ky - need - hh - 2 : ky + need + hh + 2;
    }
    // (a tag a big pop would cover first steps up over the pop, or down under it, when that is within 40 of its spot)
    for (let i = 0; i < m; i++) {
      const q = S[i], hh = Math.max(q.h, h) * 0.6;
      for (let it = 0; it < 2 && !q.skip; it++) {
        let j = -1;
        for (let k = 0; k < bn; k += 4) if (Math.abs(BB[k] - q.x) < BB[k + 2] + q.w / 2 + 3 && Math.abs(BB[k + 1] - q.y) < BB[k + 3] + hh + 3) { j = k; break; }
        if (j < 0) break;
        const up = BB[j + 1] - BB[j + 3] - hh - 4, dn = BB[j + 1] + BB[j + 3] + hh + 4, y0 = q.y;
        if (y0 - up <= 40) q.y = up; else if (dn - y0 <= 40) q.y = dn; else q.skip = true;
        if (it === 1 && !q.skip) { for (let k = 0; k < bn; k += 4) if (Math.abs(BB[k] - q.x) < BB[k + 2] + q.w / 2 + 3 && Math.abs(BB[k + 1] - q.y) < BB[k + 3] + hh + 3) { q.skip = true; break; } }
      }
      if (!q.skip && !this.labelFit(q, Math.max(q.h, h * 1.35))) q.skip = true;
      if (!q.skip) this.labRect(q.x, q.y, q.w, q.h, q.key);
    }
    // the bubble goes where it fits; its speaker's tag gives way where they overlap
    const B = this.layoutBubble(race, dt);
    if (B && B.a) for (let i = 0; i < m; i++) {
      const q = S[i];
      if (q.skip || !sameRival(q.key, B.a)) continue;
      if (q.x + q.w / 2 > B.bx - B.w / 2 - 2 && q.x - q.w / 2 < B.bx + B.w / 2 + 2 && q.y + q.h / 2 > B.by - 2 && q.y - q.h / 2 < B.by + B.h + 2) q.skip = true;
    }
    for (let i = 0; i < m; i++) {
      const q = S[i];
      if (q.skip) continue;
      if (q.style === 'small') { const sp = q.spr; c.drawImage(sp.cv, q.x - sp.w / 2, q.y - sp.h / 2, sp.w, sp.h); }
      else if (q.style === 'lead') this.drawLabel(q.x, q.y, q.text, q.col, Math.round(14 * (this.textScale || 1)), q.pulse, false);
      else if (q.fs) {   // punched in: a bigger tag scaling up with backOut, ringed in the rival's colour
        const mm = this.wm;   // (the labels draw in the world frame: no getTransform() a tag)
        setXf(c, mm, q.x, q.y, 0, q.sc, q.sc);
        this.drawLabel(0, 0, q.text, q.col, q.fs, q.ring, false);
        c.setTransform(mm);
      } else this.drawLabel(q.x, q.y, q.text, q.col, fs, 0, false);
    }
  }
  // a name label: a dark pill, a thick dark outline, and a dark rival colour lifted 35% toward white so it reads
  // anywhere (Tiffany on the gold egg). ring > 0 adds a pulsing outline in the rival's colour.
  drawLabel(x, y, text, col, fs = this.fpx(13), ring = 0, rec = true) {
    const z = ZONES[this.zi | 0], c = this.ctx, s = this.text(text, this.labelCol(col), fs, z && z.id === 'egg' ? 'labelE' : 'label');
    if (rec) this.labRect(x, y, s.pw, s.ph);
    c.drawImage(s.cv, x - s.w / 2, y - s.h / 2, s.w, s.h);
    if (ring > 0) { c.globalAlpha = ring; c.strokeStyle = col; c.lineWidth = 2; this.rrect(x - s.pw / 2, y - s.ph / 2, s.pw, s.ph, s.ph / 2); c.stroke(); c.globalAlpha = 1; }
    return s;
  }
  labelCol(col) {
    const m = this.lcols || (this.lcols = new Map());
    let v = m.get(col);
    if (!v) {
      const q = colOf(col), lum = (0.299 * q[0] + 0.587 * q[1] + 0.114 * q[2]) / 255;
      v = lum < 0.55 ? css(lerpC(q, [255, 255, 255], 0.35)) : col;
      if (m.size > 32) m.clear();
      m.set(col, v);
    }
    return v;
  }
  // a label font size: never under 13 px, scaled by the player's text size setting
  fpx(base) { return Math.round(Math.max(13, base) * (this.textScale || 1)); }
  // midpiece + head + face + accessories in local space (head centre at 0,0), on any context
  head(c, col, ph, o) {
    c.fillStyle = col;
    // o.ink: an ink outline round the midpiece and the head (#2a0a24 at 0.85, 1.5 local units) for the heroes
    if (!o.round) {
      c.beginPath(); c.ellipse(0, 9.5, 2.8, 3.6, 0, 0, TAU);
      if (o.ink) { const ga = c.globalAlpha; c.globalAlpha = ga * 0.85; c.strokeStyle = HZ_INK; c.lineWidth = o.inkW || 1.5; c.stroke(); c.globalAlpha = ga; }
      c.fill();
    }
    c.beginPath(); if (o.round) c.arc(0, 0, 9.5, 0, TAU); else c.ellipse(0, 0, 7.5, 10, 0, 0, TAU); c.fill();
    if (o.ink) { const ga = c.globalAlpha; c.globalAlpha = ga * 0.85; c.strokeStyle = HZ_INK; c.lineWidth = o.inkW || 1.5; c.stroke(); c.globalAlpha = ga; }
    else { c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 1; c.stroke(); }
    if (o.rim) {   // Kevin's identity rim: just outside the ink, under his accessories
      const rw = o.rimW || 1.7, d = 0.75 + rw / 2;
      c.strokeStyle = o.rim; c.lineWidth = rw; c.beginPath(); if (o.round) c.arc(0, 0, 9.5 + d, 0, TAU); else c.ellipse(0, 0, 7.5 + d, 10 + d, 0, 0, TAU); c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.beginPath(); c.ellipse(1.8, 3, 5, 6.5, 0, -0.6, 2.2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-2.6, -4.5, 2.4, 3.4, -0.4, 0, TAU); c.fill();
    if (o.flash > 0) { const ga = c.globalAlpha; c.fillStyle = '#ffffff'; c.globalAlpha = ga * Math.min(1, o.flash); c.beginPath(); c.ellipse(0, 0, 7.8, 10.3, 0, 0, TAU); c.fill(); c.globalAlpha = ga; }
    if (o.ring) { c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, 11, 13.5, 0, 0, TAU); c.stroke(); }   // the hit with no flashes
    if (o.puff) {   // puffed cheeks (a huff): two round bulges past the head outline
      const r = 2.9 * o.puff;
      c.fillStyle = col; c.beginPath(); c.arc(-6.6, 2.4, r, 0, TAU); c.moveTo(6.6 + r, 2.4); c.arc(6.6, 2.4, r, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = 'rgba(255,90,130,0.55)'; c.beginPath(); c.ellipse(-6.4, 2.6, 1.8, 1.2, 0, 0, TAU); c.ellipse(6.4, 2.6, 1.8, 1.2, 0, 0, TAU); c.fill();
    }
    const acc = o.acc || [];
    // a freshly earned piece scales in (o.accNew, o.accK) around its own anchor
    const grow = (nm, ax, ay) => { if (o.accNew !== nm || !(o.accK < 0.999)) return false; const k = Math.max(0.01, o.accK); c.save(); c.translate(ax, ay); c.scale(k, k); c.translate(-ax, -ay); return true; };
    let gr = false;
    if (acc.includes('mohawk')) { gr = grow('mohawk', 0, -9); c.fillStyle = '#ff3d6e'; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(i * 2.2 - 1.6, -8.5); c.lineTo(i * 2.2, -14 - (2 - Math.abs(i)) * 1.5 + Math.sin(ph * 0.5 + i) * 0.6); c.lineTo(i * 2.2 + 1.6, -8.5); } c.fill(); if (gr) c.restore(); }
    if (o.blush) { c.fillStyle = o.blushCol || 'rgba(255,90,130,0.45)'; c.beginPath(); c.ellipse(-4.6, 1.4, 1.8, 1.1, 0, 0, TAU); c.ellipse(4.6, 1.4, 1.8, 1.1, 0, 0, TAU); c.fill(); }
    // the headband: under the race bib, the eyes and the brows. Its two tails trail on o.flapSide (away from the
    // turn), longer and wavier with o.flap (1 .. 1.8), on a dark under-stroke for the inked heroes
    if (o.band || acc.includes('band')) {
      const bc = o.band || '#ff7a2f', fl = o.flap || 1, sd = o.flapSide < 0 ? -1 : 1; gr = grow('band', 0, -7);
      c.fillStyle = bc; c.beginPath(); c.moveTo(-7.4, -7.8); c.quadraticCurveTo(0, -9.6, 7.4, -7.8); c.lineTo(7.6, -5.2); c.quadraticCurveTo(0, -7, -7.6, -5.2); c.closePath(); c.fill();
      c.lineCap = 'round';
      for (let pass = o.ink ? 0 : 1; pass < 2; pass++) {
        if (!pass) { c.strokeStyle = HZ_INK; c.globalAlpha *= 0.6; } else c.strokeStyle = bc;
        for (let k = 0; k < 2; k++) {
          const w1 = Math.sin(ph * 0.55 + k * 1.3) * 1.6 * fl, w2 = Math.sin(ph * 0.55 + 1.7 + k * 1.3) * 2.4 * fl, L = 5 + 2.2 * fl + k * 1.2;
          c.lineWidth = (k ? 1.3 : 1.7) + (pass ? 0 : 1.1); c.beginPath(); c.moveTo(sd * 6.8, -6.4);
          c.quadraticCurveTo(sd * (6.8 + L * 0.6), -6.4 + L * 0.2 + w1, sd * (6.8 + L * 0.7 + k * 1.5), -6.4 + L + w2); c.stroke();
        }
        if (!pass) c.globalAlpha /= 0.6;
      }
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-5, -8.4, 7, 0.8); if (gr) c.restore();
    }
    // Kevin's race bib (o.bib; o.bibFl the flutter, o.bibDown under a cap, mohawk or bow): pinned to his forehead in
    // the head's own frame, so it shares the recoil, the yaw and the head pop; the brows paint over it
    if (o.bib) {
      const fl = o.bibFl || 0, d = o.bibDown ? 1.5 : 0, gold = !!o.bibGold, bk = o.bibK > 0 ? o.bibK : 1, nD = o.bibN > 0 ? o.bibN : 4;
      if (bk !== 1) { c.save(); c.translate(0, -9.8 + d); c.scale(bk, bk); c.translate(0, 9.8 - d); }
      c.beginPath(); c.moveTo(-5, -11.8 + d); c.lineTo(5, -11.8 + d); c.quadraticCurveTo(6, -11.8 + d, 6, -10.8 + d);
      c.lineTo(6.4 + fl * 0.4, -7.8 + d + fl); c.lineTo(-5, -7.8 + d); c.quadraticCurveTo(-6, -7.8 + d, -6, -8.8 + d); c.lineTo(-6, -10.8 + d); c.quadraticCurveTo(-6, -11.8 + d, -5, -11.8 + d); c.closePath();
      c.fillStyle = gold ? '#ffd75c' : '#ffffff'; c.fill(); c.strokeStyle = gold ? '#b8860b' : '#ff3d6e'; c.lineWidth = 0.5; c.stroke();
      c.fillStyle = gold ? '#b8860b' : '#ff3d6e'; c.fillRect(-6, -11.1 + d, 12, 0.6);
      c.fillStyle = '#2a0a24';
      if (gold) { c.fillRect(-0.3, -10.4 + d, 1.3, 2.4); c.fillRect(-1.5, -10.4 + d, 1.4, 0.8); }   // a bold '1': the stem and its flag
      else {   // n dashes (digits of the rank) spread across the plate, each 1.2 x 4 / max(4, n) wide
        const dw = 1.2 * 4 / Math.max(4, nD), S = 6.9, st = nD > 1 ? (S - dw) / (nD - 1) : 0, x0 = nD > 1 ? -S / 2 : -dw / 2;
        for (let i = 0; i < nD; i++) c.fillRect(x0 + i * st, -9.6 + d, dw, 0.9);
      }
      if (bk !== 1) c.restore();
    }
    // eyes
    // o.ink (Kevin and the named rivals, about 17 x 23 CSS px on a phone): bolder brows, pupils, mouth and eye whites
    // so the faces read at that size; the crowd keeps the thin version
    const look = o.look || 0, ink = '#1a0a1a', bold = !!o.ink, er = o.shock ? (bold ? 3.8 : 3.4) : bold ? 3.3 : 2.9, lw2 = bold ? 1.6 : 1.1;
    // shades on (|shadesY| < 1): the lenses hide the eyes, so no whites or pupils (the lids and brows stay); shades
    // lowered (shadesY >= 1, the peek gag): the whites are clipped to sit above the frame (its top edge plus the drop)
    const shOn = acc.includes('shades') && !o.shadesOff, shY0 = o.shadesY || 0, shTop = bold ? -6.4 : -4.6;
    const eyesHid = shOn && Math.abs(shY0) < 1, eyePeek = shOn && shY0 >= 1;
    if (eyePeek) { c.save(); c.beginPath(); c.rect(-12, -16, 24, 16 + shTop + shY0); c.clip(); }
    for (let sx = -1; sx <= 1; sx += 2) {
      const ex = sx * 3.2, ey = -2.5;
      if (o.ouch) {   // squeezed shut: '>' on the left, '<' on the right (two 2.2 px strokes each)
        c.strokeStyle = ink; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath();
        const d = -sx; c.moveTo(ex - d * 0.7, ey - 1.7); c.lineTo(ex + d * 0.7, ey); c.lineTo(ex - d * 0.7, ey + 1.7); c.stroke(); continue;
      }
      if (o.ko) { c.strokeStyle = ink; c.lineWidth = 1.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(ex - 1.2, ey - 1.2); c.lineTo(ex + 1.2, ey + 1.2); c.moveTo(ex + 1.2, ey - 1.2); c.lineTo(ex - 1.2, ey + 1.2); c.stroke(); continue; }
      if (o.dizzy) { c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath(); c.arc(ex, ey, 2, ph * 0.4, ph * 0.4 + 4.5); c.stroke(); c.beginPath(); c.arc(ex, ey, 0.8, 0, TAU); c.stroke(); continue; }
      if (o.wink && sx === 1) { c.strokeStyle = ink; c.lineWidth = bold ? 1.6 : 1.3; c.beginPath(); c.arc(ex, ey + 0.8, 2.1, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); continue; }
      if (o.blink || o.happy) { c.strokeStyle = ink; c.lineWidth = lw2; c.beginPath(); if (o.happy) c.arc(ex, ey + 0.6, 2, Math.PI * 1.1, Math.PI * 1.9); else { c.moveTo(ex - 2.4, ey); c.lineTo(ex + 2.4, ey); } c.stroke(); continue; }
      if (eyesHid) { /* behind the lenses */ }
      else {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill();
      if (o.star) { c.fillStyle = o.star; star4(c, ex + look * 0.6, ey - 0.4, 2.4); }
      else if (o.heart) { c.fillStyle = '#ff5c8a'; heart(c, ex + look * 0.4, ey - 0.2, 1.15); }   // smitten: 2.4-unit hearts for pupils
      else {
        c.fillStyle = ink; c.beginPath(); c.arc(ex + look, ey - 0.7 + (o.lookY || 0), o.shock ? (bold ? 1.2 : 0.9) : o.mouth === 'scared' ? (bold ? 1.3 : 1) : bold ? 1.9 : 1.45, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + look - 0.5, ey - 1.3 + (o.lookY || 0), 0.5, 0, TAU); c.fill();
      }
      if (o.twinkle > 0) { c.fillStyle = '#ffffff'; star4(c, ex + 1.6, ey - 1.9, 1.2 * o.twinkle); }   // the 30+ combo's eye sparkle
      }
      if (o.lid > 0.02 && !o.tired) {   // a half-shut lid (the blink easing): the head colour over the top of the eye
        const lh = (er * 2 + 0.6) * o.lid, ly = ey - er - 0.3 + lh;
        c.save(); c.beginPath(); c.rect(ex - er - 1, ey - er - 1, er * 2 + 2, lh + 0.7); c.clip();
        c.fillStyle = col; c.beginPath(); c.arc(ex, ey, er + 0.5, 0, TAU); c.fill(); c.restore();
        c.strokeStyle = ink; c.lineWidth = lw2 * 0.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(ex - er * 0.95, ly); c.lineTo(ex + er * 0.95, ly); c.stroke();
      }
      if (o.tired) { c.fillStyle = col; c.beginPath(); c.arc(ex, ey, 3.1, Math.PI, TAU); c.fill(); c.strokeStyle = ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex - 3, ey); c.lineTo(ex + 3, ey); c.stroke(); }
      if (acc.includes('lashes')) { c.strokeStyle = ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex + sx * 2.4, ey - 1.8); c.lineTo(ex + sx * 3.8, ey - 3); c.moveTo(ex + sx * 1.2, ey - 2.8); c.lineTo(ex + sx * 1.9, ey - 4.3); c.stroke(); }
    }
    if (eyePeek) c.restore();
    if (acc.includes('glasses')) { gr = grow('glasses', 0, -2.5); c.strokeStyle = '#3a2a50'; c.lineWidth = 0.9; c.beginPath(); c.arc(-3.2, -2.5, 3.3, 0, TAU); c.moveTo(6.5, -2.5); c.arc(3.2, -2.5, 3.3, 0, TAU); c.moveTo(-0.1, -2.7); c.lineTo(0.1, -2.7); c.stroke(); if (gr) c.restore(); }
    if (shOn) {
      // o.shadesY / o.shadesR / o.shadesS: lift, tilt (round the left temple) and scale the shades (reactive shades)
      const shY = o.shadesY || 0, shR = o.shadesR || 0, shS = o.shadesS == null ? 1 : o.shadesS, shM = shY !== 0 || shR !== 0 || shS !== 1;
      if (shM) {
        c.save(); c.translate(0, shY);
        if (shR) { c.translate(-6, -3); c.rotate(shR); c.translate(6, 3); }
        if (shS !== 1) { c.translate(0, -3); c.scale(shS, shS); c.translate(0, 3); }
      }
      // the bold heads' eyes reach y -5.8, so their lenses start at -6.4 (the crowd's at -4.6)
      const hb = bold ? -5.8 : -4;
      gr = grow('shades', 0, -3); c.fillStyle = o.shadeCol || '#141420'; c.beginPath(); c.moveTo(-7, shTop); c.lineTo(7, shTop); c.lineTo(6.2, -1.2); c.quadraticCurveTo(3.6, 0.6, 1, -1.6); c.lineTo(-1, -1.6); c.quadraticCurveTo(-3.6, 0.6, -6.2, -1.2); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(-5.4, hb, 2, 0.9); c.fillRect(2, hb, 2, 0.9); if (gr) c.restore();
      if (shM) c.restore();
    }
    // brows paint over the shades (a raised brow above the lenses). 'up': the cheeky resting brow (inner end high)
    if (o.brow) {
      c.strokeStyle = ink; c.lineWidth = bold ? 1.7 : 1.1; c.lineCap = 'round'; c.beginPath();
      const b0 = bold ? 0.8 : 1.2, b1 = bold ? 5.6 : 5, bw = o.brow;
      const inY = bw === 'angry' ? -5.2 : bw === 'up' ? -7.4 : -7, outY = bw === 'angry' ? -6.8 : bw === 'up' ? -6.6 : -5.6;
      for (let sx = -1; sx <= 1; sx += 2) { c.moveTo(sx * b0, inY); c.lineTo(sx * b1, outY); }
      c.stroke();
    }
    // mouth
    const m = o.mouth;
    c.strokeStyle = '#5a1020'; c.fillStyle = '#5a1020'; c.lineWidth = bold ? 1.7 : 1.2;
    if (m === 'grin') { c.beginPath(); c.arc(0, 2.4, 3.2, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(-1.8, 2.6, 3.6, 0.9); }
    else if (m === 'huge') { c.beginPath(); c.arc(0, 2, 4.4, 0, Math.PI); c.closePath(); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0, 4.8, 2.2, 1.2, 0, 0, TAU); c.fill(); }
    else if (m === 'scared') { c.beginPath(); c.ellipse(0, 4, 2, o.shock ? 3 : 2.6, 0, 0, TAU); c.fill(); }
    else if (m === 'pant') { c.beginPath(); c.ellipse(0, 4.2, 2.4, 1.6 + 0.8 * Math.abs(Math.sin(ph * 0.3)), 0, 0, TAU); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0.6, 5.8, 1.4, 1.4, 0, 0, TAU); c.fill(); }
    else if (m === 'grit') { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 4, 3.2, 1.6, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-3, 4); c.lineTo(3, 4); c.moveTo(-1, 2.6); c.lineTo(-1, 5.4); c.moveTo(1, 2.6); c.lineTo(1, 5.4); c.lineWidth = 0.6; c.stroke(); }
    else if (m === 'smile') { c.beginPath(); c.arc(0, 2.6, 2.8, 0.12 * Math.PI, 0.88 * Math.PI); c.closePath(); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0.5, 4.3, 1.2, 0.7, 0, 0, TAU); c.fill(); }
    else if (m === 'smirk') { c.beginPath(); c.moveTo(-2.4, 4.2); c.quadraticCurveTo(0.5, 5, 3, 2.8); c.stroke(); }
    else if (m === 'wobble') { c.beginPath(); c.moveTo(-3, 4); for (let i = 1; i <= 6; i++) c.lineTo(-3 + i, 4 + (i % 2 ? -0.7 : 0.7)); c.stroke(); }
    else { c.beginPath(); c.moveTo(-2, 4); c.quadraticCurveTo(0, 4.8, 2, 4); c.stroke(); }
    if (acc.includes('stache')) { gr = grow('stache', 0, 2.6); c.fillStyle = '#5a3418'; c.beginPath(); c.ellipse(-2, 2.6, 2.4, 1.2, 0.3, 0, TAU); c.ellipse(2, 2.6, 2.4, 1.2, -0.3, 0, TAU); c.fill(); c.beginPath(); c.arc(-4.3, 2, 0.9, 0, TAU); c.arc(4.3, 2, 0.9, 0, TAU); c.fill(); if (gr) c.restore(); }
    // the crowd's marks (FACE_ACC): freckles, a hair curl, a plaster, buck teeth, a unibrow
    if (acc.length && acc[0] !== 'cap') {
      const a0 = acc[0];
      if (a0 === 'freckles') { c.fillStyle = 'rgba(176,96,60,0.6)'; c.beginPath(); for (let sx = -1; sx <= 1; sx += 2) { c.moveTo(sx * 4.2 + 0.55, 1.4); c.arc(sx * 4.2, 1.4, 0.55, 0, TAU); c.moveTo(sx * 5.5 + 0.45, 0.4); c.arc(sx * 5.5, 0.4, 0.45, 0, TAU); c.moveTo(sx * 5.1 + 0.45, 2.5); c.arc(sx * 5.1, 2.5, 0.45, 0, TAU); } c.fill(); }
      else if (a0 === 'curl') { c.strokeStyle = '#3a2a50'; c.lineWidth = 1.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -9.7); c.quadraticCurveTo(-0.8, -13.4, 1.9, -13.4); c.quadraticCurveTo(3.4, -12.3, 1.6, -11.5); c.stroke(); }
      else if (a0 === 'bandaid') { c.fillStyle = '#ffcf9e'; c.beginPath(); c.moveTo(1.6, -8.2); c.lineTo(6.2, -6.2); c.lineTo(5.4, -4.4); c.lineTo(0.8, -6.4); c.closePath(); c.fill(); c.fillStyle = '#e09a6c'; c.beginPath(); c.arc(3.7, -6.3, 0.7, 0, TAU); c.fill(); }
      else if (a0 === 'teeth') { c.fillStyle = '#ffffff'; c.fillRect(-1.3, 4.2, 1.2, 1.6); c.fillRect(0.1, 4.2, 1.2, 1.6); c.strokeStyle = 'rgba(90,16,32,0.6)'; c.lineWidth = 0.4; c.strokeRect(-1.3, 4.2, 2.6, 1.6); }
      else if (a0 === 'unibrow' && !o.brow) { c.strokeStyle = '#2a1a20'; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-5, -6.1); c.quadraticCurveTo(0, -7.5, 5, -6.1); c.stroke(); }
    }
    // headwear (the band is drawn before the eyes, with the race bib over it)
    if (acc.includes('cap')) {
      const cc = o.cap || '#5b7cff'; gr = grow('cap', 0, -7);
      c.fillStyle = cc; c.beginPath(); c.arc(0, -6.2, 6.8, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); c.fill();
      c.beginPath(); c.ellipse(2.5, -6.6, 6, 1.6, -0.15, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -11.6, 1.1, 0, TAU); c.fill(); if (gr) c.restore();
    }
    if (acc.includes('bow')) {
      gr = grow('bow', -5, -8); c.fillStyle = '#ff5ca8'; c.save(); c.translate(-5, -8); c.rotate(-0.4 + Math.sin(ph * 0.3) * 0.08);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-5, -4.5, -5, 0); c.quadraticCurveTo(-5, 4.5, 0, 0); c.quadraticCurveTo(5, -4.5, 5, 0); c.quadraticCurveTo(5, 4.5, 0, 0); c.fill();
      c.fillStyle = '#ff9bd0'; c.beginPath(); c.arc(0, 0, 1.4, 0, TAU); c.fill(); c.restore(); if (gr) c.restore();
    }
    if (o.quiff) {   // Chad's famous blond quiff, under the crown (o.quiffK shrinks it: a sulk)
      const b = o.bob || 0, qk = o.quiffK == null ? 1 : o.quiffK;
      if (qk !== 1) { c.save(); c.translate(0, -9 + b); c.scale(qk, qk); c.translate(0, 9 - b); }
      c.fillStyle = '#ffe27a'; c.beginPath(); c.arc(-3.6, -10 + b, 3, 0, TAU); c.arc(0, -11.8 + b, 3.6, 0, TAU); c.arc(3.6, -10 + b, 3, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-1, -13.4 + b, 1.6, 0.8, -0.3, 0, TAU); c.fill();
      if (qk !== 1) c.restore();
    }
    if (o.tiara && !o.crown) {   // Kevin's own crown: a 0.7x pink tiara (the gold crown is Chad's, and the winner's)
      const b = o.bob || 0; gr = grow('crown', 0, -9);
      c.save(); c.translate(0, -8.6 + b); c.scale(0.7, 0.7); c.translate(0, 8.6 - b);
      c.fillStyle = '#ff8bb8'; c.beginPath(); c.moveTo(-6, -8.5 + b); c.lineTo(-6.5, -13 + b); c.lineTo(-3, -10.5 + b); c.lineTo(0, -15 + b); c.lineTo(3, -10.5 + b); c.lineTo(6.5, -13 + b); c.lineTo(6, -8.5 + b); c.closePath(); c.fill();
      c.strokeStyle = HZ_INK; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, -11.2 + b, 1.3, 0, TAU); c.fill();
      c.restore(); if (gr) c.restore();
    } else if (acc.includes('crown') || o.crown) {
      const b = o.bob || 0; gr = grow('crown', 0, -11);
      const qf = !!o.quiff; if (qf) { c.save(); c.translate(0, -14.5); c.scale(0.8, 0.8); c.translate(0, 11); }
      c.fillStyle = '#ffd75c'; c.beginPath(); c.moveTo(-6, -8.5 + b); c.lineTo(-6.5, -15 + b); c.lineTo(-3, -11 + b); c.lineTo(0, -16.5 + b); c.lineTo(3, -11 + b); c.lineTo(6.5, -15 + b); c.lineTo(6, -8.5 + b); c.closePath(); c.fill();
      c.strokeStyle = '#b07a10'; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = '#ff3d6e'; c.beginPath(); c.arc(0, -11 + b, 1.2, 0, TAU); c.fill();
      if (qf) c.restore();
      if (gr) c.restore();
    }
  }
  // the colour of the combo ring for the time left (1 full .. 0 empty): gold, orange, red
  // quantised to 16 steps and cached: every link's burst shares a handful of colours (the particle streak buckets and
  // the dot sprites are keyed by colour, so a continuous ramp made a new bucket and a new sprite every frame)
  ringCol(f) {
    const i = Math.round(clamp(+f || 0, 0, 1) * 15);
    let v = RINGC[i];
    if (!v) { const u = i / 15; v = RINGC[i] = u > 0.5 ? css(lerpC(rgb('#ff9a3c'), rgb('#ffd75c'), (u - 0.5) * 2, SCR)) : css(lerpC(rgb('#ff3d3d'), rgb('#ff9a3c'), clamp(u * 2, 0, 1), SCR)); }
    return v;
  }
  // Coach Gonad, the narrator: a small swimmer in a cap with a whistle and a number patch on his tail, parked about
  // 60 px ahead of Kevin's start. At GO he waves and toots, then drifts back (he swims at 0.9x the field) until he
  // is off screen, about 3 s (reduced motion: he fades where he is). With R.coachEscort he swims beside Kevin for
  // all of zone 1 first. His patch reads R.coachStage: 0 a sticker, 1 its corner lifting, 2 half gone ('999,9..'),
  // 3 '#999,999' in gold, 4 a proper race bib.
  drawCoach(race, dt, wdt = dt) {
    if (race.demo || race.drill) { this.coach = null; return; }
    const p = race.p, red = this.reduced, t = this.time;
    let C = this.coach;
    if (!C) {
      if (!(race.t == null || +race.t < 0.5) || race.over) return;   // only a run that is just starting gets him
      C = this.coach = { x: clamp(p.x + 44, 40, VIEW_W - 40), y: p.y + 60, st: 'park', t: 0, al: 1, esc: this._coachEscort, ph: 0, wave: 0 };
    }
    if (C.st === 'gone') return;
    const go = race.t != null && +race.t > 0;
    C.ph += (C.st === 'drift' ? 13 : 9) * wdt;
    if (C.st === 'park') {
      if (C.esc && go) { C.st = 'escort'; C.t = 0; this.coachToot(C); }
      else if (go) { C.st = 'drift'; C.t = 0; this.coachToot(C); }
    } else C.t += dt;
    const fieldV = 430 * (1 + 0.06 * (race.gen || 0));
    if (C.st === 'escort') {   // beside Kevin, a little behind, on the roomier side of the tube
      const band = playBand(p.y, p.side, PB_R), sd = p.x - band.l > band.r - p.x ? -1 : 1, tx = clamp(p.x + sd * 34, band.l + 8, band.r - 8);
      C.x += (tx - C.x) * Math.min(1, dt * 6); C.y += (p.y - 10 - C.y) * Math.min(1, dt * 6);
      if (zoneIndex(p.y) >= 1 || race.over) { C.st = 'drift'; C.t = 0; C.wave = 0.9; }
    } else if (C.st === 'drift') {
      if (red) C.al = Math.max(0, 1 - C.t / 1);
      else { C.y += 0.9 * Math.min(fieldV, Math.max(0, p.vy || 0)) * wdt; C.al = clamp((3.2 - C.t) / 0.3, 0, 1); }
      if (C.al <= 0 || this.sy(C.y) > this.H + 60) { C.st = 'gone'; return; }
    }
    C.wave = Math.max(0, C.wave - dt);
    const x = C.x, y = this.sy(C.y);
    if (y < -60 || y > this.H + 60) return;
    const c = this.ctx, sc = 1.3, m = c.getTransform(), st = this._coachStage;
    c.globalAlpha = C.al;
    this.dglow('#ffd75c', x, y, 34, 0.4 * C.al); c.globalAlpha = C.al;
    const o = this.coachO || (this.coachO = {});
    o.acc = ['cap', 'stache']; o.cap = '#1d2b6b'; o.taper = 1; o.amp = C.st === 'drift' ? 5 : 3.5; o.tw = 2.8; o.tlen = 0.9; o.yaw = 1; o.stretch = 1;
    o.mouth = C.wave > 0 || C.st === 'escort' ? 'grin' : 'smirk'; o.blink = blinkAt(t, 3.1, false); o.happy = C.wave > 0 ? 1 : 0;
    o.look = clamp((p.x - x) / 40, -1.2, 1.2); o.brow = undefined; o.blush = C.st === 'escort' ? 1 : 0;
    const bob = red ? 0 : Math.sin(t * 2.4) * 1.5, ang = C.st === 'escort' ? (p.heading || 0) * 0.6 : red ? 0 : Math.sin(t * 1.3) * 0.08;
    this.drawSwimmer(x, y + bob, ang, sc, '#ffd2a0', C.ph, o);
    setXf(c, m, x, y + bob, ang, sc, sc);
    // the whistle on its lanyard, at the corner of his mouth
    c.strokeStyle = '#ff5c8a'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-5.5, -5); c.quadraticCurveTo(-6.5, 3, 2.6, 4.6); c.stroke();
    c.fillStyle = '#d8e0ea'; c.beginPath(); c.ellipse(4.6, 4.6, 2.6, 1.7, -0.2, 0, TAU); c.fill(); c.fillRect(6.4, 3.6, 2.8, 1.5);
    c.fillStyle = '#ffd75c'; c.beginPath(); c.arc(0, -11.6, 1.3, 0, TAU); c.fill();   // the gold button on his navy cap
    c.fillStyle = '#5a6a80'; c.beginPath(); c.arc(4.2, 4.6, 0.7, 0, TAU); c.fill();
    if (C.wave > 0) this.waveHand(1 - C.wave / 0.9);
    // the number patch on his tail (riding the tail's own wiggle)
    const k = 0.32, len = 34 * 0.9, tpx = Math.sin(C.ph - k * 5.5) * o.amp * k, tpy = 8 + len * k;
    c.translate(tpx, tpy); c.rotate(Math.cos(C.ph - k * 5.5) * 0.25);
    this.coachPatch(st);
    c.setTransform(m); c.globalAlpha = 1;
  }
  // the whistle toot at GO: a wave, a puff ring and a little PHWEET
  coachToot(C) {
    C.wave = 0.9;
    this.ring(C.x + 4, C.y - 4, '#ffffff', 16, 0.3, 2.5);
    if (!this.reduced) for (let i = 0; i < 3; i++) this.addP(4, C.x + 6, C.y - 4, 30 + Math.random() * 40, (Math.random() - 0.3) * 60, 0.6, '#ffffff', 1.6 + Math.random());
    this.pop(C.x + 10, C.y + 26, 'PHWEET!', '#e6fff0', 14, 0.8);
  }
  // his tail patch, in his local frame, 9 x 6 at the origin (stage: see drawCoach)
  coachPatch(st) {
    const c = this.ctx;
    if (st >= 4) {   // a proper race bib, like Kevin's
      c.fillStyle = '#ffffff'; this.rrect(-5, -3.2, 10, 6.4, 1.2); c.fill(); c.strokeStyle = '#2fd17a'; c.lineWidth = 0.5; c.stroke();
      c.fillStyle = '#2fd17a'; c.fillRect(-5, -3.2, 10, 1);
      c.fillStyle = '#2a0a24'; for (let i = 0; i < 4; i++) c.fillRect(-3.4 + i * 1.9, -0.6, 1.2, 1.6);
      return;
    }
    const num = (txt, col) => { c.font = `900 3.1px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(txt, 0, 0.3); };
    if (st === 3) {   // the secret is out: #999,999 in gold
      c.fillStyle = '#3a2208'; this.rrect(-6.5, -3, 13, 6, 1.5); c.fill();
      c.strokeStyle = '#ffd75c'; c.lineWidth = 0.6; c.stroke(); num('#999,999', '#ffd75c');
      return;
    }
    // the plain number patch under the sticker
    c.fillStyle = '#f4f0e6'; this.rrect(-5.5, -3, 11, 6, 1.2); c.fill();
    if (st === 2) {   // half the sticker is gone: '999,9..'
      num('999,9..', '#5a1020');
      c.fillStyle = '#9ad8ff'; c.beginPath(); c.moveTo(1.2, -3); c.lineTo(5.5, -3); c.lineTo(5.5, 3); c.lineTo(2.4, 3); c.lineTo(3, 1); c.lineTo(1.6, -0.6); c.closePath(); c.fill();
      return;
    }
    // the sticker: a smiley on sky blue; stage 1 lifts its corner
    c.fillStyle = '#9ad8ff'; c.beginPath(); c.moveTo(-5.5, -3); c.lineTo(st === 1 ? 3 : 5.5, -3);
    if (st === 1) { c.lineTo(5.5, -0.6); } else c.lineTo(5.5, 3);
    c.lineTo(-5.5, 3); c.closePath(); c.fill();
    if (st === 1) {   // the peeled corner, curling back, with a glimpse of a 9 under it
      c.fillStyle = '#5a1020'; c.font = `900 2.6px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('9', 4.4, -1.6);
      c.fillStyle = '#d6efff'; c.beginPath(); c.moveTo(3, -3); c.lineTo(5.5, -0.6); c.quadraticCurveTo(3.4, -0.4, 3, -3); c.fill();
    }
    c.strokeStyle = '#2a5a80'; c.lineWidth = 0.45; c.beginPath(); c.arc(-1.2, -0.2, 1.6, 0.2, Math.PI - 0.2); c.stroke();
    c.fillStyle = '#2a5a80'; c.fillRect(-2.2, -1.5, 0.6, 0.6); c.fillRect(-0.8, -1.5, 0.6, 0.6);
  }
  // Kevin's look follows his build: the top 2 mutations (by level) as accessories, recomputed only when levels change
  updateAcc(race) {
    const m = race.muts || {}; let sum = 0;
    for (const k in m) sum += m[k] || 0;
    if (sum === this.accKey) return;
    const ids = Object.keys(m).filter((k) => (m[k] || 0) > 0).sort((u, v) => m[v] - m[u]), out = [];
    for (const id of ids) { const a = MUT_ACC[id]; if (a && !out.includes(a)) out.push(a); if (out.length >= 2) break; }
    const fresh = out.find((a) => !this.accList.includes(a));
    // a pick: which mutation grew (the body mod that changed scales in over 0.35 s; his head pops)
    {
      const MC = this.modCnt || (this.modCnt = {});
      let grew = null;
      for (const id in m) { const v = m[id] || 0; if (v > (MC[id] || 0) && (!grew || BODY_MOD.has(id))) grew = id; }
      for (const id in MC) if (!(id in m)) delete MC[id];
      for (const id in m) MC[id] = m[id] || 0;
      if (this.accKey >= 0 && grew && !race.demo) { this.modNew = grew; this.modT = this.time; this.kPopT = this.time; }
    }
    if (this.accKey >= 0 && fresh && !race.demo) {
      const p = race.p;
      this.accNew = fresh; this.accT = 0.35;
      this.ring(p.x, p.y, '#ffd75c', 50, 0.35, 4);
      this.burst(p.x, p.y, '#ffd75c', 10, 150, 0.5, 2.6);
    }
    this.accKey = sum; this.accList = out;
    // (drawPlayer reads these every frame: worked out here, once per change, not per frame)
    this.accRest = out.filter((a) => a !== 'band'); this.accBand = out.includes('band') ? '#ffd75c' : '#ff3d6e';   // (a deeper gold than Chad's quiff)
  }
  // an afterimage: Kevin's outline alone (head ellipse and tapered tail, one tint), no face, rim, band or accessories
  // the BODY_MOD bits drawn on Kevin in his local frame (head centre 0,0, tail down +y), after his body
  drawBodyMods(c, m, MU, modK, x, y, ang, scl, o) {
    const red = this.reduced, t = this.time, sx = scl * (o.sx || 1), sy = scl * (o.sy || 1);
    const nTurbo = Math.min(5, MU.turbo | 0);
    if (nTurbo) {
      setXf(c, m, x, y, ang, sx, sy);
      {   // turbo: n small orange chevrons on the tail at 15% of its length, pointing up the tail
        const k = modK('turbo'), y0 = 8 + this.kTl * 0.15;
        c.strokeStyle = '#ff9a3c'; c.lineWidth = 1.1; c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = k > 1 ? 1 : k; c.beginPath();
        for (let i = 0; i < nTurbo; i++) { const cy = y0 + i * 2.2; c.moveTo(-1.8 * k, cy + 1.3 * k); c.lineTo(0, cy); c.lineTo(1.8 * k, cy + 1.3 * k); }
        c.stroke(); c.globalAlpha = 1;
      }
      c.setTransform(m);
    }
    if ((MU.magnet | 0) > 0) {   // magnet: one sugar dot orbiting at r 14, 2 rev/s (still for reduced motion)
      const k = modK('magnet'), a = red ? -Math.PI / 4 : t * 2 * TAU, r = 14 * k;
      c.fillStyle = '#fff1b0'; c.strokeStyle = HZ_INK; c.lineWidth = 0.8;
      c.beginPath(); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, 1.6, 0, TAU); c.fill(); c.stroke();
    }
  }
  drawComboRing(p, x, y) {
    const c = this.ctx, red = this.reduced, f = clamp((p.comboT || 0) / (p.comboMax || 1), 0, 1);
    if (f <= 0.005) return;
    const low = f < 0.3, R = 34, a0 = -Math.PI / 2, a1 = a0 + f * 1.5 * Math.PI;
    let col = low ? '#ff3d6e' : '#ffd75c', al = 1;
    if (!low && p.frenzyT > 0 && !red) col = HSL75[hueI(this.time * 240)];
    if (low && !red) al = Math.sin(this.time * 6 * TAU) > -0.2 ? 1 : 0.35;
    // under 30% left the warning never relies on hue alone: the ring goes dashed (5, 4) inside a 2 px white outer
    // stroke, and under 15% 4 tick notches cut across it
    if (low) { c.globalAlpha = 0.9 * al; c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.lineCap = 'butt'; c.beginPath(); c.arc(x, y, R + 3.5, a0, a1); c.stroke(); }
    c.lineCap = 'round'; c.beginPath(); c.arc(x, y, R, a0, a1);
    c.globalAlpha = 0.35 * al; c.strokeStyle = HZ_INK; c.lineWidth = 7; c.stroke();
    if (low) { c.setLineDash(DASH_LOW); c.lineCap = 'butt'; }
    c.globalAlpha = 0.9 * al; c.strokeStyle = col; c.lineWidth = 4; c.stroke();
    if (low) { c.setLineDash(DASH_NONE); c.lineCap = 'round'; }
    if (f < 0.15) {   // the notches, at the four quarters of the full ring
      c.beginPath();
      for (let i = 0; i < 4; i++) { const an = a0 + i * Math.PI / 2, cs = Math.cos(an), sn = Math.sin(an); c.moveTo(x + cs * (R - 6), y + sn * (R - 6)); c.lineTo(x + cs * (R + 6), y + sn * (R + 6)); }
      c.globalAlpha = al; c.strokeStyle = HZ_INK; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
    }
    // the count, from the pop-text sprite cache (one bake per new number, a frame may wait). While the HUD's #combo
    // counter is up (R.comboShown, set by main.js) the ring drops its number badge: one count on screen, not two
    if (this.comboShown === true) { c.globalAlpha = 1; return; }
    const n = p.combo | 0;
    if (this.cmbN !== n || this.cmbC !== col.length || !this.cmbS || this.cmbS.dead) {
      const sp = this.text(String(n), low ? '#ff3d6e' : '#ffd75c', 12, 'pop', true);
      if (sp) { this.cmbS = sp; this.cmbN = n; this.cmbC = col.length; }
    }
    const S = this.cmbS;
    if (S && !S.dead) {
      const ex = x + Math.cos(a1) * R, ey = y + Math.sin(a1) * R;
      c.globalAlpha = al; c.drawImage(S.cv, ex - S.w / 2, ey - S.h / 2, S.w, S.h);
    }
    c.globalAlpha = 1;
  }
  // the clutch save, readable: a long chain (combo 20+) with under 30% of its timer left gets a pulsing gold target
  // bracket (6 Hz; steady for reduced motion), 14 px bigger than the entity, on ONE link opportunity ahead of Kevin,
  // in this order: a named rival within 260 ahead, a gate's nearest gap, a poppable Big Macro (dash ready, 0 to 500
  // ahead), a pickup in his line (within 60 across, 0 to 500 ahead); and a thin dotted guide line to it at 0.5.
  // No allocation: the pick lives in this._clT
  drawClutch(race) {
    const p = race.p;
    if (race.demo || race.over || race.drill || race.pending || (p.combo | 0) < 20) return;
    const f = (p.comboT || 0) / (p.comboMax || 1);
    if (!(f > 0 && f < 0.3)) return;
    const T = this._clT || (this._clT = { x: 0, y: 0, w: 0, h: 0, ok: false });
    T.ok = false;
    let bd = 1e9;
    const AG = race.agents, AX = this.aux;
    for (let i = 0; i < AG.length; i++) {   // 1) a rival within 260 ahead (drawn this frame)
      const a = AG[i];
      if (!a.boss || !a.alive || a.arrived) continue;
      const d = a.y - p.y; if (d <= 0 || d > 260 || d >= bd) continue;
      const A = AX.get(a); if (!A || A.seen !== this.frame) continue;
      bd = d; T.ok = true; T.x = A.rx; T.y = this.sy(a.y + (A.oy || 0)); T.w = 9 * RIVAL_SC + 7; T.h = 12 * RIVAL_SC + 7;
    }
    const E = race.ents, S = race.s;
    for (let pass = 2; pass <= 4 && !T.ok; pass++) {
      bd = 1e9;
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (e.dead) continue;
        const d = e.y - p.y;
        if (pass === 2) {   // 2) a gate: its gap nearest Kevin's x
          if (e.t !== 'gate' || d <= 0 || d > 600 || d >= bd || (e.side && p.side && e.side !== p.side) || !e.gaps || !e.gaps.length) continue;
          let gx = e.gaps[0]; for (let j = 1; j < e.gaps.length; j++) if (Math.abs(e.gaps[j] - p.x) < Math.abs(gx - p.x)) gx = e.gaps[j];
          bd = d; T.ok = true; T.x = gx; T.y = this.sy(e.y); T.w = Math.max(10, (e.gw || 60) / 2 - 6) + 7; T.h = 8 + 7;
        } else if (pass === 3) {   // 3) a Big Macro a dash pops (or a dozing popcorn cell)
          if (e.t !== 'wbc' || d < 0 || d > 500 || d >= bd || !(e.popcorn || (S && p.dashCd <= 0 && p.e > S.dashCost))) continue;
          bd = d; T.ok = true; T.x = e.x; T.y = this.sy(e.y); T.w = T.h = (e.r || 22) + 7;
        } else {   // 4) a pickup in his line
          if ((e.t !== 'sugar' && e.t !== 'dna' && e.t !== 'shield' && e.t !== 'alkali') || d < 0 || d > 500 || d >= bd || Math.abs(e.x - p.x) > 60) continue;
          bd = d; T.ok = true; T.x = e.x; T.y = this.sy(e.y); T.w = T.h = (e.r || 10) + 7;
        }
      }
    }
    if (!T.ok || T.y < this.hudB() || T.y > this.H) return;
    const c = this.ctx, red = this.reduced, pul = red ? 0 : 0.5 + 0.5 * Math.sin(this.time * 6 * TAU), g = 2 * pul;
    const x0 = T.x - T.w - g, x1 = T.x + T.w + g, y0 = T.y - T.h - g, y1 = T.y + T.h + g, L = Math.min(9, T.w * 0.7, T.h * 0.7) + 2;
    // the guide: Kevin to the bracket's near edge, dotted gold at 0.5
    const kx = p.x, ky = this.sy(p.y), dx = T.x - kx, dy = T.y - ky, dl = Math.sqrt(dx * dx + dy * dy) || 1, ek = Math.max(0, dl - Math.max(T.w, T.h) - 4) / dl;
    if (ek > 0) {
      c.globalAlpha = 0.5; c.strokeStyle = '#ffd75c'; c.lineWidth = 1.5; c.lineCap = 'round'; c.setLineDash(DASH_GUIDE); c.lineDashOffset = red ? 0 : -this.time * 20;
      c.beginPath(); c.moveTo(kx + dx / dl * 22, ky + dy / dl * 22); c.lineTo(kx + dx * ek, ky + dy * ek); c.stroke();
      c.setLineDash(DASH_NONE); c.lineDashOffset = 0;
    }
    c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    c.moveTo(x0, y0 + L); c.lineTo(x0, y0); c.lineTo(x0 + L, y0);
    c.moveTo(x1 - L, y0); c.lineTo(x1, y0); c.lineTo(x1, y0 + L);
    c.moveTo(x1, y1 - L); c.lineTo(x1, y1); c.lineTo(x1 - L, y1);
    c.moveTo(x0 + L, y1); c.lineTo(x0, y1); c.lineTo(x0, y1 - L);
    c.globalAlpha = red ? 1 : 0.75 + 0.25 * pul; c.strokeStyle = HZ_INK; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#ffd75c'; c.lineWidth = 2.5; c.stroke();
    c.globalAlpha = 1;
  }
  // the body mods that sit on his head (drawSwimmer's hook, in the head's frame after head()): goo's lilac drip under
  // the midpiece, antacid's lime second rim, ram's forehead plate (over the bib)
  headMods(c, o) {
    const MU = this.hookMU || {}, modK = this.hookModK, red = this.reduced, t = this.time;
    if (!modK) return;
    if ((MU.goo | 0) > 0) {
      const k = modK('goo'), w = red ? 0 : Math.sin(t * 3) * 0.4;
      c.fillStyle = '#d9b8ff'; c.strokeStyle = HZ_INK; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(-1.2 * k, 12.4); c.quadraticCurveTo(-1.4 * k, 14.5 + 2 * k + w, 0, 15.4 + 2.4 * k + w); c.quadraticCurveTo(1.4 * k, 14.5 + 2 * k + w, 1.2 * k, 12.4); c.closePath(); c.fill(); c.stroke();
    }
    if ((MU.antacid | 0) > 0) {
      const ga = c.globalAlpha;
      c.globalAlpha = ga * 0.6 * Math.min(1, modK('antacid')); c.strokeStyle = '#9dff3c'; c.lineWidth = 1 / KEVIN_SC;
      c.beginPath(); c.ellipse(0, 0, 7.5 + 2.9, 10 + 2.9, 0, 0, TAU); c.stroke(); c.globalAlpha = ga;
    }
    if ((MU.ram | 0) > 0) {
      const k = modK('ram');
      c.save(); c.translate(0, -9.5 - (o.bib ? 1.2 : 0)); c.scale(k, k);
      this.rrect(-4.5, -1.3, 9, 2.6, 1.2); c.fillStyle = '#c9b8ff'; c.fill(); c.strokeStyle = HZ_INK; c.lineWidth = 0.6; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(-3.4, -0.9, 3, 0.6);
      c.restore();
    }
  }
  // (its tail length, width and squash follow Kevin's real silhouette: this.kTl, this.kTw, this.kSx / kSy from the
  // last drawPlayer; tw is the fallback width before he has been drawn)
  ghostSil(x, y, ang, sc, col, ph, amp, tw, al) {
    const c = this.ctx, tl = Number.isFinite(this.kTl) && this.kTl > 0 ? this.kTl : 34, gw = Number.isFinite(this.kTw) && this.kTw > 0 ? this.kTw * 0.8 : tw;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc * (this.kSx || 1), sc * (this.kSy || 1));
    c.globalAlpha = al; c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
    this.taperTail(c, tl, amp, ph, gw);
    c.beginPath(); c.ellipse(0, 0, 7.5, 10, 0, 0, TAU); c.moveTo(2.8, 9.5); c.ellipse(0, 9.5, 2.8, 3.6, 0, 0, TAU); c.fill();
    c.restore();
  }
  drawPlayer(race, dt, wdt = dt, beat = 0) {
    const c = this.ctx, p = race.p, t = this.time, red = this.reduced;
    let x = p.x, y = this.sy(p.y);
    const frenzy = p.frenzyT > 0, dash = p.dashT > 0, combo = p.combo || 0, hk = Math.min(combo, 50) / 50;
    // the egg: headbutt it while drilling; ease into her (win) or get bounced off (somebody else got in)
    const ov = race.over, win = !!(ov && ov.reason === 'win' && race.drill), steal = !!(ov && ov.reason === 'late' && race.drill);
    const wk = clamp(this.winT / 1.2, 0, 1), we = wk * wk * (3 - 2 * wk);
    let scl = KEVIN_SC, spin = 0;
    // death: 0.9 s of animation (main.js shows the result after 900 ms). energy, acid and bonk droop and give up
    // the ghost; a Big Mac swallows Kevin whole; the wrong tube gets a shrug. Reduced motion: the poses, no motion.
    const dieR = ov && (ov.reason === 'energy' || ov.reason === 'wbc' || ov.reason === 'wrong') ? ov.reason : null;
    if (ov !== this.dieSeen) {
      this.dieSeen = ov; this.dieT = 0; this.dieWbc = null; this.diePop = 0;
      if (dieR && !race.demo) this.oops('death');
      if (dieR === 'wbc') {   // the nearest Big Mac did it
        let best = 1e9;
        for (const e of race.ents) if (e.t === 'wbc' && !e.dead) { const d = hyp(e.x - p.x, e.y - p.y); if (d < best) { best = d; this.dieWbc = e; } }
        if (best > 400) this.dieWbc = null;
      }
    }
    if (dieR) this.dieT = red ? 0.9 : Math.min(0.9, this.dieT + dt);
    const dk = dieR ? clamp(this.dieT / 0.9, 0, 1) : 0, dke = dk * dk * (3 - 2 * dk);
    const dieKind = !dieR ? null : dieR === 'wbc' ? (this.dieWbc ? 'wbc' : 'energy') : dieR === 'wrong' ? 'wrong' : 'energy';
    const cause = dieKind === 'energy' && dieR === 'energy' ? ov.cause : null;
    if (race.drill) {
      const ex = centre(RACE_LEN), ey = this.sy(RACE_LEN + 120), dx = ex - x, dy = ey - y, dl = hyp(dx, dy) || 1;
      if (win) { x += (ex - x) * we; y += (ey + 70 - y) * we; scl = KEVIN_SC * (1 + 0.7 * we); }
      else if (steal) { const kb = 60 * (1 - (1 - wk) * (1 - wk)); x -= dx / dl * kb; y -= dy / dl * kb; spin = we * TAU * 1.25; }
      else if (!ov) { const j = (red ? 2 : 5 * Math.abs(Math.sin(t * 14))) * clamp(this.eggJig * 1.5, 0, 1.2); x += dx / dl * j; y += dy / dl * j; }
    }
    // trail: rainbow in frenzy (gold when reduced), icy while dashing; 5 alpha bands, one stroke each.
    // STYLE drives it past that: style 4 and 5 a three-colour ribbon cycling down it, style 6 the full rainbow
    const style = p.style || 1, ribbon = style >= 4 && combo >= 3 && !race.drill && !ov, rainbow = frenzy || (style >= 6 && ribbon);
    if ((frenzy || dash || ribbon) && !win && !dieKind) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      const wkb = frenzy ? 1 + 0.25 * beat : 1, n = this.trN, B = 5, o0 = this.trH - n + TRAIL_N;   // sample i (0 oldest) is slot (o0 + i) % TRAIL_N
      const TX = this.trX, TY = this.trY, cyc = red ? 0 : Math.floor(t * 8);
      if (n > 1) for (let b = 0; b < B; b++) {
        const i0 = Math.floor(b * (n - 1) / B), i1 = Math.floor((b + 1) * (n - 1) / B), mid = (i0 + i1) >> 1;
        if (i1 <= i0) continue;
        const k = (b + 1) / B;
        c.strokeStyle = rainbow ? (red ? '#ffd75c' : HSL65[hueI(this.trHue[(o0 + mid) % TRAIL_N])]) : ribbon && !dash ? RIBBON[(b + cyc) % 3] : '#8cdcff';
        c.globalAlpha = rainbow ? k * (red ? 0.7 : 0.8) : ribbon && !dash ? k * 0.7 : k * 0.6;
        c.lineWidth = (3 + mid * 0.5) * wkb; c.beginPath();
        for (let i = i0; i <= i1; i++) { const j = (o0 + i) % TRAIL_N, qy = this.sy(TY[j]) + 18; i === i0 ? c.moveTo(TX[j], qy) : c.lineTo(TX[j], qy); }
        c.stroke();
      }
      c.globalAlpha = 1;
      // style 6: sparkles fly off the tail every 0.05 s (6 hues and white, all in the thinnest streak bucket: 7 strokes)
      if (style >= 6 && ribbon && !red) {
        this.sparkT -= wdt;
        while (this.sparkT <= 0) {
          this.sparkT += 0.05;
          const j = (this.trH - Math.min(n, 6) + TRAIL_N) % TRAIL_N;
          this.addP(1, TX[j] + (Math.random() - 0.5) * 10, TY[j] - 18, (Math.random() - 0.5) * 120, -40 - Math.random() * 80, 0.35, Math.random() < 0.5 ? '#ffffff' : HSL75[(hueI(t * 400 + Math.random() * 120) / 6 | 0) * 6], 1.6);
        }
      } else this.sparkT = 0;
    }
    // dash afterimages: three ice-blue ghosts of Kevin 40, 80 and 120 ms back down the trail (not for reduced motion);
    // a TRICK STREAK of 2+ trails three magenta ones. Plain silhouettes (head and tapered tail in the tint, no face)
    const ghostOn = !red && !win && !dieKind && this.trN > 8;
    if (ghostOn && (dash || ((p.trickStreak | 0) >= 2 && !race.drill))) {
      const AL = dash ? GH_AL_DASH : GH_AL_TRICK, col = dash ? '#8cdcff' : '#ff5cd2', amp = dash ? 4 : 5, tw = dash ? 2.6 : 3;
      for (let i = 0; i < (this.lite ? 2 : 3); i++) {
        const j = (this.trH - 1 - Math.round(2.4 * (i + 1)) + TRAIL_N * 2) % TRAIL_N;
        this.ghostSil(this.trX[j], this.sy(this.trY[j]), p.heading || 0, scl, col, this.pPh - i * 0.8, amp, tw, AL[i]);
      }
    } else if (ghostOn && combo >= 150 && !this.lite && !race.drill && !ov) {
      // the third chain stage (150+): two warm copies of Kevin lagging 40 and 80 ms down his trail (0.25 / 0.12)
      for (let i = 0; i < 2; i++) {
        const j = (this.trH - 1 - Math.round(2.4 * (i + 1)) + TRAIL_N * 2) % TRAIL_N;
        this.ghostSil(this.trX[j], this.sy(this.trY[j]), p.heading || 0, scl, i ? '#ff9a3c' : '#ffd75c', this.pPh - (i + 1) * 0.8, 5, 3, i ? 0.12 : 0.25);
      }
    }
    // the GO spotlight (goK): a soft 70 px pool of light under him, pulsing 0.35 to 0.15 (steady 0.25 when reduced)
    if (this.goK(race) > 0 && !dieKind) this.dglow('#fff0f6', x, y, 70, red ? 0.25 : 0.25 + 0.1 * Math.cos(t * TAU * 1.2));
    // aura: heats up with the combo, breathes with the beat
    const gk = 1 + 0.08 * beat;
    const aCol = frenzy ? '#ffd75c' : dash ? '#8cdcff' : p.acid > 0.2 ? '#9dff3c' : combo >= 3 ? HEAT[Math.min(7, Math.round(hk * 7))] : '#96ffaa';
    this.dglow(aCol, x, y, (frenzy ? 58 : 44 + 26 * hk) * gk * (scl / KEVIN_SC), (frenzy ? 0.7 : 0.45 + 0.35 * hk) * (1 - dke));
    // a TRICK STREAK of 2+: a spinning magenta and gold halo (radius 22 + 4 a streak level), snapping out on a combo break
    const tsk = p.trickStreak | 0;
    if (tsk >= 2 && !win && !dieKind && !race.drill && !ov && t - (this.haloOffT == null ? -9 : this.haloOffT) > 0.4) {
      const R = 22 + 4 * Math.min(8, tsk), sp = red ? 0 : t * 4;
      this.haloR = R; this.haloX = x; this.haloY = p.y;
      c.lineCap = 'round'; c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a0 = sp + i * TAU / 4;
        c.globalAlpha = 0.75; c.strokeStyle = i % 2 ? '#ffd75c' : '#ff5cd2'; c.beginPath(); c.arc(x, y, R, a0, a0 + 0.9); c.stroke();
      }
      c.globalAlpha = 1;
    } else this.haloR = 0;
    // OVERCLOCK (p.oc 1..4): a heat shimmer round him, wavy rings rising off him, more and faster with each level
    const oc = Math.min(4, +p.oc || 0);
    if (oc > 0 && !win && !dieKind && !ov) this.drawOcShimmer(x, y, oc);
    if (frenzy && !win && !dieKind) {   // spinning rainbow halo (still and gold when reduced)
      c.lineWidth = 3; c.lineCap = 'round';
      for (let i = 0; i < 6; i++) { const a0 = (red ? 0 : t * 5) + i * TAU / 6; c.strokeStyle = red ? '#ffd75c' : HSL65[hueI(i * 60 + t * 300)]; c.beginPath(); c.arc(x, y, 27 + (red ? 0 : Math.sin(t * 9) * 2), a0, a0 + 0.7); c.stroke(); }
    }
    // combo timer ring: sweeps away as the chain cools
    if (combo >= 3 && !race.drill && !ov) {
      const f = clamp((p.comboT || 0) / (p.comboMax || 1), 0, 1), pul = f < 0.25 && !red ? 0.6 + 0.4 * Math.sin(t * 18) : 1;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(30,0,30,0.3)'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, 30, 0, TAU); c.stroke();
      c.globalAlpha = pul; c.strokeStyle = this.ringCol(f); c.lineWidth = 3; c.beginPath(); c.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.stroke(); c.globalAlpha = 1;
    }
    // dash readiness: a thin arc (r 18, 2 px, 0.35) refilling as the cooldown runs out, and a 0.25 s cyan ring
    // (r 14 -> 30) the moment it is ready; nothing when the tank cannot pay for a dash, or for reduced motion
    {
      const S = race.s || {}, cd = +p.dashCd || 0, cdMax = +S.dashCd || 0, cost = Number.isFinite(+S.dashCost) ? +S.dashCost : 8;
      const pcd = this.pvDashCd == null ? cd : this.pvDashCd;
      this.pvDashCd = cd;
      const can = !red && !ov && !race.drill && !race.demo && p.e > cost && !dieKind;
      if (pcd > 0 && cd <= 0 && can) this.dashRdyT = this.time;
      if (can && cd > 0 && cdMax > 0) {
        const f = clamp(1 - cd / cdMax, 0, 1);
        c.globalAlpha = 0.35; c.strokeStyle = '#8cdcff'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.stroke(); c.globalAlpha = 1;
      }
      if (pcd > 0 && cd <= 0) this.retRdyT = this.time;
      // the counterplay, visible: dash ready (cooldown done, the tank can pay) and a hunting Big Macro within 260 px
      // ahead (not popcorn, not stunned) gets a thin gold reticle (4 ticks at e.r + 10, 1.5 px over an ink under-stroke,
      // turning 90 deg/s, still for reduced motion), popping 1.15 -> 1.0 over 0.12 s when the dash comes ready
      if (cd <= 0 && p.e > cost && !ov && !race.drill && !race.demo && !dieKind) {
        let tg = null, bd = 260;
        for (const e of race.ents) {
          if (e.t !== 'wbc' || e.dead || e.popcorn || !((e.hunt || 0) > 0.5)) continue;
          const dy = e.y - p.y; if (dy < -10 || dy > 260) continue;
          const E = this.eaux.get(e); if (E && E.lunged && e.cool > 0 && !e.lunge && !(e.crouch > 0)) continue;   // stunned
          const d = hyp(e.x - p.x, dy); if (d < bd) { bd = d; tg = e; }
        }
        if (tg) this.drawReticle(tg.x, this.sy(tg.y), (tg.r || 24) + 10);
      }
      const rk = (this.time - (this.dashRdyT == null ? -9 : this.dashRdyT)) / 0.25;
      if (can && rk >= 0 && rk < 1) {
        c.globalAlpha = 1 - rk; c.strokeStyle = '#5ce1ff'; c.lineWidth = 3 * (1 - rk) + 0.8;
        c.beginPath(); c.arc(x, y, 14 + 16 * (1 - (1 - rk) * (1 - rk)), 0, TAU); c.stroke(); c.globalAlpha = 1;
      }
    }
    // the start line: coiled (race.t <= 0) he flutters at 28 with a small tail; GO springs him off
    this.coilTick(race);
    const kc = race.demo ? 1 : this.coilSy(0);
    if (kc >= 0 && this.launchT != null && this.kLaunch !== this.launchT && this.time - this.launchT < 0.6) { this.kLaunch = this.launchT; this.launchPuff(p.x, p.y - 30); }
    // tail phase accumulates (a changing rate times total time would jitter)
    // cruising (not coiled, dashing, in FRENZY or low on gas) his tail locks to the zone's beat: tw = TAU * bps * m,
    // m a multiple of 0.5 putting tw closest to 15, and each beat onset (R.beat rising past 0.9) pulls the phase a
    // quarter of the way back to pi / 2 (mod 2 pi, or mod pi when m is a half), so the stroke lands on the beat
    const lowE = p.e < 30, bpm = (ZONES[this.zi] && ZONES[this.zi].beat) || 96, bw = TAU * bpm / 60, bm = Math.max(0.5, Math.round(15 / bw * 2) / 2);
    const cruise = !(kc < 0) && !dash && !frenzy && !lowE;
    const tw = kc < 0 ? 28 : dash ? 26 : frenzy ? 21 : cruise ? bw * bm : 15 + (p.vy / 500) * 3;
    this.pTw += (tw - this.pTw) * Math.min(1, dt * 8); this.pPh += this.pTw * wdt;
    if (cruise && this.beatOn) {
      const lock = bm % 1 ? Math.PI : TAU;
      let e = ((this.pPh - Math.PI / 2) % lock + lock) % lock; if (e > lock / 2) e -= lock;
      this.pPh -= 0.25 * e;
    }
    // wingman
    if (p.wing > 0 && !win) {
      const wo = this.buddyO || (this.buddyO = { band: '#5ce1ff', acc: ['glasses'], mouth: 'grin', blink: false });
      wo.blink = (t % 3) < 0.1;
      this.drawSwimmer(p.x - 26, this.sy(p.y) + 14 + Math.sin(t * 3) * 4, p.heading, 0.9, '#ffe0a8', this.pPh + 2, wo);
    }
    let danger = false; for (const e of race.ents) if (e.t === 'wbc' && !e.dead && Math.abs(e.y - p.y) < 130 && hyp(e.x - p.x, e.y - p.y) < 120) { danger = true; break; }
    const blinkInv = p.inv > 0 && p.inv < 1 && Math.floor(t * 20) % 2 === 0 && !ov;
    const low = p.e < 30, stuck = p.stuck > 0;
    this.updateAcc(race);
    const accK = this.accT > 0 ? backOut(clamp(1 - this.accT / 0.35, 0, 1)) : 1;
    // one persistent options object (no garbage per frame): every field the face code below may set is reset first
    const o = this.kevO || (this.kevO = {});
    for (const k of KEV_RESET) o[k] = undefined;
    o.mouth = 'smile'; o.brow = 'up';   // his resting face: a cheeky closed smile under one raised brow
    o.band = this.accBand; o.acc = this.accRest; o.accNew = this.accNew; o.accK = accK;
    // Kevin's copies of the rivals' props are his own: a pink cap (white dot), a pink tiara for the crown, pink lenses
    if (this.accRest.includes('cap')) o.cap = '#ff5c8a';
    if (this.accRest.includes('crown')) o.tiara = 1;
    if (this.accRest.includes('shades')) o.shadeCol = '#ff5c8a';
    o.taper = 1; o.flap = clamp(1 + 0.5 * (dash ? 1 : 0) + Math.max(0, (p.vy || 0) - 430) / 1400, 1, 1.8);
    // a stroke surge on each tail beat: bigger dashing, smaller when tired, halved for reduced motion
    o.stretch = 1 + this.sq + (dash ? 0.08 : low ? 0.03 : 0.05) * (red ? 0.5 : 1) * Math.max(0, Math.sin(this.pPh));
    o.look = clamp(p.vx / 200, -1.2, 1.2);
    // (his hit flash: white for most; no flashes / reduced motion get the outline ring instead)
    if (this.noFlash || this.reduced) { o.flash = 0; o.ring = this.pHit > 0.02 ? 1 : 0; } else o.flash = this.pHit / 0.35;
    { const bl = danger || dash ? 0 : blinkLid(this.kBk || (this.kBk = {}), wdt); o.blink = bl >= 0.95; o.lid = bl < 0.95 ? bl : 0; }
    o.yaw = 1; o.ink = 1;
    // a teaching swim: a bolder 2.5 px ink outline (the crowd has 1.5), so he is the one you find first
    o.inkW = this.teach && !race.demo ? 2.5 / KEVIN_SC : undefined;
    // Kevin's identity look, the whole race: a 2.5 px pink rim round his head (o.rim, in head())
    o.rim = 'rgba(255,92,138,0.7)'; o.rimW = 1.4 / KEVIN_SC;
    this.kevCol = o.band;
    // eye contact: a named rival within 140 px draws Kevin's look
    {
      let tl = null, bd = 140;
      const AG = race.agents, nr = Math.min(NRIV, AG.length);   // the named rivals are agents 0 .. RIVALS.length - 1
      for (let k = 0; k < nr; k++) { const a = AG[k]; if (!a.boss || !a.alive) continue; const A = this.aux.get(a); if (A && A.seen === this.frame && A.init) { const d = hyp(A.rx - p.x, a.y - p.y); if (d < bd) { bd = d; tl = clamp((A.rx - p.x) / 30, -1.2, 1.2); } } }
      const want = tl != null ? tl : o.look;
      this.kLook = this.kLook == null ? want : this.kLook + (want - this.kLook) * Math.min(1, dt * 10);
      o.look = this.kLook;
    }
    // a rival taunted him: 0.8 s of huffing (angry brow, gritted teeth, puffed cheeks, two puffs of steam)
    if (this.huffNew) {
      this.huffNew = false;
      if (!ov) for (let s = -1; s <= 1; s += 2) this.addP(0, p.x + s * 8, p.y + 14, s * 30, 70 + Math.random() * 30, 0.55, '#ffffff', 3.2);
    }
    const huff = this.huffT > 0 && !ov;
    // the combo tier (0 none, 1: 1 to 5, 2: 6 to 14, 3: 15 to 29, 4: 30+); each step up pops his head (bit 64 below)
    const cTier = combo >= 30 ? 4 : combo >= 15 ? 3 : combo >= 6 ? 2 : combo >= 1 ? 1 : 0;
    if (cTier > (this.kTier | 0)) { this.kTierT = this.time; this.kPopT = this.time; }
    this.kTier = cTier;
    // ouch: the 0.35 s after a hit (over FRENZY, a dash and the combo faces; under a bonk's daze and a death)
    const ouch = this.pHit > 0 && !stuck && !ov;
    if (stuck) { o.dizzy = 1; o.mouth = 'wobble'; }
    else if (ouch) { o.ouch = 1; o.mouth = 'wobble'; o.brow = 'worried'; o.star = undefined; o.happy = 0; o.blink = false; }
    else if (danger) { o.mouth = 'scared'; o.brow = 'worried'; }
    else if (huff) { o.mouth = 'grit'; o.brow = 'angry'; o.puff = red ? 1 : 0.8 + 0.2 * Math.sin(t * 20); o.blink = false; }
    else if (frenzy) { o.mouth = 'huge'; o.star = '#ffd75c'; o.blush = 1; }
    else if (dash) { o.mouth = 'grin'; o.brow = 'angry'; }
    else if (cTier >= 2) {   // the combo ladder: 6 to 14 a grin, 15 to 29 a grin and a fierce brow, 30+ the huge laugh and starry eyes
      if (cTier === 2) { o.mouth = 'grin'; o.blush = 1; }
      else if (cTier === 3) { o.mouth = 'grin'; o.brow = 'angry'; }
      else { o.mouth = 'huge'; o.blush = 1; const u = (t % 0.6) / 0.6; o.twinkle = red ? 1 : u < 0.4 ? Math.sin(u / 0.4 * Math.PI) : 0; }
    }
    else if (low) { o.mouth = 'pant'; o.tired = 1; o.brow = 'worried'; }
    else if (race.drill) { o.mouth = 'grin'; o.happy = 1; o.blush = 1; }
    else if (cTier === 1) { o.mouth = 'smile'; o.blush = 1; }
    // micro reactions on top (never over a bonk or a Big Mac in your face)
    if (!stuck && !danger && !huff && !ouch) {
      if (this.nearT > 0.35) { o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; o.star = undefined; o.happy = 0; o.blink = false; }
      else if (this.nearT > 0) { o.mouth = 'grin'; o.blush = 1; o.brow = undefined; }
      if (this.chompT > 0) { o.mouth = 'huge'; o.blink = false; }
      if (this.winkT > 0 && !(this.nearT > 0.35)) { o.wink = 1; o.happy = 0; o.star = undefined; if (!this.chompT) o.mouth = 'smirk'; }
    }
    // the new zone's face (this.zoneFaceT, set in react): the lowest priority, under an ouch, a huff, a bonk or a Big Mac
    // in his face. Acid: a squint, a wobbly mouth, a green blush. Goo: gritted teeth, a worried brow (and a heavy
    // tail, below). Sea: wide-eyed shock. Fork: looking left, right, left. Rapids: a war cry. Egg: heart eyes.
    const zf = this.zoneFaceT > 0 && !stuck && !ouch && !danger && !huff && !ov && !race.demo ? this.zoneFaceId : null;
    if (zf) {
      o.star = undefined; o.happy = 0; o.wink = 0; o.blink = false;
      if (zf === 'acid') { o.lid = 0.5; o.mouth = 'wobble'; o.blush = 1; o.blushCol = 'rgba(157,255,60,0.45)'; o.brow = undefined; }
      else if (zf === 'goo') { o.mouth = 'grit'; o.brow = 'worried'; }
      else if (zf === 'sea') { o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; }
      else if (zf === 'fork') { const u = (this.zoneFaceD || 1.1) - this.zoneFaceT; o.look = red ? 0 : Math.floor(u / 0.35) % 2 ? 1.2 : -1.2; this.kLook = o.look; o.brow = undefined; o.mouth = undefined; }
      else if (zf === 'rapids') { o.mouth = 'huge'; o.brow = 'angry'; }
      else if (zf === 'egg') { o.heart = 1; o.blush = 1; o.mouth = 'grin'; o.brow = undefined; o.shock = 0; }
    }
    // idle tics: after 5 s of calm (no face bits, no threat, combo under 3, gas 30 or more) one tic every 6 to 9 s:
    // a side-eye smirk, a whistle (two bubbles rising), a tail flourish (reduced motion: no curl)
    {
      const calm = !(this.kBits | 0) && !this.kThreat && combo < 3 && p.e >= 30 && !zf && !ov && !race.drill && !race.demo && !dash && !frenzy && !stuck && !danger && kc >= 0;
      this.calmT = calm ? (this.calmT || 0) + dt : 0;
      if (!calm) { this.ticT = 0; this.ticNext = null; }
      else if (this.calmT > 5) {
        if (this.ticNext == null) this.ticNext = this.time + 0.5;
        if (this.time >= this.ticNext && !(this.ticT > 0)) {
          this.ticK = ((this.ticK | 0) + 1 + (Math.random() < 0.5 ? 1 : 0)) % 3; this.ticT = 1.2; this.ticSide = Math.random() < 0.5 ? -1 : 1; this.ticBub = 0;
          this.ticNext = this.time + 6 + Math.random() * 3;
        }
      }
      if (this.ticT > 0) {
        this.ticT = Math.max(0, this.ticT - dt);
        const u = 1 - this.ticT / 1.2;
        if (this.ticK === 0) { o.look = 1.2 * this.ticSide; this.kLook = o.look; o.mouth = 'smirk'; o.lid = 0.35; }
        else if (this.ticK === 1) {   // the whistle: a small round mouth, two bubbles rising off it
          o.mouth = 'scared'; o.lookY = -0.6;
          const nb = u > 0.15 ? (u > 0.5 ? 2 : 1) : 0;
          while ((this.ticBub | 0) < nb) { this.ticBub = (this.ticBub | 0) + 1; this.addP(4, p.x + 6 + this.ticBub * 3, p.y + 16, 14 + Math.random() * 10, 46 + Math.random() * 20, 0.9, '#ffffff', 2.2 + this.ticBub * 0.8); }
        } else o.mouth = 'grin';   // the tail flourish itself is applied with the tail below
      }
    }
    // threat eyes: the nearest hunting Big Mac, acid pool or goo gate 120 to 340 px ahead and within 160 px across
    // draws his eyes up and toward it; under 220 px his brow worries too, and each new threat pops his head once.
    // Not while an ouch, a huff, FRENZY or a dash owns his face, nor in the first 6 s (the YOU tag's time)
    this.kThreat = null;
    if (!ouch && !huff && !frenzy && !dash && !stuck && !danger && !ov && !race.drill && !race.demo && kc >= 0 && !(race.t != null && race.t < 6)) {
      let th = null, bd = 1e9;
      for (const e of race.ents) {
        if (e.dead) continue;
        const ty = e.t === 'wbc' ? ((e.hunt || 0) > 0.5 ? 1 : 0) : e.t === 'acid' || e.t === 'gate' ? 1 : 0;
        if (!ty) continue;
        const dy = e.y - p.y;
        if (dy < 120 || dy > 340) continue;
        if (e.t === 'gate' && e.side && p.side && e.side !== p.side) continue;
        const ex = e.t === 'gate' ? p.x : e.x;   // (a gate spans the tube: straight ahead)
        if (Math.abs(ex - p.x) > 160) continue;
        const d = dy + Math.abs(ex - p.x) * 0.5;
        if (d < bd) { bd = d; th = e; }
      }
      if (th) {
        const dy = th.y - p.y, ex = th.t === 'gate' ? p.x : th.x;
        o.look = clamp((ex - p.x) / 40, -1.2, 1.2); o.lookY = -1; this.kLook = o.look; this.kThreat = th;
        if (dy < 220) {
          o.brow = 'worried';
          if (this.kThreatPop !== th) { this.kThreatPop = th; this.kPopT = this.time; }
        }
      }
    }
    // readable faces: an ouch, a huff, a near miss, a wink or FRENZY coming on pops his head (popK)
    {
      const bits = (ouch ? 1 : 0) | (huff ? 2 : 0) | (this.nearT > 0 ? 4 : 0) | (this.winkT > 0 ? 8 : 0) | (frenzy ? 16 : 0) | (zf ? 32 : 0) | (cTier && this.time - this.kTierT < 0.35 ? 64 : 0);
      if (bits & ~(this.kBits | 0)) this.kPopT = this.time;
      this.kBits = bits;
      o.headK = this.popK(this.kPopT, bits !== 0 && !ov, this.time);
    }
    // the tail: follow-through curl from turning, tired droop, tight dash whip, wild frenzy
    let ang = race.drill ? p.heading : clamp((p.heading || 0) + this.lean, -0.8, 0.8);
    if (this.pAng == null) this.pAng = ang;
    const av = clamp((ang - this.pAng) / Math.max(dt, 1e-3), -8, 8); this.pAng = ang;
    this.pAngV += (av - this.pAngV) * Math.min(1, dt * 8);
    o.amp = frenzy ? 10 : dash ? 4 : 7.5; o.curl = red ? 0 : clamp(-this.pAngV * 0.22, -0.5, 0.5);
    // body weight from his sideways speed: stretched along the heading by up to 12% at 600 px/s, a tail whip that lags
    // p.vx by about 80 ms (up to 0.5 rad more swing) and, on a hard reversal (the sign flips above 350 px/s), 3 or 4
    // wake droplets off the tail, thrown away from the new direction (pooled particles). Reduced: the stretch only
    {
      const vx = Number.isFinite(p.vx) ? p.vx : 0, wk = clamp(Math.abs(vx) / 600, 0, 1);
      if (!race.drill && !ov) o.stretch *= 1 + 0.12 * wk;
      if (this.kVxL == null) this.kVxL = vx;
      this.kVxL += (vx - this.kVxL) * Math.min(1, wdt / 0.08);
      if (!red && !race.drill && !ov) o.curl = clamp(o.curl - clamp(this.kVxL / 600, -1, 1) * 0.5, -0.9, 0.9);
      if (Math.abs(vx) > 350) {
        const sg = vx > 0 ? 1 : -1;
        if (!red && !race.drill && !ov && this.kVxS && this.kVxS !== sg && t - (this.kVxT || 0) < 0.6) {
          const L = 30 * (scl / KEVIN_SC), sa = Math.sin(ang), ca = Math.cos(ang), bx = p.x - sa * L, by = p.y - ca * L, n = 3 + (Math.random() < 0.5 ? 1 : 0);
          for (let i = 0; i < n; i++) this.addP(0, bx + (Math.random() - 0.5) * 6, by + (Math.random() - 0.5) * 6, -sg * (110 + Math.random() * 90), (Math.random() - 0.5) * 70, 0.35 + Math.random() * 0.15, '#e8f6ff', 2 + Math.random() * 1.2);
        }
        this.kVxS = sg; this.kVxT = t;
      }
    }
    o.flapSide = this.pAngV > 0.02 ? -1 : this.pAngV < -0.02 ? 1 : (this.flapSd || 1); this.flapSd = o.flapSide;   // the band's tails trail away from the turn
    // the hero silhouette: a thicker, longer tail with a pink tip (a whip-thin 3 while dashing)
    // (Kevin never gets lost in the crowd: his whole tail is hero pink and 1.5 px wider than a rival's 3.4)
    o.tw = dash ? 3.4 : 4.9; o.tlen = 1.15; o.tipCol = '#ff5c8a'; o.tail = KEV_TAIL;
    // STYLE: the tail thickens with the chain (1 + 0.008 per link, to 1.8x at 100) and wears one stripe per link kind
    // landed in the STYLE window, in that kind's chip colour
    o.tw *= 1 + 0.008 * Math.min(combo, 100);
    o.stripeN = 0;
    if (!race.demo && !ov && !race.drill && p.kindLast && race.t != null) {
      const SK = CORE.STYLE_KINDS, SW = Number.isFinite(CORE.STYLE_WINDOW) ? CORE.STYLE_WINDOW : 6, KL = p.kindLast, ST = this.kStripes || (this.kStripes = []);
      let n = 0;
      for (const k in KL) { if (n >= 6) break; if (SK && !SK.has(k)) continue; const col = LINK_COL[k]; if (!col || !(race.t - KL[k] <= SW)) continue; ST[n++] = col; }
      o.stripes = ST; o.stripeN = n;
    }
    if (low && !frenzy && !dash) { o.amp *= 0.6; o.curl += 0.1 + 0.08 * Math.sin(t * 0.9); o.tlen = 1.06; }
    if (zf === 'goo') o.amp *= 0.6;   // wading through porridge
    if (this.ticT > 0 && this.ticK === 2) { const u = 1 - this.ticT / 1.2; o.amp *= 1.3; if (!red) o.curl += Math.sin(u * TAU) * 0.6 * (this.ticSide || 1); }
    // coiled on the line: squashed, gritted teeth, an angry brow, eyes up the tube; then the launch spring
    if (kc < 0 && !ov) {
      o.mouth = 'grit'; o.brow = 'angry'; o.lookY = -1; o.look = 0; o.blink = false; o.star = undefined; o.happy = 0; o.amp = 2.5;
      o.sx = (o.sx || 1) * 1.06; o.sy = (o.sy || 1) * 0.88;
    } else if (kc !== 1 && !ov) { o.sy = (o.sy || 1) * kc; o.sx = (o.sx || 1) / Math.sqrt(kc); }
    // win: Kevin is in. Steal: Kevin bounces off, seeing stars.
    if (win) {
      ang *= 1 - we; const sq = Math.sin(wk * Math.PI) * 0.18; o.sx = 1 + sq; o.sy = 1 - sq;
      if (wk >= 1) { o.crown = 1; o.happy = 1; o.blush = 1; o.mouth = 'huge'; o.star = undefined; o.wink = 0; }
    } else if (steal) { ang += spin; o.dizzy = 1; o.mouth = 'wobble'; o.star = undefined; }
    // the knockback: a decaying shake of the heading and a 0.08 s squash (reduced motion: the face only)
    if (ouch && !red) {
      const u = 0.35 - this.pHit;
      ang += 0.32 * Math.sin(u * 32) * Math.exp(-6 * u);
      if (u < 0.08) { o.sx = (o.sx || 1) * 1.18; o.sy = (o.sy || 1) * 0.84; }
    }
    if (this.linkT > 0 && !dieKind && !win) { o.sy = (o.sy || 1) * 1.12; o.sx = (o.sx || 1) / 1.06; }
    // swatted by a wall hair (p.swatSlow, the slow's seconds left): a 6% sideways squash easing out over the slow
    const swatT0 = Number.isFinite(CORE.SWAT_SLOW_T) && CORE.SWAT_SLOW_T > 0 ? CORE.SWAT_SLOW_T : 0.35;
    const swatK = !dieKind && !win && !ov && p.swatSlow > 0 ? clamp(p.swatSlow / swatT0, 0, 1) : 0;
    if (swatK > 0) { const e = swatK * swatK * (3 - 2 * swatK); o.sx = (o.sx || 1) * (1 - 0.06 * e); o.sy = (o.sy || 1) * (1 + 0.02 * e); }
    // squashed 8% toward the wall he presses (and nudged that way), springing back with the bulge
    if (this.wallT > 0 && !dieKind && !win) { const k = Math.max(0, this.wallK()); o.sx = (o.sx || 1) * (1 - 0.08 * k); o.sy = (o.sy || 1) * (1 + 0.03 * k); x += (this.wallS || 0) * 1.5 * k; }
    let showKevin = true;
    if (dieKind) {
      // wipe the live expressions, then pose
      o.star = undefined; o.happy = 0; o.wink = 0; o.blink = false; o.blush = 0; o.dizzy = 0; o.tired = 0; o.flash = 0; o.ring = 0; o.stretch = 1;
      if (dieKind === 'energy') {
        o.amp = 6 * (1 - dke); o.tlen = 1 - 0.3 * dke; o.curl = (o.curl || 0) * (1 - dke) + 0.4 * dke; ang += 0.5 * dke; y += 18 * dke;
        o.ko = 1; o.mouth = 'wobble'; o.brow = 'worried'; o.shock = 0; o.look = 0;
        if (cause === 'acid') { scl *= 1 - 0.25 * dke; o.amp *= 0.5; }   // pickled: he shrinks to a lemon
        else if (cause === 'bonk') {   // pancaked on the goo: flat (1.35 x 0.6), settling to 1.15 x 0.85
          const u = red ? 1 : clamp((this.dieT - 0.08) / 0.5, 0, 1), sp = red ? 0 : Math.exp(-5 * u) * Math.cos(u * 14);
          const fl = this.dieT < 0.08 && !red ? this.dieT / 0.08 : 1;
          o.sx = 1 + (0.15 + 0.2 * sp) * fl; o.sy = 1 - (0.15 + 0.25 * sp) * fl; ang -= 0.5 * dke; y -= 10 * dke;
        }
      } else if (dieKind === 'wbc') {
        const e = this.dieWbc, u = clamp(this.dieT / 0.35, 0, 1), ue = u * u * (3 - 2 * u);
        x += (e.x - x) * ue; y += (this.sy(e.y) - y) * ue; scl *= 1 - 0.6 * ue; ang += (red ? 0 : 3 * ue);
        o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; o.look = 0;
        if (u >= 1) showKevin = false;
      } else {   // wrong tube: shrug twice, look left, then right. "?"
        const sh = red ? 1 : 0.5 - 0.5 * Math.cos(dk * 4 * Math.PI), lk = red ? 0 : -Math.sin(dk * TAU);
        o.sx = 1 + 0.1 * sh; o.sy = 1 - 0.1 * sh; ang += 0.6 * lk; o.look = red ? 0 : lk * 2;
        o.mouth = 'wobble'; o.brow = 'worried'; o.amp = 3;
        if (!this.diePop) { this.diePop = 1; this.pop(p.x, p.y + 44, '?', '#ffffff', 24, 0.9); }
      }
    }
    let body = frenzy ? (red ? '#ffd75c' : HSL82[hueI(t * 300)]) : p.acid > 0.2 ? '#e8ffd0' : '#ffffff';
    if (cause === 'acid') body = css(lerpC(WHITE, rgb('#e8ff7a'), dke, SCR));
    // steering readout: where your finger is taking you (red and pulsing when it sits on the edge of the band)
    if (this.ghostA > 0 && !race.drill && !race.over && !race.demo) {
      // 26 ahead of him up the tube (never inside him). Thumb down (input.finger true, or a mouse / keys): a bold
      // ring (r 13, 0.6, 2.5 px) with a filled centre dot, popping 1.25 to 1 over 120 ms on touch down, and the dotted
      // lead line. Lane held (finger false, the thumb lifted): a faint dashed ring (0.22), no lead line
      const fin = race.input ? race.input.finger : null, down = fin !== false;
      if (fin === true && !this.finWas) this.finPopT = t;
      this.finWas = fin === true;
      const gx = this.ghostX, gy = this.sy(p.y + 26), band = playBand(p.y, p.side, PB_R), edge = gx <= band.l + 1.5 || gx >= band.r - 1.5;
      const pul = edge && !red ? 0.5 + 0.5 * Math.sin(t * 16) : 0, col = edge ? '#ff4d5e' : this.wallCss();
      const pk = red || this.finPopT == null ? 1 : clamp((t - this.finPopT) / 0.12, 0, 1), pop = 1.25 - 0.25 * pk * (2 - pk);
      c.strokeStyle = col;
      if (down) {
        c.globalAlpha = Math.min(1, 0.6 + 0.25 * pul) * this.ghostA; c.lineWidth = 2.5;
        c.beginPath(); c.arc(gx, gy, 13 * pop * (1 + 0.15 * pul), 0, TAU); c.stroke();
        c.fillStyle = col; c.beginPath(); c.arc(gx, gy, 2.6, 0, TAU); c.fill();
        const dx = gx - x, dy = gy - y, dl = hyp(dx, dy);
        if (dl > 30) {
          c.lineWidth = 2; c.setLineDash(DASH_DOT); c.beginPath(); c.moveTo(x + dx / dl * 12, y + dy / dl * 12); c.lineTo(gx - dx / dl * 15, gy - dy / dl * 15); c.stroke(); c.setLineDash(DASH_NONE);
        }
      } else {
        c.globalAlpha = (0.22 + 0.15 * pul) * this.ghostA; c.lineWidth = 2;
        c.setLineDash(DASH_RING); c.beginPath(); c.arc(gx, gy, 13, 0, TAU); c.stroke(); c.setLineDash(DASH_NONE);
      }
      c.globalAlpha = 1;
    }
    // Kevin is always findable: an additive pink ground glow under him (r 26, 0.25, pulsing on the beat), the whole
    // race, from the cached glow sprite (no gradient per frame)
    if (showKevin && !dieKind && !win) {
      const hr = 26 * (scl / KEVIN_SC) * (1 + 0.08 * beat); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25 * (1 + 0.6 * beat);
      c.drawImage(this.glow('#ff5c8a'), x - hr * 1.15, y + 4 - hr * 0.9, hr * 2.3, hr * 1.8); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    // the very first swim: a soft white halo behind him for 4 s after GO, pulsing at 2 Hz, fading out over 0.5 s
    {
      const fk = this.firstK(race);
      if (fk > 0 && showKevin && !dieKind && !win) this.dglow('#ffffff', x, y, 46 * (red ? 1 : 1 + 0.1 * Math.sin(t * 2 * TAU)), (red ? 0.4 : 0.38 + 0.14 * Math.sin(t * 2 * TAU)) * fk);
    }
    if (this.isImp('kevin')) { o.flash = 1; o.tail = '#ffffff'; } else if (this.impRing('kevin')) o.ring = 1;
    // the win's first 0.25 s: a held beat with a white rim light on Kevin (fading by 0.45 s)
    if (win && this.endT < 0.45) {
      const rim = this.endT < 0.25 ? 1 : 1 - (this.endT - 0.25) / 0.2;
      this.dglow('#ffffff', x, y, 48 * (scl / KEVIN_SC), 0.75 * rim);
      o.flash = Math.max(o.flash || 0, 0.35 * rim);
    }
    // the acid death leaves a lime puddle spreading under him
    if (cause === 'acid') {
      c.globalAlpha = 0.45 * Math.min(1, dk * 2) * (1 - 0.4 * dke); c.fillStyle = '#9dff3c';
      c.beginPath(); c.ellipse(x, y + 16, 8 + 20 * dke, 3 + 6 * dke, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
    }
    // bonk: three stars orbiting wider (1.5x) behind the head
    const bonkStars = cause === 'bonk' && dk > 0.05;
    // fresh out of a goo blob (p.goo: 1 inside, decaying at 2/s): 2 or 3 lilac strands trail 12 to 20 px off his tail
    const gooK = +p.goo || 0;
    if (gooK > 0.2 && showKevin && !dieKind) {
      const sn = Math.sin(ang), cs = Math.cos(ang), tl = (8 + 34 * (o.tlen || 1)) * scl, ns = this.lite ? 2 : 3;
      c.lineCap = 'round'; c.strokeStyle = '#d9b8ff'; c.fillStyle = '#e8d4ff';
      for (let i = 0; i < ns; i++) {
        const u = 0.7 + 0.15 * i, bx = x - sn * tl * u, by = y + cs * tl * u, side = i % 2 ? 1 : -1;
        const L = 12 + 8 * h1(i * 2.3 + 0.5), sw = red ? 0 : Math.sin(t * 5 + i * 1.9) * 3;
        const ex = bx - sn * L + cs * (side * 4 + sw), ey = by + cs * L + sn * (side * 4 + sw);
        c.globalAlpha = clamp(gooK, 0, 1) * 0.75; c.lineWidth = 2 - 0.4 * i;
        c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx - sn * L * 0.5 + cs * side * 7, by + cs * L * 0.5 + sn * side * 7, ex, ey); c.stroke();
        c.beginPath(); c.arc(ex, ey, 1.8, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
    // BODY_MOD: the mutations he carries change his body, scaled by the stack count n (the one just picked scales
    // in over 0.35 s): tank widens him, turbo lengthens the tail (plus n orange chevrons on it); the rest are drawn
    // on him below (ram's plate, antacid's lime rim, magnet's sugar dot, goo's drip, echo's ghost head)
    const MU = race.muts || {}, modK = (id) => (this.modNew === id && !red ? backOut(clamp((t - this.modT) / 0.35, 0, 1)) : 1);
    const nTank = Math.min(5, MU.tank | 0), nTurbo = Math.min(5, MU.turbo | 0);
    if (nTank) o.sx = (o.sx || 1) * (1 + 0.035 * nTank * modK('tank'));
    if (nTurbo) o.tlen = (o.tlen || 1) * (1 + 0.05 * nTurbo * modK('turbo'));
    // the afterimages copy this frame's silhouette (ghostSil): tail length and width, and the squash
    this.kTl = 34 * (0.8 + 0.2 * (o.stretch || 1)) * (o.tlen || 1); this.kTw = o.tw || 3.4; this.kSx = o.sx || 1; this.kSy = o.sy || 1;
    // the shields sit UNDER him (drawn before his body), so they frame Kevin and never cover him
    this.drawShields(race, x, y, ov);
    if (!blinkInv && showKevin) {
      const sq = this.impSquash('kevin', x, y);
      if (!o.blink && (o.shock || o.happy || o.wink || o.dizzy || o.tired || o.ouch || o.ko || o.star)) o.lid = 0;
      if ((MU.echo | 0) > 0 && !dieKind) {   // echo: a 0.25 ghost of his head 3 px back down his heading
        const ek = modK('echo'), bx = x - Math.sin(ang) * 3 * ek, by = y + Math.cos(ang) * 3 * ek;
        c.globalAlpha = 0.25 * ek; c.fillStyle = '#e8f6ff';
        c.beginPath(); c.ellipse(bx, by, 7.5 * scl * (o.sx || 1), 10 * scl * (o.sy || 1), ang, 0, TAU); c.fill(); c.globalAlpha = 1;
      }
      // the race bib rides in head() (gone under the crown); the head-frame body mods hook in after the head
      o.bib = !o.crown && !this.bibGone && !dieKind && !this.accList.includes('crown') ? 1 : 0;
      o.bibFl = red ? 0 : Math.sin(this.pPh * 0.8) * 0.9;
      o.bibDown = HEADWEAR.some((q) => this.accList.includes(q)) ? 1 : 0;
      // the bib is a living rank badge: one dash per digit of the HUD's rank (race.rank: 7 at #1,000,000, 4 at
      // #3,225). Crossing a power of ten tears the old bib off (the win's spinning white scrap, 1.2 s), the new one
      // pops in (backOut over 0.25 s) with one head pop. At #1 it turns gold with a bold '1'. Reduced motion: a plain swap.
      {
        const rk = Math.max(1, Math.round(+race.rank || 1)), n = rk >= 1e6 ? 7 : String(rk).length;
        if (this.bibRace !== race || this.bibN == null) { this.bibRace = race; this.bibN = n; this.bibSwapT = -9; }
        else if (n !== this.bibN) {
          this.bibN = n;
          if (o.bib && !race.demo) {
            this.kPopT = this.time;
            if (!red) { this.bibSwapT = this.time; this.addP(2, p.x, p.y + 12, (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 60), 220, 1.2, '#ffffff', 9, 300, 0, 9); }
          }
        }
        const u = (this.time - this.bibSwapT) / 0.25;
        o.bibN = n; o.bibGold = rk === 1 ? 1 : 0; o.bibK = red || !(u >= 0 && u < 1) ? 1 : Math.max(0.01, backOut(u));
      }
      o.mods = dieKind ? 0 : 1; this.hookMU = MU; this.hookModK = modK;
      this.drawSwimmer(x, y, ang, scl, body, this.pPh, o);
      if (sq) c.restore();
      const m = this.wm;
      if (cause === 'acid') {   // a wobbly lemon outline, and green fizz rising off him
        setXf(c, m, x, y, ang, scl * (o.sx || 1), scl * (o.sy || 1));
        for (let i = 0; i < 16; i++) { const an = i / 16 * TAU, w = red ? 0 : Math.sin(an * 5 + t * 14) * 0.9; BX[i] = Math.cos(an) * (8.4 + w); BY[i] = Math.sin(an) * (10.9 + w); }
        smoothBlob(c, 16); c.globalAlpha = dke; c.strokeStyle = '#8fae12'; c.lineWidth = 1.1; c.stroke(); c.globalAlpha = 1;
        c.setTransform(m);
        this.acidFz -= dt;
        if (!red && dk < 1 && this.acidFz <= 0) { this.acidFz = 0.05; this.addP(0, x + (Math.random() - 0.5) * 16, p.y + 4 - 18 * dke, (Math.random() - 0.5) * 30, 50 + Math.random() * 50, 0.5, '#9dff3c', 1.4 + Math.random() * 1.4); }
      } else if (cause === 'bonk') {   // a pink bump swelling on his forehead
        setXf(c, m, x, y, ang, scl * (o.sx || 1), scl * (o.sy || 1));
        const br = 3.5 * (red ? 1 : backOut(clamp(this.dieT / 0.3, 0, 1)));
        c.fillStyle = '#ff7aa8'; c.beginPath(); c.arc(2.5, -9.2, br, Math.PI, TAU); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(1.6, -10.4, br * 0.3, 0, TAU); c.fill();
        c.setTransform(m);
      }
      // the body mods go over the bib (ram's plate sits on his forehead)
      if (!dieKind) this.drawBodyMods(c, m, MU, modK, x, y, ang, scl, o);
    }
    // the combo ring: from a combo of 3 a 4 px arc round him (radius 34, 270 degrees at full time) that shrinks with
    // p.comboT / p.comboMax: gold above 30%, then '#ff3d6e' blinking at 6 Hz (steady for reduced motion), the
    // FRENZY rainbow while that runs; the combo count rides the arc's open end (not in the drill or the egg duel)
    if (showKevin && !dieKind && !win && !race.drill && !this.duelOn && !race.demo && (p.combo | 0) >= 3) this.drawComboRing(p, x, y);
    if (bonkStars) {
      c.fillStyle = '#ffd75c';
      for (let i = 0; i < 3; i++) { const a = (red ? 0 : t * 7) + i * TAU / 3; star4(c, x + Math.cos(a) * 21, y - 20 + Math.sin(a) * 6, 3.2); }
    }
    // the bib flies off when he wins
    if (win && !this.bibGone && !red) { this.bibGone = true; this.addP(2, p.x, p.y + 12, (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 60), 220, 1.6, '#ffffff', 9, 300, 0, 9); }
    else if (win) this.bibGone = true;
    if (dieKind) this.drawDeath(race, dieKind, x, y, dk, o.band, cause);
    // sweat when tired
    this.sweatT -= dt;
    if (low && !race.over && this.sweatT <= 0) {
      this.sweatT = 0.18 + p.e / 100;
      const s = Math.random() < 0.5 ? -1 : 1;
      this.addP(3, x + s * 9, p.y + 10, s * (40 + Math.random() * 40), 30 + Math.random() * 40, 0.6, '#9ae2ff', 2.4, 220);
    }
    // the hair's swat: 2 small cyan stars circling his head for the slow (still for reduced motion)
    if (swatK > 0 && showKevin) {
      c.fillStyle = '#5ce1ff'; c.globalAlpha = Math.min(1, swatK * 3);
      for (let i = 0; i < 2; i++) { const a = (red ? 0.6 : t * 9) + i * Math.PI; star4(c, x + Math.cos(a) * 12, y - 17 + Math.sin(a) * 3.5, 2.4); }
      c.globalAlpha = 1;
    }
    // dizzy stars after a bonk
    if (stuck || p.inv > 0.6) {
      c.fillStyle = '#ffd75c';
      for (let i = 0; i < 3; i++) { const a = t * 7 + i * TAU / 3; star4(c, x + Math.cos(a) * 14, y - 18 + Math.sin(a) * 4, 3); }
    }
    // running dry: a shrinking energy arc, and a cracked hex when nothing is protecting you
    const ef = p.e / (p.maxE || 100);
    if (ef < 0.3 && !race.over && !race.drill) {
      const k = clamp(ef / 0.3, 0, 1), pul = ef < 0.12 && !red ? 0.55 + 0.45 * Math.sin(t * 4) : 1;
      c.lineCap = 'round'; c.globalAlpha = pul;
      c.strokeStyle = cssQ(lerpC(RGB_RED5A, RGB_MINT, k, SCR)); c.lineWidth = 4;
      c.beginPath(); c.arc(x, y, 36, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, k)); c.stroke();
      c.globalAlpha = 1;
      if (!p.shield && !p.wing) {
        c.strokeStyle = 'rgba(255,70,90,0.28)'; c.lineWidth = 1.5; c.beginPath();
        for (let i = 0; i < 6; i++) { if (i === 1) continue; const a0 = i / 6 * TAU, a1 = (i + 1) / 6 * TAU; c.moveTo(x + Math.cos(a0) * 24, y + Math.sin(a0) * 24); c.lineTo(x + Math.cos(a1) * 24, y + Math.sin(a1) * 24); }
        const a = TAU / 6; c.moveTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24); c.lineTo(x + Math.cos(a) * 17 + 3, y + Math.sin(a) * 17); c.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12 + 3);
        c.stroke();
      }
    }
    if (p.acid > 0.2) { c.fillStyle = 'rgba(157,255,60,0.6)'; for (let i = 0; i < 3; i++) { const k = (t * 1.5 + i / 3) % 1; c.beginPath(); c.arc(x - 8 + i * 8, y - 6 - k * 16, 2 * (1 - k) + 0.5, 0, TAU); c.fill(); } }
    if (race.draftTarget && p.draft > 0.05) {
      const dt0 = race.draftTarget, dA = this.aux.get(dt0) || {}, tx = dA.init ? dA.rx : race.agentX(dt0), ty = this.sy(dt0.y + (dA.oy || 0));
      c.strokeStyle = rgbaQ(140, 220, 255, Math.min(0.9, p.draft * 2)); c.lineWidth = 1.5; c.setLineDash(LD_4_5); c.lineDashOffset = -t * 40;
      c.beginPath(); c.moveTo(x - 9, y - 12); c.lineTo(tx - 5, ty + 8); c.moveTo(x + 9, y - 12); c.lineTo(tx + 5, ty + 8); c.stroke(); c.setLineDash(NODASH); c.lineDashOffset = 0;
    }
    // "YOU" marker for the first 6 s of a run, and for 1.5 s after every card pick (so you can find Kevin)
    // hype buddies: one tiny sperm fan per FRENZY tier (up to 5) orbiting him
    this.drawBuddies(race, x, y, dt);
    // (a headline pop owns that space: the marker fades out while one is up)
    this.headK = (this.headK || 0) + ((this.headUp || 0) - (this.headK || 0)) * Math.min(1, dt * 12);
    const youA = (race.demo || ov ? 0 : Math.max(race.t != null && race.t < 6 ? clamp(6 - race.t, 0, 1) : 0, clamp(this.youT / 0.3, 0, 1))) * (1 - clamp(this.headK, 0, 1));
    // R.youOff (s, main.js): the swim-1 ghost finger is up, so the tag steps out until it counts down
    if (this.youOff > 0) this.youOff = Math.max(0, this.youOff - dt);
    // R.youDropT (s, main.js on GO of swim 1): the tag drops in from scale youDropS to 1 over that time
    if (this.youDropT > 0) { if (!(this.youDropD > 0)) this.youDropD = this.youDropT; this.youDropT = Math.max(0, this.youDropT - dt); if (!this.youDropT) this.youDropD = 0; }
    this.youA = this.youOff > 0 ? 0 : youA; this.youX = x; this.youY = y;   // (drawn by drawYou, after the pickups and the particles)
    // R.youHold (s, main.js): a tutorial ring sits on Kevin, so the tag stands beside him meanwhile
    if (this.youHold > 0) this.youHold = Math.max(0, this.youHold - dt);
  }
  // shields: quiet gold hex rings under Kevin, one per shield (r 30 / 35 / 40, one path, 1.5 px at 0.35, still). Past
  // 3 shields: ONE ring with a gold pip per shield (10 at most; the HUD pill owns the count). They flash to full alpha
  // and turn for 0.5 s when the count changes (a shield gained or spent); a hostile within 120 px lifts only the outer
  // ring to 0.6. A baked 'xN' plate shows beside them for 1.2 s after a change (a 1.3 to 1.0 pop, fading out)
  drawShields(race, x, y, ov) {
    const c = this.ctx, p = race.p, t = this.time, red = this.reduced, dt = this.fdt || 0;
    const nSh = ov ? 0 : Math.max(0, p.shield | 0);
    if (nSh !== this.shLast) { if (this.shLast != null && (nSh > 0 || this.shLast > 0)) this.shChgT = this.time; this.shLast = nSh; }
    if (!(nSh > 0)) return;
    const chg = t - (this.shChgT == null ? -99 : this.shChgT);
    let hot = false;
    for (let ei = 0, EN = race.ents; ei < EN.length; ei++) {
      const e = EN[ei];
      if (e.dead || !(e.t === 'wbc' || e.t === 'acid' || e.t === 'goo')) continue;
      if (e.t === 'wbc' && e.popcorn) continue;
      const dy = e.y - p.y, r = e.r || 0;
      if (Math.abs(dy) < 120 + r && hyp(e.x - p.x, dy) - r < 120) { hot = true; break; }
    }
    const fl = clamp(1 - chg / 0.5, 0, 1), sw = red ? 0 : 1.5 * fl, base = 0.35 + 0.65 * fl;
    this.shRot = (this.shRot || 0) + (red ? 0 : dt * 0.8 * fl);
    c.strokeStyle = '#ffd75c'; c.lineWidth = 1.5 + 0.5 * fl; c.lineJoin = 'round';
    if (nSh <= 3) {
      c.globalAlpha = base; c.beginPath();
      for (let i = 0; i < nSh - 1; i++) hexPath(c, x, y, 30 + i * 5 + Math.sin(t * 6 + i) * sw, i * 0.5 + this.shRot * (i % 2 ? -1 : 1));
      c.stroke();
      const i = nSh - 1;   // the outer ring: the one a nearby hostile lights
      c.globalAlpha = Math.max(base, hot ? 0.6 : 0); c.beginPath(); hexPath(c, x, y, 30 + i * 5 + Math.sin(t * 6 + i) * sw, i * 0.5 + this.shRot * (i % 2 ? -1 : 1)); c.stroke();
    } else {
      const r = 35 + Math.sin(t * 6) * sw, a0 = 0.5 - this.shRot, np = Math.min(10, nSh);
      c.globalAlpha = Math.max(base, hot ? 0.6 : 0); c.beginPath(); hexPath(c, x, y, r, a0); c.stroke();
      c.fillStyle = '#ffd75c'; c.beginPath();
      for (let k = 0; k < np; k++) { const a = -Math.PI / 2 + k / np * TAU + (red ? 0 : this.shRot * 0.5); c.moveTo(x + Math.cos(a) * (r + 5) + 1.8, y + Math.sin(a) * (r + 5)); c.arc(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5), 1.8, 0, TAU); }
      c.fill();
    }
    c.globalAlpha = 1;
    if (chg >= 0 && chg < 1.2) {
      const lb = SHIELD_LBL[Math.min(nSh, 99)] || (SHIELD_LBL[Math.min(nSh, 99)] = 'x' + Math.min(nSh, 99)), sp = this.text(lb, '#ffd75c', 13, 'label');
      const lx = this.labBeside(x, 44, sp.w, x > VIEW_W - 80 ? -1 : 1), ly = y - 24;   // beside the rings (the YOU tag owns the top)
      const ps = red ? 1 : 1.3 - 0.3 * clamp(chg / 0.15, 0, 1), m = this.wm;
      c.globalAlpha = chg > 0.9 ? (1.2 - chg) / 0.3 : 1;
      setXf(c, m, lx, ly, 0, ps, ps); c.drawImage(sp.cv, -sp.w / 2, -sp.h / 2, sp.w, sp.h); c.setTransform(m);
      c.globalAlpha = 1;
    }
  }
  // OVERCLOCK's heat shimmer at screen (x, y), level oc 1..4: a faint wobbling ring (r 34) and 2 + 2 oc short heat
  // ripples rising round him at 30 + 20 oc px/s (lite: half the ripples; reduced motion: the ring alone, still)
  drawOcShimmer(x, y, oc) {
    const c = this.ctx, t = this.time, red = this.reduced, k = oc / 4;
    c.lineCap = 'round'; c.strokeStyle = '#ffb36b';
    c.globalAlpha = 0.18 + 0.12 * k; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = i / 24 * TAU, r = 34 + (red ? 0 : Math.sin(a * 5 + t * (6 + 4 * oc)) * (1 + oc * 0.6));
      i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.stroke();
    if (!red) {
      const n = Math.round((2 + 2 * oc) * (this.lite ? 0.5 : 1)), sp = 30 + 20 * oc;
      c.lineWidth = 1.5; c.strokeStyle = '#ffe0b0'; c.beginPath();
      for (let i = 0; i < n; i++) {
        const u = ((t * sp / 60 + i / n) % 1), a = i / n * TAU + 0.6 * Math.sin(i * 2.3), rx = x + Math.cos(a) * (20 + 8 * u), ry = y + Math.sin(a) * 20 - u * 40;
        const w = 3 + 2 * k;
        c.moveTo(rx, ry + 6); c.quadraticCurveTo(rx + w * Math.sin(t * 9 + i), ry + 3, rx, ry); c.quadraticCurveTo(rx - w * Math.sin(t * 9 + i), ry - 3, rx, ry - 6);
      }
      c.globalAlpha = 0.35 * k + 0.1; c.stroke();
    }
    c.globalAlpha = 1;
  }
  // the dash reticle round a Big Macro at screen (x, y), radius r: one ink under-stroke and one gold stroke (2 draws)
  drawReticle(x, y, r) {
    const c = this.ctx, red = this.reduced, age = this.time - (this.retRdyT == null ? -9 : this.retRdyT);
    const k = age >= 0 && age < 0.12 ? 1.15 - 0.15 * (age / 0.12) : 1, R = r * k, a0 = red ? Math.PI / 4 : this.time * Math.PI / 2 + Math.PI / 4;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = a0 + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      c.moveTo(x + ca * (R - 6), y + sa * (R - 6)); c.lineTo(x + ca * (R + 5), y + sa * (R + 5));   // the tick
      c.moveTo(x + Math.cos(a - 0.32) * R, y + Math.sin(a - 0.32) * R); c.arc(x, y, R, a - 0.32, a + 0.32);   // its short arc
    }
    c.lineCap = 'round'; c.globalAlpha = 0.85; c.strokeStyle = HZ_INK; c.lineWidth = 3.5; c.stroke();
    c.globalAlpha = 1; c.strokeStyle = '#ffd75c'; c.lineWidth = 1.5; c.stroke();
  }
  // 1 on the first ever swim (meta-run 0) for 4 s after GO (and through the countdown), fading to 0 by 4.5 s.
  // R.firstRun (main.js) wins when it is set; otherwise the race's meta says so
  // the GO spotlight: on a first swim (R.firstRun) or a teaching swim (R.teach), the first 4 s of the race make Kevin
  // unmistakable (a full-opacity pink YOU, a pulsing soft spotlight under him, the swimmers within 120 px at 0.6)
  goK(race) {
    if (!race || race.demo || race.over || !(this.firstRun || this.teach)) return 0;
    const t = +race.t || 0;
    return t > 0 && t < 4 ? 1 : 0;
  }
  firstK(race) {
    if (!race || race.demo || race.over) return 0;
    const first = this.firstRun != null ? !!this.firstRun : !!(race.meta && (race.meta.runs | 0) === 0);
    if (!first) return 0;
    const t = +race.t || 0;
    return t < 4 ? 1 : clamp(1 - (t - 4) / 0.5, 0, 1);
  }
  // the YOU tag over Kevin; when another swimmer (or a named rival's long tail) hangs within 40 px above his head it
  // moves beside him (the side away from that swimmer), or below him when neither side fits on screen. A side spot or
  // the spot below never sits under the DASH button (R.avoidRect), and every placement joins labRects.
  // dr false: the layout only (where the tag will sit this frame, into this.youKO: x, y, w, h), so drawFx can keep its
  // pops off the tag before drawYou(race) paints it over them
  youBox(x, y, w, h) { const K = this.youKO; K[0] = x; K[1] = y; K[2] = w; K[3] = h; this.youKOn = 1; }
  drawYou(race, dr = true) {
    if (!dr) this.youKOn = 0;
    const go = this.goK(race) > 0 && !(this.youOff > 0) && !(this.headK > 0.5), a = go ? 1 : this.youA || 0;
    if (a <= 0 || !Number.isFinite(this.youX)) return;
    const c = this.ctx, x = this.youX, y = this.youY, b = this.reduced ? 0 : Math.sin(this.time * 8) * 3, AX = this.aux;
    let blk = 0;   // 0 clear, else the side the blocker is on (-1 left, 1 right)
    // a swimmer's head 10 to 66 px above him blocks; so does one up to 66 + its tail (a rival's 34 x 1.3 + 8, the
    // crowd's 40) whose tail hangs into the tag
    const L1 = this._close, L2 = this._vis;   // (drawAgents' kept buckets: { n, a })
    for (let li = 0; li < 2 && !blk; li++) {
      const LB = li ? L2 : L1;
      if (!LB) continue;
      const L = LB.a;
      for (let i = 0; i < LB.n && !blk; i++) {
        const q = L[i], A = AX.get(q);
        if (!A || A.seen !== this.frame) continue;
        const ax = A.rx + (A.kp || 0), ay = this.sy(q.y + (A.oy || 0)), tl = q.boss ? 52 : 40;
        if (Math.abs(ax - x) < (q.boss ? 34 : 30) && ay < y - 10 && ay > y - 66 - tl) blk = ax >= x ? 1 : -1;
      }
    }
    const hold = this.youHold > 0;
    // the first swim's first 4 s: a bigger tag held straight ABOVE him (never moved sideways), unless a tutorial
    // ring sits on him (youHold), which puts it beside him. While the ghost finger's 'drag' label hangs under its
    // ring (110 above him) the tag tucks in tight over his head so the two never touch
    if (!hold && (go || this.firstK(race) >= 1)) {
      // (at GO: pink letters on a 2 px dark outline, at full opacity)
      const s1 = go ? this.text('YOU', '#ff7ab0', 18, 'o2') : this.text('YOU', '#ffffff', 18), tuck = this.fingerUp();
      const ay0 = tuck ? 24 : 28, ay1 = tuck ? 33 : 40, ty = tuck ? y - ay1 - 1 - s1.h / 2 + b * 0.5 : y - 58 + b;
      if (!dr) { this.youBox(x, (ty + y - ay0) / 2, Math.max(s1.w, 16) * 1.3, y - ay0 - ty + s1.h * 0.65); return; }
      c.globalAlpha = a; c.fillStyle = '#ff3d6e'; c.strokeStyle = HZ_INK; c.lineWidth = 2; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x, y - ay0 + b * (tuck ? 0.5 : 1)); c.lineTo(x - 8, y - ay1 + b * (tuck ? 0.5 : 1)); c.lineTo(x + 8, y - ay1 + b * (tuck ? 0.5 : 1)); c.closePath(); c.stroke(); c.fill();
      const dk = this.youDropT > 0 && this.youDropD > 0 ? this.youDropT / this.youDropD : 0, dsc = 1 + ((+this.youDropS || 1.6) - 1) * dk * dk;
      c.drawImage(s1.cv, x - s1.w * dsc / 2, ty - s1.h * dsc / 2, s1.w * dsc, s1.h * dsc);
      this.labRect(x, ty, s1.w, s1.h, 'you');
      c.globalAlpha = 1;
      return;
    }
    if (hold && !blk) blk = x > VIEW_W / 2 ? 1 : -1;   // beside him, on the side toward the middle
    const s = this.text('YOU', '#ffffff', 14);
    if (dr) { c.globalAlpha = a; c.fillStyle = '#ff3d6e'; c.beginPath(); }
    if (!dr) {   // the same choice as below, the box only
      let sd = blk ? -blk : 0;
      if (blk) {
        const fits = (d) => x + d * (34 + s.w) <= VIEW_W - 4 && x + d * (34 + s.w) >= 4 && !this.underDash(x + d * (34 + s.w / 2), y - 4, s.w + 24, s.h);
        if (!fits(sd)) sd = fits(blk) ? blk : 0;
      }
      if (!blk) this.youBox(x, y - 40 + b, s.w + 4, s.h + 14);
      else if (sd) this.youBox(x + sd * (22 + 6 + s.w / 2), y - 4, s.w + 16, s.h + 4);
      else if (this.underDash(x, y + 50 - b + 5, s.w, s.h + 20)) this.youBox(x, y - 40 + b, s.w + 4, s.h + 14);
      else this.youBox(x, y + 54 - b, s.w + 4, s.h + 14);
      return;
    }
    if (!blk) {
      c.moveTo(x, y - 26 + b); c.lineTo(x - 7, y - 36 + b); c.lineTo(x + 7, y - 36 + b); c.closePath(); c.fill();
      c.drawImage(s.cv, x - s.w / 2, y - 46 + b - s.h / 2, s.w, s.h);
      this.labRect(x, y - 46 + b, s.w, s.h, 'you');
    } else {
      let sd = -blk;
      const fits = (d) => { const cx = x + d * (34 + s.w / 2); return x + d * (34 + s.w) <= VIEW_W - 4 && x + d * (34 + s.w) >= 4 && !this.underDash(cx, y - 4, s.w + 24, s.h); };
      if (!fits(sd)) sd = fits(blk) ? blk : 0;
      if (sd) {   // beside him: the arrow points sideways at his head
        const ax = x + sd * 22 + sd * b * 0.5;
        c.moveTo(ax, y - 4); c.lineTo(ax + sd * 10, y - 11); c.lineTo(ax + sd * 10, y + 3); c.closePath(); c.fill();
        c.drawImage(s.cv, ax + sd * (12 + s.w / 2) - s.w / 2, y - 4 - s.h / 2, s.w, s.h);
        this.labRect(ax + sd * (12 + s.w / 2), y - 4, s.w, s.h, 'you');
      } else {    // below his tail, the arrow pointing up (above him instead when the DASH button sits there)
        const ty = y + 50 - b;
        if (this.underDash(x, ty + 5, s.w, s.h + 20)) {
          c.moveTo(x, y - 26 + b); c.lineTo(x - 7, y - 36 + b); c.lineTo(x + 7, y - 36 + b); c.closePath(); c.fill();
          c.drawImage(s.cv, x - s.w / 2, y - 46 + b - s.h / 2, s.w, s.h);
          this.labRect(x, y - 46 + b, s.w, s.h, 'you');
        } else {
          c.moveTo(x, ty - 10); c.lineTo(x - 7, ty); c.lineTo(x + 7, ty); c.closePath(); c.fill();
          c.drawImage(s.cv, x - s.w / 2, ty + 10 - s.h / 2, s.w, s.h);
          this.labRect(x, ty + 10, s.w, s.h, 'you');
        }
      }
    }
    c.globalAlpha = 1;
  }
  // a box (centre x, y, size w, h; logical) overlapping the DASH button (R.avoidRect)
  underDash(x, y, w, h) {
    const A = this.avoidRect;
    return !!(A && Number.isFinite(A.x) && Math.abs(x - (A.x + A.w / 2)) < (w + A.w) / 2 && Math.abs(y - (A.y + A.h / 2)) < (h + A.h) / 2);
  }
  // the first swim's ghost finger is up (main.js shows #tutTarget.swipe 110 px ahead of Kevin, its 'drag' label under it)
  // the swim-1 YOU tag drop-in: scale sc easing to 1 over dur seconds (main.js calls it on GO)
  youDrop(sc = 1.6, dur = 0.25) { if (this.reduced) return; this.youDropS = sc; this.youDropT = dur; this.youDropD = dur; }
  fingerUp() {
    if (this.tutEl === undefined) this.tutEl = typeof document !== 'undefined' ? document.getElementById('tutTarget') : null;
    const el = this.tutEl;
    return !!(el && el.classList && el.classList.contains('swipe') && !el.classList.contains('hide'));
  }

  // hype buddies: each FRENZY tier adds one (up to 5) circling Kevin; they scatter when the chain breaks
  drawBuddies(race, x, y, dt) {
    const p = race.p, c = this.ctx, t = this.time, red = this.reduced;
    const n = p.frenzyT > 0 && !race.over && !race.drill ? Math.min(5, p.tier || 0) : 0;
    this.buddyN = n; this.buddyX = x; this.buddyY = y;
    if (n > 0) {
      const R = 46, sp = red ? 0 : 2.2, m = this.wm;
      c.lineCap = 'round'; c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,255,255,0.85)';
      const pts = this._bud || (this._bud = new Float32Array(15));
      for (let i = 0; i < n; i++) {
        const a = t * sp + i * TAU / n, bx = x + Math.cos(a) * R, by = y + Math.sin(a) * R * 0.8;
        pts[i * 3] = bx; pts[i * 3 + 1] = by; pts[i * 3 + 2] = a + Math.PI;   // facing along the orbit
      }
      c.beginPath();
      for (let i = 0; i < n; i++) { setXf(c, m, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], 1, 1); this.tail(c, 0, 4, 0, 13, 2.2, t * 18 + i); }
      c.setTransform(m); c.stroke();
      for (let i = 0; i < n; i++) {
        c.fillStyle = red ? '#ffd75c' : HSL82[hueI(t * 200 + i * 72)];
        c.beginPath(); c.ellipse(pts[i * 3], pts[i * 3 + 1], 3.6, 4.6, pts[i * 3 + 2], 0, TAU); c.fill();
        c.fillStyle = '#1a0a1a'; c.fillRect(pts[i * 3] - 1.6, pts[i * 3 + 1] - 1.2, 1, 1.2); c.fillRect(pts[i * 3] + 0.6, pts[i * 3 + 1] - 1.2, 1, 1.2);
      }
    }
    // the scattered ones fly off and fade
    const F = this.buddyFly;
    if (!F.length) return;
    let k = 0;
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.4;
    for (const b of F) {
      b.t += dt; if (b.t > 0.7) continue; F[k++] = b;
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.97; b.vy *= 0.97;
      const al = 1 - b.t / 0.7, a = Math.atan2(b.vy, b.vx) + Math.PI / 2;
      c.globalAlpha = al; c.beginPath(); this.tail(c, b.x - Math.sin(a) * 4, b.y + Math.cos(a) * 4, a, 13, 2.2, t * 30 + b.i); c.stroke();
      c.fillStyle = b.col; c.beginPath(); c.ellipse(b.x, b.y, 3.6, 4.6, a, 0, TAU); c.fill();
    }
    F.length = k; c.globalAlpha = 1;
  }
  scatterBuddies() {
    const n = this.buddyN || 0;
    for (let i = 0; i < n; i++) {
      const a = this.time * 2.2 + i * TAU / n, v = 260 + Math.random() * 120;
      this.buddyFly.push({ x: this.buddyX + Math.cos(a) * 46, y: this.buddyY + Math.sin(a) * 37, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, i, col: HSL82[hueI(i * 72)] });
    }
    if (this.buddyFly.length > 10) this.buddyFly.splice(0, this.buddyFly.length - 10);
    this.buddyN = 0;
  }
  // the steal: for 0.6 s the world darkens round the thief inside the egg (alpha 0.45)
  drawStealVig() {
    const q = this.thiefXY, T = this.endT;
    if (!q || T > 0.6) return;
    const k = Math.min(1, T / 0.12) * Math.min(1, (0.6 - T) / 0.2), c = this.ctx;
    if (k <= 0.01) return;
    const g = c.createRadialGradient(q.x, q.y, 40, q.x, q.y, 380);
    g.addColorStop(0, 'rgba(12,0,16,0)'); g.addColorStop(0.2, 'rgba(12,0,16,0.45)'); g.addColorStop(1, 'rgba(12,0,16,1)');
    c.globalAlpha = 0.45 * k; c.fillStyle = g; c.fillRect(-40, -40, VIEW_W + 80, this.H + 80); c.globalAlpha = 1;
  }
  // the bits of a death that are not Kevin himself: the ghost, the headband left on the Big Mac
  drawDeath(race, kind, x, y, dk, band, cause = null) {
    const c = this.ctx, t = this.time, red = this.reduced;
    if (kind === 'energy' && dk > 0.5) {
      const g = (dk - 0.5) / 0.5, ge = 1 - (1 - g) * (1 - g), gy = y - 12 - 40 * ge, gx = x + (red ? 0 : Math.sin(g * 7) * 3);
      this.dglow(band, gx, gy, 26, 0.45 * ge);
      c.globalAlpha = 0.9 * ge; c.drawImage(this.ghostTint(band, cause === 'acid'), gx - 12, gy - 21, 24, 39);
      const hy = gy - 17 - (red ? 0 : Math.sin(t * 5) * 0.8);
      if (cause === 'acid') {   // no halo: he carries a tiny lemon up instead
        const lx = gx + 9, ly = gy - 4;
        c.fillStyle = '#ffe94a'; c.beginPath(); c.ellipse(lx, ly, 4.2, 3.1, -0.3, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(lx - 4.6, ly + 1.6); c.lineTo(lx - 3.2, ly + 0.2); c.lineTo(lx - 2.8, ly + 1.8); c.fill();
        c.strokeStyle = '#b89a10'; c.lineWidth = 0.7; c.beginPath(); c.ellipse(lx, ly, 4.2, 3.1, -0.3, 0, TAU); c.stroke();
        c.fillStyle = '#5bd96b'; c.beginPath(); c.ellipse(lx + 2.6, ly - 3.2, 2, 0.9, -0.6, 0, TAU); c.fill();
      } else { c.strokeStyle = '#ffd75c'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(gx, hy, 6.5, 2.2, 0, 0, TAU); c.stroke(); }
      c.globalAlpha = 1;
    } else if (kind === 'wbc' && this.dieT >= 0.35) {
      const e = this.dieWbc, ex = e.x, ey = this.sy(e.y), r = e.r * 1.05;
      if (!this.diePop) { this.diePop = 1; this.pop(ex, e.y + e.r + 14, 'nom', '#ff5c8a', 18, 0.9); this.burst(ex, e.y + e.r * 0.6, '#ffffff', this.lite ? 3 : 6, 90, 0.4, 2); }
      // the headband, stuck on the membrane at the top right, flapping in the current
      const bx = ex + r * 0.62, by = ey - r * 0.78;
      c.save(); c.translate(bx, by); c.rotate(0.6);
      c.fillStyle = band; c.beginPath(); c.moveTo(-7, -1.5); c.quadraticCurveTo(0, -3.2, 7, -1.5); c.lineTo(7, 1.5); c.quadraticCurveTo(0, -0.2, -7, 1.5); c.closePath(); c.fill();
      c.strokeStyle = band; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const w1 = red ? 0 : Math.sin(t * 9 + k * 1.3) * 3, w2 = red ? 0 : Math.sin(t * 9 + 1.7 + k * 1.3) * 4, L = 10 + k * 2;
        c.lineWidth = 2.4 - k * 0.5; c.beginPath(); c.moveTo(6.5, 0); c.quadraticCurveTo(6.5 + L * 0.6, L * 0.2 + w1, 6.5 + L * 0.75, L * 0.8 + w2); c.stroke();
      }
      c.restore();
    }
  }
  // the little ghost sprite washed in a colour (Kevin's headband), cached per colour
  ghostTint(col, noHalo = false) {
    const m = this.ghostTs || (this.ghostTs = new Map()), key = noHalo ? col + '|n' : col;
    let g = m.get(key);
    if (!g) {
      const src = this.ghostSpr(noHalo); g = mk(src.width, src.height); const x = g.getContext('2d');
      x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.35; x.fillStyle = col; x.fillRect(0, 0, g.width, g.height);
      if (m.size > 8) m.clear();
      m.set(key, g);
    }
    return g;
  }

  // ---------------------------------------------------------------- effects
  drawFx(race, dt, wdt = dt) {
    const c = this.ctx, m0 = this.wm, capB = this.lite ? 3 : 6;
    let nb = 0;
    const FX = race.fx;
    for (let fi = 0; fi < FX.length; fi++) {
      const f = FX[fi], y = this.sy(f.y), k = clamp(f.age / 1.2, 0, 1);
      if (f.t !== 'eaten' && f.age < 0.3 && nb < capB && y > -60 && y < this.H + 60) {
        // the body first: dizzy, sinking 8 px, tipping over and squashing flat with a limp tail, fading out
        nb++;
        const bk = f.age / 0.3, fi = ((f.face | 0) % 6 + 6) % 6;
        c.globalAlpha = 1 - bk;
        setXf(c, m0, f.x, y + 8 * bk, 0.6 * bk, 1 + 0.25 * bk, 1 - 0.2 * bk);
        c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(0, 9); c.quadraticCurveTo(3, 18, -1, 24); c.quadraticCurveTo(-3, 28, 0, 31); c.stroke();
        c.drawImage(this.headSpr(fi, 0, 4, 0), -10, -19, 20, 34);
        c.setTransform(m0);
      }
      if (f.t === 'eaten') {
        const s = this.text('nom', '#ff5c8a', 12);
        c.globalAlpha = 1 - k; c.drawImage(s.cv, f.x - s.w / 2, y - 10 - k * 30 - s.h / 2, s.w, s.h);
        c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 4; i++) { const px = f.x + Math.cos(i * 1.7) * k * 20, py = y + Math.sin(i * 1.7) * k * 20, r = 1.5 * (1 - k) + 0.3; c.moveTo(px + r, py); c.arc(px, py, r, 0, TAU); } c.fill();
      } else if (f.age >= 0.2) {   // then a tiny ghost with a halo floats off to swimmer heaven (from 0.2 s)
        const gk = clamp((f.age - 0.2) / 1.0, 0, 1), gy = y - 6 - gk * 40, gx = f.x + Math.sin(gk * 10) * 4;
        c.globalAlpha = 0.75 * (1 - gk) * Math.min(1, (f.age - 0.2) / 0.08); c.drawImage(this.ghostSpr(), gx - 8, gy - 14, 16, 26);
      }
    }
    c.globalAlpha = 1;
    // rings
    let n = 0;
    const RG = this.rings;
    for (let ri = 0; ri < RG.length; ri++) {
      const r = RG[ri];
      // (in a hit-stop a fresh ring still opens on real time, up to 0.18 s or half its life, so the hit reads at once)
      if (wdt === 0 && dt > 0) { const ag = r.max - r.life, cap = Math.min(0.18, r.max * 0.5); if (ag < cap) r.life -= Math.min(dt, cap - ag); }
      else r.life -= wdt;
      if (r.life <= 0) continue; this.rings[n++] = r;
      const k = 1 - r.life / r.max, e = 1 - (1 - k) * (1 - k);
      c.globalAlpha = 1 - k; c.strokeStyle = r.col; c.lineWidth = r.w * (1 - k) + 0.5;
      c.beginPath(); c.arc(r.x, this.sy(r.y), 6 + r.r * e, 0, TAU); c.stroke();
    }
    this.rings.length = n; c.globalAlpha = 1;
    // a 4+ pop chain: the popped cell's outline glows white for 0.12 s (a thick soft ring over a thin bright one)
    const PG = this.popGlows;
    if (PG && PG.length) {
      let gn = 0;
      for (let gi = 0, gl = PG.length; gi < gl; gi++) {
        const g = PG[gi];
        g.life -= wdt; if (g.life <= 0) continue; PG[gn++] = g;
        const a = g.life / 0.12, gy = this.sy(g.y);
        c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(g.x, gy, 24, 0, TAU);
        c.globalAlpha = 0.35 * a; c.lineWidth = 10; c.stroke();
        c.globalAlpha = a; c.lineWidth = 3; c.stroke();
      }
      PG.length = gn; c.globalAlpha = 1;
    }
    this.drawImpact();
    // particles: ring buffer, frame-rate independent drag. Streaks (1) and shards (5) are batched into one path
    // per colour and width bucket; bubble rings (4) come from a cached sprite.
    const d94 = Math.pow(0.94, wdt * 60), d985 = Math.pow(0.985, wdt * 60), d97 = Math.pow(0.97, wdt * 60);
    const P = this.P, top = -40, bot = this.H + 40, SB = this.streaks, NP = Math.min(this.pHW, P.length);
    // every batch is a kept list of { col, b: [number buckets] } plus a Map from colour to it; a frame reset is n = 0
    // on each bucket (the streak Map is never cleared: its colours come from fixed palettes, so it settles)
    const SL = this.streakL || (this.streakL = obuf());
    for (let i = 0; i < SL.n; i++) { const v = SL.a[i].b; v[0].n = 0; v[1].n = 0; v[2].n = 0; }
    // drops (kind 3) batch the same way: by colour and by alpha in 4 steps (0.25 .. 1), one fill a bucket
    const DB = this.drops || (this.drops = new Map()), DL = this.dropL || (this.dropL = obuf());
    for (let i = 0; i < DL.n; i++) { const v = DL.a[i].b; v[0].n = 0; v[1].n = 0; v[2].n = 0; v[3].n = 0; }
    // confetti (kind 2) too: by colour and 4 alpha steps, one rect path and one fill a bucket
    const CB = this.confB || (this.confB = new Map()), CL = this.confL || (this.confL = obuf());
    for (let i = 0; i < CL.n; i++) { const v = CL.a[i].b; v[0].n = 0; v[1].n = 0; v[2].n = 0; v[3].n = 0; }
    let live = 0;
    const H = this.H, cy = this.camY;   // (sy inlined: H - (q.y - cy))
    this.hfB = race.demo || race.over ? null : this.hudB();
    for (let i = 0; i < NP; i++) {
      const q = P[i];
      if (q.life <= 0) continue;
      q.life -= wdt; if (q.life <= 0) continue;
      live = i + 1;
      q.x += q.vx * wdt; q.y += q.vy * wdt; q.vy -= q.g * wdt;
      if (q.k === 2) { q.vx *= d985; q.vy *= d97; } else { q.vx *= d94; if (q.k !== 3) q.vy *= d94; }
      if (q.k === 2 || q.k === 5) q.rot += q.vr * wdt;
      const sy = H - (q.y - cy);
      if (sy < top || sy > bot) continue;
      const a = q.life / q.max, hf = this.hudFade(sy);
      if (q.k === 0) { const r = q.size * (0.4 + a); c.globalAlpha = a * hf; c.drawImage(this.dot(q.col), q.x - r * 1.45, sy - r * 1.45, r * 2.9, r * 2.9); continue; }
      if (q.k === 1 || q.k === 5 || q.k === 6) {
        if (hf < 1) {   // under the HUD: this one strokes alone at its fade (outside the batches)
          c.globalAlpha = 0.9 * hf; c.strokeStyle = q.col; c.lineCap = 'round'; c.beginPath();
          if (q.k === 6) { const sp = hyp(q.vx, q.vy) || 1, l = Math.min(18, sp * 0.04) * (0.5 + 0.5 * a); c.lineWidth = 2.2; c.moveTo(q.x, sy); c.lineTo(q.x - q.vx / sp * l, sy + q.vy / sp * l); }
          else if (q.k === 1) { c.lineWidth = Math.max(1.2, q.size * 0.7 * (0.4 + a)); c.moveTo(q.x, sy); c.lineTo(q.x - q.vx * 0.05 * (0.4 + 0.6 * a), sy + q.vy * 0.05 * (0.4 + 0.6 * a)); }
          else { const l = q.size * (0.35 + 0.65 * a), dx = Math.cos(q.rot) * l, dy = Math.sin(q.rot) * l; c.lineWidth = 3.2; c.moveTo(q.x - dx, sy - dy); c.lineTo(q.x + dx, sy + dy); }
          c.stroke(); continue;
        }
        let e = SB.get(q.col); if (!e) { e = { col: q.col, b: [nbuf(), nbuf(), nbuf()] }; SB.set(q.col, e); SL.a[SL.n++] = e; }
        const v = e.b;
        if (q.k === 6) { const sp = hyp(q.vx, q.vy) || 1, l = Math.min(18, sp * 0.04) * (0.5 + 0.5 * a); nb4(v[1], q.x, sy, q.x - q.vx / sp * l, sy + q.vy / sp * l); }
        else if (q.k === 1) { const w = q.size * 0.7 * (0.4 + a), bk = w < 1.6 ? 0 : w < 2.8 ? 1 : 2; nb4(v[bk], q.x, sy, q.x - q.vx * 0.05 * (0.4 + 0.6 * a), sy + q.vy * 0.05 * (0.4 + 0.6 * a)); }
        else { const l = q.size * (0.35 + 0.65 * a), dx = Math.cos(q.rot) * l, dy = Math.sin(q.rot) * l; nb4(v[2], q.x - dx, sy - dy, q.x + dx, sy + dy); }
        continue;
      }
      if (q.k === 4) { const r = q.size * (1.5 - a * 0.5); c.globalAlpha = a * hf; c.drawImage(this.ringSpr(q.col, this.gooOn), q.x - r - 1, sy - r - 1, r * 2 + 2, r * 2 + 2); continue; }
      if (q.k === 3) {
        const qa = Math.min(3, Math.max(0, Math.ceil(a * hf * 4) - 1));
        let e = DB.get(q.col); if (!e) { if (DB.size > 48) { DB.clear(); DL.n = 0; } e = { col: q.col, b: [nbuf(), nbuf(), nbuf(), nbuf()] }; DB.set(q.col, e); DL.a[DL.n++] = e; }
        nb3(e.b[qa], q.x, sy, q.size); continue;
      }
      if (q.k === 2) {
        const ca = Math.min(1, a * 3) * hf, qa = Math.min(3, Math.max(0, Math.ceil(ca * 4) - 1));
        let e = CB.get(q.col); if (!e) { if (CB.size > 48) { CB.clear(); CL.n = 0; } e = { col: q.col, b: [nbuf(), nbuf(), nbuf(), nbuf()] }; CB.set(q.col, e); CL.a[CL.n++] = e; }
        nb4(e.b[qa], q.x, sy, Math.cos(q.rot) * q.size || 0.5, q.size);
      }
    }
    for (let ci = 0; ci < CL.n; ci++) {
      const e = CL.a[ci], v = e.b;
      c.fillStyle = e.col;
      for (let b = 0; b < 4; b++) {
        const B = v[b], L = B.a, ln = B.n; if (!ln) continue;
        c.globalAlpha = (b + 1) / 4; c.beginPath();
        for (let j = 0; j < ln; j += 4) { const w = L[j + 2], z = L[j + 3]; c.rect(L[j] - w / 2, L[j + 1] - z * 0.3, w, z * 0.6); }
        c.fill();
      }
    }
    for (let di = 0; di < DL.n; di++) {
      const e = DL.a[di], v = e.b;
      c.fillStyle = e.col;
      for (let b = 0; b < 4; b++) {
        const B = v[b], L = B.a, ln = B.n; if (!ln) continue;
        c.globalAlpha = (b + 1) / 4; c.beginPath();
        for (let j = 0; j < ln; j += 3) { const x = L[j], y = L[j + 1], z = L[j + 2]; c.moveTo(x, y - z * 1.8); c.quadraticCurveTo(x + z, y, x, y + z); c.quadraticCurveTo(x - z, y, x, y - z * 1.8); }
        c.fill();
      }
    }
    this.pHW = Math.max(live, this.pHead);   // dead slots past the last live one are skipped next frame
    if (SL.n) {
      c.globalAlpha = 0.9; c.lineCap = 'round';
      for (let si = 0; si < SL.n; si++) {
        const e = SL.a[si], v = e.b;
        c.strokeStyle = e.col;
        for (let bk = 0; bk < 3; bk++) {
          const B = v[bk], L = B.a, ln = B.n; if (!ln) continue;
          c.lineWidth = bk === 0 ? 1.2 : bk === 1 ? 2.2 : 3.2; c.beginPath();
          for (let j = 0; j < ln; j += 4) { c.moveTo(L[j], L[j + 1]); c.lineTo(L[j + 2], L[j + 3]); }
          c.stroke();
        }
      }
    }
    c.globalAlpha = 1;
    // popups: baked sprites, a 1.35x pop-in, wobble; kept in a band around the swimmer and above the bottom combo strip.
    // They age on real time (half speed in slow-mo, frozen only in a hit-stop) so a slow-mo never parks text on screen.
    n = 0;
    const ts = this.ts == null ? 1 : this.ts, pdt = ts === 0 ? 0 : dt * (0.5 + 0.5 * ts);
    const px = race.p.x, py = this.sy(race.p.y), m = this.wm, lo = py - 110, hi = Math.max(lo, Math.min(py + 50, this.H - Math.max(190, (this.padB || 0) + 40)));
    const PLB = this._placed || (this._placed = nbuf()); PLB.n = 0;
    const BB = this.bigBoxes; let bbn = 0;   // where the big pops sit this frame (next frame's labels keep clear of them)
    const wl = this.wallX(race.p.y, race.p.side || 0, -1), wr = this.wallX(race.p.y, race.p.side || 0, 1);
    // placed: (x, y, w, h) per drawn pop; two pops stack (h1 + h2) / 2 * 1.05 + 4 CSS px apart (h: the birth-scaled
    // height while a pop is fresh), so no pop overlaps another even while it pops in at 1.35x
    this.popGapK = 4 * (this.cssK || 1);
    const popTop = this.hudB() + 20 * (this.cssK || 1);
    const eggEyes = !!race.drill || !!(race.over && race.over.reason === 'late') || this.eggCam > 0.5, eggX = centre(RACE_LEN), eggY = this.sy(RACE_LEN + 120) + 2;
    let headSeen = false, headUp = 0;
    // bright floors (the Acid Lagoon, THE EGG): pop words switch to a white or gold fill (their 3 px ink outline is
    // baked in), since lime, mint and pink fills vanish on them
    const zP = this.bt > 0.5 && ZONES[this.zi + 1] ? ZONES[this.zi + 1].id : ZONES[this.zi] ? ZONES[this.zi].id : '', bright = zP === 'acid' || zP === 'egg' || zP === 'goo';
    // (the Gate of Goo's cream floor counts as bright too: its plates go darker, its words never dim over Kevin)
    const POPS = this.pops, red = this.reduced;
    let colX = null;   // the ledger / DNA column: the first such pop drawn this frame sets x, the rest line up under it
    this.buildKO(race);
    const kL = Math.max(2, wl), kR = Math.min(VIEW_W - 2, wr);
    for (let qi = 0; qi < POPS.length; qi++) {
      const q = POPS[qi];
      // only the oldest big pop is the headline; the rest wait (and do not age) behind it
      if (q.big) { if (headSeen) { this.pops[n++] = q; continue; } headSeen = true; }
      // n-dependent big pops bake at 4 px steps and scale at draw time (fewer distinct sprites)
      const bs = q.big ? Math.max(20, Math.round(q.size / 4) * 4) : q.size, dsc = q.size / Math.round(bs);
      // the sprite is kept on the pop (the LRU is touched only on the first bake; an evicted sprite is re-baked)
      const pc = bright && !q.think ? brightCol(q.col) : q.col;
      if (q.spr && (q.spr.dead || q.sprBs !== bs || q.sprC !== pc)) q.spr = null;
      const s = q.spr || this.text(q.text, pc, bs, q.big ? 'popPn' : q.think ? 'think' : q.plate ? 'popSn' : 'pop', true);
      if (!s) { this.pops[n++] = q; continue; }        // bake budget used up: wait a frame, do not age
      q.spr = s; q.sprBs = bs; q.sprC = pc;
      // a hit-stop freezes the world, not the words: a frozen pop still plays its 0.18 s birth on real time (life
      // untouched), so SPLAT is full size by the 2nd held frame
      if (pdt === 0) { if (q.age < 0.18) q.age = Math.min(0.18, q.age + dt); }
      else { q.age += pdt; q.life -= pdt; }
      if (q.life <= 0) continue; this.pops[n++] = q;
      // a long word ('COACH IS NOT CRYING' at 34 px) is scaled to fit 90% of the view at rest
      const fitK = Math.min(1, VIEW_W * 0.9 / Math.max(1, s.w * dsc));
      const k = 1 - q.life / q.max, ag = q.age, W = s.w * dsc * fitK, Hs = s.h * dsc * fitK;
      const sc = (ag < 0.08 ? 1.35 * backOut(ag / 0.08) / backOut(1) : ag < 0.18 ? 1.35 - 0.35 * (ag - 0.08) / 0.1 : 1 - Math.max(0, k - 0.7) * 0.4) * dsc * fitK;
      // full for the first 0.4 s (a thought: full for 0.8 s, then a steady fade to its end)
      const fadeA = q.think ? (ag < 0.8 ? 1 : clamp(q.life / Math.max(0.05, q.max - 0.8), 0, 1)) : ag < 0.4 ? 1 : Math.min(k > 0.7 ? (1 - k) / 0.3 : 1, q.life / 0.25);
      let x, y;
      if (q.big) {
        // the headline slot: py - 170 (drifting +20 to -20), centred, inside the walls, under the HUD, clear of a banner
        const rise = 1 - Math.pow(1 - Math.min(1, ag / 1.1), 3);
        y = py - 150 - 40 * rise;
        const wy = race.p.y + (py - y), sd = race.p.side || 0;
        const hl = Math.max(2, this.wallX(wy, sd, -1)), hr = Math.min(VIEW_W - 2, this.wallX(wy, sd, 1));
        x = hr - hl >= W ? clamp(VIEW_W / 2, hl + W / 2, hr - W / 2) : (hl + hr) / 2;
        x = clamp(x, W / 2 + 2, VIEW_W - W / 2 - 2);
        const top = this.hudB() + 12 * this.cssK;
        if (y - Hs * 0.5 < top) y = top + Hs * 0.5;
        const bb = this.bannerBox;
        if (bb && Number.isFinite(bb.y1) && y - Hs * 0.5 < bb.y1 && y + Hs * 0.5 > bb.y0 && bb.y1 + 4 + Hs < py - 40) y = bb.y1 + 4 + Hs * 0.5;
        headUp = Math.max(headUp, fadeA);
        // at the egg the headline never sits on her face: it drops below her eyes (the egg face box, 92 x 46 round
        // each eye, the small pops' rule)
        if (eggEyes && Math.abs(x - eggX) < 92 + W / 2 && Math.abs(y - eggY) < 23 + Hs * 0.5) y = eggY + 23 + Hs * 0.5 + 4;
        nb4(PLB, x, y, W, Hs * (ag < 0.18 ? 1.35 : 1));
        q.fa = 1;
      } else {
        q.dy = this.reduced ? q.y : q.y + 30 * (1 - Math.pow(1 - k, 3));
        x = clamp(q.x, W / 2 + 2, VIEW_W - W / 2 - 2);
        y = clamp(this.sy(q.dy), lo, hi);
        // small pops live in the side lanes (|x - px| > 60), never on Kevin's column
        const lane = 60 + W / 2;
        if (!race.over && Math.abs(x - px) < lane) {
          const sd = x >= px ? 1 : -1, fit = (v) => v - W / 2 >= 2 && v + W / 2 <= VIEW_W - 2;
          if (fit(px + sd * lane)) x = px + sd * lane; else if (fit(px - sd * lane)) x = px - sd * lane;
        }
        // the clamp can squeeze two pops onto one line: stack this one clear of those already drawn (its birth-scaled
        // height while fresh, every placed pop, until nothing moves)
        const Hh = Hs * (ag < 0.18 ? Math.max(1, sc / (dsc * fitK)) : 1);
        // the head start ledger's lines and the DNA pops read as one list: one column (the first one's x), 6 px apart
        const lst = q.lst == null ? (q.lst = /DNA/.test(q.text) || q.col === '#fff1b0') : q.lst;
        if (lst) { if (colX == null) colX = x; else x = clamp(colX, W / 2 + 2, VIEW_W - W / 2 - 2); this.popGapK = 6 * (this.cssK || 1); }
        y = this.popStack(x, y, W, Hh);
        this.popGapK = 4 * (this.cssK || 1);
        // keep Kevin clear (when no side lane fits): a pop in the box round him moves above it, or sideways
        // when the space above is taken and the side still fits inside the walls; it dims to 0.7 meanwhile
        // (while his YOU tag shows over his head the box reaches up past it, so a perk pop never sits on the tag)
        const hw = 46 + W / 2, hh = Hs * 0.3, kTop = this.youA > 0.05 ? 58 : 34;
        const over = !race.over && Math.abs(x - px) < hw && y + hh > py - kTop && y - hh < py + 30;
        if (over) {
          const upY = py - kTop - hh - 1, sx = x >= px ? px + hw + 1 : px - hw - 1;
          const fitsAt = (v) => v - W / 2 >= Math.max(2, wl) && v + W / 2 <= Math.min(VIEW_W - 2, wr), fits = fitsAt(sx);
          // a bright floor never dims a pop over Kevin (0.7 sank it into the floor): it goes sideways first, either side
          const sx2 = x >= px ? px - hw - 1 : px + hw + 1;
          if (bright && fits && !this.popHits(sx, y, W, Hh)) x = sx;
          else if (bright && fitsAt(sx2) && !this.popHits(sx2, y, W, Hh)) x = sx2;
          else if (this.popHits(x, upY, W, Hh) && fits && !this.popHits(sx, y, W, Hh)) x = sx;
          else y = this.popStack(x, upY, W, Hh);   // above, stacked over any pop already parked there
        }
        // never on the YOU tag, a name tag or a named rival: pushed sideways past the box (its overlap + 8 px) toward
        // the side with more room; when that is clipped by the walls or lands on another box, 28 px further from Kevin
        if (!race.over && this.koN) {
          let j = this.koHit(x, y, W, Hh);
          for (let it = 0; it < 3 && j >= 0; it++) {
            const K = this.koR, bx = K[j], bw = K[j + 2], roomL = bx - bw / 2 - kL, roomR = kR - (bx + bw / 2);
            const nx = roomR >= roomL ? bx + (bw + W) / 2 + 8 : bx - (bw + W) / 2 - 8;   // (x + overlap + 8 on that side)
            if (nx - W / 2 >= kL && nx + W / 2 <= kR && this.koHit(nx, y, W, Hh) < 0 && !this.popHits(nx, y, W, Hh) && !(Math.abs(nx - px) < 46 + W / 2 && y + Hh / 2 > py - 34 && y - Hh / 2 < py + 30)) { x = nx; j = -1; break; }
            y += y < py ? -28 : 28;
            j = this.koHit(x, y, W, Hh);
          }
        }
        // pushed up under the HUD: the OLDEST small pop gives way (gone next frame) instead of this one drawing over
        // the HUD; when this one is the oldest it goes now
        if (!race.over && y - Hh / 2 < popTop) {
          let old = null;
          for (const r of this.pops) if (!r.big && r.life > 0 && (!old || r.age > old.age)) old = r;
          if (old === q || !old) { q.life = 0; n--; continue; }
          old.life = 0; y = popTop + Hh / 2;
        }
        // at the egg a small pop never sits on her eyes (the duel bubbles' rule: 92 x 46 round each eye): it moves
        // above them, or below when above would go under the HUD
        if (eggEyes && Math.abs(x - eggX) < 92 + W / 2 && Math.abs(y - eggY) < 23 + Hh / 2) {
          const upY = eggY - 23 - Hh / 2 - 3;
          y = upY - Hh / 2 >= popTop ? upY : eggY + 23 + Hh / 2 + 3;
        }
        q.fa = q.fa == null ? 1 : q.fa + ((over && !bright ? 0.7 : 1) - q.fa) * Math.min(1, dt * 12);
        nb4(PLB, x, y, W, Hh);
      }
      const rot = this.reduced ? 0 : q.big ? q.rot * 0.4 * Math.max(0, 1 - ag) : q.rot * (1 - k) + Math.sin(k * 18) * 0.05 * (1 - k);
      // the words keep 0.92 or more until the last 0.18 s (fw = min(0.3 max, 0.18)) and then fade over fw; only the
      // plate takes the long fadeA (the duel bubble's rule). A bright floor holds both at 0.8 or more until that
      // tail; reduced motion skips the tail and cuts the pop in 0.1 s. (A thought keeps its own baked fade.)
      const fw = red ? 0.1 : Math.min(0.3 * q.max, 0.18), inTail = q.life <= fw, alK = q.al * q.fa;
      let tA = q.think ? fadeA * alK : (inTail ? Math.max(0.92, red ? 1 : fadeA) * q.life / fw : red ? 1 : Math.max(0.92, fadeA)) * alK;
      let pA = red ? tA : fadeA * alK;
      if (bright && !inTail) { tA = Math.max(tA, 0.8); pA = Math.max(pA, 0.8); }
      if (inTail) pA = Math.min(pA, tA);
      setXf(c, m, x, y, rot, sc, sc);
      if (s.pw) {   // the plate, live (rgba(20,2,18,0.85) on a bright floor)
        c.globalAlpha = clamp(pA, 0, 1) * (bright ? 0.85 : s.pa);
        c.fillStyle = 'rgb(20,2,18)'; this.rrect(-s.pw / 2, -s.ph / 2, s.pw, s.ph, s.pr); c.fill();
      }
      c.globalAlpha = clamp(tA, 0, 1); c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h);
      c.globalAlpha = clamp(tA, 0, 1);
      if (q.think && !race.over) this.thinkTail(x, y, Hs * sc / (dsc * fitK || 1) * 0.5, W * 0.3, px, py);
      if (q.big && bbn < 24) { BB[bbn++] = x; BB[bbn++] = y; BB[bbn++] = s.w * sc * 0.5; BB[bbn++] = s.h * sc * 0.35; }
    }
    this.headUp = headUp;
    c.setTransform(m);
    this.bigBoxN = bbn;
    this.pops.length = n; c.globalAlpha = 1;
  }
  // drawFx's pop placement (placed: this._placed, (x, y, w, h) per drawn pop): two pops stack (h1 + h2) / 2 * 1.05 +
  // popGapK apart; popHits says a w x h pop at (x, y) would overlap one, popStack moves y up clear of every placed pop
  // (up to 4 passes, until nothing moves)
  // this frame's keep-out boxes for the small pops (into this.koR, no allocation)
  buildKO(race) {
    const K = this.koR, cap = K.length; let n = 0;
    this.drawYou(race, false);
    if (this.youKOn) { K[0] = this.youKO[0]; K[1] = this.youKO[1]; K[2] = this.youKO[2]; K[3] = this.youKO[3]; n = 4; }
    const LR = this.labRects, LN = this.labRN;
    for (let i = 0; i < LN && n < cap; i++) {
      const j = i * 4, x0 = LR[j], y0 = LR[j + 1], x1 = LR[j + 2], y1 = LR[j + 3];
      if (!(x1 > x0) || !(y1 > y0)) continue;
      K[n++] = (x0 + x1) / 2; K[n++] = (y0 + y1) / 2; K[n++] = x1 - x0; K[n++] = y1 - y0;
    }
    const SB = this.signBoxes;
    for (let j = 0; j + 3 < SB.length && n < cap; j += 4) { K[n++] = SB[j]; K[n++] = SB[j + 1] + SB[j + 3] / 2; K[n++] = SB[j + 2]; K[n++] = SB[j + 3]; }
    const VB = this._vis;
    if (VB && !race.over) for (let i = 0; i < VB.n && n < cap; i++) {
      const a = VB.a[i], A = VB.b[i];
      if (!a || !a.boss || !A || A.seen !== this.frame) continue;
      K[n++] = A.rx + (A.kp || 0); K[n++] = this.H - (a.y + (A.oy || 0) - this.camY) + 4; K[n++] = 30; K[n++] = 36;
    }
    this.koN = n;
  }
  // the keep-out box a w x h pop at (x, y) overlaps (its index in koR), or -1
  koHit(x, y, w, h) {
    const K = this.koR;
    for (let j = 0; j < this.koN; j += 4) if (Math.abs(K[j] - x) < (K[j + 2] + w) / 2 && Math.abs(K[j + 1] - y) < (K[j + 3] + h) / 2) return j;
    return -1;
  }
  popHits(x, y, w, h) {
    const B = this._placed, L = B.a, g = this.popGapK;
    for (let j = 0; j < B.n; j += 4) if (Math.abs(L[j] - x) < (L[j + 2] + w) / 2 && Math.abs(L[j + 1] - y) < (L[j + 3] + h) / 2 * 1.05 + g) return true;
    return false;
  }
  popStack(x, y, w, h) {
    const B = this._placed, L = B.a, gk = this.popGapK;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (let j = 0; j < B.n; j += 4) { const g = (L[j + 3] + h) / 2 * 1.05 + gk; if (Math.abs(L[j] - x) < (L[j + 2] + w) / 2 && Math.abs(L[j + 1] - y) < g - 1e-6) { y = L[j + 1] - g; moved = true; } }
      if (!moved) break;
    }
    return y;
  }
  // a thought's tail: two little plate-coloured bubbles from the plate's edge (half height hh, half reach hw) toward
  // Kevin at (kx, ky); nothing when he is right there. Called with the pop's own alpha set.
  thinkTail(x, y, hh, hw, kx, ky) {
    const c = this.ctx, dy = ky - y, sd = dy >= 0 ? 1 : -1;
    if (Math.abs(dy) < hh + 10) return;
    c.setTransform(this.wm);
    const x0 = clamp(kx, x - hw, x + hw), y0 = y + sd * (hh + 1), dx = kx - x0, dd = ky - y0, L = hyp(dx, dd) || 1, ux = dx / L, uy = dd / L;
    c.fillStyle = 'rgba(20,2,18,0.62)'; c.beginPath();
    c.moveTo(x0 + ux * 4 + 3.4, y0 + uy * 4); c.arc(x0 + ux * 4, y0 + uy * 4, 3.4, 0, TAU);
    if (L > 22) { c.moveTo(x0 + ux * 12 + 2.1, y0 + uy * 12); c.arc(x0 + ux * 12, y0 + uy * 12, 2.1, 0, TAU); }
    c.fill();
  }
  // R.dadFlex(): Dad's 250 ms squash-and-stretch after a buy; R.dadFlexPhase() is its phase 0..1 for drawDad's flex
  // argument (0 when he stands still: the shop canvas only needs redrawing while it is above 0)
  dadFlex() { this.dadFlexAt = typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  dadFlexPhase() {
    if (this.dadFlexAt == null || this.reduced) return 0;
    const u = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - this.dadFlexAt) / 250;
    if (u >= 1 || u < 0) { this.dadFlexAt = null; return 0; }
    return u;
  }
  // R.photoFinish(race, winner, loser, sec): a 0.7 s photo-finish still (main.js holds the race meanwhile): a sepia
  // slit-scan strip across the egg, both noses ringed in their colours, a hand-drawn 'by a whisker' line between them
  // and a big stamp of the gap ('0.23s'), then a snap back to colour (a soft flash, none under R.noFlash). winner /
  // loser: race.p (or 'kevin'), a rival agent, its index or its name. Reduced motion: the same still, no scan, no punch.
  photoFinish(race, winner, loser, sec) {
    race = race || this.race;
    if (!race) return;
    const v = +sec;
    this.pf = { race, w: winner, l: loser, txt: Number.isFinite(v) ? (v < 10 ? v.toFixed(2) : v.toFixed(1)) + 's' : '', t: 0, dur: 0.7, done: false };
  }
  // a photo-finish swimmer's nose (screen, world frame) into out [x, y, colour]; false when it is not on screen
  pfNose(race, a, out) {
    const p = race.p, ex = centre(RACE_LEN), ey = this.sy(RACE_LEN + 120);
    let x, y, col;
    if (a == null || a === p || a === 'kevin' || a === 'Kevin') {
      x = Number.isFinite(this.youX) ? this.youX : p.x; y = Number.isFinite(this.youY) ? this.youY : this.sy(p.y); col = '#ff5c8a';
    } else {
      const ag = this.rivalOf(race, a);
      if (!ag) return false;
      const dq = this.duel.get(ag), A = this.aux.get(ag);
      if (dq) { x = dq.x; y = dq.y; } else if (A && A.init) { x = A.rx; y = this.sy(ag.y + (A.oy || 0)); } else return false;
      col = (ag.boss && ag.boss.col) || '#ffffff';
    }
    const dx = ex - x, dy = ey - y, L = hyp(dx, dy) || 1;
    out[0] = x + dx / L * 13; out[1] = y + dy / L * 13; out[2] = col;
    return true;
  }
  drawPhotoFinish(dt) {
    const F = this.pf;
    if (!F) return;
    F.t += dt;
    if (F.t >= F.dur) {
      if (!F.done && !this.noFlash && !this.reduced) { this.flash = 0.22; this.flashCol = 'rgba(255,244,220,0.5)'; }
      this.pf = null; return;
    }
    const c = this.ctx, red = this.reduced, race = F.race, A = this._pfA || (this._pfA = [0, 0, '']), B = this._pfB || (this._pfB = [0, 0, '']);
    const okA = this.pfNose(race, F.w, A), okB = this.pfNose(race, F.l, B);
    const al = Math.min(1, F.t / 0.06, (F.dur - F.t) / 0.08);
    // the strip sits across the egg's lower rim where the noses meet: on the leading nose (the higher one on screen),
    // under the HUD, clear of the duel panel (R.duelBox)
    const my = okA && okB ? Math.min(A[1], B[1]) + 24 : okA ? A[1] : okB ? B[1] : this.sy(RACE_LEN + 120), hb = this.hudB(), half = 66;
    let top = clamp(my - half, hb + 4, this.H - 2 * half - 4);
    const db = this.duelBox;
    if (db && Number.isFinite(db.y0) && Number.isFinite(db.y1) && top < db.y1 && top + 2 * half > db.y0) top = db.y0 - 2 * half - 4 >= hb + 4 ? db.y0 - 2 * half - 4 : Math.min(db.y1 + 4, this.H - 2 * half - 4);
    c.setTransform(this.worldM);
    // the sepia strip and its slit-scan lines
    c.globalAlpha = 0.5 * al; c.fillStyle = '#6e4618'; c.fillRect(-20, top, VIEW_W + 40, half * 2);
    c.globalAlpha = 0.2 * al; c.fillStyle = '#ffe2b0'; c.fillRect(-20, top, VIEW_W + 40, half * 2);
    c.globalAlpha = 0.22 * al; c.strokeStyle = '#2a1606'; c.lineWidth = 1; c.beginPath();
    const off = red ? 0 : (F.t * 140) % 6;
    for (let xx = -off; xx < VIEW_W; xx += 6) { c.moveTo(xx, top); c.lineTo(xx, top + half * 2); }
    c.stroke();
    c.globalAlpha = al; c.strokeStyle = '#fff4dc'; c.lineWidth = 2; c.beginPath(); c.moveTo(-20, top); c.lineTo(VIEW_W + 20, top); c.moveTo(-20, top + half * 2); c.lineTo(VIEW_W + 20, top + half * 2); c.stroke();
    const lb = this.text('PHOTO FINISH', '#fff4dc', this.fpx(11), 'label');
    c.drawImage(lb.cv, 8, top + 4, lb.w, lb.h);
    // the noses, ringed in their own colours, and the wobbly hand-drawn line between them
    if (okA && okB) {
      const n = 6;
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        c.strokeStyle = pass ? '#fff4dc' : HZ_INK; c.lineWidth = pass ? 1.8 : 4; c.beginPath(); c.moveTo(A[0], A[1]);
        for (let i = 1; i <= n; i++) {
          const u = i / n, jx = i < n ? (h1(i * 3.7 + 1) - 0.5) * 4 : 0, jy = i < n ? (h1(i * 5.1 + 2) - 0.5) * 4 : 0;
          c.lineTo(A[0] + (B[0] - A[0]) * u + jx, A[1] + (B[1] - A[1]) * u + jy);
        }
        c.stroke();
      }
      for (const N of [A, B]) {
        c.strokeStyle = HZ_INK; c.lineWidth = 5; c.beginPath(); c.arc(N[0], N[1], 11, 0, TAU); c.stroke();
        c.strokeStyle = N[2]; c.lineWidth = 2.5; c.stroke();
      }
      const wh = this.text('by a whisker', '#fff4dc', this.fpx(12), 'think'), mx = (A[0] + B[0]) / 2, mY = (A[1] + B[1]) / 2;
      const wy = clamp(mY - 18, top + wh.h / 2 + 2, top + half * 2 - wh.h / 2 - 2);
      c.drawImage(wh.cv, clamp(mx, wh.w / 2 + 4, VIEW_W - wh.w / 2 - 4) - wh.w / 2, wy - wh.h / 2, wh.w, wh.h);
    }
    // the stamp: the gap in big type, tilted, punched in over 0.12 s
    if (F.txt) {
      const st = this.text(F.txt, '#ffd75c', 34, 'popP'), k = red ? 1 : 1 + 0.6 * (1 - clamp(F.t / 0.12, 0, 1)), sY = Math.max(hb + st.h / 2 + 6, top - st.h * 0.2);
      c.globalAlpha = al; setXf(c, this.worldM, VIEW_W * 0.68, sY, red ? 0 : -0.14, k, k); c.drawImage(st.cv, -st.w / 2, -st.h / 2, st.w, st.h);
      c.setTransform(this.worldM);
    }
    c.globalAlpha = 1;
  }
  // ---------------------------------------------------------------- the egg duel's VS slam
  // R.vsSlam(kevinLook, rivalAgent, opts): ui calls it once on 'drill'. A 0.85 s screen-space overlay just under the
  // duel panel (R.duelBox; else under the HUD): two diagonal panels slam in from the sides over 0.12 s (1.08
  // overshoot), Kevin's bust on mint (#7dffb0), the rival's in its colour on its own; a white VS pops at 0.15 s; first
  // names at 28 px, epithets at 13 px (RIVAL_EPITHETS), the rival's move (RIVAL_MOVE_NAMES) in its colour, opts.record
  // under Kevin and a red NEMESIS ribbon when opts.nemesis. Panels at 75% alpha, sliding out from 0.6 to 0.85 s. It is
  // canvas only, so it never takes a tap. Reduced motion: a static card for 0.6 s.
  // kevinLook: optional { name, epithet, band, acc } (else Kevin's live look); rivalAgent: an agent, its index in
  // race.agents, a rival's name or a RIVALS entry; opts: { record, nemesis }
  vsSlam(kevinLook, rivalAgent, opts = {}) {
    const race = this.race, RV = Array.isArray(K.RIVALS) ? K.RIVALS : [];
    let ag = rivalAgent;
    if (typeof ag === 'number' && race && race.agents) ag = race.agents[ag];
    let boss = ag && ag.boss ? ag.boss : ag && ag.name && ag.col ? ag : null;
    if (!boss && typeof rivalAgent === 'string') boss = RV.find((r) => r.name === rivalAgent || r.name.split(' ')[0] === rivalAgent) || null;
    if (!boss) return false;
    const full = String(boss.name || ''), fn = full.split(' ')[0], kl = kevinLook || {}, o = opts || {};
    const EP = K.RIVAL_EPITHETS || {}, MV = K.RIVAL_MOVE_NAMES || {};
    this.vs = {
      t: 0, fn, col: boss.col || '#ffd75c', ep: EP[full] || EP[fn] || '', mv: MV[fn] || MV[full] || '',
      kName: String(kl.name || 'KEVIN').toUpperCase(), kEp: String(kl.epithet || 'the Millionth'),
      kBand: kl.band || this.accBand || '#ff3d6e', kAcc: Array.isArray(kl.acc) ? kl.acc : this.accRest || [],
      rec: o.record != null && o.record !== '' ? String(o.record) : '', nem: !!o.nemesis, red: !!this.reduced,
      kick: o.kicker ? String(o.kicker).toUpperCase() : '',
    };
    return true;
  }
  // an epithet in one line, or two balanced at a space when it is wider than mw (cached per text and width)
  vsWrap(txt, mw) {
    const WC = this.vsWC || (this.vsWC = new Map()), key = txt + '|' + Math.round(mw);
    let v = WC.get(key);
    if (v) return v;
    v = [txt];
    if (this.text(txt, '#ffffff', 13).w - 12 > mw) {   // (a sprite's width carries about 12 px of outline padding)
      let best = -1, bd = 1e9;
      for (let i = 0; i < txt.length; i++) if (txt[i] === ' ') { const d = Math.abs(i - txt.length / 2); if (d < bd) { bd = d; best = i; } }
      if (best > 0) v = [txt.slice(0, best), txt.slice(best + 1)];
    }
    if (WC.size > 32) WC.clear();
    WC.set(key, v); return v;
  }
  drawVs(dt) {
    const V = this.vs;
    if (!V) return;
    V.t += Math.min(dt, 0.05);
    const T = V.t, red = V.red, dur = red ? 0.6 : 0.85;
    if (T >= dur) { this.vs = null; return; }
    const c = this.ctx, m = c.getTransform(), W = VIEW_W, db = this.duelBox;
    c.setTransform(this.s, 0, 0, this.s, 0, 0);
    const Hb = 124, y0 = clamp(db && Number.isFinite(db.y1) ? db.y1 + 8 : this.hudB() + 12 * this.cssK, 0, Math.max(0, this.H - (this.padB || 0) - Hb - 8));
    // in: 0 -> 1.08 over 0.12 s (ease out), settling to 1 by 0.22; out: 0.6 -> 0.85 s, sliding off and fading
    let e = 1, out = 0, al = 1;
    if (red) al = Math.min(1, T / 0.08, (dur - T) / 0.08);
    else {
      e = T < 0.12 ? 1.08 * (1 - Math.pow(1 - T / 0.12, 3)) : T < 0.22 ? 1.08 - 0.08 * (T - 0.12) / 0.1 : 1;
      out = T > 0.6 ? Math.pow((T - 0.6) / 0.25, 2) : 0; al = 1 - out;
    }
    const kx = (e - 1) * 260 - out * 320, rx = -(e - 1) * 260 + out * 320, mid = W / 2, sl = 18;   // sl: the slash's half lean
    const ink = (path) => { c.lineJoin = 'round'; c.strokeStyle = HZ_INK; c.lineWidth = 3; c.stroke(); };
    // Kevin's panel (left): mint at 0.75
    c.globalAlpha = 0.75 * al; c.fillStyle = '#7dffb0';
    c.beginPath(); c.moveTo(-30 + kx, y0); c.lineTo(mid + sl - 4 + kx, y0); c.lineTo(mid - sl - 4 + kx, y0 + Hb); c.lineTo(-30 + kx, y0 + Hb); c.closePath(); c.fill();
    c.globalAlpha = al; ink();
    // the rival's panel (right): its colour at 0.75
    c.globalAlpha = 0.75 * al; c.fillStyle = V.col;
    c.beginPath(); c.moveTo(mid + sl + 4 + rx, y0); c.lineTo(W + 30 + rx, y0); c.lineTo(W + 30 + rx, y0 + Hb); c.lineTo(mid - sl + 4 + rx, y0 + Hb); c.closePath(); c.fill();
    c.globalAlpha = al; ink();
    // the clash: a white streak down the slash as the panels land
    if (!red && T > 0.1 && T < 0.34) {
      c.globalAlpha = al * (1 - (T - 0.1) / 0.24); c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(mid + sl, y0 - 6); c.lineTo(mid - sl, y0 + Hb + 6); c.stroke();
    }
    // the busts: a dark disc, then the head (Kevin looks right at the rival, the rival left at Kevin)
    const bust = (x, y, col, ob) => {
      c.globalAlpha = al * 0.35; c.fillStyle = HZ_INK; c.beginPath(); c.arc(x, y + 3, 26, 0, TAU); c.fill();
      c.globalAlpha = al; c.setTransform(this.s * 2, 0, 0, this.s * 2, x * this.s, y * this.s);
      this.head(c, col, 0, ob); c.setTransform(this.s, 0, 0, this.s, 0, 0);
    };
    const ko = this.vsKO || (this.vsKO = {}), rO = this.vsRO || (this.vsRO = {}), L = BOSS_LOOK[V.fn] || {};
    ko.acc = V.kAcc; ko.band = V.kBand; ko.ink = 1; ko.rim = '#ff5c8a'; ko.rimW = 1.1; ko.mouth = 'grit'; ko.brow = 'angry'; ko.look = 1; ko.lookY = 0;
    rO.acc = L.acc || []; rO.cap = L.cap; rO.band = L.band; rO.quiff = L.quiff ? 1 : 0; rO.ink = 1; rO.mouth = L.mouth === 'grin' ? 'grin' : 'smirk'; rO.brow = 'angry'; rO.look = -1; rO.lookY = 0;
    bust(36 + kx, y0 + 50, '#ffffff', ko);
    bust(W - 36 + rx, y0 + 50, V.col, rO);
    // the words, in a column between the bust and the slash (clear of the VS): first names 28 px (squeezed only when
    // a long name would not fit), epithets 13 px (on two lines when long), then the record and the rival's move pills
    const colL = 66, colR = mid - 36, cw = colR - colL;
    const put = (sp, x, y, mw) => { if (!sp) return; const k = Math.min(1, mw / sp.w); c.drawImage(sp.cv, x - sp.w * k / 2, y - sp.h * k / 2, sp.w * k, sp.h * k); };
    const lines = (txt, x, y, mw) => {
      const L2 = this.vsWrap(txt, mw);
      if (L2.length === 1) put(this.text(L2[0], '#ffffff', 13), x, y, mw);
      else { put(this.text(L2[0], '#ffffff', 13), x, y - 8, mw); put(this.text(L2[1], '#ffffff', 13), x, y + 8, mw); }
    };
    c.globalAlpha = al;
    const kc = (colL + colR) / 2 + kx, rc = W - (colL + colR) / 2 + rx;
    put(this.text(V.kName, '#ffffff', 28), kc, y0 + 30, cw);
    if (V.kEp) lines(V.kEp, kc, y0 + 62, cw);
    if (V.rec) put(this.text(V.rec, '#fff4c0', 13, 'label'), kc, y0 + 98, cw + 20);
    put(this.text(V.fn.toUpperCase(), '#ffffff', 28), rc, y0 + 30, cw);
    if (V.ep) lines(V.ep, rc, y0 + 62, cw);
    if (V.mv) put(this.text(V.mv, this.labelCol(V.col), 13, 'label'), rc, y0 + 98, cw + 20);
    // NEMESIS: a red ribbon across the rival panel's top corner
    if (V.nem) {
      const nx = W - 70 + rx, ny = y0 + 6;
      c.save(); c.translate(nx, ny); c.rotate(0.32);
      c.globalAlpha = al; c.fillStyle = '#ff2d55'; c.fillRect(-58, -9, 116, 18); c.strokeStyle = HZ_INK; c.lineWidth = 2; c.strokeRect(-58, -9, 116, 18);
      const ns = this.text('NEMESIS', '#ffffff', 13); c.drawImage(ns.cv, -ns.w / 2, -ns.h / 2, ns.w, ns.h);
      c.restore();
    }
    // opts.kicker ('CRASHING YOUR DRILL'): a gold strap under the panels, sliding in with the rival's side
    if (V.kick) {
      const ks = this.text(V.kick, '#ffd75c', 16, 'label'), kw = Math.min(W - 40, ks.w), kk = kw / ks.w;
      c.globalAlpha = al; c.drawImage(ks.cv, mid - kw / 2 + rx * 0.5, y0 + Hb + 6, kw, ks.h * kk);
    }
    // VS: white, popping in at 0.15 s (1.25x overshoot), steady on the static card
    const vk = red ? 1 : T < 0.15 ? 0 : Math.min(1, (T - 0.15) / 0.12);
    if (vk > 0) {
      const sc = red ? 1 : vk < 1 ? 1.25 * backOut(vk) / backOut(1) : 1 + 0.25 * Math.max(0, 1 - (T - 0.27) / 0.1), sp = this.text('VS', '#ffffff', 40);
      c.globalAlpha = al; setXf(c, c.getTransform(), mid, y0 + Hb / 2, red ? 0 : -0.12, sc, sc); c.drawImage(sp.cv, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    }
    c.globalAlpha = 1; c.setTransform(m);
  }
  // banked combo: DNA helices arc up to the HUD at the top left (screen space)
  // (to this.bankTarget, CSS-free logical screen units; main.js may move it onto the HUD's DNA counter)
  // ---------------------------------------------------------------- juice hooks for ui
  // every link Kevin lands: a ring of the last 6 (world x, y, race time and the kind's chip colour)
  pushLink(p, t) {
    const KL = p.kindLast; let kind = null, best = -1e9;
    if (KL) for (const k in KL) if (KL[k] > best) { best = KL[k]; kind = k; }
    const R = this.linkRing, i = this.linkRH % 6;
    const q = R[i] || (R[i] = { x: 0, y: 0, t: 0, col: '#ffd75c' });
    q.x = p.x; q.y = p.y; q.t = +t || 0; q.col = (kind && LINK_COL[kind]) || '#ffd75c';
    this.linkRH++;
  }
  // R.trickTrace(kinds?): a 6 px glowing polyline through the last 3 links in their chip colours (kinds: optional
  // link kinds, oldest first, to colour them by), node dots and 8 sparks at the last node. Draws on over 0.18 s, fades
  // over 0.6 s, in world space; while the TRICK STREAK is 2+ it starts from the previous tracer's end. Lite: no glow.
  // Reduced motion: drawn at once.
  trickTrace(kinds = null) {
    const n = Math.min(3, this.linkRH);
    if (n < 2) return;
    const pts = [], cols = [];
    for (let k = n; k >= 1; k--) {
      const q = this.linkRing[(this.linkRH - k) % 6], kk = Array.isArray(kinds) ? kinds[kinds.length - k] : null;
      pts.push(q.x, q.y); cols.push((kk && LINK_COL[kk]) || q.col);
    }
    const race = this.race, prev = this.tracers[this.tracers.length - 1];
    if (prev && race && race.p && (race.p.trickStreak | 0) >= 2) {
      const px = prev.pts[prev.pts.length - 2], py = prev.pts[prev.pts.length - 1];
      if (px !== pts[0] || py !== pts[1]) { pts.unshift(px, py); cols.unshift(prev.cols[prev.cols.length - 1]); }
    }
    if (this.tracers.length >= 4) this.tracers.shift();
    this.tracers.push({ pts, cols, t: 0, spark: false });
  }
  drawTracers(race, dt) {
    const T = this.tracers;
    if (!T || !T.length) return;
    const c = this.ctx, red = this.reduced, lite = this.lite, DRAW = 0.18, FADE = 0.6;
    let w = 0;
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const tr of T) {
      tr.t += dt;
      const draw = red ? 1 : clamp(tr.t / DRAW, 0, 1), fade = red ? clamp(tr.t / (DRAW + FADE), 0, 1) : clamp((tr.t - DRAW) / FADE, 0, 1);
      if (fade >= 1) continue;
      T[w++] = tr;
      const P = tr.pts, ns = P.length / 2 - 1, al = 1 - fade * fade;
      // the drawn length: segments by count, the last one partial
      const reach = draw * ns;
      for (let pass = lite ? 1 : 0; pass < 2; pass++) {
        for (let i = 0; i < ns && i < reach; i++) {
          const u = Math.min(1, reach - i), x0 = P[i * 2], y0 = this.sy(P[i * 2 + 1]), x1 = x0 + (P[i * 2 + 2] - x0) * u, y1 = y0 + (this.sy(P[i * 2 + 3]) - y0) * u;
          c.strokeStyle = tr.cols[i + 1];
          if (pass === 0) { c.globalAlpha = al * 0.3; c.lineWidth = 14; } else { c.globalAlpha = al; c.lineWidth = 6; }
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
        }
      }
      // node dots: the ones the line has reached
      c.globalAlpha = al;
      for (let i = 0; i <= ns && i <= reach + 1e-6; i++) {
        const x = P[i * 2], y = this.sy(P[i * 2 + 1]);
        c.fillStyle = HZ_INK; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill();
        c.fillStyle = tr.cols[i]; c.beginPath(); c.arc(x, y, 3.6, 0, TAU); c.fill();
      }
      if (draw >= 1 && !tr.spark) {   // 8 sparks off the last node
        tr.spark = true;
        const lx = P[ns * 2], ly = P[ns * 2 + 1], col = tr.cols[ns];
        if (!red) for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.random() * 0.4, v = 110 + Math.random() * 60; this.addP(1, lx, ly, Math.cos(a) * v, Math.sin(a) * v, 0.35, col, 2.2); }
      }
    }
    T.length = w;
    c.globalAlpha = 1;
  }
  // R.collect(x, y, col, tx, ty, n, onLand): n motes pop out of world (x, y) at 120 px/s, then home on the logical
  // screen point (tx, ty) (the same convention as bankTarget) with an ease-in over 0.35 s; onLand() runs once the
  // last one lands. Kevin gulps on the pickup frame. Reduced motion: they fade in place and onLand runs at once.
  collect(x, y, col = '#ffd75c', tx = 26, ty = 24, n = 3, onLand = null) {
    n = clamp(Math.round(+n || 1), 1, 16);
    this.sqV -= 4;
    const sx = +x || 0, sy = this.camY == null ? this.H * 0.7 : this.sy(+y || 0), grp = { left: n, cb: typeof onLand === 'function' ? onLand : null };
    const red = this.reduced;
    if (this.motes.length > 48) this.motes.splice(0, this.motes.length - 48);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7 + (Math.random() - 0.5) * 0.4;
      this.motes.push({ x: sx, y: sy, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, t: -i * 0.03, ox: 0, oy: 0, col: String(col || '#ffd75c'), tx: +tx, ty: +ty, grp, red });
    }
    if (red) { const cb = grp.cb; grp.cb = null; grp.left = 0; if (cb) { try { cb(); } catch (e) { /* the hook is optional */ } } }
  }
  drawMotes(dt) {
    const M = this.motes;
    if (!M || !M.length) return;
    const c = this.ctx, POP = 0.14, HOME = 0.35;
    let w = 0;
    for (const m of M) {
      m.t += dt;
      if (m.t < 0) { M[w++] = m; continue; }
      let x, y, al = 1, sc = 1;
      if (m.red) {
        const k = m.t / 0.3; if (k >= 1) continue;
        x = m.x; y = m.y; al = 1 - k;
      } else if (m.t < POP) {
        const u = m.t; x = m.x + m.vx * u * (1 - u / (2 * POP) * 0.5); y = m.y + m.vy * u * (1 - u / (2 * POP) * 0.5);
        m.ox = x; m.oy = y; sc = backOut(Math.min(1, m.t / POP));
      } else {
        const k = (m.t - POP) / HOME;
        if (k >= 1) {   // landed
          const tx = Number.isFinite(m.tx) ? m.tx : 26, ty = Number.isFinite(m.ty) ? m.ty : 24;
          this.addP(1, tx, this.camY == null ? 0 : this.camY + this.H - ty, 0, -30, 0.2, m.col, 2.4);
          if (--m.grp.left === 0 && m.grp.cb) { const cb = m.grp.cb; m.grp.cb = null; try { cb(); } catch (e) { /* the hook is optional */ } }
          continue;
        }
        const e = k * k * k, tx = Number.isFinite(m.tx) ? m.tx : 26, ty = Number.isFinite(m.ty) ? m.ty : 24;
        x = m.ox + (tx - m.ox) * e; y = m.oy + (ty - m.oy) * e; sc = 1 - 0.35 * e;
      }
      M[w++] = m;
      c.globalAlpha = al * 0.55; c.drawImage(this.glow(m.col), x - 10 * sc, y - 10 * sc, 20 * sc, 20 * sc);
      c.globalAlpha = al; c.fillStyle = m.col; c.beginPath(); c.arc(x, y, 3.4 * sc, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x - 1 * sc, y - 1 * sc, 1.2 * sc, 0, TAU); c.fill();
    }
    M.length = w;
    c.globalAlpha = 1;
  }
  drawBanks(dt) {
    if (!this.banks.length) return;
    const bt = this.bankTarget || {}, c = this.ctx, spr = this.helixSpr(), tx = Number.isFinite(bt.x) ? bt.x : 26, ty = Number.isFinite(bt.y) ? bt.y : 24;
    let n = 0;
    for (const b of this.banks) {
      b.t += dt;
      const k = (b.t - b.delay) / b.life;
      if (k >= 1) { this.bankLand(b, tx, ty); continue; }
      this.banks[n++] = b;
      if (k < 0) continue;
      const u = k * k * (3 - 2 * k), v = 1 - u;
      const x = v * v * b.x0 + 2 * v * u * b.cx + u * u * tx, y = v * v * b.y0 + 2 * v * u * b.cy + u * u * ty;
      const sc = (k < 0.15 ? backOut(k / 0.15) : 1) * (1 - 0.5 * u);
      c.save(); c.translate(x, y); c.rotate(b.spin + b.t * 6); c.scale(sc, sc);
      c.globalAlpha = 0.5; c.drawImage(this.glow('#ff5cd2'), -14, -14, 28, 28); c.globalAlpha = 1;
      c.drawImage(spr, -8, -12, 16, 24); c.restore();
    }
    this.banks.length = n;
  }

  // a helix lands on the counter: a little pink spark and ring, the hook (ui: sfx('dnaTick', {i, n})), a tiny punch on the last
  bankLand(b, tx, ty) {
    const wy = this.camY == null ? 0 : this.camY + this.H - ty;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.random() * 0.5; this.addP(1, tx, wy, Math.cos(a) * 90, Math.sin(a) * 90, 0.25, '#ff8be0', 2.2); }
    this.ring(tx, wy, '#ff8be0', 14, 0.25, 2.5);
    if (typeof this.onBankLand === 'function') { try { this.onBankLand(b.i, b.n); } catch (e) { /* the hook is optional */ } }
    if (b.i === b.n - 1) this.zoomPunch(0.015);
  }

  // the baby's portrait baked once per baby (the faint silhouette inside the egg at the end of a win)
  babySpr(baby) {
    if (this.babyS && this.babyK === baby) return this.babyS;
    const cv = mk(128, 128); this.babyPortrait(cv.getContext('2d'), baby, 128);
    this.babyK = baby; return (this.babyS = cv);
  }

  // ---------------------------------------------------------------- the birth
  // R.birth(baby, opts, done): the birth beat over the frozen egg, 2.5 s (4 s with opts.first, which adds a
  // time-lapse: baby, kid in a tiny cap, grown-up flying a Kevin-shaped kite). opts.words overrides the first
  // words (else content's BABY_FIRST_WORDS, picked like the ui does). done() is called exactly once: at the end,
  // or 0.4 s after R.birthSkip(). The final frame stays up until R.birthEnd() or the next run.
  birth(baby, opts, done) {
    if (!baby) { if (typeof done === 'function') { try { done(); } catch (e) { /* ui hook */ } } return; }
    const first = !!(opts && opts.first), FW = Array.isArray(K.BABY_FIRST_WORDS) ? K.BABY_FIRST_WORDS : [];
    const words = opts && typeof opts.words === 'string' ? opts.words : FW.length ? FW[((baby.run | 0) * 7) % FW.length] : '';
    this.birthS = { baby, first, words: String(words || ''), dur: first ? 4 : 2.5, t: 0, done: typeof done === 'function' ? done : null, called: false, skipAt: null, flashed: false, lines: null,
      red: !!(opts && opts.reduced) || !!this.reduced, calm: !!(opts && opts.reduced) || !!this.reduced || !!this.noFlash };
    // (reduced: no white flash and no shake, only the scale and the fade; no flashes alone also skips the flash)
    if (this.birthS.red) { this._trauma = 0; this.kvx = 0; this.kvy = 0; }
    this.birthSwell = 0;
  }
  birthSkip() {
    const b = this.birthS;
    if (!b) return;
    b.t = Math.max(b.t, b.dur); b.flashed = true; this.birthSwell = 1;
    if (b.skipAt == null && !b.called) b.skipAt = this.time;
  }
  birthEnd() { this.birthS = null; this.birthSwell = 0; }
  // a portrait canvas for the birth at size logical px (baked at the canvas pixel scale), per baby and age stage
  birthFace(baby, stage, size) {
    const px = Math.min(480, Math.max(64, Math.round(size * (this.s || 1)))), key = stage + '|' + px;
    if (!this.bfaces || this.bfK !== baby) { this.bfK = baby; this.bfaces = new Map(); }
    const m = this.bfaces;
    let cv = m.get(key);
    if (!cv) { cv = mk(px, px); this.babyPortrait(cv.getContext('2d'), baby, px, stage); m.set(key, cv); }
    return cv;
  }
  drawBirth(dt) {
    const b = this.birthS, c = this.ctx, red = this.reduced || b.red, T = this.time;
    b.t += dt;
    if (b.red && this._trauma > 0.08) this._trauma = 0.08;   // (no big shake under reduced motion, whoever asks for one)
    if (!b.called && ((b.skipAt == null && b.t >= b.dur) || (b.skipAt != null && T - b.skipAt >= 0.4))) {
      b.called = true;
      if (b.done) { try { b.done(); } catch (e) { /* the ui hook is optional */ } }
    }
    const t = Math.min(b.t, b.dur), baby = b.baby, hue = Number.isFinite(baby.hue) ? baby.hue : 330;
    // where the egg is on screen (through this frame's camera, zoom included)
    const M = this.worldM, s = this.s || 1, wx = centre(RACE_LEN), wy = this.sy(RACE_LEN + 120);
    let ex = VIEW_W / 2, ey = this.H * 0.45, ek = 1;
    if (M) { ex = (M.a * wx + M.c * wy + M.e) / s; ey = (M.b * wx + M.d * wy + M.f) / s; ek = hyp(M.a, M.b) / s; }
    ex = clamp(ex, 90, VIEW_W - 90); ey = clamp(ey, 150, this.H - 260);
    // 0 to 0.6 s: she swells and glows (drawEgg reads birthSwell)
    const sw = clamp(t / 0.6, 0, 1); this.birthSwell = sw * sw * (3 - 2 * sw);
    c.globalAlpha = 0.4 * clamp(t / 0.4, 0, 1); c.fillStyle = '#14000f'; c.fillRect(-20, -20, VIEW_W + 40, this.H + 40); c.globalAlpha = 1;
    this.dglow('#fff3c0', ex, ey, 150 * ek * (1.4 + 0.5 * this.birthSwell), 0.55 * this.birthSwell);
    // 0.6 s: a soft white flash (through the flash limiter, at most 0.4), then a burst of hearts in the baby's hue
    if (t >= 0.6 && !b.flashed) { b.flashed = true; if (!b.calm) { this.lastFlashT = -9; this.flash = 0.4; this.flashCol = '#ffffff'; } }
    if (t >= 0.6) {
      const k = clamp((t - 0.6) / 1.1, 0, 1), e = red ? 0.6 : 1 - (1 - k) * (1 - k);
      if (k < 1) {
        c.globalAlpha = 1 - k; c.fillStyle = `hsl(${hue},90%,72%)`;
        for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.3, R = 50 + (180 + 40 * h1(i)) * e; heart(c, ex + Math.cos(a) * R, ey + Math.sin(a) * R * 0.85 - 30 * e, 6 + 4 * h1(i + 3)); }
        c.globalAlpha = 1;
      }
    }
    // 0.75 s: the baby's face pops out to 160 px (0.3, 1.15, 1.0 over 400 ms)
    if (t >= 0.75) {
      // (reduced: a gentle 0.85 to 1 ease and a fade in, no overshoot)
      const k = clamp((t - 0.75) / 0.4, 0, 1), sc = red ? 0.85 + 0.15 * k * (2 - k) : k < 0.6 ? 0.3 + 0.85 * (k / 0.6) : 1.15 - 0.15 * ((k - 0.6) / 0.4);
      const D = 160 * sc, fy = ey - 20;
      this.dglow('#fff3c0', ex, fy, D * 0.85, 0.6 * (red ? k : 1));
      if (red) c.globalAlpha = k;
      c.drawImage(this.birthFace(baby, 0, 160), ex - D / 2, fy - D / 2, D, D); c.globalAlpha = 1;
      // 1.2 s: the name
      if (t >= 1.2 && baby.name) {
        const nk = clamp((t - 1.2) / 0.25, 0, 1), ns = red ? 1 : Math.max(0.05, backOut(nk)), sp = this.text(String(baby.name), '#ffd75c', this.fpx(26), 'popP');
        const m = c.getTransform(); c.translate(ex, fy + 104); c.scale(ns, ns); c.drawImage(sp.cv, -sp.w / 2, -sp.h / 2, sp.w, sp.h); c.setTransform(m);
      }
      // 1.6 s: the first words, in a speech bubble off the baby's mouth
      if (t >= 1.6 && b.words) {
        const wk = clamp((t - 1.6) / 0.25, 0, 1), ws = red ? 1 : Math.max(0.05, backOut(wk)), fs = this.fpx(15);
        c.font = `800 ${fs}px ${FONT}`;
        if (!b.lines || b.fs !== fs) {
          b.fs = fs; b.lines = []; let line = '';
          for (const w of ('"' + b.words + '"').split(' ')) { const tl = line ? line + ' ' + w : w; if (line && c.measureText(tl).width > 190) { b.lines.push(line); line = w; } else line = tl; }
          if (line) b.lines.push(line);
          b.bw = Math.min(214, Math.max(...b.lines.map((l) => c.measureText(l).width)) + 22);
        }
        const lh = fs + 3, bh = b.lines.length * lh + 14, bx = clamp(ex + 40, b.bw / 2 + 6, VIEW_W - b.bw / 2 - 6), by = Math.max(this.hudB() + 8, fy - 80 - bh);
        const m = c.getTransform(); c.translate(ex + 20, fy - 50); c.scale(ws, ws); c.translate(-(ex + 20), -(fy - 50));
        c.fillStyle = 'rgba(30,0,30,0.3)'; this.rrect(bx - b.bw / 2 + 2, by + 3, b.bw, bh, 12); c.fill();
        c.fillStyle = '#ffffff'; this.rrect(bx - b.bw / 2, by, b.bw, bh, 12); c.fill();
        c.beginPath(); c.moveTo(clamp(ex + 4, bx - b.bw / 2 + 12, bx + b.bw / 2 - 24), by + bh - 1); c.lineTo(ex + 14, fy - 40); c.lineTo(clamp(ex + 4, bx - b.bw / 2 + 12, bx + b.bw / 2 - 24) + 14, by + bh - 1); c.fill();
        c.fillStyle = '#2a0a24'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let i = 0; i < b.lines.length; i++) c.fillText(b.lines[i], bx, by + 7 + lh / 2 + i * lh);
        c.setTransform(m);
      }
      // the very first baby: a time-lapse, three frames popping in from 2.4 s
      if (b.first && t >= 2.4) {
        const P = 84, gap = 12, y0 = Math.min(fy + 140, this.H - (this.padB || 0) - P - 30), CAP = ['DAY ONE', 'AGE 7', 'AGE 30'];
        for (let i = 0; i < 3; i++) {
          const k = clamp((t - 2.4 - i * 0.4) / 0.3, 0, 1);
          if (k <= 0) continue;
          const sc = red ? 1 : Math.max(0.05, backOut(k)), cx = VIEW_W / 2 + (i - 1) * (P + gap), cy = y0 + P / 2;
          const m = c.getTransform(); c.translate(cx, cy); c.scale(sc, sc); c.rotate((i - 1) * 0.05);
          c.fillStyle = 'rgba(30,0,30,0.35)'; this.rrect(-P / 2 + 2, -P / 2 + 3, P, P + 20, 10); c.fill();
          c.fillStyle = '#fff4f8'; this.rrect(-P / 2, -P / 2, P, P + 20, 10); c.fill();
          c.drawImage(this.birthFace(baby, i, P - 10), -P / 2 + 5, -P / 2 + 5, P - 10, P - 10);
          const cp = this.text(CAP[i], '#ff3d6e', 13);
          c.drawImage(cp.cv, -cp.w / 2, P / 2 + 10 - cp.h / 2 - 4, cp.w, cp.h);
          c.setTransform(m);
        }
      }
    }
  }

  // ---------------------------------------------------------------- title hero
  // R.titleHero(on, cv): a big idle Kevin (2.5x race scale) with his '#1,000,000' race bib and a bouncing sweat drop.
  // With a canvas element cv (one the ui puts above #logo) he is drawn into it, filling it; without one he is drawn
  // on the game canvas just above #logo (only visible when the title overlay lets the game show through).
  titleHero(on, cv) {
    this.heroOn = !!on;
    if (cv && cv.getContext) this.heroCv = cv;
    if (!on && this.heroCv) { const g = this.heroCv.getContext('2d'); if (g) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.heroCv.width, this.heroCv.height); } }
  }
  drawHero() {
    if (!this.heroOn) return;
    const keep = this.ctx, hc = this.heroCv;
    let cx, cy, k = 1;
    if (hc) {
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1), w = hc.clientWidth || hc.width, h = hc.clientHeight || hc.height;
      if (hc.width !== Math.round(w * dpr) || hc.height !== Math.round(h * dpr)) { hc.width = Math.round(w * dpr); hc.height = Math.round(h * dpr); }
      const g = hc.getContext('2d'); if (!g) return;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, hc.width, hc.height);
      k = Math.min(w / 110, h / 215) * dpr; g.setTransform(k, 0, 0, k, hc.width / 2, hc.height * 0.25);   // Kevin spans about 110 x 215 units
      this.ctx = g; cx = 0; cy = 0;
    } else {
      if (!this.heroY || this.frame % 30 === 1) {   // above the logo, measured now and then
        const lg = typeof document !== 'undefined' && document.getElementById('logo');
        if (lg && this.cv.getBoundingClientRect) {
          const r = lg.getBoundingClientRect(), cr = this.cv.getBoundingClientRect(), K = this.cssK || 1;
          this.heroX = ((r.left + r.right) / 2 - cr.left) * K; this.heroY = Math.max(70, (r.top - cr.top) * K - 58);
        } else { this.heroX = VIEW_W / 2; this.heroY = this.H * 0.2; }
      }
      cx = this.heroX; cy = this.heroY;
      this.ctx.setTransform(this.s, 0, 0, this.s, 0, 0);
    }
    try { this.paintHero(cx, cy); } finally { this.ctx = keep; }
  }
  paintHero(x, y) {
    const c = this.ctx, t = this.time, red = this.reduced, sc = KEVIN_SC * 2.5;
    const bob = red ? 0 : Math.sin(t * 2.2) * 3, ph = red ? 0 : t * 9;
    this.dglow('#ff8fc8', x, y + 6 + bob, 60, 0.35);
    const o = this.heroO || (this.heroO = {});
    o.taper = 1; o.amp = 6; o.band = '#ff3d6e'; o.acc = []; o.yaw = 1; o.ink = 1; o.stretch = 1 + (red ? 0 : 0.04 * Math.max(0, Math.sin(ph)));
    // the race's Kevin: his pink tail (KEV_TAIL, a '#ff5c8a' tip), 4.9 wide, 1.15 long
    o.tail = KEV_TAIL; o.tipCol = '#ff5c8a'; o.tw = 4.9; o.tlen = 1.15;
    // and the race's living blink (a 2 to 5.5 s wait, now and then a double), on the hero's own clock
    const hdt = clamp(t - (this.heroT == null ? t : this.heroT), 0, 0.1); this.heroT = t;
    const bl = blinkLid(this.heroBk || (this.heroBk = {}), hdt);
    o.mouth = 'grin'; o.blush = 1; o.look = red ? 0 : Math.sin(t * 0.7) * 0.8; o.blink = bl >= 0.95; o.lid = bl < 0.95 ? bl : 0; o.curl = red ? 0 : Math.sin(t * 1.3) * 0.15;
    this.drawSwimmer(x, y + bob, red ? 0 : Math.sin(t * 1.1) * 0.08, sc, '#ffffff', ph, o);
    // the bib, pinned to his forehead
    const m = c.getTransform();
    setXf(c, m, x, y + bob, red ? 0 : Math.sin(t * 1.1) * 0.08, sc, sc);
    c.save(); c.translate(0, -8.6); c.rotate(-0.06);
    c.fillStyle = 'rgba(40,0,40,0.25)'; this.rrect(-9.2, -2.6, 18.4, 5.6, 1.3); c.fill();
    c.fillStyle = '#ffffff'; this.rrect(-9.4, -3, 18.4, 5.6, 1.3); c.fill();
    c.strokeStyle = '#ff3d6e'; c.lineWidth = 0.5; c.stroke();
    c.fillStyle = '#9a9aa8'; c.beginPath(); c.arc(-8.2, -1.9, 0.4, 0, TAU); c.arc(8, -1.9, 0.4, 0, TAU); c.fill();
    c.fillStyle = '#2a0a24'; c.font = `900 2.9px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('#1,000,000', -0.2, 0);
    c.restore();
    // a nervous little sweat drop, bouncing
    const dy = red ? 0 : -Math.abs(Math.sin(t * 4)) * 2.2;
    c.fillStyle = '#9ae2ff'; c.beginPath(); c.moveTo(9.4, -6.2 + dy); c.quadraticCurveTo(11.4, -3 + dy, 9.4, -1.8 + dy); c.quadraticCurveTo(7.4, -3 + dy, 9.4, -6.2 + dy); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(8.9, -3.6 + dy, 0.6, 0.9);
    c.setTransform(m);
  }

  // ---------------------------------------------------------------- album
  // a baby's portrait for the album: hue from baby.hue, Dad's best mutation as a hat or specs, a star per generation
  // stage (the birth's time-lapse): 0 baby, 1 kid in a tiny cap, 2 grown-up with specs and a Kevin-shaped kite
  babyPortrait(ctx, baby, size = 64, stage = 0) {
    const b = baby || {}, hue = Number.isFinite(b.hue) ? b.hue : 330, s = size / 64;
    ctx.save(); ctx.scale(s, s);
    const g = ctx.createRadialGradient(26, 22, 4, 32, 32, 32);
    g.addColorStop(0, `hsl(${hue},85%,78%)`); g.addColorStop(1, `hsl(${hue},70%,52%)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 31, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    // inherited look
    let ids = [];
    if (Array.isArray(b.top)) ids = b.top; else if (Array.isArray(b.muts)) ids = b.muts;
    else if (b.muts && typeof b.muts === 'object') ids = Object.keys(b.muts).filter((k) => b.muts[k] > 0).sort((x, y) => b.muts[y] - b.muts[x]);
    let acc = ids.map((id) => MUT_ACC[id]).filter(Boolean).slice(0, 2);
    if (!acc.length) { let hsh = 0; for (const ch of String(b.name || '')) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0; acc = FACE_ACC_ALBUM[Math.abs(hsh) % FACE_ACC_ALBUM.length]; }
    if (stage === 1) acc = acc.filter((a) => a !== 'cap' && a !== 'crown').concat('cap');
    if (stage === 2) acc = acc.filter((a) => a !== 'glasses' && a !== 'shades').concat('glasses');
    if (stage === 2) {   // a Kevin-shaped kite on a string, up in the corner
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(40, 52); ctx.quadraticCurveTo(54, 36, 50, 18); ctx.stroke();
      ctx.save(); ctx.translate(50, 13); ctx.rotate(0.5);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(3, 8, 0, 11); ctx.quadraticCurveTo(-3, 14, 0, 17); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 4.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff3d6e'; ctx.fillRect(-3.4, -2.6, 6.8, 1.2);
      ctx.fillStyle = '#1a0a1a'; ctx.fillRect(-1.6, -0.8, 0.9, 1.2); ctx.fillRect(0.7, -0.8, 0.9, 1.2);
      ctx.restore();
    }
    const hs = stage === 1 ? 1.9 : stage === 2 ? 1.75 : 2.1, hy = stage === 0 ? 37 : 33;
    if (stage) {   // shoulders under the bigger kid's and the grown-up's head
      ctx.fillStyle = `hsl(${(hue + 180) % 360},60%,${stage === 1 ? 62 : 45}%)`;
      ctx.beginPath(); ctx.ellipse(32, 63, stage === 1 ? 15 : 19, 13, 0, Math.PI, TAU); ctx.fill();
    }
    ctx.save(); ctx.translate(32, hy); ctx.scale(hs, hs);
    ctx.fillStyle = `hsl(${(hue + 40) % 360},40%,30%)`; ctx.beginPath(); ctx.moveTo(-1, -9); ctx.quadraticCurveTo(3, -14, 2, -10); ctx.quadraticCurveTo(5, -12, 3.5, -8.5); ctx.fill();
    this.head(ctx, '#ffe3cf', 0, { round: 1, acc, cap: `hsl(${(hue + 180) % 360},80%,60%)`, happy: 1, blush: 1, mouth: 'grin' });
    ctx.restore();
    const gen = Math.max(1, Math.min(5, Math.floor(b.gen || 1)));
    ctx.fillStyle = '#ffd75c'; ctx.strokeStyle = '#7a4a12'; ctx.lineWidth = 0.8;
    for (let i = 0; i < gen; i++) star4(ctx, 32 + (i - (gen - 1) / 2) * 9, 7, 4);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- small helpers
const BX = new Float32Array(64), BY = new Float32Array(64), BR = new Float32Array(64);
// the close-crowd pick: candidates sorted by their squared distance to Kevin (A.nd, in the renderer's aux store)
let SORT_AX = null;
const byND = (a, b) => SORT_AX.get(a).nd - SORT_AX.get(b).nd;
const farS = (dy) => 1 - 0.2 * clamp((dy - 190) / 300, 0, 1);   // a far crowd head's scale at distance dy
const A_cf = (AX, a) => { const A = AX.get(a); return A ? A.cf : 0; };
const WBC_NOW = [];   // the Big Macs drawEnts drew this frame (reused)
// a closed, smooth outline through the points in BX/BY (quadratic curves via midpoints)
function smoothBlob(c, n) {
  c.beginPath(); c.moveTo((BX[n - 1] + BX[0]) / 2, (BY[n - 1] + BY[0]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[j]) / 2, (BY[i] + BY[j]) / 2); }
  c.closePath();
}
// a polyline of the first n numbers of P (x, y pairs) into the current path
function addPts(c, P, n, dx = 0) {
  c.moveTo(P[0] + dx, P[1]);
  for (let i = 2; i < n; i += 2) c.lineTo(P[i] + dx, P[i + 1]);
}
function star4(c, x, y, r) {
  c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill();
}
// star4 without beginPath/fill, so many sparkles share one fill
function star4p(c, x, y, r) {
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r);
}
function heart(c, x, y, r) {
  c.beginPath(); c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.1, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9); c.fill();
}
// heart without beginPath/fill (batched)
function heartP(c, x, y, r) {
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.1, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9); c.closePath();
}
function backOut(k) { const s = 2.2; k -= 1; return k * k * ((s + 1) * k + s) + 1; }

// One backdrop tile per zone, painted once: the flesh outside the tube, seen at parallax.
// Painted in three stages so a prewarm can spread the bake over three frames (0 lumps, 1 detail, 2 speckle);
// stage null paints all three. rnd carries the seed between stages, so a staged bake matches a one-shot bake.
// Everything wraps both ways (ox in [-W, 0, W], oy in [-H, 0, H]), so the tile repeats with no seams.
function paintTile(g, z, zi, st = null, rnd = seeded(9001 + zi * 77)) {
  const W = TW, H = TH;
  const zc = zcol(z), c0 = rgb(zc[0]), c1 = rgb(zc[1]), wl = rgb(z.wall);
  // fn(ox, oy) for every copy whose box (x +- r, y +- r) touches the tile
  const wrap = (x, y, r, fn) => {
    for (const oy of [-H, 0, H]) {
      if (y + oy + r < 0 || y + oy - r > H) continue;
      for (const ox of [-W, 0, W]) { if (x + ox + r < 0 || x + ox - r > W) continue; fn(ox, oy); }
    }
  };
  if (st === null || st === 0) {
    g.fillStyle = css(c0); g.fillRect(0, 0, W, H);
    // soft lumps of tissue
    for (let i = 0; i < 16; i++) {
      const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 90, al = 0.25 + rnd() * 0.3;
      wrap(x, y, r, (ox, o) => { const gr = g.createRadialGradient(x + ox, y + o, 0, x + ox, y + o, r); gr.addColorStop(0, css(c1, al)); gr.addColorStop(1, css(c1, 0)); g.fillStyle = gr; g.fillRect(x + ox - r, y + o - r, r * 2, r * 2); });
    }
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (st === null || st === 1) {
    if (z.id === 'launch') {      // veins, and thin capillaries forking off them
      const all = [];
      for (let v = 0; v < 7; v++) {
        let x = rnd() * W, y = rnd() * H, a = rnd() * TAU, w = 5 + rnd() * 3;
        const pts = [[x, y, w]];
        for (let s = 0; s < 16 && w > 0.8; s++) { a += (rnd() - 0.5) * 0.8; x += Math.cos(a) * 24; y += Math.sin(a) * 24; w *= 0.88; pts.push([x, y, w]); }
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
        wrap((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2 + 10, (ox, o) => {
          for (let i = 1; i < pts.length; i++) {
            g.strokeStyle = 'rgba(110,8,45,0.75)'; g.lineWidth = pts[i][2] + 2; g.beginPath(); g.moveTo(pts[i - 1][0] + ox, pts[i - 1][1] + o); g.lineTo(pts[i][0] + ox, pts[i][1] + o); g.stroke();
            g.strokeStyle = 'rgba(255,120,170,0.5)'; g.lineWidth = Math.max(0.6, pts[i][2] * 0.35); g.beginPath(); g.moveTo(pts[i - 1][0] + ox - 1, pts[i - 1][1] + o - 1); g.lineTo(pts[i][0] + ox - 1, pts[i][1] + o - 1); g.stroke();
          }
        });
        for (const q of pts) all.push(q);
      }
      // one million racers: 40 to 60 tiny distant swimmers (a 3 x 4 head and a 10 px wavy tail, all pointing up)
      // in loose diagonal streams, baked in so the opening sells the crowd at no per-frame cost
      {
        const ns = 5, per = 8 + Math.floor(rnd() * 4);
        g.fillStyle = 'rgba(255,170,210,0.14)'; g.strokeStyle = 'rgba(255,170,210,0.14)'; g.lineWidth = 1;
        for (let k = 0; k < ns; k++) {
          const sx0 = rnd() * W, sy0 = rnd() * H, dir = (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.4);
          for (let j = 0; j < per; j++) {
            const x = sx0 + j * 22 * dir + (rnd() - 0.5) * 18, y = sy0 - j * 26 + (rnd() - 0.5) * 14, ph = rnd() * TAU;
            wrap(x, y + 6, 14, (ox, o) => {
              g.beginPath(); g.ellipse(x + ox, y + o, 1.5, 2, 0, 0, TAU); g.fill();
              g.beginPath(); g.moveTo(x + ox, y + o + 2);
              for (let u = 1; u <= 4; u++) g.lineTo(x + ox + Math.sin(ph + u * 1.6) * 1.4 * (u / 4), y + o + 2 + u * 2.5);
              g.stroke();
            });
          }
        }
      }
      for (let f = 0; f < 10; f++) {
        const q = all[Math.floor(rnd() * all.length)], s = rnd() < 0.5 ? -1 : 1;
        let x = q[0], y = q[1], a = rnd() * TAU + s * 0.9;
        const P = [[x, y]];
        for (let k = 0; k < 4; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 11; y += Math.sin(a) * 11; P.push([x, y]); }
        wrap(q[0], q[1], 52, (ox, o) => {
          g.strokeStyle = 'rgba(110,8,45,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(P[0][0] + ox, P[0][1] + o);
          for (let k = 1; k < P.length; k++) g.lineTo(P[k][0] + ox, P[k][1] + o);
          g.stroke();
        });
      }
    } else if (z.id === 'acid') {
      // 3 or 4 ghost swimmers: dashed outlines with x x eyes, the ones who did not make it (a sad joke, baked in)
      const ng = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < ng; i++) {
        const x = rnd() * W, y = rnd() * H, a = (rnd() - 0.5) * 0.9, k = 1.5 + rnd() * 0.6;
        wrap(x, y + 12 * k, 34 * k, (ox, o) => {
          g.save(); g.translate(x + ox, y + o); g.rotate(a); g.scale(k, k);
          g.setLineDash(LD_2p4_2); g.strokeStyle = 'rgba(220,255,170,0.42)'; g.lineWidth = 1.1;
          g.beginPath(); g.ellipse(0, 0, 7.5, 10, 0, 0, TAU); g.stroke();
          g.beginPath(); g.moveTo(0, 10); g.quadraticCurveTo(4, 16, -1, 22); g.quadraticCurveTo(-5, 27, 1, 31); g.stroke();
          g.setLineDash(NODASH); g.lineWidth = 1.2; g.beginPath();
          for (let sx = -1; sx <= 1; sx += 2) { const ex = sx * 3.2, ey = -2.5; g.moveTo(ex - 1.5, ey - 1.5); g.lineTo(ex + 1.5, ey + 1.5); g.moveTo(ex + 1.5, ey - 1.5); g.lineTo(ex - 1.5, ey + 1.5); }
          g.stroke(); g.restore();
        });
      }
      for (let i = 0; i < 16; i++) { const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 9; wrap(x, y, r + 2, (ox, o) => { g.strokeStyle = 'rgba(182,255,92,0.22)'; g.lineWidth = 1.3; g.beginPath(); g.arc(x + ox, y + o, r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(220,255,170,0.25)'; g.beginPath(); g.arc(x + ox - r * 0.35, y + o - r * 0.35, r * 0.25, 0, TAU); g.fill(); }); }
    } else if (z.id === 'goo') {
      // 12 to 18 soft goo blobs (r 10 to 46, 0.18 to 0.3) with a lilac shadow to the lower right; the 5 biggest
      // carry the wet specular crescent (gooShine)
      const nb = 12 + Math.floor(rnd() * 7), B = [], bl = css(lerpC(c1, WHITE, 0.35));
      for (let i = 0; i < nb; i++) B.push([rnd() * W, rnd() * H, 10 + rnd() * 36, 0.18 + rnd() * 0.12]);
      const big = B.slice().sort((p, q) => q[2] - p[2]).slice(0, 5);
      for (const b of B) {
        const [x, y, r, al] = b;
        wrap(x, y, r * 1.3, (ox, o) => {
          g.globalAlpha = al; g.fillStyle = GOO_SHADOW; g.beginPath(); g.ellipse(x + ox + r * 0.16, y + o + r * 0.2, r, r * 0.92, 0, 0, TAU); g.fill();
          g.fillStyle = bl; g.beginPath(); g.ellipse(x + ox, y + o, r, r * 0.92, 0, 0, TAU); g.fill();
          if (big.includes(b)) { g.globalAlpha = Math.min(1, al * 2.6); gooShine(g, x + ox, y + o, r); }
          g.globalAlpha = 1;
        });
      }
      for (let i = 0; i < 14; i++) {
        const x = rnd() * W, y = rnd() * H, L = 60 + rnd() * 140, w = 1.5 + rnd() * 3;
        wrap(x, y + L / 2, L / 2 + 20, (ox, o) => { g.strokeStyle = 'rgba(232,238,255,0.34)'; g.lineWidth = w; g.beginPath(); g.moveTo(x + ox, y + o); g.bezierCurveTo(x + ox + 14, y + o + L * 0.3, x + ox - 14, y + o + L * 0.7, x + ox + 4, y + o + L); g.stroke(); g.fillStyle = 'rgba(240,244,255,0.32)'; g.beginPath(); g.arc(x + ox + 4, y + o + L + 3, w + 1.5, 0, TAU); g.fill(); });
      }
    } else if (z.id === 'sea') {
      // 3 or 4 dark rugae arcs: the folds of the womb wall seen through the fluid
      const nr = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < nr; i++) {
        const x = rnd() * W, y = rnd() * H, r = 110 + rnd() * 120, a0 = rnd() * TAU, sw = 0.9 + rnd() * 1.1, lw = 10 + rnd() * 8;
        wrap(x, y, r + lw, (ox, o) => {
          g.strokeStyle = 'rgba(58,6,16,0.32)'; g.lineWidth = lw; g.beginPath(); g.arc(x + ox, y + o, r, a0, a0 + sw); g.stroke();
          g.strokeStyle = 'rgba(255,150,150,0.12)'; g.lineWidth = 2; g.beginPath(); g.arc(x + ox, y + o, r - lw * 0.5, a0 + 0.05, a0 + sw - 0.05); g.stroke();
        });
      }
      // 5 to 7 maroon vessels, each branching twice or three times, tapering as they go
      const nv = 5 + Math.floor(rnd() * 3);
      for (let v = 0; v < nv; v++) {
        const segs = [];
        const grow = (x, y, a, w, n, depth) => {
          for (let s2 = 0; s2 < n && w > 0.7; s2++) {
            const nx = x + Math.cos(a) * 20, ny = y + Math.sin(a) * 20;
            segs.push(x, y, nx, ny, w);
            if (depth < 2 && rnd() < 0.22) grow(nx, ny, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.4), w * 0.65, 6 + Math.floor(rnd() * 4), depth + 1);
            x = nx; y = ny; a += (rnd() - 0.5) * 0.6; w *= 0.9;
          }
        };
        grow(rnd() * W, rnd() * H, rnd() * TAU, 4 + rnd() * 2.5, 12 + Math.floor(rnd() * 5), 0);
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let i = 0; i < segs.length; i += 5) { x0 = Math.min(x0, segs[i], segs[i + 2]); x1 = Math.max(x1, segs[i], segs[i + 2]); y0 = Math.min(y0, segs[i + 1], segs[i + 3]); y1 = Math.max(y1, segs[i + 1], segs[i + 3]); }
        wrap((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2 + 8, (ox, o) => {
          for (let i = 0; i < segs.length; i += 5) {
            g.strokeStyle = 'rgba(92,8,30,0.6)'; g.lineWidth = segs[i + 4] + 1.5; g.beginPath(); g.moveTo(segs[i] + ox, segs[i + 1] + o); g.lineTo(segs[i + 2] + ox, segs[i + 3] + o); g.stroke();
            g.strokeStyle = 'rgba(255,110,130,0.28)'; g.lineWidth = Math.max(0.6, segs[i + 4] * 0.3); g.beginPath(); g.moveTo(segs[i] + ox - 0.8, segs[i + 1] + o - 0.8); g.lineTo(segs[i + 2] + ox - 0.8, segs[i + 3] + o - 0.8); g.stroke();
          }
        });
      }
      for (let i = 0; i < 24; i++) {
        const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 16, a = rnd() * TAU, sq = 0.5 + rnd() * 0.5;
        wrap(x, y, r, (ox, o) => { g.save(); g.translate(x + ox, y + o); g.rotate(a); g.scale(1, sq); g.fillStyle = 'rgba(190,30,60,0.35)'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(90,5,25,0.35)'; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill(); g.restore(); });
      }
    } else if (z.id === 'fork') {   // cell rings in a cool periwinkle (pink belongs to the scent): the Fork reads blue
      const rs = hexA('#7f9ce0', 0.25), rf = hexA('#7f9ce0', 0.2);
      for (let i = 0; i < 46; i++) { const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 18; wrap(x, y, r + 2, (ox, o) => { g.strokeStyle = rs; g.lineWidth = 2; g.beginPath(); g.arc(x + ox, y + o, r, 0, TAU); g.stroke(); g.fillStyle = rf; g.beginPath(); g.arc(x + ox + r * 0.2, y + o, r * 0.25, 0, TAU); g.fill(); }); }
    } else if (z.id === 'rapids') {
      // downstream chevrons worn into the bed (pointing down the screen, the way the water runs): dark grooves, not
      // white strokes, since the white flash belongs to the cilia hazards alone. 6 to 8 of them, 80 to 140 wide,
      // 2 to 3 px of rgba(10,60,75,0.35) with a 1 px light rim at 0.10 on the upstream lip
      const nch = 6 + Math.floor(rnd() * 3);
      for (let i = 0; i < nch; i++) {
        const x = rnd() * W, y = rnd() * H, w = 80 + rnd() * 60, d = w * (0.22 + rnd() * 0.12), lw = 2 + rnd();
        wrap(x, y - d / 2, w / 2 + lw, (ox, o) => {
          const vee = (dy) => { g.beginPath(); g.moveTo(x + ox - w / 2, y + o - d + dy); g.quadraticCurveTo(x + ox - w * 0.2, y + o - d * 0.3 + dy, x + ox, y + o + dy); g.quadraticCurveTo(x + ox + w * 0.2, y + o - d * 0.3 + dy, x + ox + w / 2, y + o - d + dy); g.stroke(); };
          g.strokeStyle = 'rgba(10,60,75,0.35)'; g.lineWidth = lw; vee(0);
          g.strokeStyle = 'rgba(190,245,255,0.10)'; g.lineWidth = 1; vee(-lw / 2 - 0.5);
        });
      }
      // the width is drawn once per streak, outside wrap(), so all copies match and the seed stays in step
      for (let i = 0; i < 46; i++) { const x = rnd() * W, y = rnd() * H, L = 40 + rnd() * 120, lw = 1 + rnd() * 2; wrap(x, y + L / 2, L / 2 + 10, (ox, o) => { g.strokeStyle = 'rgba(92,225,255,0.13)'; g.lineWidth = lw; g.beginPath(); g.moveTo(x + ox, y + o); g.quadraticCurveTo(x + ox + 8, y + o + L / 2, x + ox, y + o + L); g.stroke(); }); }
    } else if (z.id === 'egg') {
      // a sunrise, not mustard: 6 to 8 faint zona arcs (the jelly coat's rings, seen up close), then 20 follicle lumps
      const na = 6 + Math.floor(rnd() * 3);
      for (let i = 0; i < na; i++) {
        const x = rnd() * W, y = rnd() * H, r = 120 + rnd() * 180, a0 = rnd() * TAU, sw = 0.8 + rnd() * 1.4;
        wrap(x, y, r + 3, (ox, o) => { g.strokeStyle = 'rgba(255,214,150,0.18)'; g.lineWidth = 3; g.beginPath(); g.arc(x + ox, y + o, r, a0, a0 + sw); g.stroke(); });
      }
      for (let i = 0; i < 20; i++) {
        const x = rnd() * W, y = rnd() * H, r = 14 + rnd() * 12;
        wrap(x, y, r + 2, (ox, o) => {
          g.fillStyle = 'rgba(255,207,138,0.25)'; g.beginPath(); g.arc(x + ox, y + o, r, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,246,222,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x + ox, y + o, r - 1, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
        });
      }
      for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H, r = 0.8 + rnd() * 2.2; wrap(x, y, r, (ox, o) => { g.fillStyle = 'rgba(255,225,140,0.45)'; g.beginPath(); g.arc(x + ox, y + o, r, 0, TAU); g.fill(); }); }
    }
  }
  if (st === null || st === 2) {
    // a little wall-tinted speckle everywhere so nothing looks flat (wrapped so the tile seams match)
    g.fillStyle = css(wl, 0.08);
    for (let i = 0; i < 60; i++) { const x = rnd() * W, y = rnd() * H, r = 0.6 + rnd() * 1.4; wrap(x, y, r, (ox, o) => { g.beginPath(); g.arc(x + ox, y + o, r, 0, TAU); g.fill(); }); }
  }
}

// ---------------------------------------------------------------- baked set pieces and Sea sprites
// midground set pieces (parallax 0.45): a few variants per zone, painted once at 2x
// cv0, y0, y1: paint into an existing canvas, clipped to logical rows y0..y1 (prewarm spreads a bake over frames;
// the seeded rnd makes every slice paint the same piece)
function paintPiece(id, v, cv0, y0, y1) {
  const K = 2, rnd = seeded(5150 + v * 31 + id.length * 7);
  let w = 160, h = 200;
  if (id === 'goo') { w = 220; h = 130; } else if (id === 'fork') { w = 150; h = 70; } else if (id === 'sea') { w = 280; h = 130; } else if (id === 'rapids') { w = 150; h = 190; }
  else if (id === 'launch') { w = 160; h = 110; } else if (id === 'egg') { w = 170; h = 170; }
  const cv = cv0 || mk(w * K, h * K), g = cv.getContext('2d'), clip = y1 != null;
  if (clip) { g.save(); g.setTransform(K, 0, 0, K, 0, 0); g.beginPath(); g.rect(0, y0, w, y1 - y0); g.clip(); } else g.scale(K, K);
  g.lineCap = 'round'; g.lineJoin = 'round';
  let tips = null;
  if (id === 'launch') {      // a fleshy valve: two puffy lips (top edge on the wall) round a dark slit
    const cx = w / 2, cy = 46 + v * 4, rw = 70 - v * 6, rh = 40 + v * 4;
    g.fillStyle = '#7a1f5e'; g.beginPath(); g.moveTo(cx - rw - 8, 0); g.quadraticCurveTo(cx - rw - 10, cy + rh * 0.6, cx, cy + rh); g.quadraticCurveTo(cx + rw + 10, cy + rh * 0.6, cx + rw + 8, 0); g.closePath(); g.fill();
    g.strokeStyle = '#ff7aa8'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx - rw, cy); g.quadraticCurveTo(cx, cy - rh * 0.55, cx + rw, cy); g.stroke();
    g.beginPath(); g.moveTo(cx - rw, cy); g.quadraticCurveTo(cx, cy + rh * 0.55, cx + rw, cy); g.stroke();
    g.fillStyle = '#2a0418'; g.beginPath(); g.moveTo(cx - rw + 6, cy); g.quadraticCurveTo(cx, cy - rh * 0.22, cx + rw - 6, cy); g.quadraticCurveTo(cx, cy + rh * 0.22, cx - rw + 6, cy); g.fill();
    g.strokeStyle = 'rgba(255,220,235,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - rw * 0.6, cy - rh * 0.3); g.quadraticCurveTo(cx - rw * 0.2, cy - rh * 0.45, cx + rw * 0.1, cy - rh * 0.4); g.stroke();
    g.strokeStyle = 'rgba(60,0,30,0.5)'; g.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) { const x = cx - rw * 0.75 + i * rw * 0.5; g.beginPath(); g.moveTo(x, 4); g.quadraticCurveTo(x + 6, cy * 0.4, x - 2, cy * 0.7); g.stroke(); }
  } else if (id === 'fork') { // signpost polyps: fleshy stalks off the wall (top edge), each bending 15 to 25 degrees toward
    // +x (drawn mirrored so +x is always up the tube), a bulb on each tip, and a sleepy face on 1 polyp in 4
    const FZ = ZONES[FORK_I_R] || ZONES[0], wl = rgb(FZ.wall), lt = rgb(FZ.col[1]);
    const stalk = css(lerpC(lt, wl, 0.45)), bulb = css(lerpC(wl, [255, 255, 255], 0.35)), ink = css(lerpC(rgb(FZ.col[0]), [0, 0, 0], 0.4));
    const n = 4 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      // (bulbs 4.8 to 6.9 here: 7 to 10 px on screen at the 1.45 piece scale)
      const bx = w * (0.12 + 0.76 * (i + 0.5) / n) + (rnd() - 0.5) * 10, L = 18 + rnd() * 8, th = (15 + rnd() * 10) * Math.PI / 180, br = 4.8 + rnd() * 2.1;
      const tx = bx + Math.sin(th) * L, ty = Math.cos(th) * L + 4;
      g.strokeStyle = ink; g.lineWidth = 7.5; g.beginPath(); g.moveTo(bx, 0); g.quadraticCurveTo(bx, ty * 0.6, tx, ty); g.stroke();
      g.strokeStyle = stalk; g.lineWidth = 4.5; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(bx - 1.2, 2); g.quadraticCurveTo(bx - 1.2, ty * 0.6, tx - 1.4, ty - 1); g.stroke();
      {   // a soft periwinkle glow round the bulb (a baked dglow, #a8c8ff)
        const gx = tx, gy = ty + br * 0.6, R = br * 2.4, gg = g.createRadialGradient(gx, gy, br * 0.6, gx, gy, R);
        gg.addColorStop(0, 'rgba(168,200,255,0.7)'); gg.addColorStop(0.45, 'rgba(168,200,255,0.25)'); gg.addColorStop(1, 'rgba(168,200,255,0)');
        g.fillStyle = gg; g.fillRect(gx - R, gy - R, R * 2, R * 2);
      }
      g.fillStyle = ink; g.beginPath(); g.arc(tx, ty + br * 0.6, br + 1.6, 0, TAU); g.fill();
      g.fillStyle = bulb; g.beginPath(); g.arc(tx, ty + br * 0.6, br, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(tx - br * 0.35, ty + br * 0.25, br * 0.28, 0, TAU); g.fill();
      if ((i + v) % 4 === 1) {   // sleepy: shut eyes, a tiny open mouth
        const cy = ty + br * 0.6;
        g.strokeStyle = ink; g.lineWidth = 0.9; g.lineCap = 'round'; g.beginPath();
        g.arc(tx - br * 0.38, cy - br * 0.05, br * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); g.moveTo(tx + br * 0.6, cy - br * 0.05); g.arc(tx + br * 0.38, cy - br * 0.05, br * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        g.fillStyle = ink; g.beginPath(); g.arc(tx, cy + br * 0.42, br * 0.13, 0, TAU); g.fill();
      }
    }
    g.fillStyle = ink; g.beginPath(); g.ellipse(w / 2, 1, w * 0.44, 4, 0, 0, TAU); g.fill();
  } else if (id === 'egg') {  // corona radiata: a cluster of 5 to 7 golden helper cells
    const n = 5 + Math.floor(rnd() * 3), cx = w / 2, cy = h / 2;
    for (let i = 0; i < n; i++) {
      const an = i / n * TAU + rnd() * 0.5, rr = i ? 34 + rnd() * 20 : 0, r = 20 + rnd() * 12, x = cx + Math.cos(an) * rr, y = cy + Math.sin(an) * rr;
      g.globalAlpha = 0.5; g.fillStyle = '#ffd75c'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.globalAlpha = 1; g.strokeStyle = '#fff3c0'; g.lineWidth = 2.4; g.stroke();
      g.fillStyle = 'rgba(200,140,40,0.45)'; g.beginPath(); g.arc(x + r * 0.2, y + r * 0.1, r * 0.32, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(x - r * 0.4, y - r * 0.4, r * 0.15, 0, TAU); g.fill();
    }
  } else if (id === 'acid') {        // crystal stalagmites: a cluster of soft lime glass shards, each tip glowing
    // decoration, not danger: no ink outline and no hatch (those mark the real acid alone), a translucent #7dff3c body
    // at 0.35 with a paler facet, a hairline highlight and a soft glow baked on every tip
    const n = 4 + Math.floor(rnd() * 2), S = [];
    for (let i = 0; i < n; i++) {
      const bx = w * (0.2 + 0.6 * (i + 0.5) / n) + (rnd() - 0.5) * 14, bw = 14 + rnd() * 14, ht = 70 + rnd() * 110, lean = (rnd() - 0.5) * 0.5;
      S.push(bx, bw, bx + Math.sin(lean) * ht, h - ht);
    }
    const shard = (i) => { const bx = S[i], bw = S[i + 1]; g.moveTo(bx - bw / 2, h); g.lineTo(S[i + 2], S[i + 3]); g.lineTo(bx + bw / 2, h); g.closePath(); };
    g.globalAlpha = 0.35; g.fillStyle = '#7dff3c'; g.beginPath(); for (let i = 0; i < S.length; i += 4) shard(i); g.fill();
    g.fillStyle = '#d6ffa8';
    for (let i = 0; i < S.length; i += 4) {
      const bx = S[i], bw = S[i + 1], tx = S[i + 2], ty = S[i + 3];
      g.beginPath(); g.moveTo(bx - bw / 2, h); g.lineTo(tx, ty); g.lineTo(bx - bw * 0.05, h); g.closePath(); g.fill();
    }
    g.globalAlpha = 0.45; g.strokeStyle = '#eaffc0'; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i < S.length; i += 4) { const bx = S[i], tx = S[i + 2], ty = S[i + 3]; g.moveTo(tx, ty); g.lineTo(bx - S[i + 1] * 0.05, h); }
    g.stroke();
    g.globalAlpha = 1;
    for (let i = 0; i < S.length; i += 4) {   // the tip glows (a soft radial dglow, baked)
      const tx = S[i + 2], ty = S[i + 3], r = 11, gr = g.createRadialGradient(tx, ty, 0, tx, ty, r);
      gr.addColorStop(0, 'rgba(214,255,150,0.75)'); gr.addColorStop(0.35, 'rgba(125,255,60,0.35)'); gr.addColorStop(1, 'rgba(125,255,60,0)');
      g.fillStyle = gr; g.fillRect(tx - r, ty - r, r * 2, r * 2);
    }
    g.fillStyle = 'rgba(47,90,8,0.3)'; g.beginPath(); g.ellipse(w / 2, h - 2, w * 0.42, 7, 0, 0, TAU); g.fill();
  } else if (id === 'goo') {  // a mucus curtain: a band on the wall with drapes (at most 110 long) ending in teardrop bulbs
    const n = 5 + Math.floor(rnd() * 2), D = [], B = [], V = [];
    for (let i = 0; i <= n; i++) { D.push(i === 0 || i === n ? 20 : Math.min(110, 46 + rnd() * 64)); B.push(5 + rnd() * 3); V.push(24 + rnd() * 12); }
    const path = () => {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, 20);
      for (let i = n; i >= 0; i--) {
        const x = w * i / n, L = D[i], br = B[i];
        if (i === 0 || i === n) g.lineTo(x, L);
        else {   // the drape narrows, then swells into a round bulb at its tip
          g.lineTo(x + 3.2, L - br * 1.1);
          g.bezierCurveTo(x + br * 1.35, L - br * 0.1, x + br, L + br, x, L + br);
          g.bezierCurveTo(x - br, L + br, x - br * 1.35, L - br * 0.1, x - 3.2, L - br * 1.1);
        }
        if (i > 0) g.quadraticCurveTo(w * (i - 0.5) / n, V[i], w * (i - 1) / n + (i - 1 === 0 ? 0 : 3.2), i - 1 === 0 ? 20 : 30);
      }
      g.lineTo(0, 0); g.closePath();
    };
    // wet porridge: a vertical gradient in the zone's wall colour (0.55 at the wall, 0.30 at the drape tips) over a
    // faint cream base, with a 2 px dark outline so a curtain reads as a thing on the tube
    const GZ = ZONES[GOO_I_R], gw = rgb((GZ && GZ.wall) || '#fff3dc');
    const gr = g.createLinearGradient(0, 0, 0, 118);
    gr.addColorStop(0, css(gw, 0.55)); gr.addColorStop(1, css(gw, 0.3));
    path(); g.fillStyle = gr; g.fill();
    g.globalAlpha = 0.7; g.strokeStyle = '#2a1a10'; g.lineWidth = 2; g.stroke(); g.globalAlpha = 1;
    // a glossy line down every drape, a shine on each bulb, a bright lip along the wall
    g.globalAlpha = 0.6; g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath();
    for (let i = 1; i < n; i++) { const x = w * i / n; g.moveTo(x - 1.2, 22); g.lineTo(x - 1.2, D[i] - B[i] * 1.2); }
    g.stroke();
    g.globalAlpha = 1;
    for (let i = 1; i < n; i++) gooShine(g, w * i / n, D[i] + B[i] * 0.2, B[i] * 1.25);   // every bulb glistens
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(6, 8); g.quadraticCurveTo(w / 2, 16, w - 6, 8); g.stroke();
  } else if (id === 'sea') {  // a ceiling fold: a heavy soft drape of tissue with a lit lip
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#6a0018'); gr.addColorStop(1, '#c2213f');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, 24);
    g.bezierCurveTo(w * 0.8, h * 0.95, w * 0.62, h * 0.6, w * 0.5, h * 0.82);
    g.bezierCurveTo(w * 0.38, h * 1.0, w * 0.2, h * 0.5, 0, 30); g.closePath(); g.fill();
    g.strokeStyle = '#ff9aa8'; g.lineWidth = 4; g.beginPath(); g.moveTo(w, 24);
    g.bezierCurveTo(w * 0.8, h * 0.95, w * 0.62, h * 0.6, w * 0.5, h * 0.82); g.bezierCurveTo(w * 0.38, h * 1.0, w * 0.2, h * 0.5, 0, 30); g.stroke();
    g.strokeStyle = 'rgba(60,0,10,0.6)'; g.lineWidth = 3;
    for (let i = 1; i < 5; i++) { const x = w * i / 5; g.beginPath(); g.moveTo(x, 4); g.quadraticCurveTo(x + 8, h * 0.3, x - 4, h * 0.5); g.stroke(); }
  } else {                    // rapids: a river rock with a foam wake trailing downstream (down the screen)
    const cx = w / 2, cy = 60, rw = 34 + rnd() * 14, rh = 26 + rnd() * 8;
    g.strokeStyle = '#ffffff'; g.lineWidth = 4;
    for (let k = 0; k < 3; k++) { const s = 1 + k * 0.5; g.globalAlpha = 1 - k * 0.28; g.beginPath(); g.moveTo(cx - rw * s, cy + 6 + k * 34); g.quadraticCurveTo(cx, cy + rh + k * 40, cx + rw * s, cy + 6 + k * 34); g.stroke(); }
    g.globalAlpha = 1;
    g.fillStyle = '#1d4652'; g.beginPath(); g.ellipse(cx, cy, rw, rh, (rnd() - 0.5) * 0.4, 0, TAU); g.fill();
    g.fillStyle = '#3d7a8a'; g.beginPath(); g.ellipse(cx - rw * 0.25, cy - rh * 0.3, rw * 0.55, rh * 0.45, -0.3, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; for (let k = 0; k < 7; k++) { const a = Math.PI * (0.1 + 0.8 * k / 6); g.beginPath(); g.arc(cx + Math.cos(a) * rw * 1.05, cy - Math.sin(a) * rh * 1.05, 2.5 + rnd() * 2, 0, TAU); g.fill(); }
  }
  if (clip) g.restore();
  return { cv, w, h, tips };
}
// a piece's logical size (paintPiece's own table; prewarm slices by it)
function pieceH(id) { return id === 'goo' || id === 'sea' ? 130 : id === 'fork' ? 70 : id === 'rapids' ? 190 : id === 'launch' ? 110 : id === 'egg' ? 170 : 200; }
// a baked piece with a 3 px dark offset rim under it (rgba(0,0,0,0.35)), so it sits off the wall it grows on
function rimmed(pc) {
  const K = 2, w = pc.w + 3, h = pc.h + 3, cv = mk(w * K, h * K), g = cv.getContext('2d');
  g.drawImage(pc.cv, 3 * K, 3 * K);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w * K, h * K);
  g.globalCompositeOperation = 'source-over'; g.drawImage(pc.cv, 0, 0);
  return { cv, w, h, tips: pc.tips };
}
// one Sea red cell (r 20 in a 48 x 48 logical sprite) and one drifting cell cluster (200 x 200 logical)
function paintRedCell() {
  const K = 2, cv = mk(48 * K, 48 * K), g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, 24 * K, 24 * K);
  g.fillStyle = 'rgba(214,40,70,0.55)'; g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(70,4,20,0.55)'; g.lineWidth = 1.6; g.beginPath(); g.arc(0, 0, 19.2, 0, TAU); g.stroke();   // a dark rim: a disc, not a blob
  g.fillStyle = 'rgba(120,10,35,0.45)'; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,140,160,0.35)'; g.lineWidth = 2.4; g.beginPath(); g.arc(0, 0, 17, 3.6, 5.4); g.stroke();
  return cv;
}
function paintCluster(j) {
  const K = 1.5, cv = mk(200 * K, 200 * K), g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, 100 * K, 100 * K);
  for (let k = 0; k < 6; k++) {
    const an = k * 1.05, rr = k ? 40 + 9 * h1(k + j) : 0, r = 30 + 12 * h1(k * 3 + j);
    const cx = Math.cos(an) * rr, cy = Math.sin(an) * rr * 0.8;
    g.fillStyle = 'rgba(255,140,165,0.25)'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,190,205,0.22)'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(255,235,240,0.35)'; g.beginPath(); g.arc(cx, cy, r * 0.8, 3.7, 4.9); g.stroke();
    g.fillStyle = 'rgba(140,20,50,0.1)'; g.beginPath(); g.arc(cx + r * 0.15, cy, r * 0.3, 0, TAU); g.fill();
  }
  return cv;
}
// translate(tx, ty) scale(sx, sy) translate(-px, -py) on top of matrix m, into out (no allocation)
function xfCompose(out, m, tx, ty, sx, sy, px, py) {
  const ex = tx - sx * px, ey = ty - sy * py;
  out.a = m.a * sx; out.b = m.b * sx; out.c = m.c * sy; out.d = m.d * sy;
  out.e = m.a * ex + m.c * ey + m.e; out.f = m.b * ex + m.d * ey + m.f;
  return out;
}
// the baked Big Macro (drawWbcBody): membrane with its wobble harmonics, ink outline, fill, rim, then per kind the
// cream rim light, nucleus and granules (calm, hunting), buttery kernels (popcorn) or coiled haunches (lunger)
const WBC_RB = 26, WBC_HS = 36, WBC_K = 2.5;
function paintWbc(kind, phI) {
  const cv = mk(WBC_HS * 2 * WBC_K, WBC_HS * 2 * WBC_K), g = cv.getContext('2d'), r = WBC_RB, ph = phI * 2.1;
  g.setTransform(WBC_K, 0, 0, WBC_K, WBC_HS * WBC_K, WBC_HS * WBC_K); g.lineCap = 'round'; g.lineJoin = 'round';
  const pc = kind === 2, lg = kind === 3, hunt = kind === 1;
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * TAU, rr = 1 + 0.08 * Math.sin(a * 4 + ph * 3) + 0.05 * Math.sin(a * 7 - ph * 5);
    BX[i] = Math.cos(a) * r * rr; BY[i] = Math.sin(a) * r * rr;
  }
  if (lg) {   // the lunger's coiled haunches, under the body
    for (let sx = -1; sx <= 1; sx += 2) {
      const hx = sx * r * 0.62, hy = r * 0.62;
      g.beginPath(); g.arc(hx, hy, 8, sx < 0 ? Math.PI * 0.45 : -Math.PI * 0.2, sx < 0 ? Math.PI * 1.2 : Math.PI * 0.55);
      g.strokeStyle = HZ_INK; g.lineWidth = 6; g.stroke(); g.strokeStyle = '#ff9a3c'; g.lineWidth = 3; g.stroke();
    }
  }
  smoothBlob(g, 28); g.strokeStyle = HZ_INK; g.lineWidth = 6.2; g.stroke();
  g.fillStyle = pc ? '#fff2b0' : '#f6f0f8'; g.fill();
  g.strokeStyle = pc ? '#e0b84a' : lg ? '#ff9a3c' : hunt ? '#e08aa8' : '#c9b6d9'; g.lineWidth = lg ? 3 : 2.2; g.stroke();
  if (pc) {
    const k0 = [0.3, 2.4, 4.1][phI], nk = 3 + phI % 2;
    for (let k = 0; k < nk; k++) {
      const a = k0 * 1.7 + k * TAU / nk + (k % 2 ? 0.25 : -0.15), kr = r * 0.25, kx = Math.cos(a) * r * 0.86, ky = Math.sin(a) * r * 0.86;
      g.beginPath(); g.arc(kx, ky, kr, 0, TAU); g.strokeStyle = HZ_INK; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#fff2b0'; g.fill(); g.strokeStyle = '#e0b84a'; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(kx - kr * 0.3, ky - kr * 0.3, kr * 0.3, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(240,196,96,0.3)'; g.beginPath(); g.arc(r * 0.1, r * 0.15, r * 0.7, 0, TAU); g.fill();
    g.fillStyle = 'rgba(214,150,50,0.45)';
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + k0; g.beginPath(); g.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.45, 1.4, 0, TAU); g.fill(); }
  } else {
    g.strokeStyle = HZ_CREAM; g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, r * 0.9, Math.PI * 1.08, Math.PI * 1.45); g.stroke();
    g.fillStyle = 'rgba(210,190,230,0.45)'; g.beginPath(); g.arc(r * 0.1, r * 0.15, r * 0.78, 0, TAU); g.fill();
    g.fillStyle = 'rgba(150,100,200,0.42)';
    for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(-r * 0.25 + k * r * 0.25, r * 0.08 + Math.sin(k * 2 + 1.3) * r * 0.08, r * 0.17, r * 0.13, k, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(160,120,200,0.5)';
    for (let k = 0; k < 6; k++) { const a = k * 1.1 + 0.4; g.beginPath(); g.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.5, 1.4, 0, TAU); g.fill(); }
  }
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-r * 0.45, -r * 0.5, r * 0.18, r * 0.09, -0.7, 0, TAU); g.fill();
  return cv;
}
// the sight arc sprite: radius SIGHT_R, -60..60 degrees round +x, at 1.5x. White: a 2.5 px dashed line; red / gold:
// the same over a 5.5 px ink under-stroke at 0.35 (the old live look)
const SIGHT_R = 440;
function paintSight(col, plain) {
  const K = 1.5, R = SIGHT_R, pad = 6, x0 = R * 0.5 - pad, y0 = -R * Math.sin(Math.PI / 3) - pad, w = R - x0 + pad, h = -2 * y0;
  const cv = mk(Math.ceil(w * K), Math.ceil(h * K)), g = cv.getContext('2d');
  g.setTransform(K, 0, 0, K, -x0 * K, -y0 * K); g.lineCap = 'butt';
  if (!plain) g.setLineDash(LD_10_12);
  g.beginPath(); g.arc(0, 0, R, -Math.PI / 3, Math.PI / 3);
  if (col) { g.globalAlpha = 0.35; g.strokeStyle = HZ_INK; g.lineWidth = 5.5; g.stroke(); g.strokeStyle = col === 2 ? '#ffd75c' : '#ff3d5a'; g.lineWidth = 2.5; g.stroke(); }
  else { g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.stroke(); }
  return { cv, x0, y0, w, h };
}

// ---------------------------------------------------------------- Dad, on screen (the shop header)
// drawDad(ctx, x, y, s, habits, gen, flex): Dad in canvas primitives only, on any 2D context, standing with his feet
// at (x, y), about 88 * s px tall (s = 1 fills a 96 px canvas: drawDad(g, 48, 93, 1, ...)). habits: { id: level }
// (HABITS ids; or habits.habitShare 0..100 to set the share outright). gen: the generation (1+: grandad looks).
// flex: 0..1, the phase of the 250 ms squash-and-stretch after a buy (Renderer.dadFlex() starts it and
// Renderer.dadFlexPhase() reads it; 0 = standing still). The more of his habits he has, the straighter he stands and
// the smaller his belly; each habit adds its own prop:
//   broccoli 1+: a floret in his right hand, growing to a bouquet at 10; water 1+: a bottle in his left; sleep: eye
//   bags fading out by its max; jeans 4+: belted, roomy jeans (tight ones before); beatbox 3+: headphones and a boom
//   mic; hottub 1+: a towel round his neck; gen 1+: a grey moustache, grey hair and a cardigan.
export function drawDad(ctx, x, y, s = 1, habits = null, gen = 0, flex = 0) {
  const c = ctx, H = habits || {}, lv = (id) => Math.max(0, +H[id] || 0);
  if (!c) return;
  let share = 0;
  if (H.habitShare != null && Number.isFinite(+H.habitShare)) share = clamp(+H.habitShare / 100, 0, 1);
  else {
    let have = 0, all = 0;
    for (const id in K.HABITS || {}) { const mx = +(K.HABITS[id].max) || 0; if (mx <= 0) continue; all += mx; have += Math.min(mx, lv(id)); }
    share = all > 0 ? have / all : 0;
  }
  const old = (+gen || 0) >= 1, f = clamp(+flex || 0, 0, 1);
  // the flex: squash (feet planted) for the first 30%, stretch up to 65%, then a settle back to rest
  const sq = f <= 0 || f >= 1 ? 0 : f < 0.3 ? -Math.sin(f / 0.3 * Math.PI / 2) : f < 0.65 ? -1 + 2 * Math.sin((f - 0.3) / 0.35 * Math.PI / 2) : Math.cos((f - 0.65) / 0.35 * Math.PI / 2);
  const ssx = 1 - 0.1 * sq, ssy = 1 + 0.12 * sq, arm = f > 0 && f < 1 ? Math.sin(f * Math.PI) : 0;
  const belly = 24 - 15 * share, slump = 0.2 * (1 - share), ink = '#2a0a24', skin = '#ffd2b0', hairC = old ? '#cfcad6' : '#6a3e22';
  c.save();
  c.translate(x, y); c.scale(s * ssx, s * ssy);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // shadow
  c.fillStyle = 'rgba(20,4,20,0.25)'; c.beginPath(); c.ellipse(0, 0, 22, 4, 0, 0, TAU); c.fill();
  // legs: tight dark jeans, or (jeans 4+) roomy ones with a belt
  const roomy = lv('jeans') >= 4, lw = roomy ? 7.5 : 5.5;
  c.fillStyle = roomy ? '#4a6fb8' : '#2c3f78'; c.strokeStyle = ink; c.lineWidth = 1.4;
  for (let sx = -1; sx <= 1; sx += 2) { c.beginPath(); c.moveTo(sx * 2, -34); c.lineTo(sx * (2 + lw), -34); c.lineTo(sx * (1.5 + lw), -3); c.lineTo(sx * 1.5, -3); c.closePath(); c.fill(); c.stroke(); }
  c.fillStyle = '#3a2418'; for (let sx = -1; sx <= 1; sx += 2) { c.beginPath(); c.ellipse(sx * (2 + lw / 2), -2.2, lw / 2 + 2.5, 2.6, 0, 0, TAU); c.fill(); }
  if (!roomy) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-5, -30); c.lineTo(-4, -27); c.moveTo(5, -30); c.lineTo(4, -27); c.stroke(); }   // (the strain)
  // the body leans forward with the slump (pivot at the hips)
  c.translate(0, -34); c.rotate(slump * 0.5);
  // torso and belly: a tee, the belly bulging out front (to his right on screen)
  c.fillStyle = '#ff8a5c'; c.strokeStyle = ink; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-10, 0); c.lineTo(-11, -26 + slump * 8); c.quadraticCurveTo(0, -32 + slump * 6, 11, -26 + slump * 8);
  c.quadraticCurveTo(10 + belly * 0.55, -12, 9 + belly * 0.35, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(-4, -18, 3, 6, 0.2, 0, TAU); c.fill();
  if (old) {   // the cardigan: two knit panels with buttons
    c.fillStyle = '#8a6a9a';
    for (let sx = -1; sx <= 1; sx += 2) { c.beginPath(); c.moveTo(sx * 11, -26 + slump * 8); c.lineTo(sx * 3, -27); c.lineTo(sx * 4, 0); c.lineTo(sx * (sx > 0 ? 9 + belly * 0.35 : 10), 0); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = '#ffd75c'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(4.2, -20 + i * 7, 1, 0, TAU); c.fill(); }
  }
  if (roomy) {   // the belt and its buckle
    c.fillStyle = '#5a3418'; c.fillRect(-10.5, -3, 20 + belly * 0.35, 3); c.fillStyle = '#ffd75c'; c.fillRect(-1.5, -3.5, 3.5, 4); c.strokeStyle = ink; c.lineWidth = 0.8; c.strokeRect(-1.5, -3.5, 3.5, 4);
  }
  // the towel round his neck (hottub 1+): white with a blue stripe, one end hanging
  const towel = lv('hottub') >= 1;
  // arms: hanging (or raised in a flex), each hand holding its prop
  // (a hand rests at (14, shoulder + 19); the flex swings both up to a biceps pose at (19, shoulder - 7))
  const shY = -24 + slump * 8, rx = 14 + 5 * arm + belly * 0.12, ry = shY + 19 - 26 * arm, lx = -14 - 5 * arm, ly = ry;
  c.strokeStyle = '#ff8a5c'; c.lineWidth = 5; c.beginPath(); c.moveTo(11, shY); c.lineTo(rx, ry); c.moveTo(-11, shY); c.lineTo(lx, ly); c.stroke();
  if (old) { c.strokeStyle = '#8a6a9a'; c.lineWidth = 5; c.beginPath(); c.moveTo(11, shY); c.lineTo(rx, ry); c.moveTo(-11, shY); c.lineTo(lx, ly); c.stroke(); }
  c.fillStyle = skin; c.strokeStyle = ink; c.lineWidth = 1;
  for (const [hx, hy] of [[rx, ry], [lx, ly]]) { c.beginPath(); c.arc(hx, hy, 3.2, 0, TAU); c.fill(); c.stroke(); }
  const brc = lv('broccoli');
  if (brc >= 1) {   // a floret, growing; a bouquet of three with a pink ribbon at 10
    const k = 0.7 + 0.3 * Math.min(1, brc / 9), n = brc >= 10 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const ox = rx + (i - (n - 1) / 2) * 5, oy = ry - 3 - (i === 1 ? 2 : 0), r = 4.2 * k;
      c.strokeStyle = '#6fbf4a'; c.lineWidth = 2; c.beginPath(); c.moveTo(rx, ry); c.lineTo(ox, oy - 4 * k); c.stroke();
      c.fillStyle = '#3f9a3a'; c.beginPath(); c.arc(ox - r * 0.5, oy - 6 * k, r * 0.7, 0, TAU); c.arc(ox + r * 0.5, oy - 6 * k, r * 0.7, 0, TAU); c.arc(ox, oy - 8 * k, r * 0.8, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.arc(ox - 1, oy - 9 * k, r * 0.3, 0, TAU); c.fill();
    }
    if (n === 3) { c.fillStyle = '#ff5ca8'; c.beginPath(); c.moveTo(rx, ry - 1); c.lineTo(rx - 4, ry + 3); c.lineTo(rx + 4, ry + 3); c.closePath(); c.fill(); }
  }
  if (lv('water') >= 1) {   // a water bottle
    c.fillStyle = 'rgba(140,220,255,0.85)'; c.strokeStyle = ink; c.lineWidth = 1;
    c.beginPath(); c.rect(lx - 2.8, ly - 12, 5.6, 11); c.fill(); c.stroke();
    c.fillStyle = '#5b7cff'; c.fillRect(lx - 1.6, ly - 14.5, 3.2, 2.6);
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(lx - 1.8, ly - 10, 1, 7);
  }
  // head
  const hy = shY - 13;
  c.fillStyle = skin; c.strokeStyle = ink; c.lineWidth = 1.5;
  c.beginPath(); c.arc(0, hy, 11, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = hairC; c.beginPath(); c.arc(0, hy - 3, 11, Math.PI * 1.08, Math.PI * 1.92); c.quadraticCurveTo(4, hy - 9, -9.5, hy - 7.5); c.closePath(); c.fill();
  if (towel) {
    c.strokeStyle = '#ffffff'; c.lineWidth = 4.5; c.beginPath(); c.moveTo(-9, shY + 1); c.quadraticCurveTo(0, shY + 5, 9, shY + 1); c.lineTo(8, shY + 14); c.stroke();
    c.strokeStyle = '#5ce1ff'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-8, shY + 1.5); c.quadraticCurveTo(0, shY + 5.5, 8.5, shY + 1.5); c.stroke();
  }
  // eyes, the bags under them (they fade as he sleeps more), the smile (wider the healthier he is)
  const slp = lv('sleep'), smx = (K.HABITS && K.HABITS.sleep && K.HABITS.sleep.max) || 5, bags = 0.75 * (1 - Math.min(1, slp / smx));
  c.fillStyle = ink; for (let sx = -1; sx <= 1; sx += 2) { c.beginPath(); c.arc(sx * 4, hy - 1, 1.4, 0, TAU); c.fill(); }
  if (bags > 0.02) { c.strokeStyle = `rgba(110,50,110,${bags.toFixed(2)})`; c.lineWidth = 1.4; c.beginPath(); for (let sx = -1; sx <= 1; sx += 2) { c.moveTo(sx * 4 - 2, hy + 1.6); c.quadraticCurveTo(sx * 4, hy + 3.2, sx * 4 + 2, hy + 1.6); } c.stroke(); }
  c.fillStyle = 'rgba(255,110,140,0.35)'; c.beginPath(); c.ellipse(-6.5, hy + 3, 2, 1.3, 0, 0, TAU); c.ellipse(6.5, hy + 3, 2, 1.3, 0, 0, TAU); c.fill();
  c.strokeStyle = '#5a1020'; c.lineWidth = 1.3; c.beginPath(); c.arc(0, hy + 3, 2.5 + 2 * share, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  if (old) { c.fillStyle = '#d8d4de'; c.strokeStyle = 'rgba(42,10,36,0.5)'; c.lineWidth = 0.6; c.beginPath(); c.ellipse(-2.4, hy + 2.6, 2.8, 1.3, 0.3, 0, TAU); c.ellipse(2.4, hy + 2.6, 2.8, 1.3, -0.3, 0, TAU); c.fill(); c.stroke(); }
  if (lv('beatbox') >= 3) {   // headphones over the hair and a boom mic at his mouth
    c.strokeStyle = '#2a2a3a'; c.lineWidth = 2.2; c.beginPath(); c.arc(0, hy - 1, 12.5, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.fillStyle = '#ff3d6e'; c.strokeStyle = ink; c.lineWidth = 1;
    for (let sx = -1; sx <= 1; sx += 2) { c.beginPath(); c.ellipse(sx * 11.5, hy, 3, 4.2, 0, 0, TAU); c.fill(); c.stroke(); }
    c.strokeStyle = '#2a2a3a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(11.5, hy + 3); c.quadraticCurveTo(9, hy + 9, 3.5, hy + 6.5); c.stroke();
    c.fillStyle = '#2a2a3a'; c.beginPath(); c.arc(3, hy + 6.4, 1.6, 0, TAU); c.fill();
  }
  c.restore();
}
