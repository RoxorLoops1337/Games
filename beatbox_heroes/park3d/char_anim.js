// CHARACTER ANIMATOR: procedural poses, two-bone IK with foot planting, damped springs, crossfaded clips.
// A Pose is a flat bag of numbers (FK angles, IK targets in rig space, face channels). Clips fill a pose, poses blend, apply() drives the bones.
// Conventions (rig space: y up, +z forward, character LEFT = +x). Angles in radians:
//   hipsRX>0 leans forward; shRX>0 swings an arm forward; shRZ>0 abducts (arm away from the body); elRX>0 flexes the elbow (forearm forward);
//   thRX>0 lifts the thigh forward; knRX>0 flexes the knee (shin back); fPitch>0 toes up.
const PI = Math.PI, TAU = PI * 2, S = Math.sin, Cs = Math.cos;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t, sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const mod = (a, n) => ((a % n) + n) % n;

const SCAL = ['hipsX', 'hipsY', 'hipsZ', 'hipsRX', 'hipsRY', 'hipsRZ', 'spineRX', 'spineRY', 'spineRZ', 'chestRX', 'chestRY', 'chestRZ', 'neckRX', 'neckRY', 'neckRZ', 'headRX', 'headRY', 'headRZ', 'sq',
  'mouthOpen', 'mouthW', 'cheek', 'blink', 'eyeX', 'eyeY', 'brow', 'browTilt', 'shrug'];
const LIMB_FK = ['shRX', 'shRY', 'shRZ', 'elRX', 'wrRX', 'wrRZ', 'thRX', 'thRZ', 'knRX', 'anRX'];
export const mkPose = () => {
  const p = {}; SCAL.forEach((k) => { p[k] = 0; }); p.mouthW = 1;
  ['L', 'R'].forEach((s) => {
    LIMB_FK.forEach((k) => { p[k + s] = 0; });
    p['aW' + s] = 0; p['aX' + s] = 0; p['aY' + s] = 0.8; p['aZ' + s] = 0.1; p['pX' + s] = 0; p['pY' + s] = -1; p['pZ' + s] = -0.3;
    p['hW' + s] = 0; p['hX' + s] = 0; p['hY' + s] = -1; p['hZ' + s] = 0;
    p['lW' + s] = 0; p['lX' + s] = 0; p['lY' + s] = 0.085; p['lZ' + s] = 0; p['fP' + s] = 0; p['fY' + s] = 0; p['kX' + s] = 0.12;
  });
  return p;
};
// blend b into a by f (in place on a copy)
function blendPose(a, b, f, out) {
  for (const k in a) out[k] = a[k] + (b[k] - a[k]) * f;
  ['L', 'R'].forEach((s) => {
    [['aW', ['aX', 'aY', 'aZ', 'pX', 'pY', 'pZ']], ['hW', ['hX', 'hY', 'hZ']], ['lW', ['lX', 'lY', 'lZ', 'fP', 'fY', 'kX']]].forEach(([w, ks]) => {
      const wa = a[w + s] * (1 - f), wb = b[w + s] * f, tot = wa + wb;
      ks.forEach((k) => { out[k + s] = tot > 1e-5 ? (a[k + s] * wa + b[k + s] * wb) / tot : a[k + s]; });
    });
  });
  return out;
}

export class Animator {
  constructor(api, rig, THREE) {
    this.api = api; this.rig = rig; this.T = THREE; this.B = rig.map; this.t = 0; this.clip = 'idle'; this.opts = { speed: 0, bpm: 100 };
    this.cur = null; this.prev = null; this.fade = 1; this.fadeDur = 0.15; this.pose = mkPose(); this.pA = mkPose(); this.pB = mkPose(); this.pC = mkPose();
    const T = THREE; this.q1 = new T.Quaternion(); this.q2 = new T.Quaternion(); this.q3 = new T.Quaternion(); this.e = new T.Euler(0, 0, 0, 'YXZ'); this.m1 = new T.Matrix4(); this.m2 = new T.Matrix4(); this.m3 = new T.Matrix4(); this.m4 = new T.Matrix4(); this.v1 = new T.Vector3(); this.v2 = new T.Vector3(); this.v3 = new T.Vector3(); this.v4 = new T.Vector3(); this.v5 = new T.Vector3();
    this.life = { blinkT: 1.5, blink: 0, gaze: [0, 0], gazeT: 0, shift: 0, shiftT: 3, shiftTarget: 0 };
    this.sp = {}; this.vs = 0; this.accel = 0; this.sqS = { x: 0, v: 0 }; this.leanS = { x: 0, v: 0 }; this.lookT = null; this.lookW = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.prevPos = {}; this.accW = {};
    this.once = null;
  }
  refit(d, rest) { this.d = d; this.rest = rest; this.armLen = [0.19, 0.165]; this.legLen = [0.2, 0.175]; }
  finishInit() {
    const B = this.B, names = ['puffL', 'puffR', 'hairB', 'hairB2', 'hairSL', 'hairSR', 'brim', 'tail', 'beard', 'chain', 'cape', 'hem'];
    // [parentFrame, direction, k, c, gain] : dir -1 hangs below its pivot, +1 sticks out above, 0 flaps forward (driven by vertical accel)
    const cfg = { puffL: ['head', 1, 140, 7, 0.05], puffR: ['head', 1, 140, 7, 0.05], hairB: ['head', -1, 90, 5.5, 0.07], hairB2: ['hairB', -1, 120, 6, 0.06], hairSL: ['head', -1, 110, 6, 0.07], hairSR: ['head', -1, 110, 6, 0.07], brim: ['head', 0, 220, 14, 0.03], tail: ['head', -1, 80, 5, 0.08], beard: ['head', -1, 100, 6, 0.07], chain: ['chest', -1, 120, 5.5, 0.08], cape: ['chest', -1, 70, 4.5, 0.07], hem: ['hips', -1, 150, 8, 0.05] };
    names.forEach((n) => { this.sp[n] = { b: B[n], cfg: cfg[n], x: 0, vx: 0, z: 0, vz: 0, ph: Math.random() * 6 }; });
    this.play('idle', {});
    this.update(0.016, 0);
  }
  play(clip, opts) {
    if (!this.CL[clip]) clip = 'idle';
    opts = opts || {}; const same = clip === this.clip && this.cur;
    Object.assign(this.opts, opts);
    if (!same) {
      this.prev = this.cur; this.fade = this.prev ? 0 : 1; this.fadeDur = opts.fade === undefined ? 0.15 : Math.max(0.001, opts.fade);
      this.clip = clip; this.cur = { name: clip, t: 0, st: {} };
      if (clip === 'beatbox' || clip === 'dance') this.opts.t0 = undefined;
    }
    this.once = opts.duration ? { left: opts.duration, then: opts.then || 'idle' } : null;
  }
  setLookAt(p) { this.lookT = p || null; }

