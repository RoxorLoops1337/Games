// art_env.js: AAA environment art. Layered parallax backdrops (hub, title and the five stages), the battle board floor, the stage the duo defends.
// All canvas code, no files. Static art is cached offscreen at ART_SCALE; per-frame work is small (sprites, a few paths).
// Contract (see drop_the_bass/CLAUDE.md and ART_DIRECTION.md): every function restores ctx state, no Math.random and no Date (motion comes from t).
import { BOARD_X, BOARD_Y, BOARD_W, BOARD_H, TILE, COLS, ROWS, COL, WORLD_BY_ID, buildMap, laneAt, tileCx, tileCy } from './data_core.js';
import { drawHero } from './art_heroes.js';

let ART_SCALE = 2;
const cacheBg = new Map(), cacheBoard = new Map(), glowCache = new Map(), misc = new Map();
export function setArtScale(n) { ART_SCALE = Math.max(1, Math.min(3, n || 2)); cacheBg.clear(); cacheBoard.clear(); glowCache.clear(); misc.clear(); }
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

// ------------------------------------------------------------------------------------------------ small drawing helpers
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function fs(ctx, fill, lw, stroke) { if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (lw !== 0) { ctx.strokeStyle = stroke || OUT; ctx.lineWidth = lw == null ? 3 : lw; ctx.lineJoin = 'round'; ctx.stroke(); } }
function poly(ctx, pts, close) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (close !== false) ctx.closePath(); }
function circle(ctx, x, y, r, fill, lw, stroke) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.01, r), 0, TAU); fs(ctx, fill, lw == null ? 0 : lw, stroke); }
function line(ctx, x1, y1, x2, y2, w, col, cap) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineCap = cap || 'round'; ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }
function hexRgb(hex) {
  if (hex[0] === 'r') { const m = hex.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; }
  let h = hex.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function hexA(hex, a) { if (hex[0] === 'r' && hex[3] === 'a') return hex; const c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function mix(a, b, k) { const pa = hexRgb(a), pb = hexRgb(b); return 'rgb(' + Math.round(lerp(pa[0], pb[0], k)) + ',' + Math.round(lerp(pa[1], pb[1], k)) + ',' + Math.round(lerp(pa[2], pb[2], k)) + ')'; }
function vgrad(ctx, y0, y1, c0, c1, c2) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); if (c2) { g.addColorStop(0.5, c1); g.addColorStop(1, c2); } else g.addColorStop(1, c1); return g; }
function hgrad(ctx, x0, x1, c0, c1) { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }

// A glow is a pre-rendered radial sprite drawn additively: one drawImage instead of building a gradient every frame.
function glowTex(col) {
  let c = glowCache.get(col);
  if (c !== undefined) return c;
  c = makeCanvas(96, 96);
  if (c) {
    const g = c.getContext('2d'); if (!g) { c = null; } else {
      const rg = g.createRadialGradient(48, 48, 0, 48, 48, 48);
      rg.addColorStop(0, hexA(col, 1)); rg.addColorStop(0.25, hexA(col, 0.55)); rg.addColorStop(0.6, hexA(col, 0.14)); rg.addColorStop(1, hexA(col, 0));
      g.fillStyle = rg; g.fillRect(0, 0, 96, 96);
    }
  }
  glowCache.set(col, c); return c;
}
function bloom(ctx, x, y, r, col, a) {
  if (a <= 0.003 || r <= 0.5) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
  const g = glowTex(col);
  if (g) ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
  else { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, hexA(col, 0.7)); rg.addColorStop(1, hexA(col, 0)); ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  ctx.restore();
}
// soft elliptical contact shadow
function shadow(ctx, x, y, rx, ry, a) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, 'rgba(4,0,16,' + a + ')'); g.addColorStop(1, 'rgba(4,0,16,0)');
  ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
}
// a light cone: additive triangle with a falloff gradient along its length
function cone(ctx, x, y, ang, len, spread, col, a) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  const g = ctx.createLinearGradient(x, y, ex, ey); g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(ang - spread) * len, y + Math.sin(ang - spread) * len); ctx.lineTo(x + Math.cos(ang + spread) * len, y + Math.sin(ang + spread) * len); ctx.closePath(); ctx.fill(); ctx.restore();
}
function star4(ctx, x, y, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.2 : r; const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath(); ctx.fill();
}
// a lit panel: lighter top left, darker bottom right, thin rim light on the shadow side
function litRect(ctx, x, y, w, h, r, base, lw) {
  rr(ctx, x, y, w, h, r); const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h); g.addColorStop(0, mix(base, '#ffffff', 0.18)); g.addColorStop(0.5, base); g.addColorStop(1, mix(base, '#000000', 0.38));
  ctx.fillStyle = g; ctx.fill(); if (lw !== 0) { ctx.lineWidth = lw || 2.4; ctx.strokeStyle = OUT; ctx.stroke(); }
}
// tileable film grain, drawn at low alpha over static layers
function grainTile() {
  if (misc.has('grain')) return misc.get('grain');
  let c = makeCanvas(96, 96);
  if (c) {
    const g = c.getContext('2d');
    if (!g || !g.createImageData) c = null; else {
      const im = g.createImageData(96, 96);
      for (let i = 0; i < 96 * 96; i++) { const v = hn(i * 1.37) > 0.5 ? 255 : 0, a = hn(i * 3.1 + 7) * 70; im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = a; }
      g.putImageData(im, 0, 0);
    }
  }
  misc.set('grain', c); return c;
}
function grain(ctx, x, y, w, h, a) {
  const t = grainTile(); if (!t || a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let yy = y; yy < y + h; yy += 96) for (let xx = x; xx < x + w; xx += 96) ctx.drawImage(t, xx, yy);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ palettes
const SKY = {
  title: ['#0b0524', '#3a1470', '#d24fa6'], hub: ['#1a0f3e', '#53226e', '#ff8a7a'],
  garage: ['#150a2c', '#2c1850', '#4a2a70'], busk: ['#0a1838', '#1d3a74', '#5a7fc0'], club: ['#16062e', '#3d0f5e', '#8a1f86'],
  festival: ['#2a1252', '#d6486a', '#ffb454'], arena: ['#050520', '#1b0d52', '#4a1a8a'],
};
const GRADE = { title: '#ff4fb0', hub: '#ff9a7a', garage: '#ff9a3c', busk: '#4d8dff', club: '#ff4fd0', festival: '#ff8a3c', arena: '#7a4dff' };
const skyOf = (id) => SKY[id] || SKY.title;

// ------------------------------------------------------------------------------------------------ shared scenery pieces
function moonAA(ctx, x, y, r) {
  bloom(ctx, x, y, r * 5, '#9fb4ff', 0.28); bloom(ctx, x, y, r * 2.4, '#fff1d0', 0.5);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#e8d8b8');
  circle(ctx, x, y, r, g, 0);
  circle(ctx, x - r * 0.3, y - r * 0.2, r * 0.2, 'rgba(190,165,140,.35)', 0); circle(ctx, x + r * 0.35, y + r * 0.3, r * 0.27, 'rgba(190,165,140,.3)', 0); circle(ctx, x + r * 0.1, y - r * 0.5, r * 0.12, 'rgba(190,165,140,.3)', 0);
}
function starsAA(ctx, w, hz, n, seed) {
  for (let i = 0; i < n; i++) {
    const sx = hn(seed + i) * w, sy = Math.pow(hn(seed + i + 99), 1.4) * hz * 0.92, big = hn(i + seed + 5) > 0.93;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + hn(i + seed + 6) * 0.6) + ')'; ctx.fillRect(sx, sy, big ? 2.4 : 1.4, big ? 2.4 : 1.4);
    if (big) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(sx - 3, sy + 0.6, 8.4, 1.2); ctx.fillRect(sx + 0.6, sy - 3, 1.2, 8.4); }
  }
}
function cloudBand(ctx, w, y, hgt, seed, col, a) {
  for (let i = 0; i < Math.ceil(w / 90) + 2; i++) {
    const cx = i * 90 + hn(seed + i) * 60 - 30, cy = y + hn(seed + i + 5) * hgt, rx = 70 + hn(seed + i + 9) * 80, ry = 10 + hn(seed + i + 3) * 18;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0)); ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
  }
}
// a building: gradient body, lit edge, window grid with varied warm lights, optional roof props
function building(ctx, x, base, bw, bh, o) {
  const g = ctx.createLinearGradient(x, 0, x + bw, 0); g.addColorStop(0, mix(o.fill, '#ffffff', o.rim || 0.1)); g.addColorStop(0.22, o.fill); g.addColorStop(1, mix(o.fill, '#000000', 0.35));
  ctx.fillStyle = g; ctx.fillRect(x, base - bh, bw + 1, bh + 3);
  ctx.fillStyle = o.edge || 'rgba(255,255,255,.12)'; ctx.fillRect(x, base - bh, bw + 1, 2);
  const fade = ctx.createLinearGradient(0, base - bh, 0, base); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, o.haze || 'rgba(0,0,0,0)'); ctx.fillStyle = fade; ctx.fillRect(x, base - bh, bw + 1, bh + 3);
  if (o.win) {
    const cw = o.cw || 6, ch = o.ch || 8, sx = cw + 5, sy = ch + 6;
    for (let wy = base - bh + 10; wy < base - 10; wy += sy) for (let wx = x + 6; wx < x + bw - cw - 4; wx += sx) {
      const r = hn(o.seed + wx * 0.37 + wy * 1.13);
      if (r < o.winP) { const c = hn(wx + wy * 3) > 0.84 ? o.win2 || '#ff9ad2' : o.win; ctx.fillStyle = c; ctx.fillRect(wx, wy, cw, ch); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(wx, wy, cw, 1.5); }
      else if (r < o.winP + 0.12) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(wx, wy, cw, ch); }
    }
  }
  const k = hn(o.seed + x * 0.7);
  if (k > 0.72) { ctx.fillStyle = o.fill; ctx.fillRect(x + bw * 0.45, base - bh - 16, 2.6, 16); ctx.fillStyle = 'rgba(255,60,80,.9)'; ctx.fillRect(x + bw * 0.45 - 0.6, base - bh - 18, 3.8, 3); }
  else if (k > 0.5) { ctx.fillStyle = mix(o.fill, '#000000', 0.2); ctx.fillRect(x + bw * 0.2, base - bh - 10, bw * 0.28, 10); ctx.fillRect(x + bw * 0.6, base - bh - 7, bw * 0.2, 7); }
}
function skyline(ctx, w, base, seed, hmin, hmax, wmin, wmax, o) {
  let x = -20, i = 0;
  while (x < w + 20) { const bw = wmin + hn(seed + i * 3.1) * (wmax - wmin), bh = hmin + hn(seed + i * 7.7 + 1) * (hmax - hmin); building(ctx, x, base, bw, bh, Object.assign({ seed: seed + i }, o)); x += bw + (hn(seed + i) > 0.7 ? 6 : 0); i++; }
}
function speakerStackAA(ctx, x, yb, s, col) {
  for (let i = 0; i < 3; i++) {
    const yy = yb - (i + 1) * 40 * s; litRect(ctx, x, yy, 54 * s, 38 * s, 5 * s, col || '#2a2048', 2.6);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(x + 3 * s, yy + 3 * s, 48 * s, 3 * s);
    const cx = x + 27 * s, cy = yy + 22 * s; circle(ctx, cx, cy, 12.5 * s, '#0a0618', 2.2); circle(ctx, cx, cy, 9 * s, '#1c1438', 0); circle(ctx, cx - 1.6 * s, cy - 1.6 * s, 4.2 * s, '#4a3c88', 0); circle(ctx, cx - 2.4 * s, cy - 2.6 * s, 1.4 * s, 'rgba(255,255,255,.5)', 0);
    circle(ctx, x + 27 * s, yy + 8 * s, 3.2 * s, '#150e2c', 1.6); circle(ctx, x + 27 * s, yy + 8 * s, 1.2 * s, '#5a4aa0', 0);
  }
}
function bunting(ctx, x1, y1, x2, y2, sag, n, cols) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + sag, x2, y2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,4,30,.85)'; ctx.stroke();
  for (let i = 1; i < n; i++) {
    const k = i / n, px = lerp(x1, x2, k), py = (1 - k) * (1 - k) * y1 + 2 * k * (1 - k) * (Math.max(y1, y2) + sag) + k * k * y2;
    poly(ctx, [[px - 7, py], [px + 7, py], [px, py + 16]]); const c = cols[i % cols.length]; ctx.fillStyle = mix(c, '#000000', 0.08); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke();
    poly(ctx, [[px - 7, py], [px, py], [px - 1, py + 12]]); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
  }
}
function crowdRow(ctx, w, y, size, seed, col, hands) {
  for (let x = -10; x < w + 10; x += size * 0.75) {
    const k = hn(seed + x * 0.31), s = size * (0.8 + k * 0.4);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, s * 0.42, s * 0.5, 0, Math.PI, 0); ctx.fill(); circle(ctx, x, y - s * 0.62, s * 0.26, col, 0);
    if (hands && hn(seed + x * 0.7) > 0.6) { ctx.lineWidth = s * 0.14; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + s * 0.25, y - s * 0.3); ctx.lineTo(x + s * 0.45, y - s * 1.0); ctx.stroke(); }
  }
}

