// GRAFTWORK enemy art. Everything is circles, rects and polylines with ink outlines, stitched seams, bandages, brass and glass.
// drawEnemy draws the enemy standing with its FEET at (x,y), facing LEFT (toward the player). o: { scale=1, t (sec), hurt 0..1, dying 0..1, attack -1..1 (lunge), flip, st:{status:n} }
// This module also exports the drawing kit (K) that art/heroes.js reuses.
import { COL } from '../ui/core.js';

const TAU = Math.PI * 2;
export const INK = '#16110f';
const G = { flash: 0 };

// ------------------------------------------------------------------ colour (cached, flash aware)
const rgbMap = new Map();
function rgbOf(h) {
  let v = rgbMap.get(h);
  if (v) return v;
  let s = typeof h === 'string' ? h : '#888888';
  if (s[0] !== '#') s = '#888888';
  if (s.length === 4) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  const n = parseInt(s.slice(1), 16);
  v = Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [136, 136, 136];
  rgbMap.set(h, v);
  return v;
}
const colCache = new Map();
// C(hex, k, a): k < 1 darkens, k > 1 lightens toward white, a = alpha. White flash from G.flash.
export function C(hex, k = 1, a = 1) {
  const fq = Math.round(G.flash * 8), kq = Math.round(k * 50), aq = Math.round(a * 20);
  const key = (kq * 9 + fq) * 21 + aq;
  let m = colCache.get(hex);
  if (!m) { m = new Map(); colCache.set(hex, m); }
  let s = m.get(key);
  if (s) return s;
  const rgb = rgbOf(hex);
  const fl = (hex === INK ? 0.45 : 1) * fq / 8;
  const f = (v) => { let r = k <= 1 ? v * k : v + (255 - v) * (k - 1); r = r + (255 - r) * fl; return Math.max(0, Math.min(255, Math.round(r))); };
  s = aq >= 20 ? `rgb(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])})` : `rgba(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])},${aq / 20})`;
  m.set(key, s);
  return s;
}
const ink = () => C(INK);

// ------------------------------------------------------------------ drawing kit
function path(ctx, pts, close) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  if (close) ctx.closePath();
}
function fs(ctx, fill, lw) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = ink(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
}
export function poly(ctx, pts, fill, lw = 2.5) { path(ctx, pts, true); fs(ctx, fill, lw); }
export function line(ctx, pts, col, lw = 2) { path(ctx, pts, false); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
// outlined polyline (a limb, a hose): ink underlay then colour
export function limb(ctx, pts, col, lw = 6) { line(ctx, pts, ink(), lw + 3); line(ctx, pts, col, lw); }
export function smooth(ctx, pts, col, lw = 2) {
  const n = pts.length / 2;
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) { const mx = (pts[i * 2] + pts[i * 2 + 2]) / 2, my = (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2; ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], mx, my); }
  ctx.lineTo(pts[n * 2 - 2], pts[n * 2 - 1]);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
export function ell(ctx, x, y, rx, ry, fill, lw = 2.5, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, Math.abs(rx)), Math.max(0.1, Math.abs(ry)), rot, 0, TAU); fs(ctx, fill, lw); }
export function circ(ctx, x, y, r, fill, lw = 2.5) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); fs(ctx, fill, lw); }
export function rect(ctx, x, y, w, h, fill, r = 0, lw = 2.5) { ctx.beginPath(); if (r && ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); fs(ctx, fill, lw); }
// stitched seam along a polyline: thread plus cross ticks
export function seam(ctx, pts, step = 7, len = 4.5, col = null, lw = 1.6) {
  ctx.strokeStyle = col || ink(); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(ctx, pts, false); ctx.stroke();
  ctx.beginPath();
  let carry = 0;
  for (let i = 0; i < pts.length - 2; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], dx = pts[i + 2] - x0, dy = pts[i + 3] - y0, L = Math.hypot(dx, dy);
    if (L < 0.01) continue;
    const ux = dx / L, uy = dy / L;
    let d = carry;
    for (; d < L; d += step) { const px = x0 + ux * d, py = y0 + uy * d; ctx.moveTo(px - uy * len + ux * 1.2, py + ux * len + uy * 1.2); ctx.lineTo(px + uy * len - ux * 1.2, py - ux * len - uy * 1.2); }
    carry = d - L;
  }
  ctx.stroke();
}
export function staple(ctx, x, y, ang = 0, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-5, -2.5); ctx.lineTo(-5, 1.5); ctx.lineTo(5, 1.5); ctx.lineTo(5, -2.5);
  ctx.strokeStyle = ink(); ctx.lineWidth = 4.4; ctx.stroke();
  ctx.strokeStyle = C('#d6dbdc'); ctx.lineWidth = 2.2; ctx.stroke();
  ctx.restore();
}
export function bandage(ctx, x, y, w, h, ang = 0, col = '#e9e0c9') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  rect(ctx, -w / 2, -h / 2, w, h, C(col), 1.5, 2);
  ctx.strokeStyle = C(col, 0.6); ctx.lineWidth = 1; ctx.beginPath();
  for (let i = -w / 2 + 4; i < w / 2 - 2; i += 5) { ctx.moveTo(i, -h / 2 + 1); ctx.lineTo(i + 3, h / 2 - 1); }
  ctx.stroke();
  ctx.restore();
}
// a bandage wrapped around a limb/body between two points: stripes across with slight diagonal
export function wrap(ctx, x0, y0, x1, y1, w, col = '#e9e0c9', n = 5) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n, cx = x0 + dx * f, cy = y0 + dy * f;
    line(ctx, [cx - nx * w / 2 - dx / n * 0.2, cy - ny * w / 2 - dy / n * 0.2, cx + nx * w / 2 + dx / n * 0.2, cy + ny * w / 2 + dy / n * 0.2], ink(), L / n * 0.9 + 2.5);
    line(ctx, [cx - nx * w / 2 - dx / n * 0.2, cy - ny * w / 2 - dy / n * 0.2, cx + nx * w / 2 + dx / n * 0.2, cy + ny * w / 2 + dy / n * 0.2], C(col, i % 2 ? 0.88 : 1), L / n * 0.9);
  }
}
export function glow(ctx, x, y, r, col, a = 0.5) { for (let i = 0; i < 4; i++) { ctx.fillStyle = C(col, 1, a * (0.1 + i * 0.07)); ctx.beginPath(); ctx.arc(x, y, r * (1 - i * 0.23), 0, TAU); ctx.fill(); } }
export function flame(ctx, x, y, s, t, seed = 0, big = false) {
  const fl = 1 + Math.sin(t * 14 + seed * 3.1) * 0.13 + Math.sin(t * 23 + seed) * 0.07, sw = Math.sin(t * 8.5 + seed * 2) * 0.22;
  const draw = (k, col, lw) => {
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - s * 9 * k, y - s * 3, x - s * 6 * k, y - s * 14 * fl * k, x + sw * s * 10, y - s * 26 * fl * k);
    ctx.bezierCurveTo(x + s * 6 * k, y - s * 14 * fl * k, x + s * 9 * k, y - s * 3, x, y);
    ctx.fillStyle = col; ctx.fill();
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = ink(); ctx.stroke(); }
  };
  if (big) glow(ctx, x, y - s * 12, s * 26, '#ffb347', 0.45);
  draw(1, C('#ff7a2b'), 1.4); draw(0.62, C('#ffc247'), 0); draw(0.3, C('#fff3b0'), 0);
}
export function eye(ctx, x, y, r, lx = 0, ly = 0, blink = 0, pupil = INK, sclera = '#f3ecd8') {
  ell(ctx, x, y, r, Math.max(0.6, r * (1 - 0.92 * blink)), C(sclera), 1.8);
  if (blink < 0.7) { circ(ctx, x + lx * r * 0.45, y + ly * r * 0.4, r * 0.52, C(pupil), 0); ctx.fillStyle = C('#fff'); ctx.beginPath(); ctx.arc(x + lx * r * 0.45 - r * 0.15, y + ly * r * 0.4 - r * 0.18, r * 0.16, 0, TAU); ctx.fill(); }
}
export function dots(ctx, x, y, r, blink, col = INK) { if (blink > 0.6) { line(ctx, [x - r, y, x + r, y], C(col), 1.8); } else circ(ctx, x, y, r, C(col), 0); }
export function mouthStitch(ctx, x, y, w, curve = 4, col = INK, ticks = 4) {
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y + curve * 2, x + w / 2, y);
  ctx.strokeStyle = C(col); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i <= ticks; i++) { const f = i / ticks, px = x - w / 2 + w * f, py = y + curve * 2 * f * (1 - f) * 2; ctx.moveTo(px, py - 3.5); ctx.lineTo(px, py + 3.5); }
  ctx.lineWidth = 1.4; ctx.stroke();
}
export function thread(ctx, x0, y0, x1, y1, col = '#cdbfa0', lw = 1.2, sag = 0) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1);
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
}
export function coin(ctx, x, y, r, rot = 0, col = '#d9b43c') {
  const rx = Math.max(r * 0.14, r * Math.abs(Math.cos(rot)));
  ell(ctx, x, y, rx, r, C(col), 2);
  if (rx > r * 0.4) { ell(ctx, x, y, rx * 0.68, r * 0.68, null, 1.2); ell(ctx, x - rx * 0.12, y - r * 0.18, rx * 0.22, r * 0.18, C(col, 1.5), 0); line(ctx, [x - rx * 0.2, y + r * 0.1, x + rx * 0.25, y + r * 0.1], ink(), 1.4); }
}
export function gear(ctx, x, y, r, teeth, rot, col = '#a89a6a') {
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) { const a = rot + i * Math.PI / teeth, rr = (i % 2 ? 0.76 : 1) * r, a2 = a + (i % 2 ? 0 : 0.0); const px = x + Math.cos(a2) * rr, py = y + Math.sin(a2) * rr; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath(); fs(ctx, C(col), 2);
  circ(ctx, x, y, r * 0.3, C(INK, 1), 0);
}
// a mask: kind grin | weep | blank | sneer | gold | wail
export function mask(ctx, x, y, w, h, col, kind, tilt = 0, A = null) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
  ell(ctx, 0, 0, w / 2, h / 2, C(col), 2.4);
  ell(ctx, -w * 0.12, -h * 0.2, w * 0.2, h * 0.12, C(col, 1.3, 0.55), 0);
  const ex = w * 0.2, ey = -h * 0.08, dk = C(INK);
  if (kind === 'grin') {
    ctx.strokeStyle = dk; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-ex, ey + 2, w * 0.1, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(ex, ey + 2, w * 0.1, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w * 0.3, h * 0.12); ctx.quadraticCurveTo(0, h * 0.5, w * 0.3, h * 0.12); ctx.closePath(); ctx.fillStyle = dk; ctx.fill();
    ctx.strokeStyle = C('#f3ecd8'); ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(i * w * 0.1, h * 0.14 + Math.abs(i) * 1.5); ctx.lineTo(i * w * 0.1, h * 0.27 - Math.abs(i) * 2.5); } ctx.stroke();
  } else if (kind === 'weep') {
    ell(ctx, -ex, ey + 1, w * 0.09, h * 0.07, dk, 0, 0.35); ell(ctx, ex, ey + 1, w * 0.09, h * 0.07, dk, 0, -0.35);
    ctx.strokeStyle = dk; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, h * 0.42, w * 0.2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    const tp = A ? (A.t * 0.9) % 1 : 0.3;
    line(ctx, [-ex, ey + 4, -ex - 1, h * 0.28 + tp * 6], C('#8fc4e8'), 2.4);
    circ(ctx, -ex - 1, h * 0.3 + tp * 7, 2.2, C('#8fc4e8'), 0);
  } else if (kind === 'sneer') {
    ell(ctx, -ex, ey, w * 0.1, h * 0.05, dk, 0, 0.5); ell(ctx, ex, ey + 2, w * 0.1, h * 0.06, dk, 0, -0.1);
    line(ctx, [ex - w * 0.12, ey - h * 0.1, ex + w * 0.1, ey - h * 0.15], dk, 2.6); line(ctx, [-ex - w * 0.12, ey - h * 0.14, -ex + w * 0.12, ey - h * 0.07], dk, 2.6);
    ctx.strokeStyle = dk; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-w * 0.28, h * 0.28); ctx.quadraticCurveTo(0, h * 0.2, w * 0.28, h * 0.34); ctx.stroke();
    line(ctx, [w * 0.28, h * 0.34, w * 0.32, h * 0.28], dk, 2.2);
  } else if (kind === 'gold') {
    ell(ctx, -ex, ey, w * 0.09, h * 0.05, dk, 0); ell(ctx, ex, ey, w * 0.09, h * 0.05, dk, 0);
    ell(ctx, 0, h * 0.26, w * 0.12, h * 0.13, dk, 0);
  } else if (kind === 'wail') {
    ell(ctx, -ex, ey, w * 0.07, h * 0.1, dk, 0); ell(ctx, ex, ey, w * 0.07, h * 0.1, dk, 0);
    ell(ctx, 0, h * 0.25, w * 0.15, h * 0.18, dk, 0);
  } else { // blank
    circ(ctx, -ex, ey, w * 0.05, dk, 0); circ(ctx, ex, ey, w * 0.05, dk, 0);
    seam(ctx, [-w * 0.2, h * 0.25, w * 0.2, h * 0.25], 5, 3);
  }
  ctx.restore();
}
export function jar(ctx, x, y, w, h, liquid, level, t, o = {}) {
  const x0 = x - w / 2, top = y - h, rad = o.r === undefined ? Math.min(14, w * 0.2) : o.r;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, top, w, h, rad) : ctx.rect(x0, top, w, h);
  ctx.fillStyle = C(o.glass || '#cfe4e0', 1, 0.28); ctx.fill();
  ctx.save(); ctx.clip();
  const ly = y - h * level, amp = o.slosh === undefined ? 2.6 : o.slosh;
  ctx.beginPath(); ctx.moveTo(x0 - 2, y + 2);
  for (let i = 0; i <= 8; i++) { const px = x0 + (w * i) / 8; ctx.lineTo(px, ly + Math.sin(t * 3.1 + i * 0.9) * amp + Math.sin(t * 1.7 - i * 0.5) * amp * 0.6); }
  ctx.lineTo(x0 + w + 2, y + 2); ctx.closePath(); ctx.fillStyle = C(liquid, 1, o.cloudy ? 0.92 : 0.78); ctx.fill();
  ctx.strokeStyle = C(liquid, 1.35, 0.7); ctx.lineWidth = 1.5; ctx.stroke();
  if (o.inner) o.inner(ctx);
  // bubbles
  for (let i = 0; i < 3; i++) { const f = (t * 0.25 + i * 0.37) % 1; circ(ctx, x0 + w * (0.25 + i * 0.25) + Math.sin(t * 2 + i) * 2, y - 4 - f * (h * level - 6), 1.8 + i * 0.5, C('#fff', 1, 0.5), 0); }
  ctx.restore();
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, top, w, h, rad) : ctx.rect(x0, top, w, h); ctx.lineWidth = 2.6; ctx.strokeStyle = ink(); ctx.stroke();
  line(ctx, [x0 + w * 0.16, top + 12, x0 + w * 0.16, y - h * 0.4], C('#fff', 1, 0.55), 3);
  line(ctx, [x0 + w * 0.16, y - h * 0.3, x0 + w * 0.16, y - h * 0.24], C('#fff', 1, 0.55), 3);
  if (o.lid !== false) { rect(ctx, x0 - 3, top - 9, w + 6, 11, C(o.lidCol || '#a58c4a'), 3, 2.2); line(ctx, [x0 + 2, top - 6, x0 + w - 2, top - 6], C(o.lidCol || '#a58c4a', 1.4), 1.5); }
}

// ------------------------------------------------------------------ sizes (scale 1, normal kind)
const SIZE = {
  dome: [140, 100], tall: [80, 170], cylinder: [92, 150], stilts: [110, 175], wings: [150, 170], striped: [76, 165], capsules: [150, 130], bellows: [140, 140],
  tail: [160, 85], lamp: [96, 180], figure: [86, 155], box: [170, 105], bell: [160, 205], jar: [104, 150], hunched: [110, 125], disc: [100, 100], lure: [150, 175],
  jagged: [160, 90], balance: [130, 175], cleaver: [100, 145], bloom: [130, 115], barrels: [160, 125], columns: [120, 165], candle: [76, 165], loupe: [100, 185],
  podium: [160, 150], tophat: [100, 195], torch: [90, 175], masks: [160, 115], cherub: [100, 115], puppet: [100, 170], cone: [140, 195], eyebox: [116, 125],
  curtain: [124, 175], clappers: [150, 125], outline: [96, 170], hat: [84, 200], conductor: [110, 195], patchwork: [120, 195], blob: [110, 100],
};
const ID_SIZE = {
  pickled_thing: [74, 82], bidder: [86, 108], haggler: [112, 128], gurney_foot: [160, 92], defibrillator: [120, 138], heckler: [110, 160], the_diva: [140, 175],
  mask_chorus: [175, 115], stagehands: [180, 175], gold_leaf_golem: [120, 165], the_resident: [92, 180], slime_bit: [140, 100], two_gurneys: [170, 108],
};
const ID_K = { pickled_king: 1.4, the_matron: 1.3, the_broker: 1.25, the_impresario: 1.25, the_grafter: 1.3, auction_house: 1.15, the_appraiser: 1.15, defibrillator: 1.0, two_gurneys: 1.0, gurney_foot: 1.0, stagehands: 1.0, the_diva: 1.1 };
function kindK(def) { if (ID_K[def.id]) return ID_K[def.id]; return def.kind === 'boss' ? 1.35 : def.kind === 'elite' ? 1.15 : 1; }
function baseSize(def) { return ID_SIZE[def.id] || SIZE[def.art && def.art.body] || SIZE.blob; }
export function enemyBounds(def) {
  try {
    const s = baseSize(def), k = kindK(def) * ((def.art && def.art.scale) || 1);
    return { w: Math.round(s[0] * k), h: Math.round(s[1] * k) };
  } catch (e) { return { w: 130, h: 150 }; }
}

