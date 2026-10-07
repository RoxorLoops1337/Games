// CHARACTER CLIPS (part 2): point, battle, sad, finisher, hit, hold (+ walkside alias). Registered into the Animator's clip table (char_anim.js) on import.
// Same conventions as char_anim.js: rig space (+z forward, character left = +x), IK targets in object space, face channels brow/browTilt/mouthOpen/smile/frown.
import { CL, stance, relaxArms, gait, beatClock, beatEnv, sm, mod, clamp, lerp } from './char_anim.js';
import { HOLD } from './char_props.js';
const PI = Math.PI, TAU = PI * 2, S = Math.sin, Cs = Math.cos;

CL.walkside = CL.walk;

// ----- point: right arm straight out at a target direction (opts.dir = yaw in radians, 0 = straight ahead), left hand on the hip, weight on the back leg, small jabs
CL.point = function (P, c, dt, o) {
  const t = c.t, dir = o.dir || 0, ex = sm(t / 0.18), jab = Math.max(0, S(t * 4.4)) * 0.03, L = 0.34 + jab, sx = -0.22, sy = 0.9;
  CL.idle.call(this, P, c, dt, o);
  P.hipsRZ = 0.04; P.hipsRY = 0.12 * ex; P.chestRY = (0.22 + dir * 0.4) * ex; P.neckRY = (-0.1 - dir * 0.2) * ex; P.headRY = (-0.1 - dir * 0.2) * ex; P.chestRX = -0.04; P.headRX = -0.02 + 0.03 * Math.max(0, S(t * 4.4)); P.headRZ = -0.05;
  P.lXL = 0.13; P.lXR = -0.13; P.lZL = -0.1; P.lZR = 0.1; P.fYL = 0.2; P.fYR = -0.12;
  const ty = sy + 0.05 * ex;
  P.aWR = ex; P.aXR = sx + Math.sin(dir) * L * 0.9; P.aYR = ty; P.aZR = Cs(dir) * L; P.pXR = -1; P.pYR = -0.4; P.pZR = -0.1; P.hWR = 1; P.hXR = Math.sin(dir); P.hYR = 0.1; P.hZR = Cs(dir);
  P.aWL = 1; P.aXL = 0.27; P.aYL = 0.6; P.aZL = 0.04; P.pXL = 1; P.pYL = -0.2; P.pZL = -0.7; P.hWL = 0;
  P.mouthOpen = 0.18 + 0.1 * Math.abs(S(t * 6)); P.brow = 0.3; P.browTilt = -0.25;
};

// ----- battle: aggressive guard stance bobbing on the beat (opts.bpm). Lead jab on the kick; the mic hand covers the mouth when holding a mic
CL.battle = function (P, c, dt, o) {
  const bc = beatClock(c, { bpm: o.bpm || 100, phase: o.phase }), E = beatEnv(this, bc, o), k = E.k, sn = E.sn, b = bc.beat * TAU, amp = o.amp === undefined ? 1 : o.amp, q = 0.5 + 0.5 * Cs(b);
  P.hipsY = -0.11 - 0.035 * q * amp - 0.025 * k * amp; P.hipsRX = 0.1; P.hipsRY = -0.22 + 0.06 * S(b * 0.5); P.hipsRZ = 0.05 * S(b * 0.5); P.hipsX = 0.012 * S(b * 0.5);
  P.spineRX = 0.04; P.chestRX = 0.02 + 0.04 * k; P.chestRY = 0.34 + 0.08 * S(b * 0.5) + 0.12 * k; P.chestRZ = 0.05 * S(b * 0.5);
  P.neckRX = -0.1 + 0.08 * q * amp; P.headRX = -0.02 + 0.05 * k; P.headRZ = 0.06 * S(b * 0.5); P.headRY = -0.1;
  stance(P, 0.17, 0.5); P.lZL = 0.14; P.lZR = -0.14; P.fYL = 0.5; P.fYR = -0.35; P.lXL = 0.15; P.lXR = -0.17;
  const m = this.mouthRig, mic = this.api.holding === 'mic';
  if (mic) { const hx = 0.45, hy = 0.8, hz = 0.4, hl = Math.hypot(hx, hy, hz); P.aWR = 1; P.hWR = 1; P.aXR = m.x - hx / hl * 0.2; P.aYR = m.y - hy / hl * 0.2 - 0.01; P.aZR = m.z - hz / hl * 0.2 - 0.02; P.hXR = hx; P.hYR = hy; P.hZR = hz; P.pXR = -0.6; P.pYR = -1; P.pZR = -0.1; }
  else { P.aWR = 1; P.aXR = -0.17 - 0.03 * sn; P.aYR = 1.0 + 0.03 * q; P.aZR = 0.26 + 0.09 * sn; P.pXR = -0.8; P.pYR = -1; P.pZR = -0.3; }
  P.aWL = 1; P.aXL = 0.18 + 0.02 * k; P.aYL = 1.0 + 0.04 * q; P.aZL = 0.3 + 0.2 * k; P.pXL = 0.8; P.pYL = -1; P.pZL = -0.2;
  P.shrug = 0.3; P.mouthOpen = 0.1 + 0.5 * sn * amp + 0.3 * E.ht * amp; P.mouthW = 0.95; P.cheek = 0.3 * k; P.brow = -0.35; P.browTilt = -0.9; P.smile = 0.15; P.frown = 0.5; P.eyeH = 0.8;
};

