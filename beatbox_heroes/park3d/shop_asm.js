// Shared interior assembly for the Thrift Shop and the Sound Lab (Interior Artist INT-A): merged flat_kit stores -> meshes + the terrain contract.
import { THREE, flatMat, mergeGeometries } from './kit.js';
import { glowLambert } from './flat_kit.js';
import { buildOutside } from './flat_outside.js';

// generic assembly shared with the lab: merged store -> meshes + terrain contract. o: { name, bounds, anchors, spotDefs, windows, camera, cameraPresets, paths, extraMeshes }
export function assembleInterior(S, o) {
  const group = new THREE.Group(); group.name = o.name;
  const add = (geo, mat, opt) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!(opt && opt.cast); m.receiveShadow = !(opt && opt.receive === false); if (opt && opt.order) m.renderOrder = opt.order; if (opt && opt.name) m.name = opt.name; group.add(m); return m; };
  const main = add(S.B.geometry(false), flatMat(), { cast: true, name: o.name + '_main' }); main.frustumCulled = false;
  const glowMesh = add(S.GLOW.geometry(false), glowLambert(1.0), { cast: false, name: o.name + '_glow' }); glowMesh.frustumCulled = false;
  const decMat = new THREE.MeshLambertMaterial({ map: S.atlas.tex, vertexColors: true, transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  add(S.DEC.geometry(false), decMat, { name: o.name + '_decals', order: 2 }).frustumCulled = false;
  const scrMat = new THREE.MeshBasicMaterial({ map: S.atlas.tex, vertexColors: true, transparent: true, alphaTest: 0.03, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); scrMat.userData.screen = true;
  add(S.SCR.geometry(false), scrMat, { receive: false, name: o.name + '_screens', order: 3 }).frustumCulled = false;
  const softGlass = mergeGeometries([S.SOFT.geometry(false), S.GLASS.geometry(false)]); const sgMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }); sgMat.userData.windowPane = true;
  add(softGlass, sgMat, { receive: false, order: 4, name: o.name + '_soft_glass' }).frustumCulled = false;
  const outside = buildOutside(); outside.position.set(o.bounds.minX + 7.5, 0, o.bounds.minZ + 5.5); group.add(outside);
  (S.extraMeshes || []).forEach((m) => group.add(m));
  const b = o.bounds, hit = S.hit, pad = o.pad === undefined ? 0.15 : o.pad, bnd = { minX: b.minX + pad, maxX: b.maxX - pad, minZ: b.minZ + pad, maxZ: b.maxZ - pad };
  const blocked = (x, z) => x < bnd.minX || x > bnd.maxX || z < bnd.minZ || z > bnd.maxZ || hit.test(x, z);
  const keepout = (x, z, r) => { r = r || 0.3; if (blocked(x, z)) return true; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (blocked(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true; } return false; };
  const segs = []; (o.paths || []).forEach((p) => { for (let i = 0; i < p.points.length - 1; i++) segs.push([p.points[i], p.points[i + 1]]); });
  const pathDist = (x, z) => { let best = 1e9; for (const [a, c] of segs) { const dx = c.x - a.x, dz = c.z - a.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)), px = a.x + dx * t - x, pz = a.z + dz * t - z, d = Math.hypot(px, pz); if (d < best) best = d; } return best; };
  S.updaters.push((dt, t) => { const k = 0.96 + 0.04 * Math.sin(t * 9.0) * Math.sin(t * 3.1); scrMat.color.setRGB(k, k, k); });
  return {
    group, interior: true, bounds: bnd, blocked, heightAt: o.heightAt || (() => 0), pathDist, keepout, paths: o.paths || [], emissive: [glowMesh], anchors: o.anchors, spotDefs: o.spotDefs, windows: o.windows, lights: S.lights, outside,
    update(dt, t) { for (const u of S.updaters) u(dt, t); }, camera: o.camera, cameraPresets: o.cameraPresets || {}, S, scrMat,
    stats() { return { tris: (S.B.p.length + S.GLOW.p.length + S.SCR.p.length + S.DEC.p.length + S.SOFT.p.length + S.GLASS.p.length) / 9, colliders: hit.count() }; },
  };
}
// spot definition helper (same shape as flat.js)
export const mkSpot = (id, anchor, label, icon, color, color2, clip, extra, kind) => Object.assign({ id, anchor, label, icon, color, color2, cine: Object.assign({ snap: true, face: 'rot', clip, zoom: 0.2 }, extra || {}) }, kind ? { kind } : {});

