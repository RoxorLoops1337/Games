// art_enemies.js: the Static. AAA pass for enemies and bosses (canvas, no image files).
// Contract (see CLAUDE.md): drawEnemy(ctx, type, x, y, o) and drawBoss(ctx, id, x, y, o). Every public draw does one save/restore and leaves ctx as found.
// No Date, no Math.random: motion comes from `t` and hashes of ids. Static art is cached in offscreen canvases (document only).
// Look: tactile fuzzy creatures lit from the top left with a cool rim light, strand fur, glossy googly eyes with catchlights, cyan and magenta
// chromatic glitch fringes, additive glows, contact shadows. Per-frame cost per enemy is a handful of drawImage calls plus a few arcs.
import { ENEMIES, BOSSES, AFFIXES } from './data_core.js';

const TAU = Math.PI * 2;
const OUT = '#140a2e';

// ---------------------------------------------------------------- cache plumbing
let SCALE = 2;
const cache = new Map();
export function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  try { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } catch (e) { return null; }
}
export function setArtScale(n) { SCALE = Math.max(1, Math.min(4, +n || 2)); cache.clear(); }
// fn(c) draws around the origin of a w x h box. Returns { cv, w, h, fn }; cv is null when there is no document (node): then fn is replayed.
function sprite(key, w, h, fn) {
  let s = cache.get(key);
  if (s) return s;
  const cv = makeCanvas(Math.ceil(w * SCALE), Math.ceil(h * SCALE));
  const cx = cv && cv.getContext ? cv.getContext('2d') : null;
  if (cv && cx) { cx.scale(SCALE, SCALE); cx.translate(w / 2, h / 2); fn(cx); s = { cv, w, h, fn }; } else s = { cv: null, w, h, fn };
  cache.set(key, s);
  return s;
}
function blit(ctx, s, x, y, sc, sy) {
  sc = sc == null ? 1 : sc; sy = sy == null ? sc : sy;
  if (s.cv) ctx.drawImage(s.cv, x - s.w * sc / 2, y - s.h * sy / 2, s.w * sc, s.h * sy);
  else { ctx.save(); ctx.translate(x, y); ctx.scale(sc, sy); s.fn(ctx); ctx.restore(); }
}
// a one colour silhouette of a sprite (for hit flashes, glitch fringes, ghosts). null when there is no canvas.
function tinted(key, s, color) {
  const k = 'tint:' + key + ':' + color;
  let t = cache.get(k);
  if (t) return t.cv ? t : null;
  const cv = s.cv ? makeCanvas(s.cv.width, s.cv.height) : null;
  const c = cv && cv.getContext ? cv.getContext('2d') : null;
  if (c) { c.drawImage(s.cv, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height); t = { cv, w: s.w, h: s.h, fn: null }; } else t = { cv: null };
  cache.set(k, t);
  return t.cv ? t : null;
}

