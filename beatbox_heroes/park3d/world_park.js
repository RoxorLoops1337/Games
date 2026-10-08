// World module: the park (terrain.js + flora.js). create(ctx, args) -> { terrain, flora, npcSpecs, profile, update?, dispose? }; see host.js for the full world-module contract.
import { THREE } from './kit.js';
import { buildTerrain } from './terrain.js';
import { buildFlora } from './flora.js';
import { createPassersby } from './passersby.js';

const NOP = () => {};
function safe(name, fn, fallback) { try { return fn(); } catch (e) { console.error('[park3d] ' + name + ' failed: ' + (e && e.stack || e)); return fallback; } }

export default function create(ctx) {
  const terrain = safe('terrain', () => buildTerrain(ctx), { group: new THREE.Group(), bounds: { minX: -17, maxX: 17, minZ: -27, maxZ: 27 }, blocked: () => false, anchors: { start: { x: 0, z: 10, rot: Math.PI }, buskSpot: { x: 8, z: -8, rot: 0 }, bench: { x: -9, z: -4, rot: 0 }, gate: { x: 0, z: 26, rot: 0 }, runStart: { x: 12, z: 14, rot: 0 }, fountain: { x: 0, z: 0, rot: 0 }, graffiti: { x: 0, z: -26, rot: 0 }, flyers: { x: 4, z: 22, rot: 0 }, lamps: [] } });
  ctx.scene.add(terrain.group); // flora reads the scene, so the terrain must already be in it
  const flora = safe('flora', () => buildFlora(ctx, terrain), { group: new THREE.Group(), update: NOP });
  // people strolling along the paths (about 3.5k tris each, so the count follows the quality level)
  const walkers = safe('passersby', () => createPassersby(ctx, terrain, { count: ctx.quality === 'low' ? 3 : 4, seed: 9 }), null);
  if (walkers) ctx.scene.add(walkers.group); ctx.passersby = walkers;
  const update = (dt, t) => { if (!walkers) return; const w = ctx.host && ctx.host.world, pp = w && w.player && w.player.object.position; safe('passersby.update', () => walkers.update(dt, t, pp), null); };
  return { terrain, flora, npcSpecs: ['beeamgee'], profile: 'out', update, dispose() { if (walkers) walkers.dispose(); ctx.passersby = null; } };
}
