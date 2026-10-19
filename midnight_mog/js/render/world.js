// Midnight Mog world renderer: the neon rooftop city, the battle field, the base building and the rooftop town.
// Pure render module: never mutates sim state, never calls Math.random. Static art is baked once into offscreen
// bitmaps (sky, three parallax skyline layers, the rooftop slab, the base building in four damage states); each frame
// only drifts the bitmaps and draws the live bits (twinkle, flicker, birds, steam, weather, hover, traps).
//
// API (names are binding, extra exports are free):
//   layoutFor(w, h, mode='battle'|'town') -> {w,h,scale,portrait,tileW,tileH, field:{x,y,w,h}, grid:{x,y,w,h},
//       tile(col,lane)->{x,y,w,h,cx,cy} (cached object for col 1..8 and lane 0..4, do not mutate), colX(tx), laneY(lane), footY(lane),
//       toTile(px,py)->{col,lane}|null, baseRect, handRect, topBar, bottomBar, safe:{top,bottom}, town:{rect, plot(i,total)} }
//   Battle geometry: 5 lanes x 8 columns. Tile-x 0 is the base (left), cats stand on tile-x 1..8, enemies enter at 9.5 (right).
//   colX(tx) is the pixel x of any tile-x (fractional ok), laneY(l) the pixel y of a lane centre, footY(l) where feet should stand.
//   `scale` is the recommended sprite size in px for drawCat / drawEnemy.
//   drawWorld(ctx, layout, view, t)   view = {districtId, battle|null, hoverTile:{col,lane}|null, placeable, ghost, baseFlash}
//       placeable: true | function(col,lane) | array of {col,lane} / [col,lane] pairs | flat mask array (index lane*8+col-1)
//       ghost: {col,lane,kind:'cat'|'trap'|'barricade'|'spell', valid, radius}   baseFlash: 0..1 (set by the caller on base_hit)
//   drawWorldFront(ctx, layout, view, t)  optional foreground (weather particles, vignette), call after units if you want it on top
//   drawTownBackdrop(ctx, w, h, t, o)  o={districtId, layout}     drawPlot(ctx, rect, st, t)  st={b,level,locked,selected,hover,ready}
//   drawSkyline(ctx, w, h, t, districtId, o)  o={baseY, topY}      drawTrap(ctx, layout, trap, t)   drawBarricade(ctx, layout, unit, t)
//   drawPlacementGhost(ctx, layout, ghost, t)   prewarmWorld(layout, districtId)   clearWorldCache()   districtTheme(id)
import { PAL, rgba, mix, shade, glow as palGlow } from '../palette.js';
import { DISTRICT_BY_ID, DISTRICTS } from '../data/districts.js';
import { hsh, strHash, mk, makeCanvas, bake, blit, bloom, dpr, fin, cl, sparkle, drawBuilding } from './icons.js';

const TAU = Math.PI * 2, PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor;
const INK = PAL.ink, BONE = PAL.bone;
const frac = (v) => v - floor(v);
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const LANES = 5, COLS = 8, X_MIN = -1.2, X_MAX = 10.4, SPAN = X_MAX - X_MIN;

// ------------------------------------------------------------------------------------------------ layout
const layouts = new Map();
export function layoutFor(w, h, mode) {
  w = max(160, Math.round(fin(w, 390))); h = max(200, Math.round(fin(h, 800)));
  mode = mode === 'town' ? 'town' : 'battle';
  const key = w + 'x' + h + ':' + mode;
  let L = layouts.get(key);
  if (L) return L;
  const portrait = w < h * 0.9;
  const safe = portrait ? { top: 10, bottom: 14 } : { top: 0, bottom: 0 };
  const topBar = { x: 0, y: safe.top, w, h: portrait ? 52 : 56 };
  const botH = portrait ? 58 : 44;
  const bottomBar = { x: 0, y: h - safe.bottom - botH, w, h: botH };
  const handH = portrait ? cl(h * 0.21, 120, 176) : cl(h * 0.24, 128, 190);
  const handW = portrait ? w : min(w, 1040);
  const handRect = { x: (w - handW) / 2, y: bottomBar.y - handH, w: handW, h: handH };
  const availTop = topBar.y + topBar.h + (portrait ? 8 : 6), availBot = handRect.y - (portrait ? 6 : 8);
  const availH = max(80, availBot - availTop);
  let tileW, tileH;
  if (portrait) { tileW = w / SPAN; tileH = cl(min(tileW * 2.1, availH / LANES), 28, 220); }
  else { const th0 = availH / LANES * 0.72; tileH = min(th0, w / SPAN * 1.3); tileW = min(w / SPAN, tileH * 1.15); tileH = min(tileH, tileW * 1.3); }
  const fw = tileW * SPAN, fh = tileH * LANES;
  const fx = (w - fw) / 2;
  const fy = availBot - fh;
  const field = { x: fx, y: fy, w: fw, h: fh };
  const colX = (tx) => fx + (fin(tx) - X_MIN) * tileW;
  const laneY = (lane) => fy + (fin(lane) + 0.5) * tileH;
  const footY = (lane) => laneY(lane) + tileH * 0.3;
  const grid = { x: colX(0.5), y: fy, w: tileW * COLS, h: fh };
  const tiles = [];
  for (let l = 0; l < LANES; l++) for (let c = 1; c <= COLS; c++) {
    const x = colX(c - 0.5), y = fy + l * tileH;
    tiles.push({ x, y, w: tileW, h: tileH, cx: x + tileW / 2, cy: y + tileH / 2 });
  }
  const tile = (col, lane) => {
    const ci = Math.round(col), li = Math.round(lane);
    if (ci === col && li === lane && ci >= 1 && ci <= COLS && li >= 0 && li < LANES) return tiles[li * COLS + ci - 1];
    const x = colX(fin(col) - 0.5), y = fy + fin(lane) * tileH;
    return { x, y, w: tileW, h: tileH, cx: x + tileW / 2, cy: y + tileH / 2 };
  };
  const toTile = (px, py) => {
    const tx = (px - fx) / tileW + X_MIN, ly = (py - fy) / tileH;
    const col = Math.round(tx), lane = floor(ly);
    if (col < 1 || col > COLS || lane < 0 || lane >= LANES || ly < 0) return null;
    return { col, lane };
  };
  const bx = fx, bw = (0.5 - X_MIN) * tileW, by = fy - tileH * 1.55;
  const baseRect = { x: bx, y: by, w: bw, h: fy + fh - by };
  // town terrace
  const terraceY = portrait ? max(topBar.y + topBar.h + h * 0.14, h * 0.3) : h * 0.34;
  const trect = { x: 0, y: terraceY, w, h: max(80, bottomBar.y - terraceY) };
  const cell = portrait ? (w - 24) / 5 : min(150, (min(w, 900) - 80) / 5);
  const gx = (w - cell * 5) / 2, gy = trect.y + (portrait ? 30 : 36);
  const plot = (i, total) => {
    const cx = i % 5, cy = floor(i / 5);
    return { x: gx + cx * cell + 3, y: gy + cy * cell * 1.04 + 3, w: cell - 6, h: cell * 1.0 - 6, cx: gx + cx * cell + cell / 2, cy: gy + cy * cell * 1.04 + cell / 2, index: i };
  };
  L = {
    w, h, mode, portrait, key, scale: min(tileW * 1.4, tileH * 0.86), tileW, tileH, safe, topBar, bottomBar, handRect,
    field, grid, tile, colX, laneY, footY, toTile, baseRect, xMin: X_MIN, xMax: X_MAX,
    frontY: floor(fy - 26), cityBase: fy - 6,
    town: { rect: trect, cell, plot, cols: 5 },
  };
  if (layouts.size > 16) layouts.clear();
  layouts.set(key, L);
  return L;
}

// ------------------------------------------------------------------------------------------------ themes
const THEME_DEF = {
  rooftop_row: { style: 'roof', horizon: PAL.magenta, win: ['cyan', 'bone', 'magenta'], moon: 'crescent', stars: true, cloud: PAL.violetHi, cloudA: 0.16, weather: 'wind', birds: 7, steam: 'chimney', drift: [1.2, 2.6, 5] },
  alley_alamo: { style: 'brick', horizon: PAL.magenta, win: ['magenta', 'bone', 'cyan'], moon: 'blood', stars: true, cloud: PAL.magenta, cloudA: 0.15, weather: 'rain', birds: 0, steam: 'vent', drift: [1, 2.2, 4.4] },
  sewer_sprawl: { style: 'pipe', horizon: PAL.lime, win: ['lime', 'lime', 'bone'], moon: null, stars: false, cloud: PAL.lime, cloudA: 0.1, weather: 'spores', birds: 0, steam: 'sewer', drift: [0.8, 1.8, 3.4] },
  laser_lights: { style: 'casino', horizon: PAL.magenta, win: ['magenta', 'cyan', 'bone'], moon: 'ring', stars: true, cloud: PAL.magenta, cloudA: 0.1, weather: 'confetti', birds: 0, steam: null, beams: true, drift: [1.6, 3, 5.6] },
  appliance_heights: { style: 'steel', horizon: PAL.cyan, win: ['cyan', 'bone', 'magenta'], moon: 'gear', stars: false, cloud: PAL.boneDim, cloudA: 0.1, weather: 'embers', birds: 0, steam: 'smoke', sparks: true, drift: [1, 2.2, 4] },
  bathtub_bay: { style: 'tile', horizon: PAL.cyan, win: ['cyan', 'bone', 'magenta'], moon: 'disc', stars: false, cloud: PAL.bone, cloudA: 0.12, weather: 'bubbles', birds: 0, steam: 'foam', waves: true, drift: [1.4, 2.8, 5] },
};
const THEMES = new Map();
export function districtTheme(id) {
  let T = THEMES.get(id);
  if (T) return T;
  const D = DISTRICT_BY_ID[id] || DISTRICTS[0];
  const def = THEME_DEF[D.id] || THEME_DEF.rooftop_row;
  const P = D.palette;
  const role = (n, d) => (typeof PAL[n] === 'string' ? PAL[n] : d);
  T = {
    id: D.id, name: D.name, def, style: def.style, seed: strHash(D.id),
    skyTop: role(P.skyTop, PAL.void), skyBottom: role(P.skyBottom, PAL.violet), accent: role(P.accent, PAL.cyan), ground: role(P.ground, PAL.ink2),
    win: def.win.map((n) => PAL[n]),
  };
  T.haze = mix(T.skyBottom, INK, 0.25);
  THEMES.set(D.id, T);
  if (!DISTRICT_BY_ID[id]) THEMES.set(id, T);
  return T;
}

// ------------------------------------------------------------------------------------------------ caches
const CACHE = new Map();
function cached(key, make) {
  let v = CACHE.get(key);
  if (v) return v;
  if (CACHE.size > 40) CACHE.clear();
  v = make(); CACHE.set(key, v);
  return v;
}
export function clearWorldCache() { CACHE.clear(); layouts.clear(); }
let vigGrad = null, vigKey = '';
function vignette(ctx, w, h, a) {
  const k = w + 'x' + h;
  if (vigKey !== k || !vigGrad) {
    vigGrad = ctx.createRadialGradient(w / 2, h * 0.5, min(w, h) * 0.3, w / 2, h * 0.5, max(w, h) * 0.78);
    vigGrad.addColorStop(0, 'rgba(11,7,22,0)'); vigGrad.addColorStop(1, 'rgba(11,7,22,0.62)'); vigKey = k;
  }
  const pa = ctx.globalAlpha; ctx.globalAlpha = pa * a; ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = pa;
}
let scanPat = null, scanTried = false;
function scanlines(ctx, w, h) {
  if (!scanTried) {
    scanTried = true;
    const cv = makeCanvas(4, 3);
    if (cv) { const g = cv.getContext('2d'); g.fillStyle = 'rgba(5,3,12,0.9)'; g.fillRect(0, 0, 4, 1); try { scanPat = ctx.createPattern(cv, 'repeat'); } catch (e) { scanPat = null; } }
  }
  if (!scanPat) return;
  const pa = ctx.globalAlpha; ctx.globalAlpha = pa * 0.07; ctx.fillStyle = scanPat; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = pa;
}