// ------------------------------------------------------------------ shared stage: transforms, hurt flash, unstitching death
const phCache = new Map();
function phaseOf(id) {
  let p = phCache.get(id);
  if (p === undefined) { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973; p = h / 9973 * 20; phCache.set(id, p); }
  return p;
}
// normalised jagged cut lines (u across bw, v across bh)
const CUT_H = [-0.7, -0.5, -0.3, -0.55, -0.08, -0.62, 0.12, -0.66, 0.3, -0.6, 0.7, -0.55];
const CUT_V1 = [0, -1.1, 0.05, -0.85, -0.08, -0.62];
const CUT_V2 = [0.12, -0.66, 0.02, -0.35, 0.04, -0.2, 0.1, 0.1];
const CUT_C = [-0.7, -0.15, -0.4, -0.22, -0.15, -0.12, 0.04, -0.2];
const PIECES = [
  [-0.7, -1.1, 0, -1.1, 0.05, -0.85, -0.08, -0.62, -0.3, -0.55, -0.7, -0.5],
  [0, -1.1, 0.7, -1.1, 0.7, -0.55, 0.3, -0.6, 0.12, -0.66, -0.08, -0.62, 0.05, -0.85],
  [-0.7, -0.5, -0.3, -0.55, -0.08, -0.62, 0.12, -0.66, 0.02, -0.35, 0.04, -0.2, -0.15, -0.12, -0.4, -0.22, -0.7, -0.15],
  [0.12, -0.66, 0.3, -0.6, 0.7, -0.55, 0.7, 0.1, 0.1, 0.1, 0.02, -0.35],
  [-0.7, -0.15, -0.4, -0.22, -0.15, -0.12, 0.04, -0.2, 0.1, 0.1, -0.7, 0.1],
];
const PIECE_DX = [-0.32, 0.34, -0.42, 0.4, -0.2], PIECE_G = [0.55, 0.5, 0.2, 0.18, 0.03], PIECE_R = [-0.5, 0.45, -0.25, 0.3, -0.1];
const cutPts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
function strokeCut(ctx, cut, bw, bh, col) {
  const n = cut.length; for (let i = 0; i < n; i += 2) { cutPts[i] = cut[i] * bw; cutPts[i + 1] = cut[i + 1] * bh; }
  ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(cutPts[0], cutPts[1]); for (let i = 2; i < n; i += 2) ctx.lineTo(cutPts[i], cutPts[i + 1]); ctx.stroke();
  ctx.lineWidth = 1.6; ctx.beginPath();
  for (let i = 0; i < n - 2; i += 2) { const mx = (cutPts[i] + cutPts[i + 2]) / 2, my = (cutPts[i + 1] + cutPts[i + 3]) / 2; ctx.moveTo(mx - 7, my - 6); ctx.lineTo(mx + 7, my + 6); ctx.moveTo(mx + 7, my - 6); ctx.lineTo(mx - 7, my + 6); }
  ctx.stroke();
}
function paintPieces(ctx, paint, A, bw, bh, d) {
  const e = d * d, fade = Math.max(0, 1 - Math.pow(Math.max(0, (d - 0.3) / 0.7), 1.4));
  for (let i = 0; i < PIECES.length; i++) {
    const p = PIECES[i], open = Math.max(0, d - 0.08);
    ctx.save();
    ctx.globalAlpha *= fade;
    const dy = Math.min(e * bh * 1.1 * PIECE_G[i] * 2.2, bh * (0.62 - PIECE_G[i] * 1.0 + 0.1)) + Math.sin(open * 9 + i) * 0.5 * (1 - open);
    ctx.translate(PIECE_DX[i] * bw * open * 1.3, dy);
    ctx.rotate(PIECE_R[i] * open * 0.9);
    ctx.beginPath(); ctx.moveTo(p[0] * bw * 1.2, p[1] * bh * 1.2);
    for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k] * bw * (Math.abs(p[k]) > 0.69 ? 1.3 : 1), p[k + 1] * bh * (p[k + 1] < -1.09 ? 1.3 : 1));
    ctx.closePath(); ctx.clip();
    paint(ctx, A);
    const sc = C('#3a1a1a', 1, 0.9);
    strokeCut(ctx, CUT_H, bw, bh, sc); strokeCut(ctx, CUT_V1, bw, bh, sc); strokeCut(ctx, CUT_V2, bw, bh, sc); strokeCut(ctx, CUT_C, bw, bh, sc);
    ctx.restore();
  }
}
const A_ = { t: 0, b: 0, blink: 0, att: 0, hurt: 0, big: 0, st: null, col: '#888', id: '', def: null, o: null, dying: 0, bw: 100, bh: 100 };
const NOST = {};
function prepA(o, id, col, bw, bh) {
  const A = A_, t = (o.t || 0) + phaseOf(id);
  A.t = t; A.b = Math.sin(t * 2.1); A.att = o.attack || 0; A.hurt = o.hurt || 0; A.st = o.st || NOST; A.col = col; A.id = id; A.dying = o.dying || 0; A.o = o; A.bw = bw; A.bh = bh;
  const f = (t * 0.27 + phaseOf(id + 'b')) % 1; // blink once every ~3.7s, 0.18s long
  A.blink = f < 0.05 ? Math.sin(f / 0.05 * Math.PI) : 0;
  return A;
}

