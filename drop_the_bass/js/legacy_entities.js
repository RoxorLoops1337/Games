// art_entities.js: canvas drawing for turrets, enemies, bosses, projectiles, glyphs, gear, crates and rarity frames.
// Contract: drop_the_bass/CLAUDE.md. Every public draw function does one save/restore and leaves ctx state as found.
// No Date, no Math.random: motion comes from the `t` argument and hashes of ids. Sprite caches only when `document` exists.
import { TURRETS, ENEMIES, BOSSES, AFFIXES, RARITY, COL } from './data_core.js';

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
// fn(c) draws around the origin of a box w x h. Returns a sprite; blit() draws it centred at x,y.
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

// ---------------------------------------------------------------- small helpers
const _sh = {};
function shade(hex, a) {
  const k = hex + a;
  if (_sh[k]) return _sh[k];
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const to = a < 0 ? 0 : 255, p = Math.abs(a);
  r = Math.round(r + (to - r) * p); g = Math.round(g + (to - g) * p); b = Math.round(b + (to - b) * p);
  return (_sh[k] = 'rgb(' + r + ',' + g + ',' + b + ')');
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function poly(c, pts) {
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}
function fo(c, fill, lw) { if (fill) { c.fillStyle = fill; c.fill(); } c.lineWidth = lw == null ? 3 : lw; c.strokeStyle = OUT; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function circ(c, x, y, r, fill, lw) { c.beginPath(); c.arc(x, y, r, 0, TAU); fo(c, fill, lw); }
function ell(c, x, y, rx, ry, fill, lw, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); fo(c, fill, lw); }
function vgrad(c, y0, y1, a, b) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function line(c, x0, y0, x1, y1, col, lw) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.stroke(); }
function star(c, x, y, ro, ri, n, rot) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? ri : ro; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}
function spark(c, x, y, r, col) { // 4 point twinkle, no outline
  c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r);
  c.fillStyle = col; c.fill();
}
function hatch(c, cx, cy, r, step, col, lw) { // grid lines clipped by chord math, for mesh
  c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.beginPath();
  for (let d = -r + step / 2; d < r; d += step) {
    const h = Math.sqrt(Math.max(0, r * r - d * d)) * 0.92;
    c.moveTo(cx + d, cy - h); c.lineTo(cx + d, cy + h);
    c.moveTo(cx - h, cy + d); c.lineTo(cx + h, cy + d);
  }
  c.stroke();
}
function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
const easeOutBack = (x) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

// ================================================================ TURRETS
const TIER_RIM = [null, '#7d6fc0', '#46d6e8', '#5fe08a', '#b66bff', '#ff7ad0', '#ffb02e', '#ffd84d'];

function crownShape(c, x, y, w) {
  const h = w * 0.7;
  poly(c, [[x - w / 2, y + h / 2], [x - w / 2, y - h * 0.1], [x - w / 4, y + h * 0.15], [x, y - h / 2], [x + w / 4, y + h * 0.15], [x + w / 2, y - h * 0.1], [x + w / 2, y + h / 2]]);
  fo(c, '#ffd84d', 2);
  circ(c, x, y - h / 2, 1.8, '#ff4a5e', 1);
}

function turretBase(c, def, L) {
  const col = def.color;
  c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, -29, -27, 62, 62, 14); c.fill();
  rr(c, -31, -31, 62, 62, 14);
  c.fillStyle = vgrad(c, -31, 31, shade(col, -0.5), shade(col, -0.82)); c.fill();
  c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
  rr(c, -28, -28, 56, 56, 11); c.lineWidth = L >= 6 ? 4 : 2.5; c.strokeStyle = TIER_RIM[L]; c.stroke();
  // inner floor sheen and corner bolts
  rr(c, -25, -25, 50, 24, 9); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill();
  for (const [bx, by] of [[-23, -23], [23, -23], [-23, 23], [23, 23]]) { circ(c, bx, by, 2, shade(col, -0.3), 1.2); }
  // level pips
  const gold = L >= 7;
  const sp = 8, x0 = -(L - 1) * sp / 2;
  for (let i = 0; i < L; i++) {
    if (L >= 5) { star(c, x0 + i * sp, 25.5, 3.6, 1.6, 4, Math.PI / 4); fo(c, gold ? '#ffd84d' : TIER_RIM[L], 1.4); }
    else circ(c, x0 + i * sp, 25.5, 2.8, TIER_RIM[L], 1.5);
  }
  if (gold) crownShape(c, 0, -30, 20);
}