  // ------------------------------------------------------------------ main update
  update(dt, t) {
    dt = Math.min(dt, 0.05); this.t += dt; const o = this.opts;
    if (!this.cur) return;
    if (this.once) { this.once.left -= dt; if (this.once.left <= 0) { const th = this.once.then; this.once = null; this.play(th, {}); } }
    // smoothed speed + start/stop squash
    const target = (this.clip === 'walk' || this.clip === 'run') ? (o.speed || 0) : 0, vp = this.vs;
    this.vs += (target - this.vs) * (1 - Math.exp(-12 * dt)); this.accel += ((this.vs - vp) / Math.max(dt, 1e-3) - this.accel) * (1 - Math.exp(-14 * dt));
    if (vp < 0.35 && this.vs >= 0.35 && target > 0.6) this.sqS.v -= 0.9;           // anticipation crouch on start
    if (vp > 0.9 && this.vs <= 0.9 && target < 0.4) this.sqS.v -= 1.5;             // brake squash on stop
    { const s = this.sqS; s.v += (-190 * s.x - 15 * s.v) * dt; s.x += s.v * dt; }
    { const l = this.leanS, tg = clamp(this.accel * 0.012, -0.12, 0.12); l.v += (-110 * (l.x - tg) - 12 * l.v) * dt; l.x += l.v * dt; }
    this.cur.t += dt; const P = this.pose, fn = this.CL[this.cur.name];
    const A = this.pA; Object.assign(A, mkPose()); fn.call(this, A, this.cur, dt, o);
    if (this.fade < 1 && this.prev) {
      this.prev.t += dt; const Bp = this.pB; Object.assign(Bp, mkPose()); this.CL[this.prev.name].call(this, Bp, this.prev, dt, o);
      this.fade = Math.min(1, this.fade + dt / this.fadeDur); blendPose(Bp, A, sm(this.fade), P); if (this.fade >= 1) this.prev = null;
    } else Object.assign(P, A);
    this.life_(P, dt);
    this.apply(P, dt);
  }

