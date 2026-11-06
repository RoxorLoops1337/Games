// Particles, floating numbers, screen shake, hit-stop, flashes. One Fx per scene; the scene calls fx.update(dt) and fx.draw(ctx).
//
// Round 4 rewrite: pooled typed-array particles (swap-remove, zero per-frame allocation), a pre-rendered sprite
// ATLAS per colour (glow, dot, streak, shard, flake, coin, droplet, leaf, ember, bubble) drawn with drawImage,
// two draw buckets (additive 'lighter' / normal), ribbon trails, caps, frame-rate independent float physics,
// a multi-hit float counter, directional smoothed-noise shake, camera zoom punch.
// Thread safety: not thread safe (single UI thread, like the rest of the canvas code).
//
// Usage:
//   const fx = new Fx();
//   per frame:  const d = fx.update(dt); const o = fx.shakeOffset(); ctx.translate(o.x, o.y); ...scene...; fx.draw(ctx); fx.drawFlash(ctx, W, H);
//   fx.burst(x, y, 'ember'); fx.float('-12', x, y, { color: '#c33' }); fx.floatCounter('e1', x, y, 6); fx.shakeDir(0, 0.4); fx.zoom(0.04);

// Global accessibility / quality switches, synced from meta.settings by main.js each frame.
//  shake/reduced: accessibility. quality: 0..1 count factor (1 = full, 0 = none). mobile: lowers the particle cap to 600.
export const FX_OPTS = { shake: true, reduced: false, quality: 1, mobile: typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') };

// Default effects quality: phones and tablets start on 'low' (the auto-downgrade in post.js still applies on top).
// WCAG 2.3.1: at most 3 flashes in any one second (per Fx; the clock is its own age counter)
// One gate shared by every flash source (Fx.flash and post.flash), keyed on a wall clock or an explicit time.
const FL = [];
export function flashGate(nowSec) { if (FX_OPTS.flashes === false) return false; const now = nowSec === undefined ? (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000) : nowSec; while (FL.length && now - FL[0] >= 1) FL.shift(); if (FL.length >= 3) return false; FL.push(now); return true; }
flashGate.reset = () => { FL.length = 0; };
function flashOk() { return flashGate(); }
export const defaultQuality = () => (FX_OPTS.mobile ? 'low' : 'high');
export const CAP_DESKTOP = 2000;
export const CAP_MOBILE = 600;
export const CAP_ADD = 150; // additive particles alive at once
export const CAP_TRAIL = 100; // ribbon trails alive at once
const TRN = 6; // points per trail ring
const TR_DT = 0.018; // seconds between trail samples

// ---------------------------------------------------------------- atlas
const CELL = 32;
const SHAPES = { glow: 0, dot: 1, streak: 2, shard: 3, flake: 4, coin: 5, droplet: 6, leaf: 7, ember: 8, bubble: 9 };
const NSH = 10;
const HALF = [2.4, 1, 1.5, 1, 1, 1, 1.25, 1.3, 1.5, 1.1]; // drawn half-extent as a multiple of particle size
const ROTATES = [0, 0, 1, 1, 1, 0, 1, 1, 1, 0]; // needs rotate transform
const ORIENT_SH = [0, 0, 1, 0, 0, 0, 1, 0, 1, 0]; // follows velocity direction by default

const palette = ['#ffffff'];
const palIdx = new Map([['#ffffff', 0]]);
const sheets = [];

function colorIndex(c) {
  let i = palIdx.get(c);
  if (i !== undefined) return i;
  if (palette.length >= 96) return 0;
  i = palette.length; palette.push(c); palIdx.set(c, i); return i;
}
function hexRgb(c) {
  if (typeof c === 'string' && c[0] === '#') {
    if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    if (c.length >= 7) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  return [255, 255, 255];
}
const mix = (c, t, k) => Math.round(c + (t - c) * k);
function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv;
}
// Bake one colour group: a strip of NSH cells. Gradients are created here, once per colour, never per frame.
function buildSheet(css) {
  const cv = makeCanvas(CELL * NSH, CELL); if (!cv) return null;
  const g = cv.getContext('2d'); if (!g) return null;
  const [r, gg, b] = hexRgb(css);
  const base = `rgb(${r},${gg},${b})`;
  const hi = `rgb(${mix(r, 255, 0.55)},${mix(gg, 255, 0.55)},${mix(b, 255, 0.55)})`;
  const lo = `rgb(${mix(r, 0, 0.55)},${mix(gg, 0, 0.55)},${mix(b, 0, 0.55)})`;
  const a = (k) => `rgba(${r},${gg},${b},${k})`;
  const R = 15;
  for (let s = 0; s < NSH; s++) {
    g.save(); g.translate(s * CELL + 16, 16);
    if (s === 0) { const rg = g.createRadialGradient(0, 0, 0, 0, 0, R); rg.addColorStop(0, a(0.95)); rg.addColorStop(0.3, a(0.45)); rg.addColorStop(1, a(0)); g.fillStyle = rg; g.fillRect(-16, -16, 32, 32); }
    else if (s === 1) { const rg = g.createRadialGradient(-3, -3, 1, 0, 0, R * 0.85); rg.addColorStop(0, hi); rg.addColorStop(0.6, base); rg.addColorStop(1, a(0.0)); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, R * 0.9, 0, 6.2832); g.fill(); }
    else if (s === 2) { const lg = g.createLinearGradient(-R, 0, R, 0); lg.addColorStop(0, a(0)); lg.addColorStop(0.7, base); lg.addColorStop(1, hi); g.fillStyle = lg; g.beginPath(); g.moveTo(R, 0); g.lineTo(-R, -3); g.lineTo(-R, 3); g.closePath(); g.fill(); }
    else if (s === 3) { g.fillStyle = base; g.beginPath(); g.moveTo(-R, -R * 0.4); g.lineTo(R, 0); g.lineTo(-R * 0.3, R * 0.7); g.closePath(); g.fill(); g.strokeStyle = hi; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-R, -R * 0.4); g.lineTo(R, 0); g.stroke(); }
    else if (s === 4) { g.fillStyle = base; g.beginPath(); g.moveTo(-R, -R * 0.5); g.lineTo(R * 0.6, -R * 0.5); g.lineTo(R, -R * 0.1); g.lineTo(R * 0.7, R * 0.5); g.lineTo(-R, R * 0.5); g.closePath(); g.fill(); g.fillStyle = lo; g.fillRect(-R, R * 0.1, R * 1.7, R * 0.4); g.fillStyle = hi; g.fillRect(-R, -R * 0.5, R * 1.4, 2); }
    else if (s === 5) { g.fillStyle = lo; g.beginPath(); g.arc(0, 0, R * 0.9, 0, 6.2832); g.fill(); g.fillStyle = base; g.beginPath(); g.arc(0, 0, R * 0.74, 0, 6.2832); g.fill(); g.strokeStyle = hi; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, R * 0.5, 0.3, 4.2); g.stroke(); }
    else if (s === 6) { // wet droplet: body, dark core, white sheen. Head at +x, tail at -x.
      g.fillStyle = base; g.beginPath(); g.moveTo(-R, 0); g.quadraticCurveTo(-R * 0.1, -R * 0.65, R * 0.35, -R * 0.55); g.arc(R * 0.3, 0, R * 0.55, -1.57, 1.57); g.quadraticCurveTo(-R * 0.1, R * 0.65, -R, 0); g.fill();
      g.fillStyle = lo; g.beginPath(); g.arc(R * 0.2, 0, R * 0.34, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(R * 0.35, -R * 0.28, R * 0.14, R * 0.08, -0.4, 0, 6.2832); g.fill(); }
    else if (s === 7) { const lg = g.createLinearGradient(-R, -R * 0.5, R, R * 0.5); lg.addColorStop(0, hi); lg.addColorStop(0.5, base); lg.addColorStop(1, lo); g.fillStyle = lg; g.beginPath(); g.moveTo(-R, 0); g.quadraticCurveTo(0, -R * 0.9, R, 0); g.quadraticCurveTo(0, R * 0.9, -R, 0); g.fill(); g.strokeStyle = lo; g.lineWidth = 1; g.beginPath(); g.moveTo(-R * 0.8, 0); g.lineTo(R * 0.8, 0); g.stroke(); }
    else if (s === 8) { // ember teardrop, bright head at +x, fading tail
      const lg = g.createLinearGradient(-R, 0, R * 0.3, 0); lg.addColorStop(0, a(0)); lg.addColorStop(1, a(0.85)); g.fillStyle = lg;
      g.beginPath(); g.moveTo(-R, 0); g.quadraticCurveTo(-R * 0.2, -R * 0.55, R * 0.3, -R * 0.42); g.arc(R * 0.3, 0, R * 0.42, -1.57, 1.57); g.quadraticCurveTo(-R * 0.2, R * 0.55, -R, 0); g.fill();
      const rg = g.createRadialGradient(R * 0.35, 0, 0, R * 0.35, 0, R * 0.5); rg.addColorStop(0, '#fff'); rg.addColorStop(0.5, hi); rg.addColorStop(1, a(0)); g.fillStyle = rg; g.beginPath(); g.arc(R * 0.35, 0, R * 0.5, 0, 6.2832); g.fill(); }
    else { g.fillStyle = a(0.14); g.beginPath(); g.arc(0, 0, R * 0.8, 0, 6.2832); g.fill(); g.strokeStyle = base; g.lineWidth = 2; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(-R * 0.3, -R * 0.3, 2.2, 0, 6.2832); g.fill(); }
    g.restore();
  }
  return cv;
}
function sheetFor(ci) {
  let s = sheets[ci];
  if (s === undefined) { s = buildSheet(palette[ci]); if (s) sheets[ci] = s; }
  return s || null;
}

