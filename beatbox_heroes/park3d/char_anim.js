// CHARACTER ANIMATOR: procedural poses, two-bone IK with foot planting, damped springs, crossfaded clips.
// A Pose is a flat bag of numbers (FK angles, IK targets in rig space, face channels). Clips fill a pose, poses blend, apply() drives the bones.
// Conventions (rig space = object space: y up, +z forward, character LEFT = +x). Angles in radians:
//   hipsRX>0 leans forward; shRX>0 swings an arm forward; shRZ>0 abducts (arm away from the body); elRX>0 flexes the elbow (forearm forward);
//   thRX>0 lifts the thigh forward; knRX>0 flexes the knee (shin back); fPitch>0 toes up.
// Arms and legs are blended between FK angles and a two-bone IK solution (aW / lW weights); IK targets are rig-space points, so feet stay planted
// while the hips move, and the mic hand can chase the mouth.
const PI = Math.PI, TAU = PI * 2, S = Math.sin, Cs = Math.cos;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t, sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const mod = (a, n) => ((a % n) + n) % n;

const SCAL = ['hipsX', 'hipsY', 'hipsZ', 'hipsRX', 'hipsRY', 'hipsRZ', 'spineRX', 'spineRY', 'spineRZ', 'chestRX', 'chestRY', 'chestRZ', 'neckRX', 'neckRY', 'neckRZ', 'headRX', 'headRY', 'headRZ', 'sq',
  'mouthOpen', 'mouthW', 'cheek', 'blink', 'eyeX', 'eyeY', 'brow', 'browTilt', 'shrug'];
const LIMB_FK = ['shRX', 'shRY', 'shRZ', 'elRX', 'wrRX', 'wrRZ', 'thRX', 'thRZ', 'knRX', 'anRX'];
const IKG = [['aW', ['aX', 'aY', 'aZ', 'pX', 'pY', 'pZ']], ['hW', ['hX', 'hY', 'hZ']], ['lW', ['lX', 'lY', 'lZ', 'fP', 'fY']]];
function mkPose() {
  const p = {}; SCAL.forEach((k) => { p[k] = 0; }); p.mouthW = 1;
  ['L', 'R'].forEach((s) => {
    LIMB_FK.forEach((k) => { p[k + s] = 0; });
    p['aW' + s] = 0; p['aX' + s] = 0; p['aY' + s] = 0.8; p['aZ' + s] = 0.1; p['pX' + s] = 0; p['pY' + s] = -1; p['pZ' + s] = -0.3;
    p['hW' + s] = 0; p['hX' + s] = 0; p['hY' + s] = -1; p['hZ' + s] = 0;
    p['lW' + s] = 0; p['lX' + s] = 0; p['lY' + s] = 0.085; p['lZ' + s] = 0; p['fP' + s] = 0; p['fY' + s] = 0;
  });
  return p;
}
const TPL = mkPose(), KEYS = Object.keys(TPL);
const reset = (p) => { for (let i = 0; i < KEYS.length; i++) p[KEYS[i]] = TPL[KEYS[i]]; return p; };
// out = a + (b - a) * f; IK targets are weighted by their limb weights so a limb that is not IK driven does not drag the target around
function blendPose(a, b, f, out) {
  for (let i = 0; i < KEYS.length; i++) { const k = KEYS[i]; out[k] = a[k] + (b[k] - a[k]) * f; }
  for (let si = 0; si < 2; si++) {
    const s = si ? 'R' : 'L';
    for (let g = 0; g < IKG.length; g++) {
      const w = IKG[g][0], ks = IKG[g][1], wa = a[w + s] * (1 - f), wb = b[w + s] * f, tot = wa + wb;
      for (let i = 0; i < ks.length; i++) { const k = ks[i] + s; out[k] = tot > 1e-5 ? (a[k] * wa + b[k] * wb) / tot : a[k]; }
    }
  }
  return out;
}

