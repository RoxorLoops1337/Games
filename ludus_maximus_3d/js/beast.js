// Ludus Maximus 3D: procedural beasts for the Venatio (lion, wolf, bear, boar, Nemean lion, war elephant with handler).
// Same contract as a gladiator rig where fightview, gore.js and the portrait renderer touch it:
//   const rig = createBeast(unitOrRecord, { detail: 'low'|'medium'|'high', scale });
//   rig.root (place + yaw), rig.update(dt), rig.animator { setMove, setState, play, release, hurt, stagger, knockdown, getUp, die, hitStop, clipInfo, dead, onEvent },
//   rig.flash, rig.squashKick, rig.localDir, rig.setPalette, rig.resetSecondary, rig.dispose,
//   gore: rig.joints.{chest,head,hipL,kneeL,ankleL...}, addBlood, setBlood, addWound, clearBlood, jointRest, severed {}, sever() -> null (beasts are not dismembered)
//   extras: rig.beast (kind), rig.nameH (nameplate / camera height in metres), rig.beastR (body radius), rig.triangles(), rig.drawCalls()
// Skinned meshes, one per material (fur, shell, mane, bone, eye, + leather / cloth / skin / metal / flag for the elephant handler): <= 8 draw calls per rig.
// Geometry is authored in REST SPACE (body space, +Z forward, +Y up, +X left) as lofted surfaces through control rings (Catmull-Rom, rounded caps, parallel transport frames)
// with SMOOTH SKINNING: every limb, the torso, the neck and the trunk are one continuous skin whose vertices blend between the neighbouring joints.
// Skeleton names reuse the humanoid ones (hips, spine, chest, neck, head, shoulderL/R = front upper leg, elbow, wrist = front paw, hipL/R = hind thigh, knee, ankle = hind paw)
// so the blood / wound / footprint code in gore.js works unchanged.
import * as THREE from 'three';
import { makeBloodUniforms, shadePatch, Spring1, clamp, lerp, smooth } from './rig.js';
import { detailFor } from './gladiator.js';

const V3 = THREE.Vector3, TAU = Math.PI * 2;
const hexC = (h) => new THREE.Color(h);
const mix = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));
const sm = (a, b, x) => smooth(a, b, x);
const h01 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; // deterministic hash (the art never uses the platform random)

// ------------------------------------------------------------------ geometry kit (REST SPACE: +Z forward, +Y up, +X left)
function setColor(g, fn) {
  const P = g.attributes.position, N = g.attributes.normal, A = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const c = fn(P.getX(i), P.getY(i), P.getZ(i), N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0);
    if (Array.isArray(c)) { A[i * 3] = c[0]; A[i * 3 + 1] = c[1]; A[i * 3 + 2] = c[2]; } else { A[i * 3] = c.r; A[i * 3 + 1] = c.g; A[i * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(A, 3)); return g;
}
const flat = (hex) => { const c = hexC(hex); return () => c; };
function blob(rx, ry, rz, w = 8, h = 5) { const g = new THREE.SphereGeometry(1, w, h); g.scale(rx, ry, rz); return g; }
function cone(r, len, seg = 5) { const g = new THREE.ConeGeometry(r, len, seg, 1); g.translate(0, len / 2, 0); return g; } // base at y=0, tip at +len
function place(g, p, r, s) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]), 'XYZ'));
  m.compose(new V3(...(p || [0, 0, 0])), q, typeof s === 'number' ? new V3(s, s, s) : new V3(...(s || [1, 1, 1]))); g.applyMatrix4(m); return g;
}
const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
/** smooth loft through control rings. ctrl: [{p:[x,y,z], r: n | [rx, ry]}] (rx = lateral, ry = the other axis of the ring).
 *  o: {seg radial segments, sub samples per control span, cap rounded cap rings (0 = open), caps [start, end], up first-frame hint, infl radius inflation (fur shells)}.
 *  The vertex attribute `rs` is the control parameter (control index + fraction): skinning blends bones along it. Winding is fixed up automatically. */
function loft(ctrl, o = {}) {
  const seg = o.seg || 8, sub = Math.max(1, o.sub || 2), n = ctrl.length, capN = o.cap === undefined ? 2 : o.cap, cp = o.caps || [true, true], infl = o.infl || 0;
  const g = (i) => ctrl[i < 0 ? 0 : i >= n ? n - 1 : i], rr = (c) => (Array.isArray(c.r) ? c.r : [c.r, c.r]);
  let P = [], R = [], S = [];
  for (let i = 0; i < n - 1; i++) {
    const a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2), ra = rr(a), rb = rr(b), rc = rr(c), rd = rr(d);
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      P.push([cr(a.p[0], b.p[0], c.p[0], d.p[0], t), cr(a.p[1], b.p[1], c.p[1], d.p[1], t), cr(a.p[2], b.p[2], c.p[2], d.p[2], t)]);
      R.push([Math.max(0.002, cr(ra[0], rb[0], rc[0], rd[0], t)) + infl, Math.max(0.002, cr(ra[1], rb[1], rc[1], rd[1], t)) + infl]); S.push(i + t);
    }
  }
  { const l = g(n - 1), r = rr(l); P.push(l.p.slice()); R.push([r[0] + infl, r[1] + infl]); S.push(n - 1); }
  const tan = (i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; const v = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); return v.lengthSq() < 1e-12 ? new V3(0, 0, 1) : v.normalize(); };
  if (cp[1] && capN) { const e = P.length - 1, t = tan(e), r = R[e], rm = Math.min(r[0], r[1]) * 0.95; for (let j = 1; j <= capN; j++) { const an = j / capN * Math.PI / 2, c = Math.cos(an), s = Math.sin(an) * rm; P.push([P[e][0] + t.x * s, P[e][1] + t.y * s, P[e][2] + t.z * s]); R.push([Math.max(0.0008, r[0] * c), Math.max(0.0008, r[1] * c)]); S.push(n - 1); } }
  if (cp[0] && capN) { const t = tan(0), r = R[0], rm = Math.min(r[0], r[1]) * 0.95, p0 = P[0], pre = [], rp = [], sp = []; for (let j = capN; j >= 1; j--) { const an = j / capN * Math.PI / 2, c = Math.cos(an), s = Math.sin(an) * rm; pre.push([p0[0] - t.x * s, p0[1] - t.y * s, p0[2] - t.z * s]); rp.push([Math.max(0.0008, r[0] * c), Math.max(0.0008, r[1] * c)]); sp.push(0); } P = pre.concat(P); R = rp.concat(R); S = sp.concat(S); }
  const NR = P.length, up0 = o.up ? new V3(...o.up) : new V3(0, 1, 0), pos = new Float32Array(NR * seg * 3), rs = new Float32Array(NR * seg), idx = [];
  let t0 = tan(0); if (Math.abs(t0.dot(up0)) > 0.95) up0.set(1, 0, 0);
  let s = new V3().crossVectors(t0, up0).normalize(), v = new V3().crossVectors(s, t0).normalize();
  for (let i = 0; i < NR; i++) {
    const t = tan(i);
    if (i > 0) { v.addScaledVector(t, -v.dot(t)); if (v.lengthSq() < 1e-8) v.set(0, 1, 0).addScaledVector(t, -t.y); v.normalize(); s.crossVectors(t, v).normalize(); }
    for (let a = 0; a < seg; a++) {
      const an = a / seg * TAU, c = Math.cos(an) * R[i][0], sn = Math.sin(an) * R[i][1], k = (i * seg + a) * 3;
      pos[k] = P[i][0] + s.x * c + v.x * sn; pos[k + 1] = P[i][1] + s.y * c + v.y * sn; pos[k + 2] = P[i][2] + s.z * c + v.z * sn; rs[i * seg + a] = S[i];
    }
  }
  for (let i = 0; i < NR - 1; i++) for (let a = 0; a < seg; a++) { const a0 = i * seg + a, a1 = i * seg + (a + 1) % seg, b0 = (i + 1) * seg + a, b1 = (i + 1) * seg + (a + 1) % seg; idx.push(a0, b0, a1, a1, b0, b1); }
  let agree = 0; const A = new V3(), B = new V3(), C = new V3(), nn = new V3();
  for (let k = 0; k < idx.length; k += 3) { A.fromArray(pos, idx[k] * 3); B.fromArray(pos, idx[k + 1] * 3); C.fromArray(pos, idx[k + 2] * 3); nn.crossVectors(B.clone().sub(A), C.clone().sub(A)); const ri = Math.floor(idx[k] / seg); agree += nn.x * (A.x - P[ri][0]) + nn.y * (A.y - P[ri][1]) + nn.z * (A.z - P[ri][2]); }
  if (agree < 0) for (let k = 0; k < idx.length; k += 3) { const q = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = q; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('rs', new THREE.BufferAttribute(rs, 1)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
/** blend weights along a loft's control parameter: knots = [[boneIndex, controlParam], ...] ascending (a bone owns everything from its knot to the next one, blended over +-bz) */
function skinKnots(geo, knots, bz = 0.6) {
  const rs = geo.attributes.rs, n = rs.count, I = new Uint16Array(n * 4), W = new Float32Array(n * 4), k = knots.length, w = new Array(k), A = new Array(k + 1);
  for (let v = 0; v < n; v++) {
    const s = rs.getX(v); A[0] = 1; A[k] = 0;
    for (let j = 1; j < k; j++) A[j] = sm(knots[j][1] - bz, knots[j][1] + bz, s);
    let tot = 0; for (let j = 0; j < k; j++) { w[j] = Math.max(0, A[j] - A[j + 1]); tot += w[j]; }
    const ord = w.map((x, j) => j).sort((a, b) => w[b] - w[a]).slice(0, 4); let t2 = 0; for (const j of ord) t2 += w[j];
    for (let q = 0; q < 4; q++) { const j = ord[q]; if (j !== undefined && w[j] > 0.001) { I[v * 4 + q] = knots[j][0]; W[v * 4 + q] = w[j] / t2; } }
    if (!(t2 > 0)) { I[v * 4] = knots[0][0]; W[v * 4] = 1; }
  }
  return { i: I, w: W };
}
/** thin tapered strand cards (mane, ruff, tufts, whiskers, bristles): a batch of blades merged into one skinned piece */
class Blades {
  constructor() { this.P = []; this.N = []; this.C = []; this.I = []; this.SI = []; this.SW = []; this.tris = 0; }
  /** a: root [x,y,z]; dir: V3 (unit); len, w (half width at root), n segments, bend: V3 added quadratically (droop), c0 root colour, c1 tip colour, bones: [[boneIndex, weight], ...] */
  add(a, dir, len, w, n, bend, c0, c1, bones, ref) {
    const side = new V3().crossVectors(dir, ref || new V3(0, 1, 0)); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const base = this.P.length / 3, pts = [], tmp = new V3();
    for (let k = 0; k <= n; k++) { const t = k / n; pts.push(new V3(a[0] + dir.x * len * t + bend.x * t * t, a[1] + dir.y * len * t + bend.y * t * t, a[2] + dir.z * len * t + bend.z * t * t)); }
    const push = (p, nv, c) => { this.P.push(p.x, p.y, p.z); this.N.push(nv.x, nv.y, nv.z); this.C.push(c.r, c.g, c.b); for (let q = 0; q < 4; q++) { const b = bones[q]; this.SI.push(b ? b[0] : 0); this.SW.push(b ? b[1] : 0); } };
    for (let k = 0; k <= n; k++) {
      const t = k / n, tg = tmp.copy(pts[Math.min(n, k + 1)]).sub(pts[Math.max(0, k - 1)]).normalize(), nv = new V3().crossVectors(side, tg).normalize(), ww = k === n ? 0 : w * (1 - 0.8 * t), c = c0.clone().lerp(c1, t);
      if (k === n) push(pts[k], nv, c); else { push(pts[k].clone().addScaledVector(side, ww), nv, c); push(pts[k].clone().addScaledVector(side, -ww), nv, c); }
    }
    for (let k = 0; k < n; k++) { const i0 = base + k * 2; if (k === n - 1) { this.I.push(i0, i0 + 1, i0 + 2); this.tris++; } else { this.I.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2); this.tris += 2; } }
  }
  build() {
    if (!this.I.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setIndex(this.I);
    g.userData.skin = { i: Uint16Array.from(this.SI), w: Float32Array.from(this.SW) }; return g;
  }
}

// ------------------------------------------------------------------ species definitions (metres at unit size; +Z forward). The skeleton and gait numbers drive the animator; the rest drives the lofts.
// front/hind chains: offsets are relative to the parent joint, so the rest pose is a real bent leg. hipsY / chestY are derived so the paws stand on y=0.
const LION = {
  id: 'lion', ears: 'round', head: { sk: [0.2, 0.18, 0.23], sn: [0.11, 0.09, 0.19], jaw: 0.2 }, neck: [0.1, 0.25], hd: [-0.01, 0.2], jawAt: [-0.075, 0.13], earAt: [0.125, 0.16, -0.02],
  torso: { hipsZ: -0.5, chestZ: 0.45, rump: [0.22, 0.27], mid: [0.21, 0.27], chest: [0.28, 0.38], len: 0.34, waist: 0.88 },
  front: { dx: 0.19, sy: -0.13, sz: 0.1, up: [-0.27, -0.01], lo: [-0.28, 0.04], pad: 0.14, r: [0.14, 0.11, 0.08], paw: [0.09, 0.07, 0.13] },
  hind: { dx: 0.18, hy: -0.12, hz: -0.02, up: [-0.23, 0.13], lo: [-0.19, -0.12], pad: 0.17, r: [0.175, 0.105, 0.06], paw: [0.08, 0.06, 0.12] },
  tail: { n: 3, len: 0.32, r: 0.032, at: [0.0, 0.06, -0.3], tuft: 0.07 }, eye: '#d9a21b', fur: '#c69a52', belly: '#ecd9aa', dark: '#5a3b1c', mane: '#6e3d1a', nose: '#3a2420', muz: '#e9d2a2',
  gait: { walkV: 1.5, trotV: 3.2, runV: 5.2, strideW: 1.1, strideT: 1.9, strideR: 3.9 }, size: 1, h: 1.5, r: 0.95, hasMane: true, nameH: 1.75,
};
const WOLF = {
  id: 'wolf', ears: 'point', head: { sk: [0.1, 0.1, 0.14], sn: [0.055, 0.05, 0.17], jaw: 0.17 }, neck: [0.08, 0.2], hd: [-0.02, 0.2], jawAt: [-0.05, 0.1], earAt: [0.065, 0.1, -0.03],
  torso: { hipsZ: -0.42, chestZ: 0.34, rump: [0.13, 0.17], mid: [0.115, 0.15], chest: [0.15, 0.25], len: 0.28, waist: 0.8 },
  front: { dx: 0.11, sy: -0.11, sz: 0.06, up: [-0.22, 0.0], lo: [-0.24, 0.03], pad: 0.11, r: [0.07, 0.05, 0.04], paw: [0.05, 0.05, 0.085] },
  hind: { dx: 0.105, hy: -0.12, hz: 0, up: [-0.21, 0.1], lo: [-0.2, -0.1], pad: 0.15, r: [0.1, 0.06, 0.036], paw: [0.048, 0.05, 0.08] },
  tail: { n: 3, len: 0.2, r: 0.05, at: [0.0, 0.05, -0.2], tuft: 0.06 }, eye: '#e0b030', fur: '#8e95a0', belly: '#dcd8cc', dark: '#454952', mane: '#aab0b9', nose: '#171414', muz: '#cfc9bc',
  gait: { walkV: 1.6, trotV: 3.6, runV: 6.2, strideW: 0.95, strideT: 1.7, strideR: 3.3 }, size: 1, h: 0.95, r: 0.6, nameH: 1.25, ruff: true,
};
const BEAR = {
  id: 'bear', ears: 'round', head: { sk: [0.18, 0.16, 0.2], sn: [0.095, 0.08, 0.19], jaw: 0.18 }, neck: [0.1, 0.3], hd: [-0.04, 0.26], jawAt: [-0.08, 0.1], earAt: [0.13, 0.15, -0.04],
  torso: { hipsZ: -0.6, chestZ: 0.5, rump: [0.27, 0.3], mid: [0.28, 0.3], chest: [0.31, 0.36], len: 0.4, waist: 1.0 },
  front: { dx: 0.25, sy: -0.16, sz: 0.1, up: [-0.36, 0.0], lo: [-0.38, 0.05], pad: 0.15, r: [0.145, 0.115, 0.095], paw: [0.105, 0.07, 0.15] },
  hind: { dx: 0.24, hy: -0.18, hz: 0, up: [-0.32, 0.12], lo: [-0.3, -0.1], pad: 0.18, r: [0.175, 0.115, 0.08], paw: [0.1, 0.07, 0.14] },
  tail: { n: 1, len: 0.14, r: 0.05, at: [0.0, 0.1, -0.3], tuft: 0 }, eye: '#2a1810', fur: '#7a4f30', belly: '#a07a50', dark: '#3e2818', mane: '#5a3c26', nose: '#161010', muz: '#b08a5c',
  gait: { walkV: 1.4, trotV: 2.8, runV: 4.6, strideW: 1.2, strideT: 1.9, strideR: 3.1 }, size: 1.1, h: 1.9, r: 1.1, nameH: 2.1, hump: true,
};
const BOAR = {
  id: 'boar', ears: 'flap', head: { sk: [0.16, 0.16, 0.19], sn: [0.095, 0.085, 0.23], jaw: 0.2 }, neck: [0.02, 0.2], hd: [-0.12, 0.2], jawAt: [-0.09, 0.14], earAt: [0.11, 0.14, -0.02],
  torso: { hipsZ: -0.46, chestZ: 0.4, rump: [0.22, 0.25], mid: [0.24, 0.27], chest: [0.3, 0.36], len: 0.34, waist: 1.0 },
  front: { dx: 0.19, sy: -0.15, sz: 0.08, up: [-0.2, 0.0], lo: [-0.22, 0.03], pad: 0.1, r: [0.115, 0.08, 0.055], paw: [0.06, 0.06, 0.1] },
  hind: { dx: 0.18, hy: -0.15, hz: 0, up: [-0.18, 0.08], lo: [-0.18, -0.08], pad: 0.12, r: [0.14, 0.085, 0.05], paw: [0.06, 0.06, 0.09] },
  tail: { n: 2, len: 0.14, r: 0.018, at: [0.0, 0.1, -0.22], tuft: 0.03 }, eye: '#2a1810', fur: '#7d6650', belly: '#a08a72', dark: '#3a2e25', mane: '#3a2e25', nose: '#a8756a', muz: '#9a7a66',
  gait: { walkV: 1.5, trotV: 3.0, runV: 5.0, strideW: 1.0, strideT: 1.6, strideR: 2.9 }, size: 1.2, h: 1.4, r: 0.95, nameH: 1.6, bristle: true, tusks: true,
};
const SPECIES = { lion: LION, wolf: WOLF, bear: BEAR, boar: BOAR };
SPECIES.nemean = Object.assign({}, LION, { id: 'nemean', size: 1.75, fur: '#d9b24a', belly: '#f0dc9a', dark: '#6a4a1e', mane: '#2e1a0e', eye: '#ff9a20', nose: '#2a1a14', muz: '#f0dc9a', h: 2.7, r: 1.7, nameH: 3.0, gold: true, scars: true });

const ELEPHANT = {
  id: 'elephant', ears: 'big', head: { sk: [0.3, 0.34, 0.34], sn: [0.14, 0.14, 0.2], jaw: 0 }, neck: [0.12, 0.45], hd: [0.18, 0.4], jawAt: [-0.1, 0.1], earAt: [0.3, 0.2, -0.12],
  torso: { hipsZ: -0.95, chestZ: 0.85, rump: [0.58, 0.64], mid: [0.64, 0.7], chest: [0.62, 0.7], len: 0.7, waist: 1.0 },
  front: { dx: 0.42, sy: -0.35, sz: 0.0, up: [-0.55, 0.0], lo: [-0.6, 0.0], pad: 0.12, r: [0.33, 0.27, 0.23], paw: [0.23, 0.09, 0.25] },
  hind: { dx: 0.42, hy: -0.32, hz: 0, up: [-0.5, 0.1], lo: [-0.55, -0.1], pad: 0.12, r: [0.36, 0.27, 0.22], paw: [0.23, 0.09, 0.25] },
  tail: { n: 2, len: 0.45, r: 0.045, at: [0.0, 0.1, -0.5], tuft: 0.07 }, eye: '#2a1a10', fur: '#7b746f', belly: '#948b82', dark: '#4a423e', mane: '#5f5c58', nose: '#6a6560', muz: '#b79088',
  gait: { walkV: 1.6, trotV: 3.4, runV: 6.5, strideW: 2.2, strideT: 3.0, strideR: 4.8, pace: true, rf: 0.6 }, size: 1, h: 4.4, r: 2.2, nameH: 4.9, trunk: true, rider: true,
};
SPECIES.elephant = ELEPHANT;

// ------------------------------------------------------------------ materials
// fur look per species: grain (strand noise strength), sc (noise frequency), salt (guard hair), clump / wound noise frequencies, bump (fur relief), rim (warm fur rim), edge (dark contour)
const FURK = {
  wolf: { grain: 0.22, sc: 46, salt: 0.22, bump: 0.006, rim: 0.55, edge: 0.34, pv: 0.18 }, lion: { grain: 0.15, sc: 40, salt: 0.08, bump: 0.005, rim: 0.6, edge: 0.34, pv: 0.12 },
  bear: { grain: 0.24, sc: 36, salt: 0.14, bump: 0.006, rim: 0.5, edge: 0.34, pv: 0.14 }, boar: { grain: 0.3, sc: 54, salt: 0.18, bristle: 1, bump: 0.007, rim: 0.35, edge: 0.34, pv: 0.18 },
  nemean: { grain: 0.12, sc: 38, salt: 0.06, glint: 1, bump: 0.004, rim: 0.7, edge: 0.3, pv: 0.1 }, elephant: { grain: 0.06, sc: 22, wrinkle: 1, bump: 0.007, rim: 0.5, edge: 0.55, pv: 0.3 },
};
/** the fur / skin material. kind 'cloth' (animals) or 'leather' (elephant) supplies the lighting wrap; this adds strand grain, fur relief (derivative bump), a warm velvet rim, a dark contour,
 *  and its OWN blood model: wound based wet clumps that darken the fur instead of tinting it (the shared uniforms of makeBloodUniforms drive it, shadePatch's uniform soak is switched off). */
function furMaterial(id, bu, shadeKind = 'cloth', o = {}) {
  const F = FURK[id] || FURK.lion, f = (n) => (+n).toFixed(3), big = id === 'elephant', shell = !!o.shell, H = f(SPECIES[id] ? SPECIES[id].h * 0.55 * (SPECIES[id].size || 1) : 1);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: o.ds ? 1 : big ? 0.88 : 0.82, metalness: 0, vertexColors: true, side: o.ds ? THREE.DoubleSide : THREE.FrontSide });
  shadePatch(m, shadeKind, { blood: bu, gash: true });
  const orig = m.onBeforeCompile, key0 = m.customProgramCacheKey;
  const col = `{ vec3 fp = vBP;
  float f1 = bn(fp * ${f(F.sc)} + 3.1), f2 = bn(fp * ${f(F.sc * 2.2)} + 9.7);
  float grain = 1.0 - ${f(F.grain)} * 0.5 + ${f(F.grain)} * (0.62 * f1 + 0.38 * f2);
  diffuseColor.rgb *= grain;
  ${F.salt ? `diffuseColor.rgb *= 1.0 - ${f(F.salt)} * smoothstep(0.62, 0.9, f2);` : ''}
  float pv = bn(fp * ${big ? '2.4' : '4.2'} + 17.0); diffuseColor.rgb *= 1.0 + ${f(F.pv)} * (pv - 0.5) * 2.0;
  ${F.bristle ? `float bs = smoothstep(0.55, 0.85, sin(fp.z * 26.0 + bn(fp * 6.0) * 3.0) * 0.5 + 0.5) * smoothstep(0.55, 0.9, fp.y) * smoothstep(0.25, 0.0, abs(fp.x)); diffuseColor.rgb *= 1.0 - 0.45 * bs;` : ''}
  ${F.wrinkle ? `float wr = sin(fp.y * 52.0 + bn(fp * 7.0) * 6.0) * 0.5 + 0.5; float wr2 = sin((fp.z + fp.x * 0.6) * 40.0 + bn(fp * 11.0) * 5.0) * 0.5 + 0.5; diffuseColor.rgb *= 0.8 + 0.12 * wr + 0.08 * wr2; float dust = smoothstep(0.35, 0.0, fp.y) * 0.3 + 0.04; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.5, 0.36), dust * (0.4 + 0.6 * bn(fp * 9.0)));` : ''}
  ${F.glint ? `diffuseColor.rgb += vec3(0.16, 0.1, 0.01) * pow(bn(fp * 46.0), 5.0) * 1.4;` : ''}
  ${shell ? `float sh = bn(fp * ${f(F.sc * 0.8)} + 5.3) * 0.6 + bn(fp * ${f(F.sc * 2.0)} + 1.1) * 0.4; if (sh < vLayer * 0.92 + 0.04) discard; diffuseColor.rgb *= 0.9 + 0.2 * vLayer;` : ''}
  // blood: wound based, wet clumps that darken the fur (the strand texture stays visible), runnels fall with gravity, a small spatter low on the body; dries brown
  gBM = 0.0;
  if (uBOn > 0.5) {
    vec3 bp = vBP;
    float cl = bn(vec3(bp.x * 70.0, bp.y * 9.0, bp.z * 70.0) + uBSeed), cl2 = bn(bp * 26.0 + uBSeed * 1.3), cl3 = bn(bp * 90.0 + uBSeed * 0.7);
    float lowB = 1.0 - smoothstep(0.05, ${H}, bp.y);
    float mk = smoothstep(0.72, 0.98, cl2 * 0.55 + cl * 0.45 + lowB * 0.16 + uBlood * 0.2) * min(uBlood, 1.0) * 0.42;
    float edge = mk, core = 0.0, gsh = 0.0;
    for (int i = 0; i < ${6}; i++) { vec4 w = uWound[i], d = uWoundD[i]; if (d.w > 0.0) {
      vec3 dl = bp - w.xyz; float soak = clamp(d.w, 0.0, 2.2), R = w.w * (1.0 + 1.5 * soak);
      float dyn = dl.y > 0.0 ? dl.y / (R * 0.8) : dl.y / (R * (1.6 + 2.6 * soak));
      float q = (dl.x * dl.x + dl.z * dl.z) / (R * R) + dyn * dyn;
      float reg = exp(-q * 1.7);
      float cv = smoothstep(0.28, 0.62, reg + (cl - 0.5) * 0.6 + (cl2 - 0.5) * 0.25);
      edge = max(edge, cv * clamp(0.35 + soak * 0.55, 0.0, 1.0));
      core = max(core, smoothstep(0.55, 0.95, reg + (cl3 - 0.5) * 0.3) * clamp(soak, 0.0, 1.0));
      vec3 dd = bp - w.xyz; float al = dot(dd, d.xyz), ac = length(dd - d.xyz * al);
      gsh = max(gsh, (1.0 - smoothstep(w.w * 0.7, w.w, abs(al))) * (1.0 - smoothstep(0.008, 0.02, ac)) * clamp(soak * 2.0, 0.0, 1.0));
    } }
    vec3 dried = vec3(0.26, 0.12, 0.09), wet = vec3(0.5, 0.07, 0.06), tintc = mix(dried, wet, uBFresh);
    vec3 base = diffuseColor.rgb;
    vec3 dark = base * mix(vec3(0.5, 0.34, 0.3), vec3(0.34, 0.1, 0.08), uBFresh) + tintc * 0.1;
    diffuseColor.rgb = mix(base, dark, clamp(edge, 0.0, 1.0) * 0.92);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.014, 0.018) * (0.6 + 0.8 * cl3) + dried * 0.05, core * (0.4 + 0.5 * uBFresh));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.0, 0.004), gsh * 0.85);
    gBM = clamp(max(edge * 0.8, max(core, gsh)), 0.0, 1.0);
  }
}`;
  const bump = `{ vec3 bq = vBP; float hh = ${F.wrinkle ? 'sin(bq.y * 52.0 + bn(bq * 7.0) * 6.0) * 0.5 + 0.5 + 0.5 * (sin((bq.z + bq.x * 0.6) * 40.0 + bn(bq * 11.0) * 5.0) * 0.5 + 0.5) + 0.6 * bn(bq * 120.0)' : `bn(bq * ${f(F.sc * 1.5)}) * 0.6 + bn(bq * ${f(F.sc * 4.0)}) * 0.4`};
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(hh), dhy = dFdy(hh); vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2); normal = normalize(abs(det) * normal - ${f(F.bump)} * grad); }`;
  const rim = `{ vec3 vdR = normalize(vViewPosition); float ndR = clamp(dot(normal, vdR), 0.0, 1.0); vec3 nwR = inverseTransformDirection(normal, viewMatrix); float upR = nwR.y * 0.5 + 0.5;
  float hr = bn(vBP * ${f(F.sc * 0.7)} + 2.0);
  float rimF = pow(1.0 - ndR, 2.2);
  outgoingLight += diffuseColor.rgb * vec3(1.0, 0.84, 0.6) * rimF * ${f(F.rim)} * (0.35 + 0.65 * upR) * (0.7 + 0.6 * hr);
  outgoingLight *= 1.0 - ${f(F.edge)} * pow(1.0 - ndR, 3.0) * (1.15 - 0.7 * upR);
  outgoingLight += diffuseColor.rgb * vec3(1.0, 0.72, 0.5) * 0.2 * (1.0 - upR) * (0.5 + 0.5 * ndR);
  outgoingLight *= mix(0.9, 1.0, smoothstep(0.02, ${f(big ? 0.9 : 0.28)}, vBP.y)); }
`;
  m.onBeforeCompile = (sh) => {
    orig(sh);
    sh.fragmentShader = sh.fragmentShader.replace('if (uBOn > 0.5) {', 'if (false) {').replace('outgoingLight += addC * (1.0 - gBM * 0.65);', 'outgoingLight += addC * (1.0 - gBM * 0.65) * ' + (o.ds ? '0.32' : '0.85') + ';').replace('#include <color_fragment>', '#include <color_fragment>\n' + col).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (o.low ? '' : bump)).replace('#include <opaque_fragment>', rim + '#include <opaque_fragment>');
    if (shell) { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLayer; varying float vLayer;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLayer = aLayer;'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLayer;'); }
  };
  m.customProgramCacheKey = () => key0() + '-bf2' + id + (shell ? 's' : '') + (o.ds ? 'd' : '') + (o.low ? 'l' : '');
  return m;
}
function plainMat(color, kind, rough, metal, bu, blood = true, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true, side: o.ds ? THREE.DoubleSide : THREE.FrontSide, flatShading: !!o.flat });
  shadePatch(m, kind, blood ? { blood: bu, gash: false } : {}); if (kind === 'eye') { m.emissive = new THREE.Color(o.glow || 0x000000); m.userData.base = m.emissive.clone(); } return m;
}