// ---------------------------------------------------------------- flags
const F_ADD = 1, F_SHRINK = 2, F_TRAIL = 4, F_BOUNCE = 8, F_SHIMMER = 16, F_ORIENT = 32;

// smoothed value noise in -1..1 (no white noise)
function hash1(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
function snoise(t) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f), a = hash1(i); return a + (hash1(i + 1) - a) * u; }

const FLOAT_K = -Math.log(0.96) * 60; // legacy 0.96/frame@60 as a continuous decay rate
const COUNTER_WINDOW = 0.35;

function makePool(cap) {
  return {
    cap, n: 0, addN: 0, trailN: 0,
    x: new Float32Array(cap), y: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap),
    life: new Float32Array(cap), age: new Float32Array(cap), size: new Float32Array(cap), rot: new Float32Array(cap), spin: new Float32Array(cap),
    g: new Float32Array(cap), drag: new Float32Array(cap), floor: new Float32Array(cap),
    col: new Uint8Array(cap), shape: new Uint8Array(cap), flags: new Uint8Array(cap),
    trN: new Uint8Array(cap), trH: new Uint8Array(cap), tr: new Float32Array(cap * TRN * 2),
    idxN: new Uint16Array(cap), idxA: new Uint16Array(cap),
  };
}

export class Fx {
  constructor() {
    this.pool = null; // allocated lazily on first emit (typed arrays never reallocated afterwards)
    this.floats = []; this.floatFree = []; this.bolts = []; this.boltFree = []; this.rings = []; this.ringFree = []; this.flashes = []; this.flashFree = [];
    this.trauma = 0; this.stop = 0; this.slow = 0; this.slowScale = 1;
    this.dirX = 0; this.dirY = 0; this.dirW = 0; this.nt = 0; this.trAcc = 0;
    this.zm = 0; this.zk = 8; this._off = { x: 0, y: 0, r: 0 };
  }
  // number of live particles (for tests / debug)
  get count() { return this.pool ? this.pool.n : 0; }
  // live particle cap: halves at quality low (0.5), quarter floor; mobile starts from the smaller base
  _cap() { const b = FX_OPTS.mobile ? CAP_MOBILE : CAP_DESKTOP, q = FX_OPTS.quality; return q !== undefined && q < 1 ? Math.max(100, Math.round(b * Math.max(0.25, q))) : b; }
  _pool() { return this.pool || (this.pool = makePool(CAP_DESKTOP)); }

