// Whiskerton Walk, the cat's air and transition animation (W5). Pure and deterministic: no DOM, no Math.random.
// Everything is a critically or lightly damped spring chasing a target, so every output is continuous even when the
// sim flips pose in a single frame. sx, sy are MULTIPLIERS on top of the gait/idle pose (1 is neutral), always 0.6 to 1.3.
//
//   airState(seed) -> a
//   stepAir(a, dt, inp) -> { sx, sy, bob, tilt, dust: [spawn requests], squashT, flip, phase }
//     inp: { pose, poseT, vy, impact, grounded, turned, startedRun, stopped,   (contract)
//            face (1|-1, default 1), lift (riding a lift pad), interact (pounce), reduced (no motion) }
//     turned, startedRun, stopped, interact are edge detected here (a held true fires once).
//     vy is px/s with y down (jump is negative). impact is the landing vy (px/s), as in the sim's land event.
//     squashT 0..1 progress of the landing settle (1 = settled, ~0.4 s), flip 0..1 progress of the turn (swap the
//     facing at 0.5), phase is one of 'ground','crouch','rise','hang','fall','land','lift','pounce'.
//   dust spawn request {x, y, vx, vy, life, size}: x, y in px relative to the feet (y up is negative), life seconds.
//   stepDust(list, dt) integrates a pooled list in place (gravity-free puffs that drift, slow and grow, then die), cap 24.
//   pushDust(list, reqs) appends requests keeping the list at the cap (oldest dropped).
export const DUST_CAP = 24;
export const AIR = {
  crouchT: 0.06,      // jump anticipation
  landMin: 260,       // impact that raises dust
  landFull: 1100,     // impact at which the squash is deepest
  settleT: 0.4,       // landing is invisible after this
  turnT: 0.14, pounceT: 0.24,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const H = 1 / 120;                         // fixed internal substep, stable for any dt up to 0.1

function seedOf(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed == null ? '' : seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h || 0x9e3779b9;
}
function rnd(a) {                          // xorshift32 -> 0..1
  let x = a.rng; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; a.rng = x || 1;
  return (a.rng >>> 8) / 16777216;
}

const sp = () => ({ x: 0, v: 0 });
function chase(s, target, w, z, h) {       // semi-implicit damped spring toward target
  s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h;
  s.x += s.v * h;
}
function kick(w, z, peak) {                // initial velocity that makes a spring from rest peak at `peak`
  const r = Math.sqrt(1 - z * z);
  return peak * w / Math.exp(-(z / r) * Math.atan(r / z));
}
const LAND_W = 18, LAND_Z = 0.55, TURN_W = 30, TURN_Z = 0.6;

export function airState(seed) {
  return {
    rng: seedOf(seed),
    sy: { x: 1, v: 0 }, sx: { x: 1, v: 0 }, tilt: sp(), bob: sp(),   // followers of the pose target
    land: sp(), turn: sp(),                       // impact and turn springs (deviation from rest)
    landAge: 9, turnAge: 9, pounceAge: 9, liftT: 0,
    prevGrounded: true, prevTurned: false, prevRun: false, prevStop: false, prevInteract: false,
    acc: 0, lastPose: 'idle',
  };
}

// squash depth for a landing: monotonic non decreasing in impact
export function landDepth(impact) { return 0.03 + 0.25 * clamp(fin(impact) / AIR.landFull, 0, 1); }

function puff(a, out, x, y, vx, vy, life, size) {
  out.push({ x, y, vx, vy, life, size });
}

export function stepAir(a, dt, inp) {
  inp = inp || {};
  dt = clamp(fin(dt), 0, 0.1);
  const out = [];
  const pose = inp.pose || 'idle', poseT = Math.max(0, fin(inp.poseT)), vy = fin(inp.vy);
  const face = inp.face < 0 ? -1 : 1;
  const grounded = inp.grounded !== false && pose !== 'jump' && pose !== 'fall' && !inp.lift;
  const impact = Math.max(0, fin(inp.impact));
  const reduced = !!inp.reduced;

  // ---- edge events
  const landed = !a.prevGrounded && grounded;
  const turnEdge = !!inp.turned && !a.prevTurned;
  const runEdge = !!inp.startedRun && !a.prevRun;
  const stopEdge = !!inp.stopped && !a.prevStop;
  const popEdge = !!inp.interact && !a.prevInteract;
  a.prevGrounded = grounded; a.prevTurned = !!inp.turned; a.prevRun = !!inp.startedRun; a.prevStop = !!inp.stopped; a.prevInteract = !!inp.interact;

  if (!reduced) {
    if (landed && a.landAge > 0.1) {
      a.land.v += kick(LAND_W, LAND_Z, -landDepth(impact)); a.landAge = 0;
    }
    if (turnEdge && a.turnAge > 0.06) { a.turn.v += kick(TURN_W, TURN_Z, -0.18); a.turnAge = 0; }
    if (popEdge && a.pounceAge > AIR.pounceT) a.pounceAge = 0;
  }
  if (landed && impact >= AIR.landMin && !reduced) {      // landing dust to both sides, more when harder
    const n = 2 + Math.round(clamp((impact - AIR.landMin) / (AIR.landFull - AIR.landMin), 0, 1) * 3);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      puff(a, out, side * (6 + rnd(a) * 5), -1, side * (25 + rnd(a) * 45), -(6 + rnd(a) * 14), 0.3 + rnd(a) * 0.15, 3 + rnd(a) * 2);
    }
  }
  if (runEdge && !reduced) {
    for (let i = 0; i < 3; i++) puff(a, out, -face * (5 + rnd(a) * 6), -1, -face * (25 + rnd(a) * 40), -(5 + rnd(a) * 12), 0.3 + rnd(a) * 0.15, 3 + rnd(a) * 2);
  }
  if (stopEdge && !reduced) {
    for (let i = 0; i < 4; i++) puff(a, out, face * (4 + rnd(a) * 8), -1, face * (35 + rnd(a) * 55), -(4 + rnd(a) * 12), 0.28 + rnd(a) * 0.15, 3 + rnd(a) * 2);
  }

  // ---- targets
  const riding = !!inp.lift;
  let phase = 'ground', tsy = 1, ttilt = 0, tbob = 0;
  if (riding) {
    phase = 'lift'; tsy = 1.05; ttilt = 0; a.liftT += dt;
    tbob = 1.5 * Math.sin(a.liftT * 7.5) * smooth(a.liftT / 0.2);
  } else {
    a.liftT = 0;
    if (pose === 'jump' || (!grounded && vy < 0 && pose !== 'fall')) {
      const up = clamp(-vy / 450, 0, 1);
      const cw = 1 - smooth(poseT / AIR.crouchT);        // anticipation weight
      if (poseT < AIR.crouchT) phase = 'crouch'; else phase = up < 0.12 ? 'hang' : 'rise';
      tsy = 1 + 0.16 * up * smooth((poseT - AIR.crouchT * 0.5) / AIR.crouchT) - 0.14 * cw;
      ttilt = 0.07 * up;
    } else if (pose === 'fall' || (!grounded && vy >= 0 && !riding && pose !== 'land')) {
      const dn = clamp(vy / 600, 0, 1);
      phase = dn < 0.12 ? 'hang' : 'fall';
      tsy = 1 + 0.12 * dn;
      ttilt = -0.05 * dn;
    } else if (pose === 'land') phase = 'land';
  }
  if (a.pounceAge <= AIR.pounceT) phase = riding ? phase : 'pounce';
  if (reduced) { tsy = 1 + (tsy - 1) * 0.3; ttilt = 0; tbob = 0; }
  const tsx = 1 - 0.6 * (tsy - 1);

  // ---- integrate on fixed substeps
  a.acc += dt;
  let guard = 0;
  while (a.acc >= H && guard++ < 16) {
    a.acc -= H;
    chase(a.sy, tsy, 38, 1, H); chase(a.sx, tsx, 38, 1, H);
    chase(a.tilt, ttilt, 26, 1, H); chase(a.bob, tbob, 26, 1, H);
    chase(a.land, 0, LAND_W, LAND_Z, H);
    chase(a.turn, 0, TURN_W, TURN_Z, H);
    a.landAge += H; a.turnAge += H; if (a.pounceAge <= AIR.pounceT) a.pounceAge += H;
  }

  // ---- pounce profile (zero at both ends): dip, then a springy stretch
  let pz = 0;
  if (!reduced && a.pounceAge < AIR.pounceT) {
    const u = a.pounceAge / AIR.pounceT;
    pz = u < 0.3 ? -0.1 * Math.sin(Math.PI * u / 0.3) : 0.14 * Math.sin(Math.PI * (u - 0.3) / 0.7);
  }

  const dev = a.land.x + pz;
  const sy = clamp(a.sy.x + dev, 0.6, 1.3);
  const sx = clamp(a.sx.x - 0.75 * dev + a.turn.x, 0.6, 1.3);
  const settle = clamp(a.landAge / AIR.settleT, 0, 1);
  const flip = clamp(a.turnAge / AIR.turnT, 0, 1);
  // after the settle time the springs are below visible size: snap them to rest so the output is exactly neutral
  if (a.landAge > AIR.settleT * 1.5 && Math.abs(a.land.x) < 1e-3 && Math.abs(a.land.v) < 1e-2) { a.land.x = 0; a.land.v = 0; }
  if (a.turnAge > AIR.settleT * 1.5 && Math.abs(a.turn.x) < 1e-3 && Math.abs(a.turn.v) < 1e-2) { a.turn.x = 0; a.turn.v = 0; }
  a.lastPose = pose;
  return {
    sx, sy,
    bob: clamp(a.bob.x, -6, 6),
    tilt: clamp(a.tilt.x, -0.2, 0.2),
    dust: out, squashT: settle, flip, phase,
  };
}

// ---------------------------------------------------------------- dust
export function pushDust(list, reqs) {
  for (const r of reqs || []) {
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    list.push({ x: r.x, y: r.y, vx: fin(r.vx), vy: fin(r.vy), life: Math.max(0.01, fin(r.life, 0.3)), life0: Math.max(0.01, fin(r.life, 0.3)), size: Math.max(0.5, fin(r.size, 3)), size0: Math.max(0.5, fin(r.size, 3)) });
  }
  while (list.length > DUST_CAP) list.shift();
  return list;
}

// integrate in place; also accepts raw requests (fills life0/size0 on first sight). Returns the list.
export function stepDust(list, dt) {
  dt = clamp(fin(dt), 0, 0.1);
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.life0 == null) { p.life0 = p.life; p.size0 = p.size; }
    p.life -= dt;
    if (!(p.life > 0)) continue;
    const drag = Math.exp(-5 * dt);
    p.vx *= drag; p.vy = p.vy * drag - 8 * dt;           // a faint upward drift
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.size = p.size0 * (1 + 0.8 * (1 - p.life / p.life0));
    list[w++] = p;
  }
  list.length = w;
  while (list.length > DUST_CAP) list.shift();
  return list;
}
