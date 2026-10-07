// Undergrowth for the park: bushes, hedges, planters, rocks, flower beds, fallen leaves, grass tufts and soft ground decals.
import { THREE, rng, jitter, merged, flatMat, nonIndexed, paint } from './kit.js';
import { xf, paintCanopy, paintSolid, addSway, constUV, mix, col, blob } from './flora_common.js';

const BUSH = { lo: '#2f7a64', mid: '#48a058', hi: '#9ad060', glint: '#e4dc60' };
const BUSH2 = { lo: '#2f8470', mid: '#56ae60', hi: '#a8dc68', glint: '#ece468' };
const BLOOM = { lo: '#8e3f5e', mid: '#d6628f', hi: '#f6a8c0', glint: '#ffd9bc' };

// ---------- bushes, hedges, planters, rocks, leaves (one merged Lambert mesh) ----------
export function makeBush(seed, scale, flowering) {
  const r = rng(seed), parts = [], n = 3;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, rad = i === 0 ? 0 : r.range(0.35, 0.6), br = r.range(0.5, 0.8) * (i === 0 ? 1.1 : 1);
    parts.push(paintCanopy(xf(blob(br, 0, r, r.range(0.7, 0.9)), { x: Math.cos(a) * rad, y: br * 0.55, z: Math.sin(a) * rad, ry: r() * 6 }), r, r() > 0.5 ? BUSH : BUSH2, { x: 0, y: 0.5, z: 0 }, 1.1));
  }
  if (flowering) for (let i = 0; i < 5; i++) {
    const a = r() * 6.28, h = r.range(0.55, 0.95), rr = r.range(0.35, 0.7);
    const o = new THREE.OctahedronGeometry(0.1, 0); parts.push(paintSolid(xf(o, { x: Math.cos(a) * rr, y: h, z: Math.sin(a) * rr, s: r.range(0.9, 1.4) }), flowering[0], flowering[1], r, 0.1));
  }
  return xf(merged(parts), { s: scale || 1 });
}
function makeHedgeRow(seed, len, h) {
  const r = rng(seed), parts = [], n = Math.max(2, Math.round(len / 0.8));
  for (let i = 0; i < n; i++) { const x = (i / (n - 1) - 0.5) * len; const b = new THREE.IcosahedronGeometry(0.62, 0); b.scale(1, h / 0.62 * 0.75, 0.9); parts.push(paintCanopy(xf(jitter(b, 0.18, r), { x, y: h * 0.45, ry: r() * 6 }), r, BUSH2, { x: 0, y: h * 0.4, z: 0 }, 1.3)); }
  const base = new THREE.BoxGeometry(len + 0.5, h * 0.55, 0.9); base.translate(0, h * 0.27, 0); parts.push(paintSolid(base, '#2a5550', '#3f7d50', r, 0.05));
  return merged(parts);
}
function makeRock(seed, s) { const r = rng(seed); const g = jitter(new THREE.IcosahedronGeometry(0.4, 0), 0.18, r); g.scale(1.2, 0.7, 1); return xf(paintSolid(g, '#6c6382', '#b0a6b8', r, 0.3), { y: 0.1, s, ry: r() * 6 }); }
function makePlanter(seed, bloomCol) {
  const r = rng(seed), parts = [];
  const pot = new THREE.CylinderGeometry(0.62, 0.48, 0.7, 8, 1); pot.translate(0, 0.35, 0); parts.push(paintSolid(jitter(pot, 0.04, r), '#8e3f3b', '#c9694a', r, 0.2));
  const rim = new THREE.CylinderGeometry(0.7, 0.66, 0.14, 8, 1); rim.translate(0, 0.74, 0); parts.push(paintSolid(rim, '#b5573f', '#e08a62', r, 0.2));
  const soil = new THREE.CylinderGeometry(0.58, 0.58, 0.04, 8, 1); soil.translate(0, 0.78, 0); parts.push(paintSolid(soil, '#4b3547', '#5a4040', r));
  parts.push(paintCanopy(xf(blob(0.52, 1, r, 0.8), { y: 1.0 }), r, BUSH2, { x: 0, y: 1, z: 0 }, 0.9));
  for (let i = 0; i < 7; i++) { const a = r() * 6.28, rr = r.range(0.15, 0.5); const o = new THREE.OctahedronGeometry(0.1, 0); parts.push(paintSolid(xf(o, { x: Math.cos(a) * rr, y: 1.2 + r() * 0.2, z: Math.sin(a) * rr, s: r.range(0.9, 1.3) }), bloomCol[0], bloomCol[1], r, 0.1)); }
  return merged(parts);
}