export class Animator {
  constructor(api, rig, THREE) {
    const T = THREE; this.api = api; this.rig = rig; this.T = T; this.B = rig.map; this.t = 0; this.clip = 'idle'; this.opts = { speed: 0, bpm: 100 };
    this.cur = null; this.prev = null; this.fade = 1; this.fadeDur = 0.15;
    this.pose = mkPose(); this.pA = mkPose(); this.pB = mkPose(); this.pD = mkPose(); this.pE = mkPose();
    this.q = []; this.v = []; this.m = []; for (let i = 0; i < 10; i++) { this.q.push(new T.Quaternion()); this.v.push(new T.Vector3()); } for (let i = 0; i < 5; i++) this.m.push(new T.Matrix4());
    this.e = new T.Euler(0, 0, 0, 'YXZ'); this.down = new T.Vector3(0, -1, 0);
    this.life = { blinkT: 1.5, blink: 0, gaze: [0, 0], gazeT: 0, shift: 0, shiftT: 3, shiftTarget: 0 };
    this.sp = {}; this.vs = 0; this.accel = 0; this.sqS = { x: 0, v: 0 }; this.leanS = { x: 0, v: 0 };
    this.lookT = null; this.lookW = 0; this.lookYaw = 0; this.lookPitch = 0; this.once = null; this.hits = { k: 0, s: 0, h: 0 };
    this.mouthRig = new T.Vector3(0, 1.1, 0.34); this.prevPos = {}; this.prevVel = {}; this.accW = {}; this.ikR = { qU: new T.Quaternion(), qL: new T.Quaternion() };
    this._a = new T.Vector3(); this._d = new T.Vector3(); this._p = new T.Vector3(); this._e = new T.Vector3(); this._du = new T.Vector3(); this._dl = new T.Vector3(); this._qa = new T.Quaternion(); this._raw = new T.Vector3(); this._acc = {};
  }
  refit(d, rest) { this.d = d; this.rest = rest; this.armLen = [0.19, 0.165]; this.legLen = [0.2, 0.175]; }
  finishInit() {
    const B = this.B, names = ['puffL', 'puffR', 'hairB', 'hairB2', 'hairSL', 'hairSR', 'brim', 'tail', 'beard', 'chain', 'cape', 'hem'];
    // [parent frame, direction (-1 hangs below its pivot, +1 sticks out above, 0 flaps from vertical accel), stiffness, damping, gain]
    const cfg = { puffL: ['head', 1, 140, 7, 0.05], puffR: ['head', 1, 140, 7, 0.05], hairB: ['head', -1, 90, 5.5, 0.07], hairB2: ['hairB', -1, 120, 6, 0.06], hairSL: ['head', -1, 110, 6, 0.07], hairSR: ['head', -1, 110, 6, 0.07], brim: ['head', 0, 220, 14, 0.03], tail: ['head', -1, 80, 5, 0.08], beard: ['head', -1, 100, 6, 0.07], chain: ['chest', -1, 120, 5.5, 0.08], cape: ['chest', -1, 70, 4.5, 0.07], hem: ['hips', -1, 150, 8, 0.05] };
    names.forEach((n) => { this.sp[n] = { b: B[n], cfg: cfg[n], x: 0, vx: 0, z: 0, vz: 0, ph: Math.random() * 6 }; });
    this.play('idle', {}); this.update(0.016, 0);
  }
  // play(clip, opts): the same clip only updates opts (cheap, call every frame).
  // opts: speed (walk/run m/s), bpm, phase, amp, external (beatbox driven by hit()), seat, slump, armBack, drowsy (sit), fade, duration + then
  play(clip, opts) {
    if (!CL[clip]) clip = 'idle'; opts = opts || {}; const same = clip === this.clip && this.cur;
    Object.assign(this.opts, opts);
    if (!same) { this.prev = this.cur; this.fade = this.prev ? 0 : 1; this.fadeDur = opts.fade === undefined ? 0.15 : Math.max(0.001, opts.fade); this.clip = clip; this.cur = { name: clip, t: 0, st: {} }; }
    this.once = opts.duration ? { left: opts.duration, then: opts.then || 'idle' } : null; return this;
  }
  hit(kind, s) { const k = kind === 'kick' || kind === 'k' ? 'k' : kind === 'snare' || kind === 's' ? 's' : 'h'; this.hits[k] = Math.max(this.hits[k], s === undefined ? 1 : s); }
  setLookAt(p) { this.lookT = p || null; }

  update(dt, t) {
    dt = clamp(dt, 0, 0.05); this.t += dt; const o = this.opts; if (!this.cur) return;
    if (this.once) { this.once.left -= dt; if (this.once.left <= 0) { const th = this.once.then; this.once = null; this.play(th, {}); } }
    const target = this.clip === 'walk' || this.clip === 'run' ? o.speed || 0 : 0, vp = this.vs;
    this.vs += (target - this.vs) * (1 - Math.exp(-12 * dt)); this.accel += ((this.vs - vp) / Math.max(dt, 1e-3) - this.accel) * (1 - Math.exp(-14 * dt));
    if (vp < 0.35 && this.vs >= 0.35 && target > 0.6) this.sqS.v -= 0.9;           // anticipation crouch on starts
    if (vp > 0.9 && this.vs <= 0.9 && target < 0.4) this.sqS.v -= 1.5;             // brake squash on stops
    { const s = this.sqS; s.v += (-190 * s.x - 15 * s.v) * dt; s.x += s.v * dt; }
    { const l = this.leanS, tg = clamp(this.accel * 0.012, -0.12, 0.12); l.v += (-110 * (l.x - tg) - 12 * l.v) * dt; l.x += l.v * dt; }
    const H = this.hits; H.k *= Math.exp(-7 * dt); H.s *= Math.exp(-6 * dt); H.h *= Math.exp(-10 * dt);
    this.cur.t += dt; const P = this.pose, A = reset(this.pA); CL[this.cur.name].call(this, A, this.cur, dt, o);
    if (this.fade < 1 && this.prev) {
      this.prev.t += dt; const Bp = reset(this.pB); CL[this.prev.name].call(this, Bp, this.prev, dt, o);
      this.fade = Math.min(1, this.fade + dt / this.fadeDur); blendPose(Bp, A, sm(this.fade), P); if (this.fade >= 1) this.prev = null;
    } else for (let i = 0; i < KEYS.length; i++) P[KEYS[i]] = A[KEYS[i]];
    this.life_(P, dt); this.apply(P, dt);
  }