// ---------------------------------------------------------------- small helpers
const _sh = {};
function parse(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, a) {
  const k = hex + a;
  if (_sh[k]) return _sh[k];
  const [r0, g0, b0] = parse(hex);
  const to = a < 0 ? 0 : 255, p = Math.abs(a);
  return (_sh[k] = 'rgb(' + Math.round(r0 + (to - r0) * p) + ',' + Math.round(g0 + (to - g0) * p) + ',' + Math.round(b0 + (to - b0) * p) + ')');
}
function rgba(hex, a) { const k = hex + '@' + a; if (_sh[k]) return _sh[k]; const [r, g, b] = parse(hex); return (_sh[k] = 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'); }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mk(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
function ink(c, fill, lw) { if (fill) { c.fillStyle = fill; c.fill(); } c.lineWidth = lw == null ? 3 : lw; c.strokeStyle = OUT; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function circ(c, x, y, r, fill, lw) { c.beginPath(); c.arc(x, y, r, 0, TAU); ink(c, fill, lw); }
function ell(c, x, y, rx, ry, fill, lw, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ink(c, fill, lw); }
function line(c, x0, y0, x1, y1, col, lw) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.stroke(); }
function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g; }
function rg(c, x, y, r0, r1, stops) { const g = c.createRadialGradient(x, y, r0, x, y, r1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g; }
function spark(c, x, y, r, col) {
  c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r);
  c.fillStyle = col; c.fill();
}
function additive(ctx, on) { ctx.globalCompositeOperation = on ? 'lighter' : 'source-over'; }

// soft glow disc, tinted: drawn with 'lighter'
function glowSprite(col) { return sprite('glow:' + col, 96, 96, (c) => { c.fillStyle = rg(c, 0, 0, 0, 48, [0, rgba(col, 0.95), 0.25, rgba(col, 0.45), 0.6, rgba(col, 0.12), 1, rgba(col, 0)]); c.fillRect(-48, -48, 96, 96); }); }
function glow(ctx, col, x, y, r, a) {
  const g = glowSprite(col), ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (a == null ? 1 : a); ctx.globalCompositeOperation = 'lighter';
  if (g.cv) ctx.drawImage(g.cv, x - r, y - r, r * 2, r * 2);
  else { ctx.fillStyle = rg(ctx, x, y, 0, r, [0, rgba(col, 0.8), 1, rgba(col, 0)]); ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ga;
}
function shadow(ctx, x, y, rx, ry, a) {
  const s = sprite('shadow', 64, 32, (c) => { c.save(); c.scale(1, 0.5); c.fillStyle = rg(c, 0, 0, 0, 30, [0, 'rgba(8,2,24,0.62)', 0.6, 'rgba(8,2,24,0.28)', 1, 'rgba(8,2,24,0)']); c.beginPath(); c.arc(0, 0, 31, 0, TAU); c.fill(); c.restore(); });
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (a == null ? 1 : a);
  if (s.cv) ctx.drawImage(s.cv, x - rx, y - ry, rx * 2, ry * 2);
  else { ctx.fillStyle = 'rgba(8,2,24,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, rx * 0.8, ry * 0.8, 0, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = ga;
}

// ---------------------------------------------------------------- fur: the shared tactile body
// spiky irregular silhouette with `n` tufts around an ellipse
function furPath(c, rx, ry, n, amp, seed) {
  const R = mk(seed);
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = i * Math.PI / n - Math.PI / 2;
    const tip = i % 2;
    const k = tip ? 1 + amp * (0.55 + 0.6 * R()) : 0.9 + 0.04 * R();
    const px = Math.cos(a) * rx * k, py = Math.sin(a) * ry * k;
    if (i === 0) c.moveTo(px, py);
    else {
      const pa = (i - 1) * Math.PI / n - Math.PI / 2, pk = tip ? 0.92 : 1 + amp * 0.7;
      c.quadraticCurveTo(Math.cos((a + pa) / 2) * rx * pk * 0.96, Math.sin((a + pa) / 2) * ry * pk * 0.96, px, py);
    }
  }
  c.closePath();
}
// the lit fuzzy blob. o: { n, amp, seed, sx, sy, accent, strands, rim }
function furBlob(c, r, col, o) {
  o = o || {};
  const rx = r * (o.sx || 1), ry = r * (o.sy || 1), R = mk(o.seed || 7);
  furPath(c, rx, ry, o.n || 14, o.amp == null ? 0.24 : o.amp, o.seed || 7);
  c.fillStyle = rg(c, -rx * 0.32, -ry * 0.4, r * 0.1, r * 1.35, [0, shade(col, 0.55), 0.35, shade(col, 0.16), 0.78, shade(col, -0.2), 1, shade(col, -0.45)]);
  c.fill();
  c.save();
  furPath(c, rx, ry, o.n || 14, o.amp == null ? 0.24 : o.amp, o.seed || 7); c.clip();
  // ambient occlusion low and to the right, subsurface warmth in the middle
  c.fillStyle = lg(c, 0, -ry * 0.1, 0, ry * 1.1, [0, 'rgba(10,4,34,0)', 1, 'rgba(10,4,34,0.36)']); c.fillRect(-rx * 1.4, -ry * 1.4, rx * 2.8, ry * 2.8);
  c.fillStyle = rg(c, 0, ry * 0.1, 0, r * 0.8, [0, rgba(o.accent || shade(col, 0.45), 0.22), 1, rgba(o.accent || shade(col, 0.45), 0)]); c.fillRect(-rx, -ry, rx * 2, ry * 2);
  // strands: light on the lit side, dark on the shaded side
  const ns = o.strands == null ? 46 : o.strands;
  c.lineCap = 'round';
  for (let i = 0; i < ns; i++) {
    const a = R() * TAU, rad = r * (0.2 + 0.78 * Math.sqrt(R())), len = r * (0.14 + 0.26 * R());
    const x0 = Math.cos(a) * rad * (rx / r), y0 = Math.sin(a) * rad * (ry / r);
    const lit = (Math.cos(a) * -0.6 + Math.sin(a) * -0.8) > 0.05;
    const dir = a + (R() - 0.5) * 1.2;
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + Math.cos(dir + 0.7) * len * 0.6, y0 + Math.sin(dir + 0.7) * len * 0.6, x0 + Math.cos(dir) * len, y0 + Math.sin(dir) * len);
    c.strokeStyle = lit ? 'rgba(255,255,255,' + (0.1 + R() * 0.18).toFixed(2) + ')' : 'rgba(14,6,40,' + (0.1 + R() * 0.14).toFixed(2) + ')';
    c.lineWidth = 0.8 + R() * 1.1; c.stroke();
  }
  // static speckle and CRT scanlines (the Static is made of signal)
  for (let i = 0; i < 70; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(10,4,30,0.22)'; c.fillRect((R() * 2 - 1) * rx, (R() * 2 - 1) * ry, 1, 1); }
  c.fillStyle = 'rgba(10,4,34,0.07)'; for (let y = -ry; y < ry; y += 3) c.fillRect(-rx * 1.2, y, rx * 2.4, 1);
  // key light highlight and cool rim light
  c.save(); c.translate(-rx * 0.3, -ry * 0.42); c.rotate(-0.5); c.fillStyle = rg(c, 0, 0, 0, r * 0.5, [0, 'rgba(255,255,255,0.55)', 1, 'rgba(255,255,255,0)']); c.scale(1.5, 0.85); c.beginPath(); c.arc(0, 0, r * 0.5, 0, TAU); c.fill(); c.restore();
  c.beginPath(); c.arc(0, 0, r * 0.93, 0.15, 1.35); c.strokeStyle = 'rgba(120,235,255,0.5)'; c.lineWidth = r * 0.16; c.stroke();
  c.beginPath(); c.arc(0, 0, r * 0.95, 0.25, 1.15); c.strokeStyle = 'rgba(210,250,255,0.55)'; c.lineWidth = r * 0.05; c.stroke();
  c.restore();
  furPath(c, rx, ry, o.n || 14, o.amp == null ? 0.24 : o.amp, o.seed || 7); c.lineWidth = clampN(r * 0.12, 1.8, 3); c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke();
  // the outline reads as ink: a hair thicker on the shadow side
  c.save(); c.beginPath(); c.rect(0, 0, rx * 2, ry * 2); c.clip(); furPath(c, rx, ry, o.n || 14, o.amp == null ? 0.24 : o.amp, o.seed || 7); c.lineWidth = clampN(r * 0.17, 2.4, 3.8); c.stroke(); c.restore();
}
function feet(c, r, col) { for (const s of [-1, 1]) { ell(c, s * r * 0.42, r * 0.88, r * 0.26, r * 0.14, shade(col, -0.45), 2); } }

// ---------------------------------------------------------------- eyes: glossy googly eyes, pupils track the heading
const EYES = {
  fuzz: { dx: 0.36, y: -0.15, er: 0.3 }, zip: { dx: 0.32, y: -0.1, er: 0.3 }, brick: { dx: 0.36, y: -0.1, er: 0.2, brow: 1 },
  echo: { dx: 0.36, y: -0.12, er: 0.3 }, mini: { dx: 0.34, y: -0.1, er: 0.3 }, leech: { dx: 0.36, y: -0.1, er: 0.28 },
  drone: { dx: 0.32, y: -0.12, er: 0.27 }, gate: { dx: 0.36, y: -0.25, er: 0.26 }, squeal: { dx: 0.4, y: -0.35, er: 0.26, brow: 1 },
  mute: { dx: 0.34, y: -0.2, er: 0.27 }, rager: { dx: 0.34, y: -0.2, er: 0.25, brow: 1 },
};
function scleraSprite(er) {
  const q = Math.max(2, Math.round(er * 2) / 2);
  return sprite('sclera:' + q, q * 2 + 8, q * 2 + 8, (c) => {
    c.beginPath(); c.arc(0, 0, q, 0, TAU);
    c.fillStyle = rg(c, -q * 0.25, -q * 0.3, q * 0.1, q * 1.1, [0, '#ffffff', 0.7, '#eef0fb', 1, '#b9bddb']); c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, q, 0, TAU); c.clip();
    c.fillStyle = lg(c, 0, -q, 0, -q * 0.2, [0, 'rgba(30,10,70,0.28)', 1, 'rgba(30,10,70,0)']); c.fillRect(-q, -q, q * 2, q * 1.1);
    c.beginPath(); c.arc(0, q * 0.1, q * 0.92, 0.4, 2.7); c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = Math.max(1, q * 0.1); c.stroke();
    c.restore();
    c.beginPath(); c.arc(0, 0, q, 0, TAU); c.lineWidth = Math.max(1.4, q * 0.16); c.strokeStyle = OUT; c.stroke();
  });
}
function pupilSprite(er, rage) {
  const q = Math.max(2, Math.round(er * 2) / 2), pr = q * (rage ? 0.46 : 0.55);
  return sprite('pupil:' + q + (rage ? 'r' : ''), pr * 2 + 6, pr * 2 + 6, (c) => {
    c.beginPath(); c.arc(0, 0, pr, 0, TAU); c.fillStyle = rg(c, -pr * 0.3, -pr * 0.3, 0, pr, [0, '#3a2a78', 0.55, '#160a34', 1, '#06020f']); c.fill();
    if (rage) { c.beginPath(); c.arc(0, 0, pr, 0, TAU); c.strokeStyle = 'rgba(255,90,40,0.75)'; c.lineWidth = Math.max(1, q * 0.12); c.stroke(); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(-pr * 0.38, -pr * 0.42, pr * 0.34, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(pr * 0.35, pr * 0.38, pr * 0.15, 0, TAU); c.fill();
  });
}
function blitWH(c, s, x, y, w, h) {
  if (s.cv) c.drawImage(s.cv, x - w / 2, y - h / 2, w, h);
  else { c.save(); c.translate(x, y); c.scale(w / s.w, h / s.h); s.fn(c); c.restore(); }
}
function eye(c, x, y, er, ax, ay, o) {
  const s = scleraSprite(er), q = Math.max(2, Math.round(er * 2) / 2), k = er / q, blink = o.blink || 1;
  blitWH(c, s, x, y, s.w * k, s.h * k * blink);
  if (o.stun) {
    c.save(); c.translate(x, y); c.scale(1, blink);
    c.beginPath(); for (let i = 0; i < 22; i++) { const a = i * 0.55 + o.t * 8, rad = er * 0.1 + er * 0.62 * i / 22; const px = Math.cos(a) * rad, py = Math.sin(a) * rad; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }
    c.strokeStyle = OUT; c.lineWidth = Math.max(1, er * 0.14); c.stroke(); c.restore();
  } else {
    const p = pupilSprite(er, o.rage);
    blitWH(c, p, x + ax * er * 0.4, y + ay * er * 0.4 * blink, p.w * k, p.h * k * blink);
  }
}
function brows(c, r, es, angry) {
  const b = es.er * r;
  for (const s of [-1, 1]) {
    const x = s * es.dx * r, y = es.y * r;
    c.beginPath(); c.moveTo(x + s * b * 1.1, y - b * 1.35); c.lineTo(x - s * b * 0.9, y - b * 0.78); c.strokeStyle = OUT; c.lineWidth = Math.max(2.4, r * 0.17); c.lineCap = 'round'; c.stroke();
  }
}

// ---------------------------------------------------------------- body painters (cached). origin = centre, r = radius
const BODY = {
  fuzz(c, r, col) {
    feet(c, r, col);
    furBlob(c, r, col, { n: 15, amp: 0.27, seed: 3, accent: '#ffd6f0' });
    ell(c, 0, r * 0.38, r * 0.55, r * 0.38, 'rgba(255,255,255,0.14)', 0);
    c.beginPath(); c.moveTo(-r * 0.32, r * 0.4); c.quadraticCurveTo(0, r * 0.7, r * 0.32, r * 0.4); c.strokeStyle = OUT; c.lineWidth = 2.4; c.lineCap = 'round'; c.stroke();
    poly(c, [[-r * 0.14, r * 0.5], [-r * 0.04, r * 0.67], [r * 0.05, r * 0.52]]); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = OUT; c.stroke();
    for (const s of [-1, 1]) { c.beginPath(); c.arc(s * r * 0.58, r * 0.22, r * 0.14, 0, TAU); c.fillStyle = 'rgba(255,110,170,0.4)'; c.fill(); }
  },
  zip(c, r, col) {
    // a streamlined comet shard pointing +x
    c.beginPath(); c.moveTo(r * 1.3, 0); c.bezierCurveTo(r * 0.9, -r * 0.8, r * 0.1, -r * 1.0, -r * 0.95, -r * 0.6); c.lineTo(-r * 0.6, 0); c.lineTo(-r * 0.95, r * 0.6); c.bezierCurveTo(r * 0.1, r * 1.0, r * 0.9, r * 0.8, r * 1.3, 0); c.closePath();
    c.fillStyle = lg(c, 0, -r, 0, r, [0, shade(col, 0.55), 0.45, col, 1, shade(col, -0.55)]); c.fill();
    c.save(); c.clip();
    c.fillStyle = lg(c, -r, 0, r * 1.3, 0, [0, 'rgba(255,255,255,0)', 0.7, 'rgba(255,255,255,0.28)', 1, 'rgba(255,255,255,0.55)']); c.fillRect(-r, -r, r * 2.4, r * 2);
    c.fillStyle = 'rgba(10,4,34,0.07)'; for (let y = -r; y < r; y += 3) c.fillRect(-r, y, r * 2.4, 1);
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(r * 0.5, -r * 0.45); c.lineTo(-r * 0.1, -r * 0.05); c.lineTo(r * 0.15, -r * 0.02); c.lineTo(-r * 0.5, r * 0.4); c.stroke();
    c.beginPath(); c.arc(0, 0, r * 0.95, -0.8, -0.1); c.strokeStyle = 'rgba(160,255,240,0.6)'; c.lineWidth = r * 0.15; c.stroke();
    c.restore();
    c.beginPath(); c.moveTo(r * 1.3, 0); c.bezierCurveTo(r * 0.9, -r * 0.8, r * 0.1, -r * 1.0, -r * 0.95, -r * 0.6); c.lineTo(-r * 0.6, 0); c.lineTo(-r * 0.95, r * 0.6); c.bezierCurveTo(r * 0.1, r * 1.0, r * 0.9, r * 0.8, r * 1.3, 0); c.closePath(); ink(c, null, 2.8);
    for (const s of [-1, 1]) { poly(c, [[-r * 0.7, s * r * 0.5], [-r * 1.35, s * r * 0.85], [-r * 0.95, s * r * 0.2]]); ink(c, shade(col, -0.35), 2); }
  },
  brick(c, r, col) {
    for (const s of [-1, 1]) { rr(c, s * r * 0.5 - r * 0.22, r * 0.72, r * 0.44, r * 0.3, 3); ink(c, shade(col, -0.55), 2.2); }
    rr(c, -r, -r * 0.86, r * 2, r * 1.76, r * 0.22);
    c.fillStyle = lg(c, -r, -r, r, r, [0, shade(col, 0.5), 0.4, col, 1, shade(col, -0.55)]); c.fill();
    c.save(); rr(c, -r, -r * 0.86, r * 2, r * 1.76, r * 0.22); c.clip();
    c.strokeStyle = 'rgba(20,10,50,0.5)'; c.lineWidth = 1.6; c.beginPath();
    for (let k = 1; k < 4; k++) { const y = -r * 0.86 + k * r * 0.44; c.moveTo(-r, y); c.lineTo(r, y); }
    for (let k = 0; k < 4; k++) { const y0 = -r * 0.86 + k * r * 0.44, off = (k % 2) * r * 0.5; for (let x = -r * 0.5 + off; x < r; x += r) { c.moveTo(x, y0); c.lineTo(x, y0 + r * 0.44); } }
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1.2; c.beginPath(); for (let k = 0; k < 4; k++) { const y = -r * 0.86 + k * r * 0.44 + 1.5; c.moveTo(-r, y); c.lineTo(r, y); } c.stroke();
    // steel bands
    for (const by of [-0.5, 0.42]) { rr(c, -r, r * by - r * 0.1, r * 2, r * 0.2, 2); c.fillStyle = lg(c, 0, r * by - r * 0.1, 0, r * by + r * 0.1, [0, '#d4daf0', 0.5, '#8e96b8', 1, '#4e5678']); c.fill(); c.lineWidth = 1.4; c.strokeStyle = OUT; c.stroke(); }
    const R = mk(11); for (let i = 0; i < 60; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.2)' : 'rgba(10,4,30,0.25)'; c.fillRect((R() * 2 - 1) * r, (R() * 2 - 1) * r * 0.86, 1, 1); }
    c.beginPath(); c.moveTo(r * 0.55, -r * 0.86); c.lineTo(r * 0.45, -r * 0.55); c.lineTo(r * 0.62, -r * 0.4); c.lineTo(r * 0.5, -r * 0.2); c.strokeStyle = 'rgba(20,8,40,0.65)'; c.lineWidth = 1.4; c.stroke();
    c.fillStyle = rg(c, -r * 0.5, -r * 0.6, 0, r * 1.2, [0, 'rgba(255,255,255,0.3)', 1, 'rgba(255,255,255,0)']); c.fillRect(-r, -r, r * 2, r * 2);
    c.restore();
    rr(c, -r, -r * 0.86, r * 2, r * 1.76, r * 0.22); ink(c, null, 3);
    for (const [bx, by] of [[-0.82, -0.5], [0.82, -0.5], [-0.82, 0.42], [0.82, 0.42]]) { circ(c, bx * r, by * r, r * 0.07, '#e4e8fa', 1); c.beginPath(); c.arc(bx * r - 0.6, by * r - 0.6, r * 0.025, 0, TAU); c.fillStyle = '#fff'; c.fill(); }
    // grumpy mouth slit with teeth
    rr(c, -r * 0.5, r * 0.5, r, r * 0.22, 3); ink(c, '#1c0c34', 1.6);
    c.beginPath(); for (let i = 0; i < 5; i++) { const x = -r * 0.44 + i * r * 0.22; c.moveTo(x, r * 0.5); c.lineTo(x + r * 0.08, r * 0.62); c.lineTo(x + r * 0.16, r * 0.5); } c.fillStyle = '#f0f0ff'; c.fill();
  },
  echo(c, r, col) {
    feet(c, r, col);
    furBlob(c, r, col, { n: 12, amp: 0.2, seed: 5, accent: '#e0d0ff' });
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.6; c.lineCap = 'round';
    for (const k of [0.45, 0.66]) { c.beginPath(); c.arc(0, r * 0.22, r * k, 0.35, 2.8); c.stroke(); }
    c.beginPath(); c.arc(0, r * 0.42, r * 0.2, 0.1, Math.PI - 0.1); c.strokeStyle = OUT; c.lineWidth = 2.2; c.stroke();
  },
  mini(c, r, col) { furBlob(c, r, col, { n: 9, amp: 0.22, seed: 9, strands: 22, accent: '#efe6ff' }); c.beginPath(); c.arc(0, r * 0.42, r * 0.22, 0.2, Math.PI - 0.2); c.strokeStyle = OUT; c.lineWidth = 1.8; c.stroke(); },
  leech(c, r, col) {
    feet(c, r, col);
    furBlob(c, r, col, { n: 13, amp: 0.17, seed: 8, accent: '#d6ffd0' });
    // a glowing healing cross on the belly
    c.fillStyle = 'rgba(255,255,255,0.95)'; rr(c, -r * 0.1, r * 0.1, r * 0.2, r * 0.5, 2); c.fill(); rr(c, -r * 0.25, r * 0.25, r * 0.5, r * 0.2, 2); c.fill();
    c.lineWidth = 1.4; c.strokeStyle = OUT; rr(c, -r * 0.1, r * 0.1, r * 0.2, r * 0.5, 2); c.stroke(); rr(c, -r * 0.25, r * 0.25, r * 0.5, r * 0.2, 2); c.stroke();
    // antenna with a bulb
    line(c, 0, -r * 0.92, 0, -r * 1.3, OUT, 3); circ(c, 0, -r * 1.34, r * 0.13, '#eaffe0', 1.6);
  },
  drone(c, r, col) {
    for (const s of [-1, 1]) { line(c, s * r * 0.5, -r * 0.1, s * r * 1.15, -r * 0.72, OUT, 4.4); line(c, s * r * 0.5, -r * 0.1, s * r * 1.15, -r * 0.72, '#b8aad8', 2.2); circ(c, s * r * 1.15, -r * 0.72, r * 0.12, '#e8defa', 1.4); }
    circ(c, 0, 0, r, lg(c, -r, -r, r, r, [0, shade(col, 0.6), 0.45, col, 1, shade(col, -0.6)]), 3);
    c.save(); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip();
    c.fillStyle = 'rgba(10,4,34,0.08)'; for (let y = -r; y < r; y += 3) c.fillRect(-r, y, r * 2, 1);
    c.fillStyle = lg(c, 0, r * 0.2, 0, r, [0, 'rgba(10,4,34,0)', 1, 'rgba(10,4,34,0.45)']); c.fillRect(-r, 0, r * 2, r);
    c.restore();
    // glass dome with reflections
    c.beginPath(); c.ellipse(0, -r * 0.1, r * 0.78, r * 0.62, 0, Math.PI, 0); c.lineTo(r * 0.78, r * 0.1); c.lineTo(-r * 0.78, r * 0.1); c.closePath(); c.fillStyle = 'rgba(40,20,90,0.55)'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.arc(-r * 0.15, -r * 0.18, r * 0.62, Math.PI * 1.12, Math.PI * 1.62); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = r * 0.1; c.stroke();
    rr(c, -r * 0.5, r * 0.42, r, r * 0.2, 3); ink(c, '#3a2450', 1.4);
    for (let i = 0; i < 4; i++) c.fillStyle = 'rgba(255,170,220,0.7)', c.fillRect(-r * 0.36 + i * r * 0.2, r * 0.48, r * 0.12, r * 0.07);
  },
  gate(c, r, col) {
    feet(c, r, col);
    furBlob(c, r, col, { n: 12, amp: 0.15, seed: 12, accent: '#fff0b0' });
    // portcullis grille over the mouth
    rr(c, -r * 0.6, r * 0.22, r * 1.2, r * 0.62, 4); ink(c, 'rgba(60,34,6,0.88)', 2.2);
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * r * 0.22, r * 0.22); c.lineTo(i * r * 0.22, r * 0.82); c.strokeStyle = lg(c, 0, 0, 0, r * 0.8, [0, '#fff0a8', 1, '#c9902a']); c.lineWidth = 2.6; c.stroke(); }
    c.beginPath(); c.moveTo(-r * 0.6, r * 0.45); c.lineTo(r * 0.6, r * 0.45); c.strokeStyle = '#e8b840'; c.lineWidth = 2; c.stroke();
    // a little arch crest
    c.beginPath(); c.moveTo(-r * 0.22, -r * 0.88); c.lineTo(-r * 0.22, -r * 1.12); c.arc(0, -r * 1.12, r * 0.22, Math.PI, 0); c.lineTo(r * 0.22, -r * 0.88); c.closePath(); ink(c, '#ffd26b', 2);
  },
  squeal(c, r, col) {
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9 + 0.2, ca = Math.cos(a), sa = Math.sin(a);
      c.beginPath(); c.moveTo(ca * r * 0.88 - sa * r * 0.14, sa * r * 0.88 + ca * r * 0.14); c.lineTo(ca * r * 1.42 - sa * r * 0.3, sa * r * 1.42 + ca * r * 0.3); c.lineTo(ca * r * 1.42 + sa * r * 0.3, sa * r * 1.42 - ca * r * 0.3); c.lineTo(ca * r * 0.88 + sa * r * 0.14, sa * r * 0.88 - ca * r * 0.14); c.closePath(); ink(c, lg(c, 0, -r * 1.4, 0, r * 1.4, [0, shade('#9aa0c0', 0.3), 1, shade('#4a5070', -0.2)]), 2);
      c.beginPath(); c.ellipse(ca * r * 1.42, sa * r * 1.42, r * 0.3, r * 0.1, a + Math.PI / 2, 0, TAU); c.fillStyle = '#2a0c14'; c.fill();
    }
    furBlob(c, r, col, { n: 12, amp: 0.1, seed: 4, strands: 30, accent: '#ffc0c0' });
    ell(c, 0, r * 0.38, r * 0.5, r * 0.4, rg(c, 0, r * 0.38, 0, r * 0.5, [0, '#120008', 1, '#4a0a1c']), 2.2);
    ell(c, 0, r * 0.5, r * 0.28, r * 0.15, '#ff7090', 0);
    for (const k of [0.62, 0.8]) { c.beginPath(); c.ellipse(0, r * 0.38, r * 0.5 * k + r * 0.12, r * 0.4 * k + r * 0.1, 0, 0, TAU); c.strokeStyle = 'rgba(255,170,180,0.35)'; c.lineWidth = 1; c.stroke(); }
    c.beginPath(); c.moveTo(-r * 0.6, -r * 0.05); c.lineTo(-r * 0.4, -r * 0.2); c.lineTo(-r * 0.5, 0.0); c.strokeStyle = 'rgba(120,0,30,0.5)'; c.lineWidth = 1.2; c.stroke();
  },
  mute(c, r, col) {
    // a sheet ghost: translucent, glowing from inside, zipped mouth
    c.beginPath(); c.moveTo(-r, r * 0.95); c.lineTo(-r, -r * 0.1); c.arc(0, -r * 0.1, r, Math.PI, 0); c.lineTo(r, r * 0.95);
    for (let i = 0; i < 4; i++) c.quadraticCurveTo(r - (i * 2 + 0.5) * r / 4, r * 1.35, r - (i + 1) * r / 2, r * 0.95);
    c.closePath();
    c.fillStyle = rg(c, -r * 0.3, -r * 0.5, r * 0.1, r * 1.6, [0, shade(col, 0.8), 0.5, shade(col, 0.2), 1, shade(col, -0.35)]); c.fill();
    c.save(); c.clip();
    c.fillStyle = rg(c, 0, 0, 0, r, [0, 'rgba(255,255,255,0.4)', 1, 'rgba(255,255,255,0)']); c.fillRect(-r, -r * 1.2, r * 2, r * 2.6);
    c.fillStyle = 'rgba(30,20,100,0.08)'; for (let y = -r * 1.1; y < r * 1.4; y += 3) c.fillRect(-r, y, r * 2, 1);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.4; for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.moveTo(k * r, r * 0.2); c.quadraticCurveTo(k * r * 1.2, r * 0.7, k * r * 0.9, r * 1.1); c.stroke(); }
    c.fillStyle = lg(c, 0, r * 0.2, 0, r * 1.3, [0, 'rgba(20,10,80,0)', 1, 'rgba(20,10,80,0.4)']); c.fillRect(-r, r * 0.2, r * 2, r * 1.2);
    c.restore();
    c.beginPath(); c.moveTo(-r, r * 0.95); c.lineTo(-r, -r * 0.1); c.arc(0, -r * 0.1, r, Math.PI, 0); c.lineTo(r, r * 0.95); for (let i = 0; i < 4; i++) c.quadraticCurveTo(r - (i * 2 + 0.5) * r / 4, r * 1.35, r - (i + 1) * r / 2, r * 0.95); c.closePath(); ink(c, null, 2.8);
    // zipper
    line(c, -r * 0.34, r * 0.34, r * 0.34, r * 0.34, OUT, 3.2);
    for (let i = -3; i <= 3; i++) line(c, i * r * 0.09, r * 0.28, i * r * 0.09, r * 0.4, '#e0e8ff', 1.4);
    circ(c, r * 0.36, r * 0.34, r * 0.06, '#d8e0ff', 1.2);
    for (const s of [-1, 1]) { c.beginPath(); c.arc(s * r * 0.55, r * 0.12, r * 0.14, 0, TAU); c.fillStyle = 'rgba(255,140,190,0.45)'; c.fill(); }
  },
  rager(c, r, col) {
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * r * 0.4, -r * 0.7); c.quadraticCurveTo(s * r * 0.8, -r * 1.1, s * r * 1.0, -r * 1.45); c.strokeStyle = OUT; c.lineWidth = 3.6; c.lineCap = 'round'; c.stroke();
      circ(c, s * r * 1.0, -r * 1.45, r * 0.13, '#ffd23c', 1.4);
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(s * r * 0.72, r * (0.0 + k * 0.32)); c.quadraticCurveTo(s * r * 1.2, r * (0.05 + k * 0.34), s * r * 1.28, r * (0.4 + k * 0.4)); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke(); }
    }
    ell(c, 0, 0, r, r * 0.92, lg(c, -r, -r, r, r, [0, shade(col, 0.55), 0.45, col, 1, shade(col, -0.6)]), 3);
    c.save(); c.beginPath(); c.ellipse(0, 0, r, r * 0.92, 0, 0, TAU); c.clip();
    c.strokeStyle = 'rgba(30,10,10,0.35)'; c.lineWidth = 1.6; for (const k of [-0.5, 0.0, 0.5]) { c.beginPath(); c.moveTo(-r, r * k); c.quadraticCurveTo(0, r * (k + 0.18), r, r * k); c.stroke(); }
    c.fillStyle = 'rgba(10,4,34,0.08)'; for (let y = -r; y < r; y += 3) c.fillRect(-r, y, r * 2, 1);
    c.fillStyle = rg(c, -r * 0.4, -r * 0.5, 0, r, [0, 'rgba(255,255,255,0.45)', 1, 'rgba(255,255,255,0)']); c.fillRect(-r, -r, r * 2, r * 2);
    c.beginPath(); c.arc(0, 0, r * 0.9, 0.15, 1.3); c.strokeStyle = 'rgba(255,200,120,0.55)'; c.lineWidth = r * 0.14; c.stroke();
    c.restore();
    ell(c, 0, 0, r, r * 0.92, null, 3);
    for (const s of [-1, 1]) { poly(c, [[s * r * 0.55, -r * 0.8], [s * r * 0.3, -r * 1.3], [s * r * 0.1, -r * 0.82]]); ink(c, lg(c, 0, -r * 1.3, 0, -r * 0.8, [0, '#fff4d8', 1, '#e0a050']), 1.8); }
    c.beginPath(); c.moveTo(-r * 0.46, r * 0.5); for (let i = 0; i < 6; i++) c.lineTo(-r * 0.46 + (i + 1) * r * 0.15, r * (i % 2 ? 0.5 : 0.34)); c.strokeStyle = OUT; c.lineWidth = 2.2; c.stroke();
    c.beginPath(); for (let i = 0; i < 5; i++) { const x = -r * 0.36 + i * r * 0.18; c.moveTo(x, r * 0.5); c.lineTo(x + r * 0.09, r * 0.4); c.lineTo(x + r * 0.18, r * 0.5); } c.fillStyle = '#fff'; c.fill();
  },
};
const ROT_BODY = { zip: 1 };
function bodySprite(type, r) { return sprite('b:' + type, r * 3.2 + 12, r * 3.2 + 12, (c) => BODY[type](c, r, ENEMIES[type].color)); }

