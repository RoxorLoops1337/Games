// hud.js: the canvas HUD toolkit: glass panels, glossy 3D buttons, liquid bars, metal bezels, crisp outlined text.
// Static looks are rendered once into small cached sprites (scale 2) and stamped with drawImage; only the moving parts are drawn live.
// Without document (node tests) the sprite step is skipped and everything draws straight onto the given context.
export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
let SCALE = 2;
export function setHudScale(n) { const v = clamp(Math.round(n * 2) / 2, 1, 3); if (v !== SCALE) { SCALE = v; cache.clear(); } }

export function rrectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); rrectPath(ctx, x, y, w, h, r); }

// ---- colour helpers
const rgbOf = (hex) => { const v = parseInt(hex.slice(1, 7), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
export function mix(hex, k, to = 255) {   // k > 0 lightens toward `to` (white by default), k < 0 darkens toward black
  if (typeof hex !== 'string' || hex[0] !== '#') return hex;
  const [r, g, b] = rgbOf(hex), t = k < 0 ? 0 : to, f = Math.abs(k);
  return 'rgb(' + Math.round(r + (t - r) * f) + ',' + Math.round(g + (t - g) * f) + ',' + Math.round(b + (t - b) * f) + ')';
}
export const lighten = (hex, k) => mix(hex, k);
export const darken = (hex, k) => mix(hex, -k);
export const rgba = (hex, a) => { const [r, g, b] = rgbOf(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };

// ---- sprite cache
const cache = new Map();
function sprite(key, w, h, pad, draw) {
  let e = cache.get(key);
  if (e === undefined) {
    e = null;
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas');
      c.width = Math.ceil((w + pad * 2) * SCALE); c.height = Math.ceil((h + pad * 2) * SCALE);
      const x = c.getContext && c.getContext('2d');
      if (x) { x.scale(SCALE, SCALE); x.translate(pad, pad); draw(x, 0, 0); e = { c, pad }; }
    }
    cache.set(key, e);
    if (cache.size > 220) cache.delete(cache.keys().next().value);
  }
  return e;
}
function stamp(ctx, key, x, y, w, h, pad, draw) {
  const e = sprite(key, w, h, pad, draw);
  if (e) ctx.drawImage(e.c, x - pad, y - pad, w + pad * 2, h + pad * 2);
  else draw(ctx, x, y);
}

// ---- glass panel: dark tinted glass, top sheen, inner rim light, 3D bevel, soft drop shadow
function drawGlass(c, x, y, w, h, r, tint, edge, alpha) {
  rrect(c, x + 0, y + 4, w, h, r); c.fillStyle = 'rgba(4,0,16,0.38)'; c.fill();
  rrect(c, x, y, w, h, r);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, rgba(tint, alpha)); g.addColorStop(1, rgba('#08031c', Math.min(1, alpha + 0.1)));
  c.fillStyle = g; c.fill();
  c.save(); rrect(c, x, y, w, h, r); c.clip();
  const sh = c.createLinearGradient(0, y, 0, y + h * 0.55); sh.addColorStop(0, 'rgba(255,255,255,0.20)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sh; c.fillRect(x, y, w, h * 0.55);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y + h - 5, w, 5);
  c.restore();
  rrect(c, x + 1.5, y + 1.5, w - 3, h - 3, Math.max(2, r - 1.5)); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.22)'; c.stroke();
  rrect(c, x, y, w, h, r); c.lineWidth = 3; c.strokeStyle = '#0a0420'; c.stroke();
  if (edge) { rrect(c, x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3)); c.lineWidth = 1.2; c.strokeStyle = rgba(edge, 0.55); c.stroke(); }
}
export function glass(ctx, x, y, w, h, r = 14, o = {}) {
  const tint = o.tint || '#1d1245', edge = o.edge || '#5b3fd0', alpha = o.alpha == null ? 0.84 : o.alpha;
  stamp(ctx, 'g' + w + 'x' + h + 'r' + r + tint + edge + alpha, x, y, w, h, 8, (c, ax, ay) => drawGlass(c, ax, ay, w, h, r, tint, edge, alpha));
  if (o.glow) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o.glowA == null ? 0.5 : o.glowA;
    rrect(ctx, x, y, w, h, r); ctx.strokeStyle = o.glow; ctx.lineWidth = 3; ctx.stroke();
    rrect(ctx, x - 2, y - 2, w + 4, h + 4, r + 2); ctx.globalAlpha *= 0.4; ctx.lineWidth = 6; ctx.stroke();
    ctx.restore();
  }
}

