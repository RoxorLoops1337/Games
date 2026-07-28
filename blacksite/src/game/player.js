// Player movement.
//
// Quake-family acceleration: desired direction and speed in, an acceleration
// clamped by how much of the target speed you already have along that direction
// out. It is what makes strafing feel responsive on the ground and floaty but
// still steerable in the air, and it is why air control works at all.
//
// Pure simulation. No Three.js. The camera reads `G.player` afterwards.

import * as C from '../core/constants.js';
import { V, clamp, smooth, emit, vec3 } from '../core/state.js';
import { moveCharacter, queryAABB } from '../world/collision.js';

const _wish = vec3();
const _delta = vec3();
const _hit = {};

function accelerate(vel, wishDir, wishSpeed, accel, dt) {
  const current = vel.x * wishDir.x + vel.z * wishDir.z;
  const add = wishSpeed - current;
  if (add <= 0) return;
  let a = accel * wishSpeed * dt;
  if (a > add) a = add;
  vel.x += wishDir.x * a;
  vel.z += wishDir.z * a;
}

function friction(vel, drop, dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 1e-4) { vel.x = 0; vel.z = 0; return; }
  // The `stopSpeed` floor stops the exponential tail that otherwise leaves you
  // creeping for half a second after releasing the stick.
  const stopSpeed = 1.6;
  const control = speed < stopSpeed ? stopSpeed : speed;
  let newSpeed = speed - control * drop * dt;
  if (newSpeed < 0) newSpeed = 0;
  newSpeed /= speed;
  vel.x *= newSpeed; vel.z *= newSpeed;
}

