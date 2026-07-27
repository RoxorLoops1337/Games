// The visual half of an enemy: a pool of skinned soldiers reconciled against
// `G.enemies` once a rendered frame.
//
// The simulation owns positions, headings and hit points and knows nothing about
// a skeleton; this module owns a skeleton and never writes back. Everything
// between the two is read defensively — the AI is being written in parallel, so a
// field that is not there yet has to degrade into a sensible pose rather than a
// NaN that poisons a bone matrix and takes the frame down with it.
//
// The pose is built in layers, in the order a body actually resolves them:
//
//   locomotion  → pelvis, spine and a planted-foot solver drive the whole body
//   stance      → crouch and cover-lean ride on top of it
//   aim         → the upper body overrides locomotion and points the rifle
//   impulses    → recoil, flinch and reload are additive on top of the aim
//   look        → the head and eyes chase whatever the AI is attending to
//   death       → a verlet body takes the skeleton away from all of the above
//
// That split is the whole trick. Legs that keep running while the torso tracks a
// target is what separates a soldier from a turret on a trolley.

import * as THREE from 'three';
import * as C from '../core/constants.js';
import { groundBelow } from '../world/collision.js';
import { BONES, B, DIM, buildSoldierAssets, buildSkeletonBones } from './enemies/soldier.js';
import {
  TAU, clamp, lerp, wrapPi, smoothstep, approach, makeSpring, springStep,
  gaitFreq, gaitDuty, solveTwoBone, boneQuat, aimQuat, yawOf,
  createVerlet, linkVerlet, stepVerlet,
} from './enemies/anim.js';

const POOL_SIZE = 24;
const CORPSE_LIFE = 16;          // seconds a body lies there before the rig recycles
const LOD_NEAR = 17;             // full skinning and the small props
const LOD_FAR = 31;              // boxes and a leg swing
const LOD_HYST = 2.5;

// Rig-space transforms of the body currently being posed. Module scope on
// purpose: one body is posed to completion before the next one starts, so
// twenty-four soldiers share one set of scratch matrices instead of holding
// twenty-four.
const SQ = [], SP = [];
for (let i = 0; i < BONES.length; i++) { SQ.push(new THREE.Quaternion()); SP.push(new THREE.Vector3()); }

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _e1 = new THREE.Euler(0, 0, 0, 'YXZ');
const _aim = new THREE.Vector3(), _gaze = new THREE.Vector3();
const _gunQ = new THREE.Quaternion(), _handR = new THREE.Vector3(), _handL = new THREE.Vector3();
const IDENTITY = new THREE.Matrix4();

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

const finite3 = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

// States that mean "weapon up, sights on something". Matched loosely because the
// AI's vocabulary is still being written and a state string we have not heard of
// should leave the soldier at a low ready rather than throw.
const RE_ENGAGED = /engag|attack|fire|shoot|combat|aim|suppress|alert|hunt|advance/i;
const RE_CROUCH = /crouch|cover|prone|duck|hide/i;
const RE_RELOAD = /reload/i;

// Left hand during a reload, as a path through two different frames: the gun's
// (magazine well, charging handle) and the chest's (the pouch on the belt).
// Timings are the ones a shooter's hands actually keep — the mag change is over
// long before the animation is, and the last third is the hand coming home.
const RELOAD_KEYS = [
  [0.00, 0, 0.000, -0.015, -0.205],
  [0.13, 0, 0.030, -0.105, -0.030],
  [0.30, 1, -0.155, -0.330, -0.115],
  [0.46, 1, -0.140, -0.285, -0.060],
  [0.64, 0, 0.030, -0.125, -0.035],
  [0.77, 0, 0.028, -0.030, 0.010],
  [0.86, 0, 0.062, 0.028, 0.034],
  [1.00, 0, 0.000, -0.015, -0.205],
];

const RAG_POINTS = ['head', 'chest', 'pelvis', 'elbowR', 'handR', 'elbowL', 'handL',
  'kneeR', 'footR', 'kneeL', 'footL'];

