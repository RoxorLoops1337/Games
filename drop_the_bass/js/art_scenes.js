// art_scenes.js: cinematic scenes, the title screen. AAA pass: camera moves with parallax, volumetric light, bloom, colour grading, letterbox.
// Contract: see drop_the_bass/CLAUDE.md. Every draw function leaves ctx state as found. No Math.random, no Date: all motion comes from t.
import { COL, WORLD_BY_ID } from './data_core.js';
import { drawHero, drawBust, drawLoopy } from './art_heroes.js';
import { drawBackdrop } from './art_env.js';

let ART_SCALE = 2;
const cacheFx = new Map();
export function setArtScale(n) { ART_SCALE = Math.max(1, Math.min(3, n || 2)); cacheFx.clear(); }
export function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
}
const OUT = '#140a2c';
const TAU = Math.PI * 2;
const fract = (v) => v - Math.floor(v);
const hn = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);       // deterministic noise 0..1
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU); }
function fs(ctx, fill, lw, stroke) { if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (lw !== 0) { ctx.strokeStyle = stroke || OUT; ctx.lineWidth = lw == null ? 3 : lw; ctx.lineJoin = 'round'; ctx.stroke(); } }
function poly(ctx, pts, close) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close !== false) ctx.closePath(); }
function circle(ctx, x, y, r, fill, lw, stroke) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); fs(ctx, fill, lw == null ? 0 : lw, stroke); }
function line(ctx, x1, y1, x2, y2, w, col, cap) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineCap = cap || 'round'; ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }
function limb(ctx, x1, y1, x2, y2, w, col, bend) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
  const cx = mx - dy / L * (bend || 0), cy = my + dx / L * (bend || 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.strokeStyle = OUT; ctx.lineWidth = w + 3.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}
function glow(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function hexA(hex, a) {
  if (hex[0] !== '#') return hex;
  let h = hex.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
}
function mix(a, b, k) {
  const pa = hexRgb(a), pb = hexRgb(b);
  return 'rgb(' + Math.round(lerp(pa[0], pb[0], k)) + ',' + Math.round(lerp(pa[1], pb[1], k)) + ',' + Math.round(lerp(pa[2], pb[2], k)) + ')';
}
function hexRgb(hex) {
  if (hex[0] === 'r') { const m = hex.match(/\d+/g); return [+m[0], +m[1], +m[2]]; }
  let h = hex.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function vgrad(ctx, y0, y1, c0, c1, c2) {
  const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); if (c2) { g.addColorStop(0.5, c1); g.addColorStop(1, c2); } else g.addColorStop(1, c1); return g;
}
function note(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ell(ctx, 0, 0, 4.4, 3.2, -0.4); ctx.fill(); ctx.beginPath(); ctx.moveTo(3.6, -1); ctx.lineTo(3.6, -13); ctx.quadraticCurveTo(8, -11, 8, -6); ctx.stroke(); ctx.restore();
}
function star4(ctx, x, y, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.28 : r; const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath(); ctx.fill();
}

function skylineLayer(ctx, w, base, seed, hmin, hmax, wmin, wmax, fill, winCol, winP, edge) {
  let x = -20, i = 0;
  while (x < w + 20) {
    const bw = wmin + hn(seed + i * 3.1) * (wmax - wmin), bh = hmin + hn(seed + i * 7.7 + 1) * (hmax - hmin);
    ctx.fillStyle = fill; ctx.fillRect(x, base - bh, bw + 1, bh + 2);
    if (edge) { ctx.fillStyle = edge; ctx.fillRect(x, base - bh, bw + 1, 2.2); }
    if (hn(seed + i * 5.3) > 0.72) { ctx.fillRect(x + bw * 0.45, base - bh - 14, 2.4, 14); }
    if (winCol) {
      const cw = 7, ch = 9;
      for (let wy = base - bh + 8; wy < base - 8; wy += 14) for (let wx = x + 5; wx < x + bw - 8; wx += 12) {
        if (hn(seed + wx * 0.37 + wy * 1.13) < winP) { ctx.fillStyle = hn(wx + wy) > 0.8 ? '#ff9ad2' : winCol; ctx.fillRect(wx, wy, cw, ch); }
      }
    }
    x += bw + (hn(seed + i) > 0.7 ? 6 : 0); i++;
  }
}
function starsStatic(ctx, w, hz, n, seed) {
  for (let i = 0; i < n; i++) { const sx = hn(seed + i) * w, sy = hn(seed + i + 99) * hz * 0.85; ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + hn(i + seed + 5) * 0.5) + ')'; ctx.fillRect(sx, sy, 1.6, 1.6); }
}
function moon(ctx, x, y, r, col) {
  glow(ctx, x, y, r * 3, col || '#ffe9c4', 0.35); circle(ctx, x, y, r, col || '#fff1d0', 0);
  circle(ctx, x - r * 0.3, y - r * 0.2, r * 0.18, 'rgba(200,170,150,.35)', 0); circle(ctx, x + r * 0.35, y + r * 0.3, r * 0.26, 'rgba(200,170,150,.3)', 0);
}
function speakerStack(ctx, x, yb, s, col) {
  for (let i = 0; i < 3; i++) {
    const yy = yb - (i + 1) * 40 * s; rr(ctx, x, yy, 54 * s, 38 * s, 5 * s); fs(ctx, col || '#241a3e', 3);
    circle(ctx, x + 27 * s, yy + 21 * s, 12 * s, '#120c24', 2.4); circle(ctx, x + 27 * s, yy + 21 * s, 5 * s, '#3a2c66', 0); circle(ctx, x + 27 * s, yy + 8 * s, 3.5 * s, '#251a42', 1.8);
  }
}
function bunting(ctx, x1, y1, x2, y2, sag, n, cols) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + sag, x2, y2); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
  for (let i = 1; i < n; i++) {
    const k = i / n, px = lerp(x1, x2, k), py = (1 - k) * (1 - k) * y1 + 2 * k * (1 - k) * (Math.max(y1, y2) + sag) + k * k * y2;
    poly(ctx, [[px - 7, py], [px + 7, py], [px, py + 15]]); fs(ctx, cols[i % cols.length], 1.8);
  }
}

function staticCreep(ctx, w, h, t, amt) {
  if (!(amt > 0)) return;
  amt = Math.min(1, amt);
  const n = 90, m = Math.min(w, h);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, per = 2 * (w + h), pos = u * per; let px, py, nx, ny;
    if (pos < w) { px = pos; py = 0; nx = 0; ny = 1; } else if (pos < w + h) { px = w; py = pos - w; nx = -1; ny = 0; } else if (pos < 2 * w + h) { px = 2 * w + h - pos; py = h; nx = 0; ny = -1; } else { px = 0; py = per - pos; nx = 1; ny = 0; }
    const depth = amt * m * (0.1 + hn(i + 3) * 0.28), jit = Math.sin(t * 5 + i * 1.3) * 3;
    const r = 14 + hn(i + 11) * 26;
    const cx = px + nx * (depth * hn(i + 21)) + ny * jit, cy = py + ny * (depth * hn(i + 21)) + nx * jit;
    const rad = r * (0.5 + amt * 0.8), sp = 9;
    ctx.beginPath();
    for (let k = 0; k < sp * 2; k++) { const a = k / (sp * 2) * TAU + i, rd = rad * (k % 2 ? 0.7 : 1.1 + hn(i * 3 + k) * 0.15); const qx = cx + Math.cos(a) * rd, qy = cy + Math.sin(a) * rd; k ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }
    ctx.closePath(); ctx.fillStyle = hexA(hn(i) > 0.5 ? '#c9c4d6' : '#a29cba', 0.8 + amt * 0.2); ctx.fill();
    if (hn(i + 5) > 0.78) { circle(ctx, cx - rad * 0.28, cy - rad * 0.1, rad * 0.22, '#fff', 0); circle(ctx, cx + rad * 0.28, cy - rad * 0.1, rad * 0.22, '#fff', 0); circle(ctx, cx - rad * 0.24, cy - rad * 0.08, rad * 0.1, OUT, 0); circle(ctx, cx + rad * 0.32, cy - rad * 0.08, rad * 0.1, OUT, 0); }
  }
  // grey wash and glitch bars
  const g = ctx.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75); g.addColorStop(0, 'rgba(170,165,190,0)'); g.addColorStop(1, 'rgba(170,165,190,' + (0.5 * amt) + ')');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (amt > 0.35) for (let i = 0; i < 4; i++) { const gy = ((t * 70 + i * h / 4) % h); ctx.fillStyle = 'rgba(200,196,214,' + 0.1 * amt + ')'; ctx.fillRect(0, gy, w, 2 + hn(Math.floor(t * 4) + i) * 6); }
  ctx.restore();
}


