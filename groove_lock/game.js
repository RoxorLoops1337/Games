// Groove Lock: browser front end (canvas renderer, input, juice, menus). The rules live in core.js, the sound in audio.js.
import { Game, TYPES, JAM_TYPES, starsFor, parOf, hintFor, mod } from './core.js';
import { LEVELS, JAM, GROOVE16 } from './levels.js';
import { createAudio, barSeconds } from './audio.js';

const $ = (s) => document.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d');
const A = createAudio();
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now() / 1000;
const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// ------------------------------------------------------------------ save (keys are live: never rename)
const KEY = 'groove_lock_save_v1';
const save = { stars: {}, best: {}, muted: false };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && typeof s === 'object') { save.stars = s.stars || {}; save.best = s.best || {}; save.muted = !!s.muted; }
} catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
A.muted = save.muted;

// ------------------------------------------------------------------ colour helpers
const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (h, t, k) => { const a = hex2rgb(h), b = hex2rgb(t); return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')'; };
const SHADE = {};
for (const id in TYPES) { const c = TYPES[id].color; SHADE[id] = { light: mix(c, '#ffffff', 0.5), mid: c, dark: mix(c, '#1a0a40', 0.42), edge: mix(c, '#12002e', 0.72) }; }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ------------------------------------------------------------------ state
let W = 0, H = 0, DPR = 1;
const L = { cx: 0, cy: 0, R: 100, cube: 40, discR: 130, sx: 0, sw: 0, hudH: 58, toolTop: 0, stackTop: 0, stackH: 0, maxLen: 1 };
let mode = 'menu';                 // menu | play | won
let level = null, game = null, par = null, levelIdx = -1;
let rotTarget = 0, viewRot = 0, dragFrac = 0;
let flights = [], parts = [], pulse = {}, landAt = {}, flashBad = {};
let ringKick = 0, shakeT = -9, winT = -9, toastTimer = 0, tipTimer = 0, winTimer = 0;
let hint = null, preview = null, drag = null;
const POSE = { roxor: { p: 'idle', until: 0, pop: -9 }, jasmin: { p: 'idle', until: 0, pop: -9 } };
const demo = new Game({ id: 'demo', steps: 16, bpm: 100, pattern: GROOVE16, show: 'kshbaoe', lock: 'kshbaoe', rot0: 0, stacks: [] });
game = demo; level = demo.lv;

// ------------------------------------------------------------------ layout
function layout() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5); W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const sw = Math.min(W, 560, H * 0.66); L.sw = sw; L.sx = (W - sw) / 2;
  const st = $('#stage'); st.style.left = L.sx + 'px'; st.style.width = sw + 'px';
  const menu = mode === 'menu';
  L.stackH = menu ? 0 : clamp(H * 0.27, 150, 270);
  L.stackTop = H - L.stackH; L.toolTop = L.stackTop - 78;
  const top = menu ? H * 0.24 : L.hudH, bot = menu ? H * 0.74 : L.toolTop;
  const N = game.N, availH = bot - top;
  const lim = Math.min(sw * 0.45, availH / 2 - 4);
  let R = lim - 40, cube = Math.min(58, (TAU * R / N) * 0.76);
  R = lim - cube * 0.85 - 8; cube = Math.min(58, (TAU * R / N) * 0.76);
  L.R = Math.max(R, 60); L.cube = cube; L.discR = L.R + cube * 0.85 + 6;
  L.cx = W / 2; L.cy = top + availH / 2;
  $('#tools').style.top = L.toolTop + 'px';
  $('#tip').style.top = (L.hudH + 4) + 'px';
}
window.addEventListener('resize', layout);

// ------------------------------------------------------------------ geometry
const ang = (step) => -Math.PI / 2 + step * TAU / game.N;
function slotPos(j, rad = L.R) { const a = ang(j + viewRot); return { x: L.cx + Math.cos(a) * rad, y: L.cy + Math.sin(a) * rad, a }; }
function stepPos(s, rad = L.R) { const a = ang(s); return { x: L.cx + Math.cos(a) * rad, y: L.cy + Math.sin(a) * rad, a }; }

function stackGeom() {
  if (game.jam) {
    const K = JAM_TYPES.length, cs = Math.min(56, (L.sw - 20) / K - 6), y = L.stackTop + L.stackH * 0.42;
    return JAM_TYPES.map((t, i) => ({ cx: L.sx + L.sw * (i + 0.5) / K, cw: L.sw / K, cs, bed: y + cs, jamY: y }));
  }
  const K = game.stacks.length, cw = Math.min(L.sw / K, 118);
  const cs = Math.min(cw * 0.7, 56, (L.stackH - 66) / (L.maxLen + 0.25));
  return game.stacks.map((s, i) => ({ cx: L.sx + L.sw * (i + 0.5) / K, cw, cs, bed: H - 46 }));
}
const cubeCenterInStack = (g, idx) => ({ x: g.cx, y: g.bed - g.cs * (idx + 0.5) - 3 });