// ---- heads. Drawn facing +x around the origin. (c, L, t, col, acc, fire)
const HEADS = {
  kick(c, L, t, col, acc) {
    const len = 17 + L * 1.5, bw = 10 + L * 0.5;
    rr(c, 4, -bw / 2, len, bw, 3); fo(c, vgrad(c, -bw / 2, bw / 2, shade(col, 0.15), shade(col, -0.4)));
    rr(c, 4 + len - 5, -bw / 2 - 2, 8, bw + 4, 2); fo(c, L >= 7 ? '#ffd84d' : acc);
    if (L >= 5) { poly(c, [[10, -bw / 2], [18, -bw / 2], [14, -bw / 2 - 4]]); fo(c, '#ff4a5e', 1.2); poly(c, [[10, bw / 2], [18, bw / 2], [14, bw / 2 + 4]]); fo(c, '#ff4a5e', 1.2); }
    circ(c, -2, 0, 17, shade(col, -0.05));
    circ(c, -2, 0, 13, '#f6f0e4', 2);
    circ(c, -2, 0, 8, shade(col, 0.1), 2);
    star(c, -2, 0, 5, 2.2, 4, Math.PI / 4); fo(c, acc, 1.2);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; circ(c, -2 + Math.cos(a) * 15, Math.sin(a) * 15, 1.6, '#e8e0f5', 1); }
    if (L >= 3) { c.beginPath(); c.arc(-2, 0, 19.5, -0.9, 0.9); c.strokeStyle = acc; c.lineWidth = 2; c.stroke(); }
    if (L >= 6) { c.beginPath(); c.arc(-2, 0, 19.5, Math.PI - 0.9, Math.PI + 0.9); c.strokeStyle = '#ffd84d'; c.lineWidth = 2; c.stroke(); }
  },
  snare(c, L, t, col, acc) {
    const n = L >= 7 ? 3 : L >= 4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? 0 : (i - (n - 1) / 2) * 0.3;
      c.save(); c.rotate(a);
      rr(c, 2, -2.4, 26, 4.8, 2); fo(c, '#f7e7c0', 1.8);
      circ(c, 28, 0, 3.4, acc, 1.8);
      c.restore();
    }
    circ(c, -3, 0, 15, shade(col, -0.1));
    circ(c, -3, 0, 12, '#f8f2e6', 2);
    for (let i = -2; i <= 2; i++) line(c, -13, i * 3.6, 7, i * 3.6, 'rgba(150,130,100,.55)', 1);
    circ(c, -3, 0, 5, shade(col, 0.1), 1.6);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; circ(c, -3 + Math.cos(a) * 13.5, Math.sin(a) * 13.5, 1.3, '#d8d0e8', 0.8); }
    if (L >= 5) { star(c, -3, 0, 4.2, 1.8, 4, 0); fo(c, '#fff', 1); }
  },
  hat(c, L, t, col, acc, fire) {
    const sp = t * (7 + fire * 22);
    const tubes = [];
    for (let k = 0; k < 3; k++) tubes.push({ y: Math.sin(sp + k * 2.094) * 5.5, z: Math.cos(sp + k * 2.094) });
    tubes.sort((a, b) => a.z - b.z);
    for (const tb of tubes) {
      rr(c, 2, tb.y - 2.3, 25 + L, 4.6, 2); fo(c, shade('#9aa4c8', tb.z * 0.15), 1.8);
      rr(c, 24 + L, tb.y - 2.6, 4, 5.2, 1.5); fo(c, L >= 7 ? '#ffd84d' : L >= 5 ? acc : '#5d6688', 1.4);
    }
    circ(c, -3, 0, 15, '#d6a93a');
    circ(c, -3, 0, 12, '#f2c94c', 1.6); circ(c, -3, 0, 8, '#ffe27a', 1.4);
    circ(c, -3, 0, 3, '#8a6a1a', 1.4);
    c.beginPath(); c.arc(-3, 0, 14, 2.4, 3.9); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.6; c.stroke();
    if (L >= 4) { circ(c, -12, -9, 6, '#f2c94c', 1.6); circ(c, -12, -9, 2, '#8a6a1a', 1); }
  },
  sub(c, L, t, col, acc) {
    rr(c, -21, -21, 42, 42, 8); fo(c, vgrad(c, -21, 21, '#2a2060', '#150e38'));
    for (const [bx, by] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) circ(c, bx, by, 2, '#9aa0c8', 1);
    circ(c, 0, 0, 17, '#0e0a26');
    const pul = 1 + Math.sin(t * 5) * 0.04;
    circ(c, 0, 0, 14.5 * pul, shade(col, -0.35), 2);
    circ(c, 0, 0, 10.5 * pul, shade(col, -0.1), 1.5);
    circ(c, 0, 0, 5.2 * pul, shade(col, 0.35), 1.5);
    const ph = (t * 0.9) % 1;
    c.beginPath(); c.arc(0, 0, 14 + ph * (14 + L), 0, TAU); c.strokeStyle = 'rgba(190,170,255,' + (0.55 * (1 - ph)).toFixed(3) + ')'; c.lineWidth = 3; c.stroke();
    if (L >= 4) { const ph2 = (ph + 0.5) % 1; c.beginPath(); c.arc(0, 0, 14 + ph2 * (14 + L), 0, TAU); c.strokeStyle = 'rgba(190,170,255,' + (0.4 * (1 - ph2)).toFixed(3) + ')'; c.lineWidth = 2; c.stroke(); }
  },
  mic(c, L, t, col, acc) {
    circ(c, -17, 0, 6, '#3a2f66', 2);
    rr(c, -16, -4, 22, 8, 3.5); fo(c, vgrad(c, -4, 4, '#4a4070', '#1c1540'));
    rr(c, -8, -4.6, 6, 9.2, 1.5); fo(c, col, 1.6);
    const br = L >= 4 ? 11 : 9.5;
    circ(c, 12, 0, br, vgrad(c, -br, br, '#ffe6f4', shade(col, 0.1)));
    hatch(c, 12, 0, br - 1.5, 3, 'rgba(120,40,90,.5)', 0.9);
    circ(c, 12, 0, br, null, 2.5);
    c.beginPath(); c.arc(12, 0, br - 2, 3.6, 4.7); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.6; c.stroke();
    const waves = L >= 7 ? 3 : L >= 4 ? 2 : 1;
    for (let i = 0; i < waves; i++) { c.beginPath(); c.arc(12, 0, br + 5 + i * 4.5, -0.7, 0.7); c.strokeStyle = i % 2 ? acc : col; c.lineWidth = 2.2; c.stroke(); }
    heartPath(c, -3, 0, 2.6); c.fillStyle = '#fff'; c.fill();
  },
  synth(c, L, t, col, acc) {
    const pr = L >= 5 ? 3 : L >= 3 ? 3 : 2;
    for (let i = 0; i < pr; i++) {
      const y = pr === 2 ? (i ? 7 : -7) : (i - 1) * 8;
      rr(c, 4, y - 1.8, 24, 3.6, 1.5); fo(c, '#8fa0c8', 1.6);
      circ(c, 28.5, y, 3, '#c4f1ff', 1.4);
    }
    spark(c, 32, 0, 5 + L * 0.4, '#c4f1ff');
    rr(c, -17, -13, 24, 26, 5); fo(c, vgrad(c, -13, 13, '#2a3a6a', '#141c3c'));
    // keys along the front edge
    rr(c, 2, -12, 6, 24, 1.5); fo(c, '#f4f0e8', 1.2);
    for (let i = -2; i <= 2; i++) { rr(c, 2, i * 4.6 - 1.6, 4, 3, 1); c.fillStyle = '#1a1030'; c.fill(); }
    // knobs and screen
    rr(c, -14, -10, 12, 8, 2); fo(c, '#08142a', 1.4);
    c.beginPath(); c.moveTo(-13, -4); c.lineTo(-10, -8); c.lineTo(-8, -5); c.lineTo(-5, -9); c.lineTo(-3, -6); c.strokeStyle = col; c.lineWidth = 1.4; c.stroke();
    for (let i = 0; i < 3; i++) circ(c, -12 + i * 4.5, 5, 1.8, i === 1 ? acc : '#8fa0c8', 1);
    if (L >= 6) { rr(c, -17, -13, 24, 26, 5); c.strokeStyle = '#ffd84d'; c.lineWidth = 1.6; c.stroke(); }
  },
  horn(c, L, t, col, acc) {
    const m = 11 + L * 0.9;
    if (L >= 7) for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
      c.save(); c.rotate(a); poly(c, [[0, -3], [0, 3], [15, 7], [15, -7]]); fo(c, shade(col, -0.2), 1.8); c.restore();
    }
    poly(c, [[-6, -5], [-6, 5], [28, m], [28, -m]]); fo(c, vgrad(c, -m, m, shade(col, 0.2), shade(col, -0.4)));
    for (const x of [6, 14, 21]) { const w = 5 + (x + 6) / 34 * (m - 5); line(c, x, -w, x, w, 'rgba(255,255,255,.35)', 2); }
    ell(c, 28, 0, 4, m, shade(col, -0.65), 2.4);
    ell(c, 28, 0, 2.2, m - 3, '#2a0c14', 0);
    circ(c, -12, 0, 8, '#e8e3f2', 2.2);
    rr(c, -16, -3, 8, 6, 2); fo(c, '#9aa4c8', 1.4);
    rr(c, -10, -9.5, 4, 5, 1); fo(c, '#ff4a5e', 1.2);
    if (L >= 5) { c.beginPath(); c.arc(28, 0, m + 4, -0.9, 0.9); c.strokeStyle = acc; c.lineWidth = 2; c.stroke(); }
    if (L >= 6) { ell(c, 28, 0, 4, m, null, 2.4); c.strokeStyle = '#ffd84d'; c.lineWidth = 1.6; c.stroke(); }
  },
  scratch(c, L, t, col, acc) {
    rr(c, -21, -21, 42, 42, 7); fo(c, vgrad(c, -21, 21, '#3a3560', '#1a1638'));
    const disc = (x, y, r, a) => {
      circ(c, x, y, r, '#17122c', 2);
      c.strokeStyle = 'rgba(140,130,190,.7)'; c.lineWidth = 0.8;
      for (let k = 0.6; k < 0.92; k += 0.14) { c.beginPath(); c.arc(x, y, r * k, 0, TAU); c.stroke(); }
      circ(c, x, y, r * 0.38, col, 1.4);
      line(c, x, y, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, 'rgba(255,255,255,.7)', 1.2);
      circ(c, x, y, r * 0.09, '#fff', 0.6);
    };
    disc(-2, 1, 15, t * 6);
    if (L >= 3) disc(12, -12, 7, -t * 8);
    if (L >= 7) disc(12, 13, 6, t * 9);
    line(c, 16, -17, 6, 0, '#cfd3e8', 2.6); circ(c, 16, -17, 3, '#8a90b8', 1.4);
    rr(c, 2, -1, 8, 4, 1.4); fo(c, acc, 1.2);
  },
  loop(c, L, t, col, acc) {
    rr(c, -19, -17, 38, 36, 8); fo(c, vgrad(c, -17, 19, shade(col, -0.25), shade(col, -0.7)));
    rr(c, -14, -13, 28, 15, 4); fo(c, '#07241a', 1.6);
    const a = t * 3;
    c.beginPath(); c.arc(0, -5.5, 5, 0, TAU); c.strokeStyle = col; c.lineWidth = 2.2; c.stroke();
    circ(c, Math.cos(a) * 5, -5.5 + Math.sin(a) * 5, 1.8, '#fff', 0.8);
    c.beginPath(); c.moveTo(-12, -2); c.lineTo(-9, -2); c.moveTo(9, -2); c.lineTo(12, -2); c.strokeStyle = acc; c.lineWidth = 1.2; c.stroke();
    circ(c, -8, 10, 5.2, '#cfd6e6', 2); circ(c, 8, 10, 5.2, '#cfd6e6', 2);
    circ(c, -8, 10, 2, '#7a85a6', 1); circ(c, 8, 10, 2, '#7a85a6', 1);
    const on = (Math.floor(t * 4) % 2) === 0;
    circ(c, 0, 10, 2.4, on ? '#ff4a5e' : '#5a1620', 1.2);
    const leds = L >= 5 ? 3 : 1;
    for (let i = 0; i < leds; i++) circ(c, 13 - i * 4.5, -16.5, 1.6, (Math.floor(t * 3 + i) % 2) ? acc : '#1a4a34', 0.8);
    if (L >= 6) { rr(c, -19, -17, 38, 36, 8); c.strokeStyle = '#ffd84d'; c.lineWidth = 1.6; c.stroke(); }
  },
  cowbell(c, L, t, col, acc) {
    // barrel and scope
    rr(c, -2, -2.8, 32, 5.6, 2); fo(c, '#4a4f70', 1.8);
    rr(c, 28, -4, 6, 8, 1.5); fo(c, L >= 7 ? '#ffd84d' : '#9aa4c8', 1.6);
    if (L >= 5) { rr(c, 14, -4.4, 3, 8.8, 1); fo(c, acc, 1.2); }
    const sc = L >= 3 ? 1.25 : 1;
    rr(c, 4, -10 * sc, 13 * sc, 5.6 * sc, 2); fo(c, '#2c3050', 1.6);
    circ(c, 17 * sc - 1, -7.2 * sc, 3.2, '#35c8ff', 1.4);
    // the bell as the stock
    poly(c, [[-20, -10], [-5, -6.5], [-5, 6.5], [-20, 10]]); fo(c, vgrad(c, -10, 10, shade(col, 0.2), shade(col, -0.35)));
    line(c, -16, -5, -16, 5, 'rgba(255,255,255,.4)', 2);
    ell(c, -20, 0, 2.5, 10, shade(col, -0.5), 2);
    circ(c, -20, 0, 2.2, '#2a1a0a', 1);
    circ(c, -12, 12, 2.4, '#d6d6e8', 1.2);
    if (L >= 7) { line(c, 34, 0, 44, 0, 'rgba(255,60,80,.8)', 1.4); circ(c, 44, 0, 1.6, '#ff4a5e', 0); }
  },
  amp(c, L, t, col, acc) {
    rr(c, -19, -3, 38, 21, 3); fo(c, vgrad(c, -3, 18, '#2c1c3a', '#150c20'));
    for (const sx of [-9, 9]) { circ(c, sx, 8, 6.5, '#0d0816', 1.8); hatch(c, sx, 8, 5.4, 2.2, 'rgba(255,120,180,.35)', 0.7); circ(c, sx, 8, 1.8, col, 1); }
    rr(c, -17, -17, 34, 15, 3); fo(c, vgrad(c, -17, -2, shade(col, -0.2), shade(col, -0.62)));
    for (let i = 0; i < 5; i++) { circ(c, -11 + i * 5.5, -8, 2.2, '#f4f0e8', 1.2); line(c, -11 + i * 5.5, -8, -11 + i * 5.5, -9.6, OUT, 0.9); }
    rr(c, -16, -15.5, 8, 3, 1); c.fillStyle = 'rgba(255,255,255,.3)'; c.fill();
    const lamps = Math.min(L, 7);
    for (let i = 0; i < lamps; i++) circ(c, -12 + i * 4, -13.2, 1.3, L >= 7 ? '#ffd84d' : acc, 0.6);
    circ(c, 14, -13, 1.8, '#ff4a5e', 0.8);
    if (L >= 5) { rr(c, -19, -17, 38, 35, 4); c.strokeStyle = L >= 7 ? '#ffd84d' : acc; c.lineWidth = 1.4; c.stroke(); }
  },
  vocal(c, L, t, col, acc) {
    const orb = (x, y, r, ph) => {
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#ffd0ee'); g.addColorStop(1, shade(col, -0.2));
      circ(c, x, y, r, g, 2.4);
      c.save(); c.translate(x, y); c.rotate(ph);
      ell(c, 0, 0, r + 6, r * 0.38, null, 0);
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.8; c.stroke();
      circ(c, r + 6, 0, 1.8, '#fff', 0.8);
      c.restore();
    };
    const bob = Math.sin(t * 2.4) * 1.5;
    if (L >= 7) { orb(-3, -8 + bob, 8, t); orb(3, 9 - bob, 8, -t * 1.2); }
    else orb(0, bob, 12 + Math.min(3, L * 0.4), t);
    const a = t * 2;
    for (let i = 0; i < 3; i++) { const aa = a + i * 2.094; spark(c, Math.cos(aa) * 20, Math.sin(aa) * 20, 3, i === 0 ? '#fff' : acc); }
    if (L >= 3) { c.beginPath(); c.arc(0, 0, 23, a, a + 1.4); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.8; c.stroke(); }
  },
};
// kinds that never turn toward the target, and heads that animate (drawn live, not cached)
const HEAD_FIXED = { sub: 1, loop: 1, amp: 1, vocal: 1, scratch: 1 };
const HEAD_LIVE = { hat: 1, sub: 1, scratch: 1, loop: 1, vocal: 1 };
const HEAD_SCALE = 1.15;
const MUZZLE = { kick: 30, snare: 30, hat: 30, mic: 28, synth: 34, horn: 32, cowbell: 44 };

function heartPath(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.8, y - s * 1.3, x, y - s * 0.4);
  c.bezierCurveTo(x + s * 0.8, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  c.closePath();
}