// ===================================================================================================================== SCENES
// All scenes: background fills the whole (w,h), foreground is composed in a 540 x 960 design space centred and scaled to fit.
function fuzzy(ctx, x, y, r, t, o) {
  o = o || {}; const n = 14, col = o.col || '#c9c4d6', seed = o.seed || 0;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * TAU, rad = r * (i % 2 ? 0.86 : 1.08 + hn(i + seed) * 0.12) * (1 + Math.sin(t * 6 + i) * 0.03); const px = Math.cos(a) * rad, py = Math.sin(a) * rad * 0.92; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath(); fs(ctx, col, Math.max(2, r * 0.1));
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#2fe6ff'; ctx.fillRect(-r * 0.9, -r * 0.2 + Math.sin(t * 9 + seed) * 2, r * 1.8, r * 0.14); ctx.fillStyle = '#ff3cc8'; ctx.fillRect(-r * 0.9, r * 0.25 + Math.cos(t * 7 + seed) * 2, r * 1.8, r * 0.1); ctx.globalAlpha = 1;
  for (const s of [-1, 1]) { circle(ctx, s * r * 0.34, -r * 0.1, r * 0.3, '#fff', Math.max(1.5, r * 0.06)); circle(ctx, s * r * 0.34 + Math.sin(t * 2 + seed) * r * 0.08, -r * 0.08, r * 0.13, OUT, 0); }
  ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.4); ctx.quadraticCurveTo(0, r * (o.grin ? 0.7 : 0.25), r * 0.3, r * 0.4); ctx.lineWidth = Math.max(2, r * 0.07); ctx.strokeStyle = OUT; ctx.stroke();
  ctx.restore();
}
const PAR = { x: 0, y: 0 };      // foreground parallax offset (design px), set per frame by drawScene
function sceneBegin(ctx, w, h) {
  const s = Math.min(w / 540, h / 960); ctx.save(); ctx.translate((w - 540 * s) / 2 + PAR.x * s, (h - 960 * s) / 2 + PAR.y * s); ctx.scale(s, s); return s;
}
function vanDraw(ctx, x, y, s, t, o) {
  o = o || {}; const bounce = Math.sin(t * 12) * 1.2 * s;
  ctx.save(); ctx.translate(x, y + bounce); ctx.scale(s, s);
  ell(ctx, 0, 46, 96, 8); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
  rr(ctx, -92, -40, 180, 80, 18); fs(ctx, '#ffd23c', 3.4);
  rr(ctx, -92, 8, 180, 16, 6); ctx.fillStyle = '#ff5fb0'; ctx.fill(); rr(ctx, -92, -40, 180, 80, 18); ctx.lineWidth = 3.4; ctx.strokeStyle = OUT; ctx.stroke();
  rr(ctx, 40, -30, 44, 30, 8); fs(ctx, '#9be8ff', 2.8); rr(ctx, -80, -28, 90, 26, 6); fs(ctx, '#9be8ff', 2.8); line(ctx, -34, -28, -34, -2, 2.4, OUT);
  for (let i = 0; i < 4; i++) rr(ctx, -80 + i * 22, -60, 18, 20, 4), fs(ctx, '#2a2250', 2.6);
  circle(ctx, 78, 6, 4, '#fff6b0', 1.8); glow(ctx, 110, 6, 70, '#fff6b0', 0.5);
  for (const wx of [-52, 52]) { circle(ctx, wx, 40, 16, '#1c1630', 3); ctx.save(); ctx.translate(wx, 40); ctx.rotate(t * 9); circle(ctx, 0, 0, 8, '#bbb', 2); line(ctx, -8, 0, 8, 0, 2, '#666'); ctx.restore(); }
  ctx.restore();
}
function playBtn(ctx, x, y, r, col) { poly(ctx, [[x - r * 0.6, y - r], [x + r, y], [x - r * 0.6, y + r]]); fs(ctx, col, r * 0.22); }
function crowd(ctx, w, yb, rows, t, beat, tint) {
  for (let r = rows - 1; r >= 0; r--) for (let x = -10 + (r % 2) * 14; x < w + 20; x += 30) {
    const yy = yb + r * 22 + Math.sin(t * 5 + x * 0.1 + r) * (3 + beat * 3), hs = hn(x + r * 31);
    const body = mix(tint || '#1a0c3a', '#000010', r * 0.1);
    ctx.fillStyle = body; ell(ctx, x, yy + 24, 14, 18); ctx.fill(); circle(ctx, x, yy, 9, body, 0);
    if (hs > 0.4) { const ar = Math.sin(t * 6 + x) * 0.3; line(ctx, x - 9, yy + 12, x - 15, yy - 14 + ar * 8, 5, body); line(ctx, x + 9, yy + 12, x + 15, yy - 12 - ar * 8, 5, body); if (hs > 0.8) circle(ctx, x + 15, yy - 16, 3, '#fff6b0', 0); }
  }
}

function sceneHeroes(ctx, t, a, b, ya, y2, sz) {
  const yb = y2 == null ? ya : y2;
  // contact shadows and a warm back light so the duo reads against any background
  ctx.save();
  for (const [x, y, k] of [[a.x, ya, 1], [b.x, yb, 0.97]]) {
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#05010f'; ell(ctx, x, y + 4, sz * 0.26 * k, sz * 0.05 * k); ctx.fill();
  }
  ctx.restore();
  glowSpr(ctx, '#ff5fb0', b.x, yb - sz * 0.5, sz * 0.78, 0.2);
  glowSpr(ctx, '#9dff3a', a.x, ya - sz * 0.5, sz * 0.78, 0.16);
  drawHero(ctx, 'roxor', a.x, ya, sz, { t, pose: a.pose, talk: a.talk, flip: a.flip, outfit: a.outfit });
  drawHero(ctx, 'jasmin', b.x, yb, sz * 0.97, { t: t + 0.37, pose: b.pose, talk: b.talk, flip: b.flip, outfit: b.outfit });
}

// a boss shown as a dark silhouette with a red rim light until progress a, then revealed in colour by progress b
function bossShow(ctx, id, x, y, s, t, p, a, b) {
  const k = ease(clamp((p - a) / Math.max(0.01, b - a), 0, 1));
  const cv = k < 1 ? scratch('boss', 520, 520) : null;
  if (!cv) { bossBig(ctx, id, x, y, s, t, p); return; }
  const c2 = cv.getContext('2d');
  c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, cv.width, cv.height);
  c2.setTransform(ART_SCALE, 0, 0, ART_SCALE, 260 * ART_SCALE, 260 * ART_SCALE);
  bossBig(c2, id, 0, 0, s, t, p);
  c2.setTransform(1, 0, 0, 1, 0, 0); c2.globalCompositeOperation = 'source-in'; c2.fillStyle = '#04010c'; c2.fillRect(0, 0, cv.width, cv.height); c2.globalCompositeOperation = 'source-over';
  glowSpr(ctx, '#ff2a5e', x, y, 300 * s, 0.35 * (1 - k));
  ctx.save();
  ctx.globalAlpha = 1 - k * 0.2;
  ctx.shadowColor = '#ff2a5e'; ctx.shadowBlur = 24 * (1 - k); ctx.drawImage(cv, x - 260, y - 260, 520, 520); ctx.shadowBlur = 0;
  ctx.restore();
  if (k > 0) { ctx.save(); ctx.globalAlpha = k; bossBig(ctx, id, x, y, s, t, p); ctx.restore(); }
  // reveal flash
  const fl = Math.max(0, 1 - Math.abs(k - 0.5) * 2) * (k > 0.02 && k < 0.98 ? 1 : 0);
  if (fl > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fl * 0.5; ctx.fillStyle = '#ffd0e0'; ctx.fillRect(-300, -300, 1140, 1560); ctx.restore(); }
}