// ---------- flowers (static merged, swayed in the vertex shader by world position) ----------
const FLOWER_COLS = [
  ['#ff5fa3', '#ffd0e4'], // pink
  ['#ffd23f', '#fff0a0'], // yellow
  ['#8a63ff', '#d3c2ff'], // violet
  ['#ff8a4d', '#ffd0a0'], // orange
];
function flowerGeo(r, c, h) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.012, 0.018, h, 3, 1, true); stem.translate(0, h / 2, 0); parts.push(paint(nonIndexed(stem), '#3f7d4e'));
  const head = new THREE.ConeGeometry(0.16, 0.08, 5, 1, true); head.rotateX(Math.PI); // dish facing up
  const hn = nonIndexed(head); const p = hn.attributes.position, a = new Float32Array(p.count * 3), ca = col(c[0]), cb = col(c[1]), cc = col('#ffe27a');
  for (let i = 0; i < p.count; i++) { const apex = p.getY(i) < 0; const k = apex ? cc : (i % 2 ? ca : cb); a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; }
  hn.setAttribute('color', new THREE.BufferAttribute(a, 3));
  parts.push(xf(hn, { y: h + 0.02, rx: (r() - 0.5) * 0.5, rz: (r() - 0.5) * 0.5 }));
  const leaf = new THREE.ConeGeometry(0.05, 0.22, 3, 1, true); leaf.translate(0, 0.11, 0); const lf = paint(nonIndexed(leaf), '#5aa157');
  parts.push(xf(lf, { x: 0.02, y: 0, rz: -0.9, ry: r() * 6 }));
  return merged(parts);
}