export function drawTurret(ctx, type, level, x, y, o) {
  const def = TURRETS[type];
  if (!def) return;
  o = o || {};
  const L = clampN(Math.round(level || 1), 1, 7);
  const t = o.t || 0;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  let sc = o.scale == null ? 1 : o.scale;
  if (o.spawn != null && o.spawn < 1) sc *= Math.max(0.01, easeOutBack(clampN(o.spawn, 0, 1)));
  ctx.translate(x, y);
  if (sc !== 1) ctx.scale(sc, sc);
  if (L >= 7) { // golden aura
    const a = 0.3 + Math.sin(t * 3) * 0.1;
    const g = ctx.createRadialGradient(0, 0, 18, 0, 0, 46);
    g.addColorStop(0, 'rgba(255,216,77,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,216,77,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.fill();
  }
  const jam = !!o.jammed;
  if (jam) ctx.translate(Math.sin(t * 60) * 1.2, 0);
  blit(ctx, sprite('tb:' + type + ':' + L, 76, 80, (c) => turretBase(c, def, L)), 0, 0, 1);
  const fire = clampN(o.fire || 0, 0, 1);
  const ang = o.ang || 0;
  const fixed = !!HEAD_FIXED[type];
  const head = HEADS[type];
  ctx.save();
  if (!fixed) {
    ctx.rotate(ang);
    ctx.translate(-fire * 3.5, 0);
  } else if (fire > 0) { const k = 1 + fire * 0.06; ctx.scale(k, k); }
  ctx.scale(HEAD_SCALE, HEAD_SCALE);
  if (HEAD_LIVE[type]) head(ctx, L, t, def.color, def.accent, fire);
  else blit(ctx, sprite('th:' + type + ':' + L, 96, 96, (c) => head(c, L, 0, def.color, def.accent, 0)), 0, 0, 1);
  ctx.restore();
  if (fire > 0.55 && !fixed && MUZZLE[type]) { // muzzle flash
    const mx = Math.cos(ang) * MUZZLE[type] * HEAD_SCALE, my = Math.sin(ang) * MUZZLE[type] * HEAD_SCALE;
    ctx.globalAlpha *= (fire - 0.4) * 1.4;
    ctx.fillStyle = '#fff7d0'; ctx.beginPath(); ctx.arc(mx, my, 5 + fire * 4, 0, TAU); ctx.fill();
    ctx.fillStyle = def.accent; ctx.beginPath(); ctx.arc(mx, my, 3 + fire * 2, 0, TAU); ctx.fill();
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
  }
  if (jam) { // jammed: dark veil, lightning, sparks
    rr(ctx, -31, -31, 62, 62, 14); ctx.fillStyle = 'rgba(8,4,24,.55)'; ctx.fill();
    drawGlyphRaw(ctx, 'bolt', 0, 0, 30, '#ffe14d');
    const k = Math.floor(t * 12);
    for (let i = 0; i < 3; i++) spark(ctx, ((k * 37 + i * 53) % 50) - 25, ((k * 29 + i * 71) % 50) - 25, 3.5, '#fff7a0');
  }
  if (o.buff) {
    const col = o.buff === 'dmg' ? '#ff6b7e' : '#6dffa8';
    const bob = Math.sin(t * 5) * 1.5;
    ctx.save(); ctx.translate(20, -24 + bob);
    circ(ctx, 0, 0, 7.5, '#1c1240', 1.6);
    if (o.buff === 'dmg') { poly(ctx, [[0, -4.5], [4.5, 1], [1.6, 1], [1.6, 4.5], [-1.6, 4.5], [-1.6, 1], [-4.5, 1]]); ctx.fillStyle = col; ctx.fill(); }
    else { poly(ctx, [[-4, -4], [0, 0], [-4, 4], [-2, 4], [2, 0], [-2, -4]]); ctx.fillStyle = col; ctx.fill(); poly(ctx, [[0, -4], [4, 0], [0, 4], [2, 4], [6, 0], [2, -4]]); ctx.fillStyle = col; ctx.fill(); }
    ctx.restore();
  }
  if (o.selected) {
    const p = 0.6 + Math.sin(t * 7) * 0.4;
    rr(ctx, -34, -34, 68, 68, 16); ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + p * 0.5).toFixed(2) + ')'; ctx.lineWidth = 3; ctx.stroke();
    rr(ctx, -37, -37, 74, 74, 18); ctx.strokeStyle = 'rgba(255,255,255,' + (0.12 * p).toFixed(2) + ')'; ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.restore();
}

export function drawTurretIconFlat(ctx, type, x, y, size) {
  const def = TURRETS[type];
  if (!def) return;
  const MAP = { kick: 'bomb', snare: 'notes', hat: 'gear', sub: 'speaker', mic: 'mic', synth: 'bolt', horn: 'horn', scratch: 'disc', loop: 'tape', cowbell: 'bell', amp: 'plug', vocal: 'sparkle' };
  ctx.save();
  ctx.translate(x, y); const s = size / 40; ctx.scale(s, s);
  rr(ctx, -19, -19, 38, 38, 9); fo(ctx, vgrad(ctx, -19, 19, shade(def.color, 0.15), shade(def.color, -0.5)), 3);
  drawGlyphRaw(ctx, MAP[type] || 'note', 0, 0, 24, '#fff6ea');
  ctx.restore();
}

// ================================================================ ENEMIES
const EYES = {
  fuzz: { dx: 0.36, y: -0.15, er: 0.3 }, zip: { dx: 0.32, y: -0.1, er: 0.3 }, brick: { dx: 0.36, y: -0.1, er: 0.2, brow: 1 },
  echo: { dx: 0.36, y: -0.12, er: 0.3 }, mini: { dx: 0.34, y: -0.1, er: 0.3 }, leech: { dx: 0.36, y: -0.1, er: 0.28 },
  drone: { dx: 0.32, y: -0.12, er: 0.27 }, gate: { dx: 0.36, y: -0.25, er: 0.26 }, squeal: { dx: 0.4, y: -0.35, er: 0.26, brow: 1 },
  mute: { dx: 0.34, y: -0.2, er: 0.27 }, rager: { dx: 0.34, y: -0.2, er: 0.25, brow: 1 },
};

function fur(c, r, n, amp, seed) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = i * Math.PI / n;
    const rad = i % 2 ? r + amp * (0.7 + 0.3 * Math.sin(i * 12.9898 + seed)) : r * 0.92;
    const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
}

const BODY = {
  fuzz(c, r, col) {
    fur(c, r, 13, r * 0.28, 1); fo(c, col, 2.6);
    ell(c, 0, r * 0.3, r * 0.6, r * 0.45, shade(col, 0.2), 0);
    c.beginPath(); c.moveTo(-r * 0.3, r * 0.42); c.quadraticCurveTo(0, r * 0.62, r * 0.3, r * 0.42); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    poly(c, [[-r * 0.12, r * 0.47], [-r * 0.04, r * 0.62], [r * 0.04, r * 0.47]]); c.fillStyle = '#fff'; c.fill();
  },
  zip(c, r, col) {
    for (let i = -1; i <= 1; i++) line(c, -r * 1.7, i * r * 0.45, -r * 0.95, i * r * 0.4, 'rgba(109,255,216,.6)', 2.4);
    poly(c, [[r * 1.15, 0], [r * 0.2, -r * 0.95], [-r * 0.85, -r * 0.55], [-r * 0.85, r * 0.55], [r * 0.2, r * 0.95]]); fo(c, col, 2.6);
    poly(c, [[r * 0.15, -r * 0.55], [-r * 0.35, 0.1 * r], [0, 0.1 * r], [-r * 0.2, r * 0.6], [r * 0.4, -r * 0.1], [0, -r * 0.1]]); c.fillStyle = '#fff'; c.globalAlpha *= 0.55; c.fill(); c.globalAlpha /= 0.55;
  },
  brick(c, r, col) {
    rr(c, -r, -r * 0.85, r * 2, r * 1.75, r * 0.25); fo(c, vgrad(c, -r, r, shade(col, 0.18), shade(col, -0.25)), 2.8);
    c.strokeStyle = 'rgba(30,20,60,.45)'; c.lineWidth = 1.6; c.beginPath();
    for (let k = 0; k < 3; k++) { const y = -r * 0.85 + (k + 1) * r * 0.44; c.moveTo(-r, y); c.lineTo(r, y); }
    for (let k = 0; k < 3; k++) { const y0 = -r * 0.85 + k * r * 0.44, off = (k % 2) * r * 0.5; for (let x = -r * 0.5 + off; x < r; x += r) { c.moveTo(x, y0); c.lineTo(x, y0 + r * 0.44); } }
    c.stroke();
    for (const [bx, by] of [[-0.8, -0.65], [0.8, -0.65], [-0.8, 0.65], [0.8, 0.65]]) circ(c, bx * r, by * r, 1.8, '#d6d6e8', 1);
    rr(c, -r * 0.45, r * 0.38, r * 0.9, r * 0.2, 2); fo(c, '#1c1030', 1.4);
  },
  echo(c, r, col) {
    c.globalAlpha *= 0.45; circ(c, -r * 0.28, r * 0.05, r * 0.95, shade(col, 0.3), 2); c.globalAlpha /= 0.45;
    fur(c, r, 10, r * 0.18, 5); fo(c, col, 2.6);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.6;
    for (const k of [0.5, 0.72]) { c.beginPath(); c.arc(0, r * 0.15, r * k, 0.3, 2.8); c.stroke(); }
    c.beginPath(); c.arc(0, r * 0.38, r * 0.2, 0, Math.PI); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
  },
  mini(c, r, col) { fur(c, r, 8, r * 0.2, 9); fo(c, col, 2.2); },
  leech(c, r, col) {
    fur(c, r, 11, r * 0.16, 3); fo(c, col, 2.6);
    rr(c, -r * 0.1, -r * 0.88, r * 0.2, r * 0.5, 1); c.fillStyle = '#fff'; c.fill();
    rr(c, -r * 0.25, -r * 0.73, r * 0.5, r * 0.2, 1); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.arc(0, r * 0.28, r * 0.28, 0.2, Math.PI - 0.2); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
  },
  drone(c, r, col) {
    for (const s of [-1, 1]) { line(c, s * r * 0.5, -r * 0.1, s * r * 1.15, -r * 0.7, '#6a5a8a', 3); circ(c, s * r * 1.15, -r * 0.7, 2.4, '#b8a8d8', 1.2); }
    circ(c, 0, 0, r, vgrad(c, -r, r, shade(col, 0.25), shade(col, -0.3)), 2.6);
    c.beginPath(); c.arc(0, -r * 0.2, r * 0.7, Math.PI * 1.1, Math.PI * 1.9); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.stroke();
    rr(c, -r * 0.5, r * 0.4, r, r * 0.22, 3); fo(c, '#3a2450', 1.4);
  },
  gate(c, r, col) {
    fur(c, r, 11, r * 0.14, 7); fo(c, col, 2.6);
    rr(c, -r * 0.85, -r * 0.05, r * 1.7, r * 0.8, 4); fo(c, 'rgba(60,40,10,.85)', 2);
    c.strokeStyle = '#ffd26b'; c.lineWidth = 2.4; c.beginPath();
    for (let i = -3; i <= 3; i++) { c.moveTo(i * r * 0.24, -r * 0.05); c.lineTo(i * r * 0.24, r * 0.75); }
    c.stroke();
  },
  squeal(c, r, col) {
    c.strokeStyle = shade(col, 0.2); c.lineWidth = 2.4;
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10; line(c, Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0, Math.cos(a) * r * 1.38, Math.sin(a) * r * 1.38, shade(col, 0.1), 2.6); }
    circ(c, 0, 0, r, vgrad(c, -r, r, shade(col, 0.2), shade(col, -0.3)), 2.6);
    ell(c, 0, r * 0.38, r * 0.5, r * 0.4, '#2a0c14', 2);
    for (const k of [0.15, 0.3]) { c.beginPath(); c.ellipse(0, r * 0.38, r * 0.5 * k / 0.3 * 0.9, r * 0.4 * k / 0.3 * 0.9, 0, 0, TAU); c.strokeStyle = 'rgba(255,160,170,.5)'; c.lineWidth = 1; c.stroke(); }
  },
  mute(c, r, col) {
    c.beginPath(); c.moveTo(-r, r * 0.9);
    c.lineTo(-r, -r * 0.1); c.arc(0, -r * 0.1, r, Math.PI, 0);
    c.lineTo(r, r * 0.9);
    for (let i = 0; i < 4; i++) c.quadraticCurveTo(r - (i * 2 + 0.5) * r / 4, r * 1.3, r - (i + 1) * r / 2, r * 0.9);
    c.closePath(); fo(c, vgrad(c, -r, r, shade(col, 0.35), shade(col, -0.1)), 2.6);
    line(c, -r * 0.2, r * 0.25, r * 0.2, r * 0.6, OUT, 2.4); line(c, r * 0.2, r * 0.25, -r * 0.2, r * 0.6, OUT, 2.4);
    c.beginPath(); c.arc(-r * 0.5, r * 0.15, r * 0.14, 0, TAU); c.fillStyle = 'rgba(255,150,180,.5)'; c.fill();
  },
  rager(c, r, col) {
    for (const s of [-1, 1]) {
      line(c, s * r * 0.45, -r * 0.75, s * r * 0.9, -r * 1.3, OUT, 3.4); circ(c, s * r * 0.9, -r * 1.3, 2.2, '#ffd23c', 1.2);
      for (let k = 0; k < 2; k++) line(c, s * r * 0.7, r * (0.2 + k * 0.4), s * r * 1.2, r * (0.45 + k * 0.45), OUT, 2.6);
    }
    ell(c, 0, 0, r, r * 0.9, vgrad(c, -r, r, shade(col, 0.2), shade(col, -0.3)), 2.6);
    poly(c, [[-r * 0.5, -r * 0.8], [-r * 0.3, -r * 1.25], [-r * 0.1, -r * 0.8]]); fo(c, '#ffe0b0', 1.6);
    poly(c, [[r * 0.5, -r * 0.8], [r * 0.3, -r * 1.25], [r * 0.1, -r * 0.8]]); fo(c, '#ffe0b0', 1.6);
    c.beginPath(); c.moveTo(-r * 0.4, r * 0.5); for (let i = 0; i < 5; i++) c.lineTo(-r * 0.4 + (i + 1) * r * 0.16, r * (i % 2 ? 0.5 : 0.35)); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
  },
};
const ROT_BODY = { zip: 1 };