const BOSS_BG = { compressor: 'garage', noisegate: 'busk', reverb: 'club', djglitch: 'festival', playback: 'arena' };
function bossBig(ctx, id, cx, cy, s, t, p) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  const sh = Math.sin(t * 3);
  if (id === 'compressor') {
    const sq = (0.5 + 0.5 * Math.sin(t * 2)) * 26;
    rr(ctx, -150, -150 + sq, 300, 40, 10); fs(ctx, '#5a6486', 4); rr(ctx, -150, 120 - sq, 300, 40, 10); fs(ctx, '#5a6486', 4);
    for (const sx of [-110, 110]) { rr(ctx, sx - 12, -112 + sq, 24, 232 - sq * 2, 6); fs(ctx, '#aab4d4', 3.4); }
    rr(ctx, -120, -100 + sq * 0.5, 240, 210 - sq, 22); fs(ctx, '#7d8bb0', 4.4);
    for (const sx of [-52, 52]) { circle(ctx, sx, -34, 46, '#f4f0dc', 4.4); ctx.beginPath(); ctx.arc(sx, -34, 38, Math.PI * 1.15, Math.PI * 1.85); ctx.lineWidth = 6; ctx.strokeStyle = '#ff4a5e'; ctx.stroke(); const na = -Math.PI / 2 + Math.sin(t * 2.4 + sx) * 0.9 + 0.2; line(ctx, sx, -34, sx + Math.cos(na) * 36, -34 + Math.sin(na) * 36, 4, OUT); circle(ctx, sx, -34, 6, OUT, 0); }
    rr(ctx, -60, 40, 120, 40, 8); fs(ctx, '#2a3050', 3.4); for (let i = 0; i < 7; i++) line(ctx, -50 + i * 16.6, 46, -50 + i * 16.6, 74, 4, '#97a4c8');
    for (let i = 0; i < 4; i++) circle(ctx, -78 + i * 52, 98, 6, ['#ff4a5e', '#ffd23c', '#9dff3a', '#2fe6ff'][i], 2);
  } else if (id === 'noisegate') {
    rr(ctx, -150, -150, 300, 310, 20); fs(ctx, '#3a2c10', 4.4); rr(ctx, -128, -128, 256, 280, 16); fs(ctx, '#ffcf4a', 4);
    ctx.save(); rr(ctx, -112, -110, 224, 246, 10); ctx.clip(); ctx.fillStyle = '#1a1030'; ctx.fillRect(-112, -110, 224, 246);
    const drop = (0.55 + 0.45 * Math.sin(t * 1.6)) ; for (let i = 0; i < 8; i++) { const bx = -98 + i * 28; rr(ctx, bx, -110, 14, 20 + drop * 200, 5); fs(ctx, '#d6d0e6', 3); }
    ctx.restore();
    ell(ctx, 0, -10 + sh * 4, 54, 40 * (0.6 + 0.4 * Math.abs(Math.cos(t * 0.9)))); fs(ctx, '#fff', 4.4); circle(ctx, Math.sin(t) * 16, -10 + sh * 4, 22, '#ff4a5e', 3.4); circle(ctx, Math.sin(t) * 16, -10 + sh * 4, 9, OUT, 0);
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 130, -30); ctx.lineTo(sx * 160, -60 + sh * 5); ctx.lineWidth = 12; ctx.strokeStyle = OUT; ctx.stroke(); }
  } else if (id === 'reverb') {
    for (let i = 4; i >= 1; i--) { const k = (i + (t * 0.8) % 1); ctx.globalAlpha = 0.5 / i; ell(ctx, 0, 0, 120 + k * 22, 140 + k * 24); fs(ctx, '#9f7bff', 3, '#d6c7ff'); }
    ctx.globalAlpha = 1;
    for (const o2 of [[-30, 6, 0.3], [24, -4, 0.45]]) { ctx.globalAlpha = o2[2]; ell(ctx, o2[0] + Math.sin(t * 2) * 10, o2[1], 120, 140); fs(ctx, '#c5adff', 3); }
    ctx.globalAlpha = 1; ell(ctx, 0, 0, 120, 140); fs(ctx, '#9f7bff', 5);
    for (const sx of [-1, 1]) { circle(ctx, sx * 44, -26, 30, '#fff', 4.4); circle(ctx, sx * 44 + Math.sin(t * 2) * 8, -22, 12, OUT, 0); }
    ctx.beginPath(); ctx.arc(0, 36, 40, 0.15, Math.PI - 0.15); ctx.lineWidth = 6; ctx.strokeStyle = OUT; ctx.stroke();
    for (let i = 0; i < 3; i++) { ell(ctx, 0, 0, 150 + i * 28 + ((t * 40) % 28), 170 + i * 28 + ((t * 40) % 28)); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(214,199,255,.35)'; ctx.stroke(); }
  } else if (id === 'djglitch') {
    for (const [dx, col] of [[-5, 'rgba(255,60,200,.55)'], [5, 'rgba(47,230,255,.55)']]) { ctx.save(); ctx.translate(dx + Math.sin(t * 20) * 2, 0); ctx.globalAlpha = 0.55; ell(ctx, 0, -60, 90, 100); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
    rr(ctx, -130, 40, 260, 120, 18); fs(ctx, '#232a48', 4.4);
    for (const sx of [-1, 1]) { circle(ctx, sx * 60, 100, 44, '#101018', 4); ctx.save(); ctx.translate(sx * 60, 100); ctx.rotate(t * 3 * sx); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 14 + i * 9, 0.3, 2.2); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke(); } circle(ctx, 0, 0, 10, '#35f0c8', 0); line(ctx, 0, 0, 40, 0, 2, '#fff'); ctx.restore(); }
    ell(ctx, 0, -50, 80, 90); fs(ctx, '#35f0c8', 4.4);
    rr(ctx, -66, -74, 132, 38, 14); fs(ctx, '#0b1230', 4); line(ctx, -50, -62, -18, -62, 4, '#ff3cc8'); line(ctx, 14, -62, 50, -62, 4, '#2fe6ff');
    ctx.beginPath(); ctx.arc(0, -52, 100, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 16; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 10; ctx.strokeStyle = '#ff5fb0'; ctx.stroke();
    for (const sx of [-1, 1]) { ell(ctx, sx * 100, -50, 20, 34); fs(ctx, '#ff5fb0', 4); }
    rr(ctx, -30, -22, 60, 12, 6); ctx.fillStyle = OUT; ctx.fill(); for (let i = 0; i < 5; i++) line(ctx, -22 + i * 11, -20, -22 + i * 11, -13, 2, '#fff');
    for (let i = 0; i < 5; i++) { const gy = -150 + hn(Math.floor(t * 8) + i) * 300; ctx.fillStyle = 'rgba(53,240,200,.4)'; ctx.fillRect(-120 + hn(i + Math.floor(t * 6)) * 60, gy, 150, 5); }
  } else {  // playback
    glow(ctx, 0, -20, 260, '#ff4fa0', 0.5);
    rr(ctx, -110, -170, 220, 250, 70); fs(ctx, '#ff7ec0', 5); rr(ctx, -96, -158, 192, 120, 56); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
    rr(ctx, -84, -110, 168, 100, 36); fs(ctx, '#2a0a3a', 4.4);
    playBtn(ctx, -42, -60, 24, '#ff4fa0'); rr(ctx, 20, -86, 14, 52, 4); fs(ctx, '#2fe6ff', 3.4); rr(ctx, 44, -86, 14, 52, 4); fs(ctx, '#2fe6ff', 3.4);
    ctx.beginPath(); ctx.arc(0, 20, 52, 0.25, Math.PI - 0.25); ctx.lineWidth = 7; ctx.strokeStyle = OUT; ctx.lineCap = 'round'; ctx.stroke();
    for (let i = 0; i < 8; i++) rr(ctx, -34 + i * 9, 40, 7, 10, 2), ctx.fillStyle = '#fff', ctx.fill();
    line(ctx, 0, -170, 0, -216, 5, OUT); circle(ctx, 0, -222, 10 + Math.sin(t * 5) * 2, '#ffd23c', 3.4);
    rr(ctx, -150, 80, 300, 60, 24); fs(ctx, '#d6358a', 4.4);
    for (let i = 0; i < 3; i++) { const bx = -80 + i * 80; circle(ctx, bx, 110, 20, '#2a0a3a', 3.4); if (i === 0) playBtn(ctx, bx, 110, 8, '#ff7ec0'); if (i === 1) { rr(ctx, bx - 6, 100, 4, 20, 1); ctx.fillStyle = '#2fe6ff'; ctx.fill(); rr(ctx, bx + 2, 100, 4, 20, 1); ctx.fill(); } if (i === 2) { poly(ctx, [[bx - 8, 100], [bx + 2, 110], [bx - 8, 120]]); ctx.fillStyle = '#ffd23c'; ctx.fill(); poly(ctx, [[bx + 2, 100], [bx + 12, 110], [bx + 2, 120]]); ctx.fill(); } }
  }
  ctx.restore();
}

