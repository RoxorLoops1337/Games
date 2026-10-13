// Ludus Maximus 3D: procedural beasts for the Venatio (lion, wolf, bear, boar, Nemean lion, war elephant with handler).
// Same contract as a gladiator rig where fightview, gore.js and the portrait renderer touch it:
//   const rig = createBeast(unitOrRecord, { detail: 'low'|'medium'|'high', scale });
//   rig.root (place + yaw), rig.update(dt), rig.animator { setMove, setState, play, release, hurt, stagger, knockdown, getUp, die, hitStop, clipInfo, dead, onEvent },
//   rig.flash, rig.squashKick, rig.localDir, rig.setPalette, rig.resetSecondary, rig.dispose,
//   gore: rig.joints.{chest,head,hipL,kneeL,ankleL...}, addBlood, setBlood, addWound, clearBlood, jointRest, severed {}, sever() -> null (beasts are not dismembered)
//   extras: rig.beast (kind), rig.nameH (nameplate / camera height in metres), rig.beastR (body radius), rig.triangles(), rig.drawCalls()
// Skinned single mesh per material (fur, bone, eye, + leather / cloth / skin / metal for the elephant handler): <= 8 draw calls, <= 2500 triangles on high.
// Skeleton names reuse the humanoid ones (hips, spine, chest, neck, head, shoulderL/R = front upper leg, elbow, wrist = front paw, hipL/R = hind thigh, knee, ankle = hind paw)
// so the blood / wound / footprint code in gore.js works unchanged.
import * as THREE from 'three';
import { makeBloodUniforms, shadePatch, Spring1, clamp, lerp, smooth } from './rig.js';
import { detailFor } from './gladiator.js';

const V3 = THREE.Vector3, TAU = Math.PI * 2;
const hexC = (h) => new THREE.Color(h);
const mix = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));
const sm = (a, b, x) => smooth(a, b, x);

// ------------------------------------------------------------------ geometry kit (local joint frame, +Z forward, +Y up, +X left)
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
/** smooth tube along a polyline. radii[i] = r | [lateral, other]. Closed with rounded caps. Winding is fixed up automatically. */
function tube(pts, radii, seg = 6, caps = [true, true]) {
  const R = pts.length, P = [], N = [], I = [], T = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(R - 1, i + 1)]; return new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); });
  for (let i = 0; i < R; i++) {
    const t = T[i], up = Math.abs(t.y) > 0.9 ? new V3(0, 0, 1) : new V3(0, 1, 0), s = new V3().crossVectors(t, up).normalize(), v = new V3().crossVectors(s, t).normalize();
    const rr = radii[i], rx = Array.isArray(rr) ? rr[0] : rr, ry = Array.isArray(rr) ? rr[1] : rr;
    for (let a = 0; a < seg; a++) {
      const an = a / seg * TAU, c = Math.cos(an), sn = Math.sin(an), n = new V3().addScaledVector(s, c / rx).addScaledVector(v, sn / ry).normalize();
      P.push(pts[i][0] + s.x * c * rx + v.x * sn * ry, pts[i][1] + s.y * c * rx + v.y * sn * ry, pts[i][2] + s.z * c * rx + v.z * sn * ry); N.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < R - 1; i++) for (let a = 0; a < seg; a++) { const a0 = i * seg + a, a1 = i * seg + (a + 1) % seg, b0 = (i + 1) * seg + a, b1 = (i + 1) * seg + (a + 1) % seg; I.push(a0, b0, a1, a1, b0, b1); }
  const cap = (i, dir) => {
    const rr = radii[i], r = Array.isArray(rr) ? Math.min(rr[0], rr[1]) : rr, c = P.length / 3, t = T[i];
    P.push(pts[i][0] + t.x * dir * r * 0.75, pts[i][1] + t.y * dir * r * 0.75, pts[i][2] + t.z * dir * r * 0.75); N.push(t.x * dir, t.y * dir, t.z * dir);
    for (let a = 0; a < seg; a++) { const a0 = i * seg + a, a1 = i * seg + (a + 1) % seg; if (dir > 0) I.push(a0, a1, c); else I.push(a1, a0, c); }
  };
  if (caps[0]) cap(0, -1); if (caps[1]) cap(R - 1, 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
  // fix winding: face normals must agree with the vertex normals
  let agree = 0; const pa = g.attributes.position, A = new V3(), B = new V3(), C = new V3(), n = new V3();
  for (let k = 0; k < I.length; k += 3) { A.fromBufferAttribute(pa, I[k]); B.fromBufferAttribute(pa, I[k + 1]); C.fromBufferAttribute(pa, I[k + 2]); n.crossVectors(B.sub(A), C.sub(A)); agree += n.x * N[I[k] * 3] + n.y * N[I[k] * 3 + 1] + n.z * N[I[k] * 3 + 2]; }
  if (agree < 0) { for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; } g.setIndex(I); }
  return g;
}

// ------------------------------------------------------------------ species definitions (metres, unit size; +Z forward)
// front/hind chains: offsets are relative to the parent joint, so the rest pose is a real bent leg. hipsY / chestY are derived so the paws stand on y=0.
const LION = {
  id: 'lion', ears: 'round', head: { sk: [0.19, 0.17, 0.22], sn: [0.105, 0.085, 0.2], jaw: 0.21 }, neck: [0.1, 0.25], hd: [-0.01, 0.2], jawAt: [-0.075, 0.13], earAt: [0.125, 0.16, -0.02],
  torso: { hipsZ: -0.55, chestZ: 0.45, rump: [0.22, 0.25], mid: [0.22, 0.27], chest: [0.27, 0.34], len: 0.34 },
  front: { dx: 0.19, sy: -0.13, sz: 0.1, up: [-0.26, -0.01], lo: [-0.27, 0.04], pad: 0.14, r: [0.125, 0.1, 0.075], paw: [0.09, 0.07, 0.13] },
  hind: { dx: 0.18, hy: -0.14, hz: -0.02, up: [-0.25, 0.13], lo: [-0.2, -0.12], pad: 0.17, r: [0.175, 0.105, 0.06], paw: [0.08, 0.06, 0.12] },
  tail: { n: 3, len: 0.32, r: 0.032, at: [0.0, 0.06, -0.3], tuft: 0.07 }, eye: '#d9a21b', fur: '#c69a52', belly: '#e8d3a2', dark: '#5a3b1c', mane: '#5a3418', nose: '#3a2420',
  gait: { walkV: 1.5, runV: 5.2, strideW: 1.5, strideR: 4.4, ampW: 0.42, ampR: 0.85 }, size: 1, h: 1.5, r: 0.95, hasMane: true, nameH: 1.75,
};
const WOLF = {
  id: 'wolf', ears: 'point', head: { sk: [0.1, 0.1, 0.14], sn: [0.055, 0.05, 0.17], jaw: 0.17 }, neck: [0.08, 0.2], hd: [-0.02, 0.2], jawAt: [-0.05, 0.1], earAt: [0.065, 0.1, -0.03],
  torso: { hipsZ: -0.42, chestZ: 0.34, rump: [0.14, 0.18], mid: [0.14, 0.17], chest: [0.17, 0.235], len: 0.28 },
  front: { dx: 0.12, sy: -0.11, sz: 0.06, up: [-0.22, 0.0], lo: [-0.24, 0.03], pad: 0.11, r: [0.075, 0.056, 0.044], paw: [0.055, 0.05, 0.085] },
  hind: { dx: 0.115, hy: -0.12, hz: 0, up: [-0.21, 0.1], lo: [-0.2, -0.1], pad: 0.15, r: [0.11, 0.065, 0.04], paw: [0.052, 0.05, 0.08] },
  tail: { n: 3, len: 0.2, r: 0.04, at: [0.0, 0.05, -0.2], tuft: 0.06 }, eye: '#e0b030', fur: '#7d838d', belly: '#d8d4c8', dark: '#3a3d44', mane: '#5f646d', nose: '#171414',
  gait: { walkV: 1.6, runV: 6.2, strideW: 1.1, strideR: 3.4, ampW: 0.45, ampR: 0.9 }, size: 1, h: 0.95, r: 0.6, nameH: 1.25, ruff: true,
};
const BEAR = {
  id: 'bear', ears: 'round', head: { sk: [0.18, 0.16, 0.2], sn: [0.1, 0.085, 0.17], jaw: 0.18 }, neck: [0.1, 0.3], hd: [-0.04, 0.26], jawAt: [-0.08, 0.1], earAt: [0.13, 0.15, -0.04],
  torso: { hipsZ: -0.6, chestZ: 0.5, rump: [0.27, 0.3], mid: [0.29, 0.31], chest: [0.31, 0.36], len: 0.4 },
  front: { dx: 0.25, sy: -0.16, sz: 0.1, up: [-0.36, 0.0], lo: [-0.38, 0.05], pad: 0.15, r: [0.14, 0.11, 0.09], paw: [0.1, 0.07, 0.14] },
  hind: { dx: 0.24, hy: -0.18, hz: 0, up: [-0.32, 0.12], lo: [-0.3, -0.1], pad: 0.18, r: [0.17, 0.11, 0.075], paw: [0.095, 0.07, 0.13] },
  tail: { n: 1, len: 0.14, r: 0.05, at: [0.0, 0.1, -0.3], tuft: 0 }, eye: '#2a1810', fur: '#5b3d28', belly: '#7a5a3c', dark: '#2c1d12', mane: '#46301f', nose: '#161010',
  gait: { walkV: 1.4, runV: 4.6, strideW: 1.6, strideR: 3.8, ampW: 0.38, ampR: 0.68 }, size: 1.1, h: 1.9, r: 1.1, nameH: 2.1, hump: true,
};
const BOAR = {
  id: 'boar', ears: 'flap', head: { sk: [0.17, 0.16, 0.2], sn: [0.1, 0.09, 0.22], jaw: 0.2 }, neck: [0.02, 0.2], hd: [-0.12, 0.2], jawAt: [-0.09, 0.14], earAt: [0.11, 0.14, -0.02],
  torso: { hipsZ: -0.46, chestZ: 0.4, rump: [0.23, 0.25], mid: [0.25, 0.28], chest: [0.3, 0.36], len: 0.34 },
  front: { dx: 0.19, sy: -0.15, sz: 0.08, up: [-0.2, 0.0], lo: [-0.22, 0.03], pad: 0.1, r: [0.115, 0.08, 0.06], paw: [0.065, 0.06, 0.1] },
  hind: { dx: 0.18, hy: -0.15, hz: 0, up: [-0.18, 0.08], lo: [-0.18, -0.08], pad: 0.12, r: [0.14, 0.085, 0.052], paw: [0.065, 0.06, 0.09] },
  tail: { n: 2, len: 0.14, r: 0.018, at: [0.0, 0.1, -0.22], tuft: 0.03 }, eye: '#2a1810', fur: '#64513f', belly: '#8a7660', dark: '#2a211b', mane: '#2a211b', nose: '#a8756a',
  gait: { walkV: 1.5, runV: 5.0, strideW: 1.3, strideR: 3.4, ampW: 0.4, ampR: 0.78 }, size: 1.2, h: 1.4, r: 0.95, nameH: 1.6, bristle: true, tusks: true,
};
const SPECIES = { lion: LION, wolf: WOLF, bear: BEAR, boar: BOAR };
SPECIES.nemean = Object.assign({}, LION, { id: 'nemean', size: 1.75, fur: '#d9b24a', belly: '#f0dc9a', dark: '#6a4a1e', mane: '#3b2412', eye: '#ff9a20', nose: '#2a1a14', h: 2.7, r: 1.7, nameH: 3.0, gold: true, scars: true });

