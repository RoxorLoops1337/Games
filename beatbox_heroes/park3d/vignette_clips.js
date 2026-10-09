// VIGNETTE CLIPS (shared vignette kit, owner VIG): everyday character animations for the action vignettes (VIGNETTES.md section 7.1), registered into the
// animator's clip table (char_anim.js CL) when the first vignette module loads. Same conventions as char_anim.js / char_clips.js: rig space (+z forward,
// character LEFT = +x), IK targets in object space, face channels brow / browTilt / mouthOpen / smile / frown / blink / cheek.
// THE MIC RULE: a beatboxer never puts the mic down. The right hand keeps the mic in every clip here (the left hand eats, drinks, holds the phone, reaches);
// a resting mic fist stands the mic up at the hip like a real mic held low (micLow), and a clip that needs the mic at the lips calls micAim like the beatbox clip.
//   v_eat     left hand food to the mouth: opts.bites (count), opts.every (s per bite), opts.from [x,y,z] rig space (a spoon scoops there first), opts.chew (0..1)
//   v_drink   left hand glass or mug to the lips: opts.gulp (0.3 sip .. 1 long gulp), opts.at (s when it reaches the mouth), opts.shudder (green taste)
//   v_toss    flick a date ball up with the left hand, head back, catch in the mouth at opts.catchAt seconds (opts.miss bounces off the nose)
//   v_hold    left hand holds an object at chest height (opts.y, opts.z), looking at it (opts.look 0..1); the phone, a bowl, a mug held a beat longer
//   v_reach   left hand reaches to opts.to (rig space point) and back (opts.hold s at the target), a button, a lamp switch, a shelf
//   v_lie     lying on the back on a bed or couch (opts.y lifts the hips), breathing, eyes closed (opts.awake 0..1 opens them), opts.side rolls a little
//   v_flop    sit -> fall back onto the bed (hips pivot), legs over the edge (opts.seat), lands in v_lie's pose after 0.55 s
//   v_situp   lying -> sitting up with a stretch (opts.tries 2: the first try fails)
//   v_yawn    big yawn with the free arm stretching up, head back
//   v_stretch both arms up and back (the mic fist goes up and wide)
//   v_nod     opts.n quick nods (or one slow deep nod with opts.deep)
//   v_shrug   shoulders up, palms out, head tilt
//   v_pockets pat the hips and the chest, pull a pocket out (left hand), look down at it
//   v_type    sitting at a desk: both forearms on the desk, fingers tapping (opts.seat), head nods to opts.bpm
//   v_guns    finger guns at the camera with the free hand (the mic hand points too), a wink
// Every standing clip takes opts.sit (a seat height) to play seated: the same arms and face over the sit clip's hips and legs.
//   v_check   mirror check: turns the head left and right, the free hand touches opts.slot (hat, glasses, collar)
import { CL, micAim, stance, relaxArms, sm, clamp, lerp } from './char_anim.js';

const PI = Math.PI, S = Math.sin, Cs = Math.cos;
const mouth = (self) => self.mouthRig || { x: 0, y: 1.1, z: 0.26 };
// the mic held low and upright in the right fist (the arm hangs a little forward, the grille at the chest line)
function micLow(P, self, o) {
  if (self.api.holding !== 'mic') { P.aWR = 1; P.aXR = -0.2; P.aYR = 0.62; P.aZR = 0.1; P.pXR = -0.8; P.pYR = -0.6; P.pZR = -0.4; P.hWR = 0; return; }
  const y = (o && o.micY) || 0.82; micAim.call(self, P, [-0.21, y, 0.2], [-0.15, 0.95, 0.25], [0.3, -0.3, 1], true); P.pXR = -0.8; P.pYR = -0.6; P.pZR = -0.4;
}
// the left hand IK to a rig point with the fingers along d
function handL(P, x, y, z, d, w) { P.aWL = 1; P.aXL = x; P.aYL = y; P.aZL = z; P.pXL = 0.9; P.pYL = -0.7; P.pZL = -0.4; if (d) { P.hWL = w === undefined ? 1 : w; P.hXL = d[0]; P.hYL = d[1]; P.hZL = d[2]; } else P.hWL = 0; }
const REST_L = [0.17, 0.8, 0.24];
// the lower body: standing (idle) or, with opts.sit = seat height, seated (the sit clip's legs and hips; the arms are the clip's own)
function base(P, c, dt, o) { if (o.sit !== undefined && o.sit !== false) { CL.sit.call(this, P, c, dt, { seat: o.sit, slump: o.slump === undefined ? 0.9 : o.slump }); P.aWL = P.aWR = 0; } else CL.idle.call(this, P, c, dt, o); }