// ---------------------------------------------------------------- pre-rendered overlays
function hexShield(r) {
  return sprite('hex:' + Math.round(r), r * 3.2 + 8, r * 3.2 + 8, (c) => {
    const R = r * 1.45;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = rg(c, 0, 0, R * 0.55, R, [0, 'rgba(255,220,120,0.04)', 0.85, 'rgba(255,225,130,0.2)', 1, 'rgba(255,240,170,0.5)']); c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
    const s = r * 0.42; c.strokeStyle = 'rgba(255,236,150,0.55)'; c.lineWidth = 1.2;
    for (let row = -4; row <= 4; row++) for (let col = -4; col <= 4; col++) {
      const cx = col * s * 1.73 + (row % 2) * s * 0.866, cy = row * s * 1.5;
      c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; const px = cx + Math.cos(a) * s, py = cy + Math.sin(a) * s; if (k === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.closePath(); c.stroke();
    }
    c.restore();
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.strokeStyle = 'rgba(255,240,170,0.9)'; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.arc(0, 0, R * 0.94, 3.5, 4.5); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.stroke();
  });
}
function armorPlates(r) {
  return sprite('plates:' + Math.round(r), r * 3.2 + 8, r * 3.2 + 8, (c) => {
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + 0.3, x = Math.cos(a) * r * 1.12, y = Math.sin(a) * r * 1.12;
      c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2);
      rr(c, -r * 0.3, -r * 0.14, r * 0.6, r * 0.28, 3); ink(c, lg(c, 0, -r * 0.14, 0, r * 0.14, [0, '#e8ecfc', 0.5, '#9aa2c4', 1, '#545c80']), 1.8);
      circ(c, 0, 0, r * 0.05, '#fff', 0.8); c.restore();
    }
  });
}