// ---------- soft decals: tree contact shadows, lawn colour patches, petals ----------
export function decalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildPlants(ctx, A) {
  // A: { ok(x,z,pad), trees:[{x,z,s,kind}], flowerSpots, planterSpots, bounds, anchors, R }
  const R = rng(777), out = { group: new THREE.Group(), update() {}, stats: {} };
  const shrub = [], flowers = [], decalGeoms = [];
  const baseMat = flatMat(); const sway = addSway(flatMat({ side: THREE.DoubleSide, emissive: new THREE.Color('#3a2a4a') }), { amp: 0.05, height: 0.45, freq: 1.7 });

  // bushes in trios at the foot of trees and in corners
  const bushVariants = [makeBush(11, 1), makeBush(12, 1), makeBush(13, 1, ['#ff5fa3', '#ffc0dc']), makeBush(14, 1, ['#ffd23f', '#fff0a0'])];
  const bushSpots = A.bushSpots || [];
  for (const b of bushSpots) {
    for (let i = 0; i < b.n; i++) {
      const a = R() * 6.28, rr = b.r * (0.4 + R() * 0.7), x = b.x + Math.cos(a) * rr, z = b.z + Math.sin(a) * rr;
      if (!A.ok(x, z, 0.5)) continue; const s = (i === 0 ? 1.25 : i === 1 ? 0.95 : 0.7) * b.s * (0.9 + R() * 0.25);
      shrub.push(xf(R.pick(bushVariants), { x, y: A.h(x, z) - 0.05, z, ry: R() * 6, s, rx: (R() - 0.5) * 0.06, rz: (R() - 0.5) * 0.06 }));
      decalGeoms.push({ x, z, y: A.h(x, z), r: 1.15 * s, c: '#2b2147', a: 0.35 });
    }
  }
  // hedges
  for (const h of A.hedges || []) { if (!A.ok(h.x, h.z, 0.3)) continue; shrub.push(xf(makeHedgeRow(h.seed, h.len, h.h || 0.9), { x: h.x, y: A.h(h.x, h.z) - 0.05, z: h.z, ry: h.ry || 0 })); decalGeoms.push({ x: h.x, z: h.z, y: A.h(h.x, h.z), r: h.len * 0.55 + 0.4, c: '#2b2147', a: 0.28, sx: h.ry ? 0.5 : 1, ry: h.ry || 0 }); }
  // planters
  const planters = [makePlanter(31, FLOWER_COLS[0]), makePlanter(32, FLOWER_COLS[1]), makePlanter(33, FLOWER_COLS[2])];
  for (const p of A.planters || []) { shrub.push(xf(R.pick(planters), { x: p.x, y: A.h(p.x, p.z), z: p.z, ry: R() * 6, s: p.s || 1 })); decalGeoms.push({ x: p.x, z: p.z, y: A.h(p.x, p.z), r: 1.0 * (p.s || 1), c: '#2b2147', a: 0.3 }); }
  // rocks in trios
  for (const k of A.rockSpots || []) for (let i = 0; i < 3; i++) { const x = k.x + R.range(-0.9, 0.9), z = k.z + R.range(-0.9, 0.9); if (!A.ok(x, z, 0.3)) continue; shrub.push(xf(makeRock(R() * 1e5, [1, 0.65, 0.45][i] * (k.s || 1)), { x, y: A.h(x, z), z })); }
  // fallen leaves under tree canopies: little tilted diamonds, autumn warm
  const leafCols = ['#e0a43a', '#cf5f36', '#f0b24a', '#a8456f', '#d98a3a', '#e9c24f'];
  for (const t of A.trees) {
    if (t.kind === 'street' || t.kind === 'pine' || t.kind === 'cypress') continue;
    const cnt = t.kind === 'maple' ? 16 : 8, pal = t.kind === 'maple' ? ['#cf5f36', '#e0703a', '#f0a040', '#a8453e'] : t.kind === 'cherry' ? ['#f7b6c8', '#e4799c', '#ffd0e0', '#f2a0b8'] : leafCols;
    for (let i = 0; i < cnt; i++) {
      const a = R() * 6.28, rr = t.s * (0.9 + R() * 2.6), x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr; if (!A.ok(x, z, 0.1)) continue;
      const lg = new THREE.PlaneGeometry(0.2, 0.12, 1, 1); lg.rotateX(-Math.PI / 2); const ng = nonIndexed(lg); ng.deleteAttribute('uv');
      paint(ng, R.pick(pal)); shrub.push(xf(ng, { x, y: A.h(x, z) + 0.04 + R() * 0.01, z, ry: R() * 6, rz: (R() - 0.5) * 0.4, s: 0.8 + R() * 0.9 }));
    }
  }
  for (let i = 0; i < shrub.length; i++) { shrub[i].deleteAttribute('uv'); }
  // some pieces may carry a uv attribute and others not: normalise
  const shrubGeo = merged(shrub.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; }));
  const shrubMesh = new THREE.Mesh(shrubGeo, baseMat); shrubMesh.castShadow = true; shrubMesh.receiveShadow = true; shrubMesh.name = 'shrubs'; out.group.add(shrubMesh);

  // flower beds: clusters in threes, colour accents per bed
  let fcount = 0;
  for (const bed of A.flowerBeds || []) {
    const n = Math.round((bed.n || 12) * 1.5), cols = bed.cols || [0, 1, 2];
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28, rr = Math.sqrt(R()) * bed.r, cx = bed.x + Math.cos(a) * rr * (bed.sx || 1), cz = bed.z + Math.sin(a) * rr, c = FLOWER_COLS[cols[k % cols.length]];
      if (!A.ok(cx, cz, 0.15)) continue;
      for (let j = 0; j < 3; j++) { // a trio
        const x = cx + R.range(-0.2, 0.2), z = cz + R.range(-0.2, 0.2), h = R.range(0.26, 0.5);
        flowers.push(xf(flowerGeo(R, c, h), { x, y: A.h(x, z) - 0.02, z, ry: R() * 6, s: R.range(0.85, 1.25), rx: (R() - 0.5) * 0.15, rz: (R() - 0.5) * 0.15 })); fcount++;
      }
    }
    decalGeoms.push({ x: bed.x, z: bed.z, y: A.h(bed.x, bed.z), r: bed.r * 1.15, sx: bed.sx || 1, c: '#5a4038', a: 0.4 });
  }
  if (flowers.length) { const fm = new THREE.Mesh(merged(flowers.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; })), sway); fm.castShadow = false; fm.receiveShadow = true; fm.name = 'flowers'; out.group.add(fm); }

  // grass tufts: instanced blade clusters, painted gradient, swaying in the vertex shader
  const tuftGeo = (() => {
    const parts = []; const lean = [[0.0, 0.0, 0.36], [1.9, 0.2, 0.46], [3.8, -0.1, 0.32], [5.0, 0.24, 0.4]];
    lean.forEach((l) => {
      const hgt = l[2], w = 0.11; const g = new THREE.BufferGeometry();
      const v = new Float32Array([-w, 0, 0, w, 0, 0, w * 0.1, hgt, 0]); g.setAttribute('position', new THREE.BufferAttribute(v, 3));
      const cc = [col('#4aa660'), col('#4aa660'), col('#c8f27c')], ca = new Float32Array(9); cc.forEach((k, j) => { ca[j * 3] = k.r; ca[j * 3 + 1] = k.g; ca[j * 3 + 2] = k.b; }); g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      g.computeVertexNormals(); parts.push(xf(g, { x: Math.cos(l[0]) * 0.08, z: Math.sin(l[0]) * 0.08, ry: l[0], rx: l[1] + 0.05 }));
    });
    return merged(parts);
  })();
  const tufts = A.tuftSpots || [];
  const tuftMat = addSway(flatMat({ side: THREE.DoubleSide, emissive: new THREE.Color('#2f5a3a') }), { amp: 0.09, height: 0.4, freq: 1.9, instanced: true });
  const tm = new THREE.InstancedMesh(tuftGeo, tuftMat, tufts.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
  tufts.forEach((t, i) => {
    E.set((R() - 0.5) * 0.25, R() * 6.28, (R() - 0.5) * 0.25); Q.setFromEuler(E); P.set(t.x, A.h(t.x, t.z) - 0.02, t.z); const s = (0.7 + R() * 0.8) * (t.s || 1); S.set(s, s * (0.8 + R() * 0.7), s);
    M.compose(P, Q, S); tm.setMatrixAt(i, M);
    // tint: mostly lush, some dry golden and some teal tufts
    const k = R(); if (k < 0.1) C.set('#f4e08e'); else if (k < 0.3) C.set('#d6f0a8'); else if (k < 0.45) C.set('#9fd8b0'); else C.set('#ffffe8'); C.multiplyScalar(0.95 + R() * 0.3); tm.setColorAt(i, C);
  });
  tm.instanceMatrix.needsUpdate = true; if (tm.instanceColor) tm.instanceColor.needsUpdate = true; tm.castShadow = false; tm.receiveShadow = true; tm.frustumCulled = false; tm.name = 'tufts'; out.group.add(tm);

  // decals: soft tinted discs lying on the ground (tree contact shadow, flower bed soil, lawn patches)
  const dec = A.decals.concat(decalGeoms), dparts = [];
  for (const d of dec) {
    const g = new THREE.PlaneGeometry(2, 2, 1, 1); g.rotateX(-Math.PI / 2); const ng = nonIndexed(g); const p = ng.attributes.position, a = new Float32Array(p.count * 4), c = col(d.c);
    for (let i = 0; i < p.count; i++) { a[i * 4] = c.r; a[i * 4 + 1] = c.g; a[i * 4 + 2] = c.b; a[i * 4 + 3] = d.a; }
    ng.setAttribute('color', new THREE.BufferAttribute(a, 4)); ng.deleteAttribute('normal');
    dparts.push(xf(ng, { x: d.x, y: (d.y !== undefined ? d.y : A.h(d.x, d.z)) + 0.05 + (d.lift || 0), z: d.z, sx: d.r * (d.sx || 1), sy: 1, sz: d.r, ry: d.ry !== undefined ? d.ry : (d.sx ? 0 : R() * 6) }));
  }
  const dmat = new THREE.MeshBasicMaterial({ map: decalTexture(), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (dparts.length) { const dgeo = merged(dparts); const dm = new THREE.Mesh(dgeo, dmat); dm.renderOrder = 1; dm.name = 'decals'; out.group.add(dm); }

  const tc = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3; out.dbg = shrub.map((g) => Math.round(tc(g))).sort((a, b) => b - a).slice(0, 12).join(','); out.swayMats = [sway, tuftMat]; out.stats = { dbg: out.dbg, shrub: shrub.length, flowers: fcount, tufts: tufts.length, decals: dec.length };
  out.update = (dt, t) => { sway.userData.sway.value = t; tuftMat.userData.sway.value = t; };
  return out;
}