// ------------------------------------------------------------------ clip tables (authored, sparse: only the channels a clip names are overridden)
const JN = ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'earL', 'earR', 'tail1', 'tail2', 'tail3', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR', 'trunk1', 'trunk2', 'trunk3', 'trunk4', 'rider', 'riderArm', 'eyeL', 'eyeR', 'lidL', 'lidR', 'mane1', 'mane2', 'flag1', 'flag2', 'browL', 'browR', 'lipL', 'lipR'];
const JI = {}; JN.forEach((n, i) => { JI[n] = i; });
// PERF: channel offsets resolved once (the per-frame code used string concatenation, array literals and closures for these)
const LEG_I = [['shoulderL', 'elbowL', 'wristL'], ['shoulderR', 'elbowR', 'wristR'], ['hipL', 'kneeL', 'ankleL'], ['hipR', 'kneeR', 'ankleR']].map((r) => r.map((n) => JI[n] * 3));
const TAIL_I = [1, 2, 3].map((i) => JI['tail' + i] * 3), TRUNK_I = [1, 2, 3, 4].map((i) => JI['trunk' + i] * 3), EAR_I = [JI.earL * 3, JI.earR * 3], EYE_I = [JI.eyeL * 3, JI.eyeR * 3], LID_I = [JI.lidL * 3, JI.lidR * 3], MANE_I = [JI.mane1 * 3, JI.mane2 * 3], FLAG_I = [JI.flag1 * 3, JI.flag2 * 3], BROW_I = [JI.browL * 3, JI.browR * 3], LIP_I = [JI.lipL * 3, JI.lipR * 3];
const NB = JN.length * 3, BODY = ['bodyX', 'bodyY', 'bodyZ', 'bodyP', 'bodyR', 'bodyW']; // body channels follow the joints
const CH = {}; JN.forEach((n, i) => { CH[n] = i * 3; }); BODY.forEach((n, i) => { CH[n] = NB + i; });
const BX = NB, BY = NB + 1, BZ = NB + 2, BP = NB + 3, BR = NB + 4, BW = NB + 5;
const NCH = NB + BODY.length;
const EASE = { lin: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), cub: (t) => t * t * t, back: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
// pose shorthands: ears -> both ears pitch, lids -> both lids (0 open, 1.3 shut), mane -> both mane joints, sh / hp / el / kn -> both shoulders / hips / elbows / knees (x), eyes -> both eyes [yaw, pitch]
const SHORT = { ears: (v) => ({ earL: [v, 0, 0], earR: [v, 0, 0] }), lids: (v) => ({ lidL: [v, 0, 0], lidR: [v, 0, 0] }), mane: (v) => ({ mane1: [v, 0, 0], mane2: [v * 0.6, 0, 0] }), snarl: (v) => ({ lipL: [-0.25 * v, 0, 1.0 * v], lipR: [-0.25 * v, 0, -1.0 * v], browL: [0.5 * v, 0, 0.3 * v], browR: [0.5 * v, 0, -0.3 * v] }), sh: (v) => ({ shoulderL: [v, 0, 0], shoulderR: [v, 0, 0] }), hp: (v) => ({ hipL: [v, 0, 0], hipR: [v, 0, 0] }), el: (v) => ({ elbowL: [v, 0, 0], elbowR: [v, 0, 0] }), kn: (v) => ({ kneeL: [v, 0, 0], kneeR: [v, 0, 0] }) };
/** keys: [[t, {chan: value | [x,y,z]}, ease?], ...]; ease applies to the segment ARRIVING at that key. info: {swing, hit, recover} seconds. A channel that ends before the clip does returns to 0 at the end. */
function clip(name, dur, keys, o = {}) {
  const chans = new Map();
  for (const [t, pose0, ez] of keys) {
    const pose = {}; for (const k in pose0) { if (SHORT[k]) Object.assign(pose, SHORT[k](pose0[k])); else pose[k] = pose0[k]; }
    for (const k in pose) {
      const v = pose[k], base = CH[k]; if (base === undefined) throw new Error('beast clip channel ' + k);
      if (Array.isArray(v)) v.forEach((x, i) => { const c = base + i; if (!chans.has(c)) chans.set(c, []); chans.get(c).push([t, x, ez || 'io']); });
      else { if (!chans.has(base)) chans.set(base, []); chans.get(base).push([t, v, ez || 'io']); }
    }
  }
  for (const a of chans.values()) { a.sort((p, q) => p[0] - q[0]); if (a[0][0] > 1e-4) a.unshift([0, 0, 'io']); if (!o.hold && a[a.length - 1][0] < dur - 1e-4) a.push([dur, 0, 'io']); }   // a channel first keyed late eases in from 0, one that ends early returns to 0
  // PERF: the same keys as flat typed arrays (times, values, ease ids) so a whole clip is sampled in one loop (evalClip) without a call, a boxed double or a polymorphic ease call per channel
  const KE = { lin: 0, in: 1, out: 2, io: 3, cub: 4, back: 5 }, vals = [...chans.values()];
  const chT = vals.map((a) => Float64Array.from(a, (k) => k[0])), chV = vals.map((a) => Float64Array.from(a, (k) => k[1])), chE = vals.map((a) => Uint8Array.from(a, (k) => KE[k[2]] ?? 3));
  return Object.assign({ name, dur, chans, chI: Int32Array.from(chans.keys()), chK: vals, chT, chV, chE, fi: 0.08, fo: 0.16, hold: false, swing: 0, hit: 0, recover: dur * 0.7, add: false }, o);
}
/** write every channel of clip `c` at time tt into pa (and flag it in mask). Same keyframe maths as evalKeys + EASE, one loop, no calls. */
function evalClip(c, tt, pa, mask) {
  const T = c.chT, V = c.chV, E = c.chE, I = c.chI;
  for (let ci = 0, cn = I.length; ci < cn; ci++) {
    const ts = T[ci], vs = V[ci], es = E[ci], n = ts.length; let v;
    if (tt <= ts[0]) v = vs[0];
    else {
      v = vs[n - 1];
      for (let i = 1; i < n; i++) if (tt <= ts[i]) {
        const t0 = ts[i - 1], dk = ts[i] - t0, k = (tt - t0) / (dk > 1e-5 ? dk : 1e-5); let e;
        switch (es[i]) { case 0: e = k; break; case 1: e = k * k; break; case 2: e = 1 - (1 - k) * (1 - k); break; case 3: e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; break; case 4: e = k * k * k; break; default: { const cb = 1.7; e = 1 + (cb + 1) * Math.pow(k - 1, 3) + cb * Math.pow(k - 1, 2); } }
        v = vs[i - 1] + (vs[i] - vs[i - 1]) * e; break;
      }
    }
    const ch = I[ci]; pa[ch] = v; mask[ch] = 1;
  }
}
function evalKeys(a, t) {
  if (t <= a[0][0]) return a[0][1]; const n = a.length;
  for (let i = 1; i < n; i++) if (t <= a[i][0]) { const p = a[i - 1], q = a[i], k = (t - p[0]) / Math.max(1e-5, q[0] - p[0]); return p[1] + (q[1] - p[1]) * EASE[q[2]](k); }
  return a[n - 1][1];
}

