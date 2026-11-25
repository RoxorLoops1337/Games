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
export const FACE_MIN = -4.5, FACE_MAX = 0.5, PERIOD = 4.2, PH = 2.4, PUSH_HALF = 9, BACK_WALL = -7.6;
export const SHOOTER = { L: { x: -W / 2 + 1.6, y: PH + 7, z: BACK_WALL + 1.2 }, R: { x: W / 2 - 1.6, y: PH + 7, z: BACK_WALL + 1.2 } };
// towers: a hollow ring of coins, RING_N per layer, each layer twisted a little more
export const RING_N = 8, RING_R = 2.0 * COIN_R, LAYER_H = COIN_HH * 2, TWIST = 0.13;
export const TOWER_R = RING_R + COIN_R;
export const towerLayers = (n) => Math.ceil(n / RING_N);
export const FIELD_CAP = 230;    // most loose coins simulated at once
export let HZ = 40;
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
    const w = (this.world = new R.World({ x: 0, y: -981, z: 0 }));
    w.lengthUnit = 100;            // centimetres
    w.numSolverIterations = 4;
    w.timestep = 1 / HZ; this.hz = HZ;
    const fixed = w.createRigidBody(R.RigidBodyDesc.fixed());
    const box = (hx, hy, hz, x, y, z, fr = 0.32) => w.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr), fixed);
    box(W / 2, 1, (EDGE + 30) / 2, 0, -1, (EDGE - 30) / 2);                // floor, from under the pusher to the drop edge
    box(1, 10, (EDGE + 30) / 2, -W / 2 - 1, 9, (EDGE - 30) / 2, 0.1);    // side walls
    box(1, 10, (EDGE + 30) / 2, W / 2 + 1, 9, (EDGE - 30) / 2, 0.1);
    box(W / 2, 8, 1, 0, PH + 0.06 + 8, BACK_WALL - 1, 0.1);              // back wall, just above the shelf
    this.pusher = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PH / 2, this.pf - PUSH_HALF));
    w.createCollider(R.ColliderDesc.cuboid(W / 2, PH / 2, PUSH_HALF).setFriction(0.45), this.pusher);
    this.hulls = {};
  }

  // ------------------------------------------------------------------ coins
  add(k, x, y, z, o = {}) {
    const K = KINDS[k];
    const desc = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(0.05).setAngularDamping(0.4).setCcdEnabled(!!o.ccd);
    if (o.rot) desc.setRotation(o.rot);
    const body = this.world.createRigidBody(desc);
    // The collision shape is a 12-pointed star of three thin boxes, not a cylinder: Rapier's flat cylinder-on-cylinder
    // contacts let thin coins sink into each other (a stack of six settles at half height); box faces stack true.
    const s = K.r * Math.cos(Math.PI / 12), d = s * Math.tan(Math.PI / 6);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 6;
      this.world.createCollider(R.ColliderDesc.cuboid(s, K.hh, d).setRotation({ x: 0, y: Math.sin(a), z: 0, w: Math.cos(a) })
        .setFriction(isToken(k) ? 0.45 : 0.3).setRestitution(0.1).setDensity(K.density), body);
    }
    if (o.v) body.setLinvel(o.v, true);
    if (o.w) body.setAngvel(o.w, true);
    const c = { id: NEXT++, k, body, mul: o.mul || 1, tw: !!o.tw, off: false, spd: 0, born: this.t };
    this.coins.push(c);
    return c;
  }
  remove(c) { if (c.body) { this.world.removeRigidBody(c.body); c.body = null; } }
  live() { let n = 0; for (const c of this.coins) if (c.body) n++; return n; }

  // A fresh machine: a hexagonal carpet of coins on the field, a few tokens, some coins on the shelf.
  seedCarpet(tokens = 9) {
    const r = this.rng;
    let row = 0;
    for (let z = FACE_MIN + COIN_R + 0.25; z < EDGE - COIN_R - 0.2; z += 2.12, row++)
      for (let x = -W / 2 + COIN_R + 0.15 + (row % 2) * 1.22; x < W / 2 - COIN_R - 0.1; x += 2.44)
        if (r() > 0.06) this.add('c', x + (r() - 0.5) * 0.08, COIN_HH + 0.005, z + (r() - 0.5) * 0.08);
    // a loose second layer with the tokens on top of the carpet, and a few coins on the shelf
    for (let i = 0; i < 24 + tokens; i++) this.add(i < tokens ? 'BPY'[i % 3] : 'c', (r() - 0.5) * (W - 5), 0.9 + (i % 4) * 0.5, FACE_MAX + 1.5 + r() * (EDGE - FACE_MAX - 4));
    for (let i = 0; i < 8; i++) this.add('c', (r() - 0.5) * (W - 5), PH + 0.3 + (i % 3) * 0.3, BACK_WALL + 1.4 + r() * 2.5);
    for (let i = 0; i < 4 * HZ; i++) this.stepOnce();
    this.events.length = 0;
  }

  // fire one coin (or token) from a back-corner shooter toward the middle; it spins in flight like a flicked coin
  shoot(k, side) {
    const S = SHOOTER[side === 'R' ? 'R' : 'L'], r = this.rng, dir = side === 'R' ? -1 : 1;
    const c = this.add(k, S.x, S.y, S.z, {
      ccd: true,
      v: { x: dir * (8 + r() * 30), y: 4 + r() * 6, z: 12 + r() * 26 },
      w: { x: (r() - 0.5) * 30, y: (r() - 0.5) * 10, z: (r() - 0.5) * 30 },
    });
    c.shot = true;
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
  placeTower(n, opt = {}) {
    const r = this.rng;
    return this.addTower((r() - 0.5) * (W - 2 * TOWER_R - 4), FACE_MAX + TOWER_R + 2.2 + r() * 1.6, n, opt);
  }
  addTower(x, z, n, opt = {}) {
    // clear the coins standing where it goes
    for (const c of this.coins) {
      if (!c.body) continue;
      const p = c.body.translation(), dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz), need = TOWER_R + KINDS[c.k].r + 0.1;
      if (d < need && p.y < 3) { const k = need / (d || 1e-3); c.body.setTranslation({ x: Math.max(-W / 2 + 1.3, Math.min(W / 2 - 1.3, x + (d ? dx : 1) * k)), y: p.y + 0.3, z: z + (d ? dz : 0) * k }, true); }
    }
    const L = towerLayers(n), H = L * LAYER_H;
    const body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, H / 2, z).setAngularDamping(0.2));
    // light enough that the pusher and the carpet can shove it (a real tower rides the carpet), heavy enough to plough
    const vol = Math.PI * TOWER_R * TOWER_R * H, mass = Math.min(n, 80) * Math.PI * COIN_R * COIN_R * COIN_HH * 2 * 8.9;
    this.world.createCollider(R.ColliderDesc.cylinder(H / 2, TOWER_R).setFriction(0.25).setRestitution(0.02).setDensity(mass / vol), body);
    const T = { id: NEXT++, body, n: 0, want: n, layers: 0, H, hgt: 0, gold: !!opt.gold, col: opt.col || 'B', crown: opt.crown || [], state: 'build', bt: 0, frac: 0,
      twist0: this.rng() * Math.PI * 2, stand: 0, x, z };
    this.towers.push(T);
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
      if (T.state === 'build') {
        T.bt += dt;
        const dur = 1.5 + T.want / 450;
        T.frac += (T.want / dur) * Math.min(1.6, 0.4 + (T.bt / dur) * 1.6) * dt;
        const add = Math.floor(T.frac); T.frac -= add;
        const n = Math.min(T.want, T.n + add), L0 = towerLayers(T.n), L1 = towerLayers(n);
        for (let l = L0; l < L1; l++) this.events.push({ t: 'towerCoin', i: l, n: towerLayers(T.want), T });
        T.n = n; T.layers = L1; T.hgt = L1 * LAYER_H;
        if (T.n >= T.want) { T.state = 'stand'; T.body.setBodyType(R.RigidBodyType.Dynamic, true); this.events.push({ t: 'towerDone', T }); }
        keep.push(T); continue;
      }
      const p = T.body.translation(), up = rotY(T.body.rotation());
      T.x = p.x; T.z = p.z;
      if (T.state === 'stand') {
        T.stand += dt;
        T.tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
        if (T.tilt > 0.05 && !T.warned) { T.warned = true; this.events.push({ t: 'topple', T }); }
        if (T.tilt > 0.18 && !T.falling) { T.falling = true; this.events.push({ t: 'fall', T }); }
        // an overhanging tower teeters over the edge; one that stands too long gets nudged (the carpet would get it there)
        if (p.z > EDGE - TOWER_R * 0.45 && this.rng() < dt * 3) this.tip(T, 10);
        else if (T.stand > 15 && this.rng() < dt * 0.6) this.tip(T, 7);
        if (T.tilt > 0.8 || p.y < T.H * 0.3) { this.burst(T); continue; }
      }
      keep.push(T);
    }
    this.towers = keep;
  }
  // the coin at ring slot i, in the tower's own frame (y up from its base centre)
  static ringLocal(T, i) {
    const k = Math.floor(i / RING_N), j = i % RING_N, a = T.twist0 + k * TWIST + (j * Math.PI * 2) / RING_N;
    return [Math.cos(a) * RING_R, k * LAYER_H + COIN_HH - T.H / 2, Math.sin(a) * RING_R];
  }
  // The tower turns into loose coins where its coins were, moving the way it was moving. Three coins per layer
  // (they do not overlap), up to FIELD_CAP loose coins on the field: the tower's full count is shared between them.
  burst(T) {
    const p = T.body.translation(), q = T.body.rotation(), lv = T.body.linvel(), av = T.body.angvel();
    const r = this.rng, picks = [];
    for (let k = 0; k < T.layers; k++) for (let j = 0; j < 3; j++) picks.push(k * RING_N + ((j * 3 + (k % 2) * 1) % RING_N));
    const room = Math.max(40, FIELD_CAP - this.live());
    const step = Math.max(1, Math.ceil(picks.length / room)), chosen = picks.filter((_, i) => i % step === 0);
    const per = Math.floor(T.want / chosen.length), extra = T.want - per * chosen.length;
    chosen.forEach((i, idx) => {
      const [lx, ly, lz] = Machine.ringLocal(T, i), w = rotate(q, lx, ly, lz);
      const pos = { x: p.x + w.x, y: Math.max(COIN_HH + 0.02, p.y + w.y), z: p.z + w.z };
      const v = { x: lv.x + av.y * w.z - av.z * w.y + (r() - 0.5) * 6, y: lv.y + av.z * w.x - av.x * w.z + r() * 4, z: lv.z + av.x * w.y - av.y * w.x + (r() - 0.5) * 6 };
      this.add(T.gold ? 'g' : 'c', Math.max(-W / 2 + 1.25, Math.min(W / 2 - 1.25, pos.x)), pos.y, pos.z, { rot: q, v, w: { x: (r() - 0.5) * 8, y: (r() - 0.5) * 8, z: (r() - 0.5) * 8 }, tw: true, mul: per + (idx < extra ? 1 : 0) });
    });
    T.crown.forEach((k, i) => { const w = rotate(q, (i - 1) * 1.6, T.H / 2 + 0.3, 0); this.add(k, p.x + w.x, Math.max(0.3, p.y + w.y), p.z + w.z, { v: { x: lv.x, y: lv.y + 3, z: lv.z }, tw: true }); });
    this.world.removeRigidBody(T.body); T.body = null;
    this.events.push({ t: 'burst', T, n: T.want });
  }

  // ------------------------------------------------------------------ stepping
  stepOnce() {
    const dt = 1 / HZ;
    this.t += dt * this.speed;
    this.pf = pusherFace(this.t);
    this.pusher.setNextKinematicTranslation({ x: 0, y: PH / 2, z: this.pf - PUSH_HALF });
    this.world.step();
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
      if (p.y < -30 || !isFinite(p.x + p.y + p.z)) { this.remove(c); continue; }
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
      towers: this.towers.map((T) => { const p = T.body.translation(); return [r2(p.x), r2(p.z), T.want, T.gold ? 1 : 0, T.col, T.crown.join(''), r2(T.twist0)]; }),
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
