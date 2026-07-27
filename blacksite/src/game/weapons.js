// Weapons — the roster, the firing state machine, spread and recoil.
//
// Three ideas hold this together.
//
// **The gun is a state machine, not a cooldown.** Reloading, swapping, pumping
// and raising the weapon out of a sprint are all states with their own timing,
// and every one of them is interruptible in the ways a player expects and
// uninterruptible in the ways they expect too. Half of how a shooter feels is
// what it lets you cancel.
//
// **Recoil is a path you learn, not dice you roll.** Each shot walks a fixed
// per-weapon pattern — a vertical climb that is steep for the first few rounds
// and then plateaus, plus a horizontal walk read out of a table — with only a
// small random collar on top. Hold the trigger down twice and the second burst
// goes where the first one did. When you stop, the view returns to the point you
// were aiming at before the string started, so control is a matter of riding the
// pattern rather than fighting a spring back to centre.
//
// **Spread is a state, not a constant.** Standing still, crouched, down the
// sights, the cone is a few hundredths of a degree; sprinting, airborne and
// twenty rounds into a mag dump it is wider than a man at 30 m. The player never
// sees the number, they see that a gun rewards them for standing still.
//
// Damage numbers are quoted against a 100 hp trooper throughout, because that is
// the only unit that matters: how many rounds and how many milliseconds.
//
// Pure simulation. No Three.js, no DOM — the headless suite drives this module
// directly and asserts on `G.events`.

import * as C from '../core/constants.js';
import { emit, clamp, lerp, lookDir, vec3 } from '../core/state.js';
import { fireBullet, damageAtRange } from './ballistics.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// ── recoil patterns ──────────────────────────────────────────────────────────
//
// Signed horizontal steps, −1..1, read one per shot and wrapped. The shape is
// the weapon's signature: the carbine leans right and then sweeps back left in a
// long lazy eight you can trace with the mouse, the SMG snaps side to side much
// faster than a hand can follow, the battle rifle barely moves inside a burst.

const PAT_CARBINE = [
  0, 0.10, 0.38, 0.68, 0.90, 0.96, 0.72, 0.28,
  -0.24, -0.66, -0.92, -1.00, -0.86, -0.50, -0.06, 0.36,
  0.74, 0.94, 0.80, 0.42, -0.04, -0.48, -0.82, -0.98,
  -0.88, -0.54, -0.12, 0.34, 0.70, 0.92,
];

const PAT_SMG = [
  0, 0.32, 0.78, 0.34, -0.42, -0.88, -0.30, 0.46,
  0.92, 0.50, -0.18, -0.74, -0.96, -0.36, 0.40, 0.86,
  0.44, -0.26, -0.80, -0.94, -0.40, 0.24, 0.72, 0.98,
  0.56, -0.14, -0.68, -0.90, -0.48, 0.18, 0.64, 0.88,
];

const PAT_BURST = [0, 0.22, -0.30, 0.14, 0.34, -0.18];
const PAT_SEMI = [0, 0.45, -0.55, 0.30, -0.35, 0.60, -0.25];
const PAT_SLUG = [0, 0.6, -0.7, 0.4, -0.5];

// ── the roster ───────────────────────────────────────────────────────────────

