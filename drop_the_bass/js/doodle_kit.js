// doodle_kit.js: the crayon notebook doodle engine shared by every doodle_* module.
// Drawing is done with a Pen (a seeded random source bound to a 2D context): wobbly waxy strokes, scribble-hatched fills, a hand-made stroke font.
// It is too slow to run live for dozens of sprites a frame, so sprites are baked into a few "boil" frames and replayed (see sprite / blit).
// No Math.random and no Date: the same seed always draws the same doodle. Safe in node with a mock ctx (makeCanvas returns null there).

export const C = {
  paper: '#fbf6e6', paper2: '#f3ead0', line: '#a9cdf0', margin: '#f08a8a', ink: '#2b2733', red: '#e8403f', orange: '#ff9226', yellow: '#ffd60a',
  green: '#43b94a', lime: '#9dff3a', blue: '#2f7de1', sky: '#6cc4ff', purple: '#7b4fd0', lav: '#d9ccf5', pink: '#ff5fb0', brown: '#8a5a2b',
  grey: '#9a9aa6', cyan: '#19d3ff', mag: '#ff2fb9', skin: '#f5c49a', tan: '#e3a073', olive: '#6f7a2a', teal: '#2fc4b2', gold: '#ffc83a',
};
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
let SCALE = 2;
export const getScale = () => SCALE;
export function setScale(n) { const v = clamp(Math.round((+n || 2) * 2) / 2, 1, 3); if (v !== SCALE) { SCALE = v; cache.clear(); } }
export function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
}

// ---- geometry helpers: polylines are flat [x, y, x, y, ...] arrays
export function arc(cx, cy, rx, ry, a0, a1, n) {
  n = n || Math.max(6, Math.ceil(Math.abs(a1 - a0) / 20)); const o = [];
  for (let k = 0; k <= n; k++) { const t = (a0 + (a1 - a0) * k / n) * Math.PI / 180; o.push(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry); }
  return o;
}
export function rect(x, y, w, h, r = 0) {
  if (!r) return [x, y, x + w, y, x + w, y + h, x, y + h];
  const o = [], c = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
  for (const [a, b, s] of c) for (let k = 0; k <= 3; k++) { const t = (s + k * 30) * Math.PI / 180; o.push(a + Math.cos(t) * r, b + Math.sin(t) * r); }
  return o;
}
export function rev(p) { const o = []; for (let i = p.length - 2; i >= 0; i -= 2) o.push(p[i], p[i + 1]); return o; }
export function rs(p, step, closed) {   // resample a polyline to segments of about `step`
  const o = [], n = p.length / 2, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const x0 = p[i * 2], y0 = p[i * 2 + 1], x1 = p[((i + 1) % n) * 2], y1 = p[((i + 1) % n) * 2 + 1];
    const L = Math.hypot(x1 - x0, y1 - y0), k = Math.max(1, Math.round(L / step));
    for (let j = 0; j < k; j++) o.push(x0 + (x1 - x0) * j / k, y0 + (y1 - y0) * j / k);
  }
  if (!closed) o.push(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
  return o;
}
export function star(cx, cy, r, inner = 0.46, rot = 0, n = 5) {
  const p = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + rot + i * Math.PI / n, q = i % 2 ? r * inner : r; p.push(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
  return p;
}
export function heart(cx, cy, s) {
  const p = []; for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI * 2; p.push(cx + 16 * Math.pow(Math.sin(t), 3) * s / 16, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s / 16); }
  return p;
}