// ---- glossy 3D button (base cached per colour and size)
function drawBtnBase(c, w, h, color, r, down) {
  const lip = down ? 2 : 5, bodyH = h - lip;
  rrect(c, 0, 3, w, h, r); c.fillStyle = 'rgba(2,0,12,0.45)'; c.fill();
  rrect(c, 0, 0, w, h, r); c.fillStyle = darken(color, 0.55); c.fill();                       // lip (the 3D underside)
  rrect(c, 0, 0, w, bodyH, r);
  const g = c.createLinearGradient(0, 0, 0, bodyH);
  g.addColorStop(0, lighten(color, 0.3)); g.addColorStop(0.5, color); g.addColorStop(1, darken(color, 0.22));
  c.fillStyle = g; c.fill();
  c.save(); rrect(c, 0, 0, w, bodyH, r); c.clip();
  const gl = c.createLinearGradient(0, 0, 0, bodyH * 0.55); gl.addColorStop(0, 'rgba(255,255,255,0.5)'); gl.addColorStop(1, 'rgba(255,255,255,0.02)');
  c.beginPath(); c.ellipse(w / 2, -bodyH * 0.2, w * 0.62, bodyH * 0.66, 0, 0, TAU); c.fillStyle = gl; c.fill();
  c.restore();
  rrect(c, 1.5, 1.5, w - 3, bodyH - 3, Math.max(2, r - 1.5)); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke();
  rrect(c, 0, 0, w, h, r); c.lineWidth = 3.2; c.strokeStyle = '#0a0420'; c.stroke();
}
export function button(ctx, r, color, o = {}) {
  const down = o.press > 0.2, dy = down ? 3 : 0;
  ctx.save();
  if (o.dim) ctx.globalAlpha = 0.72;
  const x = r.x, y = r.y + dy, rad = o.radius || 14;
  stamp(ctx, 'b' + r.w + 'x' + r.h + color + rad + (down ? 'd' : ''), x, y, r.w, r.h - dy, 8, (c, ax, ay) => { c.translate(ax, ay); drawBtnBase(c, r.w, r.h - dy, color, rad, down); });
  ctx.globalAlpha = 1;
  const cx = x + r.w / 2, bodyH = r.h - (down ? 2 : 5) - dy;
  if (o.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o.glow; rrect(ctx, x - 1, y - 1, r.w + 2, r.h + 2, rad + 1); ctx.lineWidth = 4; ctx.strokeStyle = o.glowColor || '#fff'; ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  if (o.shine != null) {   // diagonal light sweep for buttons that want attention
    ctx.save(); rrect(ctx, x, y, r.w, bodyH, rad); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    const sx = x - 40 + (r.w + 80) * o.shine; const g = ctx.createLinearGradient(sx - 22, 0, sx + 22, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - 22 + 14, y); ctx.lineTo(sx + 22 + 14, y); ctx.lineTo(sx + 22 - 14, y + bodyH); ctx.lineTo(sx - 22 - 14, y + bodyH); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  if (o.draw) o.draw(ctx, x, y, bodyH);
  if (o.icon && o.glyph) o.glyph(ctx, o.icon, cx, y + bodyH / 2 - (o.sub ? 8 : 0), o.sub ? 30 : 28, '#fff');
  if (o.label) text(ctx, o.label, cx, y + bodyH / 2 - (o.sub ? 7 : 0), o.size || 18, '#fff', 'center');
  if (o.sub) text(ctx, o.sub, cx, y + bodyH - 10, (o.size && o.icon) ? o.size : 12, 'rgba(255,255,255,0.88)', 'center', 800);
  ctx.restore();
}

// ---- liquid bar: inset glass tube, glowing fluid with a wavy leading edge, drifting highlight, damage lag ghost
export function liquidBar(ctx, x, y, w, h, f, c0, c1, t, o = {}) {
  const rad = h / 2;
  f = clamp(f, 0, 1);
  stamp(ctx, 'tube' + w + 'x' + h, x, y, w, h, 6, (c, ax, ay) => {
    rrect(c, ax, ay, w, h, rad); c.fillStyle = '#0b0524'; c.fill();
    const g = c.createLinearGradient(0, ay, 0, ay + h); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.5, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.1)'); rrect(c, ax, ay, w, h, rad); c.fillStyle = g; c.fill();
    rrect(c, ax, ay, w, h, rad); c.lineWidth = 3; c.strokeStyle = '#0a0420'; c.stroke();
  });
  ctx.save(); rrect(ctx, x, y, w, h, rad); ctx.clip();
  if (o.lag != null && o.lag > f) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(x, y, w * clamp(o.lag, 0, 1), h); }
  const fw = Math.max(h * 0.9, w * f);
  if (f > 0.001 || o.min) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + fw - rad, y);
    const amp = h * 0.16, ph = t * 4;
    for (let i = 0; i <= 8; i++) { const yy = y + (h * i) / 8; ctx.lineTo(x + fw - rad * 0.6 + Math.sin(ph + i * 0.9) * amp, yy); }
    ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
    // volume: dark underside, bright upper third, drifting sheen
    const v = ctx.createLinearGradient(0, y, 0, y + h); v.addColorStop(0, 'rgba(255,255,255,0.5)'); v.addColorStop(0.45, 'rgba(255,255,255,0.05)'); v.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = v; ctx.fillRect(x, y, fw, h);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28;
    const sx = x + ((t * 60) % (fw + 60)) - 30; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 14, y); ctx.lineTo(sx + 4, y + h); ctx.lineTo(sx - 10, y + h); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  if (o.glow && f > 0.02) {   // light spilling out of the leading edge
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o.glow * (0.6 + 0.4 * Math.sin(t * 8));
    ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(x + fw - rad * 0.4, y + h / 2, h * 0.9, 0, TAU); ctx.fill(); ctx.restore();
  }
  if (o.ticks) {   // segment marks (boss phases)
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    for (const k of o.ticks) { ctx.beginPath(); ctx.moveTo(x + w * k, y + 2); ctx.lineTo(x + w * k, y + h - 2); ctx.stroke(); }
    ctx.restore();
  }
  rrect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, Math.max(2, rad - 1.5)); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
}