const ELEPHANT = {
  id: 'elephant', ears: 'big', head: { sk: [0.3, 0.34, 0.34], sn: [0.14, 0.14, 0.2], jaw: 0 }, neck: [0.12, 0.45], hd: [0.18, 0.4], jawAt: [-0.1, 0.1], earAt: [0.3, 0.2, -0.12],
  torso: { hipsZ: -0.95, chestZ: 0.85, rump: [0.58, 0.64], mid: [0.64, 0.7], chest: [0.62, 0.7], len: 0.7 },
  front: { dx: 0.42, sy: -0.35, sz: 0.0, up: [-0.55, 0.0], lo: [-0.6, 0.0], pad: 0.12, r: [0.33, 0.27, 0.23], paw: [0.23, 0.09, 0.25] },
  hind: { dx: 0.42, hy: -0.32, hz: 0, up: [-0.5, 0.1], lo: [-0.55, -0.1], pad: 0.12, r: [0.36, 0.27, 0.22], paw: [0.23, 0.09, 0.25] },
  tail: { n: 2, len: 0.45, r: 0.045, at: [0.0, 0.1, -0.5], tuft: 0.07 }, eye: '#2a1a10', fur: '#8a8782', belly: '#a09b92', dark: '#5f5c58', mane: '#5f5c58', nose: '#6a6560',
  gait: { walkV: 1.6, runV: 6.5, strideW: 2.4, strideR: 5.2, ampW: 0.32, ampR: 0.5, pace: true }, size: 1, h: 4.4, r: 2.2, nameH: 4.9, trunk: true, rider: true,
};
SPECIES.elephant = ELEPHANT;

// ------------------------------------------------------------------ materials
const FURK = {
  wolf: { grain: 0.34, sc: 44, salt: 0.3 }, lion: { grain: 0.22, sc: 38, salt: 0.12 }, bear: { grain: 0.36, sc: 32, salt: 0.18 }, boar: { grain: 0.4, sc: 56, salt: 0.2, bristle: 1 },
  nemean: { grain: 0.16, sc: 34, salt: 0.1, glint: 1 }, elephant: { grain: 0.1, sc: 30, wrinkle: 1 },
};
function furMaterial(id, bu, shadeKind = 'cloth') {
  const F = FURK[id] || FURK.lion, f = (n) => (+n).toFixed(3);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: id === 'elephant' ? 0.9 : 0.84, metalness: 0, vertexColors: true });
  shadePatch(m, shadeKind, { blood: bu, gash: true });
  const orig = m.onBeforeCompile, key0 = m.customProgramCacheKey;
  const code = `{ vec3 fp = vBP;
  float f1 = bn(fp * ${f(F.sc)} + 3.1), f2 = bn(fp * ${f(F.sc * 3.1)} + 9.7);
  float grain = 1.0 - ${f(F.grain)} * 0.5 + ${f(F.grain)} * (0.62 * f1 + 0.38 * f2);
  diffuseColor.rgb *= grain;
  ${F.salt ? `diffuseColor.rgb *= 1.0 - ${f(F.salt)} * smoothstep(0.62, 0.9, f2);` : ''}
  ${F.bristle ? `float bs = smoothstep(0.55, 0.85, sin(fp.z * 26.0 + bn(fp * 6.0) * 3.0) * 0.5 + 0.5) * smoothstep(0.55, 0.9, fp.y) * smoothstep(0.25, 0.0, abs(fp.x)); diffuseColor.rgb *= 1.0 - 0.45 * bs;` : ''}
  ${F.wrinkle ? `float wr = sin(fp.y * 70.0 + bn(fp * 9.0) * 5.0) * 0.5 + 0.5; diffuseColor.rgb *= 0.86 + 0.14 * wr; diffuseColor.rgb *= 0.9 + 0.1 * bn(fp * 120.0);` : ''}
  ${F.glint ? `diffuseColor.rgb += vec3(0.12, 0.08, 0.01) * pow(bn(fp * 42.0), 5.0) * 1.2;` : ''}
}`;
  m.onBeforeCompile = (sh) => { orig(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + code); };
  m.customProgramCacheKey = () => key0() + '-bf' + id; return m;
}
function plainMat(color, kind, rough, metal, bu, blood = true, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true, side: o.ds ? THREE.DoubleSide : THREE.FrontSide, flatShading: !!o.flat });
  shadePatch(m, kind, blood ? { blood: bu, gash: false } : {}); if (kind === 'eye') { m.emissive = new THREE.Color(o.glow || 0x000000); m.userData.base = m.emissive.clone(); } return m;
}

// ------------------------------------------------------------------ clip tables (authored, sparse: only the channels a clip names are overridden)
const JN = ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'earL', 'earR', 'tail1', 'tail2', 'tail3', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR', 'trunk1', 'trunk2', 'trunk3', 'trunk4', 'rider', 'riderArm'];
const JI = {}; JN.forEach((n, i) => { JI[n] = i; });
// PERF: channel offsets resolved once (the per-frame code used string concatenation, array literals and closures for these)
const LEG_I = [['shoulderL', 'elbowL', 'wristL'], ['shoulderR', 'elbowR', 'wristR'], ['hipL', 'kneeL', 'ankleL'], ['hipR', 'kneeR', 'ankleR']].map((r) => r.map((n) => JI[n] * 3));
const TAIL_I = [1, 2, 3].map((i) => JI['tail' + i] * 3), TRUNK_I = [1, 2, 3, 4].map((i) => JI['trunk' + i] * 3), EAR_I = [JI.earL * 3, JI.earR * 3], REST_I = [[JI.elbowL * 3, JI.wristL * 3, JI.kneeL * 3, JI.ankleL * 3], [JI.elbowR * 3, JI.wristR * 3, JI.kneeR * 3, JI.ankleR * 3]];
const NB = JN.length * 3, BODY = ['bodyY', 'bodyZ', 'bodyP', 'bodyR', 'bodyW']; // body channels follow the joints
const CH = {}; JN.forEach((n, i) => { CH[n] = i * 3; }); BODY.forEach((n, i) => { CH[n] = NB + i; });
const NCH = NB + BODY.length;
const EASE = { lin: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), cub: (t) => t * t * t, back: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
/** keys: [[t, {chan: value | [x,y,z]}, ease?], ...]; ease applies to the segment ARRIVING at that key. info: {swing, hit, recover} seconds. */
function clip(name, dur, keys, o = {}) {
  const chans = new Map();
  for (const [t, pose, ez] of keys) for (const k in pose) {
    const v = pose[k], base = CH[k]; if (base === undefined) throw new Error('beast clip channel ' + k);
    if (Array.isArray(v)) v.forEach((x, i) => { const c = base + i; if (!chans.has(c)) chans.set(c, []); chans.get(c).push([t, x, ez || 'io']); });
    else { if (!chans.has(base)) chans.set(base, []); chans.get(base).push([t, v, ez || 'io']); }
  }
  for (const a of chans.values()) a.sort((p, q) => p[0] - q[0]);
  return Object.assign({ name, dur, chans, chI: [...chans.keys()], chK: [...chans.values()], fi: 0.08, fo: 0.16, hold: false, swing: 0, hit: 0, recover: dur * 0.7, add: false }, o);
}
function evalKeys(a, t) {
  if (t <= a[0][0]) return a[0][1]; const n = a.length;
  for (let i = 1; i < n; i++) if (t <= a[i][0]) { const p = a[i - 1], q = a[i], k = (t - p[0]) / Math.max(1e-5, q[0] - p[0]); return p[1] + (q[1] - p[1]) * EASE[q[2]](k); }
  return a[n - 1][1];
}
const R2 = (x) => x;