  // life layer on top of every clip: blink, gaze saccades, look-at, start/stop squash
  life_(P, dt) {
    const L = this.life;
    L.blinkT -= dt; if (L.blinkT <= 0) { L.blink = 1; L.blinkT = 2.2 + Math.random() * 3.2; if (Math.random() < 0.18) L.blinkT = 0.28; }
    if (L.blink > 0) L.blink -= dt / 0.17; const bl = L.blink > 0 ? Math.sin(clamp(1 - L.blink, 0, 1) * PI) : 0; P.blink = Math.max(P.blink, bl);
    L.gazeT -= dt; if (L.gazeT <= 0) { L.gazeT = 0.8 + Math.random() * 2.4; L.gaze = [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8]; }
    P.eyeX += L.gaze[0] * 0.6; P.eyeY += L.gaze[1] * 0.6;
    if (this.lookT) {
      const o = this.api.object, v = this.v[0].copy(this.lookT); o.worldToLocal(v); const hy = this.rest ? this.rest.head[1] + 0.3 : 1.3, yaw = clamp(Math.atan2(v.x, v.z), -0.9, 0.9), pitch = clamp(-Math.atan2(v.y - hy, Math.hypot(v.x, v.z)), -0.4, 0.4), k = 1 - Math.exp(-6 * dt);
      this.lookYaw += (yaw - this.lookYaw) * k; this.lookPitch += (pitch - this.lookPitch) * k; this.lookW += (1 - this.lookW) * (1 - Math.exp(-5 * dt));
    } else this.lookW += (0 - this.lookW) * (1 - Math.exp(-5 * dt));
    P.headRY += this.lookYaw * 0.55 * this.lookW; P.neckRY += this.lookYaw * 0.35 * this.lookW; P.headRX += this.lookPitch * 0.7 * this.lookW; P.eyeX += this.lookYaw * 0.8 * this.lookW;
    P.sq += this.sqS.x; P.hipsRX += this.leanS.x;
  }

  apply(P, dt) {
    const B = this.B, e = this.e, T = this.T; if (!this.rest) return; const [q1, q2, q3, q4, q5, q6] = this.q, [v1, v2, v3] = this.v, [m1, m2, m3, m4] = this.m;
    const set = (b, x, y, z) => { e.set(x, y, z, 'YXZ'); b.quaternion.setFromEuler(e); };
    const hips = B.hips, hr = hips.userData.rest, sqy = 1 + P.sq, sqx = 1 / Math.sqrt(sqy);
    hips.position.set(hr[0] + P.hipsX, hr[1] + P.hipsY + P.sq * 0.25, hr[2] + P.hipsZ);
    set(hips, P.hipsRX, P.hipsRY, P.hipsRZ); set(B.spine, P.spineRX, P.spineRY, P.spineRZ); set(B.chest, P.chestRX, P.chestRY, P.chestRZ); set(B.neck, P.neckRX, P.neckRY, P.neckRZ); set(B.head, P.headRX, P.headRY, P.headRZ);
    B.spine.scale.set(sqx, sqy, sqx);
    hips.updateMatrix(); B.spine.updateMatrix(); B.chest.updateMatrix(); B.neck.updateMatrix(); B.head.updateMatrix();
    const mH = m1.copy(hips.matrix), mC = m2.copy(hips.matrix).multiply(B.spine.matrix).multiply(B.chest.matrix);
    const qH = q1.copy(hips.quaternion), qC = q2.copy(hips.quaternion).multiply(B.spine.quaternion).multiply(B.chest.quaternion);
    this.mouthRig.set(0, 0.12, 0.34).applyMatrix4(m3.copy(mC).multiply(B.neck.matrix).multiply(B.head.matrix));
    const mHinv = m4.copy(mH).invert(), mCinv = m3.copy(mC).invert(), ik = this.ikR;
    // legs
    for (let si = 0; si < 2; si++) {
      const s = si ? -1 : 1, k = si ? 'R' : 'L', th = B['th' + k], kn = B['kn' + k], an = B['an' + k], W = P['lW' + k];
      e.set(-P['thRX' + k], 0, s * P['thRZ' + k], 'YXZ'); th.quaternion.setFromEuler(e); e.set(P['knRX' + k], 0, 0, 'YXZ'); kn.quaternion.setFromEuler(e); e.set(-P['anRX' + k], 0, 0, 'YXZ'); an.quaternion.setFromEuler(e);
      if (W > 0.001) {
        v1.set(P['lX' + k], P['lY' + k], P['lZ' + k]).applyMatrix4(mHinv); this.solve(th, this.legLen, v1, v2.set(s * 0.12, 0, 1), ik);
        th.quaternion.slerp(ik.qU, W); kn.quaternion.slerp(ik.qL, W);
        e.set(-P['fP' + k], P['fY' + k], 0, 'YXZ'); q3.setFromEuler(e);                              // desired foot orientation in rig space
        q4.copy(qH).multiply(ik.qU).multiply(ik.qL).invert().multiply(q3); an.quaternion.slerp(q4, W);
      }
    }
    // arms
    for (let si = 0; si < 2; si++) {
      const s = si ? -1 : 1, k = si ? 'R' : 'L', sh = B['sh' + k], el = B['el' + k], wr = B['wr' + k], W = P['aW' + k];
      e.set(-P['shRX' + k], s * P['shRY' + k], s * P['shRZ' + k], 'YXZ'); sh.quaternion.setFromEuler(e); e.set(-P['elRX' + k], 0, 0, 'YXZ'); el.quaternion.setFromEuler(e); e.set(-P['wrRX' + k], 0, s * P['wrRZ' + k], 'YXZ'); wr.quaternion.setFromEuler(e);
      if (W > 0.001) {
        v1.set(P['aX' + k], P['aY' + k], P['aZ' + k]).applyMatrix4(mCinv); this.solve(sh, this.armLen, v1, v2.set(P['pX' + k], P['pY' + k], P['pZ' + k]), ik);
        sh.quaternion.slerp(ik.qU, W); el.quaternion.slerp(ik.qL, W);
        const HW = P['hW' + k] * W;
        if (HW > 0.001) { v3.set(P['hX' + k], P['hY' + k], P['hZ' + k]).normalize(); q5.setFromUnitVectors(this.down, v3); q6.copy(qC).multiply(ik.qU).multiply(ik.qL).invert().multiply(q5); wr.quaternion.slerp(q6, HW); }
      }
      sh.position.y = sh.userData.rest[1] + P.shrug * 0.02;
    }
    // face
    const eyeS = Math.max(0.06, 1 - clamp(P.blink, 0, 1) * 0.92);
    for (let si = 0; si < 2; si++) {
      const k = si ? 'R' : 'L', s = si ? -1 : 1, eye = B['eye' + k], er = eye.userData.rest, br = B['brow' + k], brr = br.userData.rest;
      eye.scale.set(1, eyeS, 1); eye.position.set(er[0] + P.eyeX * 0.012, er[1] + P.eyeY * 0.01, er[2]);
      br.position.set(brr[0], brr[1] + P.brow * 0.025, brr[2]); set(br, 0, 0, -s * P.browTilt * 0.5); B['cheek' + k].scale.setScalar(0.8 + P.cheek * 1.15);
    }
    B.mouth.scale.set(P.mouthW, Math.max(0.05, P.mouthOpen), 1);
    this.springs(dt); void T;
  }

