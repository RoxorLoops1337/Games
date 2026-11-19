// Million To One: everything drawn on the canvas. Reads a Race, never changes its rules
// (it only keeps a few underscored display fields on agents: smoothed position, heading, timers).
// Art direction: cartoon biology. Squishy, glossy, a bit silly. No image files: every
// sprite, tile and glow is painted in code (much of it once, into cached offscreen canvases).
import { VIEW_W, channel, centre, zoneIndex, ZSTART, FORK_Y0, FORK_END, DEAD_Y } from './core.js';
import { ZONES, RACE_LEN } from './content.js';

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
const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hexA = (hex, a) => css(rgb(hex), a);
const FRUIT = ['#ff4d6d', '#5b7cff', '#ffa630', '#b84dff', '#ff6b9a'];
const CROWD = ['#f3f0ff', '#fff0f6', '#eefcff', '#fffbe8', '#f0fff4', '#f7efff'];
const CAPS = ['#ff3d6e', '#5b7cff', '#2fd17a', '#ffa630', '#b84dff'];
const FACE_ACC = [[], ['glasses'], ['stache'], ['bow', 'lashes'], ['cap'], ['shades']];
// heat aura colours, mint to orange to red, quantised so the glow cache stays small
const HEAT = ['#96ffaa', '#b8ff8a', '#e0ff6a', '#ffe05c', '#ffbf4a', '#ff9a3c', '#ff7438', '#ff5a3c'];
// signature swims: tail beat (freq, amp, tail width) and a party trick each
const BOSS_LOOK = {
  Steve: { acc: ['cap'], cap: '#5b7cff', mouth: 'grin', freq: 11, amp: 8, wave: 4 },
  Brock: { acc: ['band', 'stache'], band: '#ff7a2f', brow: 'angry', freq: 12, amp: 9, tw: 4.6, wide: 1.15, flex: 5 },
  Tiffany: { acc: ['bow', 'lashes', 'glasses'], mouth: 'smirk', freq: 22, amp: 3.5, straight: 1 },
  Gunther: { acc: ['mohawk', 'shades'], mouth: 'grin', freq: 16, amp: 6, roll: 6 },
  Chad: { acc: ['crown', 'shades'], mouth: 'smirk', freq: 14, amp: 6, strut: 1 },
};
// which accessory a baby inherits from Dad's strongest mutation (album portraits)
const MUT_ACC = { helmet: 'cap', spiky: 'mohawk', mosh: 'mohawk', hype: 'band', turbo: 'band', whip: 'band', nose: 'glasses', memory: 'glasses',
  nitro: 'shades', slick: 'shades', wingman: 'shades', sweet: 'bow', second: 'bow', lucky: 'crown', chain: 'crown', draft: 'stache', rush: 'stache' };