/** per species clip set. sc = body scale (bigger beasts move slower), lion style = default */
function clipsFor(sp) {
  const id = sp.id, C = {}, big = id === 'elephant', bear = id === 'bear', wolf = id === 'wolf', boar = id === 'boar', lion = id === 'lion' || id === 'nemean';
  const up = big ? 0.45 : 1; // elephants raise less
  // ---- bite: head cocks back with the jaw open, snaps forward, shuts
  C.bite = clip('bite', wolf ? 0.7 : 0.95, [
    [0, {}], [wolf ? 0.14 : 0.2, { neck: [-0.32, 0, 0], head: [-0.3, 0, 0], jaw: [0.85, 0, 0], chest: [-0.1, 0, 0], bodyZ: -0.1, bodyP: -0.04 }, 'out'],
    [wolf ? 0.24 : 0.3, { neck: [0.38, 0, 0], head: [0.15, 0, 0], jaw: [0.05, 0, 0], chest: [0.1, 0, 0], bodyZ: 0.3, bodyP: 0.06, shoulderL: [-0.35, 0, 0], shoulderR: [-0.35, 0, 0] }, 'cub'],
    [wolf ? 0.34 : 0.42, { neck: [0.22, 0, 0], head: [0.05, 0, 0], jaw: [0.0, 0, 0], bodyZ: 0.28, shoulderL: [-0.2, 0, 0], shoulderR: [-0.2, 0, 0] }, 'out'],
    [wolf ? 0.7 : 0.95, { neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], chest: [0, 0, 0], bodyZ: 0, bodyP: 0, shoulderL: [0, 0, 0], shoulderR: [0, 0, 0] }, 'io'],
  ], { swing: wolf ? 0.14 : 0.2, hit: wolf ? 0.27 : 0.33, recover: wolf ? 0.4 : 0.5, fo: 0.2 });
  // ---- claw / swipe: raise one paw, sweep it across
  const hi = bear ? -1.5 : -1.25;
  C.claw = clip('claw', 0.8, [
    [0, {}], [0.2, { chest: [-0.28 * up * 1.2, 0.18, 0], shoulderR: [hi, 0, 0.35], elbowR: [0.3, 0, 0], wristR: [0.5, 0, 0], neck: [-0.1, 0.2, 0], bodyZ: -0.05, bodyP: -0.08, shoulderL: [-0.1, 0, 0] }, 'out'],
    [0.31, { chest: [-0.18, -0.3, 0], shoulderR: [hi * 0.8, 0, -0.55], elbowR: [0.05, 0, 0], wristR: [0.2, 0, 0], neck: [0.05, -0.2, 0], bodyZ: 0.22, bodyP: 0.0 }, 'cub'],
    [0.46, { chest: [-0.05, -0.2, 0], shoulderR: [-0.6, 0, -0.3], elbowR: [0.3, 0, 0] }, 'out'],
    [0.8, { chest: [0, 0, 0], shoulderR: [0, 0, 0], elbowR: [0, 0, 0], wristR: [0, 0, 0], neck: [0, 0, 0], shoulderL: [0, 0, 0], bodyZ: 0, bodyP: 0 }, 'io'],
  ], { swing: 0.2, hit: 0.31, recover: 0.46 });
  // ---- swipe (bear / elephant swat): heavy two-handed sweep, mirrored claw
  C.swipe = clip('swipe', big ? 1.2 : 1.05, [
    [0, {}], [big ? 0.4 : 0.3, { chest: [-0.45 * up, 0.35, 0], shoulderL: [-1.5 * (big ? 0.4 : 1), 0, 0.5], shoulderR: [-1.0, 0, 0.3], neck: [-0.25, 0.3, 0], head: [-0.15, 0, 0], jaw: [0.5, 0, 0], bodyP: -0.15 * up, bodyZ: -0.12, trunk1: [-0.6, 0.6, 0], trunk2: [-0.4, 0.5, 0], trunk3: [-0.3, 0.4, 0] }, 'out'],
    [big ? 0.55 : 0.43, { chest: [-0.1, -0.5, 0], shoulderL: [-0.9, 0, -0.7], shoulderR: [-0.7, 0, -0.5], neck: [0.1, -0.4, 0], jaw: [0.1, 0, 0], bodyZ: 0.3, bodyP: 0.05, trunk1: [-0.1, -1.0, 0], trunk2: [-0.1, -0.9, 0], trunk3: [-0.1, -0.7, 0] }, 'cub'],
    [big ? 0.8 : 0.62, { chest: [0, -0.2, 0], bodyZ: 0.15 }, 'out'], [big ? 1.2 : 1.05, { chest: [0, 0, 0], shoulderL: [0, 0, 0], shoulderR: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], bodyZ: 0, bodyP: 0, trunk1: [0, 0, 0], trunk2: [0, 0, 0], trunk3: [0, 0, 0] }, 'io'],
  ], { swing: big ? 0.4 : 0.3, hit: big ? 0.55 : 0.43, recover: big ? 0.8 : 0.62 });
  C.swat = C.swipe;
  // ---- maul: bite and claw in one heavy combo
  C.maul = clip('maul', 1.25, [
    [0, {}], [0.22, { neck: [-0.4, 0, 0], head: [-0.3, 0, 0], jaw: [0.9, 0, 0], chest: [-0.3, 0, 0], shoulderL: [-1.1, 0, 0.3], shoulderR: [-1.1, 0, -0.3], bodyP: -0.15, bodyZ: -0.1 }, 'out'],
    [0.36, { neck: [0.42, 0, 0], head: [0.2, 0, 0], jaw: [0.0, 0, 0], chest: [0.12, 0, 0], shoulderL: [-0.6, 0, -0.4], shoulderR: [-0.6, 0, 0.4], bodyP: 0.08, bodyZ: 0.35 }, 'cub'],
    [0.62, { neck: [0.1, 0.3, 0], chest: [-0.1, 0.35, 0], shoulderL: [-1.2, 0, 0.35], shoulderR: [-0.3, 0, 0], bodyZ: 0.2 }, 'io'],
    [0.78, { neck: [0.1, -0.3, 0], chest: [-0.05, -0.35, 0], shoulderL: [-0.5, 0, -0.5], bodyZ: 0.3 }, 'cub'],
    [1.25, { neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], chest: [0, 0, 0], shoulderL: [0, 0, 0], shoulderR: [0, 0, 0], bodyP: 0, bodyZ: 0 }, 'io'],
  ], { swing: 0.22, hit: 0.36, recover: 0.8 });
  // ---- gore (boar): head down, hook up
  C.gore = clip('gore', 0.85, [
    [0, {}], [0.16, { neck: [0.55, 0, 0], head: [0.35, 0, 0], chest: [0.1, 0, 0], bodyZ: -0.12, shoulderL: [0.3, 0, 0], shoulderR: [0.3, 0, 0] }, 'out'],
    [0.26, { neck: [-0.5, 0, 0], head: [-0.45, 0, 0], chest: [-0.05, 0, 0], bodyZ: 0.3, shoulderL: [-0.4, 0, 0], shoulderR: [-0.4, 0, 0] }, 'cub'],
    [0.5, { neck: [-0.15, 0, 0], head: [-0.1, 0, 0], bodyZ: 0.2 }, 'out'], [0.85, { neck: [0, 0, 0], head: [0, 0, 0], chest: [0, 0, 0], bodyZ: 0, shoulderL: [0, 0, 0], shoulderR: [0, 0, 0] }, 'io'],
  ], { swing: 0.16, hit: 0.28, recover: 0.5 });
  // ---- pounce: crouch (sim windup 0.38), leap, crash down, recover. Body height arc is part of the clip.
  C.pounce = clip('pounce', 1.5, [
    [0, {}],
    [0.34, { bodyY: -0.2 * sp.size, bodyP: 0.12, chest: [0.22, 0, 0], neck: [0.15, 0, 0], head: [-0.1, 0, 0], shoulderL: [0.55, 0, 0], shoulderR: [0.55, 0, 0], elbowL: [1.05, 0, 0], elbowR: [1.05, 0, 0], hipL: [-0.55, 0, 0], hipR: [-0.55, 0, 0], kneeL: [1.2, 0, 0], kneeR: [1.2, 0, 0], ankleL: [-0.5, 0, 0], ankleR: [-0.5, 0, 0], tail1: [-0.2, 0, 0], jaw: [0.2, 0, 0] }, 'out'],
    [0.5, { bodyY: 0.5 * sp.size, bodyZ: 0.5 * sp.size, bodyP: -0.18, chest: [-0.2, 0, 0], neck: [-0.15, 0, 0], head: [0.05, 0, 0], jaw: [0.9, 0, 0], shoulderL: [-1.25, 0, 0.3], shoulderR: [-1.25, 0, -0.3], elbowL: [0.1, 0, 0], elbowR: [0.1, 0, 0], wristL: [0.4, 0, 0], wristR: [0.4, 0, 0], hipL: [0.7, 0, 0], hipR: [0.7, 0, 0], kneeL: [0.1, 0, 0], kneeR: [0.1, 0, 0], ankleL: [0.5, 0, 0], ankleR: [0.5, 0, 0], tail1: [0.3, 0, 0] }, 'out'],
    [0.7, { bodyY: 0.1 * sp.size, bodyZ: 0.7 * sp.size, bodyP: 0.12, chest: [0.1, 0, 0], neck: [0.35, 0, 0], jaw: [0.1, 0, 0], shoulderL: [-1.0, 0, 0.35], shoulderR: [-1.0, 0, -0.35], elbowL: [0.2, 0, 0], elbowR: [0.2, 0, 0], hipL: [0.5, 0, 0], hipR: [0.5, 0, 0] }, 'in'],
    [0.86, { bodyY: -0.08 * sp.size, bodyZ: 0.6 * sp.size, bodyP: 0.1, chest: [0.12, 0, 0], neck: [0.2, 0, 0], jaw: [0, 0, 0], shoulderL: [-0.5, 0, 0.1], shoulderR: [-0.5, 0, -0.1], elbowL: [0.9, 0, 0], elbowR: [0.9, 0, 0], hipL: [-0.2, 0, 0], hipR: [-0.2, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], ankleL: [-0.2, 0, 0], ankleR: [-0.2, 0, 0] }, 'out'],
    [1.5, { bodyY: 0, bodyZ: 0, bodyP: 0, chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], shoulderL: [0, 0, 0], shoulderR: [0, 0, 0], elbowL: [0, 0, 0], elbowR: [0, 0, 0], wristL: [0, 0, 0], wristR: [0, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0], tail1: [0, 0, 0] }, 'io'],
  ], { swing: 0.34, hit: 0.8, recover: 0.9, ground: 0.12, fi: 0.05 });
  // ---- roar: rear the chest up, head back, jaw wide, tremble (the animator adds the jaw vibration)
  C.roar = clip('roar', big ? 1.9 : 1.5, [
    [0, {}], [big ? 0.5 : 0.3, { chest: [-0.34 * up, 0, 0], neck: [-0.5, 0, 0], head: [-0.35, 0, 0], jaw: [big ? 0.3 : 1.0, 0, 0], bodyP: -0.1 * up, shoulderL: [-0.35 * up, 0, 0.1], shoulderR: [-0.35 * up, 0, -0.1], bodyY: 0.05, tail1: [-0.3, 0, 0], trunk1: [-0.9, 0, 0], trunk2: [-0.7, 0, 0], trunk3: [-0.5, 0, 0], trunk4: [-0.4, 0, 0], earL: [0, 0.5, 0], earR: [0, -0.5, 0] }, 'back'],
    [big ? 1.4 : 1.1, { chest: [-0.3 * up, 0, 0], neck: [-0.48, 0, 0], head: [-0.33, 0, 0], jaw: [big ? 0.3 : 0.95, 0, 0], bodyP: -0.1 * up, bodyY: 0.05 }, 'lin'],
    [big ? 1.9 : 1.5, { chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], bodyP: 0, bodyY: 0, shoulderL: [0, 0, 0], shoulderR: [0, 0, 0], tail1: [0, 0, 0], trunk1: [0, 0, 0], trunk2: [0, 0, 0], trunk3: [0, 0, 0], trunk4: [0, 0, 0], earL: [0, 0, 0], earR: [0, 0, 0] }, 'io'],
  ], { swing: 0.3, hit: 0.5, recover: 1.1, fo: 0.3 });
  C.howl = clip('howl', 1.7, [[0, {}], [0.35, { neck: [-0.9, 0, 0], head: [-0.55, 0, 0], jaw: [0.55, 0, 0], chest: [-0.15, 0, 0] }, 'out'], [1.35, { neck: [-0.9, 0, 0], head: [-0.55, 0, 0], jaw: [0.45, 0, 0], chest: [-0.15, 0, 0] }, 'lin'], [1.7, { neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], chest: [0, 0, 0] }, 'io']], { swing: 0.35, hit: 0.6, recover: 1.2, fo: 0.3 });
  // ---- boar / elephant: paw the ground (charge telegraph, loops while held), stomp
  C.paw = clip('paw', 0.5, [[0, { neck: [0.4, 0, 0], head: [0.3, 0, 0], shoulderR: [-0.2, 0, 0] }], [0.12, { shoulderR: [-1.0, 0, 0], elbowR: [0.5, 0, 0], neck: [0.5, 0, 0], head: [0.3, 0, 0], bodyP: 0.1, chest: [0.1, 0, 0] }, 'out'], [0.25, { shoulderR: [-0.1, 0, 0], elbowR: [0.1, 0, 0], neck: [0.5, 0, 0], head: [0.3, 0, 0], bodyP: 0.12, chest: [0.12, 0, 0] }, 'in'], [0.37, { shoulderR: [-1.0, 0, 0], elbowR: [0.5, 0, 0], bodyP: 0.1 }, 'out'], [0.5, { shoulderR: [-0.1, 0, 0], elbowR: [0.1, 0, 0], bodyP: 0.12 }, 'in']], { swing: 0.2, hit: 0.3, recover: 0.4, loop: true, fi: 0.1, fo: 0.2, add: false });
  C.stomp = clip('stomp', 1.4, [
    [0, {}], [0.45, { chest: [-0.42, 0, 0], bodyP: -0.2, bodyY: 0.1, shoulderL: [-1.0, 0, 0.1], shoulderR: [-1.0, 0, -0.1], elbowL: [0.9, 0, 0], elbowR: [0.9, 0, 0], neck: [-0.3, 0, 0], head: [-0.2, 0, 0], trunk1: [-0.8, 0, 0], trunk2: [-0.6, 0, 0], trunk3: [-0.5, 0, 0], trunk4: [-0.4, 0, 0], hipL: [0.15, 0, 0], hipR: [0.15, 0, 0] }, 'out'],
    [0.62, { chest: [0.15, 0, 0], bodyP: 0.08, bodyY: -0.12, shoulderL: [0.2, 0, 0], shoulderR: [0.2, 0, 0], elbowL: [0, 0, 0], elbowR: [0, 0, 0], neck: [0.15, 0, 0], head: [0.1, 0, 0], trunk1: [0.3, 0, 0], trunk2: [0.3, 0, 0], trunk3: [0.2, 0, 0], trunk4: [0.2, 0, 0] }, 'cub'],
    [1.4, { chest: [0, 0, 0], bodyP: 0, bodyY: 0, shoulderL: [0, 0, 0], shoulderR: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], trunk1: [0, 0, 0], trunk2: [0, 0, 0], trunk3: [0, 0, 0], trunk4: [0, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0] }, 'io'],
  ], { swing: 0.45, hit: 0.6, recover: 0.8, ground: 0.2 });
  C.javelin = clip('javelin', 1.2, [[0, {}], [0.3, { riderArm: [-2.3, 0, 0], rider: [-0.2, 0, 0] }, 'out'], [0.5, { riderArm: [-0.4, 0, 0], rider: [0.3, 0, 0] }, 'cub'], [1.2, { riderArm: [0, 0, 0], rider: [0, 0, 0] }, 'io']], { swing: 0.3, hit: 0.5, recover: 0.7 });
  // ---- reactions
  C.hurt = clip('hurt', 0.5, [[0, {}], [0.07, { chest: [-0.2, 0, 0], neck: [-0.22, 0, 0], head: [-0.2, 0, 0], jaw: [0.35, 0, 0], bodyZ: -0.1, tail1: [-0.3, 0, 0] }, 'out'], [0.5, { chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], jaw: [0, 0, 0], bodyZ: 0, tail1: [0, 0, 0] }, 'io']], { add: true, fi: 0.02, fo: 0.2 });
  C.stun = clip('stun', 1.2, [[0, { neck: [0.35, -0.5, 0], head: [0.3, 0, 0.15], chest: [0.1, 0, 0], jaw: [0.2, 0, 0] }], [0.3, { neck: [0.35, 0.5, 0], head: [0.3, 0, -0.15] }, 'io'], [0.6, { neck: [0.35, -0.5, 0], head: [0.3, 0, 0.15] }, 'io'], [0.9, { neck: [0.35, 0.5, 0], head: [0.3, 0, -0.15] }, 'io'], [1.2, { neck: [0.35, -0.5, 0], head: [0.3, 0, 0.15] }, 'io']], { loop: true, hold: true, fi: 0.2, bodyY0: -0.05 });
  C.knockdown = clip('knockdown', 1.0, [[0, {}], [0.2, { bodyP: -0.25, bodyY: 0.08, chest: [-0.3, 0, 0], neck: [-0.4, 0, 0], jaw: [0.6, 0, 0], shoulderL: [-0.8, 0, 0.5], shoulderR: [-0.8, 0, -0.5], hipL: [0.6, 0, 0], hipR: [0.6, 0, 0] }, 'out'], [0.5, { bodyP: 0.0, bodyY: -0.15, bodyR: 0.5, chest: [0, 0, 0.1], neck: [0.2, 0, 0], jaw: [0.2, 0, 0], shoulderL: [-0.4, 0, 0.6], shoulderR: [-0.4, 0, -0.6], hipL: [0.4, 0, 0.3], hipR: [0.4, 0, -0.3] }, 'in'], [1.0, { bodyR: 0.5, bodyY: -0.2, neck: [0.25, 0, 0], jaw: [0.15, 0, 0], shoulderL: [-0.4, 0, 0.6], shoulderR: [-0.4, 0, -0.6], hipL: [0.4, 0, 0.3], hipR: [0.4, 0, -0.3] }, 'lin']], { hold: true, ground: 0.2 });
  C.getup = clip('getup', 0.9, [[0, { bodyR: 0.5, bodyY: -0.2, neck: [0.25, 0, 0], shoulderL: [-0.4, 0, 0.6], shoulderR: [-0.4, 0, -0.6], hipL: [0.4, 0, 0.3], hipR: [0.4, 0, -0.3] }], [0.4, { bodyR: 0.1, bodyY: -0.2, shoulderL: [-0.8, 0, 0], shoulderR: [-0.8, 0, 0], hipL: [0.5, 0, 0], hipR: [0.5, 0, 0], neck: [0.15, 0, 0] }, 'io'], [0.9, { bodyR: 0, bodyY: 0, shoulderL: [0, 0, 0], shoulderR: [0, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0], neck: [0, 0, 0] }, 'io']], { fi: 0.03 });
  C.death = clip('death', big ? 2.6 : 1.9, [
    [0, {}],
    [big ? 0.6 : 0.4, { bodyY: -0.12 * sp.size, bodyP: -0.12, chest: [-0.25, 0, 0], neck: [-0.35, 0, 0], head: [-0.25, 0, 0], jaw: [0.7, 0, 0], shoulderL: [-0.5, 0, 0.3], shoulderR: [-0.5, 0, -0.3], elbowL: [0.5, 0, 0], elbowR: [0.5, 0, 0], tail1: [-0.4, 0, 0] }, 'out'],
    [big ? 1.4 : 0.95, { bodyY: -0.34 * sp.size, bodyP: 0.18, bodyR: 0.0, chest: [0.1, 0, 0], neck: [0.35, 0, 0], head: [0.3, 0, 0], jaw: [0.4, 0, 0], shoulderL: [0.5, 0, 0.1], shoulderR: [0.5, 0, -0.1], elbowL: [1.2, 0, 0], elbowR: [1.2, 0, 0], hipL: [-0.7, 0, 0.1], hipR: [-0.7, 0, -0.1], kneeL: [1.3, 0, 0], kneeR: [1.3, 0, 0], ankleL: [-0.6, 0, 0], ankleR: [-0.6, 0, 0] }, 'in'],
    [big ? 2.2 : 1.55, { bodyY: -0.42 * sp.size, bodyP: 0.05, bodyR: 1.45, chest: [0.05, 0, 0.1], neck: [0.3, 0.3, 0], head: [0.25, 0, 0], jaw: [0.3, 0, 0], shoulderL: [-0.7, 0, 0.9], shoulderR: [0.7, 0, -0.7], elbowL: [0.4, 0, 0], elbowR: [0.5, 0, 0], hipL: [0.5, 0, 0.5], hipR: [-0.5, 0, -0.4], kneeL: [0.4, 0, 0], kneeR: [0.5, 0, 0], ankleL: [0.2, 0, 0], ankleR: [0.2, 0, 0], tail1: [0, 0.3, 0] }, 'cub'],
    [big ? 2.6 : 1.9, { bodyY: -0.45 * sp.size, bodyR: 1.5, jaw: [0.25, 0, 0], neck: [0.32, 0.3, 0], shoulderL: [-0.75, 0, 0.95], shoulderR: [0.75, 0, -0.75] }, 'out'],
  ], { hold: true, ground: 0.25, fi: 0.05, swing: 0, hit: 0, recover: 1 });
  C.victory = clip('victory', 1.6, [[0, {}], [0.4, { chest: [-0.3 * up, 0, 0], neck: [-0.45, 0, 0], head: [-0.3, 0, 0], jaw: [big ? 0.3 : 0.95, 0, 0], bodyP: -0.08 * up, shoulderL: [-0.3 * up, 0, 0.1], shoulderR: [-0.3 * up, 0, -0.1], trunk1: [-0.9, 0, 0], trunk2: [-0.7, 0, 0] }, 'back'], [1.6, { chest: [-0.2 * up, 0, 0], neck: [-0.4, 0, 0], head: [-0.25, 0, 0], jaw: [0.2, 0, 0], bodyP: -0.05 * up, shoulderL: [-0.2 * up, 0, 0.1], shoulderR: [-0.2 * up, 0, -0.1] }, 'io']], { hold: true });
  // alias gladiator clip names so generic fightview code never breaks
  C.attack1 = id === 'wolf' || boar ? C.bite : bear || big ? C.swipe : C.claw; C.attack2 = boar ? C.gore : C.bite; C.attack3 = bear ? C.maul : C.pounce === undefined ? C.bite : (lion ? C.maul : C.bite);
  C.block = C.hurt; C.taunt = C.roar; C.cheer = C.roar; C.idle = null;
  return C;
}

