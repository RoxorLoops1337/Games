// Ludus Maximus 3D: gore system (adult arena violence, Spartacus style). Everything procedural, pooled, and cosmetic only:
// it reads sim events through fightview.js and NEVER touches the sim RNG (own seeded RNG, so a replay renders the same gore).
//   blood droplets + arterial jets (arc under gravity, drawn as stretched streaks in fx's normal-blend particle layer, 0 extra draw calls)
//   sand stains (fx decal canvas): splats, growing pools, drag smears, bloody footprints, a glossy-then-dried pass
//   bodies: per-rig blood soak + persistent gashes + stump paint (shader overlay in rig.js, 0 extra draw calls)
//   dismemberment: head / forearm / arm / shin / leg collapse on the rig, a tumbling prop leaves a blood trail (ONE instanced mesh = 1 draw call, only while props exist)
//   audio hooks (audio.js sfx), hit-stop / shake / red vignette on gore moments.
// Levels: off (nothing), low (blood only, fewer droplets, smaller pools, no dismemberment), full. Reduced motion forces off.
import * as THREE from 'three';
import { WEAPON_POSES } from './rig.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const PREF_KEY = 'ludus_maximus_3d_prefs';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export const GORE_LEVELS = ['off', 'low', 'full'];
/** user setting: ?gore= (tests) > prefs.gore (More > Settings) > full. Reduced motion (OS or in-game) forces off. */
export function goreLevel() {
  let lv = 'full';
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('gore') : null;
    if (q) lv = q; else if (globalThis.LM3D_GORE) lv = globalThis.LM3D_GORE; else { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (p && p.gore) lv = p.gore; }
  } catch (e) { /* storage blocked: default */ }
  if (!GORE_LEVELS.includes(lv)) lv = 'full';
  try { if (document.body.classList.contains('lx-reduce-motion') || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) lv = 'off'; } catch (e) { /* ignore */ }
  return lv;
}

// linear-space blood colours
const BRIGHT = { r: 0.66, g: 0.022, b: 0.03 }, DARK = { r: 0.2, g: 0.008, b: 0.012 };
const CELL_STREAK = 3, CELL_PUFF = 4, CELL_DISC = 1;
const GRAV = 11.5;

