// env_ludus.js : walled hillside training courtyard above a Roman plain with a distant city + Colosseum.
//   createLudus({ density:1 }) -> ludus
//   ludus.group  add to scene            ludus.update(t, dt, camera)
//   ludus.groundHeightAt(x,z)            terrain height (courtyard is flat at y=0)
//   ludus.COURT {hw, hd}                 courtyard half extents (walls sit on this rectangle)
//   ludus.setNight(0..1)                 city windows + torches + glow
//   ludus.setDensity(0..1)               tree/house LOD
//   ludus.dust, ludus.flames, ludus.water  sub-systems;  ludus.uniforms {uTime, uWind, uNight}
// Coordinates: +z is DOWNHILL toward the city (front gate), -z is the hill behind, y=0 courtyard floor.
// Draw calls ~26. Triangles ~170k (terrain 50k, trees 60k, city 25k, rest).
import * as THREE from 'three';
import { mergeGeos, prepGeo, colorize, boxGeo, patchMaterial, createFlames, createDustMotes, createBlobShadows, createWater } from './envfx.js';
import { makeStoneTexture, makeMarbleTexture, makeGroundDetail, makeCourtyardFloor, makeSandTexture, makeRoofTexture, makeColosseumFacade, tfbm } from './envtex.js';

const TAU = Math.PI * 2;
export const COURT = { hw: 24, hd: 19 };
const { hw: CW, hd: CD } = COURT;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smax = (a, b, k) => { const h = clamp(0.5 + 0.5 * (a - b) / k); return lerp(b, a, h) + k * h * (1 - h) * 0.5; };
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const nz = (x, z, sc, oct = 3, seed = 0) => tfbm(x * sc, z * sc, 1024, oct, seed);

/** Terrain height. Flat courtyard plateau, hill behind (-z), terraced slope down to a valley plain at y~-36 (+z). */
export function terrainHeight(x, z) {
  const dx = Math.abs(x) - (CW + 5), dz = Math.abs(z) - (CD + 5);
  const sd = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
  if (sd <= 0) return -0.06;
  const o = sd, front = sstep(-8, 14, z);
  let h = o * lerp(0.30, -0.5, front);
  const terr = Math.round(h / 2.4) * 2.4; h = lerp(h, terr, 0.4 * front * sstep(4, 20, o));
  h += (nz(x, z, 0.018, 4, 3) - 0.5) * 22 * sstep(6, 70, o) * (1 - front * 0.6);
  h += sstep(70, 260, -z) * (80 + 70 * nz(x, z, 0.006, 3, 9));
  const floor = -36 + (nz(x, z, 0.02, 2, 5) - 0.5) * 3;
  h = smax(h, floor, 10);
  const dist = Math.hypot(x, z - 240);
  h += sstep(250, 470, dist) * (60 + 60 * nz(x, z, 0.01, 3, 11)) * sstep(-40, 120, z);
  return h;
}
const pathX = (z) => 8 * Math.sin(z * 0.022) + 4 * Math.sin(z * 0.053 + 1.0);   // winding road from the front gate down to the city

