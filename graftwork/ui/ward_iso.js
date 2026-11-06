// THE WARD, isometric view (design/WARD.md "Isometric view and art pipeline"). The 9 x 6 floor plan is projected to a 2:1 diamond grid;
// each room is an illustrated cutaway diorama (assets/ward/ sprites via ui/assets.js, a procedural block when no image is there), monsters
// stand and wander inside their rooms, the hero walks cell to cell, the thread is stitched across the floor, and the whole map is lit by the
// time of day. ui/ward.js owns the rules and the screen; this module only draws and picks.
//
//   cellW(w, x, y)            screen centre of a cell's floor (also ward.js cellCenter)
//   pick(w, mx, my)           the cell under a point: floors first (exact diamonds), then the wall volume of a room -> {x, y} | null
//   roomBox(w, x, y)          bounding box of a room diorama (layout registry, tooltips)
//   drawGround / drawRooms / drawLight / drawThread / drawOverlay   the draw passes, called in this order by ward.js
// Depth: back to front by x + y (rooms), then every actor (monsters, hero) in one pass sorted by screen y, so nobody is hidden behind a wall.
import { COL, EASE, clamp, lerp, rgba } from './core.js';
import { lnw } from '../art/linework.js';
import * as WD from '../engine/ward.js';
import { ROOMS, BUILD_CARDS } from '../data/ward.js';
import { ENEMIES } from '../data/index.js';
import { drawEnemy, enemyBounds } from '../art/enemies.js';
import { drawHero } from '../art/heroes.js';
import { drawNodeIcon, drawEventSeal } from '../art/icons.js';
import { assets } from './assets.js';
import * as K from './ward_kit.js';

export const TW = 92, TH = 48; // floor tile of the 2:1 projection (world px; the camera scales them on screen)
export const MAPR = { x: 284, y: 64, w: 712, h: 484 }; // the map panel (same rectangle as the old sheet)
const FILL = 1; // a room's measured floor diamond is scaled to exactly the cell diamond
const UP = 70; // how far a diorama rises above its floor centre (layout and camera fit; the real sprite decides what is drawn)
const SLAB = 14; // thickness of the stone plinth
const WALL = 48; // wall height of the procedural block and of the pick volume
const TAU = Math.PI * 2;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// ---------------- projection, camera and picking ----------------
// World space is the fixed iso layout (cellW). The camera maps world to the map panel: screen = (world - focus) * z + panel centre.
// It auto-fits the built rooms, the hero and the buildable cells (eased), until the player zooms or pans (manual) and presses Recenter (C).
const G = { w: 0, h: 0, ox: 0, oy: 0 };
function geo(w) {
  if (G.w !== w.w || G.h !== w.h) {
    G.w = w.w; G.h = w.h;
    G.ox = MAPR.x + MAPR.w / 2 - ((w.w - 1) - (w.h - 1)) / 2 * TW / 2;
    G.oy = MAPR.y + MAPR.h / 2 - (w.w + w.h - 2) * TH / 4;
  }
  return G;
}
export function cellW(w, x, y) { const g = geo(w); return { x: g.ox + (x - y) * TW / 2, y: g.oy + (x + y) * TH / 2 }; }
export const CAM = { z: 1, x: 640, y: 300, tz: 1, tx: 640, ty: 300, manual: false, init: false, lastT: 0 };
export const ZMIN = 0.55, ZMAX_AUTO = 2.4, ZMAX = 3.4;
const MCX = MAPR.x + MAPR.w / 2, MCY = MAPR.y + MAPR.h / 2;
export const toScreen = (wx, wy) => ({ x: (wx - CAM.x) * CAM.z + MCX, y: (wy - CAM.y) * CAM.z + MCY });
export const toWorld = (sx, sy) => ({ x: (sx - MCX) / CAM.z + CAM.x, y: (sy - MCY) / CAM.z + CAM.y });
export function cellC(w, x, y) { const c = cellW(w, x, y); return toScreen(c.x, c.y); } // the screen centre of a cell's floor
const inMap = (sx, sy) => sx >= MAPR.x && sx <= MAPR.x + MAPR.w && sy >= MAPR.y && sy <= MAPR.y + MAPR.h;
export const overMap = inMap;
// hexagon of a diamond lifted by `up`: a point is inside when some lift in [0, up] puts it in the diamond
function inVolume(px, py, cx, cy, hw, hh, up) {
  const dy = py - cy, a = dy, b = dy + up, lo = a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b));
  return Math.abs(px - cx) / hw + lo / hh <= 1;
}
export function pick(w, sx, sy) {
  if (!inMap(sx, sy)) return null;
  const g = geo(w), p = toWorld(sx, sy), mx = p.x, my = p.y, u = (mx - g.ox) / (TW / 2), v = (my - g.oy) / (TH / 2), gxf = (u + v) / 2, gyf = (v - u) / 2;
  const gx = Math.round(gxf) || 0, gy = Math.round(gyf) || 0;
  if (gx >= 0 && gy >= 0 && gx < w.w && gy < w.h) return { x: gx, y: gy };
  const gr = w.grid;
  for (let d = w.w + w.h - 2; d >= 0; d--) for (let x = Math.min(d, w.w - 1); x >= 0 && d - x < w.h; x--) {
    const y = d - x; if (y < 0 || !gr[y][x] || gr[y][x] === 'rubble') continue;
    const c = cellW(w, x, y);
    if (inVolume(mx, my, c.x, c.y, TW * FILL / 2, TH * FILL / 2, WALL)) return { x, y };
  }
  return null;
}
export function roomBox(w, x, y) { const c = cellW(w, x, y), s = toScreen(c.x - TW / 2, c.y - UP); return { x: s.x, y: s.y, w: TW * CAM.z, h: (UP + TH / 2 + 4) * CAM.z }; }
export const cellBox = (w, x, y) => { const c = cellW(w, x, y), s = toScreen(c.x - TW / 2, c.y - TH / 2); return { x: s.x, y: s.y, w: TW * CAM.z, h: TH * CAM.z }; };
const diamond = (g, cx, cy, hw, hh) => { g.beginPath(); g.moveTo(cx, cy - hh); g.lineTo(cx + hw, cy); g.lineTo(cx, cy + hh); g.lineTo(cx - hw, cy); g.closePath(); };

