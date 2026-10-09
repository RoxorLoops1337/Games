// VIGNETTE CLIPS for the town interiors (owner VIG town crew: the thrift shop, the Sound Lab, the bar; VIGNETTES.md section 7). Registered into the animator's clip table
// (char_anim.js CL) when the first town vignette module loads. Same conventions as vignette_clips.js: rig space (+z forward, character LEFT = +x), IK targets in object space.
// THE MIC RULE: the hero's right fist keeps the mic in every clip (rests low and upright, or at the lips); the left hand does the work. An NPC (no mic) uses both hands.
//   v_spin    the try-on twirl: a hop and a full turn in opts.dur (0.6 s); the look swaps at the half turn (the reel does that)
//   v_hattip  the hat pop: a small hop, the free hand taps the brim (the new hat lands on the kick)
//   v_shades  the shades slide: the free hand pulls them down the nose, a look over the rims, and back up
//   v_no      a head shake (opts.n shakes), the frown of a clerk who has seen that jumper before
//   v_bow     a stage bow (opts.deep), the mic hand swings out wide, the free hand on the heart
//   v_clap    claps on opts.bpm (opts.slow: the one slow clap from the back). The hero claps the free hand on the mic wrist
//   v_polish  the barkeeper's idle: a glass in the left hand, the cloth hand circles it (NPC)
//   v_slide   a push along the counter top with the right hand at opts.y (counter height) out to opts.z (NPC)
//   v_scrub   the dishes: the free hand scrubs low in the sink in time while the mic hand keeps the beat at the lips (opts.bpm)
//   v_liproll the lip roll: lips flutter, a little head buzz; opts.spit ends it in a failed spray and a laugh
//   v_snap    the free hand snaps on 2 and 4 at opts.bpm (Thrift Jazz)
//   v_bob     a pigeon head bob at opts.bpm (Pigeon Pluck)
//   v_count   the free hand up at the face, pumping once per beat (a count in) at opts.bpm, opts.n counts
//   v_thumb   a thumbs up held out at the chest (the engineer behind the glass, the hero back)
//   v_offer   a hand held out to shake or bump (opts.to = how far, opts.fist): the free hand for the hero, the right hand for an NPC
//   v_micup   the mic up to the lips and a held breath (opts.tremor: the hand shakes a little, nerves), no sound yet
//   v_pat     the free hand pats something in front at opts.y (a mic stand, a stack of glasses), opts.n pats
//   v_lean    seated at a counter (opts.sit = the seat), forearm on the top at opts.y, the mic fist resting on the thigh
//   v_hang    the free hand lifts a hanger up to a rail at opts.y, again every opts.every seconds (the fastest the hero ever is)
//   v_carry   the free hand under a box at the hip (opts.y), the body leaning against the weight
//   v_hug     a short two arm hug on an NPC (date), opts.to = distance to the partner
// Every clip takes opts.sit (a seat height) to play seated, like vignette_clips.js.
import { CL, micAim, stance, relaxArms, sm, clamp, lerp } from './char_anim.js';

const PI = Math.PI, S = Math.sin, TAU = PI * 2;
const mouth = (self) => self.mouthRig || { x: 0, y: 1.1, z: 0.26 };
const REST_L = [0.17, 0.8, 0.24];
const mic = (self) => self.api.holding === 'mic';
function micLow(P, self, o) {
  if (!mic(self)) { P.aWR = 1; P.aXR = -0.2; P.aYR = 0.62; P.aZR = 0.1; P.pXR = -0.8; P.pYR = -0.6; P.pZR = -0.4; P.hWR = 0; return; }
  const y = (o && o.micY) || 0.82; micAim.call(self, P, [-0.21, y, 0.2], [-0.15, 0.95, 0.25], [0.3, -0.3, 1], true); P.pXR = -0.8; P.pYR = -0.6; P.pZR = -0.4;
}
function micLips(P, self, k) { if (!mic(self)) return; micAim.call(self, P, [-0.03, 0.112 + 0.006 * (k || 0), 0.335], [0.15, 0.8, -0.58], [0.5, 0.1, 0.85]); P.pXR = -1; P.pYR = -0.25; P.pZR = 0.1; }
function handL(P, x, y, z, d, w) { P.aWL = 1; P.aXL = x; P.aYL = y; P.aZL = z; P.pXL = 0.9; P.pYL = -0.7; P.pZL = -0.4; if (d) { P.hWL = w === undefined ? 1 : w; P.hXL = d[0]; P.hYL = d[1]; P.hZL = d[2]; } else P.hWL = 0; }
function handR(P, x, y, z, d, w) { P.aWR = 1; P.aXR = x; P.aYR = y; P.aZR = z; P.pXR = -0.9; P.pYR = -0.7; P.pZR = -0.4; if (d) { P.hWR = w === undefined ? 1 : w; P.hXR = d[0]; P.hYR = d[1]; P.hZR = d[2]; } else P.hWR = 0; }
function base(P, c, dt, o) { if (o.sit !== undefined && o.sit !== false) { CL.sit.call(this, P, c, dt, { seat: o.sit, slump: o.slump === undefined ? 0.8 : o.slump }); P.aWL = P.aWR = 0; } else CL.idle.call(this, P, c, dt, o); }
// the seated hips lift the arms: rest heights follow the seat
const lift = (o) => (o.sit !== undefined && o.sit !== false ? o.sit - 0.46 : 0);