export const WEAPONS = {

  // The measuring stick. 720 rpm and 26 damage is a four-shot kill in 250 ms:
  // deliberately slower than the SMG's 240 ms up close, and — because 26 only
  // decays to 20 across a 22 m band — a five-shot 333 ms kill at 40 m where the
  // SMG needs ten rounds and 540 ms. Everything else in the roster is described
  // by how it differs from this.
  rifle: {
    id: 'rifle', name: 'MK-7 Carbine', class: 'AR', mode: 'auto',
    rpm: 720, mag: 30, reserve: 210, reserveMax: 300, pellets: 1,
    dmg: { near: 26, far: 20, d0: 26, d1: 48 },
    pen: 1.0, range: 220, zoom: 1.35,
    adsTime: 0.24, sprintOut: 0.18,
    swap: { holster: 0.24, draw: 0.42 },
    reload: { tac: 2.05, empty: 2.60, magout: 0.55, magin: 1.35 },
    spread: {
      hip: 2.6, ads: 0.14, move: 1.7, air: 3.6, crouch: 0.76, sprintMul: 2.2,
      // Bloom has to out-run its own decay while the trigger is down or the
      // cone is decorative: 12 rounds a second at 0.34 is +4.1°/s against
      // −2.6°/s, so a held trigger reaches the 3.2° cap about 25 rounds in and
      // is clean again 1.2 s after you let go.
      perShot: 0.34, bloomMax: 3.2, decay: 2.6, max: 8.0,
    },
    recoil: {
      // A 1° first shot settling to 0.30° a round, and about 10° of climb by
      // the end of a mag — roughly 1.8 m at 10 m, which is exactly how much
      // pull-down a full spray is meant to cost. Across seeds the path varies
      // by a tenth of a degree, so it is a shape you memorise, not a dice roll.
      up: 0.30, first: 3.4, settle: 2.6, horiz: 0.30, pattern: PAT_CARBINE,
      // `delay` sits just above the 0.083 s cycle: recovery never leaks in
      // between rounds of a burst, so a held trigger climbs the pattern instead
      // of settling onto a plateau you cannot read.
      rand: 0.13, stiff: 300, damp: 0.78, recover: 13, delay: 0.10, reset: 0.30,
      kick: 0.55, shake: 0.045, adsMul: 0.70, maxUp: 10, maxSide: 5,
    },
  },

  // Wins the doorway and loses the courtyard, on purpose. 1000 rpm and 23
  // damage is five rounds in 240 ms, but the plateau ends at 10 m and the floor
  // is 11 — past 28 m it is a ten-round kill even if every one of them lands,
  // and the 0.30° sight floor means they will not. What you buy is the 0.16 s
  // ADS and the tightest hip-fire cone in the game: it is the only primary you
  // can fight with without aiming.
  smg: {
    id: 'smg', name: 'VK-9 Sting', class: 'SMG', mode: 'auto',
    rpm: 1000, mag: 32, reserve: 224, reserveMax: 320, pellets: 1,
    dmg: { near: 23, far: 11, d0: 10, d1: 28 },
    pen: 0.60, range: 120, zoom: 1.15,
    adsTime: 0.16, sprintOut: 0.10,
    swap: { holster: 0.17, draw: 0.30 },
    reload: { tac: 1.75, empty: 2.20, magout: 0.45, magin: 1.15 },
    spread: {
      hip: 1.9, ads: 0.30, move: 0.85, air: 3.0, crouch: 0.82, sprintMul: 2.0,
      perShot: 0.26, bloomMax: 3.6, decay: 3.0, max: 9.0,
    },
    recoil: {
      // Less climb per shot than the carbine but 40% more shots per second, so
      // the same degrees per second arrive in twice as many, twice as jittery
      // steps. Learnable in the first half of the mag, a wall after that.
      up: 0.22, first: 3.0, settle: 3.0, horiz: 0.42, pattern: PAT_SMG,
      rand: 0.26, stiff: 340, damp: 0.80, recover: 15, delay: 0.075, reset: 0.26,
      kick: 0.40, shake: 0.032, adsMul: 0.74, maxUp: 9, maxSide: 6,
    },
  },

  // Two shots to the chest anywhere inside 60 m, one to the head — 55 × 1.9 is
  // 104. The 275 rpm cap makes that a 218 ms kill, faster than the carbine, and
  // the whole rest of the sheet exists to make you pay for it: twelve rounds, a
  // 0.34 s ADS, a hip-fire cone you cannot hit a doorway with, and 0.55° of
  // bloom per shot so a panicked double-tap at range throws the second round
  // wide. Pace it and it is the best gun here; rush it and it is the worst.
  dmr: {
    id: 'dmr', name: 'DM-12 Kestrel', class: 'DMR', mode: 'semi',
    rpm: 275, mag: 12, reserve: 84, reserveMax: 120, pellets: 1,
    dmg: { near: 55, far: 44, d0: 60, d1: 100 },
    pen: 1.9, range: 300, zoom: 2.4,
    adsTime: 0.34, sprintOut: 0.26,
    swap: { holster: 0.30, draw: 0.52 },
    reload: { tac: 2.45, empty: 3.05, magout: 0.70, magin: 1.65 },
    spread: {
      hip: 4.6, ads: 0.03, move: 2.6, air: 5.5, crouch: 0.62, sprintMul: 2.4,
      perShot: 0.55, bloomMax: 4.0, decay: 2.6, max: 10.0,
    },
    recoil: {
      // One big punch per shot with a fast, complete recovery. At the rpm cap
      // the view has settled by the time the trigger resets, so the pattern is
      // effectively "aim, click, aim" — which is the whole point of a marksman
      // rifle and the reason its `first` multiplier is 1.
      up: 1.35, first: 1.0, settle: 1, horiz: 0.30, pattern: PAT_SEMI,
      rand: 0.28, stiff: 240, damp: 0.70, recover: 9.5, delay: 0.12, reset: 0.45,
      kick: 1.00, shake: 0.10, adsMul: 0.80, maxUp: 6, maxSide: 4,
    },
  },

  // Nine pellets, twelve each: 108 inside 8 m, which is a one-shot kill only if
  // the whole pattern lands on one body. The floor is 3 — at 25 m a perfect
  // pattern does 27 — and 0.35 penetration means the pellets die in the first
  // wall they meet. The 0.8 s pump is the real cost: miss and you are holding a
  // stick. Shell-by-shell reload, cancellable at any point, so a half-full tube
  // is a decision rather than a punishment.
  shotgun: {
    id: 'shotgun', name: 'S-870 Breacher', class: 'SG', mode: 'pump',
    rpm: 75, mag: 7, reserve: 42, reserveMax: 60, pellets: 9, pump: 0.55,
    dmg: { near: 12, far: 3, d0: 8, d1: 22 },
    pen: 0.35, range: 60, zoom: 1.0,
    adsTime: 0.26, sprintOut: 0.20,
    swap: { holster: 0.28, draw: 0.46 },
    reloadMode: 'shell',
    reload: { start: 0.42, shell: 0.48, end: 0.40, cancel: 0.22 },
    spread: {
      // For a shotgun the cone *is* the weapon: this is the pattern radius, not
      // an error term. 3.6° puts the outer ring 0.28 m off axis at 5 m — the
      // whole rosette on a torso — and 0.5 m at 9 m, where half of it starts
      // going past him. Choking to 2.0° down the sights buys back about four
      // metres of that, which is the reason to aim a shotgun at all.
      hip: 3.6, ads: 2.0, move: 1.2, air: 2.2, crouch: 0.88, sprintMul: 1.5,
      perShot: 0.0, bloomMax: 0, decay: 6, max: 12,
      ring: [0.45, 0.88], jitter: 0.18,
    },
    recoil: {
      up: 2.60, first: 1.0, settle: 1, horiz: 0.50, pattern: PAT_SLUG,
      rand: 0.30, stiff: 210, damp: 0.66, recover: 8, delay: 0.14, reset: 0.5,
      kick: 1.60, shake: 0.16, adsMul: 0.86, maxUp: 6, maxSide: 5,
    },
  },

  // The panic button. A 0.14 s holster and a 0.22 s draw make swapping to it
  // faster than reloading anything, and 28 damage is a four-shot 400 ms kill
  // inside 14 m — losing to every primary, beating an empty one. Falls off a
  // cliff to 15 past 34 m and only penetrates the thinnest cover, so it never
  // becomes the gun you *choose*.
  pistol: {
    id: 'pistol', name: 'M9 Warden', class: 'PISTOL', mode: 'semi',
    rpm: 450, mag: 15, reserve: 90, reserveMax: 150, pellets: 1,
    dmg: { near: 28, far: 15, d0: 14, d1: 34 },
    pen: 0.55, range: 120, zoom: 1.20,
    adsTime: 0.15, sprintOut: 0.08,
    swap: { holster: 0.14, draw: 0.22 },
    reload: { tac: 1.55, empty: 2.05, magout: 0.40, magin: 0.95 },
    spread: {
      // Huge bloom per shot against an equally huge decay: pace the trigger and
      // the sidearm is precise, empty it as fast as you can click and the last
      // rounds go anywhere. That is the only thing keeping it out of the
      // primary slot.
      hip: 2.2, ads: 0.10, move: 1.3, air: 3.0, crouch: 0.72, sprintMul: 1.8,
      perShot: 0.62, bloomMax: 3.4, decay: 5.0, max: 8.0,
    },
    recoil: {
      up: 0.95, first: 1.15, settle: 2.0, horiz: 0.35, pattern: PAT_SEMI,
      rand: 0.30, stiff: 280, damp: 0.72, recover: 16, delay: 0.08, reset: 0.35,
      kick: 0.70, shake: 0.06, adsMul: 0.78, maxUp: 7, maxSide: 5,
    },
  },

  // Three rounds at 900 rpm is 102 damage in 133 ms — a one-burst kill inside
  // 32 m, the fastest in the game. The 0.26 s lockout after each burst is the
  // price: land it and nothing beats you, drop one round and the trooper gets a
  // third of a second of free fire. 1.3 penetration and a 25 damage floor keep
  // it honest at range where the carbine has already given up.
  burst: {
    id: 'burst', name: 'SG-3 Talon', class: 'BR', mode: 'burst',
    rpm: 900, burst: 3, burstDelay: 0.26,
    mag: 24, reserve: 168, reserveMax: 240, pellets: 1,
    dmg: { near: 34, far: 25, d0: 32, d1: 62 },
    pen: 1.3, range: 260, zoom: 1.60,
    adsTime: 0.27, sprintOut: 0.20,
    swap: { holster: 0.26, draw: 0.44 },
    reload: { tac: 2.20, empty: 2.75, magout: 0.60, magin: 1.45 },
    spread: {
      hip: 3.2, ads: 0.09, move: 1.9, air: 4.0, crouch: 0.70, sprintMul: 2.2,
      // One burst adds 0.9° of cone and the lockout decays 0.83° of it, so
      // sustained bursts creep rather than stack.
      perShot: 0.30, bloomMax: 2.4, decay: 3.2, max: 8.5,
    },
    recoil: {
      // Vertical inside the burst, almost no horizontal, then a full recovery
      // before the next one is available. The whole burst arrives as one shove
      // you can pre-aim under: 2.4° across three rounds, gone before the lockout
      // is.
      up: 0.55, first: 1.9, settle: 2.0, horiz: 0.16, pattern: PAT_BURST,
      // Above the 0.067 s in-burst cycle and far below the 0.26 s lockout: the
      // three rounds stack, the gap between bursts wipes the slate.
      rand: 0.12, stiff: 320, damp: 0.76, recover: 14, delay: 0.09, reset: 0.30,
      kick: 0.75, shake: 0.07, adsMul: 0.72, maxUp: 7, maxSide: 4,
    },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

// Carbine, breacher, sidearm: one gun for the corridor, one for the room, one
// for when both are empty.
export const DEFAULT_LOADOUT = ['rifle', 'shotgun', 'pistol'];

// ── construction ─────────────────────────────────────────────────────────────

// A runtime weapon is the definition plus its mutable state. The definition's
// sub-objects are shared by reference and never written to, so two simulations
// can hold the same roster without leaking into each other.
export function makeWeapon(def) {
  if (!def) return null;
  const w = Object.assign({}, def);
  w.ammo = def.mag;
  w.res = def.reserve;
  w.cool = 0;            // negative means the gun has been ready for that long
  w.bloom = 0;           // degrees of spread earned by firing
  w.buffer = 0;          // buffered trigger press, for semi and burst
  w.state = 'idle';      // idle | reload
  w.phase = '';          // reload sub-phase
  w.phaseT = 0;
  w.reloadT = 0;
  w.reloadDur = 0;
  w.reloadFlags = 0;     // bit 1 magout emitted, bit 2 magin emitted
  w.chambered = false;
  w.bolt = false;        // held open after the last round — the empty reload
  w.burstLeft = 0;
  w.pumpT = 0;
  w.raiseT = 0;          // weapon coming back up out of a sprint
  w.shotIndex = 0;       // position in the recoil pattern
  w.lastShot = -99;
  w.dry = false;
  // Flat mirrors of the nested tuning blocks, refreshed every step. The HUD and
  // the viewmodel want single numbers — a crosshair gap, a reload arc — and
  // should not have to know the shape of a spread table to get them.
  w.spreadBase = def.spread.hip;
  w.spreadDeg = def.spread.hip;
  w.spreadMax = def.spread.max;
  w.reloadTime = def.reloadMode === 'shell'
    ? def.reload.start + def.reload.shell * def.mag + def.reload.end
    : def.reload.tac;
  w.reloading = 0;       // seconds left on the current reload, 0 when idle
  w.reloadFrac = 0;      // 0..1 through it
  return w;
}

export function createWeapons(G, loadout = DEFAULT_LOADOUT) {
  const W = G.weapons;
  W.slots = loadout.map((id) => makeWeapon(WEAPONS[id])).filter(Boolean);
  W.active = 0;
  W.pending = -1;
  W.swapT = 0;
  W.swapPhase = '';
  W.shotId = 0;
  W.triggerHeld = false;
  W.adsHeld = false;
  // The recoil *target*: where the pattern has pushed the aim so far. `G.recoil`
  // is the view chasing this, which is what gives a shot its snap and its
  // settle. Recovery walks this back to zero, not the view directly.
  W.aim = { pitch: 0, yaw: 0 };
  G.recoil.pitch = 0; G.recoil.yaw = 0;
  G.recoil.vPitch = 0; G.recoil.vYaw = 0;
  G.recoil.kick = 0; G.recoil.vKick = 0; G.recoil.shot = 0;
  G.player.ads = 0;
  return W;
}

// Hands the player a different gun in a slot. The director and the level use
// this; it keeps the reserve if the same weapon is picked up again.
export function giveWeapon(G, id, slot = G.weapons.active) {
  const def = WEAPONS[id];
  if (!def) return null;
  const W = G.weapons;
  const existing = W.slots[slot];
  const w = makeWeapon(def);
  if (existing && existing.id === id) {
    w.ammo = existing.ammo;
    w.res = Math.min(def.reserveMax, existing.res + def.mag);
  }
  W.slots[slot] = w;
  if (slot === W.active) { W.swapT = def.swap.draw; W.swapPhase = 'draw'; }
  return w;
}

export function setLoadout(G, ids) {
  createWeapons(G, ids);
  return G.weapons;
}

export function activeWeapon(G) { return G.weapons.slots[G.weapons.active] || null; }

// ── spread ───────────────────────────────────────────────────────────────────

// Cone half-angle in radians. Everything the player is doing with their legs
// shows up here, which is why the movement kit and the gunplay read as one
// system rather than two.
export function currentSpread(G, w) {
  const p = G.player;
  const s = w.spread;
  let deg = lerp(s.hip, s.ads, p.ads);
  const speed = Math.hypot(p.vel.x, p.vel.z);
  // Moving costs less down the sights: walking a corner while aimed is a thing
  // you should be able to do, jogging while hip-firing is not.
  deg += s.move * Math.min(speed / C.SPEED_RUN, 1.3) * (1 - p.ads * 0.5);
  if (!p.grounded) deg += s.air;
  deg += w.bloom;
  if (p.stance === 'crouch') deg *= s.crouch;
  if (p.stance === 'slide') deg *= 1.35;
  if (p.sprinting) deg *= s.sprintMul;
  return Math.min(deg, s.max) * DEG;
}

const _right = vec3(), _up = vec3(), _dir = vec3(), _pd = vec3();

// Builds a camera-relative basis for the aim direction. Degenerate when looking
// straight up or down, hence the fallback axis.
function basis(dir) {
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dir.y) > 0.999) { ux = 0; uy = 0; uz = 1; }
  _right.x = dir.y * uz - dir.z * uy;
  _right.y = dir.z * ux - dir.x * uz;
  _right.z = dir.x * uy - dir.y * ux;
  const rl = Math.hypot(_right.x, _right.y, _right.z) || 1;
  _right.x /= rl; _right.y /= rl; _right.z /= rl;
  _up.x = _right.y * dir.z - _right.z * dir.y;
  _up.y = _right.z * dir.x - _right.x * dir.z;
  _up.z = _right.x * dir.y - _right.y * dir.x;
}

