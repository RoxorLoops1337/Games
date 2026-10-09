// Encore Island 3D, lands: the creature den (a glowing swirling portal pit tinted by the land's foe colour, motes rising out of it)
// and the land's HOME warp pad (the 2D drawPad look: a teal stone disc, a turning rune ring, a floating way icon).
import * as THREE from 'three';
import { Builder, INK, TAU, PI, seg, addOutline, LOOK, rng } from './kit.js';
import { iconTex } from './plate3d.js';
import { moteField, beamMesh, glowSprite, ringMesh, texSprite, col, disposeDeep } from './lands_fx.js';

const OUT = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const SWIRL_V = 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SWIRL_F = `varying vec2 vP; uniform float uT, uK, uPulse; uniform vec3 uCol;
void main(){
  float r = length(vP), ang = atan(vP.y, vP.x);
  vec3 dark = vec3(0.07, 0.02, 0.15);
  float arms = pow(sin(ang * 2.0 + r * 8.0 - uT * 2.4 + uK) * 0.5 + 0.5, 1.5), arms2 = pow(sin(ang * 3.0 - r * 11.0 + uT * 1.7 + uK) * 0.5 + 0.5, 3.0);
  float ring = smoothstep(0.80, 0.9, r) * (1.0 - smoothstep(0.93, 1.0, r));
  vec3 c = mix(dark, uCol * 1.15, arms * smoothstep(0.05, 0.7, r) * (0.55 + 0.45 * uPulse));
  c += uCol * arms2 * 0.35 * smoothstep(0.2, 0.9, r) + uCol * ring * 0.9 + vec3(1.0) * ring * 0.18 + uCol * 0.6 * exp(-r * 7.0) * (0.5 + 0.5 * uPulse);
  gl_FragColor = vec4(c, 1.0 - smoothstep(0.97, 1.0, r));${OUT}
}`;
const _plane = new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2); _plane.userData.sharedGeo = true;

/** the den of land z (z.g.den px). Returns { g, update(dt, t), dispose() } with g positioned in world units. */
export function makeDen(z) {
  const k = z.k, fc = typeof foeCol === 'function' ? foeCol(k) : '#ff6a5a', fcol = new THREE.Color(fc), light = fcol.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const g = new THREE.Group(), b = new Builder({ ao: 0.2 }), r = rng(k * 13 + 5);
  b.cyl(INK, 0, 0, 0, 1.08, 0.06, seg(28)); b.cyl(0x4a2f7a, 0, 0, 0, 1.0, 0.1, seg(28)); b.cyl(0x2a1850, 0, 0, 0, 0.84, 0.115, seg(28));
  const n = 11; for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * 0.2, rd = 1.02 + r() * 0.06, s = 0.2 + r() * 0.1; b.ball(i & 1 ? 0x6a4aa8 : 0x5a3f98, Math.cos(a) * rd, 0.1 + s * 0.2, Math.sin(a) * rd, s, 0.72, 0.9); b.ball(0x8f6be8, Math.cos(a) * rd, 0.1 + s * 0.55, Math.sin(a) * rd, s * 0.45, 0.6, 0.8); }
  const rim = b.build({ cast: true }); rim.children.forEach((m) => addOutline(m, 0.02)); g.add(rim);
  // crystals in the foe colour poke out of the rim
  const cb = new Builder({ ao: 0.1 }), cc = fcol.clone().lerp(new THREE.Color(0xffffff), 0.25).getHex();
  for (let i = 0; i < 6; i++) { const a = (i + 0.3) / 6 * TAU + r() * 0.3, rd = 1.14 + r() * 0.08, h = 0.42 + r() * 0.34; cb.cone(cc, Math.cos(a) * rd, 0.05, Math.sin(a) * rd, 0.1 + r() * 0.04, h, 5); cb.cone(cc, Math.cos(a + 0.2) * (rd + 0.08), 0.05, Math.sin(a + 0.2) * (rd + 0.08), 0.06, h * 0.6, 5); }
  const cr = cb.build({ cast: false }); g.add(cr);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, uniforms: { uT: LOOK.t, uK: { value: k * 1.7 }, uPulse: { value: 0 }, uCol: { value: fcol } }, vertexShader: SWIRL_V, fragmentShader: SWIRL_F });
  m.userData.noCast = m.userData.noLook = m.userData.own = true;
  const sw = new THREE.Mesh(_plane, m); sw.userData.sharedGeo = true; sw.scale.set(0.84, 1, 0.84); sw.position.y = 0.125; sw.renderOrder = 3; g.add(sw);
  const motes = moteField({ n: 22, h: 2.4, r: 0.62, cone: 0.75, size: 0.17, speed: 0.32, sway: 0.2, c: light.getHex(), c2: 0xffffff, seed: k * 7 + 1 }); motes.position.y = 0.1; g.add(motes);
  const beam = beamMesh(0.8, 0.3, 2.6, { c: fcol.getHex(), a: 0.16, fall: 1.2, stripes: 4, spd: 1.5 }); beam.position.y = 0.1; g.add(beam);
  const glow = glowSprite(fc, 3.4, { flat: true, a: 0.45 }); glow.position.y = 0.08; g.add(glow);
  return { g, update(dt, t) { m.uniforms.uPulse.value = 0.5 + 0.5 * Math.sin(t * 2 + k); beam.userData.u.uA.value = 0.11 + 0.07 * m.uniforms.uPulse.value + 0.04 * LOOK.beat.value; glow.scale.setScalar(3.2 + 0.4 * m.uniforms.uPulse.value); }, dispose() { disposeDeep(g); } };
}