  // two-bone IK in the parent frame of the upper bone. tgt: Vector3 in that frame, pole: bend direction hint in that frame. writes out.qU, out.qL (local rotations)
  solve(up, len, tgt, pole, out) {
    const a = this._a, d = this._d, p = this._p, el = this._e, du = this._du, dl = this._dl, qa = this._qa, o = up.userData.rest, l1 = len[0], l2 = len[1]; a.set(o[0], o[1], o[2]);
    d.subVectors(tgt, a); const dist = clamp(d.length(), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002); d.normalize();
    const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    p.copy(pole).addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-6) p.set(0, 0, 1); p.normalize();
    el.copy(a).addScaledVector(d, x).addScaledVector(p, h); du.subVectors(el, a).normalize(); dl.copy(a).addScaledVector(d, dist).sub(el).normalize();
    out.qU.setFromUnitVectors(this.down, du); qa.setFromUnitVectors(this.down, dl); out.qL.copy(out.qU).invert().multiply(qa);
  }

  // damped springs on the secondary bones, excited by the acceleration of their parent frame
  springs(dt) {
    if (dt <= 0) return; const T = this.T, B = this.B, v5 = this.v[8], v6 = this.v[9], qq = this.q[7], acc = this._acc; this.api.object.updateMatrixWorld(true);
    ['head', 'chest', 'hips'].forEach((k) => {
      const now = v5.setFromMatrixPosition(B[k].matrixWorld), pp = this.prevPos[k] || (this.prevPos[k] = new T.Vector3().copy(now)), pv = this.prevVel[k] || (this.prevVel[k] = new T.Vector3()), a = this.accW[k] || (this.accW[k] = new T.Vector3());
      v6.subVectors(now, pp).multiplyScalar(1 / dt);
      if (this._sprInit) { this._raw.subVectors(v6, pv).multiplyScalar(1 / dt).clampLength(0, 45); a.lerp(this._raw, 1 - Math.exp(-25 * dt)); }
      pp.copy(now); pv.copy(v6); B[k].getWorldQuaternion(qq); qq.invert(); (acc[k] || (acc[k] = new T.Vector3())).copy(a).applyQuaternion(qq);
    });
    this._sprInit = true; const t = this.t;
    for (const n in this.sp) {
      const s = this.sp[n], c = s.cfg, a = acc[c[0] === 'hairB' ? 'head' : c[0]] || acc.head, dir = c[1], k = c[2], dmp = c[3], g = c[4];
      let tx, tz; if (dir === 0) { tx = a.y * g * 0.5; tz = 0; } else { tx = dir < 0 ? a.z * g : -a.z * g; tz = dir < 0 ? -a.x * g : a.x * g; }
      tx += 0.03 * S(t * 1.3 + s.ph) * (dir ? 1 : 0.2); tz += dir ? 0.025 * S(t * 1.1 + s.ph * 2) : 0;
      s.vx += (-k * (s.x - tx) - dmp * s.vx) * dt; s.x += s.vx * dt; s.vz += (-k * (s.z - tz) - dmp * s.vz) * dt; s.z += s.vz * dt;
      s.x = clamp(s.x, -0.8, 0.8); s.z = clamp(s.z, -0.8, 0.8); s.b.quaternion.setFromEuler(this.e.set(s.x, 0, s.z, 'YXZ'));
    }
  }
}

// ======================================================================== CLIPS
const CL = {};
Animator.prototype.CL = CL;
const stance = (P, w, yaw) => { P.lWL = P.lWR = 1; P.lXL = w; P.lXR = -w; P.lYL = P.lYR = 0.085; P.lZL = P.lZR = 0; P.fYL = yaw; P.fYR = -yaw; };
const relaxArms = (P, t) => { P.shRZL = P.shRZR = 0.1; P.elRXL = P.elRXR = 0.14; P.shRXL = 0.04 * S(t * 1.1); P.shRXR = 0.04 * S(t * 1.1 + 2); P.wrRXL = P.wrRXR = 0.1; };