// ------------------------------------------------------------------ drawing: cubes
function drawCube(x, y, size, type, o = {}) {
  const T = TYPES[type], S = SHADE[type], s = size * (o.scale || 1), h = s / 2, r = s * 0.24;
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
  ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
  if (o.ghost) {
    rr(-h, -h, s, s, r); ctx.fillStyle = T.color + '22'; ctx.fill();
    ctx.setLineDash([s * 0.15, s * 0.11]); ctx.lineWidth = 2.2; ctx.strokeStyle = T.color + (o.hot ? 'ff' : '99'); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = T.color + (o.hot ? 'ee' : '88'); ctx.font = '800 ' + (s * (T.label.length > 1 ? 0.4 : 0.5)) + 'px ui-rounded,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(T.label, 0, s * 0.03); ctx.restore(); return;
  }
  ctx.fillStyle = 'rgba(0,0,0,.38)'; rr(-h, -h + s * 0.14, s, s, r); ctx.fill();
  if (o.glow) { ctx.shadowColor = T.color; ctx.shadowBlur = o.glow; }
  const gr = ctx.createLinearGradient(0, -h, 0, h); gr.addColorStop(0, S.light); gr.addColorStop(0.5, S.mid); gr.addColorStop(1, S.dark);
  rr(-h, -h, s, s, r); ctx.fillStyle = gr; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.strokeStyle = S.edge; ctx.stroke();
  rr(-h + s * 0.1, -h + s * 0.07, s * 0.8, s * 0.26, r * 0.55); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill();
  ctx.fillStyle = 'rgba(28,8,60,.88)'; ctx.font = '900 ' + (s * (T.label.length > 1 ? 0.42 : 0.54)) + 'px ui-rounded,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(T.label, 0, s * 0.07);
  if (o.locked) {
    ctx.fillStyle = 'rgba(14,4,36,.78)'; ctx.beginPath(); ctx.arc(h * 0.62, -h * 0.62, s * 0.19, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd9a0'; rr(h * 0.62 - s * 0.085, -h * 0.62 - s * 0.01, s * 0.17, s * 0.12, 2); ctx.fill();
    ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.arc(h * 0.62, -h * 0.62 - s * 0.01, s * 0.05, Math.PI, 0); ctx.stroke();
  }
  if (o.tune) { ctx.fillStyle = '#5dff9a'; ctx.beginPath(); ctx.arc(-h * 0.68, -h * 0.68, s * 0.09, 0, TAU); ctx.fill(); }
  ctx.restore();
}

// ------------------------------------------------------------------ drawing: scene
function drawBackground(t) {
  const gr = ctx.createRadialGradient(W / 2, L.cy, 10, W / 2, L.cy, Math.max(W, H) * 0.8);
  gr.addColorStop(0, '#2d1768'); gr.addColorStop(0.45, '#170a3c'); gr.addColorStop(1, '#090319'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) {
    const sd = i * 7.13, x = ((Math.sin(sd) * 0.5 + 0.5) * W + Math.sin(t * 0.07 + sd) * 30), y = ((Math.cos(sd * 1.7) * 0.5 + 0.5) * H + Math.cos(t * 0.05 + sd) * 24), r = 24 + (i % 5) * 16;
    ctx.fillStyle = (i % 2 ? 'rgba(255,120,196,' : 'rgba(53,214,255,') + (0.035 + ringKick * 0.03) + ')';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  if (ringKick > 0.02) { const g2 = ctx.createRadialGradient(L.cx, L.cy, L.discR * 0.5, L.cx, L.cy, L.discR * 1.9); g2.addColorStop(0, 'rgba(255,120,196,' + (0.16 * ringKick) + ')'); g2.addColorStop(1, 'rgba(255,120,196,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H); }
}

function drawChars(t) {
  if (!(window.RJ && window.RJ.draw)) return;
  const D = L.discR, big = mode === 'menu' ? 1.15 : 1;
  for (const [id, sign] of [['roxor', -1], ['jasmin', 1]]) {
    const P = POSE[id], k = (t - P.pop) / 0.26, pop = k >= 0 && k < 1 ? 1 + 0.1 * Math.sin(k * Math.PI) : 1;
    let pose = t < P.until ? P.p : 'idle';
    if (mode === 'won' && t - winT > 0.1) pose = 'cheer';
    try {
      window.RJ.draw(ctx, id, { x: L.cx + sign * D * 0.8, y: L.cy - D * 0.5, s: D * 0.0031 * pop * big, pose, t: t + (id === 'jasmin' ? 1.7 : 0), flip: sign > 0 });
    } catch (e) { /* art never blocks the game */ }
  }
}

function drawDisc(t) {
  const R = L.R, D = L.discR, N = game.N, q = N / 4, synced = game.synced();
  const done = mode === 'won' || (mode === 'play' && game.remaining() === 0 && synced && !game.jam);
  ctx.save();
  const k = 1 + 0.024 * ringKick; ctx.translate(L.cx, L.cy); ctx.scale(k, k); ctx.translate(-L.cx, -L.cy);
  ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 12;
  const gr = ctx.createRadialGradient(L.cx - D * 0.3, L.cy - D * 0.35, D * 0.1, L.cx, L.cy, D);
  gr.addColorStop(0, '#2a1763'); gr.addColorStop(1, '#0c0524'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(L.cx, L.cy, D, 0, TAU); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.lineWidth = 1; for (let r = R * 0.5; r < D - 4; r += 6.5) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.035 + 0.02 * ((r * 7) % 3 < 1)) + ')'; ctx.beginPath(); ctx.arc(L.cx, L.cy, r, 0, TAU); ctx.stroke(); }
  const sh = viewRot * TAU / N; ctx.lineWidth = D * 0.14; ctx.strokeStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(L.cx, L.cy, D * 0.74, sh + i * Math.PI + 0.2, sh + i * Math.PI + 0.9); ctx.stroke(); }
  const rim = ctx.createLinearGradient(L.cx - D, L.cy - D, L.cx + D, L.cy + D);
  if (done) { rim.addColorStop(0, '#ffe36a'); rim.addColorStop(1, '#5dff9a'); } else { rim.addColorStop(0, '#35d6ff'); rim.addColorStop(1, '#ff78c4'); }
  ctx.lineWidth = 5; ctx.strokeStyle = rim; ctx.shadowColor = done ? '#ffe36a' : '#8d63ff'; ctx.shadowBlur = done ? 26 : 14; ctx.beginPath(); ctx.arc(L.cx, L.cy, D, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
  // centre label
  const lr = R * 0.4, lg = ctx.createLinearGradient(L.cx, L.cy - lr, L.cx, L.cy + lr); lg.addColorStop(0, '#ff78c4'); lg.addColorStop(1, '#6a3fe0');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(L.cx, L.cy, lr, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let big = '', small = '';
  if (mode === 'menu') { big = '100'; small = 'BPM'; }
  else if (game.jam) { big = 'JAM'; small = 'free loop'; }
  else if (mode === 'won') { big = '★'; small = 'locked'; }
  else if (game.remaining() > 0) { big = String(game.remaining()); small = 'to place'; }
  else { big = '★'; small = 'spin home'; }
  ctx.font = '900 ' + lr * 0.78 + 'px ui-rounded,system-ui,sans-serif'; ctx.fillText(big, L.cx, L.cy - lr * 0.12);
  ctx.font = '800 ' + lr * 0.27 + 'px ui-rounded,system-ui,sans-serif'; ctx.globalAlpha = 0.85; ctx.fillText(small.toUpperCase(), L.cx, L.cy + lr * 0.56); ctx.globalAlpha = 1;
  // static step ticks + home marker (these do NOT turn with the ring)
  for (let s = 0; s < N; s++) {
    const a = ang(s), r1 = D + 5, r2 = D + (s % q === 0 ? 14 : 9);
    ctx.strokeStyle = s === 0 ? '#ffd34d' : s % q === 0 ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.3)'; ctx.lineWidth = s % q === 0 ? 3 : 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L.cx + Math.cos(a) * r1, L.cy + Math.sin(a) * r1); ctx.lineTo(L.cx + Math.cos(a) * r2, L.cy + Math.sin(a) * r2); ctx.stroke();
  }
  const hx = L.cx, hy = L.cy - D - 20; ctx.fillStyle = synced ? '#ffd34d' : 'rgba(255,211,77,.4)';
  if (synced) { ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 16; }
  ctx.beginPath(); ctx.moveTo(hx - 9, hy - 7); ctx.lineTo(hx + 9, hy - 7); ctx.lineTo(hx, hy + 6); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  ctx.restore();
}

function drawRing(t) {
  const N = game.N, c = L.cube, dockS = game.dockSlot();
  ctx.save();
  const k = 1 + 0.024 * ringKick; ctx.translate(L.cx, L.cy); ctx.scale(k, k); ctx.translate(-L.cx, -L.cy);
  // sockets + ghosts + cubes
  for (let j = 0; j < N; j++) {
    const p = slotPos(j);
    ctx.save(); ctx.translate(p.x, p.y); rr(-c * 0.5, -c * 0.5, c, c, c * 0.24); ctx.fillStyle = 'rgba(255,255,255,.055)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke(); ctx.restore();
  }
  const star = slotPos(0, L.R + c * 0.8); ctx.fillStyle = game.synced() ? '#ffd34d' : 'rgba(255,211,77,.55)';
  if (game.synced()) { ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 12; }
  ctx.font = '900 ' + c * 0.42 + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', star.x, star.y); ctx.shadowBlur = 0;
  for (let j = 0; j < N; j++) {
    const p = slotPos(j), pt = pulse[j] == null ? 9 : t - pulse[j], pk = pt < 0.28 ? 1 - pt / 0.28 : 0;
    if (game.ghost[j] && !game.ring[j]) {
      const atDock = j === dockS && mode === 'play';
      const wob = atDock ? 1 + 0.06 * Math.sin(t * 9) : 1;
      drawCube(p.x, p.y, c * 0.92, game.ghost[j], { ghost: true, hot: atDock || pk > 0, scale: wob + pk * 0.2 });
      if (hint && hint.slot === j && t < hint.until) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3.5; ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 16; rr(p.x - c * 0.66, p.y - c * 0.66, c * 1.32, c * 1.32, c * 0.3); ctx.stroke(); ctx.shadowBlur = 0; }
    }
    const here = game.ring[j];
    if (here && !(landAt[j] && t < landAt[j])) {
      let sc = 1 + 0.3 * pk;
      const lt = landAt[j] ? t - landAt[j] : 9; if (lt >= 0 && lt < 0.22) sc *= 1 + 0.18 * Math.sin((1 - lt / 0.22) * Math.PI);
      drawCube(p.x, p.y, c * 0.92, here, { scale: sc, locked: game.locked[j], glow: pk > 0 ? 22 * pk : 0, tune: game.inTune(j) && !game.jam });
    }
  }
  // dock bracket (fixed)
  const dp = stepPos(game.dock), pulseA = 0.55 + 0.45 * Math.sin(t * 5);
  ctx.strokeStyle = 'rgba(53,214,255,' + (mode === 'play' ? 0.9 * pulseA + 0.1 : 0.2) + ')'; ctx.lineWidth = 3; ctx.shadowColor = '#35d6ff'; ctx.shadowBlur = 14;
  rr(dp.x - c * 0.64, dp.y - c * 0.64, c * 1.28, c * 1.28, c * 0.3); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(53,214,255,.9)'; ctx.beginPath(); ctx.moveTo(dp.x, dp.y + c * 0.68); ctx.lineTo(dp.x - c * 0.2, dp.y + c * 0.98); ctx.lineTo(dp.x + c * 0.2, dp.y + c * 0.98); ctx.closePath(); if (mode === 'play') ctx.fill();
  // playhead beam
  const pos = A.pos(), pa = ang(pos), D = L.discR;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const a0 = pa - (i + 1) * 0.045, a1 = pa - i * 0.045;
    ctx.fillStyle = 'rgba(255,210,255,' + 0.14 * Math.pow(1 - i / 14, 2) + ')';
    ctx.beginPath(); ctx.moveTo(L.cx, L.cy); ctx.arc(L.cx, L.cy, D - 2, a0, a1); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,240,255,.85)'; ctx.lineWidth = 3; ctx.shadowColor = '#ff78c4'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.moveTo(L.cx + Math.cos(pa) * L.cube * 0.9, L.cy + Math.sin(pa) * L.cube * 0.9); ctx.lineTo(L.cx + Math.cos(pa) * (D - 2), L.cy + Math.sin(pa) * (D - 2)); ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function drawLorry(g, i, t) {
  const w = g.cw * 0.9, x = g.cx - w / 2, y = g.bed, cab = ['#ff78c4', '#35d6ff', '#ffd34d', '#7dff9c'][i % 4];
  ctx.fillStyle = '#2b1c5e'; rr(x, y, w * 0.76, 15, 6); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#7a5cf0'; ctx.stroke();
  ctx.fillStyle = cab; rr(x + w * 0.79, y - 9, w * 0.21, 24, 6); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; rr(x + w * 0.84, y - 5, w * 0.11, 9, 3); ctx.fill();
  for (const wx of [x + w * 0.16, x + w * 0.58, x + w * 0.89]) { ctx.fillStyle = '#0b0420'; ctx.beginPath(); ctx.arc(wx, y + 16, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#b7a5ff'; ctx.beginPath(); ctx.arc(wx, y + 16, 3, 0, TAU); ctx.fill(); }
}

function drawStacks(t) {
  const geo = stackGeom(), dockSlot = game.dockSlot();
  const want = !game.jam && mode === 'play' && game.ghost[dockSlot] && !game.ring[dockSlot] ? game.ghost[dockSlot] : null;
  geo.forEach((g, i) => {
    if (game.jam) {
      const ty = JAM_TYPES[i]; drawCube(g.cx, g.jamY + g.cs * 0.5, g.cs, ty, { glow: 0 });
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '800 ' + Math.max(10, g.cs * 0.24) + 'px ui-rounded,system-ui'; ctx.textAlign = 'center'; ctx.fillText(TYPES[ty].name, g.cx, g.jamY + g.cs * 1.22);
      return;
    }
    const st = game.stacks[i], shake = flashBad[i] && t - flashBad[i] < 0.35 ? Math.sin((t - flashBad[i]) * 60) * 5 * (1 - (t - flashBad[i]) / 0.35) : 0;
    ctx.save(); ctx.translate(shake, 0);
    drawLorry(g, i, t);
    st.forEach((ty, idx) => {
      const c = cubeCenterInStack(g, idx), top = idx === st.length - 1;
      const hot = top && ((want && ty === want) || (hint && hint.drop === i && t < hint.until));
      drawCube(c.x, c.y, g.cs * 0.94, ty, { glow: hot ? 20 + 8 * Math.sin(t * 8) : 0, alpha: top ? 1 : 0.92 });
      if (top && flashBad[i] && t - flashBad[i] < 0.35) { ctx.fillStyle = 'rgba(255,60,60,.4)'; rr(c.x - g.cs * 0.47, c.y - g.cs * 0.47, g.cs * 0.94, g.cs * 0.94, g.cs * 0.22); ctx.fill(); }
    });
    if (!st.length) { ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.font = '800 12px ui-rounded,system-ui'; ctx.textAlign = 'center'; ctx.fillText('EMPTY', g.cx, g.bed - 12); }
    ctx.restore();
  });
}

function drawFlights(t) {
  for (const f of flights) {
    const k = clamp((t - f.t0) / f.dur, 0, 1), e = k * k * (3 - 2 * k), to = slotPos(f.slot);
    const mx = (f.x0 + to.x) / 2, my = Math.min(f.y0, to.y) - 70;
    const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * mx + e * e * to.x, y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * my + e * e * to.y;
    drawCube(x, y, f.size + (L.cube * 0.92 - f.size) * e, f.type, { rot: Math.sin(k * Math.PI) * 0.5 * f.spin, glow: 14 });
  }
}

function drawParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind !== 'note') p.vy += 420 * dt;
    const a = 1 - p.life / p.max; ctx.globalAlpha = Math.min(1, a * 1.6);
    if (p.kind === 'note') { ctx.fillStyle = p.color; ctx.font = '900 ' + p.size + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♪', p.x, p.y); }
    else if (p.kind === 'conf') { p.rot += p.vr * dt; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); ctx.restore(); }
    else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a + 0.5, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
function burst(x, y, color, n = 10, spd = 170) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = spd * (0.35 + Math.random() * 0.8); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0, max: 0.4 + Math.random() * 0.4, color, size: 2 + Math.random() * 3.5, kind: 'spark' }); } }
function noteFx(x, y, color) { parts.push({ x, y, vx: (Math.random() - 0.5) * 36, vy: -60 - Math.random() * 40, life: 0, max: 1.1, color, size: L.cube * 0.55, kind: 'note' }); }
function confetti() { const cols = Object.values(TYPES).map((t) => t.color).concat(['#ffd34d', '#ffffff']); for (let i = 0; i < 110; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, s = 260 + Math.random() * 380; parts.push({ x: L.cx, y: L.cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 1.6 + Math.random() * 1.2, color: cols[i % cols.length], size: 3 + Math.random() * 4, kind: 'conf', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14 }); } }