// ------------------------------------------------------------------------------------------------ sky
function moonGlow(c, x, y, r, col) { palGlow(c, x, y, r, col, 0.5); }
function crescent(c, x, y, r, col, dx = 0.34) {
  c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  c.beginPath(); c.rect(x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4); c.arc(x + r * dx * 1.6, y - r * 0.12, r * 0.86, 0, TAU);
  c.fillStyle = col; c.fill('evenodd'); c.restore();
}
function paintSky(c, w, H, T) {
  const d = T.def, rnd = mk(T.seed ^ 0x51ed);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, T.skyTop); g.addColorStop(0.42, mix(T.skyTop, T.skyBottom, 0.4)); g.addColorStop(0.78, mix(T.skyTop, T.skyBottom, 0.8)); g.addColorStop(1, mix(T.skyBottom, d.horizon, 0.38));
  c.fillStyle = g; c.fillRect(0, 0, w, H);
  if (d.stars) {
    const n = floor(w * H / 3000);
    for (let i = 0; i < n; i++) { const y = rnd() * H * 0.72, a = (0.18 + rnd() * 0.5) * (1 - y / (H * 0.9)); c.fillStyle = rgba(BONE, a); const s = rnd() < 0.15 ? 1.6 : 1; c.fillRect(rnd() * w, y, s, s); }
  }
  const mx = w * 0.78, my = H * 0.24, mr = min(w * 0.09, H * 0.13, 60);
  if (d.moon === 'crescent') { moonGlow(c, mx, my, mr * 3.4, T.accent); crescent(c, mx, my, mr, BONE); }
  else if (d.moon === 'blood') { palGlow(c, mx, my, mr * 3.2, PAL.magenta, 0.5); c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fillStyle = mix(PAL.magenta, INK, 0.3); c.fill(); c.fillStyle = rgba(INK, 0.3); for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(mx + (rnd() - 0.5) * mr, my + (rnd() - 0.5) * mr, 2 + rnd() * 5, 0, TAU); c.fill(); } }
  else if (d.moon === 'ring') {
    palGlow(c, mx, my, mr * 3, PAL.magenta, 0.45);
    for (const [r, col, lw] of [[mr * 1.3, PAL.magenta, 3], [mr * 0.95, PAL.cyan, 2], [mr * 0.55, PAL.magenta, 1.6]]) { c.beginPath(); c.arc(mx, my, r, 0, TAU); c.strokeStyle = rgba(col, 0.9); c.lineWidth = lw; c.stroke(); c.beginPath(); c.arc(mx, my, r, 0, TAU); c.strokeStyle = rgba(col, 0.18); c.lineWidth = lw * 4; c.stroke(); }
    c.strokeStyle = rgba(PAL.cyan, 0.07); c.lineWidth = 1;
    c.beginPath(); for (let i = 0; i <= 12; i++) { c.moveTo(w * 0.5, H * 0.34); c.lineTo(i / 12 * w, H); } for (let i = 1; i < 6; i++) { const y = H * (0.5 + i * 0.1); c.moveTo(0, y); c.lineTo(w, y); } c.stroke();
  } else if (d.moon === 'gear') {
    c.save(); c.translate(mx, my + mr * 0.4); const R = mr * 2.2; c.beginPath();
    for (let i = 0; i < 24; i++) { const a0 = i / 24 * TAU, a1 = (i + 0.5) / 24 * TAU, a2 = (i + 1) / 24 * TAU; c.lineTo(cos(a0) * R, sin(a0) * R); c.lineTo(cos(a0 + 0.02) * R * 1.08, sin(a0 + 0.02) * R * 1.08); c.lineTo(cos(a1) * R * 1.08, sin(a1) * R * 1.08); c.lineTo(cos(a1 + 0.02) * R, sin(a1 + 0.02) * R); void a2; }
    c.closePath(); c.fillStyle = rgba(T.accent, 0.1); c.fill(); c.beginPath(); c.arc(0, 0, R * 0.55, 0, TAU); c.fillStyle = rgba(INK, 0.55); c.fill(); c.strokeStyle = rgba(T.accent, 0.35); c.lineWidth = 2; c.stroke(); c.restore();
  } else if (d.moon === 'disc') {
    palGlow(c, mx, my, mr * 3.2, PAL.cyan, 0.4); c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fillStyle = mix(PAL.cyan, BONE, 0.7); c.fill(); c.fillStyle = rgba(PAL.cyan, 0.25); for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(mx + (rnd() - 0.5) * mr, my + (rnd() - 0.5) * mr, 2 + rnd() * 5, 0, TAU); c.fill(); }
  }
  // style set dressing
  if (T.style === 'pipe') { // tunnel vault
    for (let i = 0; i < 9; i++) { const r = w * (0.12 + i * 0.1); c.beginPath(); c.ellipse(w * 0.5, H * 1.15, r, r * 0.95, 0, PI, TAU); c.strokeStyle = rgba(T.accent, 0.05 + i * 0.012); c.lineWidth = 3 + i; c.stroke(); c.strokeStyle = rgba(INK, 0.5); c.lineWidth = 1; c.stroke(); }
    palGlow(c, w * 0.5, H * 0.98, w * 0.5, PAL.lime, 0.22);
    for (let i = 0; i < 4; i++) { const y = 6 + i * 11 + rnd() * 4; c.fillStyle = mix(PAL.ink2, PAL.violet, 0.3); c.fillRect(0, y, w, 7); c.fillStyle = rgba(PAL.lime, 0.25); c.fillRect(0, y + 1, w, 1.4); for (let x = rnd() * 40; x < w; x += 46 + rnd() * 30) { c.fillStyle = INK; c.fillRect(x, y - 1, 3, 9); } }
  } else if (T.style === 'steel') { // power cables
    for (let k = 0; k < 4; k++) { const y0 = H * (0.12 + k * 0.1), sag = 14 + k * 6; c.beginPath(); c.moveTo(-5, y0); c.quadraticCurveTo(w * 0.5, y0 + sag, w + 5, y0 + k * 3); c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke(); c.strokeStyle = rgba(T.accent, 0.3); c.lineWidth = 0.8; c.stroke(); }
  } else if (T.style === 'tile') { // bathroom tile grid and a giant faucet
    c.strokeStyle = rgba(PAL.cyan, 0.06); c.lineWidth = 1; c.beginPath(); for (let x = 0; x < w; x += 34) { c.moveTo(x, 0); c.lineTo(x, H); } for (let y = 0; y < H; y += 34) { c.moveTo(0, y); c.lineTo(w, y); } c.stroke();
    const fxp = w * 0.16;
    c.fillStyle = INK; c.fillRect(fxp - 9, -2, 18, H * 0.2); c.beginPath(); c.moveTo(fxp - 9, H * 0.2); c.quadraticCurveTo(fxp - 9, H * 0.3, fxp + 18, H * 0.3); c.lineTo(fxp + 34, H * 0.3); c.lineTo(fxp + 34, H * 0.3 + 12); c.lineTo(fxp + 16, H * 0.3 + 12); c.quadraticCurveTo(fxp + 9, H * 0.3 + 12, fxp + 9, H * 0.2); c.lineTo(fxp + 9, -2); c.fill();
    c.fillStyle = rgba(PAL.cyan, 0.55); c.fillRect(fxp - 9, -2, 2.4, H * 0.2); c.fillStyle = rgba(BONE, 0.3); c.fillRect(fxp - 6, -2, 3, H * 0.2);
  } else if (T.style === 'brick') { // telephone wires
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-5, H * (0.18 + k * 0.05)); c.quadraticCurveTo(w * 0.4, H * (0.3 + k * 0.05), w + 5, H * (0.14 + k * 0.05)); c.strokeStyle = rgba(INK, 0.9); c.lineWidth = 1.4; c.stroke(); }
  }
  // horizon glow
  const hg = c.createLinearGradient(0, H * 0.55, 0, H);
  hg.addColorStop(0, rgba(d.horizon, 0)); hg.addColorStop(1, rgba(d.horizon, 0.32)); c.fillStyle = hg; c.fillRect(0, H * 0.55, w, H * 0.45);
}
function paintClouds(c, Lw, H, T) {
  const d = T.def, rnd = mk(T.seed ^ 0xc10d);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const cx = (i + rnd() * 0.8) / n * Lw, cy = H * (0.18 + rnd() * 0.6), wd = Lw * (0.12 + rnd() * 0.12);
    for (let k = 0; k < 5; k++) {
      const ox = (rnd() - 0.5) * wd * 1.1, oy = (rnd() - 0.5) * H * 0.05, rx = wd * (0.3 + rnd() * 0.3), ry = rx * (0.14 + rnd() * 0.1);
      for (const sh of [0, -Lw, Lw]) {
        const x = cx + ox + sh; if (x + rx < 0 || x - rx > Lw) continue;
        c.save(); c.translate(x, cy + oy); c.scale(1, ry / rx);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, rgba(d.cloud, d.cloudA)); g.addColorStop(1, rgba(d.cloud, 0));
        c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx * 2); c.restore();
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ skyline layers
const LAYER_SPEED_K = [0, 1, 2];
function layerCols(T, layer) {
  const haze = mix(T.skyBottom, INK, 0.25);
  const body = [mix(INK, haze, 0.55), mix(INK, haze, 0.3), mix(PAL.ink2, INK, 0.25)][layer];
  return { body, top: shade(body, 0.05), bot: mix(body, T.skyBottom, [0.4, 0.3, 0.2][layer]), haze };
}
function windows(c, x0, y0, w, h, ww, wh, gx, gy, p, T, rnd, M, layer) {
  const off = layer === 0 ? rgba(PAL.ink3, 0.5) : PAL.ink3;
  for (let yy = y0 + gy; yy + wh <= y0 + h - gy; yy += wh + gy) for (let xx = x0 + gx; xx + ww <= x0 + w - gx; xx += ww + gx) {
    if (rnd() < p) {
      const col = T.win[(rnd() * T.win.length) | 0];
      c.fillStyle = rgba(col, layer === 0 ? 0.5 : 0.92); c.fillRect(xx, yy, ww, wh);
      if (layer === 2 && M.flick.length < 18 && rnd() < 0.14) M.flick.push({ x: xx, y: yy, w: ww, h: wh, col, ph: rnd() * 10 });
    } else { c.fillStyle = off; c.fillRect(xx, yy, ww, wh); }
  }
}
function body(c, x, top, w, bot, layer, T) {
  const L = layerCols(T, layer);
  const g = c.createLinearGradient(0, top, 0, bot); g.addColorStop(0, L.top); g.addColorStop(1, L.bot);
  c.fillStyle = g; c.fillRect(x, top, w, bot - top);
  c.fillStyle = rgba(PAL.cyan, [0.14, 0.26, 0.55][layer]); c.fillRect(x, top, 1, bot - top);
  c.fillStyle = rgba(BONE, [0.14, 0.26, 0.42][layer]); c.fillRect(x, top, w, 1);
  if (layer === 2) { c.fillStyle = rgba(PAL.magenta, 0.12); c.fillRect(x + w - 2, top, 2, bot - top); }
}
function sign(c, M, x, y, w, h, col, rnd) {
  c.fillStyle = INK; c.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  c.fillStyle = rgba(col, 0.18); c.fillRect(x, y, w, h);
  c.fillStyle = rgba(col, 0.45); for (let yy = y + 2; yy < y + h - 2; yy += 5) c.fillRect(x + 1.5, yy, w - 3, 2);
  M.signs.push({ x, y, w, h, col, ph: rnd() * 8 });
}
const STY = {
  roof(c, x, top, w, bot, layer, rnd, T, M) {
    const rh = w * (0.15 + rnd() * 0.22), L = layerCols(T, layer);
    c.fillStyle = shade(L.body, layer === 2 ? 0.02 : -0.02); c.beginPath(); c.moveTo(x - 1, top); c.lineTo(x + w * (0.3 + rnd() * 0.4), top - rh); c.lineTo(x + w + 1, top); c.closePath(); c.fill();
    c.strokeStyle = rgba(PAL.cyan, [0.12, 0.3, 0.6][layer]); c.lineWidth = 1; c.beginPath(); c.moveTo(x - 1, top); c.lineTo(x + w * 0.5, top - rh); c.stroke();
    if (rnd() < 0.55) { const ax = x + w * (0.2 + rnd() * 0.6), ah = 10 + rnd() * 18; c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(ax, top - rh * 0.6); c.lineTo(ax, top - rh * 0.6 - ah); c.moveTo(ax - 4, top - rh * 0.6 - ah * 0.6); c.lineTo(ax + 4, top - rh * 0.6 - ah * 0.6); c.moveTo(ax - 3, top - rh * 0.6 - ah * 0.3); c.lineTo(ax + 3, top - rh * 0.6 - ah * 0.3); c.stroke(); if (layer > 0) M.beacons.push({ x: ax, y: top - rh * 0.6 - ah, col: rnd() < 0.5 ? PAL.magenta : PAL.cyan, ph: rnd() * 6 }); }
    if (layer > 0 && rnd() < 0.4) { const cx = x + w * 0.7, cw = 5 + rnd() * 3; c.fillStyle = L.body; c.fillRect(cx, top - rh * 0.7 - 8, cw, 10); M.vents.push({ x: cx + cw / 2, y: top - rh * 0.7 - 8, k: layer }); }
    if (layer > 0 && w > 40 && rnd() < 0.3) { const tx = x + w * 0.2, ty = top - 2; c.fillStyle = L.body; c.fillRect(tx, ty - 18, 12, 14); c.fillRect(tx + 1, ty - 4, 2, 4); c.fillRect(tx + 9, ty - 4, 2, 4); c.beginPath(); c.moveTo(tx - 1, ty - 18); c.lineTo(tx + 6, ty - 25); c.lineTo(tx + 13, ty - 18); c.closePath(); c.fill(); }
    if (layer === 2 && rnd() < 0.5) { c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 2, top + 10); c.quadraticCurveTo(x + w / 2, top + 16, x + w - 2, top + 10); c.stroke(); for (let i = 0; i < 3; i++) { c.fillStyle = rgba([PAL.magenta, PAL.bone, PAL.cyan][i], 0.7); c.fillRect(x + w * (0.25 + i * 0.22), top + 12 + (i & 1), 3, 5); } }
  },
  brick(c, x, top, w, bot, layer, rnd, T, M) {
    c.fillStyle = rgba(INK, 0.5); c.fillRect(x - 1, top - 3, w + 2, 3);
    c.fillStyle = rgba(PAL.cyan, [0.1, 0.25, 0.5][layer]); c.fillRect(x - 1, top - 3, w + 2, 1);
    if (layer > 0) { c.strokeStyle = rgba(INK, 0.55); c.lineWidth = 1; for (let y = top + 5; y < bot; y += 6) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke(); } }
    if (layer === 2 && rnd() < 0.7) { const fx = x + w - 13; c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); for (let y = top + 6; y < bot - 14; y += 16) { c.moveTo(fx, y); c.lineTo(fx + 11, y); c.moveTo(fx, y); c.lineTo(fx + 11, y + 14); c.moveTo(fx + 11, y + 14); c.lineTo(fx, y + 14); } c.stroke(); c.strokeStyle = rgba(PAL.magenta, 0.3); c.lineWidth = 0.6; c.beginPath(); c.moveTo(fx, top + 6); c.lineTo(fx + 11, top + 6); c.stroke(); }
    if (layer > 0 && rnd() < 0.35) { const tx = x + w * 0.3; c.fillStyle = INK; c.fillRect(tx - 5, top - 14, 10, 8); c.fillRect(tx - 4, top - 6, 1.5, 6); c.fillRect(tx + 3, top - 6, 1.5, 6); }
    if (layer > 0 && rnd() < 0.4) M.vents.push({ x: x + w * (0.2 + rnd() * 0.6), y: top - 3, k: layer });
    if (layer === 2 && rnd() < 0.45 && M.signs.length < 6) sign(c, M, x + 3, top + 10, 7, 24 + rnd() * 14, rnd() < 0.5 ? PAL.magenta : PAL.cyan, rnd);
  },
  pipe(c, x, top, w, bot, layer, rnd, T, M) { // sewer: vertical pipe stacks with bands, valves, drips
    const L = layerCols(T, layer);
    for (let y = top + 6; y < bot; y += 10 + rnd() * 8) { c.fillStyle = shade(L.body, 0.1); c.fillRect(x - 1.5, y, w + 3, 3); c.fillStyle = rgba(PAL.lime, [0.1, 0.22, 0.4][layer]); c.fillRect(x - 1.5, y + 3, w + 3, 1); }
    c.fillStyle = shade(L.body, 0.1); c.fillRect(x - 3, top - 3, w + 6, 4);
    if (layer > 0) { c.beginPath(); c.arc(x + w * 0.5, top - 3, w * 0.7, PI, TAU); c.fillStyle = L.body; c.fill(); }
    if (layer === 2) { const vy = top + 14 + rnd() * 20; c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.arc(x + w + 3, vy, 6, 0, TAU); c.moveTo(x + w + 3, vy - 6); c.lineTo(x + w + 3, vy + 6); c.moveTo(x + w - 3, vy); c.lineTo(x + w + 9, vy); c.stroke(); if (M.signs.length < 6 && rnd() < 0.5) sign(c, M, x + 3, top + 8, 5, 18, PAL.lime, rnd); M.vents.push({ x: x + w * 0.5, y: top - 6, k: layer }); }
  },
  casino(c, x, top, w, bot, layer, rnd, T, M) {
    c.fillStyle = rgba(PAL.magenta, [0.1, 0.25, 0.5][layer]); c.fillRect(x - 1, top - 2, w + 2, 1.4);
    if (layer > 0 && rnd() < 0.5) { const r = w * 0.32, cx = x + w / 2, cy = top - r - 2; c.strokeStyle = rgba(rnd() < 0.5 ? PAL.cyan : PAL.magenta, layer === 2 ? 0.85 : 0.4); c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(cx, cy + r); c.lineTo(cx, top); c.stroke(); }
    if (layer > 0 && rnd() < 0.5) { c.fillStyle = INK; c.fillRect(x + w * 0.5 - 1, top - 28, 2, 28); M.beacons.push({ x: x + w * 0.5, y: top - 28, col: PAL.magenta, ph: rnd() * 5 }); }
    if (layer === 2 && M.signs.length < 8 && rnd() < 0.65) sign(c, M, x + w * 0.5 - 5, top + 8, 10, 30 + rnd() * 24, [PAL.magenta, PAL.cyan, PAL.lime][(rnd() * 3) | 0], rnd);
    if (layer > 0 && rnd() < 0.3) M.lights.push({ x: x + w * 0.5, y: top - 2, k: layer });
  },
  steel(c, x, top, w, bot, layer, rnd, T, M) {
    const L = layerCols(T, layer);
    c.fillStyle = shade(L.body, 0.05); c.fillRect(x + 2, top - 5, w - 4, 5);
    if (layer > 0) { c.strokeStyle = rgba(INK, 0.55); c.lineWidth = 1; for (let xx = x + 4; xx < x + w - 2; xx += 4) { c.beginPath(); c.moveTo(xx, top + 3); c.lineTo(xx, bot); c.stroke(); } }
    if (layer > 0 && rnd() < 0.55) { const cx = x + w * (0.2 + rnd() * 0.5); c.fillStyle = L.body; c.fillRect(cx, top - 24, 7, 20); c.fillStyle = rgba(PAL.magenta, 0.7); c.fillRect(cx, top - 22, 7, 2); c.fillRect(cx, top - 16, 7, 2); M.vents.push({ x: cx + 3.5, y: top - 24, k: layer }); }
    if (layer === 2) { c.fillStyle = rgba(PAL.cyan, 0.5); for (let yy = bot - 10; yy > top + 8; yy -= 22) c.fillRect(x, yy, w, 1); if (M.signs.length < 6 && rnd() < 0.4) sign(c, M, x + w - 11, top + 10, 7, 22, PAL.cyan, rnd); if (rnd() < 0.4) { c.fillStyle = rgba(PAL.magenta, 0.8); for (let i = 0; i < 3; i++) c.fillRect(x + 3 + i * 5, bot - 6, 3, 2); } }
  },
  tile(c, x, top, w, bot, layer, rnd, T, M) {
    c.strokeStyle = rgba(PAL.cyan, [0.05, 0.1, 0.16][layer]); c.lineWidth = 1;
    c.beginPath(); for (let xx = x + 8; xx < x + w; xx += 8) { c.moveTo(xx, top); c.lineTo(xx, bot); } for (let yy = top + 8; yy < bot; yy += 8) { c.moveTo(x, yy); c.lineTo(x + w, yy); } c.stroke();
    if (layer > 0 && rnd() < 0.5) { c.beginPath(); c.arc(x + w / 2, top, w * 0.4, PI, TAU); c.fillStyle = rgba(PAL.cyan, layer === 2 ? 0.22 : 0.12); c.fill(); c.strokeStyle = rgba(BONE, layer === 2 ? 0.5 : 0.2); c.lineWidth = 1; c.stroke(); }
    if (layer > 0 && rnd() < 0.3) { const px = x + w * 0.7; c.fillStyle = INK; c.fillRect(px, top - 18, 4, 18); c.fillRect(px - 8, top - 18, 12, 4); c.fillRect(px - 8, top - 18, 4, 7); M.vents.push({ x: px - 6, y: top - 11, k: layer }); }
    if (layer === 2 && M.signs.length < 5 && rnd() < 0.4) sign(c, M, x + 3, top + 9, 6, 20, PAL.cyan, rnd);
  },
};
function paintLayer(c, Lw, H, T, layer) {
  const rnd = mk(T.seed + layer * 977 + 13);
  const M = { signs: [], flick: [], beacons: [], vents: [], lights: [] };
  const hr = [[0.42, 0.78], [0.34, 0.66], [0.24, 0.5]][layer];
  const wr = [[28, 70], [32, 80], [38, 96]][layer];
  const win = [[3, 5, 3, 4, 0.12], [4, 6, 3, 4, 0.2], [5, 7, 4, 5, 0.32]][layer];
  let x = 0;
  while (x < Lw - 1) {
    let bw = wr[0] + rnd() * (wr[1] - wr[0]);
    if (Lw - x - bw < wr[0] * 0.8) bw = Lw - x;
    bw = Math.round(bw);
    if (x + bw > Lw) bw = Lw - x;
    const bh = H * (hr[0] + rnd() * (hr[1] - hr[0])), top = H - bh;
    body(c, x, top, bw, H, layer, T);
    if (T.style !== 'pipe' && T.style !== 'tile') windows(c, x, top, bw, bh, win[0], win[1], win[2], win[3], win[4], T, rnd, M, layer);
    else if (T.style === 'tile') windows(c, x + bw * 0.15, top + 6, bw * 0.7, bh * 0.6, 7, 7, 5, 5, win[4] * 0.8, T, rnd, M, layer);
    else { const sw = win[4] * 0.5; windows(c, x, top + 8, bw, bh * 0.3, 3, 3, 5, 5, sw, T, rnd, M, layer); }
    STY[T.style](c, x, top, bw, H, layer, rnd, T, M);
    x += bw;
  }
  // soft haze at the foot of the layer
  const hz = c.createLinearGradient(0, H * 0.55, 0, H);
  hz.addColorStop(0, rgba(T.skyBottom, 0)); hz.addColorStop(1, rgba(T.skyBottom, [0.35, 0.22, 0.1][layer])); c.fillStyle = hz; c.fillRect(0, H * 0.55, Lw, H * 0.45);
  return M;
}
function buildCity(w, baseY, T) {
  const Hmax = cl(baseY * 0.92, 90, 460);
  const Lw = max(Math.ceil(w), 360);
  const city = { w, baseY, Lw, H: Hmax, layers: [], metas: [] };
  city.sky = bake(w, max(8, baseY), (c) => paintSky(c, w, max(8, baseY), T));
  city.clouds = bake(Lw, Hmax * 0.6, (c) => paintClouds(c, Lw, Hmax * 0.6, T));
  for (let l = 0; l < 3; l++) {
    let meta = null;
    const B = bake(Lw, Hmax, (c) => { meta = paintLayer(c, Lw, Hmax, T, l); });
    if (!meta) meta = paintLayer(makeNullCtx(), Lw, Hmax, T, l);
    city.layers.push(B); city.metas.push(meta);
  }
  return city;
}
function makeNullCtx() { // metadata only (a fallback when baking failed): a recording sink
  const sink = new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return () => {}; }, set() { return true; } });
  return sink;
}
function cityFor(w, baseY, T) {
  return cached('city|' + T.id + '|' + w + '|' + Math.round(baseY) + '|' + dpr(), () => buildCity(w, Math.round(baseY), T));
}