// ================================================================================================================ BACKDROPS
// Each stage has up to three static layers (far = rendered soft at low resolution for a depth-of-field look, mid, near) and a dynamic pass.
// Layers are cached per (id, w, h, scale) with a 24 px margin so a slow parallax drift never shows an edge.
const M = 24;
const bgFill = (ctx, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(-M, -M, w + 2 * M, h + 2 * M); };
const hzOf = (h) => h * 0.62;

function citySky(ctx, w, h, id) {
  const sk = skyOf(id), hz = hzOf(h);
  bgFill(ctx, w, h, vgrad(ctx, 0, h, sk[0], sk[1], sk[2]));
  starsAA(ctx, w, hz, Math.round(w / 4), id.length * 3);
  if (id === 'title') { moonAA(ctx, w * 0.78, h * 0.2, Math.min(w, h) * 0.07); cloudBand(ctx, w, h * 0.3, h * 0.1, 3, '#ff6ac0', 0.12); }
  else { bloom(ctx, w * 0.5, hz, w * 0.8, '#ff9a7a', 0.5); circle(ctx, w * 0.72, hz - h * 0.04, Math.min(w, h) * 0.06, hexA('#ffe0b0', 0.9), 0); cloudBand(ctx, w, h * 0.34, h * 0.12, 5, '#ffb08a', 0.16); }
  skyline(ctx, w, hz - 6, 3, 70, 200, 34, 76, { fill: mix(sk[1], '#0b0524', 0.45), win: null, haze: hexA(sk[2], 0.35), rim: 0.06 });
}
function cityMid(ctx, w, h, id) {
  const hz = hzOf(h), hub = id === 'hub';
  skyline(ctx, w, hz + 8, 17, 40, 160, 44, 92, { fill: hub ? '#2a1850' : '#170b3a', win: hub ? '#ffcf8a' : '#ff9ad2', win2: '#7ae6ff', winP: 0.4, edge: 'rgba(255,140,210,.45)', haze: hexA(skyOf(id)[2], 0.18), cw: 6, ch: 8 });
}
function cityNear(ctx, w, h, id) {
  const hz = hzOf(h), hub = id === 'hub';
  bgFill(ctx, w, h, 'rgba(0,0,0,0)');
  const g = vgrad(ctx, hz, h, hub ? '#34205a' : '#241446', hub ? '#120a2c' : '#0c0620'); ctx.fillStyle = g; ctx.fillRect(-M, hz, w + 2 * M, h - hz + M);
  // rooftop edge with props and string lights
  ctx.fillStyle = hub ? '#1c1040' : '#12082e'; ctx.fillRect(-M, hz + 4, w + 2 * M, 10); ctx.fillStyle = 'rgba(255,140,210,.4)'; ctx.fillRect(-M, hz + 4, w + 2 * M, 2);
  for (let i = 0; i < Math.ceil(w / 150); i++) { const x = 30 + i * 150 + hn(i) * 50; ctx.fillStyle = '#1c1040'; ctx.fillRect(x, hz - 26, 20, 30); ctx.fillRect(x - 3, hz - 32, 26, 6); line(ctx, x + 4, hz + 4, x + 4, hz - 26, 2, '#0a0420'); }
  bunting(ctx, -10, hz + 34, w + 10, hz + 40, 26, Math.ceil(w / 28), ['#ff5fb0', '#ffd23c', '#2fe6ff', '#9dff3a']);
  for (let y = 0; y < 9; y++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.02 + y * 0.004) + ')'; ctx.fillRect(-M, hz + 30 + y * y * 5, w + 2 * M, 2 + y * 0.6); }
  grain(ctx, -M, hz, w + 2 * M, h - hz + M, 0.04);
}
function cityDyn(ctx, w, h, t, beat, id) {
  const hz = hzOf(h);
  for (let i = 0; i < 14; i++) { const tw = Math.sin(t * 2 + i * 2.3); if (tw > 0.55) { ctx.fillStyle = 'rgba(255,255,255,' + (tw - 0.4) + ')'; ctx.fillRect(hn(i + 40) * w, hn(i + 41) * hz * 0.8, 2, 2); } }
  for (let i = 0; i < 6; i++) if (Math.sin(t * 2.2 + i * 1.9) > 0.2) bloom(ctx, hn(i + 70) * w, hz - 60 - hn(i + 71) * 150, 10, '#ff3c50', 0.7);
  if (id === 'title') for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + Math.sin(t * 0.6 + i * 2.1) * 0.5; cone(ctx, w * (0.2 + i * 0.3), hz, a, h * 0.9, 0.09, ['#ff5fb0', '#2fe6ff', '#9dff3a'][i], 0.22 + beat * 0.1); }
  else for (let i = 0; i < 16; i++) { const bx = (hn(i) * w + Math.sin(t * 0.5 + i) * 12), by = hz - 40 + hn(i + 4) * (h - hz), r = 8 + hn(i + 8) * 18 + beat * 4; bloom(ctx, bx, by, r * 2, ['#ff8ad8', '#ffd23c', '#2fe6ff'][i % 3], 0.2); }
}

// ---- garage: a cluttered brick garage with a hanging bulb
function garageMid(ctx, w, h) {
  const fl = h * 0.72;
  bgFill(ctx, w, h, '#2a1848');
  for (let y = -M, r = 0; y < fl; y += 18, r++) {
    for (let x = -M - (r % 2) * 22; x < w + M; x += 44) {
      const k = hn(x * 0.13 + r * 7.7), base = k > 0.8 ? '#4a2c5c' : k > 0.5 ? '#3a2260' : k > 0.25 ? '#321d56' : '#2a1848';
      rr(ctx, x + 1, y + 1, 42, 16, 2); const g = ctx.createLinearGradient(0, y, 0, y + 17); g.addColorStop(0, mix(base, '#ffffff', 0.1)); g.addColorStop(1, mix(base, '#000000', 0.25)); ctx.fillStyle = g; ctx.fill();
    }
  }
  ctx.fillStyle = vgrad(ctx, 0, fl, 'rgba(0,0,0,.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,.22)'); ctx.fillRect(-M, -M, w + 2 * M, fl + M);
  ctx.fillStyle = hgrad(ctx, 0, w * 0.35, 'rgba(0,0,0,.4)', 'rgba(0,0,0,0)'); ctx.fillRect(-M, -M, w * 0.35 + M, fl + M);
  // window with moon, stars and a frame
  const wx = w * 0.1, wy = h * 0.09, ww = Math.min(w * 0.3, 200), wh = ww * 0.82;
  rr(ctx, wx - 9, wy - 9, ww + 18, wh + 18, 8); ctx.fillStyle = '#6a4630'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip(); ctx.fillStyle = vgrad(ctx, wy, wy + wh, '#0a1244', '#34378e'); ctx.fillRect(wx, wy, ww, wh);
  starsAA(ctx, ww, wh * 0.8, 20, 11); ctx.restore();
  ctx.save(); ctx.translate(wx, wy); ctx.beginPath(); ctx.rect(0, 0, ww, wh); ctx.clip(); moonAA(ctx, ww * 0.7, wh * 0.3, ww * 0.12); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.08)'; poly(ctx, [[wx + 6, wy + 4], [wx + 40, wy + 4], [wx + 8, wy + wh - 6]]); ctx.fill();
  line(ctx, wx + ww / 2, wy, wx + ww / 2, wy + wh, 6, '#6a4630'); line(ctx, wx, wy + wh / 2, wx + ww, wy + wh / 2, 6, '#6a4630');
  line(ctx, wx - 10, wy + wh + 10, wx + ww + 10, wy + wh + 10, 6, '#7a5238');
  // posters taped to the wall
  [['#ff5fb0', 0.46, 0.08, 74, 100], ['#9dff3a', 0.6, 0.13, 86, 62], ['#2fe6ff', 0.78, 0.07, 66, 94], ['#ffc83d', 0.7, 0.22, 60, 70]].forEach(([c, fx, fy, pw, ph], i) => {
    ctx.save(); ctx.translate(w * fx, h * fy); ctx.rotate((hn(i * 3.3) - 0.5) * 0.14); shadow(ctx, pw / 2 + 3, ph + 2, pw * 0.6, 8, 0.4);
    litRect(ctx, 0, 0, pw, ph, 3, c, 2.6); circle(ctx, pw / 2, ph * 0.4, pw * 0.22, 'rgba(20,10,44,.75)', 0); rr(ctx, pw * 0.15, ph * 0.74, pw * 0.7, 6, 3); ctx.fillStyle = 'rgba(20,10,44,.7)'; ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,.75)'; ctx.fillRect(pw / 2 - 12, -4, 24, 8); ctx.restore();
  });
  // shelf with boxes and a radio
  const sy = h * 0.4; litRect(ctx, w * 0.45, sy, w * 0.5, 9, 2, '#7a5238', 2.4); shadow(ctx, w * 0.7, sy + 14, w * 0.25, 7, 0.35);
  for (let i = 0; i < 6; i++) { const bx = w * 0.47 + i * w * 0.08, bw = 30 + hn(i) * 18, bh = 22 + hn(i + 2) * 22; litRect(ctx, bx, sy - bh, bw, bh, 3, ['#b0803c', '#8a5a8a', '#3c7a8a', '#a04a4a'][i % 4], 2.4); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(bx + 3, sy - bh + 4, bw - 6, 3); }
  // pegboard with tools
  litRect(ctx, w * 0.05, h * 0.42, 150, 92, 6, '#3a2a58', 2.4);
  for (let i = 0; i < 7; i++) { const px = w * 0.05 + 16 + i * 20; line(ctx, px, h * 0.42 + 14, px, h * 0.42 + 26 + hn(i) * 38, 5, ['#ff5fb0', '#9dff3a', '#ffd23c', '#2fe6ff'][i % 4]); circle(ctx, px, h * 0.42 + 12, 2.4, '#bbb', 0); }
  // REC sign (the tube is static, the glow is dynamic)
  rr(ctx, w * 0.3, h * 0.07, 66, 28, 7); ctx.fillStyle = '#1a0e2e'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke(); ctx.font = '900 18px Impact, sans-serif'; ctx.fillStyle = '#ff5a6e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('REC', w * 0.3 + 40, h * 0.07 + 15); circle(ctx, w * 0.3 + 12, h * 0.07 + 14, 5, '#ff3c50', 0);
  grain(ctx, -M, -M, w + 2 * M, fl + M, 0.05);
}
function garageNear(ctx, w, h) {
  const fl = h * 0.72;
  ctx.fillStyle = vgrad(ctx, fl, h, '#5a3a28', '#241410'); ctx.fillRect(-M, fl, w + 2 * M, h - fl + M);
  for (let i = -8; i < 20; i++) { const x = (i - 2) * 56; ctx.beginPath(); ctx.moveTo(x, h + M); ctx.lineTo(w / 2 + (x - w / 2) * 0.42, fl); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.32)'; ctx.stroke(); }
  for (let r = 0; r < 6; r++) { const y = fl + Math.pow(r / 6, 1.7) * (h - fl); ctx.fillStyle = 'rgba(255,200,150,' + (0.05 + r * 0.01) + ')'; ctx.fillRect(-M, y, w + 2 * M, 1.6); }
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(-M, fl, w + 2 * M, 4);
  speakerStackAA(ctx, w * 0.84, fl + 16, 1.25, '#2e2250'); shadow(ctx, w * 0.84 + 34, fl + 20, 60, 9, 0.5);
  // drum kit: kick, toms, snare, hi hat stand and a cymbal
  const dx = w * 0.3, dy = fl + 14; shadow(ctx, dx, dy + 2, 90, 11, 0.5);
  circle(ctx, dx, dy - 34, 31, '#40305f', 3); const kg = ctx.createRadialGradient(dx - 8, dy - 44, 2, dx, dy - 34, 31); kg.addColorStop(0, 'rgba(255,255,255,.25)'); kg.addColorStop(1, 'rgba(0,0,0,.35)'); circle(ctx, dx, dy - 34, 29, kg, 0); circle(ctx, dx, dy - 34, 13, '#1c1230', 0);
  [[-54, -56], [54, -54]].forEach(([ox, oy]) => { circle(ctx, dx + ox, dy + oy, 19, '#40305f', 3); circle(ctx, dx + ox, dy + oy, 15, 'rgba(255,255,255,.14)', 0); });
  line(ctx, dx - 84, dy - 96, dx - 84, dy, 3, '#6a5a8a'); ctx.beginPath(); ctx.ellipse(dx - 84, dy - 98, 22, 4.4, 0, 0, TAU); fs(ctx, '#e0b040', 2.4); ctx.beginPath(); ctx.ellipse(dx - 86, dy - 99, 12, 1.8, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill();
  // cables on the floor
  ctx.lineCap = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = '#120a1c'; ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.8); ctx.bezierCurveTo(w * 0.25, h * 0.86, w * 0.4, h * 0.78, w * 0.6, h * 0.88); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.stroke();
}
function garageDyn(ctx, w, h, t, beat) {
  const lx = w * 0.5, sw = Math.sin(t * 1.3) * 6, by = h * 0.22;
  line(ctx, lx, -4, lx + sw * 0.4, by - 10, 2, '#1a1020'); circle(ctx, lx + sw, by, 9, '#fff2c0', 1.8, OUT); poly(ctx, [[lx + sw - 14, by - 6], [lx + sw + 14, by - 6], [lx + sw + 24, by + 10], [lx + sw - 24, by + 10]]); fs(ctx, '#caa050', 2.4);
  bloom(ctx, lx + sw, by + 8, 230, '#ffcf8a', 0.5 + beat * 0.12);
  cone(ctx, lx + sw, by + 10, Math.PI / 2 + sw * 0.002, h * 0.62, 0.45, '#ffd9a0', 0.16);
  const wx = w * 0.1, wy = h * 0.09, ww = Math.min(w * 0.3, 200); cone(ctx, wx + ww * 0.7, wy + ww * 0.3, Math.PI * 0.42, h * 0.7, 0.2, '#9fb4ff', 0.07);
  const rec = Math.sin(t * 3) > 0; bloom(ctx, w * 0.3 + 12, h * 0.07 + 14, rec ? 34 : 14, '#ff3c50', rec ? 0.9 : 0.25);
  for (let i = 0; i < 26; i++) { const mx = (hn(i) * w + t * (3 + hn(i + 5) * 5)) % w, my = hn(i + 9) * h * 0.72 + Math.sin(t * 0.7 + i) * 10; ctx.fillStyle = 'rgba(255,240,200,' + (0.18 + 0.3 * hn(i + 3)) + ')'; ctx.fillRect(mx, my, 1.8, 1.8); }
}