const WORLD_SCENE = { world_garage: 'garage', world_busk: 'busk', world_club: 'club', world_festival: 'festival', world_arena: 'arena' };
export const SCENE_IDS = ['garage_day', 'static_arrives', 'silent_town', 'build', 'van_night', 'boss_reveal', 'world_garage', 'world_busk', 'world_club', 'world_festival', 'world_arena', 'boss_compressor', 'boss_noisegate', 'boss_reverb', 'boss_djglitch', 'boss_playback', 'victory_stage', 'credits_van', 'defeat_quiet'];

function baseScene(ctx, id, w, h, t, o) {
  o = o || {}; t = t || 0; const p = clamp(o.progress == null ? 0.5 : o.progress, 0, 1);
  ctx.save();
  if (id === 'garage_day') {
    drawBackdrop(ctx, 'garage', w, h, t, { beat: 0.5 + 0.5 * Math.sin(t * 6.5) * 0.6 });
    ctx.fillStyle = 'rgba(255,190,90,.12)'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h); const z = 1 + p * 0.05; ctx.translate(270, 700); ctx.scale(z, z); ctx.translate(-270, -700);
    sceneHeroes(ctx, t, { x: 165, pose: 'beat' }, { x: 385, pose: 'sing' }, 830, 830, 330);
    drawLoopy(ctx, 270, 780, 96, { t, mood: 'happy' });
    for (let i = 0; i < 7; i++) { const k = ((t * 0.35 + i / 7) % 1); note(ctx, 120 + hn(i) * 300 + Math.sin(t * 2 + i) * 14, 640 - k * 420, 1.4, hexA(['#ff5fb0', '#9dff3a', '#ffd23c'][i % 3], 1 - k)); }
    ctx.restore();
  } else if (id === 'static_arrives') {
    drawBackdrop(ctx, 'garage', w, h, t, { staticAmt: 0.2 + p * 0.75 });
    ctx.fillStyle = 'rgba(10,6,30,' + (0.1 + p * 0.45) + ')'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h);
    // radio hissing + oscilloscope going flat
    rr(ctx, 70, 250, 400, 170, 16); fs(ctx, '#0b0a24', 4);
    ctx.beginPath(); for (let x = 0; x <= 380; x += 4) { const amp = (1 - p) * 56 * Math.sin(x * 0.12 + t * 8) + (p > 0.5 ? (hn(x + Math.floor(t * 20)) - 0.5) * 7 * p : 0); const px = 80 + x, py = 335 + amp; x ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.lineWidth = 4; ctx.strokeStyle = p > 0.6 ? '#c9c4d6' : '#9dff3a'; ctx.stroke();
    rr(ctx, 205, 700, 130, 80, 12); fs(ctx, '#7a4a30', 3.4); circle(ctx, 240, 740, 20, '#2a1a10', 2.6); line(ctx, 300, 700, 340, 640, 3, '#ccc');
    for (let i = 0; i < 3; i++) { const k = ((t * 0.8 + i / 3) % 1); ctx.beginPath(); ctx.arc(340, 640, 10 + k * 50, -2.4, -0.7); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(200,196,214,' + (0.7 * (1 - k)) + ')'; ctx.stroke(); }
    sceneHeroes(ctx, t, { x: 130, pose: 'shock' }, { x: 410, pose: 'shock', flip: true }, 880, 880, 320);
    drawLoopy(ctx, 270, 830, 90, { t, mood: 'worried', talk: p > 0.4 });
    ctx.restore();
  } else if (id === 'silent_town') {
    drawBackdrop(ctx, 'busk', w, h, t, { staticAmt: 0.45 });
    ctx.fillStyle = 'rgba(40,40,70,.45)'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h);
    crowd(ctx, 560, 560, 3, t * 0.15, 0, '#6a6c88');
    for (let i = 0; i < 6; i++) fuzzy(ctx, 40 + i * 92, 330 + hn(i) * 80 + Math.sin(t * 2 + i) * 6, 22 + hn(i + 4) * 12, t, { seed: i });
    // muted speaker sign
    const a = ease(clamp(p * 2, 0, 1)); ctx.globalAlpha = a; rr(ctx, 170, 110, 200, 160, 24); fs(ctx, 'rgba(20,16,50,.8)', 4); poly(ctx, [[215, 170], [245, 170], [280, 140], [280, 240], [245, 210], [215, 210]]); fs(ctx, '#c9c4d6', 3.4); line(ctx, 300, 160, 340, 220, 8, '#ff4a5e'); line(ctx, 340, 160, 300, 220, 8, '#ff4a5e'); ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) note(ctx, 60 + i * 80, 830 + hn(i) * 20, 1.2, 'rgba(150,150,170,.7)');
    sceneHeroes(ctx, t, { x: 150, pose: p < 0.5 ? 'shock' : 'talk', talk: p > 0.5 }, { x: 390, pose: 'sad', flip: true }, 900, 900, 300);
    ctx.restore();
  } else if (id === 'build') {
    drawBackdrop(ctx, 'garage', w, h, t, { beat: 0.3 });
    sceneBegin(ctx, w, h);
    rr(ctx, 20, 560, 500, 40, 10); fs(ctx, '#6a4a34', 4); rr(ctx, 40, 600, 40, 200, 4); fs(ctx, '#5a3a28', 3); rr(ctx, 460, 600, 40, 200, 4); fs(ctx, '#5a3a28', 3);
    const parts = ease(clamp(p * 1.4, 0, 1));
    ctx.save(); ctx.translate(270, 500); ctx.scale(1 + Math.sin(t * 3) * 0.01, 1);
    rr(ctx, -70, -30 + (1 - parts) * 60, 140, 110, 14); ctx.globalAlpha = clamp(parts * 2, 0, 1); fs(ctx, '#ff7a3c', 4); circle(ctx, 0, 24, 36, '#1a1030', 4); circle(ctx, 0, 24, 14, '#ff7a3c', 3);
    ctx.save(); ctx.translate(0, 10 + (1 - parts) * 60); ctx.rotate(-0.7); rr(ctx, -15, -118, 30, 100, 8); fs(ctx, '#ffd9a0', 4); rr(ctx, -23, -138, 46, 28, 8); fs(ctx, '#4a3c88', 4); ctx.restore();
    ctx.globalAlpha = 1; ctx.restore();
    for (let i = 0; i < 10; i++) { const k = (t * 0.9 + i * 0.37) % 1; star4(ctx, 270 + Math.cos(i * 2.4) * 110 * k + 0, 480 - k * 150 + Math.sin(i * 2.4) * 40, 4 + hn(i) * 6, i % 2 ? '#ffd23c' : '#fff'); }
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(60 + i * 60, 590); ctx.bezierCurveTo(100 + i * 60, 640, 150, 540, 220 + i * 20, 580); ctx.lineWidth = 5; ctx.strokeStyle = ['#ff5fb0', '#9dff3a', '#2fe6ff'][i]; ctx.stroke(); }
    sceneHeroes(ctx, t, { x: 110, pose: 'point' }, { x: 430, pose: 'cheer', flip: true }, 900, 900, 310);
    drawLoopy(ctx, 270, 370, 100, { t, mood: 'excited', talk: true });
    ctx.restore();
  } else if (id === 'van_night') {
    ctx.fillStyle = vgrad(ctx, 0, h, '#07041c', '#2a1060', '#ff7ab0'); ctx.fillRect(0, 0, w, h);
    starsStatic(ctx, w, h * 0.55, 80, 11); moon(ctx, w * 0.2, h * 0.14, Math.min(w, h) * 0.06);
    const hz = h * 0.6; glow(ctx, w * (0.9 - p * 0.3), hz, w * 0.5, '#ff5fb0', 0.35 + p * 0.3);
    skylineLayer(ctx, w, hz, 5 + Math.floor(t / 30), 50, 130, 30, 70, '#140a34', '#ffd88a', 0.15, null);
    ctx.fillStyle = '#0a0620'; ctx.fillRect(0, hz, w, h - hz);
    ctx.fillStyle = '#1c1238'; ctx.fillRect(0, hz + 120, w, 200);
    for (let i = 0; i < 12; i++) { const dx = ((i * 120 - t * 260) % (w + 120) + w + 120) % (w + 120) - 60; ctx.fillStyle = '#ffd23c'; ctx.fillRect(dx, hz + 214, 54, 8); }
    sceneBegin(ctx, w, h); vanDraw(ctx, 270, 690, 1.9, t); drawBust(ctx, 'roxor', 300, 585, 70, { t, pose: 'beat' }); drawBust(ctx, 'jasmin', 220, 585, 68, { t: t + 0.2, pose: 'sing' }); ctx.restore();
    sceneBegin(ctx, w, h); for (let i = 0; i < 4; i++) note(ctx, 150 - i * 40 - ((t * 60) % 40), 560 - i * 20 + Math.sin(t * 3 + i) * 10, 1.3, hexA('#ffd0ea', 0.7 - i * 0.15)); ctx.restore();
    staticCreep(ctx, w, h, t, p * 0.5);
  } else if (id === 'boss_reveal') {
    drawBackdrop(ctx, 'arena', w, h, t, { beat: 0.2 });
    ctx.fillStyle = 'rgba(2,0,16,' + (0.78 - p * 0.15) + ')'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h); const a = ease(clamp(p * 1.6, 0, 1));
    bossShow(ctx, 'playback', 270, 360, 1.05, t, p, 0.35, 0.62);
    ctx.fillStyle = 'rgba(255,79,160,' + 0.08 * a + ')'; poly(ctx, [[270, 300], [-100, 960], [640, 960]]); ctx.fill();
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.globalAlpha = 0.9; drawHero(ctx, i === 1 ? 'jasmin' : 'roxor', 130 + i * 140, 930, 200, { t, pose: 'shock' }); ctx.restore(); }
    ctx.fillStyle = 'rgba(2,0,20,.55)'; ctx.fillRect(0, 760, 540, 200); // silhouette them
    ctx.restore();
  } else if (WORLD_SCENE[id]) {
    const wid = WORLD_SCENE[id];
    drawBackdrop(ctx, wid, w, h, t, { beat: 0.5 + 0.5 * Math.sin(t * 7) * 0.5 });
    sceneBegin(ctx, w, h); const slide = (1 - ease(clamp(p * 3, 0, 1))) * 80;
    const gy = 890;
    ctx.fillStyle = 'rgba(8,4,24,.35)'; ctx.fillRect(-200, gy - 8, 940, 200);
    for (let i = 0; i < 4; i++) fuzzy(ctx, 520 - i * 4 + Math.sin(t * 2 + i) * 4, 470 + i * 70, 26 + hn(i) * 10, t, { seed: i, grin: true });
    ctx.save(); ctx.translate(-slide, 0); sceneHeroes(ctx, t, { x: 120, pose: 'point' }, { x: 320, pose: 'cheer' }, gy, gy, 310); ctx.restore();
    drawLoopy(ctx, 440, gy - 50, 86, { t, mood: 'excited' });
    ctx.restore();
  } else if (id.indexOf('boss_') === 0 && BOSS_BG[id.slice(5)]) {
    const bid = id.slice(5), wid = BOSS_BG[bid];
    drawBackdrop(ctx, wid, w, h, t, { beat: 0.4, staticAmt: 0.1 + p * 0.15 });
    ctx.fillStyle = 'rgba(6,2,22,.62)'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h); const enter = ease(clamp(p * 2.5, 0, 1)); const sc = 1.25 - 0.15 * enter;
    glow(ctx, 270, 380, 320, WORLD_BY_ID[wid] ? WORLD_BY_ID[wid].accent : '#ff5fb0', 0.3);
    bossShow(ctx, bid, 270, 400 + (1 - enter) * -120, sc, t, p, 0.28, 0.55);
    ctx.fillStyle = 'rgba(8,4,24,.5)'; ctx.fillRect(-200, 780, 940, 220);
    sceneHeroes(ctx, t, { x: 140, pose: 'shock' }, { x: 400, pose: 'point', flip: true }, 920, 920, 250);
    ctx.restore();
  } else if (id === 'victory_stage') {
    drawBackdrop(ctx, 'arena', w, h, t, { beat: 0.5 + 0.5 * Math.sin(t * 8) });
    for (let i = 0; i < 4; i++) { const a = Math.sin(t * 1.4 + i * 1.6) * 0.5; ctx.beginPath(); ctx.moveTo(w * (0.15 + i * 0.23), 0); ctx.lineTo(w * (0.15 + i * 0.23) + Math.cos(a + 1.57) * h - 60, h); ctx.lineTo(w * (0.15 + i * 0.23) + Math.cos(a + 1.57) * h + 60, h); ctx.closePath(); ctx.fillStyle = hexA(['#ffd0ea', '#c4f1ff', '#f1ffb8', '#fff'][i], 0.12); ctx.fill(); }
    sceneBegin(ctx, w, h);
    rr(ctx, 20, 800, 500, 40, 10); fs(ctx, '#3a2a68', 4);
    sceneHeroes(ctx, t, { x: 170, pose: 'hype' }, { x: 370, pose: 'cheer', flip: true }, 810, 810, 360);
    drawLoopy(ctx, 270, 760, 100, { t, mood: 'excited' });
    ctx.restore();
    sceneBegin(ctx, w, h); crowd(ctx, 540, 850, 2, t, 0.5, '#0c0626'); ctx.restore();
    sceneBegin(ctx, w, h); for (let i = 0; i < 40; i++) { const k = ((t * 0.3 + hn(i)) % 1), cx = hn(i + 1) * 540, cy = k * 980 - 20; ctx.save(); ctx.translate(cx + Math.sin(t * 3 + i) * 12, cy); ctx.rotate(t * 4 + i); ctx.fillStyle = ['#ff5fb0', '#ffd23c', '#2fe6ff', '#9dff3a'][i % 4]; ctx.fillRect(-4, -2, 8, 4); ctx.restore(); } ctx.restore();
  } else if (id === 'credits_van') {
    const hz = h * 0.58; ctx.fillStyle = vgrad(ctx, 0, hz, '#5a2a7a', '#ff7a9a', '#ffd38a'); ctx.fillRect(0, 0, w, hz);
    const sr = hz - 20 - ease(p) * 120; glow(ctx, w * 0.5, sr, w * 0.6, '#fff1a8', 0.7); circle(ctx, w * 0.5, sr, Math.min(w, h) * 0.12, '#fff7c8', 0);
    ctx.fillStyle = '#6a3a7a'; ctx.beginPath(); ctx.moveTo(0, hz); for (let x = 0; x <= w; x += 16) ctx.lineTo(x, hz - 30 - Math.sin(x * 0.01) * 24); ctx.lineTo(w, hz); ctx.fill();
    ctx.fillStyle = '#3a2a58'; ctx.fillRect(0, hz, w, h - hz); ctx.fillStyle = '#4a3a6a'; ctx.fillRect(0, hz + 100, w, 220);
    for (let i = 0; i < 10; i++) { const dx = ((i * 130 - t * 200) % (w + 130) + w + 130) % (w + 130) - 60; ctx.fillStyle = '#fff1a8'; ctx.fillRect(dx, hz + 206, 56, 8); }
    for (let i = 0; i < 5; i++) { const bx = ((hn(i) * w + t * 30) % (w + 40)), by = h * 0.18 + hn(i + 3) * h * 0.2; ctx.beginPath(); ctx.moveTo(bx - 8, by); ctx.quadraticCurveTo(bx - 4, by - 7 + Math.sin(t * 8 + i) * 3, bx, by); ctx.quadraticCurveTo(bx + 4, by - 7 + Math.sin(t * 8 + i) * 3, bx + 8, by); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke(); }
    sceneBegin(ctx, w, h); vanDraw(ctx, 270, 690, 1.9, t);
    drawHero(ctx, 'roxor', 230, 600, 150, { t, pose: 'cheer' }); drawHero(ctx, 'jasmin', 320, 600, 145, { t: t + 0.3, pose: 'cheer' });
    for (let i = 0; i < 5; i++) note(ctx, 90 - i * 30 - ((t * 50) % 30), 640 + Math.sin(t * 3 + i) * 12, 1.4, hexA(['#ff5fb0', '#9dff3a', '#fff'][i % 3], 0.9 - i * 0.15));
    ctx.restore();
  } else if (id === 'defeat_quiet') {
    drawBackdrop(ctx, 'hub', w, h, t, { staticAmt: 0.85 });
    ctx.fillStyle = 'rgba(4,2,16,.82)'; ctx.fillRect(0, 0, w, h);
    sceneBegin(ctx, w, h);
    glow(ctx, 270, 640, 300, '#2fe6ff', 0.3 + Math.sin(t * 2) * 0.05);
    drawLoopy(ctx, 270, 640, 140, { t, mood: 'worried' });
    ctx.globalAlpha = 0.9; sceneHeroes(ctx, t, { x: 100, pose: 'sad' }, { x: 440, pose: 'sad', flip: true }, 900, 900, 230); ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) fuzzy(ctx, 60 + i * 110, 180 + hn(i) * 80 + Math.sin(t + i) * 8, 30, t, { seed: i, grin: true });
    ctx.restore();
  } else {
    drawBackdrop(ctx, 'hub', w, h, t, {});
  }
  ctx.restore();
}

