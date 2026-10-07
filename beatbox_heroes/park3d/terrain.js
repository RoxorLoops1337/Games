// TERRAIN module (Environment Artist A). Owns: ground, grass, paths, plaza, fountain, fence + gate, brick graffiti wall (BEAT BOX mural),
// lamp posts, benches, the busking crate-stage with amp, the jogging loop, small clutter. World units = metres, park footprint about 36 (x) by 56 (z),
// +z toward the camera, gate at the far or near end. Return value is the CONTRACT other modules rely on:
//   { group: THREE.Group, bounds: {minX,maxX,minZ,maxZ}, blocked(x,z) -> bool (solid props, water, fence),
//     anchors: { start, buskSpot, bench, gate, runStart, fountain, graffiti, flyers, lamps:[{x,y,z}] }  // each {x,z,rot}
//     update?(dt, t) }
// Extras: heightAt(x,z), addBlocker(x,z,r), anchors.benches[], anchors.neon[], anchors.stageLights[], anchors.wall{...}
import { THREE, flatMat, rng } from './kit.js';
import { Buf, makeCollider, col } from './terrain_util.js';
import { makeField, buildGroundGeo, buildFlats, buildKerbs, softDisc } from './terrain_ground.js';
import { buildFountain } from './terrain_fountain.js';
import { buildWall } from './terrain_wall.js';
import { makeAtlas } from './terrain_atlas.js';
import { buildFence, placeLamps } from './terrain_props.js';
import { buildScene } from './terrain_scene.js';

export function buildTerrain(ctx) {
  const group = new THREE.Group(); group.name = 'terrain';
  const S = { rand: rng(4242), B: new Buf({ rng: rng(77) }), OV: new Buf({ rng: rng(78) }), SOFT: new Buf({ alpha: true }), GLOW: new Buf(), DEC: new Buf({ uv: true }), OUT: new Buf({ rng: rng(79) }), hit: makeCollider(), anchors: {}, lamps: [], updaters: [], extra: [] };
  const F = makeField(); S.F = F; S.hAt = F.heightAt;
  S.group = group; S.soft = (x, z, rx, rz, c, a, ry, y, seg) => softDisc(S.SOFT, x, y === undefined ? 0.04 : y, z, rx, rz, c, a, ry || 0, seg);
  const add = (geo, mat, o) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!(o && o.cast); m.receiveShadow = !(o && o.receive === false); if (o && o.order) m.renderOrder = o.order; group.add(m); return m; };

  add(buildGroundGeo(F, S), flatMat());
  buildFlats(F, S);
  buildKerbs(F, S);
  add(S.OUT.geometry(false), flatMat(), { receive: false });
  add(S.OV.geometry(false), flatMat({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));

  const atlas = makeAtlas(); S.atlas = atlas;
  S.decal = (name, x, y, z, w, h, ry, rx, tint, rz) => { const r = atlas.rect[name]; if (!r) return; S.DEC.push(x, y, z, ry || 0, 1, rx || 0, rz || 0); S.DEC.uquad([-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0], r[0], r[1], r[2], r[3], tint || [1, 1, 1]); S.DEC.pop(); };
  buildFountain(S);
  buildWall(S);
  buildFence(S);
  buildScene(S);
  placeLamps(S, F);
  add(S.B.geometry(true), flatMat(), { cast: true });
  add(S.GLOW.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), { receive: false });
  add(S.SOFT.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), { receive: false, order: 2 });

  add(S.DEC.geometry(false), new THREE.MeshLambertMaterial({ map: atlas.tex, vertexColors: true, transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), { order: 3 });

  const anchors = Object.assign({ start: { x: 0, z: 10, rot: Math.PI }, buskSpot: { x: 8, z: -8, rot: 0 }, bench: { x: -9, z: -4, rot: Math.PI / 2 }, gate: { x: 0, z: 26, rot: 0 }, runStart: { x: 12, z: 14, rot: 0 }, fountain: { x: 0, z: 0, rot: 0 }, graffiti: { x: 0, z: -24, rot: Math.PI }, flyers: { x: 4, z: 22, rot: Math.PI }, lamps: S.lamps }, S.anchors);
  const bounds = { minX: -17, maxX: 17, minZ: -27, maxZ: 27 };
  return { group, bounds, anchors, heightAt: F.heightAt, addBlocker: (x, z, r) => S.hit.circle(x, z, r), blocked: (x, z) => S.hit.test(x, z), update(dt, t) { for (const u of S.updaters) u(dt, t); } };
}