function googly(c, x, y, er, ax, ay, stun) {
  circ(c, x, y, er, '#fff', 1.8);
  if (stun) { const d = er * 0.55; line(c, x - d, y - d, x + d, y + d, OUT, 1.8); line(c, x + d, y - d, x - d, y + d, OUT, 1.8); return; }
  circ(c, x + ax * er * 0.45, y + ay * er * 0.45, er * 0.5, OUT, 0);
  circ(c, x + ax * er * 0.45 - er * 0.15, y + ay * er * 0.45 - er * 0.18, er * 0.16, '#fff', 0);
}

function flame(c, x, y, s) {
  c.beginPath(); c.moveTo(x, y - s * 1.3);
  c.bezierCurveTo(x + s * 0.9, y - s * 0.5, x + s * 0.9, y + s * 0.6, x, y + s * 0.6);
  c.bezierCurveTo(x - s * 0.9, y + s * 0.6, x - s * 0.8, y - s * 0.2, x, y - s * 1.3);
  c.fillStyle = '#ff9a3c'; c.fill();
  c.beginPath(); c.arc(x, y + s * 0.15, s * 0.35, 0, TAU); c.fillStyle = '#ffe14d'; c.fill();
}

function hpBar(c, w, y, frac, h) {
  h = h || 4;
  rr(c, -w / 2 - 1, y - 1, w + 2, h + 2, 2.5); c.fillStyle = 'rgba(10,5,30,.85)'; c.fill();
  const f = clampN(frac, 0, 1);
  if (f > 0) { rr(c, -w / 2, y, w * f, h, 2); c.fillStyle = f > 0.5 ? '#6dff8a' : f > 0.25 ? '#ffd23c' : '#ff4a5e'; c.fill(); }
}

export function drawEnemy(ctx, type, x, y, o) {
  const def = ENEMIES[type];
  if (!def) return;
  o = o || {};
  const t = o.t || 0;
  const r = def.r, sc = o.scale == null ? 1 : o.scale;
  const hs = hashStr(type + (o.id || '')) % 628 / 100;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  ctx.translate(x, y);
  const ang = o.ang || 0;
  // shadow (flyers float higher)
  const fl = !!def.flying;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, (fl ? r * 1.5 + 6 : r * 0.85) * sc, r * 0.85 * sc, r * 0.3 * sc, 0, 0, TAU); ctx.fill();
  const aff = o.affix ? AFFIXES[o.affix] : null;
  const wob = o.stun ? 0 : Math.sin(t * 8 + hs);
  const bob = fl ? Math.sin(t * 4 + hs) * 3 - 5 : -Math.abs(Math.sin(t * 6 + hs)) * 2;
  ctx.translate(0, bob * sc);
  ctx.scale(sc * (1 + wob * 0.05), sc * (1 - wob * 0.05));
  // status colouring behind
  if (o.rage) { ctx.fillStyle = 'rgba(255,60,40,.28)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, TAU); ctx.fill(); }
  if (aff && aff.id === 'swift') for (let i = -1; i <= 1; i++) line(ctx, -Math.cos(ang) * r * 1.3 - Math.sin(ang) * i * r * 0.5, -Math.sin(ang) * r * 1.3 + Math.cos(ang) * i * r * 0.5, -Math.cos(ang) * r * 2.1 - Math.sin(ang) * i * r * 0.5, -Math.sin(ang) * r * 2.1 + Math.cos(ang) * i * r * 0.5, 'rgba(109,255,216,.7)', 2.2);
  if (aff && aff.id === 'golden') { const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.9); g.addColorStop(0, 'rgba(255,212,77,.55)'); g.addColorStop(1, 'rgba(255,212,77,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, TAU); ctx.fill(); }
  // glitch offset ghosts now and then (always a little while hit)
  const gl = (o.hit || 0) > 0.2 || ((t * 1.3 + hs) % 4) < 0.16;
  if (gl) {
    const j = ((t * 40) % 3) - 1.5;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(47,230,255,.7)'; ctx.beginPath(); ctx.arc(j + 2, 0, r * 1.02, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,60,200,.7)'; ctx.beginPath(); ctx.arc(-j - 2, 1, r * 1.02, 0, TAU); ctx.stroke();
  }
  // body sprite
  const bs = sprite('eb:' + type, r * 3.4 + 10, r * 3.4 + 10, (c) => BODY[type](c, r, def.color));
  if (ROT_BODY[type]) { ctx.save(); ctx.rotate(ang); blit(ctx, bs, 0, 0, 1); ctx.restore(); } else blit(ctx, bs, 0, 0, 1);
  // drone rotors
  if (type === 'drone') for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * r * 1.15, -r * 0.7); ctx.scale(1, 0.35); ctx.rotate(t * 30 * s); ctx.fillStyle = 'rgba(220,200,255,.65)'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 0.14, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  if (type === 'leech') { ctx.fillStyle = 'rgba(143,255,160,' + (0.1 + 0.08 * Math.sin(t * 3)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(0, 0, r * (1.6 + 0.25 * Math.sin(t * 3)), 0, TAU); ctx.fill(); }
  // eyes
  const es = EYES[type];
  if (es) {
    const ax = Math.cos(ang), ay = Math.sin(ang) * 0.6 + 0.35;
    const jx = Math.sin(t * 9 + hs) * 0.2;
    googly(ctx, -es.dx * r, es.y * r, es.er * r, ax + jx, ay, o.stun);
    googly(ctx, es.dx * r, es.y * r, es.er * r, ax - jx, ay, o.stun);
    if (es.brow || o.rage) { const b = es.er * r; line(ctx, -es.dx * r - b, es.y * r - b * 1.3, -es.dx * r + b * 0.8, es.y * r - b * 0.7, OUT, 2.6); line(ctx, es.dx * r + b, es.y * r - b * 1.3, es.dx * r - b * 0.8, es.y * r - b * 0.7, OUT, 2.6); }
  }
  // affix rings
  if (aff) {
    ctx.lineWidth = aff.id === 'armored' ? 4 : 2.6; ctx.strokeStyle = aff.color;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.18, 0, TAU); ctx.stroke();
    if (aff.id === 'armored') for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.3; circ(ctx, Math.cos(a) * r * 1.18, Math.sin(a) * r * 1.18, 2.4, '#d6d6e8', 1); }
    if (aff.id === 'regen') { const k = (t * 1.5) % 1; ctx.save(); ctx.globalAlpha *= 1 - k; drawGlyphRaw(ctx, 'plus', 0, -r * 1.2 - k * 8, 9, '#8fffa0'); ctx.restore(); }
    if (aff.id === 'golden') { const a = t * 3; spark(ctx, Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, 4, '#fff6b0'); }
  }
  // status overlays
  if (o.slow) {
    ctx.fillStyle = 'rgba(150,230,255,.28)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#bff0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0.3, 2.8); ctx.stroke();
    for (let i = 0; i < 3; i++) poly(ctx, [[-r * 0.5 + i * r * 0.5 - 2, r * 0.9], [-r * 0.5 + i * r * 0.5 + 2, r * 0.9], [-r * 0.5 + i * r * 0.5, r * 1.3]]), ctx.fillStyle = '#d6f6ff', ctx.fill();
  }
  if (o.burn) { flame(ctx, -r * 0.4, -r * 1.05 + Math.sin(t * 14) * 1.5, 5); flame(ctx, r * 0.4, -r * 0.95 + Math.sin(t * 13 + 2) * 1.5, 4); }
  if (o.mark) {
    ctx.save(); ctx.rotate(t * 1.5); ctx.strokeStyle = '#ff3c5a'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; line(ctx, Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25, Math.cos(a) * r * 1.8, Math.sin(a) * r * 1.8, '#ff3c5a', 2.2); }
    ctx.restore();
  }
  if (o.shield > 0) {
    const s = clampN(o.shield, 0, 1);
    ctx.fillStyle = 'rgba(255,230,140,' + (0.1 + 0.12 * s).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(0, 0, r * 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,120,' + (0.4 + 0.5 * s).toFixed(3) + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.4, -Math.PI / 2, -Math.PI / 2 + TAU * s); ctx.stroke();
  }
  if (o.stun) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.094; spark(ctx, Math.cos(a) * r * 0.8, -r * 1.25 + Math.sin(a) * 3, 4, '#ffe14d'); }
  if ((o.hit || 0) > 0) { ctx.fillStyle = 'rgba(255,255,255,' + clampN(o.hit * 0.75, 0, 0.75).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(0, 0, r * 1.0, 0, TAU); ctx.fill(); }
  // hp bar, only when hurt
  if (o.hp != null && o.hp < 0.999) hpBar(ctx, r * 2 + 4, -r * 1.35 - 6, o.hp, 4);
  ctx.restore();
}

// ================================================================ BOSSES
function bossEyes(c, dx, y, er, ang, t, angry) {
  const ax = Math.cos(ang), ay = Math.sin(ang) * 0.5 + 0.3;
  googly(c, -dx, y, er, ax, ay); googly(c, dx, y, er, ax, ay);
  if (angry) { line(c, -dx - er, y - er * 1.4, -dx + er * 0.9, y - er * 0.7, OUT, 3.4); line(c, dx + er, y - er * 1.4, dx - er * 0.9, y - er * 0.7, OUT, 3.4); }
}