// what the camera frames: rooms (not a far Theatre), the hero, the cells that can be built on in the morning; with margin
function fitTarget(host) {
  const { run } = host, w = run.ward;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (cx, cy, up) => { x0 = Math.min(x0, cx - TW / 2); x1 = Math.max(x1, cx + TW / 2); y0 = Math.min(y0, cy - up); y1 = Math.max(y1, cy + TH / 2 + 6); };
  const rooms = Object.values(w.rooms), far = (r) => r.type === 'rm_theatre' && !host.bossForced && !rooms.some((o) => o !== r && Math.max(Math.abs(o.x - r.x), Math.abs(o.y - r.y)) <= 2);
  for (const r of rooms) { if (far(r)) continue; const c = cellW(w, r.x, r.y); add(c.x, c.y, UP); }
  const hr = w.rooms[w.hero.room]; if (hr) { const c = cellW(w, hr.x, hr.y); add(c.x, c.y, UP); }
  if (w.phase === 'morning') for (const k of host.buildable) { const [bx, by] = k.split(','), c = cellW(w, +bx, +by); add(c.x, c.y, 8); }
  if (x0 > x1) { const c = cellW(w, 0, 0); add(c.x, c.y, UP); }
  const bw = x1 - x0 + 36, bh = y1 - y0 + 30;
  return { z: clamp(Math.min((MAPR.w - 20) / bw, (MAPR.h - 20) / bh), 0.95, ZMAX_AUTO), x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}
export function camUpdate(host) {
  const { S } = host, dt = clamp(S.t - CAM.lastT, 0, 0.1); CAM.lastT = S.t;
  if (!CAM.manual) { const f = fitTarget(host); CAM.tz = f.z; CAM.tx = f.x; CAM.ty = f.y; }
  if (!CAM.init || host.reduced) { CAM.z = CAM.tz; CAM.x = CAM.tx; CAM.y = CAM.ty; CAM.init = true; return; }
  const k = Math.min(1, dt * 5);
  CAM.z += (CAM.tz - CAM.z) * k; CAM.x += (CAM.tx - CAM.x) * k; CAM.y += (CAM.ty - CAM.y) * k;
}
export function camZoomBy(f, sx, sy) { // zoom about a screen point (wheel, pinch, the + and - buttons)
  const z0 = CAM.tz, z1 = clamp(z0 * f, ZMIN, ZMAX);
  const px = (sx - MCX) / z0 + CAM.tx, py = (sy - MCY) / z0 + CAM.ty;
  CAM.manual = true; CAM.tz = z1; CAM.tx = px - (sx - MCX) / z1; CAM.ty = py - (sy - MCY) / z1;
}
export function camPanBy(dx, dy) { CAM.manual = true; CAM.tx -= dx / CAM.tz; CAM.ty -= dy / CAM.tz; CAM.x = CAM.tx; CAM.y = CAM.ty; } // follows the finger at once
export function camRecenter() { CAM.manual = false; }
export function camReset() { CAM.manual = false; CAM.init = false; }
export function camBegin(app) { const g = app.ctx; g.save(); g.beginPath(); g.rect(MAPR.x, MAPR.y, MAPR.w, MAPR.h); g.clip(); g.translate(MCX, MCY); g.scale(CAM.z, CAM.z); g.translate(-CAM.x, -CAM.y); }
export function camEnd(app) { app.ctx.restore(); }

// ---------------- offscreen helpers (all optional: with no DOM everything is drawn straight) ----------------
function mk(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const x = c.getContext('2d'); return x ? { c, x } : null; } catch (e) { return null; }
}
const V = {
  ground: null, groundKey: '', dark: new WeakMap(), glow: null, glowTried: false, mon: new Map(), hero: new Map(),
  lift: Object.create(null), landed: Object.create(null), lastT: 0, motes: new Float32Array(30 * 5), motesInit: false, list: [], pool: [], faceHero: 1, heroPrev: null, plots: [], plotsKey: '',
  lamp: { k: 0 }, order: [], rl: [], tk: Object.create(null), act: new Map(), cnt: Object.create(null), born: Object.create(null), keep: Object.create(null), fadeA: Object.create(null), hf: 0, moteT: 0, rum: 0,
};
export function resetIso() { V.ground = null; V.groundKey = ''; V.mon.clear(); V.hero.clear(); V.lift = Object.create(null); V.landed = Object.create(null); V.lastT = 0; V.motesInit = false; V.faceHero = 1; V.heroPrev = null; }
function glowSprite() {
  if (V.glow || V.glowTried) return V.glow;
  V.glowTried = true;
  const o = mk(128, 128); if (!o) return null;
  const gr = o.x.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  o.x.fillStyle = gr; o.x.fillRect(0, 0, 128, 128);
  // tint per use via a second canvas would cost memory: warm glow is baked in, night uses the same sprite scaled
  const gw = mk(128, 128); gw.x.drawImage(o.c, 0, 0); gw.x.globalCompositeOperation = 'source-in'; gw.x.fillStyle = '#ffc870'; gw.x.fillRect(0, 0, 128, 128);
  V.glow = gw.c; return V.glow;
}
function glowAt(g, x, y, r, a, warm = true) {
  if (a <= 0.01) return;
  const s = glowSprite();
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a);
  if (s && warm) g.drawImage(s, x - r, y - r, r * 2, r * 2);
  else { const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, warm ? 'rgba(255,200,110,.9)' : 'rgba(150,190,255,.8)'); gr.addColorStop(1, 'rgba(255,200,110,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.restore();
}

// ---------------- time of day ----------------
// multiply tint (r g b a), lamp glow strength, moon light. Morning is cool and clear, midday bright, evening amber, night deep blue.
const LIGHT = {
  morning: { r: 206, g: 224, b: 242, a: 0.5, glow: 0.2, moon: 0 },
  midday: { r: 255, g: 250, b: 236, a: 0.0, glow: 0.0, moon: 0 },
  evening: { r: 240, g: 158, b: 82, a: 0.74, glow: 0.62, moon: 0 },
  night: { r: 60, g: 84, b: 160, a: 0.72, glow: 1.0, moon: 1 },
};
const LS = { r: 0, g: 0, b: 0, a: 0, glow: 0, moon: 0, night: 0 };
export function lightState(phase, trans) {
  const to = LIGHT[phase] || LIGHT.midday, k = trans ? EASE.inOut(clamp(trans.t / trans.dur, 0, 1)) : 1, from = trans && trans.from && LIGHT[trans.from] ? LIGHT[trans.from] : to;
  for (const f of ['r', 'g', 'b', 'a', 'glow', 'moon']) LS[f] = lerp(from[f], to[f], k);
  return LS;
}

// ---------------- the ground: plinth, flagstones that fade away from the built cluster, plots, rubble, placement highlight ----------------
function drawPlinth(g, w) {
  const top = cellW(w, 0, 0), right = cellW(w, w.w - 1, 0), bot = cellW(w, w.w - 1, w.h - 1), left = cellW(w, 0, w.h - 1), m = 0.62;
  const P = (c, dx, dy) => [c.x + dx * TW * m, c.y + dy * TH * m];
  const T = P(top, 0, -1), R = P(right, 1, 0), B = P(bot, 0, 1), L = P(left, -1, 0);
  g.fillStyle = '#17110e'; g.beginPath(); g.moveTo(L[0], L[1]); g.lineTo(B[0], B[1]); g.lineTo(B[0], B[1] + SLAB); g.lineTo(L[0], L[1] + SLAB); g.closePath(); g.fill();
  g.fillStyle = '#0f0b09'; g.beginPath(); g.moveTo(B[0], B[1]); g.lineTo(R[0], R[1]); g.lineTo(R[0], R[1] + SLAB); g.lineTo(B[0], B[1] + SLAB); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(201,162,39,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L[0], L[1] + SLAB); g.lineTo(B[0], B[1] + SLAB); g.lineTo(R[0], R[1] + SLAB); g.stroke();
  const tg = g.createLinearGradient(L[0], T[1], R[0], B[1]); tg.addColorStop(0, '#2d241d'); tg.addColorStop(1, '#1d1612');
  g.fillStyle = tg; g.beginPath(); g.moveTo(T[0], T[1]); g.lineTo(R[0], R[1]); g.lineTo(B[0], B[1]); g.lineTo(L[0], L[1]); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(201,162,39,.4)'; g.lineWidth = 1.5; g.stroke();
}
// flagstones: full next to the built rooms, a faint grid far from them
function drawFlags(g, w, host) {
  const rl = V.rl; rl.length = 0; for (const r of Object.values(w.rooms)) rl.push(r.x, r.y);
  const hr = w.rooms[w.hero.room]; if (hr) rl.push(hr.x, hr.y);
  for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
    let d = 9; for (let i = 0; i < rl.length; i += 2) { const q = Math.max(Math.abs(rl[i] - x), Math.abs(rl[i + 1] - y)); if (q < d) d = q; }
    const al = d <= 1 ? 1 : d === 2 ? 0.55 : 0.22, c = cellW(w, x, y), sh = (x + y) % 2;
    g.globalAlpha = al; diamond(g, c.x, c.y, TW / 2 - 0.8, TH / 2 - 0.4); g.fillStyle = sh ? '#35291f' : '#3d3025'; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.8; g.stroke();
    if (al > 0.5) { g.strokeStyle = 'rgba(232,220,196,.07)'; g.beginPath(); g.moveTo(c.x - TW / 2 + 2, c.y); g.lineTo(c.x, c.y - TH / 2 + 1); g.lineTo(c.x + TW / 2 - 2, c.y); g.stroke(); }
  }
  g.globalAlpha = 1;
}
const STONES = [[-14, 6, 9], [8, 8, 11], [-2, -5, 8], [15, -3, 7], [-19, -2, 6], [3, 3, 5]];
function drawRubble(g, c, legal, pulse, t) {
  for (const [dx, dy, r] of STONES) {
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + dx, rr = r * (0.75 + 0.25 * Math.sin(i * 2.3 + dy)); g.lineTo(c.x + dx + Math.cos(a) * rr, c.y + dy * 0.6 + Math.sin(a) * rr * 0.5); } g.closePath();
    g.fillStyle = '#8a8274'; g.fill(); g.strokeStyle = '#1b1612'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(c.x + dx - r * 0.2, c.y + dy * 0.6 - r * 0.2, r * 0.4, r * 0.2, 0, 0, TAU); g.fill();
  }
  if (legal) { diamond(g, c.x, c.y, TW / 2 - 3, TH / 2 - 2); g.strokeStyle = rgba('#ffd870', 0.55 + 0.45 * pulse); g.lineWidth = 2; g.setLineDash([6, 4]); g.lineDashOffset = -t * 18; g.stroke(); g.setLineDash([]); }
}
function drawPlot(app, g, c, alpha) {
  const spr = assets.room('plot_empty', app);
  if (spr) { drawSprite(g, spr, c.x, c.y, 0, alpha); return; }
  // blueprint tile: chalk border, corner stakes, a pinned plan
  g.save(); g.globalAlpha = alpha;
  diamond(g, c.x, c.y, TW / 2 - 4, TH / 2 - 2); g.fillStyle = 'rgba(72,92,128,.30)'; g.fill();
  g.strokeStyle = 'rgba(214,226,246,.55)'; g.lineWidth = 1; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
  diamond(g, c.x, c.y, TW / 4, TH / 4); g.strokeStyle = 'rgba(214,226,246,.25)'; g.stroke();
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const sx = c.x + dx * (TW / 2 - 7), sy = c.y + dy * (TH / 2 - 4); g.fillStyle = '#6a4a2a'; g.fillRect(sx - 1.5, sy - 5, 3, 6); g.fillStyle = '#e8d6b0'; g.fillRect(sx - 1.5, sy - 5, 3, 1.5); }
  g.restore();
}
export function drawGround(host, inter) {
  const { app, run, S } = host, g = app.ctx, w = run.ward;
  const pulse = 0.5 + 0.5 * Math.sin(S.t * 5), lc = inter && inter.legal ? inter.legal.cells : null;
  g.save();
  drawPlinth(g, w); drawFlags(g, w, host);
  const legal = new Set(lc ? lc.map(([x, y]) => x + ',' + y) : []);
  const morning = w.phase === 'morning';
  const hov = inter && inter.hoverCell;
  for (let d = 0; d <= w.w + w.h - 2; d++) for (let x = Math.min(d, w.w - 1); x >= 0 && d - x < w.h; x--) {
    const y = d - x, id = w.grid[y][x];
    if (id && id !== 'rubble') continue;
    const c = cellW(w, x, y), isL = legal.has(x + ',' + y);
    if (id === 'rubble') { drawRubble(g, c, isL, pulse, S.t); continue; }
    if (morning && (isL || host.buildable.has(x + ',' + y))) drawPlot(app, g, c, isL ? 1 : 0.8);
    if (isL) {
      const hv = hov && hov.x === x && hov.y === y;
      diamond(g, c.x, c.y, TW / 2 - 3, TH / 2 - 1.5); g.fillStyle = rgba('#ffd060', hv ? 0.4 : 0.12 + 0.12 * pulse); g.fill();
      g.setLineDash([6, 4]); g.lineDashOffset = -S.t * 18; g.strokeStyle = hv ? '#fff2b8' : rgba('#ffd870', 0.85); g.lineWidth = hv ? 2.4 : 1.6; g.stroke(); g.setLineDash([]);
    }
  }
  g.restore();
}