// ----- v_eat
CL.v_eat = function (P, c, dt, o) {
  const t = c.t, every = o.every || 1.0, n = o.bites === undefined ? 1 : o.bites, lead = o.lead === undefined ? 0.15 : o.lead;
  base.call(this, P, c, dt, o); P.headRY *= 0.3; P.neckRY *= 0.3;
  const k = Math.floor(Math.max(0, t - lead) / every), u = ((t - lead) / every) % 1, live = t >= lead && k < n;
  // the cycle: 0..0.42 up to the mouth, 0.42..0.55 the bite, 0.55..1 down with the chew
  const up = live ? (u < 0.42 ? sm(u / 0.42) : u < 0.55 ? 1 : 1 - sm((u - 0.55) / 0.4)) : 0, bite = live && u >= 0.4 && u < 0.6 ? S((u - 0.4) / 0.2 * PI) : 0;
  const m = mouth(this), scoop = o.from && live && u < 0.3 ? S(u / 0.3 * PI) : 0;
  let rx = REST_L[0], ry = REST_L[1] + (o.y || 0), rz = REST_L[2];
  if (o.from) { rx = lerp(rx, o.from[0], 0.6); ry = lerp(ry, o.from[1] + 0.1, 0.6); rz = lerp(rz, o.from[2], 0.6); }
  const tx = m.x + 0.07, ty = m.y - 0.25 - (o.low || 0), tz = m.z + 0.03;
  handL(P, lerp(rx, tx, up), lerp(ry, ty, up) - 0.08 * scoop, lerp(rz, tz, up), [lerp(0.1, -0.35, up), lerp(0.2, 0.75, up), lerp(1, 0.2, up)], 0.9);
  P.chestRY += -0.1 * up; P.neckRX += 0.05 * up - 0.06 * bite; P.headRX += -0.05 * up + 0.12 * bite; P.headRY += 0.05 * up;
  const chew = live || (o.chew && t < lead + n * every + 1.2) ? Math.max(0, S(t * 11)) * (1 - up) : 0;
  P.mouthOpen = 0.06 + 0.75 * bite * (1 - (o.small || 0) * 0.5) + 0.25 * chew; P.cheek = 0.35 * chew + 0.25 * (o.full || 0); P.mouthW = 1 - 0.2 * chew;
  P.blink = Math.max(P.blink, (o.warm || 0) * sm((t - lead - every * 0.55) / 0.2) * (k >= n - 1 ? 1 : 0));
  micLow(P, this, o);
};