export function createLudus({ density = 1, seed = 5, terrainSeg = 150, farShadows = true } = {}) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const group = new THREE.Group(); group.name = 'ludus';
  const U = { uTime: { value: 0 }, uWind: { value: 1 }, uNight: { value: 0 } };
  const stone = makeStoneTexture(512, { bx: 4, by: 6, base: 0xe3d3ad, tint: 0xb89a66, seed: 31 });
  const marble = makeMarbleTexture(512);
  const detail = makeGroundDetail(512);
  const sandTile = makeSandTexture(512, 4);
  const roofT = makeRoofTexture(256);
  const trees = {}, cityObjs = {};

  // ---------------- terrain ----------------
  const TS = terrainSeg, EXT = 460;
  {
    const pos = [], col = [], uv = [], idx = [];
    const grass = lin(0x8b8a46), grass2 = lin(0x5f7a38), dry = lin(0xb69b5c), rock = lin(0x9c8c76), earth = lin(0x9a7a50), road = lin(0xcbaa78), olive = lin(0x6d7a3e), field1 = lin(0x9aa24a), field2 = lin(0xc2a45a), plain = lin(0x8d8f4c);
    for (let j = 0; j <= TS; j++) for (let i = 0; i <= TS; i++) {
      const u = (i / TS) * 2 - 1, v = (j / TS) * 2 - 1;
      const x = Math.sign(u) * u * u * EXT, z = Math.sign(v) * v * v * EXT;
      const h = terrainHeight(x, z); pos.push(x, h, z); uv.push(x / 9, z / 9);
      const e = 1.5, hx = terrainHeight(x + e, z) - terrainHeight(x - e, z), hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
      const slope = Math.hypot(hx, hz) / (2 * e);
      const n1 = nz(x, z, 0.05, 3, 21), n2 = nz(x, z, 0.4, 2, 22);
      let c = mixc(grass, grass2, clamp(n1 * 1.6 - 0.4));
      c = mixc(c, dry, clamp(nz(x, z, 0.012, 2, 7) * 1.5 - 0.35) * 0.7);
      c = mixc(c, rock, sstep(0.55, 1.0, slope) * 0.8);
      const valley = sstep(-26, -34, h);
      const band = Math.floor((x * 0.03 + z * 0.012) + n1 * 3) % 3;
      c = mixc(c, band === 0 ? field1 : band === 1 ? field2 : plain, valley * 0.85);
      c = mixc(c, olive, sstep(0.0, 1.0, nz(x, z, 0.03, 2, 40) * 1.4 - 0.5) * (1 - valley) * sstep(8, 30, Math.abs(x) + Math.abs(z)) * 0.5);
      const patch = nz(x, z, 0.09, 3, 31), straw = nz(x, z, 0.05, 3, 33);
      c = mixc(c, lin(0x4c6a2c), clamp(patch * 2.2 - 0.9) * 0.65 * (1 - valley));
      c = mixc(c, lin(0xcdb26c), clamp(straw * 2.0 - 0.8) * 0.55 * (1 - valley));
      const near = Math.abs(x - pathX(z)); const onRoad = z > CD + 4 ? 1 - sstep(2.2, 4.2, near) : 0;
      c = mixc(c, road, onRoad);
      c = mixc(c, earth, (1 - sstep(0, 5, Math.max(Math.abs(x) - CW - 5, Math.abs(z) - CD - 5))) * 0.7);   // packed earth ledge hugging the wall
      const shade = 1.22 + n2 * 0.28;
      col.push(c[0] * shade, c[1] * shade, c[2] * shade);
    }
    for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) { const a = j * (TS + 1) + i, b = a + 1, c2 = a + TS + 1, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
    const g = new THREE.BufferGeometry(); g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ map: detail.map, vertexColors: true });
    m.map.anisotropy = 8;
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.name = 'terrain'; group.add(mesh);
  }

  // ---------------- courtyard floor ----------------
  {
    const t = makeCourtyardFloor(1536, 1250, sandTile);
    const g = new THREE.PlaneGeometry(CW * 2 + 2, CD * 2 + 2); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0, bumpMap: sandTile.bump, bumpScale: 0.6 });
    m.bumpMap.repeat.set(10, 8); m.bumpMap.needsUpdate = true;
    const mesh = new THREE.Mesh(g, m); mesh.position.y = 0.01; mesh.receiveShadow = true; mesh.name = 'courtyard_floor'; group.add(mesh);
  }

  // ---------------- walls, towers, buttresses, gate, portico (one stone mesh) ----------------
  const WH = 4.8, WT = 1.5;
  const wallParts = [], roofParts = [], marbleParts = [];
  const wallColor = (x, y, z, nx, ny, nz_) => { const k = clamp(0.55 + (y / WH) * 0.5, 0, 1.05) * (ny > 0.5 ? 1.08 : 1); const dirt = 1 - 0.25 * sstep(1.6, 0, y); return [k * dirt, k * dirt * 0.98, k * dirt * 0.94]; };
  const addWall = (w, h, d, x, y, z) => wallParts.push(colorize(boxGeo(w, h, d, x, y + h / 2, z, 6), (px, py, pz, nx, ny, nz_) => wallColor(px, py, pz, nx, ny, nz_)));
  const GATE = 3.4;
  addWall(CW * 2 + WT, WH, WT, 0, 0, -CD);                                 // north
  addWall(WT, WH, CD * 2, -CW, 0, 0); addWall(WT, WH, CD * 2, CW, 0, 0);    // west, east
  const sw = CW - GATE; addWall(sw, WH, WT, -(GATE + sw / 2), 0, CD); addWall(sw, WH, WT, GATE + sw / 2, 0, CD);   // south with gate gap
  // gate tower: two pylons + lintel with arch face
  addWall(2.6, WH + 2.2, WT + 1.4, -(GATE + 1.3), 0, CD); addWall(2.6, WH + 2.2, WT + 1.4, GATE + 1.3, 0, CD);
  addWall(GATE * 2 + 2.6, 1.6, WT + 1.4, 0, WH + 0.6, CD);
  // buttresses outside walls
  for (let x = -CW + 6; x < CW; x += 8) { if (Math.abs(x) < GATE + 5) continue; addWall(1.0, WH + 0.4, 1.0, x, 0, CD + WT / 2 + 0.4); addWall(1.0, WH + 0.4, 1.0, x, 0, -CD - WT / 2 - 0.4); }
  for (let z = -CD + 5; z < CD - 2; z += 8) { addWall(1.0, WH + 0.4, 1.0, CW + WT / 2 + 0.4, 0, z); addWall(1.0, WH + 0.4, 1.0, -CW - WT / 2 - 0.4, 0, z); }
  // corner towers (cylinders) + conical tile roofs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * CW, cz = sz * CD;
    const t = new THREE.CylinderGeometry(2.5, 2.8, 8.2, 14, 1); t.translate(cx, 4.1, cz);
    wallParts.push(colorize(prepGeo(t, { uvScale: 1 }), (x, y, z, nx, ny, nz_) => { const k = 0.6 + (y / 8.2) * 0.45; return [k, k * 0.98, k * 0.94]; }));
    const crown = new THREE.CylinderGeometry(2.95, 2.55, 0.5, 14); crown.translate(cx, 8.45, cz); wallParts.push(colorize(prepGeo(crown), () => 1.0));
    const r = new THREE.ConeGeometry(3.3, 3.6, 14); r.translate(cx, 10.5, cz); roofParts.push(prepGeo(r, { uvScale: 2.5 }));
    const win = new THREE.BoxGeometry(0.6, 1.1, 0.4); win.translate(cx + sx * -2.5 * 0.0, 6.0, cz + sz * 2.55 * 0.0);
  }
  // terracotta wall caps (low gable along each wall top)
  const cap = (w, d, x, z, along) => { const g = new THREE.BoxGeometry(along ? w : d, 0.55, along ? d : w); g.translate(x, WH + 0.28, z); roofParts.push(prepGeo(g, { uvScale: 0.5 })); };
  cap(CW * 2 + WT, WT + 0.5, 0, -CD, true); cap(CD * 2, WT + 0.5, -CW, 0, false); cap(CD * 2, WT + 0.5, CW, 0, false);
  cap(sw, WT + 0.5, -(GATE + sw / 2), CD, true); cap(sw, WT + 0.5, GATE + sw / 2, CD, true);
  // gate pylon roofs
  for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(3.2, 0.7, WT + 2.0); g.translate(sx * (GATE + 1.3), WH + 2.55, CD); roofParts.push(prepGeo(g, { uvScale: 0.5 })); }
  { const g = new THREE.BoxGeometry(GATE * 2 + 3.2, 0.5, WT + 2.0); g.translate(0, WH + 1.65, CD); roofParts.push(prepGeo(g, { uvScale: 0.5 })); }
  // gate arch frame (dark opening is the sky/terrain beyond; add a timber door pair thrown open)
  const wallMesh = new THREE.Mesh(mergeGeos(wallParts), new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: 2, vertexColors: true, roughness: 0.94 }));
  wallMesh.castShadow = wallMesh.receiveShadow = true; wallMesh.name = 'walls'; group.add(wallMesh);
  const roofMat = new THREE.MeshStandardMaterial({ map: roofT.map, bumpMap: roofT.bump, bumpScale: 2.5, vertexColors: true, roughness: 0.85 });
  const roofMesh = new THREE.Mesh(mergeGeos(roofParts), roofMat); roofMesh.castShadow = roofMesh.receiveShadow = true; roofMesh.name = 'roofs'; group.add(roofMesh);

  // portico: marble columns along the north wall + sloped tile roof + back colonnade shadow
  {
    const cols = 11, cz = -CD + 4.4, colH = 4.4;
    let cg = new THREE.CylinderGeometry(0.36, 0.42, colH, 14, 1);
    cg = colorize(cg, (x, y) => 0.7 + 0.3 * (y / colH + 0.5));
    const capG = new THREE.BoxGeometry(1.1, 0.3, 1.1), baseG = new THREE.BoxGeometry(1.0, 0.25, 1.0);
    const colMesh = new THREE.InstancedMesh(prepGeo(cg, { uvScale: 0.5 }), new THREE.MeshStandardMaterial({ map: marble.map, bumpMap: marble.bump, bumpScale: 1, vertexColors: true, roughness: 0.4, metalness: 0.0 }), cols);
    const capMesh = new THREE.InstancedMesh(prepGeo(capG), new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.45 }), cols * 2);
    const m = new THREE.Matrix4();
    for (let i = 0; i < cols; i++) {
      const x = -20 + i * 4; colMesh.setMatrixAt(i, m.makeTranslation(x, colH / 2 + 0.25, cz));
      capMesh.setMatrixAt(i, m.makeTranslation(x, colH + 0.4, cz)); capMesh.setMatrixAt(cols + i, m.makeTranslation(x, 0.125, cz));
    }
    colMesh.castShadow = capMesh.castShadow = true; colMesh.receiveShadow = true; group.add(colMesh, capMesh);
    const beam = new THREE.BoxGeometry(44, 0.5, 1.4); beam.translate(0, colH + 0.8, cz); wallParts.length = 0;
    const beamMesh = new THREE.Mesh(prepGeo(beam, { uvScale: 0.2 }), new THREE.MeshStandardMaterial({ color: 0xe9ddc6, roughness: 0.7 })); beamMesh.castShadow = true; group.add(beamMesh);
    const slope = new THREE.BoxGeometry(44.4, 0.3, 4.6); slope.rotateX(-0.28); slope.translate(0, colH + 1.55, cz - 1.5);
    const sl = new THREE.Mesh(prepGeo(slope, { uvScale: 0.5 }), roofMat); sl.castShadow = sl.receiveShadow = true; group.add(sl);
    // dark back wall of portico (reads as deep shade)
    const back = new THREE.BoxGeometry(44, colH, 0.2); back.translate(0, colH / 2 + 0.25, -CD + 1.2);
    const bm = new THREE.Mesh(back, new THREE.MeshLambertMaterial({ color: 0x6e5240 })); group.add(bm);
  }

  // ---------------- pool + fountain ----------------
  {
    const px = -9, pz = 7, W = 8, D = 5;
    const rimParts = [[W + 1.2, 0.6, 0.6, 0, -D / 2 - 0.3], [W + 1.2, 0.6, 0.6, 0, D / 2 + 0.3], [0.6, 0.6, D, -W / 2 - 0.3, 0], [0.6, 0.6, D, W / 2 + 0.3, 0]].map(([w, h, d, ox, oz]) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(px + ox, 0.3, pz + oz); return g; });
    const rm = new THREE.Mesh(mergeGeos(rimParts), new THREE.MeshStandardMaterial({ map: marble.map, bumpMap: marble.bump, roughness: 0.35, vertexColors: true })); rm.castShadow = rm.receiveShadow = true; group.add(rm);
    const basin = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), new THREE.MeshLambertMaterial({ color: 0x2a4a50 })); basin.position.set(px, 0.05, pz); group.add(basin);
    const water = createWater(W, D); water.mesh.position.set(px, 0.36, pz); group.add(water.mesh); group.userData.water = water;
    trees.water = water;
  }

  // ---------------- torches + amphorae ----------------
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb8803a, metalness: 0.75, roughness: 0.4 });
  const flamePts = [];
  {
    const tg = mergeGeos([(() => { const c = new THREE.CylinderGeometry(0.04, 0.05, 1.0, 6); c.translate(0, 0.5, 0); return c; })(), (() => { const c = new THREE.CylinderGeometry(0.15, 0.06, 0.24, 8); c.translate(0, 1.1, 0); return c; })(), (() => { const b = new THREE.BoxGeometry(0.1, 0.1, 0.3); b.translate(0, 0.2, -0.12); return b; })()]);
    const pts = [];
    for (let x = -CW + 4; x < CW; x += 6) { if (Math.abs(x) < GATE + 3) continue; pts.push([x, CD - WT / 2 - 0.1, Math.PI]); }
    for (let x = -CW + 4; x < CW; x += 12) pts.push([x, -CD + 1.2 + 0.0, 0]);
    for (const sx of [-1, 1]) for (const z of [-8, 2, 12]) pts.push([sx * (CW - WT / 2 - 0.1), z, -sx * Math.PI / 2]);
    pts.push([-GATE - 0.2, CD - WT / 2 - 1.6, Math.PI], [GATE + 0.2, CD - WT / 2 - 1.6, Math.PI]);
    const mesh = new THREE.InstancedMesh(tg, bronze, pts.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    pts.forEach(([x, z, yaw], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); m.compose(new THREE.Vector3(x, 2.2, z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m); flamePts.push({ x, y: 3.35, z, s: 0.85 }); });
    mesh.castShadow = true; group.add(mesh);
    const prof = [[0.0, 0.0], [0.16, 0.0], [0.26, 0.15], [0.3, 0.45], [0.22, 0.75], [0.1, 0.9], [0.1, 1.0], [0.16, 1.05], [0.16, 1.1]].map(([r, y]) => new THREE.Vector2(r, y));
    const ag = colorize(new THREE.LatheGeometry(prof, 10), (x, y) => 0.7 + 0.3 * Math.min(1, y));
    const am = new THREE.InstancedMesh(ag, new THREE.MeshStandardMaterial({ color: 0xa8643c, roughness: 0.8, vertexColors: true }), 14);
    for (let i = 0; i < 14; i++) { const side = i % 2 ? 1 : -1, x = -CW + 3 + (i * 3.2) % (CW * 1.8), z = i < 7 ? CD - 1.6 : -CD + 1.7; m.compose(new THREE.Vector3(x * (i % 3 ? 1 : 0.9), 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), new THREE.Vector3(1.4, 1.4, 1.4)); am.setMatrixAt(i, m); void side; }
    am.castShadow = true; group.add(am);
  }
  const flames = createFlames(flamePts, { glowScale: 3.2 }); group.add(flames.group);

  // ---------------- trees: cypress, olive, stone pine (instanced, vertex sway, baked AO colors) ----------------
  const jitterGeo = (g, amp, seedK) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = (tfbm(x * 1.7 + 50, y * 1.7 + z * 1.1, 1024, 2, seedK) - 0.5) * amp; p.setXYZ(i, x + k, y + k * 0.6, z + k * 0.8); } return g; };
  const treeMat = (key, H, A) => patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    key, uniforms: { uTime: U.uTime, uWind: U.uWind },
    vPars: 'uniform float uTime, uWind;',
    vBody: `vec3 ip = instanceMatrix[3].xyz; float hh = clamp(position.y / ${H.toFixed(1)}, 0.0, 1.0);
      float w = hh * hh * ${A.toFixed(3)} * uWind; transformed.x += sin(uTime * 1.25 + ip.x * 0.31 + ip.z * 0.23) * w + sin(uTime * 2.7 + ip.z * 0.4) * w * 0.25;
      transformed.z += cos(uTime * 1.05 + ip.z * 0.29 + ip.x * 0.17) * w * 0.7;`,
  });
  const cypressGeo = (() => {
    const prof = []; const N = 9;
    for (let i = 0; i <= N; i++) { const t = i / N; const r = t === 0 ? 0.08 : t === 1 ? 0.0 : 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.07 + t * 0.9)), 0.75) * (1 - 0.18 * t); prof.push(new THREE.Vector2(r, t * 9)); }
    const g = jitterGeo(new THREE.LatheGeometry(prof, 8), 0.22, 61); g.computeVertexNormals();
    const dark = lin(0x1f3a1c), light = lin(0x4b6a2a);
    return colorize(g, (x, y, z) => { const t = clamp(y / 9) ; const out = clamp(Math.hypot(x, z) / 0.6); const c = mixc(dark, light, clamp(t * 0.8 + out * 0.35 - 0.1)); return c; });
  })();
  const oliveGeo = (() => {
    const parts = [];
    const bark = lin(0x5a4636);
    for (let k = 0; k < 2; k++) {
      const t = new THREE.CylinderGeometry(0.13, 0.26, 2.3, 6, 4); const p = t.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 1.15; p.setX(i, p.getX(i) + Math.sin(y * 1.9 + k * 2) * 0.22 + (k ? 0.25 : -0.15) * y * 0.4); p.setY(i, p.getY(i) + 1.15); }
      parts.push(colorize(t, (x, y) => mixc(lin(0x3a2c22), bark, clamp(y / 2.3))));
    }
    const lo = lin(0x4c5e3a), mid = lin(0x7f9059), hi = lin(0xb0bf84);
    [[0, 2.8, 0, 1.6], [-1.0, 2.5, 0.6, 1.25], [1.0, 2.6, -0.5, 1.3], [0.2, 3.35, -0.6, 1.1], [0.1, 2.5, 1.1, 1.0]].forEach(([x, y, z, r], i) => {
      const b = new THREE.IcosahedronGeometry(r, 1); const p = b.attributes.position; for (let j = 0; j < p.count; j++) p.setY(j, p.getY(j) * 0.68);
      jitterGeo(b, 0.35, 70 + i); b.translate(x, y, z);
      b.computeVertexNormals();
      parts.push(colorize(b, (px, py, pz) => { const t = clamp((py - (y - r * 0.68)) / (r * 1.36)); return mixc(lo, t < 0.55 ? mid : hi, t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45); }));
    });
    return mergeGeos(parts);
  })();
  const pineGeo = (() => {
    const parts = [];
    const t = new THREE.CylinderGeometry(0.2, 0.34, 7.2, 6, 5); const p = t.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 3.6; p.setX(i, p.getX(i) + Math.sin(y * 0.55) * 0.35); p.setY(i, p.getY(i) + 3.6); }
    parts.push(colorize(t, (x, y) => mixc(lin(0x5a3a2a), lin(0x8a5a3a), clamp(y / 7))));
    const lo = lin(0x2f4a24), hi = lin(0x6a8a3c);
    [[0, 7.7, 0, 2.7], [-1.9, 7.1, 0.7, 1.9], [1.7, 7.3, -0.6, 2.0], [0.3, 8.5, 0.3, 1.5]].forEach(([x, y, z, r], i) => {
      const b = new THREE.IcosahedronGeometry(r, 1); const q = b.attributes.position; for (let j = 0; j < q.count; j++) q.setY(j, q.getY(j) * 0.38);
      jitterGeo(b, 0.4, 90 + i); b.translate(x, y, z); b.computeVertexNormals();
      parts.push(colorize(b, (px, py) => { const tt = clamp((py - (y - r * 0.38)) / (r * 0.76)); return mixc(lo, hi, tt * tt); }));
    });
    return mergeGeos(parts);
  })();
  const treePlace = { cypress: [], olive: [], pine: [] };
  const inCourt = (x, z, m = 8) => Math.abs(x) < CW + m && Math.abs(z) < CD + m;
  // cypress avenue along the road, flanking the gate, scattered on the hill
  for (let z = CD + 8; z < 150; z += 9 + rnd() * 3) for (const sd of [-1, 1]) { const x = pathX(z) + sd * (5.4 + rnd() * 1.2); treePlace.cypress.push([x, terrainHeight(x, z), z, 0.9 + rnd() * 0.5]); }
  for (const sx of [-1, 1]) for (const z of [CD + 6, CD + 10]) treePlace.cypress.push([sx * (GATE + 6), terrainHeight(sx * (GATE + 6), z), z, 1.15]);
  for (let i = 0; i < 26; i++) { const x = (rnd() - 0.5) * 140, z = -CD - 8 - rnd() * 60; if (inCourt(x, z)) continue; treePlace.cypress.push([x, terrainHeight(x, z), z, 0.8 + rnd() * 0.6]); }
  for (let i = 0; i < 14; i++) { const a = rnd() * TAU, r = 40 + rnd() * 60, x = Math.cos(a) * r * 1.3, z = 20 + Math.sin(a) * r; if (inCourt(x, z, 10) || z < 0) continue; treePlace.cypress.push([x, terrainHeight(x, z), z, 0.9 + rnd() * 0.5]); }
  // olive groves: terraced rows on the slopes either side + behind
  for (const [x0, x1, z0, z1] of [[30, 120, -30, 90], [-120, -30, -30, 90], [-60, 60, -80, -30]]) {
    for (let z = z0; z < z1; z += 7.5) for (let x = x0; x < x1; x += 8) {
      const xx = x + (rnd() - 0.5) * 3 + ((Math.floor(z / 7.5) % 2) * 3), zz = z + (rnd() - 0.5) * 2;
      if (inCourt(xx, zz, 9) || Math.abs(xx - pathX(zz)) < 8 && zz > CD) continue;
      if (nz(xx, zz, 0.04, 2, 77) < 0.42) continue;
      const hh = terrainHeight(xx, zz); if (hh < -25) continue;
      treePlace.olive.push([xx, hh, zz, 0.8 + rnd() * 0.5]);
    }
  }
  for (let i = 0; i < 26; i++) { const x = (rnd() - 0.5) * 220, z = -CD - 6 + rnd() * 130; if (inCourt(x, z, 10) || terrainHeight(x, z) < -20) continue; treePlace.pine.push([x, terrainHeight(x, z), z, 0.85 + rnd() * 0.5]); }
  for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 11, z = CD + 7 + rnd() * 3; treePlace.pine.push([x, terrainHeight(x, z), z, 0.8 + rnd() * 0.2]); }
  const treeMeshes = [];
  const mkTrees = (name, geo, arr, H, A, shadow) => {
    const mesh = new THREE.InstancedMesh(geo, treeMat(name, H, A), arr.length); mesh.name = name;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    arr.forEach(([x, y, z, sc], i) => { q.setFromEuler(e.set(0, rnd() * TAU, 0)); m.compose(new THREE.Vector3(x, y - 0.1, z), q, new THREE.Vector3(sc, sc * (0.9 + rnd() * 0.3), sc)); mesh.setMatrixAt(i, m); });
    mesh.castShadow = shadow; mesh.receiveShadow = false; mesh.frustumCulled = false; group.add(mesh); treeMeshes.push([mesh, arr.length]); return mesh;
  };
  mkTrees('cypress', cypressGeo, treePlace.cypress, 9, 0.28, true);
  mkTrees('olive', oliveGeo, treePlace.olive, 4.2, 0.12, farShadows);   // far groves: shadow pass re-draws every instance, ~58k tris for little visible gain
  mkTrees('pine', pineGeo, treePlace.pine, 9, 0.18, true);
  // scrub bushes: cheap jittered blobs scattered over the hillside for texture
  {
    let bg = new THREE.IcosahedronGeometry(0.9, 0); const p = bg.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.7 + 0.4);
    jitterGeo(bg, 0.5, 120); bg = colorize(bg, (x, y) => mixc(lin(0x4a5a2c), lin(0xa0a458), clamp((y - 0.1) / 1.0)));
    const arr = [];
    for (let i = 0; i < 520; i++) { const a = rnd() * TAU, r = 30 + Math.pow(rnd(), 0.8) * 190, x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 0.9 + 10; if (inCourt(x, z, 7)) continue; const hh = terrainHeight(x, z); if (hh < -22) continue; arr.push([x, hh, z, 0.6 + rnd() * 1.4]); }
    const bm = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true }), arr.length); bm.name = 'bushes'; bm.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler();
    arr.forEach(([x, y, z, sc], i) => { q4.setFromEuler(e4.set(0, rnd() * TAU, 0)); m4.compose(new THREE.Vector3(x, y - 0.1, z), q4, new THREE.Vector3(sc * 1.4, sc, sc * 1.2)); bm.setMatrixAt(i, m4); });
    group.add(bm); treeMeshes.push([bm, arr.length]);
  }
  const blobs = [];
  treePlace.cypress.forEach(([x, y, z, sc]) => blobs.push({ x, y, z, r: 1.7 * sc, rz: 1.7 * sc }));
  treePlace.olive.forEach(([x, y, z, sc]) => blobs.push({ x: x + 0.8, y, z: z + 0.5, r: 3.2 * sc, rz: 2.6 * sc }));
  treePlace.pine.forEach(([x, y, z, sc]) => blobs.push({ x: x + 0.5, y, z, r: 4.3 * sc, rz: 3.4 * sc }));
  group.add(createBlobShadows(blobs, { opacity: 0.4 }));

  // ---------------- distant city: houses, windows, aqueduct, temple, Colosseum ----------------
  {
    const houseGeo = (() => {
      let wall = new THREE.BoxGeometry(1, 1, 1); wall.translate(0, 0.5, 0);
      wall = colorize(wall, (x, y, z, nx, ny) => { const k = ny > 0.5 ? 1 : 0.6 + 0.4 * (y + 0.5 > 0.5 ? (y) : y); const c = mixc(lin(0xd9c3a0), lin(0xf0e2c4), clamp(y)); return [c[0] * k, c[1] * k, c[2] * k]; });
      let roof = new THREE.CylinderGeometry(0.0, 0.8, 0.16, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.0, 1, 1.0); roof.translate(0, 1.07, 0);
      roof = colorize(roof, (x, y) => { const t = clamp((y - 1.0) / 0.16); return mixc(lin(0xb4502c), lin(0xe07a44), 1 - t); });
      return mergeGeos([wall, roof]);
    })();
    const NH = Math.round(780 * density);
    const hm = new THREE.InstancedMesh(houseGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), NH); hm.name = 'houses'; hm.frustumCulled = false;
    const wins = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshBasicMaterial({ color: 0x000000, fog: true }), NH * 2); wins.name = 'windows'; wins.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    let wi = 0;
    for (let i = 0; i < NH; i++) {
      // clustered districts around two centers, avoid the monuments and aqueduct
      const cl = rnd() < 0.62 ? [30, 255] : [-150, 290];
      let x, z, tries = 0;
      do { const a = rnd() * TAU, r = Math.pow(rnd(), 0.7) * 150; x = cl[0] + Math.cos(a) * r * 1.5; z = cl[1] + Math.sin(a) * r * 0.75; tries++; } while ((Math.hypot(x - -40, z - 330) < 85 || Math.hypot(x - -135, z - 255) < 30 || Math.abs(z - 185) < 8) && tries < 8);
      const w = 6 + rnd() * 7, d = 6 + rnd() * 9, h = 5 + rnd() * 7 + (rnd() < 0.12 ? 8 : 0);
      const yaw = Math.round(rnd() * 3) * (Math.PI / 2) * 0 + (Math.floor(x / 40) * 0.07) + (rnd() - 0.5) * 0.25;
      const y = terrainHeight(x, z);
      q.setFromEuler(e.set(0, yaw, 0)); m.compose(new THREE.Vector3(x, y - 0.5, z), q, new THREE.Vector3(w, h, d)); hm.setMatrixAt(i, m);
      col.setHSL(0.09 + rnd() * 0.03, 0.15 + rnd() * 0.2, 0.85 + rnd() * 0.12); hm.setColorAt(i, col);
      for (let k = 0; k < 2; k++) {
        const lx = (rnd() - 0.5) * 0.6 * w, ly = h * (0.35 + rnd() * 0.35), face = rnd() < 0.5 ? 1 : -1;
        const wp = new THREE.Vector3(lx, ly, face * d * 0.502).applyQuaternion(q).add(new THREE.Vector3(x, y - 0.5, z));
        const wq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face > 0 ? 0 : Math.PI));
        wins.setMatrixAt(wi++, m.compose(wp, wq, new THREE.Vector3(1, 1, 1)));
      }
    }
    group.add(hm, wins); cityObjs.houses = hm; cityObjs.wins = wins; cityObjs.nWin = wi; wins.count = wi;

    // aqueduct: repeated arch bays
    const bayShape = new THREE.Shape(); bayShape.moveTo(-2.9, 0); bayShape.lineTo(2.9, 0); bayShape.lineTo(2.9, 22); bayShape.lineTo(-2.9, 22); bayShape.lineTo(-2.9, 0);
    const holeP = new THREE.Path(); holeP.moveTo(-2.0, 0); holeP.lineTo(-2.0, 13); holeP.absellipse(0, 13, 2.0, 2.6, Math.PI, 0, true); holeP.lineTo(2.0, 0); holeP.lineTo(-2.0, 0); bayShape.holes.push(holeP);
    const bayGeo = colorize(new THREE.ExtrudeGeometry(bayShape, { depth: 3.2, bevelEnabled: false, curveSegments: 8 }), (x, y, z, nx, ny, nz_) => { const k = (0.55 + 0.45 * clamp(y / 22)) * (nz_ > 0.5 ? 1 : 0.85); const c = mixc(lin(0xb59a74), lin(0xd9c49a), clamp(y / 22)); return [c[0] * k, c[1] * k, c[2] * k]; });
    bayGeo.translate(0, 0, -1.6);
    const NB = 70, aq = new THREE.InstancedMesh(bayGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), NB); aq.name = 'aqueduct'; aq.frustumCulled = false;
    for (let i = 0; i < NB; i++) { const x = -310 + i * 5.8, z = 185 + Math.sin(x * 0.01) * 6; const y = terrainHeight(x, z) - 0.4; q.setFromEuler(e.set(0, Math.sin(x * 0.01) * 0.06, 0)); aq.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1 + Math.max(0, (Math.abs(x - 40) - 150) * 0.0), 1))); }
    group.add(aq);

    // Pantheon-like temple: drum + dome + portico
    const tp = new THREE.Group(); const tm = new THREE.MeshLambertMaterial({ vertexColors: true });
    const drum = colorize(new THREE.CylinderGeometry(15, 15.5, 17, 24), (x, y) => { const k = 0.6 + 0.4 * clamp((y + 8.5) / 17); const c = lin(0xd9c49a); return [c[0] * k, c[1] * k, c[2] * k]; }); drum.translate(0, 8.5, 0);
    const dome = colorize(new THREE.SphereGeometry(14.5, 24, 10, 0, TAU, 0, Math.PI / 2), (x, y) => { const k = 0.8 + 0.3 * clamp(y / 14); const c = lin(0xb9a07c); return [c[0] * k, c[1] * k, c[2] * k]; }); dome.scale(1, 0.62, 1); dome.translate(0, 17, 0);
    const port = colorize(new THREE.BoxGeometry(22, 12, 10), (x, y) => { const c = lin(0xe3d3b0); const k = 0.65 + 0.35 * clamp((y + 6) / 12); return [c[0] * k, c[1] * k, c[2] * k]; }); port.translate(0, 6, 16);
    const ped = colorize(new THREE.CylinderGeometry(0.0, 12.5, 4, 3, 1), () => { const c = lin(0xd9c49a); return c; }); ped.rotateY(Math.PI / 2 + Math.PI); ped.scale(1, 1, 0.85); ped.rotateX(Math.PI / 2); ped.translate(0, 13.5, 21.3);
    void ped;
    const tg = mergeGeos([drum, dome, port]); const tmesh = new THREE.Mesh(tg, tm); tmesh.position.set(-135, terrainHeight(-135, 255) - 0.5, 255); tmesh.rotation.y = 0.35; tp.add(tmesh); group.add(tp);
    // forum columns
    const fcol = colorize(new THREE.CylinderGeometry(0.9, 1.1, 14, 8), (x, y) => { const k = 0.6 + 0.4 * clamp((y + 7) / 14); const c = lin(0xe9ddc0); return [c[0] * k, c[1] * k, c[2] * k]; }); fcol.translate(0, 7, 0);
    const fm = new THREE.InstancedMesh(fcol, tm, 9); for (let i = 0; i < 9; i++) { const x = 90 + i * 6, z = 215; m.makeTranslation(x, terrainHeight(x, z) - 0.4, z); fm.setMatrixAt(i, m); } fm.frustumCulled = false; group.add(fm);

    // Colosseum landmark: elliptical arcade strip with ruined cut + inner bowl shadow cone
    {
      const A = 58, B = 47, H = 49, SEG = 96;
      const ft = makeColosseumFacade(1024, 512, 8); ft.wrapS = THREE.RepeatWrapping;
      const pos = [], uv = [], idx = [], nor = [];
      for (let j = 0; j <= SEG; j++) {
        const th = (j / SEG) * TAU, cx = Math.cos(th), sz = Math.sin(th);
        const broken = 1 - 0.62 * sstep(0.9, 1.7, Math.cos(th - 2.3) * 0.5 + 0.5 + 0.0) * sstep(0.2, 0.7, Math.cos(th - 2.3) * 0.5 + 0.5) ;
        const hh = H * (th > 1.0 && th < 3.6 ? 1 - 0.55 * Math.sin(((th - 1.0) / 2.6) * Math.PI) * (0.6 + 0.4 * Math.sin(th * 7)) : 1);
        void broken;
        const nx = cx / A, nzz = sz / B, nl = Math.hypot(nx, nzz);
        pos.push(cx * A, 0, sz * B, cx * A, hh, sz * B); nor.push(nx / nl, 0, nzz / nl, nx / nl, 0, nzz / nl);
        const u = (j / SEG) * 10; uv.push(u, 0, u, hh / H);
      }
      for (let j = 0; j < SEG; j++) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setIndex(idx);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      const cm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: ft, side: THREE.DoubleSide }));
      cm.position.set(-40, terrainHeight(-40, 330) - 1.0, 330); cm.rotation.y = 0.3; cm.name = 'colosseum'; cm.frustumCulled = false; group.add(cm);
      // inner seating cone (dark, so broken sections show a bowl)
      const cg = new THREE.CylinderGeometry(A * 0.98, A * 0.55, H * 0.7, 48, 1, true); cg.scale(1, 1, B / A); cg.translate(0, H * 0.35, 0);
      const cc = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: 0x8f7658, side: THREE.BackSide })); cc.position.copy(cm.position); cc.rotation.y = cm.rotation.y; group.add(cc);
      cityObjs.colosseum = cm;
    }
  }

  // ---------------- birds: instanced flock circling above the hillside, flap in vertex shader ----------------
  {
    const bg = new THREE.BufferGeometry();
    const v = new Float32Array([0, 0, 0, -1.2, 0.1, -0.3, -0.2, 0, 0.35, 0, 0, 0, 0.2, 0, 0.35, 1.2, 0.1, -0.3]);
    bg.setAttribute('position', new THREE.BufferAttribute(v, 3));
    const NBd = 22, ph = new Float32Array(NBd * 3); for (let i = 0; i < NBd; i++) { ph[i * 3] = rnd() * TAU; ph[i * 3 + 1] = rnd(); ph[i * 3 + 2] = rnd(); }
    bg.setAttribute('aB', new THREE.InstancedBufferAttribute(ph, 3));
    const bm = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uCol: { value: new THREE.Color(0x2a2230) } }, side: THREE.DoubleSide, fog: false,
      vertexShader: `attribute vec3 aB; uniform float uTime; void main(){
        vec3 p = position; p.y += abs(position.x) * 0.55 * sin(uTime * (7.0 + aB.y * 3.0) + aB.x * 5.0) ; p *= 0.9 + aB.z * 0.5;
        float a = uTime * (0.08 + aB.y * 0.05) + aB.x; float R = 45.0 + aB.z * 55.0;
        vec3 c = vec3(sin(a) * R + 10.0, 26.0 + aB.y * 22.0 + sin(a * 2.0 + aB.x) * 2.5, cos(a) * R * 0.7 + 60.0);
        float ca = cos(-a), sa = sin(-a); p.xz = mat2(ca, -sa, sa, ca) * p.xz;
        gl_Position = projectionMatrix * viewMatrix * vec4(c + p, 1.0); }`,
      fragmentShader: `uniform vec3 uCol;
      void main(){ gl_FragColor = vec4(uCol, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    });
    const birds = new THREE.InstancedMesh(bg, bm, NBd); birds.frustumCulled = false; birds.name = 'birds'; group.add(birds);
    for (let i = 0; i < NBd; i++) birds.setMatrixAt(i, new THREE.Matrix4());
  }

  // ---------------- dust motes ----------------
  const dust = createDustMotes({ count: 320, min: new THREE.Vector3(-26, 0.4, -20), max: new THREE.Vector3(26, 9, 22), size: 3, intensity: 1.5, wind: new THREE.Vector3(0.5, 0.04, 0.2) });
  group.add(dust.points);

  const api = {
    group, COURT, uniforms: U, flames, dust, water: trees.water, terrainHeight,
    groundHeightAt: terrainHeight, pathX,
    shadowHint: { center: new THREE.Vector3(0, 2, 0), radius: 46 },
    update(t, dt) { U.uTime.value = t; flames.update(t, U.uNight.value); dust.update(t, 1); trees.water.update(t); },
    setNight(n) {
      U.uNight.value = n;
      const w = cityObjs.wins.material; w.color.setRGB(2.4 * n, 1.05 * n, 0.3 * n);
    },
    setSun(sunDir, col) { trees.water.uniforms.uSunDir.value.copy(sunDir); trees.water.uniforms.uSunCol.value.set(col); },
    setDensity(d) { for (const [mesh, n] of treeMeshes) mesh.count = Math.floor(n * d); cityObjs.houses.count = Math.floor(cityObjs.houses.instanceMatrix.count * d); cityObjs.wins.count = Math.floor(cityObjs.nWin * d); },
    dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); },
  };
  api.setDensity(density);
  return api;
}
