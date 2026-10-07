// Shop3D interior (Interior Artist INT-A): the Thrift Shop, a 10 x 8 m golden-hour dollhouse in the style of flat.js. North and west walls full height (storefront window, hat wall,
// mirror opening), south and east walls cut low. Contract = the flat terrain contract (see FLAT_PLAN.md) with spots hats, racks, mirror, counter, door.
//   buildShop(ctx) -> { group, interior:true, bounds, blocked, heightAt, pathDist, keepout, paths, anchors, spotDefs, camera, cameraPresets, lights, windows, outside, emissive, update, stats }
// Layout (metres, +z toward the camera, origin = centre of the shop): x -5..5, z -4..4. Door on the south wall at x 1.6..2.5. Geometry goes into flat_kit stores (merged, few draw calls).
import { THREE, flatMat, mergeGeometries, rng } from './kit.js';
import { makeStore, glowLambert, P, col, mix, mul, aoTint, fbm } from './flat_kit.js';
import { buildOutside } from './flat_outside.js';
import { makeShopAtlas } from './shop_atlas.js';
import { buildShell, windowContract, sm } from './shop_shell.js';
import { buildHatWall, buildRacks, buildShadesCase } from './shop_stock.js';
import { buildFront } from './shop_front.js';
import { buildMirror, mirrorHole, platformHeight, MIRROR, attachReflection } from './shop_mirror.js';