// ---- the stroke font (a glyph is a list of strokes on a 4 x 6 grid)
export const GLYPHS = {
  'A': [[0, 6, 2, 0, 4, 6], [.8, 4, 3.2, 4]],
  'B': [[0, 6, 0, 0, 2.4, 0].concat(arc(2.4, 1.5, 1.4, 1.5, -90, 90), [0, 3]), [2.4, 3].concat(arc(2.5, 4.5, 1.5, 1.5, -90, 90), [0, 6])],
  'C': [arc(2.2, 3, 2, 3, -40, -320)],
  'D': [[0, 6, 0, 0, 1.4, 0].concat(arc(1.4, 3, 2.5, 3, -90, 90), [0, 6])],
  'E': [[4, 0, 0, 0, 0, 6, 4, 6], [0, 3, 3, 3]],
  'F': [[4, 0, 0, 0, 0, 6], [0, 3, 3, 3]],
  'G': [arc(2.2, 3, 2, 3, -40, -330).concat([4, 3.3, 2.4, 3.3])],
  'H': [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  'I': [[1, 0, 3, 0], [2, 0, 2, 6], [1, 6, 3, 6]],
  'J': [[3.6, 0, 3.6, 4.2].concat(arc(2.2, 4.2, 1.4, 1.8, 0, 160))],
  'K': [[0, 0, 0, 6], [3.8, 0, 0, 3.4], [1, 2.6, 4, 6]],
  'L': [[0, 0, 0, 6, 4, 6]],
  'M': [[0, 6, 0, 0, 2, 3.5, 4, 0, 4, 6]],
  'N': [[0, 6, 0, 0, 4, 6, 4, 0]],
  'O': [arc(2, 3, 2, 3, -90, 270)],
  'P': [[0, 6, 0, 0, 2.4, 0].concat(arc(2.4, 1.6, 1.5, 1.6, -90, 90), [0, 3.2])],
  'Q': [arc(2, 3, 2, 3, -90, 270), [2.4, 4.2, 4, 6]],
  'R': [[0, 6, 0, 0, 2.4, 0].concat(arc(2.4, 1.6, 1.5, 1.6, -90, 90), [0, 3.2]), [1.5, 3.2, 4, 6]],
  'S': [arc(2, 1.6, 1.9, 1.6, -30, -270).concat(arc(2, 4.4, 1.9, 1.6, -90, 150))],
  'T': [[0, 0, 4, 0], [2, 0, 2, 6]],
  'U': [[0, 0, 0, 3.8].concat(arc(2, 3.8, 2, 2.2, 180, 0), [4, 0])],
  'V': [[0, 0, 2, 6, 4, 0]],
  'W': [[0, 0, 1, 6, 2, 2.5, 3, 6, 4, 0]],
  'X': [[0, 0, 4, 6], [4, 0, 0, 6]],
  'Y': [[0, 0, 2, 3, 4, 0], [2, 3, 2, 6]],
  'Z': [[0, 0, 4, 0, 0, 6, 4, 6]],
  '0': [arc(2, 3, 1.9, 3, -90, 270)],
  '1': [[1, 1.2, 2.2, 0, 2.2, 6], [1, 6, 3.4, 6]],
  '2': [arc(2, 1.8, 1.9, 1.8, -180, 30).concat([0, 6, 4, 6])],
  '3': [arc(2, 1.5, 1.8, 1.5, -150, 90), arc(2, 4.5, 2, 1.5, -90, 150)],
  '4': [[3, 6, 3, 0, 0, 4.2, 4, 4.2]],
  '5': [[3.8, 0, .4, 0, .2, 2.8].concat(arc(2, 4, 2, 2, -120, 150))],
  '6': [[3.4, .2, 1, 2, .1, 4.2].concat(arc(2, 4.2, 1.9, 1.8, 180, 540))],
  '7': [[0, 0, 4, 0, 1.5, 6]],
  '8': [arc(2, 1.6, 1.6, 1.6, 0, 360), arc(2, 4.4, 1.9, 1.6, 0, 360)],
  '9': [arc(2, 1.8, 1.9, 1.8, 0, 360), [3.9, 1.8, 3.7, 4, 2.5, 6]],
  '!': [[2, 0, 2, 3.8], [2, 5.5, 2, 5.7]],
  '.': [[2, 5.5, 2, 5.7]],
  ':': [[2, 1.6, 2, 1.8], [2, 4.4, 2, 4.6]],
  '+': [[2, 1.5, 2, 4.5], [.5, 3, 3.5, 3]],
  '-': [[.5, 3, 3.5, 3]],
  '/': [[4, 0, 0, 6]],
  '?': [arc(2, 1.7, 1.7, 1.7, -180, 60).concat([2, 3.6, 2, 4]), [2, 5.5, 2, 5.7]],
  '#': [[1.3, 0, 1, 6], [3, 0, 2.7, 6], [0, 2, 4, 2], [0, 4, 4, 4]],
  ',': [[2, 5.4, 1.4, 6.6]]
};

export class Pen {
  // sc is the scale the ctx is drawn at (strokes are kept the same on-screen width); seed picks the doodle
  constructor(ctx, seed = 1, sc = 1) { this.ctx = ctx; this.sc = sc || 1; this.s = (seed | 0) || 1; }
  reseed(n) { this.s = (Math.imul(n | 0, 2654435761) ^ 0x9e3779b9) | 0 || 1; return this; }
  rnd() { let s = this.s = (this.s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  rr(a, b) { return a + (b - a) * this.rnd(); }
  blob(cx, cy, rx, ry, n = 14, w = 0.07) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * 6.2832, r = 1 + (this.rnd() - 0.5) * w * 2; o.push(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r); } return o; }
  spiky(rx, ry, n = 11, sp = 0.16, cx = 0, cy = 0) {   // fuzzy outline for the Static
    const o = []; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * 6.2832, r = (i % 2 ? 1 : 1 + sp) * (1 + (this.rnd() - 0.5) * 0.07); o.push(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r); } return o;
  }
  // a wobbly waxy stroke, drawn twice (a heavy pass and a thin pass) like crayon pressed twice
  ln(p, col, w = 4, closed = false, j = 1.5, dash) {
    const ctx = this.ctx, s = this.sc;
    for (let pass = 0; pass < 2; pass++) {
      const q = rs(p, 22 / s, closed);
      for (let i = 0; i < q.length; i++) q[i] += (this.rnd() - 0.5) * 2 * j / s;
      if (closed && q.length >= 6) q.push(q[0] + (this.rnd() - 0.5) * 3 / s, q[1] + (this.rnd() - 0.5) * 3 / s, q[2], q[3]);
      if (q.length < 4) q.push(q[0] + 0.1, q[1] + 0.1);
      ctx.beginPath(); ctx.moveTo(q[0], q[1]);
      for (let i = 2; i < q.length - 2; i += 2) ctx.quadraticCurveTo(q[i], q[i + 1], (q[i] + q[i + 2]) / 2, (q[i + 1] + q[i + 3]) / 2);
      ctx.lineTo(q[q.length - 2], q[q.length - 1]);
      ctx.strokeStyle = col; ctx.lineWidth = (pass ? w * 0.5 : w) / s; ctx.globalAlpha = pass ? 0.55 : 0.92;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (dash) ctx.setLineDash(dash.map((d) => d / s));
      ctx.stroke(); if (dash) ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }
  // scribble fill: back-and-forth zig-zag strokes clipped to the polygon
  hatch(p, col, gap = 7, ang = -0.6, alpha = 0.9) {
    const ctx = this.ctx; gap /= this.sc;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + gap;
    ctx.save(); ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.strokeStyle = col; ctx.lineWidth = gap * 1.35; ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); let d = 1, first = true;
    for (let y = -R; y < R; y += gap) {
      const xa = -R + (this.rnd() - 0.5) * gap, xb = R + (this.rnd() - 0.5) * gap;
      if (first) { ctx.moveTo(d > 0 ? xa : xb, y); first = false; }
      ctx.lineTo(d > 0 ? xb : xa, y + gap * 0.5 + (this.rnd() - 0.5) * gap * 0.3); d = -d;
    }
    ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
  }
  // a filled and outlined shape. o: gap, ang, alpha, f2 (second hatch colour), j (outline wobble)
  shp(p, fill, line = C.ink, lw = 4, o = {}) {
    const ang = o.ang !== undefined ? o.ang : -0.7 + this.rr(-0.25, 0.25);
    if (fill) this.hatch(p, fill, o.gap || 6.5, ang, o.alpha || 0.9);
    if (o.f2) this.hatch(p, o.f2, (o.gap || 6.5) * 2.2, ang + 1.3, 0.3);
    if (line) this.ln(p, line, lw, true, o.j || 1.3);
  }
  dot(x, y, r, col) { const ctx = this.ctx; ctx.beginPath(); ctx.ellipse(x, y, r * (1 + (this.rnd() - 0.5) * 0.15), r, 0, 0, 6.3); ctx.fillStyle = col; ctx.globalAlpha = 0.96; ctx.fill(); ctx.globalAlpha = 1; }
  eye(x, y, r, look = 0, col = '#fff') {   // googly eye: white disc, outline, pupil that looks along `look` (radians)
    this.dot(x, y, r, col); this.ln(arc(x, y, r, r, 0, 360, 12), C.ink, Math.max(2, r * 0.22), true, 0.8);
    this.dot(x + Math.cos(look) * r * 0.38, y + Math.sin(look) * r * 0.38, r * 0.5, C.ink);
  }
  // hand-made text. o: align 'c'|'r', rot, out (outline colour), ow, w (stroke), adv, rainbow []
  txt(str, x, y, size, col, o = {}) {
    str = String(str).toUpperCase(); const u = size / 6, adv = (o.adv || 5.2) * u;
    const wTot = str.length * adv - 1.2 * u, dx = o.align === 'c' ? -wTot / 2 : o.align === 'r' ? -wTot : 0;
    const lw = o.w || Math.max(2.2, size * 0.15), jj = Math.min(1.4, size * 0.04 + 0.3);
    const ctx = this.ctx, sv = this.sc; this.sc = 1; ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0);
    const passes = o.out ? [[o.out, lw + (o.ow || 6)], [col, lw]] : [[col, lw]];
    for (const [pc, pw] of passes) {
      for (let i = 0; i < str.length; i++) {
        const g = GLYPHS[str[i]]; if (!g) continue;
        const gx = dx + i * adv, gy = Math.sin(i * 1.7 + (o.ph || 0)) * u * 0.3 - size;
        const colr = (o.rainbow && pc === col) ? o.rainbow[i % o.rainbow.length] : pc;
        for (const st of g) { const q = []; for (let k = 0; k < st.length; k += 2) q.push(gx + st[k] * u, gy + st[k + 1] * u); this.ln(q, colr, pw, false, jj); }
      }
    }
    ctx.restore(); this.sc = sv;
  }
  textWidth(str, size, adv = 5.2) { return String(str).length * adv * size / 6 - 1.2 * size / 6; }
}