function offsetDir(dir, ox, oy, out) {
  out.x = dir.x + _right.x * ox + _up.x * oy;
  out.y = dir.y + _right.y * ox + _up.y * oy;
  out.z = dir.z + _right.z * ox + _up.z * oy;
  const l = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= l; out.y /= l; out.z /= l;
  return out;
}

// Uniform over the disc — sqrt, not a raw random, or every shot clusters in the
// middle and the cone may as well not exist.
export function spreadDir(G, dir, cone, out) {
  if (cone <= 1e-7) { out.x = dir.x; out.y = dir.y; out.z = dir.z; return out; }
  const r = Math.tan(cone) * Math.sqrt(G.rng());
  const a = G.rng() * TAU;
  return offsetDir(dir, Math.cos(a) * r, Math.sin(a) * r, out);
}

// Shotgun pellets are a fixed rosette — one down the middle, an inner ring and
// an outer ring — spun by a random angle per shot and jittered slightly per
// pellet. Nine independent random rays would sometimes stack into a slug and
// sometimes miss a man at 4 m; a rosette always looks and kills like a shotgun.
export function pelletDir(G, w, dir, cone, i, n, spin, out) {
  const cfg = (w && w.spread && w.spread.ring) ? w.spread : { ring: [0.48, 0.95], jitter: 0.20 };
  const jit = cfg.jitter;
  if (i === 0) {
    const r = Math.tan(cone) * 0.14 * G.rng();
    const a = G.rng() * TAU;
    return offsetDir(dir, Math.cos(a) * r, Math.sin(a) * r, out);
  }
  const inner = Math.floor((n - 1) / 2);
  const onInner = i <= inner;
  const per = onInner ? inner : (n - 1 - inner);
  const k = onInner ? i - 1 : i - 1 - inner;
  const ringR = cfg.ring[onInner ? 0 : 1];
  const a = spin + (onInner ? Math.PI / per : 0) + k * (TAU / per);
  const r = Math.tan(cone) * ringR * (1 + (G.rng() * 2 - 1) * jit);
  return offsetDir(dir, Math.cos(a) * r, Math.sin(a) * r, out);
}

