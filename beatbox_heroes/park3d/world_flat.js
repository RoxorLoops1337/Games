// World module: Tay and Foxy's flat (flat*.js), an interior dollhouse. See host.js for the world-module contract.
import { THREE } from './kit.js';
import { buildFlat } from './flat.js';

const NOP = () => {};
export default function create(ctx, args) {
  ctx.todInit = args && args.time !== undefined ? args.time : 'dusk';
  let terrain;
  try { terrain = buildFlat(ctx); } catch (e) { console.error('[park3d] terrain failed: ' + (e && e.stack || e)); terrain = { group: new THREE.Group(), bounds: { minX: -17, maxX: 17, minZ: -27, maxZ: 27 }, blocked: () => false, anchors: { start: { x: 0, z: 10, rot: Math.PI }, lamps: [] } }; }
  return { terrain, flora: { group: new THREE.Group(), update: NOP }, npcSpecs: ['foxy'], profile: 'in' };
}