export function updatePlayer(G, dt) {
  const p = G.player;
  if (!p.alive) return;
  const inp = G.input;
  const world = G.world;

  // ── look ───────────────────────────────────────────────────────────────────
  //
  // The look delta is *consumed*, not merely read. It is an absolute amount of
  // movement that happened once, whereas this function runs up to MAX_STEPS
  // times per rendered frame — so reading it without clearing it applies the
  // same mouse movement once per step, and aim sensitivity silently becomes a
  // function of frame rate. At 60 fps against a 120 Hz simulation that is
  // double sensitivity; at 30 fps it is quadruple, so the mouse appears to
  // speed up exactly when the scene gets heavy. Measured on touch as a 100 px
  // drag turning 149° where it should turn 30°.
  const sens = G.settings.sens * (1 - p.ads * (1 - G.settings.adsSensMul));
  p.yaw -= inp.look.x * sens;
  p.pitch -= inp.look.y * sens * (G.settings.invertY ? -1 : 1);
  inp.look.x = 0; inp.look.y = 0;
  p.pitch = clamp(p.pitch, -1.54, 1.54);
  if (p.yaw > Math.PI) p.yaw -= Math.PI * 2; else if (p.yaw < -Math.PI) p.yaw += Math.PI * 2;

  // ── stance ─────────────────────────────────────────────────────────────────
  const wantCrouch = inp.buttons.has('crouch');
  const speed2 = Math.hypot(p.vel.x, p.vel.z);

  if (p.stance === 'slide') {
    p.slideT -= dt;
    if (p.slideT <= 0 || speed2 < 2.2 || !p.grounded) p.stance = wantCrouch ? 'crouch' : 'stand';
  } else if (wantCrouch) {
    // Crouching at speed while sprinting is a slide, which is the traversal verb
    // the whole movement kit is built around.
    if (p.stance !== 'crouch' && p.grounded && speed2 >= C.SLIDE_MIN_SPEED && p.sprinting) {
      p.stance = 'slide'; p.slideT = C.SLIDE_TIME;
      emit(G, 'slide', { pos: V.clone(p.pos) });
    } else p.stance = 'crouch';
  } else if (p.stance === 'crouch') {
    // Only stand up if there is headroom — otherwise you clip through a vent.
    p.stance = hasHeadroom(world, p.pos, p.eye) ? 'stand' : 'crouch';
  }

  const eyeTarget = p.stance === 'stand' ? C.EYE_STAND
    : p.stance === 'slide' ? C.EYE_CROUCH * 0.82 : C.EYE_CROUCH;
  // Feet stay put while the eye moves, so crouching lowers the view rather than
  // dropping the whole body through the floor.
  const feetY = p.pos.y - p.eye;
  p.eye = smooth(p.eye, eyeTarget, p.stance === 'slide' ? 22 : 13, dt);
  p.pos.y = feetY + p.eye;

  // ── sprint ─────────────────────────────────────────────────────────────────
  // Pulling the trigger drops you out of a sprint. Without this the player can
  // hold sprint through a whole firefight and the weapon never leaves the
  // lowered pose, so the sprint animation stops meaning "you cannot shoot yet"
  // — which is the one thing it exists to communicate.
  const wantsForward = inp.move.y > 0.6 && Math.abs(inp.move.x) < 0.85;
  p.sprinting = inp.buttons.has('sprint') && wantsForward && p.grounded &&
    p.stance !== 'crouch' && p.ads < 0.2 && !inp.buttons.has('fire');

  // ── wish direction, in world space ─────────────────────────────────────────
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const fx = -sy, fz = -cy;      // forward
  const rx = cy, rz = -sy;       // right
  _wish.x = fx * inp.move.y + rx * inp.move.x;
  _wish.z = fz * inp.move.y + rz * inp.move.x;
  _wish.y = 0;
  let wishSpeed = Math.hypot(_wish.x, _wish.z);
  if (wishSpeed > 1e-4) { _wish.x /= wishSpeed; _wish.z /= wishSpeed; }
  wishSpeed = Math.min(wishSpeed, 1) * maxSpeed(G);

  // ── jump ───────────────────────────────────────────────────────────────────
  if (inp.pressed.has('jump')) p.jumpBuffer = C.JUMP_BUFFER;
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  p.coyote = p.grounded ? C.COYOTE : Math.max(0, p.coyote - dt);

  if (p.jumpBuffer > 0 && p.coyote > 0 && p.stance !== 'crouch') {
    p.vel.y = C.JUMP_SPEED;
    p.grounded = false; p.coyote = 0; p.jumpBuffer = 0;
    if (p.stance === 'slide') p.stance = 'stand';
    emit(G, 'jump', { pos: V.clone(p.pos), surface: p.groundSurface });
  }

  // ── accelerate ─────────────────────────────────────────────────────────────
  if (p.grounded) {
    if (p.stance === 'slide') {
      friction(p.vel, C.SLIDE_FRICTION, dt);
      // A slide keeps almost all steering authority but adds no speed, so you
      // can curve around cover without slide-hopping forever.
      accelerate(p.vel, _wish, Math.min(wishSpeed, speed2), 8, dt);
    } else {
      if (wishSpeed < 0.1) friction(p.vel, C.FRICTION, dt);
      else friction(p.vel, C.FRICTION * 0.55, dt);
      accelerate(p.vel, _wish, wishSpeed, C.ACCEL_GROUND / Math.max(wishSpeed, 0.001), dt);
    }
  } else {
    accelerate(p.vel, _wish, Math.min(wishSpeed, C.SPEED_AIR), C.ACCEL_AIR / Math.max(C.SPEED_AIR, 0.001), dt);
  }
  p.vel.y += C.GRAVITY * dt;
  if (p.vel.y < -60) p.vel.y = -60;

  // ── integrate + collide ────────────────────────────────────────────────────
  const height = p.stance === 'stand' ? C.CAPSULE_H : C.CAPSULE_H * 0.62;
  const feetBefore = p.pos.y - p.eye;
  const feet = { x: p.pos.x, y: feetBefore, z: p.pos.z };
  _delta.x = p.vel.x * dt; _delta.y = p.vel.y * dt; _delta.z = p.vel.z * dt;

  const wasGrounded = p.grounded;
  moveCharacter(world, feet, _delta, C.CAPSULE_R, height, _hit);

  if (_hit.wall) {
    // Kill only the component into the wall; the rest slides.
    const d = p.vel.x * _hit.wallNormal.x + p.vel.z * _hit.wallNormal.z;
    if (d < 0) { p.vel.x -= _hit.wallNormal.x * d; p.vel.z -= _hit.wallNormal.z * d; }
  }
  if (_hit.ceiling && p.vel.y > 0) p.vel.y = 0;

  const landed = _hit.ground && !wasGrounded;
  if (_hit.ground) {
    if (p.vel.y < 0) p.vel.y = 0;
    p.groundSurface = _hit.surface;
  }
  p.grounded = _hit.ground;

  if (landed) {
    const impact = Math.min(1, Math.abs(_delta.y / dt) / 22);
    emit(G, 'land', { pos: V.clone(p.pos), surface: _hit.surface, hard: impact });
    if (impact > 0.55) {
      G.shake.amp = Math.max(G.shake.amp, impact * 0.5);
      G.shake.t = 0.22;
    }
    // Fall damage only past a genuinely lethal-looking drop.
    const fallSpeed = Math.abs(_delta.y / dt);
    if (fallSpeed > 24) damagePlayer(G, (fallSpeed - 24) * 5.5, 'fall');
  }

  p.pos.x = feet.x; p.pos.z = feet.z; p.pos.y = feet.y + p.eye;

  // ── footsteps ──────────────────────────────────────────────────────────────
  const moved = Math.hypot(p.vel.x, p.vel.z);
  const stride = p.sprinting ? 2.05 : p.stance === 'crouch' ? 1.35 : 1.72;
  if (p.grounded && p.stance !== 'slide') {
    p.stepDist += moved * dt;
    if (p.stepDist >= stride) {
      p.stepDist = 0;
      emit(G, 'step', { pos: V.clone(p.pos), surface: p.groundSurface, sprint: p.sprinting });
    }
  } else p.stepDist = Math.min(p.stepDist, 1.2);

  // Head bob phase advances with distance travelled rather than with time, and
  // it is divided by the *actual* stride so it stays genuinely locked to the
  // footsteps at every speed and stance.
  //
  // One full phase turn is one gait cycle — two footsteps — because the render
  // side reads it as `abs(cos(2π·bobT))`, which dips once per foot. The old
  // constant was 1.9 per metre against a 1.72 m stride: about six and a half
  // bob cycles per footstep, which reads as a vibration rather than a walk.
  p.bobT += (moved * dt) / (stride * 2);

  // ── regeneration ───────────────────────────────────────────────────────────
  if (G.time.t - p.lastHurt > C.REGEN_DELAY && p.hp < p.maxHp) {
    p.hp = Math.min(p.maxHp, p.hp + C.REGEN_RATE * dt);
  }
}