/** Parallax city: sky, stars, clouds, 3 skyline layers, ambient life. baseY = y of the skyline foot. */
function drawCity(ctx, w, t, T, baseY, topY) {
  const city = cityFor(w, baseY, T), d = T.def;
  blit(ctx, city.sky, 0, 0);
  const fallback = !city.layers[0].cv;
  // twinkling stars and moon pulse
  if (d.stars) {
    for (let i = 0; i < 16; i++) {
      const x = hsh(i, 11) * w, y = hsh(i, 13) * baseY * 0.5, a = 0.5 + 0.5 * sin(t * (1.2 + hsh(i, 5) * 2) + i * 1.7);
      sparkle(ctx, x, y, 1.6 + 2.2 * hsh(i, 7) * a, BONE, 0.25 + 0.6 * a);
    }
  }
  if (d.moon && d.moon !== 'gear') { const mx = w * 0.78, my = baseY * 0.24; bloom(ctx, mx, my, min(w * 0.09, baseY * 0.13, 60) * 3.2, d.moon === 'blood' || d.moon === 'ring' ? PAL.magenta : T.accent, 0.1 + 0.05 * sin(t * 0.8)); }
  if (T.style === 'tile') { // faucet drip
    const fxp = w * 0.16 + 26, fy = baseY * 0.3 + 12, ph = frac(t * 0.7);
    ctx.fillStyle = rgba(PAL.cyan, 0.9 * (1 - ph * 0.3)); ctx.beginPath(); ctx.ellipse(fxp, fy + ph * ph * baseY * 0.55, 2.2, 3.6 + ph * 3, 0, 0, TAU); ctx.fill();
  }
  // clouds drift
  const Hc = city.clouds.h, cOff = -((t * 3.4) % city.Lw), cy = baseY - city.H * 0.95;
  ctx.save(); ctx.globalAlpha *= 1;
  blit(ctx, city.clouds, cOff, max(0, cy)); if (!fallback) blit(ctx, city.clouds, cOff + city.Lw, max(0, cy));
  ctx.restore(); void Hc;
  // beams (laser strip)
  if (d.beams) {
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const bx = w * (0.18 + i * 0.32), a = sin(t * (0.5 + i * 0.17) + i * 2) * 0.55, len = baseY * 1.2, hw = 0.05;
      ctx.fillStyle = rgba(i === 1 ? PAL.cyan : PAL.magenta, 0.07 * pa);
      ctx.beginPath(); ctx.moveTo(bx, baseY); ctx.lineTo(bx + sin(a - hw) * len, baseY - cos(a - hw) * len); ctx.lineTo(bx + sin(a + hw) * len, baseY - cos(a + hw) * len); ctx.fill();
      ctx.fillStyle = rgba(BONE, 0.05 * pa); ctx.beginPath(); ctx.moveTo(bx, baseY); ctx.lineTo(bx + sin(a - hw * 0.3) * len, baseY - cos(a - hw * 0.3) * len); ctx.lineTo(bx + sin(a + hw * 0.3) * len, baseY - cos(a + hw * 0.3) * len); ctx.fill();
    }
    ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
  }
  // power sparks (appliance heights)
  if (d.sparks) {
    for (let k = 0; k < 4; k++) {
      const ph = frac(t * 0.37 + k * 0.29), on = ph < 0.12;
      if (on) { const x = w * (0.12 + hsh(floor(t * 0.37 + k * 0.29), k) * 0.78), y = baseY * (0.14 + k * 0.1) + 8; sparkle(ctx, x, y, 7, BONE, 1 - ph / 0.12); bloom(ctx, x, y, 16, PAL.cyan, 0.5 * (1 - ph / 0.12)); }
    }
  }
  if (d.waves) { // water line sheen
    ctx.strokeStyle = rgba(PAL.cyan, 0.22); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let x = 0; x <= w; x += 6) { const y = baseY - 14 + sin(x * 0.04 + t * 1.6) * 2.2; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
  }
  // layers with drift, birds in between
  for (let l = 0; l < 3; l++) {
    const B = city.layers[l], M = city.metas[l], off = -((t * d.drift[l]) % city.Lw), y0 = baseY - city.H;
    if (l === 1 && d.birds) drawBirds(ctx, w, t, baseY, d.birds, topY);
    blit(ctx, B, off, y0); if (!fallback) blit(ctx, B, off + city.Lw, y0);
    if (l === 0) continue;
    for (let copy = 0; copy < (fallback ? 1 : 2); copy++) {
      const ox = off + copy * city.Lw;
      if (ox > w || ox + city.Lw < 0) continue;
      if (l === 2) {
        for (let i = 0; i < M.flick.length; i++) { const f = M.flick[i], on = hsh(floor(t * 1.7 + f.ph), i + 5) > 0.45; const x = ox + f.x; if (x < -6 || x > w + 6) continue; ctx.fillStyle = rgba(f.col, on ? 0.9 : 0.1); ctx.fillRect(x, y0 + f.y, f.w, f.h); if (on) bloom(ctx, x + f.w / 2, y0 + f.y + f.h / 2, 7, f.col, 0.35); }
        for (let i = 0; i < M.signs.length; i++) {
          const s = M.signs[i], x = ox + s.x; if (x < -20 || x > w + 20) continue;
          const fl = hsh(floor(t * 2.2 + s.ph), i + 31); const lit = fl > 0.12 ? 1 : 0.15;
          const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = rgba(s.col, 0.55 * lit * pa); for (let yy = y0 + s.y + 2; yy < y0 + s.y + s.h - 2; yy += 5) ctx.fillRect(x + 1.5, yy, s.w - 3, 2);
          ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
          bloom(ctx, x + s.w / 2, y0 + s.y + s.h / 2, max(s.w, s.h) * 1.1, s.col, 0.45 * lit);
        }
      }
      for (let i = 0; i < M.beacons.length; i++) { const b = M.beacons[i], x = ox + b.x; if (x < -6 || x > w + 6) continue; const on = frac(t * 0.7 + b.ph) < 0.22; if (on) bloom(ctx, x, y0 + b.y, 6 + l * 2, b.col, 0.9); }
      for (let i = 0; i < M.vents.length; i++) { const v = M.vents[i]; if (v.k !== l) continue; const x = ox + v.x; if (x < -20 || x > w + 20) continue; plume(ctx, x, y0 + v.y, t + i * 1.7, T, 0.5 + l * 0.25); }
      for (let i = 0; i < M.lights.length; i++) { const v = M.lights[i]; if (v.k !== l) continue; const x = ox + v.x; if (x < -20 || x > w + 20) continue; const a = sin(t * 0.9 + i * 2) * 0.5; const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(i & 1 ? PAL.cyan : PAL.magenta, 0.09 * pa); ctx.beginPath(); ctx.moveTo(x, y0 + v.y); ctx.lineTo(x + sin(a - 0.07) * 160, y0 + v.y - cos(a - 0.07) * 160); ctx.lineTo(x + sin(a + 0.07) * 160, y0 + v.y - cos(a + 0.07) * 160); ctx.fill(); ctx.globalCompositeOperation = po; ctx.globalAlpha = pa; }
    }
  }
}
function plume(ctx, x, y, t, T, k) {
  const st = T.def.steam; if (!st) return;
  const col = st === 'sewer' ? PAL.lime : st === 'smoke' ? PAL.slate : st === 'foam' ? PAL.bone : PAL.boneDim;
  for (let i = 0; i < 5; i++) {
    const ph = frac(t * 0.28 + i / 5), r = (2 + ph * 9) * k;
    ctx.fillStyle = rgba(col, (st === 'foam' ? 0.2 : 0.14) * (1 - ph)); ctx.beginPath();
    if (st === 'foam') ctx.arc(x + sin(ph * 6 + i) * 6, y - ph * 40 * k, r * 0.6, 0, TAU); else ctx.arc(x + sin(ph * 4 + i * 2) * 3 + ph * 10, y - ph * 34 * k, r, 0, TAU);
    ctx.fill();
  }
}
function drawBirds(ctx, w, t, baseY, n, topY) {
  const lo = max(10, topY || 0) + 10, hi = baseY * 0.6;
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const sp = 14 + hsh(i, 1) * 22, per = w + 120, x = ((hsh(i, 2) * per + t * sp) % per) - 60, y = lo + (hi - lo) * (0.15 + 0.85 * hsh(i, 3)) + sin(t * 0.9 + i) * 5;
    const fl = sin(t * (9 + hsh(i, 4) * 4) + i * 3), s = 3.4 + hsh(i, 6) * 2.4;
    ctx.beginPath(); ctx.moveTo(x - s * 1.8, y + fl * s * 0.9); ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.4, x, y); ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.4, x + s * 1.8, y + fl * s * 0.9);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke(); ctx.strokeStyle = rgba(PAL.cyan, 0.6); ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y + 0.6, s * 0.7, s * 0.5, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ rooftop slab
