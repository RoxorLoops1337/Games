// Galaxy Pusher: the whole game as a pure simulation (no DOM, no clock, no Math.random).
//
// THE MACHINE (2.5D). x runs across the playfield (0..W), y runs from the back
// wall (0) toward the player (FRONT is the drop edge), z is height. Coins are
// short cylinders (radius r, thickness h). A coin either rests ON another coin
// (its centre is over it) or sits BESIDE it (they collide sideways), which is
// enough for carpets, piles and stacks. The pusher is a kinematic block whose
// top is a moving shelf (height PH): coins on the shelf ride along, the back
// wall scrapes them off the front of the shelf onto the field, and the pusher
// face shoves the field carpet forward. Coins whose centre crosses FRONT fall:
// over the middle they pay out, over the two corner gutters they are lost.
//
// THE GAME. Tokens (blue Rox, pink Jas, yellow Mew) that fall off the edge go
// into a row of 6. Three of a colour = that hero attacks the enemy. A full row
// without a triple = team strike. Every paid coin is a small laser shot. A
// defeated enemy spins the Galaxy Wheel; the pocket the ball lands in builds a
// coin TOWER on the field (blue 330, yellow 360, pink 720, JP 900 coins) that the
// pusher shoves until it topples in a shower of coins. Paid coins charge the
// energy ring; full energy starts DOUBLE TIME (double damage, double pay).

export const W = 22, BACK = 0, FRONT = 26;
export const PMIN = 2.0, PMAX = 6.6, PERIOD = 4.2, PH = 1.0;
export const GUT = 3.0;               // width of each corner gutter at the front edge
export const G = 42;
const CELL = 2.6;                  // gravity (units/s^2)
export const DT = 1 / 120;
export const CHUTE_Z = PH + 6;
export const ROW = 6;
export const COL = ['B', 'P', 'Y'];   // blue = Rox, pink = Jas, yellow = Mew
export const KIND = {
  c: { r: 1.0, h: 0.2, m: 1, v: 1 },     // silver coin
  g: { r: 1.0, h: 0.2, m: 1, v: 2 },     // gold coin (x2 towers)
  B: { r: 1.25, h: 0.32, m: 1.6, v: 0 },
  P: { r: 1.25, h: 0.32, m: 1.6, v: 0 },
  Y: { r: 1.25, h: 0.32, m: 1.6, v: 0 },
};
export const isToken = (k) => k === 'B' || k === 'P' || k === 'Y';
export const TOWER = { B: 330, Y: 360, P: 720, JP: 900 };   // the cabinet's own numbers
// A tower is a hollow cylinder of coins like the real ones: every layer is a ring of RING_N coins
// around the axis, each layer turned a little further, so the coin edges climb in spirals.
export const RING_N = 8, RING_R = 2.0, TH_T = 0.2, TWIST = 0.13;
export const towerLayers = (n) => Math.ceil(n / RING_N);
export const FIELD_CAP = 340;       // most loose coins the field simulates; a bigger spill merges coins (each worth more)
// The wheel: 12 pockets clockwise from the top. c = tower colour, x2 = gold coins (pay double), lv = every hero levels up.
export const WHEEL = [
  { c: 'B', x2: true }, { c: 'P' }, { c: 'Y', x2: true }, { c: 'JP' },
  { c: 'B' }, { c: 'P' }, { c: 'Y' }, { c: 'B', lv: true },
  { c: 'P' }, { c: 'Y', x2: true }, { c: 'B' }, { c: 'Y', lv: true },
];
export const HEROES = [
  { id: 'rox', name: 'Rox', col: 'B', base: 12 },
  { id: 'jas', name: 'Jas', col: 'P', base: 12 },
  { id: 'mew', name: 'Mew', col: 'Y', base: 11 },
];
export const SECTORS = [
  { name: 'Neon Docks', foes: ['drone', 'drone2', 'crab', 'saucer', 'boss_mech'] },
  { name: 'Ion Reef', foes: ['saucer', 'crab', 'drone2', 'eel', 'boss_squid'] },
  { name: 'Comet Yard', foes: ['drone2', 'eel', 'crab', 'saucer', 'boss_mech'] },
  { name: 'Void Arcade', foes: ['eel', 'saucer', 'drone2', 'crab', 'boss_squid'] },
];
export const FOE_NAME = { drone: 'Buzz Drone', drone2: 'Twin Drones', crab: 'Scrap Crab', saucer: 'Hoverdisc', eel: 'Volt Eel', boss_mech: 'Titan Mech', boss_squid: 'Nebula Squid' };
export const ENERGY_MAX = 200, FEVER_TIME = 20;
export const REGEN_BELOW = 50, REGEN_EVERY = 5;
export const FIRE_GAP = 0.24;
// items (the cabinet's 道具 button): bought with coins
export const ITEMS = {
  quake: { name: 'Quake', cost: 60, desc: 'Bump the table: every coin jolts forward.' },
  guard: { name: 'Wall Guard', cost: 120, dur: 30, desc: 'Close both corner gutters for 30 s.' },
  turbo: { name: 'Turbo Push', cost: 150, dur: 20, desc: 'The pusher runs at double speed for 20 s.' },
  rain: { name: 'Token Rain', cost: 150, desc: 'Drop 3 tokens, picked to match your row.' },
  wheel: { name: 'Tower Call', cost: 900, desc: 'Spin the Galaxy Wheel right now.' },
};
export const ITEM_ORDER = ['quake', 'guard', 'turbo', 'rain', 'wheel'];

