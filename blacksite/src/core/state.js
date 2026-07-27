// The whole mutable game in one plain object.
//
// `createState()` is a factory, not a singleton, for one reason: the headless
// suite needs two independent simulations in the same process to diff one build
// against another. Nothing in here imports Three.js, touches the DOM or holds a
// reference to an Object3D — the renderer reads this, it never writes to it.

import * as C from './constants.js';

export function vec3(x = 0, y = 0, z = 0) { return { x, y, z }; }

export function createState(seed = 0x9e3779b9) {
  return {
    seed,
    rng: mulberry32(seed),

    time: { t: 0, dt: 0, frame: 0, scale: 1, steps: 0 },

    input: {
      move: { x: 0, y: 0 },       // −1..1, already deadzoned and normalised
      look: { x: 0, y: 0 },       // radians accumulated since last sample
      buttons: new Set(),         // held this frame
      pressed: new Set(),         // went down this frame
      released: new Set(),
    },

    player: {
      pos: vec3(0, C.EYE_STAND, 0),   // eye position, not feet
      vel: vec3(),
      yaw: 0, pitch: 0,
      hp: C.PLAYER_HP, maxHp: C.PLAYER_HP,
      lastHurt: -99,
      grounded: false, groundNormal: vec3(0, 1, 0), groundSurface: C.SURFACE.CONCRETE,
      stance: 'stand',                // stand | crouch | slide
      eye: C.EYE_STAND,               // smoothed toward the stance's target
      sprinting: false, ads: 0,       // ads is 0..1, the aim-down-sights blend
      slideT: 0, coyote: 0, jumpBuffer: 0,
      bobT: 0, stepDist: 0,
      alive: true,
    },

    // Free-running spring state the viewmodel and camera read. Simulation owns
    // the values; the render layer only samples them.
    recoil: { pitch: 0, yaw: 0, vPitch: 0, vYaw: 0, kick: 0, vKick: 0, shot: 0 },
    shake: { amp: 0, t: 0 },

    weapons: { slots: [], active: 0, swapT: 0 },

    enemies: [],
    projectiles: [],
    tracers: [],
    // Placed by the director where the pacing needs them, not scattered.
    // { id, kind:'ammo'|'health', pos, amount, taken }
    pickups: [],
    events: [],

    world: {
      statics: [],       // { min, max, surface, thickness } AABB soup
      grid: null,        // uniform-grid broadphase built by world/collision.js
      nav: null,         // walkable grid + A* cache, built once by game/nav.js
      spawns: [],
      // { pos, dir, height } — pos is where a body stands, dir is the outward
      // normal pointing at the threat. Hints only: the AI re-validates every
      // candidate against the player's real position, so a wrong entry costs a
      // rejected option rather than a man standing in the open feeling safe.
      cover: [],
      bounds: { min: vec3(-80, -8, -80), max: vec3(80, 40, 80) },
      ready: false,
    },

    ai: null,            // squad blackboards + attack tokens, owned by game/ai.js

    director: { wave: 0, alive: 0, budget: 0, nextSpawn: 0, phase: 'idle' },

    settings: {
      quality: C.QUALITY.ULTRA,
      fov: C.FOV_BASE,
      sens: 0.0022,
      adsSensMul: 0.72,
      invertY: false,
      motionBlur: true,
      filmGrain: true,
      chromatic: true,
      volumetrics: true,
      // One accumulating figure per target rather than a number per bullet —
      // a stream of them is a looter-shooter tell that fights this game's
      // register, but the total damage a burst did is genuinely useful.
      dmgNumbers: true,
      shake: 1,
      masterVol: 0.8,
    },

    stats: { kills: 0, headshots: 0, shots: 0, hits: 0, damage: 0, taken: 0, accuracy: 0 },

    mode: 'boot',   // boot | menu | playing | paused | dead
  };
}

// Deterministic RNG. Seeded so a replay of the same inputs gives the same run,
// which is the only way the AI and spread tests can assert anything exact.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emit(G, type, data) {
  const e = data ? Object.assign({ type, t: G.time.t }, data) : { type, t: G.time.t };
  G.events.push(e);
  return e;
}

// ── small vector helpers, mutating-in-place to keep the hot loop allocation-free
export const V = {
  set(a, x, y, z) { a.x = x; a.y = y; a.z = z; return a; },
  copy(a, b) { a.x = b.x; a.y = b.y; a.z = b.z; return a; },
  add(a, b, s = 1) { a.x += b.x * s; a.y += b.y * s; a.z += b.z * s; return a; },
  sub(out, a, b) { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; },
  scale(a, s) { a.x *= s; a.y *= s; a.z *= s; return a; },
  dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
  len(a) { return Math.hypot(a.x, a.y, a.z); },
  len2(a) { return a.x * a.x + a.y * a.y + a.z * a.z; },
  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); },
  dist2(a, b) { const x = a.x - b.x, y = a.y - b.y, z = a.z - b.z; return x * x + y * y + z * z; },
  norm(a) { const l = Math.hypot(a.x, a.y, a.z) || 1; a.x /= l; a.y /= l; a.z /= l; return a; },
  cross(out, a, b) {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    out.x = x; out.y = y; out.z = z; return out;
  },
  lerp(a, b, s) { a.x += (b.x - a.x) * s; a.y += (b.y - a.y) * s; a.z += (b.z - a.z) * s; return a; },
  clone(a) { return { x: a.x, y: a.y, z: a.z }; },
  finite(a) { return Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z); },
};

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const damp01 = (rate, dt) => 1 - Math.exp(-rate * dt);

// Direction the player is looking, as a unit vector. Used by every system that
// needs to fire, aim or spawn something in front of the camera.
export function lookDir(yaw, pitch, out = vec3()) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}
