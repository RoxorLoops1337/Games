// Far parallax skyline: every species has its own landmarks on the horizon (ferris wheel, windmill, flower field,
// storm city, dream castle, radio towers, giant fruit, fortress, ice palace, haunted manor), drawn between the
// sky and the hills. The sprite is baked once per world and slides a few pixels against the duo for depth;
// a handful of cheap animated bits (spinning wheel, blades, drifting airship, blinking beacons) sit on top.
import { W, LINE_Y, skinFor, isBossStage } from './sim.js';
import { mix } from './art_draw.js';
import { WORLDS, skyGrade } from './bg_world.js';

const TAU = Math.PI * 2;
export const FAR_MARGIN = 34, FAR_W = W + FAR_MARGIN * 2, FAR_H = 360, FAR_HY = 230, FAR_TOP = LINE_Y - 300 - FAR_HY, FAR_SC = 1.2;   // landmarks are drawn 1.2x around the sprite centre
function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const M = FAR_MARGIN;

// the landmark kinds per species; piggy shares the love town
export const FAR_KIND = { love: 'fair', piggy: 'fair', rust: 'farm', sneezy: 'bloom', grumpy: 'storm', sleepy: 'dream', disco: 'radio', sour: 'fruit', mighty: 'fort', frosty: 'palace', gloomy: 'manor' };
export const farKind = skin => FAR_KIND[skin] || 'fair';
// where the animated bits live (sprite coordinates, x already includes the margin)
const WHEEL = { x: M + 470, y: FAR_HY - 78, r: 62 }, MILL = { x: M + 150, y: FAR_HY - 118, len: 52 };

let REC = null;   // while baking: every window rectangle, so kills can light them up later
const WINS = new Map();
function win(c, x, y, w, h, on) { if (REC) REC.push(x, y, w, h); const f = c.fillStyle; c.fillStyle = `rgba(255,233,168,${on})`; c.fillRect(x, y, w, h); c.fillStyle = f; }
function tower(c, x, w, h, hy, roof) {
  c.fillRect(x, hy - h, w, h + 2);
  if (roof === 'tri') { c.beginPath(); c.moveTo(x - 4, hy - h); c.lineTo(x + w / 2, hy - h - w * 0.9); c.lineTo(x + w + 4, hy - h); c.fill(); }
  else if (roof === 'dome') { c.beginPath(); c.ellipse(x + w / 2, hy - h, w * 0.62, w * 0.7, 0, Math.PI, 0); c.fill(); c.fillRect(x + w / 2 - 1.5, hy - h - w * 0.7 - 16, 3, 16); }
  else if (roof === 'crenel') { for (let i = 0; i < 4; i++) c.fillRect(x - 2 + i * (w + 4) / 3.4, hy - h - 9, (w + 4) / 6, 10); }
  else if (roof === 'needle') { c.beginPath(); c.moveTo(x + 2, hy - h); c.lineTo(x + w / 2, hy - h - w * 1.9); c.lineTo(x + w - 2, hy - h); c.fill(); }
}

