// The first-person weapon: presentation, not simulation.
//
// The viewmodel occupies about a fifth of the screen for the entire runtime and
// is the only object the player looks at every single frame, so almost all of
// the "does this feel like a shooter" budget lives here rather than in the
// world. Nothing in this file writes to `G`; it reads the simulation's springs
// and turns them into a pose.
//
// Everything is procedural. There are no keyframes, because a keyframed weapon
// has to be re-authored for every combination of walking, aiming, reloading and
// landing that the player can produce, and misses all the ones nobody thought
// of. Instead each behaviour is a small function of state that adds its offset
// on top of the others, and the combinations come out for free.
//
// The transform chain, outermost first:
//
//   attach   pinned to the view camera, so its children are literally in camera
//            space and every offset below can be reasoned about in the frame
//            the player is looking through
//   sway     the camera-lag spring: hands trail the view
//   motion   bob, breathing, landing, sprint, swap, reload
//   pivot    the shoulder — recoil rotates about *this*, which is what makes
//            the muzzle climb further than the stock
//   base     the hip↔ADS pose blend
//   model    the weapon itself
//
// The order matters. Recoil under sway means a shot fired mid-turn still throws
// the muzzle relative to the already-lagging weapon, rather than snapping the
// whole assembly back to centre.

import * as THREE from 'three';
import * as C from '../core/constants.js';
import { clamp, lerp, smooth, vec3 } from '../core/state.js';
import { raycast } from '../world/collision.js';
import { createGunMaterials } from './viewmodel/gunmetal.js';
import { createArsenal, resolveId } from './viewmodel/guns.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _xw = new THREE.Vector3(), _yw = new THREE.Vector3(), _zw = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _eye = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _pr = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

const TAU = Math.PI * 2;
const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
// Angles wrap at ±π, and a wrap must not read as a 6-radian flick of the wrist.
const wrap = (a) => (a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a);

// Five directions over the upper hemisphere: straight up plus four at 55°.
// Enough to tell a bay from a courtyard, cheap enough to run ten times a second.
const SKY_RAYS = [
  [0, 1, 0],
  [0.82, 0.57, 0], [-0.82, 0.57, 0], [0, 0.57, 0.82], [0, 0.57, -0.82],
];

