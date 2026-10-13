// Gladiator factory: turns a sim gladiator record (core/sim.js makeGlad) into a rigged, geared, animated 3D fighter.
// Identity comes from: style kit (gear.js), build (bulk/height/shoulder per style + per recruit variance + level), face variant (g.face),
// hair / beard (deterministic from the record), tunic colour (shield, flaps, cloak), plume colour, rarity accents per equipped item,
// laurel pips (stars + level) on the chest.
import * as THREE from 'three';
import { buildGladiator, detailLevel } from './rig.js';
import { equipStyle } from './gear.js';

const D = () => globalThis.LM_D, LMg = () => globalThis.LM;

// Character detail follows the render tier: low = the cheap rig (6-sided limbs, decal face), medium = shaped 8-sided limbs and painted face map, high = full close-up
// detail. Resolution order: opts.detail, setCharacterTier(), globalThis.LM3D_TIER, __LM3D.tier (main.js), ?tier=, high. Callers that pass a segment count of 8+
// (portraits) get high detail whatever the tier: one rig on an offscreen canvas can afford it.
let _tier = null;
export function setCharacterTier(t) { _tier = t || null; }
function currentTier() {
  if (_tier) return _tier; const g = globalThis; if (g.LM3D_TIER) return g.LM3D_TIER; if (g.__LM3D && g.__LM3D.tier) return g.__LM3D.tier;
  try { const q = new URLSearchParams(g.location && g.location.search).get('tier'); if (q) return q; } catch (e) { /* no location (node) */ }
  return 'high';
}
export function detailFor(opts = {}) { if (opts.detail !== undefined && opts.detail !== null) return opts.detail; if (opts.seg >= 8) return 'high'; const t = currentTier(); return t === 'low' ? 'low' : t === 'medium' ? 'medium' : 'high'; }

// Per-style silhouette (read at 20 m): murmillo is a wall, retiarius tall and lean, thraex compact, hoplomachus tall with plume, dimachaerus wide shoulders / narrow waist.
const BUILD = {
  murmillo: { build: { bulk: 1.16, height: 0.99, shoulder: 1.12, arm: 1.14, waist: 1.08, leg: 1.1 }, hair: ['bald', 'bald', 'crop', 'curls'], beard: [0, 1, 2] },
  retiarius: { build: { bulk: 0.9, height: 1.06, shoulder: 0.97, arm: 0.92, waist: 0.88, leg: 0.95 }, hair: ['long', 'tied', 'short', 'braid', 'tied'], beard: [0, 1, 0] },
  thraex: { build: { bulk: 1.0, height: 0.96, shoulder: 1.02, arm: 1.0, waist: 1.0, leg: 1.04 }, hair: ['bald', 'crop', 'curls'], beard: [1, 2, 0] },
  hoplomachus: { build: { bulk: 1.06, height: 1.04, shoulder: 1.04, arm: 1.04, waist: 1.0, leg: 1.0 }, hair: ['crop', 'short', 'curls'], beard: [2, 1, 0] },
  dimachaerus: { build: { bulk: 1.05, height: 1.0, shoulder: 1.1, arm: 1.08, waist: 0.88, leg: 1.0 }, hair: ['short', 'tied', 'crop', 'bald', 'long', 'braid', 'curls'], beard: [0, 1, 2, 0] },
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

/** unitOrGlad: an arena unit ({g, style}) or a glad record. opts: {scale, flip, tunic, seg, look, build, detail: 'low'|'medium'|'high'} */
export function createGladiator(unitOrGlad, opts = {}) {
  const g = unitOrGlad.g || unitOrGlad;
  const style = g.style || unitOrGlad.style || 'murmillo';
  const S = D().STYLES[style];
  const cloth = opts.tunic || g.color || unitOrGlad.color || S.c;
  const lk = lookFor(g, style);
  const rig = buildGladiator({
    palette: { skin: g.skin, hair: g.hair, cloth, plume: g.plume, metal: metalFor(g) },
    build: Object.assign({ seg: opts.seg || 6 }, lk.build, opts.build || {}), look: Object.assign(lk.look, opts.look || {}), detail: detailFor(opts),
    name: g.name || 'gladiator', sculpt: !(style === 'thraex' || style === 'hoplomachus'),
  });
  const rar = {}, gear = g.gear || {};
  for (const k of ['weapon', 'shield', 'armor', 'helm', 'charm']) rar[k] = Math.max(0, rarOf(gear[k]));
  const Lm = LMg(), stars = opts.stars || (Lm && Lm.stars ? Lm.stars(g) : 1);
  const out = equipStyle(rig, style, { rar, rarCol: D().RAR.map((x) => x.c), stars, lvl: g.lvl || 1, hasCharm: !!gear.charm, g });
  rig.animator.armed = 1;
  rig.style = style; rig.g = g;
  if (opts.scale) rig.root.scale.setScalar(opts.scale);
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  // SCARS: a cheap limp / stiff arm layered on top of the clip player (no per-joint speed API exists): after the animator wrote the joints, nudge them
  const sc = g.scars || [];
  if (sc.indexOf('bad_knee') >= 0 || sc.indexOf('stiff_arm') >= 0 || sc.indexOf('old_ribs') >= 0) {
    const an = rig.animator, up0 = an.update.bind(an), J = rig.joints, knee = sc.indexOf('bad_knee') >= 0, arm = sc.indexOf('stiff_arm') >= 0, ribs = sc.indexOf('old_ribs') >= 0, qx = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0), az = new THREE.Vector3(0, 0, 1);
    an.update = (dt) => {
      up0(dt);
      const mv = Math.min(1, Math.hypot(an.mv.vx, an.mv.vz) / 2.2), idle = !an.action && !an.dead;
      if (knee && mv > 0.05) { const ph = Math.sin(an.mv.phase), dip = 0.5 + 0.5 * ph; J.hips.position.y -= 0.032 * mv * dip; J.kneeL.quaternion.multiply(qx.setFromAxisAngle(ax, -0.1 * mv * dip)); J.hips.quaternion.multiply(qx.setFromAxisAngle(az, 0.05 * mv * (dip - 0.5))); }
      if (arm && idle) J.shoulderR.quaternion.multiply(qx.setFromAxisAngle(az, 0.1));
      if (ribs && idle) J.chest.quaternion.multiply(qx.setFromAxisAngle(ax, 0.045));
    };
  }
  rig.resetSecondary();
  rig.setMetal = (hex) => rig.setPalette({ metal: hex });
  return rig;
}

export const STYLE_WEAPON = { murmillo: 'sword', retiarius: 'spear', thraex: 'sword', hoplomachus: 'spear', dimachaerus: 'dual' };
export { THREE };