// ----- v_drink
CL.v_drink = function (P, c, dt, o) {
  const t = c.t, at = o.at === undefined ? 0.45 : o.at, len = 0.5 + 1.2 * (o.gulp === undefined ? 0.4 : o.gulp), up = sm(t / at) * (1 - sm((t - at - len) / 0.4)), tilt = sm((t - at) / 0.3) * (1 - sm((t - at - len) / 0.3));
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.neckRY *= 0.2;
  const m = mouth(this), tx = m.x + 0.07, ty = m.y - 0.2 + 0.03 * tilt, tz = m.z + 0.04;
  handL(P, lerp(REST_L[0], tx, up), lerp(REST_L[1] + 0.06, ty, up), lerp(REST_L[2], tz, up), [lerp(0.1, -0.5, up), lerp(0.2, 0.5 + 0.35 * tilt, up), lerp(1, 0.25 - 0.3 * tilt, up)], 0.9);
  P.neckRX -= 0.12 * tilt * (o.gulp || 0.4) * 1.5; P.headRX -= 0.18 * tilt * (o.gulp || 0.4) * 1.5; P.mouthOpen = 0.1 + 0.15 * tilt; P.cheek = 0.3 * tilt;
  const sh = o.shudder ? clamp((t - at - len) / 0.6, 0, 1) : 0, shk = sh > 0 && sh < 1 ? S(sh * PI) * S(t * 46) : 0;
  P.headRY += 0.12 * shk; P.chestRZ += 0.04 * shk; P.shrug += 1.2 * S(sh * PI); P.frown += 0.9 * S(sh * PI); P.blink = Math.max(P.blink, 0.8 * S(sh * PI));
  if (o.warm) { const w = sm((t - at - len) / 0.3); P.blink = Math.max(P.blink, 0.85 * w); P.shrug -= 0.8 * w; P.smile += 0.4 * w; }
  micLow(P, this, o);
};

// ----- v_toss
CL.v_toss = function (P, c, dt, o) {
  const t = c.t, ca = o.catchAt === undefined ? 0.75 : o.catchAt, fl = sm(t / 0.2) * (1 - sm((t - 0.25) / 0.2)), back = sm((t - 0.2) / 0.3) * (1 - sm((t - ca - 0.15) / 0.3)), gulp = t > ca && t < ca + 0.25 ? S((t - ca) / 0.25 * PI) : 0;
  base.call(this, P, c, dt, o); P.headRY *= 0.2;
  handL(P, 0.2, 0.86 + 0.12 * fl, 0.24 + 0.04 * fl, [0.1, 1, 0.6], 0.6);
  P.neckRX -= 0.25 * back; P.headRX -= 0.3 * back; P.mouthOpen = 0.1 + 0.7 * back * (t < ca ? 1 : 0) + 0.2 * gulp; P.eyeY += 0.6 * back; P.brow += 0.3 * back;
  if (o.miss && t > ca) { const k = Math.exp(-(t - ca) * 6) * S((t - ca) * 30); P.headRX += 0.08 * k; P.blink = Math.max(P.blink, t < ca + 0.2 ? 1 : 0); }
  if (t > ca + 0.3) P.cheek = 0.4 * Math.max(0, S(t * 10));
  micLow(P, this, o);
};

// ----- v_hold
CL.v_hold = function (P, c, dt, o) {
  const t = c.t, lk = o.look === undefined ? 1 : o.look; base.call(this, P, c, dt, o); P.headRY *= 0.2 * (1 - lk) + 0.1; P.neckRY *= 0.2;
  handL(P, o.x === undefined ? 0.12 : o.x, o.y === undefined ? 0.88 : o.y, o.z === undefined ? 0.3 : o.z, o.d || [-0.2, 0.55, 0.8], 0.9);
  P.neckRX += 0.18 * lk; P.headRX += 0.16 * lk; P.chestRY -= 0.06; P.eyeY -= 0.5 * lk;
  if (o.thumb) { const k = Math.max(0, S(t * 9)); P.aYL += 0.006 * k; }
  if (o.glow) { P.brow += 0.1; }
  micLow(P, this, o);
};

// ----- v_reach
CL.v_reach = function (P, c, dt, o) {
  const t = c.t, to = o.to || [0.25, 1.0, 0.5], hold = o.hold === undefined ? 0.25 : o.hold, out = sm(t / 0.35) * (1 - sm((t - 0.35 - hold) / 0.35));
  base.call(this, P, c, dt, o); P.headRY *= 0.2;
  handL(P, lerp(REST_L[0], to[0], out), lerp(REST_L[1], to[1], out), lerp(REST_L[2], to[2], out), [lerp(0.1, to[0] * 0.5, out), lerp(-0.3, 0.1, out), lerp(0.9, 1, out)], 0.7 * out);
  P.chestRX += 0.1 * out * (to[2] > 0.45 ? 1 : 0); P.hipsRX += 0.06 * out; P.chestRY -= 0.12 * out; P.neckRX += 0.08 * out;
  micLow(P, this, o);
};

