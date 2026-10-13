// sky.js : sky dome shader (gradient + sun disc + halo + soft clouds + stars), time-of-day presets, light rig.
// One draw call, no textures. Follows the camera. Output is linear HDR (sun disc > 1 feeds bloom).
import * as THREE from 'three';

/** Time-of-day presets. Angles in degrees. Colors are sRGB hex (three converts to linear). */
export const TOD = {
  dawn: {
    sunElev: 9, sunAz: 105, sunColor: 0xffc8a0, sunInt: 2.6,
    hemiSky: 0x9fb2e0, hemiGround: 0xc88a6c, hemiInt: 0.95,
    fog: 0xf0c9b4, fogDensity: 0.0032,
    skyTop: 0x5f7fc0, skyMid: 0xe0a6aa, skyHor: 0xffd8b4, glow: 0xff9d7a,
    cloudLit: 0xfff0e0, cloudShade: 0xb08aa0, cloudAmt: 0.55, stars: 0.0, exposure: 0.95, night: 0.0, sunSize: 0.03,
  },
  golden: {
    sunElev: 16, sunAz: 232, sunColor: 0xffc489, sunInt: 3.5,
    hemiSky: 0x98a0d0, hemiGround: 0xb99872, hemiInt: 1.25,
    fog: 0xeab68a, fogDensity: 0.0024,
    skyTop: 0x3a6bb8, skyMid: 0xe0aa8e, skyHor: 0xffc27f, glow: 0xff9a40,
    cloudLit: 0xffd9a6, cloudShade: 0x8a6e9a, cloudAmt: 0.6, stars: 0.0, exposure: 0.9, night: 0.0, sunSize: 0.032,
  },
  dusk: {
    sunElev: 3, sunAz: 250, sunColor: 0xff7a3d, sunInt: 2.3,
    hemiSky: 0x5d6ab0, hemiGround: 0x8a4a3c, hemiInt: 0.8,
    fog: 0xb86e72, fogDensity: 0.0034,
    skyTop: 0x2b3578, skyMid: 0xa04c78, skyHor: 0xff8450, glow: 0xff5a30,
    cloudLit: 0xff9a70, cloudShade: 0x4a3a78, cloudAmt: 0.6, stars: 0.15, exposure: 1.0, night: 0.55, sunSize: 0.034,
  },
  night: {
    sunElev: 38, sunAz: 120, sunColor: 0x8fa8ff, sunInt: 0.85, // "sun" light acts as moon
    hemiSky: 0x2c3f7c, hemiGround: 0x3a2e4c, hemiInt: 1.05,
    fog: 0x0f1636, fogDensity: 0.0032,
    skyTop: 0x050a1e, skyMid: 0x0e1840, skyHor: 0x24325e, glow: 0x4a5fb0,
    cloudLit: 0x6a7ab8, cloudShade: 0x161c3c, cloudAmt: 0.35, stars: 1.0, exposure: 1.15, night: 1.0, sunSize: 0.02,
  },
};

