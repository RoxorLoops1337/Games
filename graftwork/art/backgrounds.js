// GRAFTWORK backgrounds. drawBackground(ctx, theme, t, o) paints the whole 1280x720 stage.
// themes: ward market theatre (combat per act) | map1 map2 map3 | title table shop forge event | win lose
// Heavy static layers are cached on offscreen canvases (LRU, only when `document` exists); per frame we animate only light, dust, sway.
// o: { dim: 0..1 extra darkening, still: true to freeze animation }
import { COL, rgba } from '../ui/core.js';

const W = 1280, H = 720, TAU = Math.PI * 2;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- offscreen cache ----
const cache = new Map();
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function layer(key, fn, w = W, h = H) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  let c = cache.get(key);
  if (!c) { c = mk(w, h); const g = c.getContext('2d'); if (!g) return null; fn(g); cache.set(key, c); if (cache.size > 7) cache.delete(cache.keys().next().value); }
  else { cache.delete(key); cache.set(key, c); }
  return c;
}
function stat(ctx, key, fn, x = 0, y = 0) { const c = layer(key, fn); if (c) ctx.drawImage(c, x, y); else fn(ctx); }
// small radial sprite for additive glows (cheap to blit)
function glowSprite(key, color, size = 128) {
  const c = layer('glow_' + key, (g) => { const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); r.addColorStop(0, rgba(color, 1)); r.addColorStop(0.35, rgba(color, 0.4)); r.addColorStop(1, rgba(color, 0)); g.fillStyle = r; g.fillRect(0, 0, size, size); }, size, size);
  return c;
}
function glow(ctx, key, color, x, y, r, a = 1) {
  const s = glowSprite(key, color);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, Math.min(1, a));
  if (s) ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  else { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(color, 0.6)); g.addColorStop(1, rgba(color, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  ctx.restore();
}
const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function vgrad(g, y0, y1, stops, x = 0, w = W) { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(x, y0, w, y1 - y0); }
function noise(g, seed, n, color, alpha, maxR = 1.5, y0 = 0, y1 = H) { const r = rng(seed); g.fillStyle = color; g.globalAlpha = alpha; for (let i = 0; i < n; i++) { g.fillRect(r() * W, y0 + r() * (y1 - y0), 1 + r() * maxR, 1 + r() * maxR); } g.globalAlpha = 1; }

export function drawVignette(ctx, strength = 0.6) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, H * 1.02);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
// cone of light from (x,y) pointing down (angle 0) or rotated; len px long, spread = half width at the far end.
export function drawLampCone(ctx, x, y, len = 500, spread = 160, alpha = 0.25, color = '#F2C14E', angle = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, 0, 0, len); g.addColorStop(0, rgba(color, alpha)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(spread, len); ctx.lineTo(-spread, len); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---- dust motes ----
const MOTES = {};
function motes(seed, n) { return MOTES[seed + '_' + n] || (MOTES[seed + '_' + n] = (() => { const r = rng(seed), a = []; for (let i = 0; i < n; i++) a.push({ x: r() * W, y: r() * H, s: 0.3 + r() * 0.7, ph: r() * TAU, sp: 6 + r() * 14, z: 0.5 + r() * 1.6 }); return a; })()); }
// draw drifting motes; `inCone(x,y)->0..1` optional brightness mask
function drawMotes(ctx, t, seed, n, color, alpha, mask, rise = false) {
  const m = motes(seed, n); ctx.save(); ctx.fillStyle = color; ctx.globalCompositeOperation = 'lighter';
  for (const d of m) {
    const x = (d.x + Math.sin(t * 0.25 * d.s + d.ph) * 22 + t * d.sp * 0.3 * (rise ? 0.2 : 1)) % W;
    const y = rise ? (((d.y - t * d.sp * 1.3) % H) + H) % H : (d.y + Math.sin(t * 0.3 * d.s + d.ph * 2) * 16 + t * d.sp * 0.25) % H;
    const k = mask ? mask(x < 0 ? x + W : x, y) : 1; if (k <= 0.01) continue;
    ctx.globalAlpha = alpha * k * (0.5 + 0.5 * Math.sin(t * 1.3 * d.s + d.ph));
    ctx.fillRect(x, y, d.z, d.z);
  }
  ctx.restore();
}

// ---- shared bits ----
function lightFlicker(t, seed) { const a = Math.sin(t * 23.1 + seed) * Math.sin(t * 7.7 + seed * 2.3); const b = Math.sin(t * 1.7 + seed); const burst = Math.sin(t * 0.37 + seed * 5) > 0.93 ? (Math.sin(t * 60 + seed) > 0 ? -0.5 : 0.1) : 0; return Math.max(0.15, 0.88 + a * 0.07 + b * 0.05 + burst); }
function darkenOverlay(ctx, o) { if (o && o.dim) { ctx.fillStyle = `rgba(0,0,0,${o.dim})`; ctx.fillRect(0, 0, W, H); } }

// ======================================================================================
// WARD
// ======================================================================================
function wardStatic(g) {
  vgrad(g, 0, H, [[0, '#1d3228'], [0.7, '#2F4A3A'], [1, '#1b2a22']]);
  // wall tiles
  const r = rng(11);
  for (let y = 40; y < 505; y += 36) for (let x = 0; x < W; x += 56) { const v = r(); g.fillStyle = `rgba(${150 + v * 40},${210 + v * 30},${180 + v * 30},${0.05 + v * 0.07})`; g.fillRect(x + 1, y + 1, 54, 34); }
  g.strokeStyle = 'rgba(8,18,13,.55)'; g.lineWidth = 2; g.beginPath(); for (let y = 40; y <= 505; y += 36) { g.moveTo(0, y); g.lineTo(W, y); } for (let x = 0; x <= W; x += 56) { g.moveTo(x, 40); g.lineTo(x, 505); } g.stroke();
  // ceiling band + dado rail
  rect(g, 0, 0, W, 40, '#14201a'); rect(g, 0, 36, W, 4, '#0b130f');
  rect(g, 0, 470, W, 36, '#25382e'); rect(g, 0, 470, W, 3, 'rgba(255,255,255,.12)'); rect(g, 0, 503, W, 3, '#0b130f');
  // double doors with portholes (left)
  rect(g, 70, 120, 250, 350, '#101a15'); for (let i = 0; i < 2; i++) { const x = 78 + i * 121; vgrad(g, 128, 470, [[0, '#4e6a5a'], [1, '#2c4036']], x, 117); g.strokeStyle = '#0b130f'; g.lineWidth = 3; g.strokeRect(x, 128, 117, 342); g.beginPath(); g.arc(x + (i ? 30 : 87), 230, 34, 0, TAU); g.fillStyle = '#7fb7a0'; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; g.lineWidth = 6; g.strokeStyle = '#a9b8b0'; g.stroke(); rect(g, x + (i ? 8 : 100), 330, 9, 28, '#b8c4be'); rect(g, x, 400, 117, 6, 'rgba(0,0,0,.25)'); }
  // cross sign
  rect(g, 560, 80, 160, 70, '#1a2a22'); g.fillStyle = '#6fbf8c'; g.fillRect(630, 90, 20, 50); g.fillRect(615, 105, 50, 20); g.strokeStyle = '#0b130f'; g.lineWidth = 3; g.strokeRect(560, 80, 160, 70);
  // pipe with drip nozzle (right top)
  rect(g, 1010, 40, 14, 120, '#5a6a62'); rect(g, 1010, 150, 70, 12, '#5a6a62'); rect(g, 1070, 150, 14, 16, '#7a8a82'); rect(g, 1008, 100, 18, 6, '#8a9a92');
  // floor
  vgrad(g, 506, H, [[0, '#2c4337'], [0.4, '#365446'], [1, '#14201a']]);
  g.save(); g.beginPath(); g.rect(0, 506, W, H - 506); g.clip(); g.strokeStyle = 'rgba(8,18,13,.5)'; g.lineWidth = 2; g.beginPath();
  for (let i = -12; i <= 12; i++) { g.moveTo(640 + i * 40, 506); g.lineTo(640 + i * 170, H); }
  for (let k = 1; k < 8; k++) { const y = 506 + (k * k) * 4.4; g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); g.restore();
  // gurney silhouette (right)
  g.save(); g.translate(930, 0); g.fillStyle = '#0e1713';
  g.fillRect(0, 372, 250, 22); g.fillStyle = '#16231d'; g.fillRect(8, 348, 234, 26); g.beginPath(); g.moveTo(24, 348); g.quadraticCurveTo(120, 318, 226, 348); g.fill(); // sheeted body hint
  g.fillStyle = '#0e1713'; g.fillRect(14, 394, 8, 70); g.fillRect(228, 394, 8, 70); g.fillRect(20, 440, 210, 6);
  for (const x of [18, 232]) { g.beginPath(); g.arc(x, 478, 14, 0, TAU); g.fill(); }
  g.fillRect(246, 250, 6, 130); g.fillRect(226, 250, 46, 5); g.beginPath(); g.ellipse(250, 300, 14, 24, 0, 0, TAU); g.fillStyle = '#1e302a'; g.fill(); g.restore();
  // fixtures: tube light housings
  for (const x of [320, 640, 960]) { rect(g, x - 2, 0, 4, 52, '#0b130f'); rect(g, x - 120, 52, 240, 12, '#26352d'); rect(g, x - 116, 64, 232, 8, '#cfe9dc'); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 116, 70, 232, 3); }
  noise(g, 5, 700, '#000', 0.12, 2);
  drawVignetteTo(g, 0.55);
}
function drawVignetteTo(g, s) { const gr = g.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, H * 1.02); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${s})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
function wardDyn(ctx, t, o) {
  const xs = [320, 640, 960];
  xs.forEach((x, i) => {
    const f = lightFlicker(t, i * 3.1 + 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9 * f; ctx.fillStyle = '#e8fff0'; ctx.fillRect(x - 116, 64, 232, 8); ctx.restore();
    glow(ctx, 'wardg', '#bfffd8', x, 80, 190, 0.38 * f);
    drawLampCone(ctx, x, 72, 420, 210, 0.13 * f, '#cfffe0');
    // floor reflection streak
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 * f; ctx.translate(x, 640); ctx.scale(1, 0.18); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 240); g.addColorStop(0, 'rgba(200,255,220,.9)'); g.addColorStop(1, 'rgba(200,255,220,0)'); ctx.fillStyle = g; ctx.fillRect(-240, -240, 480, 480); ctx.restore();
  });
  // drip
  const cyc = (t * 0.55) % 1; const dx = 1077, y0 = 166, y1 = 590;
  ctx.save();
  if (cyc < 0.15) { const s = cyc / 0.15; ctx.fillStyle = 'rgba(190,230,220,.8)'; ctx.beginPath(); ctx.ellipse(dx, y0 + 4 * s, 2 + 2 * s, 3 + 4 * s, 0, 0, TAU); ctx.fill(); }
  else if (cyc < 0.6) { const k = (cyc - 0.15) / 0.45; const yy = y0 + 10 + k * k * (y1 - y0); ctx.fillStyle = 'rgba(190,230,220,.85)'; ctx.beginPath(); ctx.ellipse(dx, yy, 3, 5, 0, 0, TAU); ctx.fill(); }
  else { const k = (cyc - 0.6) / 0.4; ctx.strokeStyle = `rgba(190,230,220,${0.5 * (1 - k)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(dx, y1, 4 + k * 30, 1 + k * 8, 0, 0, TAU); ctx.stroke(); }
  ctx.restore();
  drawMotes(ctx, t, 21, 30, '#d8ffe8', 0.4);
}

// ======================================================================================
// MARKET
// ======================================================================================
function jarShelf(g, x, y, w, rows, seed, glass = true) {
  const r = rng(seed); const cols = ['#7a9a5a', '#a0522d', '#c9a227', '#6a4a7a', '#8a2f3a', '#4a7a7a'];
  for (let k = 0; k < rows; k++) { const sy = y + k * 62; rect(g, x, sy + 52, w, 8, '#2a1c12'); rect(g, x, sy + 60, w, 3, 'rgba(0,0,0,.4)'); let px = x + 8; while (px < x + w - 40) { const jw = 24 + r() * 26, jh = 28 + r() * 20; const c = cols[(r() * cols.length) | 0]; g.fillStyle = 'rgba(20,14,10,.7)'; g.fillRect(px, sy + 52 - jh, jw, jh); g.fillStyle = c; g.globalAlpha = 0.4 + r() * 0.3; g.fillRect(px + 2, sy + 52 - jh * 0.75, jw - 4, jh * 0.75 - 2); g.globalAlpha = 1; g.fillStyle = '#3a2a1c'; g.fillRect(px + 3, sy + 52 - jh - 5, jw - 6, 5); px += jw + 6 + r() * 8; } }
}
function marketFar(g) {
  vgrad(g, 0, H, [[0, '#120c08'], [0.6, '#2a1c12'], [1, '#150e09']]);
  // back wall with arches openings showing shelves
  for (const cx of [210, 640, 1070]) {
    g.fillStyle = '#0b0705'; g.beginPath(); g.moveTo(cx - 150, 520); g.lineTo(cx - 150, 260); g.arc(cx, 260, 150, Math.PI, 0); g.lineTo(cx + 150, 520); g.closePath(); g.fill();
    g.save(); g.clip(); jarShelf(g, cx - 150, 150, 300, 6, cx); const gr = g.createLinearGradient(0, 120, 0, 520); gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = gr; g.fillRect(cx - 150, 100, 300, 430); g.restore();
  }
}
function marketMid(g) {
  // stone wall with arches (openings cut out via evenodd)
  g.save(); g.beginPath(); g.rect(0, 0, W, 540);
  for (const cx of [210, 640, 1070]) { g.moveTo(cx - 150, 540); g.lineTo(cx - 150, 260); g.arc(cx, 260, 150, Math.PI, 0); g.lineTo(cx + 150, 540); g.closePath(); }
  g.clip('evenodd'); vgrad(g, 0, 540, [[0, '#1c130d'], [1, '#3a281a']]);
  const r = rng(7); for (let y = 0; y < 540; y += 38) for (let x = -((y / 38) % 2) * 45; x < W; x += 90) { const v = r(); g.fillStyle = `rgba(${90 + v * 50},${60 + v * 30},${40 + v * 20},${0.14 + v * 0.12})`; g.fillRect(x + 2, y + 2, 86, 34); }
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3; g.beginPath(); for (let y = 0; y <= 540; y += 38) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); g.restore();
  // arch voussoirs
  g.strokeStyle = '#4a3422'; g.lineWidth = 14; for (const cx of [210, 640, 1070]) { g.beginPath(); g.arc(cx, 260, 157, Math.PI, 0); g.stroke(); g.strokeStyle = '#150e09'; g.lineWidth = 2; for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * Math.PI; g.beginPath(); g.moveTo(cx + Math.cos(a) * 150, 260 + Math.sin(a) * 150); g.lineTo(cx + Math.cos(a) * 164, 260 + Math.sin(a) * 164); g.stroke(); } g.strokeStyle = '#4a3422'; g.lineWidth = 14; }
  // floor cobbles
  vgrad(g, 540, H, [[0, '#2a1c12'], [1, '#0e0906']]);
  const f = rng(3); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; for (let row = 0; row < 7; row++) { const y = 540 + row * row * 3.8 + row * 8, h = 10 + row * 4; for (let x = -20; x < W; x += 40 + row * 10) { const o = f() * 8; g.beginPath(); g.ellipse(x + o + (row % 2) * 20, y + h / 2, 20 + row * 5, h / 2, 0, 0, TAU); g.fillStyle = `rgba(110,80,55,${0.08 + f() * 0.1})`; g.fill(); g.stroke(); } }
  // ceiling beams
  rect(g, 0, 0, W, 36, '#0b0705'); for (let x = 60; x < W; x += 240) rect(g, x, 0, 26, 56, '#150e09');
}
function marketNear(g) {
  // foreground pillars + crates
  for (const [x, w] of [[-30, 120], [1190, 120]]) { vgrad(g, 0, H, [[0, '#0a0604'], [1, '#1a110b']], x, w); rect(g, x + w - 6, 0, 6, H, 'rgba(255,200,120,.06)'); }
  g.fillStyle = '#120b07'; g.fillRect(40, 640, 150, 90); g.fillRect(1070, 650, 160, 80); g.strokeStyle = '#2a1c12'; g.lineWidth = 3; g.strokeRect(40, 640, 150, 90); g.strokeRect(1070, 650, 160, 80);
  noise(g, 4, 500, '#000', 0.14, 2); drawVignetteTo(g, 0.6);
}
const LANTERNS = [[330, 40, 130], [640, 30, 90], [960, 40, 140], [120, 30, 110], [1170, 30, 120]];
function lantern(ctx, x, y, len, ang, f) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = '#0b0705'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke(); ctx.setLineDash([]);
  ctx.translate(0, len); ctx.fillStyle = '#1a110b'; ctx.fillRect(-14, -6, 28, 6); ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(11, 32); ctx.lineTo(-11, 32); ctx.closePath(); ctx.fillStyle = `rgb(${200 + 40 * f},${130 + 50 * f},40)`; ctx.fill(); ctx.strokeStyle = '#0b0705'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 32); ctx.moveTo(-11, 16); ctx.lineTo(11, 16); ctx.stroke(); ctx.fillStyle = '#0b0705'; ctx.fillRect(-13, 32, 26, 5);
  ctx.restore(); return [x + Math.sin(ang) * (len + 16), y + Math.cos(ang) * (len + 16)];
}
function marketDyn(ctx, t, o) {
  LANTERNS.forEach(([x, y, len], i) => {
    const ang = Math.sin(t * 0.9 + i * 1.7) * 0.07; const f = 0.8 + 0.2 * Math.sin(t * 9 + i * 2) * Math.sin(t * 3.3 + i);
    const [lx, ly] = lantern(ctx, x, y, len, ang, f);
    glow(ctx, 'mkg', '#ffb450', lx, ly, 230, 0.55 * f);
    glow(ctx, 'mkg', '#ffb450', lx + Math.sin(ang) * 40, 600, 220, 0.12 * f); // light pool on floor sways
  });
  drawMotes(ctx, t, 31, 45, '#ffd9a0', 0.55);
}
function marketDraw(ctx, t, o) {
  const dx = Math.sin(t * 0.12) * 6;
  ctx.save(); ctx.translate(640, 360); ctx.scale(1.03, 1.03); ctx.translate(-640 + dx, -360); stat(ctx, 'mk_far', marketFar); ctx.restore();
  stat(ctx, 'mk_mid', marketMid); marketDyn(ctx, t, o);
  ctx.save(); ctx.translate(-dx * 1.5, 0); stat(ctx, 'mk_near', marketNear); ctx.restore();
}

// ======================================================================================
// THEATRE
// ======================================================================================
const EYES = (() => { const r = rng(91), a = []; for (const side of [-1, 1]) for (let tier = 0; tier < 2; tier++) for (let i = 0; i < 9; i++) a.push({ x: side < 0 ? 40 + i * 30 + tier * 6 : 1240 - i * 30 - tier * 6, y: 200 + tier * 105 + (i % 2) * 6, ph: r() * 40, per: 3 + r() * 5, s: 0.8 + r() * 0.5, c: r() < 0.3 ? '#F2C14E' : '#f3ead0' }); return a; })();
function theatreStatic(g) {
  vgrad(g, 0, H, [[0, '#120b1f'], [0.55, '#2a1c44'], [1, '#150d24']]);
  // back wall pattern
  g.strokeStyle = 'rgba(245,230,168,.06)'; g.lineWidth = 1; for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 80); g.lineTo(x + 20, 500); g.stroke(); }
  // proscenium gilt arch
  g.strokeStyle = '#6a4a14'; g.lineWidth = 18; g.beginPath(); g.moveTo(250, 520); g.lineTo(250, 220); g.quadraticCurveTo(250, 60, 640, 60); g.quadraticCurveTo(1030, 60, 1030, 220); g.lineTo(1030, 520); g.stroke(); g.strokeStyle = '#F2C14E'; g.lineWidth = 4; g.stroke();
  // balconies on both sides (curved fronts with seat silhouettes)
  for (const s of [-1, 1]) for (let tier = 0; tier < 2; tier++) {
    const x0 = s < 0 ? 0 : 1280 - 330, y = 170 + tier * 105;
    vgrad(g, y, y + 70, [[0, '#08050f'], [1, '#150d24']], x0, 330);
    g.fillStyle = '#3a1a2a'; g.fillRect(x0, y + 70, 330, 16); g.fillStyle = '#F2C14E'; g.globalAlpha = 0.7; g.fillRect(x0, y + 70, 330, 3); g.globalAlpha = 1;
    for (let i = 0; i < 10; i++) { const bx = x0 + 10 + i * 33; g.fillStyle = '#6a4a14'; g.fillRect(bx, y + 86, 5, 26); }
  }
  // red curtains
  for (const s of [-1, 1]) { const x0 = s < 0 ? 0 : 1280; g.save(); g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + s * 250, 0); g.quadraticCurveTo(x0 + s * 190, 250, x0 + s * 280, 620); g.lineTo(x0, 620); g.closePath(); g.clip();
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#5a0f1e'); g.fillStyle = '#7a1428'; g.fillRect(0, 0, W, 620);
    for (let i = 0; i < 14; i++) { const x = x0 + s * i * 20; const lg = g.createLinearGradient(x, 0, x + s * 20, 0); lg.addColorStop(0, 'rgba(0,0,0,.45)'); lg.addColorStop(0.5, 'rgba(255,120,120,.12)'); lg.addColorStop(1, 'rgba(0,0,0,.4)'); g.fillStyle = lg; g.fillRect(Math.min(x, x + s * 20), 0, 20, 620); }
    g.restore(); }
  // valance with gold fringe
  rect(g, 0, 0, W, 54, '#5a0f1e'); g.fillStyle = '#7a1428'; for (let x = 0; x < W; x += 80) { g.beginPath(); g.moveTo(x, 40); g.quadraticCurveTo(x + 40, 100, x + 80, 40); g.lineTo(x + 80, 0); g.lineTo(x, 0); g.fill(); g.strokeStyle = '#F2C14E'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 40); g.quadraticCurveTo(x + 40, 100, x + 80, 40); g.stroke(); g.fillStyle = '#7a1428'; for (let k = 0; k < 6; k++) { g.fillStyle = '#c9a227'; g.fillRect(x + 8 + k * 11, 50 + Math.sin((k / 6) * Math.PI) * 38, 2, 8); } g.fillStyle = '#7a1428'; }
  // stage floor planks
  vgrad(g, 520, H, [[0, '#3a2414'], [1, '#150d08']]);
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.beginPath(); for (let i = -14; i <= 14; i++) { g.moveTo(640 + i * 36, 520); g.lineTo(640 + i * 120, H); } g.stroke();
  g.fillStyle = 'rgba(245,230,168,.08)'; g.fillRect(0, 520, W, 3); g.fillStyle = '#F2C14E'; g.globalAlpha = 0.6; g.fillRect(0, 700, W, 4); g.globalAlpha = 1;
  noise(g, 8, 500, '#000', 0.12, 2); drawVignetteTo(g, 0.6);
}
function eye(ctx, e, t) {
  const cyc = (t + e.ph) % e.per; const open = cyc > 0.18 ? 1 : Math.abs(cyc / 0.18 - 0.5) * 2;
  const w = 9 * e.s, h = 5 * e.s * open; if (h < 0.4) { ctx.fillStyle = '#08050f'; ctx.fillRect(e.x - w, e.y - 0.5, w * 2, 1.2); return; }
  ctx.beginPath(); ctx.moveTo(e.x - w, e.y); ctx.quadraticCurveTo(e.x, e.y - h * 1.6, e.x + w, e.y); ctx.quadraticCurveTo(e.x, e.y + h * 1.6, e.x - w, e.y); ctx.fillStyle = e.c; ctx.fill();
  ctx.beginPath(); ctx.arc(e.x + Math.sin(t * 0.4 + e.ph) * 2, e.y, h * 0.7, 0, TAU); ctx.fillStyle = '#10081c'; ctx.fill();
}
function theatreDyn(ctx, t, o) {
  ctx.save(); ctx.globalAlpha = 0.85; for (const e of EYES) eye(ctx, e, t); ctx.restore();
  // spotlights swinging
  [[330, 1], [950, -1]].forEach(([x, s], i) => { const a = Math.sin(t * 0.5 + i * 2) * 0.25 + s * -0.15; drawLampCone(ctx, x, 0, 640, 150, 0.2, i ? '#ffd9a0' : '#F5E6A8', a); glow(ctx, 'thg', '#F5E6A8', x + Math.sin(-a) * 520 * 0 + (-Math.sin(a) * -600), 600, 140, 0.18); });
  // footlights
  for (let i = 0; i < 26; i++) { const x = 30 + i * 48; const f = 0.7 + 0.3 * Math.sin(t * 6 + i * 1.9); glow(ctx, 'thf', '#ffc860', x, 702, 26, 0.7 * f); }
  drawMotes(ctx, t, 41, 30, '#e8d0ff', 0.4);
}

// ======================================================================================
// MAPS: a chart pinned on a slab
// ======================================================================================
const MAPTINT = { map1: ['#2F4A3A', '#9bc2a8'], map2: ['#3A2A1E', '#c8a07a'], map3: ['#1E1630', '#b0a0d8'] };
function mapStatic(g, theme) {
  const [tint, ink] = MAPTINT[theme];
  rect(g, 0, 0, W, H, '#1A1614'); const r = rng(77); for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`; g.lineWidth = 1; g.beginPath(); const x = r() * W, y = r() * H; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 200, y + (r() - 0.5) * 30); g.stroke(); }
  // chart paper
  g.save(); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 30; g.shadowOffsetY = 8; g.fillStyle = '#2b2622'; g.fillRect(34, 26, 1212, 668); g.restore();
  g.fillStyle = tint; g.fillRect(34, 26, 1212, 668); g.fillStyle = 'rgba(232,220,196,.1)'; g.fillRect(34, 26, 1212, 668);
  g.strokeStyle = ink; g.globalAlpha = 0.16; g.lineWidth = 1; for (let x = 34; x < 1246; x += 40) { g.beginPath(); g.moveTo(x, 26); g.lineTo(x, 694); g.stroke(); } for (let y = 26; y < 694; y += 40) { g.beginPath(); g.moveTo(34, y); g.lineTo(1246, y); g.stroke(); }
  // faint anatomy: spine and ribs
  g.globalAlpha = 0.1; g.lineWidth = 3; g.beginPath(); g.moveTo(640, 60); g.bezierCurveTo(610, 200, 670, 400, 640, 660); g.stroke(); for (let i = 0; i < 9; i++) { const y = 140 + i * 38, w = 150 - Math.abs(i - 3) * 14; g.beginPath(); g.moveTo(640, y); g.quadraticCurveTo(640 - w, y - 30, 640 - w * 1.4, y + 40); g.moveTo(640, y); g.quadraticCurveTo(640 + w, y - 30, 640 + w * 1.4, y + 40); g.stroke(); }
  g.globalAlpha = 0.2; g.lineWidth = 2; g.strokeStyle = ink; g.strokeRect(54, 46, 1172, 628); g.setLineDash([10, 6]); g.strokeRect(62, 54, 1156, 612); g.setLineDash([]); g.globalAlpha = 1;
  // pins and clips
  for (const [x, y] of [[54, 46], [1226, 46], [54, 674], [1226, 674]]) { g.beginPath(); g.arc(x + 1, y + 3, 9, 0, TAU); g.fillStyle = 'rgba(0,0,0,.5)'; g.fill(); g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fillStyle = '#B3263A'; g.fill(); g.beginPath(); g.arc(x - 2, y - 3, 3, 0, TAU); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill(); }
  noise(g, 6, 600, '#000', 0.08, 2); drawVignetteTo(g, 0.55);
}
function mapDyn(ctx, t, o) { const f = 0.9 + 0.1 * Math.sin(t * 0.8); glow(ctx, 'mapg', '#fff3d0', 640, 330, 520, 0.05 * f); drawMotes(ctx, t, 51, 14, '#e8dcc4', 0.25); }