// ---------------------------------------------------------------- the enemy
function hpBar(c, w, y, frac, h) {
  h = h || 5;
  rr(c, -w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3.5); c.fillStyle = 'rgba(10,4,32,0.92)'; c.fill();
  const f = clampN(frac, 0, 1);
  if (f > 0) {
    const col = f > 0.5 ? ['#b4ff9a', '#37d46a'] : f > 0.25 ? ['#ffe27a', '#e8a21c'] : ['#ff8a96', '#d8243e'];
    rr(c, -w / 2, y, w * f, h, 2.4); c.fillStyle = col[1]; c.fill(); c.fillStyle = col[0]; c.fillRect(-w / 2 + 1, y + 0.6, Math.max(0, w * f - 2), h * 0.5);
  }
}
function flame(c, x, y, s, t, ph) {
  const w = Math.sin(t * 16 + ph) * s * 0.12;
  c.beginPath(); c.moveTo(x, y - s * 1.5 + w); c.bezierCurveTo(x + s * 1.0, y - s * 0.5, x + s * 0.9, y + s * 0.6, x, y + s * 0.6); c.bezierCurveTo(x - s * 0.9, y + s * 0.6, x - s * 1.0, y - s * 0.4, x, y - s * 1.5 + w);
  c.fillStyle = lg(c, 0, y - s * 1.5, 0, y + s * 0.6, [0, '#ffe14d', 0.5, '#ff9a3c', 1, '#e0361c']); c.fill();
  c.beginPath(); c.arc(x, y + s * 0.15, s * 0.34, 0, TAU); c.fillStyle = '#fff6c0'; c.fill();
}
function icicle(c, x, y, s) { poly(c, [[x - s * 0.4, y], [x + s * 0.4, y], [x + s * 0.1, y + s * 1.5]]); c.fillStyle = '#c4efff'; c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(30,60,120,0.8)'; c.stroke(); }

export function drawEnemy(ctx, type, x, y, o) {
  const def = ENEMIES[type];
  if (!def || !BODY[type]) return;
  o = o || {};
  const t = o.t || 0;
  const r = def.r, sc = o.scale == null ? 1 : o.scale;
  const hs = hashStr(type + (o.id || '')) % 628 / 100;
  const aff = o.affix ? AFFIXES[o.affix] : null;
  const ang = o.ang || 0, ca = Math.cos(ang), sa = Math.sin(ang);
  const fl = !!def.flying, ghost = type === 'mute';
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.translate(x, y);
  // ---- contact shadow, smaller and fainter when the creature is up in the air
  const hop = fl ? 0 : Math.abs(Math.sin(t * 6 + hs));
  const lift = fl ? r * 0.9 : ghost ? r * 0.6 : hop * 3;
  shadow(ctx, 0, (fl ? r * 1.6 + 8 : r * 0.92) * sc, r * (1.25 - lift * 0.02) * sc, r * 0.42 * sc, clampN(1 - lift * 0.02, 0.4, 1));
  const wob = o.stun ? 0 : Math.sin(t * 8 + hs);
  const bob = fl ? Math.sin(t * 4 + hs) * 3 - 5 : ghost ? Math.sin(t * 2.4 + hs) * 3 - 4 : -hop * 2.4;
  const sx = sc * (1 + wob * 0.05 + (fl ? 0 : hop * 0.03)), sy = sc * (1 - wob * 0.05 - (fl ? 0 : hop * 0.03) + (hop > 0.85 ? 0.04 : 0));
  // ---- aura glows behind (additive)
  if (o.rage) glow(ctx, '#ff5a2a', 0, bob * sc, r * 2.7 * sc, 0.55 + 0.2 * Math.sin(t * 12));
  if (aff && aff.id === 'golden') glow(ctx, '#ffd44d', 0, bob * sc, r * 2.9 * sc, 0.7 + 0.2 * Math.sin(t * 4 + hs));
  if (aff && aff.id === 'regen') glow(ctx, '#7dffa0', 0, bob * sc, r * 2.6 * sc, 0.4 + 0.25 * Math.sin(t * 3));
  if (aff && aff.id === 'giant') glow(ctx, '#ff8a3c', 0, bob * sc, r * 2.6 * sc, 0.4);
  if (aff && aff.id === 'swift') glow(ctx, '#6dffd8', 0, bob * sc, r * 2.2 * sc, 0.35);
  if (type === 'leech') {
    const k = (t * 0.9 + hs) % 1;
    glow(ctx, '#8fffa0', 0, bob * sc, r * (2.3 + 0.3 * Math.sin(t * 3)) * sc, 0.45);
    ctx.save(); ctx.globalAlpha *= 0.5 * (1 - k); ctx.strokeStyle = '#a8ffb8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, bob * sc, r * (1.1 + k * 1.1) * sc, 0, TAU); ctx.stroke(); ctx.restore();
  }
  if (type === 'squeal') for (let i = 0; i < 2; i++) { const k = (t * 1.3 + i * 0.5 + hs) % 1; ctx.save(); ctx.globalAlpha *= 0.55 * (1 - k); ctx.strokeStyle = '#ff7a7a'; ctx.lineWidth = 2.4 * (1 - k) + 0.6; ctx.beginPath(); ctx.arc(0, bob * sc, r * (1.4 + k * 1.3) * sc, 0, TAU); ctx.stroke(); ctx.restore(); }
  if (type === 'drone') glow(ctx, '#ff9ad2', 0, (r * 1.15 + bob) * sc, r * 1.2 * sc, 0.55 + 0.25 * Math.sin(t * 20));
  if (type === 'mute') glow(ctx, '#a8c0ff', 0, bob * sc, r * 2.4 * sc, 0.4 + 0.15 * Math.sin(t * 2));
  // swift afterimages trail behind along the heading
  const body = bodySprite(type, r);
  const bkey = 'b:' + type;
  if (aff && aff.id === 'swift') {
    const tn = tinted(bkey, body, '#6dffd8');
    if (tn) for (let i = 3; i >= 1; i--) { ctx.save(); ctx.globalAlpha *= 0.16 * (4 - i); additive(ctx, true); blit(ctx, tn, -ca * r * 0.7 * i * sc, (bob - sa * r * 0.7 * i) * sc / sc, sx, sy); ctx.restore(); }
  }
  // echo ghosts breathe in and out of the body
  if (type === 'echo') {
    const tn = tinted(bkey, body, '#d8c8ff');
    for (const s of [-1, 1]) { const off = (0.35 + 0.18 * Math.sin(t * 3 + hs)) * r * s; ctx.save(); ctx.globalAlpha *= 0.3; if (tn) { additive(ctx, true); blit(ctx, tn, off * sc, bob, sx, sy); } else blit(ctx, body, off * sc, bob, sx, sy); ctx.restore(); }
  }
  // ---- chromatic glitch fringes now and then (always while hurt)
  const glitching = (o.hit || 0) > 0.15 || ((t * 1.3 + hs) % 4.2) < 0.18 || (type === 'zip' && ((t * 3 + hs) % 2) < 0.2);
  if (glitching) {
    const j = (((t * 40) % 3) - 1.5) * 0.9 + 1.4;
    const cy = tinted(bkey, body, '#2fe6ff'), mg = tinted(bkey, body, '#ff3cc8');
    if (cy && mg) {
      ctx.save(); ctx.globalAlpha *= type === 'zip' ? 0.35 : 0.6; additive(ctx, true);
      if (ROT_BODY[type]) { ctx.save(); ctx.translate(0, bob * sc); ctx.rotate(ang); blit(ctx, cy, j, 0, sx, sy); blit(ctx, mg, -j, 1, sx, sy); ctx.restore(); }
      else { blit(ctx, cy, j, bob * sc, sx, sy); blit(ctx, mg, -j, bob * sc + 1, sx, sy); }
      ctx.restore();
    }
  }
  // ---- the body
  ctx.save();
  if (type === 'mute') { ctx.globalAlpha *= 0.86; ctx.transform(1, 0, Math.sin(t * 2 + hs) * 0.07, 1, 0, 0); }
  ctx.translate(0, bob * sc);
  if (ROT_BODY[type]) ctx.rotate(ang);
  blit(ctx, body, 0, 0, sx, sy);
  // rage and golden tints sit on top of the fur
  if (o.rage) { const tn = tinted(bkey, body, '#ff3a1a'); if (tn) { ctx.globalAlpha *= 0.28 + 0.12 * Math.sin(t * 14); blit(ctx, tn, 0, 0, sx, sy); } }
  if (aff && aff.id === 'golden') { const tn = tinted(bkey, body, '#ffd44d'); if (tn) { ctx.globalAlpha *= 0.3; blit(ctx, tn, 0, 0, sx, sy); } }
  if (o.slow) { const tn = tinted(bkey, body, '#9fe6ff'); if (tn) { ctx.globalAlpha *= 0.3; blit(ctx, tn, 0, 0, sx, sy); } }
  if (o.burn) { const tn = tinted(bkey, body, '#ff6a1a'); if (tn) { ctx.globalAlpha *= 0.22 + 0.1 * Math.sin(t * 18); blit(ctx, tn, 0, 0, sx, sy); } }
  ctx.restore();
  ctx.save(); ctx.scale(sc, sc); ctx.translate(0, bob);
  // ---- type specific moving parts
  if (type === 'drone') {
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * r * 1.15, -r * 0.72); ctx.scale(1, 0.34);
      ctx.globalAlpha *= 0.55; ctx.fillStyle = rg(ctx, 0, 0, 0, r * 1.0, [0, 'rgba(255,255,255,0.15)', 0.8, 'rgba(235,220,255,0.55)', 1, 'rgba(255,255,255,0)']); ctx.beginPath(); ctx.arc(0, 0, r * 1.0, 0, TAU); ctx.fill();
      ctx.rotate(t * 34 * s); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-r * 0.95, -r * 0.07, r * 1.9, r * 0.14); ctx.restore();
    }
    ctx.fillStyle = Math.sin(t * 9 + hs) > 0 ? '#ff4a7a' : '#ffd0e0'; ctx.beginPath(); ctx.arc(0, r * 0.52, r * 0.06, 0, TAU); ctx.fill();
  }
  if (type === 'rager') for (let i = 0; i < (o.rage ? 6 : 2); i++) { const k = (t * 1.6 + i * 0.37 + hs) % 1; ctx.save(); ctx.globalAlpha *= 1 - k; additive(ctx, true); spark(ctx, Math.sin(i * 2.1 + hs) * r * 0.9, -r * 0.8 - k * r * 1.1, 2.6, '#ffb040'); ctx.restore(); }
  if (type === 'echo') for (let i = 0; i < 2; i++) { const k = (t * 0.8 + i * 0.5 + hs) % 1; ctx.save(); ctx.globalAlpha *= 0.5 * (1 - k); ctx.strokeStyle = '#d8c8ff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(r * 0.2, -r * 0.1, r * (0.9 + k * 0.8), -0.9, 0.9); ctx.stroke(); ctx.restore(); }
  if (type === 'mute') for (let i = 0; i < 3; i++) { const a = t * 1.3 + i * 2.1 + hs; ctx.save(); additive(ctx, true); spark(ctx, Math.cos(a) * r * 1.2, Math.sin(a * 1.3) * r * 0.9, 2.4, '#c8d8ff'); ctx.restore(); }
  // ---- eyes
  const es = EYES[type];
  if (es) {
    const ax = Math.cos(ang), ay = Math.sin(ang) * 0.6 + 0.35;
    const jx = Math.sin(t * 9 + hs) * 0.18;
    const blink = ((t * 0.9 + hs) % 3.4) < 0.1 ? 0.15 : 1;
    const eo = { t, stun: o.stun, rage: o.rage || es.brow, blink };
    eye(ctx, -es.dx * r, es.y * r, es.er * r, ax + jx, ay, eo);
    eye(ctx, es.dx * r, es.y * r, es.er * r, ax - jx, ay, eo);
    if (es.brow || o.rage) brows(ctx, r, es, true);
  }
  // ---- affixes
  if (aff) {
    if (aff.id === 'armored') { const pl = armorPlates(r); blit(ctx, pl, 0, 0, 1); }
    if (aff.id === 'giant') { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,150,60,0.8)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.22, 0, TAU); ctx.stroke(); }
    if (aff.id === 'swift') for (let i = -1; i <= 1; i++) { const px = -sa * i * r * 0.5, py = ca * i * r * 0.5; ctx.save(); additive(ctx, true); line(ctx, -ca * r * 1.3 + px, -sa * r * 1.3 + py, -ca * r * 2.3 + px, -sa * r * 2.3 + py, 'rgba(109,255,216,0.7)', 2.2); ctx.restore(); }
    if (aff.id === 'regen') for (let i = 0; i < 3; i++) { const k = (t * 1.2 + i / 3) % 1; ctx.save(); ctx.globalAlpha *= 1 - k; ctx.fillStyle = '#8fffa0'; const px = (i - 1) * r * 0.55, py = -r * 1.0 - k * r * 0.9; ctx.fillRect(px - 1.2, py - 4, 2.4, 8); ctx.fillRect(px - 4, py - 1.2, 8, 2.4); ctx.restore(); }
    if (aff.id === 'golden') { additive(ctx, true); for (let i = 0; i < 3; i++) { const a = t * 2.4 + i * 2.094 + hs, rad = r * (1.15 + 0.12 * Math.sin(t * 5 + i)); spark(ctx, Math.cos(a) * rad, Math.sin(a) * rad * 0.9, 3.6 + (i % 2) * 1.6, '#fff4a8'); } additive(ctx, false); }
  }
  // ---- status overlays
  if (o.slow) {
    ctx.strokeStyle = 'rgba(200,244,255,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0.4, 2.7); ctx.stroke();
    for (let i = 0; i < 3; i++) icicle(ctx, (i - 1) * r * 0.6, r * (0.82 + (i % 2) * 0.1), r * 0.26);
    ctx.save(); additive(ctx, true); spark(ctx, Math.sin(t * 3) * r, -r * 0.6 + Math.cos(t * 4) * r * 0.3, 3, '#e6faff'); ctx.restore();
  }
  if (o.burn) for (let i = 0; i < 4; i++) {
    const k = (t * 1.5 + i * 0.25) % 1, px = Math.sin(i * 2.4 + hs) * r * 0.7;
    ctx.save(); ctx.globalAlpha *= 1 - k * 0.6; flame(ctx, px, -r * 0.9 - k * r * 0.7, (i % 2 ? 3.4 : 4.6) * (1 - k * 0.4), t, i); ctx.restore();
    ctx.save(); additive(ctx, true); ctx.globalAlpha *= 1 - k; ctx.fillStyle = '#ffb04a'; ctx.fillRect(px + Math.sin(t * 7 + i) * 4, -r * 1.5 - k * r, 1.6, 1.6); ctx.restore();
  }
  if (o.mark) {
    ctx.save(); additive(ctx, true); ctx.rotate(t * 1.6); ctx.strokeStyle = '#ff4060'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0.2, TAU - 0.2); ctx.stroke();
    ctx.globalAlpha *= 0.4; ctx.lineWidth = 6; ctx.stroke(); ctx.globalAlpha /= 0.4;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; line(ctx, Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, Math.cos(a) * r * 1.85, Math.sin(a) * r * 1.85, '#ff7088', 2.4); }
    ctx.restore();
  }
  if (o.shield > 0) {
    const s = clampN(o.shield, 0, 1), hx = hexShield(r);
    ctx.save(); ctx.globalAlpha *= 0.35 + 0.65 * s; ctx.rotate(t * 0.25); if (o.hit > 0) additive(ctx, true); blit(ctx, hx, 0, 0, 1); ctx.restore();
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, 0, r * 1.62, -Math.PI / 2, -Math.PI / 2 + TAU * s); ctx.stroke(); ctx.restore();
  }
  if (o.stun) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.094; ctx.save(); additive(ctx, true); spark(ctx, Math.cos(a) * r * 0.85, -r * 1.3 + Math.sin(a) * 3.4, 4.6, '#ffe85a'); ctx.restore(); spark(ctx, Math.cos(a) * r * 0.85, -r * 1.3 + Math.sin(a) * 3.4, 3, '#fff6b0'); }
  ctx.restore();
  // ---- hit flash silhouette
  if ((o.hit || 0) > 0) {
    const tn = tinted(bkey, body, '#ffffff');
    ctx.save(); ctx.globalAlpha *= clampN(o.hit * 0.8, 0, 0.8); ctx.translate(0, bob * sc); if (ROT_BODY[type]) ctx.rotate(ang);
    if (tn) blit(ctx, tn, 0, 0, sx, sy); else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * sc, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  if (o.hp != null && o.hp < 0.999) hpBar(ctx, r * 1.8 * sc + 6, -r * 1.4 * sc - 8, o.hp, 4);
  ctx.restore();
}