// ---------------- sprites ----------------
// Draw a room / plot sprite so its floor centre lands on (cx, cy). tw is the tile width the sprite's floor diamond is scaled to.
function drawSprite(g, spr, cx, cy, lift, alpha, img, keep = 1) {
  const d = spr.def, s = TW * FILL / (d.floorW || d.w * 0.96), dw = d.w * s, dh = d.h * s, im = img || spr.img;
  const fx = d.floorCx === undefined ? d.w / 2 : d.floorCx, fy = d.floorCy === undefined ? d.h * 0.75 : d.floorCy;
  if (alpha < 1) { g.save(); g.globalAlpha *= alpha; }
  if (keep < 0.99) { // lowered walls: crop the top of the wall region away (a section cut), nothing below the floor changes
    const topY = fy - (d.floorH || d.h * 0.5) / 2, cut = (1 - keep) * Math.max(0, topY - 6), k = (im.naturalWidth || im.width || d.w) / d.w;
    g.drawImage(im, 0, cut * k, d.w * k, (d.h - cut) * k, cx - fx * s, cy - fy * s - lift + cut * s, dw, (d.h - cut) * s);
  } else g.drawImage(im, cx - fx * s, cy - fy * s - lift, dw, dh);
  if (alpha < 1) g.restore();
  return { top: cy - fy * s - lift, s };
}
function darkOf(spr) {
  let v = V.dark.get(spr.img);
  if (v !== undefined) return v;
  const iw = spr.img.naturalWidth || spr.img.width || 0, ih = spr.img.naturalHeight || spr.img.height || 0, k = Math.min(1, 640 / Math.max(1, iw));
  const o = iw ? mk(iw * k, ih * k) : null;
  if (o) {
    o.x.drawImage(spr.img, 0, 0, o.c.width, o.c.height);
    o.x.globalCompositeOperation = 'source-atop';
    o.x.fillStyle = 'rgba(88,96,128,.5)'; o.x.fillRect(0, 0, o.c.width, o.c.height); // cold, desaturated
    o.x.fillStyle = 'rgba(8,8,16,.45)'; o.x.fillRect(0, 0, o.c.width, o.c.height);
  }
  v = o ? o.c : null; V.dark.set(spr.img, v); return v;
}
// procedural diorama block: the fallback while the art is missing or still loading
function drawBlock(g, type, cx, cy, lift, dark, theatre) {
  const hw = TW * FILL / 2, hh = TH * FILL / 2, H = WALL + (theatre ? 8 : 0), tint = K.ROOM_TINT[type] || '#8a7a5c';
  const y0 = cy - lift;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.35)'; diamond(g, cx + 2, y0 + 5, hw + 2, hh + 2); g.fill();
  // floor
  diamond(g, cx, y0, hw, hh); const fg = g.createLinearGradient(cx - hw, y0, cx + hw, y0 + hh); fg.addColorStop(0, theatre ? '#4a2428' : '#8b7556'); fg.addColorStop(1, theatre ? '#2b1416' : '#6a563f'); g.fillStyle = fg; g.fill();
  g.fillStyle = rgba(tint, 0.22); g.fill(); g.strokeStyle = '#1b1410'; g.lineWidth = 1.3; g.stroke();
  // plank lines on the floor
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.beginPath(); for (let i = -2; i <= 2; i++) { g.moveTo(cx - hw * 0.5 + i * hw * 0.3, y0 - hh * 0.9 + Math.abs(i) * hh * 0.2); g.lineTo(cx + hw * 0.5 + i * hw * 0.3, y0 + hh * 0.9 - Math.abs(i) * hh * 0.2); } g.stroke();
  // back walls (left and right) rising from the two far edges
  const wl = g.createLinearGradient(cx - hw, y0 - H, cx, y0); wl.addColorStop(0, '#5a4636'); wl.addColorStop(1, '#3b2d23');
  g.fillStyle = wl; g.beginPath(); g.moveTo(cx - hw, y0); g.lineTo(cx, y0 - hh); g.lineTo(cx, y0 - hh - H); g.lineTo(cx - hw, y0 - H); g.closePath(); g.fill(); g.strokeStyle = '#1b1410'; g.lineWidth = 1.3; g.stroke();
  const wr = g.createLinearGradient(cx, y0 - H, cx + hw, y0); wr.addColorStop(0, '#6b5340'); wr.addColorStop(1, '#46362a');
  g.fillStyle = wr; g.beginPath(); g.moveTo(cx + hw, y0); g.lineTo(cx, y0 - hh); g.lineTo(cx, y0 - hh - H); g.lineTo(cx + hw, y0 - H); g.closePath(); g.fill(); g.stroke();
  // wall boards
  g.strokeStyle = 'rgba(0,0,0,.2)'; g.beginPath(); for (let i = 1; i < 4; i++) { const f = i / 4; g.moveTo(cx - hw * f, y0 - hh * (1 - f) - 0); g.lineTo(cx - hw * f, y0 - hh * (1 - f) - H - 0); } g.stroke();
  // window glow and the engraved glyph on the right wall
  g.fillStyle = rgba(tint, 0.5); g.beginPath(); g.moveTo(cx + 6, y0 - hh - H * 0.78); g.lineTo(cx + hw - 8, y0 - H * 0.8 + 2); g.lineTo(cx + hw - 8, y0 - H * 0.28); g.lineTo(cx + 6, y0 - hh - H * 0.12 + 4); g.closePath(); g.fill();
  K.roomGlyph(g, type, cx + hw * 0.5, y0 - hh * 0.5 - H * 0.45, 22, theatre ? '#e8d6b0' : '#2B1E1A', tint);
  // corner posts and rim
  g.fillStyle = '#2a1e16'; g.fillRect(cx - 2, y0 - hh - H - 3, 4, H + 6); g.fillRect(cx - hw - 2, y0 - H - 2, 4, H + 4); g.fillRect(cx + hw - 2, y0 - H - 2, 4, H + 4);
  g.strokeStyle = theatre ? '#c9a227' : 'rgba(232,220,196,.35)'; g.lineWidth = 1; diamond(g, cx, y0, hw, hh); g.stroke();
  g.restore();
}

