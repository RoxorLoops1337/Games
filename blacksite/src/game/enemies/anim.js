// Animation maths for the enemy rig: springs, two-bone IK, gait timing and a
// small verlet body for death.
//
// Nothing in here knows about the game state or about Three's scene graph — it
// takes numbers and vectors and gives numbers and vectors back, so the poser can
// be reasoned about (and, when the AI finally spawns something, debugged) without
// a renderer in the way. Every routine writes into caller-supplied objects: a
// twenty-body crowd re-poses forty limbs a frame and the garbage collector must
// never hear about it.

import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Shortest signed angle. Every yaw in here is a difference between two headings,
// and without this a body turning past π spins the long way round exactly once,
// which is the single most obvious procedural-animation tell there is.
export function wrapPi(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

// Frame-rate independent approach. Lerping by a constant per frame makes a
// character settle faster on a 144 Hz machine than on a 60 Hz one; the
// exponential does not care.
export function approach(a, b, rate, dt) {
  return a + (b - a) * (1 - Math.exp(-rate * dt));
}

export function makeSpring(x = 0) { return { x, v: 0 }; }

// A damped spring, integrated semi-implicitly. Used for every impulse the body
// absorbs — recoil, flinch, the landing of a stride — because an impulse that
// decays exponentially reads as a fade and an impulse that overshoots reads as a
// body with weight in it.
export function springStep(s, target, stiff, damp, dt) {
  s.v += ((target - s.x) * stiff - s.v * damp) * dt;
  s.x += s.v * dt;
  return s.x;
}

// ── gait ─────────────────────────────────────────────────────────────────────
//
// Frequency is per *cycle* (both feet), not per step: a jog at 3 m/s is about
// 1.2 cycles a second, and getting this factor-of-two wrong is what makes
// procedural walkers look like they are running on the spot.

export function gaitFreq(speed) { return 0.74 + 0.16 * speed; }

// Fraction of the cycle a foot spends on the ground. Walking is double-support
// most of the time; a run has a flight phase, so duty drops below 0.5.
export function gaitDuty(speed) { return clamp(0.64 - 0.05 * speed, 0.34, 0.64); }

// ── two-bone IK ──────────────────────────────────────────────────────────────

const _d = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _tmp = new THREE.Vector3();

// Places the middle joint of a two-bone chain so the end lands on `target`, with
// `pole` deciding which way the joint bends. Reach is clamped just short of full
// extension: a limb allowed to lock dead straight reads as a mannequin's, and it
// is also where the solver would divide by zero.
export function solveTwoBone(root, target, l1, l2, pole, outMid, outEnd) {
  _d.subVectors(target, root);
  let d = _d.length();
  if (d < 1e-5) { _d.set(0, -1, 0); d = 1; }
  _d.multiplyScalar(1 / d);
  const dc = clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.995);
  outEnd.copy(root).addScaledVector(_d, dc);

  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));

  _ax.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_ax.lengthSq() < 1e-8) {
    // Pole parallel to the limb — any perpendicular will do rather than a NaN.
    _ax.set(-_d.y, _d.x, 0);
    if (_ax.lengthSq() < 1e-8) _ax.set(0, 0, 1);
  }
  _ax.normalize();
  outMid.copy(root).addScaledVector(_d, a).addScaledVector(_ax, h);
  return outMid;
}

// ── orientation helpers ──────────────────────────────────────────────────────

const _m = new THREE.Matrix4();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();

// Every bone in this rig is authored with its +Y running from the joint toward
// its child, so aiming a bone is "point +Y down the limb, then twist so +Z faces
// the reference". `ref` is what stops the elbow and the knee from spinning.
export function boneQuat(out, yDir, ref) {
  _by.copy(yDir);
  if (_by.lengthSq() < 1e-10) _by.set(0, 1, 0); else _by.normalize();
  _bz.copy(ref).addScaledVector(_by, -ref.dot(_by));
  if (_bz.lengthSq() < 1e-8) {
    _bz.set(0, 0, 1).addScaledVector(_by, -_by.z);
    if (_bz.lengthSq() < 1e-8) _bz.set(1, 0, 0);
  }
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  _m.makeBasis(_bx, _by, _bz);
  return out.setFromRotationMatrix(_m);
}

