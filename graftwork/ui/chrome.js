// Physical UI chrome (design/ART_BIBLE.md "UI chrome"): brass-framed slab panels with rivets, inset shadow and a lit top edge,
// buttons with 2 px press travel, plus plate / rivet / vial / dial / badge helpers.
// Textures are baked ONCE into offscreen canvases (keyed by size and colours, numeric keys so a hit allocates nothing);
// per frame a panel or a button is one drawImage. When no canvas can be created (headless) or the per-frame bake budget is
// spent, a cheap vector version is drawn instead.
// Light: ONE key lamp from the upper left; baked bevels use that fixed rest direction (top and left lit, bottom and right dark).
export const BRASS = '#C9A227', BRASS_DARK = '#7A5F12', BRASS_LIGHT = '#FFF1B0', LAMP = '#F2C14E';
export const KEY_LIGHT = { x: -0.5, y: -0.86 }; // rest direction FROM which the lamp shines (upper left); screens may read it

const MAX_BAKES_PER_FRAME = 10, MAX_PIXELS = 48e6, MAX_ENTRIES = 400;
const cache = { px: 0, panels: new Map(), buttons: new Map(), entries: 0, pixels: 0, bakes: 0, frameBakes: 0, hits: 0, vector: 0 };
export const stats = cache;
let rivetSprite = null, rivetPx = 0;

function mk(w, h) {
  let c = null;
  if (typeof document !== 'undefined' && document.createElement) c = document.createElement('canvas');
  else if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(1, 1);
  if (!c) return null;
  c.width = w; c.height = h;
  const g = c.getContext && c.getContext('2d');
  return g ? { c, g } : null;
}
function rrp(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function brassGrad(g, h, a) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, `rgba(255,241,176,${a})`); gr.addColorStop(0.3, `rgba(201,162,39,${a})`); gr.addColorStop(0.6, `rgba(122,95,18,${a})`); gr.addColorStop(1, `rgba(201,162,39,${a * 0.8})`);
  return gr;
}
export function rivet(g, x, y, r = 2.6) {
  g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(x + 0.5, y + 0.9, r + 0.7, 0, 6.2832); g.fill();
  g.fillStyle = BRASS; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  g.fillStyle = BRASS_DARK; g.beginPath(); g.arc(x + r * 0.3, y + r * 0.35, r * 0.62, 0, 6.2832); g.fill();
  g.fillStyle = BRASS_LIGHT; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.38, 0, 6.2832); g.fill();
}
function level(root, a, b) {
  let m = root.get(a); if (!m) { m = new Map(); root.set(a, m); }
  let n = m.get(b); if (!n) { n = new Map(); m.set(b, n); }
  return n;
}
function checkpx(app) {
  const px = app.px || 1;
  if (cache.px !== px || cache.entries > MAX_ENTRIES || cache.pixels > MAX_PIXELS) { cache.panels.clear(); cache.buttons.clear(); cache.entries = 0; cache.pixels = 0; cache.px = px; rivetSprite = null; }
  return px;
}
export function frameStart(app) { cache.frameBakes = 0; checkpx(app); }