const GJ = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('gj')) || '';   // TEMP bisect flags
export function createGore(fx, o = {}) {
  const scene = o.scene, audio = o.audio, feel = o.feel;
  const G = { level: 'off', tier: o.tier || 'high', on: false, full: false, time: 0, fighters: new Map(), lastSever: null, counts: { drops: 0, jets: 0, props: 0, pools: 0, splats: 0 } };
  let rs = mulberry(1); const R = () => rs(); const RR = (a, b) => a + (b - a) * rs();
  const tierK = () => (G.tier === 'low' ? 0.5 : G.tier === 'medium' ? 0.75 : 1);
  const K = () => tierK() * (G.level === 'low' ? 0.5 : 1);               // count scale
  const POOLK = () => (G.tier === 'low' ? 0.72 : 1) * (G.level === 'low' ? 0.7 : 1); // pool size scale
  const sfx = (n, p) => { try { audio && audio.sfx && audio.sfx(n, p); } catch (e) { /* audio never breaks the fight */ } };
  const panOf = (x) => clamp(x / 12, -1, 1);

  // ------------------------------------------------------------------ DOM red vignette (real time, CSS opacity only)
  let vigEl = null, vig = 0;
  if (typeof document !== 'undefined') {
    vigEl = document.createElement('div'); vigEl.className = 'gore-vignette';
    vigEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:44;background:radial-gradient(ellipse at 50% 52%,rgba(80,0,6,0) 34%,rgba(118,0,10,0.45) 72%,rgba(60,0,4,0.92) 100%)';
    (o.host || document.body).appendChild(vigEl);
  }
  G.pulse = (v) => { if (G.on) vig = Math.max(vig, v); };

  // ------------------------------------------------------------------ GORE-JUICE: lens splatter (screen space, real time, wipe fade)
  // A lazy 2D canvas (never created while gore is Off): thick drops stick to the lens, slide down a little (stretching), then fade as if wiped. Pooled slots, prebaked sprites,
  // redrawn only while a drop is alive, so an idle frame pays nothing. Max 8 drops (4 on Low).
  const LENS_MAX = 8, lensS = [], lensSpr = []; let lensC = null, lensX = null, lensN = 0, lensW = 0, lensH = 0, lensKey = 0;
  for (let i = 0; i < LENS_MAX; i++) lensS.push({ on: false, x: 0, y: 0, s: 0, a: 0, age: 0, life: 1, vy: 0, spr: 0, grow: 0 });
  const _pr = new V3();
  function lensSprites() {
    if (lensSpr.length) return; const rnd = mulberry(917);
    for (let v = 0; v < 4; v++) {
      const c = mk(128, 128), g = c.getContext('2d'); try { g.filter = 'blur(1.6px)'; } catch (e) { /* no canvas filters: sharp edges */ } g.translate(64, 58); const r0 = 17 + rnd() * 7, n = 40;
      g.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * TAU, m = 1 + 0.2 * Math.sin(a * 3 + v) + 0.12 * Math.sin(a * 5 + v * 2.1) + 0.07 * Math.sin(a * 8 + v * 3.7), x = Math.cos(a) * r0 * m, y = Math.sin(a) * r0 * m * 0.9; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath();
      const gr = g.createRadialGradient(-5, -6, 2, 0, 0, r0 * 1.35); gr.addColorStop(0, 'rgba(150,14,18,0.82)'); gr.addColorStop(0.6, 'rgba(104,8,12,0.9)'); gr.addColorStop(1, 'rgba(60,3,6,0.92)'); g.fillStyle = gr; g.fill();
      for (let i = 0; i < 7; i++) { const a = rnd() * TAU, d = r0 * (1.25 + rnd() * 1.5), rr = 1.6 + rnd() * 4.5; g.fillStyle = 'rgba(96,6,10,0.85)'; g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.9, rr, rr * 0.85, a, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(80,4,8,0.88)'; g.beginPath(); g.moveTo(-5, r0 * 0.6); g.lineTo(5, r0 * 0.6); g.lineTo(2.5, r0 * 1.7 + rnd() * 10); g.lineTo(-2.5, r0 * 1.7 + rnd() * 10); g.closePath(); g.fill();   // the run
      g.fillStyle = 'rgba(255,190,185,0.4)'; g.beginPath(); g.ellipse(-r0 * 0.3, -r0 * 0.38, r0 * 0.3, r0 * 0.13, -0.6, 0, TAU); g.fill();   // wet glint
      lensSpr.push(c);
    }
  }
  function lensEnsure() {
    if (lensC || typeof document === 'undefined') return !!lensC; lensSprites();
    lensC = document.createElement('canvas'); lensC.className = 'gore-lens'; lensC.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:43'; lensX = lensC.getContext('2d'); (o.host || document.body).appendChild(lensC); lensC.width = 2; lensC.height = 2; return !!lensX;
  }
  function lensAdd(nx, ny, size, life) {
    let s = null, old = null; const lim = G.level === 'low' ? 4 : LENS_MAX; for (let i = 0; i < lim; i++) { const l = lensS[i]; if (!l.on) { s = l; break; } if (!old || l.age > old.age) old = l; }
    if (!s) { s = old; lensN--; } s.on = true; lensN++; s.x = nx; s.y = ny; s.s = size; s.a = RR(0.6, 0.8); s.age = 0; s.life = life; s.vy = RR(0.004, 0.016); s.spr = (R() * 4) | 0; s.grow = RR(1.2, 2.2);
  }
  /** n drops around the screen position of world point pos; size is a fraction of sqrt(w*h) */
  function lens(pos, n, size) {
    if (!G.on || typeof document === 'undefined') return; n = Math.round(n * (G.level === 'low' ? 0.5 : 1)); if (n <= 0 || !lensEnsure()) return; const cam = fx.cam;
    for (let i = 0; i < n; i++) {
      // drops stick to the edges of the lens (the side the action is on), so the fighters in the middle stay readable
      let side = R() < 0.5 ? -1 : 1; if (cam) { _pr.set(pos.x, pos.y, pos.z).project(cam); if (_pr.z < 1 && Math.abs(_pr.x) > 0.25 && R() < 0.7) side = _pr.x < 0 ? -1 : 1; }
      const nx = side < 0 ? RR(0.03, 0.24) : RR(0.76, 0.97), ny = RR(0.12, 0.88);
      lensAdd(nx, ny, size * RR(0.8, 1.35), RR(1.8, 3.2));
    }
  }
  function lensClear() { for (let i = 0; i < LENS_MAX; i++) lensS[i].on = false; lensN = 0; if (lensC && lensKey) { lensKey = 0; lensX.clearRect(0, 0, lensW, lensH); } }
  function lensFrame(rd) {
    if (!lensC) return; if (!lensN) { if (lensKey) { lensKey = 0; lensX.clearRect(0, 0, lensW, lensH); } return; }
    const w = Math.min(640, Math.max(2, (window.innerWidth * 0.5) | 0)), h = Math.max(2, (window.innerHeight * w / Math.max(1, window.innerWidth)) | 0); if (w !== lensW || h !== lensH) { lensW = lensC.width = w; lensH = lensC.height = h; }
    lensKey = 1; lensX.clearRect(0, 0, lensW, lensH); const base = Math.sqrt(lensW * lensH);
    for (let i = 0; i < LENS_MAX; i++) {
      const l = lensS[i]; if (!l.on) continue; l.age += rd; const t = l.age / l.life; if (t >= 1) { l.on = false; lensN--; continue; }
      l.y += l.vy * rd * (0.4 + t * 2.2); const fade = t < 0.5 ? 1 : 1 - sstep(0.5, 1, t), sz = l.s * base * (1 + (t < 0.2 ? t * 0.8 : 0.16 + (t - 0.2) * 0.1)), stretch = 1 + t * l.grow * 0.6;
      lensX.globalAlpha = l.a * fade; lensX.drawImage(lensSpr[l.spr], l.x * lensW - sz / 2, l.y * lensH - sz * 0.45, sz, sz * stretch);
    }
    lensX.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ decal painting on fx's canvas
  const DD = fx.decalDraw, dctx = DD.ctx;
  // splat sprites (128 px, +x = travel direction): noise-eroded organic blobs (low alpha rim, no radial spikes), teardrops with a tail and satellite droplets
  // along the travel axis, and fine sprays of tiny droplets. SPR_R round, SPR_T elongated, SPR_S spray.
  const SPR_R = [], SPR_T = [], SPR_S = [];
  {
    const rnd = mulberry(4242);
    const blob = (g, r0, tail, lobes) => { // closed path with 3 noise octaves + bites; tail stretches the +x side into a teardrop
      const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU], amp = [0.18 + rnd() * 0.12, 0.1 + rnd() * 0.08, 0.06 + rnd() * 0.06, 0.04 + rnd() * 0.04], n = 56;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = i / n * TAU; let m = 1 + amp[0] * Math.sin(a * 2 + ph[0]) + amp[1] * Math.sin(a * 3 + ph[1]) + amp[2] * Math.sin(a * 5 + ph[2]) + amp[3] * Math.sin(a * 9 + ph[3]);
        const c = Math.cos(a); if (c > 0) m += tail * Math.pow(c, 3) * (1 + 0.25 * Math.sin(a * 4 + ph[0])); else m *= 1 - 0.18 * tail * Math.pow(-c, 2); // tapered tail, blunt back
        for (let l = 0; l < lobes; l++) m += 0.22 * Math.exp(-Math.pow(wrapA(a - ph[l % 4] * 1.3) * 3.2, 2)); // pseudopods
        const r = r0 * m, x = c * r, y = Math.sin(a) * r * (1 - 0.18 * Math.min(1, tail)); i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    };
    const wrapA = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
    const paint = (g, r0) => { const gr = g.createRadialGradient(-r0 * 0.15, -r0 * 0.1, 1, 0, 0, r0 * 1.5); gr.addColorStop(0, 'rgba(128,12,14,0.9)'); gr.addColorStop(0.55, 'rgba(104,9,12,0.82)'); gr.addColorStop(1, 'rgba(84,7,9,0.6)'); g.fillStyle = gr; g.fill(); };
    const dots = (g, n, d0, d1, spread, dirBias) => { for (let i = 0; i < n; i++) { const a = (rnd() - 0.5) * spread + (dirBias ? 0 : rnd() * TAU), d = d0 + (d1 - d0) * Math.pow(rnd(), 0.8), r = 0.9 + Math.pow(rnd(), 2.2) * 3.2; g.fillStyle = `rgba(${96 + (rnd() * 20) | 0},8,10,${0.55 + rnd() * 0.3})`; g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * (dirBias ? 1.5 : 1), r, a, 0, TAU); g.fill(); } };
    for (let v = 0; v < 5; v++) { const c = mk(128, 128), g = c.getContext('2d'); g.translate(64, 64); const r0 = 13 + rnd() * 6; blob(g, r0, 0, 1 + (v % 3)); paint(g, r0); dots(g, 4 + ((rnd() * 7) | 0), r0 * 1.45, 46, TAU, false); g.fillStyle = 'rgba(190,40,44,0.2)'; g.beginPath(); g.ellipse(-r0 * 0.3, -r0 * 0.35, r0 * 0.3, r0 * 0.12, -0.5, 0, TAU); g.fill(); SPR_R.push(c); }
    for (let v = 0; v < 5; v++) { const c = mk(128, 128), g = c.getContext('2d'); g.translate(-6, 64); const r0 = 9 + rnd() * 4; blob(g, r0, 1.3 + rnd() * 1.2, v % 2); paint(g, r0); dots(g, 6 + ((rnd() * 8) | 0), r0 * 2.2, 66, 0.9, true); dots(g, 3, r0 * 1.3, r0 * 2.2, TAU, false); SPR_T.push(c); }
    for (let v = 0; v < 3; v++) { const c = mk(128, 128), g = c.getContext('2d'); g.translate(64, 64); dots(g, 14 + ((rnd() * 10) | 0), 4, 54, TAU, false); const r0 = 4 + rnd() * 3; blob(g, r0, 0, 0); paint(g, r0); SPR_S.push(c); }
  }
  const drySq = []; // {t, x, z, r}
  let splatBudget = 0;
  // long fights: measure how much of the sand is covered (downsampled alpha of the decal canvas) and thin new stains out as it fills,
  // dry old blood darker, and let the sand clear a little under standing fighters so silhouettes and shadows stay readable
  // long fights: estimate how much of the sand is covered and thin new stains out as it fills, dry old blood darker, and let the sand clear a little under standing
  // fighters so silhouettes and shadows stay readable. Coverage is tracked analytically on a 32 x 32 grid (every stamp adds its area): reading the decal canvas back
  // (a canvas readback) stalled the GPU pipeline for a visible hitch every 1.5 s.
  const COV_N = 32, covGrid = new Float32Array(COV_N * COV_N), COV_CELL = (DD.ext * 2) / COV_N, COV_AREA = COV_CELL * COV_CELL; let covT = 0, dryT = 0, dryN = 0, fadeT = 0;
  G.cover = 0;
  function addCover(x, z, r, a = 0.7) { // area of a stamp of radius r (m), spread over the cells it touches, saturating per cell
    const cx = (x / (DD.ext * 2) + 0.5) * COV_N, cz = (z / (DD.ext * 2) + 0.5) * COV_N, rc = Math.max(0.5, r / COV_CELL), area = Math.PI * r * r * a / COV_AREA;
    const x0 = Math.max(0, Math.floor(cx - rc)), x1 = Math.min(COV_N - 1, Math.floor(cx + rc)), z0 = Math.max(0, Math.floor(cz - rc)), z1 = Math.min(COV_N - 1, Math.floor(cz + rc)), n = (x1 - x0 + 1) * (z1 - z0 + 1);
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) covGrid[j * COV_N + i] = 1 - (1 - covGrid[j * COV_N + i]) * (1 - Math.min(1, area / n));   // union of overlapping stains
  }
  function measureCover() {
    let sum = 0, n = 0; for (let y = 0; y < COV_N; y++) for (let x = 0; x < COV_N; x++) { if (Math.hypot(x - 15.5, y - 15.5) > 14) continue; sum += covGrid[y * COV_N + x]; n++; } G.cover = Math.min(1, sum / n * 1.35);
  }
  const capK = () => 1 - sstep(0.08, 0.2, G.cover);   // 1 = fresh sand, 0 = already well covered
  function dryAll() { // old blood goes darker and browner (source-atop only touches painted pixels)
    if (dryN >= 14) return; dryN++; dctx.save(); dctx.globalCompositeOperation = 'source-atop'; dctx.fillStyle = 'rgba(38,6,5,0.045)'; dctx.fillRect(0, 0, DD.size, DD.size);   // darker, browner
    dctx.globalCompositeOperation = 'destination-out'; dctx.fillStyle = 'rgba(0,0,0,0.04)'; dctx.fillRect(0, 0, DD.size, DD.size); dctx.restore(); fx.markDecals();   // and thinner: the sand shows through old blood (about 0.57x after 14 passes)
    for (let i = 0; i < covGrid.length; i++) covGrid[i] *= 0.985;   // the coverage estimate follows the thinning only a little (old stains are fainter, not gone)
  }
  function clearUnderFeet() { // gently lift the stains right under living fighters
    dctx.save(); dctx.globalCompositeOperation = 'destination-out';
    for (const f of G.fighters.values()) { if (f.down) continue; f.rig.root.getWorldPosition(_p); const [px, pz] = DD.toPx(_p.x, _p.z), r = 1.0 * DD.k, gr = dctx.createRadialGradient(px, pz, 0, px, pz, r); gr.addColorStop(0, 'rgba(0,0,0,0.16)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); dctx.fillStyle = gr; dctx.beginPath(); dctx.arc(px, pz, r, 0, TAU); dctx.fill(); fx.markDecals(_p.x, _p.z, 1.2); }
    dctx.restore();
  }
  const PXK = 1 / (DD.ext * 2);
  function stampSplat(x, z, size, ang, stretch = 1, a = 1) {
    const ck = capK(); if (splatBudget <= 0 && size < 0.3) return; if (G.counts.splats > 900 && size < 0.3 && R() < 0.7) return; if (ck < 1 && size < 0.35 && R() > 0.25 + 0.75 * ck) return; splatBudget--; G.counts.splats++;
    const sp = size < 0.14 ? SPR_S : stretch > 1.35 ? SPR_T : SPR_R, img = sp[(R() * sp.length) | 0];
    const px = (x * PXK + 0.5) * DD.size, pz = (z * PXK + 0.5) * DD.size, s = size * DD.k * (128 / 58) * (0.78 + 0.22 * ck);   // PERF: no toPx array
    dctx.save(); dctx.translate(px, pz); dctx.rotate(ang + (R() - 0.5) * 0.25); dctx.scale(stretch > 1.35 ? 1 + (stretch - 1.35) * 0.25 : stretch, 1); dctx.globalAlpha = a * (0.55 + 0.45 * ck) * (0.82 + 0.18 * R()); dctx.drawImage(img, -s / 2, -s / 2, s, s); dctx.restore();
    fx.markDecals(x, z, size * 0.9); addCover(x, z, size * 0.5, 0.7);
  }
  function stampSmear(x0, z0, x1, z1, w, a = 0.8) {
    const a0 = (x0 * PXK + 0.5) * DD.size, b0 = (z0 * PXK + 0.5) * DD.size, a1 = (x1 * PXK + 0.5) * DD.size, b1 = (z1 * PXK + 0.5) * DD.size; dctx.save(); dctx.lineCap = 'round';
    dctx.strokeStyle = `rgba(86,7,9,${a * 0.85})`; dctx.lineWidth = w * DD.k; dctx.beginPath(); dctx.moveTo(a0, b0); dctx.lineTo(a1, b1); dctx.stroke();
    dctx.strokeStyle = `rgba(150,14,16,${a * 0.5})`; dctx.lineWidth = w * DD.k * 0.45; dctx.stroke(); dctx.restore(); fx.markDecals((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + w); addCover((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 * 0.5 + w * 0.5, 0.5);
  }
  function stampFoot(x, z, heading, side, a) {
    const [px, pz] = DD.toPx(x + Math.cos(heading + Math.PI / 2) * 0.09 * side, z + Math.sin(heading + Math.PI / 2) * 0.09 * side), L = 0.3 * DD.k, W = 0.11 * DD.k;
    dctx.save(); dctx.translate(px, pz); dctx.rotate(heading); dctx.fillStyle = `rgba(104,9,11,${a})`;
    dctx.beginPath(); dctx.ellipse(-L * 0.12, 0, L * 0.3, W * 0.62, 0, 0, TAU); dctx.fill(); dctx.beginPath(); dctx.ellipse(L * 0.2, 0, L * 0.34, W * 0.7, 0, 0, TAU); dctx.fill(); dctx.restore(); fx.markDecals(x, z, 0.5);
  }
  function stampPool(p, ga = 1) {
    const [px, pz] = DD.toPx(p.x, p.z), r = p.r * DD.k, m = p.pts.length; dctx.save(); dctx.globalAlpha = (0.5 + 0.5 * capK()) * ga; dctx.translate(px, pz); dctx.rotate(p.rot += 0.35);
    dctx.beginPath(); for (let i = 0; i < m; i++) { const a0 = i / m * TAU, a1 = (i + 1) / m * TAU, r0 = r * p.pts[i], r1 = r * p.pts[(i + 1) % m]; const mx = (Math.cos(a0) * r0 + Math.cos(a1) * r1) / 2, my = (Math.sin(a0) * r0 + Math.sin(a1) * r1) / 2; if (i === 0) dctx.moveTo(mx, my); else dctx.quadraticCurveTo(Math.cos(a0) * r0, Math.sin(a0) * r0, mx, my); }
    dctx.closePath(); const gr = dctx.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(96,8,10,0.34)'); gr.addColorStop(0.7, 'rgba(112,9,12,0.3)'); gr.addColorStop(1, 'rgba(120,12,14,0.16)'); dctx.fillStyle = gr; dctx.fill(); dctx.restore(); fx.markDecals(p.x, p.z, p.r * 1.3);
  }
  function stampGloss(p) { // fresh wet highlights, covered by the dry pass
    const [px, pz] = DD.toPx(p.x, p.z), r = p.r * DD.k; dctx.save(); dctx.translate(px, pz);
    dctx.fillStyle = 'rgba(58,4,6,0.24)'; dctx.beginPath(); dctx.arc(0, 0, r * 0.55, 0, TAU); dctx.fill();   // GORE-JUICE: the pool thickens in the middle (darker, near black red)
    dctx.fillStyle = 'rgba(206,44,48,0.38)'; dctx.beginPath(); dctx.ellipse(-r * 0.2, -r * 0.24, r * 0.34, r * 0.13, -0.5, 0, TAU); dctx.fill();
    dctx.fillStyle = 'rgba(255,215,210,0.34)'; dctx.beginPath(); dctx.ellipse(-r * 0.27, -r * 0.3, r * 0.1, r * 0.04, -0.5, 0, TAU); dctx.fill(); dctx.restore();
  }
  function dryPass(d) {
    const [px, pz] = DD.toPx(d.x, d.z), r = Math.max(2, d.r * DD.k * 1.25); dctx.save(); dctx.globalCompositeOperation = 'source-atop';
    const gr = dctx.createRadialGradient(px, pz, 0, px, pz, r); gr.addColorStop(0, 'rgba(46,6,6,0.34)'); gr.addColorStop(0.75, 'rgba(46,6,6,0.2)'); gr.addColorStop(1, 'rgba(46,6,6,0)'); dctx.fillStyle = gr; dctx.beginPath(); dctx.arc(px, pz, r, 0, TAU); dctx.fill(); dctx.restore(); fx.markDecals(d.x, d.z, d.r * 1.3);
  }

  // ------------------------------------------------------------------ droplets (pooled, own gravity, splat on landing)
  const ND = G.tier === 'low' ? 240 : G.tier === 'medium' ? 420 : 620;
  // PERF: struct of arrays (typed arrays), not objects: a double field of a pooled object is a heap number (garbage on every store), a Float32Array slot is not
  const dX = new Float32Array(ND), dY = new Float32Array(ND), dZ = new Float32Array(ND), dVX = new Float32Array(ND), dVY = new Float32Array(ND), dVZ = new Float32Array(ND), dS = new Float32Array(ND), dAge = new Float32Array(ND), dK = new Float32Array(ND), dChild = new Uint8Array(ND);
  const act = new Int32Array(ND), freeI = new Int32Array(ND); let nAct = 0, nFree = ND; for (let i = 0; i < ND; i++) freeI[i] = i;
  const DROP_LIFE = 2.4;
  function dropClear() { nAct = 0; nFree = ND; for (let i = 0; i < ND; i++) freeI[i] = i; }
  function drop(x, y, z, vx, vy, vz, s, k = R(), child = false) {
    if (nFree <= 0) return; const i = freeI[--nFree]; dX[i] = x; dY[i] = y; dZ[i] = z; dVX[i] = vx; dVY[i] = vy; dVZ[i] = vz; dS[i] = s; dAge[i] = 0; dK[i] = k; dChild[i] = child ? 1 : 0; act[nAct++] = i;
  }
  /** fan of droplets around horizontal direction (dx,dz). o: speed, cone (rad), elMin/elMax (rad), size */
  function fan(p, dx, dz, n, o) {
    const h0 = Math.atan2(dx, dz), cone = o.cone ?? 0.5, e0 = o.elMin ?? 0.1, e1 = o.elMax ?? 0.9;
    for (let i = 0; i < n; i++) {
      const h = h0 + RR(-cone, cone), e = RR(e0, e1), sp = (o.speed ?? 6) * (0.3 + 0.85 * Math.pow(R(), 0.65)), ce = Math.cos(e);
      drop(p.x + RR(-0.05, 0.05), p.y + RR(-0.05, 0.05), p.z + RR(-0.05, 0.05), Math.sin(h) * ce * sp, Math.sin(e) * sp, Math.cos(h) * ce * sp, RR(0.07, 0.17) * (o.size ?? 1) * (0.7 + 0.3 * (1 - sp / ((o.speed ?? 6) * 1.15))), R());
    }
  }
  function land(i) {
    const vx = dVX[i], vz = dVZ[i], x = dX[i], z = dZ[i], ds = dS[i], sp = Math.sqrt(vx * vx + vz * vz), size = clamp(ds * (1.8 + 3.2 * R() * R()), 0.07, 0.5), st = 1 + Math.min(1.7, sp * 0.16);
    stampSplat(x, z, size, Math.atan2(vz, vx), st, 0.9);
    if (!dChild[i] && ds > 0.07 && R() < 0.5 && nFree > 40) { for (let j = 0; j < 2; j++) { const a = R() * TAU, s2 = RR(1.2, 3); drop(x, 0.05, z, Math.cos(a) * s2 + vx * 0.2, RR(1.5, 3.2), Math.sin(a) * s2 + vz * 0.2, ds * 0.5, R(), true); } }
  }

  // ------------------------------------------------------------------ jets (pulsing arterial sprays, stick to a joint so they ride the body)
  const jets = [], _inv = new THREE.Matrix4(), _p = new V3(), _d = new V3(), _a = new V3(), _b = new V3(), _q = new Q(), _q2 = new Q();
  function addJet(j) {
    if (jets.length >= 20) jets.shift();
    const J = { speed: 7, rate: 110, life: 1.2, period: 0.62, duty: 0.55, cone: 0.09, size: 1, elev: 0, beat: false, t: 0, acc: 0, obj: null, lp: null, ld: null, p: null, d: null, ...j };
    if (j.obj) { j.obj.updateWorldMatrix(true, false); _inv.copy(j.obj.matrixWorld).invert(); J.lp = j.pos.clone().applyMatrix4(_inv); J.ld = j.dir.clone().transformDirection(_inv); }
    else { J.p = j.pos.clone(); J.d = j.dir.clone().normalize(); }
    J.t = -(j.delay || 0); jets.push(J); return J;
  }
  function pulse(ph, a, b) { return ph > a && ph < b ? Math.sin(Math.PI * (ph - a) / (b - a)) : 0; }
  function stepJets(dt) {
    for (let i = jets.length - 1; i >= 0; i--) {
      const j = jets[i]; j.t += dt; if (j.t < 0) continue; if (j.t >= j.life) { jets[i] = jets[jets.length - 1]; jets.pop(); continue; }
      if (j.obj) { _p.copy(j.lp).applyMatrix4(j.obj.matrixWorld); _d.copy(j.ld).transformDirection(j.obj.matrixWorld); } else { _p.copy(j.p); _d.copy(j.d); }
      const life = 1 - j.t / j.life, ph = (j.t % j.period) / j.period;
      // GORE-JUICE: beat jets (deep wounds, stumps) pulse like a heart, a strong beat then a weaker one ("lub-dub"), and slow as the life drains
      const env = j.beat ? (pulse(ph, 0, 0.2) + 0.55 * pulse(ph, 0.27, 0.43)) * Math.pow(life, 0.45) + 0.06 * life : (ph < j.duty ? Math.pow(Math.sin(Math.PI * ph / j.duty), 1.1) : 0) * Math.pow(life, 0.55) + 0.1 * life;
      j.acc += dt * j.rate * env * K(); if (j.acc > 60) j.acc = 60;
      while (j.acc >= 1) {
        j.acc--; const sp = j.speed * RR(0.82, 1.14) * (j.beat ? 0.3 + 0.8 * env : 0.5 + 0.5 * env);
        _a.set(_d.x + RR(-j.cone, j.cone), _d.y + RR(-j.cone, j.cone) + j.elev, _d.z + RR(-j.cone, j.cone)).normalize();
        drop(_p.x, _p.y, _p.z, _a.x * sp, _a.y * sp, _a.z * sp, RR(0.07, 0.13) * j.size, R() * 0.6);
      }
    }
  }

  // ------------------------------------------------------------------ pools
  const pools = [];
  function addPool(x, z, rMax, rate = 0.14, delay = 0) {
    rMax *= POOLK() * (0.7 + 0.3 * capK()); if (pools.length >= 26) { const i = pools.findIndex((p) => p.done); pools.splice(i >= 0 ? i : 0, 1); }
    const pts = []; for (let i = 0; i < 12; i++) pts.push(0.74 + R() * 0.5); const p = { x, z, r: 0.07, rMax, rMax2: rMax * 1.16, rate, acc: 1, pts, rot: R() * TAU, done: false, delay, spread: 0 }; pools.push(p); addCover(x, z, rMax * 0.85, 0.5); return p;
  }
  function stepPools(dt) {
    for (let pi = 0; pi < pools.length; pi++) {
      const p = pools[pi]; if (p.delay > 0) { p.delay -= dt; continue; }
      if (p.r < p.rMax) { { const nr = p.r + p.rate * dt * (1.15 - p.r / p.rMax * 0.5); p.r = nr < p.rMax ? nr : p.rMax; } p.acc += dt; if (p.acc > 0.12) { p.acc = 0; stampPool(p); } }
      else if (!p.done) { p.done = true; stampPool(p); stampGloss(p); drySq.push({ t: G.time + 4.5, x: p.x, z: p.z, r: p.rMax * 1.05 }); addCover(p.x, p.z, p.rMax * 0.9, 0.3); }
      else if (p.r < p.rMax2 && p.spread < 16) { p.spread += dt; p.r += 0.014 * dt; p.acc += dt; if (p.acc > 1.2) { p.acc = 0; stampPool(p, 0.55); } }   // GORE-JUICE: a finished pool keeps creeping out for 16 s with a fresh wet rim
    }
    for (let i = drySq.length - 1; i >= 0; i--) if (G.time >= drySq[i].t) { dryPass(drySq[i]); drySq[i] = drySq[drySq.length - 1]; drySq.pop(); }
  }
  const inPool = (x, z) => { for (let i = 0; i < pools.length; i++) { const p = pools[i], dx = x - p.x, dz = z - p.z; if (p.delay <= 0 && Math.sqrt(dx * dx + dz * dz) < p.r * 0.8) return true; } return false; };

  // ------------------------------------------------------------------ gib props: ONE InstancedMesh (shape selected per instance in the vertex shader)
  // types: 0 limb, 1 head, 2 chunk, 3 sword, 4 spear, 5 trident, 6 helmed head, 7 armour plate, 8 plume tuft. Weapons and limbs hang from y=0 toward -y.
  // vertex mask (aMask): 0 = vertex shade x instance colour (skin / wood), 1 = shade x iHair (hair, plume), 2 = shade x iMetal (helm, plates), 3 = absolute colour (flesh, steel, blood)
  const MAXP = 56, MAXLH = 12; let gib = null, gibType = null, gibHair = null, gibMetal = null, props = [], chunkCur = MAXLH, lhCur = 0, chunkHi = 0;
  // GORE-JUICE: every instance of the gib mesh costs the triangles of ALL shapes (the vertex shader collapses the rest), so the ring of chunk / plate slots is capped per tier
  // (high 44, medium 30, low 16): a Full-gore fight on a phone adds at most about 45k triangles at the worst moment.
  const ringCap = () => (G.tier === 'low' ? 16 : G.tier === 'medium' ? 30 : 44);
  const isRing = (t) => t === 2 || t >= 7;          // chunk-ring slots: chunks, plates, plumes
  const isLimb = (t) => t === 0 || t === 3 || t === 4 || t === 5; // long props that hang from y=0 and roll flat
  const hash3 = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
  function buildGib() {
    const parts = [];
    const paint = (g, fn, mask = 0) => { const P = g.attributes.position, C = new Float32Array(P.count * 3), M = new Float32Array(P.count); for (let i = 0; i < P.count; i++) { const r = fn(P.getX(i), P.getY(i), P.getZ(i), i); C[i * 3] = r[0]; C[i * 3 + 1] = r[1]; C[i * 3 + 2] = r[2]; M[i] = r.length > 3 ? r[3] : (typeof mask === 'function' ? mask(P.getX(i), P.getY(i), P.getZ(i)) : mask); } g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('aMask', new THREE.BufferAttribute(M, 1)); return g; };
    const flat = (g, c, mask = 3) => paint(g, () => c, mask);
    { // 0: limb hanging down from y=0 (cut face) to y=-1
      const prof = [[0, -1.03], [0.5, -1.0], [0.72, -0.9], [0.86, -0.5], [1, -0.06], [0.92, 0], [0.3, 0], [0, 0]].map((p) => new THREE.Vector2(p[0], p[1])), g = new THREE.LatheGeometry(prof, 6);
      paint(g, (x, y, z) => { const r = Math.hypot(x, z); if (y > -0.001) return r < 0.31 ? [1.3, 1.2, 1.0, 3] : [0.95, 0.1, 0.09, 3]; const k = 1 - sstep(-0.55, -0.04, y); return [lerp(1, 0.78, k * 0.9), lerp(1, 0.18, k * 0.9), lerp(1, 0.16, k * 0.9), 0]; }); parts.push(g);
    }
    // 1 / 6: head on a ragged neck stump. Skin tone (instance colour), hair mask, bloody cut face with a pale windpipe ring and two dark arteries.
    const neckStump = () => {
      const neck = new THREE.CylinderGeometry(0.46, 0.56, 0.95, 8, 3, true).translate(0, 0.475, 0), P = neck.attributes.position;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < 0.3) { const k = (0.3 - y) / 0.3, h = hash3(P.getX(i), 1, P.getZ(i)) - 0.5, rr = 1 + h * 0.4 * k; P.setX(i, P.getX(i) * rr); P.setZ(i, P.getZ(i) * rr); P.setY(i, y - Math.max(0, hash3(P.getX(i), 7, P.getZ(i)) - 0.4) * 0.28 * k); } }
      paint(neck, (x, y) => { const k = 1 - sstep(0, 0.6, y); return [lerp(1, 0.62, k), lerp(1, 0.14, k), lerp(1, 0.12, k), 0]; });
      const face = new THREE.CircleGeometry(0.5, 9).rotateX(Math.PI / 2).translate(0, -0.05, 0); const FP = face.attributes.position;
      for (let i = 1; i < FP.count; i++) FP.setY(i, FP.getY(i) + (hash3(FP.getX(i), 3, FP.getZ(i)) - 0.5) * 0.08);
      paint(face, (x, y, z) => { const r = Math.hypot(x, z); if (r < 0.015) return [0.55, 0.05, 0.05, 3]; const dA = Math.hypot(x - 0.2, z - 0.12) < 0.09 || Math.hypot(x + 0.2, z - 0.1) < 0.09; return dA ? [0.28, 0.02, 0.025, 3] : (r < 0.2 ? [1.25, 1.15, 0.95, 3] : [0.78, 0.07, 0.07, 3]); });
      const flesh = []; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; const g = new THREE.ConeGeometry(0.12, 0.42, 4).rotateX(Math.PI); g.rotateZ(Math.cos(a) * 0.35); g.rotateX(Math.sin(a) * 0.35); g.translate(Math.cos(a) * 0.42, -0.17, Math.sin(a) * 0.42); flat(g, [0.6 + 0.1 * (i % 2), 0.05, 0.05]); flesh.push(g); }
      return [neck, face, ...flesh];
    };
    const skull = () => {
      const sk = new THREE.SphereGeometry(1, 16, 11).scale(0.93, 1.1, 1.0), P = sk.attributes.position;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < -0.1) { const k = clamp(-y / 1.1, 0, 1); P.setX(i, P.getX(i) * (1 - 0.2 * k)); P.setZ(i, P.getZ(i) * (1 - 0.1 * k) + 0.06 * k); } } // jaw
      sk.translate(0, 1.55, 0);
      paint(sk, (x, y, z) => { const yy = y - 1.55, hairy = Math.max(sstep(0.35, 0.65, yy), sstep(-0.2, -0.5, z) * sstep(-0.75, -0.25, yy)), bl = sstep(0.3, 0.7, x) * sstep(0.1, 0.6, z) * sstep(0.4, -0.2, yy);
        const eye = Math.exp(-(((Math.abs(x) - 0.33) / 0.13) ** 2 + ((yy - 0.14) / 0.08) ** 2)) * sstep(0.5, 0.8, z), mouth = Math.exp(-((x / 0.22) ** 2 + ((yy + 0.38) / 0.05) ** 2)) * sstep(0.5, 0.8, z), brow = Math.exp(-(((Math.abs(x) - 0.33) / 0.2) ** 2 + ((yy - 0.27) / 0.06) ** 2)) * sstep(0.45, 0.8, z);
        const k = 1 - Math.min(1, eye * 0.95 + mouth * 0.7 + brow * 0.35) * 0.85, rb = 1 - bl * 0.75; return [k * rb, k * lerp(1, 0.2, bl * 0.8), k * lerp(1, 0.2, bl * 0.8), hairy > 0.5 ? 1 : 0]; }, null);
      // keep the hair/skin boundary soft: the mask is per vertex, colours blend across triangles
      const nose = new THREE.ConeGeometry(0.13, 0.34, 4).rotateX(Math.PI / 2).translate(0, 1.4, 1.02); flat(nose, [1, 1, 1], 0);
      const ear = (sg) => { const g = new THREE.SphereGeometry(0.2, 6, 4).scale(0.45, 1, 0.7).translate(sg * 0.9, 1.5, -0.05); return flat(g, [0.95, 0.85, 0.82], 0); };
      return [sk, nose, ear(1), ear(-1)];
    };
    parts.push(mergeGeos([...neckStump(), ...skull()]));
    { // 2: chunk
      const g = new THREE.IcosahedronGeometry(1, 0); flat(g, [1, 1, 1], 0); parts.push(g);
    }
    const bladeCol = (y0, y1) => (x, y) => { const t = clamp((y - y0) / (y1 - y0), 0, 1); return [lerp(0.82, 0.5, sstep(0.35, 0.0, t)), lerp(0.84, 0.1, sstep(0.35, 0.0, t)), lerp(0.88, 0.1, sstep(0.35, 0.0, t)), 3]; };
    { // 3: sword, grip at y=0, blade toward -y (0.95 m)
      const grip = new THREE.CylinderGeometry(0.02, 0.022, 0.16, 6).translate(0, -0.08, 0); flat(grip, [0.55, 0.3, 0.14], 0);
      const pom = new THREE.SphereGeometry(0.032, 6, 4); flat(pom, [1, 1, 1], 2);
      const guard = new THREE.BoxGeometry(0.17, 0.024, 0.04).translate(0, -0.172, 0); flat(guard, [1, 1, 1], 2);
      const bl = new THREE.BoxGeometry(0.058, 0.66, 0.012).translate(0, -0.52, 0); paint(bl, bladeCol(-0.85, -0.19));
      const tip = new THREE.ConeGeometry(0.041, 0.13, 4).rotateX(Math.PI).scale(1, 1, 0.3).rotateY(Math.PI / 4).translate(0, -0.915, 0); flat(tip, [0.84, 0.86, 0.9]);
      parts.push(mergeGeos([grip, pom, guard, bl, tip]));
    }
    const spearShaft = (L, y0) => { const sh = new THREE.CylinderGeometry(0.017, 0.02, L, 5).translate(0, y0 - L / 2, 0); flat(sh, [0.62, 0.42, 0.22], 0); return sh; };
    { // 4: spear, butt at y=0, shaft 1.95 m, leaf head
      const sh = spearShaft(1.95, 0), leaf = new THREE.ConeGeometry(0.05, 0.36, 4).rotateX(Math.PI).scale(1, 1, 0.3).rotateY(Math.PI / 4).translate(0, -2.13, 0); paint(leaf, bladeCol(-2.31, -1.97));
      const col = new THREE.CylinderGeometry(0.026, 0.026, 0.05, 6).translate(0, -1.97, 0); flat(col, [1, 1, 1], 2); parts.push(mergeGeos([sh, leaf, col]));
    }
    { // 5: trident
      const sh = spearShaft(1.78, 0), list = [sh]; const cross = new THREE.BoxGeometry(0.16, 0.024, 0.03).translate(0, -1.8, 0); flat(cross, [1, 1, 1], 2); list.push(cross);
      for (const sg of [-1, 0, 1]) { const pr = new THREE.BoxGeometry(0.016, 0.3, 0.016).translate(sg * 0.07, -1.95, 0); flat(pr, [0.82, 0.84, 0.88]); const tp = new THREE.ConeGeometry(0.014, 0.08, 4).rotateX(Math.PI).translate(sg * 0.07, -2.14, 0); flat(tp, [0.84, 0.86, 0.9]); list.push(pr, tp); }
      parts.push(mergeGeos(list));
    }
    { // 6: helmed head: bare head + dome, cheek / neck guards and a crest in the plume colour (iHair)
      const dome = new THREE.SphereGeometry(1.1, 14, 7, 0, TAU, 0, 1.3).scale(0.93, 1.1, 1.05).translate(0, 1.55, 0); paint(dome, (x, y) => { const t = 0.75 + 0.25 * sstep(1.55, 2.6, y); return [t, t, t, 2]; });
      const guards = new THREE.SphereGeometry(1.08, 12, 6, Math.PI / 2 + 0.95, TAU - 1.9, 1.15, 0.95).scale(0.93, 1.1, 1.05).translate(0, 1.55, 0); paint(guards, () => [0.62, 0.62, 0.62, 2]);
      const brim = new THREE.CylinderGeometry(1.12, 1.12, 0.1, 14, 1, true, Math.PI / 2 + 0.7, TAU - 1.4).translate(0, 1.9, 0); paint(brim, () => [0.9, 0.9, 0.9, 2]);
      const crest = new THREE.BoxGeometry(0.16, 0.5, 1.9).translate(0, 2.7, -0.1); paint(crest, (x, y, z) => { const t = 0.7 + 0.3 * sstep(-1, 1, z); return [t, t, t, 1]; });
      parts.push(mergeGeos([...neckStump(), ...skull(), dome, guards, brim, crest]));
    }
    { // 7: armour plate shard (curved, thin)
      const g = new THREE.CylinderGeometry(1, 1, 0.8, 8, 1, true, 0, 1.3).rotateZ(0); paint(g, (x, y) => { const t = 0.7 + 0.3 * (y + 0.4); return [t, t, t, 2]; }); parts.push(g);
    }
    { // 8: plume tuft: a bent ribbon in the plume colour
      const g = new THREE.PlaneGeometry(0.5, 1.6, 2, 6), P = g.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); P.setZ(i, -0.35 * (y + 0.8) * (y + 0.8) * 0.7); P.setX(i, P.getX(i) * (1 - 0.5 * (y + 0.8) / 1.6)); }
      paint(g, (x, y) => { const t = 0.65 + 0.35 * sstep(-0.8, 0.8, y); return [t, t, t, 1]; }); g.translate(0, 0.8, 0); parts.push(g);
    }
    const geo = mergeGeos(parts), part = new Float32Array(geo.attributes.position.count); let off = 0;
    parts.forEach((p, i) => { const n = p.attributes.position.count; part.fill(i, off, off + n); off += n; });
    geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    gibType = new THREE.InstancedBufferAttribute(new Float32Array(MAXP), 1); geo.setAttribute('iType', gibType);
    gibHair = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3).fill(1), 3); geo.setAttribute('iHair', gibHair);
    gibMetal = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3).fill(1), 3); geo.setAttribute('iMetal', gibMetal);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aMask; attribute float iType; attribute vec3 iHair; attribute vec3 iMetal;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n vColor.xyz = color.xyz * (aMask > 2.5 ? vec3(1.0) : aMask > 1.5 ? iMetal : aMask > 0.5 ? iHair : instanceColor.xyz);')
        .replace('#include <project_vertex>', '#include <project_vertex>\n if (abs(aPart - iType) > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
    };
    mat.customProgramCacheKey = () => 'lm-gib2';
    gib = new THREE.InstancedMesh(geo, mat, MAXP); gib.name = 'gore_gibs'; gib.frustumCulled = false; gib.castShadow = false; gib.receiveShadow = false; gib.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gib.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3).fill(1), 3); gib.count = 0; gib.visible = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAXP; i++) gib.setMatrixAt(i, zero);
    scene && scene.add(gib);
  }
  function mergeGeos(list) {
    let nv = 0, ni = 0; list.forEach((g) => { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), msk = new Float32Array(nv), idx = new Uint32Array(ni); let vo = 0, io = 0;
    for (const g of list) { const n = g.attributes.position.count; pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); col.set(g.attributes.color.array, vo * 3); if (g.attributes.aMask) msk.set(g.attributes.aMask.array, vo);
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; else for (let i = 0; i < n; i++) idx[io++] = vo + i; vo += n; }
    const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3)); m.setAttribute('aMask', new THREE.BufferAttribute(msk, 1)); m.setIndex(new THREE.BufferAttribute(idx, 1)); return m;
  }
  const _m4 = new THREE.Matrix4(), _s = new V3(), _col = new THREE.Color();
  function spawnProp(type, o) {
    if (!gib) buildGib(); let i;
    if (isRing(type)) { i = chunkCur; chunkCur = chunkCur + 1 >= MAXLH + ringCap() ? MAXLH : chunkCur + 1; chunkHi = Math.max(chunkHi, i - MAXLH + 1); } else { if (lhCur >= MAXLH) return null; i = lhCur++; }
    const rm = props.findIndex((p) => p.i === i); if (rm >= 0) props.splice(rm, 1);
    const p = { type, i, x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz, q: o.q.clone(), wx: o.wx, wy: o.wy, wz: o.wz, sx: o.sx, sy: o.sy, sz: o.sz, len: o.len || 0, rad: o.rad || o.sx, rest: false, settle: 0, trail: 0, age: 0, drip: 0, bounces: 0, smx: o.x, smz: o.z, leak: o.leak ?? 0, bleeds: o.bleeds !== false };
    props.push(p); gibType.array[i] = type; gibType.needsUpdate = true; _col.set(o.color); gib.setColorAt(i, _col); gib.instanceColor.needsUpdate = true;
    _col.set(o.hair || '#ffffff'); gibHair.setXYZ(i, _col.r, _col.g, _col.b); _col.set(o.metal || '#ffffff'); gibMetal.setXYZ(i, _col.r, _col.g, _col.b); gibHair.needsUpdate = true; gibMetal.needsUpdate = true;
    gib.count = chunkHi ? MAXLH + chunkHi : lhCur; gib.visible = true; writeProp(p); return p;
  }
  function writeProp(p) { _s.set(p.sx, p.sy, p.sz); _m4.compose(_a.set(p.x, p.y, p.z), p.q, _s); gib.setMatrixAt(p.i, _m4); }
  const _lo = new V3(), _hi = new V3(), _ax = new V3(), _dq = new Q();
  function lowest(p) { // lowest world y of the prop shape
    if (isLimb(p.type)) { _ax.set(0, -p.len, 0).applyQuaternion(p.q); return Math.min(p.y, p.y + _ax.y) - p.rad * 0.8; }
    if (p.type === 1 || p.type === 6) { _ax.set(0, p.sy * 1.55, 0).applyQuaternion(p.q); return p.y + _ax.y - p.sy * 1.05; }
    return p.y - p.sy * 0.8;
  }
  function stepProps(dt) {
    let any = false;
    for (let pi = 0; pi < props.length; pi++) {
      const p = props[pi];
      if (p.rest) { if (p.settle > 0) { p.settle -= dt; settleOrient(p, dt); writeProp(p); any = true; } continue; }
      any = true; p.age += dt;
      p.vy -= 17 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const w = Math.sqrt(p.wx * p.wx + p.wy * p.wy + p.wz * p.wz); if (w > 1e-3) { _ax.set(p.wx / w, p.wy / w, p.wz / w); _dq.setFromAxisAngle(_ax, w * dt); p.q.premultiply(_dq); }
      // blood trail: airborne arcs of bleeding parts (first 1.6 s), cheap
      if (p.bleeds && p.type !== 2 && p.age < 1.6) { p.trail += dt; while (p.trail > 0.04) { p.trail -= 0.04; const n = G.full ? 1 + (K() > 0.6 ? 1 : 0) : 1; for (let k = 0; k < n; k++) drop(p.x + RR(-0.03, 0.03), p.y, p.z + RR(-0.03, 0.03), p.vx * 0.3 + RR(-0.8, 0.8), p.vy * 0.2 + RR(0, 1.2), p.vz * 0.3 + RR(-0.8, 0.8), RR(0.04, 0.075), R()); } }
      const low = lowest(p), gy = 0.012;
      if (low < gy) {
        p.y += gy - low; const impact = -p.vy; p.bounces++;
        if (impact > 1.6) {
          if (p.bleeds) {
            stampSplat(p.x, p.z, p.type === 2 ? 0.2 + p.sy : 0.4, R() * TAU, 1, 0.95);
            const nd = Math.round((p.type === 2 ? 3 : 7) * K()); for (let k = 0; k < nd; k++) { const a = R() * TAU, s2 = RR(1.5, 4.2); drop(p.x, 0.05, p.z, Math.cos(a) * s2, RR(1.5, 4), Math.sin(a) * s2, RR(0.045, 0.09), R(), true); }
            if (p.type !== 2) sfx('gibThud', { pan: panOf(p.x), gain: clamp(impact / 9, 0.3, 1), pitch: p.type === 1 || p.type === 6 ? 1.1 : 0.9 });
          } else if (p.type !== 8) { fx.dust({ x: p.x, y: 0.05, z: p.z }, 2, { size: 0.5, alpha: 0.4 }); if (p.bounces < 4) sfx('metalClang', { pan: panOf(p.x), gain: clamp(impact / 12, 0.15, 0.6), pitch: p.type === 7 ? 1.4 : 1.0 }); }
        }
        if (p.vy < 0) p.vy = impact > 2.2 ? impact * (p.type === 1 || p.type === 6 ? 0.2 : 0.26) : 0;
        const fr = Math.exp(-(impact > 1 ? 4 : 7) * dt); p.vx *= impact > 1.6 ? 0.7 : fr; p.vz *= impact > 1.6 ? 0.7 : fr; p.wx *= 0.6; p.wy *= 0.7; p.wz *= 0.6;
        // sliding smear trail
        const sp = Math.hypot(p.vx, p.vz); if (sp > 0.7 && p.bleeds && p.type !== 2 && Math.hypot(p.x - p.smx, p.z - p.smz) > 0.16) { stampSmear(p.smx, p.smz, p.x, p.z, p.rad * 1.6 + 0.05, 0.85); p.smx = p.x; p.smz = p.z; }
        if (sp < 0.22 && Math.abs(p.vy) < 0.5 && Math.hypot(p.wx, p.wy, p.wz) < 2.2) { p.rest = true; p.settle = 0.5; p.vx = p.vy = p.vz = 0; if (p.bleeds && p.type !== 2) { addPool(p.x, p.z, p.type === 1 || p.type === 6 ? 0.62 : 0.5, 0.2); stampSmear(p.smx, p.smz, p.x, p.z, p.rad * 1.6 + 0.05, 0.85); } else if (p.type === 2) stampSplat(p.x, p.z, 0.22 + p.sy, R() * TAU, 1, 0.9); }
      }
      writeProp(p);
    }
    if (any) { gib.instanceMatrix.needsUpdate = true; }
  }
  function settleOrient(p, dt) { // roll the part flat on the sand, a head onto its side (neck horizontal), keep the cut face toward the body
    if (p.type === 1 || p.type === 6) { _ax.set(0, 1, 0).applyQuaternion(p.q); if (Math.abs(_ax.y) > 0.04) { _b.set(_ax.x, 0, _ax.z); if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0); _b.normalize(); _dq.setFromUnitVectors(_ax, _b); _q2.identity().slerp(_dq, 1 - Math.exp(-dt * 9)); p.q.premultiply(_q2); } p.y = p.sy * 1.06 + Math.max(0, p.y - p.sy * 1.06) * 0.5; return; }
    if (!isLimb(p.type)) { p.y = Math.max(p.y, p.type === 7 ? p.sy * 0.2 : p.sy * 0.8); return; }
    _ax.set(0, -1, 0).applyQuaternion(p.q); if (Math.abs(_ax.y) < 0.02) { p.y = p.rad * 0.8 + 0.012; return; }
    _b.set(_ax.x, 0, _ax.z); if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0); _b.normalize(); _dq.setFromUnitVectors(_ax, _b); _q2.identity().slerp(_dq, 1 - Math.exp(-dt * 14)); p.q.premultiply(_q2); p.y = p.rad * 0.8 + 0.012 + Math.max(0, p.y - p.rad * 0.8 - 0.012) * 0.5;
  }

  // ------------------------------------------------------------------ fighters
  const fArr = [];   // GORE-JUICE: the fighters as an array (the per-frame loop must not allocate a Map iterator)
  function fighterOf(id) { return G.fighters.get(id); }
  G.addFighter = (id, rig, info = {}) => {
    const f = { id, rig, wet: 0, leak: 0, dripAcc: 0, trailT: 0, tx: 1e9, tz: 0, maxhp: info.maxhp || 100, side: info.side || 'A', blood: 0, bleeding: 0, bleedAcc: 0, down: false, foot: 0, stepSide: 1, sev: [], dir: new V3(1, 0, 0), pool: null, tmp: new V3(), prevOnEvent: rig.onEvent };
    rig.onEvent = (n, clip) => { if (f.prevOnEvent) f.prevOnEvent(n, clip); if (n === 'step') onStep(f, clip && clip.side); };
    G.fighters.set(id, f); fArr.push(f); return f;
  };
  function onStep(f, side) {
    if (!G.on || f.down) return; const a = f.rig.joints['ankle' + (side || 'L')]; if (!a) return; a.getWorldPosition(_p);
    if (f.foot < 0.9 && inPool(_p.x, _p.z)) f.foot = 1;
    if (f.foot > 0.12) { const yaw = f.rig.root.rotation.y; stampFoot(_p.x, _p.z, -yaw + Math.PI / 2, side === 'L' ? 1 : -1, clamp(f.foot * 0.7, 0, 0.62)); f.foot *= 0.66; }   // 4 to 5 prints, each paler, then clean
  }

  // wound placement in rest space from the world hit direction (the surface that faces the attacker)
  function placeWound(f, dx, dz, frac) {
    const rig = f.rig, yaw = rig.root.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
    let nx = -dx, nz = -dz; const j = RR(-0.6, 0.6), cj = Math.cos(j), sj = Math.sin(j); const tx = nx * cj - nz * sj, tz = nx * sj + nz * cj; nx = tx; nz = tz;
    let lx = nx * c - nz * s, lz = nx * s + nz * c; const l = Math.hypot(lx, lz) || 1; lx /= l; lz /= l;
    const r = R(); let pt;
    if (r < 0.34) pt = rig.jointRest('chest', [lx * 0.22, RR(0.04, 0.27), lz * 0.16]);
    else if (r < 0.52) pt = rig.jointRest('spine', [lx * 0.16, RR(-0.02, 0.14), lz * 0.13]);
    else if (r < 0.68) pt = rig.jointRest('shoulder' + (lx > 0 ? 'L' : 'R'), [lx * 0.07, -RR(0.05, 0.24), lz * 0.07]);
    else if (r < 0.8) pt = rig.jointRest('elbow' + (lx > 0 ? 'L' : 'R'), [lx * 0.055, -RR(0.02, 0.2), lz * 0.055]);
    else if (r < 0.94) pt = rig.jointRest('hip' + (lx > 0 ? 'L' : 'R'), [lx * 0.09, -RR(0.06, 0.3), lz * 0.09]);
    else pt = rig.jointRest('head', [lx * 0.1, RR(0.04, 0.13), lz * 0.1]);
    const th = (R() < 0.5 ? 1 : -1) * RR(0.35, 1.2), t1x = -lz, t1z = lx; _d.set(t1x * Math.cos(th), Math.sin(th), t1z * Math.cos(th)).normalize();
    rig.addWound(pt, _d, 0.075 + Math.min(0.14, frac * 0.7), 1);
  }

  function chestPos(f, out, y = 1.3) { f.rig.root.getWorldPosition(out); out.y = y; return out; }
  function jointPos(f, name, out) { const j = f.rig.joints[name]; j.getWorldPosition(out); return out; }

  // ------------------------------------------------------------------ events from fightview
  /** e: {pos:Vector3 (chest), dx,dz (unit, attacker -> victim), frac, crit, blocked, lethal, attacker, mine} */
  G.onHit = (id, e) => {
    if (!G.on) return; const f = fighterOf(id); if (!f) return; const fr = clamp(e.frac, 0, 1.2);
    if (e.blocked && fr < 0.22) return;
    const k = K(), heavy = fr > 0.12 || e.crit, deep = fr > 0.16 || e.crit, n = Math.round((11 + fr * 230 + (e.crit ? 52 : 0)) * k), sp = 4.2 + fr * 16 + (e.crit ? 3.5 : 0);
    const at = e.attacker && fighterOf(e.attacker), beastAt = !!(at && at.rig.beast), px = panOf(e.pos.x);
    f.dir.set(e.dx, 0, e.dz);
    if (!GJ.includes('f')) fan(e.pos, e.dx, e.dz, Math.round(n * 0.66), { speed: sp, cone: 0.5, elMin: 0.05, elMax: 0.95, size: 1.15 + fr * 1.0 });
    if (!GJ.includes('f')) fan(e.pos, -e.dx, -e.dz, Math.round(n * 0.34), { speed: 1.8 + fr * 3.8, cone: 1.0, elMin: 0.1, elMax: 1.25, size: 0.85 });
    if (heavy && !GJ.includes('g')) fan(e.pos, e.dx, e.dz, Math.round((3 + fr * 14 + (e.crit ? 4 : 0) + (beastAt ? 3 : 0)) * k), { speed: sp * 0.55, cone: 0.75, elMin: 0.25, elMax: 1.1, size: 2.4 });   // thick gouts
    if (heavy && !GJ.includes('m')) for (let i = 0, m = Math.round(RR(4, 6) * (G.tier === 'low' ? 0.6 : 1) * (G.level === 'low' ? 0.7 : 1)); i < m; i++) fx.addNormalParticle({ x: e.pos.x + e.dx * 0.3 + RR(-0.12, 0.12), y: e.pos.y + RR(-0.18, 0.18), z: e.pos.z + e.dz * 0.3 + RR(-0.12, 0.12), vx: e.dx * RR(1, 3.4) + RR(-0.7, 0.7), vy: RR(0.2, 1.4), vz: e.dz * RR(1, 3.4) + RR(-0.7, 0.7), life: RR(0.35, 0.65), s0: 0.18, s1: RR(0.7, 1.15), cell: CELL_PUFF, rot: R() * TAU, c0: { r: 0.5, g: 0.02, b: 0.03 }, c1: { r: 0.22, g: 0.01, b: 0.015 }, a: 0.42, drag: 3.2, fp: 1.3, att: 0.05 });   // blood mist
    if ((deep && G.full || e.crit) && !GJ.includes('j')) {
      const nj = e.crit ? 2 : 1, obj = f.rig.joints.chest;
      for (let i = 0; i < nj + (fr > 0.3 ? 1 : 0); i++) { _d.set(e.dx + RR(-0.3, 0.3), RR(0.55, 1.0), e.dz + RR(-0.3, 0.3)).normalize(); addJet({ obj, pos: e.pos, dir: _d.clone(), speed: 6 + fr * 9 + (e.crit ? 2.5 : 0), rate: 90 + fr * 170, life: 0.8 + fr * 2.6 + (e.crit ? 0.8 : 0), period: 0.5 + R() * 0.16, duty: 0.6, size: 1.15, beat: true }); }   // heartbeat spurts
    }
    if (fr > 0.03 || e.crit) placeWound(f, e.dx, e.dz, fr);
    f.rig.addBlood(fr * 0.8 + (e.crit ? 0.07 : 0) + 0.012, 1);
    if (at && heavy) at.rig.addBlood(fr * 0.3 + 0.02, 1);
    if (at && !beastAt && !e.blocked) at.wet = Math.min(1, at.wet + 0.3 + fr * 2.2);   // the blade drips until the fight ends
    f.leak = Math.min(1, f.leak + 0.12 + fr * 2.4 + (e.crit ? 0.3 : 0));
    // ground: an immediate splash fan on the sand near the victim
    if (heavy && !GJ.includes('s')) for (let i = 0, m = Math.round(RR(4, 7) * k); i < m; i++) stampSplat(e.pos.x + e.dx * RR(0.3, 2.2) + RR(-0.4, 0.4), e.pos.z + e.dz * RR(0.3, 2.2) + RR(-0.4, 0.4), RR(0.16, 0.36) * (0.7 + fr), Math.atan2(e.dz, e.dx), RR(1.5, 2.4), 0.9);
    f.bleed = Math.max(f.bleed || 0, fr);
    // meat: chunks, a bone shard on crits, sand clumps soaked in blood (Full only: they are props)
    if (G.full && heavy && !GJ.includes('c')) { const nc = Math.round((e.crit ? 3 : fr > 0.22 ? 2 : 1) * (K() > 0.6 ? 1 : 0.6)); for (let i = 0; i < nc; i++) chunk(e.pos, e.dx * 2.5, e.dz * 2.5); if (e.crit) chunk(e.pos, e.dx * 2.5, e.dz * 2.5, 1); if (R() < 0.7) { _a.set(e.pos.x, 0.08, e.pos.z); chunk(_a, e.dx, e.dz, 2); } }
    sfx('slashWet', { pan: px, gain: clamp(0.5 + fr * 2, 0.5, 1) });
    if (heavy) { sfx('crunch', { pan: px, gain: clamp(0.5 + fr * 1.5, 0.5, 1), pitch: RR(0.9, 1.15) }); sfx('squelch', { pan: px, gain: clamp(0.5 + fr * 2, 0.5, 1), pitch: RR(0.85, 1.2) }); }
    if (e.crit || fr > 0.24) sfx('cleave', { pan: px, gain: clamp(0.55 + fr * 1.4, 0.6, 1), pitch: RR(0.9, 1.1) });
    if (e.crit || fr > 0.2) sfx('spurt', { pan: px, gain: 0.7 });
    if (feel) { if (e.crit) { feel.hitStop(120); feel.addTrauma(0.14); if (feel.kick) feel.kick(e.dx, 0.15, e.dz, 0.16); } else if (fr > 0.18) feel.hitStop(80); }
    if (heavy && !GJ.includes('l')) lens(e.pos, e.crit ? 2 : fr > 0.22 ? 1 : (R() < 0.4 ? 1 : 0), e.crit ? 0.22 : 0.17);
    if (e.crit || fr > 0.2) G.pulse((e.mine ? 0.55 : 0.32) + Math.min(0.25, fr));
    // rare non-lethal heavy crit takes the off-hand forearm off a badly hurt fighter
    if (G.full && e.crit && !e.lethal && e.hpFrac < 0.45 && R() < 0.1) { const sd = R() < 0.62 ? 'R' : 'L', sv = f.rig.severed; if (!sv['forearm' + sd] && !sv['arm' + sd]) G.sever(id, 'forearm' + sd, e.dx, e.dz, 1); } // mostly the weapon hand
    if (G.full && !e.blocked && (e.crit ? R() < 0.5 : fr > 0.16 && R() < 0.28)) popArmor(f, e, fr);
  };

  /** status bleed tick (arena 'bleed' event) */
  G.onBleed = (id, dmg) => {
    if (!G.on) return; const f = fighterOf(id); if (!f || f.down) return; jointPos(f, R() < 0.5 ? 'chest' : (R() < 0.5 ? 'elbowL' : 'kneeR'), _p);
    const n = Math.round((8 + Math.min(12, dmg) * 1.4) * K()); f.leak = Math.min(1, f.leak + 0.08); fan(_p, f.dir.x || RR(-1, 1), f.dir.z || RR(-1, 1), n, { speed: 2.6, cone: 1.4, elMin: 0.4, elMax: 1.3, size: 0.8 });
    addJet({ obj: f.rig.joints.chest, pos: _p, dir: _d.set(RR(-0.5, 0.5), 0.9, RR(-0.5, 0.5)).normalize().clone(), speed: 3.4, rate: 55, life: 0.55, period: 0.28, duty: 0.7, size: 0.8, cone: 0.2 });
    f.rig.addBlood(0.015, 1); jointPos(f, 'ankleL', _a); stampSplat(_a.x + RR(-0.4, 0.4), _a.z + RR(-0.4, 0.4), RR(0.12, 0.24), R() * TAU, 1.3, 0.9); sfx('spurt', { pan: panOf(_p.x), gain: 0.35 });
    if (R() < 0.5) { const pl = f.pool; if (!pl) f.pool = addPool(_a.x, _a.z, 0.5, 0.05); }
  };

  /** pick the part to take off. Returns a part key or null. */
  function pickPart(f, ctx) {
    if (!G.full || (ctx.noSrc && !ctx.big)) return null; const rig = f.rig; let ch = 0.1 + ctx.frac * 0.9; if (ch > 0.45) ch = 0.45; if (ctx.crit) ch = 0.85; if (ctx.last) ch = 1; if (ctx.big) ch = 1;
    if (R() > ch) return null;
    const r = R(), L = R() < 0.5 ? 'L' : 'R', pick = (cands) => cands.find((c) => !rig.severed[c]) || null;
    if (ctx.big) return pick(r < 0.5 ? ['armR', 'armL', 'legR'] : ['legL', 'armL', 'armR']);
    if (r < 0.52) return pick(['head']);
    if (r < 0.7) return pick(['forearm' + L, 'forearm' + (L === 'L' ? 'R' : 'L')]);
    if (r < 0.85) return pick(['arm' + L, 'arm' + (L === 'L' ? 'R' : 'L')]);
    return pick(['shin' + L, 'leg' + L]);
  }

  /** sever a part and fling it. Returns true when something came off. dx,dz = blow direction, power ~1 */
  G.sever = (id, part, dx, dz, power = 1) => {
    if (!G.full) return false; const f = fighterOf(id); if (!f) return false; const rig = f.rig, fr = rig.sever(part); if (!fr) return false; f.sev.push(part);
    const head = part === 'head', big = head ? 1 : 0.8, jo = fr.anchor, toW = (v) => v;
    const sc = fr.scale || 1;
    // the prop
    const q = new Q(); if (head) q.setFromUnitVectors(_a.set(0, 1, 0), fr.axis); else q.setFromUnitVectors(_a.set(0, -1, 0), fr.axis);
    const pal = rig.palette, skin = pal.skin || '#c98d62', sp = (head ? 1.6 + 1.8 : 2.2 + 2.6) * power * Math.max(0.35, R()) * 0.85 + 0.8, len = Math.hypot(dx, dz) || 1;
    const vx = dx / len * sp + RR(-1.2, 1.2), vz = dz / len * sp + RR(-1.2, 1.2), vy = (head ? RR(4.2, 5.8) : RR(3.2, 5.6)) * (0.8 + 0.3 * power);
    let prop;
    if (head) { // skin tone + the fighter's hair (bald = skin) or helm and plume; a sensible tumble: a roll about the axis across the throw, a little yaw
      const helmed = rig.style === 'murmillo' || rig.style === 'thraex' || rig.style === 'hoplomachus', bald = rig.look && rig.look.hair === 'bald';
      const ax = Math.atan2(vx, vz), spin = (R() < 0.5 ? -1 : 1) * RR(3.5, 7);
      prop = spawnProp(helmed ? 6 : 1, { x: fr.pos.x, y: fr.pos.y, z: fr.pos.z, vx, vy, vz, q, wx: Math.cos(ax) * spin, wy: RR(-2, 2), wz: -Math.sin(ax) * spin, sx: 0.13 * sc, sy: 0.13 * sc, sz: 0.13 * sc, rad: 0.125 * sc, color: skin, hair: helmed ? (pal.plume || '#a02020') : (bald ? skin : (pal.hair || '#3a2a1a')), metal: pal.metal || '#9a9a9a' });
    } else prop = spawnProp(0, { x: fr.pos.x, y: fr.pos.y, z: fr.pos.z, vx, vy, vz, q, wx: RR(-10, 10), wy: RR(-8, 8), wz: RR(-10, 10), sx: fr.r * sc, sy: fr.len * sc, sz: fr.r * sc, len: fr.len * sc, rad: fr.r * sc, color: skin });
    if (!head) dropWeapon(f, part, vx, vy, vz);
    // predicted landing for the kill cam
    const g = 17, t = (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0.2, fr.pos.y))) / g; G.lastSever = { id, part, x: fr.pos.x + vx * t * 0.8, z: fr.pos.z + vz * t * 0.8, t: G.time };
    // stump spray: arterial fountain riding the parent joint
    addJet({ obj: jo, pos: fr.pos, dir: fr.axis.clone(), speed: head ? 10 : 8, rate: head ? 230 : 160, life: head ? 5.4 : 3.9, period: head ? 0.74 : 0.66, duty: 0.6, cone: head ? 0.12 : 0.1, size: head ? 1.4 : 1.2, elev: head ? 0.12 : 0.3, beat: true });
    addJet({ obj: jo, pos: fr.pos, dir: fr.axis.clone(), speed: 4.6, rate: 95, life: 2.4, period: 0.4, duty: 0.7, cone: 0.5, size: 1.0, elev: 0.35, delay: 0.1 });
    // splash burst at the cut
    fan(fr.pos, fr.axis.x, fr.axis.z, Math.round(70 * K()), { speed: 9, cone: 1.2, elMin: 0.0, elMax: 1.35, size: 1.5 }); fan(fr.pos, dx, dz, Math.round(8 * K()), { speed: 5, cone: 0.9, elMin: 0.3, elMax: 1.2, size: 2.5 });
    for (let i = 0, m = Math.round(13 * (G.tier === 'low' ? 0.6 : 1)); i < m; i++) fx.addNormalParticle({ x: fr.pos.x + RR(-0.08, 0.08), y: fr.pos.y + RR(-0.08, 0.1), z: fr.pos.z + RR(-0.08, 0.08), vx: RR(-1.5, 1.5) + fr.axis.x * 2, vy: RR(0.2, 1.8), vz: RR(-1.5, 1.5) + fr.axis.z * 2, life: RR(0.4, 0.75), s0: 0.22, s1: RR(0.9, 1.5), cell: CELL_PUFF, rot: R() * TAU, c0: { r: 0.5, g: 0.02, b: 0.03 }, c1: { r: 0.2, g: 0.01, b: 0.015 }, a: 0.55, drag: 2.8, fp: 1.2, att: 0.05 });
    rig.addBlood(head ? 0.3 : 0.2, 1);
    // chunks off the cut
    for (let i = 0, m = Math.round((head ? 8 : 5) * K()); i < m; i++) chunk(fr.pos, fr.axis.x * 2 + dx * 2, fr.axis.z * 2 + dz * 2, i % 3 === 2 ? 1 : 0);
    f.leak = 1; lens(fr.pos, head ? 4 : 3, 0.26);
    addPool(fr.pos.x + dx * 0.2, fr.pos.z + dz * 0.2, head ? 1.5 : 1.2, 0.22);
    // audio + feel: bone snap, wet rip, hiss, crowd gasp + roar
    const px = panOf(fr.pos.x); sfx('boneSnap', { pan: px }); sfx('slashWet', { pan: px, gain: 1 }); sfx('cleave', { pan: px, gain: 1, pitch: 0.9 }); sfx('squelch', { pan: px, gain: 1, pitch: 0.8 }); setTimeout(() => sfx('spurt', { pan: px, gain: 1 }), 120); sfx('crowdGore', { gain: 0.9 });
    if (feel) { feel.hitStop(150); feel.addTrauma(0.38); if (feel.kick) feel.kick(dx, 0.25, dz, 0.28); try { feel.flash(0.7, 0, 0.02, 0.16, 6); } catch (e) { /* ignore */ } }
    G.pulse(0.95);
    return true;
  };


  // ------------------------------------------------------------------ weapon drop, one-handed fighting, armour pop
  const BRAWL = 'brawl';
  /** a one-handed brawl stance built from the exported pose tables (left-hand backhand strikes, stump tucked). Needs no rig.js change. */
  function ensureBrawl() {
    if (WEAPON_POSES[BRAWL]) return true; const d = WEAPON_POSES.dual; if (!d || !d.attacks || !d.attacks.attack2) return false;
    const g = Object.assign({}, d.guard, { shoulderR: [-0.35, 0, -0.28], elbowR: [-1.0, 0, 0], wristR: [0, 0, 0], shoulderL: [-1.0, 0.1, 0.25], elbowL: [-1.55, 0, 0] });
    WEAPON_POSES[BRAWL] = { name: BRAWL, weapon: 'sword', twoHand: false, guard: g, attacks: { attack1: d.attacks.attack2, attack2: d.attacks.attack2, attack3: d.attacks.attack2 } };
    return true;
  }
  const WPN = { murmillo: 3, thraex: 3, dimachaerus: 3, hoplomachus: 4, retiarius: 5 }, WLEN = { 3: 0.95, 4: 2.3, 5: 2.15 };
  /** a hand came off: the weapon in it falls to the sand, and a fighter left with nothing switches to the one-handed brawl stance */
  function dropWeapon(f, part, vx, vy, vz) {
    const rig = f.rig, side = /L$/.test(part) ? 'L' : 'R'; if (!/^(fore)?arm[LR]$/.test(part)) return;
    const style = rig.style, dual = style === 'dimachaerus'; f.hands = f.hands || { R: true, L: dual };
    if (side === 'L' && !dual) { // off hand: the shield / net / spear grip goes with the arm
      const h = rig.animator.ik && rig.animator.ik.hand; if (h && h.side === 'L' && h._w === undefined) { h._w = h.w; h.w = 0; }
      for (const sx of rig.secondary) if (sx.mesh && sx.mesh.name === 'net') { sx.mesh.visible = false; }
      return;
    }
    if (!f.hands[side]) return; f.hands[side] = false;
    const hand = rig.joints['hand' + side]; if (!hand) return; hand.updateWorldMatrix(true, false);
    const type = WPN[style] || 3, L = WLEN[type], dir = _d.set(0, 1, 0).transformDirection(hand.matrixWorld).clone(), pos = _p.setFromMatrixPosition(hand.matrixWorld).clone();
    if (type !== 3) pos.addScaledVector(dir, -0.45);        // spears: the prop origin is the butt end
    const q = new Q().setFromUnitVectors(_a.set(0, -1, 0), dir), pal = rig.palette, sc = rig.root.scale.y * (rig.build ? rig.build.height : 1);
    const ax = Math.atan2(vx, vz), spin = (R() < 0.5 ? -1 : 1) * RR(4, 8);
    spawnProp(type, { x: pos.x, y: Math.max(0.4, pos.y), z: pos.z, vx: vx * 0.7 + RR(-0.6, 0.6), vy: RR(1.6, 3.2), vz: vz * 0.7 + RR(-0.6, 0.6), q, wx: Math.cos(ax) * spin, wy: RR(-2, 2), wz: -Math.sin(ax) * spin, sx: sc, sy: sc, sz: sc, len: L * sc, rad: 0.035, color: '#8a5a2a', metal: pal.metal || '#b8803a', bleeds: false });
    sfx('metalClang', { pan: panOf(pos.x), gain: 0.7, pitch: 0.9 });
    const left = dual ? (f.hands.R || f.hands.L) : false;
    if (!left && ensureBrawl()) { try { rig.animator.setWeapon(BRAWL); f.disarmed = true; const h = rig.animator.ik && rig.animator.ik.hand; if (h && h._w === undefined) { h._w = h.w; h.w = 0; } } catch (e) { /* the stance is cosmetic: keep fighting */ } }
  }
  /** heavy hits chip armour plates off the body (cosmetic spall props) and, on the worst blows, a hoplite's plume */
  function popArmor(f, e, fr) {
    if (f.rig.beast) return; // BEAST: no plates or plumes on animals
    const rig = f.rig, st = rig.style, metal = rig.palette.metal || '#9a9a9a', leather = (st === 'retiarius' || st === 'dimachaerus'), n = e.crit ? 2 + ((R() * 2) | 0) : 1;
    for (let i = 0; i < n; i++) { const c = e.pos, a = Math.atan2(e.dx, e.dz) + RR(-0.9, 0.9), s = RR(2.5, 5.5), sz = RR(0.06, 0.11);
      spawnProp(7, { x: c.x + RR(-0.1, 0.1), y: c.y + RR(-0.2, 0.3), z: c.z + RR(-0.1, 0.1), vx: Math.sin(a) * s, vy: RR(2.5, 5), vz: Math.cos(a) * s, q: new Q().setFromAxisAngle(_a.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), R() * TAU), wx: RR(-14, 14), wy: RR(-14, 14), wz: RR(-14, 14), sx: sz, sy: sz, sz: sz, color: leather ? '#6b4a2b' : '#ffffff', metal: leather ? '#6b4a2b' : metal, bleeds: false }); }
    fx.spark(e.pos, _d.set(e.dx, 0.3, e.dz), 5, '#ffe2a0', { speed: 6, size: 0.12 }); sfx('metalClang', { pan: panOf(c0x(e)), gain: 0.5, pitch: RR(1.1, 1.5) });
    if (st === 'hoplomachus' && !f.plumeGone && (e.crit || fr > 0.3) && R() < 0.6) {
      const pl = rig.secondary.find((x) => x.mesh && x.mesh.name === 'plume'); if (pl && pl.mesh.visible) {
        f.plumeGone = true; pl.mesh.visible = false; const hd = rig.joints.head; hd.updateWorldMatrix(true, false); _p.setFromMatrixPosition(hd.matrixWorld); _p.y += 0.18; const sc = rig.root.scale.y * (rig.build ? rig.build.height : 1);
        spawnProp(8, { x: _p.x, y: _p.y, z: _p.z, vx: e.dx * RR(1.5, 3) + RR(-1, 1), vy: RR(2.2, 4), vz: e.dz * RR(1.5, 3) + RR(-1, 1), q: new Q().setFromAxisAngle(_a.set(R() - 0.5, R(), R() - 0.5).normalize(), R() * TAU), wx: RR(-5, 5), wy: RR(-5, 5), wz: RR(-5, 5), sx: 0.3 * sc, sy: 0.3 * sc, sz: 0.3 * sc, color: '#ffffff', hair: rig.palette.plume || '#a02020', bleeds: false });
      }
    }
  }
  const c0x = (e) => (e.pos ? e.pos.x : 0);

  /** kind 0 flesh, 1 bone shard (pale, thin), 2 sand clump soaked in blood (dark brown, flung up from the floor) */
  function chunk(pos, bx, bz, kind = 0) {
    const a = R() * TAU, s = kind === 2 ? RR(1.5, 4) : RR(2, 7), r = R(), col = kind === 1 ? '#b9ae96' : kind === 2 ? '#5a2a1c' : r < 0.55 ? '#6e0d12' : r < 0.85 ? '#a02f33' : '#b5ac9c', sz = kind === 1 ? RR(0.03, 0.05) : kind === 2 ? RR(0.05, 0.11) : RR(0.035, 0.1);
    spawnProp(2, { x: pos.x, y: Math.max(0.1, pos.y), z: pos.z, vx: Math.cos(a) * s + bx * 0.3, vy: kind === 2 ? RR(2.5, 4.5) : RR(2.5, 7), vz: Math.sin(a) * s + bz * 0.3, q: new Q().setFromAxisAngle(_a.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), R() * TAU), wx: RR(-12, 12), wy: RR(-12, 12), wz: RR(-12, 12), sx: sz * (kind === 1 ? 0.5 : RR(0.8, 1.4)), sy: sz * (kind === 1 ? RR(2, 3) : RR(0.6, 1)), sz: sz * (kind === 1 ? 0.5 : RR(0.8, 1.3)), color: col });
  }

  /** a fighter went down. ctx: {last, crit, frac (of the lethal blow), dx, dz, big (ultimate gibbing), mine} */
  G.onDown = (id, ctx = {}) => {
    if (!G.on) return null; const f = fighterOf(id); if (!f) return null; f.down = true; f.bleeding = 0;
    const dx = ctx.dx ?? f.dir.x, dz = ctx.dz ?? f.dir.z; f.rig.root.getWorldPosition(_p); const x = _p.x, z = _p.z;
    f.rig.addBlood(0.3, 1);
    // pool under the torso, spreading in the fall direction, plus a smear dragged back along the blow
    f.pool = addPool(x + dx * 0.45, z + dz * 0.45, 1.3 + Math.min(1.0, (ctx.frac || 0) * 2.5), 0.19); addPool(x + dx * 0.9 + RR(-0.2, 0.2), z + dz * 0.9 + RR(-0.2, 0.2), 0.75, 0.13, 0.5); f.leak = 1;
    stampSmear(x - dx * 0.1, z - dz * 0.1, x + dx * RR(1.0, 1.7), z + dz * RR(1.0, 1.7), 0.32, 0.9);
    // killing blow: a big pulsing fountain from the wound, falling with the body
    if (G.full || ctx.crit) { addJet({ obj: f.rig.joints.chest, pos: chestPos(f, _a, 1.3), dir: _d.set(dx * 0.6, 1, dz * 0.6).normalize().clone(), speed: 8, rate: 150, life: 3.8, period: 0.66, duty: 0.58, cone: 0.16, size: 1.35, beat: true }); if (ctx.last || ctx.crit) addJet({ obj: f.rig.joints.chest, pos: chestPos(f, _a, 1.1), dir: _d.set(-dx * 0.3 + RR(-0.4, 0.4), 0.8, -dz * 0.3 + RR(-0.4, 0.4)).normalize().clone(), speed: 6, rate: 110, life: 3, period: 0.72, duty: 0.6, cone: 0.2, size: 1.2, beat: true, delay: 0.12 }); }
    fan(chestPos(f, _a, 1.2), dx, dz, Math.round(64 * K()), { speed: 9, cone: 0.7, elMin: 0.1, elMax: 1.1, size: 1.4 }); fan(_a, dx, dz, Math.round(8 * K()), { speed: 5.5, cone: 0.8, elMin: 0.3, elMax: 1.1, size: 2.5 });
    sfx('splat', { pan: panOf(x), gain: 0.9 }); sfx('squelch', { pan: panOf(x), gain: 0.9, pitch: 0.8 }); G.pulse(0.7); lens(_a, ctx.last ? 3 : 1, ctx.last ? 0.28 : 0.2);
    if (feel) { feel.hitStop(ctx.last ? 130 : 110); if (feel.kick) feel.kick(dx, 0.2, dz, ctx.last ? 0.3 : 0.2); }
    if (ctx.last) { // GORE-JUICE: the finishing blow is messier, a cinematic burst timed to the strike: a mist cloud, flesh and bone, a second spray, the cleave
      for (let i = 0, m = Math.round(16 * (G.tier === 'low' ? 0.6 : 1) * (G.level === 'low' ? 0.6 : 1)); i < m; i++) fx.addNormalParticle({ x: _a.x + RR(-0.2, 0.2), y: _a.y + RR(-0.3, 0.3), z: _a.z + RR(-0.2, 0.2), vx: dx * RR(1, 4) + RR(-1.2, 1.2), vy: RR(0.2, 1.8), vz: dz * RR(1, 4) + RR(-1.2, 1.2), life: RR(0.5, 0.95), s0: 0.25, s1: RR(1.0, 1.9), cell: CELL_PUFF, rot: R() * TAU, c0: { r: 0.5, g: 0.02, b: 0.03 }, c1: { r: 0.2, g: 0.01, b: 0.015 }, a: 0.6, drag: 2.6, fp: 1.2, att: 0.05 });
      fan(_a, dx, dz, Math.round(50 * K()), { speed: 11, cone: 0.9, elMin: 0.05, elMax: 1.0, size: 1.5 });
      if (G.full) for (let i = 0, m = Math.round(6 * (K() > 0.6 ? 1 : 0.6)); i < m; i++) chunk(_a, dx * 3, dz * 3, i % 3 === 2 ? 1 : 0);
      sfx('cleave', { pan: panOf(x), gain: 1, pitch: 0.85 }); sfx('crowdGore', { gain: 0.8 });
    }
    let part = pickPart(f, ctx), took = false;
    if (part && G.sever(id, part, dx, dz, ctx.big ? 1.3 : 1)) took = true;
    if (ctx.big && G.full) { const ex = ['armL', 'forearmR', 'shinL', 'shinR'].find((p) => !f.rig.severed[p] && p !== part); if (ex) G.sever(id, ex, dx + RR(-0.8, 0.8), dz + RR(-0.8, 0.8), 1.4); chestPos(f, _a, 1.1); for (let i = 0, m = Math.round(26 * K()); i < m; i++) chunk(_a, dx, dz); fan(_a, 0, 1, Math.round(70 * K()), { speed: 9, cone: Math.PI, elMin: 0.2, elMax: 1.4, size: 1.3 }); addPool(x, z, 1.9, 0.3); sfx('crowdGore', { gain: 1 }); }
    return took ? part : null;
  };

  /** replay seek: drop everything airborne (droplets, jets), grow the pools and let the flung props land, so skipped time leaves only what stays on the sand */
  G.settle = (sec = 3) => {
    if (!G.on) return; dropClear(); jets.length = 0;
    for (const p of pools) { p.delay = 0; if (p.r < p.rMax) p.r = p.rMax * 0.92; }
    if (gib) { for (let t = 0; t < sec; t += 0.1) stepProps(0.1); dropClear(); }
  };

  /** shader warm-up: the gib mesh is built and drawn once (a dead instance) so its program compiles before the first limb flies */
  G.warm = (on) => { if (on) { if (!gib) buildGib(); gib.count = 1; gib.visible = true; } else if (gib) { gib.count = chunkHi ? MAXLH + chunkHi : lhCur; gib.visible = props.length > 0; } };

  /** world points the kill camera should keep in frame (flung limb landing) */
  G.framePoints = (id) => { const s = G.lastSever; if (!G.on || !s || s.id !== id || G.time - s.t > 6) return null; return [[s.x, 0.15, s.z]]; };

  // ------------------------------------------------------------------ lifecycle
  G.refresh = () => { G.level = goreLevel(); G.on = G.level !== 'off'; G.full = G.level === 'full'; if (!G.on) lensClear(); return G.level; };
  G.setTier = (t) => { G.tier = t; };
  G.reset = (seed = 1) => {
    G.refresh(); rs = mulberry((seed >>> 0) || 1); G.time = 0; G.counts.splats = 0; G.cover = 0; lensClear(); fArr.length = 0; covGrid.fill(0); covT = dryT = fadeT = 0; dryN = 0; dropClear(); jets.length = 0; pools.length = 0; drySq.length = 0; props = []; chunkCur = MAXLH; lhCur = 0; chunkHi = 0; G.lastSever = null; vig = 0;
    if (gib) { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAXP; i++) gib.setMatrixAt(i, z); gib.instanceMatrix.needsUpdate = true; gib.count = 0; gib.visible = false; }
    for (const f of G.fighters.values()) { try { f.rig.onEvent = f.prevOnEvent; } catch (e) { /* ignore */ } } G.fighters.clear();
  };
  G.dispose = () => { G.reset(); if (vigEl && vigEl.parentNode) vigEl.parentNode.removeChild(vigEl); if (lensC && lensC.parentNode) lensC.parentNode.removeChild(lensC); lensC = null; if (gib) { scene && scene.remove(gib); gib.geometry.dispose(); gib.material.dispose(); gib = null; } };

  // GORE-JUICE: blood on the blade drips until the fight ends (slow decay), a wounded fighter leaks and leaves a bloody trail while it moves or is shoved
  function fighterDrips(f, dt) {
    const rig = f.rig; f.wet = f.wet > dt * 0.03 ? f.wet - dt * 0.03 : 0; f.leak = f.leak > dt * (f.down ? 0.07 : 0.05) ? f.leak - dt * (f.down ? 0.07 : 0.05) : 0;
    f.dripAcc += dt * (f.wet * 2.6 + f.leak * (f.down ? 1.6 : 4)) * K(); if (f.dripAcc > 3) f.dripAcc = 3;
    if (f.dripAcc >= 1) {
      f.dripAcc--; const weapon = f.wet > 0 && !f.down && R() * (f.wet + f.leak) < f.wet, hand = rig.joints[rig.beast ? 'head' : 'handR'];
      if (weapon && hand && !(f.hands && f.hands.R === false)) { hand.getWorldPosition(_p); if (!rig.beast) { const m = hand.matrixWorld.elements; _p.x += m[4] * 0.75; _p.y += m[5] * 0.75; _p.z += m[6] * 0.75; } drop(_p.x, _p.y, _p.z, RR(-0.25, 0.25), RR(-0.3, 0.1), RR(-0.25, 0.25), RR(0.055, 0.09), R() * 0.5); }
      else { const j = rig.joints.chest; if (j) { j.getWorldPosition(_p); drop(_p.x + RR(-0.12, 0.12), Math.max(0.1, _p.y - 0.25), _p.z + RR(-0.12, 0.12), RR(-0.3, 0.3), RR(-0.3, 0.2), RR(-0.3, 0.3), RR(0.055, 0.1), R() * 0.5); } }
    }
    if (f.leak > 0.25) { f.trailT += dt; if (f.trailT > 0.3) { f.trailT = 0; rig.root.getWorldPosition(_p); if (f.tx < 1e8) { const mv = Math.hypot(_p.x - f.tx, _p.z - f.tz); if (mv > 0.35 && mv < 6) { stampSmear(f.tx, f.tz, _p.x, _p.z, f.down ? 0.34 : 0.13, Math.min(0.8, 0.25 + f.leak * 0.6)); } } f.tx = _p.x; f.tz = _p.z; } }
  }

  // ------------------------------------------------------------------ per frame: simulation + immediate-mode instances (called from fx.update, after the pooled step)
  fx.hooks.push((dt, norL) => {
    if (!G.on) { if (nAct) dropClear(); return; }
    G.time += dt; splatBudget = G.tier === 'low' ? 40 : 90; covT += dt; dryT += dt; fadeT += dt;
    if (covT > 1.5) { covT = 0; measureCover(); } if (dryT > 5) { dryT = 0; dryAll(); } if (fadeT > 0.45) { fadeT = 0; if (G.time > 6) clearUnderFeet(); }
    stepJets(dt); stepPools(dt); stepProps(dt);
    for (let i = 0; i < fArr.length; i++) { const f = fArr[i]; if (f.wet > 0.02 || f.leak > 0.02) fighterDrips(f, dt); }
    // PERF: streaks are written straight into the fx layer's typed arrays (a call with ~12 double arguments boxes every one of them: that was ~14 KB per frame)
    const nA = norL.A, nB = norL.B, nC = norL.C, nD = norL.D, nMax = norL.max, cam = fx.cam, cx = cam ? cam.position.x : 0, cy = cam ? cam.position.y : 99, cz = cam ? cam.position.z : 0;
    for (let a = nAct - 1; a >= 0; a--) {
      const i = act[a]; let x = dX[i], y = dY[i], z = dZ[i], vy = dVY[i]; const vx = dVX[i], vz = dVZ[i], age = dAge[i] + dt; vy -= GRAV * dt; x += vx * dt; y += vy * dt; z += vz * dt; dAge[i] = age; dVY[i] = vy; dX[i] = x; dY[i] = y; dZ[i] = z;
      if (y <= 0.03 && vy < 0 || age > DROP_LIFE || x > 30 || x < -30 || z > 30 || z < -30) { if (y <= 0.05) land(i); act[a] = act[--nAct]; freeI[nFree++] = i; continue; }
      if (norL.n >= nMax) continue;
      const sp2 = vx * vx + vy * vy + vz * vz, sp = sp2 > 0 ? Math.sqrt(sp2) : 1, o4 = norL.n++ * 4, ds = dS[i];
      const ex = x - cx, ey = y - cy, ez = z - cz, dc2 = ex * ex + ey * ey + ez * ez, nk = dc2 < 49 ? (dc2 < 4 ? 0.3 : 0.3 + 0.7 * (Math.sqrt(dc2) - 2) / 5) : 1;   // drops that pass right by the lens shrink (a kill cam close-up must not drown in red)
      let k = dK[i] * 0.7 + age * 0.18; k = k < 0 ? 0 : k > 1 ? 1 : k;
      nC[o4] = (BRIGHT.r + (DARK.r - BRIGHT.r) * k) * 1.25; nC[o4 + 1] = (BRIGHT.g + (DARK.g - BRIGHT.g) * k) * 1.25; nC[o4 + 2] = (BRIGHT.b + (DARK.b - BRIGHT.b) * k) * 1.25; nC[o4 + 3] = 0.96;
      nA[o4] = x; nA[o4 + 1] = y; nA[o4 + 2] = z; nD[o4 + 1] = 0; nD[o4 + 2] = 0; nD[o4 + 3] = 0;
      if (sp < 2.4) { nA[o4 + 3] = ds * 1.7 * nk; nB[o4] = 0; nB[o4 + 1] = 1; nB[o4 + 2] = 0; nB[o4 + 3] = 0; nD[o4] = CELL_DISC; }   // hanging / dripping: round blob
      else { let len = sp * 0.05; const lo = ds * 1.3; len = len < lo ? lo : len > 0.85 ? 0.85 : len; nA[o4 + 3] = ds * 2.6 * nk; nB[o4] = vx / sp; nB[o4 + 1] = vy / sp; nB[o4 + 2] = vz / sp; nB[o4 + 3] = Math.max(len * 1.15 * nk, 1e-3); nD[o4] = CELL_STREAK; }
    }
    G.counts.drops = nAct; G.counts.jets = jets.length; G.counts.props = props.length; G.counts.pools = pools.length;
  });
  /** real-time part of the frame (vignette) */
  let vigQ = -1;   // PERF: the vignette opacity string is rebuilt only when the 1/1000 step changes (it is '0' almost always)
  G.postFrame = (realDt) => { lensFrame(realDt); if (!vigEl) return; vig = vig - realDt * 1.7; if (vig < 0) vig = 0; const v = G.on ? vig : 0, q = v < 0.01 ? 0 : Math.round(v * 1000) + 1; if (q !== vigQ) { vigQ = q; vigEl.style.opacity = q ? ((q - 1) / 1000).toFixed(3) : '0'; } };
  G.debug = () => props.map((p) => ({ t: p.type, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), rest: p.rest }));
  G.stats = () => ({ level: G.level, lens: lensN, drops: nAct, jets: jets.length, props: props.length, pools: pools.length, splats: G.counts.splats, gibVisible: !!(gib && gib.visible) });
  G.refresh();
  return G;
}
