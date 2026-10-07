// FLORA module (Environment Artist B). Owns: trees (oak, autumn maple, pine, cypress, cherry; merged), bushes, hedges, flower beds, swaying grass tufts, fallen leaves,
// planters, a low-poly skyline with lit windows, the street apron, drifting clouds, pigeons, butterflies and birds.
// CONTRACT: buildFlora(ctx, terrain) -> { group, update(dt,t), windows:{count,material}, stats }. Meshes named skyline, skyline_windows and clouds are tinted by the lighting module (time of day).
// Sub-modules: flora_trees.js (species), flora_plants.js (undergrowth), flora_sky.js (skyline, street, clouds), flora_life.js (animals), flora_common.js (helpers).
import { THREE, rng, flatMat, merged } from './kit.js';
import { xf, paintSolid, blob } from './flora_common.js';
import { makeOak, makePine, makeCypress, makeCherry, PALS } from './flora_trees.js';
import { buildPlants } from './flora_plants.js';
import { buildSkyline, buildStreet, buildClouds } from './flora_sky.js';
import { buildLife } from './flora_life.js';
import { makeField } from './terrain_ground.js';

export function buildFlora(ctx, terrain) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  const group = new THREE.Group(); group.name = 'flora';
  const B = terrain.bounds || { minX: -17, maxX: 17, minZ: -27, maxZ: 27 }, An = terrain.anchors || {};
  const R = rng(20241), blocked = (x, z) => { try { return terrain.blocked ? terrain.blocked(x, z) : false; } catch (e) { return false; } };
  const A = (k, d) => (An[k] ? An[k] : d);
  const fountain = A('fountain', { x: 0, z: 0 }), busk = A('buskSpot', { x: 8, z: -8 }), bench = A('bench', { x: -9, z: -4 }), gate = A('gate', { x: 0, z: 26 }), flyers = A('flyers', { x: 4, z: 22 }), runStart = A('runStart', { x: 12, z: 14 }), wall = A('graffiti', { x: 0, z: -26 });
  // keep-outs: terrain A's own path field (paths, plaza, bench apron, jogging loop) when available, plus the spots and the mural wall
  let field = null; try { field = makeField(); } catch (e) { field = null; }
  const pathDist = terrain.pathDist || (field && field.pathDist) || (() => 99);
  const gy = (x, z) => (terrain.heightAt ? terrain.heightAt(x, z) : 0);
  const near = (p, x, z, r) => (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < r * r;
  function keep(x, z, pad) {
    if (terrain.keepout) return terrain.keepout(x, z);
    if (pathDist(x, z) < pad + 0.3) return true;
    if (near(busk, x, z, 4.2) || near(bench, x, z, 3.2) || near(flyers, x, z, 3.0) || near(runStart, x, z, 2.6) || near(gate, x, z, 3.0)) return true;
    if (z < wall.z + 1.4) return true; // keep the mural readable
    return false;
  }
  const inB = (x, z, m) => x > B.minX + m && x < B.maxX - m && z > B.minZ + m && z < B.maxZ - m;
  const ok = (x, z, pad) => { pad = pad === undefined ? 0.5 : pad; if (!inB(x, z, 0.8)) return false; if (keep(x, z, pad)) return false; return !(blocked(x, z) || blocked(x + pad, z) || blocked(x - pad, z) || blocked(x, z + pad) || blocked(x, z - pad)); };
  const free = (x, z) => inB(x, z, 0.6) && !blocked(x, z);

  // ---------- trees ----------
  // trios: one big, one medium, one small, hugging the corners and edges so the lawns and the plaza stay open
  const T = [];
  const add = (kind, x, z, s) => T.push({ kind, x, z, s });
  // north west and north east corners
  add('oak', -13.5, -19.5, 1.35); add('cherry', -10.2, -21.8, 1.0); add('pine', -15.2, -15.2, 1.15);
  add('maple', 13.8, -19.2, 1.3); add('pine', 11.0, -22.2, 1.05); add('pine', 15.4, -14.4, 1.3);
  // west edge behind the bench cluster
  add('oak', -15.9, -7.0, 1.25); add('cherry', -15.6, -1.4, 0.95); add('cypress', -15.9, 3.0, 1.05);
  // east edge
  add('cherry', 15.9, -4.0, 1.0); add('cherry', 15.6, 0.8, 0.82); add('oak', 15.9, 6.4, 1.2);
  // south west and south east
  add('oak', -14.2, 12.0, 1.3); add('pine', -15.6, 17.0, 1.2); add('cherry', -12.4, 20.4, 0.9); add('cypress', -15.2, 22.6, 0.95);
  add('pine', 15.6, 19.0, 1.2); add('oak', 14.5, 22.8, 1.12); add('cypress', 15.9, 11.0, 1.0);
  // gate flanks and lawn accents that frame the stage and the bench
  add('cypress', -5.6, 24.6, 0.95); add('cypress', 8.2, 25.0, 0.9);
  add('cherry', 3.0, -17.0, 0.95); add('oak', -7.5, -14.5, 1.1); add('maple', -8.5, 13.5, 1.0); add('oak', 8.0, 12.0, 0.95);

  const oaks = [makeOak(1, PALS.OAK), makeOak(2, PALS.OAK2), makeOak(3, PALS.OAK)], maples = [makeOak(4, PALS.MAPLE), makeOak(5, PALS.MAPLE)];
  const pines = [makePine(6), makePine(7), makePine(8)], cyps = [makeCypress(9), makeCypress(10)], cherries = [makeCherry(11), makeCherry(12), makeCherry(13)];
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const treeGeos = [], placed = [], rejected = [];
  for (const t of T) {
    let x = t.x, z = t.z; if (!ok(x, z, 0.35)) { let found = false; for (let i = 0; i < 10 && !found; i++) { const nx = t.x + (R() - 0.5) * 4, nz = t.z + (R() - 0.5) * 4; if (ok(nx, nz, 0.35)) { x = nx; z = nz; found = true; } } if (!found) { rejected.push(t.kind + '@' + t.x + ',' + t.z); continue; } }
    const g = t.kind === 'oak' ? pick(oaks) : t.kind === 'maple' ? pick(maples) : t.kind === 'pine' ? pick(pines) : t.kind === 'cypress' ? pick(cyps) : pick(cherries);
    const s = t.s * (0.92 + R() * 0.16);
    treeGeos.push(xf(g, { x, y: gy(x, z) - 0.08, z, ry: R() * 6.28, s, rx: (R() - 0.5) * 0.06, rz: (R() - 0.5) * 0.06 })); placed.push({ kind: t.kind, x, z, s });
  }
  // a lost balloon caught in the maple canopy (storytelling prop)
  const maple = placed.find((p) => p.kind === 'maple');
  if (maple) { const bx = maple.x + 1.4 * maple.s, bz = maple.z + 0.6 * maple.s, by = gy(maple.x, maple.z) + 6.9 * maple.s; const bal = paintSolid(xf(blob(0.34, 1, R, 1.15), { x: bx, y: by, z: bz }), '#d63a5a', '#ff7a8a', R, 0.4); const str = new THREE.BufferGeometry(); const sx = bx - 0.5, sz = bz - 0.2; str.setAttribute('position', new THREE.Float32BufferAttribute([bx, by - 0.3, bz, bx + 0.02, by - 0.3, bz, sx, by - 1.3, sz], 3)); const k = new THREE.Color('#f4e4d0'); str.setAttribute('color', new THREE.Float32BufferAttribute([k.r, k.g, k.b, k.r, k.g, k.b, k.r, k.g, k.b], 3)); str.computeVertexNormals(); treeGeos.push(bal, str); }
  const treeMesh = new THREE.Mesh(merged(treeGeos.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; })), flatMat()); treeMesh.castShadow = true; treeMesh.receiveShadow = true; treeMesh.name = 'trees'; group.add(treeMesh);

  // ---------- undergrowth ----------
  const bushSpots = [], decals = [];
  placed.forEach((t, i) => { if (t.kind === 'pine' && i % 2) { decals.push({ x: t.x, z: t.z, r: 3.0 * t.s, c: '#2d2250', a: 0.30 }); return; } bushSpots.push({ x: t.x, z: t.z, r: 2.1 * t.s, n: t.kind === 'pine' || t.kind === 'cypress' ? 1 : (i % 3 === 0 ? 2 : 1), s: 0.9 }); decals.push({ x: t.x, z: t.z, r: (t.kind === 'cypress' ? 2.2 : t.kind === 'pine' ? 3.0 : 4.4) * t.s, c: '#2d2250', a: 0.30, lift: 0 }); });
  bushSpots.push({ x: gate.x - 5.0, z: gate.z - 2.2, r: 1.5, n: 2, s: 1.0 }, { x: gate.x + 6.2, z: gate.z - 2.2, r: 1.5, n: 2, s: 0.95 });
  bushSpots.push({ x: bench.x - 3.4, z: bench.z + 0.6, r: 1.6, n: 2, s: 1.0 }, { x: busk.x + 5.4, z: busk.z - 3.0, r: 1.5, n: 2, s: 1.0 });
  const hedges = [{ x: bench.x - 3.0, z: bench.z - 3.2, len: 4.4, seed: 5, ry: Math.PI / 2 }, { x: gate.x - 7.2, z: gate.z - 2.6, len: 3.6, seed: 6 }, { x: gate.x + 9.6, z: gate.z - 2.8, len: 3.2, seed: 7 }];
  const planters = [{ x: gate.x - 2.9, z: gate.z - 1.4, s: 1.05 }, { x: gate.x + 2.9, z: gate.z - 1.4, s: 1.05 }, { x: bench.x + 0.2, z: bench.z + 3.6, s: 0.85 }, { x: busk.x - 4.2, z: busk.z - 4.2, s: 0.85 }];
  const beds = [
    { x: -9.5, z: 8.0, r: 2.0, n: 10, cols: [0, 1, 2] }, { x: 10.0, z: 6.5, r: 1.8, sx: 1.3, n: 9, cols: [1, 0, 3] }, { x: -4.5, z: -13.0, r: 1.8, n: 9, cols: [2, 0, 1] },
    { x: bench.x + 1.0, z: bench.z - 4.2, r: 1.5, sx: 1.4, n: 8, cols: [1, 2, 0] }, { x: 6.5, z: -17.5, r: 1.7, n: 8, cols: [0, 3, 2] }, { x: gate.x - 6.0, z: gate.z - 4.8, r: 1.4, n: 7, cols: [0, 1, 3] }, { x: gate.x + 5.2, z: gate.z - 5.0, r: 1.3, n: 7, cols: [2, 1, 0] },
    { x: -11.5, z: 2.5, r: 1.3, n: 6, cols: [3, 1, 0] }, { x: 12.0, z: -9.5, r: 1.4, n: 7, cols: [0, 2, 1] }, { x: -8.0, z: 17.5, r: 1.6, n: 8, cols: [1, 0, 2] },
    { x: 6.0, z: 8.5, r: 1.7, n: 8, cols: [3, 0, 1] }, { x: -5.5, z: 3.5, r: 1.4, n: 6, cols: [2, 1, 0] }, { x: 9.5, z: 20.0, r: 1.6, n: 7, cols: [1, 2, 0] }, { x: -9.5, z: -11.5, r: 1.5, n: 7, cols: [0, 1, 2] }, { x: 4.0, z: -12.5, r: 1.3, n: 6, cols: [1, 3, 2] },
  ];
  const rockSpots = [{ x: -12, z: -17.5 }, { x: 12.8, z: -17.5, s: 1.1 }, { x: -13.5, z: 14.5 }, { x: 13.4, z: 3.5, s: 0.9 }];
  // grass tufts: clumps around trees, along the fence, in the lawn corners and sprinkled over the lawns, never on paths
  const tufts = [], R2 = rng(99);
  const clump = (cx, cz, rad, n, sc) => { for (let i = 0; i < n; i++) { const a = R2() * 6.28, rr = Math.sqrt(R2()) * rad, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; if (ok(x, z, 0.3)) tufts.push({ x, z, s: sc * (0.85 + R2() * 0.5) }); } };
  for (const t of placed) clump(t.x, t.z, 2.6 * t.s, 22, 1.0);
  for (let x = B.minX + 1; x < B.maxX; x += 1.5) { clump(x + R2() - 0.5, B.minZ + 4.2, 1.2, 4, 1.1); clump(x + R2() - 0.5, B.maxZ - 0.9, 1.0, 4, 1.1); }
  for (let z = B.minZ + 4; z < B.maxZ; z += 1.5) { clump(B.minX + 1.0, z, 0.9, 4, 1.1); clump(B.maxX - 1.0, z, 0.9, 4, 1.1); }
  for (const b of beds) clump(b.x, b.z, b.r * 1.7, 22, 1.0);
  for (let i = 0, g = 0; i < 4000 && g < 560; i++) { const x = B.minX + 1 + R2() * (B.maxX - B.minX - 2), z = B.minZ + 3 + R2() * (B.maxZ - B.minZ - 4), d = pathDist(x, z); if (d > 0.3 && d < 1.5 && ok(x, z, 0.0)) { tufts.push({ x, z, s: 0.9 + R2() * 0.5 }); g++; } }
  for (let i = 0; i < 170; i++) clump(B.minX + 2 + R2() * (B.maxX - B.minX - 4), B.minZ + 4 + R2() * (B.maxZ - B.minZ - 6), 1.0 + R2() * 1.0, 5 + Math.floor(R2() * 6), 0.9);
  // soft lawn colour patches so the grass is not one flat colour
  const patchCols = ['#c2d66a', '#3f7d4e', '#9fc25a', '#2f5d5a'];
  for (let i = 0; i < 26; i++) { const x = B.minX + 2 + R2() * (B.maxX - B.minX - 4), z = B.minZ + 4 + R2() * (B.maxZ - B.minZ - 6); if (keep(x, z)) continue; decals.push({ x, z, r: 2.2 + R2() * 3.2, sx: 1 + R2() * 0.8, c: patchCols[i % 4], a: 0.17, ry: R2() * 3.1, lift: -0.03 }); }

  const plants = buildPlants(ctx, { h: gy, ok, trees: placed, bushSpots, hedges, planters, flowerBeds: beds, rockSpots, tuftSpots: tufts, decals, bounds: B, anchors: An });
  group.add(plants.group);

  // ---------- skyline, street, clouds ----------
  // whatever the terrain artist built outside the fence (meadow, hills, a street) is probed with rays: buildings stand on it, and my own street only appears on sides where the terrain left the world empty
  const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), tm = []; try { terrain.group.updateMatrixWorld(true); terrain.group.traverse((o) => { if (o.isMesh) tm.push(o); }); } catch (e) { /* no terrain meshes */ }
  const groundAt = (x, z) => { try { rc.set(new THREE.Vector3(x, 90, z), down); rc.far = 200; const h = rc.intersectObjects(tm, false); return h.length ? h[0].point.y : null; } catch (e) { return null; } };
  const probe = (x, z) => groundAt(x, z) === null;
  const sideOn = { N: probe(0, B.minZ - 9) && probe(-8, B.minZ - 9), S: probe(0, B.maxZ + 9) && probe(8, B.maxZ + 9), E: probe(B.maxX + 9, 0) && probe(B.maxX + 9, 10), W: probe(B.minX - 9, 0) && probe(B.minX - 9, 10) };
  const sky = buildSkyline(ctx, B, rng(31337), groundAt); group.add(sky.group);
  const street = buildStreet(ctx, B, rng(555), sideOn); if (street.mesh) group.add(street.mesh);
  const clouds = buildClouds(rng(808)); group.add(clouds.mesh);

  // ---------- animals ----------
  const homes = [{ x: bench.x + 3.8, z: bench.z + 1.6, n: 4 }, { x: fountain.x + 5.2, z: fountain.z + 5.5, n: 4 }, { x: gate.x - 1.2, z: gate.z - 8, n: 3 }];
  const fc = beds.slice(0, 9).map((b, i) => ({ x: b.x, z: b.z, n: 1 + (i % 2) }));
  const life = buildLife(ctx, { pigeonHomes: homes }, free, fc, gy); group.add(life.group);

  const stats = { streetSides: Object.keys(sideOn).filter((k) => sideOn[k]).join(''), ms: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0), rejected: rejected.join(' '), trees: placed.length, buildings: sky.buildings, litWindows: sky.litWindows, ...plants.stats, pigeons: life.count.pigeons, air: life.count.air };
  ctx.flora = { stats, life, sky }; // handy for tests and for the lighting artist (ctx is shared)
  function update(dt, t) {
    plants.update(dt, t); life.update(dt, t);
    clouds.mesh.rotation.y = t * 0.004;
  }
  return { group, update, windows: { count: sky.litWindows, material: sky.litMat }, stats };
}