// ── recoil ───────────────────────────────────────────────────────────────────

function applyRecoil(G, w, ads) {
  const r = w.recoil;
  const T = G.weapons.aim;
  const R = G.recoil;
  const i = w.shotIndex;
  // Steep for the first few rounds, then a plateau: the opening of a string is
  // what the player has to pre-aim under, the rest is what they ride.
  const shape = 1 + (r.first - 1) * Math.exp(-i / Math.max(r.settle, 1e-3));
  const tame = lerp(1, r.adsMul, ads) * (G.player.stance === 'crouch' ? 0.86 : 1);
  const jv = 1 + (G.rng() * 2 - 1) * r.rand;
  const jh = 1 + (G.rng() * 2 - 1) * r.rand * 1.6;
  const pat = r.pattern[i % r.pattern.length];

  T.pitch = Math.min(T.pitch + r.up * shape * jv * tame * DEG, r.maxUp * DEG);
  T.yaw = clamp(T.yaw + r.horiz * pat * jh * tame * DEG, -r.maxSide * DEG, r.maxSide * DEG);

  R.vKick += r.kick * tame * 8;
  R.shot = 1;
  G.shake.amp = Math.max(G.shake.amp, r.shake * tame);
  G.shake.t = Math.max(G.shake.t, 0.12);

  w.shotIndex++;
  w.lastShot = G.time.t;
}