const NUM_KEYS = ['sunElev', 'sunInt', 'hemiInt', 'fogDensity', 'cloudAmt', 'stars', 'exposure', 'night', 'sunSize'];
const COL_KEYS = ['sunColor', 'hemiSky', 'hemiGround', 'fog', 'skyTop', 'skyMid', 'skyHor', 'glow', 'cloudLit', 'cloudShade'];
const _ca = new THREE.Color(), _cb = new THREE.Color();
/** Blend two presets (names or objects). Returns a plain preset with hex colors. */
export function lerpTOD(a, b, t) {
  a = typeof a === 'string' ? TOD[a] : a; b = typeof b === 'string' ? TOD[b] : b;
  const o = {};
  for (const k of NUM_KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  let da = ((b.sunAz - a.sunAz + 540) % 360) - 180; o.sunAz = a.sunAz + da * t;
  for (const k of COL_KEYS) { _ca.setHex(a[k]); _cb.setHex(b[k]); o[k] = _ca.lerp(_cb, t).getHex(); }
  return o;
}
/** Hour 0..24 -> blended preset (5=dawn, 8..16 golden-ish, 19=dusk, 22..3=night). */
export function todFromHour(h) {
  const keys = [[0, 'night'], [4.5, 'night'], [6, 'dawn'], [9, 'golden'], [16.5, 'golden'], [19, 'dusk'], [20.5, 'night'], [24, 'night']];
  for (let i = 0; i < keys.length - 1; i++) if (h >= keys[i][0] && h <= keys[i + 1][0]) return lerpTOD(keys[i][1], keys[i + 1][1], (h - keys[i][0]) / (keys[i + 1][0] - keys[i][0] || 1));
  return TOD.golden;
}

const VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // pinned to the far plane
}`;
const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uTop, uMid, uHor, uGlow, uSunDir, uSunCol, uCloudLit, uCloudShade;
uniform float uTime, uSunSize, uSunInt, uStars, uCloudAmt;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<5;i++){ s += a*vn(p); p = p*2.03 + 7.1; a *= .5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 col = mix(uHor, uMid, smoothstep(-0.02, 0.28, e));
  col = mix(col, uTop, smoothstep(0.16, 0.95, e));
  col = mix(col, uHor * 0.55, smoothstep(0.0, -0.35, e));          // below horizon (mostly hidden by terrain)
  float sd = max(dot(d, uSunDir), 0.0);
  float horizonBand = exp(-abs(e) * 5.0);
  col += uGlow * (pow(sd, 5.0) * 0.28 + pow(sd, 40.0) * 0.55) * (0.35 + horizonBand);
  col += uGlow * 0.16 * horizonBand * pow(max(dot(normalize(vec3(d.x,0.,d.z) + vec3(1e-4,0.,0.)), normalize(vec3(uSunDir.x,0.,uSunDir.z) + vec3(1e-4,0.,0.))),0.), 3.0);
  // clouds: project onto a plane above the viewer, drifting
  if (e > 0.015) {
    vec2 p = d.xz / (e + 0.18) * 1.15 + vec2(uTime * 0.006, uTime * 0.002);
    float dens = fbm(p);
    float cov = smoothstep(0.52 - uCloudAmt * 0.16, 0.86, dens) * smoothstep(0.015, 0.22, e);
    vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.09;
    float dens2 = fbm(p + toSun);
    float lit = clamp(0.55 + (dens - dens2) * 5.0, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    cc += uSunCol * pow(sd, 6.0) * 0.45 * (1.0 - cov * 0.4);       // silver/gold lining toward the sun
    col = mix(col, cc, cov * 0.88);
    // stars
    if (uStars > 0.01) {
      vec3 sp = d * 260.0; vec3 ci = floor(sp); float r = fract(sin(dot(ci, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float tw = 0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0);
      float st = step(0.9965, r) * tw * smoothstep(0.05, 0.3, e) * (1.0 - cov);
      col += vec3(0.8, 0.85, 1.0) * st * uStars * 1.6;
    }
  }
  // sun disc (HDR, drives bloom)
  float cs = cos(uSunSize);
  float disc = smoothstep(cs - 0.0006, cs + 0.00025, sd);
  col += uSunCol * disc * uSunInt;
  col += (h21(gl_FragCoord.xy) - 0.5) * (1.0/255.0);               // de-band
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky() {
  const u = {
    uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 0.2, 1) }, uSunCol: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
    uTime: { value: 0 }, uSunSize: { value: 0.03 }, uSunInt: { value: 9 }, uStars: { value: 0 }, uCloudAmt: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  mesh.name = 'sky';
  return { mesh, uniforms: u, update(camera, t) { mesh.position.copy(camera.position); mesh.scale.setScalar(camera.far * 0.5); u.uTime.value = t; } };
}

/** Key sun (single shadow caster) + hemisphere fill. */
export function createLightRig(scene, { shadowSize = 2048, shadowRadius = 50, shadowCenter = new THREE.Vector3(), near = 1, far = 260 } = {}) {
  const sun = new THREE.DirectionalLight(0xffb25e, 3.5);
  sun.castShadow = shadowSize > 0;
  sun.shadow.mapSize.set(shadowSize || 1, shadowSize || 1);
  const c = sun.shadow.camera; c.left = c.bottom = -shadowRadius; c.right = c.top = shadowRadius; c.near = near; c.far = far;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2.5;
  const hemi = new THREE.HemisphereLight(0x86a2d8, 0xb8743f, 1.0);
  sun.target.position.copy(shadowCenter);
  scene.add(sun, sun.target, hemi);
  scene.fog = new THREE.FogExp2(0xe9b88c, 0.003);
  const rig = { sun, hemi, shadowCenter: shadowCenter.clone(), sunDir: new THREE.Vector3(), setShadowSize(n) { sun.shadow.mapSize.set(n, n); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } };
  return rig;
}

/** Apply a preset (name or object) to rig/scene/sky/renderer. `shared` = any object with {night:{value}} uniforms to drive torches etc. */
export function applyTOD(preset, { rig, scene, sky, renderer, post, nightUniforms = [] }) {
  const p = typeof preset === 'string' ? TOD[preset] : preset;
  const el = THREE.MathUtils.degToRad(p.sunElev), az = THREE.MathUtils.degToRad(p.sunAz);
  rig.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  rig.sun.position.copy(rig.shadowCenter).addScaledVector(rig.sunDir, 120);
  rig.sun.color.setHex(p.sunColor); rig.sun.intensity = p.sunInt;
  rig.hemi.color.setHex(p.hemiSky); rig.hemi.groundColor.setHex(p.hemiGround); rig.hemi.intensity = p.hemiInt;
  scene.fog.color.setHex(p.fog); scene.fog.density = p.fogDensity;
  if (renderer) renderer.toneMappingExposure = p.exposure;
  if (sky) {
    const u = sky.uniforms;
    u.uTop.value.setHex(p.skyTop); u.uMid.value.setHex(p.skyMid); u.uHor.value.setHex(p.skyHor); u.uGlow.value.setHex(p.glow);
    u.uSunDir.value.copy(rig.sunDir); u.uSunCol.value.setHex(p.night > 0.8 ? 0xcfd8ff : p.sunColor);
    u.uCloudLit.value.setHex(p.cloudLit); u.uCloudShade.value.setHex(p.cloudShade);
    u.uCloudAmt.value = p.cloudAmt; u.uStars.value = p.stars; u.uSunSize.value = p.sunSize;
    u.uSunInt.value = p.night > 0.8 ? 3.0 : 10.0;           // moon disc dimmer
  }
  for (const n of nightUniforms) n.value = p.night;
  // light shadow tint: the shadow side is lit by hemi sky (blue/violet) = cool shadows
  return p;
}