// status tells drawn in screen orientation (not mirrored)
function tells(ctx, A, bw, bh, k) {
  const st = A.st, t = A.t;
  if (st === NOST) return;
  const n = (s) => (typeof st[s] === 'number' ? st[s] : 0);
  if (n('burn') > 0) {
    const c = Math.min(4, 1 + Math.floor(n('burn') / 5));
    for (let i = 0; i < c; i++) flame(ctx, (i - (c - 1) / 2) * bw * 0.3 * k, -bh * k * (0.62 + (i % 2) * 0.2), 0.8, t + i, i);
  }
  if (n('bleed') > 0) for (let i = 0; i < 3; i++) { const f = (t * 0.9 + i / 3) % 1; circ(ctx, (i - 1) * bw * 0.22 * k, -bh * k * 0.55 + f * bh * k * 0.5, 2.8 * (1 - f * 0.4), C('#9e0f2e', 1, 1 - f * f), 0); }
  if (n('stun') > 0) for (let i = 0; i < 3; i++) { const a = t * 3 + i * TAU / 3, sx = Math.cos(a) * 28, sy = -bh * k - 10 + Math.sin(a) * 7; ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); poly(ctx, [0, -6, 2, -2, 6, -1, 2, 2, 3, 6, 0, 3, -3, 6, -2, 2, -6, -1, -2, -2], C('#f2c14e'), 1.2); ctx.restore(); }
  if (n('vulnerable') > 0) { const s = C('#b3263a'); line(ctx, [-bw * 0.1 * k, -bh * k * 0.5, -bw * 0.02 * k, -bh * k * 0.58, -bw * 0.1 * k, -bh * k * 0.66, 0, -bh * k * 0.74], s, 2.2); line(ctx, [bw * 0.12 * k, -bh * k * 0.4, bw * 0.05 * k, -bh * k * 0.47, bw * 0.13 * k, -bh * k * 0.54], s, 2.2); }
  if (n('marked') > 0) { const cy = -bh * k * 0.5, r = Math.min(bw, bh) * k * 0.42 + Math.sin(t * 4) * 2; ctx.save(); ctx.translate(0, cy); ctx.rotate(t * 0.8); ctx.strokeStyle = C('#d63a4e', 1, 0.9); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, r, 0.3, Math.PI - 0.3); ctx.arc(0, 0, r, Math.PI + 0.3, TAU - 0.3); ctx.stroke(); ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6)); ctx.lineTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7)); } ctx.stroke(); ctx.restore(); }
  if (n('regen') > 0) for (let i = 0; i < 2; i++) { const f = (t * 0.7 + i * 0.5) % 1; ctx.fillStyle = C('#7fcf8a', 1, 1 - f); const x = (i ? 18 : -22) * k, y = -bh * k * 0.4 - f * 40; ctx.fillRect(x - 1.5, y - 5, 3, 10); ctx.fillRect(x - 5, y - 1.5, 10, 3); }
  if (n('charge') > 0) { const c = C('#e8f542'); const x0 = -bw * 0.35 * k; line(ctx, [x0, -bh * k * 0.7, x0 - 6, -bh * k * 0.62, x0 + 2, -bh * k * 0.58, x0 - 5, -bh * k * 0.48], c, 2); }
  if (n('hidden') > 0) {
    const hh = bh * k, ww = bw * k * 0.62;
    ctx.beginPath(); ctx.moveTo(-ww * 0.5, 0); ctx.bezierCurveTo(-ww * 0.7, -hh * 0.5, -ww * 0.45, -hh * 1.0, 0, -hh * 1.02); ctx.bezierCurveTo(ww * 0.45, -hh * 1.0, ww * 0.7, -hh * 0.5, ww * 0.5, 0);
    for (let i = 0; i < 6; i++) ctx.lineTo(ww * 0.5 - (i + 0.5) * ww / 6, (i % 2 ? 6 : -4) + Math.sin(t * 3 + i) * 2);
    ctx.closePath(); ctx.fillStyle = C('#1a1226', 1, 0.9); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C('#6e5a88'); ctx.stroke();
    ctx.fillStyle = C(COL.lamp); ctx.font = `bold ${Math.round(hh * 0.42)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, -hh * 0.5 + Math.sin(t * 2.5) * 3);
  }
}

// ------------------------------------------------------------------ bodies. Local coords: feet at (0,0), facing LEFT (-x), up is -y.
const lt = (A, k = 1.3) => C(A.col, k), dkc = (A, k = 0.62) => C(A.col, k);

function dome(ctx, A) {
  const t = A.t, b = A.b, sq = 1 + b * 0.04, rx = 62 * (1 - b * 0.025), ry = 70 * sq, pan = A.id === 'bedpan_slime';
  if (pan) {
    ell(ctx, 4, -6, 74, 13, C('#d8d4c8'), 2.5); ell(ctx, 4, -9, 58, 8, C('#b9b5a8'), 0);
    poly(ctx, [66, -10, 92, -14, 94, -6, 70, -2], C('#d8d4c8'), 2.5); // handle
  }
  const wob = Math.sin(t * 2.6) * 3;
  ctx.beginPath(); ctx.moveTo(-rx, -8);
  ctx.bezierCurveTo(-rx - 6, -ry * 1.28, rx + 6, -ry * 1.28, rx, -8);
  ctx.quadraticCurveTo(rx * 0.7, 4 + wob, rx * 0.4, -3); ctx.quadraticCurveTo(rx * 0.1, 5 - wob, -rx * 0.25, -3); ctx.quadraticCurveTo(-rx * 0.6, 4 + wob, -rx, -8);
  fs(ctx, lt(A, 1.0), 3);
  ell(ctx, -rx * 0.35, -ry * 0.72, rx * 0.28, ry * 0.12, C('#fff', 1, 0.28), 0, -0.4);
  circ(ctx, rx * 0.3, -ry * 0.38 - Math.sin(t) * 2, 5, C(A.col, 1.4, 0.7), 1.2); circ(ctx, -rx * 0.55, -ry * 0.3 + Math.sin(t * 1.3) * 2, 3.5, C(A.col, 1.4, 0.7), 1.2);
  seam(ctx, [10, -ry * 0.96, 16, -ry * 0.7, 8, -ry * 0.45, 14, -ry * 0.2], 8, 5); staple(ctx, 12, -ry * 0.58, 0.3); staple(ctx, 13, -ry * 0.32, -0.2);
  bandage(ctx, -rx * 0.55, -ry * 0.55, 22, 11, -0.5);
  eye(ctx, -26, -ry * 0.48, 7, -1, 0, A.blink); eye(ctx, -4, -ry * 0.5, 7, -1, 0, A.blink);
  mouthStitch(ctx, -17, -ry * 0.3, 24, 3, INK, 5);
}

function tall(ctx, A) {
  const R = A.id === 'the_resident', t = A.t, b = A.b, sway = Math.sin(t * 1.4) * 1.5, c = A.col;
  rect(ctx, -19, -58, 14, 56, C(R ? '#46505e' : c, 0.7), 3); rect(ctx, 5, -58, 14, 56, C(R ? '#46505e' : c, 0.7), 3);
  rect(ctx, -25, -7, 21, 8, C('#2b2622'), 3); rect(ctx, 4, -7, 21, 8, C('#2b2622'), 3);
  ctx.save(); ctx.translate(sway, 0);
  const hy = -128 + b * 1.2;
  if (R) poly(ctx, [-27, -56, 27, -56, 30, -34, 26, -112 + b, 12, -122, -12, -122, -26, -112 + b, -30, -34].slice(0, 16), C('#eef0ea'), 3);
  else poly(ctx, [-27, -56, 27, -56, 22, -114 + b, 10, -121, -10, -121, -22, -114 + b], C(c), 3);
  if (R) { poly(ctx, [-30, -34, 30, -34, 27, -56, -27, -56], C('#eef0ea'), 3); }
  seam(ctx, [0, -120, 0, -60], 8, 4.5, C(INK, 1, 0.7)); circ(ctx, 0, -100, 2, C('#c9b48a')); circ(ctx, 0, -84, 2, C('#c9b48a'));
  rect(ctx, 8, -106, 14, 12, C(R ? '#dfe3dc' : c, 0.85), 1.5, 1.8); // pocket
  line(ctx, [11, -106, 12, -112], C('#c0392b'), 2.4); line(ctx, [16, -106, 16, -113], C('#2c5aa0'), 2.4);
  if (R) { // stethoscope
    ctx.strokeStyle = ink(); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-10, -121); ctx.quadraticCurveTo(-14, -80, 0, -78); ctx.quadraticCurveTo(14, -80, 10, -121); ctx.stroke();
    ctx.strokeStyle = C('#8a8f95'); ctx.lineWidth = 2.6; ctx.stroke(); circ(ctx, 0, -77, 5, C('#c9ced0'), 2);
  }
  // head
  circ(ctx, 0, hy, 17, C('#dcc8a6'), 2.8);
  if (R) { ctx.beginPath(); ctx.arc(0, hy - 2, 17.5, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(10, hy - 12); ctx.closePath(); fs(ctx, C('#3a2a22'), 2); }
  else { poly(ctx, [-17, hy - 5, 0, hy - 24, 17, hy - 5, 11, hy - 8, -11, hy - 8], C('#e8ece6'), 2.4); line(ctx, [-4, hy - 17, 4, hy - 17], C('#b3263a'), 2); line(ctx, [0, hy - 20, 0, hy - 14], C('#b3263a'), 2); }
  if (R) { rect(ctx, -15, hy - 5, 13, 10, C('#fff', 1, 0.2), 2, 2); rect(ctx, 2, hy - 5, 13, 10, C('#fff', 1, 0.2), 2, 2); line(ctx, [-2, hy - 1, 2, hy - 1], ink(), 2); dots(ctx, -9, hy, 2.2, A.blink); dots(ctx, 8, hy, 2.2, A.blink); }
  else { dots(ctx, -8, hy - 1, 2.4, A.blink); dots(ctx, 7, hy - 1, 2.4, A.blink); rect(ctx, -9, hy + 6, 18, 8, C('#e8ece6', 1, 0.9), 3, 1.8); line(ctx, [-9, hy + 10, -14, hy + 6], ink(), 1.4); }
  mouthStitch(ctx, -1, hy + 9, 12, R ? 2 : 0, INK, 3);
  // arms
  const ay = Math.sin(t * 1.8) * 2;
  if (R) {
    limb(ctx, [-22, -108, -44, -96 + ay, -56, -88 + ay], C('#eef0ea'), 8);
    rect(ctx, -84, -118 + ay, 30, 40, C('#e8dcc4'), 2, 2.2); // card holding the player silhouette
    circ(ctx, -69, -106 + ay, 5, C(INK, 1, 0.85), 0); poly(ctx, [-76, -86 + ay, -73, -99 + ay, -65, -99 + ay, -62, -86 + ay], C(INK, 1, 0.85), 0);
    mouthStitch(ctx, -69, -106 + ay, 6, 1.5, '#e8dcc4', 2);
  } else {
    limb(ctx, [-22, -108, -42, -92 + ay, -52, -86 + ay], C(c), 8);
    ctx.save(); ctx.translate(-62, -92 + ay); ctx.rotate(-0.12); rect(ctx, -15, -22, 30, 42, C('#b79a6a'), 2, 2.4); rect(ctx, -10, -26, 20, 7, C('#9a9a98'), 2, 2); rect(ctx, -11, -15, 22, 31, C('#ece4cf'), 0, 1.2); for (let i = 0; i < 4; i++) line(ctx, [-8, -8 + i * 7, 8 - (i % 2) * 4, -8 + i * 7], C(INK, 1, 0.55), 1.4); ctx.restore();
  }
  limb(ctx, [22, -108, 32, -78, 30, -56 + ay], C(R ? '#eef0ea' : c), 8); circ(ctx, 30, -54 + ay, 5, C('#dcc8a6'), 2);
  ctx.restore();
}

function cylinder(ctx, A) {
  const t = A.t;
  rect(ctx, -46, -16, 92, 16, C('#6d6a62'), 4, 3); rect(ctx, -40, -22, 80, 8, C('#8a867a'), 3, 2.4); for (const px of [-36, -12, 12, 36]) circ(ctx, px, -8, 2, C('#b9b4a6'), 1.2);
  jar(ctx, 0, -22, 70, 112, A.col, 0.8, t, {
    r: 6, lidCol: '#8a867a', inner: (c2) => {
      const pts = []; for (let i = 0; i < 12; i++) pts.push(-26 + i * 4.8, -66 + Math.sin(i * 0.8 + t * 2.4) * 14 + (i > 7 ? (i - 7) * 5 : 0));
      limb(c2, pts, C('#7c2f26'), 14); line(c2, pts, C('#a64a3a'), 8); line(c2, pts, C('#c9705a', 1, 0.6), 2.4);
      circ(c2, pts[0], pts[1], 8, C('#7c2f26'), 2); circ(c2, pts[0] - 3, pts[1] - 3, 2, C('#f3ecd8'), 0); circ(c2, pts[0] + 3, pts[1] - 3, 2, C('#f3ecd8'), 0); ell(c2, pts[0] - 7, pts[1] + 2, 3, 2, C('#2a0f0c'), 0);
      for (let i = 2; i < 10; i += 3) line(c2, [pts[i * 2], pts[i * 2 + 1] - 7, pts[i * 2], pts[i * 2 + 1] + 7], C('#5a1c16', 1, 0.7), 1.4);
    },
  });
  rect(ctx, 26, -82, 12, 30, C('#e8dcc4'), 1, 1.6); line(ctx, [28, -76, 36, -76], C(INK, 1, 0.5), 1.4); line(ctx, [28, -70, 36, -70], C(INK, 1, 0.5), 1.4); // label
  seam(ctx, [-34, -131, -20, -126, -6, -131, 8, -126, 22, -131, 34, -127], 7, 4); staple(ctx, -6, -126, 0.2);
  line(ctx, [-6, -132, -16, -142, -30, -140], C('#a98a4a'), 2);
}

function stilts(ctx, A) {
  const t = A.t, b = A.b, c = A.col, step = Math.sin(t * 1.8) * 5;
  const lean = -10 + A.att * -8;
  // crutches
  limb(ctx, [-6 + lean, -108, -16 + step, -60, -22 + step * 1.3, -6], C('#9a7a56'), 4); circ(ctx, -23 + step * 1.3, -4, 5, C('#2b2622'), 2);
  limb(ctx, [6 + lean, -104, 16 - step, -60, 24 - step * 1.3, -6], C('#9a7a56'), 4); circ(ctx, 25 - step * 1.3, -4, 5, C('#2b2622'), 2);
  rect(ctx, -14 + lean, -116, 22, 7, C('#7c6040'), 3, 2); rect(ctx, 4 + lean, -112, 20, 7, C('#7c6040'), 3, 2);
  ctx.save(); ctx.translate(lean * 0.4, 0);
  poly(ctx, [-26 + lean, -126 + b, 28 + lean * 0.5, -118 + b, 8, -62, -10, -60], C(c), 3);
  bandage(ctx, 2 + lean * 0.5, -96, 26, 12, 0.5); bandage(ctx, 0 + lean * 0.4, -78, 20, 10, -0.3);
  seam(ctx, [-18 + lean, -124, -4, -98, 0, -68], 8, 4.5); staple(ctx, -8 + lean * 0.6, -106, 0.5);
  // head wrapped
  circ(ctx, -10 + lean, -139 + b, 15, C('#d8c6a2'), 2.8);
  wrap(ctx, -24 + lean, -144 + b, 4 + lean, -140 + b, 24, '#e9e0c9', 4);
  dots(ctx, -17 + lean, -138 + b, 2.2, A.blink); eye(ctx, -2 + lean, -139 + b, 3.2, -0.6, 0, A.blink);
  mouthStitch(ctx, -10 + lean, -128 + b, 10, 2, INK, 3);
  // sling arm
  poly(ctx, [-24 + lean, -114, -34 + lean, -92, -8, -80, 4, -104], C('#e9e0c9'), 2.4);
  ctx.restore();
}

function wings(ctx, A) {
  const t = A.t, c = A.col, hover = -78 + Math.sin(t * 3) * 7, fl = Math.sin(t * 17);
  ell(ctx, 0, -2, 38 - hover * 0.06 * 0, 7, C('#000', 1, 0.25), 0);
  ctx.save(); ctx.translate(0, hover);
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(s * 12, -14); ctx.rotate(s * (-0.7 + fl * 0.28));
    ell(ctx, s * 38, -10, 44, 26, C('#efe3c0', 1, 0.95), 2.6, s * 0.1); ell(ctx, s * 34, -8, 30, 16, C(c, 1.1, 0.4), 0, s * 0.1);
    for (const [px, py, pr] of [[26, -10, 9], [48, -16, 6], [44, 2, 5]]) { glow(ctx, s * px, py, pr * 1.8, c, 0.4); circ(ctx, s * px, py, pr, C(c), 1.6); }
    line(ctx, [s * 6, -4, s * 40, -14, s * 70, -14], C(INK, 1, 0.55), 1.2);
    ctx.restore();
  }
  ell(ctx, 0, 0, 22, 30, C('#a97a48'), 3); for (let i = 0; i < 3; i++) ell(ctx, 0, -8 + i * 11, 20 - i * 2, 4, C('#6b4a2b'), 0);
  circ(ctx, 0, -32, 15, C('#c49864'), 2.8);
  line(ctx, [-6, -44, -16, -62 + Math.sin(t * 4) * 3, -26, -64], ink(), 2.2); line(ctx, [6, -44, 14, -62 - Math.sin(t * 4) * 3, 24, -66], ink(), 2.2);
  eye(ctx, -6, -32, 5.5, -1, 0, A.blink, '#b3263a'); eye(ctx, 7, -32, 5.5, -1, 0, A.blink, '#b3263a');
  // thermometer stinger
  ctx.save(); ctx.translate(-4, 30); ctx.rotate(0.15); rect(ctx, -3, 0, 6, 24, C('#eef3f2'), 3, 1.8); rect(ctx, -1.2, 8, 2.4, 14, C('#c0392b'), 0, 0); circ(ctx, 0, 26, 4, C('#c0392b'), 1.6); ctx.restore();
  seam(ctx, [-20, 8, 20, 6], 6, 3.5);
  ctx.restore();
}

function striped(ctx, A) {
  const t = A.t, b = A.b, c = A.col, sw = Math.sin(t * 1.3) * 2;
  ctx.save(); ctx.translate(sw * 0.4, 0);
  rect(ctx, -24, -64, 48, 62, C(c), 6, 3); rect(ctx, -29, -118 + b, 58, 60, C(c), 8, 3);
  for (let i = 0; i < 9; i++) { const y = -2 - i * 7.2; line(ctx, [-24, y - 2, 24, y + 1], C(c, 0.78), 2.6); }
  for (let i = 0; i < 8; i++) { const y = -62 - i * 7; line(ctx, [-29, y - 1, 29, y + 2], C(c, 0.78), 2.6); }
  rect(ctx, -26, -64, 52, 5, C(c, 0.7), 2, 2);
  // head
  circ(ctx, 0, -134 + b, 17, C(c, 0.98), 3);
  for (let i = 0; i < 4; i++) line(ctx, [-16, -144 + i * 6 + b, 15, -140 + i * 6 + b], C(c, 0.78), 2.4);
  rect(ctx, -12, -139 + b, 24, 8, C(INK, 1, 0.92), 3, 0); dots(ctx, -6, -135 + b, 2, A.blink, '#f3ecd8'); dots(ctx, 6, -135 + b, 2, A.blink, '#f3ecd8');
  // arms
  limb(ctx, [-29, -108, -46, -84 + Math.sin(t * 2) * 3, -40, -62], C(c), 9); limb(ctx, [29, -108, 44, -84, 40, -66], C(c), 9);
  // trailing strips
  for (let i = 0; i < 4; i++) { const x0 = -10 + i * 9, ph = t * 2 + i; limb(ctx, [x0, -30, x0 + Math.sin(ph) * 6, -16, x0 - 8 + Math.sin(ph + 1) * 8, -4], C(c, 0.95), 3.4); }
  line(ctx, [-26, -96, -52, -108 + Math.sin(t * 2.4) * 4, -66, -102 + Math.sin(t * 3) * 6], C(c), 3.4);
  staple(ctx, 14, -90, 0.4); staple(ctx, -16, -48, -0.3); seam(ctx, [4, -116, 8, -100, 2, -84], 8, 4);
  ctx.restore();
}

function capsules(ctx, A) {
  const t = A.t, n = Math.max(3, Math.min(8, A.def && A.def.art.count || 5)), c = A.col;
  const pal = [c, '#e8dcc4', '#8fbf6a', '#e8a24a', '#7fa8d8', '#b87fd0'];
  for (let i = 0; i < n; i++) {
    const a = t * 0.9 + i * TAU / n, rx = 48, ry = 24, x = Math.cos(a) * rx, y = -66 + Math.sin(a) * ry + Math.sin(t * 2 + i) * 4, depth = Math.sin(a);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a * 0.8 + i); const sc = 0.9 + depth * 0.12; ctx.scale(sc, sc);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-20, -9, 40, 18, 9) : ctx.rect(-20, -9, 40, 18); ctx.fillStyle = C(pal[(i + 1) % 2 ? 1 : 0]); ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = C(pal[i % pal.length]); ctx.fillRect(-20, -9, 20, 18); ctx.restore();
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-20, -9, 40, 18, 9) : ctx.rect(-20, -9, 40, 18); ctx.lineWidth = 2.4; ctx.strokeStyle = ink(); ctx.stroke();
    line(ctx, [-14, -5, -4, -5], C('#fff', 1, 0.6), 2.2); line(ctx, [0, -9, 0, 9], ink(), 1.6);
    dots(ctx, -9, 1, 1.8, A.blink); dots(ctx, 8, 1, 1.8, A.blink); if (i % 2) mouthStitch(ctx, -1, 5, 5, 1, INK, 0);
    ctx.restore();
  }
  line(ctx, [-30, -20, -10, -50, 14, -50, 30, -22], C(INK, 1, 0.25), 1);
  for (let i = 0; i < 3; i++) { const f = (t * 0.5 + i * 0.33) % 1; circ(ctx, -36 + i * 36, -106 + f * 70, 2.2, C('#e8dcc4', 1, 1 - f), 0); }
  ell(ctx, 0, -2, 44, 6, C('#000', 1, 0.25), 0);
}

function bellows(ctx, A) {
  const t = A.t, c = A.col, ex = 1 + Math.sin(t * 1.6 + (A.att < 0 ? 1.5 : 0)) * 0.05 + Math.max(0, -A.att) * 0.1;
  rect(ctx, -34, -14, 14, 14, C('#6d6a62'), 3, 2.4); rect(ctx, 20, -14, 14, 14, C('#6d6a62'), 3, 2.4);
  const r = 60 * ex, cy = -70;
  circ(ctx, 0, cy, r, C(c), 3.2);
  // ribs
  for (let i = -3; i <= 3; i++) { const x = i * r / 3.6, h = Math.sqrt(Math.max(0, r * r - x * x)) * 0.98; line(ctx, [x, cy - h, x * 1.04, cy, x, cy + h], C(c, 0.72), 3); line(ctx, [x + 2.5, cy - h + 3, x * 1.04 + 2.5, cy, x + 2.5, cy + h - 3], C(c, 1.35, 0.6), 1.4); }
  ctx.beginPath(); ctx.arc(0, cy, r, 0, TAU); ctx.lineWidth = 3.2; ctx.strokeStyle = ink(); ctx.stroke();
  // porthole + gauge
  circ(ctx, -8, cy - 6, 20, C('#2b3a40'), 3); circ(ctx, -8, cy - 6, 15, C('#9fd0d6', 1, 0.5), 1.4);
  const lung = 0.5 + 0.5 * Math.sin(t * 1.6); ell(ctx, -8, cy - 6, 5 + lung * 6, 8 + lung * 4, C('#d98a98', 1, 0.8), 1.2);
  circ(ctx, 34, cy - 30, 10, C('#e8dcc4'), 2.4); line(ctx, [34, cy - 30, 34 + Math.cos(t * 1.6 - 1) * 7, cy - 30 + Math.sin(t * 1.6 - 1) * 7], C('#b3263a'), 1.8);
  for (let i = 0; i < 8; i++) circ(ctx, Math.cos(i * 0.78 + 0.2) * (r - 5), cy + Math.sin(i * 0.78 + 0.2) * (r - 5), 2, C('#c9ced0'), 1);
  // hose
  const hs = Math.sin(t * 1.6) * 3;
  limb(ctx, [-r + 6, cy + 12, -r - 22, cy + 38 + hs, -r - 12, -8, -r - 36, -22, -r - 52, -6], C('#5e6c70'), 8);
  for (let i = 0; i < 5; i++) { const f = i / 5; line(ctx, [-r - 22 + f * 10 - 4, cy + 38 + hs - f * 30, -r - 22 + f * 10 + 4, cy + 38 + hs - f * 30 - 2], C(INK, 1, 0.4), 1.4); }
  poly(ctx, [-r - 60, -12, -r - 44, -14, -r - 42, 0, -r - 62, 2], C('#d8d4c8'), 2.2); // mask
  seam(ctx, [10, cy - r, 18, cy - r * 0.5, 12, cy], 8, 4.5); staple(ctx, 16, cy - r * 0.7, 0.4);
}

function tail(ctx, A) {
  const t = A.t, c = A.col, b = A.b, sn = A.att * -10;
  // tail zigzag with X stitches
  const tp = []; for (let i = 0; i < 9; i++) tp.push(40 + i * 12, -24 - Math.sin(i * 0.9 + t * 4) * 7 - i * (i > 4 ? 3 : 1) + (i % 2 ? 5 : -5) * 0.6);
  limb(ctx, tp, C('#d6c9a8'), 3.2);
  for (let i = 1; i < 9; i += 2) { const x = tp[i * 2], y = tp[i * 2 + 1]; line(ctx, [x - 3, y - 3, x + 3, y + 3], ink(), 1.6); line(ctx, [x + 3, y - 3, x - 3, y + 3], ink(), 1.6); }
  // legs
  const w = Math.sin(t * 7) * (A.att ? 3 : 2);
  for (const [lx, o] of [[-30, 0], [-12, 1.6], [20, 3.2], [38, 4.8]]) rect(ctx, lx - 4 + Math.sin(t * 7 + o) * 2, -16, 8, 15, C(c, 0.8), 3, 2.2);
  ell(ctx, 4 + sn * 0.3, -36 + b * 0.8, 48, 27 - b * 0.6, C(c), 3);
  ell(ctx, 4, -26, 40, 14, C(c, 1.25, 0.6), 0);
  // snout & head
  poly(ctx, [-34 + sn, -56, -64 + sn, -34, -36 + sn, -20, -20 + sn, -34], C(c, 1.05), 3);
  circ(ctx, -66 + sn, -33, 4, C('#d96a8a'), 1.8);
  poly(ctx, [-30 + sn, -58, -24 + sn, -78, -12 + sn, -60], C(c, 0.85), 2.6); poly(ctx, [-12 + sn, -58, -2 + sn, -76, 6 + sn, -54], C(c, 0.85), 2.6);
  poly(ctx, [-27 + sn, -58, -24 + sn, -72, -17 + sn, -59], C('#d9a0a8'), 0);
  eye(ctx, -38 + sn, -42, 4.6, -1, 0, A.blink, INK, '#f3ecd8');
  for (const dy of [-3, 3]) line(ctx, [-60 + sn, -33 + dy, -82 + sn, -38 + dy * 2.4], C(INK, 1, 0.8), 1.2);
  // stitched seam over back and X stitches
  seam(ctx, [-24, -62, -6, -64, 14, -62, 34, -54], 7, 5); staple(ctx, 10, -63, 0.1);
  bandage(ctx, 22, -42, 22, 11, 0.4);
  mouthStitch(ctx, -52 + sn, -26, 14, 2, INK, 3);
}

function lamp(ctx, A) {
  const t = A.t, b = A.b, c = A.col, fl = 1 + Math.sin(t * 9) * 0.05 + Math.sin(t * 5.3) * 0.04, sw = Math.sin(t * 1.5) * 3;
  glow(ctx, 0, -146, 60 * fl, A.def && A.def.art.glow || '#f2e6a0', 0.55);
  // robe
  ctx.beginPath(); ctx.moveTo(-18, -122); ctx.quadraticCurveTo(-30, -60, -40 + sw, -4); for (let i = 0; i < 6; i++) ctx.lineTo(-40 + sw + (i + 0.5) * 80 / 6, i % 2 ? -4 : 3 + Math.sin(t * 3 + i) * 1.5); ctx.lineTo(40 + sw, -4); ctx.quadraticCurveTo(30, -60, 18, -122); ctx.closePath(); fs(ctx, C(c), 3);
  seam(ctx, [0, -118, 3, -80, 0, -40, 4, -8], 8, 4, C('#9fb0c0', 1, 0.8)); circ(ctx, 0, -100, 2, C('#c9b48a'), 1); circ(ctx, 0, -76, 2, C('#c9b48a'), 1);
  poly(ctx, [-18, -122, 0, -110, 18, -122, 14, -128, -14, -128], C(c, 1.3), 2.6);
  // cap cross sash
  poly(ctx, [-16, -112, -6, -112, 6, -64, -4, -64], C('#e8dcc4', 1, 0.85), 1.6);
  // lamp head
  rect(ctx, -9, -134, 18, 8, C('#6d6a62'), 2, 2.2);
  circ(ctx, 0, -150, 19, C('#fbf4c8'), 3); circ(ctx, 0, -150, 13 * fl, C('#fffbe4'), 0);
  ell(ctx, -6, -157, 5, 3, C('#fff', 1, 0.7), 0);
  rect(ctx, -9, -172, 18, 7, C('#e8e8e4'), 2, 2); line(ctx, [0, -170, 0, -166], C('#b3263a'), 2); line(ctx, [-2, -168, 2, -168], C('#b3263a'), 2);
  ctx.strokeStyle = C(INK, 1, 0.6); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-19, -150); ctx.lineTo(19, -150); ctx.moveTo(0, -169); ctx.lineTo(0, -131); ctx.stroke(); // cage lines
  // arm with syringe
  const pr = -A.att * 14;
  limb(ctx, [-18, -116, -44 + pr, -100, -62 + pr, -96], C(c, 0.9), 7);
  ctx.save(); ctx.translate(-64 + pr, -96); ctx.rotate(-0.05 + A.att * 0.3);
  rect(ctx, -38, -4, 38, 8, C('#d8f0ee', 1, 0.9), 2, 2); rect(ctx, -52, -1.5, 14, 3, C('#c9ced0'), 1, 1.4); rect(ctx, -6, -8, 4, 16, C('#c9ced0'), 1, 1.6); rect(ctx, -30, -2, 20, 4, C('#8fc4a0'), 0, 0); line(ctx, [0, 0, 12, 0], C('#c9ced0'), 2);
  ctx.restore();
  limb(ctx, [18, -116, 30, -84, 26, -62], C(c, 0.9), 7);
}

function figure(ctx, A) {
  const t = A.t, b = A.b, c = A.col, v = A.id === 'candy_volunteer', sw = Math.sin(t * 1.7) * 2;
  rect(ctx, -14, -46, 10, 44, C('#f1d9c2'), 3, 2.4); rect(ctx, 4, -46, 10, 44, C('#f1d9c2'), 3, 2.4);
  for (const x of [-19, 3]) { rect(ctx, x, -8, 17, 8, C('#fff3f0'), 3, 2.4); line(ctx, [x + 2, -3, x + 15, -3], C(c), 2); }
  // dress: alternating stripes clipped to trapezoid
  ctx.save(); ctx.translate(sw * 0.3, 0);
  ctx.beginPath(); ctx.moveTo(-18, -112 + b); ctx.lineTo(18, -112 + b); ctx.lineTo(32, -42); ctx.lineTo(-32, -42); ctx.closePath(); ctx.fillStyle = C('#fff3ec'); ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = C(c); for (let i = -4; i < 5; i += 2) ctx.fillRect(i * 7.5 - 3.75, -118, 7.5, 80); ctx.restore();
  ctx.beginPath(); ctx.moveTo(-18, -112 + b); ctx.lineTo(18, -112 + b); ctx.lineTo(32, -42); ctx.lineTo(-32, -42); ctx.closePath(); ctx.lineWidth = 3; ctx.strokeStyle = ink(); ctx.stroke();
  rect(ctx, -20, -58, 40, 6, C('#fff3ec'), 2, 2); // apron band
  // head
  circ(ctx, 0, -128 + b, 18, C('#f1d9c2'), 3);
  ctx.beginPath(); ctx.arc(0, -131 + b, 19, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(12, -134); ctx.lineTo(-14, -134); ctx.closePath(); fs(ctx, C(v ? '#c47a52' : '#7a4a32'), 2.6);
  if (v) { circ(ctx, -19, -126, 7, C('#c47a52'), 2.4); circ(ctx, 19, -126, 7, C('#c47a52'), 2.4); } else { circ(ctx, 15, -142, 9, C('#7a4a32'), 2.4); }
  poly(ctx, [-12, -146 + b, -2, -151, 8, -146, 2, -141 + b, -6, -141 + b], C('#fff3ec'), 2); // cap
  line(ctx, [-3, -149, -3, -143], C('#b3263a'), 2); line(ctx, [-6, -146, 0, -146], C('#b3263a'), 2);
  eye(ctx, -7, -127 + b, 3.6, -1, 0, A.blink); eye(ctx, 6, -127 + b, 3.6, -1, 0, A.blink);
  circ(ctx, -12, -120 + b, 3, C('#f4a0a8', 1, 0.6), 0); circ(ctx, 11, -120 + b, 3, C('#f4a0a8', 1, 0.6), 0);
  mouthStitch(ctx, -1, -117 + b, 16, 5, INK, 6);
  // candy swirl
  const hx = -52 + A.att * -12, hy = -84 + Math.sin(t * 2.2) * 3;
  limb(ctx, [-18, -104, -36, -92, hx, hy + 6], C('#f1d9c2'), 6);
  line(ctx, [hx, hy + 6, hx + 3, hy - 14], C('#e8dcc4'), 4);
  const cr = v ? 11 : 15; circ(ctx, hx + 3, hy - 22, cr, C('#fff3ec'), 2.6);
  ctx.strokeStyle = C(c); ctx.lineWidth = 3.4; ctx.beginPath(); for (let a = 0; a < 12; a += 0.4) { const rr = a * cr / 13; const px = hx + 3 + Math.cos(a + t) * rr, py = hy - 22 + Math.sin(a + t) * rr; if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke();
  limb(ctx, [18, -104, 30, -80, 28, -64], C('#f1d9c2'), 6);
  if (v) { poly(ctx, [24, -66, 34, -66, 38, -54, 20, -54], C('#c9ced0'), 2); } // tray
  else { staple(ctx, 12, -92, 0.5); seam(ctx, [-6, -110, -2, -90, -8, -70], 8, 4); }
  ctx.restore();
}

function box(ctx, A) {
  const t = A.t, c = A.col, id = A.id;
  if (id === 'defibrillator') return defib(ctx, A);
  const head = id === 'two_gurneys', roll = Math.sin(t * 2.2) * 1.2, sq = id === 'gurney_foot' ? Math.sin(t * 9) * 1.2 : 0;
  // wheels
  for (const x of [-62, -24, 28, 66]) { const wx = x + roll; ctx.save(); ctx.translate(wx, -10 + (x === 28 ? sq : 0)); circ(ctx, 0, 0, 10, C('#3a3a38'), 2.6); circ(ctx, 0, 0, 4, C('#b9b4a6'), 1.4); line(ctx, [0, 0, Math.cos(t * 3 + x) * 8, Math.sin(t * 3 + x) * 8], C('#b9b4a6'), 1.4); ctx.restore(); }
  // frame legs
  line(ctx, [-62, -20, -50, -38], C('#8a867a'), 4); line(ctx, [66, -20, 54, -38], C('#8a867a'), 4); line(ctx, [-24, -20, -10, -38], C('#8a867a'), 3); line(ctx, [28, -20, 14, -38], C('#8a867a'), 3);
  // bed: slab with raised head end on the left (head) or right (foot)
  const dir = head ? -1 : 1;
  poly(ctx, [-76, -38, 76, -38, 76, -48, 76, -52, -76, -52], C(c), 3); // mattress base
  const hp = head ? [-76, -52, -58, -76, -34, -72, -34, -52] : [76, -52, 58, -76, 34, -72, 34, -52];
  poly(ctx, hp, C(c, 0.82), 3);
  rect(ctx, -76, -56, 152, 7, C(c, 1.1), 2, 2.4);
  // sheet covered lump
  const br = A.b * 1.4;
  ctx.beginPath(); ctx.moveTo(-60, -56); ctx.bezierCurveTo(-58, -92 - br, -30, -88 - br, -14, -76); ctx.bezierCurveTo(0, -66, 10, -92 - br, 28, -84 - br); ctx.bezierCurveTo(46, -80, 54, -70, 60, -56); ctx.closePath(); fs(ctx, C('#ece6d4'), 3);
  line(ctx, [-44, -78, -38, -62], C('#c9bfa6'), 2); line(ctx, [6, -74, 12, -60], C('#c9bfa6'), 2); line(ctx, [32, -78, 38, -62], C('#c9bfa6'), 2);
  if (head) { // face pressed in the sheet
    eye(ctx, -48, -76 - br, 3.4, 0.5, 0, A.blink, INK); eye(ctx, -36, -78 - br, 3.4, 0.5, 0, A.blink, INK); mouthStitch(ctx, -42, -66, 12, -1, INK, 3);
    poly(ctx, [-58, -80, -62, -90, -54, -86], C('#3a2a22'), 1.4);
  } else {
    for (let i = 0; i < 3; i++) ell(ctx, 40 + i * 6, -84 - br + i, 4, 7, C('#dcc8a6'), 2);
    poly(ctx, [-60, -60, -52, -58, -50, -70], C('#c9bfa6'), 1.5); // dent
    line(ctx, [-70, -45, -62, -41, -56, -47], C(INK, 1, 0.7), 2);
  }
  seam(ctx, [-60, -56, -40, -62, -12, -58, 22, -66, 56, -58], 8, 4.5, C('#8b3a3a')); staple(ctx, -6, -62, 0.1); staple(ctx, 36, -64, -0.2);
  // drip bag on pole
  const px = head ? 62 : -62;
  line(ctx, [px, -48, px, -130], C('#8a867a'), 3); line(ctx, [px - 12, -130, px + 12, -130], C('#8a867a'), 3);
  rect(ctx, px - 8, -128, 16, 22, C('#c9e4e8', 1, 0.85), 5, 2); rect(ctx, px - 6, -112, 12, 5 + Math.sin(t) * 0.5, C('#d96a8a', 1, 0.8), 0, 0);
  thread(ctx, px, -106, px - dir * 6, -70, '#cfd8da', 1.6, 4);
  if (id === 'gurney_foot') { const f = (t * 3) % 1; if (f < 0.25) { line(ctx, [-76, -24, -84, -30], C('#fff', 1, 1), 1.6); line(ctx, [-78, -18, -88, -18], C('#fff', 1, 1), 1.6); } }
}
function defib(ctx, A) {
  const t = A.t, cd = typeof A.st.countdown === 'number' ? A.st.countdown : 3, c = A.col, urg = 1 - Math.min(1, cd / 4);
  for (const x of [-34, 34]) { circ(ctx, x, -9, 9, C('#3a3a38'), 2.6); circ(ctx, x, -9, 3.5, C('#b9b4a6'), 1.2); }
  rect(ctx, -52, -90, 104, 78, C(c), 6, 3.2);
  rect(ctx, -52, -100, 104, 14, C(c, 0.8), 4, 3); rect(ctx, -10, -112, 20, 14, C('#b3263a'), 4, 2.4);
  const lamp = 0.5 + 0.5 * Math.sin(t * (4 + urg * 12)); circ(ctx, 0, -105, 4.5, C('#ff7a7a', 1, 0.4 + lamp * 0.6), 1.2);
  rect(ctx, -42, -82, 62, 36, C('#1a2a22'), 3, 2.6); const gl = 0.5 + urg * 0.5; ctx.fillStyle = C('#7fe08a', 1, 0.08 + gl * 0.12); ctx.fillRect(-40, -80, 58, 32);
  const pl = [], sp = (t * 40) % 62; for (let i = 0; i < 14; i++) { const x = i * 4.4; const d = ((x - sp + 62) % 62); pl.push(-40 + x, -64 - (d > 55 ? (d - 55) * 3.2 * (d < 58 ? 1 : -1.6) : 0) - (d < 3 ? 4 : 0)); }
  line(ctx, pl, C('#9bf2a6', 1, 0.7 + gl * 0.3), 2.2); text0(ctx, '' + Math.max(0, cd), -11, -52, 9, C('#9bf2a6'));
  for (let i = 0; i < 3; i++) { circ(ctx, 28, -78 + i * 12, 4.5, C(['#b3263a', '#f2c14e', '#7fcf8a'][i]), 1.8); }
  rect(ctx, -52, -34, 104, 6, C(c, 0.7), 0, 2);
  // paddles on coiled cable
  const sw = Math.sin(t * 2) * 3 + A.att * -14;
  for (const s of [-1, 1]) {
    const bx = s * 52, px = s * 76 + (s < 0 ? sw - 10 : 0), py = -56 + (s < 0 ? 0 : 6);
    const pts = []; for (let i = 0; i <= 8; i++) { const f = i / 8; pts.push(bx + (px - bx) * f, -52 + (py + 6 + 22 * (s > 0 ? 1 : 0) + 10 - -52) * f + Math.sin(f * TAU * 2.5) * 6); }
    limb(ctx, pts, C('#2b2622'), 3.2);
    ctx.save(); ctx.translate(px, py); ctx.rotate(s * 0.2); rect(ctx, -9, -14, 18, 24, C('#c9ced0'), 4, 2.4); rect(ctx, -11, 6, 22, 7, C('#7a7870'), 3, 2.2); ctx.restore();
    if (urg > 0.4 && ((t * 8) % 1) < 0.5) { line(ctx, [px - 8, py + 14, px - 14, py + 20, px - 6, py + 22, px - 12, py + 30], C('#fff3b0'), 2); }
  }
  staple(ctx, 30, -26, 0.3); bandage(ctx, -36, -28, 26, 11, -0.3); seam(ctx, [-50, -90, -52, -60, -50, -34], 8, 4);
}
function text0(ctx, s, x, y, size, col) { ctx.fillStyle = col; ctx.font = `bold ${size}px Georgia, serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); }

