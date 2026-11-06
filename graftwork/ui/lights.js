// Light registry + half-resolution lightmap. Backgrounds and screens feature-detect it.
//
//   import { lights } from './lights.js';
//   const id = lights.add({ x: 300, y: 200, r: 260, color: '#ffb36b', intensity: 1, flicker: 0.6, cone: { angle: 0.8, spread: 1.1 } });
//   lights.render(ctx, '#2a2438');   // after drawing the scene: multiplies the lightmap over it, then a faint additive glow
//   lights.remove(id); lights.clear();
//   lights.shadow(ctx, x, y, 120, 28, 0.45);   // soft contact shadow, one pre-rendered blurred ellipse
// Not thread safe (single UI thread). All gradients are baked into cached sprites; render creates none.

export const MAX_LIGHTS = 16;
const LM_SCALE = 0.5;

function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv;
}
function hexRgb(c) {
  if (typeof c === 'string' && c[0] === '#') {
    if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    if (c.length >= 7) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  return [255, 255, 255];
}

export class Lights {
  constructor() { this.list = []; this.nextId = 1; this.glow = new Map(); this.cone = new Map(); this.map = null; this.mapCtx = null; this.mapW = 0; this.mapH = 0; this.shadowSprite = null; this.t = null; }
  // Adds a light, returns its id (or -1 when the 16-light budget is full).
  add(l) {
    if (this.list.length >= MAX_LIGHTS) return -1;
    const id = this.nextId++;
    this.list.push({ id, x: l.x || 0, y: l.y || 0, r: l.r || 200, color: l.color || '#ffd9a0', intensity: l.intensity === undefined ? 1 : l.intensity, flicker: l.flicker || 0, cone: l.cone || null });
    return id;
  }
  // Mutate a light in place (x, y, r, color, intensity, flicker, cone).
  set(id, patch) { const l = this.get(id); if (l) Object.assign(l, patch); }
  get(id) { for (let i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i]; return null; }
  remove(id) { for (let i = 0; i < this.list.length; i++) if (this.list[i].id === id) { this.list.splice(i, 1); return true; } return false; }
  clear() { this.list.length = 0; }
  get count() { return this.list.length; }
  // flicker multiplier for a light at time t (seconds)
  flickerAt(l, t) { return 1 + l.flicker * (Math.sin(t * 9 + l.id * 3) * 0.12 + Math.sin(t * 23 + l.id) * 0.05); }

  _glow(color) {
    let s = this.glow.get(color); if (s !== undefined) return s;
    const cv = makeCanvas(128, 128); if (!cv) return null;
    const g = cv.getContext('2d'); if (!g) return null;
    const [r, gg, b] = hexRgb(color); const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, `rgba(${r},${gg},${b},1)`); rg.addColorStop(0.35, `rgba(${r},${gg},${b},0.5)`); rg.addColorStop(0.7, `rgba(${r},${gg},${b},0.14)`); rg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    if (this.glow.size < 48) this.glow.set(color, cv);
    return cv;
  }
  // Wedge pointing +x from the sprite centre; rotated at draw time.
  _cone(color, spread) {
    const key = color + '|' + Math.round(spread * 10);
    let s = this.cone.get(key); if (s !== undefined) return s;
    const cv = makeCanvas(256, 256); if (!cv) return null;
    const g = cv.getContext('2d'); if (!g) return null;
    const [r, gg, b] = hexRgb(color);
    g.save(); g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 128, -spread / 2, spread / 2); g.closePath(); g.clip();
    const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, `rgba(${r},${gg},${b},1)`); rg.addColorStop(0.5, `rgba(${r},${gg},${b},0.45)`); rg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256); g.restore();
    if (this.cone.size < 48) this.cone.set(key, cv);
    return cv;
  }

  // Draw the lightmap over the already drawn scene. ambient: CSS hex colour of the unlit scene multiplier (default dim blue-grey).
  // o: {w:1280, h:720, t: seconds (defaults to the wall clock), glow: 0.14 (additive pass strength)}
  render(ctx, ambient = '#3a3550', o) {
    if (!this.list.length) return;
    const W = (o && o.w) || 1280, H = (o && o.h) || 720, t = (o && o.t !== undefined) ? o.t : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    const mw = Math.ceil(W * LM_SCALE), mh = Math.ceil(H * LM_SCALE);
    if (!this.map || this.mapW !== mw || this.mapH !== mh) { this.map = makeCanvas(mw, mh); this.mapW = mw; this.mapH = mh; this.mapCtx = this.map ? this.map.getContext('2d') : null; }
    const m = this.mapCtx; if (!m) return;
    m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1; m.fillStyle = ambient; m.fillRect(0, 0, mw, mh);
    m.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.list.length; i++) {
      const l = this.list[i], k = Math.max(0, Math.min(1.5, l.intensity * this.flickerAt(l, t))), rr = l.r * LM_SCALE;
      if (l.cone) {
        const sp = this._cone(l.color, l.cone.spread || 1);
        if (sp) { m.globalAlpha = Math.min(1, k); m.save(); m.translate(l.x * LM_SCALE, l.y * LM_SCALE); m.rotate(l.cone.angle || 0); m.drawImage(sp, -rr, -rr, rr * 2, rr * 2); m.restore(); }
      } else {
        const sp = this._glow(l.color);
        if (sp) { m.globalAlpha = Math.min(1, k); m.drawImage(sp, l.x * LM_SCALE - rr, l.y * LM_SCALE - rr, rr * 2, rr * 2); }
      }
    }
    m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1; ctx.drawImage(this.map, 0, 0, W, H);
    // faint additive bloom of the lamps themselves
    ctx.globalCompositeOperation = 'lighter';
    const gs = (o && o.glow !== undefined) ? o.glow : 0.14;
    for (let i = 0; i < this.list.length; i++) {
      const l = this.list[i]; if (l.cone) continue;
      const sp = this._glow(l.color); if (!sp) continue;
      const k = Math.max(0, l.intensity * this.flickerAt(l, t)), rr = l.r * 0.5;
      ctx.globalAlpha = Math.min(1, gs * k); ctx.drawImage(sp, l.x - rr, l.y - rr, rr * 2, rr * 2);
    }
    ctx.restore();
  }

  // Soft contact shadow centred at (x, y) of size w x h. Example: lights.shadow(ctx, 400, 560, 160, 30, 0.45)
  shadow(ctx, x, y, w, h, alpha = 0.45) {
    if (!this.shadowSprite) {
      const cv = makeCanvas(64, 32); if (!cv) return;
      const g = cv.getContext('2d'); if (!g) return;
      g.save(); g.translate(32, 16); g.scale(1, 0.5);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 32); rg.addColorStop(0, 'rgba(0,0,0,0.9)'); rg.addColorStop(0.55, 'rgba(0,0,0,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(-32, -32, 64, 64); g.restore();
      this.shadowSprite = cv;
    }
    ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(this.shadowSprite, x - w / 2, y - h / 2, w, h); ctx.restore();
  }
}

export const lights = new Lights();