export function mulberry(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.seed = () => a >>> 0;
  f.set = (s) => { a = s >>> 0; };
  return f;
}

export const pusherFace = (t) => PMIN + (PMAX - PMIN) * (0.5 - 0.5 * Math.cos((t / PERIOD) * Math.PI * 2));
export const heroAtk = (lv) => 12 + 3 * lv;
export const xpNeed = (lv) => 2 + lv;
export function foeAt(idx) {
  const sec = SECTORS[Math.floor(idx / 5) % SECTORS.length];
  const kind = sec.foes[idx % 5];
  const boss = idx % 5 === 4;
  const hp = Math.round(150 * Math.pow(1.17, idx) * (boss ? 2.4 : 1));
  return { idx, kind, boss, hp, max: hp, name: FOE_NAME[kind], sector: Math.floor(idx / 5) };
}

let NEXT_ID = 1;
function mkCoin(k, x, y, z) {
  const K = KIND[k];
  return { id: NEXT_ID++, k, x, y, z, vx: 0, vy: 0, vz: 0, r: K.r, h: K.h, m: K.m, gr: false, sup: null, off: false, tw: false, mul: 1, rot: (NEXT_ID * 2.399) % (Math.PI * 2) };
}

// ------------------------------------------------------------------------------------------------ the machine
export class Field {
  constructor(rng) {
    this.rng = rng;
    this.t = 0;
    this.pf = pusherFace(0); this.pv = 0;
    this.coins = [];
    this.towers = [];
    this.events = [];
    this.grid = new Map();
    this.speed = 1;      // pusher speed (Turbo Push)
    this.guard = false;  // corner gutters closed (Wall Guard)
  }
  add(k, x, y, z) { const c = mkCoin(k, x, y, z); this.coins.push(c); return c; }