export const SHOP = { b: { minX: -5, maxX: 5, minZ: -4, maxZ: 4 }, H: 2.75, LOW: 0.9, T: 0.28 };
const hash = (i, j, s) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul((s || 0) + 1, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

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

function floorColor() {
  const woods = P.wood, gr = (x, z) => 1 - 0.14 * sm(0.45, 0.8, fbm(x * 0.7, z * 0.7, 5));
  const wallAO = (x, z) => Math.min(0.75, 0.42 * (1 - sm(0, 0.9, z + 4)) + 0.42 * (1 - sm(0, 0.9, x + 5)) + 0.2 * (1 - sm(0, 0.6, 4 - z)) + 0.2 * (1 - sm(0, 0.6, 5 - x)));
  const path = (x, z) => { const d = Math.min(Math.hypot(x - 2.05, Math.max(0, Math.abs(z - 1.2) - 2.4)), Math.hypot(x - 2.7, z + 0.9) * 1.4); return 1 + 0.06 * (1 - sm(0.3, 1.1, d)); };
  return (x, z, i, j) => {
    const xc = -5 + (i + 0.5) * 0.25, zc = -4 + (j + 0.5) * 0.25; let base;
    if (xc > 2.2 && zc < -0.6 && zc > -2.7) { const ch = (Math.floor((xc - 2.2) / 0.5) + Math.floor((zc + 2.7) / 0.5)) % 2 === 0; base = mix(ch ? P.cream : P.tealL, P.creamD, 0.2 + 0.1 * hash(i, j, 4)); }
    else if (xc > 2.2 && zc <= -2.7) { base = mix(P.woodD, P.wood[1], 0.4 + 0.3 * hash(i, j, 8)); }
    else { const seg = Math.floor((xc + 5 + hash(j, 7, 1) * 1.6) / 1.5), k1 = (hash(j, seg, 2) * 4) | 0, k2 = (hash(seg, j, 3) * 4) | 0; base = mix(woods[k1], woods[k2], hash(j, seg, 5)); base = mul(base, 0.93 + 0.14 * hash(j, seg, 6) + (j % 2 ? 0 : -0.02)); }
    if ((Math.floor((xc + 5) / 0.25 + 0.5) + j) % 7 === 0 && xc < 2.2) base = mul(base, 0.97);
    return aoTint(mul(base, gr(x, z) * path(x, z)), wallAO(x, z));
  };
}
function wallFns() {
  const H = SHOP.H, stripe = (u) => (Math.floor(u / 0.25) % 2 === 0 ? 1 : 0.94), ao = (u, v, vc, len, seed, uc) => Math.min(0.8, 0.4 * (1 - sm(0, 0.5, v)) * (vc < 0.2 ? 0.3 : 1) + 0.28 * sm(H - 0.7, H, v) + 0.35 * (1 - sm(0, 0.45, u)) + 0.35 * (1 - sm(0, 0.45, len - u)) + 0.1 * sm(0.35, 0.8, fbm(uc * 1.3, vc * 1.3, seed)));
  const wain = (uc, vc, c, cD) => { if (vc < 0.12) return P.cream; const bd = Math.floor(uc / 0.2) % 2 ? 0.92 : 1.0; return mul(vc < 0.95 ? mix(cD, c, 0.35) : c, bd); };
  const paper = (uc, vc, a, b, st) => { const dia = (Math.floor(uc / 0.5) + Math.floor(vc / 0.5)) % 2 ? 0.96 : 1.02; return mul(mix(a, b, st), dia * (1.0 + 0.03 * Math.sin(uc * 9))); };
  // north wall: mismatched wallpapers (plum at the hat wall, sage by the window, mustard at the counter) over a teal beadboard wainscot
  const N = (u, v, uc, vc) => { let b; if (vc < 0.95) b = wain(uc, vc, P.tealD, mix(P.tealD, P.ink, 0.3)); else if (uc < 4.2) b = paper(uc, vc, P.plum, P.plumL, stripe(uc) === 1 ? 0 : 1); else if (uc < 5.9) b = paper(uc, vc, P.sage, P.sageD, stripe(uc) === 1 ? 0 : 1); else b = paper(uc, vc, P.mustard, mix(P.mustard, P.coral, 0.3), stripe(uc) === 1 ? 0 : 1); if (vc >= 0.95 && vc < 1.0) b = P.cream; return aoTint(b, ao(u, v, vc, 10, 8, uc)); };
  // west wall (u from the south end): violet at the mirror, the storefront in coral, a green patch at the north end
  const W = (u, v, uc, vc) => { let b; if (vc < 0.95) b = wain(uc, vc, P.tealD, mix(P.tealD, P.ink, 0.3)); else if (uc < 3.0) b = paper(uc, vc, P.indigo, P.indigoL, stripe(uc) === 1 ? 0 : 1); else if (uc < 6.4) b = paper(uc, vc, P.coral, P.pinkL, stripe(uc) === 1 ? 0 : 0.8); else b = paper(uc, vc, P.sage, P.sageD, stripe(uc) === 1 ? 0 : 1); if (vc >= 0.95 && vc < 1.0) b = P.cream; return aoTint(b, ao(u, v, vc, 8, 18, uc)); };
  return { N, W };
}

export function buildShop(ctx) {
  const S = makeStore(); S.atlas = makeShopAtlas(); S.updaters = [];
  const guard = (name, fn) => { try { fn(); } catch (e) { console.error('[shop3d] ' + name + ' failed: ' + (e && e.stack || e)); } };
  const wins = [{ wall: 'W', u: 4.8, w: 3.0, y0: 0.95, h: 1.35, mull: [0.33, 0.66], wood: mix(P.cream, P.mustard, 0.2) }, { wall: 'N', u: 6.3, w: 1.5, y0: 1.2, h: 1.1 }];
  const walls = wallFns(); let sh = null;
  guard('shell', () => { sh = buildShell(S, { b: SHOP.b, H: SHOP.H, LOW: SHOP.LOW, T: SHOP.T, floor: floorColor(), floorStep: 0.25, wallN: walls.N, wallW: walls.W, windows: wins, holes: [mirrorHole()], vBreaks: [0.12, 0.95, 1.0, 2.55, 0.35, 0.55, 0.75, 1.3, 1.6], lowBase: P.cream,
    door: { u0: 2.5, u1: 3.4, color: col('#b84a5a'), cut: true }, sidewalk: true, trim: { skirt: mix(P.cream, P.creamD, 0.25), rail: col('#e6cfa8'), railH: 0.97, corn: mix(P.mustardD, P.woodL, 0.3) } }); });
  const F = sh.F;
  guard('hat wall', () => buildHatWall(S, F)); guard('racks', () => buildRacks(S)); guard('shades', () => buildShadesCase(S)); guard('mirror', () => buildMirror(S, F)); guard('front', () => buildFront(S, F));
  const A = (x, z, rot) => ({ x, z, rot });
  const anchors = { start: A(2.2, 1.55, Math.PI), door: A(2.05, 3.05, 0), doorSpot: A(2.05, 3.05, 0), hatsSpot: A(-3.0, -2.85, Math.PI), racksSpot: A(-1.6, -0.35, Math.PI), mirrorSpot: A(MIRROR.cx, MIRROR.cz, 1.05), counterSpot: A(3.3, -0.95, Math.PI), clerk: A(3.55, -3.0, 0), lamps: [] };
  anchors.hats = anchors.hatsSpot; anchors.racks = anchors.racksSpot; anchors.mirror = anchors.mirrorSpot; anchors.counter = anchors.counterSpot;
  const spotDefs = [
    mkSpot('hats', 'hatsSpot', 'HATS', 'hats', '#ff3ea5', '#ffe14d', 'point'), mkSpot('racks', 'racksSpot', 'RACKS', 'racks', '#2ee6ff', '#ffe14d', 'talk'),
    mkSpot('mirror', 'mirrorSpot', 'MIRROR', 'mirror', '#a86bff', '#2ee6ff', 'wave', { exact: true, zoom: 0.3 }), mkSpot('counter', 'counterSpot', 'COUNTER', 'counter', '#ffe14d', '#ff3ea5', 'talk'),
    mkSpot('door', 'doorSpot', 'LEAVE', 'door', '#9dff4a', '#2ee6ff', 'wave', null, 'door'),
  ];
  const mp = MIRROR, cameraPresets = {
    mirror: { target: { x: mp.cx, y: 0.95, z: mp.cz }, dist: 4.6, pitch: 17, yaw: 60, ms: 800 }, hats: { target: { x: -3.0, y: 1.3, z: -3.2 }, dist: 5.0, pitch: 22, yaw: 25, ms: 700 },
    counter: { target: { x: 3.5, y: 1.2, z: -2.2 }, dist: 5.0, pitch: 24, yaw: 20, ms: 700 }, racks: { target: { x: -1.6, y: 1.0, z: -0.4 }, dist: 5.4, pitch: 30, yaw: 30, ms: 700 },
  };
  const paths = [{ id: 'main', w: 1.4, points: [{ x: 2.05, z: 3.6 }, { x: 2.1, z: 1.0 }, { x: 2.2, z: -0.6 }, { x: 3.3, z: -1.0 }] }, { id: 'racks', w: 1.4, points: [{ x: 2.1, z: 0.0 }, { x: -1.6, z: -0.35 }, { x: -3.0, z: -2.8 }] }, { id: 'mirror', w: 1.4, points: [{ x: 2.1, z: 1.4 }, { x: -0.8, z: 1.6 }, { x: -3.55, z: 2.2 }] }];
  const windows = windowContract(F, wins, SHOP.T);
  const t = assembleInterior(S, { name: 'shop', bounds: SHOP.b, anchors, spotDefs, windows, paths, cameraPresets, heightAt: platformHeight, camera: { dist: 9.6, pitch: 50, yaw: 35, fov: 34, minDist: 6.5, maxDist: 13.5, focusY: 0.8 } });
  t.mirror = S.mirror; t.pegs = S.pegCount; t.hats = S.hatCount;
  return t;
}
export { attachReflection };
