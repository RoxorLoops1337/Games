// The light rig.
//
// Three jobs, and the second is most of the file. First, drive a sun whose
// colour and strength come from the atmosphere rather than from a constant, so
// the two can never disagree. Second, aim that sun's shadow camera at the part
// of the world the player is actually looking at, tightly enough to be sharp
// and stably enough not to shimmer — a 210 m level under a 4096² map is 5 cm a
// texel if you fit it to the view and half a metre a texel if you fit it to the
// level. Third, decide how much of the sky gets to light the ground.
//
// The ambient term is deliberately not a HemisphereLight over the whole sphere.
// The sky module renders a real atmosphere into a PMREM chain and hands it to
// `scene.environment`, so every surface already integrates the actual sky above
// it. A hemisphere light on top of that double-counts the sky and flattens
// exactly the contrast the image-based lighting was there to provide — so what
// is left here is only the half the environment map cannot supply: bounce off
// the ground.

import * as THREE from 'three';
import { clamp, smooth } from '../core/state.js';

// How far from the eye the shadow map covers. Past this a raking dusk shadow is
// indistinguishable from ambient occlusion anyway, and the AO pass carries the
// grounding instead.
// The sphere that bounds a frustum slice is set by the far plane's *corners*,
// and at an 80° field of view those are a long way off-axis: a 96 m range needs
// a 164 m radius, which is 8 cm a texel even on a 4096² map. Pulling the range
// in buys sharpness where shadows are actually read — anything past ~70 m at a
// raking dusk sun is indistinguishable from ambient occlusion anyway.
const SHADOW_RANGE = { 0: 0, 1: 38, 2: 55, 3: 72 };

// A low sun casts a long, shallow shadow, so the depth range has to reach well
// behind the receiver to still contain the caster — otherwise a floodlight mast
// stops casting halfway along its own shadow.
const SHADOW_DEPTH_PAD = 90;