  // A fresh machine: a loose carpet of coins and a few tokens on the field, some coins on the shelf.
  seedCarpet(tokens = 9, extra = 30) {
    const r = this.rng;
    const free = (x, y, rr) => this.coins.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r + rr - 0.02);
    // tokens first, scattered
    for (let i = 0, tries = 0; i < tokens && tries < 500; tries++) {
      const x = 1.4 + r() * (W - 2.8), y = PMAX + 1.4 + r() * (FRONT - 3 - PMAX - 1.4);
      if (free(x, y, 1.25)) { this.add(COL[i % 3], x, y, 0); i++; }
    }
    // a hexagonal carpet of silver with a few holes
    for (let row = 0, y = PMAX + 1.05; y < FRONT - 1.1; row++, y += 1.78) {
      for (let x = 1.02 + (row % 2) * 1.02; x < W - 1; x += 2.04) {
        const jx = x + (r() - 0.5) * 0.12, jy = y + (r() - 0.5) * 0.12;
        if (r() < 0.1 || !free(jx, jy, 1)) continue;
        this.add('c', jx, jy, 0);
      }
    }
    // a loose second layer
    for (let i = 0; i < extra; i++) {
      const x = 1.2 + r() * (W - 2.4), y = PMAX + 1.2 + r() * (FRONT - 3.5 - PMAX);
      let z = 0; for (const o of this.coins) if (Math.hypot(o.x - x, o.y - y) < o.r + 1) z = Math.max(z, o.z + o.h);
      this.add('c', x, y, z + 0.01);
    }
    for (let i = 0; i < 10; i++) this.add('c', 1.5 + r() * (W - 3), 0.8 + r() * (PMIN - 0.6), PH + 0.01 + (i % 2) * 0.2);
    for (let i = 0; i < 240; i++) this.step(DT);   // let it settle
    this.events.length = 0;
  }

  // Uniform grid as linked lists in typed arrays (no per-step allocation). Cell size 2.6 covers the widest pair (two tokens).
  rebuildGrid() {
    const cs = this.coins, n = cs.length;
    if (!this.head) { this.GX = Math.ceil(W / CELL) + 2; this.GY = Math.ceil((FRONT + 12) / CELL) + 2; this.head = new Int32Array(this.GX * this.GY); }
    if (!this.next || this.next.length < n) this.next = new Int32Array(Math.max(512, n * 2));
    const head = this.head, next = this.next, GX = this.GX, GY = this.GY;
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      if (c.off) { c.cell = -1; continue; }
      let gx = Math.floor(c.x / CELL) + 1, gy = Math.floor((c.y + 4) / CELL) + 1;
      if (gx < 0) gx = 0; else if (gx >= GX) gx = GX - 1;
      if (gy < 0) gy = 0; else if (gy >= GY) gy = GY - 1;
      c.gx = gx; c.gy = gy;
      const k = gx + gy * GX; next[i] = head[k]; head[k] = i;
    }
  }

  step(dt) {
    const prev = this.pf;
    this.t += dt * this.speed;
    this.pf = pusherFace(this.t);
    this.pv = (this.pf - prev) / dt;
    const ev = this.events, cs = this.coins, n = cs.length, towers = this.towers;
    this.rebuildGrid();
    const head = this.head, next = this.next, GX = this.GX, GY = this.GY;

    // 1. vertical: find what each coin rests on, apply gravity, settle
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      if (c.off) { c.vz -= G * dt; c.z += c.vz * dt; c.x += c.vx * dt; c.y += c.vy * dt; continue; }
      const fl = c.y > FRONT ? -99 : (c.y < this.pf + c.r * 0.25 ? PH : 0);
      let top = fl, sup = null, slideX = 0, slideY = 0;
      const lim = c.z + c.h * 0.55 + 0.02;
      const y0 = c.gy > 0 ? c.gy - 1 : 0, y1 = c.gy < GY - 1 ? c.gy + 1 : GY - 1, x0 = c.gx > 0 ? c.gx - 1 : 0, x1 = c.gx < GX - 1 ? c.gx + 1 : GX - 1;
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        for (let j = head[gx + gy * GX]; j >= 0; j = next[j]) {
          if (j === i) continue;
          const o = cs[j];
          const ot = o.z + o.h;
          if (ot > lim) continue;                      // o is not below c
          const dx = c.x - o.x, dy = c.y - o.y, rs = c.r + o.r, d2 = dx * dx + dy * dy;
          if (d2 >= rs * rs) continue;
          const sr = o.r * 0.95 + c.r * 0.25;
          if (d2 < sr * sr) { if (ot > top) { top = ot; sup = o; } }
          else if (c.z > o.z + o.h * 0.4) { const d = Math.sqrt(d2) || 1e-4; const k = (rs - d) / (rs * d); slideX += dx * k; slideY += dy * k; }
        }
      }
      for (let ti = 0; ti < towers.length; ti++) {
        const T = towers[ti], tt = T.z + T.hgt;
        const dx = c.x - T.x, dy = c.y - T.y, d2 = dx * dx + dy * dy;
        if (tt > lim) continue;
        if (d2 < T.r * T.r * 0.81 && tt > top) { top = tt; sup = T; }
      }
      c.sup = sup;
      if (c.z <= top + 0.002) {
        if (c.vz < -6) { ev.push({ t: 'land', v: -c.vz, x: c.x, y: c.y, k: c.k }); c.vz = -c.vz * 0.18; c.z = top + 0.001; c.gr = false; }
        else { c.z = top; c.vz = 0; c.gr = true; }
      } else {
        c.gr = false; c.vz -= G * dt; c.z += c.vz * dt;
        if (c.z < top) { if (c.vz < -6) ev.push({ t: 'land', v: -c.vz, x: c.x, y: c.y, k: c.k }); c.z = top; c.vz = 0; c.gr = true; }
      }
      // 2. horizontal: friction pulls a resting coin toward the speed of what it rests on; slopes slide it off
      if (c.gr) {
        let tvx = 0, tvy = 0;
        if (sup) { tvx = sup.vx || 0; tvy = sup.vy || 0; } else if (fl === PH) { tvy = this.pv + 0.09; }   // the shelf tilts a hair forward: lone coins creep to its edge
        const f = Math.min(1, 14 * dt);
        c.vx += (tvx - c.vx) * f; c.vy += (tvy - c.vy) * f;
      }
      if (slideX || slideY) { c.vx += slideX * 30 * dt; c.vy += slideY * 30 * dt; }
      c.x += c.vx * dt; c.y += c.vy * dt;
    }

    // 3. sideways contacts (position based, two passes so pushes travel through the carpet)
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < n; i++) {
        const c = cs[i];
        if (c.off) continue;
        const y0 = c.gy > 0 ? c.gy - 1 : 0, y1 = c.gy < GY - 1 ? c.gy + 1 : GY - 1, x0 = c.gx > 0 ? c.gx - 1 : 0, x1 = c.gx < GX - 1 ? c.gx + 1 : GX - 1;
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
          for (let j = head[gx + gy * GX]; j >= 0; j = next[j]) {
            if (j <= i) continue;
            const o = cs[j];
            const dx = c.x - o.x, dy = c.y - o.y, rs = c.r + o.r;
            if (dx >= rs || dx <= -rs || dy >= rs || dy <= -rs) continue;
            const d2 = dx * dx + dy * dy; if (d2 >= rs * rs) continue;
            const ov = Math.min(c.z + c.h, o.z + o.h) - Math.max(c.z, o.z);
            if (ov < (c.h < o.h ? c.h : o.h) * 0.45) continue;
            const d = Math.sqrt(d2) || 1e-4;
            const nx = d2 ? dx / d : 1, ny = d2 ? dy / d : 0, pen = rs - d;
            const wi = o.m / (c.m + o.m), wj = 1 - wi;
            c.x += nx * pen * wi; c.y += ny * pen * wi; o.x -= nx * pen * wj; o.y -= ny * pen * wj;
            const vn = (c.vx - o.vx) * nx + (c.vy - o.vy) * ny;
            if (vn < 0) {
              c.vx -= nx * vn * wi; c.vy -= ny * vn * wi; o.vx += nx * vn * wj; o.vy += ny * vn * wj;
              if (vn < -5 && it === 0) ev.push({ t: 'clink', v: -vn, x: c.x, y: c.y });
            }
          }
        }
        // towers are heavy round blocks
        for (let ti = 0; ti < towers.length; ti++) {
          const T = towers[ti];
          const dx = c.x - T.x, dy = c.y - T.y, rs = c.r + T.r, d2 = dx * dx + dy * dy;
          if (d2 >= rs * rs || c.z >= T.z + T.hgt - 0.05 || c.z + c.h <= T.z) continue;
          const d = Math.sqrt(d2) || 1e-4, nx = dx / d, ny = dy / d, pen = rs - d;
          const wi = T.m / (c.m + T.m), wj = 1 - wi;
          c.x += nx * pen * wi; c.y += ny * pen * wi;
          T.x -= nx * pen * wj; T.y -= ny * pen * wj;
          if (T.state === 'stand') { T.stress += pen * wj; T.px += -nx * pen * wj; T.py += -ny * pen * wj; }
        }
        this.walls(c);
      }
    }
    for (const T of towers) this.towerWalls(T);

    // 4. edge: a coin whose centre is past the front edge drops; far below, it pays out
    let w = 0;
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      if (!c.off && c.y > FRONT && c.z < 0.5) {
        c.off = true; c.gut = !this.guard && (c.x < GUT || c.x > W - GUT);
        c.vy = Math.max(c.vy, 1.5);
      }
      if (c.off && c.z < -6) { ev.push({ t: c.gut ? 'lost' : 'pay', k: c.k, x: c.x, tw: c.tw, mul: c.mul }); continue; }
      if (!isFinite(c.x + c.y + c.z)) continue;   // never let a NaN coin live
      cs[w++] = c;
    }
    cs.length = w;
    this.stepTowers(dt);
  }

  walls(c) {
    if (c.off) return;
    if (c.x < c.r) { c.x = c.r; if (c.vx < 0) c.vx = -c.vx * 0.3; }
    if (c.x > W - c.r) { c.x = W - c.r; if (c.vx > 0) c.vx = -c.vx * 0.3; }
    if (c.y < BACK + c.r) { c.y = BACK + c.r; if (c.vy < 0) c.vy = 0; }
    // the pusher face: anything lower than the shelf and touching it is shoved forward
    if (c.z < PH - 0.03 && c.y - c.r < this.pf) { c.y = this.pf + c.r; if (c.vy < this.pv) c.vy = this.pv; }
  }
  towerWalls(T) {
    if (T.x < T.r) T.x = T.r; if (T.x > W - T.r) T.x = W - T.r;
    if (T.y - T.r < this.pf) { const dy = this.pf + T.r - T.y; T.y += dy; if (T.state === 'stand') { T.stress += dy; T.py += dy; } }
  }

  // ---------------------------------------------------------------- towers
  // A tower grows coin by coin (build), stands while the carpet shoves it (stress builds up),
  // then topples (fall) and turns into a shower of real coins.
  addTower(x, y, n, opt = {}) {
    const TR = RING_R + 1.0;
    for (const c of this.coins) { // make room: push coins away from the base
      if (c.off || c.z > 1.5) continue;
      const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy), need = TR + c.r + 0.05;
      if (d < need) { const k = need / (d || 1e-3); c.x = Math.max(c.r, Math.min(W - c.r, x + (d ? dx : 1) * k)); c.y = y + (d ? dy : 0) * k; }
    }
    const T = { x, y, z: 0, r: TR, m: 40, n: 0, want: n, layers: 0, hgt: 0, gold: !!opt.gold, col: opt.col || 'B', crown: opt.crown || [], state: 'build', bt: 0,
      twist0: this.rng() * Math.PI * 2, stress: 0, px: 0, py: 0, limit: 3.2 + this.rng() * 2.8 - Math.min(1.5, n / 600), ang: 0, dir: Math.PI / 2, ft: 0, frac: 0 };
    this.towers.push(T);
    this.events.push({ t: 'towerStart', T });
    return T;
  }
  stepTowers(dt) {
    const out = [];
    for (const T of this.towers) {
      if (T.state === 'build') {
        T.bt += dt;
        const dur = 1.5 + T.want / 450;                    // a 330 tower takes ~2.2 s, a 900 jackpot ~3.5 s
        const rate = (T.want / dur) * Math.min(1.6, 0.4 + T.bt / dur * 1.6);   // speeding up as it grows
        T.frac += rate * dt;
        const add = Math.floor(T.frac); T.frac -= add;
        const n = Math.min(T.want, T.n + add);
        const L0 = towerLayers(T.n), L1 = towerLayers(n);
        for (let l = L0; l < L1; l++) this.events.push({ t: 'towerCoin', i: l, n: towerLayers(T.want), T });
        T.n = n; T.layers = L1; T.hgt = L1 * TH_T;
        if (T.n >= T.want) { T.state = 'stand'; T.stress = 0; T.px = 0; T.py = 0; this.events.push({ t: 'towerDone', T }); }
        out.push(T); continue;
      }
      if (T.state === 'stand') {
        T.wob = Math.min(1, T.stress / T.limit);
        if (T.stress > T.limit || T.y > FRONT - T.r - 0.5) {
          T.state = 'teeter'; T.ft = 0; T.ang = 0; T.av = 0.15;
          const push = Math.atan2(T.py, T.px);
          const fwd = Math.PI / 2;
          let a = isFinite(push) && (T.px || T.py) ? push * 0.4 + fwd * 0.6 : fwd;
          a += (this.rng() - 0.5) * 0.7;
          T.dir = Math.max(fwd - 0.75, Math.min(fwd + 0.75, a));
          this.events.push({ t: 'topple', T });
        }
        out.push(T); continue;
      }
      if (T.state === 'teeter') {   // it rocks for a moment, then goes
        T.ft += dt;
        T.ang = Math.max(0, Math.sin(T.ft * 14) * 0.04 * (1 + T.ft * 2));
        if (T.ft > 0.8) { T.state = 'fall'; T.ft = 0; T.ang = 0.05; T.av = 0.15; this.events.push({ t: 'fall', T }); }
        out.push(T); continue;
      }
      if (T.state === 'fall') {
        T.ft += dt;
        T.av += (0.6 + 4.5 * Math.sin(T.ang)) * dt * Math.min(1.4, 6 / Math.max(4, T.hgt));
        T.ang += T.av * dt;
        if (T.ang >= 1.05) { this.burst(T); continue; }
        out.push(T); continue;
      }
    }
    this.towers = out;
  }
  // where coin i of a tower sits (tower-local, untilted): offset across the ground and height
  static ringPos(T, i) {
    const k = Math.floor(i / RING_N), j = i % RING_N, a = T.twist0 + k * TWIST + (j * Math.PI * 2) / RING_N;
    return [Math.cos(a) * RING_R, Math.sin(a) * RING_R, k * TH_T];
  }
  // The toppled tower becomes coins: each coin keeps where the tipping column put it and how fast it was swinging.
  // Coins that fly past the edge drop at once; the field keeps at most FIELD_CAP loose coins, extra ones merge (worth more).
  burst(T) {
    const r = this.rng, dx = Math.cos(T.dir), dy = Math.sin(T.dir), sa = Math.sin(T.ang), ca = Math.cos(T.ang);
    let live = 0; for (const c of this.coins) if (!c.off) live++;
    const kept = [];
    const make = (k, ox, oy, hz) => {
      const od = ox * dx + oy * dy, op = -ox * dy + oy * dx;
      const along = hz * sa + od * ca, z = Math.max(0.05, hz * ca - od * sa + 0.1);
      let x = T.x + dx * along - dy * op, y = T.y + dy * along + dx * op;
      x = Math.max(1, Math.min(W - 1, x)); if (y < BACK + 1) y = BACK + 1;
      const v = T.av * Math.hypot(hz, od) * 0.9;
      if (y < FRONT && live >= FIELD_CAP && kept.length && !isToken(k)) { kept[Math.floor(r() * kept.length)].mul++; return; }
      const c = this.add(k, x, y, z);
      c.vx = dx * v * ca + (r() - 0.5) * 3; c.vy = dy * v * ca + (r() - 0.5) * 3; c.vz = -v * sa * 0.25 + r() * 3;
      c.tw = true;
      if (y >= FRONT) { c.off = true; c.gut = !this.guard && (x < GUT || x > W - GUT); c.vy = Math.max(c.vy, 2); }
      else { live++; kept.push(c); }
    };
    for (let i = 0; i < T.n; i++) { const [ox, oy, hz] = Field.ringPos(T, i); make(T.gold ? 'g' : 'c', ox, oy, hz + TH_T / 2); }
    T.crown.forEach((k, i) => make(k, (i - (T.crown.length - 1) / 2) * 1.3, 0, T.hgt + 0.2));
    this.events.push({ t: 'burst', T, n: T.n });
  }

  // fire one coin (or token) from the chute at the back, aim 0..1 across the machine
  drop(k, aim) {
    const r = this.rng, rr = KIND[k].r;
    const x = rr + 0.2 + Math.max(0, Math.min(1, aim)) * (W - 2 * rr - 0.4);
    const c = this.add(k, x, BACK + rr + 0.05, CHUTE_Z);
    c.vy = 2.2 + r() * 2.2; c.vx = (r() - 0.5) * 1.2; c.vz = 1.5;
    return c;
  }
  quake() {
    const r = this.rng;
    for (const c of this.coins) { if (c.off) continue; c.vy += 2.2 + r() * 2.2; c.vx += (r() - 0.5) * 2.5; c.vz += 2 + r() * 3; c.gr = false; }
    for (const T of this.towers) if (T.state === 'stand') T.stress += T.limit * 0.35;
    this.events.push({ t: 'quake' });
  }
  count(fn) { let n = 0; for (const c of this.coins) if (fn(c)) n++; return n; }
}