// ------------------------------------------------------------------ the builder
const DETAIL = {
  low: { sw: 5, sh: 3, tube: 4, ears: 1, claws: 0, mane: 8, tufts: 0, teeth: 0 },
  medium: { sw: 7, sh: 4, tube: 5, ears: 1, claws: 2, mane: 12, tufts: 6, teeth: 2 },
  high: { sw: 10, sh: 6, tube: 8, ears: 1, claws: 3, mane: 18, tufts: 12, teeth: 4 },
};

export function beastKindOf(x) { const g = x && (x.g || x); return (g && (g.beast || (x.beast))) || (x && x.style) || 'lion'; }

/** unitOrRecord: arena unit ({g}) or a beast record from LM.makeBeast. opts: {detail, scale, kind, look} */
export function createBeast(unitOrRec, opts = {}) {
  const g = (unitOrRec && unitOrRec.g) || unitOrRec || {}, kind = opts.kind || g.beast || (unitOrRec && unitOrRec.beast) || 'lion', sp0 = SPECIES[kind] || LION;
  const dname = opts.detail !== undefined && opts.detail !== null ? opts.detail : detailFor({}), DT = DETAIL[dname === 'low' || dname === 0 ? 'low' : dname === 'medium' || dname === 1 ? 'medium' : 'high'];
  const look = Object.assign({ coat: 0.5, mane: 0.5, scar: 0.5 }, g.look || {}, opts.look || {});
  const S = sp0.size, sp = sp0, SS = (v) => v * S;
  const sc = (a) => (Array.isArray(a) ? a.map((v) => v * S) : a * S);
  const root = new THREE.Group(); root.name = kind; const body = new THREE.Group(); body.name = 'body'; root.add(body);
  const J = {}, rest = new Map(); rest.set(root, new V3()); rest.set(body, new V3());
  const mk = (n, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = n; o.position.set(x, y, z); parent.add(o); J[n] = o; rest.set(o, rest.get(parent).clone().add(new V3(x, y, z))); return o; };
  // --- derived heights so the paws stand on y = 0
  const F = sp.front, H = sp.hind, T = sp.torso;
  const chestY = SS(F.pad - (F.sy + F.up[0] + F.lo[0])), hipsY = SS(H.pad - (H.hy + H.up[0] + H.lo[0]));
  mk('hips', body, 0, hipsY, SS(T.hipsZ));
  mk('spine', J.hips, 0, (chestY - hipsY) / 2, SS(T.chestZ - T.hipsZ) / 2); mk('chest', J.spine, 0, (chestY - hipsY) / 2, SS(T.chestZ - T.hipsZ) / 2);
  mk('neck', J.chest, 0, SS(sp.neck[0]), SS(sp.neck[1])); mk('head', J.neck, 0, SS(sp.hd[0]), SS(sp.hd[1]));
  mk('jaw', J.head, 0, SS(sp.jawAt[0]), SS(sp.jawAt[1]));
  const E = sp.earAt; mk('earL', J.head, SS(E[0]), SS(E[1]), SS(E[2])); mk('earR', J.head, -SS(E[0]), SS(E[1]), SS(E[2]));
  let tp = J.hips; const TL = sp.tail;
  for (let i = 0; i < 3; i++) { tp = mk('tail' + (i + 1), tp, i === 0 ? SS(TL.at[0]) : 0, i === 0 ? SS(TL.at[1]) : -SS(0.02), i === 0 ? SS(TL.at[2]) : -SS(TL.len)); }
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    mk('shoulder' + s, J.chest, sg * SS(F.dx), SS(F.sy), SS(F.sz)); mk('elbow' + s, J['shoulder' + s], 0, SS(F.up[0]), SS(F.up[1])); mk('wrist' + s, J['elbow' + s], 0, SS(F.lo[0]), SS(F.lo[1]));
    mk('hip' + s, J.hips, sg * SS(H.dx), SS(H.hy), SS(H.hz)); mk('knee' + s, J['hip' + s], 0, SS(H.up[0]), SS(H.up[1])); mk('ankle' + s, J['knee' + s], 0, SS(H.lo[0]), SS(H.lo[1]));
  }
  if (sp.trunk) { let p = J.head; for (let i = 1; i <= 4; i++) p = mk('trunk' + i, p, 0, i === 1 ? -SS(0.18) : -SS(0.42), i === 1 ? SS(0.38) : SS(0.08)); }
  if (sp.rider) { mk('rider', J.chest, 0, SS(0.78) + SS(0.35), -SS(0.15)); mk('riderArm', J.rider, -SS(0.2), SS(0.5), SS(0.04)); }
  const bones = JN.filter((n) => J[n]).map((n) => J[n]), bIdx = {}; bones.forEach((b, i) => { bIdx[b.name] = i; });

  // --- materials (per rig so flash / blood never leak)
  const bu = makeBloodUniforms(), mats = {};
  mats.fur = furMaterial(kind, bu, kind === 'elephant' ? 'leather' : 'cloth'); mats.fur.name = 'fur';
  mats.bone = plainMat(0xffffff, 'trim', 0.55, 0.05, bu, true); mats.bone.name = 'bone';
  mats.eye = plainMat(0xffffff, 'eye', 0.3, 0, bu, false, { glow: sp.gold ? 0x6a3a00 : kind === 'lion' ? 0x1a0e00 : 0x000000 }); mats.eye.name = 'eye';
  if (sp.rider) {
    mats.leather = plainMat(0xffffff, 'leather', 0.7, 0.05, bu, true, { ds: true }); mats.leather.name = 'leather'; mats.cloth = plainMat(0xffffff, 'cloth', 0.9, 0, bu, true, { ds: true }); mats.cloth.name = 'cloth';
    mats.skin = plainMat(0xffffff, 'skin', 0.55, 0, bu, true); mats.skin.name = 'skin'; mats.metal = plainMat(0xffffff, 'metal', 0.4, 0.8, bu, false); mats.metal.name = 'metal';
  }
  const items = []; const tint = (look.coat - 0.5) * 0.22;
  const FUR = hexC(sp.fur).offsetHSL(0, 0, tint * 0.6), BEL = hexC(sp.belly).offsetHSL(0, 0, tint * 0.4), DK = hexC(sp.dark), MANE = hexC(sp.mane).offsetHSL((look.mane - 0.5) * 0.03, 0, (look.mane - 0.5) * 0.1), NOSE = hexC(sp.nose);
  // add geometry authored in joint-local space; rest-space baked here
  const A = (mat, geo, jn, mirror) => {
    const j = J[jn]; if (!j) throw new Error('beast joint ' + jn);
    const add = (gg) => { gg.translate(rest.get(j).x, rest.get(j).y, rest.get(j).z); if (!gg.attributes.color) setColor(gg, flat('#ffffff')); items.push({ mat, geo: gg, bone: bIdx[jn] }); };
    add(geo);
    return geo;
  };
  const furCol = (belly = 1, saddle = 0.1, ao = 0.2) => (x, y, z, nx, ny) => { const b = sm(0.1, -0.85, ny) * belly; const c = mix(FUR, BEL, b); const k = 1 - saddle * sm(0.4, 1, ny) - ao * sm(0.2, 0.9, -ny) * (1 - belly * 0.5); return c.clone().multiplyScalar(k); };
  const darkCol = (fadeY, from = 0.0, c0 = FUR, c1 = DK) => (x, y, z, nx, ny) => mix(c0, c1, sm(fadeY, fadeY - 0.1, y) + from);
  const W = kind === 'elephant' ? Math.min(DT.sw, 8) : DT.sw, Hh = kind === 'elephant' ? Math.min(DT.sh, 5) : DT.sh, TS = kind === 'elephant' ? Math.min(DT.tube, 6) : DT.tube;
  // ---- torso: three overlapping tubes so the spine can flex
  const rr = (a, m = 1) => [SS(a[0]) * m, SS(a[1]) * m];
  const len = SS(T.len);
  const torso = (jn, r0, r1, r2, dys) => { const g2 = tube([[0, SS(dys[0]), -len], [0, SS(dys[1]), 0], [0, SS(dys[2]), len]], [r0, r1, r2], TS, [true, true]); setColor(g2, furCol(1, 0.1, 0.28)); return A('fur', g2, jn); };
  torso('hips', rr(T.rump, 0.8), rr(T.rump), rr([T.mid[0] * 0.98, T.mid[1] * 0.92]), [0.0, 0.01, 0.02]);
  torso('spine', rr([T.mid[0] * 0.98, T.mid[1] * 0.92]), rr([T.mid[0] * 0.92, T.mid[1] * 0.78]), rr([T.chest[0] * 0.92, T.chest[1] * 0.88]), [0.02, 0.04, 0.03]);
  torso('chest', rr([T.chest[0] * 0.92, T.chest[1] * 0.88]), rr(T.chest), rr(T.chest, 0.78), [0.03, 0.0, -0.01]);
  if (sp.hump) { const hg = blob(SS(0.31), SS(0.27), SS(0.36), W, Hh); setColor(hg, furCol(0.2, 0.05, 0.1)); place(hg, [0, SS(T.chest[1]) * 0.5, -SS(0.02)]); A('fur', hg, 'chest'); }
  if (kind === 'boar') { const hg = blob(SS(0.2), SS(0.17), SS(0.26), W, Hh); setColor(hg, furCol(0.2, 0.05, 0.1)); place(hg, [0, SS(0.14), SS(0.06)]); A('fur', hg, 'chest'); }
  // ---- neck + head
  const HS = sp.head;
  { const g2 = tube([[0, -SS(0.03), -SS(sp.neck[1]) * 0.7], [0, 0, -SS(sp.neck[1]) * 0.2], [0, SS(0.02), SS(sp.hd[1]) * 0.25]], [rr(kind === 'elephant' ? [0.4, 0.42] : [HS.sk[0] * 1.35, HS.sk[1] * 1.55]), rr(kind === 'elephant' ? [0.38, 0.4] : [HS.sk[0] * 1.2, HS.sk[1] * 1.35]), rr([HS.sk[0] * 0.98, HS.sk[1] * 1.0])], TS, [false, false]); setColor(g2, furCol(0.5, 0.1, 0.2)); A('fur', g2, 'neck'); }
  { const sk = blob(SS(HS.sk[0]), SS(HS.sk[1]), SS(HS.sk[2]), W, Hh); setColor(sk, furCol(0.35, 0.08, 0.15)); place(sk, [0, 0, SS(HS.sk[2]) * 0.55]); A('fur', sk, 'head'); }
  if (kind !== 'elephant') {
    const sn = tube([[0, -SS(0.02), SS(HS.sk[2]) * 0.6], [0, -SS(0.03), SS(HS.sk[2]) + SS(HS.sn[2]) * 0.5], [0, -SS(0.04), SS(HS.sk[2]) + SS(HS.sn[2]) * 1.05]], [[SS(HS.sn[0]) * 1.15, SS(HS.sn[1]) * 1.1], [SS(HS.sn[0]), SS(HS.sn[1])], [SS(HS.sn[0]) * 0.86, SS(HS.sn[1]) * 0.85]], TS, [false, true]);
    setColor(sn, (x, y, z, nx, ny, nz) => mix(mix(FUR, BEL, sm(0.0, -0.8, ny) * 0.8), kind === 'boar' ? DK : BEL, sm(0.1, 0.55, z))); A('fur', sn, 'head');
    const nz = blob(SS(HS.sn[0]) * 0.8, SS(HS.sn[1]) * 0.7, SS(0.04), 6, 4); setColor(nz, flat(kind === 'boar' ? '#b88a80' : '#2a1a18')); place(nz, [0, -SS(0.015), SS(HS.sk[2]) + SS(HS.sn[2]) * 1.1]); A('eye', nz, 'head');
    // lower jaw
    const jw = tube([[0, SS(0.0), SS(0.0)], [0, -SS(0.01), SS(HS.jaw) * 0.5], [0, -SS(0.005), SS(HS.jaw)]], [[SS(HS.sn[0]) * 0.95, SS(HS.sn[1]) * 0.55], [SS(HS.sn[0]) * 0.85, SS(HS.sn[1]) * 0.5], [SS(HS.sn[0]) * 0.6, SS(HS.sn[1]) * 0.38]], TS, [false, true]);
    setColor(jw, (x, y, z, nx, ny) => mix(BEL, FUR, sm(0, 0.8, ny) * 0.5)); A('fur', jw, 'jaw');
    // eyes
    for (const sg of [1, -1]) {
      const ey = blob(SS(0.026), SS(0.022), SS(0.022), 6, 4); setColor(ey, (x, y, z, nx, ny, nz) => (z > 0.0 ? hexC(sp.eye) : hexC(sp.eye).multiplyScalar(0.5))); place(ey, [sg * SS(HS.sk[0]) * 0.78, SS(HS.sk[1]) * 0.3, SS(HS.sk[2]) * 0.95]); A('eye', ey, 'head');
      const brow = blob(SS(0.04), SS(0.02), SS(0.04), 6, 3); setColor(brow, flat('#000000')); setColor(brow, (x, y, z, nx, ny) => mix(FUR, DK, 0.55)); place(brow, [sg * SS(HS.sk[0]) * 0.74, SS(HS.sk[1]) * 0.46, SS(HS.sk[2]) * 0.92], [0.0, 0, sg * -0.25]); A('fur', brow, 'head');
    }
    // teeth (fangs) in the bone material
    for (let i = 0; i < DT.teeth; i++) { const sg = i % 2 ? -1 : 1, up = i < 2, f = cone(SS(0.014), SS(up ? 0.05 : 0.04), 4); setColor(f, flat('#f1ead6'));
      if (up) { place(f, [sg * SS(HS.sn[0]) * 0.6, -SS(HS.sn[1]) * 0.6, SS(HS.sk[2]) + SS(HS.sn[2]) * 0.82], [Math.PI, 0, 0]); A('bone', f, 'head'); } else { place(f, [sg * SS(HS.sn[0]) * 0.5, SS(HS.sn[1]) * 0.2, SS(HS.jaw) * 0.85]); A('bone', f, 'jaw'); } }
    // ears
    for (const sg of [1, -1]) {
      const ear = sp.ears === 'point' ? place(cone(SS(0.055), SS(0.15), 4), [0, 0, 0], [-0.2, 0, sg * -0.15]) : sp.ears === 'flap' ? place(blob(SS(0.06), SS(0.09), SS(0.02), 6, 4), [sg * SS(0.02), SS(0.06), 0], [0.2, 0, sg * -0.5]) : place(blob(SS(0.07), SS(0.07), SS(0.03), 6, 4), [0, SS(0.03), 0]);
      setColor(ear, (x, y, z, nx, ny) => mix(FUR, DK, sm(0.0, 0.1, y) * 0.8 + 0.1)); A('fur', ear, sg > 0 ? 'earL' : 'earR');
    }
  }
  // ---- legs
  const legs = (side, sg) => {
    const fr = side === 'F', Lg = fr ? F : H, a = fr ? ['shoulder', 'elbow', 'wrist'] : ['hip', 'knee', 'ankle'], jn = a.map((n) => n + (sg > 0 ? 'L' : 'R'));
    const r = Lg.r.map((v) => SS(v)), sw = (v) => v;
    const upper = tube([[0, SS(fr ? 0.04 : 0.03), 0], [0, SS(Lg.up[0]) * 0.5, SS(Lg.up[1]) * 0.5], [0, SS(Lg.up[0]), SS(Lg.up[1])]], [[r[0], r[0] * (fr ? 1.0 : 1.15)], [(r[0] + r[1]) / 2 * 0.98, (r[0] + r[1]) / 2 * (fr ? 1.0 : 1.2)], [r[1] * 1.0, r[1] * 1.0]], TS, [true, false]);
    setColor(upper, furCol(0.1, 0, 0.12)); A('fur', upper, jn[0]);
    const lowerLen = SS(Lg.lo[0]), lowerZ = SS(Lg.lo[1]);
    const lower = tube([[0, SS(0.02), 0], [0, lowerLen * 0.5, lowerZ * 0.5], [0, lowerLen, lowerZ]], [[r[1], r[1]], [(r[1] + r[2]) / 2, (r[1] + r[2]) / 2], [r[2], r[2]]], TS, [true, false]);
    setColor(lower, (x, y, z, nx, ny) => mix(mix(FUR, DK, sm(-0.05, -0.28, y) * 0.55), FUR, 0)); A('fur', lower, jn[1]);
    // metatarsal / forearm to the paw
    const pad = SS(Lg.pad), pw = Lg.paw.map((v) => SS(v));
    { const mt = tube([[0, SS(0.02), 0], [0, -pad * 0.5, SS(0.01)], [0, -pad * 0.88, SS(0.03)]], [[r[2] * 1.05, r[2]], [r[2], r[2] * 0.9], [r[2] * 0.95, r[2] * 0.9]], TS, [false, false]); setColor(mt, flat('#' + FUR.getHexString())); setColor(mt, (x, y) => mix(FUR, DK, sm(-0.05, -pad, y) * 0.7)); A('fur', mt, jn[2]); }
    const paw = blob(pw[0], Math.max(pad * 0.34, pw[1]), pw[2], W, Hh); setColor(paw, (x, y, z, nx, ny) => mix(mix(FUR, DK, 0.55), DK, sm(0, -0.8, ny) * 0.6)); place(paw, [0, -pad * (fr ? 0.72 : 0.7) + pw[1] * 0.1, pw[2] * 0.42]); A('fur', paw, jn[2]);
    for (let c = 0; c < DT.claws; c++) { const cl = cone(Math.max(0.008, pw[0] * 0.14), pw[2] * 0.55, 4); setColor(cl, flat('#e8e0cc')); const k = (c - (DT.claws - 1) / 2) * pw[0] * 0.55; place(cl, [k, -pad * 0.82, pw[2] * 1.15], [Math.PI / 2 + 0.55, 0, 0]); A('bone', cl, jn[2]); }
  };
  for (const sg of [1, -1]) { legs('F', sg); legs('H', sg); }
  // shoulder / haunch masses hide the gap between torso and legs
  for (const sg of [1, -1]) {
    const sb = blob(SS(F.r[0]) * 1.15, SS(F.r[0]) * 1.35, SS(F.r[0]) * 1.25, W, Hh); setColor(sb, furCol(0.2, 0.05, 0.15)); place(sb, [sg * SS(0.01), SS(0.02), 0]); A('fur', sb, sg > 0 ? 'shoulderL' : 'shoulderR');
    const hb = blob(SS(H.r[0]) * 1.05, SS(H.r[0]) * 1.25, SS(H.r[0]) * 1.2, W, Hh); setColor(hb, furCol(0.2, 0.05, 0.15)); place(hb, [0, SS(0.02), 0]); A('fur', hb, sg > 0 ? 'hipL' : 'hipR');
  }
  // ---- tail
  { const seg = (jn, ln, r0, r1, tuft) => { const t = tube([[0, 0, SS(0.02)], [0, -SS(0.005), -ln * 0.5], [0, -SS(0.02), -ln]], [r0, (r0 + r1) / 2, r1], 5, [true, !tuft]); setColor(t, (x, y, z) => mix(FUR, DK, tuft ? sm(0, -ln, z) * 0.4 : 0)); A('fur', t, jn);
      if (tuft) { const tb = blob(SS(tuft), SS(tuft), SS(tuft * 1.6), 6, 4); setColor(tb, flat('#' + (kind === 'wolf' ? DK : MANE).getHexString())); place(tb, [0, -SS(0.02), -ln - SS(tuft) * 0.7]); A('fur', tb, jn); } };
    const tl = SS(TL.len), tr = SS(TL.r); seg('tail1', tl, tr * 1.4, tr * 1.1, 0); seg('tail2', tl, tr * 1.1, tr * 0.9, TL.n < 3 ? TL.tuft : 0); seg('tail3', tl, tr * 0.9, tr * 0.8, TL.n < 3 ? 0 : TL.tuft); }
  // ---- species specials
  if (sp.hasMane) { // lion / Nemean mane: a flattened mass around neck and chest + tufts
    const mg = blob(SS(0.36), SS(0.37), SS(0.34), W, Hh); setColor(mg, (x, y, z, nx, ny, nz) => mix(MANE, FUR, sm(0.25, 0.0, Math.abs(x) + (z < 0 ? 0 : 0) - 0.05 + y * 0) * 0.0 + 0.0)); setColor(mg, (x, y, z) => mix(MANE, hexC('#8a5a2a'), sm(0.1, 0.34, y) * 0.5)); place(mg, [0, -SS(0.02), -SS(0.1)]); A('fur', mg, 'neck');
    const mn = DT.mane, ring = Math.min(mn, DT.tufts + 6);
    for (let i = 0; i < DT.tufts; i++) { const a = i / DT.tufts * TAU, tf = cone(SS(0.09), SS(0.24), 4); setColor(tf, (x, y) => mix(hexC('#8a5a2a'), MANE, sm(0, 0.24, y))); const cx = Math.cos(a), cy = Math.sin(a);
      place(tf, [cx * SS(0.26), cy * SS(0.27) - SS(0.02), -SS(0.14)], [-Math.PI / 2 - 0.4 + cy * 0.2, cx * 0.5, -a + Math.PI / 2 * 0], 1); tf.rotateZ(0); A('fur', tf, 'neck'); }
    const bm = blob(SS(0.2), SS(0.14), SS(0.3), W, Hh); setColor(bm, (x, y) => mix(MANE, FUR, sm(0.0, -0.14, y) * 0.5)); place(bm, [0, -SS(0.12), SS(0.0)]); A('fur', bm, 'chest');
    void ring;
  }
  if (sp.ruff) { const rf = blob(SS(0.15), SS(0.17), SS(0.17), W, Hh); setColor(rf, (x, y) => mix(hexC('#9a9fa8'), FUR, sm(0.1, -0.15, y))); place(rf, [0, -SS(0.01), -SS(0.05)]); A('fur', rf, 'neck'); }
  if (sp.tusks) for (const sg of [1, -1]) { const tk = tube([[0, 0, 0], [sg * SS(0.01), SS(0.05), SS(0.07)], [sg * SS(0.02), SS(0.12), SS(0.09)]], [SS(0.022), SS(0.016), SS(0.006)], 5, [true, true]); setColor(tk, flat('#efe4c8')); place(tk, [sg * SS(0.085), -SS(0.035), SS(HS.jaw) * 0.55]); A('bone', tk, 'jaw'); }
  if (sp.bristle) { for (let i = 0; i < (dname === 'low' ? 0 : 5); i++) { const bg = cone(SS(0.035), SS(0.1), 4); setColor(bg, (x, y) => mix(DK, FUR, sm(0, 0.1, y))); place(bg, [0, SS(0.26) - Math.abs(i - 2) * SS(0.012) , -SS(0.28) + i * SS(0.16)], [-0.15 * (i - 2) * 0.2, 0, 0]); A('fur', bg, i < 2 ? 'spine' : 'chest'); } }
  if (sp.scars) for (const sg of [1, -1]) { const sc2 = tube([[0, 0, 0], [sg * SS(0.02), -SS(0.06), SS(0.05)], [sg * SS(0.04), -SS(0.12), SS(0.1)]], [SS(0.012), SS(0.01), SS(0.008)], 4, [true, true]); setColor(sc2, flat('#7a3a28')); place(sc2, [sg * SS(0.24), SS(0.06), SS(0.1)]); A('leather' in mats ? 'leather' : 'fur', sc2, 'chest'); }
  if (sp.gold) { for (const sg of [1, -1]) { const pl = blob(SS(0.08), SS(0.015), SS(0.14), 6, 3); setColor(pl, flat('#fff0b0')); place(pl, [sg * SS(0.22), SS(0.3), SS(0.05)], [0, 0, sg * -0.3]); A('bone', pl, 'chest'); } }
  if (sp.trunk) buildElephant();
  function buildElephant() {
    const k = S;
    // trunk: four tapering segments, tip curls
    const rs = [[0.2, 0.17], [0.15, 0.13], [0.11, 0.1], [0.075, 0.07]], ln = [0.42, 0.42, 0.4, 0.3];
    for (let i = 0; i < 4; i++) { const jn = 'trunk' + (i + 1), r0 = rs[i], r1 = rs[Math.min(3, i + 1)] , t = tube([[0, 0, 0], [0, -ln[i] * 0.5, SS(0.03)], [0, -ln[i], SS(0.06)]], [[r0[0], r0[1]], [(r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2], [i === 3 ? r1[0] * 0.8 : r1[0], i === 3 ? r1[1] * 0.8 : r1[1]]], TS, [i === 0, i === 3]); setColor(t, (x, y, z, nx, ny) => mix(FUR, DK, sm(0, -0.4, y) * 0.0 + 0.1 + 0.2 * sm(0.2, -0.8, ny))); A('fur', t, jn); }
    // big ears (flat discs hinged at the head)
    for (const sg of [1, -1]) { const ear = blob(SS(0.03), SS(0.5), SS(0.42), W, Hh); setColor(ear, (x, y, z, nx) => mix(hexC('#b79088'), FUR, sm(-0.2, 0.25, sg * x * 6 + 0.5 * Math.abs(y)))); place(ear, [sg * SS(0.1), -SS(0.28), -SS(0.2)], [0, sg * 0.35, 0]); A('fur', ear, sg > 0 ? 'earL' : 'earR'); }
    // tusks and eyes
    for (const sg of [1, -1]) { const tk = tube([[0, 0, 0], [sg * SS(0.04), -SS(0.14), SS(0.28)], [sg * SS(0.06), -SS(0.14), SS(0.62)], [sg * SS(0.04), SS(0.02), SS(0.86)]], [SS(0.07), SS(0.058), SS(0.04), SS(0.012)], 6, [true, true]); setColor(tk, (x, y, z) => mix(hexC('#f1e7cc'), hexC('#c8b88e'), sm(0.1, 0.0, z))); place(tk, [sg * SS(0.17), -SS(0.18), SS(0.2)]); A('bone', tk, 'head');
      const ey = blob(SS(0.03), SS(0.03), SS(0.025), 6, 4); setColor(ey, flat('#2a1a10')); place(ey, [sg * SS(0.29), SS(0.06), SS(0.18)]); A('eye', ey, 'head');
      const toe = blob(SS(0.045), SS(0.03), SS(0.04), 5, 3); setColor(toe, flat('#d8d0bc')); void toe; }
    for (const sg of [-1, 1]) for (const f of ['F', 'H']) { const jn = (f === 'F' ? 'wrist' : 'ankle') + (sg > 0 ? 'L' : 'R'); for (let c = -1; c <= 1; c++) { const nl = blob(SS(0.045), SS(0.035), SS(0.03), 5, 3); setColor(nl, flat('#d4cab4')); place(nl, [c * SS(0.12), -SS(0.1), SS(0.2)]); A('bone', nl, jn); } }
    // harness and howdah
    const gi = tube([[-SS(0.55), SS(0.0), 0], [-SS(0.58), -SS(0.25), 0], [-SS(0.5), -SS(0.52), 0]], [[SS(0.045), SS(0.34)], [SS(0.05), SS(0.34)], [SS(0.045), SS(0.34)]], 4, [false, false]);
    void gi;
    const pad = blob(SS(0.62), SS(0.12), SS(0.7), W, Hh); setColor(pad, flat('#7a1f1f')); place(pad, [0, SS(0.58), -SS(0.15)]); A('cloth', pad, 'spine');
    for (const sg of [1, -1]) { const bel = tube([[sg * SS(0.58), SS(0.45), 0], [sg * SS(0.62), 0, 0], [sg * SS(0.58), -SS(0.45), 0]], [[SS(0.04), SS(0.3)], [SS(0.04), SS(0.3)], [SS(0.04), SS(0.3)]], 4, [false, false]); setColor(bel, flat('#4a2e1a')); A('leather', bel, 'spine'); }
    const plat = new THREE.BoxGeometry(SS(0.8), SS(0.07), SS(0.9)); setColor(plat, flat('#6a4528')); place(plat, [0, SS(0.7), -SS(0.15)]); A('leather', plat, 'spine');
    for (const [x, z, w2, d2] of [[0.4, -0.15, 0.04, 0.9], [-0.4, -0.15, 0.04, 0.9], [0, -0.6, 0.8, 0.04]]) { const rl = new THREE.BoxGeometry(SS(w2), SS(0.22), SS(d2)); setColor(rl, flat('#5a3a20')); place(rl, [SS(x), SS(0.82), SS(z)]); A('leather', rl, 'spine'); }
    const hs = blob(SS(0.7) * 0.5, SS(0.04), SS(0.5), W, 3); void hs;
    // the handler (mahout): seated torso, head with a helmet, one throwing arm with a javelin
    const tr = tube([[0, -SS(0.2), 0], [0, SS(0.05), 0], [0, SS(0.28), 0]], [[SS(0.17), SS(0.12)], [SS(0.19), SS(0.13)], [SS(0.2), SS(0.12)]], 6, [true, true]); setColor(tr, flat('#b5832d')); A('cloth', tr, 'rider');
    const hd = blob(SS(0.1), SS(0.11), SS(0.11), 8, 5); setColor(hd, flat('#c4875a')); place(hd, [0, SS(0.42), SS(0.01)]); A('skin', hd, 'rider');
    const hm = blob(SS(0.115), SS(0.09), SS(0.12), 8, 4); setColor(hm, flat('#b9b2a0')); place(hm, [0, SS(0.47), 0]); A('metal', hm, 'rider');
    const lg = tube([[SS(0.12), -SS(0.2), 0], [SS(0.2), -SS(0.2), SS(0.2)], [SS(0.2), -SS(0.32), SS(0.34)]], [SS(0.06), SS(0.05), SS(0.045)], 5, [true, true]); setColor(lg, flat('#c4875a')); A('skin', lg, 'rider'); const lg2 = tube([[-SS(0.12), -SS(0.2), 0], [-SS(0.2), -SS(0.2), SS(0.2)], [-SS(0.2), -SS(0.32), SS(0.34)]], [SS(0.06), SS(0.05), SS(0.045)], 5, [true, true]); setColor(lg2, flat('#c4875a')); A('skin', lg2, 'rider');
    const la = tube([[SS(0.0), SS(0.0), 0], [SS(0.12), SS(0.0), SS(0.12)], [SS(0.14), -SS(0.06), SS(0.26)]], [SS(0.045), SS(0.04), SS(0.035)], 5, [true, true]); place(la, [SS(0.2), SS(0.2), 0]); setColor(la, flat('#c4875a')); A('skin', la, 'rider');
    const ra = tube([[0, 0, 0], [0, -SS(0.2), SS(0.04)], [0, -SS(0.38), SS(0.1)]], [SS(0.05), SS(0.045), SS(0.04)], 5, [true, true]); setColor(ra, flat('#c4875a')); A('skin', ra, 'riderArm');
    const js = tube([[0, -SS(0.38), SS(0.08)], [0, -SS(0.38), SS(0.7)], [0, -SS(0.38), SS(1.1)]], [SS(0.014), SS(0.014), SS(0.012)], 4, [true, false]); setColor(js, flat('#6a4a2a')); place(js, [0, 0, -SS(0.15)]); A('leather', js, 'riderArm');
    const jt = cone(SS(0.03), SS(0.12), 4); setColor(jt, flat('#cfd3da')); place(jt, [0, -SS(0.38), SS(0.95)], [Math.PI / 2, 0, 0]); A('metal', jt, 'riderArm');
    // cloth tassels on the head
    const hc = blob(SS(0.22), SS(0.04), SS(0.22), 8, 3); setColor(hc, flat('#7a1f1f')); place(hc, [0, SS(0.34), SS(0.1)], [-0.4, 0, 0]); A('cloth', hc, 'head');
  }

  // ---- merge to one skinned mesh per material
  const parts = {};
  function rebuild() {
    for (const k in parts) { root.remove(parts[k]); parts[k].geometry.dispose(); delete parts[k]; }
    const skeleton = new THREE.Skeleton(bones, bones.map((b) => new THREE.Matrix4().makeTranslation(...rest.get(b).toArray()).invert()));
    const by = {}; for (const it of items) (by[it.mat] = by[it.mat] || []).push(it);
    for (const k in by) {
      const list = by[k]; let nv = 0, ni = 0; for (const it of list) { nv += it.geo.attributes.position.count; ni += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), clr = new Float32Array(nv * 3), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), idx = new Uint32Array(ni); let vo = 0, io = 0;
      for (const it of list) {
        const gg = it.geo, n = gg.attributes.position.count; if (!gg.attributes.normal) gg.computeVertexNormals();
        pos.set(gg.attributes.position.array, vo * 3); nor.set(gg.attributes.normal.array, vo * 3); clr.set(gg.attributes.color.array, vo * 3);
        for (let i = 0; i < n; i++) { si[(vo + i) * 4] = it.bone; sw[(vo + i) * 4] = 1; }
        if (gg.index) for (let i = 0; i < gg.index.count; i++) idx[io++] = gg.index.getX(i) + vo; else for (let i = 0; i < n; i++) idx[io++] = vo + i;
        vo += n;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.boundingSphere = new THREE.Sphere(new V3(0, 1, 0), 8); geo.boundingBox = new THREE.Box3(new V3(-8, -1, -8), new V3(8, 8, 8));
      const m = new THREE.SkinnedMesh(geo, mats[k]); m.name = k; m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; root.add(m); m.bind(skeleton, new THREE.Matrix4()); parts[k] = m;
    }
    rig.skeleton = skeleton; rig.parts = parts;
  }

  // ------------------------------------------------------------------ rig object
  const squash = new Spring1(260, 15), flashState = { t: 0, dur: 0.12, color: new THREE.Color(0.7, 0.4, 0.25) };
  const blood = { amount: 0, fresh: 0, wounds: [], wi: 0 };
  const syncBlood = () => { bu.uBlood.value = blood.amount; bu.uBOn.value = blood.amount > 0.002 || blood.wounds.length ? 1 : 0; };
  const rig = {
    root, body, joints: J, sockets: {}, mats, palette: { skin: sp.fur, hair: sp.mane, plume: sp.belly, cloth: '#7a1f1f', metal: '#b8b2a0' }, secondary: [], postUpdate: [], build: { height: 1 }, look,
    beast: kind, style: kind, portraitD: { lion: 2.0, wolf: 1.45, bear: 2.3, boar: 1.8, nemean: 3.6, elephant: 5.4 }[kind] || 2.2, nameH: SS(sp.nameH / S) * (opts.scale || 1), beastR: sp.r * (opts.scale || 1), bodyH: sp.h, parts, severed: {}, held: { R: true, L: true }, detail: dname, g, size: S,
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
    addBlood(amount, fresh = 1) { blood.amount = clamp(blood.amount + amount, 0, 1); blood.fresh = Math.max(blood.fresh, fresh); syncBlood(); },
    setBlood(amount, fresh = 0) { blood.amount = clamp(amount, 0, 1); blood.fresh = fresh; bu.uBFresh.value = fresh; syncBlood(); },
    addWound(pt, dir, half = 0.09, strength = 1) { const i = blood.wounds.length < 6 ? blood.wounds.length : (blood.wi = ((blood.wi | 0) + 1) % 6); blood.wounds[i] = { x: pt.x, y: pt.y, z: pt.z, half, s: strength }; bu.uWound.value[i].set(pt.x, pt.y, pt.z, half * Math.max(1, S * 0.8)); bu.uWoundD.value[i].set(dir.x, dir.y, dir.z, strength); syncBlood(); return i; },
    clearBlood() { blood.amount = 0; blood.fresh = 0; blood.wounds.length = 0; blood.wi = 0; for (const v of bu.uWound.value) v.set(0, 0, 0, 0); for (const v of bu.uWoundD.value) v.set(0, 0, 0, 0); bu.uBFresh.value = 0; syncBlood(); },
    sever() { return null }, partFrame() { return null }, restoreParts() {}, reattachAll() {}, detachable() { return []; }, detachPart() { return null; },
    update(dt) { animator.update(dt); },
    dispose() { root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const k in mats) mats[k].dispose(); rig.skeleton && rig.skeleton.dispose(); },
    onEvent: null, setWeapon() {},
  };
  const animator = new BeastAnimator(rig, sp, J, rest, squash, flashState, bu, mats);
  rig.animator = animator; rig._items = items;
  rebuild();
  if (opts.scale && opts.scale !== 1) root.scale.setScalar(opts.scale);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  animator.reset(); rig.update(1 / 60);
  return rig;
}

