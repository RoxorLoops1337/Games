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
vcMat.onBeforeCompile = (sh_) => { sh_.fragmentShader = sh_.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) && NUM_HEMI_LIGHTS > 0\n totalEmissiveRadiance += vColor * vec3( 1.0, 0.94, 0.88 ) * hemisphereLights[ 0 ].skyColor.g * 0.27;\n#endif'); };
vcMat.customProgramCacheKey = () => 'hvfill2';

// ---------------------------------------------------------------- palette shorthands (all light, warm and happy)
const TIM = '#f2cd90', TIM2 = '#eab97a', WOODL = '#ffe0a8', WOOD = '#f3bd7c', PLANK = '#f8d49a';   // honey woods
const STONE = '#ece5d8', STONEL = '#fbf7ee', STONED = '#cfc6dc';                                      // light warm stone
const IRON = '#9c8fc4', DEEP = '#8a7498', GOLD = P.gold, GOLDD = '#f5b52a', CREAM = '#fffaf0';
const CHIM = '#ffa08c', CHIMD = '#f08a76';
const BLUSH = '#ffb0c8', MINT = '#9fe8c0', BUTTER = '#ffe46a', SKYW = '#a6d6ff', PEACH = '#ffbf94', LILAC = '#cfb8ff';
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
const SPH = new THREE.SphereGeometry(1, 10, 7), SPL = new THREE.SphereGeometry(1, 7, 5), ICO = new THREE.IcosahedronGeometry(1, 0), OCT = new THREE.OctahedronGeometry(1, 0);
/** plain box, bottom at y */
function bx(w, h, d, c, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(BOXN, col(c)); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); return sh(m); }
/** rounded box (1 bevel segment), bottom at y */
function rb(w, h, d, c, x = 0, y = 0, z = 0, r) {
  if (Math.min(w, h, d) < 0.2) return bx(w, h, d, c, x, y, z);
  r = r ?? Math.min(0.08, w / 3.2, h / 3.2, d / 3.2); const f = (v) => +v.toFixed(3);
  const m = new THREE.Mesh(K.roundedBoxGeo(f(w), f(h), f(d), r, 1), col(c)); m.position.set(x, y + h / 2, z); return sh(m);
}
const cyl = (rt, rb_, h, c, x = 0, y = 0, z = 0, seg = 8) => K.cyl(rt, rb_, h, typeof c === 'string' ? c : null, x, y, z, typeof c === 'string' ? { seg } : { seg, mat: c });
const cone = (r, h, c, x = 0, y = 0, z = 0, seg = 4, rot) => K.cone(r, h, typeof c === 'string' ? c : null, x, y, z, typeof c === 'string' ? { seg, rot } : { seg, rot, mat: c });
function sp(r, c, x = 0, y = 0, z = 0, o = {}) { const m = new THREE.Mesh(r < 0.06 ? OCT : r < 0.09 ? ICO : (o.lo || r < 0.2) ? SPL : SPH, col(c)); m.scale.set(r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1)); m.position.set(x, y, z); return sh(m); }
function bl(r, c, x = 0, y = 0, z = 0, sy = 1, ry = 0) { const m = new THREE.Mesh(r <= 0.09 ? OCT : ICO, col(c)); m.scale.set(r, r * sy, r); m.position.set(x, y, z); m.rotation.y = ry; return sh(m); }
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
const _up = new THREE.Vector3(0, 1, 0);
function bar(ax, ay, az, bx_, by, bz, t, c) {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx_, by, bz), d = b.clone().sub(a), len = d.length();
  const m = new THREE.Mesh(BOXG, col(c)); m.scale.set(t, len, t); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(_up, d.normalize()); return sh(m);
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
    add(g, fdisc(r + 0.05, fr, 0, 0, 0.026, 0, false, 10), fdisc(r, windowMat, 0, 0, 0.03, 0, false, 10), bx(0.025, w, 0.03, fr, 0, -r, 0.05), bx(w, 0.025, 0.03, fr, 0, -0.0125, 0.05));
    if (o.curt) add(g, bx(w * 0.22, w * 0.7, 0.03, o.curt, -r * 0.66, -r * 0.35, 0.05), bx(w * 0.22, w * 0.7, 0.03, o.curt, r * 0.66, -r * 0.35, 0.05));
    return g;
  }
  add(g, bx(w + 0.1, rect + 0.05, 0.05, fr, 0, -h / 2 - 0.05, 0), fdisc(r + 0.05, fr, 0, h / 2 - r, 0.026, 0, true, 8),
    bx(w, rect, 0.05, windowMat, 0, -h / 2, 0.02), fdisc(r, windowMat, 0, h / 2 - r, 0.046, 0, true, 8),
    bx(0.025, h, 0.03, fr, 0, -h / 2, 0.05), bx(w, 0.025, 0.03, fr, 0, -0.0125, 0.05), bx(w + 0.16, 0.06, 0.11, fr, 0, -h / 2 - 0.1, 0.04));
  if (o.curt) for (const s of [-1, 1]) add(g, bx(w * 0.3, rect * 0.95, 0.03, o.curt, s * (w / 2 - w * 0.15), -h / 2 + 0.02, 0.055));
  if (o.shut) for (const s of [-1, 1]) add(g, bx(0.1, h + 0.04, 0.04, o.shut, s * (w / 2 + 0.12), -h / 2 - 0.04, 0.03));
  if (o.box) {
    const cs = o.flowers || [P.blossomDeep, P.butter, P.white, '#c9a8ff'], bc = o.boxC || '#fff3d6';
    add(g, bx(w + 0.14, 0.1, 0.12, bc, 0, -h / 2 - 0.22, 0.08), bl(0.09, P.leafLight, 0, -h / 2 - 0.1, 0.09, 0.7, 0.3));
    for (let i = 0; i < 3; i++) add(g, bl(0.05, cs[i % cs.length], (i - 1) * w * 0.34, -h / 2 - 0.08, 0.11, 1, i));
  }
  return g;
}
/** arched door, origin = bottom centre, faces +z. o: gold, mat (welcome mat colour), stones */
function door3(w = 0.32, h = 0.52, c = TIM2, o = {}) {
  const g = new THREE.Group(), r = w / 2, kc = o.gold ? GOLD : GOLDD;
  add(g, bx(w + 0.14, h - r + 0.02, 0.05, CREAM, 0, 0, -0.01), fdisc(r + 0.07, CREAM, 0, h - r, 0.016, 0, true, 8),
    bx(w, h - r, 0.05, c, 0, 0, 0.02), fdisc(r, c, 0, h - r, 0.046, 0, true, 8),
    fdisc(r * 0.42, windowMat, 0, h - r - 0.03, 0.056, 0, false, 8), fdisc(r * 0.42 + 0.025, CREAM, 0, h - r - 0.03, 0.052, 0, false, 8),
    bx(0.02, h * 0.5, 0.012, shade(c, 0.35), 0, 0, 0.05), sp(0.028, kc, w * 0.3, h * 0.38, 0.065), rb(w + 0.34, 0.07, 0.24, STONEL, 0, -0.03, 0.1, 0.03));
  if (o.mat) add(g, rb(w * 0.9, 0.025, 0.2, o.mat, 0, 0.0, 0.34, 0.012), bx(w * 0.7, 0.012, 0.03, CREAM, 0, 0.025, 0.34));
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
  add(k, sp(0.1, c, 0, 0.09, 0, { sy: 0.85, sz: 1.15 }), sp(0.075, c, 0, 0.2, 0.09), cone(0.03, 0.06, c, -0.045, 0.24, 0.09, 3, 0), cone(0.03, 0.06, c, 0.045, 0.24, 0.09, 3, 0),
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
    pv.add(rb(len, t, Ls, rc, 0, -t, 0, 0.06), lcyl('x', t * 0.62, len, roll, 0, -t * 0.45, s * (Ls / 2), 6));
    if (scal) {
      const n = Math.max(3, Math.round(len / 0.25)), rs = len / (2 * n);
      for (let k = 0; k < rows; k++) { const m = k % 2 ? n - 1 : n, off = k % 2 ? rs : 0; for (let i = 0; i < m; i++) pv.add(disc(rs * 0.98, k % 2 ? lt2 : lt, -len / 2 + off + rs * (2 * i + 1), 0.006 + (rows - k) * 0.008, s * (Ls / 2 - 0.02 - rs * 0.9 - k * rs * 1.05), 6)); }
    }
    R.add(pv);
  }
  const rcol = ridgeCol || shade(rc, 0.22);
  R.add(lcyl('x', 0.072, len + 0.02, rcol, 0, rise + 0.01, 0, 6), bl(0.11, rcol, len / 2 + 0.01, rise + 0.01, 0), bl(0.11, rcol, -len / 2 - 0.01, rise + 0.01, 0));
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
function bake(root) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh || o.material.userData.special || o.material.isMeshBasicMaterial) return;
    const g = o.geometry.clone(), pos = g.attributes.position, nor = g.attributes.normal, c = o.material.color, mw = o.matrixWorld, buf = new Float32Array(pos.count * 3);
    nm.getNormalMatrix(mw);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw); n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      let s = 0.14 * Math.max(0, 1 - v.y / 0.45);          // wall bases: a whisper of lavender shade (fake AO strength <= 0.18)
      if (n.y < -0.35) s += 0.1;                           // undersides (eaves, awnings)
      const up = n.y > 0.5 ? 1.16 : 1.1;   // high-key lift: pastels stay light even on shaded faces
      buf[i * 3] = c.r * up * (1 - s + s * LAV.r); buf[i * 3 + 1] = c.g * up * (1 - s + s * LAV.g); buf[i * 3 + 2] = c.b * up * (1 - s + s * LAV.b);
    }
    g.setAttribute('color', new THREE.BufferAttribute(buf, 3)); o.geometry = g; o.material = vcMat;
  });
}
function finish(root, topY, foot) {
  const anchors = []; root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.name === 'chimney') anchors.push(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)); });
  if (foot) { const s = contact(foot[0], foot[1], foot[2] ?? 1); if (s) root.add(s); }
  if (globalThis.__prof) { const rows = {}; root.traverse((o) => { if (o.isMesh) { const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; const k = g.type.replace('Geometry','') + ' ' + Math.round(t) + 't ' + o.material.color.getHexString(); rows[k] = rows[k] || [0, 0]; rows[k][0]++; rows[k][1] += t; } }); globalThis.__prof(rows); }
  bake(root); root.userData.topY = topY;
  const out = K.mergeStatic(root);
  for (const p of anchors) { const e = new THREE.Object3D(); e.name = 'chimney'; e.position.copy(p); out.add(e); }
  out.userData.topY = topY; return out;
}