// ---------------- actors ----------------
const MON_SLOTS = [[-0.26, -0.01], [0.26, -0.03], [-0.09, -0.1], [0.11, -0.11], [0.0, 0.07]];
function poolRec(n) { return V.pool[n] || (V.pool[n] = { kind: '', id: '', x: 0, y: 0, d: 0, h: 0, flip: 0, bob: 0, sq: 1, ph: 0, lvl: 0, alpha: 1, frame: 0, tilt: 0, dark: 0, ring: 0, data: null }); }
function enemyCanvas(id, targetH) {
  const key = id + '|' + targetH, hit = V.mon.get(key);
  if (hit !== undefined) return hit;
  const def = ENEMIES[id]; let out = null;
  if (def) {
    const b = enemyBounds(def), ss = 2, sc = (targetH * ss) / Math.max(40, b.h, b.w * 0.75), cw = Math.ceil(b.w * sc * 1.25) + 8, ch = Math.ceil(b.h * sc * 1.2) + 8, o = mk(cw, ch);
    if (o) { try { drawEnemy(o.x, def, cw / 2, ch - 6, { scale: sc, t: 0.3 }); out = { c: o.c, w: cw / ss, h: ch / ss, fx: cw / 2 / ss, fy: (ch - 6) / ss }; } catch (e) { out = null; } }
  }
  V.mon.set(key, out); return out;
}
function heroCanvas(heroId, targetH) {
  const key = heroId + '|' + targetH, hit = V.hero.get(key);
  if (hit !== undefined) return hit;
  const sz = { marrow: [110, 180], wick: [100, 160], odile: [100, 185] }[heroId] || [100, 175], ss = 2, sc = (targetH * ss) / sz[1], cw = Math.ceil(sz[0] * sc * 1.5) + 8, ch = Math.ceil(sz[1] * sc * 1.15) + 8, o = mk(cw, ch);
  let out = null;
  if (o) { try { drawHero(o.x, heroId, cw / 2, ch - 6, { scale: sc, t: 0.2 }); out = { c: o.c, w: cw / ss, h: ch / ss, fx: cw / 2 / ss, fy: (ch - 6) / ss }; } catch (e) { out = null; } }
  V.hero.set(key, out); return out;
}
// the actor art for a figure: the hero by its id, an enemy by its id (the_resident_l2 for a Level 2 elite), an NPC by name. An enemy the set does not paint yet
// borrows a figure of the same kind (picked by hash) so the room is never empty; null means draw the procedural figure.
function actorSprite(app, kind, id, run, lvl, alt) {
  if (!assets.ready()) return null;
  if (kind === 'hero') return assets.actor(id, app, alt);
  if (kind === 'npc') return assets.actor(id, app, alt);
  const own = kind === 'elite' && lvl >= 2 && assets.has('actors', id + '_l2') ? id + '_l2' : id;
  if (assets.has('actors', own)) return assets.actor(own, app, alt);
  const pool = assets.kindIds(kind === 'elite' ? 'elite' : 'normal'); if (!pool.length) return null;
  return assets.actor(pool[Math.floor(hash(id) * pool.length)], app, alt);
}
function drawShadow(g, x, y, rw, a) { g.fillStyle = `rgba(0,0,0,${a})`; g.beginPath(); g.ellipse(x, y + 1, rw, rw * 0.38, 0, 0, TAU); g.fill(); }
function drawActor(app, g, r, run) {
  const sz = r.h;
  drawShadow(g, r.x, r.y, sz * 0.3, 0.38);
  if (r.ring) { g.save(); g.strokeStyle = rgba(COL.lamp, 0.7); g.lineWidth = 1.6; g.beginPath(); g.ellipse(r.x, r.y + 1, sz * 0.5, sz * 0.2, 0, 0, TAU); g.stroke(); g.restore(); }
  const lvl = r.lvl;
  if (r.kind === 'elite') { // an aura pulses round an elite: gold at Level 1, red at Level 2
    const pu = 0.5 + 0.5 * Math.sin(r.ph + (r.bob || 0) * 0.4 + Date.now() / 420);
    glowAt(g, r.x, r.y - sz * 0.4, sz * (lvl >= 2 ? 1.0 : 0.8), (lvl >= 2 ? 0.34 : 0.2) + 0.1 * pu, true);
    g.save(); g.strokeStyle = lvl >= 2 ? 'rgba(255,90,100,.75)' : 'rgba(255,210,100,.6)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(r.x, r.y + 1, sz * (0.42 + 0.06 * pu), sz * 0.17, 0, 0, TAU); g.stroke(); g.restore();
  }
  const spr = actorSprite(app, r.kind, r.id, run, lvl, r.frame === 1);
  g.save(); g.translate(r.x, r.y - r.bob); g.scale(r.flip * (1 / Math.max(0.2, r.sq)) * 1, r.sq); if (r.tilt) g.rotate(r.tilt);
  if (r.alpha < 1) g.globalAlpha *= r.alpha;
  if (spr) {
    const d = spr.def, s = sz * (d.scale || 1) / (d.h || 1);
    g.drawImage(spr.img, -(d.anchorX === undefined ? d.w / 2 : d.anchorX) * s, -(d.anchorY === undefined ? d.h : d.anchorY) * s, d.w * s, d.h * s);
  } else {
    const o = r.kind === 'hero' ? heroCanvas(run.hero, sz) : enemyCanvas(r.id, sz);
    if (o) g.drawImage(o.c, -o.fx, -o.fy, o.w, o.h);
    else { // no art at all (headless): a little engraved figure
      g.beginPath(); g.moveTo(-sz * 0.22, 0); g.quadraticCurveTo(-sz * 0.22, -sz * 0.6, 0, -sz * 0.6); g.quadraticCurveTo(sz * 0.22, -sz * 0.6, sz * 0.22, 0); g.closePath(); g.fillStyle = r.kind === 'hero' ? '#c9a227' : r.kind === 'elite' ? '#7A5F12' : '#8e1f2c'; g.fill(); g.strokeStyle = '#2B1E1A'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.arc(0, -sz * 0.76, sz * 0.18, 0, TAU); g.fillStyle = '#d8c9a8'; g.fill(); g.stroke();
    }
  }
  g.restore();
  if (r.kind === 'elite') { // level tag over the head
    const tx = r.x, ty = r.y - sz - 6 - r.bob;
    g.save(); g.fillStyle = lvl >= 2 ? '#8e1f2c' : '#5a4510'; g.strokeStyle = lvl >= 2 ? '#ff8a96' : '#C9A227'; g.lineWidth = 1; g.beginPath(); g.roundRect ? g.roundRect(tx - 9, ty - 6, 18, 12, 3) : g.rect(tx - 9, ty - 6, 18, 12); g.fill(); g.stroke(); g.restore();
    app.text('L' + lvl, tx, ty - 5, { size: 10, ui: true, bold: true, align: 'center', color: '#fff3d0', fixed: true });
  }
}