// ------------------------------------------------------------------ animator: base layer (idle + gaits), action layer (clips), additive hurt spring, crossfade snapshot
class BeastAnimator {
  constructor(rig, sp, J, rest, squash, flashState, bu, mats) {
    this.rig = rig; this.sp = sp; this.J = J; this.squash = squash; this.flashState = flashState; this.mats = mats;
    this.clips = clipsFor(sp); this.mv = { vz: 0, vx: 0 }; this.speed = 0; this.phase = 0; this.t = 0; this.breath = 0; this.state = 'move'; this.action = null; this.dead = false; this.armed = 1; this.exert = 0;
    this.look = { target: null, w: 0 }; this.ik = { hand: null }; this.timeScale = 1; this.hitStopT = 0; this.onEvent = null; this.hurtS = new Spring1(220, 12); this.hurtDir = 1; this.stepPh = [0, 0, 0, 0];
    this.pb = new Float32Array(NCH); this.pa = new Float32Array(NCH); this.out = new Float32Array(NCH); this.snap = new Float32Array(NCH); this.snapT = 1; this.snapDur = 0.15; this.lowest = 0; this.groundOff = 0; this.mode = ''; this.tailPh = 0;
    this.stateClip = null; this.tw = 0; this.gw = { walk: 0, run: 0 }; this.go = 0;
  }
  reset() { this.pb.fill(0); this.pa.fill(0); this.out.fill(0); this.snap.fill(0); this.phase = 0; this.action = null; this.dead = false; this.state = 'move'; this.snapT = 1; this.groundOff = 0; this.hurtS.x = 0; this.hurtS.v = 0; this.go = 0; this.rig.body.position.set(0, 0, 0); this.rig.body.rotation.set(0, 0, 0); }
  setMove(vz, vx = 0) { this.mv.vz = vz; this.mv.vx = vx; }
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
  hurt(dir = 1, amp = 1) { const d = typeof dir === 'object' ? dir.x : dir; this.hurtS.kick(0.9 * Math.min(1.6, amp)); this.hurtDir = d || 1; this.rig.flash && 0; }
  stagger(dir = 1) { this.hurtS.kick(0.7); }
  knockdown(dir = 1) { this.play('knockdown'); } getUp() { this.play('getup'); }
  die(dir = 1, o = {}) { if (this.dead) return; this.play(this.sp.id === 'elephant' ? 'death' : 'death'); this.dead = true; this.deadDir = typeof dir === 'object' ? dir.x : dir; }
  hitStop(dur = 0.06) { this.hitStopT = dur; }
  emit(n, extra) { if (this.onEvent) this.onEvent(n, extra); if (this.rig.onEvent) this.rig.onEvent(n, extra); }

