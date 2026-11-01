// Whiskerton Walk: the cached background strips. Every strip is a PURE function of (layer, index, env) where env carries the
// seed, the world layout (districts, zone x), the kingdom level band, the season and the quality. Nothing here reads a clock or
// Math.random, so a strip that was freed (width = height = 0) rebuilds pixel for pixel identical.
//
//   const strips = createStrips(makeEnv(layout, { level, season, gfx }));
//   strips.beginFrame(); const c = strips.get('play', 3);   // canvas or null (queued)
//   strips.pump(3);                                          // build for at most ~3 ms; a strip is built in small generator steps
//   strips.sweep();                                          // free every strip that was not asked for this frame
//
// Only the DAY palette is baked. Night is a tint, stars and a moon drawn by kingdom_world.js, so there is never a second bake.
// Not thread safe (main thread only, like every canvas helper in this game).
import { THEMES } from './cats.js';
import { TAU, mulberry, hash, mix, shade } from './art_util.js';
import { drawProp, PROP_BOX } from './kingdom_scene.js';

export const VIEW_W = 960, VIEW_H = 540;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
// f = parallax factor, top = layer y of the canvas top relative to groundY, h = layer px height
export const LAYERS = {
  sky: { w: 480, h: 270 },
  far: { f: 0.10, res: 0.5, top: -330, h: 240 },
  hills: { f: 0.30, res: 0.5, top: -200, h: 230 },
  mid: { f: 0.60, tile: 480, scale: 0.75, top: -250, h: 300 },
  play: { f: 1, tile: 512, top: -180, h: 330 },
};
export const factorOf = (layer, reduced) => { const f = LAYERS[layer].f; return reduced ? 0.85 + 0.15 * f : f; };
export const playScale = (gfx) => (gfx >= 3 ? 1.25 : gfx <= 0 ? 0.75 : 1);
export const levelBand = (lv) => (lv >= 34 ? 4 : lv >= 22 ? 3 : lv >= 12 ? 2 : lv >= 5 ? 1 : 0);
// layer x of a parallax layer back to the world x that is in the middle of the screen when that layer x is
export const layerToWorld = (L, f) => VIEW_W / 2 + (L - VIEW_W / 2) / f;
export const singleWidth = (layer, worldW, reduced) => Math.ceil(VIEW_W + factorOf(layer, reduced) * Math.max(0, worldW - VIEW_W)) + 2;
export function tileCount(layer, worldW, reduced) { return Math.ceil(singleWidth(layer, worldW, reduced) / LAYERS[layer].tile); }
// first and last tile index that a camera at camX shows (not clamped to the layer width, see tileCount)
export function tileRange(layer, camX, reduced) {
  const T = LAYERS[layer].tile, l0 = factorOf(layer, reduced) * camX;
  return [Math.floor(l0 / T), Math.floor((l0 + VIEW_W - 1) / T)];
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------------------------------------------------------------- env
function themeIndex(d, i) {
  const t = d && d.themeId;
  if (Number.isInteger(t)) return clamp(t, 0, THEMES.length - 1);
  if (typeof t === 'string') {
    if (/^\d+$/.test(t)) return clamp(+t, 0, THEMES.length - 1);
    const k = THEMES.findIndex((x) => x.name.toLowerCase() === t.toLowerCase() || x.name.toLowerCase().split(' ').join('_') === t.toLowerCase());
    if (k >= 0) return k;
  }
  return i % THEMES.length;
}
export function makeEnv(layout, o = {}) {
  const W = layout.width || 3600;
  const ds = (layout.districts && layout.districts.length ? layout.districts : [{ x0: 0, x1: W, themeId: 0 }]).map((d, i) => ({ x0: d.x0, x1: d.x1, theme: themeIndex(d, i) }));
  const zones = (layout.zones || []).map((z) => ({ type: z.type, id: z.id, x: z.x, w: z.w || 0 }));
  return { seed: o.seed == null ? 0x57ac : o.seed, W, groundY: layout.groundY || 430, districts: ds, zones, level: o.level | 0, season: clamp(o.season | 0, 0, 3), gfx: o.gfx == null ? 3 : o.gfx, reduced: !!o.reduced };
}
export const withEnv = (env, patch) => ({ ...env, ...patch });

// ---------------------------------------------------------------- colours by district and season
const FADE = 130;
const sm = (u) => u * u * (3 - 2 * u);
function colorAt(env, x, get) {
  const ds = env.districts;
  let i = ds.length - 1;
  for (let j = 0; j < ds.length; j++) if (x < ds[j].x1) { i = j; break; }
  const a = get(THEMES[ds[i].theme]);
  const d = ds[i];
  if (i > 0 && x < d.x0 + FADE) return mix(a, get(THEMES[ds[i - 1].theme]), 0.5 * (1 - sm(clamp((x - d.x0) / FADE, 0, 1))));
  if (i < ds.length - 1 && x > d.x1 - FADE) return mix(a, get(THEMES[ds[i + 1].theme]), 0.5 * (1 - sm(clamp((d.x1 - x) / FADE, 0, 1))));
  return a;
}
export function districtAt(env, x) {
  const ds = env.districts;
  for (let j = 0; j < ds.length; j++) if (x < ds[j].x1) return j;
  return ds.length - 1;
}
const TONE = {
  grass: [['#a8e87a', 0.2], ['#4fc04a', 0.14], ['#d98a2e', 0.5], ['#f2f8ff', 0.72]],
  road: [['#c9a070', 0.1], ['#b08850', 0.1], ['#8a5a30', 0.2], ['#dfe8f4', 0.38]],
  tree: [['#f6a8c8', 0.28], ['#2f9a46', 0.12], ['#e07a2a', 0.6], ['#dfe9f5', 0.62]],
  far: [['#f4c6dc', 0.2], ['#9ccfe8', 0.12], ['#e8b080', 0.3], ['#f4f8ff', 0.5]],
};
const tone = (c, kind, season) => mix(c, TONE[kind][season][0], TONE[kind][season][1]);
function hGrad(g, x0, x1, fn, step = 40) {
  const gr = g.createLinearGradient(x0, 0, x1, 0), n = Math.max(1, Math.ceil((x1 - x0) / step));
  for (let i = 0; i <= n; i++) gr.addColorStop(i / n, fn(x0 + ((x1 - x0) * i) / n));
  return gr;
}
function mk(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round';
  return { c, g };
}
const nearZone = (env, x, dist, types) => env.zones.some((z) => types.includes(z.type) && Math.abs(z.x - x) < dist + z.w * 0.3);

// ---------------------------------------------------------------- lamps (shared with the world, which lights them at dusk)
const LAMP_S = 1.5;
const lampMemo = new WeakMap();
export function lampPoints(env) {
  let out = lampMemo.get(env);
  if (out) return out;
  out = [];
  const band = levelBand(env.level);
  env.districts.forEach((d, i) => {
    if (band < (i === 0 ? 1 : i < 3 ? 2 : 3)) return;
    for (let x = d.x0 + 110; x < d.x1 - 40; x += 270) if (!nearZone(env, x, 60, ['gate', 'lift', 'statue'])) out.push({ x, y: env.groundY - 6, d: i });
  });
  lampMemo.set(env, out);
  return out;
}
export const LAMP_TOP = 44 * LAMP_S;   // lantern head above the lamp foot

// ---------------------------------------------------------------- sky, far mountains, hills
const SKY_TINT = [['#ffd6ea', 0.1], ['#2fa0ff', 0.08], ['#ffb878', 0.16], ['#dfe8f6', 0.3]];
function* skyGen(env) {
  const { c, g } = mk(LAYERS.sky.w, LAYERS.sky.h), [tc, ta] = SKY_TINT[env.season];
  const gr = g.createLinearGradient(0, 0, 0, 270);
  ['#4fb0f2', '#a6dffd', '#e3f6ff', '#fff0cc'].forEach((col, i) => gr.addColorStop([0, 0.45, 0.8, 1][i], mix(col, tc, ta)));
  g.fillStyle = gr; g.fillRect(0, 0, LAYERS.sky.w, LAYERS.sky.h);
  return c;
}
function* farGen(env) {
  const L = LAYERS.far, f = factorOf('far', env.reduced), res = L.res, w = singleWidth('far', env.W, env.reduced), h = L.h;
  const { c, g } = mk(w * res, h * res); g.scale(res, res);
  const r = mulberry(env.seed ^ 0x1f), ph = [r() * 6, r() * 6, r() * 6];
  const top = (x) => h - 36 - (Math.abs(Math.sin(x / 190 + ph[0])) * 96 + Math.abs(Math.sin(x / 83 + ph[1])) * 42 + Math.sin(x / 37 + ph[2]) * 7);
  g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w + 12; x += 12) g.lineTo(x, top(x));
  g.lineTo(w, h); g.closePath();
  g.fillStyle = hGrad(g, 0, w, (x) => tone(colorAt(env, layerToWorld(x, f), (t) => t.far), 'far', env.season), 60); g.fill();
  // snow caps on the high peaks
  if (env.season !== 3) {
    g.fillStyle = 'rgba(255,255,255,.78)';
    for (let x = 12; x < w; x += 12) {
      const y = top(x);
      if (y < h - 108 && y < top(x - 12) && y <= top(x + 12)) { g.beginPath(); g.moveTo(x - 17, y + 15); g.lineTo(x, y); g.lineTo(x + 17, y + 15); g.lineTo(x + 7, y + 11); g.lineTo(x, y + 17); g.lineTo(x - 7, y + 11); g.closePath(); g.fill(); }
    }
  }
  g.globalCompositeOperation = 'source-atop';
  const hz = g.createLinearGradient(0, h - 140, 0, h); hz.addColorStop(0, 'rgba(230,244,255,0)'); hz.addColorStop(1, 'rgba(230,244,255,.7)');
  g.fillStyle = hz; g.fillRect(0, 0, w, h);
  return c;
}
function* hillsGen(env) {
  const L = LAYERS.hills, f = factorOf('hills', env.reduced), res = L.res, w = singleWidth('hills', env.W, env.reduced), h = L.h;
  const { c, g } = mk(w * res, h * res); g.scale(res, res);
  const r = mulberry(env.seed ^ 0x2b), ph = [r() * 6, r() * 6];
  const ridge = (x, base, amp, k) => base + Math.sin(x / (110 * k) + ph[0]) * amp + Math.sin(x / (41 * k) + ph[1]) * amp * 0.3;
  const pass = (base, amp, k, getCol, hazeMix) => {
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w + 10; x += 10) g.lineTo(x, ridge(x, base, amp, k));
    g.lineTo(w, h); g.closePath();
    g.fillStyle = hGrad(g, 0, w, (x) => mix(tone(colorAt(env, layerToWorld(x, f), getCol), 'tree', env.season), '#e6f4ff', hazeMix), 60); g.fill();
  };
  pass(h * 0.42, 22, 1.4, (t) => t.far, 0.4);
  yield;
  pass(h * 0.6, 16, 1, (t) => t.mid, 0.2);
  // little tree dots along the near ridge
  for (let x = 6; x < w; x += 20) {
    if (r() < 0.35) continue;
    const y = ridge(x, h * 0.6, 16, 1), rad = 4 + r() * 4;
    g.fillStyle = shade(mix(tone(colorAt(env, layerToWorld(x, f), (t) => t.mid), 'tree', env.season), '#e6f4ff', 0.12), (r() - 0.5) * 0.3);
    g.beginPath(); g.arc(x, y - 1, rad, 0, TAU); g.fill();
  }
  return c;
}