export function createEnemyRigs(G, engine, materials) {
  const assets = buildSoldierAssets(materials);

  // One set of bone inverses for the whole pool. Each rig needs its own bones
  // (they hold the pose) but the rest pose they were bound in is identical, so
  // the inverses — and the geometry, and the material — are shared.
  const boneInverses = new THREE.Skeleton(buildSkeletonBones()).boneInverses;

  const pool = [];
  const byId = new Map();
  const byEnemy = new WeakMap();
  let quality = G.settings ? G.settings.quality : 3;

  for (let i = 0; i < POOL_SIZE; i++) pool.push(createRig(assets, boneInverses, engine, i));

  // ── acquisition ────────────────────────────────────────────────────────────

  function acquire(e, key) {
    let rig = pool.find((r) => r.mode === 'free');
    if (!rig) {
      // Under pressure the oldest corpse gives up its rig before a live enemy
      // goes unrendered — an invisible man who shoots you is worse than a body
      // that vanishes behind you.
      let oldest = null;
      for (const r of pool) if (r.mode === 'dead' || r.mode === 'dying') {
        if (!oldest || r.deadT > oldest.deadT) oldest = r;
      }
      rig = oldest;
    }
    if (!rig) return null;
    releaseRig(rig);
    rig.mode = 'alive';
    rig.key = key;
    rig.enemy = e;
    rig.spawnT = 0;
    rig.group.visible = true;
    byId.set(key, rig);
    byEnemy.set(e, rig);
    return rig;
  }

  function releaseRig(rig) {
    if (rig.key != null && byId.get(rig.key) === rig) byId.delete(rig.key);
    rig.key = null;
    rig.enemy = null;
    rig.mode = 'free';
    rig.deadT = 0;
    rig.ragdoll = null;
    rig.group.visible = false;
    rig.reloadT = -1;
    rig.recoil.x = rig.recoil.v = 0;
    rig.flinchP.x = rig.flinchP.v = rig.flinchR.x = rig.flinchR.v = 0;
    rig.stagger = 0;
    rig.hp = rig.lastHp = 1;
    rig.lastShots = 0;
    rig.spawnT = 0;
  }

  // ── frame ──────────────────────────────────────────────────────────────────

  function sync(dt) {
    // A paused or pre-boot frame still has to leave the bodies posed, but it must
    // not advance a clock — otherwise a soldier finishes his reload while the
    // player is staring at the pause menu.
    const running = G.mode === 'playing' || G.mode === 'dead';
    let step = running ? dt : 0;
    if (!(step >= 0)) step = 0;
    if (step > 0.1) step = 0.1;

    if (G.settings && G.settings.quality !== quality) {
      quality = G.settings.quality;
      for (const r of pool) applyQuality(r, quality);
    }

    const list = G.enemies;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || !e.pos) continue;
        const key = e.id != null ? e.id : ('idx:' + i);
        let rig = byEnemy.get(e);
        if (!rig || rig.enemy !== e) rig = byId.get(key);
        if (rig && rig.enemy !== e && rig.mode !== 'free') rig = null;
        if (!rig || rig.mode === 'free') rig = acquire(e, key);
        if (!rig) continue;
        if (rig.key !== key) { if (rig.key != null) byId.delete(rig.key); rig.key = key; byId.set(key, rig); }
        rig.seen = true;
        // A body already falling keeps falling: the sim may hold a dead entry in
        // the array for another second and re-reading it would tug the corpse.
        if (rig.mode === 'alive') readEnemy(rig, e, G, step);
      }
    }

    const cam = engine && engine.camera ? engine.camera.position : null;
    for (const rig of pool) {
      if (rig.mode === 'free') continue;
      if (rig.mode === 'alive' && !rig.seen) {
        // Gone from the array without a kill event: treat it as a death so the
        // body falls instead of blinking out mid-stride.
        beginDeath(rig, null, G);
      }
      rig.seen = false;
      updateRig(rig, step, G, cam);
      if (rig.mode === 'dead' && rig.deadT > CORPSE_LIFE) releaseRig(rig);
    }
  }

  function reset() { for (const r of pool) releaseRig(r); byId.clear(); }

  // ── events ─────────────────────────────────────────────────────────────────

  // Wire this into the drain in main.js next to `fx.handle(e)`. Everything it
  // reacts to is also inferred from state in `readEnemy`, so an unwired drain
  // costs sharpness (a flinch that starts a frame late, a death without a
  // direction) and never correctness.
  function handle(e) {
    if (!e || !e.type) return;
    const rig = lookup(e.enemy != null ? e.enemy : (e.target != null ? e.target : e.source));
    switch (e.type) {
      case 'enemyShot': case 'npcShot': case 'aiShot':
        if (rig) fireImpulse(rig);
        break;
      case 'shot':
        // The player's own shot carries no enemy id; only react when it does.
        if (rig && rig.mode === 'alive') fireImpulse(rig);
        break;
      case 'damage':
        if (rig) hitImpulse(rig, e, G);
        break;
      case 'kill':
        if (rig) beginDeath(rig, e, G);
        break;
      case 'reload':
        if (rig && (!e.phase || e.phase === 'start')) startReload(rig, e.duration);
        break;
      default: break;
    }
  }

  function lookup(id) {
    if (id == null) return null;
    if (typeof id === 'object') {
      const r = byEnemy.get(id);
      if (r) return r;
      id = id.id;
      if (id == null) return null;
    }
    const rig = byId.get(id);
    return rig && rig.mode !== 'free' ? rig : null;
  }

  // World-space point the enemy's muzzle flash and tracer should start from.
  // `out` may be a Vector3 or any {x,y,z}; the optional `outDir` comes back as
  // the unit bore direction, which is not the same as the aim direction once
  // recoil is in the arms. Returns null if that enemy has no visual body.
  function muzzlePoint(enemyId, out, outDir) {
    const rig = lookup(enemyId);
    if (!rig) return null;
    rig.muzzle.updateWorldMatrix(true, false);
    const m = rig.muzzle.matrixWorld.elements;
    if (out) { out.x = m[12]; out.y = m[13]; out.z = m[14]; }
    if (outDir) {
      // −Z of the marker is down the bore, same convention as everything else.
      outDir.x = -m[8]; outDir.y = -m[9]; outDir.z = -m[10];
    }
    return out || rig.muzzle;
  }

  function dispose() {
    for (const r of pool) engine.scene.remove(r.group);
    assets.skinGeometry.dispose();
    assets.farGeometry.dispose();
    assets.farLegGeometry.dispose();
    assets.eyeGeometry.dispose();
    assets.materials.body.dispose();
    assets.materials.eye.dispose();
  }

  return {
    sync, reset, handle, muzzlePoint, dispose,
    pool, assets, rigFor: lookup,
    // Lets the lighting agent tune the wrap light without touching this file.
    setRim(color) { assets.rim.copy(color); },
  };
}

// ── construction ─────────────────────────────────────────────────────────────

