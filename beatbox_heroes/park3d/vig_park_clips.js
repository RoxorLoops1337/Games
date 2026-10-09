// VIGNETTE CLIPS: THE PARK (owner VIG park crew). Character animations for the park scenes (VIGNETTES.md 2.8, 2.9, 2.13), registered into the animator's clip table
// (char_anim.js CL) when vig_park.js loads. Same conventions as vignette_clips.js: rig space (+z forward, character LEFT = +x), the right hand keeps the mic in every clip
// (micLow: held low and upright like a real mic; micAim at the lips when the clip beatboxes), the left hand does the work.
//   v_bow     a small bow, the free hand on the chest (opts.at s when it starts, opts.deep 0..1)
//   v_clap    both hands clap in front of the chest on the beat (opts.bpm, opts.amp, opts.up lifts the hands: an excited clap), for the crowd (no mic needed)
//   v_knees   hands on the knees after the run, breathing hard (opts.hard 0..1)
//   v_fold    arms folded, the head nods to opts.bpm; opts.tap (0..1) the foot taps, opts.lips (0..1) the mouth starts to beatbox along, opts.stop (s) catches itself
//   v_offer   the left hand holds something out at chest height (a flyer, the notes): opts.at (s to reach), opts.hold (s), opts.x / opts.y (reach point)
//   v_throw   overhand throw with the left hand (the paper plane): opts.at (s of the release)
//   v_dap     a fist bump with the free hand: opts.at (s of the contact), opts.y / opts.z (where the fists meet)
//   v_calf    the calf stretch before the run (front knee bent, back leg long, hands forward), opts.side 1 | -1
//   v_zip     zip the jacket up to the chin (night, leaving the park), opts.at (s)
//   v_sitbox  seated, beatboxing into the mic (the bench lesson): opts.seat, opts.bpm, opts.amp
//   v_sitx    seated with a gesture (BeeAmGee never stands): opts.seat, opts.slump, opts.g = 'finger' (one finger up) | 'tap' (taps the slat on opts.bpm) | 'point' (points far, opts.dir)
//             | 'nod' (one nod at opts.at, opts.long stretches it by half a beat) | 'brow' (an eyebrow up) | 'none'
import { CL, micAim, stance, sm, clamp, lerp } from './char_anim.js';
import { micLow, handL, vigBase, REST_L } from './vignette_clips.js';

const PI = Math.PI, S = Math.sin, Cs = Math.cos, TAU = PI * 2;
const mouth = (self) => self.mouthRig || { x: 0, y: 1.1, z: 0.26 };

