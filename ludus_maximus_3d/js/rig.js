// Ludus Maximus 3D: reference procedural humanoid rig + animation player (three.js r170, no assets).
// Conventions: character faces +Z, character LEFT is +X, up is +Y. Limbs hang along local -Y.
//   Limb pitch: NEGATIVE x rotation swings a limb FORWARD (arms, thighs, forearms). Knee flexion is POSITIVE x.
//   Torso lean forward is POSITIVE x (opposite sign: torso points up, limbs point down).
//   Torso yaw: NEGATIVE y turns the right shoulder back (windup for a right-handed swing), POSITIVE y strikes.
//   Arm abduction: left arm +z, right arm -z. Foot plantarflex (toe down) is +x.
import * as THREE from 'three';

const V3 = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;

// ---------------------------------------------------------------- constants
export const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
export const JI = {}; JOINTS.forEach((n, i) => { JI[n] = i; });
const ORDER = { hips: 'YXZ', spine: 'YXZ', chest: 'YXZ', neck: 'YXZ', head: 'YXZ' };
export const UPPER = ['spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR'];
const UPPER_SET = new Set(UPPER);

export const DIM = {
  hipY: 0.985, hipSocketY: 0.05, hipX: 0.115, thigh: 0.42, shin: 0.43, footH: 0.085,
  spineY: 0.08, chestY: 0.18, neckY: 0.32, headY: 0.09,
  shoulderX: 0.27, shoulderY: 0.26, upperArm: 0.30, foreArm: 0.27,
};

// ---------------------------------------------------------------- math helpers
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const c1 = 1.70158;
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t, outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t, outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)), outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  inBack: (t) => (c1 + 1) * t * t * t - c1 * t * t,
  outBounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; },
};

// ---------------------------------------------------------------- geometry kit
// Every geometry carries a 'color' attribute (vertex colour = AO / paint). Parts are authored in the local frame of the
// joint / socket they belong to, then merged per material into ONE skinned mesh (rigid weights) by rig.rebuild().
function addAO(g, ends = 0.2, lo = 0.72) {
  // vertex colour gradient: darker at both ends of the Y extent (fake joint AO). Required: every geo has 'color'.
  g.computeBoundingBox(); const bb = g.boundingBox, h = Math.max(1e-4, bb.max.y - bb.min.y);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / h; const e = Math.min(t, 1 - t);
    const k = ends > 0 ? lerp(lo, 1, smooth(0, ends, e)) : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
export function lathe(profile, seg = 8, sx = 1, sz = 1, ao = 0.2, lo = 0.72, p0 = 0, pl = Math.PI * 2) {
  // profile: [[radius, y], ...] ordered with increasing y. p0/pl: start angle / sweep (phi 0 = +Z, so a front mask is p0=-pl/2).
  const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg, p0, pl);
  const pos = g.attributes.position, nor = g.attributes.normal, n = new V3();
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) * sx); pos.setZ(i, pos.getZ(i) * sz);
    n.set(nor.getX(i) / sx, nor.getY(i), nor.getZ(i) / sz).normalize(); nor.setXYZ(i, n.x, n.y, n.z);
  }
  return addAO(g, ao, lo);
}
export function capsule(len, rTop, rBot, seg = 7, bulge = 0.1, topCap = true) {
  // hangs down from y=0 to y=-len, rounded caps, muscle bulge. topCap=false leaves the top open (hidden inside the parent joint volume)
  const cb = rBot * 0.55, ct = rTop * 0.55, mid = lerp(rBot, rTop, 0.5) * (1 + bulge);
  const pr = [[0, -len - cb], [rBot * 0.8, -len - cb * 0.5], [mid, -len * 0.5], [rTop, 0]]; if (topCap) pr.push([rTop * 0.72, ct * 0.7], [0, ct]);
  return lathe(pr, seg, 1, 1, 0.14, 0.8);
}
export function col1(g) { if (!g.attributes.color) { const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); } return g; }
export function boxG(w, h, d, ao = 0) { const g = new THREE.BoxGeometry(w, h, d); return addAO(g, ao, 0.8); }
export function sphereG(r, w = 8, h = 5, sx = 1, sy = 1, sz = 1) { const g = new THREE.SphereGeometry(r, w, h); g.scale(sx, sy, sz); return addAO(g, 0.25, 0.8); }
export function cylG(rt, rb, h, seg = 6, open = false) { return col1(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)); }
export function coneG(r, h, seg = 5) { return col1(new THREE.ConeGeometry(r, h, seg, 1)); }
export function torusG(R, r, tseg = 4, seg = 12) { return col1(new THREE.TorusGeometry(R, r, tseg, seg)); }
export function quadG(w, h) { return col1(new THREE.PlaneGeometry(w, h)); }
const _xm = new THREE.Matrix4(), _xq = new Q(), _xe = new E(), _xp = new V3(), _xs = new V3();
// place a geometry: p [x,y,z], r euler [x,y,z] (XYZ), s number or [x,y,z]. Mutates and returns it.
export function xf(g, p, r, s) {
  const sc = typeof s === 'number' ? [s, s, s] : (s || [1, 1, 1]);
  _xp.set(...(p || [0, 0, 0])); _xq.setFromEuler(_xe.set(...(r || [0, 0, 0]), 'XYZ')); _xs.set(sc[0], sc[1], sc[2]);
  g.applyMatrix4(_xm.compose(_xp, _xq, _xs)); return g;
}
// multiply vertex colour by [r,g,b] / number / fn(x,y,z,nx,ny,nz) -> [r,g,b] | number
export function paint(g, c) {
  col1(g); const a = g.attributes.color, P = g.attributes.position, N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    let k = c; if (typeof c === 'function') k = c(P.getX(i), P.getY(i), P.getZ(i), N ? N.getX(i) : 0, N ? N.getY(i) : 0, N ? N.getZ(i) : 0);
    if (typeof k === 'number') a.setXYZ(i, a.getX(i) * k, a.getY(i) * k, a.getZ(i) * k); else a.setXYZ(i, a.getX(i) * k[0], a.getY(i) * k[1], a.getZ(i) * k[2]);
  }
  return g;
}
// gaussian bumps along the vertex normal: blobs [{p:[x,y,z], r, a}] (a>0 out, a<0 in). Geometry needs normals.
export function sculpt(g, blobs) {
  const P = g.attributes.position, N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i); let d = 0;
    for (const b of blobs) { const dx = x - b.p[0], dy = y - b.p[1], dz = z - b.p[2]; d += b.a * Math.exp(-(dx * dx * (b.kx || 1) + dy * dy + dz * dz) / (b.r * b.r)); }
    if (d) P.setXYZ(i, x + N.getX(i) * d, y + N.getY(i) * d, z + N.getZ(i) * d);
  }
  return g;
}
const sq = (v) => v * v;
export const sm01 = (a, b, v) => smooth(a, b, v);
// ribbon along a polyline (double sided material): w = width or fn(t), nrm = fn(point, i) -> outward normal
export function ribbon(pts, w = 0.03, nrm = null) {
  const n = pts.length, pos = [], nor = [], idx = [], t = new V3(), s = new V3(), nn = new V3();
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; t.subVectors(b, a).normalize();
    nn.copy(nrm ? nrm(pts[i], i) : _xs.set(0, 0, 1)).normalize(); s.crossVectors(t, nn).normalize();
    const ww = (typeof w === 'function' ? w(i / Math.max(1, n - 1)) : w) / 2, p = pts[i];
    pos.push(p.x - s.x * ww, p.y - s.y * ww, p.z - s.z * ww, p.x + s.x * ww, p.y + s.y * ww, p.z + s.z * ww); nor.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
  }
  for (let i = 0; i < n - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return col1(g);
}
// strip of leather/cloth tabs (pteruges) hanging from a ring: n tabs around, each a trapezoid quad
export function tabRing(n, r, y, len, w, o = {}) {
  const pos = [], nor = [], col = [], idx = [], sx = o.sx || 1, sz = o.sz || 1, flare = o.flare ?? 0.05, tip = o.tip ?? 0.5, a0 = o.a0 || 0, arc = o.arc ?? Math.PI * 2, shade = o.shade ?? 0.72;
  for (let i = 0; i < n; i++) {
    const a = a0 + (arc >= Math.PI * 2 - 1e-3 ? i / n : i / Math.max(1, n - 1)) * arc, sa = Math.sin(a), ca = Math.cos(a), r2 = r + flare;
    const dx = ca, dz = -sa; // tangent
    const base = pos.length / 3, hw = w / 2;
    pos.push(sa * r * sx - dx * hw, y, ca * r * sz - dz * hw * sz, sa * r * sx + dx * hw, y, ca * r * sz + dz * hw * sz, sa * r2 * sx + dx * hw * tip, y - len, ca * r2 * sz + dz * hw * tip * sz, sa * r2 * sx - dx * hw * tip, y - len, ca * r2 * sz - dz * hw * tip * sz);
    for (let k = 0; k < 4; k++) { nor.push(sa, 0.1, ca); const c = k < 2 ? 1 : shade; col.push(c, c, c); }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
}
// extrude a closed 2D outline (array of [x,y]) along z (thickness d, centred), flat caps
export function extrude(outline, d = 0.02, bevel = 0) {
  const sh = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3 }); g.translate(0, 0, -d / 2); return col1(g);
}