function createRig(assets, boneInverses, engine, index) {
  const group = new THREE.Group();
  group.name = 'enemy' + index;
  group.visible = false;

  const bones = buildSkeletonBones();
  const skeleton = new THREE.Skeleton(bones, boneInverses);
  const mesh = new THREE.SkinnedMesh(assets.skinGeometry, assets.materials.body);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(bones[0]);
  group.add(mesh);
  // Identity bind matrix: the geometry was authored in the bone root's own
  // space, so bind space and rig space are the same thing and the group's
  // transform cancels cleanly on both sides of the skinning matrix.
  mesh.bind(skeleton, IDENTITY);

  const eyes = new THREE.Mesh(assets.eyeGeometry, assets.materials.eye);
  eyes.position.set(0, 0.112, -0.112);
  eyes.frustumCulled = false;
  eyes.castShadow = false;
  bones[B.head].add(eyes);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(DIM.gunMuzzle[0], DIM.gunMuzzle[1], DIM.gunMuzzle[2]);
  muzzle.matrixAutoUpdate = true;
  bones[B.handR].add(muzzle);

  const far = new THREE.Group();
  far.visible = false;
  const farBody = new THREE.Mesh(assets.farGeometry, assets.materials.body);
  farBody.castShadow = true; farBody.receiveShadow = true;
  const farLegs = [0, 1].map((i) => {
    const m = new THREE.Mesh(assets.farLegGeometry, assets.materials.body);
    m.position.set(i ? -0.095 : 0.095, DIM.hipY, 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  });
  far.add(farBody, farLegs[0], farLegs[1]);
  group.add(far);

  engine.scene.add(group);

  const rig = {
    index, key: null, enemy: null, mode: 'free', seen: false,
    group, mesh, eyes, bones, skeleton, muzzle, far, farLegs,
    seed: (index * 0.6180339887) % 1,

    pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
    localVel: new THREE.Vector3(), aimPoint: new THREE.Vector3(), gazePoint: new THREE.Vector3(),
    speed: 0, feetYaw: 0, aimYaw: 0, aimPitch: 0,
    aimW: 0, crouchW: 0, peekW: 0, sprintW: 0, moveW: 0,
    phase: 0.05, freq: 1, duty: 0.6,
    feet: [makeFoot(1), makeFoot(-1)],
    headYaw: 0, headPitch: 0, headVY: 0, headVP: 0,
    blink: 0, blinkNext: 1 + Math.random() * 3, gazeShift: 0, gazeX: 0,
    recoil: makeSpring(), flinchP: makeSpring(), flinchR: makeSpring(),
    stagger: 0, staggerDir: 0,
    reloadT: -1, reloadDur: 2.1, lastShots: 0,
    hp: 1, lastHp: 1, deadT: 0, spawnT: 0,
    lod: 0, groundY: 0, groundT: 0, groundHit: false,
    ragdoll: null, ragSettle: 0,
  };
  applyQuality(rig, 3);
  return rig;
}

function makeFoot(side) {
  return {
    side,
    world: new THREE.Vector3(side * 0.095, 0, 0),
    lift: new THREE.Vector3(),
    rig: new THREE.Vector3(),
    planted: true, groundY: 0, pitch: 0, shuffle: -1,
  };
}

function applyQuality(rig, q) {
  // Tier 0 has no shadow map at all, so asking for a cast is free work; tiers
  // above it keep the body casting because a soldier with no shadow floats.
  const cast = q > 0;
  rig.mesh.castShadow = cast;
  rig.far.children.forEach((m) => { m.castShadow = cast; });
}

// ── reading the simulation ───────────────────────────────────────────────────

function readEnemy(rig, e, G, dt) {
  const p = e.pos;
  if (!finite3(p)) return;

  // Feet, not eyes. `pos` could be either convention depending on how the AI
  // settles, so trust the floor: a downward probe finds the same ground whether
  // the anchor it started from was a head or a boot.
  let feetY = null;
  if (Number.isFinite(e.feetY)) feetY = e.feetY;
  else {
    rig.groundT -= dt;
    if (rig.groundT <= 0 || rig.mode !== 'alive') {
      rig.groundT = 0.05;
      const g = G.world && G.world.grid ? groundBelow(G.world, p.x, p.y, p.z, 2.6) : null;
      rig.groundY = g ? g.y : (rig.groundY || 0);
      rig.groundHit = !!g;
    }
    feetY = rig.groundHit ? rig.groundY : p.y - (Number.isFinite(e.eye) ? e.eye : 0);
  }

  rig.prev.copy(rig.pos);
  rig.pos.set(p.x, feetY, p.z);
  if (rig.spawnT === 0) rig.prev.copy(rig.pos);

  if (finite3(e.vel)) rig.vel.set(e.vel.x, 0, e.vel.z);
  else if (dt > 1e-5) rig.vel.set((rig.pos.x - rig.prev.x) / dt, 0, (rig.pos.z - rig.prev.z) / dt);
  const rawSpeed = Math.hypot(rig.vel.x, rig.vel.z);
  rig.speed = approach(rig.speed, Math.min(rawSpeed, 9), 9, dt);

  const state = typeof e.state === 'string' ? e.state : '';
  const engaged = e.aiming != null ? !!e.aiming
    : (e.target != null || RE_ENGAGED.test(state));

  resolveAim(rig, e, G, engaged);

  // Heading. The legs follow the body's own yaw and the torso makes up the
  // difference — up to about 60°, past which no amount of spine will cover it
  // and the feet have to come round. That clamp is turn-in-place.
  let want = Number.isFinite(e.yaw) ? e.yaw : rig.aimYaw;
  const off = wrapPi(rig.aimYaw - want);
  if (off > 1.05) want = rig.aimYaw - 1.05;
  else if (off < -1.05) want = rig.aimYaw + 1.05;
  const turn = wrapPi(want - rig.feetYaw);
  const urgency = 0.9 + rig.moveW * 14 + smoothstep(0.45, 1.0, Math.abs(turn)) * 11;
  rig.feetYaw = wrapPi(rig.feetYaw + turn * (1 - Math.exp(-urgency * dt)));

  const crouch = e.stance === 'crouch' || e.stance === 'prone' || !!e.crouch || RE_CROUCH.test(state);
  rig.crouchW = approach(rig.crouchW, crouch ? 1 : 0, 8, dt);
  rig.aimW = approach(rig.aimW, engaged ? 1 : 0.18, 5.5, dt);
  rig.sprintW = approach(rig.sprintW, smoothstep(4.3, 6.2, rig.speed) * (engaged ? 0.25 : 1), 4, dt);

  // `lean` is the signed one; `peek` on its own is an amount without a side.
  let peek = 0;
  if (Number.isFinite(e.lean)) peek = clamp(e.lean, -1, 1);
  else if (Number.isFinite(e.peek)) peek = clamp(e.peek * (e.peekSide || 1), -1, 1);
  else if (/peekleft|leanleft/i.test(state)) peek = -1;
  else if (/peekright|leanright/i.test(state)) peek = 1;
  rig.peekW = approach(rig.peekW, peek, 6, dt);

  // Hit points are the cheapest possible damage feed: if nobody wires the event
  // drain, a body that loses health still flinches and a body that hits zero
  // still falls.
  const hp = Number.isFinite(e.hp) ? e.hp : rig.hp;
  const maxHp = Number.isFinite(e.maxHp) && e.maxHp > 0 ? e.maxHp : 100;
  if (rig.spawnT === 0) rig.lastHp = hp;
  if (hp < rig.lastHp - 0.01 && rig.mode === 'alive') {
    hitImpulse(rig, { amount: rig.lastHp - hp, maxHp }, G);
  }
  rig.lastHp = rig.hp = hp;

  // Shots and reloads, read straight off the simulation's own counters. The
  // event hooks below do the same job a frame earlier; polling is what keeps the
  // rig honest if nobody ever wires them.
  const shots = Number.isFinite(e.shotsFired) ? e.shotsFired : 0;
  if (shots > rig.lastShots) fireImpulse(rig);
  rig.lastShots = shots;

  if (Number.isFinite(e.reloadT) && e.reloadT > 0) {
    // The sim counts a reload down; the animation runs it up. Driving the clip
    // off the remaining time means the hand slaps the magazine home exactly when
    // the weapon says it is loaded.
    const dur = (e.weapon && e.weapon.reload) || rig.reloadDur;
    rig.reloadDur = dur;
    rig.reloadT = clamp(dur - e.reloadT, 0, dur);
  } else if (Number.isFinite(e.reloadT) && rig.reloadT >= 0 && e.reloadT <= 0) {
    rig.reloadT = -1;
  } else if (rig.reloadT < 0 && RE_RELOAD.test(state)) startReload(rig, e.reloadTime);

  if (rig.mode === 'alive' && (e.alive === false || hp <= 0)) beginDeath(rig, null, G);
  rig.spawnT += Math.max(dt, 1e-6);
}

// Where the rifle points, and separately where the eyes go. The AI may hand us a
// point, a direction, a target object or nothing at all; all four have to end in
// a world-space point the arms can be solved against.
function resolveAim(rig, e, G, engaged) {
  const chestY = rig.pos.y + DIM.chestY - rig.crouchW * DIM.crouchDrop;
  const pt = e.aimAt || e.aimPoint || e.lookAt || e.targetPos
    || (e.target && typeof e.target === 'object' ? (e.target.pos || e.target.position) : null);
  if (finite3(pt)) {
    rig.aimPoint.set(pt.x, pt.y, pt.z);
  } else if (finite3(e.aimDir) && (e.aimDir.x || e.aimDir.y || e.aimDir.z)) {
    _v1.set(e.aimDir.x, e.aimDir.y, e.aimDir.z).normalize();
    rig.aimPoint.set(rig.pos.x, chestY, rig.pos.z).addScaledVector(_v1, 20);
  } else if (engaged && G.player && finite3(G.player.pos)) {
    rig.aimPoint.copy(G.player.pos);
  } else {
    const y = Number.isFinite(e.yaw) ? e.yaw : rig.feetYaw;
    const pitch = Number.isFinite(e.pitch) ? e.pitch : 0;
    const cp = Math.cos(pitch);
    rig.aimPoint.set(rig.pos.x - Math.sin(y) * cp * 20, chestY + Math.sin(pitch) * 20,
      rig.pos.z - Math.cos(y) * cp * 20);
  }

  _v1.set(rig.aimPoint.x - rig.pos.x, rig.aimPoint.y - chestY, rig.aimPoint.z - rig.pos.z);
  const l = _v1.length() || 1;
  rig.aimYaw = yawOf(_v1.x, _v1.z);
  rig.aimPitch = clamp(Math.asin(clamp(_v1.y / l, -1, 1)), -0.9, 0.9);

  const gz = e.attend || e.interest || e.lookAt;
  if (finite3(gz)) rig.gazePoint.copy(gz);
  else rig.gazePoint.copy(rig.aimPoint);
}

// ── impulses ─────────────────────────────────────────────────────────────────

function fireImpulse(rig) {
  if (rig.mode !== 'alive') return;
  rig.recoil.v += 26;
}

function hitImpulse(rig, e, G) {
  if (rig.mode !== 'alive') return;
  const amount = Number.isFinite(e.amount) ? e.amount : 12;
  const maxHp = Number.isFinite(e.maxHp) ? e.maxHp : 100;
  const mag = clamp(amount / Math.max(20, maxHp * 0.25), 0.15, 1.4);

  // Direction matters more than magnitude: a body hit from the left has to rock
  // to its right, and getting that backwards reads as the shot pushing them into
  // the bullet.
  let dx = 0, dz = -1;
  const src = e.from || e.origin || (e.source && e.source.pos) || (G.player && G.player.pos);
  if (finite3(e.dir)) { dx = e.dir.x; dz = e.dir.z; }
  else if (finite3(src)) { dx = rig.pos.x - src.x; dz = rig.pos.z - src.z; }
  const c = Math.cos(rig.feetYaw), s = Math.sin(rig.feetYaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ll = Math.hypot(lx, lz) || 1;

  const part = typeof e.part === 'string' ? e.part.toLowerCase() : '';
  const partMul = part.includes('head') ? 1.5 : part.includes('leg') ? 0.6 : 1;

  rig.flinchR.v += (lx / ll) * mag * 15 * partMul;      // rocked sideways
  rig.flinchP.v += (lz / ll) * mag * 13 * partMul;      // folded over or arched back
  rig.stagger = Math.min(1, rig.stagger + mag * 0.5);
  rig.staggerDir = lx / ll;
  if (part.includes('leg')) rig.stagger = Math.min(1.2, rig.stagger + 0.3);
}

function startReload(rig, duration) {
  if (rig.mode !== 'alive' || rig.reloadT >= 0) return;
  rig.reloadT = 0;
  rig.reloadDur = Number.isFinite(duration) && duration > 0.4 ? duration : 2.1;
}

function beginDeath(rig, e, G) {
  if (rig.mode !== 'alive') return;
  rig.mode = 'dying';
  rig.deadT = 0;
  rig.ragSettle = 0;
  rig.reloadT = -1;

  // Build the ragdoll out of the pose the body died in, not out of a rest pose —
  // which means re-deriving this rig's joint positions, since the shared scratch
  // still holds whichever body was posed last.
  for (let i = 0; i < BONES.length; i++) fk(rig, i);
  const rd = createVerlet(RAG_POINTS);
  const set = (n, v) => { rd.pts[rd.index[n]].p.copy(v); rd.pts[rd.index[n]].o.copy(v); };
  set('head', SP[B.head]); set('chest', SP[B.chest]); set('pelvis', SP[B.pelvis]);
  set('elbowR', SP[B.foreR]); set('handR', SP[B.handR]);
  set('elbowL', SP[B.foreL]); set('handL', SP[B.handL]);
  set('kneeR', SP[B.shinR]); set('footR', SP[B.footR]);
  set('kneeL', SP[B.shinL]); set('footL', SP[B.footL]);
  rd.pts[rd.index.head].r = 0.12;
  rd.pts[rd.index.chest].r = 0.14;
  rd.pts[rd.index.pelvis].r = 0.13;

  const link = (a, b, k, slack) => linkVerlet(rd, a, b, k, slack);
  link('pelvis', 'chest', 1); link('chest', 'head', 1);
  link('chest', 'elbowR', 1); link('elbowR', 'handR', 1);
  link('chest', 'elbowL', 1); link('elbowL', 'handL', 1);
  link('pelvis', 'kneeR', 1); link('kneeR', 'footR', 1);
  link('pelvis', 'kneeL', 1); link('kneeL', 'footL', 1);
  // Shape-keepers. Without the diagonals the body folds flat like a deckchair;
  // with them it keeps a ribcage and a hip line all the way to the floor.
  link('pelvis', 'head', 0.45); link('pelvis', 'handR', 0.12, 0.15);
  link('pelvis', 'handL', 0.12, 0.15); link('chest', 'kneeR', 0.22, 0.1);
  link('chest', 'kneeL', 0.22, 0.1); link('kneeR', 'kneeL', 0.25, 0.2);
  link('elbowR', 'elbowL', 0.2, 0.1); link('footR', 'footL', 0.08, 0.6);

  const g = G.world && G.world.grid ? groundBelow(G.world, rig.pos.x, rig.pos.y + 0.4, rig.pos.z, 4) : null;
  rd.groundY = (g ? g.y : rig.pos.y) - rig.pos.y;

  // Launch: whatever the body was already doing, plus the shot that stopped it.
  const c = Math.cos(rig.feetYaw), s = Math.sin(rig.feetYaw);
  const wx = rig.vel.x, wz = rig.vel.z;
  let vx = wx * c - wz * s, vz = wx * s + wz * c;
  let px = 0, pz = 0.7, py = 0.25;
  if (e && finite3(e.dir)) {
    px = e.dir.x * c - e.dir.z * s; pz = e.dir.x * s + e.dir.z * c;
  } else if (e && finite3(e.point)) {
    const dx = rig.pos.x - e.point.x, dz = rig.pos.z - e.point.z;
    const dl = Math.hypot(dx, dz) || 1;
    px = (dx * c - dz * s) / dl; pz = (dx * s + dz * c) / dl;
  }
  const kick = e && e.headshot ? 2.6 : 1.5;
  const h = 1 / 60;
  for (const q of rd.pts) {
    const upper = q.name === 'head' || q.name === 'chest' ? 1.5 : q.name === 'pelvis' ? 0.9 : 0.5;
    q.o.x = q.p.x - (vx + px * kick * upper) * h;
    q.o.y = q.p.y - (py * upper) * h;
    q.o.z = q.p.z - (vz + pz * kick * upper) * h;
  }
  rig.ragdoll = rd;
}

// ── the frame ────────────────────────────────────────────────────────────────

function updateRig(rig, dt, G, cam) {
  rig.group.position.copy(rig.pos);
  rig.group.rotation.y = rig.feetYaw;

  const d = cam ? Math.hypot(cam.x - rig.pos.x, cam.y - rig.pos.y - 1, cam.z - rig.pos.z) : 0;
  const want = d > LOD_FAR ? 2 : d > LOD_NEAR ? 1 : 0;
  // Hysteresis, or a soldier walking the boundary strobes between two bodies.
  if (want > rig.lod && d > (want === 2 ? LOD_FAR : LOD_NEAR) + LOD_HYST) rig.lod = want;
  else if (want < rig.lod) rig.lod = want;
  const far = rig.lod === 2 && rig.mode !== 'dying';
  rig.mesh.visible = !far;
  rig.eyes.visible = rig.lod === 0;
  rig.far.visible = far;

  if (rig.mode === 'dying' || rig.mode === 'dead') {
    rig.deadT += dt;
    poseDeath(rig, dt, G);
    return;
  }

  springStep(rig.recoil, 0, 240, 22, dt);
  springStep(rig.flinchP, 0, 130, 13, dt);
  springStep(rig.flinchR, 0, 130, 13, dt);
  rig.stagger = Math.max(0, rig.stagger - dt * 1.6);
  if (rig.reloadT >= 0) {
    rig.reloadT += dt;
    if (rig.reloadT > rig.reloadDur) rig.reloadT = -1;
  }

  // Gait clock. Frequency rises with speed, and the phase parks at a
  // double-support moment when the body stops so nobody freezes mid-stride.
  rig.freq = gaitFreq(rig.speed);
  rig.duty = gaitDuty(rig.speed);
  rig.moveW = approach(rig.moveW, smoothstep(0.15, 1.1, rig.speed), 10, dt);
  const parked = rig.moveW < 0.05;
  if (!parked) rig.phase = (rig.phase + rig.freq * dt) % 1;
  else {
    const park = rig.phase < 0.3 || rig.phase > 0.8 ? 0.05 : 0.55;
    const gap = wrapPi((park - rig.phase) * TAU) / TAU;
    if (Math.abs(gap) > 0.004) rig.phase = (rig.phase + Math.sign(gap) * Math.min(Math.abs(gap), dt * 1.4) + 1) % 1;
  }

  if (far) { poseFar(rig); return; }
  poseSoldier(rig, dt, G);
}

// ── the pose ─────────────────────────────────────────────────────────────────

function fk(rig, i) {
  const par = BONES[i][1];
  const b = rig.bones[i];
  if (par < 0) { SP[i].copy(b.position); SQ[i].copy(b.quaternion); }
  else {
    SQ[i].multiplyQuaternions(SQ[par], b.quaternion);
    SP[i].copy(b.position).applyQuaternion(SQ[par]).add(SP[par]);
  }
}

// Sets a bone from a rig-space orientation. The poser thinks in rig space
// throughout — a knee that must point down the slope does not care what the
// pelvis is doing — and this is the one place that gets converted back.
function setRig(rig, i, q) {
  const par = BONES[i][1];
  if (par < 0) rig.bones[i].quaternion.copy(q);
  else rig.bones[i].quaternion.copy(SQ[par]).invert().multiply(q);
  fk(rig, i);
}

function setEuler(rig, i, x, y, z) {
  _e1.set(x, y, z);
  rig.bones[i].quaternion.setFromEuler(_e1);
  fk(rig, i);
}

function poseSoldier(rig, dt, G) {
  const bones = rig.bones;
  const sN = clamp(rig.speed / C.SPEED_RUN, 0, 1.4);
  const ph = rig.phase * TAU;
  const move = rig.moveW;
  const lower = 1 - rig.aimW;

  // Body-local velocity: the foot planner needs to know it is strafing, not just
  // that it is moving.
  const c = Math.cos(rig.feetYaw), s = Math.sin(rig.feetYaw);
  rig.localVel.set(rig.vel.x * c - rig.vel.z * s, 0, rig.vel.x * s + rig.vel.z * c);

  updateFeet(rig, dt, G, sN);

  // ── root and pelvis ───────────────────────────────────────────────────────
  bones[0].position.set(0, 0, 0);
  bones[0].quaternion.identity();
  fk(rig, 0);

  // Two bobs a cycle, one per footfall, and a lateral shift onto whichever leg
  // is carrying. The sway is the part people never notice and always miss.
  const bob = -(0.014 + 0.028 * sN) * move * (0.5 - 0.5 * Math.cos(ph * 2 + 0.7));
  const sway = Math.sin(ph) * 0.026 * move;
  const stagY = -rig.stagger * 0.05;
  const pelvisY = DIM.standPelvis - rig.crouchW * DIM.crouchDrop + bob + stagY;
  bones[B.pelvis].position.set(sway + rig.peekW * 0.055, pelvisY, rig.crouchW * 0.03);
  setEuler(rig, B.pelvis,
    -(0.030 + 0.10 * sN + 0.22 * rig.crouchW),
    // The pelvis leads a turn by roughly 80 ms and the shoulders follow, because
    // a body that rotates as one rigid piece reads as a turret.
    -Math.sin(ph) * 0.10 * move,
    Math.sin(ph + Math.PI * 0.5) * 0.055 * move + rig.peekW * 0.06 + rig.staggerDir * rig.stagger * 0.10);

  // ── spine and chest ───────────────────────────────────────────────────────
  const twist = clamp(wrapPi(rig.aimYaw - rig.feetYaw), -1.2, 1.2);
  const counter = -Math.sin(ph) * 0.15 * move * (1 - rig.aimW * 0.45);
  const lean = 0.03 + 0.13 * sN + 0.20 * rig.crouchW + rig.sprintW * 0.16;

  setEuler(rig, B.spine,
    -lean * 0.35 + rig.aimPitch * 0.10 + rig.flinchP.x * 0.45,
    twist * 0.28 - counter * 0.4,
    rig.peekW * 0.11 + rig.flinchR.x * 0.4);
  setEuler(rig, B.chest,
    -lean * 0.55 + rig.aimPitch * 0.22 + rig.flinchP.x * 0.55 - rig.recoil.x * 0.10,
    twist * 0.52 + counter - 0.17 * rig.aimW,   // the last term blades the stance
    rig.peekW * 0.16 + rig.flinchR.x * 0.6);

  // Shoulders. A small shrug under recoil is the shoulder absorbing the rifle
  // rather than the rifle passing straight through the man.
  const shrug = rig.recoil.x * 0.16;
  setEuler(rig, B.clavR, -shrug * 0.5, -shrug * 0.35, -shrug);
  setEuler(rig, B.clavL, 0, 0, Math.sin(ph) * 0.03 * move * rig.sprintW);
  // A joint's position depends on its parents but never on its own rotation, so
  // the shoulder and hip sockets can be resolved before anything is aimed at.
  fk(rig, B.armR); fk(rig, B.armL);

  // ── weapon and hands ──────────────────────────────────────────────────────
  poseWeapon(rig, lower);

  // ── legs ──────────────────────────────────────────────────────────────────
  poseLeg(rig, 0);
  poseLeg(rig, 1);

  // ── head ──────────────────────────────────────────────────────────────────
  poseHead(rig, dt);
}

function poseWeapon(rig, lower) {
  const t = rig.spawnT;

  // Aim direction in rig space, then lowered toward a port-arms carry when the
  // soldier has nothing to point at. Muzzle discipline is a characterisation
  // beat: a rifle that never comes down reads as a shooting-gallery target.
  let gy = wrapPi(rig.aimYaw - rig.feetYaw);
  let gp = rig.aimPitch;
  gy += lower * 0.16 + rig.sprintW * 0.30;
  gp -= lower * 0.55 + rig.sprintW * 0.35;
  gp += rig.recoil.x * 0.16;                       // muzzle climb
  gp += Math.sin(t * 1.3 + rig.seed * 9) * 0.008;  // breathing, only visible at rest
  gy += Math.sin(t * 0.9 + rig.seed * 5) * 0.006;

  const reload = rig.reloadT >= 0 ? rig.reloadT / rig.reloadDur : -1;
  const reloadW = reload < 0 ? 0 : Math.sin(Math.min(1, reload) * Math.PI) ** 0.6;
  gy += reloadW * 0.20;
  gp -= reloadW * 0.30;

  const cp = Math.cos(gp);
  _v1.set(-Math.sin(gy) * cp, Math.sin(gp), -Math.cos(gy) * cp);
  _v2.set(0, 1, 0).applyQuaternion(SQ[B.chest]);
  aimQuat(_gunQ, _v1, _v2);
  // Cant. A rifle held dead vertical looks like a prop; a few degrees inboard,
  // more when it is down at the ready, looks like it has weight.
  _q1.setFromAxisAngle(AXIS_Z, -0.07 - 0.30 * lower - 0.55 * reloadW - 0.25 * rig.sprintW);
  _gunQ.multiply(_q1);

  // Shoulder pocket: where the stock lives. The hand position falls out of it,
  // which is why the weapon never drifts off the shoulder no matter what the
  // spine is doing.
  _v3.set(0.100, 0.185 + 0.050 * rig.aimW - 0.030 * reloadW, -0.010 - 0.045 * reloadW)
    .applyQuaternion(SQ[B.chest]).add(SP[B.chest]);
  _v4.set(DIM.gunStock[0], DIM.gunStock[1], DIM.gunStock[2]).applyQuaternion(_gunQ);
  _handR.copy(_v3).sub(_v4).addScaledVector(_v1, -0.055 * rig.recoil.x);

  // Right arm to the grip.
  _v5.set(0.85, -0.30, 0.50).applyQuaternion(SQ[B.chest]).normalize();
  solveTwoBone(SP[B.armR], _handR, DIM.upperArm, DIM.foreArm, _v5, _v2, _v6);
  aimLimb(rig, B.armR, SP[B.armR], _v2, _v5);
  aimLimb(rig, B.foreR, _v2, _v6, _v5);
  setRig(rig, B.handR, _gunQ);

  // Left arm to the handguard — or wherever the reload has sent it.
  if (reloadW > 0.001) reloadHand(rig, reload, _handL);
  else _handL.set(DIM.gunFore[0], DIM.gunFore[1], DIM.gunFore[2]).applyQuaternion(_gunQ).add(_handR);

  // On a sprint the support hand comes off the weapon and the arm pumps in
  // counter-phase with the legs — the only place in this rig a limb swings free,
  // and the reason a sprinting soldier does not look like he is on rails.
  if (rig.sprintW > 0.01) {
    _v3.set(-0.16, 1.16 - rig.crouchW * DIM.crouchDrop + Math.sin(rig.phase * TAU) * 0.16,
      -0.24 - Math.cos(rig.phase * TAU) * 0.22);
    _handL.lerp(_v3, rig.sprintW * 0.9);
  }

  _v5.set(-0.35, -0.95, 0.35).applyQuaternion(SQ[B.chest]).normalize();
  solveTwoBone(SP[B.armL], _handL, DIM.upperArm, DIM.foreArm, _v5, _v2, _v6);
  aimLimb(rig, B.armL, SP[B.armL], _v2, _v5);
  aimLimb(rig, B.foreL, _v2, _v6, _v5);
  // Support hand: thumb over the bore, forearm coming up from behind. During a
  // reload it just continues the forearm, which is what a hand reaching for a
  // pouch actually does.
  _q1.setFromAxisAngle(AXIS_X, 1.25);
  _q2.copy(_gunQ).multiply(_q1);
  _q3.setFromAxisAngle(AXIS_Z, 0.35);
  _q2.multiply(_q3);
  _q2.slerp(SQ[B.foreL], clamp(reloadW * 1.4 + rig.sprintW, 0, 1));
  setRig(rig, B.handL, _q2);
}

// Points a limb bone down its segment. Bones in this rig hang along −Y toward
// their child, so the aim vector is the segment reversed; `ref` is what keeps the
// elbow and the knee from spinning about the limb.
function aimLimb(rig, bone, from, to, ref) {
  _v3.subVectors(from, to);
  const isLeg = bone === B.thighR || bone === B.thighL || bone === B.shinR || bone === B.shinL;
  if (isLeg) _v4.copy(ref).multiplyScalar(-1); else _v4.copy(ref);
  boneQuat(_q1, _v3, _v4);
  setRig(rig, bone, _q1);
}

function reloadHand(rig, u, out) {
  let i = 0;
  while (i < RELOAD_KEYS.length - 2 && RELOAD_KEYS[i + 1][0] < u) i++;
  const a = RELOAD_KEYS[i], b = RELOAD_KEYS[i + 1];
  const t = smoothstep(a[0], b[0], u);
  keyToRig(rig, a, _v3);
  keyToRig(rig, b, _v4);
  out.copy(_v3).lerp(_v4, t);
}

function keyToRig(rig, k, out) {
  out.set(k[2], k[3], k[4]);
  if (k[1] === 0) out.applyQuaternion(_gunQ).add(_handR);
  else out.applyQuaternion(SQ[B.chest]).add(SP[B.chest]);
}

// ── legs and feet ────────────────────────────────────────────────────────────

const _plant = new THREE.Vector3();

function updateFeet(rig, dt, G, sN) {
  const D = rig.duty;
  const lift = (0.040 + 0.090 * sN) * (1 - 0.3 * rig.crouchW);
  const dir = rig.localVel.lengthSq() > 1e-4 ? _v1.copy(rig.localVel).normalize() : _v1.set(0, 0, 0);
  const ahead = 0.5 * rig.speed * (D / Math.max(rig.freq, 0.2));
  const sampleGround = rig.lod === 0 && G.world && G.world.grid;

  for (let i = 0; i < 2; i++) {
    const f = rig.feet[i];
    const p = (rig.phase + (i ? 0.5 : 0)) % 1;
    const stance = p < D;

    // Where this foot wants to land: under its hip, offset along the direction
    // of travel by half a stride. Because the stance foot then stays pinned in
    // world space while the body carries on, stride length is speed over cadence
    // by construction and the feet cannot skate.
    const nx = f.side * 0.098 + dir.x * ahead - rig.crouchW * f.side * 0.02;
    const nz = dir.z * ahead;
    rigToWorld(rig, nx, 0, nz, _plant);
    if (sampleGround) {
      const g = groundBelow(G.world, _plant.x, rig.pos.y + 0.55, _plant.z, 1.6);
      f.groundY = g ? g.y : rig.pos.y;
    } else f.groundY = rig.pos.y;
    _plant.y = f.groundY + DIM.ankleY;

    if (f.shuffle >= 0) {
      // A standing body that has been turned under its own feet: pick the foot
      // up, put it back under the hip. This is turn-in-place, and it is the
      // cheapest possible version of it.
      f.shuffle += dt * 4.5;
      const v = Math.min(1, f.shuffle);
      const e = v * v * (3 - 2 * v);
      f.world.lerpVectors(f.lift, _plant, e);
      f.world.y += Math.sin(Math.PI * v) * 0.055;
      f.pitch = Math.sin(Math.PI * v) * 0.22;
      if (v >= 1) { f.shuffle = -1; f.planted = true; }
    } else if (stance) {
      if (!f.planted) { f.planted = true; }
      const u = p / Math.max(D, 1e-3);
      // Roll onto the ball of the foot at the end of stance. Most of what makes
      // a stride look like it pushes off is here.
      const toe = Math.max(0, (u - 0.72) / 0.28);
      f.world.y = f.groundY + DIM.ankleY + toe * toe * 0.055;
      f.pitch = -toe * toe * 0.45 + Math.max(0, 0.12 - u * 0.8) * 1.5 * rig.moveW;
      // Turned or nudged too far from under the hip while standing: shuffle.
      worldToRig(rig, f.world, f.rig);
      const off = Math.hypot(f.rig.x - f.side * 0.098, f.rig.z);
      if (rig.moveW < 0.15 && off > 0.30 && rig.feet[1 - i].shuffle < 0) {
        f.shuffle = 0; f.lift.copy(f.world); f.planted = false;
      }
    } else {
      if (f.planted) { f.planted = false; f.lift.copy(f.world); }
      const v = (p - D) / Math.max(1 - D, 1e-3);
      const e = v * v * (3 - 2 * v);
      f.world.lerpVectors(f.lift, _plant, e);
      f.world.y += Math.sin(Math.PI * v) * lift;
      f.pitch = lerp(-0.30, 0.20, e);
    }
    worldToRig(rig, f.world, f.rig);
    // A foot that has drifted out of the leg's reach would leave the IK clamped
    // and the body looking dislocated; snap it back rather than stretch.
    const reach = Math.hypot(f.rig.x - f.side * 0.095, f.rig.y - DIM.hipY, f.rig.z);
    if (!(reach < 0.95)) {
      f.rig.set(f.side * 0.095, DIM.ankleY, 0);
      rigToWorld(rig, f.rig.x, f.rig.y, f.rig.z, f.world);
    }
  }
}

function poseLeg(rig, i) {
  const f = rig.feet[i];
  const thigh = i ? B.thighL : B.thighR;
  const shin = i ? B.shinL : B.shinR;
  const foot = i ? B.footL : B.footR;
  fk(rig, thigh);

  // Knees track forward and slightly outward, more so crouched — a crouch with
  // the knees in the sagittal plane looks like a chair, not a firing position.
  _v5.set(f.side * (0.16 + rig.crouchW * 0.35), 0.22, -1).applyQuaternion(SQ[B.pelvis]).normalize();
  solveTwoBone(SP[thigh], f.rig, DIM.thigh, DIM.shin, _v5, _v2, _v6);
  aimLimb(rig, thigh, SP[thigh], _v2, _v5);
  aimLimb(rig, shin, _v2, _v6, _v5);

  // The foot is oriented against the world, not against the shin: a planted boot
  // stays flat on the floor however the leg above it is folded.
  const travel = rig.moveW > 0.05 ? clamp(yawOf(rig.localVel.x, rig.localVel.z) * 0.35, -0.5, 0.5) : 0;
  _e1.set(f.pitch, travel + f.side * 0.06, 0);
  _q1.setFromEuler(_e1);
  setRig(rig, foot, _q1);
}

// ── head ─────────────────────────────────────────────────────────────────────

function poseHead(rig, dt) {
  // Resolve the neck straight first so the head's socket is where this body's
  // chest actually put it — the scratch transforms are shared across the pool
  // and still hold whoever was posed last.
  setEuler(rig, B.neck, 0, 0, 0);
  setEuler(rig, B.head, 0, 0, 0);

  worldToRig(rig, rig.gazePoint, _gaze);
  _v1.copy(_gaze).sub(SP[B.head]);
  _q1.copy(SQ[B.chest]).invert();
  _v1.applyQuaternion(_q1);
  const l = _v1.length() || 1;
  // Neck limits, not because the maths needs them but because a head that can
  // rotate 180° is a horror-film effect. Past the limit the body has to turn,
  // which the feet-yaw chase above already does.
  const wantYaw = clamp(yawOf(_v1.x, _v1.z), -1.05, 1.05);
  const wantPitch = clamp(Math.asin(clamp(_v1.y / l, -1, 1)), -0.5, 0.62);

  // Spring rather than lerp: the head arrives, overshoots a hair and settles,
  // which is what a real head on a real neck does when it snaps to a sound.
  const stiff = 260, damp = 26;
  rig.headVY += ((wantYaw - rig.headYaw) * stiff - rig.headVY * damp) * dt;
  rig.headYaw += rig.headVY * dt;
  rig.headVP += ((wantPitch - rig.headPitch) * stiff - rig.headVP * damp) * dt;
  rig.headPitch += rig.headVP * dt;

  const t = rig.spawnT + rig.seed * 30;
  const idle = 1 - rig.aimW * 0.7;
  const ny = rig.headYaw + Math.sin(t * 0.61) * 0.035 * idle + Math.sin(t * 1.9) * 0.008;
  const np = rig.headPitch + Math.sin(t * 0.83 + 1.2) * 0.022 * idle;

  setEuler(rig, B.neck, np * 0.35, ny * 0.35, 0);
  setEuler(rig, B.head, np * 0.65, ny * 0.65, -ny * 0.10 + rig.flinchR.x * 0.35);

  // Blink and glance. Both are nearly free and their absence is exactly what
  // makes an NPC read as a mannequin with a gun.
  rig.blinkNext -= dt;
  if (rig.blinkNext <= 0) { rig.blink = 0.14; rig.blinkNext = 1.8 + Math.random() * 4.2; }
  if (rig.blink > 0) rig.blink -= dt;
  const lid = rig.blink > 0 ? clamp(1 - Math.sin(clamp(rig.blink / 0.14, 0, 1) * Math.PI) * 0.94, 0.06, 1) : 1;
  rig.gazeShift -= dt;
  if (rig.gazeShift <= 0) { rig.gazeShift = 0.7 + Math.random() * 2.4; rig.gazeX = (Math.random() - 0.5) * 0.012; }
  rig.eyes.scale.set(1, lid, 1);
  rig.eyes.position.x = rig.gazeX * (1 - rig.aimW * 0.6);
}

// ── death ────────────────────────────────────────────────────────────────────

function poseDeath(rig, dt, G) {
  const rd = rig.ragdoll;
  if (!rd) { rig.mode = 'dead'; return; }

  if (rig.mode === 'dying') {
    // Fixed sub-steps: verlet with a variable dt changes stiffness with frame
    // rate, and a corpse that folds differently at 30 fps is a corpse that will
    // eventually fold through the floor.
    let acc = Math.min(dt, 0.05);
    let motion = 0;
    while (acc > 1e-4) {
      const h = Math.min(acc, 1 / 90);
      motion = stepVerlet(rd, h, C.GRAVITY);
      acc -= h;
    }
    if (rig.deadT > 0.6 && motion < 0.28) rig.ragSettle += dt; else rig.ragSettle = 0;
    // Freeze once it has stopped moving. A settled corpse costs nothing but the
    // draw call from then on.
    if (rig.ragSettle > 0.35 || rig.deadT > 6) rig.mode = 'dead';
    if (rig.deadT > 0.25 && (rig.deadT % 0.25) < dt && G.world && G.world.grid) {
      const g = groundBelow(G.world, rig.pos.x + rd.pts[2].p.x, rig.pos.y + rd.pts[2].p.y + 0.4, rig.pos.z + rd.pts[2].p.z, 4);
      if (g) rd.groundY = g.y - rig.pos.y;
    }
  } else return;   // settled: the skeleton already holds the final pose

  const P = (n) => rd.pts[rd.index[n]].p;
  const bones = rig.bones;
  bones[0].position.set(0, 0, 0);
  bones[0].quaternion.identity();
  fk(rig, 0);

  const pelvis = P('pelvis'), chest = P('chest'), head = P('head');
  bones[B.pelvis].position.copy(pelvis);

  // Orientation from the point cloud: up the spine, right across the knees, and
  // the third axis falls out of the cross product. Two points are never enough
  // to know which way a torso is facing — the limbs are what carry the roll.
  _v1.subVectors(chest, pelvis);
  _v2.subVectors(P('kneeR'), P('kneeL'));
  _v3.crossVectors(_v2, _v1);
  boneQuat(_q1, _v1, _v3);
  setRig(rig, B.pelvis, _q1);

  _v1.subVectors(head, chest);
  _v2.subVectors(P('elbowR'), P('elbowL'));
  _v3.crossVectors(_v2, _v1);
  boneQuat(_q2, _v1, _v3);
  _q3.copy(_q1).slerp(_q2, 0.55);
  setRig(rig, B.spine, _q3);
  setRig(rig, B.chest, _q2);
  setRig(rig, B.neck, _q2);
  setRig(rig, B.head, _q2);

  setEuler(rig, B.clavR, 0, 0, 0);
  setEuler(rig, B.clavL, 0, 0, 0);
  ragLimb(rig, B.armR, B.foreR, B.handR, P('elbowR'), P('handR'), DIM.upperArm, DIM.foreArm);
  ragLimb(rig, B.armL, B.foreL, B.handL, P('elbowL'), P('handL'), DIM.upperArm, DIM.foreArm);
  ragLimb(rig, B.thighR, B.shinR, B.footR, P('kneeR'), P('footR'), DIM.thigh, DIM.shin);
  ragLimb(rig, B.thighL, B.shinL, B.footL, P('kneeL'), P('footL'), DIM.thigh, DIM.shin);
}

const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _r4 = new THREE.Vector3();

// Drives a limb from two verlet points. The mid point is re-projected onto the
// bone's real length first: the constraint solver gets close but never exact, and
// a limb allowed to inherit that error grows and shrinks as it falls.
function ragLimb(rig, a, b, c, mid, end, l1, l2) {
  fk(rig, a);
  const root = _r4.copy(SP[a]);
  _r1.subVectors(mid, root);
  if (_r1.lengthSq() < 1e-8) _r1.set(0, -1, 0);
  _r1.normalize().multiplyScalar(l1).add(root);
  _r2.subVectors(end, _r1);
  if (_r2.lengthSq() < 1e-8) _r2.set(0, -1, 0);
  _r2.normalize().multiplyScalar(l2).add(_r1);
  // The plane of the limb, which is all the twist reference a falling arm needs.
  _r3.subVectors(_r1, root).cross(_v6.subVectors(_r2, _r1));
  if (!(_r3.lengthSq() > 1e-8)) _r3.set(0, 0, 1); else _r3.normalize();
  aimLimbRaw(rig, a, root, _r1, _r3);
  aimLimbRaw(rig, b, _r1, _r2, _r3);
  setEuler(rig, c, 0, 0, 0);
}

function aimLimbRaw(rig, bone, from, to, ref) {
  _v3.subVectors(from, to);
  boneQuat(_q1, _v3, ref);
  setRig(rig, bone, _q1);
}

// ── far LOD ──────────────────────────────────────────────────────────────────

function poseFar(rig) {
  const drop = rig.crouchW * DIM.crouchDrop;
  rig.far.position.y = -drop;
  rig.far.rotation.y = wrapPi(rig.aimYaw - rig.feetYaw) * 0.6;
  const sw = Math.sin(rig.phase * TAU) * (0.30 + 0.35 * clamp(rig.speed / C.SPEED_RUN, 0, 1)) * rig.moveW;
  rig.farLegs[0].rotation.x = sw;
  rig.farLegs[1].rotation.x = -sw;
}

// ── space conversions ────────────────────────────────────────────────────────

function rigToWorld(rig, x, y, z, out) {
  const c = Math.cos(rig.feetYaw), s = Math.sin(rig.feetYaw);
  out.set(rig.pos.x + x * c + z * s, rig.pos.y + y, rig.pos.z - x * s + z * c);
  return out;
}

function worldToRig(rig, v, out) {
  const c = Math.cos(rig.feetYaw), s = Math.sin(rig.feetYaw);
  const dx = v.x - rig.pos.x, dz = v.z - rig.pos.z;
  out.set(dx * c - dz * s, v.y - rig.pos.y, dx * s + dz * c);
  return out;
}
