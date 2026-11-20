// Million To One: everything drawn on the canvas. Reads a Race, never changes its rules
// (it only keeps a few underscored display fields on agents: smoothed position, heading, timers).
// Art direction: cartoon biology. Squishy, glossy, a bit silly. No image files: every
// sprite, tile and glow is painted in code (much of it once, into cached offscreen canvases).
import { VIEW_W, channel, centre, zoneIndex, ZSTART, FORK_Y0, FORK_END, DEAD_Y, playBand } from './core.js';
import { ZONES, RACE_LEN } from './content.js';
import * as K from './content.js';   // optional line tables (RIVAL_STEAL, RIVAL_FAREWELLS), read guarded

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
const DIM = { rapids: 0.36, egg: 0.18 };
const dimOf = (zi) => (ZONES[zi] ? DIM[ZONES[zi].id] ?? 0.3 : 0.3);
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
const MAXP = 420, MAXP_LITE = 160;            // particle ring buffer size (full / lite)
const SPR = 2.5;                              // pixel scale of baked crowd heads
const TXT_MAX = 64;                           // baked text sprites kept (LRU)
const BAKES_PER_FRAME = 2;                    // new text sprites a frame may paint (pops beyond that wait a frame)
// precomputed rainbow strings (36 hues, 10 degrees apart) so hot loops never build colour strings
const HSL65 = [], HSL75 = [], HSL82 = [];
for (let i = 0; i < 36; i++) { HSL65.push(`hsl(${i * 10},100%,65%)`); HSL75.push(`hsl(${i * 10},100%,75%)`); HSL82.push(`hsl(${i * 10},100%,82%)`); }
const hueI = (deg) => ((Math.round(deg / 10) % 36) + 36) % 36;
const SPRINT_COL = rgb('#ff5a3c');
const NEBULA = ['#7a3cff', '#ff5cd2', '#5c8bff'];
const KEVIN_HITS = new Set(['kevin', 'player', 'hit', 'shieldHit', 'wingHit', 'second', 'bonk', 'swat', 'acid', 'stuck']);
const FORK_I_R = Math.max(0, ZONES.findIndex((z) => z.fork));
const RIVAL_SC = 1.3, KEVIN_SC = RIVAL_SC * 1.12;   // Kevin is drawn 1.12x the size of the biggest crowd swimmers
const TILE_CACHE = 5;                         // zone tiles kept baked
const PIECE_IDS = new Set(['launch', 'acid', 'goo', 'sea', 'fork', 'rapids', 'egg']);   // zones with midground set pieces
const GOO_I_R = ZONES.findIndex((z) => z.id === 'goo');
// hazard readability: a dark outer outline and a cream top-left rim on every hazard
const HZ_INK = '#2a0a24', HZ_CREAM = 'rgba(255,244,226,0.7)';
// glow colours each zone's floaters use (prewarm bakes them before the gate)
const ZGLOW = { launch: ['#ff9ac0'], acid: ['#9dff3c'], goo: ['#dfe6ff'], sea: ['#ff8a9c'], fork: ['#ff9be0', '#ff8be0', '#788cc8', ...NEBULA], rapids: ['#ffffff'], egg: ['#ffd77a', '#fff3c0'] };
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
  return typeof v === 'string' ? v : '';
};

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
    this.cv = cv; this.ctx = cv.getContext('2d', { alpha: false }) || cv.getContext('2d');
    this.pops = []; this.rings = []; this.time = 0;
    // Kevin's trail: a preallocated ring (x, y, hue), trH = next slot, trN = samples held
    this.trX = new Float32Array(TRAIL_N); this.trY = new Float32Array(TRAIL_N); this.trHue = new Float32Array(TRAIL_N); this.trH = 0; this.trN = 0;
    this.sDeep = [0, 0, 0]; this.sLite = [0, 0, 0]; this.sWall = [0, 0, 0]; this.vigs = []; this.bigBoxes = []; this.bigBoxN = 0;
    this.bankTarget = { x: 26, y: 24 }; this.onBankLand = null; this.breakVig = 0; this.heroOn = false; this.zoom = 1; this.zoomK = 0;
    this.glows = new Map(); this.dots = new Map(); this.tiles = new Map(); this.vig = null;
    this.txt = new Map(); this.heads = new Map();
    this.wbcState = new WeakMap(); this.duel = new Map();
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
    this.duelPool = []; this.labels = []; this.panic = [];
    // set by main.js (logical units): hudBottom (where the top HUD ends, default 110), bannerBox ({y0, y1} of a live
    // banner, or null), avoidRect ({x, y, w, h} of the DASH button, or null). Canvas text keeps out of all three.
    this.hudBottom = null; this.bannerBox = null; this.avoidRect = null;
    this.signBoxes = []; this.labRects = []; this.labRN = 0; this.pw = { nz: -1, i: 0 }; this.pwrI = 0;
    this.birthS = null;
    // R.marks (main.js): [{ y, kind: 'best' | 'grave', label }] drawn across the tube (see drawMarks)
    this._marks = []; this._marksNew = false;
    this.resetRun();
    this.scr = {};
    this.frame = 0; this.ringN = 0;
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.txt.clear()).catch(() => {});
  }
  // R.marks: assigning a new array keeps it through the run's first frame (resetRun clears only stale marks)
  get marks() { return this._marks; }
  set marks(v) { this._marks = Array.isArray(v) ? v : []; this._marksNew = true; }
  // per-run display state (camY = null from main.js starts a new run)
  resetRun() {
    if (!this._marksNew) this._marks = [];
    this._marksNew = false; this.corpses = [];
    this.pPh = 0; this.pTw = 15; this.lean = 0; this.trH = 0; this.trN = 0; this.trailAcc = 0;
    this.banks = []; this.bubble = null; this.desat = 0; this.ghostA = 0; this.ghostX = 0;
    this.lastBreakT = -9; this.lastBankT = -9; this.lastZi = -1; this.gateFlash = 0; this.emberT = 0;
    this.lead = 0.34; this.pAng = null; this.pAngV = 0; this.prevE = null; this.prevOv = null; this.prevTier = 0;
    this.accKey = -1; this.accList = []; this.accNew = null; this.accT = 0;
    this.chompT = 0; this.winkT = 0; this.nearT = 0; this.winT = 0; this.overSeen = null; this.shardsDone = false;
    this.dieT = 0; this.dieSeen = null; this.dieWbc = null; this.diePop = 0; this.linkT = 0;
    this.youT = 0; this.prevPend = null; this.prevRT = null; this.endT = 0; this.stealSaid = false; this.thiefXY = null;
    this.ghosts = []; this.imp = null; this.books = [];
    this.huffT = 0; this.wallT = 0; this.wallLast = -9; this.wallOn = false; this.dashAge = 9; this.headA = 0;
    this.buddyN = 0; this.buddyFly = []; this.sparkT = 0; this.bibGone = false; this.acidFz = 0; this.birthS = null;
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

  // ---------------------------------------------------------------- feel
  // addTrauma(a, dx, dy): with a direction, that axis shakes 1.5x and the other 0.5x for 0.15 s
  addTrauma(a, dx, dy) {
    this._trauma = Math.min(1, this._trauma + Math.max(0, a));
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
    const q = this.P[this.pHead]; this.pHead = (this.pHead + 1) % lim;
    if (this.pHead === 0) this.pHW = Math.max(this.pHW, lim); else this.pHW = Math.max(this.pHW, this.pHead);
    q.k = k; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.max = life; q.col = col; q.size = size; q.g = g; q.rot = rot; q.vr = vr;
  }
  burst(x, y, col, n = 10, spd = 120, life = 0.6, size = 3) {
    n = Math.min(n, this.lite ? 30 : 60);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = spd * (0.3 + Math.random());
      this.addP(i % 4 === 0 ? 1 : 0, x, y, Math.cos(a) * v, Math.sin(a) * v, life, col, size * (0.5 + Math.random()));
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
    size = Math.max(14, size0) * (this.textScale || 1);
    // big pops share ONE headline slot: a newcomer waits behind the live one, which then has at most 0.35 s left
    // (but stays up at least 0.6 s in all). At most two wait; the oldest waiting one gives way.
    if (big) {
      let nb = 0, b0 = null, b1 = null;   // one counting pass (no filter() garbage)
      for (const q of this.pops) if (q.big) { if (nb === 0) b0 = q; else if (nb === 1) b1 = q; nb++; }
      if (b0) b0.life = Math.min(b0.life, Math.max(0.35, 0.6 - b0.age));
      if (nb >= 3) this.pops.splice(this.pops.indexOf(b1), 1);
      if (this.pops.length >= 4) { const k = this.pops.findIndex((q) => !q.big); if (k >= 0) this.pops.splice(k, 1); }
      this.pops.push({ x, y, dy: y, text: String(text), col, size, big, age: 0, life, max: life, al: 1, rot: (Math.random() - 0.5) * 0.25 });
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
    this.pops.push({ x, y, dy: y, text: String(text), col, size, big, age: 0, life, max: life, al: small ? 0.85 : 1, rot: (Math.random() - 0.5) * 0.25 });
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
    n = Math.min(n, this.lite ? 60 : 120);
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
    if (n >= 25) this.breakVig = 0.25;
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
      for (const e of race.ents) { if (e.t !== 'wbc' || (e.dead && !(e._deadT != null ? this.time - e._deadT < 0.1 : e._seen === this.frame))) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd && d < 60 + e.r) { bd = d; tg = e; } }
      for (const a of race.agents) { if (!a.alive || a._seen !== this.frame || a._rx == null) continue; const d = Math.hypot(a._rx - x, a.y - y); if (d < bd && d < 50) { bd = d; tg = a; } }
    }
    const tx = tg === 'kevin' ? p.x : tg._rx != null ? tg._rx : tg.x, ty = tg === 'kevin' ? p.y : tg.y;
    let dx = x - p.x, dy = -(y - p.y);
    if (tg !== 'kevin') { dx = tx - p.x; dy = -(ty - p.y); }
    const ang = Math.hypot(dx, dy) < 4 ? -Math.PI / 2 : Math.atan2(dy, dx);
    const n = 6 + Math.floor(Math.random() * 3), st = [];
    for (let i = 0; i < n; i++) st.push(i / n * TAU + (Math.random() - 0.5) * 0.5, 18 + Math.random() * 22);
    this.imp = { tg, x, y, ang, t: clamp(+sec || 0.06, 0.02, 0.3), st };
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
    const k = clamp((+n || 0) / 30, 0, 1), cc = css(lerpC(WHITE, colOf(col), k, SCR));
    let cnt = Math.round(5 + 5 * k); if (this.lite) cnt = Math.ceil(cnt / 2);
    for (let i = 0; i < cnt; i++) {
      const a = (Math.random() * 2 - 1) * 25 * Math.PI / 180, v = 160 + Math.random() * 100;
      this.addP(6, x + (Math.random() - 0.5) * 8, y - 4, Math.sin(a) * v, -Math.cos(a) * v, 0.3 + Math.random() * 0.12, cc, 2);
    }
    this.ring(x, y, '#ffffff', 18, 0.25, 3);
    // squash the rival we just passed (the nearest one to the event)
    const race = this.race; let best = null, bd = 50;
    if (race && race.agents) for (const a of race.agents) {
      if (!a.alive || Math.abs(a.y - y) > 50) continue;
      const ax = a._rx != null ? a._rx : x, d = Math.abs(ax - x) + Math.abs(a.y - y) * 0.5;
      if (d < bd) { bd = d; best = a; }
    }
    if (best) best._sqU = this.time + 0.12;
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
  ringSpr(col) {
    let g = this.ringSprs.get(col);
    if (!g) {
      if (this.ringSprs.size > 16) this.ringSprs.clear();
      g = mk(32, 32); const x = g.getContext('2d');
      x.strokeStyle = col; x.lineWidth = 2.2; x.beginPath(); x.arc(16, 16, 14, 0, TAU); x.stroke();
      this.ringSprs.set(col, g);
    }
    return g;
  }
  // the neutral vignette per zone (lerp(zone deep, black, 0.55); the Egg a warm amber at 0.6), baked once.
  // sides: stage 1's version, which also bakes in the darkening the 34 px wall shadow stroke gives at full quality
  zoneVig(zi, sides) {
    const key = zi + (sides ? 7 : 0);
    let v = this.vigs[key];
    if (v) return v;
    const z = ZONES[zi], egg = z && z.id === 'egg', col = egg ? [150, 86, 10] : lerpC(rgb(z.col[0]), [0, 0, 0], 0.55), st = egg ? 0.6 : 1;
    v = mk(256, 256); const x = v.getContext('2d'), g = x.createRadialGradient(128, 150, 50, 128, 150, 190);
    g.addColorStop(0, css(col, 0)); g.addColorStop(0.6, css(col, 0.15 * st)); g.addColorStop(1, css(col, 0.75 * st));
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    if (z && z.id === 'sea') {   // the Sea's dark edges and its warm light from above, static in screen space: baked here
      const e = x.createLinearGradient(0, 0, 256, 0);
      e.addColorStop(0, 'rgba(30,0,8,0.45)'); e.addColorStop(0.25, 'rgba(30,0,8,0)'); e.addColorStop(0.75, 'rgba(30,0,8,0)'); e.addColorStop(1, 'rgba(30,0,8,0.45)');
      x.fillStyle = e; x.fillRect(0, 0, 256, 256);
      const tg = x.createLinearGradient(0, 0, 0, 256 * 0.6);
      tg.addColorStop(0, 'rgba(255,170,150,0.10)'); tg.addColorStop(1, 'rgba(255,170,150,0)');
      x.fillStyle = tg; x.fillRect(0, 0, 256, 256 * 0.6);
    }
    if (sides) {
      const d = lerpC(rgb(z.col[0]), [0, 0, 0], 0.3), s = x.createLinearGradient(0, 0, 256, 0);
      s.addColorStop(0, css(d, 0.4)); s.addColorStop(0.16, css(d, 0)); s.addColorStop(0.84, css(d, 0)); s.addColorStop(1, css(d, 0.4));
      x.fillStyle = s; x.fillRect(0, 0, 256, 256);
    }
    return (this.vigs[key] = v);
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
  prewarm(p, zi) {
    const nz = zi + 1;
    if (!ZONES[nz] || !(p.y > ZSTART[nz] - 3500)) return;
    if (!this.tiles.has(nz)) { this.bakeStep(nz, this.tileJobs.get(nz) || this.tileJob(nz)); return; }
    const pw = this.pw;
    if (pw.nz !== nz) { pw.nz = nz; pw.i = 0; pw.list = this.prewarmList(nz); }
    while (pw.i < pw.list.length) if (pw.list[pw.i++]()) return;
  }
  // the bakes for zone nz, in order; each returns true only when it really painted something
  prewarmList(nz) {
    const z = ZONES[nz], id = z.id, L = [], sides = this.q === 0;
    const has = (m, k, f) => () => { if (m.has(k)) return false; f(); return true; };
    if (!this.lite) L.push(() => { if (this.vigs[nz + (sides ? 7 : 0)]) return false; this.zoneVig(nz, sides); return true; });
    if (PIECE_IDS.has(id)) for (let v = 0; v < 3; v++) L.push(() => { const m = this.pieces || (this.pieces = new Map()); if (m.has(id + v)) return false; this.pieceSpr(id, v); return true; });
    if (id === 'sea') {
      L.push(() => { if (this.causS && this.causS.has('#ff9aa8')) return false; this.causticSpr('#ff9aa8'); return true; });
      L.push(() => { if (this.rcS) return false; this.redCellSpr(); return true; });
      L.push(() => { if (this.rcB) return false; this.redCellBlur(); return true; });
      for (let j = 0; j < 3; j++) L.push(() => { const C = this.clS || (this.clS = []); if (C[j]) return false; this.clusterSpr(j); return true; });
    }
    if (id === 'acid') L.push(() => { if (this.causS && this.causS.has('#c8ff6a')) return false; this.causticSpr('#c8ff6a'); return true; });
    for (const col of ZGLOW[id] || []) L.push(has(this.glows, col, () => this.glow(col)));
    const nm = z.name.toUpperCase();
    L.push(has(this.txt, 'pop|' + nm + '|' + z.wall + '|22', () => this.text(nm, z.wall, 22)));
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
  causticSpr(col = '#ff9aa8') {
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
    let q = m.get(key); if (!q) { q = rimmed(paintPiece(id, v)); m.set(key, q); }
    return q;
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
  innerA(zi) { return ZONES[zi] && ZONES[zi].id === 'sea' ? 0.42 : 0.5; }
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
    const font = kind === 'sign' || kind === 'label' ? `800 ${size}px ${FONT}` : `900 ${size}px ${FONT}`;
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
    const w = kind === 'sign' ? tw + 26 : tw + Math.ceil(size * 0.7) + 6 + (plate ? 6 : 0), h = kind === 'sign' ? 32 : Math.ceil(size * (plate ? 1.3 : 1.7) + (plate ? 16 : 0));
    let cv = reuse;
    if (cv) { cv.width = w * K; cv.height = h * K; } else cv = mk(w * K, h * K);
    const g = cv.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (kind === 'sign') {
      const rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
      g.fillStyle = 'rgba(0,0,0,0.3)'; rr(3, 3, w - 4, 28, 10); g.fill();
      g.fillStyle = 'rgba(20,0,20,0.8)'; rr(1, 1, w - 4, 28, 10); g.fill();
      g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.fillStyle = col; g.fillText(text, (w - 2) / 2, 16);
    } else {
      const cx = w / 2, cy = h / 2;
      if (plate) {
        const pw = tw + 12 + size * 0.2, ph = size * 1.1 + 12, x0 = cx - pw / 2, y0 = cy - ph / 2, r = Math.min(12, ph / 2);
        g.fillStyle = 'rgba(20,2,18,0.65)'; g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + pw, y0, x0 + pw, y0 + ph, r); g.arcTo(x0 + pw, y0 + ph, x0, y0 + ph, r); g.arcTo(x0, y0 + ph, x0, y0, r); g.arcTo(x0, y0, x0 + pw, y0, r); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(30,0,30,0.55)'; g.fillText(text, cx + 1.5, cy + size * 0.14 + 1.5);
      g.lineWidth = Math.max(4, size * 0.32); g.strokeStyle = '#1a0616'; g.strokeText(text, cx, cy);
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
  draw(race, dt, ts = 1) {
    const c = this.ctx, p = race.p, wdt = dt * ts; this.time += dt; this.frame++; this.race = race; this.ts = ts; this.bakes = 0;
    this.signBoxes.length = 0; this.labRN = 0;
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
    const target = p.y - padB - visH * this.lead + (race.drill ? 0 : clamp(p.vy || 0, 0, 2400) / 8);
    this.camY = this.camY == null ? target : this.camY + (target - this.camY) * Math.min(1, dt * 8);
    this.react(race, dt, wdt);
    // trauma shake (smooth two-sine noise) + spring kick
    this._trauma = Math.max(0, this._trauma - dt * 1.8);
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
    this.zoomK *= Math.exp(-dt * (this.zoomK < 0 ? 10 : 7)); if (Math.abs(this.zoomK) < 0.002 || this.reduced) this.zoomK = 0; const zk = 1 + this.zoomK;
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
    this.zi = zi; this.bt = bt;
    const z = ZONES[zi];
    const deep = zn ? lerpC(rgb(z.col[0]), rgb(zn.col[0]), bt, this.sDeep) : rgb(z.col[0]);
    if (this.frame % 30 === 1) this.deepCss = css(deep);
    this.prewarm(p, zi);
    const lite = zn ? lerpC(rgb(z.col[1]), rgb(zn.col[1]), bt, this.sLite) : rgb(z.col[1]);
    const wall = zn ? lerpC(rgb(z.wall), rgb(zn.wall), bt, this.sWall) : rgb(z.wall);
    this.wallC = wall;
    this.buildWallCache(race);
    this.drawBack(deep, zi, bt, this.backStrips(race));
    this.drawTube(race, lite, wall, deep);
    this.drawScent(race);
    this.drawMarks(race, dt);
    this.drawEnts(race, dt);
    this.drawEgg(race, dt);
    this.drawAgents(race, dt);
    this.drawPlayer(race, dt, wdt, beat);
    this.drawFx(race, dt, wdt);
    this.drawStealVig();
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
    const vr = this.vignette()[1], ef = p.e / (p.maxE || 100);
    // full-screen layers: lite keeps to 5 (back tile, dark wash, tube, inner tile, one vignette); full blends two vignettes
    // lite skips every full-screen vignette (the low-energy pulse and the combo-break edge included)
    if (this.lite) { /* none */ } else if (ef < 0.25 && !race.over) {
      c.globalAlpha = this.reduced ? 0.6 : Math.max(0.7, clamp(0.55 + 0.35 * Math.sin(this.time * 8), 0, 1) * (1 - ef / 0.25 * 0.5));
      c.drawImage(vr, -20, -20, VIEW_W + 40, this.H + 40);
    } else {
      const va = Math.min(1, 0.9 + 0.06 * beat), sides = this.q === 0;
      if (!zn || bt < 0.02 || (this.lite && bt < 0.5)) { c.globalAlpha = va; c.drawImage(this.zoneVig(zi, sides), -20, -20, VIEW_W + 40, this.H + 40); }
      else if (bt > 0.98) { c.globalAlpha = va; c.drawImage(this.zoneVig(zi + 1, sides), -20, -20, VIEW_W + 40, this.H + 40); }
      else {
        c.globalAlpha = va * (1 - 0.5 * bt); c.drawImage(this.zoneVig(zi, sides), -20, -20, VIEW_W + 40, this.H + 40);
        c.globalAlpha = va * bt; c.drawImage(this.zoneVig(zi + 1, sides), -20, -20, VIEW_W + 40, this.H + 40);
      }
    }
    // a big combo break (25+) flashes the edges red-violet for 0.25 s
    if (this.breakVig > 0 && this.lite) this.breakVig = 0;
    if (this.breakVig > 0) { c.globalAlpha = clamp(this.breakVig / 0.25, 0, 1) * 0.8; c.drawImage(this.vignette()[2], -20, -20, VIEW_W + 40, this.H + 40); this.breakVig = Math.max(0, this.breakVig - dt); }
    c.globalAlpha = 1;
    this.drawBanks(dt);
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
    this._marksNew = false;
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
    // wall contact (iPhones have no vibration): pressing into the edge of the band squashes Kevin, dents the
    // membrane and flicks a few pink droplets, once per contact and at most every 0.4 s (reduced motion: the dent only)
    this.wallT = Math.max(0, this.wallT - dt);
    const inp = race.input;
    if (!race.demo && !race.over && !race.drill && !race.autopilot && inp && inp.tx != null) {
      const band = playBand(p.y, p.side), s = p.x <= band.l + 1.5 ? -1 : p.x >= band.r - 1.5 ? 1 : 0;
      if (s && Math.abs(inp.tx - p.x) < 2) {
        if (!this.wallOn && this.time - this.wallLast >= 0.4) {
          const sd = p.side || 0, wx = this.wallX(p.y, sd, s);
          this.wallLast = this.time; this.wallT = 0.25; this.wallS = s; this.wallY = p.y; this.wallSd = sd; this.wallNear = Math.abs(wx - p.x) < 30;
          if (!this.reduced && this.wallNear) {
            const n = 3 + (Math.random() < 0.5 ? 1 : 0);
            for (let i = 0; i < n; i++) this.addP(3, wx - s * 3, p.y + (Math.random() - 0.5) * 16, -s * (60 + Math.random() * 70), 40 + Math.random() * 60, 0.45, '#ff8fc8', 2 + Math.random(), 260);
          }
        }
        this.wallOn = true;
      } else this.wallOn = false;
    } else this.wallOn = false;
    if (p.frenzyT > pv.frenzyT + 1) { this.zoomPunch(0.1); this.ring(p.x, p.y, '#ffd75c', 120, 0.6, 8); this.ring(p.x, p.y, '#ff5cd2', 80, 0.45, 5); }
    if (p.inv > pv.inv + 0.3) { this.pHit = 0.35; this.ring(p.x, p.y, '#ffffff', 60, 0.35, 6); }
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
    this.desat = Math.max(0, this.desat - dt); this.gateFlash = Math.max(0, this.gateFlash - dt);
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
  // st: null for the full width, or [left strip end, right strip start] (only the flesh beside the opaque tube)
  tileLayer(k, a, par, st = null) {
    if (a <= 0.01) return;
    const c = this.ctx, t = this.tile(k), base = this.camY * par;
    c.globalAlpha = a;
    const k0 = Math.floor((base - 40) / TH), k1 = Math.floor((base + this.H + 40) / TH);
    for (let j = k0; j <= k1; j++) {
      const y = this.H - ((j + 1) * TH - base);
      if (!st) { c.drawImage(t, -20, y, TW, TH + 0.5); continue; }
      const a1 = clamp(st[0], -20, TW - 20), b0 = clamp(st[1], -20, TW - 20), th = t.height;
      if (a1 > -20) c.drawImage(t, 0, 0, (a1 + 20) * TS, th, -20, y, a1 + 20, TH + 0.5);
      if (b0 < TW - 20) c.drawImage(t, (b0 + 20) * TS, 0, (TW - 20 - b0) * TS, th, b0, y, TW - 20 - b0, TH + 0.5);
    }
    c.globalAlpha = 1;
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
    else {
      this.tileLayer(zi, 1, 0.35, st);
      if (zn && !(cheap && bt < 0.15)) this.tileLayer(zi + 1, bt, 0.35, st);
    }
  }
  // narrow zones: the opaque tube hides the middle of the backdrop, so only two side strips are drawn
  // (padding 12 for the wall wobble and strokes). The Sea and the Fork, two tubes, a zoom-out or a moving
  // wall cache keep the full draw. Returns [left end, right start] or null.
  backStrips(race) {
    const zA = ZONES[this.zi].id, zB = ZONES[this.zi + 1] && this.bt > 0.01 ? ZONES[this.zi + 1].id : null;
    if (zA === 'sea' || zA === 'fork' || zB === 'sea' || zB === 'fork' || this.zoomK < 0 || !this.safeBack) return null;
    const S = this.sides(race);
    if (S.length !== 1) return null;
    const k = S[0] + 1, B = this.wc[k];
    if (!B || this.wcF[k] !== this.frame) return null;
    const i0 = Math.max(0, Math.floor((this.camY - 60 - this.wcY0) / 11)), i1 = Math.min(this.wcN - 1, Math.ceil((this.camY + this.H + 60 - this.wcY0) / 11));
    let maxL = -1e9, minR = 1e9;
    for (let i = i0; i <= i1; i++) {
      const cx = B[i * 3], h = B[i * 3 + 1] + B[i * 3 + 2];
      if (cx - h > maxL) maxL = cx - h; if (cx + h < minR) minR = cx + h;
    }
    if (!(minR - maxL >= 40)) return null;
    const st = this._strips || (this._strips = [0, 0]);
    st[0] = maxL + 12; st[1] = minR - 12;
    return st;
  }

  sides(race) {
    const y0 = this.camY;
    if (y0 + this.H < FORK_Y0) return [0];
    if (y0 > FORK_END + 200) return [race.p.side || race.eggSide];
    return [-1, 1];
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
    const c = this.ctx, y0 = this.camY - 60, y1 = this.camY + this.H + 60, step = 22, t = this.time;
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
    const path = () => {
      c.beginPath();
      for (let k = 0; k < np; k++) {
        const L = TL[k], R = TR[k], m = TN[k];
        c.moveTo(L[0], L[1]);
        for (let i = 2; i < m; i += 2) c.lineTo(L[i], L[i + 1]);
        for (let i = m - 2; i >= 0; i -= 2) c.lineTo(R[i], R[i + 1]);
        c.closePath();
      }
    };
    // both walls of every tube in one path, so each stroke style is a single stroke call
    const walls = (dx) => {
      c.beginPath();
      for (let k = 0; k < np; k++) { addPts(c, TL[k], TN[k], dx); addPts(c, TR[k], TN[k], -dx); }
      c.stroke();
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
    path(); c.fillStyle = this.tubeG; c.fill();
    // (the Great Womb Sea's dark edges are baked into its zone vignette, zoneVig)
    const zA0 = ZONES[this.zi].id, zB0 = ZONES[this.zi + 1] ? ZONES[this.zi + 1].id : null;
    // the Gate of Goo gets the same framing, softer (0.35), in its own deep colour (read from ZONES)
    const gooW = (zA0 === 'goo' ? 1 - this.bt : 0) + (zB0 === 'goo' ? this.bt : 0);
    if (gooW > 0.01 && GOO_I_R >= 0) {
      const gc = ZONES[GOO_I_R].col[0];
      if (!this.gooEdgeG || this.gooEdgeK !== gc) {
        const d = lerpC(rgb(gc), [0, 0, 0], 0.5), g = c.createLinearGradient(0, 0, VIEW_W, 0);
        g.addColorStop(0, css(d, 0.35)); g.addColorStop(0.25, css(d, 0)); g.addColorStop(0.75, css(d, 0)); g.addColorStop(1, css(d, 0.35));
        this.gooEdgeG = g; this.gooEdgeK = gc;
      }
      c.globalAlpha = gooW; c.fillStyle = this.gooEdgeG; path(); c.fill(); c.globalAlpha = 1;
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
      c.globalAlpha = al; c.fillStyle = pat; path(); c.fill(); c.globalAlpha = 1;
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
    this.drawPieces();
    c.lineJoin = 'round'; c.lineCap = 'butt';
    if (!this.lite && this.q !== 0) { c.strokeStyle = WS[3]; c.lineWidth = 34; walls(0); }   // stage 1: baked into its vignette
    c.strokeStyle = WS[0]; c.lineWidth = 8; walls(9);
    this.drawNear(this.zi, 1 - this.bt * 0.999);
    if (ZONES[this.zi + 1] && this.bt > 0.02) this.drawNear(this.zi + 1, this.bt);
    if (this.gateFlash > 0 && !this.reduced) {
      const red = wall[0] > 1.6 * wall[1];
      c.fillStyle = css(wall, Math.min(red ? 0.25 : 0.35, (this.gateFlash / 0.3) * 0.35));
      path(); c.fill();
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
  // Kevin pressed into the wall: a 40 px stretch of membrane bulges 6 px outward and eases back over 0.25 s
  drawDent(wall) {
    if (!(this.wallT > 0) || !this.wallNear) return;
    const c = this.ctx, s = this.wallS, sd = this.wallSd, k = this.wallT / 0.25, e = k * k * (3 - 2 * k), y = this.sy(this.wallY);
    if (y < -30 || y > this.H + 30) return;
    const x0 = this.wallX(this.wallY + 20, sd, s), x1 = this.wallX(this.wallY - 20, sd, s), xm = this.wallX(this.wallY, sd, s), bul = 12 * e;
    c.beginPath(); c.moveTo(x0, y - 20); c.quadraticCurveTo(xm + s * bul, y, x1, y + 20); c.lineTo(x1 - s * 3, y + 20); c.lineTo(x0 - s * 3, y - 20); c.closePath();
    c.fillStyle = this.tubeG; c.fill();
    c.strokeStyle = css(wall); c.lineWidth = 2.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y - 20); c.quadraticCurveTo(xm + s * bul, y, x1, y + 20); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x0 - s * 2, y - 14); c.quadraticCurveTo(xm + s * (bul - 2), y, x1 - s * 2, y + 14); c.stroke();
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
      // acid spikes stay at 0.6+ (3:1 on the zone) and the launch valves at 0.6 to 0.7; the rest sit back at 0.38 to 0.5
      const s = j % 2 ? 1 : -1, hj = h1(j * 4.1 + 2), al = a * (id === 'acid' || id === 'launch' ? 0.6 + 0.1 * hj : 0.38 + 0.12 * hj);
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
      const sc = id === 'sea' ? 1.05 : id === 'acid' || id === 'fork' ? 0.95 : 0.75;
      const gw = id === 'goo' && !this.reduced ? 1 + 0.06 * Math.sin(t * 0.9 + j) : 1;
      setXf(c, m, wx - s * 2, y, r + sway, sc * sq, sc * (2 - sq) * gw);
      if (id === 'acid') c.drawImage(pc.cv, -pc.w / 2, -pc.h, pc.w, pc.h); else c.drawImage(pc.cv, -pc.w / 2, 0, pc.w, pc.h);
      if (pc.tips) {   // the Fork's amethysts twinkle at their tips
        c.globalAlpha = Math.min(1, al * 3); c.fillStyle = '#ffe6fa'; c.beginPath();
        for (let i = 0; i < pc.tips.length; i += 2) { const k = this.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t * 3.4 + i * 1.7 + j); star4p(c, pc.tips[i] - pc.w / 2, pc.tips[i + 1], 3 + 5 * k); }
        c.fill();
      }
    }
    c.setTransform(m); c.globalAlpha = 1;
  }
  // the Fork reads as a Y: a far silhouette of the split slides in at parallax 0.45 from FORK_Y0 - 1500 and
  // hands over to the real divider (a dark wedge with a glowing rim); a pink scent river glows up the right tube
  drawForkSplit(race, deep) {
    const p = race.p, c = this.ctx, t = this.time, es = race.eggSide || 1, H = this.H;
    if (p.y < FORK_Y0 - 1500 || this.camY > FORK_END + 300) return;
    const nose = race.muts && race.muts.nose ? 1 : 0, pul = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3);
    const dark = this.forkDark || (this.forkDark = css(lerpC(rgb(ZONES[FORK_I_R].col[0]), [0, 0, 0], 0.6), 0.95));
    // 1) the far silhouette, until the real apex is half way down the screen
    const ysr = this.sy(FORK_Y0), camF = FORK_Y0 - H * 0.5, L = H * 0.5 + 0.45 * camF, ys = H - (L - this.camY * 0.45);
    const fin = clamp((p.y - (FORK_Y0 - 1500)) / 400, 0, 1), fout = clamp(1 - ysr / (H * 0.5), 0, 1);
    const pa = fin * fout * 0.8;
    if (pa > 0.01 && ys > -40 && ys < H + 40) {
      const cx = centre(FORK_Y0), top = Math.min(-40, ys - 400), wv = (dh) => Math.min(130, 10 + dh * 0.42);
      c.globalAlpha = pa; c.fillStyle = dark; c.beginPath(); c.moveTo(cx, ys);
      for (let yy = ys - 20; yy >= top; yy -= 40) c.lineTo(cx + wv(ys - yy), yy);
      for (let yy = top; yy <= ys - 20; yy += 40) c.lineTo(cx - wv(ys - yy), yy);
      c.closePath(); c.fill();
      c.lineJoin = 'round'; c.strokeStyle = '#ff9be0'; c.lineWidth = 6; c.globalAlpha = pa * 0.25; c.stroke();
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
      const divPath = () => {
        c.beginPath(); c.moveTo((xs[0] + xr[0]) / 2, yv[0] + 6);
        for (let i = 0; i < xs.length; i++) c.lineTo(xs[i], yv[i]);
        for (let i = xs.length - 1; i >= 0; i--) c.lineTo(xr[i], yv[i]);
        c.closePath();
      };
      divPath();
      // a cached -1..1 gradient (dark at the edges, amethyst in the middle), stretched over the widest row:
      // the path is already built, so the transform set here only maps the gradient
      let lo = xs[0], hi = xr[0]; for (let i = 1; i < xs.length; i++) { if (xs[i] < lo) lo = xs[i]; if (xr[i] > hi) hi = xr[i]; }
      if (!this.forkG) {
        const dk = lerpC(rgb(ZONES[FORK_I_R].col[0]), [0, 0, 0], 0.6), g = c.createLinearGradient(-1, 0, 1, 0);
        g.addColorStop(0, css(dk, 0.95)); g.addColorStop(0.5, css(lerpC(dk, rgb('#3e1d78'), 0.5), 0.95)); g.addColorStop(1, css(dk, 0.95));
        this.forkG = g;
      }
      const m = c.getTransform(), hw = Math.max(1, (hi - lo) / 2);
      setXf(c, m, (lo + hi) / 2, 0, 0, hw, 1); c.fillStyle = this.forkG; c.fill(); c.setTransform(m);
      // faint pink veins wandering up the divider
      c.strokeStyle = '#ff9be0'; c.lineWidth = 2; c.globalAlpha = 0.18; c.lineCap = 'round'; c.beginPath();
      for (let k = 0; k < 4; k++) {
        const u = -0.6 + 0.4 * k;
        for (let i = 0; i < xs.length; i++) {
          const mid = (xs[i] + xr[i]) / 2, half = (xr[i] - xs[i]) / 2, wy = this.camY + H - yv[i];
          const vx = mid + u * half * 0.8 + (this.reduced ? 0 : Math.sin(wy / 55 + t * 0.8 + k * 1.9) * Math.min(5, half * 0.15));
          i ? c.lineTo(vx, yv[i]) : c.moveTo(vx, yv[i]);
        }
      }
      c.stroke(); c.globalAlpha = 1;
      divPath(); c.lineJoin = 'round'; c.strokeStyle = '#ff9be0'; c.lineWidth = 7; c.globalAlpha = 0.18 + 0.1 * pul; c.stroke();
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
    // the wrong tube's mouth breathes out a cold blue-grey haze
    if (this.sides(race).length > 1) {
      const wy = FORK_Y0 + 260, sy = this.sy(wy);
      if (sy > -200 && sy < H + 200) { const ch = channel(wy, -es); this.dglow('#788cc8', ch.c, sy, ch.h * 1.15, 0.25); }
    }
  }
  // PICK A TUBE: pinned in screen space at padTop + 140 while its spot in the world is on screen (never on the bar)
  drawForkSign() {
    const fy = this.sy(FORK_Y0 - 500);
    if (!(fy > -60 && fy < this.H + 60)) return;
    const c = this.ctx; c.globalAlpha = clamp(Math.min((fy + 60) / 120, (this.H + 60 - fy) / 120), 0, 1);
    this.sign(VIEW_W / 2, Math.max((this.padW || 0) + 140, this.hudB() + 12 * this.cssK + 15), '← PICK A TUBE →', '#ff9be0');
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
  // per-zone wall dressing, drawn at alpha a (two calls blend across a zone gate)
  drawWallStyle(race, id, a, wall) {
    if (a <= 0.02) return;
    const c = this.ctx, t = this.time, y0 = this.camY - 40, y1 = this.camY + this.H + 40, ps = race.p.side;
    const sides = this.sides(race), red = this.reduced;
    const ok = (side, y) => !(side && ps && side !== ps && y > FORK_END + 200);
    const each = (step, off, fn) => {
      for (const side of sides) for (let y = Math.ceil((y0 - off) / step) * step + off; y <= y1; y += step) { if (!ok(side, y)) break; fn(side, y, this.sy(y)); }
    };
    c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = a;
    if (id === 'launch') {         // muscle ribs every 36 px, squeezing on the beat
      const bk = red ? 0 : clamp(+this.beat || 0, 0, 1), len = 9 + 3 * bk;
      c.strokeStyle = 'rgba(150,20,70,0.55)'; c.lineWidth = 4; c.beginPath();
      each(36, 0, (side, y, sy) => { for (const s of [-1, 1]) { const x = this.wallX(y, side, s); c.moveTo(x, sy - 3); c.quadraticCurveTo(x - s * len * 0.6, sy - 1, x - s * len, sy + 3); } });
      c.stroke();
      c.strokeStyle = 'rgba(255,190,215,0.5)'; c.lineWidth = 1.4; c.beginPath();
      each(36, 0, (side, y, sy) => { for (const s of [-1, 1]) { const x = this.wallX(y, side, s); c.moveTo(x - s * 1, sy - 5); c.quadraticCurveTo(x - s * len * 0.6, sy - 3, x - s * (len - 1), sy + 1); } });
      c.stroke();
    } else if (id === 'acid') {    // pitted, corroded wall and a few green drips sliding down it
      c.fillStyle = 'rgba(8,24,0,0.5)'; c.beginPath();
      each(26, 0, (side, y, sy) => { for (const s of [-1, 1]) { const hv = h1(y * 0.37 + s * 3.3); if (hv < 0.35) continue; const r = 1.6 + hv * 2.6, x = this.wallX(y, side, s) - s * (4 + hv * 3); c.moveTo(x + r, sy); c.ellipse(x, sy, r, r * 0.7, 0, 0, TAU); } });
      c.fill();
      c.strokeStyle = 'rgba(200,255,120,0.35)'; c.lineWidth = 1; c.beginPath();
      each(26, 0, (side, y, sy) => { for (const s of [-1, 1]) { const hv = h1(y * 0.37 + s * 3.3); if (hv < 0.35) continue; const r = 1.6 + hv * 2.6, x = this.wallX(y, side, s) - s * (4 + hv * 3); c.moveTo(x - r, sy + 0.8); c.ellipse(x, sy + 0.8, r, r * 0.7, 0, Math.PI, TAU); } });
      c.stroke();
      const n = 4, side0 = sides.length > 1 ? (ps || 1) : sides[0];
      for (let i = 0; i < n; i++) {
        const s = i % 2 ? 1 : -1, k = ((t * 0.18 + i / n + h1(i) * 0.2) % 1), sy = -20 + k * (this.H + 40);
        const wy = this.camY + this.H - sy, x = this.wallX(wy, side0, s) - s * 5, al = Math.sin(k * Math.PI);
        c.globalAlpha = a * al * 0.9;
        c.strokeStyle = 'rgba(157,255,60,0.5)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, sy - 26); c.lineTo(x, sy - 5); c.stroke();
        c.fillStyle = '#9dff3c'; c.beginPath(); c.moveTo(x, sy - 7); c.quadraticCurveTo(x + 3.4, sy, x, sy + 3.2); c.quadraticCurveTo(x - 3.4, sy, x, sy - 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(x - 1.2, sy - 2, 1, 1.6);
      }
    } else if (id === 'goo') {     // a lumpy, milky rim and a few strands sagging off it
      c.strokeStyle = css(lerpC(wall, WHITE, 0.4, SCR), 0.55); c.lineWidth = 6;
      for (const side of sides) for (const s of [-1, 1]) {
        c.beginPath(); let first = true;
        for (let y = Math.floor(y0 / 11) * 11; y <= y1; y += 11) { if (!ok(side, y)) break; const x = this.wallX(y, side, s) - s * (5 + Math.sin(y / 17) * 6), sy = this.sy(y); if (first) { c.moveTo(x, sy); first = false; } else c.lineTo(x, sy); }
        c.stroke();
      }
      c.strokeStyle = css(lerpC(wall, WHITE, 0.5, SCR), 0.5); c.fillStyle = css(lerpC(wall, WHITE, 0.5, SCR), 0.6);
      each(300, 0, (side, y, sy) => {
        const s = h1(y * 0.011) < 0.5 ? -1 : 1, x1 = this.wallX(y, side, s), x2 = this.wallX(y + 90, side, s), sy2 = this.sy(y + 90);
        const sag = 26 + (red ? 0 : Math.sin(t * 1.4 + y) * 6), mx = (x1 + x2) / 2 - s * sag, my = (sy + sy2) / 2 + 10;
        c.lineWidth = 2.4; c.beginPath(); c.moveTo(x1, sy); c.quadraticCurveTo(mx, my + 14, x2, sy2); c.stroke();
        const d = red ? 0.5 : (t * 0.5 + h1(y)) % 1; c.beginPath(); c.arc(mx * 0.5 + (x1 + x2) * 0.25, my + 6 + d * 10, 2 + d, 0, TAU); c.fill();
      });
    } else if (id === 'sea') {     // rugae: deep soft folds along the wall, shaded on the inside
      // the Sea is wider than the screen: an off-screen wall is pinned to the screen edge so the folds always frame it
      const ys = this._ys || (this._ys = []), xs = this._xs || (this._xs = []);
      for (const side of sides) for (const s of [-1, 1]) {
        ys.length = 0; xs.length = 0;
        for (let y = Math.floor(y0 / 14) * 14; y <= y1; y += 14) {
          if (!ok(side, y)) break;
          const wx = this.wallX(y, side, s);
          ys.push(y); xs.push(s < 0 ? Math.max(6, wx) : Math.min(VIEW_W - 6, wx));
        }
        if (ys.length < 2) continue;
        const dep = (y) => 16 + 6 * Math.sin(y * TAU / 140);   // 10..22
        c.beginPath();
        for (let i = 0; i < ys.length; i++) { const yy = this.sy(ys[i]); i ? c.lineTo(xs[i], yy) : c.moveTo(xs[i], yy); }
        for (let i = ys.length - 1; i >= 0; i--) c.lineTo(xs[i] - s * (4 + dep(ys[i])), this.sy(ys[i]));
        c.closePath(); c.fillStyle = 'rgba(70,0,12,0.45)'; c.fill();
        c.strokeStyle = css(wall, 0.35); c.lineWidth = 2; c.beginPath();
        for (let i = 0; i < ys.length; i++) { const x = xs[i] - s * (4 + dep(ys[i])), yy = this.sy(ys[i]); i ? c.lineTo(x, yy) : c.moveTo(x, yy); }
        c.stroke();
      }
    } else if (id === 'fork') {    // a starry rim: twinkling sparkles along both walls
      c.fillStyle = '#ffe6fa'; c.beginPath();
      each(46, 0, (side, y, sy) => { for (const s of [-1, 1]) { const k = red ? 0.7 : 0.5 + 0.5 * Math.sin(t * 4 + y * 0.13 + s); if (k < 0.35) continue; star4p(c, this.wallX(y, side, s) - s * 4, sy, 1.8 + 4 * k); } });
      c.fill();
    } else if (id === 'rapids') {  // long combed cilia, raked downstream by the current and waving fast
      c.strokeStyle = css(lerpC(wall, WHITE, 0.35, SCR), 0.5); c.lineWidth = 1.6; c.beginPath();
      each(12, 0, (side, y, sy) => {
        for (const s of [-1, 1]) {
          const L = 18 + 8 * h1(y * 0.21 + s), x = this.wallX(y, side, s), w = red ? 0 : Math.sin(t * 14 + y * 0.09) * 5;
          c.moveTo(x, sy); c.quadraticCurveTo(x - s * L * 0.55, sy + L * 0.25 + w * 0.4, x - s * L * 0.7, sy + L * 0.7 + w);
        }
      });
      c.stroke();
    } else if (id === 'egg') {     // a soft golden glow on the rim
      c.strokeStyle = 'rgba(255,215,92,0.35)'; c.lineWidth = 24;
      for (const side of sides) for (const s of [-1, 1]) {
        c.beginPath(); let first = true;
        for (let y = Math.floor(y0 / 22) * 22; y <= y1; y += 22) { if (!ok(side, y)) break; const x = this.wallX(y, side, s), sy = this.sy(y); if (first) { c.moveTo(x, sy); first = false; } else c.lineTo(x, sy); }
        c.stroke();
      }
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
    } else if (id === 'goo') {    // drool strands sagging off the membrane line
      c.strokeStyle = 'rgba(236,241,255,0.55)'; c.lineWidth = 2; c.fillStyle = 'rgba(242,246,255,0.7)';
      for (let i = 1; i < 5; i++) {
        const u = i / 5, x = L + (R - L) * u, top = y + sag * 2 * 2 * u * (1 - u), len = 12 + 10 * h1(i * 3.7) + (red ? 0 : Math.sin(t * 1.6 + i) * 5);
        c.beginPath(); c.moveTo(x, top); c.quadraticCurveTo(x + 2, top + len * 0.6, x, top + len); c.stroke();
        c.beginPath(); c.arc(x, top + len + 2, 2.6, 0, TAU); c.fill();
      }
    } else if (id === 'sea') {    // puffy lips round each pillar top
      for (const s of [-1, 1]) {
        const bx = s < 0 ? L : R;
        c.fillStyle = '#c2213f'; c.beginPath(); c.ellipse(bx, y - 26, 16, 7, 0, 0, TAU); c.fill();
        c.fillStyle = '#ff9aa8'; c.beginPath(); c.ellipse(bx, y - 28, 12, 3.4, 0, 0, TAU); c.fill();
        c.strokeStyle = '#5a0018'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(bx - 12, y - 26); c.quadraticCurveTo(bx, y - 23, bx + 12, y - 26); c.stroke();
      }
    } else if (id === 'fork') {   // a starry arch from pillar to pillar
      const ry = 46, n = 11, hw = (R - L) / 2;
      c.strokeStyle = 'rgba(255,155,224,0.35)'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, y - 26, hw, ry, 0, Math.PI, TAU); c.stroke();
      c.fillStyle = '#ffe6fa'; c.beginPath();
      for (let i = 0; i <= n; i++) { const a = Math.PI * i / n, k = red ? 0.7 : 0.5 + 0.5 * Math.sin(t * 4 + i * 1.3); star4p(c, cx - Math.cos(a) * hw, y - 26 - Math.sin(a) * ry, 4 + 5 * k); }
      c.fill();
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
  sign(x, y, text, col) {
    const s = this.text(text, col, 15, 'sign'), b = this.reduced ? 0 : Math.sin(this.time * 3) * 2;
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
      // heart-shaped scent puffs that drift and lean toward the right tube
      const es = (this.race && this.race.eggSide) || 0;
      // one big nebula glow far back (parallax 0.3), and two big pink membrane bubbles drifting slowly
      const LT = this.H + 520;
      c.strokeStyle = 'rgba(255,155,224,0.18)'; c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const u = ((h1(i * 9.7 + 3) * LT - cam * 0.3 - t * (4 + i * 2)) % LT + LT) % LT, ny = this.H + 260 - u;
        const nx = VIEW_W * (0.2 + 0.3 * i) + (this.reduced ? 0 : Math.sin(t * 0.13 + i * 2.1) * 40);
        if (i === 0) { this.dglow(NEBULA[0], nx, ny, 180, a * 0.35); continue; }
        const r = 60 + 60 * h1(i * 4.4 + 1), wob = this.reduced ? 1 : 1 + 0.04 * Math.sin(t * 0.7 + i);
        c.globalAlpha = a; c.beginPath(); c.ellipse(nx, ny, r * wob, r / wob, 0, 0, TAU); c.stroke();
        c.beginPath(); c.ellipse(nx, ny, r * 0.82 * wob, r * 0.82 / wob, 0, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
      }
      c.globalAlpha = a;
      // a far starfield (parallax 0.15), twinkling (steady for reduced motion)
      {
        const n = this.lite ? 12 : 24, ST = this.H + 40;
        c.fillStyle = '#fff4fd'; c.beginPath();
        for (let i = 0; i < n; i++) {
          const k = this.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(t * (1.5 + h1(i + 4.4) * 3) + i * 2.3);
          const x = h1(i * 5.1 + 77) * VIEW_W, y = ST - 20 - ((h1(i * 3.7 + 11) * ST - cam * 0.15) % ST + ST) % ST, r = 0.5 + k * (0.6 + h1(i) * 0.9);
          c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
        }
        c.globalAlpha = a * 0.7; c.fill(); c.globalAlpha = a;
      }
      for (let i = 0; i < N(10); i++) this.dglow('#ff9be0', X(i) + Math.sin(t * 0.7 + i) * 12, pos(i, 0.85, -10), 18 + h1(i) * 26, a * 0.2);
      for (let i = 20; i < 20 + N(12); i++) {
        const y = pos(i, 0.95, 26 + h1(i) * 20), up = (this.H - y) / this.H;
        const x = X(i) + es * up * 70 + Math.sin(t * 1.3 + i) * 8;
        c.globalAlpha = a * (0.25 + 0.25 * Math.sin(t * 2 + i)); c.fillStyle = '#ff9be0';
        c.save(); c.translate(x, y); c.rotate(es * 0.35 + Math.sin(t + i) * 0.15); heart(c, 0, 0, 3 + h1(i + 1) * 4); c.restore();
      }
      c.globalAlpha = a; c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath();
      for (let i = 40; i < 40 + N(24); i++) { const x = X(i) + Math.sin(t + i) * 6, y = pos(i, 1, 12), r = 0.7 + h1(i + 0.3) * 1.8; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.fill();
      c.fillStyle = '#ffd0f0';
      c.globalAlpha = a; c.beginPath();
      for (let i = 70; i < 70 + N(28); i++) { const k = 0.5 + 0.5 * Math.sin(t * 4 + i * 2); if (k < 0.3) continue; star4p(c, X(i), pos(i, 0.95, 20), 2 + 4 * k); }
      c.fill();
    } else if (id === 'egg') {
      // swaying light shafts from the egg ahead, then golden corona cells drifting by
      if (!this.shaftG || this.shaftH !== this.H) {
        this.shaftH = this.H; this.shaftG = c.createLinearGradient(0, 0, 0, this.H * 1.2);
        this.shaftG.addColorStop(0, 'rgba(255,236,170,0.16)'); this.shaftG.addColorStop(1, 'rgba(255,236,170,0)');
      }
      for (let i = 0; i < 3; i++) {
        const sway = this.reduced ? 0 : Math.sin(t * 0.35 + i * 2.1) * 0.09;
        c.save(); c.translate(VIEW_W * (0.25 + i * 0.25), -30); c.rotate((i - 1) * 0.22 + sway);
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
      {   // a lime caustic net (parallax 0.5) at 0.12
        const net = this.causticSpr('#c8ff6a'), oy = ((cam * 0.5 + t * 5) % 256 + 256) % 256, ox = ((t * 4) % 256 + 256) % 256;
        c.globalAlpha = a * 0.12;
        for (let yy = oy - 256; yy < this.H; yy += 256) for (let xx = -ox; xx < VIEW_W; xx += 256) c.drawImage(net, xx, yy, 256, 256);
        c.globalAlpha = a;
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
      // everything moves slowly here (0.4x): mucus lenses sagging past, then thick glossy strands
      for (let i = 9; i < 9 + N(6); i++) this.dglow('#dfe6ff', X(i), pos(i, 0.35, 0), 30 + h1(i) * 20, a * 0.18);
      if (this.gooLensK !== z.wall) { this.gooLensK = z.wall; this.gooLensF = css(lerpC(rgb(z.wall), WHITE, 0.3), 0.18); }
      const lensF = this.gooLensF;
      for (let i = 30; i < 30 + N(7); i++) {
        const x = X(i), y = pos(i, 0.4, 3), r = 30 + h1(i + 0.3) * 30, sag = this.reduced ? 1 : 1 + 0.08 * Math.sin(t * 0.9 + i * 1.7);
        c.save(); c.translate(x, y); c.scale(1, sag);
        c.fillStyle = lensF; c.beginPath(); c.ellipse(0, 0, r, r * 0.62, 0, 0, TAU); c.fill();
        if (!this.lite) {   // a soap-film rim: 2 px of cycling rainbow at 0.35
          c.globalAlpha = a * 0.35; c.strokeStyle = HSL75[hueI((this.reduced ? 0 : t * 60) + i * 47)]; c.lineWidth = 2; c.stroke(); c.globalAlpha = a;
        }
        c.strokeStyle = 'rgba(240,244,255,0.18)'; c.lineWidth = 1.2; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath(); c.ellipse(0, 0, r * 0.78, r * 0.44, 0, 3.55, 4.75); c.stroke();
        c.restore();
      }
      c.lineCap = 'round';
      for (let i = 0; i < N(9); i++) {
        const x1 = X(i) - 60, x2 = x1 + 80 + h1(i + 2) * 140, y = pos(i, 0.36, 0), sag = 18 + 14 * Math.sin(t * 0.6 + i), ye = y + h1(i + 9) * 20 - 10;
        c.strokeStyle = 'rgba(236,241,255,0.4)'; c.lineWidth = 2 + h1(i + 5) * 3; c.beginPath(); c.moveTo(x1, y); c.quadraticCurveTo((x1 + x2) / 2, y + sag * 2, x2, ye); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x1, y - 1); c.quadraticCurveTo((x1 + x2) / 2, y + sag * 2 - 1.5, x2, ye - 1); c.stroke();
        c.fillStyle = 'rgba(242,246,255,0.4)'; c.beginPath(); c.arc((x1 + x2) / 2, y + sag + 3 + (t * 8 + i * 9) % 14, 2.2, 0, TAU); c.fill();
      }
    } else if (id === 'sea') {
      // slow swell bands, then one or two huge translucent cell clusters drifting far below
      // a caustic light net at two depths, drifting slowly
      const net = this.causticSpr('#ff9aa8');
      {   // the caustic net (parallax 0.5) at 0.16, and a second, bigger one nearer (parallax 0.85, 1.6x) at 0.08
        const oy = ((cam * 0.5 + t * 4) % 256 + 256) % 256, ox = ((t * 6) % 256 + 256) % 256;
        c.globalAlpha = a * 0.16;
        for (let yy = oy - 256; yy < this.H; yy += 256) for (let xx = -ox; xx < VIEW_W; xx += 256) c.drawImage(net, xx, yy, 256, 256);
        if (this.q === 1 && !this.lite) {
          const S2 = 256 * 1.6, oy2 = ((cam * 0.85 + t * 7) % S2 + S2) % S2, ox2 = ((-t * 5) % S2 + S2) % S2;
          c.globalAlpha = a * 0.08;
          for (let yy = oy2 - S2; yy < this.H; yy += S2) for (let xx = -ox2; xx < VIEW_W; xx += S2) c.drawImage(net, xx, yy, S2, S2);
        }
      }
      // (its light from above is baked into the Sea's zone vignette, zoneVig)
      if (this.q === 1 && !this.lite) {   // four slow swell bands (full quality only)
        c.globalAlpha = a * 0.07;
        c.lineCap = 'round'; c.lineWidth = 56; c.strokeStyle = '#ff8a9c';
        for (let i = 0; i < NB(4); i++) {
          const y = pos(i + 200, 0.7, 8), ph = t * 0.5 + i * 1.7;
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
      c.globalAlpha = a * 0.25;
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
      c.strokeStyle = 'rgba(190,245,255,0.7)'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 1.8; c.beginPath();
      for (let i = 0; i < N(48); i++) { const x = X(i) + Math.sin(t + i) * 4, y = pos(i, 1, 700 + h1(i) * 400), l = 26 + h1(i + 1) * 70; c.moveTo(x, y); c.lineTo(x + Math.sin(i) * 3, y + l); }
      c.stroke();
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
      for (let i = 100; i < 100 + N(20); i++) { const r = 1.8 + h1(i + 0.2) * 3, x = X(i) + Math.sin(t * 5 + i) * 6, y = pos(i, 1, 480 + h1(i) * 200); c.moveTo(x + r, y); c.ellipse(x, y, r * (1 + 0.15 * Math.sin(t * 11 + i)), r, 0, 0, TAU); }
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
        const fx = clamp(L + 8, 4, VIEW_W - s.w - 4);
        c.globalAlpha = sh; c.fillStyle = '#ffd75c'; c.fillRect(fx, sy - s.h - 2, 2, s.h + 2);   // the flagpole
        c.drawImage(s.cv, fx + 2, sy - s.h - 2, s.w, s.h);
        c.globalAlpha = 1;
      } else if (m.kind === 'grave') {
        if (p.y > wy && m._pt == null) m._pt = t;
        const k = m._pt == null ? 0 : clamp((t - m._pt) / 0.6, 0, 1);
        if (k >= 1) continue;
        drawn++;
        const e = 1 - (1 - k) * (1 - k), ch = channel(wy, side);
        const gx = clamp(ch.c + (h1(wy * 0.013) - 0.5) * ch.h * 0.8, L + 20, R - 20), gy = sy - (red ? 0 : 40 * e);
        c.globalAlpha = 1 - k;
        const g = this.graveSpr();
        c.drawImage(g, gx - 9, gy - 15, 18, 32);
        if (k > 0) { c.strokeStyle = '#ffd75c'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(gx, gy - 14, 5, 1.7, 0, 0, TAU); c.stroke(); }
        if (m.label) { const s = this.text(String(m.label), '#c9b6c2', 11); c.drawImage(s.cv, gx - s.w / 2, gy + 20 - s.h / 2, s.w, s.h); }
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
    for (const e of race.ents) {
      // a paid near miss (brushed it, never touched it) makes Kevin flinch, then grin
      if (e.paid && !this.paidSeen.has(e)) { this.paidSeen.add(e); if (e.near && !e.touched && !e.hit && !race.demo) { this.nearMiss(); e._goldT = this.time; } }
      // a Big Mac drawn last frame that is dead now pops like a cartoon (drawCorpses)
      if (e.dead && e.t === 'wbc' && !e._corpse && e._seen === this.frame - 1) this.addCorpse(e);
      if (e.dead || e.y > top + e.r || e.y < bot - (e.h || 0) - e.r) continue;
      const x = e.x, y = this.sy(e.y);
      switch (e.t) {
        case 'sugar': {
          const ci = Math.floor(Math.abs(e.x * 7 + e.y)) % FRUIT.length, col = FRUIT[ci], bob = Math.sin(t * 4 + e.y) * 2, yy = y + bob, r = e.r;
          this.dglow(col, x, yy, r + 10, 0.5);
          c.fillStyle = col; c.beginPath(); c.arc(x, yy, r, 0, TAU); c.fill();
          c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.arc(x + 2, yy + 2.5, r * 0.75, 0, Math.PI); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x - 3, yy - 3.5, 3, 2, -0.6, 0, TAU); c.fill();
          if (ci % 2 === 0) { c.fillStyle = 'rgba(255,240,150,0.85)'; for (let k = 0; k < 4; k++) c.fillRect(x - 4 + (k % 2) * 6, yy + (k >> 1) * 4 - 1, 1.4, 1.8); }
          c.fillStyle = '#5bd96b'; c.beginPath(); c.ellipse(x + 2, yy - r, 4.5, 2, -0.5, 0, TAU); c.fill();
          c.beginPath(); c.ellipse(x - 2, yy - r + 0.5, 3.5, 1.6, 0.6, 0, TAU); c.fill();
          break; }
        case 'dna': {
          this.dglow('#ff5cd2', x, y, 26, 0.35 + 0.15 * Math.sin(t * 6));
          c.lineCap = 'round';
          c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.4; c.beginPath();
          for (let i = 0; i <= 10; i += 2) { const yy = y - 14 + i * 2.8, s = Math.sin(t * 5 + i * 0.7) * 8; c.moveTo(x + s, yy); c.lineTo(x - s, yy); }
          c.stroke(); c.lineWidth = 3;
          for (let k = 0; k < 2; k++) { c.strokeStyle = k ? '#5ce1ff' : '#ff5cd2'; c.beginPath(); for (let i = 0; i <= 10; i++) { const yy = y - 14 + i * 2.8, xx = x + Math.sin(t * 5 + i * 0.7 + k * Math.PI) * 8; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); }
          if (Math.sin(t * 3 + e.y) > 0.9) { c.fillStyle = '#fff'; star4(c, x + 9, y - 12, 4); }
          break; }
        case 'shield': {
          const b = Math.sin(t * 4 + e.y) * 2, r = e.r;
          this.dglow('#ffd75c', x, y + b, r + 14, 0.45);
          c.fillStyle = '#ffd75c'; c.beginPath(); c.arc(x, y + b + 2, r * 0.85, Math.PI, 0); c.lineTo(x + r, y + b + 4); c.lineTo(x - r, y + b + 4); c.closePath(); c.fill();
          c.strokeStyle = '#b07a10'; c.lineWidth = 1.5; c.stroke();
          c.fillStyle = '#ff3d6e'; c.fillRect(x - 1.5, y + b - r * 0.8, 3, r * 0.9);
          c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - 4, y + b - 3, 2.5, 1.5, -0.6, 0, TAU); c.fill();
          break; }
        case 'alkali': {
          const r = e.r + Math.sin(t * 5 + e.y) * 1.5;
          this.dglow('#5cc8ff', x, y, r + 10, 0.4);
          c.fillStyle = 'rgba(92,200,255,0.3)'; c.strokeStyle = '#9ae2ff'; c.lineWidth = 2;
          c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(x - r * 0.4, y - r * 0.4, 2.2, 0, TAU); c.fill();
          c.font = `800 ${this.fpx(13)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
          c.lineWidth = 2; c.strokeStyle = 'rgba(10,30,60,0.9)'; c.strokeText('pH', x, y + 1); c.fillStyle = '#e6f8ff'; c.fillText('pH', x, y + 1);
          break; }
        case 'acid': case 'goo': {
          const acid = e.t === 'acid', col = acid ? '#9dff3c' : '#c79bff', seed = e.seed || 0;
          this.dglow(col, x, y, e.r * 1.35, acid ? 0.22 : 0.16);
          c.fillStyle = hexA(col, acid ? 0.34 : 0.3);
          for (let i = 0; i < 16; i++) { const an = i / 16 * TAU, rr = e.r * (1 + 0.1 * Math.sin(an * 3 + seed + t * 2) + 0.05 * Math.sin(an * 5 - t * 3)); BX[i] = x + Math.cos(an) * rr; BY[i] = y + Math.sin(an) * rr * 0.78; }
          smoothBlob(c, 16);
          c.strokeStyle = HZ_INK; c.lineWidth = acid ? 6.6 : 6.2; c.stroke();   // the dark outer outline (2 px past the rim)
          c.fill();
          if (acid) {   // hazard tape: crawling black and lime dashes, so acid never reads as goo
            c.lineWidth = 2.6; c.setLineDash([6, 6]); c.lineDashOffset = -t * 14; c.strokeStyle = 'rgba(24,40,0,0.85)'; c.stroke();
            c.lineDashOffset = -t * 14 + 6; c.strokeStyle = '#e6ff4a'; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
          } else { c.strokeStyle = hexA(col, 0.75); c.lineWidth = 2.2; c.stroke(); }
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
        case 'wbc': { e._seen = this.frame; WBC_NOW.push(e); const sq = this.impSquash(e, x, y); this.drawWbc(e, x, y, t, p, dt); if (sq) c.restore(); break; }
        case 'current': {
          this.drawCurrent(e, y, t, p);
          break; }
      }
    }
    // (a dead Big Mac the race compacted away the same step still pops: last frame's list is checked too)
    const WP = this._wbcPrev || (this._wbcPrev = []);
    for (const e of WP) if (e.dead && !e._corpse) this.addCorpse(e);
    WP.length = 0; for (const e of WBC_NOW) WP.push(e); WBC_NOW.length = 0;
    this.drawCorpses(dt);
  }
  // a dead Big Mac: 0 to 60 ms it swells 1.0 to 1.25, a white silhouette with x x eyes; then it pops into 6 to 8
  // goo chunks, a shock ring out to r * 1.8 and a cream splat that fades over 1.2 s (at most 6, 3 on lite)
  addCorpse(e) {
    e._corpse = 1; e._deadT = this.time;
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
  drawCilia(e, y, t) {
    const c = this.ctx, s = -(e.wall || -1), bx = e.x, st = e.state | 0, per = e.period || 2, ph = (e.phase || 0) * per, R = e.r;
    const red = this.reduced, wc = this.wallC;
    // its reach: a translucent band so you can see how far it swats
    // (0.10 at rest, rising through the idle and the tremble toward the swat)
    const bandA = st === 2 ? 0.28 : 0.1 + 0.14 * clamp(ph / Math.max(0.1, per - 0.35), 0, 1);
    c.fillStyle = css(st === 2 ? [255, 255, 255] : wc, bandA); this.rrect(s > 0 ? bx : bx - R, y - 13, R, 26, 12); c.fill();
    // pose: angle from the wall (0 = straight across, + = combed downstream), length, sway
    const pose = (ang, len, sway) => ({ ang, len, sway, tx: bx + s * len * Math.cos(ang), ty: y + len * Math.sin(ang) + sway });
    let P, white = 0, ghosts = null;
    if (st === 0) P = pose(0.55, R * 0.55, Math.sin((e.phase || 0) * TAU) * 8);
    else if (st === 1) { white = clamp((ph - (per - 0.8)) / 0.45, 0, 1); P = pose(0.62 + 0.08 * white, R * (0.55 - 0.05 * white), red ? 0 : Math.sin(t * 30 * TAU) * 4); }
    else {
      const k = clamp((ph - (per - 0.35)) / 0.35, 0, 1), sn = 1 - Math.pow(1 - Math.min(1, k / 0.22), 3), back = k > 0.7 ? (k - 0.7) / 0.3 : 0;
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
    // the timer on the root: a radius-8 pie that fills over the idle phase, goes white for the tremble, flashes on the swat
    const pieX = bx + s * 3, idle = per - 0.8;
    c.fillStyle = 'rgba(30,0,30,0.45)'; c.beginPath(); c.arc(pieX, y, 8, 0, TAU); c.fill();
    if (st === 0) {
      const f = clamp(ph / Math.max(0.1, idle), 0, 1);
      c.fillStyle = css(lerpC(wc, WHITE, 0.3, SCR)); c.beginPath(); c.moveTo(pieX, y); c.arc(pieX, y, 7, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.closePath(); c.fill();
    } else {
      const fl = st === 2 && !red ? 0.5 + 0.5 * Math.sin(t * 40) : 1;
      c.fillStyle = st === 2 ? `rgba(255,255,255,${fl})` : '#ffffff'; c.beginPath(); c.arc(pieX, y, 7, 0, TAU); c.fill();
      if (st === 2) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.globalAlpha = 0.6 * fl; c.beginPath(); c.arc(pieX, y, 11, 0, TAU); c.stroke(); c.globalAlpha = 1; }
    }
    if (st === 1) {   // the tell: a little "!" at the tip
      const b = this.text('!', '#ffffff', 14);
      c.drawImage(b.cv, P.tx - b.w / 2, P.ty - 16 - b.h / 2, b.w, b.h);
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
    // the gaps glow and point the way; a faint column of light falls 140 units below each one
    if (!this.colG) { this.colG = c.createLinearGradient(0, 0, 0, 140); this.colG.addColorStop(0, 'rgba(255,255,255,0.16)'); this.colG.addColorStop(1, 'rgba(255,255,255,0)'); }
    if (y > (this.padW || 0) - 10 && y < this.H) {
      c.fillStyle = this.colG;
      for (const g of gaps) { const w = e.gw * 0.6; c.save(); c.translate(g, y + 10); c.fillRect(-w / 2, 0, w, 140); c.restore(); }
    }
    for (const g of gaps) {
      this.dglow('#ffffff', g, y, e.gw * 0.55, 0.12 + 0.06 * Math.sin(t * 5));
      c.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(t * 6)})`; c.lineWidth = 2.5; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) { const yy = y + 34 + k * 12 - ((t * 30) % 12); c.beginPath(); c.moveTo(g - 8, yy + 6); c.lineTo(g, yy); c.lineTo(g + 8, yy + 6); c.stroke(); }
    }
  }
  // Big Mac: a white blood cell with a wobbly membrane, arms that reach for you, and table manners to match
  drawWbc(e, x, y, t, p, dt) {
    const c = this.ctx, hunt = e.hunt || 0, ph = e.ph || 0;
    let st = this.wbcState.get(e); if (!st) { st = { eating: 0, burp: 0, full: 0, tail: 0, alert: 0, bang: 0, spotT: 0 }; this.wbcState.set(e, st); }
    const spot = (e.spot || 0) > 0;
    st.spotT = spot ? Math.min(0.35, st.spotT + dt) : Math.max(0, st.spotT - dt * 2);
    const py = this.sy(p.y), ang = Math.atan2(py - y, p.x - x);
    // its sight: a dashed 120-degree arc facing you while it has not locked on and is up to 600 ahead (louder
    // while teaching); when it spots you (e.spot) the arc turns red
    const ahead = e.y - p.y;
    if ((hunt < 0.5 && ahead > -40 && ahead < 600) || st.spotT > 0) {
      const R0 = e.sight || 440;
      if (hunt < 0.5) {
        c.globalAlpha = this.teach ? 0.22 : 0.15; c.strokeStyle = spot ? '#ff3d5a' : '#ffffff'; c.lineWidth = 2.5;
        c.setLineDash([10, 12]); c.lineDashOffset = this.reduced ? 0 : -t * 12;
        c.beginPath(); c.arc(x, y, R0, ang - Math.PI / 3, ang + Math.PI / 3); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
      }
      c.globalAlpha = 1;
    }
    // hunting: a pulsing white ring at the near-miss radius (e.r + 26); it flashes gold for 0.25 s when a dodge pays
    if (hunt > 0.5) {
      const gold = e._goldT != null && t - e._goldT < 0.25;
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
      c.globalAlpha = 0.45 + 0.5 * wind; c.strokeStyle = '#ff3d5a'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, wr, 0, TAU); c.stroke(); c.globalAlpha = 1;
    }
    // it has seen you: a dashed line of intent
    if (hunt > 0.5) {
      c.strokeStyle = `rgba(255,80,110,${0.25 + 0.25 * hunt})`; c.lineWidth = 1.6; c.setLineDash([5, 6]); c.lineDashOffset = -t * 30;
      c.beginPath(); c.moveTo(x + Math.cos(ang) * r * 1.1, y + Math.sin(ang) * r * 1.1); c.lineTo(p.x - Math.cos(ang) * 14, py - Math.sin(ang) * 14); c.stroke();
      c.setLineDash([]); c.lineDashOffset = 0;
    }
    this.dglow(hunt > 0.5 ? '#ff9ab4' : '#f4eef7', x, y, r + 22, 0.28 + 0.15 * hunt);
    // membrane: wobble harmonics + pseudopod arms that stretch toward the player
    const reach = hunt * (0.55 + 0.15 * Math.sin(t * 7));
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU;
      let rr = 1 + 0.08 * Math.sin(a * 4 + ph * 3) + 0.05 * Math.sin(a * 7 - ph * 5);
      if (reach > 0.02) {
        const d0 = Math.cos(a - ang), d1 = Math.cos(a - ang - 0.75), d2 = Math.cos(a - ang + 0.75);
        rr += reach * (Math.pow(Math.max(0, d1), 10) + Math.pow(Math.max(0, d2), 10)) * 0.8 + reach * 0.25 * Math.pow(Math.max(0, d0), 4);
      }
      BX[i] = x + Math.cos(a) * r * rr; BY[i] = y + Math.sin(a) * r * rr;
    }
    smoothBlob(c, 28); c.strokeStyle = HZ_INK; c.lineWidth = 6.2; c.stroke();   // the dark outer outline
    c.fillStyle = '#f6f0f8'; c.fill(); c.strokeStyle = hunt > 0.5 ? '#e08aa8' : '#c9b6d9'; c.lineWidth = 2.2; c.stroke();
    c.strokeStyle = HZ_CREAM; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, r * 0.9, Math.PI * 1.08, Math.PI * 1.45); c.stroke();
    c.fillStyle = 'rgba(210,190,230,0.45)'; c.beginPath(); c.arc(x + r * 0.1, y + r * 0.15, r * 0.78, 0, TAU); c.fill();
    // lobed nucleus + granules
    c.fillStyle = 'rgba(150,100,200,0.42)';
    for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(x - r * 0.25 + k * r * 0.25, y + r * 0.08 + Math.sin(k * 2 + ph) * r * 0.08, r * 0.17, r * 0.13, k, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(160,120,200,0.5)';
    for (let k = 0; k < 6; k++) { const a = k * 1.1 + ph * 0.3; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.5, 1.4, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x - r * 0.45, y - r * 0.5, r * 0.18, r * 0.09, -0.7, 0, TAU); c.fill();
    // eyes that follow you, angry brows when it is hunting
    const blink = ((t + ph) % 3.7) < 0.1 && hunt < 0.5 && !spot;
    for (const sx of [-1, 1]) {
      const ex = x + sx * r * 0.33, ey = y - r * 0.25, er = r * (wind > 0 ? 0.3 + 0.05 * wind : spot ? 0.3 : 0.24);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill(); c.strokeStyle = '#4a3050'; c.lineWidth = 1.2; c.stroke();
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
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fill(); c.beginPath(); c.moveTo(-4, 6); c.lineTo(-8, 12); c.lineTo(1, 8); c.fill();
      c.strokeStyle = '#ff3d5a'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.stroke();
      c.font = `900 ${this.fpx(14)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.lineWidth = 2; c.strokeStyle = '#4a0a1a'; c.strokeText('!', 0, 1); c.fillStyle = '#ff3d5a'; c.fillText('!', 0, 1);
      c.restore();
    }
    if (this.isImp(e)) {   // impact frame: the whole cell goes white (BX/BY still hold its membrane)
      smoothBlob(c, 28); c.fillStyle = '#ffffff'; c.fill();
    }
  }
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
        for (const g of e.gaps) { const w = e.gw * sc; this.rrect(g - w / 2, padW - 1, w, 8, 4); c.fill(); }
        c.globalAlpha = 1;
        continue;
      }
      const wbc = e.t === 'wbc', blob = e.t === 'acid' || e.t === 'goo';
      if (!wbc && !blob) continue;
      if (d < 0 || d > 700) continue;
      if (blob && Math.abs(e.x - p.x) > e.r + 60) continue;   // only the pools in your lane
      // Big Macs: big red chevrons (1.0 to 1.4) with a tiny white blob face, pulsing at 6 Hz once it hunts or
      // spots you. Acid and goo: smaller (0.6 to 0.9), filled in the pool's own colour, steady.
      // (Big Macs also grow with the closing speed: at vy 1300 a chevron is 1.3x bigger again)
      const k = 1 - d / 700, x = clamp(e.x, 16, VIEW_W - 16), sc = wbc ? 1 + 0.4 * k + 0.3 * clamp(((p.vy || 0) - 600) / 700, 0, 1) : 0.6 + 0.3 * k;
      const live = wbc && ((e.hunt || 0) > 0 || (e.spot || 0) > 0), bc = wbc ? '#ff3d5a' : e.t === 'acid' ? '#7fcf1f' : '#a77bff';
      c.save(); c.translate(x, padW + 14); c.scale(sc, sc);
      c.globalAlpha = live && !red ? 0.72 + 0.28 * Math.sin(t * 6 * TAU) : 1;
      c.lineJoin = 'round';
      c.beginPath(); c.moveTo(0, -12); c.lineTo(12, 1); c.lineTo(5.5, 1); c.lineTo(0, -4.5); c.lineTo(-5.5, 1); c.lineTo(-12, 1); c.closePath();
      c.strokeStyle = '#ffffff'; c.lineWidth = 2.4; c.stroke();
      if (wbc) { c.fillStyle = '#ff3d5a'; c.fill(); }
      else { const ga = c.globalAlpha; c.globalAlpha = ga * 0.7; c.fillStyle = bc; c.fill(); c.globalAlpha = ga; }
      if (wbc) {   // the blob face: a wobbly white cell with two eyes and a little mouth
        c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 11, 8, 7, 0, 0, TAU); c.fill(); c.strokeStyle = bc; c.lineWidth = 2; c.stroke();
        c.fillStyle = '#1a0a1a'; c.beginPath(); c.arc(-2.6, 9.6, 1.3, 0, TAU); c.arc(2.6, 9.6, 1.3, 0, TAU); c.fill();
        c.fillStyle = '#5a1030'; c.beginPath(); c.ellipse(0, 13.6, 2.6, live ? 1.7 : 0.9, 0, 0, TAU); c.fill();
        // the wind-up, so the tell is never lost off screen: a red arc round the chevron fills over the spot
        // (full once it hunts), with a '!' badge
        if (live) {
          const f = (e.hunt || 0) > 0 ? 1 : clamp((e.spot || 0) / (e.spotT || 0.35), 0, 1);
          c.globalAlpha = 1; c.lineCap = 'round';
          c.strokeStyle = 'rgba(42,10,36,0.55)'; c.lineWidth = 4; c.beginPath(); c.arc(0, 3, 21, 0, TAU); c.stroke();
          if (f > 0.01) { c.strokeStyle = '#ff3d5a'; c.lineWidth = 3; c.beginPath(); c.arc(0, 3, 21, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.stroke(); }
          c.fillStyle = '#ff3d5a'; c.beginPath(); c.arc(16, -12, 7, 0, TAU); c.fill(); c.strokeStyle = HZ_INK; c.lineWidth = 2; c.stroke();
          const bs = this.text('!', '#ffffff', 14); c.drawImage(bs.cv, 16 - bs.w * 0.35, -12 - bs.h * 0.35, bs.w * 0.7, bs.h * 0.7);
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
    const x = clamp(kx + dx * s, M, VIEW_W - M), y = clamp(ky + dy * s, top + M, bot - M), ang = Math.atan2(dy, dx);
    const pul = this.reduced ? 1 : 1 + 0.12 * Math.sin(this.time * 3 * TAU), m = c.getTransform();
    c.globalAlpha = clamp(1 - bd / 300, 0, 1) * (this.reduced ? 1 : 0.85 + 0.15 * pul);
    setXf(c, m, x, y, ang, pul, pul);
    c.beginPath(); c.moveTo(11, 0); c.lineTo(-11, -11); c.lineTo(-5, 0); c.lineTo(-11, 11); c.closePath();
    c.lineJoin = 'round'; c.strokeStyle = HZ_INK; c.lineWidth = 6; c.stroke(); c.fillStyle = '#ff3d6e'; c.fill();   // a 3 px ink outline outside the fill
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
  drawEgg(race, dt) {
    const c = this.ctx, x = centre(RACE_LEN);
    const t = this.time, R = 150, d = race.drill, over = race.over;
    this.duel.clear();
    // drill taps make her jiggle (tap rate read from drill progress)
    if (d) { const rate = Math.max(0, d.me - this.lastDrill) / Math.max(dt, 1e-3); this.lastDrill = d.me; this.eggJig += (Math.min(1, rate / 3) - this.eggJig) * Math.min(1, dt * 10); }
    else { this.lastDrill = 0; this.eggJig *= 0.9; }
    if (race.p.y > RACE_LEN - 4000) this.eggSky(clamp(1 - (RACE_LEN - race.p.y) / 4000, 0, 1));
    let y = this.sy(RACE_LEN + 120);
    if (y < -900 || y > this.H + 500) return;
    const near = clamp(1 - (RACE_LEN - race.p.y) / 2500, 0, 1);
    const win = over && over.reason === 'win', late = over && over.reason === 'late';
    // the ending plays out over 1.2 s (reduced motion: straight to the final poses)
    if (over !== this.overSeen) {
      this.overSeen = over; this.winT = 0; this.shardsDone = false; this.stealSaid = false;
      if (win && d) this.zoomPunch(0.15);   // the seal ring fires
    }
    this.thiefXY = null;
    // (a win holds still for 0.25 s, then Kevin dives in by 0.9 s; a steal eases in over 1.2 s)
    if (over) this.winT = this.reduced ? 1.2 : win && d ? clamp((this.endT - 0.25) / 0.65, 0, 1) * 1.2 : Math.min(1.2, this.winT + dt);
    const wk = clamp(this.winT / 1.2, 0, 1), we = wk * wk * (3 - 2 * wk);
    const jig = this.eggJig, sx = 1 + Math.sin(t * 28) * 0.025 * jig + Math.sin(t * 2) * 0.01, sy2 = 2 - sx;
    // the duel: arrived named rivals spread round the lower arc, each with its own drill ring
    let leadB = null, leadF = 0;
    if (d || late) {
      let k = 0;
      for (const a of race.agents) {
        if (!a.alive || !a.arrived || !a.boss) continue;
        const s = k % 2 ? -1 : 1, an = Math.PI / 2 + s * (0.35 + 0.3 * k);
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
        if (!this.stealSaid && w.boss) {
          this.stealSaid = true;
          const line = lineOf(K.RIVAL_STEAL, w.boss.name.split(' ')[0], w.boss.name);
          if (line) this.say(w, line, 2.4);
        }
        this.drawSwimmer(lx, ly, done ? Math.sin(t * 2) * 0.15 : (q ? q.ang : 0) * (1 - we), (1.3 + 0.4 * we) * 1.15, w.boss ? w.boss.col : CROWD[f], t * 12,
          { acc: L ? L.acc : FACE_ACC[f], cap: L ? L.cap : CAPS[Math.floor((w.ph || 0) * 10) % CAPS.length], band: L && L.band, quiff: L && L.quiff ? 1 : 0, mouth: bow ? 'wobble' : done ? 'huge' : 'grin', happy: done ? 1 : 0, blush: 1, taper: 1, sx: esx, sy: esy, crown: done && w.boss ? 1 : 0, look: fn === 'Chad' && wk > 0.5 ? 1.2 : 0 });
        const sc2 = (1.3 + 0.4 * we) * 1.15;
        if (fn === 'Tiffany' && wk > 0.3) this.bookArt(lx + 13 * sc2, ly - 3 * sc2, 0.9 * sc2 * Math.min(1, (wk - 0.3) / 0.3), (t % 2.4));   // a bookmark in her place
        else if (fn === 'Chad' && wk > 0.5) this.mirrorArt(lx + 14 * sc2, ly - 8 * sc2, t);                                              // checks his reflection
      }
    }
    // the face. Sleepy far away, wide awake when you arrive, giggly when drilled.
    let lookX = clamp((race.p.x - x) / 60, -1, 1) * 7;
    if (leadB && leadF > 0.6 && (t % 1.6) < 0.8) { const q = this.duel.get(leadB); if (q) lookX = clamp((q.x - x) / 60, -1, 1) * 9; }
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
        const open = clamp((near - 0.35) / 0.4, 0.3, 1), blink = ((t % 4.1) < 0.14) ? 0.1 : 1;
        c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey, 17, 21 * open * blink, 0, 0, TAU); c.fill(); c.stroke();
        if (blink > 0.5) {
          const lx = late ? 9 : lookX;
          c.fillStyle = ink; c.beginPath(); c.ellipse(ex + lx, ey + 3, 9, 11 * open, 0, 0, TAU); c.fill();
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
          if (a === leadB) this.drawLabel(lx, ly, a.boss.name.split(' ')[0], a.boss.col, Math.round(14 * (this.textScale || 1)), f > 0.7 ? (this.reduced ? 0.8 : 0.55 + 0.45 * Math.sin(t * 9)) : 0);
          else { const s = this.text(a.boss.name.split(' ')[0], a.boss.col, this.fpx(11)); const sx = clamp(lx, 8 + s.w / 2, VIEW_W - 8 - s.w / 2); c.drawImage(s.cv, sx - s.w / 2, ly - s.h / 2, s.w, s.h); this.labRect(sx, ly, s.w * 0.85, s.h * 0.6); }
        }
        outer = q.ring + 10;
      }
      let lead = 0; for (const a of race.agents) if (a.alive && a.arrived && !a.boss) lead = Math.max(lead, a.drill);
      if (lead > 0) { c.strokeStyle = '#ff5c7a'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, outer, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, lead / d.need)); c.stroke(); }
    }
  }

  // ---------------------------------------------------------------- swimmers
  tail(c, x, y, ang, len, amp, ph) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    c.moveTo(x, y);
    for (let i = 1; i <= 7; i++) {
      const k = i / 7, off = Math.sin(ph - k * 5.5) * amp * k;
      c.lineTo(x - sa * len * k + ca * off, y + ca * len * k + sa * off);
    }
  }
  // a tapered tail in local space (pointing down): thick near the head, whip-thin at the tip (3 strokes)
  // curl: the tail lags a turn (follow-through), bending the tip sideways by curl * len at the very end
  taperTail(c, len, amp, ph, w, curl = 0) {
    let px = 0, py = 8;
    for (let s = 0; s < 3; s++) {
      const i0 = s * 3 + 1, i1 = Math.min(8, i0 + 2), km = ((i0 + i1) / 2) / 8;
      c.lineWidth = w * (1.15 - km * 0.85); c.beginPath(); c.moveTo(px, py);
      for (let i = i0; i <= i1; i++) { const k = i / 8; px = Math.sin(ph - k * 5.5) * amp * k + curl * k * k * len; py = 8 + len * k; c.lineTo(px, py); }
      c.stroke();
    }
  }
  // per-agent display state: smoothed x, a knockback offset on y, heading (and its turn rate), bump and pass
  // timers, and an accumulated tail phase. fr(a) gives the tail beat rate; it is eased and integrated
  // (a._tp), so a rate change (a sprint, a scare, the end of the race) never snaps the tail.
  track(a, race, p, dt, sm, fr) {
    const tx = race.agentX(a);
    a._x = tx;
    if (a._rx == null || a._seen !== this.frame - 1 || Math.abs(tx - a._rx) > 140) {
      a._rx = tx; a._oy = 0; a._py = a.y; a._hd = 0; a._pk = a.kx; a._bt = 0; a._pt = 0; a._ah = a.y > p.y; a._av = 0; a._tf = null;
    }
    const ox = a._rx;
    a._rx += (tx - a._rx) * sm;
    const dy = a.y - a._py; if (dy < -4) a._oy -= dy; a._py = a.y; a._oy *= 1 - sm;
    const vx = (a._rx - ox) / Math.max(dt, 1e-3), hd = clamp(Math.atan2(vx, Math.max(60, a.sp || 400)), -0.6, 0.6), hd0 = a._hd;
    a._hd += (hd - a._hd) * Math.min(1, dt * 10);
    a._av += ((a._hd - hd0) / Math.max(dt, 1e-3) - a._av) * Math.min(1, dt * 8);
    if (Math.abs(a.kx - a._pk) > 1) a._bt = 0.8;
    a._pk = a.kx; a._bt = Math.max(0, a._bt - dt);
    const ah = a.y > p.y; if (a._ah && !ah && Math.abs(a.y - p.y) < 300) a._pt = 0.7; a._ah = ah; a._pt = Math.max(0, a._pt - dt);
    const f = fr ? fr(a) : 15;
    if (a._tf == null) a._tf = f;
    a._tf += (f - a._tf) * Math.min(1, dt * 8);
    a._tp = (a._tp ?? a.ph) + a._tf * dt;
    a._seen = this.frame;
  }
  drawAgents(race, dt) {
    const c = this.ctx, top = this.camY + this.H + 40, bot = this.camY - 40, t = this.time, p = race.p;
    const vis = this._vis || (this._vis = []), close = this._close || (this._close = []);
    vis.length = 0; close.length = 0;
    const cap = this.lite ? 12 : 26, sm = 1 - Math.exp(-16 * dt), fb = 430 * (1 + 0.06 * (race.gen || 0));
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
    const nearW = (a, r, kev = true) => { for (let i = 0; i < pn; i += 3) { if (PN[i + 2] && !kev) continue; const rr = PN[i + 2] ? 90 : r, dx = a._rx - PN[i], dy = a.y - PN[i + 1]; if (dx * dx + dy * dy < rr * rr) return i; } return -1; };
    const near = (a, r) => pn > 0 && nearW(a, r) >= 0;
    const win = !!(ov && ov.reason === 'win'), late = !!(ov && ov.reason === 'late');
    // the win: from 0.4 s every visible rival reacts for 1.2 s; tails slow to 0.4x and the close crowd looks worried
    const reactK = win && this.endT > 0.9 ? clamp((this.endT - 0.9) / 0.7, 0, 1) : -1, slow = reactK >= 0 ? 0.4 : 1;
    const freq0 = (a) => 11 + 9 * ((a.sp || fb) / fb) * (0.75 + 0.25 * (a.stam == null ? 1 : a.stam));
    const fr = (a) => {
      if (a.boss) {
        const L = BOSS_LOOK[a._fn || (a._fn = a.boss.name.split(' ')[0])] || {}, sprint = !this.duel.get(a) && !a.arrived && !!a.sprint;
        return (L.freq || 15) * (sprint ? 1.6 : 1) * (near(a, 110) ? 1.8 : 1) * slow;
      }
      return freq0(a) * (near(a, 90) ? 1.8 : 1) * slow;
    };
    for (const a of race.agents) {
      if (!a.alive) {   // a named rival who just dropped out near Kevin leaves as a ghost
        if (a.boss && a._seen === this.frame - 1 && !a._gone) { a._gone = 1; if (Math.abs(a.y - p.y) < 700) this.rivalGhost(a); }
        continue;
      }
      if (a.y > top || a.y < bot) continue;
      if (p.side && a.y > FORK_Y0 && a.side !== p.side && a.y > FORK_END) continue;
      this.track(a, race, p, dt, sm, fr);
      if (!a.boss && Math.abs(a.y - p.y) < 190 && close.length < cap) close.push(a); else vis.push(a);
      if (vis.length > 220) break;
    }
    const T = this.time, jit = red ? 0 : 2.5;
    // the far crowd: batched, one path per colour
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    for (const a of vis) if (!a.boss) this.tail(c, a._rx, this.sy(a.y + a._oy) + 7, a._hd, 26, 5, a._tp);
    c.stroke();
    for (let ci = 0; ci < 3; ci++) {
      c.fillStyle = CROWD[ci * 2]; c.beginPath();
      for (const a of vis) if (!a.boss && ((a.face || 0) % 3) === ci) { const y = this.sy(a.y + a._oy), q = a._sqU > T ? 1 : 0, rx = 5.5 * (1 + 0.25 * q), ry = 7.5 * (1 - 0.2 * q); c.moveTo(a._rx + rx, y); c.ellipse(a._rx, y, rx, ry, 0, 0, TAU); }
      c.fill();
    }
    c.fillStyle = '#2a1030';
    for (const a of vis) if (!a.boss && Math.abs(a.y - p.y) < 320) { const y = this.sy(a.y + a._oy), x = a._rx; if (((t + a.ph * 3) % 3.3) < 0.12) { c.fillRect(x - 3, y - 2, 2.4, 0.9); c.fillRect(x + 0.8, y - 2, 2.4, 0.9); } else { c.fillRect(x - 2.6, y - 2.5, 1.6, 2.2); c.fillRect(x + 1, y - 2.5, 1.6, 2.2); } }
    // the close ones: one batched tail stroke, then baked heads
    if (close.length) {
      c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 2.2; c.beginPath();
      for (const a of close) {
        // parting round a hot Kevin: ease 12 px away from him while within 90
        let kw = 0;
        if (hot && !red) { const dx = a._rx - p.x, dy = a.y - p.y; if (dx * dx + dy * dy < 8100) kw = dx >= 0 ? 12 : -12; }
        a._kp = (a._kp || 0) + (kw - (a._kp || 0)) * Math.min(1, dt * 10);
        // panic jitter (a hunting Big Mac within 110, not while bumped): tail and head shake together
        a._jx = jit && pn && !(Math.max(a.bumpT || 0, a._bt) > 0) && nearW(a, 110, false) >= 0 ? jit * Math.sin(T * 30 + a.ph) : 0;
        const x = a._rx + a._kp + a._jx, y = this.sy(a.y + a._oy), ang = a._hd, ph = a._tp;
        a._ph = ph; this.tail(c, x - Math.sin(ang) * 8, y + Math.cos(ang) * 8, ang, 32, 4 + ((a.face || 0) % 3) * 1.2, ph);
      }
      c.stroke();
      const m = c.getTransform();
      for (const a of close) {
        const x = a._rx + (a._kp || 0), y = this.sy(a.y + a._oy), f = (a.face || 0) % 6, ci = f === 4 ? Math.floor(a.ph * 10) % CAPS.length : 0;
        const behind = a.y < p.y, dx = Math.abs(x - p.x), bt = Math.max(a.bumpT || 0, a._bt), pt = Math.max(a.passT || 0, a._pt);
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
        const jx = a._jx || 0;
        if (pn && ex !== 4 && nearW(a, 110, false) >= 0) ex = 5;   // panic (the shake itself is a._jx, set with the tail)
        const look = ex === 2 || ex >= 5 ? 0 : Math.hypot(x - p.x, a.y - p.y) < 60 ? (p.x > x ? 1 : -1) : 0;
        if (a._bt > 0) { const e = 0.8 - a._bt; sy = 1 - 0.25 * Math.cos(e * 22) * Math.exp(-e * 7); sx = 1 + (1 - sy) * 0.8; }
        if (a._sqU > T) { sx *= 1.25; sy *= 0.8; }   // just got passed
        const hit = this.isImp(a);
        if (hit) { sx *= 1.12; sy *= 0.88; }
        // a per-stroke pulse: the head stretches a touch on each tail beat (volume kept)
        const st = 1 + (red ? 0.025 : 0.05) * Math.max(0, Math.sin(a._ph));
        sx /= Math.sqrt(st); sy *= st;
        setXf(c, m, x + jx, y, a._hd - Math.sin(a._ph) * 0.07, sx, sy);
        c.drawImage(this.headSpr(f, ci, ex, look), -10, -19, 20, 34);
        if (hit) { c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, 0, 8, 10.5, 0, 0, TAU); c.fill(); }
      }
      c.setTransform(m);
      c.fillStyle = '#ffd75c';
      for (const a of close) if (Math.max(a.bumpT || 0, a._bt) > 0) { const x = a._rx + (a._kp || 0), y =this.sy(a.y + a._oy); for (let i = 0; i < 2; i++) { const an = t * 8 + i * Math.PI; star4(c, x + Math.cos(an) * 10, y - 13 + Math.sin(an) * 3, 2.6); } }
    }
    // the named rivals, each with a signature swim
    const o = this.scr;
    const wk = clamp(this.winT / 1.2, 0, 1), wo = 1 - (1 - wk) * (1 - wk);
    // the win's fling: 0.9 to 1.6 s after, the losers fly off the egg in slow motion (0.4x)
    const fk = win ? clamp((this.endT - 0.9) / 0.7, 0, 1) : 0, fo = 1 - (1 - fk) * (1 - fk);
    const dft = race.draftTarget && p.draft > 0.05 ? race.draftTarget : null;
    this.labelQ = true; this.labelN = 0;
    for (const a of vis) if (a.boss) {
      const nm = a.boss.name, fn = a._fn || (a._fn = nm.split(' ')[0]), L = BOSS_LOOK[fn] || {}, dq = this.duel.get(a), nem = !!this.nemesis && fn === this.nemesis;
      if (dq && late && a === race.eggTaken) continue;   // it is inside the egg now (drawEgg draws it)
      let x = a._rx, y = this.sy(a.y + a._oy), ang = L.straight ? 0 : a._hd, sx = L.sx || 1, sy = L.sy || 1;
      if (dq) { x = dq.x; y = dq.y; ang = dq.ang; }
      if (L.tilt) ang += L.tilt * (a._tiltS || 1);
      // story beats: gloating right after passing you, a red-faced sprint for the egg, straining at the membrane
      const gloat = !dq && a.tauntT > 2.8, sprint = !dq && !a.arrived && !!a.sprint;
      let strain = 0, shv = 0, knocked = 0;
      const ph = a._tp, bt = Math.max(a.bumpT || 0, a._bt), pt = Math.max(a.passT || 0, a._pt);
      if (dq) {
        const prev = a._dl == null ? a.drill : a._dl;
        if (a.drill < prev - 1e-4) a._shv = 0.5;                       // Kevin's shove knocked it back
        a._dr = (a._dr || 0) + (Math.max(0, a.drill - prev) / Math.max(dt, 1e-3) - (a._dr || 0)) * Math.min(1, dt * 6);
        a._dl = a.drill; a._shv = Math.max(0, (a._shv || 0) - dt); shv = a._shv;
        const ca = Math.cos(dq.an), sa = Math.sin(dq.an);
        if (win && ov) {                      // flung off the egg in slow motion, turning
          knocked = fk > 0 ? 1 : 0; const kb = 150 * fo; x += ca * kb; y += sa * kb; if (!red) ang += fk * TAU * 0.45 * (a.ph > 0.5 ? 1 : -1);
        } else if (late && ov) {              // knocked off the egg, spinning
          knocked = 1; const kb = 60 * wo; x += ca * kb; y += sa * kb; ang += wo * TAU * (a.ph > 0.5 ? 1.3 : -1.3);
        } else if (!ov) {
          const rate = clamp((a._dr || 0) / 1, 0, 1.5), hb = Math.abs(Math.sin(t * 14 + a.ph * 5));
          strain = rate;
          const jab = red ? 0 : 5 * hb * rate; x -= ca * jab; y -= sa * jab;
          if (hb > 0.85 && rate > 0.2 && !red) { sy *= 0.86; sx *= 1.08; }   // squash on contact
          if (shv > 0) { const u = 1 - shv / 0.5, off = 15 * Math.exp(-5 * u) * Math.sin(18 * u); x += ca * off; y += sa * off; }
          a._swt = (a._swt || 0) - dt;
          if (rate > 0.2 && a._swt <= 0) {
            a._swt = 0.3; const sgn = Math.random() < 0.5 ? -1 : 1;
            this.addP(3, x + sgn * 10, this.camY + this.H - y + 12, sgn * (30 + Math.random() * 30), 30 + Math.random() * 30, 0.55, '#9ae2ff', 2.2, 220);
          }
        }
      }
      // signature tricks come from the race, never from a timer, and at least 2.5 s apart: Steve waves when
      // Kevin passes him, Brock flexes once a bump wears off, Gunther rolls when he taunts
      let want = null;
      if (L.wave && pt > 0 && !(a._ppt > 0)) want = 'wave';
      if (L.flex && bt <= 0 && a._pbt > 0) want = 'flex';
      if (L.roll && (a.tauntT || 0) > (a._ptt || 0) + 1) want = 'roll';
      if (L.read && pt > 0 && !(a._ppt > 0)) want = 'peek';                          // Tiffany looks up from her book
      if (L.quiff && ((pt > 0 && !(a._ppt > 0)) || (gloat && !a._pgl))) want = 'flick';   // Chad flicks his hair
      // gloating (the rising edge): Steve bows (sorry!), Brock flexes, Tiffany peeks over a raised book, smug
      let gw = false;
      if (gloat && !a._pgl) { const g = fn === 'Steve' ? 'bow' : fn === 'Brock' ? 'flex' : fn === 'Tiffany' ? 'smug' : null; if (g) { want = g; gw = true; } }
      // a rival who just taunted Kevin makes him huff
      if ((a.tauntT || 0) > (a._ptt || 0) + 1 && !ov && !race.demo) { if (!(this.huffT > 0)) this.huffNew = true; this.huffT = 0.8; }
      a._ppt = pt; a._pbt = bt; a._ptt = a.tauntT || 0; a._pgl = gloat;
      if (want && !ov && (gw || T - (a._trT ?? -9) >= 2.5)) { a._tr = want; a._trT = T; if (want === 'roll' && L.tilt) a._tiltS = -(a._tiltS || 1); }
      // the first meeting: the first frame Kevin is within 400, the rival shows off its signature trick for 1.2 s
      const dK = Math.hypot(x - p.x, a.y - p.y);
      if (a._met == null && dK < 400 && !ov && !dq) a._met = T;
      const meetT = a._met != null && !ov ? T - a._met : 9, meet = meetT < 1.2;
      if (meet && MEET_TRICK[fn]) { const tr = MEET_TRICK[fn]; a._tr = tr; a._trT = T - (meetT % TRICK_DUR[tr]); }
      const trT = a._tr ? T - a._trT : 9;
      const smugK = a._tr === 'smug' && trT < 0.9 ? (red ? 1 : Math.min(1, trT / 0.15, (0.9 - trT) / 0.15)) : 0;
      const bowTr = a._tr === 'bow' && trT < 0.8 ? (red ? 1 : Math.sin(trT / 0.8 * Math.PI)) : 0;
      let waveK = a._tr === 'wave' && trT < 0.9 && !bt ? trT / 0.9 : -1;
      let rollK = a._tr === 'roll' && trT < 0.5 ? trT / 0.5 : -1;
      let flexK = a._tr === 'flex' && trT < 0.6 ? Math.sin(trT / 0.6 * Math.PI) : 0;
      // Tiffany's peek: the book drops 6 px in 0.15 s, comes back up after 0.6 s
      const peek = a._tr === 'peek' && trT < 0.75 ? (red ? 1 : trT < 0.15 ? trT / 0.15 : trT < 0.6 ? 1 : 1 - (trT - 0.6) / 0.15) : 0;
      // Chad's flick: the quiff springs 1 -> 1.35 (one overshoot, 0.45 s), the head tilts, a sparkle and a tooth glint
      const flick = a._tr === 'flick' && trT < 0.45 ? trT / 0.45 : -1;
      // a hunting Big Mac within 110: shock, a faster tail, and an 8 px 'nope' sidestep away from it
      const wi = dq ? -1 : pn ? nearW(a, 110) : -1;
      a._dg = (a._dg || 0) + ((wi >= 0 ? (x >= PN[wi] ? 8 : -8) : 0) - (a._dg || 0)) * Math.min(1, dt * 14);
      x += a._dg;
      // a rival 0 to 120 behind Kevin is hunting him
      const hunter = !dq && !ov && p.y - a.y >= 0 && p.y - a.y <= 120;
      // Kevin is in its slipstream: it looks back and glares; after 1.2 s it grits, kicks harder and blows bubbles at him
      const drafted = a === dft && !dq && !ov;
      a._drT = drafted ? (a._drT || 0) + dt : 0;
      const grit = drafted && a._drT > 1.2;
      if (grit) {
        a._dbT = (a._dbT || 0) - dt;
        if (a._dbT <= 0) {
          a._dbT = 0.6;
          for (let i = 0; i < 2; i++) this.addP(3, x + (i ? 5 : -5) + (Math.random() - 0.5) * 4, a.y + a._oy - 30, (i ? 1 : -1) * (6 + Math.random() * 10), -60 - Math.random() * 30, 0.6, '#9ae2ff', 2.2);
        }
      }
      if (gloat) { const dx = clamp((p.x - x) / 120, -0.45, 0.45); ang += dx; }
      if (sprint) {   // puffs come off the tail end (behind it), never in front of its nose
        a._stm = (a._stm || 0) - dt;
        if (a._stm <= 0) { a._stm = 0.15; this.addP(0, x + (Math.random() - 0.5) * 8, a.y + a._oy - 30, (Math.random() - 0.5) * 24, -30 - Math.random() * 20, 0.5, '#f4eeff', 2 + Math.random() * 1.5); }
      }
      if (L.strut && !dq) { ang += Math.sin(t * 3 + a.ph) * 0.22; x += Math.sin(t * 3 + a.ph) * 3; }
      // a rival move (rivalMove): the tell winds up, the hit lunges at the egg, a counter leaves it spinning
      const mv = a._mvT != null && !ov && T - a._mvT < (MV_DUR[a._mvP] || 0) ? a._mvP : null, mvK = mv ? (T - a._mvT) / MV_DUR[mv] : 0;
      let bowK = 0, mirror = false, spinMv = 0;
      if (mv === 'tell') {
        const e = red ? 1 : 1 - mvK;
        sx *= 1 + 0.15 * e; sy *= 1 - 0.15 * e;
        if (a._mv === 'maxRep') flexK = Math.max(flexK, red ? 0.8 : Math.sin(mvK * Math.PI));
        else if (a._mv === 'hairCheck') mirror = true;
        else if (a._mv === 'sorry') bowK = red ? 1 : Math.sin(mvK * Math.PI);
      } else if (mv === 'hit') {
        if (!red) { y -= 22 * Math.sin(mvK * Math.PI); sy *= 1 + 0.12 * Math.sin(mvK * Math.PI); }
        if (a._mv === 'hairCheck') mirror = true;
      } else if (mv === 'countered') spinMv = red ? 0 : (1 - (1 - mvK) * (1 - mvK)) * TAU;
      // Gunther hops back 40 px for the dive (and springs forward again on the hit)
      const hopW = (mv === 'tell' || (a._mvP === 'tell' && a._mvT != null && T - a._mvT < 0.9)) && a._mv === 'stuntDive' ? 40 : 0;
      a._hop = (a._hop || 0) + (hopW - (a._hop || 0)) * (red ? 1 : Math.min(1, dt * 12));
      y += a._hop; ang += spinMv;
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
        if (fn === 'Tiffany' && !a._book && endT > 0.9) { a._book = 1; this.books.push({ a, t: 0, x, y, s: x < p.x ? -1 : 1 }); }
      }
      if (flick >= 0) {
        const sp = red ? 1 : Math.sin(flick * Math.PI) * 1.12 - 0.12 * Math.sin(flick * TAU);   // up, one overshoot, settle
        quiffK *= 1 + 0.35 * sp; ang += 0.25 * (red ? 1 : Math.sin(flick * Math.PI));
      }
      if (turn) ang += (x < p.x ? -1 : 1) * 0.9 * turn;
      if (rollK >= 0) { const r = Math.cos(rollK * TAU); sx *= Math.abs(r) < 0.08 ? (r < 0 ? -0.08 : 0.08) : r; }
      if (flexK > 0) { sx *= 1 + 0.12 * flexK; sy *= 1 + 0.08 * flexK; }
      if (droop) { sy *= 1 - 0.1 * droop; sx *= 1 + 0.06 * droop; }
      if (a._bt > 0) { const e = 0.8 - a._bt, q = 1 - 0.25 * Math.cos(e * 22) * Math.exp(-e * 7); sy *= q; sx *= 1 + (1 - q) * 0.8; }
      if (a._sqU > T) { sx *= 1.25; sy *= 0.8; }
      if (meet) this.dglow(a.boss.col, x, y, 74, 0.6 * (1 - meetT / 1.2));   // a spotlight for the introduction
      this.dglow(a.boss.col, x, y, 30, nem ? 0.5 : 0.35);
      let bodyCol = a.boss.col;
      if (sprint) { if (a._scK !== a.boss.col) { a._scK = a.boss.col; a._sc = css(lerpC(rgb(a.boss.col), SPRINT_COL, 0.25)); } bodyCol = a._sc; }
      o.name = nm; o.acc = L.acc; o.cap = L.cap; o.band = L.band; o.taper = 1; o.amp = L.amp * (grit ? 1.4 : 1); o.tw = L.tw; o.sx = sx; o.sy = sy; o.bob = L.strut ? Math.sin(t * 6 + a.ph) * 1.2 : 0;
      o.look = clamp((p.x - x) / 50, -1.2, 1.2); o.dizzy = bt > 0 || shv > 0.15 || knocked || mv === 'countered' ? 1 : 0; o.shock = pt > 0 ? 1 : 0;
      // the face: scared only while Kevin is passing it (the pt window)
      o.mouth = bt > 0 ? 'wobble' : pt > 0 ? 'scared' : L.mouth; o.brow = bt > 0 ? undefined : pt > 0 ? 'worried' : (L.brow || (nem ? 'angry' : undefined));
      o.nameCol = nem ? '#ff4d5e' : undefined; o.quiff = L.quiff ? 1 : 0; o.quiffK = quiffK;
      o.blink = blinkAt(t + a.ph * 3, L.blink || 2.9, L.dbl); o.happy = 0; o.blush = blushR; o.star = undefined; o.tired = 0; o.flash = 0; o.tail = undefined; o.flap = 1; o.crown = 0; o.wink = 0; o.ko = 0;
      // Kevin's secondary motion: head counter-yaw, a tail that lags turns, a stroke surge on each beat
      o.yaw = 1; o.curl = red ? 0 : clamp(-(a._av || 0) * 0.22, -0.5, 0.5);
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
      if (win && rk >= 0) {
        o.dizzy = rk < 0.15 && knocked ? 1 : 0;
        if (fn === 'Steve') { o.mouth = 'grin'; o.brow = undefined; o.happy = rk < 1 ? 1 : 0; o.blush = 1; }
        else if (fn === 'Brock') { o.mouth = rk < 1 ? 'grit' : 'wobble'; o.brow = 'worried'; }
        else if (fn === 'Tiffany') { o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; o.look = 0; o.blink = false; }
        else if (fn === 'Gunther') { o.mouth = 'wobble'; o.brow = undefined; }
        else if (fn === 'Chad') { o.mouth = 'smirk'; o.brow = 'angry'; o.look = p.x > x ? -1.2 : 1.2; }
      }
      if (this.isImp(a)) { o.flash = 1; o.tail = '#ffffff'; }
      if (meet) { const lb = a._lbl || (a._lbl = { fs: 0, ring: 1, sc: 1 }); lb.fs = this.fpx(16); lb.sc = Math.max(0.05, red ? 1 : backOut(Math.min(1, meetT / 0.3))); o.lbl = lb; } else o.lbl = null;
      const sq = this.impSquash(a, x, y);
      this.drawSwimmer(x, y, ang, RIVAL_SC, bodyCol, ph, o);
      if (sq) c.restore();
      // Tiffany reads while she cruises (and peeks over the book when Kevin passes)
      // (cruising: no pass, bump, sprint or duel; and always while she plays it by the book)
      const reading = L.read && !dq && !ov && (peek > 0 || smugK > 0 || (!(pt > 0) && !(bt > 0) && !sprint && wi < 0 && !(mv === 'countered')));
      if (reading || (mv && mv !== 'countered' && a._mv === 'byTheBook')) {
        const m = c.getTransform();
        setXf(c, m, x, y, ang, RIVAL_SC * sx, RIVAL_SC * sy);
        this.bookArt(11, -4 + 6 * peek - 5 * smugK, 0.7, (T + a.ph * 5) % 2.4);
        if (peek > 0) {   // two glints on her glasses
          c.fillStyle = '#ffffff'; c.globalAlpha = Math.min(1, peek * 1.5);
          star4(c, -2.2, -4.2, 1.2); star4(c, 4.2, -4.2, 1.2); c.globalAlpha = 1;
        }
        c.setTransform(m);
      }
      if (flick >= 0) {   // the sparkle at the quiff, a tooth glint for the first 0.3 s
        const m = c.getTransform();
        setXf(c, m, x, y, ang, RIVAL_SC * sx, RIVAL_SC * sy);
        c.fillStyle = '#fffbe0'; star4(c, 5.5, -15.5, 2.8 * (red ? 1 : 0.6 + 0.4 * Math.sin(flick * Math.PI)));
        if (flick * 0.45 < 0.3) { c.fillStyle = '#ffffff'; star4(c, 1.6, 3.2, 1.6); }
        c.setTransform(m);
      }
      if (mirror) this.mirrorArt(x + 13, y - 6, t);
      if (mv === 'tell') {   // the red '!' over its head
        const b = this.text('!', '#ff3d5a', 22), by = y - 52 * Math.max(1, sy) - (red ? 0 : 3 * Math.sin(mvK * Math.PI * 3));
        c.drawImage(b.cv, x - b.w / 2, by - b.h / 2, b.w, b.h);
      }
      if (mv === 'countered') { c.fillStyle = '#ffd75c'; for (let i = 0; i < 3; i++) { const an = t * 9 + i * TAU / 3; star4(c, x + Math.cos(an) * 15, y - 18 + Math.sin(an) * 4, 3.2); } }
      if (nem) {   // the nemesis: a pulsing anger vein at the top right of the head
        const ca = Math.cos(ang), sa = Math.sin(ang), lx = 7 * RIVAL_SC * sx, ly = -10 * RIVAL_SC * sy, vx = x + lx * ca - ly * sa, vy = y + lx * sa + ly * ca;
        this.angerVein(vx, vy, 3.4 * (red ? 1 : 1 + 0.18 * Math.sin(t * 8 + a.ph)));
      }
      if (bt > 0) { c.fillStyle = '#ffd75c'; for (let i = 0; i < 2; i++) { const an = t * 8 + i * Math.PI; star4(c, x + Math.cos(an) * 13, y - 17 + Math.sin(an) * 4, 3.2); } }
      if (waveK >= 0 && !bt) {   // Steve waves at you. Steve waves at everybody.
        const m = c.getTransform();
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
    this.flushLabels();
    this.drawBubble(race, dt);
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
    a._mv = ev.move; a._mvP = ev.phase; a._mvT = this.time;
    if (ev.phase === 'countered' && a._rx != null) {
      const wy = a.y + (a._oy || 0), n = this.lite || this.reduced ? 5 : 10;
      for (let i = 0; i < n; i++) { const an = i / n * TAU, v = 120 + Math.random() * 80; this.addP(1, a._rx, wy, Math.cos(an) * v, Math.sin(an) * v, 0.4, i % 2 ? '#ffd75c' : '#fff3c0', 2.6); }
      this.ring(a._rx, wy, '#ffd75c', 40, 0.35, 4);
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
      c.save(); c.translate(fx, fy); c.rotate(r); c.globalAlpha = Math.min(1, (1 - k) * 3);
      this.bookArt(0, 0, 1);
      c.restore();
    }
    B.length = n; c.globalAlpha = 1;
  }
  // a named rival who dropped out: a ghost of them (their colour, their hat) rises 60 px with a halo over 1.6 s,
  // with a farewell line when content.js has RIVAL_FAREWELLS
  rivalGhost(a) {
    const fn = a._fn || (a._fn = a.boss.name.split(' ')[0]);
    const g = { fn, col: css(lerpC(rgb(a.boss.col), [255, 255, 255], 0.45)), halo: a.boss.col, x: a._rx, y: a.y + (a._oy || 0), t: 0, max: 1.6, ph: a._tp || 0, sx: a._rx, sy: this.sy(a.y) };
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
  // one speech bubble at a time, over a rival
  drawBubble(race, dt) {
    const b = this.bubble;
    if (!b) return;
    b.life -= dt; if (b.life <= 0) { this.bubble = null; return; }
    let a = b.k;
    if (typeof a === 'number') a = race.agents[a];
    else if (typeof a === 'string') { const nm = a.toLowerCase(); a = race.agents.find((q) => q.alive && q.boss && (q.boss.name.toLowerCase() === nm || q.boss.name.split(' ')[0].toLowerCase() === nm)); }
    let hx, hy;
    if (b.ghost) { if (b.ghost.t >= b.ghost.max) return; hx = b.ghost.sx; hy = b.ghost.sy; }
    else if (a && this.thiefXY && this.thiefXY.a === a) { hx = this.thiefXY.x; hy = this.thiefXY.y - 10; }
    else {
      if (!a || !a.alive || a._seen !== this.frame) return;
      const dq = this.duel.get(a); hx = dq ? dq.x : a._rx; hy = dq ? dq.y : this.sy(a.y + (a._oy || 0));
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
    const k = 1 - b.life / b.max, sc = backOut(Math.min(1, k * b.max / 0.25)), fade = Math.min(1, b.life * 4), lh = fs + 2;
    const h = b.lines.length * lh + 10, bx = clamp(hx, b.w / 2 + 4, VIEW_W - b.w / 2 - 4);
    let by = hy - 30 - h;
    // never over a name tag: the plate climbs above any tag it would cover
    const LR = this.labRects;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (let i = 0; i < this.labRN * 4; i += 4) if (bx + b.w / 2 > LR[i] && bx - b.w / 2 < LR[i + 2] && by + h > LR[i + 1] && by < LR[i + 3]) { by = LR[i + 1] - h - 3; moved = true; }
      if (!moved) break;
    }
    // and never into the top-left 140 x 60 banner corner, or under the HUD: there it is dropped
    if ((bx - b.w / 2 < 140 && by < 60) || (!race.over && by < this.hudB())) return;
    c.save(); c.globalAlpha = fade; c.translate(hx, hy - 18); c.scale(sc, sc); c.translate(-hx, -(hy - 18));
    c.fillStyle = 'rgba(30,0,30,0.25)'; this.rrect(bx - b.w / 2 + 2, by + 2, b.w, h, 9); c.fill();
    c.fillStyle = '#fff'; this.rrect(bx - b.w / 2, by, b.w, h, 9); c.fill();
    c.beginPath(); c.moveTo(clamp(hx, bx - b.w / 2 + 10, bx + b.w / 2 - 18), by + h - 1); c.lineTo(hx + 2, hy - 16); c.lineTo(clamp(hx, bx - b.w / 2 + 10, bx + b.w / 2 - 18) + 10, by + h - 1); c.fill();
    c.fillStyle = '#2a0a24'; c.textAlign = 'center'; c.textBaseline = 'middle';
    b.lines.forEach((l, i) => c.fillText(l, bx, by + 5 + lh / 2 + i * lh));
    c.restore();
  }
  drawSwimmer(x, y, ang, sc, col, ph, o = {}) {
    const c = this.ctx, st = o.stretch || 1;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc * (o.sx || 1), sc * (o.sy || 1));
    // tail
    c.strokeStyle = o.tail || 'rgba(255,255,255,0.92)'; c.lineCap = 'round'; c.lineJoin = 'round';
    if (o.taper) this.taperTail(c, 34 * (0.8 + 0.2 * st) * (o.tlen || 1), o.amp || 6, ph, o.tw || 3.4, o.curl || 0);
    else { c.lineWidth = 2.2; c.beginPath(); this.tail(c, 0, 8, 0, 32, o.amp || 6, ph); c.stroke(); }
    if (o.yaw) c.rotate(-Math.sin(ph) * 0.06);   // the head counter-yaws against the tail beat
    c.scale(1 / Math.sqrt(st), st);
    this.head(c, col, ph, o);
    c.restore();
    if (o.name) {
      const ny = y - 23 * sc - (o.acc && o.acc.includes('crown') ? 6 : 0) - (o.quiff ? 3 : 0);
      if (this.labelQ) this.queueLabel(x, ny, o.name, o.nameCol || col, o.lbl || null);
      else this.drawLabel(x, ny, o.name, o.nameCol || col);
    }
  }
  // name labels: queued while the rivals draw, then stacked so they never overlap ('BrockTiffany' at the egg)
  // (lbl: an optional {fs, ring, sc} for a punched-in label, the first meeting with a rival)
  queueLabel(x, y, text, col, lbl = null) {
    const L = this.labels, i = this.labelN++;
    const q = L[i] || (L[i] = { x: 0, y: 0, text: '', col: '', w: 0, fs: 0, ring: 0, sc: 1 });
    q.x = x; q.y = y; q.text = text; q.col = col; q.w = 0;
    q.fs = lbl ? lbl.fs : 0; q.ring = lbl ? lbl.ring : 0; q.sc = lbl ? lbl.sc : 1;
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
    return true;
  }
  // every label drawn this frame (x0, y0, x1, y1): speech plates keep off them
  labRect(x, y, w, h) {
    const R = this.labRects, i = this.labRN * 4; this.labRN++;
    R[i] = x - w / 2; R[i + 1] = y - h / 2; R[i + 2] = x + w / 2; R[i + 3] = y + h / 2;
  }
  flushLabels() {
    const c = this.ctx, n = this.labelN, L = this.labels, fs = this.fpx(13), h = fs;
    this.labelQ = false; this.labelN = 0;
    if (!n) return;
    // widths straight from the baked name-tag sprites (no measureText a frame)
    for (let i = 0; i < n; i++) { const q = L[i], sp = this.text(q.text, this.labelCol(q.col), q.fs || fs, 'label'); q.w = q.fs ? sp.w * q.sc : sp.w; }
    const S = this._lsort || (this._lsort = []); S.length = 0;
    for (let i = 0; i < n; i++) S.push(L[i]);
    S.sort((a, b) => a.x - b.x);
    for (let i = 1; i < n; i++) {
      const q = S[i];
      for (let it = 0; it < 6; it++) {
        let hit = false;
        for (let j = 0; j < i; j++) { const r = S[j]; if (Math.abs(r.x - q.x) < (r.w + q.w) / 2 && Math.abs(r.y - q.y) < h) { q.y = r.y - h - 2; hit = true; } }
        if (!hit) break;
      }
    }
    // a label under a live big pop ('FINAL SPRINT!' on Brock's tag) sits this one out
    const BB = this.bigBoxes, bn = this.bigBoxN;
    for (let i = 0; i < n; i++) {
      const q = S[i]; let hid = false;
      for (let j = 0; j < bn; j += 4) if (Math.abs(BB[j] - q.x) < BB[j + 2] + q.w / 2 && Math.abs(BB[j + 1] - q.y) < BB[j + 3] + h * 0.6) { hid = true; break; }
      if (hid || !this.labelFit(q, h * 1.35)) continue;
      if (q.fs) {   // punched in: a bigger tag scaling up with backOut, ringed in the rival's colour
        const m = c.getTransform();
        c.translate(q.x, q.y); c.scale(q.sc, q.sc);
        this.drawLabel(0, 0, q.text, q.col, q.fs, q.ring, false);
        c.setTransform(m); this.labRect(q.x, q.y, q.w + q.fs, q.fs * 1.35 * q.sc);
      } else this.drawLabel(q.x, q.y, q.text, q.col);
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
    if (!o.round) { c.beginPath(); c.ellipse(0, 9.5, 2.8, 3.6, 0, 0, TAU); c.fill(); }
    c.beginPath(); if (o.round) c.arc(0, 0, 9.5, 0, TAU); else c.ellipse(0, 0, 7.5, 10, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 1; c.stroke();
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
    const look = o.look || 0, ink = '#1a0a1a', er = o.shock ? 3.4 : 2.9;
    for (const sx of [-1, 1]) {
      const ex = sx * 3.2, ey = -2.5;
      if (o.ko) { c.strokeStyle = ink; c.lineWidth = 1.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(ex - 1.2, ey - 1.2); c.lineTo(ex + 1.2, ey + 1.2); c.moveTo(ex + 1.2, ey - 1.2); c.lineTo(ex - 1.2, ey + 1.2); c.stroke(); continue; }
      if (o.dizzy) { c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath(); c.arc(ex, ey, 2, ph * 0.4, ph * 0.4 + 4.5); c.stroke(); c.beginPath(); c.arc(ex, ey, 0.8, 0, TAU); c.stroke(); continue; }
      if (o.wink && sx === 1) { c.strokeStyle = ink; c.lineWidth = 1.3; c.beginPath(); c.arc(ex, ey + 0.8, 2.1, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); continue; }
      if (o.blink || o.happy) { c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath(); if (o.happy) c.arc(ex, ey + 0.6, 2, Math.PI * 1.1, Math.PI * 1.9); else { c.moveTo(ex - 2.4, ey); c.lineTo(ex + 2.4, ey); } c.stroke(); continue; }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill();
      if (o.star) { c.fillStyle = o.star; star4(c, ex + look * 0.6, ey - 0.4, 2.4); }
      else {
        c.fillStyle = ink; c.beginPath(); c.arc(ex + look, ey - 0.7, o.shock ? 0.9 : o.mouth === 'scared' ? 1 : 1.45, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + look - 0.5, ey - 1.3, 0.5, 0, TAU); c.fill();
      }
      if (o.tired) { c.fillStyle = col; c.beginPath(); c.arc(ex, ey, 3.1, Math.PI, TAU); c.fill(); c.strokeStyle = ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex - 3, ey); c.lineTo(ex + 3, ey); c.stroke(); }
      if (acc.includes('lashes')) { c.strokeStyle = ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex + sx * 2.4, ey - 1.8); c.lineTo(ex + sx * 3.8, ey - 3); c.moveTo(ex + sx * 1.2, ey - 2.8); c.lineTo(ex + sx * 1.9, ey - 4.3); c.stroke(); }
    }
    if (o.brow) {
      c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath();
      for (const sx of [-1, 1]) { const inY = o.brow === 'angry' ? -5.2 : -7, outY = o.brow === 'angry' ? -6.8 : -5.6; c.moveTo(sx * 1.2, inY); c.lineTo(sx * 5, outY); }
      c.stroke();
    }
    if (acc.includes('glasses')) { gr = grow('glasses', 0, -2.5); c.strokeStyle = '#3a2a50'; c.lineWidth = 0.9; c.beginPath(); c.arc(-3.2, -2.5, 3.3, 0, TAU); c.moveTo(6.5, -2.5); c.arc(3.2, -2.5, 3.3, 0, TAU); c.moveTo(-0.1, -2.7); c.lineTo(0.1, -2.7); c.stroke(); if (gr) c.restore(); }
    if (acc.includes('shades')) {
      gr = grow('shades', 0, -3); c.fillStyle = '#141420'; c.beginPath(); c.moveTo(-7, -4.6); c.lineTo(7, -4.6); c.lineTo(6.2, -1.2); c.quadraticCurveTo(3.6, 0.6, 1, -1.6); c.lineTo(-1, -1.6); c.quadraticCurveTo(-3.6, 0.6, -6.2, -1.2); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(-5.4, -4, 2, 0.9); c.fillRect(2, -4, 2, 0.9); if (gr) c.restore();
    }
    // mouth
    const m = o.mouth;
    c.strokeStyle = '#5a1020'; c.fillStyle = '#5a1020'; c.lineWidth = 1.2;
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
  ringCol(f) {
    return f > 0.5 ? css(lerpC(rgb('#ff9a3c'), rgb('#ffd75c'), (f - 0.5) * 2, SCR)) : css(lerpC(rgb('#ff3d3d'), rgb('#ff9a3c'), clamp(f * 2, 0, 1), SCR));
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
      // style 6: sparkles fly off the tail every 0.05 s
      if (style >= 6 && ribbon && !red) {
        this.sparkT -= wdt;
        while (this.sparkT <= 0) {
          this.sparkT += 0.05;
          const j = (this.trH - Math.min(n, 6) + TRAIL_N) % TRAIL_N;
          this.addP(1, TX[j] + (Math.random() - 0.5) * 10, TY[j] - 18, (Math.random() - 0.5) * 120, -40 - Math.random() * 80, 0.35, Math.random() < 0.5 ? '#ffffff' : HSL75[hueI(t * 400 + Math.random() * 120)], 2);
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
    // tail phase accumulates (a changing rate times total time would jitter)
    const tw = dash ? 26 : frenzy ? 21 : 15 + (p.vy / 500) * 3;
    this.pTw += (tw - this.pTw) * Math.min(1, dt * 8); this.pPh += this.pTw * wdt;
    // wingman
    if (p.wing > 0 && !win) this.drawSwimmer(p.x - 26, this.sy(p.y) + 14 + Math.sin(t * 3) * 4, p.heading, 0.9, '#ffe0a8', this.pPh + 2, { band: '#5ce1ff', acc: ['glasses'], mouth: 'grin', blink: (t % 3) < 0.1 });
    let danger = false; for (const e of race.ents) if (e.t === 'wbc' && !e.dead && Math.abs(e.y - p.y) < 130 && Math.hypot(e.x - p.x, e.y - p.y) < 120) { danger = true; break; }
    const blinkInv = p.inv > 0 && p.inv < 1 && Math.floor(t * 20) % 2 === 0 && !ov;
    const low = p.e < 30, stuck = p.stuck > 0;
    this.updateAcc(race);
    const accK = this.accT > 0 ? backOut(clamp(1 - this.accT / 0.35, 0, 1)) : 1;
    const o = {
      band: this.accList.includes('band') ? '#ffd75c' : '#ff3d6e', acc: this.accList.filter((a) => a !== 'band'), accNew: this.accNew, accK,
      taper: 1, flap: 1 + (dash ? 1.4 : 0) + (p.vy / 700),
      // a stroke surge on each tail beat: bigger dashing, smaller when tired, halved for reduced motion
      stretch: 1 + this.sq + (dash ? 0.08 : low ? 0.03 : 0.05) * (red ? 0.5 : 1) * Math.max(0, Math.sin(this.pPh)),
      look: clamp(p.vx / 200, -1.2, 1.2), flash: this.pHit / 0.35,
      blink: !danger && !dash && (t % 3.4) < 0.12, yaw: 1,
    };
    this.kevCol = o.band;
    // eye contact: a named rival within 140 px draws Kevin's look
    {
      let tl = null, bd = 140;
      for (const a of race.agents) if (a.boss && a.alive && a._seen === this.frame && a._rx != null) { const d = Math.hypot(a._rx - p.x, a.y - p.y); if (d < bd) { bd = d; tl = clamp((a._rx - p.x) / 30, -1.2, 1.2); } }
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
    if (stuck) { o.dizzy = 1; o.mouth = 'wobble'; }
    else if (danger) { o.mouth = 'scared'; o.brow = 'worried'; }
    else if (huff) { o.mouth = 'grit'; o.brow = 'angry'; o.puff = red ? 1 : 0.8 + 0.2 * Math.sin(t * 20); o.blink = false; }
    else if (frenzy) { o.mouth = 'huge'; o.star = '#ffd75c'; o.blush = 1; }
    else if (dash) { o.mouth = 'grin'; o.brow = 'angry'; }
    else if (combo > 5) { o.mouth = 'grin'; o.blush = 1; }
    else if (low) { o.mouth = 'pant'; o.tired = 1; o.brow = 'worried'; }
    else if (race.drill) { o.mouth = 'grin'; o.happy = 1; o.blush = 1; }
    // micro reactions on top (never over a bonk or a Big Mac in your face)
    if (!stuck && !danger && !huff) {
      if (this.nearT > 0.35) { o.shock = 1; o.mouth = 'scared'; o.brow = 'worried'; o.star = undefined; o.happy = 0; o.blink = false; }
      else if (this.nearT > 0) { o.mouth = 'grin'; o.blush = 1; o.brow = undefined; }
      if (this.chompT > 0) { o.mouth = 'huge'; o.blink = false; }
      if (this.winkT > 0 && !(this.nearT > 0.35)) { o.wink = 1; o.happy = 0; o.star = undefined; if (!this.chompT) o.mouth = 'smirk'; }
    }
    // the tail: follow-through curl from turning, tired droop, tight dash whip, wild frenzy
    let ang = race.drill ? p.heading : clamp((p.heading || 0) + this.lean, -0.8, 0.8);
    if (this.pAng == null) this.pAng = ang;
    const av = clamp((ang - this.pAng) / Math.max(dt, 1e-3), -8, 8); this.pAng = ang;
    this.pAngV += (av - this.pAngV) * Math.min(1, dt * 8);
    o.amp = frenzy ? 8.5 : dash ? 4 : 6; o.curl = red ? 0 : clamp(-this.pAngV * 0.22, -0.5, 0.5);
    if (dash) o.tw = 3;
    if (low && !frenzy && !dash) { o.amp *= 0.6; o.curl += 0.1 + 0.08 * Math.sin(t * 0.9); o.tlen = 0.92; }
    // win: Kevin is in. Steal: Kevin bounces off, seeing stars.
    if (win) {
      ang *= 1 - we; const sq = Math.sin(wk * Math.PI) * 0.18; o.sx = 1 + sq; o.sy = 1 - sq;
      if (wk >= 1) { o.crown = 1; o.happy = 1; o.blush = 1; o.mouth = 'huge'; o.star = undefined; o.wink = 0; }
    } else if (steal) { ang += spin; o.dizzy = 1; o.mouth = 'wobble'; o.star = undefined; }
    if (this.linkT > 0 && !dieKind && !win) { o.sy = (o.sy || 1) * 1.12; o.sx = (o.sx || 1) / 1.06; }
    if (this.wallT > 0 && !red && !dieKind && !win) { const k = this.wallT / 0.25; o.sx = (o.sx || 1) * (1 - 0.12 * k); o.sy = (o.sy || 1) * (1 + 0.05 * k); }   // squashed on the wall
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
    // a soft pink ground halo under Kevin, breathing with the beat, so he is easy to find in the crowd
    if (showKevin && !dieKind && !win) {
      const hr = 24 * (scl / KEVIN_SC); c.globalAlpha = 0.3 + 0.15 * beat;
      c.drawImage(this.glow('#ff8fc8'), x - hr * 1.15, y + 4 - hr * 0.85, hr * 2.3, hr * 1.7); c.globalAlpha = 1;
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
    // shields: bubbly hex shimmer
    for (let i = 0; i < (ov ? 0 : p.shield); i++) {
      const r = 24 + i * 5 + Math.sin(t * 6 + i) * 1.5;
      c.strokeStyle = `rgba(255,215,92,${0.75 - i * 0.18})`; c.lineWidth = 2; c.beginPath();
      for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU + t * (i % 2 ? -0.8 : 0.8); k ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      c.stroke();
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
      const dt0 = race.draftTarget, tx = dt0._rx != null ? dt0._rx : race.agentX(dt0), ty = this.sy(dt0.y + (dt0._oy || 0));
      c.strokeStyle = `rgba(140,220,255,${Math.min(0.9, p.draft * 2)})`; c.lineWidth = 1.5; c.setLineDash([4, 5]); c.lineDashOffset = -t * 40;
      c.beginPath(); c.moveTo(x - 9, y - 12); c.lineTo(tx - 5, ty + 8); c.moveTo(x + 9, y - 12); c.lineTo(tx + 5, ty + 8); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    }
    // "YOU" marker for the first 6 s of a run, and for 1.5 s after every card pick (so you can find Kevin)
    // hype buddies: one tiny sperm fan per FRENZY tier (up to 5) orbiting him
    this.drawBuddies(race, x, y, dt);
    // (a headline pop owns that space: the marker fades out while one is up)
    this.headK = (this.headK || 0) + ((this.headUp || 0) - (this.headK || 0)) * Math.min(1, dt * 12);
    const youA = (race.demo || ov ? 0 : Math.max(race.t != null && race.t < 6 ? clamp(6 - race.t, 0, 1) : 0, clamp(this.youT / 0.3, 0, 1))) * (1 - clamp(this.headK, 0, 1));
    if (youA > 0) {
      const a = youA, b = red ? 0 : Math.sin(t * 8) * 3;
      c.globalAlpha = a; c.fillStyle = '#ff3d6e'; c.beginPath(); c.moveTo(x, y - 26 + b); c.lineTo(x - 7, y - 36 + b); c.lineTo(x + 7, y - 36 + b); c.closePath(); c.fill();
      const s = this.text('YOU', '#ffffff', 14); c.drawImage(s.cv, x - s.w / 2, y - 46 + b - s.h / 2, s.w, s.h);
      c.globalAlpha = 1;
    }
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
    this.drawImpact();
    // particles: ring buffer, frame-rate independent drag. Streaks (1) and shards (5) are batched into one path
    // per colour and width bucket; bubble rings (4) come from a cached sprite.
    const d94 = Math.pow(0.94, wdt * 60), d985 = Math.pow(0.985, wdt * 60), d97 = Math.pow(0.97, wdt * 60);
    const P = this.P, top = -40, bot = this.H + 40, SB = this.streaks, NP = Math.min(this.pHW, P.length);
    if (SB.size > 48) SB.clear();
    for (const v of SB.values()) { v[0].length = 0; v[1].length = 0; v[2].length = 0; }
    let live = 0;
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
      const a = q.life / q.max;
      if (q.k === 0) { const r = q.size * (0.4 + a); c.globalAlpha = a; c.drawImage(this.dot(q.col), q.x - r * 1.45, sy - r * 1.45, r * 2.9, r * 2.9); continue; }
      if (q.k === 1 || q.k === 5 || q.k === 6) {
        let v = SB.get(q.col); if (!v) { v = [[], [], []]; SB.set(q.col, v); }
        if (q.k === 6) { const sp = Math.hypot(q.vx, q.vy) || 1, l = Math.min(18, sp * 0.04) * (0.5 + 0.5 * a); v[1].push(q.x, sy, q.x - q.vx / sp * l, sy + q.vy / sp * l); }
        else if (q.k === 1) { const w = q.size * 0.7 * (0.4 + a), bk = w < 1.6 ? 0 : w < 2.8 ? 1 : 2; v[bk].push(q.x, sy, q.x - q.vx * 0.05 * (0.4 + 0.6 * a), sy + q.vy * 0.05 * (0.4 + 0.6 * a)); }
        else { const l = q.size * (0.35 + 0.65 * a), dx = Math.cos(q.rot) * l, dy = Math.sin(q.rot) * l; v[2].push(q.x - dx, sy - dy, q.x + dx, sy + dy); }
        continue;
      }
      if (q.k === 4) { const r = q.size * (1.5 - a * 0.5); c.globalAlpha = a; c.drawImage(this.ringSpr(q.col), q.x - r - 1, sy - r - 1, r * 2 + 2, r * 2 + 2); continue; }
      c.globalAlpha = q.k === 2 ? Math.min(1, a * 3) : a; c.fillStyle = q.col;
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
    for (const q of this.pops) {
      // only the oldest big pop is the headline; the rest wait (and do not age) behind it
      if (q.big) { if (headSeen) { this.pops[n++] = q; continue; } headSeen = true; }
      // n-dependent big pops bake at 4 px steps and scale at draw time (fewer distinct sprites)
      const bs = q.big ? Math.max(20, Math.round(q.size / 4) * 4) : q.size, dsc = q.size / Math.round(bs);
      // the sprite is kept on the pop (the LRU is touched only on the first bake; an evicted sprite is re-baked)
      if (q.spr && (q.spr.dead || q.sprBs !== bs)) q.spr = null;
      const s = q.spr || this.text(q.text, q.col, bs, q.big ? 'popP' : 'pop', true);
      if (!s) { this.pops[n++] = q; continue; }        // bake budget used up: wait a frame, do not age
      q.spr = s; q.sprBs = bs;
      q.age += pdt; q.life -= pdt; if (q.life <= 0) continue; this.pops[n++] = q;
      const k = 1 - q.life / q.max, ag = q.age, W = s.w * dsc, Hs = s.h * dsc;
      const sc = (ag < 0.08 ? 1.35 * backOut(ag / 0.08) / backOut(1) : ag < 0.18 ? 1.35 - 0.35 * (ag - 0.08) / 0.1 : 1 - Math.max(0, k - 0.7) * 0.4) * dsc;
      const fadeA = Math.min(k > 0.7 ? (1 - k) / 0.3 : 1, q.life / 0.25);
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
        q.dy = q.y + 30 * (1 - Math.pow(1 - k, 3));
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
      const rot = q.big ? q.rot * 0.4 * Math.max(0, 1 - ag) : q.rot * (1 - k) + Math.sin(k * 18) * 0.05 * (1 - k);
      c.globalAlpha = fadeA * q.al * q.fa;
      setXf(c, m, x, y, rot, sc, sc); c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h);
      if (q.big && bbn < 24) { BB[bbn++] = x; BB[bbn++] = y; BB[bbn++] = s.w * sc * 0.5; BB[bbn++] = s.h * sc * 0.35; }
    }
    this.headUp = headUp;
    c.setTransform(m);
    this.bigBoxN = bbn;
    this.pops.length = n; c.globalAlpha = 1;
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
    o.taper = 1; o.amp = 6; o.tw = 3.4; o.band = '#ff3d6e'; o.acc = []; o.yaw = 1; o.stretch = 1 + (red ? 0 : 0.04 * Math.max(0, Math.sin(ph)));
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
const BX = new Float32Array(64), BY = new Float32Array(64);
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
  const c0 = rgb(z.col[0]), c1 = rgb(z.col[1]), wl = rgb(z.wall);
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
      for (let i = 0; i < 40; i++) { const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 9; wrap(x, y, r + 2, (ox, o) => { g.strokeStyle = 'rgba(182,255,92,0.22)'; g.lineWidth = 1.3; g.beginPath(); g.arc(x + ox, y + o, r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(220,255,170,0.25)'; g.beginPath(); g.arc(x + ox - r * 0.35, y + o - r * 0.35, r * 0.25, 0, TAU); g.fill(); }); }
    } else if (z.id === 'goo') {
      // a faint 24 px cell mesh (rows of 24 tile the 720 px height exactly)
      g.strokeStyle = 'rgba(232,238,255,0.08)'; g.lineWidth = 1.2; g.beginPath();
      for (let r = 0; r < H / 24; r++) for (let q = -1; q <= W / 24; q++) { const x = q * 24 + (r % 2 ? 12 : 0) + 12, y = r * 24 + 12; g.moveTo(x + 11, y); g.arc(x, y, 11, 0, TAU); }
      g.stroke();
      for (let i = 0; i < 14; i++) {
        const x = rnd() * W, y = rnd() * H, L = 60 + rnd() * 140, w = 1.5 + rnd() * 3;
        wrap(x, y + L / 2, L / 2 + 20, (ox, o) => { g.strokeStyle = 'rgba(232,238,255,0.24)'; g.lineWidth = w; g.beginPath(); g.moveTo(x + ox, y + o); g.bezierCurveTo(x + ox + 14, y + o + L * 0.3, x + ox - 14, y + o + L * 0.7, x + ox + 4, y + o + L); g.stroke(); g.fillStyle = 'rgba(240,244,255,0.32)'; g.beginPath(); g.arc(x + ox + 4, y + o + L + 3, w + 1.5, 0, TAU); g.fill(); });
      }
    } else if (z.id === 'sea') {
      for (let i = 0; i < 24; i++) {
        const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 16, a = rnd() * TAU, sq = 0.5 + rnd() * 0.5;
        wrap(x, y, r, (ox, o) => { g.save(); g.translate(x + ox, y + o); g.rotate(a); g.scale(1, sq); g.fillStyle = 'rgba(190,30,60,0.35)'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(90,5,25,0.35)'; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill(); g.restore(); });
      }
    } else if (z.id === 'fork') {
      for (let i = 0; i < 46; i++) { const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 18; wrap(x, y, r + 2, (ox, o) => { g.strokeStyle = 'rgba(255,155,224,0.13)'; g.lineWidth = 2; g.beginPath(); g.arc(x + ox, y + o, r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,155,224,0.16)'; g.beginPath(); g.arc(x + ox + r * 0.2, y + o, r * 0.25, 0, TAU); g.fill(); }); }
    } else if (z.id === 'rapids') {
      // darker ridge bands across the flow, like ripples worn into a riverbed (they span the full width already)
      for (let i = 0; i < 12; i++) {
        const y = rnd() * H, lw = 6 + rnd() * 4, amp = 6 + rnd() * 10, ph = rnd() * TAU;
        wrap(W / 2, y, amp + lw, (ox, o) => { if (ox) return; g.strokeStyle = 'rgba(0,20,30,0.35)'; g.lineWidth = lw; g.beginPath(); for (let x = -10; x <= W + 10; x += 20) { const yy = y + o + Math.sin(x / 60 + ph) * amp; x < 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.stroke(); });
      }
      // the width is drawn once per streak, outside wrap(), so all copies match and the seed stays in step
      for (let i = 0; i < 46; i++) { const x = rnd() * W, y = rnd() * H, L = 40 + rnd() * 120, lw = 1 + rnd() * 2; wrap(x, y + L / 2, L / 2 + 10, (ox, o) => { g.strokeStyle = 'rgba(92,225,255,0.13)'; g.lineWidth = lw; g.beginPath(); g.moveTo(x + ox, y + o); g.quadraticCurveTo(x + ox + 8, y + o + L / 2, x + ox, y + o + L); g.stroke(); }); }
    } else if (z.id === 'egg') {
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
function paintPiece(id, v) {
  const K = 2, rnd = seeded(5150 + v * 31 + id.length * 7);
  let w = 160, h = 200;
  if (id === 'goo') { w = 220; h = 130; } else if (id === 'sea') { w = 280; h = 130; } else if (id === 'rapids') { w = 150; h = 190; }
  else if (id === 'launch') { w = 160; h = 110; } else if (id === 'egg') { w = 170; h = 170; }
  const cv = mk(w * K, h * K), g = cv.getContext('2d'); g.scale(K, K); g.lineCap = 'round'; g.lineJoin = 'round';
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
  } else if (id === 'fork') { // amethyst stalactites: the acid crystals flipped (base on the wall at the top, tips hanging)
    const n = 4 + Math.floor(rnd() * 2); tips = [];
    for (let i = 0; i < n; i++) {
      const bx = w * (0.2 + 0.6 * (i + 0.5) / n) + (rnd() - 0.5) * 14, bw = 14 + rnd() * 14, ht = 70 + rnd() * 110, lean = (rnd() - 0.5) * 0.5;
      const tx = bx + Math.sin(lean) * ht, ty = ht;
      g.fillStyle = '#3e1d78'; g.beginPath(); g.moveTo(bx - bw / 2, 0); g.lineTo(tx, ty); g.lineTo(bx + bw / 2, 0); g.closePath(); g.fill();
      g.fillStyle = '#ff9be0'; g.beginPath(); g.moveTo(bx - bw / 2, 0); g.lineTo(tx, ty); g.lineTo(bx - bw * 0.05, 0); g.closePath(); g.fill();
      g.strokeStyle = '#ffe6fa'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(tx, ty); g.lineTo(bx - bw * 0.05, 0); g.stroke();
      tips.push(tx, ty);
    }
    g.fillStyle = '#21103f'; g.beginPath(); g.ellipse(w / 2, 2, w * 0.42, 9, 0, 0, TAU); g.fill();
  } else if (id === 'egg') {  // corona radiata: a cluster of 5 to 7 golden helper cells
    const n = 5 + Math.floor(rnd() * 3), cx = w / 2, cy = h / 2;
    for (let i = 0; i < n; i++) {
      const an = i / n * TAU + rnd() * 0.5, rr = i ? 34 + rnd() * 20 : 0, r = 20 + rnd() * 12, x = cx + Math.cos(an) * rr, y = cy + Math.sin(an) * rr;
      g.globalAlpha = 0.5; g.fillStyle = '#ffd75c'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.globalAlpha = 1; g.strokeStyle = '#fff3c0'; g.lineWidth = 2.4; g.stroke();
      g.fillStyle = 'rgba(200,140,40,0.45)'; g.beginPath(); g.arc(x + r * 0.2, y + r * 0.1, r * 0.32, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(x - r * 0.4, y - r * 0.4, r * 0.15, 0, TAU); g.fill();
    }
  } else if (id === 'acid') {        // crystal stalagmites: a cluster of lime shards with pale facets
    // hazard readability: a 3 px ink outline outside every shard, a pale inner rim, and a diagonal hatch (a
    // cue that still reads in greyscale)
    const n = 4 + Math.floor(rnd() * 2), S = [];
    for (let i = 0; i < n; i++) {
      const bx = w * (0.2 + 0.6 * (i + 0.5) / n) + (rnd() - 0.5) * 14, bw = 14 + rnd() * 14, ht = 70 + rnd() * 110, lean = (rnd() - 0.5) * 0.5;
      S.push(bx, bw, bx + Math.sin(lean) * ht, h - ht);
    }
    const shard = (i) => { const bx = S[i], bw = S[i + 1]; g.moveTo(bx - bw / 2, h); g.lineTo(S[i + 2], S[i + 3]); g.lineTo(bx + bw / 2, h); g.closePath(); };
    g.beginPath(); for (let i = 0; i < S.length; i += 4) shard(i);
    g.globalAlpha = 0.85; g.strokeStyle = HZ_INK; g.lineWidth = 6; g.stroke(); g.globalAlpha = 1;
    for (let i = 0; i < S.length; i += 4) {
      const bx = S[i], bw = S[i + 1], tx = S[i + 2], ty = S[i + 3];
      g.fillStyle = '#4f8f12'; g.beginPath(); shard(i); g.fill();
      g.fillStyle = '#b6ff5c'; g.beginPath(); g.moveTo(bx - bw / 2, h); g.lineTo(tx, ty); g.lineTo(bx - bw * 0.05, h); g.closePath(); g.fill();
    }
    g.save(); g.beginPath(); for (let i = 0; i < S.length; i += 4) shard(i); g.clip();
    g.globalAlpha = 0.35; g.strokeStyle = HZ_INK; g.lineWidth = 2; g.beginPath();
    for (let d = -h; d < w + h; d += 8) { g.moveTo(d, h); g.lineTo(d + h, 0); }
    g.stroke(); g.restore(); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
    for (let i = 0; i < S.length; i += 4) {
      const bx = S[i], bw = S[i + 1], tx = S[i + 2], ty = S[i + 3], ix = bx - bw / 2 + 2.2;
      g.beginPath(); g.moveTo(ix, h - 2); g.lineTo(tx + (ix < tx ? -0.6 : 0.6), ty + 3.5); g.lineTo(bx + bw / 2 - 2.2, h - 2); g.stroke();
      g.strokeStyle = '#eaffc0'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(tx, ty); g.lineTo(bx - bw * 0.05, h); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
    }
    g.fillStyle = '#2f5a08'; g.beginPath(); g.ellipse(w / 2, h - 2, w * 0.42, 9, 0, 0, TAU); g.fill();
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
    const gr = g.createLinearGradient(0, 0, 0, 118);
    gr.addColorStop(0, 'rgba(244,246,255,0.9)'); gr.addColorStop(1, 'rgba(200,212,255,0.3)');
    path(); g.fillStyle = gr; g.fill();
    g.globalAlpha = 0.5; g.strokeStyle = '#8a96d8'; g.lineWidth = 1.5; g.stroke(); g.globalAlpha = 1;
    // a glossy line down every drape, a shine on each bulb, a bright lip along the wall
    g.globalAlpha = 0.6; g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath();
    for (let i = 1; i < n; i++) { const x = w * i / n; g.moveTo(x - 1.2, 22); g.lineTo(x - 1.2, D[i] - B[i] * 1.2); }
    g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath();
    for (let i = 1; i < n; i++) { const x = w * i / n, br = B[i]; g.moveTo(x - br * 0.35 + br * 0.28, D[i] + br * 0.15); g.arc(x - br * 0.35, D[i] + br * 0.15, br * 0.28, 0, TAU); }
    g.fill(); g.globalAlpha = 1;
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
  return { cv, w, h, tips };
}
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