const FONT = '"Baloo 2", system-ui, sans-serif';
const TS = 1.25, TW = 440, TH = 720;          // backdrop tile: logical size and pixel scale
const MAXP = 420, MAXP_LITE = 250;            // particle ring buffer size (full / lite)
const SPR = 2.5;                              // pixel scale of baked crowd heads
const TXT_MAX = 64;                           // baked text sprites kept (LRU)

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
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.pops = []; this.rings = []; this.trail = []; this.time = 0; this.zoom = 1; this.zoomK = 0;
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
    this.pHead = 0;
    this.resetRun();
    this.scr = {};
    this.frame = 0; this.ringN = 0;
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.txt.clear()).catch(() => {});
  }
  // per-run display state (camY = null from main.js starts a new run)
  resetRun() {
    this.pPh = 0; this.pTw = 15; this.lean = 0; this.lead = 0.27; this.trail = []; this.trailAcc = 0;
    this.banks = []; this.bubble = null; this.desat = 0; this.ghostA = 0; this.ghostX = 0;
    this.lastBreakT = -9; this.lastBankT = -9; this.lastZi = -1; this.gateFlash = 0; this.emberT = 0;
  }
  resize(q = this.q) {
    this.q = q === 0 ? 0 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q === 0 ? 1.5 : 2);
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.s = this.cv.width / VIEW_W; this.H = this.cv.height / this.s; this.dpr = dpr;
  }
  // world -> screen (logical units; the canvas transform scales to pixels)
  sy(wy) { return this.H - (wy - this.camY); }

  // ---------------------------------------------------------------- feel
  addTrauma(a) { this._trauma = Math.min(1, this._trauma + Math.max(0, a)); }
  // old API: `shake = n` adds trauma n/14; a smaller value caps it (reduced-motion clamp)
  get shake() { return this._trauma * 14; }
  set shake(v) { const a = clamp((+v || 0) / 14, 0, 1); if (a < this._trauma - 1e-6) this._trauma = a; else if (a > this._trauma + 1e-6) this.addTrauma(a); }
  // a directional camera nudge that springs back
  kick(dx, dy) { const k = this.reduced ? 6 : 20; this.kvx += dx * k; this.kvy += dy * k; }
  // full-screen flash: a new flash less than 0.34 s after the last one is ignored, alpha capped at 0.6 when drawn
  get flash() { return this._flash; }
  set flash(v) {
    v = +v || 0;
    if (v > this._flash + 0.01) { if (this.time - this.lastFlashT < 0.34) { this.flashRej = true; return; } this.lastFlashT = this.time; this.flashRej = false; }
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
    const small = size < 16;
    if (small) life *= 0.7;
    // stack below any live pop it would overlap
    for (let it = 0; it < 6; it++) {
      let hit = false;
      for (const q of this.pops) {
        const qy = q.dy != null ? q.dy : q.y, gap = Math.max(size, q.size) * 1.1;
        if (Math.abs(qy - y) < gap && Math.abs(q.x - x) < 80) { y = qy - gap; hit = true; }
      }
      if (!hit) break;
    }
    // at most 5 live: drop the oldest small one first
    while (this.pops.length >= 5) {
      let k = this.pops.findIndex((q) => q.size < 18);
      if (k < 0) k = 0;
      this.pops.splice(k, 1);
    }
    this.pops.push({ x, y, dy: y, text: String(text), col, size, life, max: life, al: small ? 0.8 : 1, rot: (Math.random() - 0.5) * 0.25 });
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
  // the combo ring shatters (main.js: core event 'comboBreak')
  comboBreak(x, y) {
    if (this.time - this.lastBreakT < 0.3) return;
    this.lastBreakT = this.time; this.desat = 0.2;
    const col = this.ringCol(0.1);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + Math.random() * 0.3, v = 90 + Math.random() * 90;
      this.addP(5, x + Math.cos(a) * 30, y - Math.sin(a) * 30, Math.cos(a) * v, -Math.sin(a) * v, 0.55, col, 4 + Math.random() * 2, 0, a + Math.PI / 2, (Math.random() - 0.5) * 16);
    }
  }
  // cash the combo in: pink DNA helices fly to the HUD (main.js: core event 'comboBank')
  comboBank(x, y, dna = 10) {
    this.lastBankT = this.lastBreakT = this.time;
    let n = Math.min(14, 4 + Math.round((+dna || 0) / 8));
    if (this.reduced || this.lite) n = Math.ceil(n / 2);
    const sx = x, sy = this.camY == null ? this.H * 0.7 : this.sy(y);
    for (let i = 0; i < n; i++) {
      this.banks.push({ x0: sx + (Math.random() - 0.5) * 20, y0: sy, cx: sx + (Math.random() - 0.5) * 160, cy: sy - 120 - Math.random() * 120,
        delay: i * 0.045, life: 0.75 + Math.random() * 0.2, t: 0, spin: Math.random() * TAU });
    }
    if (this.banks.length > 40) this.banks.splice(0, this.banks.length - 40);
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
  vignette() {
    if (!this.vig) {
      const mkV = (inner) => {
        const k = mk(256, 256), x = k.getContext('2d'), g = x.createRadialGradient(128, 150, 50, 128, 150, 190);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, inner.replace('A', '0.15')); g.addColorStop(1, inner.replace('A', '0.75'));
        x.fillStyle = g; x.fillRect(0, 0, 256, 256); return k;
      };
      this.vig = [mkV('rgba(10,0,10,A)'), mkV('rgba(150,0,30,A)')];
    }
    return this.vig;
  }
  tile(zi) {
    let t = this.tiles.get(zi);
    if (t) return t;
    if (this.tiles.size >= 4) this.tiles.delete(this.tiles.keys().next().value);
    t = mk(Math.round(TW * TS), Math.round(TH * TS));
    const g = t.getContext('2d'); g.scale(TS, TS);
    paintTile(g, ZONES[zi], zi);
    this.tiles.set(zi, t); return t;
  }
  // text painted once (shadow, outline, fill, highlight at 2x); kind 'sign' draws a rounded plate
  text(text, col, size, kind = 'pop') {
    const key = kind + '|' + text + '|' + col + '|' + size;
    let s = this.txt.get(key);
    if (s) { this.txt.delete(key); this.txt.set(key, s); return s; }
    if (this.txt.size >= TXT_MAX) this.txt.delete(this.txt.keys().next().value);
    const K = 2, probe = mk(4, 4).getContext('2d');
    const font = kind === 'sign' ? `800 ${size}px ${FONT}` : `900 ${size}px ${FONT}`;
    probe.font = font;
    const tw = Math.ceil(probe.measureText(text).width);
    const w = kind === 'sign' ? tw + 26 : tw + Math.ceil(size * 0.6) + 6, h = kind === 'sign' ? 32 : Math.ceil(size * 1.7);
    const cv = mk(w * K, h * K), g = cv.getContext('2d');
    g.scale(K, K); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (kind === 'sign') {
      const rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
      g.fillStyle = 'rgba(0,0,0,0.3)'; rr(3, 3, w - 4, 28, 10); g.fill();
      g.fillStyle = 'rgba(20,0,20,0.8)'; rr(1, 1, w - 4, 28, 10); g.fill();
      g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.fillStyle = col; g.fillText(text, (w - 2) / 2, 16);
    } else {
      const cx = w / 2, cy = h / 2;
      g.fillStyle = 'rgba(30,0,30,0.55)'; g.fillText(text, cx + 1.5, cy + size * 0.14 + 1.5);
      g.lineWidth = Math.max(3, size * 0.28); g.strokeStyle = '#2a0a24'; g.strokeText(text, cx, cy);
      g.fillStyle = col; g.fillText(text, cx, cy);
      if (size >= 16) { g.globalAlpha = 0.35; g.fillStyle = '#fff'; g.fillText(text, cx, cy - size * 0.06); g.globalAlpha = 1; }
    }
    s = { cv, w, h }; this.txt.set(key, s); return s;
  }
  ghostSpr() {
    if (this.ghostS) return this.ghostS;
    const K = 3, g0 = mk(16 * K, 26 * K), g = g0.getContext('2d'); g.scale(K, K); g.translate(8, 14);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 5, Math.PI, 0); g.lineTo(5, 6);
    for (let i = 0; i < 4; i++) g.lineTo(5 - (i + 0.5) * 2.5, 6 + (i % 2 ? 2 : -1));
    g.lineTo(-5, 6); g.closePath(); g.fill();
    g.fillStyle = '#2a1030'; g.font = `700 6px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('x x', 0, 0);
    g.strokeStyle = '#ffd75c'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, -8, 4, 1.4, 0, 0, TAU); g.stroke();
    return (this.ghostS = g0);
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
    this.head(g, CROWD[f], 0, o);
    this.heads.set(key, s); return s;
  }

  // ---------------------------------------------------------------- frame
  draw(race, dt, ts = 1) {
    const c = this.ctx, p = race.p, wdt = dt * ts; this.time += dt; this.frame++; this.race = race; this.ts = ts;
    const beat = this.reduced ? 0 : clamp(+this.beat || 0, 0, 1);
    if (this.camY == null) this.resetRun();
    // camera: looks further ahead the faster you swim
    const wantLead = race.drill ? 0.5 : 0.27 + 0.13 * clamp((p.vy - 420) / 900, 0, 1);
    this.lead += (wantLead - this.lead) * Math.min(1, dt * 3);
    const target = p.y - this.H * this.lead;
    this.camY = this.camY == null ? target : this.camY + (target - this.camY) * Math.min(1, dt * 8);
    this.react(race, dt, wdt);
    // trauma shake (smooth two-sine noise) + spring kick
    this._trauma = Math.max(0, this._trauma - dt * 1.8);
    const tr2 = this._trauma * this._trauma, T = this.time;
    const ox = 14 * tr2 * (0.6 * Math.sin(T * 23 * TAU) + 0.4 * Math.sin(T * 31 * TAU + 1.3));
    const oy = 14 * tr2 * (0.6 * Math.sin(T * 31 * TAU + 2.1) + 0.4 * Math.sin(T * 23 * TAU + 0.4));
    const rot = this.reduced ? 0 : 0.014 * tr2 * (0.5 * Math.sin(T * 23 * TAU + 3.3) + 0.5 * Math.sin(T * 31 * TAU + 0.9));
    this.kvx += (-220 * this.kx - 18 * this.kvx) * dt; this.kvy += (-220 * this.ky - 18 * this.kvy) * dt;
    this.kx = clamp(this.kx + this.kvx * dt, -16, 16); this.ky = clamp(this.ky + this.kvy * dt, -16, 16);
    // zoom punch pivots on the player
    this.zoomK *= Math.exp(-dt * 7); if (this.zoomK < 0.002 || this.reduced) this.zoomK = 0; const zk = 1 + this.zoomK;
    const px = p.x, py = this.sy(p.y);
    c.setTransform(this.s, 0, 0, this.s, 0, 0);
    c.translate(VIEW_W / 2 + ox + this.kx, this.H / 2 + oy + this.ky);
    if (rot) c.rotate(rot);
    c.translate(-VIEW_W / 2, -this.H / 2);
    if (zk !== 1) { c.translate(px, py); c.scale(zk, zk); c.translate(-px, -py); }
    // the opaque tile covers -20..420: only paint the flat colour when the view could peek past it
    this.safeBack = Math.abs(ox + this.kx) + 7 * tr2 < 18;

    const zi = zoneIndex(p.y), zn = ZONES[zi + 1];
    let bt = 0; if (zn) bt = clamp((p.y - (ZSTART[zi + 1] - 1500)) / 1500, 0, 1);
    this.zi = zi; this.bt = bt;
    const z = ZONES[zi];
    const deep = zn ? lerpC(rgb(z.col[0]), rgb(zn.col[0]), bt) : rgb(z.col[0]);
    const lite = zn ? lerpC(rgb(z.col[1]), rgb(zn.col[1]), bt) : rgb(z.col[1]);
    const wall = zn ? lerpC(rgb(z.wall), rgb(zn.wall), bt) : rgb(z.wall);
    this.drawBack(deep, zi, bt);
    this.drawTube(race, lite, wall, deep);
    this.drawScent(race);
    this.drawEnts(race, dt);
    this.drawEgg(race, dt);
    this.drawAgents(race, dt);
    this.drawPlayer(race, dt, wdt, beat);
    this.drawFx(race, dt, wdt);
    // speed lines when you are flying
    const fast = (p.dashT > 0 ? 1 : 0) + (p.frenzyT > 0 ? 0.7 : 0);
    if (fast && !race.drill) {
      const red = this.reduced, n = red ? 4 : 16, al = red ? 0.5 : 1;
      c.lineWidth = 1.6; c.lineCap = 'round';
      c.strokeStyle = p.frenzyT > 0 ? (red ? `rgba(255,215,92,${0.16 * fast * al})` : `hsla(${(this.time * 500) % 360},100%,75%,${0.16 * fast})`) : `rgba(255,255,255,${0.14 * fast * al})`;
      c.beginPath();
      for (let i = 0; i < n; i++) { const x = (i * 97 + this.time * 31) % VIEW_W, y = ((i * 211 + this.time * 1500) % (this.H + 200)) - 100; c.moveTo(x, y); c.lineTo(x, y + 50 + 50 * fast); }
      c.stroke();
    }
    // ---- screen space: threat chevrons, one vignette, the DNA fountain, combo-break grey, flash
    c.setTransform(this.s, 0, 0, this.s, 0, 0);
    this.drawWarnings(race);
    const [vn, vr] = this.vignette(), ef = p.e / (p.maxE || 100);
    if (ef < 0.25 && !race.over) {
      c.globalAlpha = this.reduced ? 0.6 : Math.max(0.7, clamp(0.55 + 0.35 * Math.sin(this.time * 8), 0, 1) * (1 - ef / 0.25 * 0.5));
      c.drawImage(vr, -20, -20, VIEW_W + 40, this.H + 40);
    } else { c.globalAlpha = Math.min(1, 0.9 + 0.06 * beat); c.drawImage(vn, -20, -20, VIEW_W + 40, this.H + 40); }
    c.globalAlpha = 1;
    this.drawBanks(dt);
    if (this.desat > 0) {
      c.globalCompositeOperation = 'saturation'; c.fillStyle = `rgba(128,128,128,${(this.desat / 0.2) * 0.85})`;
      c.fillRect(-20, -20, VIEW_W + 40, this.H + 40); c.globalCompositeOperation = 'source-over';
    }
    if (this._flash > 0.02) { c.fillStyle = this._fcol; c.globalAlpha = Math.min(0.6, this._flash); c.fillRect(-20, -20, VIEW_W + 40, this.H + 40); c.globalAlpha = 1; this._flash -= dt * 3; }
    else this._flash = 0;
  }

  // notice state changes on the player and add juice main.js does not have to ask for
  react(race, dt, wdt) {
    const p = race.p, pv = this.prev;
    if (p.dashT > pv.dashT + 0.2) { this.sqV -= 9; this.ring(p.x, p.y - 6, '#8cdcff', 46, 0.35, 4); }
    if (p.frenzyT > pv.frenzyT + 1) { this.zoomPunch(0.1); this.ring(p.x, p.y, '#ffd75c', 120, 0.6, 8); this.ring(p.x, p.y, '#ff5cd2', 80, 0.45, 5); }
    if (p.inv > pv.inv + 0.3) { this.pHit = 0.35; this.ring(p.x, p.y, '#ffffff', 60, 0.35, 6); }
    if (p.stuck > pv.stuck + 0.2) this.sqV += 10;
    // a chain of 3+ that drops shatters its ring (unless main.js already said so, or it was banked)
    if (pv.combo >= 3 && p.combo < pv.combo && this.time - this.lastBankT > 0.3) this.comboBreak(p.x, p.y);
    pv.dashT = p.dashT; pv.frenzyT = p.frenzyT; pv.inv = p.inv; pv.stuck = p.stuck; pv.combo = p.combo;
    // squash and stretch spring: stretches long while dashing
    const want = p.dashT > 0 ? 0.24 : p.frenzyT > 0 ? 0.08 : 0;
    this.sqV += ((want - this.sq) * 260 - this.sqV * 13) * dt; this.sq = clamp(this.sq + this.sqV * dt, -0.4, 0.5);
    this.pHit = Math.max(0, this.pHit - dt);
    this.desat = Math.max(0, this.desat - dt); this.gateFlash = Math.max(0, this.gateFlash - dt);
    // crossing into a new zone tears the gate membrane
    const zi = zoneIndex(p.y);
    if (this.lastZi >= 0 && zi > this.lastZi) { this.confetti(p.x, p.y + 30, 28); this.gateFlash = 0.3; }
    this.lastZi = zi;
    // steer ghost + body lean from the finger target (not for the autopilot demo)
    const tx = race.input && !race.demo && !race.autopilot ? race.input.tx : null;
    if (tx != null) { this.ghostA = 1; this.ghostX = tx; } else this.ghostA = Math.max(0, this.ghostA - dt / 0.15);
    const lw = tx != null ? clamp((tx - p.x) / 120, -1, 1) * 0.35 : 0;
    this.lean += (lw - this.lean) * Math.min(1, dt * 10);
    // trail sampled at 60 Hz of world time, whatever the screen rate
    this.trailAcc += wdt;
    for (let i = 0; i < 3 && this.trailAcc >= 1 / 60; i++) { this.trailAcc -= 1 / 60; this.trail.push({ x: p.x, y: p.y, h: (this.time * 400) % 360 }); if (this.trail.length > 26) this.trail.shift(); }
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

  // ---------------------------------------------------------------- backdrop
  tileLayer(k, a, par) {
    if (a <= 0.01) return;
    const c = this.ctx, t = this.tile(k), base = this.camY * par;
    c.globalAlpha = a;
    const k0 = Math.floor((base - 40) / TH), k1 = Math.floor((base + this.H + 40) / TH);
    for (let j = k0; j <= k1; j++) c.drawImage(t, -20, this.H - ((j + 1) * TH - base), TW, TH + 0.5);
    c.globalAlpha = 1;
  }
  drawBack(deep, zi, bt) {
    const c = this.ctx;
    if (!this.safeBack) { c.fillStyle = css(deep); c.fillRect(-30, -30, VIEW_W + 60, this.H + 60); }
    this.tileLayer(zi, 1, 0.35);
    if (ZONES[zi + 1]) this.tileLayer(zi + 1, bt, 0.35);
  }

  sides(race) {
    const y0 = this.camY;
    if (y0 + this.H < FORK_Y0) return [0];
    if (y0 > FORK_END + 200) return [race.p.side || race.eggSide];
    return [-1, 1];
  }
  drawTube(race, lite, wall, deep) {
    const c = this.ctx, y0 = this.camY - 60, y1 = this.camY + this.H + 60, step = 22, t = this.time;
    const polys = [];
    for (const side of this.sides(race)) {
      const L = [], R = [];
      for (let y = y0; y <= y1; y += step) {
        const top = side && race.p.side && side !== race.p.side && y > FORK_END + 200;
        if (side && side !== (race.p.side || side) && y > FORK_END + 600) break;
        const ch = channel(y, side);
        const wob = Math.sin(y / 60 + t * 2) * 3 + Math.sin(y / 23 - t * 3) * 1.2;
        L.push(ch.c - ch.h - wob, this.sy(y)); R.push(ch.c + ch.h + wob, this.sy(y));
        if (top) break;
      }
      if (L.length >= 4) polys.push([L, R]);
    }
    const path = () => {
      c.beginPath();
      for (const [L, R] of polys) {
        c.moveTo(L[0], L[1]);
        for (let i = 2; i < L.length; i += 2) c.lineTo(L[i], L[i + 1]);
        for (let i = R.length - 2; i >= 0; i -= 2) c.lineTo(R[i], R[i + 1]);
        c.closePath();
      }
    };
    const g = c.createLinearGradient(0, 0, VIEW_W, 0);
    g.addColorStop(0, css(deep)); g.addColorStop(0.5, css(lite)); g.addColorStop(1, css(deep));
    path(); c.fillStyle = g; c.fill();
    // inside the tube: the zone's texture at a faster parallax, soft inner shadow, then the floating stuff
    c.save(); path(); c.clip();
    if (!this.lite) {
      this.tileLayer(this.zi, 0.18 * (1 - this.bt), 0.6);
      if (ZONES[this.zi + 1]) this.tileLayer(this.zi + 1, 0.18 * this.bt, 0.6);
    }
    c.lineJoin = 'round';
    c.strokeStyle = css(deep, 0.55); c.lineWidth = 34;
    for (const [L, R] of polys) { strokePts(c, L); strokePts(c, R); }
    c.strokeStyle = css(wall, 0.12); c.lineWidth = 8;
    for (const [L, R] of polys) { strokePts(c, L, 9); strokePts(c, R, -9); }
    this.drawNear(this.zi, 1 - this.bt * 0.999);
    if (ZONES[this.zi + 1] && this.bt > 0.02) this.drawNear(this.zi + 1, this.bt);
    if (this.gateFlash > 0) { c.fillStyle = css(wall, (this.gateFlash / 0.3) * (this.reduced ? 0.12 : 0.35)); c.fillRect(-20, -20, VIEW_W + 40, this.H + 40); }
    c.restore();
    // glossy rims and waving cilia
    for (const [L, R] of polys) {
      for (const P of [L, R]) {
        c.strokeStyle = css(wall, 0.22); c.lineWidth = 12; strokePts(c, P);
        c.strokeStyle = css(wall, 1); c.lineWidth = 2.6; strokePts(c, P);
      }
      c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath();
      for (let i = 0; i < L.length; i += 2) {
        const sw = Math.sin(t * 6 + i * 0.45) * 5, sw2 = Math.sin(t * 6 + i * 0.45 + 1.2) * 4;
        c.moveTo(L[i], L[i + 1]); c.quadraticCurveTo(L[i] + 5, L[i + 1] + sw2, L[i] + 9, L[i + 1] + sw);
        c.moveTo(R[i], R[i + 1]); c.quadraticCurveTo(R[i] - 5, R[i + 1] + sw2, R[i] - 9, R[i + 1] + sw);
      }
      c.stroke();
    }
    // a fleshy gate at every zone threshold
    for (let i = 1; i < ZONES.length; i++) this.drawZoneGate(i, race);
    // the dead end of the wrong tube
    const ps = race.p.side;
    if (ps && ps !== race.eggSide) {
      const y = this.sy(DEAD_Y), ch = channel(DEAD_Y, ps);
      if (y > -80 && y < this.H + 80) {
        c.fillStyle = css(deep); c.fillRect(ch.c - ch.h - 20, y - 400, ch.h * 2 + 40, 400);
        c.strokeStyle = css(wall); c.lineWidth = 3; c.beginPath(); c.moveTo(ch.c - ch.h, y); c.quadraticCurveTo(ch.c, y + 30, ch.c + ch.h, y); c.stroke();
        // a tumbleweed rolls past. There is nothing here.
        const tx = ch.c + Math.sin(t * 0.8) * ch.h * 0.6, ty = y + 40;
        c.save(); c.translate(tx, ty); c.rotate(t * 3); c.strokeStyle = 'rgba(220,170,120,0.8)'; c.lineWidth = 1.5; c.beginPath();
        for (let i = 0; i < 7; i++) { const a = i * 0.9; c.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); c.lineTo(Math.cos(a + 2.6) * 9, Math.sin(a + 2.6) * 9); }
        c.stroke(); c.restore();
        this.sign(ch.c, y + 80, 'NO EGG HERE', '#ff5c7a');
      }
    }
    const fy = this.sy(FORK_Y0 - 500);
    if (fy > -60 && fy < this.H + 60) this.sign(centre(FORK_Y0 - 500), fy, '← PICK A TUBE →', '#ff9be0');
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
      c.fillStyle = hexA(col, 0.16); c.beginPath(); c.moveTo(L, y); c.quadraticCurveTo(ch.c, y + sag * 2, R, y); c.quadraticCurveTo(ch.c, y + sag * 2 - 10, L, y); c.fill();
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
      const bx = s < 0 ? L : R, w = 12;
      c.fillStyle = hexA(col, 1); c.beginPath(); c.ellipse(bx, y, w, 30, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(bx + s * 4, y + 5, w * 0.6, 24, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(bx - s * 4, y - 12, 3, 9, s * 0.2, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(40,0,30,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(bx, y, w, 30, 0, 0, TAU); c.stroke();
    }
  }
  sign(x, y, text, col) {
    const s = this.text(text, col, 15, 'sign'), b = Math.sin(this.time * 3) * 2;
    this.ctx.drawImage(s.cv, x - s.w / 2, y - 15 + b, s.w, s.h);
  }
  rrect(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // things floating in the fluid of the tube, one look per zone (drawn inside the tube clip)
  drawNear(zi, a) {
    if (a <= 0.01) return;
    const c = this.ctx, z = ZONES[zi], id = z.id, t = this.time, NT = this.H + 160, cam = this.camY, Lf = this.lite ? 0.5 : 1;
    const N = (n) => Math.max(1, Math.round(n * Lf));
    const pos = (i, par, drift) => {
      const u = ((h1(i * 3.1 + zi) * NT - cam * par - drift * t) % NT + NT) % NT;
      return this.H + 80 - u;
    };
    const X = (i) => h1(i * 7.7 + zi * 13) * VIEW_W;
    c.globalAlpha = a;
    if (id === 'launch') {
      // peristalsis: pink muscle rings squeezing to the beat
      const f = (z.beat || 96) / 60, n = this.lite ? 3 : 7;
      c.lineWidth = 3;
      for (let i = 0; i < n; i++) {
        const y = pos(i + 60, 1, 0), wy = cam + this.H - y, ch = channel(wy, 0);
        const k = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * f * TAU - i * 0.9), ry = 14 + 6 * k;
        c.fillStyle = `rgba(255,120,170,${0.05 * a})`; c.beginPath(); c.ellipse(ch.c, y, ch.h * 0.98, ry, 0, 0, TAU); c.fill();
        c.strokeStyle = `rgba(255,140,190,${(0.16 + 0.16 * k) * a})`; c.stroke();
        c.strokeStyle = `rgba(255,220,235,${0.12 * a})`; c.lineWidth = 1.2; c.beginPath(); c.ellipse(ch.c, y - 2, ch.h * 0.9, ry * 0.8, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.lineWidth = 3;
      }
      for (let i = 0; i < N(10); i++) this.dglow('#ff9ac0', X(i) + Math.sin(t * 0.7 + i) * 12, pos(i, 0.85, -10), 18 + h1(i) * 26, a * 0.22);
      c.globalAlpha = a; c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath();
      for (let i = 10; i < 10 + N(30); i++) { const x = X(i) + Math.sin(t + i) * 6, y = pos(i, 1, 12), r = 0.7 + h1(i + 0.3) * 1.8; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.fill();
    } else if (id === 'fork') {
      // heart-shaped scent puffs that drift and lean toward the right tube
      const es = (this.race && this.race.eggSide) || 0;
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
      for (let i = 70; i < 70 + N(10); i++) { const k = 0.5 + 0.5 * Math.sin(t * 4 + i * 2); if (k < 0.3) continue; star4(c, X(i), pos(i, 0.95, 20), 2 + 4 * k); }
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
      const n = this.lite ? 6 : 14;
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
      for (let i = 0; i < N(4); i++) this.dglow('#9dff3c', X(i) + Math.sin(t * 0.4 + i * 2) * 60, pos(i, 0.6, 0), 90, a * 0.12);
      const n1 = 4 + N(30);
      c.globalAlpha = a; c.strokeStyle = 'rgba(200,255,140,0.45)'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 4; i < n1; i++) { const x = X(i) + Math.sin(t * 2 + i) * 5, y = pos(i, 1, -40 - h1(i) * 50), r = 1.5 + h1(i + 0.7) * 4.5; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath();
      for (let i = 4; i < n1; i++) { const x = X(i) + Math.sin(t * 2 + i) * 5, y = pos(i, 1, -40 - h1(i) * 50), r = 1.5 + h1(i + 0.7) * 4.5; c.moveTo(x - r * 0.3, y - r * 0.35); c.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU); }
      c.fill();
    } else if (id === 'goo') {
      c.strokeStyle = 'rgba(230,200,255,0.18)'; c.lineCap = 'round';
      for (let i = 0; i < N(9); i++) {
        const x1 = X(i) - 60, x2 = x1 + 80 + h1(i + 2) * 140, y = pos(i, 0.9, 0), sag = 18 + 14 * Math.sin(t * 1.5 + i);
        c.lineWidth = 2 + h1(i + 5) * 3; c.beginPath(); c.moveTo(x1, y); c.quadraticCurveTo((x1 + x2) / 2, y + sag * 2, x2, y + h1(i + 9) * 20 - 10); c.stroke();
        c.fillStyle = 'rgba(230,200,255,0.25)'; c.beginPath(); c.arc((x1 + x2) / 2, y + sag + 3 + (t * 20 + i * 9) % 14, 2.2, 0, TAU); c.fill();
      }
      for (let i = 9; i < 9 + N(6); i++) this.dglow('#c79bff', X(i), pos(i, 0.8, 0), 30 + h1(i) * 20, a * 0.18);
    } else if (id === 'sea') {
      // slow swell bands, then one or two huge translucent cell clusters drifting far below
      c.lineCap = 'round'; c.lineWidth = 26;
      for (let i = 0; i < (this.lite ? 2 : 4); i++) {
        const y = pos(i + 200, 0.7, 8), ph = t * 0.5 + i * 1.7;
        c.strokeStyle = `rgba(255,120,150,${0.05 * a})`; c.beginPath(); c.moveTo(-20, y);
        c.bezierCurveTo(VIEW_W * 0.3, y + Math.sin(ph) * 26, VIEW_W * 0.7, y - Math.sin(ph) * 26, VIEW_W + 20, y + Math.sin(ph + 1) * 10); c.stroke();
      }
      const LT = this.H * 3;
      for (let j = 0; j < 2; j++) {
        const u = ((h1(j * 5.3 + 31) * LT - cam * 0.5 - t * 6) % LT + LT) % LT, ly = this.H + 160 - u;
        if (ly < -160 || ly > this.H + 160) continue;
        const lx = VIEW_W * (0.25 + 0.5 * h1(j + 7)), sp = t * 0.08 + j;
        for (let k = 0; k < 6; k++) {
          const an = k * 1.05 + sp, rr = k ? 46 + 10 * h1(k + j) : 0, r = 34 + 14 * h1(k * 3 + j);
          const cx = lx + Math.cos(an) * rr, cy = ly + Math.sin(an) * rr * 0.8;
          c.fillStyle = `rgba(255,140,165,${0.07 * a})`; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
          c.strokeStyle = `rgba(255,190,205,${0.12 * a})`; c.lineWidth = 2; c.stroke();
          c.fillStyle = `rgba(140,20,50,${0.1 * a})`; c.beginPath(); c.arc(cx + r * 0.15, cy, r * 0.3, 0, TAU); c.fill();
        }
      }
      for (let i = 0; i < N(16); i++) {
        const x = X(i) + Math.sin(t * 0.5 + i) * 18, y = pos(i, 0.92, 18 + h1(i) * 20), r = 7 + h1(i + 0.4) * 9;
        const rot = t * (0.3 + h1(i) * 0.6) + i, sx = 0.35 + 0.65 * Math.abs(Math.cos(rot));
        c.save(); c.translate(x, y); c.rotate(i); c.scale(1, sx);
        c.fillStyle = 'rgba(214,40,70,0.55)'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
        c.fillStyle = 'rgba(120,10,35,0.45)'; c.beginPath(); c.arc(0, 0, r * 0.5, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,140,160,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, r * 0.85, 3.6, 5.4); c.stroke();
        c.restore();
      }
      c.fillStyle = 'rgba(255,190,200,0.25)'; c.beginPath();
      for (let i = 16; i < 16 + N(24); i++) { const x = X(i), y = pos(i, 1, 6), r = 1 + h1(i) * 1.5; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.fill();
    } else if (id === 'rapids') {
      c.strokeStyle = 'rgba(190,245,255,0.5)'; c.lineCap = 'round'; c.lineWidth = 1.8; c.beginPath();
      for (let i = 0; i < N(26); i++) { const x = X(i) + Math.sin(t + i) * 4, y = pos(i, 1, 520 + h1(i) * 300), l = 26 + h1(i + 1) * 70; c.moveTo(x, y); c.lineTo(x + Math.sin(i) * 3, y + l); }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 3; c.beginPath();
      for (let i = 26; i < 26 + N(8); i++) { const x = X(i), y = pos(i, 1, 380), w = 14 + h1(i) * 16; c.moveTo(x - w, y); c.quadraticCurveTo(x, y + 8, x + w, y); }
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

  // ---------------------------------------------------------------- hazards and pickups
  drawEnts(race, dt) {
    const c = this.ctx, top = this.camY + this.H + 80, bot = this.camY - 80, t = this.time, p = race.p;
    for (const e of race.ents) {
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
          c.fillStyle = '#e6f8ff'; c.font = `800 10px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('pH', x, y + 1);
          break; }
        case 'acid': case 'goo': {
          const acid = e.t === 'acid', col = acid ? '#9dff3c' : '#c79bff', seed = e.seed || 0;
          this.dglow(col, x, y, e.r * 1.35, acid ? 0.22 : 0.16);
          c.fillStyle = hexA(col, acid ? 0.34 : 0.3);
          for (let i = 0; i < 16; i++) { const an = i / 16 * TAU, rr = e.r * (1 + 0.1 * Math.sin(an * 3 + seed + t * 2) + 0.05 * Math.sin(an * 5 - t * 3)); BX[i] = x + Math.cos(an) * rr; BY[i] = y + Math.sin(an) * rr * 0.78; }
          smoothBlob(c, 16); c.fill();
          if (acid) {   // hazard tape: crawling black and lime dashes, so acid never reads as goo
            c.lineWidth = 2.6; c.setLineDash([6, 6]); c.lineDashOffset = -t * 14; c.strokeStyle = 'rgba(24,40,0,0.85)'; c.stroke();
            c.lineDashOffset = -t * 14 + 6; c.strokeStyle = '#e6ff4a'; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
          } else { c.strokeStyle = hexA(col, 0.75); c.lineWidth = 2.2; c.stroke(); }
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
        case 'wbc': this.drawWbc(e, x, y, t, p, dt); break;
        case 'current': {
          const y1 = this.sy(e.y + e.h);
          c.lineCap = 'round'; c.lineJoin = 'round';
          for (let i = 0; i < 5; i++) {
            const yy = y1 + (i + 0.5) * (y - y1) / 5, k = ((t * 0.9 * e.dir + i * 0.27) % 1 + 1) % 1, xx = e.x - e.r + k * e.r * 2;
            const al = Math.sin(k * Math.PI) * 0.4;
            c.strokeStyle = `rgba(200,240,255,${al * 0.5})`; c.lineWidth = 8;
            c.beginPath(); c.moveTo(xx - 16 * e.dir, yy - 9); c.lineTo(xx, yy); c.lineTo(xx - 16 * e.dir, yy + 9); c.stroke();
            c.strokeStyle = `rgba(255,255,255,${al})`; c.lineWidth = 3; c.stroke();
            c.strokeStyle = `rgba(255,255,255,${al * 0.4})`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(xx - 70 * e.dir, yy); c.lineTo(xx - 22 * e.dir, yy); c.stroke();
          }
          break; }
      }
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
      c.closePath(); c.fillStyle = 'rgba(200,160,255,0.65)'; c.fill(); c.strokeStyle = '#f2e6ff'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(a + 4, y - 4); c.lineTo(b - 4, y - 4); c.stroke();
      c.fillStyle = 'rgba(220,190,255,0.8)';
      for (let xx = a + 10; xx < b - 6; xx += 23) {
        const k = ((t * 0.6 + xx * 0.013) % 1), l = 4 + 14 * k;
        c.beginPath(); c.moveTo(xx - 2.5, y + 9); c.quadraticCurveTo(xx, y + 9 + l * 1.3, xx + 2.5, y + 9); c.fill();
        c.beginPath(); c.arc(xx, y + 10 + l, 2 + k, 0, TAU); c.fill();
      }
    }
    // the gaps glow and point the way
    for (const g of gaps) {
      this.dglow('#ffffff', g, y, e.gw * 0.55, 0.12 + 0.06 * Math.sin(t * 5));
      c.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(t * 6)})`; c.lineWidth = 2.5; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) { const yy = y + 34 + k * 12 - ((t * 30) % 12); c.beginPath(); c.moveTo(g - 8, yy + 6); c.lineTo(g, yy); c.lineTo(g + 8, yy + 6); c.stroke(); }
    }
  }
  // Big Mac: a white blood cell with a wobbly membrane, arms that reach for you, and table manners to match
  drawWbc(e, x, y, t, p, dt) {
    const c = this.ctx, hunt = e.hunt || 0, ph = e.ph || 0;
    let st = this.wbcState.get(e); if (!st) { st = { eating: 0, burp: 0, full: 0, tail: 0, alert: 0, bang: 0 }; this.wbcState.set(e, st); }
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
    const py = this.sy(p.y), ang = Math.atan2(py - y, p.x - x);
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
    smoothBlob(c, 28); c.fillStyle = '#f6f0f8'; c.fill(); c.strokeStyle = hunt > 0.5 ? '#e08aa8' : '#c9b6d9'; c.lineWidth = 2.2; c.stroke();
    c.fillStyle = 'rgba(210,190,230,0.45)'; c.beginPath(); c.arc(x + r * 0.1, y + r * 0.15, r * 0.78, 0, TAU); c.fill();
    // lobed nucleus + granules
    c.fillStyle = 'rgba(150,100,200,0.42)';
    for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(x - r * 0.25 + k * r * 0.25, y + r * 0.08 + Math.sin(k * 2 + ph) * r * 0.08, r * 0.17, r * 0.13, k, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(160,120,200,0.5)';
    for (let k = 0; k < 6; k++) { const a = k * 1.1 + ph * 0.3; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.5, 1.4, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x - r * 0.45, y - r * 0.5, r * 0.18, r * 0.09, -0.7, 0, TAU); c.fill();
    // eyes that follow you, angry brows when it is hunting
    const blink = ((t + ph) % 3.7) < 0.1 && hunt < 0.5;
    for (const sx of [-1, 1]) {
      const ex = x + sx * r * 0.33, ey = y - r * 0.25, er = r * 0.24;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill(); c.strokeStyle = '#4a3050'; c.lineWidth = 1.2; c.stroke();
      if (blink) { c.strokeStyle = '#4a3050'; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - er, ey); c.lineTo(ex + er, ey); c.stroke(); }
      else {
        const pr = r * (0.1 + 0.03 * hunt);
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
      c.fillStyle = '#ff3d5a'; c.font = `900 14px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 0, 1);
      c.restore();
    }
  }
  // red chevrons on the top edge for every Big Mac lurking just above the screen
  drawWarnings(race) {
    const c = this.ctx, top = this.camY + this.H, t = this.time;
    for (const e of race.ents) {
      if (e.t !== 'wbc' || e.dead) continue;
      const d = e.y - top;
      if (d < 0 || d > 700) continue;
      const k = 1 - d / 700, x = clamp(e.x, 16, VIEW_W - 16), pul = this.reduced ? 1 : 1 + 0.12 * Math.sin(t * 10 + e.y);
      c.save(); c.translate(x, 14 + 4 * (1 - k)); c.scale(pul * (0.75 + 0.35 * k), pul * (0.75 + 0.35 * k)); c.globalAlpha = 0.35 + 0.65 * k;
      c.fillStyle = '#ff3d5a'; c.beginPath(); c.moveTo(0, -10); c.lineTo(11, 2); c.lineTo(5, 2); c.lineTo(0, -3); c.lineTo(-5, 2); c.lineTo(-11, 2); c.closePath(); c.fill();
      c.fillStyle = '#f6f0f8'; c.beginPath(); c.arc(0, 11, 7, 0, TAU); c.fill(); c.strokeStyle = '#ff3d5a'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#1a0a1a'; c.fillRect(-3.2, 8.5, 1.8, 2.2); c.fillRect(1.4, 8.5, 1.8, 2.2);
      c.strokeStyle = '#4a3050'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-4, 7); c.lineTo(-1, 8); c.moveTo(4, 7); c.lineTo(1, 8); c.moveTo(-2.4, 14); c.lineTo(2.4, 14); c.stroke();
      c.restore();
    }
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the egg
  eggSky(n) {
    const c = this.ctx, t = this.time;
    this.dglow('#ffd77a', VIEW_W / 2, -60, 240 + 220 * n, 0.5 * n);
    c.save(); c.translate(VIEW_W / 2, -90); c.fillStyle = `rgba(255,232,160,${0.05 * n})`;
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.24 + (this.reduced ? 0 : Math.sin(t * 0.25 + i * 1.3) * 0.05);
      c.save(); c.rotate(a); c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.lineTo(34, this.H * 1.3); c.lineTo(-34, this.H * 1.3); c.closePath(); c.fill(); c.restore();
    }
    c.restore();
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
    const jig = this.eggJig, sx = 1 + Math.sin(t * 28) * 0.025 * jig + Math.sin(t * 2) * 0.01, sy2 = 2 - sx;
    // the duel: arrived named rivals spread round the lower arc, each with its own drill ring
    let leadB = null, leadF = 0;
    if (d || late) {
      let k = 0;
      for (const a of race.agents) {
        if (!a.alive || !a.arrived || !a.boss) continue;
        const s = k % 2 ? -1 : 1, an = Math.PI / 2 + s * (0.35 + 0.3 * k);
        this.duel.set(a, { x: x + Math.cos(an) * (R + 34), y: y + Math.sin(an) * (R + 34), ang: an - Math.PI / 2, ring: R + 50 + 10 * k });
        const f = d ? a.drill / d.need : 0; if (f > leadF) { leadF = f; leadB = a; }
        if (++k >= 5) break;
      }
    }
    // halo + god rays (static when reduced)
    this.dglow('#ffd77a', x, y, R * 2.3, 0.55 + (this.reduced ? 0 : 0.1 * Math.sin(t * 2)));
    c.save(); c.translate(x, y); c.rotate(this.reduced ? 0 : t * 0.08); c.fillStyle = 'rgba(255,235,160,0.08)';
    for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(R * 2.6, -26); c.lineTo(R * 2.6, 26); c.closePath(); c.fill(); }
    c.restore();
    // corona radiata: a fluffy cloud of helper cells
    c.fillStyle = 'rgba(255,225,160,0.75)'; c.beginPath();
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU + t * 0.1, rr = R + 18 + Math.sin(t * 2 + i * 1.7) * 5, cx = x + Math.cos(a) * rr * sx, cy = y + Math.sin(a) * rr * sy2, cr = 10 + (i % 3) * 2; c.moveTo(cx + cr, cy); c.arc(cx, cy, cr, 0, TAU); }
    c.fill();
    c.fillStyle = 'rgba(255,250,220,0.6)'; c.beginPath();
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU + t * 0.1, rr = R + 18 + Math.sin(t * 2 + i * 1.7) * 5, cx = x + Math.cos(a) * rr * sx - 3, cy = y + Math.sin(a) * rr * sy2 - 3; c.moveTo(cx + 3, cy); c.arc(cx, cy, 3, 0, TAU); }
    c.fill();
    c.save(); c.translate(x, y); c.scale(sx, sy2);
    // zona pellucida (jelly coat), then the egg itself
    c.fillStyle = 'rgba(255,245,215,0.35)'; c.beginPath(); c.arc(0, 0, R + 9, 0, TAU); c.fill();
    const g2 = c.createRadialGradient(-45, -55, 20, 0, 0, R);
    g2.addColorStop(0, '#fffbe8'); g2.addColorStop(0.55, '#ffd77a'); g2.addColorStop(1, '#e8a33c');
    c.fillStyle = g2; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 6; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-62, -78, 30, 14, -0.7, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(-30, -100, 6, 0, TAU); c.fill();
    // somebody else got in first: there they are, smug, inside the membrane
    if (late) {
      let w = race.eggTaken || null;
      if (!w) for (const a of race.agents) if (a.alive && a.arrived && (!w || a.drill > w.drill)) w = a;
      if (w) {
        const L = w.boss ? (BOSS_LOOK[w.boss.name.split(' ')[0]] || {}) : null, f = (w.face || 0) % 6;
        this.drawSwimmer(0, 96, Math.sin(t * 2) * 0.15, 1.7, w.boss ? w.boss.col : CROWD[f], t * 12, { acc: L ? L.acc : FACE_ACC[f], cap: L ? L.cap : CAPS[Math.floor((w.ph || 0) * 10) % CAPS.length], band: L && L.band, mouth: 'huge', happy: 1, blush: 1, taper: 1 });
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
      if (win) { c.fillStyle = '#ff3d6e'; heart(c, ex, ey, 18 + Math.sin(t * 10) * 2); c.fillStyle = ink; }
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
    c.fillStyle = `rgba(255,110,140,${0.4 + 0.3 * (near + jig)})`;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 78, 32, 16, 9, 0, 0, TAU); c.fill(); }
    c.restore();
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
        const f = Math.min(1, a.drill / d.need), end = -Math.PI / 2 + TAU * f;
        c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, q.ring, 0, TAU); c.stroke();
        c.strokeStyle = a.boss.col; c.lineWidth = 4; c.beginPath(); c.arc(x, y, q.ring, -Math.PI / 2, end); c.stroke();
        if (f > 0.02) { const s = this.text(a.boss.name.split(' ')[0], a.boss.col, 11); c.drawImage(s.cv, x + Math.cos(end) * (q.ring + 4) - s.w / 2, y + Math.sin(end) * (q.ring + 4) - s.h / 2, s.w, s.h); }
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
  taperTail(c, len, amp, ph, w) {
    let px = 0, py = 8;
    for (let s = 0; s < 3; s++) {
      const i0 = s * 3 + 1, i1 = Math.min(8, i0 + 2), km = ((i0 + i1) / 2) / 8;
      c.lineWidth = w * (1.15 - km * 0.85); c.beginPath(); c.moveTo(px, py);
      for (let i = i0; i <= i1; i++) { const k = i / 8; px = Math.sin(ph - k * 5.5) * amp * k; py = 8 + len * k; c.lineTo(px, py); }
      c.stroke();
    }
  }
  // per-agent display state: smoothed x, a knockback offset on y, heading, bump and pass timers
  track(a, race, p, dt, sm) {
    const tx = race.agentX(a);
    a._x = tx;
    if (a._rx == null || a._seen !== this.frame - 1 || Math.abs(tx - a._rx) > 140) {
      a._rx = tx; a._oy = 0; a._py = a.y; a._hd = 0; a._pk = a.kx; a._bt = 0; a._pt = 0; a._ah = a.y > p.y;
    }
    const ox = a._rx;
    a._rx += (tx - a._rx) * sm;
    const dy = a.y - a._py; if (dy < -4) a._oy -= dy; a._py = a.y; a._oy *= 1 - sm;
    const vx = (a._rx - ox) / Math.max(dt, 1e-3), hd = clamp(Math.atan2(vx, Math.max(60, a.sp || 400)), -0.6, 0.6);
    a._hd += (hd - a._hd) * Math.min(1, dt * 10);
    if (Math.abs(a.kx - a._pk) > 1) a._bt = 0.8;
    a._pk = a.kx; a._bt = Math.max(0, a._bt - dt);
    const ah = a.y > p.y; if (a._ah && !ah && Math.abs(a.y - p.y) < 300) a._pt = 0.7; a._ah = ah; a._pt = Math.max(0, a._pt - dt);
    a._seen = this.frame;
  }
  drawAgents(race, dt) {
    const c = this.ctx, top = this.camY + this.H + 40, bot = this.camY - 40, t = this.time, p = race.p;
    const vis = this._vis || (this._vis = []), close = this._close || (this._close = []);
    vis.length = 0; close.length = 0;
    const cap = this.lite ? 12 : 26, sm = 1 - Math.exp(-16 * dt), fb = 430 * (1 + 0.06 * (race.gen || 0));
    for (const a of race.agents) {
      if (!a.alive || a.y > top || a.y < bot) continue;
      if (p.side && a.y > FORK_Y0 && a.side !== p.side && a.y > FORK_END) continue;
      this.track(a, race, p, dt, sm);
      if (!a.boss && Math.abs(a.y - p.y) < 190 && close.length < cap) close.push(a); else vis.push(a);
      if (vis.length > 220) break;
    }
    // per-agent tail beat: fast, fit swimmers wiggle quicker
    const freq = (a) => 11 + 9 * ((a.sp || fb) / fb) * (0.75 + 0.25 * (a.stam == null ? 1 : a.stam));
    // the far crowd: batched, one path per colour
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    for (const a of vis) if (!a.boss) this.tail(c, a._rx, this.sy(a.y + a._oy) + 7, a._hd, 26, 5, t * freq(a) + a.ph);
    c.stroke();
    for (let ci = 0; ci < 3; ci++) {
      c.fillStyle = CROWD[ci * 2]; c.beginPath();
      for (const a of vis) if (!a.boss && ((a.face || 0) % 3) === ci) { const y = this.sy(a.y + a._oy); c.moveTo(a._rx + 5.5, y); c.ellipse(a._rx, y, 5.5, 7.5, 0, 0, TAU); }
      c.fill();
    }
    c.fillStyle = '#2a1030';
    for (const a of vis) if (!a.boss && Math.abs(a.y - p.y) < 320) { const y = this.sy(a.y + a._oy), x = a._rx; if (((t + a.ph * 3) % 3.3) < 0.12) { c.fillRect(x - 3, y - 2, 2.4, 0.9); c.fillRect(x + 0.8, y - 2, 2.4, 0.9); } else { c.fillRect(x - 2.6, y - 2.5, 1.6, 2.2); c.fillRect(x + 1, y - 2.5, 1.6, 2.2); } }
    // the close ones: one batched tail stroke, then baked heads
    if (close.length) {
      c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 2.2; c.beginPath();
      for (const a of close) {
        const x = a._rx, y = this.sy(a.y + a._oy), ang = a._hd, ph = t * freq(a) + a.ph;
        a._ph = ph; this.tail(c, x - Math.sin(ang) * 8, y + Math.cos(ang) * 8, ang, 32, 4 + ((a.face || 0) % 3) * 1.2, ph);
      }
      c.stroke();
      const m = c.getTransform();
      for (const a of close) {
        const x = a._rx, y = this.sy(a.y + a._oy), f = (a.face || 0) % 6, ci = f === 4 ? Math.floor(a.ph * 10) % CAPS.length : 0;
        const behind = a.y < p.y, dx = Math.abs(x - p.x), bt = Math.max(a.bumpT || 0, a._bt), pt = Math.max(a.passT || 0, a._pt);
        let ex = 0;
        if (bt > 0) ex = 4;
        else if (pt > 0) ex = 5;
        else if (behind && p.y - a.y < 70) ex = 2;
        else if (!behind && dx < 22 && a.y - p.y < 100) ex = 3;
        else if (((t + a.ph * 3) % 3.3) < 0.12) ex = 1;
        const look = ex === 2 || ex === 5 ? 0 : Math.hypot(x - p.x, a.y - p.y) < 60 ? (p.x > x ? 1 : -1) : 0;
        let sx = 1, sy = 1;
        if (a._bt > 0) { const e = 0.8 - a._bt; sy = 1 - 0.25 * Math.cos(e * 22) * Math.exp(-e * 7); sx = 1 + (1 - sy) * 0.8; }
        setXf(c, m, x, y, a._hd - Math.sin(a._ph) * 0.07, sx, sy);
        c.drawImage(this.headSpr(f, ci, ex, look), -10, -19, 20, 34);
      }
      c.setTransform(m);
      c.fillStyle = '#ffd75c';
      for (const a of close) if (Math.max(a.bumpT || 0, a._bt) > 0) { const x = a._rx, y = this.sy(a.y + a._oy); for (let i = 0; i < 2; i++) { const an = t * 8 + i * Math.PI; star4(c, x + Math.cos(an) * 10, y - 13 + Math.sin(an) * 3, 2.6); } }
    }
    // the named rivals, each with a signature swim
    const o = this.scr;
    for (const a of vis) if (a.boss) {
      const nm = a.boss.name, L = BOSS_LOOK[nm.split(' ')[0]] || {}, dq = this.duel.get(a);
      let x = a._rx, y = this.sy(a.y + a._oy), ang = L.straight ? 0 : a._hd, sx = L.wide || 1, sy = 1;
      if (dq) { x = dq.x; y = dq.y; ang = dq.ang; }
      const cyc = t + a.ph * 3, ph = t * (L.freq || 15) + a.ph, bt = Math.max(a.bumpT || 0, a._bt), pt = Math.max(a.passT || 0, a._pt);
      if (L.strut && !dq) { ang += Math.sin(t * 3 + a.ph) * 0.22; x += Math.sin(t * 3 + a.ph) * 3; }
      if (L.roll && cyc % L.roll < 0.5) { const r = Math.cos((cyc % L.roll) / 0.5 * TAU); sx *= Math.abs(r) < 0.08 ? (r < 0 ? -0.08 : 0.08) : r; }
      let flexK = 0; if (L.flex && cyc % L.flex < 0.6) { flexK = Math.sin((cyc % L.flex) / 0.6 * Math.PI); sx *= 1 + 0.12 * flexK; sy *= 1 + 0.08 * flexK; }
      if (a._bt > 0) { const e = 0.8 - a._bt, q = 1 - 0.25 * Math.cos(e * 22) * Math.exp(-e * 7); sy *= q; sx *= 1 + (1 - q) * 0.8; }
      const passed = pt > 0 || (a.y < p.y && p.y - a.y < 90);
      this.dglow(a.boss.col, x, y, 30, 0.35);
      o.name = nm; o.acc = L.acc; o.cap = L.cap; o.band = L.band; o.taper = 1; o.amp = L.amp; o.tw = L.tw; o.sx = sx; o.sy = sy; o.bob = L.strut ? Math.sin(t * 6 + a.ph) * 1.2 : 0;
      o.look = clamp((p.x - x) / 50, -1.2, 1.2); o.dizzy = bt > 0 ? 1 : 0; o.shock = pt > 0 ? 1 : 0;
      o.mouth = bt > 0 ? 'wobble' : passed ? 'scared' : L.mouth; o.brow = bt > 0 ? undefined : passed ? 'worried' : L.brow;
      o.blink = ((t + a.ph) % 2.9) < 0.12; o.happy = 0; o.blush = 0; o.star = undefined; o.tired = 0; o.flash = 0; o.stretch = 1; o.tail = undefined; o.flap = 1; o.crown = 0;
      this.drawSwimmer(x, y, ang, 1.3, a.boss.col, ph, o);
      if (bt > 0) { c.fillStyle = '#ffd75c'; for (let i = 0; i < 2; i++) { const an = t * 8 + i * Math.PI; star4(c, x + Math.cos(an) * 13, y - 17 + Math.sin(an) * 4, 3.2); } }
      if (L.wave && cyc % L.wave < 0.9 && !bt) {   // Steve waves at you. Steve waves at everybody.
        const k = (cyc % L.wave) / 0.9;
        c.save(); c.translate(x + 13, y - 3); c.rotate(-0.4 + Math.sin(k * 18) * 0.5); c.scale(backOut(Math.min(1, k * 4)), backOut(Math.min(1, k * 4)));
        c.fillStyle = '#fff'; c.strokeStyle = 'rgba(40,0,40,0.4)'; c.lineWidth = 0.9;
        c.beginPath(); c.arc(0, -5, 3.6, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.arc(-3.2, -4, 1.4, 0, TAU); c.fill(); c.stroke();
        c.restore();
      }
      if (flexK > 0.2) {   // Brock flexes. With what, nobody knows.
        c.globalAlpha = flexK * 0.8; c.fillStyle = '#fff';
        for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * (14 + 5 * flexK), y - 6 - 4 * flexK, 2.2 + 1.6 * flexK, 0, TAU); c.fill(); c.beginPath(); c.arc(x + s * (18 + 6 * flexK), y - 10 - 5 * flexK, 1.4 + flexK, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
      }
    }
    this.drawBubble(race, dt);
  }
  // one speech bubble at a time, over a rival
  drawBubble(race, dt) {
    const b = this.bubble;
    if (!b) return;
    b.life -= dt; if (b.life <= 0) { this.bubble = null; return; }
    let a = b.k;
    if (typeof a === 'number') a = race.agents[a];
    else if (typeof a === 'string') { const nm = a.toLowerCase(); a = race.agents.find((q) => q.alive && q.boss && (q.boss.name.toLowerCase() === nm || q.boss.name.split(' ')[0].toLowerCase() === nm)); }
    if (!a || !a.alive || a._seen !== this.frame) return;
    const c = this.ctx, dq = this.duel.get(a), hx = dq ? dq.x : a._rx, hy = dq ? dq.y : this.sy(a.y + (a._oy || 0));
    c.font = `800 11px ${FONT}`;
    if (!b.lines) {
      b.lines = []; let line = '';
      for (const w of b.text.split(' ')) { const tryL = line ? line + ' ' + w : w; if (line && c.measureText(tryL).width > 134) { b.lines.push(line); line = w; } else line = tryL; }
      if (line) b.lines.push(line);
      b.w = Math.min(150, Math.max(...b.lines.map((l) => c.measureText(l).width)) + 16);
    }
    const k = 1 - b.life / b.max, sc = backOut(Math.min(1, k * b.max / 0.25)), fade = Math.min(1, b.life * 4);
    const h = b.lines.length * 13 + 10, bx = clamp(hx, b.w / 2 + 4, VIEW_W - b.w / 2 - 4), by = hy - 30 - h;
    c.save(); c.globalAlpha = fade; c.translate(hx, hy - 18); c.scale(sc, sc); c.translate(-hx, -(hy - 18));
    c.fillStyle = 'rgba(30,0,30,0.25)'; this.rrect(bx - b.w / 2 + 2, by + 2, b.w, h, 9); c.fill();
    c.fillStyle = '#fff'; this.rrect(bx - b.w / 2, by, b.w, h, 9); c.fill();
    c.beginPath(); c.moveTo(clamp(hx, bx - b.w / 2 + 10, bx + b.w / 2 - 18), by + h - 1); c.lineTo(hx + 2, hy - 16); c.lineTo(clamp(hx, bx - b.w / 2 + 10, bx + b.w / 2 - 18) + 10, by + h - 1); c.fill();
    c.fillStyle = '#2a0a24'; c.textAlign = 'center'; c.textBaseline = 'middle';
    b.lines.forEach((l, i) => c.fillText(l, bx, by + 11 + i * 13));
    c.restore();
  }
  drawSwimmer(x, y, ang, sc, col, ph, o = {}) {
    const c = this.ctx, st = o.stretch || 1;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc * (o.sx || 1), sc * (o.sy || 1));
    // tail
    c.strokeStyle = o.tail || 'rgba(255,255,255,0.92)'; c.lineCap = 'round'; c.lineJoin = 'round';
    if (o.taper) this.taperTail(c, 34 * (0.8 + 0.2 * st), o.amp || 6, ph, o.tw || 3.4);
    else { c.lineWidth = 2.2; c.beginPath(); this.tail(c, 0, 8, 0, 32, o.amp || 6, ph); c.stroke(); }
    c.scale(1 / Math.sqrt(st), st);
    this.head(c, col, ph, o);
    c.restore();
    if (o.name) {
      c.font = `800 10px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const ny = y - 21 * sc - (o.acc && o.acc.includes('crown') ? 6 : 0);
      c.lineWidth = 3; c.strokeStyle = 'rgba(20,0,20,0.75)'; c.strokeText(o.name, x, ny); c.fillStyle = col; c.fillText(o.name, x, ny);
    }
  }
  // midpiece + head + face + accessories in local space (head centre at 0,0), on any context
  head(c, col, ph, o) {
    c.fillStyle = col;
    if (!o.round) { c.beginPath(); c.ellipse(0, 9.5, 2.8, 3.6, 0, 0, TAU); c.fill(); }
    c.beginPath(); if (o.round) c.arc(0, 0, 9.5, 0, TAU); else c.ellipse(0, 0, 7.5, 10, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.beginPath(); c.ellipse(1.8, 3, 5, 6.5, 0, -0.6, 2.2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-2.6, -4.5, 2.4, 3.4, -0.4, 0, TAU); c.fill();
    if (o.flash > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(1, o.flash)})`; c.beginPath(); c.ellipse(0, 0, 7.8, 10.3, 0, 0, TAU); c.fill(); }
    const acc = o.acc || [];
    if (acc.includes('mohawk')) { c.fillStyle = '#ff3d6e'; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(i * 2.2 - 1.6, -8.5); c.lineTo(i * 2.2, -14 - (2 - Math.abs(i)) * 1.5 + Math.sin(ph * 0.5 + i) * 0.6); c.lineTo(i * 2.2 + 1.6, -8.5); } c.fill(); }
    if (o.blush) { c.fillStyle = 'rgba(255,90,130,0.45)'; c.beginPath(); c.ellipse(-4.6, 1.4, 1.8, 1.1, 0, 0, TAU); c.ellipse(4.6, 1.4, 1.8, 1.1, 0, 0, TAU); c.fill(); }
    // eyes
    const look = o.look || 0, ink = '#1a0a1a', er = o.shock ? 3.4 : 2.9;
    for (const sx of [-1, 1]) {
      const ex = sx * 3.2, ey = -2.5;
      if (o.dizzy) { c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath(); c.arc(ex, ey, 2, ph * 0.4, ph * 0.4 + 4.5); c.stroke(); c.beginPath(); c.arc(ex, ey, 0.8, 0, TAU); c.stroke(); continue; }
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
    if (acc.includes('glasses')) { c.strokeStyle = '#3a2a50'; c.lineWidth = 0.9; c.beginPath(); c.arc(-3.2, -2.5, 3.3, 0, TAU); c.moveTo(6.5, -2.5); c.arc(3.2, -2.5, 3.3, 0, TAU); c.moveTo(-0.1, -2.7); c.lineTo(0.1, -2.7); c.stroke(); }
    if (acc.includes('shades')) {
      c.fillStyle = '#141420'; c.beginPath(); c.moveTo(-7, -4.6); c.lineTo(7, -4.6); c.lineTo(6.2, -1.2); c.quadraticCurveTo(3.6, 0.6, 1, -1.6); c.lineTo(-1, -1.6); c.quadraticCurveTo(-3.6, 0.6, -6.2, -1.2); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(-5.4, -4, 2, 0.9); c.fillRect(2, -4, 2, 0.9);
    }
    // mouth
    const m = o.mouth;
    c.strokeStyle = '#5a1020'; c.fillStyle = '#5a1020'; c.lineWidth = 1.2;
    if (m === 'grin') { c.beginPath(); c.arc(0, 2.4, 3.2, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(-1.8, 2.6, 3.6, 0.9); }
    else if (m === 'huge') { c.beginPath(); c.arc(0, 2, 4.4, 0, Math.PI); c.closePath(); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0, 4.8, 2.2, 1.2, 0, 0, TAU); c.fill(); }
    else if (m === 'scared') { c.beginPath(); c.ellipse(0, 4, 2, o.shock ? 3 : 2.6, 0, 0, TAU); c.fill(); }
    else if (m === 'pant') { c.beginPath(); c.ellipse(0, 4.2, 2.4, 1.6 + 0.8 * Math.abs(Math.sin(ph * 0.3)), 0, 0, TAU); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0.6, 5.8, 1.4, 1.4, 0, 0, TAU); c.fill(); }
    else if (m === 'smirk') { c.beginPath(); c.moveTo(-2.4, 4.2); c.quadraticCurveTo(0.5, 5, 3, 2.8); c.stroke(); }
    else if (m === 'wobble') { c.beginPath(); c.moveTo(-3, 4); for (let i = 1; i <= 6; i++) c.lineTo(-3 + i, 4 + (i % 2 ? -0.7 : 0.7)); c.stroke(); }
    else { c.beginPath(); c.moveTo(-2, 4); c.quadraticCurveTo(0, 4.8, 2, 4); c.stroke(); }
    if (acc.includes('stache')) { c.fillStyle = '#5a3418'; c.beginPath(); c.ellipse(-2, 2.6, 2.4, 1.2, 0.3, 0, TAU); c.ellipse(2, 2.6, 2.4, 1.2, -0.3, 0, TAU); c.fill(); c.beginPath(); c.arc(-4.3, 2, 0.9, 0, TAU); c.arc(4.3, 2, 0.9, 0, TAU); c.fill(); }
    // headwear
    if (o.band || acc.includes('band')) {
      const bc = o.band || '#ff7a2f', fl = o.flap || 1;
      c.fillStyle = bc; c.beginPath(); c.moveTo(-7.4, -7.8); c.quadraticCurveTo(0, -9.6, 7.4, -7.8); c.lineTo(7.6, -5.2); c.quadraticCurveTo(0, -7, -7.6, -5.2); c.closePath(); c.fill();
      c.strokeStyle = bc; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const w1 = Math.sin(ph * 0.55 + k * 1.3) * 2.5 * fl, w2 = Math.sin(ph * 0.55 + 1.7 + k * 1.3) * 3.5 * fl, L = 6 + 3 * fl + k * 1.5;
        c.lineWidth = 2.2 - k * 0.4; c.beginPath(); c.moveTo(6.8, -6.4);
        c.quadraticCurveTo(6.8 + L * 0.6, -6.4 + L * 0.2 + w1, 6.8 + L * 0.7 + k * 1.5, -6.4 + L + w2); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-5, -8.4, 7, 0.8);
    }
    if (acc.includes('cap')) {
      const cc = o.cap || '#5b7cff';
      c.fillStyle = cc; c.beginPath(); c.arc(0, -6.2, 6.8, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); c.fill();
      c.beginPath(); c.ellipse(2.5, -6.6, 6, 1.6, -0.15, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -11.6, 1.1, 0, TAU); c.fill();
    }
    if (acc.includes('bow')) {
      c.fillStyle = '#ff5ca8'; c.save(); c.translate(-5, -8); c.rotate(-0.4 + Math.sin(ph * 0.3) * 0.08);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-5, -4.5, -5, 0); c.quadraticCurveTo(-5, 4.5, 0, 0); c.quadraticCurveTo(5, -4.5, 5, 0); c.quadraticCurveTo(5, 4.5, 0, 0); c.fill();
      c.fillStyle = '#ff9bd0'; c.beginPath(); c.arc(0, 0, 1.4, 0, TAU); c.fill(); c.restore();
    }
    if (acc.includes('crown') || o.crown) {
      const b = o.bob || 0;
      c.fillStyle = '#ffd75c'; c.beginPath(); c.moveTo(-6, -8.5 + b); c.lineTo(-6.5, -15 + b); c.lineTo(-3, -11 + b); c.lineTo(0, -16.5 + b); c.lineTo(3, -11 + b); c.lineTo(6.5, -15 + b); c.lineTo(6, -8.5 + b); c.closePath(); c.fill();
      c.strokeStyle = '#b07a10'; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = '#ff3d6e'; c.beginPath(); c.arc(0, -11 + b, 1.2, 0, TAU); c.fill();
    }
  }
  // the colour of the combo ring for the time left (1 full .. 0 empty): gold, orange, red
  ringCol(f) {
    return f > 0.5 ? css(lerpC(rgb('#ff9a3c'), rgb('#ffd75c'), (f - 0.5) * 2)) : css(lerpC(rgb('#ff3d3d'), rgb('#ff9a3c'), clamp(f * 2, 0, 1)));
  }
  drawPlayer(race, dt, wdt = dt, beat = 0) {
    const c = this.ctx, p = race.p, x = p.x, y = this.sy(p.y), t = this.time, red = this.reduced;
    const frenzy = p.frenzyT > 0, dash = p.dashT > 0, combo = p.combo || 0, hk = Math.min(combo, 50) / 50;
    // trail: rainbow in frenzy (gold when reduced), icy while dashing
    if (frenzy || dash) {
      c.lineCap = 'round';
      const wk = frenzy ? 1 + 0.25 * beat : 1, n = this.trail.length;
      for (let i = 1; i < n; i++) {
        const a = this.trail[i - 1], b = this.trail[i];
        c.strokeStyle = frenzy ? (red ? `rgba(255,215,92,${i / n * 0.7})` : `hsla(${a.h},100%,65%,${i / n * 0.8})`) : `rgba(140,220,255,${i / n * 0.6})`;
        c.lineWidth = (3 + i * 0.5) * wk; c.beginPath(); c.moveTo(a.x, this.sy(a.y) + 18); c.lineTo(b.x, this.sy(b.y) + 18); c.stroke();
      }
    }
    // aura: heats up with the combo, breathes with the beat
    const gk = 1 + 0.08 * beat;
    const aCol = frenzy ? '#ffd75c' : dash ? '#8cdcff' : p.acid > 0.2 ? '#9dff3c' : combo >= 3 ? HEAT[Math.min(7, Math.round(hk * 7))] : '#96ffaa';
    this.dglow(aCol, x, y, (frenzy ? 58 : 44 + 26 * hk) * gk, frenzy ? 0.7 : 0.45 + 0.35 * hk);
    if (frenzy) {   // spinning rainbow halo (still and gold when reduced)
      c.lineWidth = 3; c.lineCap = 'round';
      for (let i = 0; i < 6; i++) { const a0 = (red ? 0 : t * 5) + i * TAU / 6; c.strokeStyle = red ? '#ffd75c' : `hsl(${(i * 60 + t * 300) % 360},100%,65%)`; c.beginPath(); c.arc(x, y, 27 + (red ? 0 : Math.sin(t * 9) * 2), a0, a0 + 0.7); c.stroke(); }
    }
    // combo timer ring: sweeps away as the chain cools
    if (combo >= 3 && !race.drill) {
      const f = clamp((p.comboT || 0) / (p.comboMax || 1), 0, 1), pul = f < 0.25 && !red ? 0.6 + 0.4 * Math.sin(t * 18) : 1;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(30,0,30,0.3)'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, 30, 0, TAU); c.stroke();
      c.globalAlpha = pul; c.strokeStyle = this.ringCol(f); c.lineWidth = 3; c.beginPath(); c.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.stroke(); c.globalAlpha = 1;
    }
    // tail phase accumulates (a changing rate times total time would jitter)
    const tw = dash ? 26 : frenzy ? 21 : 15 + (p.vy / 500) * 3;
    this.pTw += (tw - this.pTw) * Math.min(1, dt * 8); this.pPh += this.pTw * wdt;
    // wingman
    if (p.wing > 0) this.drawSwimmer(x - 26, y + 14 + Math.sin(t * 3) * 4, p.heading, 0.9, '#ffe0a8', this.pPh + 2, { band: '#5ce1ff', acc: ['glasses'], mouth: 'grin', blink: (t % 3) < 0.1 });
    let danger = false; for (const e of race.ents) if (e.t === 'wbc' && !e.dead && Math.abs(e.y - p.y) < 130 && Math.hypot(e.x - x, e.y - p.y) < 120) { danger = true; break; }
    const blinkInv = p.inv > 0 && p.inv < 1 && Math.floor(t * 20) % 2 === 0;
    const low = p.e < 30, stuck = p.stuck > 0;
    const o = {
      band: '#ff3d6e', taper: 1, flap: 1 + (dash ? 1.4 : 0) + (p.vy / 700), stretch: 1 + this.sq,
      look: clamp(p.vx / 200, -1.2, 1.2), flash: this.pHit / 0.35,
      blink: !danger && !dash && (t % 3.4) < 0.12,
    };
    if (stuck) { o.dizzy = 1; o.mouth = 'wobble'; }
    else if (danger) { o.mouth = 'scared'; o.brow = 'worried'; }
    else if (frenzy) { o.mouth = 'huge'; o.star = '#ffd75c'; o.blush = 1; }
    else if (dash) { o.mouth = 'grin'; o.brow = 'angry'; }
    else if (combo > 5) { o.mouth = 'grin'; o.blush = 1; }
    else if (low) { o.mouth = 'pant'; o.tired = 1; o.brow = 'worried'; }
    else if (race.drill) { o.mouth = 'grin'; o.happy = 1; o.blush = 1; }
    const body = frenzy ? (red ? '#ffd75c' : `hsl(${(t * 300) % 360},100%,82%)`) : p.acid > 0.2 ? '#e8ffd0' : '#ffffff';
    const ang = race.drill ? p.heading : clamp((p.heading || 0) + this.lean, -0.8, 0.8);
    // steer ghost: where your finger is taking you
    if (this.ghostA > 0 && !race.drill && !race.over) {
      const gx = this.ghostX, gy = this.sy(p.y + 40);
      c.globalAlpha = 0.25 * this.ghostA; c.strokeStyle = '#ffffff'; c.lineWidth = 2;
      c.beginPath(); c.arc(gx, gy, 7, 0, TAU); c.stroke();
      c.lineWidth = 1.5; c.setLineDash([2, 5]); c.beginPath(); c.moveTo(x, y - 12); c.lineTo(gx, gy + 7); c.stroke(); c.setLineDash([]);
      c.globalAlpha = 1;
    }
    if (!blinkInv) this.drawSwimmer(x, y, ang, 1.45, body, this.pPh, o);
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
    for (let i = 0; i < p.shield; i++) {
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
      c.strokeStyle = css(lerpC(rgb('#ff3d5a'), rgb('#7dffb0'), k)); c.lineWidth = 4;
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
    // "YOU" marker for the first seconds of a run (so you can find Kevin in the crowd)
    if (!race.demo && race.t != null && race.t < 4) {
      const a = clamp(4 - race.t, 0, 1), b = Math.sin(t * 8) * 3;
      c.globalAlpha = a; c.fillStyle = '#ff3d6e'; c.beginPath(); c.moveTo(x, y - 26 + b); c.lineTo(x - 7, y - 36 + b); c.lineTo(x + 7, y - 36 + b); c.closePath(); c.fill();
      const s = this.text('YOU', '#ffffff', 14); c.drawImage(s.cv, x - s.w / 2, y - 46 + b - s.h / 2, s.w, s.h);
      c.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- effects
  drawFx(race, dt, wdt = dt) {
    const c = this.ctx;
    for (const f of race.fx) {
      const y = this.sy(f.y), k = clamp(f.age / 1.2, 0, 1);
      if (f.t === 'eaten') {
        const s = this.text('nom', '#ff5c8a', 12);
        c.globalAlpha = 1 - k; c.drawImage(s.cv, f.x - s.w / 2, y - 10 - k * 30 - s.h / 2, s.w, s.h);
        c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 4; i++) { const px = f.x + Math.cos(i * 1.7) * k * 20, py = y + Math.sin(i * 1.7) * k * 20, r = 1.5 * (1 - k) + 0.3; c.moveTo(px + r, py); c.arc(px, py, r, 0, TAU); } c.fill();
      } else {   // a tiny ghost with a halo floats off to swimmer heaven
        const gy = y - 6 - k * 40, gx = f.x + Math.sin(k * 10) * 4;
        c.globalAlpha = 0.75 * (1 - k); c.drawImage(this.ghostSpr(), gx - 8, gy - 14, 16, 26);
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
    // particles: ring buffer, frame-rate independent drag
    const d94 = Math.pow(0.94, wdt * 60), d985 = Math.pow(0.985, wdt * 60), d97 = Math.pow(0.97, wdt * 60);
    const P = this.P, top = -40, bot = this.H + 40;
    for (let i = 0; i < MAXP; i++) {
      const q = P[i];
      if (q.life <= 0) continue;
      q.life -= wdt; if (q.life <= 0) continue;
      q.x += q.vx * wdt; q.y += q.vy * wdt; q.vy -= q.g * wdt;
      if (q.k === 2) { q.vx *= d985; q.vy *= d97; } else { q.vx *= d94; if (q.k !== 3) q.vy *= d94; }
      const sy = this.sy(q.y);
      if (sy < top || sy > bot) continue;
      const a = q.life / q.max;
      if (q.k === 0) { const r = q.size * (0.4 + a); c.globalAlpha = a; c.drawImage(this.dot(q.col), q.x - r * 1.45, sy - r * 1.45, r * 2.9, r * 2.9); continue; }
      c.globalAlpha = q.k === 2 ? Math.min(1, a * 3) : a; c.fillStyle = q.col;
      if (q.k === 1) { c.strokeStyle = q.col; c.lineWidth = q.size * 0.7 * (0.4 + a); c.lineCap = 'round'; c.beginPath(); c.moveTo(q.x, sy); c.lineTo(q.x - q.vx * 0.05, sy + q.vy * 0.05); c.stroke(); }
      else if (q.k === 2) { q.rot += q.vr * wdt; const w = Math.cos(q.rot) * q.size; c.fillRect(q.x - w / 2, sy - q.size * 0.3, w || 0.5, q.size * 0.6); }
      else if (q.k === 3) { c.beginPath(); c.moveTo(q.x, sy - q.size * 1.8); c.quadraticCurveTo(q.x + q.size, sy, q.x, sy + q.size); c.quadraticCurveTo(q.x - q.size, sy, q.x, sy - q.size * 1.8); c.fill(); }
      else if (q.k === 4) { c.strokeStyle = q.col; c.lineWidth = 1.2; c.beginPath(); c.arc(q.x, sy, q.size * (1.5 - a * 0.5), 0, TAU); c.stroke(); }
      else if (q.k === 5) { q.rot += q.vr * wdt; const dx = Math.cos(q.rot) * q.size, dy = Math.sin(q.rot) * q.size; c.strokeStyle = q.col; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(q.x - dx, sy - dy); c.lineTo(q.x + dx, sy + dy); c.stroke(); }
    }
    c.globalAlpha = 1;
    // popups: baked sprites, elastic pop-in, wobble; kept in a band around the swimmer so the lookahead stays clear
    n = 0;
    const py = this.sy(race.p.y), m = c.getTransform();
    for (const q of this.pops) {
      q.life -= wdt; if (q.life <= 0) continue; this.pops[n++] = q;
      const k = 1 - q.life / q.max, ki = Math.min(1, k / 0.18);
      const sc = k < 0.18 ? backOut(ki) : 1 - Math.max(0, k - 0.75) * 0.6;
      q.dy = q.y + 30 * (1 - Math.pow(1 - k, 3));
      const s = this.text(q.text, q.col, q.size);
      const y = clamp(this.sy(q.dy), py - 40, py + 120), x = clamp(q.x, s.w / 2 + 2, VIEW_W - s.w / 2 - 2);
      const rot = q.rot * (1 - k) + Math.sin(k * 18) * 0.05 * (1 - k);
      c.globalAlpha = Math.min(1, q.life * 3) * q.al;
      setXf(c, m, x, y, rot, sc, sc); c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h);
    }
    c.setTransform(m);
    this.pops.length = n; c.globalAlpha = 1;
  }
  // banked combo: DNA helices arc up to the HUD at the top left (screen space)
  drawBanks(dt) {
    if (!this.banks.length) return;
    const c = this.ctx, spr = this.helixSpr(), tx = 26, ty = 24;
    let n = 0;
    for (const b of this.banks) {
      b.t += dt;
      const k = (b.t - b.delay) / b.life;
      if (k >= 1) continue;
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

  // ---------------------------------------------------------------- album
  // a baby's portrait for the album: hue from baby.hue, Dad's best mutation as a hat or specs, a star per generation
  babyPortrait(ctx, baby, size = 64) {
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
    ctx.save(); ctx.translate(32, 37); ctx.scale(2.1, 2.1);
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
// a closed, smooth outline through the points in BX/BY (quadratic curves via midpoints)
function smoothBlob(c, n) {
  c.beginPath(); c.moveTo((BX[n - 1] + BX[0]) / 2, (BY[n - 1] + BY[0]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[j]) / 2, (BY[i] + BY[j]) / 2); }
  c.closePath();
}
function strokePts(c, P, dx = 0) {
  c.beginPath(); c.moveTo(P[0] + dx, P[1]);
  for (let i = 2; i < P.length; i += 2) c.lineTo(P[i] + dx, P[i + 1]);
  c.stroke();
}
function star4(c, x, y, r) {
  c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill();
}
function heart(c, x, y, r) {
  c.beginPath(); c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.1, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9); c.fill();
}
function backOut(k) { const s = 2.2; k -= 1; return k * k * ((s + 1) * k + s) + 1; }

// One backdrop tile per zone, painted once: the flesh outside the tube, seen at parallax.
function paintTile(g, z, zi) {
  const rnd = seeded(9001 + zi * 77), W = TW, H = TH;
  const c0 = rgb(z.col[0]), c1 = rgb(z.col[1]), wl = rgb(z.wall);
  const wrap = (fn) => { for (const o of [-H, 0, H]) fn(o); };
  g.fillStyle = css(c0); g.fillRect(0, 0, W, H);
  // soft lumps of tissue
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 90, al = 0.25 + rnd() * 0.3;
    wrap((o) => { const gr = g.createRadialGradient(x, y + o, 0, x, y + o, r); gr.addColorStop(0, css(c1, al)); gr.addColorStop(1, css(c1, 0)); g.fillStyle = gr; g.fillRect(x - r, y + o - r, r * 2, r * 2); });
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (z.id === 'launch') {      // veins
    for (let v = 0; v < 7; v++) {
      let x = rnd() * W, y = rnd() * H, a = rnd() * TAU, w = 5 + rnd() * 3;
      const pts = [[x, y, w]];
      for (let s = 0; s < 16 && w > 0.8; s++) { a += (rnd() - 0.5) * 0.8; x += Math.cos(a) * 24; y += Math.sin(a) * 24; w *= 0.88; pts.push([x, y, w]); }
      wrap((o) => {
        for (let i = 1; i < pts.length; i++) {
          g.strokeStyle = 'rgba(110,8,45,0.6)'; g.lineWidth = pts[i][2] + 2; g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1] + o); g.lineTo(pts[i][0], pts[i][1] + o); g.stroke();
          g.strokeStyle = 'rgba(255,120,170,0.28)'; g.lineWidth = Math.max(0.6, pts[i][2] * 0.35); g.beginPath(); g.moveTo(pts[i - 1][0] - 1, pts[i - 1][1] + o - 1); g.lineTo(pts[i][0] - 1, pts[i][1] + o - 1); g.stroke();
        }
      });
    }
  } else if (z.id === 'acid') {
    for (let i = 0; i < 40; i++) { const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 9; wrap((o) => { g.strokeStyle = 'rgba(182,255,92,0.22)'; g.lineWidth = 1.3; g.beginPath(); g.arc(x, y + o, r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(220,255,170,0.25)'; g.beginPath(); g.arc(x - r * 0.35, y + o - r * 0.35, r * 0.25, 0, TAU); g.fill(); }); }
  } else if (z.id === 'goo') {
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W, y = rnd() * H, L = 60 + rnd() * 140, w = 1.5 + rnd() * 3;
      wrap((o) => { g.strokeStyle = 'rgba(217,184,255,0.22)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y + o); g.bezierCurveTo(x + 14, y + o + L * 0.3, x - 14, y + o + L * 0.7, x + 4, y + o + L); g.stroke(); g.fillStyle = 'rgba(217,184,255,0.3)'; g.beginPath(); g.arc(x + 4, y + o + L + 3, w + 1.5, 0, TAU); g.fill(); });
    }
  } else if (z.id === 'sea') {
    for (let i = 0; i < 24; i++) {
      const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 16, a = rnd() * TAU, sq = 0.5 + rnd() * 0.5;
      wrap((o) => { g.save(); g.translate(x, y + o); g.rotate(a); g.scale(1, sq); g.fillStyle = 'rgba(190,30,60,0.35)'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(90,5,25,0.35)'; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill(); g.restore(); });
    }
  } else if (z.id === 'fork') {
    for (let i = 0; i < 46; i++) { const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 18; wrap((o) => { g.strokeStyle = 'rgba(255,155,224,0.13)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y + o, r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,155,224,0.16)'; g.beginPath(); g.arc(x + r * 0.2, y + o, r * 0.25, 0, TAU); g.fill(); }); }
  } else if (z.id === 'rapids') {
    // the width is drawn once per streak, outside wrap(), so all three copies match and the seed stays in step
    for (let i = 0; i < 46; i++) { const x = rnd() * W, y = rnd() * H, L = 40 + rnd() * 120, lw = 1 + rnd() * 2; wrap((o) => { g.strokeStyle = 'rgba(92,225,255,0.13)'; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y + o); g.quadraticCurveTo(x + 8, y + o + L / 2, x, y + o + L); g.stroke(); }); }
  } else if (z.id === 'egg') {
    for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H, r = 0.8 + rnd() * 2.2; wrap((o) => { g.fillStyle = 'rgba(255,225,140,0.45)'; g.beginPath(); g.arc(x, y + o, r, 0, TAU); g.fill(); }); }
  }
  // a little wall-tinted speckle everywhere so nothing looks flat (wrapped so the tile seams match)
  g.fillStyle = css(wl, 0.12);
  for (let i = 0; i < 60; i++) { const x = rnd() * W, y = rnd() * H, r = 0.6 + rnd() * 1.4; wrap((o) => { g.beginPath(); g.arc(x, y + o, r, 0, TAU); g.fill(); }); }
}
