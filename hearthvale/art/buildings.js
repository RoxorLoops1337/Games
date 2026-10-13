// Hearthvale buildings, ROUND 2 "Happy Light": sunny, pastel, round and adorable. ORIGINAL designs (mood reference: cozy life-sim games).
//
// DESIGN NOTES (research + genre study), applied below:
//  1. Walls are clean candy plaster (blush, mint, butter, sky, peach, lilac, cream) picked per building id: a village reads as a patchwork of sweets.
//  2. Trim is cream/white, timber is HONEY (never dark brown), foundations are light warm stone, roofs are saturated happy colours with soft rolled eaves.
//  3. Roundness: rounded wall boxes (bevel ~0.12), rolled eave tubes, round ridge with bobbles, arched windows and doors, round gable windows, round dormers.
//  4. Wavy shingles: 2-3 offset rows of scallop discs per roof slope in lighter tints (cheap, hand-painted look).
//  5. Shadows are lavender, never black or brown: fake AO <= 0.18 and tinted toward lilac (see bake()).
//  6. Charm clusters near the door: flower boxes, curtains, mat, stepping stones, pots, a lantern, a cat or a dog bowl, snail, butterfly. Levels add
//     bunting, ivy and roses, gold trim, banners and a happy weather vane so level reads at a glance.
//  7. Night: windows glow warm yellow (windowMat) behind pastel curtains; lanterns glow (lanternMat).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as K from './artkit.js';
import { P } from './palette.js';
import { benchModel, birdBathModel, scarecrowModel, picnicModel, swingModel, flowerCartModel, pumpkinPatchModel, hammockModel, beeSkepModel } from './props.js';

const { soft, gloss } = K;

