// LIGHTING module (Lighting and VFX Artist). Owns: sky gradient dome, sun (directional, soft shadows), hemisphere + rim lights, fog, tone mapping, post
// (bloom via EffectComposer with a cheap path for low quality, vignette, colour grade), lamp light cones, god rays, fireflies, floating music notes.
// CONTRACT: buildLighting(ctx, terrain) -> { setTimeOfDay('day'|'dusk'|'night'|0..1), update(dt, t), render() (optional: replaces renderer.render with the composer), resize(w,h), setQuality(q), group }
// The default look is GOLDEN HOUR with the first neon and lamps just lighting up.
import { THREE } from './kit.js';
export function buildLighting(ctx, terrain) {
  const group = new THREE.Group(); const sun = new THREE.DirectionalLight('#ffc28a', 2.2); sun.position.set(-12, 16, 10); sun.castShadow = true; group.add(sun, new THREE.HemisphereLight('#8e86d6', '#5a3a5c', 1.1));
  ctx.scene.background = new THREE.Color('#c2548f'); return { group, setTimeOfDay() {}, update() {}, resize() {}, setQuality() {} };
}