  // ------------------------------------------------------------------ life layer: blink, gaze, weight shift, look-at
  life_(P, dt) {
    const L = this.life, t = this.t;
    L.blinkT -= dt; if (L.blinkT <= 0) { L.blink = 1; L.blinkT = 2.2 + Math.random() * 3.2; if (Math.random() < 0.18) L.blinkT = 0.28; }
    if (L.blink > 0) { L.blink -= dt / 0.17; } const bl = L.blink > 0 ? Math.sin(clamp(1 - L.blink, 0, 1) * PI) : 0;
    P.blink = Math.max(P.blink, bl);
    L.gazeT -= dt; if (L.gazeT <= 0) { L.gazeT = 0.8 + Math.random() * 2.4; L.gaze = [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8]; }
    P.eyeX += L.gaze[0] * 0.6; P.eyeY += L.gaze[1] * 0.6;
    // look-at (world point) -> head yaw / pitch
    if (this.lookT) {
      const o = this.api.object; this.v1.copy(this.lookT); o.worldToLocal(this.v1); const hy = this.rest ? this.rest.head[1] + 0.3 : 1.3, dx = this.v1.x, dz = this.v1.z, dy = this.v1.y - hy;
      const yaw = clamp(Math.atan2(dx, dz), -0.9, 0.9), pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.4, 0.4);
      this.lookYaw += (yaw - this.lookYaw) * (1 - Math.exp(-6 * dt)); this.lookPitch += (pitch - this.lookPitch) * (1 - Math.exp(-6 * dt)); this.lookW += (1 - this.lookW) * (1 - Math.exp(-5 * dt));
    } else this.lookW += (0 - this.lookW) * (1 - Math.exp(-5 * dt));
    P.headRY += this.lookYaw * 0.55 * this.lookW; P.neckRY += this.lookYaw * 0.35 * this.lookW; P.headRX += this.lookPitch * 0.7 * this.lookW; P.eyeX += this.lookYaw * 0.8 * this.lookW; void t;
    // squash spring
    P.sq += this.sqS.x; P.hipsRX += this.leanS.x;
  }

  // ------------------------------------------------------------------ apply pose to bones (+ IK + face + springs)
  apply(P, dt) {
    const B = this.B, e = this.e, T = this.T, R = this.rest; if (!R) return;
    const set = (b, x, y, z) => { e.set(x, y, z, 'YXZ'); b.quaternion.setFromEuler(e); };
    const hips = B.hips, hr = hips.userData.rest;
    const sqy = 1 + P.sq, sqx = 1 / Math.sqrt(sqy);
    hips.position.set(hr[0] + P.hipsX, hr[1] + P.hipsY + P.sq * 0.25, hr[2] + P.hipsZ);
    set(hips, P.hipsRX, P.hipsRY, P.hipsRZ); set(B.spine, P.spineRX, P.spineRY, P.spineRZ); set(B.chest, P.chestRX, P.chestRY, P.chestRZ); set(B.neck, P.neckRX, P.neckRY, P.neckRZ); set(B.head, P.headRX, P.headRY, P.headRZ);
    B.spine.scale.set(sqx, sqy, sqx); B.chest.scale.set(1, 1, 1);
    // matrices for the IK frames (rig space = object space)
    hips.updateMatrix(); B.spine.updateMatrix(); B.chest.updateMatrix(); B.neck.updateMatrix(); B.head.updateMatrix();
    const mH = this.m1.copy(hips.matrix), mC = this.m2.copy(hips.matrix).multiply(B.spine.matrix).multiply(B.chest.matrix);
    const qH = this.q1.copy(hips.quaternion), qC = this.q2.copy(hips.quaternion).multiply(B.spine.quaternion).multiply(B.chest.quaternion);
    // mouth point in rig space (for mic IK)
    const mouth = this.v5.set(0, 0.12, 0.34).applyMatrix4(this.m3.copy(mC).multiply(B.neck.matrix).multiply(B.head.matrix));
    this.mouthRig = this.mouthRig || new T.Vector3(); this.mouthRig.copy(mouth);
    const sides = [1, -1];
    // ----- legs
    sides.forEach((s) => {
      const k = s > 0 ? 'L' : 'R', th = B['th' + k], kn = B['kn' + k], an = B['an' + k];
      const fk = this.q3.setFromEuler(e.set(-P['thRX' + k], 0, s * P['thRZ' + k], 'YXZ')).clone(), fkK = new T.Quaternion().setFromEuler(e.set(P['knRX' + k], 0, 0, 'YXZ'));
      const W = P['lW' + k];
      if (W > 0.001) {
        const tgt = this.v1.set(P['lX' + k], P['lY' + k], P['lZ' + k]).applyMatrix4(this.m4.copy(mH).invert());
        const r = this.ik(th, kn, this.legLen, tgt, this.v2.set(s * 0.12, 0, 1), W);
        th.quaternion.copy(fk).slerp(r.qU, W); kn.quaternion.copy(fkK).slerp(r.qL, W);
        // foot orientation in rig space -> ankle local
        const qFoot = new T.Quaternion().setFromEuler(e.set(-P['fP' + k], P['fY' + k], 0, 'YXZ')), qLeg = new T.Quaternion().copy(qH).multiply(r.qU).multiply(r.qL), qLoc = qLeg.invert().multiply(qFoot);
        an.quaternion.copy(new T.Quaternion().setFromEuler(e.set(-P['anRX' + k], 0, 0, 'YXZ'))).slerp(qLoc, W);
      } else { th.quaternion.copy(fk); kn.quaternion.copy(fkK); set(an, -P['anRX' + k], 0, 0); }
    });
    // ----- arms
    sides.forEach((s) => {
      const k = s > 0 ? 'L' : 'R', sh = B['sh' + k], el = B['el' + k], wr = B['wr' + k];
      const fkS = new T.Quaternion().setFromEuler(e.set(-P['shRX' + k], s * P['shRY' + k], s * P['shRZ' + k], 'YXZ')), fkE = new T.Quaternion().setFromEuler(e.set(-P['elRX' + k], 0, 0, 'YXZ')), fkW = new T.Quaternion().setFromEuler(e.set(-P['wrRX' + k], 0, s * P['wrRZ' + k], 'YXZ'));
      const W = P['aW' + k];
      if (W > 0.001) {
        const tgt = this.v1.set(P['aX' + k], P['aY' + k], P['aZ' + k]).applyMatrix4(this.m4.copy(mC).invert());
        const r = this.ik(sh, el, this.armLen, tgt, this.v2.set(P['pX' + k], P['pY' + k], P['pZ' + k]), W);
        sh.quaternion.copy(fkS).slerp(r.qU, W); el.quaternion.copy(fkE).slerp(r.qL, W);
        const HW = P['hW' + k];
        if (HW > 0.001) {
          const hd = this.v3.set(P['hX' + k], P['hY' + k], P['hZ' + k]).normalize(), qd = new T.Quaternion().setFromUnitVectors(this.v4.set(0, -1, 0), hd), qArm = new T.Quaternion().copy(qC).multiply(r.qU).multiply(r.qL), loc = qArm.invert().multiply(qd);
          wr.quaternion.copy(fkW).slerp(loc, HW * W);
        } else wr.quaternion.copy(fkW);
      } else { sh.quaternion.copy(fkS); el.quaternion.copy(fkE); wr.quaternion.copy(fkW); }
      // shrug raises the shoulder joint slightly
      sh.position.y = sh.userData.rest[1] + P.shrug * 0.02;
    });
    // ----- face
    const eyeS = 1 - clamp(P.blink, 0, 1) * 0.92;
    ['L', 'R'].forEach((k, i) => {
      const s = i ? -1 : 1, eye = B['eye' + k], er = eye.userData.rest; eye.scale.set(1, Math.max(0.06, eyeS), 1); eye.position.set(er[0] + P.eyeX * 0.012, er[1] + P.eyeY * 0.01, er[2]);
      const br = B['brow' + k], brr = br.userData.rest; br.position.set(brr[0], brr[1] + P.brow * 0.025, brr[2]); set(br, 0, 0, -s * P.browTilt * 0.5);
      const ch = B['cheek' + k]; ch.scale.setScalar(0.8 + P.cheek * 1.15);
    });
    B.mouth.scale.set(P.mouthW, Math.max(0.05, P.mouthOpen), 1);
    // ----- springs
    this.springs(dt, P);
    // keep anchors in sync
    this.api.object.updateMatrixWorld(true);
  }

  // two-bone IK in the parent frame of the upper bone. tgt: Vector3 in that frame. pole: bend direction hint (parent frame)
  ik(up, lo, len, tgt, pole, W) {
    const T = this.T, o = up.userData.rest, a = this.v3.set(o[0], o[1], o[2]), l1 = len[0], l2 = len[1];
    const d = new T.Vector3().subVectors(tgt, a), dist = clamp(d.length(), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002); d.normalize();
    const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const p = new T.Vector3().copy(pole).addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-6) p.set(0, 0, 1); p.normalize();
    const elbow = new T.Vector3().copy(a).addScaledVector(d, x).addScaledVector(p, h), hand = new T.Vector3().copy(a).addScaledVector(d, dist);
    const du = new T.Vector3().subVectors(elbow, a).normalize(), dl = new T.Vector3().subVectors(hand, elbow).normalize(), down = new T.Vector3(0, -1, 0);
    const qU = new T.Quaternion().setFromUnitVectors(down, du), qL = new T.Quaternion().setFromUnitVectors(down, dl), qLl = qU.clone().invert().multiply(qL);
    return { qU, qL: qLl };
  }

  // damped springs on the secondary bones, excited by the acceleration of their parent frame
  springs(dt, P) {
    if (dt <= 0) return; const T = this.T, o = this.api.object, B = this.B;
    const refs = { head: B.head, chest: B.chest, hips: B.hips, hairB: B.hairB }, now = {};
    for (const k in refs) { const w = new T.Vector3().setFromMatrixPosition(refs[k].matrixWorld); now[k] = w; }
    const acc = {}, qs = {};
    for (const k in refs) {
      const pp = this.prevPos[k], pv = this.prevVel && this.prevVel[k];
      if (!this.prevVel) this.prevVel = {};
      const v = pp ? new T.Vector3().subVectors(now[k], pp).multiplyScalar(1 / dt) : new T.Vector3(); const a = pv ? new T.Vector3().subVectors(v, pv).multiplyScalar(1 / dt) : new T.Vector3();
      this.prevPos[k] = now[k]; this.prevVel[k] = v; const qq = new T.Quaternion(); refs[k].getWorldQuaternion(qq); qs[k] = qq;
      a.clampLength(0, 45); const sm0 = this.accW[k] || new T.Vector3(); sm0.lerp(a, 1 - Math.exp(-25 * dt)); this.accW[k] = sm0;
      acc[k] = sm0.clone().applyQuaternion(qq.clone().invert());
    }
    const t = this.t;
    for (const n in this.sp) {
      const s = this.sp[n], cfg = s.cfg, pf = cfg[0] === 'hairB' ? 'head' : cfg[0], a = acc[pf] || acc.head, dir = cfg[1], k = cfg[2], c = cfg[3], g = cfg[4];
      const idle = 0.03 * S(t * 1.3 + s.ph), idle2 = 0.025 * S(t * 1.1 + s.ph * 2);
      let tx, tz; if (dir === 0) { tx = a.y * g * 0.5; tz = 0; } else { tx = dir * -a.z * g * -1; tz = dir * a.x * g; tx = dir < 0 ? a.z * g : -a.z * g; tz = dir < 0 ? -a.x * g : a.x * g; }
      tx += idle * (dir ? 1 : 0.2); tz += idle2 * (dir ? 1 : 0);
      if (n === 'hem') tx += 0.0;
      s.vx += (-k * (s.x - tx) - c * s.vx) * dt; s.x += s.vx * dt; s.vz += (-k * (s.z - tz) - c * s.vz) * dt; s.z += s.vz * dt;
      s.x = clamp(s.x, -0.8, 0.8); s.z = clamp(s.z, -0.8, 0.8); s.b.quaternion.setFromEuler(this.e.set(s.x, 0, s.z, 'YXZ'));
    }
    void P; void o;
  }
}

