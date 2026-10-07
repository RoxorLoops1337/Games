// RUN mini game: the endless park jog loop. Local space: the runner moves along +z, x is lateral, y up.
// Four recycled chunks (L metres each, two layouts) hold lawns with mown stripes, a terracotta jogging track, kerbs, lamps, benches,
// trees, bushes and flowers. A far skyline ring follows the camera with parallax. Every chunk is 3 meshes (ground, props, lamp glow) + 1 halo Points.
import { THREE, rng as mkRng, flatMat, box, cyl, paint, nonIndexed, mergeGeometries } from './kit.js';
import { xf } from './flora_common.js';
import { makeOak, makePine, makeCherry, makeCypress, makeStreet, PALS } from './flora_trees.js';
import { makeBush } from './flora_plants.js';

export const CH_L = 48;      // chunk length (m)
export const CH_N = 3;       // chunks in the ring
const TWO_PI = Math.PI * 2;
const C = (h) => new THREE.Color(h);

// keep only position, normal and colour so everything merges
function strip(g) { if (!g.attributes.color) paint(g, '#ffffff'); const n = g.index ? g.toNonIndexed() : g; const o = new THREE.BufferGeometry(); o.setAttribute('position', n.attributes.position); if (n.attributes.normal) o.setAttribute('normal', n.attributes.normal); o.setAttribute('color', n.attributes.color); return o; }
function ensureNormals(g) { if (!g.attributes.normal) g.computeVertexNormals(); return g; }

// periodic hill height so the lawn tiles in z
export function hillY(x, z) {
  const ax = Math.abs(x), s = Math.min(1, Math.max(0, (ax - 9) / 24)), sm = s * s * (3 - 2 * s), sg = x < 0 ? 1.7 : 0.6;
  const a = 0.5 + 0.5 * Math.sin(TWO_PI * 2 * z / CH_L + x * 0.17 + sg), b = Math.sin(TWO_PI * 3 * z / CH_L + x * 0.41 + sg * 2);
  return sm * (1.4 + 3.4 * a + 0.9 * b);
}

class Soup { // tiny triangle soup with per-face colour
  constructor() { this.P = []; this.C = []; }
  tri(a, b, c, col) { this.P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (let i = 0; i < 3; i++) this.C.push(col.r, col.g, col.b); }
  // quad over (x0..x1, z0..z1) with heights; ordering gives an upward normal
  quad(p00, p01, p10, p11, col) { this.tri(p00, p01, p10, col); this.tri(p10, p01, p11, col); }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.computeVertexNormals(); return g; }
}

const tint = (c, r, a) => { const k = (r() - 0.5) * a; return new THREE.Color(Math.min(1, Math.max(0, c.r + k)), Math.min(1, Math.max(0, c.g + k)), Math.min(1, Math.max(0, c.b + k))); };

function buildGround(r) {
  const S = new Soup(), DZ = 4, nz = CH_L / DZ;
  const g1 = C('#4f9a4a'), g2 = C('#5cae52'), g3 = C('#438a45'), hz = C('#78a888'), warm = C('#9ac35a');
  const xsR = [3.0, 4.6, 6.4, 8.4, 10.5, 13.5, 17, 21.5, 27, 34, 44, 60]; const xs = xsR.slice().reverse().map((x) => -x).concat(xsR);
  for (let i = 0; i < xs.length - 1; i++) {
    if (xs[i] < 0 && xs[i + 1] > 0) continue; // gap = pavement and track
    for (let k = 0; k < nz; k++) {
      const z0 = k * DZ, z1 = z0 + DZ, xa = xs[i], xb = xs[i + 1], stripe = (k + (i < xs.length / 2 ? 0 : 1)) & 1;
      let c = stripe ? g1.clone() : g2.clone(); if (((i * 7 + k * 3) % 5) === 0) c.lerp(g3, 0.5);
      const far = Math.min(1, Math.max(0, (Math.min(Math.abs(xa), Math.abs(xb)) - 14) / 40)); c.lerp(hz, far * 0.45); c.lerp(warm, 0.18 * Math.sin(z0 * 0.8 + xa) * 0.5 + 0.1 * (1 - far));
      S.quad([xa, hillY(xa, z0), z0], [xa, hillY(xa, z1), z1], [xb, hillY(xb, z0), z0], [xb, hillY(xb, z1), z1], tint(c, r, 0.04));
    }
  }
  // pavement (sand) and terracotta jogging track, with stacked heights so nothing z-fights
  const sand = [C('#d8b98c'), C('#caa77a'), C('#e4c9a0')], t1 = C('#b95a42'), t2 = C('#c46a4c'), cream = C('#f4e6c8');
  for (const sgn of [-1, 1]) for (let k = 0; k < CH_L / 1.5; k++) { const z0 = k * 1.5, z1 = z0 + 1.5; const a = 2.0 * sgn, b = 3.0 * sgn; const lo = Math.min(a, b), hi = Math.max(a, b);
    S.quad([lo, 0.012, z0], [lo, 0.012, z1], [hi, 0.012, z0], [hi, 0.012, z1], tint(sand[(k + (sgn > 0 ? 1 : 0)) % 3], r, 0.025)); }
  for (let k = 0; k < CH_L / 3; k++) { const z0 = k * 3, z1 = z0 + 3; S.quad([-2.0, 0.024, z0], [-2.0, 0.024, z1], [2.0, 0.024, z0], [2.0, 0.024, z1], tint(k & 1 ? t1 : t2, r, 0.03)); }
  // paint: edge lines and a cross stripe every 12 m (strong speed cue)
  for (const x of [-1.75, 1.75]) S.quad([x - 0.05, 0.03, 0], [x - 0.05, 0.03, CH_L], [x + 0.05, 0.03, 0], [x + 0.05, 0.03, CH_L], cream);
  for (let z = 4; z < CH_L; z += 12) S.quad([-1.75, 0.031, z], [-1.75, 0.031, z + 0.22], [1.75, 0.031, z], [1.75, 0.031, z + 0.22], cream);
  return S.geo();
}