// ----- idle: breathing, weight shift, head look around
CL.idle = function (P, c, dt) {
  const t = c.t, L = this.life; L.shiftT -= dt; if (L.shiftT <= 0) { L.shiftT = 4 + Math.random() * 5; L.shiftTarget = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1); }
  L.shift += (L.shiftTarget - L.shift) * (1 - Math.exp(-2.2 * dt)); const sh = L.shift, br = S(t * 2.2);
  P.hipsY = -0.012 + br * 0.003 - Math.abs(sh) * 0.008; P.hipsX = sh * 0.016; P.hipsRZ = -sh * 0.045; P.spineRZ = sh * 0.03; P.chestRZ = sh * 0.02; P.chestRX = br * 0.012 - 0.01; P.spineRX = 0.01;
  P.neckRY = 0.2 * S(t * 0.37) * S(t * 0.13 + 1); P.headRY = 0.25 * S(t * 0.31 + 0.5) * S(t * 0.17); P.headRX = 0.03 + 0.04 * S(t * 0.23); P.headRZ = 0.05 * S(t * 0.2) + sh * 0.03;
  stance(P, 0.105 + Math.abs(sh) * 0.008, 0.12); relaxArms(P, t); P.shrug = br * 0.2; P.mouthOpen = 0.06; P.brow = 0.05;
};

// ----- gait shared by walk and run. Stance feet move backwards at exactly the travel speed in rig space, so nothing slides.
function gait(P, c, dt, o, rw) {
  const v = Math.max(0, this.vs), S0 = clamp(0.13 + 0.045 * v, 0.13, 0.3), duty = lerp(0.62, 0.38, rw), st = c.st;
  if (st.ph === undefined) st.ph = 0;
  const rate = (duty * v) / (2 * S0); st.ph = (st.ph + rate * dt) % 1; const ph = st.ph, moving = clamp(v / 0.5, 0, 1), lift = lerp(0.075, 0.2, rw) * clamp(v / 2, 0.4, 1.2);
  const foot = (p) => {
    p = mod(p, 1); let z, y, pitch;
    if (p < duty) { const u = p / duty; z = S0 * (1 - 2 * u) * moving; y = 0; pitch = lerp(0.22, -0.5, sm(u * u)); }
    else { const u = (p - duty) / (1 - duty); z = (-S0 + 2 * S0 * sm(u)) * moving; y = lift * S(PI * u) * moving * (1 + 0.4 * rw); pitch = lerp(-0.5, 0.22, sm(u)) * moving; }
    return { z, ay: 0.085 + y + (pitch < 0 ? -pitch * 0.075 : 0) * moving, pitch };
  };
  const fl = foot(ph), fr = foot(ph + 0.5);
  P.lWL = P.lWR = 1; P.lXL = 0.105; P.lXR = -0.105; P.lZL = fl.z; P.lZR = fr.z; P.lYL = fl.ay; P.lYR = fr.ay; P.fPL = fl.pitch; P.fPR = fr.pitch; P.fYL = 0.06; P.fYR = -0.06;
  const bob = Cs(4 * PI * (ph - duty / 2)), bobA = lerp(0.022, 0.05, rw), sw = S(TAU * ph), cw = Cs(TAU * ph), lean = lerp(0.03, 0.2, rw) + 0.012 * Math.min(v, 5);
  P.hipsY = (-0.04 - rw * 0.03) * moving + bob * bobA * moving - (1 - moving) * 0.012; P.hipsRX = lean * moving; P.hipsRY = -cw * lerp(0.1, 0.18, rw) * moving; P.hipsRZ = -sw * 0.03 * moving; P.hipsX = -sw * 0.012 * moving;
  P.spineRY = cw * 0.06 * moving; P.chestRY = cw * lerp(0.14, 0.26, rw) * moving; P.chestRX = -lean * 0.25 * moving; P.spineRX = -lean * 0.2 * moving; P.chestRZ = sw * 0.03 * moving;
  P.neckRX = -lean * 0.5; P.headRX = -lean * 0.4 + 0.02; P.neckRY = -P.chestRY * 0.5 - P.hipsRY * 0.5; P.headRZ = -sw * 0.02 * moving;
  const swing = lerp(0.42, 0.85, rw) * clamp(v / 2.2, 0.15, 1.1) * moving, flex = lerp(0.2, 1.55, rw);
  P.shRXL = swing * cw; P.shRXR = -swing * cw; P.shRZL = P.shRZR = lerp(0.1, 0.16, rw);
  P.elRXL = flex + (rw > 0.5 ? 0.25 * Math.max(0, cw) : 0.12 * Math.max(0, -cw)); P.elRXR = flex + (rw > 0.5 ? 0.25 * Math.max(0, -cw) : 0.12 * Math.max(0, cw));
  P.wrRXL = P.wrRXR = 0.1; P.shrug = bob * 0.1 * moving; P.mouthOpen = 0.06 + rw * 0.3 + 0.06 * Math.abs(S(c.t * 7)) * rw; P.brow = 0.1 * rw;
}
CL.walk = function (P, c, dt, o) { gait.call(this, P, c, dt, o, clamp((this.vs - 3.2) / 2, 0, 0.35)); };
CL.run = function (P, c, dt, o) { gait.call(this, P, c, dt, o, 1); };