// ======================================================================== CLIPS
const CL = {};
Animator.prototype.CL = CL;
const stance = (P, w, yaw) => { P.lWL = P.lWR = 1; P.lXL = w; P.lXR = -w; P.lYL = P.lYR = 0.085; P.lZL = P.lZR = 0; P.fYL = yaw; P.fYR = -yaw; };
const relaxArms = (P, t, k) => { k = k || 1; P.shRZL = P.shRZR = 0.1; P.elRXL = P.elRXR = 0.14; P.shRXL = 0.04 * S(t * 1.1); P.shRXR = 0.04 * S(t * 1.1 + 2); P.wrRXL = P.wrRXR = 0.1; };

// ----- idle: breathing, weight shift, head look around
CL.idle = function (P, c, dt, o) {
  const t = c.t, L = this.life; L.shiftT -= dt; if (L.shiftT <= 0) { L.shiftT = 4 + Math.random() * 5; L.shiftTarget = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1); }
  L.shift += (L.shiftTarget - L.shift) * (1 - Math.exp(-2.2 * dt)); const sh = L.shift;
  const br = S(t * 2.2);
  P.hipsY = -0.012 + br * 0.003 - Math.abs(sh) * 0.008; P.hipsX = sh * 0.016; P.hipsRZ = -sh * 0.045; P.spineRZ = sh * 0.03; P.chestRZ = sh * 0.02; P.chestRX = br * 0.012 - 0.01; P.spineRX = 0.01;
  P.neckRY = 0.2 * S(t * 0.37) * S(t * 0.13 + 1); P.headRY = 0.25 * S(t * 0.31 + 0.5) * S(t * 0.17); P.headRX = 0.03 + 0.04 * S(t * 0.23); P.headRZ = 0.05 * S(t * 0.2) + sh * 0.03;
  stance(P, 0.105 + Math.abs(sh) * 0.008, 0.12); P.lXL += sh * 0.0; P.lYL = 0.085 + Math.max(0, -sh) * 0.0;
  relaxArms(P, t); P.shrug = br * 0.2; P.mouthOpen = 0.06; P.brow = 0.05;
  P.mouthW = 1;
};

