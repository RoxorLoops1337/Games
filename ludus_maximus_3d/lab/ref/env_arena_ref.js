// env_arena_ref.js : elliptical Roman colosseum bowl.
//   createArena({ crowd:3700, density:1, decalRes:2048, seed }) -> arena
//   arena.group  add to scene          arena.update(t, dt)  per frame
//   arena.setHype(0..1)  cheer jump + raised arms    arena.setWave(0..1)  stadium wave around the bowl
//   arena.setGate(0..1, side 0|1|undefined)  portcullis open amount      arena.setNight(0..1)  arches/torch glow
//   arena.stampFootprint(x,z,heading,scale,side)  arena.scuff(x0,z0,x1,z1,width)  sand decal canvas painting
//   arena.setDensity(0..1) crowd LOD        arena.DIM  dimensions        arena.shadowHint {center, radius}
// Draw calls: ~28 (+ shadow pass). Crowd = 1 InstancedMesh animated in the vertex shader (zero CPU per frame).
import * as THREE from 'three';
import { mergeGeos, prepGeo, patchMaterial, createFlames, createBlobShadows } from './fx_ref.js';
import { makeSandTexture, makeStoneTexture, makeRadialTexture } from './tex_ref.js';

const TAU = Math.PI * 2;
export const DIM = {
  SA: 22, SB: 14.5,              // sand semi-axes (x long, z short)
  PH: 3.0,                       // podium wall height
  FD: 17.5, FH: 18.0,            // facade offset from sand edge + height
  TIER: 4.7,                     // facade tier height
};
const { SA, SB, PH, FD, FH, TIER } = DIM;
const P = (d, th) => [Math.cos(th) * (SA + d), Math.sin(th) * (SB + d)];
const NRM = (d, th) => { const a = SA + d, b = SB + d; const x = Math.cos(th) / a, z = Math.sin(th) / b, l = Math.hypot(x, z); return [x / l, z / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const C = (h) => new THREE.Color(h);

/** arc-length lookup for the ring at offset d: returns thetas evenly spaced by distance */
function arcThetas(d, count, phase = 0) {
  const n = 1440, cum = new Float32Array(n + 1);
  let prev = P(d, 0);
  for (let i = 1; i <= n; i++) { const q = P(d, (i / n) * TAU); cum[i] = cum[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  const L = cum[n], out = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const s = ((k + phase) / count % 1) * L; let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    out[k] = ((lo + (s - cum[lo]) / (cum[hi] - cum[lo] || 1)) / n) * TAU;
  }
  return { thetas: out, length: L };
}

/**
 * Sweep a profile segment around the ellipse. seg: {a:[d,y], b:[d,y], ca, cb (grey or [r,g,b]), face:'out'|'in'|'up'|'down', v0}
 * Analytic smooth normals, per-quad vertices (so any quad can be skipped/tinted), uv in 1/uvM meter units.
 */
function sweep(segs, N, { skip, tint, uvM = 6 } = {}) {
  const pos = [], nor = [], uv = [], col = [];
  for (const s of segs) {
    const [da, ya] = s.a, [db, yb] = s.b;
    const ca = Array.isArray(s.ca) ? s.ca : [s.ca, s.ca, s.ca], cb = Array.isArray(s.cb) ? s.cb : [s.cb, s.cb, s.cb];
    const segLen = Math.hypot(db - da, yb - ya);
    let arc = 0; let pp = P(da, 0);
    const arcs = [0];
    for (let j = 1; j <= N; j++) { const q = P(da, (j / N) * TAU); arc += Math.hypot(q[0] - pp[0], q[1] - pp[1]); pp = q; arcs.push(arc); }
    for (let j = 0; j < N; j++) {
      const t0 = (j / N) * TAU, t1 = ((j + 1) / N) * TAU;
      if (skip && skip(j, (t0 + t1) / 2, s)) continue;
      const m = tint ? tint(j, s) : 1;
      const v = [[da, ya, t0, 0, arcs[j]], [db, yb, t0, 1, arcs[j]], [da, ya, t1, 0, arcs[j + 1]], [db, yb, t1, 1, arcs[j + 1]]];
      const V = v.map(([d, y, th, e, ar]) => {
        const p = P(d, th); const n = NRM(d, th);
        let nn = s.face === 'out' ? [n[0], 0, n[1]] : s.face === 'in' ? [-n[0], 0, -n[1]] : s.face === 'up' ? [0, 1, 0] : [0, -1, 0];
        return { p: [p[0], y, p[1]], n: nn, uv: [ar / uvM, ((s.v0 || 0) + e * segLen) / uvM], c: (e ? cb : ca).map((x) => x * m) };
      });
      // orientation: want triangle normal along desired normal
      const e1 = [V[1].p[0] - V[0].p[0], V[1].p[1] - V[0].p[1], V[1].p[2] - V[0].p[2]];
      const e2 = [V[2].p[0] - V[0].p[0], V[2].p[1] - V[0].p[1], V[2].p[2] - V[0].p[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const dn = V[0].n; const flip = cr[0] * dn[0] + cr[1] * dn[1] + cr[2] * dn[2] < 0;
      const order = flip ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 2, 1, 3];
      // (0,1,2) vs (0,2,1): for the flipped case use (0,2,1) and (1,2,3) reversed => (1,2,3)->(1,3,2)? keep consistent:
      const tris = flip ? [[0, 2, 1], [1, 2, 3]] : [[0, 1, 2], [2, 1, 3]];
      // second triangle winding must match first; (2,1,3) is the consistent partner of (0,1,2); (1,2,3) of (0,2,1)
      for (const tri of tris) for (const k of tri) { const q = V[k]; pos.push(...q.p); nor.push(...q.n); uv.push(...q.uv); col.push(...q.c); }
      void order;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** place helper: matrix for an object at ring(d,theta) height y, +z facing inward (inward=true) or outward */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function ringMatrix(d, th, y, { inward = true, scale = 1, dOff = 0, yaw = 0 } = {}) {
  const dd = d + dOff, p = P(dd, th), n = NRM(d, th);
  const ang = Math.atan2(inward ? -n[0] : n[0], inward ? -n[1] : n[1]) + yaw;
  _q.setFromEuler(_e.set(0, ang, 0)); _s.set(typeof scale === 'number' ? scale : scale.x, typeof scale === 'number' ? scale : scale.y, typeof scale === 'number' ? scale : scale.z);
  _p.set(p[0], y, p[1]);
  return _m.compose(_p, _q, _s).clone();
}

function archShape(hw, hs, rise, hole = null) {
  const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, hs); s.absellipse(0, hs, hw, rise, 0, Math.PI, false); s.lineTo(-hw, 0);
  if (hole) s.holes.push(hole);
  return s;
}

function makeBannerAtlas() {
  const W = 192, H = 480, c = document.createElement('canvas'); c.width = W * 3; c.height = H; const x = c.getContext('2d');
  const defs = [['#5a1f5e', '#f2c14e', '#3a1040'], ['#a8482a', '#f0e2c0', '#6a2a18'], ['#2f5a4a', '#f2c14e', '#173528']];
  defs.forEach(([base, trim, dark], i) => {
    const ox = i * W; x.save(); x.beginPath(); x.moveTo(ox + 6, 0); x.lineTo(ox + W - 6, 0); x.lineTo(ox + W - 6, H - 70); x.lineTo(ox + W / 2, H - 26); x.lineTo(ox + 6, H - 70); x.closePath(); x.clip();
    const g = x.createLinearGradient(ox, 0, ox + W, 0); g.addColorStop(0, dark); g.addColorStop(0.25, base); g.addColorStop(0.75, base); g.addColorStop(1, dark);
    x.fillStyle = g; x.fillRect(ox, 0, W, H);
    x.strokeStyle = trim; x.lineWidth = 8; x.strokeRect(ox + 16, 12, W - 32, H - 70);
    x.lineWidth = 2; x.strokeRect(ox + 26, 22, W - 52, H - 90);
    // laurel wreath + crossed blades
    x.lineWidth = 6; x.beginPath(); x.arc(ox + W / 2, 170, 54, 0.6, Math.PI * 2 - 0.6 - Math.PI * 0.0); x.stroke();
    for (let k = 0; k < 9; k++) { const a = 0.9 + k * 0.55; x.beginPath(); x.ellipse(ox + W / 2 + Math.cos(a) * 54, 170 + Math.sin(a) * 54, 11, 5, a + 1.57, 0, TAU); x.fillStyle = trim; x.fill(); }
    x.lineWidth = 9; x.beginPath(); x.moveTo(ox + W / 2 - 34, 134); x.lineTo(ox + W / 2 + 34, 206); x.moveTo(ox + W / 2 + 34, 134); x.lineTo(ox + W / 2 - 34, 206); x.stroke();
    x.fillStyle = trim; x.fillRect(ox + 28, 290, W - 56, 8); x.fillRect(ox + 28, 308, W - 56, 4);
    for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(ox + 36 + k * 30, 330); x.lineTo(ox + 51 + k * 30, 380 + (k % 2) * 14); x.lineTo(ox + 66 + k * 30, 330); x.fill(); }
    x.restore();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function makeSailTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(0,0,0,${0.02 + (i % 2) * 0.03})`; x.fillRect(0, i * 21.3, 128, 10); }
  const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, 'rgba(60,30,20,0.55)'); g.addColorStop(0.06, 'rgba(60,30,20,0)'); g.addColorStop(0.94, 'rgba(60,30,20,0)'); g.addColorStop(1, 'rgba(60,30,20,0.55)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  x.fillStyle = 'rgba(242,193,78,0.9)'; x.fillRect(0, 244, 128, 12); x.fillStyle = 'rgba(90,31,94,0.55)'; x.fillRect(0, 232, 128, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function createArena({ crowd = 3700, density = 1, decalRes = 2048, seed = 7 } = {}) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const group = new THREE.Group(); group.name = 'arena';
  const U = { uTime: { value: 0 }, uHype: { value: 0 }, uWave: { value: 0 }, uWaveSpeed: { value: 1.5 }, uWaveK: { value: 2 }, uAxisR: { value: SA / SB }, uWind: { value: 1 } };
  const stone = makeStoneTexture(512, { bx: 4, by: 6, seed: 11 });
  const sandTex = makeSandTexture(1024, 3);
  stone.map.anisotropy = sandTex.map.anisotropy = 8;

  // ---------------- merged stone: podium wall, seating, promenade, facade (one draw call) ----------------
  const N = 160, AISLES = 16, per = N / AISLES;
  const GATE_HALF = 0.118;
  const angDist = (a, b) => Math.abs(((a - b + Math.PI * 3) % TAU) - Math.PI);
  const inGate = (th) => angDist(th, 0) < GATE_HALF || angDist(th, Math.PI) < GATE_HALF;
  const rowsInfo = [];      // {d, y, tw} per seat row (crowd rows)
  const segs = [];
  // podium wall (faces arena) with AO + purple frieze + gold line
  segs.push({ a: [0, 0], b: [0, 1.5], ca: [0.5, 0.45, 0.42], cb: [0.9, 0.86, 0.8], face: 'in' });
  segs.push({ a: [0, 1.5], b: [0, 1.95], ca: [0.92, 0.88, 0.82], cb: [0.95, 0.9, 0.84], face: 'in', v0: 1.5 });
  const FRIEZE = [[0.62, 0.3, 0.68], [0.55, 0.28, 0.62]];
  segs.push({ a: [-0.02, 1.95], b: [-0.02, 2.45], ca: FRIEZE[0], cb: FRIEZE[1], face: 'in', v0: 1.95 });
  segs.push({ a: [-0.03, 2.45], b: [-0.03, 2.58], ca: [1.2, 0.95, 0.4], cb: [1.2, 0.95, 0.4], face: 'in', v0: 2.45 });
  segs.push({ a: [0, 2.58], b: [0, PH], ca: [0.98, 0.94, 0.88], cb: [1.0, 0.96, 0.9], face: 'in', v0: 2.58 });
  segs.push({ a: [-0.2, PH], b: [0.25, PH], ca: 1.0, cb: 1.0, face: 'up' });                   // coping
  segs.push({ a: [-0.2, PH - 0.0], b: [-0.2, PH - 0.22], ca: 0.9, cb: 0.7, face: 'in' });
  let d = 0.25, y = PH;
  for (let k = 0; k < 15; k++) {
    if (k === 9) {                                                                                // praecinctio: wide walkway + balteus wall
      segs.push({ a: [d, y], b: [d, y + 1.1], ca: [0.55, 0.5, 0.48], cb: [1, 0.96, 0.9], face: 'in', v0: 0 }); y += 1.1;
      segs.push({ a: [d, y], b: [d + 1.4, y], ca: 1.0, cb: 0.78, face: 'up' }); d += 1.4;
    }
    const rise = 0.5, tw = 0.85;
    segs.push({ a: [d, y], b: [d, y + rise], ca: 0.62, cb: 1.0, face: 'in', v0: k * 0.5 }); y += rise;
    segs.push({ a: [d, y], b: [d + tw, y], ca: 1.0, cb: 0.74, face: 'up' });
    rowsInfo.push({ d, y, tw }); d += tw;
  }
  const dEnd = d, yTop = y;
  const dIn = FD - 1.2;
  segs.push({ a: [dEnd, yTop], b: [dIn, yTop], ca: 0.85, cb: 0.7, face: 'up' });                    // promenade
  const gal = [[yTop, 12.6], [12.6, 16.6], [16.6, FH]];
  segs.push({ a: [dIn, yTop], b: [dIn, 12.6], ca: 0.5, cb: 0.9, face: 'in' });
  segs.push({ a: [dIn, 12.6], b: [dIn, 16.6], ca: 0.9, cb: 1.0, face: 'in', v0: 12.6 });
  segs.push({ a: [dIn, 16.6], b: [dIn, FH], ca: 1.0, cb: 0.92, face: 'in', v0: 16.6 });
  void gal;
  segs.push({ a: [dIn, FH], b: [FD + 0.1, FH], ca: 1.0, cb: 1.0, face: 'up' });                    // parapet cap
  for (let t = 0; t < 3; t++) {                                                                      // facade outer, per tier with under-cornice shadow
    const y0 = t * TIER, y1 = (t + 1) * TIER;
    segs.push({ a: [FD, y0], b: [FD, y1 - 0.9], ca: t === 0 ? [0.62, 0.55, 0.5] : [0.88, 0.84, 0.78], cb: 1.0, face: 'out', v0: y0 });
    segs.push({ a: [FD, y1 - 0.9], b: [FD, y1], ca: 1.0, cb: 0.7, face: 'out', v0: y1 - 0.9 });
    const cy0 = y1, cy1 = y1 + 0.38;                                                                  // cornice ring
    segs.push({ a: [FD + 0.3, cy0 - 0.12], b: [FD + 0.3, cy1], ca: 0.95, cb: 1.05, face: 'out', v0: 0 });
    segs.push({ a: [FD, cy0 - 0.12], b: [FD + 0.3, cy0 - 0.12], ca: 0.5, cb: 0.55, face: 'down' });
    segs.push({ a: [FD, cy1], b: [FD + 0.3, cy1], ca: 1.1, cb: 1.1, face: 'up' });
    if (t < 2) { /* tier continues above cornice; wall above starts at cy1 but we already span to y1; fine */ }
  }
  segs.push({ a: [FD, 3 * TIER + 0.38], b: [FD, FH], ca: 0.9, cb: 0.95, face: 'out', v0: 3 * TIER });  // attic
  segs.push({ a: [FD + 0.4, FH - 0.5], b: [FD + 0.4, FH + 0.05], ca: 1.0, cb: 1.1, face: 'out' });   // crown cornice
  segs.push({ a: [FD, FH - 0.5], b: [FD + 0.4, FH - 0.5], ca: 0.5, cb: 0.5, face: 'down' });
  segs.push({ a: [FD, FH + 0.05], b: [FD + 0.4, FH + 0.05], ca: 1.1, cb: 1.1, face: 'up' });

  const stoneGeo = sweep(segs, N, {
    skip: (j, th, sg) => sg.a[0] <= 0.3 && sg.b[0] <= 0.3 && sg.a[1] < PH && sg.b[1] <= PH + 0.001 && sg.face === 'in' && inGate(th) && sg.b[1] <= PH && sg.a[0] <= 0 && !(sg.b[1] <= 0.0),
    tint: (j, sg) => ((j % per) === 0 && sg.face !== 'out' && sg.a[1] >= PH) ? 0.72 : 1,
  });
  const stoneMat = new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: 2.2, vertexColors: true, roughness: 0.93, metalness: 0 });
  const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat); stoneMesh.castShadow = stoneMesh.receiveShadow = true; stoneMesh.name = 'stone';
  group.add(stoneMesh);

  // ---------------- sand floor + decal ----------------
  const sandGeo = (() => {
    const R = 12, S = 96, pos = [], uv = [], col = [], idx = [], nor = [];
    pos.push(0, 0, 0); uv.push(0, 0); col.push(1.05, 1.0, 0.95); nor.push(0, 1, 0);
    for (let r = 1; r <= R; r++) for (let j = 0; j < S; j++) {
      const th = (j / S) * TAU, f = r / R, x = Math.cos(th) * SA * f, z = Math.sin(th) * SB * f;
      pos.push(x, 0, z); uv.push(x / 5, z / 5);
      const ao = 1 - 0.38 * Math.pow(Math.max(0, (f - 0.7) / 0.3), 1.6);
      col.push(ao * 1.0, ao * 0.97, ao * 0.95); nor.push(0, 1, 0);
    }
    for (let j = 0; j < S; j++) idx.push(0, 1 + ((j + 1) % S), 1 + j);
    for (let r = 1; r < R; r++) for (let j = 0; j < S; j++) {
      const a = 1 + (r - 1) * S + j, b = 1 + (r - 1) * S + ((j + 1) % S), c = 1 + r * S + j, e = 1 + r * S + ((j + 1) % S);
      idx.push(a, b, c, b, e, c);
    }
    const g = new THREE.BufferGeometry(); g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  })();
  const sandMat = new THREE.MeshStandardMaterial({ map: sandTex.map, bumpMap: sandTex.bump, bumpScale: 3.0, vertexColors: true, roughness: 1, metalness: 0 });
  const sand = new THREE.Mesh(sandGeo, sandMat); sand.receiveShadow = true; sand.name = 'sand'; group.add(sand);

  const DW = decalRes, DH = Math.round(decalRes * SB / SA);
  const dc = document.createElement('canvas'); dc.width = DW; dc.height = DH; const dx = dc.getContext('2d');
  const decalTex = new THREE.CanvasTexture(dc); decalTex.colorSpace = THREE.SRGBColorSpace; decalTex.anisotropy = 8;
  const ppm = DW / (2 * SA);
  const toPx = (x, z) => [(x + SA) * ppm, (z + SB) * ppm];
  // raked concentric rings (painted once)
  dx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const f = 0.12 + i * 0.019 + rnd() * 0.004; const dark = i % 2;
    dx.strokeStyle = dark ? 'rgba(120,84,48,0.20)' : 'rgba(255,236,190,0.17)'; dx.lineWidth = Math.max(1.5, ppm * (dark ? 0.05 : 0.04));
    dx.beginPath(); dx.ellipse(DW / 2, DH / 2, (SA - 0.4) * f * ppm * 1.0, (SB - 0.4) * f * ppm * 1.0, 0, 0, TAU); dx.stroke();
  }
  // heavy fighting-circle scuff in the middle
  const cg = dx.createRadialGradient(DW / 2, DH / 2, 0, DW / 2, DH / 2, 6 * ppm);
  cg.addColorStop(0, 'rgba(110,76,44,0.28)'); cg.addColorStop(1, 'rgba(110,76,44,0)'); dx.fillStyle = cg; dx.fillRect(DW / 2 - 6 * ppm, DH / 2 - 6 * ppm, 12 * ppm, 12 * ppm);
  let decalDirty = true;
  const decalGeo = sandGeo.clone(); {
    const p = decalGeo.attributes.position, uv = decalGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) { p.setY(i, 0.012); uv.setXY(i, (p.getX(i) + SA) / (2 * SA), 1 - (p.getZ(i) + SB) / (2 * SB)); }
    decalGeo.deleteAttribute('color');
  }
  const decalMat = new THREE.MeshLambertMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decal = new THREE.Mesh(decalGeo, decalMat); decal.receiveShadow = true; decal.renderOrder = 1; decal.name = 'sand_decal'; group.add(decal);

  function stampFootprint(x, z, heading = 0, scale = 1, side = 1) {
    const [px, pz] = toPx(x + Math.cos(heading + Math.PI / 2) * 0.1 * side * scale, z + Math.sin(heading + Math.PI / 2) * 0.1 * side * scale);
    dx.save(); dx.translate(px, pz); dx.rotate(heading);
    const L = 0.3 * scale * ppm, W = 0.11 * scale * ppm;
    dx.fillStyle = 'rgba(255,232,185,0.22)'; dx.beginPath(); dx.ellipse(-L * 0.04, 0, L * 0.62, W * 0.86, 0, 0, TAU); dx.fill();   // kicked-up rim
    dx.fillStyle = 'rgba(88,58,32,0.50)'; dx.beginPath(); dx.ellipse(-L * 0.12, 0, L * 0.30, W * 0.62, 0, 0, TAU); dx.fill();           // heel
    dx.beginPath(); dx.ellipse(L * 0.2, 0, L * 0.34, W * 0.7, 0, 0, TAU); dx.fill();                                                      // ball/toe
    dx.restore(); decalDirty = true;
  }
  function scuff(x0, z0, x1, z1, width = 0.5) {
    const [a, b] = toPx(x0, z0), [c, e] = toPx(x1, z1);
    dx.lineCap = 'round'; dx.strokeStyle = 'rgba(255,232,185,0.18)'; dx.lineWidth = width * ppm * 1.5; dx.beginPath(); dx.moveTo(a, b); dx.lineTo(c, e); dx.stroke();
    dx.strokeStyle = 'rgba(92,62,36,0.34)'; dx.lineWidth = width * ppm; dx.beginPath(); dx.moveTo(a, b); dx.lineTo(c, e); dx.stroke(); decalDirty = true;
  }

  // ---------------- void arches, archivolts, columns, windows, niches ----------------
  const voidMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  const archBase = archShape(1.15, 2.9, 1.15), voidGeo = new THREE.ShapeGeometry(archBase, 10);
  { const p = voidGeo.attributes.position, c = []; for (let i = 0; i < p.count; i++) { const t = Math.min(1, p.getY(i) / 4); c.push(0.10 + 0.22 * t, 0.075 + 0.14 * t, 0.12 + 0.17 * t); } voidGeo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); }
  const BAYS = 60;
  const outer = arcThetas(FD, BAYS, 0.5), pier = arcThetas(FD, BAYS, 0);   // arches at bay centers, columns at boundaries
  const voidMats = [];
  const archM = [];
  for (let t = 0; t < 3; t++) for (let i = 0; i < BAYS; i++) archM.push(ringMatrix(FD, outer.thetas[i], t * TIER + 0.05, { inward: false, dOff: 0.05 }));
  const inner = arcThetas(dIn, BAYS, 0.5);
  for (let i = 0; i < BAYS; i++) archM.push(ringMatrix(dIn, inner.thetas[i], 12.7, { inward: true, dOff: -0.04, scale: 0.98 }));
  const voidMesh = new THREE.InstancedMesh(voidGeo, voidMat, archM.length); archM.forEach((m, i) => voidMesh.setMatrixAt(i, m)); voidMesh.name = 'arch_voids';
  group.add(voidMesh);
  // archivolt (stone ring around each opening)
  const hole = new THREE.Path(); hole.moveTo(-1.15, 0); hole.lineTo(-1.15, 2.9); hole.absellipse(0, 2.9, 1.15, 1.15, Math.PI, 0, true); hole.lineTo(1.15, 0); hole.lineTo(-1.15, 0);
  const ringShape = new THREE.Shape(); ringShape.moveTo(-1.5, 0); ringShape.lineTo(1.5, 0); ringShape.lineTo(1.5, 2.9); ringShape.absellipse(0, 2.9, 1.5, 1.5, 0, Math.PI, false); ringShape.lineTo(-1.5, 0); ringShape.holes.push(hole);
  const ringGeo = prepGeo(new THREE.ExtrudeGeometry(ringShape, { depth: 0.45, bevelEnabled: false, curveSegments: 10 }), { uvScale: 0.25 });
  { const c = ringGeo.attributes.color, p = ringGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.8 + 0.2 * Math.min(1, p.getY(i) / 4); c.setXYZ(i, k, k, k); } }
  const ringMesh = new THREE.InstancedMesh(ringGeo, stoneMat, archM.length); ringMesh.castShadow = ringMesh.receiveShadow = true;
  archM.forEach((m, i) => { const mm = m.clone(); const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); mm.decompose(p, q, sc); const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q); p.addScaledVector(fwd, -0.05); ringMesh.setMatrixAt(i, new THREE.Matrix4().compose(p, q, sc)); });
  group.add(ringMesh);
  // engaged half-columns between the arches (3 tiers) + attic windows
  const colGeo = prepGeo(new THREE.CylinderGeometry(0.34, 0.4, TIER - 0.5, 10, 1), { uvScale: 0.5 });
  { const c = colGeo.attributes.color, p = colGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.72 + 0.28 * (p.getY(i) / (TIER - 0.5) + 0.5); c.setXYZ(i, k, k, k); } }
  const colMesh = new THREE.InstancedMesh(colGeo, stoneMat, BAYS * 3);
  for (let t = 0; t < 3; t++) for (let i = 0; i < BAYS; i++) { const m = ringMatrix(FD, pier.thetas[i], t * TIER + (TIER - 0.5) / 2 + 0.05, { inward: false, dOff: 0.12 }); colMesh.setMatrixAt(t * BAYS + i, m); }
  colMesh.castShadow = colMesh.receiveShadow = true; group.add(colMesh);
  const winGeo = (() => { const g = new THREE.PlaneGeometry(0.9, 1.5); g.translate(0, 0.75, 0); const c = []; const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 1.5; c.push(0.08 + 0.2 * t, 0.06 + 0.12 * t, 0.1 + 0.15 * t); } g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; })();
  const winMesh = new THREE.InstancedMesh(winGeo, voidMat, BAYS * 2);
  for (let i = 0; i < BAYS; i++) { winMesh.setMatrixAt(i, ringMatrix(FD, outer.thetas[i], 3 * TIER + 0.9, { inward: false, dOff: 0.06 })); winMesh.setMatrixAt(BAYS + i, ringMatrix(dIn, inner.thetas[i], 16.8, { inward: true, dOff: -0.04, scale: { x: 0.7, y: 0.6, z: 1 } })); }
  group.add(winMesh);
  // podium niches with iron bars (ground-level wall detail)
  const nicheShape = archShape(0.5, 1.0, 0.5), nicheGeo = new THREE.ShapeGeometry(nicheShape, 8);
  { const p = nicheGeo.attributes.position, c = []; for (let i = 0; i < p.count; i++) { const t = Math.min(1, p.getY(i) / 1.6); c.push(0.06 + 0.1 * t, 0.045 + 0.07 * t, 0.07 + 0.09 * t); } nicheGeo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); }
  const nich = arcThetas(0, 44, 0.5).thetas.filter((th) => !inGate(th) && angDist(th, Math.PI / 2) > 0.05);
  const nicheMesh = new THREE.InstancedMesh(nicheGeo, voidMat, nich.length);
  nich.forEach((th, i) => nicheMesh.setMatrixAt(i, ringMatrix(0, th, 0.35, { inward: true, dOff: -0.04 })));
  group.add(nicheMesh);
  const barParts = []; for (let k = -2; k <= 2; k++) { const b = new THREE.BoxGeometry(0.04, 1.55, 0.04); b.translate(k * 0.2, 0.9, 0); barParts.push(b); }
  { const b = new THREE.BoxGeometry(1.0, 0.04, 0.04); b.translate(0, 1.0, 0); barParts.push(b); const b2 = b.clone(); b2.translate(0, 0.45, 0); barParts.push(b2); }
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3c3d44, metalness: 0.6, roughness: 0.55 });
  const barMesh = new THREE.InstancedMesh(mergeGeos(barParts), ironMat, nich.length);
  nich.forEach((th, i) => barMesh.setMatrixAt(i, ringMatrix(0, th, 0.35, { inward: true, dOff: -0.1 })));
  barMesh.castShadow = true; group.add(barMesh);
  // bronze clipei (round shields) between niches
  const clGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.06, 14); clGeo.rotateX(Math.PI / 2);
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb8803a, metalness: 0.75, roughness: 0.38 });
  const clTh = arcThetas(0, 44, 0).thetas.filter((th) => !inGate(th) && angDist(th, Math.PI / 2) > 0.05 && angDist(th, -Math.PI / 2) > 0.05);
  const clMesh = new THREE.InstancedMesh(clGeo, bronzeMat, clTh.length);
  clTh.forEach((th, i) => clMesh.setMatrixAt(i, ringMatrix(0, th, 1.0, { inward: true, dOff: -0.05 })));
  group.add(clMesh);

  // ---------------- gates: stone frame, tunnel, portcullis ----------------
  const hw = 1.7, gh = 1.75, rise = 0.9;
  const gateParts = [];
  const gateFrame = (() => {
    const o = new THREE.Shape(); o.moveTo(-hw - 0.8, 0); o.lineTo(hw + 0.8, 0); o.lineTo(hw + 0.8, PH + 0.1); o.lineTo(-hw - 0.8, PH + 0.1); o.lineTo(-hw - 0.8, 0);
    const h = new THREE.Path(); h.moveTo(-hw, 0); h.lineTo(hw, 0); h.lineTo(hw, gh); h.absellipse(0, gh, hw, rise, 0, Math.PI, false); h.lineTo(-hw, 0); o.holes.push(h);
    const g = prepGeo(new THREE.ExtrudeGeometry(o, { depth: 0.9, bevelEnabled: false, curveSegments: 12 }), { uvScale: 0.17 }); g.translate(0, 0, -0.45); return g;
  })();
  const tunnelGeo = new THREE.BoxGeometry(hw * 2 + 0.1, PH, 3.6); tunnelGeo.translate(0, PH / 2, -1.8 - 0.4);
  const tunnelMat = new THREE.MeshBasicMaterial({ color: 0x0b0912, side: THREE.BackSide });
  const gates = [];
  const gateMeshes = new THREE.Group();
  const portGeo = (() => {
    const parts = [];
    for (let k = -6; k <= 6; k++) { const b = new THREE.BoxGeometry(0.075, 3.0, 0.075); b.translate(k * 0.27, 1.5 - 0.1, 0); parts.push(b); const c = new THREE.ConeGeometry(0.06, 0.28, 5); c.rotateX(Math.PI); c.translate(k * 0.27, -0.24, 0); parts.push(c); }
    for (let k = 0; k < 6; k++) { const b = new THREE.BoxGeometry(hw * 2, 0.07, 0.08); b.translate(0, 0.4 + k * 0.52, 0.0); parts.push(b); }
    return mergeGeos(parts);
  })();
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), gh + rise - 0.02);
  const portMat = new THREE.MeshStandardMaterial({ color: 0x4a4b53, metalness: 0.65, roughness: 0.5, clippingPlanes: [clip] });
  for (let g = 0; g < 2; g++) {
    const th = g ? Math.PI : 0, m = ringMatrix(0, th, 0, { inward: true, dOff: -0.1 });
    const frame = new THREE.Mesh(gateFrame, stoneMat); frame.applyMatrix4(m); frame.castShadow = frame.receiveShadow = true;
    const tun = new THREE.Mesh(tunnelGeo, tunnelMat); tun.applyMatrix4(m);
    const port = new THREE.Mesh(portGeo, portMat); port.applyMatrix4(m); port.castShadow = true;
    const base = port.position.clone();
    gateMeshes.add(frame, tun, port); gates.push({ port, base, dir: new THREE.Vector3(0, 1, 0) });
  }
  group.add(gateMeshes);
  function setGate(open, side) { gates.forEach((g, i) => { if (side === undefined || side === i) g.port.position.copy(g.base).addScaledVector(g.dir, open * (gh + rise + 0.3)); }); }
  setGate(0);

  // ---------------- torches / braziers ----------------
  const torchGeo = mergeGeos([(() => { const c = new THREE.CylinderGeometry(0.035, 0.045, 0.9, 6); c.translate(0, 0.45, 0); return c; })(), (() => { const c = new THREE.CylinderGeometry(0.14, 0.05, 0.22, 8); c.translate(0, 0.98, 0); return c; })(), (() => { const b = new THREE.BoxGeometry(0.08, 0.08, 0.22); b.translate(0, 0.2, -0.1); return b; })()]);
  const tTh = arcThetas(0, 28, 0.25).thetas.filter((th) => !inGate(th) && angDist(th, Math.PI / 2) > 0.1 && angDist(th, -Math.PI / 2) > 0.1);
  const torchMesh = new THREE.InstancedMesh(torchGeo, bronzeMat, tTh.length);
  const flamePts = [];
  tTh.forEach((th, i) => { const m = ringMatrix(0, th, 1.55, { inward: true, dOff: -0.25 }); torchMesh.setMatrixAt(i, m); const p = new THREE.Vector3().setFromMatrixPosition(m); flamePts.push({ x: p.x, y: p.y + 1.05, z: p.z, s: 0.8 }); });
  torchMesh.castShadow = true; group.add(torchMesh);
  // brazier tripods flanking gates
  const brGeo = mergeGeos([(() => { const c = new THREE.CylinderGeometry(0.42, 0.2, 0.34, 10); c.translate(0, 1.15, 0); return c; })(), ...[0, 1, 2].map((k) => { const c = new THREE.CylinderGeometry(0.03, 0.04, 1.2, 5); c.translate(0.22, 0.6, 0); c.rotateY((k / 3) * TAU); return c; })]);
  const brPos = [[SA - 2.6, 2.7], [SA - 2.6, -2.7], [-SA + 2.6, 2.7], [-SA + 2.6, -2.7]];
  const brMesh = new THREE.InstancedMesh(brGeo, bronzeMat, 4);
  brPos.forEach(([x, z], i) => { brMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z)); flamePts.push({ x, y: 1.3, z, s: 1.7 }); });
  brMesh.castShadow = true; group.add(brMesh);
  const flames = createFlames(flamePts, { glowScale: 5 }); group.add(flames.group);

  // ---------------- banners (vertex sway) + masts ----------------
  const banGeo = new THREE.PlaneGeometry(1.4, 3.6, 3, 12); banGeo.translate(0, -1.8, 0);
  { const n = banGeo.attributes.position.count, v = new Float32Array(n), uvA = banGeo.attributes.uv; for (let i = 0; i < n; i++) v[i] = Math.pow(1 - uvA.getY(i), 1.4); banGeo.setAttribute('aSway', new THREE.BufferAttribute(v, 1)); }
  const bTh = arcThetas(dIn, 28, 0.5).thetas;
  const banCount = bTh.length + 28;
  const varAttr = new Float32Array(banCount);
  banGeo.setAttribute('aVar', new THREE.InstancedBufferAttribute(varAttr, 1));
  const banMat = patchMaterial(new THREE.MeshLambertMaterial({ map: makeBannerAtlas(), side: THREE.DoubleSide, alphaTest: 0.5 }), {
    key: 'banner', uniforms: { uTime: U.uTime, uWind: U.uWind },
    vPars: 'attribute float aSway; attribute float aVar; uniform float uTime, uWind;',
    vAfterUv: '#ifdef USE_MAP\n vMapUv.x = (vMapUv.x + aVar) / 3.0;\n#endif',
    vBody: `vec3 ip = instanceMatrix[3].xyz; float ph = ip.x*0.37 + ip.z*0.21;
      transformed.z += aSway * uWind * (sin(uTime*1.7 + ph + position.y*1.3) * 0.16 + sin(uTime*3.1 + ph*2.0 + position.y*2.0) * 0.05);
      transformed.x += aSway * uWind * sin(uTime*1.3 + ph) * 0.05;`,
  });
  const banMesh = new THREE.InstancedMesh(banGeo, banMat, banCount); banMesh.name = 'banners';
  bTh.forEach((th, i) => { varAttr[i] = i % 3; banMesh.setMatrixAt(i, ringMatrix(dIn, th, 16.3, { inward: true, dOff: -0.1 })); });
  const mastTh = arcThetas(FD - 0.5, 28, 0).thetas;
  const mastGeo = new THREE.CylinderGeometry(0.06, 0.1, 6.5, 6); mastGeo.translate(0, 3.25, 0);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3c26, roughness: 0.85 });
  const mastMesh = new THREE.InstancedMesh(mastGeo, woodMat, mastTh.length);
  mastTh.forEach((th, i) => {
    mastMesh.setMatrixAt(i, ringMatrix(FD - 0.5, th, FH, { inward: false }));
    const j = bTh.length + i; varAttr[j] = (i + 1) % 3;
    const m = ringMatrix(FD - 0.5, th, FH + 6.3, { inward: false, scale: 0.55, yaw: Math.PI / 2, dOff: 0.0 }); banMesh.setMatrixAt(j, m);
  });
  mastMesh.castShadow = true; group.add(mastMesh, banMesh);

  // ---------------- velarium: translucent striped sails ----------------
  const SAILS = 30, SEG = 6, RAD = 7, vN = SAILS * SEG, dInV = 5.5, dOutV = FD - 0.7;
  const vPos = [], vUv = [], vCol = [], vSw = [], vIdx = [];
  const cream = C(0xf3e6c8), terra = C(0xc4663f);
  for (let r = 0; r <= RAD; r++) for (let j = 0; j <= vN; j++) {
    const th = (j / vN) * TAU, f = (j % SEG) / SEG, sIdx = Math.floor(j / SEG) % 2 === 0 ? cream : terra, fr = j === vN ? 1 : f;
    const sr = r / RAD, dd = lerp(dInV, dOutV, sr), p = P(dd, th);
    const fSail = (j % SEG === 0 && j > 0 && j < vN) ? 0 : fr; void fSail;
    const sag = Math.sin(Math.PI * f) * (0.55 + 0.9 * Math.sin(Math.PI * sr)) * (0.3 + 0.7 * sr);
    vPos.push(p[0], lerp(15.0, 21.2, Math.pow(sr, 0.9)) - sag, p[1]);
    vUv.push(f, sr); const c = ((Math.floor(Math.min(j, vN - 1) / SEG) % 2) === 0) ? cream : terra; void sIdx;
    vCol.push(c.r, c.g, c.b); vSw.push(Math.sin(Math.PI * f) * Math.sin(Math.PI * Math.min(1, sr * 1.15)) * (0.4 + 0.6 * (1 - sr)));
  }
  // sails need their own vertices per sail edge for u in 0..1: duplicate per sail by building quads separately
  const sPos = [], sUv = [], sCol = [], sSw = [];
  for (let sIdx = 0; sIdx < SAILS; sIdx++) {
    const c = sIdx % 2 === 0 ? cream : terra, base = sPos.length / 3;
    for (let r = 0; r <= RAD; r++) for (let k = 0; k <= SEG; k++) {
      const th = ((sIdx * SEG + k) / vN) * TAU, f = k / SEG, sr = r / RAD, dd = lerp(dInV, dOutV, sr), p = P(dd, th);
      const sag = Math.sin(Math.PI * f) * (0.55 + 0.9 * Math.sin(Math.PI * sr)) * (0.3 + 0.7 * sr);
      sPos.push(p[0], lerp(15.0, 21.2, Math.pow(sr, 0.9)) - sag, p[1]); sUv.push(f, sr); sCol.push(c.r, c.g, c.b);
      sSw.push(Math.sin(Math.PI * f) * Math.sin(Math.PI * Math.min(1, sr * 1.15)) * (0.4 + 0.6 * (1 - sr)));
    }
    for (let r = 0; r < RAD; r++) for (let k = 0; k < SEG; k++) { const a = base + r * (SEG + 1) + k, b = a + 1, c2 = a + SEG + 1, d2 = c2 + 1; vIdx.push(a, c2, b, b, c2, d2); }
  }
  void vPos; void vUv; void vCol; void vSw;
  const velGeo = new THREE.BufferGeometry(); velGeo.setIndex(vIdx);
  velGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3)); velGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
  velGeo.setAttribute('color', new THREE.Float32BufferAttribute(sCol, 3)); velGeo.setAttribute('aSway', new THREE.Float32BufferAttribute(sSw, 1)); velGeo.computeVertexNormals();
  const velMat = patchMaterial(new THREE.MeshLambertMaterial({ map: makeSailTexture(), vertexColors: true, side: THREE.DoubleSide, emissive: 0x6a3a1a }), {
    key: 'velarium', uniforms: { uTime: U.uTime, uWind: U.uWind },
    vPars: 'attribute float aSway; uniform float uTime, uWind;',
    vBody: 'transformed.y += aSway * uWind * (sin(uTime*0.9 + position.x*0.13 + position.z*0.11) * 0.28 + sin(uTime*1.9 + position.x*0.31) * 0.08);',
  });
  velMat.emissiveIntensity = 0.55;
  const velarium = new THREE.Mesh(velGeo, velMat); velarium.castShadow = true; velarium.receiveShadow = true; velarium.name = 'velarium'; group.add(velarium);

  // ---------------- crowd: ONE InstancedMesh, animated in the vertex shader ----------------
  const parts = [];
  const addPart = (g, id) => { g = g.toNonIndexed(); const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(id), 1)); parts.push(g); };
  { const g = new THREE.CylinderGeometry(0.17, 0.15, 0.62, 6, 1); g.translate(0, 0.39, 0); addPart(g, 0); }
  { const g = new THREE.IcosahedronGeometry(0.12, 0); g.translate(0, 0.86, 0.01); addPart(g, 1); }
  { const g = new THREE.CylinderGeometry(0.04, 0.032, 0.34, 4, 1, true); g.translate(-0.21, 0.51, 0); addPart(g, 2); }
  { const g = new THREE.CylinderGeometry(0.04, 0.032, 0.34, 4, 1, true); g.translate(0.21, 0.51, 0); addPart(g, 3); }
  const crowdGeo = mergeGeos(parts.map((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
  // seats
  const seats = [];
  const aisleHalfArc = 0.55;
  rowsInfo.forEach((row, k) => {
    const dSeat = row.d + row.tw * 0.6;
    const cnt = Math.round(arcThetas(dSeat, 8).length / 0.62);
    const { thetas } = arcThetas(dSeat, cnt, (k % 2) * 0.5);
    for (let i = 0; i < cnt; i++) {
      const th = thetas[i];
      const sp = Math.hypot(-Math.sin(th) * (SA + dSeat), Math.cos(th) * (SB + dSeat));       // arc speed
      const aisleF = (th / TAU) * AISLES; const dA = Math.abs(aisleF - Math.round(aisleF)) * (TAU / AISLES) * sp;
      if (dA < aisleHalfArc + 0.15) continue;
      if (inGate(th) && k < 2) { /* gate tunnel is under the first rows, seats are fine */ }
      seats.push({ th, d: dSeat, y: row.y, k });
    }
  });
  for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [seats[i], seats[j]] = [seats[j], seats[i]]; }
  const total = Math.min(seats.length, crowd);
  const aRand = new Float32Array(total * 4);
  const palPleb = [0xb58a5a, 0x8a5a3a, 0xc9a66b, 0x7a5a3c, 0x9a4a38, 0xd8c8a0, 0x6a7a4a, 0xa6783f, 0xc0703a, 0x8a6d58, 0x5f6b7a];
  const palPat = [0xf4efe2, 0xe9e0cc, 0xf4efe2, 0x5a1f5e, 0xd8cfe0, 0x9a2f3c];
  const crowdMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: false }), {
    key: 'crowd', uniforms: { uTime: U.uTime, uHype: U.uHype, uWave: U.uWave, uWaveSpeed: U.uWaveSpeed, uWaveK: U.uWaveK, uAxisR: U.uAxisR },
    vPars: `attribute float aPart; attribute vec4 aRand; uniform float uTime, uHype, uWave, uWaveSpeed, uWaveK, uAxisR;
      varying float vPart; varying float vSkin; varying float vHair; varying float vLy;`,
    vBody: `
      vec3 ip = instanceMatrix[3].xyz;
      float ang = atan(ip.z * uAxisR, ip.x);
      float wv = sin(ang * uWaveK - uTime * uWaveSpeed);
      float pulse = uWave * smoothstep(0.3, 0.95, wv);
      float ph = aRand.x * 6.2831;
      float beat = max(0.0, sin(uTime * (6.0 + aRand.w * 3.5) + ph));
      float hop = uHype * beat * (0.06 + 0.16 * aRand.w);
      float idle = (0.012 + 0.012 * aRand.w) * sin(uTime * (1.1 + aRand.w * 0.8) + ph) * (0.3 + position.y);
      float stretch = 1.0 + pulse * 0.6 + uHype * 0.04 * beat;
      vLy = position.y; vPart = aPart; vSkin = aRand.y; vHair = aRand.z;
      transformed.x += idle;
      transformed.y = position.y * stretch + hop;
      if (aPart > 1.5) {
        float side = aPart < 2.5 ? -1.0 : 1.0;
        float raise = clamp(uHype * 1.6 - aRand.z * 0.9 + pulse * 1.3, 0.0, 1.0);
        float a2 = raise * (2.55 + 0.45 * sin(uTime * 10.0 + ph));
        vec2 rel = vec2(position.x - side * 0.21, position.y - 0.68);
        float cs = cos(a2), sn = sin(a2) * side;
        vec2 r = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs);
        transformed.x = side * 0.21 + r.x + idle;
        transformed.y = (0.68 + r.y) * stretch + hop;
      }`,
    fPars: 'varying float vPart; varying float vSkin; varying float vHair; varying float vLy;',
    fBody: `
      vec3 skin = mix(vec3(0.62, 0.34, 0.18), vec3(0.17, 0.06, 0.027), vSkin);
      if (vPart > 0.5 && vPart < 1.5) { vec3 hairC = mix(vec3(0.012, 0.009, 0.006), vec3(0.2, 0.1, 0.04), vHair); diffuseColor.rgb = vLy > 0.895 ? hairC : skin; }
      else if (vPart > 1.5) diffuseColor.rgb = mix(skin, diffuseColor.rgb, step(0.45, vHair));
      diffuseColor.rgb *= 0.55 + 0.45 * smoothstep(0.05, 0.85, vLy);`,
  });
  crowdGeo.setAttribute('aRand', new THREE.InstancedBufferAttribute(aRand, 4));
  const crowdMesh = new THREE.InstancedMesh(crowdGeo, crowdMat, total); crowdMesh.name = 'crowd'; crowdMesh.receiveShadow = true; crowdMesh.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < total; i++) {
    const st = seats[i], n = NRM(st.d, st.th), p = P(st.d, st.th);
    const jit = (rnd() - 0.5) * 0.25;
    const yaw = Math.atan2(-n[0], -n[1]) + jit + (rnd() - 0.5) * 0.2;
    const sc = 0.92 + rnd() * 0.2;
    _q.setFromEuler(_e.set(0, yaw, 0)); crowdMesh.setMatrixAt(i, _m.compose(_p.set(p[0] + (rnd() - 0.5) * 0.1, st.y, p[1]), _q, _s.set(sc, sc * (0.95 + rnd() * 0.1), sc)));
    const patrician = st.k < 4 ? rnd() < 0.55 : rnd() < 0.07;
    col.setHex((patrician ? palPat : palPleb)[Math.floor(rnd() * (patrician ? palPat.length : palPleb.length))]);
    col.offsetHSL(0, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08);
    crowdMesh.setColorAt(i, col);
    aRand[i * 4] = rnd(); aRand[i * 4 + 1] = Math.pow(rnd(), 1.3); aRand[i * 4 + 2] = rnd(); aRand[i * 4 + 3] = rnd();
  }
  crowdMesh.instanceMatrix.needsUpdate = true; if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
  group.add(crowdMesh);
  const crowdTotal = total;
  crowdMesh.count = Math.floor(total * density);

  // ---------------- blob shadows under braziers (cheap contact) ----------------
  group.add(createBlobShadows(brPos.map(([x, z]) => ({ x, y: 0, z, r: 0.9 })), { opacity: 0.5 }));

  // ---------------- night glow for arch voids ----------------
  const voidDay = new THREE.Color(0xffffff);
  function setNight(n) { voidMat.color.copy(voidDay).lerp(new THREE.Color(2.6, 1.15, 0.35), n * 0.55); velMat.emissiveIntensity = lerp(0.55, 0.18, n); }

  function update(t, dt) {
    U.uTime.value = t;
    flames.update(t, nightV);
    if (decalDirty) { decalTex.needsUpdate = true; decalDirty = false; }
  }
  let nightV = 0;
  const api = {
    group, DIM, uniforms: U, stoneMat, crowdMesh, velarium, flames, decalCanvas: dc,
    shadowHint: { center: new THREE.Vector3(0, 6, 0), radius: 50 },
    crowdTotal,
    update(t, dt) { update(t, dt); },
    setHype(v) { U.uHype.value = v; }, setWave(v) { U.uWave.value = v; }, setWind(v) { U.uWind.value = v; },
    setGate, setNight(n) { nightV = n; setNight(n); },
    setDensity(d) { crowdMesh.count = Math.floor(crowdTotal * Math.max(0, Math.min(1, d))); },
    stampFootprint, scuff,
    /** Paint a walking trail of footprints between two points (lab / intro helper). */
    footTrail(x0, z0, x1, z1, step = 0.55, scale = 1) { const dx_ = x1 - x0, dz = z1 - z0, L = Math.hypot(dx_, dz), h = Math.atan2(dz, dx_); for (let d = 0, i = 0; d < L; d += step, i++) stampFootprint(x0 + dx_ * d / L, z0 + dz * d / L, h, scale, i % 2 ? 1 : -1); },
    ring: P, normalAt: NRM,
    dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); },
  };
  return api;
}
