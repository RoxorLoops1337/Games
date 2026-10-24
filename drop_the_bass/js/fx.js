// fx.js: particles, rings, floating text, beams and screen shake for the battle view. Pure canvas, no DOM.
// All randomness is from a tiny local LCG so replays of the same events look the same.
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const MAX_P = 380, MAX_F = 60;

export class Fx {
  constructor() {
    this.parts = []; this.rings = []; this.floats = []; this.lines = []; this.cones = [];
    this.shake = 0; this.flash = 0; this.flashColor = '#fff'; this.t = 0; this.rumble = 0;
  }
  clear() { this.parts.length = 0; this.rings.length = 0; this.floats.length = 0; this.lines.length = 0; this.cones.length = 0; this.shake = 0; this.flash = 0; }
  addShake(v) { if (this.noShake) return; this.shake = Math.min(18, Math.max(this.shake, v)); }
  doFlash(color, v = 0.5) { this.flash = Math.max(this.flash, v); this.flashColor = color; }
  burst(x, y, color, n = 10, o = {}) {
    const sp = o.speed || 120, life = o.life || 0.5, size = o.size || 3.2;
    for (let i = 0; i < n && this.parts.length < MAX_P; i++) {
      const a = o.dir != null ? o.dir + (rnd() - 0.5) * (o.spread || 1.2) : rnd() * Math.PI * 2;
      const v = sp * (0.35 + rnd() * 0.9);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), life: life * (0.6 + rnd() * 0.6), max: life, size: size * (0.6 + rnd() * 0.8), color: Array.isArray(color) ? color[(rnd() * color.length) | 0] : color, g: o.g == null ? 120 : o.g, shape: o.shape || 'dot' });
    }
  }
  confetti(x, y, n = 30) {
    const cols = ['#ff5fb0', '#9dff3a', '#2fe6ff', '#ffc83d', '#b66bff', '#ff9a3c'];
    this.burst(x, y, cols, n, { speed: 260, life: 1.2, size: 4, up: 160, g: 380, shape: 'rect', spread: 6.3 });
  }
  ring(x, y, r, color, o = {}) {
    if (this.rings.length < 40) this.rings.push({ x, y, r0: o.r0 || 4, r, color, t: 0, life: o.life || 0.4, w: o.w || 4, fill: !!o.fill });
  }
  floater(x, y, text, color = '#fff', size = 16, o = {}) {
    if (this.floats.length >= MAX_F) this.floats.shift();
    this.floats.push({ x, y, text: String(text), color, size, t: 0, life: o.life || 0.8, vy: o.vy == null ? -42 : o.vy, vx: o.vx || 0, bold: o.bold !== false, outline: o.outline || '#12082b' });
  }
  line(x1, y1, x2, y2, color, w = 6, life = 0.16) { if (this.lines.length < 40) this.lines.push({ pts: [{ x: x1, y: y1 }, { x: x2, y: y2 }], color, w, t: 0, life }); }
  chain(pts, color, life = 0.22) { if (this.lines.length < 40) this.lines.push({ pts, color, w: 5, t: 0, life, zig: true }); }
  cone(x, y, ang, range, spread, color) { if (this.cones.length < 12) this.cones.push({ x, y, ang, range, spread, color, t: 0, life: 0.26 }); }
  update(dt) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt; if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.2;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; if (r.t >= r.life) this.rings.splice(i, 1); }
    for (let i = this.floats.length - 1; i >= 0; i--) { const f = this.floats[i]; f.t += dt; f.y += f.vy * dt; f.x += f.vx * dt; f.vy *= 1 - dt * 1.5; if (f.t >= f.life) this.floats.splice(i, 1); }
    for (let i = this.lines.length - 1; i >= 0; i--) { const l = this.lines[i]; l.t += dt; if (l.t >= l.life) this.lines.splice(i, 1); }
    for (let i = this.cones.length - 1; i >= 0; i--) { const c = this.cones[i]; c.t += dt; if (c.t >= c.life) this.cones.splice(i, 1); }
  }
  shakeOffset() {
    if (this.shake <= 0.05) return [0, 0];
    return [(rnd() - 0.5) * this.shake, (rnd() - 0.5) * this.shake];
  }
  // world-space effects (under the floaters)
  drawWorld(ctx) {
    ctx.save();
    for (const c of this.cones) {
      const k = c.t / c.life; ctx.globalAlpha = (1 - k) * 0.55;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.range * (0.4 + 0.6 * k), c.ang - c.spread, c.ang + c.spread); ctx.closePath();
      ctx.fillStyle = c.color; ctx.fill();
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const l of this.lines) {
      const k = l.t / l.life; ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.moveTo(l.pts[0].x, l.pts[0].y);
      for (let i = 1; i < l.pts.length; i++) {
        const a = l.pts[i - 1], b = l.pts[i];
        if (l.zig) { const mx = (a.x + b.x) / 2 + (rnd() - 0.5) * 14, my = (a.y + b.y) / 2 + (rnd() - 0.5) * 14; ctx.lineTo(mx, my); }
        ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = l.w * 0.5 + 1; ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.55; ctx.strokeStyle = l.color; ctx.lineWidth = l.w * (1 + k * 0.5); ctx.stroke();
    }
    for (const r of this.rings) {
      const k = r.t / r.life, rad = r.r0 + (r.r - r.r0) * (1 - Math.pow(1 - k, 2));
      ctx.globalAlpha = (1 - k) * (r.fill ? 0.35 : 0.9);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      if (r.fill) { ctx.fillStyle = r.color; ctx.fill(); }
      ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - k * 0.6); ctx.stroke();
    }
    for (const p of this.parts) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillStyle = p.color;
      if (p.shape === 'rect') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.x * 0.1 + p.y * 0.07); ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
  drawFloaters(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of this.floats) {
      const k = f.t / f.life;
      const pop = k < 0.15 ? 0.7 + k / 0.15 * 0.5 : 1.2 - Math.min(0.2, (k - 0.15) * 0.4);
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = (f.bold ? '900 ' : '700 ') + Math.round(f.size * pop) + 'px "Trebuchet MS", system-ui, sans-serif';
      ctx.lineWidth = Math.max(3, f.size * 0.28); ctx.strokeStyle = f.outline; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
  drawFlash(ctx, w, h) {
    if (this.flash <= 0.01) return;
    ctx.save(); ctx.globalAlpha = Math.min(0.8, this.flash); ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, w, h); ctx.restore();
  }
}