  gait(dt) {
    const G = this.sp.gait, v = Math.sqrt(this.mv.vz * this.mv.vz + this.mv.vx * this.mv.vx), pb = this.pb, S = this.sp.size, big = this.sp.id === 'elephant';
    const wk = sm(0.15, G.walkV, v), rn = sm(G.walkV * 0.95, G.runV * 0.85, v);
    this.speed += (v - this.speed) * Math.min(1, dt * 10); const gv = this.speed;
    const stride = lerp(G.strideW, G.strideR, rn); if (gv > 0.12) this.phase = (this.phase + (Math.sign(this.mv.vz || 1) * gv * dt) / stride) % 1; if (this.phase < 0) this.phase += 1;
    const ph = this.phase, wA = G.ampW, rA = G.ampR, A = lerp(wA, rA, rn) * wk;
    // leg phase offsets: lateral sequence walk, rotary gallop (hind pair then fore pair), pace for elephants
    const pace = !!G.pace; let oLH, oLF, oRH, oRF;
    if (pace) { oLH = 0.1; oLF = 0.0; oRH = 0.6; oRF = 0.5; } else { oLH = 0; oLF = 0.25 + (0.5 - 0.25) * rn; oRH = 0.5 + (0.08 - 0.5) * rn; oRF = 0.75 + (0.58 - 0.75) * rn; }
    for (let i = 0; i < 4; i++) {   // 0 LF, 1 RF, 2 LH, 3 RH
      const of = i === 0 ? oLF : i === 1 ? oRF : i === 2 ? oLH : oRH, front = i < 2, jn = LEG_I[i];
      const c = (ph + of) % 1, ang = -A * Math.cos(c * TAU), lift = c > 0.5 ? Math.sin((c - 0.5) * 2 * Math.PI) : 0, rl = lift * lift;
      if (front) { pb[jn[0]] = ang * 0.9; pb[jn[1]] = (0.18 + 1.25 * rl) * wk * (1 + (0.9 - 1) * rn) * (big ? 0.5 : 1) - 0.06; pb[jn[2]] = -pb[jn[0]] * 0.55 - pb[jn[1]] * 0.45 + 0.05 + lift * 0.3 * wk; }
      else { pb[jn[0]] = ang * 1.0 + 0.08; pb[jn[1]] = (0.14 + 1.1 * rl) * wk * (big ? 0.5 : 1) + (0.1 + 0.12 * (ang < 0 ? -ang : 0)); pb[jn[2]] = -pb[jn[0]] * 0.5 - pb[jn[1]] * 0.55 + 0.06 + lift * 0.4 * wk; }
      pb[jn[0] + 2] = 0;
      const prev = this.stepPh[i]; this.stepPh[i] = c; if (gv > 0.5 && prev < 0.5 && c >= 0.5 && Math.abs(prev - c) < 0.5) this.emit('step', { side: i & 1 ? 'R' : 'L', front });
    }
    // body: bob twice per stride, spine wave in the gallop, shoulder roll in the walk
    const bob = Math.sin(ph * TAU * 2 + 0.4) * 0.012 * S * wk * (1 + rn * 2) * (big ? 0.7 : 1);
    pb[NB + 0] = bob; pb[NB + 2] = Math.sin(ph * TAU - 0.5) * 0.045 * wk * (0.5 + rn) + (this.mode === 'charge' ? 0.12 : 0); pb[NB + 3] = Math.sin(ph * TAU) * 0.018 * wk * (1 - rn * 0.6);
    pb[JI.spine * 3] = Math.sin(ph * TAU - 0.9) * 0.09 * wk * rn; pb[JI.chest * 3] = Math.sin(ph * TAU - 0.2) * 0.05 * wk * (0.4 + rn); pb[JI.hips * 3] = -Math.sin(ph * TAU - 0.9) * 0.06 * wk * rn;
    pb[JI.chest * 3 + 1] = Math.sin(ph * TAU) * 0.05 * wk * (1 - rn); pb[JI.hips * 3 + 1] = -Math.sin(ph * TAU) * 0.05 * wk * (1 - rn);
    // head: sways with the stride, lowered when charging / prowling
    const charge = this.mode === 'charge' ? 1 : 0, low = lerp(0, 0.18, wk * (1 - rn)) + charge * 0.5;
    pb[JI.neck * 3] = low * 0.6 - Math.sin(ph * TAU * 2 + 1) * 0.03 * wk + charge * 0.2; pb[JI.head * 3] = low * 0.4 + Math.sin(ph * TAU * 2 + 0.5) * 0.04 * wk;
    this.gw.walk = wk; this.gw.run = rn;
  }
  update(dt) {
    const rig = this.rig, J = this.J, sp = this.sp, S = sp.size; if (this.hitStopT > 0) { this.hitStopT -= dt; dt *= 0.04; }
    this.t += dt; this.breath += dt * TAU / (3.2 + S * 0.4);
    const pb = this.pb, pa = this.pa, out = this.out; pb.fill(0);
    // ---- idle breathing, tail and ear life, weight shift
    const br = Math.sin(this.breath), idle = 1 - this.gw.walk * 0.7;
    pb[JI.chest * 3] += br * 0.02; pb[JI.neck * 3] += br * 0.012 - 0.03; pb[NB + 0] += br * 0.004 * S; pb[JI.head * 3] += Math.sin(this.t * 0.5) * 0.03 * idle; pb[JI.head * 3 + 1] += Math.sin(this.t * 0.37) * 0.12 * idle;
    pb[JI.jaw * 3] += 0.03 + (this.state === 'move' && this.sp.id === 'lion' ? 0 : 0);
    for (let i = 1; i <= 3; i++) { const c = TAIL_I[i - 1]; pb[c + 1] = Math.sin(this.t * 1.1 - i * 0.7) * (0.25 - i * 0.04) * (0.6 + this.speed * 0.15); pb[c] = -0.1 + Math.sin(this.t * 0.8 - i) * 0.08 + this.gw.run * -0.35 * (i === 1 ? 1 : 0.3); }
    if (sp.trunk) for (let i = 1; i <= 4; i++) { const c = TRUNK_I[i - 1]; pb[c] = Math.sin(this.t * 0.9 - i * 0.6) * 0.18 + 0.12 * i * 0.1 + this.gw.walk * Math.sin(this.phase * TAU * 2 - i) * 0.15; pb[c + 1] = Math.sin(this.t * 0.55 - i * 0.5) * 0.12; }
    if (sp.rider) { pb[JI.rider * 3] = Math.sin(this.phase * TAU * 2 + 1) * 0.03 * this.gw.walk - br * 0.01; pb[JI.rider * 3 + 2] = Math.sin(this.phase * TAU) * 0.04 * this.gw.walk; pb[JI.riderArm * 3] = -0.25 + br * 0.02; }
    for (let si = 0; si < 2; si++) { const s = si ? 'R' : 'L', e = EAR_I[si]; pb[e + 1] = (s === 'L' ? 1 : -1) * (0.1 + Math.sin(this.t * 1.7 + (s === 'L' ? 0 : 2)) * 0.05 * (sp.ears === 'big' ? 3 : 1)); pb[e + 2] = (s === 'L' ? 1 : -1) * (sp.ears === 'big' ? Math.sin(this.t * 0.9 + (s === 'L' ? 0 : 1.5)) * 0.14 : 0); }
    // legs at rest (idle): slight bend so the rest pose is not a statue
    for (let si = 0; si < 2; si++) { const r = REST_I[si]; pb[r[0]] = -0.04; pb[r[1]] = 0.04; pb[r[2]] = 0.1; pb[r[3]] = -0.06; }
    this.gait(dt);
    // ---- action layer
    pa.fill(0); let w = 0; const mask = this._mask || (this._mask = new Uint8Array(NCH)); mask.fill(0);
    const a = this.action;
    if (a) {
      const c = a.c; a.t += dt * a.speed * (this.hitStopT > 0 ? 1 : 1);
      if (a.t >= c.dur && c.loop && a.loop !== false) a.t -= c.dur;
      const tt = Math.min(a.t, c.dur);
      for (let ci = 0, cn = c.chI.length; ci < cn; ci++) { const ch = c.chI[ci]; pa[ch] = evalKeys(c.chK[ci], tt); mask[ch] = 1; }   // PERF: flat arrays (a Map iterator per frame allocated)
      w = smooth(0, c.fi, a.t) * (a.hold || (c.loop && a.loop !== false) ? 1 : 1 - smooth(c.dur - c.fo, c.dur, a.t));
      if (c === this.clips.roar || c === this.clips.howl || c === this.clips.victory) { const tr = Math.sin(this.t * 38) * 0.05 * w * smooth(0.3, 0.45, a.t); pa[JI.jaw * 3] += tr; pa[JI.head * 3 + 2] = (pa[JI.head * 3 + 2] || 0) + tr * 0.5; mask[JI.jaw * 3] = 1; mask[JI.head * 3 + 2] = 1; }
      if (c === this.clips.pounce) w = Math.max(w, 0.0);
      // events
      if (!a.ev1 && c.swing && a.t >= c.swing) { a.ev1 = 1; this.emit('swing', c); }
      if (!a.ev2 && c.hit && a.t >= c.hit) { a.ev2 = 1; this.emit('hit', c); }
      if (a.t >= c.dur && !c.loop && !a.ended) { a.ended = true; this.emit('end', c); if (!a.hold) this.action = null; }
    }
    // ---- compose: base, action over it where the clip names a channel
    for (let i = 0; i < NCH; i++) out[i] = mask[i] ? pb[i] + (pa[i] - pb[i]) * w : pb[i];
    // ---- additive hurt flinch (mirrors the chest twist)
    const h = this.hurtS.update(dt); if (Math.abs(h) > 1e-4) {
      out[JI.chest * 3] += -0.22 * h; out[JI.chest * 3 + 1] += 0.18 * h * this.hurtDir; out[JI.neck * 3] += -0.28 * h; out[JI.head * 3] += -0.2 * h; out[JI.jaw * 3] += 0.3 * Math.max(0, h); out[NB + 1] += -0.07 * h * S; out[JI.tail1 * 3] += -0.4 * h;
    }
    // ---- crossfade from the last pose when a state or clip began
    if (this.snapT < 1) { this.snapT = Math.min(1, this.snapT + dt / this.snapDur); const k = smooth(0, 1, this.snapT); for (let i = 0; i < NCH; i++) out[i] = this.snap[i] + (out[i] - this.snap[i]) * k; }
    // ---- write
    for (const n of JN) { const j = J[n]; if (!j) continue; const i = JI[n] * 3; j.rotation.set(out[i], out[i + 1], out[i + 2], 'XYZ'); }
    // look: yaw the head toward a target if asked
    const body = rig.body, by = out[NB], bz = out[NB + 1], bp = out[NB + 2], br2 = out[NB + 3], bw = out[NB + 4];
    // ground contact: lowest paw sole decides how far the body hangs (unless the clip is airborne)
    const air = a && a.c.ground !== undefined ? a.c.ground : 1;
    body.rotation.set(bp, bw, br2, 'XYZ'); body.position.set(0, by + this.go, bz);
    const sq = this.squash.update(dt); body.scale.set(1 / Math.sqrt(1 + sq), 1 + sq, 1 / Math.sqrt(1 + sq));
    rig.root.updateMatrixWorld(true);
    const fl = this.flashState; if (fl.t > 0) fl.t = Math.max(0, fl.t - dt); const f = fl.t > 0 ? fl.t / fl.dur : 0;
    if (rig.blood.fresh > 0) { rig.blood.fresh = Math.max(0, rig.blood.fresh - dt / 9); rig.bloodU.uBFresh.value = rig.blood.fresh; }
    if (f > 0 || this._emD !== false) { for (const k in this.mats) { const m = this.mats[k]; if (!m.userData.base) m.userData.base = m.emissive.clone(); m.emissive.copy(m.userData.base); if (f > 0) m.emissive.lerp(fl.color, f); } this._emD = f > 0; }   // PERF: only while a flash runs (and once after)
    this.groundFix(dt, a && a.c.ground !== undefined ? 0 : 1, a ? a.c : null);
  }
  groundFix(dt, grounded, c) {
    const J = this.J, rig = this.rig, sp = this.sp, S = sp.size, _v = this._gv || (this._gv = new V3()); let low = 1e9;
    const pj = this._pj || (this._pj = [J.wristL, J.wristR, J.ankleL, J.ankleR]), pp = this._pp || (this._pp = [sp.front.pad, sp.front.pad, sp.hind.pad, sp.hind.pad]);
    const sc = rig.root.scale.y * (this.rig.body.scale.y || 1);
    for (let i = 0; i < 4; i++) { _v.setFromMatrixPosition(pj[i].matrixWorld); const yy = _v.y - pp[i] * S * 0.98 * rig.root.scale.y; if (yy < low) low = yy; }   // matrices were just updated by update(): no per-joint parent walk
    const err = low - rig.root.position.y; // > 0: floating, < 0: sunk
    if (c && (c.ground === 0)) return;
    if (err < 0) this.go += -err; else if (grounded || !c) this.go -= Math.min(err, dt * 1.6 * S);
    this.go = clamp(this.go, -0.6 * S, 0.8 * S);
    void sc;
  }
}
export { BeastAnimator, SPECIES, JN };