// ----- gait shared by walk and run
function gait(P, c, dt, o, rw) {
  const v = Math.max(0, this.vs), S0 = clamp(0.13 + 0.045 * v, 0.13, 0.3), duty = lerp(0.62, 0.38, rw), st = c.st;
  if (st.ph === undefined) { st.ph = 0; }
  const rate = (duty * v) / (2 * S0); st.ph = (st.ph + rate * dt) % 1; const ph = st.ph, moving = clamp(v / 0.5, 0, 1);
  const lift = lerp(0.075, 0.2, rw) * clamp(v / 2, 0.4, 1.2);
  const foot = (p) => {
    p = mod(p, 1); let z, y, pitch;
    if (p < duty) { const u = p / duty; z = S0 * (1 - 2 * u) * moving; y = 0; pitch = lerp(0.22, -0.5, sm(u * u)); }
    else { const u = (p - duty) / (1 - duty); z = (-S0 + 2 * S0 * sm(u)) * moving; y = lift * S(PI * u) * moving; pitch = lerp(-0.5, 0.22, sm(u)) * moving + (1 - moving) * 0; if (rw > 0.5) { y *= 1 + 0.4 * rw; } }
    const ay = 0.085 + y + (pitch < 0 ? -pitch * 0.075 : 0) * moving;
    return { z, ay, pitch };
  };
  const fl = foot(ph), fr = foot(ph + 0.5);
  P.lWL = P.lWR = 1; P.lXL = 0.105; P.lXR = -0.105; P.lZL = fl.z; P.lZR = fr.z; P.lYL = fl.ay; P.lYR = fr.ay; P.fPL = fl.pitch; P.fPR = fr.pitch; P.fYL = 0.06; P.fYR = -0.06;
  const bob = Cs(4 * PI * (ph - duty / 2)), bobA = lerp(0.022, 0.05, rw), sw = S(TAU * ph), cw = Cs(TAU * ph);
  const lean = lerp(0.03, 0.2, rw) + 0.012 * Math.min(v, 5);
  P.hipsY = (-0.04 - rw * 0.03) * moving + bob * bobA * moving; P.hipsRX = lean * moving; P.hipsRY = -cw * lerp(0.1, 0.18, rw) * moving; P.hipsRZ = -sw * 0.03 * moving; P.hipsX = -sw * 0.012 * moving;
  P.spineRY = cw * 0.06 * moving; P.chestRY = cw * lerp(0.14, 0.26, rw) * moving; P.chestRX = -lean * 0.25 * moving; P.spineRX = -lean * 0.2 * moving; P.chestRZ = sw * 0.03 * moving;
  P.neckRX = -lean * 0.5; P.headRX = -lean * 0.4 + 0.02; P.neckRY = -P.chestRY * 0.5 - P.hipsRY * 0.5; P.headRZ = -sw * 0.02 * moving;
  const swing = lerp(0.42, 0.85, rw) * clamp(v / 2.2, 0.15, 1.1) * moving, flex = lerp(0.2, 1.55, rw);
  P.shRXL = swing * cw; P.shRXR = -swing * cw; P.shRZL = P.shRZR = lerp(0.1, 0.16, rw); P.elRXL = flex + (rw > 0.5 ? 0.25 * Math.max(0, cw) : 0.25 * Math.max(0, -cw) * 0.5); P.elRXR = flex + (rw > 0.5 ? 0.25 * Math.max(0, -cw) : 0.25 * Math.max(0, cw) * 0.5);
  P.wrRXL = P.wrRXR = 0.1; P.shrug = bob * 0.1 * moving; P.mouthOpen = 0.06 + rw * 0.3 + 0.06 * Math.abs(S(c.t * 7)) * rw; P.brow = 0.1 * rw;
  if (moving < 1) { P.hipsY += (1 - moving) * (-0.012); }
}
CL.walk = function (P, c, dt, o) { gait.call(this, P, c, dt, o, clamp((this.vs - 3.2) / 2, 0, 0.35)); };
CL.run = function (P, c, dt, o) { gait.call(this, P, c, dt, o, 1); };