// ----- beat helpers: sixteenth-step pattern clock (kick, snare, hat). opts.external uses only hit() events.
const KICK = [0, 6, 10], SNARE = [4, 12], HAT = [2, 6, 8, 14, 15];
function beatClock(c, o) { const bpm = o.bpm || 100, ph = o.phase !== undefined ? o.phase : c.t * bpm / 60; return { bpm, beat: ph, step: mod(ph * 4, 16) }; }
function env(step, hits, decay) { let m = 99; hits.forEach((h) => { const d = mod(step - h, 16); if (d < m) m = d; }); return Math.exp(-m * decay); }
function beatEnv(self, bc, o) { const H = self.hits; if (o.external) return { k: H.k, sn: H.s, ht: H.h }; return { k: Math.max(env(bc.step, KICK, 0.9), H.k), sn: Math.max(env(bc.step, SNARE, 1.0), H.s), ht: Math.max(env(bc.step, HAT, 1.6), H.h) }; }

// ----- beatbox: right hand cups the mic at the mouth, cheeks puff, head bobs on the beat, knees pulse, free hand pumps
CL.beatbox = function (P, c, dt, o) {
  const bc = beatClock(c, o), E = beatEnv(this, bc, o), k = E.k, sn = E.sn, ht = E.ht, amp = o.amp === undefined ? 1 : o.amp, b = bc.beat * TAU, pulse = 0.5 + 0.5 * Cs(b);
  P.hipsY = -0.045 - 0.03 * k * amp - 0.012 * pulse; P.hipsRX = 0.06 + 0.03 * k; P.hipsRZ = 0.04 * S(b * 0.5); P.hipsX = 0.012 * S(b * 0.5);
  P.spineRX = 0.08; P.chestRX = 0.06 + 0.05 * k * amp; P.chestRY = -0.12 + 0.1 * S(b * 0.5); P.chestRZ = 0.04 * S(b * 0.5);
  P.neckRX = 0.06 + 0.12 * (pulse * 0.4 + k * 0.6) * amp; P.headRX = 0.04 + 0.06 * k * amp; P.headRZ = 0.07 * S(b * 0.5); P.headRY = 0.08 * S(b * 0.25);
  stance(P, 0.135, 0.28);
  const m = this.mouthRig, hx = 0.45, hy = 0.8, hz = 0.4, hl = Math.hypot(hx, hy, hz);           // the mic head sits 0.2 beyond the wrist along the hand
  P.aWR = 1; P.hWR = 1; P.aXR = m.x - hx / hl * 0.2; P.aYR = m.y - hy / hl * 0.2 - 0.01 + 0.006 * k; P.aZR = m.z - hz / hl * 0.2 - 0.02; P.hXR = hx; P.hYR = hy; P.hZR = hz; P.pXR = -0.6; P.pYR = -1; P.pZR = -0.1;
  P.aWL = 1; P.aXL = 0.3 + 0.03 * sn; P.aYL = 0.8 + 0.1 * Math.max(0, S(b)) + 0.05 * k; P.aZL = 0.22 + 0.06 * k; P.pXL = 0.7; P.pYL = -1; P.pZL = -0.3; P.hWL = 0; P.wrRXL = 0.3; P.shRXL = 0.2; P.elRXL = 1.1;
  P.mouthOpen = 0.12 + 0.5 * ht * amp + 0.55 * sn * amp; P.mouthW = 1 - 0.35 * k * amp; P.cheek = clamp(k * 1.3 + 0.3 * (1 - ht), 0, 1) * amp; P.brow = 0.25 + 0.2 * sn; P.blink = k > 0.7 ? 0.7 : 0;
};