function drawWinText(t) {
  const k = (t - winT); if (k < 0 || k > 2.6) return;
  const s = easeOutBack(clamp(k / 0.5, 0, 1)), a = k > 2 ? 1 - (k - 2) / 0.6 : 1;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(L.cx, L.cy); ctx.scale(s, s); ctx.rotate(-0.06);
  ctx.font = '900 ' + Math.min(W * 0.13, 64) + 'px ui-rounded,system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 9; ctx.strokeStyle = '#3a1070'; ctx.lineJoin = 'round'; ctx.strokeText('LOCKED IN!', 0, 0);
  const g = ctx.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, '#fff6b0'); g.addColorStop(1, '#ffb21f'); ctx.fillStyle = g; ctx.fillText('LOCKED IN!', 0, 0); ctx.restore();
}

// ------------------------------------------------------------------ update + frame
function onHit(h) {
  if (!h.type || !game) return;
  const j = mod(h.step - game.rot, game.N), T = TYPES[h.type], p = slotPos(j);
  pulse[j] = now(); burst(p.x, p.y, T.color, 7, 130);
  const P = POSE[T.who]; P.p = T.who === 'jasmin' ? 'sing' : 'attack'; P.until = now() + (T.who === 'jasmin' ? 0.42 : 0.2); P.pop = now();
  if (T.role === 'vox') noteFx(p.x, p.y - L.cube * 0.4, T.color);
  if (h.type === 'kick' || h.type === 'bass') ringKick = 1;
}

