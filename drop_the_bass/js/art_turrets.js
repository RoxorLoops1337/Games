// art_turrets.js: AAA turret and projectile art for Drop the Bass. Pure canvas, no image files.
// Exports (same contract as the legacy renderer): drawTurret, drawTurretIconFlat, drawProjectile, setArtScale, makeCanvas.
//
// How it is built
//   * Every turret is a plinth ("riser") plus a head. Both are rendered once into offscreen sprites per (type, level, scale)
//     with a real lighting recipe: top-left key light, cool rim light from the bottom right, ambient occlusion, brushed metal,
//     glossy plastic, speaker cloth, drum skins. Sprites are blitted each frame.
//   * Anything that moves (spinning barrels, LEDs, neon pulse, speaker cones, orbs, arcs) is drawn live on top of the cached
//     head with a handful of path operations and pre-rendered glow sprites (additive blend), so 40 turrets stay cheap.
//   * No Date, no Math.random: motion comes from `t` and hashes. Safe in node with a mock ctx (makeCanvas returns null there).
import { TURRETS } from './data_core.js';

const TAU = Math.PI * 2;
const OUT = '#140a2e';
const OUT_LIGHT = '#2c1a5c';

// ---------------------------------------------------------------- cache plumbing
let SCALE = 2;
const cache = new Map();
const glows = new Map();
export function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  try { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } catch (e) { return null; }
}
export function setArtScale(n) { SCALE = Math.max(1, Math.min(4, +n || 2)); cache.clear(); glows.clear(); }

// fn(c) draws around the origin of a w x h box. Returns a sprite that blit() draws centred at x,y.
function sprite(key, w, h, fn) {
  let s = cache.get(key);
  if (s) return s;
  const cv = makeCanvas(Math.ceil(w * SCALE), Math.ceil(h * SCALE));
  const cx = cv && cv.getContext ? cv.getContext('2d') : null;
  if (cv && cx) { cx.scale(SCALE, SCALE); cx.translate(w / 2, h / 2); fn(cx); s = { cv, w, h, fn }; }
  else s = { cv: null, w, h, fn };
  cache.set(key, s);
  return s;
}
function blit(ctx, s, x, y, sc) {
  sc = sc || 1;
  if (s.cv) ctx.drawImage(s.cv, x - s.w * sc / 2, y - s.h * sc / 2, s.w * sc, s.h * sc);
  else { ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); s.fn(ctx); ctx.restore(); }
}

// soft additive glow: one pre-rendered radial sprite per colour
function glowSprite(color) {
  let g = glows.get(color);
  if (g) return g;
  const sz = 64;
  const cv = makeCanvas(sz * 2, sz * 2);
  const cx = cv && cv.getContext ? cv.getContext('2d') : null;
  if (cv && cx) {
    const gr = cx.createRadialGradient(sz, sz, 0, sz, sz, sz);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, color); gr.addColorStop(0.55, withAlpha(color, 0.28)); gr.addColorStop(1, withAlpha(color, 0));
    cx.fillStyle = gr; cx.fillRect(0, 0, sz * 2, sz * 2);
    g = cv;
  } else g = null;
  glows.set(color, g);
  return g;
}
function bloom(ctx, x, y, r, color, a) {
  if (a <= 0.01 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= Math.min(1, a);
  const g = glowSprite(color);
  if (g) ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
  else { const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  ctx.restore();
}

// ---------------------------------------------------------------- colour helpers
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
  let [r, g, b] = parse(hex);
  const to = a < 0 ? 0 : 255, p = Math.abs(a);
  r = Math.round(r + (to - r) * p); g = Math.round(g + (to - g) * p); b = Math.round(b + (to - b) * p);
  return (_sh[k] = 'rgb(' + r + ',' + g + ',' + b + ')');
}
function withAlpha(hex, a) { const [r, g, b] = parse(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
function mixHex(a, b, t) { const A = parse(a), B = parse(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }
function lum(hex) { const [r, g, b] = parse(hex); return 0.3 * r + 0.59 * g + 0.11 * b; }
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOutBack = (x) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

// ---------------------------------------------------------------- path + material toolkit (used while baking sprites)
const rrP = (x, y, w, h, r) => (c) => {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
};
const circP = (x, y, r) => (c) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.closePath(); };
const ellP = (x, y, rx, ry, rot) => (c) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); c.closePath(); };
const polyP = (pts) => (c) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const s of stops) g.addColorStop(s[0], s[1]); return g; }
function rg(c, x0, y0, r0, x1, y1, r1, stops) { const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const s of stops) g.addColorStop(s[0], s[1]); return g; }
function ink(c, lw) { c.lineWidth = lw == null ? 2.6 : lw; c.strokeStyle = OUT; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
// outline that is a touch lighter on the lit side and heavier on the shadow side (reads as ink, not as a stroke)
function inkVar(c, path, lw, b) {
  path(c); c.lineJoin = 'round';
  c.lineWidth = lw; c.strokeStyle = lg(c, b[0], b[1], b[2], b[3], [[0, OUT_LIGHT], [0.5, OUT], [1, '#090418']]); c.stroke();
}
function metal(c, y0, y1, base) {
  return lg(c, 0, y0, 0, y1, [[0, shade(base, 0.62)], [0.2, shade(base, 0.25)], [0.48, base], [0.74, shade(base, -0.38)], [1, shade(base, -0.62)]]);
}
function chrome(c, y0, y1) {
  return lg(c, 0, y0, 0, y1, [[0, '#ffffff'], [0.16, '#dfe7ff'], [0.38, '#8793b8'], [0.52, '#eef2ff'], [0.78, '#59648c'], [1, '#b4bedf']]);
}
function gold(c, y0, y1) {
  return lg(c, 0, y0, 0, y1, [[0, '#fff3b0'], [0.2, '#ffd84d'], [0.5, '#d99a1c'], [0.72, '#ffe27a'], [1, '#9a6410']]);
}
// finishing passes, all clipped to the shape: ambient occlusion on the lower half, cool rim light bottom right, bright edge top left
function finish(c, path, y0, y1, o) {
  o = o || {};
  c.save(); path(c); c.clip();
  const g = lg(c, 0, y0, 0, y1, [[0, 'rgba(10,4,30,0)'], [0.55, 'rgba(10,4,30,' + (o.ao == null ? 0.16 : o.ao * 0.5) + ')'], [1, 'rgba(10,4,30,' + (o.ao == null ? 0.42 : o.ao) + ')']]);
  c.fillStyle = g; c.fillRect(-120, y0 - 4, 240, y1 - y0 + 8);
  c.translate(-1.7, -1.7); path(c); c.lineWidth = 2.4; c.strokeStyle = o.rim || 'rgba(120,200,255,0.55)'; c.stroke();
  c.translate(3.4, 3.4); path(c); c.lineWidth = 1.7; c.strokeStyle = o.hi || 'rgba(255,255,255,0.5)'; c.stroke();
  c.restore();
}
function brushed(c, path, x, y, w, h, a) {
  c.save(); path(c); c.clip(); c.lineWidth = 0.55;
  for (let yy = y + 1.2; yy < y + h; yy += 1.9) { c.strokeStyle = (((yy * 3) | 0) % 2) ? 'rgba(255,255,255,' + (a || 0.07) + ')' : 'rgba(0,0,0,' + (a || 0.07) + ')'; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy + (((yy * 7) | 0) % 3) * 0.2); c.stroke(); }
  c.restore();
}
function lathe(c, x, y, r, n, a) { // concentric machining rings on cymbals and cones
  c.save(); c.lineWidth = 0.5;
  for (let i = 1; i <= n; i++) { c.strokeStyle = i % 2 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')'; c.beginPath(); c.arc(x, y, r * i / (n + 1), 0, TAU); c.stroke(); }
  c.restore();
}
function sphere(c, x, y, r, base, o) {
  o = o || {};
  circP(x, y, r)(c);
  c.fillStyle = rg(c, x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.05, [[0, o.hi || shade(base, 0.75)], [0.35, shade(base, 0.2)], [0.75, base], [1, shade(base, -0.55)]]);
  c.fill();
  if (o.ink !== 0) ink(c, o.ink || 1.8);
  c.beginPath(); c.arc(x - r * 0.32, y - r * 0.38, r * 0.2, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill();
}
function screw(c, x, y, r, base) {
  circP(x, y, r)(c); c.fillStyle = rg(c, x - r * 0.3, y - r * 0.3, 0.1, x, y, r, [[0, '#ffffff'], [0.5, base || '#b4bedf'], [1, shade(base || '#b4bedf', -0.6)]]); c.fill(); ink(c, 1.1);
  c.beginPath(); c.moveTo(x - r * 0.55, y + r * 0.1); c.lineTo(x + r * 0.55, y - r * 0.1); c.strokeStyle = 'rgba(20,10,46,0.65)'; c.lineWidth = 0.9; c.stroke();
}
function led(c, x, y, r, col, on) {
  circP(x, y, r + 0.7)(c); c.fillStyle = '#0c0620'; c.fill();
  circP(x, y, r)(c); c.fillStyle = rg(c, x - r * 0.3, y - r * 0.3, 0.1, x, y, r, on === false ? [[0, shade(col, -0.2)], [1, shade(col, -0.8)]] : [[0, '#ffffff'], [0.4, col], [1, shade(col, -0.35)]]); c.fill();
}
function star(c, x, y, ro, ri, n, rot) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? ri : ro; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}
function spark(c, x, y, r, col) {
  c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r);
  c.fillStyle = col; c.fill();
}
function line(c, x0, y0, x1, y1, col, lw) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.stroke(); }
function mesh(c, x, y, r, step, col, lw) { // wire grille clipped to a circle
  c.save(); circP(x, y, r)(c); c.clip(); c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
  for (let d = -r; d <= r; d += step) { c.moveTo(x + d, y - r); c.lineTo(x + d, y + r); c.moveTo(x - r, y + d); c.lineTo(x + r, y + d); }
  c.stroke(); c.restore();
}