// ---- busk: a rainy old town street at night
function buskFar(ctx, w, h) {
  const sk = skyOf('busk'), hz = hzOf(h);
  bgFill(ctx, w, h, vgrad(ctx, 0, h, sk[0], sk[1], sk[2]));
  starsAA(ctx, w, hz, Math.round(w / 8), 21); moonAA(ctx, w * 0.2, h * 0.16, Math.min(w, h) * 0.055); cloudBand(ctx, w, h * 0.12, h * 0.25, 8, '#1a2c5a', 0.5);
  skyline(ctx, w, hz - 10, 5, 90, 220, 36, 70, { fill: '#162a5a', win: '#ffd88a', winP: 0.25, haze: 'rgba(90,127,192,.4)', rim: 0.05 });
}
function buskMid(ctx, w, h) {
  const hz = hzOf(h);
  skyline(ctx, w, hz + 8, 31, 70, 170, 56, 108, { fill: '#0e1c42', win: '#ffcf6a', win2: '#ffe9b0', winP: 0.45, edge: 'rgba(120,160,255,.35)', haze: 'rgba(60,90,160,.28)', cw: 8, ch: 11 });
  // awnings and shop signs on the lower storeys
  for (let i = 0; i < Math.ceil(w / 130); i++) {
    const x = 20 + i * 130 + hn(i * 5) * 30, y = hz - 26 - hn(i) * 12, c = ['#c8404a', '#3a8a6a', '#d8a030', '#4a6ad0'][i % 4];
    poly(ctx, [[x, y], [x + 70, y], [x + 78, y + 20], [x - 8, y + 20]]); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    for (let s = 0; s < 5; s++) { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x + s * 14, y, 7, 18); }
    ctx.fillStyle = 'rgba(255,215,140,.55)'; ctx.fillRect(x + 4, y + 24, 60, 22); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 4, y + 24, 60, 4);
  }
  // clock tower
  const tx = w * 0.62; ctx.fillStyle = '#0c1838'; ctx.fillRect(tx, hz - 250, 34, 258); poly(ctx, [[tx - 4, hz - 250], [tx + 38, hz - 250], [tx + 17, hz - 290]]); ctx.fill();
  circle(ctx, tx + 17, hz - 214, 12, '#ffe9a8', 2.4); line(ctx, tx + 17, hz - 214, tx + 17, hz - 222, 2, OUT); line(ctx, tx + 17, hz - 214, tx + 23, hz - 212, 2, OUT);
}
function buskNear(ctx, w, h) {
  const hz = hzOf(h);
  ctx.fillStyle = vgrad(ctx, hz, h, '#2c3a68', '#0e1634'); ctx.fillRect(-M, hz, w + 2 * M, h - hz + M);
  for (let y = hz + 4, r = 0; y < h + M; y += 12 + r * 2.4, r++) for (let x = (r % 2) * 12 - 24; x < w + M; x += 26 + r * 1.6) {
    rr(ctx, x, y, 22 + r * 1.4, 9.5 + r * 0.8, 4); const k = hn(x * 3.1 + y * 1.7); ctx.fillStyle = k > 0.6 ? 'rgba(140,170,240,.2)' : k > 0.25 ? 'rgba(0,0,30,.2)' : 'rgba(255,220,150,.07)'; ctx.fill();
  }
  // wet reflections of the lamps and a few puddles
  for (let i = 0; i < 4; i++) { const lx = w * (0.12 + i * 0.26); const g = ctx.createLinearGradient(0, hz + 6, 0, h); g.addColorStop(0, 'rgba(255,216,140,.34)'); g.addColorStop(1, 'rgba(255,216,140,0)'); ctx.fillStyle = g; ctx.fillRect(lx - 10, hz + 6, 20, h - hz); }
  for (let i = 0; i < 6; i++) { const px = hn(i + 60) * w, py = hz + 60 + hn(i + 61) * (h - hz - 80), pw = 50 + hn(i + 62) * 80; ctx.beginPath(); ctx.ellipse(px, py, pw, pw * 0.16, 0, 0, TAU); ctx.fillStyle = 'rgba(120,160,255,.18)'; ctx.fill(); ctx.beginPath(); ctx.ellipse(px - pw * 0.2, py - 1, pw * 0.45, pw * 0.05, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill(); }
  for (let i = 0; i < 4; i++) { const lx = w * (0.12 + i * 0.26), ly = hz + 6; shadow(ctx, lx, ly + 2, 16, 4, 0.5); line(ctx, lx, ly, lx, ly - 96, 5, '#0a1230'); line(ctx, lx - 1.6, ly, lx - 1.6, ly - 96, 1.4, 'rgba(160,190,255,.35)'); ctx.beginPath(); ctx.arc(lx + 8, ly - 96, 8, Math.PI, Math.PI * 1.5); ctx.lineWidth = 3.4; ctx.strokeStyle = '#0a1230'; ctx.stroke(); }
  bunting(ctx, -10, hz - 44, w + 10, hz - 28, 28, Math.ceil(w / 30), ['#ff5fb0', '#ffd23c', '#2fe6ff']);
}
function buskDyn(ctx, w, h, t, beat) {
  const hz = hzOf(h);
  for (let i = 0; i < 4; i++) { const lx = w * (0.12 + i * 0.26), fl = 0.85 + Math.sin(t * 7 + i * 2.3) * 0.1; circle(ctx, lx + 8, hz - 96 + 4, 5, '#fff2c0', 0); bloom(ctx, lx + 8, hz - 90, 110 + beat * 14, '#ffd88a', 0.55 * fl); cone(ctx, lx + 8, hz - 92, Math.PI / 2, 150, 0.4, '#ffd88a', 0.1); }
  ctx.save(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(180,205,255,.32)'; ctx.beginPath();
  for (let i = 0; i < 70; i++) { const x = (hn(i) * (w + 80) + t * 40) % (w + 80) - 40, y = (hn(i + 7) * h + t * (480 + hn(i + 3) * 160)) % (h + 40) - 20; ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16); }
  ctx.stroke(); ctx.restore();
  for (let i = 0; i < 8; i++) { const nx = hn(i) * w + Math.sin(t * 0.8 + i) * 18, ny = h - ((hn(i + 3) * h + t * 18) % h); ctx.fillStyle = 'rgba(255,208,234,.5)'; ctx.beginPath(); ctx.ellipse(nx, ny, 4.4, 3.2, -0.4, 0, TAU); ctx.fill(); line(ctx, nx + 3.6, ny - 1, nx + 3.6, ny - 12, 2, 'rgba(255,208,234,.5)'); }
  const fh = ctx.createLinearGradient(0, hz - 40, 0, hz + 90); fh.addColorStop(0, 'rgba(90,127,192,0)'); fh.addColorStop(0.5, 'rgba(120,150,220,.12)'); fh.addColorStop(1, 'rgba(90,127,192,0)'); ctx.fillStyle = fh; ctx.fillRect(0, hz - 40, w, 130);
}

// ---- club: LED wall, truss with moving heads, glossy dance floor, haze and a crowd
function clubFar(ctx, w, h) {
  const hz = h * 0.58;
  bgFill(ctx, w, h, vgrad(ctx, 0, hz, '#0e0318', '#3a1056'));
  for (let x = 0; x < w; x += 30) for (let y = 0; y < hz; y += 30) { const k = hn(x * 0.31 + y * 0.77); ctx.fillStyle = hexA(['#ff4fd0', '#2fe6ff', '#7a4dff'][Math.floor(k * 3)], 0.06 + k * 0.12); rr(ctx, x + 2, y + 2, 26, 26, 4); ctx.fill(); }
  ctx.fillStyle = vgrad(ctx, 0, hz, 'rgba(0,0,0,.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,.3)'); ctx.fillRect(-M, -M, w + 2 * M, hz + M);
}
function clubMid(ctx, w, h) {
  const hz = h * 0.58;
  for (let i = 0; i < 2; i++) { const ty = 14 + i * 28; line(ctx, -M, ty, w + M, ty, 5, '#55557a'); line(ctx, -M, ty + 1, w + M, ty + 1, 1.4, 'rgba(255,255,255,.3)'); for (let x = -M; x < w + M; x += 26) line(ctx, x, ty, x + 13, ty + 14, 2, '#40405e'); }
  for (let i = 0; i < 7; i++) { const ox = w * (0.1 + i * 0.13); rr(ctx, ox - 9, 20, 18, 22, 4); ctx.fillStyle = '#1a1230'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); circle(ctx, ox, 42, 6, '#2a2050', 1.6); }
  // neon sign
  ctx.save(); ctx.font = '900 40px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6; ctx.strokeStyle = '#6a1a5a'; ctx.strokeText('NEON', w * 0.5, hz * 0.55); ctx.fillStyle = '#ffd0f0'; ctx.fillText('NEON', w * 0.5, hz * 0.55); ctx.restore();
  ctx.fillStyle = vgrad(ctx, hz, h, '#26104a', '#0a0216'); ctx.fillRect(-M, hz, w + 2 * M, h - hz + M);
  const cols = ['#ff4fd0', '#2fe6ff', '#9dff3a', '#ffd23c'];
  for (let r = 0; r < 10; r++) for (let c = -8; c < 16; c++) {
    const y0 = hz + (r / 10) * (r / 10) * (h - hz), y1 = hz + ((r + 1) / 10) * ((r + 1) / 10) * (h - hz), k0 = (y0 - hz) / (h - hz), k1 = (y1 - hz) / (h - hz), cx = w / 2, sw0 = (w / 8) * (0.35 + k0 * 1.2), sw1 = (w / 8) * (0.35 + k1 * 1.2);
    poly(ctx, [[cx + (c - 4) * sw0 + 1, y0 + 1], [cx + (c - 3) * sw0 - 1, y0 + 1], [cx + (c - 3) * sw1 - 1, y1 - 1], [cx + (c - 4) * sw1 + 1, y1 - 1]]);
    ctx.fillStyle = hexA(cols[(r * 3 + c + 40) % 4], 0.1 + 0.07 * ((r + c) & 1)); ctx.fill();
  }
  const refl = ctx.createLinearGradient(0, hz, 0, h); refl.addColorStop(0, 'rgba(255,79,208,.22)'); refl.addColorStop(0.3, 'rgba(255,79,208,0)'); ctx.fillStyle = refl; ctx.fillRect(-M, hz, w + 2 * M, h - hz + M);
  shadow(ctx, w * 0.02 + 42, hz + 40, 70, 10, 0.5); shadow(ctx, w * 0.98 - 42, hz + 40, 70, 10, 0.5);
  speakerStackAA(ctx, w * 0.02, hz + 40, 1.55, '#2c1a52'); speakerStackAA(ctx, w * 0.98 - 84, hz + 40, 1.55, '#2c1a52');
}
function clubNear(ctx, w, h) {
  const hz = h * 0.58; ctx.fillStyle = '#05010c'; crowdRow(ctx, w, h * 0.9, 56, 9, '#080212', true); crowdRow(ctx, w, h * 0.97, 78, 21, '#040108', true);
  ctx.fillStyle = vgrad(ctx, h * 0.8, h, 'rgba(0,0,0,0)', 'rgba(0,0,0,.65)'); ctx.fillRect(-M, h * 0.8, w + 2 * M, h * 0.2 + M);
}
function clubDyn(ctx, w, h, t, beat) {
  const hz = h * 0.58, cols = ['#ff4fd0', '#2fe6ff', '#9dff3a'];
  for (let i = 0; i < 7; i++) { const ox = w * (0.1 + i * 0.13), a = Math.PI / 2 + Math.sin(t * 1.2 + i * 1.1) * 0.75; cone(ctx, ox, 44, a, h * 0.95, 0.07, cols[i % 3], 0.34 + beat * 0.15); bloom(ctx, ox, 44, 26, cols[i % 3], 0.8); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.6;
  for (let i = 0; i < 6; i++) { const ox = w * (0.15 + i * 0.14), a = Math.PI / 2 + Math.sin(t * 2.1 + i * 1.7) * 1.0; ctx.strokeStyle = hexA(cols[(i + 1) % 3], 0.5); ctx.beginPath(); ctx.moveTo(ox, 40); ctx.lineTo(ox + Math.cos(a) * h, 40 + Math.sin(a) * h); ctx.stroke(); }
  ctx.restore();
  const bx = w * 0.5, by = h * 0.2, r = Math.min(w, h) * 0.07; line(ctx, bx, -4, bx, by - r, 2, '#aaa'); const bg = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, r * 0.1, bx, by, r); bg.addColorStop(0, '#e4e8ff'); bg.addColorStop(1, '#6a70a0'); circle(ctx, bx, by, r, bg, 2.4);
  for (let i = 0; i < 22; i++) { const a = t * 1.5 + i * 1.7, fx = bx + Math.cos(a) * r * 0.8 * Math.sin(i), fy = by + Math.sin(i * 3.1) * r * 0.82; if (Math.cos(a) > 0) { ctx.fillStyle = ['#fff', '#2fe6ff', '#ff4fd0'][i % 3]; ctx.fillRect(fx - 2, fy - 2, 4, 4); } }
  bloom(ctx, bx, by, r * 3.4, '#cfd4ff', 0.16 + beat * 0.1);
  for (let i = 0; i < 12; i++) { const a = t * 0.6 + i * 0.53, sx = (Math.cos(a) * 0.5 + 0.5) * w, sy = hz * 0.15 + (Math.sin(a * 1.3) * 0.5 + 0.5) * hz * 0.8; bloom(ctx, sx, sy, 10 + beat * 6, cols[i % 3], 0.5); }
  // floor tiles pulse with the beat and the haze drifts
  const fl = ctx.createLinearGradient(0, hz, 0, h); fl.addColorStop(0, hexA(cols[Math.floor(t * 0.5) % 3], 0.1 + beat * 0.2)); fl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = fl; ctx.fillRect(0, hz, w, h - hz); ctx.restore();
  for (let i = 0; i < 4; i++) { const fx = ((t * 14 + i * w * 0.4) % (w * 1.6)) - w * 0.3; bloom(ctx, fx, h * (0.5 + i * 0.1), w * 0.5, '#b890ff', 0.1); }
  ctx.fillStyle = 'rgba(0,0,0,.9)'; for (let i = 0; i < 2; i++) { const row = i ? h * 0.97 : h * 0.9; crowdRow(ctx, w, row + Math.sin(t * 4 + i) * (3 + beat * 4), i ? 78 : 56, 9 + i * 12, i ? '#040108' : '#080212', true); }
}