const FALLBACK_RECOIL = WEAPONS.rifle.recoil;

// Integrates the view toward the pattern target, and the target back toward
// centre once the trigger has been off long enough. Runs every step whether or
// not a weapon is equipped, so a swap mid-string still settles.
function stepRecoil(G, w, dt) {
  const R = G.recoil;
  const T = G.weapons.aim || (G.weapons.aim = { pitch: 0, yaw: 0 });
  const r = (w && w.recoil) || FALLBACK_RECOIL;

  if (w && G.time.t - w.lastShot > r.reset) w.shotIndex = 0;

  const idle = G.time.t - (w ? w.lastShot : -99);
  if (idle > r.delay) {
    // Exponential walk-back to the pre-fire aim point. This is the half of the
    // system that makes recoil feel controllable rather than punishing: the
    // player only has to fight the climb while the trigger is down.
    const k = Math.exp(-r.recover * dt);
    T.pitch *= k; T.yaw *= k;
    if (Math.abs(T.pitch) < 1e-6) T.pitch = 0;
    if (Math.abs(T.yaw) < 1e-6) T.yaw = 0;
  }

  // Slightly under-damped so the view overshoots the target by a few percent on
  // the way up. That overshoot is the entire perceived "punch" of a gunshot.
  const k = r.stiff, c = 2 * Math.sqrt(r.stiff) * r.damp;
  R.vPitch += ((T.pitch - R.pitch) * k - R.vPitch * c) * dt;
  R.vYaw += ((T.yaw - R.yaw) * k - R.vYaw * c) * dt;
  R.pitch += R.vPitch * dt;
  R.yaw += R.vYaw * dt;

  // Viewmodel punch — the gun travelling back into the shoulder. Separate
  // spring because it settles much faster than the view does.
  R.vKick += (-R.kick * 260 - R.vKick * 24) * dt;
  R.kick += R.vKick * dt;
  R.shot = Math.max(0, R.shot - dt * 9);

  if (!Number.isFinite(R.pitch) || !Number.isFinite(R.yaw)) {
    R.pitch = 0; R.yaw = 0; R.vPitch = 0; R.vYaw = 0; T.pitch = 0; T.yaw = 0;
  }
}

// ── reloading ────────────────────────────────────────────────────────────────

function magCap(w) {
  // A round already in the chamber does not come out with the magazine, so a
  // reload with anything left gives you mag + 1. It is a small thing that
  // rewards reloading early, which is the habit you want to teach.
  return w.mag + (w.ammo > 0 ? 1 : 0);
}