// ---------------- the room pass ----------------
function drawCandle(app, g, x, y, r, t, calm) {
  const every = WD.everyOf(r), left = r.timers.spawn, full = r.contents.length >= WD.capOf(r);
  const k = full ? 1 : clamp((every - left + 1) / every, 0, 1), hgt = 5 + 9 * k;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(x, y + 1, 6, 2.4, 0, 0, TAU); g.fill();
  g.fillStyle = '#d9c9a0'; g.fillRect(x - 2.5, y - hgt, 5, hgt); g.fillStyle = '#b8a67a'; g.fillRect(x + 0.5, y - hgt, 2, hgt);
  g.strokeStyle = '#2b1e1a'; g.lineWidth = 0.8; g.strokeRect(x - 2.5, y - hgt, 5, hgt);
  const fl = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 9 + x) * Math.sin(t * 5.3 + y);
  glowAt(g, x, y - hgt - 3, 9 * fl, full ? 0.7 : 0.55, true);
  g.fillStyle = full ? '#ff6a5a' : '#ffd060'; g.beginPath(); g.ellipse(x, y - hgt - 2.6, 1.6 * fl, 3.2 * fl, 0, 0, TAU); g.fill();
  g.restore();
  app.text(full ? '!' : String(left), x + 7, y - 11, { size: 11, ui: true, bold: true, color: full ? '#ff9a8a' : '#ffe9a8', stroke: '#1a1210', strokeW: 3, fixed: true });
}
function snuffed(g, x, y, t, calm) { // a cold lantern with a thread of smoke
  g.save(); g.fillStyle = '#1a1614'; g.strokeStyle = '#6a625a'; g.lineWidth = 1; g.beginPath(); g.rect(x - 4, y - 5, 8, 10); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 3, y - 5); g.lineTo(x, y - 9); g.lineTo(x + 3, y - 5); g.stroke();
  g.strokeStyle = 'rgba(190,190,200,.5)'; g.lineWidth = 1.2; g.beginPath();
  for (let i = 0; i <= 8; i++) { const yy = y - 10 - i * 2.4, xx = x + Math.sin(i * 0.9 + (calm ? 0 : t * 2)) * (1 + i * 0.35); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); g.restore();
}
// Back to front: by x + y (then x), the focus rooms (hovered, selected, the hero's) after all the others so a neighbour never hides them.
export function depthOrder(w, focus, out = []) {
  out.length = 0;
  for (let pass = 0; pass < 2; pass++) for (let d = 0; d <= w.w + w.h - 2; d++) for (let x = Math.min(d, w.w - 1); x >= 0 && d - x < w.h; x--) {
    const id = w.grid[d - x][x]; if (!id || id === 'rubble') continue;
    if (!!(focus && focus(id)) === (pass === 1)) out.push(id);
  }
  return out;
}
// A monster wanders inside the floor diamond in grid coordinates (u, v in -0.34..0.34): walks to a spot near its home, stands a while, picks the next.
const HOME = MON_SLOTS.map(([dx, dy]) => [clamp((dx * 2 + dy * 4) / 2, -0.32, 0.32), clamp((dy * 4 - dx * 2) / 2, -0.32, 0.32)]);
function monState(key, i, calm, dt, speed = 0.15) {
  let st = V.act.get(key);
  if (!st) { const h = HOME[i % HOME.length], ph = hash(key) * TAU; st = { u: h[0], v: h[1], hu: h[0], hv: h[1], tu: h[0], tv: h[1], wait: hash(key + 'w') * 2, mv: false, face: i % 2 ? -1 : 1, s: (hash(key + 's') * 4294967295) | 1, ph }; V.act.set(key, st); }
  if (calm) { st.u = st.hu; st.v = st.hv; st.mv = false; return st; }
  const rnd = () => { st.s ^= st.s << 13; st.s ^= st.s >>> 17; st.s ^= st.s << 5; return ((st.s >>> 0) % 10000) / 10000; };
  if (st.wait > 0) { st.wait -= dt; st.mv = false; return st; }
  const du = st.tu - st.u, dv = st.tv - st.v, d = Math.hypot(du, dv);
  if (d < 0.012) { st.wait = 1.2 + rnd() * 3; st.tu = clamp(st.hu + (rnd() - 0.5) * 0.4, -0.34, 0.34); st.tv = clamp(st.hv + (rnd() - 0.5) * 0.4, -0.34, 0.34); st.mv = false; return st; }
  const stp = Math.min(speed * dt, d); st.u += du / d * stp; st.v += dv / d * stp; st.mv = true; if (Math.abs(du - dv) > 0.004) st.face = du - dv >= 0 ? 1 : -1;
  return st;
}
function dust(g, id, c, t) { // a few motes drifting up through the light of each lit room
  for (let i = 0; i < 3; i++) { const q = (t * 0.1 + hash(id + 'd' + i)) % 1, x = c.x + (hash(id + 'x' + i) - 0.5) * TW * 0.7 + Math.sin(q * 6 + i) * 3, y = c.y + TH * 0.1 - q * UP * 0.85; g.fillStyle = `rgba(255,232,176,${Math.sin(q * Math.PI) * 0.4})`; g.beginPath(); g.arc(x, y, 1.1, 0, TAU); g.fill(); }
}
export const lastActors = () => V.list; // tests: what stood where in the last frame
export function drawRooms(host, inter) {
  const { app, run, S, MEM } = host, g = app.ctx, w = run.ward, calm = host.reduced, dt = clamp(S.t - V.lastT, 0, 0.1); V.lastT = S.t;
  const light = lightState(w.phase, S.trans);
  const legalRooms = new Set(inter && inter.legal ? inter.legal.rooms : []), pulse = 0.5 + 0.5 * Math.sin(S.t * 5);
  let n = 0;
  V.list.length = 0;
  const focus = (id) => id === S.hoverRoom || id === S.selRoom || id === w.hero.room; // these rooms are drawn last: never hidden behind a neighbour
  // which rooms must stay visible (focus rooms, rooms with monsters) and which front neighbours cut their walls down to show them
  const tk = V.tk; for (const k in tk) delete tk[k];
  const nRooms = Object.keys(w.rooms).length, dense = nRooms >= 9;
  for (const r of Object.values(w.rooms)) {
    const def0 = ROOMS[r.type], awake = !(!r.on && def0.power > 0), pr = focus(r.id) ? 2 : awake && r.contents.length && r.type !== 'rm_theatre' && (r.contents[0].kind === 'monster' || r.contents[0].kind === 'elite') ? 1 : 0;
    if (!pr) continue;
    for (const [ddx, ddy] of [[1, 0], [0, 1], [1, 1]]) { const oid = w.grid[r.y + ddy] && w.grid[r.y + ddy][r.x + ddx]; if (oid && oid !== 'rubble' && !focus(oid)) tk[oid] = Math.max(tk[oid] || 0, pr); }
  }
  const room = (x, y, id) => {
    const r = w.rooms[id]; if (!r) return;
    const c = cellW(w, x, y), def = ROOMS[r.type], theatre = r.type === 'rm_theatre', dark = !r.on && def.power > 0;
    const hov = S.hoverRoom === id && !app.blocked, sel = S.selRoom === id;
    // hover lift: eases up 6 px
    const lt = (hov || sel) ? 1 : 0, lv = V.lift[id] || 0; V.lift[id] = calm ? lt : lv + (lt - lv) * Math.min(1, dt * 14);
    const st = host.buildAge(MEM.stamps[id], S.t), drop = st < 1 ? (1 - EASE.out(st)) * 70 : 0, lift = V.lift[id] * 6 + drop + (theatre && host.bossOpen && !calm ? Math.sin(S.t * 47) * 0.7 : 0);
    if (MEM.stamps[id] !== undefined && st < 1) V.landed[id] = 0;
    const tp = tk[id] || 0, tKeep = focus(id) ? 1 : tp === 2 ? 0.5 : tp === 1 ? 0.62 : dense ? 0.85 : 1, tFade = tp === 2 ? 0.55 : 1;
    const kv = V.keep[id] === undefined ? tKeep : V.keep[id], fv = V.fadeA[id] === undefined ? tFade : V.fadeA[id];
    const keep = V.keep[id] = calm ? tKeep : kv + (tKeep - kv) * Math.min(1, dt * 7), fade = V.fadeA[id] = calm ? tFade : fv + (tFade - fv) * Math.min(1, dt * 7);
        const alpha = (st < 1 ? clamp(st * 2.5, 0, 1) : 1) * fade;
    const spr = assets.room(r.type, app);
    g.save();
    if (st >= 0.55 && st < 1) { const sq = 1 + 0.06 * Math.sin((st - 0.55) / 0.45 * Math.PI) * (1 - st); g.translate(c.x, c.y); g.scale(1 + (sq - 1) * -0.6, sq); g.translate(-c.x, -c.y); }
    if (spr) {
      let img = spr.img;
      if (dark) { const dk = darkOf(spr); if (dk) img = dk; }
      drawSprite(g, spr, c.x, c.y, lift, alpha, img, keep);
    } else {
      g.globalAlpha *= alpha; drawBlock(g, r.type, c.x, c.y, lift, dark, theatre);
      if (dark) { g.globalAlpha = 0.5; diamond(g, c.x, c.y - lift, TW * FILL / 2, TH * FILL / 2); g.fillStyle = '#0c0a10'; g.fill(); }
    }
    g.restore();
    if (st >= 1 && V.landed[id] === 0) { V.landed[id] = 1; S.fx.burst(c.x, c.y + 6, 'dust', { n: calm ? 3 : 12 }); } // landing puff once the drop-in finishes
    // legal target (upgrade / effect card) and the Theatre's open glow
    if (legalRooms.has(id)) { diamond(g, c.x, c.y - lift, TW * FILL / 2, TH * FILL / 2); g.strokeStyle = rgba('#ffd870', 0.6 + 0.4 * pulse); g.lineWidth = 2.4; g.setLineDash([6, 4]); g.lineDashOffset = -S.t * 18; g.stroke(); g.setLineDash([]); }
    if (theatre && host.bossOpen) { diamond(g, c.x, c.y - lift, TW * FILL / 2, TH * FILL / 2); g.strokeStyle = rgba('#ff5a6a', 0.5 + 0.5 * pulse); g.lineWidth = 2.6; g.stroke(); glowAt(g, c.x, c.y - UP * 0.45, 46, 0.25 + 0.2 * pulse, true); }
    if (sel || hov) { diamond(g, c.x, c.y - lift + 1, TW * FILL / 2 + 1, TH * FILL / 2 + 0.5); g.strokeStyle = sel ? COL.scar : 'rgba(255,240,190,.85)'; g.lineWidth = sel ? 2.6 : 1.6; g.stroke(); }
    // lamps: warm pools in evening and night, cold dark rooms get a snuffed lantern
    if (dark) snuffed(g, c.x - TW * 0.14, c.y - UP * 0.4 - lift, S.t, calm);
    else if (light.glow > 0.02 && !theatre) { const fl = calm ? 1 : 0.9 + 0.1 * Math.sin(S.t * 6 + x * 2.1 + y); host.glows.push(c.x, c.y - UP * 0.36 - lift, light.glow * fl); }
    // spawn timer candle, upgrades, overtime
    const every = WD.everyOf(r);
    if (every && !theatre && !dark && st >= 1) drawCandle(app, g, c.x - TW * 0.3, c.y + TH * 0.12, r, S.t, calm);
    r.upgrades.slice(0, 3).forEach((u, i) => { const bc = BUILD_CARDS[u]; if (!bc) return; const bx = c.x + TW * 0.3 - i * 13, by = c.y + TH * 0.1; g.save(); g.fillStyle = '#f3e9d2'; g.beginPath(); g.arc(bx, by, 6, 0, TAU); g.fill(); g.strokeStyle = '#7A5F12'; g.lineWidth = 1; g.stroke(); K.roomGlyph(g, bc.art, bx, by, 9, K.INK); g.restore(); });
    if (r.overtime) app.text('x2', c.x + TW * 0.36, c.y - TH * 0.2, { size: 11, ui: true, bold: true, align: 'right', color: '#ffe9a8', stroke: '#1a1210', strokeW: 3, fixed: true });
    if (theatre && st >= 1) app.text(host.bossLine(run, false), c.x, c.y - UP - 6, { size: 11, ui: true, bold: true, align: 'center', color: host.bossOpen ? '#ffb3bd' : '#f2d98a', stroke: '#1a1210', strokeW: 3, fit: { w: TW + 20, lines: 1, soft: true } });
    { const rb = roomBox(w, x, y); app.reg('ward-room-' + id, rb.x, rb.y, rb.w, rb.h, { layer: 'world' }); }
    if (!dark && !calm) dust(g, id, c, S.t);
    if (theatre && host.bossOpen && !calm && ((S.t * 2) | 0) !== V.rum) { V.rum = (S.t * 2) | 0; const sp = toScreen(c.x, c.y + 6); S.fx.burst(sp.x, sp.y, 'dust', { n: 3 }); }
    // collect the actors that stand in this room
    if (dark || st < 1 || !r.contents.length || theatre) { V.cnt[id] = r.contents.length; return; }
    const k0 = r.contents[0].kind;
    if (k0 === 'monster') {
      const cnt = Math.min(5, r.contents.length), popAt = MEM.pops[id], prev = V.cnt[id];
      for (let i = 0; i < cnt; i++) {
        const key = id + '#' + i, e = r.contents[i], st2 = monState(key, i, calm, dt), rec = poolRec(n++); V.list.push(rec);
        if (prev !== undefined && cnt > prev && i >= prev) { V.born[key] = S.t; const sp0 = toScreen(c.x + (st2.u - st2.v) * TW / 2, c.y + (st2.u + st2.v) * TH / 2); S.fx.burst(sp0.x, sp0.y, 'dust', { n: calm ? 3 : 10 }); } // spawn-in puff
        const born = V.born[key] || 0, ph = st2.ph;
        rec.kind = 'monster'; rec.id = e.id; rec.x = c.x + (st2.u - st2.v) * TW / 2; rec.y = c.y + (st2.u + st2.v) * TH / 2; rec.h = 30; rec.ph = ph; rec.lvl = 0; rec.ring = 0;
        rec.flip = st2.face;
        if (calm) { rec.bob = 0; rec.sq = 1; rec.tilt = 0; rec.frame = 0; }
        else if (st2.mv) { rec.frame = Math.floor(S.t * 7 + ph) % 2; rec.bob = Math.abs(Math.sin(S.t * 7 + ph)) * 2.4; rec.sq = 1 + 0.03 * Math.sin(S.t * 14 + ph); rec.tilt = (rec.frame ? 1 : -1) * 0.03; }
        else { rec.frame = 0; rec.bob = Math.abs(Math.sin(S.t * 1.8 + ph)) * 0.8; rec.sq = ((S.t * 0.9 + ph) % 4.3) < 0.13 ? 0.86 : 1 + 0.02 * Math.sin(S.t * 2.6 + ph); rec.tilt = Math.sin(S.t * 1.4 + ph) * 0.035; } // idle: breathe, blink, sway
        rec.alpha = born && S.t - born < 0.35 ? clamp((S.t - born) / 0.35, 0, 1) : 1;
        if (popAt !== undefined && S.t < popAt && i === cnt - 1) rec.alpha = 0;
      }
    } else if (k0 === 'elite') {
      const e = r.contents[0], rec = poolRec(n++), ph = hash(id) * TAU, st2 = monState(id + '#e', 2, calm, dt, 0.18); V.list.push(rec);
      rec.kind = 'elite'; rec.id = e.id; rec.lvl = e.level || 1; rec.h = e.level >= 2 ? 46 : 42; rec.ph = ph;
      rec.x = c.x + (st2.u - st2.v) * TW / 2; rec.y = c.y + (st2.u + st2.v) * TH / 2; rec.flip = st2.face; rec.alpha = 1; rec.ring = 0;
      if (calm) { rec.bob = 0; rec.sq = 1; rec.tilt = 0; rec.frame = 0; }
      else if (st2.mv) { rec.frame = Math.floor(S.t * 5 + ph) % 2; rec.bob = Math.abs(Math.sin(S.t * 5 + ph)) * 2.8; rec.sq = 1 + 0.025 * Math.sin(S.t * 10); rec.tilt = (rec.frame ? 1 : -1) * 0.025; }
      else { rec.frame = 0; rec.bob = (0.5 + 0.5 * Math.sin(S.t * 2.2 + ph)) * 1.4; rec.sq = 1 + 0.03 * Math.sin(S.t * 3.2 + ph); rec.tilt = 0; }
    } else { // event / shop / forge / rest: a floating token over the floor
      const rec = poolRec(n++); V.list.push(rec);
      rec.kind = 'token'; rec.id = k0; rec.x = c.x + (k0 === 'event' ? 0 : TW * 0.2); rec.y = c.y - TH * 0.02; rec.h = 22; rec.ph = hash(id) * TAU; rec.bob = calm ? 0 : Math.sin(S.t * 2 + rec.ph) * 2.5; rec.alpha = 1; rec.flip = 1; rec.sq = 1; rec.lvl = 0; rec.frame = 0; rec.tilt = 0; rec.ring = 0; rec.data = r.contents.length;
    }
    V.cnt[id] = r.contents.length;
    };
  for (const id of depthOrder(w, focus, V.order)) { const r = w.rooms[id]; if (r) room(r.x, r.y, id); }
  // the hero: walks cell to cell with the walk animation, otherwise breathes in its room
  const hr = heroRec(host, n++); V.list.push(hr);
  V.list.sort(byY);
  for (let i = 0; i < V.list.length; i++) { const r = V.list[i]; if (r.kind === 'token') drawToken(app, g, r, S.t); else drawActor(app, g, r, run); }
  return hr;
}
const byY = (a, b) => a.y - b.y;
function drawToken(app, g, r, t) {
  const y = r.y - 18 - r.bob;
  glowAt(g, r.x, y, 20, 0.35, true);
  if (r.id === 'event') drawEventSeal(g, r.x, y, 11, true, false);
  else { g.save(); g.fillStyle = r.id === 'shop' ? '#5a8fd8' : r.id === 'forge' ? '#E8571F' : '#6a9a6a'; g.beginPath(); g.arc(r.x, y, 9, 0, TAU); g.fill(); g.strokeStyle = '#2B1E1A'; g.lineWidth = 1.2; g.stroke(); g.strokeStyle = '#fff6e0'; g.lineWidth = 2; g.beginPath(); g.moveTo(r.x - 4, y); g.lineTo(r.x - 1, y + 3); g.lineTo(r.x + 5, y - 4); g.stroke(); g.restore(); }
  if (r.id === 'event' && r.data > 1) app.text('x' + r.data, r.x + 12, y - 4, { size: 11, ui: true, bold: true, color: '#9fe0d6', stroke: '#1a1210', strokeW: 3, fixed: true });
}
function heroRec(host, n) {
  const { app, run, S } = host, w = run.ward, rec = poolRec(n), wk = S.walk, calm = host.reduced;
  let pos = cellW(w, ...hxy(w, w.hero.room)), moving = false, kk = 0, dx = 0;
  if (wk) {
    const a = cellW(w, ...hxy(w, wk.cells[wk.i])), b = cellW(w, ...hxy(w, wk.cells[Math.min(wk.i + 1, wk.cells.length - 1)]));
    kk = wk.i < wk.stop ? EASE.inOut(clamp(wk.t / host.stepS, 0, 1)) : 0; moving = wk.i < wk.stop;
    pos = { x: lerp(a.x, b.x, kk), y: lerp(a.y, b.y, kk) }; dx = b.x - a.x; if (moving && Math.abs(dx) > 1) V.faceHero = dx > 0 ? 1 : -1;
  }
  rec.kind = 'hero'; rec.id = run.hero; rec.h = 44; rec.ph = 0; rec.lvl = 0; rec.alpha = 1; rec.data = null;
  rec.x = pos.x + (moving ? 0 : TW * 0.03); rec.y = pos.y + TH * 0.04; rec.flip = V.faceHero;
  if (moving) { rec.frame = calm ? 0 : Math.floor(S.t * 9) % 2; rec.bob = Math.abs(Math.sin(kk * Math.PI * 2)) * 4; rec.sq = 1 - 0.07 * Math.abs(Math.sin(kk * Math.PI * 2 + 0.6)); rec.tilt = (rec.frame ? 1 : -1) * 0.05; }
  else { rec.frame = 0; rec.bob = calm ? 0 : (0.5 + 0.5 * Math.sin(S.t * 2.2)) * 1.1; rec.sq = calm ? 1 : 1 + 0.02 * Math.sin(S.t * 2.2); rec.tilt = 0; }
  if (moving && !calm) { const f = Math.floor(S.t * 9); if (f !== V.hf) { V.hf = f; const sp = toScreen(rec.x, rec.y); S.fx.burst(sp.x, sp.y, 'dust', { n: 2 }); } } // footstep dust
  rec.ring = 1; rec.moving = moving;
  return rec;
}
const hxy = (w, rid) => { const r = w.rooms[rid]; return r ? [r.x, r.y] : [0, 0]; };