  _spawn(x, y, vx, vy, life, size, shape, col, g, drag, flags, spin, floor, rot) {
    const P = this._pool();
    if (P.n >= P.cap || P.n >= this._cap()) return;
    if ((flags & F_ADD) && P.addN >= CAP_ADD) flags &= ~F_ADD;
    if ((flags & F_TRAIL) && P.trailN >= CAP_TRAIL) flags &= ~F_TRAIL;
    const i = P.n++;
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.life[i] = life; P.age[i] = 0; P.size[i] = size; P.rot[i] = rot; P.spin[i] = spin;
    P.g[i] = g; P.drag[i] = drag; P.floor[i] = floor; P.col[i] = col; P.shape[i] = shape; P.flags[i] = flags; P.trN[i] = 0; P.trH[i] = 0;
    if (flags & F_ADD) P.addN++;
    if (flags & F_TRAIL) P.trailN++;
  }
  _kill(i) {
    const P = this.pool, last = P.n - 1, f = P.flags[i];
    if (f & F_ADD) P.addN--;
    if (f & F_TRAIL) P.trailN--;
    if (i !== last) {
      P.x[i] = P.x[last]; P.y[i] = P.y[last]; P.vx[i] = P.vx[last]; P.vy[i] = P.vy[last]; P.life[i] = P.life[last]; P.age[i] = P.age[last];
      P.size[i] = P.size[last]; P.rot[i] = P.rot[last]; P.spin[i] = P.spin[last]; P.g[i] = P.g[last]; P.drag[i] = P.drag[last]; P.floor[i] = P.floor[last];
      P.col[i] = P.col[last]; P.shape[i] = P.shape[last]; P.flags[i] = P.flags[last]; P.trN[i] = P.trN[last]; P.trH[i] = P.trH[last];
      const a = i * TRN * 2, b = last * TRN * 2;
      for (let k = 0; k < TRN * 2; k++) P.tr[a + k] = P.tr[b + k];
    }
    P.n = last;
  }