// ---------------------------------------------------------------- mid layer tile: a hazy tree line with cottages
function* midGen(env, idx) {
  const L = LAYERS.mid, T = L.tile, s = L.scale, f = factorOf('mid', env.reduced), band = levelBand(env.level), season = env.season;
  const { c, g } = mk(T * s, L.h * s);
  const yTop = env.groundY + L.top, base = env.groundY - 30;
  g.scale(s, s); g.translate(-idx * T, -yTop);
  const x0 = idx * T - 60, x1 = (idx + 1) * T + 60;
  const midCol = (x) => tone(colorAt(env, layerToWorld(x, f), (t) => t.mid), 'tree', season);
  g.beginPath(); g.moveTo(x0, yTop + L.h);
  for (let x = x0; x <= x1; x += 12) g.lineTo(x, base - 6 + Math.sin(x / 60 + 2) * 6);
  g.lineTo(x1, yTop + L.h); g.closePath();
  g.fillStyle = hGrad(g, x0, x1, (x) => shade(midCol(x), -0.1), 60); g.fill();
  yield;
  for (let sl = Math.floor(x0 / 36); sl * 36 < x1; sl++) {
    const r = mulberry(hash(env.seed + 'm' + sl)), x = sl * 36 + r() * 24, col = mix(shade(midCol(x), (r() - 0.5) * 0.3), '#dcecff', 0.3), by = base + Math.sin(x / 60 + 2) * 6 - 4, k = r();
    g.strokeStyle = shade(col, -0.35); g.lineWidth = 0.8;
    if (k < 0.05 + band * 0.02) {   // a cottage
      const w = 28 + r() * 10, hgt = 16 + r() * 6, wall = mix(col, '#fff0d8', 0.45);
      g.fillStyle = wall; g.fillRect(x - w / 2, by - hgt, w, hgt); g.strokeRect(x - w / 2, by - hgt, w, hgt);
      g.fillStyle = shade(mix(col, '#c0604a', 0.5), -0.1); g.beginPath(); g.moveTo(x - w / 2 - 3, by - hgt); g.lineTo(x, by - hgt - 14); g.lineTo(x + w / 2 + 3, by - hgt); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = shade(col, -0.3); g.fillRect(x + w * 0.2, by - hgt - 15, 4, 9);
      g.fillStyle = band > 0 ? '#ffe9a0' : mix(wall, '#9ab8d8', 0.5); g.fillRect(x - w * 0.22, by - hgt * 0.7, 5, 5);
    } else if (k < 0.42) {   // conifer
      const hgt = 34 + r() * 28;
      for (let j = 0; j < 3; j++) { const ww = hgt * (0.3 - j * 0.07), yy = by - j * hgt * 0.26; g.fillStyle = shade(col, j * 0.04); g.beginPath(); g.moveTo(x - ww, yy); g.lineTo(x, yy - hgt * 0.5); g.lineTo(x + ww, yy); g.closePath(); g.fill(); }
    } else {   // round tree
      const hgt = 22 + r() * 16;
      g.fillStyle = shade(col, -0.25); g.fillRect(x - 1.5, by - hgt * 0.5, 3, hgt * 0.5);
      g.fillStyle = col; g.beginPath(); g.arc(x, by - hgt * 0.68, hgt * 0.4, 0, TAU); g.arc(x - hgt * 0.22, by - hgt * 0.5, hgt * 0.26, 0, TAU); g.arc(x + hgt * 0.22, by - hgt * 0.5, hgt * 0.26, 0, TAU); g.fill();
    }
    if (sl % 6 === 5) yield;
  }
  g.globalCompositeOperation = 'source-atop';
  const hz = g.createLinearGradient(0, yTop, 0, base + 10); hz.addColorStop(0, 'rgba(228,242,255,.55)'); hz.addColorStop(1, 'rgba(228,242,255,.12)');
  g.fillStyle = hz; g.fillRect(x0, yTop, x1 - x0, L.h);
  return c;
}

