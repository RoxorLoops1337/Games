// Stacking Cats: Whiskerton Walk tail physics. Pure, deterministic (no DOM, no Math.random), part of the cat animation rework.
//
// A damped spring chain of 4 segments with weight and follow-through. The tail never moves at footstep rate: it is only driven by
//   - a slow oscillator (idle sway 0.4 Hz, running stream undulation up to 0.9 Hz, both well under 1.5 Hz),
//   - the cat's acceleration (it lags, then overshoots a little and settles, damping ratio about 0.55),
//   - vertical velocity (jump whip with overshoot, fall flare), takeoff and landing impulses,
//   - a happy wag, only while mood 'happy' and excite > 0.6, at most 2.5 Hz, with an amplitude that decays.
//
// API
//   tailState(seed) -> t                      per cat state (seed: number or string, only sets the phase and a tiny stiffness jitter)
//   stepTail(t, dt, inp) -> { a, tip }        advance by dt (any value, clamped to 0.1; internally fixed 1/240 s substeps)
//     inp: { ax, vx, vy, face, grounded, mood, excite, reduced }
//       ax, vx, vy in world px/s^2 and px/s (vy positive = down, as in kingdom_walk.js), face = +1 / -1,
//       mood 'calm'|'happy'|'sit'|'sleep'|'alert'|'fall', excite 0..1, reduced = true kills sway, wag and undulation.
//     a   : 4 RELATIVE segment angles in radians, root first, in the cat's local frame (independent of facing).
//           0 = tail straight behind the cat; positive bends the segment UP (counter to gravity), negative bends it DOWN/forward
//           (curl around the feet). The absolute angle of segment i is the sum a[0..i]; W1 maps it onto the canvas rotation.
//     tip : sum of all segment angles (absolute lift of the tip), handy for a single rigid draw.
//   tailRest(mood) -> number[4]               the rest pose of a mood (copy)
//   TAIL                                      constants (segment count, cap, substep, wag cap)
//
// Tests live in tests/stacking_cats_tail.test.mjs.

export const TAIL = {
  segs: 4,
  sub: 1 / 240,        // fixed internal substep
  maxDt: 0.1,          // larger dt is clamped
  maxW: 12,            // rad/s cap per segment
  maxTipW: 18,         // rad/s cap on the sum of |segment velocities| (so the tip speed is bounded too)
  maxA: 1.3,           // rad limit per relative segment angle
  wagMaxHz: 2.5,
  wagMinExcite: 0.6,
  swayHz: 0.4,
  runHz: 0.9,          // top undulation frequency while running
  speedRef: 220,       // px/s, WALK.speed
  accelRef: 1800,      // px/s^2, WALK.accel
};

const K = 128;            // spring stiffness (natural frequency about 1.8 Hz)
const C = 12.4;           // damping (zeta about 0.55)
const GAIN = [0.5, 0.8, 1.0, 1.2];   // how much the tip side reacts more than the root
const SEG_AMP = [0.6, 1, 1, 1];
const G_AX = 25, G_VY = 30;