// ---- festival: a big sunset sky, tents, a ferris wheel, a stage, a waving crowd
function festFar(ctx, w, h) {
  const hz = hzOf(h);
  bgFill(ctx, w, h, vgrad(ctx, 0, hz + 20, '#2a1252', '#d6486a', '#ffb454'));
  bloom(ctx, w * 0.5, hz - 8, w * 0.8, '#ffd070', 0.7); bloom(ctx, w * 0.5, hz - 8, w * 0.3, '#fff0b0', 0.8); circle(ctx, w * 0.5, hz - 14, Math.min(w, h) * 0.15, '#ffe9a8', 0);
  const sg = ctx.createRadialGradient(w * 0.5, hz - 20, 4, w * 0.5, hz - 14, Math.min(w, h) * 0.15); sg.addColorStop(0, '#fffbe0'); sg.addColorStop(1, '#ffc060'); circle(ctx, w * 0.5, hz - 14, Math.min(w, h) * 0.15, sg, 0);
  for (let i = 0; i < 7; i++) { ctx.fillStyle = 'rgba(90,20,80,.3)'; ctx.fillRect(w * 0.5 - Math.min(w, h) * 0.15, hz - 14 - Math.min(w, h) * 0.1 + i * 8, Math.min(w, h) * 0.3, 1.2 + i * 0.5); }
  cloudBand(ctx, w, h * 0.12, h * 0.2, 41, '#ff9ab0', 0.4); cloudBand(ctx, w, h * 0.3, h * 0.12, 47, '#ffd0a0', 0.35); cloudBand(ctx, w, h * 0.06, h * 0.1, 55, '#6a2a80', 0.45);
  ctx.fillStyle = '#7a2f5e'; ctx.beginPath(); ctx.moveTo(-M, hz); for (let x = -M; x <= w + M; x += 18) ctx.lineTo(x, hz - 30 - Math.sin(x * 0.011) * 22 - hn(x) * 7); ctx.lineTo(w + M, hz); ctx.fill();
  ctx.fillStyle = '#5a2250'; ctx.beginPath(); ctx.moveTo(-M, hz + 6); for (let x = -M; x <= w + M; x += 18) ctx.lineTo(x, hz - 10 - Math.sin(x * 0.02 + 2) * 15); ctx.lineTo(w + M, hz + 6); ctx.fill();
}
function festMid(ctx, w, h) {
  const hz = hzOf(h);
  for (let i = 0; i < Math.ceil(w / 120) + 1; i++) {
    const tx = 30 + i * 120 + hn(i) * 30, ty = hz + 4, tw = 56 + hn(i + 4) * 22, th = 38 + hn(i + 8) * 16, c = i % 2 ? '#ffe9d0' : '#ff6a8a';
    shadow(ctx, tx, ty + 2, tw * 0.6, 6, 0.4);
    poly(ctx, [[tx - tw / 2, ty], [tx, ty - th], [tx + tw / 2, ty]]); const g = ctx.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0); g.addColorStop(0, mix(c, '#fff', 0.15)); g.addColorStop(1, mix(c, '#400020', 0.45)); ctx.fillStyle = g; ctx.fill();
    ctx.save(); poly(ctx, [[tx - tw / 2, ty], [tx, ty - th], [tx + tw / 2, ty]]); ctx.clip(); for (let s = -3; s < 4; s += 2) { ctx.fillStyle = i % 2 ? 'rgba(255,140,170,.55)' : 'rgba(255,255,255,.5)'; ctx.fillRect(tx + s * 7 - 3.5, ty - th, 7, th); } ctx.restore();
    poly(ctx, [[tx - tw / 2, ty], [tx, ty - th], [tx + tw / 2, ty]]); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke(); line(ctx, tx, ty - th, tx, ty - th - 10, 2, OUT); poly(ctx, [[tx, ty - th - 10], [tx + 10, ty - th - 7], [tx, ty - th - 4]]); ctx.fillStyle = '#ffd23c'; ctx.fill();
  }
  // festival stage with a banner truss
  const sx = w * 0.12, sw = Math.min(w * 0.3, 190); litRect(ctx, sx, hz - 60, sw, 62, 4, '#26144a', 2.6); litRect(ctx, sx - 6, hz - 70, sw + 12, 12, 3, '#4a3a7a', 2.4); ctx.font = '900 16px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23c'; ctx.fillText('LIVE', sx + sw / 2, hz - 24);
  bunting(ctx, -10, hz - 100, w + 10, hz - 80, 34, Math.ceil(w / 30), ['#ff5fb0', '#ffd23c', '#9dff3a', '#2fe6ff']);
  ctx.fillStyle = vgrad(ctx, hz, h, '#7a4a5c', '#3a2a4a', '#1a1030'); ctx.fillRect(-M, hz, w + 2 * M, h - hz + M);
  for (let y = 0; y < 10; y++) { ctx.fillStyle = (y & 1) ? 'rgba(255,220,150,.05)' : 'rgba(0,0,0,.06)'; ctx.fillRect(-M, hz + y * y * 3.2, w + 2 * M, 6 + y * 3); }
  for (let i = 0; i < w / 4; i++) { const gx = hn(i) * w, gy = hz + hn(i + 3) * (h - hz); line(ctx, gx, gy, gx + 2, gy - 6 - hn(i + 8) * 6, 1.4, 'rgba(255,170,120,.22)'); }
  grain(ctx, -M, hz, w + 2 * M, h - hz + M, 0.05);
}
function festNear(ctx, w, h) {
  crowdRow(ctx, w, h * 0.93, 70, 3, '#12061e', true); crowdRow(ctx, w, h * 1.0, 96, 33, '#0a0412', true);
  ctx.fillStyle = vgrad(ctx, h * 0.8, h, 'rgba(0,0,0,0)', 'rgba(0,0,0,.5)'); ctx.fillRect(-M, h * 0.8, w + 2 * M, h * 0.2 + M);
}
function festDyn(ctx, w, h, t, beat) {
  const hz = hzOf(h), fx = w * 0.78, fy = hz - 78, R = Math.min(w, h) * 0.13;
  line(ctx, fx, fy, fx - R * 0.55, hz + 4, 5, '#3a1a44'); line(ctx, fx, fy, fx + R * 0.55, hz + 4, 5, '#3a1a44');
  ctx.beginPath(); ctx.arc(fx, fy, R, 0, TAU); ctx.lineWidth = 4; ctx.strokeStyle = '#4a2454'; ctx.stroke(); ctx.beginPath(); ctx.arc(fx, fy, R * 0.55, 0, TAU); ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < 8; i++) { const a = t * 0.25 + i * TAU / 8, px = fx + Math.cos(a) * R, py = fy + Math.sin(a) * R; line(ctx, fx, fy, px, py, 2, '#4a2454'); rr(ctx, px - 7, py, 14, 10, 3); fs(ctx, ['#ff5fb0', '#ffd23c', '#2fe6ff', '#9dff3a'][i % 4], 2); bloom(ctx, px, py + 4, 16, '#ffd070', 0.5); circle(ctx, px, py, 2.4, '#ffe9a8', 0); }
  for (let i = 0; i < 3; i++) { const bx = ((hn(i + 5) * w + t * (6 + i * 2)) % (w + 120)) - 60, by = h * (0.14 + i * 0.07) + Math.sin(t * 0.6 + i) * 8, c = ['#ff5fb0', '#ffd23c', '#2fe6ff'][i]; ctx.beginPath(); ctx.ellipse(bx, by, 20, 25, 0, 0, TAU); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke(); ctx.beginPath(); ctx.ellipse(bx - 6, by - 8, 5, 9, 0.4, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill(); rr(ctx, bx - 6, by + 28, 12, 8, 2); fs(ctx, '#8a5a34', 1.8); line(ctx, bx - 5, by + 24, bx - 4, by + 28, 1.2, OUT); line(ctx, bx + 5, by + 24, bx + 4, by + 28, 1.2, OUT); }
  for (let i = 0; i < 3; i++) { const sx = w * 0.5 + (i - 1) * w * 0.22; cone(ctx, w * 0.5, hz - 14, -Math.PI / 2 + (i - 1) * 0.55 + Math.sin(t * 0.3 + i) * 0.05, h * 0.9, 0.09, '#ffe0a0', 0.075 + beat * 0.03); }
  bloom(ctx, w * 0.5, hz - 14, w * 0.35, '#ffcf80', 0.25 + beat * 0.12);
  for (let i = 0; i < 22; i++) { const px = (hn(i) * w + t * (6 + hn(i + 2) * 8)) % w, py = h * 0.15 + hn(i + 9) * h * 0.6 + Math.sin(t + i) * 8; ctx.fillStyle = 'rgba(255,230,170,' + (0.2 + 0.3 * hn(i + 4)) + ')'; ctx.fillRect(px, py, 2.2, 2.2); }
  for (let i = 0; i < 2; i++) crowdRow(ctx, w, (i ? h * 1.0 : h * 0.93) + Math.sin(t * 3 + i * 2) * (2 + beat * 3), i ? 96 : 70, i ? 33 : 3, i ? '#0a0412' : '#12061e', true);
}