export function canReload(G, w) {
  if (!w || w.state !== 'idle') return false;
  if (G.weapons.swapT > 0 || w.pumpT > 0 || w.raiseT > 0) return false;
  if (w.res <= 0) return false;
  return w.ammo < magCap(w);
}

function startReload(G, w) {
  if (!canReload(G, w)) return false;
  w.chambered = w.ammo > 0;
  w.state = 'reload';
  w.reloadT = 0;
  w.reloadFlags = 0;
  if (w.reloadMode === 'shell') {
    w.phase = 'start';
    w.phaseT = w.reload.start;
  } else {
    w.phase = 'mag';
    w.reloadDur = w.chambered ? w.reload.tac : w.reload.empty;
  }
  emit(G, 'reload', {
    weapon: w.id, phase: 'start', slot: G.weapons.active,
    ammo: w.ammo, res: w.res, empty: !w.chambered, shell: w.reloadMode === 'shell',
    duration: w.reloadMode === 'shell' ? w.reload.start : w.reloadDur,
  });
  return true;
}

function cancelReload(G, w, why) {
  if (!w || w.state !== 'reload') return false;
  if (w.reloadMode === 'shell' && w.phase !== 'end') {
    // Shell-by-shell keeps whatever it loaded and pumps out. That is the whole
    // reason to reload a shotgun one round at a time next to a doorway.
    w.phase = 'end';
    w.phaseT = w.reload.cancel;
    emit(G, 'reload', { weapon: w.id, phase: 'cancel', reason: why, ammo: w.ammo, res: w.res });
    return true;
  }
  w.state = 'idle';
  w.phase = '';
  w.reloadT = 0;
  emit(G, 'reload', { weapon: w.id, phase: 'cancel', reason: why, ammo: w.ammo, res: w.res });
  return true;
}

function finishReload(G, w) {
  const cap = w.mag + (w.chambered ? 1 : 0);
  const take = Math.min(cap - w.ammo, w.res);
  w.ammo += take;
  w.res -= take;
  w.state = 'idle';
  w.phase = '';
  w.bolt = false;
  w.dry = false;
  emit(G, 'reload', { weapon: w.id, phase: 'end', ammo: w.ammo, res: w.res, loaded: take });
}

function stepReload(G, w, dt) {
  if (w.state !== 'reload') return;

  if (w.reloadMode === 'shell') {
    w.phaseT -= dt;
    if (w.phaseT > 0) return;
    const over = -w.phaseT;
    if (w.phase === 'start') {
      w.phase = 'shell';
      w.phaseT = w.reload.shell - over;
      return;
    }
    if (w.phase === 'shell') {
      w.ammo++; w.res--;
      w.bolt = false; w.dry = false;
      emit(G, 'reload', { weapon: w.id, phase: 'shell', ammo: w.ammo, res: w.res });
      const cap = w.mag + (w.chambered ? 1 : 0);
      if (w.ammo >= cap || w.res <= 0) { w.phase = 'end'; w.phaseT = w.reload.end - over; }
      else w.phaseT = w.reload.shell - over;
      return;
    }
    // end / cancel pump-out
    w.state = 'idle';
    w.phase = '';
    emit(G, 'reload', { weapon: w.id, phase: 'end', ammo: w.ammo, res: w.res, loaded: 0 });
    return;
  }

  w.reloadT += dt;
  const rl = w.reload;
  if (!(w.reloadFlags & 1) && w.reloadT >= rl.magout) {
    w.reloadFlags |= 1;
    emit(G, 'reload', { weapon: w.id, phase: 'magout', ammo: w.ammo, res: w.res });
  }
  if (!(w.reloadFlags & 2) && w.reloadT >= rl.magin) {
    w.reloadFlags |= 2;
    emit(G, 'reload', { weapon: w.id, phase: 'magin', ammo: w.ammo, res: w.res });
  }
  if (w.reloadT >= w.reloadDur) finishReload(G, w);
}

// Refreshes the flat numbers the presentation layer reads. Nothing in the
// simulation consumes these — they exist so the HUD can draw a crosshair gap and
// a reload arc without reaching into a tuning table.
function syncMirrors(G, w) {
  w.spreadBase = lerp(w.spread.hip, w.spread.ads, G.player.ads);
  w.spreadDeg = currentSpread(G, w) / DEG;
  if (w.state !== 'reload') { w.reloading = 0; w.reloadFrac = 0; return; }
  if (w.reloadMode === 'shell') {
    const cap = w.mag + (w.chambered ? 1 : 0);
    const left = w.phase === 'end' ? 0 : Math.max(0, Math.min(cap - w.ammo, w.res));
    const total = w.reload.start + w.reload.shell * Math.max(left, 1) + w.reload.end;
    w.reloadTime = total;
    w.reloading = w.phaseT + (w.phase === 'shell' ? left * w.reload.shell + w.reload.end
      : w.phase === 'start' ? left * w.reload.shell + w.reload.end : 0);
  } else {
    w.reloadTime = w.reloadDur;
    w.reloading = Math.max(0, w.reloadDur - w.reloadT);
  }
  w.reloadFrac = w.reloadTime > 0 ? clamp(1 - w.reloading / w.reloadTime, 0, 1) : 1;
}

// ── swapping ─────────────────────────────────────────────────────────────────

