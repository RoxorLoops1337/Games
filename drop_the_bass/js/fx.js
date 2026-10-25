// fx.js: the battle's visual effects layer. Additive glow sprites, dynamic board lights, streak sparks, ribbon trails, chromatic shockwaves,
// light pillars, ray bursts, an aurora ripple, weighted combat text, screen shake and punch, and a cheap screen-space post pass
// (bloom from a downscaled copy, colour grade, vignette, low-health pulse, chromatic fringe, speed lines).
// Pure canvas. Local LCG instead of Math.random so the same events look the same. Safe in node with a mock ctx (sprites fall back to arcs).
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const MAX_P = 420, MAX_F = 60, MAX_L = 28, MAX_T = 40;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c.getContext && c.getContext('2d') ? c : null;
}
const hexRgb = (hex) => {
  if (typeof hex !== 'string' || hex[0] !== '#') return [255, 255, 255];
  const v = parseInt(hex.length === 4 ? hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex.slice(1, 7), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

// ---- glow sprites: a soft white-hot core fading through the colour to nothing. One canvas per colour, drawn scaled with 'lighter'.
const glowCache = new Map();
export function glowSprite(color) {
  let g = glowCache.get(color);
  if (g !== undefined) return g;
  const c = makeCanvas(64, 64);
  if (c) {
    const x = c.getContext('2d'), [r, gg, b] = hexRgb(color);
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.18, 'rgba(' + r + ',' + gg + ',' + b + ',0.85)');
    gr.addColorStop(0.5, 'rgba(' + r + ',' + gg + ',' + b + ',0.28)'); gr.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  }
  glowCache.set(color, c || null);
  return c || null;
}
// draws the glow centred at (x,y) with radius r (additive). Falls back to a flat arc without canvases.
export function drawGlow(ctx, x, y, r, color, alpha = 1) {
  const s = glowSprite(color);
  ctx.globalAlpha = alpha;
  if (s) ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  else { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fill(); }
}

export class Fx {
  constructor() {
    this.parts = []; this.rings = []; this.floats = []; this.lines = []; this.cones = []; this.lights = []; this.pillars = []; this.rays = []; this.auroras = [];
    this.trails = new Map();
    this.shake = 0; this.flash = 0; this.flashColor = '#fff'; this.t = 0; this.rumble = 0;
    this.chroma = 0; this.punch = 0; this.noShake = false;
    // post state
    this.slowAcc = 0; this.bloomOn = true; this.forceBloom = false; this.frames = 0;
    this._low = null; this._vig = null; this._vigKey = ''; this._hot = null; this._hotKey = '';
  }
  clear() {
    this.parts.length = 0; this.rings.length = 0; this.floats.length = 0; this.lines.length = 0; this.cones.length = 0; this.lights.length = 0;
    this.pillars.length = 0; this.rays.length = 0; this.auroras.length = 0; this.trails.clear(); this.shake = 0; this.flash = 0; this.chroma = 0; this.punch = 0;
  }
  addShake(v) { if (this.noShake) return; this.shake = Math.min(18, Math.max(this.shake, v)); this.punch = Math.max(this.punch, Math.min(1, v / 18)); }
  doFlash(color, v = 0.5) { this.flash = Math.max(this.flash, v); this.flashColor = color; }
  addChroma(v) { if (!this.noShake) this.chroma = Math.max(this.chroma, v); }

  // ------------------------------------------------------------------ emitters
  burst(x, y, color, n = 10, o = {}) {
    const sp = o.speed || 120, life = o.life || 0.5, size = o.size || 3.2;
    for (let i = 0; i < n && this.parts.length < MAX_P; i++) {
      const a = o.dir != null ? o.dir + (rnd() - 0.5) * (o.spread || 1.2) : rnd() * TAU;
      const v = sp * (0.35 + rnd() * 0.9);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), life: life * (0.6 + rnd() * 0.6), max: life, size: size * (0.6 + rnd() * 0.8), color: Array.isArray(color) ? color[(rnd() * color.length) | 0] : color, g: o.g == null ? 120 : o.g, shape: o.shape || 'glow', drag: o.drag == null ? 1.2 : o.drag });
    }
  }
  // streaking sparks: bright, fast, drawn as motion streaks
  sparks(x, y, color, n = 8, o = {}) { this.burst(x, y, color, n, Object.assign({ speed: 260, life: 0.32, size: 2, g: 260, shape: 'spark', drag: 2.2 }, o)); }
  confetti(x, y, n = 30) {
    const cols = ['#ff5fb0', '#9dff3a', '#2fe6ff', '#ffc83d', '#b66bff', '#ff9a3c'];
    this.burst(x, y, cols, n, { speed: 260, life: 1.3, size: 4, up: 160, g: 380, shape: 'rect', spread: 6.3 });
  }
  ring(x, y, r, color, o = {}) {
    if (this.rings.length < 44) this.rings.push({ x, y, r0: o.r0 || 4, r, color, t: 0, life: o.life || 0.4, w: o.w || 4, fill: !!o.fill, chroma: o.chroma !== false && r > 90 });
  }
  floater(x, y, text, color = '#fff', size = 16, o = {}) {
    if (this.floats.length >= MAX_F) this.floats.shift();
    this.floats.push({ x, y, text: String(text), color, size, t: 0, life: o.life || 0.8, vy: o.vy == null ? -42 : o.vy, vx: o.vx || 0, bold: o.bold !== false, outline: o.outline || '#12082b', crit: !!o.crit, seed: rnd() });
  }
  line(x1, y1, x2, y2, color, w = 6, life = 0.16) { if (this.lines.length < 40) this.lines.push({ pts: [{ x: x1, y: y1 }, { x: x2, y: y2 }], color, w, t: 0, life }); }
  chain(pts, color, life = 0.22) { if (this.lines.length < 40) this.lines.push({ pts, color, w: 5, t: 0, life, zig: true }); }
  cone(x, y, ang, range, spread, color) { if (this.cones.length < 12) this.cones.push({ x, y, ang, range, spread, color, t: 0, life: 0.26 }); }
  // a light that brightens the board around it for a moment
  light(x, y, r, color, life = 0.2, a = 0.6) { if (this.lights.length >= MAX_L) this.lights.shift(); this.lights.push({ x, y, r, color, t: 0, life, a }); }
  muzzle(x, y, ang, color, size = 1) {
    const fx = x + Math.cos(ang) * 26 * size, fy = y + Math.sin(ang) * 26 * size;
    this.light(fx, fy, 54 * size, color, 0.12, 0.55);
    this.sparks(fx, fy, [color, '#fff'], 2, { dir: ang, spread: 0.5, speed: 220, life: 0.14 });
    if (this.parts.length < MAX_P) this.parts.push({ x: fx, y: fy, vx: 0, vy: 0, life: 0.07, max: 0.07, size: 13 * size, color, g: 0, shape: 'flare', ang, drag: 0 });
  }
  pillar(x, y, color, h = 220, life = 0.7) { if (this.pillars.length < 8) this.pillars.push({ x, y, color, h, t: 0, life }); }
  raysBurst(x, y, color, r = 300, life = 0.9, n = 16) { if (this.rays.length < 4) this.rays.push({ x, y, color, r, t: 0, life, n }); }
  aurora(color, life = 1.8) { if (this.auroras.length < 3) this.auroras.push({ color, t: 0, life }); }
  // ribbon trail for a moving thing (projectile id). Call every frame with its position.
  trail(id, x, y, color, w = 5) {
    let tr = this.trails.get(id);
    if (!tr) { if (this.trails.size >= MAX_T) return; tr = { pts: [], color, w, idle: 0 }; this.trails.set(id, tr); }
    tr.idle = 0; tr.pts.push({ x, y, t: this.t }); if (tr.pts.length > 14) tr.pts.shift();
  }

  update(dt) {
    this.t += dt;
    // frame-time watchdog for the bloom pass: three slow seconds in a row switch it off
    this.frames++;
    if (dt > 1 / 38) this.slowAcc = Math.min(6, this.slowAcc + dt * 2); else this.slowAcc = Math.max(0, this.slowAcc - dt);
    if (this.slowAcc > 3 && !this.forceBloom) this.bloomOn = false;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.chroma = Math.max(0, this.chroma - dt * 2.2);
    this.punch = Math.max(0, this.punch - dt * 4);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt; if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; const d = 1 - dt * p.drag; p.vx *= d; p.vy *= p.g ? 1 : d;
    }
    const age = (arr) => { for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t >= arr[i].life) arr.splice(i, 1); } };
    age(this.rings); age(this.lines); age(this.cones); age(this.lights); age(this.pillars); age(this.rays); age(this.auroras);
    for (let i = this.floats.length - 1; i >= 0; i--) { const f = this.floats[i]; f.t += dt; f.y += f.vy * dt; f.x += f.vx * dt; f.vy *= 1 - dt * 1.5; if (f.t >= f.life) this.floats.splice(i, 1); }
    for (const [id, tr] of this.trails) { tr.idle += dt; while (tr.pts.length && this.t - tr.pts[0].t > 0.22) tr.pts.shift(); if (tr.idle > 0.3 && !tr.pts.length) this.trails.delete(id); }
  }
  shakeOffset() {
    if (this.shake <= 0.05) return [0, 0];
    return [(rnd() - 0.5) * this.shake, (rnd() - 0.5) * this.shake];
  }

  // ------------------------------------------------------------------ world layer (under the HUD, inside the shaken board transform)
  drawWorld(ctx) {
    ctx.save();
    // 1) soft ground glows and light pillars
    ctx.globalCompositeOperation = 'lighter';
    for (const L of this.lights) { const k = 1 - L.t / L.life; drawGlow(ctx, L.x, L.y, L.r * (0.7 + 0.5 * (1 - k)), L.color, L.a * k * k); }
    for (const P of this.pillars) {
      const k = P.t / P.life, a = (1 - k) * (k < 0.15 ? k / 0.15 : 1), w = 34 * (1 - k * 0.6);
      const g = ctx.createLinearGradient(0, P.y - P.h, 0, P.y + 10);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, P.color); g.addColorStop(1, '#ffffff');
      ctx.globalAlpha = a * 0.55; ctx.fillStyle = g; ctx.fillRect(P.x - w / 2, P.y - P.h, w, P.h + 10);
      drawGlow(ctx, P.x, P.y, 60 * (1 - k * 0.4), P.color, a * 0.9);
    }
    ctx.globalCompositeOperation = 'source-over';
    // 2) cones, beams, chains
    for (const c of this.cones) {
      const k = c.t / c.life; ctx.globalAlpha = (1 - k) * 0.5;
      const rr = c.range * (0.4 + 0.6 * k);
      const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, rr); g.addColorStop(0, '#fff'); g.addColorStop(0.35, c.color); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, rr, c.ang - c.spread, c.ang + c.spread); ctx.closePath();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const l of this.lines) {
      const k = l.t / l.life, a = 1 - k;
      ctx.beginPath(); ctx.moveTo(l.pts[0].x, l.pts[0].y);
      for (let i = 1; i < l.pts.length; i++) {
        const A = l.pts[i - 1], B = l.pts[i];
        if (l.zig) { const mx = (A.x + B.x) / 2 + (rnd() - 0.5) * 16, my = (A.y + B.y) / 2 + (rnd() - 0.5) * 16; ctx.lineTo(mx, my); }
        ctx.lineTo(B.x, B.y);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.35; ctx.strokeStyle = l.color; ctx.lineWidth = l.w * (2.6 + k); ctx.stroke();
      ctx.globalAlpha = a * 0.85; ctx.strokeStyle = l.color; ctx.lineWidth = l.w * (1.2 + k * 0.4); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, l.w * 0.45); ctx.stroke();
      const e = l.pts[l.pts.length - 1]; drawGlow(ctx, e.x, e.y, 18 + l.w * 1.5, l.color, a * 0.8); drawGlow(ctx, l.pts[0].x, l.pts[0].y, 14, l.color, a * 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 3) trails
    ctx.globalCompositeOperation = 'lighter';
    for (const tr of this.trails.values()) {
      const n = tr.pts.length; if (n < 2) continue;
      for (let i = 1; i < n; i++) {
        const A = tr.pts[i - 1], B = tr.pts[i], k = i / n, age = 1 - clamp((this.t - B.t) / 0.22, 0, 1);
        ctx.globalAlpha = k * age * 0.75; ctx.strokeStyle = tr.color; ctx.lineWidth = tr.w * k * 1.6;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
    }
    // 4) shockwaves (chromatic: a cyan and a magenta copy slightly apart, white core on top)
    for (const r of this.rings) {
      const k = r.t / r.life, e = 1 - Math.pow(1 - k, 2.2), rad = r.r0 + (r.r - r.r0) * e, a = 1 - k;
      if (r.fill) { drawGlow(ctx, r.x, r.y, rad * 1.05, r.color, a * 0.5); }
      ctx.lineWidth = r.w * (1 - k * 0.6);
      if (r.chroma) {
        ctx.globalAlpha = a * 0.55; ctx.strokeStyle = '#2fe6ff'; ctx.beginPath(); ctx.arc(r.x, r.y, rad * 0.985, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#ff3fa0'; ctx.beginPath(); ctx.arc(r.x, r.y, rad * 1.015, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = a * 0.9; ctx.strokeStyle = r.color; ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.35); ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    }
    // 5) ray bursts
    for (const R of this.rays) {
      const k = R.t / R.life, a = (1 - k) * (k < 0.1 ? k / 0.1 : 1), len = R.r * (0.3 + 0.7 * Math.min(1, k * 3));
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = R.color;
      for (let i = 0; i < R.n; i++) {
        const ang = (i / R.n) * TAU + k * 0.6, w = 0.07 + 0.03 * Math.sin(i * 7.3);
        ctx.beginPath(); ctx.moveTo(R.x, R.y); ctx.lineTo(R.x + Math.cos(ang - w) * len, R.y + Math.sin(ang - w) * len); ctx.lineTo(R.x + Math.cos(ang + w) * len, R.y + Math.sin(ang + w) * len); ctx.closePath(); ctx.fill();
      }
      drawGlow(ctx, R.x, R.y, R.r * 0.45 * (1 - k * 0.5), '#ffffff', a * 0.8);
    }
    // 6) particles
    for (const p of this.parts) {
      const k = p.life / p.max;
      if (p.shape === 'rect') {
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.x * 0.1 + p.y * 0.07 + this.t * 5); ctx.scale(1, Math.abs(Math.sin(this.t * 9 + p.x)) * 0.8 + 0.2); ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
      } else if (p.shape === 'spark') {
        const sp = Math.hypot(p.vx, p.vy), len = Math.min(26, 3 + sp * 0.07), ux = sp ? p.vx / sp : 0, uy = sp ? p.vy / sp : 0;
        ctx.globalAlpha = Math.min(1, k * 1.8); ctx.strokeStyle = p.color; ctx.lineWidth = p.size * (0.6 + 0.6 * k);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * len, p.y - uy * len); ctx.stroke();
        ctx.globalAlpha = Math.min(1, k * 1.8) * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, p.size * 0.4); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * len * 0.5, p.y - uy * len * 0.5); ctx.stroke();
      } else if (p.shape === 'flare') {
        const r = p.size * (0.6 + 0.8 * k);
        drawGlow(ctx, p.x, p.y, r * 1.4, p.color, k);
        ctx.globalAlpha = k * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const a = p.ang + i * Math.PI / 2 + 0.4; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * r * (i % 2 ? 0.9 : 1.5), p.y + Math.sin(a) * r * (i % 2 ? 0.9 : 1.5)); }
        ctx.stroke();
      } else drawGlow(ctx, p.x, p.y, p.size * (1.5 + 1.6 * k), p.color, Math.min(1, k * 1.6));
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ combat text: overshoot pop, thick outline, crits get a burst behind them
  drawFloaters(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of this.floats) {
      const k = f.t / f.life;
      const pop = k < 0.18 ? 0.35 + easeOutBack(k / 0.18) * 0.75 : 1.1 - Math.min(0.12, (k - 0.18) * 0.2);
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const size = Math.round(f.size * pop);
      let x = f.x, y = f.y;
      if (f.crit && k < 0.3) { x += (f.seed - 0.5) * 4 * (1 - k / 0.3); y += (rnd() - 0.5) * 3; }
      if (f.crit) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, x, y, size * 1.7, f.color, a * 0.55 * (1 - k)); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = a;
      ctx.font = (f.bold ? '900 ' : '700 ') + size + 'px "Trebuchet MS", system-ui, sans-serif';
      ctx.lineWidth = Math.max(3.5, size * 0.3); ctx.strokeStyle = f.outline; ctx.strokeText(f.text, x, y + 1.5);
      ctx.fillStyle = f.color; ctx.fillText(f.text, x, y);
      if (size >= 15) { ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#fff'; ctx.save(); ctx.beginPath(); ctx.rect(x - size * 3, y - size * 0.6, size * 6, size * 0.55); ctx.clip(); ctx.fillText(f.text, x, y); ctx.restore(); }
    }
    ctx.restore();
  }
  // aurora ripple across the whole board (Siren Song) and other full-screen light, drawn in logical space
  drawScreenLight(ctx, W, H) {
    if (!this.auroras.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const A of this.auroras) {
      const k = A.t / A.life, a = (1 - k) * Math.min(1, k * 6);
      for (let i = 0; i < 4; i++) {
        const y0 = H * (0.12 + i * 0.22) + Math.sin(A.t * 2.4 + i * 1.7) * 40 + k * 90;
        const g = ctx.createLinearGradient(0, y0 - 90, 0, y0 + 90);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, A.color); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = a * 0.22; ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, y0 - 90);
        for (let x = 0; x <= W; x += 54) ctx.lineTo(x, y0 - 90 + Math.sin(x * 0.012 + A.t * 3 + i) * 28);
        for (let x = W; x >= 0; x -= 54) ctx.lineTo(x, y0 + 90 + Math.sin(x * 0.012 + A.t * 3 + i + 1) * 28);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }
  speedLines(ctx, W, H, speed) {
    if (speed < 2) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    const n = speed >= 3 ? 16 : 8;
    for (let i = 0; i < n; i++) {
      const k = (this.t * (speed >= 3 ? 2.6 : 1.7) + i * 0.137) % 1, x = ((i * 97.3) % 1) * W, len = 70 + (i % 5) * 28, y = (k * (H + 200)) - 100;
      ctx.globalAlpha = 0.07 + 0.07 * Math.sin(k * Math.PI); ctx.lineWidth = 1.5 + (i % 3);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ screen-space post pass (device pixels). o: { cw, ch, dpr, accent, hp, beat, pulse }
  post(ctx, o) {
    const cw = o.cw * o.dpr, ch = o.ch * o.dpr;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const canvas = ctx.canvas;
    const real = canvas && canvas.width > 8 && typeof ctx.drawImage === 'function' && canvas.getContext;
    const doWorld = !o.stage || o.stage === 'world', doGrade = !o.stage || o.stage === 'grade';
    // bloom: shrink the frame, square it (keeps the brights), stretch it back with 'screen'. Bilinear stretch = a free blur.
    if (doWorld && real && this.bloomOn && !o.reduce) {
      const lw = Math.max(64, Math.round(cw / 6)), lh = Math.max(64, Math.round(ch / 6));
      if (!this._low || this._low.width !== lw || this._low.height !== lh) this._low = makeCanvas(lw, lh);
      const low = this._low;
      if (low) {
        const lc = low.getContext('2d');
        lc.globalCompositeOperation = 'copy'; lc.imageSmoothingEnabled = true; lc.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, lw, lh);
        lc.globalCompositeOperation = 'multiply'; lc.drawImage(low, 0, 0); lc.drawImage(low, 0, 0);
        lc.globalCompositeOperation = 'source-over';
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55 + 0.25 * (o.beat || 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(low, 0, 0, lw, lh, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    }
    // chromatic fringe on hits and big moments: two ghost copies pushed apart, tinted by the edges
    if (doWorld && real && this.chroma > 0.02 && !o.reduce) {
      const d = Math.min(14, this.chroma * 14) * o.dpr;
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = Math.min(0.5, this.chroma * 0.6);
      ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, d, 0, canvas.width, canvas.height);
      ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, -d, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const e = Math.min(1, this.chroma * 1.3);
      const gl = ctx.createLinearGradient(0, 0, cw * 0.18, 0); gl.addColorStop(0, 'rgba(47,230,255,' + (0.32 * e) + ')'); gl.addColorStop(1, 'rgba(47,230,255,0)');
      ctx.fillStyle = gl; ctx.fillRect(0, 0, cw * 0.18, ch);
      const gr = ctx.createLinearGradient(cw, 0, cw * 0.82, 0); gr.addColorStop(0, 'rgba(255,63,160,' + (0.32 * e) + ')'); gr.addColorStop(1, 'rgba(255,63,160,0)');
      ctx.fillStyle = gr; ctx.fillRect(cw * 0.82, 0, cw * 0.18, ch);
    }
    if (!doGrade) { ctx.restore(); return; }
    // colour grade: a whisper of the stage colour over everything, then a cached vignette
    if (o.accent) { ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.1; ctx.fillStyle = o.accent; ctx.fillRect(0, 0, cw, ch); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    const vk = Math.round(cw) + 'x' + Math.round(ch);
    if (this._vigKey !== vk) {
      this._vigKey = vk; this._vig = makeCanvas(Math.max(2, Math.round(cw / 4)), Math.max(2, Math.round(ch / 4)));
      if (this._vig) {
        const vx = this._vig.getContext('2d'), w = this._vig.width, h = this._vig.height;
        const g = vx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.hypot(w, h) * 0.58);
        g.addColorStop(0, 'rgba(6,2,20,0)'); g.addColorStop(1, 'rgba(6,2,20,0.62)'); vx.fillStyle = g; vx.fillRect(0, 0, w, h);
      }
    }
    if (this._vig && real) ctx.drawImage(this._vig, 0, 0, this._vig.width, this._vig.height, 0, 0, cw, ch);
    else { const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.58); g.addColorStop(0, 'rgba(6,2,20,0)'); g.addColorStop(1, 'rgba(6,2,20,0.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); }
    // low stage health: a slow red heartbeat creeping in from the edges
    if (o.hp != null && o.hp < 0.4) {
      const k = (0.4 - o.hp) / 0.4, beat = 0.5 + 0.5 * Math.sin(this.t * (3 + k * 4));
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.56);
      g.addColorStop(0, 'rgba(255,30,60,0)'); g.addColorStop(1, 'rgba(255,30,60,' + (0.22 + 0.4 * k * beat) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }
    ctx.restore();
  }
  drawFlash(ctx, w, h) {
    if (this.flash <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.75, this.flash);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, this.flashColor); g.addColorStop(1, this.flashColor);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
  }
}