// ------------------------------------------------------------------------------------------------ the game
export class Game {
  constructor(seed = 1) {
    this.rng = mulberry(seed);
    this.f = new Field(this.rng);
    this.bank = 120;
    this.row = [];
    this.heroes = HEROES.map((h) => ({ id: h.id, col: h.col, lv: 1, xp: 0 }));
    this.foeIdx = 0;
    this.foe = foeAt(0);
    this.energy = 0;
    this.fever = 0;
    this.wheelQ = 0;        // wheels waiting to be spun
    this.pendingDmg = 0;    // damage dealt while no enemy stood (hits the next one)
    this.fireCd = 0;
    this.regen = 0;
    this.out = [];          // game events for the presentation layer
    this.stats = { shots: 0, paid: 0, lost: 0, tokens: 0, attacks: 0, kills: 0, towers: 0, best: 0, jp: 0, items: 0 };
    this.time = 0;
    this.tokenEvery = 0;
    this.guardT = 0; this.turboT = 0;
  }
  newMachine() { this.f.seedCarpet(); }
  hero(col) { return this.heroes.find((h) => h.col === col); }
  atk(col) { return heroAtk(this.hero(col).lv); }

  canFire() { return this.bank >= 1 && this.fireCd <= 0; }
  fire(aim) {
    if (!this.canFire()) return false;
    this.bank -= 1; this.fireCd = FIRE_GAP; this.stats.shots++;
    this.f.drop('c', aim);
    // the machine adds a bonus token now and then (about one in six shots, never twice in a row)
    this.tokenEvery++;
    if (this.tokenEvery >= 4 && this.rng() < 0.2) {
      this.tokenEvery = 0;
      const k = COL[Math.floor(this.rng() * 3)];
      this.f.drop(k, this.rng());
      this.out.push({ t: 'tokenDrop', k });
    }
    this.out.push({ t: 'fire', aim });
    return true;
  }