// ======================================================================================
// TITLE
// ======================================================================================
function titleStatic(g) {
  rect(g, 0, 0, W, H, '#050407'); vgrad(g, 0, H, [[0, '#07060a'], [0.7, '#0e0b10'], [1, '#050407']]);
  // stitched card silhouettes hanging on strings
  const r = rng(13); for (let i = 0; i < 12; i++) { const x = 60 + (i / 11) * 1160 + (r() - 0.5) * 40, y = 70 + r() * 250 + Math.abs(i - 5.5) * 6, rot = (r() - 0.5) * 0.5; if (Math.abs(x - 640) < 190) continue; g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = 'rgba(70,60,60,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -y); g.lineTo(0, -75); g.stroke(); g.fillStyle = 'rgba(32,26,28,.9)'; g.fillRect(-35, -75, 70, 104); g.strokeStyle = 'rgba(120,100,95,.35)'; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.strokeRect(-30, -70, 60, 94); g.setLineDash([]); g.beginPath(); g.moveTo(-20, -30); g.lineTo(-6, -40); g.lineTo(8, -24); g.lineTo(20, -36); g.strokeStyle = 'rgba(179,38,58,.35)'; g.stroke(); g.restore(); }
  // floor
  vgrad(g, 520, H, [[0, '#14100f'], [1, '#050407']]);
  // table: base column + slab
  g.fillStyle = '#17141a'; g.fillRect(600, 560, 80, 140); g.fillRect(540, 690, 200, 18); g.fillStyle = '#25212a'; g.fillRect(620, 560, 14, 130);
  g.beginPath(); g.moveTo(330, 520); g.lineTo(950, 520); g.lineTo(1010, 560); g.lineTo(270, 560); g.closePath(); const tg = g.createLinearGradient(0, 520, 0, 560); tg.addColorStop(0, '#9aa3a8'); tg.addColorStop(1, '#3a4146'); g.fillStyle = tg; g.fill();
  g.fillStyle = '#20252a'; g.fillRect(270, 560, 740, 14); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(270, 560, 740, 2);
  // sheeted shape on the table
  g.beginPath(); g.moveTo(380, 522); g.quadraticCurveTo(420, 470, 470, 486); g.quadraticCurveTo(560, 455, 650, 490); g.quadraticCurveTo(780, 500, 850, 515); g.lineTo(880, 522); g.closePath(); g.fillStyle = '#c9c4b4'; g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.stroke(); g.beginPath(); g.moveTo(520, 470); g.lineTo(540, 520); g.moveTo(700, 488); g.lineTo(720, 520); g.stroke();
  g.beginPath(); g.moveTo(560, 458); g.lineTo(600, 462); g.strokeStyle = 'rgba(179,38,58,.7)'; g.lineWidth = 3; g.stroke();
  noise(g, 3, 400, '#fff', 0.03, 1.5);
}
function titleDyn(ctx, t, o) {
  // dark overlay lifted by lamp: draw everything dim by a multiply-ish dark pass
  const ang = Math.sin(t * 0.75) * 0.13; const px = 640, py = 0, L = 150;
  const lx = px + Math.sin(ang) * L, ly = py + Math.cos(ang) * L;
  // cable
  ctx.save(); ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(lx, ly); ctx.stroke();
  // lamp head
  ctx.translate(lx, ly); ctx.rotate(ang * 0.6); ctx.beginPath(); ctx.ellipse(0, 8, 62, 16, 0, Math.PI, 0); ctx.fillStyle = '#4a4f55'; ctx.fill(); ctx.beginPath(); ctx.moveTo(-62, 8); ctx.lineTo(62, 8); ctx.lineTo(48, 22); ctx.lineTo(-48, 22); ctx.closePath(); ctx.fillStyle = '#2a2d31'; ctx.fill();
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 18, 22, 5, 0, TAU); ctx.fillStyle = '#fff3c0'; ctx.fill(); } ctx.restore();
  const f = 0.92 + 0.08 * Math.sin(t * 11) * Math.sin(t * 2.1);
  glow(ctx, 'ttl', '#ffe3a0', lx, ly + 24, 120, 0.9 * f);
  const dir = -ang * 0.9; drawLampCone(ctx, lx, ly + 22, 520, 260, 0.32 * f, '#ffe3a0', dir * 0.5);
  const cx = lx + Math.sin(-dir * 0.5) * 0 - Math.sin(dir * 0.5) * 520; // pool center on table
  glow(ctx, 'ttp', '#ffe3a0', cx + 0, 535, 330, 0.5 * f);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * f; ctx.fillStyle = '#ffe9bd'; ctx.beginPath(); ctx.ellipse(cx, 536, 280, 20, 0, 0, TAU); ctx.fill(); ctx.restore();
  drawMotes(ctx, t, 61, 70, '#fff0c8', 0.9, (x, y) => { const d = Math.abs(x - (lx + (x - lx) * 0)) ; const w = 30 + (y / 520) * 250; const k = 1 - Math.abs(x - (lx - Math.sin(dir * 0.5) * y)) / w; return y < 560 ? Math.max(0, k) : 0; });
  darkenOverlay(ctx, o);
}
function titleDraw(ctx, t, o) { stat(ctx, 'title', titleStatic); titleDyn(ctx, t, o); drawVignette(ctx, 0.75); }