// ----- v_lie (lying on the back; the hips pivot the whole body back, a pillow lifts the head)
function lie(P, t, o, k) {
  const br = S(t * (o.slow ? 1.1 : 1.6));
  P.hipsRX = -1.52 * k; P.hipsY = (o.y === undefined ? 0.2 : o.y) * k + 0.006 * br * k; P.hipsZ = -0.12 * k;
  P.spineRX = 0.02 * k + 0.01 * br; P.chestRX = 0.02 * k; P.neckRX = 0.32 * k; P.headRX = 0.12 * k + (o.tilt || 0); P.headRY = (o.turn || 0) * k; P.headRZ = 0.06 * S(t * 0.3) * k;
  P.hipsRZ = (o.side || 0) * 0.3 * k; P.chestRZ = (o.side || 0) * 0.1 * k;
  ['L', 'R'].forEach((s, i) => { P['lW' + s] = 0; P['thRX' + s] = 0.05 * k + 0.03 * i; P['thRZ' + s] = 0.08; P['knRX' + s] = 0.12 * k + 0.08 * i; P['anRX' + s] = 0.5 * k; });
  P.shRZL = P.shRZR = 0.22; P.elRXL = P.elRXR = 0.5; P.shRXL = 0.18; P.shRXR = 0.18; P.wrRXL = P.wrRXR = 0.2; P.shrug = br * 0.25;
}
CL.v_lie = function (P, c, dt, o) {
  const t = c.t, aw = o.awake === undefined ? 0 : o.awake; lie(P, t, o, 1);
  P.blink = Math.max(P.blink, 1 - aw); P.mouthOpen = 0.04 + (o.snore ? 0.25 * Math.max(0, S(t * 2.2)) : 0); P.smile = o.smile ? 1.3 : 1; P.brow = -0.05;
  // the mic fist rests on the chest, the mic lying along the body (the mic never leaves the hand, even asleep)
  if (this.api.holding === 'mic') { P.aWR = 1; P.aXR = -0.1; P.aYR = 0.72; P.aZR = 0.22; P.pXR = -0.9; P.pYR = -0.4; P.pZR = 0.2; P.hWR = 0.6; P.hXR = 0.3; P.hYR = 0.2; P.hZR = 1; }
};
// ----- v_flop (from the bed edge: sit, then the fall back onto the mattress; legs stay over the edge)
CL.v_flop = function (P, c, dt, o) {
  const t = c.t, seat = o.seat === undefined ? 0.54 : o.seat, f = sm((t - (o.at === undefined ? 0.35 : o.at)) / 0.45), br = S(t * 1.5);
  P.hipsY = lerp(seat - 0.4, seat - 0.4 + 0.12, f); P.hipsZ = lerp(-0.03, -0.1, f); P.hipsRX = -1.45 * f;
  P.spineRX = lerp(0.18, 0.02, f); P.chestRX = lerp(0.1, 0.02, f); P.neckRX = lerp(-0.1, 0.3, f); P.headRX = lerp(0.06, 0.1, f) + 0.004 * br;
  ['L', 'R'].forEach((s, i) => { P['lW' + s] = 0; P['thRX' + s] = 1.4 + 1.45 * f; P['thRZ' + s] = 0.1; P['knRX' + s] = 1.3 + 0.1 * i + 0.25 * Math.max(0, S((t - 0.35) * 12)) * (1 - sm(t - 0.9)); P['anRX' + s] = -0.2; });
  P.shRZL = P.shRZR = lerp(0.1, 0.45, f); P.elRXL = P.elRXR = lerp(0.3, 0.3, f); P.shRXL = P.shRXR = lerp(0.2, 0.9, f) * 0.5; P.blink = Math.max(P.blink, f * (o.close === false ? 0 : 1)); P.mouthOpen = 0.05 + 0.25 * S(f * PI);
  if (this.api.holding === 'mic') { P.aWR = 1 - f * 0.4; P.aXR = -0.24; P.aYR = lerp(seat + 0.3, 0.75, f); P.aZR = 0.22; P.pXR = -0.9; P.pYR = -0.5; P.pZR = 0; P.hWR = 0; }
};
// ----- v_situp (lying -> sitting up and stretching; tries 2 = the first attempt flops back)
CL.v_situp = function (P, c, dt, o) {
  const t = c.t, two = o.tries === 2, t0 = two ? 0.9 : 0, fail = two ? S(clamp(t / 0.8, 0, 1) * PI) * 0.4 : 0, up = sm((t - t0) / 0.6), st = sm((t - t0 - 0.55) / 0.35) * (1 - sm((t - t0 - 1.5) / 0.4));
  lie(P, t, o, 1 - Math.max(up, fail));
  const seat = o.seat === undefined ? 0.54 : o.seat; if (up > 0) { P.hipsY = lerp(P.hipsY, seat - 0.4, up); P.hipsZ = lerp(P.hipsZ, -0.03, up); ['L', 'R'].forEach((s) => { if (o.edge) { P['thRX' + s] = lerp(P['thRX' + s], 1.4, up); P['knRX' + s] = lerp(P['knRX' + s], 1.3, up); } }); P.spineRX += 0.12 * up; }
  P.blink = Math.max(P.blink, 1 - sm((t - t0 - 0.2) / 0.3)); P.mouthOpen = 0.06 + 0.7 * st; P.headRX -= 0.25 * st; P.neckRX -= 0.15 * st; P.eyeH *= 1 - 0.3 * st;
  P.aWL = st; P.aXL = 0.24; P.aYL = 1.45; P.aZL = 0.0; P.pXL = 1; P.pYL = 0; P.pZL = -0.5; P.hWL = st; P.hXL = 0.2; P.hYL = 1; P.hZL = 0;
  if (this.api.holding === 'mic') { if (st > 0.05) { P.aWR = st; P.aXR = -0.3; P.aYR = 1.42; P.aZR = 0.02; P.pXR = -1; P.pYR = 0; P.pZR = -0.5; P.hWR = st; P.hXR = -0.4; P.hYR = 1; P.hZR = 0.1; } else { P.aWR = 1; P.aXR = -0.1; P.aYR = lerp(0.72, seat + 0.32, up); P.aZR = 0.22; P.pXR = -0.9; P.pYR = -0.4; P.pZR = 0.2; } }
};

