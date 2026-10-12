// Ludus Maximus 3D: gore system (adult arena violence, Spartacus style). Everything procedural, pooled, and cosmetic only:
// it reads sim events through fightview.js and NEVER touches the sim RNG (own seeded RNG, so a replay renders the same gore).
//   blood droplets + arterial jets (arc under gravity, drawn as stretched streaks in fx's normal-blend particle layer, 0 extra draw calls)
//   sand stains (fx decal canvas): splats, growing pools, drag smears, bloody footprints, a glossy-then-dried pass
//   bodies: per-rig blood soak + persistent gashes + stump paint (shader overlay in rig.js, 0 extra draw calls)
//   dismemberment: head / forearm / arm / shin / leg collapse on the rig, a tumbling prop leaves a blood trail (ONE instanced mesh = 1 draw call, only while props exist)
//   audio hooks (audio.js sfx), hit-stop / shake / red vignette on gore moments.
// Levels: off (nothing), low (blood only, fewer droplets, smaller pools, no dismemberment), full. Reduced motion forces off.
import * as THREE from 'three';

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
  function stampSplat(x, z, size, ang, stretch = 1, a = 1) {
    if (splatBudget <= 0 && size < 0.3) return; if (G.counts.splats > 650 && size < 0.3 && R() < 0.7) return; /* keeps long fights from turning the whole sand red: silhouettes stay readable */ splatBudget--; G.counts.splats++;
    const [px, pz] = DD.toPx(x, z), s = size * DD.k * (128 / 58);
    dctx.save(); dctx.translate(px, pz); dctx.rotate(ang); dctx.scale(stretch, 1); dctx.globalAlpha = a; dctx.drawImage(SPR[(R() * SPR.length) | 0], -s / 2, -s / 2, s, s); dctx.restore();
    fx.markDecals();
  }
  function stampSmear(x0, z0, x1, z1, w, a = 0.8) {
    const [a0, b0] = DD.toPx(x0, z0), [a1, b1] = DD.toPx(x1, z1); dctx.save(); dctx.lineCap = 'round';
    dctx.strokeStyle = `rgba(86,7,9,${a * 0.85})`; dctx.lineWidth = w * DD.k; dctx.beginPath(); dctx.moveTo(a0, b0); dctx.lineTo(a1, b1); dctx.stroke();
    dctx.strokeStyle = `rgba(150,14,16,${a * 0.5})`; dctx.lineWidth = w * DD.k * 0.45; dctx.stroke(); dctx.restore(); fx.markDecals();
  }
  function stampFoot(x, z, heading, side, a) {
    const [px, pz] = DD.toPx(x + Math.cos(heading + Math.PI / 2) * 0.09 * side, z + Math.sin(heading + Math.PI / 2) * 0.09 * side), L = 0.3 * DD.k, W = 0.11 * DD.k;
    dctx.save(); dctx.translate(px, pz); dctx.rotate(heading); dctx.fillStyle = `rgba(104,9,11,${a})`;
    dctx.beginPath(); dctx.ellipse(-L * 0.12, 0, L * 0.3, W * 0.62, 0, 0, TAU); dctx.fill(); dctx.beginPath(); dctx.ellipse(L * 0.2, 0, L * 0.34, W * 0.7, 0, 0, TAU); dctx.fill(); dctx.restore(); fx.markDecals();
  }
  function stampPool(p) {
    const [px, pz] = DD.toPx(p.x, p.z), r = p.r * DD.k, m = p.pts.length; dctx.save(); dctx.translate(px, pz); dctx.rotate(p.rot += 0.35);
    dctx.beginPath(); for (let i = 0; i < m; i++) { const a0 = i / m * TAU, a1 = (i + 1) / m * TAU, r0 = r * p.pts[i], r1 = r * p.pts[(i + 1) % m]; const mx = (Math.cos(a0) * r0 + Math.cos(a1) * r1) / 2, my = (Math.sin(a0) * r0 + Math.sin(a1) * r1) / 2; if (i === 0) dctx.moveTo(mx, my); else dctx.quadraticCurveTo(Math.cos(a0) * r0, Math.sin(a0) * r0, mx, my); }
    dctx.closePath(); const gr = dctx.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(96,8,10,0.34)'); gr.addColorStop(0.7, 'rgba(112,9,12,0.3)'); gr.addColorStop(1, 'rgba(120,12,14,0.16)'); dctx.fillStyle = gr; dctx.fill(); dctx.restore(); fx.markDecals();
  }
  function stampGloss(p) { // fresh wet highlights, covered by the dry pass
    const [px, pz] = DD.toPx(p.x, p.z), r = p.r * DD.k; dctx.save(); dctx.translate(px, pz);
    dctx.fillStyle = 'rgba(206,44,48,0.38)'; dctx.beginPath(); dctx.ellipse(-r * 0.2, -r * 0.24, r * 0.34, r * 0.13, -0.5, 0, TAU); dctx.fill();
    dctx.fillStyle = 'rgba(255,215,210,0.34)'; dctx.beginPath(); dctx.ellipse(-r * 0.27, -r * 0.3, r * 0.1, r * 0.04, -0.5, 0, TAU); dctx.fill(); dctx.restore();
  }
  function dryPass(d) {
    const [px, pz] = DD.toPx(d.x, d.z), r = Math.max(2, d.r * DD.k * 1.25); dctx.save(); dctx.globalCompositeOperation = 'source-atop';
    const gr = dctx.createRadialGradient(px, pz, 0, px, pz, r); gr.addColorStop(0, 'rgba(46,6,6,0.34)'); gr.addColorStop(0.75, 'rgba(46,6,6,0.2)'); gr.addColorStop(1, 'rgba(46,6,6,0)'); dctx.fillStyle = gr; dctx.beginPath(); dctx.arc(px, pz, r, 0, TAU); dctx.fill(); dctx.restore(); fx.markDecals();
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
    const sp = Math.hypot(d.vx, d.vz), size = clamp(d.s * RR(3.4, 5.2), 0.1, 0.5), st = 1 + Math.min(1.7, sp * 0.16);
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
    rMax *= POOLK(); if (pools.length >= 26) { const i = pools.findIndex((p) => p.done); pools.splice(i >= 0 ? i : 0, 1); }
    const pts = []; for (let i = 0; i < 12; i++) pts.push(0.74 + R() * 0.5); const p = { x, z, r: 0.07, rMax, rate, acc: 1, pts, rot: R() * TAU, done: false, delay }; pools.push(p); return p;
  }
  function stepPools(dt) {
    for (const p of pools) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      if (p.r < p.rMax) { p.r = Math.min(p.rMax, p.r + p.rate * dt * (1.15 - p.r / p.rMax * 0.5)); p.acc += dt; if (p.acc > 0.12) { p.acc = 0; stampPool(p); } }
      else if (!p.done) { p.done = true; stampPool(p); stampGloss(p); drySq.push({ t: G.time + 4.5, x: p.x, z: p.z, r: p.rMax * 1.05 }); }
    }
    for (let i = drySq.length - 1; i >= 0; i--) if (G.time >= drySq[i].t) { dryPass(drySq[i]); drySq[i] = drySq[drySq.length - 1]; drySq.pop(); }
  }
  const inPool = (x, z) => { for (const p of pools) if (p.delay <= 0 && Math.hypot(x - p.x, z - p.z) < p.r * 0.8) return true; return false; };

  // ------------------------------------------------------------------ gib props: ONE InstancedMesh (limb / head / chunk selected per instance in the vertex shader)
  const MAXP = 56, MAXLH = 12; let gib = null, gibType = null, props = [], chunkCur = MAXLH, lhCur = 0, chunkHi = 0;
  function buildGib() {
    const parts = [];
    { // 0: limb hanging down from y=0 (cut face) to y=-1
      const prof = [[0, -1.03], [0.5, -1.0], [0.72, -0.9], [0.86, -0.5], [1, -0.06], [0.92, 0], [0.3, 0], [0, 0]].map((p) => new THREE.Vector2(p[0], p[1])), g = new THREE.LatheGeometry(prof, 6), P = g.attributes.position, C = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) { const y = P.getY(i), r = Math.hypot(P.getX(i), P.getZ(i)); let c;
        if (y > -0.001) c = r < 0.31 ? [1.3, 1.2, 1.0] : [1, 0.13, 0.11]; else { const k = 1 - sstep(-0.55, -0.04, y); c = [lerp(1, 0.78, k * 0.9), lerp(1, 0.18, k * 0.9), lerp(1, 0.16, k * 0.9)]; }
        C.set(c, i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(C, 3)); parts.push(g);
    }
    { // 1: head on a neck stub: cut face at y=0, skull above
      const neck = new THREE.CylinderGeometry(0.5, 0.58, 0.9, 6, 1, false).translate(0, 0.45, 0), sk = new THREE.SphereGeometry(1, 16, 11).scale(0.93, 1.1, 1.0).translate(0, 1.55, 0);
      const col = (g, fn) => { const P = g.attributes.position, C = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) C.set(fn(P.getX(i), P.getY(i), P.getZ(i)), i * 3); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); return g; };
      col(neck, (x, y, z) => { const k = 1 - sstep(0, 0.5, y); return y < 0.02 ? (Math.hypot(x, z) < 0.18 ? [1.3, 1.2, 1] : [1, 0.12, 0.1]) : [lerp(1, 0.75, k), lerp(1, 0.2, k), lerp(1, 0.18, k)]; });
      col(sk, (x, y, z) => { const hair = Math.max(sstep(0.5, 0.7, y - 1.55), sstep(-0.3, -0.6, z)) , bl = sstep(0.3, 0.7, x) * sstep(0.1, 0.6, z) * sstep(1.9, 1.3, y);
        const eye = Math.exp(-(((Math.abs(x) - 0.34) / 0.12) ** 2 + ((y - 1.7) / 0.07) ** 2)) * sstep(0.55, 0.8, z), mouth = Math.exp(-((x / 0.2) ** 2 + ((y - 1.18) / 0.045) ** 2)) * sstep(0.55, 0.8, z), brow = Math.exp(-(((Math.abs(x) - 0.34) / 0.18) ** 2 + ((y - 1.8) / 0.05) ** 2)) * sstep(0.5, 0.8, z);
        const dk = Math.min(1, eye * 0.9 + mouth * 0.75 + brow * 0.45); const k = 1 - dk * 0.85;
        return [lerp(lerp(1, 0.34, hair), 0.78, bl * 0.8) * k, lerp(lerp(1, 0.26, hair), 0.14, bl * 0.8) * k, lerp(lerp(1, 0.2, hair), 0.12, bl * 0.8) * k]; });
      parts.push(mergeGeos([neck, sk]));
    }
    { const g = new THREE.IcosahedronGeometry(1, 0), C = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); parts.push(g); }
    const geo = mergeGeos(parts), part = new Float32Array(geo.attributes.position.count); let off = 0;
    parts.forEach((p, i) => { const n = p.attributes.position.count; part.fill(i, off, off + n); off += n; });
    geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    const typeArr = new Float32Array(MAXP); gibType = new THREE.InstancedBufferAttribute(typeArr, 1); geo.setAttribute('iType', gibType);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart; attribute float iType;').replace('#include <project_vertex>', '#include <project_vertex>\n if (abs(aPart - iType) > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
    };
    mat.customProgramCacheKey = () => 'lm-gib';
    gib = new THREE.InstancedMesh(geo, mat, MAXP); gib.name = 'gore_gibs'; gib.frustumCulled = false; gib.castShadow = false; gib.receiveShadow = false; gib.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gib.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3).fill(1), 3); gib.count = 0; gib.visible = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAXP; i++) gib.setMatrixAt(i, zero);
    scene && scene.add(gib);
  }
  function mergeGeos(list) {
    let nv = 0, ni = 0; list.forEach((g) => { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni); let vo = 0, io = 0;
    for (const g of list) { const n = g.attributes.position.count; pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); col.set(g.attributes.color.array, vo * 3);
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; else for (let i = 0; i < n; i++) idx[io++] = vo + i; vo += n; }
    const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3)); m.setIndex(new THREE.BufferAttribute(idx, 1)); return m;
  }
  const _m4 = new THREE.Matrix4(), _s = new V3(), _col = new THREE.Color();
  function spawnProp(type, o) {
    if (!gib) buildGib(); let i;
    if (type === 2) { i = chunkCur; chunkCur = chunkCur + 1 >= MAXP ? MAXLH : chunkCur + 1; chunkHi = Math.max(chunkHi, i - MAXLH + 1); } else { if (lhCur >= MAXLH) return null; i = lhCur++; }
    const rm = props.findIndex((p) => p.i === i); if (rm >= 0) props.splice(rm, 1);
    const p = { type, i, x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz, q: o.q.clone(), wx: o.wx, wy: o.wy, wz: o.wz, sx: o.sx, sy: o.sy, sz: o.sz, len: o.len || 0, rad: o.rad || o.sx, rest: false, settle: 0, trail: 0, age: 0, drip: 0, bounces: 0, smx: o.x, smz: o.z, leak: o.leak ?? 0 };
    props.push(p); gibType.array[i] = type; gibType.needsUpdate = true; _col.set(o.color); gib.setColorAt(i, _col); gib.instanceColor.needsUpdate = true;
    gib.count = chunkHi ? MAXLH + chunkHi : lhCur; gib.visible = true; writeProp(p); return p;
  }
  function writeProp(p) { _s.set(p.sx, p.sy, p.sz); _m4.compose(_a.set(p.x, p.y, p.z), p.q, _s); gib.setMatrixAt(p.i, _m4); }
  const _lo = new V3(), _hi = new V3(), _ax = new V3(), _dq = new Q();
  function lowest(p) { // lowest world y of the prop shape
    if (p.type === 0) { _ax.set(0, -p.len, 0).applyQuaternion(p.q); return Math.min(p.y, p.y + _ax.y) - p.rad * 0.8; }
    if (p.type === 1) { _ax.set(0, p.sy * 1.55, 0).applyQuaternion(p.q); return p.y + _ax.y - p.sy * 1.05; }
    return p.y - p.sy * 0.8;
  }
  function stepProps(dt) {
    let any = false;
    for (const p of props) {
      if (p.rest) { if (p.settle > 0) { p.settle -= dt; settleOrient(p, dt); writeProp(p); any = true; } continue; }
      any = true; p.age += dt;
      p.vy -= 17 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const w = Math.hypot(p.wx, p.wy, p.wz); if (w > 1e-3) { _ax.set(p.wx / w, p.wy / w, p.wz / w); _dq.setFromAxisAngle(_ax, w * dt); p.q.premultiply(_dq); }
      // blood trail: airborne arcs (first 1.6 s), cheap
      if (p.type !== 2 && p.age < 1.6) { p.trail += dt; while (p.trail > 0.04) { p.trail -= 0.04; const n = G.full ? 1 + (K() > 0.6 ? 1 : 0) : 1; for (let k = 0; k < n; k++) drop(p.x + RR(-0.03, 0.03), p.y, p.z + RR(-0.03, 0.03), p.vx * 0.3 + RR(-0.8, 0.8), p.vy * 0.2 + RR(0, 1.2), p.vz * 0.3 + RR(-0.8, 0.8), RR(0.04, 0.075), R()); } }
      const low = lowest(p), gy = 0.012;
      if (low < gy) {
        p.y += gy - low; const impact = -p.vy; p.bounces++;
        if (impact > 1.6) {
          stampSplat(p.x, p.z, p.type === 2 ? 0.2 + p.sy : 0.4, R() * TAU, 1, 0.95);
          const nd = Math.round((p.type === 2 ? 3 : 7) * K()); for (let k = 0; k < nd; k++) { const a = R() * TAU, s2 = RR(1.5, 4.2); drop(p.x, 0.05, p.z, Math.cos(a) * s2, RR(1.5, 4), Math.sin(a) * s2, RR(0.045, 0.09), R(), true); }
          if (p.type !== 2) sfx('gibThud', { pan: panOf(p.x), gain: clamp(impact / 9, 0.3, 1), pitch: p.type === 1 ? 1.1 : 0.9 });
        }
        if (p.vy < 0) p.vy = impact > 2.2 ? impact * 0.26 : 0;
        const fr = Math.exp(-(impact > 1 ? 4 : 7) * dt); p.vx *= impact > 1.6 ? 0.7 : fr; p.vz *= impact > 1.6 ? 0.7 : fr; p.wx *= 0.6; p.wy *= 0.7; p.wz *= 0.6;
        // sliding smear trail
        const sp = Math.hypot(p.vx, p.vz); if (sp > 0.7 && p.type !== 2 && Math.hypot(p.x - p.smx, p.z - p.smz) > 0.16) { stampSmear(p.smx, p.smz, p.x, p.z, p.rad * 1.6 + 0.05, 0.85); p.smx = p.x; p.smz = p.z; }
        if (sp < 0.22 && Math.abs(p.vy) < 0.5 && Math.hypot(p.wx, p.wy, p.wz) < 2.2) { p.rest = true; p.settle = 0.4; p.vx = p.vy = p.vz = 0; if (p.type !== 2) { addPool(p.x, p.z, p.type === 1 ? 0.62 : 0.5, 0.2); stampSmear(p.smx, p.smz, p.x, p.z, p.rad * 1.6 + 0.05, 0.85); } else stampSplat(p.x, p.z, 0.22 + p.sy, R() * TAU, 1, 0.9); }
      }
      writeProp(p);
    }
    if (any) { gib.instanceMatrix.needsUpdate = true; }
  }
  function settleOrient(p, dt) { // roll the limb flat on the sand, keep it lying with its cut face toward the body
    if (p.type !== 0) { p.y = Math.max(p.y, p.type === 1 ? p.sy * 1.1 : p.sy * 0.8); return; }
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
    if (G.full && e.crit && !e.lethal && e.hpFrac < 0.45 && R() < 0.07 && !f.rig.severed.forearmL && !f.rig.severed.armL) G.sever(id, 'forearmL', e.dx, e.dz, 1);
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
    const skin = rig.palette.skin || '#c98d62', sp = 3.2 + 3.2 * power * R(), len = Math.hypot(dx, dz) || 1;
    const vx = dx / len * sp + RR(-1.2, 1.2), vz = dz / len * sp + RR(-1.2, 1.2), vy = (head ? RR(4.5, 6.5) : RR(3.2, 5.6)) * (0.8 + 0.3 * power);
    let prop;
    if (head) prop = spawnProp(1, { x: fr.pos.x, y: fr.pos.y, z: fr.pos.z, vx, vy, vz, q, wx: RR(-9, 9), wy: RR(-6, 6), wz: RR(-9, 9), sx: 0.13 * sc, sy: 0.13 * sc, sz: 0.13 * sc, rad: 0.125 * sc, color: skin });
    else prop = spawnProp(0, { x: fr.pos.x, y: fr.pos.y, z: fr.pos.z, vx, vy, vz, q, wx: RR(-10, 10), wy: RR(-8, 8), wz: RR(-10, 10), sx: fr.r * sc, sy: fr.len * sc, sz: fr.r * sc, len: fr.len * sc, rad: fr.r * sc, color: skin });
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

  /** world points the kill camera should keep in frame (flung limb landing) */
  G.framePoints = (id) => { const s = G.lastSever; if (!G.on || !s || s.id !== id || G.time - s.t > 6) return null; return [[s.x, 0.15, s.z]]; };

  // ------------------------------------------------------------------ lifecycle
  G.refresh = () => { G.level = goreLevel(); G.on = G.level !== 'off'; G.full = G.level === 'full'; if (G.tier) G.tier = G.tier; return G.level; };
  G.setTier = (t) => { G.tier = t; };
  G.reset = (seed = 1) => {
    G.refresh(); rs = mulberry((seed >>> 0) || 1); G.time = 0; G.counts.splats = 0; for (const d of drops.splice(0)) dfree.push(d); jets.length = 0; pools.length = 0; drySq.length = 0; props = []; chunkCur = MAXLH; lhCur = 0; chunkHi = 0; G.lastSever = null; vig = 0;
    if (gib) { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAXP; i++) gib.setMatrixAt(i, z); gib.instanceMatrix.needsUpdate = true; gib.count = 0; gib.visible = false; }
    for (const f of G.fighters.values()) { try { f.rig.onEvent = f.prevOnEvent; } catch (e) { /* ignore */ } } G.fighters.clear();
  };
  G.dispose = () => { G.reset(); if (vigEl && vigEl.parentNode) vigEl.parentNode.removeChild(vigEl); if (gib) { scene && scene.remove(gib); gib.geometry.dispose(); gib.material.dispose(); gib = null; } };

  // ------------------------------------------------------------------ per frame: simulation + immediate-mode instances (called from fx.update, after the pooled step)
  const cA = { r: 0, g: 0, b: 0 };
  fx.hooks.push((dt, norL) => {
    if (!G.on) { if (drops.length) for (const d of drops.splice(0)) dfree.push(d); return; }
    G.time += dt; splatBudget = G.tier === 'low' ? 36 : 70;
    stepJets(dt); stepPools(dt); stepProps(dt);
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.age += dt; d.vy -= GRAV * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y <= 0.03 && d.vy < 0 || d.age > d.life || Math.abs(d.x) > 30 || Math.abs(d.z) > 30) { if (d.y <= 0.05) land(d); drops[i] = drops[drops.length - 1]; drops.pop(); dfree.push(d); continue; }
      const sp = Math.hypot(d.vx, d.vy, d.vz) || 1, len = clamp(sp * 0.05, d.s * 1.3, 0.85), k = clamp(d.k * 0.7 + d.age * 0.18, 0, 1);
      cA.r = lerp(BRIGHT.r, DARK.r, k); cA.g = lerp(BRIGHT.g, DARK.g, k); cA.b = lerp(BRIGHT.b, DARK.b, k);
      if (sp < 2.4) norL.put(d.x, d.y, d.z, d.s * 1.7, cA, 0.96, CELL_DISC, 0, 1.25); // hanging / dripping: round blob
      else norL.putS(d.x, d.y, d.z, d.s * 2.6, cA, 0.96, CELL_STREAK, d.vx / sp, d.vy / sp, d.vz / sp, len * 1.15, 1.25);
    }
    G.counts.drops = drops.length; G.counts.jets = jets.length; G.counts.props = props.length; G.counts.pools = pools.length;
  });
  /** real-time part of the frame (vignette) */
  G.postFrame = (realDt) => { if (!vigEl) return; vig = Math.max(0, vig - realDt * 1.7); const v = G.on ? vig : 0; vigEl.style.opacity = v < 0.01 ? '0' : v.toFixed(3); };
  G.debug = () => props.map((p) => ({ t: p.type, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), rest: p.rest }));
  G.stats = () => ({ level: G.level, drops: drops.length, jets: jets.length, props: props.length, pools: pools.length, splats: G.counts.splats, gibVisible: !!(gib && gib.visible) });
  G.refresh();
  return G;
}