// ======================================================================================
// TABLE (graft pick)
// ======================================================================================
function tableStatic(g) {
  vgrad(g, 0, H, [[0, '#0c0a09'], [0.5, '#1a1614'], [1, '#0a0807']]);
  // slab surface texture
  const r = rng(23); for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(255,255,255,${0.015 + r() * 0.03})`; g.lineWidth = 1; g.beginPath(); const x = r() * W, y = r() * H; g.moveTo(x, y); g.lineTo(x + 40 + r() * 260, y + (r() - 0.5) * 6); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3; g.strokeRect(14, 14, W - 28, H - 28); g.strokeStyle = 'rgba(180,190,195,.18)'; g.lineWidth = 1.5; g.strokeRect(20, 20, W - 40, H - 40);
  // left tray: scalpels, clamps, needles, spool
  tray(g, 38, 150, 190, 430);
  g.save(); for (let i = 0; i < 4; i++) { const y = 190 + i * 48; g.fillStyle = '#c9d2d8'; g.fillRect(62, y, 70, 4); g.fillStyle = '#5a6066'; g.fillRect(130, y - 2, 70, 8); g.beginPath(); g.moveTo(62, y); g.lineTo(46, y + 5); g.lineTo(62, y + 4); g.fillStyle = '#e8eef2'; g.fill(); }
  for (let i = 0; i < 2; i++) { const y = 395 + i * 55; g.strokeStyle = '#aab4ba'; g.lineWidth = 6; g.beginPath(); g.moveTo(60, y); g.lineTo(170, y + 8); g.stroke(); g.lineWidth = 4; g.beginPath(); g.arc(58, y - 8, 10, 0, TAU); g.arc(58, y + 12, 10, 0, TAU); g.stroke(); }
  g.fillStyle = '#d6c7a6'; g.fillRect(160, 505, 36, 44); g.fillStyle = '#B3263A'; g.fillRect(160, 513, 36, 28); g.fillStyle = '#d6c7a6'; g.fillRect(156, 503, 44, 8); g.fillRect(156, 543, 44, 8);
  for (let i = 0; i < 4; i++) { g.strokeStyle = '#dfe4e8'; g.lineWidth = 2; g.beginPath(); g.moveTo(70 + i * 12, 560); g.lineTo(110 + i * 12, 546); g.stroke(); } g.restore();
  // right tray: jars, staple gun, bandage
  tray(g, 1052, 150, 190, 430);
  jarShelf(g, 1062, 160, 170, 1, 55); g.save(); g.fillStyle = 'rgba(160,200,190,.3)'; for (const [x, y] of [[1090, 250], [1170, 250]]) { g.fillRect(x - 24, y, 48, 70); g.strokeStyle = '#aab4ba'; g.lineWidth = 3; g.strokeRect(x - 24, y, 48, 70); g.fillStyle = '#8a2f3a'; g.fillRect(x - 20, y + 25, 40, 40); g.fillStyle = 'rgba(160,200,190,.3)'; }
  g.fillStyle = '#4a4f55'; g.fillRect(1075, 380, 130, 32); g.fillStyle = '#B3263A'; g.fillRect(1075, 396, 130, 16); g.fillRect(1190, 372, 30, 12); g.fillStyle = '#22262a'; g.fillRect(1090, 412, 20, 30);
  g.fillStyle = '#e8dcc4'; g.beginPath(); g.arc(1110, 500, 34, 0, TAU); g.fill(); g.fillStyle = '#26201c'; g.beginPath(); g.arc(1110, 500, 14, 0, TAU); g.fill(); g.fillStyle = '#d6c7a6'; g.fillRect(1148, 490, 46, 20); g.restore();
  // top/bottom instruments rows
  for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(190,200,205,.5)'; g.fillRect(300 + i * 90, 36, 4, 56); g.beginPath(); g.arc(302 + i * 90, 96, 5, 0, TAU); g.fill(); }
  noise(g, 12, 500, '#000', 0.14, 2);
}
function tray(g, x, y, w, h) { g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 16; g.fillStyle = '#2d3236'; g.fillRect(x, y, w, h); g.restore(); const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#59616a'); gr.addColorStop(1, '#2a2f34'); g.fillStyle = gr; g.fillRect(x + 6, y + 6, w - 12, h - 12); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 12, y + 12, w - 24, h - 24); }
function tableDyn(ctx, t, o) {
  const f = 0.92 + 0.08 * Math.sin(t * 1.3) + 0.03 * Math.sin(t * 17);
  glow(ctx, 'tbl', '#ffe3a0', 640, 380, 560, 0.55 * f);
  glow(ctx, 'tbl', '#fff3d0', 640, 360, 320, 0.3 * f);
  drawLampCone(ctx, 640, -20, 420, 300, 0.12 * f, '#ffe3a0');
  drawMotes(ctx, t, 71, 36, '#fff0c8', 0.7, (x, y) => Math.max(0, 1 - Math.hypot(x - 640, (y - 360) * 1.3) / 520));
}
function tableDraw(ctx, t, o) { stat(ctx, 'table', tableStatic); tableDyn(ctx, t, o); drawVignette(ctx, 0.7); }

// ======================================================================================
// SHOP
// ======================================================================================
const ORGANS = ['heart', 'lung', 'eye', 'tooth', 'brain'];
function organ(ctx, kind, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (kind === 'heart') { ctx.beginPath(); ctx.moveTo(0, 14); ctx.bezierCurveTo(-24, -2, -14, -20, 0, -8); ctx.bezierCurveTo(14, -20, 24, -2, 0, 14); ctx.fillStyle = '#8a1f33'; ctx.fill(); }
  else if (kind === 'lung') { ctx.fillStyle = '#b06a78'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 9, 0, 8, 15, sx * 0.2, 0, TAU); ctx.fill(); } }
  else if (kind === 'eye') { ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fillStyle = '#e8dcc4'; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fillStyle = '#4a8a5a'; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fillStyle = '#000'; ctx.fill(); }
  else if (kind === 'tooth') { ctx.fillStyle = '#e8dcc4'; ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(9, -10); ctx.lineTo(7, 4); ctx.lineTo(3, 14); ctx.lineTo(0, 4); ctx.lineTo(-3, 14); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill(); }
  else { ctx.fillStyle = '#c98a9a'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 11, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#8a4a5a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, -8, 10, 0); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke(); }
  ctx.restore();
}
function hangingJar(ctx, x, y, len, ang, kind, t, tint) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = '#0b0705'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke(); ctx.translate(0, len);
  ctx.fillStyle = '#2a1c12'; ctx.fillRect(-16, 0, 32, 8);
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-22, 8, 44, 70, 12) : ctx.rect(-22, 8, 44, 70); ctx.fillStyle = tint; ctx.fill(); ctx.strokeStyle = 'rgba(220,240,230,.55)'; ctx.lineWidth = 2; ctx.stroke();
  organ(ctx, kind, 0, 44, 1.1); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(-16, 14, 4, 52);
  for (let i = 0; i < 2; i++) { const k = ((t * 0.4 + i * 0.5) % 1); ctx.beginPath(); ctx.arc(-6 + i * 12, 70 - k * 54, 1.8, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill(); }
  ctx.restore();
}
function shopStatic(g) {
  vgrad(g, 0, H, [[0, '#0d0907'], [1, '#1e130c']]);
  // back shelves
  for (let k = 0; k < 2; k++) jarShelf(g, 40 + k * 640, 150, 600, 5, 100 + k);
  // dim the shelves
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 100, W, 440);
  // canopy
  for (let i = 0; i < 16; i++) { const x = i * 80; g.fillStyle = i % 2 ? '#5a1424' : '#a07a30'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 80, 0); g.lineTo(x + 80, 70); g.quadraticCurveTo(x + 40, 130, x, 70); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 80, 70); }
  // counter
  vgrad(g, 560, H, [[0, '#4a3220'], [0.08, '#2a1c12'], [1, '#0e0906']]); rect(g, 0, 556, W, 8, '#6a4a2a'); rect(g, 0, 564, W, 2, 'rgba(0,0,0,.6)');
  for (let x = 0; x < W; x += 140) { rect(g, x, 566, 2, H - 566, 'rgba(0,0,0,.4)'); }
  // wares on counter: skulls, scrolls
  g.fillStyle = '#d6c7a6'; for (const x of [80, 1180]) { g.beginPath(); g.arc(x, 540, 20, 0, TAU); g.fill(); g.fillStyle = '#000'; g.fillRect(x - 12, 536, 8, 8); g.fillRect(x + 4, 536, 8, 8); g.fillStyle = '#d6c7a6'; g.fillRect(x - 10, 556, 20, 8); }
  // hooks with hanging items (tools)
  g.strokeStyle = '#1a110b'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 96); g.lineTo(W, 96); g.stroke();
  noise(g, 9, 500, '#000', 0.12, 2); drawVignetteTo(g, 0.55);
}
function shopDyn(ctx, t, o) {
  [[260, 100, 100, 'heart', '#4a8a6a'], [470, 100, 140, 'eye', '#5a7a8a'], [810, 100, 90, 'lung', '#7a8a4a'], [1020, 100, 130, 'brain', '#8a5a7a'], [640, 100, 170, 'tooth', '#5a8a7a']].forEach(([x, y, len, k, tint], i) => {
    const ang = Math.sin(t * 0.8 + i * 1.3) * 0.045; ctx.save(); ctx.globalAlpha = 0.9; hangingJar(ctx, x, y, len, ang, k, t, tint); ctx.restore();
    glow(ctx, 'shj', '#7fe0b0', x + Math.sin(ang) * (len + 40), y + len + 42, 70, 0.22);
  });
  [[150, 96, 90], [1130, 96, 100], [420, 96, 60]].forEach(([x, y, len], i) => { const ang = Math.sin(t * 1.0 + i * 2) * 0.08; const f = 0.8 + 0.2 * Math.sin(t * 8 + i * 3); const [lx, ly] = lantern(ctx, x, y, len, ang, f); glow(ctx, 'mkg', '#ffa840', lx, ly, 260, 0.6 * f); });
  glow(ctx, 'mkg', '#ffa840', 640, 640, 420, 0.1);
  drawMotes(ctx, t, 81, 40, '#ffd9a0', 0.5);
}
function shopDraw(ctx, t, o) { stat(ctx, 'shop', shopStatic); shopDyn(ctx, t, o); }

// ======================================================================================
// FORGE
// ======================================================================================
function forgeStatic(g) {
  vgrad(g, 0, H, [[0, '#1a0e08'], [0.6, '#3a1d0f'], [1, '#150b06']]);
  const r = rng(5); for (let y = 0; y < 560; y += 30) for (let x = -((y / 30) % 2) * 35; x < W; x += 70) { const v = r(); g.fillStyle = `rgba(${120 + v * 60},${50 + v * 30},${25 + v * 15},${0.18 + v * 0.14})`; g.fillRect(x + 2, y + 2, 66, 26); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
  // hearth with arch
  g.fillStyle = '#0d0705'; g.beginPath(); g.moveTo(180, 560); g.lineTo(180, 300); g.arc(340, 300, 160, Math.PI, 0); g.lineTo(500, 560); g.closePath(); g.fill(); g.strokeStyle = '#5a3a24'; g.lineWidth = 22; g.stroke();
  g.fillStyle = '#2a1c14'; g.beginPath(); g.moveTo(130, 140); g.lineTo(550, 140); g.lineTo(470, 0); g.lineTo(210, 0); g.fill(); // hood
  // coals bed base
  g.fillStyle = '#1a0c06'; g.fillRect(190, 500, 300, 60);
  // anvil
  g.fillStyle = '#0e0a09'; g.fillRect(860, 560, 130, 120); g.fillStyle = '#2a2e32'; g.beginPath(); g.moveTo(720, 470); g.lineTo(1130, 470); g.quadraticCurveTo(1170, 470, 1180, 500); g.quadraticCurveTo(1060, 510, 1040, 540); g.lineTo(1040, 560); g.lineTo(1080, 580); g.lineTo(770, 580); g.lineTo(810, 560); g.lineTo(810, 540); g.quadraticCurveTo(780, 505, 720, 500); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(730, 472, 400, 4);
  g.fillStyle = '#3a2412'; g.fillRect(830, 580, 220, 140);
  // tool rack on wall: hammers, tongs, scalpels
  g.fillStyle = '#2a1c12'; g.fillRect(640, 150, 400, 10);
  for (let i = 0; i < 6; i++) { const x = 670 + i * 62; g.strokeStyle = '#1a1210'; g.lineWidth = 6; g.beginPath(); g.moveTo(x, 160); g.lineTo(x, 270 - (i % 3) * 14); g.stroke(); g.fillStyle = i % 2 ? '#6a6f74' : '#aab4ba'; if (i % 2) g.fillRect(x - 16, 270 - (i % 3) * 14, 32, 18); else { g.beginPath(); g.moveTo(x - 4, 270 - (i % 3) * 14); g.lineTo(x + 4, 270 - (i % 3) * 14); g.lineTo(x, 310 - (i % 3) * 14); g.fill(); } }
  // giant needle + thread hung on wall
  g.save(); g.translate(1130, 120); g.rotate(0.25); g.fillStyle = '#c9d2d8'; g.fillRect(-3, 0, 6, 250); g.beginPath(); g.ellipse(0, 12, 6, 14, 0, 0, TAU); g.fillStyle = '#1a0e08'; g.fill(); g.restore();
  g.strokeStyle = '#B3263A'; g.lineWidth = 3; g.beginPath(); g.moveTo(1126, 124); g.bezierCurveTo(1060, 200, 1200, 260, 1120, 330); g.stroke();
  // water barrel
  g.fillStyle = '#2a1c12'; g.beginPath(); g.ellipse(620, 590, 56, 100 * 0.35, 0, 0, TAU); g.fill(); g.fillRect(564, 520, 112, 70); g.fillStyle = '#4a3220'; g.beginPath(); g.ellipse(620, 520, 56, 18, 0, 0, TAU); g.fill();
  vgrad(g, 560, H, [[0, '#1c120b'], [1, '#080504']]);
  noise(g, 15, 500, '#000', 0.14, 2); drawVignetteTo(g, 0.6);
}
const SPARKS = (() => { const r = rng(44), a = []; for (let i = 0; i < 30; i++) a.push({ x: 200 + r() * 280, sp: 40 + r() * 80, ph: r() * 10, w: r() * TAU }); return a; })();
function forgeDyn(ctx, t, o) {
  const f = 0.85 + 0.15 * Math.sin(t * 7) * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 19);
  // coals
  const r = rng(2); ctx.save(); for (let i = 0; i < 18; i++) { const x = 210 + r() * 260, y = 508 + r() * 40; const p = 0.5 + 0.5 * Math.sin(t * (1.5 + r() * 2) + i); ctx.fillStyle = `rgb(${200 + 55 * p},${60 + 60 * p},20)`; ctx.beginPath(); ctx.ellipse(x, y, 14 + r() * 8, 8, 0, 0, TAU); ctx.fill(); } ctx.restore();
  // flames
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 5; i++) { const x = 250 + i * 45; const h = 70 + 30 * Math.sin(t * 6 + i * 2) * f; const g = ctx.createLinearGradient(0, 510, 0, 510 - h); g.addColorStop(0, 'rgba(255,170,40,.8)'); g.addColorStop(1, 'rgba(255,60,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 22, 510); ctx.quadraticCurveTo(x - 6 + Math.sin(t * 5 + i) * 6, 510 - h * 0.6, x + Math.sin(t * 4 + i) * 8, 510 - h); ctx.quadraticCurveTo(x + 8, 510 - h * 0.5, x + 22, 510); ctx.fill(); } ctx.restore();
  glow(ctx, 'fg', '#ff7a2a', 340, 480, 360, 0.7 * f); glow(ctx, 'fg', '#ff7a2a', 340, 400, 620, 0.25 * f);
  glow(ctx, 'fg', '#ff9a4a', 900, 480, 280, 0.2 * f); // warm bounce on anvil
  // sparks
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const s of SPARKS) { const k = ((t * s.sp / 300 + s.ph) % 1); const x = s.x + Math.sin(t * 1.6 + s.w) * 24 + k * 40, y = 510 - k * 440; ctx.globalAlpha = (1 - k) * 0.9; ctx.fillStyle = k < 0.4 ? '#ffd86b' : '#ff7a2a'; ctx.fillRect(x, y, 2.2, 2.2); } ctx.restore();
  drawMotes(ctx, t, 91, 24, '#ffb070', 0.5, null, true);
}
function forgeDraw(ctx, t, o) { stat(ctx, 'forge', forgeStatic); forgeDyn(ctx, t, o); }

// ======================================================================================
// EVENT: alley with fog
// ======================================================================================
function eventStatic(g) {
  vgrad(g, 0, H, [[0, '#07090e'], [0.6, '#141a24'], [1, '#0a0c10']]);
  // alley walls in perspective, vanishing point (640,330)
  const vp = [640, 330];
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s < 0 ? 0 : W, 0); g.lineTo(vp[0] + s * 120, vp[1] - 90); g.lineTo(vp[0] + s * 120, vp[1] + 120); g.lineTo(s < 0 ? 0 : W, H); g.closePath(); const gr = g.createLinearGradient(s < 0 ? 0 : W, 0, vp[0], 0); gr.addColorStop(0, '#0c0f14'); gr.addColorStop(1, '#222a36'); g.fillStyle = gr; g.fill();
    g.save(); g.clip(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 14; i++) { const y = i * 55; g.moveTo(s < 0 ? 0 : W, y); g.lineTo(vp[0], vp[1] + (y - vp[1]) * 0.25); } g.stroke();
    // window
    g.fillStyle = 'rgba(255,200,120,.12)'; g.beginPath(); g.moveTo(s < 0 ? 120 : W - 120, 200); g.lineTo(s < 0 ? 220 : W - 220, 215); g.lineTo(s < 0 ? 220 : W - 220, 300); g.lineTo(s < 0 ? 120 : W - 120, 330); g.fill(); g.restore(); }
  // ground
  g.beginPath(); g.moveTo(0, H); g.lineTo(vp[0] - 120, vp[1] + 120); g.lineTo(vp[0] + 120, vp[1] + 120); g.lineTo(W, H); g.closePath(); vgrad(g, 450, H, [[0, '#1a2029'], [1, '#07090c']]); g.fillStyle = 'rgba(40,50,64,.9)'; g.fill();
  g.save(); g.clip(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.beginPath(); for (let i = -10; i <= 10; i++) { g.moveTo(vp[0] + i * 12, vp[1] + 120); g.lineTo(vp[0] + i * 120, H); } for (let k = 1; k < 7; k++) { const y = 450 + k * k * 6; g.moveTo(0, y); g.lineTo(W, y); } g.stroke(); g.restore();
  // doorway at the end
  g.fillStyle = '#05060a'; g.fillRect(vp[0] - 78, vp[1] - 90, 156, 210); g.beginPath(); g.arc(vp[0], vp[1] - 90, 78, Math.PI, 0); g.fill(); g.strokeStyle = '#2a323f'; g.lineWidth = 8; g.beginPath(); g.moveTo(vp[0] - 82, vp[1] + 120); g.lineTo(vp[0] - 82, vp[1] - 90); g.arc(vp[0], vp[1] - 90, 82, Math.PI, 0); g.lineTo(vp[0] + 82, vp[1] + 120); g.stroke();
  g.fillStyle = '#10151c'; g.fillRect(vp[0] - 56, vp[1] - 70, 112, 190); g.strokeStyle = '#05060a'; g.lineWidth = 2; for (let x = -42; x <= 42; x += 28) { g.beginPath(); g.moveTo(vp[0] + x, vp[1] - 70); g.lineTo(vp[0] + x, vp[1] + 120); g.stroke(); }
  // hanging sign
  g.strokeStyle = '#05060a'; g.lineWidth = 4; g.beginPath(); g.moveTo(980, 120); g.lineTo(980, 160); g.stroke(); g.fillStyle = '#10151c'; g.fillRect(940, 160, 80, 40); g.strokeStyle = '#2a323f'; g.lineWidth = 2; g.strokeRect(940, 160, 80, 40);
  noise(g, 17, 500, '#fff', 0.025, 1.5); drawVignetteTo(g, 0.7);
}
function fogSprite() { return layer('fog', (g) => { for (let i = 0; i < 9; i++) { const x = 40 + i * 50 + ((i * 37) % 30), y = 64 + Math.sin(i * 2.1) * 20; const gr = g.createRadialGradient(x, y, 0, x, y, 80); gr.addColorStop(0, 'rgba(150,170,190,.5)'); gr.addColorStop(1, 'rgba(150,170,190,0)'); g.fillStyle = gr; g.fillRect(x - 80, y - 80, 160, 160); } }, 512, 128); }
function fogBand(ctx, t, y, h, speed, alpha, off) { const s = fogSprite(); const w = 1600; const x = -(((t * speed + off) % w) + w) % w; ctx.save(); ctx.globalAlpha = alpha; if (s) { for (let k = 0; k < 2; k++) ctx.drawImage(s, x + k * w, y, w, h); } else { ctx.fillStyle = 'rgba(150,170,190,.2)'; ctx.fillRect(0, y, W, h); } ctx.restore(); }
function eventDyn(ctx, t, o) {
  const f = 0.8 + 0.2 * Math.sin(t * 5.3) * Math.sin(t * 1.9);
  glow(ctx, 'evl', '#ffb86a', 640, 360, 160, 0.4 * f); glow(ctx, 'evl', '#ffb86a', 640, 560, 260, 0.1 * f);
  glow(ctx, 'evl', '#ffc880', 980, 180, 70, 0.25);
  fogBand(ctx, t, 330, 260, 14, 0.5, 0); fogBand(ctx, t, 470, 250, -22, 0.4, 400); fogBand(ctx, t, 180, 200, 9, 0.25, 800);
  drawMotes(ctx, t, 95, 20, '#bcd0e8', 0.3);
}
function eventDraw(ctx, t, o) { stat(ctx, 'event', eventStatic); eventDyn(ctx, t, o); }

// ======================================================================================
// WIN: golden dawn through hospital windows
// ======================================================================================
function winStatic(g) {
  vgrad(g, 0, H, [[0, '#3a2a28'], [1, '#14100f']]);
  // windows: sky behind
  for (const cx of [220, 640, 1060]) {
    g.save(); g.beginPath(); g.moveTo(cx - 100, 470); g.lineTo(cx - 100, 190); g.arc(cx, 190, 100, Math.PI, 0); g.lineTo(cx + 100, 470); g.closePath(); g.clip();
    vgrad(g, 80, 470, [[0, '#f9d38a'], [0.5, '#f4a46a'], [0.8, '#c8607a'], [1, '#6a4a7a']], cx - 100, 200);
    g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(cx, 430, 70, 0, TAU); g.fill();
    // skyline silhouettes
    g.fillStyle = 'rgba(60,40,60,.8)'; for (let i = 0; i < 6; i++) g.fillRect(cx - 100 + i * 36, 410 + ((i * 17) % 40), 30, 80);
    g.restore();
    g.strokeStyle = '#1a1210'; g.lineWidth = 8; g.beginPath(); g.moveTo(cx - 100, 470); g.lineTo(cx - 100, 190); g.arc(cx, 190, 100, Math.PI, 0); g.lineTo(cx + 100, 470); g.closePath(); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(cx, 90); g.lineTo(cx, 470); g.moveTo(cx - 100, 300); g.lineTo(cx + 100, 300); g.moveTo(cx - 100, 390); g.lineTo(cx + 100, 390); g.stroke(); rect(g, cx - 112, 470, 224, 12, '#2a1e1a');
  }
  // wall wainscot, floor
  rect(g, 0, 482, W, 20, '#2a1e1a'); vgrad(g, 502, H, [[0, '#3a2a24'], [1, '#14100f']]);
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 2; g.beginPath(); for (let i = -12; i <= 12; i++) { g.moveTo(640 + i * 40, 502); g.lineTo(640 + i * 160, H); } for (let k = 1; k < 7; k++) { const y = 502 + k * k * 4.5; g.moveTo(0, y); g.lineTo(W, y); } g.stroke();
  // bed silhouettes
  g.fillStyle = 'rgba(20,14,12,.7)'; g.fillRect(40, 560, 200, 16); g.fillRect(1040, 560, 200, 16); g.fillRect(46, 576, 6, 40); g.fillRect(228, 576, 6, 40); g.fillRect(1046, 576, 6, 40); g.fillRect(1228, 576, 6, 40);
  noise(g, 21, 400, '#000', 0.1, 2); drawVignetteTo(g, 0.5);
}
function winDyn(ctx, t, o) {
  const f = 0.9 + 0.1 * Math.sin(t * 0.7);
  for (const cx of [220, 640, 1060]) { glow(ctx, 'win', '#ffd27a', cx, 400, 260, 0.45 * f); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { const cx = [220, 640, 1060][i]; const sh = Math.sin(t * 0.3 + i) * 20; const g = ctx.createLinearGradient(cx, 200, cx - 320 + sh, 720); g.addColorStop(0, `rgba(255,214,130,${0.28 * f})`); g.addColorStop(1, 'rgba(255,214,130,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - 90, 200); ctx.lineTo(cx + 90, 200); ctx.lineTo(cx + 40 - 320 + sh + 220, 720); ctx.lineTo(cx - 320 + sh - 120 + 120, 720); ctx.closePath(); ctx.fill(); } ctx.restore();
  glow(ctx, 'win', '#ffe9a8', 640, 330, 700, 0.15 * f);
  drawMotes(ctx, t, 99, 70, '#ffe6a0', 0.8, null, true);
}
function winDraw(ctx, t, o) { stat(ctx, 'win', winStatic); winDyn(ctx, t, o); }

// ======================================================================================
// LOSE: cold white fade, sheet, flatline
// ======================================================================================
function loseStatic(g) {
  vgrad(g, 0, H, [[0, '#dfe8ee'], [1, '#aeb9c2']]);
  // faint tile wall
  g.strokeStyle = 'rgba(80,100,120,.12)'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < W; x += 64) { g.moveTo(x, 0); g.lineTo(x, 460); } for (let y = 0; y < 460; y += 40) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke();
  vgrad(g, 460, H, [[0, '#9aa7b2'], [1, '#6a7782']]);
  // gurney
  g.fillStyle = '#6a7782'; g.fillRect(260, 470, 760, 14); g.fillRect(300, 484, 8, 120); g.fillRect(972, 484, 8, 120); for (const x of [304, 976]) { g.beginPath(); g.arc(x, 618, 16, 0, TAU); g.fillStyle = '#3a444c'; g.fill(); }
  g.fillStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.ellipse(640, 640, 380, 22, 0, 0, TAU); g.fill();
  // body under sheet
  g.beginPath(); g.moveTo(300, 470); g.quadraticCurveTo(310, 450, 350, 446); g.quadraticCurveTo(400, 380, 450, 412); g.quadraticCurveTo(520, 360, 590, 410); g.quadraticCurveTo(760, 400, 860, 440); g.quadraticCurveTo(930, 430, 990, 452); g.lineTo(1000, 470); g.lineTo(980, 520); g.quadraticCurveTo(960, 560, 930, 520); g.lineTo(340, 520); g.closePath(); g.fillStyle = '#f2f5f7'; g.fill(); g.strokeStyle = 'rgba(70,90,110,.35)'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = 'rgba(90,110,130,.25)'; g.lineWidth = 3; for (const x of [480, 640, 800]) { g.beginPath(); g.moveTo(x, 420); g.quadraticCurveTo(x + 10, 470, x - 14, 522); g.stroke(); }
  g.beginPath(); g.moveTo(992, 520); g.quadraticCurveTo(1000, 580, 980, 600); g.lineTo(940, 580); g.quadraticCurveTo(950, 540, 930, 520); g.closePath(); g.fillStyle = '#e6ebef'; g.fill(); g.stroke();
  // tag on toe
  g.fillStyle = '#c9d2d8'; g.fillRect(1000, 470, 20, 26); g.strokeStyle = '#4a5560'; g.lineWidth = 1.5; g.strokeRect(1000, 470, 20, 26);
  // monitor
  g.fillStyle = '#2a323a'; g.fillRect(150, 70, 980, 190); g.fillStyle = '#05080a'; g.fillRect(162, 82, 956, 166); g.strokeStyle = 'rgba(120,255,200,.08)'; g.lineWidth = 1; for (let x = 162; x < 1118; x += 24) { g.beginPath(); g.moveTo(x, 82); g.lineTo(x, 248); g.stroke(); } for (let y = 82; y < 248; y += 24) { g.beginPath(); g.moveTo(162, y); g.lineTo(1118, y); g.stroke(); }
  noise(g, 2, 300, '#fff', 0.2, 2); drawVignetteTo(g, 0.35);
}
function loseDyn(ctx, t, o) {
  // flatline: blips for the first 1.8s then flat
  const y0 = 165, x0 = 162, x1 = 1118; const head = x0 + ((t * 260) % (x1 - x0)); const beat = (x) => { const k = (x - 400) / 60; return t < 2 ? (Math.abs(k) < 1 ? -Math.sin(k * Math.PI) * 60 * (1 - t / 2) : 0) : 0; };
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 82, x1 - x0, 166); ctx.clip();
  const g = ctx.createLinearGradient(head - 400, 0, head, 0); g.addColorStop(0, 'rgba(120,255,200,0)'); g.addColorStop(1, 'rgba(120,255,200,.95)');
  ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath(); for (let x = Math.max(x0, head - 400); x <= head; x += 4) { const y = y0 + beat(x); x === Math.max(x0, head - 400) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
  ctx.beginPath(); ctx.arc(head, y0 + beat(head), 4, 0, TAU); ctx.fillStyle = '#d8fff0'; ctx.fill(); ctx.restore();
  glow(ctx, 'lose', '#78ffc8', head, y0, 40, 0.5);
  // cold fade-in
  const k = Math.max(0, 1 - t / 2.6); if (k > 0) { ctx.fillStyle = `rgba(240,248,255,${0.85 * k * k})`; ctx.fillRect(0, 0, W, H); }
  drawMotes(ctx, t, 103, 20, '#ffffff', 0.5);
}
function loseDraw(ctx, t, o) { stat(ctx, 'lose', loseStatic); loseDyn(ctx, t, o); }

// ======================================================================================
// WARD / THEATRE / MAP wrappers
// ======================================================================================
function wardDraw(ctx, t, o) { stat(ctx, 'ward', wardStatic); wardDyn(ctx, t, o); }
function theatreDraw(ctx, t, o) { stat(ctx, 'theatre', theatreStatic); theatreDyn(ctx, t, o); }
function mapDraw(ctx, theme, t, o) { stat(ctx, theme, (g) => mapStatic(g, theme)); mapDyn(ctx, t, o); }

const THEMES = { ward: wardDraw, market: marketDraw, theatre: theatreDraw, title: titleDraw, table: tableDraw, shop: shopDraw, forge: forgeDraw, event: eventDraw, win: winDraw, lose: loseDraw };
export const BACKGROUND_THEMES = [...Object.keys(THEMES), 'map1', 'map2', 'map3'];
export function drawBackground(ctx, theme, t = 0, o = {}) {
  o = o || {}; if (o.still) t = 0;
  ctx.save(); ctx.setLineDash && ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const fn = THEMES[theme];
  if (fn) fn(ctx, t, o);
  else if (MAPTINT[theme]) mapDraw(ctx, theme, t, o);
  else { ctx.fillStyle = COL.slab; ctx.fillRect(0, 0, W, H); drawVignette(ctx, 0.5); }
  darkenOverlay(ctx, o);
  ctx.restore();
}