/** cottage shell: light stone foundation, chubby pastel walls, cream corner posts and plates. returns wall top y */
function shell(g, W, D, H, wallC, o = {}) {
  const f = o.found ?? 0.16, z0 = o.z ?? 0, x0 = o.x ?? 0, tc = o.trim || CREAM;
  add(g, rb(W + 0.14, f + 0.06, D + 0.14, o.foundC || STONE, x0, 0, z0, 0.07), rb(W, H, D, wallC, x0, f - 0.02, z0, 0.13));
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
  add(g, K.lathe([[0.001, 0], [0.34, 0], [0.38, 0.12], [0.35, 0.3], [0.26, 0.45], [0.12, 0.54], [0.001, 0.57]], '#ffc5a0', 0.78, 0, -0.2, { seg: 12 }));
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
  const top = shell(g, W, D, H, wallC, { trim: L === 3 ? '#fff0b0' : CREAM });
  const rise = [0.8, 0.92, 1.05][L - 1], ry0 = top + 0.07;
  roof(g, { y: ry0, span: 1.88, len: D + 0.32, rise, col: rc, ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.16, flower: '#ffd24a' } });
  for (let i = 0; i < 9; i++) add(g, bx(0.012, H - 0.12, 0.01, shade(wallC, -0.12), -0.64 + i * 0.16, 0.2, D / 2 + 0.005));
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
  add(g, rb(0.9, 0.8, 0.08, '#b8ecd8', bayX, 0.14, -0.72, 0.04)); for (let i = 0; i < 5; i++) add(g, bx(0.012, 0.7, 0.01, shade('#b8ecd8', -0.12), bayX - 0.36 + i * 0.18, 0.18, -0.675));
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
  add(g, K.lathe([[0.001, 0.2], [R, 0.2], [R + 0.05, 0.3], [R + 0.03, 0.55]], b3, 0, 0, 0, { seg: 14 }));
  add(g, K.lathe([[R + 0.03, 0.55], [R, 0.72], [R - 0.1, 0.9], [R - 0.2, 1.02]], b1, 0, 0, 0, { seg: 14 }));
  add(g, K.lathe([[R - 0.2, 1.02], [R - 0.34, 1.12], [R - 0.5, 1.2], [R - 0.58, 1.26], [0.001, 1.32]], b2, 0, 0, 0, { seg: 14 }));
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
  add(tw, K.lathe([[0.001, 0.1], [0.7, 0.1], [0.72, 0.25], [0.66, 0.5]], STONEL, 0, 0, 0, { seg: 12 }));
  add(tw, K.lathe([[0.66, 0.5], [0.6, 1.0], [0.52, 1.5], [0.46, 1.62]], plaster, 0, 0, 0, { seg: 12 }));
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
  add(g, K.lathe([[0.001, 0.12], [0.74, 0.12], [0.76, 0.3], [0.7, 0.45]], STONEL, 0, 0, -0.1, { seg: 12 }));
  add(g, K.lathe([[0.7, 0.45], [0.62, 1.0], [0.54, 1.5], [0.5, 1.75]], wall, 0, 0, -0.1, { seg: 12 }));
  add(g, cyl(0.66, 0.66, 0.05, CREAM, 0, 0.98, -0.1, 12), cyl(0.57, 0.57, 0.05, CREAM, 0, 1.45, -0.1, 12));
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.4; add(g, bar(Math.sin(a) * 0.62, 0.5, -0.1 + Math.cos(a) * 0.62, Math.sin(a) * 0.51, 1.72, -0.1 + Math.cos(a) * 0.51, 0.03, wall2)); }
  const cy = 1.75;
  add(g, cyl(0.56, 0.52, 0.12, CREAM, 0, cy - 0.02, -0.1, 12), K.lathe([[0.6, cy + 0.08], [0.58, cy + 0.2], [0.47, cy + 0.38], [0.26, cy + 0.52], [0.001, cy + 0.58]], L === 3 ? GOLD : '#ff8fb0', 0, 0, -0.1, { seg: 12 }));
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
  if (L === 3) { add(g, cyl(0.62, 0.62, 0.04, GOLDD, 0, 1.0, -0.1, 12)); cat(g, 0.6, 0.16, 0.7, '#ffc890', 0.5); }
  const out = finish(g, cy + 0.9, [2.2, 2.1, 0.9]); out.add(sails); return out;
};