// ================================================================= HOME warp pad (only once S.waygate): z.pad px
const PAD_TEAL = 0x6ec9e0;
export function makePad(V, label) {
  const g = new THREE.Group(), b = new Builder({ ao: 0.12 });
  b.cyl(INK, 0, 0, 0, 1.0, 0.05, seg(40)); b.cyl(0xdff8ff, 0, 0, 0, 0.93, 0.1, seg(40)); b.cyl(0x2a5a9a, 0, 0, 0, 0.84, 0.118, seg(40)); b.cyl(PAD_TEAL, 0, 0, 0, 0.7, 0.128, seg(36)); b.cyl(0x9fe8f6, 0, 0, 0, 0.36, 0.135, seg(28));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.ball(0xb8f4ff, Math.cos(a) * 0.9, 0.1, Math.sin(a) * 0.9, 0.04, 0.7); }
  const base = b.build({ cast: false }); g.add(base);
  const runes = ringMesh({ c: 0xb8f4ff, a: 1, r: 1, in: 0.58, out: 0.67, dash: 14, speed: -0.3, soft: 0.02, y: 0.16 }); runes.scale.set(0.9, 1, 0.9); g.add(runes);
  const glow = glowSprite(PAD_TEAL, 3.6, { flat: true, a: 0.4 }); glow.position.y = 0.17; g.add(glow);
  const beam = beamMesh(0.62, 0.42, 2.4, { c: 0x8fe8ff, a: 0.12, fall: 1.0, stripes: 4, spd: 2 }); beam.position.y = 0.15; g.add(beam);
  const icon = texSprite(iconTex('way'), 1.15); icon.position.y = 1.35; g.add(icon);
  const motes = moteField({ n: 12, h: 2.0, r: 0.5, cone: 0.6, size: 0.13, speed: 0.3, c: 0xb8f4ff, c2: 0xffffff, seed: 9 }); motes.position.y = 0.15; g.add(motes);
  return { g, label, update(dt, t, x, z) {
    icon.position.y = 1.35 + Math.sin(t * 2.5 + x) * 0.07; glow.scale.setScalar(3.4 + 0.3 * Math.sin(t * 4 + x));
    if (V.labels) V.labels.pill(label, x, 0.05, z + 1.05, { c1: '#b8f4ff', c2: '#6ec9e0', px: 11 });
  }, dispose() { disposeDeep(g); } };
}
