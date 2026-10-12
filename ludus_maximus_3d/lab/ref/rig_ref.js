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

// ---------------------------------------------------------------- geometry
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
export function lathe(profile, seg = 8, sx = 1, sz = 1, ao = 0.2, lo = 0.72) {
  // profile: [[radius, y], ...] ordered with increasing y.
  const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  const pos = g.attributes.position, nor = g.attributes.normal, n = new V3();
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) * sx); pos.setZ(i, pos.getZ(i) * sz);
    n.set(nor.getX(i) / sx, nor.getY(i), nor.getZ(i) / sz).normalize(); nor.setXYZ(i, n.x, n.y, n.z);
  }
  return addAO(g, ao, lo);
}
export function capsule(len, rTop, rBot, seg = 7, bulge = 0.1) {
  // hangs down from y=0 to y=-len, rounded caps, muscle bulge
  const cb = rBot * 0.55, ct = rTop * 0.55, mid = lerp(rBot, rTop, 0.5) * (1 + bulge);
  return lathe([[0, -len - cb], [rBot * 0.8, -len - cb * 0.5], [mid, -len * 0.5], [rTop, 0], [rTop * 0.72, ct * 0.7], [0, ct]], seg, 1, 1, 0.14, 0.8);
}
export function boxG(w, h, d, ao = 0) { const g = new THREE.BoxGeometry(w, h, d); return addAO(g, ao, 0.8); }
export function sphereG(r, w = 8, h = 5, sx = 1, sy = 1, sz = 1) { const g = new THREE.SphereGeometry(r, w, h); g.scale(sx, sy, sz); return addAO(g, 0.25, 0.8); }
function mesh(geo, mat, name) { const m = new THREE.Mesh(geo, mat); m.name = name || ''; m.castShadow = true; m.receiveShadow = true; return m; }

// ---------------------------------------------------------------- materials (zones)
export const DEFAULT_PALETTE = { skin: '#c98d62', hair: '#2b1b12', cloth: '#a8452a', plume: '#b5271f', metal: '#b8803a' };
export function makeMaterials(p = DEFAULT_PALETTE) {
  const mk = (color, roughness, metalness, flat = false) => new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: flat, vertexColors: true });
  const m = {
    skin: mk(p.skin, 0.62, 0), hair: mk(p.hair, 0.8, 0), cloth: mk(p.cloth, 0.92, 0), plume: mk(p.plume, 0.85, 0),
    leather: mk('#6b4428', 0.72, 0, true), metal: mk(p.metal, 0.38, 0.75, true), trim: mk('#e0b04a', 0.3, 0.9, true),
    eye: new THREE.MeshBasicMaterial({ color: '#1b1210' }),
  };
  m.cloth.side = THREE.DoubleSide; m.plume.side = THREE.DoubleSide;
  for (const k of ['skin', 'hair', 'cloth', 'plume', 'leather', 'metal', 'trim']) m[k].userData.base = m[k].emissive.clone();
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
  dual: { attack1: { wind: .14, strike: .08, over: .04, rec: .26 }, attack2: { wind: .14, strike: .08, over: .04, rec: .26 }, attack3: { wind: .34, strike: .12, over: .06, rec: .50 } },
};
export function attackInfo(weapon, name) { const T = ATTACK_TIMING[weapon][name]; return { dur: T.wind + T.strike + T.over + T.rec, swingAt: T.wind, hitAt: T.wind + T.strike * 0.85, recoverAt: T.wind + T.strike + T.over }; }