// ---- arena: a stadium with a giant LED screen, floodlights, tiers of crowd and pyro
function arenaFar(ctx, w, h) {
  const hz = h * 0.56;
  bgFill(ctx, w, h, vgrad(ctx, 0, hz, '#03031a', '#1c0e50'));
  for (let r = 0; r < 10; r++) { const y = hz - 14 - r * 24, inset = r * 11; ctx.fillStyle = r % 2 ? '#1a0e4a' : '#22125e'; ctx.fillRect(inset - 24, y, w - inset * 2 + 48, 22); for (let x = inset; x < w - inset; x += 8) { const k = hn(x * 3 + r); ctx.fillStyle = k > 0.8 ? 'rgba(255,95,176,.6)' : k > 0.6 ? 'rgba(47,230,255,.55)' : k > 0.15 ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.4)'; ctx.fillRect(x, y + 3 + (r * 3 % 5), 4, 6); } }
  ctx.fillStyle = vgrad(ctx, 0, hz, 'rgba(0,0,0,.6)', 'rgba(0,0,0,0)'); ctx.fillRect(-M, -M, w + 2 * M, hz * 0.6);
}
function arenaMid(ctx, w, h) {
  const hz = h * 0.56;
  for (let i = 0; i < 3; i++) line(ctx, -M, 12 + i * 14, w + M, 12 + i * 14, 4, '#3a3a64');
  for (let x = 0; x < w; x += 44) { litRect(ctx, x + 10, 24, 26, 14, 3, '#1c1c3a', 2); circle(ctx, x + 23, 31, 4, '#ffefc0', 0); }
  const sx = w * 0.5 - Math.min(w * 0.3, 160), sw = Math.min(w * 0.6, 320), sy = h * 0.1, sh = sw * 0.36;
  litRect(ctx, sx - 8, sy - 8, sw + 16, sh + 16, 8, '#10103a', 3.4); ctx.fillStyle = '#12082e'; ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = vgrad(ctx, hz, h, '#2e1a74', '#0a0628'); ctx.fillRect(-M, hz, w + 2 * M, h - hz + M);
  litRect(ctx, w * 0.22, hz - 24, w * 0.56, 26, 5, '#2a1c60', 2.8); ctx.fillStyle = 'rgba(255,95,176,.55)'; ctx.fillRect(w * 0.22 + 4, hz - 22, w * 0.56 - 8, 3);
  for (const sx2 of [0.1, 0.9]) for (let k = 0; k < 7; k++) { const bx = w * sx2 - 26, by = hz - 24 - (k + 1) * 26; litRect(ctx, bx, by, 52, 24, 4, '#24184e', 2.2); for (let j = 0; j < 3; j++) circle(ctx, bx + 12 + j * 14, by + 12, 5, '#0a0618', 1.6); }
  for (let i = 0; i < 14; i++) { const k = i / 14; ctx.fillStyle = 'rgba(255,255,255,' + (0.03 + k * 0.03) + ')'; ctx.fillRect(-M, hz + k * k * (h - hz), w + 2 * M, 2 + k * 7); }
  for (let i = -6; i < 14; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + (i - 4) * 14, hz); ctx.lineTo(w / 2 + (i - 4) * w * 0.18, h + M); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,95,176,.1)'; ctx.stroke(); }
  line(ctx, -M, hz, w + M, hz, 5, '#ff5fb0'); line(ctx, -M, hz + 3, w + M, hz + 3, 1.6, 'rgba(255,255,255,.6)');
  const rf = ctx.createLinearGradient(0, hz, 0, h); rf.addColorStop(0, 'rgba(120,160,255,.2)'); rf.addColorStop(1, 'rgba(120,160,255,0)'); ctx.fillStyle = rf; ctx.fillRect(-M, hz, w + 2 * M, h - hz);
  grain(ctx, -M, hz, w + 2 * M, h - hz + M, 0.04);
}
function arenaDyn(ctx, w, h, t, beat) {
  const hz = h * 0.56, sx = w * 0.5 - Math.min(w * 0.3, 160), sw = Math.min(w * 0.6, 320), sy = h * 0.1, sh = sw * 0.36;
  for (let i = 0; i < 24; i++) { const bh = (0.12 + 0.88 * Math.abs(Math.sin(t * (2 + hn(i) * 3) + i)) * (0.45 + beat * 0.55)) * sh * 0.88, c = i % 3 ? '#ff5fb0' : '#2fe6ff'; ctx.fillStyle = c; ctx.fillRect(sx + 6 + i * (sw - 12) / 24, sy + sh - 5 - bh, (sw - 12) / 24 - 3, bh); }
  bloom(ctx, sx + sw / 2, sy + sh / 2, sw * 0.75, '#ff5fb0', 0.22 + beat * 0.12);
  ctx.save(); ctx.globalAlpha = 0.12; ctx.scale(1, -1); ctx.translate(0, -2 * hz); ctx.fillStyle = '#ff5fb0'; ctx.fillRect(sx, hz + (hz - sy - sh), sw, sh * 0.8); ctx.restore();
  for (let i = 0; i < 5; i++) { const ox = w * (0.1 + i * 0.2), a = Math.PI / 2 + Math.sin(t * 0.9 + i * 1.7) * 0.55; cone(ctx, ox, 30, a, h * 0.95, 0.08, ['#ffffff', '#ff5fb0', '#2fe6ff', '#ffffff', '#9dff3a'][i], 0.22 + beat * 0.1); bloom(ctx, ox, 30, 30, '#fff', 0.7); }
  for (let i = 0; i < 8; i++) { const fl = Math.sin(t * 9 + i * 7.3); if (fl > 0.88) { const fx = hn(i + Math.floor(t * 3)) * w, fy = h * 0.25 + hn(i + 9) * h * 0.28; star4(ctx, fx, fy, 8 + fl * 5, 'rgba(255,255,255,.95)'); bloom(ctx, fx, fy, 22, '#fff', 0.6); } }
  const burst = beat > 0.35 ? beat : 0;
  for (const sd of [0.06, 0.94]) { const px = w * sd; for (let k = 0; k < 6; k++) { const hh = (24 + k * 12) * (0.4 + burst) * (0.8 + 0.2 * Math.sin(t * 20 + k)); bloom(ctx, px + Math.sin(t * 8 + k) * 3, hz - hh, 18 + k * 3, k < 3 ? '#ffd23c' : '#ff7a3c', 0.5 * burst); } bloom(ctx, px, hz, 60, '#ff7a3c', 0.25 + burst * 0.3); }
}

// ---- registry
const STAGES = {
  title: { far: (c, w, h) => citySky(c, w, h, 'title'), mid: (c, w, h) => cityMid(c, w, h, 'title'), near: (c, w, h) => cityNear(c, w, h, 'title'), dyn: (c, w, h, t, b) => cityDyn(c, w, h, t, b, 'title') },
  hub: { far: (c, w, h) => citySky(c, w, h, 'hub'), mid: (c, w, h) => cityMid(c, w, h, 'hub'), near: (c, w, h) => cityNear(c, w, h, 'hub'), dyn: (c, w, h, t, b) => cityDyn(c, w, h, t, b, 'hub') },
  garage: { mid: garageMid, near: garageNear, dyn: garageDyn },
  busk: { far: buskFar, mid: buskMid, near: buskNear, dyn: buskDyn },
  club: { far: clubFar, mid: clubMid, near: clubNear, dyn: clubDyn },
  festival: { far: festFar, mid: festMid, near: festNear, dyn: festDyn },
  arena: { far: arenaFar, mid: arenaMid, dyn: arenaDyn },
};

// ---- the Static creeping in from the screen edges as the stage health drops
function staticCreep(ctx, w, h, t, amt) {
  if (!(amt > 0.01)) return;
  amt = Math.min(1, amt);
  const n = Math.floor(30 + 70 * amt), m = Math.min(w, h), per = 2 * (w + h);
  ctx.save();
  for (let pass = 0; pass < 3; pass++) {
    // pass 0 and 1 are the cyan and magenta fringe, pass 2 the grey body
    const ox = pass === 0 ? -2.5 : pass === 1 ? 2.5 : 0;
    if (pass < 2) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 * amt; } else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, pos = u * per; let px, py, nx, ny;
      if (pos < w) { px = pos; py = 0; nx = 0; ny = 1; } else if (pos < w + h) { px = w; py = pos - w; nx = -1; ny = 0; } else if (pos < 2 * w + h) { px = 2 * w + h - pos; py = h; nx = 0; ny = -1; } else { px = 0; py = per - pos; nx = 1; ny = 0; }
      const depth = amt * m * (0.1 + hn(i + 3) * 0.28), jit = Math.sin(t * 5 + i * 1.3) * 3, r = 14 + hn(i + 11) * 26;
      const cx = px + nx * (depth * hn(i + 21)) + ny * jit + ox, cy = py + ny * (depth * hn(i + 21)) + nx * jit, rad = r * (0.5 + amt * 0.8);
      ctx.beginPath();
      for (let k = 0; k < 18; k++) { const a = k / 18 * TAU + i, rd = rad * (k % 2 ? 0.7 : 1.1 + hn(i * 3 + k) * 0.15); const qx = cx + Math.cos(a) * rd, qy = cy + Math.sin(a) * rd; k ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }
      ctx.closePath();
      if (pass < 2) { ctx.fillStyle = pass === 0 ? '#2fe6ff' : '#ff3cc8'; ctx.fill(); continue; }
      const gg = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.1, cx, cy, rad * 1.1); gg.addColorStop(0, hn(i) > 0.5 ? '#e4e0f0' : '#cfc9e0'); gg.addColorStop(1, '#8a84a4');
      ctx.fillStyle = gg; ctx.fill();
      if (hn(i + 5) > 0.74) { circle(ctx, cx - rad * 0.28, cy - rad * 0.1, rad * 0.24, '#fff', 0); circle(ctx, cx + rad * 0.28, cy - rad * 0.1, rad * 0.24, '#fff', 0); circle(ctx, cx - rad * 0.24, cy - rad * 0.08, rad * 0.11, OUT, 0); circle(ctx, cx + rad * 0.32, cy - rad * 0.08, rad * 0.11, OUT, 0); }
    }
  }
  ctx.restore();
  ctx.save(); const g = ctx.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75); g.addColorStop(0, 'rgba(170,165,190,0)'); g.addColorStop(1, 'rgba(170,165,190,' + (0.5 * amt) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // glitch tears: tinted bands that jump, with a hard bright edge
  if (amt > 0.25) for (let i = 0; i < 2 + Math.floor(amt * 4); i++) {
    const slot = Math.floor(t * 5) + i * 17, gy = hn(slot * 1.7) * h, gh = 3 + hn(slot * 2.3) * 14 * amt, gx = hn(slot * 3.1) * w * 0.5;
    ctx.fillStyle = 'rgba(47,230,255,' + 0.12 * amt + ')'; ctx.fillRect(gx, gy, w * 0.6, gh); ctx.fillStyle = 'rgba(255,60,200,' + 0.1 * amt + ')'; ctx.fillRect(gx + 6, gy + 2, w * 0.5, gh * 0.6);
    ctx.fillStyle = 'rgba(220,216,236,' + 0.14 * amt + ')'; ctx.fillRect(0, gy, w, 1.4);
  }
  const gt = grainTile(); if (gt && amt > 0.2) { ctx.globalAlpha = 0.5 * amt; const ox = (Math.floor(t * 14) * 37) % 96, oy = (Math.floor(t * 14) * 53) % 96; for (let yy = -oy; yy < h; yy += 96) for (let xx = -ox; xx < w; xx += 96) ctx.drawImage(gt, xx, yy); }
  ctx.restore();
}