function update(dt, t) {
  const target = rotTarget + dragFrac;
  viewRot += (target - viewRot) * (1 - Math.exp(-dt * 20));
  ringKick = Math.max(0, ringKick - dt * 5);
  for (const h of A.drain()) onHit(h);
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i]; if (t >= f.t0 + f.dur) {
      flights.splice(i, 1); const p = slotPos(f.slot); pulse[f.slot] = t; burst(p.x, p.y, TYPES[f.type].color, 14, 190); A.sting(f.type); delete landAt[f.slot];
      if (mode === 'play') updateHud();
    }
  }
  if (preview && t > preview.until) { preview = null; }
  if (hint && t > hint.until) { hint = null; $('#bL').classList.remove('hp'); $('#bR').classList.remove('hp'); $('#bHint').classList.remove('hp'); }
  if (mode === 'play' && !game.jam && flights.length === 0 && game.isSolved()) startWin();
}

function draw(t, dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sk = t - shakeT < 0.3 ? (1 - (t - shakeT) / 0.3) * 5 : 0;
  ctx.save(); if (sk) ctx.translate((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk);
  drawBackground(t); drawChars(t); drawDisc(t); drawRing(t);
  if (mode !== 'menu') { drawStacks(t); drawFlights(t); }
  drawParts(dt); drawWinText(t);
  ctx.restore();
}

let lastT = now();
function frame() {
  const t = now(), dt = Math.min(0.05, t - lastT); lastT = t;
  update(dt, t); draw(t, dt); requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ audio wiring
const sourceFn = (s) => (preview && now() < preview.until ? game.goalType(s) : game.stepType(s));
function startAudio(g, celebrate) {
  A.unlock();
  A.celebrate = !!celebrate; A.metro = !celebrate;
  A.setSource(g === demo ? (s) => demo.stepType(s) : sourceFn);
  A.start(g.N, barSeconds(g.lv.bpm || 100));
}

// ------------------------------------------------------------------ HUD / toasts
const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } };
function toast(msg, ms = 2600) {
  const el = $('#toast'); el.textContent = msg; el.style.top = (L.toolTop - 52) + 'px'; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}