// ---- metal bezel ring for round buttons (cached)
export function bezel(ctx, cx, cy, r, color, o = {}) {
  const key = 'bz' + r + color + (o.lit ? 'l' : '');
  stamp(ctx, key, cx - r, cy - r, r * 2, r * 2, 10, (c, ax, ay) => {
    const x = ax + r, y = ay + r;
    c.beginPath(); c.arc(x, y + 4, r, 0, TAU); c.fillStyle = 'rgba(2,0,12,0.45)'; c.fill();
    const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, lighten(color, 0.55)); g.addColorStop(0.35, color); g.addColorStop(0.7, darken(color, 0.45)); g.addColorStop(1, lighten(color, 0.2));
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill();
    c.beginPath(); c.arc(x, y, r - 6, 0, TAU); c.fillStyle = '#12082b'; c.fill();
    c.beginPath(); c.arc(x, y, r - 6, 0, TAU); c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke();
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.lineWidth = 3.2; c.strokeStyle = '#0a0420'; c.stroke();
    c.beginPath(); c.arc(x, y, r - 1.6, Math.PI * 1.05, Math.PI * 1.7); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.55)'; c.stroke();
  });
}

// ---- text: heavy outline for legibility, vertical gradient fill on big sizes, optional glow
export function text(ctx, s, x, y, size, color, align = 'left', weight = 900, o) {
  ctx.save();
  ctx.font = weight + ' ' + size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (o && o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.blur || 14; }
  ctx.lineWidth = Math.max(3, size * 0.24); ctx.strokeStyle = 'rgba(10,3,30,0.92)'; ctx.strokeText(s, x, y + (size >= 18 ? 1.5 : 1));
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  if (size >= 18 && typeof color === 'string' && color[0] === '#') {
    const g = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5); g.addColorStop(0, lighten(color, 0.45)); g.addColorStop(0.55, color); g.addColorStop(1, darken(color, 0.18));
    ctx.fillStyle = g;
  } else ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}
export function wrapText(ctx, s, x, y, maxW, size, lh, color, align = 'left') {
  ctx.save(); ctx.font = '800 ' + size + 'px ' + FONT;
  const words = s.split(' '); let line = ''; const lines = [];
  for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  if (line) lines.push(line);
  ctx.restore();
  lines.slice(0, 5).forEach((l, i) => { ctx.save(); ctx.font = '800 ' + size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(l, x, y + i * lh); ctx.restore(); });
}