// ----- v_yawn
CL.v_yawn = function (P, c, dt, o) {
  const t = c.t, y = S(clamp(t / 1.2, 0, 1) * PI); base.call(this, P, c, dt, o);
  P.neckRX -= 0.2 * y; P.headRX -= 0.25 * y; P.mouthOpen = 0.1 + 0.95 * y; P.mouthW = 1 - 0.25 * y; P.blink = Math.max(P.blink, 0.9 * y); P.brow += 0.3 * y; P.browTilt += 0.4 * y; P.shrug += 1.2 * y;
  handL(P, lerp(REST_L[0], 0.22, y), lerp(REST_L[1], 1.42, y), lerp(REST_L[2], 0.02, y), [0.2, 1, 0], y); P.chestRX -= 0.08 * y;
  micLow(P, this, o);
};
// ----- v_stretch
CL.v_stretch = function (P, c, dt, o) {
  const t = c.t, y = S(clamp(t / (o.dur || 1.4), 0, 1) * PI); base.call(this, P, c, dt, o);
  P.chestRX -= 0.16 * y; P.spineRX -= 0.06 * y; P.neckRX -= 0.1 * y; P.mouthOpen = 0.08 + 0.4 * y; P.blink = Math.max(P.blink, 0.7 * y); P.sq = 0.04 * y;
  handL(P, lerp(REST_L[0], 0.26, y), lerp(REST_L[1], 1.48, y), lerp(REST_L[2], -0.05, y), [0.2, 1, -0.1], y);
  if (this.api.holding === 'mic') { P.aWR = 1; P.aXR = lerp(-0.2, -0.36, y); P.aYR = lerp(0.82, 1.42, y); P.aZR = 0.0; P.pXR = -1; P.pYR = -0.2; P.pZR = -0.5; P.hWR = y; P.hXR = -0.6; P.hYR = 1; P.hZR = 0.1; }
};
// ----- v_nod
CL.v_nod = function (P, c, dt, o) {
  const t = c.t, n = o.n || 2, d = o.deep ? 1.1 : 0.32, k = t < n * d ? Math.max(0, S(t / d * PI * 2 - PI / 2) * 0.5 + 0.5) * S(clamp(t / (n * d), 0, 1) * PI) : 0;
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.neckRX += (o.deep ? 0.35 : 0.18) * k; P.headRX += (o.deep ? 0.2 : 0.12) * k; P.smile += 0.3; P.brow += 0.1;
  micLow(P, this, o);
};
// ----- v_shrug
CL.v_shrug = function (P, c, dt, o) {
  const t = c.t, y = S(clamp(t / 1.0, 0, 1) * PI); base.call(this, P, c, dt, o);
  P.shrug += 2.2 * y; P.headRZ += 0.16 * y; P.brow += 0.5 * y; P.browTilt += 0.5 * y; P.mouthOpen = 0.08; P.frown += 0.4 * y; P.smile *= 1 - 0.5 * y;
  handL(P, lerp(REST_L[0], 0.34, y), lerp(REST_L[1], 0.86, y), lerp(REST_L[2], 0.22, y), [0.8, 0.3, 0.5], y);
  micLow(P, this, o); if (this.api.holding === 'mic') P.aXR -= 0.1 * y;
};
// ----- v_pockets
CL.v_pockets = function (P, c, dt, o) {
  const t = c.t, a = sm(t / 0.25), pat = t < 1.2 ? Math.max(0, S(t * 14)) : 0, pull = sm((t - 1.1) / 0.3), look = sm((t - 1.2) / 0.3);
  base.call(this, P, c, dt, o); P.headRY *= 0.2;
  const y = t < 0.6 ? 0.56 : t < 1.1 ? 0.78 : 0.6;
  handL(P, lerp(0.2, 0.2, pull), lerp(REST_L[1], y + 0.02 * pat, a), lerp(REST_L[2], 0.06, a) + 0.18 * pull, [0.2, 0.2 + 0.6 * pull, 0.8], 0.7);
  P.neckRX += 0.3 * look; P.headRX += 0.15 * look; P.eyeY -= 0.7 * look; P.brow += 0.4 * look; P.browTilt += 0.6 * look; P.mouthOpen = 0.06 + 0.1 * look; P.smile *= 1 - 0.6 * look;
  P.hipsRZ += 0.04 * pat; micLow(P, this, o);
};
// ----- v_type (sitting at the desk, the chair seat at opts.seat, forearms on the desk edge)
CL.v_type = function (P, c, dt, o) {
  CL.sit.call(this, P, c, dt, Object.assign({}, o, { bpm: 0 })); const t = c.t, bpm = o.bpm || 0, nod = bpm ? Math.max(0, S(t * bpm / 60 * PI * 2)) : 0, seat = o.seat === undefined ? 0.5 : o.seat;
  P.spineRX = 0.08; P.chestRX = 0.06; P.neckRX = -0.04 + 0.08 * nod; P.headRX = 0.02 + 0.05 * nod; P.headRY = 0.05 * S(t * 0.4);
  const tap = Math.max(0, S(t * 17)), tap2 = Math.max(0, S(t * 17 + 2));
  handL(P, 0.14, seat + 0.33 + 0.02 * tap, 0.4, [0, -0.6, 1], 0.5);
  if (!o.mic || this.api.holding !== 'mic') { P.aWR = 1; P.aXR = -0.14; P.aYR = seat + 0.33 + 0.02 * tap2; P.aZR = 0.4; P.pXR = -0.9; P.pYR = -0.6; P.pZR = -0.3; P.hWR = 0.5; P.hXR = 0; P.hYR = -0.6; P.hZR = 1; }
  P.mouthOpen = 0.06 + (o.talk ? 0.6 * Math.abs(S(t * 8.3)) : 0);
  if (o.mic) { micAim.call(this, P, [-0.03, 0.112, 0.335], [0.15, 0.8, -0.58], [0.5, 0.1, 0.85]); P.pXR = -1; P.pYR = -0.25; P.pZR = 0.1; const k = Math.max(0, S(t * (bpm || 96) / 60 * PI * 2)); P.cheek = 0.5 * k; P.mouthOpen = 0.12 + 0.4 * Math.max(0, S(t * 13)); }
};
// ----- v_guns (finger guns: the free hand points at the camera, the mic hand mirrors it; a wink)
CL.v_guns = function (P, c, dt, o) {
  const t = c.t, a = sm(t / 0.25), pop = Math.max(0, S((t - 0.3) * 9)) * Math.exp(-(t - 0.3) * 3); base.call(this, P, c, dt, o); P.headRY *= 0.2;
  stance(P, 0.15, 0.3); P.hipsY -= 0.03 * a; P.chestRY += 0.15 * a; P.headRZ -= 0.12 * a;
  handL(P, 0.24, 1.0 + 0.04 * pop, 0.42, [0.1, 0.2 * pop, 1], a);
  if (this.api.holding === 'mic') { P.aWR = 1; P.aXR = -0.26; P.aYR = 0.98 + 0.03 * pop; P.aZR = 0.4; P.pXR = -0.9; P.pYR = -0.6; P.pZR = -0.3; P.hWR = a * 0.8; P.hXR = -0.1; P.hYR = 0.4; P.hZR = 1; }
  else { P.aWR = 1; P.aXR = -0.24; P.aYR = 1.0 + 0.04 * pop; P.aZR = 0.42; P.pXR = -0.9; P.pYR = -0.7; P.pZR = -0.4; P.hWR = a; P.hXR = -0.1; P.hYR = 0.2 * pop; P.hZR = 1; }
  P.smile = 1.6; P.cheek = 0.4; P.brow = 0.35; P.mouthOpen = 0.18; if (t > 0.45 && t < 0.8) { P.eyeH *= 0.75; P.blink = Math.max(P.blink, 0.35); }
};
// ----- v_check (mirror check: head left, head right, a touch on the slot that changed)
CL.v_check = function (P, c, dt, o) {
  const t = c.t, turn = S(clamp(t / 1.6, 0, 1) * PI * 2) * 0.45, touch = sm((t - 1.4) / 0.3) * (1 - sm((t - 2.1) / 0.3)), slot = o.slot || 'hat';
  base.call(this, P, c, dt, o); P.headRY = turn; P.neckRY = turn * 0.5; P.chestRY = turn * 0.15; P.brow = 0.25; P.eyeX = -turn * 1.2;
  const m = mouth(this), hy = slot === 'hat' ? m.y + 0.42 : slot === 'glasses' ? m.y + 0.2 : slot === 'shoes' ? 0.95 : m.y - 0.18, hz = slot === 'hat' ? m.z - 0.05 : m.z + 0.02;
  handL(P, lerp(REST_L[0], 0.24, touch), lerp(REST_L[1], hy, touch), lerp(REST_L[2], hz, touch), [-0.4, 0.8, 0.2], touch);
  P.smile += 0.3 * touch; micLow(P, this, o);
};

export const VIG_CLIPS = ['v_eat', 'v_drink', 'v_toss', 'v_hold', 'v_reach', 'v_lie', 'v_flop', 'v_situp', 'v_yawn', 'v_stretch', 'v_nod', 'v_shrug', 'v_pockets', 'v_type', 'v_guns', 'v_check'];
void relaxArms;
