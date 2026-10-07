// Flat3D interior (Interior Artist). Tay and Foxy's one-floor flat in Neon City, a golden-hour dollhouse: north and west walls full height with windows,
// south and east walls cut low so the camera (south-east, above) looks in. Contract: see FLAT_PLAN.md.
//   buildFlat(ctx) -> { group, interior:true, bounds, blocked, heightAt, pathDist, keepout, paths, anchors, spotDefs, camera, lights, windows, outside, update }
// Layout (metres, +z toward the camera, origin = centre of the living room): see flat_*.js. Geometry goes into a few merged stores (flat_kit.js makeStore):
//   main (flat shaded vertex colours, casts shadows), glow (night emissive), screens (always-on decals), decals (lit), soft contact blobs, glass.
import { THREE, flatMat } from './kit.js';
import { makeStore, glowLambert } from './flat_kit.js';
import { makeFlatAtlas } from './flat_atlas.js';
import { buildShell, WALLS, WINDOWS } from './flat_shell.js';
import { buildOutside } from './flat_outside.js';
import { buildLiving } from './flat_living.js';
import { buildKitchen } from './flat_kitchen.js';
import { buildBedroom } from './flat_bedroom.js';
import { buildWork } from './flat_work.js';
import { buildEntry } from './flat_entry.js';

