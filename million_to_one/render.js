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
const DIM = { rapids: 0.26, egg: 0.18, launch: 0.45, fork: 0.22 };
const dimOf = (zi) => (ZONES[zi] ? DIM[ZONES[zi].id] ?? 0.3 : 0.3);
// render-side tube colours [deep, lite] where a zone's own pair reads poorly: the Gate of Goo was a grey 1.6:1 (now a
// pearly periwinkle tube in a navy outside, about 3:1); the Launch Tube's lite leans 12% toward its pink glow
const TUBE_TINT = { goo: ['#1b1f44', '#6c78c4'], egg: ['#4a1630', '#f2b04a'], fork: ['#160a2e', '#6c3cb8'] };
const GOO_RIM = 'rgba(42,10,36,0.6)';   // swimmer heads on the pale Goo (white on periwinkle reads ~4.5:1 with it)
const CAUS_COL = '#ffb08a';                   // the Sea's caustic net: warm peach, apart from the pink tissue
{
  const LZ = ZONES.find((z) => z.id === 'launch');
  if (LZ) { const a = rgb(LZ.col[1]), b = rgb('#ff9ac0'), h2 = (v) => Math.round(v).toString(16).padStart(2, '0'); TUBE_TINT.launch = [LZ.col[0], '#' + h2(a[0] + (b[0] - a[0]) * 0.12) + h2(a[1] + (b[1] - a[1]) * 0.12) + h2(a[2] + (b[2] - a[2]) * 0.12)]; }
}
// the porridge Goo (ZONES goo col ['#2f2a24', '#857a66'], wall '#fff3dc') reads on its own pair: the periwinkle tint
// stays only while the zone still carries the old grey pair
{ const GZ = ZONES.find((z) => z.id === 'goo'); if (GZ && GZ.col && GZ.col[0] !== '#262a3a') delete TUBE_TINT.goo; }
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
const TRAIL_N = 26;                           // Kevin's trail ring
const hexA = (hex, a) => css(rgb(hex), a);
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
const CAPS = ['#ff3d6e', '#5b7cff', '#2fd17a', '#ffa630', '#b84dff'];
const FACE_ACC = [[], ['glasses'], ['stache'], ['bow', 'lashes'], ['cap'], ['shades']];
// heat aura colours, mint to orange to red, quantised so the glow cache stays small
const HEAT = ['#96ffaa', '#b8ff8a', '#e0ff6a', '#ffe05c', '#ffbf4a', '#ff9a3c', '#ff7438', '#ff5a3c'];
// signature swims: tail beat (freq, amp, tail width) and a party trick each
// silhouettes: sx / sy body shape, blink period (dbl: a double blink), tilt (Gunther's lean, flips each roll)
const BOSS_LOOK = {
  Steve: { acc: ['cap'], cap: '#5b7cff', mouth: 'grin', freq: 11, amp: 8, wave: 4, sx: 1.05, sy: 1.05, blink: 2.6 },
  Brock: { acc: ['band', 'stache'], band: '#ff7a2f', brow: 'angry', freq: 12, amp: 9, tw: 4.6, flex: 5, sx: 1.22, sy: 0.95 },
  Tiffany: { acc: ['bow', 'lashes', 'glasses'], mouth: 'smirk', freq: 22, amp: 3.5, straight: 1, sx: 0.88, sy: 1.08, tw: 2.4, blink: 4.5, dbl: 1, read: 1 },
  Gunther: { acc: ['mohawk', 'shades'], mouth: 'grin', freq: 16, amp: 6, roll: 6, sy: 1.06, tilt: 0.08, blink: 2.0 },
  Chad: { acc: ['crown', 'shades'], mouth: 'smirk', freq: 14, amp: 6, strut: 1, quiff: 1, sy: 1.1 },
};
// a blink at phase u of a P-second cycle (dbl: two quick ones)
const blinkAt = (u, P, dbl) => { const k = ((u % P) + P) % P; return k < 0.12 || (!!dbl && k > 0.22 && k < 0.34); };
// rival moves (systems event rivalMove): how long each phase plays
const MV_DUR = { tell: 0.6, hit: 0.35, countered: 0.5 };
// which accessory a baby inherits from Dad's strongest mutation (album portraits)
const MUT_ACC = { helmet: 'cap', spiky: 'mohawk', mosh: 'mohawk', hype: 'band', turbo: 'band', whip: 'band', nose: 'glasses', memory: 'glasses',
  nitro: 'shades', slick: 'shades', wingman: 'shades', sweet: 'bow', second: 'bow', lucky: 'crown', chain: 'crown', draft: 'stache', rush: 'stache' };
const FONT = '"Baloo 2", system-ui, sans-serif';
const TS = 1.25, TW = 440, TH = 720;          // backdrop tile: logical size and pixel scale
const MAXP = 420, MAXP_LITE = 260;            // particle ring buffer size (full / lite)
const SPR = 2.5;                              // pixel scale of baked crowd heads
const TXT_MAX = 64;                           // baked text sprites kept (LRU)
const BAKES_PER_FRAME = 2;                    // new text sprites a frame may paint (pops beyond that wait a frame)
// precomputed rainbow strings (36 hues, 10 degrees apart) so hot loops never build colour strings
const HSL65 = [], HSL75 = [], HSL82 = [];
for (let i = 0; i < 36; i++) { HSL65.push(`hsl(${i * 10},100%,65%)`); HSL75.push(`hsl(${i * 10},100%,75%)`); HSL82.push(`hsl(${i * 10},100%,82%)`); }
const hueI = (deg) => ((Math.round(deg / 10) % 36) + 36) % 36;
const RINGC = [];
// the link kinds' chip colours (main.js LINK_CHIP): Kevin's STYLE tail wears one stripe per kind landed in the window
const LINK_COL = { pass: '#fff4f8', rival: '#ffd75c', close: '#5ce1ff', dodge: '#5ce1ff', gate: '#d9b8ff', draft: '#b8f0ff', slingshot: '#ffd75c', weave: '#7dffb0',
  snipe: '#ff8fc8', bump: '#ffb36b', pop: '#f4eef7', domino: '#ffd75c', sugar: '#7dffb0', dna: '#ff8be0' };
const SGN = [-1, 1], NODASH = [], DASH_FORK = [2, 7], DASH_FORK_L = [2, 12], DASH_FOAM = [14, 30];   // shared, never mutated
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
const seaDep = (y) => 16 + 6 * Math.sin(y * TAU / 140);   // the Sea's rugae depth, 10..22
const SHIELD_COL = ['rgba(255,215,92,0.75)', 'rgba(255,215,92,0.62)', 'rgba(255,215,92,0.52)'], SHIELD_LBL = [];   // by ring count; the 'x5' labels                             // ringCol's 16 cached steps
const SPRINT_COL = rgb('#ff5a3c');
const KEVIN_HITS = new Set(['kevin', 'player', 'hit', 'shieldHit', 'wingHit', 'second', 'bonk', 'swat', 'acid', 'stuck', 'death']);
const FORK_I_R = Math.max(0, ZONES.findIndex((z) => z.fork));
const RIVAL_SC = 1.3, KEVIN_SC = RIVAL_SC * 1.2;    // Kevin is drawn 1.2x the size of the biggest crowd swimmers (the hero silhouette)
const HEADWEAR = ['cap', 'mohawk', 'bow'];   // accessories on top of his head: the race bib drops 1.5 units under them
const TILE_CACHE = 5;                         // zone tiles kept baked
const PIECE_IDS = new Set(['launch', 'acid', 'goo', 'sea', 'fork', 'rapids', 'egg']);   // zones with midground set pieces
const GOO_I_R = ZONES.findIndex((z) => z.id === 'goo');
const EGG_I_R = ZONES.findIndex((z) => z.id === 'egg');
const NRIV = Array.isArray(K.RIVALS) ? K.RIVALS.length : 5;   // the named rivals are race.agents[0 .. NRIV - 1]
// every field drawPlayer's face code may set on its persistent options object (reset to undefined each frame)
const KEV_RESET = ['dizzy', 'mouth', 'ouch', 'brow', 'star', 'happy', 'puff', 'blush', 'tired', 'shock', 'wink', 'headK', 'amp', 'curl', 'tw', 'tlen',
  'sx', 'sy', 'lookY', 'crown', 'ko', 'tail', 'round', 'tipCol', 'shadesY', 'shadesR', 'shadesS', 'shadesOff', 'quiff', 'quiffK', 'cap', 'name', 'bob', 'nameCol', 'lbl', 'key', 'stripeN'];