// ----- v_spin (the body turns a full circle in the air: the legs go FK for the hop, the arms float out, both come back at the landing)
CL.v_spin = function (P, c, dt, o) {
  const t = c.t, d = o.dur || 0.6, u = clamp(t / d, 0, 1), e = u < 1 ? sm(u) : 0, air = S(u * PI), fk = sm(Math.min(u / 0.15, (1 - u) / 0.15, 1));
  CL.idle.call(this, P, c, dt, o); P.headRY *= 0.2;
  P.hipsRY += TAU * e * (o.dir || 1); P.hipsY += 0.07 * air - 0.03 * (1 - air) * (u > 0 && u < 1 ? 1 : 0); P.chestRZ += 0.05 * air; P.headRZ -= 0.08 * air;
  P.lWL = P.lWR = 1 - fk; P.thRXL = 0.25 * air; P.thRXR = 0.05 * air; P.knRXL = 0.55 * air; P.knRXR = 0.2 * air; P.thRZL = 0.05; P.thRZR = 0.05;
  micLow(P, this, o); P.aWL = P.aWR = 1 - fk; P.hWL = (P.hWL || 0) * (1 - fk); P.hWR = (P.hWR || 0) * (1 - fk);
  P.shRZL = lerp(P.shRZL, 0.9, fk); P.shRZR = lerp(P.shRZR, 0.55, fk); P.elRXL = lerp(P.elRXL, 0.4, fk); P.elRXR = lerp(P.elRXR, 1.0, fk);
  P.smile = 1.4; P.brow = 0.3 + 0.2 * air; P.mouthOpen = 0.12 + 0.2 * air;
};
// ----- v_hattip (hop, the brim tap)
CL.v_hattip = function (P, c, dt, o) {
  const t = c.t, hop = S(clamp(t / 0.32, 0, 1) * PI), tap = sm(t / 0.18) * (1 - sm((t - 0.42) / 0.2)), m = mouth(this);
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.hipsY += 0.05 * hop; P.headRX -= 0.08 * hop; P.headRZ += 0.1 * tap;
  handL(P, lerp(REST_L[0], 0.22, tap), lerp(REST_L[1], m.y + 0.45, tap), lerp(REST_L[2], m.z + 0.02, tap), [-0.5, 0.6, 0.6], tap);
  P.smile = 1.5; P.brow = 0.35; P.blink = Math.max(P.blink, t > 0.3 && t < 0.42 ? 0.8 : 0); micLow(P, this, o);
};
// ----- v_shades (down the nose, a look over the rims, back up)
CL.v_shades = function (P, c, dt, o) {
  const t = c.t, a = sm(t / 0.16) * (1 - sm((t - 0.55) / 0.15)), dn = sm((t - 0.12) / 0.12) * (1 - sm((t - 0.4) / 0.12)), m = mouth(this);
  base.call(this, P, c, dt, o); P.headRY *= 0.2;
  handL(P, lerp(REST_L[0], 0.08, a), lerp(REST_L[1], m.y + 0.2 - 0.05 * dn, a), lerp(REST_L[2], m.z + 0.12, a), [-0.6, 0.6, 0.3], a);
  P.neckRX += 0.18 * dn; P.headRX += 0.12 * dn; P.eyeY += 0.8 * dn; P.brow += 0.7 * dn; P.browTilt -= 0.2 * dn; P.smile = 1.3 + 0.3 * dn; micLow(P, this, o);
};
// ----- v_no
CL.v_no = function (P, c, dt, o) {
  const t = c.t, n = o.n || 3, d = 0.22, k = t < n * d ? S(t / d * PI) * S(clamp(t / (n * d), 0, 1) * PI) : 0;
  base.call(this, P, c, dt, o); P.headRY = 0.38 * k; P.neckRY = 0.12 * k; P.frown += 0.6; P.smile *= 0.4; P.brow -= 0.1; P.mouthOpen = 0.04; P.eyeH *= 0.85;
  if (!mic(this) && o.fold) { handL(P, 0.12, 0.95, 0.3, [-0.6, 0, 0.8], 0.6); handR(P, -0.12, 0.95, 0.3, [0.6, 0, 0.8], 0.6); } else micLow(P, this, o);
};
// ----- v_bow
CL.v_bow = function (P, c, dt, o) {
  const t = c.t, dn = sm(t / 0.4) * (1 - sm((t - (o.hold || 0.75)) / 0.4)), deep = o.deep ? 1.25 : 0.85;
  base.call(this, P, c, dt, o); P.headRY *= 0.1;
  P.hipsRX += 0.55 * deep * dn; P.spineRX += 0.12 * deep * dn; P.chestRX += 0.1 * deep * dn; P.neckRX += 0.1 * dn; P.hipsZ -= 0.06 * dn; P.blink = Math.max(P.blink, 0.6 * dn);
  handL(P, lerp(REST_L[0], 0.04, dn), lerp(REST_L[1], 0.95, dn), lerp(REST_L[2], 0.3, dn), [-0.8, 0.2, 0.3], dn);
  if (mic(this)) { P.aWR = 1; P.aXR = lerp(-0.21, -0.48, dn); P.aYR = lerp(0.82, 0.92, dn); P.aZR = lerp(0.2, 0.12, dn); P.pXR = -1; P.pYR = -0.4; P.pZR = -0.3; P.hWR = 0.8 * dn; P.hXR = -0.6; P.hYR = 0.75; P.hZR = 0.2; } else micLow(P, this, o);
  P.smile = 1.3 + 0.3 * (1 - dn); P.mouthOpen = 0.06;
};
// ----- v_clap
CL.v_clap = function (P, c, dt, o) {
  const t = c.t, per = o.slow ? 0.9 : 60 / (o.bpm || 100), u = (t % per) / per, meet = u < 0.18 ? sm(u / 0.18) : 1 - sm((u - 0.18) / 0.5), lt = lift(o);
  base.call(this, P, c, dt, o); P.headRY *= 0.3; P.smile = o.slow ? 1.2 : 1.5; P.brow = 0.2;
  if (mic(this)) { micLow(P, this, o); handL(P, lerp(0.26, -0.06, meet), 0.86 + lt, 0.3, [-1, 0.2, 0.2], 0.8); return; }
  const x = lerp(0.2, 0.02, meet); handL(P, x, 0.95 + lt, 0.32, [-1, 0.3, 0.3], 0.9); handR(P, -x, 0.95 + lt, 0.32, [1, 0.3, 0.3], 0.9); P.chestRX += 0.03 * meet;
};
// ----- v_polish (NPC: a glass in the left hand at the chest, the cloth hand circling)
CL.v_polish = function (P, c, dt, o) {
  const t = c.t, a = t * (o.fast ? 9 : 5.5); base.call(this, P, c, dt, o); P.headRY *= 0.3; P.neckRX += 0.18; P.headRX += 0.1; P.eyeY -= 0.4;
  handL(P, 0.08, 0.92, 0.34, [-0.4, 0.8, 0.4], 0.8);
  if (mic(this)) micLow(P, this, o); else handR(P, -0.02 + 0.035 * Math.cos(a), 0.96 + 0.035 * S(a), 0.36, [0.8, 0.2, 0.5], 0.7);
};
// ----- v_slide (NPC: the push down the counter top)
CL.v_slide = function (P, c, dt, o) {
  const t = c.t, y = o.y || 1.08, z0 = 0.32, z1 = o.z || 0.62, out = sm(t / 0.25) * (1 - sm((t - 0.55) / 0.3));
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.chestRX += 0.12 * out; P.hipsRX += 0.06 * out; P.chestRY -= 0.15 * out; P.smile = 1.3; P.brow = 0.2;
  if (mic(this)) { micLow(P, this, o); handL(P, 0.12, y + 0.02, lerp(z0, z1, out), [0, -0.4, 1], 0.6); return; }
  handR(P, -0.1, y + 0.02, lerp(z0, z1, out), [0, -0.4, 1], 0.6); P.aWL = 1; P.aXL = 0.2; P.aYL = y - 0.02; P.aZL = 0.3; P.pXL = 0.9; P.pYL = -0.7; P.pZL = -0.4;
};
// ----- v_scrub (the free hand scrubs in time, the mic at the lips: the sink is a drum kit)
CL.v_scrub = function (P, c, dt, o) {
  const t = c.t, bpm = o.bpm || 100, b = t * bpm / 60 * TAU, k = Math.max(0, S(b)) ** 3;
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.neckRX += 0.15 + 0.05 * k; P.headRX += 0.08; P.eyeY -= 0.5; P.hipsY -= 0.02 * k; P.chestRX += 0.05;
  handL(P, 0.12 + 0.05 * Math.cos(b * 0.5), (o.y || 0.86) + 0.03 * S(b), 0.36 + 0.04 * S(b * 0.5), [0, -0.8, 0.6], 0.6);
  if (o.hum !== false) { micLips(P, this, k); P.cheek = 0.5 * k; P.mouthOpen = 0.08 + 0.2 * k; } else micLow(P, this, o);
};
// ----- v_liproll (lips flutter; opts.spit: the failed try)
CL.v_liproll = function (P, c, dt, o) {
  const t = c.t, len = o.len || 1.0, on = t < len ? sm(t / 0.1) * (1 - sm((t - len + 0.12) / 0.12)) : 0, fl = Math.abs(S(t * 95));
  base.call(this, P, c, dt, o); P.headRY *= 0.3;
  P.mouthOpen = 0.04 + 0.16 * fl * on; P.mouthW = 1 - 0.3 * on; P.cheek = 0.45 * on + 0.15 * fl * on; P.headRZ += 0.025 * S(t * 60) * on; P.brow += 0.3 * on; P.blink = Math.max(P.blink, 0.5 * on);
  if (o.spit) { const sp = t > len ? Math.exp(-(t - len) * 7) : 0, la = sm((t - len - 0.25) / 0.2); P.headRX += 0.14 * sp; P.mouthOpen += 0.4 * sp; P.blink = Math.max(P.blink, sp); P.smile = 1 + 0.8 * la; P.mouthOpen += 0.35 * la * Math.abs(S(t * 14)); P.shrug += 1.2 * la * Math.abs(S(t * 14)); }
  if (mic(this)) micLips(P, this, 0.2 * on); else micLow(P, this, o);
  if (o.sit !== undefined && !mic(this)) { handL(P, 0.16, o.sit + 0.36, 0.22, null); }
};
// ----- v_snap (2 and 4)
CL.v_snap = function (P, c, dt, o) {
  const t = c.t, bpm = o.bpm || 92, bt = t * bpm / 60, ph = bt % 2, hit = ph > 1 ? Math.exp(-(ph - 1) * 8) : 0;
  base.call(this, P, c, dt, o); P.headRY *= 0.3; P.neckRX += 0.06 * hit; P.headRZ += 0.06 * S(bt * PI); P.hipsRZ += 0.03 * S(bt * PI); P.smile = 1.4; P.blink = Math.max(P.blink, 0.4);
  handL(P, 0.3, 1.02 - 0.05 * hit, 0.24, [0.2, 1, 0.3], 0.8); micLow(P, this, o);
};
// ----- v_bob (pigeon: the head goes forward and back on the beat, the body still)
CL.v_bob = function (P, c, dt, o) {
  const t = c.t, bt = t * (o.bpm || 104) / 60, k = (bt % 1) < 0.25 ? sm((bt % 1) / 0.25) : 1 - sm(((bt % 1) - 0.25) / 0.5);
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.neckRX += 0.32 * k; P.headRX -= 0.3 * k; P.brow += 0.2; P.eyeH *= 1.1; P.smile = 1.2; micLow(P, this, o);
};
// ----- v_count (a count in: the free hand at the face pumps once per beat)
CL.v_count = function (P, c, dt, o) {
  const t = c.t, bt = t * (o.bpm || 100) / 60, n = o.n || 4, on = bt < n ? 1 : 1 - sm((bt - n) / 0.5), k = bt < n ? Math.exp(-(bt % 1) * 6) : 0, lt = lift(o);
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.neckRX += 0.05 * k; P.brow += 0.3; P.mouthOpen = 0.1 + 0.4 * k;
  handL(P, lerp(REST_L[0], 0.2, on), lerp(REST_L[1], 1.15, on) + 0.05 * k + lt, lerp(REST_L[2], 0.32, on), [0.1, 1, 0.3], on);
  if (mic(this)) micLow(P, this, o); else handR(P, -0.2, 0.62 + lt, 0.12, null);
};
// ----- v_thumb
CL.v_thumb = function (P, c, dt, o) {
  const t = c.t, a = sm(t / 0.25), pop = Math.max(0, S((t - 0.25) * 10)) * Math.exp(-(t - 0.25) * 4), lt = lift(o);
  base.call(this, P, c, dt, o); P.headRY *= 0.3; P.smile = 1.6; P.brow = 0.35; P.headRZ -= 0.08 * a;
  if (mic(this)) { micLow(P, this, o); handL(P, 0.2, 0.98 + 0.04 * pop + lt, 0.4, [0, 1, 0.2], a); } else { handR(P, -0.2, 0.98 + 0.04 * pop + lt, 0.4, [0, 1, 0.2], a); P.aWL = 0; }
};
// ----- v_offer (a hand out to shake or bump)
CL.v_offer = function (P, c, dt, o) {
  const t = c.t, a = sm(t / 0.35) * (o.back ? 1 - sm((t - o.back) / 0.3) : 1), z = o.to === undefined ? 0.48 : o.to, lt = lift(o);
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.chestRX += 0.05 * a; P.hipsRX += 0.03 * a; P.smile = 1.3; P.brow = 0.15;
  const d = o.fist ? [0, 0, 1] : [0, -0.2, 1];
  if (mic(this)) { micLow(P, this, o); handL(P, lerp(REST_L[0], 0.08, a), lerp(REST_L[1], 0.92 + lt, a), lerp(REST_L[2], z, a), d, a); } else { handR(P, lerp(-0.17, -0.08, a), lerp(0.8, 0.92 + lt, a), lerp(0.24, z, a), d, a); }
};
// ----- v_micup (the breath before: the mic at the lips, a held breath; opts.tremor shakes the hand)
CL.v_micup = function (P, c, dt, o) {
  const t = c.t, br = sm(t / 0.6) * (1 - sm((t - 1.2) / 0.5)), tr = o.tremor ? 0.006 * S(t * 13) : 0;
  base.call(this, P, c, dt, o); P.headRY *= 0.15; P.neckRY *= 0.2;
  P.chestRX -= 0.06 * br; P.shrug += 0.9 * br; P.neckRX -= 0.04 * br; P.blink = Math.max(P.blink, o.eyes === false ? 0 : 0.85 * br); P.mouthOpen = 0.05 + 0.08 * br; P.brow = 0.1;
  micLips(P, this, 0); P.aXR += tr; P.aYR += tr * 0.6;
  P.aWL = 1; P.aXL = 0.24; P.aYL = 0.78; P.aZL = 0.18; P.pXL = 0.7; P.pYL = -1; P.pZL = -0.3; P.hWL = 0;
};
// ----- v_pat
CL.v_pat = function (P, c, dt, o) {
  const t = c.t, n = o.n || 2, y = o.y || 0.95, z = o.z || 0.42, a = sm(t / 0.2) * (1 - sm((t - 0.25 - n * 0.3) / 0.25)), k = Math.max(0, S(t / 0.3 * PI * 2)) * (t < 0.25 + n * 0.3 ? 1 : 0);
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.neckRX += 0.1 * a; P.smile = 1.3;
  handL(P, lerp(REST_L[0], o.x === undefined ? 0.12 : o.x, a), lerp(REST_L[1], y + 0.04 * k, a), lerp(REST_L[2], z, a), [0, -0.6, 1], 0.7 * a); micLow(P, this, o);
};
// ----- v_lean (seated at a counter, forearm on the top)
CL.v_lean = function (P, c, dt, o) {
  const seat = o.sit === undefined ? 0.68 : o.sit, y = o.y || 1.07;
  CL.sit.call(this, P, c, dt, { seat, slump: 0.6 }); P.aWL = P.aWR = 0;
  P.spineRX += 0.1; P.chestRX += 0.06; P.neckRX -= 0.04; P.headRY *= 0.4;
  handL(P, 0.16, y + 0.02, 0.42, [-0.5, -0.2, 0.8], 0.6);
  if (mic(this)) { micAim.call(this, P, [-0.22, seat + 0.36, 0.33], [-0.2, 0.9, 0.35], [0.3, -0.3, 1], true); P.pXR = -0.8; P.pYR = -0.6; P.pZR = -0.4; } else handR(P, -0.16, y + 0.02, 0.42, [0.5, -0.2, 0.8], 0.6);
  if (o.talk) { const syl = Math.abs(S(c.t * 8.3)) * (S(c.t * 1.3) > -0.3 ? 1 : 0.1); P.mouthOpen = 0.08 + 0.7 * syl; P.brow = 0.2; }
};
// ----- v_hang (lift a hanger to the rail, again and again)
CL.v_hang = function (P, c, dt, o) {
  const t = c.t, ev = o.every || 0.3, u = (t % ev) / ev, up = u < 0.5 ? sm(u / 0.5) : 1 - sm((u - 0.5) / 0.5), y = o.y || 1.42;
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.neckRX -= 0.16; P.headRX -= 0.1; P.eyeY += 0.5; P.chestRX -= 0.04 * up;
  handL(P, 0.16 + 0.04 * Math.floor(t / ev) % 3 * 0.5, lerp(1.05, y, up), 0.36, [0, 1, 0.2], 0.8); micLow(P, this, o); P.brow = 0.25;
};
// ----- v_carry (the free hand under a box at the hip)
CL.v_carry = function (P, c, dt, o) {
  const t = c.t, br = S(t * 2);
  base.call(this, P, c, dt, o); P.headRY *= 0.3; P.chestRZ -= 0.08; P.hipsRZ += 0.05; P.hipsX -= 0.02; P.spineRZ -= 0.04; P.shrug += 0.4 + 0.1 * br;
  handL(P, 0.3, o.y || 0.7, 0.18, [-0.6, -0.2, 0.7], 0.8); micLow(P, this, o); P.frown += 0.2; P.mouthOpen = 0.12;
};
// ----- v_hug (short, two arms around the partner; the mic stays in the right fist behind their back)
CL.v_hug = function (P, c, dt, o) {
  const t = c.t, a = sm(t / 0.35) * (1 - sm((t - (o.hold || 0.9)) / 0.35)), z = o.to || 0.34;
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.chestRX += 0.08 * a; P.headRZ += 0.12 * a; P.blink = Math.max(P.blink, 0.8 * a); P.smile = 1.6;
  handL(P, lerp(REST_L[0], 0.2, a), lerp(REST_L[1], 1.0, a), lerp(REST_L[2], z + 0.1, a), [-1, 0, 0.3], a); handR(P, lerp(-0.17, -0.2, a), lerp(0.8, 0.98, a), lerp(0.24, z + 0.1, a), [1, 0, 0.3], a);
};