// ----- beat helpers: sixteenth-step pattern clock
const KICK = [0, 6, 10], SNARE = [4, 12], HAT = [2, 6, 8, 14, 15];
function beatClock(self, c, o) {
  const bpm = o.bpm || 100; const ph = o.phase !== undefined ? o.phase : c.t * bpm / 60; return { bpm, beat: ph, step: mod(ph * 4, 16) };
}
function env(step, hits, decay) { let m = 99; hits.forEach((h) => { const d = mod(step - h, 16); if (d < m) m = d; }); return Math.exp(-m * decay); }

// ----- beatbox: right hand cups the mic at the mouth, cheeks puff, head bobs on the beat, knees pulse, free hand pumps
CL.beatbox = function (P, c, dt, o) {
  const bc = beatClock(this, c, o), k = env(bc.step, KICK, 0.9), sn = env(bc.step, SNARE, 1.0), ht = env(bc.step, HAT, 1.6), amp = o.amp === undefined ? 1 : o.amp, b = bc.beat * TAU, pulse = 0.5 + 0.5 * Cs(b);
  P.hipsY = -0.045 - 0.03 * k * amp - 0.012 * pulse; P.hipsRX = 0.06 + 0.03 * k; P.hipsRZ = 0.04 * S(b * 0.5); P.hipsX = 0.012 * S(b * 0.5);
  P.spineRX = 0.08; P.chestRX = 0.06 + 0.05 * k * amp; P.chestRY = -0.12 + 0.1 * S(b * 0.5); P.chestRZ = 0.04 * S(b * 0.5);
  P.neckRX = 0.06 + 0.12 * (pulse * 0.4 + k * 0.6) * amp; P.headRX = 0.04 + 0.06 * k * amp; P.headRZ = 0.07 * S(b * 0.5); P.headRY = 0.08 * S(b * 0.25);
  stance(P, 0.135, 0.28);
  // mic arm: the mic head (0.2 beyond the wrist along the hand) sits at the lips
  P.aWR = 1; P.hWR = 1; const m = this.mouthRig || { x: 0, y: 1.1, z: 0.3 }, hd = this.v3.set(0.45, 0.8, 0.4).normalize();
  P.aXR = m.x - hd.x * 0.2; P.aYR = m.y - hd.y * 0.2 - 0.01 + 0.006 * k; P.aZR = m.z - hd.z * 0.2 - 0.02; P.hXR = hd.x; P.hYR = hd.y; P.hZR = hd.z; P.pXR = -0.6; P.pYR = -1; P.pZR = -0.1;
  // pumping free hand
  P.aWL = 1; P.aXL = 0.3 + 0.03 * sn; P.aYL = 0.8 + 0.1 * Math.max(0, S(b)) + 0.05 * k; P.aZL = 0.22 + 0.06 * k; P.pXL = 0.7; P.pYL = -1; P.pZL = -0.3; P.hWL = 0; P.wrRXL = 0.3;
  P.shRXL = 0.2; P.elRXL = 1.1;
  P.mouthOpen = 0.12 + 0.5 * ht * amp + 0.55 * sn * amp; P.mouthW = 1 - 0.35 * k * amp; P.cheek = clamp(k * 1.3 + 0.3 * (1 - ht), 0, 1) * amp; P.brow = 0.25 + 0.2 * sn; P.blink = k > 0.7 ? 0.7 : 0;
};