const BOSS_DRAW = {
  compressor(c, r, t, o) {
    const sq = (Math.sin(t * 2.2) * 0.5 + 0.5) * r * 0.22;
    for (const s of [-1, 1]) { rr(c, s * r * 1.02 - 5, -r * 0.8, 10, r * 1.6, 3); fo(c, '#6a7498', 2.4); }
    rr(c, -r * 1.05, r * 0.42 - sq * 0.4, r * 2.1, r * 0.42, 6); fo(c, vgrad(c, r * 0.4, r * 0.9, '#aab4d4', '#5c6688'), 3);
    rr(c, -r * 1.05, -r * 0.9 + sq, r * 2.1, r * 0.42, 6); fo(c, vgrad(c, -r * 0.9, -r * 0.45, '#aab4d4', '#5c6688'), 3);
    rr(c, -r * 0.88, -r * 0.5 + sq * 0.5, r * 1.76, r * 0.98 - sq * 0.8, 10); fo(c, vgrad(c, -r * 0.5, r * 0.5, '#8d98bd', '#4e5879'), 3);
    for (let i = -3; i <= 3; i++) line(c, i * r * 0.26, r * 0.42, i * r * 0.26, r * 0.82, 'rgba(20,10,46,.4)', 2);
    circ(c, 0, -r * 0.7 + sq, r * 0.2, '#f0f0f8', 2); // gauge
    line(c, 0, -r * 0.7 + sq, Math.cos(t * 2 - 1.5) * r * 0.15, -r * 0.7 + sq + Math.sin(t * 2 - 1.5) * r * 0.15, '#ff4a5e', 2);
    bossEyes(c, r * 0.32, -r * 0.1 + sq * 0.2, r * 0.2, o.ang, t, true);
    c.beginPath(); c.moveTo(-r * 0.3, r * 0.22); c.lineTo(r * 0.3, r * 0.22); c.strokeStyle = OUT; c.lineWidth = 3.4; c.stroke();
  },
  noisegate(c, r, t, o) {
    rr(c, -r, -r * 0.9, r * 2, r * 1.8, r * 0.3); fo(c, vgrad(c, -r, r, '#ffe27a', '#c9962a'), 3);
    for (const [bx, by] of [[-0.82, -0.7], [0.82, -0.7], [-0.82, 0.7], [0.82, 0.7]]) circ(c, bx * r, by * r, 3, '#fff3c0', 1.4);
    // vu lights
    for (let i = 0; i < 5; i++) circ(c, -r * 0.5 + i * r * 0.25, -r * 0.75, 2.4, (Math.floor(t * 6) + i) % 5 < 3 ? '#6dff8a' : '#2a5a3a', 1);
    bossEyes(c, r * 0.34, -r * 0.2, r * 0.2, o.ang, t, false);
    // the shutter: rolled up top normally, slammed shut when gated
    const close = o.gated ? 1 : 0.18;
    const top = -r * 0.5, h = r * 1.35 * close;
    rr(c, -r * 0.88, top, r * 1.76, h, 3); fo(c, 'rgba(210,170,60,.96)', 2.6);
    c.strokeStyle = 'rgba(80,50,10,.65)'; c.lineWidth = 2; c.beginPath();
    for (let y = top + 7; y < top + h - 2; y += 7) { c.moveTo(-r * 0.88, y); c.lineTo(r * 0.88, y); }
    c.stroke();
    if (o.gated) {
      c.strokeStyle = 'rgba(255,245,170,' + (0.6 + 0.3 * Math.sin(t * 10)).toFixed(2) + ')'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, r * 1.3, 0, TAU); c.stroke();
      spark(c, Math.cos(t * 4) * r * 1.2, Math.sin(t * 4) * r * 1.2, 5, '#fff');
      circ(c, 0, top + h * 0.5, 5, '#8a6a1a', 1.6);
    } else {
      c.beginPath(); c.arc(0, r * 0.3, r * 0.22, 0.2, Math.PI - 0.2); c.strokeStyle = OUT; c.lineWidth = 3; c.stroke();
    }
  },
  reverb(c, r, t, o) {
    for (let i = 0; i < 3; i++) { const k = ((t * 0.5 + i / 3) % 1); c.beginPath(); c.arc(0, 0, r * (1.0 + k * 0.7), 0, TAU); c.strokeStyle = 'rgba(190,160,255,' + (0.5 * (1 - k)).toFixed(3) + ')'; c.lineWidth = 3; c.stroke(); }
    const off = Math.sin(t * 2) * r * 0.16 + r * 0.2;
    for (const s of [-1, 1]) { c.globalAlpha *= 0.3; fur(c, r * 0.95, 14, r * 0.15, 4); c.save(); c.translate(s * off, 0); fur(c, r * 0.95, 14, r * 0.15, 4); fo(c, '#c7b0ff', 2); c.restore(); c.globalAlpha /= 0.3; }
    fur(c, r, 16, r * 0.22, 2); fo(c, vgrad(c, -r, r, '#b394ff', '#6b46c8'), 3.4);
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2.4;
    for (const k of [0.45, 0.65, 0.85]) { c.beginPath(); c.arc(0, r * 0.1, r * k, 0.4, 2.7); c.stroke(); }
    bossEyes(c, r * 0.34, -r * 0.2, r * 0.22, o.ang, t, false);
    ell(c, 0, r * 0.42, r * 0.28, r * 0.2 + Math.abs(Math.sin(t * 3)) * 4, '#2a0c3a', 2.6);
  },
  djglitch(c, r, t, o) {
    const g = ((t * 1.1) % 3) < 0.35;
    if (g) { c.save(); c.translate(-4, 0); c.globalAlpha *= 0.5; rr(c, -r * 0.8, -r * 0.8, r * 1.6, r * 1.6, 10); c.fillStyle = '#ff3cc8'; c.fill(); c.restore(); c.save(); c.translate(4, 0); c.globalAlpha *= 0.5; rr(c, -r * 0.8, -r * 0.8, r * 1.6, r * 1.6, 10); c.fillStyle = '#35c8ff'; c.fill(); c.restore(); }
    // headphones
    c.beginPath(); c.arc(0, -r * 0.1, r * 0.95, Math.PI * 1.05, Math.PI * 1.95); c.strokeStyle = OUT; c.lineWidth = 8; c.stroke();
    c.beginPath(); c.arc(0, -r * 0.1, r * 0.95, Math.PI * 1.05, Math.PI * 1.95); c.strokeStyle = '#ff3cc8'; c.lineWidth = 4.4; c.stroke();
    rr(c, -r * 0.82, -r * 0.8, r * 1.64, r * 1.6, 12); fo(c, vgrad(c, -r, r, '#6dffe4', '#1f9c88'), 3.2);
    for (const s of [-1, 1]) { rr(c, s * r * 0.9 - 6, -r * 0.4, 12, r * 0.7, 5); fo(c, '#ff3cc8', 2.4); }
    // visor
    rr(c, -r * 0.62, -r * 0.45, r * 1.24, r * 0.5, 7); fo(c, '#0a1a2a', 2.4);
    bossEyes(c, r * 0.28, -r * 0.2, r * 0.17, o.ang, t, false);
    // turntable chest
    const a = t * 5;
    circ(c, -r * 0.3, r * 0.42, r * 0.28, '#14102a', 2); circ(c, r * 0.3, r * 0.42, r * 0.28, '#14102a', 2);
    for (const s of [-1, 1]) { const px = s * r * 0.3; circ(c, px, r * 0.42, r * 0.1, '#ff3cc8', 1); line(c, px, r * 0.42, px + Math.cos(a * s) * r * 0.25, r * 0.42 + Math.sin(a * s) * r * 0.25, '#fff', 1.6); }
    // glitch bars
    if (g) for (let i = 0; i < 3; i++) { c.fillStyle = i % 2 ? 'rgba(53,200,255,.6)' : 'rgba(255,60,200,.6)'; c.fillRect(-r + ((t * 91 + i * 37) % (r * 1.2)), -r * 0.6 + i * r * 0.5, r * 0.9, 3); }
  },
  playback(c, r, t, o) {
    const ph = clampN(o.phase || 1, 1, 3);
    const base = ph === 1 ? '#ff6cb8' : ph === 2 ? '#ff4f8a' : '#ff3c3c';
    const ar = 1.3 + ph * 0.2;
    const gr = c.createRadialGradient(0, 0, r * 0.8, 0, 0, r * ar);
    gr.addColorStop(0, ph === 3 ? 'rgba(255,60,60,.5)' : 'rgba(255,100,180,.4)'); gr.addColorStop(1, 'rgba(255,80,160,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(0, 0, r * ar, 0, TAU); c.fill();
    // cable crown
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.34; const w = Math.sin(t * 3 + i) * 3; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); c.quadraticCurveTo(Math.cos(a) * r * 1.3 + w, Math.sin(a) * r * 1.3, Math.cos(a) * r * 1.5 + w * 2, Math.sin(a) * r * 1.55); c.strokeStyle = OUT; c.lineWidth = 6; c.stroke(); c.strokeStyle = i % 2 ? '#35c8ff' : '#ffd23c'; c.lineWidth = 3; c.stroke(); }
    rr(c, -r * 0.95, -r * 0.85, r * 1.9, r * 1.7, r * 0.35); fo(c, vgrad(c, -r, r, shade(base, 0.25), shade(base, -0.35)), 3.6);
    rr(c, -r * 0.74, -r * 0.62, r * 1.48, r * 1.12, r * 0.2); fo(c, '#0c0820', 3);
    // face on the screen
    bossEyes(c, r * 0.3, -r * 0.3, r * 0.17, o.ang, t, ph >= 2);
    // the play button grin
    const bx = 0, by = r * 0.18, bs = r * 0.3;
    if (ph === 3 && ((t * 2) % 1) < 0.5) { rr(c, -bs * 0.9, by - bs, bs * 0.6, bs * 2, 2); c.fillStyle = '#fff'; c.fill(); rr(c, bs * 0.3, by - bs, bs * 0.6, bs * 2, 2); c.fillStyle = '#fff'; c.fill(); }
    else { poly(c, [[bx - bs * 0.7, by - bs], [bx - bs * 0.7, by + bs], [bx + bs * 1.0, by]]); fo(c, '#fff', 2); }
    // power button and speaker slits
    circ(c, 0, r * 0.67, 4.4, ph === 1 ? '#6dff8a' : '#ff4a5e', 1.6);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) line(c, s * r * 0.72, r * 0.62 + i * 4 - 4, s * r * 0.5, r * 0.62 + i * 4 - 4, OUT, 1.6);
    if (ph >= 2) { line(c, r * 0.5, -r * 0.6, r * 0.62, -r * 0.42, '#fff', 1.6); line(c, r * 0.62, -r * 0.42, r * 0.52, -r * 0.3, '#fff', 1.6); }
    if (ph === 3) for (let i = 0; i < 4; i++) { const a = t * 3 + i * 1.57; spark(c, Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.0, 5, '#ffd23c'); }
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
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, r * 0.95 * sc, r * 1.0 * sc, r * 0.3 * sc, 0, 0, TAU); ctx.fill();
  ctx.translate(0, Math.sin(t * 2.5) * 2 * sc);
  ctx.scale(sc, sc);
  fn(ctx, r, t, o);
  if ((o.hit || 0) > 0) { rr(ctx, -r * 0.9, -r * 0.85, r * 1.8, r * 1.7, r * 0.3); ctx.fillStyle = 'rgba(255,255,255,' + clampN(o.hit * 0.6, 0, 0.6).toFixed(3) + ')'; ctx.fill(); }
  if (o.hp != null) {
    const w = r * 2.1;
    hpBar(ctx, w, -r * 1.25 - 12, o.hp, 7);
    const ph = o.phase || 0;
    for (let i = 0; i < ph; i++) circ(ctx, -w / 2 + 6 + i * 11, -r * 1.25 - 21, 3.6, '#ffd23c', 1.4);
  }
  ctx.restore();
}

// ================================================================ PROJECTILES
export function drawProjectile(ctx, kind, x, y, o) {
  o = o || {};
  const t = o.t || 0, ang = o.ang || 0, s = o.scale == null ? 1 : o.scale;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  switch (kind) {
    case 'kick': {
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,150,60,.35)'; ctx.beginPath(); ctx.ellipse(-8, 0, 12, 5, 0, 0, TAU); ctx.fill();
      circ(ctx, 0, 0, 7, vgrad(ctx, -7, 7, '#ffd9a0', '#ff7a3c'), 2.2);
      star(ctx, 0, 0, 3.4, 1.4, 4, t * 6); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
    case 'snare': {
      ctx.rotate(ang);
      line(ctx, -12, 0, -2, 0, 'rgba(255,230,120,.55)', 4);
      circ(ctx, 0, 0, 3.8, '#fff3b0', 1.8);
      break;
    }
    case 'hat': {
      ctx.rotate(ang);
      line(ctx, -7, 0, 0, 0, 'rgba(125,255,208,.7)', 2.4);
      circ(ctx, 1, 0, 2.2, '#d8fff0', 1.2);
      break;
    }
    case 'scratch': {
      ctx.rotate(t * 14);
      circ(ctx, 0, 0, 9, '#17122c', 2); circ(ctx, 0, 0, 5.4, null, 0); ctx.strokeStyle = 'rgba(160,150,210,.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, 0, 6.6, 0, TAU); ctx.stroke();
      circ(ctx, 0, 0, 3.2, '#e5e5ff', 1.2); line(ctx, 0, 0, 7, 0, '#fff', 1.4);
      break;
    }
    case 'cowbell': {
      ctx.rotate(ang);
      line(ctx, -22, 0, -4, 0, 'rgba(255,200,80,.5)', 3);
      poly(ctx, [[10, 0], [-4, -4.5], [-8, 0], [-4, 4.5]]); fo(ctx, '#ffe9a0', 1.8);
      break;
    }
    case 'orb': case 'vocal': {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 12);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,200,240,.95)'); g.addColorStop(1, 'rgba(255,150,220,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.094; spark(ctx, Math.cos(a) * 9, Math.sin(a) * 9, 2.6, '#fff'); }
      break;
    }
    case 'synth': {
      ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(-8, 0);
      for (let i = 1; i <= 5; i++) ctx.lineTo(-8 + i * 3.4, (i % 2 ? -1 : 1) * 3.4);
      ctx.strokeStyle = '#c4f1ff'; ctx.lineWidth = 2.4; ctx.stroke();
      break;
    }
    default: { circ(ctx, 0, 0, 4, '#fff6ea', 1.6); }
  }
  ctx.restore();
}