function paintKind(c, kind, X) {
  const { hy, col, lite, on, r } = X;
  c.fillStyle = col;
  switch (kind) {
    case 'fair': {   // candy town with heart-topped spires and a big ferris wheel
      for (const [x, w, h] of [[M + 20, 36, 70], [M + 76, 28, 104], [M + 120, 40, 60], [M + 250, 34, 92], [M + 300, 28, 66], [M + 548, 34, 84], [M + 600, 30, 58]]) {
        tower(c, x, w, h, hy, 'tri');
        c.save(); c.translate(x + w / 2, hy - h - w * 0.9 - 7); c.scale(8, 8); c.beginPath(); c.moveTo(0, 0.7); c.bezierCurveTo(-1.2, -0.1, -0.7, -0.9, 0, -0.35); c.bezierCurveTo(0.7, -0.9, 1.2, -0.1, 0, 0.7); c.fill(); c.restore();
        for (let k = 0; k < 3; k++) win(c, x + 6 + (k % 2) * 14, hy - h + 12 + k * 17, 5, 7, on * (r() < 0.6 ? 1 : 0.2));
      }
      c.fillRect(WHEEL.x - 26, hy - 4, 8, 4); c.beginPath(); c.moveTo(WHEEL.x - 44, hy); c.lineTo(WHEEL.x, WHEEL.y); c.lineTo(WHEEL.x + 44, hy); c.lineTo(WHEEL.x + 36, hy); c.lineTo(WHEEL.x, WHEEL.y + 12); c.lineTo(WHEEL.x - 36, hy); c.fill();
      break;
    }
    case 'farm': {   // windmill on a ridge, a silo with a dome, a water tower and fence posts
      c.beginPath(); c.moveTo(MILL.x - 20, hy); c.lineTo(MILL.x - 9, MILL.y); c.lineTo(MILL.x + 9, MILL.y); c.lineTo(MILL.x + 20, hy); c.fill();
      c.beginPath(); c.moveTo(MILL.x - 12, MILL.y); c.lineTo(MILL.x, MILL.y - 18); c.lineTo(MILL.x + 12, MILL.y); c.fill();
      tower(c, M + 290, 34, 96, hy, 'dome'); tower(c, M + 336, 28, 76, hy, 'dome');
      c.fillRect(M + 520, hy - 92, 44, 26); c.fillRect(M + 526, hy - 66, 4, 66); c.fillRect(M + 554, hy - 66, 4, 66); c.beginPath(); c.moveTo(M + 516, hy - 92); c.lineTo(M + 542, hy - 112); c.lineTo(M + 568, hy - 92); c.fill();
      for (let x = M + 380; x < M + 500; x += 18) c.fillRect(x, hy - 26, 3, 26);
      c.fillRect(M + 380, hy - 20, 120, 3); c.fillRect(M + 380, hy - 10, 120, 3);
      for (let x = M + 600; x < M + 700; x += 22) c.fillRect(x, hy - 24, 3, 24);
      break;
    }
    case 'bloom': {   // giant tulips, daisies and a mushroom cottage
      for (let i = 0; i < 9; i++) {
        const x = M + 20 + i * 78 + r() * 24, h = 70 + r() * 90, kind = i % 3;
        c.fillRect(x - 1.8, hy - h, 3.6, h + 2);
        c.beginPath(); c.ellipse(x - 12, hy - h * 0.4, 12, 5, -0.5, 0, TAU); c.fill();
        if (kind === 0) { c.beginPath(); c.moveTo(x - 14, hy - h); c.quadraticCurveTo(x - 16, hy - h - 26, x - 7, hy - h - 30); c.lineTo(x, hy - h - 16); c.lineTo(x + 7, hy - h - 30); c.quadraticCurveTo(x + 16, hy - h - 26, x + 14, hy - h); c.quadraticCurveTo(x, hy - h + 10, x - 14, hy - h); c.fill(); }
        else if (kind === 1) { for (let a = 0; a < 8; a++) { c.beginPath(); c.ellipse(x + Math.cos(a / 8 * TAU) * 14, hy - h + Math.sin(a / 8 * TAU) * 14, 9, 4.5, a / 8 * TAU, 0, TAU); c.fill(); } c.beginPath(); c.arc(x, hy - h, 7, 0, TAU); c.fill(); }
        else { c.beginPath(); c.ellipse(x, hy - h, 24, 17, 0, Math.PI, 0); c.fill(); c.fillRect(x - 6, hy - h, 12, 14); win(c, x - 11, hy - h - 9, 5, 5, on); win(c, x + 5, hy - h - 6, 4, 4, on); }
      }
      break;
    }
    case 'storm': {   // wet city: blocky towers with antennae, a crane, lit windows
      let x = M - 10, i = 0;
      while (x < FAR_W - 10) {
        const w = 30 + r() * 34, h = 70 + r() * 150; c.fillStyle = col; c.fillRect(x, hy - h, w, h + 2);
        if (i % 3 === 0) { c.fillRect(x + w / 2 - 1.2, hy - h - 34, 2.4, 34); }
        if (i % 4 === 1) { c.fillRect(x + 4, hy - h - 7, w - 8, 8); }
        for (let yy = hy - h + 10; yy < hy - 8; yy += 13) for (let xx = x + 5; xx < x + w - 6; xx += 10) if (r() < 0.38) win(c, xx, yy, 4, 6, on * (0.4 + r() * 0.6));
        x += w + 3 + r() * 6; i++;
      }
      c.fillStyle = col; c.fillRect(M + 520, hy - 250, 5, 110); c.fillRect(M + 460, hy - 250, 110, 5); c.fillRect(M + 562, hy - 250, 2, 40);
      break;
    }
    case 'dream': {   // onion-dome castle, crescent flags and a sleepy cloud bank
      for (const [x, w, h, rf] of [[M + 250, 40, 150, 'dome'], [M + 312, 34, 190, 'needle'], [M + 372, 44, 130, 'dome'], [M + 180, 34, 100, 'needle'], [M + 430, 32, 84, 'tri']]) { tower(c, x, w, h, hy, rf); win(c, x + w / 2 - 2, hy - h + 22, 4, 8, on); win(c, x + w / 2 - 2, hy - h + 44, 4, 8, on * 0.6); }
      c.fillRect(M + 196, hy - 70, 250, 74);
      c.beginPath(); c.arc(M + 322, hy - 70, 16, Math.PI, 0); c.fill();
      for (const [x, y, s] of [[M + 60, 18, 30], [M + 90, 6, 40], [M + 640, 22, 34]]) { c.globalAlpha = 0.6; c.beginPath(); c.arc(x, hy - y, s, 0, TAU); c.arc(x + s * 1.1, hy - y + 4, s * 0.8, 0, TAU); c.fill(); c.globalAlpha = 1; }
      break;
    }
    case 'radio': {   // far towers with neon tops and a lattice radio mast
      for (const [x, w, h] of [[M + 14, 48, 170], [M + 100, 38, 120], [M + 206, 54, 210], [M + 330, 40, 140], [M + 470, 52, 190], [M + 560, 40, 130], [M + 620, 44, 164]]) {
        c.fillStyle = col; c.fillRect(x, hy - h, w, h + 2);
        for (let yy = hy - h + 8; yy < hy - 8; yy += 11) for (let xx = x + 5; xx < x + w - 5; xx += 9) if (r() < 0.3) win(c, xx, yy, 3, 5, on * 0.9);
      }
      c.fillStyle = col; c.beginPath(); c.moveTo(M + 405, hy); c.lineTo(M + 418, hy - 230); c.lineTo(M + 424, hy - 230); c.lineTo(M + 437, hy); c.lineTo(M + 430, hy); c.lineTo(M + 421, hy - 150); c.lineTo(M + 412, hy); c.fill();
      for (let k = 0; k < 6; k++) c.fillRect(M + 411 + k * 0.6, hy - 40 - k * 32, 20 - k * 2.4, 2);
      break;
    }
    case 'fruit': {   // giant fruit, lollipop trees and a citrus wheel half buried in the hills
      for (let i = 0; i < 7; i++) {
        const x = M + 40 + i * 100 + r() * 30, s = 26 + r() * 22, h = 50 + r() * 60;
        c.fillRect(x - 2.5, hy - h, 5, h + 2);
        c.beginPath(); c.arc(x, hy - h, s, 0, TAU); c.fill();
        c.fillStyle = lite; c.globalAlpha = 0.5 * (0.5 + on * 0.5); c.beginPath(); c.arc(x - s * 0.3, hy - h - s * 0.3, s * 0.22, 0, TAU); c.fill(); c.globalAlpha = 1; c.fillStyle = col;
      }
      c.beginPath(); c.arc(M + 560, hy + 10, 86, Math.PI, 0); c.fill();
      c.strokeStyle = lite; c.globalAlpha = 0.22; c.lineWidth = 2.5; for (let a = 0; a < 7; a++) { c.beginPath(); c.moveTo(M + 560, hy + 10); c.lineTo(M + 560 + Math.cos(Math.PI + a / 6 * Math.PI) * 78, hy + 10 + Math.sin(Math.PI + a / 6 * Math.PI) * 78); c.stroke(); } c.globalAlpha = 1;
      break;
    }
    case 'fort': {   // stone fortress with crenellated towers and a banner
      c.fillRect(M + 150, hy - 80, 400, 84);
      for (const [x, w, h] of [[M + 130, 52, 150], [M + 330, 60, 190], [M + 520, 52, 140]]) { tower(c, x, w, h, hy, 'crenel'); win(c, x + w / 2 - 2, hy - h + 26, 4, 10, on); }
      for (let x = M + 190; x < M + 520; x += 20) if (x < M + 320 || x > M + 392) c.fillRect(x, hy - 92, 11, 14);
      c.fillRect(M + 359, hy - 252, 2.4, 64); c.beginPath(); c.moveTo(M + 361, hy - 250); c.lineTo(M + 394, hy - 240); c.lineTo(M + 361, hy - 230); c.fill();
      c.beginPath(); c.arc(M + 360, hy, 22, Math.PI, 0); c.fillStyle = mix(col, '#000000', 0.45); c.fill(); c.fillStyle = col;
      break;
    }
    case 'palace': {   // ice palace with crystal spires and a few igloos
      for (const [x, w, h] of [[M + 230, 30, 120], [M + 280, 36, 190], [M + 336, 28, 140], [M + 380, 40, 100], [M + 196, 28, 76]]) { tower(c, x, w, h, hy, 'needle'); win(c, x + w / 2 - 2, hy - h + 20, 4, 9, on * 0.8); }
      c.fillRect(M + 196, hy - 64, 224, 68);
      for (const x of [M + 500, M + 580, M + 70]) { c.beginPath(); c.arc(x, hy, 34, Math.PI, 0); c.fill(); c.fillStyle = mix(col, '#000000', 0.4); c.fillRect(x - 8, hy - 14, 16, 14); c.fillStyle = col; }
      c.strokeStyle = lite; c.globalAlpha = 0.3; c.lineWidth = 2; c.beginPath(); c.moveTo(M + 298, hy - 190 - 70); c.lineTo(M + 298, hy - 100); c.stroke(); c.globalAlpha = 1;
      break;
    }
    case 'manor': {   // haunted manor with a clock tower, bare tree and blinking windows
      c.fillRect(M + 180, hy - 100, 280, 104);
      for (const [x, w, h, rf] of [[M + 170, 44, 150, 'needle'], [M + 300, 56, 220, 'tri'], [M + 420, 44, 140, 'needle']]) tower(c, x, w, h, hy, rf);
      c.beginPath(); c.arc(M + 328, hy - 190, 14, 0, TAU); c.fillStyle = mix(col, '#000000', 0.5); c.fill(); c.fillStyle = col;
      for (let i = 0; i < 6; i++) win(c, M + 196 + i * 42, hy - 78 + (i % 2) * 22, 8, 12, on * (r() < 0.55 ? 1 : 0.15));
      c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = 6; c.beginPath(); c.moveTo(M + 560, hy); c.lineTo(M + 566, hy - 90); c.stroke();
      c.lineWidth = 3; for (const [dx, dy, ex, ey] of [[566, 70, 600, 130], [566, 60, 530, 120], [564, 40, 596, 80], [566, 80, 540, 90]]) { c.beginPath(); c.moveTo(M + 566, hy - dy); c.lineTo(M + ex + 0, hy - ey + 20); c.stroke(); }
      break;
    }
  }
}

