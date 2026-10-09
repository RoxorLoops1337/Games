// Encore Island 3D, loot + projectiles: ground items (S.items), the treasure chest (S.chest), hero / ally / tower notes and boulders (S.shots),
// enemy orbs (S.eshots) and the flying loot handed over by fx3d (S.fly). Everything is instanced: one InstancedMesh per model, per-instance tint.
//   models (all ~1 world unit wide, medium poly, ink hull baked in): 8 helmets (items.js HELM_PAINT designs in METALS colours, gold star badge per lap),
//   bar (any metal, uranium glows), crown, gem, coin, music note, orb, boulder, chest.
//   makeItemModel(entry) -> small Object3D from the same geometry (companion backpack stack, vault, ...). setFlyers(list, n) is called by fx3d each frame.
// Glows (light beams, rotating rings, halos, sparkles) are drawn through V.fx.glowAt (fx3d), so they cost no extra draw calls here.
import * as THREE from 'three';
import * as kit from './kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const { W, Builder } = kit, PI = Math.PI, TAU = PI * 2;
const MET = ['#c87838', '#b5804a', '#c8ccd4', '#e8b93a', '#d6e2ea', '#6ee0d8', '#5a7fe0', '#a6e04a'], FOE = ['#ff6a5a', '#ffb640', '#a77bff', '#2ec4b6', '#8fdc4a', '#ff7eb6', '#5fb4ff', '#8a86a8'];
const metHex = (i) => (typeof METALS !== 'undefined' && METALS[i] ? METALS[i].col : MET[i]);
const foeHex = (k) => (typeof foeCol === 'function' ? foeCol(k) : FOE[((k || 1) - 1) % 8]);
const getS = () => (typeof S !== 'undefined' ? S : null);
const WH = new THREE.Color(1, 1, 1), VD = new THREE.Color(0x1a0a30), INKC = new THREE.Color(0x2d170f);
const cl = (h) => new THREE.Color(h), lite = (h, t) => cl(h).lerp(WH, t), dk = (h, t) => cl(h).lerp(VD, t);
const _cc = new Map();
/** cached [r,g,b] (linear) for a css colour */
function rgb(c) { let v = _cc.get(c); if (!v) { const k = new THREE.Color(); try { k.set(c); } catch (e) { k.set(0xffffff); } _cc.set(c, v = [k.r, k.g, k.b]); } return v; }