function vignetteCanvas(w, h) {
  const key = 'vig|' + Math.round(w) + '|' + Math.round(h);
  if (misc.has(key)) return misc.get(key);
  const s = 0.5, cv = makeCanvas(w * s, h * s);
  if (cv) { const c = cv.getContext('2d'); if (c) { c.scale(s, s); const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.58); g.addColorStop(0, 'rgba(4,0,16,0)'); g.addColorStop(1, 'rgba(4,0,16,.62)'); c.fillStyle = g; c.fillRect(0, 0, w, h); } else misc.set(key, null); }
  if (misc.size > 12) misc.delete(misc.keys().next().value);
  misc.set(key, cv); return cv;
}

function buildBg(id, w, h) {
  const st = STAGES[id], sc = ART_SCALE > 1 ? 1.5 : 1;
  const mk = (fn, s) => {
    if (!fn) return null; const cv = makeCanvas((w + 2 * M) * s, (h + 2 * M) * s); if (!cv) return null;
    const cc = cv.getContext('2d'); if (!cc) return null; cc.scale(s, s); cc.translate(M, M); fn(cc, w, h); return cv;
  };
  const e = { far: mk(st.far, sc * 0.5), mid: mk(st.mid, sc), near: mk(st.near, sc), ok: false };
  e.ok = !!(e.mid || e.far || e.near);
  return e;
}

export function drawBackdrop(ctx, id, w, h, t, o) {
  o = o || {}; t = t || 0; id = STAGES[id] ? id : 'title';
  const st = STAGES[id], beat = clamp(o.beat || 0, 0, 1);
  ctx.save();
  const key = id + '|' + Math.round(w) + '|' + Math.round(h) + '|' + ART_SCALE;
  let e = cacheBg.get(key);
  if (!e) { e = buildBg(id, w, h); if (cacheBg.size > 10) cacheBg.delete(cacheBg.keys().next().value); cacheBg.set(key, e); }
  if (e.ok) {
    const dx = Math.sin(t * 0.13) * 4;                           // slow parallax drift, mid layer stays put so dynamic lights line up
    if (e.far) ctx.drawImage(e.far, -M + dx * 0.4, -M, w + 2 * M, h + 2 * M);
    if (e.mid) ctx.drawImage(e.mid, -M, -M, w + 2 * M, h + 2 * M);
    if (e.near) ctx.drawImage(e.near, -M - dx * 0.8, -M, w + 2 * M, h + 2 * M);
  } else { ctx.save(); ctx.translate(M, M); for (const fn of [st.far, st.mid, st.near]) if (fn) fn(ctx, w, h); ctx.restore(); }
  st.dyn(ctx, w, h, t, beat);
  // atmosphere: horizon haze in the stage grade, a beat pulse, then the vignette
  const hz = hzOf(h), gr = GRADE[id] || '#ff5fb0';
  const hg = ctx.createLinearGradient(0, hz - h * 0.12, 0, hz + h * 0.1); hg.addColorStop(0, hexA(gr, 0)); hg.addColorStop(0.5, hexA(gr, 0.1 + beat * 0.06)); hg.addColorStop(1, hexA(gr, 0)); ctx.fillStyle = hg; ctx.fillRect(0, hz - h * 0.12, w, h * 0.22);
  if (beat > 0.02) bloom(ctx, w / 2, hz, Math.max(w, h) * 0.55, gr, 0.1 * beat);
  const v = vignetteCanvas(w, h); if (v) ctx.drawImage(v, 0, 0, w, h);
  staticCreep(ctx, w, h, t, o.staticAmt || 0);
  ctx.restore();
}