export function buildFlat(ctx) {
  const group = new THREE.Group(); group.name = 'flat';
  const S = makeStore(); S.atlas = makeFlatAtlas(); S.group = group; S.updaters = [];
  const guard = (name, fn) => { try { fn(S); } catch (e) { console.error('[flat3d] ' + name + ' failed: ' + (e && e.stack || e)); } };
  guard('shell', buildShell); guard('living', buildLiving); guard('kitchen', buildKitchen); guard('bedroom', buildBedroom); guard('work', buildWork); guard('entry', buildEntry);

  // ---------------------------------------------------------------- meshes
  const add = (geo, mat, o) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!(o && o.cast); m.receiveShadow = !(o && o.receive === false); if (o && o.order) m.renderOrder = o.order; if (o && o.name) m.name = o.name; group.add(m); return m; };
  const main = add(S.B.geometry(true), flatMat(), { cast: true, name: 'flat_main' }); main.frustumCulled = false;
  const glowMat = glowLambert(1.0); add(S.GLOW.geometry(false), glowMat, { cast: false, name: 'flat_glow' }).frustumCulled = false;
  const decMat = new THREE.MeshLambertMaterial({ map: S.atlas.tex, vertexColors: true, transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  add(S.DEC.geometry(false), decMat, { name: 'flat_decals', order: 2 }).frustumCulled = false;
  const scrMat = new THREE.MeshBasicMaterial({ map: S.atlas.tex, vertexColors: true, transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); scrMat.userData.screen = true;
  add(S.SCR.geometry(false), scrMat, { receive: false, name: 'flat_screens', order: 3 }).frustumCulled = false;
  add(S.SOFT.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), { receive: false, order: 1, name: 'flat_soft' }).frustumCulled = false;
  const glassMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }); glassMat.userData.windowPane = true;
  add(S.GLASS.geometry(false), glassMat, { receive: false, order: 4, name: 'flat_glass' }).frustumCulled = false;
  const outside = buildOutside(); group.add(outside);
  (S.extraMeshes || []).forEach((m) => group.add(m));

  // ---------------------------------------------------------------- contract
  const bounds = { minX: -7.5, maxX: 7.5, minZ: -5.5, maxZ: 5.5 };
  const hit = S.hit;
  const blocked = (x, z) => x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ || hit.test(x, z);
  const keepout = (x, z, r) => { r = r || 0.3; if (blocked(x, z)) return true; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (blocked(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true; } return false; };
  // walking routes (door, hall, kitchen, desk, living room, bedroom, booth) used by pathDist and the minimap
  const A = S.anchors, route = (ids) => ids.map((k) => ({ x: A[k].x, z: A[k].z }));
  const paths = [
    { id: 'main', w: 1.4, points: [{ x: 5.5, z: 4.6 }, { x: 4.6, z: 2.6 }, { x: 3.0, z: 1.0 }, { x: 0.2, z: 1.0 }, { x: -3.6, z: 0.5 }, { x: -4.6, z: 3.1 }] },
    { id: 'kitchen', w: 1.4, points: [{ x: 3.0, z: 1.0 }, { x: 3.2, z: -2.4 }, { x: 3.2, z: -3.9 }, { x: 6.0, z: -2.5 }] },
    { id: 'desk', w: 1.4, points: [{ x: 0.2, z: 1.0 }, { x: -0.4, z: -4.0 }] },
  ];
  const segs = []; paths.forEach((p) => { for (let i = 0; i < p.points.length - 1; i++) segs.push([p.points[i], p.points[i + 1]]); });
  const pathDist = (x, z) => { let best = 1e9; for (const [a, b] of segs) { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)), px = a.x + dx * t - x, pz = a.z + dz * t - z, d = Math.hypot(px, pz); if (d < best) best = d; } return best; };
  void route;

  const mk = (id, anchor, label, icon, color, color2, clip, extra) => ({ id, anchor, label, icon, color, color2, cine: Object.assign({ snap: true, face: 'rot', clip, zoom: 0.2 }, extra || {}) });
  const spotDefs = [
    mk('booth', 'boothSpot', 'TRAIN', 'booth', '#ff3ea5', '#ffe14d', 'beatbox'),
    mk('couch', 'couchSpot', 'TAPES', 'couch', '#a86bff', '#2ee6ff', 'sit', { exact: true }),
    mk('bed', 'bedSpot', 'SLEEP', 'bed', '#2ee6ff', '#a86bff', 'sit', { exact: true }),
    mk('desk', 'deskSpot', 'STREAM', 'desk', '#ff3ea5', '#2ee6ff', 'talk'),
    mk('kitchen', 'kitchenSpot', 'EAT', 'kitchen', '#9dff4a', '#ffe14d', 'cheer'),
    mk('wardrobe', 'wardrobeSpot', 'STYLE', 'wardrobe', '#ffe14d', '#ff3ea5', 'wave'),
    mk('door', 'doorSpot', 'LEAVE', 'door', '#9dff4a', '#2ee6ff', 'wave'),
  ];
  const windows = WINDOWS.map((w) => { const f = WALLS[w.wall], p = f.pt(w.u, -0.14); return { x: p[0], y: w.y0 + w.h / 2, z: p[1], w: w.w, h: w.h, nx: -f.nx, nz: -f.nz }; });
  S.updaters.push((dt, t) => { const k = 0.96 + 0.04 * Math.sin(t * 9.0) * Math.sin(t * 3.1); scrMat.color.setRGB(k, k, k); });
  return {
    group, interior: true, bounds, blocked, heightAt: () => 0, pathDist, keepout, paths,
    anchors: Object.assign(S.anchors, { start: S.anchors.start || { x: 4.3, z: 2.4, rot: Math.PI }, door: S.anchors.door || S.anchors.doorSpot || { x: 5.5, z: 4.6, rot: 0 }, doorSpot: S.anchors.doorSpot || { x: 5.5, z: 4.6, rot: 0 }, boothSpot: S.anchors.boothSpot || { x: 6.1, z: -2.4, rot: Math.PI }, couchSpot: S.anchors.couchSpot || { x: -4.4, z: -1.5, rot: Math.PI }, bedSpot: S.anchors.bedSpot || { x: -5.2, z: 3.1, rot: -Math.PI / 2 }, deskSpot: S.anchors.deskSpot || { x: -0.4, z: -4.0, rot: Math.PI }, kitchenSpot: S.anchors.kitchenSpot || { x: 3.2, z: -3.9, rot: Math.PI }, wardrobeSpot: S.anchors.wardrobeSpot || { x: -5.9, z: -3.0, rot: -Math.PI / 2 }, foxy: S.anchors.foxy || { x: -3.3, z: -1.5, rot: Math.PI, seatY: 0.45 } }), spotDefs, windows, lights: S.lights, outside, update(dt, t) { for (const u of S.updaters) u(dt, t); },
    camera: { dist: 11, pitch: 50, yaw: 35, fov: 34, minDist: 7, maxDist: 15, focusY: 0.8 },
    stats() { return { tris: (S.B.p.length + S.GLOW.p.length + S.SCR.p.length + S.DEC.p.length + S.SOFT.p.length + S.GLASS.p.length) / 9, colliders: hit.count() }; },
  };
}