/** per species clip set. K = body translation scale (bigger beasts lunge further), lion style = default */
function clipsFor(sp) {
  const id = sp.id, C = {}, big = id === 'elephant', bear = id === 'bear', wolf = id === 'wolf', boar = id === 'boar', lion = id === 'lion' || id === 'nemean';
  const up = big ? 0.45 : 1, K = sp.size * (big ? 2.2 : 1); // elephants raise less and move more in absolute terms
  // ---- bite: coil back with the jaw wide open (anticipation), lunge with the whole body, snap, shake the head (follow-through), recover
  const bw = wolf ? 0.7 : 0.95, b1 = wolf ? 0.15 : 0.22, b2 = wolf ? 0.27 : 0.33;
  C.bite = clip('bite', bw, [
    [0, {}],
    [b1, { neck: [-0.5, 0, 0], head: [-0.35, 0, 0], jaw: [1.0, 0, 0], chest: [-0.16, 0, 0], bodyZ: -0.16 * K, bodyP: -0.07, bodyY: -0.04 * K, kn: 0.3, hp: 0.12, sh: 0.1, ears: -0.7, lids: 0.45, snarl: 1.0, tail1: [-0.4, 0, 0], mane: -0.12 }, 'out'],
    [b2, { neck: [0.5, 0, 0], head: [0.22, 0, 0], jaw: [0.04, 0, 0], chest: [0.14, 0, 0], bodyZ: 0.46 * K, bodyP: 0.1, bodyY: -0.06 * K, sh: -0.55, el: 0.1, hp: -0.25, kn: 0.1, ears: -0.9, lids: 0.8, snarl: 0.8, tail1: [0.3, 0, 0], mane: 0.12 }, 'cub'],
    [b2 + 0.07, { neck: [0.36, 0.38, 0], head: [0.18, 0.15, 0], chest: [0.1, 0.1, 0], bodyZ: 0.4 * K, jaw: [0.0, 0, 0], sh: -0.4 }, 'out'],
    [b2 + 0.14, { neck: [0.36, -0.38, 0], head: [0.18, -0.15, 0], chest: [0.1, -0.1, 0], bodyZ: 0.36 * K }, 'io'],
    [b2 + 0.24, { neck: [0.24, 0.1, 0], head: [0.1, 0, 0], bodyZ: 0.26 * K, sh: -0.2, ears: -0.4, lids: 0.3, snarl: 0.3 }, 'out'],
  ], { swing: b1, hit: b2, recover: wolf ? 0.42 : 0.52, fo: 0.2 });
  // ---- claw / swipe: weight onto the hind legs, paw up and back (anticipation), strike across with a body twist, hold, return
  const hi = bear ? -1.7 : -1.45;
  C.claw = clip('claw', 0.85, [
    [0, {}],
    [0.22, { chest: [-0.34 * up * 1.2, 0.22, 0], shoulderR: [hi, 0, 0.45], elbowR: [0.45, 0, 0], wristR: [0.7, 0, 0], neck: [-0.18, 0.28, 0], head: [-0.1, 0, 0], jaw: [0.5, 0, 0], bodyZ: -0.1 * K, bodyP: -0.14, bodyY: 0.04 * K, hp: 0.15, kn: 0.2, shoulderL: [0.15, 0, 0], ears: -0.8, lids: 0.55, snarl: 0.9, mane: -0.12 }, 'out'],
    [0.33, { chest: [-0.15, -0.5, 0], shoulderR: [hi * 0.55, 0, -0.7], elbowR: [0.1, 0, 0], wristR: [0.25, 0, 0], neck: [0.1, -0.3, 0], jaw: [0.9, 0, 0], bodyZ: 0.3 * K, bodyP: 0.02, bodyY: -0.03 * K, bodyW: -0.12, snarl: 1.0, lids: 0.8, mane: 0.1 }, 'cub'],
    [0.46, { chest: [-0.05, -0.38, 0], shoulderR: [-0.7, 0, -0.45], elbowR: [0.3, 0, 0], neck: [0.1, -0.25, 0], jaw: [0.3, 0, 0], bodyZ: 0.22 * K, bodyW: -0.08, snarl: 0.4 }, 'out'],
  ], { swing: 0.22, hit: 0.33, recover: 0.48 });
  // ---- swipe (bear / elephant swat): heavy two-handed sweep
  const s1 = big ? 0.42 : 0.3, s2 = big ? 0.58 : 0.44;
  C.swipe = clip('swipe', big ? 1.25 : 1.1, [
    [0, {}],
    [s1, { chest: [-0.5 * up, 0.4, 0], shoulderL: [-1.7 * (big ? 0.35 : 1), 0, 0.55], shoulderR: [-1.15, 0, 0.35], neck: [-0.3, 0.35, 0], head: [-0.18, 0, 0], jaw: [0.6, 0, 0], bodyP: -0.2 * up, bodyZ: -0.16 * K, hp: 0.15, kn: 0.2, ears: -0.8, lids: 0.5, snarl: 0.9, trunk1: [-0.7, 0.7, 0], trunk2: [-0.5, 0.6, 0], trunk3: [-0.4, 0.5, 0] }, 'out'],
    [s2, { chest: [-0.12, -0.6, 0], shoulderL: [-0.95, 0, -0.8], shoulderR: [-0.75, 0, -0.55], neck: [0.14, -0.5, 0], jaw: [0.15, 0, 0], bodyZ: 0.34 * K, bodyP: 0.06, bodyW: -0.16, lids: 0.8, snarl: 0.9, trunk1: [-0.1, -1.1, 0], trunk2: [-0.1, -1.0, 0], trunk3: [-0.1, -0.8, 0] }, 'cub'],
    [big ? 0.85 : 0.68, { chest: [0, -0.26, 0], bodyZ: 0.18 * K, bodyW: -0.06 }, 'out'],
  ], { swing: s1, hit: s2, recover: big ? 0.85 : 0.68 });
  C.swat = C.swipe;
  // ---- maul: rear back, bite, double rake, bite again
  C.maul = clip('maul', 1.3, [
    [0, {}],
    [0.24, { neck: [-0.5, 0, 0], head: [-0.35, 0, 0], jaw: [1.0, 0, 0], chest: [-0.36, 0, 0], shoulderL: [-1.3, 0, 0.35], shoulderR: [-1.3, 0, -0.35], bodyP: -0.2, bodyZ: -0.14 * K, bodyY: 0.04 * K, hp: 0.2, kn: 0.3, ears: -0.9, lids: 0.6, snarl: 1.0, mane: -0.2 }, 'out'],
    [0.38, { neck: [0.5, 0, 0], head: [0.25, 0, 0], jaw: [0.0, 0, 0], chest: [0.15, 0, 0], shoulderL: [-0.65, 0, -0.45], shoulderR: [-0.65, 0, 0.45], bodyP: 0.1, bodyZ: 0.4 * K, bodyY: -0.05 * K, lids: 0.85, snarl: 0.9, mane: 0.14 }, 'cub'],
    [0.64, { neck: [0.14, 0.4, 0], chest: [-0.14, 0.45, 0], shoulderL: [-1.35, 0, 0.4], shoulderR: [-0.35, 0, 0], bodyZ: 0.28 * K, jaw: [0.5, 0, 0] }, 'io'],
    [0.8, { neck: [0.14, -0.4, 0], chest: [-0.05, -0.45, 0], shoulderL: [-0.5, 0, -0.55], bodyZ: 0.36 * K, jaw: [0.2, 0, 0] }, 'cub'],
    [0.92, { neck: [0.4, 0, 0], jaw: [0.0, 0, 0], chest: [0.1, 0, 0], bodyZ: 0.3 * K, snarl: 0.3 }, 'out'],
  ], { swing: 0.24, hit: 0.38, recover: 0.82 });
  // ---- gore (boar): back up, head up and back (anticipation), drive the head down and hook it up and out, toss
  C.gore = clip('gore', 0.9, [
    [0, {}],
    [0.17, { neck: [-0.35, 0, 0], head: [-0.2, 0, 0], jaw: [0.2, 0, 0], chest: [-0.05, 0, 0], bodyZ: -0.16 * K, bodyY: 0.03 * K, sh: 0.25, kn: 0.25, hp: 0.15, ears: -0.6, lids: 0.55, snarl: 0.5 }, 'out'],
    [0.26, { neck: [0.8, 0, 0], head: [0.55, 0, 0], chest: [0.12, 0, 0], bodyZ: 0.12 * K, bodyP: 0.1, bodyY: -0.08 * K, sh: 0.35, lids: 0.9 }, 'cub'],
    [0.38, { neck: [-0.7, 0.2, 0], head: [-0.55, 0, 0], chest: [-0.12, 0.1, 0], bodyZ: 0.38 * K, bodyP: -0.06, sh: -0.45, bodyY: 0.0 }, 'out'],
    [0.56, { neck: [-0.25, -0.15, 0], head: [-0.2, 0, 0], bodyZ: 0.26 * K }, 'out'],
  ], { swing: 0.17, hit: 0.28, recover: 0.52 });
  // ---- pounce: flat deep crouch (sim windup 0.38), explosive leap with stretched body, claws out, heavy crash and absorb
  C.pounce = clip('pounce', 1.5, [
    [0, {}],
    [0.34, { bodyY: -0.26 * sp.size, bodyP: 0.14, chest: [0.26, 0, 0], neck: [0.18, 0, 0], head: [-0.12, 0, 0], shoulderL: [0.6, 0, 0], shoulderR: [0.6, 0, 0], elbowL: [1.15, 0, 0], elbowR: [1.15, 0, 0], hipL: [-0.65, 0, 0], hipR: [-0.65, 0, 0], kneeL: [1.35, 0, 0], kneeR: [1.35, 0, 0], ankleL: [-0.55, 0, 0], ankleR: [-0.55, 0, 0], tail1: [-0.3, 0, 0], jaw: [0.3, 0, 0], ears: -0.9, lids: 0.6, snarl: 0.9, mane: -0.2 }, 'out'],
    [0.5, { bodyY: 0.55 * sp.size, bodyZ: 0.55 * sp.size, bodyP: -0.2, chest: [-0.24, 0, 0], neck: [-0.18, 0, 0], head: [0.05, 0, 0], jaw: [1.0, 0, 0], shoulderL: [-1.35, 0, 0.3], shoulderR: [-1.35, 0, -0.3], elbowL: [0.1, 0, 0], elbowR: [0.1, 0, 0], wristL: [0.45, 0, 0], wristR: [0.45, 0, 0], hipL: [0.8, 0, 0], hipR: [0.8, 0, 0], kneeL: [0.1, 0, 0], kneeR: [0.1, 0, 0], ankleL: [0.6, 0, 0], ankleR: [0.6, 0, 0], tail1: [0.35, 0, 0], lids: 0.35, snarl: 1.0, mane: 0.25 }, 'out'],
    [0.7, { bodyY: 0.1 * sp.size, bodyZ: 0.78 * sp.size, bodyP: 0.14, chest: [0.1, 0, 0], neck: [0.4, 0, 0], jaw: [0.2, 0, 0], shoulderL: [-1.05, 0, 0.35], shoulderR: [-1.05, 0, -0.35], elbowL: [0.2, 0, 0], elbowR: [0.2, 0, 0], hipL: [0.55, 0, 0], hipR: [0.55, 0, 0], lids: 0.9 }, 'in'],
    [0.86, { bodyY: -0.12 * sp.size, bodyZ: 0.68 * sp.size, bodyP: 0.14, chest: [0.16, 0, 0], neck: [0.24, 0, 0], jaw: [0, 0, 0], shoulderL: [-0.5, 0, 0.1], shoulderR: [-0.5, 0, -0.1], elbowL: [1.0, 0, 0], elbowR: [1.0, 0, 0], hipL: [-0.2, 0, 0], hipR: [-0.2, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.8, 0, 0], ankleL: [-0.2, 0, 0], ankleR: [-0.2, 0, 0], lids: 0.4 }, 'out'],
    [1.1, { bodyY: -0.04 * sp.size, bodyZ: 0.5 * sp.size, bodyP: 0.04 }, 'io'],
  ], { swing: 0.34, hit: 0.8, recover: 0.9, ground: 0.12, fi: 0.05 });
  // ---- roar: rear the chest up (bears and elephants stand on the hind legs), head back, jaw wide, mane flares, tremble (the animator adds the jaw vibration)
  const standUp = bear ? 1 : big ? 0.7 : lion ? 0.55 : 0.3;
  C.roar = clip('roar', big ? 2.0 : 1.6, [
    [0, {}],
    [big ? 0.55 : 0.32, { chest: [-0.36 * up * (0.8 + standUp * 0.5), 0, 0], neck: [-0.55, 0, 0], head: [-0.4, 0, 0], jaw: [big ? 0.3 : 1.1, 0, 0], bodyP: -0.12 * up - standUp * (bear ? 0.5 : 0.25), bodyY: 0.05 + standUp * 0.12 * K, sh: -0.5 * up - standUp * 0.7, el: standUp * 0.7, hp: standUp * 0.12, kn: standUp * 0.12, tail1: [-0.3, 0, 0], trunk1: [-0.95, 0, 0], trunk2: [-0.75, 0, 0], trunk3: [-0.55, 0, 0], trunk4: [-0.45, 0, 0], ears: big ? 0.0 : -0.8, earL: [0, 0.6, 0], earR: [0, -0.6, 0], lids: 0.6, snarl: 1.1, mane: 0.3 }, 'back'],
    [big ? 1.5 : 1.15, { chest: [-0.32 * up * (0.8 + standUp * 0.5), 0, 0], neck: [-0.5, 0, 0], head: [-0.36, 0, 0], jaw: [big ? 0.3 : 1.05, 0, 0], bodyP: -0.12 * up - standUp * (bear ? 0.5 : 0.25), bodyY: 0.05 + standUp * 0.12 * K, lids: 0.6, snarl: 1.1 }, 'lin'],
    [big ? 2.0 : 1.6, { chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], bodyP: 0, bodyY: 0, snarl: 0 }, 'io'],
  ], { swing: 0.3, hit: 0.5, recover: 1.1, fo: 0.35 });
  C.howl = clip('howl', 1.8, [[0, {}], [0.4, { neck: [-1.0, 0, 0], head: [-0.6, 0, 0], jaw: [0.5, 0, 0], chest: [-0.2, 0, 0], bodyP: -0.08, sh: -0.1, lids: 0.7, snarl: 0.35, ears: -0.4 }, 'out'], [1.4, { neck: [-1.0, 0, 0], head: [-0.6, 0, 0], jaw: [0.4, 0, 0], chest: [-0.2, 0, 0], bodyP: -0.08, lids: 0.8 }, 'lin'], [1.8, { neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], chest: [0, 0, 0] }, 'io']], { swing: 0.35, hit: 0.6, recover: 1.2, fo: 0.3 });
  // ---- boar / elephant: paw the ground (charge telegraph, loops while held), stomp
  C.paw = clip('paw', 0.5, [[0, { neck: [0.45, 0, 0], head: [0.35, 0, 0], shoulderR: [-0.2, 0, 0], lids: 0.6, ears: -0.7 }], [0.12, { shoulderR: [-1.15, 0, 0], elbowR: [0.6, 0, 0], neck: [0.55, 0, 0], head: [0.35, 0, 0], bodyP: 0.12, chest: [0.12, 0, 0] }, 'out'], [0.25, { shoulderR: [-0.1, 0, 0], elbowR: [0.1, 0, 0], neck: [0.55, 0, 0], head: [0.35, 0, 0], bodyP: 0.14, chest: [0.14, 0, 0] }, 'in'], [0.37, { shoulderR: [-1.15, 0, 0], elbowR: [0.6, 0, 0], bodyP: 0.12 }, 'out'], [0.5, { shoulderR: [-0.1, 0, 0], elbowR: [0.1, 0, 0], bodyP: 0.14 }, 'in']], { swing: 0.2, hit: 0.3, recover: 0.4, loop: true, fi: 0.1, fo: 0.2, add: false });
  C.stomp = clip('stomp', 1.5, [
    [0, {}],
    [0.5, { chest: [-0.5, 0, 0], bodyP: -0.28, bodyY: 0.14 * K, shoulderL: [-1.15, 0, 0.1], shoulderR: [-1.15, 0, -0.1], elbowL: [1.0, 0, 0], elbowR: [1.0, 0, 0], neck: [-0.35, 0, 0], head: [-0.25, 0, 0], trunk1: [-0.9, 0, 0], trunk2: [-0.7, 0, 0], trunk3: [-0.55, 0, 0], trunk4: [-0.45, 0, 0], hp: 0.2, kn: 0.1, ears: 0.0, earL: [0, 0.7, 0], earR: [0, -0.7, 0], lids: 0.4 }, 'out'],
    [0.64, { chest: [0.2, 0, 0], bodyP: 0.1, bodyY: -0.14 * K, bodyZ: 0.1 * K, shoulderL: [0.25, 0, 0], shoulderR: [0.25, 0, 0], elbowL: [0, 0, 0], elbowR: [0, 0, 0], neck: [0.2, 0, 0], head: [0.12, 0, 0], trunk1: [0.4, 0, 0], trunk2: [0.35, 0, 0], trunk3: [0.25, 0, 0], trunk4: [0.25, 0, 0], lids: 0.8 }, 'cub'],
    [0.82, { bodyY: -0.06 * K, chest: [0.05, 0, 0] }, 'out'],
  ], { swing: 0.45, hit: 0.62, recover: 0.85, ground: 0.2 });
  C.javelin = clip('javelin', 1.3, [[0, {}], [0.32, { riderArm: [-2.5, 0, 0], rider: [-0.28, 0, 0] }, 'out'], [0.5, { riderArm: [-0.2, 0, 0], rider: [0.38, 0, 0] }, 'cub']], { swing: 0.3, hit: 0.5, recover: 0.75 });
  // ---- reactions (hurt is additive on top of the spring flinch: a heavy recoil, one eye screwed shut, the tail whips)
  C.hurt = clip('hurt', 0.55, [[0, {}], [0.07, { chest: [-0.26, 0, 0], neck: [-0.3, 0, 0], head: [-0.26, 0, 0], jaw: [0.5, 0, 0], bodyZ: -0.12 * K, bodyY: -0.04 * K, tail1: [-0.4, 0.3, 0], lids: 1.1, snarl: 0.9, ears: -0.9, mane: -0.15, sh: 0.1, kn: 0.15 }, 'out'], [0.2, { chest: [-0.12, 0, 0], neck: [-0.14, 0, 0], head: [-0.1, 0, 0], jaw: [0.2, 0, 0], bodyZ: -0.05 * K, lids: 0.6 }, 'out']], { add: true, fi: 0.02, fo: 0.22 });
  C.stun = clip('stun', 1.2, [[0, { neck: [0.4, -0.55, 0], head: [0.32, 0, 0.18], chest: [0.12, 0, 0], jaw: [0.25, 0, 0], lids: 0.8, bodyY: -0.04 * K, kn: 0.15, sh: 0.1 }], [0.3, { neck: [0.4, 0.55, 0], head: [0.32, 0, -0.18] }, 'io'], [0.6, { neck: [0.4, -0.55, 0], head: [0.32, 0, 0.18] }, 'io'], [0.9, { neck: [0.4, 0.55, 0], head: [0.32, 0, -0.18] }, 'io'], [1.2, { neck: [0.4, -0.55, 0], head: [0.32, 0, 0.18] }, 'io']], { loop: true, hold: true, fi: 0.2, bodyY0: -0.05 });
  C.knockdown = clip('knockdown', 1.0, [[0, {}], [0.2, { bodyP: -0.3, bodyY: 0.1 * K, chest: [-0.34, 0, 0], neck: [-0.45, 0, 0], jaw: [0.7, 0, 0], shoulderL: [-0.9, 0, 0.5], shoulderR: [-0.9, 0, -0.5], hipL: [0.7, 0, 0], hipR: [0.7, 0, 0], lids: 1.0 }, 'out'], [0.5, { bodyP: 0.0, bodyY: -0.18 * K, bodyR: 0.55, chest: [0, 0, 0.1], neck: [0.2, 0, 0], jaw: [0.2, 0, 0], shoulderL: [-0.4, 0, 0.6], shoulderR: [-0.4, 0, -0.6], hipL: [0.4, 0, 0.3], hipR: [0.4, 0, -0.3], lids: 0.9 }, 'in'], [0.62, { bodyY: -0.15 * K }, 'out'], [1.0, { bodyR: 0.55, bodyY: -0.2 * K, neck: [0.25, 0, 0], jaw: [0.15, 0, 0], shoulderL: [-0.4, 0, 0.6], shoulderR: [-0.4, 0, -0.6], hipL: [0.4, 0, 0.3], hipR: [0.4, 0, -0.3], lids: 0.6 }, 'lin']], { hold: true, ground: 0.2 });
  C.getup = clip('getup', 0.95, [[0, { bodyR: 0.55, bodyY: -0.2 * K, neck: [0.25, 0, 0], shoulderL: [-0.4, 0, 0.6], shoulderR: [-0.4, 0, -0.6], hipL: [0.4, 0, 0.3], hipR: [0.4, 0, -0.3], lids: 0.6 }], [0.42, { bodyR: 0.1, bodyY: -0.2 * K, shoulderL: [-0.9, 0, 0], shoulderR: [-0.9, 0, 0], hipL: [0.55, 0, 0], hipR: [0.55, 0, 0], neck: [0.15, 0, 0], lids: 0.3 }, 'io'], [0.95, { bodyR: 0, bodyY: 0, shoulderL: [0, 0, 0], shoulderR: [0, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0], neck: [0, 0, 0], lids: 0 }, 'io']], { fi: 0.03 });
  // death: a staggering step, the forelegs fold, the hindquarters sag, the body topples with a bounce, one last shudder; the eyes close
  const d = big ? 1.35 : 1;
  C.death = clip('death', big ? 3.0 : 2.1, [
    [0, {}],
    [0.18 * d, { chest: [-0.3, 0, 0], neck: [-0.4, 0, 0], head: [-0.3, 0, 0], jaw: [0.8, 0, 0], bodyZ: -0.2 * K, bodyY: 0.0, tail1: [-0.5, 0, 0], lids: 1.0, snarl: 0.8, ears: -0.9, sh: 0.2 }, 'out'],
    [0.5 * d, { bodyY: -0.16 * K, bodyP: 0.08, chest: [0.1, 0, 0], neck: [0.2, 0, 0], head: [0.18, 0, 0], jaw: [0.5, 0, 0], shoulderL: [0.5, 0, 0.1], shoulderR: [0.5, 0, -0.1], elbowL: [1.3, 0, 0], elbowR: [1.3, 0, 0], wristL: [0.4, 0, 0], wristR: [0.4, 0, 0], hp: 0.25, kn: 0.35, lids: 1.2, snarl: 0.2, ears: -0.5 }, 'in'],
    [0.9 * d, { bodyY: -0.36 * K, bodyP: 0.2, chest: [0.12, 0, 0], neck: [0.4, 0, 0], head: [0.34, 0, 0], jaw: [0.4, 0, 0], shoulderL: [0.5, 0, 0.1], shoulderR: [0.5, 0, -0.1], elbowL: [1.4, 0, 0], elbowR: [1.4, 0, 0], hipL: [-0.7, 0, 0.1], hipR: [-0.7, 0, -0.1], kneeL: [1.35, 0, 0], kneeR: [1.35, 0, 0], ankleL: [-0.6, 0, 0], ankleR: [-0.6, 0, 0], lids: 1.3 }, 'in'],
    [1.35 * d, { bodyY: -0.46 * K, bodyP: 0.06, bodyR: 1.5, chest: [0.05, 0, 0.1], neck: [0.3, 0.3, 0], head: [0.25, 0, 0], jaw: [0.3, 0, 0], shoulderL: [-0.7, 0, 0.9], shoulderR: [0.7, 0, -0.7], elbowL: [0.4, 0, 0], elbowR: [0.5, 0, 0], hipL: [0.5, 0, 0.5], hipR: [-0.5, 0, -0.4], kneeL: [0.4, 0, 0], kneeR: [0.5, 0, 0], ankleL: [0.2, 0, 0], ankleR: [0.2, 0, 0], tail1: [0, 0.3, 0] }, 'cub'],
    [1.5 * d, { bodyY: -0.4 * K, bodyR: 1.45, jaw: [0.34, 0, 0] }, 'out'],
    [1.75 * d, { bodyY: -0.47 * K, bodyR: 1.5, jaw: [0.25, 0, 0], shoulderL: [-0.75, 0, 0.95], shoulderR: [0.75, 0, -0.75], tail1: [0.1, 0.4, 0] }, 'io'],
    [(big ? 3.0 : 2.1), { bodyY: -0.48 * K, bodyR: 1.5, jaw: [0.2, 0, 0], neck: [0.32, 0.3, 0], shoulderL: [-0.75, 0, 0.95], shoulderR: [0.75, 0, -0.75], tail1: [0, 0.4, 0] }, 'out'],
  ], { hold: true, ground: 0.25, fi: 0.05, swing: 0, hit: 0, recover: 1 });
  C.victory = clip('victory', 1.7, [[0, {}], [0.45, { chest: [-0.34 * up, 0, 0], neck: [-0.5, 0, 0], head: [-0.34, 0, 0], jaw: [big ? 0.3 : 1.0, 0, 0], bodyP: -0.1 * up - standUp * 0.2, sh: -0.35 * up, trunk1: [-0.95, 0, 0], trunk2: [-0.75, 0, 0], mane: 0.3, lids: 0.4, snarl: 0.5 }, 'back'], [1.7, { chest: [-0.22 * up, 0, 0], neck: [-0.4, 0, 0], head: [-0.25, 0, 0], jaw: [0.2, 0, 0], bodyP: -0.06 * up, sh: -0.2 * up, mane: 0.15 }, 'io']], { hold: true });
  // alias gladiator clip names so generic fightview code never breaks
  C.attack1 = id === 'wolf' || boar ? C.bite : bear || big ? C.swipe : C.claw; C.attack2 = boar ? C.gore : C.bite; C.attack3 = bear ? C.maul : (lion ? C.maul : C.bite);
  C.block = C.hurt; C.taunt = C.roar; C.cheer = C.roar; C.idle = null;
  return C;
}

// ------------------------------------------------------------------ the builder
// tiers: seg radial segments, sub samples per control span, cap rounded cap rings, sw / sh sphere detail, mane strand cards, shells fur shell layers, claws / teeth / whisk / tufts / lids counts.
// low keeps the old budget (about 1000 triangles per animal), medium and high spend the headroom on anatomy, strand cards and fur shells.
const DETAIL = {
  low: { seg: 4, sub: 1, cap: 1, sw: 5, sh: 3, mane: 24, mseg: 2, shells: 0, claws: 0, teeth: 0, whisk: 0, tufts: 0, lids: 0, detailEye: 0, ruff: 0, face: 0 },
  medium: { seg: 7, sub: 2, cap: 1, sw: 8, sh: 5, mane: 90, mseg: 3, shells: 0, claws: 2, teeth: 4, whisk: 3, tufts: 8, lids: 1, detailEye: 1, ruff: 1, face: 1 },
  high: { seg: 10, sub: 2, cap: 2, sw: 12, sh: 8, mane: 300, mseg: 4, shells: 3, claws: 3, teeth: 4, whisk: 5, tufts: 16, lids: 1, detailEye: 1, ruff: 2, face: 2 },
};

const GEO_CACHE = new Map();
export function beastKindOf(x) { const g = x && (x.g || x); return (g && (g.beast || (x.beast))) || (x && x.style) || 'lion'; }