// ------------------------------------------------------------------------------------------------ material: vertex colours + per-vertex glow / untinted flag
// aFx.x = glow (adds vertex colour as emissive, blooms), aFx.y = 1 ignores the instance tint (white highlights), 2 = ink hull (unlit), aFx.z = 1 no hull for this part. aIG = per-instance glow (uranium bars). uIG = per-material glow.
const MS = kit.SOLID, MF = kit.FLAT, MG = kit.lit(0xffffff, { vc: true, rough: 0.311 }), MFG = kit.lit(0xffffff, { vc: true, rough: 0.312, flat: true }), MU = kit.lit(0xffffff, { vc: true, rough: 0.313 }), MUG = kit.lit(0xffffff, { vc: true, rough: 0.314 });
const MN = kit.lit(0xffffff, { vc: true, rough: 0.315 }), MNU = kit.lit(0xffffff, { vc: true, rough: 0.316 });
const BK = new Map([[MS, [0, 0, 0, 0]], [MF, [0, 0, 1, 0]], [MG, [1, 0, 0, 0]], [MFG, [1, 0, 1, 0]], [MU, [0, 1, 0, 0]], [MUG, [0.7, 1, 0, 0]], [MN, [0, 0, 0, 1]], [MNU, [0, 1, 0, 1]]]);
const Nh = (c) => ({ m: MN, c }), NhU = (c) => ({ m: MNU, c }), Gl = (c) => ({ m: MG, c }), FG = (c) => ({ m: MFG, c }), Fl = (c) => ({ m: MF, c }), Un = (c) => ({ m: MU, c }), UnG = (c) => ({ m: MUG, c });
function mkMat(color = 0xffffff, ig = 0) {
  const m = new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.32, metalness: 0.2 });
  const uIG = { value: ig };
  m.onBeforeCompile = function (sh, r) {
    const base = THREE.MeshStandardMaterial.prototype.onBeforeCompile; if (base && base !== THREE.Material.prototype.onBeforeCompile) base.call(this, sh, r); // keep the kit's cloud / rim patch
    sh.uniforms.uLB = kit.LOOK.beat; sh.uniforms.uIG = uIG;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aFx; attribute float aIG; uniform float uIG; varying float vGl, vHull;')
      .replace('#include <color_vertex>', `vColor = vec3(1.0);
        #ifdef USE_COLOR
          vColor *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor.xyz *= mix(instanceColor.xyz, vec3(1.0), min(aFx.y, 1.0));
        #endif
        vGl = aFx.x + aIG + uIG; vHull = step(1.5, aFx.y);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGl, vHull; uniform float uLB;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor * (0.1 + vGl * (0.8 + 0.4 * uLB));')
      .replace('#include <opaque_fragment>', 'if (vHull > 0.5) outgoingLight = vColor; // inked outline: flat, unlit, no rim light\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'loot1';
  return m;
}

// ------------------------------------------------------------------------------------------------ geometry baking
/** merge a Builder's buckets into ONE geometry (flat buckets get face normals), add glow / untint attributes, AO ramp and an inked hull (the 2D game's outline). */
function bake(b, o = {}) {
  const grp = b.build({ ao: 0 }), gs = [];
  for (const m of grp.children) {
    const bk = BK.get(m.material) || BK.get(MS), g = m.geometry; if (bk[2]) g.computeVertexNormals();
    const n = g.attributes.position.count, fx = new Float32Array(n * 3); for (let i = 0; i < n; i++) { fx[i * 3] = bk[0]; fx[i * 3 + 1] = bk[1]; fx[i * 3 + 2] = bk[3]; }
    g.setAttribute('aFx', new THREE.BufferAttribute(fx, 3)); gs.push(g);
  }
  let geo = gs.length > 1 ? mergeGeometries(gs, false) : gs[0]; gs.forEach((g) => { if (g !== geo) g.dispose(); });
  const ao = o.ao ?? 0.2, P = geo.attributes.position, Cc = geo.attributes.color, FX = geo.attributes.aFx;
  geo.computeBoundingBox(); const y0 = geo.boundingBox.min.y, hh = Math.max(0.001, geo.boundingBox.max.y - y0);
  if (ao > 0) for (let i = 0; i < P.count; i++) { if (FX.getX(i) > 0.2) continue; const k = 1 - ao * Math.pow(1 - (P.getY(i) - y0) / hh, 1.6); Cc.setXYZ(i, Cc.getX(i) * k, Cc.getY(i) * k, Cc.getZ(i) * k); }
  if (o.hull !== 0) geo = mergeGeometries([geo, hullOf(geo, o.hull ?? 0.022)], false);
  geo.userData.sharedGeo = true; return geo;
}
/** inverted, normal-extruded copy in ink (back-face hull baked in so the whole item is still one draw call). Triangles below minA (rivets, studs) get no hull. */
function hullOf(g, w, minA = 0.0013) {
  const P = g.attributes.position, N = g.attributes.normal, n = P.count, acc = new Map(), keys = new Array(n), keep = [];
  for (let i = 0; i < n; i++) { const k = Math.round(P.getX(i) * 400) + '_' + Math.round(P.getY(i) * 400) + '_' + Math.round(P.getZ(i) * 400); keys[i] = k; let a = acc.get(k); if (!a) acc.set(k, (a = [0, 0, 0])); a[0] += N.getX(i); a[1] += N.getY(i); a[2] += N.getZ(i); }
  for (let t = 0; t < n; t += 3) {
    const ux = P.getX(t + 1) - P.getX(t), uy = P.getY(t + 1) - P.getY(t), uz = P.getZ(t + 1) - P.getZ(t), vx = P.getX(t + 2) - P.getX(t), vy = P.getY(t + 2) - P.getY(t), vz = P.getZ(t + 2) - P.getZ(t);
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * 0.5 >= minA && !(g.attributes.aFx.getZ(t) > 0.5)) keep.push(t);
  }
  const m = keep.length * 3, pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), col = new Float32Array(m * 3), fx = new Float32Array(m * 3); for (let i = 0; i < m; i++) fx[i * 3 + 1] = 2;
  keep.forEach((t, q) => { for (let j = 0; j < 3; j++) {
    const s = t + (j === 0 ? 0 : j === 1 ? 2 : 1), a = acc.get(keys[s]), l = Math.hypot(a[0], a[1], a[2]) || 1, o = (q * 3 + j) * 3;
    pos[o] = P.getX(s) + a[0] / l * w; pos[o + 1] = P.getY(s) + a[1] / l * w; pos[o + 2] = P.getZ(s) + a[2] / l * w;
    nor[o] = -N.getX(s); nor[o + 1] = -N.getY(s); nor[o + 2] = -N.getZ(s); col[o] = INKC.r; col[o + 1] = INKC.g; col[o + 2] = INKC.b;
  } });
  const h = new THREE.BufferGeometry(); h.setAttribute('position', new THREE.BufferAttribute(pos, 3)); h.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); h.setAttribute('color', new THREE.BufferAttribute(col, 3)); h.setAttribute('aFx', new THREE.BufferAttribute(fx, 3)); return h;
}

// ------------------------------------------------------------------------------------------------ model library
const DKV = 0x33160d, CREAM = 0xfff4e6, GOLD = 0xffd84d, RED = 0xff5a6a;
const sg = (n = 9) => kit.seg(n);
/** dome profile for a lathe: short vertical wall then a quarter ellipse to the crown */
const domeProf = (R, H, wall, N = 4) => { const p = [[R * 0.97, 0], [R, wall]]; for (let i = 1; i <= N; i++) { const a = i / N * PI / 2; p.push([i === N ? 0 : R * Math.cos(a), wall + H * Math.sin(a)]); } return p; };
const surfZ = (R, H, y0, wall, y) => { const r = (y - y0 - wall) / H; return y < y0 + wall ? R : R * Math.sqrt(Math.max(0, 1 - r * r)); };
const band = (b, c, R, y, h, n) => b.lathe(c, [[R - 0.03, 0], [R, h * 0.3], [R, h * 0.75], [R - 0.04, h]], 0, y, 0, n);
function rivets(b, xs, R, y, z0 = 0) { for (const a of xs) b.ball(CREAM, Math.sin(a) * R, y, Math.cos(a) * R + z0, 0.027, 1, 1, 0); }
/** cheap beveled extrusion (kit.extr is smoother but 4x the triangles; items are small) */
const ex = (shape, depth, bev, key) => kit.G(key, () => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 4 }); g.translate(0, 0, -depth / 2); return g; });
const shapeGeo = (key, fn, depth, bev) => ex(fn(), depth, bev, key);
/** bevelled box, one segment per corner (48 tris) instead of Builder.rbox (up to 432) */
const rb = (b, c, x, y, z, w, h, d, r = 0.25, rx = 0, ry = 0, rz = 0) => b.part(kit.GB.rbox(r, 1), c, x, y, z, w, h, d, rx, ry, rz);
const crestShape = () => { const s = new THREE.Shape(); s.moveTo(-0.3, 0); s.bezierCurveTo(-0.24, 0.46, 0.22, 0.55, 0.4, 0.02); s.lineTo(0.3, 0); s.bezierCurveTo(0.2, 0.3, -0.12, 0.28, -0.2, 0); s.closePath(); return s; };
const plumeShape = () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.1, 0.34, 0.35, 0.5, 0.62, 0.38); s.bezierCurveTo(0.5, 0.2, 0.34, 0.12, 0.2, -0.02); s.closePath(); return s; };
const wingFeather = (b, c, sd, rootX, rootY, ang, L, wd) => { const dx = Math.cos(ang) * sd, dy = Math.sin(ang); b.part(kit.GB.oct(), c, rootX * sd + dx * L, rootY + dy * L, 0, L, wd, 0.03, 0, 0, Math.atan2(dy, Math.abs(dx)) * sd * 1); };
function horn(b, c, sd, x0, y0) { // curved tapered horn from 4 short cones
  const pts = []; for (let i = 0; i <= 4; i++) { const s = i / 4; pts.push([x0 + 0.3 * s, y0 + 0.56 * s * s + 0.1 * s]); }
  for (let i = 0; i < 4; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = (bx - ax) * sd, dy = by - ay, L = Math.hypot(dx, dy), r0 = 0.085 * (1 - i / 4.4), r1 = 0.085 * (1 - (i + 1) / 4.4);
    b.cylc(c, (ax + bx) / 2 * sd, (ay + by) / 2, 0, r0, L * 1.06, 7, 0, 0, Math.atan2(-dx, dy), r1 / r0); }
}
const HELM = [
  (b, M) => { // 0 copper: riveted pot helm with a knob
    const R = 0.4, n = sg(), Mh = lite(M, 0.18);
    b.lathe(M, domeProf(R, 0.4, 0.1), 0, 0.07, 0, n); band(b, Mh, R + 0.05, 0.04, 0.14, n);
    rb(b, DKV, 0, 0.3, surfZ(R, 0.4, 0.07, 0.1, 0.3) - 0.005, 0.46, 0.1, 0.12, 0.5); rivets(b, [-0.9, -0.45, 0, 0.45, 0.9], R + 0.05, 0.12); b.ball(Mh, 0, 0.6, 0, 0.055, 1, 1, 1);
  },
  (b, M) => { // 1 bronze: greek helm with eye slots, nose guard, cheek plates and a red horsehair crest
    const R = 0.4, n = sg(), Mh = lite(M, 0.2);
    b.lathe(M, domeProf(R, 0.4, 0.2), 0, 0.06, 0, n); band(b, Mh, R + 0.025, 0.4, 0.08, n);
    for (const sd of [-1, 1]) { rb(b, DKV, sd * 0.16, 0.25, 0.34, 0.17, 0.11, 0.1, 0.5); rb(b, M, sd * 0.33, 0.14, 0.14, 0.09, 0.3, 0.3, 0.4, 0, 0, sd * 0.1); }
    rb(b, Mh, 0, 0.2, 0.4, 0.1, 0.4, 0.08, 0.4); rivets(b, [-0.5, 0.5], R + 0.03, 0.43);
    b.shape(shapeGeo('crest', crestShape, 0.1, 0.018), RED, 0, 0.52, 0.0, 1, 0, PI / 2, 0);
  },
  (b, M) => { // 2 silver: tall great helm, ridge, dark visor slit and a blue plume
    const n = sg(), Mh = lite(M, 0.35), prof = [[0.33, 0], [0.37, 0.06], [0.38, 0.5], [0.33, 0.66], [0.2, 0.74], [0, 0.77]];
    b.lathe(M, prof, 0, 0.02, 0, n);
    rb(b, Mh, 0, 0.4, 0.34, 0.075, 0.74, 0.09, 0.4); rb(b, DKV, 0, 0.44, 0.355, 0.62, 0.075, 0.07, 0.5);
    for (const [x, y] of [[0.22, 0.2], [0.29, 0.2], [0.22, 0.28], [0.29, 0.28], [0.22, 0.12], [0.29, 0.12]]) b.ball(DKV, x * 0.6 + 0.04, y, 0.3, 0.022, 1, 1, 0);
    b.shape(shapeGeo('plume', plumeShape, 0.12, 0.02), 0x4f7fe8, 0, 0.68, -0.05, 0.85, 0, PI / 2 + 0.2, 0.15); b.shape(shapeGeo('plume', plumeShape, 0.12, 0.02), 0x7aa6ff, 0.0, 0.74, -0.1, 0.62, 0, PI / 2 + 0.2, 0.2);
  },
  (b, M) => { // 3 gold: winged helm with a ruby
    const R = 0.4, n = sg(), Mh = lite(M, 0.22);
    b.lathe(M, domeProf(R, 0.4, 0.1), 0, 0.07, 0, n); band(b, Mh, R + 0.05, 0.04, 0.14, n);
    rb(b, DKV, 0, 0.28, surfZ(R, 0.4, 0.07, 0.1, 0.28) - 0.005, 0.44, 0.09, 0.12, 0.5);
    b.part(kit.GB.oct(), Gl(0xd62a55), 0, 0.46, surfZ(R, 0.4, 0.07, 0.1, 0.46) + 0.01, 0.075, 0.12, 0.06);
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const ang = 0.12 + i * 0.4, L = 0.36 - i * 0.03; wingFeather(b, i % 2 ? 0xffffff : 0xffe4f0, sd, 0.3, 0.3, ang, L, 0.1); }
  },
  (b, M) => { // 4 platinum: viking helm with horns
    const R = 0.38, n = sg(), Mh = lite(M, 0.15);
    b.lathe(M, domeProf(R, 0.4, 0.1), 0, 0.07, 0, n); band(b, dk('#9aa7c8', 0.0), R + 0.05, 0.14, 0.12, n);
    rb(b, Mh, 0, 0.2, R + 0.0, 0.1, 0.36, 0.08, 0.4); rb(b, DKV, -0.14, 0.27, R - 0.02, 0.13, 0.07, 0.07, 0.4); rb(b, DKV, 0.14, 0.27, R - 0.02, 0.13, 0.07, 0.07, 0.4);
    rivets(b, [-1.0, -0.55, 0.55, 1.0], R + 0.05, 0.2); for (const sd of [-1, 1]) horn(b, 0xf6ebcf, sd, 0.34, 0.26);
  },
  (b, M) => { // 5 mythril: sleek crystal elven helm with a glowing visor
    const R = 0.37, n = sg();
    b.lathe(M, domeProf(R, 0.55, 0.12), 0, 0.05, 0, n); rb(b, 0x12304a, 0, 0.37, surfZ(R, 0.55, 0.05, 0.12, 0.37) - 0.005, 0.44, 0.12, 0.1, 0.5); rb(b, Gl(0x4fe8dc), 0, 0.375, surfZ(R, 0.55, 0.05, 0.12, 0.37) + 0.035, 0.38, 0.05, 0.04, 0.4);
    for (const sd of [-1, 1]) { b.conec(0x7adfd6, sd * 0.45, 0.34, -0.06, 0.075, 0.38, 5, 0, 0, -sd * 1.15); b.conec(0x7adfd6, sd * 0.4, 0.2, -0.1, 0.06, 0.28, 5, 0, 0, -sd * 1.3); }
    for (const [x, h, w, tl] of [[-0.17, 0.36, 0.08, 0.28], [0.17, 0.36, 0.08, -0.28], [0, 0.56, 0.11, 0]]) b.part(kit.GB.oct(), FG(0x2fd6c8), x, 0.64 + h * 0.4 - Math.abs(x) * 0.3, 0, w, h * 0.55, w, 0, 0, tl);
  },
  (b, M) => { // 6 cobalt: kabuto with a flared neck guard and a golden crest
    const R = 0.37, n = sg(), Md = dk(M, 0.3);
    b.lathe(Md, [[0.5, 0.0], [0.53, 0.04], [0.47, 0.14], [0.37, 0.24]], 0, 0.02, 0, n);
    b.lathe(M, domeProf(R, 0.45, 0.1), 0, 0.2, 0, n); rb(b, 0x12184a, 0, 0.36, surfZ(R, 0.45, 0.2, 0.1, 0.36) - 0.005, 0.42, 0.09, 0.12, 0.5);
    for (const sd of [-1, 1]) { b.cylc(GOLD, sd * 0.13, 0.78, 0.02, 0.06, 0.32, 6, 0, 0, -sd * 0.35, 0.5); b.cylc(GOLD, sd * 0.27, 0.97, 0.02, 0.05, 0.28, 6, 0, 0, -sd * 0.95, 0.4); }
    b.ball(RED, 0, 0.68, 0.0, 0.06, 1, 1, 1);
  },
  (b, M) => { // 7 uranium: toxic spiked helm with glowing eyes and slime drips
    const R = 0.4, n = sg(), Mu = dk(M, 0.45);
    b.lathe(Mu, domeProf(R, 0.38, 0.12), 0, 0.07, 0, n);
    for (let i = 0; i < 5; i++) { const a = -0.55 + i * 0.275, x = Math.sin(a) * 0.3; b.conec(FG(0x6e9f14), x, 0.62 + (i === 2 ? 0.1 : 0) - Math.abs(a) * 0.04, Math.cos(a) * 0.05, 0.075, 0.34 + (i === 2 ? 0.12 : 0), 6, 0, 0, -a * 0.9); }
    for (const sd of [-1, 1]) b.part(kit.GB.oct(), Gl(0xb6f02a), sd * 0.16, 0.27, surfZ(R, 0.38, 0.07, 0.12, 0.27) + 0.01, 0.12, 0.05, 0.05, 0, 0, sd * -0.35);
    for (const x of [-0.24, 0, 0.24]) b.ball(Gl(0xa8e630), x, 0.1, 0.38 - Math.abs(x) * 0.5, 0.045, 1.5, 1, 0);
  },
];
function buildBar() {
  const b = new Builder(), fr = kit.G('ingot', () => new THREE.CylinderGeometry(0.7071 * 0.64, 0.7071, 1, 4).rotateY(PI / 4)), g = new THREE.Color(0.9, 0.9, 0.9);
  b.part(fr, g, 0, 0.17, 0, 0.98, 0.34, 0.54); b.part(kit.GB.rbox(0.4, 1), NhU(0xffffff), -0.16, 0.345, 0.03, 0.3, 0.014, 0.06);
  return bake(b, { ao: 0.14, hull: 0.024 });
}
function buildCrown() {
  const b = new Builder(), n = sg(10), M = GOLD;
  b.lathe(M, [[0.4, 0], [0.45, 0.0], [0.47, 0.22], [0.42, 0.26], [0.38, 0.22]], 0, 0.0, 0, n); b.lathe(0xffe98a, [[0.455, 0.07], [0.475, 0.1], [0.475, 0.15], [0.46, 0.18]], 0, 0.0, 0, n);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, x = Math.sin(a) * 0.4, z = Math.cos(a) * 0.4, tall = i === 0 ? 0.52 : 0.4; b.cone(M, x, 0.2, z, 0.1, tall, 6); b.ball(CREAM, x, 0.2 + tall + 0.03, z, 0.055, 1, 1, 0); }
  b.part(kit.GB.oct(), Gl(0xff3d6a), 0, 0.12, 0.47, 0.08, 0.11, 0.05);
  for (const sd of [-1, 1]) { b.ball(Gl(0x6ee0d8), sd * 0.34, 0.12, 0.31, 0.05, 1, 1, 1); b.ball(Gl(0x6ee0d8), sd * 0.47, 0.12, 0.0, 0.045, 1, 1, 1); }
  return bake(b, { ao: 0.15 });
}
function buildGem() {
  const b = new Builder(), n = 8;
  b.lathe(Fl(0x1ab0ae), [[0, -0.5], [0.5, 0.05]], 0, 0, 0, n); b.lathe(Fl(0x33cfc8), [[0.5, 0.05], [0.5, 0.14]], 0, 0, 0, n);
  b.lathe(Fl(0x5de6dc), [[0.5, 0.14], [0.3, 0.38]], 0, 0, 0, n); b.lathe(FG(0xa8f8f0), [[0.3, 0.38], [0, 0.38]], 0, 0, 0, n);
  return bake(b, { ao: 0, hull: 0.024 });
}
function buildCoin() {
  const b = new Builder(), n = sg(10);
  b.cylc(0xc98a10, 0, 0, 0, 0.44, 0.12, n, PI / 2); b.cylc(0xffe98a, 0, 0, 0, 0.34, 0.135, n, PI / 2);
  for (const sd of [-1, 1]) b.shape(ex(kit.starShape(5, 0.2, 0.09), 0.03, 0.01, 'cstar'), 0xffc21a, 0, 0, sd * 0.066, 1, 0, sd < 0 ? PI : 0, 0);
  return bake(b, { ao: 0, hull: 0.022 });
}
function buildStar() { const b = new Builder(); b.shape(ex(kit.starShape(5, 0.15, 0.07), 0.05, 0.014, 'bstar'), GOLD, 0, 0, 0, 1, 0, 0, 0); return bake(b, { ao: 0, hull: 0.016 }); }
function buildNote() {
  const b = new Builder(), g = new THREE.Color(1, 1, 1);
  b.ball(g, -0.12, -0.2, 0, 0.17, 0.72, 0.5, 1, 0); // head (tilted by the hull-less rotation below)
  rb(b, g, 0.0, 0.1, 0, 0.065, 0.62, 0.1, 0.45);
  const fl = new THREE.Shape(); fl.moveTo(0, 0); fl.bezierCurveTo(0.18, 0.0, 0.3, -0.12, 0.26, -0.34); fl.lineTo(0.18, -0.24); fl.bezierCurveTo(0.16, -0.14, 0.08, -0.12, 0, -0.14); fl.closePath();
  b.shape(ex(fl, 0.07, 0.014, 'noteflag'), g, 0.03, 0.4, 0, 1, 0, 0, 0);
  b.ball(Un(0xffffff), -0.17, -0.14, 0.09, 0.05, 0.6, 0.5, 0);
  return bake(b, { ao: 0, hull: 0.03 });
}
function buildOrb() {
  const b = new Builder(), g = new THREE.Color(1, 1, 1);
  b.ball(g, 0, 0, 0, 1, 1, 1, 1); b.ball(UnG(0xffffff), -0.34, 0.38, 0.55, 0.28, 0.8, 0.5, 1);
  return bake(b, { ao: 0.12, hull: 0.1 });
}
function buildBoulder() {
  const b = new Builder(), g = new THREE.Color(1, 1, 1), cr = Un(0xfff4e6);
  b.ball(g, 0, 0, 0, 1, 1, 1, kit.icoDetail(1)); // beamed note emblem on the front (the "groove" icon)
  b.ball(cr, -0.28, -0.12, 0.93, 0.2, 0.7, 0.3, 1, 0); b.ball(cr, 0.3, -0.04, 0.9, 0.2, 0.7, 0.3, 1, 0);
  rb(b, cr, -0.14, 0.2, 0.95, 0.07, 0.5, 0.1, 0.4); rb(b, cr, 0.44, 0.28, 0.9, 0.07, 0.5, 0.1, 0.4); rb(b, cr, 0.15, 0.5, 0.92, 0.65, 0.09, 0.1, 0.4, 0, 0, -0.1);
  b.ball(UnG(0xffffff), -0.5, 0.5, 0.6, 0.16, 0.8, 0.5, 1);
  return bake(b, { ao: 0.18, hull: 0.07 });
}
function buildChest() {
  const wood = 0xa8683a, woodD = 0x7e4a28, gold = GOLD, bb = new Builder(), lb = new Builder(), n = sg(14);
  rb(bb, wood, 0, 0.25, 0, 1.1, 0.5, 0.7, 0.14); for (const x of [-0.3, 0, 0.3]) rb(bb, woodD, x, 0.25, 0.352, 0.012, 0.44, 0.01, 0.4);
  for (const sd of [-1, 1]) { rb(bb, gold, sd * 0.43, 0.25, 0, 0.13, 0.54, 0.74, 0.3); }
  rb(bb, gold, 0, 0.04, 0, 1.14, 0.09, 0.74, 0.3); rb(bb, 0xe8b030, 0, 0.36, 0.37, 0.2, 0.2, 0.06, 0.4); rb(bb, DKV, 0, 0.35, 0.405, 0.05, 0.09, 0.03, 0.4);
  rb(bb, Gl(0xffcf4a), 0, 0.52, 0, 0.96, 0.05, 0.58, 0.4); // glowing gold inside the open lid
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; bb.cylc(Gl(0xffd84d), Math.sin(a) * 0.22, 0.56 + (i % 2) * 0.03, Math.cos(a) * 0.14, 0.09, 0.025, 8, PI / 2 - 0.5, a, 0); }
  const hc = kit.G('halfcyl', () => new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, PI).rotateZ(PI / 2));
  lb.part(hc, wood, 0, 0, 0.0, 1.06, 0.36, 0.36);
  for (const sd of [-1, 1]) lb.part(hc, gold, sd * 0.43, 0, 0, 0.14, 0.375, 0.375); rb(lb, gold, 0, 0.0, 0.34, 1.1, 0.07, 0.06, 0.4);
  return [bake(bb, { ao: 0.15, hull: 0.024 }), bake(lb, { ao: 0.1, hull: 0.024 })];
}

// ------------------------------------------------------------------------------------------------ pools
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m2 = new THREE.Matrix4(), _c = new THREE.Color();
/** per-frame filled InstancedMesh: begin(), add(...) x n, end() */
class Pool {
  constructor(geo, mat, max, o = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.max = max; this.n = 0; this.m = new THREE.Matrix4();
    const mh = this.mesh; mh.frustumCulled = false; mh.count = 0; mh.visible = false; mh.castShadow = mh.receiveShadow = false;
    if (o.color) mh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    if (o.ig) { this.ig = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); geo.setAttribute('aIG', this.ig); }
  }
  begin() { this.n = 0; }
  /** compose the instance matrix (yaw, then pitch, then roll) and return it for chained attachments (star badges) */
  add(x, y, z, yaw, pitch, roll, sx, sy, sz, c, ig) {
    if (this.n >= this.max) return null; _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e); this.m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    const i = this.n++; this.mesh.setMatrixAt(i, this.m);
    if (c && this.mesh.instanceColor) { const a = this.mesh.instanceColor.array; a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
    if (this.ig) this.ig.array[i] = ig || 0; return this.m;
  }
  end() {
    const mh = this.mesh; mh.count = this.n; mh.visible = this.n > 0; if (!this.n) return;
    mh.instanceMatrix.needsUpdate = true; if (mh.instanceColor) mh.instanceColor.needsUpdate = true; if (this.ig) this.ig.needsUpdate = true;
  }
}

export function init(V) {
  const root = V.dyn || V.scene, matShared = mkMat(0xffffff), matIG = mkMat(0xffffff);
  const L = { helm: HELM.map((fn, i) => { const b = new Builder(); fn(b, cl(metHex(i)), i); return bake(b, { ao: 0.18, hull: 0.022 }); }), bar: buildBar(), crown: buildCrown(), gem: buildGem(), coin: buildCoin(), star: buildStar(), note: buildNote(), orb: buildOrb(), boulder: buildBoulder() };
  const [chestBody, chestLid] = buildChest();
  const pools = [], mk = (geo, max, o, mat = matShared) => { const p = new Pool(geo.clone ? (o && o.ig ? geo.clone() : geo) : geo, mat, max, o); p.mesh.name = 'loot_pool'; root.add(p.mesh); pools.push(p); return p; };
  const helmP = L.helm.map((g) => mk(g, 80)), barP = mk(L.bar, 96, { color: true, ig: true }), crownP = mk(L.crown, 40), gemP = mk(L.gem, 80), coinP = mk(L.coin, 120), starP = mk(L.star, 80);
  const noteP = mk(L.note, 48, { color: true }), orbP = mk(L.orb, 40, { color: true }), bouldP = mk(L.boulder, 12, { color: true });
  // the chest: two plain meshes (body + hinged lid)
  const chest = new THREE.Group(); chest.visible = false; chest.name = 'loot_chest';
  const cBody = new THREE.Mesh(chestBody, matShared), cLid = new THREE.Mesh(chestLid, matShared); cBody.userData.sharedGeo = cLid.userData.sharedGeo = true;
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.5, -0.3); cLid.position.set(0, 0, 0.3); lidPivot.add(cLid); chest.add(cBody, lidPivot); root.add(chest);
  for (const m of [cBody, cLid]) { m.castShadow = false; m.receiveShadow = false; }

  const fx = () => V.fx || null;
  let clock = 0, flyList = null, flyN = 0, sparkAcc = 0, chestIn = 0;
  const vis = (x, z, f) => { if (!f) return true; const dx = x - f.x, dz = z - f.z; return dx * dx + dz * dz < 2300; };
  const hh = (a) => { const s = Math.sin(a * 12.9898) * 43758.5453; return s - Math.floor(s); };

  // ---- entry classification (same rules as drawItemWorld) ----
  const rarOf = (it) => (it.gem || it.crown ? 3 : it.bar ? 2 : (it.k || 1) >= 7 ? 3 : (it.k || 1) >= 4 ? 2 : 1);
  const colOf = (it) => (it.gem ? '#6ee0d8' : it.crown ? '#ffd84d' : metHex(((it.k || 1) - 1) % 8));
  /** push one entry into the right pool at a pose; returns nothing. cyc star badges are chained onto helmets. */
  function put(e, x, y, z, yaw, pitch, roll, sc, sq) {
    const sy = sc * sq, sxz = sc / Math.sqrt(sq);
    if (e.gem) { gemP.add(x, y + 0.34 * sy, z, yaw, pitch, roll, 0.78 * sxz, 0.78 * sy, 0.78 * sxz); return; }
    if (e.crown) { crownP.add(x, y, z, yaw, pitch, roll, sxz, sy, sxz); return; }
    const k = e.k || 1, i = (k - 1) % 8;
    if (e.bar) { barP.add(x, y, z, yaw, pitch, roll, 0.95 * sxz, 0.95 * sy, 0.95 * sxz, rgb(metHex(i)), i === 7 ? 0.55 : 0); return; }
    const m = helmP[i].add(x, y, z, yaw, pitch, roll, sxz, sy, sxz); if (!m) return;
    const cyc = Math.min(3, Math.floor((k - 1) / 8));
    for (let n = 0; n < cyc && starP.n < starP.max; n++) { _m2.makeTranslation(0.34 - n * 0.2, 0.86, 0.16); _m2.premultiply(m); starP.mesh.setMatrixAt(starP.n++, _m2); }
  }

  // ---- projectile pose helpers (2D screen y includes height; recover ground z + height as the 2D draw implies) ----
  function updateItems(S, T, f, dt) {
    const FX = fx(), items = S.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; if (it.dead) continue;
      const rar = rarOf(it), air = it.t < 0.45;
      let gx, gz, y, yaw, pitch = -0.22, roll = 0, sq = 1, sc = 1;
      if (air) { // reconstruct the toss: start point -> landing point on the ground, with an arc for height
        const t = it.t, vy0 = it.vy - 380 * t, x0 = it.x - it.vx * t, y0 = it.y - vy0 * t - 190 * t * t, u = t / 0.45;
        gx = (x0 + it.vx * 0.45 * u) * W; gz = (y0 + (vy0 * 0.45 + 190 * 0.2025) * u) * W; y = 0.15 + Math.sin(u * PI) * 0.95; yaw = T * 7 + it.x; pitch = -0.2 + Math.sin(T * 9 + it.y) * 0.3; roll = Math.sin(T * 8 + it.x) * 0.4; sc = 0.8 + 0.2 * u;
      } else {
        gx = it.x * W; gz = it.y * W; const lt = it.t - 0.45, pl = Math.sin(T * 2.6 + it.x), hover = (rar > 1 ? 0.2 : 0.1) + (rar > 1 ? 0.07 : 0.025) * Math.abs(pl);
        y = hover; if (lt < 0.22) { const k2 = Math.sin(lt / 0.22 * PI); sq = 1 - 0.28 * k2; y = 0.02 * (1 - k2) + hover * (1 - k2); }
        yaw = (it.gem || it.crown || it.bar) ? T * 1.1 + it.x : Math.sin(T * 1.3 + it.x * 0.7) * 0.85;
      }
      if (!vis(gx, gz, f)) continue;
      put(it, gx, y, gz, yaw, it.gem ? 0 : pitch, roll, sc, sq);
      if (V.blobs) V.blobs.add(gx, gz, air ? 0.24 : 0.4, air ? 0.2 : 0.3);
      if (!FX || air) continue;
      const c = rgb(colOf(it)), pl = 0.7 + 0.3 * Math.sin(T * 4 + it.x);
      if (rar >= 2) {
        FX.glowAt(0, gx, 0.02, gz, 0, 0.3, rar === 3 ? 2.6 : 2.1, 0.3, 0, c[0], c[1], c[2], 0.34 * pl);
        FX.glowAt(1, gx, 0.07, gz, T * 1.4 + it.x, 0.52 + Math.sin(T * 5) * 0.04, 1, 0.52 + Math.sin(T * 5) * 0.04, 0.9, c[0], c[1], c[2], 0.75 * pl, 0.16);
      }
      if (it.gem || (!it.bar && !it.crown && ((it.k || 1) - 1) % 8 >= 5)) FX.glowAt(2, gx, y + 0.4, gz, 0, 0.8, 1, 1, 0, c[0], c[1], c[2], 0.28 + 0.08 * pl);
      const ph = ((T * 2 + it.x) % 3) / 0.35; if (ph < 1) { const sz = 0.3 * Math.sin(ph * PI); FX.glowAt(3, gx + 0.2, y + 0.65, gz, 0, sz, 1, 1, 0, 1, 1, 1, 0.95); }
    }
  }
  function updateFlyers(T) {
    for (let i = 0; i < flyN; i++) {
      const f = flyList[i], e = f.entry, s = f.s * 0.85;
      if (f.kind === 'coin') coinP.add(f.x, f.y, f.z, f.yaw, 0.2, 0, 0.5 * s, 0.5 * s, 0.5 * s);
      else if (f.kind === 'gem' || (e && e.gem)) gemP.add(f.x, f.y, f.z, f.yaw, 0.2, Math.sin(T * 8) * 0.2, 0.7 * s, 0.7 * s, 0.7 * s);
      else if (e) { put(e, f.x, f.y - 0.25 * s, f.z, f.yaw, -0.15, Math.sin(T * 11 + i) * 0.25, 0.8 * s, 1); }
      else coinP.add(f.x, f.y, f.z, f.yaw, 0.2, 0, 0.4 * s, 0.4 * s, 0.4 * s);
    }
  }
  function updateChest(S, T, f) {
    const c = S.chest; if (!c || !vis(c.x * W, c.y * W, f)) { chest.visible = false; return; }
    chest.visible = true; const bob = Math.sin(T * 3) * 0.05, pl = 0.5 + 0.5 * Math.sin(T * 4), pop = Math.min(1, (c.t || 0) / 0.35), sc = pop < 1 ? 0.4 + 0.6 * (1 + 2.7 * Math.pow(pop - 1, 3) + 1.7 * Math.pow(pop - 1, 2)) : 1;
    const gx = c.x * W, gz = c.y * W; chest.position.set(gx, 0.12 + bob, gz); chest.scale.setScalar(sc * 1.05); chest.rotation.y = Math.sin(T * 0.8) * 0.12;
    lidPivot.rotation.x = -(0.5 + 0.18 * Math.sin(T * 3) + 0.1 * pl); // bobbing lid, never fully shut
    if (V.blobs) V.blobs.add(gx, gz, 0.78, 0.3);
    const FX = fx(); if (!FX) return;
    FX.glowAt(0, gx, 0.5, gz, 0, 0.5, 3.0, 0.5, 0, 1, 0.88, 0.35, 0.22 + 0.08 * pl);
    for (let r = 0; r < 7; r++) { const a = T * 0.6 + r * (TAU / 7); FX.glowAt(0, gx, 0.55 + bob, gz, a, 0.12, 2.0 + 0.4 * Math.sin(T * 2 + r), 0.12, 1.25, 1, 0.9, 0.45, 0.13 + 0.06 * pl); }
    FX.glowAt(1, gx, 0.07, gz, T, 1.0 + 0.06 * pl, 1, 1.0 + 0.06 * pl, 0.8, 1, 0.82, 0.3, 0.7, 0.14); FX.glowAt(2, gx, 0.75 + bob, gz, 0, 1.2, 1, 1, 0, 1, 0.85, 0.4, 0.25 + 0.1 * pl);
    sparkAcc += 0.016 * 12; while (sparkAcc >= 1) { sparkAcc -= 1; const a = Math.random() * TAU, r = 0.2 + Math.random() * 0.5; FX.trail(gx + Math.cos(a) * r, 0.7 + Math.random() * 0.4, gz + Math.sin(a) * r * 0.6, 0xfff0a0, 0.16 + Math.random() * 0.1, 0.7, 2, 0.8); }
  }
  const NCOL = { hero: rgb('#ff7eb6'), crit: rgb('#ff9a2e'), ally: rgb('#3fcf6a'), tower: rgb('#a77bff') }; // note tints (linear)
  function updateShots(S, T, f, dt) {
    const FX = fx(), shots = S.shots;
    for (let i = 0; i < shots.length; i++) {
      const sh = shots[i];
      if (sh.boulder) { // arc from the tower top to the target; the 2D arc height becomes real height
        const u = Math.min(1, (sh.t || 0) / (sh.dur || 1)), gx = (sh.sx + (sh.tx - sh.sx) * u) * W, gz = (sh.sy + 50 + (sh.ty - sh.sy - 50) * u) * W, y = (50 * (1 - u) + Math.sin(u * PI) * 150) * W + 0.45;
        if (!vis(gx, gz, f)) continue; const c = rgb('#a77bff');
        bouldP.add(gx, y, gz, 0.3 * Math.sin(T * 2 + i), -T * 5, 0, 0.38, 0.38, 0.38, c); if (V.blobs) V.blobs.add(gx, (sh.ty + 0) * W + (gz - sh.ty * W) * 0.0, 0.5, 0.2);
        if (FX) { FX.glowAt(2, gx, y, gz, 0, 0.9, 1, 1, 0, 0.65, 0.48, 1, 0.45); FX.glowAt(1, sh.tx * W, 0.07, sh.ty * W, T * 2, 0.9 + 0.7 * (1 - u), 1, 0.9 + 0.7 * (1 - u), 0.5, 1, 0.45, 0.65, 0.35 + 0.35 * u, 0.12); if (Math.random() < dt * 30) FX.trail(gx, y, gz, c, 0.16, 0.45, 0, 1); }
        continue;
      }
      const tg = sh.tgt, hs = sh.tower ? 70 : sh.ally ? 24 : 42, r2 = tg && tg.r ? tg.r * 0.5 : 10; let h2 = hs * 0.6;
      if (tg) { const d = Math.hypot(tg.x - sh.x, tg.y - r2 - sh.y), w = Math.min(1, d / 260); h2 = r2 + (hs - r2) * w; }
      const gx = sh.x * W, gz = (sh.y + h2) * W, y = h2 * W + 0.1; if (!vis(gx, gz, f)) continue;
      const kind = sh.crit ? 'crit' : sh.ally ? 'ally' : sh.tower ? 'tower' : 'hero', sz = sh.crit ? 1.5 : 1, c = NCOL[kind];
      const wob = Math.sin(T * 18 + sh.x * 0.1) * 0.28;
      noteP.add(gx, y, gz, Math.sin(T * 9 + i) * 0.5, -0.5, wob, 0.85 * sz, 0.85 * sz, 0.85 * sz, c);
      if (V.blobs) V.blobs.add(gx, sh.y * W + (gz - sh.y * W) - (h2 - r2) * W * 0 , 0.16 * sz, 0.18);
      if (FX) { FX.glowAt(2, gx, y, gz, 0, 0.5 * sz, 1, 1, 0, c[0], c[1], c[2], sh.crit ? 0.4 : 0.2); if (Math.random() < dt * (sh.crit ? 40 : 22)) FX.trail(gx, y, gz, c, 0.12 * sz, 0.4, Math.random() < 0.3 ? 2 : 0, 1); }
    }
    const es = S.eshots;
    for (let i = 0; i < es.length; i++) {
      const e = es[i], gx = e.x * W, gz = (e.y + 14) * W, y = 0.42; if (!vis(gx, gz, f)) continue;
      const c = rgb(foeHex(e.k)), r = (e.big ? 0.36 : 0.21) * (1 + 0.06 * Math.sin(T * 22 + i));
      orbP.add(gx, y, gz, T * 3, 0, 0, r, r, r, c); if (V.blobs) V.blobs.add(gx, gz, r * 1.3, 0.22);
      if (FX) { FX.glowAt(2, gx, y, gz, 0, r * 3.1, 1, 1, 0, c[0], c[1], c[2], 0.5); if (Math.random() < dt * 24) FX.trail(gx, y, gz, c, r * 0.8, 0.35, 0, 1); }
    }
  }
  function update(dt, t, focus) {
    clock += dt; const S = getS(), T = clock, f = focus || null; for (const p of pools) p.begin();
    if (S) {
      try { if (S.items) updateItems(S, T, f, dt); } catch (e) { /* a bad entry must never stop the frame */ }
      try { updateShots(S, T, f, dt); } catch (e) { /* ditto */ }
      try { updateChest(S, T, f); } catch (e) { chest.visible = false; }
    } else chest.visible = false;
    try { if (flyList) updateFlyers(T); } catch (e) { /* ditto */ }
    for (const p of pools) p.end();
    starP.mesh.count = starP.n; starP.mesh.visible = starP.n > 0; if (starP.n) starP.mesh.instanceMatrix.needsUpdate = true;
  }
  /** fx3d hands over the S.fly list (positions already converted to world units); drawn with the same instanced models */
  function setFlyers(list, n) { flyList = list; flyN = n; }

  // ---- standalone models for other modules ----
  const matCache = new Map();
  const tinted = (hex, ig) => { const k = hex + '|' + ig; let m = matCache.get(k); if (!m) matCache.set(k, (m = mkMat(hex, ig))); return m; };
  /** small Object3D for an entry ({k, bar, crown, gem}); ~1 unit wide, origin at the base (gem and coin are centred). Shares geometry; do not dispose it. */
  function makeItemModel(e) {
    const g = new THREE.Group(); e = e || {}; const k = e.k || 1, i = (k - 1) % 8; let m;
    if (e.gem) { m = new THREE.Mesh(L.gem, matShared); m.position.y = 0.3; m.scale.setScalar(0.78); }
    else if (e.crown) m = new THREE.Mesh(L.crown, matShared);
    else if (e.bar) { m = new THREE.Mesh(L.bar, tinted(metHex(i), i === 7 ? 0.55 : 0)); m.scale.setScalar(0.95); }
    else {
      m = new THREE.Mesh(L.helm[i], matShared);
      const cyc = Math.min(3, Math.floor((k - 1) / 8)); for (let n = 0; n < cyc; n++) { const s = new THREE.Mesh(L.star, matShared); s.position.set(0.34 - n * 0.2, 0.86, 0.16); s.userData.sharedGeo = true; g.add(s); }
    }
    m.userData.sharedGeo = true; g.add(m); g.userData.item = true; return g;
  }
  function dispose() {
    for (const p of pools) { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); p.mesh.dispose && p.mesh.dispose(); }
    if (chest.parent) chest.parent.remove(chest);
    const geos = [...L.helm, L.bar, L.crown, L.gem, L.coin, L.star, L.note, L.orb, L.boulder, chestBody, chestLid]; for (const g of geos) g.dispose();
    matShared.dispose(); matIG.dispose(); for (const m of matCache.values()) m.dispose();
  }
  return { update, makeItemModel, setFlyers, dispose, models: L };
}