// ---- panel ----
function bakePanel(s, w, h, r, fill, stroke, lw, rivets, pad) {
  const cw = Math.ceil((w + pad * 2) * s), ch = Math.ceil((h + pad * 2) * s);
  const o = mk(cw, ch); if (!o) return null;
  const g = o.g; g.scale(s, s); g.translate(pad, pad);
  g.beginPath(); rrp(g, 0, 0, w, h, r); g.fillStyle = fill; g.fill();
  g.save(); g.clip();
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,236,190,.09)'); gr.addColorStop(0.35, 'rgba(255,236,190,0)'); gr.addColorStop(1, 'rgba(0,0,0,.22)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (w > 30 && h > 30) { // inner inset shadow: a frame-shaped hole casting a blurred shadow inward
    g.beginPath(); g.rect(-30, -30, w + 60, h + 60); rrp(g, 0, 0, w, h, r);
    g.shadowColor = 'rgba(0,0,0,.75)'; g.shadowBlur = 9; g.shadowOffsetX = 1; g.shadowOffsetY = 2.5; g.fillStyle = '#000'; g.fill('evenodd');
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
  }
  g.strokeStyle = 'rgba(255,241,176,.34)'; g.lineWidth = 1; // lit top edge
  g.beginPath(); g.moveTo(r * 0.7 + lw, lw + 1.5); g.lineTo(w - r * 0.7 - lw, lw + 1.5); g.stroke();
  g.restore();
  g.beginPath(); rrp(g, 0, 0, w, h, r); g.lineWidth = lw; g.strokeStyle = stroke === 'brass' ? brassGrad(g, h, 0.8) : stroke; g.stroke();
  g.beginPath(); rrp(g, lw, lw, w - lw * 2, h - lw * 2, Math.max(0, r - lw)); g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.4)'; g.stroke();
  if (rivets && w >= 64 && h >= 48) { const i = Math.max(8, r * 0.7 + 3); rivet(g, i, i, 2.4); rivet(g, w - i, i, 2.4); rivet(g, i, h - i, 2.4); rivet(g, w - i, h - i, 2.4); }
  return o.c;
}
export function panel(app, x, y, w, h, o) {
  const ctx = app.ctx, r = o.r === undefined ? 10 : o.r, lw = o.lw || 2, fill = o.fill || 'rgba(26,22,20,.92)', stroke = o.stroke || 'brass';
  const W = Math.round(w), Hh = Math.round(h), R = Math.round(r), L = Math.round(lw * 2);
  if (!o.plain && W > 4 && Hh > 4 && W < 2048 && Hh < 1024 && R < 64 && L < 32) {
    const s = checkpx(app), m = level(cache.panels, fill, stroke), key = (((W * 1024 + Hh) * 64 + R) * 32 + L) * 2 + (o.rivets === false ? 1 : 0);
    let cv = m.get(key);
    if (cv === undefined && cache.frameBakes < MAX_BAKES_PER_FRAME) {
      cache.frameBakes++; cache.bakes++;
      cv = bakePanel(s, W, Hh, R, fill, stroke, lw, o.rivets !== false, 4) || null; m.set(key, cv);
      cache.entries++; if (cv) cache.pixels += cv.width * cv.height;
    }
    if (cv) { cache.hits++; ctx.drawImage(cv, x - 4 + (w - W) / 2, y - 4 + (h - Hh) / 2, W + 8, Hh + 8); return; }
  }
  cache.vector++;
  ctx.save(); app.rr(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = stroke === 'brass' ? 'rgba(201,162,39,.7)' : stroke; ctx.stroke();
  ctx.fillStyle = 'rgba(255,241,176,.25)'; ctx.fillRect(x + r * 0.7 + lw, y + lw + 1, Math.max(0, w - r * 1.4 - lw * 2), 1);
  ctx.restore();
}

// ---- button ----
// state: 0 normal, 1 hover, 2 down, 3 disabled
function bakeButton(s, w, h, r, fill, stroke, state, pad) {
  const o = mk(Math.ceil((w + pad * 2) * s), Math.ceil((h + pad * 2 + 3) * s)); if (!o) return null;
  const g = o.g; g.scale(s, s); g.translate(pad, pad);
  const dy = state === 2 ? 2 : 0;
  if (state !== 2) { g.beginPath(); rrp(g, 0, 2.5, w, h, r); g.fillStyle = 'rgba(0,0,0,.5)'; g.fill(); } // the plinth the button travels into
  g.translate(0, dy);
  if (state === 1) { g.shadowColor = 'rgba(242,193,78,.55)'; g.shadowBlur = 7; }
  g.beginPath(); rrp(g, 0, 0, w, h, r); g.fillStyle = fill; g.fill();
  g.shadowColor = 'transparent'; g.shadowBlur = 0;
  g.save(); g.clip();
  const gr = g.createLinearGradient(0, 0, 0, h);
  if (state === 3) { gr.addColorStop(0, 'rgba(60,54,50,.75)'); gr.addColorStop(1, 'rgba(40,36,34,.75)'); } else { gr.addColorStop(0, `rgba(255,236,190,${state === 1 ? 0.2 : 0.12})`); gr.addColorStop(0.5, 'rgba(255,236,190,0)'); gr.addColorStop(1, 'rgba(0,0,0,.28)'); }
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (state === 2) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 0, w, h); }
  if (state !== 3 && w > 24) { g.fillStyle = 'rgba(255,255,255,.028)'; for (let yy = 2; yy < h; yy += 3) g.fillRect(0, yy + ((yy * 7) % 3) * 0.3, w, 1); } // brushed grain
  if (state !== 3) { g.fillStyle = state === 2 ? 'rgba(255,241,176,.12)' : 'rgba(255,241,176,.42)'; g.fillRect(r * 0.6 + 1, 1, Math.max(0, w - r * 1.2 - 2), 1); } // lit top edge
  g.restore();
  g.beginPath(); rrp(g, 0, 0, w, h, r); g.lineWidth = state === 1 ? 2.2 : 1.8;
  g.strokeStyle = state === 3 ? 'rgba(232,220,196,.2)' : state === 1 ? LAMP : stroke === 'brass' ? brassGrad(g, h, 0.62) : stroke; g.stroke();
  return o.c;
}
// Draws the button body for a state and returns the vertical travel (2 when pressed) so the caller can offset its label.
export function button(app, x, y, w, h, o, state) {
  const ctx = app.ctx, r = o.r === undefined ? 8 : o.r, fill = o.fill || '#26201c', stroke = o.stroke || 'brass';
  const W = Math.round(w), Hh = Math.round(h), R = Math.round(r);
  if (W > 4 && Hh > 4 && W < 2048 && Hh < 1024 && R < 64) {
    const s = checkpx(app), m = level(cache.buttons, fill, stroke), key = ((W * 1024 + Hh) * 64 + R) * 4 + state;
    let cv = m.get(key);
    if (cv === undefined && cache.frameBakes < MAX_BAKES_PER_FRAME) {
      cache.frameBakes++; cache.bakes++;
      cv = bakeButton(s, W, Hh, R, fill, stroke, state, 8) || null; m.set(key, cv);
      cache.entries++; if (cv) cache.pixels += cv.width * cv.height;
    }
    if (cv) { cache.hits++; ctx.drawImage(cv, x - 8 + (w - W) / 2, y - 8 + (h - Hh) / 2, W + 16, Hh + 19); return state === 2 ? 2 : 0; }
  }
  cache.vector++;
  const dy = state === 2 ? 2 : 0;
  ctx.save(); app.rr(x, y + dy, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.fillStyle = state === 1 ? 'rgba(255,236,190,.14)' : state === 2 ? 'rgba(0,0,0,.25)' : state === 3 ? 'rgba(40,36,34,.6)' : 'rgba(255,236,190,.05)'; ctx.fill();
  ctx.lineWidth = state === 1 ? 2.2 : 1.8; ctx.strokeStyle = state === 3 ? 'rgba(232,220,196,.2)' : state === 1 ? LAMP : stroke === 'brass' ? 'rgba(201,162,39,.6)' : stroke; ctx.stroke();
  ctx.restore();
  return dy;
}
const DASH = [5, 3];
export function focusRing(app, x, y, w, h, r = 8) {
  const ctx = app.ctx; ctx.save(); app.rr(x - 3, y - 3, w + 6, h + 6, r + 3);
  ctx.lineWidth = 2; ctx.strokeStyle = BRASS_LIGHT; ctx.globalAlpha = 0.65 + 0.35 * Math.sin(app.t * 6); ctx.setLineDash(DASH); ctx.stroke(); ctx.restore();
}

// ---- ripples (pressed feedback) ----
const RIP = []; for (let i = 0; i < 6; i++) RIP.push({ t: 1, x: 0, y: 0, w: 0, h: 0, r: 8, cx: 0, cy: 0 });
let ripN = 0;
export function press(app, x, y, w, h, r = 8) {
  const st = app.shared && app.shared.meta && app.shared.meta.settings; if (st && st.reducedMotion) return;
  const p = RIP[ripN++ % RIP.length]; p.t = 0; p.x = x; p.y = y; p.w = w; p.h = h; p.r = r; p.cx = app.mouse.x; p.cy = app.mouse.y;
}
export function drawRipples(app) {
  const ctx = app.ctx;
  for (let i = 0; i < RIP.length; i++) {
    const p = RIP[i]; if (p.t >= 1) continue;
    p.t += app.dt / 0.35; if (p.t >= 1) continue;
    ctx.save(); app.rr(p.x, p.y, p.w, p.h, p.r); ctx.clip();
    ctx.globalAlpha = 0.5 * (1 - p.t); ctx.lineWidth = 2; ctx.strokeStyle = BRASS_LIGHT; ctx.beginPath(); ctx.arc(p.cx, p.cy, 4 + p.t * Math.max(p.w, p.h) * 0.6, 0, 6.2832); ctx.stroke(); ctx.restore();
  }
}

// ---- gauges and plates ----
export function plate(app, x, y, w, h, text, o = {}) {
  panel(app, x, y, w, h, { fill: o.fill || '#3a2e12', stroke: o.stroke || 'brass', r: o.r === undefined ? 5 : o.r, lw: o.lw || 1.6, rivets: o.rivets });
  if (text) app.text(text, x + w / 2, y + h / 2 - (o.size || 15) * 0.55, { size: o.size || 15, align: 'center', color: o.color || BRASS_LIGHT, bold: true, engraved: true, fixed: o.fixed });
}
// HP vial: glass tube, liquid with a wobbling surface and meniscus. frac 0..1.
export function vial(app, x, y, w, h, frac, o = {}) {
  const ctx = app.ctx, color = o.color || '#B3263A', f = Math.max(0, Math.min(1, frac)), rm = app.shared && app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.reducedMotion;
  const t = o.t === undefined ? app.t : o.t, r = Math.min(w / 2, 10), amp = rm ? 0 : Math.min(2.2, h * 0.04), top = y + h * (1 - f);
  ctx.save();
  app.rr(x, y, w, h, r); ctx.fillStyle = 'rgba(8,6,6,.7)'; ctx.fill(); ctx.clip();
  if (f > 0) {
    ctx.beginPath(); ctx.moveTo(x, y + h);
    for (let i = 0; i <= 8; i++) { const px = x + (w * i) / 8; ctx.lineTo(px, top + Math.sin(t * 2.4 + i * 0.9) * amp); }
    ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + w * 0.62, top, w * 0.38, y + h - top); // shaded side
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); // meniscus
    for (let i = 0; i <= 8; i++) { const px = x + (w * i) / 8, py = top + Math.sin(t * 2.4 + i * 0.9) * amp; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(x + w * 0.16, y + 4, Math.max(1.5, w * 0.1), h - 8); // glass streak
  ctx.restore();
  ctx.save(); app.rr(x, y, w, h, r); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,241,176,.55)'; ctx.stroke(); ctx.restore();
  ctx.fillStyle = BRASS; ctx.fillRect(x + 2, y - 2, w - 4, 4); ctx.fillRect(x + 2, y + h - 2, w - 4, 4); // brass caps
  ctx.fillStyle = BRASS_LIGHT; ctx.fillRect(x + 2, y - 2, w - 4, 1);
}
// Energy dial: brass bezel, 270 degree sweep, needle. value/max.
export function dial(app, cx, cy, rad, value, max, o = {}) {
  const ctx = app.ctx, k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0, a0 = Math.PI * 0.75, a = a0 + k * Math.PI * 1.5;
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,6,.85)'; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.2832); ctx.fill();
  ctx.lineWidth = Math.max(2, rad * 0.14); ctx.strokeStyle = BRASS; ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = BRASS_LIGHT; ctx.beginPath(); ctx.arc(cx, cy, rad - 1, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
  const n = Math.max(1, Math.min(10, max | 0)); ctx.strokeStyle = 'rgba(232,220,196,.6)'; ctx.lineWidth = 1.2; ctx.beginPath();
  for (let i = 0; i <= n; i++) { const an = a0 + (i / n) * Math.PI * 1.5, c = Math.cos(an), s = Math.sin(an); ctx.moveTo(cx + c * rad * 0.62, cy + s * rad * 0.62); ctx.lineTo(cx + c * rad * 0.8, cy + s * rad * 0.8); }
  ctx.stroke();
  ctx.strokeStyle = o.color || '#7fd1e0'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * rad * 0.15, cy - Math.sin(a) * rad * 0.15); ctx.lineTo(cx + Math.cos(a) * rad * 0.72, cy + Math.sin(a) * rad * 0.72); ctx.stroke();
  ctx.fillStyle = BRASS; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.14, 0, 6.2832); ctx.fill();
  ctx.restore();
}
// Counter badge: small riveted brass pill with a tabular number.
export function badge(app, cx, cy, text, o = {}) {
  const size = o.size || 13, s = String(text), w = Math.max(o.minW || 22, Math.round(app.measure(s, size, { bold: true, ui: true, tab: true, fixed: o.fixed }) + 12)), h = Math.round(size * (o.fixed ? 1 : 1) + 8);
  panel(app, cx - w / 2, cy - h / 2, w, h, { fill: o.fill || '#2b2110', stroke: o.stroke || 'brass', r: h / 2, lw: 1.5, rivets: false });
  app.text(s, cx, cy - size * 0.58, { size, align: 'center', bold: true, ui: true, tab: true, color: o.color || BRASS_LIGHT, fixed: o.fixed });
}
export const chrome = { panel, button, plate, rivet, vial, dial, badge, press, focusRing, stats, frameStart, drawRipples, KEY_LIGHT, BRASS, BRASS_DARK, BRASS_LIGHT };
export default chrome;