// ---------------------------------------------------------------- play layer tile: ground, road, verge, back row props, lamps
function tree(g, x, y, s, r, season) {
  g.fillStyle = '#7a5232'; g.strokeStyle = '#3a2416'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(x - 5 * s, y); g.quadraticCurveTo(x - 3 * s, y - 28 * s, x - 3.5 * s, y - 44 * s); g.lineTo(x + 3.5 * s, y - 44 * s); g.quadraticCurveTo(x + 3 * s, y - 28 * s, x + 5 * s, y); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(30,60,30,.22)'; g.beginPath(); g.ellipse(x, y + 1, 22 * s, 4.5 * s, 0, 0, TAU); g.fill();
  const pal = [['#6fc26a', '#f6b2cf', '#4fa84a'], ['#3f9a46', '#6cc05a', '#2c7a38'], ['#d6762a', '#f0b040', '#b8502a'], null][season];
  if (!pal) {   // bare branches with snow on top
    g.strokeStyle = '#5a3a24'; g.lineWidth = 2 * s;
    for (let i = 0; i < 5; i++) { const a = -1.9 + i * 0.55 + (r() - 0.5) * 0.3, len = (22 + r() * 14) * s; g.beginPath(); g.moveTo(x, y - 42 * s); g.lineTo(x + Math.cos(a) * len, y - 42 * s + Math.sin(a) * len); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(x + (r() - 0.5) * 26 * s, y - (50 + r() * 18) * s, 6 * s, 2.4 * s, 0, 0, TAU); g.fill(); }
    return;
  }
  const blob = (bx, by, rad, col) => { g.fillStyle = col; g.strokeStyle = shade(col, -0.45); g.lineWidth = 0.8; g.beginPath(); g.arc(bx, by, rad, 0, TAU); g.fill(); g.stroke(); };
  for (let i = 0; i < 7; i++) { const a = r() * TAU, d = r() * 15 * s; blob(x + Math.cos(a) * d, y - 58 * s + Math.sin(a) * d * 0.8, (9 + r() * 6) * s, pal[0]); }
  for (let i = 0; i < 6; i++) { const a = r() * TAU, d = r() * 13 * s; g.fillStyle = pal[1]; g.beginPath(); g.arc(x + Math.cos(a) * d - 3 * s, y - 62 * s + Math.sin(a) * d * 0.8, (4 + r() * 3) * s, 0, TAU); g.fill(); }
  for (let i = 0; i < 9; i++) { const a = r() * TAU, d = r() * 17 * s; g.fillStyle = pal[2]; g.beginPath(); g.arc(x + Math.cos(a) * d, y - 56 * s + Math.sin(a) * d * 0.8, 1.2 * s, 0, TAU); g.fill(); }
}
function pine(g, x, y, s, season) {
  g.fillStyle = '#6a4630'; g.fillRect(x - 3 * s, y - 14 * s, 6 * s, 14 * s);
  for (let k = 0; k < 4; k++) {
    const yy = y - (10 + k * 15) * s, w = (24 - k * 4.5) * s;
    g.fillStyle = k % 2 ? '#2f8a54' : '#3b9a5e'; g.strokeStyle = '#1b4a30'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 24 * s); g.lineTo(x + w, yy); g.closePath(); g.fill(); g.stroke();
    if (season === 3) { g.fillStyle = 'rgba(255,255,255,.88)'; g.beginPath(); g.moveTo(x - w * 0.62, yy - 9 * s); g.lineTo(x, yy - 24 * s); g.lineTo(x + w * 0.62, yy - 9 * s); g.quadraticCurveTo(x, yy - 5 * s, x - w * 0.62, yy - 9 * s); g.fill(); }
  }
}
function prop(g, kind, x, y, s, v) {
  const b = PROP_BOX[kind];
  g.save(); g.translate(x, y); g.scale(s, s); g.translate(-b[2], -b[3]); drawProp(kind, g, v); g.restore();
}
const PAVE_BAND = [1, 2, 3, 3, 4, 4];
function* playGen(env, idx) {
  const L = LAYERS.play, T = L.tile, sc = playScale(env.gfx), band = levelBand(env.level), season = env.season;
  const { c, g } = mk(T * sc, L.h * sc);
  const gy = env.groundY, yTop = gy + L.top, yBot = yTop + L.h;
  g.scale(sc, sc); g.translate(-idx * T, -yTop);
  const x0 = idx * T, x1 = x0 + T, Xa = x0 - 4, Xb = x1 + 4;
  const topEdge = (x) => gy - 46 + Math.sin(x / 70 + 1) * 3 + Math.sin(x / 23) * 1.2;
  // grass
  g.beginPath(); g.moveTo(Xa, yBot);
  for (let x = Xa; x <= Xb; x += 16) g.lineTo(x, topEdge(x));
  g.lineTo(Xb, yBot); g.closePath();
  g.fillStyle = hGrad(g, Xa, Xb, (x) => tone(colorAt(env, x, (t) => t.ground[0]), 'grass', season), 48); g.fill();
  g.save(); g.clip();
  const sh = g.createLinearGradient(0, gy - 46, 0, yBot); sh.addColorStop(0, 'rgba(255,255,255,.16)'); sh.addColorStop(0.3, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(24,50,40,.28)');
  g.fillStyle = sh; g.fillRect(Xa, gy - 50, Xb - Xa, yBot - gy + 50);
  const lowCol = g.createLinearGradient(Xa, 0, Xb, 0);   // a slightly different green low in the picture: depth
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.4; g.beginPath(); for (let x = Xa; x <= Xb; x += 16) (x === Xa ? g.moveTo(x, topEdge(x)) : g.lineTo(x, topEdge(x))); g.stroke();
  void lowCol;
  yield;
  // road
  const rTop = (x) => gy - 12 + Math.sin(x / 90) * 2, rBot = (x) => gy + 30 + Math.sin(x / 70 + 2) * 2;
  g.beginPath(); for (let x = Xa; x <= Xb; x += 16) (x === Xa ? g.moveTo(x, rTop(x)) : g.lineTo(x, rTop(x)));
  for (let x = Xb; x >= Xa; x -= 16) g.lineTo(x, rBot(x));
  g.closePath();
  const dirt = (x) => tone(colorAt(env, x, (t) => t.dirt), 'road', season);
  g.fillStyle = hGrad(g, Xa, Xb, dirt, 48); g.fill();
  g.strokeStyle = 'rgba(40,22,10,.35)'; g.lineWidth = 1.2; g.stroke();
  const paved = (x) => band >= PAVE_BAND[Math.min(5, districtAt(env, x))];
  for (let row = 0; row < 5; row++) {
    for (let k = Math.floor(Xa / 15) - 1; k * 15 < Xb; k++) {
      const x = k * 15 + (row % 2) * 7.5, r = mulberry(hash(env.seed + 'c' + row + ':' + k));
      const y = (rTop(x) + rBot(x)) / 2 + (row - 2) * 8 + 1;
      if (y < rTop(x) + 3 || y > rBot(x) - 3) continue;
      if (paved(x)) {
        g.fillStyle = shade(mix(dirt(x), '#c8c0b4', 0.6), (r() - 0.5) * 0.18); g.strokeStyle = 'rgba(50,40,40,.4)'; g.lineWidth = 0.7;
        g.beginPath(); g.ellipse(x, y, 6.4, 3.3, 0, 0, TAU); g.fill(); g.stroke();
      } else if (r() < 0.5) { g.fillStyle = shade(dirt(x), (r() - 0.5) * 0.3); g.beginPath(); g.arc(x + (r() - 0.5) * 8, y + (r() - 0.5) * 6, 0.8 + r() * 1.2, 0, TAU); g.fill(); }
    }
  }
  yield;
  // verge: season dressing and grass tufts (slot based, so tiles agree at their borders)
  for (let sl = Math.floor(Xa / 13); sl * 13 < Xb; sl++) {
    const r = mulberry(hash(env.seed + 'v' + sl)), x = sl * 13 + r() * 10, front = r() < 0.7, y = front ? rBot(x) + 6 + r() * 100 : topEdge(x) + 4 + r() * 28;
    if (r() < 0.55) {   // grass tuft
      const gc = shade(tone(colorAt(env, x, (t) => t.ground[1]), 'grass', season), -0.12);
      g.strokeStyle = gc; g.lineWidth = 1.1; g.beginPath(); for (let b = -1; b <= 1; b++) { g.moveTo(x + b * 2, y); g.quadraticCurveTo(x + b * 3, y - 4, x + b * 4.5, y - 7 - r() * 3); } g.stroke();
    } else if (season === 0 || season === 1) {
      const cols = season === 0 ? ['#ff9ac6', '#ffffff', '#ffd23f', '#c9a0ff'] : ['#ffd23f', '#ffffff', '#ff8a6a', '#8fd3ff'];
      if (r() < 0.5 + band * 0.08) { g.fillStyle = cols[(r() * 4) | 0]; g.beginPath(); g.arc(x, y - 3, 1.7, 0, TAU); g.fill(); g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(x, y - 3, 0.6, 0, TAU); g.fill(); g.strokeStyle = '#3f8a40'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x, y + 1); g.stroke(); }
    } else if (season === 2) {
      g.fillStyle = ['#d6762a', '#f0b040', '#b8502a', '#c8402a'][(r() * 4) | 0]; g.beginPath(); g.ellipse(x, y, 2.6, 1.4, r() * 3, 0, TAU); g.fill();
    } else if (r() < 0.6) {
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(x, y, 5 + r() * 6, 1.8 + r() * 1.2, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(190,215,240,.55)'; g.beginPath(); g.ellipse(x + 1, y + 1.4, 4 + r() * 4, 1, 0, 0, TAU); g.fill();
    }
    if (sl % 12 === 11) yield;
  }
  if (season === 3) {   // snow dusting on the road edge
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (let x = Xa; x < Xb; x += 9) { const r = mulberry(hash(env.seed + 's' + (x / 9 | 0))); if (r() < 0.7) { g.beginPath(); g.ellipse(x + r() * 6, rTop(x) + 1 + r() * 2, 5 + r() * 4, 1.8, 0, 0, TAU); g.fill(); } }
  }
  yield;
  // back row: trees, bushes, fences, flowerbeds (always behind the cat, which walks on the road)
  const chance = 0.4 + band * 0.07;
  for (let sl = Math.floor((Xa - 60) / 74); sl * 74 < Xb + 60; sl++) {
    const r = mulberry(hash(env.seed + 'p' + sl)), x = sl * 74 + r() * 40, k = r(), cut = r(), vv = (r() * 9) | 0, s = 0.9 + r() * 0.5;
    if (cut > chance || nearZone(env, x, 84, ['building', 'gate', 'lift', 'statue', 'lookout', 'bench', 'wonder'])) continue;
    const y = gy - 38 - r() * 12, dist = districtAt(env, x), th = THEMES[env.districts[dist].theme];
    if (k < 0.34) tree(g, x, y, s, r, season);
    else if (k < 0.5 || (th.deco === 'snow' && k < 0.6) || (dist === 2 && k < 0.58)) pine(g, x, y, s * 0.95, season);
    else if (k < 0.74) prop(g, 'bush', x, y + 6, s * 1.25, vv);
    else if (k < 0.86 && band >= 1) prop(g, 'flowerbed', x, y + 12, 1.4, vv);
    else if (k < 0.94 && band >= 2) prop(g, 'fence', x, y + 10, 1.5, 0);
    else prop(g, 'crate', x, y + 12, 1.1, 0);
    if (sl % 4 === 3) yield;
  }
  yield;
  // lamp posts and bunting (kingdom level bands)
  const lamps = lampPoints(env);
  for (let i = 0; i < lamps.length; i++) {
    const a = lamps[i], b = lamps[i + 1];
    if (b && b.d === a.d && b.x - a.x < 320 && band >= 1 && (a.d === 0 || band >= 3) && b.x > Xa - 10 && a.x < Xb + 10) {
      const ya = a.y - LAMP_TOP + 10, cols = ['#ffd23f', '#ff8fb7', '#ffffff', '#8fd3ff'], n = Math.round((b.x - a.x) / 15);
      g.strokeStyle = 'rgba(70,40,30,.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, ya); g.quadraticCurveTo((a.x + b.x) / 2, ya + 26, b.x, ya); g.stroke();
      for (let j = 0; j < n; j++) { const u = (j + 0.5) / n, px = a.x + (b.x - a.x) * u, py = ya + 26 * 2 * u * (1 - u) * 0.5 * 1.0; g.fillStyle = cols[j % 4]; g.beginPath(); g.moveTo(px - 4, py); g.lineTo(px + 4, py); g.lineTo(px, py + 9); g.closePath(); g.fill(); }
    }
    if (a.x > Xa - 30 && a.x < Xb + 30) prop(g, 'lantern', a.x, a.y, LAMP_S, 0);
  }
  return c;
}

// ---------------------------------------------------------------- small sprites the world keeps (clouds, glow)
const CLOUDS = [[[0, 0, 34, 10], [-22, 4, 22, 8], [24, 4, 24, 8], [-6, -7, 20, 9], [12, -5, 16, 8]], [[0, 2, 28, 8], [-18, 5, 18, 6], [20, 5, 18, 6], [2, -5, 15, 7]], [[0, 0, 40, 11], [-28, 5, 24, 8], [30, 5, 26, 8], [-10, -8, 22, 10], [14, -9, 18, 9], [38, -2, 14, 7]]];
export function buildCloud(i) {
  const { c, g } = mk(150, 56);
  for (const [dx, dy, rx, ry] of CLOUDS[i % 3]) { g.beginPath(); g.ellipse(75 + dx, 34 + dy, rx, ry, 0, 0, TAU); g.fillStyle = 'rgba(255,255,255,.94)'; g.fill(); }
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, 8, 0, 56); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(150,185,225,.6)');
  g.fillStyle = sh; g.fillRect(0, 0, 150, 56);
  return c;
}
export function buildGlow() {
  const { c, g } = mk(64, 64), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,225,130,.9)'); gr.addColorStop(0.35, 'rgba(255,205,100,.35)'); gr.addColorStop(1, 'rgba(255,205,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

// ---------------------------------------------------------------- building one strip
const GENS = { sky: (e) => skyGen(e), far: (e) => farGen(e), hills: (e) => hillsGen(e), mid: midGen, play: playGen };
export const LAYER_NAMES = ['sky', 'far', 'hills', 'mid', 'play'];
// the generator form: next() builds one slice, the last result has done = true and value = the canvas
export function stripGen(layer, index, env) { return GENS[layer](env, index); }
// build a whole strip at once (tests, first frame warm up)
export function buildStripNow(layer, index, env) {
  const it = stripGen(layer, index, env);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
// what a layer's strips depend on: a strip is rebuilt when its signature changes
function sigOf(layer, e) {
  const band = levelBand(e.level);
  switch (layer) {
    case 'sky': return 's' + e.season;
    case 'far': case 'hills': return layer + e.season + (e.reduced ? 'r' : '') + e.W;
    case 'mid': return 'm' + e.season + band + (e.reduced ? 'r' : '');
    default: return 'p' + e.season + band + playScale(e.gfx);
  }
}
export const stripSig = sigOf;

const px4 = (c) => (c ? c.width * c.height * 4 : 0);
const MB = 1048576;
// Pure memory estimate (MB) of the strip canvases for a world: `resident` = steady state, `peak` = while the next strip builds
// beside a stale one. The world adds building sprites, statues and the glow on top (see world.memMB()).
export function estimateMemMB({ worldW = 3600, gfx = 3, reduced = false } = {}) {
  const one = (w, h) => Math.ceil(w) * Math.ceil(h) * 4;
  const sky = one(LAYERS.sky.w, LAYERS.sky.h);
  const far = one(singleWidth('far', worldW, reduced) * LAYERS.far.res, LAYERS.far.h * LAYERS.far.res);
  const hills = one(singleWidth('hills', worldW, reduced) * LAYERS.hills.res, LAYERS.hills.h * LAYERS.hills.res);
  const m = LAYERS.mid, p = LAYERS.play, sc = playScale(gfx);
  const midOne = gfx > 0 ? one(m.tile * m.scale, m.h * m.scale) : 0, playOne = one(p.tile * sc, p.h * sc);
  const nMid = Math.ceil(VIEW_W / m.tile) + 1 + 1, nPlay = Math.ceil(VIEW_W / p.tile) + 1 + 1;   // window + one ahead
  const resident = sky + far + hills + midOne * nMid + playOne * nPlay;
  return { resident: resident / MB, peak: (resident + midOne + playOne) / MB, parts: { sky, far, hills, midOne, playOne, nMid, nPlay } };
}

// ---------------------------------------------------------------- the cache
export function createStrips(initEnv) {
  let env = initEnv, frame = 1, job = null;
  const maps = { sky: new Map(), far: new Map(), hills: new Map(), mid: new Map(), play: new Map() };
  const queue = [];
  let sigs = {};
  const resig = () => { for (const l of LAYER_NAMES) sigs[l] = sigOf(l, env); };
  resig();
  const release = (c) => { if (c) c.width = c.height = 0; };
  function finish(j, canvas) {
    const e = maps[j.layer].get(j.idx);
    if (!e || sigs[j.layer] !== j.sig) { release(canvas); if (e) e.want = ''; return; }
    release(e.canvas); e.canvas = canvas; e.sig = j.sig;
  }
  function entry(layer, idx) {
    const m = maps[layer]; let e = m.get(idx);
    if (!e) { e = { canvas: null, sig: '', want: '', gen: 0 }; m.set(idx, e); }
    return e;
  }
  const api = {
    get env() { return env; },
    setEnv(e) { env = e; resig(); },
    beginFrame() { frame++; },
    // the strip canvas if it is built (a stale one from an older env while the new one is queued), else null
    get(layer, idx) {
      const e = entry(layer, idx), sig = sigs[layer];
      e.gen = frame;
      if (e.sig === sig && e.canvas) return e.canvas;
      if (e.want !== sig) { e.want = sig; queue.push({ layer, idx, sig }); }
      return e.canvas;
    },
    has(layer, idx) { const e = maps[layer].get(idx); return !!(e && e.canvas && e.sig === sigs[layer]); },
    // build for roughly `ms` milliseconds (always at least one slice when something is queued). Returns strips finished.
    pump(ms) {
      const t0 = nowMs(); let done = 0;
      for (;;) {
        if (!job) {
          while (queue.length) {
            const q = queue.shift(), e = maps[q.layer].get(q.idx);
            if (e && e.want === q.sig && q.sig === sigs[q.layer] && e.gen >= frame - 1) { job = { layer: q.layer, idx: q.idx, sig: q.sig, it: stripGen(q.layer, q.idx, env) }; break; }
            if (e && e.want === q.sig) e.want = '';
          }
          if (!job) break;
        }
        const r = job.it.next();
        if (r.done) { finish(job, r.value); job = null; done++; }
        if (nowMs() - t0 >= ms) break;
      }
      return done;
    },
    pending() { return queue.length + (job ? 1 : 0); },
    // free every strip that was not asked for since beginFrame()
    sweep() {
      for (const l of LAYER_NAMES) for (const [idx, e] of maps[l]) if (e.gen < frame) { release(e.canvas); maps[l].delete(idx); }
    },
    count(layer) { let n = 0; for (const e of maps[layer].values()) if (e.canvas) n++; return n; },
    memMB() { let b = 0; for (const l of LAYER_NAMES) for (const e of maps[l].values()) b += px4(e.canvas); return b / MB; },
    free() {
      for (const l of LAYER_NAMES) { for (const e of maps[l].values()) release(e.canvas); maps[l].clear(); }
      queue.length = 0; if (job) { job.it.return(); job = null; }
    },
  };
  return api;
}