function cellTex(c, style, x, y, w, h, T, rnd, lane, col) {
  const dk = rgba(INK, 0.5), lt = rgba(BONE, 0.05);
  if (style === 'roof') { const rows = 5; for (let r = 0; r < rows; r++) { const yy = y + (r + 1) * h / rows; c.strokeStyle = dk; c.lineWidth = 1; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); const sw = w / 3; for (let k = -1; k < 4; k++) { const xx = x + k * sw + (r & 1 ? sw / 2 : 0); c.beginPath(); c.arc(xx + sw / 2, yy - h / rows, sw / 2, 0.15, PI - 0.15); c.strokeStyle = rgba(INK, 0.35); c.stroke(); } } }
  else if (style === 'brick') { const rh = h / 6; for (let r = 0; r < 6; r++) { const yy = y + r * rh; c.fillStyle = dk; c.fillRect(x, yy, w, 1); const bw = w / 3; for (let k = 0; k < 4; k++) { const xx = x + k * bw + (r & 1 ? -bw / 2 : 0); c.fillRect(xx, yy, 1, rh); } if (rnd() < 0.3) { c.fillStyle = lt; c.fillRect(x + rnd() * w * 0.7, yy + 1, w * 0.2, rh - 2); } } }
  else if (style === 'pipe') { c.fillStyle = dk; for (let i = 1; i < 6; i++) c.fillRect(x + 2, y + i * h / 6, w - 4, 1.6); if (rnd() < 0.35) { c.fillStyle = rgba(PAL.lime, 0.14); c.beginPath(); c.ellipse(x + w * (0.3 + rnd() * 0.4), y + h * (0.3 + rnd() * 0.4), w * 0.25, h * 0.1, 0, 0, TAU); c.fill(); } }
  else if (style === 'casino') { c.fillStyle = rgba(T.accent, 0.5); c.fillRect(x + 2, y + 2, w - 4, 1); c.fillRect(x + 2, y + h - 3, w - 4, 1); c.fillStyle = rgba(BONE, 0.045); c.beginPath(); c.moveTo(x + w * 0.1, y + h); c.lineTo(x + w * 0.45, y); c.lineTo(x + w * 0.6, y); c.lineTo(x + w * 0.25, y + h); c.fill(); }
  else if (style === 'steel') { c.fillStyle = lt; for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x + (k + 0.2 + (i & 1) * 0.5) * w / 3, y + (i + 0.3) * h / 4); c.lineTo(x + (k + 0.45 + (i & 1) * 0.5) * w / 3, y + (i + 0.55) * h / 4); c.lineTo(x + (k + 0.2 + (i & 1) * 0.5) * w / 3, y + (i + 0.8) * h / 4); c.lineTo(x + (k - 0.05 + (i & 1) * 0.5) * w / 3, y + (i + 0.55) * h / 4); c.fill(); } for (const [rx, ry] of [[3, 3], [w - 3, 3], [3, h - 3], [w - 3, h - 3]]) { c.fillStyle = dk; c.beginPath(); c.arc(x + rx, y + ry, 1.5, 0, TAU); c.fill(); } }
  else if (style === 'tile') { c.strokeStyle = rgba(PAL.cyan, 0.16); c.lineWidth = 1; c.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7); c.fillStyle = rgba(BONE, 0.07); c.fillRect(x + 5, y + 5, w * 0.4, 2); c.fillRect(x + 5, y + 5, 2, h * 0.3); }
}
function paintFront(c, L, T) {
  const w = L.w, h = L.h, f = L.field, y0 = L.frontY, tw = L.tileW, th = L.tileH, rnd = mk(T.seed ^ 0xf00d);
  c.translate(0, -y0);
  // facade under the roof
  const g = c.createLinearGradient(0, y0, 0, h); g.addColorStop(0, PAL.ink2); g.addColorStop(0.3, INK); g.addColorStop(1, PAL.void);
  c.fillStyle = g; c.fillRect(0, y0, w, h - y0);
  c.strokeStyle = rgba(T.accent, 0.07); c.lineWidth = 1; c.beginPath();
  for (let x = f.x % 38; x < w; x += 38) { c.moveTo(x, f.y + f.h + 16); c.lineTo(x, h); } c.stroke();
  // slab geometry
  const sx = f.x - 12, sw = f.w + 24, sy = f.y - 14, sh = f.h + 30;
  // outer parapet (ink outline)
  const ch = 8;
  const slab = (cc, ix) => { cc.moveTo(sx + ch + ix, sy + ix); cc.lineTo(sx + sw - ch - ix, sy + ix); cc.lineTo(sx + sw - ix, sy + ch + ix); cc.lineTo(sx + sw - ix, sy + sh - ch - ix); cc.lineTo(sx + sw - ch - ix, sy + sh - ix); cc.lineTo(sx + ch + ix, sy + sh - ix); cc.lineTo(sx + ix, sy + sh - ch - ix); cc.lineTo(sx + ix, sy + ch + ix); cc.closePath(); };
  c.beginPath(); slab(c, -2); c.fillStyle = INK; c.fill();
  c.beginPath(); slab(c, 0); const pg = c.createLinearGradient(0, sy, 0, sy + sh); pg.addColorStop(0, mix(PAL.ink3, T.accent, 0.08)); pg.addColorStop(1, PAL.ink2); c.fillStyle = pg; c.fill();
  c.strokeStyle = rgba(PAL.cyan, 0.75); c.lineWidth = 1.5; c.beginPath(); c.moveTo(sx, sy + sh - ch); c.lineTo(sx, sy + ch); c.lineTo(sx + ch, sy); c.lineTo(sx + sw - ch, sy); c.stroke();
  c.strokeStyle = rgba(PAL.magenta, 0.5); c.beginPath(); c.moveTo(sx + ch, sy + sh); c.lineTo(sx + sw - ch, sy + sh); c.stroke();
  // front lip lights
  for (let x = sx + 24; x < sx + sw - 20; x += 22) { c.fillStyle = rgba(T.accent, 0.55); c.fillRect(x, f.y + f.h + 10, 8, 2); }
  // the playing surface
  const px0 = f.x, py0 = f.y;
  c.save(); c.beginPath(); c.rect(px0, py0, f.w, f.h); c.clip();
  for (let l = 0; l < LANES; l++) {
    for (let k = 0; k <= 11; k++) {
      const tx0 = k - 0.5 + (k === 0 ? 0 : 0); // k=0 -> x in [-0.5,0.5] hidden under base, k=1..8 cats, 9..10 danger
      const cx = L.colX(tx0 === -0.5 ? -1.2 : tx0), cw = (k === 0 ? 1.7 : k === 11 ? (X_MAX - 10.5) : 1) * tw;
      if (k === 11 || cw <= 0) { continue; }
      const cy = py0 + l * th;
      const danger = k >= 9;
      const dark = lerp(-0.12, 0.05, l / (LANES - 1));
      let base = mix(T.ground, PAL.violet, 0.28);
      base = shade(base, dark + ((k + l) & 1 ? 0.04 : -0.02));
      if (danger) base = mix(base, PAL.magentaDeep, 0.28);
      c.fillStyle = base; c.fillRect(cx, cy, cw, th);
      c.save(); c.beginPath(); c.rect(cx, cy, cw, th); c.clip();
      cellTex(c, T.style, cx, cy, cw, th, T, rnd, l, k);
      // bevel: cyan top-left, magenta bounce bottom
      c.fillStyle = rgba(BONE, 0.07); c.fillRect(cx, cy, cw, 1); c.fillRect(cx, cy, 1, th);
      c.fillStyle = rgba(INK, 0.42); c.fillRect(cx, cy + th - 1.4, cw, 1.4); c.fillRect(cx + cw - 1.4, cy, 1.4, th);
      // halftone shade bottom right
      c.fillStyle = rgba(INK, 0.28); c.beginPath();
      for (let yy = cy + th * 0.55, row = 0; yy < cy + th; yy += 3.2, row++) for (let xx = cx + cw * 0.35 + (row & 1) * 1.6; xx < cx + cw; xx += 3.2) { const rr = ((xx - cx) / cw + (yy - cy) / th - 0.9) * 1.2; if (rr > 0.1) { c.moveTo(xx + rr, yy); c.arc(xx, yy, min(rr, 1.1), 0, TAU); } }
      c.fill();
      c.restore();
    }
  }
  // lane dividers: glowing seams
  for (let l = 0; l <= LANES; l++) {
    const y = py0 + l * th;
    c.fillStyle = INK; c.fillRect(L.colX(0.5), y - 1.2, L.colX(10.4) - L.colX(0.5), 2.4);
    c.fillStyle = rgba(T.accent, l === 0 || l === LANES ? 0.8 : 0.6); c.fillRect(L.colX(0.5), y - 0.5, L.colX(10.4) - L.colX(0.5), 1);
  }
  for (let k = 1; k <= 11; k++) { const x = L.colX(k - 0.5); c.fillStyle = rgba(INK, 0.6); c.fillRect(x - 0.6, py0, 1.2, f.h); if (k <= 9) { c.fillStyle = rgba(T.accent, 0.3); c.fillRect(x + 0.6, py0, 0.8, f.h); } }
  // corner studs at the intersections
  for (let l = 0; l <= LANES; l++) for (let k = 1; k <= 9; k++) { const x = L.colX(k - 0.5), y = py0 + l * th; c.fillStyle = rgba(T.accent, 0.55); c.fillRect(x - 1, y - 1, 2, 2); }
  // lane centre dashes
  c.strokeStyle = rgba(T.accent, 0.16); c.lineWidth = 1; c.setLineDash([5, 7]);
  for (let l = 0; l < LANES; l++) { c.beginPath(); c.moveTo(L.colX(1.1), L.laneY(l)); c.lineTo(L.colX(8.4), L.laneY(l)); c.stroke(); }
  c.setLineDash([]);
  // danger zone: magenta wash, hazard front line, chevrons, spawn vents
  const dg = c.createLinearGradient(L.colX(8.5), 0, L.colX(X_MAX), 0); dg.addColorStop(0, rgba(PAL.magenta, 0)); dg.addColorStop(1, rgba(PAL.magenta, 0.3));
  c.fillStyle = dg; c.fillRect(L.colX(8.5), py0, L.colX(X_MAX) - L.colX(8.5), f.h);
  c.save(); c.beginPath(); c.rect(L.colX(8.46), py0, 4, f.h); c.clip(); c.fillStyle = rgba(PAL.magenta, 0.8);
  for (let y = py0 - 8; y < py0 + f.h + 8; y += 10) { c.beginPath(); c.moveTo(L.colX(8.46), y); c.lineTo(L.colX(8.46) + 4, y + 4); c.lineTo(L.colX(8.46) + 4, y + 9); c.lineTo(L.colX(8.46), y + 5); c.fill(); }
  c.restore();
  for (let l = 0; l < LANES; l++) {
    const cy = L.laneY(l);
    for (let k = 0; k < 2; k++) { const cx = L.colX(8.9 + k * 0.55); c.strokeStyle = rgba(PAL.magenta, 0.5 - k * 0.2); c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx + tw * 0.1, cy - th * 0.1); c.lineTo(cx - tw * 0.1, cy); c.lineTo(cx + tw * 0.1, cy + th * 0.1); c.stroke(); }
    // gate marker at the base side
    const gx = L.colX(0.62);
    c.fillStyle = rgba(PAL.cyan, 0.8); c.beginPath(); c.moveTo(gx - tw * 0.1, cy - th * 0.14); c.lineTo(gx + tw * 0.12, cy); c.lineTo(gx - tw * 0.1, cy + th * 0.14); c.closePath(); c.fill();
  }
  c.restore();
  // grain
  c.fillStyle = rgba(BONE, 0.05); for (let i = 0; i < 160; i++) c.fillRect(px0 + rnd() * f.w, py0 + rnd() * f.h, 1, 1);
}
function frontFor(L, T) {
  return cached('front|' + T.id + '|' + L.key + '|' + dpr(), () => {
    const hgt = L.h - L.frontY;
    return bake(L.w, hgt, (c) => paintFront(c, L, T));
  });
}