export function requestSwap(G, slot) {
  const W = G.weapons;
  if (slot < 0 || slot >= W.slots.length) return false;
  if (slot === W.active && !W.swapPhase) return false;
  if (W.swapPhase === 'holster') { W.pending = slot; return true; }
  const cur = W.slots[W.active];
  if (cur) { cancelReload(G, cur, 'swap'); cur.burstLeft = 0; cur.buffer = 0; }
  W.pending = slot;
  W.swapPhase = 'holster';
  W.swapT = cur ? cur.swap.holster : 0.2;
  emit(G, 'swap', { phase: 'holster', from: cur ? cur.id : null, to: W.slots[slot].id, slot });
  return true;
}

function stepSwap(G, dt) {
  const W = G.weapons;
  if (!W.swapPhase) { W.swapT = 0; return; }
  W.swapT -= dt;
  if (W.swapT > 0) return;
  const over = -W.swapT;
  if (W.swapPhase === 'holster') {
    const from = W.slots[W.active];
    W.active = W.pending >= 0 ? W.pending : W.active;
    W.pending = -1;
    const to = W.slots[W.active];
    // A fresh gun starts a fresh recoil string and a fresh cone.
    if (to) { to.shotIndex = 0; to.bloom = 0; to.cool = 0; to.buffer = 0; to.burstLeft = 0; }
    W.swapPhase = 'draw';
    W.swapT = (to ? to.swap.draw : 0.3) - over;
    emit(G, 'swap', {
      phase: 'draw', from: from ? from.id : null, to: to ? to.id : null,
      slot: W.active, ammo: to ? to.ammo : 0, res: to ? to.res : 0,
    });
    return;
  }
  W.swapPhase = '';
  W.swapT = 0;
  const to = W.slots[W.active];
  emit(G, 'swap', { phase: 'ready', to: to ? to.id : null, slot: W.active });
}

// ── firing ───────────────────────────────────────────────────────────────────

function fireInterval(w) {
  if (w.mode === 'burst') {
    return w.burstLeft > 0 ? 60 / w.rpm : w.burstDelay;
  }
  if (w.mode === 'pump') return Math.max(60 / w.rpm, w.pump || 0);
  return 60 / w.rpm;
}

function shoot(G, w, age) {
  const p = G.player;
  const W = G.weapons;
  const ads = p.ads;
  const cone = currentSpread(G, w);

  // Bullets leave from the eye along the *recoiled* aim, not the raw one. Any
  // other choice makes the crosshair lie.
  lookDir(p.yaw + G.recoil.yaw, p.pitch + G.recoil.pitch, _dir);
  const origin = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
  const n = w.pellets || 1;

  w.ammo--;
  G.stats.shots++;
  const shotId = ++W.shotId;

  emit(G, 'shot', {
    weapon: w.id, name: w.name, slot: W.active, shotId,
    origin, dir: { x: _dir.x, y: _dir.y, z: _dir.z },
    spread: cone, spreadDeg: cone / DEG, bloom: w.bloom,
    ammo: w.ammo, res: w.res, mode: w.mode, pellets: n,
    ads, zoom: w.zoom, index: w.shotIndex, burst: w.burstLeft,
    age: age || 0,   // seconds this shot predates the end of the step
  });

  basis(_dir);
  const spin = G.rng() * TAU;
  let hit = false, kills = 0, dmg = 0, headshot = false;
  for (let i = 0; i < n; i++) {
    if (n > 1) pelletDir(G, w, _dir, cone, i, n, spin, _pd);
    else spreadDir(G, _dir, cone, _pd);
    const r = fireBullet(G, w, origin, _pd, { team: C.TEAM.PLAYER, shotId, pellet: i });
    if (r.hits) hit = true;
    kills += r.kills;
    dmg += r.damage;
    if (r.headshot) headshot = true;
  }

  // Accuracy counts shots that connected, not pellets: nine hits from one shell
  // is one hit.
  if (hit) G.stats.hits++;
  G.stats.accuracy = G.stats.shots ? G.stats.hits / G.stats.shots : 0;
  if (kills || dmg) {
    emit(G, 'shotResult', { weapon: w.id, shotId, damage: dmg, kills, headshot });
  }

  w.bloom = Math.min(w.bloom + w.spread.perShot, w.spread.bloomMax);
  applyRecoil(G, w, ads);

  if (w.mode === 'pump') w.pumpT = w.pump;
  if (w.ammo <= 0) {
    // Bolt catch: the action locks open on the last round, which is why the next
    // reload is the slow one and why the HUD can show an empty gun.
    w.bolt = true;
    emit(G, 'boltCatch', { weapon: w.id, res: w.res });
  }
}

function canShoot(G, w) {
  return w.ammo > 0 && w.state !== 'reload' && w.pumpT <= 0 &&
    w.raiseT <= 0 && G.weapons.swapT <= 0 && G.player.alive;
}

// ── the frame ────────────────────────────────────────────────────────────────