function showTip(txt) {
  const el = $('#tip'); el.innerHTML = txt + '<u>tap to dismiss</u>'; el.classList.add('on');
  clearTimeout(tipTimer); tipTimer = setTimeout(() => el.classList.remove('on'), 14000);
}
$('#tip').addEventListener('pointerdown', () => $('#tip').classList.remove('on'));

function updateHud() {
  if (mode === 'menu') return;
  $('#lvName').textContent = level.name; $('#lvSub').textContent = level.layer;
  const mv = $('#mv'); mv.textContent = game.jam ? '♫' : game.moves;
  $('#parTxt').textContent = game.jam ? 'free' : 'par ' + par;
  const m = $('#moves'); m.className = '';
  if (!game.jam) m.classList.add(game.moves <= par ? 'good' : game.moves <= Math.ceil(par * 1.3) ? 'mid' : 'bad');
  $('#bUndo').disabled = !game.canUndo();
  $('#bL').disabled = !game.canRotate(-1);
}

// ------------------------------------------------------------------ actions
function syncView() { const cur = Math.round(rotTarget), d = mod(game.rot - cur + game.N / 2, game.N) - game.N / 2; rotTarget = cur + d; }
function resetVis() { flights = []; parts = []; pulse = {}; landAt = {}; flashBad = {}; hint = null; preview = null; dragFrac = 0; }