// ------------------------------------------------------------------------------------------------ base building
function paintBase(c, W, H, gy, state, T, th) {
  const rnd = mk(T.seed ^ (0xba5e + state * 31));
  const meta = { wins: [], gates: [], beacon: null, crest: null };
  const top = 0, yb = H - gy[LANES - 1] - th * 0.5 > 0 ? gy[0] - th * 0.5 : th * 0.9; // y where the lane stack begins
  const bodyG = c.createLinearGradient(0, yb, 0, H); bodyG.addColorStop(0, mix(PAL.ink3, T.accent, 0.1)); bodyG.addColorStop(1, mix(PAL.ink2, PAL.violet, 0.15));
  // stepped crown tiers
  const tiers = [{ w: 0.62, y: top + th * 0.4, h: yb - top - th * 0.4 - th * 0.12 }, { w: 0.84, y: yb - th * 0.16, h: th * 0.18 }];
  // spire
  c.fillStyle = INK; c.fillRect(W * 0.5 - 1.5, top + th * 0.05, 3, th * 0.4);
  meta.beacon = { x: W * 0.5, y: top + th * 0.05 };
  // crown tier
  const t0 = tiers[0];
  const tx = W * (1 - t0.w) / 2, tw = W * t0.w;
  c.fillStyle = INK; c.fillRect(tx - 2, t0.y - 2, tw + 4, t0.h + 4);
  c.fillStyle = bodyG; c.fillRect(tx, t0.y, tw, t0.h);
  // arched windows on crown
  const nw = max(1, Math.round(tw / 14));
  for (let i = 0; i < nw; i++) { const ww = tw / nw * 0.55, wx = tx + (i + 0.5) * tw / nw - ww / 2, wy = t0.y + t0.h * 0.28, wh = t0.h * 0.5; const lit = state < 2 ? rnd() > 0.15 : rnd() > 0.55; c.fillStyle = INK; c.beginPath(); c.moveTo(wx - 1, wy + wh); c.lineTo(wx - 1, wy + ww / 2); c.arc(wx + ww / 2, wy + ww / 2, ww / 2 + 1, PI, 0); c.lineTo(wx + ww + 1, wy + wh); c.fill(); c.fillStyle = lit ? rgba(PAL.magenta, 0.9) : PAL.ink3; c.beginPath(); c.moveTo(wx, wy + wh); c.lineTo(wx, wy + ww / 2); c.arc(wx + ww / 2, wy + ww / 2, ww / 2, PI, 0); c.lineTo(wx + ww, wy + wh); c.fill(); if (lit) meta.wins.push({ x: wx, y: wy, w: ww, h: wh, col: PAL.magenta }); }
  // cat-ear crest (neon crescent ears, "cats curve")
  const ear = (s) => { const cx = W * 0.5 + s * W * 0.18, base = t0.y + 1, hgt = th * 0.34; c.beginPath(); c.moveTo(cx - s * W * 0.14, base); c.quadraticCurveTo(cx - s * W * 0.12, base - hgt * 0.7, cx + s * W * 0.07, base - hgt); c.quadraticCurveTo(cx + s * W * 0.02, base - hgt * 0.4, cx + s * W * 0.14, base); c.closePath(); };
  for (const s of [-1, 1]) {
    if (state >= 3 && s > 0) { c.beginPath(); c.moveTo(W * 0.5 + W * 0.04, t0.y + 1); c.lineTo(W * 0.5 + W * 0.16, t0.y - th * 0.1); c.lineTo(W * 0.5 + W * 0.2, t0.y + 1); c.closePath(); c.fillStyle = INK; c.fill(); continue; }
    ear(s); c.fillStyle = INK; c.fill(); c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = INK; c.stroke();
    ear(s); const eg = c.createLinearGradient(0, t0.y - th * 0.34, 0, t0.y); eg.addColorStop(0, mix(PAL.cyan, BONE, 0.3)); eg.addColorStop(1, mix(PAL.violet, INK, 0.3)); c.fillStyle = eg; c.fill();
    ear(s); c.strokeStyle = rgba(PAL.cyan, 0.95); c.lineWidth = 1.4; c.stroke();
    ear(s); c.strokeStyle = rgba(PAL.cyan, 0.2); c.lineWidth = 5; c.stroke();
    c.save(); c.translate(W * 0.5 + s * W * 0.18, t0.y - 1); c.scale(0.5, 0.55); c.translate(-(W * 0.5 + s * W * 0.18), -(t0.y - 1)); ear(s); c.fillStyle = rgba(PAL.magenta, 0.75); c.fill(); c.restore();
  }
  meta.crest = { x: W * 0.5, y: t0.y - th * 0.3 };
  // cornice
  const t1 = tiers[1], cx0 = W * (1 - t1.w) / 2;
  c.fillStyle = INK; c.fillRect(cx0 - 2, t1.y - 2, W * t1.w + 4, t1.h + 4);
  c.fillStyle = mix(PAL.ink3, PAL.violetHi, 0.25); c.fillRect(cx0, t1.y, W * t1.w, t1.h);
  c.fillStyle = rgba(PAL.cyan, 0.8); c.fillRect(cx0, t1.y, W * t1.w, 1.2);
  for (let i = 0; i < 6; i++) { c.fillStyle = INK; c.fillRect(cx0 + 2 + i * (W * t1.w - 6) / 6, t1.y + t1.h - 3, 3, 3); }
  // main wall
  c.fillStyle = INK; c.fillRect(-1, yb - 2, W + 2, H - yb + 3);
  c.fillStyle = bodyG; c.fillRect(0, yb, W - 1, H - yb);
  c.fillStyle = rgba(PAL.cyan, 0.8); c.fillRect(0, yb, 1.5, H - yb); c.fillStyle = rgba(PAL.cyan, 0.8); c.fillRect(0, yb, W, 1.3);
  c.fillStyle = rgba(PAL.magenta, 0.35); c.fillRect(W - 2.4, yb, 2.4, H - yb);
  // brick courses and pilasters
  c.fillStyle = rgba(INK, 0.35); for (let y = yb + 6; y < H; y += 7) c.fillRect(0, y, W, 1);
  c.fillStyle = rgba(PAL.violetHi, 0.2); c.fillRect(W * 0.08, yb, 2, H - yb);
  // lane gates
  for (let l = 0; l < LANES; l++) {
    const cy = gy[l], gw = W * 0.44, gx = W * 0.36, gh = th * 0.7, gtop = cy - gh * 0.5;
    c.fillStyle = INK; c.beginPath(); c.moveTo(gx - 2, gtop + gh); c.lineTo(gx - 2, gtop + gw / 2); c.arc(gx + gw / 2, gtop + gw / 2, gw / 2 + 2, PI, 0); c.lineTo(gx + gw + 2, gtop + gh); c.fill();
    const gg = c.createLinearGradient(0, gtop, 0, gtop + gh); gg.addColorStop(0, rgba(PAL.cyan, 0.9)); gg.addColorStop(1, rgba(PAL.cyanDeep, 0.8)); c.fillStyle = gg;
    c.beginPath(); c.moveTo(gx, gtop + gh); c.lineTo(gx, gtop + gw / 2); c.arc(gx + gw / 2, gtop + gw / 2, gw / 2, PI, 0); c.lineTo(gx + gw, gtop + gh); c.fill();
    c.fillStyle = rgba(INK, 0.55); c.fillRect(gx, gtop + gw / 2, gw, gh - gw / 2); // door shadow inside
    c.fillStyle = rgba(BONE, 0.6); c.fillRect(gx + gw / 2 - 0.5, gtop + 2, 1, gw / 2 - 2);
    c.strokeStyle = BONE; c.globalAlpha = 0.5; c.lineWidth = 1; c.beginPath(); c.moveTo(gx - 1, gtop + gh); c.lineTo(gx - 1, gtop + gw / 2); c.arc(gx + gw / 2, gtop + gw / 2, gw / 2 + 1, PI, 0); c.lineTo(gx + gw + 1, gtop + gh); c.stroke(); c.globalAlpha = 1;
    meta.gates.push({ x: gx + gw / 2, y: cy, w: gw, h: gh });
    c.fillStyle = BONE; c.beginPath(); c.moveTo(gx + gw / 2, gtop - 4); c.lineTo(gx + gw / 2 + 3, gtop - 1); c.lineTo(gx + gw / 2, gtop + 2); c.lineTo(gx + gw / 2 - 3, gtop - 1); c.fill();
    c.fillStyle = rgba(PAL.cyan, 0.7); for (let q = 0; q <= l; q++) c.fillRect(W * 0.1, cy - th * 0.12 + q * 3.2, 3, 2);
    // window slits between gates
    if (l < LANES - 1) { const wy = (cy + gy[l + 1]) / 2; for (const wxm of [0.12, 0.85]) { const lit = rnd() > (state >= 1 ? 0.45 : 0.15) && !(state >= 2 && rnd() < 0.5); c.fillStyle = lit ? rgba([PAL.magenta, PAL.cyan, PAL.bone][(rnd() * 3) | 0], 0.85) : PAL.ink3; c.fillRect(W * wxm - 1.5, wy - th * 0.1, 3, th * 0.2); if (lit) meta.wins.push({ x: W * wxm - 1.5, y: wy - th * 0.1, w: 3, h: th * 0.2, col: PAL.magenta }); } }
  }
  // base nameplate: paw badge between crown and first gate
  // damage
  if (state >= 1) {
    c.strokeStyle = rgba(shade(PAL.ink3, -0.5), 0.95); c.lineWidth = 1.3; c.lineJoin = 'miter';
    const cracks = state * 2 + 1;
    for (let i = 0; i < cracks; i++) { let x = rnd() * W, y = yb + rnd() * (H - yb); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * W * 0.3; y += rnd() * th * 0.3; c.lineTo(x, y); } c.stroke(); }
  }
  if (state >= 2) {
    for (let i = 0; i < 3; i++) { const sx = rnd() * W, sy = yb + rnd() * (H - yb); const sg = c.createRadialGradient(sx, sy, 0, sx, sy, W * 0.5); sg.addColorStop(0, rgba(INK, 0.55)); sg.addColorStop(1, rgba(INK, 0)); c.fillStyle = sg; c.fillRect(sx - W * 0.5, sy - W * 0.5, W, W); }
    c.fillStyle = INK; c.beginPath(); c.moveTo(tx, t0.y); for (let x = tx; x <= tx + tw; x += 4) c.lineTo(x, t0.y + (hsh(x | 0, 7) * 4)); c.lineTo(tx + tw, t0.y - 1); c.lineTo(tx, t0.y - 1); c.closePath(); c.fill();
    c.strokeStyle = rgba(ORG_FIRE, 0.8); c.lineWidth = 1; c.beginPath(); c.moveTo(W * 0.1, yb + th * 0.5); c.lineTo(W * 0.5, yb + th * 0.7); c.stroke();
  }
  if (state >= 3) { c.fillStyle = rgba(INK, 0.35); c.fillRect(0, yb, W, H - yb); c.strokeStyle = rgba(PAL.magenta, 0.7); c.lineWidth = 1.5; c.beginPath(); c.moveTo(W * 0.2, yb); c.lineTo(W * 0.5, yb + th * 1.2); c.lineTo(W * 0.35, yb + th * 2.2); c.stroke(); }
  // bone hot-spot at the highest point
  c.fillStyle = BONE; c.fillRect(tx + 1, t0.y + 1, 2, 1.4);
  return meta;
}
const ORG_FIRE = '#ff7a2e';
function baseFor(L, T, state) {
  return cached('base|' + T.id + '|' + L.key + '|' + state + '|' + dpr(), () => {
    const R = L.baseRect, gy = [];
    for (let l = 0; l < LANES; l++) gy.push(L.laneY(l) - R.y);
    let meta = null;
    const B = bake(R.w, R.h, (c) => { meta = paintBase(c, R.w, R.h, gy, state, T, L.tileH); });
    if (!meta) meta = paintBase(makeNullCtx(), R.w, R.h, gy, state, T, L.tileH);
    B.meta = meta; return B;
  });
}
function drawBase(ctx, L, T, view, t) {
  const R = L.baseRect, b = view && view.battle && view.battle.base;
  const frac01 = b && b.maxHp > 0 ? cl(b.hp / b.maxHp, 0, 1) : 1;
  const state = frac01 > 0.75 ? 0 : frac01 > 0.5 ? 1 : frac01 > 0.25 ? 2 : 3;
  const B = baseFor(L, T, state), M = B.meta;
  // force field behind
  const sx = L.colX(0.5);
  blit(ctx, B, R.x, R.y);
  const fl = cl(fin(view && view.baseFlash), 0, 1);
  // windows flicker and gate breathing
  for (let i = 0; i < M.wins.length; i++) { const w = M.wins[i], f = hsh(floor(t * 1.6 + i * 0.37), i) > 0.12 ? 1 : 0.2; if (f < 1) { ctx.fillStyle = rgba(INK, 0.6); ctx.fillRect(R.x + w.x, R.y + w.y, w.w, w.h); } else if (i % 3 === 0) bloom(ctx, R.x + w.x + w.w / 2, R.y + w.y + w.h / 2, 7 + w.w, w.col, 0.3); }
  for (let i = 0; i < M.gates.length; i++) { const g = M.gates[i]; bloom(ctx, R.x + g.x, R.y + g.y + g.h * 0.1, g.w * 0.9, PAL.cyan, 0.2 + 0.1 * sin(t * 1.7 + i)); }
  if (M.beacon && frac(t * 0.8) < 0.3) bloom(ctx, R.x + M.beacon.x, R.y + M.beacon.y, 9, PAL.magenta, 0.9);
  if (M.crest) { bloom(ctx, R.x + M.crest.x, R.y + M.crest.y, R.w * 0.7, PAL.cyan, 0.14 + 0.06 * sin(t * 2)); }
  // smoke and sparks when hurt
  if (state >= 2) {
    for (let i = 0; i < 6; i++) { const ph = frac(t * 0.3 + i / 6), x = R.x + R.w * (0.3 + 0.4 * hsh(i, 4)) + sin(ph * 5 + i) * 4; ctx.fillStyle = rgba(INK, 0.42 * (1 - ph)); ctx.beginPath(); ctx.arc(x, R.y + L.tileH * 0.5 - ph * L.tileH * 0.9, (3 + ph * 8), 0, TAU); ctx.fill(); }
    bloom(ctx, R.x + R.w * 0.5, R.y + L.tileH * 0.5, R.w * 0.5, ORG_FIRE, 0.18 + 0.1 * sin(t * 9));
  }
  if (state >= 3) { const ph = frac(t * 1.7); if (ph < 0.2) sparkle(ctx, R.x + R.w * (0.2 + 0.6 * hsh(floor(t * 1.7), 3)), R.y + L.tileH * (1 + 3.5 * hsh(floor(t * 1.7), 5)), 7, BONE, 1 - ph * 5); }
  // shield line
  if (frac01 > 0.15) {
    const a = (0.1 + 0.1 * sin(t * 2.4)) * (0.4 + 0.6 * frac01) + fl * 0.6;
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(fl > 0.1 ? PAL.magenta : PAL.cyan, a * pa); ctx.fillRect(sx - 2, L.field.y, 4, L.field.h);
    ctx.fillStyle = rgba(BONE, (0.2 + fl) * pa * frac01); ctx.fillRect(sx - 0.5, L.field.y, 1, L.field.h);
    const sy = L.field.y + frac(t * 0.35) * L.field.h; ctx.fillStyle = rgba(PAL.cyan, 0.35 * pa); ctx.fillRect(sx - 3, sy - 1, 6, 2);
    for (let l = 0; l <= LANES; l++) { const y = L.field.y + l * L.tileH; ctx.fillStyle = rgba(PAL.cyan, 0.4 * pa); ctx.beginPath(); ctx.moveTo(sx, y - 3); ctx.lineTo(sx + 3, y); ctx.lineTo(sx, y + 3); ctx.lineTo(sx - 3, y); ctx.fill(); }
    ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
  }
  if (fl > 0.02) { const pa = ctx.globalAlpha; ctx.globalAlpha = pa * fl * 0.5; ctx.fillStyle = PAL.magenta; ctx.fillRect(R.x, R.y, R.w, R.h); ctx.globalAlpha = pa; }
}