// ---------------------------------------------------------------- shared materials (game drives emissiveIntensity)
export const windowMat = soft('#c4e8ff', { emissive: '#ffd05a', emissiveIntensity: 0, roughness: 0.4 });
export const lanternMat = soft('#fff0a8', { emissive: '#ffc43a', emissiveIntensity: 0 });
const fireMat = soft('#ffb347', { emissive: '#ff8a2a', emissiveIntensity: 1.2 });
const waterMat = gloss(P.water, { emissive: '#2a8fc0', emissiveIntensity: 0.18 });
for (const m of [windowMat, lanternMat, fireMat, waterMat]) m.userData.special = true;
const vcMat = soft('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
// soft fill: a little of the vertex colour, scaled by the scene's hemisphere light (so it follows day and night), is added as emissive.
// Faces turned away from the sun stay pastel instead of going grey-green.
// ROUND 3: the material also paints procedural SURFACE DETAIL for zero triangles. bake() stores a surface kind in uv.x and an axis in uv.y:
//  1 plaster (soft mottling + brush streaks), 2 roof shingles (scalloped rows, ridge along uv.y axis), 4 stone blocks with mortar, 5 wood grain,
//  6 planks with gaps, 7 straw / hay, 8 foliage dapple, 9 brick (small), 10 cloth weave stripes.
const HV_NOISE = `
varying vec3 vHvP; varying vec3 vHvN; varying vec2 vHvK;
float hvh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hvh(i), hvh(i + vec2(1.0, 0.0)), f.x), mix(hvh(i + vec2(0.0, 1.0)), hvh(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const HV_PATTERN = `
float hvF = 1.0; vec3 hvT = vec3(1.0); float hvA = 0.0;
{
  float kd = vHvK.x; vec3 a = abs(vHvN); vec3 P = vHvP;
  vec2 q = a.y > 0.7 ? P.xz : (a.z > a.x ? P.xy : P.zy);
  if (kd > 0.5 && kd < 1.5) {                                   // plaster
    float n1 = hvn(q * 6.0 + 3.1), n2 = hvn(q * vec2(24.0, 3.0)), n3 = hvn(q * 34.0);
    hvF = 1.0 + (n1 - 0.5) * 0.085 + (n2 - 0.5) * 0.05 + (n3 - 0.5) * 0.028;
    hvT = vec3(1.0 + (n1 - 0.5) * 0.04, 1.0, 1.0 - (n1 - 0.5) * 0.05);
  } else if (kd > 1.5 && kd < 2.5) {                            // roof shingles, ridge along x (axis 0) or z (axis 2)
    float u = vHvK.y < 1.0 ? P.x : P.z; float rh = 0.115, sw = 0.21;
    float rv = P.y / rh; float row = floor(rv); float fv = fract(rv);
    float uu = u / sw + mod(row, 2.0) * 0.5; float cell = floor(uu); float fu = fract(uu);
    float edge = 0.46 * sqrt(max(0.0, 1.0 - pow(2.0 * fu - 1.0, 2.0)));
    float h = hvh(vec2(cell, row)); float d = fv - edge;
    hvF = 1.0 + (h - 0.5) * 0.11 + (hvn(q * 9.0) - 0.5) * 0.04;
    hvF *= d < 0.0 ? 0.9 : 1.0 + 0.05 * smoothstep(0.0, 0.5, d);
    hvF *= 1.0 - 0.1 * smoothstep(0.06, 0.0, abs(d)) - 0.05 * smoothstep(0.16, 0.0, d) * step(0.0, d);
    hvT = vec3(1.0, 1.0 - 0.02 * h, 1.0 + 0.03 * h);
    float topw = smoothstep(0.1, 0.35, vHvN.y); hvF = mix(1.0, hvF, topw); hvT = mix(vec3(1.0), hvT, topw);
  } else if (kd > 3.5 && kd < 4.5) {                            // stone blocks
    float u = a.z > a.x ? P.x : P.z; if (a.y > 0.7) u = P.x; float rh = 0.12, bw = 0.34;
    float v = a.y > 0.7 ? P.z : P.y; float row = floor(v / rh); float fv = fract(v / rh);
    float uu = u / bw + mod(row, 2.0) * 0.5; float cell = floor(uu); float fu = fract(uu); float h = hvh(vec2(cell, row));
    float m = max(smoothstep(0.1, 0.0, fv), smoothstep(0.045, 0.0, fu));
    hvF = (1.0 + (h - 0.5) * 0.1 + (hvn(q * 30.0) - 0.5) * 0.04) * (1.0 - 0.12 * m);
    hvT = vec3(1.0 - 0.02 * m, 1.0 - 0.01 * m, 1.0 + 0.02 * m);
  } else if (kd > 4.5 && kd < 5.5) {                            // wood grain along the long axis
    float L = vHvK.y < 0.5 ? P.x : (vHvK.y < 1.5 ? P.y : P.z); vec2 c = vHvK.y < 0.5 ? P.yz : (vHvK.y < 1.5 ? P.xz : P.xy);
    float g1 = hvn(vec2(L * 2.5, (c.x + c.y * 1.7) * 38.0)), g2 = hvn(vec2(L * 9.0, (c.x * 1.3 - c.y) * 120.0));
    hvF = 1.0 + (g1 - 0.5) * 0.16 + (g2 - 0.5) * 0.07; hvT = vec3(1.0 + (g1 - 0.5) * 0.05, 1.0, 1.0 - (g1 - 0.5) * 0.08);
  } else if (kd > 5.5 && kd < 6.5) {                            // planks with gaps
    float L = vHvK.y < 0.5 ? P.x : (vHvK.y < 1.5 ? P.y : P.z); float c = vHvK.y < 0.5 ? (a.y > 0.7 ? P.z : P.y) : (vHvK.y < 1.5 ? (a.z > a.x ? P.x : P.z) : (a.y > 0.7 ? P.x : P.x));
    float pw = 0.17; float pc = floor(c / pw + 0.5); float fc = fract(c / pw + 0.5);
    float h = hvh(vec2(pc, 3.7)); float gap = smoothstep(0.07, 0.0, fc) + smoothstep(0.93, 1.0, fc);
    float g1 = hvn(vec2(L * 2.2 + h * 9.0, c * 42.0));
    hvF = (1.0 + (h - 0.5) * 0.1 + (g1 - 0.5) * 0.1) * (1.0 - 0.24 * min(1.0, gap));
    hvT = vec3(1.0 + (h - 0.5) * 0.03, 1.0, 1.0 - (h - 0.5) * 0.05);
  } else if (kd > 6.5 && kd < 7.5) {                            // straw
    float n1 = hvn(vec2(q.x * 60.0, q.y * 6.0)), n2 = hvn(q * 14.0);
    hvF = 1.0 + (n1 - 0.5) * 0.2 + (n2 - 0.5) * 0.1; hvT = vec3(1.0, 1.0 + (n1 - 0.5) * 0.04, 1.0 - (n1 - 0.5) * 0.1);
  } else if (kd > 7.5 && kd < 8.5) {                            // foliage dapple
    float n1 = hvn(P.xy * 7.0 + P.z * 5.3), n2 = hvn(P.zy * 15.0 + P.x * 4.0);
    hvF = 1.0 + (n1 - 0.5) * 0.15 + (n2 - 0.5) * 0.08; hvT = vec3(1.0 - (n1 - 0.5) * 0.05, 1.0 + (n1 - 0.5) * 0.03, 1.0);
  } else if (kd > 8.5 && kd < 9.5) {                            // small bricks
    float u = a.z > a.x ? P.x : P.z; float rh = 0.07, bw = 0.16; float row = floor(P.y / rh); float fv = fract(P.y / rh);
    float uu = u / bw + mod(row, 2.0) * 0.5; float cell = floor(uu); float fu = fract(uu); float h = hvh(vec2(cell, row));
    float m = max(smoothstep(0.14, 0.0, fv), smoothstep(0.07, 0.0, fu));
    hvF = (1.0 + (h - 0.5) * 0.14) * (1.0 - 0.16 * m); hvT = vec3(1.0 + (h - 0.5) * 0.04, 1.0 - (h - 0.5) * 0.02, 1.0 - 0.02 * m);
  } else if (kd > 9.5 && kd < 10.5) {                           // cloth weave
    float w = 0.5 + 0.5 * sin(q.x * 90.0) * sin(q.y * 90.0);
    hvF = 1.0 + (w - 0.5) * 0.07 + (hvn(q * 5.0) - 0.5) * 0.04;
  } else if (kd > 10.5 && kd < 11.5) {                          // gingham
    float s1 = step(0.5, fract(q.x / 0.13)), s2 = step(0.5, fract(q.y / 0.13));
    hvA = 0.8 * (1.0 - s1) * (1.0 - s2) + 0.38 * (s1 + s2 - 2.0 * s1 * s2);
  } else if (kd > 11.5 && kd < 12.5) {                          // fishing net: diamond mesh, holes are discarded
    vec2 w = vec2(q.x + q.y, q.x - q.y) / 0.075; vec2 fw = fract(w);
    float m = min(min(fw.x, 1.0 - fw.x), min(fw.y, 1.0 - fw.y)); if (m > 0.13) discard;
  }
}
diffuseColor.rgb = mix(diffuseColor.rgb * hvT * hvF, vec3(1.0), hvA);
`;
vcMat.onBeforeCompile = (sh_) => {
  sh_.vertexShader = sh_.vertexShader.replace('#include <common>', '#include <common>\n' + HV_NOISE).replace('#include <begin_vertex>', '#include <begin_vertex>\n vHvP = position; vHvN = normal; vHvK = uv;');
  sh_.fragmentShader = sh_.fragmentShader.replace('#include <common>', '#include <common>\n' + HV_NOISE)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + HV_PATTERN)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) && NUM_HEMI_LIGHTS > 0\n totalEmissiveRadiance += vColor * hvT * hvF * (1.0 - hvA) * vec3( 1.0, 0.94, 0.88 ) * hemisphereLights[ 0 ].skyColor.g * 0.27;\n#endif');
};
vcMat.customProgramCacheKey = () => 'hvfill3';

// ---------------------------------------------------------------- palette shorthands (all light, warm and happy)
const TIM = '#f2cd90', TIM2 = '#eab97a', WOODL = '#ffe0a8', WOOD = '#f3bd7c', PLANK = '#f8d49a';   // honey woods
const STONE = '#ece5d8', STONEL = '#fbf7ee', STONED = '#cfc6dc';                                      // light warm stone
const IRON = '#9c8fc4', DEEP = '#8a7498', GOLD = P.gold, GOLDD = '#f5b52a', CREAM = '#fffaf0';
const CHIM = '#ffa08c', CHIMD = '#f08a76';
const BLUSH = '#ffb0c8', MINT = '#9fe8c0', BUTTER = '#ffe46a', SKYW = '#a6d6ff', PEACH = '#ffbf94', LILAC = '#cfb8ff';
const PLASTER = new Set(), plaster = (c) => { PLASTER.add(new THREE.Color(c).getHexString()); return c; };
[BLUSH, MINT, BUTTER, SKYW, PEACH, LILAC, '#fff2d0', '#ffeaa0', '#ffbcd0', '#dcc8ff', '#c4e6ff', '#fff6d6', '#ffe9b8', '#fff3d8', '#fff0b0', '#f1d4ff'].forEach(plaster);
const HOUSE_SETS = [[BLUSH, '#6fb8f2'], [MINT, '#ff8aa8'], [BUTTER, '#a98be8'], [SKYW, '#ff7a6b'], [PEACH, '#4cc9b0'], [LILAC, '#ffc548'], ['#fff2d0', '#ef6f8a']];
const BUNT = ['#ff8fb5', '#ffd24a', '#7fd4ff', '#9be88a', '#c9a8ff', '#ffa970'];
const CURT = ['#ff9fc0', '#fff2a0', '#a6d8ff', '#c9b0ff', '#ffb890'];

const _c = new THREE.Color();
const shade = (hex, a) => { _c.set(hex); if (a >= 0) _c.lerp(new THREE.Color('#ffffff'), a); else _c.lerp(new THREE.Color('#8a74b8'), -a); return '#' + _c.getHexString(); };
const lv = (info) => Math.max(1, Math.min(3, (info && info.lvl) | 0 || 1));
const G = (...k) => { const g = new THREE.Group(); for (const c of k) if (c) g.add(c); return g; };
const add = (g, ...k) => { for (const c of k) if (c) g.add(c); return g; };
/** matte colour with a built-in glow so animated parts (added after the bake) stay as bright as the baked walls */
const lit = (c, k = 0.3) => soft(c, { emissive: c, emissiveIntensity: k });
const col = (c) => (typeof c === 'string' ? soft(c) : c);
const sh = (m) => { m.castShadow = m.receiveShadow = true; return m; };
const place = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

// ---------------------------------------------------------------- primitives (low tri count)
const BOXG = new THREE.BoxGeometry(1, 1, 1);
const BOXN = (() => { const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, keep = []; for (let i = 0; i < p.count; i += 3) if (n.getY(i) > -0.5) keep.push(i, i + 1, i + 2); const mk = (a, sz) => { const o = new Float32Array(keep.length * sz); keep.forEach((k, j) => { for (let c = 0; c < sz; c++) o[j * sz + c] = a.array[k * sz + c]; }); return new THREE.BufferAttribute(o, sz); }; const r = new THREE.BufferGeometry(); r.setAttribute('position', mk(p, 3)); r.setAttribute('normal', mk(n, 3)); r.setAttribute('uv', mk(u, 2)); return r; })();
const mkSph = (w, h) => new THREE.SphereGeometry(1, w, h);
const SPT = mkSph(6, 2), SPS = mkSph(7, 3), SPM = mkSph(10, 5), SPH = mkSph(14, 8), SPL = SPS;
// BUN: a smooth dome that dips a little below its equator (leaves, blossoms, bushes, loaves, sacks): round shading instead of facets
const BUN = new THREE.SphereGeometry(1, 7, 2, 0, Math.PI * 2, 0, Math.PI * 0.62), BUNL = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.62);
// FLOWER: a flat five-petal fan with a lifted heart (10 tris)
const FLOWER = (() => { const pts = [0, 0.4, 0], idx = [], N = 10; for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, r = i % 2 ? 0.55 : 1; pts.push(Math.cos(a) * r, 0, Math.sin(a) * r); } for (let i = 0; i < N; i++) idx.push(0, 1 + (i + 1) % N, 1 + i); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(idx); g.computeVertexNormals(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((N + 1) * 2), 2)); return g; })();
/** plain box, bottom at y */
function bx(w, h, d, c, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(BOXN, col(c)); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); return sh(m); }
/** rounded box (1 bevel segment), bottom at y */
function rb(w, h, d, c, x = 0, y = 0, z = 0, r, seg = 1) {
  if (Math.min(w, h, d) < 0.2) return bx(w, h, d, c, x, y, z);
  r = r ?? Math.min(0.08, w / 3.2, h / 3.2, d / 3.2); const f = (v) => +v.toFixed(3);
  const m = new THREE.Mesh(K.roundedBoxGeo(f(w), f(h), f(d), r, seg), col(c)); m.position.set(x, y + h / 2, z); return sh(m);
}
const cyl = (rt, rb_, h, c, x = 0, y = 0, z = 0, seg = 8) => (seg = Math.max(seg, Math.max(rt, rb_) > 0.4 ? 20 : Math.max(rt, rb_) > 0.2 ? 14 : seg), K.cyl)(rt, rb_, h, typeof c === 'string' ? c : null, x, y, z, typeof c === 'string' ? { seg } : { seg, mat: c });
const cone = (r, h, c, x = 0, y = 0, z = 0, seg = 4, rot) => K.cone(r, h, typeof c === 'string' ? c : null, x, y, z, typeof c === 'string' ? { seg, rot } : { seg, rot, mat: c });
function sp(r, c, x = 0, y = 0, z = 0, o = {}) { const q = o.q ?? (r < 0.05 ? 0 : r < 0.1 ? 1 : (o.lo || r < 0.22) ? 2 : 3), m = new THREE.Mesh([SPT, SPS, SPM, SPH][q], col(c)); m.scale.set(r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1)); m.position.set(x, y, z); return sh(m); }
const LEAFC = new Set([P.leaf, P.leafLight].map((c) => new THREE.Color(c).getHexString()));
/** soft blob: smooth dome (leaf, bush, loaf, pile); tiny blobs in a flower colour become flat petal fans with a gold heart */
function bl(r, c, x = 0, y = 0, z = 0, sy = 1, ry = 0) {
  const isLeaf = typeof c === 'string' && LEAFC.has(new THREE.Color(c).getHexString());
  if (r <= 0.07 && !isLeaf && typeof c === 'string') { const m = new THREE.Mesh(FLOWER, col(c)); m.scale.set(r * 1.4, r * 1.4, r * 1.4); m.rotation.set(Math.sin(ry * 2.3) * 0.3, ry * 1.7, Math.cos(ry * 1.9) * 0.3); m.position.set(x, y, z); return sh(m); }
  const m = new THREE.Mesh(r > 0.12 ? BUNL : BUN, col(c)); m.scale.set(r, r * sy, r); m.position.set(x, y, z); m.rotation.y = ry; if (isLeaf) m.userData.kind = 8; return sh(m);
}
const lcg = new Map();
/** cylinder lying along axis 'x' or 'z', centred */
function lcyl(axis, r, len, c, x, y, z, seg = 8, r2) {
  const k = `${r},${r2 ?? r},${len},${seg}`; let g = lcg.get(k); if (!g) { g = new THREE.CylinderGeometry(r2 ?? r, r, len, seg); lcg.set(k, g); }
  const m = new THREE.Mesh(g, col(c)); m.position.set(x, y, z); if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2; return sh(m);
}
const ringG = new Map();
function ring(r, h, c, x, y, z, seg = 8) { const k = `${r},${h},${seg}`; let g = ringG.get(k); if (!g) { g = new THREE.CylinderGeometry(r, r, h, seg, 1, true); ringG.set(k, g); } const m = new THREE.Mesh(g, col(c)); m.position.set(x, y + h / 2, z); return sh(m); }
const fdG = new Map();
/** flat disc (or half disc, half=true: the upper half) facing +z, rotated about y by ry; double sided via the shared material */
function fdisc(r, c, x, y, z, ry = 0, half = false, seg = 8) { const k = `${seg},${half}`; let g = fdG.get(k); if (!g) { g = new THREE.CircleGeometry(1, seg, 0, half ? Math.PI : Math.PI * 2); fdG.set(k, g); } const m = new THREE.Mesh(g, col(c)); m.scale.set(r, r, r); m.position.set(x, y, z); m.rotation.y = ry; return sh(m); }
const discG = new Map();
/** flat disc facing up, at y */
function disc(r, c, x, y, z, seg = 7) { const k = `${r},${seg}`; let g = discG.get(k); if (!g) { g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2); discG.set(k, g); } const m = new THREE.Mesh(g, col(c)); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = true; return m; }
const _up = new THREE.Vector3(0, 1, 0), TUBE = new THREE.CylinderGeometry(0.7071, 0.7071, 1, 4, 1, true).rotateY(Math.PI / 4);
function bar(ax, ay, az, bx_, by, bz, t, c) {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx_, by, bz), d = b.clone().sub(a), len = d.length();
  const m = new THREE.Mesh(t <= 0.04 ? TUBE : BOXG, col(c)); m.scale.set(t, len, t); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(_up, d.normalize()); return sh(m);
}
const prismCache = new Map();
function poly(pts, depth, c, x = 0, y = 0, z = 0, ry = 0) {
  const k = JSON.stringify(pts) + depth; let g = prismCache.get(k);
  if (!g) { const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))); g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); g.computeVertexNormals(); prismCache.set(k, g); }
  const m = new THREE.Mesh(g, col(c)); m.position.set(x, y, z); m.rotation.y = ry; return sh(m);
}
function starGeoCached() { return poly(Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? 0.45 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; }), 0.2, GOLD); }
function star(r, c, x, y, z, ry = 0) { const m = starGeoCached(); m.material = col(c); m.scale.set(r, r, r); m.position.set(x, y, z); m.rotation.y = ry; return m; }
function fuse(meshes, mat) {
  const gs = meshes.map((m) => { m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
  return sh(new THREE.Mesh(mergeGeometries(gs, false), col(mat)));
}

// ---------------------------------------------------------------- flat shapes (2 to 14 tris): the cheap way to get crisp trim
const archG = new Map(), QG = new THREE.PlaneGeometry(1, 1);
/** flat arched plate facing +z, bottom at y, centred on x. top = semicircle of radius w/2 */
function arch(w, h, c, x, y, z, ry = 0, seg = 12) {
  const k = `${w.toFixed(3)},${h.toFixed(3)},${seg}`; let g = archG.get(k);
  if (!g) { const r = w / 2, s_ = new THREE.Shape(); s_.moveTo(-r, 0); s_.lineTo(r, 0); s_.lineTo(r, Math.max(0, h - r)); s_.absarc(0, Math.max(0, h - r), r, 0, Math.PI, false); s_.closePath(); g = new THREE.ShapeGeometry(s_, seg / 2); archG.set(k, g); }
  const m = new THREE.Mesh(g, col(c)); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = false; m.receiveShadow = true; return m;
}
/** flat quad facing +z (centre x,y,z), rotated about y by ry, about z by rz */
function qd(w, h, c, x, y, z, ry = 0, rz = 0) { const m = new THREE.Mesh(QG, col(c)); m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.set(0, ry, rz); m.castShadow = false; m.receiveShadow = true; return m; }

// ---------------------------------------------------------------- shared set pieces
let _shadowMat = null, _shadowGeo = null;
function contact(w, d, o = 1) {
  if (typeof document === 'undefined') return null;
  if (!_shadowMat) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 8, 32, 32, 32);
    gr.addColorStop(0, 'rgba(90,100,150,0.26)'); gr.addColorStop(0.55, 'rgba(90,110,130,0.14)'); gr.addColorStop(1, 'rgba(90,110,130,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    _shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }); _shadowMat.userData.special = true; _shadowGeo = new THREE.PlaneGeometry(1, 1);
  }
  const m = new THREE.Mesh(_shadowGeo, _shadowMat); m.scale.set(w, d, 1); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1; m.material.opacity = o; return m;
}
/** arched window, origin = centre of the opening, faces +z. o: curt (curtain colour), box (flower box), flowers [], shut (pastel shutters), frame, round */
function window3(w = 0.26, h = 0.3, o = {}) {
  const g = new THREE.Group(), r = w / 2, fr = o.frame || CREAM, rect = h - r;
  if (o.round) {
    add(g, fdisc(r + 0.05, fr, 0, 0, 0.026, 0, false, 14), fdisc(r, windowMat, 0, 0, 0.03, 0, false, 14), qd(0.022, w, fr, 0, 0, 0.04), qd(w, 0.022, fr, 0, 0, 0.04));
    if (o.curt) add(g, qd(w * 0.22, w * 0.7, o.curt, -r * 0.66, -r * 0.35, 0.05), qd(w * 0.22, w * 0.7, o.curt, r * 0.66, -r * 0.35, 0.05));
    return g;
  }
  add(g, arch(w + 0.1, h + 0.05, fr, 0, -h / 2 - 0.05, 0.016), arch(w, h, windowMat, 0, -h / 2, 0.034), qd(0.024, h, fr, 0, -h / 2, 0.046), qd(w, 0.024, fr, 0, h / 2 - r - 0.02, 0.046), qd(w, 0.02, fr, 0, -h * 0.1, 0.046), bx(w + 0.16, 0.055, 0.11, fr, 0, -h / 2 - 0.1, 0.04));
  if (o.curt) for (const s of [-1, 1]) add(g, qd(w * 0.3, rect * 0.95, o.curt, s * (w / 2 - w * 0.15), -h / 2 + rect * 0.5, 0.058), qd(w * 0.34, 0.03, shade(o.curt, -0.1), s * (w / 2 - w * 0.17), -h / 2 + rect * 0.3, 0.06));
  if (o.shut) for (const s of [-1, 1]) add(g, rb(0.1, h + 0.04, 0.04, o.shut, s * (w / 2 + 0.12), -h / 2 - 0.04, 0.03), qd(0.06, 0.012, shade(o.shut, -0.12), s * (w / 2 + 0.12), -h * 0.35, 0.056), qd(0.06, 0.012, shade(o.shut, -0.12), s * (w / 2 + 0.12), -h * 0.62, 0.056));
  if (o.box) {
    const cs = o.flowers || [P.blossomDeep, P.butter, P.white, '#c9a8ff'], bc = o.boxC || '#fff3d6';
    add(g, bx(w + 0.14, 0.1, 0.12, bc, 0, -h / 2 - 0.22, 0.08), bl(0.09, P.leafLight, 0, -h / 2 - 0.1, 0.09, 0.7, 0.3));
    for (let i = 0; i < 3; i++) add(g, bl(0.05, cs[i % cs.length], (i - 1) * w * 0.34, -h / 2 - 0.08, 0.11, 1, i));
  }
  return g;
}
/** arched door, origin = bottom centre, faces +z. o: gold, mat (welcome mat colour), stones */
function door3(w = 0.32, h = 0.52, c = TIM2, o = {}) {
  const g = new THREE.Group(), r = w / 2, kc = o.gold ? GOLD : GOLDD, pl = shade(c, 0.28);
  add(g, arch(w + 0.14, h + 0.07, CREAM, 0, 0, 0.012), arch(w, h, c, 0, 0, 0.034),
    qd(0.02, h - r, pl, -w * 0.22, (h - r) / 2, 0.046), qd(0.02, h - r, pl, w * 0.22, (h - r) / 2, 0.046), qd(0.02, h * 0.5, pl, 0, h * 0.25, 0.046),
    qd(w * 0.4, 0.028, o.gold ? GOLDD : IRON, -w * 0.28, h * 0.22, 0.05), qd(w * 0.4, 0.028, o.gold ? GOLDD : IRON, -w * 0.28, h * 0.62, 0.05),
    fdisc(r * 0.42 + 0.025, CREAM, 0, h - r - 0.03, 0.048, 0, false, 10), fdisc(r * 0.42, windowMat, 0, h - r - 0.03, 0.054, 0, false, 10),
    sp(0.026, kc, w * 0.3, h * 0.4, 0.06), sp(0.016, kc, 0, h * 0.5, 0.06), bx(w + 0.34, 0.07, 0.24, STONEL, 0, -0.03, 0.1));
  if (o.mat) add(g, bx(w * 0.9, 0.025, 0.2, o.mat, 0, 0.0, 0.34), qd(w * 0.7, 0.03, CREAM, 0, 0.026, 0.34, 0, 0));
  return g;
}
function chimney(g, x, z, y0, y1, w = 0.24, c = CHIM, cap = CREAM) {
  add(g, rb(w, y1 - y0, w, c, x, y0, z, 0.05), rb(w + 0.1, 0.1, w + 0.1, cap, x, y1, z, 0.04), bx(w * 0.5, 0.01, w * 0.5, DEEP, x, y1 + 0.095, z), bx(w + 0.02, 0.04, w + 0.02, shade(c, 0.35), x, y0 + (y1 - y0) * 0.5, z));
  const a = new THREE.Object3D(); a.name = 'chimney'; a.position.set(x, y1 + 0.18, z); g.add(a);
}
function lantern(g, x, y, z, s = 1, gold = false) {
  add(g, rb(0.14 * s, 0.04 * s, 0.14 * s, gold ? GOLDD : IRON, x, y, z, 0.015), K.cyl(0.055 * s, 0.055 * s, 0.14 * s, null, x, y + 0.04 * s, z, { seg: 6, mat: lanternMat }), cone(0.1 * s, 0.1 * s, gold ? GOLD : '#ff9fbd', x, y + 0.18 * s, z, 6, 0), sp(0.025 * s, gold ? GOLDD : CREAM, x, y + 0.3 * s, z));
}
/** lantern on a little wall bracket */
function hang(g, x, y, z, gold = false, s = 1, dir = 1) { add(g, bar(x, y + 0.3 * s, z - 0.1 * dir, x, y + 0.3 * s, z, 0.025, gold ? GOLDD : TIM2), bar(x, y + 0.3 * s, z, x, y + 0.24 * s, z, 0.012, CREAM)); lantern(g, x, y, z, s, gold); }
function barrel(g, x, z, c = WOOD, s = 1, y = 0) {
  add(g, K.lathe([[0.001, 0], [0.095, 0.0], [0.125, 0.15], [0.095, 0.3], [0.001, 0.3]].map(([r, h]) => [r * s, h * s]), c, x, y, z, { seg: 8 }),
    ring(0.12 * s, 0.025 * s, CREAM, x, y + 0.06 * s, z, 8), ring(0.12 * s, 0.025 * s, CREAM, x, y + 0.22 * s, z, 8));
}
function crate(g, x, z, y = 0, s = 0.26, c = PLANK, ry = 0) {
  const grp = new THREE.Group(); add(grp, rb(s, s * 0.8, s, c, 0, 0, 0, 0.03), bx(s * 1.04, 0.03, 0.02, WOODL, 0, s * 0.1, s / 2), bx(s * 1.04, 0.03, 0.02, WOODL, 0, s * 0.6, s / 2)); place(grp, x, y, z, ry); g.add(grp); return grp;
}
function sack(g, x, z, c = P.cream, s = 1, y = 0, ry = 0) {
  add(g, sp(0.125 * s, c, x, y + 0.1 * s, z, { sy: 0.82 }), cone(0.05 * s, 0.1 * s, c, x, y + 0.19 * s, z, 5, ry));
}
function pot(g, x, y, z, s = 1, flower = P.blossomDeep) {
  add(g, K.lathe([[0.001, 0], [0.055 * s, 0], [0.08 * s, 0.12 * s], [0.065 * s, 0.12 * s]], '#ffb48a', x, y, z, { seg: 6 }), bl(0.08 * s, P.leafLight, x, y + 0.14 * s, z, 0.8));
  add(g, bl(0.036 * s, flower, x + 0.025 * s, y + 0.2 * s, z + 0.03 * s), bl(0.03 * s, P.butter, x - 0.035 * s, y + 0.19 * s, z - 0.01 * s));
}
/** blossom bed on the ground: a few leaves and big flower heads */
function bed(g, x, z, n = 4, w = 0.5, seed = 0) {
  const cs = [P.blossomDeep, P.butter, P.white, '#c9a8ff', '#ffa970'];
  for (let i = 0; i < n; i++) { const px = x + (i / Math.max(1, n - 1) - 0.5) * w; add(g, bl(0.075, P.leafLight, px, 0.19, z, 0.7, i), bl(0.06, cs[(i + seed) % cs.length], px + 0.01, 0.27 + (i % 2) * 0.03, z + 0.02, 1, i)); }
}
function cat(g, x, y, z, c = '#ffc890', ry = 0) {
  const k = new THREE.Group();
  add(k, sp(0.1, c, 0, 0.09, 0, { sy: 0.85, sz: 1.15, q: 1 }), sp(0.075, c, 0, 0.2, 0.09, { q: 1 }), cone(0.03, 0.06, c, -0.045, 0.24, 0.09, 3, 0), cone(0.03, 0.06, c, 0.045, 0.24, 0.09, 3, 0),
    sp(0.012, DEEP, -0.03, 0.21, 0.16), sp(0.012, DEEP, 0.03, 0.21, 0.16), sp(0.016, '#ff9fbd', 0, 0.185, 0.165), bar(0, 0.1, -0.1, 0.0, 0.24, -0.15, 0.035, c));
  return add(g, place(k, x, y, z, ry));
}
function bowl(g, x, z, c = P.blossomDeep) { add(g, K.lathe([[0.001, 0], [0.06, 0], [0.09, 0.07], [0.075, 0.07], [0.001, 0.02]], c, x, 0.16, z, { seg: 8 }), sp(0.03, '#ffe9b8', x, 0.2, z, { sy: 0.5 })); }
function snail(g, x, y, z, ry = 0, c = '#ffc66b') {
  const k = new THREE.Group(); add(k, sp(0.06, c, 0, 0.06, -0.01, { sx: 0.9 }), sp(0.03, '#ffe0c0', 0, 0.025, 0.05, { sz: 2.2, sy: 0.6 }), bar(0.015, 0.05, 0.1, 0.015, 0.09, 0.115, 0.01, '#ffe0c0'), bar(-0.015, 0.05, 0.1, -0.015, 0.09, 0.115, 0.01, '#ffe0c0'));
  return add(g, place(k, x, y, z, ry));
}
function butterfly(g, x, y, z, c = '#ffa6c9', ry = 0) {
  const k = new THREE.Group(), w1 = sp(0.045, c, 0.04, 0, 0, { sy: 0.15, sz: 1.2 }), w2 = sp(0.045, c, -0.04, 0, 0, { sy: 0.15, sz: 1.2 }); w1.rotation.z = 0.5; w2.rotation.z = -0.5;
  add(k, w1, w2, sp(0.012, DEEP, 0, 0, 0, { sz: 3 })); return add(g, place(k, x, y, z, ry));
}
function ivy(g, x, z, h = 0.7, c0 = 0, r = 0.09) {
  for (let i = 0; i < 4; i++) add(g, bl(r, i % 2 ? P.leafLight : P.leaf, x + (i % 2 ? 0.03 : -0.03), 0.22 + i * (h / 4), z, 0.9, i));
  add(g, bl(0.045, '#ff8fb5', x + 0.05, 0.38 + c0 * 0.05, z + 0.05), bl(0.045, '#ffd0e0', x - 0.05, 0.6 + c0 * 0.05, z + 0.05), bl(0.04, '#ff8fb5', x + 0.04, 0.2 + h * 0.8, z + 0.05));
}
function stones(g, x, z, n = 3, dz = 0.2) { for (let i = 0; i < n; i++) add(g, cyl(0.07 - i * 0.004, 0.075 - i * 0.004, 0.025, STONEL, x + (i % 2 ? 0.05 : -0.04), 0.0, z + i * dz, 8)); }
function picket(g, x0, x1, z, c = CREAM) {
  const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 0.14));
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; add(g, rb(0.06, 0.24, 0.025, c, x, 0.12, z, 0.02), cone(0.036, 0.05, c, x, 0.36, z, 4, 0)); }
  add(g, bx(Math.abs(x1 - x0), 0.035, 0.03, c, (x0 + x1) / 2, 0.2, z - 0.02));
}
/** hanging board sign on a bracket at wall z; icon sphere colour */
function signBoard(g, x, y, z, c = '#ffe9a8', icon = P.blossomDeep) {
  add(g, bar(x - 0.18, y + 0.2, z - 0.04, x - 0.18, y + 0.2, z + 0.28, 0.03, TIM2), bar(x - 0.18, y + 0.2, z + 0.27, x + 0.1, y + 0.2, z + 0.27, 0.03, TIM2), bar(x - 0.04, y + 0.2, z + 0.27, x - 0.04, y + 0.14, z + 0.27, 0.012, CREAM), bar(x + 0.08, y + 0.2, z + 0.27, x + 0.08, y + 0.14, z + 0.27, 0.012, CREAM),
    rb(0.26, 0.15, 0.04, c, x + 0.02, y, z + 0.27, 0.02), sp(0.04, icon, x + 0.02, y + 0.075, z + 0.3));
}
/** happy weather vane: pole, cross, gold chick */
function vane(g, x, y, z, s = 1) {
  add(g, bar(x, y, z, x, y + 0.36 * s, z, 0.025, GOLDD), sp(0.035, GOLD, x, y + 0.02, z), bar(x - 0.1 * s, y + 0.2 * s, z, x + 0.1 * s, y + 0.2 * s, z, 0.015, GOLDD),
    sp(0.07 * s, GOLD, x, y + 0.42 * s, z, { sx: 0.8, sy: 0.9 }), sp(0.045 * s, GOLD, x + 0.0, y + 0.52 * s, z + 0.03 * s), sp(0.022 * s, '#ff9a4a', x, y + 0.51 * s, z + 0.085 * s, { sz: 1.4 }), cone(0.025 * s, 0.05 * s, '#ff7a6b', x, y + 0.58 * s, z + 0.03 * s, 4, 0));
}
function bunting(g, a, b, n = 7, sag = 0.12, size = 0.07, seed = 0) {
  const [ax, ay, az] = a, [bx_, by, bz] = b, yaw = Math.atan2(bx_ - ax, bz - az); let px = ax, py = ay, pz = az;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(1, (i + 0.5) / n), t2 = i === n ? 1 : (i + 1) / n;
    const x = ax + (bx_ - ax) * t2, z = az + (bz - az) * t2, y = ay + (by - ay) * t2 - sag * 4 * t2 * (1 - t2);
    if (i % 2 === 1 || i === n) { add(g, bar(px, py, pz, x, y, z, 0.014, CREAM)); px = x; py = y; pz = z; }
    if (i < n) {
      const fx = ax + (bx_ - ax) * t, fz = az + (bz - az) * t, fy = ay + (by - ay) * t - sag * 4 * t * (1 - t);
      const f = new THREE.Group(); const m = cone(size, size * 1.7, BUNT[(i + seed) % BUNT.length], 0, -size * 1.7, 0, 3); m.rotation.set(Math.PI, 0, 0); m.scale.set(1, 1, 0.28); f.add(m); f.position.set(fx, fy, fz); f.rotation.y = yaw + Math.PI / 2; g.add(f);
    }
  }
}

/**
 * Gable roof of thick rounded slabs, rolled eaves and wavy scalloped shingle rows. ridge along z (along='z') or x. span = eave to eave incl overhang, len = ridge length incl overhang.
 * fill: { col, wd: wall depth across, base: wall top y relative to roof y, ovg: gable overhang } fills the gable triangles with a round window.
 * returns surface(u) = world height at lateral offset u from the ridge.
 */
function roof(g, o) {
  const { x = 0, y = 0, z = 0, span, len, rise, t = 0.14, col: rc, along = 'z', fill = null, ridgeCol, scal = true, rows = 2 } = o;
  const R = new THREE.Group(); R.position.set(x, y, z); if (along === 'z') R.rotation.y = Math.PI / 2;
  const hd = span / 2, a = Math.atan2(rise, hd), Ls = Math.hypot(hd, rise) + 0.06, lt = shade(rc, 0.1), lt2 = shade(rc, 0.17), roll = shade(rc, 0.1);
  for (const s of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(0, rise / 2, s * hd / 2); pv.rotation.x = s * a;
    const slab = rb(len, t, Ls, rc, 0, -t, 0, 0.06); slab.userData.kind = 2; slab.userData.axis = along === 'x' ? 0 : 2;
    pv.add(slab, lcyl('x', t * 0.62, len, roll, 0, -t * 0.45, s * (Ls / 2), 8));
    if (o.gutter !== false && scal) pv.add(lcyl('x', 0.026, len - 0.06, CREAM, 0, -t * 0.96, s * (Ls / 2 + 0.02), 6));
    R.add(pv);
  }
  if (scal && o.rake !== false) for (const e of [-1, 1]) for (const s of [-1, 1]) R.add(bar(e * (len / 2 - 0.005), 0.03, s * (hd + 0.02), e * (len / 2 - 0.005), rise + 0.02, 0, 0.045, CREAM));
  const rcol = ridgeCol || shade(rc, 0.22);
  R.add(lcyl('x', 0.072, len + 0.02, rcol, 0, rise + 0.01, 0, 6), sp(0.085, rcol, len / 2 + 0.01, rise + 0.01, 0, { q: 1 }), sp(0.085, rcol, -len / 2 - 0.01, rise + 0.01, 0, { q: 1 }));
  if (fill) {
    const { wd, base, ovg = 0.14 } = fill, dx = len - 2 * ovg, yb = rise * (1 - wd / (2 * hd)) - t * 0.6;
    R.add(poly([[-wd / 2, base], [wd / 2, base], [wd / 2, yb], [0, rise - 0.1], [-wd / 2, yb]], dx, fill.col, 0, 0, 0, Math.PI / 2));
    for (const e of [-1, 1]) {
      const fx = e * (dx / 2), wy = base + (rise - base) * 0.55;
      if (fill.win !== false) R.add(fdisc(0.11, windowMat, fx + e * 0.03, wy, 0, e * Math.PI / 2, false, 10), fdisc(0.15, CREAM, fx + e * 0.012, wy, 0, e * Math.PI / 2, false, 10));
    }
  }
  g.add(R);
  return (u) => y + rise * (1 - Math.min(1, Math.abs(u) / hd));
}
function lean(g, x, y, z, w, len, rise, c, dir = 1) {
  const a = Math.atan2(rise, w), L = Math.hypot(w, rise) + 0.1, pv = new THREE.Group(); pv.position.set(x + dir * w / 2, y + rise / 2, z); pv.rotation.z = -dir * a;
  pv.add(rb(L, 0.14, len, c, 0, -0.14, 0, 0.06), lcyl('z', 0.08, len, shade(c, 0.1), dir * L / 2, -0.06, 0, 8));
  const n = Math.round(len / 0.24); for (let i = 0; i < n; i++) pv.add(disc(len / (2 * n) * 0.97, shade(c, 0.18), dir * (L / 2 - 0.1), 0.012, -len / 2 + len / (2 * n) * (2 * i + 1), 7));
  g.add(pv);
}

// ---------------------------------------------------------------- finishing: vertex colours, soft lavender AO, merge
const LAV = new THREE.Color('#bfaef0');
// surface kind by colour (explicit mesh.userData.kind wins): honey wood gets grain, light stone gets blocks, chimney pink gets bricks
const KIND_BY_COLOR = new Map();
const kindOf = (o) => {
  if (o.userData.kind !== undefined) return o.userData.kind;
  if (!KIND_BY_COLOR.size) for (const [c, k] of [[TIM, 5], [TIM2, 5], [WOODL, 5], [WOOD, 5], [PLANK, 5], [STONE, 4], [STONEL, 4], [CHIM, 9], [CHIMD, 9]]) KIND_BY_COLOR.set(new THREE.Color(c).getHexString(), k);
  const hx = o.material.color.getHexString();
  return KIND_BY_COLOR.get(hx) || (PLASTER.has(hx) ? 1 : 0);
};
const _bb = new THREE.Box3();
function bake(root) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh || o.material.userData.special || o.material.isMeshBasicMaterial) return;
    const g = o.geometry.clone(), pos = g.attributes.position, nor = g.attributes.normal, c = o.material.color, mw = o.matrixWorld, buf = new Float32Array(pos.count * 3), uv = new Float32Array(pos.count * 2);
    nm.getNormalMatrix(mw);
    const kind = kindOf(o); let axis = o.userData.axis ?? 0;
    if (kind === 5 || kind === 6) { if (o.userData.axis === undefined) { g.computeBoundingBox(); const sz = g.boundingBox.getSize(v).multiply(new THREE.Vector3().setFromMatrixScale(mw)); axis = sz.x >= sz.y && sz.x >= sz.z ? 0 : sz.y >= sz.z ? 1 : 2; } }
    const tint = o.userData.tint ? new THREE.Color(o.userData.tint) : null;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw); n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      let s = 0.14 * Math.max(0, 1 - v.y / 0.45);          // wall bases: a whisper of lavender shade (fake AO strength <= 0.18)
      if (n.y < -0.35) s += 0.1;                           // undersides (eaves, awnings)
      const up = n.y > 0.5 ? 1.16 : 1.1;   // high-key lift: pastels stay light even on shaded faces
      buf[i * 3] = c.r * up * (1 - s + s * LAV.r); buf[i * 3 + 1] = c.g * up * (1 - s + s * LAV.g); buf[i * 3 + 2] = c.b * up * (1 - s + s * LAV.b);
      uv[i * 2] = kind; uv[i * 2 + 1] = axis;
    }
    g.setAttribute('color', new THREE.BufferAttribute(buf, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); o.geometry = g; o.material = vcMat;
  });
}
// animated parts (named children the game drives) are baked and merged on their own, keeping their pivot; userData.mount marks an unnamed parent of one
const ANIM = new Set(['spin', 'spinz', 'flag', 'boat', 'door', 'beam', 'bell', 'lanterns']);
const isAnim = (o) => ANIM.has(o.name) || o.userData.mount;
function mergeLocal(C) {
  C.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(C.matrixWorld).invert(), buckets = new Map(), nested = [];
  const visit = (o) => { for (const ch of o.children) { if (isAnim(ch)) { nested.push(ch); continue; } if (ch.isMesh) { const gg = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone(); gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld)); for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) gg.deleteAttribute(k); if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2)); const key = ch.material.uuid + (ch.castShadow ? 'c' : '') + (ch.receiveShadow ? 'r' : ''); let bk = buckets.get(key); if (!bk) { bk = { mat: ch.material, geos: [], cast: ch.castShadow, recv: ch.receiveShadow }; buckets.set(key, bk); } bk.geos.push(gg); } visit(ch); } };
  visit(C); for (const n of nested) C.attach(n);
  for (const ch of [...C.children]) if (!nested.includes(ch)) C.remove(ch);
  for (const bk of buckets.values()) { const m = new THREE.Mesh(mergeGeometries(bk.geos, false), bk.mat); m.castShadow = bk.cast; m.receiveShadow = bk.recv; C.add(m); }
  for (const n of nested) mergeLocal(n);
}
function finish(root, topY, foot) {
  const anchors = []; root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.name === 'chimney') anchors.push(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)); });
  const all = []; root.traverse((o) => { if (o !== root && isAnim(o)) all.push(o); });
  const tops = all.filter((o) => { for (let p = o.parent; p && p !== root; p = p.parent) if (all.includes(p)) return false; return true; });
  for (const o of tops) { const m = o.matrixWorld.clone(); o.parent.remove(o); m.decompose(o.position, o.quaternion, o.scale); }
  if (foot) { const s = contact(foot[0], foot[1], foot[2] ?? 1); if (s) root.add(s); }
  if (globalThis.__prof) { const rows = {}; root.traverse((o) => { if (o.isMesh) { const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; const k = g.type.replace('Geometry','') + ' ' + Math.round(t) + 't ' + o.material.color.getHexString(); rows[k] = rows[k] || [0, 0]; rows[k][0]++; rows[k][1] += t; } }); globalThis.__prof(rows); }
  bake(root); root.userData.topY = topY;
  const out = K.mergeStatic(root);
  for (const p of anchors) { const e = new THREE.Object3D(); e.name = 'chimney'; e.position.copy(p); out.add(e); }
  for (const o of tops) { bake(o); mergeLocal(o); out.add(o); }
  out.userData.topY = topY; return out;
}

/** cottage shell: light stone foundation, chubby pastel walls, cream corner posts and plates. returns wall top y */
function shell(g, W, D, H, wallC, o = {}) {
  plaster(wallC);
  const f = o.found ?? 0.16, z0 = o.z ?? 0, x0 = o.x ?? 0, tc = o.trim || CREAM;
  const wall = rb(W, H, D, wallC, x0, f - 0.02, z0, 0.13, o.seg || 1); wall.userData.kind = o.kind ?? 1; if (o.axis !== undefined) wall.userData.axis = o.axis;
  add(g, rb(W + 0.14, f + 0.06, D + 0.14, o.foundC || STONE, x0, 0, z0, 0.07), wall);
  const top = f - 0.02 + H;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cyl(0.055, 0.055, H - 0.02, tc, x0 + sx * (W / 2 - 0.01), f - 0.02, z0 + sz * (D / 2 - 0.01), 5));
  return top;
}

// ================================================================ BUILDINGS
export const BUILD = {};

// ---------------------------------------------------------------- COTTAGE
BUILD.house = (info) => {
  const L = lv(info), id = info.id | 0, g = G(), [wallC, rc] = HOUSE_SETS[id % HOUSE_SETS.length], own = info.color || P.red;
  const W = 1.5, D = 1.44, H = 0.86, top = shell(g, W, D, H, wallC, { trim: L === 3 ? '#fff0b0' : CREAM });
  const rise = [0.8, 0.92, 1.04][L - 1], span = [1.88, 1.92, 1.96][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { y: ry0, span, len: D + 0.34, rise, col: rc, ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.16, flower: BUNT[id % 6] } });
  const fz = D / 2, cs = CURT[id % CURT.length], fl = id % 2 ? [P.blossomDeep, '#fff'] : [P.butter, '#c9a8ff'];
  add(g, place(door3(0.3, 0.54, own, { gold: L === 3, mat: id % 2 ? '#ffb6cf' : '#fff0a8' }), 0, 0.2, fz + 0.01));
  for (const s of [-1, 1]) add(g, place(window3(0.24, 0.32, { curt: cs, box: true, flowers: fl, shut: shade(rc, 0.3) }), s * 0.54, 0.78, fz + 0.02));
  for (const s of [-1, 1]) add(g, place(window3(0.24, 0.32, { curt: cs, box: L >= 2 }), s * (W / 2 + 0.01), 0.78, -0.05, s * Math.PI / 2));
  const cx = 0.46, cz = -0.28; chimney(g, cx, cz, surf(cx) - 0.3, surf(cx) + [0.3, 0.38, 0.46][L - 1], 0.26);
  if (L >= 3) chimney(g, -0.5, 0.3, surf(-0.5) - 0.3, surf(-0.5) + 0.22, 0.2);
  pot(g, -0.28, 0.17, fz + 0.2, 1, P.blossomDeep); pot(g, 0.3, 0.17, fz + 0.2, 0.9, P.butter); stones(g, 0.0, fz + 0.26, 2, 0.14); hang(g, 0.28, 0.62, fz + 0.12, L === 3);
  const k = id % 3;
  if (k === 0) cat(g, -0.6, 0.17, fz + 0.28, '#ffc890', 0.3); else if (k === 1) bowl(g, -0.58, fz + 0.3); else snail(g, -0.78, 0.46, fz - 0.02, 0.4);
  bed(g, 0.62, fz + 0.22, 3, 0.3, id); butterfly(g, 0.74, 0.62, fz + 0.2, '#ffa6c9', 0.5);
  if (L >= 2) {
    const dxp = 0.6, dz = 0.12, base = surf(dxp + 0.17) - 0.07, hh = 0.44;
    add(g, rb(0.34, hh, 0.38, wallC, dxp - 0.03, base, dz, 0.1), bx(0.05, hh, 0.05, CREAM, dxp + 0.14, base, dz - 0.19), bx(0.05, hh, 0.05, CREAM, dxp + 0.14, base, dz + 0.19));
    add(g, place(window3(0.17, 0.22, { curt: cs }), dxp + 0.14, base + 0.28, dz, Math.PI / 2));
    roof(g, { x: dxp - 0.06, y: base + hh - 0.02, z: dz, span: 0.66, len: 0.62, rise: 0.26, t: 0.14, col: rc, along: 'x', scal: false, fill: { col: wallC, wd: 0.38, base: -0.03, ovg: 0.08, win: false } });
    ivy(g, -W / 2 - 0.0, fz - 0.02, 0.7, id);
    const f = G(); add(f, bar(0, 0, 0, 0, 0.45, 0, 0.025, GOLDD), rb(0.26, 0.15, 0.02, own, 0.14, 0.27, 0, 0.02)); f.position.set(-0.04, ry0 + rise - 0.02, 0); g.add(f);
    if (L === 2) bunting(g, [-W / 2 + 0.08, top - 0.04, fz + 0.1], [W / 2 - 0.08, top - 0.04, fz + 0.1], 6, 0.1, 0.065, id);
  }
  if (L === 3) {
    bunting(g, [-W / 2, top + 0.12, fz + 0.1], [W / 2, top + 0.12, fz + 0.1], 8, 0.14, 0.075, id + 2);
    vane(g, 0, ry0 + rise + 0.05, 0, 1); picket(g, -0.95, -0.45, fz + 0.3);
  }
  return finish(g, ry0 + rise + (L === 3 ? 0.55 : 0.15), [2.3, 2.3, 0.9]);
};

// ---------------------------------------------------------------- KITCHEN
BUILD.kitchen = (info) => {
  const L = lv(info), g = G(), W = 1.3, D = 1.24, H = 0.94, wallC = PEACH, rc = '#f0648a';
  const top = shell(g, W, D, H, wallC, { x: 0.06, trim: L === 3 ? '#fff0b0' : CREAM });
  const rise = [0.5, 0.6, 0.74][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { x: 0.06, y: ry0, span: 1.7, len: 1.62, rise, col: rc, along: 'x', ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.14 } });
  add(g, place(door3(0.32, 0.56, P.mint, { gold: L === 3, mat: '#ffec99' }), 0.42, 0.2, D / 2 + 0.01));
  add(g, place(window3(0.4, 0.3, { curt: '#fff2a0' }), -0.2, 0.74, D / 2 + 0.02));
  add(g, rb(0.62, 0.07, 0.2, WOODL, -0.2, 0.4, D / 2 + 0.1, 0.03));
  for (let i = 0; i < 3; i++) add(g, sp(0.045, ['#ff6b6b', '#ffd24a', '#9be88a'][i], -0.34 + i * 0.14, 0.51, D / 2 + 0.12, { lo: true }));
  add(g, bar(-0.66, top - 0.08, D / 2 + 0.17, 0.0, top - 0.08, D / 2 + 0.17, 0.03, TIM2));
  for (let i = 0; i < 3; i++) { const x = -0.58 + i * 0.25; add(g, bar(x, top - 0.08, D / 2 + 0.17, x, top - 0.2, D / 2 + 0.17, 0.014, CREAM), K.cyl(0.075, 0.06, 0.12, ['#ffffff', '#bfe3ff', '#ffe27a'][i], x, top - 0.32, D / 2 + 0.17, { seg: 8 }), cyl(0.085, 0.085, 0.02, shade(IRON, 0.4), x, top - 0.2, D / 2 + 0.17, 8)); }
  pot(g, -0.52, 0.17, D / 2 + 0.22, 1, P.white); pot(g, -0.1, 0.17, D / 2 + 0.22, 0.9, P.blossomDeep); stones(g, 0.4, D / 2 + 0.26, 2, 0.14);
  const sx = -0.8, sh0 = surf(0) + 0.38;
  add(g, rb(0.4, top + 0.1, 0.42, CHIM, sx, 0, -0.05, 0.1), rb(0.31, sh0 - top - 0.05, 0.31, CHIM, sx, top + 0.05, -0.05, 0.08), bx(0.43, 0.05, 0.45, CREAM, sx, top * 0.55, -0.05), bx(0.34, 0.05, 0.34, CREAM, sx, top + 0.45, -0.05));
  add(g, rb(0.38, 0.08, 0.38, CREAM, sx, sh0, -0.05, 0.04), bx(0.2, 0.01, 0.2, DEEP, sx, sh0 + 0.075, -0.05));
  const a = new THREE.Object3D(); a.name = 'chimney'; a.position.set(sx, sh0 + 0.2, -0.05); g.add(a);
  if (L >= 2) chimney(g, 0.5, -0.25, surf(0) - 0.1, surf(0) + 0.3, 0.2, CHIM);
  const logs = [[0.8, 0.07, 0], [0.8, 0.07, 0.14], [0.8, 0.07, -0.14], [0.8, 0.19, 0.07], [0.8, 0.19, -0.07], [0.8, 0.31, 0]];
  logs.forEach(([x, y, z], i) => add(g, lcyl('x', 0.066, 0.24, i % 2 ? WOOD : TIM2, x, y, z, 7), cyl(0.05, 0.05, 0.01, WOODL, x + 0.12, y - 0.0, z, 7)));
  add(g, rb(0.2, 0.04, 0.2, TIM, 0.8, 0.0, 0, 0.015));
  cat(g, 0.78, 0.42, 0.0, '#fff3dc', -0.5); butterfly(g, 0.1, 0.9, D / 2 + 0.25, '#ffd24a', 0.2);
  if (L >= 2) { for (let i = 0; i < 5; i++) { const s = rb(0.14, 0.04, 0.3, i % 2 ? CREAM : '#ff9fbd', -0.2 - 0.28 + i * 0.14 + 0.07, 0.0, 0, 0.015); const pv = G(s); pv.position.set(0, top - 0.3, D / 2 + 0.17); pv.rotation.x = 0.55; g.add(pv); } ivy(g, -W / 2 + 0.38, D / 2 + 0.0, 0.6, 1); bunting(g, [-0.6, top - 0.02, D / 2 + 0.28], [0.7, top - 0.02, D / 2 + 0.28], 7, 0.1, 0.065, 3); }
  if (L === 3) { hang(g, 0.7, 0.62, D / 2 + 0.1, true); vane(g, 0.06, ry0 + rise + 0.05, 0, 0.9); signBoard(g, -0.55, 0.98, D / 2 - 0.02, '#fff2c8', '#ff6b6b'); }
  return finish(g, ry0 + rise + (L === 3 ? 0.55 : 0.25), [2.2, 2.2, 0.9]);
};

// ---------------------------------------------------------------- BAKERY
BUILD.bakery = (info) => {
  const L = lv(info), g = G(), W = 1.38, D = 1.34, H = 0.82, wallC = '#ffbcd0', rc = '#ffb347';
  const top = shell(g, W, D, H, wallC, { x: -0.1, trim: L === 3 ? '#fff0b0' : CREAM });
  const rise = [0.74, 0.86, 1.0][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { x: -0.1, y: ry0, span: 1.8, len: D + 0.3, rise, col: rc, ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.15, flower: '#ff8fb5' } });
  add(g, place(window3(0.5, 0.32, { curt: '#fff2a0' }), -0.1, 0.72, D / 2 + 0.02)); add(g, rb(0.78, 0.07, 0.24, WOODL, -0.1, 0.42, D / 2 + 0.1, 0.03));
  for (let i = 0; i < 3; i++) add(g, sp(0.06, i === 1 ? '#ffe08a' : '#f4b567', -0.28 + i * 0.18, 0.52, D / 2 + 0.12, { sx: 1.3, sy: 0.8, lo: true }));
  for (let i = 0; i < 6; i++) { const s = rb(0.16, 0.04, 0.34, i % 2 ? CREAM : '#ff9fbd', 0, 0, 0, 0.015), pv = G(s); pv.position.set(-0.1 - 0.4 + i * 0.16 + 0.08, top - 0.2, D / 2 + 0.2); pv.rotation.x = 0.6; g.add(pv); }
  for (let i = 0; i < 6; i++) add(g, cyl(0.08, 0.08, 0.02, i % 2 ? CREAM : '#ff9fbd', -0.1 - 0.4 + i * 0.16 + 0.08, top - 0.41, D / 2 + 0.31, 7));
  add(g, place(door3(0.3, 0.5, '#ffd24a', { gold: L === 3, mat: '#ff9fbd' }), 0.43, 0.2, D / 2 + 0.01));
  add(g, bar(0.72, 1.0, D / 2 - 0.02, 0.72, 1.0, D / 2 + 0.3, 0.035, TIM2), bx(0.04, 0.2, 0.04, TIM2, 0.72, 0.82, D / 2 + 0.3), sp(0.12, '#f4b567', 0.72, 0.74, D / 2 + 0.3, { sx: 1.3, sy: 0.8, sz: 0.8 }), bx(0.22, 0.03, 0.03, '#ffe9b8', 0.72, 0.74, D / 2 + 0.3));
  for (const k of [-1, 0, 1]) add(g, bx(0.02, 0.05, 0.1, '#e0963f', 0.72 + k * 0.07, 0.78, D / 2 + 0.3));
  chimney(g, 0.2, -0.3, surf(0.2) - 0.3, surf(0.2) + [0.3, 0.38, 0.46][L - 1], 0.3, CHIM);
  add(g, K.lathe([[0.001, 0], [0.34, 0], [0.38, 0.12], [0.35, 0.3], [0.26, 0.45], [0.12, 0.54], [0.001, 0.57]], '#ffc5a0', 0.78, 0, -0.2, { seg: 20 }));
  add(g, rb(0.24, 0.2, 0.06, '#8a6076', 0.78, 0.1, 0.12, 0.03), K.cyl(0.07, 0.07, 0.04, null, 0.78, 0.13, 0.14, { seg: 6, mat: fireMat }));
  sack(g, -0.72, D / 2 + 0.2, P.cream, 1.2, 0.0, 1); sack(g, -0.9, D / 2 + 0.05, P.cream, 1.1); sack(g, -0.8, D / 2 + 0.08, '#fff0c8', 1.0, 0.2);
  stones(g, 0.43, D / 2 + 0.26, 2, 0.14); butterfly(g, 0.0, 1.0, D / 2 + 0.3, '#ffd24a'); snail(g, -0.62, 0.2, D / 2 + 0.45, 0.5);
  if (L >= 2) { barrel(g, 0.3, D / 2 + 0.32, WOOD, 1); pot(g, 0.1, 0.17, D / 2 + 0.28, 0.8, P.white); ivy(g, -W / 2 - 0.1 + 0.0, D / 2 - 0.02, 0.65, 2); bunting(g, [-0.78, top - 0.05, D / 2 + 0.34], [0.58, top - 0.05, D / 2 + 0.34], 8, 0.1, 0.065, 1); }
  if (L === 3) { hang(g, 0.6, 0.64, D / 2 + 0.12, true); vane(g, -0.1, ry0 + rise + 0.05, 0, 0.9); signBoard(g, -0.78, 1.0, D / 2 - 0.02, '#ffe9a8', '#ff8fb5'); }
  return finish(g, ry0 + rise + (L === 3 ? 0.6 : 0.2), [2.3, 2.1, 0.9]);
};

// ---------------------------------------------------------------- STOREHOUSE
BUILD.storehouse = (info) => {
  const L = lv(info), g = G(), W = 1.52, D = 1.5, H = 0.8, wallC = MINT, rc = '#6fb8f2';
  const top = shell(g, W, D, H, wallC, { trim: L === 3 ? '#fff0b0' : CREAM, kind: 6, axis: 1 });
  const rise = [0.8, 0.92, 1.05][L - 1], ry0 = top + 0.07;
  roof(g, { y: ry0, span: 1.88, len: D + 0.32, rise, col: rc, ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.16, flower: '#ffd24a' } });
  const dw = 0.56, dh = 0.6;
  add(g, rb(dw * 2 + 0.16, dh + 0.1, 0.07, CREAM, 0, 0.17, D / 2 + 0.0, 0.04), lcyl('z', 0.08, 0.07, CREAM, 0, 0.17 + dh + 0.1, D / 2, 8));
  for (const s of [-1, 1]) { const x = s * dw / 2; add(g, rb(dw - 0.04, dh, 0.06, '#ffc27a', x, 0.2, D / 2 + 0.03, 0.03), bar(x - dw * 0.45, 0.24, D / 2 + 0.07, x + dw * 0.45, 0.2 + dh - 0.04, D / 2 + 0.07, 0.035, CREAM), bar(x + dw * 0.45, 0.24, D / 2 + 0.07, x - dw * 0.45, 0.2 + dh - 0.04, D / 2 + 0.07, 0.035, CREAM), sp(0.03, GOLDD, -s * 0.05, 0.5, D / 2 + 0.08, { lo: true })); }
  const ly = ry0 + 0.16;
  add(g, rb(0.34, 0.3, 0.05, CREAM, 0, ly, D / 2, 0.025), lcyl('z', 0.15, 0.05, CREAM, 0, ly + 0.3, D / 2, 8), rb(0.28, 0.24, 0.03, '#ffe0a8', 0, ly + 0.03, D / 2 + 0.03, 0.02), lcyl('z', 0.12, 0.03, '#ffe0a8', 0, ly + 0.27, D / 2 + 0.03, 8));
  add(g, bar(0, ly + 0.46, D / 2 + 0.0, 0, ly + 0.48, D / 2 + 0.42, 0.045, TIM2), sp(0.045, IRON, 0, ly + 0.45, D / 2 + 0.38, { lo: true }), bar(0, ly + 0.45, D / 2 + 0.38, 0, ly + 0.12, D / 2 + 0.38, 0.012, CREAM));
  sack(g, 0, D / 2 + 0.38, '#fff0c8', 0.6, ly - 0.02);
  sack(g, -0.8, D / 2 + 0.25, P.cream, 1.15); sack(g, -0.7, D / 2 + 0.05, '#fff0c8', 1.1); sack(g, -0.8, D / 2 + 0.12, P.cream, 1.0, 0.2, 2);
  barrel(g, 0.85, D / 2 + 0.2, WOOD, 1.1); barrel(g, 0.72, D / 2 + 0.38, TIM2, 1.0); crate(g, 0.66, D / 2 + 0.1, 0.0, 0.24); crate(g, 0.7, D / 2 + 0.1, 0.2, 0.18, WOODL, 0.3);
  add(g, place(window3(0.22, 0.28, { curt: '#ffb6cf' }), W / 2 + 0.01, 0.66, 0.0, Math.PI / 2));
  add(g, place(window3(0.22, 0.28, { curt: '#ffb6cf', box: true, flowers: [P.butter, P.blossomDeep] }), -W / 2 - 0.01, 0.66, 0.0, -Math.PI / 2));
  cat(g, 0.0, 0.17, D / 2 + 0.85 - 0.3, '#ffe9b8', 0.0); butterfly(g, -0.4, 0.95, D / 2 + 0.3, '#c9a8ff'); snail(g, 0.2, 0.2, D / 2 + 0.55, -0.6);
  if (L >= 2) { barrel(g, -0.95, 0.2, TIM2, 1); crate(g, -W / 2 - 0.2, -0.3, 0.0, 0.3); crate(g, -W / 2 - 0.2, -0.3, 0.24, 0.22, WOODL, 0.5); ivy(g, W / 2 - 0.02, D / 2 - 0.02, 0.7, 1); bunting(g, [-W / 2 + 0.06, top - 0.06, D / 2 + 0.12], [W / 2 - 0.06, top - 0.06, D / 2 + 0.12], 8, 0.12, 0.07, 4); }
  if (L === 3) { hang(g, 0.62, 0.8, D / 2 + 0.1, true); vane(g, 0, ry0 + rise + 0.05, 0, 1); signBoard(g, -0.75, 0.98, D / 2 - 0.02, '#fff2c8', '#6fb8f2'); }
  return finish(g, ry0 + rise + (L === 3 ? 0.6 : 0.15), [2.3, 2.3, 0.9]);
};

// ---------------------------------------------------------------- SAWMILL
BUILD.sawmill = (info) => {
  const L = lv(info), g = G(), rc = '#4cc9b0';
  add(g, rb(1.84, 0.14, 1.72, PLANK, 0, 0, 0, 0.06));
  for (let i = 0; i < 5; i++) add(g, bx(0.012, 0.01, 1.7, shade(PLANK, -0.15), -0.72 + i * 0.36, 0.14, 0));
  const ph = 1.2, bayX = -0.4;
  for (const sx of [-0.82, 0.02]) for (const sz of [-1, 1]) add(g, rb(0.14, ph, 0.14, CREAM, sx, 0.1, sz * 0.72, 0.06), bl(0.09, CREAM, sx, 0.1 + ph, sz * 0.72));
  for (const sz of [-1, 1]) add(g, rb(1.0, 0.12, 0.12, WOODL, bayX, ph - 0.04, sz * 0.72, 0.05));
  for (const sx of [-0.82, 0.02]) add(g, rb(0.12, 0.12, 1.5, TIM, sx, ph - 0.04, 0, 0.05));
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) add(g, bar(bayX + sx * 0.42, ph - 0.28, sz * 0.72, bayX + sx * 0.18, ph - 0.04, sz * 0.72, 0.07, WOOD));
  { const bw = rb(0.9, 0.8, 0.08, '#b8ecd8', bayX, 0.14, -0.72, 0.04); bw.userData.kind = 6; bw.userData.axis = 1; add(g, bw); }
  const rise = [0.5, 0.6, 0.72][L - 1], ry0 = ph + 0.08;
  roof(g, { x: bayX, y: ry0, span: 1.2, len: 1.9, rise, col: rc, along: 'z', ridgeCol: L === 3 ? GOLD : null, rows: 2, fill: { col: '#ffe9c0', wd: 0.96, base: -0.1, ovg: 0.14, flower: '#ffb6cf' } });
  const bxp = 0.58;
  add(g, rb(0.5, 0.1, 1.34, WOODL, bxp, 0.4, 0.0, 0.04)); for (const sz of [-0.55, 0.55]) for (const dx of [-0.17, 0.17]) add(g, rb(0.1, 0.4, 0.1, TIM2, bxp + dx, 0.14, sz, 0.04));
  add(g, rb(0.3, 0.12, 0.22, '#b3a4dd', bxp, 0.5, 0.0, 0.05), rb(0.1, 0.5, 0.1, '#b3a4dd', bxp, 0.5, -0.08, 0.04));
  const disc_ = lcyl('x', 0.4, 0.035, '#e8f2ff', 0, 0, 0, 18), teeth = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, t = bx(0.04, 0.1, 0.07, '#c8d8ee', 0, 0, 0); t.position.set(0, Math.cos(a) * 0.4, Math.sin(a) * 0.4); t.rotation.x = -a + 0.6; teeth.push(t); }
  const spin = G(sh(Object.assign(disc_, { material: lit('#e8f2ff', 0.25) })), fuse(teeth, lit('#c8d8ee', 0.25)), lcyl('x', 0.1, 0.06, lit('#ff7a6b', 0.25), 0, 0, 0, 8), lcyl('x', 0.2, 0.045, lit('#f4f0ff', 0.25), 0, 0, 0, 12)); spin.name = 'spin'; spin.position.set(bxp, 0.98, 0.0);
  add(g, lcyl('z', 0.12, 0.8, WOOD, bxp, 0.62, 0.52, 8), lcyl('z', 0.1, 0.02, WOODL, bxp, 0.62, 0.93, 8), lcyl('z', 0.1, 0.5, TIM2, bxp, 0.62, -0.45, 8));
  add(g, rb(0.3, 0.05, 0.5, WOODL, bxp + 0.18, 0.5, 0.65, 0.02));
  const lp = [[-0.64, 0.2, -0.3], [-0.4, 0.2, -0.3], [-0.52, 0.38, -0.3], [-0.64, 0.2, 0.05], [-0.4, 0.2, 0.05]];
  lp.forEach(([x, y, z], i) => { add(g, lcyl('z', 0.12, 0.5, i % 2 ? TIM2 : WOOD, x, y, z, 8)); add(g, lcyl('z', 0.1, 0.02, WOODL, x, y, z + 0.25, 8)); });
  for (let i = 0; i < 5; i++) add(g, rb(0.5, 0.045, 0.28, i % 2 ? WOODL : PLANK, -0.5 + (i % 2) * 0.02, 0.14 + i * 0.062, 0.5, 0.02));
  add(g, bx(0.04, 0.3, 0.3, TIM, -0.5, 0.14, 0.5));
  add(g, bl(0.2, '#ffecb0', 0.3, 0.14, 0.62, 0.5, 1), bl(0.13, '#ffecb0', 0.3, 0.14, 0.2, 0.5, 2), bl(0.15, '#ffecb0', 0.8, 0.14, 0.5, 0.5, 3));
  add(g, lcyl('z', 0.17, 0.02, '#e8f2ff', -0.4, 0.8, -0.66, 10));
  add(g, rb(0.26, 0.14, 0.04, '#fff2c8', 0.02, 0.88, 0.8, 0.02), sp(0.04, '#9be88a', 0.02, 0.95, 0.83), bar(-0.08, 1.12, 0.78, -0.08, 0.98, 0.78, 0.012, CREAM), bar(0.12, 1.12, 0.78, 0.12, 0.98, 0.78, 0.012, CREAM));
  bed(g, -0.45, 0.82, 3, 0.4, 1); cat(g, -0.2, 0.14, 0.78, '#ffd6a0', 0.5); butterfly(g, -0.3, 0.7, 0.9, '#ffa6c9');
  if (L >= 2) { add(g, rb(0.4, 0.2, 0.05, WOODL, bayX, ph - 0.5, 0.8, 0.02), bar(bayX - 0.15, ph - 0.28, 0.8, bayX - 0.15, ph - 0.1, 0.8, 0.012, CREAM), bar(bayX + 0.15, ph - 0.28, 0.8, bayX + 0.15, ph - 0.1, 0.8, 0.012, CREAM)); lantern(g, 0.02, 0.8, 0.82, 1, false); add(g, bx(0.04, 0.56, 0.04, TIM, 0.02, 0.14, 0.82)); for (let i = 0; i < 4; i++) add(g, rb(0.46, 0.05, 0.26, i % 2 ? WOODL : PLANK, bxp + 0.0, 0.14 + i * 0.062, -0.55, 0.02)); bunting(g, [-0.82, ph - 0.12, 0.8], [0.02, ph - 0.12, 0.8], 6, 0.1, 0.065, 5); }
  if (L === 3) { lantern(g, -0.82, 0.9, 0.84, 1, true); vane(g, bayX, ry0 + rise + 0.05, 0, 0.9); }
  const out = finish(g, ry0 + rise + (L === 3 ? 0.55 : 0.15), [2.2, 2.1, 0.9]); out.add(spin); return out;
};

// ---------------------------------------------------------------- BRICK KILN
BUILD.kiln = (info) => {
  const L = lv(info), g = G(), b1 = '#ffa98a', b2 = '#ffe08a', b3 = '#ff93ac';
  add(g, rb(1.8, 0.2, 1.7, STONE, 0, 0, 0, 0.08));
  const R = [0.74, 0.8, 0.86][L - 1];
  add(g, K.lathe([[0.001, 0.2], [R, 0.2], [R + 0.05, 0.3], [R + 0.03, 0.55]], b3, 0, 0, 0, { seg: 20 }));
  add(g, K.lathe([[R + 0.03, 0.55], [R, 0.72], [R - 0.1, 0.9], [R - 0.2, 1.02]], b1, 0, 0, 0, { seg: 20 }));
  add(g, K.lathe([[R - 0.2, 1.02], [R - 0.34, 1.12], [R - 0.5, 1.2], [R - 0.58, 1.26], [0.001, 1.32]], b2, 0, 0, 0, { seg: 20 }));
  for (const [y, r] of [[0.52, R + 0.045], [0.93, R - 0.12]]) add(g, cyl(r, r, 0.045, L >= 3 ? GOLDD : CREAM, 0, y, 0, 14));
  add(g, rb(0.66, 0.42, 0.24, STONEL, 0, 0.2, R - 0.0, 0.09), lcyl('z', 0.33, 0.24, STONEL, 0, 0.62, R, 12));
  add(g, bx(0.46, 0.38, 0.1, '#8a6076', 0, 0.2, R + 0.09), lcyl('z', 0.23, 0.1, '#8a6076', 0, 0.58, R + 0.09, 10));
  add(g, bx(0.36, 0.26, 0.05, fireMat, 0, 0.22, R + 0.13), lcyl('z', 0.18, 0.05, fireMat, 0, 0.48, R + 0.13, 8), rb(0.5, 0.06, 0.16, CREAM, 0, 0.2, R + 0.15, 0.025));
  const cy0 = 0.9, cy1 = 2.0 + (L - 1) * 0.1;
  add(g, K.cyl(0.17, 0.24, cy1 - cy0, b1, 0.2, cy0, -0.42, { seg: 10 }), cyl(0.21, 0.19, 0.1, CREAM, 0.2, cy1, -0.42, 10), cyl(0.14, 0.14, 0.04, DEEP, 0.2, cy1 + 0.1, -0.42, 8), cyl(0.2, 0.2, 0.04, CREAM, 0.2, 1.35, -0.42, 10), cyl(0.185, 0.185, 0.04, CREAM, 0.2, 1.7, -0.42, 10));
  const a = new THREE.Object3D(); a.name = 'chimney'; a.position.set(0.2, cy1 + 0.3, -0.42); g.add(a);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) add(g, rb(0.2, 0.09, 0.1, r % 2 ? '#ffa890' : CHIM, -0.82 + c * 0.22 + r * 0.11, 0.2 + r * 0.095, 0.62, 0.03), rb(0.2, 0.09, 0.1, r % 2 ? CHIM : '#ffa890', -0.82 + c * 0.22 + r * 0.11, 0.2 + r * 0.095, 0.5, 0.03));
  for (let i = 0; i < 4; i++) add(g, lcyl('x', 0.055, 0.34, i % 2 ? TIM2 : WOOD, 0.78, 0.26 + (i > 1 ? 0.1 : 0), 0.45 + (i % 2) * 0.12 - 0.06, 7));
  add(g, bl(0.18, '#ffc9a0', -0.8, 0.28, 0.08, 0.6), bl(0.12, '#f7a57d', -0.62, 0.25, 0.2, 0.6, 1));
  add(g, bx(0.04, 0.26, 0.04, TIM, 0.55, 0.2, 0.85), bx(0.04, 0.2, 0.04, TIM, 0.85, 0.2, 0.85), rb(0.5, 0.04, 0.12, WOODL, 0.7, 0.4, 0.85, 0.02));
  cat(g, 0.2, 0.2, 0.98, '#fff3dc', 0.0); bed(g, -0.5, 0.95, 3, 0.4, 2); butterfly(g, -0.2, 0.7, 1.0, '#ffa6c9'); signBoard(g, 0.0, 0.72, R + 0.1, '#fff2c8', '#ff9a4a');
  if (L >= 2) { add(g, bar(-0.9, 0.2, -0.7, -0.9, 1.0, -0.7, 0.07, WOOD)); lantern(g, -0.9, 0.95, -0.55, 1, L === 3); add(g, bar(-0.9, 1.05, -0.7, -0.9, 1.05, -0.5, 0.05, TIM2)); bunting(g, [-0.62, 0.78, 0.7], [0.58, 0.78, 0.7], 7, 0.12, 0.065, 2); }
  if (L === 3) { add(g, sp(0.1, GOLD, 0, 1.4 + 0.02, 0), vane(g, 0, 1.38, 0, 0.8)); }
  return finish(g, 1.45 + (L - 1) * 0.1 + (L === 3 ? 0.55 : 0), [2.2, 2.1, 0.9]);
};

// ---------------------------------------------------------------- STUDY (wizard tower)
BUILD.study = (info) => {
  const L = lv(info), g = G(), tw = G(), plaster = '#dcc8ff', band = '#fff3b0';
  add(g, rb(1.8, 0.16, 1.7, STONE, 0, 0, 0, 0.08));
  add(tw, K.lathe([[0.001, 0.1], [0.7, 0.1], [0.72, 0.25], [0.66, 0.5]], STONEL, 0, 0, 0, { seg: 20 }));
  add(tw, K.lathe([[0.66, 0.5], [0.6, 1.0], [0.52, 1.5], [0.46, 1.62]], plaster, 0, 0, 0, { seg: 20 }));
  add(tw, cyl(0.64, 0.64, 0.07, band, 0, 1.0, 0, 12), cyl(0.56, 0.56, 0.06, band, 0, 1.45, 0, 12));
  const top1 = 1.62;
  add(tw, cyl(0.62, 0.55, 0.13, band, 0, top1 - 0.08, 0, 12), cyl(0.5, 0.5, 0.3, '#f3eaff', 0, top1 + 0.04, 0, 12));
  const hy = top1 + 0.3;
  add(tw, cyl(0.84, 0.84, 0.08, '#a58cf0', 0, hy - 0.04, 0, 14), K.cone(0.62, 0.9, '#9a82ec', 0, hy + 0.02, 0, { seg: 12, rot: 0 }));
  const tip = G(K.cone(0.28, 0.7, '#b39cfa', 0, 0, 0, { seg: 10, rot: 0 }), sp(0.06, GOLD, 0, 0.7, 0)); tip.position.set(0.0, hy + 0.85, 0); tip.rotation.z = -0.35; tw.add(tip);
  add(tw, cyl(0.56, 0.66, 0.05, GOLD, 0, hy + 0.12, 0, 14));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; add(tw, star(0.07, GOLD, Math.sin(a) * 0.42, hy + 0.36, Math.cos(a) * 0.42, a)); }
  g.add(tw); tw.rotation.z = -0.06; tw.position.set(-0.05, 0.0, -0.1);
  const rAt = (y) => (y < 1.0 ? 0.66 - (y - 0.5) * 0.12 : 0.6 - (y - 1.0) * 0.16);
  [[0.8, 0.5], [1.18, 1.5], [1.46, 2.6], [1.1, -0.9]].forEach(([y, a], i) => { const w = window3(0.17, i === 2 ? 0.2 : 0.26, { frame: GOLDD, curt: i % 2 ? '#ffb6cf' : '#fff2a0' }); w.position.set(Math.sin(a) * rAt(y), y, Math.cos(a) * rAt(y)); w.rotation.y = a; tw.add(w); });
  add(g, place(door3(0.3, 0.5, P.roofPurple, { gold: L === 3, mat: '#ffec99' }), 0.2, 0.18, 0.62, 0.0));
  add(g, bar(0.9, 1.05, 0.2, 0.9, 1.05, 0.6, 0.04, TIM2), bar(0.9, 1.05, 0.58, 0.9, 0.82, 0.58, 0.015, CREAM));
  add(g, rb(0.3, 0.24, 0.04, '#a58cf0', 0.9, 0.62, 0.58, 0.02)); const moon = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.03, 5, 10, 4.6), col(GOLD)); moon.position.set(0.9, 0.74, 0.61); moon.rotation.z = 0.5; add(g, sh(moon)); add(g, star(0.05, GOLD, 0.97, 0.7, 0.61));
  const bc = ['#ff8aa0', '#7fd4ff', '#9be88a', '#ffd24a', '#c9a8ff', '#ffa970'];
  [0, 1, 2].forEach((i) => add(g, place(rb(0.34 - i * 0.03, 0.07, 0.24, bc[i], -0.8 + i * 0.01, 0.16 + i * 0.075, 0.55, 0.025), -0.8 + i * 0.01, 0.16 + i * 0.075, 0.55, [0.1, -0.14, 0.25][i])));
  for (let i = 0; i < 3; i++) add(g, rb(0.07, 0.3, 0.2, bc[(i + 3) % 6], -0.62 + i * 0.075, 0.16, 0.72, 0.025));
  add(g, lcyl('x', 0.04, 0.2, P.cream, -0.55, 0.2, 0.3, 6), lcyl('x', 0.04, 0.2, '#fff0c8', -0.5, 0.2, 0.38, 6));
  cat(g, 0.55, 0.16, 0.95, '#ffffff', 0.4); bed(g, -0.1, 0.98, 3, 0.4, 3); butterfly(g, 0.3, 0.8, 0.9, '#7fd4ff'); stones(g, 0.2, 0.88, 2, 0.2);
  if (L >= 2) { for (let i = 0; i < 4; i++) add(g, place(rb(0.3, 0.06, 0.2, bc[(i + 1) % 6], 0.7, 0.16 + i * 0.065, 0.76, 0.025), 0.7, 0.16 + i * 0.065, 0.76, i * 0.4)); hang(g, 0.5, 0.74, 0.7, false); bunting(g, [-0.55, 0.64, 0.62], [0.5, 0.64, 0.7], 6, 0.12, 0.06, 6); }
  if (L === 3) { add(g, rb(0.16, 0.5, 0.16, '#b39cfa', -0.88, 0.16, -0.55, 0.06), sp(0.14, GOLD, -0.88, 0.76, -0.55), rb(0.16, 0.5, 0.16, '#b39cfa', 0.88, 0.16, -0.55, 0.06), sp(0.14, GOLD, 0.88, 0.76, -0.55)); }
  return finish(g, hy + 1.65, [2.2, 2.1, 0.9]);
};

// ---------------------------------------------------------------- WINDMILL
BUILD.mill = (info) => {
  const L = lv(info), g = G(), wall = '#c4e6ff', wall2 = '#fff6e0';
  add(g, rb(1.7, 0.16, 1.7, STONE, 0, 0, 0, 0.08));
  add(g, K.lathe([[0.001, 0.12], [0.74, 0.12], [0.76, 0.3], [0.7, 0.45]], STONEL, 0, 0, -0.1, { seg: 20 }));
  add(g, K.lathe([[0.7, 0.45], [0.62, 1.0], [0.54, 1.5], [0.5, 1.75]], wall, 0, 0, -0.1, { seg: 20 }));
  add(g, cyl(0.66, 0.66, 0.05, CREAM, 0, 0.98, -0.1, 12), cyl(0.57, 0.57, 0.05, CREAM, 0, 1.45, -0.1, 12));
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.4; add(g, bar(Math.sin(a) * 0.62, 0.5, -0.1 + Math.cos(a) * 0.62, Math.sin(a) * 0.51, 1.72, -0.1 + Math.cos(a) * 0.51, 0.03, wall2)); }
  const cy = 1.75;
  add(g, cyl(0.56, 0.52, 0.12, CREAM, 0, cy - 0.02, -0.1, 12), K.lathe([[0.6, cy + 0.08], [0.58, cy + 0.2], [0.47, cy + 0.38], [0.26, cy + 0.52], [0.001, cy + 0.58]], L === 3 ? GOLD : '#ff8fb0', 0, 0, -0.1, { seg: 20 }));
  add(g, bx(0.04, 0.2, 0.04, CREAM, 0, cy + 0.55, -0.1), sp(0.07, GOLD, 0, cy + 0.78, -0.1, { lo: true }));
  add(g, place(door3(0.3, 0.5, '#ffd24a', { gold: L === 3, mat: '#ff9fbd' }), 0, 0.22, 0.6 - 0.1 + 0.0, 0)); g.children[g.children.length - 1].position.z = 0.57;
  add(g, rb(0.36, 0.05, 0.12, TIM2, 0, 0.98, 0.5, 0.02));
  const w = window3(0.18, 0.24, { curt: '#ffb6cf', box: true }); w.position.set(0, 1.28, 0.46); g.add(w);
  const w2 = window3(0.16, 0.22, { curt: '#fff2a0' }); w2.position.set(0.52, 0.85, -0.1 + 0.2); w2.rotation.y = 1.2; g.add(w2);
  const hubZ = 0.55, hubY = cy + 0.1, len = 0.92;
  const woods = [], cloths = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, sg = new THREE.Group();
    sg.add(bx(0.05, len, 0.05, TIM2, 0, 0.05, 0), bx(0.3, 0.025, 0.04, TIM2, 0.17, 0.2, 0), bx(0.3, 0.025, 0.04, TIM2, 0.17, len - 0.08, 0), bx(0.025, len - 0.3, 0.04, TIM2, 0.3, 0.2, 0), bx(0.3, 0.025, 0.04, TIM2, 0.17, 0.45, 0), bx(0.3, 0.025, 0.04, TIM2, 0.17, 0.7, 0));
    const cl = bx(0.26, len - 0.3, 0.025, ['#ffd0e0', '#fff6e0', '#d6efff', '#fff6e0'][i], 0.17, 0.22, -0.01);
    sg.add(cl); sg.rotation.z = a; sg.updateMatrix(); sg.updateMatrixWorld(true);
    sg.traverse((m) => { if (m.isMesh) { m.updateWorldMatrix(true, false); const gg = m.geometry.clone(); gg.applyMatrix4(m.matrixWorld); const mm = new THREE.Mesh(gg, m.material); (m === cl ? cloths : woods).push(mm); } });
  }
  const sails = G(fuse(woods, lit(WOODL, 0.3)), fuse(cloths, lit('#fff4e6', 0.35)), sp(0.1, GOLDD, 0, 0, 0.04), cyl(0.05, 0.05, 0.2, TIM2, 0, 0, 0, 6));
  sails.children[3].rotation.x = Math.PI / 2; sails.children[3].position.set(0, 0, -0.06);
  sails.name = 'spinz'; sails.position.set(0, hubY, hubZ);
  sack(g, -0.8, 0.5, P.cream, 1.2); sack(g, -0.65, 0.65, P.cream, 1.1); sack(g, -0.74, 0.58, '#fff0c8', 1.0, 0.2);
  barrel(g, 0.82, 0.5, WOOD, 1);
  for (let i = 0; i < 4; i++) add(g, bl(0.07, P.thatch, 0.7 + i * 0.05, 0.2 + i * 0.01, 0.8 - i * 0.05, 1.4, i));
  stones(g, 0.0, 0.85, 2, 0.2); bed(g, -0.35, 0.9, 3, 0.4, 1); butterfly(g, 0.4, 0.9, 0.8, '#ffa6c9'); snail(g, 0.3, 0.2, 0.8, 0.2);
  if (L >= 2) { hang(g, 0.4, 0.68, 0.72, false); ivy(g, -0.6, 0.35, 0.8, 1, 0.1); bunting(g, [-0.62, 1.0, 0.45], [0.62, 1.0, 0.45], 7, 0.12, 0.065, 3); }
  if (L === 3) { add(g, cyl(0.62, 0.62, 0.04, GOLDD, 0, 1.0, -0.1, 12)); }
  const out = finish(g, cy + 0.9, [2.2, 2.1, 0.9]); out.add(sails); return out;
};

// ---------------------------------------------------------------- MARKET (striped stall)
BUILD.market = (info) => {
  const L = lv(info), g = G(), own = info.color || P.red, S1 = '#ff9fbd';
  add(g, rb(1.84, 0.1, 1.76, STONE, 0, 0, 0, 0.05));
  const ph = L === 3 ? 1.36 : 1.26, hi = ph + 0.12, lo = ph - 0.4, Z0 = -0.82, Z1 = 0.5;
  for (const sx of [-1, 1]) add(g, rb(0.12, ph, 0.12, CREAM, sx * 0.82, 0.1, -0.7, 0.05), rb(0.12, lo + 0.02, 0.12, CREAM, sx * 0.82, 0.1, 0.4, 0.05));
  { const bw = rb(1.6, 0.95, 0.06, MINT, 0, 0.1, -0.74, 0.025); bw.userData.kind = 6; bw.userData.axis = 1; add(g, bw); }
  add(g, rb(1.4, 0.05, 0.2, WOODL, 0, 0.62, -0.62, 0.02));
  ['#ff7a8a', '#ffd24a', '#c9a8ff', '#8fe06a', '#ffa970', '#7fd4ff', '#ffd24a'].forEach((c, i) => add(g, cyl(0.06, 0.07, 0.11, c, -0.58 + i * 0.19, 0.67, -0.62, 7)));
  const n = 8, sw = 1.94 / n, a = Math.atan2(hi - lo, Z1 - Z0), Ls = Math.hypot(Z1 - Z0, hi - lo) + 0.02;
  for (let i = 0; i < n; i++) { const c = i % 2 ? CREAM : (L >= 2 && i % 4 === 0 ? own : S1); const pv = G(rb(sw - 0.005, 0.14, Ls, c, 0, -0.14, 0, 0.05)); pv.position.set(-0.97 + sw * (i + 0.5), (hi + lo) / 2 + 0.03, (Z0 + Z1) / 2); pv.rotation.x = a; g.add(pv); }
  for (let i = 0; i < n; i++) { const c = i % 2 ? CREAM : S1; const d = cyl(sw / 2 * 0.98, sw / 2 * 0.98, 0.1, c, 0, 0, 0, 8); d.rotation.x = Math.PI / 2; d.position.set(-0.97 + sw * (i + 0.5), lo - 0.06, Z1 + 0.0); add(g, d); }
  add(g, lcyl('x', 0.05, 1.96, GOLDD, 0, lo + 0.08, Z1 + 0.03, 6), rb(1.96, 0.12, 0.12, CREAM, 0, hi - 0.05, Z0 - 0.03, 0.05));
  add(g, rb(1.5, 0.42, 0.42, WOODL, 0, 0.1, 0.74, 0.06), rb(1.58, 0.07, 0.5, PLANK, 0, 0.52, 0.74, 0.03));
  for (let i = 0; i < 5; i++) add(g, bx(0.26, 0.4, 0.012, i % 2 ? CREAM : S1, -0.52 + i * 0.26, 0.12, 0.955));
  const goods = [['#ff6b6b', -0.56], ['#9be860', -0.19], ['#ffa24a', 0.19], ['#ffd24a', 0.56]];
  goods.forEach(([c, x]) => { add(g, rb(0.3, 0.1, 0.3, TIM2, x, 0.59, 0.74, 0.04)); for (let k = 0; k < 5; k++) add(g, sp(0.056, c, x - 0.07 + (k % 2) * 0.12, 0.73, 0.74 - 0.06 + (k >> 1) * 0.08, { lo: true })); });
  barrel(g, 0.82, 0.72, WOOD, 1.0); barrel(g, -0.84, 0.74, TIM2, 1.0); crate(g, -0.7, 0.28, 0.0, 0.26); crate(g, -0.68, 0.28, 0.21, 0.2, WOODL, 0.3); crate(g, 0.7, 0.3, 0.0, 0.24, WOODL, 0.2);
  for (let i = 0; i < 3; i++) add(g, sp(0.056, '#ffa24a', 0.66 + (i - 1) * 0.06, 0.26, 0.3 + (i % 2) * 0.05, { lo: true }));
  sack(g, 0.45, 0.2, '#fff0c8', 1.0);
  add(g, bar(0.82, ph - 0.0, 0.2, 0.93, ph - 0.0, 0.2, 0.04, TIM2), bar(0.93, ph - 0.02, 0.2, 0.93, ph - 0.2, 0.2, 0.012, CREAM), rb(0.05, 0.26, 0.36, WOODL, 0.93, ph - 0.46, 0.2, 0.02), lcyl('x', 0.1, 0.06, GOLD, 0.94, ph - 0.33, 0.2, 10));
  cat(g, 0.3, 0.1, 0.18, '#ffc890', -0.3); butterfly(g, -0.4, 1.0, 0.7, '#ffd24a');
  if (L >= 2) { hang(g, -0.82, lo - 0.34, 0.42, false); for (const s of [-1, 1]) add(g, bl(0.12, P.leafLight, s * 0.5, hi + 0.06, -0.2, 0.7), bl(0.05, P.blossomDeep, s * 0.5 + 0.04, hi + 0.13, -0.16)); bunting(g, [-0.97, lo - 0.14, Z1 + 0.04], [0.97, lo - 0.14, Z1 + 0.04], 9, 0.1, 0.065, 1); }
  if (L === 3) { for (const sx of [-1, 1]) add(g, sp(0.09, GOLD, sx * 0.82, 0.1 + ph + 0.08, -0.7)); add(g, bar(0, hi, -0.2, 0, hi + 0.5, -0.2, 0.03, GOLDD), rb(0.28, 0.16, 0.02, own, 0.16, hi + 0.33, -0.2, 0.01)); }
  return finish(g, hi + (L === 3 ? 0.6 : 0.25), [2.2, 2.0, 0.9]);
};

// ---------------------------------------------------------------- HALL (3x3)
BUILD.hall = (info) => {
  const L = lv(info), g = G(), own = info.color || P.red, wallC = '#ffeaa0', wing = BLUSH, rc = '#ff7a6b', blue = '#6fc2ff';
  add(g, rb(2.84, 0.16, 2.84, STONE, 0, 0, 0, 0.08));
  add(g, rb(1.3, 0.07, 0.3, STONEL, 0, 0.14, 1.3, 0.03), rb(1.1, 0.07, 0.26, STONE, 0, 0.2, 1.17, 0.03));
  const mz = -0.25, W = 1.7, D = 1.5, top = shell(g, W, D, 0.96, wallC, { z: mz, found: 0.28, foundC: STONE, trim: L === 3 ? '#fff0b0' : CREAM });
  const rise = [0.9, 1.0, 1.14][L - 1], span = [2.1, 2.2, 2.3][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { z: mz, y: ry0, span, len: D + 0.34, rise, col: rc, ridgeCol: L === 3 ? GOLD : null, rows: 2, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.16, win: false } });
  const fz = mz + D / 2;
  add(g, bx(0.64, 0.7, 0.08, CREAM, 0, 0.22, fz), fdisc(0.32, CREAM, 0, 0.92, fz + 0.041, 0, true, 10));
  add(g, bx(0.46, 0.66, 0.08, own, 0, 0.24, fz + 0.03), fdisc(0.23, own, 0, 0.9, fz + 0.072, 0, true, 10), bx(0.025, 0.8, 0.02, shade(own, 0.4), 0, 0.26, fz + 0.075), sp(0.035, GOLD, 0.1, 0.55, fz + 0.09), sp(0.035, GOLD, -0.1, 0.55, fz + 0.09));
  for (const s of [-1, 1]) add(g, place(window3(0.26, 0.34, { curt: '#fff2a0', box: true, flowers: [P.blossomDeep, P.butter], shut: shade(own, 0.45) }), s * 0.6, 0.66, fz + 0.01));
  const pz = fz + 0.42;
  for (const s of [-1, 1]) add(g, cyl(0.07, 0.085, 0.9, CREAM, s * 0.46, 0.16, pz + 0.05, 7), bl(0.12, CREAM, s * 0.46, 1.06, pz + 0.05, 0.5));
  roof(g, { z: pz - 0.12, y: 1.12, span: 1.34, len: 0.92, rise: 0.4, t: 0.14, col: rc, along: 'z', ridgeCol: L === 3 ? GOLD : null, scal: false });
  for (const s of [-1, 1]) {
    const wx = s * 1.08, wtop = 0.28 + 0.62;
    add(g, rb(0.62, 0.3, 1.0, STONE, wx, 0, -0.35, 0.08), rb(0.54, 0.62, 0.9, wing, wx, 0.28, -0.35, 0.1), bx(0.08, 0.6, 0.08, CREAM, wx + s * 0.27, 0.28, 0.1), bx(0.08, 0.6, 0.08, CREAM, wx - s * 0.27, 0.28, 0.1));
    lean(g, s * 0.78, wtop + 0.06, -0.35, 0.66, 1.1, 0.34, '#ffa24a', s);
    add(g, place(window3(0.2, 0.3, { curt: '#fff2a0' }), wx, 0.64, 0.11));
  }
  chimney(g, 1.18, -0.7, 1.15, 1.85, 0.2); if (L >= 3) chimney(g, -1.18, -0.7, 1.15, 1.75, 0.2);
  const tz = mz - 0.42, tw = 0.74, t0 = 0.9, t1 = ry0 + rise + 0.4;
  add(g, rb(tw, t1 - t0, tw, '#fff6d6', 0, t0, tz, 0.1), rb(tw + 0.1, 0.1, tw + 0.1, CREAM, 0, t1 - 0.06, tz, 0.04));
  const b0 = t1 + 0.03, bh = 0.46;
  add(g, rb(tw - 0.06, bh, tw - 0.06, '#cdb8f5', 0, b0, tz, 0.08));
  for (const s of [-1, 1]) for (const q of [-1, 1]) add(g, cyl(0.05, 0.05, bh, CREAM, s * (tw / 2 - 0.03), b0, tz + q * (tw / 2 - 0.03), 6));
  add(g, rb(tw + 0.2, 0.09, tw + 0.2, CREAM, 0, b0 + bh, tz, 0.04), cone(tw * 0.74, 0.85, L === 3 ? GOLD : blue, 0, b0 + bh + 0.08, tz, 10, 0), bl(0.08, GOLD, 0, b0 + bh + 0.95, tz));
  const cy_ = t0 + 0.6, cz = tz + tw / 2;
  add(g, fdisc(0.27, GOLD, 0, cy_, cz + 0.02, 0, false, 12), fdisc(0.22, CREAM, 0, cy_, cz + 0.035, 0, false, 12), bar(0, cy_, cz + 0.045, 0, cy_ + 0.15, cz + 0.045, 0.025, IRON), bar(0, cy_, cz + 0.045, 0.1, cy_ - 0.05, cz + 0.045, 0.025, IRON));
  const pt = b0 + bh + 0.08 + 0.85;
  add(g, bar(0, pt - 0.05, tz, 0, pt + 0.7, tz, 0.035, GOLDD), bl(0.06, GOLD, 0, pt + 0.74, tz));
  const flag = G(rb(0.62, 0.34, 0.03, lit(own), 0.34, -0.17, 0, 0.015), bx(0.62, 0.05, 0.035, lit(GOLD), 0.34, -0.06, 0));
  flag.name = 'flag'; flag.position.set(0.02, pt + 0.66, tz);
  if (L >= 2) for (const s of [-1, 1]) add(g, bar(s * 0.95 - 0.12, 1.05, fz + 0.04, s * 0.95 + 0.12, 1.05, fz + 0.04, 0.03, GOLDD), rb(0.2, 0.62, 0.03, own, s * 0.95, 0.44, fz + 0.04, 0.012), bx(0.2, 0.03, 0.035, GOLD, s * 0.95, 0.83, fz + 0.04), bx(0.2, 0.03, 0.035, GOLD, s * 0.95, 0.47, fz + 0.04));
  bed(g, -0.85, 1.2, 2, 0.3, 0);
  if (L >= 2) add(g, place(window3(0.26, 0.26, { round: true, curt: '#fff2a0', frame: L === 3 ? GOLD : CREAM }), 0, ry0 + rise * 0.55, fz + 0.04));
  if (L >= 2) for (const s of [-1, 1]) { add(g, cyl(0.04, 0.05, 0.9, CREAM, s * 1.25, 0.14, 1.2, 6)); lantern(g, s * 1.25, 1.03, 1.2, 1.1, L === 3); }
  if (L >= 2) bunting(g, [-0.9, top - 0.06, fz + 0.32], [0.9, top - 0.06, fz + 0.32], 5, 0.14, 0.08, 0);
  const out = finish(g, pt + 0.95, [3.2, 3.2, 0.95]); out.add(flag); return out;
};

// ---------------------------------------------------------------- DECOR
BUILD.flowers = (info) => {
  const L = lv(info), id = info.id | 0, g = G();
  const sets = [[P.blossomDeep, P.butter, P.white], ['#c9a8ff', P.blossomDeep, P.butter], ['#ff7a8a', P.butter, P.white], ['#7fd4ff', P.white, P.blossomDeep]], cs = sets[id % sets.length];
  add(g, rb(0.88, 0.17, 0.88, '#fff3d6', 0, 0, 0, 0.08), bx(0.74, 0.1, 0.74, '#b88a62', 0, 0.1, 0));
  const r = K.rng(id + 7), n = [9, 13, 17][L - 1];
  for (const [x, z, k] of [[-0.2, -0.2, 0.17], [0.22, -0.18, 0.15], [-0.18, 0.22, 0.15], [0.2, 0.2, 0.17]]) add(g, bl(k, P.leafLight, x, 0.24, z, 0.75, x * 9));
  for (let i = 0; i < n; i++) { const a = i * 2.4 + r() * 0.5, d = 0.05 + r() * 0.3, h = 0.34 + r() * 0.12 + (L - 1) * 0.03; add(g, bl(0.085 + r() * 0.02, cs[i % cs.length], Math.cos(a) * d, h, Math.sin(a) * d, 0.85, i)); }
  if (L >= 2) add(g, bl(0.1, P.leafLight, 0, 0.36, 0, 0.7), bl(0.06, P.gold, 0, 0.47, 0));
  butterfly(g, 0.2, 0.7, 0.1, '#ffa6c9'); if (L >= 2) snail(g, -0.3, 0.17, 0.42, 0.5);
  if (L === 3) { for (const s of [-1, 1]) add(g, bx(0.05, 0.7, 0.05, TIM2, s * 0.38, 0.14, -0.36)); add(g, rb(0.9, 0.06, 0.06, GOLDD, 0, 0.84, -0.36, 0.025), sp(0.07, GOLD, 0, 0.92, -0.36)); for (let i = 0; i < 4; i++) add(g, bl(0.06, P.blossomDeep, -0.3 + i * 0.2, 0.78, -0.34)); }
  return finish(g, 0.9 + (L === 3 ? 0.1 : 0), [1.15, 1.15, 0.8]);
};
BUILD.lantern = (info) => {
  const L = lv(info), g = G();
  add(g, rb(0.46, 0.14, 0.46, STONE, 0, 0, 0, 0.06), cyl(0.07, 0.1, 0.3, STONEL, 0, 0.12, 0, 8), cyl(0.035, 0.05, 1.0 + (L - 1) * 0.12, L === 3 ? GOLDD : IRON, 0, 0.4, 0, 7));
  const top = 1.4 + (L - 1) * 0.12;
  add(g, rb(0.2, 0.04, 0.2, L === 3 ? GOLDD : IRON, 0, top - 0.02, 0, 0.015));
  add(g, K.cyl(0.1, 0.1, 0.24, null, 0, top, 0, { seg: 8, mat: lanternMat }), cone(0.18, 0.18, L === 3 ? GOLD : '#ff8fb5', 0, top + 0.24, 0, 8, 0), sp(0.04, GOLD, 0, top + 0.45, 0, { lo: true }));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(g, bx(0.025, 0.26, 0.025, L === 3 ? GOLDD : IRON, Math.sin(a) * 0.105, top, Math.cos(a) * 0.105)); }
  if (L >= 2) { add(g, bar(0, top - 0.3, 0, 0.26, top - 0.3, 0, 0.03, IRON), bar(0.26, top - 0.3, 0, 0.26, top - 0.36, 0, 0.012, CREAM)); lantern(g, 0.26, top - 0.5, 0, 0.8, L === 3); }
  if (L === 3) { add(g, bar(0, top - 0.3, 0, -0.26, top - 0.3, 0, 0.03, GOLDD)); lantern(g, -0.26, top - 0.5, 0, 0.8, true); }
  pot(g, 0.22, 0.14, 0.2, 0.9, P.blossomDeep); bed(g, -0.2, 0.2, 2, 0.2, 1); butterfly(g, -0.25, 0.7, 0.2, '#ffd24a');
  return finish(g, top + 0.55, [0.95, 0.95, 0.8]);
};
BUILD.fountain = (info) => {
  const L = lv(info), g = G();
  add(g, K.lathe([[0.001, 0], [0.84, 0], [0.9, 0.1], [0.9, 0.34], [0.78, 0.38], [0.78, 0.3]], STONEL, 0, 0, 0, { seg: 24 }));
  add(g, K.lathe([[0.74, 0.3], [0.74, 0.4], [0.88, 0.42], [0.95, 0.36], [0.93, 0.3]], '#fff6e8', 0, 0, 0, { seg: 24 }));
  add(g, cyl(0.78, 0.78, 0.03, waterMat, 0, 0.3, 0, 16));
  add(g, cyl(0.16, 0.22, 0.36, STONEL, 0, 0.3, 0, 8), K.lathe([[0.001, 0.62], [0.32, 0.7], [0.4, 0.82], [0.3, 0.8], [0.001, 0.7]], STONEL, 0, 0, 0, { seg: 20 }), cyl(0.09, 0.12, 0.3, STONEL, 0, 0.68, 0, 8));
  add(g, K.lathe([[0.001, 1.0], [0.2, 1.04], [0.26, 1.12], [0.19, 1.1], [0.001, 1.04]], STONEL, 0, 0, 0, { seg: 10 }), cyl(0.2, 0.2, 0.02, waterMat, 0, 0.76, 0, 12));
  add(g, sp(0.12, waterMat, 0, 1.16, 0, { sy: 1.3, lo: true }));
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; for (const [d, h, r] of [[0.28, 0.9, 0.04], [0.5, 0.82, 0.04], [0.68, 0.5, 0.035]]) add(g, sp(r, waterMat, Math.sin(a) * d * 0.9, h - 0.08 * (d > 0.6 ? 1 : 0), Math.cos(a) * d * 0.9, { lo: true })); }
  for (let i = 0; i < 3; i++) add(g, sp(0.14 - i * 0.02, '#ffffff', Math.sin(i * 2.1) * 0.5, 0.36, Math.cos(i * 2.1) * 0.5, { sy: 0.4, lo: true }));
  for (const [x, z] of [[-0.7, 0.4], [0.62, -0.5], [0.3, 0.74]]) add(g, bl(0.08, STONED, x, 0.4, z, 0.7, x * 3));
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.5; add(g, bl(0.07, P.leafLight, Math.sin(a) * 0.94, 0.4, Math.cos(a) * 0.94, 0.6), bl(0.045, [P.blossomDeep, P.butter, '#c9a8ff'][i], Math.sin(a) * 0.94, 0.46, Math.cos(a) * 0.94)); }
  if (L >= 2) { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(g, cyl(0.06, 0.07, 0.6, CREAM, Math.sin(a) * 0.95, 0.0, Math.cos(a) * 0.95, 7)); lantern(g, Math.sin(a) * 0.95, 0.6, Math.cos(a) * 0.95, 0.9, L === 3); } }
  if (L === 3) { add(g, sp(0.15, GOLD, 0, 1.4, 0, { sx: 1.3, sy: 0.8, lo: false }), bx(0.03, 0.2, 0.03, GOLDD, 0, 1.28, 0)); for (let i = 0; i < 4; i++) add(g, bl(0.1, P.blossomDeep, Math.sin(i * 1.57 + 0.8) * 0.85, 0.42, Math.cos(i * 1.57 + 0.8) * 0.85, 0.7)); }
  return finish(g, L === 3 ? 1.65 : 1.35, [2.2, 2.2, 0.8]);
};
BUILD.banner = (info) => {
  const L = lv(info), own = info.color || P.red, g = G(), ph = [1.45, 1.55, 1.7][L - 1], bw = [0.4, 0.44, 0.5][L - 1], bh = [0.7, 0.8, 0.92][L - 1];
  const metal = L === 3 ? GOLDD : TIM2;
  add(g, rb(0.5, 0.14, 0.5, STONE, 0, 0, 0, 0.06), cyl(0.12, 0.16, 0.2, STONEL, 0, 0.1, 0, 8), cyl(0.04, 0.05, ph, metal, 0, 0.2, 0, 6), sp(0.07, GOLD, 0, ph + 0.26, 0));
  add(g, lcyl('x', 0.025, bw + 0.24, L >= 2 ? GOLDD : TIM, 0, ph + 0.13, 0.0, 5), sp(0.035, GOLD, -(bw + 0.24) / 2, ph + 0.13, 0), sp(0.035, GOLD, (bw + 0.24) / 2, ph + 0.13, 0));
  const fl = G(), z = 0.05;
  fl.add(rb(bw, bh, 0.03, lit(own), 0, -bh, z, 0.012), bx(bw, 0.05, 0.035, lit(GOLD), 0, -0.07, z), star(bw * 0.28, lit(GOLD), 0, -bh * 0.55, z + 0.02));
  const tail = cone(bw / 2, 0.2, lit(own), 0, -bh - 0.2, z, 3, 0); tail.rotation.set(Math.PI, 0, 0); tail.scale.set(1, 1, 0.12); fl.add(tail);
  if (L >= 2) { fl.add(bx(bw, 0.035, 0.04, GOLD, 0, -bh + 0.04, z)); fl.add(sp(0.04, GOLD, -bw / 2, -bh - 0.05, z), sp(0.04, GOLD, bw / 2, -bh - 0.05, z)); }
  fl.name = 'flag'; fl.position.set(0, ph + 0.1, 0);
  if (L === 3) { lantern(g, 0.28, ph - 0.62, 0.0, 0.8, true); add(g, bar(0.0, ph - 0.28, 0, 0.28, ph - 0.28, 0, 0.03, GOLDD), bar(0.28, ph - 0.28, 0, 0.28, ph - 0.46, 0, 0.012, GOLDD)); }
  pot(g, 0.22, 0.14, 0.2, 0.9, P.butter); bed(g, -0.2, 0.2, 2, 0.2, 2); butterfly(g, 0.3, 0.7, 0.2, '#ffa6c9');
  const out = finish(g, ph + 0.45, [1.0, 1.0, 0.8]); out.add(fl); return out;
};

// ================================================================ FARM
const cropGreen = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, vertexColors: true }), cropGold = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, vertexColors: true }), cropEar = soft('#ffe27a', { emissive: '#7a5a10', emissiveIntensity: 0.15 });
cropGreen.color.set('#7ed957'); cropGold.color.set('#ffd65a'); cropGreen.emissive.set('#5fcf4a'); cropGreen.emissiveIntensity = 0.32; cropGold.emissive.set('#ffc83a'); cropGold.emissiveIntensity = 0.3;
for (const m of [cropGreen, cropGold, cropEar]) m.userData.special = true;
let _rowGeo = null, _earGeo = null;
function cropGeos() {
  if (_rowGeo) return;
  const bl_ = [], er = [], r = K.rng(5);
  const colorize = (gg, lo, hi, y0, y1) => { const p = gg.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const t = Math.max(0, Math.min(1, (p.getY(i) - y0) / (y1 - y0))), k = lo + (hi - lo) * t; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; } gg.setAttribute('color', new THREE.BufferAttribute(c, 3)); return gg; };
  const N = 7;
  for (let i = 0; i < N; i++) {
    const cx = -1.2 + i * 0.4;
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + i, lean = 0.22, h = 0.34 + r() * 0.08, g1 = new THREE.ConeGeometry(0.05, h, 4, 1, true); g1.translate(0, h / 2, 0);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(cx + Math.sin(a) * 0.04, 0, Math.cos(a) * 0.04), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * lean, 0, -Math.sin(a) * lean)), new THREE.Vector3(1, 1, 1));
      g1.applyMatrix4(m); bl_.push(colorize(g1, 0.75, 1.1, 0, 0.4));
      const e = new THREE.ConeGeometry(0.036, 0.15, 5, 1, true); e.translate(0, 0.075, 0); const q = new THREE.Matrix4().compose(new THREE.Vector3(cx + Math.sin(a) * 0.04 + Math.sin(a) * 0.075, h * 0.88, Math.cos(a) * 0.04 + Math.cos(a) * 0.0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5)), new THREE.Vector3(1, 1, 1)); e.applyMatrix4(q); er.push(e);
    }
  }
  _rowGeo = mergeGeometries(bl_.map((x) => x.toNonIndexed()), false); _earGeo = mergeGeometries(er.map((x) => x.toNonIndexed()), false);
}
const SOIL = '#dfa676', SOILD = '#cd9164';
export function farmModel(info) {
  cropGeos(); const g = G();
  add(g, rb(2.9, 0.12, 1.9, SOIL, 0, 0, 0, 0.06), rb(2.76, 0.07, 1.76, SOILD, 0, 0.1, 0, 0.04));
  const rowsZ = [-0.66, -0.22, 0.22, 0.66];
  for (const z of rowsZ) add(g, rb(2.6, 0.1, 0.22, SOIL, 0, 0.14, z, 0.05), bx(2.55, 0.01, 0.05, SOILD, 0, 0.14, z + 0.17));
  const fc = CREAM, fx = 1.4, fz = 0.92, post = (x, z) => add(g, rb(0.08, 0.3, 0.08, fc, x, 0.08, z, 0.03), sp(0.05, fc, x, 0.4, z, { lo: true }));
  for (let i = 0; i <= 6; i++) { const x = -fx + i * (2 * fx / 6); post(x, -fz); if (Math.abs(x) > 0.3) post(x, fz); }
  for (const z of [-0.5, 0, 0.5]) { if (z === 0) { post(-fx, 0); post(fx, 0); } else { post(-fx, z * 1.8); post(fx, z * 1.8); } }
  for (const y of [0.17, 0.3]) {
    add(g, rb(2.86, 0.045, 0.04, fc, 0, y, -fz, 0.015), rb(1.08, 0.045, 0.04, fc, -0.88 - 0.0, y, fz, 0.015), rb(1.08, 0.045, 0.04, fc, 0.88, y, fz, 0.015), rb(0.04, 0.045, 1.84, fc, -fx, y, 0, 0.015), rb(0.04, 0.045, 1.84, fc, fx, y, 0, 0.015));
  }
  add(g, bx(0.08, 0.34, 0.08, TIM, -0.34, 0.08, fz), bx(0.08, 0.34, 0.08, TIM, 0.34, 0.08, fz));
  const sx = 1.0, sz = -0.6;
  add(g, bx(0.05, 0.62, 0.05, TIM2, sx, 0.12, sz), lcyl('x', 0.025, 0.56, TIM2, sx, 0.52, sz, 5), rb(0.2, 0.26, 0.14, '#7fd4ff', sx, 0.33, sz, 0.05), sp(0.1, '#fff0c8', sx, 0.74, sz, { lo: true }), cyl(0.15, 0.15, 0.02, P.thatch, sx, 0.8, sz, 8), cone(0.09, 0.14, '#ff7a8a', sx, 0.81, sz, 8, 0));
  for (const s of [-1, 1]) add(g, bl(0.05, P.thatch, sx + s * 0.3, 0.52, sz, 0.8), bl(0.045, P.thatch, sx + s * 0.1, 0.3, sz + 0.0, 0.8));
  add(g, bx(0.025, 0.025, 0.02, DEEP, sx - 0.035, 0.76, sz + 0.095), bx(0.025, 0.025, 0.02, DEEP, sx + 0.035, 0.76, sz + 0.095));
  for (const [x, c] of [[-1.3, P.blossomDeep], [-1.1, P.butter], [1.3, '#c9a8ff']]) add(g, bl(0.07, P.leafLight, x, 0.2, fz + 0.15, 0.7), bl(0.045, c, x, 0.28, fz + 0.15));
  butterfly(g, -0.6, 0.8, 1.0, '#ffa6c9');
  const crops = new THREE.Group(); crops.name = 'crops';
  rowsZ.forEach((z, i) => { const row = new THREE.Mesh(_rowGeo, cropGreen); row.position.set(0, 0.2, z); row.castShadow = true; row.userData.keep = true; row.rotation.y = i * 0.2; const ears = new THREE.Mesh(_earGeo, cropEar); ears.visible = false; row.add(ears); row.userData.ears = ears; crops.add(row); });
  const base = finish(g, 1.1, [3.2, 2.2, 0.8]);
  base.add(crops); base.userData.crops = crops; setFarmStage(base, 'empty', 0);
  return base;
}
/** stage 'empty' | 'grow' | 'ripe', crop 0..1. no allocation. Works for the wheat field and the orchard (canopies swell, fruit appears). */
export function setFarmStage(group, stage, crop) {
  const crops = group.userData.crops || (group.userData.crops = group.getObjectByName('crops')); if (!crops) return;
  const orch = group.userData.orchard;
  if (orch) {
    const ripe = stage === 'ripe', c = ripe ? 1 : Math.max(0, Math.min(1, crop || 0)), s = stage === 'empty' ? 0.34 : ripe ? 1.04 : 0.5 + 0.5 * c;
    crops.visible = true;
    for (let i = 0; i < orch.length; i++) { const o = orch[i]; o.T.scale.setScalar(s); o.fr.visible = ripe || (stage === 'grow' && c > 0.6); o.fr.scale.setScalar(ripe ? 1.1 : 0.6 + 0.4 * c); }
    return;
  }
  const kids = crops.children;
  if (stage === 'empty') { crops.visible = false; return; }
  crops.visible = true; const ripe = stage === 'ripe', c = ripe ? 1 : Math.max(0, Math.min(1, crop || 0));
  const sy = ripe ? 1.22 : 0.28 + 0.7 * c, sxz = ripe ? 1.1 : 0.55 + 0.45 * c;
  for (let i = 0; i < kids.length; i++) { const r = kids[i]; r.material = ripe ? cropGold : cropGreen; r.scale.set(sxz, sy * (1 + (i & 1) * 0.05), sxz); r.userData.ears.visible = ripe; }
}

// ================================================================ CONSTRUCTION SITE
export function constructionSite(w = 2, h = 2) {
  const g = G(), hx = w / 2 - 0.12, hz = h / 2 - 0.12, ph = 1.15;
  add(g, rb(w - 0.1, 0.09, h - 0.1, SOIL, 0, 0, 0, 0.05), rb(w - 0.35, 0.05, h - 0.35, SOILD, 0, 0.08, 0, 0.03));
  for (const s of [-1, 1]) { add(g, rb(w - 0.5, 0.2, 0.2, STONE, 0, 0.1, s * (hz - 0.12), 0.07)); }
  add(g, rb(0.2, 0.2, h - 0.8, STONE, -(hx - 0.12), 0.1, 0, 0.07)); add(g, rb(0.2, 0.14, h - 0.8, STONEL, hx - 0.12, 0.1, 0, 0.06));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, rb(0.1, ph, 0.1, CREAM, sx * hx, 0.06, sz * hz, 0.04));
  for (const y of [0.6, ph - 0.02]) { for (const sz of [-1, 1]) add(g, bx(2 * hx, 0.07, 0.07, WOOD, 0, y, sz * hz)); for (const sx of [-1, 1]) add(g, bx(0.07, 0.07, 2 * hz, WOOD, sx * hx, y, 0)); }
  add(g, bar(-hx, 0.1, hz, hx, ph - 0.02, hz, 0.05, TIM), bar(hx, 0.1, hz, -hx, 0.6, hz, 0.04, TIM2), bar(hx, 0.1, -hz, hx, ph - 0.02, hz * 0.2, 0.05, TIM));
  for (let i = 0; i < 5; i++) add(g, rb(0.16, 0.04, Math.min(h - 0.5, 1.0), i % 2 ? WOODL : PLANK, -hx * 0.7 + i * 0.18, 0.62, -hz * 0.35, 0.012));
  const tarp = rb(hx * 1.0, 0.04, 2 * hz * 0.7, '#ffc2d8', 0, 0, 0, 0.015); const tp = G(tarp); tp.position.set(hx * 0.45, ph - 0.05, 0.0); tp.rotation.z = -0.45; g.add(tp);
  for (let i = 0; i < 5; i++) add(g, rb(0.55, 0.05, 0.26, i % 2 ? WOODL : PLANK, -hx + 0.34, 0.09 + i * 0.065, hz - 0.5 + (i % 2) * 0.03, 0.015));
  barrel(g, hx - 0.25, hz - 0.35, WOOD, 1.0, 0.09);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3 - r; c++) add(g, rb(0.18, 0.08, 0.1, CHIM, hx - 0.6 + c * 0.2 + r * 0.1, 0.09 + r * 0.085, -hz + 0.5, 0.02));
  add(g, rb(0.5, 0.05, 0.1, WOODL, 0.1, 0.34, hz - 0.35, 0.015), bar(-0.1, 0.09, hz - 0.28, -0.05, 0.36, hz - 0.35, 0.04, TIM), bar(0.3, 0.09, hz - 0.28, 0.25, 0.36, hz - 0.35, 0.04, TIM));
  for (const s of [-1, 1]) add(g, bar(-hx - 0.05, 0.08, s * 0.12 + 0.2, -hx - 0.05 + 0.0, ph - 0.1, s * 0.12 + 0.05, 0.04, TIM2));
  for (let i = 0; i < 5; i++) add(g, bx(0.04, 0.035, 0.28, WOODL, -hx - 0.05, 0.2 + i * 0.18, 0.12));
  bunting(g, [-hx, ph + 0.02, hz + 0.02], [hx, ph + 0.02, hz + 0.02], 8, 0.1, 0.07, 2);
  add(g, bar(hx, ph, -hz, hx, ph + 0.45, -hz, 0.03, TIM2), rb(0.22, 0.14, 0.02, P.gold, hx + 0.12, ph + 0.28, -hz, 0.01));
  add(g, bar(-hx, ph, -hz, -hx, ph + 0.45, -hz, 0.03, TIM2), rb(0.22, 0.14, 0.02, '#ff8fb5', -hx + 0.12, ph + 0.28, -hz, 0.01));
  cat(g, hx - 0.1, 0.09, -hz + 0.2, '#ffc890', -0.6); bed(g, 0.0, hz + 0.02, 3, 0.4, 1);
  return finish(g, ph + 0.5, [w + 0.2, h + 0.2, 0.9]);
}

//@@NEW
// ================================================================ ROUND 3 helpers (farm life, shops, waterside)
const pkG = new Map();
/** flat pointed picket facing +z (centre x, bottom y) */
function pk(w, h, c, x, y, z, ry = 0) {
  const k = w.toFixed(3) + ',' + h.toFixed(3); let g = pkG.get(k);
  if (!g) { const s_ = new THREE.Shape([[-w / 2, 0], [w / 2, 0], [w / 2, h * 0.78], [0, h], [-w / 2, h * 0.78]].map(([a, b]) => new THREE.Vector2(a, b))); g = new THREE.ShapeGeometry(s_); pkG.set(k, g); }
  const m = new THREE.Mesh(g, col(c)); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = false; m.receiveShadow = true; return m;
}
/** picket fence from a to b (any direction): round posts, flat pointed pickets, two rails. gaps = [[t0,t1]] fractions left open (gates) */
function fence(g, ax, az, bx_, bz, o = {}) {
  const { h = 0.3, c = CREAM, gap = 0.2, gaps = [], posts = 0.7 } = o, dx = bx_ - ax, dz = bz - az, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
  const open = (t) => gaps.some(([a, b]) => t > a - 1e-6 && t < b + 1e-6), pt = (t) => [ax + dx * t, az + dz * t];
  const n = Math.max(2, Math.round(len / gap)); let run = null; const runs = [];
  for (let i = 0; i <= n; i++) { const t = i / n; if (open(t)) { run = null; continue; } const [x, z] = pt(t); add(g, pk(gap * 0.72, h, c, x, 0.04, z, ry)); if (!run) { run = [t, t]; runs.push(run); } run[1] = t; }
  for (const [t0, t1] of runs) { const [x0, z0] = pt(t0), [x1, z1] = pt(t1); if (t1 - t0 > 0.02) for (const y of [0.12, 0.23]) add(g, bar(x0, y, z0, x1, y, z1, 0.03, shade(c, -0.04))); }
  const np = Math.max(1, Math.round(len / posts));
  for (let i = 0; i <= np; i++) { const t = i / np; if (open(t)) continue; const [x, z] = pt(t); add(g, bx(0.07, h + 0.06, 0.07, c, x, 0, z)); }
}
function hen(g, x, z, c = '#fffaf0', ry = 0, s = 1, y = 0) {
  const k = new THREE.Group(), q = (o) => ({ q: 0, ...o });
  add(k, sp(0.095, c, 0, 0.1, 0, { sy: 0.88, sz: 1.2, q: 1 }), sp(0.06, c, 0, 0.21, 0.085, q()), sp(0.04, '#ff6b6b', 0, 0.27, 0.09, q({ sx: 0.5 })), cone(0.024, 0.06, '#ffb23c', 0, 0.2, 0.15, 4, 0), sp(0.045, c, 0, 0.17, -0.13, q({ sy: 1.4 })), fdisc(0.012, DEEP, -0.05, 0.225, 0.135, -1.2, false, 5), fdisc(0.012, DEEP, 0.05, 0.225, 0.135, 1.2, false, 5), sp(0.04, shade(c, -0.08), -0.09, 0.11, 0.0, q({ sx: 0.5, sz: 1.2 })), sp(0.04, shade(c, -0.08), 0.09, 0.11, 0.0, q({ sx: 0.5, sz: 1.2 })));
  k.scale.setScalar(s); return add(g, place(k, x, y, z, ry));
}
function egg(g, x, y, z, c = '#fffdf4', s = 1) { return add(g, sp(0.036 * s, c, x, y + 0.04 * s, z, { sy: 1.3 })); }
/** round hay bale lying on its side (axis x or z), straw texture and two bands */
function hayBale(g, x, y, z, r = 0.2, len = 0.34, axis = 'x') {
  const m = lcyl(axis, r, len, '#ffe27a', x, y + r, z, 10); m.userData.kind = 7; add(g, m);
  for (const d of [-0.26, 0.26]) { const b = ring(r * 1.012, 0.024, '#e8b24a', 0, 0, 0, 10); b.rotation.set(axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0); b.position.set(axis === 'x' ? x + d * len : x, y + r, axis === 'z' ? z + d * len : z); add(g, b); }
}
function churn(g, x, z, c = '#d6e8ff', y = 0, s = 1) {
  add(g, K.lathe([[0.001, 0], [0.09 * s, 0], [0.1 * s, 0.1 * s], [0.072 * s, 0.26 * s], [0.06 * s, 0.3 * s], [0.001, 0.31 * s]], c, x, y, z, { seg: 8 }), ring(0.102 * s, 0.03 * s, shade(c, -0.16), x, y + 0.1 * s, z, 8), qd(0.07 * s, 0.03 * s, shade(c, -0.25), x + 0.1 * s, y + 0.2 * s, z, Math.PI / 2));
}
function bucket(g, x, z, c = '#ffd24a', y = 0, s = 1, fill = null) {
  add(g, K.lathe([[0.001, 0], [0.07 * s, 0], [0.095 * s, 0.17 * s], [0.085 * s, 0.17 * s]], c, x, y, z, { seg: 8 }), ring(0.096 * s, 0.02 * s, shade(c, -0.15), x, y + 0.12 * s, z, 8));
  if (fill) add(g, disc(0.085 * s, fill, x, y + 0.15 * s, z, 8));
}
function fish(g, x, y, z, ry = 0, c = '#8fd0ff', s = 1) {
  const k = new THREE.Group(), t = cone(0.04, 0.08, shade(c, -0.12), 0, 0, -0.13, 3, 0); t.rotation.x = Math.PI / 2; t.position.set(0, 0, -0.13);
  add(k, sp(0.07, c, 0, 0, 0, { sx: 0.5, sy: 0.6, sz: 1.5 }), t, fdisc(0.012, DEEP, 0.036, 0.014, 0.07, Math.PI / 2, false, 5), fdisc(0.012, DEEP, -0.036, 0.014, 0.07, -Math.PI / 2, false, 5)); k.scale.setScalar(s);
  return add(g, place(k, x, y, z, ry));
}
function jar(g, x, y, z, c = '#ff6b8a', s = 1) { add(g, cyl(0.045 * s, 0.045 * s, 0.1 * s, c, x, y, z, 6), cyl(0.047 * s, 0.047 * s, 0.025 * s, '#fffaf0', x, y + 0.1 * s, z, 6)); }
function cheese(g, x, y, z, r = 0.2, h = 0.12, ry = 0) {
  const k = new THREE.Group();
  add(k, cyl(r, r, h, '#ffd85a', 0, 0, 0, 14), ring(r * 1.005, h * 0.16, '#ffc23a', 0, h * 0.42, 0, 14));
  for (let i = 0; i < 2; i++) { const a = i * 2.6 + 0.4, d = r * (0.3 + 0.2 * (i % 2)); const f = fdisc(r * 0.13, '#f2b23a', Math.cos(a) * d, h + 0.003, Math.sin(a) * d, 0, false, 6); f.rotation.set(-Math.PI / 2, 0, 0); add(k, f); }
  return add(g, place(k, x, y, z, ry));
}
/** striped sloped awning over a front, from (x0..x1) at height hy hanging out to z1; stripes alternate c1/c2; scalloped valance */
function awning(g, x0, x1, hy, zWall, out, drop, c1, c2, n = 8, o = {}) {
  const w = x1 - x0, sw = w / n, a = Math.atan2(drop, out), Ls = Math.hypot(out, drop) + 0.02;
  for (let i = 0; i < n; i++) {
    const c = i % 2 ? c2 : c1, pv = G(rb(sw - 0.004, 0.1, Ls, c, 0, -0.1, 0, 0.04)); pv.children[0].userData.kind = o.kind ?? 0; pv.position.set(x0 + sw * (i + 0.5), hy, zWall + out / 2); pv.rotation.x = a; g.add(pv);
    const d = fdisc(sw / 2 * 0.99, c, x0 + sw * (i + 0.5), hy - drop - 0.095, zWall + out + 0.005, 0, true, 8); d.rotation.z = Math.PI; add(g, d);
  }
  add(g, lcyl('x', 0.026, w + 0.02, shade(c1, -0.1), (x0 + x1) / 2, hy - drop - 0.01, zWall + out, 6), bar(x0 + 0.02, hy, zWall, x0 + 0.02, hy - drop - 0.1, zWall + out, 0.03, IRON), bar(x1 - 0.02, hy, zWall, x1 - 0.02, hy - drop - 0.1, zWall + out, 0.03, IRON));
}
/** round pie, lying (y = base), with lattice crust; r radius */
function pie(g, x, y, z, r = 0.3, tilt = 0, c = '#f2b266', fillc = '#ff5f7f', lattice = true) {
  const k = new THREE.Group(), seg = r > 0.2 ? 16 : 10;
  add(k, cyl(r, r * 0.86, r * 0.3, c, 0, 0, 0, seg), disc(r * 0.88, fillc, 0, r * 0.31, 0, seg), ring(r * 1.01, r * 0.1, shade(c, 0.2), 0, r * 0.22, 0, seg));
  if (lattice) for (const a of [0.0, 0.8, 1.6, 2.4, -0.8]) { const m = qd(r * 1.7, r * 0.12, '#f9d08a', 0, r * 0.325, 0); m.rotation.set(-Math.PI / 2, 0, a); add(k, m); }
  k.rotation.x = tilt; return add(g, place(k, x, y, z, 0));
}
function gambrel(g, o) {
  const { x = 0, y = 0, z = 0, hw, kz, kh, rise, len, t = 0.12, col: rc, ridgeCol, wd, base, fillCol } = o, R = new THREE.Group(); R.position.set(x, y, z); R.rotation.y = Math.PI / 2;
  const roll = shade(rc, 0.1), rcol = ridgeCol || shade(rc, 0.22);
  for (const s of [1, -1]) for (const [z1, y1, z2, y2] of [[hw, 0, kz, kh], [kz, kh, 0, rise]]) {
    const dz = (z2 - z1) * s, dy = y2 - y1, L2 = Math.hypot(dz, dy) + 0.05, pv = new THREE.Group(); pv.position.set(0, (y1 + y2) / 2, s * (z1 + z2) / 2); pv.rotation.x = -Math.atan2(dy, dz);
    const slab = rb(len, t, L2, rc, 0, -t, 0, 0.05); slab.userData.kind = 2; slab.userData.axis = 2; pv.add(slab); R.add(pv);
  }
  for (const s of [1, -1]) R.add(lcyl('x', t * 0.6, len, roll, 0, -t * 0.4, s * hw, 8), lcyl('x', 0.045, len - 0.04, shade(rc, 0.16), 0, kh - 0.03, s * kz, 6));
  R.add(lcyl('x', 0.065, len + 0.02, rcol, 0, rise + 0.01, 0, 8), sp(0.08, rcol, len / 2 + 0.01, rise + 0.01, 0, { q: 1 }), sp(0.08, rcol, -len / 2 - 0.01, rise + 0.01, 0, { q: 1 }));
  if (wd) { const y1 = (hw - wd / 2) * kh / (hw - kz) - t * 0.9, hh = wd / 2, dx = len - 0.3, f = poly([[-hh, base], [hh, base], [hh, y1], [kz, kh - t * 0.9], [0, rise - t * 1.2], [-kz, kh - t * 0.9], [-hh, y1]], dx, fillCol, 0, 0, 0, Math.PI / 2); f.userData.kind = 6; f.userData.axis = 1; R.add(f); }
  g.add(R); return R;
}

// ---------------------------------------------------------------- HENHOUSE (2x2): raised coop, ramp, nest box, fenced run, two hens
BUILD.coop = (info) => {
  const L = lv(info), id = info.id | 0, g = G(), own = info.color || P.red, wallC = '#ffe98a', rc = '#ff9a8a', hx = -0.34, hz = -0.38, W = 1.1, D = 0.88, H = 0.62, y0 = 0.22;
  const flr = bx(1.9, 0.04, 1.0, '#f7e4aa', 0, 0, 0.5); flr.userData.kind = 7; add(g, flr);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cyl(0.05, 0.06, y0 + 0.02, TIM2, hx + sx * (W / 2 - 0.08), 0, hz + sz * (D / 2 - 0.08), 6));
  const wall = rb(W, H, D, wallC, hx, y0, hz, 0.1); wall.userData.kind = 1; add(g, wall, rb(W + 0.08, 0.05, D + 0.08, TIM, hx, y0 - 0.03, hz, 0.02));
  const ry0 = y0 + H + 0.05, rise = [0.46, 0.52, 0.6][L - 1];
  roof(g, { x: hx, y: ry0, z: hz, span: W + 0.36, len: D + 0.3, rise, col: rc, along: 'z', ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: W, base: -0.07, ovg: 0.15 } });
  const fz = hz + D / 2;
  add(g, place(door3(0.2, 0.34, own, { gold: L === 3 }), hx + 0.24, y0 + 0.03, fz + 0.005));
  const rp = G(); add(rp, bx(0.24, 0.04, 0.74, WOODL, 0, 0, 0)); for (let i = 0; i < 5; i++) add(rp, bx(0.22, 0.03, 0.035, TIM2, 0, 0.04, -0.3 + i * 0.15)); rp.position.set(hx + 0.24, y0 - 0.17, fz + 0.62); rp.rotation.x = 0.255; g.add(rp);
  add(g, place(window3(0.17, 0.22, { curt: CURT[id % 5], box: true, flowers: [P.blossomDeep, P.butter, P.white] }), hx - 0.26, y0 + 0.4, fz + 0.015));
  const nb = hx + W / 2 + 0.19;
  add(g, rb(0.36, 0.3, 0.5, '#fff1b8', nb, y0 + 0.02, hz - 0.02, 0.06), fdisc(0.06, DEEP, nb, y0 + 0.17, hz + 0.235, 0, false, 10), fdisc(0.075, CREAM, nb, y0 + 0.17, hz + 0.232, 0, false, 10), fdisc(0.06, DEEP, nb + 0.185, y0 + 0.17, hz - 0.02, Math.PI / 2, false, 10), fdisc(0.075, CREAM, nb + 0.183, y0 + 0.17, hz - 0.02, Math.PI / 2, false, 10));
  const lid = G(rb(0.46, 0.05, 0.6, rc, 0, -0.02, 0, 0.02), lcyl('z', 0.03, 0.6, shade(rc, 0.12), 0.23, -0.01, 0, 6)); lid.position.set(nb - 0.02, y0 + 0.38, hz - 0.02); lid.rotation.z = -0.22; g.add(lid);
  bl(0.06, '#ffe27a', 0, 0, 0); add(g, bl(0.08, '#ffe27a', nb, y0 + 0.2, hz + 0.19, 0.6)); egg(g, nb + 0.06, y0 + 0.2, hz + 0.2);
  for (const sx of [-1, 1]) add(g, cyl(0.04, 0.05, 0.22, TIM2, nb + sx * 0.14, 0, hz + 0.18, 6));
  fence(g, -0.95, 0.02, -0.95, 0.96, { h: 0.28 }); fence(g, -0.95, 0.96, 0.95, 0.96, { h: 0.28, gaps: [[0.42, 0.58]] }); fence(g, 0.95, 0.96, 0.95, -0.12, { h: 0.28 });
  for (const sx of [-1, 1]) add(g, rb(0.08, 0.42, 0.08, TIM2, sx * 0.17, 0, 0.96, 0.03), sp(0.06, GOLD, sx * 0.17, 0.46, 0.96));
  hen(g, -0.5, 0.58, '#fffaf0', 0.5, 1.5, 0.03); hen(g, 0.4, 0.7, '#ffcf8a', -0.9, 1.4, 0.03);
  add(g, cyl(0.085, 0.07, 0.05, '#ff9fbd', 0.1, 0.03, 0.42, 8), disc(0.07, '#ffe9a8', 0.1, 0.08, 0.42, 8));
  add(g, cyl(0.075, 0.06, 0.045, '#8fd0ff', 0.62, 0.03, 0.5, 8), disc(0.063, waterMat, 0.62, 0.076, 0.5, 8));
  add(g, K.lathe([[0.001, 0], [0.09, 0], [0.12, 0.09], [0.1, 0.1]], '#e8c07a', -0.12, 0.03, 0.78, { seg: 8 })); egg(g, -0.14, 0.1, 0.78); egg(g, -0.08, 0.1, 0.8, '#ffe4c8'); egg(g, -0.1, 0.1, 0.74);
  bed(g, -0.78, 0.86, 2, 0.2, id); bed(g, 0.8, 0.86, 2, 0.2, id + 2); butterfly(g, 0.1, 0.7, 0.3, '#ffa6c9', 0.4);
  if (L >= 2) { hayBale(g, 0.72, 0.03, 0.22, 0.14, 0.22, 'x'); add(g, rb(0.07, 0.5, 0.07, TIM2, -1.0, 0, 0.99, 0.03), sp(0.1, '#fff6d0', -1.0, 0.6, 0.99, { sy: 1.25, sx: 0.8, q: 1 })); bunting(g, [-0.95, 0.5, 0.97], [0.95, 0.5, 0.97], 8, 0.1, 0.06, id); pot(g, hx + 0.52, 0.0, fz + 0.2, 0.9, P.butter); }
  if (L >= 3) { hen(g, 0.0, 0.8, '#ffe0ea', 0.2, 1.25, 0.03); vane(g, hx, ry0 + rise + 0.03, hz, 0.75); lantern(g, 0.17, 0.46, 0.96, 0.8, true); }
  return finish(g, ry0 + rise + (L === 3 ? 0.55 : 0.15), [2.2, 2.2, 0.9]);
};

// ---------------------------------------------------------------- BARN (3x2): gambrel roof, hay loft, sliding `door`, paddock, cow sign
function cowHead(g, x, y, z, s = 1, ry = 0) {
  const k = new THREE.Group(), W_ = '#fffaf0', SP = '#9a8bd0';
  add(k, fdisc(0.23, '#ffe3a0', 0, 0.0, -0.1, 0, false, 14), ring(0.235, 0.05, TIM2, 0, 0, -0.12, 14), sp(0.15, W_, 0, 0, 0, { sy: 0.9, sz: 0.8 }), sp(0.085, '#ffb6c8', 0, -0.07, 0.1, { sy: 0.7, sz: 0.7 }), sp(0.055, W_, -0.18, 0.05, 0, { sx: 0.5, sy: 0.6, sz: 0.6 }), sp(0.055, W_, 0.18, 0.05, 0, { sx: 0.5, sy: 0.6, sz: 0.6 }), sp(0.058, SP, -0.07, 0.1, 0.07, { sy: 0.7, sz: 0.5 }),
    sp(0.04, '#fff0b0', -0.07, 0.17, 0.0, { sx: 0.5, sy: 1.2, sz: 0.5 }), sp(0.04, '#fff0b0', 0.07, 0.17, 0.0, { sx: 0.5, sy: 1.2, sz: 0.5 }), fdisc(0.02, DEEP, -0.06, 0.02, 0.118, 0, false, 6), fdisc(0.02, DEEP, 0.06, 0.02, 0.118, 0, false, 6), fdisc(0.012, DEEP, -0.03, -0.08, 0.172, 0, false, 5), fdisc(0.012, DEEP, 0.03, -0.08, 0.172, 0, false, 5));
  k.scale.setScalar(s); return add(g, place(k, x, y, z, ry));
}
BUILD.barn = (info) => {
  const L = lv(info), id = info.id | 0, g = G(), own = info.color || P.red, RED = '#ff8f86', RC = '#8fa6f5', W = 1.26, D = 1.55, H = 0.74, bx0 = -0.78, bz = -0.15, FOUND = 0.12;
  const top = shell(g, W, D, H, RED, { x: bx0, z: bz, found: FOUND, kind: 6, axis: 1, trim: L === 3 ? '#fff0b0' : CREAM });
  const ry0 = top + 0.05, rise = [0.74, 0.8, 0.88][L - 1], fz = bz + D / 2;
  gambrel(g, { x: bx0, y: ry0, z: bz, hw: W / 2 + 0.16, kz: 0.34, kh: 0.4, rise, len: D + 0.2, col: RC, ridgeCol: L === 3 ? GOLD : null, wd: W, base: -0.07, fillCol: RED });
  const gz = fz + 0.025;
  // main doors: static leaf + sliding `door`
  add(g, bx(0.9, 0.62, 0.05, CREAM, bx0, FOUND, gz - 0.01), rb(0.4, 0.55, 0.05, '#ff7d73', bx0 - 0.21, FOUND + 0.02, gz + 0.03, 0.02));
  const xb = (u, x0, y0_, w, h) => { add(u, bar(x0 - w / 2 + 0.03, y0_ + 0.03, 0.04, x0 + w / 2 - 0.03, y0_ + h - 0.03, 0.04, 0.03, CREAM), bar(x0 + w / 2 - 0.03, y0_ + 0.03, 0.04, x0 - w / 2 + 0.03, y0_ + h - 0.03, 0.04, 0.03, CREAM), bx(w - 0.04, 0.03, 0.04, CREAM, x0, y0_ + 0.02, 0.04), bx(w - 0.04, 0.03, 0.04, CREAM, x0, y0_ + h - 0.05, 0.04), bx(0.03, h - 0.04, 0.04, CREAM, x0 - w / 2 + 0.03, y0_ + 0.02, 0.04), bx(0.03, h - 0.04, 0.04, CREAM, x0 + w / 2 - 0.03, y0_ + 0.02, 0.04)); };
  const sl = G(); sl.name = 'door'; const dl = rb(0.4, 0.55, 0.05, '#ff7d73', 0, 0, 0, 0.02); add(sl, dl); xb(sl, 0, 0, 0.4, 0.55); sl.position.set(bx0 + 0.21, FOUND + 0.02, gz + 0.075); g.add(sl);
  const lf = G(); xb(lf, bx0 - 0.21, FOUND + 0.02, 0.4, 0.55); lf.position.z = gz + 0.06; g.add(lf);
  add(g, bx(0.96, 0.04, 0.045, IRON, bx0, FOUND + 0.66, gz + 0.1), cyl(0.035, 0.035, 0.04, GOLDD, bx0 - 0.4, FOUND + 0.645, gz + 0.1, 8));
  // hay loft in the gable
  const ly = top + 0.04;
  add(g, bx(0.4, 0.3, 0.05, CREAM, bx0, ly, gz - 0.005)); const hy = bx(0.32, 0.22, 0.05, '#ffe27a', bx0, ly + 0.04, gz + 0.02); hy.userData.kind = 7; add(g, hy);
  for (const s of [-1, 1]) { const lp = G(rb(0.15, 0.22, 0.03, '#ff7d73', 0, 0.11, 0, 0.012), bx(0.13, 0.025, 0.03, CREAM, 0, 0.1, 0.02)); lp.position.set(bx0 + s * 0.26, ly + 0.04, gz + 0.04); lp.rotation.y = s * 1.1; g.add(lp); }
  const by = ly + 0.5; add(g, bar(bx0, by, gz - 0.06, bx0, by + 0.02, gz + 0.42, 0.045, TIM2), sp(0.035, IRON, bx0, by - 0.03, gz + 0.38, { q: 0 }), bar(bx0, by - 0.03, gz + 0.38, bx0, by - 0.2, gz + 0.38, 0.012, CREAM)); hayBale(g, bx0, by - 0.4, gz + 0.38, 0.09, 0.15, 'x');
  add(g, place(window3(0.2, 0.2, { round: true, curt: CURT[id % 5] }), bx0, by + 0.07, gz + 0.01));
  for (const s of [-1, 1]) add(g, place(window3(0.18, 0.18, { round: true, curt: CURT[(id + 1) % 5] }), bx0 + W / 2 + 0.005, FOUND + 0.42, bz + s * 0.4, Math.PI / 2));
  // cupola + weathervane on the ridge
  const cy = ry0 + rise, cz = bz - 0.2;
  add(g, rb(0.24, 0.2, 0.24, '#fff3e0', bx0, cy - 0.02, cz, 0.06), cone(0.22, 0.2, L === 3 ? GOLD : RC, bx0, cy + 0.18, cz, 8, 0), fdisc(0.055, windowMat, bx0, cy + 0.08, cz + 0.123, 0, false, 8)); vane(g, bx0, cy + 0.36, cz, 0.9);
  // paddock
  const fc = '#fff4de'; fence(g, 0.0, 0.9, 1.42, 0.9, { h: 0.3, gaps: [[0.4, 0.6]], c: fc }); fence(g, 1.42, 0.9, 1.42, -0.9, { h: 0.3, c: fc }); fence(g, 1.42, -0.9, 0.0, -0.9, { h: 0.3, c: fc });
  const dirt = bx(1.4, 0.03, 1.8, '#f3dfa8', 0.72, 0, 0.0); dirt.userData.kind = 7; add(g, dirt);
  hayBale(g, 0.36, 0.03, -0.5, 0.2, 0.34, 'z'); hayBale(g, 0.36, 0.03, -0.1, 0.17, 0.3, 'z');
  add(g, rb(0.2, 0.15, 0.62, TIM, 1.1, 0.0, -0.2, 0.05), disc(0.1, waterMat, 1.1, 0.145, -0.2, 8)); g.children[g.children.length - 1].scale.set(0.9, 1, 2.6);
  add(g, rb(0.07, 0.62, 0.07, TIM2, 0.95, 0, 0.58, 0.03)); cowHead(g, 0.95, 0.74, 0.6, 1.1, -0.1);
  bed(g, 0.5, 0.95, 3, 0.35, id); bed(g, 1.15, 0.95, 2, 0.2, id + 1); butterfly(g, 0.8, 0.9, 0.4, '#ffa6c9'); pot(g, bx0 + 0.55, FOUND, fz + 0.12, 1, P.butter); pot(g, bx0 - 0.55, FOUND, fz + 0.12, 1, P.blossomDeep);
  if (L >= 2) { bunting(g, [bx0 - W / 2 + 0.05, top - 0.04, fz + 0.1], [bx0 + W / 2 - 0.05, top - 0.04, fz + 0.1], 7, 0.12, 0.07, id); hayBale(g, 0.36, 0.38, -0.3, 0.15, 0.28, 'z'); }
  if (L >= 3) { for (const sx of [-1, 1]) { add(g, cyl(0.04, 0.05, 0.5, CREAM, 0.7 + sx * 0.17, 0, 0.92, 6)); lantern(g, 0.7 + sx * 0.17, 0.5, 0.92, 1, true); } const f = G(); add(f, bar(0, 0, 0, 0, 0.5, 0, 0.025, GOLDD), rb(0.3, 0.18, 0.02, own, 0.16, 0.3, 0, 0.02)); f.position.set(bx0 - 0.5, ry0 + 0.45, fz - 0.1); g.add(f); }
  return finish(g, cy + 0.36 + 0.6, [3.2, 2.3, 0.9]);
};

// ---------------------------------------------------------------- DAIRY (2x2): cheese shop with a giant cheese wheel on the roof
BUILD.dairy = (info) => {
  const L = lv(info), id = info.id | 0, g = G(), own = info.color || P.red, wallC = '#fff3d8', rc = '#7fc4f5', W = 1.4, D = 1.2, H = 0.98, z0 = -0.22;
  const top = shell(g, W, D, H, wallC, { z: z0, trim: L === 3 ? '#fff0b0' : CREAM }), fz = z0 + D / 2;
  const rise = [0.6, 0.7, 0.8][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { y: ry0, z: z0, span: W + 0.32, len: D + 0.3, rise, col: rc, along: 'z', ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: W, base: top - ry0 - 0.02, ovg: 0.15 } });
  // cow-print band under the gable
  add(g, bx(W + 0.02, 0.1, 0.04, '#fffaf0', 0, top - 0.17, fz));
  [[-0.58, 0.03, 0.045], [-0.38, -0.02, 0.035], [-0.16, 0.025, 0.05], [0.08, -0.015, 0.04], [0.3, 0.02, 0.05], [0.5, -0.02, 0.035], [0.62, 0.03, 0.04]].forEach(([x, dy, r]) => add(g, fdisc(r, '#9a8bd0', x, top - 0.12 + dy, fz + 0.022, 0, false, 8)));
  // shop window with a cheese counter, door, striped awning across the front
  add(g, place(window3(0.46, 0.3, { curt: '#fff2a0', frame: CREAM }), -0.3, 0.74, fz + 0.015), rb(0.66, 0.07, 0.24, WOODL, -0.3, 0.44, fz + 0.1, 0.03));
  cheese(g, -0.45, 0.5, fz + 0.12, 0.1, 0.07, 0.3); cheese(g, -0.2, 0.5, fz + 0.12, 0.08, 0.06, 0.5);
  add(g, place(door3(0.3, 0.54, rc, { gold: L === 3, mat: '#ffec99' }), 0.4, 0.2, fz + 0.01));
  awning(g, -0.68, 0.1, top - 0.3, fz + 0.02, 0.36, 0.17, '#8fd0ff', '#fffaf0', 6);
  // the giant cheese wheel crowning the gable
  const wc = ry0 + rise + 0.46, wz = fz - 0.12, wh = G(); add(wh, cyl(0.34, 0.34, 0.14, '#ffd85a', 0, -0.07, 0, 18), ring(0.343, 0.025, '#ffb52a', 0, -0.065, 0, 18), ring(0.343, 0.025, '#ffb52a', 0, 0.04, 0, 18)); wh.rotation.x = Math.PI / 2; wh.position.set(0, wc, wz); g.add(wh);
  for (const [a, d, r] of [[0.5, 0.2, 0.05], [2.4, 0.15, 0.04], [4.1, 0.2, 0.045], [5.3, 0.12, 0.035]]) add(g, fdisc(r, '#f2b23a', Math.cos(a) * d, wc + Math.sin(a) * d, wz + 0.073, 0, false, 8));
  add(g, poly([[0, 0], [0.33, 0.11], [0.33, -0.11]], 0.012, '#fff2b8', 0, wc, wz + 0.074), cyl(0.03, 0.04, 0.34, TIM2, 0, ry0 + rise - 0.06, wz, 6));
  // churns, crates, flowers
  churn(g, 0.9, fz + 0.2, '#d6e8ff'); churn(g, 0.78, fz + 0.34, '#ffe9b0', 0, 0.9);
  crate(g, -0.82, fz + 0.3, 0.0, 0.26); cheese(g, -0.82, 0.21, fz + 0.3, 0.09, 0.06, 0.2);
  stones(g, 0.4, fz + 0.26, 2, 0.14); bed(g, -0.1, fz + 0.5, 3, 0.4, id); butterfly(g, 0.2, 0.9, fz + 0.4, '#ffd24a');
  cat(g, 0.0, 0.16, fz + 0.14, '#fffaf0', 0.2);
  chimney(g, -0.5, z0 - 0.25, surf(-0.5) - 0.3, surf(-0.5) + [0.28, 0.34, 0.4][L - 1], 0.24, CHIM);
  if (L >= 2) { bunting(g, [-W / 2 + 0.05, top - 0.02, fz + 0.45], [W / 2 - 0.05, top - 0.02, fz + 0.45], 8, 0.1, 0.06, id); ivy(g, -W / 2, fz - 0.02, 0.6, id); hang(g, 0.78, 0.7, fz + 0.1, L === 3); }
  if (L >= 3) { signBoard(g, 0.0, 1.1, fz - 0.02, '#fff2c8', '#ffd85a'); }
  return finish(g, ry0 + rise + 0.9, [2.2, 2.2, 0.9]);
};

// ---------------------------------------------------------------- ORCHARD (3x3): fenced mini orchard. Same contract as the farm: group `crops`, setFarmStage(group, 'empty'|'grow'|'ripe', crop)
const FRUIT = ['#ff6f7d', '#ffb065', '#ff8fb5', '#ffe36a'];
const ORCH_TREES = [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.45], [0.8, 0.45]];
let _canopyGeo = null;
export function orchardModel(info = {}) {
  const L = lv(info), id = info.id | 0, g = G(), n = L === 1 ? 3 : 4;
  const base = rb(2.9, 0.1, 2.9, '#a6df6c', 0, 0, 0, 0.05); base.userData.kind = 8; add(g, base);
  for (const [x, z, w, d] of [[0, 1.0, 1.2, 0.3], [0, 0.8, 0.6, 0.22]]) { const p = rb(w, 0.04, d, '#ecdcb0', x, 0.09, z + 0.2, 0.02); add(g, p); }
  for (let i = 0; i < 4; i++) add(g, disc(0.08, STONEL, -0.15 + (i % 2) * 0.22 - 0.02, 0.135, 0.55 - i * 0.2, 8));
  const fx = 1.42, fz = 1.42, fc = '#fff4de';
  fence(g, -fx, fz, fx, fz, { h: 0.3, c: fc, gaps: [[0.4, 0.6]], gap: 0.3, posts: 1.4 }); fence(g, fx, fz, fx, -fz, { h: 0.3, c: fc, gap: 0.3, posts: 1.4 }); fence(g, fx, -fz, -fx, -fz, { h: 0.3, c: fc, gap: 0.3, posts: 1.4 }); fence(g, -fx, -fz, -fx, fz, { h: 0.3, c: fc, gap: 0.3, posts: 1.4 });
  for (const sx of [-1, 1]) add(g, rb(0.09, 0.46, 0.09, TIM2, sx * 0.3, 0.0, fz, 0.03), sp(0.05, GOLD, sx * 0.3, 0.5, fz, { q: 0 }));
  // trunks and branches (always there)
  const trees = ORCH_TREES.slice(0, n);
  trees.forEach(([x, z], i) => { const lean = (i % 2 ? -1 : 1) * 0.06; add(g, K.cyl(0.06, 0.1, 0.5, TIM2, x, 0.1, z, { seg: 6 }), bar(x, 0.45, z, x + 0.17, 0.66, z + 0.04, 0.045, TIM2), bar(x, 0.45, z, x - 0.16, 0.64, z - 0.03, 0.045, TIM2), disc(0.2, '#a9e07a', x, 0.135, z, 8)); });
  // ladder, crate of apples, basket
  const lx = 0.0, lz = -0.55; add(g, bar(lx - 0.07, 0.1, lz + 0.12, lx - 0.1, 0.9, lz - 0.02, 0.035, WOODL), bar(lx + 0.07, 0.1, lz + 0.12, lx + 0.1, 0.9, lz - 0.02, 0.035, WOODL)); for (let i = 0; i < 5; i++) add(g, bar(lx - 0.075 - i * 0.006, 0.2 + i * 0.15, lz + 0.1 - i * 0.025, lx + 0.075 + i * 0.006, 0.2 + i * 0.15, lz + 0.1 - i * 0.025, 0.025, TIM2));
  crate(g, 0.22, 1.05, 0.1, 0.28, PLANK, 0.2); for (let i = 0; i < 3; i++) add(g, sp(0.055, FRUIT[i % 2 * 2], 0.15 + (i % 2) * 0.1, 0.4, 1.0 + (i >> 1) * 0.09, { q: 0 }));
  add(g, K.lathe([[0.001, 0], [0.1, 0], [0.14, 0.12], [0.12, 0.12]], '#e8c07a', -0.35, 0.1, 1.05, { seg: 8 })); for (let i = 0; i < 3; i++) add(g, sp(0.045, FRUIT[1 + i % 2], -0.35 + (i - 1) * 0.06, 0.24, 1.05, { q: 0 }));
  bed(g, -1.1, 1.18, 3, 0.4, id); butterfly(g, 0.5, 1.0, 0.8, '#ffa6c9');
  if (L >= 2) { bunting(g, [-fx, 0.68, fz], [fx, 0.68, fz], 10, 0.2, 0.07, id); for (const [x, z] of [[-1.25, 0.1], [1.25, -0.1]]) pot(g, x, 0.1, z, 1.1, P.blossomDeep); }
  if (L >= 3) for (const sx of [-1, 1]) { add(g, cyl(0.04, 0.05, 0.74, CREAM, sx * 1.42, 0.0, 1.42, 6)); lantern(g, sx * 1.42, 0.74, 1.42, 1.0, true); }
  if (L >= 3) add(g, bar(-0.2, 0.1, -1.2, -0.2, 0.9, -1.2, 0.04, GOLDD), bar(0.2, 0.1, -1.2, 0.2, 0.9, -1.2, 0.04, GOLDD), rb(0.5, 0.16, 0.03, '#fff2c8', 0, 0.78, -1.2, 0.015), sp(0.06, GOLD, 0, 0.98, -1.2, { q: 0 }));
  const out = finish(g, 1.7 + (L === 3 ? 0.25 : 0), [3.2, 3.2, 0.7]);
  // the crops: one merged canopy + one merged fruit mesh per tree, scaled about the trunk top by setFarmStage
  const crops = new THREE.Group(); crops.name = 'crops'; const kids = [], rr = K.rng(id + 11);
  if (!_canopyGeo) { const g1 = new THREE.SphereGeometry(1, 11, 7), p = g1.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y * (y < 0 ? 0.72 : 1)); } g1.computeVertexNormals(); _canopyGeo = g1; }
  trees.forEach(([x, z], i) => {
    const T = new THREE.Group(); T.position.set(x, 0.62, z);
    const parts = [], mk = (geo, r, ry_, dx, dy, dz) => { const m = new THREE.Mesh(geo, col('#fff')); m.scale.set(r, r * ry_, r); m.position.set(dx, dy, dz); return m; };
    parts.push(mk(_canopyGeo, 0.5, 0.96, 0, 0.34, 0)); for (const [dx, dy, dz, r] of [[0.32, 0.3, 0.12, 0.3], [-0.3, 0.38, -0.1, 0.28], [0.02, 0.78, 0.0, 0.3]]) parts.push(mk(BUN, r, 0.95, dx, dy, dz));
    const can = fuse(parts, i % 2 ? '#8fe06a' : '#a2ee74'); can.userData.kind = 8; bake(can); T.add(can);
    const fp = []; for (let k = 0; k < 5; k++) { const a = k * 2.4 + i, h = 0.1 + rr() * 0.62, rad = Math.max(0.28, 0.5 * Math.sqrt(Math.max(0.05, 1 - Math.pow((h - 0.34) / 0.66, 2)))); fp.push(mk(SPT, 0.1, 1, Math.cos(a) * rad, h + 0.04, Math.sin(a) * rad)); }
    const fr = fuse(fp, lit(FRUIT[i % 4], 0.35)); T.add(fr); crops.add(T); kids.push({ T, fr });
  });
  out.add(crops); out.userData.crops = crops; out.userData.orchard = kids; setFarmStage(out, 'empty', 0);
  return out;
}
BUILD.orchard = (info) => orchardModel(info);

// ---------------------------------------------------------------- FISHING DOCK (3x2): pier, little hut, nets, buckets, lanterns, `boat` (bobs)
BUILD.dock = (info) => {
  const L = lv(info), id = info.id | 0, g = G(), own = info.color || P.red, TEAL = '#4cc9b0', HUT = '#ffe9b8', WS = 0.72;
  // pond with a soft stone bank
  const pond = new THREE.Group(); pond.position.set(0.5, 0, 0.12); pond.scale.set(0.92, 1, 0.64);
  add(pond, K.lathe([[0.0001, 0.02], [1.0, 0.02], [1.1, 0.07], [1.02, 0.12]], '#e8dcc0', 0, 0, 0, { seg: 18 }), disc(0.99, waterMat, 0, 0.04, 0, 18));
  g.add(pond);
  for (let i = 0; i < 7; i++) { const a = 2.7 + i * 0.52; add(g, sp(0.07 + (i % 3) * 0.02, i % 2 ? STONED : STONEL, 0.5 + Math.cos(a) * 1.0, 0.08, 0.12 + Math.sin(a) * 0.68, { q: 0, sy: 0.65 })); }
  for (const [x, z, r] of [[1.05, 0.55, 0.1], [0.25, -0.1, 0.07]]) { add(g, fdisc(r, '#7fdc6a', x, 0.065, z, 0, false, 8)); g.children[g.children.length - 1].rotation.set(-Math.PI / 2, 0, 0); }
  // hut deck + hut
  const hx = -0.88, hz = -0.5, dk = rb(1.0, 0.08, 0.95, PLANK, hx, 0.1, hz + 0.0, 0.03); dk.userData.kind = 6; dk.userData.axis = 2; add(g, dk);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, cyl(0.045, 0.05, 0.12, TIM2, hx + sx * 0.42, 0, hz + sz * 0.4, 6));
  const W = 0.78, D = 0.66, H = 0.56, y0 = 0.18, w = rb(W, H, D, HUT, hx - 0.03, y0, hz - 0.1, 0.1); w.userData.kind = 6; w.userData.axis = 1; add(g, w);
  const ry0 = y0 + H + 0.05, rise = [0.42, 0.48, 0.56][L - 1], fz = hz - 0.1 + D / 2;
  const surf = roof(g, { x: hx - 0.03, y: ry0, z: hz - 0.1, span: W + 0.34, len: D + 0.3, rise, col: TEAL, along: 'z', ridgeCol: L === 3 ? GOLD : null, fill: { col: HUT, wd: W, base: -0.07, ovg: 0.14 } });
  add(g, place(door3(0.24, 0.42, own, { gold: L === 3 }), hx - 0.2, y0 + 0.02, fz + 0.01), place(window3(0.3, 0.2, { round: true, curt: CURT[id % 5] }), hx + 0.18, y0 + 0.34, fz + 0.015));
  add(g, rb(0.3, 0.05, 0.14, WOODL, hx + 0.18, y0 + 0.17, fz + 0.1, 0.02)); 
  chimney(g, hx + 0.2, hz - 0.3, surf(0.2) - 0.3, surf(0.2) + 0.26, 0.2, CHIM);
  // fish sign over the door
  add(g, bar(hx - 0.2, y0 + 0.62, fz + 0.02, hx - 0.2, y0 + 0.62, fz + 0.2, 0.03, TIM2), rb(0.26, 0.15, 0.04, '#fff2c8', hx - 0.2, y0 + 0.46, fz + 0.2, 0.02)); fish(g, hx - 0.2, y0 + 0.53, fz + 0.23, 0.0, '#ff9a8a', 0.8); g.children[g.children.length - 1].rotation.z = 0;
  // drying rack with fish and a net
  const rx = hx - 0.35, rz = hz + 0.52; add(g, bar(rx - 0.0, 0.1, rz, rx, 0.78, rz, 0.04, TIM2), bar(rx + 0.62, 0.1, rz, rx + 0.62, 0.78, rz, 0.04, TIM2), bar(rx - 0.04, 0.76, rz, rx + 0.66, 0.76, rz, 0.04, TIM2));
  for (let i = 0; i < 2; i++) { add(g, bar(rx + 0.14 + i * 0.17, 0.76, rz, rx + 0.14 + i * 0.17, 0.62, rz, 0.012, CREAM)); fish(g, rx + 0.14 + i * 0.17, 0.5, rz, Math.PI / 2, i % 2 ? '#ffb27a' : '#8fd0ff', 0.8); g.children[g.children.length - 1].rotation.x = Math.PI / 2; }
  const net = qd(0.6, 0.42, '#e8d4a0', hx + 0.0, y0 + 0.35, hz - 0.1 - D / 2 - 0.02, Math.PI); net.userData.kind = 12; net.userData.axis = 0; add(g, net);
  const net2 = qd(0.5, 0.36, '#f0dcae', hx - 0.14, y0 + 0.28, fz + 0.04); add(g, net2); net2.userData.kind = 12; net2.position.set(hx - W / 2 - 0.05, y0 + 0.3, hz - 0.1); net2.rotation.y = -Math.PI / 2; net2.scale.set(0.5, 0.36, 1);
  // pier
  const pl = rb(1.6, 0.07, 0.5, PLANK, 0.7, 0.1, -0.25, 0.02); pl.userData.kind = 6; pl.userData.axis = 2; add(g, pl);
  const pxs = [-0.05, 0.7, 1.45]; for (const x of pxs) for (const z of [-0.5, 0.0]) add(g, K.cyl(0.045, 0.055, 0.56, TIM2, x, 0, z, { seg: 6 }));
  for (let i = 0; i < pxs.length - 1; i++) for (const z of [0.0]) { const x0 = pxs[i], x1 = pxs[i + 1]; add(g, bar(x0, 0.54, z, (x0 + x1) / 2, 0.46, z, 0.02, '#f3e3c0'), bar((x0 + x1) / 2, 0.46, z, x1, 0.54, z, 0.02, '#f3e3c0')); }
  for (const [x, z] of [[-0.05, 0.0], [1.45, 0.0]]) { add(g, cyl(0.035, 0.045, 0.3, IRON, x, 0.58, z, 6)); lantern(g, x, 0.84, z, 1.0, L === 3); }
  // buckets, crate, floats
  bucket(g, 0.15, -0.15, '#ffd24a', 0.17, 1.1, '#8fd0ff'); fish(g, 0.1, 0.2, -0.25, 0.6, '#ff9a8a', 0.7); bucket(g, 0.36, -0.35, '#ff9fbd', 0.17, 1.0, '#ffb27a'); crate(g, 0.66, -0.25, 0.17, 0.24, PLANK, 0.3);
  for (let i = 0; i < 2; i++) add(g, sp(0.05, ['#ff6b6b', '#fffaf0'][i], 1.0 + i * 0.07, 0.2, -0.15, { q: 0 }));
  // the boat
  const boat = G(); boat.name = 'boat';
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), col('#ff9a8a')); hull.scale.set(0.5, 0.22, 0.22); hull.position.y = 0.0; sh(hull); boat.add(hull);
  boat.add(ring(1.0, 0.04, '#fffaf0', 0, -0.025, 0, 12), disc(0.46, '#ffe0b0', 0, -0.07, 0, 12), bx(0.04, 0.03, 0.4, TIM2, 0.1, -0.12, 0), bx(0.04, 0.03, 0.4, TIM2, -0.18, -0.12, 0), bar(-0.2, -0.05, -0.18, 0.28, 0.1, -0.5, 0.025, TIM), bar(0.1, -0.05, 0.18, -0.35, 0.1, 0.52, 0.025, TIM));
  boat.children[0].scale.set(0.5, 0.22, 0.22); boat.children[1].scale.set(0.5, 1, 0.22); boat.children[2].scale.set(0.5, 1, 0.22);
  fish(boat, -0.28, -0.04, 0.0, 1.2, '#ffb27a', 0.6); sp(0.05, '#ffe27a', 0.3, -0.04, 0.0);
  boat.position.set(0.55, 0.2, 0.42); boat.userData.baseY = 0.2; boat.rotation.y = 0.35; boat.scale.setScalar(1.05); g.add(boat);
  add(g, bar(0.7, 0.5, 0.0, 0.9, 0.12, 0.34, 0.016, '#f3e3c0'));
  bed(g, hx + 0.9, 0.4, 2, 0.3, id); butterfly(g, 0.9, 0.7, 0.2, '#ffa6c9');
  if (L >= 2) { bunting(g, [-0.05, 0.54, 0.02], [1.45, 0.54, 0.02], 9, 0.12, 0.06, id); for (const [x, c] of [[hx - 0.45, '#ff6b6b'], [hx - 0.52, '#fffaf0']]) add(g, sp(0.07, c, x, y0 + 0.48 - (c === '#fffaf0' ? 0.12 : 0), fz - 0.1, { q: 0 })); hang(g, hx + 0.38, y0 + 0.28, fz + 0.1, L === 3); barrel(g, 1.25, -0.3, WOOD, 1.0, 0.17); }
  if (L >= 3) { const f = G(); add(f, bar(0, 0, 0, 0, 0.5, 0, 0.025, GOLDD), rb(0.3, 0.18, 0.02, own, 0.16, 0.3, 0, 0.02)); f.position.set(hx + 0.2, ry0 + rise, hz - 0.1); g.add(f); vane(g, hx - 0.4, ry0 + rise + 0.03, hz - 0.1, 0.7); { add(g, cyl(0.035, 0.045, 0.3, GOLDD, 0.7, 0.58, 0.0, 6)); lantern(g, 0.7, 0.84, 0.0, 0.9, true); } }
  return finish(g, ry0 + rise + (L === 3 ? 0.7 : 0.3), [3.2, 2.2, 0.7]);
};

// ---------------------------------------------------------------- PANTRY (2x2): jam and pies. Round pie sign, jam jars in the window, red gingham awning
BUILD.pantry = (info) => {
  const L = lv(info), id = info.id | 0, g = G(), own = info.color || P.red, wallC = '#fff0b0', rc = '#b79cf0', W = 1.4, D = 1.2, H = 0.98, z0 = -0.22;
  const top = shell(g, W, D, H, wallC, { z: z0, trim: L === 3 ? '#fff0b0' : CREAM }), fz = z0 + D / 2;
  const rise = [0.56, 0.66, 0.76][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { y: ry0, z: z0, span: W + 0.32, len: D + 0.3, rise, col: rc, along: 'z', ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: W, base: top - ry0 - 0.02, ovg: 0.15 } });
  // shop window: glowing back wall, shelves of jam jars
  const wx = -0.28, wy = 0.46, ww = 0.6, wh = 0.4;
  add(g, bx(ww + 0.16, wh + 0.14, 0.05, CREAM, wx, wy - 0.07, fz), bx(ww, wh, 0.03, windowMat, wx, wy, fz + 0.03), bx(ww, 0.03, 0.14, WOODL, wx, wy + 0.13, fz + 0.09), bx(ww, 0.03, 0.14, WOODL, wx, wy + 0.27, fz + 0.09), bx(ww + 0.2, 0.06, 0.2, WOODL, wx, wy - 0.12, fz + 0.1));
  const jc = ['#ff5f7f', '#9a5fd0', '#ffa24a', '#7fd96a', '#ff5f7f', '#ffa24a'];
  for (let i = 0; i < 6; i++) jar(g, wx - 0.2 + (i % 3) * 0.2, wy + 0.16 + (i >= 3 ? 0.14 : 0), fz + 0.1, jc[i], 0.9);
  for (let i = 0; i < 3; i++) jar(g, wx - 0.2 + i * 0.2, wy - 0.05, fz + 0.12, jc[(i + 2) % 6], 0.9);
  add(g, qd(ww + 0.18, 0.025, CREAM, wx, wy + 0.2, fz + 0.04), qd(0.025, wh, CREAM, wx, wy + 0.0, fz + 0.045));
  // gingham awning
  const ah = top - 0.32, aw0 = -0.68, aw1 = 0.1, a = Math.atan2(0.2, 0.4), Ls = Math.hypot(0.4, 0.2);
  const aw = G(); const sl = rb(aw1 - aw0, 0.07, Ls, '#ff6f7f', 0, -0.07, 0, 0.03); sl.userData.kind = 11; aw.add(sl); aw.position.set((aw0 + aw1) / 2, ah, fz + 0.2); aw.rotation.x = a; g.add(aw);
  for (let i = 0; i < 6; i++) { const d = fdisc((aw1 - aw0) / 12 * 0.99, i % 2 ? '#fffaf0' : '#ff6f7f', aw0 + (aw1 - aw0) / 6 * (i + 0.5), ah - 0.2 - 0.08, fz + 0.405, 0, true, 8); d.rotation.z = Math.PI; add(g, d); }
  add(g, lcyl('x', 0.024, aw1 - aw0, '#e84a5f', (aw0 + aw1) / 2, ah - 0.195, fz + 0.4, 6), bar(aw0 + 0.02, ah, fz, aw0 + 0.02, ah - 0.2, fz + 0.4, 0.028, IRON), bar(aw1 - 0.02, ah, fz, aw1 - 0.02, ah - 0.2, fz + 0.4, 0.028, IRON));
  add(g, place(door3(0.3, 0.54, own, { gold: L === 3, mat: '#ffb6cf' }), 0.42, 0.2, fz + 0.01));
  // round pie sign on a bracket at the right corner
  const px = 0.78, py = top - 0.1;
  add(g, bar(W / 2 - 0.02, py + 0.05, fz + 0.04, px + 0.06, py + 0.05, fz + 0.04, 0.035, TIM2), bar(px, py + 0.05, fz + 0.04, px, py - 0.08, fz + 0.04, 0.012, CREAM));
  pie(g, px, py - 0.4, fz + 0.06, 0.3, Math.PI / 2 * 0.95, '#e8a458', '#ff6f8a'); for (const [dx, dy] of [[-0.09, 0.07], [0.1, 0.02], [0.0, -0.1], [0.08, 0.14]]) add(g, sp(0.035, '#d8264d', px + dx, py - 0.4 + dy, fz + 0.14, { q: 0 }));
  // chimney, pie table
  chimney(g, -0.5, z0 - 0.25, surf(-0.5) - 0.3, surf(-0.5) + [0.3, 0.38, 0.46][L - 1], 0.26, CHIM);
  add(g, rb(0.44, 0.05, 0.28, WOODL, 0.62, 0.3, fz + 0.5, 0.02), bar(0.43, 0.0, fz + 0.4, 0.43, 0.3, fz + 0.4, 0.04, TIM2), bar(0.81, 0.0, fz + 0.4, 0.81, 0.3, fz + 0.4, 0.04, TIM2), bar(0.43, 0.0, fz + 0.6, 0.43, 0.3, fz + 0.6, 0.04, TIM2), bar(0.81, 0.0, fz + 0.6, 0.81, 0.3, fz + 0.6, 0.04, TIM2));
  pie(g, 0.55, 0.35, fz + 0.5, 0.1, 0, '#e8a458', '#ff9a4a', false); pie(g, 0.72, 0.35, fz + 0.5, 0.1, 0, '#e8a458', '#9a5fd0', false);
  crate(g, -0.85, fz + 0.3, 0.0, 0.26);
  stones(g, 0.42, fz + 0.26, 2, 0.14); bed(g, -0.2, fz + 0.5, 3, 0.4, id); butterfly(g, 0.1, 0.9, fz + 0.4, '#ffd24a'); snail(g, -0.55, 0.0, fz + 0.4, 0.3);
  if (L >= 2) { bunting(g, [-W / 2 + 0.05, top - 0.02, fz + 0.45], [W / 2 - 0.05, top - 0.02, fz + 0.45], 8, 0.1, 0.06, id); ivy(g, -W / 2, fz - 0.02, 0.6, id); }
  if (L >= 3) { hang(g, 0.0, 0.75, fz + 0.5, true); signBoard(g, -0.3, 1.12, fz - 0.02, '#fff2c8', '#ff5f7f'); }
  return finish(g, ry0 + rise + (L === 3 ? 0.55 : 0.25), [2.2, 2.2, 0.9]);
};

// ---------------------------------------------------------------- WEAVERY (2x2): cottage, big `spin`ning wheel, yarn balls, rack of dyed cloth strips (`flag`), loom in the window
BUILD.weavery = (info) => {
  const L = lv(info), id = info.id | 0, g = G(), own = info.color || P.red, wallC = '#f1d4ff', rc = '#4cc9b0', W = 1.3, D = 1.2, H = 0.98, x0 = -0.2, z0 = -0.22;
  const top = shell(g, W, D, H, wallC, { x: x0, z: z0, trim: L === 3 ? '#fff0b0' : CREAM }), fz = z0 + D / 2;
  const rise = [0.56, 0.66, 0.76][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { x: x0, y: ry0, z: z0, span: W + 0.32, len: D + 0.3, rise, col: rc, along: 'z', ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: W, base: top - ry0 - 0.02, ovg: 0.15 } });
  // loom in the window: frame, warp threads, a woven rainbow cloth
  const lx = x0 - 0.28, ly = 0.55;
  add(g, bx(0.6, 0.5, 0.05, CREAM, lx, ly - 0.1, fz), bx(0.46, 0.38, 0.03, windowMat, lx, ly - 0.04, fz + 0.03), rb(0.66, 0.07, 0.2, WOODL, lx, ly - 0.17, fz + 0.1, 0.03));
  for (const s of [-1, 1]) add(g, bx(0.04, 0.38, 0.05, TIM2, lx + s * 0.19, ly - 0.04, fz + 0.08)); add(g, bx(0.42, 0.04, 0.05, TIM2, lx, ly + 0.3 - 0.1 - 0.02 + 0.04, fz + 0.08), bx(0.42, 0.03, 0.05, TIM2, lx, ly - 0.04, fz + 0.08));
  for (let i = 0; i < 6; i++) add(g, qd(0.02, 0.34, ['#ff8fb5', '#ffe27a', '#8fd0ff', '#9be88a', '#c9a8ff', '#ffa970'][i], lx - 0.15 + i * 0.06, ly + 0.0, fz + 0.065));
  for (let i = 0; i < 4; i++) add(g, qd(0.36, 0.045, ['#ff8fb5', '#ffe27a', '#8fd0ff', '#c9a8ff'][i], lx, ly - 0.06 + i * 0.05 - 0.05, fz + 0.075));
  // door, small round window
  add(g, place(door3(0.3, 0.54, own, { gold: L === 3, mat: '#ffe27a' }), x0 + 0.38, 0.2, fz + 0.01));
  add(g, place(window3(0.16, 0.16, { round: true, curt: '#ffb6cf' }), x0 + W / 2 + 0.005, 0.7, z0 + 0.1, Math.PI / 2));
  chimney(g, x0 + 0.3, z0 - 0.25, surf(0.3) - 0.3, surf(0.3) + [0.3, 0.38, 0.46][L - 1], 0.24, CHIM);
  // the wheel (named spin, spins about its own axis X, mounted turned toward the street)
  const mount = new THREE.Group(); mount.userData.mount = true; mount.position.set(0.66, 0.5, 0.45); mount.rotation.y = -0.85;
  const spin = G(); spin.name = 'spin';
  add(spin, lcyl('x', 0.36, 0.04, TIM, 0, 0, 0, 20), lcyl('x', 0.3, 0.05, '#f6d6a0', 0, 0, 0, 20), lcyl('x', 0.07, 0.1, GOLDD, 0, 0, 0, 8));
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; add(spin, bar(0, Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0, Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0.035, TIM2)); }
  for (const a of [0.4, 2.5, 4.6]) add(spin, sp(0.04, ['#ff8fb5', '#8fd0ff', '#ffe27a'][(a * 3 | 0) % 3], 0, Math.cos(a) * 0.36, Math.sin(a) * 0.36, { q: 0 }));
  mount.add(spin); g.add(mount);
  const fr = G(); add(fr, bar(0, -0.5, -0.24, 0.0, 0.0, 0.0, 0.05, TIM2), bar(0, -0.5, 0.24, 0.0, 0.0, 0.0, 0.05, TIM2), rb(0.1, 0.05, 0.6, WOODL, 0, -0.5, 0, 0.02), bar(0.12, -0.46, 0.0, 0.12, -0.2, 0.0, 0.04, TIM2), sp(0.09, '#fffaf0', 0.14, -0.14, 0.0, { q: 1 })); fr.userData.mount = false; mount.add(fr);
  // yarn balls in a basket
  add(g, K.lathe([[0.001, 0], [0.12, 0], [0.17, 0.12], [0.15, 0.13]], '#e8c07a', -0.78, 0.0, fz + 0.58, { seg: 10 }));
  ['#ff8fb5', '#8fd0ff', '#ffe27a', '#b79cf0', '#9be88a'].forEach((c, i) => add(g, sp(0.06, c, -0.78 + (i % 3 - 1) * 0.085, 0.16 + (i > 2 ? 0.06 : 0), fz + 0.58 + (i % 2) * 0.05 - 0.02, { q: 1 })));
  
  // dye tubs
  for (const [x, c] of [[-0.22, '#ff8fb5'], [-0.02, '#8fd0ff']]) { add(g, K.lathe([[0.001, 0], [0.12, 0], [0.14, 0.22], [0.125, 0.22]], '#f3bd7c', x, 0.0, fz + 0.5, { seg: 10 }), disc(0.125, c, x, 0.2, fz + 0.5, 10)); }
  add(g, bar(-0.22, 0.1, fz + 0.5, -0.15, 0.5, fz + 0.45, 0.025, TIM2));
  // drying rack with dyed strips (named flag: sways)
  const rx = -0.97, rz = fz + 0.36; add(g, bar(rx, 0.17, rz, rx, 1.0, rz, 0.05, TIM2), bar(rx + 0.52, 0.17, rz, rx + 0.52, 1.0, rz, 0.05, TIM2), bar(rx - 0.03, 0.98, rz, rx + 0.56, 0.98, rz, 0.045, TIM2), sp(0.05, GOLD, rx, 1.05, rz, { q: 0 }), sp(0.05, GOLD, rx + 0.52, 1.05, rz, { q: 0 }));
  const strips = G(); strips.name = 'flag'; strips.position.set(rx, 0.96, rz);
  ['#ff8fb5', '#ffe27a', '#8fd0ff', '#9be88a', '#c9a8ff'].forEach((c, i) => { const q = qd(0.09, 0.5 + (i % 3) * 0.1, c, 0.07 + i * 0.1, -0.27 - (i % 3) * 0.05, 0.0, 0); q.userData.kind = 10; strips.add(q); });
  g.add(strips);
  stones(g, x0 + 0.38, fz + 0.26, 2, 0.14); bed(g, 0.1, fz + 0.5, 3, 0.4, id); butterfly(g, 0.4, 0.9, fz + 0.4, '#c9a8ff'); cat(g, x0 + 0.78, 0.16, fz + 0.2, '#ffc890', -0.3);
  if (L >= 2) { bunting(g, [x0 - W / 2 + 0.05, top - 0.02, fz + 0.1], [x0 + W / 2 - 0.05, top - 0.02, fz + 0.1], 7, 0.1, 0.06, id); ivy(g, x0 - W / 2, fz - 0.02, 0.6, id); hang(g, x0 + 0.1, 0.62, fz + 0.1, L === 3); }
  if (L >= 3) { vane(g, x0 + 0.35, ry0 + rise + 0.03, z0, 0.8); signBoard(g, x0 + 0.1, 1.1, fz - 0.02, '#fff2c8', '#c9a8ff'); }
  return finish(g, ry0 + rise + (L === 3 ? 0.55 : 0.25), [2.2, 2.2, 0.9]);
};

// ---------------------------------------------------------------- DECOR: the props, fitted to their footprints, richer per level
/** wrap a prop: fit = { s, ry, y }, extras(g, L, id, own) adds flowers, bunting, gold... (merged into 1 to 3 meshes), topY = marker height */
function decorWrap(make, fit, info, topY, extras) {
  const L = lv(info), id = info.id | 0, own = info.color || P.red, root = new THREE.Group(), p = make();
  p.scale.setScalar(fit.s || 1); if (fit.ry) p.rotation.y = fit.ry; if (fit.y) p.position.y = fit.y; if (fit.z) p.position.z = fit.z; root.add(p);
  const g = G(); extras(g, L, id, own); root.add(finish(g, topY + (L === 3 ? 0.15 : 0)));
  root.userData.topY = topY + (L === 3 ? 0.15 : 0); root.userData.prop = true; return root;
}
const gstar = (g, x, y, z, r = 0.06) => add(g, star(r, GOLD, x, y, z, 0));
BUILD.bench = (info) => decorWrap(benchModel, { s: 1.4 }, info, 1.15, (g, L, id) => {
  bed(g, -0.82, 0.08, 2, 0.2, id); bed(g, 0.82, 0.08, 2, 0.2, id + 1); butterfly(g, 0.5, 0.8, 0.3, '#ffa6c9');
  if (L >= 2) { pot(g, -0.96, 0.0, -0.1, 1.1, P.blossomDeep); pot(g, 0.96, 0.0, -0.1, 1.1, P.butter); add(g, cyl(0.035, 0.045, 0.78, IRON, 0.98, 0, 0.12, 6)); lantern(g, 0.98, 0.78, 0.12, 1.0, L === 3); ivy(g, -0.7, -0.3, 0.6, id, 0.07); }
  if (L >= 3) { cat(g, 0.3, 0.52, 0.0, '#ffd6a0', 0.3); for (const s of [-1, 1]) add(g, sp(0.06, GOLD, s * 0.72, 0.86, -0.28, { q: 1 })); bunting(g, [-0.9, 0.9, -0.3], [0.9, 0.9, -0.3], 8, 0.12, 0.06, id); }
});
BUILD.birdbath = (info) => decorWrap(birdBathModel, { s: 0.9 }, info, 1.0, (g, L, id) => {
  bed(g, 0.0, 0.4, 3, 0.45, id); bed(g, -0.38, -0.1, 2, 0.2, id + 2); bed(g, 0.4, -0.15, 2, 0.2, id + 4);
  if (L >= 2) { for (let i = 0; i < 6; i++) { const a = i * 1.05; add(g, sp(0.05, i % 2 ? STONEL : STONED, Math.cos(a) * 0.46, 0.03, Math.sin(a) * 0.46, { q: 0, sy: 0.6 })); } butterfly(g, 0.2, 0.85, 0.2, '#ffa6c9'); butterfly(g, -0.3, 0.7, -0.2, '#ffd24a', 1); }
  if (L >= 3) { add(g, ring(0.41, 0.03, GOLD, 0, 0.63, 0, 14)); gstar(g, -0.3, 0.95, 0.1, 0.07); gstar(g, 0.34, 0.8, -0.15, 0.05); add(g, cyl(0.03, 0.04, 0.55, GOLDD, -0.4, 0, 0.3, 6)); lantern(g, -0.4, 0.55, 0.3, 0.9, true); }
});
BUILD.scarecrow = (info) => decorWrap(scarecrowModel, { s: 0.64 }, info, 1.45, (g, L, id) => {
  for (let i = 0; i < 3; i++) add(g, sp(0.09, ['#ffa23c', '#ffb85a', '#ff9a4a'][i], -0.28 + i * 0.28 + (i === 2 ? 0.0 : 0), 0.08, 0.34 - (i % 2) * 0.06, { q: 1, sy: 0.8 }), cyl(0.012, 0.015, 0.05, '#7fcf5a', -0.28 + i * 0.28, 0.14, 0.34 - (i % 2) * 0.06, 5));
  bed(g, 0.3, -0.32, 2, 0.2, id); hayBale(g, -0.3, 0.0, -0.3, 0.11, 0.2, 'x');
  if (L >= 2) { const cx = 0.38, cy = 1.0; add(g, sp(0.06, '#7e78b8', cx, cy, 0.0, { q: 1, sx: 1.1 }), sp(0.04, '#7e78b8', cx + 0.05, cy + 0.07, 0.03, { q: 0 }), cone(0.015, 0.05, '#ffb23c', cx + 0.1, cy + 0.07, 0.03, 4, -Math.PI / 2), sp(0.045, '#7e78b8', cx - 0.07, cy - 0.01, 0.0, { q: 0, sx: 1.6, sy: 0.5 })); bed(g, -0.36, 0.3, 2, 0.2, id + 3); }
  if (L >= 3) { gstar(g, 0.0, 1.92, 0.2, 0.06); add(g, rb(0.1, 0.28, 0.02, '#ff8fb5', -0.07, 0.86, 0.14, 0.01)); for (let i = 0; i < 3; i++) add(g, cyl(0.012, 0.012, 0.3, '#ffe27a', 0.42 + i * 0.03, 0.0, -0.28 + (i % 2) * 0.03, 4), sp(0.03, '#ffd24a', 0.42 + i * 0.03, 0.31, -0.28 + (i % 2) * 0.03, { q: 0, sy: 1.8 })); }
});
BUILD.picnic = (info) => decorWrap(picnicModel, { s: 1.12 }, info, 0.9, (g, L, id) => {
  bed(g, -0.82, 0.8, 3, 0.4, id); bed(g, 0.85, -0.8, 3, 0.4, id + 1); bed(g, 0.9, 0.82, 2, 0.2, id + 2); butterfly(g, 0.2, 0.7, 0.5, '#ffa6c9'); butterfly(g, -0.5, 0.6, -0.2, '#ffd24a', 1);
  if (L >= 2) { const px = 0.55, pz = -0.6; add(g, bar(px, 0.0, pz, px, 1.1, pz, 0.03, '#fff3d6'), sp(0.04, GOLD, px, 1.14, pz, { q: 0 })); const c1 = cone(0.55, 0.28, '#ff9fbd', px, 0.98, pz, 12, 0); add(g, c1, ring(0.545, 0.05, '#fffaf0', px, 0.94, pz, 12)); }
  if (L >= 3) { for (const [x, z] of [[-0.95, -0.9], [0.95, 0.95]]) { add(g, cyl(0.035, 0.045, 0.6, IRON, x, 0, z, 6)); lantern(g, x, 0.6, z, 1.0, true); } bunting(g, [-0.95, 0.62, -0.9], [0.95, 0.62, 0.95], 9, 0.14, 0.06, id); }
});
BUILD.swing = (info) => decorWrap(swingModel, { s: 1.0 }, info, 1.95, (g, L, id) => {
  bed(g, -0.85, 0.7, 3, 0.35, id); bed(g, 0.85, 0.6, 3, 0.35, id + 1); butterfly(g, 0.4, 1.1, 0.5, '#ffa6c9');
  for (const s of [-1, 1]) { add(g, bl(0.07, P.leafLight, s * 0.62, 0.3, 0.4, 0.8), bl(0.07, P.leaf, s * 0.62, 0.7, 0.36, 0.8), bl(0.07, P.leafLight, s * 0.6, 1.1, 0.3, 0.8)); add(g, bl(0.05, P.blossomDeep, s * 0.64, 0.45, 0.43), bl(0.05, '#ffffff', s * 0.62, 0.9, 0.38), bl(0.05, P.blossomDeep, s * 0.6, 1.3, 0.32)); }
  if (L >= 2) { for (const s of [-1, 1]) add(g, sp(0.07, GOLD, s * 0.7, 1.78, 0.45, { q: 1 })); pot(g, 0.0, 0.0, 0.85, 1.2, P.butter); }
  if (L >= 3) { add(g, bar(0.0, 1.74, 0.0, 0.0, 1.5, 0.0, 0.012, GOLDD)); lantern(g, 0.0, 1.38, 0.0, 0.8, true); gstar(g, -0.45, 1.85, 0.0, 0.07); gstar(g, 0.45, 1.85, 0.0, 0.07); }
});
BUILD.flowercart = (info) => decorWrap(flowerCartModel, { s: 0.88, z: -0.18 }, info, 1.45, (g, L, id) => {
  bucket(g, -0.8, 0.2, '#a9ecc9', 0.0, 1.4); bucket(g, 0.8, 0.25, '#ffb5cf', 0.0, 1.4); bucket(g, 0.7, -0.15, '#ffe58c', 0.0, 1.2);
  for (const [x, z, c] of [[-0.8, 0.2, P.blossomDeep], [0.8, 0.25, '#c9a8ff'], [0.7, -0.15, '#ffffff']]) { add(g, bl(0.1, P.leafLight, x, 0.26, z, 0.7)); for (let i = 0; i < 3; i++) add(g, bl(0.06, i % 2 ? c : P.butter, x + (i - 1) * 0.07, 0.36 + (i % 2) * 0.04, z + 0.01, 1, i + x * 5)); }
  bed(g, -0.35, 0.45, 3, 0.4, id); butterfly(g, 0.1, 1.0, 0.4, '#ffa6c9');
  if (L >= 2) { bed(g, 0.3, 0.5, 3, 0.35, id + 2); pot(g, -0.55, 0.0, -0.3, 1.1, P.blossomDeep); pot(g, 0.55, 0.0, -0.4, 1.0, '#c9a8ff'); bunting(g, [-0.5, 1.25, 0.2], [0.5, 1.25, 0.2], 6, 0.1, 0.06, id); }
  if (L >= 3) { for (const s of [-1, 1]) add(g, sp(0.06, GOLD, s * 0.52, 1.28, 0.0, { q: 1 })); gstar(g, 0.0, 1.5, 0.1, 0.07); butterfly(g, -0.4, 1.2, 0.3, '#c9a8ff', 2); }
});
BUILD.pumpkins = (info) => decorWrap(pumpkinPatchModel, { s: 1.05 }, info, 0.75, (g, L, id) => {
  const pump = (x, z, r, c, glow) => { add(g, sp(r, glow ? lanternMat : c, x, r * 0.85, z, { sx: 1.15, sy: 0.85, q: r < 0.1 ? 1 : 2 }), cyl(0.014, 0.02, r * 0.5, '#7fcf5a', x, r * 1.55, z, 5)); };
  pump(-0.9, -0.8, 0.14, '#ffa23c'); pump(0.95, 0.85, 0.12, '#ffb85a'); pump(-0.95, 0.85, 0.13, '#ff9a4a');
  hayBale(g, 0.95, 0.0, -0.75, 0.15, 0.26, 'x'); bed(g, 0.0, 0.95, 3, 0.4, id); butterfly(g, 0.3, 0.8, 0.4, '#ffd24a');
  if (L >= 2) { pump(0.0, -0.95, 0.15, '#ffa23c', true); pump(-0.5, 0.85, 0.1, '#ffe27a'); bunting(g, [-0.95, 0.5, -0.95], [0.95, 0.5, -0.95], 8, 0.1, 0.06, id); }
  if (L >= 3) { pump(0.55, 0.95, 0.12, '#ffa23c', true); for (const x of [-0.95, 0.95]) { add(g, cyl(0.035, 0.045, 0.52, IRON, x, 0, -0.95, 6)); } gstar(g, 0.0, 0.62, -0.95, 0.07); }
});
BUILD.hammock = (info) => decorWrap(hammockModel, { s: 1.0 }, info, 1.2, (g, L, id) => {
  bed(g, -0.5, 0.45, 3, 0.4, id); bed(g, 0.55, 0.42, 3, 0.4, id + 1); butterfly(g, 0.2, 0.9, 0.3, '#ffa6c9');
  add(g, rb(0.22, 0.2, 0.22, WOODL, 0.1, 0.0, -0.45, 0.04), cyl(0.05, 0.04, 0.07, '#fffaf0', 0.1, 0.2, -0.45, 8), sp(0.02, '#8fd0ff', 0.1, 0.26, -0.45, { q: 0 }));
  if (L >= 2) { for (const s of [-1, 1]) { pot(g, s * 0.98, 0.0, 0.2, 1.1, s > 0 ? P.blossomDeep : P.butter); } add(g, bar(0.92, 1.1, 0.0, 0.92, 1.0, 0.0, 0.012, CREAM)); lantern(g, 0.92, 0.85, 0.0, 0.9, L === 3); }
  if (L >= 3) { for (const s of [-1, 1]) add(g, sp(0.07, GOLD, s * 0.92, 1.24, 0.0, { q: 1 })); bunting(g, [-0.92, 1.18, 0.0], [0.92, 1.18, 0.0], 9, 0.1, 0.06, id); }
});
BUILD.beeskep = (info) => decorWrap(beeSkepModel, { s: 0.95 }, info, 1.0, (g, L, id) => {
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.3, r = 0.4; add(g, cyl(0.012, 0.014, 0.28, '#7fcf5a', Math.cos(a) * r, 0.0, Math.sin(a) * r, 4), sp(0.05, i % 2 ? '#c9a8ff' : '#ffffff', Math.cos(a) * r, 0.3, Math.sin(a) * r, { q: 0, sy: 1.4 })); }
  bed(g, 0.3, 0.45, 2, 0.2, id); bed(g, -0.35, 0.4, 2, 0.2, id + 3);
  if (L >= 2) { add(g, K.lathe([[0.001, 0], [0.16, 0], [0.14, 0.2], [0.001, 0.26]], '#ffd870', -0.38, 0.0, -0.2, { seg: 8 })); add(g, rb(0.2, 0.15, 0.18, WOODL, 0.32, 0.0, -0.32, 0.04)); jar(g, 0.32, 0.15, -0.32, '#ffb23a', 1.0); butterfly(g, 0.1, 0.8, 0.3, '#ffd24a'); }
  if (L >= 3) { gstar(g, 0.0, 1.2, 0.0, 0.07); for (const s of [-1, 1]) add(g, cyl(0.03, 0.04, 0.45, GOLDD, s * 0.46, 0, 0.3, 6), sp(0.05, GOLD, s * 0.46, 0.5, 0.3, { q: 0 })); }
});

//@@END
// ================================================================ export
export const BUILD_TYPES = Object.keys(BUILD);
/** the drawing kit, shared with art/monument.js (same look, same bake and merge) */
export const KIT = { THREE, K, P, soft, gloss, shade, lv, G, add, lit, col, sh, place, bx, rb, cyl, cone, sp, bl, lcyl, ring, fdisc, disc, bar, poly, qd, arch, pk, fence, fuse, star, bunting, lantern, hang, barrel, crate, sack, pot, bed, cat, snail, butterfly, ivy, stones, picket, vane, hayBale, finish, bake, mergeLocal, windowMat, lanternMat, waterMat, fireMat, BUN, BUNL, SPT, SPS, SPM, SPH, FLOWER,
  C: { TIM, TIM2, WOODL, WOOD, PLANK, STONE, STONEL, STONED, IRON, DEEP, GOLD, GOLDD, CREAM, CHIM, CHIMD, BLUSH, MINT, BUTTER, SKYW, PEACH, LILAC, BUNT, CURT } };