// Orientation whose local −Z points along `forward`, matching the convention the
// rest of the game uses for facing (and the one a camera uses).
export function aimQuat(out, forward, up) {
  _bz.copy(forward).multiplyScalar(-1);
  if (_bz.lengthSq() < 1e-10) _bz.set(0, 0, 1); else _bz.normalize();
  _bx.crossVectors(up, _bz);
  if (_bx.lengthSq() < 1e-8) _bx.set(1, 0, 0).addScaledVector(_bz, -_bz.x);
  _bx.normalize();
  _by.crossVectors(_bz, _bx);
  _m.makeBasis(_bx, _by, _bz);
  return out.setFromRotationMatrix(_m);
}

// Yaw of a direction under this game's convention: heading 0 faces −Z.
export function yawOf(x, z) { return Math.atan2(-x, -z); }

// ── verlet body ──────────────────────────────────────────────────────────────
//
// Death is the one moment a canned animation cannot survive: the pose the body
// died in is never the pose the clip starts from. Ten points and a fistful of
// distance constraints is enough to fall convincingly, and it costs less than
// blending two clips would have.

export function createVerlet(names) {
  const n = names.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push({
      name: names[i],
      p: new THREE.Vector3(), o: new THREE.Vector3(),   // position, previous position
      r: 0.08, pin: 0,
    });
  }
  return { pts, index: names.reduce((m, s, i) => (m[s] = i, m), {}), links: [], groundY: 0, rest: 0 };
}

export function linkVerlet(body, a, b, stiff = 1, slack = 0) {
  const ia = body.index[a], ib = body.index[b];
  body.links.push({ a: ia, b: ib, len: body.pts[ia].p.distanceTo(body.pts[ib].p) * (1 + slack), stiff });
}

const _delta = new THREE.Vector3();

// Position Verlet: velocity is implicit in (p − o), so an impulse is applied by
// moving the previous position, and a collision that clamps p also kills exactly
// the component of velocity it should. Nothing here needs a velocity array.
export function stepVerlet(body, dt, gravity) {
  const pts = body.pts;
  const drag = Math.exp(-0.6 * dt);
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i];
    if (q.pin) continue;
    const vx = (q.p.x - q.o.x) * drag, vy = (q.p.y - q.o.y) * drag, vz = (q.p.z - q.o.z) * drag;
    q.o.copy(q.p);
    q.p.x += vx; q.p.y += vy + gravity * dt * dt; q.p.z += vz;
  }
  for (let it = 0; it < 4; it++) {
    const links = body.links;
    for (let i = 0; i < links.length; i++) {
      const L = links[i], A = pts[L.a], B = pts[L.b];
      _delta.subVectors(B.p, A.p);
      const d = _delta.length() || 1e-6;
      const k = ((d - L.len) / d) * 0.5 * L.stiff;
      A.p.addScaledVector(_delta, k);
      B.p.addScaledVector(_delta, -k);
    }
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      const floor = body.groundY + q.r;
      if (q.p.y < floor) {
        q.p.y = floor;
        // Ground friction, applied by dragging the previous position toward the
        // current one. A corpse that slides is a corpse on ice.
        q.o.x = lerp(q.o.x, q.p.x, 0.45);
        q.o.z = lerp(q.o.z, q.p.z, 0.45);
        if (q.o.y < q.p.y) q.o.y = q.p.y - (q.p.y - q.o.y) * 0.25;
      }
    }
  }
  let motion = 0;
  for (let i = 0; i < pts.length; i++) motion += pts[i].p.distanceToSquared(pts[i].o);
  return Math.sqrt(motion / pts.length) / Math.max(dt, 1e-4);
}

export { _tmp as scratchVec };