// ----- v_present (both hands hold something out at the chest: the showcase envelope handed over with respect; NPC). opts.to = how far out
CL.v_present = function (P, c, dt, o) {
  const t = c.t, a = sm(t / 0.4), z = o.to || 0.42, lt = lift(o);
  base.call(this, P, c, dt, o); P.headRY *= 0.2; P.hipsRX += 0.08 * a; P.chestRX += 0.08 * a; P.neckRX += 0.12 * a; P.smile = 1.3; P.brow = 0.1;
  handL(P, 0.07, lerp(0.8, 0.98, a) + lt, lerp(0.24, z, a), [-0.3, 0, 1], a);
  if (mic(this)) micLow(P, this, o); else handR(P, -0.07, lerp(0.8, 0.98, a) + lt, lerp(0.24, z, a), [0.3, 0, 1], a);
};
export const TOWN_CLIPS = ['v_present', 'v_spin', 'v_hattip', 'v_shades', 'v_no', 'v_bow', 'v_clap', 'v_polish', 'v_slide', 'v_scrub', 'v_liproll', 'v_snap', 'v_bob', 'v_count', 'v_thumb', 'v_offer', 'v_micup', 'v_pat', 'v_lean', 'v_hang', 'v_carry', 'v_hug'];
void stance; void relaxArms;