export function buildWorld(ctx, rootGroup, q) {
  const R = mkRng(4242), tier = q === 'low' ? 0 : q === 'med' ? 1 : 2;
  // ---- tree library (built once) ----
  const lib = { oak: [1, 2, 3].map((s) => strip(makeOak(100 + s, undefined, 1))), maple: [1, 2].map((s) => strip(makeOak(200 + s, PALS.MAPLE, 1))), cherry: [1, 2].map((s) => strip(makeCherry(300 + s, 1))), pine: [1, 2].map((s) => strip(makePine(400 + s, 1))), cyp: [strip(makeCypress(500, 1))], street: [1, 2].map((s) => strip(makeStreet(600 + s, 1))),
    bush: [1, 2, 3].map((s) => strip(makeBush(700 + s, 1.1, null))), bloomA: strip(makeBush(711, 1, ['#d8338a', '#ff7ac0'])), bloomB: strip(makeBush(712, 1, ['#e0a020', '#ffe14d'])), bloomC: strip(makeBush(713, 1, ['#6a50d0', '#b49aff'])) };
  const place = (geo, x, y, z, ry, s) => xf(geo, { x, y, z, ry, s });
  const pickTree = (r) => { const u = r(); const arr = u < 0.4 ? lib.oak : u < 0.58 ? lib.maple : u < 0.76 ? lib.cherry : u < 0.92 ? lib.pine : lib.cyp; return arr[Math.floor(r() * arr.length)]; };
  const lampPost = (parts, glow, x, z, side) => {
    const iron = '#3a3550', arm = side * -0.55;
    parts.push(cyl(0.11, 0.17, 0.3, 6, '#2b2438', x, 0.15, z), cyl(0.06, 0.09, 3.5, 6, iron, x, 1.9, z), box(0.7, 0.07, 0.07, iron, x + arm * 0.5, 3.6, z), box(0.3, 0.06, 0.3, iron, x + arm, 3.68, z), cyl(0.0, 0.2, 0.18, 6, '#2b2438', x + arm, 3.78, z));
    parts.push(box(0.19, 0.3, 0.19, '#fff0c8', x + arm, 3.47, z));
  };
  const bench = (parts, x, z, side) => {
    const w = '#a8693b', wd = '#8e5530', iron = '#3a3550', fx = x, dir = -side; // dir = towards the track
    const g = [box(0.5, 0.06, 1.7, w, 0, 0.5, 0), box(0.06, 0.5, 1.7, wd, -dir * 0.22, 0.78, 0), box(0.5, 0.03, 1.7, wd, 0, 0.455, 0), box(0.07, 0.5, 0.07, iron, 0, 0.25, -0.7), box(0.07, 0.5, 0.07, iron, 0, 0.25, 0.7), box(0.55, 0.05, 0.05, iron, 0, 0.5, -0.7), box(0.55, 0.05, 0.05, iron, 0, 0.5, 0.7)];
    const m = mergeGeometries(g.map(nonIndexed)); parts.push(xf(m, { x: fx, y: 0, z, ry: 0 }));
  };
  const chunkLayouts = [];
  for (let v = 0; v < 2; v++) {
    const r = mkRng(900 + v * 77), props = [], far = [], glow = [], halos = [];
    // lamps and benches
    const lz = [8 + v * 4, 32 - v * 3];
    lz.forEach((z, i) => { const side = (i + v) & 1 ? 1 : -1; lampPost(props, glow, side * 3.55, z, side); halos.push([side * 3.55 - side * 0.55, 3.5, z]); const s2 = -side; lampPost(props, glow, s2 * 3.55, z + 12 + v * 2, s2); halos.push([s2 * 3.55 - s2 * 0.55, 3.5, z + 12 + v * 2]); });
    [[18 + v * 6, v ? 1 : -1], [42 - v * 8, v ? -1 : 1]].forEach(([z, side]) => bench(props, side * 4.3, z, side));
    // tree rows. Row 1 hugs the lawn edge, row 2 fills the middle ground, row 3 is cheap and far on the hills.
    const n1 = tier === 0 ? 3 : tier === 1 ? 4 : 5, n2 = tier === 0 ? 3 : tier === 1 ? 5 : 6, n3 = tier === 0 ? 4 : tier === 1 ? 6 : 7;
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < n1; i++) { const z = (i + 0.5) * (CH_L / n1) + (r() - 0.5) * 3, x = sgn * (5.6 + r() * 3); props.push(place(pickTree(r), x, hillY(x, z), z, r() * 6.28, 0.85 + r() * 0.5)); }
      for (let i = 0; i < n2; i++) { const z = (i + r()) * (CH_L / n2), x = sgn * (10.5 + r() * 10); far.push(place(pickTree(r), x, hillY(x, z), z, r() * 6.28, 1 + r() * 0.6)); }
      for (let i = 0; i < n3; i++) { const z = (i + r()) * (CH_L / n3), x = sgn * (24 + r() * 22); const u = r(); far.push(place(u < 0.5 ? lib.street[i & 1] : u < 0.8 ? lib.pine[i & 1] : lib.oak[i % 3], x, hillY(x, z), z, r() * 6.28, (u < 0.5 ? 2 : 1.4) + r() * 0.8)); }
      // bushes and flower beds hugging the kerb
      const nb = tier === 0 ? 4 : 7; for (let i = 0; i < nb; i++) { const z = (i + r()) * (CH_L / nb), x = sgn * (3.7 + r() * 1.6), u = r(); const b = u < 0.22 ? lib.bloomA : u < 0.38 ? lib.bloomB : u < 0.5 ? lib.bloomC : lib.bush[i % 3]; props.push(place(b, x, 0, z, r() * 6.28, 0.7 + r() * 0.6)); }
    }
    // kerb stones: one merged strip per side
    for (const sgn of [-1, 1]) for (let z = 0; z < CH_L; z += 2) props.push(box(0.3, 0.16, 1.95, z % 4 ? '#b8aec7' : '#a79cba', sgn * 2.9, 0.08, z + 1));
    chunkLayouts.push({ props: mergeGeometries(props.map((g) => ensureNormals(strip(g)))), far: mergeGeometries(far.map((g) => ensureNormals(strip(g)))), halos });
  }
  const groundGeo = [0, 1].map((v) => mergeGeometries([buildGround(mkRng(55 + v)), chunkLayouts[v].far]));
  const propMat = flatMat(), groundMat = flatMat();
  // halo Points (soft additive glows around the lamp heads)
  const haloMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uLevel: { value: 1 }, uPx: { value: 900 } },
    vertexShader: 'uniform float uPx; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(uPx * 1.1 * 2.4 / -mv.z, 2.0, 260.0); }',
    fragmentShader: 'uniform float uLevel; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r); a = a * a; float core = smoothstep(0.16, 0.0, r); vec3 c = mix(vec3(1.0, 0.7, 0.36), vec3(1.0, 0.95, 0.8), core); gl_FragColor = vec4(c * (a * 0.8 + core * 1.2) * uLevel, a * uLevel); }' });
  const chunks = [], haloN = chunkLayouts[0].halos.length;
  for (let s = 0; s < CH_N; s++) {
    const v = s & 1, L = chunkLayouts[v], grp = new THREE.Group(); grp.name = 'run_chunk';
    const gm = new THREE.Mesh(groundGeo[v], groundMat); gm.receiveShadow = true; gm.name = 'run_ground';
    const pm = new THREE.Mesh(L.props, propMat); pm.castShadow = true; pm.receiveShadow = true; pm.name = 'run_props';
    grp.add(gm, pm); grp.frustumCulled = false; [gm, pm].forEach((m) => { m.frustumCulled = false; }); rootGroup.add(grp); chunks.push(grp);
  }
  const hpos = new Float32Array(CH_N * 8 * 3), hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hpos, 3));
  const halo = new THREE.Points(hg, haloMat); halo.frustumCulled = false; halo.name = 'run_halo'; rootGroup.add(halo); void haloN;
  // ---- skyline ring (own simple version: a hazy silhouette ring that follows the camera with parallax) ----
  const sky = buildSkylineRing(R); rootGroup.add(sky.group);
  let lastBase = -1e9;
  return {
    chunks, sky, haloMat, halo,
    dispose() { chunks.forEach((c) => { rootGroup.remove(c); c.children.forEach((m) => { if (m.geometry && m.geometry !== groundGeo[0] && m.geometry !== groundGeo[1]) m.geometry.dispose(); }); }); groundGeo.forEach((g) => g.dispose()); chunkLayouts.forEach((l) => { l.props.dispose(); }); rootGroup.remove(halo, sky.group); hg.dispose(); sky.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
    // recycle the ring so the track is endless; z = camera anchor position along the track
    update(z, lampLevel) {
      const base = Math.floor((z - 12) / CH_L);
      if (base !== lastBase) { lastBase = base; let k = 0; for (let s = 0; s < CH_N; s++) { const idx = base + (((s - base) % CH_N) + CH_N) % CH_N; chunks[s].position.z = idx * CH_L; for (const h of chunkLayouts[s & 1].halos) { hpos[k++] = h[0]; hpos[k++] = h[1]; hpos[k++] = h[2] + idx * CH_L; } } hg.attributes.position.needsUpdate = true; hg.setDrawRange(0, k / 3); }
      haloMat.uniforms.uLevel.value = 0.12 + 0.88 * lampLevel;
      sky.group.position.z = z * 0.9;
    },
    setPixelHeight(h) { haloMat.uniforms.uPx.value = h; },
    stats() { let t = 0; chunks.forEach((c) => c.children.forEach((m) => { if (m.geometry && m.isMesh) t += m.geometry.attributes.position.count / 3; })); return t; },
  };
}

