// Galaxy Pusher: the coin machine as real rigid-body physics (Rapier, vendored in ./vendor/rapier.js).
//
// Units are centimetres, like a real cabinet: a coin is 2.4 cm across and 2.2 mm thick, gravity is 981 cm/s².
// Axes: x across the machine (0 is the middle), y up (the floor is y = 0), z toward the player (the drop edge is z = EDGE).
// The pusher is a kinematic block whose top is the shelf; the back wall above it scrapes shelf coins off as it
// pulls back. Coins that fall past the edge pay out, except over the two corner gutters. A coin tower is ONE heavy
// body (a tall cylinder) that the carpet shoves until it tips; once it leans far enough or goes over the edge it
// bursts into real coins (a few hundred at most; the rest merge into those, each worth more).
//
// The same Machine runs in the browser and in node (tests): create it with createMachine(seed).

export const W = 24, EDGE = 12, GUT = 2.5;
export const COIN_R = 1.2, COIN_HH = 0.14;          // radius, half thickness (a 2.8 mm arcade token)
export const TOKEN_R = 1.5, TOKEN_HH = 0.2;
export const KINDS = {
  c: { r: COIN_R, hh: COIN_HH, density: 8.9, v: 1 },
  g: { r: COIN_R, hh: COIN_HH, density: 8.9, v: 2 },
  B: { r: TOKEN_R, hh: TOKEN_HH, density: 2.2, v: 0 },
  P: { r: TOKEN_R, hh: TOKEN_HH, density: 2.2, v: 0 },
  Y: { r: TOKEN_R, hh: TOKEN_HH, density: 2.2, v: 0 },
};
export const isToken = (k) => k === 'B' || k === 'P' || k === 'Y';
// pusher: its front face sweeps between FACE_MIN and FACE_MAX; PH is the shelf height; BACK_WALL scrapes the shelf
export const FACE_MIN = -4.5, FACE_MAX = 0.5, PERIOD = 4.2, PH = 2.4, PUSH_HALF = 9, BACK_WALL = -10.8;   // one solid back wall; the shooters hang on it
// Coins shoot in from the two SIDE walls, low at shelf height near the back. Each shooter (the flipper) sits in its side
// wall and keeps turning between its two limits: a little toward the back wall (FLIP_BACK) and a little toward the
// front (FLIP_FRONT), always across the machine. Every coin leaves along its current direction.
export const SHOOTER = { L: { x: -W / 2 + 0.3, y: PH + 0.45, z: BACK_WALL + 2.6 }, R: { x: W / 2 - 0.3, y: PH + 0.45, z: BACK_WALL + 2.6 } };
export const SHOT_MIN = 30, SHOT_MAX = 62;   // cm/s a coin leaves the shooter with
export const FLIP_BACK = -0.3, FLIP_FRONT = 0.38, FLIP_PERIOD = 2.6;   // radians from straight across (+ toward the player)
// the shooter's angle at time t (the two sides turn in opposite phase)
export function flipperAngle(side, t) {
  const mid = (FLIP_BACK + FLIP_FRONT) / 2, amp = (FLIP_FRONT - FLIP_BACK) / 2;
  return mid + amp * Math.sin((t / FLIP_PERIOD) * Math.PI * 2 + (side === 'R' ? Math.PI : 0));
}
// towers: a hollow ring of coins, RING_N per layer, each layer twisted a little more
// RING_R is the smallest ring where neighbours touch edge to edge (no coin ever overlaps another); every other layer is
// turned half a coin, like brickwork, so each coin rests on two below, and the whole stack drifts round slowly.
export const RING_N = 8, RING_R = (COIN_R + 0.005) / Math.sin(Math.PI / RING_N), LAYER_H = COIN_HH * 2, TWIST = 0.05;
export const TOWER_R = RING_R + COIN_R;
// The pusher has a half-circle notch in the middle of its front (like the real cabinet). For a tower the pusher pulls
// back further than its normal stroke (to FACE_RET), the tower rises out of the floor inside the notch, and then the
// notch cradles it and shoves it forward. The back wall sits far enough back that a rising tower clears it.
// the token port: a wide, low slot in the middle of the back wall just above the pusher (under the energy-ring badge,
// like the cabinet); tokens slide out of it flat toward the player. The wall collider stays solid: tokens appear just
// in front of it.
export const PORT = { x: 0, y: PH + 3.9, z: BACK_WALL, w: 4.4, h: 2.0 };
export const SPIRAL_TURNS = 1.5;   // turns a tower makes while it rises out of the notch
export const NOTCH_R = TOWER_R + 0.35, FACE_RET = BACK_WALL + TOWER_R + 0.5;
export const towerLayers = (n) => Math.ceil(n / RING_N);
export const POP_UP = 30, POP_SIDE = 45;   // cm/s: the most a coin that is not flying can be kicked by the solver
export const FIELD_CAP = 230;    // most loose coins simulated at once
export const CRUMBLE_MAX = 320, CRUMBLE_LIVE = 440;   // a crumbling tower adds at most this many real coins (briefly)
// the front window: a glass pane just past the drop edge, like the cabinet glass the player looks through
export const GLASS_Z = EDGE + TOWER_R + 3.5;   // far enough that a tower falls a good way before its top smacks it
// collision groups: (memberships << 16) | filter. Coins hanging past the edge filter the floor out.
const GROUP_FLOOR = (0x0001 << 16) | 0xffff, GROUP_HANG = (0x0002 << 16) | 0xfffe, GROUP_ALL = 0xffffffff;
export let HZ = 40;
export const GRAV = 500;
export function setPhysicsRate(hz) { HZ = hz; }