// ----- dance: 16 beat hip-hop loop in four sections (bounce, raise the roof, step touch, double wave)
const DANCE = [
  function bounce(P, b) { const q = Cs(b * TAU), q2 = S(b * TAU); P.hipsY = -0.05 - 0.04 * (0.5 + 0.5 * q); P.hipsRZ = 0.08 * S(b * PI); P.hipsX = 0.035 * S(b * PI); P.chestRZ = -0.1 * S(b * PI); P.chestRY = 0.25 * S(b * PI); P.headRZ = 0.1 * S(b * PI); P.neckRX = 0.05 + 0.06 * (0.5 + 0.5 * q); stance(P, 0.14, 0.3); P.lXL += 0.02 * S(b * PI); P.lXR += 0.02 * S(b * PI);
    P.aWL = P.aWR = 1; P.aXL = 0.34; P.aXR = -0.34; P.aYL = 0.78 + 0.18 * Math.max(0, q2); P.aYR = 0.78 + 0.18 * Math.max(0, -q2); P.aZL = P.aZR = 0.2; P.pXL = 0.6; P.pXR = -0.6; P.pYL = P.pYR = -1; P.pZL = P.pZR = -0.2; P.mouthOpen = 0.3; },
  function roof(P, b) { const q = Cs(b * TAU), q2 = S(b * TAU * 2); P.hipsY = -0.055 - 0.035 * (0.5 + 0.5 * q); P.hipsRZ = -0.06 * S(b * PI); P.hipsRY = 0.2 * S(b * PI); P.chestRY = -0.3 * S(b * PI); P.headRZ = -0.08 * S(b * PI); P.neckRX = 0.04; stance(P, 0.15, 0.3);
    P.aWL = P.aWR = 1; P.aXL = 0.3; P.aXR = -0.3; P.aYL = P.aYR = 1.12 + 0.08 * (0.5 + 0.5 * q2) + 0.05 * q; P.aZL = P.aZR = 0.16; P.pXL = 0.8; P.pXR = -0.8; P.pYL = P.pYR = -0.5; P.pZL = P.pZR = -0.5; P.mouthOpen = 0.5; P.brow = 0.4; },
  function step(P, b) { const ph = mod(b, 2) / 2, side = S(ph * TAU), q = Cs(b * TAU); P.hipsY = -0.045 - 0.03 * (0.5 + 0.5 * q); P.hipsX = 0.08 * side; P.hipsRZ = -0.1 * side; P.chestRZ = 0.12 * side; P.headRZ = 0.12 * side; P.hipsRY = 0.25 * Cs(ph * TAU); P.chestRY = -0.35 * Cs(ph * TAU);
    P.lWL = P.lWR = 1; P.lXL = 0.12 + 0.1 * Math.max(0, side); P.lXR = -0.12 + 0.1 * Math.min(0, side); P.lYL = 0.085 + 0.07 * Math.max(0, -side) * (0.5 + 0.5 * Cs(b * TAU * 2)); P.lYR = 0.085 + 0.07 * Math.max(0, side) * (0.5 + 0.5 * Cs(b * TAU * 2)); P.lZL = P.lZR = 0; P.fYL = 0.2; P.fYR = -0.2;
    P.aWL = P.aWR = 1; P.aXL = 0.3 - 0.1 * side; P.aXR = -0.3 - 0.1 * side; P.aYL = 0.9 + 0.2 * Math.max(0, side); P.aYR = 0.9 + 0.2 * Math.max(0, -side); P.aZL = P.aZR = 0.28; P.pXL = 0.6; P.pXR = -0.6; P.pYL = P.pYR = -1; P.pZL = P.pZR = -0.3; P.mouthOpen = 0.35; },
  function wave(P, b) { const q = Cs(b * TAU), r = b * TAU; P.hipsY = -0.05 - 0.04 * (0.5 + 0.5 * q); P.hipsRZ = 0.1 * S(r * 0.5); P.chestRY = 0.2 * S(r * 0.5); P.headRZ = -0.12 * S(r * 0.5); P.neckRY = 0.2 * S(r * 0.5); stance(P, 0.16, 0.35);
    P.aWL = P.aWR = 1; P.aXL = 0.2 + 0.12 * S(r); P.aYL = 1.0 + 0.1 * Cs(r); P.aZL = 0.3; P.aXR = -0.2 - 0.12 * S(r + 1.2); P.aYR = 1.0 + 0.1 * Cs(r + 1.2); P.aZR = 0.3; P.pXL = 0.7; P.pXR = -0.7; P.pYL = P.pYR = -1; P.pZL = P.pZR = -0.2; P.mouthOpen = 0.4; },
];
CL.dance = function (P, c, dt, o) {
  const bc = beatClock(c, { bpm: o.bpm || 108, phase: o.phase }), beat = bc.beat, sec = Math.floor(mod(beat, 16) / 4), local = mod(beat, 4), nx = (sec + 1) % 4, f = sm((local - 3.5) / 0.5);
  DANCE[sec](P, beat);
  if (f > 0) { const Bq = reset(this.pD), cp = this.pE; DANCE[nx](Bq, beat); for (let i = 0; i < KEYS.length; i++) cp[KEYS[i]] = P[KEYS[i]]; blendPose(cp, Bq, f, P); }
  const k = Math.max(env(bc.step, KICK, 0.9), this.hits.k); P.hipsY -= 0.02 * k; P.brow += 0.2; P.mouthOpen = Math.max(P.mouthOpen, 0.25); P.wrRXL = P.wrRXR = 0.2;
};

// ----- sit: seated pose, relaxed slump, dangling feet. opts: seat (seat height), slump (1 young, 1.4 old), bpm (nod + foot tap), armBack (right arm rests on the bench back), drowsy
CL.sit = function (P, c, dt, o) {
  const t = c.t, seat = o.seat === undefined ? 0.42 : o.seat, sl = o.slump === undefined ? 1 : o.slump, bpm = o.bpm || 0, amp = o.amp === undefined ? 1 : o.amp, beat = bpm ? t * bpm / 60 : 0, nod = bpm ? Math.max(0, S(beat * TAU)) * amp : 0, br = S(t * 2.1);
  P.hipsY = seat + 0.1 - 0.5; P.hipsZ = -0.03; P.spineRX = 0.18 * sl + br * 0.01; P.chestRX = 0.12 * sl; P.neckRX = -0.16 * sl + nod * 0.05; P.headRX = 0.08 * sl + nod * 0.1; P.headRY = 0.15 * S(t * 0.3) * S(t * 0.11) + (bpm ? 0.05 * S(beat * PI) : 0); P.headRZ = 0.04 * S(t * 0.21);
  const tap = bpm ? Math.max(0, S(beat * TAU * 0.5 + 0.4)) * amp : 0;
  ['L', 'R'].forEach((k, i) => { const sw = bpm ? 0 : S(t * 1.7 + i * 2.4) * 0.12 * (1 + 0.5 * S(t * 0.3)); P['thRX' + k] = 1.4; P['thRZ' + k] = 0.08; P['knRX' + k] = 1.35 + sw - (i ? 0.35 * tap : 0); P['anRX' + k] = -0.25 + sw * 0.5; P['lW' + k] = 0; });
  P.shRZL = 0.1; P.shRZR = 0.1; P.aWL = P.aWR = 1; P.aXL = 0.16; P.aXR = -0.16; P.aYL = P.aYR = seat + 0.2; P.aZL = P.aZR = 0.16; P.pXL = 0.8; P.pXR = -0.8; P.pYL = P.pYR = -0.6; P.pZL = P.pZR = -0.4; P.hWL = P.hWR = 0;
  if (bpm) { P.aYL += 0.02 * nod; P.hipsY += 0.004 * nod; }
  if (o.armBack) { P.aXR = -0.3; P.aYR = seat + 0.42; P.aZR = -0.14; P.pXR = -1; P.pYR = -0.3; P.pZR = -0.2; P.chestRY = 0.08; }
  P.mouthOpen = 0.05; P.brow = -0.05; P.blink = Math.max(P.blink, o.drowsy ? 0.45 : 0);
};

