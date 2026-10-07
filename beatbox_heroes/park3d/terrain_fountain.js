// The hero fountain: three stone tiers (faceted lathes with moss and wear), animated faceted water with a shimmering vertex colour, droplets, coins, underwater lamps.
import { THREE } from './kit.js';
import { col, mix, mul, smooth, sat } from './terrain_util.js';

const ST = { hi: col('#C9BFCB'), mid: col('#B0A6BC'), lo: col('#8E849F'), dk: col('#6C6283'), wet: col('#5F6F86'), moss: col('#66905B'), moss2: col('#477A5A'), gold: col('#F2C14E') };

export function buildFountain(S) {
  const B = S.B, FX = 0, FZ = 0, SEG = 14; B.gy = 0;
  // little helper: stone colour that gets mossy and wet near the bottom
  const stone = (y, wet) => { let c = y < 0.35 ? mix(ST.moss2, ST.lo, smooth(0.0, 0.35, y)) : ST.mid; if (wet) c = mix(c, ST.wet, 0.55); return c; };
  // plinth step
  B.lathe([[4.35, 0, ST.dk], [4.35, 0.1, ST.lo], [4.1, 0.17, ST.hi], [3.3, 0.17, ST.mid]], SEG, FX, 0, FZ, { rot: 0.2 });
  // basin: outer wall, chunky lip, inner wall (wet), floor
  B.lathe([[3.7, 0.12, ST.moss2], [3.78, 0.3, mix(ST.moss, ST.lo, 0.4)], [3.82, 0.62, ST.mid], [3.98, 0.7, ST.hi], [3.98, 0.84, ST.hi], [3.6, 0.9, ST.hi], [3.42, 0.84, ST.mid], [3.42, 0.58, ST.wet], [3.4, 0.14, mul(ST.wet, 0.8)], [0, 0.14, mul(mix(ST.wet, ST.moss2, 0.4), 0.85)]], SEG, FX, 0, FZ, { rot: 0.2, tint: 0.05 });
  // pedestal + tier 2 bowl
  B.lathe([[1.15, 0.14, ST.moss2], [1.12, 0.4, ST.moss], [0.92, 0.5, ST.mid], [0.66, 0.66, ST.mid], [0.5, 0.95, ST.mid], [0.6, 1.08, ST.hi], [0.46, 1.18, ST.mid], [0.46, 1.5, ST.mid], [1.0, 1.56, ST.lo], [1.55, 1.78, ST.mid], [1.98, 2.02, ST.mid], [2.1, 2.14, ST.hi], [2.1, 2.26, ST.hi], [1.86, 2.3, ST.hi], [1.72, 2.2, ST.mid], [1.45, 2.0, ST.wet], [0, 1.96, mul(ST.wet, 0.85)]], 12, FX, 0, FZ, { rot: 0.1, tint: 0.05 });
  // stem + tier 3 bowl + finial
  B.lathe([[0.4, 1.96, ST.mid], [0.38, 2.45, ST.mid], [0.52, 2.55, ST.hi], [0.42, 2.68, ST.mid], [0.42, 2.9, ST.mid], [0.55, 2.94, ST.lo], [0.95, 3.1, ST.mid], [1.26, 3.3, ST.mid], [1.34, 3.4, ST.hi], [1.34, 3.5, ST.hi], [1.12, 3.52, ST.hi], [1.0, 3.42, ST.mid], [0.7, 3.28, ST.wet], [0, 3.24, mul(ST.wet, 0.85)]], 10, FX, 0, FZ, { rot: 0.3, tint: 0.05 });
  B.lathe([[0.2, 3.2, ST.mid], [0.16, 3.55, ST.mid], [0.27, 3.66, ST.hi], [0.14, 3.82, ST.hi], [0.0, 3.98, ST.hi]], 8, FX, 0, FZ, {});
  // coins and a lost sandal on the basin floor
  for (let i = 0; i < 16; i++) { const a = S.rand() * 6.28, r = 1.4 + S.rand() * 1.8; B.cyl(Math.cos(a) * r, 0.14, Math.sin(a) * r, 0.1, 0.1, 0.02, 6, mix(ST.gold, col('#E0A33A'), S.rand()), { base: 0 }); }
  S.hit.circle(FX, FZ, 4.15);
  // contact shadow
  S.soft(FX, FZ, 5.3, 5.3, col('#3a2d5c'), 0.34, 0, 0.04, 20);

  // underwater lamps (glow when the lighting goes to dusk and night)
  S.anchors.fountainLights = [];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28 + 0.3, x = Math.cos(a) * 2.5, z = Math.sin(a) * 2.5; S.GLOW.cyl(x, 0.15, z, 0.16, 0.16, 0.04, 6, [0.5, 1.5, 1.7], { base: 0 }); S.anchors.fountainLights.push({ x, y: 0.3, z }); }

  // ---------------- water: faceted discs, animated every frame
  const tris = [], wpos = [], base = [];
  const disc = (y, radii, seg, rot, foam) => {
    const P = (ri, k) => { const a = rot + (k / seg) * Math.PI * 2 + (ri % 2) * 0.5 * (Math.PI * 2 / seg), r = radii[ri]; return [FX + Math.cos(a) * r, y, FZ + Math.sin(a) * r]; };
    const T = (a, b, c, ri) => { tris.push({ f: foam && ri === radii.length - 2 ? 1 : 0 }); [a, b, c].forEach((p) => { wpos.push(p[0], p[1], p[2]); base.push(p[1]); }); };
    for (let k = 0; k < seg; k++) T([FX, y, FZ], P(1, k + 1), P(1, k), 0);
    for (let ri = 1; ri < radii.length - 1; ri++) for (let k = 0; k < seg; k++) { const a = P(ri, k), b = P(ri, k + 1), c = P(ri + 1, k + 1), d = P(ri + 1, k); T(a, b, c, ri); T(a, c, d, ri); }
  };
  disc(0.56, [0, 1.1, 2.1, 2.9, 3.4], 14, 0.2, true); disc(2.12, [0, 0.9, 1.76], 12, 0.1, false); disc(3.31, [0, 0.55, 1.04], 10, 0.3, false);
  const N = wpos.length / 3; const geo = new THREE.BufferGeometry(); const posA = new THREE.BufferAttribute(new Float32Array(wpos), 3), colA = new THREE.BufferAttribute(new Float32Array(N * 3), 3); geo.setAttribute('position', posA); geo.setAttribute('color', colA);
  const water = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.9, shininess: 18, specular: new THREE.Color('#2a3a4c'), depthWrite: false, emissive: new THREE.Color('#1f7f98'), emissiveIntensity: 0.45 })); water.renderOrder = 3; water.receiveShadow = false; water.castShadow = false; S.group.add(water);
  const deep = col('#256F8E'), midc = col('#3FA7BE'), lite = col('#7ED3D6'), glint = col('#F7F1E3'), foamc = col('#DDF3EE');
  const cx = new Float32Array(N / 3), cz = new Float32Array(N / 3), cr = new Float32Array(N / 3);
  for (let i = 0; i < N / 3; i++) { const x = (wpos[i * 9] + wpos[i * 9 + 3] + wpos[i * 9 + 6]) / 3 - FX, z = (wpos[i * 9 + 2] + wpos[i * 9 + 5] + wpos[i * 9 + 8]) / 3 - FZ; cx[i] = x; cz[i] = z; cr[i] = Math.hypot(x, z); }
  function animate(t) {
    const P = posA.array, C = colA.array;
    for (let i = 0; i < N; i++) { const x = P[i * 3] - FX, z = P[i * 3 + 2] - FZ; P[i * 3 + 1] = base[i] + 0.022 * Math.sin(x * 2.1 + t * 1.5) * Math.cos(z * 1.7 - t * 1.1) + 0.012 * Math.sin(Math.hypot(x, z) * 5 - t * 3.2); }
    for (let i = 0; i < N / 3; i++) {
      const x = cx[i], z = cz[i], r = cr[i], w = Math.sin(x * 1.9 + t * 1.6) * Math.cos(z * 2.3 - t * 1.2) + 0.55 * Math.sin(r * 3.6 - t * 2.6), v = 0.5 + 0.5 * (w / 1.55);
      let c = mix(deep, midc, smooth(0.2, 0.62, v)); c = mix(c, lite, smooth(0.62, 0.9, v) * 0.9);
      if (Math.sin(t * 2.7 + i * 12.9898) > 0.965) c = mix(c, glint, 0.85);
      if (tris[i].f) c = mix(c, foamc, 0.25 + 0.2 * Math.sin(t * 2 + i));
      const a = Math.atan2(z, x), spl = smooth(0.35, 0, Math.abs(r - 2.5)) * (0.5 + 0.5 * Math.sin(t * 6 + a * 9)); c = mix(c, foamc, spl * 0.5);
      for (let k = 0; k < 3; k++) { const o = (i * 3 + k) * 3; C[o] = c[0]; C[o + 1] = c[1]; C[o + 2] = c[2]; }
    }
    posA.needsUpdate = true; colA.needsUpdate = true;
  }
  // ---------------- falling water sheets between the tiers (translucent faceted strips, unlit so they glow)
  const sheets = []; const sheetCols = [];
  const sheet = (r0, y0, r1, y1, seg, a0, a1) => { for (let k = 0; k < seg; k++) { const a = a0 + ((a1 - a0) * k) / seg, b = a0 + ((a1 - a0) * (k + 0.5)) / seg, P = (r, ang, y) => [FX + Math.cos(ang) * r, y, FZ + Math.sin(ang) * r], dr = r1 - r0, dy = y0 - y1;
    const rows = [[0, 0], [0.8, 0.25], [1, 1]]; for (let i = 0; i < 2; i++) { const A = rows[i], Bq = rows[i + 1]; sheets.push([P(r0 + dr * A[0], a, y0 - dy * A[1]), P(r0 + dr * A[0], b, y0 - dy * A[1]), P(r0 + dr * Bq[0], b, y0 - dy * Bq[1]), P(r0 + dr * Bq[0], a, y0 - dy * Bq[1])]); } } };
  sheet(2.12, 2.22, 2.6, 0.62, 28, 0.1, Math.PI * 2 + 0.1); sheet(1.36, 3.42, 1.8, 2.2, 16, 0.2, Math.PI * 2 + 0.2);
  const sg = new THREE.BufferGeometry(), sp = [], sc = [];
  sheets.forEach((q) => { [[0, 1, 2], [0, 2, 3]].forEach((t) => t.forEach((i) => { sp.push(q[i][0], q[i][1], q[i][2]); sc.push(1, 1, 1); })); });
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sp), 3)); const scA = new THREE.BufferAttribute(new Float32Array(sc), 3); sg.setAttribute('color', scA);
  const sheetMesh = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide })); sheetMesh.renderOrder = 4; S.group.add(sheetMesh);
  const sheetBaseY = sp.filter((v, i) => i % 3 === 1);
  function flow(t) { const C = scA.array; for (let i = 0; i < sp.length / 3; i++) { const x = sp[i * 3], y = sp[i * 3 + 1], z = sp[i * 3 + 2], w = 0.5 + 0.5 * Math.sin(y * 7 - t * 7 + Math.atan2(z, x) * 5), c = mix(midc, foamc, 0.25 + 0.6 * w); C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2]; } scA.needsUpdate = true; }
  flow(0);

  // ---------------- droplets (instanced, CPU driven, 56 of them)
  const dg = new THREE.OctahedronGeometry(0.03, 0); dg.scale(1, 2.0, 1);
  const NJ = 16, NB = 20, NC = 40, M = NJ + NB + NC, drops = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: '#D6F7FF', transparent: true, opacity: 0.92 }), M); drops.frustumCulled = false; drops.castShadow = false; S.group.add(drops);
  const dm = new THREE.Object3D(), ph = [];
  for (let i = 0; i < M; i++) ph.push({ a: i * 2.399 + S.rand(), o: S.rand(), s: 0.85 + S.rand() * 0.3 });
  function drip(t) {
    let n = 0;
    for (let j = 0; j < NJ; j++, n++) { const p = ph[n], u = (t * 0.85 + j / NJ) % 1, y = 4.0 + 3.0 * u - 3.75 * u * u, r = 0.9 * u * p.s; dm.position.set(FX + Math.cos(p.a) * r, y, FZ + Math.sin(p.a) * r); dm.scale.set(1, 1 - 0.3 * Math.abs(0.4 - u), 1); dm.updateMatrix(); drops.setMatrixAt(n, dm.matrix); }
    for (let j = 0; j < NB; j++, n++) { const p = ph[n], u = (t * 0.7 + (j >> 1) * 0.5 + (j & 1) * 0.5 + p.o * 0.2) % 1, a = ((j >> 1) / (NB / 2)) * 6.28 + 0.1; dm.position.set(FX + Math.cos(a) * (1.34 + 0.5 * u), 3.42 - 1.28 * u * u, FZ + Math.sin(a) * (1.34 + 0.5 * u)); dm.scale.set(1, 0.8 + u, 1); dm.updateMatrix(); drops.setMatrixAt(n, dm.matrix); }
    for (let j = 0; j < NC; j++, n++) { const p = ph[n], u = (t * 0.62 + (j >> 1) * 0.37 + (j & 1) * 0.5) % 1, a = ((j >> 1) / (NC / 2)) * 6.28; dm.position.set(FX + Math.cos(a) * (2.1 + 0.45 * u), 2.22 - 1.66 * u * u, FZ + Math.sin(a) * (2.1 + 0.45 * u)); dm.scale.set(1, 0.8 + u * 0.9, 1); dm.updateMatrix(); drops.setMatrixAt(n, dm.matrix); }
    drops.instanceMatrix.needsUpdate = true;
  }
  animate(0); drip(0);
  S.updaters.push((dt, t) => { animate(t); drip(t); flow(t); });
  S.anchors.fountain = { x: FX, z: FZ, rot: 0, radius: 4.15, height: 4.0 };
  S.water = water; S.drops = drops;
}
