// Renderer, camera rig, and the per-frame handoff from simulation to screen.
//
// The camera is the single most load-bearing piece of feel in a shooter, so it
// lives here rather than in the player: the simulation owns a position and two
// angles, and everything on top of that — bob, sway, recoil, breathing, landing
// dip, shake — is a render-side offset layered on afterwards. That split means a
// headless run reproduces exactly, and a camera tweak can never desync physics.

import * as THREE from 'three';
import * as C from '../core/constants.js';
import { clamp, lerp, smooth, lookDir } from '../core/state.js';

export const TIER = {
  // shadow map, AO samples, bloom mips, volumetric steps, particle budget, anisotropy
  0: { shadow: 1024, ao: 0, bloom: 3, vol: 0, parts: 250, aniso: 1, msaa: 0, pixelCap: 1.0 },
  1: { shadow: 1536, ao: 6, bloom: 4, vol: 8, parts: 700, aniso: 4, msaa: 0, pixelCap: 1.25 },
  2: { shadow: 2048, ao: 10, bloom: 5, vol: 16, parts: 1600, aniso: 8, msaa: 0, pixelCap: 1.5 },
  3: { shadow: 4096, ao: 16, bloom: 6, vol: 32, parts: 3000, aniso: 16, msaa: 0, pixelCap: 2.0 },
};