function spin(dir, merge = false) {
  if (mode !== 'play') return false;
  const r = game.rotate(dir, merge);
  if (!r.ok) { A.bonk(); shakeT = now(); toast('One way belt: it only turns clockwise.'); return false; }
  rotTarget += dir; A.tick(game.rot); hint = null; updateHud(); return true;
}

function tryDrop(i) {
  if (mode !== 'play') return;
  const g = stackGeom()[i]; if (!g) return;
  const before = game.jam ? null : game.stacks[i].length;
  const r = game.drop(i);
  if (!r.ok) {
    A.bonk(); buzz(40); shakeT = now(); flashBad[i] = now();
    const P = POSE.roxor; P.p = 'hurt'; P.until = now() + 0.45; P.pop = now();
    if (r.reason === 'wrongType') toast('That slot wants ' + TYPES[r.need].name + ' (' + TYPES[r.need].label + '), not ' + TYPES[r.type].name + '.');
    else if (r.reason === 'noGhost') toast('No ghost here. Spin the ring so a ghost cube sits in the dock.');
    else if (r.reason === 'occupied') toast('That slot is already taken.');
    else toast('That lorry is empty.');
    return;
  }
  const from = game.jam ? { x: g.cx, y: g.jamY + g.cs * 0.5 } : cubeCenterInStack(g, before - 1);
  flights.push({ type: r.type, x0: from.x, y0: from.y, slot: r.slot, t0: now(), dur: game.jam ? 0.26 : 0.36, size: g.cs * 0.94, spin: Math.random() < 0.5 ? -1 : 1 });
  landAt[r.slot] = now() + (game.jam ? 0.26 : 0.36); A.drop(); buzz(12); hint = null; updateHud();
}

function undo() {
  if (mode !== 'play' || !game.undo()) return; A.undo(); syncView(); flights = []; landAt = {}; hint = null; updateHud();
}
function restart() { if (!level || mode === 'menu') return; startLevel(levelIdx, true); }

function hearGoal() {
  if (mode !== 'play' || game.jam) return;
  preview = { until: now() + barSeconds(level.bpm) * 2 + 0.15 }; toast('Listen: this is the groove you are building.', 4200);
}

function doHint() {
  if (mode !== 'play' || game.jam) return;
  const h = hintFor(game);
  if (h.done) return;
  if (h.stuck) { toast('No route from here. Try Undo or Restart.'); return; }
  const r = mod(game.rot + h.dir * h.n, game.N); hint = { ...h, until: now() + 5, slot: h.drop != null ? mod(game.dock - r, game.N) : undefined };
  const parts2 = [];
  if (h.n > 0) parts2.push('Spin ' + (h.dir > 0 ? 'clockwise' : 'counter clockwise') + ' ' + h.n + ' notch' + (h.n > 1 ? 'es' : ''));
  if (h.drop != null) parts2.push((h.n > 0 ? 'then tap' : 'Tap') + ' lorry ' + (h.drop + 1));
  else if (h.n > 0) parts2.push('to lock it');
  toast(parts2.join(', ') + '.', 5000);
  if (h.n > 0) $(h.dir > 0 ? '#bR' : '#bL').classList.add('hp');
}