// ----- sad: slumped, head down, arms limp, slow sobs (opts.sob 0..1 scales the shaking)
CL.sad = function (P, c, dt, o) {
  const t = c.t, sob = o.sob === undefined ? 0.6 : o.sob, burst = Math.max(0, S(t * 0.9)) * Math.max(0, S(t * 0.37 + 1)), sh = S(t * 11) * burst * sob, br = S(t * 1.6);
  P.hipsY = -0.045 + br * 0.003; P.hipsRX = 0.05; P.spineRX = 0.12 + 0.03 * burst * sob; P.chestRX = 0.1 + 0.03 * br; P.neckRX = 0.1; P.headRX = 0.16 + 0.04 * burst * sob; P.headRY = 0.22 * S(t * 0.33); P.headRZ = 0.07 * S(t * 0.21);
  stance(P, 0.085, -0.12); P.lYL = P.lYR = 0.085;
  P.shrug = -1.2 + 5 * sh; P.shRZL = P.shRZR = 0.05; P.shRXL = P.shRXR = 0.05; P.elRXL = P.elRXR = 0.12; P.wrRXL = P.wrRXR = 0.15;
  P.chestRZ = sh * 0.05; P.hipsY += sh * 0.006;
  P.brow = 0.1; P.browTilt = 1.0; P.mouthOpen = 0.04 + 0.1 * burst * sob; P.smile = 0.001; P.frown = 1.1; P.eyeH = 0.78; P.blink = Math.max(P.blink, 0.18 + 0.4 * burst * sob);
};

// ----- finisher: crouch, leap, land in a victory pose (one fist and the mic raised, other arm flung wide, chest out) and hold it. opts.bpm adds a little pump on the beat
CL.finisher = function (P, c, dt, o) {
  const t = c.t, cr = t < 0.3 ? sm(t / 0.3) : 0, air = t >= 0.3 && t < 0.78 ? S(((t - 0.3) / 0.48) * PI) : 0, lan = t >= 0.78 ? 1 : 0, set = sm((t - 0.3) / 0.2), settle = sm((t - 0.78) / 0.25);
  const bpm = o.bpm || 0, pump = bpm ? Math.max(0, S(t * bpm / 60 * TAU)) : 0, br = S(t * 2.3);
  P.hipsY = -0.12 * cr + 0.26 * air - 0.07 * settle * lan + 0.008 * br; P.hipsRX = 0.12 * cr - 0.1 * set + 0.05 * settle; P.hipsRY = -0.25 * set; P.spineRX = 0.1 * cr - 0.06 * set; P.chestRX = -0.14 * set + 0.015 * br; P.chestRY = 0.35 * set; P.chestRZ = -0.05 * set;
  P.neckRX = -0.2 * set; P.headRX = -0.16 * set; P.headRZ = -0.09 * set; P.headRY = -0.2 * set;
  P.lWL = P.lWR = 1; P.lXL = lerp(0.12, 0.2, set); P.lXR = -lerp(0.12, 0.2, set); P.lZL = lerp(0, -0.16, settle) - 0.04 * air; P.lZR = lerp(0, 0.2, settle) - 0.04 * air; P.lYL = P.lYR = 0.085 + 0.2 * air; P.lYR += 0.04 * air; P.fPL = P.fPR = -0.6 * air; P.fYL = 0.3 * set; P.fYR = -0.3 * set;
  P.aWR = 1; P.aXR = -0.3 - 0.02 * pump; P.aYR = lerp(0.95, 1.5 + 0.06 * pump, set); P.aZR = lerp(0.2, 0.12, set); P.pXR = -1; P.pYR = -0.3; P.pZR = -0.6; P.hWR = 1; P.hXR = -0.1; P.hYR = 1; P.hZR = 0.15;
  P.aWL = 1; P.aXL = lerp(0.3, 0.74, set); P.aYL = lerp(0.9, 1.08 + 0.04 * air, set); P.aZL = lerp(0.15, 0.04, set); P.pXL = 1; P.pYL = -0.8; P.pZL = -0.5; P.hWL = 1; P.hXL = 1; P.hYL = 0.3; P.hZL = 0.1;
  P.sq = -0.06 * cr + 0.08 * air; P.mouthOpen = 0.35 + 0.55 * set; P.mouthW = 1.1; P.brow = 0.6; P.smile = 1 + set * 0.5; P.cheek = 0.25 * set; P.eyeH = 1 - 0.18 * set; P.shrug = 0.5 * set;
};

