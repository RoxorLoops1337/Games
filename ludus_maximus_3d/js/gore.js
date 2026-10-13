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

  // ------------------------------------------------------------------ decal painting on fx's canvas
  const DD = fx.decalDraw, dctx = DD.ctx;
  const SPR = []; {
    const rnd = mulberry(4242);
    for (let v = 0; v < 6; v++) {
      const c = mk(128, 128), g = c.getContext('2d'); g.translate(64, 64);
      // thin radiating drops and satellites
      const n = 5 + ((rnd() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, L = 30 + rnd() * 30, w = 1.4 + rnd() * 2.4; g.fillStyle = `rgba(104,9,11,${0.7 + rnd() * 0.25})`;
        g.save(); g.rotate(a); g.beginPath(); g.moveTo(14, -w); g.quadraticCurveTo(L * 0.6, -w * 0.5, L, 0); g.quadraticCurveTo(L * 0.6, w * 0.5, 14, w); g.fill();
        g.beginPath(); g.arc(L + 3 + rnd() * 3, 0, 1.6 + rnd() * 2.2, 0, TAU); g.fill(); g.restore();
      }
      for (let i = 0; i < 5; i++) { const a = rnd() * TAU, d = 36 + rnd() * 24; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 1.2 + rnd() * 2.6, 0, TAU); g.fillStyle = 'rgba(96,8,10,0.85)'; g.fill(); }
      // main irregular blob
      const m = 12, pts = []; for (let i = 0; i < m; i++) { const a = i / m * TAU, r = 15 + rnd() * 13; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      g.beginPath(); for (let i = 0; i < m; i++) { const p0 = pts[i], p1 = pts[(i + 1) % m], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p0[0], p0[1], mx, my); }
      g.quadraticCurveTo(pts[0][0], pts[0][1], (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2); g.closePath();
      const gr = g.createRadialGradient(-3, -3, 2, 0, 0, 30); gr.addColorStop(0, 'rgba(150,14,16,0.97)'); gr.addColorStop(0.6, 'rgba(112,9,12,0.95)'); gr.addColorStop(1, 'rgba(84,7,9,0.9)'); g.fillStyle = gr; g.fill();
      g.fillStyle = 'rgba(214,52,56,0.5)'; g.beginPath(); g.ellipse(-5, -7, 7 + rnd() * 3, 3.4, -0.5, 0, TAU); g.fill(); // wet highlight (dried by the dry pass)
      g.fillStyle = 'rgba(255,225,220,0.45)'; g.beginPath(); g.ellipse(-7, -9, 2.4, 1.2, -0.5, 0, TAU); g.fill();
      SPR.push(c);
    }
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
  const capK = () => 1 - sstep(0.1, 0.24, G.cover);   // 1 = fresh sand, 0 = already well covered
  function dryAll() { // old blood goes darker and browner (source-atop only touches painted pixels)
    if (dryN >= 7) return; dryN++; dctx.save(); dctx.globalCompositeOperation = 'source-atop'; dctx.fillStyle = 'rgba(38,6,5,0.055)'; dctx.fillRect(0, 0, DD.size, DD.size); dctx.restore(); fx.markDecals();
  }
  function clearUnderFeet() { // gently lift the stains right under living fighters
    dctx.save(); dctx.globalCompositeOperation = 'destination-out';
    for (const f of G.fighters.values()) { if (f.down) continue; f.rig.root.getWorldPosition(_p); const [px, pz] = DD.toPx(_p.x, _p.z), r = 1.0 * DD.k, gr = dctx.createRadialGradient(px, pz, 0, px, pz, r); gr.addColorStop(0, 'rgba(0,0,0,0.16)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); dctx.fillStyle = gr; dctx.beginPath(); dctx.arc(px, pz, r, 0, TAU); dctx.fill(); fx.markDecals(_p.x, _p.z, 1.2); }
    dctx.restore();
  }
  function stampSplat(x, z, size, ang, stretch = 1, a = 1) {
    const ck = capK(); if (splatBudget <= 0 && size < 0.3) return; if (G.counts.splats > 650 && size < 0.3 && R() < 0.7) return; if (ck < 1 && size < 0.35 && R() > 0.25 + 0.75 * ck) return; splatBudget--; G.counts.splats++;
    const [px, pz] = DD.toPx(x, z), s = size * DD.k * (128 / 58) * (0.78 + 0.22 * ck);
    dctx.save(); dctx.translate(px, pz); dctx.rotate(ang); dctx.scale(stretch, 1); dctx.globalAlpha = a * (0.6 + 0.4 * ck); dctx.drawImage(SPR[(R() * SPR.length) | 0], -s / 2, -s / 2, s, s); dctx.restore();
    fx.markDecals(x, z, size * 0.9); addCover(x, z, size * 0.62, 0.8);
  }
  function stampSmear(x0, z0, x1, z1, w, a = 0.8) {
    const [a0, b0] = DD.toPx(x0, z0), [a1, b1] = DD.toPx(x1, z1); dctx.save(); dctx.lineCap = 'round';
    dctx.strokeStyle = `rgba(86,7,9,${a * 0.85})`; dctx.lineWidth = w * DD.k; dctx.beginPath(); dctx.moveTo(a0, b0); dctx.lineTo(a1, b1); dctx.stroke();
    dctx.strokeStyle = `rgba(150,14,16,${a * 0.5})`; dctx.lineWidth = w * DD.k * 0.45; dctx.stroke(); dctx.restore(); fx.markDecals((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + w); addCover((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 * 0.5 + w * 0.5, 0.5);
  }
  function stampFoot(x, z, heading, side, a) {
    const [px, pz] = DD.toPx(x + Math.cos(heading + Math.PI / 2) * 0.09 * side, z + Math.sin(heading + Math.PI / 2) * 0.09 * side), L = 0.3 * DD.k, W = 0.11 * DD.k;
    dctx.save(); dctx.translate(px, pz); dctx.rotate(heading); dctx.fillStyle = `rgba(104,9,11,${a})`;
    dctx.beginPath(); dctx.ellipse(-L * 0.12, 0, L * 0.3, W * 0.62, 0, 0, TAU); dctx.fill(); dctx.beginPath(); dctx.ellipse(L * 0.2, 0, L * 0.34, W * 0.7, 0, 0, TAU); dctx.fill(); dctx.restore(); fx.markDecals(x, z, 0.5);
  }
  function stampPool(p) {
    const [px, pz] = DD.toPx(p.x, p.z), r = p.r * DD.k, m = p.pts.length; dctx.save(); dctx.globalAlpha = 0.5 + 0.5 * capK(); dctx.translate(px, pz); dctx.rotate(p.rot += 0.35);
    dctx.beginPath(); for (let i = 0; i < m; i++) { const a0 = i / m * TAU, a1 = (i + 1) / m * TAU, r0 = r * p.pts[i], r1 = r * p.pts[(i + 1) % m]; const mx = (Math.cos(a0) * r0 + Math.cos(a1) * r1) / 2, my = (Math.sin(a0) * r0 + Math.sin(a1) * r1) / 2; if (i === 0) dctx.moveTo(mx, my); else dctx.quadraticCurveTo(Math.cos(a0) * r0, Math.sin(a0) * r0, mx, my); }
    dctx.closePath(); const gr = dctx.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(96,8,10,0.34)'); gr.addColorStop(0.7, 'rgba(112,9,12,0.3)'); gr.addColorStop(1, 'rgba(120,12,14,0.16)'); dctx.fillStyle = gr; dctx.fill(); dctx.restore(); fx.markDecals(p.x, p.z, p.r * 1.3);
  }
  function stampGloss(p) { // fresh wet highlights, covered by the dry pass
    const [px, pz] = DD.toPx(p.x, p.z), r = p.r * DD.k; dctx.save(); dctx.translate(px, pz);
    dctx.fillStyle = 'rgba(206,44,48,0.38)'; dctx.beginPath(); dctx.ellipse(-r * 0.2, -r * 0.24, r * 0.34, r * 0.13, -0.5, 0, TAU); dctx.fill();
    dctx.fillStyle = 'rgba(255,215,210,0.34)'; dctx.beginPath(); dctx.ellipse(-r * 0.27, -r * 0.3, r * 0.1, r * 0.04, -0.5, 0, TAU); dctx.fill(); dctx.restore();
  }
  function dryPass(d) {
    const [px, pz] = DD.toPx(d.x, d.z), r = Math.max(2, d.r * DD.k * 1.25); dctx.save(); dctx.globalCompositeOperation = 'source-atop';
    const gr = dctx.createRadialGradient(px, pz, 0, px, pz, r); gr.addColorStop(0, 'rgba(46,6,6,0.34)'); gr.addColorStop(0.75, 'rgba(46,6,6,0.2)'); gr.addColorStop(1, 'rgba(46,6,6,0)'); dctx.fillStyle = gr; dctx.beginPath(); dctx.arc(px, pz, r, 0, TAU); dctx.fill(); dctx.restore(); fx.markDecals(d.x, d.z, d.r * 1.3);
  }

  // ------------------------------------------------------------------ droplets (pooled, own gravity, splat on landing)
  const ND = G.tier === 'low' ? 200 : G.tier === 'medium' ? 320 : 460;
  const drops = [], dfree = []; for (let i = 0; i < ND; i++) dfree.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.05, age: 0, life: 1.5, k: 0, child: false });
  function drop(x, y, z, vx, vy, vz, s, k = R(), child = false) {
    const d = dfree.pop(); if (!d) return; d.x = x; d.y = y; d.z = z; d.vx = vx; d.vy = vy; d.vz = vz; d.s = s; d.age = 0; d.life = 2.4; d.k = k; d.child = child; drops.push(d);
  }
  /** fan of droplets around horizontal direction (dx,dz). o: speed, cone (rad), elMin/elMax (rad), size */
  function fan(p, dx, dz, n, o) {
    const h0 = Math.atan2(dx, dz), cone = o.cone ?? 0.5, e0 = o.elMin ?? 0.1, e1 = o.elMax ?? 0.9;
    for (let i = 0; i < n; i++) {
      const h = h0 + RR(-cone, cone), e = RR(e0, e1), sp = (o.speed ?? 6) * (0.3 + 0.85 * Math.pow(R(), 0.65)), ce = Math.cos(e);
      drop(p.x + RR(-0.05, 0.05), p.y + RR(-0.05, 0.05), p.z + RR(-0.05, 0.05), Math.sin(h) * ce * sp, Math.sin(e) * sp, Math.cos(h) * ce * sp, RR(0.06, 0.14) * (o.size ?? 1) * (0.7 + 0.3 * (1 - sp / ((o.speed ?? 6) * 1.15))), R());
    }
  }
  function land(d) {
    const sp = Math.sqrt(d.vx * d.vx + d.vz * d.vz), size = clamp(d.s * RR(3.4, 5.2), 0.1, 0.5), st = 1 + Math.min(1.7, sp * 0.16);
    stampSplat(d.x, d.z, size, Math.atan2(d.vz, d.vx), st, 0.9);
    if (!d.child && d.s > 0.07 && R() < 0.5 && dfree.length > 40) { for (let i = 0; i < 2; i++) { const a = R() * TAU, s2 = RR(1.2, 3); drop(d.x, 0.05, d.z, Math.cos(a) * s2 + d.vx * 0.2, RR(1.5, 3.2), Math.sin(a) * s2 + d.vz * 0.2, d.s * 0.5, R(), true); } }
  }

  // ------------------------------------------------------------------ jets (pulsing arterial sprays, stick to a joint so they ride the body)
  const jets = [], _inv = new THREE.Matrix4(), _p = new V3(), _d = new V3(), _a = new V3(), _b = new V3(), _q = new Q(), _q2 = new Q();
  function addJet(j) {
    if (jets.length >= 16) jets.shift();
    const J = { speed: 7, rate: 110, life: 1.2, period: 0.62, duty: 0.55, cone: 0.09, size: 1, elev: 0, t: 0, acc: 0, obj: null, lp: null, ld: null, p: null, d: null, ...j };
    if (j.obj) { j.obj.updateWorldMatrix(true, false); _inv.copy(j.obj.matrixWorld).invert(); J.lp = j.pos.clone().applyMatrix4(_inv); J.ld = j.dir.clone().transformDirection(_inv); }
    else { J.p = j.pos.clone(); J.d = j.dir.clone().normalize(); }
    J.t = -(j.delay || 0); jets.push(J); return J;
  }
  function stepJets(dt) {
    for (let i = jets.length - 1; i >= 0; i--) {
      const j = jets[i]; j.t += dt; if (j.t < 0) continue; if (j.t >= j.life) { jets[i] = jets[jets.length - 1]; jets.pop(); continue; }
      if (j.obj) { _p.copy(j.lp).applyMatrix4(j.obj.matrixWorld); _d.copy(j.ld).transformDirection(j.obj.matrixWorld); } else { _p.copy(j.p); _d.copy(j.d); }
      const life = 1 - j.t / j.life, ph = (j.t % j.period) / j.period;
      const env = (ph < j.duty ? Math.pow(Math.sin(Math.PI * ph / j.duty), 1.1) : 0) * Math.pow(life, 0.55) + 0.1 * life;
      j.acc += dt * j.rate * env * K(); if (j.acc > 60) j.acc = 60;
      while (j.acc >= 1) {
        j.acc--; const sp = j.speed * RR(0.82, 1.14) * (0.5 + 0.5 * env);
        _a.set(_d.x + RR(-j.cone, j.cone), _d.y + RR(-j.cone, j.cone) + j.elev, _d.z + RR(-j.cone, j.cone)).normalize();
        drop(_p.x, _p.y, _p.z, _a.x * sp, _a.y * sp, _a.z * sp, RR(0.07, 0.13) * j.size, R() * 0.6);
      }
    }
  }

  // ------------------------------------------------------------------ pools
  const pools = [];
  function addPool(x, z, rMax, rate = 0.14, delay = 0) {
    rMax *= POOLK() * (0.7 + 0.3 * capK()); if (pools.length >= 26) { const i = pools.findIndex((p) => p.done); pools.splice(i >= 0 ? i : 0, 1); }
    const pts = []; for (let i = 0; i < 12; i++) pts.push(0.74 + R() * 0.5); const p = { x, z, r: 0.07, rMax, rate, acc: 1, pts, rot: R() * TAU, done: false, delay }; pools.push(p); addCover(x, z, rMax * 0.85, 0.5); return p;
  }
  function stepPools(dt) {
    for (let pi = 0; pi < pools.length; pi++) {
      const p = pools[pi]; if (p.delay > 0) { p.delay -= dt; continue; }
      if (p.r < p.rMax) { { const nr = p.r + p.rate * dt * (1.15 - p.r / p.rMax * 0.5); p.r = nr < p.rMax ? nr : p.rMax; } p.acc += dt; if (p.acc > 0.12) { p.acc = 0; stampPool(p); } }
      else if (!p.done) { p.done = true; stampPool(p); stampGloss(p); drySq.push({ t: G.time + 4.5, x: p.x, z: p.z, r: p.rMax * 1.05 }); }
    }
    for (let i = drySq.length - 1; i >= 0; i--) if (G.time >= drySq[i].t) { dryPass(drySq[i]); drySq[i] = drySq[drySq.length - 1]; drySq.pop(); }
  }
  const inPool = (x, z) => { for (let i = 0; i < pools.length; i++) { const p = pools[i], dx = x - p.x, dz = z - p.z; if (p.delay <= 0 && Math.sqrt(dx * dx + dz * dz) < p.r * 0.8) return true; } return false; };

  // ------------------------------------------------------------------ gib props: ONE InstancedMesh (shape selected per instance in the vertex shader)
  // types: 0 limb, 1 head, 2 chunk, 3 sword, 4 spear, 5 trident, 6 helmed head, 7 armour plate, 8 plume tuft. Weapons and limbs hang from y=0 toward -y.
  // vertex mask (aMask): 0 = vertex shade x instance colour (skin / wood), 1 = shade x iHair (hair, plume), 2 = shade x iMetal (helm, plates), 3 = absolute colour (flesh, steel, blood)
  const MAXP = 56, MAXLH = 12; let gib = null, gibType = null, gibHair = null, gibMetal = null, props = [], chunkCur = MAXLH, lhCur = 0, chunkHi = 0;
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
    if (isRing(type)) { i = chunkCur; chunkCur = chunkCur + 1 >= MAXP ? MAXLH : chunkCur + 1; chunkHi = Math.max(chunkHi, i - MAXLH + 1); } else { if (lhCur >= MAXLH) return null; i = lhCur++; }
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
  function fighterOf(id) { return G.fighters.get(id); }
  G.addFighter = (id, rig, info = {}) => {
    const f = { id, rig, maxhp: info.maxhp || 100, side: info.side || 'A', blood: 0, bleeding: 0, bleedAcc: 0, down: false, foot: 0, stepSide: 1, sev: [], dir: new V3(1, 0, 0), pool: null, tmp: new V3(), prevOnEvent: rig.onEvent };
    rig.onEvent = (n, clip) => { if (f.prevOnEvent) f.prevOnEvent(n, clip); if (n === 'step') onStep(f, clip && clip.side); };
    G.fighters.set(id, f); return f;
  };
  function onStep(f, side) {
    if (!G.on || f.down) return; const a = f.rig.joints['ankle' + (side || 'L')]; if (!a) return; a.getWorldPosition(_p);
    if (f.foot < 0.9 && inPool(_p.x, _p.z)) f.foot = 1;
    if (f.foot > 0.06) { const yaw = f.rig.root.rotation.y; stampFoot(_p.x, _p.z, -yaw + Math.PI / 2, side === 'L' ? 1 : -1, clamp(f.foot * 0.85, 0, 0.8)); f.foot *= 0.8; }
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
    const k = K(), heavy = fr > 0.12 || e.crit, n = Math.round((7 + fr * 150 + (e.crit ? 32 : 0)) * k), sp = 3.8 + fr * 15 + (e.crit ? 3 : 0);
    f.dir.set(e.dx, 0, e.dz);
    fan(e.pos, e.dx, e.dz, Math.round(n * 0.68), { speed: sp, cone: 0.5, elMin: 0.05, elMax: 0.95, size: 1 + fr * 0.9 });
    fan(e.pos, -e.dx, -e.dz, Math.round(n * 0.32), { speed: 1.6 + fr * 3.5, cone: 1.0, elMin: 0.1, elMax: 1.25, size: 0.75 });
    if (heavy) for (let i = 0, m = Math.round(RR(3, 5) * (G.tier === 'low' ? 0.6 : 1)); i < m; i++) fx.addNormalParticle({ x: e.pos.x + RR(-0.1, 0.1), y: e.pos.y + RR(-0.15, 0.15), z: e.pos.z + RR(-0.1, 0.1), vx: e.dx * RR(1, 3) + RR(-0.6, 0.6), vy: RR(0.2, 1.2), vz: e.dz * RR(1, 3) + RR(-0.6, 0.6), life: RR(0.35, 0.6), s0: 0.18, s1: RR(0.7, 1.1), cell: CELL_PUFF, rot: R() * TAU, c0: { r: 0.5, g: 0.02, b: 0.03 }, c1: { r: 0.22, g: 0.01, b: 0.015 }, a: 0.5, drag: 3.4, fp: 1.3, att: 0.05 });
    if (heavy && G.full || e.crit) {
      const nj = e.crit ? 2 : 1, obj = f.rig.joints.chest;
      for (let i = 0; i < nj; i++) { _d.set(e.dx + RR(-0.3, 0.3), RR(0.55, 1.0), e.dz + RR(-0.3, 0.3)).normalize(); addJet({ obj, pos: e.pos, dir: _d.clone(), speed: 5.5 + fr * 8 + (e.crit ? 2 : 0), rate: 70 + fr * 150, life: 0.55 + fr * 2.4 + (e.crit ? 0.6 : 0), period: 0.3 + R() * 0.12, duty: 0.6, size: 1 }); }
    }
    if (fr > 0.03 || e.crit) placeWound(f, e.dx, e.dz, fr);
    f.rig.addBlood(fr * 0.8 + (e.crit ? 0.07 : 0) + 0.012, 1);
    const at = e.attacker && fighterOf(e.attacker); if (at && heavy) at.rig.addBlood(fr * 0.3 + 0.02, 1);
    // ground: an immediate splash fan on the sand near the victim
    if (heavy) for (let i = 0, m = Math.round(RR(2, 4) * k); i < m; i++) stampSplat(e.pos.x + e.dx * RR(0.3, 1.8) + RR(-0.3, 0.3), e.pos.z + e.dz * RR(0.3, 1.8) + RR(-0.3, 0.3), RR(0.18, 0.4) * (0.7 + fr), Math.atan2(e.dz, e.dx), RR(1.4, 2.2), 0.9);
    f.bleed = Math.max(f.bleed || 0, fr);
    const px = panOf(e.pos.x);
    sfx('slashWet', { pan: px, gain: clamp(0.5 + fr * 2, 0.5, 1) });
    if (heavy) sfx('crunch', { pan: px, gain: clamp(0.5 + fr * 1.5, 0.5, 1), pitch: RR(0.9, 1.15) });
    if (e.crit || fr > 0.2) sfx('spurt', { pan: px, gain: 0.7 });
    if (feel) { if (e.crit) { feel.hitStop(105); feel.addTrauma(0.12); } else if (fr > 0.18) feel.hitStop(80); }
    if (e.crit || fr > 0.2) G.pulse((e.mine ? 0.55 : 0.32) + Math.min(0.25, fr));
    // rare non-lethal heavy crit takes the off-hand forearm off a badly hurt fighter
    if (G.full && e.crit && !e.lethal && e.hpFrac < 0.45 && R() < 0.1) { const sd = R() < 0.62 ? 'R' : 'L', sv = f.rig.severed; if (!sv['forearm' + sd] && !sv['arm' + sd]) G.sever(id, 'forearm' + sd, e.dx, e.dz, 1); } // mostly the weapon hand
    if (G.full && !e.blocked && (e.crit ? R() < 0.5 : fr > 0.16 && R() < 0.28)) popArmor(f, e, fr);
  };

  /** status bleed tick (arena 'bleed' event) */
  G.onBleed = (id, dmg) => {
    if (!G.on) return; const f = fighterOf(id); if (!f || f.down) return; jointPos(f, R() < 0.5 ? 'chest' : (R() < 0.5 ? 'elbowL' : 'kneeR'), _p);
    const n = Math.round((5 + Math.min(10, dmg)) * K()); fan(_p, f.dir.x || RR(-1, 1), f.dir.z || RR(-1, 1), n, { speed: 2.6, cone: 1.4, elMin: 0.4, elMax: 1.3, size: 0.8 });
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
    addJet({ obj: jo, pos: fr.pos, dir: fr.axis.clone(), speed: head ? 8.2 : 6.2, rate: head ? 190 : 130, life: head ? 4.8 : 3.4, period: head ? 0.66 : 0.58, duty: 0.6, cone: head ? 0.13 : 0.1, size: head ? 1.25 : 1.05, elev: head ? 0.05 : 0.25 });
    addJet({ obj: jo, pos: fr.pos, dir: fr.axis.clone(), speed: 4.2, rate: 80, life: 2.0, period: 0.4, duty: 0.7, cone: 0.5, size: 0.9, elev: 0.35, delay: 0.1 });
    // splash burst at the cut
    fan(fr.pos, fr.axis.x, fr.axis.z, Math.round(46 * K()), { speed: 8, cone: 1.2, elMin: 0.0, elMax: 1.35, size: 1.3 });
    for (let i = 0, m = Math.round(8 * (G.tier === 'low' ? 0.6 : 1)); i < m; i++) fx.addNormalParticle({ x: fr.pos.x + RR(-0.08, 0.08), y: fr.pos.y + RR(-0.08, 0.1), z: fr.pos.z + RR(-0.08, 0.08), vx: RR(-1.5, 1.5) + fr.axis.x * 2, vy: RR(0.2, 1.8), vz: RR(-1.5, 1.5) + fr.axis.z * 2, life: RR(0.4, 0.75), s0: 0.22, s1: RR(0.9, 1.5), cell: CELL_PUFF, rot: R() * TAU, c0: { r: 0.5, g: 0.02, b: 0.03 }, c1: { r: 0.2, g: 0.01, b: 0.015 }, a: 0.55, drag: 2.8, fp: 1.2, att: 0.05 });
    rig.addBlood(head ? 0.3 : 0.2, 1);
    // chunks off the cut
    for (let i = 0, m = Math.round((head ? 5 : 3) * K()); i < m; i++) chunk(fr.pos, fr.axis.x * 2 + dx * 2, fr.axis.z * 2 + dz * 2);
    addPool(fr.pos.x + dx * 0.2, fr.pos.z + dz * 0.2, head ? 1.25 : 1.0, 0.2);
    // audio + feel: bone snap, wet rip, hiss, crowd gasp + roar
    const px = panOf(fr.pos.x); sfx('boneSnap', { pan: px }); sfx('slashWet', { pan: px, gain: 1 }); setTimeout(() => sfx('spurt', { pan: px, gain: 1 }), 120); sfx('crowdGore', { gain: 0.9 });
    if (feel) { feel.hitStop(150); feel.addTrauma(0.38); try { feel.flash(0.7, 0, 0.02, 0.16, 6); } catch (e) { /* ignore */ } }
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

  function chunk(pos, bx, bz) {
    const a = R() * TAU, s = RR(2, 7), r = R(), col = r < 0.5 ? '#6e0d12' : r < 0.8 ? '#b0383a' : '#d8cfc0', sz = RR(0.035, 0.1);
    spawnProp(2, { x: pos.x, y: Math.max(0.1, pos.y), z: pos.z, vx: Math.cos(a) * s + bx * 0.3, vy: RR(2.5, 7), vz: Math.sin(a) * s + bz * 0.3, q: new Q().setFromAxisAngle(_a.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), R() * TAU), wx: RR(-12, 12), wy: RR(-12, 12), wz: RR(-12, 12), sx: sz * RR(0.8, 1.4), sy: sz * RR(0.6, 1), sz: sz * RR(0.8, 1.3), color: col });
  }

  /** a fighter went down. ctx: {last, crit, frac (of the lethal blow), dx, dz, big (ultimate gibbing), mine} */
  G.onDown = (id, ctx = {}) => {
    if (!G.on) return null; const f = fighterOf(id); if (!f) return null; f.down = true; f.bleeding = 0;
    const dx = ctx.dx ?? f.dir.x, dz = ctx.dz ?? f.dir.z; f.rig.root.getWorldPosition(_p); const x = _p.x, z = _p.z;
    f.rig.addBlood(0.3, 1);
    // pool under the torso, spreading in the fall direction, plus a smear dragged back along the blow
    f.pool = addPool(x + dx * 0.45, z + dz * 0.45, 1.05 + Math.min(0.9, (ctx.frac || 0) * 2.5), 0.17); addPool(x + dx * 0.9 + RR(-0.2, 0.2), z + dz * 0.9 + RR(-0.2, 0.2), 0.6, 0.12, 0.5);
    stampSmear(x - dx * 0.1, z - dz * 0.1, x + dx * RR(1.0, 1.7), z + dz * RR(1.0, 1.7), 0.32, 0.9);
    // killing blow: a big pulsing fountain from the wound, falling with the body
    if (G.full || ctx.crit) addJet({ obj: f.rig.joints.chest, pos: chestPos(f, _a, 1.3), dir: _d.set(dx * 0.6, 1, dz * 0.6).normalize().clone(), speed: 6.8, rate: 120, life: 3.4, period: 0.62, duty: 0.58, cone: 0.16, size: 1.2 });
    fan(chestPos(f, _a, 1.2), dx, dz, Math.round(40 * K()), { speed: 8.5, cone: 0.7, elMin: 0.1, elMax: 1.1, size: 1.25 });
    sfx('splat', { pan: panOf(x), gain: 0.9 }); G.pulse(0.7);
    let part = pickPart(f, ctx), took = false;
    if (part && G.sever(id, part, dx, dz, ctx.big ? 1.3 : 1)) took = true;
    if (ctx.big && G.full) { const ex = ['armL', 'forearmR', 'shinL', 'shinR'].find((p) => !f.rig.severed[p] && p !== part); if (ex) G.sever(id, ex, dx + RR(-0.8, 0.8), dz + RR(-0.8, 0.8), 1.4); chestPos(f, _a, 1.1); for (let i = 0, m = Math.round(26 * K()); i < m; i++) chunk(_a, dx, dz); fan(_a, 0, 1, Math.round(70 * K()), { speed: 9, cone: Math.PI, elMin: 0.2, elMax: 1.4, size: 1.3 }); addPool(x, z, 1.9, 0.3); sfx('crowdGore', { gain: 1 }); }
    return took ? part : null;
  };

  /** replay seek: drop everything airborne (droplets, jets), grow the pools and let the flung props land, so skipped time leaves only what stays on the sand */
  G.settle = (sec = 3) => {
    if (!G.on) return; for (const d of drops.splice(0)) dfree.push(d); jets.length = 0;
    for (const p of pools) { p.delay = 0; if (p.r < p.rMax) p.r = p.rMax * 0.92; }
    if (gib) { for (let t = 0; t < sec; t += 0.1) stepProps(0.1); for (const d of drops.splice(0)) dfree.push(d); }
  };

  /** shader warm-up: the gib mesh is built and drawn once (a dead instance) so its program compiles before the first limb flies */
  G.warm = (on) => { if (on) { if (!gib) buildGib(); gib.count = 1; gib.visible = true; } else if (gib) { gib.count = chunkHi ? MAXLH + chunkHi : lhCur; gib.visible = props.length > 0; } };

  /** world points the kill camera should keep in frame (flung limb landing) */
  G.framePoints = (id) => { const s = G.lastSever; if (!G.on || !s || s.id !== id || G.time - s.t > 6) return null; return [[s.x, 0.15, s.z]]; };

  // ------------------------------------------------------------------ lifecycle
  G.refresh = () => { G.level = goreLevel(); G.on = G.level !== 'off'; G.full = G.level === 'full'; if (G.tier) G.tier = G.tier; return G.level; };
  G.setTier = (t) => { G.tier = t; };
  G.reset = (seed = 1) => {
    G.refresh(); rs = mulberry((seed >>> 0) || 1); G.time = 0; G.counts.splats = 0; G.cover = 0; covGrid.fill(0); covT = dryT = fadeT = 0; dryN = 0; for (const d of drops.splice(0)) dfree.push(d); jets.length = 0; pools.length = 0; drySq.length = 0; props = []; chunkCur = MAXLH; lhCur = 0; chunkHi = 0; G.lastSever = null; vig = 0;
    if (gib) { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAXP; i++) gib.setMatrixAt(i, z); gib.instanceMatrix.needsUpdate = true; gib.count = 0; gib.visible = false; }
    for (const f of G.fighters.values()) { try { f.rig.onEvent = f.prevOnEvent; } catch (e) { /* ignore */ } } G.fighters.clear();
  };
  G.dispose = () => { G.reset(); if (vigEl && vigEl.parentNode) vigEl.parentNode.removeChild(vigEl); if (gib) { scene && scene.remove(gib); gib.geometry.dispose(); gib.material.dispose(); gib = null; } };

  // ------------------------------------------------------------------ per frame: simulation + immediate-mode instances (called from fx.update, after the pooled step)
  fx.hooks.push((dt, norL) => {
    if (!G.on) { if (drops.length) for (const d of drops.splice(0)) dfree.push(d); return; }
    G.time += dt; splatBudget = G.tier === 'low' ? 36 : 70; covT += dt; dryT += dt; fadeT += dt;
    if (covT > 1.5) { covT = 0; measureCover(); } if (dryT > 5) { dryT = 0; dryAll(); } if (fadeT > 0.45) { fadeT = 0; if (G.time > 6) clearUnderFeet(); }
    stepJets(dt); stepPools(dt); stepProps(dt);
    // PERF: streaks are written straight into the fx layer's typed arrays (a call with ~12 double arguments boxes every one of them: that was ~14 KB per frame)
    const nA = norL.A, nB = norL.B, nC = norL.C, nD = norL.D, nMax = norL.max;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.age += dt; d.vy -= GRAV * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y <= 0.03 && d.vy < 0 || d.age > d.life || d.x > 30 || d.x < -30 || d.z > 30 || d.z < -30) { if (d.y <= 0.05) land(d); drops[i] = drops[drops.length - 1]; drops.pop(); dfree.push(d); continue; }
      if (norL.n >= nMax) continue;
      const vx = d.vx, vy = d.vy, vz = d.vz, sp2 = vx * vx + vy * vy + vz * vz, sp = sp2 > 0 ? Math.sqrt(sp2) : 1, o4 = norL.n++ * 4;
      let k = d.k * 0.7 + d.age * 0.18; k = k < 0 ? 0 : k > 1 ? 1 : k;
      nC[o4] = (BRIGHT.r + (DARK.r - BRIGHT.r) * k) * 1.25; nC[o4 + 1] = (BRIGHT.g + (DARK.g - BRIGHT.g) * k) * 1.25; nC[o4 + 2] = (BRIGHT.b + (DARK.b - BRIGHT.b) * k) * 1.25; nC[o4 + 3] = 0.96;
      nA[o4] = d.x; nA[o4 + 1] = d.y; nA[o4 + 2] = d.z; nD[o4 + 1] = 0; nD[o4 + 2] = 0; nD[o4 + 3] = 0;
      if (sp < 2.4) { nA[o4 + 3] = d.s * 1.7; nB[o4] = 0; nB[o4 + 1] = 1; nB[o4 + 2] = 0; nB[o4 + 3] = 0; nD[o4] = CELL_DISC; }   // hanging / dripping: round blob
      else { let len = sp * 0.05; const lo = d.s * 1.3; len = len < lo ? lo : len > 0.85 ? 0.85 : len; nA[o4 + 3] = d.s * 2.6; nB[o4] = vx / sp; nB[o4 + 1] = vy / sp; nB[o4 + 2] = vz / sp; nB[o4 + 3] = Math.max(len * 1.15, 1e-3); nD[o4] = CELL_STREAK; }
    }
    G.counts.drops = drops.length; G.counts.jets = jets.length; G.counts.props = props.length; G.counts.pools = pools.length;
  });
  /** real-time part of the frame (vignette) */
  let vigQ = -1;   // PERF: the vignette opacity string is rebuilt only when the 1/1000 step changes (it is '0' almost always)
  G.postFrame = (realDt) => { if (!vigEl) return; vig = vig - realDt * 1.7; if (vig < 0) vig = 0; const v = G.on ? vig : 0, q = v < 0.01 ? 0 : Math.round(v * 1000) + 1; if (q !== vigQ) { vigQ = q; vigEl.style.opacity = q ? ((q - 1) / 1000).toFixed(3) : '0'; } };
  G.debug = () => props.map((p) => ({ t: p.type, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), rest: p.rest }));
  G.stats = () => ({ level: G.level, drops: drops.length, jets: jets.length, props: props.length, pools: pools.length, splats: G.counts.splats, gibVisible: !!(gib && gib.visible) });
  G.refresh();
  return G;
}