function startWin() {
  mode = 'won'; winT = now(); A.celebrate = true; A.metro = false; A.win(); confetti(); shakeT = now(); buzz([30, 40, 30, 40, 90]);
  $('#tip').classList.remove('on'); $('#toast').classList.remove('on'); hint = null; for (const id of ['#bL', '#bR', '#bHint']) $(id).classList.remove('hp');
  const stars = starsFor(game.moves, par);
  save.stars[level.id] = Math.max(save.stars[level.id] || 0, stars);
  if (!save.best[level.id] || game.moves < save.best[level.id]) save.best[level.id] = game.moves;
  persist();
  $('#stars').innerHTML = '★'.repeat(stars) + '<s>' + '★'.repeat(3 - stars) + '</s>';
  const last = levelIdx === LEVELS.length - 1;
  $('#winT').textContent = last ? 'MIDNIGHT LOOP COMPLETE!' : 'GROOVE LOCKED!';
  $('#winS').innerHTML = game.moves + ' moves, par ' + par + (stars === 3 ? '. Perfect lock!' : '. Beat the par for 3 stars.') + '<br>' + (last ? 'The whole band is playing. Jam Mode is open.' : 'Layer added: ' + level.layer + '.');
  $('#bNext').textContent = last ? 'JAM MODE' : 'NEXT';
  clearTimeout(winTimer); winTimer = setTimeout(() => { if (mode === 'won') $('#win').classList.add('on'); }, 1700);
}

// ------------------------------------------------------------------ screens
function show(id, on) { $(id).classList[on ? 'add' : 'remove']('on'); }
function setPlayUi(on) { $('#hud').hidden = !on; $('#tools').hidden = !on; if (!on) { $('#tip').classList.remove('on'); $('#toast').classList.remove('on'); } }

function startLevel(i, replay = false) {
  levelIdx = i; level = i === 'jam' ? JAM : LEVELS[i]; game = new Game(level); par = level.jam ? null : parOf(level);
  L.maxLen = Math.max(1, ...game.stacks.map((s) => s.length));
  rotTarget = viewRot = game.rot; resetVis(); mode = 'play'; clearTimeout(winTimer);
  show('#menu', false); show('#levels', false); show('#win', false); setPlayUi(true);
  layout(); startAudio(game, false); updateHud();
  $('#bGoal').disabled = !!level.jam; $('#bHint').disabled = !!level.jam;
  if (!replay && !level.jam && !save.stars[level.id]) showTip(level.tip); else if (level.jam) showTip(level.tip);
}
function showMenu() {
  mode = 'menu'; game = demo; level = demo.lv; resetVis(); rotTarget = viewRot = 0; clearTimeout(winTimer);
  show('#win', false); show('#levels', false); show('#menu', true); setPlayUi(false); layout();
  if (A.ready()) startAudio(demo, true); else { A.celebrate = true; A.setSource((s) => demo.stepType(s)); A.N = 16; A.barDur = barSeconds(100); }
  $('#bSound').textContent = A.muted ? 'Sound off' : 'Sound on';
}
function nextLevelIdx() { for (let i = 0; i < LEVELS.length; i++) if (!save.stars[LEVELS[i].id]) return i; return LEVELS.length - 1; }
const unlocked = (i) => i === 0 || (save.stars[LEVELS[i - 1].id] || 0) >= 1;
function buildLevels() {
  const grid = $('#grid'); grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button'), s = save.stars[lv.id] || 0;
    b.className = 'card' + (unlocked(i) ? '' : ' lock');
    b.innerHTML = '<span class="n">LAYER ' + (i + 1) + (lv.oneWay ? ' &middot; ONE WAY' : '') + '</span><b>' + lv.name + '</b><small>' + lv.layer + '</small><span class="st">' + '★'.repeat(s) + '<s>' + '★'.repeat(3 - s) + '</s></span>';
    b.addEventListener('click', () => { A.unlock(); A.click(); startLevel(i); });
    grid.appendChild(b);
  });
  const j = document.createElement('button'), open = (save.stars[LEVELS[1].id] || 0) >= 1;
  j.className = 'card jam' + (open ? '' : ' lock'); j.innerHTML = '<span class="n">SANDBOX</span><b>Jam Mode</b><small>' + (open ? JAM.layer + '. Drop any sound anywhere and loop it.' : 'Opens after Backbeat.') + '</small>';
  j.addEventListener('click', () => { A.unlock(); A.click(); startLevel('jam'); });
  grid.appendChild(j);
}