export function updateWeapons(G, dt) {
  const W = G.weapons;
  const p = G.player;
  const inp = G.input;

  stepSwap(G, dt);
  const w = W.slots[W.active];
  if (!w) { stepRecoil(G, null, dt); return; }

  const held = !!(inp.buttons && inp.buttons.has('fire')) && p.alive;
  const pressed = held && !W.triggerHeld;

  // ── weapon-down states ────────────────────────────────────────────────────
  // Sprinting puts the gun across the chest. Holding the trigger starts pulling
  // it back up, so "sprint into a room and shoot" costs `sprintOut` rather than
  // being impossible — but the sprint spread multiplier means you had better be
  // inside touching distance.
  if (p.sprinting && !W.sprintHeld) w.raiseT = Math.max(w.raiseT, w.sprintOut);
  W.sprintHeld = p.sprinting;
  if (p.sprinting && !held) w.raiseT = w.sprintOut;
  else if (w.raiseT > 0) w.raiseT = Math.max(0, w.raiseT - dt);
  if (p.sprinting) cancelReload(G, w, 'sprint');
  if (w.pumpT > 0) {
    w.pumpT -= dt;
    if (w.pumpT <= 0) { w.pumpT = 0; emit(G, 'cycle', { weapon: w.id, ammo: w.ammo }); }
  }

  // ── aim down sights ───────────────────────────────────────────────────────
  const wantAds = !!(inp.buttons && inp.buttons.has('ads')) &&
    !p.sprinting && W.swapT <= 0 && p.alive && !(w.state === 'reload' && w.reloadMode === 'shell');
  // Coming out of the sights is always faster than going in — you should never
  // die because the gun would not come down.
  const rate = 1 / Math.max(w.adsTime, 1e-3);
  p.ads = clamp(p.ads + (wantAds ? rate : -rate * 1.4) * dt, 0, 1);
  if (wantAds && !W.adsHeld) emit(G, 'adsIn', { weapon: w.id, zoom: w.zoom, time: w.adsTime });
  else if (!wantAds && W.adsHeld) emit(G, 'adsOut', { weapon: w.id, zoom: w.zoom });
  W.adsHeld = wantAds;

  // ── slot select ───────────────────────────────────────────────────────────
  if (inp.pressed) {
    if (inp.pressed.has('slot1')) requestSwap(G, 0);
    else if (inp.pressed.has('slot2')) requestSwap(G, 1);
    else if (inp.pressed.has('slot3')) requestSwap(G, 2);
  }
  if (inp.wheel) {
    const n = W.slots.length;
    if (n > 1) requestSwap(G, ((W.active + (inp.wheel > 0 ? 1 : -1)) % n + n) % n);
  }

  // ── reload ────────────────────────────────────────────────────────────────
  if (inp.pressed && inp.pressed.has('reload')) startReload(G, w);
  stepReload(G, w, dt);

  // ── trigger ───────────────────────────────────────────────────────────────
  // A press is remembered for a moment. Without the buffer, clicking a semi-auto
  // faster than its cycle rate silently eats inputs and the gun feels broken.
  if (pressed) w.buffer = 0.14;
  else w.buffer = Math.max(0, w.buffer - dt);

  // Firing out of a shell-by-shell reload cancels it — that is the mechanic.
  if (pressed && w.state === 'reload' && w.reloadMode === 'shell' && w.ammo > 0) {
    cancelReload(G, w, 'fire');
  }

  // Only true semi-autos demand a fresh press. A burst gun is already
  // trigger-limited by its lockout and a pump by its cycle, so making the player
  // click on top of that is a tax with no decision attached to it.
  const wants = () => {
    if (w.mode === 'auto') return held;
    if (w.mode === 'burst') return held || w.burstLeft > 0 || w.buffer > 0;
    if (w.mode === 'pump') return held || w.buffer > 0;
    return w.buffer > 0;            // semi: one shot per press
  };

  w.cool -= dt;
  let guard = 0;
  while (w.cool <= 0 && guard++ < 8) {
    if (!wants()) { if (w.cool < 0) w.cool = 0; break; }
    if (!canShoot(G, w)) {
      if (w.ammo <= 0 && w.state !== 'reload' && W.swapT <= 0 && !w.dry) {
        w.dry = true;
        emit(G, 'dryfire', { weapon: w.id, slot: W.active, res: w.res });
        w.buffer = 0;
        // Auto-reload on an empty trigger pull. Every shooter does this because
        // the alternative is players standing in the open pulling a dead trigger.
        if (w.res > 0) startReload(G, w);
      }
      if (w.cool < 0) w.cool = 0;
      w.burstLeft = 0;
      break;
    }
    // The accumulator carries the remainder forward instead of resetting, so the
    // rate is the weapon's rate and not the tick's. A 1000 rpm gun on a 120 Hz
    // step fires every 7.2 ticks on average, not every 8.
    const age = -w.cool;
    if (w.mode === 'burst' && w.burstLeft <= 0) { w.burstLeft = w.burst; w.buffer = 0; }
    if (w.mode !== 'auto') w.buffer = 0;
    w.dry = false;

    shoot(G, w, age);

    if (w.mode === 'burst' && w.burstLeft > 0) w.burstLeft--;
    w.cool += fireInterval(w);
    if (w.mode === 'semi' || w.mode === 'pump') break;
  }

  W.triggerHeld = held;

  // ── cones and springs settle ──────────────────────────────────────────────
  if (w.bloom > 0) w.bloom = Math.max(0, w.bloom - w.spread.decay * dt);
  stepRecoil(G, w, dt);
  syncMirrors(G, w);
}

// Convenience for the HUD and the tests: what the gun would do to a chest at
// this range right now, with no pellets or penetration involved.
export function previewDamage(id, dist) {
  const def = WEAPONS[id];
  if (!def) return 0;
  return damageAtRange(def, dist) * (def.pellets || 1);
}

export { damageAtRange };
