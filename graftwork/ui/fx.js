// Particles, floating numbers, screen shake, hit-stop, flashes. One Fx per scene; the scene calls fx.update(dt) and fx.draw(ctx).
import { rgba } from './core.js';

// Global accessibility switches, synced from meta.settings by main.js each frame.
export const FX_OPTS = { shake: true, reduced: false };

export class Fx {
  constructor() { this.p = []; this.floats = []; this.bolts = []; this.trauma = 0; this.stop = 0; this.flashes = []; this.rings = []; this.slow = 0; this.slowScale = 1; }
  // generic emitter. o: {x,y,n,color|colors[],speed,spread(rad),angle,life,size,gravity,drag,glow,shape:'dot'|'shard'|'streak'|'flake'|'coin', spin}
  emit(o) {
    const n = FX_OPTS.reduced ? Math.ceil((o.n || 8) / 2) : (o.n || 8);
    for (let i = 0; i < n; i++) {
      const a = (o.angle === undefined ? Math.random() * Math.PI * 2 : o.angle + (Math.random() - 0.5) * (o.spread === undefined ? Math.PI * 2 : o.spread));
      const sp = (o.speed || 200) * (0.4 + Math.random() * 0.8);
      this.p.push({
        x: o.x + (Math.random() - 0.5) * (o.jitter || 0), y: o.y + (Math.random() - 0.5) * (o.jitter || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.7), age: 0, size: (o.size || 4) * (0.6 + Math.random() * 0.8), g: o.gravity === undefined ? 400 : o.gravity,
        drag: o.drag === undefined ? 0.5 : o.drag, color: o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : (o.color || '#fff'), glow: !!o.glow,
        shape: o.shape || 'dot', rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * (o.spin === undefined ? 8 : o.spin), shrink: o.shrink !== false,
      });
    }
  }
  burst(x, y, kind = 'spark', o = {}) {
    const k = {
      spark: { n: 14, colors: ['#fff6c8', '#ffd24a', '#ff9a3c'], speed: 320, life: 0.45, size: 3, glow: true, shape: 'streak' },
      ember: { n: 12, colors: ['#ff6a2b', '#ffb347', '#ffe08a'], speed: 140, life: 0.9, size: 3, gravity: -140, glow: true },
      blood: { n: 14, colors: ['#9E0F2E', '#c4223c', '#6d0a20'], speed: 260, life: 0.7, size: 4, gravity: 700 },
      dust: { n: 10, colors: ['#8a8070', '#a99f8c'], speed: 120, life: 0.7, size: 5, gravity: -20, drag: 2 },
      shard: { n: 10, colors: ['#F2C14E', '#fff3c4', '#cfa43a'], speed: 360, life: 0.8, size: 6, gravity: 900, shape: 'shard', spin: 14 },
      glass: { n: 16, colors: ['#cfe8ee', '#ffffff', '#9cc4cf'], speed: 400, life: 0.9, size: 5, gravity: 900, shape: 'shard', spin: 14 },
      coin: { n: 7, colors: ['#F2C14E', '#ffe38a'], speed: 300, life: 1.0, size: 6, gravity: 900, shape: 'coin' },
      flake: { n: 10, colors: ['#A0522D', '#d2691e', '#7a3e1d'], speed: 160, life: 0.9, size: 4, gravity: 300, shape: 'flake' },
      zap: { n: 10, colors: ['#E8F542', '#ffffff'], speed: 380, life: 0.3, size: 3, glow: true, shape: 'streak' },
      heal: { n: 12, colors: ['#7fcf8a', '#c9ffd4'], speed: 90, life: 1.0, size: 4, gravity: -120, glow: true },
      block: { n: 10, colors: ['#bcd0d8', '#ffffff', '#7fa0ad'], speed: 220, life: 0.5, size: 4, shape: 'streak' },
      echo: { n: 10, colors: ['#7FD1E0', '#d8f6fb'], speed: 150, life: 0.7, size: 4, glow: true, gravity: 0 },
      gild: { n: 14, colors: ['#F5E6A8', '#F2C14E', '#ffffff'], speed: 200, life: 0.9, size: 4, glow: true, gravity: -40 },
    }[kind] || {};
    this.emit({ x, y, ...k, ...o });
  }
  float(text, x, y, o = {}) { this.floats.push({ text: String(text), x, y, vy: o.vy === undefined ? -60 : o.vy, life: o.life || 1.1, age: 0, color: o.color || '#fff', size: o.size || 30, big: !!o.big, stroke: o.stroke || '#1a1614' }); }
  bolt(x1, y1, x2, y2, color = '#E8F542') { this.bolts.push({ x1, y1, x2, y2, color, age: 0, life: 0.18, seed: Math.random() * 1000 }); }
  ring(x, y, color = '#fff', r = 120, life = 0.5) { this.rings.push({ x, y, color, r, age: 0, life }); }
  shake(amount) { if (!FX_OPTS.shake || FX_OPTS.reduced) return; this.trauma = Math.min(1, this.trauma + amount); }
  hitstop(ms) { if (FX_OPTS.reduced) return; this.stop = Math.max(this.stop, ms / 1000); }
  slowmo(scale, ms) { if (FX_OPTS.reduced) return; this.slow = ms / 1000; this.slowScale = scale; }
  flash(color = '#fff', a = 0.4, life = 0.25) { if (FX_OPTS.reduced) a *= 0.35; this.flashes.push({ color, a, age: 0, life }); }
  // returns the effective dt (0 while hit-stopped, scaled in slow-mo)
  update(dt) {
    if (this.stop > 0) { this.stop -= dt; return 0; }
    let d = dt;
    if (this.slow > 0) { this.slow -= dt; d = dt * this.slowScale; }
    for (const q of this.p) { q.age += d; q.vy += q.g * d; const dr = Math.max(0, 1 - q.drag * d); q.vx *= dr; q.vy *= dr; q.x += q.vx * d; q.y += q.vy * d; q.rot += q.spin * d; }
    this.p = this.p.filter((q) => q.age < q.life);
    for (const f of this.floats) { f.age += d; f.y += f.vy * d; f.vy *= 0.96; }
    this.floats = this.floats.filter((f) => f.age < f.life);
    for (const b of this.bolts) b.age += d; this.bolts = this.bolts.filter((b) => b.age < b.life);
    for (const r of this.rings) r.age += d; this.rings = this.rings.filter((r) => r.age < r.life);
    for (const f of this.flashes) f.age += d; this.flashes = this.flashes.filter((f) => f.age < f.life);
    this.trauma = Math.max(0, this.trauma - d * 1.6);
    return d;
  }
  shakeOffset() { const s = this.trauma * this.trauma * 14; return { x: (Math.random() - 0.5) * 2 * s, y: (Math.random() - 0.5) * 2 * s }; }
  draw(ctx) {
    ctx.save();
    for (const r of this.rings) { const k = r.age / r.life; ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * k, 0, 6.283); ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (const q of this.p) {
      const k = q.age / q.life; const a = 1 - k * k; const s = q.shrink ? q.size * (1 - k * 0.6) : q.size;
      ctx.globalAlpha = a; ctx.fillStyle = q.color;
      if (q.glow) { ctx.shadowColor = q.color; ctx.shadowBlur = 10; }
      if (q.shape === 'streak') { ctx.strokeStyle = q.color; ctx.lineWidth = Math.max(1, s * 0.6); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04); ctx.stroke(); }
      else if (q.shape === 'shard') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.beginPath(); ctx.moveTo(-s, -s * 0.4); ctx.lineTo(s, 0); ctx.lineTo(-s * 0.3, s * 0.7); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else if (q.shape === 'coin') { ctx.save(); ctx.translate(q.x, q.y); ctx.scale(Math.abs(Math.cos(q.rot)) + 0.15, 1); ctx.beginPath(); ctx.arc(0, 0, s, 0, 6.283); ctx.fill(); ctx.restore(); }
      else if (q.shape === 'flake') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-s, -s * 0.5, s * 2, s); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(q.x, q.y, s, 0, 6.283); ctx.fill(); }
      ctx.shadowBlur = 0;
    }
    for (const b of this.bolts) {
      const k = b.age / b.life; ctx.globalAlpha = 1 - k; ctx.strokeStyle = b.color; ctx.lineWidth = 3; ctx.shadowColor = b.color; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
      const n = 7; for (let i = 1; i < n; i++) { const t = i / n; ctx.lineTo(b.x1 + (b.x2 - b.x1) * t + Math.sin(b.seed + i * 7.1 + b.age * 90) * 18, b.y1 + (b.y2 - b.y1) * t + Math.cos(b.seed + i * 5.3 + b.age * 90) * 18); }
      ctx.lineTo(b.x2, b.y2); ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    for (const f of this.floats) {
      const k = f.age / f.life; const pop = k < 0.12 ? 1 + (0.4 * (1 - k / 0.12)) : 1; ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = `bold ${Math.round(f.size * pop)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = f.stroke; ctx.lineJoin = 'round'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
  drawFlash(ctx, W, H) { for (const f of this.flashes) { ctx.save(); ctx.globalAlpha = f.a * (1 - f.age / f.life); ctx.fillStyle = f.color; ctx.fillRect(0, 0, W, H); ctx.restore(); } }
}