  // generic emitter. o: {x,y,n,color|colors[],speed,spread(rad),angle,life,size,gravity,drag,glow,add,
  //   shape:'dot'|'shard'|'streak'|'flake'|'coin'|'glow'|'droplet'|'leaf'|'ember'|'bubble', spin, jitter, trail, floor, bounce, shimmer, shrink}
  // Example: fx.emit({ x: 100, y: 100, n: 12, colors: ['#fa0', '#ff0'], speed: 200, shape: 'ember', trail: true })
  emit(o) {
    let n = o.n || 8;
    if (FX_OPTS.reduced) n = Math.ceil(n / 2);
    const q = FX_OPTS.quality; if (q !== undefined && q < 1) n = Math.round(n * Math.max(0, q));
    if (n <= 0) return;
    let shape = o.shape || 'dot';
    let add = !!(o.glow || o.add);
    if (o.glow && shape === 'dot') shape = 'glow';
    const sh = SHAPES[shape] === undefined ? 1 : SHAPES[shape];
    const spread = o.spread === undefined ? Math.PI * 2 : o.spread;
    const baseSpeed = o.speed || 200, baseLife = o.life || 0.6, baseSize = o.size || 4;
    const g = o.gravity === undefined ? 400 : o.gravity, drag = o.drag === undefined ? 0.5 : o.drag;
    const spinAmp = o.spin === undefined ? 8 : o.spin, jit = o.jitter || 0;
    let flags = 0;
    if (add) flags |= F_ADD;
    if (o.shrink !== false) flags |= F_SHRINK;
    if (o.trail === undefined ? (sh === 2 || sh === 8) : o.trail) flags |= F_TRAIL;
    if (o.bounce || o.floor !== undefined) flags |= F_BOUNCE;
    if (o.shimmer) flags |= F_SHIMMER;
    if (o.orient || ORIENT_SH[sh]) flags |= F_ORIENT;
    const floor = o.floor !== undefined ? o.floor : o.y + 60;
    for (let i = 0; i < n; i++) {
      const a = o.angle === undefined ? Math.random() * 6.2832 : o.angle + (Math.random() - 0.5) * spread;
      const sp = baseSpeed * (0.4 + Math.random() * 0.8);
      const c = o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : (o.color || '#fff');
      this._spawn(o.x + (Math.random() - 0.5) * jit, o.y + (Math.random() - 0.5) * jit, Math.cos(a) * sp, Math.sin(a) * sp,
        baseLife * (0.6 + Math.random() * 0.7), baseSize * (0.6 + Math.random() * 0.8), sh, colorIndex(c), g, drag, flags,
        (Math.random() - 0.5) * spinAmp, floor, Math.random() * 6.2832);
    }
  }

  // Burst kinds: spark ember blood dust shard glass coin flake zap heal block echo gild (legacy) plus the school set:
  // ember (teardrops + shimmer) echo (ghost rings) hoard (bouncing coins) blood (wet droplets) rust (flaking shards) static (forked bolts)
  // gilded (drifting foil) and poisonTick burnTick ash.  Example: fx.burst(640, 300, 'hoard', { n: 9 })
  burst(x, y, kind = 'spark', o = {}) {
    const k = BURSTS[kind] || {};
    this.emit({ x, y, ...k, ...o });
    switch (kind) {
      case 'echo': {
        const c = (o.colors && o.colors[0]) || '#6CC6D6';
        for (let i = 0; i < 3; i++) this.ring(x, y, c, (o.r || 70) * (1 + i * 0.35), 0.5 + i * 0.08, -(0.08 + i * 0.04));
        break;
      }
      case 'hoard': this.emit({ x, y, n: 4, colors: ['#fff3c4', '#ffe38a'], speed: 150, life: 0.35, size: 3, shape: 'glow', gravity: 0, add: true }); break;
      case 'rust': this.emit({ x, y, n: 6, colors: ['#8a8070', '#a99f8c'], speed: 90, life: 0.8, size: 5, gravity: -10, drag: 2.2, ...o, shape: 'glow', add: false, glow: false }); break;
      case 'static': {
        const nb = FX_OPTS.reduced ? 1 : 3, len = o.len || 90;
        for (let i = 0; i < nb; i++) { const a = Math.random() * 6.2832; this.bolt(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, '#D9E84A'); }
        break;
      }
      case 'gilded': this.emit({ x, y, n: 6, colors: ['#fff6c8', '#EFD98F'], speed: 60, life: 1.2, size: 3, shape: 'glow', gravity: -50, drag: 1.2, add: true }); break;
      case 'burnTick': this.emit({ x, y, n: 4, colors: ['#ff8a3c'], speed: 40, life: 0.5, size: 8, shape: 'glow', gravity: -60, add: true }); break;
      case 'blood': this.emit({ x, y, n: 4, colors: ['#4a0612'], speed: 120, life: 0.9, size: 3, gravity: 800, ...o, shape: 'dot', glow: false, add: false }); break;
      default: break;
    }
  }