// ----- wave: right arm up with a hand wag
CL.wave = function (P, c, dt, o) {
  const t = c.t, w = S(t * 9); CL.idle.call(this, P, c, dt, o); P.hipsRZ = -0.05; P.headRZ = -0.12; P.neckRY = -0.12; P.chestRY = 0.12;
  P.aWR = 1; P.aXR = -0.3 + 0.06 * w; P.aYR = 1.12; P.aZR = 0.1; P.pXR = -1; P.pYR = -0.6; P.pZR = -0.2; P.hWR = 1; P.hXR = -0.15 + 0.5 * w; P.hYR = 1; P.hZR = 0.15; P.mouthOpen = 0.4 + 0.1 * Math.abs(w); P.brow = 0.5; P.mouthW = 1.1; P.cheek = 0.05;
};

// ----- cheer: a hop with both arms up
CL.cheer = function (P, c) {
  const t = c.t, T0 = 0.62, u = mod(t / T0, 1), crouch = u < 0.22 ? sm(u / 0.22) : u > 0.82 ? sm((1 - u) / 0.18) : 0, air = u >= 0.22 && u <= 0.82 ? Math.sin(((u - 0.22) / 0.6) * PI) : 0;
  P.hipsY = -0.09 * crouch + 0.2 * air; P.hipsRX = 0.08 * crouch - 0.05 * air; P.spineRX = 0.1 * crouch; P.neckRX = -0.15 * air + 0.05 * crouch; P.headRZ = 0.08 * S(t * 5.2); P.chestRZ = 0.05 * S(t * 5.2); P.hipsRZ = 0.05 * S(t * 5.2);
  P.lWL = P.lWR = 1; P.lXL = 0.12; P.lXR = -0.12; P.lZL = P.lZR = -0.04 * air; P.lYL = P.lYR = 0.085 + 0.16 * air; P.fPL = P.fPR = -0.5 * air; P.fYL = 0.2; P.fYR = -0.2;
  P.aWL = P.aWR = 1; P.aXL = 0.3 + 0.03 * S(t * 12); P.aXR = -0.3 - 0.03 * S(t * 12); P.aYL = P.aYR = 1.17 + 0.05 * air; P.aZL = P.aZR = 0.05; P.pXL = 0.8; P.pXR = -0.8; P.pYL = P.pYR = -0.2; P.pZL = P.pZR = -0.6; P.hWL = P.hWR = 1; P.hXL = 0.3; P.hXR = -0.3; P.hYL = P.hYR = 1; P.hZL = P.hZR = 0.1;
  P.sq = -0.08 * crouch + 0.1 * air; P.mouthOpen = 0.9; P.mouthW = 1.15; P.brow = 0.7; P.cheek = 0.1;
};

// ----- talk: hand gestures and mouth flaps
CL.talk = function (P, c, dt, o) {
  const t = c.t; CL.idle.call(this, P, c, dt, o);
  const syl = Math.abs(S(t * 8.3)) * (0.55 + 0.45 * Math.abs(S(t * 2.9))) * (S(t * 1.3 + 0.7) > -0.35 ? 1 : 0.1);
  P.mouthOpen = 0.08 + 0.85 * syl; P.mouthW = 1 - 0.25 * Math.abs(S(t * 4.1)) * syl; P.brow = 0.2 + 0.3 * Math.max(0, S(t * 1.7)); P.browTilt = 0.1 * S(t * 0.9);
  P.neckRX += 0.06 * syl; P.headRX += 0.05 * Math.max(0, S(t * 2.6)); P.headRZ += 0.06 * S(t * 1.1); P.chestRY = 0.12 * S(t * 0.8); P.spineRY = 0.05 * S(t * 0.8);
  const gr = 0.5 + 0.5 * S(t * 2.2), gl = 0.5 + 0.5 * S(t * 1.5 + 1.2);
  P.aWR = 1; P.aXR = -0.25 - 0.08 * S(t * 3.4); P.aYR = 0.86 + 0.14 * gr + 0.04 * S(t * 6.5); P.aZR = 0.22 + 0.08 * gr; P.pXR = -0.8; P.pYR = -1; P.pZR = -0.2; P.hWR = 0.6; P.hXR = -0.3; P.hYR = 0.5; P.hZR = 0.8 + 0.3 * S(t * 3);
  P.aWL = 0.8 * (S(t * 0.7 + 2) > 0.1 ? 1 : 0); P.aXL = 0.26; P.aYL = 0.8 + 0.1 * gl; P.aZL = 0.2 + 0.05 * gl; P.pXL = 0.8; P.pYL = -1; P.pZL = -0.3; P.hWL = 0;
};