export const pusherFace = (t) => FACE_MIN + (FACE_MAX - FACE_MIN) * (0.5 - 0.5 * Math.cos((t / PERIOD) * Math.PI * 2));

export function mulberry(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.seed = () => a >>> 0;
  f.set = (s) => { a = s >>> 0; };
  return f;
}

let R = null;
export async function loadPhysics() {
  if (R) return R;
  const mod = await import('./vendor/rapier.js');
  R = mod.default || mod;
  await R.init();
  return R;
}

let NEXT = 1;
export class Machine {
  constructor(rng) {
    if (!R) throw new Error('call loadPhysics() first');
    this.rng = rng || mulberry(1);
    this.t = 0; this.acc = 0;
    this.speed = 1; this.guard = false;
    this.coins = []; this.towers = []; this.events = [];
    this.pf = pusherFace(0);
    // Tuned on measured fixtures (a 6-coin stack, a 30-coin rain onto a carpet, a shoved 150-coin carpet):
    // gravity at half of real (coins land a touch softer and do not punch through each other at 40 Hz), stiff contacts
    // (natural frequency 100, 4 inner PGS passes) so thin coins stack true, and a 1 mm contact prediction for speed.
    const w = (this.world = new R.World({ x: 0, y: -GRAV, z: 0 }));
    w.lengthUnit = 10;   // measured: Rapier's contact-refresh thresholds scale with this; 10 keeps contacts fresh at coin scale
    w.numSolverIterations = 4;
    w.timestep = 1 / HZ; this.hz = HZ;
    const ip = w.integrationParameters;
    ip.normalizedPredictionDistance = 0.1 / w.lengthUnit; ip.contact_natural_frequency = 100; ip.numInternalPgsIterations = 4;
    w.integrationParameters = ip;
    const fixed = w.createRigidBody(R.RigidBodyDesc.fixed());
    const box = (hx, hy, hz, x, y, z, fr = 0.32) => w.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr), fixed);
    box(W / 2, 10, (EDGE + 30) / 2, 0, -10, (EDGE - 30) / 2).setCollisionGroups(GROUP_FLOOR);   // floor (a thick slab: nothing is driven through it)
    box(W / 2 + 1, 30, 0.2, 0, 18, GLASS_Z + 0.2, 0.2);                    // the front glass
    box(1, 18, (EDGE + 30) / 2, -W / 2 - 1, 17, (EDGE - 30) / 2, 0.1);    // side walls, as tall as the back wall
    box(1, 18, (EDGE + 30) / 2, W / 2 + 1, 17, (EDGE - 30) / 2, 0.1);
    // the back wall, one solid piece just above the shelf (it scrapes shelf coins off as the pusher pulls back)
    box(W / 2, 15, 1, 0, PH + 0.06 + 15, BACK_WALL - 1, 0.1);
    this.pusher = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PH / 2, this.pf - PUSH_HALF));
    for (const [hx, hz, x, z] of Machine.pusherBoxes()) w.createCollider(R.ColliderDesc.cuboid(hx, PH / 2, hz).setTranslation(x, 0, z).setFriction(0.45), this.pusher);
    this.hold = false; this.tq = [];
    this.hulls = {};
  }

  // The pusher as boxes in its own frame (front face at z = +PUSH_HALF): two side blocks, a back block behind the notch,
  // and thin slices that follow the half-circle so nothing pokes into the notch. [halfX, halfZ, x, z]
  static pusherBoxes() {
    const out = [], NR = NOTCH_R, side = (W / 2 - NR) / 2;
    out.push([side, PUSH_HALF, -(W / 2 + NR) / 2, 0], [side, PUSH_HALF, (W / 2 + NR) / 2, 0]);
    out.push([NR, PUSH_HALF - NR / 2, 0, -NR / 2]);
    const S = 6;
    // the solid corners behind the curve: each slice runs from the back block forward to where the circle starts
    // (measured at the slice's inner side, so no slice pokes into the notch)
    for (let i = 0; i < S; i++) {
      const x0 = (i / S) * NR, x1 = ((i + 1) / S) * NR, z0 = PUSH_HALF - NR, z1 = PUSH_HALF - Math.sqrt(Math.max(0, NR * NR - x0 * x0));
      const hz = (z1 - z0) / 2; if (hz < 0.02) continue;
      for (const sx of [-1, 1]) out.push([(x1 - x0) / 2, hz, sx * (x0 + x1) / 2, z0 + hz]);
    }
    return out;
  }

  // ------------------------------------------------------------------ coins
  add(k, x, y, z, o = {}) {
    const K = KINDS[k];
    const desc = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.05).setAngularDamping(0.4).setCcdEnabled(!!o.ccd);
    if (o.rot) desc.setRotation(o.rot);
    const body = this.world.createRigidBody(desc);
    // a rounded cylinder (a coin's edge is milled round anyway); with the stiff contact settings in the constructor a
    // stack of six holds its height and resting coins do not sink into each other
    this.world.createCollider(R.ColliderDesc.roundCylinder(K.hh - 0.04, K.r - 0.04, 0.04)
      .setFriction(isToken(k) ? 0.3 : 0.18).setRestitution(0.1).setDensity(K.density), body);
    if (o.v) body.setLinvel(o.v, true);
    if (o.w) body.setAngvel(o.w, true);
    const c = { id: NEXT++, k, body, mul: o.mul || 1, tw: !!o.tw, off: false, spd: 0, born: this.t };
    this.coins.push(c);
    return c;
  }
  remove(c) { if (c.body) { this.world.removeRigidBody(c.body); c.body = null; } }
  live() { let n = 0; for (const c of this.coins) if (c.body) n++; return n; }

  // A fresh machine: a hexagonal carpet of coins on the field, a few tokens, some coins on the shelf.
  seedCarpet(tokens = 15) {
    const r = this.rng;
    let row = 0;
    for (let z = FACE_MAX + COIN_R + 0.25; z < EDGE - COIN_R - 0.2; z += 2.12, row++)
      for (let x = -W / 2 + COIN_R + 0.15 + (row % 2) * 1.22; x < W / 2 - COIN_R - 0.1; x += 2.44)
        if (r() > 0.06) this.add('c', x + (r() - 0.5) * 0.08, COIN_HH + 0.005, z + (r() - 0.5) * 0.08);
    // a loose second layer with the tokens on top of the carpet, and a few coins on the shelf
    for (let i = 0; i < 34 + tokens; i++) this.add(i < tokens ? 'BPY'[i % 3] : 'c', (r() - 0.5) * (W - 5), 0.9 + (i % 4) * 0.5, FACE_MAX + 1.5 + r() * (EDGE - FACE_MAX - 4));
    for (let i = 0; i < 8; i++) this.add('c', (r() - 0.5) * (W - 5), PH + 0.3 + (i % 3) * 0.3, BACK_WALL + 1.4 + r() * 2.5);
    for (let i = 0; i < 4 * HZ; i++) this.stepOnce();
    this.events.length = 0;
  }

  // fire one coin (or token) from a back-corner shooter toward the middle; it spins in flight like a flicked coin
  flipper(side) { return flipperAngle(side, (this.steps || 0) / HZ); }
  shoot(k, side) {
    side = side === 'R' ? 'R' : 'L';
    const S = SHOOTER[side], r = this.rng, dir = side === 'R' ? -1 : 1, a = this.flipper(side) + (r() - 0.5) * 0.08;
    const dx = dir * Math.cos(a), dz = Math.sin(a), sp = SHOT_MIN + r() * (SHOT_MAX - SHOT_MIN);
    const c = this.add(k, S.x + dx * 1.6, S.y, S.z + dz * 1.6, {
      ccd: true,
      v: { x: dx * sp, y: 2 + r() * 4, z: dz * sp },
      w: { x: (r() - 0.5) * 6, y: (r() - 0.5) * 16, z: (r() - 0.5) * 6 },
    });
    c.shot = true;
    return c;
  }
  // fire a token out of the port in the back wall: it leaves standing up, facing the player, and tumbles onto the machine
  // the port fires unless a tower is coming up or still stands in the spot right in front of the hole
  portFree() { return !this.towers.some((T) => T.state === 'wait' || T.state === 'build' || (T.body && T.state === 'stand' && T.z - TOWER_R < PORT.z + 1.6 && Math.abs(T.x) < TOWER_R + KINDS.B.r)); }
  fieldTokens() { let n = 0; for (const c of this.coins) if (c.body && isToken(c.k)) n++; return n; }
  launch(k) {
    const r = this.rng, R0 = KINDS[k].r;
    const c = this.add(k, PORT.x + (r() - 0.5) * (PORT.w - 2 * R0 - 0.3), PORT.y, PORT.z + R0 + 0.1, {
      ccd: true,
      // spat out with a bit of randomness in speed, height and width
      v: { x: (r() - 0.5) * 14, y: r() * 6, z: 11 + r() * 17 },
      w: { x: (r() - 0.5) * 4, y: (r() - 0.5) * 14, z: (r() - 0.5) * 4 },
    });
    c.shot = true;
    this.events.push({ t: 'portOut', k });
    return c;
  }
  quake() {
    const r = this.rng;
    // a bump of the cabinet: every coin hops up and forward (impulses scale with mass: grams times cm/s)
    for (const c of this.coins) if (c.body) {
      const m = c.body.mass();
      c.body.applyImpulse({ x: (r() - 0.5) * 8 * m, y: (14 + r() * 8) * m, z: (14 + r() * 12) * m }, true);
      c.body.setAngvel({ x: (r() - 0.5) * 12, y: (r() - 0.5) * 6, z: (r() - 0.5) * 12 }, true);
    }
    for (const T of this.towers) if (T.body && T.state === 'stand') this.tip(T, 18);
    this.events.push({ t: 'quake' });
  }

  // ------------------------------------------------------------------ towers
  // Where the tower goes: on the field in front of the pusher, away from the walls.
  // A won tower waits until the notch is free, then the pusher pulls back and it rises there.
  placeTower(n, opt = {}) {
    const T = { id: NEXT++, body: null, n: 0, want: n, layers: towerLayers(n), H: towerLayers(n) * LAYER_H, hgt: towerLayers(n) * LAYER_H, gold: !!opt.gold, col: opt.col || 'B',
      crown: opt.crown || [], state: 'wait', bt: 0, frac: 0, twist0: this.rng() * Math.PI * 2, stand: 0, x: 0, z: FACE_RET, opt };
    this.towers.push(T);
    return T;
  }
  notchFree() { return !this.towers.some((T) => T.body && Math.hypot(T.x, T.z - FACE_RET) < TOWER_R * 2 + 0.5); }
  addTower(x, z, n, opt = {}, into = null) {
    // clear the coins standing where it goes
    for (const c of this.coins) {
      if (!c.body) continue;
      const p = c.body.translation(), dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz), need = TOWER_R + KINDS[c.k].r + 0.1;
      if (d < need && p.y < 3) { const k = need / (d || 1e-3); c.body.setTranslation({ x: Math.max(-W / 2 + 1.3, Math.min(W / 2 - 1.3, x + (d ? dx : 1) * k)), y: p.y + 0.3, z: z + (d ? dz : 0) * k }, true); }
    }
    const L = towerLayers(n), H = L * LAYER_H;
    // it starts sunk in the floor (top level with it) and rises while it builds
    const body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, into ? -H / 2 : H / 2, z).setAngularDamping(0.2));
    // light enough that the pusher and the carpet can shove it (a real tower rides the carpet), heavy enough to plough
    const vol = Math.PI * TOWER_R * TOWER_R * H, mass = Math.min(n, 80) * Math.PI * COIN_R * COIN_R * COIN_HH * 2 * 8.9;
    this.world.createCollider(R.ColliderDesc.cylinder(H / 2, TOWER_R).setFriction(0.14).setRestitution(0.02).setDensity(mass / vol), body);
    const T = into || { id: NEXT++, n: 0, want: n, gold: !!opt.gold, col: opt.col || 'B', crown: opt.crown || [], bt: 0, frac: 0, twist0: this.rng() * Math.PI * 2, stand: 0 };
    Object.assign(T, { body, H, layers: L, hgt: H, state: 'build', x, z, rise: !!into });
    if (!into) this.towers.push(T);
    this.events.push({ t: 'towerStart', T });
    return T;
  }
  // push the top of a tower forward (and a little sideways) by dv cm/s
  tip(T, dv) {
    const m = T.body.mass(), r = this.rng;
    T.body.applyImpulseAtPoint({ x: (r() - 0.5) * dv * 0.6 * m, y: 0, z: dv * m }, this.towerTop(T), true);
  }
  towerTop(T) { const p = T.body.translation(), q = T.body.rotation(); const up = rotY(q); return { x: p.x + up.x * T.H / 2, y: p.y + up.y * T.H / 2, z: p.z + up.z * T.H / 2 }; }
  stepTowers(dt) {
    const keep = [];
    for (const T of this.towers) {
      if (T.state === 'wait') {
        // the notch must be clear; the pusher pulls all the way back, then the tower comes up
        if (this.notchFree()) { this.hold = true; if (this.pf <= FACE_RET + 0.05) this.addTower(0, FACE_RET, T.want, T.opt, T); }
        keep.push(T); continue;
      }
      if (T.state === 'build') {
        T.bt += dt;
        this.hold = true;
        const dur = 1.5 + T.want / 450;
        T.frac += (T.want / dur) * Math.min(1.6, 0.4 + (T.bt / dur) * 1.6) * dt;
        const add = Math.floor(T.frac); T.frac -= add;
        const n = Math.min(T.want, T.n + add), L0 = towerLayers(T.n), L1 = towerLayers(n);
        for (let l = L0; l < L1; l++) this.events.push({ t: 'towerCoin', i: l, n: towerLayers(T.want), T });
        T.n = n;
        if (!T.rise) { T.layers = L1; T.hgt = L1 * LAYER_H; }
        else {
          const k = Math.min(1, T.n / T.want), e = 1 - Math.pow(1 - k, 2), y = -T.H / 2 + T.H * e; T.body.setNextKinematicTranslation({ x: T.x, y, z: T.z });
          // it spirals up: turning as it rises, fast at first and settling as it reaches full height
          T.spin = SPIRAL_TURNS * Math.PI * 2 * e; T.body.setNextKinematicRotation({ x: 0, y: Math.sin(T.spin / 2), z: 0, w: Math.cos(T.spin / 2) });
          // the rising tower shoulders loose coins aside, so none end up inside or under it
          for (const c of this.coins) {
            if (!c.body) continue;
            const q = c.body.translation(), dx = q.x - T.x, dz = q.z - T.z, d = Math.hypot(dx, dz), need = TOWER_R + KINDS[c.k].r + 0.05;
            if (d >= need || q.y > y + T.H / 2 + 0.5) continue;
            const f = need / (d || 1e-3);
            let nx = T.x + (d ? dx : 0.5) * f, ny = q.y + 0.05, nz = T.z + (d ? dz : 1) * f;
            // never shove a coin back through the wall: keep it in front and move it round the side instead (onto the
            // pusher's top if that is where it lands)
            const zMin = BACK_WALL + KINDS[c.k].r + 0.05;
            if (nz < zMin) { nz = zMin; nx = T.x + Math.sign(dx || 1) * Math.sqrt(Math.max(0, need * need - (nz - T.z) ** 2)); if (Math.abs(nx) > NOTCH_R - 0.2) ny = PH + KINDS[c.k].hh + 0.02; }
            c.body.setTranslation({ x: Math.max(-W / 2 + 1.3, Math.min(W / 2 - 1.3, nx)), y: ny, z: nz }, true);
          }
        }
        if (T.n >= T.want) {
          if (T.rise) { T.body.setTranslation({ x: T.x, y: T.H / 2 + 0.005, z: T.z }, true); const a = SPIRAL_TURNS * Math.PI * 2; T.body.setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, true); }
          T.state = 'stand'; T.body.setBodyType(R.RigidBodyType.Dynamic, true); this.hold = false; this.events.push({ t: 'towerDone', T });
        }
        keep.push(T); continue;
      }
      if (T.state === 'crumble') {
        const v = T.body.linvel(); T.body.setLinvel({ x: v.x, y: v.y - GRAV * dt, z: v.z }, true);   // still falling
        T.peelAcc += T.peelRate * dt;
        while (T.peelAcc >= 1 && T.peel > 0) { T.peel--; T.peelAcc--; this.peelLayer(T, T.peel); }
        if (T.peel <= 0) { this.world.removeRigidBody(T.body); T.body = null; continue; }
        keep.push(T); continue;
      }
      const p = T.body.translation(), up = rotY(T.body.rotation());
      T.x = p.x; T.z = p.z;
      if (T.state === 'stand') {
        T.stand += dt;
        T.tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
        if (T.tilt > 0.05 && !T.warned) { T.warned = true; this.events.push({ t: 'topple', T }); }
        if (T.tilt > 0.18 && !T.falling) { T.falling = true; this.events.push({ t: 'fall', T }); }
        // A tower stands and rides the carpet slowly. Only once it really hangs over the edge does it tip toward the
        // player (the stale floor contact Rapier keeps at the edge would otherwise hold it up).
        if (p.z > EDGE - 0.6) {
          // its centre is at the lip: it goes over, swinging its top toward the window
          const w = T.body.angvel(), v = T.body.linvel();
          T.body.setAngvel({ x: Math.max(w.x, 1.4 + T.tilt * 2.5), y: w.y * 0.5, z: w.z * 0.5 }, true);
          T.body.setLinvel({ x: v.x, y: v.y, z: Math.max(v.z, 2) }, true);
        } else if (p.z > EDGE - TOWER_R * 0.25 && this.rng() < dt * 4) this.tip(T, 14);
        // tipping toward the window: its top hits the glass, and a moment later it bursts
        const top = this.towerTop(T);
        if (!T.smack && top.z + TOWER_R * Math.cos(T.tilt) > GLASS_Z - 0.25 && T.tilt > 0.05) {
          T.smack = this.t; this.events.push({ t: 'smack', T, x: top.x, y: top.y, z: GLASS_Z, n: T.want });
        }
        if (T.smack && this.t - T.smack > 0.35) { this.burst(T); keep.push(T); continue; }
        if (T.tilt > 0.8 || p.y < T.H * 0.3) { this.burst(T); keep.push(T); continue; }
      }
      keep.push(T);
    }
    this.towers = keep;
  }
  // the coin at ring slot i, in the tower's own frame (y up from its base centre)
  static ringLocal(T, i) {
    const k = Math.floor(i / RING_N), j = i % RING_N, a = T.twist0 + k * TWIST + (k % 2) * (Math.PI / RING_N) + (j * Math.PI * 2) / RING_N;
    return [Math.cos(a) * RING_R, k * LAYER_H + COIN_HH - T.H / 2, Math.sin(a) * RING_R];
  }
  // the crown tokens lie on the top ring, spread round it so they never touch each other
  static crownLocal(T, i) {
    const k = T.layers - 1, a = T.twist0 + k * TWIST + (k % 2) * (Math.PI / RING_N) + (i * Math.PI * 2) / Math.max(1, T.crown.length) + 0.3;
    return [Math.cos(a) * RING_R, T.hgt - T.H / 2 + KINDS.B.hh, Math.sin(a) * RING_R];
  }
  // The tower turns into loose coins where its coins were, moving the way it was moving. Three coins per layer
  // (they do not overlap), up to FIELD_CAP loose coins on the field: the tower's full count is shared between them.
  // The tower crumbles into real coins, top layer first, over about half a second: each peeled layer becomes loose
  // coins carrying the tower's motion. Small towers become every one of their coins; big ones get fewer real coins per
  // layer (each worth its share) so a phone stays smooth. The value of every coin is kept exactly.
  burst(T) {
    const lv = T.body.linvel(), av = T.body.angvel(), p = T.body.translation(), q = T.body.rotation();
    const budget = Math.max(80, Math.min(CRUMBLE_MAX, CRUMBLE_LIVE - this.live()));
    T.per = Math.max(1, Math.min(RING_N, Math.floor(budget / Math.max(1, T.layers))));
    T.state = 'crumble'; T.peel = T.layers; T.peelAcc = 0; T.peelRate = T.layers / 0.45;
    // the rest of the stack keeps falling but no longer collides (the peeled coins take over)
    T.body.setBodyType(R.RigidBodyType.KinematicVelocityBased, true);
    T.body.setLinvel(lv, true); T.body.setAngvel(av, true);
    for (let i = 0; i < T.body.numColliders(); i++) T.body.collider(i).setSensor(true);
    T.crown.forEach((k, i) => { const [cx, cy, cz] = Machine.crownLocal(T, i), w = rotate(q, cx, cy + 0.05, cz); this.add(k, p.x + w.x, Math.max(0.3, p.y + w.y), p.z + w.z, { v: { x: lv.x, y: lv.y + 3, z: lv.z }, tw: true }); });
    T.crown = [];
    this.events.push({ t: 'burst', T, n: T.want });
  }
  peelLayer(T, k) {
    const p = T.body.translation(), q = T.body.rotation(), lv = T.body.linvel(), av = T.body.angvel(), r = this.rng;
    const inLayer = Math.max(0, Math.min(RING_N, T.want - k * RING_N));
    if (!inLayer) return;
    const s = Math.min(inLayer, T.per), base = Math.floor(inLayer / s), extra = inLayer - base * s;
    for (let j = 0; j < s; j++) {
      const i = k * RING_N + Math.floor((j * inLayer) / s);
      const [lx, ly, lz] = Machine.ringLocal(T, i), w = rotate(q, lx, ly, lz);
      const v = { x: lv.x + av.y * w.z - av.z * w.y + (r() - 0.5) * 4, y: lv.y + av.z * w.x - av.x * w.z + r() * 2, z: lv.z + av.x * w.y - av.y * w.x + (r() - 0.5) * 4 };
      this.add(T.gold ? 'g' : 'c', Math.max(-W / 2 + 1.25, Math.min(W / 2 - 1.25, p.x + w.x)), Math.max(COIN_HH + 0.02, p.y + w.y), p.z + w.z,
        { rot: q, v, w: { x: av.x + (r() - 0.5) * 6, y: (r() - 0.5) * 6, z: av.z + (r() - 0.5) * 6 }, tw: true, mul: base + (j < extra ? 1 : 0) });
    }
  }

  // ------------------------------------------------------------------ stepping
  stepOnce() {
    const dt = 1 / HZ;
    this.steps = (this.steps || 0) + 1; this.pfPrev = this.pf;   // the view draws between the last two steps
    // the stroke runs unless a tower is coming up; the face never jumps (it moves at most 10 cm/s toward its target)
    if (!this.towers.some((T) => T.state === 'wait' || T.state === 'build')) this.hold = false;
    if (!this.hold && Math.abs(this.pf - pusherFace(this.t)) < 0.05) this.t += dt * this.speed;
    const target = this.hold ? FACE_RET : pusherFace(this.t), stepMax = 10 * dt * this.speed;
    this.pf += Math.max(-stepMax, Math.min(stepMax, target - this.pf));
    this.pusher.setNextKinematicTranslation({ x: 0, y: PH / 2, z: this.pf - PUSH_HALF });
    this.world.step();
    this.separate();
    this.stepTowers(dt);
    const ev = this.events, keep = [];
    for (const c of this.coins) {
      if (!c.body) continue;
      const p = c.body.translation();
      if (p.z > EDGE + 0.4 && p.y < -1.5) {
        // over the edge: the middle pays, the corners are gutters (unless Wall Guard is up)
        const gut = !this.guard && Math.abs(p.x) > W / 2 - GUT;
        ev.push({ t: gut ? 'lost' : 'pay', k: c.k, x: p.x, tw: c.tw, mul: c.mul });
        this.remove(c); continue;
      }
      // gone for good: fallen out of the machine, or slipped behind the back wall into the mechanism
      if (p.y < -30 || !isFinite(p.x + p.y + p.z) || p.z < BACK_WALL - 1) { this.remove(c); continue; }
      // A coin more than 60% past the edge tips and drops (Rapier can keep a stale floor contact on a coin that has
      // slid past the end of the floor, so the tip is applied here, as a real coin with nothing on top would do).
      // A coin more than 55% past the edge stops touching the floor. Rapier can keep reusing a stale floor contact from
      // centimetres back while a coin creeps forward, which leaves it hovering past the edge; a real coin there tips off.
      if (!c.hang && p.z > EDGE + KINDS[c.k].r * 0.55) { c.hang = true; c.body.collider(0).setCollisionGroups(GROUP_HANG); c.body.wakeUp(); }
      // ...and a coin that comes back over the field (bounced off the glass) gets the floor back
      else if (c.hang && p.z < EDGE + KINDS[c.k].r * 0.3) {
        c.hang = false; c.body.collider(0).setCollisionGroups(GROUP_ALL);
        if (p.y < KINDS[c.k].hh && p.z < EDGE - 0.1) { c.body.setTranslation({ x: p.x, y: KINDS[c.k].hh + 0.02, z: p.z }, true); const v = c.body.linvel(); c.body.setLinvel({ x: v.x, y: 0, z: v.z }, true); }
      }
      // A resting coin squeezed in a pile against the back wall can be kicked out by the solver at over a metre a
      // second (measured: one cleared the side wall). Nothing in the machine moves a coin like that except a shot,
      // so a coin that is not flying is capped to a hop (Quake's jolt stays under the cap).
      if (!c.shot && !c.tw && !c.hang) {
        const v = c.body.linvel(), hs = Math.hypot(v.x, v.z);
        if (v.y > POP_UP || hs > POP_SIDE) { const k = hs > POP_SIDE ? POP_SIDE / hs : 1; c.body.setLinvel({ x: v.x * k, y: Math.min(v.y, POP_UP), z: v.z * k }, true); }
      }
      // landing and clinks: a sudden stop after moving fast
      if (c.shot || c.tw) {
        const v = c.body.linvel(), s = Math.hypot(v.x, v.y, v.z);
        if (c.spd > 30 && s < c.spd * 0.45) ev.push({ t: c.spd > 80 ? 'land' : 'clink', v: c.spd / 10, x: p.x, z: p.z, k: c.k });
        c.spd = s;
        if (this.t - c.born > 4 / Math.max(1, this.speed)) { c.shot = false; c.tw = c.tw && this.t - c.born < 6; }
      }
      keep.push(c);
    }
    this.coins = keep;
  }
  // After every step: a coin pressed into the floor (the pusher can wedge one) goes back on top of it. Coin-on-coin
  // contact is left to Rapier (measured: lifting coins apart here caused ~250 visible pops a second on a still carpet).
  separate() {
    for (const c of this.coins) {
      if (!c.body || c.hang) continue;
      const p = c.body.translation();
      // a coin pressed into the floor (the pusher can wedge one) goes back on top of it
      if (p.y < c.body.collider(0).halfHeight() * 0.6 && p.y > -4 && p.z < EDGE - 0.2) {
        // under the pusher's footprint (not in its notch) it goes onto the shelf, anywhere else back onto the floor
        const hh = KINDS[c.k].hh, under = p.z < this.pf - 0.1 && Math.hypot(p.x, p.z - this.pf) > NOTCH_R && p.z > this.pf - 2 * PUSH_HALF;
        const y = under ? PH + hh + 0.02 : hh + 0.01;
        c.body.setTranslation({ x: p.x, y, z: p.z }, true);
        const v = c.body.linvel(); c.body.setLinvel({ x: v.x, y: Math.max(0, v.y), z: v.z }, true);
        this.fixes = (this.fixes || 0) + 1;
      }
    }
  }

  // advance by real time dt with a fixed 60 Hz step (at most 4 steps a frame so a slow phone never spirals)
  advance(dt) {
    this.acc = Math.min(this.acc + dt, 4 / HZ);
    let n = 0;
    while (this.acc >= 1 / HZ - 1e-9) { this.stepOnce(); this.acc -= 1 / HZ; n++; }
    return n;
  }

  // ------------------------------------------------------------------ saves
  snapshot() {
    const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
    return {
      t: r2(this.t),
      coins: this.coins.filter((c) => c.body).map((c) => { const p = c.body.translation(), q = c.body.rotation(); const a = [c.k, r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)]; if (c.mul > 1) a.push(c.mul); return a; }),
      // a standing tower keeps its place; one still waiting or rising comes up again after a reload
      towers: this.towers.filter((T) => T.state !== 'crumble').map((T) => { const up = T.state === 'stand' && T.body, p = up ? T.body.translation() : { x: 0, z: FACE_RET }; return [r2(p.x), r2(p.z), T.want, T.gold ? 1 : 0, T.col, T.crown.join(''), r2(T.twist0), up ? 's' : 'w']; }),
    };
  }
  restore(s) {
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    this.t = num(s.t, 0); this.pf = pusherFace(this.t);
    this.pusher.setTranslation({ x: 0, y: PH / 2, z: this.pf - PUSH_HALF }, true);
    for (const a of (Array.isArray(s.coins) ? s.coins : [])) {
      if (!Array.isArray(a) || !KINDS[a[0]]) continue;
      const [k, x, y, z, qx, qy, qz, qw] = a;
      if (![x, y, z].every((v) => typeof v === 'number' && isFinite(v))) continue;
      if (Math.abs(x) > W / 2 || z > EDGE || z < BACK_WALL - 2 || y < 0 || y > 30) continue;
      const qq = [qx, qy, qz, qw].every((v) => typeof v === 'number' && isFinite(v)) ? norm({ x: qx, y: qy, z: qz, w: qw }) : null;
      const c = this.add(k, x, y, z, qq ? { rot: qq } : {});
      if (typeof a[8] === 'number' && a[8] > 1) c.mul = Math.min(50, Math.floor(a[8]));
    }
    for (const a of (Array.isArray(s.towers) ? s.towers : [])) {
      if (!Array.isArray(a)) continue;
      const want = Math.max(1, Math.min(1000, Math.floor(num(a[2], 330))));
      if (a[7] === 'w') { this.placeTower(want, { gold: !!a[3], col: a[4] || 'B', crown: String(a[5] || '').split('').filter(isToken) }); continue; }
      const T = this.addTower(num(a[0], 0), num(a[1], 6), Math.max(1, Math.min(1000, Math.floor(num(a[2], 330)))), { gold: !!a[3], col: a[4] || 'B', crown: String(a[5] || '').split('').filter(isToken) });
      T.n = T.want; T.layers = towerLayers(T.n); T.hgt = T.layers * LAYER_H; T.twist0 = num(a[6], 0);
      T.state = 'stand'; T.body.setBodyType(R.RigidBodyType.Dynamic, true);
    }
    this.events.length = 0;
  }
}

// quaternion helpers
function rotate(q, x, y, z) {
  const ix = q.w * x + q.y * z - q.z * y, iy = q.w * y + q.z * x - q.x * z, iz = q.w * z + q.x * y - q.y * x, iw = -q.x * x - q.y * y - q.z * z;
  return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x };
}
function rotY(q) { return rotate(q, 0, 1, 0); }
function norm(q) { const l = Math.hypot(q.x, q.y, q.z, q.w) || 1; return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }; }
export { rotate };