export function maxSpeed(G) {
  const p = G.player;
  if (p.stance === 'crouch') return C.SPEED_CROUCH;
  if (p.stance === 'slide') return C.SPEED_SPRINT;
  if (p.ads > 0.5) return C.SPEED_ADS;
  if (p.sprinting) return C.SPEED_SPRINT;
  return C.SPEED_RUN;
}

// Is there room to stand up? Cheap slab overlap against the space the head
// would sweep through, rather than a full move — standing is binary, so a yes/no
// is all the caller needs.
const _probe = [];
export function hasHeadroom(world, pos, eye) {
  const crouchTop = (pos.y - eye) + C.CAPSULE_H * 0.62;
  queryAABB(world.grid,
    { x: pos.x - C.CAPSULE_R, y: crouchTop + 0.02, z: pos.z - C.CAPSULE_R },
    { x: pos.x + C.CAPSULE_R, y: (pos.y - eye) + C.CAPSULE_H, z: pos.z + C.CAPSULE_R }, _probe);
  return _probe.length === 0;
}

export function damagePlayer(G, amount, source) {
  const p = G.player;
  if (!p.alive || amount <= 0) return 0;
  p.hp -= amount;
  p.lastHurt = G.time.t;
  G.stats.taken += amount;
  emit(G, 'playerHurt', { amount, source, hp: p.hp });
  G.shake.amp = Math.max(G.shake.amp, Math.min(0.6, amount / 55));
  G.shake.t = Math.max(G.shake.t, 0.3);
  if (p.hp <= 0) {
    p.hp = 0; p.alive = false;
    G.mode = 'dead';
    emit(G, 'playerDied', { source });
  }
  return amount;
}