  // Lightning line of spark streaks between two points. Example: fx.sparkLine(100, 100, 400, 220, '#D9E84A')
  sparkLine(x1, y1, x2, y2, color = '#fff6c8') {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const n = Math.min(24, Math.max(3, Math.round(len / 18))), ang = Math.atan2(dy, dx);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.emit({ x: x1 + dx * t, y: y1 + dy * t, n: 1, color, colors: [color, '#ffffff'], speed: 90, angle: ang + Math.PI / 2, spread: Math.PI, life: 0.35, size: 2.6, gravity: 80, glow: true, shape: 'streak', trail: false });
    }
  }

  _take(list, free, make) { const f = free.pop() || make(); list.push(f); return f; }
  _drop(list, free, i) { free.push(list[i]); const last = list.pop(); if (i < list.length) list[i] = last; }

  // Floating number. o: {vy,life,color,size,big,stroke,tilt(rad),slam(start scale),sink}
  // Frame-rate independent: vy decays by exp(-k t) and y integrates the exact integral.
  float(text, x, y, o = {}) {
    const f = this._take(this.floats, this.floatFree, () => ({}));
    f.text = String(text); f.x = x; f.y = y; f.vy = o.vy === undefined ? -60 : o.vy; f.life = o.life || 1.1; f.age = 0; f.color = o.color || '#fff';
    f.size = o.size || 30; f.big = !!o.big; f.stroke = o.stroke || '#1a1614'; f.tilt = o.tilt || 0; f.slam = o.slam || 0;
    f.cnt = false; f.key = null; f.total = 0; f.shown = 0; f.hits = 0; f.since = 0; f.fin = false; f.finAge = 0; f.jit = 0;
    return f;
  }
  // Multi-hit merge counter: hits on the same key within 350 ms merge into ONE growing number that ticks up and
  // slams "x6 = 42" on the last hit. Pass opts.last (or stop calling) to finish. Example: fx.floatCounter('e0', x, y, 7, { color: '#fff' })
  floatCounter(key, x, y, add, o = {}) {
    let f = null;
    for (let i = 0; i < this.floats.length; i++) { const q = this.floats[i]; if (q.cnt && !q.fin && q.key === key && q.since <= COUNTER_WINDOW) { f = q; break; } }
    if (!f) {
      f = this.float('', x, y, { vy: o.vy === undefined ? -28 : o.vy, life: 1e9, color: o.color, size: o.size || 30, stroke: o.stroke });
      f.cnt = true; f.key = key; f.baseSize = o.size || 30;
    }
    f.total += add; f.hits++; f.since = 0; f.x = x;
    if (o.color) f.color = o.color;
    f.size = Math.min(f.baseSize * 1.7, f.baseSize * Math.pow(1.04, f.hits - 1));
    f.jit = Math.min(7, f.hits * 0.9);
    if (o.last) this._finish(f);
    return f;
  }
  _finish(f) { f.fin = true; f.finAge = f.age; f.life = f.age + 0.9; f.shown = f.total; f.size = f.baseSize * Math.min(1.9, 1.15 + f.hits * 0.06); }

  // Lightning bolt with forked branches. Example: fx.bolt(100, 100, 400, 300, '#D9E84A', { forks: 3 })
  bolt(x1, y1, x2, y2, color = '#E8F542', o = {}) {
    const b = this._take(this.bolts, this.boltFree, () => ({}));
    b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2; b.color = color; b.age = 0; b.life = o.life || 0.18; b.seed = Math.random() * 1000; b.forks = o.forks === undefined ? (FX_OPTS.reduced ? 0 : 2) : o.forks;
    return b;
  }
  ring(x, y, color = '#fff', r = 120, life = 0.5, delay = 0) {
    const g = this._take(this.rings, this.ringFree, () => ({}));
    g.x = x; g.y = y; g.color = color; g.r = r; g.age = delay; g.life = life; return g;
  }
  shake(amount) { if (!FX_OPTS.shake || FX_OPTS.reduced) return; this.trauma = Math.min(1, this.trauma + amount); }
  // Directional shake: kicks along angle (radians) with smoothed noise and a small roll. Example: fx.shakeDir(0, 0.5) pushes sideways.
  shakeDir(angle, amount) {
    if (!FX_OPTS.shake || FX_OPTS.reduced) return;
    const w = this.trauma + amount;
    this.dirX = (this.dirX * this.trauma + Math.cos(angle) * amount) / (w || 1);
    this.dirY = (this.dirY * this.trauma + Math.sin(angle) * amount) / (w || 1);
    const m = Math.hypot(this.dirX, this.dirY) || 1; this.dirX /= m; this.dirY /= m;
    this.dirW = 1; this.trauma = Math.min(1, w);
  }
  // Camera zoom punch. Screens scale their scene by fx.zoomScale() about the focus point. Example: fx.zoom(0.04, 260)
  zoom(amount = 0.04, ms = 260) { if (FX_OPTS.reduced) return; this.zm = Math.max(this.zm, amount); this.zk = 3 / Math.max(0.05, ms / 1000); }
  zoomScale() { return 1 + this.zm; }
  hitstop(ms) { if (FX_OPTS.reduced) return; this.stop = Math.max(this.stop, ms / 1000); }
  slowmo(scale, ms) { if (FX_OPTS.reduced) return; this.slow = ms / 1000; this.slowScale = scale; }
  flash(color = '#fff', a = 0.4, life = 0.25) {
    if (FX_OPTS.flashes === false || !flashOk(this)) return; // 'Screen flashes' off, or already 3 in the last second
    if (FX_OPTS.reduced) a *= 0.35;
    const f = this._take(this.flashes, this.flashFree, () => ({})); f.color = color; f.a = a; f.age = 0; f.life = life;
  }

  // returns the effective dt (0 while hit-stopped, scaled in slow-mo)
  update(dt) {
    this.nt += dt; // noise clock runs on real time
    this._clk = (this._clk || 0) + dt;
    if (this.stop > 0) { this.stop -= dt; return 0; }
    let d = dt;
    if (this.slow > 0) { this.slow -= dt; d = dt * this.slowScale; }
    const P = this.pool;
    if (P && P.n) {
      this.trAcc += d; const rec = this.trAcc >= TR_DT; if (rec) this.trAcc = 0;
      const { x, y, vx, vy, life, age, rot, spin, g, drag, floor, flags, trN, trH, tr } = P;
      for (let i = 0; i < P.n;) {
        const a = age[i] + d; age[i] = a;
        if (a >= life[i]) { this._kill(i); continue; }
        const f = flags[i];
        if (rec && (f & F_TRAIL)) { const h = trH[i]; const o = (i * TRN + h) * 2; tr[o] = x[i]; tr[o + 1] = y[i]; trH[i] = (h + 1) % TRN; if (trN[i] < TRN) trN[i]++; }
        const dr = Math.exp(-drag[i] * d);
        let vyi = (vy[i] + g[i] * d) * dr; const vxi = vx[i] * dr;
        x[i] += vxi * d; y[i] += vyi * d; rot[i] += spin[i] * d;
        if ((f & F_BOUNCE) && y[i] > floor[i] && vyi > 0) { y[i] = floor[i]; vyi *= -0.5; vx[i] = vxi * 0.8; } else vx[i] = vxi;
        vy[i] = vyi;
        i++;
      }
    }
    for (let i = 0; i < this.floats.length;) {
      const f = this.floats[i]; f.age += d;
      const e = Math.exp(-FLOAT_K * d); f.y += f.vy * (1 - e) / FLOAT_K; f.vy *= e;
      if (f.cnt && !f.fin) {
        f.since += d; f.shown += (f.total - f.shown) * (1 - Math.exp(-18 * d));
        if (f.since > COUNTER_WINDOW) this._finish(f);
      }
      if (f.age >= f.life) this._drop(this.floats, this.floatFree, i); else i++;
    }
    for (let i = 0; i < this.bolts.length;) { const b = this.bolts[i]; b.age += d; if (b.age >= b.life) this._drop(this.bolts, this.boltFree, i); else i++; }
    for (let i = 0; i < this.rings.length;) { const r = this.rings[i]; r.age += d; if (r.age >= r.life) this._drop(this.rings, this.ringFree, i); else i++; }
    for (let i = 0; i < this.flashes.length;) { const f = this.flashes[i]; f.age += d; if (f.age >= f.life) this._drop(this.flashes, this.flashFree, i); else i++; }
    this.trauma = Math.max(0, this.trauma - d * 1.6);
    this.dirW *= Math.exp(-3 * d);
    if (this.zm > 0.0001) this.zm *= Math.exp(-this.zk * d); else this.zm = 0;
    return d;
  }

  // Smoothed-noise shake offset {x, y, r(roll radians)}. The returned object is reused: read it, do not keep it.
  shakeOffset() {
    const o = this._off, tq = this.trauma * this.trauma, s = tq * 14, t = this.nt * 24;
    const ux = snoise(t) * s, uy = snoise(t + 71.3) * s;
    if (this.dirW > 0.02) {
      const along = snoise(t + 33.1) * s * 1.2, perp = snoise(t + 91.7) * s * 0.35, w = this.dirW;
      const dx = this.dirX * along - this.dirY * perp, dy = this.dirY * along + this.dirX * perp;
      o.x = ux * (1 - w) + dx * w; o.y = uy * (1 - w) + dy * w;
    } else { o.x = ux; o.y = uy; }
    o.r = snoise(t * 0.7 + 200) * tq * 0.026;
    return o;
  }

  draw(ctx) {
    ctx.save();
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i]; if (r.age < 0) continue;
      const k = r.age / r.life; ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * k, 0, 6.283); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const P = this.pool;
    if (P && P.n) {
      let nn = 0, na = 0;
      for (let i = 0; i < P.n; i++) { if (P.flags[i] & F_ADD) P.idxA[na++] = i; else P.idxN[nn++] = i; }
      if (nn) this._bucket(ctx, P.idxN, nn);
      if (na) { ctx.globalCompositeOperation = 'lighter'; this._bucket(ctx, P.idxA, na); ctx.globalCompositeOperation = 'source-over'; }
    }
    if (this.bolts.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.bolts.length; i++) this._drawBolt(ctx, this.bolts[i]);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let i = 0; i < this.floats.length; i++) this._drawFloat(ctx, this.floats[i]);
    ctx.restore();
  }

  _bucket(ctx, idx, cnt) {
    const P = this.pool, nt = this.nt;
    let trails = false;
    for (let j = 0; j < cnt; j++) {
      const i = idx[j], f = P.flags[i], sh = P.shape[i];
      const k = P.age[i] / P.life[i], a = 1 - k * k, s = (f & F_SHRINK) ? P.size[i] * (1 - k * 0.6) : P.size[i];
      const sheet = sheetFor(P.col[i]); if (!sheet) continue;
      let x = P.x[i], y = P.y[i];
      if (f & F_TRAIL) { trails = true; if (sh === 2) { // streak ribbon: small bright head only
        ctx.globalAlpha = a; ctx.drawImage(sheet, 0, 0, CELL, CELL, x - s * 1.4, y - s * 1.4, s * 2.8, s * 2.8); continue; } }
      if (f & F_SHIMMER) { x += Math.sin(nt * 14 + P.rot[i] * 3) * 2.2; ctx.globalAlpha = a * 0.16; ctx.drawImage(sheet, 0, 0, CELL, CELL, x - s * 3.2, y - s * 3.2, s * 6.4, s * 6.4); }
      ctx.globalAlpha = a;
      const h = s * HALF[sh];
      if (ROTATES[sh]) {
        const ang = (f & F_ORIENT) ? Math.atan2(P.vy[i], P.vx[i]) : P.rot[i];
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        if (sh === 5) ctx.scale(Math.abs(Math.cos(P.rot[i])) + 0.15, 1);
        ctx.drawImage(sheet, sh * CELL, 0, CELL, CELL, -h, -h, h * 2, h * 2); ctx.restore();
      } else if (sh === 5) {
        ctx.save(); ctx.translate(x, y); ctx.scale(Math.abs(Math.cos(P.rot[i])) + 0.15, 1);
        ctx.drawImage(sheet, sh * CELL, 0, CELL, CELL, -h, -h, h * 2, h * 2); ctx.restore();
      } else ctx.drawImage(sheet, sh * CELL, 0, CELL, CELL, x - h, y - h, h * 2, h * 2);
    }
    if (!trails) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let j = 0; j < cnt; j++) {
      const i = idx[j]; if (!(P.flags[i] & F_TRAIL)) continue;
      const m = P.trN[i]; if (m < 2) continue;
      const k = P.age[i] / P.life[i], a = 1 - k * k, s = P.size[i] * (1 - k * 0.5), base = i * TRN * 2, hd = P.trH[i];
      ctx.strokeStyle = palette[P.col[i]];
      for (let pass = 0; pass < 2; pass++) {
        const lim = pass ? Math.min(3, m) : m;
        ctx.globalAlpha = a * (pass ? 0.75 : 0.3); ctx.lineWidth = Math.max(1, s * (pass ? 0.55 : 1.0));
        ctx.beginPath(); ctx.moveTo(P.x[i], P.y[i]);
        for (let q = 0; q < lim; q++) { const o = base + ((hd - 1 - q + TRN * 2) % TRN) * 2; ctx.lineTo(P.tr[o], P.tr[o + 1]); }
        ctx.stroke();
      }
    }
  }

  _drawBolt(ctx, b) {
    const k = b.age / b.life, step = Math.floor(b.age * 33), n = 7;
    const dx = b.x2 - b.x1, dy = b.y2 - b.y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const amp = Math.min(22, len * 0.12 + 4);
    for (let pass = 0; pass < 3; pass++) {
      ctx.globalAlpha = (1 - k) * (pass === 0 ? 0.22 : pass === 1 ? 0.8 : 1); ctx.strokeStyle = pass === 2 ? '#ffffff' : b.color; ctx.lineWidth = pass === 0 ? 9 : pass === 1 ? 3 : 1.2;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
      for (let i = 1; i < n; i++) {
        const t = i / n, j = hash1(b.seed + step * 13.7 + i * 7.1) * amp;
        ctx.lineTo(b.x1 + dx * t + nx * j, b.y1 + dy * t + ny * j);
      }
      ctx.lineTo(b.x2, b.y2); ctx.stroke();
      if (pass === 1 && b.forks) {
        for (let f = 0; f < b.forks; f++) {
          const t = (f + 1) / (b.forks + 1) * 0.8 + 0.1, i = Math.max(1, Math.round(t * n)), tt = i / n, j = hash1(b.seed + step * 13.7 + i * 7.1) * amp;
          const px = b.x1 + dx * tt + nx * j, py = b.y1 + dy * tt + ny * j, side = hash1(b.seed + f * 3.3) > 0 ? 1 : -1;
          const fx = px + dx * 0.18 + nx * side * len * 0.18, fy = py + dy * 0.18 + ny * side * len * 0.18;
          ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo((px + fx) / 2 + hash1(b.seed + step + f) * 6, (py + fy) / 2 + hash1(b.seed + step + f + 9) * 6); ctx.lineTo(fx, fy); ctx.stroke();
        }
      }
    }
  }

  _drawFloat(ctx, f) {
    const k = f.age / f.life;
    let pop = f.age < 0.13 ? 1 + 0.4 * (1 - f.age / 0.13) : 1;
    let text = f.text, alpha = 1, x = f.x, y = f.y, tilt = f.tilt;
    if (f.cnt) {
      if (f.fin) {
        const sa = f.age - f.finAge; pop = sa < 0.18 ? 1 + 0.5 * (1 - sa / 0.18) : 1;
        text = f.hits > 1 ? 'x' + f.hits + ' = ' + f.total : String(f.total); alpha = sa > 0.6 ? 1 - (sa - 0.6) / 0.3 : 1; tilt = f.hits > 1 ? -0.1 : 0;
      } else {
        text = String(Math.round(f.shown)); pop = 1 + Math.max(0, 0.25 * (1 - f.since / 0.12));
        x += snoise(this.nt * 40) * f.jit; y += snoise(this.nt * 40 + 9) * f.jit;
      }
    } else {
      if (f.slam) pop *= 1 + (f.slam - 1) * Math.max(0, 1 - f.age / 0.15);
      alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    }
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `bold ${Math.round(f.size * pop)}px Georgia, serif`;
    ctx.lineWidth = 5; ctx.strokeStyle = f.stroke;
    if (tilt) { ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.strokeText(text, 0, 0); ctx.fillStyle = f.color; ctx.fillText(text, 0, 0); ctx.restore(); }
    else { ctx.strokeText(text, x, y); ctx.fillStyle = f.color; ctx.fillText(text, x, y); }
  }

  drawFlash(ctx, W, H) { for (let i = 0; i < this.flashes.length; i++) { const f = this.flashes[i]; ctx.save(); ctx.globalAlpha = f.a * (1 - f.age / f.life); ctx.fillStyle = f.color; ctx.fillRect(0, 0, W, H); ctx.restore(); } }
}