export function createLighting(G, engine, sky) {
  const scene = engine.scene;
  const tier = engine.tier;

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = tier.shadow > 0;
  sun.shadow.mapSize.set(tier.shadow || 1024, tier.shadow || 1024);
  // Slope-scaled normal bias rather than a big constant depth bias. At this
  // elevation almost every surface is near-parallel to the light, which is
  // exactly where a constant bias has to choose between acne and peter-panning.
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.055;
  sun.shadow.camera.near = 0.5;
  scene.add(sun);
  scene.add(sun.target);

  // Bounce, not ambient. A desert floor under a low sun throws a lot of warm
  // light back up into everything's underside, and that upward fill is the
  // difference between "in shadow" and "a black hole in the frame". The sky
  // half is already covered by the environment map, hence the black sky colour.
  const bounce = new THREE.HemisphereLight(0x000000, 0xffffff, 0);
  scene.add(bounce);

  const state = {
    envIntensity: 1,
    sunIntensity: 1,
    range: SHADOW_RANGE[G.settings.quality] ?? 68,
  };

  const _centre = new THREE.Vector3();
  const _lightPos = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _mat = new THREE.Matrix4();
  const _v = new THREE.Vector3();
  const sphere = { centre: new THREE.Vector3(), radius: 1 };

  // The slice of view frustum the shadow map covers, as a bounding sphere.
  //
  // A sphere rather than a fitted box on purpose. A box's dimensions change as
  // the camera rotates, which changes the texel size every frame, which makes
  // every shadow edge crawl. A sphere's radius depends only on the depth range
  // and the field of view, so it holds still while the player turns — and a
  // constant texel size is what makes the snapping below possible at all.
  function shadowSphere(cam, near, far, out) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    const tanH = tanV * cam.aspect;
    const a = tanV * tanV + tanH * tanH;
    let z = (far + near) * 0.5 * (1 + a);
    if (z > far) z = far;                        // a very wide FOV degenerates
    const dNear = Math.hypot(near - z, near * tanV, near * tanH);
    const dFar = Math.hypot(far - z, far * tanV, far * tanH);
    out.radius = Math.max(dNear, dFar);
    cam.getWorldDirection(_v);
    out.centre.copy(cam.position).addScaledVector(_v, z);
    return out;
  }

  function fitShadow() {
    if (!sun.castShadow || state.range <= 0) return;
    const cam = engine.camera;
    shadowSphere(cam, cam.near, state.range, sphere);

    const r = sphere.radius;
    const cs = sun.shadow.camera;
    cs.left = -r; cs.right = r; cs.top = r; cs.bottom = -r;
    cs.far = r * 2 + SHADOW_DEPTH_PAD;

    // Snap the centre to whole shadow texels, measured in light space. Without
    // this the sample grid slides under the geometry as the player walks and
    // every shadow edge boils — the most visible artefact a shadow map has, and
    // the one that gets mistaken for low resolution.
    _lightPos.copy(sphere.centre).addScaledVector(sky.sunDir, r + SHADOW_DEPTH_PAD * 0.5);
    _mat.lookAt(_lightPos, sphere.centre, _up);
    _mat.setPosition(0, 0, 0);
    _mat.invert();

    _centre.copy(sphere.centre).applyMatrix4(_mat);
    const texel = (r * 2) / sun.shadow.mapSize.x;
    _centre.x = Math.round(_centre.x / texel) * texel;
    _centre.y = Math.round(_centre.y / texel) * texel;
    _mat.invert();
    _centre.applyMatrix4(_mat);

    sun.target.position.copy(_centre);
    sun.position.copy(_centre).addScaledVector(sky.sunDir, r + SHADOW_DEPTH_PAD * 0.5);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
    cs.updateProjectionMatrix();
  }

  // Everything below follows the sun's elevation, because a rig that does not
  // will be wrong the moment anybody touches the sky.
  function grade(dt) {
    const direct = Math.max(0, sky.sunDir.y);    // sine of the elevation angle

    // A low sun is *reddened and softened*, not dim. The first version of this
    // used a 0.55 exponent and landed on 1.26 against an ambient of 1.34 — with
    // ambient at parity a shadowed surface keeps the whole sky and loses only
    // the direct term, so nothing casts a shadow you can see. At 8.5° this
    // curve gives about 3.5, which is roughly a 4:1 key-to-fill and the reason
    // a mast throws a shadow across the apron instead of a smudge.
    const target = 1.2 + 4.5 * Math.pow(direct, 0.35);
    state.sunIntensity = smooth(state.sunIntensity, target, 6, dt);
    sun.intensity = state.sunIntensity;
    sun.color.copy(sky.sunColor);

    // As the direct light goes, the sky stops being a fill and becomes the
    // dominant source, so the environment has to come *up* as the sun goes
    // down. A rig that holds ambient constant goes black at exactly the hour
    // this level is set at — which is the failure this line exists to prevent,
    // and was the reason every up-facing surface here was reading near-black.
    // Enough to keep an up-facing surface off the floor, not so much that it
    // competes with the key. The balance to watch is the ratio, not either
    // number: this stays near a quarter of the sun, and the moment it reached
    // parity every cast shadow in the level disappeared.
    const envTarget = 0.55 + (1 - clamp(direct / 0.35, 0, 1)) * 0.55;
    state.envIntensity = smooth(state.envIntensity, envTarget, 5, dt);
    scene.environmentIntensity = state.envIntensity;
    // The viewmodel lives in its own scene with its own camera, so it does not
    // inherit any of this. It has to be told, or the weapon ends up lit by a
    // different sky than the world it is being carried through — which reads
    // instantly as a prop composited over a photograph.
    engine.view.environmentIntensity = state.envIntensity;
    if (!engine.view.environment) engine.view.environment = scene.environment;

    // Ground bounce tracks the sun and takes the sand's colour with it. It is
    // strongest when the sun is low, because that is when the most light is
    // striking the ground at a grazing angle right in front of the player.
    const graze = clamp(1 - direct / 0.5, 0, 1);
    bounce.intensity = 0.10 + 0.30 * direct * graze;
    bounce.groundColor.setRGB(
      sky.sunColor.r * 0.55 + 0.16,
      sky.sunColor.g * 0.42 + 0.11,
      sky.sunColor.b * 0.28 + 0.07,
    );
  }

  const api = {
    sun,
    bounce,
    get envIntensity() { return state.envIntensity; },
    get sunIntensity() { return state.sunIntensity; },

    setQuality(q) {
      state.range = SHADOW_RANGE[q] ?? 68;
      const size = engine.tier.shadow || 1024;
      sun.castShadow = size > 0 && state.range > 0;
      if (sun.castShadow && sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        // Three only reallocates the map once the old one has been thrown away.
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
    },

    update(dt) {
      grade(dt || 0.016);
      fitShadow();
    },

    dispose() {
      scene.remove(sun, sun.target, bounce);
      if (sun.shadow.map) sun.shadow.map.dispose();
      sun.dispose();
    },
  };

  // Grade once with a large dt so the first frame is already correct, rather
  // than easing up out of black over the opening half-second.
  grade(1);
  fitShadow();
  return api;
}