// ---------------------------------------------------------------- tier materials: the visible level progression
// 1 painted steel, 2 steel + colour band, 3 chrome trim, 4 anodised colour plates + LEDs, 5 neon edge, 6 gold corners, 7 full gold
const TIER = [null,
  { rim: '#7f77b8', trim: '#8d86b8', led: '#7f77b8' },
  { rim: '#46d6e8', trim: '#9fe9f5', led: '#46d6e8' },
  { rim: '#5fe08a', trim: '#cfe7ff', led: '#5fe08a' },
  { rim: '#b66bff', trim: '#d6b8ff', led: '#b66bff' },
  { rim: '#ff7ad0', trim: '#ffc2e9', led: '#ff7ad0' },
  { rim: '#ffb02e', trim: '#ffd27a', led: '#ffb02e' },
  { rim: '#ffd84d', trim: '#ffe99a', led: '#ffd84d' },
];

// ================================================================ PLINTH (the riser every turret stands on)
function plinth(c, def, L) {
  const col = lum(def.color) > 170 ? '#8a52b8' : def.color, tier = TIER[L];
  const P = rrP(-31, -31, 62, 62, 14);
  // drop shadow baked in (soft, offset down right)
  for (let i = 3; i >= 1; i--) { rrP(-30 + i, -26 + i * 1.6, 62, 62, 15)(c); c.fillStyle = 'rgba(8,3,24,' + (0.12 * (4 - i) * 0.9).toFixed(2) + ')'; c.fill(); }
  // outer frame: brushed painted steel tinted by the turret colour
  P(c); c.fillStyle = metal(c, -31, 31, mixHex(shade(col, -0.55), '#3b3466', 0.5)); c.fill();
  brushed(c, P, -31, -31, 62, 62, 0.05);
  // inner floor: dark diamond plate with a coloured under-glow
  const F = rrP(-26, -26, 52, 52, 10);
  F(c); c.fillStyle = rg(c, 0, -4, 4, 0, 0, 40, [[0, shade(col, -0.5)], [0.6, shade(col, -0.74)], [1, '#0d0722']]); c.fill();
  c.save(); F(c); c.clip(); c.lineWidth = 0.7; c.strokeStyle = 'rgba(255,255,255,0.045)';
  for (let k = -52; k <= 52; k += 5) { c.beginPath(); c.moveTo(k, -26); c.lineTo(k + 52, 26); c.moveTo(k, 26); c.lineTo(k + 52, -26); c.stroke(); }
  c.restore();
  // glass sheen across the floor, top left
  c.save(); F(c); c.clip(); c.beginPath(); c.moveTo(-26, -26); c.lineTo(8, -26); c.lineTo(-26, 8); c.closePath(); c.fillStyle = 'rgba(255,255,255,0.07)'; c.fill(); c.restore();
  // inner edge bevel and AO inside the floor
  F(c); ink(c, 1.8);
  c.save(); F(c); c.clip(); c.translate(1.2, 1.4); F(c); c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke(); c.restore();
  // outer rim: tier-coloured strip
  const R = rrP(-29, -29, 58, 58, 12);
  R(c); c.lineWidth = L >= 5 ? 3.4 : 2.4; c.strokeStyle = tier.rim; c.stroke();
  R(c); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.55)'; c.stroke();
  if (L >= 5) { // neon edge glow baked as a soft wide stroke (live pulse is added on top)
    c.save(); R(c); c.lineWidth = 6; c.strokeStyle = withAlpha(tier.rim, 0.22); c.stroke(); c.restore();
  }
  finish(c, P, -31, 31, { ao: 0.36 });
  inkVar(c, P, 3, [-31, -31, 31, 31]);
  // corner hardware: screws at L1 to L2, corner brackets from L3, chrome caps L4+, gold caps L6+
  const corners = [[-24, -24, -1, -1], [24, -24, 1, -1], [-24, 24, -1, 1], [24, 24, 1, 1]];
  for (const [bx, by, sx, sy] of corners) {
    if (L >= 3) {
      c.beginPath(); c.moveTo(bx - sx * 5, by + sy * 3); c.lineTo(bx + sx * 3, by + sy * 3); c.lineTo(bx + sx * 3, by - sy * 5);
      c.lineWidth = 3.4; c.strokeStyle = OUT; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
      c.lineWidth = 1.8; c.strokeStyle = L >= 6 ? '#ffd84d' : L >= 4 ? tier.trim : '#aeb8dc'; c.stroke();
    }
    screw(c, bx, by, L >= 4 ? 2.5 : 2, L >= 6 ? '#ffd84d' : '#b4bedf');
  }
  // level 2 colour band across the front edge, level 4 plating strips with rivets
  if (L >= 2) { rrP(-18, 24.2, 36, 3.2, 1.4)(c); c.fillStyle = tier.rim; c.fill(); ink(c, 1.1); }
  if (L >= 4) {
    for (const sx of [-1, 1]) { rrP(sx * 28 - 1.6, -14, 3.2, 28, 1.4)(c); c.fillStyle = metal(c, -14, 14, tier.trim); c.fill(); ink(c, 1.1); for (const yy of [-9, 0, 9]) screw(c, sx * 28, yy, 0.9, '#d6e0ff'); }
  }
  // pips: little gems along the bottom edge; stars from level 5
  const sp = 7.6, x0 = -(L - 1) * sp / 2;
  for (let i = 0; i < L; i++) {
    const px = x0 + i * sp, py = 28.5;
    if (L >= 5) { star(c, px, py, 3.8, 1.7, 4, Math.PI / 4); c.fillStyle = L >= 7 ? gold(c, py - 4, py + 4) : tier.rim; c.fill(); ink(c, 1.2); star(c, px - 0.6, py - 0.8, 1.2, 0.5, 4, Math.PI / 4); c.fillStyle = 'rgba(255,255,255,0.9)'; c.fill(); }
    else { circP(px, py, 2.6)(c); c.fillStyle = rg(c, px - 0.8, py - 0.8, 0.2, px, py, 2.8, [[0, '#fff'], [0.5, tier.rim], [1, shade(tier.rim, -0.5)]]); c.fill(); ink(c, 1.2); }
  }
}

// ================================================================ HEADS (drawn facing +x around the origin, baked)
// Each head is { fixed, draw(c, L, col, acc), live(c, L, t, col, acc, fire) }.
function goldOrCol(c, L, col, y0, y1) { return L >= 7 ? gold(c, y0, y1) : metal(c, y0, y1, col); }