// ================================================================ BOSSES
// Bosses are drawn live (one or two on screen): layered gradients, bevels, additive glows, animated parts.
function boltHead(c, x, y, r) { circ(c, x, y, r, lg(c, x - r, y - r, x + r, y + r, [0, '#f4f6ff', 1, '#7a82a8']), 1.4); line(c, x - r * 0.6, y, x + r * 0.6, y, 'rgba(20,10,50,0.55)', 1.2); }
function metal(c, x, y, w, h, rad, a, b) { rr(c, x, y, w, h, rad); c.fillStyle = lg(c, 0, y, 0, y + h, [0, a || '#dfe5fa', 0.45, b || '#97a0c6', 1, '#4a5278']); c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke(); rr(c, x + 2, y + 1.5, w - 4, Math.max(1, h * 0.22), rad * 0.6); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fill(); }
function bossEye(c, x, y, er, ang, t, angry, o) {
  const ax = Math.cos(ang), ay = Math.sin(ang) * 0.5 + 0.3;
  eye(c, x, y, er, ax, ay, { t, rage: angry, blink: 1, stun: false });
  if (angry) { const s = Math.sign(x) || 1; c.beginPath(); c.moveTo(x + s * er * 1.1, y - er * 1.4); c.lineTo(x - s * er * 0.9, y - er * 0.75); c.strokeStyle = OUT; c.lineWidth = Math.max(3, er * 0.3); c.lineCap = 'round'; c.stroke(); }
}
function vent(c, x, y, t, ph) { for (let i = 0; i < 3; i++) { const k = (t * 0.9 + i / 3 + ph) % 1; c.save(); c.globalAlpha *= 0.5 * (1 - k); c.fillStyle = '#eef2ff'; c.beginPath(); c.arc(x + Math.sin(k * 6 + i) * 3, y - k * 22, 3 + k * 6, 0, TAU); c.fill(); c.restore(); } }