// ----- dance: 16 beat hip-hop loop in four sections
const DANCE = [
  function bounce(P, b, o) { const q = Cs(b * TAU), q2 = S(b * TAU); P.hipsY = -0.05 - 0.04 * (0.5 + 0.5 * q); P.hipsRZ = 0.08 * S(b * PI); P.hipsX = 0.035 * S(b * PI); P.chestRZ = -0.1 * S(b * PI); P.chestRY = 0.25 * S(b * PI); P.headRZ = 0.1 * S(b * PI); P.neckRX = 0.05 + 0.06 * (0.5 + 0.5 * q); stance(P, 0.14, 0.3); P.lXL += 0.02 * S(b * PI); P.lXR += 0.02 * S(b * PI);
    P.aWL = P.aWR = 1; P.aXL = 0.34; P.aXR = -0.34; P.aYL = 0.78 + 0.18 * Math.max(0, q2); P.aYR = 0.78 + 0.18 * Math.max(0, -q2); P.aZL = P.aZR = 0.2; P.pXL = 0.6; P.pXR = -0.6; P.pYL = P.pYR = -1; P.pZL = P.pZR = -0.2; P.mouthOpen = 0.3; },
  function roof(P, b, o) { const q = Cs(b * TAU), q2 = S(b * TAU * 2); P.hipsY = -0.055 - 0.035 * (0.5 + 0.5 * q); P.hipsRZ = -0.06 * S(b * PI); P.hipsRY = 0.2 * S(b * PI); P.chestRY = -0.3 * S(b * PI); P.headRZ = -0.08 * S(b * PI); P.neckRX = 0.04; stance(P, 0.15, 0.3);
    P.aWL = P.aWR = 1; P.aXL = 0.3; P.aXR = -0.3; P.aYL = P.aYR = 1.12 + 0.08 * (0.5 + 0.5 * q2) + 0.05 * q; P.aZL = P.aZR = 0.16; P.pXL = 0.8; P.pXR = -0.8; P.pYL = P.pYR = -0.5; P.pZL = P.pZR = -0.5; P.mouthOpen = 0.5; P.brow = 0.4; },
  function step(P, b, o) { const ph = mod(b, 2) / 2, side = S(ph * TAU) , q = Cs(b * TAU); P.hipsY = -0.045 - 0.03 * (0.5 + 0.5 * q); P.hipsX = 0.08 * side; P.hipsRZ = -0.1 * side; P.chestRZ = 0.12 * side; P.headRZ = 0.12 * side; P.hipsRY = 0.25 * Cs(ph * TAU); P.chestRY = -0.35 * Cs(ph * TAU);
    P.lWL = P.lWR = 1; P.lXL = 0.12 + 0.1 * Math.max(0, side); P.lXR = -0.12 + 0.1 * Math.min(0, side); P.lYL = 0.085 + 0.07 * Math.max(0, -side) * (0.5 + 0.5 * Cs(b * TAU * 2)); P.lYR = 0.085 + 0.07 * Math.max(0, side) * (0.5 + 0.5 * Cs(b * TAU * 2)); P.lZL = P.lZR = 0; P.fYL = 0.2; P.fYR = -0.2;
    P.aWL = P.aWR = 1; P.aXL = 0.3 - 0.1 * side; P.aXR = -0.3 - 0.1 * side; P.aYL = 0.9 + 0.2 * Math.max(0, side); P.aYR = 0.9 + 0.2 * Math.max(0, -side); P.aZL = P.aZR = 0.28; P.pXL = 0.6; P.pXR = -0.6; P.pYL = P.pYR = -1; P.pZL = P.pZR = -0.3; P.mouthOpen = 0.35; },
  function wave(P, b, o) { const q = Cs(b * TAU), r = b * TAU; P.hipsY = -0.05 - 0.04 * (0.5 + 0.5 * q); P.hipsRZ = 0.1 * S(r * 0.5); P.chestRY = 0.2 * S(r * 0.5); P.headRZ = -0.12 * S(r * 0.5); P.neckRY = 0.2 * S(r * 0.5); stance(P, 0.16, 0.35);
    P.aWL = P.aWR = 1; P.aXL = 0.2 + 0.12 * S(r); P.aYL = 1.0 + 0.1 * Cs(r); P.aZL = 0.3; P.aXR = -0.2 - 0.12 * S(r + 1.2); P.aYR = 1.0 + 0.1 * Cs(r + 1.2); P.aZR = 0.3; P.pXL = 0.7; P.pXR = -0.7; P.pYL = P.pYR = -1; P.pZL = P.pZR = -0.2; P.mouthOpen = 0.4; },
];
CL.dance = function (P, c, dt, o) {
  const bc = beatClock(this, c, o), beat = bc.beat, sec = Math.floor(mod(beat, 16) / 4), local = mod(beat, 4), nx = (sec + 1) % 4, f = sm((local - 3.5) / 0.5);
  const A = mkPose(); DANCE[sec](A, beat, o); Object.assign(P, A);
  if (f > 0) { const Bq = mkPose(); DANCE[nx](Bq, beat, o); blendPose(A, Bq, f, P); }
  const k = env(bc.step, KICK, 0.9); P.hipsY -= 0.02 * k; P.shRXL += 0.0; P.brow += 0.2; P.cheek = 0; P.mouthOpen = Math.max(P.mouthOpen, 0.25); P.wrRXL = P.wrRXR = 0.2;
  P.sq += 0.0;
};

// ----- sit: seated pose, relaxed slump, dangling feet
CL.sit = function (P, c, dt, o) {
  const t = c.t, seat = o.seat === undefined ? 0.42 : o.seat, bc = beatClock(this, c, { bpm: o.bpm || 0, phase: o.bpm ? undefined : 0 }), nod = o.bpm ? S(bc.beat * TAU) : 0, br = S(t * 2.1);
  P.hipsY = seat + 0.1 - 0.5; P.hipsZ = -0.03; P.hipsRX = 0.0; P.spineRX = 0.18 + br * 0.01; P.chestRX = 0.12; P.neckRX = -0.16 + nod * 0.05; P.headRX = 0.08 + nod * 0.06; P.headRY = 0.15 * S(t * 0.3) * S(t * 0.11); P.headRZ = 0.04 * S(t * 0.21);
  ['L', 'R'].forEach((k, i) => { const s = i ? -1 : 1, sw = S(t * 1.7 + i * 2.4) * 0.12 * (1 + 0.5 * S(t * 0.3)); P['thRX' + k] = 1.4; P['thRZ' + k] = 0.08; P['knRX' + k] = 1.35 + sw; P['anRX' + k] = -0.25 + sw * 0.5; P['lW' + k] = 0; void s; });
  P.shRZL = 0.1; P.shRZR = 0.1; P.aWL = P.aWR = 1; P.aXL = 0.16; P.aXR = -0.16; P.aYL = P.aYR = seat + 0.2; P.aZL = P.aZR = 0.16; P.pXL = 0.8; P.pXR = -0.8; P.pYL = P.pYR = -0.6; P.pZL = P.pZR = -0.4; P.hWL = P.hWR = 0;
  if (o.armBack) { P.aXR = -0.34; P.aYR = 0.92; P.aZR = -0.12; P.pXR = -1; P.pYR = -0.2; P.pZR = -0.3; }
  P.mouthOpen = 0.05; P.brow = -0.05;
};