function bell(ctx, A) {
  const t = A.t, c = A.col, swing = Math.sin(t * 1.3) * 0.035 + (A.st.enraged ? Math.sin(t * 4) * 0.03 : 0);
  ctx.save(); ctx.translate(0, -170); ctx.rotate(swing); ctx.translate(0, 170);
  // bell
  ctx.beginPath(); ctx.moveTo(-22, -168); ctx.bezierCurveTo(-62, -160, -52, -72, -82, -16); ctx.lineTo(-86, -6); ctx.quadraticCurveTo(0, 12 + Math.sin(t * 2) * 1.5, 86, -6); ctx.lineTo(82, -16); ctx.bezierCurveTo(52, -72, 62, -160, 22, -168); ctx.closePath(); fs(ctx, C(c), 3.6);
  ctx.beginPath(); ctx.moveTo(-84, -10); ctx.quadraticCurveTo(0, 8, 84, -10); ctx.lineWidth = 9; ctx.strokeStyle = C('#a58c4a'); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = ink(); ctx.stroke();
  ell(ctx, -34, -118, 10, 40, C('#fff', 1, 0.18), 0, 0.2);
  // patches and seams
  bandage(ctx, 44, -118, 34, 15, 0.7); bandage(ctx, -58, -60, 28, 13, -0.5, '#d6c7a6');
  seam(ctx, [-4, -168, 6, -130, -2, -96], 9, 5.5); seam(ctx, [48, -80, 30, -90, 14, -94], 8, 4.5, null, 1.6); seam(ctx, [-62, -92, -44, -84, -36, -70], 8, 4.5);
  staple(ctx, 2, -116, 0.4); staple(ctx, -52, -86, -0.6); staple(ctx, 60, -52, 0.8, 1.2);
  // face
  eye(ctx, -26, -112, 8, -1, 0.3, A.blink, '#b3263a'); eye(ctx, 12, -112, 8, -1, 0.3, A.blink, '#b3263a');
  line(ctx, [-38, -126, -16, -120], ink(), 3.4); line(ctx, [26, -126, 4, -120], ink(), 3.4);
  const mo = 5 + Math.max(0, A.att) * 7 + Math.sin(t * 2) * 1;
  ctx.beginPath(); ctx.ellipse(-8, -60, 46, mo, 0, 0, TAU); ctx.fillStyle = C('#1a0e0c'); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ink(); ctx.stroke();
  seam(ctx, [-52, -64, -36, -69, -20, -66, -4, -69, 12, -66, 28, -69, 38, -64], 5, 5, C('#d9d2bf'), 1.8);
  // clapper swinging out of the mouth
  const cx = Math.sin(t * 1.3 + 1) * 14; line(ctx, [-8, -60, cx * 0.6 - 8, -30], C('#6d6a62'), 3); circ(ctx, cx - 8, -4 + 4, 11, C('#a58c4a'), 2.8);
  ctx.restore();
  // candle crown (follows the swing loosely)
  ctx.save(); ctx.translate(0, -170); ctx.rotate(swing * 1.6); ctx.translate(0, 170);
  for (let i = 0; i < 5; i++) {
    const x = -34 + i * 17, y = -163 + Math.abs(i - 2) * 5, h = 30 + (i % 2) * 10 - Math.abs(i - 2) * 2.5;
    rect(ctx, x - 4, y - h, 8, h, C('#f1e8c8'), 2, 2.2); line(ctx, [x - 2, y - h + 2, x - 2, y - h + 12 + (i % 3) * 5], C('#fff', 1, 0.6), 1.6);
    line(ctx, [x, y - h, x, y - h - 4], ink(), 1.4);
    flame(ctx, x, y - h - 3, 0.95 + (A.st.enraged ? 0.4 : 0), t, i, true);
  }
  ctx.restore();
  limb(ctx, [-60, -64, -80, -34, -72, -6], C('#e9e0c9'), 5); // loose gauze strip on hem
}

function jarB(ctx, A) {
  const t = A.t, c = A.col, king = A.id === 'pickled_king', sl = Math.sin(t * 1.5) * 1.5;
  rect(ctx, -34, -14, 14, 14, C('#7a6a50'), 4, 2.4); rect(ctx, 20, -14, 14, 14, C('#7a6a50'), 4, 2.4);
  jar(ctx, 0, -12, 90, 112, king ? '#8aa648' : c, 0.78, t, {
    cloudy: true, glass: '#d8e8c8', lidCol: king ? '#c9a24a' : '#a58c4a', inner: (c2) => {
      if (king) {
        for (const s of [-1, 1]) { limb(c2, [s * 30, -34, s * 22, -52, s * 36, -60], C('#c8d99a'), 7); for (let i = 0; i < 4; i++) line(c2, [s * 36 + (i - 1.5) * 2, -60, s * 36 + (i - 1.5) * 3.5 + s * 2, -68], C('#c8d99a'), 2.6); }
        circ(c2, 0, -66, 22, C('#c8d99a'), 2.6); ell(c2, 0, -34, 22, 36, C('#a8c07a'), 2.6);
        eye(c2, -9, -68, 5.5, -1, 0, A.blink, INK); eye(c2, 9, -68, 5.5, -1, 0, A.blink, INK); mouthStitch(c2, 0, -54, 18, 4, INK, 5);
      } else {
        ell(c2, 0 + Math.sin(t * 1.4) * 3, -60, 24, 30, C('#b3c470'), 2.6);
        eye(c2, -10, -66, 6, -1, 0.2, A.blink, INK); eye(c2, 8, -66, 6, -1, 0.2, A.blink, INK); ell(c2, -1, -48, 9, 6 + Math.sin(t * 2) * 1.5, C('#3a2a1a'), 1.6);
        for (let i = 0; i < 4; i++) line(c2, [-12 + i * 8, -80, -10 + i * 8, -86], C('#8da05a'), 2); // pickled tufts
      }
    },
  });
  // cracked lid
  line(ctx, [-8, -125, -2, -118, -12, -112, -6, -104], ink(), 2); line(ctx, [-8, -125, 4, -126], ink(), 1.6);
  if (!king) { circ(ctx, 38, -80, 2, C(INK), 0); }
  seam(ctx, [-45, -98, -30, -92, -16, -98], 7, 4); staple(ctx, 34, -50, 0.4);
  if (king) { // crown
    ctx.save(); ctx.translate(sl * 0.2, 0);
    poly(ctx, [-32, -126, -32, -150, -16, -134, 0, -156, 16, -134, 32, -150, 32, -126], C('#e0b848'), 3);
    circ(ctx, 0, -138, 3.4, C('#b3263a'), 1.4); circ(ctx, -20, -134, 2.4, C('#7fd1e0'), 1.2); circ(ctx, 20, -134, 2.4, C('#7fd1e0'), 1.2);
    ctx.restore();
  }
  ell(ctx, 0, 1, 46, 6, C('#000', 1, 0.2), 0);
}

function hunched(ctx, A) {
  const id = A.id, t = A.t, b = A.b, c = A.col;
  if (id === 'pickled_thing') {
    ell(ctx, 0, -22 + b, 32, 24, C(c), 3); ell(ctx, -8, -34 + b, 14, 8, C('#fff', 1, 0.2), 0);
    limb(ctx, [4, -42, 2, -62, 10 + Math.sin(t * 2) * 4, -76], C(c, 0.85), 5); circ(ctx, 10 + Math.sin(t * 2) * 4, -78, 5, C(c, 1.2), 2);
    eye(ctx, -12, -26 + b, 4.5, -1, 0, A.blink); eye(ctx, 6, -28 + b, 4.5, -1, 0, A.blink); mouthStitch(ctx, -3, -14, 12, 3, INK, 3);
    poly(ctx, [18, -34, 28, -50, 34, -30], C('#cfe8e0', 1, 0.75), 2); line(ctx, [20, -34, 28, -46], C('#fff', 1, 0.7), 1.4); // glass shard
    for (const x of [-18, 12]) rect(ctx, x, -6, 9, 7, C(c, 0.8), 2, 2.2);
    return;
  }
  if (id === 'bidder') {
    const pad = 'cloak', up = Math.sin(t * 2) * 3 + (A.att > 0 ? -A.att * 10 : 0);
    ctx.beginPath(); ctx.moveTo(-34, -4); ctx.bezierCurveTo(-40, -70, -16, -92, 4, -88); ctx.bezierCurveTo(30, -84, 40, -50, 34, -4); for (let i = 0; i < 5; i++) ctx.lineTo(34 - (i + 0.5) * 13.6, i % 2 ? -4 : 3); ctx.closePath(); fs(ctx, C(c), 3);
    seam(ctx, [4, -88, 8, -60, 2, -30, 6, -6], 8, 4.5); staple(ctx, 6, -62, 0.4);
    circ(ctx, -12, -82, 14, C(c, 0.8), 2.8); ell(ctx, -16, -80, 8, 7, C('#1a1226'), 0); eye(ctx, -19, -80, 3.4, -1, 0, A.blink, '#f2c14e', '#f3ecd8'); eye(ctx, -9, -80, 3, -1, 0, A.blink, '#f2c14e', '#f3ecd8');
    // paddle held high
    limb(ctx, [8, -60, 10, -90 + up, 2, -110 + up], C(c, 0.9), 6);
    line(ctx, [2, -110 + up, 2, -124 + up], C('#8a6a42'), 4);
    ctx.save(); ctx.translate(2, -140 + up); ctx.rotate(Math.sin(t * 1.6) * 0.08); rect(ctx, -17, -16, 34, 32, C('#e8dcc4'), 3, 2.6); text0(ctx, '#' + (1 + ((t * 0.4) | 0) % 9), -8, 8, 22, C(INK)); ctx.restore();
    rect(ctx, -22, -8, 15, 8, C(c, 0.7), 3, 2.2); rect(ctx, 6, -8, 15, 8, C(c, 0.7), 3, 2.2);
    return;
  }
  // haggler
  const wv = Math.sin(t * 2) * 3 + A.att * -16;
  rect(ctx, -22, -28, 11, 28, C('#4a3a2c'), 3, 2.4); rect(ctx, 6, -28, 11, 28, C('#4a3a2c'), 3, 2.4); rect(ctx, -28, -7, 19, 8, C('#2b2622'), 3, 2.2); rect(ctx, 4, -7, 19, 8, C('#2b2622'), 3, 2.2);
  ctx.beginPath(); ctx.moveTo(-36, -30); ctx.bezierCurveTo(-40, -92 + b, 18, -122 + b, 44, -70); ctx.bezierCurveTo(50, -50, 40, -34, 34, -30); ctx.closePath(); fs(ctx, C(c), 3.2);
  ell(ctx, 14, -80, 26, 20, C(c, 0.82), 0, 0.3);
  seam(ctx, [18, -108, 28, -80, 22, -52, 26, -34], 8, 4.5); staple(ctx, 28, -80, 0.5);
  bandage(ctx, 6, -58, 22, 10, -0.4, '#d6c7a6');
  // head forward with hooked nose
  circ(ctx, -26, -86 + b, 16, C('#d6b890'), 2.8);
  poly(ctx, [-38, -86 + b, -58, -76 + b, -52, -68 + b, -42, -76 + b], C('#d6b890'), 2.6);
  poly(ctx, [-38, -100 + b, -22, -112 + b, -12, -98 + b], C('#3a2a22'), 2.2);
  eye(ctx, -30, -90 + b, 3.6, -1, 0.3, A.blink, '#7a4a2a'); line(ctx, [-36, -97 + b, -24, -94 + b], ink(), 2);
  mouthStitch(ctx, -26, -76 + b, 12, 2, INK, 3);
  // long arm with open palm
  limb(ctx, [-24, -62, -54, -48 + wv * 0.4, -80, -50 + wv, -92, -60 + wv], C(c, 0.92), 7);
  ctx.save(); ctx.translate(-94, -62 + wv); ctx.rotate(-0.3); poly(ctx, [0, 0, -6, -8, -12, -12, -10, -4, -16, -6, -10, 2, -16, 4, -8, 8, 0, 10], C('#d6b890'), 2.2); ctx.restore();
  coin(ctx, -100, -82 + wv, 6, t * 3);
  limb(ctx, [30, -64, 40, -38, 32, -28], C(c, 0.92), 6);
}

function disc(ctx, A) {
  const t = A.t, c = A.col, wb = Math.sin(t * 2.4) * 0.14, hop = Math.abs(Math.sin(t * 3.2)) * 4, rr = 42;
  const skit = (s) => Math.sin(t * 16 + s) * 3;
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const y = -34 + i * 14; const x1 = s * (rr + 8 + i * 1.5) + s * skit(i + s * 2), y1 = y + 16 + Math.abs(skit(i)) * 0.6; line(ctx, [s * (rr - 6), y, s * (rr + 10), y + 4, x1, Math.min(0, y1)], ink(), 4); line(ctx, [s * (rr - 6), y, s * (rr + 10), y + 4, x1, Math.min(0, y1)], C('#7a6a30'), 2); }
  ctx.save(); ctx.translate(0, -52 - hop); ctx.rotate(wb);
  circ(ctx, 0, 0, rr, C(c), 3.4); circ(ctx, 0, 0, rr - 7, null, 1.6); circ(ctx, 0, 0, rr - 7, C(c, 1.08), 1.6);
  for (let i = 0; i < 28; i++) { const a = i * TAU / 28; line(ctx, [Math.cos(a) * (rr - 1), Math.sin(a) * (rr - 1), Math.cos(a) * (rr - 5), Math.sin(a) * (rr - 5)], C(INK, 1, 0.45), 1.2); }
  ell(ctx, -14, -22, 14, 7, C('#fff', 1, 0.35), 0, -0.5);
  eye(ctx, -14, -4, 3.4, -1, 0, A.blink, INK); eye(ctx, 4, -5, 3.4, -1, 0, A.blink, INK);
  mouthStitch(ctx, -5, 14, 20, 3, INK, 5);
  seam(ctx, [18, -34, 26, -14, 22, 6, 28, 26], 7, 4); staple(ctx, 24, -14, 0.5);
  ctx.restore();
  ell(ctx, 0, 2, 46, 5, C('#000', 1, 0.22), 0);
}