// ================================================================ GLYPHS / ICONS
const GLYPH_COL = {
  coin: '#ffd44d', diamond: '#5fe8ff', record: '#ff8ad8', fans: '#ff6b6b', heart: '#ff4a5e', star: '#ffd23c', bolt: '#ffe14d', fire: '#ff9a3c',
  snow: '#bff0ff', check: '#6dff8a', cross: '#ff4a5e', lock: '#c9c4d6', gear: '#c9c4d6', clover: '#6dff8a', drop: '#5fc8ff', gift: '#ff5fb0',
  sparkle: '#fff2a0', play: '#6dff8a', pause: '#fff6ea', skull: '#f0ecf8', crown: '#ffd84d', bell: '#ffc83d', flower: '#ff8ad8', cat: '#ffb07a',
};
const GLYPHS = {
  note(c, col) { ell(c, -4, 9, 6.5, 4.8, col, 2.2, -0.4); rr(c, 1, -13, 3.2, 22, 1); fo(c, col, 2); poly(c, [[4, -13], [14, -7], [12, 0], [4, -6]]); fo(c, col, 2); },
  notes(c, col) { ell(c, -8, 10, 5.5, 4, col, 2, -0.4); ell(c, 7, 7, 5.5, 4, col, 2, -0.4); poly(c, [[-4, -10], [11, -13], [11, -9], [-4, -6]]); fo(c, col, 2); rr(c, -5, -9, 2.8, 19, 1); fo(c, col, 1.6); rr(c, 9.5, -12, 2.8, 19, 1); fo(c, col, 1.6); },
  wave(c, col) { c.beginPath(); for (let i = 0; i <= 24; i++) { const x = -14 + i * 28 / 24; const y = Math.sin(i / 24 * TAU * 1.5) * 8 * Math.sin(i / 24 * Math.PI); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 7; c.stroke(); c.strokeStyle = col; c.lineWidth = 3.6; c.stroke(); },
  bolt(c, col) { poly(c, [[3, -15], [-9, 3], [-1, 3], [-4, 15], [9, -4], [1, -4]]); fo(c, col, 2.4); },
  shield(c, col) { c.beginPath(); c.moveTo(0, -14); c.quadraticCurveTo(8, -11, 13, -11); c.quadraticCurveTo(13, 6, 0, 14); c.quadraticCurveTo(-13, 6, -13, -11); c.quadraticCurveTo(-8, -11, 0, -14); fo(c, col, 2.4); c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 9); c.moveTo(-7, -2); c.lineTo(7, -2); c.strokeStyle = 'rgba(20,10,46,.4)'; c.lineWidth = 2; c.stroke(); },
  heart(c, col) { heartPath(c, 0, 0, 9); fo(c, col, 2.4); },
  bag(c, col) { c.beginPath(); c.moveTo(-6, -8); c.quadraticCurveTo(-15, 0, -13, 9); c.quadraticCurveTo(0, 15, 13, 9); c.quadraticCurveTo(15, 0, 6, -8); c.closePath(); fo(c, col, 2.4); rr(c, -7, -11, 14, 5, 2); fo(c, '#ffb02e', 2); circ(c, 0, 3, 4.6, '#ffd44d', 1.6); },
  clock(c, col) { circ(c, 0, 0, 13, '#fff6ea', 2.6); circ(c, 0, 0, 13, null, 0); line(c, 0, 0, 0, -8, OUT, 2.6); line(c, 0, 0, 6, 3, col, 2.6); circ(c, 0, 0, 1.6, OUT, 0); for (const a of [0, 1, 2, 3]) line(c, Math.cos(a * Math.PI / 2) * 10, Math.sin(a * Math.PI / 2) * 10, Math.cos(a * Math.PI / 2) * 11.5, Math.sin(a * Math.PI / 2) * 11.5, OUT, 1.6); },
  star(c, col) { star(c, 0, 1, 14, 6, 5, -Math.PI / 2); fo(c, col, 2.4); },
  fire(c, col) { c.beginPath(); c.moveTo(0, -15); c.bezierCurveTo(12, -4, 13, 6, 6, 12); c.bezierCurveTo(2, 15, -6, 15, -9, 10); c.bezierCurveTo(-14, 3, -6, -3, -5, -9); c.bezierCurveTo(-2, -6, -1, -3, 0, -3); c.bezierCurveTo(1, -8, 0, -11, 0, -15); fo(c, col, 2.4); c.beginPath(); c.moveTo(1, 3); c.bezierCurveTo(6, 8, 4, 12, 0, 12); c.bezierCurveTo(-5, 12, -4, 7, 1, 3); c.fillStyle = '#ffe14d'; c.fill(); },
  snow(c, col) { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; line(c, Math.cos(a) * 14, Math.sin(a) * 14, -Math.cos(a) * 14, -Math.sin(a) * 14, OUT, 5); } for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; line(c, Math.cos(a) * 13, Math.sin(a) * 13, -Math.cos(a) * 13, -Math.sin(a) * 13, col, 2.6); } circ(c, 0, 0, 3.4, '#fff', 1.6); },
  target(c, col) { circ(c, 0, 0, 14, '#fff6ea', 2.4); circ(c, 0, 0, 9.5, col || '#ff4a5e', 2); circ(c, 0, 0, 5, '#fff6ea', 1.8); circ(c, 0, 0, 2, '#ff4a5e', 1); },
  skull(c, col) { c.beginPath(); c.arc(0, -3, 11, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(6, 8); c.lineTo(-6, 8); c.closePath(); fo(c, col, 2.4); circ(c, -4.5, -3, 3.3, OUT, 0); circ(c, 4.5, -3, 3.3, OUT, 0); poly(c, [[0, 2], [-2, 5], [2, 5]]); c.fillStyle = OUT; c.fill(); for (const x of [-3, 0, 3]) line(c, x, 8, x, 12, OUT, 1.8); rr(c, -6, 8, 12, 5, 1.5); fo(c, col, 2); for (const x of [-2, 2]) line(c, x, 8.5, x, 12.5, OUT, 1.4); },
  crown(c, col) { poly(c, [[-13, 10], [-14, -7], [-7, 0], [0, -11], [7, 0], [14, -7], [13, 10]]); fo(c, col, 2.4); circ(c, 0, 3, 2.6, '#ff4a5e', 1.2); circ(c, -8, 5, 1.8, '#5fe8ff', 1); circ(c, 8, 5, 1.8, '#5fe8ff', 1); },
  magnet(c, col) { c.beginPath(); c.arc(0, 0, 9, Math.PI, 0); c.lineWidth = 9; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 5; c.strokeStyle = '#ff4a5e'; c.stroke(); line(c, -9, 0, -9, 10, OUT, 9); line(c, 9, 0, 9, 10, OUT, 9); line(c, -9, 0, -9, 7, '#ff4a5e', 5); line(c, 9, 0, 9, 7, '#ff4a5e', 5); rr(c, -12, 5, 6.4, 7, 1); fo(c, '#e8e8f4', 1.8); rr(c, 5.6, 5, 6.4, 7, 1); fo(c, '#e8e8f4', 1.8); },
  gift(c, col) { rr(c, -12, -3, 24, 16, 2); fo(c, col, 2.4); rr(c, -13, -8, 26, 7, 2); fo(c, shade(col, 0.2), 2.4); rr(c, -2.4, -8, 4.8, 21, 0); c.fillStyle = '#ffd44d'; c.fill(); c.beginPath(); c.ellipse(-4.5, -11, 4.6, 3.2, -0.5, 0, TAU); fo(c, '#ffd44d', 1.8); c.beginPath(); c.ellipse(4.5, -11, 4.6, 3.2, 0.5, 0, TAU); fo(c, '#ffd44d', 1.8); },
  hat(c, col) { ell(c, 0, 8, 15, 4.5, col, 2.4); rr(c, -8, -10, 16, 18, 3); fo(c, col, 2.4); rr(c, -8, 1, 16, 4, 0); c.fillStyle = '#ffd44d'; c.fill(); ell(c, 0, -10, 8, 2.6, shade(col, -0.3), 2); },
  shoe(c, col) { c.beginPath(); c.moveTo(-14, -8); c.lineTo(-5, -8); c.quadraticCurveTo(-3, 0, 5, 1); c.quadraticCurveTo(13, 2, 14, 7); c.lineTo(14, 10); c.lineTo(-14, 10); c.closePath(); fo(c, col, 2.4); rr(c, -14, 8, 28, 5, 2); fo(c, '#fff6ea', 2); for (let i = 0; i < 3; i++) line(c, -4 + i * 4, -3 + i * 1.6, -1 + i * 4, 0 + i * 1.6, '#fff', 1.8); },
  mic(c, col) { circ(c, 0, -6, 7.5, '#fff6ea', 2.4); hatch(c, 0, -6, 6, 3, 'rgba(60,30,90,.4)', 0.9); circ(c, 0, -6, 7.5, null, 2.4); rr(c, -3.2, 0, 6.4, 14, 2.4); fo(c, col, 2.2); rr(c, -3.6, 2, 7.2, 3.4, 0); c.fillStyle = '#ffd44d'; c.fill(); },
  disc(c, col) { circ(c, 0, 0, 13.5, '#17122c', 2.6); c.strokeStyle = 'rgba(160,150,210,.8)'; c.lineWidth = 0.9; for (const k of [8, 10.5]) { c.beginPath(); c.arc(0, 0, k, 0, TAU); c.stroke(); } circ(c, 0, 0, 5, col, 1.8); circ(c, 0, 0, 1.2, '#17122c', 0); c.beginPath(); c.arc(0, 0, 11.5, 3.4, 4.3); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.6; c.stroke(); },
  speaker(c, col) { rr(c, -10, -14, 20, 28, 4); fo(c, col, 2.4); circ(c, 0, -6, 3.2, OUT, 1); circ(c, 0, 5, 6.6, OUT, 1.6); circ(c, 0, 5, 3.2, shade(col, 0.3), 1.2); },
  plug(c, col) { rr(c, -7, -4, 14, 12, 3); fo(c, col, 2.4); line(c, -4, -4, -4, -12, OUT, 6.5); line(c, 4, -4, 4, -12, OUT, 6.5); line(c, -4, -4, -4, -11, '#d6d6e8', 3.4); line(c, 4, -4, 4, -11, '#d6d6e8', 3.4); c.beginPath(); c.moveTo(0, 8); c.quadraticCurveTo(0, 14, 8, 14); c.strokeStyle = OUT; c.lineWidth = 5; c.stroke(); c.strokeStyle = col; c.lineWidth = 2.4; c.stroke(); },
  battery(c, col) { rr(c, -13, -8, 24, 16, 3.5); fo(c, col, 2.4); rr(c, 11, -3.5, 4, 7, 1.5); fo(c, '#d6d6e8', 1.8); rr(c, -10, -5, 12, 10, 1.5); c.fillStyle = '#6dff8a'; c.fill(); },
  dice(c, col) { rr(c, -11, -11, 22, 22, 5); fo(c, '#fff6ea', 2.6); for (const [x, y] of [[-5, -5], [5, -5], [0, 0], [-5, 5], [5, 5]]) circ(c, x, y, 2.2, col || '#ff4a5e', 0); },
  clover(c, col) { for (const [x, y] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) circ(c, x, y, 6, col, 2.2); circ(c, 0, 0, 2.6, shade(col, -0.3), 0); c.beginPath(); c.moveTo(1, 7); c.quadraticCurveTo(4, 12, 9, 14); c.strokeStyle = OUT; c.lineWidth = 3.4; c.stroke(); },
  rocket(c, col) { c.beginPath(); c.moveTo(0, -15); c.quadraticCurveTo(9, -7, 7, 8); c.lineTo(-7, 8); c.quadraticCurveTo(-9, -7, 0, -15); fo(c, '#f2f0fa', 2.4); poly(c, [[-7, 0], [-14, 11], [-7, 8]]); fo(c, col || '#ff4a5e', 2); poly(c, [[7, 0], [14, 11], [7, 8]]); fo(c, col || '#ff4a5e', 2); circ(c, 0, -4, 3.4, '#5fc8ff', 1.8); poly(c, [[-4, 8], [4, 8], [0, 15]]); fo(c, '#ff9a3c', 1.6); },
  bomb(c, col) { circ(c, -1, 3, 11, col, 2.6); c.beginPath(); c.arc(-4, 0, 4, 3.6, 4.8); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2; c.stroke(); rr(c, 0, -11, 6, 5, 1.5); fo(c, '#8a90b8', 1.8); c.beginPath(); c.moveTo(4, -11); c.quadraticCurveTo(8, -15, 12, -12); c.strokeStyle = OUT; c.lineWidth = 2.4; c.stroke(); spark(c, 12, -13, 4, '#ffe14d'); },
  arrow_up(c, col) { poly(c, [[0, -14], [12, 0], [5, 0], [5, 13], [-5, 13], [-5, 0], [-12, 0]]); fo(c, col, 2.4); },
  double(c, col) { rr(c, -12, -12, 17, 17, 4); fo(c, shade(col, -0.2), 2.2); rr(c, -5, -5, 17, 17, 4); fo(c, col, 2.4); line(c, 3.5, 0, 3.5, 8, OUT, 2); line(c, -0.5, 4, 7.5, 4, OUT, 2); },
  eye(c, col) { c.beginPath(); c.moveTo(-14, 0); c.quadraticCurveTo(0, -13, 14, 0); c.quadraticCurveTo(0, 13, -14, 0); fo(c, '#fff6ea', 2.4); circ(c, 0, 0, 5.8, col || '#5fc8ff', 1.8); circ(c, 0, 0, 2.4, OUT, 0); },
  hourglass(c, col) { rr(c, -10, -14, 20, 4, 1.5); fo(c, '#c98f4a', 2); rr(c, -10, 10, 20, 4, 1.5); fo(c, '#c98f4a', 2); poly(c, [[-8, -10], [8, -10], [1.4, 0], [8, 10], [-8, 10], [-1.4, 0]]); fo(c, 'rgba(230,248,255,.85)', 2.2); poly(c, [[-5, 8], [5, 8], [0, 3]]); c.fillStyle = col || '#ffd44d'; c.fill(); },
  ticket(c, col) { c.beginPath(); c.moveTo(-14, -8); c.lineTo(14, -8); c.arc(14, 0, 3.4, -Math.PI / 2, Math.PI / 2, true); c.lineTo(14, 8); c.lineTo(-14, 8); c.arc(-14, 0, 3.4, Math.PI / 2, -Math.PI / 2, true); c.closePath(); fo(c, col, 2.4); line(c, 4, -6, 4, 6, 'rgba(20,10,46,.5)', 1.6); star(c, -4.5, 0, 3.8, 1.6, 5, -Math.PI / 2); c.fillStyle = '#fff6ea'; c.fill(); },
  tape(c, col) { rr(c, -14, -9, 28, 18, 3); fo(c, col, 2.4); rr(c, -9, -5.5, 18, 8, 4); fo(c, '#17122c', 1.8); circ(c, -4.5, -1.5, 2.4, '#fff6ea', 1); circ(c, 4.5, -1.5, 2.4, '#fff6ea', 1); poly(c, [[-8, 9], [-5, 4], [5, 4], [8, 9]]); fo(c, shade(col, 0.25), 1.8); },
  van(c, col) { c.beginPath(); c.moveTo(-14, 7); c.lineTo(-14, -6); c.quadraticCurveTo(-14, -9, -11, -9); c.lineTo(5, -9); c.quadraticCurveTo(8, -9, 10, -5); c.lineTo(14, 0); c.lineTo(14, 7); c.closePath(); fo(c, col, 2.4); poly(c, [[2, -6.5], [6.4, -6.5], [10, -1], [2, -1]]); fo(c, '#bff0ff', 1.6); rr(c, -11, -6, 11, 6, 1.5); fo(c, '#bff0ff', 1.6); circ(c, -7, 8, 3.8, '#2a1c5a', 2); circ(c, 8, 8, 3.8, '#2a1c5a', 2); circ(c, -7, 8, 1.2, '#d6d6e8', 0); circ(c, 8, 8, 1.2, '#d6d6e8', 0); },
  cat(c, col) { poly(c, [[-12, -2], [-11, -14], [-3, -9]]); fo(c, col, 2.2); poly(c, [[12, -2], [11, -14], [3, -9]]); fo(c, col, 2.2); ell(c, 0, 1, 13, 11, col, 2.6); circ(c, -4.6, -1, 2, OUT, 0); circ(c, 4.6, -1, 2, OUT, 0); poly(c, [[-1.6, 3], [1.6, 3], [0, 5]]); c.fillStyle = '#ff5fb0'; c.fill(); for (const s of [-1, 1]) { line(c, s * 6, 4, s * 13, 3, OUT, 1.2); line(c, s * 6, 6, s * 13, 8, OUT, 1.2); } },
  drop(c, col) { c.beginPath(); c.moveTo(0, -14); c.bezierCurveTo(6, -4, 12, 1, 12, 6); c.arc(0, 6, 12, 0, Math.PI); c.bezierCurveTo(-12, 1, -6, -4, 0, -14); fo(c, col, 2.4); c.beginPath(); c.arc(0, 6, 8, 2.2, 3.1); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.stroke(); },
  flower(c, col) { for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - Math.PI / 2; circ(c, Math.cos(a) * 7, Math.sin(a) * 7, 5.4, col, 2); } circ(c, 0, 0, 4.4, '#ffd44d', 1.8); },
  bell(c, col) { c.beginPath(); c.moveTo(-3, -12); c.quadraticCurveTo(0, -15, 3, -12); c.quadraticCurveTo(12, -8, 11, 4); c.lineTo(14, 8); c.lineTo(-14, 8); c.lineTo(-11, 4); c.quadraticCurveTo(-12, -8, -3, -12); fo(c, col, 2.4); circ(c, 0, 11, 3.4, '#8a6a1a', 1.8); c.beginPath(); c.arc(-1, -2, 7, 3.4, 4.5); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.8; c.stroke(); },
  horn(c, col) { poly(c, [[-12, -4], [-12, 4], [12, 12], [12, -12]]); fo(c, col, 2.4); rr(c, -15, -5, 7, 10, 2); fo(c, '#e8e3f2', 2); ell(c, 12, 0, 3, 12, shade(col, -0.5), 2); rr(c, -10, 4, 5, 8, 1.5); fo(c, '#e8e3f2', 1.8); },
  guitar(c, col) { c.save(); c.rotate(-0.7); ell(c, 0, 7, 8.5, 7.5, col, 2.4); ell(c, 0, -2, 6, 5.5, col, 2.4); circ(c, 0, 4, 2.8, OUT, 0); rr(c, -2, -20, 4, 18, 1); fo(c, '#8a5a30', 1.8); rr(c, -3.4, -24, 6.8, 6, 1.5); fo(c, '#5a3a1a', 1.6); c.restore(); },
  sparkle(c, col) { spark(c, 0, 0, 14, OUT); spark(c, 0, 0, 12.6, col); spark(c, 8, -8, 5.4, col); spark(c, -8, 8, 4.4, col); },
  coin(c, col) { circ(c, 0, 0, 13, col, 2.6); circ(c, 0, 0, 9, shade(col, -0.12), 1.8); c.beginPath(); c.arc(0, 0, 11, 3.6, 4.7); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2; c.stroke(); star(c, 0, 0, 5, 2.2, 4, 0); c.fillStyle = shade(col, 0.5); c.fill(); },
  diamond(c, col) { poly(c, [[-11, -4], [-6, -11], [6, -11], [11, -4], [0, 13]]); fo(c, col, 2.6); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-11, -4); c.lineTo(11, -4); c.moveTo(-3, -4); c.lineTo(0, 13); c.moveTo(3, -4); c.lineTo(0, 13); c.moveTo(-6, -11); c.lineTo(-3, -4); c.moveTo(6, -11); c.lineTo(3, -4); c.stroke(); spark(c, -5, -7, 3, '#fff'); },
  record(c, col) { circ(c, 0, 0, 13, '#17122c', 2.6); c.strokeStyle = 'rgba(190,150,220,.7)'; c.lineWidth = 0.9; for (const k of [8.4, 10.6]) { c.beginPath(); c.arc(0, 0, k, 0, TAU); c.stroke(); } circ(c, 0, 0, 5.2, col, 1.8); circ(c, 0, 0, 1.2, OUT, 0); c.beginPath(); c.arc(0, 0, 11.6, 3.4, 4.3); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.6; c.stroke(); },
  fans(c, col) { heartPath(c, -2, 1, 9.5); fo(c, col, 2.4); heartPath(c, 8, -8, 4.6); fo(c, '#ff9ab0', 1.8); spark(c, -8, -9, 3.4, '#fff'); },
  lock(c, col) { c.beginPath(); c.arc(0, -4, 7, Math.PI, 0); c.lineWidth = 6; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 3; c.strokeStyle = '#d6d6e8'; c.stroke(); rr(c, -11, -4, 22, 17, 4); fo(c, col, 2.6); circ(c, 0, 4, 2.6, OUT, 0); rr(c, -1, 4, 2, 5, 0); c.fillStyle = OUT; c.fill(); },
  check(c, col) { c.beginPath(); c.moveTo(-10, 1); c.lineTo(-3, 8); c.lineTo(11, -8); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = OUT; c.lineWidth = 8; c.stroke(); c.strokeStyle = col; c.lineWidth = 4.4; c.stroke(); },
  cross(c, col) { c.beginPath(); c.moveTo(-9, -9); c.lineTo(9, 9); c.moveTo(9, -9); c.lineTo(-9, 9); c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 8; c.stroke(); c.strokeStyle = col; c.lineWidth = 4.4; c.stroke(); },
  plus(c, col) { c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.moveTo(0, -10); c.lineTo(0, 10); c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 8; c.stroke(); c.strokeStyle = col; c.lineWidth = 4.4; c.stroke(); },
  minus(c, col) { c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 8; c.stroke(); c.strokeStyle = col; c.lineWidth = 4.4; c.stroke(); },
  play(c, col) { poly(c, [[-8, -12], [-8, 12], [12, 0]]); fo(c, col, 2.6); },
  pause(c, col) { rr(c, -10, -11, 7.5, 22, 2); fo(c, col, 2.4); rr(c, 2.5, -11, 7.5, 22, 2); fo(c, col, 2.4); },
  ff(c, col) { poly(c, [[-13, -10], [-13, 10], [0, 0]]); fo(c, col, 2.4); poly(c, [[0, -10], [0, 10], [13, 0]]); fo(c, col, 2.4); },
  gear(c, col) { c.beginPath(); for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r = (i % 2 === 0) ? 13.5 : 10; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); fo(c, col, 2.4); circ(c, 0, 0, 4.6, '#1c1240', 2); },
  merge(c, col) { poly(c, [[-14, -12], [-4, -12], [-4, -6], [0, -2], [4, -6], [4, -12], [14, -12], [14, -8], [7, -8], [2, 0], [2, 4], [6, 4], [0, 13], [-6, 4], [-2, 4], [-2, 0], [-7, -8], [-14, -8]]); fo(c, col, 2.2); },
  sell(c, col) { poly(c, [[-13, 0], [-3, -11], [13, -11], [13, 11], [-3, 11]]); fo(c, col, 2.4); circ(c, -3.5, 0, 2.4, OUT, 0); circ(c, 5, 0, 4.4, '#ffd44d', 1.6); },
  reroll(c, col) { for (const s of [0, 1]) { c.save(); c.rotate(s * Math.PI); c.beginPath(); c.arc(0, 0, 9, -2.6, 0.5); c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 7; c.stroke(); c.strokeStyle = col; c.lineWidth = 3.4; c.stroke(); poly(c, [[9, -5], [14, 2], [4, 2]]); fo(c, col, 1.8); c.restore(); } },
};
export const GLYPH_NAMES = Object.keys(GLYPHS);