function attackClip(weapon, name, stance, poses) {
  const T = ATTACK_TIMING[weapon][name], t1 = T.wind, t2 = t1 + T.strike, t3 = t2 + T.over, t4 = t3 + T.rec;
  const keys = [
    { t: 0, p: 'guard' },
    { t: t1, p: poses.wind, e: 'outCubic' },        // anticipation: decelerate into the coil
    { t: t1 + 0.035, p: poses.windHold, e: 'linear' }, // tiny creeping hold sells the load
    { t: t2, p: poses.strike, e: 'inCubic' },        // accelerate through the hit
    { t: t3, p: poses.follow, e: 'outQuad' },        // follow-through overshoot
    { t: t4, p: 'guard', e: 'inOutCubic' },          // settle back to guard
  ];
  // windHold shifts after t1: keep strike time stable by clamping
  keys[2].t = Math.min(keys[2].t, t2 - 0.01);
  const c = keyClip(name, keys, { mask: 'full', events: [{ t: t1, name: 'swing' }, { t: t1 + T.strike * 0.85, name: 'hit' }], weapon }, stance);
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
        wind: { chest: [0.0, -0.6, 0], hips: [0, -0.65, 0], shoulderR: [-0.3, 0.1, -0.2], elbowR: [-1.9, 0, 0], wristR: [-0.4, 0, 0], hip: [0, -0.1, -0.06], body: [0, 0, -0.1], kneeL: [0.55, 0, 0], kneeR: [0.6, 0, 0] },
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
        wind: { chest: [-0.15, -0.9, 0], hips: [0, -0.9, 0], shoulderR: [-0.1, 0.1, -0.2], elbowR: [-2.0, 0, 0], wristR: [-0.4, 0, 0], hip: [0, -0.2, -0.1], body: [0, 0, -0.18], kneeL: [0.7, 0, 0], kneeR: [0.9, 0, 0] },
        windHold: { chest: [-0.2, -1.0, 0], hips: [0, -1.0, 0], body: [0, 0, -0.22] },
        strike: { chest: [0.3, 0.55, 0], hips: [0, 0.35, 0], shoulderR: [-1.4, 0, -0.1], elbowR: [-0.05, 0, 0], wristR: [-0.2, 0, 0], hip: [0, -0.3, 0.05], body: [0, 0, 0.55], kneeL: [1.3, 0, 0], hipL: [-1.05, 0, 0.1], kneeR: [0.05, 0, 0], hipR: [0.7, 0, -0.1] },
        follow: { chest: [0.38, 0.6, 0], body: [0, 0, 0.62], hip: [0, -0.34, 0.05] },
      },
    },
  },
};
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
  P.clear(); const al = c.alert, br = Math.sin(t * Math.PI * 2 / 3.4), sh = Math.sin(t * Math.PI * 2 / 7.3);
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
function buildStateClips(stance) {
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
    { t: 0.11, p: { chest: [0.14, -0.1, 0], spine: [0.08, 0, 0], head: [-0.14, 0.3, 0], shoulderL: [-1.3, 0.3, 0.15], elbowL: [-1.95, 0, 0], wristL: [-0.2, 0, 0], shoulderR: [-0.75, 0, -0.45], elbowR: [-1.5, 0, 0], hip: [0, -0.14, 0], kneeL: [0.7, 0, 0], kneeR: [0.6, 0, 0], hipL: [-0.4, 0, 0.12], body: [0, 0, -0.04] }, e: 'outBack' },
    { t: 0.5, p: { chest: [0.16, -0.12, 0], shoulderL: [-1.35, 0.3, 0.15] }, e: 'inOutSine' },
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
  return clips;
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

// ---------------------------------------------------------------- builder
// opts: {palette, build:{bulk,height,shoulder}, torso:'skin'|'cloth'|'leather'|'metal', armsBare, legsBare, hair:'short'|'none', boots, belt, loincloth, name}
export function buildGladiator(opts = {}) {
  const pal = Object.assign({}, DEFAULT_PALETTE, opts.palette || {}), mats = makeMaterials(pal);
  const bd = Object.assign({ bulk: 1, height: 1, shoulder: 1, seg: 6 }, opts.build || {}), B = bd.bulk, S = bd.seg;
  const root = new THREE.Group(); root.name = opts.name || 'gladiator'; const body = new THREE.Group(); body.name = 'body'; root.add(body); body.scale.setScalar(bd.height);
  const J = {}; const mk = (n, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = n; o.position.set(x, y, z); parent.add(o); J[n] = o; return o; };
  mk('hips', body, 0, DIM.hipY, 0); mk('spine', J.hips, 0, DIM.spineY, 0); mk('chest', J.spine, 0, DIM.chestY, 0); mk('neck', J.chest, 0, DIM.neckY, 0); mk('head', J.neck, 0, DIM.headY, 0);
  const shx = DIM.shoulderX * bd.shoulder;
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    mk('shoulder' + s, J.chest, sg * shx, DIM.shoulderY, 0); mk('elbow' + s, J['shoulder' + s], 0, -DIM.upperArm, 0); mk('wrist' + s, J['elbow' + s], 0, -DIM.foreArm, 0);
    mk('hip' + s, J.hips, sg * DIM.hipX, -DIM.hipSocketY, 0); mk('knee' + s, J['hip' + s], 0, -DIM.thigh, 0); mk('ankle' + s, J['knee' + s], 0, -DIM.shin, 0);
  }
  for (const n of JOINTS) J[n].rotation.order = ORDER[n] || 'XYZ';
  const torsoMat = mats[opts.torso || 'skin'] || mats.skin, legMat = opts.legsBare === false ? mats.cloth : mats.skin, armMat = opts.armsBare === false ? mats.cloth : mats.skin;
  const add = (parent, geo, mat, name, x = 0, y = 0, z = 0) => { const m = mesh(geo, mat, name); m.position.set(x, y, z); parent.add(m); return m; };

  // torso: pelvis, abdomen, chest (elliptical lathes), neck, head
  add(J.hips, lathe([[0, -0.14], [0.14, -0.12], [0.185 * B, -0.02], [0.19 * B, 0.06], [0.15 * B, 0.12], [0, 0.13]], 9, 1, 0.7, 0.08, 0.9), mats.cloth, 'pelvis');
  add(J.spine, lathe([[0, -0.1], [0.15 * B, -0.08], [0.16 * B, 0.05], [0.17 * B, 0.2], [0, 0.22]], 9, 1, 0.7, 0.06, 0.9), torsoMat, 'abdomen');
  add(J.chest, lathe([[0, -0.03], [0.17 * B, -0.02], [0.215 * B, 0.1], [0.245 * B, 0.2], [0.23 * B, 0.29], [0.13, 0.36], [0, 0.37]], 9, 1, 0.7, 0.08, 0.9), torsoMat, 'chest');
  add(J.neck, lathe([[0, -0.04], [0.065, -0.04], [0.058, 0.04], [0.055, 0.09], [0, 0.1]], 6, 1, 1, 0.2, 0.8), mats.skin, 'neck');
  const head = J.head;
  add(head, lathe([[0, -0.015], [0.055, -0.005], [0.08, 0.04], [0.098, 0.1], [0.105, 0.15], [0.09, 0.21], [0.05, 0.245], [0, 0.255]], 9, 0.93, 1.06, 0.15, 0.85), mats.skin, 'skull', 0, 0, 0.0);
  add(head, new THREE.ConeGeometry(0.018, 0.045, 4), mats.skin, 'nose', 0, 0.105, 0.108).rotation.x = Math.PI / 2 + 0.25;
  addAO(head.children[head.children.length - 1].geometry, 0, 1);
  add(head, boxG(0.15, 0.014, 0.03), mats.hair, 'brow', 0, 0.14, 0.088);
  for (const sg of [-1, 1]) add(head, boxG(0.022, 0.012, 0.01), mats.eye, 'eye', sg * 0.036, 0.122, 0.1);
  if ((opts.hair || 'short') !== 'none') {
    const h = add(head, lathe([[0.098, 0.15], [0.108, 0.17], [0.095, 0.225], [0.055, 0.255], [0, 0.266]], 8, 0.96, 1.06, 0.1, 0.8), mats.hair, 'hair', 0, 0.0, -0.02); J.hair = h;
  }
  // arms
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    add(J['shoulder' + s], sphereG(0.07 * B, 6, 4), torsoMat === mats.skin ? mats.skin : torsoMat, 'deltoid' + s);
    add(J['shoulder' + s], capsule(DIM.upperArm, 0.068 * B, 0.054 * B, S, 0.12), armMat, 'upperArm' + s);
    add(J['elbow' + s], capsule(DIM.foreArm, 0.054 * B, 0.04 * B, S, 0.14), armMat, 'foreArm' + s);
    const hand = add(J['wrist' + s], lathe([[0, -0.115], [0.036, -0.07], [0.042, -0.01], [0, 0.02]], 5, 1.0, 0.8, 0.15, 0.85), mats.skin, 'hand' + s);
    // socket: weapon authored along +Y with grip at origin; Rx(pi) maps weapon +Y to wrist -Y (blade continues the forearm).
    const sock = new THREE.Object3D(); sock.name = 'hand' + s + 'Socket'; sock.position.set(0, -0.075, 0); sock.rotation.x = Math.PI; J['wrist' + s].add(sock); J['hand' + s] = sock;
    // legs
    add(J['hip' + s], capsule(DIM.thigh, 0.1 * B, 0.066 * B, S, 0.1), legMat, 'thigh' + s);
    add(J['knee' + s], capsule(DIM.shin, 0.066 * B, 0.045 * B, S, 0.14), legMat, 'shin' + s);
    const foot = lathe([[0, -0.11], [0.05, -0.06], [0.05, 0.06], [0.036, 0.13], [0.0, 0.16]], 5, 1, 1.0, 0.1, 0.85); foot.rotateX(Math.PI / 2); foot.scale(1, 1, 0.55);
    foot.translate(0, -DIM.footH + 0.03, 0.04);
    add(J['ankle' + s], foot, opts.boots === false ? mats.skin : mats.leather, 'foot' + s);
  }
  if (opts.belt !== false) add(J.spine, lathe([[0.152 * B, -0.06], [0.162 * B, -0.06], [0.162 * B, 0.0], [0.152 * B, 0.0]], 9, 1, 0.72, 0, 1), mats.leather, 'belt').position.y = 0.01;

  // sockets
  const sk = {}; const sockets = (n, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = n; o.position.set(x, y, z); parent.add(o); sk[n] = o; return o; };
  sockets('helm', J.head, 0, 0.13, 0); sockets('back', J.chest, 0, 0.2, -0.13); sockets('cloakTop', J.chest, 0, 0.3, -0.13); sockets('beltFront', J.hips, 0, 0.06, 0.12); sockets('beltL', J.hips, 0.17, 0.0, 0); sockets('beltR', J.hips, -0.17, 0.0, 0); sockets('forearmL', J.elbowL, 0, -0.13, 0.0); sockets('chestFront', J.chest, 0, 0.16, 0.17);
  sockets('beltBack', J.hips, 0, 0.02, -0.12);

  // squash/stretch, flash
  const squash = new Spring1(300, 17); const flashState = { t: 0, dur: 0.12, color: new THREE.Color(1, 0.85, 0.7) };

  const rig = {
    root, body, joints: J, sockets: sk, mats, palette: pal, secondary: [], squash, flashState, build: bd, opts,
    mounts: [], // extra Object3D to dispose
    setPalette(p) { Object.assign(pal, p); mats.skin.color.set(pal.skin); mats.hair.color.set(pal.hair); mats.cloth.color.set(pal.cloth); mats.plume.color.set(pal.plume); mats.metal.color.set(pal.metal); },
    flash(dur = 0.12, color) { flashState.t = dur; flashState.dur = dur; if (color) flashState.color.set(color); },
    squashKick(a) { squash.kick(a); },
    // attach a cloth/chain secondary effect; returns it
    addSecondary(sec) { rig.secondary.push(sec); const m = sec.mesh || sec.group; root.add(m); return sec; },
    triangles() { let n = 0; root.traverse((o) => { if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n | 0; },
    resetSecondary() { for (const s of rig.secondary) s.reset(); },
    update(dt) {
      rig.animator.update(dt);
      root.updateMatrixWorld(true);
      rig.animator.postIK();
      root.updateMatrixWorld(true);
      for (const s of rig.secondary) s.update(dt);
      const sq = squash.update(dt); body.scale.set(bd.height / Math.sqrt(1 + sq), bd.height * (1 + sq), bd.height / Math.sqrt(1 + sq));
      if (flashState.t > 0) { flashState.t = Math.max(0, flashState.t - dt); }
      const f = flashState.t > 0 ? flashState.t / flashState.dur : 0;
      for (const k of ['skin', 'hair', 'cloth', 'plume', 'leather', 'metal', 'trim']) { const m = mats[k]; m.emissive.copy(m.userData.base); if (f > 0) m.emissive.lerp(flashState.color, f); m.emissiveIntensity = 1; }
    },
    dispose() { root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const k in mats) mats[k].dispose(); },
  };
  rig.animator = new Animator(rig, opts.weapon || 'unarmed');
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
// Plume helper (horsehair crest) on the helm socket.
export function addPlume(rig, o = {}) {
  const rows = o.rows || 6, tall = o.tall || 1;
  const g = new ChainMesh({
    anchor: rig.sockets.helm, rows, rowLen: 0.058 * tall, stiff: 0.22, stiffFall: 0.8, damping: 0.93, gravity: -4,
    shape: (r) => new V3(0, 0.05 * r * tall - 0.002 * r * r, -0.012 * r * r * 0.9 + 0.02), material: o.material || rig.mats.plume, radius: [0.036, 0.012], flat: [0.45, 1.6], name: 'plume',
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
const MAKE_IDS = ['sample'];
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
    this.restPos = new V3(0, DIM.hipY, 0);
  }
  setWeapon(name) {
    this.weaponName = name; const st = WEAPON_POSES[name] || WEAPON_POSES.unarmed; this.stance = st; this.clips = buildStateClips(st);
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
    if (clip.additive) { this.add = clip; this.addT = 0; this.addAmp = o.amp ?? 1; this.addDir = o.dir ?? 1; return clip; }
    this.snapshot(o.fade ?? (this.action ? 0.07 : 0.06)); this.action = clip; this.actionT = 0; this.actionSpeed = o.speed ?? 1; this.actionReleasing = false; this.actionW = 0; this.actionFired = 0;
    const moving = Math.hypot(this.mv.vx, this.mv.vz) > 0.6;
    this.actionMask = o.mask || (clip.name.startsWith('attack') || clip.name === 'taunt' ? (moving ? 'upper' : 'full') : clip.mask);
    if (name === 'death') this.dead = true; return clip;
  }
  release(fade = 0.18) { if (this.action && this.action.hold && !this.dead) { this.snapshot(fade); this.action = null; } }
  hurt(dir = 1, amp = 1) { this.play(this.action && this.action.name === 'block' ? 'blockHit' : 'hurt', { dir, amp }); }
  hitStop(dur = 0.06) { this.hitStopT = dur; }
  clipInfo(name) { const c = this.clips[name]; return c ? { dur: c.dur, loop: c.loop, hold: c.hold, ...(c.info || {}) } : null; }
  fire(n, clip) { if (this.onEvent) this.onEvent(n, clip); if (this.rig.onEvent) this.rig.onEvent(n, clip); }

  ctx() { return { armed: this.armed, alert: this.alert, stance: this.stance }; }
  sampleBase(P) {
    const c = this.ctx(), mv = this.mv, s = Math.hypot(mv.vx, mv.vz), t = this.t;
    if (this.state !== 'move') { const clip = this.clips[this.state]; if (clip) return clip.sample(this.stateT, P); }
    if (s < 0.05 && Math.abs(this.mv.phase) < 1e9) { return idleSample(t, P, c); }
    const walkW = smooth(0.15, 1.1, s) * (1 - smooth(2.6, 4.4, s)), runW = smooth(2.6, 4.4, s), idleW = 1 - smooth(0.15, 1.1, s);
    const side = Math.abs(mv.vx) / (s + 1e-4), back = mv.vz < -0.05;
    const ph = this.mv.phase;
    idleSample(t, this.PA, c);
    const stride = lerp(1.55, 2.9, runW / (walkW + runW + 1e-4));
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
        if (this.actionMask === 'upper') { out.hip.y += 0; }
      }
    }
    // snapshot crossfade (inertial blend from the pose we left)
    if (this.snapW > 0) { this.snapW = Math.max(0, this.snapW - dt / this.snapDur); const w = ease.inOutCubic(this.snapW); if (out !== this.QC) { this.QC.copy(out); out = this.QC; } blendQ(this.QC, this.snap, w, null, this.QB); out = this.QB; }
    // additive layer (hurt flinch)
    if (this.add) {
      this.addT += dt; const clip = this.add;
      if (this.addT >= clip.dur) this.add = null; else {
        clip.sample(this.addT, this.PB);
        const amp = this.addAmp, d = this.addDir; // d>0: hit from front (recoil back); d<0 from behind (lurch forward)
        for (let i = 0; i < JOINTS.length; i++) { this.PB.r[i * 3] *= amp * (JOINTS[i].startsWith('hip') && JOINTS[i].length === 4 ? 1 : d); this.PB.r[i * 3 + 1] *= amp; this.PB.r[i * 3 + 2] *= amp; }
        this.PB.hip[2] *= amp * d; this.PB.hip[1] *= amp;
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
  a.finalGround = P.ground; a.finalLock = P.lock; a.groundFix = 0; rig.root.updateMatrixWorld(true); a._dt = 1; a.postIK(); rig.root.updateMatrixWorld(true);
}