// ---------------------------------------------------------------- MARKET (striped stall)
BUILD.market = (info) => {
  const L = lv(info), g = G(), own = info.color || P.red, S1 = '#ff9fbd';
  add(g, rb(1.84, 0.1, 1.76, STONE, 0, 0, 0, 0.05));
  const ph = L === 3 ? 1.36 : 1.26, hi = ph + 0.12, lo = ph - 0.4, Z0 = -0.82, Z1 = 0.5;
  for (const sx of [-1, 1]) add(g, rb(0.12, ph, 0.12, CREAM, sx * 0.82, 0.1, -0.7, 0.05), rb(0.12, lo + 0.02, 0.12, CREAM, sx * 0.82, 0.1, 0.4, 0.05));
  add(g, rb(1.6, 0.95, 0.06, MINT, 0, 0.1, -0.74, 0.025)); for (let i = 0; i < 7; i++) add(g, bx(0.012, 0.85, 0.01, shade(MINT, -0.12), -0.66 + i * 0.22, 0.14, -0.705));
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
  add(g, K.lathe([[0.001, 0], [0.84, 0], [0.9, 0.1], [0.9, 0.34], [0.78, 0.38], [0.78, 0.3]], STONEL, 0, 0, 0, { seg: 16 }));
  add(g, K.lathe([[0.74, 0.3], [0.74, 0.4], [0.88, 0.42], [0.95, 0.36], [0.93, 0.3]], '#fff6e8', 0, 0, 0, { seg: 16 }));
  add(g, cyl(0.78, 0.78, 0.03, waterMat, 0, 0.3, 0, 16));
  add(g, cyl(0.16, 0.22, 0.36, STONEL, 0, 0.3, 0, 8), K.lathe([[0.001, 0.62], [0.32, 0.7], [0.4, 0.82], [0.3, 0.8], [0.001, 0.7]], STONEL, 0, 0, 0, { seg: 12 }), cyl(0.09, 0.12, 0.3, STONEL, 0, 0.68, 0, 8));
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
/** stage 'empty' | 'grow' | 'ripe', crop 0..1. no allocation. */
export function setFarmStage(group, stage, crop) {
  const crops = group.userData.crops || (group.userData.crops = group.getObjectByName('crops')); if (!crops) return;
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

// ================================================================ export
export const BUILD_TYPES = Object.keys(BUILD);