// bake the static sprite for one world; the cache key carries the sky grade so night stages get darker silhouettes
export function bakeFar(b, skin, boss, stage, key) {
  REC = key ? [] : null;
  const w = WORLDS[skin] || WORLDS.love, gr = skyGrade(stage), kind = farKind(skin);
  let col = mix(mix(w.far, w.bot, 0.3), '#050212', Math.min(0.7, gr.k * 0.5));
  if (boss) col = mix(col, '#12020c', 0.5);
  const lite = mix(w.bot, '#ffffff', 0.5), on = Math.min(1, 0.22 + gr.k * 0.9) * (boss ? 0.7 : 1);
  b.translate(-FAR_W / 2, -FAR_H / 2);
  const hy = FAR_HY, r = rnd(31 + stage * 7 + kind.length);
  // a haze glow on the horizon behind the silhouettes so they sit in the air, not on a sticker
  const hz = b.createLinearGradient(0, hy - 150, 0, hy + 10); hz.addColorStop(0, mix(w.bot, '#ffffff', 0.4) + '00'); hz.addColorStop(1, mix(w.bot, '#ffffff', 0.4) + (boss ? '26' : '3a'));
  b.fillStyle = hz; b.fillRect(0, hy - 150, FAR_W, 160);
  b.fillStyle = col; b.beginPath(); b.moveTo(0, FAR_H);
  for (let x = 0; x <= FAR_W; x += 20) b.lineTo(x, hy + 2 + Math.sin(x * 0.011 + stage) * 7 + Math.sin(x * 0.03) * 3);
  b.lineTo(FAR_W, FAR_H); b.closePath(); b.fill();
  b.save(); b.translate(FAR_W / 2, hy); b.scale(FAR_SC, FAR_SC); b.translate(-FAR_W / 2, -hy);
  paintKind(b, kind, { hy, col, lite, on, r });
  b.restore();
  if (key) { WINS.set(key, REC); REC = null; }
}