function baseTitle(ctx, w, h, t, o) {
  o = o || {}; t = t || 0; const beat = clamp(o.beat == null ? Math.pow(Math.max(0, 1 - ((t * 2) % 1) * 2.4), 2) : o.beat, 0, 1);
  ctx.save();
  drawBackdrop(ctx, 'title', w, h, t, { beat });
  sceneBegin(ctx, w, h);
  // rooftop stage
  rr(ctx, -40, 760, 620, 260, 20); fs(ctx, '#1c1240', 4); ctx.fillStyle = vgrad(ctx, 760, 960, '#2e1c5e', '#180e38'); rr(ctx, -40, 760, 620, 260, 20); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
  line(ctx, -20, 770, 560, 770, 5, '#ff5fb0'); line(ctx, -20, 782, 560, 782, 2.4, 'rgba(255,255,255,.3)');
  speakerStack(ctx, -6, 770, 1.35, '#2a1c4e'); speakerStack(ctx, 486, 770, 1.35, '#2a1c4e');
  // equalizer
  for (let i = 0; i < 24; i++) { const bh = 8 + (0.3 + 0.7 * Math.abs(Math.sin(t * (2 + hn(i) * 3) + i))) * 36 * (0.6 + beat * 0.6); rr(ctx, 6 + i * 22.2, 940 - bh, 15, bh, 3); ctx.fillStyle = i % 2 ? '#ff5fb0' : '#9dff3a'; ctx.fill(); }
  sceneHeroes(ctx, t, { x: 170, pose: 'beat' }, { x: 380, pose: 'sing', flip: true }, 850, 850, 330);
  drawLoopy(ctx, 270, 810, 84, { t, mood: 'happy' });
  for (let i = 0; i < 5; i++) { const k = ((t * 0.3 + i / 5) % 1); note(ctx, 110 + i * 80 + Math.sin(t + i) * 12, 700 - k * 360, 1.5, hexA(['#ff5fb0', '#9dff3a', '#ffd23c', '#2fe6ff'][i % 4], 1 - k)); }
  // Static peeking in from the corners
  fuzzy(ctx, -8 + Math.sin(t * 1.2) * 6, 600, 46, t, { seed: 1, grin: true }); fuzzy(ctx, 548 + Math.sin(t * 1.4) * 6, 560, 52, t, { seed: 2, grin: true }); fuzzy(ctx, 24, 470 + Math.sin(t) * 8, 28, t, { seed: 3 });
  ctx.restore();
  ctx.restore();
}