export function createEngine(G, canvas) {
  const tier = TIER[G.settings.quality] || TIER[2];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // post-process AA instead; MSAA and a composer do not mix
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
      // Off in normal play — keeping the back buffer around costs bandwidth for
      // nothing. The screenshot rig needs it, because a headless capture of a
      // non-preserved drawing buffer comes back black.
      preserveDrawingBuffer: !!window.__BS_TEST__,
    });
  } catch (err) {
    return { failed: true, error: err };
  }

  const gl = renderer.getContext();
  const caps = {
    float: !!gl.getExtension('EXT_color_buffer_float'),
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
    aniso: renderer.capabilities.getMaxAnisotropy(),
    webgl2: renderer.capabilities.isWebGL2,
  };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Tone mapping happens in the composite pass, not here — doing it twice is
  // the classic way to end up with washed-out, milky highlights.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = tier.shadow > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  // The world camera never renders the viewmodel: a first-person weapon is
  // ~40 cm from the lens and would clip through every doorway. It gets its own
  // camera and its own pass with its own near plane.
  const camera = new THREE.PerspectiveCamera(G.settings.fov, 1, 0.06, 900);
  const viewCam = new THREE.PerspectiveCamera(65, 1, 0.008, 12);

  const view = new THREE.Scene();   // viewmodel scene

  const rig = {
    // everything below is render-side only
    bob: new THREE.Vector3(),
    bobRot: new THREE.Euler(),
    sway: new THREE.Vector2(),
    swayVel: new THREE.Vector2(),
    lastYaw: 0, lastPitch: 0,
    breathe: 0,
    landDip: 0, landVel: 0,
    rollTarget: 0, roll: 0,
    shakeSeed: Math.random() * 1000,
    fov: G.settings.fov,
    prevPos: new THREE.Vector3(),
    prevViewProj: new THREE.Matrix4(),
    viewProj: new THREE.Matrix4(),
  };

  const size = { w: 1, h: 1, dpr: 1 };

  function resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, tier.pixelCap);
    size.w = Math.max(1, Math.floor(w)); size.h = Math.max(1, Math.floor(h)); size.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    viewCam.aspect = camera.aspect;
    camera.updateProjectionMatrix();
    viewCam.updateProjectionMatrix();
    if (engine.post && engine.post.resize) engine.post.resize(Math.floor(size.w * dpr), Math.floor(size.h * dpr));
  }

  // Deterministic, band-limited shake. Sines rather than random noise because a
  // random walk reads as a stutter, and three detuned sines per axis read as a
  // recoil impulse being absorbed.
  function shakeOffset(t, amp, out) {
    const a = amp * G.settings.shake;
    out.x = a * (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 23.1) * 0.4);
    out.y = a * (Math.sin(t * 41.7 + 1.7) * 0.6 + Math.sin(t * 19.3 + 0.4) * 0.4);
    out.z = a * Math.sin(t * 31.9 + 2.3) * 0.5;
    return out;
  }

  const _shake = new THREE.Vector3();
  const _dir = { x: 0, y: 0, z: 0 };

  // `alpha` is the render interpolation factor between fixed steps.
  function updateCamera(dt) {
    const p = G.player;

    // Weapon sway: the camera turns, the hands lag. A critically-damped spring
    // toward zero, driven by how fast the view is rotating.
    const dYaw = p.yaw - rig.lastYaw, dPitch = p.pitch - rig.lastPitch;
    rig.lastYaw = p.yaw; rig.lastPitch = p.pitch;
    const stiff = 120, damp = 2 * Math.sqrt(stiff) * 0.85;
    rig.swayVel.x += (-rig.sway.x * stiff - rig.swayVel.x * damp) * dt + dYaw * 2.2;
    rig.swayVel.y += (-rig.sway.y * stiff - rig.swayVel.y * damp) * dt + dPitch * 2.2;
    rig.sway.x = clamp(rig.sway.x + rig.swayVel.x * dt, -0.09, 0.09);
    rig.sway.y = clamp(rig.sway.y + rig.swayVel.y * dt, -0.09, 0.09);

    // Head bob, phase-locked to stride so the low point lands with the footstep.
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const bobAmt = (speed / C.SPEED_RUN) * (1 - p.ads * 0.85) * (p.grounded ? 1 : 0.15);
    const ph = p.bobT * Math.PI * 2;
    rig.bob.x = Math.sin(ph) * 0.028 * bobAmt;
    rig.bob.y = -Math.abs(Math.cos(ph)) * 0.034 * bobAmt;
    rig.bobRot.z = Math.sin(ph) * 0.010 * bobAmt;
    rig.bobRot.x = Math.abs(Math.cos(ph)) * 0.006 * bobAmt;

    // Idle breathing, only really visible down the sights, which is where it
    // matters: a perfectly still reticle looks synthetic.
    rig.breathe += dt * (p.ads > 0.5 ? 0.9 : 1.5);
    const breath = (1 - Math.min(1, speed)) * (0.5 + p.ads * 0.5);

    // Strafe roll — a couple of degrees of lean into lateral movement.
    const right = Math.cos(p.yaw) * p.vel.x - Math.sin(p.yaw) * p.vel.z;
    rig.rollTarget = clamp(-right / C.SPEED_RUN, -1, 1) * 0.030 * (1 - p.ads * 0.7);
    if (p.stance === 'slide') rig.rollTarget += 0.09;
    rig.roll = smooth(rig.roll, rig.rollTarget, 9, dt);

    // Landing dip, as a spring rather than a curve so a hard landing overshoots.
    rig.landVel += (-rig.landDip * 180 - rig.landVel * 17) * dt;
    rig.landDip += rig.landVel * dt;

    if (G.shake.t > 0) { G.shake.t -= dt; G.shake.amp *= Math.exp(-6 * dt); }
    else G.shake.amp = 0;
    shakeOffset(G.time.t * 60 + rig.shakeSeed, G.shake.amp * 0.06, _shake);

    // Assemble. Recoil is added to the look angles rather than to the position,
    // because recoil moves where the gun points, not where the head is.
    camera.position.set(p.pos.x, p.pos.y + rig.landDip, p.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = p.yaw + G.recoil.yaw + rig.sway.x * 0.35
      + Math.sin(rig.breathe * 0.7) * 0.0016 * breath;
    camera.rotation.x = p.pitch + G.recoil.pitch + rig.sway.y * 0.35
      + Math.sin(rig.breathe * 1.1) * 0.0022 * breath;
    camera.rotation.z = rig.roll + rig.bobRot.z;

    // Bob is applied in view space so it tilts with the head.
    camera.translateX(rig.bob.x + _shake.x);
    camera.translateY(rig.bob.y + _shake.y);
    camera.rotation.x += rig.bobRot.x + _shake.z * 0.4;

    // FOV: sprint pushes it out, ADS pulls it in, and the weapon's own zoom
    // scales the ADS target. Smoothed, never snapped.
    const w = G.weapons.slots[G.weapons.active];
    const adsFov = G.settings.fov * C.FOV_ADS_MUL * (w && w.zoom ? 1 / w.zoom : 1);
    const sprintFov = lerp(G.settings.fov, C.FOV_SPRINT, clamp(Math.hypot(p.vel.x, p.vel.z) / C.SPEED_SPRINT, 0, 1) * (p.sprinting ? 1 : 0));
    const targetFov = lerp(sprintFov, adsFov, p.ads);
    rig.fov = smooth(rig.fov, targetFov, 14, dt);
    if (Math.abs(camera.fov - rig.fov) > 1e-3) { camera.fov = rig.fov; camera.updateProjectionMatrix(); }

    camera.updateMatrixWorld();

    // Viewmodel camera shares the world camera's transform but keeps a fixed
    // FOV so the weapon does not warp when the world FOV changes.
    viewCam.position.copy(camera.position);
    viewCam.quaternion.copy(camera.quaternion);
    viewCam.fov = lerp(65, 48, p.ads);
    viewCam.updateProjectionMatrix();
    viewCam.updateMatrixWorld();

    lookDir(p.yaw + G.recoil.yaw, p.pitch + G.recoil.pitch, _dir);
    rig.prevViewProj.copy(rig.viewProj);
    rig.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  }

  const engine = {
    renderer, scene, camera, view, viewCam, rig, caps, tier, size,
    post: null,          // render/postfx.js installs itself here
    aimDir: _dir,
    failed: false,

    resize,
    updateCamera,

    setQuality(q) {
      G.settings.quality = q;
      const t = TIER[q] || TIER[2];
      Object.assign(tier, t);
      renderer.shadowMap.enabled = t.shadow > 0;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.pixelCap));
      resize(size.w, size.h);
      if (engine.post && engine.post.setQuality) engine.post.setQuality(q);
    },

    // Landing dip is an impulse fired by the event drain, not a poll.
    kickLanding(hard) { rig.landVel -= 2.2 * hard; },

    render() {
      renderer.info.reset();
      if (engine.post && engine.post.render) engine.post.render();
      else {
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(view, viewCam);
        renderer.autoClear = true;
      }
    },

    dispose() { renderer.dispose(); },
  };

  return engine;
}