/** unitOrRecord: arena unit ({g}) or a beast record from LM.makeBeast. opts: {detail, scale, kind, look} */
export function createBeast(unitOrRec, opts = {}) {
  const g = (unitOrRec && unitOrRec.g) || unitOrRec || {}, kind = opts.kind || g.beast || (unitOrRec && unitOrRec.beast) || 'lion', sp0 = SPECIES[kind] || LION;
  const dname0 = opts.detail !== undefined && opts.detail !== null ? opts.detail : detailFor({}), dname = dname0 === 'low' || dname0 === 0 ? 'low' : dname0 === 'medium' || dname0 === 1 ? 'medium' : 'high', DT = DETAIL[dname];
  const look = Object.assign({ coat: 0.5, mane: 0.5, scar: 0.5 }, g.look || {}, opts.look || {});
  const S = sp0.size, sp = sp0, SS = (v) => v * S, big = kind === 'elephant', LOW = dname === 'low';
  const seedId = String((g && (g.id !== undefined ? g.id : g.name)) || kind); let seed = 0; for (let i = 0; i < seedId.length; i++) seed = (seed * 31 + seedId.charCodeAt(i)) % 9973;
  const root = new THREE.Group(); root.name = kind; const body = new THREE.Group(); body.name = 'body'; root.add(body);
  const J = {}, rest = new Map(); rest.set(root, new V3()); rest.set(body, new V3());
  const mk = (n, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = n; o.position.set(x, y, z); parent.add(o); J[n] = o; rest.set(o, rest.get(parent).clone().add(new V3(x, y, z))); return o; };
  // --- derived heights so the paws stand on y = 0
  const F = sp.front, H = sp.hind, T = sp.torso, HS = sp.head;
  const chestY = SS(F.pad - (F.sy + F.up[0] + F.lo[0])), hipsY = SS(H.pad - (H.hy + H.up[0] + H.lo[0]));
  mk('hips', body, 0, hipsY, SS(T.hipsZ));
  mk('spine', J.hips, 0, (chestY - hipsY) / 2, SS(T.chestZ - T.hipsZ) / 2); mk('chest', J.spine, 0, (chestY - hipsY) / 2, SS(T.chestZ - T.hipsZ) / 2);
  mk('neck', J.chest, 0, SS(sp.neck[0]), SS(sp.neck[1])); mk('head', J.neck, 0, SS(sp.hd[0]), SS(sp.hd[1]));
  mk('jaw', J.head, 0, SS(sp.jawAt[0]), SS(sp.jawAt[1]));
  const E = sp.earAt; mk('earL', J.head, SS(E[0]), SS(E[1]), SS(E[2])); mk('earR', J.head, -SS(E[0]), SS(E[1]), SS(E[2]));
  const eyeP = big ? [0.29, 0.07, 0.2] : [HS.sk[0] * 0.58, HS.sk[1] * 0.4, HS.sk[2] * 0.92];
  const cat = kind === 'lion' || kind === 'nemean', ER = kind === 'bear' || kind === 'boar' ? 0.02 : kind === 'wolf' ? 0.021 : 0.026, FDROP = kind === 'boar' ? 0.5 : kind === 'wolf' ? 0.3 : 0.24, tipY = -HS.sk[1] * FDROP, tipZ = HS.sk[2] + HS.sn[2], FWIDE = kind === 'wolf' ? 1.2 : kind === 'boar' ? 1.1 : 1.32;
  for (const [s, sg] of [['L', 1], ['R', -1]]) { mk('eye' + s, J.head, sg * SS(eyeP[0]), SS(eyeP[1]), SS(eyeP[2])); mk('lid' + s, J.head, sg * SS(eyeP[0]), SS(eyeP[1]), SS(eyeP[2])); }
  for (const [s, sg] of [['L', 1], ['R', -1]]) {   // brow bones (frown) and, on the animals, lip bones (snarl); the brow pivots just above the eye
    if (big) mk('brow' + s, J.head, sg * SS(eyeP[0] * 0.95), SS(eyeP[1] + 0.07), SS(eyeP[2] - 0.004)); else { mk('brow' + s, J.head, sg * SS(eyeP[0] * 0.95), SS(eyeP[1] + ER * 1.6), SS(eyeP[2] - 0.004)); mk('lip' + s, J.head, sg * SS(HS.sn[0] * FWIDE * 0.74), SS(tipY * 0.7 + HS.sn[1] * 0.1), SS(HS.sk[2] + HS.sn[2] * 0.5)); }
  }
  if (!big) { mk('mane1', J.neck, 0, 0, 0); mk('mane2', J.chest, 0, 0, 0); }
  let tp = J.hips; const TL = sp.tail;
  for (let i = 0; i < 3; i++) { tp = mk('tail' + (i + 1), tp, i === 0 ? SS(TL.at[0]) : 0, i === 0 ? SS(TL.at[1]) : -SS(0.02), i === 0 ? SS(TL.at[2]) : -SS(TL.len)); }
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    mk('shoulder' + s, J.chest, sg * SS(F.dx), SS(F.sy), SS(F.sz)); mk('elbow' + s, J['shoulder' + s], 0, SS(F.up[0]), SS(F.up[1])); mk('wrist' + s, J['elbow' + s], 0, SS(F.lo[0]), SS(F.lo[1]));
    mk('hip' + s, J.hips, sg * SS(H.dx), SS(H.hy), SS(H.hz)); mk('knee' + s, J['hip' + s], 0, SS(H.up[0]), SS(H.up[1])); mk('ankle' + s, J['knee' + s], 0, SS(H.lo[0]), SS(H.lo[1]));
  }
  if (sp.trunk) { let p = J.head; for (let i = 1; i <= 4; i++) p = mk('trunk' + i, p, 0, i === 1 ? -SS(0.18) : -SS(0.42), i === 1 ? SS(0.38) : SS(0.08)); }
  if (sp.rider) { mk('rider', J.chest, 0, SS(0.78) + SS(0.35), -SS(0.15)); mk('riderArm', J.rider, -SS(0.2), SS(0.5), SS(0.04)); mk('flag1', J.spine, SS(0.4), SS(2.1), -SS(0.62)); mk('flag2', J.spine, -SS(0.4), SS(2.1), -SS(0.62)); }
  const bones = JN.filter((n) => J[n]).map((n) => J[n]), bIdx = {}; bones.forEach((b, i) => { bIdx[b.name] = i; });

  // --- materials (per rig so flash / blood never leak)
  const bu = makeBloodUniforms(), mats = {};
  mats.fur = furMaterial(kind, bu, big ? 'leather' : 'cloth', { low: LOW }); mats.fur.name = 'fur';
  if (DT.shells && !big) { mats.shell = furMaterial(kind, bu, 'cloth', { shell: true }); mats.shell.name = 'shell'; }
  if (!big) { mats.mane = furMaterial(kind, bu, 'cloth', { ds: true, low: LOW }); mats.mane.name = 'mane'; }
  mats.bone = plainMat(0xffffff, 'trim', 0.5, 0.04, bu, true); mats.bone.name = 'bone';
  mats.eye = plainMat(0xffffff, 'eye', 0.18, 0, bu, false, { glow: sp.gold ? 0x6a3a00 : kind === 'lion' ? 0x1a0e00 : 0x000000 }); mats.eye.name = 'eye';
  if (sp.rider) {
    mats.leather = plainMat(0xffffff, 'leather', 0.7, 0.05, bu, true, { ds: true }); mats.leather.name = 'leather'; mats.cloth = plainMat(0xffffff, 'cloth', 0.9, 0, bu, true, { ds: true }); mats.cloth.name = 'cloth';
    mats.skin = plainMat(0xffffff, 'skin', 0.55, 0, bu, true); mats.skin.name = 'skin'; mats.metal = plainMat(0xffffff, 'metal', 0.38, 0.85, bu, false, { ds: true }); mats.metal.name = 'metal';
    mats.flag = plainMat(0xffffff, 'cloth', 0.85, 0, bu, true, { ds: true }); mats.flag.name = 'flag';
  }
  const items = [], shells = [], tint = (look.coat - 0.5) * 0.22;
  const FUR = hexC(sp.fur).offsetHSL(0, 0, tint * 0.6), BEL = hexC(sp.belly).offsetHSL(0, 0, tint * 0.4), DK = hexC(sp.dark), MANE = hexC(sp.mane).offsetHSL((look.mane - 0.5) * 0.03, 0, (look.mane - 0.5) * 0.1), NOSE = hexC(sp.nose), MUZ = hexC(sp.muz || sp.belly), EYE = hexC(sp.eye);
  const jp = (n) => rest.get(J[n]), P3 = (n, x = 0, y = 0, z = 0) => [jp(n).x + x, jp(n).y + y, jp(n).z + z];
  const addRigid = (mat, geo, jn) => { if (!J[jn]) throw new Error('beast joint ' + jn); if (!geo.attributes.color) setColor(geo, flat('#ffffff')); items.push({ mat, geo, bone: bIdx[jn] }); return geo; };
  const addSkin = (mat, geo, skin) => { if (!geo.attributes.color) setColor(geo, flat('#ffffff')); items.push({ mat, geo, skin }); return geo; };
  /** skinned loft: knots [[jointName, controlParam], ...]; shell registers the loft for the fur shell layers */
  const addLoft = (mat, ctrl, o, knots, bz, colorFn, shell) => {
    const kn = knots.map(([n, s]) => [bIdx[n], s]); const geo = loft(ctrl, Object.assign({ seg: DT.seg, sub: DT.sub, cap: DT.cap }, o)); setColor(geo, colorFn); addSkin(mat, geo, skinKnots(geo, kn, bz));
    if (shell && DT.shells) shells.push({ ctrl, o: Object.assign({ seg: 7, sub: 1, cap: 1 }, o), kn, bz, colorFn, infl: shell });
    return geo;
  };
  /** a rigid piece that follows two bones (weight to A from fn(x,y,z)) */
  const addSkin2 = (mat, geo, a, b, fn) => { const n = geo.attributes.position.count, I = new Uint16Array(n * 4), W = new Float32Array(n * 4), P = geo.attributes.position; for (let i = 0; i < n; i++) { const w = clamp(fn(P.getX(i), P.getY(i), P.getZ(i)), 0, 1); I[i * 4] = bIdx[a]; W[i * 4] = w; I[i * 4 + 1] = bIdx[b]; W[i * 4 + 1] = 1 - w; } return addSkin(mat, geo, { i: I, w: W }); };
  const abs = (geo, jn, p, r, s) => { place(geo, [p[0] + jp(jn).x, p[1] + jp(jn).y, p[2] + jp(jn).z], r, s); return geo; };
  const CARD = mats.mane ? 'mane' : 'fur';
  const bladesTo = (mat, bl) => { const g2 = bl.build(); if (g2) { const sk = g2.userData.skin; delete g2.userData.skin; addSkin(mat, g2, sk); } };
  const furCol = (belly = 1, saddle = 0.1, ao = 0.2) => (x, y, z, nx, ny) => { const b = sm(0.1, -0.85, ny) * belly; const c = mix(FUR, BEL, b); const k = 1 - saddle * sm(0.4, 1, ny) - ao * sm(0.2, 0.9, -ny) * (1 - belly * 0.5); return c.clone().multiplyScalar(k); };
  const limbCol = (sockY, amt, dark = DK, belly = 0.12) => (x, y, z, nx, ny) => { const c = mix(FUR, BEL, sm(0.1, -0.85, ny) * belly); return mix(c, dark, sm(sockY, sockY * 0.35, y) * amt).multiplyScalar(1 - 0.12 * sm(0.2, 0.9, -ny)); };
  const WL = Math.max(1, S), dir = new V3();
  // geometry cache: the merged skinned geometry of a (species, tier, coat) is built once and shared by every rig of it (3 wolves, 2 boars, the same lion in the next hunt)
  const ckey = kind + '|' + dname + '|' + look.coat.toFixed(2) + '|' + look.mane.toFixed(2), cached = GEO_CACHE.get(ckey);
  if (cached) { GEO_CACHE.delete(ckey); GEO_CACHE.set(ckey, cached); }
  if (!cached) {
  // ---- torso: one continuous skin from the rump to the chest, blended over the three spine bones
  const hz = jp('hips').z, hy = jp('hips').y, cz = jp('chest').z, cy = jp('chest').y, span = cz - hz, axY = (t) => hy + (cy - hy) * t, axZ = (t) => hz + span * t;
  const rr = (a, m = 1) => [SS(a[0]) * m, SS(a[1]) * m], wst = T.waist || 1;
  const hump = sp.hump ? 1 : 0, boarB = kind === 'boar' ? 1 : 0;
  const TR = [
    [-0.3, 0.0, rr(T.rump, 0.62)], [0.0, 0.0, rr(T.rump, 1)], [0.27, 0.0, [SS(T.mid[0]) * 0.97, SS(T.mid[1]) * wst]], [0.5, 0.0, rr(T.mid)], [0.77, -0.01 * S, [SS(T.chest[0]) * 0.99, SS(T.chest[1]) * 0.98]],
    [1.0, hump * 0.06 * S + boarB * 0.03 * S - 0.015 * S, [SS(T.chest[0]), SS(T.chest[1]) * (1 + hump * 0.12 + boarB * 0.06)]], [1.26, hump * 0.02 * S, rr(T.chest, 0.8)],
  ].map(([t, dy, r]) => ({ p: [0, axY(t) + dy, axZ(t)], r }));
  addLoft('fur', TR, {}, [['hips', 1], ['spine', 3], ['chest', 5]], 0.9, furCol(1, 0.1, 0.28), 0.012 * S);
  // shoulder and haunch masses (muscle) so the legs grow out of the body
  if (!LOW) for (const sg of [1, -1]) {
    const s = sg > 0 ? 'L' : 'R', sb = blob(SS(F.r[0]) * 1.05, SS(F.r[0]) * 1.3, SS(F.r[0]) * 1.35, DT.sw, DT.sh); setColor(sb, furCol(0.2, 0.05, 0.15)); abs(sb, 'shoulder' + s, [sg * SS(-0.005), SS(0.05), SS(-0.01)]); addSkin2('fur', sb, 'shoulder' + s, 'chest', (x, y) => sm(jp('shoulder' + s).y - SS(0.02), jp('shoulder' + s).y + SS(0.12), y) * 0.5 + 0.5 * sm(jp('shoulder' + s).y - SS(0.06), jp('shoulder' + s).y - SS(0.14), y));
    const hb = blob(SS(H.r[0]) * 0.7, SS(H.r[0]) * 1.0, SS(H.r[0]) * 1.1, DT.sw, DT.sh); setColor(hb, furCol(0.2, 0.05, 0.15)); abs(hb, 'hip' + s, [sg * SS(0.01), SS(0.03), SS(-0.015)]); addSkin2('fur', hb, 'hip' + s, 'hips', (x, y) => sm(jp('hip' + s).y + SS(0.02), jp('hip' + s).y - SS(0.1), y) * 0.65 + 0.35 * sm(jp('hip' + s).y + SS(0.16), jp('hip' + s).y + SS(0.03), y));
  }
  // ---- neck: chest -> neck -> head, one skin
  const nbr = big ? [0.42, 0.44] : [HS.sk[0] * (kind === 'wolf' ? 1.25 : 1.45), HS.sk[1] * (kind === 'wolf' ? 1.4 : 1.6)], ntr = big ? [0.4, 0.4] : [HS.sk[0] * 1.0, HS.sk[1] * 1.04];
  { const a = jp('neck'), b = jp('head'); addLoft('fur', [
      { p: P3('chest', 0, SS(0.0), -SS(0.1)), r: [SS(nbr[0]) * 1.02, SS(nbr[1]) * 0.95] }, { p: [a.x, a.y, a.z], r: [SS(nbr[0]), SS(nbr[1])] },
      { p: [(a.x + b.x) / 2, (a.y + b.y) / 2 + SS(0.005), (a.z + b.z) / 2], r: [SS((nbr[0] + ntr[0]) / 2), SS((nbr[1] + ntr[1]) / 2)] }, { p: [b.x, b.y, b.z + SS(0.03)], r: [SS(ntr[0]), SS(ntr[1])] }], { caps: [false, false] }, [['chest', 0], ['neck', 1], ['head', 3]], 0.8, furCol(0.5, 0.1, 0.2), 0.012 * S); }
  // ---- head (cranium and muzzle are one lofted wedge), jaw, nose, eyes, lids, brows, ears, teeth, whiskers
  const sk = HS.sk, sn = HS.sn, hj = jp('head'), HP = (x, y, z) => [hj.x + x * S, hj.y + y * S, hj.z + z * S];
  if (!big) {
    const wide = FWIDE;
    const headCtrl = [
      { p: HP(0, 0, -0.04), r: [SS(sk[0] * 0.8), SS(sk[1] * 0.85)] }, { p: HP(0, 0.005, sk[2] * 0.32), r: [SS(sk[0]), SS(sk[1] * (kind === 'bear' ? 1.05 : 1))] }, { p: HP(0, -0.004, sk[2] * 0.72), r: [SS(sk[0] * 0.94), SS(sk[1] * 0.92)] },
      { p: HP(0, tipY * 0.6 - 0.01, sk[2] + sn[2] * 0.14), r: [SS(sn[0] * wide), SS(sn[1] * 1.28)] }, { p: HP(0, tipY * 0.85, sk[2] + sn[2] * 0.62), r: [SS(sn[0] * (wide * 0.92)), SS(sn[1] * (kind === 'boar' ? 1.0 : 1.12))] }, { p: HP(0, tipY, tipZ), r: [SS(sn[0] * (kind === 'boar' ? 1.05 : 0.95)), SS(sn[1] * (kind === 'boar' ? 0.95 : 0.9))] },
    ];
    const hdCol = (x, y, z, nx, ny, nz) => { const lz = (z - hj.z) / S, lx = Math.abs(x - hj.x) / S; let c = mix(FUR, BEL, sm(0.0, -0.9, ny) * 0.55); c = mix(c, MUZ, sm(sk[2] * 0.95, sk[2] + sn[2] * 0.5, lz) * (kind === 'boar' ? 0.35 : 0.8)); if (kind === 'wolf') c = mix(c, DK, sm(0.1, 0.9, ny) * sm(sk[2] * 0.7, sk[2] + sn[2] * 0.7, lz) * 0.55 * (1 - sm(0.02, 0.05, lx))); if (kind === 'lion' || kind === 'nemean') c = mix(c, DK, sm(0.2, 1, ny) * sm(0.0, 0.12, (y - hj.y) / S) * 0.0); const ly = (y - hj.y) / S, ex0 = eyeP[0], d = Math.hypot(lx - ex0, ly - eyeP[1], lz - eyeP[2]) / ER; c = mix(c, DK, sm(3.4, 1.3, d) * 0.55);   // the eye socket darkens the skull around the eye
      if (cat || kind === 'wolf') c = mix(c, DK, sm(ER * 0.7, ER * 0.2, Math.abs(lx - ex0 * 0.7)) * sm(eyeP[1] - ER * 5.2, eyeP[1] - ER * 1.2, ly) * sm(eyeP[1] - ER * 0.7, eyeP[1] - ER * 1.5, ly) * sm(eyeP[2] - ER * 1.2, eyeP[2] - ER * 0.2, lz) * 0.5);   // tear stripe
      return c.multiplyScalar(1 - 0.12 * sm(0.2, 0.9, -ny)); };
    addLoft('fur', headCtrl, { caps: [true, true], cap: Math.max(1, DT.cap) }, [['head', 0]], 0.5, hdCol, 0);
    // ---- sculpted face. HL(x, y, z) = absolute rest position from head-local units (x S). FC: 0 low, 1 medium, 2 high.
    // brow ridge over a dark eye socket (hinged on the brow bone, frowns on a snarl), nose bridge, nose leather with nostrils and a philtrum, upper lip flaps on the lip bones over a gum strip and the fangs,
    // a lower jaw with a lip line. A snarl rolls the flaps outward and up (teeth show), a roar opens the jaw.
    const FC = DT.face, HL = (x, y, z) => [hj.x + x * S, hj.y + y * S, hj.z + z * S], ex = eyeP[0], ey = eyeP[1], ez = eyeP[2];
    const ringAt = (z) => { // interpolate the head loft rings: centre y, half width and half height at rest-space z
      const R = headCtrl; let i = 0; while (i < R.length - 2 && z > R[i + 1].p[2]) i++; const a = R[i], b = R[i + 1], t = clamp((z - a.p[2]) / Math.max(1e-5, b.p[2] - a.p[2]), 0, 1);
      return { y: a.p[1] + (b.p[1] - a.p[1]) * t, rx: a.r[0] + (b.r[0] - a.r[0]) * t, ry: a.r[1] + (b.r[1] - a.r[1]) * t };
    };
    const gumAt = (x, z) => { const r = ringAt(z), q = clamp(Math.abs(x) / r.rx, 0, 0.98); return r.y - r.ry * Math.sqrt(1 - q * q) * 0.95; };
    const lipY = tipY - sn[1] * 0.95;
    for (const sg of [1, -1]) {
      const s = sg > 0 ? 'L' : 'R', eyeW = jp('eye' + s);
      // brow ridge: a heavy tapered tube arched over the eye, lying on the skull surface (slopes down toward the temple, which reads as a scowl)
      { const rb = ER * (kind === 'boar' ? 0.85 : 1.15), sf = (x, z) => { const r = ringAt(z); return r.y + r.ry * Math.sqrt(1 - Math.pow(clamp(x / r.rx, 0, 0.985), 2)); }, zi = hj.z + SS(ez + ER * 1.3), zm = hj.z + SS(ez + ER * 0.1), zo = hj.z + SS(ez - ER * 1.7), xi = SS(ex * 0.3), xm = SS(ex * 1.0), xo = SS(ex * 1.32);
        const bpts = [{ p: [hj.x + sg * xi, sf(xi, zi) + SS(ER * 0.15), zi], r: SS(rb * 0.7) }, { p: [hj.x + sg * xm, Math.max(sf(xm, zm), hj.y + SS(ey)) + SS(ER * 1.25), zm], r: SS(rb) }, { p: [hj.x + sg * xo, sf(xo, zo) + SS(ER * 0.5), zo], r: SS(rb * 0.55) }];
        if (FC) { const br = loft(bpts, { seg: FC > 1 ? 7 : 5, sub: FC > 1 ? 2 : 1, cap: 1 }); setColor(br, (x, y, z, nx, ny) => mix(mix(FUR, DK, 0.5), FUR, 0.3 * sm(0.3, 1, ny))); addRigid('fur', br, 'brow' + s); }
        else { const br = blob(SS(ER * 2.2), SS(ER * 0.95), SS(ER * 1.6), 5, 3); setColor(br, (x, y, z, nx, ny) => mix(FUR, DK, 0.5)); place(br, [bpts[1].p[0], bpts[1].p[1], bpts[1].p[2]], [0, 0, sg * -0.3]); addRigid('fur', br, 'brow' + s); } }
      // eye socket: a dark hollow that rims the eyeball, set a little behind it
      if (FC) { const so = blob(SS(ER * 1.7), SS(ER * 1.4), SS(ER * 1.2), 7, 4); setColor(so, (x, y, z, nx, ny) => mix(mix(DK, hexC('#120905'), 0.55), FUR, 0.2 * sm(0.2, 1, ny))); place(so, [eyeW.x + sg * SS(ER * 0.15), eyeW.y - SS(ER * 0.1), eyeW.z - SS(ER * 0.5)]); addRigid('fur', so, 'head'); }
      // cheek mound under the eye
      if (FC && (cat || kind === 'bear')) { const ck = blob(SS(sk[0] * 0.3), SS(sk[1] * 0.36), SS(sk[2] * 0.36), 7, 4); setColor(ck, (x, y, z, nx, ny) => mix(FUR, BEL, 0.3 + 0.2 * sm(0, -1, ny))); place(ck, HL(sg * sk[0] * 0.8, -sk[1] * 0.22, sk[2] * 0.6)); addRigid('fur', ck, 'head'); }
      // upper lip: a flap on the lip bone that wraps the lower side of the muzzle, and a dark lip edge along the muzzle's lower margin (a snarl rolls the flap outward and up)
      if (FC && kind !== 'boar') {
        const lp = jp('lip' + s), zf = hj.z + SS(sk[2] + sn[2] * 0.48), rF = ringAt(zf), qx = 0.72 * rF.rx, flap = blob(SS(sn[0] * 0.24), SS(sn[1] * 0.46), SS(sn[2] * 0.48), 7, 4);
        setColor(flap, (x, y, z, nx, ny) => mix(mix(MUZ, BEL, 0.25), mix(FUR, DK, 0.3), 0.3 * sm(0.4, 1, ny)).multiplyScalar(0.92 + 0.12 * sm(-1, 0.5, ny))); place(flap, [hj.x + sg * qx, gumAt(qx, zf) + SS(sn[1] * 0.2), zf], [0, 0, sg * 0.45]); addRigid('fur', flap, 'lip' + s);
        const lpts = [[0.86, sk[2] + sn[2] * 0.04], [0.84, sk[2] + sn[2] * 0.4], [0.62, tipZ - 0.05], [0.2, tipZ - 0.008]].map(([q, zz]) => { const z = hj.z + SS(zz), r = ringAt(z), x = q * r.rx; return { p: [hj.x + sg * x, r.y - r.ry * Math.sqrt(1 - q * q) + SS(0.002), z], r: SS(0.0048) }; });
        const le = loft(lpts, { seg: 4, sub: 1, cap: 1 }); setColor(le, flat('#241412')); addRigid('eye', le, 'lip' + s);
      }
      // ears
      { const ej = jp('ear' + s), inner = sp.ears === 'point' ? hexC('#c7bdb0') : sp.ears === 'flap' ? hexC('#8a6a58') : hexC('#b4907c'); let ear;
        if (sp.ears === 'point') { ear = cone(SS(0.058), SS(0.17), 4); ear.scale(1, 1, 0.45); ear.rotateX(-0.12); ear.rotateZ(sg * -0.18); if (FC) { const e2 = cone(SS(0.04), SS(0.13), 4); e2.scale(1, 1, 0.3); e2.translate(0, 0.004 * S, SS(0.014)); e2.rotateX(-0.12); e2.rotateZ(sg * -0.18); setColor(e2, flat('#d9d0c4')); e2.translate(ej.x, ej.y, ej.z); addSkin2('fur', e2, 'ear' + s, 'head', (x, y) => sm(ej.y - 0.005, ej.y + SS(0.1), y)); } }
        else if (sp.ears === 'flap') { ear = blob(SS(0.07), SS(0.1), SS(0.022), 7, 4); ear.translate(sg * SS(0.02), SS(0.07), 0); ear.rotateX(0.35); ear.rotateZ(sg * -0.5); }
        else { // round ear: a cup (dark back, light inner fur facing forward) on the ear bone
          const er2 = SS(sp.id === 'bear' ? 0.055 : 0.07); ear = new THREE.SphereGeometry(1, FC ? 8 : 6, FC ? 4 : 3, 0, TAU, 0, Math.PI * 0.5); ear.scale(er2, er2, SS(0.04)); ear.rotateX(Math.PI * 0.5 - 0.25); ear.translate(0, SS(0.04), -SS(0.012));
          if (FC) { const dsk = new THREE.CircleGeometry(1, 8); dsk.scale(er2 * 0.82, er2 * 0.82, 1); dsk.translate(0, SS(0.04), SS(0.02)); dsk.rotateX(-0.2); setColor(dsk, (x, y, z) => mix(hexC('#8a6a5a'), inner, 0.6 + 0.4 * sm(0.0, 0.06 * S, y))); dsk.translate(ej.x, ej.y, ej.z); addSkin2('fur', dsk, 'ear' + s, 'head', (x, y) => sm(ej.y - 0.005, ej.y + SS(0.1), y)); } }
        setColor(ear, (x, y, z, nx, ny, nz) => (nz > 0.25 && sp.ears !== 'round' ? mix(inner, FUR, 0.2 + 0.4 * sm(0, 0.12 * S, y)) : mix(FUR, DK, 0.5 + 0.3 * sm(0, 0.1 * S, y)))); ear.translate(ej.x, ej.y, ej.z);
        addSkin2('fur', ear, 'ear' + s, 'head', (x, y) => sm(ej.y - 0.005, ej.y + SS(0.1), y)); }
      // eye: iris and pupil painted by vertex colour (the ball turns with the eye joint), the lid hinges over it
      { const eyb = blob(SS(ER), SS(ER), SS(ER), FC > 1 ? 10 : FC ? 8 : 5, FC > 1 ? 7 : FC ? 5 : 3);
        setColor(eyb, (x, y, z, nx, ny, nzz) => { const q = Math.hypot(nx, ny); if (nzz > 0.9 && q < 0.3) return hexC('#050404'); if (nzz > 0.55) return EYE.clone().multiplyScalar(0.55 + 0.7 * sm(0.55, 0.9, nzz)); return EYE.clone().multiplyScalar(0.28); });
        abs(eyb, 'eye' + s, [0, 0, 0]); addRigid('eye', eyb, 'eye' + s);
        if (DT.lids) { const lid = new THREE.SphereGeometry(1, 9, 4, 0, TAU, 0, Math.PI / 2); lid.scale(SS(ER * 1.22), SS(ER * 1.22), SS(ER * 1.22)); lid.rotateX(-1.25); setColor(lid, (x, y, z, nx, ny) => mix(FUR, DK, 0.62)); abs(lid, 'lid' + s, [0, 0, 0]); addRigid('fur', lid, 'lid' + s); } }
    }
    // nose bridge: a low ridge from between the brows to the nose leather
    if (FC) { const tops = [2, 3, 4, 5].map((i) => headCtrl[i]), nb = loft(tops.map((rg, k) => ({ p: [rg.p[0], rg.p[1] + rg.r[1] * (k === 3 ? 0.78 : 0.93), rg.p[2]], r: [SS(sn[0] * (0.34 - 0.04 * k)), SS(sn[1] * (0.22 - 0.03 * k))] })), { seg: 5, sub: 1, cap: 1 });
      setColor(nb, (x, y, z, nx, ny) => (kind === 'wolf' ? mix(FUR, DK, 0.55) : kind === 'bear' ? mix(FUR, DK, 0.12) : kind === 'boar' ? mix(FUR, DK, 0.2) : mix(FUR, DK, 0.18))); addRigid('fur', nb, 'head'); }
    // nose leather with two nostrils (and flaring wings at the high tier) and a philtrum line down to the lip
    { const bw = kind === 'boar' ? 1.1 : 0.82, nzh = kind === 'boar' ? 0.95 : 0.6, nz = blob(SS(sn[0] * bw), SS(sn[1] * nzh), SS(kind === 'boar' ? 0.045 : 0.034), LOW ? 5 : 8, LOW ? 3 : 5), padC = kind === 'wolf' ? '#171414' : kind === 'boar' ? '#a8756a' : cat ? '#4a2c26' : '#1c1412';
      setColor(nz, (x, y, z, nx, ny, nzz) => hexC(padC).multiplyScalar(0.8 + 0.3 * sm(-0.5, 0.8, ny))); const nzY = tipY + (kind === 'boar' ? 0.0 : sn[1] * 0.4); abs(nz, 'head', [0, SS(nzY), SS(tipZ + 0.014)]); addRigid('eye', nz, 'head');
      if (FC) for (const sg of [1, -1]) {
        const nr = blob(SS(sn[0] * (kind === 'boar' ? 0.2 : 0.17)), SS(sn[1] * (kind === 'boar' ? 0.26 : 0.16)), SS(0.011), 6, 3); setColor(nr, flat(kind === 'boar' ? '#3a1812' : '#070404')); abs(nr, 'head', [sg * SS(sn[0] * (kind === 'boar' ? 0.45 : 0.36)), SS(nzY - sn[1] * (kind === 'boar' ? 0.0 : 0.05)), SS(tipZ + 0.014 + (kind === 'boar' ? 0.036 : 0.026))], [0, sg * 0.3, sg * -0.25]); addRigid('eye', nr, 'head');
        if (FC > 1 && kind !== 'boar') { const wn = blob(SS(sn[0] * 0.15), SS(sn[1] * 0.2), SS(0.016), 6, 3); setColor(wn, flat(padC)); abs(wn, 'head', [sg * SS(sn[0] * 0.7), SS(nzY - sn[1] * 0.06), SS(tipZ + 0.008)], [0, sg * 0.6, 0]); addRigid('eye', wn, 'head'); }
      }
      if (FC > 1 && kind !== 'boar') { const ph = loft([{ p: HL(0, nzY - sn[1] * 0.4, tipZ + 0.022), r: SS(0.004) }, { p: HL(0, lipY + sn[1] * 0.1, tipZ + 0.002), r: SS(0.0035) }], { seg: 4, sub: 1, cap: 1 }); setColor(ph, flat('#241412')); addRigid('eye', ph, 'head'); } }
    // gum strip under the upper lip (a U along the muzzle), visible when the lips pull back
    if (FC && kind !== 'boar') { const zs = [[0.74, sk[2] + sn[2] * 0.2], [0.72, sk[2] + sn[2] * 0.58], [0.46, tipZ - 0.02], [0, tipZ - 0.004], [-0.46, tipZ - 0.02], [-0.72, sk[2] + sn[2] * 0.58], [-0.74, sk[2] + sn[2] * 0.2]];
      const gm = loft(zs.map(([q, z]) => { const r = ringAt(z), x = q * r.rx; return { p: [hj.x + x, gumAt(x, z) + SS(0.006), z], r: SS(0.011) }; }), { seg: 4, sub: 1, cap: 1 }); setColor(gm, flat('#7a2430')); addRigid('eye', gm, 'head'); }
    // lower jaw (follows the jaw bone), lower lip line, mouth interior and tongue
    const jw = HS.jaw, jy = -sn[1] * 0.38;
    addLoft('fur', [{ p: P3('jaw', 0, SS(jy * 0.7), SS(-0.02)), r: [SS(sn[0] * 1.15), SS(sn[1] * 0.7)] }, { p: P3('jaw', 0, SS(jy), SS(jw * 0.45)), r: [SS(sn[0] * 0.98), SS(sn[1] * 0.55)] }, { p: P3('jaw', 0, SS(jy * 1.05), SS(jw * 0.95)), r: [SS(sn[0] * 0.64), SS(sn[1] * 0.42)] }], { caps: [false, true] }, [['jaw', 0]], 0.5, (x, y, z, nx, ny) => mix(mix(BEL, MUZ, 0.5), FUR, sm(0, 0.9, ny) * 0.35), 0);
    if (FC > 1 && kind !== 'boar') { const ll = loft([{ p: P3('jaw', SS(sn[0] * 0.86), SS(jy + sn[1] * 0.4), SS(-0.01)), r: SS(0.004) }, { p: P3('jaw', SS(sn[0] * 0.72), SS(jy + sn[1] * 0.42), SS(jw * 0.5)), r: SS(0.0045) }, { p: P3('jaw', 0, SS(jy + sn[1] * 0.38), SS(jw * 0.97)), r: SS(0.005) }, { p: P3('jaw', -SS(sn[0] * 0.72), SS(jy + sn[1] * 0.42), SS(jw * 0.5)), r: SS(0.0045) }, { p: P3('jaw', -SS(sn[0] * 0.86), SS(jy + sn[1] * 0.4), SS(-0.01)), r: SS(0.004) }], { seg: 4, sub: 1, cap: 1 }); setColor(ll, flat('#241412')); addRigid('eye', ll, 'jaw'); }
    if (FC) { const mo = blob(SS(sn[0] * 0.82), SS(sn[1] * 0.4), SS(jw * 0.52), 7, 3); setColor(mo, flat('#4a1218')); abs(mo, 'jaw', [0, SS(jy * 0.85 + sn[1] * 0.45), SS(jw * 0.46)]); addRigid('eye', mo, 'jaw');
      const tg = blob(SS(sn[0] * 0.46), SS(sn[1] * 0.26), SS(jw * 0.46), 7, 3); setColor(tg, flat('#c4606c')); abs(tg, 'jaw', [0, SS(jy * 0.85 + sn[1] * 0.72), SS(jw * 0.46)]); addRigid('eye', tg, 'jaw'); }
    // teeth: canines up and down (medium), incisors and cheek teeth (high)
    const fang = kind === 'wolf' ? 0.038 : kind === 'bear' ? 0.044 : kind === 'boar' ? 0.02 : 0.058;
    for (let i = 0; i < DT.teeth; i++) {
      const sg = i % 2 ? -1 : 1, upT = i < 2, fl = SS(upT ? fang : fang * 0.82), f = cone(SS(fang * 0.3), fl, 5); setColor(f, (x, y) => mix(hexC('#cdbf96'), hexC('#f6f0dc'), sm(0, fl * 0.7, y)));
      if (upT) { const zz = hj.z + SS(sk[2] + sn[2] * 0.8), xx = sg * SS(sn[0] * 0.62); place(f, [hj.x + xx, gumAt(xx, zz) + SS(0.004), zz], [Math.PI, 0, 0]); addRigid('bone', f, 'head'); } else { abs(f, 'jaw', [sg * SS(sn[0] * 0.5), SS(jy + sn[1] * 0.3), SS(jw * 0.86)]); addRigid('bone', f, 'jaw'); }
    }
    if (FC > 1 && kind !== 'boar') {
      for (let i = -2; i <= 2; i++) { const f = cone(SS(0.008), SS(0.02), 3); setColor(f, flat('#f1ead6')); const zz = tipZ - 0.012 - Math.abs(i) * 0.012, xx = i * sn[0] * 0.21; place(f, [hj.x + xx * S, gumAt(xx * S, hj.z + zz * S) + SS(0.004), hj.z + zz * S], [Math.PI, 0, 0]); addRigid('bone', f, 'head'); }
      for (let i = -2; i <= 2; i++) { const f = cone(SS(0.0075), SS(0.017), 3); setColor(f, flat('#eee6d0')); abs(f, 'jaw', [i * SS(sn[0] * 0.19), SS(jy + sn[1] * 0.38), SS(jw * 0.95 - Math.abs(i) * 0.01)]); addRigid('bone', f, 'jaw'); }
      for (const sg of [1, -1]) for (let i = 0; i < 3; i++) { const f = cone(SS(0.0075), SS(0.016), 3); setColor(f, flat('#e8dfc6')); const zz = sk[2] + sn[2] * (0.28 + 0.1 * i), xx = sg * sn[0] * 0.78; place(f, [hj.x + xx * S, gumAt(xx * S, hj.z + zz * S) + SS(0.004), hj.z + zz * S], [Math.PI, 0, 0]); addRigid('bone', f, 'head'); }
    }
    // whiskers: thin cards from the whisker pads, bending down
    if (DT.whisk) { const bl = new Blades(), hb = [[bIdx.head, 1]]; for (const sg of [1, -1]) for (let i = 0; i < DT.whisk; i++) { const a = (i - (DT.whisk - 1) / 2) * 0.16, rt = HP(sg * sn[0] * 0.62, tipY * 0.9 + 0.006 + i * 0.004, sk[2] + sn[2] * 0.5 + 0.012); dir.set(sg * 0.9, 0.12 + a * 0.5, 0.45 + a * 0.4).normalize(); bl.add(rt, dir, SS(kind === 'wolf' ? 0.085 : 0.11), SS(0.0035), 2, new V3(0, -SS(0.035), 0), hexC('#e9e3d6'), hexC('#c9c2b4'), hb, new V3(0, 1, 0)); } bladesTo('bone', bl); }
  }
  // ---- legs: one skin per leg through shoulder / elbow / wrist (or hip / knee / hock) and the paw, plus claws or hooves
  const legs = (fr, sg) => {
    const s = sg > 0 ? 'L' : 'R', Lg = fr ? F : H, a = fr ? ['shoulder', 'elbow', 'wrist'] : ['hip', 'knee', 'ankle'], jn = a.map((n) => n + s), r = Lg.r.map((v) => SS(v)), pad = SS(Lg.pad), pw = Lg.paw.map((v) => SS(v));
    const j0 = jp(jn[0]), j1 = jp(jn[1]), j2 = jp(jn[2]), md = (p, q, t = 0.5) => [p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, p.z + (q.z - p.z) * t];
    const soleY = j2.y - pad, rH = Math.max(pw[1], pad * 0.2), m1 = md(j0, j1), m2 = md(j1, j2), top = fr ? 1.0 : 1.0, fz = fr ? 0 : -0.012 * S;
    const ctrl = [
      { p: [j0.x, j0.y + r[0] * 0.55, j0.z - SS(0.02)], r: [r[0] * 1.06, r[0] * (fr ? 1.1 : 1.2)] }, { p: [j0.x, j0.y, j0.z], r: [r[0] * 1.0 * top, r[0] * (fr ? 1.05 : 1.12)] },
      { p: [m1[0], m1[1], m1[2] + fz], r: [r[0] * (fr ? 0.98 : 0.8), r[0] * (fr ? 1.0 : 1.0)] }, { p: [j1.x, j1.y, j1.z], r: [r[1] * 1.02, r[1] * 1.08] },
      { p: [m2[0], m2[1], m2[2] + fz], r: [(r[1] + r[2]) / 2 * 1.08, (r[1] + r[2]) / 2 * (fr ? 1.08 : 1.12)] }, { p: [j2.x, j2.y, j2.z], r: [r[2] * 1.08, r[2] * 1.02] },
      { p: [j2.x, j2.y - pad * 0.45, j2.z + 0.01 * S], r: [r[2] * 0.98, r[2] * 0.92] }, { p: [j2.x, soleY + rH * 1.1, j2.z + pw[2] * 0.28], r: [pw[0] * 0.98, rH * 1.1] }, { p: [j2.x, soleY + rH * 0.55, j2.z + pw[2] * 0.78], r: [pw[0] * 0.82, rH * 0.58] },
    ];
    addLoft('fur', ctrl, { up: [0, 0, 1], caps: [true, true] }, [[fr ? 'chest' : 'hips', 0], [jn[0], 1], [jn[1], 3], [jn[2], 5]], 0.75, limbCol(0.3 * S * (big ? 3 : 1), kind === 'wolf' || kind === 'bear' || kind === 'boar' ? 0.5 : 0.18, DK, 0.15), 0.01 * S);
    if (kind === 'wolf' && fr) { const st = blob(SS(0.012), SS(0.12), SS(0.01), 5, 4); setColor(st, flat('#2a2c30')); abs(st, jn[1], [0, SS(-0.05), SS(0.045)]); addRigid('fur', st, jn[1]); }
    // claws / hooves / toenails
    const nc = kind === 'boar' ? (DT.claws ? 2 : 0) : big ? (DT.claws ? 3 : 0) : DT.claws;
    for (let c = 0; c < nc; c++) {
      const k = (c - (nc - 1) / 2) * pw[0] * (kind === 'boar' ? 0.7 : 0.62);
      if (kind === 'boar') { const hv = blob(pw[0] * 0.36, rH * 0.9, pw[2] * 0.3, 6, 4); setColor(hv, flat('#1d1814')); place(hv, [j2.x + k, soleY + rH * 0.6, j2.z + pw[2] * 0.95]); addRigid('bone', hv, jn[2]); continue; }
      if (big) { const nl = blob(SS(0.06), SS(0.05), SS(0.035), 6, 4); setColor(nl, flat('#d8cfba')); place(nl, [j2.x + k * 2.2, soleY + SS(0.05), j2.z + pw[2] * 1.0]); addRigid('bone', nl, jn[2]); continue; }
      const cl = cone(Math.max(0.006, pw[0] * (bear ? 0.17 : 0.13)), pw[2] * (bear ? 0.7 : 0.5), 4); setColor(cl, flat(bear ? '#d9cdb0' : '#ece4d0')); cl.rotateX(Math.PI / 2 + 0.5); place(cl, [j2.x + k, soleY + rH * 0.5, j2.z + pw[2] * 1.15]); addRigid('bone', cl, jn[2]);
    }
    // elbow / hock tuft and dewclaw hair on the cats and the wolf
    if (DT.tufts && (kind === 'lion' || kind === 'nemean' || kind === 'wolf' || kind === 'bear') && DT.ruff) { const bl = new Blades(); for (let i = 0; i < (fr ? 5 : 4); i++) { const a2 = (i - 2) * 0.35; dir.set(Math.sin(a2) * 0.3 + (i % 2 ? 0.05 : -0.05), -0.55, fr ? -0.55 : -0.7).normalize(); bl.add([j1.x, j1.y + SS(0.01), j1.z - r[1] * 0.7], dir, SS(0.07 + (i % 3) * 0.015), SS(0.012), 2, new V3(0, -SS(0.02), -SS(0.02)), mix(FUR, DK, 0.3), mix(DK, MANE, 0.5), [[bIdx[jn[1]], 1]], new V3(1, 0, 0)); } bladesTo(CARD, bl); }
  };
  const bear = kind === 'bear';
  for (const sg of [1, -1]) { legs(true, sg); legs(false, sg); }
  // ---- tail
  { const tl = SS(TL.len), tr = SS(TL.r), t1 = jp('tail1'), t2 = jp('tail2'), t3 = jp('tail3'), hp0 = jp('hips'), bush = kind === 'wolf' ? 1.9 : kind === 'bear' ? 1.0 : 1;
    const ctrl = [{ p: [hp0.x, hp0.y + SS(0.05), hp0.z - SS(0.12)], r: tr * 1.5 }, { p: [t1.x, t1.y, t1.z], r: tr * 1.3 * (1 + (bush - 1) * 0.5) }, { p: [t2.x, t2.y, t2.z], r: tr * 1.1 * bush }, { p: [t3.x, t3.y, t3.z], r: tr * 0.95 * bush }, { p: [t3.x, t3.y - SS(0.015), t3.z - tl], r: tr * 0.7 * (kind === 'wolf' ? 1.25 : 1) }];
    addLoft('fur', ctrl, { caps: [true, true] }, [['hips', 0], ['tail1', 1], ['tail2', 2], ['tail3', 3]], 0.5, (x, y, z, nx, ny) => { const c = mix(FUR, BEL, sm(0.1, -0.9, ny) * 0.4); return mix(c, DK, sm(t3.z + tl * 0.2, t3.z - tl * 0.8, z) * (kind === 'wolf' ? 0.5 : 0.25)); }, kind === 'wolf' ? 0.02 * S : 0.008 * S);
    if (DT.tufts && TL.tuft) { const bl = new Blades(), n = Math.round(DT.tufts * (kind === 'wolf' ? 1.1 : 0.9)), col0 = kind === 'wolf' ? mix(FUR, DK, 0.6) : MANE, col1 = kind === 'wolf' ? DK : mix(MANE, hexC('#150c06'), 0.4), end = [t3.x, t3.y - SS(0.015), t3.z - tl];
      for (let i = 0; i < n; i++) { const an = i / n * TAU, c = Math.cos(an), s = Math.sin(an); dir.set(c * 0.45, s * 0.45, -1).normalize(); bl.add([end[0] + c * tr * 0.5, end[1] + s * tr * 0.5, end[2] + SS(0.02)], dir, SS(TL.tuft * 1.9) * (0.8 + 0.4 * h01(i + seed)), SS(0.014), 2, new V3(0, -SS(0.03), 0), col0, col1, [[bIdx.tail3, 1]], new V3(0, 1, 0)); } bladesTo(CARD, bl); }
  }
  // ---- species specials
  const mj = (u, l) => { const w = sm(0.3, 1.0, u), m = clamp(0.3 + 0.15 * l, 0, 0.75); return [[bIdx.neck, (1 - w) * (1 - m)], [bIdx.mane1, (1 - w) * m], [bIdx.chest, w * (1 - m)], [bIdx.mane2, w * m]]; };
  if (sp.hasMane) { // lion / Nemean mane: a dark core, then layered tapered strand cards (volumetric, swaying on the mane joints)
    const hN = jp('head'), cN = jp('chest'), ax = new V3(cN.x - hN.x, cN.y - hN.y, cN.z - hN.z), axl = ax.length(), axn = ax.clone().normalize(), e1 = new V3(1, 0, 0), e2 = new V3().crossVectors(axn, e1).normalize();
    const core = blob(SS(0.34), SS(0.35), SS(0.3), DT.sw, DT.sh); setColor(core, (x, y, z, nx, ny) => mix(mix(MANE, hexC('#8a5a2a'), 0.3), DK, 0.15 * sm(0.5, -0.5, ny))); abs(core, 'neck', [0, SS(-0.01), SS(-0.1)]); addSkin2('fur', core, 'neck', 'chest', (x, y, z) => sm(jp('neck').z - SS(0.28), jp('neck').z + SS(0.12), z));
    const bm = blob(SS(0.2), SS(0.14), SS(0.3), DT.sw, DT.sh); setColor(bm, (x, y) => mix(MANE, FUR, sm(0.0, -0.14, y - jp('chest').y) * 0.5)); abs(bm, 'chest', [0, SS(-0.12), SS(0.0)]); addRigid('fur', bm, 'chest');
    const bl = new Blades(), L = DT.mane >= 100 ? 4 : DT.mane >= 50 ? 3 : 2, ms = DT.mseg, tipC = sp.gold ? hexC('#e8c050') : mix(MANE, hexC('#c08a38'), 0.75);
    for (let l = 0; l < L; l++) {
      const cnt = Math.round(DT.mane / L * (l === 0 ? 0.7 : l === L - 1 ? 1.25 : 1)), rad = SS(0.19 + 0.06 * l), len = SS(0.17 + 0.06 * l);
      for (let k = 0; k < cnt; k++) {
        const hh = h01(k * 7.3 + l * 3.1 + seed), a2 = (k + 0.5 * (l % 2) + hh * 0.5) / cnt * TAU, u = 0.04 + 1.0 * h01(k * 2.7 + l * 5.9 + 0.3 + seed) * (1 - 0.25 * l / L);
        const cx = Math.cos(a2), sy = Math.sin(a2), rd = rad * (0.85 + 0.35 * u) * (sy < -0.3 ? 0.9 : 1);
        const o = [hN.x + axn.x * axl * u + (e1.x * cx + e2.x * sy) * rd, hN.y + axn.y * axl * u + (e1.y * cx + e2.y * sy) * rd * 1.05, hN.z + axn.z * axl * u + (e1.z * cx + e2.z * sy) * rd - SS(0.04)];
        dir.set(e1.x * cx + e2.x * sy, e1.y * cx + e2.y * sy, e1.z * cx + e2.z * sy).multiplyScalar(0.5).addScaledVector(axn, 0.95).add(new V3(0, -0.03 - 0.1 * (1 - sy) * 0.5, -0.05)).normalize();
        const ln = len * (0.8 + 0.55 * hh) * (1 + 0.5 * u);
        dir.x += (h01(k * 1.7 + l) - 0.5) * 0.45; dir.y += (h01(k * 2.9 + l * 3) - 0.5) * 0.3; dir.normalize();
        bl.add(o, dir, ln, SS(0.026 + 0.008 * l), ms, new V3(0, -ln * (0.16 + 0.06 * l), 0), mix(DK, MANE, 0.5 + 0.1 * l).multiplyScalar(0.8 + 0.4 * hh), mix(MANE, tipC, 0.2 + 0.25 * l + (sp.gold ? 0.2 * h01(k) : 0)).multiplyScalar(0.85 + 0.35 * hh), mj(u, l), new V3(e1.x * cx + e2.x * sy, e1.y * cx + e2.y * sy, e1.z * cx + e2.z * sy));
      }
    }
    // crown: cards around the back of the head that sweep over the neck and shoulders
    for (let k = 0, n = Math.round(DT.mane * 0.26); k < n; k++) {
      const hh = h01(k * 6.1 + seed + 40), a2 = (k + hh) / n * Math.PI * 1.3 - 0.15 * Math.PI, cx = Math.cos(a2), sy = Math.sin(a2), rd = SS(0.17 + 0.05 * hh), u = 0.0 + 0.12 * h01(k * 3.9 + 7);
      const o = [hN.x + axn.x * axl * u + (e1.x * cx + e2.x * sy) * rd, hN.y + axn.y * axl * u + (e1.y * cx + e2.y * sy) * rd, hN.z + axn.z * axl * u + (e1.z * cx + e2.z * sy) * rd - SS(0.05)];
      dir.set(e1.x * cx + e2.x * sy, e1.y * cx + e2.y * sy, e1.z * cx + e2.z * sy).multiplyScalar(0.7).addScaledVector(axn, 0.75).add(new V3((hh - 0.5) * 0.3, 0.12, 0)).normalize(); const ln = SS(0.18 + 0.12 * hh);
      bl.add(o, dir, ln, SS(0.028), ms, new V3(0, -ln * 0.28, 0), mix(DK, MANE, 0.6).multiplyScalar(0.8 + 0.4 * hh), mix(MANE, tipC, 0.4 + 0.3 * hh), mj(0.12 + u, 3), new V3(e1.x * cx + e2.x * sy, e1.y * cx + e2.y * sy, e1.z * cx + e2.z * sy));
    }
    // chest and belly fringe, cheek ruff
    for (let k = 0; k < Math.round(DT.mane * 0.14); k++) { const hh = h01(k * 3.3 + seed), t = k / Math.max(1, Math.round(DT.mane * 0.14) - 1); dir.set((hh - 0.5) * 0.4, -1, -0.15).normalize(); bl.add([(hh - 0.5) * SS(0.3), axY(0.55 + 0.4 * t) - SS(T.chest[1]) * 0.9, axZ(0.55 + 0.45 * t) + SS(0.05)], dir, SS(0.1 + 0.08 * hh), SS(0.02), ms, new V3(0, -SS(0.03), -SS(0.03)), mix(FUR, MANE, 0.3), mix(MANE, tipC, 0.4), [[bIdx.chest, 1]], new V3(1, 0, 0)); }
    bladesTo(CARD, bl);
  }
  if (sp.ruff) { // wolf: a thick ruff of pale guard-hair cards around the neck and over the shoulders
    const hN = jp('neck'), bl = new Blades(), n = [10, 26, 54][['low', 'medium', 'high'].indexOf(dname)], hb = (u) => [[bIdx.neck, 1 - sm(0.2, 0.8, u)], [bIdx.chest, sm(0.2, 0.8, u)]];
    for (let k = 0; k < n; k++) { const hh = h01(k * 5.1 + seed), a2 = (k + hh) / n * TAU, cx = Math.cos(a2), sy = Math.sin(a2), u = h01(k * 1.9 + 3), rd = SS(0.1 + 0.02 * u); dir.set(cx * 0.55, sy * 0.4 + 0.05, -0.85).normalize(); bl.add([hN.x + cx * rd, hN.y + sy * rd * 1.1 + SS(0.01), hN.z - SS(0.06) - u * SS(0.12)], dir, SS(0.1 + 0.07 * hh), SS(0.02), 2, new V3(0, -SS(0.03), 0), mix(FUR, hexC('#cfcabd'), 0.3), mix(hexC('#b8b4aa'), hexC('#eae6dc'), 0.6), hb(u), new V3(0, 1, 0)); }
    bladesTo(CARD, bl);
    const rf = blob(SS(0.13), SS(0.15), SS(0.15), DT.sw, DT.sh); setColor(rf, (x, y) => mix(hexC('#9a9fa8'), FUR, 0.4)); abs(rf, 'neck', [0, SS(-0.01), SS(-0.05)]); addSkin2('fur', rf, 'neck', 'chest', (x, y, z) => sm(jp('neck').z - SS(0.15), jp('neck').z + SS(0.08), z));
  }
  if (bear && DT.ruff) { const bl = new Blades(), n = [0, 24, 52][['low', 'medium', 'high'].indexOf(dname)], c0 = FUR, c1 = mix(FUR, hexC('#8a6a46'), 0.55);
    for (let k = 0; k < n; k++) { const hh = h01(k * 4.7 + seed), t = h01(k * 2.3 + 1), an = hh * TAU, side = Math.cos(an), top = Math.max(0.1, Math.sin(an) * 0.5 + 0.55), zt = axZ(0.35 + 0.8 * t), yt = axY(0.35 + 0.8 * t) + SS(T.chest[1]) * 0.85 * top; dir.set(side * 0.5, 0.2 * top, -0.85).normalize(); bl.add([side * SS(T.mid[0]) * 0.9, yt, zt], dir, SS(0.1 + 0.06 * hh), SS(0.022), 2, new V3(0, -SS(0.05), 0), c0, c1, [[t > 0.5 ? bIdx.chest : bIdx.spine, 1]], new V3(0, 1, 0)); }
    bladesTo(CARD, bl); }
  if (kind === 'boar') { // dorsal bristle crest of stiff cards and the tusks
    if (DT.ruff) { const bl = new Blades(), n = [0, 12, 22][['low', 'medium', 'high'].indexOf(dname)]; for (let k = 0; k < n; k++) { const t = k / Math.max(1, n - 1), hh = h01(k * 3.7 + seed); dir.set((hh - 0.5) * 0.25, 1, -0.45 + 0.15 * (1 - t)).normalize(); bl.add([(hh - 0.5) * SS(0.05), axY(-0.05 + 1.15 * t) + SS(T.mid[1]) * 1.02 + SS(0.03) * t, axZ(-0.05 + 1.15 * t)], dir, SS(0.1 + 0.07 * Math.sin(t * Math.PI)), SS(0.018), 2, new V3(0, -SS(0.025), -SS(0.03)), DK, mix(DK, FUR, 0.4), [[t > 0.5 ? bIdx.chest : bIdx.spine, 1]], new V3(1, 0, 0)); } bladesTo(CARD, bl); }
    for (const sg of [1, -1]) { const tj = jp('jaw'), tk = loft([{ p: [tj.x + sg * SS(0.075), tj.y + SS(0.03), tj.z + SS(0.16)], r: SS(0.022) }, { p: [tj.x + sg * SS(0.095), tj.y + SS(0.06), tj.z + SS(0.2)], r: SS(0.018) }, { p: [tj.x + sg * SS(0.1), tj.y + SS(0.12), tj.z + SS(0.22)], r: SS(0.012) }, { p: [tj.x + sg * SS(0.085), tj.y + SS(0.17), tj.z + SS(0.2)], r: SS(0.004) }], { seg: Math.max(5, DT.seg - 2), sub: 2, cap: 1, caps: [true, true] }); setColor(tk, (x, y, z) => mix(hexC('#f1e7cc'), hexC('#b9a77c'), sm(tj.y + SS(0.04), tj.y + SS(0.0), y))); addRigid('bone', tk, 'jaw'); }
  }
  if (sp.scars) for (const sg of [1, -1]) { const cc = jp('chest'), sc2 = tubeLine([[cc.x + sg * SS(0.24), cc.y + SS(0.06), cc.z + SS(0.1)], [cc.x + sg * SS(0.27), cc.y, cc.z + SS(0.14)], [cc.x + sg * SS(0.29), cc.y - SS(0.06), cc.z + SS(0.2)]], SS(0.011), 5); setColor(sc2, flat('#7a3a28')); addRigid('fur', sc2, 'chest'); }
  if (sp.gold) { for (const sg of [1, -1]) { const pl = blob(SS(0.08), SS(0.015), SS(0.14), 6, 3); setColor(pl, flat('#ffe9a0')); abs(pl, 'chest', [sg * SS(0.22), SS(0.3), SS(0.05)], [0, 0, sg * -0.3]); addRigid('bone', pl, 'chest'); } }
  if (sp.trunk) buildElephant();
  function tubeLine(pts, r, seg) { return loft(pts.map((p) => ({ p, r })), { seg, sub: 1, cap: 1 }); }

  function buildElephant() {
    const k = S, hj2 = jp('head'), HE = (x, y, z) => [hj2.x + x * k, hj2.y + y * k, hj2.z + z * k], skinC = (x, y, z, nx, ny) => mix(mix(FUR, BEL, sm(0.1, -0.9, ny) * 0.45), DK, 0.1 * sm(0.4, 1, ny));
    // head: a big domed skull with a flat face; trunk: one skin through the four trunk joints with wrinkle rings
    const hdCol = (x, y, z, nx, ny) => { const lz = (z - hj2.z) / k, ly = (y - hj2.y) / k, c = skinC(x, y, z, nx, ny); return mix(c, hexC('#b79088'), sm(0.28, 0.4, lz) * 0.4 * sm(0.1, -0.1, ly)); };
    addLoft('fur', [{ p: HE(0, 0.0, -0.08), r: [0.3 * k, 0.34 * k] }, { p: HE(0, 0.05, 0.1), r: [0.31 * k, 0.37 * k] }, { p: HE(0, -0.02, 0.28), r: [0.26 * k, 0.31 * k] }, { p: HE(0, -0.1, 0.4), r: [0.17 * k, 0.2 * k] }], { caps: [true, true] }, [['head', 0]], 0.5, hdCol, 0);
    for (const sg of [1, -1]) { const br = blob(0.1 * k, 0.07 * k, 0.12 * k, 8, 5); setColor(br, flat('#6a625d')); abs(br, 'head', [sg * 0.22 * k, 0.2 * k, 0.1 * k]); addRigid('fur', br, 'head'); }
    const t1 = jp('trunk1'), t2 = jp('trunk2'), t3 = jp('trunk3'), t4 = jp('trunk4'), mid = (p, q) => [(p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2], rg = (i) => (DT.sub > 1 ? 1 + 0.06 * (i % 2 ? 1 : -1) : 1);
    addLoft('fur', [
      { p: HE(0, -0.05, 0.32), r: [0.19 * k, 0.2 * k] }, { p: [t1.x, t1.y, t1.z], r: [0.17 * k, 0.17 * k] }, { p: mid(t1, t2), r: [0.153 * k * rg(1), 0.147 * k * rg(1)] }, { p: [t2.x, t2.y, t2.z], r: [0.14 * k, 0.136 * k] }, { p: mid(t2, t3), r: [0.121 * k * rg(2), 0.117 * k * rg(2)] },
      { p: [t3.x, t3.y, t3.z], r: [0.105 * k, 0.1 * k] }, { p: [t4.x, t4.y, t4.z], r: [0.078 * k, 0.074 * k] }, { p: [t4.x, t4.y - 0.2 * k, t4.z + 0.06 * k], r: [0.055 * k, 0.05 * k] },
    ], { caps: [false, true] }, [['head', 0], ['trunk1', 1], ['trunk2', 3], ['trunk3', 5], ['trunk4', 6]], 0.7, (x, y, z, nx, ny) => mix(skinC(x, y, z, nx, ny), hexC('#c79a92'), sm(t4.y + 0.1, t4.y - 0.3, y) * 0.6 + 0.25 * sm(0.1, -0.8, ny) * sm(t2.y, t4.y, y)), 0);
    // big ears: wrinkled rims, hinged on the ear joints and bending toward the tips (skin weights by distance from the hinge)
    for (const sg of [1, -1]) {
      const s = sg > 0 ? 'L' : 'R', ej = jp('ear' + s), ear = new THREE.SphereGeometry(1, LOW ? 7 : dname === 'high' ? 14 : 10, LOW ? 5 : dname === 'high' ? 10 : 7), P = ear.attributes.position;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i), z = P.getZ(i), rim = Math.hypot(y, z), w = 1 + 0.07 * Math.sin(Math.atan2(y, z) * 9) * rim; P.setXYZ(i, P.getX(i) * 0.026 * k * (1 + 0.5 * (1 - rim)), y * 0.56 * k * w * (y < 0 ? 1.1 : 0.7), z * 0.48 * k * w * (0.6 + 0.4 * sm(0.6, -0.9, y))); }
      ear.computeVertexNormals(); ear.translate(0, 0, -0.46 * k); ear.rotateY(-sg * 0.7); ear.rotateZ(sg * 0.1); ear.translate(ej.x + sg * 0.04 * k, ej.y - 0.3 * k, ej.z + 0.12 * k);
      setColor(ear, (x, y, z, nx, ny) => { const inner = (sg * nx) < 0.1 ? 1 : 0; return inner ? mix(hexC('#b78a82'), FUR, 0.25 + 0.4 * sm(0.3, -0.5, (y - ej.y) / k)).multiplyScalar(0.92 + 0.12 * Math.sin(y * 90)) : mix(FUR, DK, 0.18 + 0.25 * sm(0.0, -0.5, (y - ej.y) / k)); });
      addSkin2('fur', ear, 'ear' + s, 'head', (x, y) => sm(0.0, 0.42 * k, ej.y - y));
    }
    // tusks (curved ivory, dark root) and eyes
    for (const sg of [1, -1]) {
      const tk = loft([{ p: HE(sg * 0.17, -0.16, 0.22), r: 0.07 * k }, { p: HE(sg * 0.2, -0.3, 0.42), r: 0.062 * k }, { p: HE(sg * 0.2, -0.36, 0.7), r: 0.048 * k }, { p: HE(sg * 0.16, -0.26, 0.96), r: 0.03 * k }, { p: HE(sg * 0.12, -0.08, 1.1), r: 0.012 * k }], { seg: LOW ? 4 : Math.max(6, DT.seg - 2), sub: LOW ? 1 : Math.max(2, DT.sub), cap: 1 });
      setColor(tk, (x, y, z) => mix(hexC('#4a4038'), mix(hexC('#f1e7cc'), hexC('#cbbb92'), sm(hj2.z + 0.9 * k, hj2.z + 0.3 * k, z)), sm(hj2.z + 0.2 * k, hj2.z + 0.34 * k, z))); addRigid('bone', tk, 'head');
      const s = sg > 0 ? 'L' : 'R', ey = blob(0.028 * k, 0.028 * k, 0.026 * k, DT.detailEye ? 9 : 5, DT.detailEye ? 6 : 3); setColor(ey, (x, y, z, nx, ny, nzz) => (nzz > 0.88 && Math.hypot(nx, ny) < 0.3 ? hexC('#0a0604') : hexC('#4a2c18').multiplyScalar(0.7 + 0.5 * nzz))); abs(ey, 'eye' + s, [0, 0, 0]); addRigid('eye', ey, 'eye' + s);
      if (DT.lids) { const lid = new THREE.SphereGeometry(1, 9, 4, 0, TAU, 0, Math.PI / 2); lid.scale(0.036 * k, 0.036 * k, 0.036 * k); lid.rotateX(-1.2); setColor(lid, (x, y, z, nx, ny) => mix(FUR, DK, 0.3)); abs(lid, 'lid' + s, [0, 0, 0]); addRigid('fur', lid, 'lid' + s); }
    }
    // tail tuft bristles
    // harness, blanket, howdah, banners
    const sj = jp('spine'), SP = (x, y, z) => [sj.x + x * k, sj.y + y * k, sj.z + z * k];
    { const bl = blob(0.74 * k, 0.16 * k, 0.86 * k, DT.sw, 5); setColor(bl, (x, y, z, nx, ny) => (Math.abs(Math.abs(x - sj.x) - 0.5 * k) < 0.035 * k || Math.abs(Math.abs(z - sj.z + 0.12 * k) - 0.62 * k) < 0.035 * k ? hexC('#e0b84a') : hexC('#a01e1e'))); abs(bl, 'spine', [0, 0.56 * k, -0.12 * k]); setColor(bl, (x, y, z, nx, ny) => (Math.abs(Math.abs(x - sj.x) - 0.5 * k) < 0.035 * k || Math.abs(Math.abs(z - sj.z + 0.12 * k) - 0.6 * k) < 0.035 * k ? hexC('#e0b84a') : hexC('#a01e1e'))); addRigid('cloth', bl, 'spine'); }
    for (const sg of [1, -1]) { const dr = new THREE.PlaneGeometry(1.0 * k, 0.7 * k, 3, 2); dr.rotateY(Math.PI / 2); abs(dr, 'spine', [sg * 0.72 * k, 0.2 * k, -0.12 * k]); setColor(dr, (x, y) => (y < sj.y - 0.1 * k ? hexC('#e0b84a') : hexC('#a01e1e'))); addRigid('cloth', dr, 'spine'); }
    if (!LOW) { const gi = loft([{ p: SP(-0.6, 0.35, 0), r: [0.03 * k, 0.04 * k] }, { p: SP(-0.66, -0.2, 0), r: [0.03 * k, 0.04 * k] }, { p: SP(-0.58, -0.58, 0), r: [0.03 * k, 0.04 * k] }, { p: SP(0, -0.68, 0), r: [0.03 * k, 0.04 * k] }, { p: SP(0.58, -0.58, 0), r: [0.03 * k, 0.04 * k] }, { p: SP(0.66, -0.2, 0), r: [0.03 * k, 0.04 * k] }, { p: SP(0.6, 0.35, 0), r: [0.03 * k, 0.04 * k] }], { seg: 4, sub: 1, cap: 0, caps: [false, false], up: [0, 0, 1] }); setColor(gi, flat('#4a2e1a')); addRigid('leather', gi, 'spine'); }
    const plat = new THREE.BoxGeometry(0.84 * k, 0.07 * k, 0.96 * k); setColor(plat, (x, y, z) => mix(hexC('#6a4528'), hexC('#8a5a30'), 0.5 + 0.5 * Math.sin(x * 60))); abs(plat, 'spine', [0, 0.71 * k, -0.12 * k]); addRigid('leather', plat, 'spine');
    for (const [x, z] of [[0.4, 0.34], [-0.4, 0.34], [0.4, -0.58], [-0.4, -0.58]]) { const po = new THREE.CylinderGeometry(0.022 * k, 0.026 * k, 0.5 * k, 6); setColor(po, flat('#5a3a20')); abs(po, 'spine', [x * k, 0.99 * k, z * k]); addRigid('leather', po, 'spine'); if (!LOW) { const fn = blob(0.04 * k, 0.04 * k, 0.04 * k, 6, 4); setColor(fn, flat('#e0b84a')); abs(fn, 'spine', [x * k, 1.26 * k, z * k]); addRigid('metal', fn, 'spine'); } }
    for (const [x, z, w2, d2] of [[0.4, -0.12, 0.03, 0.94], [-0.4, -0.12, 0.03, 0.94], [0, -0.58, 0.82, 0.03], [0, 0.34, 0.82, 0.03]]) { const rl = new THREE.BoxGeometry(w2 * k, 0.07 * k, d2 * k); setColor(rl, flat('#5a3a20')); abs(rl, 'spine', [x * k, 1.0 * k, z * k]); addRigid('leather', rl, 'spine'); if (!LOW) { const rl2 = rl.clone(); rl2.translate(0, 0.14 * k, 0); addRigid('leather', rl2, 'spine'); } }
    // shield on the front rail
    { const sh = new THREE.CylinderGeometry(0.17 * k, 0.17 * k, 0.025 * k, LOW ? 8 : 14); sh.rotateX(Math.PI / 2); abs(sh, 'spine', [0.0, 1.02 * k, 0.37 * k]); setColor(sh, (x, y, z, nx, ny, nzz) => (Math.abs(nzz) > 0.6 ? mix(hexC('#8a1c1c'), hexC('#d4a63c'), sm(0.1 * k, 0.15 * k, Math.hypot(x - sj.x, y - (sj.y + 1.02 * k)))) : hexC('#d4a63c'))); addRigid('metal', sh, 'spine'); const bs = blob(0.04 * k, 0.04 * k, 0.025 * k, 8, 4); setColor(bs, flat('#f0d070')); abs(bs, 'spine', [0, 1.02 * k, 0.4 * k]); addRigid('metal', bs, 'spine'); }
    // banners: poles and waving cloth (cloth weights follow the flag joints so they stream)
    for (const [sg, fj] of [[1, 'flag1'], [-1, 'flag2']]) {
      const pole = new THREE.CylinderGeometry(0.016 * k, 0.02 * k, 2.0 * k, 6); setColor(pole, flat('#5a3a20')); abs(pole, 'spine', [sg * 0.4 * k, 1.3 * k, -0.62 * k]); addRigid('leather', pole, 'spine');
      const tip = cone(0.03 * k, 0.14 * k, 4); setColor(tip, flat('#e8c050')); abs(tip, 'spine', [sg * 0.4 * k, 2.3 * k, -0.62 * k]); addRigid('metal', tip, 'spine');
      const fl = new THREE.PlaneGeometry(0.85 * k, 0.7 * k, DT.sub > 1 ? 6 : 3, DT.sub > 1 ? 3 : 2); fl.rotateY(-Math.PI / 2); abs(fl, 'spine', [sg * 0.4 * k, 1.85 * k, -0.62 * k - 0.425 * k]);
      setColor(fl, (x, y, z) => { const u = ((sj.z - 0.62 * k) - z) / (0.85 * k), v = (y - (sj.y + 1.85 * k)) / (0.35 * k), edge = Math.abs(v) > 0.82 || u > 0.9 || u < 0.08, em = Math.hypot((u - 0.5) * 1.2, v * 0.85) < 0.3; return edge || em ? hexC('#e0b84a') : hexC('#a01e1e'); });
      addSkin2('flag', fl, fj, 'spine', (x, y, z) => sm(0.0, 0.7 * k, (sj.z - 0.62 * k) - z));
    }
    // the handler: an armoured guard seated in the howdah (cuirass bands, pteruges, crested helmet, bracers, javelin)
    const rj = jp('rider'), RP = (x, y, z) => [rj.x + x * k, rj.y + y * k, rj.z + z * k], bands = DT.sub > 1 ? 7 : 3;
    { const rings = []; for (let i = 0; i < bands; i++) { const t = i / (bands - 1); rings.push({ p: RP(0, -0.2 + 0.5 * t, 0), r: [(0.17 + 0.03 * Math.sin(t * Math.PI) + (i % 2 ? 0.012 : 0)) * k, (0.12 + 0.01 * Math.sin(t * Math.PI) + (i % 2 ? 0.008 : 0)) * k] }); }
      const tr = loft(rings, { seg: DT.seg > 8 ? 10 : 6, sub: 1, cap: 1, up: [0, 0, 1], caps: [true, true] }); setColor(tr, (x, y, z, nx, ny) => mix(hexC('#9aa2ae'), hexC('#c8ced8'), 0.5 + 0.5 * Math.sin((y - rj.y) / k * 110) * 0.5)); addRigid('metal', tr, 'rider');
      const sk2 = loft([{ p: RP(0, -0.17, 0), r: [0.2 * k, 0.15 * k] }, { p: RP(0, -0.3, 0.01), r: [0.25 * k, 0.2 * k] }], { seg: DT.seg > 8 ? 10 : 6, sub: 1, cap: 0, caps: [false, false], up: [0, 0, 1] }); setColor(sk2, (x, y) => (y < rj.y - 0.28 * k ? hexC('#d4a63c') : hexC('#a01e1e'))); addRigid('cloth', sk2, 'rider');
      const hd = blob(0.095 * k, 0.105 * k, 0.1 * k, LOW ? 6 : 9, LOW ? 4 : 6); setColor(hd, flat('#c4875a')); abs(hd, 'rider', [0, 0.41 * k, 0.01 * k]); addRigid('skin', hd, 'rider');
      const hm = new THREE.SphereGeometry(1, LOW ? 6 : 10, LOW ? 3 : 6, 0, TAU, 0, Math.PI * 0.62); hm.scale(0.112 * k, 0.115 * k, 0.12 * k); setColor(hm, (x, y) => mix(hexC('#aab2bc'), hexC('#f0d070'), sm(rj.y + 0.42 * k, rj.y + 0.37 * k, y) * 0.6)); abs(hm, 'rider', [0, 0.44 * k, 0], [0, 0, 0]); addRigid('metal', hm, 'rider');
      if (!LOW) for (const sg of [1, -1]) { const cg = blob(0.02 * k, 0.07 * k, 0.07 * k, 5, 4); setColor(cg, flat('#aab2bc')); abs(cg, 'rider', [sg * 0.1 * k, 0.4 * k, 0.02 * k]); addRigid('metal', cg, 'rider'); }
      if (DT.tufts) { const cb = new Blades(), n = DT.tufts > 10 ? 12 : 7; for (let i = 0; i < n; i++) { const t = i / (n - 1); dir.set(0, 0.7 - 0.9 * t, -0.2 - 0.9 * t).normalize(); cb.add(RP(0, 0.55 * k / k - 0.0 + 0.0, 0.1 - 0.2 * t), dir, 0.2 * k, 0.03 * k, 3, new V3(0, -0.08 * k, -0.04 * k), hexC('#8a1c1c'), hexC('#c02a24'), [[bIdx.rider, 1]], new V3(1, 0, 0)); } const g2 = cb.build(); if (g2) { const sk = g2.userData.skin; delete g2.userData.skin; addSkin('cloth', g2, sk); } }
      if (!LOW) for (const sg of [1, -1]) { const lg = loft([{ p: RP(sg * 0.1, -0.2, 0), r: 0.065 * k }, { p: RP(sg * 0.2, -0.17, 0.2), r: 0.055 * k }, { p: RP(sg * 0.18, -0.34, 0.34), r: 0.048 * k }], { seg: 6, sub: 1, cap: 1 }); setColor(lg, (x, y, z) => mix(hexC('#c4875a'), hexC('#7a4a2a'), sm(rj.z + 0.2 * k, rj.z + 0.34 * k, z))); addRigid('skin', lg, 'rider'); }
      if (!LOW) { const la = loft([{ p: RP(0.18, 0.18, 0), r: 0.045 * k }, { p: RP(0.26, 0.04, 0.08), r: 0.04 * k }, { p: RP(0.2, 0.0, 0.26), r: 0.035 * k }], { seg: 6, sub: 1, cap: 1 }); setColor(la, flat('#c4875a')); addRigid('skin', la, 'rider'); }
      const ra = loft([{ p: P3('riderArm', 0, 0.02 * k, 0), r: 0.05 * k }, { p: P3('riderArm', 0, -0.2 * k, 0.04 * k), r: 0.045 * k }, { p: P3('riderArm', 0, -0.38 * k, 0.1 * k), r: 0.04 * k }], { seg: 6, sub: 1, cap: 1 }); setColor(ra, (x, y) => mix(hexC('#c4875a'), hexC('#aab2bc'), sm(jp('riderArm').y - 0.2 * k, jp('riderArm').y - 0.3 * k, y))); addRigid('skin', ra, 'riderArm');
      const js = loft([{ p: P3('riderArm', 0, -0.38 * k, -0.2 * k), r: 0.014 * k }, { p: P3('riderArm', 0, -0.38 * k, 0.5 * k), r: 0.014 * k }, { p: P3('riderArm', 0, -0.38 * k, 0.95 * k), r: 0.012 * k }], { seg: 5, sub: 1, cap: 1 }); setColor(js, flat('#6a4a2a')); addRigid('leather', js, 'riderArm');
      const jt = cone(0.03 * k, 0.14 * k, 4); setColor(jt, flat('#e6eaf0')); abs(jt, 'riderArm', [0, -0.38 * k, 0.96 * k], [Math.PI / 2, 0, 0]); addRigid('metal', jt, 'riderArm'); }
  }

  // ---- fur shells (high tier): the torso, neck, legs and tail re-lofted a little larger, cut into strand dots by the shell shader
  if (shells.length && mats.shell) {
    const NSH = DT.shells;
    for (let L = 1; L <= NSH; L++) {
      const t = L / NSH;
      for (const sh of shells) {
        const geo = loft(sh.ctrl, Object.assign({}, sh.o, { infl: sh.infl * t * 1.6 })); setColor(geo, (x, y, z, nx, ny, nz) => { const c = sh.colorFn(x, y, z, nx, ny, nz); return c.clone().multiplyScalar(0.92 + 0.14 * t); });
        const n = geo.attributes.position.count, lay = new Float32Array(n).fill(t); geo.setAttribute('aLayer', new THREE.BufferAttribute(lay, 1)); addSkin('shell', geo, skinKnots(geo, sh.kn, sh.bz));
      }
    }
  }

  }   // end of the geometry build (skipped on a cache hit)

  // ---- merge to one skinned mesh per material
  const parts = {};
  function rebuild() {
    for (const k in parts) { root.remove(parts[k]); if (!parts[k].geometry.userData.shared) parts[k].geometry.dispose(); delete parts[k]; }
    const skeleton = new THREE.Skeleton(bones, bones.map((b) => new THREE.Matrix4().makeTranslation(...rest.get(b).toArray()).invert()));
    const by = {}; for (const it of items) (by[it.mat] = by[it.mat] || []).push(it);
    const built = cached || {};
    if (!cached) for (const k in by) {
      const list = by[k]; let nv = 0, ni = 0; for (const it of list) { nv += it.geo.attributes.position.count; ni += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
      const hasLayer = k === 'shell', pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), clr = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), lay = hasLayer ? new Float32Array(nv) : null, idx = new Uint32Array(ni); let vo = 0, io = 0;
      for (const it of list) {
        const gg = it.geo, n = gg.attributes.position.count; if (!gg.attributes.normal) gg.computeVertexNormals();
        pos.set(gg.attributes.position.array, vo * 3); nor.set(gg.attributes.normal.array, vo * 3); clr.set(gg.attributes.color.array, vo * 3); if (lay && gg.attributes.aLayer) lay.set(gg.attributes.aLayer.array, vo);
        if (it.skin) { si.set(it.skin.i, vo * 4); sw.set(it.skin.w, vo * 4); } else for (let i = 0; i < n; i++) { si[(vo + i) * 4] = it.bone; sw[(vo + i) * 4] = 1; }
        if (gg.index) for (let i = 0; i < gg.index.count; i++) idx[io++] = gg.index.getX(i) + vo; else for (let i = 0; i < n; i++) idx[io++] = vo + i;
        vo += n;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); if (lay) geo.setAttribute('aLayer', new THREE.BufferAttribute(lay, 1)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.boundingSphere = new THREE.Sphere(new V3(0, 1, 0), 8); geo.boundingBox = new THREE.Box3(new V3(-8, -1, -8), new V3(8, 8, 8)); geo.userData.shared = true; built[k] = geo;
    }
    if (!cached) { GEO_CACHE.set(ckey, built); while (GEO_CACHE.size > 9) { const old = GEO_CACHE.keys().next().value; for (const g2 of Object.values(GEO_CACHE.get(old))) g2.dispose(); GEO_CACHE.delete(old); } }
    for (const k in built) {
      const geo = built[k], m = new THREE.SkinnedMesh(geo, mats[k]); m.name = k; m.castShadow = k !== 'shell'; m.receiveShadow = false; m.frustumCulled = false; root.add(m); m.bind(skeleton, new THREE.Matrix4()); parts[k] = m;
    }
    rig.skeleton = skeleton; rig.parts = parts;
  }

  // ------------------------------------------------------------------ rig object
  const squash = new Spring1(260, 15), flashState = { t: 0, dur: 0.12, color: new THREE.Color(0.7, 0.4, 0.25) };
  // blood: wounds hold their own soak (how much blood the fur around THAT wound has taken); addBlood() lands on the wound that was just placed, so stains stay where the hits were
  const blood = { amount: 0, fresh: 0, wounds: [], wi: 0, last: -1 };
  const syncBlood = () => { bu.uBlood.value = blood.amount * 0.55; bu.uBOn.value = blood.amount > 0.002 || blood.wounds.length ? 1 : 0; };
  const setSoak = (i) => { const w = blood.wounds[i]; if (!w) return; w.soak = clamp(w.soak, 0, 2.2); bu.uWoundD.value[i].w = Math.max(0.05, w.soak); };
  const rig = {
    root, body, joints: J, sockets: {}, mats, palette: { skin: sp.fur, hair: sp.mane, plume: sp.belly, cloth: '#7a1f1f', metal: '#b8b2a0' }, secondary: [], postUpdate: [], build: { height: 1 }, look,
    beast: kind, style: kind, portraitD: { lion: 3.7, wolf: 2.35, bear: 3.7, boar: 3.05, nemean: 6.4, elephant: 8.4 }[kind] || 2.6, nameH: SS(sp.nameH / S) * (opts.scale || 1), beastR: sp.r * (opts.scale || 1), bodyH: sp.h, parts, severed: {}, held: { R: true, L: true }, detail: dname, g, size: S, seed,
    setPalette(p) { Object.assign(rig.palette, p); },
    flash(dur = 0.12, color) { flashState.t = dur; flashState.dur = dur; if (color) flashState.color.set(color); },
    squashKick(a) { squash.kick(a * (sp.size > 1.4 ? 0.4 : 1)); },
    setExertion() {},
    localDir(wx, wz) { const y = root.rotation.y, c = Math.cos(y), s = Math.sin(y), l = Math.hypot(wx, wz) || 1; return { x: (wx * c - wz * s) / l, z: (wx * s + wz * c) / l }; },
    resetSecondary() { animator.reset(); },
    triangles() { let n = 0; root.traverse((o) => { if (o.isMesh && o.geometry && o.visible) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n | 0; },
    drawCalls() { let n = 0; root.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; },
    // gore hooks (rest space = root space; gore.js passes humanoid-sized offsets, so scale them by the beast size)
    bloodU: bu, blood,
    jointRest(name, local = [0, 0, 0]) { const j = J[name] || J.chest, k = Math.max(0.55, S * (kind === 'elephant' ? 1.4 : 1)); return rest.get(j).clone().add(new V3(local[0] * k, local[1] * k, local[2] * k)); },
    addBlood(amount, fresh = 1) {
      blood.amount = clamp(blood.amount + amount, 0, 1); blood.fresh = Math.max(blood.fresh, fresh);
      const nw = blood.wounds.length; if (nw) { const li = blood.last >= 0 ? blood.last : nw - 1; for (let i = 0; i < nw; i++) { blood.wounds[i].soak += amount * (i === li ? 2.4 : 0.12); setSoak(i); } }
      syncBlood();
    },
    setBlood(amount, fresh = 0) { blood.amount = clamp(amount, 0, 1); blood.fresh = fresh; bu.uBFresh.value = fresh; if (!amount) for (let i = 0; i < blood.wounds.length; i++) { blood.wounds[i].soak = 0.08; setSoak(i); } syncBlood(); },
    addWound(pt, dir, half = 0.09, strength = 1) { const i = blood.wounds.length < 6 ? blood.wounds.length : (blood.wi = ((blood.wi | 0) + 1) % 6); blood.wounds[i] = { x: pt.x, y: pt.y, z: pt.z, half, s: strength, soak: 0.22 * strength }; blood.last = i; bu.uWound.value[i].set(pt.x, pt.y, pt.z, half * Math.max(1, S * 0.8)); bu.uWoundD.value[i].set(dir.x, dir.y, dir.z, blood.wounds[i].soak); syncBlood(); return i; },
    clearBlood() { blood.amount = 0; blood.fresh = 0; blood.wounds.length = 0; blood.wi = 0; blood.last = -1; for (const v of bu.uWound.value) v.set(0, 0, 0, 0); for (const v of bu.uWoundD.value) v.set(0, 0, 0, 0); bu.uBFresh.value = 0; syncBlood(); },
    sever() { return null }, partFrame() { return null }, restoreParts() {}, reattachAll() {}, detachable() { return []; }, detachPart() { return null; },
    update(dt) { animator.update(dt); },
    dispose() { root.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); for (const k in mats) mats[k].dispose(); rig.skeleton && rig.skeleton.dispose(); },
    onEvent: null, setWeapon() {},
  };
  const animator = new BeastAnimator(rig, sp, J, rest, squash, flashState, bu, mats);
  rig.animator = animator; rig._items = items;
  rebuild();
  if (opts.scale && opts.scale !== 1) root.scale.setScalar(opts.scale);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.name !== 'shell'; o.receiveShadow = false; o.frustumCulled = false; } });
  animator.reset(); rig.update(1 / 60);
  return rig;
}