function drawGlyphRaw(ctx, name, x, y, size, color) {
  const fn = GLYPHS[name] || GLYPHS.sparkle;
  ctx.save();
  ctx.translate(x, y); const s = size / 32; ctx.scale(s, s);
  fn(ctx, color || GLYPH_COL[name] || '#fff6ea');
  ctx.restore();
}
export function drawGlyph(ctx, name, x, y, size, color) { drawGlyphRaw(ctx, name, x, y, size, color); }
export const drawIcon = drawGlyph;

// ================================================================ GEAR
const GEAR_PAL = [['#ff5fb0', '#ffd0ea'], ['#9dff3a', '#e4ffb0'], ['#2fe6ff', '#c4f6ff'], ['#ffc83d', '#fff0b8'], ['#b66bff', '#e6ccff'], ['#ff7a3c', '#ffd9a0']];
export function drawGear(ctx, slot, id, rarity, x, y, size) {
  const R = RARITY[rarity] || RARITY.common;
  const h = hashStr(String(id));
  const [c1, c2] = GEAR_PAL[h % GEAR_PAL.length];
  const v = (h >> 4) % 3;
  ctx.save();
  ctx.translate(x, y); const s = size / 64; ctx.scale(s, s);
  rr(ctx, -30, -30, 60, 60, 13);
  const g = ctx.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, shade(R.color, -0.45)); g.addColorStop(1, shade(R.color, -0.8));
  fo(ctx, g, 3);
  const rank = ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(rarity);
  if (rank >= 1) { ctx.fillStyle = shade(R.color, 0.2); ctx.globalAlpha *= 0.18 + rank * 0.05; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  rr(ctx, -27, -27, 54, 54, 10); ctx.strokeStyle = R.color; ctx.lineWidth = 2 + (rank >= 3 ? 1.2 : 0); ctx.stroke();
  ctx.save(); ctx.translate(0, 1); ctx.scale(1.05, 1.05);
  switch (slot) {
    case 'head': { // headphones
      ctx.beginPath(); ctx.arc(0, 2, 16, Math.PI * 1.08, Math.PI * 1.92); ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = c1; ctx.lineWidth = 4.4; ctx.stroke();
      for (const sg of [-1, 1]) { rr(ctx, sg * 16 - 6, -3, 12, 19, 5); fo(ctx, c2, 2.4); rr(ctx, sg * 16 - 3.5, 0, 7, 13, 3); fo(ctx, c1, 1.4); }
      if (v === 1) { circ(ctx, 0, -14, 3, c2, 1.4); } else if (v === 2) { poly(ctx, [[-4, -14], [0, -19], [4, -14]]); fo(ctx, c2, 1.6); }
      break;
    }
    case 'mic': {
      circ(ctx, 0, -8, 10, c2, 2.6); hatch(ctx, 0, -8, 8.5, 3.4, 'rgba(40,20,70,.35)', 1);
      circ(ctx, 0, -8, 10, null, 2.6);
      rr(ctx, -4.4, 1, 8.8, 20, 3); fo(ctx, '#2a2150', 2.4);
      rr(ctx, -5, 5, 10, 5, 1); fo(ctx, c1, 1.6);
      if (v === 1) heartPath(ctx, 0, 15, 2.6), ctx.fillStyle = c2, ctx.fill();
      if (v === 2) spark(ctx, 10, -17, 4, c2);
      break;
    }
    case 'body': { // tee
      c1 && ctx.beginPath();
      ctx.moveTo(-8, -17); ctx.lineTo(-20, -9); ctx.lineTo(-15, -1); ctx.lineTo(-10, -4); ctx.lineTo(-10, 18); ctx.lineTo(10, 18); ctx.lineTo(10, -4); ctx.lineTo(15, -1); ctx.lineTo(20, -9); ctx.lineTo(8, -17);
      ctx.quadraticCurveTo(0, -9, -8, -17); ctx.closePath(); fo(ctx, c1, 2.6);
      if (v === 0) circ(ctx, 0, 3, 5.6, c2, 1.8); else if (v === 1) { star(ctx, 0, 3, 6.4, 3, 5, -Math.PI / 2); fo(ctx, c2, 1.6); } else { rr(ctx, -7, 0, 14, 4, 1); ctx.fillStyle = c2; ctx.fill(); rr(ctx, -7, 7, 14, 4, 1); ctx.fillStyle = c2; ctx.fill(); }
      break;
    }
    case 'chain': {
      ctx.beginPath(); ctx.moveTo(-16, -15); ctx.quadraticCurveTo(0, 18, 16, -15); ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = '#e8e3f2'; ctx.lineWidth = 2.6; ctx.setLineDash && ctx.setLineDash([4, 2.4]); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
      if (v === 0) { heartPath(ctx, 0, 11, 7); fo(ctx, c1, 2.2); } else if (v === 1) { poly(ctx, [[0, 3], [8, 11], [0, 20], [-8, 11]]); fo(ctx, c1, 2.2); } else { circ(ctx, 0, 12, 7, c1, 2.2); circ(ctx, 0, 12, 3, c2, 1.2); }
      break;
    }
    case 'feet': { // sneaker
      ctx.beginPath(); ctx.moveTo(-18, -12); ctx.lineTo(-6, -12); ctx.quadraticCurveTo(-3, -2, 7, -1); ctx.quadraticCurveTo(18, 0, 19, 8); ctx.lineTo(19, 12); ctx.lineTo(-18, 12); ctx.closePath(); fo(ctx, c1, 2.6);
      rr(ctx, -19, 9, 39, 7, 3); fo(ctx, '#fff6ea', 2.2);
      for (let i = 0; i < 3; i++) line(ctx, -2 + i * 5, -5 + i * 1.8, 2 + i * 5, -2 + i * 1.8, '#fff', 2);
      if (v === 0) poly(ctx, [[-14, -4], [-8, 4], [-14, 6]]), ctx.fillStyle = c2, ctx.fill(); else if (v === 1) { circ(ctx, -12, 0, 3.4, c2, 1.4); } else { rr(ctx, -16, 0, 10, 3, 1); ctx.fillStyle = c2; ctx.fill(); }
      break;
    }
    default: drawGlyphRaw(ctx, 'sparkle', 0, 0, 30, c1);
  }
  ctx.restore();
  if (rank >= 3) { spark(ctx, -22, -22, 5, '#fff'); spark(ctx, 23, 20, 4, R.color); }
  if (rank >= 4) { spark(ctx, 22, -23, 4, '#5fe8ff'); spark(ctx, -23, 22, 4, '#ff5fb0'); }
  ctx.restore();
}