// ================================================================================================================ BOARD
// theme: path material colours, pad colours, edge light colour, decor kinds. 'mat' picks the surface recipe.
const THEMES = {
  garage:   { mat: 'concrete', pathA: '#7c7488', pathB: '#615a72', edge: '#2e2840', light: '#ffc060', pad: '#3a2a62', pad2: '#43326f', padHi: '#7a62c0', ground: '#1e1236', stripe: '#ffd23c', decor: ['speaker', 'crate', 'tire', 'amp'] },
  busk:     { mat: 'cobble',   pathA: '#8d96b8', pathB: '#6c7598', edge: '#202850', light: '#ffd88a', pad: '#24386c', pad2: '#2c4478', padHi: '#6a8ad0', ground: '#101a3e', stripe: '#ffd88a', decor: ['bin', 'plant', 'crate', 'lamp'] },
  club:     { mat: 'gloss',    pathA: '#241442', pathB: '#190c32', edge: '#ff4fd0', light: '#ff4fd0', pad: '#2c1a58', pad2: '#34206a', padHi: '#8a5ae0', ground: '#0e0620', stripe: '#2fe6ff', decor: ['speaker', 'amp', 'cone', 'plant'] },
  festival: { mat: 'dirt',     pathA: '#cf9c68', pathB: '#b07c4e', edge: '#5a3a24', light: '#ffe0a0', pad: '#357048', pad2: '#3d7c50', padHi: '#74c284', ground: '#264a34', stripe: '#fff0c0', decor: ['plant', 'crate', 'bin', 'speaker'] },
  arena:    { mat: 'track',    pathA: '#2a2068', pathB: '#1e1650', edge: '#2fe6ff', light: '#2fe6ff', pad: '#241a56', pad2: '#2c2068', padHi: '#6a52c8', ground: '#0e0828', stripe: '#ff5fb0', decor: ['speaker', 'amp', 'cone', 'crate'] },
};
function decor(ctx, kind, cx, cy, accent) {
  ctx.save(); ctx.translate(cx, cy); shadow(ctx, 1, 18, 20, 5, 0.55);
  if (kind === 'speaker') { litRect(ctx, -17, -26, 34, 48, 5, '#2e2456', 2.8); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(-14, -23, 28, 3); circle(ctx, 0, 6, 12, '#0a0618', 2.2); circle(ctx, 0, 6, 8.5, '#1c1438', 0); circle(ctx, -1.5, 4.5, 4, '#4a3c88', 0); circle(ctx, -2.2, 3.4, 1.4, 'rgba(255,255,255,.5)', 0); circle(ctx, 0, -14, 4.6, '#150e2c', 1.8); circle(ctx, 0, -14, 1.8, accent, 0); }
  else if (kind === 'amp') { litRect(ctx, -21, -15, 42, 34, 5, '#3a2c58', 2.8); rr(ctx, -17, -9, 34, 15, 3); ctx.fillStyle = '#120c22'; ctx.fill(); for (let i = 0; i < 4; i++) circle(ctx, -11 + i * 7.4, 13, 2.2, accent, 0); for (let i = 0; i < 5; i++) { line(ctx, -14 + i * 7, -6, -14 + i * 7, 2, 1.6, 'rgba(255,255,255,.14)'); } ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-19, -13, 38, 2.4); }
  else if (kind === 'crate') { litRect(ctx, -19, -15, 38, 34, 4, '#94623a', 2.8); line(ctx, -15, -11, 15, 15, 3, '#5a3820'); line(ctx, 15, -11, -15, 15, 3, '#5a3820'); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(-17, -13, 34, 2.4); circle(ctx, -14, -10, 1.4, '#d8b080', 0); circle(ctx, 14, -10, 1.4, '#d8b080', 0); }
  else if (kind === 'tire') { circle(ctx, 0, 4, 19, '#241f2c', 3); const tg = ctx.createRadialGradient(-6, -4, 2, 0, 4, 19); tg.addColorStop(0, 'rgba(255,255,255,.18)'); tg.addColorStop(1, 'rgba(0,0,0,.3)'); circle(ctx, 0, 4, 17, tg, 0); circle(ctx, 0, 4, 8, '#5a5468', 2.4); circle(ctx, 0, 4, 3, '#2a2634', 0); }
  else if (kind === 'bin') { litRect(ctx, -13, -14, 26, 34, 5, '#4a8a74', 2.8); litRect(ctx, -16, -21, 32, 9, 4, '#62a890', 2.4); for (const s of [-6, 6]) line(ctx, s, -6, s, 12, 2, 'rgba(0,0,0,.28)'); }
  else if (kind === 'plant') { litRect(ctx, -13, 4, 26, 17, 4, '#c0603e', 2.8); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * 6, -8 + Math.abs(i) * 1.6, 5, 13, i * 0.3, 0, TAU); fs(ctx, i % 2 ? '#52b45e' : '#3a9a4a', 2.4); } }
  else if (kind === 'lamp') { line(ctx, 0, 20, 0, -18, 4, '#0a1230'); line(ctx, -1.4, 20, -1.4, -18, 1.2, 'rgba(160,190,255,.4)'); circle(ctx, 0, -23, 7.4, '#fff2c0', 2.4); }
  else if (kind === 'cone') { poly(ctx, [[-13, 19], [13, 19], [0, -23]]); const cg = ctx.createLinearGradient(-13, 0, 13, 0); cg.addColorStop(0, '#ff9a5c'); cg.addColorStop(1, '#d04a1c'); fs(ctx, cg, 3); rr(ctx, -8, -3, 16, 6, 2); ctx.fillStyle = '#fff'; ctx.fill(); litRect(ctx, -17, 16, 34, 6, 2, '#e8602a', 2.2); }
  ctx.restore();
}
function addCorridor(ctx, m, pw) {
  ctx.beginPath();
  for (const lane of m.lanes) for (let i = 1; i < lane.pts.length; i++) {
    const a = lane.pts[i - 1], b = lane.pts[i];
    ctx.rect(Math.min(a.x, b.x) - pw / 2, Math.min(a.y, b.y) - pw / 2, Math.abs(a.x - b.x) + pw, Math.abs(a.y - b.y) + pw);
  }
}
function groundMat(ctx, th, mat) {
  ctx.fillStyle = vgrad(ctx, BOARD_Y, BOARD_Y + BOARD_H, mix(th.ground, '#ffffff', 0.05), th.ground, mix(th.ground, '#000000', 0.3)); ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
  if (mat === 'cobble') for (let y = BOARD_Y, r = 0; y < BOARD_Y + BOARD_H; y += 13, r++) for (let x = BOARD_X - (r % 2) * 12; x < BOARD_X + BOARD_W; x += 24) { rr(ctx, x + 1, y + 1, 22, 11, 4); ctx.fillStyle = hn(x * 3 + y) > 0.5 ? 'rgba(120,150,230,.09)' : 'rgba(0,0,20,.16)'; ctx.fill(); }
  else if (mat === 'dirt') { for (let y = BOARD_Y; y < BOARD_Y + BOARD_H; y += 36) { ctx.fillStyle = (Math.floor((y - BOARD_Y) / 36) & 1) ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.07)'; ctx.fillRect(BOARD_X, y, BOARD_W, 36); } for (let i = 0; i < 260; i++) { const gx = BOARD_X + hn(i) * BOARD_W, gy = BOARD_Y + hn(i + 3) * BOARD_H; line(ctx, gx, gy, gx + 1.6, gy - 5 - hn(i + 8) * 5, 1.3, hn(i + 11) > 0.5 ? 'rgba(160,230,150,.22)' : 'rgba(10,50,30,.3)'); } }
  else if (mat === 'gloss') { const g = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X + BOARD_W, BOARD_Y + BOARD_H); g.addColorStop(0.3, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,79,208,.09)'); g.addColorStop(0.7, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H); }
  else if (mat === 'track') { for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.arc(BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H / 2, i * 90, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,95,176,.07)'; ctx.stroke(); } }
  else for (let i = 0; i < 380; i++) { ctx.fillStyle = hn(i * 1.7) > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.14)'; ctx.fillRect(BOARD_X + hn(i) * BOARD_W, BOARD_Y + hn(i + 4) * BOARD_H, 1.6, 1.6); }
}
function pathMat(ctx, m, th, mat, worldId) {
  const pw = TILE - 8;
  // ambient occlusion: a dark halo around the corridor on the ground
  ctx.save(); ctx.shadowColor = 'rgba(0,0,10,.85)'; ctx.shadowBlur = 16; ctx.fillStyle = th.edge; addCorridor(ctx, m, pw + 8); ctx.fill(); ctx.restore();
  ctx.fillStyle = th.edge; addCorridor(ctx, m, pw + 6); ctx.fill();
  if (mat === 'gloss' || mat === 'track') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hexA(th.light, 0.1); addCorridor(ctx, m, pw + 16); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = hexA(th.light, mat === 'gloss' || mat === 'track' ? 0.9 : mat === 'dirt' ? 0.18 : 0.3); addCorridor(ctx, m, pw + 3); ctx.fill();
  ctx.save(); addCorridor(ctx, m, pw); ctx.clip();
  const g = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X + BOARD_W * 0.4, BOARD_Y + BOARD_H); g.addColorStop(0, th.pathA); g.addColorStop(1, th.pathB); ctx.fillStyle = g; ctx.fillRect(BOARD_X - 80, BOARD_Y - 80, BOARD_W + 160, BOARD_H + 160);
  for (const k of m.pathTiles) {
    const [c, r] = k.split(',').map(Number), px = BOARD_X + c * TILE, py = BOARD_Y + r * TILE, s = c * 13 + r * 7;
    if (mat === 'concrete') { ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1.6; ctx.strokeRect(px + 0.8, py + 0.8, TILE - 1.6, TILE - 1.6); ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(px + 2, py + 2, TILE - 4, 3); if (hn(s) > 0.55) { ctx.beginPath(); ctx.ellipse(px + 14 + hn(s + 1) * 40, py + 14 + hn(s + 2) * 40, 8 + hn(s + 3) * 10, 4 + hn(s + 4) * 6, hn(s) * 3, 0, TAU); ctx.fillStyle = 'rgba(10,6,20,.22)'; ctx.fill(); } for (let i = 0; i < 8; i++) { ctx.fillStyle = hn(s + i * 2.1) > 0.5 ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.14)'; ctx.fillRect(px + hn(s + i) * TILE, py + hn(s + i + 9) * TILE, 1.6, 1.6); } }
    else if (mat === 'cobble') { for (let yy = 0, rr2 = 0; yy < TILE; yy += 12, rr2++) for (let xx = -(rr2 % 2) * 9; xx < TILE; xx += 18) { const kk = hn(s * 3 + xx + yy * 5); rr(ctx, px + xx + 1, py + yy + 1, 16, 10, 4); const cg = ctx.createLinearGradient(0, py + yy, 0, py + yy + 11); cg.addColorStop(0, hexA('#ffffff', 0.12 + kk * 0.12)); cg.addColorStop(1, hexA('#000000', 0.16 + kk * 0.1)); ctx.fillStyle = cg; ctx.fill(); } }
    else if (mat === 'gloss') { ctx.fillStyle = hexA(th.edge, 0.05); ctx.fillRect(px + 6, py + 6, TILE - 12, TILE - 12); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1.2; ctx.strokeRect(px + 6, py + 6, TILE - 12, TILE - 12); circle(ctx, px + TILE / 2, py + TILE / 2, 2, ['#ff4fd0', '#2fe6ff', '#9dff3a', '#ffd23c'][(c + r) % 4], 0); }
    else if (mat === 'dirt') { for (let i = 0; i < 9; i++) { ctx.fillStyle = hn(s + i * 1.9) > 0.5 ? 'rgba(90,50,20,.22)' : 'rgba(255,230,190,.2)'; ctx.beginPath(); ctx.ellipse(px + hn(s + i) * TILE, py + hn(s + i + 7) * TILE, 1.6 + hn(s + i + 3) * 2.6, 1.2 + hn(s + i + 5) * 1.6, 0, 0, TAU); ctx.fill(); } if (hn(s + 4) > 0.7) line(ctx, px + 10, py + 20 + hn(s) * 30, px + 30, py + 24 + hn(s) * 30, 1.6, 'rgba(240,210,110,.6)'); }
    else { ctx.fillStyle = 'rgba(47,230,255,.05)'; ctx.fillRect(px + 5, py + 5, TILE - 10, TILE - 10); ctx.strokeStyle = 'rgba(120,160,255,.1)'; ctx.lineWidth = 1.2; ctx.strokeRect(px + 0.6, py + 0.6, TILE - 1.2, TILE - 1.2); if (!((c + r) & 3)) { line(ctx, px + 14, py + TILE / 2, px + TILE - 14, py + TILE / 2, 2, 'rgba(255,95,176,.2)'); } }
  }
  for (const lane of m.lanes) for (let i = 1; i < lane.pts.length; i++) { const a = lane.pts[i - 1], b = lane.pts[i]; ctx.setLineDash([10, 12]); line(ctx, a.x, a.y, b.x, b.y, 2.6, hexA(th.stripe, mat === 'dirt' ? 0.2 : 0.34), 'butt'); ctx.setLineDash([]); }
  // top-left light and bottom-right shade over the whole path
  const sh = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X + BOARD_W, BOARD_Y + BOARD_H); sh.addColorStop(0, 'rgba(255,255,255,.08)'); sh.addColorStop(1, 'rgba(0,0,10,.25)'); ctx.fillStyle = sh; ctx.fillRect(BOARD_X - 80, BOARD_Y - 80, BOARD_W + 160, BOARD_H + 160);
  ctx.restore();
}
function padDraw(ctx, s, th, wd, mat) {
  const px = BOARD_X + s.c * TILE, py = BOARD_Y + s.r * TILE, base = ((s.c + s.r) & 1) ? th.pad2 : th.pad;
  shadow(ctx, px + TILE / 2 + 1, py + TILE - 6, TILE * 0.46, 6, 0.6);
  rr(ctx, px + 4, py + 5, TILE - 8, TILE - 8, 13); ctx.fillStyle = 'rgba(2,0,12,.55)'; ctx.fill();
  rr(ctx, px + 4, py + 3, TILE - 8, TILE - 8, 13); const g = ctx.createLinearGradient(px, py, px + TILE, py + TILE); g.addColorStop(0, mix(base, '#ffffff', 0.2)); g.addColorStop(0.45, base); g.addColorStop(1, mix(base, '#000000', 0.4)); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(8,2,26,.95)'; ctx.stroke();
  ctx.save(); rr(ctx, px + 4, py + 3, TILE - 8, TILE - 8, 13); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.fillRect(px + 4, py + 3, TILE - 8, 12);
  if (mat === 'concrete') { for (let i = 0; i < 4; i++) { line(ctx, px + 8 + i * 15, py + 8, px + 8 + i * 15 - 8, py + TILE - 8, 1, 'rgba(255,255,255,.06)'); } }
  else if (mat === 'dirt') { for (let i = 0; i < 12; i++) line(ctx, px + 8 + hn(s.c * 9 + i) * 50, py + 10 + hn(s.r * 7 + i) * 46, px + 10 + hn(s.c * 9 + i) * 50, py + 4 + hn(s.r * 7 + i) * 46, 1.2, 'rgba(255,255,255,.13)'); }
  ctx.restore();
  rr(ctx, px + 8, py + 7, TILE - 16, TILE - 16, 9); const ig = ctx.createLinearGradient(px, py + 7, px, py + TILE - 9); ig.addColorStop(0, 'rgba(0,0,10,.28)'); ig.addColorStop(1, hexA(th.padHi, 0.16)); ctx.fillStyle = ig; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = hexA(th.padHi, 0.55); ctx.stroke();
  if (s.blocked) decor(ctx, th.decor[(s.c * 3 + s.r * 5) % th.decor.length], px + TILE / 2, py + TILE / 2 + 2, wd.accent);
  else { const cx = px + TILE / 2, cy = py + TILE / 2 + 1; line(ctx, cx - 6, cy, cx + 6, cy, 2, hexA(th.padHi, 0.5)); line(ctx, cx, cy - 6, cx, cy + 6, 2, hexA(th.padHi, 0.5)); for (const [ox, oy] of [[9, 8], [TILE - 9, 8], [9, TILE - 11], [TILE - 9, TILE - 11]]) circle(ctx, px + ox, py + oy, 1.4, hexA(th.padHi, 0.55), 0); }
}
function gateStatic(ctx, gx, gy, ang) {
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang);
  shadow(ctx, -4, 0, 20, 44, 0.6);
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 40, 0, 0, TAU); ctx.fillStyle = '#2a2640'; ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(2, 0, 10, 32, 0, 0, TAU); const pg = ctx.createRadialGradient(4, 0, 2, 2, 0, 32); pg.addColorStop(0, '#0a0614'); pg.addColorStop(1, '#2a2440'); ctx.fillStyle = pg; ctx.fill();
  for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.46 + i * Math.PI * 0.115, rx = 13, ry = 36; const x = Math.cos(a) * rx * 0.8, y = Math.sin(a) * ry; poly(ctx, [[x - 4, y - 5], [x + 6, y], [x - 4, y + 5]]); ctx.fillStyle = '#aaa4c0'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); }
  ctx.restore();
}
function gatePos(lane) {
  const p0 = lane.pts[0], p1 = lane.pts[1]; let gx = p0.x, gy = p0.y;
  if (p0.c < 0) gx = BOARD_X; else if (p0.c >= COLS) gx = BOARD_X + BOARD_W; if (p0.r < 0) gy = BOARD_Y; else if (p0.r >= ROWS) gy = BOARD_Y + BOARD_H;
  return { gx, gy, ang: Math.atan2(p1.y - p0.y, p1.x - p0.x) };
}
function boardStatic(ctx, mapId, worldId) {
  const m = buildMap(mapId), th = THEMES[worldId] || THEMES.garage, wd = WORLD_BY_ID[worldId] || { accent: '#ff5fb0' };
  // bezel
  rr(ctx, BOARD_X - 9, BOARD_Y - 9, BOARD_W + 18, BOARD_H + 18, 22); const bz = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X + BOARD_W, BOARD_Y + BOARD_H); bz.addColorStop(0, '#5a4a8a'); bz.addColorStop(0.5, '#2a2050'); bz.addColorStop(1, '#14102c'); ctx.fillStyle = bz; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
  for (const [x, y] of [[BOARD_X - 4, BOARD_Y - 4], [BOARD_X + BOARD_W + 4, BOARD_Y - 4], [BOARD_X - 4, BOARD_Y + BOARD_H + 4], [BOARD_X + BOARD_W + 4, BOARD_Y + BOARD_H + 4]]) { circle(ctx, x, y, 3, '#9a8ac8', 1.2); circle(ctx, x - 0.8, y - 0.8, 1, 'rgba(255,255,255,.7)', 0); }
  ctx.save(); rr(ctx, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 14); ctx.clip();
  groundMat(ctx, th, th.mat);
  pathMat(ctx, m, th, th.mat, worldId);
  for (const s of m.slots) padDraw(ctx, s, th, wd, th.mat);
  // inner shadow along the bezel so the floor looks recessed
  const is = ctx.createLinearGradient(BOARD_X, BOARD_Y, BOARD_X, BOARD_Y + 26); is.addColorStop(0, 'rgba(0,0,10,.55)'); is.addColorStop(1, 'rgba(0,0,10,0)'); ctx.fillStyle = is; ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, 26);
  const il = ctx.createLinearGradient(BOARD_X, 0, BOARD_X + 18, 0); il.addColorStop(0, 'rgba(0,0,10,.4)'); il.addColorStop(1, 'rgba(0,0,10,0)'); ctx.fillStyle = il; ctx.fillRect(BOARD_X, BOARD_Y, 18, BOARD_H);
  grain(ctx, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 0.05);
  ctx.restore();
  for (const lane of m.lanes) { const g = gatePos(lane); gateStatic(ctx, g.gx, g.gy, g.ang); }
  rr(ctx, BOARD_X - 1, BOARD_Y - 1, BOARD_W + 2, BOARD_H + 2, 14); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
  rr(ctx, BOARD_X - 5.5, BOARD_Y - 5.5, BOARD_W + 11, BOARD_H + 11, 18); ctx.lineWidth = 2.4; ctx.strokeStyle = hexA(wd.accent, 0.8); ctx.stroke();
  // the stage tile: a lit platform
  const b = m.base; ctx.save(); rr(ctx, b.x - 34, b.y - 34, 68, 68, 12); const sg = ctx.createLinearGradient(b.x - 34, b.y - 34, b.x + 34, b.y + 34); sg.addColorStop(0, hexA(wd.accent, 0.5)); sg.addColorStop(1, hexA(wd.accent, 0.16)); ctx.fillStyle = sg; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = wd.accent; ctx.stroke(); ctx.restore();
}
function boardCanvas(mapId, worldId) {
  const key = mapId + '|' + worldId + '|' + ART_SCALE;
  let e = cacheBoard.get(key);
  if (e) return e;
  const pad = 30, cv = makeCanvas((BOARD_W + pad * 2) * ART_SCALE, (BOARD_H + pad * 2) * ART_SCALE);
  e = { cv, pad };
  if (cv) { const cc = cv.getContext('2d'); if (cc) { cc.scale(ART_SCALE, ART_SCALE); cc.translate(-BOARD_X + pad, -BOARD_Y + pad); boardStatic(cc, mapId, worldId); } else e.cv = null; }
  cacheBoard.set(key, e); return e;
}