const BOSS_DRAW = {
  compressor(c, r, t, o) {
    const sq = (Math.sin(t * 2.2) * 0.5 + 0.5) * r * 0.22;
    glow(c, '#7d8bb0', 0, 0, r * 2.1, 0.35);
    for (const s of [-1, 1]) { // chrome pistons
      rr(c, s * r * 1.02 - 7, -r * 0.82, 14, r * 1.64, 5); c.fillStyle = lg(c, s * r * 1.02 - 7, 0, s * r * 1.02 + 7, 0, [0, '#4a5278', 0.4, '#f4f8ff', 1, '#4a5278']); c.fill(); c.lineWidth = 2.6; c.strokeStyle = OUT; c.stroke();
      const py = -r * 0.5 + sq * 0.8; rr(c, s * r * 1.02 - 11, py, 22, r * 0.3, 4); c.fillStyle = '#6a7298'; c.fill(); c.stroke();
    }
    metal(c, -r * 1.08, r * 0.4 - sq * 0.4, r * 2.16, r * 0.46, 7, '#c4cce8', '#7a84ac');
    metal(c, -r * 1.08, -r * 0.92 + sq, r * 2.16, r * 0.46, 7, '#c4cce8', '#7a84ac');
    for (let i = -4; i <= 4; i++) { c.save(); rr(c, -r * 1.0, -r * 0.92 + sq + r * 0.34, r * 2.0, r * 0.1, 2); c.clip(); c.fillStyle = i % 2 ? '#ffd23c' : '#2a2438'; c.beginPath(); c.moveTo(i * r * 0.26, -r * 0.92 + sq + r * 0.3); c.lineTo(i * r * 0.26 + r * 0.14, -r * 0.92 + sq + r * 0.3); c.lineTo(i * r * 0.26 - r * 0.02, -r * 0.92 + sq + r * 0.46); c.lineTo(i * r * 0.26 - r * 0.16, -r * 0.92 + sq + r * 0.46); c.fill(); c.restore(); }
    rr(c, -r * 0.88, -r * 0.5 + sq * 0.5, r * 1.76, r * 0.98 - sq * 0.8, 11); c.fillStyle = lg(c, 0, -r * 0.5, 0, r * 0.5, [0, '#a4aed0', 0.5, '#6a7498', 1, '#394066']); c.fill(); c.lineWidth = 3.4; c.strokeStyle = OUT; c.stroke();
    for (let i = -3; i <= 3; i++) line(c, i * r * 0.26, r * 0.36, i * r * 0.26, r * 0.78, 'rgba(20,10,46,0.4)', 2);
    for (const [bx, by] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.3], [0.8, 0.3]]) boltHead(c, bx * r, by * r + sq * 0.2, r * 0.05);
    // glass window with the face inside
    rr(c, -r * 0.5, -r * 0.4 + sq * 0.4, r, r * 0.55, 10); c.fillStyle = rg(c, 0, -r * 0.1, 0, r * 0.7, [0, '#2a3a78', 1, '#0c1030']); c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
    bossEye(c, -r * 0.2, -r * 0.14 + sq * 0.3, r * 0.14, o.ang, t, true); bossEye(c, r * 0.2, -r * 0.14 + sq * 0.3, r * 0.14, o.ang, t, true);
    c.beginPath(); c.moveTo(-r * 0.34, r * 0.22 + sq * 0.2); c.lineTo(r * 0.34, r * 0.22 + sq * 0.2); c.strokeStyle = OUT; c.lineWidth = 3.4; c.stroke();
    c.beginPath(); c.arc(-r * 0.2, -r * 0.2, r * 0.3, Math.PI * 1.1, Math.PI * 1.5); c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 3; c.stroke();
    circ(c, 0, -r * 0.72 + sq, r * 0.2, rg(c, -2, -2, 0, r * 0.2, [0, '#ffffff', 1, '#c4cce8']), 2);
    line(c, 0, -r * 0.72 + sq, Math.cos(t * 2 - 1.5) * r * 0.15, -r * 0.72 + sq + Math.sin(t * 2 - 1.5) * r * 0.15, '#ff4a5e', 2.4);
    for (let i = 0; i < 3; i++) { c.save(); additive(c, true); circ(c, -r * 0.6 + i * r * 0.18, r * 0.62, r * 0.04, (Math.floor(t * 4) + i) % 3 === 0 ? '#ff4a5e' : '#4a1a28', 0.8); c.restore(); }
    vent(c, -r * 0.7, -r * 0.92 + sq, t, 0); vent(c, r * 0.7, -r * 0.92 + sq, t, 0.5);
  },
  noisegate(c, r, t, o) {
    glow(c, o.gated ? '#fff0a0' : '#ffcf4a', 0, 0, r * (o.gated ? 2.6 : 2.0), o.gated ? 0.8 : 0.4);
    // arched gold frame with bevel
    c.beginPath(); c.moveTo(-r, r * 0.9); c.lineTo(-r, -r * 0.4); c.arc(0, -r * 0.4, r, Math.PI, 0); c.lineTo(r, r * 0.9); c.closePath();
    c.fillStyle = lg(c, -r, -r, r, r, [0, '#fff0a8', 0.4, '#ffd23c', 1, '#a8741a']); c.fill(); c.lineWidth = 3.6; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke();
    c.beginPath(); c.arc(0, -r * 0.4, r * 0.93, Math.PI * 1.05, Math.PI * 1.55); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 3; c.stroke();
    // inner dark opening
    c.beginPath(); c.moveTo(-r * 0.76, r * 0.78); c.lineTo(-r * 0.76, -r * 0.4); c.arc(0, -r * 0.4, r * 0.76, Math.PI, 0); c.lineTo(r * 0.76, r * 0.78); c.closePath(); c.fillStyle = rg(c, 0, 0, 0, r, [0, '#3a2a10', 1, '#0c0614']); c.fill(); c.lineWidth = 2.6; c.stroke();
    bossEye(c, -r * 0.3, -r * 0.2, r * 0.19, o.ang, t, false); bossEye(c, r * 0.3, -r * 0.2, r * 0.19, o.ang, t, false);
    c.beginPath(); c.arc(0, r * 0.22, r * 0.2, 0.2, Math.PI - 0.2); c.strokeStyle = '#ffe48a'; c.lineWidth = 3.4; c.stroke();
    for (let i = 0; i < 5; i++) { c.save(); additive(c, true); circ(c, -r * 0.5 + i * r * 0.25, -r * 0.98, 2.8, (Math.floor(t * 6) + i) % 5 < 3 ? '#6dff8a' : '#2a5a3a', 0.8); c.restore(); }
    // the shutter: slats roll down when gated
    const close = o.gated ? 1 : 0.14, top = -r * 1.1, h = r * 1.95 * close;
    c.save(); c.beginPath(); c.moveTo(-r * 0.8, r * 0.82); c.lineTo(-r * 0.8, -r * 0.4); c.arc(0, -r * 0.4, r * 0.8, Math.PI, 0); c.lineTo(r * 0.8, r * 0.82); c.closePath(); c.clip();
    c.fillStyle = lg(c, 0, top, 0, top + h, [0, '#e8c050', 1, '#9a6a1a']); c.fillRect(-r, top, r * 2, h);
    c.strokeStyle = 'rgba(70,40,6,0.75)'; c.lineWidth = 2; c.beginPath(); for (let y = top + 7; y < top + h; y += 7) { c.moveTo(-r, y); c.lineTo(r, y); } c.stroke();
    c.strokeStyle = 'rgba(255,245,180,0.4)'; c.beginPath(); for (let y = top + 8.5; y < top + h; y += 7) { c.moveTo(-r, y); c.lineTo(r, y); } c.stroke();
    c.restore();
    if (o.gated) {
      circ(c, 0, top + h - 7, r * 0.12, '#fff8d0', 1.6);
      c.save(); additive(c, true); c.strokeStyle = 'rgba(255,245,170,' + (0.6 + 0.3 * Math.sin(t * 10)).toFixed(2) + ')'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, r * 1.35, 0, TAU); c.stroke();
      for (let i = 0; i < 6; i++) spark(c, Math.cos(t * 3 + i * 1.05) * r * 1.3, Math.sin(t * 3 + i * 1.05) * r * 1.3, 4.4, '#fff'); c.restore();
    }
  },
  reverb(c, r, t, o) {
    glow(c, '#9f7bff', 0, 0, r * 2.4, 0.5);
    for (let i = 0; i < 3; i++) { const k = ((t * 0.5 + i / 3) % 1); c.save(); additive(c, true); c.beginPath(); c.arc(0, 0, r * (1.0 + k * 0.8), 0, TAU); c.strokeStyle = 'rgba(190,160,255,' + (0.6 * (1 - k)).toFixed(3) + ')'; c.lineWidth = 3.4 * (1 - k) + 0.6; c.stroke(); c.restore(); }
    const off = Math.sin(t * 2) * r * 0.16 + r * 0.24;
    for (const s of [-1, 1]) { c.save(); c.globalAlpha *= 0.3; c.translate(s * off, 0); furPath(c, r * 0.95, r * 0.95, 15, 0.16, 4); c.fillStyle = '#c7b0ff'; c.fill(); c.restore(); }
    furBlob(c, r, '#9f7bff', { n: 17, amp: 0.22, seed: 21, strands: 110, accent: '#e6d8ff' });
    // crystal spikes
    for (const a of [-2.2, -1.57, -0.95]) { c.save(); c.rotate(a + Math.PI / 2); poly(c, [[-r * 0.12, -r * 0.92], [0, -r * 1.4], [r * 0.12, -r * 0.92]]); ink(c, lg(c, 0, -r * 1.4, 0, -r * 0.9, [0, '#f4ecff', 1, '#8a62e8']), 2.2); c.restore(); }
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2.4; for (const k of [0.45, 0.65, 0.85]) { c.beginPath(); c.arc(0, r * 0.1, r * k, 0.4, 2.7); c.stroke(); }
    bossEye(c, -r * 0.34, -r * 0.2, r * 0.22, o.ang, t, false); bossEye(c, r * 0.34, -r * 0.2, r * 0.22, o.ang, t, false);
    // a woofer mouth that pumps
    const pump = Math.abs(Math.sin(t * 3));
    circ(c, 0, r * 0.44, r * (0.3 + pump * 0.04), rg(c, 0, r * 0.44, 0, r * 0.34, [0, '#6a3ac8', 0.5, '#2a0c3a', 1, '#12041e']), 2.8);
    circ(c, 0, r * 0.44, r * (0.11 + pump * 0.03), '#0a0214', 1.4);
    c.beginPath(); c.arc(0, r * 0.44, r * 0.24, 3.6, 4.7); c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 2; c.stroke();
  },
  djglitch(c, r, t, o) {
    glow(c, '#35f0c8', 0, 0, r * 2.4, 0.4);
    const g = ((t * 1.1) % 3) < 0.35;
    if (g) { for (const [dx, col] of [[-5, '#ff3cc8'], [5, '#35c8ff']]) { c.save(); c.translate(dx, 0); c.globalAlpha *= 0.45; additive(c, true); rr(c, -r * 0.82, -r * 0.8, r * 1.64, r * 1.6, 12); c.fillStyle = col; c.fill(); c.restore(); } }
    // headphone band
    c.beginPath(); c.arc(0, -r * 0.1, r * 0.98, Math.PI * 1.04, Math.PI * 1.96); c.strokeStyle = OUT; c.lineWidth = 10; c.stroke();
    c.beginPath(); c.arc(0, -r * 0.1, r * 0.98, Math.PI * 1.04, Math.PI * 1.96); c.strokeStyle = lg(c, -r, 0, r, 0, [0, '#ff3cc8', 1, '#7a5cff']); c.lineWidth = 5.4; c.stroke();
    rr(c, -r * 0.82, -r * 0.8, r * 1.64, r * 1.6, 13); c.fillStyle = lg(c, -r, -r, r, r, [0, '#9dfff0', 0.45, '#2fd8b8', 1, '#12665a']); c.fill(); c.lineWidth = 3.6; c.strokeStyle = OUT; c.stroke();
    rr(c, -r * 0.74, -r * 0.72, r * 1.48, r * 0.3, 8); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fill();
    for (const s of [-1, 1]) { rr(c, s * r * 0.92 - 8, -r * 0.46, 16, r * 0.78, 6); c.fillStyle = lg(c, 0, -r * 0.46, 0, r * 0.3, [0, '#ff7ad8', 1, '#a01c80']); c.fill(); c.lineWidth = 2.6; c.strokeStyle = OUT; c.stroke(); c.save(); additive(c, true); circ(c, s * r * 0.92, -r * 0.1, 3.4, '#fff', 0); glow(c, '#ff3cc8', s * r * 0.92, -r * 0.1, r * 0.5, 0.5); c.restore(); }
    // visor with a scrolling equalizer behind the eyes
    rr(c, -r * 0.64, -r * 0.5, r * 1.28, r * 0.58, 8); c.fillStyle = '#071622'; c.fill(); c.lineWidth = 2.6; c.strokeStyle = OUT; c.stroke();
    c.save(); rr(c, -r * 0.62, -r * 0.48, r * 1.24, r * 0.54, 7); c.clip(); for (let i = 0; i < 12; i++) { const hgt = (0.2 + 0.7 * Math.abs(Math.sin(t * 5 + i * 1.7))) * r * 0.5; c.fillStyle = i % 2 ? 'rgba(53,240,200,0.5)' : 'rgba(255,60,200,0.5)'; c.fillRect(-r * 0.6 + i * r * 0.1, r * 0.04 - hgt, r * 0.07, hgt); } c.restore();
    bossEye(c, -r * 0.26, -r * 0.2, r * 0.15, o.ang, t, false); bossEye(c, r * 0.26, -r * 0.2, r * 0.15, o.ang, t, false);
    c.beginPath(); c.arc(0, r * 0.18, r * 0.2, 0.3, Math.PI - 0.3); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    // turntable chest
    for (const s of [-1, 1]) { const px = s * r * 0.34, a = t * 5 * s; circ(c, px, r * 0.5, r * 0.27, rg(c, px, r * 0.5, 0, r * 0.27, [0, '#3a3a58', 1, '#0c0a1c']), 2.4); for (const k of [0.18, 0.12]) { c.beginPath(); c.arc(px, r * 0.5, r * k, 0, TAU); c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1; c.stroke(); } circ(c, px, r * 0.5, r * 0.08, '#ff3cc8', 1); line(c, px, r * 0.5, px + Math.cos(a) * r * 0.24, r * 0.5 + Math.sin(a) * r * 0.24, '#fff', 1.8); }
    if (g) for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? 'rgba(53,200,255,0.65)' : 'rgba(255,60,200,0.65)'; c.fillRect(-r + ((t * 91 + i * 37) % (r * 1.2)), -r * 0.7 + i * r * 0.42, r * 1.0, 3); }
  },
  playback(c, r, t, o) {
    const ph = clampN(o.phase || 1, 1, 3);
    const base = ph === 1 ? '#ff6cb8' : ph === 2 ? '#ff4f8a' : '#ff3c3c';
    glow(c, ph === 3 ? '#ff3030' : '#ff5fb0', 0, 0, r * (2.2 + ph * 0.25), 0.5 + 0.2 * Math.sin(t * (2 + ph)));
    // cable crown with glowing connectors
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.34, w = Math.sin(t * 3 + i) * 3;
      c.beginPath(); c.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); c.quadraticCurveTo(Math.cos(a) * r * 1.3 + w, Math.sin(a) * r * 1.3, Math.cos(a) * r * 1.5 + w * 2, Math.sin(a) * r * 1.55);
      c.strokeStyle = OUT; c.lineWidth = 7; c.stroke(); c.strokeStyle = i % 2 ? '#35c8ff' : '#ffd23c'; c.lineWidth = 3.4; c.stroke();
      c.save(); additive(c, true); circ(c, Math.cos(a) * r * 1.5 + w * 2, Math.sin(a) * r * 1.55, 3.2, '#fff', 0); glow(c, i % 2 ? '#35c8ff' : '#ffd23c', Math.cos(a) * r * 1.5 + w * 2, Math.sin(a) * r * 1.55, r * 0.3, 0.8); c.restore();
    }
    rr(c, -r * 0.97, -r * 0.88, r * 1.94, r * 1.76, r * 0.36); c.fillStyle = lg(c, -r, -r, r, r, [0, shade(base, 0.55), 0.35, base, 1, shade(base, -0.55)]); c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
    rr(c, -r * 0.88, -r * 0.8, r * 1.76, r * 0.34, r * 0.2); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
    // the screen
    rr(c, -r * 0.76, -r * 0.64, r * 1.52, r * 1.16, r * 0.22); c.fillStyle = rg(c, 0, -r * 0.1, 0, r, [0, '#251650', 1, '#0a0620']); c.fill(); c.lineWidth = 3.2; c.strokeStyle = OUT; c.stroke();
    c.save(); rr(c, -r * 0.76, -r * 0.64, r * 1.52, r * 1.16, r * 0.22); c.clip(); c.fillStyle = 'rgba(120,200,255,0.06)'; for (let y = -r * 0.64; y < r * 0.52; y += 3) c.fillRect(-r, y, r * 2, 1); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(-r, -r * 0.64 + ((t * 40) % (r * 1.2)), r * 2, 4); c.restore();
    bossEye(c, -r * 0.3, -r * 0.3, r * 0.17, o.ang, t, ph >= 2); bossEye(c, r * 0.3, -r * 0.3, r * 0.17, o.ang, t, ph >= 2);
    // the play button grin (pause bars on the last phase)
    const by = r * 0.16, bs = r * 0.3;
    if (ph === 3 && ((t * 2) % 1) < 0.5) { rr(c, -bs * 0.9, by - bs, bs * 0.6, bs * 2, 2); c.fillStyle = '#fff'; c.fill(); rr(c, bs * 0.3, by - bs, bs * 0.6, bs * 2, 2); c.fill(); }
    else { poly(c, [[-bs * 0.7, by - bs], [-bs * 0.7, by + bs], [bs * 1.0, by]]); ink(c, '#fff', 2.2); c.save(); additive(c, true); glow(c, '#ffffff', 0, by, r * 0.6, 0.35); c.restore(); }
    circ(c, 0, r * 0.7, 5, ph === 1 ? '#6dff8a' : '#ff4a5e', 1.6); c.save(); additive(c, true); glow(c, ph === 1 ? '#6dff8a' : '#ff4a5e', 0, r * 0.7, r * 0.3, 0.7); c.restore();
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) line(c, s * r * 0.8, r * 0.62 + i * 4.4 - 4.4, s * r * 0.54, r * 0.62 + i * 4.4 - 4.4, OUT, 1.8);
    if (ph >= 2) { line(c, r * 0.5, -r * 0.62, r * 0.64, -r * 0.44, '#fff', 1.8); line(c, r * 0.64, -r * 0.44, r * 0.52, -r * 0.3, '#fff', 1.8); }
    if (ph === 3) { for (let i = 0; i < 5; i++) { const a = t * 3 + i * 1.257; c.save(); additive(c, true); spark(c, Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.05, 5.4, '#ffd23c'); c.restore(); } c.strokeStyle = 'rgba(255,80,60,0.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * 0.7, -r * 0.88); c.lineTo(-r * 0.55, -r * 0.6); c.lineTo(-r * 0.68, -r * 0.4); c.stroke(); }
  },
};

