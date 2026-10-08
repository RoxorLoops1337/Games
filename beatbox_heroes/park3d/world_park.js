// World module: the park (terrain.js + flora.js). create(ctx, args) -> { terrain, flora, npcSpecs, profile, update?, dispose? }; see host.js for the full world-module contract.
// Story args (the game passes them from core.js, STORY_PLAN.md): args.beeamgee (default true) seats BeeAmGee on his bench (npcSpecs), args.jam (default false) lights the JAM:
//   the cypher on the plaza in front of the graffiti wall, an instanced crowd ring (char_crowd.js) with two named beatboxers and a 'jam' spot in the middle.
//   terrain.story = { bee, at, on(), setJam(on) }: setJam shows / hides the cypher and its spot later (the game calls it when the clock crosses 12:00 or 18:00).
import { THREE } from './kit.js';
import { buildTerrain } from './terrain.js';
import { buildFlora } from './flora.js';
import { createPassersby } from './passersby.js';
import { SPOT_DEFS } from './spots.js';
import { createCrowd } from './char_crowd.js';
import { createNPC } from './char_npc.js';

const NOP = () => {};
function safe(name, fn, fallback) { try { return fn(); } catch (e) { console.error('[park3d] ' + name + ' failed: ' + (e && e.stack || e)); return fallback; } }
export const JAM_AT = { x: 5.5, z: -20, rot: Math.PI };   // the plaza in front of the graffiti wall, east of the mural centre: no lamp post within the ring
const JAM_DEF = { id: 'jam', anchor: 'jam', label: 'JAM', icon: 'jam', color: '#9dff4a', color2: '#ff3ea5', cine: { snap: true, face: 'rot', clip: 'beatbox', zoom: 0.22 } };
const TAU = Math.PI * 2, GAP = 0.75;

// the cypher: a ring of spectators open towards the camera side (+z), and two regulars trading rounds inside it
function buildJam(ctx, terrain) {
  const group = new THREE.Group(); group.name = 'jam'; const { x, z } = JAM_AT, y = (terrain.heightAt && terrain.heightAt(x, z)) || 0, low = ctx.quality === 'low';
  const crowd = safe('jam crowd', () => createCrowd(ctx, low ? 10 : 16, { ring: { cx: x, cz: z, r0: 2.3, r1: 3.1, a0: GAP, a1: TAU - GAP }, y, seed: 23, energy: 0.6, bpm: 96 }), null);
  if (crowd) group.add(crowd.object);
  const NPCS = (typeof window !== 'undefined' && window.BBH && window.BBH.Core && window.BBH.Core.NPCS) || {}, crew = [];
  [['mira', Math.PI - 0.9, 'beatbox'], ['luca', Math.PI + 0.9, 'cheer']].forEach(([id, a, clip]) => {
    const c = safe('jam ' + id, () => createNPC(ctx, id, NPCS[id] ? { look: NPCS[id].look } : {}), null); if (!c) return;
    const px = x + Math.sin(a) * 1.7, pz = z + Math.cos(a) * 1.7; c.place(px, pz, Math.atan2(x - px, z - pz)); c.object.position.y = y; safe('jam clip', () => c.play(clip, { bpm: 96 }));
    group.add(c.object); crew.push(c);
  });
  return { group, crowd, crew, update(dt, t) { if (crowd) crowd.update(dt, t); for (let i = 0; i < crew.length; i++) crew[i].update(dt, t); }, dispose() { if (crowd) crowd.dispose(); crew.forEach((c) => { if (c.dispose) c.dispose(); }); } };
}

export default function create(ctx, args) {
  args = args || {};
  const terrain = safe('terrain', () => buildTerrain(ctx), { group: new THREE.Group(), bounds: { minX: -17, maxX: 17, minZ: -27, maxZ: 27 }, blocked: () => false, anchors: { start: { x: 0, z: 10, rot: Math.PI }, buskSpot: { x: 8, z: -8, rot: 0 }, bench: { x: -9, z: -4, rot: 0 }, gate: { x: 0, z: 26, rot: 0 }, runStart: { x: 12, z: 14, rot: 0 }, fountain: { x: 0, z: 0, rot: 0 }, graffiti: { x: 0, z: -26, rot: 0 }, flyers: { x: 4, z: 22, rot: 0 }, lamps: [] } });
  ctx.scene.add(terrain.group); // flora reads the scene, so the terrain must already be in it
  const flora = safe('flora', () => buildFlora(ctx, terrain), { group: new THREE.Group(), update: NOP });
  // people strolling along the paths (about 3.5k tris each, so the count follows the quality level)
  const walkers = safe('passersby', () => createPassersby(ctx, terrain, { count: ctx.quality === 'low' ? 3 : 4, seed: 9 }), null);
  if (walkers) ctx.scene.add(walkers.group); ctx.passersby = walkers;
  // story: BeeAmGee on his bench only once the story has him there; the jam spot sits in the list always and shows only while its anchor exists
  const bee = args.beeamgee !== false;
  terrain.spotDefs = SPOT_DEFS.map((d) => (d.id === 'bench' && !bee ? Object.assign({}, d, { label: 'REST' }) : d)).concat([JAM_DEF]);
  const jam = safe('jam', () => buildJam(ctx, terrain), null); let jamOn = false;
  if (jam) ctx.scene.add(jam.group);
  const setJam = (on) => { jamOn = !!on; if (jam) jam.group.visible = jamOn; if (terrain.anchors) { if (jamOn) terrain.anchors.jam = Object.assign({}, JAM_AT); else delete terrain.anchors.jam; } return jamOn; };
  setJam(!!args.jam);
  terrain.story = { bee, at: JAM_AT, on: () => jamOn, setJam, jam };
  const update = (dt, t) => { if (jam && jamOn) safe('jam.update', () => jam.update(dt, t), null); if (!walkers) return; const w = ctx.host && ctx.host.world, pp = w && w.player && w.player.object.position; safe('passersby.update', () => walkers.update(dt, t, pp), null); };
  return { terrain, flora, npcSpecs: bee ? ['beeamgee'] : [], profile: 'out', update, dispose() { if (walkers) walkers.dispose(); if (jam) jam.dispose(); ctx.passersby = null; } };
}
