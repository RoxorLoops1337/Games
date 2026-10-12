// Gladiator factory: turns a sim gladiator record (core/sim.js makeGlad) into a rigged, geared, animated 3D fighter.
// Identity comes from: style kit (gear.js), build (bulk/height/shoulder per style + per recruit variance + level), face variant (g.face),
// hair / beard (deterministic from the record), tunic colour (shield, flaps, cloak), plume colour, rarity accents per equipped item,
// laurel pips (stars + level) on the chest.
import * as THREE from 'three';
import { buildGladiator } from './rig.js';
import { equipStyle } from './gear.js';

const D = () => globalThis.LM_D, LMg = () => globalThis.LM;

// Per-style silhouette (read at 20 m): murmillo is a wall, retiarius tall and lean, thraex compact, hoplomachus tall with plume, dimachaerus wide shoulders / narrow waist.
const BUILD = {
  murmillo: { build: { bulk: 1.16, height: 0.99, shoulder: 1.12, arm: 1.14, waist: 1.08, leg: 1.1 }, hair: ['bald', 'bald', 'crop'], beard: [0, 1, 2] },
  retiarius: { build: { bulk: 0.9, height: 1.06, shoulder: 0.97, arm: 0.92, waist: 0.88, leg: 0.95 }, hair: ['long', 'tied', 'short', 'tied'], beard: [0, 1, 0] },
  thraex: { build: { bulk: 1.0, height: 0.96, shoulder: 1.02, arm: 1.0, waist: 1.0, leg: 1.04 }, hair: ['bald', 'crop'], beard: [1, 2, 0] },
  hoplomachus: { build: { bulk: 1.06, height: 1.04, shoulder: 1.04, arm: 1.04, waist: 1.0, leg: 1.0 }, hair: ['crop', 'short'], beard: [2, 1, 0] },
  dimachaerus: { build: { bulk: 1.05, height: 1.0, shoulder: 1.1, arm: 1.08, waist: 0.88, leg: 1.0 }, hair: ['short', 'tied', 'crop', 'bald', 'long'], beard: [0, 1, 2, 0] },
};

// Most precious equipped item decides the metal tint, so a loadout reads at a glance.
const RAR_METAL = ['#8f8a82', '#b8803a', '#c9d6e6', '#b78cf0', '#f2c14e'];
const rarOf = (it) => (it ? (typeof it.rar === 'number' ? it.rar : typeof it.r === 'number' ? it.r : 0) : -1);
function metalFor(g) {
  let best = 1; const gear = g.gear || {};
  for (const k in gear) best = Math.max(best, rarOf(gear[k]));
  return RAR_METAL[Math.min(RAR_METAL.length - 1, best)];
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mul(a) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Deterministic look + build for a record: same gladiator always gets the same face, hair and body. */
export function lookFor(g, style) {
  const B = BUILD[style] || BUILD.murmillo, r = mul(hash(String(g.name || '') + '|' + (g.id || 0) + '|' + style));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const f = (v) => 1 + (r() - 0.5) * v;
  const lvl = Math.min(20, g.lvl || 1), bulkLvl = 1 + Math.min(0.045, lvl * 0.003);
  const b = B.build;
  return {
    look: { face: g.face != null ? g.face : Math.floor(r() * 3), hair: g.hairStyle || pick(B.hair), beard: g.beard != null ? g.beard : pick(B.beard) },
    build: { bulk: b.bulk * f(0.12) * bulkLvl, height: b.height * f(0.06), shoulder: b.shoulder * f(0.06), arm: b.arm * f(0.1), waist: b.waist * f(0.08), leg: b.leg * f(0.06) },
  };
}

/** unitOrGlad: an arena unit ({g, style}) or a glad record. opts: {scale, flip, tunic, seg, look, build} */
export function createGladiator(unitOrGlad, opts = {}) {
  const g = unitOrGlad.g || unitOrGlad;
  const style = g.style || unitOrGlad.style || 'murmillo';
  const S = D().STYLES[style];
  const cloth = opts.tunic || g.color || unitOrGlad.color || S.c;
  const lk = lookFor(g, style);
  const rig = buildGladiator({
    palette: { skin: g.skin, hair: g.hair, cloth, plume: g.plume, metal: metalFor(g) },
    build: Object.assign({ seg: opts.seg || 6 }, lk.build, opts.build || {}), look: Object.assign(lk.look, opts.look || {}),
    name: g.name || 'gladiator',
  });
  const rar = {}, gear = g.gear || {};
  for (const k of ['weapon', 'shield', 'armor', 'helm', 'charm']) rar[k] = Math.max(0, rarOf(gear[k]));
  const Lm = LMg(), stars = opts.stars || (Lm && Lm.stars ? Lm.stars(g) : 1);
  const out = equipStyle(rig, style, { rar, rarCol: D().RAR.map((x) => x.c), stars, lvl: g.lvl || 1, hasCharm: !!gear.charm });
  rig.animator.armed = 1;
  rig.style = style; rig.g = g;
  if (opts.scale) rig.root.scale.setScalar(opts.scale);
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  rig.resetSecondary();
  rig.setMetal = (hex) => rig.setPalette({ metal: hex });
  return rig;
}

export const STYLE_WEAPON = { murmillo: 'sword', retiarius: 'spear', thraex: 'sword', hoplomachus: 'spear', dimachaerus: 'dual' };
export { THREE };