// rest poses (relative angles, root first)
const MOODS = {
  calm:  { rest: [0.28, 0.22, 0.18, 0.12], amp: 0.1, hz: TAIL.swayHz },
  happy: { rest: [0.5, 0.3, 0.2, 0.15], amp: 0.1, hz: 0.5 },
  alert: { rest: [0.7, 0.2, 0.05, -0.05], amp: 0.025, hz: 0.7 },
  sit:   { rest: [-0.1, -0.5, -0.65, -0.55], amp: 0.02, hz: 0.4 },
  sleep: { rest: [-0.3, -0.65, -0.75, -0.65], amp: 0.012, hz: 0.25 },
  fall:  { rest: [0.85, 0.35, 0.3, 0.25], amp: 0.03, hz: 0.8 },
};
const RUN_REST = [0.12, 0.08, 0.05, 0.03];   // streams behind, nearly flat

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (s) => { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

export const tailRest = (mood) => (MOODS[mood] || MOODS.calm).rest.slice();

export function tailState(seed = 0) {
  const r = hash(seed);
  const t = {
    a: MOODS.calm.rest.slice(), w: [0, 0, 0, 0],
    ph: r * Math.PI * 2, wp: hash('w' + seed) * Math.PI * 2,
    sm: 0,                      // smoothed |speed| 0..1.5
    wag: 0, wagOn: false,       // wag amplitude and whether it is currently being driven
    acc: 0, prevG: true, prevVy: 0,
    k: 1 + (r - 0.5) * 0.1,     // tiny per cat stiffness jitter
    out: { a: [0, 0, 0, 0], tip: 0 },
  };
  fill(t);
  return t;
}

function fill(t) {
  let tip = 0;
  for (let i = 0; i < 4; i++) { t.out.a[i] = t.a[i]; tip += t.a[i]; }
  t.out.tip = tip;
  return t.out;
}

export function stepTail(t, dt, inp = {}) {
  dt = clamp(+dt || 0, 0, TAIL.maxDt);
  const mood = MOODS[inp.mood] ? inp.mood : 'calm';
  const M = MOODS[mood];
  const face = inp.face < 0 ? -1 : 1;
  const grounded = inp.grounded !== false;
  const still = !!inp.reduced;
  const vx = +inp.vx || 0, vy = +inp.vy || 0;
  const fax = clamp(((+inp.ax || 0) * face) / TAIL.accelRef, -2, 2);   // forward acceleration, normalised
  const vyn = clamp(vy / 600, -1.5, 1.5);
  const sp = clamp(Math.abs(vx) / TAIL.speedRef, 0, 1.5);
  const excite = clamp(+inp.excite || 0, 0, 1);
  const moodRuns = mood === 'calm' || mood === 'happy' || mood === 'alert';

  // takeoff whip and landing bounce (impulses on the angular velocity, applied once)
  {
    if (t.prevG && !grounded && vy < -100) for (let i = 0; i < 4; i++) t.w[i] -= 5 * GAIN[i];
    else if (!t.prevG && grounded && t.prevVy > 150) { const k = Math.min(t.prevVy / 600, 1.5); for (let i = 0; i < 4; i++) t.w[i] -= 4 * k * GAIN[i]; }
  }
  t.prevG = grounded; t.prevVy = vy;

  t.acc += dt;
  const h = TAIL.sub;
  const kk = K * t.k;
  while (t.acc >= h) {
    t.acc -= h;
    // slow smoothing of speed, tau 0.15 s
    t.sm += (sp - t.sm) * (1 - Math.exp(-h / 0.15));
    const run = moodRuns && grounded ? clamp(t.sm * 1.6, 0, 1) : 0;
    const air = !grounded;

    // oscillator: one slow phase, frequency between mood rest and running stream (always < 1.5 Hz)
    const hz = Math.min(1.2, run > 0 ? M.hz + (TAIL.runHz - M.hz) * run : M.hz);
    t.ph += 2 * Math.PI * hz * h;
    const amp = still ? 0 : (run > 0 ? M.amp + (0.05 - M.amp) * run : M.amp);

    // wag: only happy, excited, calm on the ground; the amplitude decays while it wags
    const wagging = !still && mood === 'happy' && excite > TAIL.wagMinExcite && grounded && t.sm < 0.3;
    if (wagging) {
      if (!t.wagOn) { t.wagOn = true; t.wag = 0.25 + 0.35 * ((excite - TAIL.wagMinExcite) / (1 - TAIL.wagMinExcite)); }
      t.wag *= Math.exp(-h / 2.5);
      const wHz = Math.min(TAIL.wagMaxHz, 1.4 + 1.5 * excite);
      t.wp += 2 * Math.PI * wHz * h;
    } else {
      t.wagOn = false;
      t.wag *= Math.exp(-h / 0.25);
    }
    if (t.wag < 1e-4) t.wag = 0;

    let sumW = 0;
    for (let i = 0; i < 4; i++) {
      let rest = run > 0 ? M.rest[i] + (RUN_REST[i] - M.rest[i]) * run : M.rest[i];
      let target = rest + amp * SEG_AMP[i] * Math.sin(t.ph - i * 0.9);
      if (t.wag > 0) target += t.wag * SEG_AMP[i] * Math.sin(t.wp - i * 0.5);
      // follow-through: forward acceleration pushes the tail down/back, vertical speed whips it
      let torque = kk * (target - t.a[i]) - C * t.w[i] - G_AX * GAIN[i] * fax + (air || Math.abs(vyn) > 0.05 ? G_VY * GAIN[i] * vyn : 0);
      t.w[i] += torque * h;
      t.w[i] = clamp(t.w[i], -TAIL.maxW, TAIL.maxW);
      sumW += Math.abs(t.w[i]);
    }
    if (sumW > TAIL.maxTipW) { const s = TAIL.maxTipW / sumW; for (let i = 0; i < 4; i++) t.w[i] *= s; }
    for (let i = 0; i < 4; i++) {
      let a = t.a[i] + t.w[i] * h;
      if (a > TAIL.maxA) { a = TAIL.maxA; if (t.w[i] > 0) t.w[i] = 0; }
      else if (a < -TAIL.maxA) { a = -TAIL.maxA; if (t.w[i] < 0) t.w[i] = 0; }
      t.a[i] = a;
    }
  }
  return fill(t);
}
