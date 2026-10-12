// Gladiator factory: turns a sim gladiator record (core/sim.js makeGlad) into a rigged, geared, animated 3D fighter.
import * as THREE from 'three';
import { buildGladiator } from './rig.js';
import { equipStyle } from './gear.js';

const D = () => globalThis.LM_D;

// Per-style body build and torso material (silhouette first: a Murmillo is a wall, a Retiarius is lean).
const BUILD = {
  murmillo: { build: { bulk: 1.14, height: 1.0, shoulder: 1.08 }, torso: 'skin' },
  retiarius: { build: { bulk: 0.94, height: 1.02, shoulder: 0.98 }, torso: 'skin' },
  thraex: { build: { bulk: 1.0, height: 0.99, shoulder: 1.0 }, torso: 'leather' },
  hoplomachus: { build: { bulk: 1.06, height: 1.03, shoulder: 1.04 }, torso: 'cloth' },
  dimachaerus: { build: { bulk: 1.06, height: 1.0, shoulder: 1.05 }, torso: 'skin' },
};

// Most precious equipped item decides the metal tint, so a loadout reads at a glance.
const RAR_METAL = ['#8f8a82', '#b8803a', '#c9d6e6', '#b78cf0', '#f2c14e'];
function metalFor(g) {
  let best = 1;
  const gear = g.gear || {};
  for (const k in gear) { const it = gear[k]; if (it && typeof it.r === 'number') best = Math.max(best, it.r); }
  return RAR_METAL[Math.min(RAR_METAL.length - 1, best)];
}

/** unitOrGlad: an arena unit ({g, style}) or a glad record. opts: {scale, flip, tunic} */
export function createGladiator(unitOrGlad, opts = {}) {
  const g = unitOrGlad.g || unitOrGlad;
  const style = g.style || unitOrGlad.style || 'murmillo';
  const B = BUILD[style] || BUILD.murmillo;
  const S = D().STYLES[style];
  const cloth = opts.tunic || g.color || unitOrGlad.color || S.c;
  const rig = buildGladiator({
    palette: { skin: g.skin, hair: g.hair, cloth, plume: g.plume, metal: metalFor(g) },
    build: B.build, torso: B.torso, hair: style === 'retiarius' || style === 'dimachaerus' ? 'short' : 'short',
    name: g.name || 'gladiator', seg: opts.seg || 6,
  });
  const gear = equipStyle(rig, style);
  rig.animator.armed = 1;
  rig.style = style; rig.gear = gear; rig.g = g;
  if (opts.scale) rig.root.scale.setScalar(opts.scale);
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  rig.resetSecondary();
  rig.setMetal = (hex) => rig.setPalette({ metal: hex });
  return rig;
}

export const STYLE_WEAPON = { murmillo: 'sword', retiarius: 'spear', thraex: 'sword', hoplomachus: 'spear', dimachaerus: 'dual' };
export { THREE };