// ---------------------------------------------------------------- grid surfaces (medium / high detail bodies)
// R rings of C points, indexed (no duplicated seam vertices, so computeVertexNormals() is seamless): shaped limbs, feet, the skull.
// fn(r, c) -> [x, y, z]; o.col(r, c, x, y, z) -> number | [r,g,b]; o.tipTop / o.tipBot = [x,y,z] fan centre closing the first / last ring.
// Winding is auto-oriented outward (signed volume test), so authors need not care about ring order.
export function gridGeo(R, C, fn, o = {}) {
  const CC = o.seam ? C + 1 : C, nv = R * CC + (o.tipTop ? 1 : 0) + (o.tipBot ? 1 : 0), pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3).fill(1), idx = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < CC; c++) {
    const p = fn(r, c), i = r * CC + c; pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
    if (o.col) { const k = o.col(r, c, p[0], p[1], p[2]); if (typeof k === 'number') col.fill(k, i * 3, i * 3 + 3); else { col[i * 3] = k[0]; col[i * 3 + 1] = k[1]; col[i * 3 + 2] = k[2]; } }
  }
  let ti = R * CC, tt = -1, tb = -1;
  if (o.tipTop) { tt = ti++; pos.set(o.tipTop, tt * 3); }
  if (o.tipBot) { tb = ti++; pos.set(o.tipBot, tb * 3); }
  for (const t of [tt, tb]) if (t >= 0) { // fan colour = average of its ring
    const r = t === tt ? 0 : R - 1; let a = 0, b = 0, d = 0; for (let c = 0; c < CC; c++) { a += col[(r * CC + c) * 3]; b += col[(r * CC + c) * 3 + 1]; d += col[(r * CC + c) * 3 + 2]; } col.set([a / CC, b / CC, d / CC], t * 3);
  }
  const wrapC = !o.seam && o.wrap !== false, nSeg = wrapC ? CC : CC - 1;
  for (let r = 0; r < R - 1; r++) for (let c = 0; c < nSeg; c++) { const c2 = (c + 1) % CC, a = r * CC + c, b = (r + 1) * CC + c, d = r * CC + c2, e = (r + 1) * CC + c2; idx.push(a, b, d, d, b, e); }
  for (let c = 0; c < nSeg; c++) { const c2 = (c + 1) % CC; if (tb >= 0) idx.push((R - 1) * CC + c, tb, (R - 1) * CC + c2); if (tt >= 0) idx.push(tt, c, c2); }
  // orient: sum of dot(face normal, face centre - centroid) must be positive for outward faces
  let cx = 0, cy = 0, cz = 0; for (let i = 0; i < nv; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; } cx /= nv; cy /= nv; cz /= nv;
  let vol = 0; for (let i = 0; i < idx.length; i += 3) {
    const A = idx[i] * 3, B = idx[i + 1] * 3, Cc = idx[i + 2] * 3, ux = pos[B] - pos[A], uy = pos[B + 1] - pos[A + 1], uz = pos[B + 2] - pos[A + 2], vx = pos[Cc] - pos[A], vy = pos[Cc + 1] - pos[A + 1], vz = pos[Cc + 2] - pos[A + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; vol += nx * (pos[A] - cx) + ny * (pos[A + 1] - cy) + nz * (pos[A + 2] - cz);
  }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (o.seam) { const N = g.attributes.normal; for (let r = 0; r < R; r++) { const i0 = r * CC, i1 = r * CC + C; const nx = N.getX(i0) + N.getX(i1), ny = N.getY(i0) + N.getY(i1), nz = N.getZ(i0) + N.getZ(i1), l = Math.hypot(nx, ny, nz) || 1; N.setXYZ(i0, nx / l, ny / l, nz / l); N.setXYZ(i1, nx / l, ny / l, nz / l); } }
  return g;
}
const bump = (t, c, w) => Math.exp(-sq((t - c) / w)), pz = (v) => Math.max(0, v);
// shaped limb hanging down -y from 0: ts = ring positions as fractions of len (>1 = rounded end cap), rad(t, a) -> [x, z] cross-section point, shade(t, a) -> colour factor.
function limbG(len, ts, S, rad, shade, o = {}) {
  const g = gridGeo(ts.length, S, (r, c) => { const a = Math.PI + (c / S) * Math.PI * 2, q = rad(ts[r], a); return [q[0], -ts[r] * len, q[1]]; },
    { seam: true, tipTop: o.tipTop ? [0, o.tipTop, 0] : null, tipBot: o.tipBot ? [0, -o.tipBot * len, 0] : null, col: (r, c) => { const t = ts[r], a = Math.PI + (c / S) * Math.PI * 2, e = Math.min(t, 1 - t), k = lerp(0.84, 1, smooth(0, 0.1, e)); return k * (shade ? shade(t, a) : 1); } });
  if (o.tile !== undefined) limbUV(g, ts, S, o.tile, o.sg || 1, o.tipTop ? 1 : undefined, o.tipBot ? 1 : undefined);
  return g;
}
const sm = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------- materials (zones)
export const DEFAULT_PALETTE = { skin: '#c98d62', hair: '#2b1b12', cloth: '#a8452a', plume: '#b5271f', metal: '#b8803a' };
// Character-only shading baked into the material shader (no extra scene lights): a sky/ground fill so shadowed sides never
// go flat brown, a cool fresnel rim for separation from sand, a warm subsurface-ish bleed at grazing angles on skin, and a faux
// sky/ground reflection so metals read without an environment map (the arena has none).
const SHADE = {
  skin: { fill: 0.15, lift: 0.024, fs: '#c8c8ff', fg: '#d8a880', rim: 0.55, rc: '#a8c4ff', rp: 4.5, sss: 0.14, sc: '#ff7a50', env: 0.07, ew: 0.9, wrap: 0.4, wc: '#ff7f55', kick: 0.17, kc: '#8aa6ff' },
  hair: { fill: 0.2, lift: 0.012, fs: '#b8b8f0', fg: '#8a6a50', rim: 0.5, rc: '#b0c8ff', rp: 4.0, sss: 0, sc: '#fff', env: 0.14, ew: 0.8, wrap: 0.2, wc: '#ffb070', kick: 0.18, kc: '#9ab4ff', shine: 0.5 },
  cloth: { fill: 0.22, fs: '#c0c0f0', fg: '#d09870', rim: 0.40, rc: '#a8c0ff', rp: 4.5, sss: 0.10, sc: '#ff9060', env: 0, wrap: 0.3, wc: '#ff8a60', kick: 0.16, kc: '#98b0ff' },
  plume: { fill: 0.22, fs: '#c0c0f0', fg: '#d09870', rim: 0.32, rc: '#b0c8ff', rp: 3.0, sss: 0.15, sc: '#ff9060', env: 0, wrap: 0.4, wc: '#ff8a60', kick: 0.14, kc: '#98b0ff' },
  leather: { fill: 0.2, lift: 0.01, fs: '#b8b8e8', fg: '#c08860', rim: 0.35, rc: '#a8c0ff', rp: 4.5, sss: 0, sc: '#fff', env: 0.22, ew: 0.5, wrap: 0.12, wc: '#ffa070', kick: 0.16, kc: '#98b0ff' },
  metal: { fill: 0.04, fs: '#b8c0e8', fg: '#c89868', rim: 0.30, rc: '#c0d4ff', rp: 3.0, sss: 0, sc: '#fff', env: 1.0, kick: 0.07, kc: '#a8bcff' },
  steel: { fill: 0.04, fs: '#c0c8f0', fg: '#b09078', rim: 0.3, rc: '#d0e0ff', rp: 3.0, sss: 0, sc: '#fff', env: 1.15, kick: 0.05, kc: '#a8bcff' },
  trim: { fill: 0.04, fs: '#c8c8f0', fg: '#d8a060', rim: 0.3, rc: '#ffe0b0', rp: 3.0, sss: 0, sc: '#fff', env: 1.1, kick: 0.05, kc: '#a8bcff' },
  eye: { fill: 0.25, fs: '#ffffff', fg: '#ffeedd', rim: 0, rc: '#fff', rp: 3, sss: 0, sc: '#fff', env: 0 },
  gem: { fill: 0, fs: '#fff', fg: '#fff', rim: 0.2, rc: '#fff', rp: 2, sss: 0, sc: '#fff', env: 0.4 },
};
const _col = new THREE.Color();
const v3s = (hex) => { _col.set(hex); return `vec3(${_col.r.toFixed(4)},${_col.g.toFixed(4)},${_col.b.toFixed(4)})`; };
export const EDGE = { steel: 0.15, skin: 0.5, hair: 0.35, cloth: 0.4, plume: 0.35, leather: 0.4, metal: 0.3, trim: 0.2, eye: 0, gem: 0 };
// ---------------------------------------------------------------- gore: blood / wounds / stumps (fragment overlay driven by per-rig uniforms)
// Rest-space position (vBP = the un-skinned vertex position, stable on the body) drives: soak (noise threshold rising with uBlood), up to 6 gashes
// (centre + half length, direction + strength) with a halo and a runnel below, and up to 3 cut stumps (raw flesh + bone). One branch when idle.
// uSweat (0..1, character exertion) adds beads of sweat on skin: darker, much glossier, sky/ground reflection. Cloth that moves (cloak, flaps, plume,
// hair tails) uses the `free` variant: its vBP comes from the uv, so blood patterns stick to the cloth instead of swimming with the vertex positions.
export const MAX_WOUNDS = 6, MAX_CUTS = 3; let bloodSeed = 1;
export function makeBloodUniforms() {
  const arr = (n) => Array.from({ length: n }, () => new THREE.Vector4());
  return { uBlood: { value: 0 }, uBFresh: { value: 0 }, uBOn: { value: 0 }, uSweat: { value: 0 }, uBSeed: { value: (bloodSeed++ * 7.31) % 20 }, uWound: { value: arr(MAX_WOUNDS) }, uWoundD: { value: arr(MAX_WOUNDS) }, uCut: { value: arr(MAX_CUTS) } };
}
const BLOOD_HEAD = `varying vec3 vBP; uniform float uBlood, uBFresh, uBOn, uBSeed, uSweat; uniform vec4 uWound[${MAX_WOUNDS}]; uniform vec4 uWoundD[${MAX_WOUNDS}]; uniform vec4 uCut[${MAX_CUTS}]; float gBM; float gSW;
float bh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh(i), bh(i + vec3(1,0,0)), f.x), mix(bh(i + vec3(0,1,0)), bh(i + vec3(1,1,0)), f.x), f.y), mix(mix(bh(i + vec3(0,0,1)), bh(i + vec3(1,0,1)), f.x), mix(bh(i + vec3(0,1,1)), bh(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
const sweatCode = `gSW = 0.0;
if (uSweat > 0.01) { float sb = smoothstep(0.62 - 0.4 * uSweat, 0.82, bn(vBP * 64.0 + uBSeed)); float zone = 0.45 + 0.55 * smoothstep(0.55, 1.45, vBP.y);
  gSW = clamp(uSweat * (0.4 + 0.6 * sb) * zone, 0.0, 1.0); diffuseColor.rgb *= 1.0 - 0.12 * gSW; }`;
const bloodCode = (gash) => `gBM = 0.0;
if (uBOn > 0.5) {
  vec3 bp = vBP; float n1 = bn(bp * 13.0 + uBSeed), n2 = bn(bp * 41.0 + uBSeed * 1.7), st = bn(vec3(bp.x * 24.0, bp.y * 2.4, bp.z * 24.0) + uBSeed * 2.3);
  float bodyN = 0.5 * n1 + 0.25 * n2 + 0.5 * st; float thr = 1.24 - uBlood * 0.5 + 0.2 * (1.0 - smoothstep(0.25, 1.0, bp.y)) - 0.1 * uBlood * smoothstep(0.3, 1.5, bp.y);
  float mask = smoothstep(thr, thr + 0.16, bodyN) * 0.88; float gsh = 0.0, wm = 0.0;
  for (int i = 0; i < ${MAX_WOUNDS}; i++) { vec4 w = uWound[i], d = uWoundD[i]; if (d.w > 0.0) {
    vec3 dl = bp - w.xyz; float al = dot(dl, d.xyz), ac = length(dl - d.xyz * al), len = w.w;
    float halo = exp(-dot(dl, dl) / (len * len * 1.5)) * 0.9 * d.w;
    float run = smoothstep(0.03, 0.0, length(dl.xz + vec2(sin(dl.y * 45.0 + float(i)) * 0.008, 0.0))) * step(dl.y, 0.0) * (1.0 - clamp(-dl.y / (len * 2.8), 0.0, 1.0)) * 0.95 * d.w;
    wm = max(wm, max(halo, run)); mask = max(mask, wm);
    ${gash ? 'gsh = max(gsh, (1.0 - smoothstep(len * 0.72, len, abs(al))) * (1.0 - smoothstep(0.014, 0.03, ac)) * d.w);' : ''}
  } }
  vec3 bcol = mix(vec3(0.05, 0.005, 0.007), vec3(0.19, 0.009, 0.013), uBFresh * (0.5 + 0.5 * n1));
  bcol = mix(bcol, mix(vec3(0.12, 0.009, 0.011), vec3(0.4, 0.016, 0.022), 0.35 + 0.65 * uBFresh), wm);
  bcol = mix(bcol, vec3(0.02, 0.0, 0.002), gsh * 0.85); mask = max(mask, gsh);
  diffuseColor.rgb = mix(diffuseColor.rgb, bcol, clamp(mask, 0.0, 1.0) * 0.95); gBM = clamp(mask, 0.0, 1.0);
  for (int i = 0; i < ${MAX_CUTS}; i++) { vec4 c = uCut[i]; if (c.w > 0.0) { float dc = length(bp - c.xyz); float cm = 1.0 - smoothstep(c.w * 0.82, c.w, dc);
    vec3 raw = mix(vec3(0.34, 0.012, 0.016), vec3(0.62, 0.05, 0.05), bn(bp * 70.0) * 0.8); raw = mix(raw, vec3(0.7, 0.55, 0.42), 1.0 - smoothstep(c.w * 0.18, c.w * 0.34, dc));
    diffuseColor.rgb = mix(diffuseColor.rgb, raw, cm); gBM = max(gBM, cm); } }
}`;
function lightChunk(k) { // RE_Direct_Physical with a wrap-lit warm terminator (subsurface-ish) and a cool back fill on the side facing away from each light
  const f = (n) => (+n).toFixed(3), tgt = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
  const src = THREE.ShaderChunk.lights_physical_pars_fragment; if (!src.includes(tgt)) return null;
  const add = `${tgt}
	{ float dlC = dot( geometryNormal, directLight.direction ); float wrC = saturate( ( dlC + ${f(k.wrap || 0)} ) / ( 1.0 + ${f(k.wrap || 0)} ) ) - saturate( dlC );
	  reflectedLight.directDiffuse += BRDF_Lambert( material.diffuseColor ) * directLight.color * ( wrC * ${v3s(k.wc || '#ffffff')} * ${f(k.wrap ? 0.7 : 0)} + saturate( -dlC ) * ${f(k.kick || 0)} * ${v3s(k.kc || '#ffffff')} ); }`;
  return src.replace(tgt, add);
}
export function shadePatch(mat, key, xo = {}) {
  const k = SHADE[key]; if (!k) return; const ed = EDGE[key] || 0;
  const f = (n) => (+n).toFixed(3);
  const envOn = k.env > 0 || !!xo.blood;
  const code = `{
  vec3 vdC = normalize(vViewPosition);
  float ndvC = clamp(dot(normal, vdC), 0.0, 1.0);
  vec3 nWC = inverseTransformDirection(normal, viewMatrix);
  float upC = nWC.y * 0.5 + 0.5;
  vec3 albC = diffuseColor.rgb;
  vec3 addC = albC * mix(${v3s(k.fg)}, ${v3s(k.fs)}, upC) * ${f(k.fill)} + mix(${v3s(k.fg)}, ${v3s(k.fs)}, upC) * (0.35 + 2.2 * albC) * ${f(k.lift || 0)};
  float rimC = pow(1.0 - ndvC, ${f(k.rp)});
  addC += ${v3s(k.rc)} * rimC * ${f(k.rim)} * (0.35 + 0.65 * upC) * (0.55 + 0.45 * length(albC));
  addC += albC * ${v3s(k.sc)} * pow(1.0 - ndvC, 2.0) * ${f(k.sss)};
  ${k.shine ? `addC += albC * ${v3s('#fff0d8')} * exp(-pow((nWC.y - 0.42) * 3.0, 2.0)) * ${f(k.shine)} * (0.4 + 0.6 * ndvC);` : ''}
  ${envOn ? `{ vec3 rWC = inverseTransformDirection(reflect(-vdC, normal), viewMatrix); float hC = rWC.y;
    vec3 eC = mix(vec3(0.46,0.34,0.26), vec3(0.62,0.74,1.0), smoothstep(-0.35, 0.8, hC)); eC += vec3(1.0,0.78,0.5) * exp(-pow((hC - 0.14) * 3.6, 2.0)) * 0.9;
    float frC = 0.4 + 0.6 * pow(1.0 - ndvC, 2.0); addC += mix(albC, vec3(1.0), ${f(k.ew || 0)}) * eC * ${f(k.env || 0)} * frC + eC * frC * (0.38 * gSW + 0.5 * gBM * uBFresh); } ` : ''}
  outgoingLight *= 1.0 - ${f(ed)} * pow(1.0 - ndvC, 2.6);
  outgoingLight += addC;
}
`;
  const bu = xo.blood, face = !!xo.face, sweat = !!xo.sweat, free = !!xo.free, lc = (k.wrap || k.kick) ? lightChunk(k) : null;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', code + '#include <opaque_fragment>');
    if (lc) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', lc);
    if (xo.back) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.10, 0.062, 0.04);'); // back of a shield: bare leather
    let colorX = '', head = '';
    if (face) { // painted face (eyes, brows, lips, wrinkles) sampled from a small canvas texture through the head uv, mixed over the skin colour
      sh.uniforms.uFace = { value: xo.face }; head += 'uniform sampler2D uFace; varying vec2 vFuv;\n';
      colorX += 'vec4 fcC = texture2D(uFace, vFuv); if (vFuv.x > 0.2505) diffuseColor.rgb *= mix(vec3(1.0), pow(fcC.rgb, vec3(0.4545)) * 2.0, fcC.a); else diffuseColor.rgb = mix(diffuseColor.rgb, fcC.rgb * (0.5 + 0.5 * vColor.r), fcC.a);\n';
    }
    if (bu) { // gore: blood soak, wounds and stumps painted from rest-space position (shared per rig uniforms, see makeBloodUniforms)
      Object.assign(sh.uniforms, bu);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBP;' + (face ? 'varying vec2 vFuv;' : '')).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (free ? 'vBP = vec3((uv.x - 0.5) * 0.55, 0.9 + (uv.y - 1.0) * 0.9, -0.2 + 0.1 * uv.x);' : 'vBP = position;') + (face ? '\nvFuv = uv;' : ''));
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + head + BLOOD_HEAD).replace('#include <color_fragment>', '#include <color_fragment>\n' + colorX + (sweat ? sweatCode : 'gSW = 0.0;') + '\n' + bloodCode(xo.gash !== false))
        .replace('outgoingLight += addC;', 'outgoingLight += addC * (1.0 - gBM * 0.65);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, mix(0.82, 0.16, uBFresh), gBM); roughnessFactor = mix(roughnessFactor, 0.14, gSW * 0.85);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor *= 1.0 - gBM * 0.9;');
    } else {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nfloat gBM = 0.0, gSW = 0.0; const float uBFresh = 0.0;');
      if (face) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + head).replace('#include <color_fragment>', '#include <color_fragment>\n' + colorX);
    }
  };
  mat.customProgramCacheKey = () => 'lmc-' + key + (mat.flatShading ? 'f' : 's') + (xo.back ? 'b' : '') + (bu ? (xo.gash === false ? 'B' : 'G') : '') + (face ? 'F' : '') + (sweat ? 'W' : '') + (free ? 'R' : '') + (lc ? 'L' : '');
  if (!mat.userData.base) mat.userData.base = mat.emissive.clone();
}
const BLOODY = { skin: 1, cloth: 1, leather: 1, metal: 0, steel: 0, trim: 0 }; // 1 = also shows gashes, 0 = stains only (armour)
export function makeMaterials(p = DEFAULT_PALETTE, blood = null, o = {}) {
  const mk = (color, roughness, metalness, flat = false, ds = false) => new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: flat, vertexColors: true, side: ds ? THREE.DoubleSide : THREE.FrontSide });
  const m = {
    skin: mk(p.skin, 0.5, 0), hair: mk(p.hair, 0.55, 0.05), cloth: mk(p.cloth, 0.9, 0, false, true), plume: mk(p.plume, 0.82, 0, false, true),
    leather: mk('#7a4e2c', 0.66, 0.05, false, true), metal: mk(p.metal, 0.4, 0.8, false, true), trim: mk('#f0be52', 0.3, 0.85, false, true), steel: mk('#c4cad6', 0.28, 0.9, false, true),
    eye: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), gem: mk('#ffffff', 0.2, 0.2, true, true),
  };
  m.hair.roughness = 0.5;
  const hd = (o.detail | 0) > 0; // medium / high: moving cloth gets rest-space blood coordinates, hair strands / tails are double sided cards
  if (hd) { m.clothF = mk(p.cloth, 0.9, 0, false, true); m.plumeF = mk(p.plume, 0.82, 0, false, true); m.hairF = mk(p.hair, 0.5, 0.05, false, true); if (o.strand) { m.hair.map = o.strand; m.hair.alphaTest = 0.5; } } // hair cards (strand cutout) share the hair mesh: scalp, curls and beard sample the solid root texel
  const KIND = { clothF: 'cloth', plumeF: 'plume', hairF: 'hair' };
  for (const k in m) {
    const kind = KIND[k] || k, xo = blood && (kind in BLOODY || (hd && kind === 'hair')) ? { blood, gash: !!BLOODY[kind] } : {};
    if (kind === 'skin') { xo.sweat = true; if (o.face) xo.face = o.face; }
    if (KIND[k]) { xo.gash = false; xo.free = true; }
    shadePatch(m[k], kind, xo);
  }
  return m;
}

// ---------------------------------------------------------------- Pose (euler targets, sparse authoring)
export class Pose {
  constructor() { this.r = new Float32Array(JOINTS.length * 3); this.hip = [0, 0, 0]; this.body = [0, 0, 0]; this.brot = [0, 0, 0]; this.ground = 1; this.lock = 1; }
  clear() { this.r.fill(0); this.hip[0] = this.hip[1] = this.hip[2] = 0; this.body[0] = this.body[1] = this.body[2] = 0; this.brot[0] = this.brot[1] = this.brot[2] = 0; this.ground = 1; this.lock = 1; return this; }
  set(j, x, y, z) { const i = JI[j] * 3; this.r[i] = x; this.r[i + 1] = y; this.r[i + 2] = z; return this; }
  add(j, x, y, z) { const i = JI[j] * 3; this.r[i] += x; this.r[i + 1] += y; this.r[i + 2] += z; return this; }
  get(j, k) { return this.r[JI[j] * 3 + k]; }
  copy(o) { this.r.set(o.r); for (let k = 0; k < 3; k++) { this.hip[k] = o.hip[k]; this.body[k] = o.body[k]; this.brot[k] = o.brot[k]; } this.ground = o.ground; this.lock = o.lock; return this; }
  mix(a, b, t) { for (let i = 0; i < this.r.length; i++) this.r[i] = lerp(a.r[i], b.r[i], t); for (let k = 0; k < 3; k++) { this.hip[k] = lerp(a.hip[k], b.hip[k], t); this.body[k] = lerp(a.body[k], b.body[k], t); this.brot[k] = lerp(a.brot[k], b.brot[k], t); } this.ground = lerp(a.ground, b.ground, t); this.lock = lerp(a.lock, b.lock, t); return this; }
  apply(sparse, w = 1) { // write a sparse pose {joint:[x,y,z], hip, body, brot, ground, lock}; w scales (0..1) toward it from current
    for (const k in sparse) {
      const v = sparse[k];
      if (k === 'hip' || k === 'body' || k === 'brot') for (let a = 0; a < 3; a++) this[k][a] = lerp(this[k][a], v[a], w);
      else if (k === 'ground' || k === 'lock') this[k] = lerp(this[k], v, w);
      else { const i = JI[k] * 3; for (let a = 0; a < 3; a++) this.r[i + a] = lerp(this.r[i + a], v[a], w); }
    } return this;
  }
}
export function mirrorPose(p) {
  const o = {};
  for (const k in p) {
    const v = p[k];
    if (k === 'hip' || k === 'body') o[k] = [-v[0], v[1], v[2]];
    else if (k === 'brot') o[k] = [v[0], -v[1], -v[2]];
    else if (k === 'ground' || k === 'lock') o[k] = v;
    else { const n = k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k; o[n] = [v[0], -v[1], -v[2]]; }
  }
  return o;
}

// ---------------------------------------------------------------- keyframed clips
// keys: [{t:seconds, p:sparsePose|'guard', e:easeName (arrival easing)}]. Unspecified joints inherit the previous key.
// A clip is {name, dur, loop, hold, mask:'full'|'upper', additive, events:[{t,name}], sample(t,P)}.
export function keyClip(name, keys, o = {}, stance = null) {
  const full = []; let prev = {};
  for (const k of keys) {
    const src = k.p === 'guard' ? (stance ? stance.guard : {}) : k.p;
    prev = Object.assign({}, prev, src); full.push({ t: k.t, p: prev, e: ease[k.e || 'inOutCubic'] });
  }
  const A = new Pose(), B = new Pose(), base = new Pose();
  const clip = Object.assign({
    name, dur: keys[keys.length - 1].t, loop: false, hold: false, mask: 'full', additive: false, events: [], fadeIn: 0.07, fadeOut: 0.12,
    sample(t, P) {
      t = Math.max(0, t); if (!this.loop && t > this.dur) t = this.dur; else if (this.loop && this.dur > 0) t = t % this.dur;
      let i = 0; while (i < full.length - 2 && t > full[i + 1].t) i++;
      const a = full[i], b = full[Math.min(i + 1, full.length - 1)];
      const u = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1, k = b.e(u);
      P.clear(); if (o.ground !== undefined) P.ground = o.ground;
      A.clear().apply(a.p); B.clear().apply(b.p); P.mix(A, B, k);
      if (o.ground !== undefined) P.ground = o.ground;
      return P;
    },
  }, o);
  return clip;
}

// ---------------------------------------------------------------- attack timing tables (seconds at speed 1)
// wind = anticipation (ease-out into the coil), strike = accelerating swing (ease-in), over = follow-through overshoot, rec = recovery.
// hitAt = wind + 0.85*strike (damage frame), swingAt = wind (whoosh/trail start). Scale a whole clip with play(name,{speed}).
export const ATTACK_TIMING = {
  sword: { attack1: { wind: .18, strike: .09, over: .05, rec: .30 }, attack2: { wind: .20, strike: .10, over: .05, rec: .32 }, attack3: { wind: .40, strike: .13, over: .07, rec: .55 } },
  spear: { attack1: { wind: .16, strike: .08, over: .04, rec: .30 }, attack2: { wind: .20, strike: .09, over: .05, rec: .32 }, attack3: { wind: .38, strike: .12, over: .06, rec: .55 } },
  brawl: { attack1: { wind: .12, strike: .07, over: .04, rec: .22 }, attack2: { wind: .17, strike: .09, over: .05, rec: .28 }, attack3: { wind: .28, strike: .11, over: .06, rec: .42 } },
  dual: { attack1: { wind: .14, strike: .08, over: .04, rec: .26 }, attack2: { wind: .14, strike: .08, over: .04, rec: .26 }, attack3: { wind: .34, strike: .12, over: .06, rec: .50 } },
};
export function attackInfo(weapon, name) { const T = ATTACK_TIMING[weapon][name]; return { dur: T.wind + T.strike + T.over + T.rec, swingAt: T.wind, hitAt: T.wind + T.strike * 0.85, recoverAt: T.wind + T.strike + T.over }; }

// Pose -> sparse object (every joint), used to author derived keys (extrapolated anticipation, rebound) from other keys
function sparseOf(P) { const o = {}; for (const j of JOINTS) { const i = JI[j] * 3; o[j] = [P.r[i], P.r[i + 1], P.r[i + 2]]; } o.hip = P.hip.slice(); o.body = P.body.slice(); o.brot = P.brot.slice(); o.ground = P.ground; o.lock = P.lock; return o; }
const LAG = { wristR: 0.04, wristL: 0.04, elbowR: 0.02, elbowL: 0.02, head: 0.05, neck: 0.03 }; // overlapping action: distal joints trail the clip time a little (whip / follow-through)
function attackClip(weapon, name, stance, poses) {
  const T = ATTACK_TIMING[weapon][name], t1 = T.wind, t2 = t1 + T.strike, t3 = t2 + T.over, t4 = t3 + T.rec;
  // weight shift: pelvis slides toward the rear foot while coiling, onto the lead foot through the strike and follow-through (sign follows the strike yaw: mirrored clips mirror it)
  const side = (poses.strike.chest && poses.strike.chest[1] < 0) ? -1 : 1, shift = (p, dx) => { const h = p.hip || [0, 0, 0]; return Object.assign({}, p, { hip: [h[0] + dx * side, h[1], h[2]] }); };
  const wind = shift(poses.wind, -0.04), windHold = shift(poses.windHold, -0.045), strike = shift(poses.strike, 0.05), follow = shift(poses.follow, 0.065);
  // anticipation: extrapolate guard -> wind backwards (counter-twist, arm dips, knees load) for a few frames before the coil
  const G = new Pose().apply(stance.guard || {}), W = new Pose().apply(stance.guard || {}).apply(wind), AN = new Pose().mix(G, W, -0.2), anti = sparseOf(AN); anti.ground = 1; anti.lock = 1;
  const F = new Pose().apply(stance.guard || {}).apply(wind).apply(windHold).apply(strike).apply(follow), RB = new Pose().mix(F, G, 0.55); RB.add('chest', 0.05, 0, 0).add('wristR', -0.12, 0, 0); // rebound: recovery overshoots, then settles
  const tA = Math.min(0.055, t1 * 0.3), keys = [
    { t: 0, p: 'guard' },
    { t: tA, p: anti, e: 'outQuad' },              // anticipation dip
    { t: t1, p: wind, e: 'outCubic' },              // decelerate into the coil
    { t: t1 + 0.035, p: windHold, e: 'linear' },    // tiny creeping hold sells the load
    { t: t2, p: strike, e: 'inCubic' },             // accelerate through the hit
    { t: t3, p: follow, e: 'outQuad' },             // follow-through overshoot
    { t: t3 + T.rec * 0.32, p: sparseOf(RB), e: 'outQuad' },
    { t: t4, p: 'guard', e: 'inOutCubic' },         // settle back to guard
  ];
  keys[3].t = Math.min(keys[3].t, t2 - 0.01);
  const c = keyClip(name, keys, { mask: 'full', events: [{ t: t1, name: 'swing' }, { t: t1 + T.strike * 0.85, name: 'hit' }], weapon }, stance);
  const base = c.sample, P2 = new Pose(); c.sample = function (t, P) { base.call(this, t, P); base.call(this, Math.max(0, t - 0.04), P2); for (const j in LAG) { const i = JI[j] * 3, w = LAG[j] / 0.04; for (let k = 0; k < 3; k++) P.r[i + k] = lerp(P.r[i + k], P2.r[i + k], w); } return P; };
  c.info = attackInfo(weapon, name); return c;
}

// ---------------------------------------------------------------- weapon poses (stance + attack pose tables)
// guard = sparse pose used at idle/loco when armed and as the first/last key of every attack. R = right hand weapon.
const SWORD_GUARD = {
  hips: [0.03, -0.22, 0], spine: [0.05, -0.04, 0], chest: [0.06, -0.06, 0], neck: [0, 0.1, 0], head: [-0.05, 0.2, 0],
  shoulderR: [-0.85, 0.1, -0.30], elbowR: [-1.35, 0, 0], wristR: [-0.15, 0, 0],
  shoulderL: [-0.35, 0, 0.30], elbowL: [-1.25, 0, 0], wristL: [0, 0, 0],
  hipL: [-0.30, 0, 0.12], kneeL: [0.42, 0, 0], hipR: [0.20, 0, -0.10], kneeR: [0.40, 0, 0], hip: [0, -0.07, 0],
};
export const WEAPON_POSES = {
  unarmed: { name: 'unarmed', weapon: 'sword', guard: {}, armedArms: 0 },
  sword: {
    name: 'sword', weapon: 'sword', guard: SWORD_GUARD, twoHand: false,
    attacks: {
      // 1: diagonal slash high-right to low-left
      attack1: {
        wind: { chest: [-0.12, -0.95, 0.05], spine: [0, -0.3, 0], hips: [0, -0.5, 0], head: [0.0, 0.85, 0], shoulderR: [-2.35, -0.2, -0.65], elbowR: [-1.25, 0, 0], wristR: [-0.4, 0, 0], shoulderL: [-0.35, 0, 0.6], elbowL: [-1.4, 0, 0], hip: [0, -0.1, -0.05], body: [0, 0, -0.05], kneeL: [0.6, 0, 0], kneeR: [0.55, 0, 0], hipL: [-0.22, 0, 0.1], hipR: [0.3, 0, -0.1] },
        windHold: { chest: [-0.14, -1.02, 0.05], shoulderR: [-2.45, -0.2, -0.7] },
        strike: { chest: [0.24, 0.8, -0.05], spine: [0.05, 0.25, 0], hips: [0, 0.3, 0], head: [0, 0.2, 0], shoulderR: [-1.3, 0.2, 0.35], elbowR: [-0.3, 0, 0], wristR: [0.2, 0, 0], shoulderL: [-0.2, 0, 0.7], elbowL: [-1.2, 0, 0], hip: [0, -0.12, 0], body: [0, 0, 0.22], kneeL: [0.85, 0, 0], hipL: [-0.75, 0, 0.1], kneeR: [0.15, 0, 0], hipR: [0.55, 0, -0.1] },
        follow: { chest: [0.3, 0.98, -0.05], hips: [0, 0.4, 0], shoulderR: [-1.0, 0.2, 0.68], elbowR: [-0.18, 0, 0], wristR: [0.3, 0, 0], body: [0, 0, 0.28] },
      },
      // 2: rising backhand, low-left to high-right
      attack2: {
        wind: { chest: [0.15, 0.85, 0.0], spine: [0, 0.3, 0], hips: [0, 0.4, 0], head: [0, -0.5, 0], shoulderR: [-0.9, 0.2, 0.95], elbowR: [-0.7, 0, 0], wristR: [0.3, 0, 0], shoulderL: [-0.9, 0, 0.3], hip: [0, -0.12, 0], body: [0, 0, -0.04], kneeL: [0.6, 0, 0], kneeR: [0.5, 0, 0] },
        windHold: { chest: [0.17, 0.92, 0] },
        strike: { chest: [0.0, -0.85, 0.05], spine: [0, -0.3, 0], hips: [0, -0.55, 0], head: [0, 0.9, 0], shoulderR: [-1.75, -0.2, -0.85], elbowR: [-0.25, 0, 0], wristR: [-0.2, 0, 0], body: [0, 0.0, 0.2], kneeL: [0.75, 0, 0], hipL: [-0.65, 0, 0.1], kneeR: [0.2, 0, 0], hipR: [0.45, 0, -0.1] },
        follow: { chest: [-0.05, -1.0, 0.08], hips: [0, -0.65, 0], shoulderR: [-1.95, -0.3, -1.0], elbowR: [-0.18, 0, 0], body: [0, 0, 0.26] },
      },
      // 3: heavy overhead smash with lunge
      attack3: {
        wind: { chest: [-0.45, -0.2, 0], spine: [-0.1, 0, 0], hips: [-0.05, -0.2, 0], head: [-0.2, 0.2, 0], shoulderR: [-2.9, 0, -0.35], elbowR: [-1.4, 0, 0], wristR: [-0.5, 0, 0], shoulderL: [-2.4, 0, 0.5], elbowL: [-1.2, 0, 0], hip: [0, -0.1, -0.1], body: [0, 0, -0.12], kneeL: [0.5, 0, 0], kneeR: [0.7, 0, 0], hipL: [-0.15, 0, 0.1], hipR: [0.35, 0, -0.1] },
        windHold: { chest: [-0.55, -0.2, 0], shoulderR: [-3.05, 0, -0.35], hip: [0, -0.04, -0.12] },
        strike: { chest: [0.75, 0.1, 0], spine: [0.2, 0, 0], hips: [0.1, 0.1, 0], head: [-0.4, 0.2, 0], shoulderR: [-1.05, 0, -0.1], elbowR: [-0.2, 0, 0], wristR: [0.4, 0, 0], shoulderL: [-1.0, 0, 0.3], elbowL: [-0.9, 0, 0], hip: [0, -0.2, 0.05], body: [0, 0, 0.34], kneeL: [1.15, 0, 0], hipL: [-0.95, 0, 0.1], kneeR: [0.25, 0, 0], hipR: [0.6, 0, -0.1] },
        follow: { chest: [0.88, 0.1, 0], shoulderR: [-0.8, 0, -0.1], wristR: [0.5, 0, 0], body: [0, 0, 0.4], hip: [0, -0.26, 0.05] },
      },
    },
  },
  spear: {
    name: 'spear', weapon: 'spear', twoHand: true,
    guard: {
      hips: [0.02, -0.3, 0], spine: [0.04, 0.1, 0], chest: [0.05, 0.12, 0], head: [-0.05, 0.15, 0],
      shoulderR: [-0.35, 0, 0.12], elbowR: [-1.3, 0, 0], wristR: [-0.25, 0, 0],
      shoulderL: [-0.9, 0, 0.3], elbowL: [-0.9, 0, 0], wristL: [0, 0, 0],
      hipL: [-0.34, 0, 0.1], kneeL: [0.45, 0, 0], hipR: [0.22, 0, -0.1], kneeR: [0.4, 0, 0], hip: [0, -0.08, 0],
    },
    attacks: {
      attack1: { // straight thrust
        wind: { chest: [0.0, -0.6, 0], hips: [0, -0.65, 0], shoulderR: [-0.2, 0.1, -0.1], elbowR: [-1.6, 0, 0], wristR: [0.25, 0, 0], hip: [0, -0.1, -0.06], body: [0, 0, -0.1], kneeL: [0.55, 0, 0], kneeR: [0.6, 0, 0] },
        windHold: { chest: [0, -0.68, 0], shoulderR: [-0.2, 0.1, -0.2] },
        strike: { chest: [0.22, 0.45, 0], hips: [0, 0.25, 0], shoulderR: [-1.3, 0, -0.1], elbowR: [-0.12, 0, 0], wristR: [-0.3, 0, 0], hip: [0, -0.14, 0], body: [0, 0, 0.32], kneeL: [0.95, 0, 0], hipL: [-0.85, 0, 0.1], kneeR: [0.1, 0, 0], hipR: [0.55, 0, -0.1] },
        follow: { chest: [0.28, 0.5, 0], shoulderR: [-1.4, 0, -0.1], elbowR: [-0.05, 0, 0], body: [0, 0, 0.38] },
      },
      attack2: { // overhead stab, steeper
        wind: { chest: [-0.3, -0.4, 0], hips: [0, -0.5, 0], shoulderR: [-2.6, 0, -0.3], elbowR: [-1.4, 0, 0], wristR: [-0.3, 0, 0], shoulderL: [-1.6, 0, 0.3], hip: [0, -0.08, -0.05], body: [0, 0, -0.08], kneeL: [0.5, 0, 0], kneeR: [0.55, 0, 0] },
        windHold: { chest: [-0.36, -0.45, 0], shoulderR: [-2.75, 0, -0.3] },
        strike: { chest: [0.5, 0.3, 0], hips: [0, 0.2, 0], shoulderR: [-1.2, 0, -0.1], elbowR: [-0.1, 0, 0], wristR: [0.3, 0, 0], shoulderL: [-1.0, 0, 0.3], hip: [0, -0.16, 0], body: [0, 0, 0.3], kneeL: [1.0, 0, 0], hipL: [-0.85, 0, 0.1], kneeR: [0.15, 0, 0], hipR: [0.5, 0, -0.1] },
        follow: { chest: [0.58, 0.35, 0], body: [0, 0, 0.36] },
      },
      attack3: { // heavy lunge, big windup, long reach
        wind: { chest: [-0.15, -0.9, 0], hips: [0, -0.9, 0], shoulderR: [-0.1, 0.1, -0.1], elbowR: [-1.7, 0, 0], wristR: [0.3, 0, 0], hip: [0, -0.2, -0.1], body: [0, 0, -0.18], kneeL: [0.7, 0, 0], kneeR: [0.9, 0, 0] },
        windHold: { chest: [-0.2, -1.0, 0], hips: [0, -1.0, 0], body: [0, 0, -0.22] },
        strike: { chest: [0.3, 0.55, 0], hips: [0, 0.35, 0], shoulderR: [-1.4, 0, -0.1], elbowR: [-0.05, 0, 0], wristR: [-0.2, 0, 0], hip: [0, -0.3, 0.05], body: [0, 0, 0.55], kneeL: [1.3, 0, 0], hipL: [-1.05, 0, 0.1], kneeR: [0.05, 0, 0], hipR: [0.7, 0, -0.1] },
        follow: { chest: [0.38, 0.6, 0], body: [0, 0, 0.62], hip: [0, -0.34, 0.05] },
      },
    },
  },
};
// two-hand spear: adduct the rear (right) arm so the shaft runs near the body centreline and the front hand can reach it
(function adductSpear() {
  const sp = WEAPON_POSES.spear, shift = (p) => { if (p.shoulderR) p.shoulderR = [p.shoulderR[0], p.shoulderR[1], p.shoulderR[2] + 0.42]; };
  shift(sp.guard); for (const n in sp.attacks) for (const k in sp.attacks[n]) shift(sp.attacks[n][k]);
})();
// dual blades: both hands hold swords. Stance = sword guard with mirrored left arm; attacks reuse sword poses.
(function buildDual() {
  const g = Object.assign({}, SWORD_GUARD, { shoulderL: [-0.85, -0.1, 0.30], elbowL: [-1.35, 0, 0], wristL: [-0.15, 0, 0] });
  const s = WEAPON_POSES.sword.attacks;
  const withL = (p, over) => Object.assign({}, p, over);
  const mirrored = {};
  for (const n of ['wind', 'windHold', 'strike', 'follow']) mirrored[n] = mirrorPose(s.attack1[n]);
  // mirrored guard offsets: legs/torso mirrored, keep the right arm hanging at guard
  for (const n of Object.keys(mirrored)) { mirrored[n].shoulderR = mirrored[n].shoulderR || [-0.85, 0.1, -0.3]; mirrored[n].elbowR = mirrored[n].elbowR || [-1.35, 0, 0]; }
  WEAPON_POSES.dual = {
    name: 'dual', weapon: 'dual', twoHand: false, dual: true, guard: g,
    attacks: {
      attack1: Object.fromEntries(['wind', 'windHold', 'strike', 'follow'].map((n) => [n, withL(s.attack1[n], n === 'wind' || n === 'strike' ? { shoulderL: [-0.75, 0, 0.45], elbowL: [-1.3, 0, 0] } : {})])),
      attack2: mirrored,
      attack3: { // cross-cut: arms cross, then burst wide
        wind: { chest: [0.15, 0, 0], head: [0, 0.3, 0], shoulderR: [-1.5, 0, 0.85], elbowR: [-0.8, 0, 0], shoulderL: [-1.5, 0, -0.85], elbowL: [-0.8, 0, 0], hip: [0, -0.15, 0], body: [0, 0, -0.08], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], hipL: [-0.3, 0, 0.1], hipR: [-0.3, 0, -0.1] },
        windHold: { chest: [0.2, 0, 0], shoulderR: [-1.6, 0, 0.95], shoulderL: [-1.6, 0, -0.95] },
        strike: { chest: [0.3, 0.0, 0], shoulderR: [-1.25, 0, -1.2], elbowR: [-0.15, 0, 0], shoulderL: [-1.25, 0, 1.2], elbowL: [-0.15, 0, 0], hip: [0, -0.2, 0], body: [0, 0, 0.32], kneeL: [1.0, 0, 0], hipL: [-0.9, 0, 0.1], kneeR: [0.2, 0, 0], hipR: [0.5, 0, -0.1] },
        follow: { chest: [0.36, 0, 0], shoulderR: [-1.15, 0, -1.35], shoulderL: [-1.15, 0, 1.35], body: [0, 0, 0.38] },
      },
    },
  };
})();

// brawl: official unarmed / one-handed stance (fists up, lead left). attack1 jab, attack2 right hook, attack3 two-handed shove. setWeapon('brawl') is a supported weapon name.
(function buildBrawl() {
  const guard = { hips: [0.03, -0.2, 0], spine: [0.06, -0.05, 0], chest: [0.1, -0.1, 0], neck: [0, 0.1, 0], head: [0, 0.2, 0], shoulderR: [-0.8, 0.15, -0.3], elbowR: [-1.95, 0, 0], wristR: [0, 0, 0], shoulderL: [-1.0, 0.1, 0.25], elbowL: [-1.85, 0, 0], wristL: [0, 0, 0], hipL: [-0.3, 0, 0.12], kneeL: [0.45, 0, 0], hipR: [0.2, 0, -0.1], kneeR: [0.42, 0, 0], hip: [0, -0.08, 0] };
  WEAPON_POSES.brawl = {
    name: 'brawl', weapon: 'brawl', twoHand: false, guard,
    attacks: {
      attack1: { // jab with the lead (left) hand
        wind: { chest: [0.1, -0.35, 0], hips: [0, -0.3, 0], shoulderL: [-0.7, 0.1, 0.35], elbowL: [-2.1, 0, 0], hip: [0, -0.1, -0.03], body: [0, 0, -0.04], kneeL: [0.55, 0, 0], hipL: [-0.25, 0, 0.1] },
        windHold: { chest: [0.1, -0.4, 0] },
        strike: { chest: [0.18, 0.3, 0], hips: [0, 0.2, 0], shoulderL: [-1.5, 0, 0.08], elbowL: [-0.08, 0, 0], shoulderR: [-0.7, 0.1, -0.25], hip: [0, -0.12, 0.04], body: [0, 0, 0.2], kneeL: [0.75, 0, 0], hipL: [-0.65, 0, 0.1], kneeR: [0.15, 0, 0], hipR: [0.45, 0, -0.1] },
        follow: { chest: [0.22, 0.35, 0], shoulderL: [-1.58, 0, 0.08], body: [0, 0, 0.25] },
      },
      attack2: { // right hook
        wind: { chest: [0.05, -0.7, 0], hips: [0, -0.5, 0], head: [0, 0.5, 0], shoulderR: [-1.15, 0.2, -1.35], elbowR: [-1.75, 0, 0], shoulderL: [-1.0, 0.1, 0.25], hip: [0, -0.12, -0.04], body: [0, 0, -0.04], kneeL: [0.6, 0, 0], kneeR: [0.55, 0, 0] },
        windHold: { chest: [0.05, -0.76, 0] },
        strike: { chest: [0.2, 0.8, 0], hips: [0, 0.45, 0], head: [0, -0.3, 0], shoulderR: [-1.4, -0.2, -0.2], elbowR: [-1.2, 0, 0], hip: [0, -0.14, 0.03], body: [0, 0, 0.22], kneeL: [0.9, 0, 0], hipL: [-0.7, 0, 0.1], kneeR: [0.2, 0, 0], hipR: [0.5, 0, -0.1] },
        follow: { chest: [0.25, 0.95, 0], hips: [0, 0.55, 0], shoulderR: [-1.4, -0.4, 0.3], elbowR: [-1.0, 0, 0], body: [0, 0, 0.28] },
      },
      attack3: { // two-handed shove
        wind: { chest: [-0.3, 0, 0], spine: [-0.1, 0, 0], shoulderR: [-0.8, 0, -0.4], elbowR: [-2.2, 0, 0], shoulderL: [-0.8, 0, 0.4], elbowL: [-2.2, 0, 0], hip: [0, -0.16, -0.1], body: [0, 0, -0.1], kneeL: [0.7, 0, 0], kneeR: [0.8, 0, 0] },
        windHold: { chest: [-0.38, 0, 0] },
        strike: { chest: [0.7, 0, 0], spine: [0.15, 0, 0], shoulderR: [-1.5, 0, -0.12], elbowR: [-0.12, 0, 0], shoulderL: [-1.5, 0, 0.12], elbowL: [-0.12, 0, 0], hip: [0, -0.26, 0.05], body: [0, 0, 0.4], kneeL: [1.1, 0, 0], hipL: [-0.95, 0, 0.1], kneeR: [0.2, 0, 0], hipR: [0.55, 0, -0.1] },
        follow: { chest: [0.82, 0, 0], body: [0, 0, 0.46], hip: [0, -0.3, 0.05] },
      },
    },
  };
})();

// ---------------------------------------------------------------- state clips (full body, procedural)
// Each sampler fills Pose P at time t. c = ctx {armed, alert, stance}.
function relaxedArms(P, t, c, swing = 0) {
  P.set('shoulderL', swing, 0, 0.09).set('shoulderR', -swing, 0, -0.09).set('elbowL', -0.18 - Math.abs(swing) * 0.3, 0, 0).set('elbowR', -0.18 - Math.abs(swing) * 0.3, 0, 0);
}
function applyArmed(P, c, amt) { // blend arms (and a touch of torso yaw) toward weapon guard
  const g = c.stance.guard; if (!amt) return;
  for (const j of ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR']) if (g[j]) for (let a = 0; a < 3; a++) P.r[JI[j] * 3 + a] = lerp(P.r[JI[j] * 3 + a], g[j][a], amt);
  for (const j of ['hips', 'spine', 'chest', 'head', 'neck']) if (g[j]) P.r[JI[j] * 3 + 1] = lerp(P.r[JI[j] * 3 + 1], g[j][1], amt * 0.8);
}
function idleSample(t, P, c) {
  P.clear(); const al = c.alert, br = Math.sin(c.breath !== undefined ? c.breath : t * Math.PI * 2 / 3.4) * (1 + 1.4 * (c.exert || 0)), sh = Math.sin(t * Math.PI * 2 / 7.3);
  P.hip[1] = -0.012 + 0.006 * br - 0.075 * al; P.hip[0] = 0.018 * sh;
  P.set('spine', 0.02 * br + 0.04 * al, 0, 0.02 * sh).set('chest', 0.025 * br + 0.05 * al, 0.04 * Math.sin(t * 0.55), -0.02 * sh)
    .set('neck', -0.02 * br, 0, 0).set('head', -0.015 * br - 0.04 * al, 0.06 * Math.sin(t * 0.4 + 1), 0.01 * sh);
  relaxedArms(P, t, c, 0.02 * br); P.add('shoulderL', 0, 0, 0.012 * br).add('shoulderR', 0, 0, -0.012 * br);
  const wl = Math.max(0, sh), wr = Math.max(0, -sh); // unweighted leg flexes a little
  P.set('hipL', -0.03 - 0.16 * al, 0.1, 0.07 + 0.03 * wl).set('hipR', -0.02 - 0.12 * al, -0.1, -0.07 - 0.03 * wr)
    .set('kneeL', 0.05 + 0.06 * wr + 0.35 * al, 0, 0).set('kneeR', 0.05 + 0.06 * wl + 0.3 * al, 0, 0);
  applyArmed(P, c, c.armed);
  if (al > 0.01) { // alert bounce on the balls of the feet
    const b = Math.sin(t * Math.PI * 2 * 1.3); P.hip[1] += 0.012 * b * al; P.add('shoulderR', 0.02 * b * al, 0, 0).add('shoulderL', 0.02 * b * al, 0, 0);
  }
  return P;
}
const GAITS = {
  walk: { A: 0.4, K: 0.75, kBase: 0.08, arm: 0.5, elbow: 0.28, lean: 0.05, bob: 0, hipYaw: 0.16, chestYaw: 0.22, lock: 1 },
  run: { A: 0.85, K: 1.75, kBase: 0.25, arm: 0.95, elbow: 1.35, lean: 0.27, bob: 0.085, hipYaw: 0.22, chestYaw: 0.3, lock: 0.35 },
};
function gaitSample(P, p, g, c, backwards = false) {
  P.clear(); const s = Math.sin(p), co = Math.cos(p), sR = Math.sin(p + Math.PI), cR = Math.cos(p + Math.PI);
  const sw = (ph) => 0.5 + 0.5 * Math.cos(ph + 0.6);
  const A = g.A * (backwards ? 0.75 : 1);
  P.set('hipL', -A * s, 0.08, 0.05).set('hipR', -A * sR, -0.08, -0.05);
  P.set('kneeL', g.kBase + g.K * Math.pow(sw(p), 2), 0, 0).set('kneeR', g.kBase + g.K * Math.pow(sw(p + Math.PI), 2), 0, 0);
  P.set('ankleL', -0.3 * s, 0, 0).set('ankleR', -0.3 * sR, 0, 0);
  P.set('hips', 0.02, g.hipYaw * s, 0.04 * co).set('spine', g.lean * 0.4, -g.chestYaw * 0.5 * s, -0.03 * co)
    .set('chest', g.lean * 0.6, -g.chestYaw * s, 0).set('neck', -g.lean * 0.3, 0, 0).set('head', -g.lean * 0.5, g.chestYaw * 0.6 * s, 0);
  P.set('shoulderL', g.arm * s, 0, 0.09).set('shoulderR', g.arm * sR, 0, -0.09)
    .set('elbowL', -g.elbow - 0.25 * g.arm * Math.max(0, -s), 0, 0).set('elbowR', -g.elbow - 0.25 * g.arm * Math.max(0, -sR), 0, 0);
  P.hip[1] = g.bob * (0.5 - 0.5 * Math.cos(2 * p + 0.3)) - (g.bob ? 0.03 : 0); P.hip[0] = 0.015 * s; P.lock = g.lock; return P;
}
function strafeSample(P, p, sx, c) { // sx: +1 moving to character left
  P.clear(); const s = Math.sin(p), sR = Math.sin(p + Math.PI);
  const lift = (ph) => Math.max(0, Math.cos(ph));
  P.set('hipL', -0.08, 0, 0.1 + sx * 0.38 * s).set('hipR', -0.08, 0, -0.1 + sx * 0.38 * sR);
  P.set('kneeL', 0.2 + 0.7 * lift(p), 0, 0).set('kneeR', 0.2 + 0.7 * lift(p + Math.PI), 0, 0);
  P.set('hips', 0.02, 0, -0.05 * sx * s).set('chest', 0.1, 0, 0.03 * sx * s).set('head', -0.04, 0, 0);
  relaxedArms(P, p, c, 0); P.hip[1] = -0.05; P.lock = 1; return P;
}

// one-shot / hold state clips (built per stance so guard-relative)
function buildStateClips(stance, style) {
  const K = (n, keys, o) => keyClip(n, keys, o, stance);
  const clips = {};
  // loop clips for debugging/sheets and for direct use (the Animator blend tree uses the same samplers)
  const cx = { armed: stance.armedArms === 0 ? 0 : 1, alert: stance.armedArms === 0 ? 0 : 0.5, stance };
  const loop = (n, dur, fn) => { clips[n] = { name: n, dur, loop: true, hold: false, mask: 'full', additive: false, events: [], fadeIn: 0.1, fadeOut: 0.1, sample(t, P) { return fn(t % dur, P); } }; };
  loop('idle', 6.8, (t, P) => idleSample(t, P, cx)); loop('walk', 1.0, (t, P) => { gaitSample(P, t * Math.PI * 2, GAITS.walk, cx); applyArmed(P, cx, cx.armed * 0.9); return P; });
  loop('run', 0.6, (t, P) => { gaitSample(P, t / 0.6 * Math.PI * 2, GAITS.run, cx); applyArmed(P, cx, cx.armed * 0.9); return P; });
  loop('strafe', 0.8, (t, P) => strafeSample(P, t / 0.8 * Math.PI * 2, 1, cx));
  clips.block = K('block', [
    { t: 0, p: 'guard' },
    { t: 0.11, p: { chest: [0.14, -0.1, 0], spine: [0.08, 0, 0], head: [-0.14, 0.3, 0], shoulderL: [-0.85, 0.2, 0.2], elbowL: [-1.65, 0, 0], wristL: [-0.2, 0, 0], shoulderR: [-0.75, 0, -0.45], elbowR: [-1.5, 0, 0], hip: [0, -0.14, 0], kneeL: [0.7, 0, 0], kneeR: [0.6, 0, 0], hipL: [-0.4, 0, 0.12], body: [0, 0, -0.04] }, e: 'outBack' },
    { t: 0.5, p: { chest: [0.16, -0.12, 0], shoulderL: [-0.9, 0.2, 0.2] }, e: 'inOutSine' },
  ], { hold: true, mask: 'upper', ground: 1 });
  clips.blockHit = K('blockHit', [ // additive recoil when a block takes a hit
    { t: 0, p: {} }, { t: 0.05, p: { chest: [-0.12, 0, 0], shoulderL: [0.3, 0, 0], elbowL: [0.25, 0, 0], head: [0.08, 0, 0], hip: [0, -0.02, -0.04] }, e: 'outCubic' }, { t: 0.28, p: { chest: [0, 0, 0], shoulderL: [0, 0, 0], elbowL: [0, 0, 0], head: [0, 0, 0], hip: [0, 0, 0] }, e: 'outCubic' },
  ], { additive: true });
  clips.hurt = K('hurt', [ // additive flinch; amplitude and side from animator.hurt(dir, amp)
    { t: 0, p: {} },
    { t: 0.06, p: { chest: [-0.4, 0.12, 0.08], spine: [-0.15, 0, 0], neck: [-0.2, 0, 0], head: [-0.3, -0.1, 0.06], shoulderL: [0.6, 0, 0.3], shoulderR: [0.5, 0, -0.3], elbowL: [0.35, 0, 0], elbowR: [0.3, 0, 0], hip: [0, -0.04, -0.07], hipL: [0.1, 0, 0], hipR: [0.1, 0, 0], kneeL: [0.15, 0, 0], kneeR: [0.15, 0, 0] }, e: 'outCubic' },
    { t: 0.16, p: { chest: [-0.32, 0.08, 0.05], head: [-0.22, -0.06, 0.04] }, e: 'outQuad' },
    { t: 0.42, p: { chest: [0, 0, 0], spine: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, 0], shoulderR: [0, 0, 0], elbowL: [0, 0, 0], elbowR: [0, 0, 0], hip: [0, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0] }, e: 'inOutCubic' },
  ], { additive: true });
  clips.knockdown = K('knockdown', [
    { t: 0, p: 'guard' },
    { t: 0.14, p: { chest: [-0.35, 0, 0], head: [-0.3, 0, 0], shoulderL: [0.3, 0, 0.9], shoulderR: [0.3, 0, -0.9], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], hip: [0, -0.04, -0.1], kneeL: [0.4, 0, 0], kneeR: [0.5, 0, 0], body: [0, 0, -0.15], hipL: [0.1, 0, 0.1], hipR: [0.2, 0, -0.1] }, e: 'outCubic' },
    { t: 0.42, p: { brot: [-0.9, 0, 0], body: [0, 0.2, -0.3], chest: [-0.4, 0, 0], head: [-0.45, 0, 0], shoulderL: [-1.9, 0, 0.7], shoulderR: [-1.9, 0, -0.7], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0], hipL: [-0.5, 0, 0.1], hipR: [-0.3, 0, -0.1], kneeL: [0.6, 0, 0], kneeR: [0.8, 0, 0], ground: 0 }, e: 'inQuad' },
    { t: 0.56, p: { brot: [-1.5708, 0, 0], body: [0, 0.17, -0.55], shoulderL: [-0.4, 0, 1.2], shoulderR: [-0.4, 0, -1.2], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], chest: [0, 0, 0], head: [0.05, 0.2, 0], hipL: [0, 0, 0.3], hipR: [0, 0, -0.3], kneeL: [0.25, 0, 0], kneeR: [0.4, 0, 0] }, e: 'inQuad' },
    { t: 0.7, p: { brot: [-1.38, 0, 0], body: [0, 0.35, -0.55], chest: [-0.15, 0, 0], head: [-0.15, 0.2, 0] }, e: 'outQuad' },
    { t: 0.88, p: { brot: [-1.5708, 0, 0], body: [0, 0.17, -0.55], chest: [0, 0, 0], head: [0.1, 0.25, 0] }, e: 'inQuad' },
    { t: 1.0, p: { head: [0.05, 0.2, 0] }, e: 'outCubic' },
  ], { hold: true, ground: 0 });
  clips.getup = K('getup', [
    { t: 0, p: { brot: [-1.5708, 0, 0], body: [0, 0.17, -0.55], ground: 0, hipL: [0, 0, 0.3], hipR: [0, 0, -0.3], shoulderL: [-0.4, 0, 1.2], shoulderR: [-0.4, 0, -1.2], kneeL: [0.25, 0, 0], kneeR: [0.4, 0, 0], head: [0.05, 0.2, 0] } },
    { t: 0.35, p: { brot: [-0.9, 0, 0], body: [0, 0.2, -0.3], chest: [0.5, 0, 0], hipL: [-1.2, 0, 0.1], kneeL: [1.8, 0, 0], hipR: [-0.9, 0, -0.1], kneeR: [1.9, 0, 0], shoulderL: [-0.8, 0, 0.6], shoulderR: [-0.8, 0, -0.6], head: [-0.1, 0, 0] }, e: 'inOutCubic' },
    { t: 0.7, p: { brot: [0, 0, 0], body: [0, 0, 0], ground: 1, chest: [0.55, 0, 0], hip: [0, -0.34, 0], hipL: [-1.0, 0, 0.1], kneeL: [1.3, 0, 0], hipR: [-0.5, 0, -0.1], kneeR: [1.4, 0, 0], shoulderL: [-0.4, 0, 0.3], shoulderR: [-0.4, 0, -0.3], elbowL: [-0.9, 0, 0], elbowR: [-0.9, 0, 0], head: [-0.2, 0, 0] }, e: 'outCubic' },
    { t: 1.0, p: 'guard', e: 'outBack' },
  ], { ground: 0 });
  clips.death = K('death', [
    { t: 0, p: 'guard' },
    { t: 0.12, p: { chest: [-0.45, 0, 0], head: [-0.4, 0, 0], shoulderL: [0.5, 0, 0.8], shoulderR: [0.5, 0, -0.8], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0], hip: [0, -0.08, -0.05], body: [0, 0, -0.1] }, e: 'outCubic' },
    { t: 0.5, p: { chest: [0.45, 0, 0.1], spine: [0.2, 0, 0], head: [0.5, 0.1, 0.1], hip: [0, -0.36, 0.1], hipL: [-1.05, 0, 0.15], kneeL: [1.2, 0, 0], hipR: [0.2, 0, -0.1], kneeR: [2.2, 0, 0], shoulderL: [0.2, 0, 0.3], shoulderR: [0.2, 0, -0.3], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], body: [0, 0, 0.15] }, e: 'inOutQuad' },
    { t: 0.9, p: { chest: [0.7, 0, 0.1], head: [0.7, 0.2, 0.15], hip: [0, -0.46, 0.15], brot: [0.3, 0, 0], body: [0, 0, 0.3], ground: 0 }, e: 'inQuad' },
    { t: 1.2, p: { brot: [1.5708, 0, 0], body: [0, 0.17, 0.5], hipL: [0.1, 0, 0.2], kneeL: [0.2, 0, 0], hipR: [0.3, 0, -0.25], kneeR: [0.1, 0, 0], chest: [0, 0, 0], spine: [0, 0, 0], head: [-0.3, 0.8, 0], hip: [0, 0, 0], shoulderL: [-2.4, 0, 0.5], shoulderR: [0.5, 0, -0.9], elbowL: [-0.3, 0, 0], elbowR: [-0.15, 0, 0] }, e: 'inQuad' },
    { t: 1.35, p: { brot: [1.42, 0, 0], body: [0, 0.27, 0.5] }, e: 'outQuad' },
    { t: 1.55, p: { brot: [1.5708, 0, 0], body: [0, 0.17, 0.5] }, e: 'inQuad' },
  ], { hold: true, ground: 0 });
  clips.stun = K('stun', [ // loop: dazed wobble, knees soft, head circling
    { t: 0, p: { chest: [0.12, 0, 0.1], head: [0.1, 0, 0.18], neck: [0.05, 0, 0.1], hip: [0.03, -0.1, 0], shoulderL: [0.2, 0, 0.25], shoulderR: [0.15, 0, -0.25], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.3, 0, 0], hipL: [-0.1, 0, 0.12], hipR: [-0.1, 0, -0.12] } },
    { t: 0.3, p: { chest: [0.2, 0, -0.1], head: [0.2, 0.15, -0.15], hip: [-0.03, -0.14, 0], kneeL: [0.3, 0, 0], kneeR: [0.5, 0, 0] }, e: 'inOutSine' },
    { t: 0.6, p: { chest: [0.1, 0, -0.14], head: [-0.05, 0, -0.2], neck: [-0.05, 0, -0.1], hip: [0.0, -0.1, 0], kneeL: [0.45, 0, 0], kneeR: [0.3, 0, 0] }, e: 'inOutSine' },
    { t: 0.9, p: { chest: [0.15, 0, 0.12], head: [0.1, -0.15, 0.15], hip: [0.03, -0.15, 0], kneeL: [0.35, 0, 0], kneeR: [0.45, 0, 0] }, e: 'inOutSine' },
    { t: 1.2, p: { chest: [0.12, 0, 0.1], head: [0.1, 0, 0.18], neck: [0.05, 0, 0.1], hip: [0.03, -0.1, 0], kneeL: [0.4, 0, 0], kneeR: [0.3, 0, 0] }, e: 'inOutSine' },
  ], { loop: true });
  clips.victory = K('victory', [
    { t: 0, p: 'guard' },
    { t: 0.55, p: { chest: [-0.2, 0.15, 0.05], spine: [-0.08, 0, 0], neck: [-0.1, 0, 0], head: [-0.25, 0.1, 0], shoulderR: [-2.95, 0.2, -0.55], elbowR: [-0.35, 0, 0], wristR: [0, 0, 0], shoulderL: [-0.3, 0, 0.9], elbowL: [-0.5, 0, 0], hip: [0, -0.02, 0], hipL: [-0.15, 0.1, 0.18], hipR: [0.1, -0.1, -0.2], kneeL: [0.1, 0, 0], kneeR: [0.1, 0, 0], hips: [0, 0, 0] }, e: 'outBack' },
    { t: 1.6, p: { chest: [-0.24, 0.15, 0.04], shoulderR: [-3.05, 0.2, -0.62], head: [-0.3, 0.12, 0] }, e: 'inOutSine' },
  ], { hold: true });
  clips.taunt = K('taunt', [
    { t: 0, p: 'guard' },
    { t: 0.25, p: { chest: [-0.15, 0.3, 0.1], head: [-0.15, -0.3, 0.15], shoulderL: [-0.2, 0, 1.2], elbowL: [-0.4, 0, 0], shoulderR: [-1.5, 0.2, -0.3], elbowR: [-0.5, 0, 0], hip: [0, -0.04, 0], kneeL: [0.3, 0, 0], kneeR: [0.5, 0, 0] }, e: 'outBack' },
    { t: 0.75, p: { chest: [-0.2, -0.3, -0.1], head: [-0.2, 0.3, -0.15], shoulderL: [-0.1, 0, 1.45], shoulderR: [-1.6, 0.2, -1.25], elbowR: [-0.3, 0, 0], hip: [0, -0.02, 0], kneeL: [0.45, 0, 0], kneeR: [0.3, 0, 0] }, e: 'inOutSine' },
    { t: 1.2, p: { chest: [-0.25, 0.3, 0.1], head: [-0.3, -0.25, 0.2], shoulderL: [-1.9, 0, 0.5], elbowL: [-1.9, 0, 0], shoulderR: [-2.4, 0.2, -0.4], elbowR: [-0.4, 0, 0], hip: [0, 0, 0] }, e: 'inOutSine' },
    { t: 1.7, p: 'guard', e: 'inOutCubic' },
  ], { mask: 'full' });
  clips.cheer = K('cheer', [
    { t: 0, p: { chest: [-0.15, 0, 0], head: [-0.3, 0, 0], shoulderL: [-3.0, 0, 0.3], shoulderR: [-2.5, 0, -0.5], elbowL: [-0.3, 0, 0], elbowR: [-0.5, 0, 0], hip: [0, -0.1, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], hipL: [-0.2, 0, 0.12], hipR: [-0.2, 0, -0.12] } },
    { t: 0.25, p: { chest: [-0.2, 0.1, 0], shoulderL: [-2.5, 0, 0.5], shoulderR: [-3.05, 0, -0.3], hip: [0, 0.1, 0], kneeL: [0.1, 0, 0], kneeR: [0.1, 0, 0], ground: 0, hipL: [-0.05, 0, 0.1], hipR: [-0.05, 0, -0.1] }, e: 'outQuad' },
    { t: 0.5, p: { chest: [-0.15, 0, 0], shoulderL: [-3.0, 0, 0.3], shoulderR: [-2.5, 0, -0.5], hip: [0, -0.1, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], ground: 1, hipL: [-0.2, 0, 0.12], hipR: [-0.2, 0, -0.12] }, e: 'inQuad' },
  ], { loop: true });
  Object.assign(clips, reactionClips(stance, style, K)); clips.knockdownBack = clips.knockdown; clips.getupBack = clips.getup; clips.deathKneel = clips.death;
  return clips;
}

// ---------------------------------------------------------------- reactions, falls, executions, victories (directional where it matters)
// Names (play(name) or the helper methods on the Animator): stagger{Back,Fwd,L,R}, knockdown{Back,Front,L,R} (+ getup{,Front,Side}), death{Back,Front,L,R,Spin},
// finisher (attacker) + execKneel / execDie (victim), victory (per style), hurtSide (additive lateral layer used by hurt()).
const ARMS_OUT = (k, sp = 0.95) => ({ shoulderL: [0.3 * k, 0, sp], shoulderR: [0.3 * k, 0, -sp], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0] });
const KNEEL = { hip: [0, -0.465, 0.02], hips: [0.0, 0, 0], hipL: [0, 0, 0.09], hipR: [0, 0, -0.09], kneeL: [1.62, 0, 0], kneeR: [1.7, 0, 0], ankleL: [-1.2, 0, 0], ankleR: [-1.2, 0, 0], spine: [0.1, 0, 0], chest: [0.16, 0, 0], neck: [0.15, 0, 0], head: [0.5, 0, 0], shoulderL: [0.55, 0, 0.2], shoulderR: [0.55, 0, -0.2], elbowL: [-0.35, 0, 0], elbowR: [-0.35, 0, 0], wristL: [0, 0, 0], wristR: [0, 0, 0], body: [0, 0, 0], brot: [0, 0, 0], ground: 0 };
const LIE_BACK = { brot: [-1.5708, 0, 0], body: [0, 0.17, -0.62] }, LIE_FRONT = { brot: [1.5708, 0, 0], body: [0, 0.17, 0.6] };
function reactionClips(stance, style, K) {
  const C = {}, st = stance.weapon || 'sword', dual = !!stance.dual, spear = st === 'spear', adduct = spear ? 0.42 : 0;
  // ---- stagger: a few steps of lost balance, planted feet slide with the body offset, recovers to guard
  C.staggerBack = K('staggerBack', [
    { t: 0, p: 'guard' },
    { t: 0.09, p: Object.assign({ chest: [-0.5, 0, 0.04], spine: [-0.14, 0, 0], neck: [-0.15, 0, 0], head: [-0.3, 0, 0], hip: [0, -0.04, -0.09], body: [0, 0, -0.1], hipL: [0.15, 0, 0.12], kneeL: [0.35, 0, 0], hipR: [-0.1, 0, -0.1], kneeR: [0.35, 0, 0] }, ARMS_OUT(1)), e: 'outCubic' },
    { t: 0.26, p: { chest: [-0.28, 0, 0], head: [-0.2, 0, 0], shoulderL: [0.55, 0, 1.15], shoulderR: [0.45, 0, -1.15], body: [0, 0, -0.38], hip: [0, -0.07, -0.06], hipL: [0.55, 0, 0.18], kneeL: [0.15, 0, 0], hipR: [-0.6, 0, -0.12], kneeR: [1.0, 0, 0] }, e: 'inOutQuad' },
    { t: 0.42, p: { chest: [0.12, 0, 0], head: [-0.05, 0, 0], shoulderL: [-0.2, 0, 0.9], shoulderR: [-0.2, 0, -0.9], body: [0, 0, -0.44], hip: [0, -0.1, 0], hipL: [-0.35, 0, 0.12], kneeL: [0.6, 0, 0], hipR: [0.25, 0, -0.1], kneeR: [0.5, 0, 0] }, e: 'outQuad' },
    { t: 0.8, p: 'guard', e: 'inOutCubic' },
  ], { mask: 'full', fadeIn: 0.05, fadeOut: 0.16 });
  C.staggerFwd = K('staggerFwd', [
    { t: 0, p: 'guard' },
    { t: 0.09, p: { chest: [0.55, 0, 0], spine: [0.15, 0, 0], head: [-0.35, 0, 0], neck: [-0.15, 0, 0], shoulderL: [0.8, 0, 0.5], shoulderR: [0.8, 0, -0.5], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], hip: [0, -0.05, 0.06], body: [0, 0, 0.1], kneeL: [0.4, 0, 0], kneeR: [0.4, 0, 0] }, e: 'outCubic' },
    { t: 0.27, p: { chest: [0.7, 0, 0], head: [0.1, 0, 0], shoulderL: [-0.6, 0, 0.4], shoulderR: [-0.6, 0, -0.4], body: [0, 0, 0.34], hip: [0, -0.12, 0.08], hipL: [-0.7, 0, 0.1], kneeL: [0.9, 0, 0], hipR: [0.4, 0, -0.1], kneeR: [0.3, 0, 0] }, e: 'inOutQuad' },
    { t: 0.45, p: { chest: [0.3, 0, 0], body: [0, 0, 0.4], hip: [0, -0.15, 0.05], hipL: [-0.5, 0, 0.1], kneeL: [0.8, 0, 0] }, e: 'outQuad' },
    { t: 0.82, p: 'guard', e: 'inOutCubic' },
  ], { mask: 'full', fadeIn: 0.05, fadeOut: 0.16 });
  for (const sg of [1, -1]) { // lateral: pushed toward the character's LEFT (sg = +1) or RIGHT; the leg on that side steps out, the arm flings out, torso rolls away from the blow
    const L = sg > 0 ? 'L' : 'R', T = sg > 0 ? 'R' : 'L', zS = (j) => (j === 'L' ? 1 : -1);
    C['stagger' + L] = K('stagger' + L, [
      { t: 0, p: 'guard' },
      { t: 0.09, p: { chest: [-0.12, -0.2 * sg, -0.3 * sg], spine: [0, 0, -0.1 * sg], head: [-0.1, 0, 0.25 * sg], hips: [0, 0.1 * sg, -0.08 * sg], ['shoulder' + L]: [0.1, 0, zS(L) * 1.2], ['shoulder' + T]: [-0.6, 0, zS(T) * 0.3], hip: [0.05 * sg, -0.05, 0], body: [0.1 * sg, 0, 0], ['hip' + L]: [0, 0, zS(L) * 0.45], ['knee' + L]: [0.3, 0, 0] }, e: 'outCubic' },
      { t: 0.26, p: { chest: [0, -0.1 * sg, -0.35 * sg], head: [0, 0, 0.2 * sg], body: [0.34 * sg, 0, 0], hip: [0.1 * sg, -0.09, 0], ['hip' + L]: [0.1, 0, zS(L) * 0.6], ['knee' + L]: [0.2, 0, 0], ['hip' + T]: [-0.3, 0, zS(T) * 0.05], ['knee' + T]: [0.7, 0, 0], ['shoulder' + L]: [0.2, 0, zS(L) * 1.3] }, e: 'inOutQuad' },
      { t: 0.42, p: { chest: [0.1, 0, -0.1 * sg], body: [0.4 * sg, 0, 0], hip: [0.1 * sg, -0.1, 0], ['hip' + L]: [-0.1, 0, zS(L) * 0.4], ['knee' + L]: [0.5, 0, 0], ['hip' + T]: [0.1, 0, zS(T) * 0.1], ['knee' + T]: [0.5, 0, 0] }, e: 'outQuad' },
      { t: 0.8, p: 'guard', e: 'inOutCubic' },
    ], { mask: 'full', fadeIn: 0.05, fadeOut: 0.16 });
  }
  // ---- additive lateral layer for hurt(): positive = attacker on the character's LEFT, scaled by animator.hurt(dir, amp, side)
  C.hurtSide = K('hurtSide', [
    { t: 0, p: {} },
    { t: 0.07, p: { chest: [0, 0.22, -0.2], spine: [0, 0.08, -0.08], head: [0, 0.2, -0.22], neck: [0, 0.1, -0.1], hips: [0, 0.08, -0.06], shoulderR: [0.2, 0, 0.35], shoulderL: [0.2, 0, -0.1], hip: [-0.05, 0, 0] }, e: 'outCubic' },
    { t: 0.44, p: { chest: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], neck: [0, 0, 0], hips: [0, 0, 0], shoulderR: [0, 0, 0], shoulderL: [0, 0, 0], hip: [0, 0, 0] }, e: 'inOutCubic' },
  ], { additive: true });
  // ---- knockdowns (held pose, airborne / lying: ground 0) and the matching get-ups
  const bounce = (lie, e1 = 1.42) => [{ t: 0.7, p: { brot: [lie.brot[0] > 0 ? e1 : -e1, lie.brot[1], lie.brot[2]], body: [lie.body[0], 0.35, lie.body[2]], head: [0.05, 0.2, 0] }, e: 'outQuad' }];
  C.knockdownFront = K('knockdownFront', [
    { t: 0, p: 'guard' },
    { t: 0.13, p: { chest: [0.4, 0, 0], head: [0.2, 0, 0], shoulderL: [0.6, 0, 0.9], shoulderR: [0.6, 0, -0.9], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], hip: [0, -0.04, 0.08], body: [0, 0, 0.12], kneeL: [0.4, 0, 0], kneeR: [0.5, 0, 0] }, e: 'outCubic' },
    { t: 0.4, p: { brot: [0.9, 0, 0], body: [0, 0.2, 0.3], chest: [0.4, 0, 0], head: [-0.4, 0, 0], shoulderL: [-2.2, 0, 0.5], shoulderR: [-2.2, 0, -0.5], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0], hipL: [-0.3, 0, 0.1], kneeL: [0.5, 0, 0], hipR: [0.3, 0, -0.1], kneeR: [0.9, 0, 0], ground: 0 }, e: 'inQuad' },
    { t: 0.54, p: { brot: [1.5708, 0, 0], body: [0, 0.17, 0.58], shoulderL: [-2.4, 0, 0.6], shoulderR: [-2.4, 0, -0.6], chest: [0, 0, 0], head: [-0.2, 0.3, 0], hipL: [0, 0, 0.2], hipR: [0, 0, -0.2], kneeL: [0.2, 0, 0], kneeR: [0.3, 0, 0] }, e: 'inQuad' },
    { t: 0.7, p: { brot: [1.42, 0, 0], body: [0, 0.35, 0.58], head: [-0.4, 0.3, 0] }, e: 'outQuad' },
    { t: 0.88, p: { brot: [1.5708, 0, 0], body: [0, 0.17, 0.58], head: [0, 0.4, 0] }, e: 'inQuad' },
    { t: 1.0, p: { head: [0.05, 0.45, 0] }, e: 'outCubic' },
  ], { hold: true, ground: 0 });
  C.getupFront = K('getupFront', [
    { t: 0, p: { brot: [1.5708, 0, 0], body: [0, 0.17, 0.58], ground: 0, shoulderL: [-2.4, 0, 0.6], shoulderR: [-2.4, 0, -0.6], hipL: [0, 0, 0.2], hipR: [0, 0, -0.2], kneeL: [0.2, 0, 0], kneeR: [0.3, 0, 0], head: [0.05, 0.45, 0] } },
    { t: 0.3, p: { brot: [1.2, 0, 0], body: [0, 0.25, 0.4], chest: [-0.3, 0, 0], shoulderL: [-1.6, 0, 0.4], shoulderR: [-1.6, 0, -0.4], elbowL: [-0.9, 0, 0], elbowR: [-0.9, 0, 0], hipL: [-0.9, 0, 0.1], kneeL: [1.9, 0, 0], hipR: [-0.9, 0, -0.1], kneeR: [2.0, 0, 0], head: [-0.5, 0, 0] }, e: 'inOutCubic' },
    { t: 0.62, p: { brot: [0.3, 0, 0], body: [0, 0.05, 0.1], chest: [0.4, 0, 0], hip: [0, -0.34, 0], hipL: [-1.1, 0, 0.1], kneeL: [1.5, 0, 0], hipR: [-0.5, 0, -0.1], kneeR: [1.4, 0, 0], shoulderL: [-0.6, 0, 0.3], shoulderR: [-0.6, 0, -0.3], ground: 1, head: [-0.2, 0, 0] }, e: 'inOutCubic' },
    { t: 0.95, p: 'guard', e: 'outBack' },
  ], { ground: 0 });
  for (const sg of [1, -1]) {
    const L = sg > 0 ? 'L' : 'R', zS = sg > 0 ? 1 : -1, lie = { brot: [0, 0, -1.5708 * sg], body: [-0.35 * sg, 0.17, 0.0] };
    C['knockdown' + L] = K('knockdown' + L, [
      { t: 0, p: 'guard' },
      { t: 0.13, p: { chest: [-0.1, 0, -0.35 * sg], head: [0, 0, -0.3 * sg], ['shoulder' + L]: [0.2, 0, 1.2 * zS], hip: [0.06 * sg, -0.04, 0], body: [0.1 * sg, 0, 0], ['hip' + L]: [0, 0, 0.45 * zS], kneeL: [0.4, 0, 0], kneeR: [0.5, 0, 0] }, e: 'outCubic' },
      { t: 0.42, p: { brot: [0.1, 0, -0.8 * sg], body: [0.0, 0.25, 0.0], chest: [0, 0, -0.2 * sg], shoulderL: [-1.2, 0, 0.9], shoulderR: [-1.2, 0, -0.9], hipL: [-0.3, 0, 0.3], hipR: [-0.3, 0, -0.3], kneeL: [0.7, 0, 0], kneeR: [0.9, 0, 0], ground: 0 }, e: 'inQuad' },
      { t: 0.56, p: { brot: lie.brot, body: lie.body, chest: [0, 0, 0], head: [0, 0.2, 0], shoulderL: [-0.5, 0, 1.2], shoulderR: [-0.5, 0, -1.2], hipL: [0.1, 0, 0.3], hipR: [0.1, 0, -0.3], kneeL: [0.4, 0, 0.2], kneeR: [0.6, 0, 0] }, e: 'inQuad' },
      { t: 0.7, p: { brot: [0, 0, -1.38 * sg], body: [lie.body[0], 0.33, 0] }, e: 'outQuad' },
      { t: 0.88, p: { brot: lie.brot, body: lie.body }, e: 'inQuad' },
      { t: 1.0, p: { head: [0.05, 0.25, 0] }, e: 'outCubic' },
    ], { hold: true, ground: 0 });
    C['getupSide' + L] = K('getupSide' + L, [
      { t: 0, p: { brot: lie.brot, body: lie.body, ground: 0, shoulderL: [-0.5, 0, 1.2], shoulderR: [-0.5, 0, -1.2], hipL: [0.1, 0, 0.3], hipR: [0.1, 0, -0.3], kneeR: [0.6, 0, 0] } },
      { t: 0.38, p: { brot: [0.4, 0, -0.5 * sg], body: [-0.15 * sg, 0.2, 0.1], chest: [0.4, 0, 0], hipL: [-1.0, 0, 0.1], kneeL: [1.8, 0, 0], hipR: [-0.8, 0, -0.1], kneeR: [1.9, 0, 0], shoulderL: [-0.9, 0, 0.6], shoulderR: [-0.9, 0, -0.6] }, e: 'inOutCubic' },
      { t: 0.72, p: { brot: [0, 0, 0], body: [0, 0, 0], ground: 1, chest: [0.55, 0, 0], hip: [0, -0.34, 0], hipL: [-1.0, 0, 0.1], kneeL: [1.3, 0, 0], hipR: [-0.5, 0, -0.1], kneeR: [1.4, 0, 0] }, e: 'outCubic' },
      { t: 1.0, p: 'guard', e: 'outBack' },
    ], { ground: 0 });
  }
  // ---- deaths by blow direction (all held, flagged dead)
  const settle = (lie, extra = {}) => [{ t: 1.12, p: Object.assign({ brot: lie.brot, body: lie.body }, extra), e: 'inQuad' }];
  C.deathBack = K('deathBack', [
    { t: 0, p: 'guard' },
    { t: 0.1, p: Object.assign({ chest: [-0.5, 0, 0], head: [-0.4, 0, 0], hip: [0, -0.05, -0.06], body: [0, 0, -0.1] }, ARMS_OUT(1)), e: 'outCubic' },
    { t: 0.32, p: { chest: [-0.35, 0, 0], head: [-0.3, 0, 0], kneeL: [0.9, 0, 0], kneeR: [1.2, 0, 0], hip: [0, -0.22, -0.1], body: [0, 0, -0.3], shoulderL: [0.3, 0, 1.1], shoulderR: [0.3, 0, -1.1] }, e: 'inOutQuad' },
    { t: 0.6, p: { brot: [-0.9, 0, 0], body: [0, 0.2, -0.45], hip: [0, -0.1, 0], shoulderL: [-1.2, 0, 1.0], shoulderR: [-1.2, 0, -1.0], hipL: [-0.4, 0, 0.1], kneeL: [0.8, 0, 0], kneeR: [0.4, 0, 0], ground: 0 }, e: 'inQuad' },
    { t: 0.82, p: { brot: LIE_BACK.brot, body: LIE_BACK.body, shoulderL: [-0.3, 0, 1.2], shoulderR: [-0.4, 0, -1.1], chest: [0, 0, 0], head: [0.1, 0.35, 0], hipL: [0.05, 0, 0.25], hipR: [0.1, 0, -0.2], kneeL: [0.3, 0, 0], kneeR: [0.6, 0, 0] }, e: 'inQuad' },
    { t: 0.96, p: { brot: [-1.38, 0, 0], body: [0, 0.3, LIE_BACK.body[2]] }, e: 'outQuad' },
    ...settle(LIE_BACK),
  ], { hold: true, ground: 0 });
  C.deathFront = K('deathFront', [
    { t: 0, p: 'guard' },
    { t: 0.1, p: { chest: [-0.45, 0, 0], head: [-0.5, 0, 0], shoulderL: [0.6, 0, 0.6], shoulderR: [0.6, 0, -0.6], elbowL: [-0.2, 0, 0], elbowR: [-0.2, 0, 0], hip: [0, -0.04, 0.06] }, e: 'outCubic' },
    { t: 0.36, p: { chest: [0.5, 0, 0], head: [0.4, 0, 0], kneeL: [0.8, 0, 0], kneeR: [1.0, 0, 0], hip: [0, -0.26, 0.1], body: [0, 0, 0.16], shoulderL: [-0.4, 0, 0.5], shoulderR: [-0.4, 0, -0.5] }, e: 'inOutQuad' },
    { t: 0.6, p: { brot: [0.8, 0, 0], body: [0, 0.2, 0.4], shoulderL: [-1.7, 0, 0.5], shoulderR: [-1.7, 0, -0.5], hip: [0, -0.1, 0], hipL: [-0.3, 0, 0.1], kneeL: [0.6, 0, 0], ground: 0 }, e: 'inQuad' },
    { t: 0.82, p: { brot: LIE_FRONT.brot, body: LIE_FRONT.body, shoulderL: [-2.5, 0, 0.6], shoulderR: [-2.3, 0, -0.6], chest: [0, 0, 0], head: [-0.2, 0.5, 0] }, e: 'inQuad' },
    { t: 0.96, p: { brot: [1.42, 0, 0], body: [0, 0.3, LIE_FRONT.body[2]] }, e: 'outQuad' },
    ...settle(LIE_FRONT),
  ], { hold: true, ground: 0 });
  for (const sg of [1, -1]) {
    const L = sg > 0 ? 'L' : 'R', zS = sg > 0 ? 1 : -1, lie = { brot: [0, 0, -1.5708 * sg], body: [-0.35 * sg, 0.17, 0] };
    C['death' + L] = K('death' + L, [
      { t: 0, p: 'guard' },
      { t: 0.1, p: { chest: [-0.2, 0, -0.35 * sg], head: [-0.2, 0, -0.3 * sg], ['shoulder' + L]: [0.2, 0, 1.2 * zS], hip: [0.06 * sg, -0.05, 0], body: [0.1 * sg, 0, 0] }, e: 'outCubic' },
      { t: 0.34, p: { chest: [0.15, 0, -0.4 * sg], head: [0.2, 0, -0.3 * sg], kneeL: [0.9, 0, 0], kneeR: [1.1, 0, 0], hip: [0.1 * sg, -0.26, 0], body: [0.22 * sg, 0, 0], shoulderL: [0.1, 0, 0.9], shoulderR: [0.1, 0, -0.9] }, e: 'inOutQuad' },
      { t: 0.62, p: { brot: [0.05, 0, -0.9 * sg], body: [0.0, 0.2, 0.0], hip: [0, -0.1, 0], shoulderL: [-1.0, 0, 0.9], shoulderR: [-1.0, 0, -0.9], hipL: [-0.3, 0, 0.2], hipR: [-0.3, 0, -0.2], kneeL: [0.8, 0, 0], kneeR: [0.9, 0, 0], ground: 0 }, e: 'inQuad' },
      { t: 0.84, p: { brot: lie.brot, body: lie.body, chest: [0, 0, 0], head: [0.1, 0.3, 0], shoulderL: [-0.4, 0, 1.2], shoulderR: [-0.4, 0, -1.2], hipL: [0.1, 0, 0.25], hipR: [0.1, 0, -0.25], kneeL: [0.3, 0, 0], kneeR: [0.6, 0, 0] }, e: 'inQuad' },
      { t: 0.98, p: { brot: [0, 0, -1.38 * sg], body: [lie.body[0], 0.3, 0] }, e: 'outQuad' },
      ...settle(lie),
    ], { hold: true, ground: 0 });
  }
  C.deathSpin = K('deathSpin', [ // heavy blow: pirouette while falling, lands on the back
    { t: 0, p: 'guard' },
    { t: 0.12, p: Object.assign({ chest: [-0.5, -0.3, 0], head: [-0.4, 0, 0], hip: [0, -0.04, 0], body: [0, 0, -0.1] }, ARMS_OUT(1.2)), e: 'outCubic' },
    { t: 0.5, p: { brot: [-0.35, 2.6, 0], body: [0, 0.16, 0.05], hip: [0, -0.1, 0], kneeL: [0.8, 0, 0], kneeR: [0.9, 0, 0], shoulderL: [-0.5, 0, 1.3], shoulderR: [-0.5, 0, -1.3], ground: 0 }, e: 'inOutQuad' },
    { t: 0.85, p: { brot: [-1.5708, 5.0, 0], body: [0, 0.17, -0.5], chest: [0, 0, 0], head: [0.1, 0.4, 0], shoulderL: [-0.3, 0, 1.2], shoulderR: [-0.4, 0, -1.2], hipL: [0.05, 0, 0.25], hipR: [0.1, 0, -0.2], kneeL: [0.3, 0, 0], kneeR: [0.6, 0, 0] }, e: 'inQuad' },
    { t: 1.0, p: { brot: [-1.38, 5.0, 0], body: [0, 0.3, -0.5] }, e: 'outQuad' },
    { t: 1.2, p: { brot: [-1.5708, 5.0, 0], body: [0, 0.17, -0.5] }, e: 'inQuad' },
  ], { hold: true, ground: 0 });
  // ---- execution: victim kneels (held), then dies when the finisher lands; attacker plays `finisher` (events swing, hit, end)
  C.execKneel = K('execKneel', [
    { t: 0, p: 'guard' },
    { t: 0.22, p: { hip: [0, -0.18, 0.02], hipL: [-0.5, 0, 0.1], hipR: [-0.2, 0, -0.1], kneeL: [1.3, 0, 0], kneeR: [1.5, 0, 0], chest: [0.2, 0, 0], head: [0.2, 0, 0], shoulderL: [0.3, 0, 0.5], shoulderR: [0.3, 0, -0.5], ground: 1 }, e: 'outCubic' },
    { t: 0.62, p: KNEEL, e: 'inOutCubic' },
  ], { hold: true, ground: 0, fadeIn: 0.2 });
  C.execDie = K('execDie', [
    { t: 0, p: KNEEL },
    { t: 0.12, p: { chest: [-0.35, 0, 0], head: [-0.75, 0, 0], neck: [-0.2, 0, 0], shoulderL: [0.1, 0, 0.9], shoulderR: [0.1, 0, -0.9], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] }, e: 'outCubic' },
    { t: 0.48, p: { chest: [0.4, 0, 0], spine: [0.3, 0, 0], head: [0.4, 0, 0], hip: [0, -0.465, 0.12], body: [0, 0, 0.14], shoulderL: [-0.5, 0, 0.6], shoulderR: [-0.5, 0, -0.6] }, e: 'inQuad' },
    { t: 0.88, p: { brot: LIE_FRONT.brot, body: [0, 0.17, 0.52], chest: [0, 0, 0], spine: [0, 0, 0], hip: [0, 0, 0], head: [-0.2, 0.5, 0], hipL: [0.1, 0, 0.2], hipR: [0.2, 0, -0.2], kneeL: [0.2, 0, 0], kneeR: [0.3, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [-2.2, 0, 0.6], shoulderR: [-0.5, 0, -0.9] }, e: 'inQuad' },
    { t: 1.02, p: { brot: [1.42, 0, 0], body: [0, 0.28, 0.52] }, e: 'outQuad' },
    { t: 1.2, p: { brot: LIE_FRONT.brot, body: [0, 0.17, 0.52] }, e: 'inQuad' },
  ], { hold: true, ground: 0 });
  // finisher: the killing blow on a kneeling opponent about 0.9 m in front, per weapon family
  const adj = (p) => { if (adduct && p.shoulderR) p.shoulderR = [p.shoulderR[0], p.shoulderR[1], p.shoulderR[2] + adduct]; return p; };
  const evts = (hit, swing) => [{ t: swing, name: 'swing' }, { t: hit, name: 'hit' }];
  if (dual) {
    C.finisher = K('finisher', [
      { t: 0, p: 'guard' },
      { t: 0.32, p: { chest: [0.1, 0, 0], head: [0.1, 0.2, 0], shoulderR: [-1.5, 0, 0.9], elbowR: [-0.8, 0, 0], shoulderL: [-1.5, 0, -0.9], elbowL: [-0.8, 0, 0], hip: [0, -0.2, -0.05], body: [0, 0, -0.05], kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], hipL: [-0.5, 0, 0.1], hipR: [-0.3, 0, -0.1] }, e: 'outCubic' },
      { t: 0.5, p: { chest: [0.2, 0, 0], shoulderR: [-1.65, 0, 1.0], shoulderL: [-1.65, 0, -1.0], hip: [0, -0.22, -0.06] }, e: 'inOutSine' },
      { t: 0.62, p: { chest: [0.5, 0, 0], shoulderR: [-1.0, 0, -1.4], elbowR: [-0.15, 0, 0], shoulderL: [-1.0, 0, 1.4], elbowL: [-0.15, 0, 0], hip: [0, -0.3, 0.05], body: [0, 0, 0.3], kneeL: [1.2, 0, 0], hipL: [-0.95, 0, 0.1], kneeR: [0.25, 0, 0], hipR: [0.6, 0, -0.1] }, e: 'inCubic' },
      { t: 1.0, p: { chest: [0.55, 0, 0], shoulderR: [-0.9, 0, -1.5], shoulderL: [-0.9, 0, 1.5], body: [0, 0, 0.34] }, e: 'outQuad' },
      { t: 1.5, p: { chest: [0.15, 0, 0], shoulderR: [-1.2, 0, -0.6], shoulderL: [-1.2, 0, 0.6], body: [0, 0, 0.1], hip: [0, -0.1, 0], kneeL: [0.6, 0, 0] }, e: 'inOutCubic' },
      { t: 1.9, p: 'guard', e: 'inOutCubic' },
    ], { mask: 'full', events: evts(0.6, 0.45) });
  } else {
    const hand = spear ? { elbowL: [-0.9, 0, 0] } : {};
    C.finisher = K('finisher', [
      { t: 0, p: 'guard' },
      { t: 0.3, p: adj(Object.assign({ chest: [-0.35, -0.15, 0], spine: [-0.1, 0, 0], hips: [0, -0.2, 0], shoulderR: [-2.95, 0, -0.3], elbowR: [-1.3, 0, 0], wristR: [-0.5, 0, 0], shoulderL: [-0.5, 0, 0.7], hip: [0, -0.06, -0.08], body: [0, 0, -0.08], kneeL: [0.5, 0, 0], kneeR: [0.6, 0, 0] }, hand)), e: 'outCubic' },
      { t: 0.52, p: adj({ shoulderR: [-3.1, 0, -0.3], chest: [-0.5, -0.1, 0], hip: [0, -0.04, -0.1] }), e: 'inOutSine' },
      { t: 0.64, p: adj({ chest: [0.95, 0.1, 0], spine: [0.2, 0, 0], hips: [0.15, 0.1, 0], head: [-0.15, 0, 0], shoulderR: [-1.0, 0, -0.1], elbowR: [-0.2, 0, 0], wristR: [0.55, 0, 0], shoulderL: [-0.9, 0, 0.4], hip: [0, -0.3, 0.05], body: [0, 0, 0.28], kneeL: [1.3, 0, 0], hipL: [-1.0, 0, 0.1], kneeR: [0.3, 0, 0], hipR: [0.6, 0, -0.1] }), e: 'inCubic' },
      { t: 0.98, p: adj({ chest: [1.0, 0.1, 0], shoulderR: [-0.9, 0, -0.1], body: [0, 0, 0.3] }), e: 'outQuad' },
      { t: 1.5, p: adj({ chest: [0.3, 0, 0], shoulderR: [-1.6, 0, -0.3], elbowR: [-0.9, 0, 0], body: [0, 0, 0.1], hip: [0, -0.1, 0.02], kneeL: [0.6, 0, 0], hipL: [-0.4, 0, 0.1] }), e: 'inOutCubic' },
      { t: 1.9, p: 'guard', e: 'inOutCubic' },
    ], { mask: 'full', events: evts(0.62, 0.5) });
  }
  C.finisher.info = { dur: 1.9, swingAt: dual ? 0.45 : 0.5, hitAt: dual ? 0.6 : 0.62, recoverAt: 1.0 };
  // ---- victory poses per style (held; the generic 'victory' stays as the fallback)
  const V = {
    murmillo: [ // sword overhead, shield punched forward, chest out, wide stance
      { chest: [-0.28, 0.12, 0.04], spine: [-0.1, 0, 0], neck: [-0.15, 0, 0], head: [-0.35, 0.1, 0], shoulderR: [-2.95, 0.2, -0.5], elbowR: [-0.35, 0, 0], shoulderL: [-1.3, 0, 0.5], elbowL: [-1.1, 0, 0], hip: [0, -0.06, 0], hipL: [-0.15, 0.1, 0.22], hipR: [0.1, -0.1, -0.24], kneeL: [0.2, 0, 0], kneeR: [0.2, 0, 0] },
      { chest: [-0.34, 0.12, 0.04], shoulderR: [-3.05, 0.2, -0.6], head: [-0.4, 0.12, 0], shoulderL: [-1.4, 0, 0.55] }],
    thraex: [ // sica thrust to the sky, parmula raised and shown, hip cocked
      { chest: [-0.15, -0.2, -0.1], spine: [-0.05, 0, 0], head: [-0.3, 0.3, 0.05], shoulderR: [-2.4, 0.2, -0.9], elbowR: [-0.2, 0, 0], wristR: [-0.2, 0, 0], shoulderL: [-2.6, 0, 0.4], elbowL: [-1.5, 0, 0], hip: [0.04, -0.12, 0], hipL: [-0.3, 0, 0.2], hipR: [0.2, 0, -0.18], kneeL: [0.5, 0, 0], kneeR: [0.2, 0, 0] },
      { chest: [-0.2, -0.25, -0.12], shoulderR: [-2.55, 0.2, -1.0], head: [-0.36, 0.34, 0.05], shoulderL: [-2.7, 0, 0.45] }],
    dimachaerus: [ // both blades up in a V, back arched, roar
      { chest: [-0.35, 0, 0], spine: [-0.1, 0, 0], neck: [-0.2, 0, 0], head: [-0.5, 0, 0], shoulderR: [-3.0, 0, -0.65], elbowR: [-0.3, 0, 0], wristR: [-0.2, 0, 0], shoulderL: [-3.0, 0, 0.65], elbowL: [-0.3, 0, 0], wristL: [-0.2, 0, 0], hip: [0, -0.1, 0], hipL: [-0.1, 0, 0.3], hipR: [-0.1, 0, -0.3], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0] },
      { chest: [-0.42, 0, 0], head: [-0.58, 0, 0], shoulderR: [-3.05, 0, -0.78], shoulderL: [-3.05, 0, 0.78] }],
    retiarius: [ // trident raised level overhead with both hands (left follows through IK), leaning back
      { chest: [-0.3, 0.15, 0], spine: [-0.08, 0, 0], head: [-0.4, 0.1, 0], shoulderR: [-2.7, 0.1, -0.15 + 0.42], elbowR: [-0.6, 0, 0], wristR: [-0.2, 0, 0], shoulderL: [-2.2, 0, 0.4], elbowL: [-0.8, 0, 0], hip: [0, -0.05, 0], hipL: [-0.1, 0.1, 0.2], hipR: [0.1, -0.1, -0.2], kneeL: [0.15, 0, 0], kneeR: [0.2, 0, 0] },
      { chest: [-0.36, 0.15, 0], shoulderR: [-2.8, 0.1, -0.1 + 0.42], head: [-0.46, 0.12, 0] }],
    hoplomachus: [ // spear planted high, arm straight up, other fist clenched at the chest
      { chest: [-0.2, 0.2, 0.05], spine: [-0.06, 0, 0], head: [-0.35, 0.2, 0], shoulderR: [-3.05, 0.1, -0.2 + 0.42], elbowR: [-0.15, 0, 0], wristR: [0.1, 0, 0], shoulderL: [-1.6, 0, 0.5], elbowL: [-1.6, 0, 0], hip: [0, -0.04, 0], hipL: [-0.2, 0, 0.2], hipR: [0.15, 0, -0.2], kneeL: [0.3, 0, 0], kneeR: [0.15, 0, 0] },
      { chest: [-0.25, 0.2, 0.05], shoulderR: [-3.1, 0.1, -0.15 + 0.42], head: [-0.4, 0.22, 0] }],
  };
  const v = V[style]; if (v) C.victory = K('victory', [{ t: 0, p: 'guard' }, { t: 0.55, p: v[0], e: 'outBack' }, { t: 1.6, p: v[1], e: 'inOutSine' }], { hold: true });
  return C;
}


// ---------------------------------------------------------------- two-bone IK
const _t = new V3(), _p = new V3(), _u = new V3(), _pp = new V3(), _du = new V3(), _dl = new V3(), _hx = new V3(), _y = new V3(), _x = new V3(), _z = new V3();
const _m = new THREE.Matrix4(), _q = new Q(), _q2 = new Q();
// Solve upper->mid->end so end reaches targetWorld. bendSign: +1 knee (flexes with +x), -1 elbow. poleWorld picks the bend side.
// w blends from the current (FK) rotation to the IK solution. Pivots must have no rest rotation. Returns reach distance error.
export function solveTwoBone(upper, mid, end, targetWorld, poleWorld, bendSign = 1, w = 1, endOffset = 0) {
  const parent = upper.parent; _m.copy(parent.matrixWorld).invert();
  _t.copy(targetWorld).applyMatrix4(_m).sub(upper.position); _p.copy(poleWorld).applyMatrix4(_m).sub(upper.position);
  const L1 = mid.position.length(), L2 = end.position.length() + endOffset;
  let d = _t.length(); const dd = clamp(d, Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
  _u.copy(_t).divideScalar(Math.max(d, 1e-6));
  _pp.copy(_p).addScaledVector(_u, -_p.dot(_u)); if (_pp.lengthSq() < 1e-8) _pp.set(0, 0, 1).addScaledVector(_u, -_u.z); _pp.normalize();
  const cosB = clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1), sinB = Math.sqrt(1 - cosB * cosB);
  _du.copy(_u).multiplyScalar(cosB).addScaledVector(_pp, sinB);
  _dl.copy(_u).multiplyScalar(dd).addScaledVector(_du, -L1).normalize();
  const cosA = clamp(_du.dot(_dl), -1, 1), ang = Math.acos(cosA);
  _hx.copy(_pp).cross(_u).normalize().multiplyScalar(bendSign); // local X of the upper bone
  _y.copy(_du).multiplyScalar(-1); _x.copy(_hx).addScaledVector(_y, -_hx.dot(_y)).normalize(); _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z); _q.setFromRotationMatrix(_m);
  _q2.setFromAxisAngle(_hx.set(1, 0, 0), bendSign * ang);
  if (w >= 1) { upper.quaternion.copy(_q); mid.quaternion.copy(_q2); } else { upper.quaternion.slerp(_q, w); mid.quaternion.slerp(_q2, w); }
  return Math.max(0, d - (L1 + L2));
}

// ---------------------------------------------------------------- scalar spring (squash/stretch, kicks)
export class Spring1 {
  constructor(k = 260, c = 15) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  kick(a) { this.x += a; }
  push(v) { this.v += v; }
  update(dt) { const n = Math.ceil(dt / 0.008) || 1, h = dt / n; for (let i = 0; i < n; i++) { this.v += (-this.k * this.x - this.c * this.v) * h; this.x += this.v * h; } return this.x; }
}

// ---------------------------------------------------------------- verlet secondary motion
const _w = new V3(), _w2 = new V3(), _inv = new THREE.Matrix4(), _mm = new THREE.Matrix4();
// Generic world-space verlet grid. rows x cols points; row 0 is pinned to `anchor` (Object3D); other rows are pulled toward
// their anchor-relative rest shape (stiffness falls off down the chain), keep fixed row length, and obey gravity/drag/wind.
class VerletGrid {
  constructor(o) {
    this.anchor = o.anchor; this.rows = o.rows; this.cols = o.cols || 1; this.rowLen = o.rowLen; this.stiff = o.stiff ?? 0.2; this.stiffFall = o.stiffFall ?? 0.7;
    this.damping = o.damping ?? 0.94; this.gravity = o.gravity ?? -7; this.collide = o.collide || null; this.wind = o.wind || new V3();
    this.shape = o.shape; this.widthFn = o.widthFn || (() => 0); this.side = o.side || new V3(1, 0, 0); this.acc = 0; this.parent = o.parent;
    this.p = []; this.pp = []; this.rest = []; this.inited = false;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const ctr = this.shape(r), off = this.cols > 1 ? (c / (this.cols - 1) - 0.5) * this.widthFn(r) : 0;
      this.rest.push(ctr.clone().addScaledVector(this.side, off)); this.p.push(new V3()); this.pp.push(new V3());
    }
  }
  idx(r, c) { return r * this.cols + c; }
  reset() { for (let i = 0; i < this.p.length; i++) { this.p[i].copy(this.rest[i]).applyMatrix4(this.anchor.matrixWorld); this.pp[i].copy(this.p[i]); } this.inited = true; }
  update(dt) {
    if (!this.inited) this.reset(); this.acc += Math.min(dt, 0.05); const h = 1 / 60;
    while (this.acc >= h) { this.step(h); this.acc -= h; }
    this.write();
  }
  step(h) {
    const R = this.rows, C = this.cols;
    for (let c = 0; c < C; c++) { const i = this.idx(0, c); this.pp[i].copy(this.p[i]); this.p[i].copy(this.rest[i]).applyMatrix4(this.anchor.matrixWorld); }
    for (let r = 1; r < R; r++) {
      const ks = this.stiff * (1 - this.stiffFall * (r / (R - 1))) + 0.0;
      for (let c = 0; c < C; c++) {
        const i = this.idx(r, c), p = this.p[i], pp = this.pp[i];
        _w.copy(p).sub(pp).multiplyScalar(this.damping); pp.copy(p); p.add(_w); p.y += this.gravity * h * h; p.addScaledVector(this.wind, h * h);
        _w2.copy(this.rest[i]).applyMatrix4(this.anchor.matrixWorld); p.lerp(_w2, ks);
      }
    }
    for (let it = 0; it < 3; it++) {
      for (let r = 1; r < R; r++) for (let c = 0; c < C; c++) {
        const A = this.p[this.idx(r - 1, c)], B = this.p[this.idx(r, c)]; _w.copy(B).sub(A); const l = _w.length() || 1e-6, k = (l - this.rowLen) / l;
        if (r === 1) B.addScaledVector(_w, -k); else { A.addScaledVector(_w, k * 0.5); B.addScaledVector(_w, -k * 0.5); }
      }
      if (C > 1) for (let r = 1; r < R; r++) for (let c = 0; c < C - 1; c++) {
        const A = this.p[this.idx(r, c)], B = this.p[this.idx(r, c + 1)], want = this.widthFn(r) / (C - 1); _w.copy(B).sub(A); const l = _w.length() || 1e-6, k = (l - want) / l * 0.25;
        A.addScaledVector(_w, k); B.addScaledVector(_w, -k);
      }
      if (this.collide) for (let i = this.cols; i < this.p.length; i++) this.collide(this.p[i]);
    }
  }
}

// Cloak / banner / pteruges: ribbon mesh deformed by a verlet grid. Parent mesh to rig.root.
export class ClothGrid extends VerletGrid {
  constructor(o) {
    super(o); const R = this.rows, C = this.cols;
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(R * C * 3), 3));
    const col = new Float32Array(R * C * 3); for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const k = lerp(1, o.tipShade ?? 0.7, r / (R - 1)) * (o.fold ? (0.88 + 0.12 * Math.cos(c * 2.2)) : 1); col.set([k, k, k], (r * C + c) * 3); }
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = new Float32Array(R * C * 2); for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { uv[(r * C + c) * 2] = C > 1 ? c / (C - 1) : 0.5; uv[(r * C + c) * 2 + 1] = 1 - r / (R - 1); } this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = []; for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) { const a = r * C + c, b = a + 1, d = a + C, e = d + 1; idx.push(a, d, b, b, d, e); }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, o.material); this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.name = o.name || 'cloth';
  }
  write() {
    const par = this.mesh.parent; if (!par) return; _inv.copy(par.matrixWorld).invert(); const a = this.geo.attributes.position;
    for (let i = 0; i < this.p.length; i++) { _w.copy(this.p[i]).applyMatrix4(_inv); a.setXYZ(i, _w.x, _w.y, _w.z); }
    a.needsUpdate = true; this.geo.computeVertexNormals();
  }
}
// Plume / tail / tassel: chain of tapered flattened capsule segments following the verlet points.
export class ChainMesh extends VerletGrid {
  constructor(o) {
    super(Object.assign({}, o, { cols: 1 })); this.segs = []; this.group = new THREE.Group(); this.group.name = o.name || 'chain';
    const n = this.rows - 1; this.radius = o.radius || [0.03, 0.012]; this.flat = o.flat || [0.5, 1.5];
    const base = o.box ? (() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, -0.5, 0); const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; })() : capsule(1, 1, 1, 5, 0.0); // unit shape hanging down y 0..-1
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(base, o.material); m.castShadow = true; m.matrixAutoUpdate = false; m.frustumCulled = false; this.group.add(m); this.segs.push(m); }
    this._up = new V3(0, -1, 0);
  }
  write() {
    const par = this.group.parent; if (!par) return; _inv.copy(par.matrixWorld).invert(); const n = this.rows - 1;
    for (let i = 0; i < n; i++) {
      const A = this.p[i], B = this.p[i + 1]; _w.copy(B).sub(A); const len = _w.length() || 1e-6; _w.divideScalar(len);
      const r0 = lerp(this.radius[0], this.radius[1], i / n), r1 = lerp(this.radius[0], this.radius[1], (i + 1) / n), r = (r0 + r1) / 2;
      _q.setFromUnitVectors(this._up, _w);
      _w2.set(r * this.flat[0], len * 1.0, r * this.flat[1]);
      _mm.compose(A, _q, _w2); this.segs[i].matrix.copy(_inv).multiply(_mm); this.segs[i].matrixWorldNeedsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------- body: head, face, hair
export const HEAD_SX = 0.93, HEAD_SZ = 1.06;
const SKULL = (j) => [[0, -0.022], [0.040 * j, -0.014], [0.068 * j, 0.012], [0.086 * j, 0.048], [0.097, 0.088], [0.105, 0.13], [0.104, 0.17], [0.092, 0.215], [0.058, 0.248], [0, 0.262]];
export function skullR(prof, y) { for (let i = 0; i < prof.length - 1; i++) if (y <= prof[i + 1][1]) { const t = clamp((y - prof[i][1]) / (prof[i + 1][1] - prof[i][1]), 0, 1); return lerp(prof[i][0], prof[i + 1][0], t); } return 0; }
// face variants: 0 heroic square jaw, 1 lean high cheekbones, 2 rugged broken nose + scar
export const FACES = [
  { j: 1.0, brow: 0.016, cheek: 0.006, chin: 0.013, nose: [1.0, 1.0], eye: '#4a2c14', lid: 0.55, tilt: 0.10, mouth: 0.10, nx: 0.0 },
  { j: 0.86, brow: 0.010, cheek: 0.012, chin: 0.008, nose: [0.82, 1.18], eye: '#5a7a9a', lid: 0.35, tilt: -0.18, mouth: -0.02, nx: 0.0 },
  { j: 1.10, brow: 0.021, cheek: 0.008, chin: 0.017, nose: [1.25, 0.95], eye: '#4a5a2a', lid: 0.65, tilt: 0.22, mouth: -0.16, nx: 0.012, scar: true },
];
// Face decal: eyes, brows, mouth, nose shading, expression lines painted into a small canvas (cached per variant / eye / hair colour) and
// mapped on a curved patch that follows the sculpted skull (about 70 triangles, one transparent draw). Alpha only, so it works on any skin tone.
const faceCache = new Map();
const FACE_W = 128, FACE_H = 160, FACE_PHI = 0.78, FACE_Y1 = 0.19;
export function faceTexture(fi, eyeHex, hairHex) {
  const key = fi + eyeHex + hairHex; if (faceCache.has(key)) return faceCache.get(key);
  if (typeof document === 'undefined') return null;
  const F = FACES[fi % 3], c = document.createElement('canvas'); c.width = FACE_W; c.height = FACE_H; const x = c.getContext('2d');
  const hc = new THREE.Color(hairHex), browCol = `rgb(${Math.round(hc.r * 190 + 14)},${Math.round(hc.g * 190 + 10)},${Math.round(hc.b * 190 + 8)})`;
  const px = (xm) => FACE_W / 2 + (Math.asin(clamp(xm / 0.09, -1, 1)) / FACE_PHI) * (FACE_W / 2), py = (ym) => FACE_H * (1 - ym / FACE_Y1);
  const soft = (cx, cy, r, rgba, sx = 1) => { x.save(); x.translate(cx, cy); x.scale(sx, 1); const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, rgba); g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(-r, -r, r * 2, r * 2); x.restore(); };
  for (const sg of [-1, 1]) {
    const cx = px(sg * 0.037), cy = py(0.121), w = 12.5, tl = F.tilt * sg;
    soft(cx, cy + 1, 17, 'rgba(70,25,15,0.30)', 1.1); soft(cx, cy + 9, 11, 'rgba(70,25,15,0.14)', 1.2); soft(px(sg * 0.068), py(0.083), 15, 'rgba(210,80,70,0.20)', 1.0);
    // eye: almond sclera, iris, pupil, highlight, heavy upper lid
    x.save(); x.beginPath(); x.moveTo(cx - w, cy + 1.5 + sg * -1 * 0); x.quadraticCurveTo(cx, cy - 9 + F.lid * 2, cx + w, cy + 1.5); x.quadraticCurveTo(cx, cy + 6.5, cx - w, cy + 1.5); x.closePath(); x.fillStyle = '#f1ebdd'; x.fill(); x.clip();
    x.fillStyle = F.eye; x.beginPath(); x.arc(cx + sg * -0.6, cy, 5.6, 0, Math.PI * 2); x.fill(); x.fillStyle = '#0a0605'; x.beginPath(); x.arc(cx + sg * -0.6, cy, 2.7, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(cx + 2, cy - 2.4, 1.3, 0, Math.PI * 2); x.fill(); const lg = x.createLinearGradient(0, cy - 8, 0, cy - 1); lg.addColorStop(0, 'rgba(40,15,8,0.65)'); lg.addColorStop(1, 'rgba(40,15,8,0)'); x.fillStyle = lg; x.fillRect(cx - w, cy - 9, w * 2, 8); x.restore();
    x.strokeStyle = '#25120b'; x.lineWidth = 2.4; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx - w - 0.5, cy + 1.5); x.quadraticCurveTo(cx, cy - 9.5 + F.lid * 2, cx + w + 0.5, cy + 1.5); x.stroke();
    x.strokeStyle = 'rgba(70,30,20,0.5)'; x.lineWidth = 1.1; x.beginPath(); x.moveTo(cx - w + 2, cy + 2.5); x.quadraticCurveTo(cx, cy + 7.5, cx + w - 2, cy + 2.5); x.stroke();
    // brow (expression comes from the tilt: inner end low = angry / grim, inner end high = raised / calm)
    const bx = px(sg * 0.042), by = py(0.148), inner = sg * -1; x.save(); x.translate(bx, by); x.rotate(-tl * 1.2 * 1); x.fillStyle = browCol;
    x.beginPath(); x.moveTo(-17, 2.5); x.quadraticCurveTo(-4, -5.5 - F.brow * 90, 17, -1.5); x.lineTo(17, 3.5); x.quadraticCurveTo(0, -0.5, -17, 5.5); x.closePath(); x.fill(); x.restore();
    // nostril / nasolabial / laugh lines
    soft(px(sg * 0.013 * F.nose[0]), py(0.079), 6, 'rgba(40,12,8,0.60)', 1.3);
    x.strokeStyle = 'rgba(80,35,25,0.28)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(px(sg * 0.026), py(0.082)); x.quadraticCurveTo(px(sg * 0.036), py(0.062), px(sg * 0.036), py(0.044)); x.stroke();
    if (fi === 2) { x.strokeStyle = 'rgba(70,30,20,0.35)'; x.lineWidth = 1.2; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(px(sg * 0.064), py(0.121 + (k - 1) * 0.008)); x.lineTo(px(sg * 0.074), py(0.121 + (k - 1) * 0.016)); x.stroke(); } }
  }
  // mouth: shadow, lips, parting line with corners following the variant's expression
  const mx = FACE_W / 2, my = py(0.052), mw = 19;
  soft(mx, my - 8, 12, 'rgba(70,25,15,0.2)', 1.6); soft(mx, my + 12, 12, 'rgba(70,25,15,0.22)', 1.6);
  const cr = -F.mouth * 38; x.fillStyle = 'rgba(150,55,50,0.72)'; x.beginPath(); x.moveTo(mx - mw, my + cr * 0.3); x.quadraticCurveTo(mx - 6, my - 7, mx, my - 3.5); x.quadraticCurveTo(mx + 6, my - 7, mx + mw, my + cr * 0.3); x.quadraticCurveTo(mx, my + 1, mx - mw, my + cr * 0.3); x.fill();
  x.fillStyle = 'rgba(190,95,88,0.7)'; x.beginPath(); x.moveTo(mx - mw + 1, my + cr * 0.3 + 0.5); x.quadraticCurveTo(mx, my + 1.5, mx + mw - 1, my + cr * 0.3 + 0.5); x.quadraticCurveTo(mx, my + 10, mx - mw + 1, my + cr * 0.3 + 0.5); x.fill();
  x.strokeStyle = '#2a0e0a'; x.lineWidth = 1.9; x.lineCap = 'round'; x.beginPath(); x.moveTo(mx - mw - 1, my + cr * 0.3 - 1); x.quadraticCurveTo(mx, my + 1.5, mx + mw + 1, my + cr * 0.3 - 1); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.ellipse(mx, my + 5, 5, 1.4, 0, 0, Math.PI * 2); x.fill();
  soft(mx, py(0.01), 9, 'rgba(70,25,15,0.18)', 1.3); // chin
  if (F.scar) { x.strokeStyle = 'rgba(235,190,170,0.75)'; x.lineWidth = 2.2; x.lineCap = 'round'; x.beginPath(); x.moveTo(px(0.078), py(0.134)); x.quadraticCurveTo(px(0.068), py(0.1), px(0.05), py(0.07)); x.stroke(); x.strokeStyle = 'rgba(90,30,25,0.6)'; x.lineWidth = 1; for (let k = 0; k < 4; k++) { const t = 0.15 + k * 0.22, X = px(0.078 - 0.028 * t), Y = py(0.134 - 0.064 * t); x.beginPath(); x.moveTo(X - 3, Y - 2); x.lineTo(X + 3, Y + 2); x.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; faceCache.set(key, t); return t;
}
// flat plate (2 triangles) in head space facing +Z (eyes, brows, lips: painted-on features cost almost nothing)
function plate(w, h, p, rz = 0, rx = 0, ry = 0) { return xf(col1(new THREE.PlaneGeometry(w, h)), p, [rx, ry, rz]); }
function disc(r, seg, p, sx = 1, sy = 1, rz = 0) { return xf(col1(new THREE.CircleGeometry(r, seg)), p, [0, 0, rz], [sx, sy, 1]); }
function buildHead(rig, look, bd) {
  const A = (m, g, o) => rig.add(m, g, o || rig.joints.head);
  const F = FACES[(look.face | 0) % 3], prof = SKULL(F.j);
  const surf = (x, y, off = 0) => { const R = skullR(prof, y), u = clamp(x / (R * HEAD_SX + 1e-5), -0.98, 0.98); return new V3(x, y, HEAD_SZ * R * Math.sqrt(1 - u * u) + off); };
  const skull = lathe([prof[0], prof[2], prof[3], prof[4], prof[5], prof[6], prof[7], prof[8], prof[9]], 12, HEAD_SX, HEAD_SZ, 0.1, 0.86);
  const bl = [];
  for (const sg of [-1, 1]) {
    bl.push({ p: [sg * 0.04, 0.142, surf(sg * 0.04, 0.142).z], r: 0.034, a: F.brow }, { p: [sg * 0.037, 0.122, surf(sg * 0.037, 0.122).z], r: 0.021, a: -0.006 },
      { p: [sg * 0.068, 0.088, surf(sg * 0.068, 0.088).z], r: 0.034, a: F.cheek });
  }
  bl.push({ p: [0, 0.002, surf(0, 0.002).z], r: 0.028, a: F.chin }, { p: [0, 0.19, surf(0, 0.19).z], r: 0.05, a: 0.004 });
  sculpt(skull, bl);
  paint(skull, (x, y, z) => {
    const front = sm01(0.0, 0.07, z); let r = 1, g = 1, b = 1;
    const ch = Math.exp(-((Math.abs(x) - 0.068) ** 2 + (y - 0.083) ** 2) / 0.0012) * front; r *= 1 + 0.05 * ch; g *= 1 - 0.15 * ch; b *= 1 - 0.14 * ch;
    const es = Math.exp(-((Math.abs(x) - 0.037) ** 2 + (y - 0.124) ** 2) / 0.0007) * front; const e = 1 - 0.2 * es; r *= e; g *= e * 0.97; b *= e * 0.99;
    const uj = 1 - 0.22 * sm01(0.02, -0.02, y); const fh = 1 + 0.06 * sm01(0.16, 0.225, y) * front; const k = uj * fh;
    const nose = Math.exp(-(x * x + (y - 0.075) ** 2) / 0.0006) * front * 0.1;
    return [r * k * (1 + nose), g * k * (1 - nose), b * k * (1 - nose)];
  });
  A('skin', skull);
  // nose: 4-triangle pyramid (bridge, tip, alae), wider / longer by variant
  { const nz = surf(0, 0.12).z, n0 = F.nose[0], n1 = F.nose[1], tipZ = surf(0, 0.084).z + 0.021 * n1;
    const v = [[0, 0.128, nz + 0.003], [-0.015 * n0, 0.082, surf(0, 0.082).z + 0.004], [0.015 * n0, 0.082, surf(0, 0.082).z + 0.004], [0, 0.079, tipZ]];
    const pos = [v[0], v[1], v[3], v[0], v[3], v[2], v[3], v[1], v[2], v[0], v[2], v[1]].flat(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); A('skin', col1(g));
    if (F.nx) A('skin', xf(boxG(0.01, 0.024, 0.01), [F.nx, 0.112, nz + 0.004], [0.1, 0, 0.35])); }
  for (const sg of [-1, 1]) A('skin', xf(sphereG(0.024, 4, 2), [sg * 0.099, 0.099, -0.004], [0, 0, sg * -0.08], [0.32, 1.0, 0.72])); // ears
  const tex = faceTexture(((look.face | 0) % 3 + 3) % 3, F.eye, '#' + new THREE.Color(rig.palette.hair).getHexString());
  if (tex) { // decal patch
    const ys = [0, 0.0475, 0.095, 0.1425, FACE_Y1], dp = lathe(ys.map((y) => [skullR(prof, y) + 0.0025, y]), 6, HEAD_SX, HEAD_SZ, 0, 1, -FACE_PHI, FACE_PHI * 2);
    sculpt(dp, bl); const P = dp.attributes.position, N = dp.attributes.normal; for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + N.getX(i) * 0.0025, P.getY(i) + N.getY(i) * 0.0025, P.getZ(i) + N.getZ(i) * 0.0025);
    rig.mats.eye.map = tex; rig.mats.eye.needsUpdate = true; A('eye', dp);
  } else for (const sg of [-1, 1]) { const ex = sg * 0.037, ey = 0.121, ez = surf(ex, ey).z + 0.003; A('eye', paint(disc(0.014, 6, [ex, ey, ez], 1.2, 0.8), [0.2, 0.15, 0.1])); }
  if (false) for (const sg of [-1, 1]) A('hair', plate(0.05, 0.0105, [sg * 0.04, 0.147, surf(sg * 0.04, 0.147).z + 0.004], sg * F.tilt, 0.1));
  // hair
  const hairy = look.hair || 'short', off = hairy === 'crop' ? 0.005 : 0.012, yb = hairy === 'tied' ? 0.175 : hairy === 'crop' ? 0.185 : 0.165;
  if (hairy !== 'bald' && hairy !== 'none') {
    const ys = [yb, 0.205, 0.238, 0.262];
    const pts = ys.map((y) => [skullR(prof, y) + off + (y < 0.2 ? 0.004 : 0), y]); pts.push([0, 0.272]);
    const cap = lathe(pts, 10, HEAD_SX, HEAD_SZ, 0, 1);
    const P = cap.attributes.position;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (Math.abs(y - yb) < 1e-5) { const z = P.getZ(i), x = P.getX(i), back = Math.max(0, -z / 0.1), side = Math.abs(x) / 0.1; P.setY(i, y - 0.075 * back - 0.03 * side * (1 - back) + 0.015 * Math.max(0, z / 0.1) * (1 - side)); } }
    paint(cap, (x, y, z) => 1 - 0.18 * sm01(0.2, 0.165, y) + 0.1 * sm01(0.22, 0.26, y)); A('hair', cap);
    if (hairy === 'short') for (const i of [-1, 0, 1]) A('hair', xf(coneG(0.022, 0.05, 3), [i * 0.05, yb + 0.012, surf(i * 0.05, yb).z + 0.004], [Math.PI * 0.75, 0, i * 0.2], [1.3, 1, 0.6]));
    if (hairy === 'long') {
      A('hair', paint(lathe([[0.07, -0.31], [0.1, -0.15], [0.116, 0.04], [0.11, 0.15]], 7, 0.96, 0.9, 0, 1, Math.PI * 0.52, Math.PI * 0.96), (x, y) => 1 - 0.15 * sm01(-0.05, -0.31, y)));
      for (const sg of [-1, 1]) A('hair', xf(boxG(0.022, 0.18, 0.05), [sg * 0.103, 0.06, 0.012], [0, 0, sg * 0.05]));
    }
    if (hairy === 'tied') {
      A('hair', xf(capsule(0.2, 0.03, 0.014, 5, 0.1), [0, 0.19, -0.104], [0.55, 0, 0]));
      A('cloth', xf(lathe([[0.034, -0.012], [0.036, 0.012]], 6, 1, 1, 0, 1), [0, 0.19, -0.108], [0.55, 0, 0]));
    }
  }
  const my = 0.052, mz = surf(0, my).z, bd2 = look.beard | 0; // 0 none, 1 short, 2 full
  if (bd2) {
    const lo = bd2 === 2 ? -0.07 : -0.045, o = bd2 === 2 ? 0.011 : 0.006, L = Math.PI * 1.2;
    const bp = [[0.02, lo], [skullR(prof, -0.01) + o, -0.02], [skullR(prof, 0.03) + o, 0.025], [skullR(prof, 0.044) + o * 0.8, 0.044]];
    const beard = lathe(bp, 9, HEAD_SX, HEAD_SZ, 0, 1, -L / 2, L);
    const BP = beard.attributes.position; if (bd2 === 2) for (let i = 0; i < BP.count; i++) if (BP.getY(i) <= lo + 1e-4) BP.setZ(i, BP.getZ(i) + 0.03 * Math.max(0, Math.cos(Math.atan2(BP.getX(i), BP.getZ(i)))));
    paint(beard, (x, y) => 0.8 + 0.2 * sm01(lo, 0.04, y)); A('hair', beard);
    for (const sg of [-1, 1]) A('hair', xf(boxG(0.014, 0.075, 0.034), [sg * 0.096, 0.088, -0.002], [0, 0, sg * 0.04]));
    A('hair', plate(0.056, 0.016, [0, my + 0.0145, mz + 0.004], 0, -0.1));
  }
}

// ---------------------------------------------------------------- body shading map (torso muscle definition), painted once and shared
// Cylindrical map: u = angle around the torso (phi = -PI at the back seam, 0 at the front centre), v = body height (hips frame, -0.12 .. 0.64 m).
// Mid grey = no change, darker / lighter multiplies the skin colour (the shader doubles it). Pecs, sternum, clavicles, serratus, six-pack, obliques,
// spine and shoulder blades are painted as soft strokes, so a 12-sided torso still shows a sculpted chest and abs from every side.
export const BODY_Y0 = -0.12, BODY_YH = 0.76;
let bodyCan = null;
export function bodyCanvas() {
  if (bodyCan || typeof document === 'undefined') return bodyCan;
  const BW = BODY_BW, BH = FT_H, c = document.createElement('canvas'); c.width = BW; c.height = BH; const x = c.getContext('2d');
  const X = (phi) => ((phi + Math.PI) / (Math.PI * 2)) * BW, Y = (yb) => BH * (1 - (yb - BODY_Y0) / BODY_YH);
  x.fillStyle = '#808080'; x.fillRect(0, 0, BW, BH);
  const dark = (a) => `rgba(20,8,6,${a})`, lite = (a) => `rgba(255,236,220,${a})`;
  const soft = (phi, yb, rp, ry, col) => { x.save(); x.translate(X(phi), Y(yb)); x.scale(Math.max(1, rp * BW / (Math.PI * 2)), Math.max(1, ry * BH / BODY_YH)); const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore(); };
  const stroke = (pts, w, col, blur = 0) => { x.save(); x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; if (blur) x.filter = `blur(${blur}px)`; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])))); x.stroke(); x.restore(); };
  const curve = (p0, p1, p2, w, col, blur = 0) => { x.save(); x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; if (blur) x.filter = `blur(${blur}px)`; x.beginPath(); x.moveTo(X(p0[0]), Y(p0[1])); x.quadraticCurveTo(X(p1[0]), Y(p1[1]), X(p2[0]), Y(p2[1])); x.stroke(); x.restore(); };
  for (const sg of [-1, 1]) {
    // pectoral: soft highlight over the mass, dark crescent under the lower edge, separation from the deltoid, sternal groove
    soft(sg * 0.5, 0.435, 0.5, 0.1, lite(0.22)); soft(sg * 0.45, 0.5, 0.45, 0.05, lite(0.14));
    curve([sg * 0.06, 0.352], [sg * 0.46, 0.318], [sg * 1.0, 0.43], 9, dark(0.62), 2.5); curve([sg * 0.06, 0.352], [sg * 0.46, 0.33], [sg * 1.0, 0.43], 5, lite(0.1), 1.5);
    curve([sg * 0.82, 0.57], [sg * 1.02, 0.5], [sg * 1.0, 0.43], 6, dark(0.38), 2);
    stroke([[sg * 0.05, 0.575], [sg * 0.4, 0.585], [sg * 0.8, 0.59]], 5, dark(0.3), 1.5); stroke([[sg * 0.05, 0.585], [sg * 0.4, 0.597], [sg * 0.8, 0.602]], 3, lite(0.16), 1.5); // clavicle
    for (let k = 0; k < 3; k++) stroke([[sg * (1.0 + k * 0.05), 0.31 - k * 0.04], [sg * (1.15 + k * 0.05), 0.28 - k * 0.04]], 4, dark(0.34), 1.2); // serratus
    soft(sg * 1.35, 0.44, 0.35, 0.08, dark(0.4)); soft(sg * 0.47, 0.395, 0.06, 0.012, dark(0.26)); // armpit, nipple
    // rectus abdominis blocks, transverse intersections, obliques
    for (let r = 0; r < 4; r++) { const yb = 0.045 + r * 0.068; curve([sg * 0.02, yb], [sg * 0.13, yb + 0.012], [sg * 0.27, yb - 0.004], 4.5, dark(0.5), 1.4); soft(sg * 0.13, yb + 0.034, 0.17, 0.034, lite(0.2)); }
    stroke([[sg * 0.29, 0.0], [sg * 0.3, 0.1], [sg * 0.33, 0.2], [sg * 0.4, 0.3]], 6, dark(0.36), 2);
    curve([sg * 0.34, -0.01], [sg * 0.62, 0.05], [sg * 0.85, 0.2], 7, dark(0.38), 2.4); soft(sg * 0.7, 0.16, 0.3, 0.07, lite(0.12)); // oblique / iliac furrow
    // back: scapula, trapezius, lats, erectors
    soft(sg * 2.55, 0.5, 0.45, 0.07, lite(0.2)); curve([sg * 2.2, 0.575], [sg * 2.6, 0.55], [sg * 2.85, 0.5], 5, dark(0.4), 1.5); curve([sg * 2.25, 0.46], [sg * 2.5, 0.4], [sg * 2.95, 0.42], 5, dark(0.28), 1.5);
    soft(sg * 2.9, 0.3, 0.5, 0.1, dark(0.26)); soft(sg * 3.0, 0.3, 0.22, 0.09, lite(0.12)); stroke([[sg * 2.95, 0.04], [sg * 3.0, 0.2], [sg * 3.05, 0.32]], 5, dark(0.25), 1.5);
  }
  stroke([[0, 0.02], [0, 0.35]], 5, dark(0.55), 1.4); soft(0, 0.06, 0.05, 0.01, dark(0.55)); // linea alba + navel
  stroke([[0, 0.375], [0, 0.53]], 6, dark(0.42), 1.8); soft(0, 0.56, 0.12, 0.014, dark(0.4)); // sternum groove, sternal notch
  // spine groove sits on the seam (phi = +-PI): paint both edges so it continues across the wrap
  for (const ex of [0, BW]) { x.save(); x.strokeStyle = dark(0.55); x.lineWidth = 9; x.filter = 'blur(2px)'; x.beginPath(); x.moveTo(ex, Y(0.0)); x.lineTo(ex, Y(0.62)); x.stroke(); x.restore(); }
  bodyCan = c; return c;
}

// ---------------------------------------------------------------- limb shading map: muscle definition for arms and legs
// Four tiles (upper arm, forearm, thigh, shin), each LIMB_TW px wide (usable 80 px + 8 px wrap margin per side) and the full atlas height.
// u = angle around the limb (-PI .. PI measured from the front, seam at the back, LATERAL side positive: right limbs mirror u), v = 1 - t along the limb.
// Same encoding as the body map: mid grey = unchanged, darker / lighter multiplies the skin.
const LIMB_TW = 96, LIMB_U = 80, LIMB_X0 = 640;
let limbCan = null;
export function limbCanvas() {
  if (limbCan || typeof document === 'undefined') return limbCan;
  const W = LIMB_TW * 4, H = FT_H, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
  const dark = (a) => `rgba(20,8,6,${a})`, lite = (a) => `rgba(255,236,220,${a})`, PI = Math.PI;
  // paint one tile: fn(draw) with helpers in (a, t) space; the tile content is drawn three times (wrap) and clipped to the tile
  const tile = (k, fn) => {
    for (const dx of [-LIMB_U, 0, LIMB_U]) {
      x.save(); x.beginPath(); x.rect(k * LIMB_TW, 0, LIMB_TW, H); x.clip(); x.translate(k * LIMB_TW + 8 + dx, 0);
      const X = (a) => ((a + PI) / (PI * 2)) * LIMB_U, Y = (t) => t * H;
      const soft = (a, t, ra, rt, col) => { x.save(); x.translate(X(a), Y(t)); x.scale(Math.max(1, ra * LIMB_U / (PI * 2)), Math.max(1, rt * H)); const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore(); };
      const line = (pts, w, col, blur = 1.2) => { x.save(); x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.filter = `blur(${blur}px)`; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])))); x.stroke(); x.restore(); };
      fn({ soft, line, dark, lite });
      x.restore();
    }
  };
  tile(0, ({ soft, line, dark, lite }) => { // upper arm: deltoid insertion, biceps, triceps horseshoe, side grooves, elbow
    soft(0, 0.36, 0.55, 0.2, lite(0.3)); soft(PI, 0.42, 0.5, 0.22, lite(0.22)); soft(0.9, 0.12, 0.5, 0.12, lite(0.18));
    line([[1.9, 0.24], [2.0, 0.55], [2.05, 0.9]], 5, dark(0.5)); line([[-1.9, 0.24], [-2.0, 0.55], [-2.05, 0.9]], 5, dark(0.5)); // biceps / triceps grooves
    line([[0.6, 0.1], [1.1, 0.2], [1.6, 0.26], [2.0, 0.22]], 4, dark(0.45)); line([[1.0, 0.04], [1.0, 0.2]], 3, dark(0.3)); line([[1.3, 0.04], [1.35, 0.22]], 3, dark(0.3)); // deltoid heads
    line([[PI - 0.55, 0.3], [PI - 0.7, 0.55], [PI - 0.3, 0.7], [PI, 0.72], [-PI + 0.3, 0.7], [-PI + 0.7, 0.55], [-PI + 0.55, 0.3]], 4, dark(0.42)); // triceps horseshoe
    line([[-0.5, 0.97], [0, 0.99], [0.5, 0.97]], 6, dark(0.5)); soft(PI, 1.0, 0.5, 0.05, dark(0.4)); soft(0, 0.62, 0.3, 0.1, dark(0.14));
  });
  tile(1, ({ soft, line, dark, lite }) => { // forearm: brachioradialis ridge, flexors, extensors, tendons
    soft(0.7, 0.18, 0.5, 0.18, lite(0.32)); soft(0, 0.22, 0.5, 0.2, lite(0.2)); soft(PI, 0.3, 0.7, 0.25, lite(0.18));
    line([[1.2, 0.0], [1.3, 0.25], [1.1, 0.55]], 4, dark(0.45)); line([[-1.4, 0.04], [-1.5, 0.3], [-1.3, 0.6]], 4, dark(0.4)); line([[-0.2, 0.2], [-0.15, 0.55], [-0.1, 0.95]], 3, dark(0.3));
    for (const a of [-0.3, 0, 0.3]) line([[a, 0.65], [a * 0.8, 0.98]], 2.5, lite(0.22)); soft(0, 0.02, 0.8, 0.04, dark(0.35)); soft(1.5, 0.99, 0.3, 0.03, dark(0.3)); soft(-1.5, 0.99, 0.3, 0.03, dark(0.3));
  });
  tile(2, ({ soft, line, dark, lite }) => { // thigh: rectus femoris, vastus lateralis / medialis, IT band, hamstrings, sartorius, knee
    soft(0, 0.38, 0.38, 0.28, lite(0.32)); soft(1.1, 0.34, 0.45, 0.24, lite(0.26)); soft(-0.9, 0.78, 0.35, 0.12, lite(0.3)); soft(PI, 0.4, 0.8, 0.28, lite(0.2));
    line([[0.5, 0.12], [0.6, 0.45], [0.55, 0.8]], 5, dark(0.46)); line([[-0.45, 0.2], [-0.5, 0.5], [-0.35, 0.82]], 4, dark(0.42)); line([[-1.0, 0.04], [-0.55, 0.4], [-0.3, 0.7]], 3.5, dark(0.34)); // quad separations, sartorius
    line([[1.7, 0.1], [1.75, 0.5], [1.6, 0.92]], 3, dark(0.3)); line([[PI - 0.1, 0.12], [PI - 0.05, 0.9]], 4, dark(0.4)); line([[-PI + 0.1, 0.12], [-PI + 0.05, 0.9]], 4, dark(0.4)); // IT band, hamstring split
    soft(0, 0.985, 0.55, 0.04, dark(0.5)); line([[-0.5, 0.94], [0, 0.9], [0.5, 0.94]], 3, lite(0.2)); soft(PI, 0.98, 0.7, 0.05, dark(0.45)); // knee cap, popliteal
  });
  tile(3, ({ soft, line, dark, lite }) => { // shin: tibial crest, calf heads, achilles, malleoli
    soft(0, 0.3, 0.14, 0.4, lite(0.32)); soft(PI - 0.45, 0.2, 0.4, 0.16, lite(0.3)); soft(-PI + 0.45, 0.2, 0.4, 0.16, lite(0.3)); soft(PI, 0.82, 0.12, 0.16, lite(0.22));
    line([[0.38, 0.06], [0.42, 0.5], [0.3, 0.96]], 4, dark(0.4)); line([[-0.38, 0.06], [-0.42, 0.5], [-0.3, 0.96]], 4, dark(0.4)); // either side of the crest
    line([[PI, 0.06], [PI, 0.4]], 4, dark(0.5)); line([[PI - 0.9, 0.3], [PI - 0.7, 0.55], [PI - 0.3, 0.62]], 3, dark(0.35)); line([[-PI + 0.9, 0.3], [-PI + 0.7, 0.55], [-PI + 0.3, 0.62]], 3, dark(0.35)); // calf median groove, soleus edge
    line([[1.5, 0.12], [1.55, 0.6]], 3, dark(0.3)); soft(1.55, 0.97, 0.22, 0.035, dark(0.45)); soft(-1.45, 0.97, 0.22, 0.035, dark(0.45)); soft(0, 0.02, 0.6, 0.03, dark(0.35));
  });
  limbCan = c; return c;
}
// uv for a limb grid built with the seam option: u runs around from the back (c = 0 .. S), v = 1 - t; sg < 0 mirrors u so every limb shares the lateral-positive tile
function limbUV(g, ts, S, tile, sg, tipTopT, tipBotT) {
  const R = ts.length, uv = new Float32Array(g.attributes.position.count * 2), U = (u) => (LIMB_X0 + tile * LIMB_TW + 8 + LIMB_U * (sg < 0 ? 1 - u : u)) / AT_W;
  for (let r = 0; r < R; r++) for (let c = 0; c <= S; c++) { const i = r * (S + 1) + c; uv[i * 2] = U(c / S); uv[i * 2 + 1] = 1 - clamp(ts[r], 0, 1); }
  let ti = R * (S + 1); if (tipTopT !== undefined) { uv[ti * 2] = U(0.5); uv[ti * 2 + 1] = 1; ti++; } if (tipBotT !== undefined) { uv[ti * 2] = U(0.5); uv[ti * 2 + 1] = 0; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.userData.faceUV = true; return g;
}

// ---------------------------------------------------------------- HD face: painted texture (eyes with sclera / iris / lids, brows as strands, nose, lips, wrinkles)
// The skin material samples it through the head uv (u = 0.5 + phi / (2 FT_PHI), v = y / FT_Y); the back of the head and every other skin part use uv (0,0), which stays
// transparent. Cached per face variant / eye colour / hair colour, shared by every rig that looks alike.
const FT_W = 256, FT_H = 320, FT_PHI = 1.0, FT_Y = 0.262, AT_W = 1024, BODY_BW = 384;
const faceCacheHD = new Map();
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function faceTextureHD(fi, eyeHex, hairHex) {
  const key = 'hd' + fi + eyeHex + hairHex; if (faceCacheHD.has(key)) return faceCacheHD.get(key);
  if (typeof document === 'undefined') return null;
  const F = FACES[fi % 3], prof = SKULL(F.j), c = document.createElement('canvas'); c.width = AT_W; c.height = FT_H; const x = c.getContext('2d'), R = rng32(fi * 977 + 13);
  const hc = new THREE.Color(hairHex), browCol = (a) => `rgba(${Math.round(hc.r * 200 + 12)},${Math.round(hc.g * 200 + 8)},${Math.round(hc.b * 200 + 6)},${a})`;
  const px = (xm, ym) => FT_W / 2 + (Math.asin(clamp(xm / (skullR(prof, ym) * HEAD_SX + 1e-5), -1, 1)) / FT_PHI) * (FT_W / 2), py = (ym) => FT_H * (1 - ym / FT_Y);
  const soft = (cx, cy, r, rgba, sx = 1, sy = 1) => { x.save(); x.translate(cx, cy); x.scale(sx, sy); const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, rgba); g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(-r, -r, r * 2, r * 2); x.restore(); };
  const line = (pts, w, rgba, cap = 'round') => { x.strokeStyle = rgba; x.lineWidth = w; x.lineCap = cap; x.lineJoin = 'round'; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.stroke(); };
  const eyeCol = new THREE.Color(F.eye), ec = (k) => `rgb(${Math.round(clamp(eyeCol.r * 255 * k, 0, 255))},${Math.round(clamp(eyeCol.g * 255 * k, 0, 255))},${Math.round(clamp(eyeCol.b * 255 * k, 0, 255))})`;
  const EY = 0.121, EX = 0.037;
  for (const sg of [-1, 1]) {
    const cx = px(sg * EX, EY), cy = py(EY), w = 17, tl = F.tilt, hLid = 9.5 - F.lid * 2.2; // outer corner is away from the nose: sg * +x
    const inner = cx - sg * w, outer = cx + sg * w, iy = cy + 2.2 + tl * 6, oy = cy + 1.2 - tl * 6, topY = cy - hLid, botY = cy + 6.4;
    // socket, bag and crease shading
    soft(cx, cy - 1, 27, 'rgba(70,28,16,0.34)', 1.15, 0.9); soft(cx, cy + 10, 15, 'rgba(70,28,16,0.18)', 1.5, 0.6); soft(px(sg * 0.07, 0.085), py(0.085), 21, 'rgba(215,80,70,0.20)', 1, 1.2);
    x.strokeStyle = 'rgba(60,26,16,0.5)'; x.lineWidth = 1.5; x.lineCap = 'round'; x.beginPath(); x.moveTo(inner + sg * 4, iy - 7); x.quadraticCurveTo(cx, topY - 8.5, outer + sg * 2, oy - 6); x.stroke();
    // eye aperture
    const path = () => { x.beginPath(); x.moveTo(inner, iy); x.quadraticCurveTo(cx - sg * 2, topY - 2, outer, oy); x.quadraticCurveTo(cx + sg * 2, botY + 2, inner, iy); x.closePath(); };
    x.save(); path(); const sg0 = x.createLinearGradient(0, topY, 0, botY); sg0.addColorStop(0, '#b9a995'); sg0.addColorStop(0.45, '#eee6d6'); sg0.addColorStop(1, '#f4ede0'); x.fillStyle = sg0; x.fill(); x.clip();
    soft(inner + sg * 3, iy, 6, 'rgba(210,110,100,0.7)', 1, 0.8); soft(outer - sg * 2, oy, 7, 'rgba(160,110,90,0.35)'); // caruncle, outer corner shade
    const ix = cx - sg * 0.5, iR = 7.4; // iris with limbal ring and striations
    const ig = x.createRadialGradient(ix, cy, 1, ix, cy, iR); ig.addColorStop(0, ec(0.7)); ig.addColorStop(0.5, ec(1.15)); ig.addColorStop(0.82, ec(0.78)); ig.addColorStop(1, '#0b0705'); x.fillStyle = ig; x.beginPath(); x.arc(ix, cy, iR, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(255,240,210,0.16)'; x.lineWidth = 0.7; for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2 + R(); x.beginPath(); x.moveTo(ix + Math.cos(a) * 3.2, cy + Math.sin(a) * 3.2); x.lineTo(ix + Math.cos(a) * 6.2, cy + Math.sin(a) * 6.2); x.stroke(); }
    x.fillStyle = '#060303'; x.beginPath(); x.arc(ix, cy, 3.1, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(ix - 2.6, cy - 3.0, 1.9, 1.5, -0.4, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.arc(ix + 2.8, cy + 2.6, 1.0, 0, Math.PI * 2); x.fill();
    const lg = x.createLinearGradient(0, topY - 1, 0, cy + 1); lg.addColorStop(0, 'rgba(25,8,4,0.78)'); lg.addColorStop(1, 'rgba(25,8,4,0)'); x.fillStyle = lg; x.fillRect(inner - 4, topY - 3, w * 2 + 8, hLid * 0.9 + 4);
    x.restore();
    // lids: upper lash line (heavy, flicking at the outer corner), lower lid (soft)
    x.strokeStyle = '#1c0d08'; x.lineWidth = 3.1; x.lineCap = 'round'; x.beginPath(); x.moveTo(inner - sg * 0.5, iy); x.quadraticCurveTo(cx - sg * 2, topY - 3.2, outer + sg * 1.5, oy - 0.5); x.stroke();
    x.lineWidth = 1.6; x.beginPath(); x.moveTo(outer + sg * 0.5, oy - 0.5); x.lineTo(outer + sg * 4.5, oy - 3 + tl * 2); x.stroke();
    x.strokeStyle = 'rgba(80,36,24,0.55)'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(inner + sg * 1.5, iy + 0.6); x.quadraticCurveTo(cx + sg * 2, botY + 2.6, outer - sg * 1, oy + 0.6); x.stroke();
    // brow: many short strands along an arch, thicker at the inner end, tail thinning out (tilt = inner end low (angry) or high (calm))
    const bx0 = px(sg * 0.02, 0.148), bx1 = px(sg * 0.07, 0.146), byIn = py(0.1485) + F.tilt * 30 - 1, byOut = py(0.141) - F.tilt * 20, arch = 8 + F.brow * 220;
    for (let k = 0; k < 46; k++) {
      const t = (k + R() * 0.8) / 46, bx = lerp(bx0, bx1, t), by = lerp(byIn, byOut, t) - Math.sin(t * Math.PI) * arch * 0.5, th = lerp(5.5, 2.2, t) + 1.4 * R();
      const dx = sg * (3.8 + 2 * R()), dy = -(2.2 - 3 * t + R()) ; x.strokeStyle = browCol(0.55 + 0.4 * R()); x.lineWidth = lerp(1.9, 1.0, t); x.beginPath(); x.moveTo(bx - dx * 0.4, by + th * 0.5); x.lineTo(bx + dx, by - th * 0.5 + dy * 0.3); x.stroke();
    }
    soft(lerp(bx0, bx1, 0.4), lerp(byIn, byOut, 0.4) - 5, 14, browCol(0.25), 2.1, 0.4);
    // nose side / nostril / alar crease / nasolabial / crow's feet
    soft(px(sg * 0.014 * F.nose[0], 0.078), py(0.078), 7.5, 'rgba(34,10,6,0.72)', 1.4, 0.8); soft(px(sg * 0.026 * F.nose[0], 0.083), py(0.083), 9, 'rgba(120,55,40,0.22)', 1, 1.1);
    line([[px(sg * 0.024, 0.088), py(0.088)], [px(sg * 0.034, 0.066), py(0.066)], [px(sg * 0.036, 0.045), py(0.045)]], 2.2, 'rgba(85,36,26,0.34)');
    line([[px(sg * 0.013, 0.12), py(0.12)], [px(sg * 0.011, 0.098), py(0.098)]], 3, 'rgba(90,42,30,0.14)');
    for (let k = 0; k < 3; k++) line([[outer + sg * 6, cy + (k - 1) * 4], [outer + sg * (12 + k * 1.6), cy + (k - 1) * 7.5]], 1.1, 'rgba(70,30,20,0.28)');
    if (fi === 2) for (let k = 0; k < 3; k++) line([[px(sg * 0.064, 0.121 + (k - 1) * 0.008), py(0.121 + (k - 1) * 0.008)], [px(sg * 0.076, 0.121 + (k - 1) * 0.016), py(0.121 + (k - 1) * 0.016)]], 1.2, 'rgba(70,30,20,0.35)');
  }
  // nose bridge highlight / philtrum
  soft(FT_W / 2, py(0.1), 6, 'rgba(255,230,210,0.15)', 0.7, 3); soft(FT_W / 2, py(0.082), 6, 'rgba(255,235,220,0.18)', 1, 0.8);
  line([[FT_W / 2 - 3, py(0.07)], [FT_W / 2 - 3.5, py(0.058)]], 2, 'rgba(85,36,26,0.22)'); line([[FT_W / 2 + 3, py(0.07)], [FT_W / 2 + 3.5, py(0.058)]], 2, 'rgba(85,36,26,0.22)');
  // lips: shadowed mouth plane, upper lip (darker, cupid's bow), lower lip (fuller, glossy), parting line pulled by the expression
  const mx = FT_W / 2, my = py(0.052), mw = 27, cr = -F.mouth * 60;
  soft(mx, my - 12, 18, 'rgba(70,25,15,0.2)', 1.7, 0.7); soft(mx, my + 17, 17, 'rgba(70,25,15,0.26)', 1.7, 0.7);
  const lipUp = () => { x.beginPath(); x.moveTo(mx - mw, my + cr * 0.3); x.quadraticCurveTo(mx - 15, my - 9, mx - 3.5, my - 8.5); x.quadraticCurveTo(mx, my - 5, mx + 3.5, my - 8.5); x.quadraticCurveTo(mx + 15, my - 9, mx + mw, my + cr * 0.3); x.quadraticCurveTo(mx, my + 1.2, mx - mw, my + cr * 0.3); x.closePath(); };
  lipUp(); x.fillStyle = 'rgba(150,56,50,0.78)'; x.fill();
  x.beginPath(); x.moveTo(mx - mw + 1, my + cr * 0.3 + 0.8); x.quadraticCurveTo(mx, my + 2.2, mx + mw - 1, my + cr * 0.3 + 0.8); x.quadraticCurveTo(mx + 14, my + 17, mx, my + 18); x.quadraticCurveTo(mx - 14, my + 17, mx - mw + 1, my + cr * 0.3 + 0.8); x.closePath();
  const lg2 = x.createLinearGradient(0, my, 0, my + 18); lg2.addColorStop(0, 'rgba(176,78,70,0.78)'); lg2.addColorStop(1, 'rgba(200,100,92,0.7)'); x.fillStyle = lg2; x.fill();
  x.fillStyle = 'rgba(255,255,255,0.2)'; x.beginPath(); x.ellipse(mx - 2, my + 9.5, 8, 2, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#2a0c08'; x.lineWidth = 2.3; x.lineCap = 'round'; x.beginPath(); x.moveTo(mx - mw - 2, my + cr * 0.3 - 1.5); x.quadraticCurveTo(mx - 8, my + 2.6, mx, my + 1.8); x.quadraticCurveTo(mx + 8, my + 2.6, mx + mw + 2, my + cr * 0.3 - 1.5); x.stroke();
  for (const sg of [-1, 1]) soft(mx + sg * (mw + 4), my + cr * 0.3 - 1, 5, 'rgba(60,20,12,0.4)');
  soft(mx, py(0.012), 12, 'rgba(70,25,15,0.2)', 1.4, 0.8); // chin cleft
  if (F.scar) { x.strokeStyle = 'rgba(235,190,170,0.8)'; x.lineWidth = 2.6; x.lineCap = 'round'; x.beginPath(); x.moveTo(px(0.078, 0.134), py(0.134)); x.quadraticCurveTo(px(0.068, 0.1), py(0.1), px(0.05, 0.07), py(0.07)); x.stroke(); x.strokeStyle = 'rgba(90,30,25,0.65)'; x.lineWidth = 1.2; for (let k = 0; k < 5; k++) { const t = 0.12 + k * 0.19, X = px(0.078 - 0.028 * t, 0.134 - 0.064 * t), Y = py(0.134 - 0.064 * t); x.beginPath(); x.moveTo(X - 3.5, Y - 2.5); x.lineTo(X + 3.5, Y + 2.5); x.stroke(); } }
  // forehead creases (grim variants)
  if (fi !== 1) for (let k = 0; k < (fi === 2 ? 3 : 1); k++) line([[px(-0.04, 0.178 + k * 0.01), py(0.178 + k * 0.01)], [FT_W / 2, py(0.18 + k * 0.01) - 2], [px(0.04, 0.178 + k * 0.01), py(0.178 + k * 0.01)]], 1.5, 'rgba(70,30,20,0.16)');
  x.clearRect(0, 0, 3, FT_H); x.clearRect(FT_W - 3, 0, 3, FT_H); x.clearRect(0, 0, FT_W, 3); x.clearRect(0, FT_H - 3, FT_W, 3); // uv (0,0) / edges must stay transparent
  const bc = bodyCanvas(); if (bc) x.drawImage(bc, FT_W, 0); // body shading (x 256..640) and limb tiles (x 640..1024) of the atlas, shared and painted once
  const lc = limbCanvas(); if (lc) x.drawImage(lc, 640, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; faceCacheHD.set(key, t); return t;
}

// ---------------------------------------------------------------- HD head: skull grid with a dense face, hair cards, curls, beard, tails
const SK_Y = [0.0, 0.03, 0.06, 0.09, 0.115, 0.14, 0.17, 0.205, 0.248];
const SK_A = (() => { const a = []; for (let i = 0; i <= 8; i++) a.push(-1 + i * 0.25); const st = (Math.PI * 2 - 2) / 6; for (let i = 1; i <= 5; i++) a.push(1 + i * st); return a; })();
const SK_Y_M = [0.0, 0.045, 0.095, 0.145, 0.2, 0.25], SK_A_M = (() => { const a = []; for (let i = 0; i <= 6; i++) a.push(-1 + i * (2 / 6)); const st = (Math.PI * 2 - 2) / 4; for (let i = 1; i <= 3; i++) a.push(1 + i * st); return a; })();
const hairline = (phi) => { const a = Math.abs(((phi + Math.PI * 3) % (Math.PI * 2)) - Math.PI); return lerp(0.172, 0.07, sm01(0, Math.PI, a)) - 0.032 * bump(a, 1.15, 0.35); };
const _hu = new V3(), _hv = new V3(), _hn = new V3(), _hc = new V3();
// Hair card: 3 rows of 2 points (root, mid, tip) = 4 triangles, textured with the strand cutout (u across, v root 1 -> tip 0). Normals lean outward from the head centre so a card
// reads as part of the scalp volume; vertex colour runs dark at the root to lighter at the tip. rows = [[L,R],[L,R],[L,R]] (V3)
function pushCard(out, rows, k0, k1, k2, ctr) {
  const ks = [k0, k1, k2], vv = [1, 0.5, 0], base = out.pos.length / 3;
  _hu.subVectors(rows[1][0], rows[0][0]); _hv.subVectors(rows[0][1], rows[0][0]); _hn.crossVectors(_hv, _hu).normalize(); _hc.copy(rows[1][0]).add(rows[1][1]).multiplyScalar(0.5).sub(ctr);
  const flip = _hn.dot(_hc) < 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const v = rows[r][c]; _hc.copy(v).sub(ctr).normalize().multiplyScalar(0.6).addScaledVector(_hn, flip ? -0.4 : 0.4).normalize();
    out.pos.push(v.x, v.y, v.z); out.nor.push(_hc.x, _hc.y, _hc.z); out.col.push(ks[r], ks[r] * 0.97, ks[r] * 0.94); out.uv.push(c, vv[r]);
  }
  for (let r = 0; r < 2; r++) { const a = base + r * 2, b = a + 1, d = a + 2, e = a + 3; if (flip) out.idx.push(a, d, b, b, d, e); else out.idx.push(a, b, d, b, e, d); }
}
const newCards = () => ({ pos: [], nor: [], col: [], uv: [], idx: [] });
function cardsToGeo(out) { const g = new THREE.BufferGeometry(); g.userData.cards = true; g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2)); g.setIndex(out.idx); return g; }
// strand cutout for hair cards: tapering strands in clumps, solid at the root, ragged tips (alpha test); grey values give highlights
let strandTex = null;
export function strandTexture() {
  if (strandTex || typeof document === 'undefined') return strandTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d'), R = rng32(77); x.clearRect(0, 0, 128, 128);
  const clump = (u0, wd, L, wv, g0) => { // tapered clump with a lighter core and darker edges
    for (let k = 0; k < 3; k++) { const f = 1 - k * 0.3, g = Math.round(clamp(g0 * (0.72 + k * 0.2), 0, 255)); x.fillStyle = `rgb(${g},${g},${g})`; const w2 = wd * f;
      x.beginPath(); x.moveTo(u0 - w2 * 0.5, -2); x.bezierCurveTo(u0 - w2 * 0.5 + wv * 0.3, L * 0.4, u0 + wv * 0.65 - w2 * 0.15, L * 0.78, u0 + wv, L * (0.78 + 0.22 * f)); x.bezierCurveTo(u0 + wv * 0.65 + w2 * 0.15, L * 0.78, u0 + w2 * 0.5 + wv * 0.3, L * 0.4, u0 + w2 * 0.5, -2); x.fill(); }
  };
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 8);
  for (let i = 0; i < 17; i++) clump((i + 0.2 + R() * 0.6) / 17 * 128, 9 + R() * 5, 70 + R() * 58, (R() - 0.5) * 16, 170 + R() * 85);
  for (let i = 0; i < 22; i++) clump(R() * 128, 3 + R() * 2, 60 + R() * 68, (R() - 0.5) * 20, 150 + R() * 100);
  strandTex = new THREE.CanvasTexture(c); strandTex.colorSpace = THREE.SRGBColorSpace; strandTex.anisotropy = 4; strandTex.wrapS = strandTex.wrapT = THREE.ClampToEdgeWrapping; return strandTex;
}

export class TubeChain extends VerletGrid {
  // tapered tube following a verlet chain (ponytail, braid): ONE mesh. o: rad [r0, r1] or fn(i) -> radius, sides, braid (bulging plaits), colorFn(t) -> number
  constructor(o) {
    super(Object.assign({}, o, { cols: 1 })); const R = this.rows, K = this.sides = o.sides || 5; this.braid = !!o.braid; this.radFn = typeof o.rad === 'function' ? o.rad : ((i) => lerp(o.rad[0], o.rad[1], i / (R - 1)));
    this.geo = new THREE.BufferGeometry(); const nv = R * K + 1; this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3)); this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    const col = new Float32Array(nv * 3); for (let r = 0; r < R; r++) for (let k = 0; k < K; k++) { const t = r / (R - 1), c = (o.colorFn ? o.colorFn(t, r, k) : lerp(0.8, 1.06, t)) * (this.braid ? (r % 2 ? 1 : 0.84) : 1); col.set([c, c * 0.97, c * 0.94], (r * K + k) * 3); } col.set([1, 0.97, 0.94], R * K * 3); this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx = []; for (let r = 0; r < R - 1; r++) for (let k = 0; k < K; k++) { const k2 = (k + 1) % K, a = r * K + k, b = (r + 1) * K + k, d = r * K + k2, e = (r + 1) * K + k2; idx.push(a, d, b, d, e, b); } for (let k = 0; k < K; k++) idx.push((R - 1) * K + k, (R - 1) * K + (k + 1) % K, R * K);
    this.geo.setIndex(idx); this.mesh = new THREE.Mesh(this.geo, o.material); this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.name = o.name || 'hair'; this._ref = new V3(1, 0, 0);
  }
  write() {
    const par = this.mesh.parent; if (!par) return; _inv.copy(par.matrixWorld).invert(); const R = this.rows, K = this.sides, P = this.geo.attributes.position, N = this.geo.attributes.normal, t = new V3(), s = new V3(), u = new V3(), q = new V3();
    for (let r = 0; r < R; r++) {
      const a = this.p[Math.max(0, r - 1)], b = this.p[Math.min(R - 1, r + 1)]; t.subVectors(b, a).normalize(); s.crossVectors(t, this._ref); if (s.lengthSq() < 0.02) s.crossVectors(t, _w.set(0, 0, 1)); s.normalize(); u.crossVectors(t, s);
      const rad = this.radFn(r) * (this.braid ? 1 + 0.2 * Math.cos(r * 2.4) : 1);
      for (let k = 0; k < K; k++) { const th = (k / K) * Math.PI * 2 + (this.braid ? r * 0.7 : 0), cs = Math.cos(th), sn = Math.sin(th); q.copy(s).multiplyScalar(cs).addScaledVector(u, sn); _w2.copy(this.p[r]).addScaledVector(q, rad).applyMatrix4(_inv); P.setXYZ(r * K + k, _w2.x, _w2.y, _w2.z); q.transformDirection(_inv); N.setXYZ(r * K + k, q.x, q.y, q.z); }
    }
    q.copy(this.p[R - 1]).addScaledVector(t, this.radFn(R - 1) * 0.9).applyMatrix4(_inv); P.setXYZ(R * K, q.x, q.y, q.z); t.transformDirection(_inv); N.setXYZ(R * K, t.x, t.y, t.z);
    P.needsUpdate = true; N.needsUpdate = true;
  }
}
// keep chains / cloth behind the body: push out of the torso / neck ellipse (body space)
function bodyCollider(rig) {
  const tmp = new V3();
  return (p) => {
    tmp.copy(p); rig.body.worldToLocal(tmp); const y = tmp.y / rig.build.height;
    if (y < 0.1) tmp.y = 0.1 * rig.build.height;
    if (y > 0.35 && y < 1.75) { const rx = y > 1.45 ? 0.1 : 0.29, rz = y > 1.45 ? 0.1 : y > 1.0 ? 0.2 : 0.17, zc = y > 1.45 ? -0.03 : 0; const e = (tmp.x / rx) ** 2 + ((tmp.z - zc) / rz) ** 2; if (e < 1 && tmp.z < 0.1) { const k = 1 / Math.sqrt(Math.max(e, 1e-4)); tmp.x *= k; tmp.z = zc + (tmp.z - zc) * k; } }
    rig.body.localToWorld(tmp); p.copy(tmp);
  };
}
// ponytail / braid with secondary motion: attached to the head bone, one draw call (hair double-sided material)
export function addHairTail(rig, o = {}) {
  const rows = o.rows || 6, rl = (o.length || 0.22) / (rows - 1), braid = !!o.braid;
  const g = new TubeChain({
    anchor: rig.joints.head, rows, rowLen: rl, stiff: 0.16, stiffFall: 0.6, damping: 0.93, gravity: -9, sides: o.sides || 5, braid,
    shape: (r) => new V3(o.x || 0, (o.y ?? 0.2) - r * rl * 0.55, (o.z ?? -0.11) - r * rl * 0.62), rad: o.rad || [0.03, 0.011], material: o.material || rig.mats.hairF || rig.mats.hair, name: 'hair', collide: bodyCollider(rig),
  });
  return rig.addSecondary(g);
}
// long hair as a physical sheet hanging from the occiput over the shoulders
export function addHairSheet(rig, o = {}) {
  const rows = o.rows || 5, cols = o.cols || 4, len = o.length || 0.4, rl = len / (rows - 1);
  const g = new ClothGrid({
    anchor: rig.joints.head, rows, cols, rowLen: rl, stiff: 0.2, stiffFall: 0.8, damping: 0.94, gravity: -9, side: new V3(1, 0, 0),
    shape: (r) => new V3(0, 0.16 - r * rl * 0.9, -0.1 - r * rl * 0.2 - 0.004 * r * r), widthFn: (r) => lerp(0.17, 0.2, r / (rows - 1)), material: o.material || rig.mats.hairF || rig.mats.hair, name: 'hair', tipShade: 0.85, fold: true, collide: bodyCollider(rig),
  });
  return rig.addSecondary(g);
}
function buildHeadHD(rig, look, bd, DL) {
  const A = (m, g, o) => rig.add(m, g, o || rig.joints.head);
  const F = FACES[(look.face | 0) % 3], prof = SKULL(F.j), hi = DL >= 2, SY = hi ? SK_Y : SK_Y_M, SA = hi ? SK_A : SK_A_M, nFront = hi ? 9 : 7;
  const surf = (x, y, off = 0) => { const R = skullR(prof, y), u = clamp(x / (R * HEAD_SX + 1e-5), -0.98, 0.98); return new V3(x, y, HEAD_SZ * R * Math.sqrt(1 - u * u) + off); };
  const skull = gridGeo(SY.length, SA.length, (r, c) => { const R = skullR(prof, SY[r]); return [R * HEAD_SX * Math.sin(SA[c]), SY[r], R * HEAD_SZ * Math.cos(SA[c])]; }, { tipTop: [0, 0.264, 0], wrap: true });
  const bl = [];
  for (const sg of [-1, 1]) {
    bl.push({ p: [sg * 0.04, 0.142, surf(sg * 0.04, 0.142).z], r: 0.034, a: F.brow }, { p: [sg * 0.037, 0.122, surf(sg * 0.037, 0.122).z], r: 0.021, a: -0.006 }, { p: [sg * 0.037, 0.134, surf(sg * 0.037, 0.134).z], r: 0.015, a: 0.0035 },
      { p: [sg * 0.068, 0.088, surf(sg * 0.068, 0.088).z], r: 0.034, a: F.cheek }, { p: [sg * 0.076, 0.03, surf(sg * 0.076, 0.03).z], r: 0.03, a: 0.006 }, { p: [sg * 0.086, 0.165, 0], r: 0.03, a: -0.004 });
  }
  bl.push({ p: [0, 0.002, surf(0, 0.002).z], r: 0.028, a: F.chin }, { p: [0, 0.19, surf(0, 0.19).z], r: 0.05, a: 0.004 }, { p: [0, 0.057, surf(0, 0.057).z], r: 0.017, a: 0.0042 }, { p: [0, 0.042, surf(0, 0.042).z], r: 0.018, a: 0.0046 });
  sculpt(skull, bl); skull.computeVertexNormals();
  {
    const P = skull.attributes.position, uv = new Float32Array(P.count * 2);
    for (let i = 0; i < SY.length * SA.length; i++) { const c = i % SA.length, r = (i / SA.length) | 0; if (c < nFront) { uv[i * 2] = (FT_W / AT_W) * (0.5 + SA[c] / (2 * FT_PHI)) * 0.98 + 0.002; uv[i * 2 + 1] = SY[r] / FT_Y; } }
    skull.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); skull.userData.faceUV = true;
    const C = skull.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), front = sm01(0.0, 0.07, z); let r = 1, g = 1, b = 1;
      const ch = Math.exp(-((Math.abs(x) - 0.068) ** 2 + (y - 0.083) ** 2) / 0.0012) * front; r *= 1 + 0.05 * ch; g *= 1 - 0.15 * ch; b *= 1 - 0.14 * ch;
      const es = Math.exp(-((Math.abs(x) - 0.037) ** 2 + (y - 0.124) ** 2) / 0.0007) * front; const e = 1 - 0.2 * es; r *= e; g *= e * 0.97; b *= e * 0.99;
      const uj = 1 - 0.28 * sm01(0.03, -0.01, y), fh = 1 + 0.06 * sm01(0.16, 0.225, y) * front, k = uj * fh, nose = Math.exp(-(x * x + (y - 0.075) ** 2) / 0.0006) * front * 0.1;
      C.setXYZ(i, C.getX(i) * r * k * (1 + nose), C.getY(i) * g * k * (1 - nose), C.getZ(i) * b * k * (1 - nose));
    }
  }
  A('skin', skull);
  // nose: bridge, alae and tip as 7 triangles (wider / longer by variant); a broken bridge for the rugged face
  {
    const n0 = F.nose[0], n1 = F.nose[1], z = (y, o = 0) => surf(0, y).z + o, tipZ = z(0.084) + 0.022 * n1;
    const v = { top: [0, 0.134, z(0.134, 0.001)], mL: [-0.0075 * n0, 0.106, z(0.106, 0.008)], mR: [0.0075 * n0, 0.106, z(0.106, 0.008)], aL: [-0.0175 * n0, 0.082, z(0.082, 0.004)], aR: [0.0175 * n0, 0.082, z(0.082, 0.004)], tip: [0, 0.08, tipZ], bL: [-0.009 * n0, 0.073, z(0.073, 0.01)], bR: [0.009 * n0, 0.073, z(0.073, 0.01)] };
    const T = [['top', 'mL', 'tip'], ['top', 'tip', 'mR'], ['mL', 'aL', 'tip'], ['mR', 'tip', 'aR'], ['aL', 'bL', 'tip'], ['aR', 'tip', 'bR'], ['bL', 'bR', 'tip']];
    const pos = T.flat().map((k) => v[k]).flat(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const col = []; for (let i = 0; i < pos.length / 3; i++) { const y = pos[i * 3 + 1]; const k = 0.9 + 0.12 * sm01(0.08, 0.13, y); col.push(k, k, k); } g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); A('skin', g);
  }
  for (const sg of [-1, 1]) A('skin', paint(xf(sphereG(0.026, 5, 3), [sg * 0.103, 0.103, -0.006], [0, sg * 0.25, sg * -0.1], [0.32, 1.15, 0.85]), (x, y, z, nx) => 1 - 0.2 * sm01(0.1, -0.5, sg * nx)));
  // hair: dark scalp cap + layered strand cards (alpha cutout) + curls; secondary hair (ponytail, braid, long sheet) is added by buildGladiator
  const hairy = look.hair || 'short', ctr = new V3(0, 0.12, 0), rnd = rng32((look.face | 0) * 31 + (rig.palette.hair.length * 7) + 5), out = newCards();
  if (hairy !== 'bald' && hairy !== 'none') {
    const curls = hairy === 'curls', off = hairy === 'crop' ? 0.006 : 0.011, yb = hairy === 'tied' || hairy === 'braid' ? 0.175 : hairy === 'crop' ? 0.185 : 0.165;
    const ys = curls ? [yb + 0.01, 0.222, 0.248] : [yb, 0.205, 0.238, 0.253];
    const pts = ys.map((y) => [skullR(prof, y) + off + (y < 0.2 ? 0.004 : 0), y]); pts.push([0, curls ? 0.264 : 0.268]);
    const cap = lathe(pts, 10, HEAD_SX, HEAD_SZ, 0, 1); const P = cap.attributes.position;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (Math.abs(y - ys[0]) < 1e-5) { const z = P.getZ(i), x = P.getX(i), back = Math.max(0, -z / 0.1), side = Math.abs(x) / 0.1; P.setY(i, y - 0.075 * back - 0.03 * side * (1 - back) + 0.015 * Math.max(0, z / 0.1) * (1 - side)); } }
    paint(cap, (x, y, z) => 0.6 + 0.16 * sm01(0.16, 0.25, y)); A('hair', cap);
    const sp = (phi, y, o) => { const R = skullR(prof, y) + o; return new V3(R * HEAD_SX * Math.sin(phi), y, R * HEAD_SZ * Math.cos(phi)); };
    const layer = (n, yHi, lenK, w, o0, o1, a0, jit, kk, flow = 0) => { // n strand cards around the crown flowing down to the hairline (flow: sweep sideways)
      for (let i = 0; i < n; i++) {
        const phi = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * jit, yLo = hairline(phi) - 0.012 - 0.03 * rnd() * lenK, yMid = lerp(yHi, yLo, 0.5), ww = w * (0.9 + 0.3 * rnd()), jt = (rnd() - 0.5) * 0.2 + flow, k = kk * (0.9 + 0.2 * rnd()), pa = (i % 2) * 0.004;
        pushCard(out, [[sp(phi - ww, yHi, o0 + pa), sp(phi + ww, yHi, o0 + pa)], [sp(phi - ww * 0.95 + jt * 0.5, yMid, o1 + pa), sp(phi + ww * 0.95 + jt * 0.5, yMid, o1 + pa)], [sp(phi - ww * 0.8 + jt, yLo, o0 * 0.9 + pa), sp(phi + ww * 0.8 + jt, yLo, o0 * 0.9 + pa)]], 0.78 * k, 1.0 * k, 1.04 * k, ctr);
      }
    };
    const fringe = (n, spread, drop) => { for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) - 0.5 : 0, phi = t * spread, yLo = 0.158 - drop * (0.5 - Math.abs(t)) * 0 - 0.012 * rnd(); pushCard(out, [[sp(phi - 0.2, 0.226, 0.014), sp(phi + 0.2, 0.226, 0.014)], [sp(phi - 0.2 + t * 0.2, 0.196, 0.024), sp(phi + 0.2 + t * 0.2, 0.196, 0.024)], [sp(phi - 0.18 + t * 0.35, yLo, 0.02), sp(phi + 0.18 + t * 0.35, yLo, 0.02)]], 0.8, 1.0, 1.06, ctr); } };
    if (hairy === 'short') { layer(hi ? 11 : 8, 0.246, 1, 0.3, 0.014, 0.022, 0.1, 0.1, 1); if (hi) layer(10, 0.215, 0.7, 0.3, 0.018, 0.026, 0.33, 0.1, 0.96); fringe(hi ? 5 : 3, 1.4, 0); }
    else if (hairy === 'crop') layer(hi ? 12 : 8, 0.242, 0.3, 0.27, 0.01, 0.015, 0.0, 0.1, 1);
    else if (hairy === 'long') {
      layer(hi ? 11 : 8, 0.246, 1, 0.3, 0.014, 0.022, 0.05, 0.08, 1);
      for (const sg of [-1, 1]) for (let k = 0; k < 2; k++) { const x0 = sg * (0.1 + k * 0.004), y0 = 0.15 - k * 0.012, L = 0.26 - k * 0.05, zc = 0.012 - k * 0.04; pushCard(out, [[new V3(x0, y0, zc + 0.034), new V3(x0, y0, zc - 0.034)], [new V3(x0 + sg * 0.012, y0 - L * 0.5, zc + 0.036), new V3(x0 + sg * 0.012, y0 - L * 0.5, zc - 0.036)], [new V3(x0 + sg * 0.01, y0 - L, zc + 0.03), new V3(x0 + sg * 0.01, y0 - L, zc - 0.03)]], 0.8, 1.0, 1.06, new V3(0, y0, 0)); }
      if (!hi) A('hair', paint(lathe([[0.07, -0.31], [0.1, -0.15], [0.116, 0.04], [0.11, 0.15]], 7, 0.96, 0.9, 0, 1, Math.PI * 0.52, Math.PI * 0.96), (x, y) => 1 - 0.15 * sm01(-0.05, -0.31, y)));
    } else if (hairy === 'tied' || hairy === 'braid') { layer(hi ? 11 : 8, 0.246, 0.6, 0.3, 0.014, 0.022, 0.05, 0.1, 1); A('cloth', xf(lathe([[0.034, -0.012], [0.036, 0.012]], 6, 1, 1, 0, 1), [0, 0.19, -0.108], [0.55, 0, 0])); }
    else if (curls) {
      const G = hi ? 12 : 8;
      for (let i = 0; i < G; i++) { const phi = (i / G) * Math.PI * 2 + 0.2 + (rnd() - 0.5) * 0.2, y = (i % 2 ? 0.205 : 0.236) + (rnd() - 0.5) * 0.01, p = sp(phi, y, 0.02), s = 0.9 + 0.3 * rnd(); A('hair', paint(xf(sphereG(0.03, 4, 2), p.toArray(), [rnd() * 3, rnd() * 3, 0], [s, 0.85 * s, s]), 0.7 + 0.45 * rnd())); }
      for (let i = 0; i < (hi ? 4 : 2); i++) { const phi = -0.6 + i * (hi ? 0.4 : 1.2), p = sp(phi, 0.172, 0.02); A('hair', paint(xf(sphereG(0.024, 4, 2), p.toArray(), [rnd() * 3, 0, 0], [1, 0.8, 1]), 0.75 + 0.35 * rnd())); }
    }
    if (out.pos.length) A('hair', cardsToGeo(out));
  }
  // beard: jaw sheet + chin strands + sideburns + moustache
  const my = 0.052, mz = surf(0, my).z, bd2 = look.beard | 0;
  if (bd2) {
    const lo = bd2 === 2 ? -0.07 : -0.045, o = bd2 === 2 ? 0.011 : 0.006, L = Math.PI * 1.2;
    const bp = [[0.02, lo], [skullR(prof, -0.01) + o, -0.02], [skullR(prof, 0.03) + o, 0.025], [skullR(prof, 0.044) + o * 0.8, 0.044]];
    const beard = lathe(bp, 9, HEAD_SX, HEAD_SZ, 0, 1, -L / 2, L);
    const BP = beard.attributes.position; if (bd2 === 2) for (let i = 0; i < BP.count; i++) if (BP.getY(i) <= lo + 1e-4) BP.setZ(i, BP.getZ(i) + 0.03 * Math.max(0, Math.cos(Math.atan2(BP.getX(i), BP.getZ(i)))));
    paint(beard, (x, y) => 0.7 + 0.22 * sm01(lo, 0.04, y)); A('hair', beard);
    const bo = newCards(), nT = hi ? (bd2 === 2 ? 7 : 4) : 3, bc = new V3(0, 0.02, 0);
    for (let i = 0; i < nT; i++) {
      const ph = (i / (nT - 1) - 0.5) * 1.9 * (bd2 === 2 ? 1 : 0.7), R0 = skullR(prof, 0.0) + o + 0.004, L2 = (bd2 === 2 ? 0.1 : 0.05) * (1 - 0.3 * Math.abs(ph)) * (0.85 + 0.3 * rnd()), x = R0 * HEAD_SX * Math.sin(ph), z = R0 * HEAD_SZ * Math.cos(ph) + (bd2 === 2 ? 0.02 : 0), w = 0.026;
      pushCard(bo, [[new V3(x - w, 0.004, z), new V3(x + w, 0.004, z)], [new V3(x - w, -L2 * 0.5, z + 0.012), new V3(x + w, -L2 * 0.5, z + 0.012)], [new V3(x - w * 0.8 + (rnd() - 0.5) * 0.01, -L2, z + 0.024), new V3(x + w * 0.8 + (rnd() - 0.5) * 0.01, -L2, z + 0.024)]], 0.74, 0.98, 1.04, bc);
    }
    for (const sg of [-1, 1]) { // sideburn + moustache cards
      const R1 = skullR(prof, 0.09) + 0.007, xs = sg * (R1 * HEAD_SX + 0.001); pushCard(bo, [[new V3(xs, 0.125, 0.012), new V3(xs, 0.125, -0.026)], [new V3(xs, 0.07, 0.02), new V3(xs, 0.07, -0.024)], [new V3(xs - sg * 0.003, 0.025, 0.014), new V3(xs - sg * 0.003, 0.025, -0.01)]], 0.74, 0.98, 1.04, new V3(0, 0.08, 0));
      pushCard(bo, [[new V3(sg * 0.003, my + 0.016, mz + 0.012), new V3(sg * 0.026, my + 0.01, mz + 0.002)], [new V3(sg * 0.006, my + 0.006, mz + 0.016), new V3(sg * 0.032, my - 0.002, mz + 0.006)], [new V3(sg * 0.012, my - 0.01, mz + 0.012), new V3(sg * 0.034, my - 0.012, mz + 0.006)]], 0.76, 0.98, 1.0, new V3(0, my, mz - 0.05));
    }
    A('hair', cardsToGeo(bo));
  }
}

// ---------------------------------------------------------------- HD body: neck, deltoids, shaped limbs, fists with fingers, feet and sandals
// Cross-sections are authored per muscle group: rad(t, a) -> [x, z] with a = 0 at +z (front), sg = +1 for the character's left side (lateral = sg * sin a > 0).
const lat = (sg, a) => pz(sg * Math.sin(a)), med = (sg, a) => pz(-sg * Math.sin(a)), frontK = (a) => pz(Math.cos(a)), backK = (a) => pz(-Math.cos(a));
function limbSet(rig, A, c) {
  const { B, AR, LG, DL, legMat } = c, hi = DL >= 2, SA = 8, SL = hi ? 10 : 8;
  const tsUA = hi ? [0, 0.3, 0.62, 1.0, 1.07] : [0, 0.45, 1.0, 1.07], tsFA = hi ? [0, 0.22, 0.55, 1.0] : [0, 0.45, 1.0], tsTH = hi ? [0, 0.28, 0.62, 1.0, 1.06] : [0, 0.4, 1.0, 1.06], tsSH = hi ? [0, 0.2, 0.5, 1.0] : [0, 0.4, 1.0];
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    // upper arm: deltoid insertion, biceps (front), triceps (back), narrow at the elbow, rounded end
    const rT = 0.074 * B * AR, rB = 0.058 * B * AR, lenA = DIM.upperArm;
    A('skin', limbG(lenA, tsUA, SA, (t, a) => { const base = lerp(rT, rB, Math.pow(Math.min(t, 1), 0.9)) * (t > 1 ? 1 - (t - 1) * 9 : 1), m = 1 + 0.2 * bump(t, 0.38, 0.2) * Math.pow(frontK(a), 1.2) + 0.15 * bump(t, 0.5, 0.26) * backK(a) + 0.08 * bump(t, 0.14, 0.14) * lat(sg, a) - 0.07 * bump(t, 1.0, 0.1), r = base * m; return [Math.sin(a) * r * 1.0, Math.cos(a) * r * 0.96]; },
      (t, a) => 1 - 0.14 * bump(t, 0.45, 0.3) * sq(Math.sin(a)) + 0.09 * bump(t, 0.38, 0.18) * frontK(a) - 0.08 * bump(t, 1.0, 0.1), { tipBot: 1.13, tile: 0, sg }), J_('shoulder' + s));
    // forearm: flexor mass near the elbow, tapered to a flat wrist
    const fT = 0.054 * B * AR, fB = 0.042 * B * AR, lenF = DIM.foreArm;
    A('skin', limbG(lenF, tsFA, SA, (t, a) => { const base = lerp(fT, fB, Math.pow(t, 0.8)), m = 1 + 0.24 * bump(t, 0.14, 0.17) * (0.7 * frontK(a) + 0.6 * lat(sg, a)) + 0.07 * bump(t, 0.35, 0.2) * backK(a), r = base * m, fl = sm(t); return [Math.sin(a) * r * (1 + 0.12 * fl), Math.cos(a) * r * (1 - 0.18 * fl)]; },
      (t, a) => 1 - 0.12 * bump(t, 0.3, 0.3) * sq(Math.sin(a)) + 0.08 * bump(t, 0.15, 0.15) * lat(sg, a), { tipTop: 0.03, tile: 1, sg }), J_('elbow' + s));
    // fist: wrist, four finger bumps wrapped around the grip axis (alternating radius), thumb
    const fist = hi ? gridGeo(7, 6, (r, ci) => { const ys = [0.022, -0.012, -0.034, -0.05, -0.067, -0.088, -0.108], rs = [0.04, 0.048, 0.056, 0.047, 0.055, 0.051, 0.036], a = (ci / 6) * Math.PI * 2; return [Math.sin(a) * rs[r] * 1.0, ys[r], Math.cos(a) * rs[r] * 0.88]; },
      { tipBot: [0, -0.12, 0], col: (r, ci) => [1, 0.96, 0.95].map((v) => v * [0.96, 1, 1.04, 0.84, 1.03, 0.98, 0.92][r]) }) : lathe([[0.04, -0.118], [0.052, -0.045], [0.046, -0.005], [0, 0.024]], 6, 1.0, 0.84, 0.12, 0.88);
    A('skin', paint(fist, (x, y, z) => 1 - 0.1 * Math.exp(-sq((y + 0.1) / 0.02)) + 0.04 * sm01(-0.04, 0, y)), J_('wrist' + s));
    A('skin', xf(coneG(0.017, 0.074, hi ? 5 : 4), [sg * 0.038, -0.052, 0.03], [-Math.PI + 0.9, 0, sg * 0.15]), J_('wrist' + s)); // thumb
    // thigh: quadriceps front, outer sweep, hamstring, teardrop above the knee
    const tT = 0.104 * B * LG, tB = 0.07 * B * LG, lenT = DIM.thigh;
    A(legMat, limbG(lenT, tsTH, SL, (t, a) => { const base = lerp(tT, tB, Math.pow(Math.min(t, 1), 0.85)) * (t > 1 ? 1 - (t - 1) * 8 : 1), m = 1 + 0.17 * bump(t, 0.36, 0.22) * frontK(a) + 0.1 * bump(t, 0.3, 0.24) * lat(sg, a) + 0.12 * bump(t, 0.34, 0.24) * backK(a) + 0.09 * bump(t, 0.84, 0.1) * frontK(a) * (0.5 + med(sg, a)) - 0.09 * bump(t, 1.0, 0.1), r = base * m; return [Math.sin(a) * r * 0.98, Math.cos(a) * r * 1.04]; },
      (t, a) => 1 - 0.12 * bump(t, 0.4, 0.3) * sq(Math.sin(a)) + 0.09 * bump(t, 0.36, 0.2) * frontK(a) - 0.05 * bump(t, 0.08, 0.1), { tipTop: 0.035, tipBot: 1.12, tile: 2, sg }), J_('hip' + s));
    // shin: calf (back, two heads), shin crest (front), narrow ankle with malleoli
    const sT = 0.064 * B * LG, sB = 0.046 * B * LG, lenS = DIM.shin;
    A(legMat, limbG(lenS, tsSH, SA, (t, a) => { const base = lerp(sT, sB, Math.pow(t, 0.9)), m = 1 + 0.38 * bump(t, 0.2, 0.17) * Math.pow(backK(a), 1.4) * (1 + 0.2 * sg * Math.sin(a)) + 0.09 * bump(t, 0.5, 0.45) * Math.pow(frontK(a), 5) + 0.1 * bump(t, 0.97, 0.06) * Math.abs(Math.sin(a)) - 0.1 * bump(t, 0.8, 0.12) * backK(a), r = base * m * (1 - 0.06 * sm(t)); return [Math.sin(a) * r * 0.97, Math.cos(a) * r * 1.02]; },
      (t, a) => 1 - 0.1 * bump(t, 0.2, 0.2) * sq(Math.sin(a)) + 0.09 * bump(t, 0.25, 0.2) * backK(a) + 0.09 * Math.pow(frontK(a), 6) * bump(t, 0.5, 0.35), { tipTop: 0.03, tile: 3, sg }), J_('knee' + s));
  }
  function J_(n) { return rig.joints[n]; }
}
function footSet(rig, A, c) {
  const { B, LG, DL, opts } = c, hi = DL >= 2;
  const zs = hi ? [-0.062, -0.01, 0.06, 0.13, 0.19] : [-0.062, 0.02, 0.12, 0.19], rx = hi ? [0.027, 0.042, 0.046, 0.046, 0.034] : [0.027, 0.043, 0.046, 0.034], ry = hi ? [0.03, 0.04, 0.032, 0.023, 0.015] : [0.03, 0.038, 0.024, 0.015], cy = hi ? [-0.055, -0.046, -0.052, -0.062, -0.07] : [-0.055, -0.046, -0.06, -0.07];
  for (const s of ['L', 'R']) {
    const foot = gridGeo(zs.length, 6, (r, k) => { const a = (k / 6) * Math.PI * 2; return [Math.sin(a) * rx[r] * (1 + 0.04 * Math.sin(a)), cy[r] + Math.cos(a) * ry[r], zs[r]]; },
      { tipTop: [0, -0.052, -0.08], tipBot: [0, -0.071, 0.205], col: (r, k) => { const a = (k / 6) * Math.PI * 2, bot = 1 - 0.18 * sm01(0.2, -0.8, Math.cos(a)); return bot * (r === zs.length - 1 ? 0.92 : 1); } });
    A('skin', foot, rig.joints['ankle' + s]);
    if (opts.boots !== false) { // sandal: extruded sole, ankle strap, instep straps
      const sole = extrude([[0, -0.08], [0.036, -0.05], [0.045, 0.05], [0.05, 0.13], [0, 0.205], [-0.05, 0.13], [-0.045, 0.05], [-0.036, -0.05]].map((p) => [p[0], -p[1]]), 0.012); sole.rotateX(-Math.PI / 2); sole.translate(0, -DIM.footH, 0);
      A('leather', paint(sole, 0.7), rig.joints['ankle' + s]);
      A('leather', lathe([[0.056, -0.046], [0.056, -0.012]], 6, 1, 1, 0, 1), rig.joints['ankle' + s]);
      if (hi) for (const z of [0.07]) { const k = (zz) => zs.findIndex((v) => v >= zz); const j = k(z), j0 = Math.max(0, j - 1), tt = (z - zs[j0]) / (zs[j] - zs[j0]), R = lerp(rx[j0], rx[j], tt) + 0.004, Ry = lerp(ry[j0], ry[j], tt) + 0.004, Cy = lerp(cy[j0], cy[j], tt), pts = [-1.5, -0.5, 0.5, 1.5].map((q) => new V3(Math.sin(q) * R, Cy + Math.cos(q) * Ry, z)); A('leather', ribbon(pts, 0.014, (p) => new V3(p.x, p.y - Cy, 0).normalize()), rig.joints['ankle' + s]); }
    }
  }
}
function neckSet(rig, A, c) {
  const { B, DL } = c, hi = DL >= 2, bn = lerp(1, B, 0.7), ys = [-0.04, 0.012, 0.062, 0.105], rs = [0.094 * bn, 0.064 * bn, 0.054, 0.052];
  const neck = gridGeo(4, hi ? 8 : 6, (r, k) => { const a = (k / (hi ? 8 : 6)) * Math.PI * 2; return [Math.sin(a) * rs[r], ys[r], Math.cos(a) * rs[r] * 0.92]; }, { col: (r, k) => 1 - 0.18 * sm01(0.0, -0.05, ys[r]) });
  const P = neck.attributes.position;
  sculpt(neck, [{ p: [0.03, 0.03, 0.04], r: 0.025, a: 0.005 }, { p: [-0.03, 0.03, 0.04], r: 0.025, a: 0.005 }, { p: [0, 0.03, 0.05], r: 0.012, a: 0.004 }]); neck.computeVertexNormals();
  A('skin', neck, rig.joints.neck);
}
function deltoid(rig, A, c, s, sg) {
  const { B, AR, DL } = c, rr = 0.07 * B * AR, ys = [0.05, 0.004, -0.05], rs = [0.044, 0.084, 0.064].map((v) => v * (rr / 0.07) * 0.97);
  A('skin', gridGeo(3, 8, (r, k) => { const a = (k / 8) * Math.PI * 2; return [Math.sin(a) * rs[r] * 1.04 + sg * 0.004, ys[r], Math.cos(a) * rs[r]]; }, { tipTop: [sg * 0.004, 0.072, 0], col: (r, k) => 1 - 0.08 * sm01(-0.03, -0.056, ys[r]) }), rig.joints['shoulder' + s]);
}

// ---------------------------------------------------------------- builder
// opts: {palette, build:{bulk,height,shoulder,arm,waist,leg,head,seg}, look:{face,hair:'short|crop|long|tied|bald',beard:0|1|2}, torso, legsBare, boots, belt, name, weapon}
/** detail: 'low' (today's cost: 6-sided limbs, decal face), 'medium' (8-sided shaped limbs, painted face map, hair cards), 'high' (10-sided thighs, fingers, sandal straps, full hair). Numbers 0..2 work too. Default high. */
export function detailLevel(d) { if (typeof d === 'number') return clamp(d | 0, 0, 2); return d === 'low' ? 0 : d === 'medium' ? 1 : 2; }
export function buildGladiator(opts = {}) {
  const DL = detailLevel(opts.detail), look = Object.assign({ face: 0, hair: 'short', beard: 0 }, opts.look || {}); if (opts.hair === 'none') look.hair = 'bald';
  const pal = Object.assign({}, DEFAULT_PALETTE, opts.palette || {}), bloodU = makeBloodUniforms();
  const faceTex = DL > 0 ? faceTextureHD(((look.face | 0) % 3 + 3) % 3, FACES[((look.face | 0) % 3 + 3) % 3].eye, '#' + new THREE.Color(pal.hair).getHexString()) : null;
  const mats = makeMaterials(pal, bloodU, { detail: DL, face: faceTex, strand: DL > 0 ? strandTexture() : null });
  const bd = Object.assign({ bulk: 1, height: 1, shoulder: 1, arm: 1, waist: 1, leg: 1, head: 1, seg: 6 }, opts.build || {}), B = bd.bulk, S = bd.seg, WS = (1 + (B - 1) * 0.6) * bd.waist;
  const root = new THREE.Group(); root.name = opts.name || 'gladiator'; const body = new THREE.Group(); body.name = 'body'; root.add(body); body.scale.setScalar(bd.height);
  const J = {}, rest = new Map(); rest.set(root, new THREE.Matrix4()); rest.set(body, new THREE.Matrix4().makeScale(bd.height, bd.height, bd.height));
  const mk = (n, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = n; o.position.set(x, y, z); parent.add(o); J[n] = o; rest.set(o, new THREE.Matrix4().makeTranslation(x, y, z)); return o; };
  mk('hips', body, 0, DIM.hipY, 0); mk('spine', J.hips, 0, DIM.spineY, 0); mk('chest', J.spine, 0, DIM.chestY, 0); mk('neck', J.chest, 0, DIM.neckY, 0); mk('head', J.neck, 0, DIM.headY, 0);
  const shx = DIM.shoulderX * bd.shoulder;
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    mk('shoulder' + s, J.chest, sg * shx, DIM.shoulderY, 0); mk('elbow' + s, J['shoulder' + s], 0, -DIM.upperArm, 0); mk('wrist' + s, J['elbow' + s], 0, -DIM.foreArm, 0);
    mk('hip' + s, J.hips, sg * DIM.hipX, -DIM.hipSocketY, 0); mk('knee' + s, J['hip' + s], 0, -DIM.thigh, 0); mk('ankle' + s, J['knee' + s], 0, -DIM.shin, 0);
  }
  for (const n of JOINTS) J[n].rotation.order = ORDER[n] || 'XYZ';
  // sockets (static children; weapon authored along +Y, Rx(pi) maps it onto the forearm axis)
  for (const s of ['L', 'R']) { const sock = new THREE.Object3D(); sock.name = 'hand' + s + 'Socket'; sock.position.set(0, -0.075, 0); sock.rotation.x = Math.PI; J['wrist' + s].add(sock); J['hand' + s] = sock; }
  const sk = {}; const sockets = (n, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = n; o.position.set(x, y, z); parent.add(o); sk[n] = o; return o; };
  sockets('helm', J.head, 0, 0.13, 0); sockets('back', J.chest, 0, 0.2, -0.13); sockets('cloakTop', J.chest, 0, 0.3, -0.13); sockets('beltFront', J.hips, 0, 0.06, 0.12); sockets('beltL', J.hips, 0.17, 0.0, 0); sockets('beltR', J.hips, -0.17, 0.0, 0); sockets('forearmL', J.elbowL, 0, -0.13, 0.0); sockets('chestFront', J.chest, 0, 0.16, 0.17);
  sockets('beltBack', J.hips, 0, 0.02, -0.12);

  // squash/stretch, flash
  const squash = new Spring1(300, 17); const flashState = { t: 0, dur: 0.12, color: new THREE.Color(0.7, 0.5, 0.3) };
  const bones = JOINTS.map((n) => J[n]), boneSet = new Set(bones), items = [];
  const restOf = (obj) => { // rest-pose matrix relative to root (joints rest at identity rotation)
    const chain = []; for (let o = obj; o && o !== root; o = o.parent) chain.push(o);
    const M = new THREE.Matrix4(), T = new THREE.Matrix4(); for (let i = chain.length - 1; i >= 0; i--) { const o = chain[i], r = rest.get(o); M.multiply(r || T.compose(o.position, o.quaternion, o.scale)); } return M;
  };
  const glow = { color: new THREE.Color('#ffffff'), on: false, base: 0.6, amp: 0.4, speed: 3, t: 0 };

  const blood = { amount: 0, fresh: 0, wounds: [], cuts: [], wi: 0 };
  const sync = () => { bloodU.uBlood.value = blood.amount; bloodU.uBOn.value = blood.amount > 0.002 || blood.wounds.length || blood.cuts.length ? 1 : 0; };
  const PARTS = { // joint = the joint collapsed to hide the part, obj/off = where the cut is, axis (in axisObj frame) points from the body toward the part
    head: { joint: 'head', obj: 'neck', off: [0, 0.07, 0], axis: [0, 1, 0], axisObj: 'neck', r: 0.075, len: 0.27, type: 'head' },
    forearmL: { joint: 'elbowL', obj: 'elbowL', off: [0, 0, 0], axis: [0, -1, 0], axisObj: 'shoulderL', r: 0.066, len: 0.39, type: 'limb', side: 1 }, forearmR: { joint: 'elbowR', obj: 'elbowR', off: [0, 0, 0], axis: [0, -1, 0], axisObj: 'shoulderR', r: 0.066, len: 0.39, type: 'limb', side: -1 },
    armL: { joint: 'shoulderL', obj: 'shoulderL', off: [0, 0, 0], axis: [0, -1, 0], axisObj: 'chest', r: 0.095, len: 0.68, type: 'limb', side: 1 }, armR: { joint: 'shoulderR', obj: 'shoulderR', off: [0, 0, 0], axis: [0, -1, 0], axisObj: 'chest', r: 0.095, len: 0.68, type: 'limb', side: -1 },
    shinL: { joint: 'kneeL', obj: 'kneeL', off: [0, 0, 0], axis: [0, -1, 0], axisObj: 'hipL', r: 0.082, len: 0.56, type: 'limb', side: 1 }, shinR: { joint: 'kneeR', obj: 'kneeR', off: [0, 0, 0], axis: [0, -1, 0], axisObj: 'hipR', r: 0.082, len: 0.56, type: 'limb', side: -1 },
    legL: { joint: 'hipL', obj: 'hipL', off: [0, 0, 0], axis: [0, -1, 0], axisObj: 'hips', r: 0.115, len: 1.0, type: 'limb', side: 1 }, legR: { joint: 'hipR', obj: 'hipR', off: [0, 0, 0], axis: [0, -1, 0], axisObj: 'hips', r: 0.115, len: 1.0, type: 'limb', side: -1 },
  };
  const rig = {
    root, body, joints: J, sockets: sk, mats, palette: pal, secondary: [], squash, flashState, build: bd, opts, look, glow, items, bones, rest,
    parts: {}, gear: {}, skeleton: null, tag: '',
    postUpdate: [], // fn(rig) run after IK each frame (e.g. shield stabilisers)
    setPalette(p) { Object.assign(pal, p); mats.skin.color.set(pal.skin); mats.hair.color.set(pal.hair); mats.cloth.color.set(pal.cloth); mats.plume.color.set(pal.plume); mats.metal.color.set(pal.metal); if (mats.clothF) { mats.clothF.color.set(pal.cloth); mats.plumeF.color.set(pal.plume); mats.hairF.color.set(pal.hair); } },
    flash(dur = 0.12, color) { flashState.t = dur; flashState.dur = dur; if (color) flashState.color.set(color); },
    squashKick(a) { squash.kick(a); },
    // attach a cloth/chain secondary effect; returns it
    addSecondary(sec) { rig.secondary.push(sec); const m = sec.mesh || sec.group; root.add(m); return sec; },
    // queue geometry (authored in `obj` local space; obj is a joint, socket or bone-like holder) into the merged skinned body
    add(mat, geo, obj) {
      let b = obj; while (b && !boneSet.has(b)) b = b.parent; if (!b) throw new Error('rig.add: object is not under a bone');
      const g = geo.clone(); col1(g); if (!g.attributes.normal) g.computeVertexNormals(); if (mat === 'skin' && g.attributes.uv && !(g.userData && g.userData.faceUV)) g.deleteAttribute('uv'); /* only the skull, torso and limbs sample the atlas */ if (mat === 'hair' && DL > 0 && !(g.userData && g.userData.cards)) { const n = g.attributes.position.count, u = new Float32Array(n * 2); for (let i = 0; i < n; i++) { u[i * 2] = 0.5; u[i * 2 + 1] = 0.985; } g.setAttribute('uv', new THREE.BufferAttribute(u, 2)); } /* scalp, curls, beard: opaque root texel */ g.applyMatrix4(restOf(obj)); items.push({ mat, geo: g, bone: bones.indexOf(b), tag: rig.tag || '' }); return g;
    },
    addMaterial(key, mat, shade, xo) { mats[key] = mat; shadePatch(mat, shade || 'cloth', Object.assign({ blood: bloodU, gash: false }, xo)); if (!mat.userData.base) mat.userData.base = mat.emissive.clone(); return mat; },
    addBone(obj) { bones.push(obj); boneSet.add(obj); return bones.length - 1; },
    restOf,
    // (re)build one SkinnedMesh per material from the queued parts. Call after adding gear. Rigid weights, shared skeleton.
    rebuild() {
      for (const k in rig.parts) { root.remove(rig.parts[k]); rig.parts[k].geometry.dispose(); } rig.parts = {};
      rig.skeleton = new THREE.Skeleton(bones, bones.map((b) => restOf(b).invert()));
      const by = {}; for (const it of items) (by[it.mat] = by[it.mat] || []).push(it);
      for (const k in by) {
        const list = by[k]; let nv = 0, ni = 0; for (const it of list) { nv += it.geo.attributes.position.count; ni += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
        const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), clr = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni);
        const hasUV = list.some((it) => it.geo.attributes.uv), uvs = hasUV ? new Float32Array(nv * 2) : null;
        let vo = 0, io = 0;
        for (const it of list) {
          const g = it.geo, n = g.attributes.position.count; pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); clr.set(g.attributes.color.array, vo * 3); if (uvs && g.attributes.uv) uvs.set(g.attributes.uv.array, vo * 2);
          for (let i = 0; i < n; i++) { si[(vo + i) * 4] = it.bone; sw[(vo + i) * 4] = 1; }
          if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; else for (let i = 0; i < n; i++) idx[io++] = vo + i;
          vo += n;
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
        if (uvs) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.boundingSphere = new THREE.Sphere(new V3(0, 1, 0), 3); geo.boundingBox = new THREE.Box3(new V3(-3, -1, -3), new V3(3, 3, 3));
        const m = new THREE.SkinnedMesh(geo, mats[k]); m.name = k.startsWith('hair') ? 'hair' : k; m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
        root.add(m); m.bind(rig.skeleton, new THREE.Matrix4()); rig.parts[k] = m;
      }
      return rig;
    },
    triangles() { let n = 0; root.traverse((o) => { if (o.isMesh && o.geometry && o.visible) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n | 0; },
    drawCalls() { let n = 0; root.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; },
    resetSecondary() { for (const s of rig.secondary) s.reset(); },
    // emissive pulse on gem material (rarity glow). hex colour, intensity base/amp, pulse speed (rad/s)
    setGlow(hex, base = 0.6, amp = 0.35, speed = 3) { glow.color.set(hex); glow.on = true; glow.base = base; glow.amp = amp; glow.speed = speed; },
    update(dt) {
      rig.animator.update(dt);
      root.updateMatrixWorld(true);
      rig.animator.postIK();
      root.updateMatrixWorld(true);
      for (const f of rig.postUpdate) f(rig);
      for (const s of rig.secondary) s.update(dt);
      const sq = squash.update(dt); body.scale.set(bd.height / Math.sqrt(1 + sq), bd.height * (1 + sq), bd.height / Math.sqrt(1 + sq));
      if (blood.fresh > 0) { blood.fresh = Math.max(0, blood.fresh - dt / 9); bloodU.uBFresh.value = blood.fresh; }
      if (flashState.t > 0) { flashState.t = Math.max(0, flashState.t - dt); }
      const f = flashState.t > 0 ? flashState.t / flashState.dur : 0;
      glow.t += dt; const gi = glow.on ? glow.base + glow.amp * Math.sin(glow.t * glow.speed) : 0; mats.gem.userData.base.copy(glow.color).multiplyScalar(gi);
      for (const k in mats) { const m = mats[k]; if (!m.userData.base) continue; m.emissive.copy(m.userData.base); if (f > 0) m.emissive.lerp(flashState.color, f); m.emissiveIntensity = 1; }
    },
    // ---- gore API (see js/gore.js). Rest space = the un-skinned space the geometry is authored in (root space with body scale baked).
    bloodU, blood, severed: {},
    jointRest(name, local = [0, 0, 0]) { return new V3(local[0], local[1], local[2]).applyMatrix4(restOf(J[name])); },
    /** soak 0..1 over the whole body; fresh = wet gloss bump (decays over ~9 s) */
    addBlood(amount, fresh = 1) { blood.amount = clamp(blood.amount + amount, 0, 1); blood.fresh = Math.max(blood.fresh, fresh); sync(); },
    setBlood(amount, fresh = 0) { blood.amount = clamp(amount, 0, 1); blood.fresh = fresh; bloodU.uBFresh.value = fresh; sync(); },
    /** gash at a rest-space point; dir = unit slash direction in rest space; half = half length (m); strength 0..1. Oldest wound is recycled. */
    addWound(pt, dir, half = 0.09, strength = 1) {
      const i = blood.wounds.length < MAX_WOUNDS ? blood.wounds.length : (blood.wi = ((blood.wi | 0) + 1) % MAX_WOUNDS); const w = { x: pt.x, y: pt.y, z: pt.z, hx: dir.x, hy: dir.y, hz: dir.z, half, s: strength };
      blood.wounds[i] = w; bloodU.uWound.value[i].set(pt.x, pt.y, pt.z, half); bloodU.uWoundD.value[i].set(dir.x, dir.y, dir.z, strength); sync(); return i;
    },
    clearBlood() { blood.amount = 0; blood.fresh = 0; blood.wounds.length = 0; blood.wi = 0; for (const v of bloodU.uWound.value) v.set(0, 0, 0, 0); for (const v of bloodU.uWoundD.value) v.set(0, 0, 0, 0); rig.restoreParts(); bloodU.uBFresh.value = 0; sync(); },
    /** hide a body part by collapsing its joint (everything skinned below it vanishes) and paint the stump. Returns the cut frame or null. */
    sever(part) {
      const P = PARTS[part]; if (!P || rig.severed[part]) return null; const j = J[P.joint]; if (!j) return null;
      rig.root.updateMatrixWorld(true); const f = rig.partFrame(part);
      j.scale.setScalar(1e-4); rig.severed[part] = true; blood.cuts.push(part);
      const c = rig.jointRest(P.obj, P.off); bloodU.uCut.value[(blood.cuts.length - 1) % MAX_CUTS].set(c.x, c.y, c.z, P.r);
      if (part === 'head') for (const s of rig.secondary) if (s.mesh && s.mesh.name === 'plume') s.mesh.visible = false;
      if ((part === 'armL' || part === 'forearmL') && rig.animator.ik.hand && rig.animator.ik.hand.side === 'L') { rig.animator.ik.hand._w = rig.animator.ik.hand.w; rig.animator.ik.hand.w = 0; }
      blood.fresh = 1; sync(); return f;
    },
    /** world-space cut frame of a part: {pos, axis (unit, pointing from the body toward where the part was), len, r, type} */
    partFrame(part) {
      const P = PARTS[part]; if (!P) return null; const o = J[P.obj], ax = J[P.axisObj]; o.updateWorldMatrix(true, false); ax.updateWorldMatrix(true, false);
      const pos = new V3(P.off[0], P.off[1], P.off[2]).applyMatrix4(o.matrixWorld), axis = new V3(P.axis[0], P.axis[1], P.axis[2]).transformDirection(ax.matrixWorld);
      return { pos, axis, anchor: ax, len: P.len, r: P.r, type: P.type, side: P.side || 0, scale: rig.root.scale.y * bd.height };
    },
    restoreParts() { for (const part in rig.severed) { const P = PARTS[part]; J[P.joint].scale.setScalar(1); } rig.severed = {}; blood.cuts.length = 0; for (const v of bloodU.uCut.value) v.set(0, 0, 0, 0);
      for (const s of rig.secondary) if (s.mesh && s.mesh.name === 'plume') s.mesh.visible = true; const h = rig.animator.ik.hand; if (h && h._w !== undefined) { h.w = h._w; delete h._w; } },
    dispose() { root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const k in mats) mats[k].dispose(); rig.skeleton && rig.skeleton.dispose(); },
  };
  const A = (m, g, o) => rig.add(m, g, o);
  const tm = opts.torso && opts.torso !== 'skin' && mats[opts.torso] ? opts.torso : 'skin', legMat = opts.legsBare === false ? 'cloth' : 'skin', AR = bd.arm, LG = bd.leg;
  const jt = (len) => (x, y) => { const t = -y / len; return 1 - 0.1 * sm01(0.8, 1, t) - 0.06 * sm01(0.2, 0, t); }; // slightly ruddier / darker at the joint ends

  // torso: pelvis (cloth), abdomen, chest with pecs / clavicles / lats sculpted and painted, neck. Hidden pole rings are omitted.
  A('cloth', paint(lathe([[0.14, -0.12], [0.186 * B, -0.02], [0.195 * B, 0.06], [0.158 * B * bd.waist, 0.098], [0, 0.104]], 8, 1, 0.72, 0.08, 0.9), (x, y) => 1 - 0.25 * sm01(-0.07, -0.13, y)), J.hips);
  const bodyUV = (g, yOff) => { const uv = g.attributes.uv, P = g.attributes.position; for (let i = 0; i < P.count; i++) uv.setXY(i, (FT_W + BODY_BW * uv.getX(i)) / AT_W, (P.getY(i) + yOff - BODY_Y0) / BODY_YH); g.userData.faceUV = true; return g; }; // torso skin samples the body shading half of the atlas
  const ab = lathe([[0.152 * WS, -0.1], [0.148 * WS, -0.03], [0.158 * WS, 0.06], [0.172 * WS, 0.15], [0.185 * B, 0.225]], 10, 1, 0.74, 0.05, 0.92, DL > 0 ? -Math.PI : 0, Math.PI * 2);
  const abl = []; for (let r = 0; r < 3; r++) for (const sg of [-1, 1]) abl.push({ p: [sg * 0.042 * WS, -0.02 + r * 0.068, 0.12], r: 0.036, a: 0.0085 });
  sculpt(ab, abl); paint(ab, (x, y, z) => { if (DL > 0) return 1; const fr = sm01(0, 0.08, z); const g1 = Math.exp(-sq(x / 0.012)) * fr * 0.13; const rows = (Math.exp(-sq(y / 0.012)) + Math.exp(-sq((y - 0.068) / 0.012)) + Math.exp(-sq((y - 0.136) / 0.012))) * fr * 0.07; return 1 - g1 - rows; });
  if (DL > 0 && tm === 'skin') bodyUV(ab, DIM.spineY);
  A(tm, ab, J.spine);
  const sh = bd.shoulder;
  const chest = lathe([[0.166 * B, -0.035], [0.236 * B, 0.11], [0.256 * B * (0.94 + 0.06 * sh), 0.19], [0.244 * B * (0.94 + 0.06 * sh), 0.265], [0.17 * B, 0.325], [0.095, 0.358], [0, 0.372]], 12, 1, 0.72, 0.06, 0.92, DL > 0 ? -Math.PI : 0, Math.PI * 2);
  const cb = [], SC = opts.sculpt === false ? 0 : 1;
  for (const sg of [-1, 1]) cb.push({ p: [sg * 0.092 * B, 0.17, 0.125], r: 0.078, a: 0.02 * SC }, { p: [sg * 0.075, 0.305, 0.1], r: 0.035, a: 0.006 * SC }, { p: [sg * 0.1, 0.33, -0.03], r: 0.065, a: 0.012 * SC }, { p: [sg * 0.13 * B, 0.1, -0.125], r: 0.09, a: 0.014 * SC });
  sculpt(chest, cb);
  paint(chest, (x, y, z) => {
    if (DL > 0) return 1 + 0.04 * sm01(0.17, 0.3, y) * sm01(0, 0.1, z);
    const fr = sm01(0, 0.1, z), gr = Math.exp(-sq(x / 0.02)) * fr * sm01(0.05, 0.14, y) * sm01(0.27, 0.2, y) * 0.16;
    const under = Math.exp(-sq((y - 0.098) / 0.014)) * fr * 0.13 * (1 - Math.exp(-sq(x / 0.02)));
    const clav = Math.exp(-sq((y - 0.292 + Math.abs(x) * 0.25) / 0.009)) * fr * 0.1 * sm01(0.02, 0.07, Math.abs(x));
    return 1 - gr - under - clav + 0.05 * sm01(0.17, 0.3, y) * fr;
  });
  if (DL > 0 && tm === 'skin') bodyUV(chest, DIM.spineY + DIM.chestY);
  A(tm, chest, J.chest);
  const HDC = { B, AR, LG, DL, legMat, opts };
  if (DL > 0) { neckSet(rig, A, HDC); buildHeadHD(rig, look, bd, DL); for (const [s, sg] of [['L', 1], ['R', -1]]) deltoid(rig, A, HDC, s, sg); limbSet(rig, A, HDC); footSet(rig, A, HDC); } else {
  A('skin', paint(lathe([[0.068 * B, -0.05], [0.058, 0.04], [0, 0.1]], 6, 1, 1, 0.2, 0.8), (x, y, z) => 1 - 0.15 * sm01(0.02, -0.05, y)), J.neck);
  buildHead(rig, look, bd);
  const S6 = 6;
  // arms: deltoid, upper arm, forearm, fist with thumb and knuckle shading
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    A('skin', paint(sphereG(0.07 * B * AR, 6, 4, 1.05, 1, 1.0), (x, y, z, nx, ny) => 1 - 0.08 * Math.max(0, -ny)), J['shoulder' + s]);
    A('skin', paint(capsule(DIM.upperArm, 0.074 * B * AR, 0.058 * B * AR, S6, 0.16, false), jt(DIM.upperArm)), J['shoulder' + s]);
    A('skin', paint(capsule(DIM.foreArm, 0.058 * B * AR, 0.042 * B * AR, S6, 0.2, false), jt(DIM.foreArm)), J['elbow' + s]);
    A('skin', paint(lathe([[0.04, -0.118], [0.052, -0.045], [0.046, -0.005], [0, 0.024]], 5, 1.0, 0.84, 0.12, 0.88), (x, y, z) => 1 - 0.1 * Math.exp(-sq((y + 0.1) / 0.02)) + 0.04 * sm01(-0.04, 0, y)), J['wrist' + s]);
    A('skin', xf(coneG(0.017, 0.07, 4), [sg * 0.036, -0.055, 0.03], [-Math.PI + 0.9, 0, sg * 0.15]), J['wrist' + s]); // thumb
    // legs
    A(legMat, paint(capsule(DIM.thigh, 0.104 * B * LG, 0.07 * B * LG, S6, 0.16), jt(DIM.thigh)), J['hip' + s]);
    A(legMat, paint(capsule(DIM.shin, 0.07 * B * LG, 0.046 * B * LG, S6, 0.3, false), jt(DIM.shin)), J['knee' + s]);
    const prof = [[0.05, -0.06], [0.05, 0.06], [0.036, 0.13], [0.0, 0.16]];
    const foot = lathe(prof, 5, 1, 1.0, 0.1, 0.85); foot.rotateX(Math.PI / 2); foot.scale(1, 1, 0.55); foot.translate(0, -DIM.footH + 0.03, 0.04);
    A('skin', foot, J['ankle' + s]);
    if (opts.boots !== false) {
      const sole = lathe([[0.056, -0.06], [0.056, 0.06], [0.042, 0.136]], 5, 1, 1, 0, 1); sole.rotateX(Math.PI / 2); sole.scale(1.04, 1, 0.2); sole.translate(0, -DIM.footH + 0.0075, 0.04); A('leather', paint(sole, 0.7), J['ankle' + s]);
      A('leather', lathe([[0.056, -0.046], [0.056, -0.012]], 6, 1, 1, 0, 1), J['ankle' + s]);
      A('leather', xf(quadG(0.1, 0.012), [0, -0.052, 0.07], [-0.55, 0, 0]), J['ankle' + s]);
    }
  }
  }
  if (opts.belt !== false) A('leather', paint(lathe([[0.158 * WS, -0.065], [0.164 * WS, 0.012]], 12, 1, 0.76, 0, 1), 1), J.spine);
  rig.animator = new Animator(rig, opts.weapon || 'unarmed');
  rig.rebuild(); rig.detail = DL;
  if (DL > 0 && look.hair === 'tied') addHairTail(rig, { rows: DL > 1 ? 6 : 5, sides: DL > 1 ? 5 : 4 });
  else if (DL > 0 && look.hair === 'braid') addHairTail(rig, { rows: DL > 1 ? 8 : 6, length: 0.3, rad: [0.027, 0.012], braid: true, sides: DL > 1 ? 5 : 4 });
  else if (DL > 1 && look.hair === 'long') addHairSheet(rig);
  return rig;
}

// Cloak helper: ClothGrid on the back, collides with a torso ellipse so it hangs behind the body.
export function addCloak(rig, o = {}) {
  const cols = o.cols || 5, rows = o.rows || 6, len = o.length || 0.78, w0 = 0.46, w1 = 0.7, rl = len / (rows - 1);
  const tmp = new V3();
  const g = new ClothGrid({
    anchor: rig.joints.chest, rows, cols, rowLen: rl, stiff: 0.12, stiffFall: 0.85, damping: 0.95, gravity: -9, side: new V3(1, 0, 0),
    shape: (r) => new V3(0, 0.27 - r * rl * 0.98, -0.16 - r * 0.02), widthFn: (r) => lerp(w0, w1, r / (rows - 1)), material: o.material || rig.mats.cloth, name: 'cloak', tipShade: 0.65, fold: true,
    collide: (p) => { // push out of the body ellipse (body-local), keeps the cloak behind the torso/legs
      tmp.copy(p); rig.body.worldToLocal(tmp); const y = tmp.y / rig.build.height;
      if (y < 0.1) { tmp.y = 0.1 * rig.build.height; }
      if (y > 0.35 && y < 1.75) { const rx = 0.29, rz = y > 1.0 ? 0.2 : 0.17; const e = (tmp.x / rx) ** 2 + (tmp.z / rz) ** 2; if (e < 1 && tmp.z < 0.1) { const k = 1 / Math.sqrt(Math.max(e, 1e-4)); tmp.x *= k; tmp.z *= k; } }
      rig.body.localToWorld(tmp); p.copy(tmp);
    },
  });
  return rig.addSecondary(g);
}
// Plume helper (horsehair crest tail) on the helm socket: ONE verlet ribbon mesh (1 draw call) that arches back from the crest.
export function addPlume(rig, o = {}) {
  const rows = o.rows || 7, tall = o.tall || 1, cols = o.cols || 3, rl = 0.052 * tall;
  const g = new ClothGrid({
    anchor: o.anchor || rig.sockets.helm, rows, cols, rowLen: rl, stiff: 0.2, stiffFall: 0.75, damping: 0.93, gravity: -4.5, side: new V3(1, 0, 0),
    shape: (r) => new V3(0, 0.05 + 0.04 * Math.sin(Math.min(r, 3) * 0.55) * tall - 0.0016 * r * r * tall + (o.y || 0), (o.z ?? -0.01) - 0.034 * r * Math.min(1, tall) - 0.004 * r * r),
    widthFn: (r) => (o.w || 0.075) * (1 - 0.45 * (r / (rows - 1))), material: o.material || rig.mats.plume, name: 'plume', tipShade: 0.62, fold: true,
  });
  return rig.addSecondary(g);
}
// Belt tassel / pteruges strip hanging from a socket.
export function addTassel(rig, socketName, o = {}) {
  const rows = o.rows || 4, rl = (o.length || 0.22) / (rows - 1);
  const g = new ChainMesh({ anchor: rig.sockets[socketName], rows, rowLen: rl, stiff: 0.05, stiffFall: 0.5, damping: 0.9, gravity: -12, shape: (r) => new V3(o.dx || 0, -r * rl, o.dz || 0), material: o.material || rig.mats.leather, radius: o.radius || [0.026, 0.02], flat: o.flat || [0.55, 1.2], box: o.box, name: 'tassel' });
  return rig.addSecondary(g);
}

// ---------------------------------------------------------------- Animator
class QPose { constructor() { this.q = JOINTS.map(() => new Q()); this.hip = new V3(); this.body = new V3(); this.brot = new Q(); this.ground = 1; this.lock = 1; }
  copy(o) { for (let i = 0; i < this.q.length; i++) this.q[i].copy(o.q[i]); this.hip.copy(o.hip); this.body.copy(o.body); this.brot.copy(o.brot); this.ground = o.ground; this.lock = o.lock; return this; } }
const _e = new E();
function toQ(P, out) {
  for (let i = 0; i < JOINTS.length; i++) { _e.set(P.r[i * 3], P.r[i * 3 + 1], P.r[i * 3 + 2], ORDER[JOINTS[i]] || 'XYZ'); out.q[i].setFromEuler(_e); }
  out.hip.fromArray(P.hip); out.body.fromArray(P.body); _e.set(P.brot[0], P.brot[1], P.brot[2], 'XYZ'); out.brot.setFromEuler(_e); out.ground = P.ground; out.lock = P.lock; return out;
}
function blendQ(a, b, t, mask, out) { // out = slerp(a,b,t) per joint with per-joint mask (null = full)
  for (let i = 0; i < JOINTS.length; i++) { const w = mask ? (mask[i] ? t : 0) : t; out.q[i].copy(a.q[i]); if (w > 0) out.q[i].slerp(b.q[i], w); }
  const wf = mask && mask.noBody ? 0 : t; out.hip.lerpVectors(a.hip, b.hip, wf); out.body.lerpVectors(a.body, b.body, wf); out.brot.copy(a.brot).slerp(b.brot, wf); out.ground = lerp(a.ground, b.ground, wf); out.lock = lerp(a.lock, b.lock, wf); return out;
}
const MASKS = { full: null, upper: Object.assign(JOINTS.map((n) => UPPER_SET.has(n)), { noBody: true }) };

export class Animator {
  constructor(rig, weapon = 'unarmed') {
    this.rig = rig; this.t = 0; this.setWeapon(weapon);
    this.state = 'move'; this.stateT = 0; this.mv = { vx: 0, vz: 0, phase: 0, speed: 0 };
    this.armed = 0; this.armedTarget = weapon === 'unarmed' ? 0 : 1; this.alert = 0; this.alertTarget = 0;
    this.action = null; this.actionT = 0; this.actionW = 0; this.actionSpeed = 1; this.actionReleasing = false; this.actionFiredEvents = 0; this.actionMask = 'full';
    this.add = null; this.addT = 0; this.addAmp = 1; this.addDir = 1;
    this.snap = new QPose(); this.snapW = 0; this.snapDur = 0.15; this.last = new QPose(); this.hasLast = false;
    this.P = new Pose(); this.PA = new Pose(); this.PB = new Pose(); this.PC = new Pose(); this.QA = new QPose(); this.QB = new QPose(); this.QC = new QPose(); this.QAdd = new QPose();
    this.look = { target: null, w: 0 }; this.timeScale = 1; this.hitStopT = 0; this.onEvent = null; this.dead = false;
    this.groundFix = 0; this.ik = { hand: null }; this.finalGround = 1; this.finalLock = 1;
    this.restPos = new V3(0, DIM.hipY, 0); this.style = null; this.exert = 0; this.breath = 0; this.addSide = 0; this.addHigh = 0.5; this.add2 = null; this.add2T = 0; this.downKind = 'back';
  }
  setStyle(style) { this.style = style; this.setWeapon(this.weaponName); } // per-style victory pose; gear.js equipStyle calls it
  setWeapon(name) {
    this.weaponName = name; const st = WEAPON_POSES[name] || WEAPON_POSES.unarmed; this.stance = st; this.clips = buildStateClips(st, this.style);
    if (st.attacks) for (const n of ['attack1', 'attack2', 'attack3']) { const a = st.attacks[n]; this.clips[n] = attackClip(st.weapon, n, st, a); this.clips[n].weaponTwoHand = !!st.twoHand; }
    this.armedTarget = name === 'unarmed' ? 0 : 1;
  }
  // locomotion input: local velocity in m/s (vz forward, vx to character LEFT). Call every frame.
  setMove(vz, vx = 0) { this.mv.vz = vz; this.mv.vx = vx; }
  setAlert(v) { this.alertTarget = v ? 1 : 0; }
  // persistent full-body state: 'move' (idle/walk/run/strafe blend tree) or a clip name ('stun','victory','cheer','block' ...)
  setState(name, fade = 0.18) { if (name === this.state) return; this.snapshot(fade); this.state = name; this.stateT = 0; }
  snapshot(dur) { if (this.hasLast) { this.snap.copy(this.last); this.snapW = 1; this.snapDur = Math.max(0.01, dur); } }
  // one-shot or held action. opts: speed, mask('full'|'upper'|null=auto)
  play(name, o = {}) {
    const clip = this.clips[name]; if (!clip) throw new Error('no clip ' + name);
    if (clip.additive) { this.add = clip; this.addT = 0; this.addAmp = o.amp ?? 1; this.addDir = o.dir ?? 1; this.addSide = o.side ?? 0; this.addHigh = o.high ?? 0.5; this.add2 = this.addSide ? this.clips.hurtSide : null; this.add2T = 0; this.exert = Math.min(1, this.exert + 0.05 * this.addAmp); return clip; }
    this.snapshot(o.fade ?? (this.action ? 0.07 : 0.06)); this.action = clip; this.actionT = 0; this.actionSpeed = o.speed ?? 1; this.actionReleasing = false; this.actionW = 0; this.actionFired = 0;
    const moving = Math.hypot(this.mv.vx, this.mv.vz) > 0.6;
    this.actionMask = o.mask || (clip.name.startsWith('attack') || clip.name === 'taunt' ? (moving ? 'upper' : 'full') : clip.mask);
    if (clip.name.startsWith('attack') || clip.name === 'finisher') this.exert = Math.min(1, this.exert + (name === 'attack3' ? 0.16 : 0.09)); else if (/^(knockdown|stagger)/.test(name)) this.exert = Math.min(1, this.exert + 0.12);
    if (name.startsWith('death') || name === 'execDie') this.dead = true; return clip;
  }
  // ---- direction-aware helpers. dir = {x, z}: unit vector from the victim TOWARD the attacker in the victim's LOCAL frame (x = character left, z = forward);
  // rig.localDir(worldDx, worldDz) converts a world vector. A plain number keeps the old meaning (+1 hit from the front, -1 from behind).
  _dir(d) { if (d && typeof d === 'object') { const l = Math.hypot(d.x || 0, d.z || 0) || 1; return { x: (d.x || 0) / l, z: (d.z === undefined ? 1 : d.z) / l }; } return { x: 0, z: d === undefined ? 1 : (d < 0 ? -1 : 1) }; }
  /** additive flinch from a direction; high 0 = low blow (knees buckle), 1 = head blow (head snaps). */
  hurt(dir = 1, amp = 1, side, high) {
    const d = this._dir(dir); if (this.action && this.action.name === 'block') return this.play('blockHit', { dir: d.z < 0 ? -1 : 1, amp });
    return this.play('hurt', { dir: Math.abs(d.z) < 0.2 ? (d.z < 0 ? -1 : 1) * 0.35 : d.z, amp, side: side ?? (Math.abs(d.x) > 0.25 ? d.x : 0), high: high ?? (dir && dir.high !== undefined ? dir.high : 0.5) });
  }
  /** full-body stagger away from the blow (a few steps of lost balance, about 0.8 s). */
  stagger(dir = 1, amp = 1) { const d = this._dir(dir), n = Math.abs(d.z) >= Math.abs(d.x) ? (d.z >= 0 ? 'staggerBack' : 'staggerFwd') : (d.x > 0 ? 'staggerR' : 'staggerL'); this.play(n, { speed: 1 / Math.max(0.7, amp * 0.5 + 0.5) }); return n; }
  /** knocked down away from the blow (held); getUp() plays the matching rise. */
  knockdown(dir = 1) { const d = this._dir(dir), n = Math.abs(d.z) >= Math.abs(d.x) ? (d.z >= 0 ? 'knockdown' : 'knockdownFront') : (d.x > 0 ? 'knockdownR' : 'knockdownL'); this.downKind = n === 'knockdown' ? 'back' : n === 'knockdownFront' ? 'front' : n.slice(-1); this.play(n); return n; }
  getUp() { const k = this.downKind, n = k === 'back' ? 'getup' : k === 'front' ? 'getupFront' : 'getupSide' + k; this.play(n); return n; }
  /** death fall chosen by the blow: front blow = back fall (heavy: spin), rear blow = forward fall, side blow = side fall. */
  die(dir = 1, o = {}) { const d = this._dir(dir), n = Math.abs(d.z) >= Math.abs(d.x) * 0.8 ? (d.z >= 0 ? (o.heavy ? 'deathSpin' : 'deathBack') : 'deathFront') : (d.x > 0 ? 'deathR' : 'deathL'); this.play(n); return n; }
  /** finisher pair: attacker plays finisher() (events swing / hit / end, hit at clipInfo('finisher').hitAt), victim plays executed() (kneels, held) then executeKill() on the hit event. Stand 0.9 m apart facing each other. */
  finisher(o = {}) { return this.play('finisher', o); }
  executed() { return this.play('execKneel'); }
  executeKill() { return this.play('execDie'); }
  release(fade = 0.18) { if (this.action && this.action.hold && !this.dead) { this.snapshot(fade); this.action = null; } }
  hitStop(dur = 0.06) { this.hitStopT = dur; }
  clipInfo(name) { const c = this.clips[name]; return c ? { dur: c.dur, loop: c.loop, hold: c.hold, ...(c.info || {}) } : null; }
  fire(n, clip) { if (this.onEvent) this.onEvent(n, clip); if (this.rig.onEvent) this.rig.onEvent(n, clip); }

  ctx() { return { armed: this.armed, alert: this.alert, stance: this.stance, exert: this.exert, breath: this.breath }; }
  sampleBase(P) {
    const c = this.ctx(), mv = this.mv, s = Math.hypot(mv.vx, mv.vz), t = this.t;
    if (this.state !== 'move') { const clip = this.clips[this.state]; if (clip) return clip.sample(this.stateT, P); }
    if (s < 0.05 && Math.abs(this.mv.phase) < 1e9) { return idleSample(t, P, c); }
    const walkW = smooth(0.15, 1.1, s) * (1 - smooth(2.6, 4.4, s)), runW = smooth(2.6, 4.4, s), idleW = 1 - smooth(0.15, 1.1, s);
    const side = Math.abs(mv.vx) / (s + 1e-4), back = mv.vz < -0.05;
    const ph = this.mv.phase;
    idleSample(t, this.PA, c);
    P.copy(this.PA); if (idleW < 1) {
      const gw = (1 - idleW);
      gaitSample(this.PB, ph, GAITS.walk, c, back); gaitSample(this.PC, ph, GAITS.run, c, back);
      const gait = this.PB; gait.mix(this.PB, this.PC, runW / (walkW + runW + 1e-4));
      if (side > 0.05) { strafeSample(this.PC, ph, Math.sign(mv.vx), c); gait.mix(gait, this.PC, smooth(0.15, 0.95, side)); }
      // armed: keep weapon arm in guard but let the gait add a little sway
      if (c.armed > 0.01) applyArmed(gait, c, c.armed * 0.9);
      P.mix(this.PA, gait, gw);
    }
    return P;
  }
  update(dt) {
    if (this.hitStopT > 0) { this.hitStopT -= dt; dt *= 0.04; }
    dt *= this.timeScale; this.t += dt; this.stateT += dt;
    { const sp = Math.hypot(this.mv.vx, this.mv.vz); this.exert = clamp(this.exert + (sp > 2.6 ? 0.03 : sp > 0.4 ? 0.006 : 0) * dt * 10 - 0.035 * dt, 0, 1); this.breath += dt * Math.PI * 2 / 3.4 * (1 + 1.6 * this.exert) * (this.dead ? 0 : 1); }
    this.armed += (this.armedTarget - this.armed) * Math.min(1, dt * 6); this.alert += ((this.alertTarget || this.armedTarget * 0.0) - this.alert) * Math.min(1, dt * 5);
    // advance gait phase by distance travelled: foot speed matches ground speed (no skating)
    const s = Math.hypot(this.mv.vx, this.mv.vz), runW = smooth(2.6, 4.4, s), stride = lerp(1.55, 2.9, runW), dirSign = this.mv.vz < -0.05 && Math.abs(this.mv.vz) > Math.abs(this.mv.vx) ? -1 : 1;
    const prev = this.mv.phase; this.mv.phase += dirSign * (s / stride) * Math.PI * 2 * dt;
    if (s > 0.3) { const a = Math.floor(prev / Math.PI + 0.5), b = Math.floor(this.mv.phase / Math.PI + 0.5); if (a !== b) this.fire('step', { side: ((b % 2) + 2) % 2 ? 'L' : 'R' }); }
    // base
    this.sampleBase(this.P); toQ(this.P, this.QA);
    let out = this.QA;
    // action layer
    if (this.action) {
      const clip = this.action; this.actionT += dt * this.actionSpeed; const dur = clip.dur;
      while (this.actionFired < clip.events.length && this.actionT >= clip.events[this.actionFired].t) { this.fire(clip.events[this.actionFired].name, clip); this.actionFired++; }
      if (!clip.hold && this.actionT >= dur) { this.snapshot(clip.fadeOut); this.fire('end', clip); this.action = null; }
      else {
        clip.sample(this.actionT, this.PB); toQ(this.PB, this.QB);
        const fin = clip.fadeIn; this.actionW = clip.hold || this.actionT < dur - clip.fadeOut ? smooth(0, fin, this.actionT) : smooth(0, clip.fadeOut, dur - this.actionT) ;
        if (clip.hold) this.actionW = Math.min(1, this.actionT / Math.max(0.001, fin));
        const mask = MASKS[this.actionMask];
        // upper-mask attacks need the legs from base; add lunge only from full-mask
        out = blendQ(this.QA, this.QB, this.actionW, mask, this.QC); if (mask) { out.body.copy(this.QA.body); out.hip.copy(this.QA.hip); }
      }
    }
    // snapshot crossfade (inertial blend from the pose we left)
    if (this.snapW > 0) { this.snapW = Math.max(0, this.snapW - dt / this.snapDur); const w = ease.inOutCubic(this.snapW); if (out !== this.QC) { this.QC.copy(out); out = this.QC; } blendQ(this.QC, this.snap, w, null, this.QB); out = this.QB; }
    // additive layer (hurt flinch)
    if (this.add) {
      this.addT += dt; const clip = this.add, hi = this.addHigh;
      if (this.addT >= clip.dur) { this.add = null; this.add2 = null; } else {
        clip.sample(this.addT, this.PB);
        const amp = this.addAmp, d = this.addDir; // d>0: hit from front (recoil back); d<0 from behind (lurch forward)
        for (let i = 0; i < JOINTS.length; i++) {
          const jn = JOINTS[i], hipJ = jn.startsWith('hip') && jn.length === 4, fh = (jn === 'head' || jn === 'neck') ? 0.6 + 0.9 * hi : (jn.startsWith('knee') || hipJ) ? 1 + (0.5 - hi) * 1.2 : 1;
          this.PB.r[i * 3] *= amp * fh * (hipJ ? 1 : d); this.PB.r[i * 3 + 1] *= amp; this.PB.r[i * 3 + 2] *= amp;
        }
        this.PB.hip[2] *= amp * d; this.PB.hip[1] *= amp;
        if (this.add2 && this.addSide) { // lateral layer: twist and roll away from the side the blow came from
          const c2 = this.add2, s = Math.sign(this.addSide), f = amp * Math.min(1, Math.abs(this.addSide)); c2.sample(Math.min(this.addT, c2.dur), this.PA);
          for (let i = 0; i < JOINTS.length; i++) { this.PB.r[i * 3] += this.PA.r[i * 3] * f; this.PB.r[i * 3 + 1] += this.PA.r[i * 3 + 1] * f * s; this.PB.r[i * 3 + 2] += this.PA.r[i * 3 + 2] * f * s; }
          this.PB.hip[0] += this.PA.hip[0] * f * s;
        }
        for (let i = 0; i < JOINTS.length; i++) { _e.set(this.PB.r[i * 3], this.PB.r[i * 3 + 1], this.PB.r[i * 3 + 2], ORDER[JOINTS[i]] || 'XYZ'); this.QAdd.q[i].setFromEuler(_e); }
        if (out !== this.QB) { this.QB.copy(out); out = this.QB; }
        for (let i = 0; i < JOINTS.length; i++) out.q[i].multiply(this.QAdd.q[i]);
        out.hip.x += this.PB.hip[0]; out.hip.y += this.PB.hip[1]; out.hip.z += this.PB.hip[2];
      }
    }
    this.last.copy(out); this.hasLast = true;
    // write to joints
    const J = this.rig.joints;
    for (let i = 0; i < JOINTS.length; i++) J[JOINTS[i]].quaternion.copy(out.q[i]);
    // head look-at (additive yaw split neck/head)
    if (this.look.target && this.look.w > 0) {
      _w.copy(this.look.target); this.rig.body.worldToLocal(_w); let yaw = Math.atan2(_w.x, _w.z); yaw = clamp(yaw, -1.0, 1.0) * this.look.w;
      _q.setFromAxisAngle(_u.set(0, 1, 0), yaw * 0.4); J.neck.quaternion.premultiply(_q); _q.setFromAxisAngle(_u.set(0, 1, 0), yaw * 0.5); J.head.quaternion.premultiply(_q);
    }
    J.hips.position.set(this.restPos.x + out.hip.x, this.restPos.y + out.hip.y, this.restPos.z + out.hip.z);
    this.rig.body.position.copy(out.body); this.rig.body.quaternion.copy(out.brot);
    this.finalGround = out.ground; this.finalLock = out.lock;
    this.groundSmooth = this.groundSmooth ?? 0;
    this._dt = dt;
  }
  // after FK is applied and matrices updated: hand-on-weapon IK, ground plant + foot level IK
  postIK() {
    const rig = this.rig, J = rig.joints, body = rig.body, st = this.stance;
    // left hand grips the weapon's second grip (two-handed spears)
    const tgt = this.ik.hand && this.ik.hand.target; const w = this.ik.hand ? this.ik.hand.w * (this.ik.hand.fade ?? 1) : 0;
    if (tgt && w > 0) {
      const side = this.ik.hand.side || 'L', sg = side === 'L' ? 1 : -1;
      tgt.updateWorldMatrix(true, false); _w.setFromMatrixPosition(tgt.matrixWorld);
      if (this.ik.hand.slide !== false) { // slide the front hand along the shaft to the farthest point it can reach (real spear grip behaviour)
        const wp = tgt.parent; wp.updateWorldMatrix(true, false); _t.setFromMatrixPosition(wp.matrixWorld); _u.set(0, 1, 0).transformDirection(wp.matrixWorld);
        _p.setFromMatrixPosition(J['shoulder' + side].matrixWorld); _x.copy(_t).sub(_p); const bb = _x.dot(_u), cc = _x.lengthSq() - (this.ik.hand.reach ?? 0.5) ** 2, disc = bb * bb - cc;
        let sl = disc >= 0 ? -bb + Math.sqrt(disc) : -bb; sl = clamp(sl, 0.1, Math.max(0.2, tgt.position.y * 1.4));
        const h = this.ik.hand; h.s = h.s === undefined ? sl : h.s + (sl - h.s) * Math.min(1, (this._dt || 0.016) * 14); _w.copy(_t).addScaledVector(_u, h.s);
      }
      this.ik.hand.lastTarget = (this.ik.hand.lastTarget || new V3()).copy(_w);
      _pp.set(sg * 0.5, -0.3, -0.7); J.chest.localToWorld(_pp);
      solveTwoBone(J['shoulder' + side], J['elbow' + side], J['wrist' + side], _w, _pp, -1, w, 0.0);
      J.chest.updateMatrixWorld(true);
    }
    if (this.finalGround < 0.5) { this.groundFix = 0; return; }
    // lowest ankle in body space
    let minY = 1e9; const bi = _inv.copy(body.matrixWorld).invert(); const sc = rig.build.height;
    const feet = ['L', 'R'];
    for (const s of feet) { _w.setFromMatrixPosition(J['ankle' + s].matrixWorld).applyMatrix4(bi); minY = Math.min(minY, _w.y / sc); }
    const want = (DIM.footH - minY) * this.finalLock; const k = Math.min(1, (this._dt || 0.016) * 22);
    this.groundFix += (clamp(want, -0.18, 0.12) - this.groundFix) * k;
    J.hips.position.y += this.groundFix; J.hips.updateMatrixWorld(true);
    const flatQ = new Q(), kq = new Q(), bq = new Q();
    for (const s of feet) {
      const ankle = J['ankle' + s], knee = J['knee' + s];
      _w.setFromMatrixPosition(ankle.matrixWorld).applyMatrix4(bi); const y = _w.y / sc;
      if (y < DIM.footH - 0.003) { // foot below floor: IK it up
        _w.y = DIM.footH * sc; _w.applyMatrix4(body.matrixWorld);
        _pp.set(0, -0.2, 1.0); J['hip' + s].localToWorld(_pp); // knee points forward
        solveTwoBone(J['hip' + s], knee, ankle, _w, _pp, 1, 1); J['hip' + s].updateMatrixWorld(true);
        _w.setFromMatrixPosition(ankle.matrixWorld).applyMatrix4(bi);
      }
      // foot flat on the floor while near it (yaw taken from FK), blend back to FK when lifted
      ankle.getWorldQuaternion(kq); _u.set(0, 0, 1).applyQuaternion(kq); const yaw = Math.atan2(_u.x, _u.z);
      bq.setFromAxisAngle(_y.set(0, 1, 0), yaw);
      knee.getWorldQuaternion(kq); flatQ.copy(kq).invert().multiply(bq);
      const flatW = 1 - smooth(DIM.footH + 0.02, DIM.footH + 0.12, _w.y / sc);
      ankle.quaternion.slerp(flatQ, flatW * this.finalGround);
    }
  }
}

// ---------------------------------------------------------------- utility
export function triCount(obj) { let n = 0; obj.traverse((o) => { if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n | 0; }
// Pose-sheet helper: sample clip at time t into rig joints without advancing state (for debugging / lab sheets).
export function poseAt(rig, clipName, t) {
  const a = rig.animator; const clip = a.clips[clipName]; const P = new Pose(); clip.sample(t, P);
  const q = toQ(P, new QPose()); for (let i = 0; i < JOINTS.length; i++) rig.joints[JOINTS[i]].quaternion.copy(q.q[i]);
  rig.joints.hips.position.set(0, DIM.hipY + P.hip[1], P.hip[2]); rig.body.position.fromArray(P.body); rig.body.quaternion.setFromEuler(new E(P.brot[0], P.brot[1], P.brot[2]));
  a.finalGround = P.ground; a.finalLock = P.lock; a.groundFix = 0; rig.root.updateMatrixWorld(true); a._dt = 1; a.postIK(); rig.root.updateMatrixWorld(true); for (const f of rig.postUpdate) f(rig);
}