  tick(dt) {
    this.time += dt;
    this.fireCd -= dt;
    if (this.fever > 0) { this.fever -= dt; if (this.fever <= 0) { this.fever = 0; this.out.push({ t: 'feverEnd' }); } }
    if (this.guardT > 0) { this.guardT = Math.max(0, this.guardT - dt); if (!this.guardT) this.out.push({ t: 'itemEnd', id: 'guard' }); }
    if (this.turboT > 0) { this.turboT = Math.max(0, this.turboT - dt); if (!this.turboT) this.out.push({ t: 'itemEnd', id: 'turbo' }); }
    this.f.guard = this.guardT > 0; this.f.speed = this.turboT > 0 ? 2 : 1;
    if (this.bank < REGEN_BELOW) { this.regen += dt; if (this.regen >= REGEN_EVERY) { this.regen = 0; this.bank++; this.out.push({ t: 'regen' }); } } else this.regen = 0;
    let acc = dt;
    while (acc > 1e-9) { const s = Math.min(DT, acc); this.f.step(s); acc -= s; this.consume(); }
  }

  consume() {
    const ev = this.f.events;
    for (const e of ev) {
      if (e.t === 'pay') {
        if (isToken(e.k)) { this.stats.tokens++; this.addEnergy(4); this.out.push({ t: 'payToken', k: e.k, x: e.x }); this.pushToken(e.k); }
        else {
          const v = KIND[e.k].v * (e.mul || 1) * (this.fever > 0 ? 2 : 1);
          this.bank += v; this.stats.paid += v; this.addEnergy(e.tw ? 0.2 : 0.15);   // knocked-down tower coins charge the ring fastest
          this.out.push({ t: 'pay', k: e.k, x: e.x, v, tw: e.tw, mul: e.mul || 1 });
          if (!e.tw) this.damage(this.fever > 0 ? 2 : 1, 'chip', null);   // every won coin is a laser shot (tower spills only pay)
        }
      } else if (e.t === 'lost') { this.stats.lost++; this.out.push({ t: 'lost', k: e.k, x: e.x }); }
      else this.out.push(e);
    }
    ev.length = 0;
  }