// ----- v_bow
CL.v_bow = function (P, c, dt, o) {
  const t = c.t - (o.at || 0), d = o.deep === undefined ? 0.6 : o.deep, b = t > 0 ? S(clamp(t / 1.0, 0, 1) * PI) : 0;
  vigBase.call(this, P, c, dt, o); P.hipsRX += 0.35 * d * b; P.spineRX += 0.18 * d * b; P.neckRX += 0.25 * d * b; P.headRX += 0.1 * d * b; P.hipsZ -= 0.03 * b;
  handL(P, 0.04, 0.95 - 0.05 * b, 0.28 + 0.04 * b, [-1, 0.1, 0.3], 0.8); P.smile += 0.3; P.blink = Math.max(P.blink, 0.5 * b);
  micLow(P, this, o);
};
// ----- v_clap (the hands meet at the chest line on every beat; amp scales it, up lifts the hands over the head for a big moment)
CL.v_clap = function (P, c, dt, o) {
  const t = c.t, bpm = o.bpm || 100, ph = (t * bpm / 60 + (o.phase || 0)) % 1, k = ph < 0.18 ? sm(ph / 0.18) : 1 - sm((ph - 0.18) / 0.55), up = o.up || 0, a = o.amp === undefined ? 1 : o.amp;
  CL.idle.call(this, P, c, dt, o); P.headRY *= 0.3; P.neckRY *= 0.3;
  const y = lerp(0.9, 1.35, up), z = lerp(0.3, 0.2, up), gap = lerp(0.2, 0.012, k * a);
  P.aWL = P.aWR = 1; P.aXL = gap; P.aXR = -gap; P.aYL = P.aYR = y; P.aZL = P.aZR = z; P.pXL = 0.9; P.pXR = -0.9; P.pYL = P.pYR = -0.6; P.pZL = P.pZR = -0.3;
  P.hWL = P.hWR = 1; P.hXL = -0.6; P.hXR = 0.6; P.hYL = P.hYR = 0.7; P.hZL = P.hZR = 0.4;
  P.hipsY -= 0.012 * k; P.neckRX += 0.05 * k; P.smile += 0.5; P.mouthOpen = 0.15 + 0.25 * up; P.brow = 0.3 + 0.3 * up;
};
// ----- v_knees (hips back, chest forward, both hands IK on the knees; the mic fist rests on the right knee, the mic standing up)
CL.v_knees = function (P, c, dt, o) {
  const t = c.t, h = o.hard === undefined ? 1 : o.hard, a = sm(t / 0.35), br = S(t * (5 + 3 * h)), in0 = Math.max(0, br);
  CL.idle.call(this, P, c, dt, o); stance(P, 0.15, 0.25);
  P.hipsY = -0.1 * a; P.hipsZ = -0.06 * a; P.hipsRX = 0.55 * a; P.spineRX = 0.22 * a + 0.03 * br * h; P.chestRX = 0.08 * a + 0.04 * in0 * h; P.neckRX = -0.35 * a; P.headRX = -0.2 * a; P.headRY = 0.15 * S(t * 0.6);
  P.aWL = P.aWR = a; P.aXL = 0.14; P.aXR = -0.14; P.aYL = P.aYR = 0.44 + 0.012 * br; P.aZL = P.aZR = 0.2; P.pXL = 0.9; P.pXR = -0.9; P.pYL = P.pYR = -0.2; P.pZL = P.pZR = -0.5; P.hWL = P.hWR = 0.6 * a; P.hXL = P.hXR = 0; P.hYL = P.hYR = -0.8; P.hZL = P.hZR = 0.6;
  P.mouthOpen = 0.35 + 0.35 * in0 * h; P.mouthW = 0.9; P.brow = 0.25; P.browTilt = 0.5; P.blink = Math.max(P.blink, 0.3 * a); P.shrug = 0.6 * br * h; P.cheek = 0.15;
  if (this.api.holding === 'mic') { P.hWR = 1; P.hXR = 0.2; P.hYR = -0.2; P.hZR = 1; }
};
// ----- v_fold (arms folded: the left hand tucks under the right elbow, the mic stands up in the right fist on the left arm)
CL.v_fold = function (P, c, dt, o) {
  const t = c.t, bpm = o.bpm || 96, nod = Math.max(0, S(t * bpm / 60 * TAU)), lips = clamp(o.lips || 0, 0, 1), stop = o.stop !== undefined && t > o.stop ? sm((t - o.stop) / 0.2) : 0, live = 1 - stop;
  CL.idle.call(this, P, c, dt, o); P.headRY *= 0.3;
  P.neckRX += (0.06 + 0.1 * nod) * live; P.headRX += 0.04 * nod * live; P.chestRX -= 0.04;
  P.aWL = 1; P.aXL = -0.1; P.aYL = 0.86; P.aZL = 0.24; P.pXL = 0.9; P.pYL = -0.3; P.pZL = -0.5; P.hWL = 0.8; P.hXL = -1; P.hYL = 0.1; P.hZL = 0;
  if (this.api.holding === 'mic') { micAim.call(this, P, [-0.04, 0.9, 0.27], [0.15, 0.95, 0.1], [0.4, -0.3, 1], true); P.pXR = -0.9; P.pYR = -0.3; P.pZR = -0.4; }
  else { P.aWR = 1; P.aXR = 0.1; P.aYR = 0.88; P.aZR = 0.26; P.pXR = -0.9; P.pYR = -0.3; P.pZR = -0.5; P.hWR = 0.8; P.hXR = 1; P.hYR = 0.1; P.hZR = 0; }
  if (o.tap) { const tp = Math.max(0, S(t * bpm / 60 * TAU)) * o.tap * live; P.lYL = 0.085 + 0.035 * tp; P.fPL = 0.4 * tp; }
  const m = Math.abs(S(t * 13)) * lips * live; P.mouthOpen = 0.06 + 0.4 * m; P.cheek = 0.4 * Math.max(0, S(t * bpm / 60 * TAU)) * lips * live;
  if (stop) { P.brow += 0.5 * stop; P.eyeX += 0.9 * S(t * 3) * stop; P.mouthOpen = 0.04; P.smile = 0.9 + 0.3 * stop; }
};
// ----- v_offer (the left hand holds an object out at chest height)
CL.v_offer = function (P, c, dt, o) {
  const t = c.t, at = o.at === undefined ? 0.35 : o.at, hold = o.hold === undefined ? 0.6 : o.hold, out = sm(t / at) * (o.stay ? 1 : 1 - sm((t - at - hold) / 0.35));
  vigBase.call(this, P, c, dt, o); P.headRY *= 0.3;
  handL(P, lerp(REST_L[0], o.x === undefined ? 0.12 : o.x, out), lerp(REST_L[1], o.y === undefined ? 0.95 : o.y, out), lerp(REST_L[2], o.z === undefined ? 0.5 : o.z, out), [lerp(0.1, 0, out), lerp(-0.3, 0.1, out), 1], 0.8);
  P.chestRY -= 0.12 * out; P.chestRX += 0.05 * out; P.hipsRX += 0.04 * out; P.brow += 0.25 * out; P.smile += 0.4 * out; P.mouthOpen = 0.08 + 0.1 * out;
  micLow(P, this, o);
};
// ----- v_throw (the left hand back by the ear, then the release forward and up)
CL.v_throw = function (P, c, dt, o) {
  const t = c.t, at = o.at === undefined ? 0.45 : o.at, wind = sm(t / at) * (1 - sm((t - at) / 0.12)), rel = sm((t - at) / 0.12) * (1 - sm((t - at - 0.35) / 0.4));
  vigBase.call(this, P, c, dt, o); P.headRY *= 0.2;
  const x = 0.24 - 0.08 * rel, y = 1.18 * wind + (0.8 + 0.42 * rel) * (1 - wind), z = -0.05 * wind + (0.24 + 0.36 * rel) * (1 - wind);
  handL(P, x, Math.max(REST_L[1], y), z, [0.1, 0.5 + 0.3 * wind, 1 - 0.6 * wind], 0.8);
  P.chestRY -= 0.3 * wind - 0.25 * rel; P.chestRX += 0.08 * rel; P.hipsRY -= 0.12 * wind - 0.12 * rel; P.neckRX -= 0.08 * rel; P.brow += 0.3 * rel; P.mouthOpen = 0.08 + 0.3 * rel;
  micLow(P, this, o);
};
// ----- v_dap (fist bump: the free hand forward to meet the other fist, a little recoil, a grin)
CL.v_dap = function (P, c, dt, o) {
  const t = c.t, at = o.at === undefined ? 0.35 : o.at, out = sm(t / at) * (1 - sm((t - at - 0.35) / 0.3)), rec = t > at && t < at + 0.25 ? S((t - at) / 0.25 * PI) : 0;
  vigBase.call(this, P, c, dt, o); P.headRY *= 0.3;
  handL(P, lerp(REST_L[0], o.x === undefined ? 0.08 : o.x, out), lerp(REST_L[1], o.y === undefined ? 1.0 : o.y, out), lerp(REST_L[2], (o.z === undefined ? 0.52 : o.z) - 0.05 * rec, out), [0, 0.1, 1], 0.9);
  P.chestRY -= 0.18 * out; P.chestRX += 0.06 * out - 0.05 * rec; P.hipsRX += 0.05 * out; P.smile += 0.8 * out; P.cheek = 0.3 * out; P.brow += 0.4 * out; P.mouthOpen = 0.1 + 0.25 * rec;
  micLow(P, this, o);
};
// ----- v_calf (a calf stretch: weight forward on the bent front leg, the back leg long, both hands push the air forward)
CL.v_calf = function (P, c, dt, o) {
  const t = c.t, a = sm(t / 0.4), s = o.side || 1, pulse = 0.5 + 0.5 * S(t * 3.2), L = s > 0 ? 'L' : 'R', R = s > 0 ? 'R' : 'L';
  CL.idle.call(this, P, c, dt, o); stance(P, 0.11, 0.15);
  P['lZ' + L] = 0.2 * a; P['lZ' + R] = -0.28 * a; P['fP' + R] = -0.1 * a; P.hipsY = -0.08 * a - 0.015 * pulse * a; P.hipsZ = 0.02 * a; P.hipsRX = 0.12 * a; P.spineRX = 0.1 * a; P.neckRX = -0.12 * a;
  handL(P, 0.12, 0.98, 0.42 * a + REST_L[2] * (1 - a), [0, 1, 0.3], 0.7 * a);
  if (this.api.holding === 'mic') { P.aWR = 1; P.aXR = -0.14; P.aYR = 0.96; P.aZR = 0.2 + 0.2 * a; P.pXR = -0.9; P.pYR = -0.6; P.pZR = -0.3; P.hWR = 0.6; P.hXR = 0.1; P.hYR = 1; P.hZR = 0.2; }
  else micLow(P, this, o);
  P.mouthOpen = 0.1 + 0.05 * pulse; P.brow = 0.15; P.blink = Math.max(P.blink, 0.3 * a);
};
// ----- v_zip (the left hand runs the zip from the belly to the chin)
CL.v_zip = function (P, c, dt, o) {
  const t = c.t - (o.at || 0), u = sm(t / 0.45), on = sm(t / 0.15) * (1 - sm((t - 0.55) / 0.25));
  vigBase.call(this, P, c, dt, o); P.headRY *= 0.2;
  handL(P, lerp(REST_L[0], 0.02, on), lerp(0.66, 1.0, u) * on + REST_L[1] * (1 - on), lerp(REST_L[2], 0.3, on), [-0.6, 0.6, 0.4], on);
  P.neckRX += 0.15 * on; P.headRX += 0.08 * on; P.shrug += 0.6 * on;
  micLow(P, this, o);
};
// ----- v_sitbox (seated beatbox: the sit clip's legs and hips, the beatbox grip at the lips, the head nods)
CL.v_sitbox = function (P, c, dt, o) {
  const seat = o.seat === undefined ? 0.46 : o.seat, t = c.t, bpm = o.bpm || 96, b = t * bpm / 60, k = Math.exp(-((b % 1) * 4)), amp = o.amp === undefined ? 1 : o.amp;
  CL.sit.call(this, P, c, dt, { seat, slump: o.slump === undefined ? 0.9 : o.slump });
  P.neckRX += 0.1 * k * amp; P.headRX += 0.05 * k * amp; P.chestRY = 0.18;
  if (this.api.holding === 'mic') { micAim.call(this, P, [-0.03, 0.112, 0.335], [0.15, 0.8, -0.58], [0.5, 0.1, 0.85]); P.pXR = -1; P.pYR = -0.25; P.pZR = 0.1; }
  P.aWL = 1; P.aXL = 0.2; P.aYL = seat + 0.26 + 0.03 * k; P.aZL = 0.2; P.pXL = 0.8; P.pYL = -0.6; P.pZL = -0.4; P.hWL = 0;
  P.mouthOpen = 0.12 + 0.5 * k * amp; P.cheek = 0.7 * k * amp; P.brow = 0.25; P.mouthW = 1 - 0.3 * k;
};
// ----- v_sitx (seated gestures, BeeAmGee's vocabulary; also the hero on the bench)
CL.v_sitx = function (P, c, dt, o) {
  const seat = o.seat === undefined ? 0.46 : o.seat, t = c.t, g = o.g || 'none', in0 = sm(t / 0.3);
  CL.sit.call(this, P, c, dt, { seat, slump: o.slump === undefined ? 1.4 : o.slump, bpm: g === 'nod' ? 0 : o.bpm || 0 });
  if (g === 'finger') { P.aWR = 1; P.aXR = -0.2; P.aYR = lerp(seat + 0.2, seat + 0.62, in0); P.aZR = 0.3; P.pXR = -0.9; P.pYR = -0.5; P.pZR = -0.3; P.hWR = in0; P.hXR = 0; P.hYR = 1; P.hZR = 0.1; P.brow += 0.3 * in0; P.headRX -= 0.06 * in0; P.mouthOpen = 0.05; }
  if (g === 'tap') { const bpm = o.bpm || 96, ph = (t * bpm / 60) % 1, k = ph < 0.12 ? 1 - ph / 0.12 : 0; P.aWR = 1; P.aXR = -0.3; P.aYR = seat + 0.07 + 0.08 * (1 - k) * (ph < 0.6 ? ph / 0.6 : 1); P.aZR = 0.1; P.pXR = -0.9; P.pYR = -0.6; P.pZR = -0.2; P.hWR = 0.7; P.hXR = 0; P.hYR = -1; P.hZR = 0.4; P.neckRX += 0.06 * k; P.headRX += 0.05; P.eyeY -= 0.4; }
  if (g === 'point') { const d = o.dir || 0; P.aWR = 1; P.aXR = -0.2 + S(d) * 0.3 * in0; P.aYR = lerp(seat + 0.2, seat + 0.58, in0); P.aZR = lerp(0.15, Cs(d) * 0.42, in0); P.pXR = -1; P.pYR = -0.4; P.pZR = -0.1; P.hWR = in0; P.hXR = S(d); P.hYR = 0.15; P.hZR = Cs(d); P.chestRY += 0.15 * d * in0; P.headRY += 0.4 * d * in0; P.brow += 0.2; P.chestRX -= 0.08 * in0; P.neckRX -= 0.08 * in0; }
  if (g === 'nod') { const at = o.at || 0.3, len = o.long ? 0.95 : 0.65, u = clamp((t - at) / len, 0, 1), k = S(u * PI); P.neckRX += 0.32 * k; P.headRX += 0.18 * k; P.blink = Math.max(P.blink, 0.6 * k); }
  if (g === 'brow') { P.brow += 0.5 * in0; P.browTilt -= 0.4 * in0; P.headRZ += 0.08 * in0; P.mouthOpen = 0.03; }
  if (g === 'listen') { P.headRY += 0.35 * in0; P.neckRY += 0.2 * in0; P.eyeY += 0.3; }
  if (this.api.holding === 'mic' && g !== 'finger' && g !== 'tap' && g !== 'point') { micAim.call(this, P, [-0.22, seat + 0.36, 0.33], [-0.2, 0.9, 0.35], [0.3, -0.3, 1], true); P.pXR = -0.8; P.pYR = -0.6; P.pZR = -0.4; }
};

export const PARK_CLIPS = ['v_bow', 'v_clap', 'v_knees', 'v_fold', 'v_offer', 'v_throw', 'v_dap', 'v_calf', 'v_zip', 'v_sitbox', 'v_sitx'];
void mouth;