// ------------------------------------------------------------------------------------------------ traps, barricades, ghosts, highlights
export function drawTrap(ctx, L, trap, t) {
  if (!trap) return;
  const x = L.colX(fin(trap.x, 1)), y = L.laneY(fin(trap.y, 0)) + L.tileH * 0.16, r = max(0.4, fin(trap.radius, 0.7)) * L.tileW, s = L.tileW;
  t = fin(t);
  const charges = max(0, fin(trap.charges, 1)), col = trap.side === 'enemy' ? PAL.magenta : PAL.lime;
  const arm = 0.5 + 0.5 * sin(t * 3 + fin(trap.uid) * 1.3);
  ctx.save();
  ctx.strokeStyle = rgba(col, 0.25 + 0.15 * arm); ctx.lineWidth = 1.2; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  bloom(ctx, x, y, s * 0.7, col, 0.18 + 0.12 * arm);
  // pressure plate
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y + 1.5, s * 0.34, s * 0.15, 0, 0, TAU); ctx.fill();
  const pg = ctx.createLinearGradient(x, y - s * 0.12, x, y + s * 0.12); pg.addColorStop(0, shade(PAL.slate, 0.3)); pg.addColorStop(1, shade(PAL.slate, -0.3));
  ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(x, y, s * 0.31, s * 0.12, 0, 0, TAU); ctx.fill();
  // teeth
  ctx.fillStyle = BONE; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.2, tx = x + cos(a) * s * 0.26, ty = y + sin(a) * s * 0.1; ctx.beginPath(); ctx.moveTo(tx - 1.6, ty); ctx.lineTo(tx, ty - s * 0.1 - (i & 1) * 2); ctx.lineTo(tx + 1.6, ty); ctx.fill(); }
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - 1, 2 + arm, 0, TAU); ctx.fill();
  for (let i = 0; i < min(5, charges); i++) { ctx.fillStyle = rgba(col, 0.95); ctx.fillRect(x - (min(5, charges) * 4) / 2 + i * 4 + 0.5, y + s * 0.2, 3, 3); }
  ctx.restore();
}
export function drawBarricade(ctx, L, u, t) {
  if (!u) return;
  const x = L.colX(fin(u.x, 1)), fy = L.footY(fin(u.y, 0)), s = L.tileW, hgt = L.tileH * 0.62, w = s * 0.78;
  t = fin(t);
  const f = u.maxHp > 0 ? cl(fin(u.hp, 1) / u.maxHp, 0, 1) : (u.hp > 0 ? 1 : 0.5);
  const life = fin(u.life, 99);
  ctx.save();
  ctx.fillStyle = rgba(INK, 0.55); ctx.beginPath(); ctx.ellipse(x, fy, w * 0.62, s * 0.12, 0, 0, TAU); ctx.fill();
  const x0 = x - w / 2, y0 = fy - hgt;
  ctx.fillStyle = INK; ctx.fillRect(x0 - 2, y0 - 2, w + 4, hgt + 3);
  const g = ctx.createLinearGradient(x0, y0, x0 + w, fy); g.addColorStop(0, shade(PAL.violetHi, 0.0)); g.addColorStop(0.5, PAL.violet); g.addColorStop(1, shade(PAL.violet, -0.4));
  ctx.fillStyle = g; ctx.fillRect(x0, y0, w, hgt);
  // hazard tape
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0 + hgt * 0.4, w, hgt * 0.22); ctx.clip(); ctx.fillStyle = PAL.magenta; ctx.fillRect(x0, y0 + hgt * 0.4, w, hgt * 0.22); ctx.fillStyle = INK;
  for (let k = -2; k < w / 6 + 2; k++) { ctx.beginPath(); ctx.moveTo(x0 + k * 7, y0 + hgt * 0.62); ctx.lineTo(x0 + k * 7 + 3.5, y0 + hgt * 0.62); ctx.lineTo(x0 + k * 7 + 7.5, y0 + hgt * 0.4); ctx.lineTo(x0 + k * 7 + 4, y0 + hgt * 0.4); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = rgba(PAL.cyan, 0.85); ctx.fillRect(x0, y0, w, 1.4); ctx.fillRect(x0, y0, 1.4, hgt);
  ctx.fillStyle = rgba(PAL.magenta, 0.5); ctx.fillRect(x0, fy - 2, w, 2);
  for (const [px, py] of [[3, 3], [w - 3, 3], [3, hgt - 4], [w - 3, hgt - 4]]) { ctx.fillStyle = BONE; ctx.fillRect(x0 + px - 1, y0 + py - 1, 2, 2); }
  if (f < 0.7) { ctx.strokeStyle = rgba(INK, 0.9); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x0 + w * 0.3, y0); ctx.lineTo(x0 + w * 0.45, y0 + hgt * 0.35); ctx.lineTo(x0 + w * 0.3, y0 + hgt * 0.7); ctx.stroke(); }
  if (f < 0.35) { ctx.beginPath(); ctx.moveTo(x0 + w * 0.7, y0 + hgt * 0.1); ctx.lineTo(x0 + w * 0.55, y0 + hgt * 0.5); ctx.lineTo(x0 + w * 0.75, y0 + hgt * 0.9); ctx.stroke(); }
  bloom(ctx, x, y0 + hgt * 0.5, w * 0.9, PAL.cyan, 0.12 + 0.05 * sin(t * 3));
  if (life < 5) { ctx.globalAlpha *= 0.5 + 0.5 * sin(t * 18); ctx.fillStyle = BONE; ctx.fillRect(x0, y0, w, hgt); }
  ctx.restore();
}
function fillMask(view, mask) {
  mask.fill(0);
  const p = view && view.placeable;
  if (!p) return false;
  if (p === true) { mask.fill(1); return true; }
  if (typeof p === 'function') { for (let l = 0; l < LANES; l++) for (let c = 1; c <= COLS; c++) if (p(c, l)) mask[l * COLS + c - 1] = 1; return true; }
  if (Array.isArray(p) || (p && typeof p.length === 'number')) {
    if (p.length > 0 && (typeof p[0] === 'number' || typeof p[0] === 'boolean') && !Array.isArray(p[0])) { for (let i = 0; i < min(40, p.length); i++) if (p[i]) mask[i] = 1; }
    else for (const e of p) { const c = e && (e.col !== undefined ? e.col : e[0]), l = e && (e.lane !== undefined ? e.lane : e[1]); if (c >= 1 && c <= COLS && l >= 0 && l < LANES) mask[l * COLS + c - 1] = 1; }
    return true;
  }
  if (p instanceof Set) { for (const k of p) { const c = k.col !== undefined ? k.col : k[0], l = k.lane !== undefined ? k.lane : k[1]; if (c >= 1 && c <= COLS && l >= 0 && l < LANES) mask[l * COLS + c - 1] = 1; } return true; }
  return false;
}
const MASK = new Uint8Array(LANES * COLS);
function brackets(ctx, x, y, w, h, len, col, a, lw) {
  ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; ctx.lineCap = 'square'; ctx.beginPath();
  ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
  ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
  ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len); ctx.stroke();
}
export function drawPlacementGhost(ctx, L, g, t) {
  if (!g) return;
  t = fin(t);
  const col = g.valid === false ? PAL.magenta : PAL.cyan;
  const tl = L.tile(fin(g.col, 1), fin(g.lane, 0)), pulse = 0.5 + 0.5 * sin(t * 6);
  ctx.save();
  if (g.kind === 'trap' || g.kind === 'spell') {
    const r = max(0.5, fin(g.radius, 1)) * L.tileW;
    ctx.fillStyle = rgba(col, 0.1 + 0.05 * pulse); ctx.beginPath(); ctx.ellipse(tl.cx, tl.cy + L.tileH * 0.1, r, r * 0.55, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 14; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  ctx.fillStyle = rgba(col, 0.16 + 0.1 * pulse); ctx.fillRect(tl.x + 1, tl.y + 1, tl.w - 2, tl.h - 2);
  brackets(ctx, tl.x + 2, tl.y + 2, tl.w - 4, tl.h - 4, min(tl.w, tl.h) * 0.26, col, 0.95, 2);
  // beam down onto the tile
  const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
  const bg = ctx.createLinearGradient(0, tl.y - tl.h * 1.1, 0, tl.y + tl.h * 0.8); bg.addColorStop(0, rgba(col, 0)); bg.addColorStop(1, rgba(col, 0.28));
  ctx.fillStyle = bg; ctx.fillRect(tl.x + tl.w * 0.18, tl.y - tl.h * 1.1, tl.w * 0.64, tl.h * 1.9);
  ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
  if (g.valid === false) { ctx.strokeStyle = rgba(PAL.magenta, 0.9); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(tl.cx - tl.w * 0.2, tl.cy - tl.w * 0.2); ctx.lineTo(tl.cx + tl.w * 0.2, tl.cy + tl.w * 0.2); ctx.moveTo(tl.cx + tl.w * 0.2, tl.cy - tl.w * 0.2); ctx.lineTo(tl.cx - tl.w * 0.2, tl.cy + tl.w * 0.2); ctx.stroke(); }
  ctx.restore();
}
function drawHighlights(ctx, L, view, t) {
  const any = fillMask(view, MASK);
  const hov = view && view.hoverTile;
  if (any) {
    const pulse = 0.5 + 0.5 * sin(t * 4);
    for (let l = 0; l < LANES; l++) for (let c = 1; c <= COLS; c++) if (MASK[l * COLS + c - 1]) {
      const tl = L.tile(c, l);
      ctx.fillStyle = rgba(PAL.lime, 0.05 + 0.05 * pulse); ctx.fillRect(tl.x + 1, tl.y + 1, tl.w - 2, tl.h - 2);
      ctx.strokeStyle = rgba(PAL.lime, 0.18 + 0.2 * pulse); ctx.lineWidth = 1; ctx.strokeRect(tl.x + 2.5, tl.y + 2.5, tl.w - 5, tl.h - 5);
      ctx.fillStyle = rgba(PAL.lime, 0.5 + 0.4 * pulse); ctx.fillRect(tl.cx - 1.2, tl.cy - 1.2, 2.4, 2.4);
    }
  }
  if (hov && hov.col >= 1 && hov.col <= COLS && hov.lane >= 0 && hov.lane < LANES) {
    const ok = any ? !!MASK[hov.lane * COLS + hov.col - 1] : true, col = ok ? PAL.cyan : PAL.magenta, tl = L.tile(hov.col, hov.lane), p = 0.5 + 0.5 * sin(t * 7);
    ctx.fillStyle = rgba(col, 0.14 + 0.08 * p); ctx.fillRect(tl.x, tl.y, tl.w, tl.h);
    brackets(ctx, tl.x + 1.5, tl.y + 1.5, tl.w - 3, tl.h - 3, min(tl.w, tl.h) * 0.3, col, 0.95, 2.2);
    bloom(ctx, tl.cx, tl.cy, max(tl.w, tl.h) * 0.8, col, 0.25 + 0.1 * p);
  }
}

// ------------------------------------------------------------------------------------------------ weather and foreground
function weather(ctx, L, T, t, front) {
  const kind = T.def.weather, w = L.w, f = L.field;
  const pa = ctx.globalAlpha;
  ctx.save();
  if (kind === 'rain') {
    ctx.strokeStyle = rgba(PAL.magenta, 0.22 * pa); ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 46; i++) { const ph = frac(t * (1.3 + hsh(i, 1) * 0.5) + hsh(i, 2)), x = hsh(i, 3) * (w + 60) - 30 + ph * 40, y = ph * (L.h * 0.9); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14); }
    ctx.stroke();
  } else if (kind === 'wind') {
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) { const sp = 90 + hsh(i, 1) * 90, x = w + 40 - ((t * sp + hsh(i, 2) * (w + 200)) % (w + 200)), y = f.y - f.h * 0.15 + hsh(i, 3) * (f.h * 1.2), len = 24 + hsh(i, 4) * 40; ctx.strokeStyle = rgba(PAL.cyan, (0.1 + 0.12 * hsh(i, 5)) * pa); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len * 0.5, y - 3, x + len, y); ctx.stroke(); }
  } else if (kind === 'spores') {
    for (let i = 0; i < 28; i++) { const ph = frac(t * (0.08 + hsh(i, 1) * 0.07) + hsh(i, 2)), x = hsh(i, 3) * w + sin(t + i) * 8, y = f.y + f.h - ph * (f.h + 40) + 20, a = sin(ph * PI); ctx.fillStyle = rgba(PAL.lime, 0.35 * a * pa); ctx.beginPath(); ctx.arc(x, y, 1 + hsh(i, 4) * 2, 0, TAU); ctx.fill(); }
  } else if (kind === 'confetti') {
    for (let i = 0; i < 26; i++) { const ph = frac(t * (0.2 + hsh(i, 1) * 0.15) + hsh(i, 2)), x = hsh(i, 3) * w + sin(t * 2 + i) * 10, y = ph * (f.y + f.h), col = [PAL.magenta, PAL.cyan, PAL.lime, PAL.bone][i & 3]; ctx.fillStyle = rgba(col, 0.55 * pa); ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i); ctx.fillRect(-2, -1, 4, 2); ctx.restore(); }
  } else if (kind === 'embers') {
    for (let i = 0; i < 30; i++) { const ph = frac(t * (0.12 + hsh(i, 1) * 0.1) + hsh(i, 2)), x = hsh(i, 3) * w + sin(t * 0.8 + i) * 14, y = f.y + f.h - ph * (f.h + 60) + 30, a = sin(ph * PI); sparkleDot(ctx, x, y, 1.2 + hsh(i, 4) * 1.4, i & 1 ? PAL.cyan : PAL.magenta, 0.7 * a * pa); }
  } else if (kind === 'bubbles') {
    for (let i = 0; i < 22; i++) { const ph = frac(t * (0.07 + hsh(i, 1) * 0.06) + hsh(i, 2)), x = hsh(i, 3) * w + sin(t * 0.9 + i * 2) * 10, y = f.y + f.h + 20 - ph * (f.h + 80), r = 2 + hsh(i, 4) * 5, a = sin(ph * PI); ctx.strokeStyle = rgba(PAL.bone, 0.45 * a * pa); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.fillStyle = rgba(PAL.bone, 0.5 * a * pa); ctx.fillRect(x - r * 0.4, y - r * 0.5, 1.4, 1.4); }
  }
  ctx.restore();
  void front;
}
function sparkleDot(ctx, x, y, r, col, a) { const po = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(col, a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = po; }

// ------------------------------------------------------------------------------------------------ public draw
export function prewarmWorld(L, districtId) {
  const T = districtTheme(districtId);
  cityFor(L.w, L.cityBase, T); frontFor(L, T); for (let s = 0; s < 4; s++) baseFor(L, T, s);
}
export function drawWorld(ctx, L, view, t) {
  if (!L) return;
  t = fin(t); view = view || {};
  const T = districtTheme(view.districtId || (view.battle && view.battle.district) || 'rooftop_row');
  ctx.fillStyle = PAL.void; ctx.fillRect(0, 0, L.w, L.h);
  drawCity(ctx, L.w, t, T, L.cityBase, L.topBar.y + L.topBar.h);
  blit(ctx, frontFor(L, T), 0, L.frontY);
  // animated light running along the lane seams
  const f = L.field, pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (let l = 0; l <= LANES; l++) {
    const y = f.y + l * L.tileH, ph = frac(t * 0.22 + l * 0.173), x = L.colX(0.5) + ph * (L.colX(10.4) - L.colX(0.5));
    ctx.fillStyle = rgba(T.accent, 0.5 * pa); ctx.fillRect(x - 24, y - 0.8, 48, 1.6);
    ctx.fillStyle = rgba(BONE, 0.5 * pa); ctx.fillRect(x - 6, y - 0.8, 12, 1.6);
  }
  // spawn vents glow
  for (let l = 0; l < LANES; l++) { const fl = 0.6 + 0.4 * sin(t * 3 + l * 1.7) * (hsh(floor(t * 4), l) > 0.2 ? 1 : 0.4); const cx = L.colX(9.8), cy = L.laneY(l); ctx.fillStyle = rgba(PAL.magenta, 0.2 * fl * pa); ctx.beginPath(); ctx.ellipse(cx, cy + L.tileH * 0.2, L.tileW * 0.55, L.tileH * 0.2, 0, 0, TAU); ctx.fill(); }
  // sweeping highlight over the roof
  const sw = frac(t * 0.09), bx = f.x + sw * (f.w + 200) - 100;
  ctx.save(); ctx.beginPath(); ctx.rect(f.x, f.y, f.w, f.h); ctx.clip();
  ctx.fillStyle = rgba(BONE, 0.035 * pa); ctx.beginPath(); ctx.moveTo(bx, f.y); ctx.lineTo(bx + 60, f.y); ctx.lineTo(bx + 60 - f.h * 0.4, f.y + f.h); ctx.lineTo(bx - f.h * 0.4, f.y + f.h); ctx.fill();
  ctx.restore();
  ctx.globalCompositeOperation = po; ctx.globalAlpha = pa;
  drawBase(ctx, L, T, view, t);
  // battle objects: traps, barricades
  const b = view.battle;
  if (b) {
    const traps = b.fx && b.fx.traps;
    if (traps) for (let i = 0; i < traps.length; i++) { const tr = traps[i]; if (tr && !tr.dead && (tr.charges === undefined || tr.charges > 0)) drawTrap(ctx, L, tr, t); }
    const us = b.units;
    if (us) for (let i = 0; i < us.length; i++) { const u = us[i]; if (u && u.kind === 'barricade' && !u.dead) drawBarricade(ctx, L, u, t); }
  }
  drawHighlights(ctx, L, view, t);
  if (view.ghost) drawPlacementGhost(ctx, L, view.ghost, t);
  weather(ctx, L, T, t, false);
  vignette(ctx, L.w, L.h, 0.9);
  scanlines(ctx, L.w, L.h);
}
export function drawWorldFront(ctx, L, view, t) {
  if (!L) return;
  t = fin(t); view = view || {};
  const T = districtTheme(view.districtId || (view.battle && view.battle.district) || 'rooftop_row');
  const f = L.field, pa = ctx.globalAlpha;
  // low foreground mist along the front lip
  const g = ctx.createLinearGradient(0, f.y + f.h - 30, 0, f.y + f.h + 16); g.addColorStop(0, rgba(T.accent, 0)); g.addColorStop(1, rgba(T.accent, 0.1));
  ctx.fillStyle = g; ctx.fillRect(f.x, f.y + f.h - 30, f.w, 46);
  ctx.globalAlpha = pa * 0.6; weather(ctx, L, T, t + 3.1, true); ctx.globalAlpha = pa;
}
export function drawSkyline(ctx, w, h, t, districtId, o) {
  o = o || {};
  w = fin(w, 390); h = fin(h, 800); t = fin(t);
  const T = districtTheme(districtId || 'rooftop_row');
  const baseY = fin(o.baseY, h * 0.78), topY = fin(o.topY, 0);
  ctx.fillStyle = PAL.void; ctx.fillRect(0, 0, w, h);
  drawCity(ctx, w, t, T, baseY, topY);
  // ground below the skyline foot
  const g = ctx.createLinearGradient(0, baseY, 0, h); g.addColorStop(0, PAL.ink2); g.addColorStop(1, PAL.void);
  ctx.fillStyle = g; ctx.fillRect(0, baseY - 1, w, h - baseY + 1);
  ctx.fillStyle = rgba(T.accent, 0.5); ctx.fillRect(0, baseY - 1, w, 1.4);
  if (o.vignette !== false) vignette(ctx, w, h, 0.9);
}

// ------------------------------------------------------------------------------------------------ town
function paintTerrace(c, w, hgt, T, cell) {
  const rnd = mk(T.seed ^ 0x7e44);
  const g = c.createLinearGradient(0, 0, 0, hgt); g.addColorStop(0, mix(PAL.ink3, T.accent, 0.08)); g.addColorStop(0.3, PAL.ink2); g.addColorStop(1, PAL.void);
  c.fillStyle = g; c.fillRect(0, 0, w, hgt);
  // parapet wall at the back
  c.fillStyle = INK; c.fillRect(0, 0, w, 16);
  c.fillStyle = mix(PAL.ink3, PAL.violetHi, 0.2); c.fillRect(0, 2, w, 11);
  c.fillStyle = rgba(PAL.cyan, 0.7); c.fillRect(0, 2, w, 1.4); c.fillStyle = rgba(PAL.magenta, 0.4); c.fillRect(0, 12, w, 1.4);
  for (let x = 6; x < w; x += 24) { c.fillStyle = INK; c.fillRect(x, 4, 2, 7); }
  // deck planks, perspective-ish: horizontal boards
  c.save(); c.beginPath(); c.rect(0, 16, w, hgt - 16); c.clip();
  for (let y = 16, i = 0; y < hgt; y += 11 + i * 0.35, i++) {
    c.fillStyle = rgba(INK, 0.4); c.fillRect(0, y, w, 1.2);
    c.fillStyle = rgba(BONE, 0.025 + 0.01 * (i & 1)); c.fillRect(0, y + 1.2, w, 8);
    for (let x = rnd() * 60; x < w; x += 60 + rnd() * 100) { c.fillStyle = rgba(INK, 0.4); c.fillRect(x, y, 1.2, 11 + i * 0.35); }
  }
  c.restore();
  // plot pads: grid of glowing squares drawn by layout (static dim guide)
  c.strokeStyle = rgba(T.accent, 0.09); c.lineWidth = 1;
}
export function drawTownBackdrop(ctx, w, h, t, o) {
  o = o || {};
  w = fin(w, 390); h = fin(h, 800); t = fin(t);
  const T = districtTheme(o.districtId || 'rooftop_row');
  const L = o.layout || layoutFor(w, h, 'town'), tr = L.town.rect;
  const baseY = tr.y + 8;
  ctx.fillStyle = PAL.void; ctx.fillRect(0, 0, w, h);
  drawCity(ctx, w, t, T, baseY, L.topBar.y + L.topBar.h);
  // distant cats sitting on roofs
  for (let i = 0; i < 3; i++) {
    const x = ((hsh(i, 21) * w + 40 + i * 120) % (w - 40)) + 20, y = baseY - 6 - i * 3, s = 5 + i;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y - s, s * 0.8, s, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x, y - s * 2.1, s * 0.62, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - s * 0.55, y - s * 2.4); ctx.lineTo(x - s * 0.45, y - s * 3.3); ctx.lineTo(x - s * 0.05, y - s * 2.65); ctx.moveTo(x + s * 0.55, y - s * 2.4); ctx.lineTo(x + s * 0.45, y - s * 3.3); ctx.lineTo(x + s * 0.05, y - s * 2.65); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + s * 0.7, y - 1); ctx.quadraticCurveTo(x + s * 2, y - s * 0.4 + sin(t * 2 + i) * s * 0.6, x + s * 1.4, y - s * 2.2 + sin(t * 2 + i) * s); ctx.stroke();
    const blink = hsh(floor(t * 0.5), i + 40) > 0.4; if (blink) { ctx.fillStyle = PAL.lime; ctx.fillRect(x - s * 0.3, y - s * 2.2, 1.2, 1.2); ctx.fillRect(x + s * 0.2, y - s * 2.2, 1.2, 1.2); }
  }
  const B = cached('terrace|' + T.id + '|' + w + 'x' + Math.round(tr.h) + '|' + dpr(), () => bake(w, tr.h + (h - tr.y - tr.h), (c) => paintTerrace(c, w, tr.h + (h - tr.y - tr.h), T, L.town.cell)));
  blit(ctx, B, 0, tr.y);
  // string lights
  const n = max(6, Math.round(w / 52)), sag = 14;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-4, tr.y + 6); for (let i = 0; i <= n; i++) { const x = i / n * (w + 8) - 4; const y = tr.y + 6 + sin(i / n * PI) * sag; ctx.lineTo(x, y); } ctx.stroke();
  for (let i = 1; i < n * 2; i++) {
    const u = i / (n * 2), x = u * w, y = tr.y + 6 + sin(u * PI) * sag * 1.0 + (i & 1) * 3 + sin(t * 1.2 + i) * 0.8;
    const col = [PAL.cyan, PAL.magenta, PAL.bone, PAL.lime][i & 3], fl = hsh(floor(t * 1.5 + i), i) > 0.08 ? 1 : 0.3;
    bloom(ctx, x, y + 3, 10, col, 0.5 * fl); ctx.fillStyle = rgba(col, fl); ctx.beginPath(); ctx.ellipse(x, y + 3, 1.7, 2.4, 0, 0, TAU); ctx.fill();
  }
  // ambient steam from the roof
  for (let i = 0; i < 2; i++) plume(ctx, w * (0.2 + i * 0.55), tr.y + 14, t + i * 2.3, T, 0.9);
  weather(ctx, L, T, t, false);
  vignette(ctx, w, h, 0.9);
  scanlines(ctx, w, h);
}
export function drawPlot(ctx, r, st, t) {
  if (!r) return;
  st = st || {}; t = fin(t);
  const x = fin(r.x), y = fin(r.y), w = fin(r.w, 60), h = fin(r.h, 60), cx = x + w / 2;
  const sel = !!st.selected, hov = !!st.hover, locked = !!st.locked;
  const pulse = 0.5 + 0.5 * sin(t * 3);
  const col = locked ? PAL.slate : sel ? PAL.cyan : st.ready ? PAL.lime : PAL.violetHi;
  // pad
  ctx.save();
  const k = min(8, w * 0.12);
  const pad = () => { ctx.beginPath(); ctx.moveTo(x + k, y + h * 0.3); ctx.lineTo(x + w - k, y + h * 0.3); ctx.lineTo(x + w, y + h * 0.3 + k); ctx.lineTo(x + w, y + h - k); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x + k, y + h); ctx.lineTo(x, y + h - k); ctx.lineTo(x, y + h * 0.3 + k); ctx.closePath(); };
  pad(); ctx.fillStyle = INK; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fill();
  pad(); const g = ctx.createLinearGradient(x, y + h * 0.3, x, y + h); g.addColorStop(0, locked ? PAL.ink2 : PAL.ink3); g.addColorStop(1, PAL.ink2); ctx.fillStyle = g; ctx.fill();
  ctx.save(); pad(); ctx.clip();
  ctx.strokeStyle = rgba(col, 0.1); ctx.lineWidth = 1; ctx.beginPath(); for (let i = 1; i < 4; i++) { ctx.moveTo(x + w * i / 4, y + h * 0.3); ctx.lineTo(x + w * i / 4, y + h); } for (let i = 1; i < 3; i++) { ctx.moveTo(x, y + h * (0.3 + 0.7 * i / 3)); ctx.lineTo(x + w, y + h * (0.3 + 0.7 * i / 3)); } ctx.stroke();
  ctx.restore();
  pad(); ctx.strokeStyle = rgba(col, sel ? 0.95 : 0.55 + (hov ? 0.3 : 0)); ctx.lineWidth = sel ? 2.4 : 1.4; ctx.stroke();
  ctx.fillStyle = rgba(BONE, 0.12); ctx.fillRect(x + k, y + h * 0.3 + 1, w - 2 * k, 1);
  for (const [px, py] of [[x + 5, y + h * 0.3 + 6], [x + w - 5, y + h * 0.3 + 6], [x + 5, y + h - 5], [x + w - 5, y + h - 5]]) { ctx.fillStyle = rgba(col, 0.8); ctx.fillRect(px - 1, py - 1, 2, 2); }
  ctx.restore();
  if (locked) {
    ctx.save(); ctx.strokeStyle = rgba(PAL.slate, 0.9); ctx.lineWidth = 2; const ly = y + h * 0.65; ctx.strokeRect(cx - w * 0.1, ly - 2, w * 0.2, w * 0.17); ctx.beginPath(); ctx.arc(cx, ly - 2, w * 0.07, PI, 0); ctx.stroke(); ctx.restore();
    return;
  }
  if (st.b) {
    const s = min(w * 1.12, h * 1.1);
    bloom(ctx, cx, y + h * 0.78, s * 0.5, sel ? PAL.cyan : col, 0.12 + 0.08 * pulse);
    drawBuilding(ctx, st.b, fin(st.level, 1), cx, y + h * 0.62, s, t);
    // level pips
    const lv = max(1, floor(fin(st.level, 1))), tier = min(6, floor((lv - 1) / 20)) + 1;
    for (let i = 0; i < tier; i++) { const px = cx - (tier - 1) * 4 + i * 8, py = y + h - 4; ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 3.6, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 3.6, py); ctx.fill(); ctx.fillStyle = [PAL.boneDim, PAL.cyan, PAL.magenta, PAL.lime, PAL.violetHi, PAL.bone, PAL.bone][i]; ctx.beginPath(); ctx.moveTo(px, py - 3); ctx.lineTo(px + 2.6, py); ctx.lineTo(px, py + 3); ctx.lineTo(px - 2.6, py); ctx.fill(); }
  } else {
    // empty plot: plus sign
    ctx.save(); ctx.strokeStyle = rgba(col, 0.55 + 0.3 * pulse); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; const py = y + h * 0.62, q = w * 0.14; ctx.beginPath(); ctx.moveTo(cx - q, py); ctx.lineTo(cx + q, py); ctx.moveTo(cx, py - q); ctx.lineTo(cx, py + q); ctx.stroke(); ctx.restore();
  }
  if (st.ready) { // collectable: bobbing lime arrow badge
    const bob = sin(t * 5) * 2, bx = x + w - 10, by = y + 10 + bob;
    bloom(ctx, bx, by, 14, PAL.lime, 0.6);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx, by, 8, 0, TAU); ctx.fill(); ctx.fillStyle = PAL.lime; ctx.beginPath(); ctx.arc(bx, by, 6.4, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(bx, by + 3.4); ctx.lineTo(bx - 3.4, by - 0.6); ctx.lineTo(bx - 1.2, by - 0.6); ctx.lineTo(bx - 1.2, by - 3.4); ctx.lineTo(bx + 1.2, by - 3.4); ctx.lineTo(bx + 1.2, by - 0.6); ctx.lineTo(bx + 3.4, by - 0.6); ctx.fill();
  }
  if (sel || hov) brackets(ctx, x - 2, y + h * 0.3 - 2, w + 4, h * 0.7 + 4, min(w, h) * 0.2, PAL.cyan, sel ? 1 : 0.6, 2);
}