function lure(ctx, A) {
  const t = A.t, c = A.col, bob = Math.sin(t * 1.7) * 5, b = A.b;
  ell(ctx, 0, 2, 50, 6, C('#000', 1, 0.22), 0);
  ctx.save(); ctx.translate(0, -78 + bob); ctx.rotate(Math.sin(t * 1.2) * 0.05);
  // tail fins
  poly(ctx, [40, 0, 76, -26 + Math.sin(t * 5) * 4, 70, 0, 76, 26 - Math.sin(t * 5) * 4], C(c, 0.55), 2.8);
  line(ctx, [44, 0, 70, -14, 44, 0, 70, 14], C(INK, 1, 0.5), 1.4);
  // body teardrop
  ctx.beginPath(); ctx.moveTo(-58, 8); ctx.bezierCurveTo(-60, -50, 20, -64, 46, -6); ctx.bezierCurveTo(48, 38, -8, 56, -50, 28); ctx.closePath(); fs(ctx, C('#2a3040'), 3.2);
  ctx.beginPath(); ctx.moveTo(-56, 8); ctx.bezierCurveTo(-58, 30, -30, 42, -6, 40); ctx.bezierCurveTo(-30, 28, -48, 20, -56, 8); ctx.fillStyle = C('#4a5268', 1, 0.7); ctx.fill();
  // jaw teeth
  ctx.beginPath(); ctx.moveTo(-58, 8); ctx.lineTo(-24, 14); ctx.strokeStyle = ink(); ctx.lineWidth = 3; ctx.stroke();
  for (let i = 0; i < 5; i++) { const x = -56 + i * 7; poly(ctx, [x, 9 + i * 1.2, x + 3.5, 20 + (i % 2) * 4, x + 7, 10 + i * 1.2], C('#f3ecd8'), 1.4); }
  eye(ctx, -28, -14, 9, -1, 0.1, A.blink, '#b3263a', '#f2e6a0');
  seam(ctx, [-8, -42, 4, -20, 0, 6, 10, 28], 7, 4.5, C(c, 1, 0.8)); staple(ctx, 2, -14, 0.5); bandage(ctx, 20, -24, 22, 10, -0.6);
  poly(ctx, [4, 26, 20, 46, 24, 28], C('#2a3040'), 2.4);
  ctx.restore();
  // stalk up and over to the lantern
  const lx = -74, ly = -78 + bob - 34 + Math.sin(t * 2.4) * 5, sk = [8, -128 + bob, 6, -168, -34, -178, lx, ly - 12];
  smooth(ctx, [-6, -118 + bob, 4, -168, -40, -186, lx, ly - 14], ink(), 5.5); smooth(ctx, [-6, -118 + bob, 4, -168, -40, -186, lx, ly - 14], C('#8a867a'), 2.6);
  glow(ctx, lx, ly, 46, c, 0.8 + Math.sin(t * 4) * 0.1);
  rect(ctx, lx - 9, ly - 11, 18, 22, C('#f9e6a8'), 4, 2.6); line(ctx, [lx - 9, ly, lx + 9, ly], C(INK, 1, 0.5), 1.4); rect(ctx, lx - 11, ly - 14, 22, 5, C('#6d6a62'), 2, 2); rect(ctx, lx - 11, ly + 10, 22, 5, C('#6d6a62'), 2, 2);
}

function jagged(ctx, A) {
  const t = A.t, c = A.col, b = A.b, w = Math.sin(t * 8) * (A.att ? 3 : 1.5), sn = A.att * -14;
  for (const [x, o] of [[-44, 0], [-22, 2], [26, 1], [48, 3]]) rect(ctx, x - 5 + Math.sin(t * 8 + o) * 2, -26, 10, 25, C(c, 0.62), 2, 2.4);
  // sawtooth back
  const bk = [-52, -34]; for (let i = 0; i < 9; i++) { bk.push(-46 + i * 11, -58 - (i % 2 ? 0 : 14) - Math.sin(i) * 3 + b); }
  poly(ctx, [...bk, 52, -34, 48, -20, -50, -20], C(c), 3.2);
  for (let i = 0; i < 5; i++) { const x = -34 + i * 18; poly(ctx, [x, -34, x + 14, -40, x + 12, -22, x - 2, -24], C(c, 0.8 + (i % 2) * 0.3), 2.2); circ(ctx, x + 6, -31, 1.6, C('#d6dbdc'), 1); }
  // head
  poly(ctx, [-50 + sn, -52, -78 + sn, -42, -80 + sn, -26, -52 + sn, -22, -40 + sn, -36], C(c, 1.1), 3.2);
  poly(ctx, [-76 + sn, -26, -52 + sn, -24, -54 + sn + 2, -16, -70 + sn, -14], C(c, 0.7), 2.6); // lower jaw
  for (let i = 0; i < 5; i++) { const x = -74 + i * 5 + sn; poly(ctx, [x, -26, x + 2.5, -17, x + 5, -26], C('#cfd4d6'), 1.2); }
  poly(ctx, [-44 + sn, -52, -40 + sn, -66, -32 + sn, -50], C(c, 0.8), 2.4);
  glow(ctx, -56 + sn, -41, 10, '#ff4a2b', 0.5); circ(ctx, -56 + sn, -41, 3.6, C('#ff7a4a'), 1.6);
  ctx.save(); ctx.translate(46, -36); ctx.rotate(Math.sin(t * 5) * 0.2); limb(ctx, [0, 0, 18, -8, 28, -22], C(c, 0.7), 5); ctx.restore();
  seam(ctx, [-30, -50, -10, -46, 14, -52, 36, -44], 7, 4.5, C('#2b2622')); staple(ctx, 0, -48, 0.1); staple(ctx, 24, -49, -0.1);
  // flaking rust spots
  for (const [x, y] of [[-14, -36], [10, -30], [30, -34]]) circ(ctx, x, y, 3, C('#6b3a22'), 0);
}

function balance(ctx, A) {
  const t = A.t, c = A.col, tilt = Math.sin(t * 1.5) * 0.12 + A.att * 0.12;
  rect(ctx, -32, -6, 64, 7, C('#4a3a2c'), 2, 2.6); rect(ctx, -6, -140, 12, 134, C(c, 0.82), 2, 3);
  poly(ctx, [-14, -6, 14, -6, 10, -40, -10, -40], C('#4a3a2c'), 2.6); // coat skirt
  ctx.save(); ctx.translate(0, -126); ctx.rotate(tilt);
  line(ctx, [-60, 0, 60, 0], ink(), 7); line(ctx, [-60, 0, 60, 0], C(c, 1.2), 4);
  for (const s of [-1, 1]) {
    const px = s * 60, dy = 44 + Math.sin(t * 2 + s) * 2;
    ctx.save(); ctx.translate(px, 0); ctx.rotate(-tilt);
    line(ctx, [0, 0, -18, dy, 0, 0, 18, dy], C('#bfb089'), 1.6); ctx.beginPath(); ctx.moveTo(-24, dy); ctx.quadraticCurveTo(0, dy + 22, 24, dy); ctx.closePath(); fs(ctx, C('#c9a24a'), 2.6);
    if (s < 0) { for (let i = 0; i < 4; i++) coin(ctx, -12 + i * 8, dy - 4 - (i % 2) * 5, 5, 0.1 + i * 0.4); } else { circ(ctx, 0, dy - 7, 8, C('#6d6a62'), 2.4); text0(ctx, 'kg', -6, dy - 3, 8, C('#e8dcc4')); }
    ctx.restore();
  }
  ctx.restore();
  circ(ctx, 0, -150, 4, C('#a58c4a'), 2);
  // head and tiny hat
  circ(ctx, 0, -166, 14, C('#d6b890'), 2.8); rect(ctx, -12, -184, 24, 10, C('#4a3a2c'), 2, 2.4); rect(ctx, -17, -176, 34, 4, C('#4a3a2c'), 1, 2.2);
  eye(ctx, -5, -166, 3.4, -1, 0, A.blink); eye(ctx, 5, -166, 3.4, -1, 0, A.blink); mouthStitch(ctx, 0, -158, 10, 2, INK, 3);
  seam(ctx, [0, -138, 0, -50], 9, 4, C('#e8dcc4', 1, 0.9)); staple(ctx, 0, -100, Math.PI / 2); staple(ctx, 0, -70, Math.PI / 2);
  circ(ctx, 0, -135, 5, C('#b3263a'), 2);
}

function cleaver(ctx, A) {
  const t = A.t, c = A.col, rise = A.att < 0 ? -A.att : 0, hit = A.att > 0 ? A.att : 0;
  for (const x of [-18, 18]) { limb(ctx, [x, -50, x + Math.sin(t * 2.2 + x) * 3, -26, x, -4], C('#8a867a'), 3.6); rect(ctx, x - 7, -7, 14, 6, C('#2b2622'), 3, 2.2); }
  ctx.save(); ctx.translate(0, -50); ctx.rotate(rise * 0.35 - hit * 0.15 + Math.sin(t * 1.6) * 0.03);
  ctx.beginPath(); ctx.moveTo(-50, 0); ctx.bezierCurveTo(-52, -78, 40, -88, 52, 0); ctx.closePath(); fs(ctx, C(c), 3.4);
  ctx.beginPath(); ctx.moveTo(-50, 0); ctx.bezierCurveTo(-52, -78, 40, -88, 52, 0); ctx.lineTo(50, -6); ctx.bezierCurveTo(36, -78, -46, -70, -46, -4); ctx.closePath(); ctx.fillStyle = C(c, 1.35, 0.8); ctx.fill();
  line(ctx, [-50, 2, 52, 2], C('#e6e9ea'), 3); // edge
  for (const x of [-30, 8, 34]) { poly(ctx, [x, 0, x + 3, -5, x + 6, 0], C('#16110f'), 0); }
  circ(ctx, 28, -50, 7, C('#1a1614'), 2); // hole
  rect(ctx, 50, -34, 34, 12, C('#7c6040'), 4, 2.8); circ(ctx, 58, -28, 1.8, C('#c9ced0'), 1); circ(ctx, 72, -28, 1.8, C('#c9ced0'), 1);
  eye(ctx, -16, -34, 6, -1, 0.2, A.blink, '#b3263a'); eye(ctx, -2, -35, 6, -1, 0.2, A.blink, '#b3263a');
  line(ctx, [-26, -44, -10, -40], ink(), 3);
  seam(ctx, [-38, -20, -20, -14, 0, -20, 20, -14, 40, -18], 7, 4, C('#2b2622')); staple(ctx, -8, -17, 0.1);
  ctx.restore();
  bandage(ctx, 0, -2, 20, 9, 0, '#a57a5a');
}

function bloom(ctx, A) {
  const t = A.t, c = A.col, b = A.b;
  ell(ctx, 0, -3, 70, 11, C('#3a3226'), 2.4); ell(ctx, -6, -4, 52, 6, C('#4a4030'), 0);
  const cl = [[-34, -28, 26], [8, -36, 30], [38, -24, 22], [-8, -66, 28], [-44, -58, 16], [30, -64, 18], [12, -92, 17], [-22, -90, 13]];
  for (let i = 0; i < cl.length; i++) {
    const [x, y, r] = cl[i], p = 1 + Math.sin(t * 1.8 + i * 1.3) * 0.04 + b * 0.015;
    // fuzzy halo
    circ(ctx, x, y, r * p + 4, C(c, 1.2, 0.18), 0); circ(ctx, x, y, r * p + 2, C(c, 1.1, 0.28), 0);
    circ(ctx, x, y, r * p, C(c, 0.8 + (i % 3) * 0.2), 2.4);
    circ(ctx, x - r * 0.3, y - r * 0.3, r * 0.22, C('#fff', 1, 0.3), 0);
  }
  // eyes scattered
  eye(ctx, -12, -70, 5, -1, 0, A.blink, '#f2c14e'); eye(ctx, 14, -40, 4.2, -1, 0.1, A.blink, '#f2c14e'); eye(ctx, -38, -32, 3.6, -1, 0, A.blink, '#f2c14e'); eye(ctx, 6, -94, 3.4, -1, 0, A.blink, '#f2c14e');
  mouthStitch(ctx, -6, -52, 18, 3, INK, 4);
  seam(ctx, [-26, -4, -18, -30, -2, -48], 7, 4); staple(ctx, -20, -30, 0.7); bandage(ctx, 36, -40, 20, 9, 0.8, '#d6c7a6');
  for (let i = 0; i < 6; i++) { const f = (t * 0.3 + i * 0.17) % 1; circ(ctx, Math.sin(i * 2.3 + t) * 36, -80 - f * 56, 2 + (i % 2), C('#c9d98a', 1, (1 - f) * 0.9), 0); }
}

function barrels(ctx, A) {
  const t = A.t, c = A.col, rage = typeof A.st.strength === 'number' ? Math.min(1, 0.35 + A.st.strength / 6) : 0.3, bulge = 1 + Math.sin(t * 3) * 0.02;
  const barrel = (cx, w, h, left) => {
    const bw = w * (left ? 1 : bulge * 1.04);
    ctx.beginPath(); ctx.moveTo(cx - w * 0.42, -h); ctx.quadraticCurveTo(cx - bw * 0.6, -h / 2, cx - w * 0.42, 0); ctx.lineTo(cx + w * 0.42, 0); ctx.quadraticCurveTo(cx + bw * 0.6, -h / 2, cx + w * 0.42, -h); ctx.closePath(); fs(ctx, C(left ? C('#8b5a2b') && '#8b5a2b' : c, left ? 1 - rage * 0.1 : 1), 3.2);
    if (left) { ctx.fillStyle = C('#ff4a2b', 1, rage * (0.35 + Math.sin(t * 6) * 0.1)); ctx.fill(); }
    for (let i = 1; i < 5; i++) { const x = cx - w * 0.38 + i * w * 0.19; line(ctx, [x, -h + 3, x + (x > cx ? 1 : -1) * 1.5, -h / 2, x, -3], C(INK, 1, 0.35), 1.2); }
    for (const y of [-h + 12, -h * 0.5, -12]) { const ww = w * 0.5 + (Math.abs(y + h / 2) < 6 ? 6 : 0); rect(ctx, cx - ww * 0.88, y - 4, ww * 1.76, 8, C('#5e6c70'), 2, 2.4); for (const dx of [-0.6, 0.6]) circ(ctx, cx + dx * ww, y, 1.4, C('#c9ced0'), 0.8); }
    ell(ctx, cx, -h, w * 0.42, 6, C('#a57a4a'), 2.6);
  };
  barrel(-38, 76, 108, true); barrel(40, 76, 104, false);
  // faces
  const lx = -38, rx = 40;
  line(ctx, [lx - 18, -84, lx - 4, -78], ink(), 3.4); line(ctx, [lx + 18, -84, lx + 6, -78], ink(), 3.4);
  eye(ctx, lx - 11, -72, 6, -1, 0, A.blink, '#b3263a'); eye(ctx, lx + 10, -72, 6, -1, 0, A.blink, '#b3263a');
  eye(ctx, rx - 10, -70, 5, -1, 0, A.blink); eye(ctx, rx + 10, -70, 5, -1, 0, A.blink);
  mouthStitch(ctx, lx, -52, 22, -3, INK, 5); mouthStitch(ctx, rx, -50, 18, 3, INK, 4);
  // crack in the right barrel and steam from the left
  line(ctx, [rx + 22, -96, rx + 14, -84, rx + 24, -72, rx + 16, -60], ink(), 2.2); line(ctx, [rx + 14, -84, rx + 6, -82], ink(), 1.6);
  for (let i = 0; i < 3; i++) { const f = (t * 0.8 + i * 0.33) % 1; circ(ctx, lx - 10 + i * 10, -112 - f * 34, 3 + f * 4, C('#e8dcc4', 1, (1 - f) * 0.45), 0); }
  seam(ctx, [-2, -100, 4, -70, -2, -40, 2, -4], 9, 5); staple(ctx, 1, -72, 1.4); staple(ctx, 0, -38, 1.4);
}

function columns(ctx, A) {
  const t = A.t, c = A.col, scr = (t * 22) % 16;
  rect(ctx, -26, -10, 18, 10, C('#4a3a2c'), 3, 2.4); rect(ctx, 8, -10, 18, 10, C('#4a3a2c'), 3, 2.4);
  for (const [x, w, hh] of [[-48, 46, 118], [4, 46, 124]]) {
    rect(ctx, x, -10 - hh, w, hh, C(c), 3, 3);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 2, -10 - hh + 2, w - 4, hh - 4); ctx.clip();
    for (let y = -10 - hh - 16 + scr; y < -6; y += 16) { line(ctx, [x + 2, y, x + w - 2, y], C(INK, 1, 0.35), 1); for (let k = 0; k < 4; k++) line(ctx, [x + 8 + k * 9, y + 3, x + 8 + k * 9, y + 12], C(INK, 1, 0.7), 1.6); line(ctx, [x + 5, y + 2, x + 40, y + 11], C('#b3263a', 1, 0.5), 1); }
    ctx.restore();
    line(ctx, [x + w / 2, -10 - hh + 2, x + w / 2, -10 - hh + 2], ink(), 1);
  }
  eye(ctx, -26, -96, 6.5, -1, 0.1, A.blink); eye(ctx, 28, -102, 6.5, -1, 0.1, A.blink); mouthStitch(ctx, -26, -76, 18, 3, INK, 4); mouthStitch(ctx, 28, -80, 18, -2, INK, 4);
  seam(ctx, [-2, -134, 4, -108, -2, -60, 2, -14], 8, 5); staple(ctx, 1, -100, 1.4); staple(ctx, 1, -48, 1.5);
  // clock on top
  circ(ctx, 0, -148, 20, C('#e8dcc4'), 3); for (let i = 0; i < 12; i++) { const a = i * TAU / 12; line(ctx, [Math.cos(a) * 16, -148 + Math.sin(a) * 16, Math.cos(a) * 18, -148 + Math.sin(a) * 18], ink(), 1.4); }
  line(ctx, [0, -148, Math.cos(t * 0.8) * 12, -148 + Math.sin(t * 0.8) * 12], ink(), 2.2); line(ctx, [0, -148, Math.cos(t * 9.6) * 15, -148 + Math.sin(t * 9.6) * 15], C('#b3263a'), 1.3);
  rect(ctx, -6, -172, 12, 6, C('#a58c4a'), 2, 2);
}

function candle(ctx, A) {
  const t = A.t, c = A.col, b = A.b;
  ell(ctx, 0, -6, 40, 9, C(c, 0.85), 3); // puddle
  ctx.beginPath(); ctx.moveTo(-26, -6); ctx.bezierCurveTo(-30, -60, -24, -110, -22, -134); ctx.lineTo(22, -134); ctx.bezierCurveTo(24, -110, 30, -60, 28, -6); ctx.quadraticCurveTo(0, 6, -26, -6); fs(ctx, C(c), 3.2);
  // melted blobs
  for (let i = 0; i < 5; i++) circ(ctx, -20 + i * 10 + Math.sin(i * 3) * 3, -132 + (i % 2) * 5, 11, C(c, 1.05), 2.4);
  for (const [x, l] of [[-18, 50], [-2, 70], [14, 40], [24, 28]]) { const dl = l + Math.sin(t * 1.4 + x) * 4; ctx.beginPath(); ctx.moveTo(x - 4, -130); ctx.lineTo(x + 4, -130); ctx.lineTo(x + 4, -130 + dl); ctx.arc(x, -130 + dl, 4, 0, Math.PI); ctx.lineTo(x - 4, -130); fs(ctx, C(c, 1.12), 2); }
  ell(ctx, -12, -80, 5, 36, C('#fff', 1, 0.2), 0);
  line(ctx, [0, -156, 0, -144], ink(), 2.6); flame(ctx, 0, -157, 1.15, t, 0, true);
  // face + red wax seal
  eye(ctx, -9, -112 + b, 4.4, -1, 0, A.blink); eye(ctx, 10, -112 + b, 4.4, -1, 0, A.blink); mouthStitch(ctx, 0, -98, 14, 2, INK, 4);
  circ(ctx, 4, -66, 12, C('#a82a38'), 2.6); circ(ctx, 4, -66, 7, null, 1.4); text0(ctx, 'S', 0, -62, 12, C('#f4c8cc', 1));
  // arm with stamp
  const pr = A.att * -14 + Math.sin(t * 2) * 2;
  limb(ctx, [-24, -80, -44, -70, -56 + pr, -78], C(c, 0.9), 6);
  rect(ctx, -70 + pr, -96, 12, 20, C('#4a3a2c'), 3, 2.4); rect(ctx, -74 + pr, -78, 20, 7, C('#a82a38'), 2, 2.2);
  limb(ctx, [24, -80, 40, -60, 36, -40], C(c, 0.9), 6);
  seam(ctx, [22, -124, 26, -90, 24, -30], 8, 4.5, C('#8a6a3a')); staple(ctx, 25, -100, 1.4);
  for (const x of [-18, 12]) rect(ctx, x, -6, 12, 7, C('#4a3a2c'), 3, 2.2);
}

