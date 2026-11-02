// Gait of the walking cat in Whiskerton Walk (W2 of the cat animation project). Pure and deterministic: no DOM, no clock, no random.
//
//   const g = gaitState();
//   const out = stepGait(g, dt, speed, grounded, dir);   // speed = ground speed in px/s (magnitude), dir = -1 or 1 (facing)
//   out = { kind: 'stop'|'walk'|'trot'|'run', phase (0..1, one full stride = two steps), blend (0 walk .. 1 run, smoothed),
//           bob (px up, 0..BOB_MAX), tilt (rad, positive leans toward dir), sx, sy (squash about the feet),
//           pawL, pawR (lift 0..1, 0 = planted), footfalls: [{ foot: 'L'|'R', x }], plus extras:
//           amp (0..1 how much the gait shows), steps (steps per second now), accel (smoothed px/s^2, signed),
//           lean (the start / skid part of tilt), skid (0..1), antic (0..1 start anticipation envelope) }
//
// The stride phase advances by DISTANCE: phase += distance / strideLen(speed), where strideLen = 2 * speed / cadence(speed) and cadence
// (steps per second) rises smoothly from about 2.0 at a stroll to 2.6 at a brisk walk and 4.5 at full run speed, hard capped at 5.
// Footfalls: phase 0 is the left paw landing, 0.5 the right paw. x is the paw's local offset in px, positive toward the facing side.
// Design source: the lead brief (scratchpad kw/anim.md). Reduced motion is the caller's job (it ignores bob/squash and swaps two frames).