// ----- wave
CL.wave = function (P, c, dt, o) {
  const t = c.t, w = S(t * 9);
  CL.idle.call(this, P, c, dt, o); P.hipsRZ = -0.05; P.headRZ = -0.12; P.neckRY = -0.12 + 0.05 * w * 0.0; P.chestRY = 0.12;
  P.aWR = 1; P.aXR = -0.3 + 0.06 * w; P.aYR = 1.12; P.aZR = 0.1; P.pXR = -1; P.pYR = -0.6; P.pZR = -0.2; P.hWR = 1; P.hXR = -0.15 + 0.5 * w; P.hYR = 1; P.hZR = 0.15; P.mouthOpen = 0.4 + 0.1 * Math.abs(w); P.brow = 0.5; P.mouthW = 1.1; P.cheek = 0.05;
};

// ----- cheer: a hop with both arms up
CL.cheer = function (P, c, dt, o) {
  const t = c.t, T0 = 0.62, u = mod(t / T0, 1), crouch = u < 0.22 ? sm(u / 0.22) : u > 0.82 ? sm((1 - u) / 0.18) : 0, air = u >= 0.22 && u <= 0.82 ? Math.sin(((u - 0.22) / 0.6) * PI) : 0;
  P.hipsY = -0.09 * crouch + 0.2 * air; P.hipsRX = 0.08 * crouch - 0.05 * air; P.spineRX = 0.1 * crouch; P.neckRX = -0.15 * air + 0.05 * crouch; P.headRZ = 0.08 * S(t * 5.2); P.chestRZ = 0.05 * S(t * 5.2); P.hipsRZ = 0.05 * S(t * 5.2);
  const a = 0.085 + air * 0.0; P.lWL = P.lWR = 1; P.lXL = 0.12; P.lXR = -0.12; P.lZL = P.lZR = -0.04 * air; P.lYL = P.lYR = a + 0.2 * air * 0.0 + 0.16 * air - 0.0 * crouch; P.fPL = P.fPR = -0.5 * air; P.fYL = 0.2; P.fYR = -0.2;
  P.aWL = P.aWR = 1; P.aXL = 0.3 + 0.03 * S(t * 12); P.aXR = -0.3 - 0.03 * S(t * 12); P.aYL = P.aYR = 1.17 + 0.05 * air; P.aZL = P.aZR = 0.05; P.pXL = 0.8; P.pXR = -0.8; P.pYL = P.pYR = -0.2; P.pZL = P.pZR = -0.6; P.hWL = P.hWR = 1; P.hXL = 0.3; P.hXR = -0.3; P.hYL = P.hYR = 1; P.hZL = P.hZR = 0.1;
  P.sq = -0.08 * crouch + 0.1 * air; P.mouthOpen = 0.9; P.mouthW = 1.15; P.brow = 0.7; P.cheek = 0.1;
};

// ----- talk: gestures and mouth flaps
CL.talk = function (P, c, dt, o) {
  const t = c.t; CL.idle.call(this, P, c, dt, o);
  const syl = Math.abs(S(t * 8.3)) * (0.55 + 0.45 * Math.abs(S(t * 2.9))) * (S(t * 1.3 + 0.7) > -0.35 ? 1 : 0.1);
  P.mouthOpen = 0.08 + 0.85 * syl; P.mouthW = 1 - 0.25 * Math.abs(S(t * 4.1)) * syl; P.brow = 0.2 + 0.3 * Math.max(0, S(t * 1.7)); P.browTilt = 0.1 * S(t * 0.9);
  P.neckRX += 0.06 * syl; P.headRX += 0.05 * Math.max(0, S(t * 2.6)); P.headRZ += 0.06 * S(t * 1.1); P.chestRY = 0.12 * S(t * 0.8); P.spineRY = 0.05 * S(t * 0.8);
  const gr = 0.5 + 0.5 * S(t * 2.2), gl = 0.5 + 0.5 * S(t * 1.5 + 1.2);
  P.aWR = 1; P.aXR = -0.25 - 0.08 * S(t * 3.4); P.aYR = 0.86 + 0.14 * gr + 0.04 * S(t * 6.5); P.aZR = 0.22 + 0.08 * gr; P.pXR = -0.8; P.pYR = -1; P.pZR = -0.2; P.hWR = 0.6; P.hXR = -0.3; P.hYR = 0.5; P.hZR = 0.8 + 0.3 * S(t * 3);
  P.aWL = 0.8 * (S(t * 0.7 + 2) > 0.1 ? 1 : 0.0); P.aXL = 0.26; P.aYL = 0.8 + 0.1 * gl; P.aZL = 0.2 + 0.05 * gl; P.pXL = 0.8; P.pYL = -1; P.pZL = -0.3; P.hWL = 0;
  P.hipsRZ += 0.0;
};