// ------------------------------------------------------------------ animator: base layer (idle life + gaits + paw planting), action layer (clips), additive hurt spring, crossfade snapshot
// PERF: the per-channel loops of BeastAnimator.update are small functions of their own: the big update() runs in the interpreter for its first seconds (and after a deopt), where every double
// result is a heap number; a tiny loop function tiers up after a few calls and then runs unboxed.
function composeOut(out, pb, pa, mask, w) { for (let i = 0; i < NCH; i++) out[i] = mask[i] ? pb[i] + (pa[i] - pb[i]) * w : pb[i]; }
function fadeOut(out, snap, k) { for (let i = 0; i < NCH; i++) out[i] = snap[i] + (out[i] - snap[i]) * k; }
/** joint quaternions straight from the XYZ euler channels (three's Euler.set + onChange boxed the arguments and re-derived the quaternion through a callback, per joint per frame);
 *  the joint Euler angles are never read, matrices read the quaternion */
function writeQuats(JQ, out) { for (let k = 0; k < JQ.length; k++) writeQuat(JQ[k].q, out, JQ[k].o); }
function writeQuat(q, out, o) {
  const x = out[o], y = out[o + 1], z = out[o + 2], c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  q._x = s1 * c2 * c3 + c1 * s2 * s3; q._y = c1 * s2 * c3 - s1 * c2 * s3; q._z = c1 * c2 * s3 + s1 * s2 * c3; q._w = c1 * c2 * c3 - s1 * s2 * s3;
}
// gait tables: phase offsets for LF, RF, LH, RH, duty factor (fraction of the cycle a paw is on the ground)
const GAITS = { walk: { o: [0.25, 0.75, 0.0, 0.5], d: 0.7 }, trot: { o: [0.0, 0.5, 0.5, 0.0], d: 0.54 }, gallop: { o: [0.55, 0.45, 0.0, 0.1], d: 0.38 }, pace: { o: [0.0, 0.5, 0.0, 0.5], d: 0.68 } };
const _ik = { p1: new V3(), p2: new V3(), a: new V3(), r: new V3(), c: new V3() };
/** facial expression presets (animator.setMood): snarl = lips pulled up and back (teeth), brows frown; squint = lids half shut; wide = lids open wide, brows up (enraged); jaw = mouth part */
const MOODS = { calm: { snarl: 0, squint: 0, wide: 0, jaw: 0 }, wary: { snarl: 0.08, squint: 0.2, wide: 0, jaw: 0 }, angry: { snarl: 0.55, squint: 0.4, wide: 0, jaw: 0.04 }, growl: { snarl: 0.8, squint: 0.35, wide: 0, jaw: 0.22 }, snarl: { snarl: 1, squint: 0.5, wide: 0, jaw: 0.1 }, enraged: { snarl: 0.8, squint: 0, wide: 1, jaw: 0.14 } };
// foot locking scratch (stance paws are pinned in world space by a damped 3 DOF solve on shoulder pitch, shoulder roll and elbow pitch; no allocation per frame)
const _E = new THREE.Euler(), _L4 = new THREE.Matrix4(), _M0 = new THREE.Matrix4(), _M1 = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _fA = new V3(), _fB = new V3(), _tg = new V3();
const _v3 = new Float64Array(3), _Jm = new Float64Array(9), _Am = new Float64Array(9), _bv = new Float64Array(3), _dl = new Float64Array(3);
/** sole position (world) of a leg for the angle offsets v = [d shoulder pitch, d shoulder roll, d elbow pitch] added to the pose in lg.q (the wrist keeps the paw's total pitch) */
function legFK(lg, v, out) {
  const q = lg.q;
  _L4.makeRotationFromEuler(_E.set(q[0] + v[0], q[1], q[2] + v[1], 'XYZ')).setPosition(lg.s); _M0.multiplyMatrices(lg.par.matrixWorld, _L4);
  _L4.makeRotationFromEuler(_E.set(q[3] + v[2], q[4], q[5], 'XYZ')).setPosition(lg.a); _M1.multiplyMatrices(_M0, _L4);
  _L4.makeRotationFromEuler(_E.set(q[6] - v[0] - v[2], q[7], q[8], 'XYZ')).setPosition(lg.b); _M2.multiplyMatrices(_M1, _L4);
  out.copy(lg.c).applyMatrix4(_M2);
}
/** damped least squares: move v so the sole reaches tg (3 iterations from the current offsets in v) */
function legSolve(lg, tg, v, lim) {
  for (let it = 0; it < 3; it++) {
    legFK(lg, v, _fA); const ex = tg.x - _fA.x, ey = tg.y - _fA.y, ez = tg.z - _fA.z; if (ex * ex + ey * ey + ez * ez < 1e-6) break;
    for (let k = 0; k < 3; k++) { const o = v[k]; v[k] = o + 0.01; legFK(lg, v, _fB); v[k] = o; _Jm[k] = (_fB.x - _fA.x) / 0.01; _Jm[3 + k] = (_fB.y - _fA.y) / 0.01; _Jm[6 + k] = (_fB.z - _fA.z) / 0.01; }   // J[row][col]
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) _Am[r * 3 + c] = _Jm[r] * _Jm[c] + _Jm[3 + r] * _Jm[3 + c] + _Jm[6 + r] * _Jm[6 + c] + (r === c ? 0.02 : 0);   // JtJ + damping
    _bv[0] = _Jm[0] * ex + _Jm[3] * ey + _Jm[6] * ez; _bv[1] = _Jm[1] * ex + _Jm[4] * ey + _Jm[7] * ez; _bv[2] = _Jm[2] * ex + _Jm[5] * ey + _Jm[8] * ez;
    const a = _Am[0], b = _Am[1], c = _Am[2], d = _Am[3], e = _Am[4], f = _Am[5], g = _Am[6], h = _Am[7], i = _Am[8];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C; if (Math.abs(det) < 1e-9) break;
    const idt = 1 / det; _dl[0] = (A * _bv[0] + (-(b * i - c * h)) * _bv[1] + (b * f - c * e) * _bv[2]) * idt; _dl[1] = (B * _bv[0] + (a * i - c * g) * _bv[1] + (-(a * f - c * d)) * _bv[2]) * idt; _dl[2] = (C * _bv[0] + (-(a * h - b * g)) * _bv[1] + (a * e - b * d) * _bv[2]) * idt;
    for (let k = 0; k < 3; k++) { const st = _dl[k] > 0.5 ? 0.5 : _dl[k] < -0.5 ? -0.5 : _dl[k]; let nv = v[k] + st; nv = nv < lim[k * 2] ? lim[k * 2] : nv > lim[k * 2 + 1] ? lim[k * 2 + 1] : nv; v[k] = nv; }
  }
}
class BeastAnimator {
  constructor(rig, sp, J, rest, squash, flashState, bu, mats) {
    this.rig = rig; this.sp = sp; this.J = J; this.squash = squash; this.flashState = flashState; this.mats = mats;
    this.clips = clipsFor(sp); this.mv = { vz: 0, vx: 0 }; this.speed = 0; this.phase = 0; this.t = 0; this.breath = 0; this.state = 'move'; this.action = null; this.dead = false; this.armed = 1; this.exert = 0;
    this.look = { target: null, w: 0 }; this.ik = { hand: null }; this.timeScale = 1; this.hitStopT = 0; this.onEvent = null; this.hurtS = new Spring1(220, 12); this.hurtDir = 1; this.stepPh = [0, 0, 0, 0];
    this.pb = new Float32Array(NCH); this.pa = new Float32Array(NCH); this.out = new Float32Array(NCH); this.snap = new Float32Array(NCH); this.snapT = 1; this.snapDur = 0.15; this.lowest = 0; this.groundOff = 0; this.mode = ''; this.tailPh = 0;
    this.stateClip = null; this.tw = 0; this.gw = { walk: 0, run: 0, move: 0 }; this.go = 0;
    this.seed = (rig.seed || 0) * 0.37; this.fid = { slot: -1, type: 0, t0: 0, dur: 1, side: 1 }; this.legW = [1, 1, 1, 1]; this.lastYaw = null; this.lastSpeed = 0; this.lastBY = 0; this.bobV = 0;
    // secondary motion springs: tail yaw / pitch, ears, mane, flags
    this.sec = { tailY: new Spring1(40, 4.5), tailP: new Spring1(46, 5), earL: new Spring1(110, 7), earR: new Spring1(110, 7), mane: new Spring1(52, 5), maneS: new Spring1(46, 4.5), flag: new Spring1(70, 3.2) };
    this.go2 = [sp.gait.strideW, sp.gait.strideT, sp.gait.strideR]; this.gaitMix = { s1: 0, s2: 0 }; this.offs = new Float32Array([0.25, 0.75, 0, 0.5]); this.blinkT = 0;
    const F = sp.front, H = sp.hind; this.legL = [Math.hypot(F.up[0] + F.lo[0] - F.pad, F.up[1] + F.lo[1]), 0, Math.hypot(H.up[0] + H.lo[0] - H.pad, H.up[1] + H.lo[1])].map((v) => v * sp.size); this.legJ = [['shoulderL', 'elbowL', 'wristL'], ['shoulderR', 'elbowR', 'wristR'], ['hipL', 'kneeL', 'ankleL'], ['hipR', 'kneeR', 'ankleR']].map((r) => r.map((n) => J[n]));
    this.pads = [F.pad, F.pad, H.pad, H.pad].map((v) => v * sp.size); this.stance = [1, 1, 1, 1];
    // expression layer (setMood) and stance paw locks
    this.mood = { snarl: 0, squint: 0, wide: 0, jaw: 0 }; this.moodT = { snarl: 0, squint: 0, wide: 0, jaw: 0 }; this.moodName = 'calm'; this.enraged = false; this.stride = 1;
    this.lkOn = new Uint8Array(4); this.lkW = new Float32Array(4); this.lk = new Float64Array(12); this.ikD = new Float64Array(12); this.ikV = new Float64Array(3); this.stT = new Float32Array(4).fill(-1); this.stF = new Float64Array(8); this.drop = 0; this.dropN = 0; this.lastRoot = { x: 0, z: 0, yaw: 0, ok: false };
    const col = sp.id === 'elephant'; this.leash = (col ? 0.09 : 0.2) * this.legL[0]; this.stepAt = (col ? 0.07 : 0.14) * this.legL[0]; this.stepLift = (col ? 0.12 : 0.2) * this.legL[0]; this.slip = 0;
    this.lg = this.legJ.map((jr, i) => ({ par: jr[0].parent, s: jr[0].position, a: jr[1].position, b: jr[2].position, c: new V3(0, -this.pads[i] * 0.98, 0), Lmax: jr[1].position.length() + jr[2].position.length() + this.pads[i] * 0.98, q: new Float64Array(9), i0: LEG_I[i][0], i1: LEG_I[i][1], i2: LEG_I[i][2], lim: new Float64Array(6), front: i < 2 }));
  }
  reset() { this.pb.fill(0); this.pa.fill(0); this.out.fill(0); this.snap.fill(0); this.phase = 0; this.action = null; this.dead = false; this.state = 'move'; this.snapT = 1; this.groundOff = 0; this.hurtS.x = 0; this.hurtS.v = 0; this.go = 0; this.rig.body.position.set(0, 0, 0); this.rig.body.rotation.set(0, 0, 0); this.lastYaw = null; for (const k in this.sec) { this.sec[k].x = 0; this.sec[k].v = 0; } this.fid.slot = -1; this.lkOn.fill(0); this.lkW.fill(0); this.ikD.fill(0); this.stT.fill(-1); this.lastRoot.ok = false; this.drop = 0; this.dropN = 0; }
  setMove(vz, vx = 0) { this.mv.vz = vz; this.mv.vx = vx; }
  /** facial expression: 'calm' | 'wary' | 'angry' | 'growl' | 'snarl' | 'enraged', or {snarl, squint, wide, jaw} (0..1). Smoothed into brows, lips, lids, jaw and ears; clips override the channels they name. */
  setMood(m) { const P = typeof m === 'string' ? (MOODS[m] || MOODS.calm) : Object.assign({ snarl: 0, squint: 0, wide: 0, jaw: 0 }, m); this.moodName = typeof m === 'string' ? m : 'custom'; this.enraged = this.moodName === 'enraged'; Object.assign(this.moodT, { snarl: 0, squint: 0, wide: 0, jaw: 0 }, P); }
  setWeapon() {} setAlert() {}
  setState(name) { if (name === 'move' || !name) { if (this.state !== 'move') this.fade(0.2); this.state = 'move'; this.stateClip = null; return; } this.fade(0.2); this.state = name; this.stateClip = this.clips[name] || (name === 'victory' || name === 'cheer' || name === 'taunt' ? this.clips.victory : null); if (this.stateClip) this.action = { c: this.stateClip, t: 0, speed: 1, hold: true, ended: false, ev: 0 }; }
  fade(d) { this.snap.set(this.out); this.snapT = 0; this.snapDur = d; }
  clipInfo(name) { const c = this.clips[name]; if (!c) return null; return { dur: c.dur, swingAt: c.swing, hitAt: c.hit, recoverAt: c.recover }; }
  play(name, o = {}) {
    const c = this.clips[name] || this.clips.bite; if (!c || c.add) return null; if (this.dead) return null;
    this.fade(c.name === 'pounce' ? 0.04 : 0.07); this.action = { c, t: 0, speed: o.speed || 1, hold: c.hold, ended: false, ev: 0, loop: c.loop && o.hold !== false };
    if (name.startsWith('death')) this.dead = true; return c;
  }
  release() { if (this.action && this.action.c.loop && !this.dead) this.action.loop = false; else if (this.action && this.action.hold && !this.dead && this.action.c !== this.stateClip) this.action = null; }
  hurt(dir = 1, amp = 1) { const d = typeof dir === 'object' ? dir.x : dir; this.hurtS.kick(0.9 * Math.min(1.6, amp)); this.hurtDir = d || 1; this.sec.tailP.push(-3 * amp); this.sec.mane.push(-2.5 * amp); this.sec.earL.push(-4); this.sec.earR.push(-4); this.rig.flash && 0; }
  stagger(dir = 1) { this.hurtS.kick(0.7); }
  knockdown(dir = 1) { this.play('knockdown'); } getUp() { this.play('getup'); }
  die(dir = 1, o = {}) { if (this.dead) return; this.play('death'); this.dead = true; this.deadDir = typeof dir === 'object' ? dir.x : dir; }
  hitStop(dur = 0.06) { this.hitStopT = dur; }
  emit(n, extra) { if (this.onEvent) this.onEvent(n, extra); if (this.rig.onEvent) this.rig.onEvent(n, extra); }