export function drawBoss(ctx, id, x, y, o) {
  const def = BOSSES[id];
  const fn = BOSS_DRAW[id];
  if (!def || !fn) return;
  o = o || {};
  const t = o.t || 0, sc = o.scale == null ? 1 : o.scale, r = def.r;
  if (o.ang == null) o = Object.assign({}, o, { ang: 0 });
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.translate(x, y);
  shadow(ctx, 0, r * 0.98 * sc, r * 1.5 * sc, r * 0.46 * sc, 0.9);
  ctx.translate(0, Math.sin(t * 2.5) * 2 * sc);
  ctx.scale(sc, sc);
  fn(ctx, r, t, o);
  if ((o.hit || 0) > 0) {
    ctx.save(); additive(ctx, true); rr(ctx, -r * 0.92, -r * 0.88, r * 1.84, r * 1.76, r * 0.32); ctx.fillStyle = 'rgba(255,255,255,' + clampN(o.hit * 0.5, 0, 0.5).toFixed(3) + ')'; ctx.fill(); ctx.restore();
  }
  if (o.hp != null) {
    const w = r * 2.1;
    hpBar(ctx, w, -r * 1.3 - 12, o.hp, 8);
    const ph = o.phase || 0;
    for (let i = 0; i < ph; i++) circ(ctx, -w / 2 + 6 + i * 12, -r * 1.3 - 22, 3.8, '#ffd23c', 1.4);
  }
  ctx.restore();
}
