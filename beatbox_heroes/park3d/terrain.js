// TERRAIN module (Environment Artist A). Owns: ground, grass, paths, plaza, fountain, fence + gate, brick graffiti wall (BEAT BOX mural),
// lamp posts, benches, the busking crate-stage with amp, the jogging loop, small clutter. World units = metres, park footprint about 36 (x) by 56 (z),
// +z toward the camera, gate at the far or near end. Return value is the CONTRACT other modules rely on:
//   { group: THREE.Group, bounds: {minX,maxX,minZ,maxZ}, blocked(x,z) -> bool (solid props, water, fence),
//     anchors: { start, buskSpot, bench, gate, runStart, fountain, graffiti, flyers, lamps:[{x,y,z}] }  // each {x,z,rot}
//     update?(dt, t) }
import { THREE, flatMat, mesh, box } from './kit.js';
export function buildTerrain(ctx) {
  const group = new THREE.Group(); const g = new THREE.PlaneGeometry(36, 56, 1, 1); g.rotateX(-Math.PI / 2);
  const m = mesh(g, ctx.kit.solidMat('#4f9a4a')); m.castShadow = false; group.add(m);
  return { group, bounds: { minX: -17, maxX: 17, minZ: -27, maxZ: 27 }, blocked: () => false, anchors: { start: { x: 0, z: 10, rot: Math.PI }, buskSpot: { x: 4, z: -4, rot: 0 }, bench: { x: -8, z: -2, rot: Math.PI / 2 }, gate: { x: 0, z: 26, rot: 0 }, runStart: { x: 10, z: 12, rot: 0 }, fountain: { x: 0, z: 0, rot: 0 }, graffiti: { x: 0, z: -24, rot: 0 }, flyers: { x: 6, z: 22, rot: 0 }, lamps: [] } };
}
