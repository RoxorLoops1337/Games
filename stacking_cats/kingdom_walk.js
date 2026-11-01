// Whiskerton Walk: the walking simulation. Pure (no DOM, no Math.random, no clock), fixed 1/60 step, deterministic.
// Contract (see the build plan): createWalk(layout, {avatarId, spawn, reduced}) and stepWalk(state, input, dt).
//   input = { dir: -1..1, jump: bool (edge), interact: bool (edge), moveTo: number|null, jumpHeld?: bool }
//   jumpHeld is optional: when it is exactly false while rising, the jump is cut short (variable jump height).
// The state doubles as the render snapshot: it also carries npcs [{id, x, face, pose}], avatarId, bumps {id: t},
// and the previous step (px, py, pcam) so the renderer can interpolate. The walk never pays coins, gems or run power.
export const STEP = 1 / 60;
export const WALK = {
  speed: 220, accel: 1800, decel: 2400, airAccel: 1400,
  gravity: 1900, jumpV: 600, fallCap: 900, cutJump: 0.35,     // apex about 90 px with the fixed step
  coyote: 0.1, buffer: 0.12, margin: 24, supportTol: 0.5, xTol: 4,
  arrive: 1.5, liftTime: 1.2, landTime: 0.18, landMin: 260, sitAfter: 3, sleepAfter: 12, stepEvery: 0.3,
  view: 960, lookAhead: 80, deadzone: 60, camLerp: 0.12, camYLerp: 0.06, camYMin: -120,
};
export const APEX = (WALK.jumpV * WALK.jumpV) / (2 * WALK.gravity) - (WALK.jumpV * STEP) / 2;   // discrete: about 90 px

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (n) => { n = (n + 0x6D2B79F5) | 0; let t = Math.imul(n ^ (n >>> 15), 1 | n); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return { v: ((t ^ (t >>> 14)) >>> 0) / 4294967296, s: n }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => u * u * (3 - 2 * u);

const ZONE_PENALTY = { npc: 30, bench: 40, statue: 5 };

// the zone the player stands in (nearest centre, NPCs and benches lose ties), or null
export function nearestZone(layout, x, y, onGround = true) {
  if (!onGround) return null;
  let best = null, bs = Infinity;
  for (const z of layout.zones) {
    const dx = Math.abs(x - z.x);
    if (dx > z.w / 2) continue;
    if (y > z.y + 14 || y < z.y - (z.h || 90)) continue;
    const s = dx + (ZONE_PENALTY[z.type] || 0);
    if (s < bs) { bs = s; best = z; }
  }
  return best;
}
export const zoneById = (layout, type, id) => layout.zones.find((z) => z.type === type && z.id === id) || null;

export function createWalk(layout, opts = {}) {
  const sp = typeof opts.spawn === 'number' ? { x: opts.spawn, y: layout.groundY } : (opts.spawn || layout.spawn);
  const x = clamp(sp.x, WALK.margin, layout.width - WALK.margin), y = sp.y != null ? sp.y : layout.groundY;
  const st = {
    layout, avatarId: opts.avatarId || 'tabby', reduced: !!opts.reduced,
    x, y, vx: 0, vy: 0, face: 1, onGround: true, pose: 'idle', poseT: 0,
    px: x, py: y, cam: { x: 0, y: 0 }, pcam: { x: 0, y: 0 },
    near: null, events: [], t: 0, acc: 0,
    coyote: 0, buffer: 0, landT: 0, idleT: 0, stepT: 0, jumpPend: false, interactPend: false, jumpHeld: true,
    target: null, lift: null, sitting: false, bumps: {},
    npcs: layout.npcs.map((n) => ({ id: n.id, kind: n.kind, home: n.x, x: n.x, tx: n.x, range: n.range || 0, face: 1, pose: 'idle', wait: 0.5 + (hash(n.id) % 300) / 100, rs: hash(n.id) | 0 })),
  };
  st.onGround = true;
  // start standing on whatever is under the spawn (a spawn above a platform simply falls onto it)
  st.cam.x = camTarget(st);
  st.cam.y = camYTarget(st);
  st.pcam = { ...st.cam };
  st.near = nearestZone(layout, st.x, st.y, true);
  return st;
}

function push(st, e) { st.events.push(e); if (st.events.length > 64) st.events.shift(); }

// highest surface top at x that a foot at y can stand on or land on; ground is solid everywhere
function surfaceTops(layout, x) {
  const tops = [layout.groundY];
  for (const p of layout.platforms) if (x >= p.x - WALK.xTol && x <= p.x + p.w + WALK.xTol) tops.push(p.y);
  return tops;
}
function supported(layout, x, y) {
  for (const t of surfaceTops(layout, x)) if (Math.abs(t - y) <= WALK.supportTol) return t;
  return null;
}

function camTarget(st) {
  const w = st.layout.width, view = WALK.view;
  const look = st.reduced ? 0 : WALK.lookAhead * st.face;
  const want = st.x + look - view / 2;
  return clamp(want, 0, w - view);
}
function camYTarget(st) {
  return clamp((st.y - (st.layout.groundY - 140)) * 0.7, WALK.camYMin, 0);
}
function stepCamera(st) {
  const w = st.layout.width, view = WALK.view;
  if (st.reduced) { st.cam.x = camTarget(st); st.cam.y = camYTarget(st); return; }
  const want = clamp(st.x + WALK.lookAhead * st.face - view / 2, 0, w - view);
  const d = want - st.cam.x;
  if (Math.abs(d) > WALK.deadzone) st.cam.x += (d - Math.sign(d) * WALK.deadzone) * WALK.camLerp;
  st.cam.x = clamp(st.cam.x, 0, w - view);
  st.cam.y += (camYTarget(st) - st.cam.y) * WALK.camYLerp;
}

function stepNpcs(st) {
  for (const n of st.npcs) {
    if (n.range <= 0) { n.pose = 'idle'; continue; }
    if (Math.abs(n.tx - n.x) > 1) {
      const s = Math.sign(n.tx - n.x);
      n.x += s * 40 * STEP; n.face = s; n.pose = 'run';
      if (Math.abs(n.tx - n.x) <= 40 * STEP) n.x = n.tx;
    } else {
      n.pose = n.wait > 2.2 ? 'sit' : 'idle';
      n.wait -= STEP;
      if (n.wait <= 0) {
        const r = rng(n.rs); n.rs = r.s;
        const r2 = rng(n.rs); n.rs = r2.s;
        n.tx = n.home + (r.v * 2 - 1) * n.range;
        n.wait = 1.5 + r2.v * 3;
      }
    }
  }
}

function startLift(st, z) {
  st.lift = { t: 0, x0: st.x, y0: st.y, x1: z.x, y1: z.toY, id: z.id };
  st.vx = 0; st.vy = 0; st.target = null; st.sitting = false;
  push(st, { k: 'lift', id: z.id, up: true });
}

function sub(st, input) {
  const L = st.layout;
  st.px = st.x; st.py = st.y; st.pcam.x = st.cam.x; st.pcam.y = st.cam.y;

  // ---- lift ride (input ignored)
  if (st.lift) {
    const lf = st.lift;
    lf.t += STEP;
    const u = smooth(clamp(lf.t / WALK.liftTime, 0, 1));
    st.x = lf.x0 + (lf.x1 - lf.x0) * u; st.y = lf.y0 + (lf.y1 - lf.y0) * u;
    st.jumpPend = false; st.interactPend = false;
    if (lf.t >= WALK.liftTime) {
      st.x = lf.x1; st.y = lf.y1; st.lift = null; st.onGround = true; st.vy = 0;
      push(st, { k: 'land', impact: 0, lift: true });
    }
    st.pose = 'jump'; st.poseT += STEP; st.t += STEP;
    st.near = null;
    stepCamera(st); stepNpcs(st);
    return;
  }

  // ---- horizontal intent
  let dir = clamp(+input.dir || 0, -1, 1);
  if (Math.abs(dir) < 0.05) dir = 0;
  let direct = null;                       // tap to walk: set vx directly so we land exactly on the target
  if (dir !== 0) { st.target = null; st.sitting = false; }
  else if (st.target != null) {
    const dx = st.target - st.x;
    if (Math.abs(dx) <= WALK.speed * STEP * WALK.arrive) { st.x = st.target; st.vx = 0; st.target = null; }
    else { direct = Math.sign(dx) * Math.min(WALK.speed, Math.max(70, Math.abs(dx) * 8)); st.sitting = false; }
  }
  if (direct != null) st.vx = direct;
  else {
    const want = dir * WALK.speed;
    const a = (Math.abs(want) < Math.abs(st.vx) || Math.sign(want) !== Math.sign(st.vx)) && st.onGround ? WALK.decel : (st.onGround ? WALK.accel : WALK.airAccel);
    const dv = want - st.vx, m = a * STEP;
    st.vx = Math.abs(dv) <= m ? want : st.vx + Math.sign(dv) * m;
  }
  st.x += st.vx * STEP;
  const lo = WALK.margin, hi = L.width - WALK.margin;
  if (st.x < lo) { st.x = lo; st.vx = 0; st.target = null; } else if (st.x > hi) { st.x = hi; st.vx = 0; st.target = null; }
  if (Math.abs(st.vx) > 5) st.face = st.vx > 0 ? 1 : -1;

  // ---- walked off an edge
  if (st.onGround && supported(L, st.x, st.y) == null) { st.onGround = false; st.coyote = WALK.coyote; }

  // ---- jump with coyote time and a buffered press
  if (st.jumpPend) { st.buffer = WALK.buffer; st.jumpPend = false; }
  if (st.buffer > 0) st.buffer -= STEP;
  if (!st.onGround && st.coyote > 0) st.coyote -= STEP;
  if (st.buffer > 0 && (st.onGround || st.coyote > 0)) {
    st.vy = -WALK.jumpV; st.onGround = false; st.coyote = 0; st.buffer = 0; st.sitting = false;
    push(st, { k: 'jump', x: st.x, y: st.y });
  }
  if (!st.onGround && st.vy < 0 && !st.jumpHeld) st.vy = Math.max(st.vy, -WALK.jumpV * WALK.cutJump);

  // ---- vertical, with one way platforms (land only when falling and the foot started at or above the top)
  let impact = 0;
  if (!st.onGround) {
    st.vy = Math.min(WALK.fallCap, st.vy + WALK.gravity * STEP);
    const ny = st.y + st.vy * STEP;
    if (st.vy >= 0) {
      let hit = null;
      for (const t of surfaceTops(L, st.x)) if (st.y <= t + 0.001 && ny >= t && (hit == null || t < hit)) hit = t;
      if (hit != null) { impact = st.vy; st.y = hit; st.vy = 0; st.onGround = true; push(st, { k: 'land', impact, x: st.x, y: st.y }); if (impact >= WALK.landMin) st.landT = WALK.landTime; }
      else st.y = ny;
    } else st.y = ny;
  }
  if (st.landT > 0) st.landT -= STEP;

  // ---- footsteps
  if (st.onGround && Math.abs(st.vx) > WALK.speed * 0.4) {
    st.stepT += STEP;
    if (st.stepT >= WALK.stepEvery) { st.stepT = 0; push(st, { k: 'step', x: st.x, y: st.y }); }
  } else st.stepT = 0;

  // ---- idle timers and pose
  const still = st.onGround && Math.abs(st.vx) < 1 && dir === 0 && st.target == null;
  st.idleT = still ? st.idleT + STEP : 0;
  let pose;
  if (!st.onGround) pose = st.vy < 0 ? 'jump' : 'fall';
  else if (st.landT > 0) pose = 'land';
  else if (Math.abs(st.vx) > 20) pose = 'run';
  else if (st.idleT > WALK.sleepAfter) pose = 'sleep';
  else if (st.sitting || st.idleT > WALK.sitAfter) pose = 'sit';
  else pose = 'idle';
  if (pose !== st.pose) { st.pose = pose; st.poseT = 0; } else st.poseT += STEP;

  // ---- zone under the feet
  const nz = nearestZone(L, st.x, st.y, st.onGround);
  const prev = st.near;
  st.near = nz ? { type: nz.type, id: nz.id } : null;
  if (st.near && (!prev || prev.type !== st.near.type || prev.id !== st.near.id)) push(st, { k: 'enter', type: st.near.type, id: st.near.id });

  // ---- interact
  if (st.interactPend) {
    st.interactPend = false;
    if (nz && st.onGround) {
      if (nz.type === 'lift') startLift(st, nz);
      else {
        if (nz.type === 'bench') { st.sitting = true; st.vx = 0; st.target = null; }
        if (nz.type === 'building') st.bumps[nz.id] = st.t;
        push(st, { k: 'interact', zone: { type: nz.type, id: nz.id, x: nz.x, y: nz.y } });
      }
    }
  }
  st.t += STEP;
  stepCamera(st);
  stepNpcs(st);
}

export function stepWalk(st, input, dt) {
  input = input || {};
  if (input.jump) st.jumpPend = true;
  if (input.interact) st.interactPend = true;
  st.jumpHeld = input.jumpHeld !== false;
  if (typeof input.moveTo === 'number' && Number.isFinite(input.moveTo)) st.target = clamp(input.moveTo, WALK.margin, st.layout.width - WALK.margin);
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  st.acc += Math.min(dt, 0.1);
  let n = 0;
  while (st.acc >= STEP - 1e-9 && n < 6) { sub(st, input); st.acc -= STEP; n++; }
  if (st.acc < 0) st.acc = 0;
  if (n >= 6) st.acc = 0;
}

// the camera top left in world px for the renderer (x, y); y is 0 on the ground and goes negative on islands
export const cameraOf = (st) => ({ x: st.cam.x, y: st.cam.y });

// ride the lift back down is just walking off the island; this places the avatar anywhere (fast travel, spawns)
export function teleport(st, x, y) {
  st.x = st.px = clamp(x, WALK.margin, st.layout.width - WALK.margin);
  st.y = st.py = y != null ? y : st.layout.groundY;
  st.vx = st.vy = 0; st.onGround = true; st.target = null; st.lift = null; st.sitting = false;
  st.cam.x = st.pcam.x = camTarget(st); st.cam.y = st.pcam.y = camYTarget(st);
  st.near = nearestZone(st.layout, st.x, st.y, true);
}