function loupe(ctx, A) {
  const t = A.t, c = A.col, b = A.b, sw = Math.sin(t * 1.5) * 2;
  rect(ctx, -16, -40, 12, 38, C('#3a2e26'), 3, 2.4); rect(ctx, 4, -40, 12, 38, C('#3a2e26'), 3, 2.4); rect(ctx, -22, -7, 19, 8, C('#2b2622'), 3, 2.2); rect(ctx, 3, -7, 19, 8, C('#2b2622'), 3, 2.2);
  ctx.save(); ctx.translate(sw * 0.3, 0);
  poly(ctx, [-24, -42, 24, -42, 20, -112 + b, 10, -122, -10, -122, -20, -112 + b], C(c), 3);
  poly(ctx, [-24, -42, -6, -42, -8, -116, -20, -112], C(c, 0.82), 0); line(ctx, [-6, -118, -6, -44], ink(), 2);
  for (const y of [-100, -84, -68]) circ(ctx, 4, y, 2.2, C('#e8dcc4'), 1);
  poly(ctx, [-12, -124, 0, -108, 12, -124], C('#e8dcc4'), 2.2);
  // head: huge monocle
  circ(ctx, 0, -146 + b, 31, C('#a58c4a'), 3.2); circ(ctx, 0, -146 + b, 25, C('#d8ecee', 1, 0.8), 2);
  ell(ctx, 0, -146 + b, 15 + Math.sin(t * 0.7) * 1.2, 15 * (1 - 0.9 * A.blink), C('#f3ecd8'), 1.8);
  circ(ctx, -3 + Math.sin(t * 0.9) * 3, -146 + b, 8, C('#6e3a2a'), 0); circ(ctx, -3 + Math.sin(t * 0.9) * 3, -146 + b, 4.5, C(INK), 0);
  ell(ctx, -12, -158 + b, 8, 4, C('#fff', 1, 0.6), 0, -0.5);
  line(ctx, [28, -134 + b, 36, -118, 32, -100], C('#a58c4a'), 2); // chain
  circ(ctx, 32, -98, 3, C('#a58c4a'), 1.4);
  // tag on a string
  const hx = -44, ay = Math.sin(t * 2) * 3 + A.att * -12;
  limb(ctx, [-22, -108, -36, -92, hx, -78 + ay], C(c), 6);
  thread(ctx, hx, -78 + ay, hx - 4, -50 + ay, '#d6c7a6', 1.4, 3);
  ctx.save(); ctx.translate(hx - 4, -46 + ay); ctx.rotate(Math.sin(t * 2.4) * 0.15); poly(ctx, [-9, -6, 9, -6, 11, 12, -11, 12], C('#e8dcc4'), 2.2); circ(ctx, 0, -3, 1.8, C(INK), 0); line(ctx, [-6, 3, 6, 3], C(INK, 1, 0.6), 1.2); line(ctx, [-6, 7, 3, 7], C(INK, 1, 0.6), 1.2); ctx.restore();
  limb(ctx, [22, -108, 32, -78, 26, -58], C(c), 6);
  staple(ctx, 12, -80, 0.5); seam(ctx, [10, -118, 14, -96, 10, -70], 8, 4.5);
  ctx.restore();
}

function podium(ctx, A) {
  const t = A.t, c = A.col, swing = Math.sin(t * 1.8) * 0.12 + A.att * -0.8;
  poly(ctx, [-62, -4, 62, -4, 58, -92, -58, -92], C(c), 3.4);
  rect(ctx, -70, -108, 140, 20, C(c, 1.25), 3, 3.2); rect(ctx, -76, -116, 152, 10, C(c, 0.8), 3, 3);
  for (let i = -3; i <= 3; i++) line(ctx, [i * 17, -88, i * 17, -10], C(INK, 1, 0.35), 1.6);
  rect(ctx, -52, -30, 104, 26, C(c, 0.75), 2, 2.4);
  // face on the front
  eye(ctx, -22, -66, 7, -1, 0.1, A.blink, '#b3263a'); eye(ctx, 12, -66, 7, -1, 0.1, A.blink, '#b3263a'); line(ctx, [-32, -78, -14, -72], ink(), 3.4); line(ctx, [24, -78, 6, -72], ink(), 3.4);
  ctx.beginPath(); ctx.ellipse(-4, -46, 24, 8 + Math.sin(t * 2) * 1.5, 0, 0, TAU); ctx.fillStyle = C('#1a0e0c'); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = ink(); ctx.stroke();
  seam(ctx, [-28, -46, -16, -50, -4, -46, 8, -50, 20, -46], 5, 3.5, C('#e8dcc4'));
  // fringe of paddles
  for (let i = 0; i < 7; i++) { const x = -54 + i * 18, ph = Math.sin(t * 2 + i) * 0.1; ctx.save(); ctx.translate(x, -28); ctx.rotate(ph); rect(ctx, -6, 0, 12, 18, C('#e8dcc4'), 2, 2); text0(ctx, '' + ((i * 7 + ((t * 0.5) | 0)) % 9), -3, 14, 10, C(INK)); ctx.restore(); }
  // gavel arm
  ctx.save(); ctx.translate(46, -108); ctx.rotate(swing - 0.6);
  limb(ctx, [0, 0, 8, -34, 0, -60], C(c, 0.9), 11);
  ctx.translate(0, -62); ctx.rotate(-0.1); rect(ctx, -22, -14, 44, 28, C('#5a3a20'), 5, 3.2); rect(ctx, -24, -16, 8, 32, C('#c9a24a'), 2, 2.4); rect(ctx, 16, -16, 8, 32, C('#c9a24a'), 2, 2.4);
  ctx.restore();
  staple(ctx, 40, -60, 1.3); staple(ctx, -46, -60, 1.3); bandage(ctx, -52, -96, 24, 11, -0.4); seam(ctx, [-6, -108, -2, -92, -8, -76], 7, 4);
  for (let i = 0; i < 2; i++) coin(ctx, -20 + i * 16, -126, 6, t * 2 + i * 2);
}

function tophat(ctx, A) {
  const t = A.t, c = A.col, b = A.b, sw = Math.sin(t * 1.4) * 2.4, d = Math.sin(t * 1.9);
  ctx.save(); ctx.translate(sw * 0.3, 0);
  // very long arms dangling past the feet
  for (const s of [-1, 1]) {
    const x0 = s * 20, pts = [x0, -118, x0 + s * 18, -90, x0 + s * 22 + Math.sin(t * 1.3 + s) * 4, -50, x0 + s * 14 + Math.sin(t * 1.3 + s + 1) * 6, -8];
    limb(ctx, pts, C('#2a2226'), 8);
    const hx = pts[6], hy = pts[7];
    ctx.save(); ctx.translate(hx, hy + 6); ctx.rotate(Math.sin(t * 2 + s) * 0.2);
    poly(ctx, [-6, -4, 6, -4, 8, 8, 4, 14, 8, 20, 2, 26, -2, 20, -8, 24, -8, 14, -10, 8], C('#d6b890'), 2.2); line(ctx, [-3, 6, -3, 14], C(INK, 1, 0.5), 1.2);
    if (s < 0) coin(ctx, 0, 14 + Math.sin(t * 3) * 2, 7, t * 3);
    ctx.restore();
  }
  // triangle body
  poly(ctx, [-34, -22, 34, -22, 14, -126 + b, -14, -126 + b], C('#2a2226'), 3.4);
  poly(ctx, [-34, -22, 34, -22, 29, -52, -29, -52], C(c, 0.7), 0);
  poly(ctx, [-34, -22, 34, -22, 14, -126 + b, -14, -126 + b], null, 3.4);
  rect(ctx, -12, -90, 24, 6, C(c), 2, 2.2); // sash
  line(ctx, [-10, -112, -14, -90, 0, -78, 14, -90, 10, -112], C('#e0b848'), 2.4); circ(ctx, 0, -76, 6, C('#e0b848'), 2.4); line(ctx, [0, -76, 0, -80], ink(), 1.6); // watch chain
  for (const y of [-104, -56]) circ(ctx, 0, y, 2.6, C('#e0b848'), 1.2);
  seam(ctx, [-30, -24, -20, -50, -10, -90], 8, 4.5, C(c, 1, 0.9)); staple(ctx, 6, -60, 1.1);
  // head under the brim
  circ(ctx, 0, -138 + b, 17, C('#d6b890'), 2.8);
  ell(ctx, 0, -150 + b, 28, 7, C('#1c1620'), 3);
  rect(ctx, -17, -192 + b, 34, 44, C('#1c1620'), 3, 3.2); rect(ctx, -17, -158 + b, 34, 7, C(c), 0, 2.4);
  ell(ctx, 0, -192 + b, 17, 4.5, C('#2a2430'), 2.6);
  ell(ctx, -9, -176 + b, 3, 14, C('#fff', 1, 0.16), 0);
  eye(ctx, -7, -138 + b, 4.2, -1, 0.1, A.blink, '#7a4a2a'); eye(ctx, 7, -138 + b, 4.2, -1, 0.1, A.blink, '#7a4a2a');
  circ(ctx, -7, -138 + b, 8.5, null, 1.8); line(ctx, [-7, -130 + b, -10, -112], C('#e0b848'), 1.4); // monocle
  ctx.beginPath(); ctx.moveTo(-14, -128 + b); ctx.quadraticCurveTo(0, -118 + d * 0.8 + b, 14, -128 + b); ctx.strokeStyle = ink(); ctx.lineWidth = 2.2; ctx.stroke();
  for (let i = -2; i <= 2; i++) line(ctx, [i * 5, -128 + b - (2 - Math.abs(i)) * 0.1, i * 5, -122 + b], C('#f3ecd8'), 2);
  for (let i = 0; i < 3; i++) { const a = t * 1.2 + i * TAU / 3; coin(ctx, Math.cos(a) * 54, -112 + Math.sin(a) * 14 + i * 4, 6, t * 3 + i); }
  ctx.restore();
}

function torch(ctx, A) {
  const t = A.t, c = A.col, b = A.b, pt = A.att * -16 + Math.sin(t * 2.2) * 2;
  rect(ctx, -17, -50, 12, 48, C('#2a1e26'), 3, 2.4); rect(ctx, 5, -50, 12, 48, C('#2a1e26'), 3, 2.4); rect(ctx, -22, -7, 18, 8, C('#16110f'), 3, 2.2); rect(ctx, 4, -7, 18, 8, C('#16110f'), 3, 2.2);
  rect(ctx, -26, -122 + b, 52, 78, C('#7a1f2e'), 4, 3.2);
  for (const y of [-110, -92, -74, -56]) { circ(ctx, 0, y + b * 0.4, 3, C(c), 1.4); }
  line(ctx, [-2, -118, -2, -46], C(c), 2); rect(ctx, -26, -50, 52, 6, C(c), 1, 2.2);
  poly(ctx, [-26, -122 + b, -10, -128 + b, -10, -112, -26, -108], C(c, 0.9), 2); poly(ctx, [26, -122 + b, 10, -128 + b, 10, -112, 26, -108], C(c, 0.9), 2); // epaulettes
  for (let i = 0; i < 4; i++) { line(ctx, [-22 + i * 4, -120 + b, -22 + i * 4, -112 + b], C(c, 1.1), 1.6); }
  circ(ctx, 0, -138 + b, 17, C('#dcc8a6'), 2.8);
  poly(ctx, [-20, -142 + b, 20, -142 + b, 17, -156 + b, -17, -156 + b], C('#7a1f2e'), 2.8); rect(ctx, -22, -144 + b, 44, 5, C(c), 1, 2.2); circ(ctx, 0, -150 + b, 3, C(c), 1.2);
  eye(ctx, -6, -136 + b, 3.6, -1, 0, A.blink); eye(ctx, 7, -136 + b, 3.6, -1, 0, A.blink); mouthStitch(ctx, 0, -126 + b, 12, -2, INK, 3);
  // pointing arm toward the player, white glove
  limb(ctx, [-24, -110, -50, -104 + pt * 0.2, -76 + pt, -106], C('#7a1f2e'), 8);
  poly(ctx, [-76 + pt, -111, -96 + pt, -107, -78 + pt, -102, -74 + pt, -97, -80 + pt, -100], C('#f3ecd8'), 2.2); line(ctx, [-96 + pt, -107, -104 + pt, -106], C('#f3ecd8'), 3);
  // torch held in the other hand
  limb(ctx, [24, -110, 38, -84, 36, -64], C('#7a1f2e'), 8); circ(ctx, 36, -62, 5, C('#f3ecd8'), 2);
  rect(ctx, 32, -108, 7, 52, C('#6a4a2a'), 2, 2.4); poly(ctx, [28, -106, 44, -106, 40, -118, 32, -118], C('#4a3a2a'), 2.4);
  flame(ctx, 36, -118, 1.45, t, 1, true);
  seam(ctx, [-26, -90, -26, -50], 8, 3.5, C(c)); staple(ctx, 12, -66, 0.4);
}

function masksB(ctx, A) {
  const id = A.id, t = A.t, c = A.col;
  if (id === 'heckler') {
    const up = A.att * -10, tilt = Math.sin(t * 2.4) * 0.1 - A.att * 0.3;
    line(ctx, [8, 0, 6, -80, 0, -118 + up], ink(), 7); line(ctx, [8, 0, 6, -80, 0, -118 + up], C('#7c6040'), 4);
    poly(ctx, [-22, -8, 22, -8, 18, -60, -18, -60], C('#2a1e26'), 3); rect(ctx, -22, -9, 44, 6, C(c, 0.7), 1, 2.2);
    mask(ctx, 0, -138 + up, 74, 82, c, 'sneer', tilt, A);
    staple(ctx, 18, -150 + up, 0.5); seam(ctx, [-24, -166 + up, -10, -148 + up, -16, -126 + up], 7, 4);
    for (let i = 0; i < 3; i++) { const f = (t * 0.9 + i * 0.33) % 1, x = -40 - f * 100 + i * 4, y = -120 - Math.sin(f * Math.PI) * 55 + f * 80; circ(ctx, x, y, 8, C('#d63a3a'), 2.2); line(ctx, [x - 2, y - 8, x + 2, y - 11], C('#4a7a3a'), 2.4); }
    limb(ctx, [-12, -56, -30, -70, -34, -84 + up], C('#2a1e26'), 6);
    return;
  }
  if (id === 'the_diva') {
    const sw = Math.sin(t * 1.4) * 3, mo = 9 + Math.max(0, A.att) * 6 + Math.sin(t * 7) * 1.5;
    ctx.beginPath(); ctx.moveTo(-18, -112); ctx.bezierCurveTo(-34, -80, -70, -40, -66, -4); ctx.quadraticCurveTo(0, 14, 66, -4); ctx.bezierCurveTo(70, -40, 34, -80, 18, -112); ctx.closePath(); fs(ctx, C(c), 3.4);
    for (let i = -4; i <= 4; i++) line(ctx, [i * 4, -100, i * 14 + sw, -6], C(c, 0.75), 2);
    seam(ctx, [0, -112, 4, -72, 0, -30, 6, -6], 9, 6, C('#7a1f2e')); staple(ctx, 3, -80, 1.3); staple(ctx, 2, -48, 1.3); bandage(ctx, 36, -50, 26, 11, 0.8, '#e8dcc4');
    for (let i = 0; i < 6; i++) { const x = -52 + i * 21; circ(ctx, x, -12 + Math.sin(i) * 2, 3.4, C(i % 2 ? '#b3263a' : '#7fd1e0'), 1.4); }
    ell(ctx, 0, -116, 24, 8, C('#d6b890'), 2.6);
    circ(ctx, 0, -134, 15, C('#e8d0b0'), 2.8);
    ctx.beginPath(); ctx.arc(0, -138, 16, Math.PI * 1.0, Math.PI * 2.0); ctx.lineTo(16, -134); ctx.lineTo(-16, -134); ctx.closePath(); fs(ctx, C('#8a3a2a'), 2.4);
    poly(ctx, [-9, -150, -3, -170, 2, -152, 9, -168, 10, -150], C('#e0b848'), 2.4); // tiara
    eye(ctx, -6, -134, 3.2, -1, -0.2, A.blink); eye(ctx, 6, -134, 3.2, -1, -0.2, A.blink);
    ell(ctx, 0, -124, 4.5, mo * 0.5, C('#1a0e0c'), 1.8);
    for (const s of [-1, 1]) limb(ctx, [s * 24, -100, s * 44, -84 + Math.sin(t * 2 + s) * 3, s * 56, -100 + Math.sin(t * 2 + s) * 5], C('#e8d0b0'), 6);
    for (let i = 0; i < 3; i++) { const f = (t * 0.8 + i * 0.33) % 1; line(ctx, [-34 - f * 24, -128 - i * 8, -26 - f * 24, -122 - i * 8], C('#f2c14e', 1, 1 - f), 2); }
    return;
  }
  // mask_chorus: three ellipses side by side
  const kinds = ['grin', 'weep', 'blank'], xs = [-52, 0, 52], cols = [c, C(c, 0.9) && c, c];
  limb(ctx, [-40, -4, -40, -56], C('#2a1e26'), 5); limb(ctx, [0, -4, 0, -50], C('#2a1e26'), 5); limb(ctx, [40, -4, 40, -56], C('#2a1e26'), 5);
  for (let i = 0; i < 3; i++) { const bob = Math.sin(t * 1.8 + i * 2.1) * 4; ell(ctx, xs[i], -6, 22, 5, C('#000', 1, 0.2), 0); rect(ctx, xs[i] - 3, -60 + bob * 0.4, 6, 54, C('#7c6040'), 2, 2.2); mask(ctx, xs[i], -80 + bob, 56, 70, i === 1 ? C(c, 0.95) && '#c9b8e8' : i === 2 ? '#e6dcf4' : c, kinds[i], Math.sin(t * 2 + i * 1.6) * 0.14, A); }
  staple(ctx, -28, -104, 0.3); staple(ctx, 26, -100, -0.3); seam(ctx, [-24, -68, 0, -76, 24, -68], 7, 4);
  for (let i = 0; i < 3; i++) thread(ctx, xs[i], -50, xs[(i + 1) % 3], -50, '#d6c7a6', 1.2, 8);
}

function cherub(ctx, A) {
  const t = A.t, c = A.col, hover = -62 + Math.sin(t * 2.6) * 6, fl = Math.sin(t * 14) * 0.3;
  ell(ctx, 0, 2, 32, 5, C('#000', 1, 0.22), 0);
  ctx.save(); ctx.translate(0, hover);
  for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 16, -4); ctx.rotate(s * (-0.5 + fl)); ell(ctx, s * 18, -6, 24, 11, C(c, 1.1), 2.6, s * 0.4); for (let i = 0; i < 4; i++) line(ctx, [s * (8 + i * 8), -6 + i, s * (14 + i * 8), 0 + i * 2], C(c, 0.7), 1.6); ctx.restore(); }
  circ(ctx, 0, 0, 27, C(c), 3.2); ell(ctx, -9, -12, 9, 5, C('#fff', 1, 0.5), 0, -0.5);
  // halo ring
  ctx.beginPath(); ctx.ellipse(0, -36 + Math.sin(t * 3) * 2, 20, 6, 0, 0, TAU); ctx.lineWidth = 6; ctx.strokeStyle = ink(); ctx.stroke(); ctx.lineWidth = 3.4; ctx.strokeStyle = C('#f2c14e'); ctx.stroke();
  for (const [x, y] of [[-24, -6], [22, -12]]) circ(ctx, x, y, 8, C(c, 0.9), 2.2);
  eye(ctx, -9, -4, 4.8, -1, 0, A.blink); eye(ctx, 6, -5, 4.8, -1, 0, A.blink); circ(ctx, -15, 6, 3.4, C('#f4a0a8', 1, 0.7), 0);
  mouthStitch(ctx, -2, 9, 12, 3, INK, 3);
  // curls
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-10 + i * 10, -26, 6, Math.PI, TAU); ctx.strokeStyle = ink(); ctx.lineWidth = 2.6; ctx.stroke(); }
  // dart
  const dx = A.att * -26; limb(ctx, [-24, 14, -36 + dx, 20, -44 + dx, 14], C(c, 0.9), 5);
  ctx.save(); ctx.translate(-48 + dx, 12); ctx.rotate(-0.5); poly(ctx, [-12, 0, 8, -2, 8, 2], C('#f2c14e'), 2); poly(ctx, [8, -5, 18, 0, 8, 5], C('#b3263a'), 2); poly(ctx, [-12, 0, -18, -5, -16, 0, -18, 5], C('#e8dcc4'), 1.6); ctx.restore();
  seam(ctx, [10, 20, 14, 8, 10, -4], 6, 3.5); staple(ctx, 14, 8, 0.3);
  ctx.restore();
}