function buildSkylineRing(r) {
  const group = new THREE.Group(); group.name = 'run_skyline';
  const bodies = [], wins = [], base = C('#7a5c9a'), top = C('#b27ca8'), hazeC = C('#f0b79a');
  const N = 46;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * TWO_PI + r() * 0.05, dist = 120 + r() * 26, w = 7 + r() * 11, d = 7 + r() * 9, h = 10 + r() * 20 * (0.5 + 0.5 * Math.abs(Math.sin(ang * 1.7)));
    const x = Math.sin(ang) * dist, z = Math.cos(ang) * dist;
    const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1); g.translate(0, h / 2 - 3, 0); const gg = nonIndexed(g); const pos = gg.attributes.position, col = new Float32Array(pos.count * 3), tmp = new THREE.Color();
    const tint0 = r() * 0.25;
    for (let k = 0; k < pos.count; k++) { const t = Math.min(1, Math.max(0, (pos.getY(k) + 3) / h)); tmp.copy(hazeC).lerp(base, 0.28 + tint0 * 0.6).lerp(top, t * 0.4); col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b; }
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3)); gg.rotateY(ang); gg.translate(x, 0, z); gg.deleteAttribute('uv'); bodies.push(gg);
    // lit windows on the face towards the centre
    const nx = -Math.sin(ang), nz = -Math.cos(ang), tx = Math.cos(ang), tz = -Math.sin(ang), cols = Math.max(2, Math.floor(w / 2.2)), rows = Math.max(2, Math.floor(h / 3));
    for (let a = 0; a < cols; a++) for (let b = 1; b < rows; b++) { if (r() > 0.42) continue; const u = (a + 0.5) / cols - 0.5, y = -3 + (b + 0.3) * (h / rows), px = x + nx * (d / 2 + 0.05) + tx * u * w * 0.85, pz = z + nz * (d / 2 + 0.05) + tz * u * w * 0.85;
      const q = new THREE.PlaneGeometry(0.9, 1.1); q.rotateY(Math.atan2(nx, nz)); q.translate(px, y, pz); const qq = nonIndexed(q); const cc = new Float32Array(qq.attributes.position.count * 3), wc = C(r() > 0.5 ? '#ffd27a' : '#ffb067'); for (let k = 0; k < qq.attributes.position.count; k++) { cc[k * 3] = wc.r; cc[k * 3 + 1] = wc.g; cc[k * 3 + 2] = wc.b; }
      qq.setAttribute('color', new THREE.BufferAttribute(cc, 3)); qq.deleteAttribute('uv'); qq.deleteAttribute('normal'); wins.push(qq); }
  }
  const bm = new THREE.Mesh(mergeGeometries(bodies.map((g) => { if (!g.attributes.normal) g.computeVertexNormals(); return g; })), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); bm.name = 'skyline'; bm.frustumCulled = false;
  const wm = new THREE.Mesh(mergeGeometries(wins), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false })); wm.name = 'skyline_windows'; wm.frustumCulled = false;
  group.add(bm, wm); return { group };
}