// ---------------- lighting over the whole map ----------------
const motes = V.motes;
export function drawLight(host) {
  const { app, run, S } = host, g = app.ctx, w = run.ward, L = lightState(w.phase, S.trans), calm = host.reduced;
  // multiply tint over the map panel (the plinth, the rooms, the actors)
  if (L.a > 0.005) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(${L.r | 0},${L.g | 0},${L.b | 0},${L.a})`; app.rr(MAPR.x, MAPR.y, MAPR.w, MAPR.h, 6); g.fill(); g.restore(); }
  else if (w.phase === 'midday' && !S.trans) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,238,200,.05)'; app.rr(MAPR.x, MAPR.y, MAPR.w, MAPR.h, 6); g.fill(); g.restore(); }
  // lamp pools of lit rooms (after the multiply, so they glow through the dusk)
  const gl = host.glows;
  camBegin(app);
  for (let i = 0; i < gl.length; i += 3) { glowAt(g, gl[i], gl[i + 1], 40, gl[i + 2] * 0.26, true); }
  camEnd(app);
  gl.length = 0;
  // moonlight from the top right at night
  if (L.moon > 0.02) { g.save(); app.rr(MAPR.x, MAPR.y, MAPR.w, MAPR.h, 6); g.clip(); const mg = g.createRadialGradient(MAPR.x + MAPR.w - 60, MAPR.y + 30, 8, MAPR.x + MAPR.w - 60, MAPR.y + 30, 330); mg.addColorStop(0, `rgba(190,214,255,${0.22 * L.moon})`); mg.addColorStop(1, 'rgba(190,214,255,0)'); g.fillStyle = mg; g.fillRect(MAPR.x, MAPR.y, MAPR.w, MAPR.h); g.restore(); }
  // ambient motes: dust in the day, drifting embers and fireflies at dusk (none with reduced motion)
  if (!calm) {
    if (!V.motesInit) { for (let i = 0; i < 30; i++) { motes[i * 5] = MAPR.x + hash('mx' + i) * MAPR.w; motes[i * 5 + 1] = MAPR.y + hash('my' + i) * MAPR.h; motes[i * 5 + 2] = 3 + hash('mv' + i) * 6; motes[i * 5 + 3] = hash('mp' + i) * TAU; motes[i * 5 + 4] = 0.6 + hash('ms' + i); } V.motesInit = true; }
    const dtt = clamp(S.t - (V.moteT || S.t), 0, 0.1); V.moteT = S.t;
    g.save(); g.globalCompositeOperation = 'lighter';
    const warm = L.moon < 0.5;
    for (let i = 0; i < 30; i++) {
      const o = i * 5; motes[o + 1] -= motes[o + 2] * dtt * 0.6; motes[o] += Math.sin(S.t * 0.5 + motes[o + 3]) * 4 * dtt;
      if (motes[o + 1] < MAPR.y + 20) { motes[o + 1] = MAPR.y + MAPR.h - 30; motes[o] = MAPR.x + hash('mr' + i + (S.t | 0)) * MAPR.w; }
      const tw = 0.5 + 0.5 * Math.sin(S.t * (1.2 + motes[o + 4]) + motes[o + 3]);
      g.fillStyle = warm ? `rgba(255,232,170,${0.1 + 0.25 * tw})` : `rgba(160,230,200,${0.15 + 0.5 * tw})`;
      g.beginPath(); g.arc(motes[o], motes[o + 1], warm ? 1.1 : 1.5, 0, TAU); g.fill();
    }
    g.restore();
  }
}

// ---------------- the walk preview: a stitched, glowing thread across the floors ----------------
export function drawThread(host, path, dest, curP) {
  const { app, run, S } = host, g = app.ctx, w = run.ward, calm = host.reduced;
  const pts = path.map((rid) => { const r = w.rooms[rid]; return r ? cellW(w, r.x, r.y) : cellW(w, 0, 0); });
  camBegin(app);
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  if (pts.length > 1) {
    const trace = (dy) => { g.beginPath(); pts.forEach((p, i) => { const y = p.y + dy; if (!i) { g.moveTo(p.x, y); return; } const q = pts[i - 1], mx = (p.x + q.x) / 2, my = (y + q.y + dy) / 2 + 3; g.quadraticCurveTo(mx, my, p.x, y); }); };
    trace(0.5); g.strokeStyle = 'rgba(255,90,70,.22)'; g.lineWidth = 9; g.stroke();
    trace(0.5); g.strokeStyle = 'rgba(255,120,96,.35)'; g.lineWidth = 5; g.stroke();
    trace(0); g.strokeStyle = '#ff5a4a'; g.lineWidth = 2.6; g.setLineDash([7, 4]); g.lineDashOffset = calm ? 0 : -S.t * 22; g.stroke(); g.setLineDash([]);
    trace(0); g.strokeStyle = 'rgba(255,230,210,.9)'; g.lineWidth = 0.9; g.setLineDash([2, 9]); g.lineDashOffset = calm ? 0 : -S.t * 22; g.stroke(); g.setLineDash([]);
    pts.slice(1).forEach((p, i) => { // needle holes and the step number on the floor
      g.fillStyle = '#ff5a4a'; g.beginPath(); g.ellipse(p.x, p.y, 4.5, 2.4, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(20,10,10,.8)'; g.beginPath(); g.arc(p.x, p.y + 12, 7, 0, TAU); g.fill(); g.strokeStyle = '#ff9a8a'; g.lineWidth = 1; g.stroke();
      app.text(String(i + 1), p.x, p.y + 6, { size: 11, ui: true, bold: true, align: 'center', color: '#ffe6d8', fixed: true });
    });
  }
  const dr = w.rooms[dest], dp = dr ? cellW(w, dr.x, dr.y) : null;
  if (dp) { const k = calm ? 0 : Math.sin(S.t * 4) * 2; g.strokeStyle = '#ff5a4a'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.ellipse(dp.x, dp.y, TW * 0.4 + k, TH * 0.4 + k * 0.5, 0, 0, TAU); g.stroke(); g.setLineDash([]); }
  g.restore();
  // trigger seals float above the rooms they fire in
  const p = curP || WD.pathTo(run, dest, 0);
  let n = 0;
  for (const t of p.triggers || []) {
    const r = w.rooms[t.room]; if (!r) continue;
    const c = cellW(w, r.x, r.y), sx = c.x + 2, sy = c.y - TH * 0.5 - 12;
    g.save(); g.fillStyle = t.bribed ? '#6a625a' : '#1f1914'; g.beginPath(); g.arc(sx, sy, 14, 0, TAU); g.fill(); g.strokeStyle = t.bribed ? '#9a9088' : COL.scar; g.lineWidth = 1.4; g.stroke(); g.restore();
    drawNodeIcon(g, host.TRIG[t.kind] ? host.TRIG[t.kind][0] : 'event', sx, sy, 24, t.bribed ? 'locked' : 'available');
    if (!t.bribed) n++;
    g.save(); g.fillStyle = t.bribed ? '#6a625a' : COL.scar; g.beginPath(); g.arc(sx - 13, sy - 12, 8, 0, TAU); g.fill(); g.strokeStyle = '#f3e9d2'; g.lineWidth = 1.2; g.stroke(); g.restore();
    app.text(t.bribed ? '-' : String(n), sx - 13, sy - 18, { size: 11, ui: true, bold: true, align: 'center', color: '#fff3e0', fixed: true });
  }
  camEnd(app);
}

// ---------------- overlays: the ghost of the room being dragged, the keyboard focus ring ----------------
export function drawGhost(host, inter) {
  const { app, run, S } = host, g = app.ctx, w = run.ward;
  if (!S.drag || !inter.hoverCell || !inter.drop) return;
  const card = BUILD_CARDS[(w.deck.hand.find((h) => h.uid === S.drag.uid) || {}).id];
  if (!card || card.kind !== 'room') return;
  const x = inter.hoverCell.x, y = inter.hoverCell.y; if (w.grid[y][x]) return;
  const c = cellW(w, x, y), spr = assets.room(card.room, app);
  g.save(); g.globalAlpha = inter.drop.ok ? 0.62 : 0.3;
  if (spr) drawSprite(g, spr, c.x, c.y, 0, 1); else drawBlock(g, card.room, c.x, c.y, 0, false, false);
  if (!inter.drop.ok) { g.globalAlpha = 0.5; diamond(g, c.x, c.y, TW / 2, TH / 2); g.fillStyle = '#a3142f'; g.fill(); }
  g.restore();
}
export function drawFocus(host, cellX, cellY) {
  const { app, S } = host, g = app.ctx, c = cellW(S.run.ward, cellX, cellY);
  camBegin(app);
  g.save(); g.lineWidth = 3.2; g.strokeStyle = '#ffffff'; diamond(g, c.x, c.y, TW / 2, TH / 2); g.stroke();
  g.setLineDash([7, 5]); g.lineDashOffset = -S.t * 20; g.strokeStyle = COL.scar; diamond(g, c.x, c.y, TW / 2, TH / 2); g.stroke(); g.restore();
  camEnd(app);
}
// the whole world layer in the camera: ground, rooms and actors, the ghost of a dragged room
export function drawWorld(host, inter) {
  camBegin(host.app);
  drawGround(host, inter);
  const hr = drawRooms(host, inter);
  drawGhost(host, inter);
  camEnd(host.app);
  return hr;
}
export const pending = (host) => assets.state === 'loading' || (assets.ready() && assets.progress().loaded < assets.progress().total);
export function drawLoading(host) {
  const { app, S, run } = host, g = app.ctx, w = run.ward;
  const th = Object.values(w.rooms).find((r) => r.type === 'rm_theatre');
  if (th) { // an arrow at the panel edge when the Theatre is out of view
    const c = cellC(w, th.x, th.y);
    if (!(c.x > MAPR.x + 24 && c.x < MAPR.x + MAPR.w - 24 && c.y > MAPR.y + 30 && c.y < MAPR.y + MAPR.h - 14)) {
      const ex = clamp(c.x, MAPR.x + 54, MAPR.x + MAPR.w - 54), ey = clamp(c.y, MAPR.y + 40, MAPR.y + MAPR.h - 22), ang = Math.atan2(c.y - MCY, c.x - MCX);
      g.save(); g.fillStyle = 'rgba(40,10,14,.88)'; app.rr(ex - 46, ey - 11, 92, 22, 8); g.fill(); g.strokeStyle = '#ff8a96'; g.lineWidth = 1; g.stroke();
      g.restore();
      app.text('Theatre ' + (Math.cos(ang) > 0.3 ? '>' : Math.cos(ang) < -0.3 ? '<' : Math.sin(ang) > 0 ? 'v' : '^'), ex, ey - 7, { size: 11, ui: true, bold: true, align: 'center', color: '#ffb3bd', fixed: true });
    }
  }
  if (!assets.available() || assets.state === 'none' || !assets.ready()) { if (assets.state !== 'loading') return; }
  const p = assets.progress(); if (assets.state === 'ready' && p.loaded >= p.total) return;
  const x = MAPR.x + MAPR.w - 118, y = MAPR.y + 8, bw = 108;
  g.save(); g.fillStyle = 'rgba(14,11,10,.8)'; app.rr(x, y, bw, 22, 6); g.fill();
  const k = p.total ? p.loaded / p.total : 0.1 + 0.1 * Math.sin(S.t * 3);
  g.fillStyle = COL.lamp; app.rr(x + 4, y + 16, (bw - 8) * clamp(k, 0.04, 1), 3, 1.5); g.fill(); g.restore();
  app.text('Stitching rooms', x + bw / 2, y + 2, { size: 11, ui: true, align: 'center', color: 'rgba(232,220,196,.85)', fixed: true });
}