export const GAIT = {
  maxSpeed: 220,          // WALK.speed of kingdom_walk.js
  stopBelow: 8,           // px/s under which the cat counts as standing
  walkTo: 120, trotTo: 175,   // kind thresholds (px/s), with a little hysteresis
  hyst: 8,
  // cadence knots [speed px/s, steps per second], smoothstep between them
  cadence: [[0, 1.2], [40, 2.0], [110, 2.6], [220, 4.5]],
  cadenceCap: 4.8,        // never above this (the contract cap is 5)
  bobWalk: 1.2, bobRun: 3.0, BOB_MAX: 3.2,
  squashWalk: 0.012, squashRun: 0.045,
  leanBase: 0.03, leanRun: 0.08,   // steady lean (rad) at walk / run
  leanStart: 0.10, leanSkid: 0.17, // peak lean in from acceleration, back from braking
  accelRef: 1800,         // px/s^2 that gives the full start lean (WALK.accel)
  decelRef: 2400,
  anticTime: 0.09, anticSquash: 0.04,
  tauSpeed: 0.07, tauAcc: 0.12, tauAmp: 0.09, tauBlend: 0.2, tauAir: 0.08,
  footX: 7,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const sstep = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const TAU = Math.PI * 2;
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

export function gaitState() {
  return { total: 0, sp: 0, acc: 0, amp: 0, blend: 0, kind: 'stop', air: 0, stopT: 1, anticT: 1, skid: 0, dir: 1 };
}

// steps per second for a ground speed
export function cadence(speed) {
  const k = GAIT.cadence, s = Math.max(0, fin(speed));
  let c = k[k.length - 1][1];
  if (s < k[k.length - 1][0]) {
    for (let i = 1; i < k.length; i++) if (s <= k[i][0]) { c = k[i - 1][1] + (k[i][1] - k[i - 1][1]) * sstep((s - k[i - 1][0]) / (k[i][0] - k[i - 1][0])); break; }
  }
  return Math.min(c, GAIT.cadenceCap);
}
// stride length (two steps) in px at a ground speed
export function strideLen(speed) { const s = Math.max(1, fin(speed)); return 2 * s / cadence(s); }

function pickKind(prev, s) {
  const G = GAIT, h = G.hyst;
  const up = (prev === 'stop' ? G.stopBelow : prev === 'walk' ? G.walkTo : prev === 'trot' ? G.trotTo : Infinity);
  const down = (prev === 'run' ? G.trotTo - h : prev === 'trot' ? G.walkTo - h : prev === 'walk' ? G.stopBelow - 3 : -Infinity);
  let k = prev;
  if (s >= up) k = prev === 'stop' ? 'walk' : prev === 'walk' ? 'trot' : 'run';
  else if (s < down) k = prev === 'run' ? 'trot' : prev === 'trot' ? 'walk' : 'stop';
  // allow multi step jumps in one frame
  if (k !== prev) return pickKind(k, s) === k ? k : pickKind(k, s);
  return k;
}

export function stepGait(g, dt, speed, grounded, dir) {
  const G = GAIT;
  dt = clamp(fin(dt), 0, 0.1);
  const s = Math.max(0, fin(speed));
  if (dir === 1 || dir === -1) g.dir = dir;
  const f = g.dir;
  const foot = [];
  if (dt > 0) {
    // smoothed speed and acceleration (acceleration is the derivative of the smoothed speed, itself smoothed)
    const prevSp = g.sp;
    g.sp += (s - g.sp) * ease(dt, G.tauSpeed);
    const rawAcc = clamp((g.sp - prevSp) / dt, -6000, 6000);
    g.acc += (rawAcc - g.acc) * ease(dt, G.tauAcc);
    // grounded factor
    g.air += ((grounded ? 0 : 1) - g.air) * ease(dt, G.tauAir);
    // phase by distance
    if (grounded) {
      const live = clamp(s / 6, 0, 1);   // no stepping on the spot
      const before = g.total;
      g.total += cadence(s) * 0.5 * dt * live;   // == distance / strideLen(s)
      const a = Math.floor(before * 2), b = Math.floor(g.total * 2);
      for (let i = a + 1; i <= b; i++) foot.push({ foot: i % 2 === 0 ? 'L' : 'R', x: (i % 2 === 0 ? -1 : 1) * G.footX * f });
    }
    // standing time and start anticipation
    const moving = s >= G.stopBelow;   // the air does not count as standing, so a landing at speed has no anticipation
    if (!moving) { g.stopT += dt; if (g.stopT > 0.12) g.anticT = 1; }
    else { if (g.stopT > 0.12 && g.anticT >= 1) g.anticT = 0; g.stopT = 0; }
    if (g.anticT < 1) g.anticT = Math.min(1, g.anticT + dt / G.anticTime);
    // amplitude of the gait (fades in with speed, out when stopping or airborne)
    const wantAmp = grounded ? sstep(s / 40) : 0;
    g.amp += (wantAmp - g.amp) * ease(dt, G.tauAmp);
    // gait blend 0 walk .. 1 run
    const wantBlend = sstep((s - 60) / (G.maxSpeed - 60));
    g.blend += (wantBlend - g.blend) * ease(dt, G.tauBlend);
    g.kind = pickKind(g.kind, g.sp);
    // skid: braking while still moving
    const wantSkid = grounded ? clamp((-g.acc / G.decelRef) * sstep((g.sp - 30) / 60), 0, 1) : 0;
    g.skid += (wantSkid - g.skid) * ease(dt, 0.05);
  }
  const phase = g.total - Math.floor(g.total);
  const amp = g.amp, b = g.blend;
  const ph2 = phase * 2 * TAU;           // two bobs per stride
  const stepWave = 0.5 - 0.5 * Math.cos(ph2);          // 0 at contact, 1 at mid step
  const contact = Math.pow(0.5 + 0.5 * Math.cos(ph2), 4);   // squash pulse on each footfall
  const bob = clamp(amp * (G.bobWalk + (G.bobRun - G.bobWalk) * b) * stepWave, 0, G.BOB_MAX);
  // paw lift: each paw swings through half the stride
  const lift = (p) => { const v = Math.sin(p * TAU); return v > 0 ? v * v : 0; };
  const peak = 0.7 + 0.3 * b;
  const pawL = clamp(lift(phase) * peak * amp, 0, 1);
  const pawR = clamp(lift(phase + 0.5) * peak * amp, 0, 1);
  // lean from acceleration: in on speeding up, back on braking
  const accIn = clamp(g.acc / G.accelRef, 0, 1), accOut = clamp(-g.acc / G.decelRef, 0, 1);
  const lean = G.leanStart * accIn - G.leanSkid * accOut;
  const steady = (G.leanBase + (G.leanRun - G.leanBase) * b) * sstep(g.sp / 40) * (1 - g.air);
  const antic = g.anticT < 1 ? Math.sin(Math.PI * g.anticT) : 0;
  const sway = 0.012 * Math.sin(phase * TAU) * amp;
  const tilt = clamp(steady + lean * (1 - g.air * 0.5) - 0.04 * antic + sway, -0.2, 0.2);
  const sqz = (G.squashWalk + (G.squashRun - G.squashWalk) * b) * amp * contact;
  const sy = clamp(1 - sqz - G.anticSquash * antic - 0.02 * g.skid, 0.9, 1.1);
  const sx = clamp(1 + sqz * 0.8 + G.anticSquash * 0.6 * antic + 0.03 * g.skid, 0.9, 1.1);
  const c = cadence(g.sp);
  return {
    kind: g.kind, phase, blend: b, bob, tilt, sx, sy, pawL, pawR, footfalls: foot,
    amp, steps: grounded && g.sp >= 6 ? c : 0, accel: g.acc, lean, skid: g.skid, antic,
  };
}