export function createViewmodel(G, engine, materials) {
  const gun = createGunMaterials(G, engine, materials);
  const arsenal = createArsenal(gun.mats);

  const group = new THREE.Group();          // = attach
  const sway = new THREE.Group();
  const motion = new THREE.Group();
  const pivot = new THREE.Group();
  const base = new THREE.Group();
  group.add(sway); sway.add(motion); motion.add(pivot); pivot.add(base);
  group.matrixAutoUpdate = true;

  engine.view.add(group);

  // Resolve an id to a built, prepared model, building it the first time it is
  // asked for. Everything downstream deals in models, never in ids.
  const built = {};
  function modelFor(id) {
    const key = resolveId(arsenal, id);
    if (built[key]) return built[key];
    const m = arsenal.get(key) || arsenal.get('rifle');
    if (!m) return null;
    if (!m.prepped) { m.prepped = true; base.add(m.group); prep(m); m.group.visible = false; }
    built[key] = m;
    return m;
  }

  // ── lighting the view scene ────────────────────────────────────────────────
  // The view scene is its own scene, so it gets none of the world's lights for
  // free — and the temptation is to give the weapon a nice three-point rig,
  // which is exactly how a viewmodel ends up looking like a studio product shot
  // pasted over a photograph. It has to be lit by *the same sun*, at the same
  // intensity, from the same direction, or no amount of geometry will make it
  // belong in the frame.
  //
  // So: one key mirrored from `engine.lighting.sun` and re-aimed at the weapon
  // every frame, and one fill that is a copy of the world's ground-bounce light
  // rather than a rig of its own.
  //
  // That second point is not pedantry. A hemisphere light with a bright *sky*
  // colour adds a top light the world does not have, and the top of a weapon is
  // exactly what the player is looking at — so the receiver and handguard come
  // back a stop and a half hot while the level behind them does not, and the gun
  // reads as a prop composited over a photograph even though the key matches
  // perfectly. The sky's contribution is already in the environment map; the
  // only thing left to add is bounce, and bounce comes from below.
  const key = new THREE.DirectionalLight(0xffeeda, 1.0);
  const keyTarget = new THREE.Object3D();
  key.castShadow = false;
  const fill = new THREE.HemisphereLight(0x0a0c10, 0x40382e, 0.16);
  engine.view.add(key, keyTarget, fill);
  key.target = keyTarget;
  const sun = {
    light: null, dir: new THREE.Vector3(-0.42, 0.34, -0.62).normalize(), search: 0,
    // How much of the sun the player can actually see, smoothed. See syncLights.
    vis: 1, visTarget: 1, probe: 0, ray: vec3(), org: vec3(),
    // …and how much sky, which is a separate question: you can be out of the
    // sun and still under an open sky, and the two shade a weapon differently.
    sky: 1, skyTarget: 1,
  };

  // ── animation state ────────────────────────────────────────────────────────
  const st = {
    model: null,
    lastId: null, lastSlot: -1,
    lag: new THREE.Vector2(), lagVel: new THREE.Vector2(),
    lastYaw: G.player.yaw, lastPitch: G.player.pitch,
    idle: Math.random() * 100,
    sprint: 0,
    // Recoil is its own spring rather than a copy of the camera's, because the
    // weapon and the view do not settle together: the sights come back down
    // before your eye does, and copying `G.recoil` straight through makes the
    // gun feel welded to the crosshair.
    rec: { back: 0, vBack: 0, pitch: 0, vPitch: 0, yaw: 0, vYaw: 0, roll: 0, vRoll: 0 },
    trigger: 0,
    reload: { t: -1, dur: 1, phase: '', seen: false },
    swap: { t: -1, dur: 0.58, pending: null },
    cycle: -1,            // pump/slide cycle after a shot
    shots: G.stats.shots,
    reloadingWas: 0,
    events: { shot: false, reload: false },
    aim: 0,
  };

  // ── the ADS solve ──────────────────────────────────────────────────────────
  // Aiming is not "slide the gun toward the middle of the screen". It is: find
  // the line the sights define, and put the camera on it.
  //
  // The sight gives a datum point `s` and a unit direction `d`, both in weapon
  // space, and neither is required to be parallel to the bore — on the shotgun
  // the ghost ring stands 3 cm over a bore-level bead, so `d` slopes nose-down
  // by 2.5° and the weapon has to be pitched up by exactly that to compensate.
  //
  // Solve the rotation first: build an orthonormal basis in weapon space whose
  // third axis is -d and whose second is the sight's up, which is by
  // construction the basis that the camera's own axes map onto. Its transpose
  // takes weapon space to camera space, so R·d = (0,0,-1) — the sight line lies
  // exactly along the camera's forward axis and therefore hits the exact centre
  // of the screen at every field of view.
  //
  // Then the translation. The eye sits `eyeRelief` behind the datum along the
  // sight line, at e = s - d·relief, and we need that point to land on the
  // camera origin: R·e + T = 0, so T = -R·e. That is the whole solve.
  function solveADS(model, outPos, outQuat) {
    const s = model.sight;
    _v.set(s.dir[0], s.dir[1], s.dir[2]).normalize();
    _yw.set(s.up[0], s.up[1], s.up[2]);
    _zw.copy(_v).multiplyScalar(-1);
    _xw.crossVectors(_yw, _zw);
    if (_xw.lengthSq() < 1e-9) _xw.set(1, 0, 0);
    _xw.normalize();
    _yw.crossVectors(_zw, _xw).normalize();
    _m.makeBasis(_xw, _yw, _zw).transpose();
    outQuat.setFromRotationMatrix(_m);
    outPos.set(s.pos[0], s.pos[1], s.pos[2]).addScaledVector(_v, -model.eyeRelief);
    outPos.applyQuaternion(outQuat).negate();
  }

  // ── per-model bookkeeping ──────────────────────────────────────────────────
  function prep(model) {
    const n = model.nodes;
    model.rest = {};
    for (const k of ['mag', 'charge', 'trigger', 'pump', 'handL', 'handR']) {
      if (n[k]) model.rest[k] = { p: n[k].position.clone(), q: n[k].quaternion.clone() };
    }
    model.adsPos = new THREE.Vector3();
    model.adsQuat = new THREE.Quaternion();
    solveADS(model, model.adsPos, model.adsQuat);
    model.hipQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(model.hip.rot[0], model.hip.rot[1], model.hip.rot[2], 'YXZ'));
    model.hipPos = new THREE.Vector3().fromArray(model.hip.pos);
    // Where the support hand goes to fetch a magazine. Derived rather than
    // authored, so a new weapon does not need another table entry.
    const magY = model.rest.mag ? model.rest.mag.p.y : 0;
    model.magGrab = new THREE.Vector3(0.030, magY - 0.105, model.id === 'pistol' ? 0.030 : -0.045);
  }

  function setModel(model) {
    if (st.model === model) return;
    if (st.model) st.model.group.visible = false;
    st.model = model;
    if (model) {
      model.group.visible = true;
      restNodes(model);
    }
  }

  function restNodes(model) {
    for (const k in model.rest) {
      const n = model.nodes[k];
      if (!n) continue;
      n.position.copy(model.rest[k].p);
      n.quaternion.copy(model.rest[k].q);
      n.visible = true;
    }
  }

  // ── impulses ───────────────────────────────────────────────────────────────
  function fire(w) {
    const m = st.model;
    const mass = m ? m.mass : 1;
    const power = (w && w.recoil ? w.recoil : 1) / Math.max(0.4, mass);
    // Impulses are given as spring velocities, and the spring below runs at
    // ω≈15.5 rad/s, so a v of 1.0 peaks at roughly 0.032 of whatever it drives.
    // 1.8 therefore buys about 3.3° of muzzle rise and 0.85 about 2.7 cm of
    // rearward travel — enough to feel, small enough that a full magazine does
    // not turn into a seizure.
    const braced = 1 - st.aim * 0.42;      // a shouldered weapon absorbs more
    st.rec.vBack += 0.85 * power * braced;
    st.rec.vPitch += 1.80 * power * braced;
    st.rec.vYaw += (Math.random() - 0.5) * 0.80 * power * braced;
    st.rec.vRoll += (Math.random() - 0.42) * 1.10 * power * braced;
    st.trigger = 1;
    // Manual actions cycle visibly. That the pump moves *after* the shot rather
    // than during it is the whole read of a pump gun.
    if (m && (m.pumpTravel || m.slideTravel)) st.cycle = 0;
  }

  function beginReload(w) {
    const dur = w && w.reload ? w.reload : 2.0;
    st.reload.t = 0;
    st.reload.dur = Math.max(0.5, dur);
    st.reload.phase = 'start';
  }

  // ── the frame ──────────────────────────────────────────────────────────────
  function update(dt) {
    dt = clamp(dt || 0, 0, 0.1);
    gun.syncEnvironment(engine.view, engine.scene);
    syncLights(dt);

    const p = G.player;
    const w = G.weapons.slots[G.weapons.active];

    poll(w, dt);

    // Which weapon, and is a swap hiding the switch?
    const want = modelFor(w && w.id);
    if (!want && !st.model) { group.visible = false; return; }
    if (!st.model) setModel(want);
    else if (want !== st.model && st.swap.t < 0) { st.swap.t = 0; st.swap.pending = want; }

    if (st.swap.t >= 0) {
      st.swap.t += dt;
      const half = st.swap.dur * 0.46;
      if (st.swap.pending && st.swap.t >= half) { setModel(st.swap.pending); st.swap.pending = null; }
      if (st.swap.t >= st.swap.dur) st.swap.t = -1;
    }
    const model = st.model;
    if (!model) { group.visible = false; return; }
    group.visible = true;

    // ── aim blend ────────────────────────────────────────────────────────────
    // Eased rather than linear: the hard part of an ADS transition is the ends,
    // where a linear blend arrives at full speed and stops dead.
    st.aim = smoothstep(clamp(p.ads, 0, 1));
    const aim = st.aim;

    // ── camera lag ───────────────────────────────────────────────────────────
    // The rig already runs a sway spring at ω≈11 rad/s for the camera. This one
    // runs at ω≈6.6 and only 0.55 damped, so the weapon arrives late and
    // overshoots slightly. If the two shared a time constant the weapon and the
    // view would move as one rigid body, which is exactly the thing that makes a
    // viewmodel look glued to the lens.
    const dYaw = wrap(p.yaw - st.lastYaw), dPitch = p.pitch - st.lastPitch;
    st.lastYaw = p.yaw; st.lastPitch = p.pitch;
    const k = 44, c = 2 * Math.sqrt(44) * 0.55;
    // Sub-stepped for the same reason as the recoil spring below: this runs on
    // the render delta, which on a slow device is whatever the frame took. The
    // rotation impulse is delivered once rather than per sub-step, or a long
    // frame would amplify the same view movement several times over.
    let lagRem = dt, lagImpX = dYaw * 3.4, lagImpY = dPitch * 3.0;
    while (lagRem > 1e-6) {
      const h = Math.min(lagRem, 1 / 120);
      lagRem -= h;
      st.lagVel.x += (-st.lag.x * k - st.lagVel.x * c) * h + lagImpX;
      st.lagVel.y += (-st.lag.y * k - st.lagVel.y * c) * h + lagImpY;
      lagImpX = lagImpY = 0;
      st.lag.x = clamp(st.lag.x + st.lagVel.x * h, -0.18, 0.18);
      st.lag.y = clamp(st.lag.y + st.lagVel.y * h, -0.16, 0.16);
    }

    const lagAmt = (1 - aim * 0.74) / Math.max(0.6, model.mass);
    const rigSway = engine.rig.sway;
    sway.position.set(
      (-st.lag.x * 0.070 - rigSway.x * 0.085) * lagAmt,
      (st.lag.y * 0.052 + rigSway.y * 0.060) * lagAmt,
      0);
    sway.rotation.set(
      st.lag.y * 0.48 * lagAmt,
      -st.lag.x * 0.60 * lagAmt,
      -st.lag.x * 0.42 * lagAmt);

    // ── bob, breathing, sprint, landing ──────────────────────────────────────
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const run = clamp(speed / C.SPEED_RUN, 0, 1.35) * (p.grounded ? 1 : 0.2);
    const ph = p.bobT * TAU;                 // the camera's own bob phase
    const bob = run * (1 - aim * 0.86);

    st.sprint = smooth(st.sprint, (p.sprinting && speed > C.SPEED_RUN * 0.7) ? 1 : 0, 8.5, dt);
    const sp = st.sprint;

    st.idle += dt * 0.62;
    // A figure of eight, not a circle: 1:2 Lissajous. A circular idle reads as a
    // mechanism, the crossed path reads as someone breathing and failing to hold
    // still, which is the point.
    const still = (1 - clamp(run, 0, 1)) * (1 - aim * 0.45) * (1 - sp);
    const ix = Math.sin(st.idle) * 0.0034 * still;
    const iy = Math.sin(st.idle * 2) * 0.0024 * still;
    const breath = Math.sin(st.idle * 0.72) * 0.0020 * still;

    const dip = engine.rig.landDip;

    // The weapon bob is deliberately a different curve from the camera's. The
    // camera uses |cos| — a smooth double bounce. The hands get a sharper,
    // later impact shape, so at a run the gun visibly settles a beat after the
    // view does instead of tracking it exactly.
    const punch = Math.pow(Math.abs(Math.sin(ph)), 1.7) - 0.42;
    motion.position.set(
      Math.sin(ph) * 0.017 * bob + ix + Math.sin(ph * 0.5) * 0.020 * sp,
      punch * 0.020 * bob + iy + breath + dip * 1.9 + Math.sin(ph) * 0.016 * sp,
      Math.abs(Math.sin(ph)) * 0.008 * bob - dip * 0.5);
    motion.rotation.set(
      Math.sin(ph * 2 + 0.5) * 0.020 * bob + Math.sin(st.idle + 1.3) * 0.0042 * still + dip * 1.5 + Math.sin(ph) * 0.10 * sp,
      Math.sin(ph) * 0.026 * bob,
      Math.sin(ph + 0.9) * 0.034 * bob + Math.sin(st.idle * 2 + 0.7) * 0.0060 * still);

    // ── the big poses: sprint, swap, reload ──────────────────────────────────
    // These three want large rotations, and *where* those rotations happen is
    // the whole difference between a pose and a glitch. `motion` sits on the
    // camera origin, so a 0.6 rad roll applied there swings a weapon 30 cm away
    // through a 19 cm arc and throws it clean off the side of the screen. They
    // belong on the shoulder pivot, which is where a person's arms actually
    // rotate a rifle from. Translations stay on `motion`, where they mean what
    // they say.
    _pr.set(0, 0, 0);

    // Sprint: the weapon comes off the shoulder line, cants across the body and
    // drops. It is the game telling you, without a HUD element, that pulling the
    // trigger right now will cost you a beat to recover from.
    if (sp > 0.001) {
      motion.position.x += 0.062 * sp;
      motion.position.y -= 0.030 * sp;
      motion.position.z += 0.030 * sp;
      _pr.x -= 0.18 * sp;
      _pr.y += 0.24 * sp;
      _pr.z -= 0.36 * sp;
    }

    if (st.swap.t >= 0) {
      const t = st.swap.t / st.swap.dur;
      // Down fast, up slower — a weapon comes off the shoulder quicker than it
      // comes back onto it.
      const drop = t < 0.46 ? smoothstep(t / 0.46) : 1 - smoothstep((t - 0.46) / 0.54);
      motion.position.y -= 0.16 * drop;
      motion.position.z += 0.05 * drop;
      _pr.x -= 0.85 * drop;
      _pr.z += 0.30 * drop;
    }

    animateReload(model, dt, _pr);

    // ── recoil ───────────────────────────────────────────────────────────────
    // Stiff and underdamped, so the sights overshoot on the way back down and
    // settle in two visible bounces rather than easing in like a slider.
    const rk = 240 * (1 + aim * 0.5), rc = 2 * Math.sqrt(240) * (0.52 + aim * 0.16);
    const R = st.rec;
    // Sub-stepped, because this spring is stiff enough to come apart at the
    // frame times a phone actually delivers. Explicit Euler needs dt < 2/ω, and
    // ω here is √360 ≈ 19 while aiming — a limit of 0.105 s against an update
    // that clamps dt to 0.1. That is not a margin, it is a coin toss, and the
    // way it loses is the weapon leaving the screen on the first shot.
    let rem = dt;
    while (rem > 1e-6) {
      const h = Math.min(rem, 1 / 120);
      rem -= h;
      R.vBack += (-R.back * rk - R.vBack * rc) * h; R.back += R.vBack * h;
      R.vPitch += (-R.pitch * rk - R.vPitch * rc) * h; R.pitch += R.vPitch * h;
      R.vYaw += (-R.yaw * rk * 0.7 - R.vYaw * rc) * h; R.yaw += R.vYaw * h;
      R.vRoll += (-R.roll * rk * 0.6 - R.vRoll * rc) * h; R.roll += R.vRoll * h;
    }
    // A weapon that has gone non-finite never comes back on its own, and an
    // invisible gun is worse than a wrong one — so reset rather than persist.
    if (!Number.isFinite(R.back) || !Number.isFinite(R.pitch) ||
        !Number.isFinite(R.yaw) || !Number.isFinite(R.roll)) {
      R.back = R.pitch = R.yaw = R.roll = 0;
      R.vBack = R.vPitch = R.vYaw = R.vRoll = 0;
    }
    // The simulation's own kick is folded in at low weight, so a scripted or
    // AI-driven recoil impulse still shows on the weapon even if it never went
    // through `fire()`.
    const simKick = (G.recoil.kick || 0) * 0.35;

    // The shoulder. Rotating about the weapon's centroid makes recoil read as a
    // shrug — the muzzle and the stock swing the same amount in opposite
    // directions and the whole thing looks weightless. Putting the pivot ~22 cm
    // behind and below the eye, roughly where a shoulder pocket is, means the
    // muzzle travels several times further than the buttstock, which is what a
    // recoiling rifle actually does.
    pivot.position.set(
      lerp(0.085, 0.004, aim),
      lerp(-0.150, -0.052, aim),
      lerp(0.215, 0.165, aim));
    pivot.rotation.set(R.pitch + simKick * 0.02 + _pr.x, R.yaw + _pr.y, R.roll + _pr.z);

    // ── the pose ─────────────────────────────────────────────────────────────
    _v.copy(model.hipPos).lerp(model.adsPos, aim);
    _qa.copy(model.hipQuat).slerp(model.adsQuat, aim);
    // A straight line between hip and aim looks like a drawer opening. The arc
    // is small — a centimetre down and back at the midpoint — but it is the
    // difference between the gun being *raised* and being *slid*.
    const arc = aim * (1 - aim) * 4;
    _v.y -= 0.014 * arc;
    _v.z += 0.010 * arc;
    base.position.copy(_v).sub(pivot.position);
    base.quaternion.copy(_qa);
    base.translateZ(R.back + simKick * 0.004);

    // ── moving parts ─────────────────────────────────────────────────────────
    st.trigger = Math.max(0, st.trigger - dt * 9);
    if (model.nodes.trigger && model.rest.trigger) {
      model.nodes.trigger.rotation.x = -0.30 * st.trigger;
    }
    if (st.cycle >= 0) {
      st.cycle += dt;
      const T = 0.30;
      if (st.cycle >= T) st.cycle = -1;
      else {
        // Back hard, forward harder: the return stroke of a pump is the loud one.
        const u = st.cycle / T;
        const travel = u < 0.42 ? smoothstep(u / 0.42) : 1 - smoothstep((u - 0.42) / 0.58);
        if (model.nodes.pump && model.pumpTravel) {
          model.nodes.pump.position.z = model.rest.pump.p.z + model.pumpTravel * travel;
          if (model.nodes.handL) model.nodes.handL.position.z = model.rest.handL.p.z + model.pumpTravel * travel;
        }
      }
    }

    // ── pin to the camera and resolve ────────────────────────────────────────
    group.position.copy(engine.viewCam.position);
    group.quaternion.copy(engine.viewCam.quaternion);
    group.updateMatrixWorld(true);

    updateReticle(model);
  }

  // ── reload choreography ────────────────────────────────────────────────────
  // Driven off the phase events so the animation cannot desync from the
  // simulation: if the weapon says the magazine is out, it is out. When no
  // events arrive (the drain is not wired yet), the same timeline is recovered
  // by polling `w.reloading`, and the two paths are mutually exclusive.
  function animateReload(model, dt, outRot) {
    const rl = st.reload;
    if (rl.t < 0) return;
    rl.t += dt;
    const u = clamp(rl.t / rl.dur, 0, 1);
    if (u >= 1) { rl.t = -1; rl.phase = ''; restNodes(model); return; }

    // Present the weapon: brought in toward the lens and rolled so the magwell
    // turns to face the camera. The roll is the load-bearing part — a reload
    // performed with the gun still level shows the player nothing but the top of
    // the receiver while a magazine teleports somewhere underneath it.
    const present = u < 0.14 ? smoothstep(u / 0.14) : u > 0.86 ? 1 - smoothstep((u - 0.86) / 0.14) : 1;
    motion.position.x -= 0.008 * present;
    motion.position.y += 0.052 * present;
    motion.position.z += 0.044 * present;
    outRot.x -= 0.02 * present;
    outRot.y += 0.18 * present;
    outRot.z -= 0.54 * present;

    const mag = model.nodes.mag, rest = model.rest.mag;
    if (mag && rest) {
      if (u < 0.20) {                       // seated, thumb on the release
        mag.visible = true;
        mag.position.copy(rest.p);
        mag.rotation.set(0, 0, 0);
      } else if (u < 0.40) {                // falling free
        const t = (u - 0.20) / 0.20;
        mag.visible = true;
        mag.position.set(rest.p.x, rest.p.y - 0.22 * t * t, rest.p.z + 0.04 * t);
        mag.rotation.set(0.44 * t, 0.18 * t, -0.8 * t);
      } else if (u < 0.52) {                // hand is off-screen fetching
        mag.visible = false;
      } else if (u < 0.74) {                // coming up, angled into the well
        const t = (u - 0.52) / 0.22;
        const e = smoothstep(t);
        mag.visible = true;
        mag.position.set(rest.p.x, rest.p.y - 0.20 * (1 - e), rest.p.z + 0.030 * (1 - e));
        mag.rotation.set(0.28 * (1 - e), 0, 0.34 * (1 - e));
      } else {                              // seated, with a small settle
        const t = (u - 0.74) / 0.26;
        mag.visible = true;
        mag.position.copy(rest.p);
        mag.position.y -= Math.sin(Math.min(1, t * 3) * Math.PI) * 0.004;
        mag.rotation.set(0, 0, 0);
      }
    }

    // Bolt release, after the magazine is home — never before.
    const ch = model.nodes.charge, cr = model.rest.charge;
    if (ch && cr && u > 0.78) {
      const t = clamp((u - 0.78) / 0.14, 0, 1);
      const pull = t < 0.45 ? smoothstep(t / 0.45) : 1 - smoothstep((t - 0.45) / 0.55);
      ch.position.z = cr.p.z + 0.048 * pull;
    } else if (ch && cr) ch.position.copy(cr.p);

    // The support hand leaves the handguard, fetches, seats, and comes back.
    const hl = model.nodes.handL, hr = model.rest.handL;
    if (hl && hr) {
      let t = 0;
      if (u < 0.16) t = 0;
      else if (u < 0.34) t = smoothstep((u - 0.16) / 0.18);
      else if (u < 0.72) t = 1;
      else t = 1 - smoothstep((u - 0.72) / 0.28);
      // Dip out of frame between grabbing and returning: a hand that slides
      // continuously between the two points reads as a puppet on a rail.
      const away = Math.sin(clamp((u - 0.30) / 0.28, 0, 1) * Math.PI) * 0.10;
      hl.position.lerpVectors(hr.p, model.magGrab, t);
      hl.position.y -= away;
      hl.position.z += away * 0.35;
    }
  }

  // ── the reticle ────────────────────────────────────────────────────────────
  // A red dot is collimated: the dot appears at infinity along the sight axis,
  // which means its apparent direction from the eye does not change when the eye
  // moves — only the part of the lens you see it through does. So rather than
  // pinning a sprite to the middle of the glass, intersect the ray that leaves
  // the eye along the sight axis with the lens plane, and put the dot there.
  //
  // The visible consequence is the one players feel without naming: from the hip
  // the dot slides off the glass and vanishes, and it only centres when the eye
  // is genuinely behind the tube. A dot that is always in the middle of the lens
  // is the tell that it is a decal.
  function updateReticle(model) {
    const ret = model.nodes.reticle;
    if (!ret) return;
    const o = model.optic;
    if (!o) { ret.visible = false; return; }

    _m2.copy(model.group.matrixWorld).invert();
    _v.copy(engine.viewCam.position).applyMatrix4(_m2);      // eye, in weapon space
    _eye.copy(_v);
    _v2.set(model.sight.dir[0], model.sight.dir[1], model.sight.dir[2]).normalize();
    _v3.set(o.centre[0], o.centre[1], o.centre[2]);

    // The lens faces the shooter along -dir, so the plane normal is the sight
    // direction and the intersection is a single dot product.
    const t = ((_v3.x - _v.x) * _v2.x + (_v3.y - _v.y) * _v2.y + (_v3.z - _v.z) * _v2.z);
    if (t <= 0.001) { ret.visible = false; return; }
    _v.addScaledVector(_v2, t);            // the point on the lens plane

    _v.sub(_v3);                            // offset from the lens centre
    const rad = Math.hypot(_v.x, _v.y, _v.z);
    const lim = o.r * 0.80;
    if (rad > lim * 2.2) { ret.visible = false; return; }
    ret.visible = true;
    if (rad > lim) _v.multiplyScalar(lim / rad);
    ret.position.copy(_v3).add(_v).addScaledVector(_v2, -0.0015);

    // Face the eye, and grow with distance so the dot keeps a constant angular
    // size — a real optic's dot does not get bigger when you lean into it.
    // `lookAt` would resolve against the parent's world matrix, and everything
    // here is in weapon space, so the basis is built by hand.
    _m.lookAt(_eye, ret.position, _up);
    ret.quaternion.setFromRotationMatrix(_m);
    const dist = ret.position.distanceTo(_eye);
    const span = o.scope ? 0.30 : 0.082;
    const natural = o.scope ? 0.031 : 0.020;
    const s = clamp((dist * span) / natural, 0.45, 3.0);
    ret.scale.set(s, s, 1);
    // Fade as the dot walks off the glass, rather than clipping at the bezel.
    const fade = 1 - clamp((rad - lim) / (lim * 1.2), 0, 1);
    if (ret.material) {
      ret.material.opacity = (o.scope ? 0.95 : 1.0) * (0.30 + 0.70 * fade) * (0.55 + 0.45 * st.aim);
    }
  }

  // ── world lighting handoff ─────────────────────────────────────────────────
  function syncLights(dt) {
    // `engine.lighting` is the authority when the lighting module is present.
    // Falling back to a scene walk keeps the weapon lit in a bare test scene and
    // keeps this module from being the thing that breaks a partial boot.
    const L = engine.lighting;
    let src = L && L.sun ? L.sun : null;
    if (!src) {
      sun.search -= dt;
      if (!sun.light && sun.search <= 0) {
        sun.search = 0.75;
        engine.scene.traverse((o) => { if (!sun.light && o.isDirectionalLight) sun.light = o; });
      }
      src = sun.light;
    }
    if (src) {
      sun.dir.copy(src.position);
      if (src.target) sun.dir.sub(src.target.position);
      if (sun.dir.lengthSq() < 1e-6) sun.dir.set(-0.42, 0.34, -0.62);
      sun.dir.normalize();
      key.color.copy(src.color);
      // One-to-one with the world sun. The weapon is 40 cm from the lens and the
      // containers are 40 m away, but they stand under the same sky, and any
      // factor other than 1 here is a lie the eye catches on the first frame.
      const s = L && typeof L.sunIntensity === 'number' ? L.sunIntensity : src.intensity;
      key.intensity = clamp(s, 0.05, 6);
      // Copy the world's bounce outright, with a modest lift for the light that
      // comes off the player's own chest and forearms — the one source the world
      // genuinely has no geometry for.
      const b = L && L.bounce;
      if (b) {
        fill.color.copy(b.color);
        fill.groundColor.copy(b.groundColor);
        fill.intensity = b.intensity * 1.25;
      } else {
        fill.intensity = key.intensity * 0.11 + 0.03;
      }
    }
    // Is the player standing in the sun at all?
    //
    // This is the difference between a weapon that is in the scene and one that
    // is in front of it. The world has shadow maps; the view scene deliberately
    // does not, so without this the weapon stays brightly sunlit while the
    // player walks into a container bay and everything around them goes black —
    // and a lit object against an unlit background reads as a HUD element, not
    // as something being held. One ray every sixth frame, smoothed over a fifth
    // of a second so a doorway does not snap.
    sun.probe -= dt;
    if (sun.probe <= 0 && G.world && G.world.grid) {
      sun.probe = 0.10;
      sun.org.x = G.player.pos.x; sun.org.y = G.player.pos.y; sun.org.z = G.player.pos.z;
      sun.ray.x = sun.dir.x; sun.ray.y = sun.dir.y; sun.ray.z = sun.dir.z;
      try {
        sun.visTarget = raycast(G.world, sun.org, sun.ray, 45) ? 0 : 1;
        // And how much sky. A single straight-up ray is not enough: a container
        // bay is open at both ends, so the roof stops the vertical ray in some
        // spots and misses it in others, and the weapon flickers between outdoor
        // and indoor as the player walks. Five rays over the upper hemisphere is
        // a crude enough irradiance estimate to be honest and cheap enough to run
        // ten times a second.
        //
        // This matters more than it sounds. The environment probe is the view
        // scene's only ambient specular, and an unoccluded outdoor probe carried
        // into a dark interior is precisely how a weapon ends up glowing in a
        // room where everything else has gone black.
        let open = 0;
        for (const d of SKY_RAYS) {
          sun.ray.x = d[0]; sun.ray.y = d[1]; sun.ray.z = d[2];
          if (!raycast(G.world, sun.org, sun.ray, 16)) open++;
        }
        sun.skyTarget = open / SKY_RAYS.length;
      } catch { sun.visTarget = 1; sun.skyTarget = 1; }
    }
    sun.vis = smooth(sun.vis, sun.visTarget, 5.5, dt);
    sun.sky = smooth(sun.sky, sun.skyTarget, 4.5, dt);
    // Never all the way off: bounce still reaches the gun indoors, and that
    // residual is what keeps the chamfers legible in a doorway.
    key.intensity *= 0.10 + 0.90 * sun.vis;
    fill.intensity *= 0.40 + 0.60 * sun.sky;
    // Squared, because half the sky visible is much less than half the light:
    // the openings that remain are narrow and most of what they admit is aimed
    // somewhere other than the weapon. Linear leaves the gun a stop hot in every
    // container bay in the level while costing nothing outdoors, where the term
    // is 1 either way.
    gun.setEnvScale(0.12 + 0.88 * sun.sky * sun.sky);

    const at = engine.viewCam.position;
    keyTarget.position.copy(at);
    key.position.copy(at).addScaledVector(sun.dir, 6);
  }

  // ── event and polling plumbing ─────────────────────────────────────────────
  // `handle` is the preferred path; the moment a real event of a given type
  // arrives, polling for that type shuts off so nothing fires twice.
  function handle(e) {
    if (!e) return;
    if (e.type === 'shot') {
      st.events.shot = true;
      st.shots = G.stats.shots;
      fire(G.weapons.slots[G.weapons.active]);
    } else if (e.type === 'reload') {
      st.events.reload = true;
      const w = G.weapons.slots[G.weapons.active];
      if (e.phase === 'start') beginReload(w);
      else if (e.phase === 'magout') st.reload.t = Math.max(st.reload.t, st.reload.dur * 0.26);
      else if (e.phase === 'magin') st.reload.t = Math.max(st.reload.t, st.reload.dur * 0.56);
      else if (e.phase === 'end' && st.reload.t >= 0) st.reload.t = Math.max(st.reload.t, st.reload.dur * 0.88);
      st.reload.phase = e.phase || st.reload.phase;
    } else if (e.type === 'weaponSwap' || e.type === 'swap') {
      const want = modelFor(e.weapon || (G.weapons.slots[G.weapons.active] || {}).id);
      if (want && want !== st.model && st.swap.t < 0) { st.swap.t = 0; st.swap.pending = want; }
    }
  }

  function poll(w, dt) {
    void dt;
    if (!st.events.shot) {
      const n = G.stats.shots;
      if (n > st.shots) { fire(w); st.shots = n; }
      else if (n < st.shots) st.shots = n;   // a restart reset the counter
    }
    if (!st.events.reload && w) {
      const r = w.reloading || 0;
      if (r > 0 && st.reloadingWas <= 0) beginReload(w);
      st.reloadingWas = r;
    }
    if (G.weapons.active !== st.lastSlot) {
      st.lastSlot = G.weapons.active;
      // Handled by the model comparison in update(); this only exists so a slot
      // swap to an identical weapon id still plays the raise.
      if (st.model && st.swap.t < 0 && st.lastId !== null) { st.swap.t = 0; st.swap.pending = null; }
    }
    st.lastId = w ? w.id : null;
  }

  // The muzzle, in view-scene space, for whoever wants to hang a flash on it.
  function muzzle(outPos, outDir) {
    const m = st.model;
    if (!m) return false;
    if (outPos) outPos.fromArray(m.muzzle).applyMatrix4(m.group.matrixWorld);
    if (outDir) {
      outDir.set(0, 0, -1).applyQuaternion(m.group.getWorldQuaternion(_qb)).normalize();
    }
    return true;
  }

  return {
    group,
    update,
    handle,
    muzzle,
    arsenal,
    get model() { return st.model; },
    dispose() {
      engine.view.remove(group, key, keyTarget, fill);
      gun.dispose();
    },
  };
}