// hazard readability: a dark outer outline and a cream top-left rim on every hazard
const HZ_INK = '#2a0a24', HZ_CREAM = 'rgba(255,244,226,0.7)';
// glow colours each zone's floaters use (prewarm bakes them before the gate)
const ZGLOW = { launch: ['#ff9ac0'], acid: ['#9dff3c'], goo: ['#dfe6ff'], sea: ['#ff8a9c'], fork: ['#ff8be0', '#788cc8'], rapids: ['#ffffff'], egg: ['#ffd77a', '#fff3c0'] };
// burst colours the race throws most (prewarmRun bakes their dots during the countdown)
const BURST_COLS = ['#ffd75c', '#ff5cd2', '#7dffb0', '#5ce1ff', '#ffffff', '#8cdcff', '#f4eef7', '#9dff3c', '#ff8be0', '#9ae2ff', ...HEAT];
// the style ribbon (STYLE 4 and 5): three colours cycling down Kevin's trail
const RIBBON = ['#ff5cd2', '#5ce1ff', '#ffd75c'];
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
function seeded(s) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// set ctx to M * translate(x, y) * rotate(r) * scale(sx, sy) without save/restore
function setXf(c, m, x, y, r, sx, sy) {
  const cs = Math.cos(r), sn = Math.sin(r);
  c.setTransform((m.a * cs + m.c * sn) * sx, (m.b * cs + m.d * sn) * sx, (m.c * cs - m.a * sn) * sy, (m.d * cs - m.b * sn) * sy, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
}

export class Renderer {
  constructor(cv) {
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
    this.padTop = 0; this.nemesis = null; this.cssK = 1;
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
    this.frame = 0; this.ringN = 0;
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
    this.banks = []; this.bubble = null; this.desat = 0; this.ghostA = 0; this.ghostX = 0;
    this.lastBreakT = -9; this.lastBankT = -9; this.lastZi = -1; this.gateFlash = 0; this.emberT = 0;
    this.lead = 0.34; this.pAng = null; this.pAngV = 0; this.prevE = null; this.prevOv = null; this.prevTier = 0;
    this.accKey = -1; this.accList = []; this.accRest = []; this.accBand = '#ff3d6e'; this.accNew = null; this.accT = 0;
    this.chompT = 0; this.winkT = 0; this.nearT = 0; this.winT = 0; this.overSeen = null; this.shardsDone = false;
    this.dieT = 0; this.dieSeen = null; this.dieWbc = null; this.diePop = 0; this.linkT = 0;
    this.youT = 0; this.prevPend = null; this.prevRT = null; this.endT = 0; this.stealSaid = false; this.thiefXY = null;
    this.eggCam = 0; this.eggBlinkAt = 0; this.eggBlinkT = -9; this.kPopT = -9; this.kBits = 0; this.lateCam = false; this.lateReady = false; this.lateFrom = null; this.lateOver = null;
    this.ghosts = []; this.imp = null; this.books = []; this.wedge = null; this.vs = null; this.pvDashCd = null; this.dashRdyT = null; this.kThreatPop = null;
    this.oopsT = 0; this.oopsAt = -9; this.oopsKind = null; this.oopsId = 0;
    this.huffT = 0; this.wallT = 0; this.wallLast = -9; this.wallOn = false; this.dashAge = 9; this.headA = 0;
    this.buddyN = 0; this.buddyFly = []; this.sparkT = 0; this.bibGone = false; this.acidFz = 0; this.birthS = null;
    this.shLast = null; this.shChgT = null; this.popGlows = []; this.gooStr = 0;
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
        fk: '', popT: -9, headK: 1,
        // reactive shades (Gunther, Chad): eased lift / tilt / scale, knocked off by a bump (shOff), back on at shBack
        shY: 0, shR: 0, shS: 1, shOff: 0, shBack: -9, shPb: 0 };
      this.aux.set(a, A);
    }
    return A;
  }
  // a hazard's (or a mark's) display state: last frame drawn, death time, popped, gold flash time, passed time
  ex(e) { let E = this.eaux.get(e); if (!E) { E = { seen: -9, deadT: null, corpse: 0, goldT: null, pt: null }; this.eaux.set(e, E); } return E; }

  // ---------------------------------------------------------------- feel
  // addTrauma(a, dx, dy): with a direction, that axis shakes 1.5x and the other 0.5x for 0.15 s
  addTrauma(a, dx, dy) {
    // a hit that jolted the camera this frame (impactFrame) shakes about 30% less; what was added this frame is
    // remembered so a jolt that lands after the shake can take its share back
    if (this.joltT === this.time) a *= 0.7;
    const t0 = this._trauma;
    this._trauma = Math.min(1, this._trauma + Math.max(0, a));
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
  // old API: `shake = n` adds trauma n/14; a smaller value caps it (reduced-motion clamp)
  get shake() { return this._trauma * 14; }
  set shake(v) { const a = clamp((+v || 0) / 14, 0, 1); if (a < this._trauma - 1e-6) this._trauma = a; else if (a > this._trauma + 1e-6) this.addTrauma(a); }
  // a directional camera nudge that springs back
  kick(dx, dy) { const k = this.reduced ? 60 : 380; this.kvx += dx * k; this.kvy += dy * k; }
  // full-screen flash (photosensitive safety): a new flash less than 0.5 s after the last one (gate flashes
  // included) is ignored; drawn alpha is capped at 0.4, 0.25 for red, and reduced motion gets an edge glow only
  get flash() { return this._flash; }
  set flash(v) {
    v = +v || 0;
    if (v > this._flash + 0.01) { if (this.time - this.lastFlashT < 0.5) { this.flashRej = true; return; } this.lastFlashT = this.time; this.flashRej = false; }
    this._flash = v;
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
    const n = ch === 2 ? 28 : ch === 3 ? 34 : 40, spd = ch === 2 ? 250 : ch === 3 ? 290 : 320;
    if (ch === 2) this.burst(x, y, '#f4eef7', cnt(n), spd, 0.7, 4);
    else {   // a third of it gold
      const g = Math.round(n / 3);
      this.burst(x, y, '#f4eef7', cnt(n - g), spd, 0.7, 4);
      this.burst(x, y, '#ffd75c', cnt(g), spd, 0.7, 4);
    }
    shard(cnt(ch >= 4 ? 10 : 4), '#d9b8ff', 150, 260);
    if (ch === 2) this.ring(x, y, this.ringCol(0.5), 44, 0.25, 4);
    else if (ch === 3) this.ring(x, y, this.ringCol(0.75), 60, 0.28, 4.5);
    else this.ring(x, y, '#ffd75c', 80, 0.32, 5);
    if (ch >= 3 && !this.reduced) {   // the star: 6 spokes of fast streaks (2 per spoke, 1 on lite)
      const a0 = Math.random() * TAU, per = lite ? 1 : 2;
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
  pop(x, y, text, col = '#fff', size = 16, life = 1.1) {
    const size0 = +size || 16, small = size0 < 16, big = size0 >= 20;
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
      this.pops.push({ x, y, dy: y, text: String(text), col, size, big, age: 0, life, max: life, al: 1, rot: this.reduced ? 0 : (Math.random() - 0.5) * 0.25 });
      return;
    }
    // stack below any live pop it would overlap
    for (let it = 0; it < 6; it++) {
      let hit = false;
      for (const q of this.pops) {
        if (q.big) continue;
        const qy = q.dy != null ? q.dy : q.y, gap = Math.max(size, q.size) * 1.1;
        if (Math.abs(qy - y) < gap && Math.abs(q.x - x) < 80) { y = qy - gap; hit = true; }
      }
      if (!hit) break;
    }
    // at most 3 small ones live: drop the oldest first
    let ns = 0;
    for (const q of this.pops) if (!q.big) ns++;
    for (; ns >= 3; ns--) this.pops.splice(this.pops.findIndex((q) => !q.big), 1);
    this.pops.push({ x, y, dy: y, text: String(text), col, size, big, age: 0, life, max: life, al: 1, rot: this.reduced ? 0 : (Math.random() - 0.5) * 0.25 });
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
  zoomPunch(amt = 0.08) { if (this.reduced) return; this.zoomK = Math.max(this.zoomK, Math.min(0.25, amt)); }
  // the opposite: the camera pulls back a touch (a dash), easing home over about 0.3 s
  zoomPull(amt = 0.06) { if (this.reduced) return; this.zoomK = Math.min(this.zoomK, -Math.min(0.12, Math.abs(+amt || 0.06))); }
  // the combo ring shatters (main.js: core event 'comboBreak'; n is the chain that broke). Bigger chains throw
  // more and faster shards (10 to 24), grey the world out longer, and from 25 flash the edges red-violet
  comboBreak(x, y, n = 0) {
    if (this.time - this.lastBreakT < 0.3) return;
    n = Math.max(0, +n || 0);
    this.lastBreakT = this.time; this.desat = 0.2 + Math.min(0.35, n / 120);
    // (it shares the 0.5 s flash limiter: a flash or a gate flash just before means no edge flash)
    if (n >= 25 && this.time - this.lastFlashT >= 0.5) { this.breakVig = 0.25; this.lastFlashT = this.time; }
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
    let tg = 'kevin', bd = kev ? -1 : Math.hypot(p.x - x, p.y - y) * 1.2;
    if (!kev) {
      // (a Big Mac that died within the last 0.1 s still counts: its pop is the hit)
      for (const e of race.ents) { if (e.t !== 'wbc') continue; const E = this.ex(e); if (e.dead && !(E.deadT != null ? this.time - E.deadT < 0.1 : E.seen === this.frame)) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd && d < 60 + e.r) { bd = d; tg = e; } }
      for (const a of race.agents) { const A = this.aux.get(a); if (!a.alive || !A || A.seen !== this.frame || !A.init) continue; const d = Math.hypot(A.rx - x, a.y - y); if (d < bd && d < 50) { bd = d; tg = a; } }
    }
    // a pop whose Big Mac the race already compacted away: last frame's drawn list still has it; failing that the
    // flash has no body (a point at x, y), never Kevin
    if (kind === 'pop' && tg === 'kevin') {
      for (const e of this._wbcPrev || []) { const d = Math.hypot(e.x - x, e.y - y); if (d < 60 + e.r) { tg = e; break; } }
      if (tg === 'kevin') tg = this.popTg || (this.popTg = { x: 0, y: 0 });
      if (tg.t !== 'wbc') { tg.x = x; tg.y = y; }
    }
    const tA = tg === 'kevin' ? null : this.aux.get(tg);
    const tx = tg === 'kevin' ? p.x : tA && tA.init ? tA.rx : tg.x, ty = tg === 'kevin' ? p.y : tg.y;
    let dx = x - p.x, dy = -(y - p.y);
    if (tg !== 'kevin') { dx = tx - p.x; dy = -(ty - p.y); }
    const ang = Math.hypot(dx, dy) < 4 ? -Math.PI / 2 : Math.atan2(dy, dx);
    const n = 6 + Math.floor(Math.random() * 3), st = [];
    for (let i = 0; i < n; i++) st.push(i / n * TAU + (Math.random() - 0.5) * 0.5, 18 + Math.random() * 22);
    this.imp = { tg, x, y, ang, t: clamp(+sec || 0.06, 0.02, 0.3), st };
    this.hitDebris(kind, x, y, ang, p);
    // the jolt: the camera is knocked straight off the hit axis on the hit frame, and the spring brings it home
    const J = { bonk: 7, bump: 5, shieldHit: 9, player: 12, death: 12 }[kind];
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
      const band = playBand(p.y, p.side), sw = Math.abs(x - p.x) > 4 ? Math.sign(x - p.x) : p.x - band.l < band.r - p.x ? -1 : 1, n = cnt(5);
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
  isImp(tg) { return !!this.imp && this.imp.tg === tg && this.imp.t > 0; }
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
  say(k, text, dur = 2) { this.bubble = { k, text: String(text), life: dur, max: dur, lines: null }; }

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
  dglow(col, x, y, r, a = 1) { const c = this.ctx; c.globalAlpha = a; c.drawImage(this.glow(col), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }
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
    const z = ZONES[zi], egg = z && z.id === 'egg', col = egg ? [150, 86, 10] : lerpC(rgb(zcol(z)[0]), [0, 0, 0], 0.55), st = egg ? 0.6 : 1;
    v = mk(256, 256); const x = v.getContext('2d'), g = x.createRadialGradient(128, 150, 50, 128, 150, 190);
    g.addColorStop(0, css(col, 0)); g.addColorStop(0.6, css(col, 0.15 * st)); g.addColorStop(1, css(col, 0.75 * st));
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    if (z && z.id === 'sea') {   // the Sea's dark edges and its warm light from above, static in screen space: baked here
      const e = x.createLinearGradient(0, 0, 256, 0);
      e.addColorStop(0, 'rgba(30,0,8,0.45)'); e.addColorStop(0.25, 'rgba(30,0,8,0)'); e.addColorStop(0.75, 'rgba(30,0,8,0)'); e.addColorStop(1, 'rgba(30,0,8,0.45)');
      x.fillStyle = e; x.fillRect(0, 0, 256, 256);
      // a vertical value ramp: warm peach light over the top 25%, deep #3a0610 pooling over the bottom 30%, so the
      // big red Sea has a top and a bottom
      const tg = x.createLinearGradient(0, 0, 0, 256 * 0.25);
      tg.addColorStop(0, 'rgba(255,186,150,0.22)'); tg.addColorStop(1, 'rgba(255,186,150,0)');
      x.fillStyle = tg; x.fillRect(0, 0, 256, 256 * 0.25);
      const bg = x.createLinearGradient(0, 256 * 0.7, 0, 256);
      bg.addColorStop(0, 'rgba(58,6,16,0)'); bg.addColorStop(1, 'rgba(58,6,16,0.55)');
      x.fillStyle = bg; x.fillRect(0, 256 * 0.7, 256, 256 * 0.3);
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
    const g = job.g; g.globalAlpha = dimOf(zi); g.fillStyle = 'rgb(0,0,10)'; g.fillRect(0, 0, TW, TH); g.globalAlpha = 1;
    this.tiles.set(zi, job.cv);
  }
  // the next zone's tile is baked over three frames well before its gate (no hitch at the blend)
  // then, one bake a frame: its vignette, its set pieces, its floaters' sprites, its glows and the gate's name
  // Budget: about 2 ms a frame, and nothing at all on a frame after a slow one (lastDrawMs > 8). Each bake is followed
  // by a GPU 'touch' (the new canvas drawn at alpha 0.004 off-screen) so its upload happens now, not at first sight.
  prewarm(p, zi) {
    const nz = zi + 1;
    if (!ZONES[nz] || !(p.y > ZSTART[nz] - 3500)) return;
    if (this.lastDrawMs > 8) return;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), t0 = now();
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
      if (r && now() - t0 > 2) return;
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
    if (id === 'sea') {
      L.push(() => { if (this.causS && this.causS.has(CAUS_COL)) return false; return this.causticSpr(CAUS_COL); });
      L.push(() => { if (this.rcS) return false; return this.redCellSpr(); });
      L.push(() => { if (this.rcB) return false; return this.redCellBlur(); });
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
    g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 2.2;
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
  innerA(zi) { return ZONES[zi] && ZONES[zi].id === 'sea' ? 0.55 : 0.5; }
  // text painted once (shadow, outline, fill, highlight at 2x); kind 'sign' draws a rounded plate
  // canWait: the caller can skip a frame (pops), so a frame never paints more than BAKES_PER_FRAME new sprites
  text(text, col, size, kind = 'pop', canWait = false) {
    size = Math.round(size);
    const key = kind + '|' + text + '|' + col + '|' + size;
    let s = this.txt.get(key);
    if (s) { this.txt.delete(key); this.txt.set(key, s); return s; }
    if (canWait && this.bakes >= BAKES_PER_FRAME) return null;
    this.bakes++;
    let reuse = null;   // the evicted sprite's canvas is resized and painted again (no new canvas per bake)
    // (the evicted sprite is flagged dead: a pop holding it drops it and bakes again)
    if (this.txt.size >= TXT_MAX) { const k0 = this.txt.keys().next().value, old = this.txt.get(k0); old.dead = true; reuse = old.cv; this.txt.delete(k0); }
    const K = 2, probe = this.probe || (this.probe = mk(4, 4).getContext('2d'));
    const font = kind === 'sign' || kind === 'signO' || kind === 'label' ? `800 ${size}px ${FONT}` : `900 ${size}px ${FONT}`;
    probe.font = font;
    const tw = Math.ceil(probe.measureText(text).width);
    if (kind === 'label') {   // a rival's name tag: a dark pill, a thick dark outline, the (already lifted) colour
      const pw = Math.ceil(tw + size * 0.9), ph = Math.ceil(size * 1.35), w = pw + 2, h = ph + 2;
      let cv = reuse;
      if (cv) { cv.width = w * K; cv.height = h * K; } else cv = mk(w * K, h * K);
      const g = cv.getContext('2d');
      g.setTransform(K, 0, 0, K, 0, 0); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const r = ph / 2;
      g.fillStyle = 'rgba(20,0,20,0.55)'; g.beginPath(); g.moveTo(1 + r, 1); g.arcTo(1 + pw, 1, 1 + pw, 1 + ph, r); g.arcTo(1 + pw, 1 + ph, 1, 1 + ph, r); g.arcTo(1, 1 + ph, 1, 1, r); g.arcTo(1, 1, 1 + pw, 1, r); g.closePath(); g.fill();
      g.lineWidth = Math.max(3, size * 0.3); g.strokeStyle = 'rgba(20,0,20,0.9)'; g.strokeText(text, w / 2, h / 2);
      g.fillStyle = col; g.fillText(text, w / 2, h / 2);
      s = { cv, w, h, pw, ph }; this.txt.set(key, s); return s;
    }
    // 'popP': a big pop (20 px and up) on a dark rounded plate (6 px padding) so it reads on any zone
    const plate = kind === 'popP';
    const sg = kind === 'sign' || kind === 'signO';
    const w = sg ? tw + 26 : tw + Math.ceil(size * 0.7) + 6 + (plate ? 6 : 0), h = sg ? 32 : Math.ceil(size * (plate ? 1.3 : 1.7) + (plate ? 16 : 0));
    let cv = reuse;
    if (cv) { cv.width = w * K; cv.height = h * K; } else cv = mk(w * K, h * K);
    const g = cv.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (sg) {
      // 'signO': an opaque plate, a cream fill and the col stroke (the Fork's PICK A TUBE reads over anything)
      const op = kind === 'signO', rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
      g.fillStyle = 'rgba(0,0,0,0.3)'; rr(3, 3, w - 4, 28, 10); g.fill();
      g.fillStyle = op ? 'rgba(20,0,20,0.95)' : 'rgba(20,0,20,0.8)'; rr(1, 1, w - 4, 28, 10); g.fill();
      g.strokeStyle = col; g.lineWidth = 2; g.stroke();
      if (op) { g.lineWidth = 3; g.strokeStyle = '#2a0a24'; g.strokeText(text, (w - 2) / 2, 16); }
      g.fillStyle = op ? '#fff4f8' : col; g.fillText(text, (w - 2) / 2, 16);
    } else {
      const cx = w / 2, cy = h / 2;
      if (plate) {
        const pw = tw + 12 + size * 0.2, ph = size * 1.1 + 12, x0 = cx - pw / 2, y0 = cy - ph / 2, r = Math.min(12, ph / 2);
        g.fillStyle = 'rgba(20,2,18,0.65)'; g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + pw, y0, x0 + pw, y0 + ph, r); g.arcTo(x0 + pw, y0 + ph, x0, y0 + ph, r); g.arcTo(x0, y0 + ph, x0, y0, r); g.arcTo(x0, y0, x0 + pw, y0, r); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(30,0,30,0.55)'; g.fillText(text, cx + 1.5, cy + size * 0.14 + 1.5);
      // a 3 px #2a0a24 outline under the fill (the stroke is centred on the glyph edge: 6 px wide shows 3)
      g.lineWidth = Math.max(6, size * 0.32 + 2); g.strokeStyle = HZ_INK; g.strokeText(text, cx, cy);
      g.fillStyle = col; g.fillText(text, cx, cy);
      if (size >= 16) { g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.fillText(text, cx, cy - size * 0.06); g.globalAlpha = 1; }
    }
    s = { cv, w, h }; this.txt.set(key, s); return s;
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
    try { this.drawFrame(race, dt, ts); } finally { this.lastDrawMs = pf.now() - t0; }
  }
  drawFrame(race, dt, ts = 1) {
    const c = this.ctx, p = race.p, wdt = dt * ts; this.time += dt; this.frame++; this.race = race; this.ts = ts; this.bakes = 0;
    this.signBoxes.length = 0; this.labRN = 0; this.labelQ = true; this.labelN = 0; this.imgArea = 0;
    const beat = this.reduced ? 0 : clamp(+this.beat || 0, 0, 1);
    if (this.camY == null) this.resetRun();
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
    const ax = this.tDirT > 0 ? this.tAx : 1, ay = this.tDirT > 0 ? this.tAy : 1;
    const amp = this.reduced ? 14 * tr15 : 16 * Math.pow(this._trauma, 1.3);
    const ox = ax * amp * (0.6 * Math.sin(T * 9 * TAU) + 0.4 * Math.sin(T * 13 * TAU + 1.3));
    const oy = ay * amp * (0.6 * Math.sin(T * 13 * TAU + 2.1) + 0.4 * Math.sin(T * 9 * TAU + 0.4));
    const rot = this.reduced ? 0 : 0.014 * tr2 * (0.5 * Math.sin(T * 9 * TAU + 3.3) + 0.5 * Math.sin(T * 13 * TAU + 0.9));
    this.kvx += (-220 * this.kx - 18 * this.kvx) * dt; this.kvy += (-220 * this.ky - 18 * this.kvy) * dt;
    this.kx = clamp(this.kx + this.kvx * dt, -16, 16); this.ky = clamp(this.ky + this.kvy * dt, -16, 16);
    // zoom punch pivots on the player
    const zdt = frz ? dt * 0.15 : dt;
    this.zoomK *= Math.exp(-zdt * (this.zoomK < 0 ? 10 : 7)); if (Math.abs(this.zoomK) < 0.002 || this.reduced) this.zoomK = 0; const zk = 1 + this.zoomK;
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

    const zi = zoneIndex(p.y), zn = ZONES[zi + 1];
    let bt = 0; if (zn) bt = clamp((p.y - (ZSTART[zi + 1] - 1500)) / 1500, 0, 1);
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
    this.drawCoach(race, dt, wdt);
    this.drawPlayer(race, dt, wdt, beat);
    this.drawScrim(race);
    this.drawFx(race, dt, wdt);
    c.setTransform(this.worldM); this.drawYou(race);
    this.drawStealVig();
    // the speech bubble: laid out in drawAgents, drawn last of the world layers (over the scrim, the particles and the pops)
    c.setTransform(this.worldM); this.drawBubble();
    // speed lines when you are flying
    const fast = (p.dashT > 0 ? 1 : 0) + (p.frenzyT > 0 ? 0.7 : 0);
    if (fast && !race.drill) {
      const red = this.reduced, n = red ? 4 : this.dashAge < 0.15 && p.dashT > 0 ? 32 : 16, al = red ? 0.5 : 1;
      c.lineWidth = 1.6; c.lineCap = 'round';
      c.strokeStyle = p.frenzyT > 0 ? (red ? '#ffd75c' : HSL75[hueI(this.time * 500)]) : '#ffffff';
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
      c.drawImage(vr, -20, -20, VIEW_W + 40, this.H + 40);
    } else {
      const va = Math.min(1, 0.9 + 0.06 * beat), sides = this.q === 0;
      let vg;
      if (!zn || bt < 0.02 || (this.lite && bt < 0.5)) vg = this.zoneVig(zi, sides);
      else if (bt > 0.98) vg = this.zoneVig(zi + 1, sides);
      else vg = this.blendVig(zi, sides, bt);   // the crossfade: ONE pre-mixed vignette, not two full-screen draws
      c.globalAlpha = va; c.drawImage(vg, -20, -20, VIEW_W + 40, this.H + 40);
    }
    // a big combo break (25+) flashes the edges red-violet for 0.25 s (0.3 at most for reduced motion)
    if (this.breakVig > 0 && this.lite) this.breakVig = 0;
    if (this.breakVig > 0) { c.globalAlpha = clamp(this.breakVig / 0.25, 0, 1) * (this.reduced ? 0.3 : 0.8); c.drawImage(this.vignette()[2], -20, -20, VIEW_W + 40, this.H + 40); this.breakVig = Math.max(0, this.breakVig - dt); }
    c.globalAlpha = 1;
    // full-screen image layers this frame, in screens (the backdrop tile rows as drawn, plus the vignettes)
    if (!this.lite && !(ef < 0.25 && !race.over)) this.imgArea += (VIEW_W + 40) * (this.H + 40);
    this.imgScreens = this.imgArea / (VIEW_W * this.H);
    this.drawBanks(dt);
    this.drawVs(dt);
    if (this.desat > 0) {   // the combo break greys the world out for a moment (a plain wash: 'saturation' blending is slow on phones)
      c.fillStyle = `rgba(90,80,110,${(0.35 * Math.min(1.25, this.desat / 0.2)).toFixed(3)})`;
      c.fillRect(-20, -20, VIEW_W + 40, this.H + 40);
    }
    if (this._flash > 0.02) {
      const fc = colOf(this._fcol), cap = fc[0] > 1.6 * fc[1] ? 0.25 : 0.4;
      if (this.reduced) {   // reduced motion: a soft glow round the edges only, clear in the middle
        const g = c.createRadialGradient(VIEW_W / 2, this.H / 2, Math.min(VIEW_W, this.H) * 0.3, VIEW_W / 2, this.H / 2, Math.hypot(VIEW_W, this.H) * 0.55);
        g.addColorStop(0, css(fc, 0)); g.addColorStop(1, css(fc, 1));
        c.fillStyle = g; c.globalAlpha = Math.min(0.25, this._flash);
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
    const c = this.ctx, m = c.getTransform();
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
    // wall press (iPhones have no vibration, so this is the only feedback): the steer target clamped at the band's
    // edge (main.js clamps tx to it) with Kevin within 6 px of it bulges the tube wall 7 px outward over a 90 px
    // span on his y, squashes him 8% toward it and flicks 3 droplets off it (at most every 250 ms). The bulge holds
    // while he presses and springs back over 0.18 s (reduced motion: no overshoot, no droplets).
    this.wallT = Math.max(0, this.wallT - dt);
    const inp = race.input;
    let press = false;
    if (!race.demo && !race.over && !race.drill && !race.autopilot && inp && inp.tx != null) {
      const band = playBand(p.y, p.side), s = p.x <= band.l + 6 ? -1 : p.x >= band.r - 6 ? 1 : 0;
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
      if (!this.reduced && !race.over) for (const s of [-1, 1]) this.addP(3, p.x + s * 9, p.y + 12, s * (50 + Math.random() * 40), 50 + Math.random() * 40, 0.55, '#9ae2ff', 2.4, 220);
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
      this.confetti(p.x, p.y + 30, 28);
      this.gateTear(zi, p);
      if (this.reduced) { this.flash = 0.1; this.flashCol = css(this.wallC); }
      else if (this.time - this.lastFlashT >= 0.5) { this.gateFlash = 0.3; this.lastFlashT = this.time; }   // the same 0.5 s limiter as flash
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
    if (p.combo >= 3 && !race.drill) {
      this.emberT += wdt * (2 + p.combo / 5);
      while (this.emberT >= 1) {
        this.emberT -= 1;
        const hk = Math.min(p.combo, 50) / 50, ang = p.heading || 0;
        this.addP(0, p.x - Math.sin(ang) * 34 + (Math.random() - 0.5) * 8, p.y - 34, (Math.random() - 0.5) * 50, -30 - Math.random() * 40, 0.6 + Math.random() * 0.3, HEAT[Math.min(7, 3 + Math.round(hk * 4))], 1.4 + Math.random() * 1.4);
      }
    } else this.emberT = 0;
  }

  // the membrane tears: 10 to 14 shreds in the new wall colour fly off the gate line, plus 6 sparks in the zone's glows
  gateTear(zi, p) {
    const z = ZONES[zi]; if (!z) return;
    const wy = ZSTART[zi], side = wy >= FORK_Y0 ? (p.side || (this.race && this.race.eggSide) || 0) : 0, ch = channel(wy, side);
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
    if (!this.safeBack) { c.fillStyle = css(lerpC(deep, [0, 0, 10], da, SCR)); c.fillRect(-30, -30, VIEW_W + 60, this.H + 60); }
    // stage 1 and lite: one tile layer outside the middle of a blend (the next zone's alone past 85%)
    const cheap = this.lite || this.q === 0;
    if (zn && cheap && bt > 0.85) this.tileLayer(zi + 1, 1, 0.35, st);
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
    c.globalAlpha = w; c.strokeStyle = 'rgba(200,245,255,0.3)'; c.lineCap = 'round';
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
        const ch = channel(y, side);
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
    // and stroke reuses them, instead of re-walking the points per call (that was most of ~466 lineTo a frame)
    const P2 = typeof Path2D !== 'undefined';
    let TP = null, W0 = null, W9 = null;
    const tubePath = (g) => {
      for (let k = 0; k < np; k++) {
        const L = TL[k], R = TR[k], m = TN[k];
        g.moveTo(L[0], L[1]);
        for (let i = 2; i < m; i += 2) g.lineTo(L[i], L[i + 1]);
        for (let i = m - 2; i >= 0; i -= 2) g.lineTo(R[i], R[i + 1]);
        g.closePath();
      }
    };
    const wallPath = (g, dx) => { for (let k = 0; k < np; k++) { addPts(g, TL[k], TN[k], dx); addPts(g, TR[k], TN[k], -dx); } };
    const fillTube = () => { if (P2) c.fill(TP || (TP = new Path2D(), tubePath(TP), TP)); else { c.beginPath(); tubePath(c); c.fill(); } };
    // both walls of every tube in one path, so each stroke style is a single stroke call
    const walls = (dx) => {
      if (!P2) { c.beginPath(); wallPath(c, dx); c.stroke(); return; }
      if (dx === 0) { if (!W0) { W0 = new Path2D(); wallPath(W0, 0); } c.stroke(W0); }
      else { if (!W9) { W9 = new Path2D(); wallPath(W9, dx); } c.stroke(W9); }
    };
    // the tube gradient only depends on two colours: cache it, keyed on the colours quantised to steps of 4
    // (an integer key, 18 bits per colour: no strings or arrays per frame)
    const gk = (((deep[0] >> 2) << 12) | ((deep[1] >> 2) << 6) | (deep[2] >> 2)) * 262144 + (((lite[0] >> 2) << 12) | ((lite[1] >> 2) << 6) | (lite[2] >> 2));
    if (gk !== this.tubeGK || !this.tubeG || !this.wallSt) {
      const qd = [(deep[0] >> 2) << 2, (deep[1] >> 2) << 2, (deep[2] >> 2) << 2], ql = [(lite[0] >> 2) << 2, (lite[1] >> 2) << 2, (lite[2] >> 2) << 2];
      const g = c.createLinearGradient(0, 0, VIEW_W, 0);
      g.addColorStop(0, css(qd)); g.addColorStop(0.5, css(ql)); g.addColorStop(1, css(qd));
      this.tubeG = g; this.tubeGK = gk;
      this.wallSt = [css(wall, 0.12), css(wall, 0.22), css(wall, 1), css(deep, 0.55)];
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
        g.addColorStop(0, css(d, 0.35)); g.addColorStop(0.25, css(d, 0)); g.addColorStop(0.75, css(d, 0)); g.addColorStop(1, css(d, 0.35));
        this.gooEdgeG = g; this.gooEdgeK = gc;
      }
      c.globalAlpha = gooW; c.fillStyle = this.gooEdgeG; fillTube(); c.globalAlpha = 1;
    }
    // inside the tube: the zone's texture at a faster parallax, soft inner shadow, then the floating stuff
    c.save();
    // no anti-aliased path clip (slow on phones): the inner tile is a pattern fill of the tube path, and the
    // floating stuff is clipped to the tubes' bounding box (a cheap rectangle clip). Lite fills only the dominant
    // zone of a blend and a little fainter; full quality fills both (zi at 1 - bt, zi + 1 at bt).
    const base = this.camY * 0.6, oy = ((this.H + base) % TH + TH) % TH;
    const patFill = (k, al) => {
      if (al <= 0.01) return;
      const pat = this.tilePat(k);
      if (!pat) return;
      if (pat.setTransform && typeof DOMMatrix !== 'undefined') { const M = this.patM || (this.patM = new DOMMatrix([1 / TS, 0, 0, 1 / TS, -20, 0])); M.f = oy; pat.setTransform(M); }
      c.globalAlpha = al; c.fillStyle = pat; fillTube(); c.globalAlpha = 1;
    };
    if (this.lite || this.q === 0) {   // lite and stage 1: only the dominant zone of a blend (lite a little fainter)
      const k = this.bt < 0.5 || !ZONES[this.zi + 1] ? this.zi : this.zi + 1;
      patFill(k, this.innerA(k) * (this.lite ? 0.25 / 0.38 : 1));
    } else {
      patFill(this.zi, this.innerA(this.zi) * (1 - this.bt));
      if (ZONES[this.zi + 1]) patFill(this.zi + 1, this.innerA(this.zi + 1) * this.bt);
    }
    let lx = VIEW_W, rx = 0;
    for (let k2 = 0; k2 < np; k2++) for (let i = 0; i < TN[k2]; i += 2) { if (TL[k2][i] < lx) lx = TL[k2][i]; if (TR[k2][i] > rx) rx = TR[k2][i]; }
    c.beginPath(); c.rect(lx - 4, -40, Math.max(0, rx - lx + 8), this.H + 80); c.clip();
    this.drawSun(race, fillTube);
    this.drawPieces();
    c.lineJoin = 'round'; c.lineCap = 'butt';
    if (!this.lite && this.q !== 0) { c.strokeStyle = WS[3]; c.lineWidth = 34; walls(0); }   // stage 1: baked into its vignette
    c.strokeStyle = WS[0]; c.lineWidth = 8; walls(9);
    this.drawNear(this.zi, 1 - this.bt * 0.999);
    if (ZONES[this.zi + 1] && this.bt > 0.02) this.drawNear(this.zi + 1, this.bt);
    if (this.gateFlash > 0 && !this.reduced) {
      const red = wall[0] > 1.6 * wall[1];
      c.fillStyle = css(wall, Math.min(red ? 0.25 : 0.35, (this.gateFlash / 0.3) * 0.35));
      fillTube();
    }
    c.restore();
    this.drawForkSplit(race, deep);
    // each zone's own wall (blended across the gate), then glossy rims and waving cilia
    const zA = ZONES[this.zi].id, zB = ZONES[this.zi + 1] ? ZONES[this.zi + 1].id : null, bt = zB ? this.bt : 0;
    this.drawWallStyle(race, zA, 1 - bt, wall);
    if (zB && bt > 0.02) this.drawWallStyle(race, zB, bt, wall);
    const rapW = (zA === 'rapids' ? 1 - bt : 0) + (zB === 'rapids' ? bt : 0);
    c.lineJoin = 'round';
    if (!this.lite) { c.strokeStyle = WS[1]; c.lineWidth = 12; walls(0); }
    c.strokeStyle = WS[2]; c.lineWidth = 2.6; walls(0);
    if (this.fwGF === this.frame) {   // the Fork's wrong tube: its wall drained of colour (drawForkSplit kept the points)
      const G = this._fwG; c.globalAlpha = 0.8; c.strokeStyle = '#8a8a9c'; c.lineWidth = 3.2; c.beginPath();
      for (let k = 0; k < 2; k++) { c.moveTo(G[k], G[2]); for (let i = 3; i < G.length; i += 3) c.lineTo(G[i + k], G[i + 2]); }
      c.stroke(); c.globalAlpha = 1;
    }
    this.drawDent(wall);
    if (rapW <= 0.98) {   // the Rapids comb their own long cilia
      c.globalAlpha = 1 - rapW;
      c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath();
      for (let k = 0; k < np; k++) {
        const L = TL[k], R = TR[k], m = TN[k];
        for (let i = 0; i < m; i += 2) {
          const sw = Math.sin(t * 6 + i * 0.45) * 5, sw2 = Math.sin(t * 6 + i * 0.45 + 1.2) * 4;
          c.moveTo(L[i], L[i + 1]); c.quadraticCurveTo(L[i] + 5, L[i + 1] + sw2, L[i] + 9, L[i + 1] + sw);
          c.moveTo(R[i], R[i + 1]); c.quadraticCurveTo(R[i] - 5, R[i + 1] + sw2, R[i] - 9, R[i + 1] + sw);
        }
      }
      c.stroke(); c.globalAlpha = 1;
    }
    // the far tube past the Fork fades into the flesh instead of ending in a hard flat edge
    if (this.cutT === this.frame && this.cutY > -20 && this.cutY < this.H + 20) {
      const dc = lerpC(deep, [0, 0, 10], this.dimA || 0, SCR), g = c.createLinearGradient(0, this.cutY - 2, 0, this.cutY + 120);
      g.addColorStop(0, css(dc, 1)); g.addColorStop(1, css(dc, 0));
      c.fillStyle = g; c.fillRect(this.cutL - 8, this.cutY - 2, this.cutR - this.cutL + 16, 122);
    }
    // a fleshy gate at every zone threshold
    for (let i = 1; i < ZONES.length; i++) this.drawZoneGate(i, race);
    // the dead end of the wrong tube
    const ps = race.p.side;
    if (ps && ps !== race.eggSide) {
      const y = this.sy(DEAD_Y), ch = channel(DEAD_Y, ps);
      if (y > -80 && y < this.H + 80) {
        // the tube's outline already stops here; the floaters (clipped to a rectangle) are painted over with the
        // outside itself (the same backdrop layers, clipped to the dead end's column), so it reads as solid flesh
        c.save(); c.beginPath(); c.rect(ch.c - ch.h - 24, Math.max(-40, y - this.H - 80), ch.h * 2 + 48, Math.max(0, y + 1 - Math.max(-40, y - this.H - 80))); c.clip();
        this.drawBack(deep, this.zi, this.bt); c.restore();
        // a fleshy cap with a shadow pooling under it: this tube really does just stop
        if (!this.deadG) { this.deadG = c.createLinearGradient(0, 0, 0, 140); this.deadG.addColorStop(0, 'rgba(0,0,0,0.38)'); this.deadG.addColorStop(1, 'rgba(0,0,0,0)'); }
        c.save(); c.translate(0, y); c.fillStyle = this.deadG; c.fillRect(ch.c - ch.h, 0, ch.h * 2, 140); c.restore();
        c.fillStyle = css(wall, 0.35); c.beginPath(); c.moveTo(ch.c - ch.h, y - 6); c.quadraticCurveTo(ch.c, y + 26, ch.c + ch.h, y - 6); c.quadraticCurveTo(ch.c, y + 40, ch.c - ch.h, y - 6); c.fill();
        c.strokeStyle = css(wall); c.lineWidth = 3; c.beginPath(); c.moveTo(ch.c - ch.h, y); c.quadraticCurveTo(ch.c, y + 30, ch.c + ch.h, y); c.stroke();
        // a tumbleweed rolls past. There is nothing here.
        const tx = ch.c + Math.sin(t * 0.8) * ch.h * 0.6, ty = y + 40;
        c.save(); c.translate(tx, ty); c.rotate(t * 3); c.strokeStyle = 'rgba(220,170,120,0.8)'; c.lineWidth = 1.5; c.beginPath();
        for (let i = 0; i < 7; i++) { const a = i * 0.9; c.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); c.lineTo(Math.cos(a + 2.6) * 9, Math.sin(a + 2.6) * 9); }
        c.stroke(); c.restore();
        this.sign(ch.c, y + 80, 'NO EGG HERE', '#ff5c7a');
      }
    }
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
    c.strokeStyle = css(wall); c.lineWidth = 2.6; c.lineCap = 'round';
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
    const ch = channel(y, side), t = this.time;
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
    const c = this.ctx, race = this.race, t = this.time, SP = 420, base = this.camY * 0.45, m = c.getTransform();
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
    const xs = this._dvL || (this._dvL = []), xr = this._dvR || (this._dvR = []), yv = this._dvY || (this._dvY = []);
    xs.length = 0; xr.length = 0; yv.length = 0;
    for (let y = y0; y <= y1 + 21; y += 22) {
      const yy = Math.min(y, y1), l = this.wallX(yy, -1, 1), r = this.wallX(yy, 1, -1);
      if (r - l < 1) { if (xs.length) break; continue; }
      xs.push(l); xr.push(r); yv.push(this.sy(yy));
      if (yy >= y1) break;
    }
    if (xs.length >= 2) {
      this.forkDivPath(c, xs, xr, yv);
      // a cached -1..1 gradient (dark at the edges, amethyst in the middle), stretched over the widest row:
      // the path is already built, so the transform set here only maps the gradient
      let lo = xs[0], hi = xr[0]; for (let i = 1; i < xs.length; i++) { if (xs[i] < lo) lo = xs[i]; if (xr[i] > hi) hi = xr[i]; }
      if (!this.forkG) {
        const dk = lerpC(rgb(ZONES[FORK_I_R].col[0]), [0, 0, 0], 0.6), g = c.createLinearGradient(-1, 0, 1, 0);
        g.addColorStop(0, css(dk, 0.95)); g.addColorStop(0.5, css(lerpC(dk, rgb(FZ.col[1]), 0.5), 0.95)); g.addColorStop(1, css(dk, 0.95));
        this.forkG = g;
      }
      const m = c.getTransform(), hw = Math.max(1, (hi - lo) / 2);
      setXf(c, m, (lo + hi) / 2, 0, 0, hw, 1); c.fillStyle = this.forkG; c.fill(); c.setTransform(m);
      // faint veins wandering up the divider
      c.strokeStyle = rim; c.lineWidth = 2; c.globalAlpha = 0.18; c.lineCap = 'round'; c.beginPath();
      for (let k = 0; k < 4; k++) {
        const u = -0.6 + 0.4 * k;
        for (let i = 0; i < xs.length; i++) {
          const mid = (xs[i] + xr[i]) / 2, half = (xr[i] - xs[i]) / 2, wy = this.camY + H - yv[i];
          const vx = mid + u * half * 0.8 + (this.reduced ? 0 : Math.sin(wy / 55 + t * 0.8 + k * 1.9) * Math.min(5, half * 0.15));
          i ? c.lineTo(vx, yv[i]) : c.moveTo(vx, yv[i]);
        }
      }
      c.stroke(); c.globalAlpha = 1;
      this.forkDivPath(c, xs, xr, yv); c.lineJoin = 'round'; c.strokeStyle = rim; c.lineWidth = 7; c.globalAlpha = 0.18 + 0.1 * pul; c.stroke();
      c.lineWidth = 2; c.globalAlpha = 0.75; c.stroke(); c.globalAlpha = 1;
      // a signpost on the divider every ~900 units (honest only with a good nose)
      for (let wy = Math.ceil((y0 + 300) / 900) * 900; wy <= y1; wy += 900) {
        const l = this.wallX(wy, -1, 1), r = this.wallX(wy, 1, -1);
        if (r - l < 60) continue;   // (the plate may overhang a narrow divider, like a real signpost)
        const j = Math.round(wy / 900), txt = nose ? (es > 0 ? 'EGG THIS WAY →' : '← EGG THIS WAY') : j % 2 ? '??? →' : '← MAYBE';
        this.sign((l + r) / 2, this.sy(wy), txt, '#ff9be0');
      }
    }
    // the scent river in the egg's tube
    const st = 90, ry0 = Math.ceil(y0 / st) * st;
    for (let y = ry0; y <= Math.min(FORK_END + 600, this.camY + H + 60); y += st) {
      const ch = channel(y, es), k = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3 - y / 140);
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
        const PL = this._fwL || (this._fwL = []); PL.length = 0;
        for (let y = tw0; ; y += stp) { const yy = Math.min(y, top); PL.push(this.wallX(yy, sd, -1), this.wallX(yy, sd, 1), this.sy(yy)); if (yy >= top) break; }
        c.beginPath(); c.moveTo(PL[0], PL[2]);
        for (let i = 3; i < PL.length; i += 3) c.lineTo(PL[i], PL[i + 2]);
        for (let i = PL.length - 3; i >= 0; i -= 3) c.lineTo(PL[i + 1], PL[i + 2]);
        c.closePath();
        if (egg) { c.fillStyle = 'rgba(255,176,96,1)'; c.globalAlpha = (race.muts && race.muts.nose ? 0.14 : 0.08) * warmK; c.fill(); }
        else {
          c.fillStyle = 'rgba(40,52,96,1)'; c.globalAlpha = 0.3; c.fill();
          const G = this._fwG || (this._fwG = []); G.length = 0; for (let i = 0; i < PL.length; i++) G.push(PL[i]);   // (greyed after the walls)
          this.fwGF = this.frame;
        }
        c.globalAlpha = 1;
      }
    }
    // the wrong tube's mouth breathes out a cold blue-grey haze
    if (this.sides(race).length > 1) {
      const wy = FORK_Y0 + 260, sy = this.sy(wy);
      if (sy > -200 && sy < H + 200) { const ch = channel(wy, -es); this.dglow('#788cc8', ch.c, sy, ch.h * 1.15, 0.25); }
    }
  }
  // the divider's outline (apex, left edge up, right edge down), built into the context's current path
  forkDivPath(c, xs, xr, yv) {
    c.beginPath(); c.moveTo((xs[0] + xr[0]) / 2, yv[0] + 6);
    for (let i = 0; i < xs.length; i++) c.lineTo(xs[i], yv[i]);
    for (let i = xs.length - 1; i >= 0; i--) c.lineTo(xr[i], yv[i]);
    c.closePath();
  }
  // PICK A TUBE: pinned in screen space at padTop + 140 while its spot in the world is on screen (never on the bar).
  // Drawn after every hazard and warning, on an opaque plate (cream text, pink rim), and never under 0.85 alpha
  // while its spot is in the middle 70% of the screen
  drawForkSign() {
    const fy = this.sy(FORK_Y0 - 500);
    if (!(fy > -60 && fy < this.H + 60)) return;
    let al = clamp(Math.min((fy + 60) / 120, (this.H + 60 - fy) / 120), 0, 1);
    if (fy >= this.H * 0.15 && fy <= this.H * 0.85) al = Math.max(0.85, al);
    const c = this.ctx; c.globalAlpha = al;
    this.sign(VIEW_W / 2, Math.max((this.padW || 0) + 140, this.hudB() + 12 * this.cssK + 15), '← PICK A TUBE →', '#ff9be0', 'signO');
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
  // the HUD fade: pickups, the crowd and particles passing under the top HUD ramp from 1.0 (hudB + 30) down to 0.25
  // (hudB - 40), so the HUD band stays legible; bosses and threat chevrons never fade. this.hfB is set per pass
  // (null: no fade, the attract demo)
  hudFade(sy) {
    const hb = this.hfB;
    if (hb == null) return 1;
    const v = 0.25 + 0.75 * (sy - (hb - 40)) / 70;
    return v >= 1 ? 1 : v <= 0.25 ? 0.25 : v;
  }
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
  // per-zone wall dressing, drawn at alpha a (two calls blend across a zone gate). Plain loops over the module's SGN
  // and the constant sides() arrays: no closures, arrays or strings a frame once its colours are cached
  drawWallStyle(race, id, a, wall) {
    if (a <= 0.02) return;
    const c = this.ctx, t = this.time, y0 = this.camY - 40, y1 = this.camY + this.H + 40, ps = race.p.side;
    const sides = this.sides(race), ns = sides.length, red = this.reduced;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = a;
    if (id === 'launch') {         // muscle ribs every 36 px, squeezing on the beat
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
    } else if (id === 'acid') {    // pitted, corroded wall and a few green drips sliding down it
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
    } else if (id === 'goo') {     // a lumpy, milky rim and a few strands sagging off it
      // wet: the rim is a screen-height gradient in the wall colour (0.55 at the top, 0.30 at the bottom), and every
      // lump (one each 107 px, the crest of its sin(y / 17)) carries a white specular crescent, jiggling like jelly
      if (this.wsGooK !== wallKey(wall) || this.wsGooH !== this.H) {
        this.wsGooK = wallKey(wall); this.wsGooH = this.H; this.wsGooB = css(lerpC(wall, WHITE, 0.5, SCR), 0.5); this.wsGooC = css(lerpC(wall, WHITE, 0.5, SCR), 0.6);
        const gg = c.createLinearGradient(0, 0, 0, this.H); gg.addColorStop(0, css(wall, 0.55)); gg.addColorStop(1, css(wall, 0.3)); this.wsGooA = gg;
      }
      c.strokeStyle = this.wsGooA; c.lineWidth = 6;
      for (let si = 0; si < ns; si++) {
        const side = sides[si], ye = this.wsEnd(side, ps, y1);
        for (let k = 0; k < 2; k++) {
          const s = SGN[k]; let first = true;
          c.beginPath();
          for (let y = Math.floor(y0 / 11) * 11; y <= ye; y += 11) { const x = this.wallX(y, side, s) - s * (5 + Math.sin(y / 17) * 6), sy = this.sy(y); if (first) { c.moveTo(x, sy); first = false; } else c.lineTo(x, sy); }
          if (!first) c.stroke();
        }
      }
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
    } else if (id === 'sea') {     // rugae: deep soft folds along the wall, shaded on the inside
      // the Sea is wider than the screen: an off-screen wall is pinned to the screen edge so the folds always frame it
      const ys = this._ys || (this._ys = []), xs = this._xs || (this._xs = []);
      if (this.wsSeaK !== wallKey(wall)) { this.wsSeaK = wallKey(wall); this.wsSeaA = css(wall, 0.35); }
      for (let si = 0; si < ns; si++) {
        const side = sides[si], ye = this.wsEnd(side, ps, y1);
        for (let k = 0; k < 2; k++) {
          const s = SGN[k];
          ys.length = 0; xs.length = 0;
          for (let y = Math.floor(y0 / 14) * 14; y <= ye; y += 14) {
            const wx = this.wallX(y, side, s);
            ys.push(y); xs.push(s < 0 ? Math.max(6, wx) : Math.min(VIEW_W - 6, wx));
          }
          if (ys.length < 2) continue;
          c.beginPath();
          for (let i = 0; i < ys.length; i++) { const yy = this.sy(ys[i]); i ? c.lineTo(xs[i], yy) : c.moveTo(xs[i], yy); }
          for (let i = ys.length - 1; i >= 0; i--) c.lineTo(xs[i] - s * (4 + seaDep(ys[i])), this.sy(ys[i]));
          c.closePath(); c.fillStyle = 'rgba(70,0,12,0.45)'; c.fill();
          c.strokeStyle = this.wsSeaA; c.lineWidth = 2; c.beginPath();
          for (let i = 0; i < ys.length; i++) { const x = xs[i] - s * (4 + seaDep(ys[i])), yy = this.sy(ys[i]); i ? c.lineTo(x, yy) : c.moveTo(x, yy); }
          c.stroke();
        }
      }
    } else if (id === 'fork') {    // cilia runway lights: dots 9 px apart (14 on lite) down both walls; pulses run up the right tube on the beat
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
    } else if (id === 'rapids') {  // long combed cilia, raked downstream by the current and waving fast
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
    } else if (id === 'egg') {     // a soft golden glow, a pearly rim band, a gold line and corona bumps bobbing on the beat
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
    c.globalAlpha = 1;
  }
  // two fleshy pillars and a sagging membrane in the new zone's wall colour; torn once you are through
  drawZoneGate(zi, race) {
    const wy = ZSTART[zi], y = this.sy(wy);
    if (y < -90 || y > this.H + 90) return;
    const c = this.ctx, t = this.time, side = wy >= FORK_Y0 ? (race.p.side || race.eggSide) : 0, ch = channel(wy, side);
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
      for (const s of [-1, 1]) {
        const bx = s < 0 ? L : R, fl = Math.sin(t * 5 + s) * 6;
        c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx - s * 18, y + 14 + fl, bx - s * 10, y + 30 + fl); c.stroke();
      }
    }
    for (const s of [-1, 1]) {
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
      for (const s of [-1, 1]) {
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
      if (this.gdGooK !== wk) { const w0 = rgb(wk); this.gdGooK = wk; this.gdGooA = css(w0, 0.55); this.gdGooB = css(w0, 0.3); }
      for (let i = 1; i < 5; i++) {
        const u = i / 5, x = L + (R - L) * u, top = y + sag * 2 * 2 * u * (1 - u), len = 12 + 10 * h1(i * 3.7) + (red ? 0 : Math.sin(t * 1.6 + i) * 5);
        const wb = red ? 1 : 1 + 0.04 * Math.sin(t * 2.2 + i), gr = c.createLinearGradient(0, top, 0, top + len + 6);
        gr.addColorStop(0, this.gdGooA); gr.addColorStop(1, this.gdGooB);
        c.strokeStyle = gr; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x, top); c.quadraticCurveTo(x + 2, top + len * 0.6, x, top + len); c.stroke();
        c.fillStyle = gr; c.beginPath(); c.ellipse(x, top + len + 3, 4 * wb, 4, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(42,26,16,0.45)'; c.lineWidth = 1; c.stroke();
        gooShine(c, x, top + len + 3, 4, wb);
      }
    } else if (id === 'sea') {    // puffy lips round each pillar top
      for (const s of [-1, 1]) {
        const bx = s < 0 ? L : R;
        c.fillStyle = '#c2213f'; c.beginPath(); c.ellipse(bx, y - 26, 16, 7, 0, 0, TAU); c.fill();
        c.fillStyle = '#ff9aa8'; c.beginPath(); c.ellipse(bx, y - 28, 12, 3.4, 0, 0, TAU); c.fill();
        c.strokeStyle = '#5a0018'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(bx - 12, y - 26); c.quadraticCurveTo(bx, y - 23, bx + 12, y - 26); c.stroke();
      }
    } else if (id === 'fork') {   // an arch of runway lights from pillar to pillar, a light chasing across it
      const ry = 46, n = 17, hw = (R - L) / 2, cc = colOf(col);
      c.strokeStyle = css(cc, 0.3); c.lineWidth = 2; c.beginPath(); c.ellipse(cx, y - 26, hw, ry, 0, Math.PI, TAU); c.stroke();
      const lead = red ? -1 : Math.floor((t * 9) % (n + 4));
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * i / n, on = lead >= 0 && Math.abs(i - lead) <= 1, r = on ? 3 : 1.8;
        c.fillStyle = on ? '#ffffff' : css(lerpC(cc, WHITE, 0.5, SCR), 0.7); c.beginPath(); c.arc(cx - Math.cos(a) * hw, y - 26 - Math.sin(a) * ry, r, 0, TAU); c.fill();
      }
    } else if (id === 'rapids') { // river rocks at the pillar feet, with foam
      for (const s of [-1, 1]) {
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
  sign(x, y, text, col, kind = 'sign') {
    const s = this.text(text, col, 15, kind), b = this.reduced ? 0 : Math.sin(this.time * 3) * 2;
    x = this.labX(x, s.w);
    const top = this.clearTop(y - 15 + b, s.h, x, s.w);
    if (top == null) return false;
    this.signBoxes.push(x, top, s.w, s.h);
    this.ctx.drawImage(s.cv, x - s.w / 2, top, s.w, s.h);
    return true;
  }
  rrect(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // things floating in the fluid of the tube, one look per zone (drawn inside the tube clip)
  drawNear(zi, a) {
    if (a <= 0.01) return;
    const c = this.ctx, z = ZONES[zi], id = z.id, t = this.time, NT = this.H + 160, cam = this.camY, Lf = this.lite ? 0.5 : 1;
    // during a blend each zone's counts shrink with its weight (never under 35%), so two zones cost about one
    const Bk = Math.max(0.35, Math.min(1, a)), N = (n) => Math.max(1, Math.round(n * Lf * Bk)), NB = (n) => Math.max(1, Math.round(n * Bk));
    const pos = (i, par, drift) => {
      const u = ((h1(i * 3.1 + zi) * NT - cam * par - drift * t) % NT + NT) % NT;
      return this.H + 80 - u;
    };
    const X = (i) => h1(i * 7.7 + zi * 13) * VIEW_W;
    c.globalAlpha = a;
    if (id === 'launch') {
      // peristalsis: pink muscle rings squeezing to the beat
      const f = (z.beat || 96) / 60, n = NB(this.lite ? 3 : 7), bt = this.reduced ? 0 : clamp(+this.beat || 0, 0, 1);
      // a warm pink glow low in the tube, breathing with the beat
      this.dglow('#ff9ac0', VIEW_W / 2, this.H * 0.85, 240, a * (0.12 + 0.06 * bt));
      const ringAt = (y, k, ga) => {
        const wy = cam + this.H - y, ch = channel(wy, 0), ry = 14 + 6 * k;
        c.globalAlpha = a * ga; c.fillStyle = 'rgba(255,120,170,0.05)'; c.beginPath(); c.ellipse(ch.c, y, ch.h * 0.98, ry, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,140,190,0.12)'; c.lineWidth = 10; c.stroke();   // the halo
        c.globalAlpha = (0.28 + 0.24 * k) * a * ga; c.strokeStyle = 'rgb(255,140,190)'; c.lineWidth = 3; c.stroke();
        c.globalAlpha = a * ga; c.strokeStyle = 'rgba(255,220,235,0.12)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(ch.c, y - 2, ch.h * 0.9, ry * 0.8, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      };
      for (let i = 0; i < n; i++) ringAt(pos(i + 60, 1, 0), this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * f * TAU - i * 0.9), 1);
      // one ring sweeps down the screen on every beat (a squeeze pushing the swimmers along)
      if (!this.reduced) { const u = (t * f) % 1; ringAt(-30 + u * (this.H + 60), 1 - u, Math.sin(u * Math.PI)); }
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
    } else if (id === 'fork') {
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
      for (let i = 0; i < N(8); i++) this.dglow('#788cc8', X(i) + Math.sin(t * 0.7 + i) * 12, pos(i, 0.85, -10), 18 + h1(i) * 26, a * 0.16);
      for (let i = 20; i < 20 + N(12); i++) {
        const y = pos(i, 0.95, 26 + h1(i) * 20), up = (this.H - y) / this.H;
        const x = X(i) + es * up * 70 + Math.sin(t * 1.3 + i) * 8;
        c.globalAlpha = a * (0.25 + 0.25 * Math.sin(t * 2 + i)); c.fillStyle = '#ff9be0';
        c.save(); c.translate(x, y); c.rotate(es * 0.35 + Math.sin(t + i) * 0.15); heart(c, 0, 0, 3 + h1(i + 1) * 4); c.restore();
      }
      c.globalAlpha = a; c.fillStyle = this.forkNF; c.beginPath();
      for (let i = 40; i < 40 + N(24); i++) { const x = X(i) + Math.sin(t + i) * 6, y = pos(i, 1, 12), r = 0.7 + h1(i + 0.3) * 1.8; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.fill();
    } else if (id === 'egg') {
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
    } else if (id === 'acid') {
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
        const SL = this.H + 500, sy = this.H + 250 - (((this.reduced ? 0 : t * 50) + cam * 0.6) % SL + SL) % SL, m0 = c.getTransform();
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
      }
      const n1 = 4 + N(30);
      c.globalAlpha = a; c.strokeStyle = 'rgba(200,255,140,0.45)'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 4; i < n1; i++) { const x = X(i) + Math.sin(t * 2 + i) * 5, y = pos(i, 1, -40 - h1(i) * 50), r = 1.5 + h1(i + 0.7) * 4.5; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath();
      for (let i = 4; i < n1; i++) { const x = X(i) + Math.sin(t * 2 + i) * 5, y = pos(i, 1, -40 - h1(i) * 50), r = 1.5 + h1(i + 0.7) * 4.5; c.moveTo(x - r * 0.3, y - r * 0.35); c.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU); }
      c.fill();
    } else if (id === 'goo') {
      // an oil-slick sheen: 3 wide diagonal bands (about 20 degrees) drifting at parallax 0.4, cycling through the
      // hues at 0.06 (full quality only; not on lite or for reduced motion)
      if (this.q === 1 && !this.lite && !this.reduced) {
        const m0 = c.getTransform(), SL = this.H + 400;
        for (let i = 0; i < 3; i++) {
          const w = 60 + 30 * h1(i * 5.1 + 2), sy = this.H + 200 - ((h1(i * 2.7 + 11) * SL - cam * 0.4 - t * 6) % SL + SL) % SL;
          setXf(c, m0, VIEW_W * (0.2 + 0.3 * i), sy, -0.35, 1, 1);
          c.globalAlpha = a * (0.05 + 0.02 * h1(i + 4.4)); c.fillStyle = HSL75[hueI(t * 40 + i * 120)];
          c.fillRect(-VIEW_W, -w / 2, VIEW_W * 2, w);
        }
        c.setTransform(m0); c.globalAlpha = a;
      }
      // everything moves slowly here (0.4x): mucus lenses sagging past, then thick glossy strands
      for (let i = 9; i < 9 + N(6); i++) this.dglow('#dfe6ff', X(i), pos(i, 0.35, 0), 30 + h1(i) * 20, a * 0.18);
      if (this.gooLensK !== z.wall) { this.gooLensK = z.wall; this.gooLensF = css(lerpC(rgb(z.wall), rgb('#e9f7c8'), 0.45), 0.2); }   // a pale lime mucus, apart from the periwinkle floor
      const lensF = this.gooLensF;
      for (let i = 30; i < 30 + N(7); i++) {
        const x = X(i), y = pos(i, 0.4, 3), r = 30 + h1(i + 0.3) * 30, sag = this.reduced ? 1 : 1 + 0.08 * Math.sin(t * 0.9 + i * 1.7);
        c.save(); c.translate(x, y); c.scale(1, sag);
        c.fillStyle = lensF; c.beginPath(); c.ellipse(0, 0, r, r * 0.62, 0, 0, TAU); c.fill();
        if (!this.lite) {   // a soap-film rim: 2 px of cycling rainbow at 0.35 (reduced motion: frozen on one hue at 0.25)
          if (this.reduced) { c.globalAlpha = a * 0.25; c.strokeStyle = HSL65[0]; } else { c.globalAlpha = a * 0.35; c.strokeStyle = HSL75[hueI(t * 60 + i * 47)]; }
          c.lineWidth = 2; c.stroke(); c.globalAlpha = a;
        }
        c.strokeStyle = 'rgba(240,244,255,0.18)'; c.lineWidth = 1.2; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath(); c.ellipse(0, 0, r * 0.78, r * 0.44, 0, 3.55, 4.75); c.stroke();
        c.restore();
      }
      c.lineCap = 'round';
      for (let i = 0; i < N(9); i++) {
        const x1 = X(i) - 60, x2 = x1 + 80 + h1(i + 2) * 140, y = pos(i, 0.36, 0), sag = 18 + 14 * Math.sin(t * 0.6 + i), ye = y + h1(i + 9) * 20 - 10;
        c.strokeStyle = 'rgba(233,247,200,0.45)'; c.lineWidth = 2 + h1(i + 5) * 3; c.beginPath(); c.moveTo(x1, y); c.quadraticCurveTo((x1 + x2) / 2, y + sag * 2, x2, ye); c.stroke();
        // the highlight sits on a 1 px lavender under-stroke, so the drool reads on the pale periwinkle
        c.strokeStyle = '#c9b8ff'; c.beginPath(); c.moveTo(x1, y); c.quadraticCurveTo((x1 + x2) / 2, y + sag * 2 - 0.5, x2, ye); c.lineWidth = 1; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.moveTo(x1, y - 1); c.quadraticCurveTo((x1 + x2) / 2, y + sag * 2 - 1.5, x2, ye - 1); c.stroke();
        c.fillStyle = 'rgba(233,247,200,0.45)'; c.beginPath(); c.arc((x1 + x2) / 2, y + sag + 3 + (t * 8 + i * 9) % 14, 2.2, 0, TAU); c.fill();
      }
    } else if (id === 'sea') {
      // slow swell bands, then one or two huge translucent cell clusters drifting far below
      // a caustic light net at two depths, drifting slowly
      const net = this.causticSpr(CAUS_COL);
      {   // the caustic net (parallax 0.5) at 0.18, and a second, bigger one nearer (parallax 0.85, 1.6x, turned 0.3 rad)
        // at 0.11. Light from above: both fade out down the screen (full in the top 35%, gone by 75%), drawn in 64 px
        // slices so the fade has no visible steps; alternate rows shift 128 px so the net never reads as wallpaper
        const H = this.H, fall = (sy) => clamp((0.75 - sy / H) / 0.4, 0, 1);
        const u1 = cam * 0.5 + t * 4, k1 = Math.floor(u1 / 256), oy = u1 - k1 * 256, ox = ((t * 6) % 256 + 256) % 256;
        for (let r = 0, yy = oy - 256; yy < H * 0.75; r++, yy += 256) {
          const sh = ((r - k1) & 1) ? 128 : 0;
          for (let j = 0; j < 4; j++) {
            const y0 = yy + j * 64, f = fall(y0 + 32);
            if (f <= 0 || y0 + 64 < 0) continue;
            c.globalAlpha = a * 0.18 * f;
            for (let xx = -ox - sh; xx < VIEW_W; xx += 256) c.drawImage(net, 0, j * 64, 256, 64, xx, y0, 256, 64);
          }
        }
        if (this.q === 1 && !this.lite) {
          const S2 = 256 * 1.6, u2 = cam * 0.85 + t * 7, k2 = Math.floor(u2 / S2), oy2 = u2 - k2 * S2, ox2 = ((-t * 5) % S2 + S2) % S2, m0 = c.getTransform();
          const rot = 0.3, cs = Math.cos(rot), sn = Math.sin(rot);
          setXf(c, m0, VIEW_W / 2, H / 2, rot, 1, 1);   // a frame turned round the screen centre; the net tiles in it
          const R = Math.hypot(VIEW_W, H) / 2 + 8;
          for (let r = -Math.ceil(R / S2) - 1, yy = oy2 + r * S2; yy < R; r++, yy += S2) {
            if (yy + S2 < -R) continue;   // (r - k2: the row's own index, so its half-tile shift scrolls with it)
            const sh = ((r - k2) & 1) ? S2 / 2 : 0;
            for (let j = 0; j < 4; j++) {
              const y0 = yy + j * S2 / 4, ym = y0 + S2 / 8, f = fall(H / 2 + ym * cs);   // the slice's screen y at the centre line
              if (f <= 0) continue;
              c.globalAlpha = a * 0.11 * f;
              for (let xx = -R - ((ox2 + sh) % S2); xx < R; xx += S2) {
                if (H / 2 + sn * xx + cs * y0 > H * 0.85) continue;   // its top-left corner (the highest) is past the fade
                c.drawImage(net, 0, j * 64, 256, 64, xx, y0, S2, S2 / 4);
              }
            }
          }
          c.setTransform(m0);
        }
        // 3 or 4 soft god rays fanning down from the top edge, swaying at 0.15 Hz (not on lite or for reduced motion)
        if (!this.lite && !this.reduced) {
          if (!this.seaRayG || this.seaRayH !== H) {
            this.seaRayH = H; this.seaRayG = c.createLinearGradient(0, 0, 0, H * 0.8);
            this.seaRayG.addColorStop(0, 'rgba(255,176,160,1)'); this.seaRayG.addColorStop(1, 'rgba(255,176,160,0)');
          }
          const m0 = c.getTransform();
          c.fillStyle = this.seaRayG;
          for (let i = 0; i < 4; i++) {
            const w = 140 + 80 * h1(i * 3.3 + 7), sw = Math.sin(t * 0.15 * TAU + i * 1.9) * 0.12;
            setXf(c, m0, VIEW_W * (0.12 + 0.26 * i), -20, (i - 1.5) * 0.12 + sw, 1, 1);
            c.globalAlpha = a * 0.13; c.beginPath(); c.moveTo(-w * 0.3, 0); c.lineTo(w * 0.3, 0); c.lineTo(w * 0.5, H * 0.8); c.lineTo(-w * 0.5, H * 0.8); c.closePath(); c.fill();
          }
          c.setTransform(m0);
        }
        c.globalAlpha = a;
      }
      // (its light from above is baked into the Sea's zone vignette, zoneVig)
      if (this.q === 1 && !this.lite) {   // four slow swell bands (full quality only)
        c.globalAlpha = a * 0.12;
        c.lineCap = 'round'; c.lineWidth = 56; c.strokeStyle = '#ff8a9c';
        for (let i = 0; i < NB(4); i++) {
          const y = pos(i + 200, 0.7, 8), ph = (this.reduced ? 0 : t * 0.5) + i * 1.7;   // (frozen at t = 0 for reduced motion)
          c.beginPath(); c.moveTo(-20, y);
          c.bezierCurveTo(VIEW_W * 0.3, y + Math.sin(ph) * 26, VIEW_W * 0.7, y - Math.sin(ph) * 26, VIEW_W + 20, y + Math.sin(ph + 1) * 10); c.stroke();
        }
      }
      // one or two huge translucent cell clusters drifting far below (each one baked sprite, slowly turning)
      const LT = this.H * 3, m = c.getTransform();
      c.globalAlpha = a * 0.4;
      for (let j = 0; j < (this.lite ? 2 : 3); j++) {
        const u = ((h1(j * 5.3 + 31) * LT - cam * 0.5 - t * 6) % LT + LT) % LT, ly = this.H + 160 - u;
        if (ly < -160 || ly > this.H + 160) continue;
        const lx = VIEW_W * (0.25 + 0.5 * h1(j + 7)), spr = this.clusterSpr(j);
        setXf(c, m, lx, ly, this.reduced ? j : t * 0.08 + j, 1, 1); c.drawImage(spr, -100, -100, 200, 200);
      }
      // red cells tumbling past: one baked 48 x 48 sprite, flipped by a y scale
      c.globalAlpha = a;
      const rc = this.redCellSpr();
      for (let i = 0; i < N(16); i++) {
        const x = X(i) + Math.sin(t * 0.5 + i) * 18, y = pos(i, 0.92, 18 + h1(i) * 20), r = 7 + h1(i + 0.4) * 9;
        const rot = t * (0.3 + h1(i) * 0.6) + i, sx = 0.35 + 0.65 * Math.abs(Math.cos(rot)), k = r / 20;
        setXf(c, m, x, y, i, k, k * sx); c.drawImage(rc, -24, -24, 48, 48);
      }
      // 3 or 4 big blurry red cells drifting past close to the lens (parallax 1.35)
      const rb = this.redCellBlur(), nf = this.lite ? 2 : 4;
      c.globalAlpha = a * 0.4;
      for (let i = 0; i < nf; i++) {
        const LF = this.H + 420, y = this.H + 210 - ((h1(i * 3.1 + 230) * LF - cam * 1.35 - 10 * t) % LF + LF) % LF, x = VIEW_W * (i % 2 ? 0.88 : 0.12) + (h1(i + 5.5) - 0.5) * 80 + (this.reduced ? 0 : Math.sin(t * 0.3 + i) * 14);
        const r = 40 + h1(i + 2.2) * 30, D = r * 3.2, rot = this.reduced ? i : t * 0.15 + i, sx = 0.55 + 0.45 * Math.abs(Math.cos(rot));
        setXf(c, m, x, y, i * 1.3, 1, sx); c.drawImage(rb, -D / 2, -D / 2, D, D);
      }
      c.globalAlpha = a;
      c.setTransform(m);
      c.fillStyle = 'rgba(255,190,200,0.25)'; c.beginPath();
      for (let i = 16; i < 16 + N(24); i++) { const x = X(i), y = pos(i, 1, 6), r = 1 + h1(i) * 1.5; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.fill();
    } else if (id === 'rapids') {
      // white water: fast streaks, foam chevrons with froth, eddies spinning off both walls, tumbling bubbles
      // 48 to 64 streaks (24 on lite, as before) in two widths, 1.8 and 2.4 px; 1 in 4 carries a bright head (not on lite)
      const ns = N(this.lite ? 48 : 60);
      c.strokeStyle = 'rgba(190,245,255,0.7)'; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let w = 0; w < 2; w++) {
        c.lineWidth = w ? 2.4 : 1.8; c.beginPath();
        for (let i = w; i < ns; i += 2) { const x = X(i) + Math.sin(t + i) * 4, y = pos(i, 1, 700 + h1(i) * 400), l = 26 + h1(i + 1) * 70; c.moveTo(x, y); c.lineTo(x + Math.sin(i) * 3, y + l); }
        c.stroke();
      }
      // the current itself: 18 long white streaks (10 on lite) racing downstream at 520 to 760 px/s
      // (2 px, 40 to 110 px long, 0.22; reduced motion: held still at 0.12)
      {
        const nd = NB(this.lite ? 10 : 18), rm = this.reduced;
        c.globalAlpha = a * (rm ? 0.12 : 0.22); c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath();
        for (let i = 0; i < nd; i++) {
          const j = i + 140, x = X(j), y = rm ? pos(j, 0, 0) : pos(j, 0, 520 + 240 * h1(j + 0.6)), l = 40 + 70 * h1(j + 1.3);
          c.moveTo(x, y - l); c.lineTo(x + Math.sin(j) * 2, y);
        }
        c.stroke(); c.globalAlpha = a;
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
      for (const sw of [-1, 1]) for (let j = 0; j < ne; j++) {
        const i = 80 + j * 2 + (sw > 0 ? 1 : 0), y = pos(i, 1, 260), wy = cam + this.H - y, ex = this.wallX(wy, side, sw) - sw * (22 + h1(i) * 10);
        const rot = (this.reduced ? 0 : t * 4 * sw) + i;
        for (let k = 0; k <= 16; k++) { const an = rot + k * 0.55, r = 2 + k * 0.9, px = ex + Math.cos(an) * r, py = y + Math.sin(an) * r * 0.8; k ? c.lineTo(px, py) : c.moveTo(px, py); }
      }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.1; c.beginPath();
      for (let i = 100; i < 100 + N(this.lite ? 14 : 20); i++) { const r = 1.8 + h1(i + 0.2) * 3, x = X(i) + Math.sin(t * 5 + i) * 6, y = pos(i, 1, 480 + h1(i) * 200); c.moveTo(x + r, y); c.ellipse(x, y, r * (1 + 0.15 * Math.sin(t * 11 + i)), r, 0, 0, TAU); }
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  drawScent(race) {
    const c = this.ctx, p = race.p;
    if (!(p.y > FORK_Y0 - 4000 && p.y < FORK_END)) return;
    const strong = race.muts.nose ? 1 : 0.45;
    for (let i = 0; i < 18; i++) {
      const k = (this.time * 0.35 + i / 18) % 1, wy = FORK_Y0 + 1200 - k * 3600;
      const ch = channel(Math.max(wy, FORK_Y0 + 10), race.eggSide);
      const x = ch.c + Math.sin(i * 7.1 + this.time * 2) * ch.h * 0.6 * (1 - k * 0.5);
      c.fillStyle = `rgba(255,150,230,${strong * (1 - k) * 0.9})`;
      if (i % 3 === 0) heart(c, x, this.sy(wy), 3 + (i % 2) * 1.5); else { c.beginPath(); c.arc(x, this.sy(wy), 2.2 + (i % 3), 0, TAU); c.fill(); }
    }
    if (race.muts.nose && !p.side) {
      const ch = channel(FORK_Y0 + 300, race.eggSide), y = this.sy(Math.min(p.y + 350, FORK_Y0 + 200));
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
        c.setLineDash([12, 8]); c.beginPath(); c.moveTo(L + 4, sy); c.lineTo(R - 4, sy); c.stroke(); c.setLineDash([]);
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
        const e = 1 - (1 - k) * (1 - k), ch = channel(wy, side);
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
    for (const sx of [-1, 1]) { const ex = sx * 3.2, ey = -2.5; g.moveTo(ex - 1.6, ey - 1.6); g.lineTo(ex + 1.6, ey + 1.6); g.moveTo(ex + 1.6, ey - 1.6); g.lineTo(ex - 1.6, ey + 1.6); }
    g.moveTo(-2.6, 4.2); g.quadraticCurveTo(0, 3.2, 2.6, 4.2); g.stroke();
    return (this.graveS = cv);
  }

  // ---------------------------------------------------------------- hazards and pickups
  drawEnts(race, dt) {
    const c = this.ctx, top = this.camY + this.H + 80, bot = this.camY - 80, t = this.time, p = race.p;
    // collectibles fade out over 36 px as they slide under the top HUD (read live: the egg cam moves it), so fruit by
    // the mutation chips never passes for one more chip; hazards keep drawing (drawWarnings covers them up there)
    this.hfB = race.demo || race.over ? null : this.hudB();
    for (const e of race.ents) {
      // a paid near miss (brushed it, never touched it) makes Kevin flinch, then grin
      if (e.paid && !this.paidSeen.has(e)) { this.paidSeen.add(e); if (e.near && !e.touched && !e.hit && !race.demo) { this.nearMiss(); this.ex(e).goldT = this.time; } }
      // a Big Mac drawn last frame that is dead now pops like a cartoon (drawCorpses)
      if (e.dead && e.t === 'wbc') { const E = this.ex(e); if (!E.corpse && E.seen === this.frame - 1) this.addCorpse(e); }
      if (e.dead || e.y > top + e.r || e.y < bot - (e.h || 0) - e.r) continue;
      const x = e.x, y = this.sy(e.y);
      switch (e.t) {
        case 'sugar': {
          const ci = Math.floor(Math.abs(e.x * 7 + e.y)) % FRUIT.length, col = FRUIT[ci], bob = Math.sin(t * 4 + e.y) * 2, yy = y + bob, r = e.r;
          const fa = this.hudFade(yy);
          this.dglow(col, x, yy, r + 10, 0.5 * fa); c.globalAlpha = fa;
          c.fillStyle = col; c.beginPath(); c.arc(x, yy, r, 0, TAU); c.fill();
          c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.arc(x + 2, yy + 2.5, r * 0.75, 0, Math.PI); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x - 3, yy - 3.5, 3, 2, -0.6, 0, TAU); c.fill();
          if (ci % 2 === 0) { c.fillStyle = 'rgba(255,240,150,0.85)'; for (let k = 0; k < 4; k++) c.fillRect(x - 4 + (k % 2) * 6, yy + (k >> 1) * 4 - 1, 1.4, 1.8); }
          c.fillStyle = '#5bd96b'; c.beginPath(); c.ellipse(x + 2, yy - r, 4.5, 2, -0.5, 0, TAU); c.fill();
          c.beginPath(); c.ellipse(x - 2, yy - r + 0.5, 3.5, 1.6, 0.6, 0, TAU); c.fill();
          c.globalAlpha = 1;
          break; }
        case 'dna': {
          const fa = this.hudFade(y);
          this.dglow('#ff5cd2', x, y, 26, (0.35 + 0.15 * Math.sin(t * 6)) * fa); c.globalAlpha = fa;
          c.lineCap = 'round';
          c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.4; c.beginPath();
          for (let i = 0; i <= 10; i += 2) { const yy = y - 14 + i * 2.8, s = Math.sin(t * 5 + i * 0.7) * 8; c.moveTo(x + s, yy); c.lineTo(x - s, yy); }
          c.stroke(); c.lineWidth = 3;
          for (let k = 0; k < 2; k++) { c.strokeStyle = k ? '#5ce1ff' : '#ff5cd2'; c.beginPath(); for (let i = 0; i <= 10; i++) { const yy = y - 14 + i * 2.8, xx = x + Math.sin(t * 5 + i * 0.7 + k * Math.PI) * 8; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); }
          if (Math.sin(t * 3 + e.y) > 0.9) { c.fillStyle = '#fff'; star4(c, x + 9, y - 12, 4); }
          c.globalAlpha = 1;
          break; }
        case 'shield': {
          const b = Math.sin(t * 4 + e.y) * 2, r = e.r, fa = this.hudFade(y + b);
          this.dglow('#ffd75c', x, y + b, r + 14, 0.45 * fa); c.globalAlpha = fa;
          c.fillStyle = '#ffd75c'; c.beginPath(); c.arc(x, y + b + 2, r * 0.85, Math.PI, 0); c.lineTo(x + r, y + b + 4); c.lineTo(x - r, y + b + 4); c.closePath(); c.fill();
          c.strokeStyle = '#b07a10'; c.lineWidth = 1.5; c.stroke();
          c.fillStyle = '#ff3d6e'; c.fillRect(x - 1.5, y + b - r * 0.8, 3, r * 0.9);
          c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - 4, y + b - 3, 2.5, 1.5, -0.6, 0, TAU); c.fill();
          c.globalAlpha = 1;
          break; }
        case 'alkali': {
          const r = e.r + Math.sin(t * 5 + e.y) * 1.5, fa = this.hudFade(y);
          this.dglow('#5cc8ff', x, y, r + 10, 0.4 * fa); c.globalAlpha = fa;
          c.fillStyle = 'rgba(92,200,255,0.3)'; c.strokeStyle = '#9ae2ff'; c.lineWidth = 2;
          c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(x - r * 0.4, y - r * 0.4, 2.2, 0, TAU); c.fill();
          c.font = `800 ${this.fpx(13)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
          c.lineWidth = 2; c.strokeStyle = 'rgba(10,30,60,0.9)'; c.strokeText('pH', x, y + 1); c.fillStyle = '#e6f8ff'; c.fillText('pH', x, y + 1);
          c.globalAlpha = 1;
          break; }
        case 'acid': case 'goo': {
          const acid = e.t === 'acid', col = acid ? '#9dff3c' : '#c79bff', seed = e.seed || 0;
          this.dglow(col, x, y, e.r * 1.35, acid ? 0.22 : 0.16);
          c.fillStyle = hexA(col, acid ? 0.34 : 0.3);
          // honest edges: the membrane only wobbles OUTWARD (1.02 to 1.10 x r), so the drawn rim never sits inside
          // core's hitbox (hypot(dx, dy * 1.3) < r); the hazard tape (and goo's rim) traces that hitbox exactly
          for (let i = 0; i < 16; i++) { const an = i / 16 * TAU, rr = e.r * (1.02 + 0.04 * (1 + Math.sin(an * 3 + seed + t * 2))); BX[i] = x + Math.cos(an) * rr; BY[i] = y + Math.sin(an) * rr * 0.78; }
          smoothBlob(c, 16);
          c.strokeStyle = HZ_INK; c.lineWidth = acid ? 6.6 : 6.2; c.stroke();   // the dark outer outline (2 px past the rim)
          c.fill();
          c.beginPath(); c.ellipse(x, y, e.r, e.r / 1.3, 0, 0, TAU);   // the true hitbox
          if (acid) {   // hazard tape: crawling black and lime dashes, so acid never reads as goo
            c.lineWidth = 2.6; c.setLineDash([6, 6]); c.lineDashOffset = -t * 14; c.strokeStyle = 'rgba(24,40,0,0.85)'; c.stroke();
            c.lineDashOffset = -t * 14 + 6; c.strokeStyle = '#e6ff4a'; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
          } else { c.strokeStyle = hexA(col, 0.75); c.lineWidth = 2.2; c.stroke(); }
          if (e.pulse && e.swellT != null) {   // its rim just swelled over Kevin and spared him: a quick green 'phew' ring
            const E = this.ex(e);
            if (E.swT !== e.swellT) { E.swT = e.swellT; if (!race.demo && !race.over) { this.ring(p.x, p.y, '#7dffb0', 44, 0.35, 4); const PL = K.PHEW_LINES; this.pop(p.x + 34, p.y + 30, (Array.isArray(PL) && PL.length && PL[Math.floor(Math.random() * PL.length)]) || 'phew', '#7dffb0', 13, 0.9); } }
          }
          if (e.pulse && e.r0 > 0) {   // a pulsing puddle: a steady dashed ring at its biggest footprint (r0 * 1.05)
            c.strokeStyle = 'rgba(157,255,60,0.45)'; c.lineWidth = 1.5; c.setLineDash([4, 5]);
            c.beginPath(); c.ellipse(x, y, e.r0 * 1.05, e.r0 * 1.05 / 1.3, 0, 0, TAU); c.stroke(); c.setLineDash([]);
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
          break; }
        case 'gate': this.drawGate(e, y, t); break;
        case 'cilia': this.drawCilia(e, y, t); break;
        case 'wbc': { this.ex(e).seen = this.frame; WBC_NOW.push(e); const sq = this.impSquash(e, x, y); this.drawWbc(e, x, y, t, p, dt); if (sq) c.restore(); break; }
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
        for (const sx of [-1, 1]) { const ex = x + sx * s * 0.33, ey = y - s * 0.22, d = s * 0.13; c.moveTo(ex - d, ey - d); c.lineTo(ex + d, ey + d); c.moveTo(ex + d, ey - d); c.lineTo(ex - d, ey + d); }
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
    c.setLineDash([12, 9]); c.lineDashOffset = red ? 0 : -t * 40 * dir;
    c.strokeStyle = 'rgba(225,248,255,0.55)'; c.lineWidth = 2; c.beginPath(); c.moveTo(L + 8, y); c.lineTo(R - 8, y); c.moveTo(L + 8, y1); c.lineTo(R - 8, y1); c.stroke();
    c.setLineDash([]); c.lineDashOffset = 0;
    // the arrow head: 26 px, on the wall it pushes you toward, where you swim in
    const ax = (dir > 0 ? R : L) - dir * 22, ay = y - 18;
    c.beginPath(); c.moveTo(ax + dir * 13, ay); c.lineTo(ax - dir * 13, ay - 13); c.lineTo(ax - dir * 6, ay); c.lineTo(ax - dir * 13, ay + 13); c.closePath();
    c.strokeStyle = HZ_INK; c.lineWidth = 5; c.globalAlpha = 0.7; c.stroke(); c.globalAlpha = 1;
    c.fillStyle = '#e6f8ff'; c.fill();
    const rows = e.h > 350 ? 7 : 5;
    for (let i = 0; i < rows; i++) {
      const yy = y1 + (i + 0.5) * (y - y1) / rows, k = red ? (i * 0.37 + 0.3) % 1 : ((t * 0.9 * dir + i * 0.27) % 1 + 1) % 1, xx = e.x - e.r + k * e.r * 2;
      const al = Math.sin(k * Math.PI) * 0.65;
      c.strokeStyle = `rgba(200,240,255,${(al * 0.4).toFixed(3)})`; c.lineWidth = 9;
      c.beginPath(); c.moveTo(xx - 16 * dir, yy - 9); c.lineTo(xx, yy); c.lineTo(xx - 16 * dir, yy + 9); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${al.toFixed(3)})`; c.lineWidth = 4; c.stroke();
      c.strokeStyle = `rgba(255,255,255,${(al * 0.4).toFixed(3)})`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(xx - 70 * dir, yy); c.lineTo(xx - 22 * dir, yy); c.stroke();
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
      if (C.idle > 0.001) { c.fillStyle = css(lerpC(wc, WHITE, 0.3, SCR)); c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * C.idle); c.closePath(); c.fill(); }
      return 1;
    }
    const fl = C.st === 2 && !this.reduced ? 0.5 + 0.5 * Math.sin(this.time * 40) : 1;
    c.fillStyle = C.st === 2 ? `rgba(255,255,255,${fl})` : '#ffffff'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    return fl;
  }
  drawCilia(e, y, t) {
    const c = this.ctx, s = -(e.wall || -1), bx = e.x, R = e.r, C = this.ciliaClock(e), st = C.st, per = C.per, ph = C.ph;
    const red = this.reduced, wc = this.wallC;
    // its reach: a translucent band exactly as tall as core's hit band (e.y +- 26), a solid core and a softer
    // (0.6) outer 10 px on each edge (0.10 at rest, rising through the idle and the tremble toward the swat)
    const bandA = st === 2 ? 0.28 : 0.1 + 0.14 * clamp(ph / Math.max(0.1, per - C.swat), 0, 1), bx0 = s > 0 ? bx : bx - R;
    c.fillStyle = css(st === 2 ? WHITE : wc, bandA); this.rrect(bx0, y - 16, R, 32, 10); c.fill();
    c.fillStyle = css(st === 2 ? WHITE : wc, bandA * 0.6); c.beginPath();
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
    c.fillStyle = css(wc); c.beginPath(); c.ellipse(bx, y, 6, 9, 0, 0, TAU); c.fill();
    // the timer on the root: a radius-7 pie that fills over the idle phase, goes white for the tremble, flashes on the swat
    const pieX = bx + s * 3, fl = this.ciliaPie(C, pieX, y, 7, wc);
    if (st === 2) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.globalAlpha = 0.6 * fl; c.beginPath(); c.arc(pieX, y, 11, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    if (st === 1) {   // the tell: a little "!" at the tip
      this.dangerBadge(P.tx, P.ty - 17, 0.8);
    }
  }
  // goo walls with gaps (the 'gate' hazard)
  drawGate(e, y, t) {
    const c = this.ctx, ch = channel(e.y, e.side), L = ch.c - ch.h - 10, R = ch.c + ch.h + 10;
    const gaps = e.gaps.slice().sort((a, b) => a - b); let x0 = L;
    const segs = [];
    for (const g of gaps) { segs.push([x0, g - e.gw / 2]); x0 = g + e.gw / 2; }
    segs.push([x0, R]);
    // goo slabs with lumpy edges and drips
    c.lineJoin = 'round';
    for (const [a, b] of segs) {
      if (b - a < 2) continue;
      c.beginPath(); c.moveTo(a, y - 10);
      for (let xx = a; xx <= b; xx += 7) c.lineTo(xx, y - 10 + Math.sin(xx / 9 + t * 3) * 2.5);
      c.lineTo(b, y - 10); c.quadraticCurveTo(b + 7, y, b, y + 10);
      for (let xx = b; xx >= a; xx -= 7) c.lineTo(xx, y + 10 + Math.sin(xx / 7 - t * 3) * 2.5);
      c.lineTo(a, y + 10); c.quadraticCurveTo(a - 7, y, a, y - 10);
      c.closePath(); c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke();
      c.fillStyle = 'rgba(200,160,255,0.65)'; c.fill(); c.strokeStyle = '#f2e6ff'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(a + 4, y - 4); c.lineTo(b - 4, y - 4); c.stroke();
      // the dripping fingers: a 3 px ink outline at 0.85, the goo fill, a pale inner rim
      const finger = (xx, k, l) => { c.moveTo(xx - 2.5, y + 9); c.quadraticCurveTo(xx, y + 9 + l * 1.3, xx + 2.5, y + 9); c.moveTo(xx + 2 + k, y + 10 + l); c.arc(xx, y + 10 + l, 2 + k, 0, TAU); };
      c.beginPath();
      for (let xx = a + 10; xx < b - 6; xx += 23) { const k = ((t * 0.6 + xx * 0.013) % 1); finger(xx, k, 4 + 14 * k); }
      c.globalAlpha = 0.85; c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke(); c.globalAlpha = 1;
      c.fillStyle = 'rgba(220,190,255,0.85)'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5; c.stroke();
    }
    // a sliding gate: two faint white ticks on the slab at each gap's travel extremes (g0 +- |slide|, inside lo..hi)
    if (e.slide && e.g0) {
      const sw = Math.abs(e.slide), lo = e.lo != null ? e.lo : -1e9, hi = e.hi != null ? e.hi : 1e9;
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath();
      for (let k = 0; k < e.g0.length; k++) {
        for (const s of [-1, 1]) { const tx = clamp(e.g0[k] + s * sw, lo, hi); c.moveTo(tx, y - 7); c.lineTo(tx, y + 7); }
      }
      c.stroke();
    }
    // the gaps glow and point the way; a faint column of light falls 140 units below each one
    if (!this.colG) { this.colG = c.createLinearGradient(0, 0, 0, 140); this.colG.addColorStop(0, 'rgba(255,255,255,0.16)'); this.colG.addColorStop(1, 'rgba(255,255,255,0)'); }
    if (y > (this.padW || 0) - 10 && y < this.H) {
      c.fillStyle = this.colG;
      for (const g of gaps) { const w = e.gw * 0.6; c.save(); c.translate(g, y + 10); c.fillRect(-w / 2, 0, w, 140); c.restore(); }
    }
    // a closing gate (e.close): the gap edges wear a pulsing rim that brightens (white to gold) as the gap narrows
    if (e.close) {
      const E = this.ex(e); E.gw0 = Math.max(E.gw0 || 0, e.gw || 0);
      const k = E.gw0 > 0 ? clamp(1 - e.gw / E.gw0, 0, 1) : 0, pul = this.reduced ? 1 : 0.7 + 0.3 * Math.sin(t * (8 + 10 * k));
      c.lineCap = 'round'; c.beginPath();
      for (const g of gaps) for (const s2 of [-1, 1]) { const ex = g + s2 * e.gw / 2; c.moveTo(ex, y - 11); c.quadraticCurveTo(ex - s2 * 3, y, ex, y + 11); }
      c.globalAlpha = (0.35 + 0.5 * k) * pul; c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke();
      c.globalAlpha = (0.45 + 0.55 * k) * pul; c.strokeStyle = k > 0.5 ? '#ffd75c' : '#ffffff'; c.lineWidth = 2.5 + 1.5 * k; c.stroke();
      c.globalAlpha = 1;
    }
    for (const g of gaps) {
      this.dglow('#ffffff', g, y, e.gw * 0.55, 0.12 + 0.06 * Math.sin(t * 5));
      c.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(t * 6)})`; c.lineWidth = 2.5; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) { const yy = y + 34 + k * 12 - ((t * 30) % 12); c.beginPath(); c.moveTo(g - 8, yy + 6); c.lineTo(g, yy); c.lineTo(g + 8, yy + 6); c.stroke(); }
    }
  }
  // the Lunger's reads (systems: e.crouch counts down from 0.45 s before a lunge, e.lunge is set during it, and
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
      const k = clamp(1 - e.crouch / 0.45, 0, 1), dx = tx - x, dy = ty - y, dl = Math.hypot(dx, dy) || 1, r0 = (e.r || 24) * 1.1;
      c.lineCap = 'round'; c.setLineDash([8, 6]); c.lineDashOffset = red ? 0 : -t * 60;
      c.beginPath(); c.moveTo(x + dx / dl * r0, y + dy / dl * r0); c.lineTo(tx, ty);
      c.globalAlpha = 0.4 + 0.5 * k; c.strokeStyle = HZ_INK; c.lineWidth = 5; c.stroke();
      c.strokeStyle = this.dangerFill(); c.lineWidth = 2.5; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
      c.beginPath(); c.arc(tx, ty, 16 - 6 * k, 0, TAU); c.lineWidth = 2.5; c.stroke();
      c.globalAlpha = 1;
    }
    if (lunging && !red) {   // motion streaks trailing behind it
      let vx = +e.vx || 0, vy = -(+e.vy || 0);
      if (Math.abs(vx) + Math.abs(vy) < 1) { vx = tx - x; vy = ty - y; }
      const vl = Math.hypot(vx, vy) || 1, ux = -vx / vl, uy = -vy / vl, r = e.r || 24;
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath();
      for (let i = -2; i <= 2; i++) { const ox = -uy * i * r * 0.35, oy = ux * i * r * 0.35, l = r * (1.1 + 0.5 * h1(i + 3 + Math.floor(t * 20))); c.moveTo(x + ux * r * 0.9 + ox, y + uy * r * 0.9 + oy); c.lineTo(x + ux * (r * 0.9 + l) + ox, y + uy * (r * 0.9 + l) + oy); }
      c.stroke();
    }
    if (crouch) {   // squashed down (sx 1.15, sy 0.8) and trembling
      const jx = red ? 0 : 1.6 * Math.sin(t * 61), jy = red ? 0 : 1.2 * Math.sin(t * 47 + 1);
      c.save(); c.translate(x + jx, y + jy + (e.r || 24) * 0.12); c.scale(1.15, 0.8); c.translate(-x, -y);
      this.drawWbcBody(e, x, y, t, p, dt);
      c.restore();
    } else this.drawWbcBody(e, x, y, t, p, dt);
    if (stun) {   // dizzy: three stars circling over it
      const r = e.r || 24; c.fillStyle = '#ffd75c';
      for (let i = 0; i < 3; i++) { const a = (red ? 0 : t * 6) + i * TAU / 3; star4(c, x + Math.cos(a) * r * 0.8, y - r * 1.05 + Math.sin(a) * r * 0.25, 3.6); }
    }
  }
  // Big Mac: a white blood cell with a wobbly membrane, arms that reach for you, and table manners to match
  drawWbcBody(e, x, y, t, p, dt) {
    const c = this.ctx, hunt = e.hunt || 0, ph = e.ph || 0;
    let st = this.wbcState.get(e); if (!st) { st = { eating: 0, burp: 0, full: 0, tail: 0, alert: 0, bang: 0, spotT: 0 }; this.wbcState.set(e, st); }
    const spot = (e.spot || 0) > 0;
    // a dozing POPCORN cell (e.popcorn: it never hunts, a dash pops it) and a standing lunger each get their own look
    const pc = !!e.popcorn && !e.dead, lg = !pc && !!e.lunger && e.lunged !== 2;
    if (st.k0 == null) st.k0 = ph;   // e.ph runs with time: a fixed per-cell seed for the kernels and the 'z' stagger
    if (pc) st.grump = Math.abs(+e.vx || 0) > 20 ? 0.6 : Math.max(0, (st.grump || 0) - dt);
    st.spotT = spot ? Math.min(0.35, st.spotT + dt) : Math.max(0, st.spotT - dt * 2);
    const py = this.sy(p.y), ang = Math.atan2(py - y, p.x - x);
    // its sight: a dashed 120-degree arc facing you while it has not locked on and is up to 600 ahead (louder
    // while teaching); when it spots you (e.spot) the arc turns red
    const ahead = e.y - p.y;
    if (!pc && ((hunt < 0.5 && ahead > -40 && ahead < 600) || st.spotT > 0)) {
      const R0 = e.sight || 440;
      if (hunt < 0.5) {   // spotted: the zone's danger colour (gold in the Sea and the Egg) over a 3 px ink under-stroke
        c.setLineDash([10, 12]); c.lineDashOffset = this.reduced ? 0 : -t * 12;
        c.beginPath(); c.arc(x, y, R0, ang - Math.PI / 3, ang + Math.PI / 3);
        if (spot) { c.globalAlpha = 0.35; c.strokeStyle = HZ_INK; c.lineWidth = 5.5; c.stroke(); c.strokeStyle = this.dangerFill(); c.lineWidth = 2.5; c.stroke(); }
        else { c.globalAlpha = this.teach ? 0.22 : 0.15; c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.stroke(); }
        c.setLineDash([]); c.lineDashOffset = 0;
      }
      c.globalAlpha = 1;
    }
    // hunting: a pulsing white ring at the near-miss radius (e.r + 26); it flashes gold for 0.25 s when a dodge pays,
    // and stays gold while Kevin is inside it (the near miss shows as it happens)
    if (hunt > 0.5 && !pc) {
      const gE = this.ex(e), inRing = Math.hypot(p.x - e.x, p.y - e.y) < e.r + 26, gold = inRing || (gE.goldT != null && t - gE.goldT < 0.25);
      c.globalAlpha = gold ? 0.6 : this.reduced ? 0.25 : 0.25 * (0.7 + 0.3 * Math.sin(t * 7)); c.strokeStyle = gold ? '#ffd75c' : '#ffffff'; c.lineWidth = gold ? 3 : 2;
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
      c.setLineDash([5, 6]); c.lineDashOffset = this.reduced ? 0 : -t * 30;
      c.beginPath(); c.moveTo(x + Math.cos(ang) * r * 1.1, y + Math.sin(ang) * r * 1.1); c.lineTo(p.x - Math.cos(ang) * 14, py - Math.sin(ang) * 14);
      c.globalAlpha = 0.3 + 0.3 * hunt; c.strokeStyle = HZ_INK; c.lineWidth = 3; c.stroke();
      c.strokeStyle = this.dangerFill(); c.lineWidth = 1.6; c.stroke(); c.globalAlpha = 1;
      c.setLineDash([]); c.lineDashOffset = 0;
    }
    this.dglow(pc ? '#fff2b0' : lg ? '#ffc08a' : hunt > 0.5 ? '#ff9ab4' : '#f4eef7', x, y, r + 22, 0.28 + 0.15 * hunt);
    // a standing lunger: squashed low and wide (1.15 x 0.88) on its haunches (the crouch squashes it further itself)
    const lsq = lg && !(e.crouch > 0) && !e.lunge;
    if (lsq) { c.save(); c.translate(x, y + r * 0.08); c.scale(1.15, 0.88); c.translate(-x, -y); }
    // membrane: wobble harmonics + pseudopod arms that stretch toward the player
    // the arms only bite out to rr = 1 + 8 / e.r: past that the tips are a ghost (pink, 0.45, no outline), drawn
    // first so the solid body covers their roots
    const reach = hunt * (0.55 + 0.15 * Math.sin(t * 7)), bite = 1 + 8 / Math.max(8, e.r || 24);
    let tips = false;
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU;
      let rr = 1 + 0.08 * Math.sin(a * 4 + ph * 3) + 0.05 * Math.sin(a * 7 - ph * 5);
      if (reach > 0.02) {
        const d0 = Math.cos(a - ang), d1 = Math.cos(a - ang - 0.75), d2 = Math.cos(a - ang + 0.75);
        rr += reach * (Math.pow(Math.max(0, d1), 10) + Math.pow(Math.max(0, d2), 10)) * 0.8 + reach * 0.25 * Math.pow(Math.max(0, d0), 4);
      }
      if (rr > bite) tips = true;
      BX[i] = x + Math.cos(a) * r * rr; BY[i] = y + Math.sin(a) * r * rr; BR[i] = rr;
    }
    if (tips) {
      smoothBlob(c, 28); c.globalAlpha = 0.45; c.fillStyle = '#ff9ab4'; c.fill(); c.globalAlpha = 1;
      for (let i = 0; i < 28; i++) if (BR[i] > bite) { const a = i / 28 * TAU; BX[i] = x + Math.cos(a) * r * bite; BY[i] = y + Math.sin(a) * r * bite; }
    }
    if (lg) {   // the lunger's coiled haunches: two 8 px arcs low on each side, drawn first so the body covers their roots
      c.lineCap = 'round';
      for (const sx of [-1, 1]) {
        const hx = x + sx * r * 0.62, hy = y + r * 0.62;
        c.beginPath(); c.arc(hx, hy, 8, sx < 0 ? Math.PI * 0.45 : -Math.PI * 0.2, sx < 0 ? Math.PI * 1.2 : Math.PI * 0.55);
        c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke(); c.strokeStyle = '#ff9a3c'; c.lineWidth = 3; c.stroke();
      }
    }
    smoothBlob(c, 28); c.strokeStyle = HZ_INK; c.lineWidth = 6.2; c.stroke();   // the dark outer outline
    c.fillStyle = pc ? '#fff2b0' : '#f6f0f8'; c.fill();
    c.strokeStyle = pc ? '#e0b84a' : lg ? '#ff9a3c' : hunt > 0.5 ? '#e08aa8' : '#c9b6d9'; c.lineWidth = lg ? 3 : 2.2; c.stroke();
    if (pc) {   // buttery popcorn: 3 or 4 kernel bumps round the rim, a warm middle, no nucleus
      const nk = 3 + ((st.k0 * 10) | 0) % 2, wob = this.reduced ? 0 : Math.sin(t * 1.3 + st.k0) * 0.08;
      for (let k = 0; k < nk; k++) {
        const a = st.k0 * 1.7 + wob + k * TAU / nk + (k % 2 ? 0.25 : -0.15), kr = r * 0.25;
        const kx = x + Math.cos(a) * r * 0.86, ky = y + Math.sin(a) * r * 0.86;
        c.beginPath(); c.arc(kx, ky, kr, 0, TAU); c.strokeStyle = HZ_INK; c.lineWidth = 3; c.stroke();
        c.fillStyle = '#fff2b0'; c.fill(); c.strokeStyle = '#e0b84a'; c.lineWidth = 1.6; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(kx - kr * 0.3, ky - kr * 0.3, kr * 0.3, 0, TAU); c.fill();
      }
      c.fillStyle = 'rgba(240,196,96,0.3)'; c.beginPath(); c.arc(x + r * 0.1, y + r * 0.15, r * 0.7, 0, TAU); c.fill();
      c.fillStyle = 'rgba(214,150,50,0.45)';
      for (let k = 0; k < 5; k++) { const a = k * 1.3 + ph * 0.3; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.45, 1.4, 0, TAU); c.fill(); }
    } else {
      c.strokeStyle = HZ_CREAM; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, r * 0.9, Math.PI * 1.08, Math.PI * 1.45); c.stroke();
      c.fillStyle = 'rgba(210,190,230,0.45)'; c.beginPath(); c.arc(x + r * 0.1, y + r * 0.15, r * 0.78, 0, TAU); c.fill();
      // lobed nucleus + granules
      c.fillStyle = 'rgba(150,100,200,0.42)';
      for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(x - r * 0.25 + k * r * 0.25, y + r * 0.08 + Math.sin(k * 2 + ph) * r * 0.08, r * 0.17, r * 0.13, k, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(160,120,200,0.5)';
      for (let k = 0; k < 6; k++) { const a = k * 1.1 + ph * 0.3; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.5, 1.4, 0, TAU); c.fill(); }
    }
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x - r * 0.45, y - r * 0.5, r * 0.18, r * 0.09, -0.7, 0, TAU); c.fill();
    // eyes that follow you, angry brows when it is hunting
    const blink = ((t + ph) % 3.7) < 0.1 && hunt < 0.5 && !spot;
    const doze = pc && !(st.grump > 0), grump = pc && st.grump > 0;
    for (const sx of [-1, 1]) {
      const ex = x + sx * r * 0.33, ey = y - r * 0.25, er = r * (wind > 0 ? 0.3 + 0.05 * wind : spot ? 0.3 : 0.24);
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
    const mo = hunt * 0.25 + chomp * 0.2, my = y + r * 0.38;
    c.fillStyle = '#5a1030'; c.beginPath(); c.ellipse(x, my, r * 0.42, r * (0.05 + mo), 0, 0, TAU); c.fill();
    if (mo > 0.12) {
      c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(x, my + r * mo * 0.5, r * 0.22, r * mo * 0.4, 0, 0, TAU); c.fill();
      c.fillStyle = '#fff';
      for (let i = -2; i <= 2; i++) { const tx = x + i * r * 0.15; c.beginPath(); c.moveTo(tx - 3, my - r * mo * 0.8); c.lineTo(tx + 3, my - r * mo * 0.8); c.lineTo(tx, my - r * mo * 0.3); c.fill(); }
      if (hunt > 0.8) { const d = (t * 1.5 + ph) % 1; c.fillStyle = 'rgba(200,240,255,0.8)'; c.beginPath(); c.ellipse(x + r * 0.25, my + r * mo + d * 10, 1.6, 2.4 + d * 2, 0, 0, TAU); c.fill(); }
    }
    if (st.tail > 0) {
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath();
      const tx = x + r * 0.15, ty = my + 1; c.moveTo(tx, ty);
      for (let i = 1; i <= 5; i++) c.lineTo(tx + i * 3, ty + i * 2.5 + Math.sin(t * 30 + i) * 2.5 * i / 5);
      c.stroke();
    }
    if (st.full > 0.2) { c.strokeStyle = `rgba(150,100,200,${st.full * 0.5})`; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y + r * 0.62, r * 0.18, 0.2, Math.PI - 0.2); c.stroke(); }
    // the "!" when it spots you
    if (st.bang > 0) {
      const k = 1 - st.bang / 0.3, sc = backOut(Math.min(1, k / 0.6)), bx = x + r * 0.85, by = y - r * 1.15;
      c.save(); c.translate(bx, by); c.scale(sc, sc);
      c.fillStyle = '#2a0a24'; c.beginPath(); c.moveTo(-5, 7); c.lineTo(-10, 14); c.lineTo(2, 9.5); c.fill();   // its speech tail
      c.fillStyle = '#fff4f8'; c.beginPath(); c.moveTo(-4, 7); c.lineTo(-8, 12); c.lineTo(1, 9); c.fill();
      this.dangerBadge(0, 0, 1);
      c.restore();
    }
    if (this.isImp(e)) {   // impact frame: the whole cell goes white (BX/BY still hold its membrane)
      smoothBlob(c, 28); c.fillStyle = '#ffffff'; c.fill();
    }
    if (lsq) c.restore();
    if (doze) {   // a little 'z' drifting up 18 px every 1.2 s (staggered by e.ph; parked for reduced motion)
      const zs = this.text('z', '#fff4e2', this.fpx(11)), u = this.reduced ? 0.5 : ((t + st.k0 * 0.37) % 1.2) / 1.2;
      c.globalAlpha = this.reduced ? 0.85 : Math.sin(Math.PI * u);
      c.drawImage(zs.cv, x + r * 0.55 + 4 * u - zs.w / 2, y - r * 0.95 - 18 * u - zs.h / 2, zs.w, zs.h);
      c.globalAlpha = 1;
    }
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
    for (const e of race.ents) {
      if (e.dead) continue;
      const d = e.y - top;
      if (e.t === 'gate') {
        if (d <= 0 || d >= 650 || (e.side && p.side && e.side !== p.side)) continue;
        const k = 1 - d / 650, ch = channel(top, e.side || 0), L = Math.max(0, ch.c - ch.h), R = Math.min(VIEW_W, ch.c + ch.h);
        c.fillStyle = `rgba(200,160,255,${(0.35 + 0.5 * k).toFixed(3)})`; c.fillRect(L, padW, R - L, 6);
        const pul = red ? 1 : 0.75 + 0.25 * Math.sin(t * 6 * TAU), sc = 0.8 + 0.3 * k;
        c.globalAlpha = pul; c.fillStyle = '#ffffff';
        for (const g of e.gaps) { const w = e.gw * sc; this.rrect(g - w / 2, padW - 1, w, 8, 4); c.fill(); }   // (the live gaps)
        c.globalAlpha = 1;
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
        const ch = channel(e.y, p.side || 0);
        if (Math.abs(e.x - ch.c) > ch.h + 30) continue;   // a hair in the other tube
        const k = 1 - d / 700, wl = e.wall < 0 ? -1 : 1, xa = e.x - wl * e.r, x0 = clamp(Math.min(e.x, xa), 0, VIEW_W), x1 = clamp(Math.max(e.x, xa), 0, VIEW_W);
        if (x1 - x0 < 2) continue;
        c.globalAlpha = 0.45 + 0.5 * k; c.fillStyle = css(this.wallC); this.rrect(x0, padW - 1, x1 - x0, 8, 4); c.fill();
        c.globalAlpha = 1; c.strokeStyle = HZ_INK; c.lineWidth = 1.2; c.stroke();
        this.ciliaPie(this.ciliaClock(e), clamp(e.x - wl * 10, 10, VIEW_W - 10), padW + 14, 5, this.wallC);
        continue;
      }
      const wbc = e.t === 'wbc', blob = e.t === 'acid' || e.t === 'goo';
      if (!wbc && !blob) continue;
      if (d < 0 || d > 700) continue;
      if (blob && Math.abs(e.x - p.x) > e.r + 60) continue;   // only the pools in your lane
      // Big Macs: big red chevrons (1.0 to 1.4) with a tiny white blob face, pulsing at 6 Hz once it hunts or
      // spots you. Acid and goo: smaller (0.6 to 0.9), filled in the pool's own colour, steady.
      // (Big Macs also grow with the closing speed: at vy 1300 a chevron is 1.3x bigger again)
      if (wbc && e.popcorn) {   // a dozing POPCORN cell is no threat: a small gold chevron (0.8) with a POP label, steady
        const x = clamp(e.x, 16, VIEW_W - 16), ps = this.text('POP', '#ffd75c', this.fpx(11));
        c.save(); c.translate(x, padW + 14); c.scale(0.8, 0.8); c.lineJoin = 'round';
        c.beginPath(); c.moveTo(0, -12); c.lineTo(12, 1); c.lineTo(5.5, 1); c.lineTo(0, -4.5); c.lineTo(-5.5, 1); c.lineTo(-12, 1); c.closePath();
        c.strokeStyle = HZ_INK; c.lineWidth = 9 / 0.8; c.stroke(); c.strokeStyle = '#fff4f8'; c.lineWidth = 3 / 0.8; c.stroke(); c.fillStyle = '#ffd75c'; c.fill();
        c.restore();
        c.drawImage(ps.cv, this.labX(x, ps.w) - ps.w / 2, padW + 24 - ps.h / 2, ps.w, ps.h);
        continue;
      }
      const lng = wbc && e.lunger && e.lunged !== 2;
      const k = 1 - d / 700, x = clamp(e.x, 16, VIEW_W - 16), sc = wbc ? 1 + 0.4 * k + 0.3 * clamp(((p.vy || 0) - 600) / 700, 0, 1) : 0.6 + 0.3 * k;
      const live = wbc && ((e.hunt || 0) > 0 || (e.spot || 0) > 0), dcol = this.dangerFill(), bc = wbc ? dcol : e.t === 'acid' ? '#7fcf1f' : '#a77bff';
      c.save(); c.translate(x, padW + 14); c.scale(sc, sc);
      c.globalAlpha = live && !red ? 0.72 + 0.28 * Math.sin(t * 6 * TAU) : 1;
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
        for (const ox of [-3, 3]) { c.fillRect(ox - 1.2, 6.2, 2.4, 5.4); c.beginPath(); c.arc(ox, 14.4, 1.3, 0, TAU); c.fill(); }
        if (live) { c.globalAlpha = 1; this.dangerBadge(17, -13, 0.75); }
      } else if (wbc) {   // the blob face: a wobbly white cell with two eyes and a little mouth
        c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 11, 8, 7, 0, 0, TAU); c.fill(); c.strokeStyle = bc; c.lineWidth = 2; c.stroke();
        c.fillStyle = '#1a0a1a'; c.beginPath(); c.arc(-2.6, 9.6, 1.3, 0, TAU); c.arc(2.6, 9.6, 1.3, 0, TAU); c.fill();
        c.fillStyle = '#5a1030'; c.beginPath(); c.ellipse(0, 13.6, 2.6, live ? 1.7 : 0.9, 0, 0, TAU); c.fill();
        // the wind-up, so the tell is never lost off screen: a red arc round the chevron fills over the spot
        // (full once it hunts), with a '!' badge
        if (live) {
          const f = (e.hunt || 0) > 0 ? 1 : clamp((e.spot || 0) / (e.spotT || 0.35), 0, 1);
          c.globalAlpha = 1; c.lineCap = 'round';
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
    c.globalAlpha = 1;
    this.drawThreatEdge(race);
  }
  // the visual twin of the threat growl: the nearest hunting Big Mac within 300 that is off screen (or within 60 px
  // of an edge) gets a 22 px chevron on the screen border, pointing at it, alpha 1 - d / 300 (steady for reduced motion)
  drawThreatEdge(race) {
    const p = race.p, c = this.ctx;
    if (race.over || race.drill || race.demo) return;
    let best = null, bd = 300;
    for (const e of race.ents) {
      if (e.t !== 'wbc' || e.dead || !((e.hunt || 0) > 0.5)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
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
    const pul = this.reduced ? 1 : 1 + 0.12 * Math.sin(this.time * 3 * TAU), m = c.getTransform();
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
    for (const [a, q] of this.duel) one(a, q.an, a.drill / d.need, a.boss ? a.boss.col : '#ff5c7a', !!thief && a === thief);
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
        const f = d ? a.drill / d.need : 0; if (f > leadF) { leadF = f; leadB = a; }
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
    // 1.6 s after a win: the baby-to-be glows faintly inside her
    const eT = this.endT, babyK = win && over.baby && eT > 1.6 ? clamp((eT - 1.6) / 0.4, 0, 1) : 0;
    if (babyK > 0) {
      this.dglow('#fff3c0', 0, -14, 92, 0.35 * babyK);
      c.globalAlpha = 0.35 * babyK * (this.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 4));
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
    for (const s of [-1, 1]) {
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
    c.fillStyle = `rgba(255,110,140,${Math.min(0.95, 0.4 + 0.3 * (near + jig) + bl).toFixed(3)})`;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 78, 32, 16 * (1 + 0.25 * babyK), 9 * (1 + 0.25 * babyK), 0, 0, TAU); c.fill(); }
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
        const f = Math.min(1, a.drill / d.need), end = -Math.PI / 2 + TAU * f;
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
      let lead = 0; for (const a of race.agents) if (a.alive && a.arrived && !a.boss) lead = Math.max(lead, a.drill);
      if (lead > 0) { c.strokeStyle = '#ff5c7a'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, outer, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, lead / d.need)); c.stroke(); }
    }
  }

  // ---------------------------------------------------------------- swimmers
  // n: segments (7 near Kevin; the far crowd uses 3, which still reads as a wiggle at that size)
  // the wave: a tighter spatial phase (k * 8.5, about 1.35 waves down the tail) and an envelope that keeps a
  // little life at the root (0.25 + 0.75 k^2) so the whip reads; half amplitude for reduced motion
  tail(c, x, y, ang, len, amp, ph, n = 7) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    if (this.reduced) amp *= 0.5;
    c.moveTo(x, y);
    for (let i = 1; i <= n; i++) {
      const k = i / n, off = Math.sin(ph - k * 8.5) * amp * (0.25 + 0.75 * k * k);
      c.lineTo(x - sa * len * k + ca * off, y + ca * len * k + sa * off);
    }
  }
  // a tapered tail in local space (pointing down): thick near the head, whip-thin at the tip (3 strokes)
  // curl: the tail lags a turn (follow-through), bending the tip sideways by curl * len at the very end
  // tip: a colour for the last third (one extra stroke over it at 0.6), so a named rival reads by its tail alone
  taperTail(c, len, amp, ph, w, curl = 0, tip = null) {
    let px = 0, py = 8;
    if (this.reduced) amp *= 0.5;
    for (let s = 0; s < 3; s++) {
      const i0 = s * 3 + 1, i1 = Math.min(8, i0 + 2), km = ((i0 + i1) / 2) / 8;
      c.lineWidth = w * (1.15 - km * 0.85); c.beginPath(); c.moveTo(px, py);
      for (let i = i0; i <= i1; i++) { const k = i / 8; px = Math.sin(ph - k * 8.5) * amp * (0.25 + 0.75 * k * k) + curl * k * k * len; py = 8 + len * k; c.lineTo(px, py); }
      c.stroke();
      if (tip && s === 2) { const ss = c.strokeStyle, ga = c.globalAlpha; c.strokeStyle = tip; c.globalAlpha = ga * 0.6; c.stroke(); c.strokeStyle = ss; c.globalAlpha = ga; }
    }
  }
  // Kevin's STYLE stripes: n short bands across his tapered tail (taperTail's own curve), one per link kind in the
  // STYLE window, spread from 22% to 78% of its length, each in that kind's chip colour
  tailStripes(c, len, amp, ph, w, curl, cols, n) {
    if (this.reduced) amp *= 0.5;
    const pt = (k, out) => { out[0] = Math.sin(ph - k * 8.5) * amp * (0.25 + 0.75 * k * k) + curl * k * k * len; out[1] = 8 + len * k; };
    const A = this._stA || (this._stA = [0, 0]), B = this._stB || (this._stB = [0, 0]), sl = 0.07;
    c.lineCap = 'butt';
    for (let i = 0; i < n; i++) {
      const k0 = n === 1 ? 0.45 : 0.22 + (0.56 - sl) * i / (n - 1), k1 = k0 + sl;
      pt(k0, A); pt(k1, B);
      c.strokeStyle = cols[i]; c.lineWidth = w * (1.15 - (k0 + sl / 2) * 0.85) * 1.08;
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
    const f = fr ? fr(a) : 15;
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
  drawAgents(race, dt) {
    this.coilTick(race);
    const c = this.ctx, WM = this.worldM || c.getTransform(), top = this.camY + this.H + 40, bot = this.camY - 40, t = this.time, p = race.p;
    const vis = this._vis || (this._vis = []), close = this._close || (this._close = []);
    vis.length = 0; close.length = 0;
    const cap = this.lite ? 12 : 26, visCap = this.lite ? 90 : 150, sm = 1 - Math.exp(-16 * dt), fb = 430 * (1 + 0.06 * (race.gen || 0));
    // crowd panic: hunting Big Macs near the camera make the swimmers round them freak out (read by the tail rates)
    // (x, y, kev) triples; a hot Kevin joins the list with his own 90 px radius, so the crowd parts round him
    const PN = this.panic; let pn = 0;
    for (const e of race.ents) {
      if (e.t !== 'wbc' || e.dead || !(e.hunt > 0.5) || e.y > top + 400 || e.y < bot - 400) continue;
      if (pn + 2 >= PN.length) PN.push(0, 0, 0);
      PN[pn++] = e.x; PN[pn++] = e.y; PN[pn++] = 0;
    }
    const ov = race.over, red = this.reduced, hot = this.kevinHot(p) && !ov && !race.drill, fz = p.frenzyT > 0;
    if (hot && !red) { if (pn + 2 >= PN.length) PN.push(0, 0, 0); PN[pn++] = p.x; PN[pn++] = p.y; PN[pn++] = 1; }
    // kev false: Big Macs only (the panic faces); with Kevin in the list his radius is 90 whatever r is
    const AX = this.aux;
    const nearW = (a, r, kev = true) => { for (let i = 0; i < pn; i += 3) { if (PN[i + 2] && !kev) continue; const rr = PN[i + 2] ? 90 : r, dx = AX.get(a).rx - PN[i], dy = a.y - PN[i + 1]; if (dx * dx + dy * dy < rr * rr) return i; } return -1; };
    const near = (a, r) => pn > 0 && nearW(a, r) >= 0;
    const win = !!(ov && ov.reason === 'win'), late = !!(ov && ov.reason === 'late');
    // the win: from 0.4 s every visible rival reacts for 1.2 s; tails slow to 0.4x and the close crowd looks worried
    const reactK = win && this.endT > 0.9 ? clamp((this.endT - 0.9) / 0.7, 0, 1) : -1, slow = reactK >= 0 ? 0.4 : 1;
    const freq0 = (a) => 11 + 9 * ((a.sp || fb) / fb) * (0.75 + 0.25 * (a.stam == null ? 1 : a.stam));
    const coilAny = this.coilOn || (this.launchT != null && this.time - this.launchT < 0.6);
    const fr = (a) => {
      if (coilAny && this.coilSy((a.ph % 1) * 0.3) < 0) return 28;   // coiled on the line: a tight, fast flutter
      if (a.boss) {
        const A = AX.get(a), L = BOSS_LOOK[A.fn || (A.fn = a.boss.name.split(' ')[0])] || {}, sprint = !this.duel.get(a) && !a.arrived && !!a.sprint;
        return (L.freq || 15) * (sprint ? 1.6 : 1) * (near(a, 110) ? 1.8 : 1) * slow;
      }
      return freq0(a) * (near(a, 90) ? 1.8 : 1) * slow;
    };
    // the crowd near Kevin: every non-rival within 200 is a candidate; the nearest `cap` get baked heads (close), the
    // rest of them (overflow) draw as plain full-size heads with the far crowd. 170..200 is a 30 px crossfade: the far
    // head (now the same size and colour) draws under the baked one, which fades out (A.cf 1 -> 0)
    const cand = this._cand || (this._cand = []); cand.length = 0;
    this.hfB = race.demo || race.over ? null : this.hudB();
    let nFade = 0;   // crowd swimmers under the HUD (drawn faded outside the batches)
    for (const a of race.agents) {
      if (!a.alive) {   // a named rival who just dropped out near Kevin leaves as a ghost
        const A = AX.get(a);
        if (a.boss && A && A.seen === this.frame - 1 && !A.gone) { A.gone = 1; if (Math.abs(a.y - p.y) < 700) this.rivalGhost(a); }
        continue;
      }
      if (a.y > top || a.y < bot) continue;
      if (p.side && a.y > FORK_Y0 && a.side !== p.side && a.y > FORK_END) continue;
      // the far crowd is capped (150, 90 on lite), never within 300 of Kevin and never a named rival
      if (!a.boss && vis.length >= visCap && Math.abs(a.y - p.y) >= 300) continue;
      const A = this.track(a, race, p, dt, sm, fr);
      A.cl = 0; A.cf = 0; A.hf = a.boss ? 1 : this.hudFade(this.sy(a.y + (A.oy || 0)));
      if (!a.boss && Math.abs(a.y - p.y) < 200) { const dx = A.rx - p.x, dy = a.y - p.y; A.nd = dx * dx + dy * dy; cand.push(a); } else vis.push(a);
    }
    if (cand.length > cap) { SORT_AX = AX; cand.sort(byND); SORT_AX = null; }
    for (let i = 0; i < cand.length; i++) {
      const a = cand[i], A = AX.get(a);
      if (i < cap) { close.push(a); A.cl = 1; A.cf = clamp(1 - (Math.abs(a.y - p.y) - 170) / 30, 0, 1); }
      vis.push(a);   // (overflow, and the close ones fading out, draw a far head too; close ones at cf 1 skip it)
    }
    const T = this.time, jit = red ? 0 : 2.5, oopsOn = this.oopsT > 0 && !race.demo;
    // the close ones' display offsets: parting round a hot Kevin (12 px while within 90), the panic jitter, the coil
    for (const a of close) {
      const A = AX.get(a);
      let kw = 0;
      if (hot && !red) { const dx = A.rx - p.x, dy = a.y - p.y; if (dx * dx + dy * dy < 8100) kw = dx >= 0 ? 12 : -12; }
      A.kp = (A.kp || 0) + (kw - (A.kp || 0)) * Math.min(1, dt * 10);
      // panic jitter (a hunting Big Mac within 110, not while bumped): tail and head shake together
      A.jx = jit && pn && !(Math.max(a.bumpT || 0, A.bt) > 0) && nearW(a, 110, false) >= 0 ? jit * Math.sin(T * 30 + a.ph) : 0;
      A.cz = coilAny ? this.coilSy((a.ph % 1) * 0.3) : 1;
      if (A.cz >= 0 && this.launchT != null && A.lp !== this.launchT && this.time - this.launchT < 0.6) { A.lp = this.launchT; if (!this.lite) this.launchPuff(A.rx + A.kp + A.jx, a.y + A.oy - 30); }
    }
    // tails, one formula for the whole crowd (len 32, amp 5.5 + 1.2 per face % 3, 8 px behind the head along its
    // heading): within 300 one stroke at 2.2 px / 0.92 (7 segments); past 300 the width and alpha ease off in two
    // bands (3 segments), and past 700 a head goes alone. Bevel joins (cheaper to stroke on a long path)
    c.lineCap = 'round'; c.lineJoin = 'bevel';
    for (let band = 0; band < 3; band++) {
      const e = band === 0 ? 0 : band === 1 ? 0.3 : 0.75;
      c.strokeStyle = 'rgba(255,255,255,1)'; c.globalAlpha = 0.92 - 0.27 * e; c.lineWidth = 2.2 - 0.7 * e; c.beginPath();
      let any = false;
      for (const a of vis) {
        if (a.boss) continue;
        const A = AX.get(a);
        if (A.cl) continue;
        if (A.hf < 1) { if (band === 0) nFade++; continue; }
        const dy = Math.abs(a.y - p.y), b = dy < 300 ? 0 : dy < 500 ? 1 : dy < 700 ? 2 : 3;
        if (b !== band) continue;
        const h = A.hd || 0;
        this.tail(c, A.rx - Math.sin(h) * 8, this.sy(a.y + A.oy) + Math.cos(h) * 8, h, 32, 5.5 + ((a.face || 0) % 3) * 1.2, A.tp, b ? 3 : 7); any = true;
      }
      if (band === 0) for (const a of close) {
        const A = AX.get(a), x = A.rx + A.kp + A.jx, y = this.sy(a.y + A.oy), ang = A.hd, ph = A.tp;
        A.ph = ph; if (A.hf < 1) { nFade++; continue; } this.tail(c, x - Math.sin(ang) * 8, y + Math.cos(ang) * 8, ang, 32, A.cz < 0 ? 2.5 : 5.5 + ((a.face || 0) % 3) * 1.2, ph); any = true;
      }
      if (any) c.stroke();
    }
    if (nFade) {   // the crowd under the HUD: one tail each at its own fade
      c.strokeStyle = '#ffffff'; c.lineWidth = 2;
      for (const a of vis) {
        if (a.boss) continue;
        const A = AX.get(a);
        if (!(A.hf < 1)) continue;
        const cl = !!A.cl, h = A.hd || 0, x = A.rx + (cl ? (A.kp || 0) + (A.jx || 0) : 0), y = this.sy(a.y + A.oy), dy = Math.abs(a.y - p.y);
        c.globalAlpha = A.hf * (dy < 300 ? 0.92 : 0.75); c.beginPath();
        this.tail(c, x - Math.sin(h) * 8, y + Math.cos(h) * 8, h, 32, 5.5 + ((a.face || 0) % 3) * 1.2, cl ? A.ph : A.tp, dy < 300 ? 7 : 3); c.stroke();
      }
    }
    c.globalAlpha = 1; c.lineJoin = 'round';
    // far heads: 7.5 x 10 (the baked head's size) shrinking to 0.8x by 490, batched by face % 6 in the baked heads'
    // own colours, with their faint outline (the Goo's dark rim there)
    for (let f = 0; f < 6; f++) {
      c.fillStyle = CROWD[f]; c.beginPath();
      let any = false;
      for (const a of vis) {
        if (a.boss || ((a.face || 0) % 6) !== f) continue;
        const A = AX.get(a);
        if ((A.cl && A.cf >= 1) || A.hf < 1) continue;
        const k = farS(Math.abs(a.y - p.y)), x = A.rx + (A.cl ? A.kp + A.jx : 0), y = this.sy(a.y + A.oy), q = A.sqU > T ? 1 : 0, rx = 7.5 * k * (1 + 0.25 * q), ry = 10 * k * (1 - 0.2 * q), h = A.hd || 0;
        c.moveTo(x + rx * Math.cos(h), y + rx * Math.sin(h)); c.ellipse(x, y, rx, ry, h, 0, TAU); any = true;
      }
      if (!any) continue;
      c.fill();
      if (this.gooOn) { c.strokeStyle = GOO_RIM; c.lineWidth = 1.5; } else { c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 1; }
      c.stroke();
    }
    if (nFade) for (const a of vis) {   // their heads under the HUD, each at its own fade
      if (a.boss) continue;
      const A = AX.get(a);
      if (!(A.hf < 1) || (A.cl && A.cf >= 1)) continue;
      const k = farS(Math.abs(a.y - p.y)), x = A.rx + (A.cl ? A.kp + A.jx : 0), y = this.sy(a.y + A.oy), h = A.hd || 0;
      c.globalAlpha = A.hf; c.fillStyle = CROWD[((a.face || 0) % 6 + 6) % 6]; c.beginPath(); c.ellipse(x, y, 7.5 * k, 10 * k, h, 0, TAU); c.fill();
      if (this.gooOn) { c.strokeStyle = GOO_RIM; c.lineWidth = 1.5; } else { c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 1; }
      c.stroke();
    }
    c.globalAlpha = 1;
    // their plain faces: two eyes (a blink every 3.3 s) turned with the head, within 320
    c.fillStyle = '#2a1030';
    for (const a of vis) {
      if (a.boss || Math.abs(a.y - p.y) >= 320) continue;
      const A = AX.get(a);
      if (A.cl && A.cf >= 1) continue;
      const k = farS(Math.abs(a.y - p.y)), y = this.sy(a.y + A.oy), x = A.rx + (A.cl ? A.kp + A.jx : 0), h = A.hd || 0, ch = Math.cos(h) * k, sh = Math.sin(h) * k;
      c.globalAlpha = A.hf;
      const bl = ((t + a.ph * 3) % 3.3) < 0.12, ew = bl ? 2.4 * k : 1.6 * k, eh = bl ? 0.9 * k : 2.2 * k, ey = bl ? -1.55 : -1.4;
      for (let s2 = -1; s2 <= 1; s2 += 2) {
        const lx = s2 * 1.8, cx = x + lx * ch - ey * sh, cy = y + lx * sh + ey * ch;
        c.fillRect(cx - ew / 2, cy - eh / 2, ew, eh);
      }
    }
    c.globalAlpha = 1;
    // the close ones: baked heads over their tails (fading out across 170..200)
    if (close.length) {
      const m = WM;
      for (const a of close) {
        const A = AX.get(a), x = A.rx + (A.kp || 0), y = this.sy(a.y + A.oy), f = (a.face || 0) % 6, ci = f === 4 ? Math.floor(a.ph * 10) % CAPS.length : 0;
        const behind = a.y < p.y, dx = Math.abs(x - p.x), bt = Math.max(a.bumpT || 0, A.bt), pt = Math.max(a.passT || 0, A.pt);
        let ex = 0;
        if (bt > 0) ex = 4;
        else if (reactK >= 0) ex = 2;              // Kevin won: everyone else is worried now
        else if (pt > 0) ex = 5;
        else if (behind && p.y - a.y < 70) ex = 2;
        else if (!behind && dx < 22 && a.y - p.y < 100) ex = 3;
        else if (a === race.draftTarget && p.draft > 0.05) ex = 3;   // you are in its slipstream: it glares
        else if (((t + a.ph * 3) % 3.3) < 0.12) ex = 1;
        // Kevin is on fire: everyone within 200 stares in awe (star-struck in FRENZY)
        if (hot && ex !== 4 && ex !== 5 && Math.hypot(x - p.x, a.y - p.y) < 200) ex = fz && !red ? 7 : 6;
        let sx = 1, sy = 1;
        const jx = A.jx || 0;
        if (pn && ex !== 4 && nearW(a, 110, false) >= 0) ex = 5;   // panic (the shake itself is A.jx, set with the tail)
        // Kevin got hit (or died) within 160: a gasp for 0.3 s, then a smirk
        if (oopsOn && ex !== 4 && Math.hypot(x - p.x, a.y - p.y) < 160) ex = T - this.oopsAt < 0.3 ? 5 : 3;
        const look = ex === 2 || ex >= 5 ? 0 : Math.hypot(x - p.x, a.y - p.y) < 60 ? (p.x > x ? 1 : -1) : 0;
        if (A.bt > 0) { const e = 0.8 - A.bt; sy = 1 - 0.25 * Math.cos(e * 22) * Math.exp(-e * 7); sx = 1 + (1 - sy) * 0.8; }
        if (A.sqU > T) { sx *= 1.25; sy *= 0.8; }   // just got passed
        if (A.cz < 0) { sx *= 1.06; sy *= 0.88; } else if (A.cz !== 1) { sy *= A.cz; sx /= Math.sqrt(A.cz); }   // coiled / springing off
        const hit = this.isImp(a);
        if (hit) { sx *= 1.12; sy *= 0.88; }
        // a per-stroke pulse: the head stretches a touch on each tail beat (volume kept)
        const st = 1 + (red ? 0.025 : 0.05) * Math.max(0, Math.sin(A.ph));
        sx /= Math.sqrt(st); sy *= st;
        setXf(c, m, x + jx, y, A.hd - Math.sin(A.ph) * 0.07, sx, sy);
        c.globalAlpha = A.cf * A.hf; c.drawImage(this.headSpr(f, ci, ex, look), -10, -19, 20, 34);
        if (hit) { c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 0, 8, 10.5, 0, 0, TAU); c.fill(); }
      }
      c.setTransform(m); c.globalAlpha = 1;
      if (this.gooOn) {   // the Goo's dark head rims, one batched stroke
        c.strokeStyle = GOO_RIM; c.lineWidth = 1.5; c.beginPath();
        for (const a of close) { if (A_cf(AX, a) < 0.5) continue; const A = AX.get(a), x = A.rx + (A.kp || 0) + (A.jx || 0), y = this.sy(a.y + A.oy), h = A.hd || 0; c.moveTo(x + 8.6 * Math.cos(h), y + 8.6 * Math.sin(h)); c.ellipse(x, y, 8.6, 11.2, h, 0, TAU); }
        c.stroke();
      }
      c.fillStyle = '#ffd75c';
      for (const a of close) { const A = AX.get(a); if (Math.max(a.bumpT || 0, A.bt) > 0) { const x = A.rx + (A.kp || 0), y = this.sy(a.y + A.oy); for (let i = 0; i < 2; i++) { const an = t * 8 + i * Math.PI; star4(c, x + Math.cos(an) * 10, y - 13 + Math.sin(an) * 3, 2.6); } } }
    }
    // the named rivals, each with a signature swim
    const o = this.scr;
    const wk = clamp(this.winT / 1.2, 0, 1), wo = 1 - (1 - wk) * (1 - wk);
    // the win's fling: 0.9 to 1.6 s after, the losers fly off the egg in slow motion (0.4x)
    const flingK = win ? clamp((this.endT - 0.9) / 0.7, 0, 1) : 0, fo = 1 - (1 - flingK) * (1 - flingK);
    const dft = race.draftTarget && p.draft > 0.05 ? race.draftTarget : null;
    this.labelQ = true;
    for (const a of vis) if (a.boss) {
      const A = AX.get(a), nm = a.boss.name, fn = A.fn || (A.fn = nm.split(' ')[0]), L = BOSS_LOOK[fn] || {}, dq = this.duel.get(a), nem = !!this.nemesis && fn === this.nemesis;
      if (dq && late && a === race.eggTaken) continue;   // it is inside the egg now (drawEgg draws it)
      let x = A.rx, y = this.sy(a.y + A.oy), ang = L.straight ? 0 : A.hd, sx = L.sx || 1, sy = L.sy || 1;
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
      A.ppt = pt; A.pbt = bt; A.ptt = a.tauntT || 0; A.pgl = gloat;
      if (want && !ov && (gw || T - A.trT >= 2.5)) { A.tr = want; A.trT = T; if (want === 'roll' && L.tilt) A.tiltS = -(A.tiltS || 1); }
      // Kevin's misfortune: each named rival within 260 (not duelling, not bumped) plays its own beat, at most every 2.5 s
      if (oopsOn && A.oops !== this.oopsId && !dq && !(bt > 0) && Math.hypot(x - p.x, a.y - p.y) < 260) {
        A.oops = this.oopsId;
        if (T - A.trT >= 2.5) { A.oopsT = T; A.oopsK = this.oopsKind; A.oopsD = this.oopsDur || 0.9; A.trT = T; A.tr = null; }
      }
      // the first meeting: the first frame Kevin is within 400, the rival shows off its signature trick for 1.2 s
      const dK = Math.hypot(x - p.x, a.y - p.y);
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
      const wi = dq ? -1 : pn ? nearW(a, 110) : -1;
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
      if (gloat) { const dx = clamp((p.x - x) / 120, -0.45, 0.45); ang += dx; }
      if (sprint) {   // puffs come off the tail end (behind it), never in front of its nose
        A.stm = (A.stm || 0) - dt;
        if (A.stm <= 0) { A.stm = 0.15; this.addP(0, x + (Math.random() - 0.5) * 8, a.y + A.oy - 30, (Math.random() - 0.5) * 24, -30 - Math.random() * 20, 0.5, '#f4eeff', 2 + Math.random() * 1.5); }
      }
      if (L.strut && !dq) { ang += Math.sin(t * 3 + a.ph) * 0.22; x += Math.sin(t * 3 + a.ph) * 3; }
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
      o.blink = blinkAt(t + a.ph * 3, L.blink || 2.9, L.dbl); o.happy = 0; o.blush = blushR; o.star = undefined; o.tired = 0; o.flash = 0; o.tail = undefined; o.flap = 1; o.crown = 0; o.wink = 0; o.ko = 0;
      // Kevin's secondary motion: head counter-yaw, a tail that lags turns, a stroke surge on each beat
      o.yaw = 1; o.curl = red ? 0 : clamp(-(A.av || 0) * 0.22, -0.5, 0.5);
      o.stretch = 1 + 0.05 * (red ? 0.5 : 1) * Math.max(0, Math.sin(ph));
      if (o.dizzy) o.mouth = 'wobble';
      else if (gloat) { o.mouth = 'grin'; o.brow = 'angry'; o.wink = 1; o.look = p.x > x ? 1.2 : -1.2; o.blink = false; }
      else if (strain > 0.2) { o.mouth = 'grit'; o.brow = 'angry'; o.tired = 1; }
      else if (drafted) { o.brow = 'angry'; o.look = clamp((p.x - x) / 30, -1.2, 1.2); if (grit) o.mouth = 'grit'; }
      else if (sprint) { o.mouth = 'pant'; o.brow = 'angry'; o.flap = 2; }
      else if (hunter && !(pt > 0)) { o.mouth = 'grit'; o.brow = 'angry'; o.look = p.x > x ? 1.2 : -1.2; }
      // a hot Kevin within 220: the rivals look at him, worried (Steve is just happy for him, and blushes)
      if (hot && dK < 220 && !dq && !(bt > 0)) {
        if (fn === 'Steve') { o.happy = 1; o.blush = 1; o.mouth = 'grin'; o.brow = undefined; }
        else { o.brow = 'worried'; o.look = clamp((p.x - x) / 30, -1.2, 1.2); o.blink = false; if (o.mouth === L.mouth) o.mouth = 'scared'; }
      }
      if (wi >= 0 && !(bt > 0) && nearW(a, 110, false) >= 0) { o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; o.look = 0; o.blink = false; }
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
      if (win && rk >= 0) {
        o.dizzy = rk < 0.15 && knocked ? 1 : 0;
        if (fn === 'Steve') { o.mouth = 'grin'; o.brow = undefined; o.happy = rk < 1 ? 1 : 0; o.blush = 1; }
        else if (fn === 'Brock') { o.mouth = rk < 1 ? 'grit' : 'wobble'; o.brow = 'worried'; }
        else if (fn === 'Tiffany') { o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; o.look = 0; o.blink = false; }
        else if (fn === 'Gunther') { o.mouth = 'wobble'; o.brow = undefined; }
        else if (fn === 'Chad') { o.mouth = 'smirk'; o.brow = 'angry'; o.look = p.x > x ? -1.2 : 1.2; }
      }
      if (this.isImp(a)) { o.flash = 1; o.tail = '#ffffff'; }
      // heroes stand out: an ink outline, and the last third of the tail in the rival's own colour
      o.ink = 1; o.tipCol = a.boss.col;
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
      if (fade > 0.06 && !beatOn && !dq && !ov && !sprint && !mv && !drafted && !(strain > 0.2) && wi < 0 && !o.dizzy) {
        o.mouth = 'pant'; o.tired = 1; o.amp *= 0.7; o.curl = (o.curl || 0) + (red ? 0.12 : 0.1 + 0.05 * Math.sin(t * 1.3 + a.ph));
        A.swd = (A.swd == null ? Math.random() * 0.9 : A.swd) - dt;
        if (A.swd <= 0) { A.swd = 0.9; const sg = Math.random() < 0.5 ? -1 : 1; this.addP(3, x + sg * 11, a.y + A.oy + 12, sg * (30 + Math.random() * 30), 30 + Math.random() * 30, 0.6, '#9ae2ff', 2.4, 220); }
      }
      const faceKey = o.mouth + '|' + o.brow + '|' + (o.shock ? 1 : 0) + '|' + (o.dizzy ? 1 : 0);
      if (faceKey !== A.fk) { if (beatOn && A.fk !== '') A.popT = T; A.fk = faceKey; }
      A.headK = this.popK(A.popT, beatOn, T); o.headK = A.headK;
      const sq = this.impSquash(a, x, y);
      this.drawSwimmer(x, y, ang, RIVAL_SC, bodyCol, ph, o);
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
        for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * (14 + 5 * flexK), y - 6 - 4 * flexK, 2.2 + 1.6 * flexK, 0, TAU); c.fill(); c.beginPath(); c.arc(x + s * (18 + 6 * flexK), y - 10 - 5 * flexK, 1.4 + flexK, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
      }
    }
    this.drawBooks(dt);
    this.drawGhosts(dt);
    this.flushLabels(race, dt);
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
  rivalGhost(a) {
    const A = this.ax(a), fn = A.fn || (A.fn = a.boss.name.split(' ')[0]);
    const g = { fn, col: css(lerpC(rgb(a.boss.col), [255, 255, 255], 0.45)), halo: a.boss.col, x: A.rx, y: a.y + (A.oy || 0), t: 0, max: 1.6, ph: A.tp || 0, sx: A.rx, sy: this.sy(a.y) };
    this.ghosts.push(g);
    if (this.ghosts.length > 4) this.ghosts.shift();
    const line = lineOf(K.RIVAL_FAREWELLS, fn, a.boss.name);
    if (line) { this.say(fn, line, 1.6); this.bubble.ghost = g; }
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
    const dK = (x, y) => { const dx = Math.max(x - w / 2 - kx, 0, kx - x - w / 2), dy = Math.max(y - ky, 0, ky - y - h); return Math.hypot(dx, dy); };
    const far = hx >= kx ? 1 : -1;   // the speaker's side away from Kevin
    const C = this._bubC || (this._bubC = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    C[0][0] = fit(hx); C[0][1] = hy - 30 - h; C[0][2] = 0;                           // above
    const below = [fit(hx), hy + 26, 1], side = [fit(hx + far * (w / 2 + 18)), hy - h / 2, 2];
    const second = ky < hy ? below : side, third = ky < hy ? side : below;
    C[1][0] = second[0]; C[1][1] = second[1]; C[1][2] = second[2]; C[2][0] = third[0]; C[2][1] = third[1]; C[2][2] = third[2];
    let pick = C[0], best = -1;
    if (!(p && !race.demo) || dK(C[0][0], C[0][1]) >= 70) pick = C[0];
    else for (const q of C) { const d = dK(q[0], q[1]); if (d >= 70) { pick = q; break; } if (d > best) { best = d; pick = q; } }
    const bx = pick[0];
    let by = pick[1], mode = pick[2];
    // the egg duel: a plate never covers her face (eyes, mouth and cheeks: 100 x 50 / 78 round her centre). It
    // drops below the speaker, or goes beside it, or as a last resort clears the face box downwards
    if (race.drill) {
      const ex = centre(RACE_LEN), ey = this.sy(RACE_LEN + 120);
      const onFace = (x, y) => x + w / 2 > ex - 100 && x - w / 2 < ex + 100 && y + h > ey - 50 && y < ey + 78;
      if (onFace(bx, by)) {
        if (!onFace(below[0], below[1])) { pick = below; } else if (!onFace(side[0], side[1])) { pick = side; } else { pick = below; pick[1] = ey + 82; }
        by = pick[1]; mode = pick[1] >= hy ? 1 : pick[2];
        return this.placeBubble(c, a, pick[0], by, w, h, hx, hy, mode, lh, b);
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
    // never into the top-left 140 x 60 banner corner, or under the HUD: there it is dropped
    if ((bx - w / 2 < 140 && by < 60) || (!race.over && by < this.hudB())) return null;
    return this.placeBubble(c, a, bx, by, w, h, hx, hy, mode, lh, b);
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
    c.fillStyle = '#2a0a24'; c.textAlign = 'center'; c.textBaseline = 'middle';
    b.lines.forEach((l, i) => c.fillText(l, bx, by + 5 + lh / 2 + i * lh));
    c.restore();
  }
  drawSwimmer(x, y, ang, sc, col, ph, o = {}) {
    const c = this.ctx, st = o.stretch || 1;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc * (o.sx || 1), sc * (o.sy || 1));
    // tail (o.ink: Kevin and the named rivals get a 1.6x dark under-stroke first, so they read on pale floors)
    c.lineCap = 'round'; c.lineJoin = 'round';
    const tl = 34 * (0.8 + 0.2 * st) * (o.tlen || 1);
    if (o.ink) {
      c.strokeStyle = 'rgba(42,10,36,0.5)';
      if (o.taper) this.taperTail(c, tl, o.amp || 6, ph, (o.tw || 3.4) * 1.6, o.curl || 0);
      else { c.lineWidth = 2.2 * 1.6; c.beginPath(); this.tail(c, 0, 8, 0, 32, o.amp || 6, ph); c.stroke(); }
    }
    c.strokeStyle = o.tail || 'rgba(255,255,255,0.92)';
    // (one tail only: the stripes ride on the tapered tail, the plain whip is for untapered swimmers alone)
    if (o.taper) {
      this.taperTail(c, tl, o.amp || 6, ph, o.tw || 3.4, o.curl || 0, o.tail ? null : o.tipCol || null);
      if (o.stripeN > 0 && o.stripes) this.tailStripes(c, tl, o.amp || 6, ph, o.tw || 3.4, o.curl || 0, o.stripes, o.stripeN);
    } else { c.lineWidth = 2.2; c.beginPath(); this.tail(c, 0, 8, 0, 32, o.amp || 6, ph); c.stroke(); }
    if (o.yaw) c.rotate(-Math.sin(ph) * 0.06);   // the head counter-yaws against the tail beat
    c.scale(1 / Math.sqrt(st), st);
    // o.headK: a face-change pop scales the head alone (round its centre, after the tail), so a new face reads
    const hk = o.headK || 1; if (hk !== 1) c.scale(hk, hk);
    // the Goo: a 1.5 px navy rim on every rival head, so they read on the pale periwinkle
    const gr = this.gooOn && !o.rim && o !== this.kevO && o !== this.ghO && o !== this.tsO && o !== this.buddyO;
    if (gr) { o.rim = GOO_RIM; o.rimW = 1.5 / sc; }
    this.head(c, col, ph, o);
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
    // widths straight from the baked name-tag sprites (no measureText a frame)
    for (let i = 0; i < n; i++) {
      const q = L[i]; if (q.skip) continue;
      if (q.style === 'small') { const sp = this.text(q.text, q.col, this.fpx(11)); q.spr = sp; q.w = sp.w * 0.85; q.h = sp.h * 0.6; continue; }
      const lfs = q.style === 'lead' ? Math.round(14 * (this.textScale || 1)) : q.fs || fs;
      const sp = this.text(q.text, this.labelCol(q.col), lfs, 'label'); q.spr = sp;
      q.w = q.fs ? sp.w * q.sc : sp.w; q.h = q.fs ? q.fs * 1.35 * q.sc : sp.ph;
    }
    const S = this._lsort || (this._lsort = []); S.length = 0;
    for (let i = 0; i < n; i++) if (!L[i].skip) S.push(L[i]);
    S.sort((a, b) => a.x - b.x);
    const m = S.length;
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
    for (let i = 0; i < m; i++) {
      const q = S[i];
      for (let j = 0; j < bn; j += 4) if (Math.abs(BB[j] - q.x) < BB[j + 2] + q.w / 2 && Math.abs(BB[j + 1] - q.y) < BB[j + 3] + h * 0.6) { q.skip = true; break; }
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
        const mm = c.getTransform();
        c.translate(q.x, q.y); c.scale(q.sc, q.sc);
        this.drawLabel(0, 0, q.text, q.col, q.fs, q.ring, false);
        c.setTransform(mm);
      } else this.drawLabel(q.x, q.y, q.text, q.col, fs, 0, false);
    }
  }
  // a name label: a dark pill, a thick dark outline, and a dark rival colour lifted 35% toward white so it reads
  // anywhere (Tiffany on the gold egg). ring > 0 adds a pulsing outline in the rival's colour.
  drawLabel(x, y, text, col, fs = this.fpx(13), ring = 0, rec = true) {
    const c = this.ctx, s = this.text(text, this.labelCol(col), fs, 'label');
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
      if (o.ink) { const ga = c.globalAlpha; c.globalAlpha = ga * 0.85; c.strokeStyle = HZ_INK; c.lineWidth = 1.5; c.stroke(); c.globalAlpha = ga; }
      c.fill();
    }
    c.beginPath(); if (o.round) c.arc(0, 0, 9.5, 0, TAU); else c.ellipse(0, 0, 7.5, 10, 0, 0, TAU); c.fill();
    if (o.ink) { const ga = c.globalAlpha; c.globalAlpha = ga * 0.85; c.strokeStyle = HZ_INK; c.lineWidth = 1.5; c.stroke(); c.globalAlpha = ga; }
    else { c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 1; c.stroke(); }
    if (o.rim) {   // Kevin's identity rim: just outside the ink, under his accessories
      const rw = o.rimW || 1.7, d = 0.75 + rw / 2;
      c.strokeStyle = o.rim; c.lineWidth = rw; c.beginPath(); if (o.round) c.arc(0, 0, 9.5 + d, 0, TAU); else c.ellipse(0, 0, 7.5 + d, 10 + d, 0, 0, TAU); c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.beginPath(); c.ellipse(1.8, 3, 5, 6.5, 0, -0.6, 2.2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-2.6, -4.5, 2.4, 3.4, -0.4, 0, TAU); c.fill();
    if (o.flash > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(1, o.flash)})`; c.beginPath(); c.ellipse(0, 0, 7.8, 10.3, 0, 0, TAU); c.fill(); }
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
    if (o.blush) { c.fillStyle = 'rgba(255,90,130,0.45)'; c.beginPath(); c.ellipse(-4.6, 1.4, 1.8, 1.1, 0, 0, TAU); c.ellipse(4.6, 1.4, 1.8, 1.1, 0, 0, TAU); c.fill(); }
    // eyes
    // o.ink (Kevin and the named rivals, about 17 x 23 CSS px on a phone): bolder brows, pupils, mouth and eye whites
    // so the faces read at that size; the crowd keeps the thin version
    const look = o.look || 0, ink = '#1a0a1a', bold = !!o.ink, er = o.shock ? (bold ? 3.8 : 3.4) : bold ? 3.3 : 2.9, lw2 = bold ? 1.6 : 1.1;
    for (const sx of [-1, 1]) {
      const ex = sx * 3.2, ey = -2.5;
      if (o.ouch) {   // squeezed shut: '>' on the left, '<' on the right (two 2.2 px strokes each)
        c.strokeStyle = ink; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath();
        const d = -sx; c.moveTo(ex - d * 0.7, ey - 1.7); c.lineTo(ex + d * 0.7, ey); c.lineTo(ex - d * 0.7, ey + 1.7); c.stroke(); continue;
      }
      if (o.ko) { c.strokeStyle = ink; c.lineWidth = 1.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(ex - 1.2, ey - 1.2); c.lineTo(ex + 1.2, ey + 1.2); c.moveTo(ex + 1.2, ey - 1.2); c.lineTo(ex - 1.2, ey + 1.2); c.stroke(); continue; }
      if (o.dizzy) { c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath(); c.arc(ex, ey, 2, ph * 0.4, ph * 0.4 + 4.5); c.stroke(); c.beginPath(); c.arc(ex, ey, 0.8, 0, TAU); c.stroke(); continue; }
      if (o.wink && sx === 1) { c.strokeStyle = ink; c.lineWidth = bold ? 1.6 : 1.3; c.beginPath(); c.arc(ex, ey + 0.8, 2.1, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); continue; }
      if (o.blink || o.happy) { c.strokeStyle = ink; c.lineWidth = lw2; c.beginPath(); if (o.happy) c.arc(ex, ey + 0.6, 2, Math.PI * 1.1, Math.PI * 1.9); else { c.moveTo(ex - 2.4, ey); c.lineTo(ex + 2.4, ey); } c.stroke(); continue; }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill();
      if (o.star) { c.fillStyle = o.star; star4(c, ex + look * 0.6, ey - 0.4, 2.4); }
      else {
        c.fillStyle = ink; c.beginPath(); c.arc(ex + look, ey - 0.7 + (o.lookY || 0), o.shock ? (bold ? 1.2 : 0.9) : o.mouth === 'scared' ? (bold ? 1.3 : 1) : bold ? 1.9 : 1.45, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + look - 0.5, ey - 1.3 + (o.lookY || 0), 0.5, 0, TAU); c.fill();
      }
      if (o.tired) { c.fillStyle = col; c.beginPath(); c.arc(ex, ey, 3.1, Math.PI, TAU); c.fill(); c.strokeStyle = ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex - 3, ey); c.lineTo(ex + 3, ey); c.stroke(); }
      if (acc.includes('lashes')) { c.strokeStyle = ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex + sx * 2.4, ey - 1.8); c.lineTo(ex + sx * 3.8, ey - 3); c.moveTo(ex + sx * 1.2, ey - 2.8); c.lineTo(ex + sx * 1.9, ey - 4.3); c.stroke(); }
    }
    if (o.brow) {
      c.strokeStyle = ink; c.lineWidth = bold ? 1.7 : 1.1; c.lineCap = 'round'; c.beginPath();
      const b0 = bold ? 0.8 : 1.2, b1 = bold ? 5.6 : 5;
      for (const sx of [-1, 1]) { const inY = o.brow === 'angry' ? -5.2 : -7, outY = o.brow === 'angry' ? -6.8 : -5.6; c.moveTo(sx * b0, inY); c.lineTo(sx * b1, outY); }
      c.stroke();
    }
    if (acc.includes('glasses')) { gr = grow('glasses', 0, -2.5); c.strokeStyle = '#3a2a50'; c.lineWidth = 0.9; c.beginPath(); c.arc(-3.2, -2.5, 3.3, 0, TAU); c.moveTo(6.5, -2.5); c.arc(3.2, -2.5, 3.3, 0, TAU); c.moveTo(-0.1, -2.7); c.lineTo(0.1, -2.7); c.stroke(); if (gr) c.restore(); }
    if (acc.includes('shades') && !o.shadesOff) {
      // o.shadesY / o.shadesR / o.shadesS: lift, tilt (round the left temple) and scale the shades (reactive shades)
      const shY = o.shadesY || 0, shR = o.shadesR || 0, shS = o.shadesS == null ? 1 : o.shadesS, shM = shY !== 0 || shR !== 0 || shS !== 1;
      if (shM) {
        c.save(); c.translate(0, shY);
        if (shR) { c.translate(-6, -3); c.rotate(shR); c.translate(6, 3); }
        if (shS !== 1) { c.translate(0, -3); c.scale(shS, shS); c.translate(0, 3); }
      }
      gr = grow('shades', 0, -3); c.fillStyle = '#141420'; c.beginPath(); c.moveTo(-7, -4.6); c.lineTo(7, -4.6); c.lineTo(6.2, -1.2); c.quadraticCurveTo(3.6, 0.6, 1, -1.6); c.lineTo(-1, -1.6); c.quadraticCurveTo(-3.6, 0.6, -6.2, -1.2); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(-5.4, -4, 2, 0.9); c.fillRect(2, -4, 2, 0.9); if (gr) c.restore();
      if (shM) c.restore();
    }
    // mouth
    const m = o.mouth;
    c.strokeStyle = '#5a1020'; c.fillStyle = '#5a1020'; c.lineWidth = bold ? 1.7 : 1.2;
    if (m === 'grin') { c.beginPath(); c.arc(0, 2.4, 3.2, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(-1.8, 2.6, 3.6, 0.9); }
    else if (m === 'huge') { c.beginPath(); c.arc(0, 2, 4.4, 0, Math.PI); c.closePath(); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0, 4.8, 2.2, 1.2, 0, 0, TAU); c.fill(); }
    else if (m === 'scared') { c.beginPath(); c.ellipse(0, 4, 2, o.shock ? 3 : 2.6, 0, 0, TAU); c.fill(); }
    else if (m === 'pant') { c.beginPath(); c.ellipse(0, 4.2, 2.4, 1.6 + 0.8 * Math.abs(Math.sin(ph * 0.3)), 0, 0, TAU); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0.6, 5.8, 1.4, 1.4, 0, 0, TAU); c.fill(); }
    else if (m === 'grit') { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 4, 3.2, 1.6, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-3, 4); c.lineTo(3, 4); c.moveTo(-1, 2.6); c.lineTo(-1, 5.4); c.moveTo(1, 2.6); c.lineTo(1, 5.4); c.lineWidth = 0.6; c.stroke(); }
    else if (m === 'smirk') { c.beginPath(); c.moveTo(-2.4, 4.2); c.quadraticCurveTo(0.5, 5, 3, 2.8); c.stroke(); }
    else if (m === 'wobble') { c.beginPath(); c.moveTo(-3, 4); for (let i = 1; i <= 6; i++) c.lineTo(-3 + i, 4 + (i % 2 ? -0.7 : 0.7)); c.stroke(); }
    else { c.beginPath(); c.moveTo(-2, 4); c.quadraticCurveTo(0, 4.8, 2, 4); c.stroke(); }
    if (acc.includes('stache')) { gr = grow('stache', 0, 2.6); c.fillStyle = '#5a3418'; c.beginPath(); c.ellipse(-2, 2.6, 2.4, 1.2, 0.3, 0, TAU); c.ellipse(2, 2.6, 2.4, 1.2, -0.3, 0, TAU); c.fill(); c.beginPath(); c.arc(-4.3, 2, 0.9, 0, TAU); c.arc(4.3, 2, 0.9, 0, TAU); c.fill(); if (gr) c.restore(); }
    // headwear
    if (o.band || acc.includes('band')) {
      const bc = o.band || '#ff7a2f', fl = o.flap || 1; gr = grow('band', 0, -7);
      c.fillStyle = bc; c.beginPath(); c.moveTo(-7.4, -7.8); c.quadraticCurveTo(0, -9.6, 7.4, -7.8); c.lineTo(7.6, -5.2); c.quadraticCurveTo(0, -7, -7.6, -5.2); c.closePath(); c.fill();
      c.strokeStyle = bc; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const w1 = Math.sin(ph * 0.55 + k * 1.3) * 2.5 * fl, w2 = Math.sin(ph * 0.55 + 1.7 + k * 1.3) * 3.5 * fl, L = 6 + 3 * fl + k * 1.5;
        c.lineWidth = 2.2 - k * 0.4; c.beginPath(); c.moveTo(6.8, -6.4);
        c.quadraticCurveTo(6.8 + L * 0.6, -6.4 + L * 0.2 + w1, 6.8 + L * 0.7 + k * 1.5, -6.4 + L + w2); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-5, -8.4, 7, 0.8); if (gr) c.restore();
    }
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
    if (acc.includes('crown') || o.crown) {
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
      const band = playBand(p.y, p.side), sd = p.x - band.l > band.r - p.x ? -1 : 1, tx = clamp(p.x + sd * 34, band.l + 8, band.r - 8);
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
    if (this.accKey >= 0 && fresh && !race.demo) {
      const p = race.p;
      this.accNew = fresh; this.accT = 0.35;
      this.ring(p.x, p.y, '#ffd75c', 50, 0.35, 4);
      this.burst(p.x, p.y, '#ffd75c', 10, 150, 0.5, 2.6);
    }
    this.accKey = sum; this.accList = out;
    // (drawPlayer reads these every frame: worked out here, once per change, not per frame)
    this.accRest = out.filter((a) => a !== 'band'); this.accBand = out.includes('band') ? '#ffd75c' : '#ff3d6e';
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
        for (const e of race.ents) if (e.t === 'wbc' && !e.dead) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < best) { best = d; this.dieWbc = e; } }
        if (best > 400) this.dieWbc = null;
      }
    }
    if (dieR) this.dieT = red ? 0.9 : Math.min(0.9, this.dieT + dt);
    const dk = dieR ? clamp(this.dieT / 0.9, 0, 1) : 0, dke = dk * dk * (3 - 2 * dk);
    const dieKind = !dieR ? null : dieR === 'wbc' ? (this.dieWbc ? 'wbc' : 'energy') : dieR === 'wrong' ? 'wrong' : 'energy';
    const cause = dieKind === 'energy' && dieR === 'energy' ? ov.cause : null;
    if (race.drill) {
      const ex = centre(RACE_LEN), ey = this.sy(RACE_LEN + 120), dx = ex - x, dy = ey - y, dl = Math.hypot(dx, dy) || 1;
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
    // dash afterimages: three ice-blue ghosts of Kevin 40, 80 and 120 ms back down the trail (not for reduced motion)
    if (dash && !red && !win && !dieKind && this.trN > 8) {
      const ao = this.ghO || (this.ghO = { taper: 1, amp: 4, tw: 2.6, tail: 'rgba(140,220,255,0.8)', acc: [], mouth: 'grin' }), AL = [0.35, 0.22, 0.1];
      for (let i = 0; i < (this.lite ? 2 : 3); i++) {
        const j = (this.trH - 1 - Math.round(2.4 * (i + 1)) + TRAIL_N * 2) % TRAIL_N;
        c.globalAlpha = AL[i];
        this.drawSwimmer(this.trX[j], this.sy(this.trY[j]), p.heading || 0, scl, '#8cdcff', this.pPh - i * 0.8, ao);
      }
      c.globalAlpha = 1;
    } else if ((p.trickStreak | 0) >= 2 && !red && !win && !dieKind && !race.drill && this.trN > 8) {
      // a TRICK STREAK of 2+: three magenta afterimages trail him (not for reduced motion)
      const ao = this.tsO || (this.tsO = { taper: 1, amp: 5, tw: 3, tail: 'rgba(255,92,210,0.8)', acc: [], mouth: 'grin' }), AL = [0.32, 0.2, 0.1];
      for (let i = 0; i < (this.lite ? 2 : 3); i++) {
        const j = (this.trH - 1 - Math.round(2.4 * (i + 1)) + TRAIL_N * 2) % TRAIL_N;
        c.globalAlpha = AL[i];
        this.drawSwimmer(this.trX[j], this.sy(this.trY[j]), p.heading || 0, scl, '#ff5cd2', this.pPh - i * 0.8, ao);
      }
      c.globalAlpha = 1;
    }
    // aura: heats up with the combo, breathes with the beat
    const gk = 1 + 0.08 * beat;
    const aCol = frenzy ? '#ffd75c' : dash ? '#8cdcff' : p.acid > 0.2 ? '#9dff3c' : combo >= 3 ? HEAT[Math.min(7, Math.round(hk * 7))] : '#96ffaa';
    this.dglow(aCol, x, y, (frenzy ? 58 : 44 + 26 * hk) * gk * (scl / KEVIN_SC), (frenzy ? 0.7 : 0.45 + 0.35 * hk) * (1 - dke));
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
    const tw = kc < 0 ? 28 : dash ? 26 : frenzy ? 21 : 15 + (p.vy / 500) * 3;
    this.pTw += (tw - this.pTw) * Math.min(1, dt * 8); this.pPh += this.pTw * wdt;
    // wingman
    if (p.wing > 0 && !win) {
      const wo = this.buddyO || (this.buddyO = { band: '#5ce1ff', acc: ['glasses'], mouth: 'grin', blink: false });
      wo.blink = (t % 3) < 0.1;
      this.drawSwimmer(p.x - 26, this.sy(p.y) + 14 + Math.sin(t * 3) * 4, p.heading, 0.9, '#ffe0a8', this.pPh + 2, wo);
    }
    let danger = false; for (const e of race.ents) if (e.t === 'wbc' && !e.dead && Math.abs(e.y - p.y) < 130 && Math.hypot(e.x - p.x, e.y - p.y) < 120) { danger = true; break; }
    const blinkInv = p.inv > 0 && p.inv < 1 && Math.floor(t * 20) % 2 === 0 && !ov;
    const low = p.e < 30, stuck = p.stuck > 0;
    this.updateAcc(race);
    const accK = this.accT > 0 ? backOut(clamp(1 - this.accT / 0.35, 0, 1)) : 1;
    // one persistent options object (no garbage per frame): every field the face code below may set is reset first
    const o = this.kevO || (this.kevO = {});
    for (const k of KEV_RESET) o[k] = undefined;
    o.band = this.accBand; o.acc = this.accRest; o.accNew = this.accNew; o.accK = accK;
    o.taper = 1; o.flap = 1 + (dash ? 1.4 : 0) + (p.vy / 700);
    // a stroke surge on each tail beat: bigger dashing, smaller when tired, halved for reduced motion
    o.stretch = 1 + this.sq + (dash ? 0.08 : low ? 0.03 : 0.05) * (red ? 0.5 : 1) * Math.max(0, Math.sin(this.pPh));
    o.look = clamp(p.vx / 200, -1.2, 1.2); o.flash = this.pHit / 0.35;
    o.blink = !danger && !dash && (t % 3.4) < 0.12; o.yaw = 1; o.ink = 1;
    // Kevin's identity look, the whole race: a 2.5 px pink rim round his head (o.rim, in head())
    o.rim = '#ff5c8a'; o.rimW = 2.5 / KEVIN_SC;
    this.kevCol = o.band;
    // eye contact: a named rival within 140 px draws Kevin's look
    {
      let tl = null, bd = 140;
      const AG = race.agents, nr = Math.min(NRIV, AG.length);   // the named rivals are agents 0 .. RIVALS.length - 1
      for (let k = 0; k < nr; k++) { const a = AG[k]; if (!a.boss || !a.alive) continue; const A = this.aux.get(a); if (A && A.seen === this.frame && A.init) { const d = Math.hypot(A.rx - p.x, a.y - p.y); if (d < bd) { bd = d; tl = clamp((A.rx - p.x) / 30, -1.2, 1.2); } } }
      const want = tl != null ? tl : o.look;
      this.kLook = this.kLook == null ? want : this.kLook + (want - this.kLook) * Math.min(1, dt * 10);
      o.look = this.kLook;
    }
    // a rival taunted him: 0.8 s of huffing (angry brow, gritted teeth, puffed cheeks, two puffs of steam)
    if (this.huffNew) {
      this.huffNew = false;
      if (!ov) for (const s of [-1, 1]) this.addP(0, p.x + s * 8, p.y + 14, s * 30, 70 + Math.random() * 30, 0.55, '#ffffff', 3.2);
    }
    const huff = this.huffT > 0 && !ov;
    // ouch: the 0.35 s after a hit (over FRENZY, a dash and the combo faces; under a bonk's daze and a death)
    const ouch = this.pHit > 0 && !stuck && !ov;
    if (stuck) { o.dizzy = 1; o.mouth = 'wobble'; }
    else if (ouch) { o.ouch = 1; o.mouth = 'wobble'; o.brow = 'worried'; o.star = undefined; o.happy = 0; o.blink = false; }
    else if (danger) { o.mouth = 'scared'; o.brow = 'worried'; }
    else if (huff) { o.mouth = 'grit'; o.brow = 'angry'; o.puff = red ? 1 : 0.8 + 0.2 * Math.sin(t * 20); o.blink = false; }
    else if (frenzy) { o.mouth = 'huge'; o.star = '#ffd75c'; o.blush = 1; }
    else if (dash) { o.mouth = 'grin'; o.brow = 'angry'; }
    else if (combo > 5) { o.mouth = 'grin'; o.blush = 1; }
    else if (low) { o.mouth = 'pant'; o.tired = 1; o.brow = 'worried'; }
    else if (race.drill) { o.mouth = 'grin'; o.happy = 1; o.blush = 1; }
    // micro reactions on top (never over a bonk or a Big Mac in your face)
    if (!stuck && !danger && !huff && !ouch) {
      if (this.nearT > 0.35) { o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; o.star = undefined; o.happy = 0; o.blink = false; }
      else if (this.nearT > 0) { o.mouth = 'grin'; o.blush = 1; o.brow = undefined; }
      if (this.chompT > 0) { o.mouth = 'huge'; o.blink = false; }
      if (this.winkT > 0 && !(this.nearT > 0.35)) { o.wink = 1; o.happy = 0; o.star = undefined; if (!this.chompT) o.mouth = 'smirk'; }
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
      const bits = (ouch ? 1 : 0) | (huff ? 2 : 0) | (this.nearT > 0 ? 4 : 0) | (this.winkT > 0 ? 8 : 0) | (frenzy ? 16 : 0);
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
    // the hero silhouette: a thicker, longer tail with a pink tip (a whip-thin 3 while dashing)
    o.tw = dash ? 3 : 4.4; o.tlen = 1.15; o.tipCol = '#ff5c8a';
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
    // squashed 8% toward the wall he presses (and nudged that way), springing back with the bulge
    if (this.wallT > 0 && !dieKind && !win) { const k = Math.max(0, this.wallK()); o.sx = (o.sx || 1) * (1 - 0.08 * k); o.sy = (o.sy || 1) * (1 + 0.03 * k); x += (this.wallS || 0) * 1.5 * k; }
    let showKevin = true;
    if (dieKind) {
      // wipe the live expressions, then pose
      o.star = undefined; o.happy = 0; o.wink = 0; o.blink = false; o.blush = 0; o.dizzy = 0; o.tired = 0; o.flash = 0; o.stretch = 1;
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
      const gx = this.ghostX, gy = this.sy(p.y - 10), band = playBand(p.y, p.side), edge = gx <= band.l + 1.5 || gx >= band.r - 1.5;
      const pul = edge && !red ? 0.5 + 0.5 * Math.sin(t * 16) : 0, col = edge ? '#ff4d5e' : css(this.wallC);
      c.globalAlpha = (0.35 + 0.25 * pul) * this.ghostA; c.strokeStyle = col; c.lineWidth = 2;
      c.beginPath(); c.arc(gx, gy, 10 * (1 + 0.15 * pul), 0, TAU); c.stroke();
      const dx = gx - x, dy = gy - y, dl = Math.hypot(dx, dy);
      if (dl > 24) {
        c.setLineDash([2, 4]); c.beginPath(); c.moveTo(x + dx / dl * 12, y + dy / dl * 12); c.lineTo(gx - dx / dl * 11, gy - dy / dl * 11); c.stroke(); c.setLineDash([]);
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
    if (this.isImp('kevin')) { o.flash = 1; o.tail = '#ffffff'; }
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
    if (!blinkInv && showKevin) {
      const sq = this.impSquash('kevin', x, y);
      this.drawSwimmer(x, y, ang, scl, body, this.pPh, o);
      if (sq) c.restore();
      const m = c.getTransform();
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
      // the race bib: pinned to his forehead, the trailing corner fluttering with the tail (gone under the crown)
      if (!o.crown && !this.bibGone && !dieKind && !this.accList.includes('crown')) {
        setXf(c, m, x, y, ang, scl * (o.sx || 1), scl * (o.sy || 1));
        if (o.yaw) c.rotate(-Math.sin(this.pPh) * 0.06);
        const st = o.stretch || 1; c.scale(1 / Math.sqrt(st), st);
        const fl = red ? 0 : Math.sin(this.pPh * 0.8) * 0.9;
        if (HEADWEAR.some((q) => this.accList.includes(q))) c.translate(0, 1.5);   // under a cap, mohawk or bow
        c.beginPath(); c.moveTo(-5, -10.6); c.lineTo(5, -10.6); c.quadraticCurveTo(6, -10.6, 6, -9.6);
        c.lineTo(6.4 + fl * 0.4, -6.6 + fl); c.lineTo(-5, -6.6); c.quadraticCurveTo(-6, -6.6, -6, -7.6); c.lineTo(-6, -9.6); c.quadraticCurveTo(-6, -10.6, -5, -10.6); c.closePath();
        c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = '#ff3d6e'; c.lineWidth = 0.5; c.stroke();
        c.fillStyle = '#ff3d6e'; c.fillRect(-6, -9.9, 12, 0.6);
        c.fillStyle = '#2a0a24'; for (let i = 0; i < 4; i++) c.fillRect(-3.4 + i * 1.9, -8.4, 1.2, 0.9);
        c.setTransform(m);
      }
    }
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
    // dizzy stars after a bonk
    if (stuck || p.inv > 0.6) {
      c.fillStyle = '#ffd75c';
      for (let i = 0; i < 3; i++) { const a = t * 7 + i * TAU / 3; star4(c, x + Math.cos(a) * 14, y - 18 + Math.sin(a) * 4, 3); }
    }
    // shields: bubbly hex shimmer, at most 3 rings (r 24 / 29 / 34) in one path and one stroke, a 4th thicker solid
    // ring past 3. The HUD pill owns the count: a baked 'xN' plate shows beside the rings for 1.2 s after the count
    // changes only (a 1.3 to 1.0 scale pop, fading over its last 0.3 s)
    const nSh = ov ? 0 : Math.max(0, p.shield | 0);
    if (nSh !== this.shLast) { if (this.shLast != null && nSh > 0) this.shChgT = this.time; this.shLast = nSh; }
    if (nSh > 0) {
      const nr = Math.min(3, nSh), sw = red ? 0 : 1.5;
      c.strokeStyle = SHIELD_COL[nr - 1]; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < nr; i++) {
        const r = 24 + i * 5 + Math.sin(t * 6 + i) * sw, a0 = red ? i * 0.5 : t * (i % 2 ? -0.8 : 0.8);
        for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU + a0; k ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      }
      c.stroke();
      if (nSh > 3) {
        const r = 40 + Math.sin(t * 6 + 3) * sw, a0 = red ? 1.5 : t * -0.6;
        c.strokeStyle = '#ffd75c'; c.lineWidth = 3.5; c.beginPath();
        for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU + a0; k ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        c.stroke();
      }
      const age = this.time - (this.shChgT == null ? -99 : this.shChgT);
      if (age >= 0 && age < 1.2) {
        const lb = SHIELD_LBL[Math.min(nSh, 99)] || (SHIELD_LBL[Math.min(nSh, 99)] = 'x' + Math.min(nSh, 99)), sp = this.text(lb, '#ffd75c', 13, 'label');
        const lx = this.labBeside(x, 40, sp.w, x > VIEW_W - 80 ? -1 : 1), ly = y - 24;   // beside the rings (the YOU tag owns the top)
        const ps = red ? 1 : 1.3 - 0.3 * clamp(age / 0.15, 0, 1), m = c.getTransform();
        c.globalAlpha = age > 0.9 ? (1.2 - age) / 0.3 : 1;
        setXf(c, m, lx, ly, 0, ps, ps); c.drawImage(sp.cv, -sp.w / 2, -sp.h / 2, sp.w, sp.h); c.setTransform(m);
        c.globalAlpha = 1;
      }
    }
    // running dry: a shrinking energy arc, and a cracked hex when nothing is protecting you
    const ef = p.e / (p.maxE || 100);
    if (ef < 0.3 && !race.over && !race.drill) {
      const k = clamp(ef / 0.3, 0, 1), pul = ef < 0.12 && !red ? 0.55 + 0.45 * Math.sin(t * 4) : 1;
      c.lineCap = 'round'; c.globalAlpha = pul;
      c.strokeStyle = css(lerpC(rgb('#ff3d5a'), rgb('#7dffb0'), k, SCR)); c.lineWidth = 4;
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
      c.strokeStyle = `rgba(140,220,255,${Math.min(0.9, p.draft * 2)})`; c.lineWidth = 1.5; c.setLineDash([4, 5]); c.lineDashOffset = -t * 40;
      c.beginPath(); c.moveTo(x - 9, y - 12); c.lineTo(tx - 5, ty + 8); c.moveTo(x + 9, y - 12); c.lineTo(tx + 5, ty + 8); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
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
  // 1 on the first ever swim (meta-run 0) for 4 s after GO (and through the countdown), fading to 0 by 4.5 s.
  // R.firstRun (main.js) wins when it is set; otherwise the race's meta says so
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
  drawYou(race) {
    const a = this.youA || 0;
    if (a <= 0) return;
    const c = this.ctx, x = this.youX, y = this.youY, b = this.reduced ? 0 : Math.sin(this.time * 8) * 3, AX = this.aux;
    let blk = 0;   // 0 clear, else the side the blocker is on (-1 left, 1 right)
    // a swimmer's head 10 to 66 px above him blocks; so does one up to 66 + its tail (a rival's 34 x 1.3 + 8, the
    // crowd's 40) whose tail hangs into the tag
    const L1 = this._close, L2 = this._vis;
    for (let li = 0; li < 2 && !blk; li++) {
      const L = li ? L2 : L1;
      if (!L) continue;
      for (let i = 0; i < L.length && !blk; i++) {
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
    if (!hold && this.firstK(race) >= 1) {
      const s1 = this.text('YOU', '#ffffff', 18), tuck = this.fingerUp();
      const ay0 = tuck ? 24 : 28, ay1 = tuck ? 33 : 40, ty = tuck ? y - ay1 - 1 - s1.h / 2 + b * 0.5 : y - 58 + b;
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
    c.globalAlpha = a; c.fillStyle = '#ff3d6e'; c.beginPath();
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
      const R = 46, sp = red ? 0 : 2.2, m = c.getTransform();
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
    const c = this.ctx, m0 = c.getTransform(), capB = this.lite ? 3 : 6;
    let nb = 0;
    for (const f of race.fx) {
      const y = this.sy(f.y), k = clamp(f.age / 1.2, 0, 1);
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
    for (const r of this.rings) {
      r.life -= wdt; if (r.life <= 0) continue; this.rings[n++] = r;
      const k = 1 - r.life / r.max, e = 1 - (1 - k) * (1 - k);
      c.globalAlpha = 1 - k; c.strokeStyle = r.col; c.lineWidth = r.w * (1 - k) + 0.5;
      c.beginPath(); c.arc(r.x, this.sy(r.y), 6 + r.r * e, 0, TAU); c.stroke();
    }
    this.rings.length = n; c.globalAlpha = 1;
    // a 4+ pop chain: the popped cell's outline glows white for 0.12 s (a thick soft ring over a thin bright one)
    const PG = this.popGlows;
    if (PG && PG.length) {
      let gn = 0;
      for (const g of PG) {
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
    // (the bucket Map is never cleared: its colours come from fixed palettes, so it settles and stops allocating)
    for (const v of SB.values()) { v[0].length = 0; v[1].length = 0; v[2].length = 0; }
    let live = 0;
    this.hfB = race.demo || race.over ? null : this.hudB();
    for (let i = 0; i < NP; i++) {
      const q = P[i];
      if (q.life <= 0) continue;
      q.life -= wdt; if (q.life <= 0) continue;
      live = i + 1;
      q.x += q.vx * wdt; q.y += q.vy * wdt; q.vy -= q.g * wdt;
      if (q.k === 2) { q.vx *= d985; q.vy *= d97; } else { q.vx *= d94; if (q.k !== 3) q.vy *= d94; }
      if (q.k === 2 || q.k === 5) q.rot += q.vr * wdt;
      const sy = this.sy(q.y);
      if (sy < top || sy > bot) continue;
      const a = q.life / q.max, hf = this.hudFade(sy);
      if (q.k === 0) { const r = q.size * (0.4 + a); c.globalAlpha = a * hf; c.drawImage(this.dot(q.col), q.x - r * 1.45, sy - r * 1.45, r * 2.9, r * 2.9); continue; }
      if (q.k === 1 || q.k === 5 || q.k === 6) {
        if (hf < 1) {   // under the HUD: this one strokes alone at its fade (outside the batches)
          c.globalAlpha = 0.9 * hf; c.strokeStyle = q.col; c.lineCap = 'round'; c.beginPath();
          if (q.k === 6) { const sp = Math.hypot(q.vx, q.vy) || 1, l = Math.min(18, sp * 0.04) * (0.5 + 0.5 * a); c.lineWidth = 2.2; c.moveTo(q.x, sy); c.lineTo(q.x - q.vx / sp * l, sy + q.vy / sp * l); }
          else if (q.k === 1) { c.lineWidth = Math.max(1.2, q.size * 0.7 * (0.4 + a)); c.moveTo(q.x, sy); c.lineTo(q.x - q.vx * 0.05 * (0.4 + 0.6 * a), sy + q.vy * 0.05 * (0.4 + 0.6 * a)); }
          else { const l = q.size * (0.35 + 0.65 * a), dx = Math.cos(q.rot) * l, dy = Math.sin(q.rot) * l; c.lineWidth = 3.2; c.moveTo(q.x - dx, sy - dy); c.lineTo(q.x + dx, sy + dy); }
          c.stroke(); continue;
        }
        let v = SB.get(q.col); if (!v) { v = [[], [], []]; SB.set(q.col, v); }
        if (q.k === 6) { const sp = Math.hypot(q.vx, q.vy) || 1, l = Math.min(18, sp * 0.04) * (0.5 + 0.5 * a); v[1].push(q.x, sy, q.x - q.vx / sp * l, sy + q.vy / sp * l); }
        else if (q.k === 1) { const w = q.size * 0.7 * (0.4 + a), bk = w < 1.6 ? 0 : w < 2.8 ? 1 : 2; v[bk].push(q.x, sy, q.x - q.vx * 0.05 * (0.4 + 0.6 * a), sy + q.vy * 0.05 * (0.4 + 0.6 * a)); }
        else { const l = q.size * (0.35 + 0.65 * a), dx = Math.cos(q.rot) * l, dy = Math.sin(q.rot) * l; v[2].push(q.x - dx, sy - dy, q.x + dx, sy + dy); }
        continue;
      }
      if (q.k === 4) { const r = q.size * (1.5 - a * 0.5); c.globalAlpha = a * hf; c.drawImage(this.ringSpr(q.col, this.gooOn), q.x - r - 1, sy - r - 1, r * 2 + 2, r * 2 + 2); continue; }
      c.globalAlpha = (q.k === 2 ? Math.min(1, a * 3) : a) * hf; c.fillStyle = q.col;
      if (q.k === 2) { const w = Math.cos(q.rot) * q.size; c.fillRect(q.x - w / 2, sy - q.size * 0.3, w || 0.5, q.size * 0.6); }
      else if (q.k === 3) { c.beginPath(); c.moveTo(q.x, sy - q.size * 1.8); c.quadraticCurveTo(q.x + q.size, sy, q.x, sy + q.size); c.quadraticCurveTo(q.x - q.size, sy, q.x, sy - q.size * 1.8); c.fill(); }
    }
    this.pHW = Math.max(live, this.pHead);   // dead slots past the last live one are skipped next frame
    if (SB.size) {
      c.globalAlpha = 0.9; c.lineCap = 'round';
      for (const [col, v] of SB) {
        c.strokeStyle = col;
        for (let bk = 0; bk < 3; bk++) {
          const L = v[bk]; if (!L.length) continue;
          c.lineWidth = bk === 0 ? 1.2 : bk === 1 ? 2.2 : 3.2; c.beginPath();
          for (let j = 0; j < L.length; j += 4) { c.moveTo(L[j], L[j + 1]); c.lineTo(L[j + 2], L[j + 3]); }
          c.stroke();
        }
      }
    }
    c.globalAlpha = 1;
    // popups: baked sprites, a 1.35x pop-in, wobble; kept in a band around the swimmer and above the bottom combo strip.
    // They age on real time (half speed in slow-mo, frozen only in a hit-stop) so a slow-mo never parks text on screen.
    n = 0;
    const ts = this.ts == null ? 1 : this.ts, pdt = ts === 0 ? 0 : dt * (0.5 + 0.5 * ts);
    const px = race.p.x, py = this.sy(race.p.y), m = c.getTransform(), lo = py - 110, hi = Math.max(lo, Math.min(py + 50, this.H - Math.max(190, (this.padB || 0) + 40)));
    const placed = this._placed || (this._placed = []); placed.length = 0;
    const BB = this.bigBoxes; let bbn = 0;   // where the big pops sit this frame (next frame's labels keep clear of them)
    const wl = this.wallX(race.p.y, race.p.side || 0, -1), wr = this.wallX(race.p.y, race.p.side || 0, 1);
    const hitsPlaced = (x, y, s) => { for (let j = 0; j < placed.length; j += 3) if (Math.abs(placed[j] - x) < (placed[j + 2] + s.w) / 2 && Math.abs(placed[j + 1] - y) < s.h * 0.8) return true; return false; };
    let headSeen = false, headUp = 0;
    // bright floors (the Acid Lagoon, THE EGG): pop words switch to a white or gold fill (their 3 px ink outline is
    // baked in), since lime, mint and pink fills vanish on them
    const zP = this.bt > 0.5 && ZONES[this.zi + 1] ? ZONES[this.zi + 1].id : ZONES[this.zi] ? ZONES[this.zi].id : '', bright = zP === 'acid' || zP === 'egg';
    for (const q of this.pops) {
      // only the oldest big pop is the headline; the rest wait (and do not age) behind it
      if (q.big) { if (headSeen) { this.pops[n++] = q; continue; } headSeen = true; }
      // n-dependent big pops bake at 4 px steps and scale at draw time (fewer distinct sprites)
      const bs = q.big ? Math.max(20, Math.round(q.size / 4) * 4) : q.size, dsc = q.size / Math.round(bs);
      // the sprite is kept on the pop (the LRU is touched only on the first bake; an evicted sprite is re-baked)
      const pc = bright ? brightCol(q.col) : q.col;
      if (q.spr && (q.spr.dead || q.sprBs !== bs || q.sprC !== pc)) q.spr = null;
      const s = q.spr || this.text(q.text, pc, bs, q.big ? 'popP' : 'pop', true);
      if (!s) { this.pops[n++] = q; continue; }        // bake budget used up: wait a frame, do not age
      q.spr = s; q.sprBs = bs; q.sprC = pc;
      q.age += pdt; q.life -= pdt; if (q.life <= 0) continue; this.pops[n++] = q;
      const k = 1 - q.life / q.max, ag = q.age, W = s.w * dsc, Hs = s.h * dsc;
      const sc = (ag < 0.08 ? 1.35 * backOut(ag / 0.08) / backOut(1) : ag < 0.18 ? 1.35 - 0.35 * (ag - 0.08) / 0.1 : 1 - Math.max(0, k - 0.7) * 0.4) * dsc;
      const fadeA = ag < 0.4 ? 1 : Math.min(k > 0.7 ? (1 - k) / 0.3 : 1, q.life / 0.25);   // full for the first 0.4 s
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
        placed.push(x, y, W);
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
        // the clamp can squeeze two pops onto one line: nudge this one clear of those already drawn
        for (let j = 0; j < placed.length; j += 3) if (Math.abs(placed[j] - x) < (placed[j + 2] + W) / 2 && Math.abs(placed[j + 1] - y) < Hs * 0.8) y = placed[j + 1] - Hs * 0.8;
        // keep Kevin clear (when no side lane fits): a pop in the box round him moves above it, or sideways
        // when the space above is taken and the side still fits inside the walls; it dims to 0.7 meanwhile
        const hw = 46 + W / 2, hh = Hs * 0.3;
        const over = !race.over && Math.abs(x - px) < hw && y + hh > py - 34 && y - hh < py + 30;
        if (over) {
          const upY = py - 34 - hh - 1, sx = x >= px ? px + hw + 1 : px - hw - 1, ss = { w: W, h: Hs };
          const fits = sx - W / 2 >= Math.max(2, wl) && sx + W / 2 <= Math.min(VIEW_W - 2, wr);
          if (hitsPlaced(x, upY, ss) && fits && !hitsPlaced(sx, y, ss)) x = sx;
          else {   // above, stacked over any pop already parked there
            y = upY;
            for (let it = 0; it < 4; it++) {
              let moved = false;
              for (let j = 0; j < placed.length; j += 3) if (Math.abs(placed[j] - x) < (placed[j + 2] + W) / 2 && Math.abs(placed[j + 1] - y) < Hs * 0.8) { y = placed[j + 1] - Hs * 0.8; moved = true; }
              if (!moved) break;
            }
          }
        }
        q.fa = q.fa == null ? 1 : q.fa + ((over ? 0.7 : 1) - q.fa) * Math.min(1, dt * 12);
        placed.push(x, y, W);
      }
      const rot = this.reduced ? 0 : q.big ? q.rot * 0.4 * Math.max(0, 1 - ag) : q.rot * (1 - k) + Math.sin(k * 18) * 0.05 * (1 - k);
      c.globalAlpha = fadeA * q.al * q.fa;
      setXf(c, m, x, y, rot, sc, sc); c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h);
      if (q.big && bbn < 24) { BB[bbn++] = x; BB[bbn++] = y; BB[bbn++] = s.w * sc * 0.5; BB[bbn++] = s.h * sc * 0.35; }
    }
    this.headUp = headUp;
    c.setTransform(m);
    this.bigBoxN = bbn;
    this.pops.length = n; c.globalAlpha = 1;
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
    this.birthS = { baby, first, words: String(words || ''), dur: first ? 4 : 2.5, t: 0, done: typeof done === 'function' ? done : null, called: false, skipAt: null, flashed: false, lines: null };
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
    const b = this.birthS, c = this.ctx, red = this.reduced, T = this.time;
    b.t += dt;
    if (!b.called && ((b.skipAt == null && b.t >= b.dur) || (b.skipAt != null && T - b.skipAt >= 0.4))) {
      b.called = true;
      if (b.done) { try { b.done(); } catch (e) { /* the ui hook is optional */ } }
    }
    const t = Math.min(b.t, b.dur), baby = b.baby, hue = Number.isFinite(baby.hue) ? baby.hue : 330;
    // where the egg is on screen (through this frame's camera, zoom included)
    const M = this.worldM, s = this.s || 1, wx = centre(RACE_LEN), wy = this.sy(RACE_LEN + 120);
    let ex = VIEW_W / 2, ey = this.H * 0.45, ek = 1;
    if (M) { ex = (M.a * wx + M.c * wy + M.e) / s; ey = (M.b * wx + M.d * wy + M.f) / s; ek = Math.hypot(M.a, M.b) / s; }
    ex = clamp(ex, 90, VIEW_W - 90); ey = clamp(ey, 150, this.H - 260);
    // 0 to 0.6 s: she swells and glows (drawEgg reads birthSwell)
    const sw = clamp(t / 0.6, 0, 1); this.birthSwell = sw * sw * (3 - 2 * sw);
    c.globalAlpha = 0.4 * clamp(t / 0.4, 0, 1); c.fillStyle = '#14000f'; c.fillRect(-20, -20, VIEW_W + 40, this.H + 40); c.globalAlpha = 1;
    this.dglow('#fff3c0', ex, ey, 150 * ek * (1.4 + 0.5 * this.birthSwell), 0.55 * this.birthSwell);
    // 0.6 s: a soft white flash (through the flash limiter, at most 0.4), then a burst of hearts in the baby's hue
    if (t >= 0.6 && !b.flashed) { b.flashed = true; this.lastFlashT = -9; this.flash = 0.4; this.flashCol = '#ffffff'; }
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
      const k = clamp((t - 0.75) / 0.4, 0, 1), sc = red ? 1 : k < 0.6 ? 0.3 + 0.85 * (k / 0.6) : 1.15 - 0.15 * ((k - 0.6) / 0.4);
      const D = 160 * sc, fy = ey - 20;
      this.dglow(`#fff3c0`, ex, fy, D * 0.85, 0.6);
      c.drawImage(this.birthFace(baby, 0, 160), ex - D / 2, fy - D / 2, D, D);
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
    o.taper = 1; o.amp = 6; o.tw = 3.4; o.band = '#ff3d6e'; o.acc = []; o.yaw = 1; o.ink = 1; o.stretch = 1 + (red ? 0 : 0.04 * Math.max(0, Math.sin(ph)));
    o.mouth = 'grin'; o.blush = 1; o.look = red ? 0 : Math.sin(t * 0.7) * 0.8; o.blink = blinkAt(t, 3.4, false); o.curl = red ? 0 : Math.sin(t * 1.3) * 0.15;
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
    if (!acc.length) { let hsh = 0; for (const ch of String(b.name || '')) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0; acc = FACE_ACC[Math.abs(hsh) % FACE_ACC.length]; }
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
          g.setLineDash([2.4, 2]); g.strokeStyle = 'rgba(220,255,170,0.42)'; g.lineWidth = 1.1;
          g.beginPath(); g.ellipse(0, 0, 7.5, 10, 0, 0, TAU); g.stroke();
          g.beginPath(); g.moveTo(0, 10); g.quadraticCurveTo(4, 16, -1, 22); g.quadraticCurveTo(-5, 27, 1, 31); g.stroke();
          g.setLineDash([]); g.lineWidth = 1.2; g.beginPath();
          for (const sx of [-1, 1]) { const ex = sx * 3.2, ey = -2.5; g.moveTo(ex - 1.5, ey - 1.5); g.lineTo(ex + 1.5, ey + 1.5); g.moveTo(ex + 1.5, ey - 1.5); g.lineTo(ex - 1.5, ey + 1.5); }
          g.stroke(); g.restore();
        });
      }
      for (let i = 0; i < 40; i++) { const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 9; wrap(x, y, r + 2, (ox, o) => { g.strokeStyle = 'rgba(182,255,92,0.22)'; g.lineWidth = 1.3; g.beginPath(); g.arc(x + ox, y + o, r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(220,255,170,0.25)'; g.beginPath(); g.arc(x + ox - r * 0.35, y + o - r * 0.35, r * 0.25, 0, TAU); g.fill(); }); }
    } else if (z.id === 'goo') {
      // a faint 24 px cell mesh (rows of 24 tile the 720 px height exactly)
      g.strokeStyle = css(wl, 0.14); g.lineWidth = 1.2; g.beginPath();
      for (let r = 0; r < H / 24; r++) for (let q = -1; q <= W / 24; q++) { const x = q * 24 + (r % 2 ? 12 : 0) + 12, y = r * 24 + 12; g.moveTo(x + 11, y); g.arc(x, y, 11, 0, TAU); }
      g.stroke();
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
    } else if (z.id === 'fork') {   // cell rings in the zone's own wall colour (pink belongs to the scent)
      const rs = css(wl, 0.13), rf = css(wl, 0.16);
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