// ===================================================================================================================== AAA POST STACK
// Cached soft glow sprites (one radial gradient each, then drawImage), scratch canvases, bloom, grain, glitch, grading.
function scratch(key, w, h) {
  const k = 'scr:' + key + ':' + ART_SCALE;
  let c = cacheFx.get(k);
  if (c === undefined) { c = makeCanvas(w * ART_SCALE, h * ART_SCALE); cacheFx.set(k, c); }
  return c;
}
function glowSprite(col) {
  const k = 'glow:' + col;
  let c = cacheFx.get(k);
  if (c !== undefined) return c;
  c = makeCanvas(64, 64);
  if (c) {
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(0.25, hexA(col, 0.55)); gr.addColorStop(0.6, hexA(col, 0.14)); gr.addColorStop(1, hexA(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  cacheFx.set(k, c);
  return c;
}
// additive soft light
function glowSpr(ctx, col, x, y, r, a) {
  if (!(a > 0) || !(r > 0)) return;
  const sp = glowSprite(col);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
  if (sp) ctx.drawImage(sp, x - r, y - r, r * 2, r * 2); else { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(col, 1)); g.addColorStop(1, hexA(col, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  ctx.restore();
}
// a cone of light from (x,y) pointing along ang, widening to w1 at length len
function beam(ctx, x, y, ang, len, w0, w1, col, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, hexA(col, a)); g.addColorStop(0.5, hexA(col, a * 0.35)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -w0 / 2); ctx.lineTo(len, -w1 / 2); ctx.lineTo(len, w1 / 2); ctx.lineTo(0, w0 / 2); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function grainTile() {
  let c = cacheFx.get('grain');
  if (c !== undefined) return c;
  c = makeCanvas(96, 96);
  if (c) { const g = c.getContext('2d'), im = g.createImageData(96, 96); for (let i = 0; i < 96 * 96; i++) { const v = 100 + Math.floor(hn(i * 1.3) * 110); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } g.putImageData(im, 0, 0); }
  cacheFx.set('grain', c);
  return c;
}
// device pixel rectangle of the current (0,0,w,h) region, or null when the canvas cannot be read back
function deviceRect(ctx, w, h) {
  if (!ctx.canvas || typeof ctx.getTransform !== 'function') return null;
  const m = ctx.getTransform(); if (!m || !(m.a > 0) || !(m.d > 0) || m.b || m.c) return null;
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const x = Math.max(0, m.e), y = Math.max(0, m.f), x2 = Math.min(cw, m.e + w * m.a), y2 = Math.min(ch, m.f + h * m.d);
  if (x2 - x < 8 || y2 - y < 8) return null;
  return { x, y, w: x2 - x, h: y2 - y, m };
}
// bloom: shrink the finished frame in halving steps (clean filtering), keep the bright parts (square it), blow it back up additively
function bloom(ctx, w, h, amt) {
  const r = deviceRect(ctx, w, h); if (!r || !(amt > 0)) return;
  const L = [scratch('bl1', w / 2, h / 2), scratch('bl2', w / 4, h / 4), scratch('bl3', w / 8, h / 8), scratch('bl4', w / 16, h / 16)];
  if (L.some((c) => !c)) return;
  const g = L.map((c) => c.getContext('2d'));
  for (const q of g) { q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.imageSmoothingEnabled = true; q.imageSmoothingQuality = 'high'; }
  g[0].clearRect(0, 0, L[0].width, L[0].height); g[0].drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, L[0].width, L[0].height);
  for (let i = 1; i < 4; i++) { g[i].clearRect(0, 0, L[i].width, L[i].height); g[i].drawImage(L[i - 1], 0, 0, L[i].width, L[i].height); }
  g[2].globalCompositeOperation = 'multiply'; g[2].drawImage(L[2], 0, 0); g[2].globalCompositeOperation = 'source-over';          // bright pass
  g[3].clearRect(0, 0, L[3].width, L[3].height); g[3].drawImage(L[2], 0, 0, L[3].width, L[3].height);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = Math.min(1, amt * 0.7); ctx.drawImage(L[2], 0, 0, w, h); ctx.globalAlpha = Math.min(1, amt * 1.1); ctx.drawImage(L[3], 0, 0, w, h);
  ctx.restore();
}
// horizontal slice displacement with an RGB split, for the Static's glitches
function glitch(ctx, w, h, t, amt) {
  const r = deviceRect(ctx, w, h); if (!r || !(amt > 0.02)) return;
  const step = Math.floor(t * 14), n = 1 + Math.floor(amt * 4);
  for (let i = 0; i < n; i++) {
    const hs = hn(step * 3.1 + i * 7.7);
    if (hs < 0.55 - amt * 0.35) continue;
    const y = hn(step * 1.7 + i * 2.3) * h * 0.92, hh = 6 + hn(step + i) * 26 * (0.5 + amt), dx = (hn(step * 5.1 + i) - 0.5) * 46 * (0.4 + amt);
    const sx = r.x, sy = r.y + y * r.m.d, sw = r.w, sh = hh * r.m.d;
    ctx.save(); ctx.beginPath(); ctx.rect(0, y, w, hh); ctx.clip();
    ctx.drawImage(ctx.canvas, sx, sy, sw, sh, dx, y, w, hh);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * amt + 0.1; ctx.drawImage(ctx.canvas, sx, sy, sw, sh, dx + 5, y, w, hh);
    ctx.globalAlpha = 0.15 * amt; ctx.fillStyle = i % 2 ? '#2fe6ff' : '#ff3ca0'; ctx.fillRect(0, y, w, hh);
    ctx.restore();
  }
}
function vignette(ctx, w, h, a, col) {
  const g = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.32, w / 2, h * 0.5, Math.hypot(w, h) * 0.58);
  g.addColorStop(0, hexA(col || '#05010f', 0)); g.addColorStop(1, hexA(col || '#05010f', a));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function grade(ctx, w, h, top, bot, a) {
  ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = a;
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bot); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
}
function grain(ctx, w, h, t, a) {
  const tile = grainTile(); if (!tile || typeof ctx.createPattern !== 'function') return;
  const pat = ctx.createPattern(tile, 'repeat'); if (!pat) return;
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = a; const f = Math.floor(t * 12);
  ctx.translate((f * 37) % 96, (f * 59) % 96); ctx.fillStyle = pat; ctx.fillRect(-96, -96, w + 192, h + 192); ctx.restore();
}
function bokeh(ctx, w, h, t, n, col, a, seed) {
  for (let i = 0; i < n; i++) {
    const k = hn(i * 3.3 + seed), sp = 6 + hn(i + seed) * 16, x = ((hn(i * 1.9 + seed) * w + Math.sin(t * 0.4 + i) * 18) % w + w) % w;
    const y = ((hn(i * 5.7 + seed) * h - t * sp) % h + h) % h, r = 3 + k * 9;
    glowSpr(ctx, k > 0.7 ? '#ffffff' : col, x, y, r * 2.2, a * (0.4 + 0.6 * Math.abs(Math.sin(t * (0.8 + k) + i))));
  }
}
function letterbox(ctx, w, h, p) {
  const bh = h * 0.045 * Math.min(1, 0.5 + p * 4);
  const g = ctx.createLinearGradient(0, 0, 0, bh * 1.8); g.addColorStop(0, 'rgba(2,0,10,1)'); g.addColorStop(0.55, 'rgba(2,0,10,1)'); g.addColorStop(1, 'rgba(2,0,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, bh * 1.8);
  ctx.save(); ctx.translate(0, h); ctx.scale(1, -1); ctx.fillStyle = g; ctx.fillRect(0, 0, w, bh * 1.8); ctx.restore();
}

// per scene look: light source (fraction of w,h), light colour, grade colours, glitch amount, bloom, camera focus and parallax strength
const LOOK = {
  garage_day:     { light: [0.34, 0.12], lc: '#ffd9a0', gt: '#ffb060', gb: '#6a4a9a', ga: 0.5, bloom: 0.5, fy: 0.78, par: 1, dust: '#ffe0a8' },
  static_arrives: { light: [0.5, 0.0],  lc: '#c9c4d6', gt: '#8890b0', gb: '#2a2a44', ga: 0.6, bloom: 0.3, fy: 0.6, par: 0.6, glitch: 0.55, dust: '#c9c4d6' },
  silent_town:    { light: [0.2, 0.05], lc: '#8fa0d0', gt: '#7080b0', gb: '#2a2a50', ga: 0.6, bloom: 0.3, fy: 0.78, par: 1, glitch: 0.3, dust: '#aab4e0' },
  build:          { light: [0.5, 0.1],  lc: '#ffd9a0', gt: '#ffa050', gb: '#5a3a8a', ga: 0.5, bloom: 0.6, fy: 0.55, par: 1, dust: '#ffd23c' },
  van_night:      { light: [0.8, 0.5],  lc: '#ff7ab0', gt: '#4a2a90', gb: '#ff7ab0', ga: 0.55, bloom: 0.5, fy: 0.7, par: 0.8, glitch: 0.2, dust: '#ffd0ea' },
  boss_reveal:    { light: [0.5, 0.2],  lc: '#ff4fa0', gt: '#401060', gb: '#ff4fa0', ga: 0.6, bloom: 0.4, fy: 0.4, par: 0.8, dust: '#ff9ad2' },
  world_garage:   { light: [0.3, 0.1],  lc: '#ffd9a0', gt: '#ffb060', gb: '#6a4a9a', ga: 0.45, bloom: 0.5, fy: 0.78, par: 1, dust: '#ffe0a8' },
  world_busk:     { light: [0.2, 0.15], lc: '#9ab8ff', gt: '#4a78d0', gb: '#ffd88a', ga: 0.45, bloom: 0.5, fy: 0.78, par: 1, dust: '#cfe0ff' },
  world_club:     { light: [0.5, 0.0],  lc: '#ff4fd0', gt: '#a020c0', gb: '#2fe6ff', ga: 0.55, bloom: 0.8, fy: 0.78, par: 1, dust: '#ff9af0' },
  world_festival: { light: [0.7, 0.45], lc: '#ffb454', gt: '#ff7a5a', gb: '#6a2a70', ga: 0.5, bloom: 0.7, fy: 0.78, par: 1, dust: '#ffd88a' },
  world_arena:    { light: [0.5, 0.05], lc: '#ff5fb0', gt: '#4a2aa0', gb: '#ff5fb0', ga: 0.55, bloom: 0.8, fy: 0.78, par: 1, dust: '#c9a0ff' },
  boss_compressor:{ light: [0.5, 0.25], lc: '#8fa0d0', gt: '#3a4a80', gb: '#ff7a3c', ga: 0.55, bloom: 0.4, fy: 0.5, par: 0.8, glitch: 0.25, dust: '#aab4e0' },
  boss_noisegate: { light: [0.5, 0.3],  lc: '#ffcf4a', gt: '#3a3a80', gb: '#ffcf4a', ga: 0.5, bloom: 0.4, fy: 0.5, par: 0.8, glitch: 0.25, dust: '#ffe08a' },
  boss_reverb:    { light: [0.5, 0.3],  lc: '#9f7bff', gt: '#6020c0', gb: '#ff4fd0', ga: 0.55, bloom: 0.4, fy: 0.5, par: 0.8, glitch: 0.25, dust: '#c9b0ff' },
  boss_djglitch:  { light: [0.5, 0.25], lc: '#35f0c8', gt: '#ff7a5a', gb: '#35f0c8', ga: 0.55, bloom: 0.4, fy: 0.5, par: 0.8, glitch: 0.45, dust: '#8affe0' },
  boss_playback:  { light: [0.5, 0.2],  lc: '#ff4fa0', gt: '#401060', gb: '#ff4fa0', ga: 0.6, bloom: 0.4, fy: 0.45, par: 0.8, glitch: 0.2, dust: '#ff9ad2' },
  victory_stage:  { light: [0.5, 0.0],  lc: '#ffe9a0', gt: '#ffd23c', gb: '#ff5fb0', ga: 0.5, bloom: 0.9, fy: 0.78, par: 1.2, dust: '#fff1a8' },
  credits_van:    { light: [0.5, 0.5],  lc: '#fff1a8', gt: '#ff9a7a', gb: '#8a5aa0', ga: 0.5, bloom: 0.9, fy: 0.7, par: 0.6, dust: '#ffe9c4' },
  defeat_quiet:   { light: [0.5, 0.66], lc: '#2fe6ff', gt: '#101040', gb: '#2fe6ff', ga: 0.5, bloom: 0.5, fy: 0.65, par: 0.4, glitch: 0.5, dust: '#7a8ab0' },
  title:          { light: [0.5, 0.0],  lc: '#ff5fb0', gt: '#4a2aa0', gb: '#ff5fb0', ga: 0.55, bloom: 0.9, fy: 0.7, par: 0, dust: '#ffd0ea' },
};
const DEFAULT_LOOK = { light: [0.5, 0.1], lc: '#ffffff', gt: '#8070c0', gb: '#302060', ga: 0.4, bloom: 0.4, fy: 0.7, par: 0.6, dust: '#ffffff' };

function postStack(ctx, id, w, h, t, p, look, beat) {
  const lx = w * look.light[0], ly = h * look.light[1];
  // volumetric light: soft shafts from the key light, slowly swinging
  const sw = Math.sin(t * 0.35) * 0.12;
  for (let i = 0; i < 4; i++) {
    const ang = Math.PI / 2 + (i - 1.5) * 0.28 + sw + (look.light[0] - 0.5) * 0.4;
    beam(ctx, lx + (i - 1.5) * 18, ly, ang, h * 1.05, 18, 150 + i * 20, look.lc, 0.07 + beat * 0.05);
  }
  glowSpr(ctx, look.lc, lx, ly, Math.max(w, h) * 0.45, 0.14 + beat * 0.08);
  bokeh(ctx, w, h, t, 22, look.dust, 0.35, id.length * 3.7);
  bloom(ctx, w, h, look.bloom * 0.16);
  if (look.glitch) glitch(ctx, w, h, t, look.glitch);
  grade(ctx, w, h, look.gt, look.gb, look.ga);
  vignette(ctx, w, h, 0.5);
  grain(ctx, w, h, t, 0.07);
}

export function drawScene(ctx, id, w, h, t, o) {
  o = o || {}; t = t || 0;
  const p = clamp(o.progress == null ? 0.5 : o.progress, 0, 1);
  const look = LOOK[id] || DEFAULT_LOOK;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  // camera: slow push in, a little handheld drift, parallax between the background and the staged foreground
  const z = 1 + 0.07 * ease(p) + 0.006 * Math.sin(t * 0.7);
  const fy = h * look.fy;
  ctx.translate(w / 2 + Math.sin(t * 0.45) * 3, fy); ctx.scale(z, z); ctx.rotate(Math.sin(t * 0.5) * 0.0035); ctx.translate(-w / 2, -fy);
  PAR.x = (0.5 - p) * 34 * look.par; PAR.y = Math.sin(t * 0.8) * 2.5 * look.par;
  baseScene(ctx, id, w, h, t, o);
  PAR.x = 0; PAR.y = 0;
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  postStack(ctx, id, w, h, t, p, look, 0.5 + 0.5 * Math.sin(t * 6.5) * 0.4);
  letterbox(ctx, w, h, p);
  ctx.restore();
}

// ===================================================================================================================== TITLE
function titleLights(ctx, w, h, t, beat) {
  const s = sceneBegin(ctx, w, h);
  // stage trusses with laser fans on the beat, spotlights picking out the duo
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1, x = side < 0 ? 30 : 510, a = Math.PI / 2 + side * (0.25 + (i % 3) * 0.28) + Math.sin(t * (0.6 + i * 0.07) + i) * 0.22 * (0.5 + beat);
    beam(ctx, x, 40, a, 900, 6, 10, ['#ff5fb0', '#2fe6ff', '#9dff3a'][i % 3], 0.2 + beat * 0.18);
  }
  for (const [x, c] of [[170, '#9dff3a'], [380, '#ff5fb0']]) beam(ctx, x + Math.sin(t * 0.8 + x) * 40, -30, Math.PI / 2 + (x < 270 ? 0.12 : -0.12), 980, 40, 260, c, 0.08 + beat * 0.05);
  glowSpr(ctx, '#ff5fb0', 270, 800, 300, 0.1 + beat * 0.08);
  // front row of the crowd: silhouettes, raised hands, glow sticks and phone lights
  ctx.save();
  for (let i = 0; i < 15; i++) {
    const x = i * 38 - 6 + hn(i) * 12, bob = Math.sin(t * 3.2 + i * 1.7) * (3 + beat * 4), y = 960 + 6 - bob - hn(i + 5) * 16;
    ctx.fillStyle = '#07021a'; circle(ctx, x, y - 52, 17, '#07021a', 0); rr(ctx, x - 22, y - 38, 44, 90, 18); ctx.fill();
    if (i % 2 === 0) { const up = (Math.sin(t * 3.2 + i) * 0.5 + 0.5); line(ctx, x + 14, y - 30, x + 26 + up * 4, y - 78 - up * 14, 9, '#07021a'); if (i % 4 === 0) { const gx = x + 26 + up * 4, gy = y - 82 - up * 14; glowSpr(ctx, ['#9dff3a', '#ff5fb0', '#2fe6ff'][(i / 2) % 3 | 0], gx, gy, 20, 0.8); line(ctx, gx - 2, gy + 10, gx + 2, gy - 10, 5, '#fff'); } }
  }
  ctx.restore();
  ctx.restore();
}
export function drawTitle(ctx, w, h, t, o) {
  o = o || {}; t = t || 0;
  const beat = clamp(o.beat == null ? Math.pow(Math.max(0, 1 - ((t * 2) % 1) * 2.4), 2) : o.beat, 0, 1);
  const look = LOOK.title;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  const z = 1.02 + 0.012 * Math.sin(t * 0.4) + beat * 0.006;
  ctx.translate(w / 2, h * 0.7); ctx.scale(z, z); ctx.translate(-w / 2, -h * 0.7);
  baseTitle(ctx, w, h, t, o);
  titleLights(ctx, w, h, t, beat);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  const lx = w * 0.5;
  glowSpr(ctx, '#ff5fb0', lx, h * 0.18, Math.max(w, h) * 0.5, 0.12 + beat * 0.12);
  bokeh(ctx, w, h, t, 30, look.dust, 0.4, 5.5);
  bloom(ctx, w, h, 0.13 + beat * 0.06);
  grade(ctx, w, h, look.gt, look.gb, 0.45);
  vignette(ctx, w, h, 0.5);
  grain(ctx, w, h, t, 0.06);
  ctx.restore();
}