export function drawBoard(ctx, mapId, worldId, t, o) {
  o = o || {}; t = t || 0;
  const m = buildMap(mapId), wd = WORLD_BY_ID[worldId] || { accent: '#ff5fb0' }, th = THEMES[worldId] || THEMES.garage;
  const beat = clamp(o.beat || 0, 0, 1);
  ctx.save();
  const e = boardCanvas(mapId, worldId);
  if (e.cv) ctx.drawImage(e.cv, BOARD_X - e.pad, BOARD_Y - e.pad, BOARD_W + e.pad * 2, BOARD_H + e.pad * 2); else boardStatic(ctx, mapId, worldId);
  ctx.save(); rr(ctx, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 12); ctx.clip();
  // soft light in each buildable pad that breathes with the beat
  for (const s of m.buildable) bloom(ctx, s.x, s.y, 34, th.padHi, 0.05 + beat * 0.08 + 0.02 * Math.sin(t * 2 + s.c + s.r));
  // chevrons and travelling light pulses along every lane
  for (const lane of m.lanes) {
    const sp = 54, off = (t * 34) % sp;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = hexA(th.stripe, 0.26 + beat * 0.2); ctx.beginPath();
    for (let d = off; d < lane.total; d += sp) { const p = laneAt(lane, d), c = Math.cos(p.ang), s = Math.sin(p.ang); const bx = p.x - c * 4, by = p.y - s * 4; ctx.moveTo(bx - s * 6, by + c * 6); ctx.lineTo(p.x + c * 3, p.y + s * 3); ctx.lineTo(bx + s * 6, by - c * 6); }
    ctx.stroke();
    const pl = 170, po = (t * 90) % pl;
    for (let d = po; d < lane.total; d += pl) { const p = laneAt(lane, d); bloom(ctx, p.x, p.y, 20, th.light, 0.22 + beat * 0.2); }
  }
  ctx.restore();
  // menacing gates: swirling static, grey sparks and a pulsing glow
  for (const lane of m.lanes) {
    const g = gatePos(lane); ctx.save(); ctx.translate(g.gx, g.gy); ctx.rotate(g.ang);
    bloom(ctx, 4, 0, 48, '#c9c4d6', 0.22 + beat * 0.12); bloom(ctx, 4, 0, 30, '#2fe6ff', 0.1 + 0.06 * Math.sin(t * 6)); bloom(ctx, 6, 0, 26, '#ff3cc8', 0.07 + 0.05 * Math.sin(t * 5 + 2));
    for (let i = 0; i < 9; i++) { const a = t * 3.2 + i * 0.7, k = (i % 3), rx = 3 + k * 2.4, px = Math.cos(a) * rx + 2, py = Math.sin(a) * (10 + k * 8); circle(ctx, px, py, 3 + (i % 2), hexA(i % 2 ? '#e0dcf0' : '#9a94b8', 0.85), 0); }
    for (let i = 0; i < 2; i++) { const fx = ((t * 1.3 + i * 0.5) % 1); ctx.fillStyle = 'rgba(200,196,214,' + (1 - fx) * 0.5 + ')'; ctx.fillRect(6 + fx * 22, -8 + i * 12 + Math.sin(t * 4 + i) * 4, 3, 3); }
    ctx.restore();
  }
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  if (o.slotHint) for (const [c, r] of o.slotHint) { rr(ctx, BOARD_X + c * TILE + 4, BOARD_Y + r * TILE + 3, TILE - 8, TILE - 8, 13); ctx.fillStyle = hexA('#9dff3a', 0.12 + pulse * 0.1); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = hexA('#9dff3a', 0.55 + pulse * 0.3); ctx.stroke(); bloom(ctx, tileCx(c), tileCy(r), 46, '#9dff3a', 0.18 + pulse * 0.12); }
  if (o.hoverSlot) { const [c, r] = o.hoverSlot; rr(ctx, BOARD_X + c * TILE + 3, BOARD_Y + r * TILE + 2, TILE - 6, TILE - 6, 13); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); bloom(ctx, tileCx(c), tileCy(r), 50, '#ffffff', 0.18); }
  if (o.dropSlot) {
    const [c, r] = o.dropSlot, cx = tileCx(c), cy = tileCy(r);
    bloom(ctx, cx, cy, 60, wd.accent, 0.32 + pulse * 0.18);
    ctx.beginPath(); ctx.arc(cx, cy, 24 + pulse * 6, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = hexA(wd.accent, 0.95); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 31 + pulse * 6, 0, TAU); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
    poly(ctx, [[cx - 8, cy - 42 - pulse * 5], [cx + 8, cy - 42 - pulse * 5], [cx, cy - 29 - pulse * 5]]); fs(ctx, wd.accent, 2);
  }
  if (beat > 0.02) { rr(ctx, BOARD_X - 5.5, BOARD_Y - 5.5, BOARD_W + 11, BOARD_H + 11, 18); ctx.lineWidth = 3 + beat * 3; ctx.strokeStyle = hexA(wd.accent, 0.28 * beat); ctx.stroke(); }
  ctx.restore();
}

// ================================================================================================================ STAGE BASE
// The stage the Static are attacking. (x,y) = stage tile centre. A lit rig with a screen, speakers and the duo; reacts to hp, hit and the beat.
export function drawStageBase(ctx, worldId, x, y, o) {
  o = o || {}; const t = o.t || 0, hp = o.hp == null ? 1 : clamp(o.hp, 0, 1), hit = clamp(o.hit || 0, 0, 1), beat = clamp(o.beat || 0, 0, 1);
  const wd = WORLD_BY_ID[worldId] || { accent: '#ff5fb0' }, acc = wd.accent, ok = hp > 0.34;
  ctx.save(); ctx.translate(x + (hit > 0.05 ? Math.sin(t * 90) * 2.6 * hit : 0), y + 5);
  bloom(ctx, 0, -10, 70, acc, ok ? 0.28 + beat * 0.2 : 0.08);
  shadow(ctx, 0, 16, 42, 8, 0.6);
  // light beams from the truss
  if (ok) for (let i = 0; i < 3; i++) cone(ctx, -18 + i * 18, -38, -Math.PI / 2 + (i - 1) * 0.35 + Math.sin(t * 1.4 + i) * 0.18, 110, 0.12, ['#ff5fb0', '#2fe6ff', '#ffd23c'][i], 0.22 + beat * 0.15);
  // LED screen
  litRect(ctx, -29, -35, 58, 36, 4, ok ? '#1c1040' : '#241c30', 2.8);
  ctx.save(); rr(ctx, -26, -32, 52, 30, 3); ctx.clip(); ctx.fillStyle = '#0a0620'; ctx.fillRect(-26, -32, 52, 30);
  for (let i = 0; i < 10; i++) { const bh = (ok ? (0.18 + 0.82 * Math.abs(Math.sin(t * (2.2 + hn(i) * 3) + i)) * (0.5 + beat * 0.5)) : 0.1 + 0.1 * Math.abs(Math.sin(t * 30 + i))) * 26; ctx.fillStyle = i % 3 ? acc : '#2fe6ff'; ctx.fillRect(-24 + i * 5, -4 - bh, 3.4, bh); }
  if (!ok) { for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(200,196,214,' + (0.15 + 0.2 * Math.abs(Math.sin(t * 20 + i))) + ')'; ctx.fillRect(-26, -30 + ((t * 40 + i * 11) % 28), 52, 2); } }
  ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(-26, -32, 52, 7); ctx.restore();
  // truss with four lights
  line(ctx, -33, -41, 33, -41, 4.6, '#55557a'); line(ctx, -33, -42.4, 33, -42.4, 1.2, 'rgba(255,255,255,.4)');
  for (let i = 0; i < 4; i++) { const on = ok || Math.sin(t * 17 + i * 3) > 0, lc = ['#ff5fb0', '#2fe6ff', '#ffd23c', '#9dff3a'][i]; circle(ctx, -21 + i * 14, -38, 3.8, on ? lc : '#403858', 1.8); if (on) bloom(ctx, -21 + i * 14, -38, 20, lc, 0.7); }
  // speaker towers with pumping cones
  for (const s of [-1, 1]) { litRect(ctx, s * 31 - 7, -24, 14, 30, 3, '#2e2456', 2.6); circle(ctx, s * 31, -9, 5.4 + beat * 1.6, '#0a0618', 1.8); circle(ctx, s * 31 - 1, -10, 2, '#4a3c88', 0); circle(ctx, s * 31, -18, 2.2, acc, 0); }
  // stage slab
  litRect(ctx, -36, 0, 72, 15, 5, '#46347a', 3); ctx.save(); rr(ctx, -36, 0, 72, 15, 5); ctx.clip(); ctx.fillStyle = hexA(acc, 0.7); ctx.fillRect(-36, 0, 72, 4); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(-36, 4, 72, 1.4); ctx.restore();
  const pose = hp <= 0.34 ? 'sad' : hit > 0.2 ? 'shock' : (hp > 0.7 ? 'cheer' : 'beat');
  drawHero(ctx, 'roxor', -11, 7, 38, { t, pose });
  drawHero(ctx, 'jasmin', 11, 7, 36, { t: t + 0.4, pose: pose === 'beat' ? 'sing' : pose });
  if (hit > 0.05) { rr(ctx, -38, -44, 76, 62, 8); ctx.fillStyle = 'rgba(255,60,80,' + hit * 0.35 + ')'; ctx.fill(); bloom(ctx, 0, -8, 60, '#ff3c50', hit * 0.5); }
  // damage: sparks and a grey fuzz creeping onto the slab as the health drops
  if (hp < 0.6) for (let i = 0; i < 3; i++) { const k = (t * 2 + i * 0.37) % 1; if (k < 0.3) { ctx.fillStyle = 'rgba(255,230,140,' + (1 - k / 0.3) + ')'; ctx.fillRect(-26 + hn(i + Math.floor(t * 2)) * 52, -30 + k * 40, 2.2, 2.2); } }
  if (hp < 0.5) for (let i = 0; i < 5; i++) { const fx = (i % 2 ? 1 : -1) * (30 + (i >> 1) * 4), fy = 10 - (i % 3) * 3, r = 4 + (1 - hp) * 5 + Math.sin(t * 6 + i) * 0.6; ctx.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, rd = r * (k % 2 ? 0.7 : 1.1); const px = fx + Math.cos(a) * rd, py = fy + Math.sin(a) * rd; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fillStyle = '#c9c4d6'; ctx.fill(); circle(ctx, fx - 1.4, fy - 1, 1.5, '#fff', 0); circle(ctx, fx + 1.4, fy - 1, 1.5, '#fff', 0); circle(ctx, fx - 1.2, fy - 1, 0.7, OUT, 0); circle(ctx, fx + 1.6, fy - 1, 0.7, OUT, 0); }
  ctx.restore();
}