// ----- hit: one-shot flinch (returns to idle after 0.7 s). Direction alternates; opts.side = +1 or -1 forces it, opts.power scales it
CL.hit = function (P, c, dt, o) {
  const t = c.t, st = c.st; if (st.side === undefined) st.side = o.side || (Math.random() < 0.5 ? -1 : 1);
  const pw = o.power === undefined ? 1 : o.power, k = (t < 0.07 ? t / 0.07 : Math.exp(-(t - 0.07) * 4.2)) * pw, sd = st.side, rec = 1 - sm(t / 0.7);
  P.hipsY = -0.07 * k; P.hipsZ = -0.06 * k; P.hipsRX = -0.2 * k; P.hipsRZ = sd * 0.1 * k; P.spineRX = -0.12 * k; P.chestRX = -0.3 * k; P.chestRY = sd * 0.3 * k; P.chestRZ = sd * 0.12 * k;
  P.neckRX = -0.32 * k; P.headRX = -0.2 * k; P.headRY = sd * 0.4 * k; P.headRZ = sd * 0.16 * k;
  stance(P, 0.12, 0.18); P.lZL = 0.06 * k; P.lZR = -0.06 * k;
  P.shRXL = 0.7 * k; P.shRXR = 0.5 * k; P.shRZL = 0.1 + 0.6 * k; P.shRZR = 0.1 + 0.6 * k; P.elRXL = 0.2 + 0.9 * k; P.elRXR = 0.2 + 0.7 * k; P.wrRXL = P.wrRXR = 0.3 * k; P.shrug = 1.5 * k;
  P.mouthOpen = 0.95 * k * rec + 0.05; P.mouthW = 0.9; P.brow = 0.5 * k; P.browTilt = 0.9 * k; P.eyeH = 1 - 0.3 * k; P.blink = Math.max(P.blink, k > 0.4 ? 1 : 0); P.smile = 1 - k; P.frown = 0.8 * k; P.sq = -0.05 * k;
};
CL.hit.dur = 0.7; CL.hit.restart = true;

// ----- hold: carries a prop (opts.prop 'box' | 'card' | 'clipboard' | 'scorecard'; opts.raise 0..1 lifts a scorecard up for the audience). Walks when opts.speed > 0.
CL.hold = function (P, c, dt, o) {
  const t = c.t, kind = o.prop || (this.prop && this.prop.userData.kind) || 'box', H = HOLD[kind] || HOLD.box, mv = this.vs > 0.25;
  if (mv) gait.call(this, P, c, dt, o, 0); else CL.idle.call(this, P, c, dt, o);
  const lift = clamp(o.raise || 0, 0, 1), rs = this.hr = (this.hr || 0) + (lift - (this.hr || 0)) * (1 - Math.exp(-9 * dt)), br = S(t * 2.2), tilt = kind === 'scorecard' ? rs : 0;
  let px = H.pos[0], py = H.pos[1] + 0.012 * br, pz = H.pos[2], rx = H.rot[0], ry = H.rot[1], rz = H.rot[2];
  let R = H.R.slice(), L = H.L.slice();
  if (kind === 'scorecard') { px = lerp(px, -0.42, rs); py = lerp(py, 1.3, rs); pz = lerp(pz, 0.2, rs); rx = lerp(rx, 0.0, rs); ry = lerp(ry, 0.12, rs); R = [px + 0.02, py - 0.18, pz - 0.01]; L = H.L; }
  if (kind === 'clipboard') { const wr = S(t * 7) * Math.max(0, S(t * 1.1)); R = [R[0] + 0.012 * wr, R[1] - 0.012 * Math.abs(wr), R[2]]; }
  P.aWR = 1; P.aXR = R[0]; P.aYR = R[1]; P.aZR = R[2]; P.pXR = H.poleR[0] - rs * 0.6; P.pYR = H.poleR[1] + rs * 0.3; P.pZR = H.poleR[2]; P.hWR = 0;
  P.aWL = 1; P.aXL = L[0]; P.aYL = L[1]; P.aZL = L[2]; P.pXL = H.poleL[0]; P.pYL = H.poleL[1]; P.pZL = H.poleL[2]; P.hWL = 0;
  P.chestRX += 0.03; P.headRX += 0.02; P.shrug += 0.1; if (kind === 'scorecard') { P.chestRY += 0.1 * rs; P.headRY -= 0.1 * rs; P.brow += 0.2 * rs; P.mouthOpen += 0.12 * rs; }
  if (kind === 'box') { P.hipsRX += 0.04; P.chestRX -= 0.05; P.mouthOpen = 0.04; }
  if (c === this.cur) this._pp = { clip: 'hold', p: [px, py, pz], r: [rx, ry, rz] };
};