$('#bPlay').addEventListener('click', () => { A.unlock(); A.click(); startLevel(nextLevelIdx()); });
$('#bLevels').addEventListener('click', () => { A.unlock(); buildLevels(); show('#levels', true); });
$('#bBack').addEventListener('click', () => show('#levels', false));
$('#bSound').addEventListener('click', () => { A.unlock(); save.muted = !save.muted; A.setMuted(save.muted); persist(); $('#bSound').textContent = save.muted ? 'Sound off' : 'Sound on'; });
$('#bMenu').addEventListener('click', () => { A.click(); showMenu(); buildLevels(); show('#levels', true); });
$('#bRestart').addEventListener('click', restart);
$('#bUndo').addEventListener('click', undo);
$('#bGoal').addEventListener('click', hearGoal);
$('#bHint').addEventListener('click', doHint);
$('#bL').addEventListener('click', () => spin(-1));
$('#bR').addEventListener('click', () => spin(1));
$('#bRetry').addEventListener('click', () => { show('#win', false); startLevel(levelIdx, true); });
$('#bLv').addEventListener('click', () => { show('#win', false); showMenu(); buildLevels(); show('#levels', true); });
$('#bNext').addEventListener('click', () => {
  show('#win', false);
  if (levelIdx === LEVELS.length - 1) startLevel('jam'); else startLevel(levelIdx + 1);
});

// ------------------------------------------------------------------ input: lorries by tap, ring by drag
function stackAt(x, y) {
  if (y < L.stackTop) return -1;
  const geo = stackGeom(); for (let i = 0; i < geo.length; i++) if (Math.abs(x - geo[i].cx) < geo[i].cw / 2 + 2) return i; return -1;
}
cv.addEventListener('pointerdown', (e) => {
  A.unlock(); if (mode === 'menu' && !A.running) startAudio(demo, true);
  if (mode !== 'play') return;
  const x = e.clientX, y = e.clientY, si = stackAt(x, y);
  if (si >= 0) { tryDrop(si); return; }
  const dx = x - L.cx, dy = y - L.cy, d = Math.hypot(dx, dy);
  if (d < L.discR * 1.3) { cv.setPointerCapture(e.pointerId); drag = { id: e.pointerId, last: Math.atan2(dy, dx), acc: 0, applied: 0, moved: false, x, y, pushed: false }; }
});
cv.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || mode !== 'play') return;
  const a = Math.atan2(e.clientY - L.cy, e.clientX - L.cx); let d = a - drag.last; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
  drag.last = a; drag.acc += d; if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.moved = true;
  const notch = TAU / game.N;
  if (game.oneWay && drag.acc < (drag.applied - 0.5) * notch) { drag.acc = (drag.applied - 0.5) * notch; if (!drag.warned) { drag.warned = true; toast('One way belt: it only turns clockwise.'); } }
  const want = Math.round(drag.acc / notch);
  while (drag.applied < want) { if (!spin(1, drag.pushed)) break; drag.pushed = true; drag.applied++; }
  while (drag.applied > want) { if (!spin(-1, drag.pushed)) { drag.applied = want; break; } drag.pushed = true; drag.applied--; }
  dragFrac = clamp(drag.acc / notch - drag.applied, -0.5, 0.5);
  if (game.oneWay) dragFrac = Math.max(0, dragFrac);
});
function endDrag(e) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  if (!drag.moved && mode === 'play' && game.jam) {
    let best = -1, bd = L.cube * 0.7;
    for (let j = 0; j < game.N; j++) { const p = slotPos(j), dd = Math.hypot(p.x - drag.x, p.y - drag.y); if (dd < bd) { bd = dd; best = j; } }
    if (best >= 0) { const r = game.take(best); if (r.ok) { A.click(); const p = slotPos(best); burst(p.x, p.y, TYPES[r.type].color, 8, 120); updateHud(); } }
  }
  drag = null; dragFrac = 0;
}
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (e) => {
  if (e.repeat && !/Arrow|[ad]/i.test(e.key)) return;
  A.unlock();
  if (mode === 'menu') { if (e.key === 'Enter') $('#bPlay').click(); return; }
  const k = e.key;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') spin(1);
  else if (k === 'ArrowLeft' || k === 'a' || k === 'A') spin(-1);
  else if (/^[1-9]$/.test(k)) tryDrop(+k - 1);
  else if (k === 'z' || k === 'Z' || k === 'Backspace') undo();
  else if (k === 'h' || k === 'H') doHint();
  else if (k === 'g' || k === 'G') hearGoal();
  else if (k === 'r' || k === 'R') restart();
  else if (k === 'Escape') { showMenu(); }
  else if (k === 'm' || k === 'M') { save.muted = !save.muted; A.setMuted(save.muted); persist(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) A.stop(); else if (A.ready() && game) startAudio(game, mode === 'won' || mode === 'menu'); });

// test hook: lets the browser test read live state without scraping pixels
window.GL = { get L() { return L; }, stackGeom, get game() { return game; }, get mode() { return mode; }, get level() { return level; }, A, startLevel, spin, tryDrop, undo, doHint, showMenu, get par() { return par; }, save, get flights() { return flights.length; } };

layout(); showMenu(); requestAnimationFrame(frame);