const BURSTS = {
  spark: { n: 14, colors: ['#fff6c8', '#ffd24a', '#ff9a3c'], speed: 320, life: 0.45, size: 3, glow: true, shape: 'streak' },
  ember: { n: 12, colors: ['#E8571F', '#ffb347', '#ffe08a'], speed: 140, life: 0.9, size: 4.2, gravity: -140, drag: 0.8, glow: true, shape: 'ember', shimmer: true },
  blood: { n: 14, colors: ['#A3142F', '#c4223c', '#6d0a20'], speed: 260, life: 0.8, size: 5.5, gravity: 700, shape: 'droplet' },
  dust: { n: 10, colors: ['#8a8070', '#a99f8c'], speed: 120, life: 0.7, size: 5, gravity: -20, drag: 2, shape: 'glow' },
  ash: { n: 10, colors: ['#6b625a', '#8a8070', '#4a4440'], speed: 40, life: 2.2, size: 3, gravity: 18, drag: 1.4, shape: 'flake', spin: 5 },
  shard: { n: 10, colors: ['#F2C14E', '#fff3c4', '#cfa43a'], speed: 360, life: 0.8, size: 6, gravity: 900, shape: 'shard', spin: 14 },
  glass: { n: 16, colors: ['#cfe8ee', '#ffffff', '#9cc4cf'], speed: 400, life: 0.9, size: 5, gravity: 900, shape: 'shard', spin: 14 },
  coin: { n: 7, colors: ['#F2C14E', '#ffe38a'], speed: 300, life: 1.0, size: 6, gravity: 900, shape: 'coin' },
  hoard: { n: 8, colors: ['#B8922A', '#F2C14E', '#ffe38a'], speed: 300, life: 1.3, size: 6, gravity: 1100, drag: 0.3, shape: 'coin', bounce: true },
  flake: { n: 10, colors: ['#A0522D', '#d2691e', '#7a3e1d'], speed: 160, life: 0.9, size: 4, gravity: 300, shape: 'flake' },
  rust: { n: 10, colors: ['#8F4A2A', '#b5612f', '#5e3019'], speed: 150, life: 1.1, size: 5, gravity: 260, drag: 1, shape: 'flake', spin: 6 },
  zap: { n: 10, colors: ['#E8F542', '#ffffff'], speed: 380, life: 0.3, size: 3, glow: true, shape: 'streak' },
  static: { n: 8, colors: ['#D9E84A', '#ffffff'], speed: 340, life: 0.28, size: 2.6, glow: true, shape: 'streak', gravity: 0 },
  heal: { n: 12, colors: ['#7fcf8a', '#c9ffd4'], speed: 90, life: 1.0, size: 4, gravity: -120, glow: true },
  block: { n: 10, colors: ['#bcd0d8', '#ffffff', '#7fa0ad'], speed: 220, life: 0.5, size: 4, shape: 'streak', trail: false },
  echo: { n: 10, colors: ['#6CC6D6', '#d8f6fb'], speed: 150, life: 0.7, size: 4, glow: true, gravity: 0 },
  gild: { n: 14, colors: ['#F5E6A8', '#F2C14E', '#ffffff'], speed: 200, life: 0.9, size: 4, glow: true, gravity: -40 },
  gilded: { n: 10, colors: ['#EFD98F', '#F5E6A8', '#C9A227'], speed: 70, life: 1.8, size: 5, gravity: -34, drag: 1.1, shape: 'leaf', spin: 4, add: true },
  poisonTick: { n: 5, colors: ['#7fcf4a', '#b5f07a'], speed: 30, life: 1.0, size: 4, gravity: -95, drag: 1.2, shape: 'bubble', jitter: 24, add: true },
  burnTick: { n: 8, colors: ['#E8571F', '#ffb347'], speed: 60, life: 0.85, size: 3, gravity: -170, drag: 0.8, shape: 'ember', jitter: 20, shimmer: true, glow: true },
};