  addEnergy(n) {
    if (this.fever > 0) return;
    this.energy += n;
    if (this.energy >= ENERGY_MAX) { this.energy = 0; this.fever = FEVER_TIME; this.out.push({ t: 'fever' }); }
  }

  pushToken(k) {
    this.row.push(k);
    const n = this.row.filter((x) => x === k).length;
    if (n >= 3) {
      let left = 3; this.row = this.row.filter((x) => !(x === k && left-- > 0));
      this.attack(k);
    } else if (this.row.length >= ROW) {
      this.row = [];
      this.out.push({ t: 'team' });
      for (const h of this.heroes) this.damage(heroAtk(h.lv) * (this.fever > 0 ? 2 : 1), 'team', h.col);
      this.bonusCoins(2);
    }
  }

  attack(col) {
    const h = this.hero(col);
    const dmg = heroAtk(h.lv) * 3 * (this.fever > 0 ? 2 : 1);
    this.stats.attacks++;
    this.out.push({ t: 'attack', col, dmg, lv: h.lv });
    this.damage(dmg, 'attack', col);
    h.xp++;
    if (h.xp >= xpNeed(h.lv)) { h.xp = 0; h.lv++; this.out.push({ t: 'levelUp', col, lv: h.lv }); }
    this.bonusCoins(3);   // every attack rains a few bonus coins into the machine
  }