// ---- boil sprites: bake a doodle into FRAMES slightly different copies (different seeds) and replay them, so lines "boil" like hand animation
const cache = new Map();
export const BOIL_FPS = 7;
// draw(pen, ctx) paints in a box centred on (0,0) of size w x h (logical units). Returns the sprite record or null in node.
export function sprite(key, w, h, draw, o = {}) {
  const frames = o.frames || 3, k = key + '|' + SCALE;
  let e = cache.get(k);
  if (e) return e;
  e = { w, h, frames: [], direct: false };
  for (let f = 0; f < frames; f++) {
    const cv = makeCanvas(w * SCALE, h * SCALE);
    if (!cv) { e.direct = true; break; }
    const c = cv.getContext('2d');
    if (!c) { e.direct = true; break; }
    c.scale(SCALE, SCALE); c.translate(w / 2, h / 2);
    draw(new Pen(c, (o.seed || 7) * 131 + f * 977 + hashStr(key), 1), c, f);
    e.frames.push(cv);
  }
  e.draw = draw; e.seed = o.seed || 7; e.key = key;
  cache.set(k, e);
  return e;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
// draw a baked sprite centred at (x, y); t picks the boil frame. scale and alpha optional.
export function blit(ctx, e, x, y, t = 0, o = {}) {
  if (!e) return;
  const s = o.scale == null ? 1 : o.scale;
  if (e.direct) {   // node or no canvas: draw straight (frame 0)
    ctx.save(); ctx.translate(x, y); if (s !== 1) ctx.scale(s, s); if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    e.draw(new Pen(ctx, e.seed * 131 + hashStr(e.key), 1), ctx, 0); ctx.restore(); return;
  }
  const f = Math.floor((t + (o.phase || 0)) * BOIL_FPS) % e.frames.length;
  const cv = e.frames[f < 0 ? 0 : f];
  if (o.alpha != null) { const a = ctx.globalAlpha; ctx.globalAlpha = a * o.alpha; ctx.drawImage(cv, x - e.w * s / 2, y - e.h * s / 2, e.w * s, e.h * s); ctx.globalAlpha = a; }
  else ctx.drawImage(cv, x - e.w * s / 2, y - e.h * s / 2, e.w * s, e.h * s);
}
export function clearSprites() { cache.clear(); }

// ---- notebook paper (cached): cream paper, blue ruled lines, a red margin line, optional punched holes and grain
export function paper(ctx, x, y, w, h, o = {}) {
  const k = 'paper|' + Math.round(w) + 'x' + Math.round(h) + '|' + (o.holes ? 1 : 0) + '|' + (o.grid ? 1 : 0), key = k + '|' + SCALE;
  let e = cache.get(key);
  if (!e) {
    const cv = makeCanvas(w * SCALE, h * SCALE);
    if (cv) {
      const c = cv.getContext('2d'); c.scale(SCALE, SCALE);
      paintPaper(c, w, h, o);
      e = { cv, w, h }; cache.set(key, e);
    } else e = { direct: true, w, h };
  }
  if (e.direct) { ctx.save(); ctx.translate(x, y); paintPaper(ctx, w, h, o); ctx.restore(); }
  else ctx.drawImage(e.cv, x, y, w, h);
}
function paintPaper(c, w, h, o) {
  c.fillStyle = o.color || C.paper; c.fillRect(0, 0, w, h);
  const step = o.step || 44;
  c.strokeStyle = o.lineColor || C.line; c.lineWidth = 2; c.globalAlpha = 0.75;
  c.beginPath();
  for (let yy = step * 1.5; yy < h; yy += step) { c.moveTo(0, yy); c.lineTo(w, yy); }
  if (o.grid) for (let xx = step; xx < w; xx += step) { c.moveTo(xx, 0); c.lineTo(xx, h); }
  c.stroke(); c.globalAlpha = 1;
  if (!o.noMargin) { c.strokeStyle = C.margin; c.lineWidth = 2.4; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(w * 0.1, 0); c.lineTo(w * 0.1, h); c.stroke(); c.globalAlpha = 1; }
  if (o.holes) for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(w * 0.04, h * (0.2 + i * 0.3), 11, 0, 6.3); c.fillStyle = 'rgba(40,34,50,0.18)'; c.fill(); }
  // paper grain: deterministic speckles
  let s = 12345; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  c.fillStyle = 'rgba(120,100,70,0.05)'; for (let i = 0; i < Math.min(900, w * h / 1500); i++) c.fillRect(r() * w, r() * h, 2, 2);
}