// ================================================================ CRATES
const CRATE = {
  garage: { body: '#b47a45', dark: '#6e4522', trim: '#e0b070', band: '#3a2412', lock: '#ffd44d', glow: '#ffd44d' },
  studio: { body: '#4a5a8a', dark: '#262f52', trim: '#c4d2f4', band: '#1a2038', lock: '#5fe8ff', glow: '#5fe8ff' },
  platinum: { body: '#e8e4f6', dark: '#a9a2cc', trim: '#ffd84d', band: '#6c5ea8', lock: '#ff5fb0', glow: '#ff8ad8' },
};
export function drawCrate(ctx, tier, x, y, size, o) {
  const P = CRATE[tier] || CRATE.garage;
  o = o || {};
  const t = o.t || 0, open = clampN(o.open || 0, 0, 1), shake = o.shake || 0;
  ctx.save();
  ctx.translate(x, y); const s = size / 100; ctx.scale(s, s);
  if (shake) ctx.rotate(Math.sin(t * 45) * 0.06 * shake);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 44, 42, 8, 0, 0, TAU); ctx.fill();
  // light beam when open
  if (open > 0) {
    const g = ctx.createLinearGradient(0, 10, 0, -90); g.addColorStop(0, shade(P.glow, 0.4)); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha *= open * 0.85; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-34, 6); ctx.lineTo(-62, -90); ctx.lineTo(62, -90); ctx.lineTo(34, 6); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) { const k = (t * 0.7 + i / 6) % 1; spark(ctx, Math.sin(i * 2.4 + t) * 34, 6 - k * 80, 3 + (i % 3), i % 2 ? '#fff' : P.glow); }
  }
  // body
  rr(ctx, -42, -6, 84, 50, 8); fo(ctx, vgrad(ctx, -6, 44, P.body, P.dark), 4);
  // inside glow
  if (open > 0) { rr(ctx, -36, -8, 72, 8, 3); ctx.fillStyle = shade(P.glow, 0.5); ctx.fill(); }
  // bands and corners
  for (const bx of [-26, 26]) { rr(ctx, bx - 6, -6, 12, 50, 2); ctx.fillStyle = P.band; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
  for (const [cx, cy] of [[-40, -4], [40, -4], [-40, 42], [40, 42]]) circ(ctx, cx, cy, 4.4, P.trim, 1.8);
  if (tier === 'garage') { for (let i = 0; i < 3; i++) line(ctx, -14, 4 + i * 12, 14, 4 + i * 12, 'rgba(60,30,10,.35)', 2); rr(ctx, -12, 14, 24, 14, 3); fo(ctx, '#ffd44d', 2); drawGlyphRaw(ctx, 'note', 0, 21, 14, '#3a2412'); }
  if (tier === 'studio') { rr(ctx, -14, 12, 28, 18, 4); fo(ctx, '#1a2038', 2.4); drawGlyphRaw(ctx, 'diamond', 0, 21, 14, '#5fe8ff'); line(ctx, -36, 36, 36, 36, 'rgba(196,210,244,.5)', 2); }
  if (tier === 'platinum') { rr(ctx, -16, 10, 32, 22, 5); fo(ctx, P.band, 2.4); drawGlyphRaw(ctx, 'crown', 0, 21, 18, '#ffd84d'); ctx.beginPath(); ctx.moveTo(-40, 20); ctx.lineTo(40, 6); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.stroke(); spark(ctx, 30 + Math.sin(t * 3) * 3, 0, 5, '#fff'); }
  // lock
  circ(ctx, 0, 0, 6, P.lock, 2);
  // lid: hinged at the back (top), swings up and back as `open` grows
  ctx.save();
  ctx.translate(0, -6);
  const lift = open * 38;
  ctx.scale(1, 1 - open * 0.55);
  ctx.translate(0, -lift * (1 - open * 0.3));
  rr(ctx, -45, -22, 90, 22, 8); fo(ctx, vgrad(ctx, -22, 0, shade(P.body, 0.2), P.body), 4);
  for (const bx of [-26, 26]) { rr(ctx, bx - 6, -22, 12, 22, 2); ctx.fillStyle = P.band; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
  rr(ctx, -38, -19, 76, 5, 2); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ================================================================ RARITY FRAME
export function drawRarityFrame(ctx, rarity, x, y, w, h, t) {
  const R = RARITY[rarity] || RARITY.common;
  t = t || 0;
  const rank = ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(rarity);
  ctx.save();
  ctx.translate(x, y);
  const rad = Math.min(16, w / 5, h / 5);
  rr(ctx, -w / 2 - 4, -h / 2 - 4, w + 8, h + 8, rad + 3); ctx.strokeStyle = R.color; ctx.globalAlpha *= 0.12 + rank * 0.05; ctx.lineWidth = 8; ctx.stroke(); ctx.globalAlpha = 1;
  rr(ctx, -w / 2, -h / 2, w, h, rad);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, shade(R.color, -0.5)); g.addColorStop(1, shade(R.color, -0.85));
  ctx.fillStyle = g; ctx.fill();
  if (rarity === 'mythic') {
    const cols = ['#ff4fa0', '#ffc83d', '#6dff8a', '#2fe6ff', '#b66bff', '#ff4fa0'];
    const lg2 = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    for (let i = 0; i <= 5; i++) lg2.addColorStop(i / 5, cols[(i + Math.floor(t * 2)) % 5]);
    rr(ctx, -w / 2, -h / 2, w, h, rad); ctx.strokeStyle = lg2; ctx.lineWidth = 4; ctx.stroke();
  } else { rr(ctx, -w / 2, -h / 2, w, h, rad); ctx.strokeStyle = R.color; ctx.lineWidth = rank >= 2 ? 3.4 : 2.6; ctx.stroke(); }
  rr(ctx, -w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, rad + 1); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
  if (rank >= 3) { // diagonal shimmer sweep
    const k = ((t * 0.5) % 1.6) - 0.3;
    ctx.save(); rr(ctx, -w / 2, -h / 2, w, h, rad); ctx.clip();
    ctx.translate(-w / 2 + k * (w + h), 0); ctx.rotate(0.5);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(-8, -h, 16, h * 2.6);
    ctx.restore();
    spark(ctx, -w / 2 + 8, -h / 2 + 8, 5 + Math.sin(t * 4) * 1.5, '#fff');
  }
  ctx.restore();
}