function puppet(ctx, A) {
  const t = A.t, c = A.col, stage = A.id === 'stagehands';
  if (stage) return stagehands(ctx, A);
  const strings = typeof A.st.strings === 'number' ? A.st.strings : 2, sw = Math.sin(t * 2) * 5, jig = Math.sin(t * 3.4) * 3;
  const hx = sw * 0.6, hy = -128;
  // control bar above
  const barY = -192; line(ctx, [-24 + sw, barY, 24 + sw, barY], C('#7c6040'), 4); line(ctx, [sw, barY, sw, barY - 12], C('#7c6040'), 3);
  const pts = [[hx, hy - 16], [hx - 26, -96 + jig], [hx + 26, -96 - jig], [hx - 14, -50], [hx + 14, -50]];
  const spots = [[0, 0], [-24, 0], [24, 0], [-12, 0], [12, 0]];
  const max = Math.max(0, Math.min(5, strings + 1));
  for (let i = 0; i < 5; i++) { if (i < max) thread(ctx, spots[i][0] + sw, barY, pts[i][0], pts[i][1], C('#d6c7a6'), 1.3, 0); else { thread(ctx, pts[i][0], pts[i][1], pts[i][0] + 3, pts[i][1] - 24, C('#d6c7a6', 1, 0.7), 1.3, 3); } }
  // stick figure body
  limb(ctx, [hx, hy + 14, hx, -64], C(c, 0.85), 6);
  limb(ctx, [hx, -112, hx - 26, -96 + jig, hx - 34, -78 + jig], C(c), 5); limb(ctx, [hx, -112, hx + 26, -96 - jig, hx + 34, -78 - jig], C(c), 5);
  limb(ctx, [hx, -64, hx - 14, -50, hx - 18 + jig, -22 + jig * 0.5], C(c), 5); limb(ctx, [hx, -64, hx + 14, -50, hx + 18 - jig, -22 - jig * 0.5], C(c), 5);
  circ(ctx, hx, -64, 5, C(c, 0.7), 2); circ(ctx, hx, -112, 5, C(c, 0.7), 2); for (const [x, y] of [[-14, -50], [14, -50], [-26, -96], [26, -96]]) circ(ctx, hx + x, y + (x < 0 ? jig * 0.3 : 0), 3, C('#a58c4a'), 1.4);
  rect(ctx, hx - 22 + jig, -24, 18, 8, C('#2b2622'), 3, 2); rect(ctx, hx + 6 - jig, -24, 18, 8, C('#2b2622'), 3, 2);
  // wooden head
  circ(ctx, hx, hy, 17, C(c, 1.12), 3); circ(ctx, hx - 5, hy - 4, 3.6, C('#fff', 1, 0.25), 0);
  eye(ctx, hx - 7, hy - 3, 4, -1, 0, A.blink); eye(ctx, hx + 6, hy - 3, 4, -1, 0, A.blink);
  line(ctx, [hx - 9, hy + 8, hx + 9, hy + 8], ink(), 1.8); line(ctx, [hx - 5, hy + 6, hx - 5, hy + 10], ink(), 1.4); line(ctx, [hx, hy + 6, hx, hy + 10], ink(), 1.4); line(ctx, [hx + 5, hy + 6, hx + 5, hy + 10], ink(), 1.4);
  staple(ctx, hx + 10, -52, 0.8); seam(ctx, [hx, -108, hx + 2, -84, hx, -66], 7, 4);
  poly(ctx, [hx - 16, hy - 10, hx, hy - 30, hx + 16, hy - 10], C('#7a1f2e'), 2.4); circ(ctx, hx, hy - 30, 3, C('#f2c14e'), 1.4);
}
function stagehands(ctx, A) {
  const t = A.t, c = A.col, pull = Math.sin(t * 1.6) * 6 + A.att * -10;
  // two figures hauling ropes, sandbag overhead
  const fig = (x, dir, ph) => {
    const lean = dir * (10 + pull * 0.5), b = Math.sin(t * 1.6 + ph) * 2;
    limb(ctx, [x, -70, x + lean * 0.4, -40, x + dir * -8, -6], C(c, 0.8), 7); limb(ctx, [x, -70, x - lean * 0.3, -38, x + dir * 16, -6], C(c, 0.8), 7);
    rect(ctx, x + dir * -14, -7, 18, 7, C('#16110f'), 3, 2); rect(ctx, x + dir * 8, -7, 18, 7, C('#16110f'), 3, 2);
    ctx.beginPath(); ctx.moveTo(x - 14, -72); ctx.lineTo(x + 14, -72); ctx.lineTo(x + 12 + lean, -116 + b); ctx.lineTo(x - 12 + lean, -116 + b); ctx.closePath(); fs(ctx, C(c), 3);
    circ(ctx, x + lean + dir * -2, -130 + b, 12, C('#bcb4a8'), 2.6); poly(ctx, [x + lean - 14, -133 + b, x + lean, -148 + b, x + lean + 12, -133 + b], C('#16110f'), 2.4); // cap
    dots(ctx, x + lean - 6 * dir * 0.2 - 4, -129 + b, 1.9, A.blink); dots(ctx, x + lean + 5, -129 + b, 1.9, A.blink);
    limb(ctx, [x + lean * 0.8, -108 + b, x + dir * -26, -112 - pull * 0.5, x + dir * -48, -134 - pull], C(c, 0.9), 6);
    seam(ctx, [x, -112, x + 2, -76], 7, 4, C('#e8dcc4', 1, 0.7)); staple(ctx, x + 4, -94, 1.2);
  };
  fig(-56, 1, 0); fig(56, -1, 1.7);
  line(ctx, [-104, -140 - pull, -72, -176, -2, -190, 70, -176, 104, -140 - pull], C('#a58c4a'), 3); // ropes up to the rig
  thread(ctx, -104, -140 - pull, 104, -140 - pull, '#a58c4a', 2.6, -8);
  const sy = -190 + Math.sin(t * 1.3) * 3;
  line(ctx, [-2, -190, 0, sy + 20], C('#a58c4a'), 2.6);
  ctx.beginPath(); ctx.moveTo(-18, sy + 22); ctx.bezierCurveTo(-34, sy + 50, -26, sy + 70, 0, sy + 72); ctx.bezierCurveTo(26, sy + 70, 34, sy + 50, 18, sy + 22); ctx.closePath(); fs(ctx, C('#b8a070'), 3);
  text0(ctx, '50', -9, sy + 52, 13, C(INK, 1, 0.7)); seam(ctx, [-20, sy + 28, 20, sy + 28], 6, 3); staple(ctx, 0, sy + 42, 0);
}

function cone(ctx, A) {
  const t = A.t, c = A.col, sw = Math.sin(t * 0.9) * 8 + A.att * -10, ly = -176;
  const lx = 24, bx = -14 + sw, by = -12;
  // light cone
  for (let i = 0; i < 3; i++) { const k = 1 - i * 0.28; ctx.beginPath(); ctx.moveTo(lx - 4, ly + 8); ctx.lineTo(lx + 4, ly + 8); ctx.lineTo(bx + 62 * k, by); ctx.lineTo(bx - 62 * k, by); ctx.closePath(); ctx.fillStyle = C(c, 1, 0.12 + i * 0.07); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(lx - 4, ly + 8); ctx.lineTo(bx - 62, by); ctx.moveTo(lx + 4, ly + 8); ctx.lineTo(bx + 62, by); ctx.strokeStyle = C(c, 0.8, 0.5); ctx.lineWidth = 1.6; ctx.stroke();
  for (let i = 0; i < 6; i++) { const f = (t * 0.2 + i * 0.17) % 1; circ(ctx, lx + (bx - lx) * f + Math.sin(i * 3 + t) * 14 * f, ly + (by - ly) * f, 1.6, C('#fff', 1, 0.6), 0); }
  ell(ctx, bx, by, 66, 14, C(c, 1, 0.55), 0); ell(ctx, bx, by, 42, 8, C('#fffbe0', 1, 0.8), 0); ell(ctx, bx, by, 20, 4, C('#fff'), 0);
  // hanging lamp housing
  line(ctx, [lx, ly - 30, lx, ly], ink(), 5); line(ctx, [lx, ly - 30, lx, ly], C('#8a867a'), 2.4);
  ctx.save(); ctx.translate(lx, ly); ctx.rotate(Math.sin(t * 0.9) * 0.05 - 0.18);
  ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(14, -2); ctx.lineTo(22, 16); ctx.lineTo(-22, 16); ctx.closePath(); fs(ctx, C('#3a3a42'), 3);
  circ(ctx, 0, 16, 12, C('#fffbe0'), 2.6); glow(ctx, 0, 16, 26, c, 0.8);
  rect(ctx, -16, -12, 32, 12, C('#4a4a54'), 3, 2.6);
  eye(ctx, -5, -6, 4, -1, 0.5, A.blink, '#b3263a'); staple(ctx, 8, -6, 0.1); line(ctx, [-22, 4, -34, 12], ink(), 3); line(ctx, [22, 4, 32, 14], ink(), 3);
  seam(ctx, [-12, 4, 12, 4], 5, 3, C('#e8dcc4'));
  ctx.restore();
  rect(ctx, 32, ly - 20, 18, 8, C('#6d6a62'), 2, 2);
}

function eyebox(ctx, A) {
  const t = A.t, c = A.col, b = A.b, look = Math.sin(t * 0.8);
  rect(ctx, -36, -10, 14, 10, C('#3a2e26'), 3, 2.4); rect(ctx, 22, -10, 14, 10, C('#3a2e26'), 3, 2.4);
  rect(ctx, -48, -92 + b, 96, 84, C(c), 6, 3.4);
  // hood
  poly(ctx, [-56, -92, 56, -92, 46, -112, -46, -112], C(c, 0.65), 3.2); line(ctx, [-50, -98, 50, -98], C(c, 1.3), 2);
  // paper scrolls on the sides
  for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 56, -64); ctx.rotate(s * 0.12 + Math.sin(t * 1.3 + s) * 0.04); rect(ctx, -9, -22, 18, 50, C('#e8dcc4'), 2, 2.2); for (let i = 0; i < 5; i++) line(ctx, [-6, -16 + i * 9, 6 - (i % 2) * 4, -16 + i * 9], C(INK, 1, 0.5), 1.4); ctx.restore(); }
  // slit with eye
  rect(ctx, -34, -62 + b, 68, 22, C('#120e18'), 10, 2.8);
  glow(ctx, look * 8 - 6, -51 + b, 26, '#c8a8ff', 0.5);
  ell(ctx, look * 8 - 6, -51 + b, 15, Math.max(1.2, 9 * (1 - 0.9 * A.blink)), C('#f0e8ff'), 1.6); circ(ctx, look * 12 - 6, -51 + b, 4.6, C('#6e5a88'), 0); circ(ctx, look * 12 - 6, -51 + b, 2.2, C(INK), 0);
  // script lines and prompts
  for (let i = 0; i < 3; i++) line(ctx, [-34, -86 + i * 5 + b, -34 + 22 + (i * 11) % 14, -86 + i * 5 + b], C('#e8dcc4', 1, 0.7), 1.6);
  text0(ctx, '...', 14, -80 + b, 14, C('#e8dcc4'));
  seam(ctx, [-46, -30, -20, -26, 8, -30, 34, -26, 46, -30], 7, 4, C('#e8dcc4')); staple(ctx, 0, -28, 0.1); bandage(ctx, 34, -80, 20, 9, 0.5);
  poly(ctx, [-14, -20, 14, -20, 10, -12, -10, -12], C(c, 0.5), 0);
}

function curtain(ctx, A) {
  const t = A.t, c = A.col, sw = Math.sin(t * 1.4) * 4, gape = A.att > 0 ? A.att * 8 : 0;
  rect(ctx, -52, -176, 104, 10, C('#a58c4a'), 3, 3); circ(ctx, -52, -171, 6, C('#a58c4a'), 2.4); circ(ctx, 52, -171, 6, C('#a58c4a'), 2.4);
  // velvet body with wavy lower edge
  ctx.beginPath(); ctx.moveTo(-50, -168); ctx.lineTo(50, -168);
  for (let i = 0; i <= 10; i++) { const x = 50 - i * 10; ctx.lineTo(x + Math.sin(t * 2 + i) * 2, -10 + (i % 2 ? 8 : 0) + Math.sin(t * 2.2 + i * 1.3) * 3); }
  ctx.closePath(); fs(ctx, C(c), 3.4);
  // dark gap between two panels showing an eye
  const gx = Math.sin(t * 0.7) * 3;
  ctx.beginPath(); ctx.moveTo(gx - 3 - gape, -166); ctx.lineTo(gx + 3 + gape, -166); ctx.lineTo(gx + 9 + gape * 1.6, -12); ctx.lineTo(gx - 9 - gape * 1.6, -12); ctx.closePath(); ctx.fillStyle = C('#0c0810'); ctx.fill();
  eye(ctx, gx, -96, 6.5, -1, 0, A.blink, '#c8a8ff', '#f3ecd8');
  for (let i = -4; i <= 4; i++) { if (Math.abs(i) < 1) continue; const x = i * 11; line(ctx, [x, -164, x + Math.sin(t * 1.4 + i) * 1.5 + (i > 0 ? 3 : -3), -12], C(c, 0.65), 3); line(ctx, [x + 4, -160, x + 4 + (i > 0 ? 3 : -3), -20], C(c, 1.3, 0.6), 1.6); }
  // gold fringe
  for (let i = 0; i < 12; i++) { const x = -48 + i * 8.8; line(ctx, [x, -10 + (i % 2 ? 4 : 0), x + Math.sin(t * 2 + i) * 1.5, 2], C('#e0b848'), 2.2); }
  line(ctx, [-50, -6, 50, -6], C('#e0b848'), 3);
  // tieback tassel
  limb(ctx, [-50, -90, -30, -84 + sw * 0.3, -14, -92], C('#e0b848'), 4); circ(ctx, -52, -88, 5, C('#e0b848'), 2); line(ctx, [-54, -88, -56, -66 + sw], C('#e0b848'), 3); for (let i = -1; i <= 1; i++) line(ctx, [-56, -66 + sw, -56 + i * 3, -54 + sw], C('#e0b848'), 2);
  seam(ctx, [30, -164, 36, -130, 28, -90, 34, -50], 8, 4.5, C('#e0b848')); staple(ctx, 33, -110, 1.3); staple(ctx, 31, -70, 1.4);
}

function clappers(ctx, A) {
  const t = A.t, c = A.col, n = Math.max(3, Math.min(6, 3 + (typeof A.st.applause === 'number' ? A.st.applause : 0)));
  const pos = [[-44, -62], [16, -78], [50, -48], [-8, -34], [-58, -104], [34, -112]];
  for (let i = 0; i < n; i++) {
    const [px, py] = pos[i], cl = Math.abs(Math.sin(t * (3 + i * 0.4) + i * 1.7)), gap = 3 + cl * 14, s = 1 - i * 0.03, rot = (i % 2 ? 0.5 : -0.4) + Math.sin(t + i) * 0.1;
    ctx.save(); ctx.translate(px, py + Math.sin(t * 1.8 + i) * 4); ctx.rotate(rot); ctx.scale(s, s);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * gap, 0);
      poly(ctx, [0, 18, side * 2, 4, side * 4, -22, side * 9, -14, side * 11, -26, side * 15, -14, side * 17, -22, side * 19, -6, side * 23, 2, side * 22, 14, side * 12, 22].map((v, k) => v), C(c, side < 0 ? 1 : 0.9), 2.4);
      line(ctx, [side * 6, 14, side * 8, -4], C(c, 0.65), 1.4); line(ctx, [side * 13, 12, side * 14, -2], C(c, 0.65), 1.4);
      ctx.restore();
    }
    if (cl < 0.1) { line(ctx, [-6, -30, -10, -38], C('#f2c14e'), 2); line(ctx, [6, -30, 10, -38], C('#f2c14e'), 2); line(ctx, [0, -32, 0, -42], C('#f2c14e'), 2); }
    ctx.restore();
  }
  // wrist cuffs/stitching tying them together
  thread(ctx, pos[0][0], pos[0][1] + 20, pos[1][0], pos[1][1] + 20, '#d6c7a6', 1.8, 12); thread(ctx, pos[1][0], pos[1][1] + 20, pos[2][0], pos[2][1] + 20, '#d6c7a6', 1.8, 10); thread(ctx, pos[3][0], pos[3][1] + 20, pos[0][0], pos[0][1] + 20, '#d6c7a6', 1.8, 8);
  eye(ctx, -22, -64, 4.4, -1, 0, A.blink); eye(ctx, 36, -80, 3.8, -1, 0, A.blink);
  staple(ctx, -2, -52, 0.7); ell(ctx, 0, 2, 56, 6, C('#000', 1, 0.2), 0);
}

function outline(ctx, A) {
  const t = A.t, c = A.col, gold = A.id === 'gold_leaf_golem', b = A.b;
  if (gold) return golem(ctx, A);
  // chalk outline figure with colour fill patches; wobbles slightly
  const w = Math.sin(t * 1.2) * 2;
  const fig = (col, lw, off) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(-14 + off, -128 + b); ctx.arc(off, -134 + b, 16, Math.PI * 0.9, Math.PI * 2.1);
    ctx.lineTo(16 + off, -118); ctx.lineTo(44 + off + w, -112); ctx.lineTo(52 + off + w, -76); ctx.lineTo(40 + off, -78); ctx.lineTo(28 + off, -90); ctx.lineTo(26 + off, -56); ctx.lineTo(30 + off, -4); ctx.lineTo(10 + off, -4); ctx.lineTo(4 + off, -54); ctx.lineTo(-6 + off, -54); ctx.lineTo(-10 + off, -4); ctx.lineTo(-30 + off, -4); ctx.lineTo(-26 + off, -56); ctx.lineTo(-28 + off, -90); ctx.lineTo(-40 + off, -78); ctx.lineTo(-52 + off - w, -76); ctx.lineTo(-44 + off - w, -112); ctx.lineTo(-16 + off, -118); ctx.closePath(); ctx.stroke();
  };
  // fill: patches clipped to the shape
  ctx.save(); fig(C(c, 0.5, 0), 0, 0); ctx.beginPath();
  ctx.moveTo(-14, -128 + b); ctx.arc(0, -134 + b, 16, Math.PI * 0.9, Math.PI * 2.1); ctx.lineTo(16, -118); ctx.lineTo(44 + w, -112); ctx.lineTo(52 + w, -76); ctx.lineTo(40, -78); ctx.lineTo(28, -90); ctx.lineTo(26, -56); ctx.lineTo(30, -4); ctx.lineTo(10, -4); ctx.lineTo(4, -54); ctx.lineTo(-6, -54); ctx.lineTo(-10, -4); ctx.lineTo(-30, -4); ctx.lineTo(-26, -56); ctx.lineTo(-28, -90); ctx.lineTo(-40, -78); ctx.lineTo(-52 - w, -76); ctx.lineTo(-44 - w, -112); ctx.lineTo(-16, -118); ctx.closePath();
  ctx.fillStyle = C('#2a2438', 1, 0.5); ctx.fill(); ctx.clip();
  const cols = ['#d63a4e', '#2c5aa0', '#6a9a4a', '#e0b848', '#8a4ab0', '#e07a2b'];
  for (let i = 0; i < 6; i++) { const x = -48 + ((i * 37 + (t * 6) % 200) % 100), y = -140 + i * 24 + Math.sin(t + i) * 4; ctx.fillStyle = C(cols[i], 1, 0.55); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y + 6); ctx.lineTo(x + 22, y + 28); ctx.lineTo(x - 6, y + 20); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  fig(C(INK), 5.5, 0); ctx.setLineDash && ctx.setLineDash([9, 6]); fig(C(c, 1.1), 3.2, 0); ctx.setLineDash && ctx.setLineDash([]);
  // a stitched-on face, a hesitant one
  eye(ctx, -6, -136 + b, 3.4, -0.5, 0.3, A.blink); eye(ctx, 7, -136 + b, 3.4, -0.5, 0.3, A.blink); mouthStitch(ctx, 0, -126 + b, 8, -1, INK, 2);
  seam(ctx, [0, -116, 2, -80, 0, -56], 8, 4.5, C(c, 1.1)); staple(ctx, 2, -90, 1.4); bandage(ctx, 36, -96, 18, 9, 0.9);
  for (let i = 0; i < 3; i++) { const f = (t * 0.4 + i * 0.33) % 1; line(ctx, [-60 + i * 55, -4 - f * 8, -52 + i * 55, -4 - f * 8], C(c, 1, 0.5 * (1 - f)), 2); }
}
function golem(ctx, A) {
  const t = A.t, c = A.col, b = A.b, flk = (i) => Math.sin(t * 0.8 + i * 1.7);
  for (const x of [-26, 14]) rect(ctx, x, -50, 24, 48, C(c, 0.82), 4, 3.2);
  rect(ctx, -34, -4, 30, 6, C(c, 0.6), 2, 2.4); rect(ctx, 8, -4, 30, 6, C(c, 0.6), 2, 2.4);
  rect(ctx, -40, -124 + b, 80, 78, C(c), 5, 3.6); rect(ctx, -52, -128 + b, 22, 40, C(c, 1.08), 5, 3.2); rect(ctx, 30, -128 + b, 22, 40, C(c, 1.08), 5, 3.2);
  rect(ctx, -58, -92, 20, 56, C(c, 0.9), 5, 3.2); rect(ctx, 38, -92, 20, 56, C(c, 0.9), 5, 3.2); circ(ctx, -48, -34, 12, C(c, 0.8), 3); circ(ctx, 48, -34, 12, C(c, 0.8), 3);
  rect(ctx, -22, -154 + b, 44, 36, C(c, 1.05), 6, 3.4);
  // beaten gold highlights and flaking polygons
  for (let i = 0; i < 8; i++) { const x = -34 + (i % 4) * 18, y = -116 + Math.floor(i / 4) * 34; poly(ctx, [x, y, x + 10, y - 2, x + 14, y + 8, x + 4, y + 14, x - 4, y + 6], C(c, 1.25 + (i % 3) * 0.08, 0.7), 1.2); }
  for (let i = 0; i < 5; i++) { const f = (t * 0.35 + i * 0.2) % 1, x = -40 + i * 20 + Math.sin(i * 5 + t) * 6, y = -100 + f * 90; ctx.save(); ctx.translate(x, y); ctx.rotate(f * 5 + i); poly(ctx, [-4, -3, 4, -4, 5, 3, -3, 4], C(c, 1.1, 1 - f * f), 1.2); ctx.restore(); }
  line(ctx, [-30, -124, -24, -108, -32, -96, -26, -80], C(INK, 1, 0.7), 2); line(ctx, [20, -108, 28, -92, 22, -76], C(INK, 1, 0.7), 2);
  // eye slits
  rect(ctx, -16, -140 + b, 12, 5, C('#120e18'), 2, 1.6); rect(ctx, 4, -140 + b, 12, 5, C('#120e18'), 2, 1.6);
  const g = 0.6 + Math.sin(t * 3) * 0.3; ctx.fillStyle = C('#fff3b0', 1, g); ctx.fillRect(-14, -139 + b, 8, 3); ctx.fillRect(6, -139 + b, 8, 3);
  mouthStitch(ctx, 0, -126 + b, 24, -2, INK, 6);
  seam(ctx, [0, -118, 0, -50], 9, 5.5, C('#7a5a1a')); staple(ctx, 0, -100, Math.PI / 2); staple(ctx, 0, -76, Math.PI / 2); seam(ctx, [-40, -90, -58, -90], 7, 4, C('#7a5a1a'));
  circ(ctx, 0, -72, 8, C('#7a5a1a'), 2); circ(ctx, 0, -72, 4, C('#e0b848'), 1.4);
}