  // Tower Call gets dearer as the enemies (and the towers' value to you) grow
  itemCost(id) { const I = ITEMS[id]; return !I ? Infinity : id === 'wheel' ? I.cost + 150 * this.foeIdx : I.cost; }
  canBuy(id) { return this.bank >= this.itemCost(id); }
  buy(id) {
    if (!this.canBuy(id)) return false;
    this.bank -= this.itemCost(id);
    if (id === 'quake') this.f.quake();
    else if (id === 'guard') this.guardT += ITEMS.guard.dur;
    else if (id === 'turbo') this.turboT += ITEMS.turbo.dur;
    else if (id === 'rain') {
      // the colour you hold most of comes first, so the rain tends to finish a set
      const cnt = { B: 0, P: 0, Y: 0 }; for (const k of this.row) cnt[k]++;
      const best = COL.slice().sort((a, b) => cnt[b] - cnt[a] || this.rng() - 0.5);
      [best[0], best[0], best[1]].forEach((k) => this.f.drop(k, 0.15 + this.rng() * 0.7));
    } else if (id === 'wheel') this.wheelQ++;
    this.stats.items = (this.stats.items || 0) + 1;
    this.out.push({ t: 'item', id });
    return true;
  }

  bonusCoins(n) {
    for (let i = 0; i < n; i++) this.f.drop('c', this.rng());
    this.out.push({ t: 'bonus', n });
  }

  damage(n, src, col) {
    if (!this.foe) { this.pendingDmg += n; return; }
    this.foe.hp -= n;
    this.out.push({ t: 'hit', n, src, col });
    if (this.foe.hp <= 0) {
      this.foe.hp = 0;
      this.stats.kills++;
      this.out.push({ t: 'kill', foe: this.foe });
      if (this.foe.boss) { const prize = 200 + 100 * this.foe.sector; this.bank += prize; this.out.push({ t: 'sector', n: this.foe.sector + 1, prize }); }
      this.foe = null;
      this.wheelQ++;
    }
  }