function drumTop(c, x, y, r, skin, rimCol, L, o) { // a drum seen from above: shell ring, hoop, tensioned skin, centre patch
  o = o || {};
  circP(x, y, r + 2.5)(c); c.fillStyle = rg(c, x - r * 0.3, y - r * 0.35, 1, x, y, r + 3, [[0, shade(rimCol, 0.45)], [0.6, rimCol], [1, shade(rimCol, -0.6)]]); c.fill(); ink(c, 2.4);
  circP(x, y, r)(c); c.fillStyle = chrome(c, y - r, y + r); c.fill(); ink(c, 1.6);
  const sr = r - 2.6;
  circP(x, y, sr)(c); c.fillStyle = rg(c, x - sr * 0.35, y - sr * 0.4, 1, x, y, sr, [[0, shade(skin, 0.7)], [0.6, skin], [1, shade(skin, -0.28)]]); c.fill(); ink(c, 1.3);
  lathe(c, x, y, sr, 3, 0.06);
  circP(x, y, sr * 0.45)(c); c.fillStyle = rg(c, x - 2, y - 2, 0.5, x, y, sr * 0.45, [[0, shade(o.patch || rimCol, 0.5)], [1, shade(o.patch || rimCol, -0.2)]]); c.fill(); ink(c, 1.1);
  const lugs = o.lugs || 8;
  for (let i = 0; i < lugs; i++) { const a = i * TAU / lugs + 0.2; const lx = x + Math.cos(a) * (r + 0.4), ly = y + Math.sin(a) * (r + 0.4); screw(c, lx, ly, L >= 6 ? 1.9 : 1.6, L >= 7 ? '#ffd84d' : '#d6e0ff'); }
  // soft top-left sheen on the skin
  c.save(); circP(x, y, sr)(c); c.clip(); c.beginPath(); c.ellipse(x - sr * 0.35, y - sr * 0.45, sr * 0.55, sr * 0.22, -0.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill(); c.restore();
}

function barrel(c, x0, x1, hw0, hw1, base, L, o) { // tapered tube, lit from above, optional gold rings
  o = o || {};
  const P = polyP([[x0, -hw0], [x1, -hw1], [x1, hw1], [x0, hw0]]);
  P(c); c.fillStyle = lg(c, 0, -Math.max(hw0, hw1), 0, Math.max(hw0, hw1), [[0, shade(base, 0.7)], [0.25, shade(base, 0.3)], [0.5, base], [0.8, shade(base, -0.45)], [1, shade(base, -0.7)]]); c.fill();
  c.save(); P(c); c.clip(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x0, -Math.max(hw0, hw1) * 0.62, x1 - x0, 1.2); c.restore();
  inkVar(c, P, 2.4, [x0, -hw0, x1, hw0]);
  return P;
}

const HEADS = {
  kick: {
    draw(c, L, col, acc) {
      const len = 20 + L * 1.4, hw = 7.2 + L * 0.35;
      // mortar barrel under the drum
      barrel(c, 6, 6 + len, hw, hw + 1.6, L >= 7 ? '#c58a1a' : '#6a7094', L);
      for (const rx of [14, 6 + len * 0.62]) { rrP(rx, -hw - 1.6, 3.4, (hw + 1.6) * 2, 1.2)(c); c.fillStyle = L >= 6 ? gold(c, -hw, hw) : chrome(c, -hw, hw); c.fill(); ink(c, 1.4); }
      // flared muzzle brake
      const mx = 6 + len;
      rrP(mx - 2, -hw - 4, 7.5, (hw + 4) * 2, 2.4)(c); c.fillStyle = L >= 7 ? gold(c, -hw - 4, hw + 4) : metal(c, -hw - 4, hw + 4, shade(acc, -0.1)); c.fill(); ink(c, 2);
      ellP(mx + 5.5, 0, 2.2, hw + 1.5)(c); c.fillStyle = '#1a0608'; c.fill(); ink(c, 1.2);
      c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(mx - 1, -hw - 2.6, 5, 1.2);
      if (L >= 3) for (const sy of [-1, 1]) { rrP(mx - 14, sy * (hw + 1.5) - 1.2, 8, 2.4, 1)(c); c.fillStyle = '#151030'; c.fill(); } // exhaust vents
      if (L >= 5) for (const sy of [-1, 1]) { polyP([[10, sy * hw], [19, sy * hw], [14.5, sy * (hw + 5)]])(c); c.fillStyle = metal(c, -hw - 5, hw + 5, '#ff5a3c'); c.fill(); ink(c, 1.2); }
      drumTop(c, -3, 0, 17, '#f6efe0', col, L, { patch: acc, lugs: 8 });
      c.save(); star(c, -3, 0, 7.5, 3.2, 4, Math.PI / 4); c.fillStyle = shade(acc, 0.1); c.fill(); ink(c, 1.1); c.restore();
      if (L >= 4) { c.beginPath(); c.arc(-3, 0, 21.6, -1, 1); c.strokeStyle = L >= 6 ? '#ffd84d' : acc; c.lineWidth = 2; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) { const mx = 26 + L * 1.4; bloom(c, mx + 3, 0, 9 + L, '#ff8a3c', 0.18 + (L >= 5 ? 0.28 : 0) * (0.7 + 0.3 * Math.sin(t * 5)) + fire * 0.5); },
  },
  snare: {
    draw(c, L, col, acc) {
      const n = L >= 7 ? 3 : L >= 4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? 0 : (i - (n - 1) / 2) * 0.34;
        c.save(); c.rotate(a);
        const P = polyP([[4, -2.8], [31, -1.4], [31, 1.4], [4, 2.8]]);
        P(c); c.fillStyle = lg(c, 0, -3, 0, 3, [[0, '#fff1cf'], [0.35, '#e9c68a'], [0.75, '#b2813e'], [1, '#6f4a1c']]); c.fill(); inkVar(c, P, 2.2, [4, -3, 31, 3]);
        c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(6, -1.6, 22, 0.9);
        sphere(c, 32.5, 0, 3.6, L >= 7 ? '#ffd84d' : acc, { ink: 1.6 });
        c.restore();
      }
      drumTop(c, -4, 0, 15.5, '#faf4e6', col, L, { patch: acc, lugs: 10 });
      // snare wires across the skin
      c.save(); circP(-4, 0, 12)(c); c.clip(); c.lineWidth = 0.9;
      for (let i = -4; i <= 4; i++) { c.strokeStyle = 'rgba(120,100,80,0.55)'; c.beginPath(); c.moveTo(-16, i * 2.8); c.lineTo(8, i * 2.8); c.stroke(); }
      c.restore();
      if (L >= 5) { star(c, -4, 0, 5, 2.2, 4, 0); c.fillStyle = 'rgba(255,255,255,0.95)'; c.fill(); ink(c, 0.9); }
    },
    live(c, L, t, col, acc, fire) { if (L >= 5) bloom(c, -4, 0, 17, acc, 0.14 + 0.1 * Math.sin(t * 4) + fire * 0.3); },
  },
  hat: {
    draw(c, L, col, acc) {
      // motor housing and brass cymbal
      rrP(2, -9, 12, 18, 4)(c); c.fillStyle = metal(c, -9, 9, '#59648c'); c.fill(); ink(c, 2);
      circP(-4, 0, 16)(c); c.fillStyle = rg(c, -9, -6, 1, -4, 0, 17, [[0, '#fff0a8'], [0.35, '#f2c94c'], [0.75, '#c8962a'], [1, '#7a5314']]); c.fill(); ink(c, 2.4);
      lathe(c, -4, 0, 15, 5, 0.1);
      circP(-4, 0, 7.2)(c); c.fillStyle = rg(c, -7, -4, 0.5, -4, 0, 8, [[0, '#fff7c4'], [0.5, '#ffd84d'], [1, '#a8741a']]); c.fill(); ink(c, 1.6);
      screw(c, -4, 0, 2.2, '#e8d9a0');
      c.save(); circP(-4, 0, 15.5)(c); c.clip(); c.beginPath(); c.ellipse(-9, -7, 8, 3.2, -0.7, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fill(); c.restore();
      if (L >= 4) { circP(-13, -10, 6)(c); c.fillStyle = rg(c, -15, -12, 0.5, -13, -10, 6, [[0, '#fff0a8'], [1, '#a8741a']]); c.fill(); ink(c, 1.4); circP(-13, -10, 1.8)(c); c.fillStyle = '#6a4812'; c.fill(); }
      if (L >= 6) { c.beginPath(); c.arc(-4, 0, 17.5, 0, TAU); c.strokeStyle = '#ffd84d'; c.lineWidth = 1.4; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) { // the spinning barrel cluster, drawn over the static cymbal
      const sp = t * (6 + fire * 24);
      const len = 22 + L, tubes = [];
      for (let k = 0; k < 3; k++) tubes.push({ y: Math.sin(sp + k * 2.094) * 6, z: Math.cos(sp + k * 2.094) });
      tubes.sort((a, b) => a.z - b.z);
      for (const tb of tubes) {
        const P = rrP(10, tb.y - 2.5, len, 5, 2.2);
        P(c); c.fillStyle = metal(c, tb.y - 2.5, tb.y + 2.5, tb.z > 0 ? '#b7c1e2' : '#6c7699'); c.fill(); ink(c, 1.6);
        rrP(10 + len - 4, tb.y - 3, 5, 6, 1.6)(c); c.fillStyle = L >= 7 ? gold(c, tb.y - 3, tb.y + 3) : metal(c, tb.y - 3, tb.y + 3, L >= 5 ? acc : '#4c5578'); c.fill(); ink(c, 1.3);
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(12, tb.y - 1.7, len - 8, 0.8);
      }
      rrP(7, -9, 4, 18, 1.5)(c); c.fillStyle = chrome(c, -9, 9); c.fill(); ink(c, 1.4);
      bloom(c, 10 + len + 2, 0, 8 + fire * 8, '#9bffe0', 0.15 + fire * 0.7);
    },
  },
  sub: {
    fixed: true,
    draw(c, L, col, acc) {
      const cab = rrP(-22, -22, 44, 44, 8);
      cab(c); c.fillStyle = lg(c, -22, -22, 22, 22, [[0, '#3a3068'], [0.5, '#1d1642'], [1, '#0d0a22']]); c.fill();
      brushed(c, cab, -22, -22, 44, 44, 0.05);
      finish(c, cab, -22, 22, { ao: 0.4 }); inkVar(c, cab, 2.8, [-22, -22, 22, 22]);
      for (const [bx, by] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) { rrP(bx - 3, by - 3, 6, 6, 2)(c); c.fillStyle = L >= 6 ? gold(c, by - 3, by + 3) : chrome(c, by - 3, by + 3); c.fill(); ink(c, 1.1); screw(c, bx, by, 1.2, '#d6e0ff'); }
      // speaker: rubber surround, fabric cone, dust cap
      circP(0, 0, 17.5)(c); c.fillStyle = rg(c, -5, -6, 2, 0, 0, 18, [[0, '#3a3a52'], [1, '#07050f']]); c.fill(); ink(c, 2);
      circP(0, 0, 14.5)(c); c.fillStyle = rg(c, -4, -5, 1, 0, 0, 15, [[0, shade(col, 0.1)], [0.5, shade(col, -0.45)], [1, shade(col, -0.8)]]); c.fill(); ink(c, 1.4);
      c.save(); circP(0, 0, 14.2)(c); c.clip(); c.lineWidth = 0.5; c.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let k = -16; k <= 16; k += 2.2) { c.beginPath(); c.moveTo(k, -16); c.lineTo(k + 8, 16); c.stroke(); c.beginPath(); c.moveTo(k + 8, -16); c.lineTo(k, 16); c.stroke(); }
      c.restore();
      lathe(c, 0, 0, 14, 3, 0.1);
      if (L >= 4) { // bass port and tweeter
        circP(15, -15, 3.8)(c); c.fillStyle = '#05030c'; c.fill(); ink(c, 1.2);
        circP(-15, 15, 3, '#fff')(c); c.fillStyle = rg(c, -15, 15, 0.3, -15, 15, 3, [[0, '#e8e0ff'], [1, '#3a3060']]); c.fill(); ink(c, 1);
      }
      if (L >= 6) { circP(0, 0, 19.2)(c); c.lineWidth = 1.6; c.strokeStyle = '#ffd84d'; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) {
      const pul = 1 + Math.sin(t * 5) * 0.045 + fire * 0.1;
      sphere(c, 0, 0, 6.6 * pul, shade(col, 0.25), { ink: 1.5, hi: '#ffffff' });
      circP(0, 0, 15.5)(c); c.lineWidth = 2.2; c.strokeStyle = withAlpha(col, 0.55 + 0.25 * Math.sin(t * 5)); c.stroke(); // neon ring
      bloom(c, 0, 0, 22, col, 0.22 + fire * 0.5);
      const ph = (t * 0.9) % 1;
      c.beginPath(); c.arc(0, 0, 15 + ph * (14 + L), 0, TAU); c.strokeStyle = 'rgba(190,170,255,' + (0.5 * (1 - ph)).toFixed(3) + ')'; c.lineWidth = 2.6; c.stroke();
      if (L >= 4) { const p2 = (ph + 0.5) % 1; c.beginPath(); c.arc(0, 0, 15 + p2 * (14 + L), 0, TAU); c.strokeStyle = 'rgba(190,170,255,' + (0.36 * (1 - p2)).toFixed(3) + ')'; c.lineWidth = 1.6; c.stroke(); }
    },
  },
  mic: {
    draw(c, L, col, acc) {
      // cable coil and handle with pink band
      circP(-19, 0, 6.5)(c); c.fillStyle = rg(c, -21, -2, 0.5, -19, 0, 7, [[0, '#6a5ca0'], [1, '#2a2050']]); c.fill(); ink(c, 2);
      circP(-19, 0, 3)(c); c.fillStyle = '#0c0820'; c.fill();
      const H = rrP(-18, -4.8, 26, 9.6, 4.4);
      H(c); c.fillStyle = lg(c, 0, -5, 0, 5, [[0, '#5a4e8c'], [0.3, '#2f2658'], [1, '#0c0820']]); c.fill(); finish(c, H, -5, 5, { ao: 0.3 }); inkVar(c, H, 2.4, [-18, -5, 8, 5]);
      rrP(-9, -5.3, 7, 10.6, 2)(c); c.fillStyle = metal(c, -5, 5, col); c.fill(); ink(c, 1.5); // coloured band
      rrP(2, -5.6, 3.4, 11.2, 1.4)(c); c.fillStyle = chrome(c, -5.6, 5.6); c.fill(); ink(c, 1.4);
      heartP(c, -13.5, 0, 2.4); c.fillStyle = '#fff'; c.fill();
      // ball grille
      const br = L >= 4 ? 11.5 : 10;
      circP(14, 0, br + 1.8)(c); c.fillStyle = chrome(c, -br - 2, br + 2); c.fill(); ink(c, 2);
      circP(14, 0, br)(c); c.fillStyle = rg(c, 12, -3, 1, 14, 0, br, [[0, '#fff0fa'], [0.5, shade(col, 0.55)], [1, shade(col, -0.35)]]); c.fill();
      mesh(c, 14, 0, br - 0.5, 2.6, 'rgba(80,30,70,0.6)', 0.8);
      mesh(c, 14, 0, br - 0.5, 2.6, 'rgba(255,255,255,0.18)', 0.4);
      circP(14, 0, br)(c); ink(c, 2.2);
      c.save(); circP(14, 0, br)(c); c.clip(); c.beginPath(); c.ellipse(10.5, -4.2, br * 0.5, br * 0.22, -0.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.65)'; c.fill(); c.restore();
      if (L >= 6) { circP(14, 0, br + 3)(c); c.lineWidth = 1.5; c.strokeStyle = '#ffd84d'; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) {
      const br = L >= 4 ? 11.5 : 10, waves = L >= 7 ? 3 : L >= 4 ? 2 : 1;
      bloom(c, 14, 0, br + 8, col, 0.2 + fire * 0.55);
      for (let i = 0; i < waves; i++) { const ph = ((t * 1.4 + i / waves) % 1); c.beginPath(); c.arc(14, 0, br + 4 + ph * 9, -0.75, 0.75); c.strokeStyle = withAlpha(i % 2 ? acc : col, 0.8 * (1 - ph)); c.lineWidth = 2.4 - ph; c.lineCap = 'round'; c.stroke(); }
    },
  },
  synth: {
    draw(c, L, col, acc) {
      const pr = L >= 5 ? 3 : L >= 3 ? 3 : 2;
      for (let i = 0; i < pr; i++) {
        const y = pr === 2 ? (i ? 8 : -8) : (i - 1) * 9;
        const P = rrP(4, y - 2.2, 25, 4.4, 2);
        P(c); c.fillStyle = lg(c, 0, y - 2.2, 0, y + 2.2, [[0, '#ffd9a8'], [0.4, '#c9783a'], [1, '#6a3414']]); c.fill(); ink(c, 1.8);
        // copper coil windings
        c.save(); P(c); c.clip(); c.lineWidth = 0.9; c.strokeStyle = 'rgba(60,20,0,0.5)'; for (let x = 7; x < 28; x += 2.4) { c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x, y + 3); c.stroke(); } c.restore();
        sphere(c, 30, y, 3.2, '#c4f1ff', { ink: 1.4, hi: '#fff' });
      }
      const B = rrP(-19, -15, 26, 30, 6);
      B(c); c.fillStyle = lg(c, -19, -15, 7, 15, [[0, '#4a5c9a'], [0.5, '#222e5e'], [1, '#0e1430']]); c.fill(); brushed(c, B, -19, -15, 26, 30, 0.06);
      finish(c, B, -15, 15, { ao: 0.4 }); inkVar(c, B, 2.6, [-19, -15, 7, 15]);
      // keys
      rrP(-1, -14, 7, 28, 2)(c); c.fillStyle = '#f6f2ea'; c.fill(); ink(c, 1.3);
      for (let i = -4; i <= 4; i++) { rrP(-1, i * 3.1 - 1.2, 4.6, 2.4, 0.8)(c); c.fillStyle = '#17102c'; c.fill(); }
      // screen and knobs
      rrP(-16, -12, 14, 9, 2)(c); c.fillStyle = '#041225'; c.fill(); ink(c, 1.4);
      for (let i = 0; i < 3; i++) { const kx = -14 + i * 4.8; sphere(c, kx, 6.5, 2.2, i === 1 ? acc : '#9aa8d8', { ink: 1.1 }); }
      for (let i = 0; i < 2; i++) { rrP(-15 + i * 6, 11, 3.6, 1.6, 0.6)(c); c.fillStyle = i ? col : '#0a1226'; c.fill(); }
      if (L >= 6) { B(c); c.lineWidth = 1.6; c.strokeStyle = '#ffd84d'; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) {
      const pr = L >= 3 ? 3 : 2;
      // screen waveform
      c.beginPath(); for (let i = 0; i <= 10; i++) { const x = -15 + i * 1.2, y = -7.5 + Math.sin(t * 6 + i * 1.1) * 2.6; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.strokeStyle = col; c.lineWidth = 1.2; c.stroke();
      bloom(c, -9, -7.5, 8, col, 0.28);
      // arcs between the tips
      const arcs = L >= 5 ? 2 : 1;
      for (let a = 0; a < arcs; a++) {
        const y0 = pr === 2 ? -8 : -9, y1 = pr === 2 ? 8 : 9, k = Math.floor(t * 18 + a * 5);
        c.beginPath(); c.moveTo(30, y0 + (a ? 9 : 0));
        for (let i = 1; i < 5; i++) c.lineTo(30 + Math.sin(k * 3.1 + i * 2.7 + a) * 2.6, y0 + (a ? 9 : 0) + (y1 - y0) * i / 5 + Math.cos(k * 1.7 + i) * 1.2);
        c.lineTo(30, y1 - (a ? 9 : 0));
        c.strokeStyle = '#e8fbff'; c.lineWidth = 1.5; c.stroke(); c.strokeStyle = withAlpha('#35c8ff', 0.5); c.lineWidth = 3.4; c.stroke();
      }
      bloom(c, 31, 0, 8 + L + fire * 8, '#6fd8ff', 0.3 + fire * 0.6);
    },
  },
  horn: {
    draw(c, L, col, acc) {
      const m = 11.5 + L * 0.9;
      if (L >= 7) for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) { c.save(); c.rotate(a); const P = polyP([[0, -3.4], [0, 3.4], [16, 7.5], [16, -7.5]]); P(c); c.fillStyle = metal(c, -7, 7, '#c8283e'); c.fill(); inkVar(c, P, 2, [0, -7, 16, 7]); ellP(16, 0, 2, 7.2)(c); c.fillStyle = '#240610'; c.fill(); c.restore(); }
      // air tank and gauge
      const T = rrP(-24, -8.4, 17, 16.8, 7.4);
      T(c); c.fillStyle = lg(c, 0, -8.4, 0, 8.4, [[0, '#f4f2ff'], [0.3, '#c6c8e4'], [1, '#6a6c96']]); c.fill(); finish(c, T, -8.4, 8.4, { ao: 0.3 }); inkVar(c, T, 2.4, [-24, -8, -7, 8]);
      circP(-13, -8.4, 3.4)(c); c.fillStyle = '#fffaf0'; c.fill(); ink(c, 1.3); line(c, -13, -8.4, -11.4, -10, '#ff4a5e', 1.1);
      rrP(-9.6, -9, 4.6, 5, 1)(c); c.fillStyle = '#ff4a5e'; c.fill(); ink(c, 1.2); // trigger button
      // the flared bell: red gloss paint with ribs and a chrome lip
      const bell = polyP([[-7, -5.5], [-7, 5.5], [29, m], [29, -m]]);
      bell(c); c.fillStyle = lg(c, 0, -m, 0, m, [[0, '#ff9aa6'], [0.2, '#ff5a6e'], [0.55, '#d3283e'], [1, '#6a0f22']]); c.fill();
      c.save(); bell(c); c.clip(); c.lineWidth = 1.4;
      for (const x of [3, 11, 19]) { const w = 5.5 + (x + 7) / 36 * (m - 5.5); c.strokeStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.moveTo(x, -w); c.lineTo(x, w); c.stroke(); c.strokeStyle = 'rgba(40,0,10,0.35)'; c.beginPath(); c.moveTo(x + 1.6, -w); c.lineTo(x + 1.6, w); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.moveTo(-5, -4); c.lineTo(29, -m * 0.82); c.lineTo(29, -m * 0.6); c.lineTo(-5, -2.8); c.closePath(); c.fill();
      c.restore();
      inkVar(c, bell, 2.6, [-7, -m, 29, m]);
      ellP(29, 0, 4.6, m)(c); c.fillStyle = L >= 7 ? gold(c, -m, m) : chrome(c, -m, m); c.fill(); ink(c, 2.4);
      ellP(30.4, 0, 2.6, m - 3)(c); c.fillStyle = rg(c, 31, 0, 1, 31, 0, m, [[0, '#050204'], [1, '#2a0a12']]); c.fill();
      if (L >= 5) { c.beginPath(); c.arc(29, 0, m + 4, -0.95, 0.95); c.strokeStyle = acc; c.lineWidth = 2; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) { const m = 11.5 + L * 0.9; bloom(c, 32, 0, m + 6, '#ff7a8a', 0.12 + fire * 0.65); },
  },
  scratch: {
    fixed: true,
    draw(c, L, col, acc) {
      const D = rrP(-22, -22, 44, 44, 7);
      D(c); c.fillStyle = metal(c, -22, 22, '#6a6aa0'); c.fill(); brushed(c, D, -22, -22, 44, 44, 0.08);
      finish(c, D, -22, 22, { ao: 0.4 }); inkVar(c, D, 2.8, [-22, -22, 22, 22]);
      // platter well
      circP(-2, 1, 18)(c); c.fillStyle = rg(c, -4, -2, 2, -2, 1, 19, [[0, '#2a2548'], [1, '#0a0818']]); c.fill(); ink(c, 2);
      // tonearm base, crossfader
      sphere(c, 15, -16, 4, '#aeb8dc', { ink: 1.6 });
      rrP(-14, 17.5, 22, 3.6, 1.6)(c); c.fillStyle = '#0a0818'; c.fill(); ink(c, 1.2);
      rrP(-4, 16.4, 5, 5.8, 1.4)(c); c.fillStyle = chrome(c, 16, 22); c.fill(); ink(c, 1.2);
      for (const [lx, ly] of [[-18, -18], [18, 18], [18, -2]]) led(c, lx, ly, 1.3, acc, true);
      if (L >= 6) { D(c); c.lineWidth = 1.6; c.strokeStyle = '#ffd84d'; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) {
      const disc = (x, y, r, a) => {
        circP(x, y, r)(c); c.fillStyle = rg(c, x - r * 0.3, y - r * 0.3, 1, x, y, r, [[0, '#3a3560'], [0.6, '#15122c'], [1, '#05040e']]); c.fill(); ink(c, 1.8);
        c.lineWidth = 0.55; c.strokeStyle = 'rgba(150,140,210,0.55)'; for (let k = 0.55; k < 0.95; k += 0.11) { c.beginPath(); c.arc(x, y, r * k, 0, TAU); c.stroke(); }
        // rotating sheen wedges
        c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * 0.93, -0.28, 0.28); c.closePath(); c.fillStyle = 'rgba(255,255,255,0.2)'; c.fill();
        c.rotate(Math.PI); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * 0.93, -0.28, 0.28); c.closePath(); c.fill(); c.restore();
        circP(x, y, r * 0.36)(c); c.fillStyle = rg(c, x - 1, y - 1, 0.3, x, y, r * 0.36, [[0, shade(col, 0.5)], [1, shade(col, -0.2)]]); c.fill(); ink(c, 1.2);
        c.save(); c.translate(x, y); c.rotate(a); star(c, 0, 0, r * 0.2, r * 0.08, 3, 0); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill(); c.restore();
        circP(x, y, r * 0.07)(c); c.fillStyle = '#fff'; c.fill();
      };
      const sp = t * (5 + fire * 14);
      disc(-2, 1, 16, sp);
      if (L >= 3) disc(13, -12, 7.2, -sp * 1.3);
      if (L >= 7) disc(13, 13, 6.4, sp * 1.5);
      // tonearm
      c.beginPath(); c.moveTo(15, -16); c.lineTo(7, -4); c.strokeStyle = OUT; c.lineWidth = 3.8; c.lineCap = 'round'; c.stroke(); c.strokeStyle = '#d6dcf2'; c.lineWidth = 1.8; c.stroke();
      rrP(3, -5, 7, 3.6, 1.2)(c); c.fillStyle = acc; c.fill(); ink(c, 1.1);
      bloom(c, -2, 1, 24, col, 0.1 + fire * 0.3);
    },
  },
  loop: {
    fixed: true,
    draw(c, L, col, acc) {
      const B = rrP(-20, -18, 40, 38, 9);
      B(c); c.fillStyle = metal(c, -18, 20, shade(col, -0.2)); c.fill(); brushed(c, B, -20, -18, 40, 38, 0.06);
      finish(c, B, -18, 20, { ao: 0.4 }); inkVar(c, B, 2.8, [-20, -18, 20, 20]);
      // screen bezel
      rrP(-15, -14, 30, 16, 4.4)(c); c.fillStyle = '#031a12'; c.fill(); ink(c, 1.8);
      rrP(-14, -13, 28, 5, 3)(c); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill();
      // footswitches
      for (const fx of [-8.5, 8.5]) { circP(fx, 11, 6)(c); c.fillStyle = chrome(c, 5, 17); c.fill(); ink(c, 2); circP(fx, 11, 3.6)(c); c.fillStyle = rg(c, fx - 1, 10, 0.4, fx, 11, 4, [[0, '#8a96bc'], [1, '#2a3050']]); c.fill(); ink(c, 1.2); }
      for (const [kx, ky] of [[-16, 3.5], [16, 3.5]]) sphere(c, kx, ky, 2.3, acc, { ink: 1.1 });
      // jack sockets
      for (const sx of [-1, 1]) { rrP(sx * 20 - 1.4, -4, 2.8, 7, 1)(c); c.fillStyle = '#1b1530'; c.fill(); ink(c, 1); }
      if (L >= 6) { B(c); c.lineWidth = 1.6; c.strokeStyle = '#ffd84d'; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) {
      // looping ring on the screen, LEDs, and a "recording" light
      const a = t * 3;
      c.beginPath(); c.arc(0, -6, 5.4, 0, TAU); c.strokeStyle = withAlpha(col, 0.35); c.lineWidth = 2.4; c.stroke();
      c.beginPath(); c.arc(0, -6, 5.4, a, a + 2.2); c.strokeStyle = col; c.lineWidth = 2.4; c.lineCap = 'round'; c.stroke();
      circP(Math.cos(a + 2.2) * 5.4, -6 + Math.sin(a + 2.2) * 5.4, 1.5)(c); c.fillStyle = '#fff'; c.fill();
      bloom(c, 0, -6, 13, col, 0.35 + fire * 0.3);
      const on = (Math.floor(t * 4) % 2) === 0;
      led(c, 0, 11, 2.2, '#ff4a5e', on); if (on) bloom(c, 0, 11, 7, '#ff4a5e', 0.5);
      const leds = L >= 5 ? 4 : L >= 3 ? 2 : 1;
      for (let i = 0; i < leds; i++) led(c, 14 - i * 4.4, -16.4, 1.3, acc, (Math.floor(t * 3 + i) % 2) === 0);
      // aura ripple that shows it buffs its neighbours
      const ph = (t * 0.7) % 1; c.beginPath(); c.arc(0, 0, 24 + ph * 12, 0, TAU); c.strokeStyle = withAlpha(col, 0.28 * (1 - ph)); c.lineWidth = 2; c.stroke();
    },
  },
  cowbell: {
    draw(c, L, col, acc) {
      // long barrel, muzzle brake, scope; the cowbell is the stock
      barrel(c, 2, 36, 2.8, 2.8, '#5a6088', L);
      rrP(34, -4.4, 8, 8.8, 1.8)(c); c.fillStyle = L >= 7 ? gold(c, -4.4, 4.4) : chrome(c, -4.4, 4.4); c.fill(); ink(c, 1.8);
      for (const x of [36.6, 39.2]) line(c, x, -3.2, x, 3.2, 'rgba(20,10,46,0.8)', 1);
      if (L >= 5) { rrP(16, -5, 3.4, 10, 1)(c); c.fillStyle = metal(c, -5, 5, acc); c.fill(); ink(c, 1.3); }
      const sc = L >= 3 ? 1.22 : 1;
      rrP(6, -12 * sc, 15 * sc, 6.6 * sc, 2.4)(c); c.fillStyle = metal(c, -12 * sc, -5 * sc, '#454c7c'); c.fill(); ink(c, 1.8);
      circP(21 * sc, -8.8 * sc, 3.7)(c); c.fillStyle = rg(c, 20 * sc, -10 * sc, 0.3, 21 * sc, -8.8 * sc, 3.7, [[0, '#ffffff'], [0.4, '#6fd0ff'], [1, '#14487a']]); c.fill(); ink(c, 1.5);
      rrP(10, -6, 3.4, 4, 0.8)(c); c.fillStyle = '#8a92c0'; c.fill(); ink(c, 1);
      // the cowbell stock
      const bellP = polyP([[-24, -11.5], [-5, -7.4], [-5, 7.4], [-24, 11.5]]);
      bellP(c); c.fillStyle = lg(c, 0, -11.5, 0, 11.5, [[0, '#fff0b0'], [0.25, '#ffc83d'], [0.6, '#c88a1a'], [1, '#6a4410']]); c.fill();
      c.save(); bellP(c); c.clip(); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(-23, -8.6, 18, 1.8); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(-23, 4, 18, 5); c.restore();
      inkVar(c, bellP, 2.4, [-24, -11, -5, 11]);
      ellP(-24, 0, 2.8, 11.5)(c); c.fillStyle = '#2a1a0a'; c.fill(); ink(c, 2);
      sphere(c, -12, 13.4, 2.3, '#d6d6e8', { ink: 1.2 }); line(c, -12, 13, -6, 17, '#8a90b8', 1.6); // bipod
      line(c, -12, 13, -18, 17, '#8a90b8', 1.6);
      if (L >= 6) { bellP(c); c.lineWidth = 1.5; c.strokeStyle = '#ffd84d'; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) {
      if (L >= 7) { c.beginPath(); c.moveTo(43, 0); c.lineTo(120, 0); c.strokeStyle = 'rgba(255,60,80,' + (0.18 + 0.1 * Math.sin(t * 20)).toFixed(3) + ')'; c.lineWidth = 1; c.stroke(); bloom(c, 43, 0, 4, '#ff4a5e', 0.8); }
      bloom(c, 21 * (L >= 3 ? 1.22 : 1), -8.8 * (L >= 3 ? 1.22 : 1), 7, '#6fd0ff', 0.28 + 0.1 * Math.sin(t * 2));
      bloom(c, 44, 0, 10 + fire * 14, '#ffd27a', fire * 0.9);
    },
  },
  amp: {
    fixed: true,
    draw(c, L, col, acc) {
      // speaker cabinet with cloth grille
      const cab = rrP(-20, -2, 40, 21, 4);
      cab(c); c.fillStyle = lg(c, 0, -2, 0, 19, [[0, '#3a2a4a'], [1, '#150c20']]); c.fill(); finish(c, cab, -2, 19, { ao: 0.45 }); inkVar(c, cab, 2.4, [-20, -2, 20, 19]);
      for (const sx of [-9.5, 9.5]) {
        circP(sx, 8.5, 7.4)(c); c.fillStyle = '#0d0816'; c.fill(); ink(c, 1.8);
        c.save(); circP(sx, 8.5, 6.4)(c); c.clip(); c.lineWidth = 0.6; c.strokeStyle = 'rgba(255,140,190,0.4)'; for (let k = -8; k <= 8; k += 1.7) { c.beginPath(); c.moveTo(sx + k, 0); c.lineTo(sx + k, 18); c.stroke(); c.beginPath(); c.moveTo(sx - 8, 8.5 + k); c.lineTo(sx + 8, 8.5 + k); c.stroke(); } c.restore();
        circP(sx, 8.5, 1.9)(c); c.fillStyle = col; c.fill();
      }
      // the head unit with knobs
      const hd = rrP(-19, -19, 38, 17, 4);
      hd(c); c.fillStyle = lg(c, 0, -19, 0, -2, [[0, shade(col, 0.45)], [0.35, shade(col, -0.1)], [1, shade(col, -0.65)]]); c.fill(); brushed(c, hd, -19, -19, 38, 17, 0.07);
      finish(c, hd, -19, -2, { ao: 0.3 }); inkVar(c, hd, 2.6, [-19, -19, 19, -2]);
      rrP(-17, -17, 34, 4, 2)(c); c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill();
      for (let i = 0; i < 5; i++) { const kx = -11 + i * 5.5; sphere(c, kx, -8, 2.6, '#f4f0e8', { ink: 1.2 }); line(c, kx, -8, kx + (i % 2 ? 1 : -0.8), -10.4, OUT, 0.9); }
      const lamps = Math.min(L, 7);
      for (let i = 0; i < lamps; i++) led(c, -13 + i * 3.6, -4.3, 1.1, L >= 7 ? '#ffd84d' : acc, true);
      if (L >= 5) { rrP(-19, -19, 38, 38, 4)(c); c.lineWidth = 1.4; c.strokeStyle = L >= 7 ? '#ffd84d' : acc; c.stroke(); }
    },
    live(c, L, t, col, acc, fire) {
      led(c, 15, -12.6, 1.8, '#ff4a5e', true); bloom(c, 15, -12.6, 6, '#ff4a5e', 0.55);
      // glowing tubes pulse
      bloom(c, 0, -3, 22, col, 0.1 + 0.07 * Math.sin(t * 3) + fire * 0.35);
      for (let i = 0; i < 2; i++) { const sx = i ? 9.5 : -9.5, k = 0.5 + 0.5 * Math.sin(t * 7 + i * 2); circP(sx, 8.5, 1.9 + k * 0.5)(c); c.fillStyle = withAlpha(col, 0.5 + k * 0.5); c.fill(); }
    },
  },
  vocal: {
    fixed: true,
    draw(c, L, col, acc) {
      // levitation emitter ring under the orbs
      ellP(0, 12, 17, 6.5)(c); c.fillStyle = rg(c, -4, 10, 2, 0, 12, 18, [[0, '#6a5ca0'], [1, '#1c1440']]); c.fill(); ink(c, 2);
      ellP(0, 11.4, 12, 4)(c); c.fillStyle = '#0a0620'; c.fill(); ink(c, 1.2);
    },
    live(c, L, t, col, acc, fire) {
      const orb = (x, y, r, ph) => {
        bloom(c, x, y, r * 2.8, '#ffb8e6', 0.32 + fire * 0.4);
        circP(x, y, r)(c); c.fillStyle = rg(c, x - r * 0.35, y - r * 0.4, r * 0.06, x, y, r, [[0, '#ffffff'], [0.4, '#ffd9f2'], [0.75, mixHex('#ff9ad6', '#9ad6ff', 0.5 + 0.5 * Math.sin(t * 1.5 + ph)), ], [1, shade(col, -0.35)]]); c.fill(); ink(c, 2);
        c.beginPath(); c.arc(x - r * 0.3, y - r * 0.38, r * 0.22, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
        c.save(); c.translate(x, y); c.rotate(ph); c.beginPath(); c.ellipse(0, 0, r + 6, r * 0.38, 0, 0, TAU); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5; c.stroke(); circP(r + 6, 0, 1.8)(c); c.fillStyle = '#fff'; c.fill(); c.restore();
      };
      const bob = Math.sin(t * 2.4) * 1.8;
      if (L >= 7) { orb(-3, -9 + bob, 8.4, t); orb(4, 7 - bob, 8.4, -t * 1.2); }
      else orb(0, -2 + bob, 12 + Math.min(3, L * 0.4), t);
      const a = t * 2;
      for (let i = 0; i < 3; i++) { const aa = a + i * 2.094; spark(c, Math.cos(aa) * 21, Math.sin(aa) * 21 - 2, 3.2, i === 0 ? '#fff' : acc); }
      if (L >= 3) { c.beginPath(); c.arc(0, -2, 24, a, a + 1.4); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.8; c.lineCap = 'round'; c.stroke(); }
    },
  },
};
function heartP(c, x, y, s) {
  c.beginPath(); c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.8, y - s * 1.3, x, y - s * 0.4);
  c.bezierCurveTo(x + s * 0.8, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9); c.closePath();
}
const MUZZLE = { kick: 37, snare: 44, hat: 41, mic: 30, synth: 41, horn: 39, cowbell: 53 };

// ================================================================ drawTurret
export function drawTurret(ctx, type, level, x, y, o) {
  const def = TURRETS[type];
  if (!def) return;
  o = o || {};
  const L = clampN(Math.round(level || 1), 1, 7);
  const t = o.t || 0;
  const head = HEADS[type];
  const fire = clampN(o.fire || 0, 0, 1);
  const ang = o.ang || 0;
  const tier = TIER[L];
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  let sc = o.scale == null ? 1 : o.scale;
  if (o.spawn != null && o.spawn < 1) sc *= Math.max(0.01, easeOutBack(clampN(o.spawn, 0, 1)));
  ctx.translate(x, y);
  if (sc !== 1) ctx.scale(sc, sc);
  const jam = !!o.jammed;
  if (jam) ctx.translate(Math.sin(t * 60) * 1.1, 0);

  // level 7 energy aura: breathing golden bloom, a slow ring and four orbiting sparks
  if (L >= 7) {
    const k = 0.5 + 0.5 * Math.sin(t * 2.6);
    bloom(ctx, 0, 0, 60 + k * 6, '#ffcf3a', 0.5 + k * 0.18);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(0, 0, 40 + k * 3, 0, TAU); ctx.strokeStyle = 'rgba(255,214,90,' + (0.2 + k * 0.14).toFixed(3) + ')'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 4; i++) { const a = t * 1.6 + i * TAU / 4; bloom(ctx, Math.cos(a) * 41, Math.sin(a) * 41, 7, '#fff0a0', 0.9); }
  } else if (L >= 5) bloom(ctx, 0, 0, 52, tier.rim, 0.16 + 0.07 * Math.sin(t * 3));

  // plinth
  blit(ctx, sprite('pl:' + type + ':' + L, 84, 90, (c) => plinth(c, def, L)), 0, 0, 1);
  if (L >= 5) { // pulsing neon edge on top of the baked one
    const k = 0.55 + 0.45 * Math.sin(t * 3.2 + L);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; rrPath(ctx, -29, -29, 58, 58, 12); ctx.lineWidth = 2.4; ctx.strokeStyle = withAlpha(tier.rim, 0.5 * k + fire * 0.4); ctx.stroke(); ctx.restore();
  }
  if (fire > 0.3) bloom(ctx, 0, 0, 40, def.color, (fire - 0.3) * 0.55);
  if (o.buff) { // aura-buffed: a soft coloured light pooled on the pad
    const col = o.buff === 'dmg' ? '#ff5a78' : '#5dffa8';
    bloom(ctx, 0, 0, 38, col, 0.22 + 0.1 * Math.sin(t * 4));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; rrPath(ctx, -27, -27, 54, 54, 11); ctx.lineWidth = 1.6; ctx.strokeStyle = withAlpha(col, 0.55); ctx.stroke(); ctx.restore();
  }

  // head
  const fixed = !!head.fixed;
  ctx.save();
  if (!fixed) { ctx.rotate(ang); ctx.translate(-fire * 4, 0); }
  else if (fire > 0) { const k = 1 + fire * 0.07; ctx.scale(k, k); }
  const hsc = fixed ? 1.08 : 1.15;
  ctx.scale(hsc, hsc);
  const hs = sprite('hd:' + type + ':' + L, 104, 104, (c) => head.draw(c, L, def.color, def.accent));
  // a soft contact shadow under the head sells the height
  const shadow = sprite('hs:' + type + ':' + L, 104, 104, (c) => { head.draw(c, L, def.color, def.accent); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#080318'; c.fillRect(-60, -60, 120, 120); });
  if (shadow.cv) { ctx.save(); ctx.globalAlpha *= 0.35; ctx.translate(2.4, 3.4); blit(ctx, shadow, 0, 0, 1); ctx.restore(); }
  blit(ctx, hs, 0, 0, 1);
  if (head.live) head.live(ctx, L, t, def.color, def.accent, fire);
  ctx.restore();


  // muzzle bloom
  if (fire > 0.5 && !fixed && MUZZLE[type]) {
    const mx = Math.cos(ang) * MUZZLE[type], my = Math.sin(ang) * MUZZLE[type];
    const k = (fire - 0.4) * 1.6;
    bloom(ctx, mx, my, 14 + fire * 12, def.accent, k);
    bloom(ctx, mx, my, 7 + fire * 5, '#ffffff', k);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(mx, my); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, -2.4); ctx.lineTo(16 * k, 0); ctx.lineTo(0, 2.4); ctx.closePath(); ctx.fillStyle = withAlpha('#fff6c8', Math.min(1, k)); ctx.fill();
    ctx.restore();
  } else if (fire > 0.3 && fixed) bloom(ctx, 0, 0, 30 + fire * 12, def.accent, (fire - 0.3) * 0.7);

  if (jam) { // jammed: dark veil, error sparks and a jittering bolt
    rrPath(ctx, -31, -31, 62, 62, 14); ctx.fillStyle = 'rgba(8,4,24,0.58)'; ctx.fill();
    const k = Math.floor(t * 12);
    ctx.beginPath(); ctx.moveTo(3, -13); ctx.lineTo(-7, 3); ctx.lineTo(-1, 3); ctx.lineTo(-4, 14); ctx.lineTo(7, -3); ctx.lineTo(1, -3); ctx.closePath();
    ctx.fillStyle = '#ffe14d'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
    bloom(ctx, 0, 0, 24, '#ffe14d', 0.45);
    for (let i = 0; i < 4; i++) { spark(ctx, ((k * 37 + i * 53) % 50) - 25, ((k * 29 + i * 71) % 50) - 25, 3.2, '#fff7a0'); }
  }
  if (o.buff) { // small badge
    const col = o.buff === 'dmg' ? '#ff6b7e' : '#6dffa8';
    const bob = Math.sin(t * 5) * 1.4;
    ctx.save(); ctx.translate(21, -24 + bob);
    ctx.beginPath(); ctx.arc(0, 0, 7.6, 0, TAU); ctx.fillStyle = '#1c1240'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = col; ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath();
    if (o.buff === 'dmg') { ctx.moveTo(0, -4.4); ctx.lineTo(4.4, 1); ctx.lineTo(1.6, 1); ctx.lineTo(1.6, 4.4); ctx.lineTo(-1.6, 4.4); ctx.lineTo(-1.6, 1); ctx.lineTo(-4.4, 1); }
    else { ctx.moveTo(-4, -4); ctx.lineTo(0, 0); ctx.lineTo(-4, 4); ctx.lineTo(-2, 4); ctx.lineTo(2, 0); ctx.lineTo(-2, -4); ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(2, 4); ctx.lineTo(6, 0); ctx.lineTo(2, -4); }
    ctx.fill(); ctx.restore();
    bloom(ctx, 21, -24 + bob, 11, col, 0.35);
  }
  if (o.selected) { // bright animated corner brackets and a soft halo
    const p = 0.6 + Math.sin(t * 7) * 0.4, e = 35 + p * 1.2;
    bloom(ctx, 0, 0, 52, '#ffffff', 0.18 + p * 0.1);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath(); ctx.moveTo(sx * e, sy * (e - 11)); ctx.lineTo(sx * e, sy * e); ctx.lineTo(sx * (e - 11), sy * e);
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,10,46,0.85)'; ctx.stroke(); ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 + p * 0.3).toFixed(2) + ')'; ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
function rrPath(ctx, x, y, w, h, r) { rrP(x, y, w, h, r)(ctx); }

// ================================================================ drawTurretIconFlat (list icon: tile + the baked head)
export function drawTurretIconFlat(ctx, type, x, y, size) {
  const def = TURRETS[type];
  if (!def) return;
  const head = HEADS[type];
  ctx.save();
  ctx.translate(x, y); const s = size / 40; ctx.scale(s, s);
  rrPath(ctx, -19, -19, 38, 38, 9);
  ctx.fillStyle = lg(ctx, 0, -19, 0, 19, [[0, shade(def.color, 0.35)], [0.55, shade(def.color, -0.35)], [1, shade(def.color, -0.75)]]); ctx.fill();
  ctx.lineWidth = 2.6; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.save(); rrPath(ctx, -19, -19, 38, 38, 9); ctx.clip();
  ctx.beginPath(); ctx.ellipse(-4, -14, 18, 7, -0.3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
  ctx.translate(0, 0); const k = 0.4; ctx.scale(k, k);
  if (!head.fixed) ctx.rotate(-0.5);
  if (!head.fixed) ctx.translate(-5, 0);
  blit(ctx, sprite('hd:' + type + ':5', 104, 104, (c) => head.draw(c, 5, def.color, def.accent)), 0, 0, 1);
  ctx.restore();
  ctx.restore();
}

// ================================================================ PROJECTILES
function trail(ctx, len, color, w, a) { // tapered streak behind a bullet (drawn in the bullet's rotated frame, head at the origin)
  const g = ctx.createLinearGradient(-len, 0, 0, 0);
  g.addColorStop(0, withAlpha(color, 0)); g.addColorStop(1, withAlpha(color, a));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, -w); ctx.lineTo(0, w); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
}
export function drawProjectile(ctx, kind, x, y, o) {
  o = o || {};
  const t = o.t || 0, ang = o.ang || 0, s = o.scale == null ? 1 : o.scale;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s * 1.2, s * 1.2);
  switch (kind) {
    case 'kick': { // iron shell with a hot core, smoke and a fire tail
      ctx.rotate(ang);
      trail(ctx, 30, '#ff7a2c', 6.5, 0.7);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-12 - i * 7, Math.sin(t * 9 + i) * 1.5, 4 + i * 1.4, 0, TAU); ctx.fillStyle = 'rgba(70,50,60,' + (0.32 - i * 0.08).toFixed(2) + ')'; ctx.fill(); }
      bloom(ctx, -3, 0, 17, '#ff8a3c', 0.75);
      ctx.beginPath(); ctx.arc(0, 0, 6.8, 0, TAU); ctx.fillStyle = rg(ctx, -2, -2.4, 0.5, 0, 0, 7, [[0, '#ffe2b0'], [0.35, '#ff9a3c'], [0.75, '#7a2a14'], [1, '#2a0a10']]); ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.beginPath(); ctx.arc(-1.8, -2.2, 1.7, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      break;
    }
    case 'snare': {
      ctx.rotate(ang);
      trail(ctx, 22, '#ffe36e', 3.4, 0.8);
      bloom(ctx, 0, 0, 9, '#ffe36e', 0.7);
      ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 2.8, 0, 0, TAU); ctx.fillStyle = '#fff8d0'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,170,40,0.9)'; ctx.stroke();
      break;
    }
    case 'hat': {
      ctx.rotate(ang);
      trail(ctx, 16, '#7dffd0', 2.2, 0.85);
      bloom(ctx, 0, 0, 6, '#9bffe0', 0.8);
      ctx.beginPath(); ctx.arc(0.6, 0, 1.9, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
      break;
    }
    case 'scratch': {
      bloom(ctx, 0, 0, 17, '#cfd6ff', 0.4);
      ctx.save(); ctx.rotate(t * 16);
      ctx.beginPath(); ctx.arc(0, 0, 9.2, 0, TAU); ctx.fillStyle = rg(ctx, -3, -3, 0.5, 0, 0, 9.4, [[0, '#4a4478'], [0.6, '#17122c'], [1, '#05040e']]); ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(170,160,230,0.6)'; for (const k of [4.6, 6.4, 7.8]) { ctx.beginPath(); ctx.arc(0, 0, k, 0, TAU); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 8.6, -0.3, 0.3); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fillStyle = '#e5e5ff'; ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.restore();
      break;
    }
    case 'cowbell': {
      ctx.rotate(ang);
      trail(ctx, 46, '#ffc83d', 3, 0.85);
      bloom(ctx, 0, 0, 12, '#ffd27a', 0.8);
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-3, -4.4); ctx.lineTo(-8, 0); ctx.lineTo(-3, 4.4); ctx.closePath();
      ctx.fillStyle = lg(ctx, 0, -4.4, 0, 4.4, [[0, '#fff8d0'], [0.5, '#ffc83d'], [1, '#a8741a']]); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
      break;
    }
    case 'orb': case 'vocal': {
      bloom(ctx, 0, 0, 21, '#ffb8e6', 0.8);
      ctx.beginPath(); ctx.arc(0, 0, 6.4, 0, TAU); ctx.fillStyle = rg(ctx, -2, -2.4, 0.3, 0, 0, 6.6, [[0, '#ffffff'], [0.5, '#ffd9f2'], [1, '#ff9ad6']]); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
      for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.094; spark(ctx, Math.cos(a) * 11, Math.sin(a) * 11, 2.8, '#ffffff'); }
      break;
    }
    case 'synth': {
      ctx.rotate(ang);
      bloom(ctx, 0, 0, 12, '#6fd8ff', 0.7);
      ctx.beginPath(); ctx.moveTo(-9, 0); for (let i = 1; i <= 5; i++) ctx.lineTo(-9 + i * 3.6, (i % 2 ? -1 : 1) * 3.6);
      ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.strokeStyle = 'rgba(53,200,255,0.5)'; ctx.lineWidth = 4.6; ctx.stroke();
      break;
    }
    default: {
      bloom(ctx, 0, 0, 9, '#fff6ea', 0.7);
      ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fillStyle = '#fff6ea'; ctx.fill();
    }
  }
  ctx.restore();
}