// per frame memo: the sprite key and the landmark colours only change with skin, boss and stage, so build those strings once
const FMEMO = new Map();
function farMemo(skin, boss, k, stage, gk) {
  let per = FMEMO.get(skin); if (!per) FMEMO.set(skin, per = []);
  const idx = (boss ? 64 : 0) + (stage & 63);   // the grade only depends on the stage, so one entry per stage
  let m = per[idx];
  if (!m) {
    const kq = gk, w = WORLDS[skin] || WORLDS.love;
    m = per[idx] = { fkey: `far|${skin}|${boss ? 1 : 0}|${k}|${stage % 7}`, col: mix(mix(w.far, w.bot, 0.3), boss ? '#12020c' : '#050212', Math.min(0.7, kq * 0.5) + (boss ? 0.3 : 0)), gond: `rgba(255,214,150,${0.35 + 0.3 * kq})` };
  }
  return m;
}
// rgba strings for animated alphas: quantised to 1/64 and cached, so the per-frame blink does not build a new string every frame
const RGBA = new Map();
function rgbaQ(rgb, a) {
  const q = Math.max(0, Math.min(64, Math.round(a * 64))), key = rgb + '|' + q;
  let v = RGBA.get(key); if (!v) RGBA.set(key, v = `rgba(${rgb},${q / 64})`);
  return v;
}
// 11-perf: the next stage's skyline (1.1 MB) is baked in idle time while the current one is on screen, so starting the next stage
// does not spend a frame drawing it. One request per key; nothing runs where there is no idle callback (tests, old browsers).
let wStage = -1;
const WARMED = new Set();
export function warmNextFar(kit, stage, idle) {
  const n = stage + 1;
  if (!kit || !kit.bake || n > 50) return false;
  const skin = skinFor(n), boss = isBossStage(n), gr = skyGrade(n), k = Math.round(gr.k * 4), fm = farMemo(skin, boss, k, n, gr.k), fkey = fm.fkey;
  if (WARMED.has(fkey)) return false;
  const run = idle || (typeof requestIdleCallback === 'function' ? requestIdleCallback : null);
  if (!run) return false;
  WARMED.add(fkey);
  run(() => { kit.bake(fkey, FAR_W, FAR_H, b => bakeFar(b, skin, boss, n, fkey), 1); });
  return true;
}
// per frame: the sprite slid against the duo, plus the animated landmarks
export function drawFar(c, kit, o) {
  const { skin, boss, stage, t, px, reduce, low, lit = 0, pop = 9 } = o, kind = farKind(skin), gr = skyGrade(stage), k = Math.round(gr.k * 4);
  const fm = farMemo(skin, boss, k, stage, gr.k), fkey = fm.fkey, spr = kit && kit.bake(fkey, FAR_W, FAR_H, b => bakeFar(b, skin, boss, stage, fkey), 1);
  if (!spr) return;
  if (stage !== wStage) { wStage = stage; warmNextFar(kit, stage); }   // once per stage, not per frame
  const dx = reduce ? 0 : -((px - W / 2) / W) * FAR_MARGIN * 1.6, x0 = -FAR_MARGIN + dx;
  c.save(); c.globalAlpha = boss ? 0.85 : 0.96; c.drawImage(spr.c, x0, FAR_TOP, FAR_W, FAR_H); c.globalAlpha = 1;
  const wl = WINS.get(fkey);
  if (wl && wl.length && lit > 0) {   // the skyline wakes up as the serpent is cleared: windows light in a scattered order, the newest one flashes
    const n = wl.length >> 2, cnt = Math.min(n, Math.round(lit * n)), step = n % 7 ? 7 : 5, glow = pop < 0.5 ? 1 - pop * 2 : 0;
    c.save(); c.translate(x0, FAR_TOP); c.translate(FAR_W / 2, FAR_HY); c.scale(FAR_SC, FAR_SC); c.translate(-FAR_W / 2, -FAR_HY);
    c.globalCompositeOperation = 'lighter'; c.fillStyle = boss ? 'rgba(255,150,130,.8)' : 'rgba(255,226,150,.85)';
    for (let i = 0; i < cnt; i++) { const j = ((i * step) % n) * 4; c.fillRect(wl[j], wl[j + 1], wl[j + 2], wl[j + 3]); }
    if (cnt && glow > 0 && !low) { const j = (((cnt - 1) * step) % n) * 4; c.globalAlpha = glow * 0.6; c.fillStyle = '#ffe9a8'; c.fillRect(wl[j] - 4, wl[j + 1] - 4, wl[j + 2] + 8, wl[j + 3] + 8); }
    c.restore();
  }
  if (!reduce) {
    const col = fm.col;
    c.translate(x0, FAR_TOP); c.translate(FAR_W / 2, FAR_HY); c.scale(FAR_SC, FAR_SC); c.translate(-FAR_W / 2, -FAR_HY);
    if (kind === 'fair') {   // the ferris wheel turns, gondolas stay upright
      const { x, y, r } = WHEEL, n = low ? 6 : 10, rot = t * 0.18;
      c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.beginPath(); c.arc(x, y, r * 0.62, 0, TAU); c.lineWidth = 1.6; c.stroke();
      c.lineWidth = 1.8; c.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.stroke();
      for (let i = 0; i < n; i++) { const a = rot + i / n * TAU, gx = x + Math.cos(a) * r, gy = y + Math.sin(a) * r; c.fillStyle = col; c.fillRect(gx - 4.5, gy, 9, 8); c.fillStyle = fm.gond; c.fillRect(gx - 2.5, gy + 2, 5, 3); }
      c.fillStyle = col; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill();
    } else if (kind === 'farm') {   // windmill blades
      const { x, y, len } = MILL, rot = t * 0.55; c.strokeStyle = col; c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); for (let i = 0; i < 4; i++) { const a = rot + i * TAU / 4; c.moveTo(x, y - 14); c.lineTo(x + Math.cos(a) * len, y - 14 + Math.sin(a) * len); } c.stroke();
      c.lineWidth = 5.5; c.globalAlpha = 0.9; c.beginPath(); for (let i = 0; i < 4; i++) { const a = rot + i * TAU / 4, m0 = len * 0.45, m1 = len; c.moveTo(x + Math.cos(a) * m0 + Math.cos(a + 1.57) * 3, y - 14 + Math.sin(a) * m0 + Math.sin(a + 1.57) * 3); c.lineTo(x + Math.cos(a) * m1 + Math.cos(a + 1.57) * 3, y - 14 + Math.sin(a) * m1 + Math.sin(a + 1.57) * 3); } c.stroke(); c.globalAlpha = 1;
    } else if (kind === 'dream') {   // a small airship crosses the dream sky very slowly
      const span = FAR_W + 160, ax = ((t * 7) % span) - 80, ay = FAR_HY - 180 + Math.sin(t * 0.6) * 5;
      c.fillStyle = col; c.beginPath(); c.ellipse(ax, ay, 30, 11, 0, 0, TAU); c.fill(); c.fillRect(ax - 8, ay + 11, 16, 6); c.beginPath(); c.moveTo(ax - 26, ay); c.lineTo(ax - 38, ay - 9); c.lineTo(ax - 36, ay + 6); c.fill();
      c.fillStyle = 'rgba(255,230,170,.55)'; c.fillRect(ax - 4, ay + 12, 3, 3); c.fillRect(ax + 1, ay + 12, 3, 3);
    } else if (kind === 'radio' || kind === 'storm' || kind === 'fort') {   // beacons blinking on the tallest points
      const on = Math.sin(t * 3) > 0.2 ? 1 : 0.25, pts = kind === 'radio' ? [[M + 421, FAR_HY - 232], [M + 230, FAR_HY - 212], [M + 496, FAR_HY - 192]] : kind === 'storm' ? [[M + 522, FAR_HY - 252]] : [[M + 360, FAR_HY - 254]];
      c.globalCompositeOperation = 'lighter';
      for (const [x, y] of pts) { c.fillStyle = kind === 'fort' ? rgbaQ('255,200,120', 0.6 * on) : rgbaQ('255,70,110', 0.9 * on); c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill(); c.fillStyle = rgbaQ('255,90,120', 0.18 * on); c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill(); }
      if (kind === 'radio') { c.fillStyle = rgbaQ('255,120,220', 0.1 + 0.08 * Math.sin(t * 2)); c.fillRect(M + 206, FAR_HY - 212, 54, 8); c.fillStyle = rgbaQ('120,255,240', 0.1 + 0.08 * Math.sin(t * 2.6)); c.fillRect(M + 470, FAR_HY - 192, 52, 8); }
    } else if (kind === 'manor') {   // a candle moves from window to window
      const i = Math.floor(t * 0.6) % 6, f = 0.6 + 0.4 * Math.sin(t * 9); c.globalCompositeOperation = 'lighter'; c.fillStyle = rgbaQ('255,200,110', 0.55 * f); c.fillRect(M + 196 + i * 42, FAR_HY - 78 + (i % 2) * 22, 8, 12);
    }
  }
  c.restore();
}