  // the wheel: pick a pocket now (the ball animation is aimed at it), resolve after the animation
  spinWheel() {
    if (this.wheelQ <= 0) return -1;
    this.wheelQ--;
    return Math.floor(this.rng() * WHEEL.length);
  }
  resolveWheel(i) {
    const P = WHEEL[i];
    this.stats.towers++;
    if (P.c === 'JP') this.stats.jp++;
    if (P.lv) for (const h of this.heroes) { h.lv++; h.xp = 0; this.out.push({ t: 'levelUp', col: h.col, lv: h.lv }); }
    const n = TOWER[P.c];
    const crown = P.c === 'JP' ? ['B', 'P', 'Y'] : [P.c, P.c];
    const x = 5 + this.rng() * (W - 10);
    const y = PMAX + 3.2 + this.rng() * 1.5;
    this.f.addTower(x, y, n, { gold: !!P.x2 || P.c === 'JP', col: P.c, crown });
    this.out.push({ t: 'tower', P, n });
    this.nextFoe();
  }
  nextFoe() {
    if (this.foe || this.wheelQ > 0) return;
    this.foeIdx++;
    this.foe = foeAt(this.foeIdx);
    this.out.push({ t: 'foe', foe: this.foe });
    if (this.pendingDmg > 0) { const d = this.pendingDmg; this.pendingDmg = 0; this.damage(d, 'carry', null); }
  }

  // ---------------------------------------------------------------- saves
  save() {
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      v: 1, bank: this.bank, row: this.row.slice(), heroes: this.heroes.map((h) => ({ ...h })), foeIdx: this.foeIdx,
      foe: this.foe ? { hp: this.foe.hp } : null, energy: this.energy, fever: r2(this.fever), wheelQ: this.wheelQ, pendingDmg: this.pendingDmg,
      stats: { ...this.stats }, t: r2(this.f.t), seed: this.rng.seed(), guardT: r2(this.guardT), turboT: r2(this.turboT),
      coins: this.f.coins.filter((c) => !c.off).map((c) => (c.mul > 1 ? [c.k, r2(c.x), r2(c.y), r2(c.z), c.mul] : [c.k, r2(c.x), r2(c.y), r2(c.z)])),
      towers: this.f.towers.map((T) => [r2(T.x), r2(T.y), T.want, T.gold ? 1 : 0, T.col, T.crown.join(''), r2(T.twist0)]),
    };
  }
  static load(s, fallbackSeed = 1) {
    const g = new Game(fallbackSeed);
    if (!s || s.v !== 1 || !Array.isArray(s.coins)) return null;
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    g.bank = Math.max(0, Math.floor(num(s.bank, 120)));
    g.row = (Array.isArray(s.row) ? s.row : []).filter(isToken).slice(0, ROW - 1);
    if (Array.isArray(s.heroes)) g.heroes.forEach((h, i) => { const o = s.heroes[i]; if (o) { h.lv = Math.max(1, Math.floor(num(o.lv, 1))); h.xp = Math.max(0, Math.floor(num(o.xp, 0))); } });
    g.foeIdx = Math.max(0, Math.floor(num(s.foeIdx, 0)));
    g.wheelQ = Math.max(0, Math.floor(num(s.wheelQ, 0)));
    g.foe = s.foe ? foeAt(g.foeIdx) : null;
    if (g.foe) g.foe.hp = Math.max(1, Math.min(g.foe.max, num(s.foe.hp, g.foe.max)));
    if (!g.foe && g.wheelQ === 0) { g.foeIdx++; g.foe = foeAt(g.foeIdx); }
    g.energy = Math.max(0, Math.min(ENERGY_MAX - 1, num(s.energy, 0)));
    g.fever = Math.max(0, Math.min(FEVER_TIME, num(s.fever, 0)));
    g.pendingDmg = Math.max(0, num(s.pendingDmg, 0));
    g.guardT = Math.max(0, Math.min(600, num(s.guardT, 0))); g.turboT = Math.max(0, Math.min(600, num(s.turboT, 0)));
    if (s.stats) for (const k in g.stats) g.stats[k] = num(s.stats[k], 0);
    if (s.seed) g.rng.set(s.seed);
    g.f.t = num(s.t, 0); g.f.pf = pusherFace(g.f.t);
    for (const a of s.coins) {
      if (!Array.isArray(a) || !KIND[a[0]]) continue;
      const [k, x, y, z] = a; if (![x, y, z].every((v) => typeof v === 'number' && isFinite(v))) continue;
      if (y > FRONT || y < 0 || x < 0 || x > W) continue;
      const c = g.f.add(k, x, y, Math.max(0, z));
      if (typeof a[4] === 'number' && a[4] > 1) c.mul = Math.min(50, Math.floor(a[4]));
    }
    for (const a of (s.towers || [])) {
      if (!Array.isArray(a)) continue;
      const T = g.f.addTower(num(a[0], W / 2), num(a[1], 10), Math.max(1, Math.min(1000, Math.floor(num(a[2], 330)))), { gold: !!a[3], col: a[4] || 'B', crown: String(a[5] || '').split('').filter(isToken) });
      T.n = T.want; T.layers = towerLayers(T.n); T.hgt = T.layers * TH_T; T.state = 'stand'; T.twist0 = num(a[6], 0);
    }
    g.f.events.length = 0;
    return g;
  }
}