function hat(ctx, A) {
  const t = A.t, c = A.col, b = A.b, sw = Math.sin(t * 1.3) * 2, wr = Math.sin(t * 7) * (A.att ? 0 : 1.4) + A.att * -10;
  rect(ctx, -14, -56, 9, 54, C('#1a1624'), 2, 2.4); rect(ctx, 5, -56, 9, 54, C('#1a1624'), 2, 2.4); rect(ctx, -20, -7, 16, 8, C('#0c0a10'), 3, 2.2); rect(ctx, 4, -7, 16, 8, C('#0c0a10'), 3, 2.2);
  ctx.save(); ctx.translate(sw * 0.3, 0);
  poly(ctx, [-18, -60, 18, -60, 22, -118 + b, 10, -126, -10, -126, -22, -118 + b], C(c, 1.25), 3.2);
  poly(ctx, [-18, -60, -4, -60, -4, -122, -22, -118 + b], C('#0f0d16'), 0); poly(ctx, [-4, -60, 22, -98, 18, -60], C('#0f0d16'), 0);
  poly(ctx, [-18, -60, 18, -60, 22, -118 + b, 10, -126, -10, -126, -22, -118 + b], null, 3.2);
  poly(ctx, [-10, -126, 0, -108, 10, -126], C('#e8dcc4'), 2.2); line(ctx, [0, -108, 0, -96], C('#b3263a'), 3);
  // head under the brim
  circ(ctx, 0, -142 + b, 14, C('#d6c0a0'), 2.8);
  eye(ctx, -5, -140 + b, 3.4, -1, 0.2, A.blink); eye(ctx, 6, -140 + b, 3.4, -1, 0.2, A.blink); line(ctx, [-9, -147 + b, -2, -145 + b], ink(), 2.2); line(ctx, [10, -147 + b, 3, -145 + b], ink(), 2.2);
  mouthStitch(ctx, 0, -131 + b, 12, -3, INK, 4);
  // tall hat
  ell(ctx, 0, -152 + b, 30, 7, C(c), 3); rect(ctx, -16, -214 + b, 32, 62, C(c), 3, 3.2); rect(ctx, -16, -164 + b, 32, 8, C('#7a1f2e'), 0, 2.4);
  ell(ctx, 0, -214 + b, 16, 4.5, C(c, 1.5), 2.6); ell(ctx, -8, -190 + b, 3, 20, C('#fff', 1, 0.12), 0);
  // pencil arm and notepad
  limb(ctx, [-18, -112, -38, -96, -56 + wr, -100], C(c, 1.2), 6);
  ctx.save(); ctx.translate(-56 + wr, -100); ctx.rotate(-0.5 + A.att * 0.4); rect(ctx, -3, -62, 7, 66, C('#e0b848'), 1, 2.4); poly(ctx, [-3, 4, 4, 4, 0, 14], C('#e8d4b0'), 1.8); poly(ctx, [-1, 10, 2, 10, 0, 14], C(INK), 0); rect(ctx, -3, -68, 7, 6, C('#d9788a'), 2, 2.2); ctx.restore();
  limb(ctx, [18, -112, 32, -88, 22, -72], C(c, 1.2), 6);
  rect(ctx, 14, -92, 26, 32, C('#e8dcc4'), 2, 2.4); for (let i = 0; i < 4; i++) line(ctx, [18, -86 + i * 7, 36 - (i % 2) * 7, -86 + i * 7], C(INK, 1, 0.5), 1.4); text0(ctx, '1/5', 20, -63, 8, C('#b3263a'));
  seam(ctx, [0, -96, 2, -76, 0, -62], 8, 4, C('#e8dcc4', 1, 0.8)); staple(ctx, -10, -80, 0.6);
  ctx.restore();
}

function conductor(ctx, A) {
  const t = A.t, c = A.col, b = A.b, ph = typeof A.st.baton === 'number' && A.st.baton > 0 ? A.st.baton : 1;
  const by = ph === 1 ? -178 : ph === 2 ? -128 : -84;
  const beat = Math.sin(t * (2.6 + ph * 0.8)) * (ph === 1 ? 8 : 12);
  // podium
  rect(ctx, -40, -16, 80, 16, C('#3a2a1a'), 3, 3); rect(ctx, -34, -26, 68, 12, C('#5a3a20'), 2, 2.6);
  // tailcoat
  poly(ctx, [-24, -30, 24, -30, 22, -112 + b, 12, -122, -12, -122, -22, -112 + b], C('#1c1822'), 3.2);
  poly(ctx, [-24, -30, -34, -4, -12, -30], C('#1c1822'), 3); poly(ctx, [24, -30, 34, -4, 12, -30], C('#1c1822'), 3); // tails
  poly(ctx, [-12, -122, 0, -60, 12, -122, 6, -122, 0, -100, -6, -122], C(c), 2.4); // shirt front
  poly(ctx, [-9, -112, 0, -104, 9, -112, 5, -118, -5, -118], C('#b3263a'), 1.6); // bow
  for (const y of [-92, -78, -64]) circ(ctx, 0, y, 2.2, C('#e0b848'), 1.2);
  poly(ctx, [-22, -112 + b, -4, -100, -14, -122, -12, -122], C(c, 0.7), 0); // lapel
  seam(ctx, [-16, -112, -14, -84, -20, -44], 8, 4.5, C('#e8dcc4', 1, 0.85)); staple(ctx, -16, -76, 1.5);
  // head with wild hair
  circ(ctx, 0, -138 + b, 16, C('#e0cdb0'), 2.8);
  for (let i = 0; i < 7; i++) { const a = Math.PI + i * Math.PI / 6 - 0.2 + Math.sin(t * 2 + i) * 0.1; line(ctx, [Math.cos(a) * 14, -140 + b + Math.sin(a) * 14, Math.cos(a) * 28 + Math.sin(t * 1.6 + i) * 3, -142 + b + Math.sin(a) * 28], C(c, 1.1), 5); }
  circ(ctx, 0, -144 + b, 15, null, 0); eye(ctx, -6, -138 + b, 3.6, -1, 0.1, A.blink, '#b3263a'); eye(ctx, 6, -138 + b, 3.6, -1, 0.1, A.blink, '#b3263a'); line(ctx, [-10, -145 + b, -2, -142 + b], ink(), 2.2); line(ctx, [10, -145 + b, 2, -142 + b], ink(), 2.2);
  ell(ctx, 0, -127 + b, 5, 3 + Math.abs(beat) * 0.1, C('#2a0e12'), 1.6);
  // batoning arm: polyline baton
  const sx = -22, sy = -106, hx = -52 + A.att * -12, hy = by + 42 + beat * 0.3;
  limb(ctx, [sx, sy, -40, (sy + hy) / 2 - 8, hx, hy], C('#1c1822'), 7); circ(ctx, hx, hy, 5.5, C('#e0cdb0'), 2);
  const tipx = hx - 40 - beat * 0.3, tipy = hy - 40 + beat * 1.4;
  line(ctx, [hx, hy, tipx, tipy], ink(), 4.5); line(ctx, [hx, hy, tipx, tipy], C('#f3ecd8'), 2.4); circ(ctx, tipx, tipy, 2.6, C('#f2c14e'), 1.2);
  for (let i = 1; i < 4; i++) line(ctx, [tipx + 6 + i * 6, tipy + i * 5 + beat * 0.4, tipx + 10 + i * 8, tipy + i * 7 + beat * 0.4], C(c, 1, 0.5 - i * 0.12), 1.8); // motion trail
  // other arm raising a score
  limb(ctx, [22, -108, 40, -96, 44, -76 + Math.sin(t * 2) * 4], C('#1c1822'), 7); circ(ctx, 44, -74 + Math.sin(t * 2) * 4, 5.5, C('#e0cdb0'), 2);
  // floating notes
  for (let i = 0; i < 4; i++) { const f = (t * 0.4 + i * 0.25) % 1, nx = 30 + i * 18 + Math.sin(t + i) * 5, ny = -60 - f * 100; circ(ctx, nx, ny, 3.2, C(c, 1, 1 - f), 0); line(ctx, [nx + 3, ny, nx + 3, ny - 12], C(c, 1, 1 - f), 1.8); }
  rect(ctx, -18, -16, 36, 6, C('#7a1f2e'), 1, 2);
  // sash and gold stars for the boss
  line(ctx, [-22, -116, 18, -52], C('#e0b848'), 4); circ(ctx, 6, -78, 3.6, C('#b3263a'), 1.4);
}

function patchwork(ctx, A) {
  const t = A.t, b = A.b, sw = Math.sin(t * 1.2) * 2;
  const pc = ['#d95b3a', '#8a2c3c', '#3f7f8a', '#c9a227', '#6a4ab0', '#9a6a3a', '#4a8a5a', '#d8cba8'];
  const patch = (pts, i, lw = 2.8) => poly(ctx, pts, C(pc[i % pc.length], 0.9), lw);
  // legs
  patch([-26, -64, -4, -64, -8, -6, -30, -6], 2); patch([4, -64, 26, -64, 30, -6, 6, -6], 5);
  rect(ctx, -32, -8, 28, 8, C('#16110f'), 3, 2.4); rect(ctx, 4, -8, 30, 8, C('#16110f'), 3, 2.4);
  ctx.save(); ctx.translate(sw * 0.4, 0);
  // torso quilt
  patch([-30, -70, 0, -70, 0, -96 + b, -34, -96 + b], 0); patch([0, -70, 30, -70, 34, -96 + b, 0, -96 + b], 3);
  patch([-34, -96 + b, 0, -96 + b, 0, -126 + b, -28, -126 + b], 1); patch([0, -96 + b, 34, -96 + b, 28, -126 + b, 0, -126 + b], 6);
  // arms
  patch([-34, -122 + b, -28, -126 + b, -56, -100, -62, -108], 4); patch([-62, -108, -56, -100, -52, -68, -62, -70], 7);
  patch([28, -126 + b, 34, -122 + b, 62, -108, 56, -100], 2); patch([62, -108, 56, -100, 52, -68, 62, -70], 0);
  circ(ctx, -58, -64, 6, C(pc[3]), 2.4); circ(ctx, 58, -64, 6, C(pc[5]), 2.4);
  // seams between patches
  seam(ctx, [0, -126 + b, 0, -70], 7, 5, C(INK)); seam(ctx, [-34, -96 + b, 34, -96 + b], 8, 5); seam(ctx, [-30, -70, 30, -70], 8, 5);
  seam(ctx, [-32, -124 + b, -56, -100, -60, -70], 8, 4.5); seam(ctx, [32, -124 + b, 56, -100, 60, -70], 8, 4.5); seam(ctx, [-4, -64, -6, -8], 8, 4); seam(ctx, [6, -64, 8, -8], 8, 4);
  for (const [x, y, a] of [[-16, -96, 0.1], [18, -96, -0.1], [0, -112, 1.5], [-2, -70, 1.5], [-46, -92, 0.9], [46, -92, -0.9]]) staple(ctx, x, y + b * 0.4, a, 1.2);
  // eye on the chest
  const ex = -2, ey = -90 + b, look = Math.sin(t * 0.7) * 0.8;
  glow(ctx, ex, ey, 26, '#fff3b0', 0.25);
  ell(ctx, ex, ey, 17, 12 * (1 - 0.9 * A.blink), C('#f3ecd8'), 2.8); circ(ctx, ex - 4 + look * 4, ey, 8, C('#b3263a'), 1.6); circ(ctx, ex - 4 + look * 4, ey, 3.6, C(INK), 0); circ(ctx, ex - 7 + look * 4, ey - 3, 1.8, C('#fff'), 0);
  for (let i = 0; i < 5; i++) { const a = -2.9 + i * 0.5; line(ctx, [ex + Math.cos(a) * 17, ey + Math.sin(a) * 12, ex + Math.cos(a) * 24, ey + Math.sin(a) * 18], ink(), 2); }
  // no-face head: blank stitched sack
  ctx.beginPath(); ctx.ellipse(0, -142 + b, 19, 21, 0, 0, TAU); fs(ctx, C('#d8cba8'), 3); ell(ctx, 8, -146 + b, 9, 14, C('#8a2c3c', 0.9), 0, 0.2);
  seam(ctx, [-16, -148 + b, -6, -146 + b, 4, -150 + b, 16, -144 + b], 6, 4); seam(ctx, [-2, -160 + b, 2, -142 + b, -4, -124 + b], 6, 4); staple(ctx, -10, -134 + b, 0.4);
  patch([-12, -163 + b, 12, -163 + b, 8, -154 + b, -8, -154 + b], 3, 2);
  // loose threads
  for (let i = 0; i < 4; i++) thread(ctx, -20 + i * 14, -64, -24 + i * 14 + Math.sin(t * 2 + i) * 4, -40 + Math.sin(t + i) * 3, '#d6c7a6', 1.2, 4);
  ctx.restore();
}

function blob(ctx, A) {
  const t = A.t, b = A.b, c = A.col;
  ctx.beginPath(); ctx.moveTo(-46, -4); ctx.bezierCurveTo(-52, -80 - b * 2, 52, -80 - b * 2, 46, -4); ctx.quadraticCurveTo(0, 6, -46, -4); fs(ctx, C(c), 3);
  eye(ctx, -16, -48, 6, -1, 0, A.blink); eye(ctx, 8, -48, 6, -1, 0, A.blink); mouthStitch(ctx, -4, -28, 22, 3, INK, 5);
  seam(ctx, [18, -70, 22, -40, 16, -14], 7, 4); staple(ctx, 20, -42, 0.5);
}

const BODY = {
  dome, tall, cylinder, stilts, wings, striped, capsules, bellows, tail, lamp, figure, box, bell, jar: jarB, hunched, disc, lure, jagged, balance, cleaver, bloom, barrels,
  columns, candle, loupe, podium, tophat, torch, masks: masksB, cherub, puppet, cone, eyebox, curtain, clappers, outline, hat, conductor, patchwork, blob,
};
const ALIAS = { slime: 'dome', gurney: 'box', stand: 'podium', coin: 'disc', hound: 'jagged', fish: 'lure', mummy: 'striped', pills: 'capsules', moth: 'wings', nurse: 'lamp' };

// ------------------------------------------------------------------ stage (shared with heroes)
// facing: -1 art faces left (enemies), +1 art faces right (heroes). mirrorX flips the art.
export function stage(ctx, paint, A, bw, bh, x, y, o, facing, kScale) {
  const s = o.scale || 1, hurt = Math.max(0, Math.min(1, o.hurt || 0)), d = Math.max(0, Math.min(1, o.dying || 0)), att = Math.max(-1, Math.min(1, o.attack || 0));
  const m = o.flip ? -1 : 1, fx = facing * m; // fx > 0: faces screen right
  G.flash = hurt > 0 ? Math.min(0.9, hurt * 1.25) : 0;
  ctx.save();
  ctx.translate(x + (fx * att * 46 - fx * hurt * 16) * s, y);
  if (d > 0) ctx.globalAlpha *= 1;
  // ground shadow
  ctx.fillStyle = C('#000', 1, 0.28 * (1 - d)); ctx.beginPath(); ctx.ellipse(0, 1, bw * 0.4 * s, 7 * s, 0, 0, TAU); ctx.fill();
  ctx.scale(s * kScale * m, s * kScale);
  const sq = 1 + att * 0.05 - hurt * 0.04, sx = 1 - att * 0.04 + hurt * 0.05;
  ctx.rotate(-fx * hurt * 0.06 + fx * att * 0.03);
  ctx.scale(sx, sq);
  if (d > 0) paintPieces(ctx, paint, A, bw / kScale, bh / kScale, d);
  else paint(ctx, A);
  ctx.restore();
  if (d <= 0 && A.st !== NOST) { ctx.save(); ctx.translate(x + (fx * att * 46 - fx * hurt * 16) * s, y); ctx.scale(s, s); tells(ctx, A, bw / kScale, bh / kScale, kScale); ctx.restore(); }
  G.flash = 0;
}

export function drawEnemy(ctx, def, x, y, o = {}) {
  try {
    const art = (def && def.art) || {}, id = (def && def.id) || 'x';
    const key = BODY[art.body] ? art.body : ALIAS[art.body] || 'blob';
    const k = kindK(def || {}) * (art.scale || 1);
    const sz = baseSize(def || {});
    const A = prepA(o, id, art.color || '#8a9a7a', sz[0], sz[1]);
    A.def = def;
    // strength aura behind the body
    if (A.st !== NOST && A.st.strength > 0 && !o.dying) { ctx.save(); ctx.translate(x, y); ctx.scale((o.scale || 1) * k, (o.scale || 1) * k); glow(ctx, 0, -sz[1] * 0.5, Math.max(sz[0], sz[1]) * 0.62, '#d63a3a', 0.35); ctx.restore(); }
    // shared body with special handling when the 'bell' / 'jar' etc. alias keyword differs
    stage(ctx, BODY[key], A, sz[0] * k, sz[1] * k, x, y, o, -1, k);
  } catch (e) {
    G.flash = 0;
    if (globalThis.__GW_ART_THROW) throw e;
    try { ctx.restore(); } catch (e2) { /* ignore */ }
    try { fallbackDraw(ctx, def, x, y, o); } catch (e3) { /* never throw */ }
  }
}
function fallbackDraw(ctx, def, x, y, o) {
  const s = (o && o.scale) || 1; ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = (def && def.art && def.art.color) || '#888'; ctx.strokeStyle = '#16110f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(0, -50, 45, 50, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
}

export const K = { C, INK, poly, line, limb, smooth, ell, circ, rect, seam, staple, bandage, wrap, glow, flame, eye, dots, mouthStitch, thread, coin, gear, mask, jar, text0, stage, phaseOf, prepA, NOST };