  /** gait: walk, trot or gallop chosen by speed (pace for elephants), the cycle advances with the distance travelled; the leg swing is sized so a paw on the ground travels as far as the body
   *  does (no skating), swing paws lift and fold, the body bobs over the stance legs. The vertical paw planting runs in plant() after the pose is written. */
  gait(dt) {
    const G = this.sp.gait, v = Math.sqrt(this.mv.vz * this.mv.vz + this.mv.vx * this.mv.vx), pb = this.pb, S = this.sp.size, big = this.sp.id === 'elephant', pace = !!G.pace;
    this.speed += (v - this.speed) * Math.min(1, dt * 10); const gv = this.speed;
    const wk = sm(0.12, G.walkV * 0.8, gv), s1 = pace ? 0 : sm(G.walkV * 1.12, G.trotV * 0.95, gv), s2 = sm(G.trotV * 1.08, G.runV * 0.86, gv), gm = this.gaitMix; gm.s1 += (s1 - gm.s1) * Math.min(1, dt * 6); gm.s2 += (s2 - gm.s2) * Math.min(1, dt * 6);
    const stride0 = lerp(lerp(G.strideW, G.strideT, gm.s1), G.strideR, gm.s2) * S, W = pace ? GAITS.pace : GAITS.walk, T = pace ? GAITS.pace : GAITS.trot, R = GAITS.gallop;
    const duty = lerp(lerp(W.d, T.d, gm.s1), R.d, gm.s2);
    // stride matched to the reach: a stance paw has to travel as far as the body does (stride x duty) and a leg only swings so far, so a sprint takes shorter, quicker strides instead of skating
    const reach = Math.min(this.legL[0], this.legL[2]) * (G.rf || 0.46), stride = Math.min(stride0, (2 * reach) / Math.max(0.3, duty)); this.stride = stride;
    if (v > 0.12) this.phase = (this.phase + (Math.sign(this.mv.vz || 1) * v * dt) / stride) % 1; if (this.phase < 0) this.phase += 1;   // the cycle follows the DISTANCE actually travelled (raw speed, not the smoothed one)
    const ph = this.phase, half = stride * duty * 0.5, am = sm(0.04, 0.4, v);
    const rn = gm.s2, tn = gm.s1 * (1 - gm.s2);
    for (let i = 0; i < 4; i++) {   // 0 LF, 1 RF, 2 LH, 3 RH
      const o = lerp(lerp(W.o[i], T.o[i], gm.s1), R.o[i], gm.s2), front = i < 2, jn = LEG_I[i], Lg = this.legL[front ? 0 : 2], c = (ph + o + 1) % 1;
      let fz, lift = 0, st = 1;   // fz: how far forward of the neutral paw position (metres); lift: 0..1 swing arc
      if (c < duty) { const u = c / duty; fz = half * (1 - 2 * u); } else { const u = (c - duty) / (1 - duty), e = u * u * (3 - 2 * u); fz = -half + 2 * half * e; lift = Math.sin(Math.PI * u); st = 0; }
      const ang = -Math.asin(clamp(fz / Lg, -0.95, 0.95)) * am, lf = lift * am, comp = (1 - lift) * Math.sin(Math.PI * clamp(c / duty, 0, 1)) * am * (c < duty ? 1 : 0);
      if (front) { pb[jn[0]] = ang * 0.92 - lf * 0.2; pb[jn[1]] = (0.1 + 1.25 * lf * lf + 0.12 * comp) * (big ? 0.55 : 1) - 0.04; pb[jn[2]] = -pb[jn[0]] * 0.5 - pb[jn[1]] * 0.5 + 0.05 + lf * 0.35; }
      else { pb[jn[0]] = ang * 1.0 + 0.06 + lf * 0.12; pb[jn[1]] = (0.1 + 1.1 * lf * lf + 0.1 * comp) * (big ? 0.55 : 1) + 0.1 + 0.1 * clamp(-ang, 0, 1); pb[jn[2]] = -pb[jn[0]] * 0.45 - pb[jn[1]] * 0.55 + 0.06 + lf * 0.45; }
      pb[jn[0] + 2] = 0;
      this.stance[i] = st < 1 ? 1 - sm(0.0, 0.2, lift) * 1 : 1; this.stance[i] = c < duty ? 1 : 0;
      const prev = this.stepPh[i]; this.stepPh[i] = c; if (gv > 0.5 && prev > c + 0.5) this.emit('step', { side: i & 1 ? 'R' : 'L', front });
    }
    // body: bob over the stance legs (twice per stride in the walk and trot, once in the gallop), shoulder roll, spine wave and extension in the gallop
    const bob = Math.sin(ph * TAU * 2 + 0.4) * 0.016 * S * wk * (1 + rn * 1.2) * (big ? 0.8 : 1);
    pb[BY] = bob; pb[BZ] = Math.sin(ph * TAU - 0.5) * 0.045 * wk * (0.5 + rn) * S + (this.mode === 'charge' ? 0.12 : 0); pb[BR] = Math.sin(ph * TAU) * 0.024 * wk * (1 - rn * 0.7); pb[BX] = Math.sin(ph * TAU) * 0.012 * S * wk * (1 - rn);
    pb[BP] = Math.sin(ph * TAU * (rn > 0.5 ? 1 : 2) - 0.6) * 0.018 * wk * (0.3 + rn);
    pb[JI.spine * 3] = Math.sin(ph * TAU - 0.9) * 0.14 * wk * rn + Math.sin(ph * TAU * 2) * 0.012 * wk * tn; pb[JI.chest * 3] = Math.sin(ph * TAU - 0.2) * 0.07 * wk * (0.4 + rn); pb[JI.hips * 3] = -Math.sin(ph * TAU - 0.9) * 0.1 * wk * rn;
    pb[JI.chest * 3 + 1] = Math.sin(ph * TAU) * 0.07 * wk * (1 - rn) * (1 - tn * 0.6); pb[JI.hips * 3 + 1] = -Math.sin(ph * TAU) * 0.07 * wk * (1 - rn) * (1 - tn * 0.6);
    pb[JI.chest * 3 + 2] = -Math.sin(ph * TAU) * 0.03 * wk; pb[JI.hips * 3 + 2] = Math.sin(ph * TAU) * 0.035 * wk;
    // head: nods with the stride, held low when prowling and charging, steadier and higher in the gallop
    const charge = this.mode === 'charge' ? 1 : 0, low = lerp(0, 0.2, wk * (1 - rn)) + charge * 0.5;
    pb[JI.neck * 3] += low * 0.6 - Math.sin(ph * TAU * 2 + 1) * 0.035 * wk * (1 - rn * 0.5) + charge * 0.2 - Math.sin(ph * TAU + 0.4) * 0.07 * wk * rn; pb[JI.head * 3] += low * 0.4 + Math.sin(ph * TAU * 2 + 0.5) * 0.045 * wk * (1 - rn * 0.5);
    this.gw.walk = wk; this.gw.run = rn; this.gw.move = sm(0.08, 0.8, gv);
  }
  /** idle life: breathing, weight shifts, fidgets (look around, ear flick, tail swish, paw lift, yawn / sniff / root / trunk lift), blinks, eyes that lead the head, secondary springs */
  life(dt) {
    const sp = this.sp, S = sp.size, pb = this.pb, id = sp.id, big = id === 'elephant', t = this.t + this.seed, idle = 1 - this.gw.move, alive = this.dead ? 0 : 1, mv = this.gw.move, K = S * (big ? 2.2 : 1);
    this.legW[0] = 1; this.legW[1] = 1; this.legW[2] = 1; this.legW[3] = 1;
    const br = Math.sin(this.breath), br2 = Math.sin(this.breath * 2 + 0.7) * 0.3;
    pb[JI.chest * 3] += br * 0.026 * alive; pb[JI.neck * 3] += br * 0.014 * alive - 0.03; pb[BY] += br * 0.005 * K * alive; pb[JI.spine * 3] -= br * 0.01 * alive;
    pb[JI.shoulderL * 3] += br * 0.014 * alive; pb[JI.shoulderR * 3] += br * 0.014 * alive; pb[MANE_I[0]] += br * 0.025; pb[MANE_I[1]] += br * 0.02 + br2 * 0.01;
    // head wander (the eyes lead it) and ear / tail life
    const hy = (Math.sin(t * 0.37) * 0.14 + Math.sin(t * 0.91 + 1) * 0.07) * idle * alive, hp = Math.sin(t * 0.5) * 0.04 * idle * alive;
    pb[JI.head * 3] += hp; pb[JI.head * 3 + 1] += hy; pb[JI.neck * 3 + 1] += hy * 0.4;
    pb[JI.jaw * 3] += 0.03 + (this.dead ? 0.1 : 0);
    // ---- fidgets: one every few seconds, picked by a hash of the time slot
    const fid = this.fid, slot = Math.floor(t / 3.1), per = 3.1;
    if (slot !== fid.slot) { fid.slot = slot; const hh = h01(slot * 7.77 + this.seed * 0.01); fid.type = hh < 0.2 ? 1 : hh < 0.38 ? 2 : hh < 0.52 ? 3 : hh < 0.66 ? 4 : hh < 0.78 ? 5 : hh < 0.9 ? 6 : 0; fid.t0 = slot * per + h01(slot * 3.3) * 0.8; fid.dur = 1.0 + h01(slot * 1.7) * 1.2; fid.side = h01(slot * 9.1) < 0.5 ? 1 : -1; fid.i = Math.floor(h01(slot * 5.5) * 2); }
    const u = clamp((t - fid.t0) / fid.dur, 0, 1), env = fid.type && u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0, e2 = env * env * (3 - 2 * env), w = e2 * idle * alive;
    if (w > 0.001) {
      if (fid.type === 1) { pb[JI.head * 3 + 1] += fid.side * 0.55 * w; pb[JI.neck * 3 + 1] += fid.side * 0.3 * w; pb[JI.chest * 3 + 1] += fid.side * 0.12 * w; pb[JI.head * 3 + 2] += fid.side * 0.1 * w; }   // look around
      else if (fid.type === 2) { const e = EAR_I[fid.i]; pb[e] += -0.8 * Math.pow(Math.sin(u * Math.PI * 3), 2) * idle * alive; pb[e + 2] += 0.2 * w; }   // ear flick
      else if (fid.type === 3) { this.sec.tailY.push(Math.sin(u * 16) * 0.5 * w); pb[TAIL_I[0] + 1] += Math.sin(u * 14) * 0.5 * w; pb[TAIL_I[1] + 1] += Math.sin(u * 14 - 1) * 0.5 * w; pb[TAIL_I[2] + 1] += Math.sin(u * 14 - 2) * 0.55 * w; }   // tail swish
      else if (fid.type === 4) { pb[BX] += fid.side * 0.035 * K * w; pb[BR] += fid.side * 0.03 * w; pb[JI.hips * 3 + 2] += fid.side * 0.05 * w; pb[JI.spine * 3 + 2] += -fid.side * 0.03 * w; }   // weight shift
      else if (fid.type === 5) { const f = fid.i ? 1 : 0, j = LEG_I[f]; pb[j[0]] += -0.5 * w; pb[j[1]] += 0.9 * w; pb[j[2]] += 0.4 * w; this.legW[f] = 1 - w; }   // paw lift
      else if (fid.type === 6) {   // species behaviour
        if (id === 'lion' || id === 'nemean') { pb[JI.head * 3] += -0.35 * w; pb[JI.neck * 3] += -0.3 * w; pb[JI.jaw * 3] += 0.9 * Math.sin(Math.PI * clamp(u * 1.3, 0, 1)) * w; pb[JI.chest * 3] += -0.05 * w; pb[LID_I[0]] += 1.1 * w; pb[LID_I[1]] += 1.1 * w; }   // yawn
        else if (id === 'wolf') { pb[JI.head * 3] += (0.15 + Math.sin(this.t * 40) * 0.05) * w; pb[JI.neck * 3] += 0.25 * w; pb[JI.head * 3 + 1] += Math.sin(this.t * 3) * 0.12 * w; }   // sniff the sand
        else if (id === 'bear') { pb[JI.neck * 3] += 0.35 * w; pb[JI.head * 3] += 0.25 * w; pb[JI.head * 3 + 1] += Math.sin(u * 9) * 0.4 * w; pb[JI.chest * 3 + 1] += Math.sin(u * 9) * 0.1 * w; }   // sway the head low
        else if (id === 'boar') { pb[JI.neck * 3] += 0.7 * w; pb[JI.head * 3] += 0.45 * w + Math.sin(this.t * 14) * 0.08 * w; pb[JI.shoulderR * 3] += -0.3 * Math.sin(u * 18) * w; }   // root at the sand
        else if (big) { pb[TRUNK_I[0]] += -0.8 * w; pb[TRUNK_I[1]] += -0.7 * w; pb[TRUNK_I[2]] += -0.5 * w; pb[TRUNK_I[3]] += -0.5 * w; pb[EAR_I[0] + 1] += 0.6 * w; pb[EAR_I[1] + 1] += -0.6 * w; pb[JI.head * 3] += -0.15 * w; }   // trunk up, ears out
      }
    }
    // ---- eyes: gaze leads and counters the head, with small flicks; blinks every few seconds, lids heavier at rest and narrowed when fighting
    const eyaw = -(pb[JI.head * 3 + 1] + pb[JI.neck * 3 + 1]) * 0.6 + Math.sin(t * 1.9) * 0.05 + Math.sin(t * 5.3) * 0.015 + Math.sin(t * 0.7 + 2) * 0.1, epit = -(pb[JI.head * 3] + pb[JI.neck * 3]) * 0.35 + Math.sin(t * 1.3) * 0.03;
    const eout = this.sp.id === 'elephant' ? 0.5 : this.sp.id === 'boar' ? 0.45 : 0.3; for (let i = 0; i < 2; i++) { pb[EYE_I[i] + 1] = eyaw * alive + (i ? -eout : eout); pb[EYE_I[i]] = epit * alive; }
    const per2 = 3.4 + h01(Math.floor(t / 4.1) + 3) * 2.2, bt = ((t % per2) + per2) % per2, blink = bt < 0.15 ? Math.sin(Math.PI * bt / 0.15) : 0, fight = this.action && !this.action.hold ? 0.35 : 0, base = (0.1 + 0.1 * idle + 0.1 * Math.max(0, br) * idle) * alive;
    // ---- expression: the mood eases in (snarl: brows frown and lips pull back to show the teeth; squint: lids half shut; wide: lids and brows up, panting jaw)
    const mo = this.mood, mt = this.moodT, mk = dt > 0 ? Math.min(1, dt * 7) : 1; mo.snarl += (mt.snarl - mo.snarl) * mk; mo.squint += (mt.squint - mo.squint) * mk; mo.wide += (mt.wide - mo.wide) * mk; mo.jaw += (mt.jaw - mo.jaw) * mk;
    const sn = mo.snarl * alive, sq = mo.squint * alive, wd = mo.wide * alive;
    const lid = base + (1.35 - base) * blink * alive + fight + sq * 0.5 - wd * (base + 0.34);
    pb[LID_I[0]] += lid; pb[LID_I[1]] += lid;
    { const bx = sn * 0.5 + sq * 0.22 - wd * 0.2, bz = sn * 0.3 + sq * 0.1; pb[BROW_I[0]] += bx; pb[BROW_I[1]] += bx; pb[BROW_I[0] + 2] += bz; pb[BROW_I[1] + 2] -= bz;
      pb[LIP_I[0]] += -0.25 * sn; pb[LIP_I[1]] += -0.25 * sn; pb[LIP_I[0] + 2] += sn; pb[LIP_I[1] + 2] -= sn;
      pb[JI.jaw * 3] += (mo.jaw + sn * 0.06) * alive + Math.sin(this.t * 9.5) * 0.035 * wd; pb[JI.head * 3] += 0.05 * sn;
      if (!big) { const ep = -(sn * 0.55 + sq * 0.25); pb[EAR_I[0]] += ep; pb[EAR_I[1]] += ep; } else { pb[EAR_I[0] + 1] += wd * 0.35 + sn * 0.15; pb[EAR_I[1] + 1] -= wd * 0.35 + sn * 0.15; } }
    // ---- secondary motion: tail, ears, mane and banners lag behind the body (springs driven by the turn rate and the speed changes)
    const yaw = this.rig.root.rotation.y; let yr = 0; if (this.lastYaw !== null && dt > 0) { let d = yaw - this.lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yr = clamp(d / dt, -8, 8); } this.lastYaw = yaw;
    const ac = dt > 0 ? clamp((this.speed - this.lastSpeed) / dt, -10, 10) : 0; this.lastSpeed = this.speed;
    const bv = dt > 0 ? clamp((this.out[BY] - this.lastBY) / dt, -3, 3) : 0; this.lastBY = this.out[BY]; const sc = this.sec;
    sc.tailY.v += -yr * 1.6 * dt; sc.tailP.v += (-ac * 0.35 - bv * 1.5) * dt; sc.earL.v += (-ac * 0.5 - bv * 4 + yr * 0.4) * dt; sc.earR.v += (-ac * 0.5 - bv * 4 - yr * 0.4) * dt; sc.mane.v += (-ac * 0.35 - bv * 2.5) * dt; sc.maneS.v += -yr * 1.1 * dt; sc.flag.v += (-ac * 0.4 + Math.sin(t * 2.3) * 0.4 * dt * 60 * 0.05) * dt;
    const tY = sc.tailY.update(dt), tP = sc.tailP.update(dt), eL = sc.earL.update(dt), eR = sc.earR.update(dt), mn = sc.mane.update(dt), mS = sc.maneS.update(dt), fl = sc.flag.update(dt);
    const run = this.gw.run;
    for (let i = 1; i <= 3; i++) { const c = TAIL_I[i - 1]; pb[c + 1] += Math.sin(this.t * 1.1 - i * 0.7 + this.seed) * (0.25 - i * 0.04) * (0.6 + this.speed * 0.15) + tY * (0.5 + i * 0.15); pb[c] += -0.1 + Math.sin(this.t * 0.8 - i + this.seed) * 0.08 + run * -0.35 * (i === 1 ? 1 : 0.3) + tP * 0.45; }
    for (let si = 0; si < 2; si++) { const e = EAR_I[si], sg = si ? -1 : 1; pb[e + 1] += sg * (0.1 + Math.sin(this.t * 1.7 + this.seed + si * 2) * 0.05 * (big ? 3 : 1)); pb[e + 2] += sg * (big ? Math.sin(this.t * (0.9 + 0.6 * run) + (si ? 1.5 : 0)) * (0.14 + 0.2 * mv) : 0); pb[e] += (si ? eR : eL) * 0.6 - 0.55 * run * (big ? 0.2 : 1) + 0.08 * idle; }
    pb[MANE_I[0]] += mn * 0.5 - run * 0.1; pb[MANE_I[1]] += mn * 0.4; pb[MANE_I[0] + 1] += mS * 0.5; pb[MANE_I[1] + 1] += mS * 0.35; pb[MANE_I[0] + 2] += mS * 0.2;
    if (big) {
      for (let i = 1; i <= 4; i++) { const c = TRUNK_I[i - 1]; pb[c] += Math.sin(this.t * 0.9 - i * 0.6) * 0.18 + 0.12 * i * 0.1 + this.gw.walk * Math.sin(this.phase * TAU * 2 - i) * 0.15 + tP * 0.2 * i * 0.4; pb[c + 1] += Math.sin(this.t * 0.55 - i * 0.5) * 0.12 + tY * 0.1 * i; }
      pb[JI.rider * 3] += Math.sin(this.phase * TAU * 2 + 1) * 0.03 * this.gw.walk - br * 0.01; pb[JI.rider * 3 + 2] += Math.sin(this.phase * TAU) * 0.04 * this.gw.walk; pb[JI.riderArm * 3] += -0.25 + br * 0.02; pb[JI.rider * 3 + 1] += Math.sin(t * 0.3) * 0.08 * idle;
      for (let i = 0; i < 2; i++) { const c = FLAG_I[i]; pb[c + 1] += Math.sin(t * 2.6 + i * 1.3) * 0.22 + fl * 0.6 + (0.2 + this.speed * 0.12) * Math.sin(t * 7 + i); pb[c + 2] += Math.sin(t * 3.1 + i) * 0.1; pb[c] += Math.sin(t * 2.1 + i * 2) * 0.06; }
    }
    // legs at rest: a slight bend so the rest pose is not a statue
    for (let si = 0; si < 2; si++) { const r = LEG_I[si], h = LEG_I[si + 2]; pb[r[1]] += -0.0; }
  }
  update(dt) {
    const rig = this.rig, J = this.J, sp = this.sp, S = sp.size; if (this.hitStopT > 0) { this.hitStopT -= dt; dt *= 0.04; }
    this.t += dt; this.breath += dt * TAU / (3.2 + S * 0.4);
    const pb = this.pb, pa = this.pa, out = this.out; pb.fill(0);
    // legs at rest: slight bend
    for (let si = 0; si < 4; si++) { const j = LEG_I[si]; if (si < 2) { pb[j[1]] = 0.04; pb[j[2]] = 0.08; pb[j[0]] = -0.03; } else { pb[j[0]] = -0.02; pb[j[1]] = 0.06; pb[j[2]] = -0.06; } }
    this.gait(dt);
    this.life(dt);
    // ---- action layer
    pa.fill(0); let w = 0; const mask = this._mask || (this._mask = new Uint8Array(NCH)); mask.fill(0);
    const a = this.action;
    if (a) {
      const c = a.c; a.t += dt * a.speed;
      if (a.t >= c.dur && c.loop && a.loop !== false) a.t -= c.dur;
      const tt = a.t < c.dur ? a.t : c.dur;
      evalClip(c, tt, pa, mask);   // PERF: flat typed arrays, one loop (a Map iterator, a call per channel and its boxed doubles allocated)
      w = smooth(0, c.fi, a.t) * (a.hold || (c.loop && a.loop !== false) ? 1 : 1 - smooth(c.dur - c.fo, c.dur, a.t));
      if (c === this.clips.roar || c === this.clips.howl || c === this.clips.victory) { const tr = Math.sin(this.t * 38) * 0.05 * w * smooth(0.3, 0.45, a.t); pa[JI.jaw * 3] += tr; pa[JI.head * 3 + 2] = (pa[JI.head * 3 + 2] || 0) + tr * 0.5; mask[JI.jaw * 3] = 1; mask[JI.head * 3 + 2] = 1; }
      // events
      if (!a.ev1 && c.swing && a.t >= c.swing) { a.ev1 = 1; this.emit('swing', c); }
      if (!a.ev2 && c.hit && a.t >= c.hit) { a.ev2 = 1; this.emit('hit', c); }
      if (a.t >= c.dur && !c.loop && !a.ended) { a.ended = true; this.emit('end', c); if (!a.hold) this.action = null; }
    }
    // ---- compose: base, action over it where the clip names a channel
    composeOut(out, pb, pa, mask, w);
    // paws a clip moves are not planted (a raised paw stays raised)
    for (let i = 0; i < 4; i++) { const k = LEG_I[i][0]; this.legW[i] *= 1 - w * (mask[k] ? 1 : 0); }
    // ---- additive hurt flinch (mirrors the chest twist)
    const h = this.hurtS.update(dt); if (Math.abs(h) > 1e-4) {
      out[JI.chest * 3] += -0.24 * h; out[JI.chest * 3 + 1] += 0.2 * h * this.hurtDir; out[JI.neck * 3] += -0.3 * h; out[JI.head * 3] += -0.22 * h; out[JI.jaw * 3] += 0.35 * (h > 0 ? h : 0); out[BZ] += -0.09 * h * S; out[BY] += -0.03 * h * S; out[JI.tail1 * 3] += -0.5 * h; out[LID_I[0]] += 0.8 * (h > 0 ? h : 0); out[LID_I[1]] += 0.8 * (h > 0 ? h : 0); out[JI.hips * 3 + 2] += 0.06 * h * this.hurtDir;
    }
    // ---- crossfade from the last pose when a state or clip began
    if (this.snapT < 1) { { const sn = this.snapT + dt / this.snapDur; this.snapT = sn < 1 ? sn : 1; } const k = smooth(0, 1, this.snapT); fadeOut(out, this.snap, k); }
    // ---- write
    const jq = this._jq || (this._jq = JN.filter((n) => J[n]).map((n) => ({ q: J[n].quaternion, o: JI[n] * 3 })));
    writeQuats(jq, out);
    const body = rig.body, bx = out[BX], by = out[BY], bz = out[BZ], bp = out[BP], br2 = out[BR], bw = out[BW];
    { const x = bp, y = bw, z = br2, c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2), q = body.quaternion;   // body.rotation.set(bp, bw, br2, 'XYZ') without the callback
      q._x = s1 * c2 * c3 + c1 * s2 * s3; q._y = c1 * s2 * c3 - s1 * c2 * s3; q._z = c1 * c2 * s3 + s1 * s2 * c3; q._w = c1 * c2 * c3 - s1 * s2 * s3; }
    const bpos = body.position; bpos.x = bx; bpos.y = by + this.go - this.drop; bpos.z = bz;
    const sq = this.squash.update(dt), sk = 1 / Math.sqrt(1 + sq), bsc = body.scale; bsc.x = sk; bsc.y = 1 + sq; bsc.z = sk;
    rig.root.updateMatrixWorld(true);
    const air = a && a.c.ground !== undefined;
    if (!air) this.lockFeet(out, dt); else { this.lkOn.fill(0); this.stT.fill(-1); this.ikD.fill(0); this.drop *= 0.8; if (this.ikR) this.ikR.fill(0); }
    const fl = this.flashState; if (fl.t > 0) { const ft = fl.t - dt; fl.t = ft > 0 ? ft : 0; } const f = fl.t > 0 ? fl.t / fl.dur : 0;
    if (rig.blood.fresh > 0) { { const f9 = rig.blood.fresh - dt / 9; rig.blood.fresh = f9 > 0 ? f9 : 0; } rig.bloodU.uBFresh.value = rig.blood.fresh; }
    if (f > 0 || this._emD !== false) { for (const k in this.mats) { const m = this.mats[k]; if (!m.userData.base) m.userData.base = m.emissive.clone(); m.emissive.copy(m.userData.base); if (f > 0) m.emissive.lerp(fl.color, f); } this._emD = f > 0; }   // PERF: only while a flash runs (and once after)
    this.groundFix(dt, air ? 0 : 1, a ? a.c : null);
  }
  /** stance paw locking. A paw that is meant to be on the ground (idle, or the stance phase of the gait) is PINNED in world space: the first frame of a stance the sole's world position is recorded
   *  and every frame after, a damped 3 DOF solve (shoulder pitch, shoulder roll, elbow pitch; the wrist keeps the paw's pitch) puts the sole back on that spot at sand height. So a paw does not skate
   *  when the speed changes, on a sprint, in a turn or after a shove. The lock is released when the gait lifts the paw (the correction fades in 0.09 s), a leash (0.2 leg lengths) drags the pin along
   *  when the body outruns it, and at idle a paw whose pin drifted from its neutral spot under the body (the beast turned) takes a real step (0.26 s arc), never both paws of a pair at once.
   *  Paws a clip moves (legW 0) are left alone. A teleport (root jumps) forgets the pins. */
  lockFeet(out, dt) {
    const rig = this.rig, root = rig.root, ground = root.position.y, sc = root.scale.y, idle = this.gw.move < 0.05, lk = this.lk, ikD = this.ikD, lr = this.lastRoot, v = this.ikV;
    { const rx = root.position.x, rz = root.position.z, ry = root.rotation.y; if (lr.ok) { const dx = rx - lr.x, dz = rz - lr.z; let dy = ry - lr.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); if (dx * dx + dz * dz > 1.0 || Math.abs(dy) > 1.2) { this.lkOn.fill(0); ikD.fill(0); this.ikR = null; this.stT.fill(-1); } } lr.x = rx; lr.z = rz; lr.yaw = ry; lr.ok = true; }
    const ikR = this.ikR || (this.ikR = new Float64Array(12)); let stepping = 0; for (let i = 0; i < 4; i++) if (this.stT[i] >= 0) stepping++;
    for (let i = 0; i < 4; i++) {
      const lg = this.lg[i], o = i * 3, j2 = this.legJ[i][2]; if (!lg.par || !j2) continue;
      _fA.copy(lg.c).applyMatrix4(j2.matrixWorld); const cx = _fA.x, cy = _fA.y, cz = _fA.z;   // where the animation puts the sole
      const grounded = this.legW[i] > 0.05 && (idle || this.stance[i] === 1);
      let solve = false, tx = 0, ty = 0, tz = 0, w = 0; if (i === 0) this.dropN = 0;
      if (grounded) {
        if (!this.lkOn[i]) { this.lkOn[i] = 1; lk[o] = cx; lk[o + 1] = ground; lk[o + 2] = cz; this.lkW[i] = 0; this.stT[i] = -1; }
        let dx = lk[o] - cx, dz = lk[o + 2] - cz, d = Math.sqrt(dx * dx + dz * dz);
        if (d > this.leash) { const k = this.leash / d; lk[o] = cx + dx * k; lk[o + 2] = cz + dz * k; d = this.leash; }
        if (!idle) this.stT[i] = -1;
        else if (this.stT[i] < 0 && d > this.stepAt && stepping < 2 && this.stT[i ^ 1] < 0) { this.stT[i] = 0; this.stF[i * 2] = lk[o]; this.stF[i * 2 + 1] = lk[o + 2]; stepping++; }
        let lift = 0;
        if (this.stT[i] >= 0) { const u = this.stT[i] + dt / 0.26, e = (u > 1 ? 1 : u) * (u > 1 ? 1 : u) * (3 - 2 * (u > 1 ? 1 : u)); lk[o] = this.stF[i * 2] + (cx - this.stF[i * 2]) * e; lk[o + 2] = this.stF[i * 2 + 1] + (cz - this.stF[i * 2 + 1]) * e; lift = Math.sin(Math.PI * (u > 1 ? 1 : u)) * this.stepLift; this.stT[i] = u >= 1 ? -1 : u; }
        this.lkW[i] = Math.min(1, this.lkW[i] + dt / 0.025); w = this.lkW[i] * this.legW[i]; solve = true; tx = lk[o]; ty = ground + lift * sc; tz = lk[o + 2];
        // the body sinks when a pinned paw is further than a (slightly bent) leg reaches: hip height over the pin vs sqrt(L^2 - run^2), smoothed after the loop
        _fB.setFromMatrixPosition(this.legJ[i][0].matrixWorld); { const rx = _fB.x - tx, rz = _fB.z - tz, hy = _fB.y + this.drop - this.go - ty, L = lg.Lmax * sc * 0.985, need = hy - Math.sqrt(Math.max(0.0004, L * L - rx * rx - rz * rz)); if (need > this.dropN) this.dropN = need; }
      } else {
        this.lkOn[i] = 0; this.stT[i] = -1; const k = Math.exp(-dt / 0.09); for (let q = 0; q < 3; q++) { ikD[o + q] *= k; ikR[o + q] *= k; }
        if (cy < ground - 0.004 * sc && this.legW[i] > 0.05) { solve = true; tx = cx; ty = ground; tz = cz; w = 1; }   // a swinging paw never dips under the sand
      }
      const el = out[this.legJ[i] ? LEG_I[i][1] : 0], jn = LEG_I[i];
      if (solve) {
        const q = lg.q; q[0] = out[jn[0]]; q[1] = out[jn[0] + 1]; q[2] = out[jn[0] + 2]; q[3] = out[jn[1]]; q[4] = out[jn[1] + 1]; q[5] = out[jn[1] + 2]; q[6] = out[jn[2]]; q[7] = out[jn[2] + 1]; q[8] = out[jn[2] + 2];
        const lim = lg.lim, lo = lg.front ? -0.15 : -0.45; lim[0] = -1.1; lim[1] = 1.1; lim[2] = -0.45; lim[3] = 0.45; lim[4] = lo - q[3]; lim[5] = 2.3 - q[3];
        v[0] = ikR[o]; v[1] = ikR[o + 1]; v[2] = ikR[o + 2]; _tg.set(tx, ty, tz); legSolve(lg, _tg, v, lim);
        ikR[o] = v[0]; ikR[o + 1] = v[1]; ikR[o + 2] = v[2]; ikD[o] = v[0] * w; ikD[o + 1] = v[1] * w; ikD[o + 2] = v[2] * w;
      }
      if (Math.abs(ikD[o]) + Math.abs(ikD[o + 1]) + Math.abs(ikD[o + 2]) > 1e-4) {
        out[jn[0]] += ikD[o]; out[jn[0] + 2] += ikD[o + 1]; out[jn[1]] += ikD[o + 2]; out[jn[2]] -= ikD[o] + ikD[o + 2];
        const J0 = this.legJ[i][0]; writeQuat(J0.quaternion, out, jn[0]); writeQuat(this.legJ[i][1].quaternion, out, jn[1]); writeQuat(j2.quaternion, out, jn[2]); J0.updateMatrixWorld(true);
      }
    }
    { const tgt = this.dropN > 0 ? Math.min(this.dropN, 0.16 * this.legL[0]) : 0, k = tgt > this.drop ? Math.min(1, dt * 22) : Math.min(1, dt * 7); this.drop += (tgt - this.drop) * k; }
  }
  groundFix(dt, grounded, c) {
    const J = this.J, rig = this.rig, sp = this.sp, S = sp.size, _v = this._gv || (this._gv = new V3()); let low = 1e9;
    const pj = this._pj || (this._pj = [J.wristL, J.wristR, J.ankleL, J.ankleR]), pp = this._pp || (this._pp = [sp.front.pad, sp.front.pad, sp.hind.pad, sp.hind.pad]);
    for (let i = 0; i < 4; i++) { _v.set(0, -pp[i] * S * 0.98, 0).applyMatrix4(pj[i].matrixWorld); const yy = _v.y; if (yy < low) low = yy; }   // the sole point turns with the paw (the same point the paw locks use)   // matrices were just updated by update(): no per-joint parent walk
    const err = low - rig.root.position.y; // > 0: floating, < 0: sunk
    if (c && (c.ground === 0)) return;
    if (this.lkOn[0] + this.lkOn[1] + this.lkOn[2] + this.lkOn[3] > 0 && grounded) { this.go += (err < -0.03 * S ? -err - 0.03 * S : 0) - this.go * Math.min(1, dt * 10); }   // paws are pinned (drop + IK set the height); only a paw buried deeper than 3 cm lifts the body
    else if (err < 0) this.go += -err; else if (grounded || !c) { const mv = dt * 1.6 * S; this.go -= err < mv ? err : mv; }
    this.go = clamp(this.go, -0.6 * S, 0.8 * S);
  }
}
export { BeastAnimator, SPECIES, JN };
