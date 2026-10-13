// Hearthvale villagers, ROUND 3 "Happy Light, a little more AAA": chubby, bright, friendly toy people with polished detail. All procedural, ~1.0 unit tall.
//
// WHAT THE RESEARCH TAUGHT ME (craft notes + cozy life-sim character analysis), applied below:
//  1. Instantly friendly = baby schema: big round head, eyes set LOW and WIDE, chubby cheeks, short limbs. Head is ~1:1.7 to the body.
//  2. Cozy life-sims use glossy dot eyes with a big highlight; the "AAA" upgrade is LAYERS: dark base, tinted iris with a lighter lower rim, pupil, a big
//     and a small highlight, a lash line and a subtle eyebrow. Same grammar, more depth, and it still reads from the game camera.
//  3. Colour-blocked outfits in clean pastel candy colours with ONE accent. The owner colour is only the small accent (collar, hat band, scarf).
//  4. Inclusive design done respectfully: five skin tones, hair TEXTURES (afro, puffs, curls, braids, buns, straight), headwear as plain everyday
//     clothes, glasses, ages and builds. Every face keeps the same cute grammar, so nobody is a caricature and nobody is "the default".
//  5. Dark skin must be lit like light skin: saturated WARM base, lighter warm top, warm rosy blush, a warm "subsurface" shade in the creases (ears,
//     chin, under the fringe) instead of a grey shade, plus a faint warm emissive lift and a fresnel rim light so silhouettes pop off the grass.
//  6. Cloth detail is painted into VERTEX COLOURS: soft fold bands, underside ambient occlusion, a stitched hem, buttons, pockets, belts with buckles.
//  7. LEVEL OF DETAIL: the same villager can be built 'high' (near camera, <= 3200 tris), default 'mid' (<= 2100), or 'low' (far, <= 900 tris).
//  8. Animation = timing. Tool strokes have ANTICIPATION (a small dip, then the wind-up), a fast strike, IMPACT squash, and FOLLOW-THROUGH
//     (overshoot, damped settle). Walking is a hop, idle breathes and plays little variants (look around, stretch, wave).
//  9. Emotes are floating bubbles (one pooled quad per villager, one shared icon atlas, billboarded in the vertex shader) that pop in with ease-out-back.
//
// Contract (same as always): group children `body` (everything that bobs, head included) and `arm` (right arm, pivot at the shoulder,
// rotation.x swings the tool). Extra named children for setPose: legL, legR, armL (left arm), plus `head`, `eyes`.
import * as THREE from 'three';
import { soft, gloss, groundShadow, mergeStatic, rng, roundedBoxGeo } from './artkit.js';
import { P } from './palette.js';

// ---------------------------------------------------------------- small helpers
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
const _hsl = {};
/** lighten in HSL (keeps the chroma: candy-bright, not chalky) */
const light = (c, t = 0.3) => { const k = new THREE.Color(c); k.getHSL(_hsl); k.setHSL(_hsl.h, Math.min(1, _hsl.s * (1 + t * 0.25)), _hsl.l + (1 - _hsl.l) * t * 0.85); return '#' + k.getHexString(); };
const sat = (c, f) => { const k = new THREE.Color(c); k.getHSL(_hsl); k.setHSL(_hsl.h, Math.min(1, _hsl.s * f), _hsl.l); return '#' + k.getHexString(); };
const dark = (c, t = 0.25) => mixHex(c, '#6a4a7a', t); // shadows lean violet, never black
/** vertex colour spec: base | colour at the top (by normal.y) | options: f = cloth folds, w = warm (skin) shade, z = radial (centre = 2nd colour), i = invert, n = no AO */
const G = (a, b, o) => a + '|' + (b || a) + (o ? '|' + o : '');
const lum = (c) => { const k = new THREE.Color(c); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b; };
const ease = { inOut: (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x))), out: (x) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 3, back: (x) => { x = Math.max(0, Math.min(1, x)); return 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2; } };

// ---------------------------------------------------------------- level of detail
const LOD_ID = { low: 0, mid: 1, default: 1, high: 2 };
/** triangle budgets per lod (counted over EVERY mesh, hidden mood swaps included) */
export const LOD_BUDGET = { low: 850, mid: 2000, high: 3080 };
const BUDGETS = [850, 2000, 3080];
let Q = 1; // geometry quality of the villager being built (0 low, 1 mid, 2 high)

// ---------------------------------------------------------------- geometry library (cached per quality, coloured by vertex colour)
const sp = (w, h) => () => new THREE.SphereGeometry(1, w, h);
const cap = (w, h, k) => () => new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI * k);
const hemi = (w, h) => () => new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2); // flat back, dome towards +Z (for face decals)
const HEAD_W = [8, 16, 19], HEAD_H = [6, 11, 13]; // the head sphere's segments; hair caps copy its tessellation so they never poke through it
const capQ = (q, f) => { const r = Math.max(2, Math.round(HEAD_H[q] * f)); return () => new THREE.SphereGeometry(1, HEAD_W[q], r, 0, Math.PI * 2, 0, Math.PI * r / HEAD_H[q]); };
const shl = (w, r, k) => () => new THREE.SphereGeometry(1, w, r, 0, Math.PI * 2, 0, Math.PI * k).rotateX(Math.PI / 2); // front shell (pole towards +Z): clothing layered OVER the torso, never intersecting it
const cn = (n) => () => new THREE.ConeGeometry(1, 1, n).translate(0, 0.5, 0), cy = (n) => () => new THREE.CylinderGeometry(1, 1, 1, n), tr = (r, a, b, arc) => () => new THREE.TorusGeometry(1, r, a, b, arc);
const SEG = { // [low, mid, high]
  dot: [sp(4, 2), sp(5, 3), sp(6, 4)],
  sphS: [sp(4, 3), sp(6, 4), sp(7, 4)],
  sph: [sp(5, 3), sp(7, 5), sp(8, 5)],
  sphT: [sp(5, 3), sp(8, 5), sp(10, 7)],
  sphM: [sp(6, 4), sp(10, 7), sp(11, 8)],
  head: [sp(HEAD_W[0], HEAD_H[0]), sp(HEAD_W[1], HEAD_H[1]), sp(HEAD_W[2], HEAD_H[2])],
  hemiB: [hemi(8, 2), hemi(12, 2), hemi(18, 2)], sphB: [sp(4, 3), sp(8, 5), sp(9, 5)], hemiT: [hemi(4, 2), hemi(5, 2), hemi(6, 2)], hemi: [hemi(5, 2), hemi(8, 3), hemi(10, 3)], hemiS: [hemi(5, 2), hemi(7, 2), hemi(12, 2)], hemiE: [hemi(7, 2), hemi(10, 2), hemi(18, 2)],
  capA: [capQ(0, 0.3), capQ(1, 0.3), capQ(2, 0.3)], capB: [capQ(0, 0.4), capQ(1, 0.4), capQ(2, 0.4)], capC: [capQ(0, 0.5), capQ(1, 0.5), capQ(2, 0.5)],
  shellA: [shl(7, 2, 0.27), shl(10, 3, 0.27), shl(14, 4, 0.27)], shellB: [shl(7, 3, 0.56), shl(10, 4, 0.56), shl(14, 6, 0.56)],
  cone6: [cn(4), cn(5), cn(8)], cone8: [cn(5), cn(7), cn(12)],
  cyl8: [cy(4), cy(5), cy(8)], cyl12: [cy(6), cy(9), cy(12)],
  box: [() => roundedBoxGeo(1, 1, 1, 0.22, 1).clone(), () => roundedBoxGeo(1, 1, 1, 0.22, 1).clone(), () => roundedBoxGeo(1, 1, 1, 0.22, 1).clone()],
  bx: [() => new THREE.BoxGeometry(1, 1, 1), () => new THREE.BoxGeometry(1, 1, 1), () => new THREE.BoxGeometry(1, 1, 1)],
  tor: [tr(0.26, 3, 5), tr(0.26, 3, 9), tr(0.26, 5, 14)],
  torS: [tr(0.2, 3, 6), tr(0.2, 3, 8), tr(0.2, 4, 12)],
  torT: [tr(0.09, 3, 6), tr(0.09, 3, 10), tr(0.09, 3, 14)],
  arcM: [tr(0.11, 3, 5, Math.PI * 0.72), tr(0.11, 3, 6, Math.PI * 0.72), tr(0.11, 3, 8, Math.PI * 0.72)],
  torH: [tr(0.2, 3, 6), tr(0.2, 3, 12), tr(0.2, 3, 16)],
  arcT: [tr(0.2, 3, 4, Math.PI), tr(0.2, 3, 5, Math.PI), tr(0.2, 4, 9, Math.PI)],
  arcB: [tr(0.3, 3, 5, Math.PI), tr(0.3, 3, 6, Math.PI), tr(0.28, 3, 8, Math.PI)],
  arcL: [tr(0.1, 3, 5, Math.PI), tr(0.1, 3, 6, Math.PI), tr(0.1, 3, 7, Math.PI)],
};
const geoCache = new Map(), colGeoCache = new Map(), bbCache = new Map();
const SHADE_V = new THREE.Color('#8f72b0'), SHADE_W = new THREE.Color('#d9785f');
function baseGeo(kind) { const k = Q + kind; let b = geoCache.get(k); if (!b) { b = SEG[kind][Q](); b.computeBoundingBox(); geoCache.set(k, b); } return b; }
function colored(kind, color) {
  const k = Q + kind + color; let g = colGeoCache.get(k);
  if (!g) {
    const b = baseGeo(kind), noAO = kind.startsWith('hemi') || kind === 'dot';
    g = b.clone(); g.userData.kind = kind; const [c0s, c1s, opt = ''] = color.split('|'); const c0 = new THREE.Color(c0s), c1 = c1s && c1s !== c0s ? new THREE.Color(c1s) : null;
    const n = g.attributes.position.count, a = new Float32Array(n * 3), nr = g.attributes.normal, ps = g.attributes.position, tmp = new THREE.Color();
    const fold = opt.includes('f'), warm = opt.includes('w'), rad = opt.includes('z'), inv = opt.includes('i'), skipAO = noAO || opt.includes('n'), sh = warm ? SHADE_W : SHADE_V, y0 = b.boundingBox.min.y, yh = Math.max(1e-6, b.boundingBox.max.y - y0);
    for (let i = 0; i < n; i++) {
      tmp.copy(c0);
      if (c1) { let t; if (rad) t = (nr.getZ(i) - 0.3) / 0.65; else { t = (nr.getY(i) - 0.05) / 0.8; if (inv) t = 1 - t - 0.2; } t = Math.max(0, Math.min(1, t)); tmp.lerp(c1, t * t * (3 - 2 * t)); }
      const px = ps.getX(i), py = ps.getY(i), pz = ps.getZ(i);
      if (fold) { const kf = 0.5 + 0.5 * Math.sin(Math.atan2(px, pz) * 5 + py * 3.4 + 1.1); tmp.multiplyScalar(1 - 0.1 * kf * kf); }
      if (!skipAO) { const s = 1 - (py - y0) / yh; tmp.lerp(sh, (warm ? 0.2 : 0.2) * s * s); }
      a[i * 3] = tmp.r; a[i * 3 + 1] = tmp.g; a[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); colGeoCache.set(k, g);
  }
  return g;
}
// a faint warm emissive lifts every shadow (high-key look; skin never goes muddy) and a fresnel RIM (shared uniform) lights the silhouette
export const rimU = { value: 0.2 };
/** dim or brighten the rim light of every villager (the game can lower it at night). 0..1 */
export function setVillagerRim(v) { rimU.value = v; }
function withRim(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rimU;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRim;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4); totalEmissiveRadiance += vec3(1.0, 0.82, 0.66) * rimF * uRim * (0.4 + 0.6 * diffuseColor.r);');
  };
  m.customProgramCacheKey = () => 'hv-rim1'; return m;
}
const vcMat = withRim(soft('#ffffff', { vertexColors: true, emissive: '#ffb890', emissiveIntensity: 0.1 }));
const eyeMat = gloss('#ffffff', { vertexColors: true, roughness: 0.12 });
const hiMat = soft('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.9 });

/** unit mesh of `kind`, vertex-coloured, scaled (sx,sy,sz), euler (rx,ry,rz) in YXZ order. col may be a gradient G(base, top, opts). */
function mk(kind, col, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, mat = vcMat) {
  if (kind === 'sph' && Math.max(sx, sy, sz) <= 0.05) kind = 'dot'; else if ((kind === 'hemi' || kind === 'hemiS') && Math.max(sx, sy) <= 0.03) kind = 'hemiT'; else if (kind === 'hemi' && Math.max(sx, sy) <= 0.05) kind = 'hemiS';
  const isDot = kind === 'dot';
  const m = new THREE.Mesh(colored(kind, col), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.order = 'YXZ'; m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true; if (isDot) m.userData.opt = 1; return m;
}
/** merge a list of meshes into the few meshes of a Group (one per material) */
function bake(list, name) {
  const g = new THREE.Group(); for (const m of list) g.add(m);
  const out = mergeStatic(g); if (name) out.name = name; return out;
}

// ---------------------------------------------------------------- head geometry constants and face placement
const HX = 0.35, HY = 0.31, HZ = 0.32, HEAD_Y = 0.7;
/** place a unit mesh on the head surface at (x,y), pushed `off` along the normal, facing outwards. */
function fm(kind, col, x, y, off, sx, sy, sz, spin = 0, mat = vcMat) {
  const zf = HZ * Math.sqrt(Math.max(0.0001, 1 - (x / HX) ** 2 - (y / HY) ** 2));
  let nx = x / (HX * HX), ny = y / (HY * HY), nz = zf / (HZ * HZ); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
  return mk(kind, col, x + nx * off, y + ny * off, zf + nz * off, sx, sy, sz, -Math.asin(ny), Math.atan2(nx, nz), spin, mat);
}

// ---------------------------------------------------------------- data: professions, colours
export const PROFESSIONS = [
  { id: 'woodcutter', tool: 'axe', accent: '#d9955a', style: 'tunic', hats: ['cap', 'bandana', 'beanie', 'messy', 'baldcap'] },
  { id: 'miner', tool: 'pick', accent: '#9fb0e0', style: 'overalls', hats: ['hard', 'hard', 'bandana', 'beanie'] },
  { id: 'farmer', tool: 'hoe', accent: '#ffd45a', style: 'overalls', hats: ['straw', 'straw', 'straw', 'bandana', 'pigtails', 'braids'] },
  { id: 'builder', tool: 'hammer', accent: '#ff9a4a', style: 'apron', hats: ['cap', 'hard', 'bandana', 'baldcap', 'turban'] },
  { id: 'cook', tool: 'ladle', accent: '#fff4dc', style: 'apron', hats: ['chef', 'chef', 'chef', 'bun', 'headscarf'] },
  { id: 'scholar', tool: 'scroll', accent: '#b690f0', style: 'cloak', hats: ['elf', 'bun', 'long', 'crown', 'topknot'] },
  { id: 'gatherer', tool: 'basket', accent: '#8fe06a', style: 'tunic', hats: ['flowers', 'flowers', 'pigtails', 'hood', 'straw', 'twinbuns'] },
  { id: 'villager', tool: 'none', accent: '#f0b878', style: 'tunic', hats: null },
];
const TOOLS = ['none', 'axe', 'pick', 'hoe', 'hammer', 'ladle', 'scroll', 'basket'];
const STYLES = ['apron', 'overalls', 'tunic', 'cloak'];
const GEARS = ['short', 'short', 'messy', 'bun', 'twinbuns', 'topknot', 'pigtails', 'long', 'long', 'bob', 'bob', 'afro', 'afro', 'afroPuffs', 'curly', 'curly', 'braids', 'baldcap',
  'turban', 'headscarf', 'headscarf', 'beanie', 'straw', 'flowers', 'bandana', 'cap', 'hood'];
// cheerful, clearly different outfit colours: saturated ones plus pastels. NO dark colours.
const OUTFITS = ['#ff6f61', '#4f9cf2', '#ffbf1f', '#4fcf6e', '#a96af0', '#ff7fb8', '#2fc4bc', '#ff8c3a',
  '#6fdca0', '#ffd84a', '#ff9f78', '#b79aff', '#7ac4ff', '#ff90bc', '#a4de3c', '#58d8e4', '#f08ce0', '#ffe66a'];
const PANTS = ['#e8c9a0', '#9bc0f0', '#f0b8a8', '#b4dc98', '#d4c0f0', '#f4d890', '#a8d8d0', '#f4b0c8'];
const BOOTS = ['#c98a58', '#e2a070', '#e8c068', '#9ab6e8', '#c9a0e0', '#f0907a'];
// hair: [colour, weight, name]; warm browns plus fun colours; the deepest is a warm chocolate (never black), <= ~12%
const HAIRS = [['#4a2e2e', 6, 'chocolate'], ['#6e4630', 9, 'brown'], ['#92532e', 9, 'chestnut'], ['#c27a34', 8, 'caramel'], ['#f0b53c', 9, 'honey'], ['#f6dd8e', 6, 'blonde'],
  ['#e8602c', 9, 'ginger'], ['#b08cf5', 9, 'lilac'], ['#ff7eb0', 9, 'pink'], ['#38c0b0', 8, 'teal'], ['#eeeef6', 5, 'silver'], ['#7ab8ff', 6, 'sky'], ['#6fdca0', 6, 'mint']];
const ELDER_HAIRS = [['#eeeef6', 40, 'silver'], ['#e0dcd0', 30, 'ash'], ['#d9d0ee', 15, 'lilac-silver'], ['#f4e4c0', 15, 'cream']];
const SKIN_W = [22, 22, 22, 20, 14]; // peach, light, tan, golden brown, deep brown
// iris colours (variety): brown, hazel, blue, green, violet, amber
const IRIS = ['#7a4a3a', '#8a6a2a', '#3a78c0', '#3a9a62', '#8a56c0', '#c8802a'];
const wpick = (rnd, list, wi = 1) => { let s = 0; for (const e of list) s += Array.isArray(e) ? e[wi] : e; let r = rnd() * s; for (let i = 0; i < list.length; i++) { r -= Array.isArray(list[i]) ? list[i][wi] : list[i]; if (r <= 0) return i; } return list.length - 1; };

// ---------------------------------------------------------------- hair / hat builders (head-local coordinates, y up, z = face)
const capOn = (kind, col, s = 1.04, tilt = -0.3, dy = 0, dz = 0, sy = 1) => mk(kind, col, 0, dy, dz, HX * s, HY * s * sy, HZ * s, tilt);
const hairCap = (c, o, s = 1.045, tilt = -0.34) => c.push(capOn('capB', o.hairG, s, tilt));
function fringe(c, o) {
  for (const [x, y, r] of [[-0.17, 0.165, 0.078], [0, 0.195, 0.08], [0.17, 0.165, 0.078]]) { const f = fm('sphB', o.hairG, x, y, -0.01, r * 1.1, r * 0.8, r * 0.55); f.userData.opt = 1; c.push(f); }
  if (Q >= 1) for (const [x, y, r] of [[-0.09, 0.19, 0.06], [0.09, 0.19, 0.06], [-0.255, 0.1, 0.06], [0.255, 0.1, 0.06]]) { const f = fm('sphB', o.hairG, x, y, -0.012, r * 1.1, r * 0.8, r * 0.5); f.userData.opt = 1; c.push(f); }
}
/** a hair parting: a thin darker ridge across the crown (high lod) */
function parting(c, o) { if (Q < 2) return; for (const [x, y, z] of [[-0.07, 0.3, -0.03], [-0.085, 0.265, 0.07], [-0.09, 0.225, 0.16]]) { const m = mk('dot', o.hairD, x, y, z, 0.022, 0.013, 0.028); m.userData.opt = 1; c.push(m); } }
const ribbon = (c, o, x, y, z, s = 0.05) => c.push(mk('sphS', o.ribbon, x, y, z, s, s * 0.8, s * 0.8));
/** a tapered hair lock (teardrop) with proper smooth normals, tip pointing along (rx, rz) rotation */
const lock = (c, col, x, y, z, w, l, rx = 0, rz = 0) => c.push(mk('sphS', col, x, y, z, w, l, w * 0.9, rx, 0, rz));
const GEAR = {
  short(c, o) { hairCap(c, o); fringe(c, o); parting(c, o); if (Q >= 2) { lock(c, o.hairG, -0.3, 0.02, 0.12, 0.05, 0.08, 0, -0.3); lock(c, o.hairG, 0.3, 0.02, 0.12, 0.05, 0.08, 0, 0.3); } },
  messy(c, o) {
    hairCap(c, o); fringe(c, o);
    for (let i = 0; i < (Q >= 2 ? 9 : 6); i++) { const n = Q >= 2 ? 9 : 6, a = i / n * Math.PI * 2 + 0.4, rr = 0.17; c.push(mk('cone6', o.hairG, Math.sin(a) * rr, 0.25, Math.cos(a) * rr * 0.9 - 0.02, 0.08, 0.16, 0.08, Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7)); }
    c.push(mk('cone6', o.hairG, 0.04, 0.3, 0.1, 0.05, 0.22, 0.05, 0.5, 0, -0.5));
  },
  bun(c, o) { hairCap(c, o); fringe(c, o); parting(c, o); c.push(mk('sphM', o.hairG, 0, 0.36, -0.1, 0.13, 0.12, 0.13), mk('tor', o.ribbon, 0, 0.28, -0.1, 0.09, 0.09, 0.07, Math.PI / 2)); },
  twinbuns(c, o) { hairCap(c, o); fringe(c, o); for (const s of [-1, 1]) c.push(mk('sphM', o.hairG, s * 0.23, 0.28, -0.05, 0.125, 0.12, 0.12), mk('tor', o.ribbon, s * 0.2, 0.22, -0.04, 0.085, 0.085, 0.07, Math.PI / 2, 0, s * 0.5)); },
  topknot(c, o) { hairCap(c, o, 1.045, -0.4); fringe(c, o); c.push(mk('sph', o.hairG, 0, 0.32, -0.04, 0.07, 0.06, 0.07), mk('sphM', o.hairG, 0, 0.4, -0.04, 0.11, 0.1, 0.11), mk('tor', o.ribbon, 0, 0.33, -0.04, 0.075, 0.075, 0.06, Math.PI / 2)); },
  pigtails(c, o) {
    hairCap(c, o, 1.045, -0.3); fringe(c, o);
    for (const s of [-1, 1]) { c.push(mk('sph', o.hairG, s * 0.37, -0.1, -0.08, 0.09, 0.16, 0.09, 0, 0, s * 0.35), mk('sphS', o.ribbon, s * 0.335, 0.05, -0.05, 0.055, 0.045, 0.055)); if (Q >= 2) c.push(mk('sphS', o.hairG, s * 0.395, -0.25, -0.08, 0.06, 0.08, 0.06, 0, 0, s * 0.4)); }
  },
  long(c, o) { hairCap(c, o, 1.045, -0.3); parting(c, o); c.push(mk('sphM', o.hairG, 0, -0.1, -0.15, 0.36, 0.38, 0.2)); for (const s of [-1, 1]) c.push(mk('sphS', o.hairG, s * 0.335, -0.12, -0.02, 0.06, 0.2, 0.12)); fringe(c, o); ribbon(c, o, 0.25, 0.17, 0.04, 0.05); if (Q >= 2) for (const s of [-1, 1]) lock(c, o.hairG, s * 0.17, -0.42, -0.18, 0.07, 0.1); },
  bob(c, o) { hairCap(c, o, 1.05, -0.32); parting(c, o); c.push(mk('sphM', o.hairG, 0, -0.07, -0.07, 0.385, 0.25, 0.275)); fringe(c, o); },
  afro(c, o) { hairCap(c, o, 1.045, -0.5); c.push(mk('sphM', o.hairG, 0, 0.13, -0.17, 0.47, 0.43, 0.4)); for (const [x, y, r] of [[-0.16, 0.2, 0.07], [0.16, 0.2, 0.07], [0, 0.22, 0.075]]) { const f = fm('dot', o.hairG, x, y, 0.0, r, r * 0.8, r * 0.7); f.userData.opt = 1; c.push(f); } if (Q >= 2) for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; c.push(mk('sphS', o.hairG, Math.sin(a) * 0.4, 0.14 + (i % 2) * 0.1, -0.17 + Math.cos(a) * 0.34, 0.09, 0.09, 0.09)); } },
  afroPuffs(c, o) { hairCap(c, o); fringe(c, o); for (const s of [-1, 1]) c.push(mk('sphM', o.hairG, s * 0.27, 0.27, -0.03, 0.18, 0.17, 0.17), mk('sphS', o.ribbon, s * 0.22, 0.19, -0.03, 0.055, 0.04, 0.055)); },
  curly(c, o) {
    hairCap(c, o, 1.045, -0.36); fringe(c, o);
    const n = Q >= 2 ? 9 : Q >= 1 ? 8 : 6; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + 0.2; c.push(mk('sphS', o.hairG, Math.sin(a) * 0.24, 0.21, Math.cos(a) * 0.2 - 0.04, 0.105, 0.1, 0.105)); }
    c.push(mk('sphS', o.hairG, 0, 0.3, -0.04, 0.115, 0.105, 0.115), mk('sphS', o.hairG, 0.1, 0.29, -0.12, 0.09, 0.085, 0.09));
    if (Q >= 2) for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; c.push(mk('sphS', o.hairG, Math.sin(a) * 0.3, 0.05, Math.cos(a) * 0.25 - 0.12, 0.085, 0.085, 0.085)); }
  },
  braids(c, o) {
    hairCap(c, o, 1.045, -0.3); fringe(c, o);
    for (const s of [-1, 1]) { for (let i = 0; i < 4; i++) c.push(mk('sphS', o.hairG, s * (0.335 + i * 0.012), -0.04 - i * 0.115, -0.07, 0.075 - i * 0.006, 0.07, 0.07)); c.push(mk('sphS', o.ribbon, s * 0.375, -0.5, -0.07, 0.055, 0.05, 0.055)); }
  },
  baldcap(c, o) { c.push(mk('capB', G(o.hatC, light(o.hatC, 0.3)), 0, -0.01, -0.01, HX * 1.06, HY * 1.06, HZ * 1.06, -0.35), mk('sph', o.hatC, 0, 0.06, 0.2, 0.2, 0.035, 0.15, 0.05), mk('sphS', o.color, 0, 0.0, 0.0, HX * 1.07, 0.03, HZ * 1.07, -0.35), mk('sphS', light(o.hatC, 0.4), 0, 0.33, -0.02, 0.04)); },
  turban(c, o) {
    const t = o.hatC, tl = light(t, 0.3);
    c.push(mk('sphT', G(t, tl), 0, 0.17, -0.03, HX * 1.07, 0.22, HZ * 1.06, -0.1));
    c.push(mk('torH', tl, 0, 0.115, -0.015, 0.355, 0.32, 0.16, Math.PI / 2 - 0.15, 0, 0), mk('torH', t, 0.0, 0.2, -0.02, 0.33, 0.3, 0.15, Math.PI / 2 - 0.3, 0.45, 0), mk('torH', tl, 0.0, 0.26, -0.03, 0.27, 0.25, 0.13, Math.PI / 2 - 0.2, -0.5, 0));
    c.push(mk('sphT', o.color, 0.1, 0.14, 0.31, 0.055, 0.055, 0.04), mk('sphT', '#fff8d0', 0.1, 0.14, 0.345, 0.025, 0.025, 0.02));
  },
  headscarf(c, o) {
    const t = o.hatC, tl = light(t, 0.28);
    c.push(mk('sphM', G(t, tl), 0, 0.02, -0.08, HX * 1.1, HY * 1.07, HZ * 1.0, -0.05));
    c.push(mk('torH', t, 0, -0.01, 0.17, 0.3, 0.34, 0.22, 0.06, 0, 0));
    c.push(mk('sphM', t, 0, -0.27, -0.06, 0.36, 0.15, 0.27), mk('sphS', o.color, -0.2, 0.2, 0.2, 0.04, 0.04, 0.03));
    c.push(mk('sphS', tl, 0.0, 0.33, -0.02, 0.05, 0.04, 0.05));
  },
  straw(c, o) {
    hairCap(c, o, 1.04, -0.25); const straw = '#ffe08a';
    c.push(mk('sph', G(straw, '#fff0b8'), 0, 0.13, 0.005, 0.5, 0.05, 0.5, -0.08), mk('capC', G(straw, '#fff0b8'), 0, 0.125, -0.005, 0.345, 0.3, 0.335, -0.08), mk('cyl12', o.color, 0, 0.17, -0.005, 0.352, 0.07, 0.342, -0.08));
    if (Q >= 2) c.push(mk('tor', '#f2c860', 0, 0.135, -0.005, 0.45, 0.45, 0.06, Math.PI / 2 - 0.08));
  },
  cap(c, o) {
    hairCap(c, o, 1.04, -0.3);
    c.push(mk('capA', G(o.cap, light(o.cap, 0.3)), 0, 0.03, -0.01, HX * 1.07, HY * 1.0, HZ * 1.08, -0.25), mk('sph', dark(o.cap, 0.1), 0, 0.12, 0.295, 0.22, 0.03, 0.16, 0.15), mk('cyl12', o.color, 0, 0.06, -0.01, 0.36, 0.05, 0.345, -0.25), mk('sph', o.accent, 0, 0.31, -0.02, 0.035));
  },
  hood(c, o) {
    c.push(mk('sphM', G(o.hatC, light(o.hatC, 0.3)), 0, 0.03, -0.11, HX * 1.09, HY * 1.07, 0.3), mk('tor', light(o.hatC, 0.3), 0, -0.01, 0.19, 0.25, 0.27, 0.1, 0.05), mk('cone6', o.hatC, 0, 0.27, -0.22, 0.1, 0.22, 0.1, -0.9));
    c.push(fm('dot', o.hairG, -0.12, 0.2, -0.01, 0.08, 0.045, 0.04), fm('dot', o.hairG, 0.12, 0.2, -0.01, 0.08, 0.045, 0.04));
  },
  bandana(c, o) {
    hairCap(c, o, 1.04, -0.32); fringe(c, o);
    c.push(mk('capA', G(o.hatC, light(o.hatC, 0.25)), 0, 0.0, -0.01, HX * 1.075, HY * 1.07, HZ * 1.075, -0.42));
    for (const [x, z] of [[-0.14, 0.12], [0.14, 0.12], [0, 0.19], [0, -0.15]]) c.push(mk('sph', '#fff4dc', x, 0.27, z, 0.03));
    c.push(mk('sph', o.hatC, 0, 0.11, -0.32, 0.07, 0.07, 0.06), mk('cone6', o.hatC, -0.055, 0.03, -0.33, 0.045, 0.13, 0.025, 0, 0, 0.5), mk('cone6', o.hatC, 0.055, 0.03, -0.33, 0.045, 0.13, 0.025, 0, 0, -0.5));
  },
  chef(c, o) {
    hairCap(c, o, 1.04, -0.3);
    c.push(mk('cyl12', '#ffffff', 0, 0.19, -0.01, 0.3, 0.1, 0.28), mk('cyl12', o.color, 0, 0.16, -0.01, 0.305, 0.05, 0.285));
    c.push(mk('sphM', G('#ffffff', '#fffdf6'), 0, 0.42, -0.01, 0.23, 0.17, 0.22), mk('sphS', '#fffaf0', -0.16, 0.34, 0.0, 0.14), mk('sphS', '#fffaf0', 0.16, 0.34, 0.0, 0.14), mk('sphS', '#fffaf0', 0, 0.35, -0.15, 0.14));
  },
  flowers(c, o) {
    hairCap(c, o, 1.045, -0.34); fringe(c, o);
    const cols = ['#ff8fb4', '#fff4dc', '#ffd24a', '#c7a8ff', '#ff8fb4', '#fff4dc', '#ffd24a'];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + 0.2, pol = 0.98, x = HX * Math.sin(pol) * Math.sin(a) * 1.05, y = HY * Math.cos(pol) * 1.05 + 0.01, z = HZ * Math.sin(pol) * Math.cos(a) * 1.05;
      c.push(mk('sphS', cols[i], x, y, z, 0.075, 0.065, 0.075), mk('dot', '#ffb02e', x, y + 0.045, z, 0.03));
    }
  },
  crown(c, o) {
    hairCap(c, o, 1.045, -0.34); fringe(c, o);
    const g = '#ffd24a'; c.push(mk('cyl12', g, 0, 0.23, -0.02, 0.21, 0.055, 0.2, -0.2));
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; c.push(mk('cone6', g, Math.sin(a) * 0.2, 0.32, Math.cos(a) * 0.19 - 0.02, 0.055, 0.11, 0.055)); }
    c.push(mk('sph', '#ff7a8a', 0, 0.255, 0.19, 0.04));
  },
  beanie(c, o) {
    hairCap(c, o, 1.04, -0.3);
    c.push(mk('capB', G(o.hatC, light(o.hatC, 0.3)), 0, 0.0, -0.01, HX * 1.08, HY * 1.1, HZ * 1.08, -0.4), mk('tor', light(o.hatC, 0.4), 0, 0.085, 0.015, 0.335, 0.335, 0.14, Math.PI / 2 - 0.4), mk('sphT', '#fff4dc', 0, 0.35, -0.08, 0.085));
  },
  elf(c, o) {
    hairCap(c, o, 1.04, -0.3);
    c.push(mk('cone8', G(o.hatC, light(o.hatC, 0.25)), 0, 0.08, -0.03, 0.33, 0.55, 0.32, -0.12), mk('tor', light(o.hatC, 0.35), 0, 0.1, -0.02, 0.33, 0.33, 0.1, Math.PI / 2), mk('sphT', '#ffd24a', 0, 0.62, -0.11, 0.055));
  },
  hard(c, o) {
    const y = '#ffd23a'; hairCap(c, o, 1.035, -0.28);
    c.push(mk('capA', G(y, '#fff0a0'), 0, 0.03, -0.01, HX * 1.09, HY * 1.04, HZ * 1.1, -0.2), mk('sph', y, 0, 0.115, 0.0, 0.37, 0.035, 0.36, -0.05), mk('bx', '#ffb84a', 0, 0.31, -0.01, 0.05, 0.025, 0.3), mk('sph', '#fff8c8', 0, 0.23, 0.28, 0.06, 0.055, 0.035));
  },
};
const HAT_TALL = { elf: 0.5, chef: 0.28, crown: 0.06, topknot: 0.1, bun: 0.06, hard: 0.04, afro: 0.1, beanie: 0.1, messy: 0.08, straw: 0.02 };

// ---------------------------------------------------------------- tools (origin = hand, +Y = tool axis, +Z = the cutting side)
const WOOD = '#d89a5e', WOODD = '#a8704a', STEEL = '#e6e9f0', STEELD = '#a4abc0';
function buildTool(kind) {
  const c = [];
  switch (kind) {
    case 'axe': c.push(mk('cyl8', G(WOOD, '#f0b878'), 0, 0.17, 0, 0.026, 0.54, 0.026), mk('bx', STEEL, 0, 0.36, 0.06, 0.035, 0.15, 0.17), mk('bx', STEELD, 0, 0.37, -0.03, 0.05, 0.1, 0.06), mk('sph', '#ffffff', 0, 0.4, 0.13, 0.02, 0.05, 0.02)); break;
    case 'pick': c.push(mk('cyl8', G(WOOD, '#f0b878'), 0, 0.17, 0, 0.026, 0.54, 0.026), mk('bx', STEELD, 0, 0.4, 0, 0.045, 0.055, 0.16), mk('cone6', STEEL, 0, 0.4, 0.2, 0.04, 0.16, 0.04, Math.PI / 2 - 0.35), mk('cone6', STEEL, 0, 0.4, -0.2, 0.04, 0.16, 0.04, -Math.PI / 2 + 0.35)); break;
    case 'hoe': c.push(mk('cyl8', G(WOOD, '#f0b878'), 0, 0.22, 0, 0.026, 0.66, 0.026), mk('bx', STEEL, 0, 0.5, 0.075, 0.11, 0.025, 0.16, 0.6)); break;
    case 'hammer': c.push(mk('cyl8', G(WOOD, '#f0b878'), 0, 0.14, 0, 0.028, 0.46, 0.028), mk('box', '#c9c4bc', 0, 0.35, 0, 0.2, 0.1, 0.1), mk('box', STEELD, 0.09, 0.35, 0, 0.04, 0.115, 0.115)); break;
    case 'ladle': c.push(mk('cyl8', G(WOOD, '#f0b878'), 0, 0.17, 0, 0.022, 0.5, 0.022), mk('sph', STEELD, 0, 0.45, 0.03, 0.08, 0.045, 0.08, 0.4), mk('sph', STEEL, 0, 0.455, 0.03, 0.06, 0.03, 0.06, 0.4)); break;
    case 'scroll': c.push(mk('cyl12', '#fff1cf', 0, 0.12, 0, 0.055, 0.24, 0.055), mk('sph', '#d89a5e', 0, 0.245, 0, 0.05, 0.03, 0.05), mk('sph', '#d89a5e', 0, -0.005, 0, 0.05, 0.03, 0.05), mk('tor', '#ff7a7a', 0, 0.12, 0, 0.06, 0.06, 0.1, Math.PI / 2)); break;
    case 'basket': {
      c.push(mk('arcT', WOODD, 0, 0.02, 0, 0.13, 0.13, 0.1, 0, Math.PI / 2, 0));
      c.push(mk('sph', G('#e8b070', '#f6cc90'), 0, -0.1, 0, 0.16, 0.11, 0.16), mk('sphS', '#c9944a', 0, -0.035, 0, 0.15, 0.03, 0.15));
      c.push(mk('sph', '#ff6a5a', -0.04, -0.02, 0.03, 0.06), mk('sph', '#ffb02e', 0.05, -0.02, -0.02, 0.06)); break;
    }
    case 'cane': c.push(mk('cyl8', WOODD, 0, 0.1, 0, 0.02, 0.4, 0.02), mk('sph', WOODD, 0, 0.31, 0.02, 0.045)); break;
    case 'spoon': c.push(mk('cyl8', WOOD, 0, 0.1, 0, 0.014, 0.3, 0.014), mk('sph', '#e8b070', 0, 0.27, 0.0, 0.04, 0.025, 0.05, 0.5)); break;
  }
  return bake(c, 'tool');
}
const TOOL_ALPHA = { axe: 0.8, pick: 0.8, hoe: 0.7, hammer: 0.7, ladle: 0.5, scroll: 0.3, basket: 0, cane: 0.1, none: 0 };
// stroke styles: up = wind-up angle (arm rotation.x, negative = raised), dn = strike angle, T = period (s)
const WORK = {
  axe: { st: 0, up: -2.55, dn: -0.15, T: 1.3 }, pick: { st: 0, up: -2.45, dn: -0.2, T: 1.2 }, hoe: { st: 0, up: -2.2, dn: -0.45, T: 1.45 }, hammer: { st: 0, up: -2.0, dn: -0.35, T: 0.72 },
  ladle: { st: 1, c: -0.95, a: 0.3, T: 1.1 }, scroll: { st: 2, c: -1.15, a: 0.08, T: 3 }, basket: { st: 3, c: -0.5, a: 0.45, T: 1.6 }, cane: { st: 3, c: -0.5, a: 0.5, T: 1.6 }, none: { st: 3, c: -0.5, a: 0.5, T: 1.6 },
};

// ---------------------------------------------------------------- the villager
const RIGS = new WeakMap(), ZG = new THREE.SphereGeometry(1, 4, 3);

/**
 * villagerModel(color, hat, opts) -> THREE.Group
 * color: OWNER colour, only a small accent (collar, hat band, scarf). hat: integer seed 0..99 (skin, hair, headgear, outfit colour, face, build).
 * opts: { tool: 'none'|'axe'|'pick'|'hoe'|'hammer'|'ladle'|'scroll'|'basket', seed, age: 'adult'|'child'|'elder', style, gear, skin: 0..4, build: 'round'|'tall'|'small'|'normal', outfit,
 *         lod: 'low' (<= 900 tris, far villagers) | 'mid' (default, <= 2100) | 'high' (<= 3200, near the camera) }
 */
export function villagerModel(color = '#e8564a', hat = 0, opts = {}) {
  const prev = Q; Q = LOD_ID[opts.lod] ?? 1;
  try { return buildVillager(color, hat, opts); } finally { Q = prev; }
}
function buildVillager(color, hat, opts) {
  const q = Q, hi = q >= 2, mid = q >= 1;
  const tool = TOOLS.includes(opts.tool) ? opts.tool : 'none';
  const prof = PROFESSIONS.find((p) => p.tool === tool) || PROFESSIONS[7];
  const rnd = rng(((hat | 0) + 1) * 7919 + (opts.seed | 0) * 104729 + 13); const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ageR = rnd(), age = opts.age || (ageR < 0.11 ? 'child' : ageR < 0.2 ? 'elder' : 'adult');
  const child = age === 'child', elder = age === 'elder';
  // ----- skin: five tones, all warm and bright. Darker tones get a warmer, lifted base so they glow instead of going muddy.
  const skinIdx = opts.skin ?? wpick(rnd, SKIN_W, 0);
  const skinBase = P.skin[skinIdx];
  const skin = sat(mixHex(skinBase, ['#ff9c84', '#f49a68', '#de8444', '#bf6228', '#8a3a18'][skinIdx], [0.3, 0.3, 0.32, 0.3, 0.3][skinIdx]), [1.0, 1.1, 1.2, 1.2, 1.15][skinIdx]);
  const skinTop = light(skin, 0.1), skinD = mixHex(skin, '#c8605a', 0.3);
  const blush = mixHex(skin, skinIdx >= 3 ? '#ff3a60' : '#ff5a88', skinIdx >= 3 ? 0.6 : 0.55);
  const noseC = mixHex(skin, '#ff8a6a', 0.3);
  // ----- hair
  const hairE = elder ? ELDER_HAIRS[wpick(rnd, ELDER_HAIRS, 1)] : HAIRS[wpick(rnd, HAIRS, 1)]; const hair = hairE[0];
  const hairTop = light(mixHex(hair, '#ffd9a0', 0.12), lum(hair) < 0.3 ? 0.5 : lum(hair) < 0.5 ? 0.36 : 0.18); // dark hair always gets a bright sheen from above
  const hairG = G(hair, hairTop), hairD = mixHex(hair, '#6a3a4a', 0.35);
  // ----- outfit: a different cheerful colour per villager; the owner colour is only an accent
  const outfitI = opts.outfit ?? Math.floor(rnd() * OUTFITS.length), outfit = sat(OUTFITS[outfitI % OUTFITS.length], 1.22);
  const hatI = (outfitI + 3 + Math.floor(rnd() * (OUTFITS.length - 5))) % OUTFITS.length, hatC = sat(OUTFITS[hatI], 1.15);
  const style = opts.style || (tool !== 'none' ? prof.style : pick(STYLES));
  const build = opts.build || (child ? 'small' : ['round', 'round', 'normal', 'normal', 'tall', 'small'][Math.floor(rnd() * 6)]);
  const wm = build === 'round' ? 1.16 : build === 'tall' ? 0.94 : build === 'small' ? 1.0 : 1.04;
  let gear = opts.gear; if (!gear) { const pool = prof.hats && rnd() < 0.6 ? prof.hats : GEARS; gear = pick(pool); if (elder && ['pigtails', 'crown', 'flowers', 'twinbuns', 'braids'].includes(gear)) gear = pick(['short', 'cap', 'bun', 'headscarf', 'bob', 'baldcap']); if (child && gear === 'crown' && rnd() < 0.5) gear = 'short'; }
  const eyeV = Math.floor(rnd() * 3), mouthV = wpick(rnd, [3, 4, 3]), irisC = pick(IRIS), pants = pick(PANTS), bootC = pick(BOOTS), nose = rnd() < 0.7;
  const acc = elder ? pick(['mustache', 'glasses', 'beard', 'glasses', 'none']) : pick(['none', 'none', 'none', 'scarf', 'glasses', 'freckles', 'satchel', 'freckles', 'glasses', 'flower']);
  const accent = prof.accent, shirt = style === 'overalls' ? light(mixHex(outfit, '#fff4dc', 0.5), 0.2) : outfit;
  const gearO = { hair, hairG, hairD, color, hatC, cloth: hatC, ribbon: pick(['#ff8fb4', '#ff7a6a', '#6ab0f0', '#ffd24a', '#a98af0']), cap: hatC, band: color, accent };
  const shirtG = G(shirt, light(shirt, 0.16), 'f');
  const stitch = light(shirt, 0.55);

  const g = new THREE.Group(); g.name = 'villager';
  const body = new THREE.Group(); body.name = 'body'; g.add(body);
  g.add(groundShadow(0.4 * wm, 0.22, 1, 0.9));

  // ----- torso (static, vertex-coloured, merged)
  const t = [];
  t.push(mk('sphM', shirtG, 0, 0.3, 0, 0.26 * wm, 0.215, 0.24 * wm));
  const pushO = (...ms) => { for (const m of ms) { m.userData.opt = 1; t.push(m); } };
  const belt = (col) => { if (!hi) return; pushO(mk('cyl12', col, 0, 0.245, 0, 0.268 * wm, 0.04, 0.24 * wm), mk('bx', '#ffd24a', 0, 0.245, 0.24 * wm, 0.06, 0.05, 0.02), mk('bx', '#fff0a0', 0, 0.247, 0.252 * wm, 0.032, 0.026, 0.01)); };
  const pocket = (x, y, col) => { if (!hi) return; pushO(mk('sph', col, x, y, 0.2 * wm, 0.05, 0.045, 0.02, 0, x < 0 ? 0.25 : -0.25, 0), mk('sphS', stitch, x, y + 0.036, 0.215 * wm, 0.045, 0.006, 0.01)); };
  if (style === 'apron') {
    t.push(mk('shellA', G(accent, light(accent, 0.2), 'f'), 0, 0.3, 0, 0.255 * wm * 1.07, 0.215 * 1.05, 0.24 * wm * 1.075, 0.7), mk('sph', accent, 0, 0.43, 0.15, 0.11, 0.08, 0.07),
      mk('bx', light(accent, 0.3), 0, 0.19, 0.225 * wm, 0.11, 0.065, 0.02), mk('cyl8', accent, -0.1, 0.46, 0.04, 0.02, 0.1, 0.02, 0.0, 0, -0.5), mk('cyl8', accent, 0.1, 0.46, 0.04, 0.02, 0.1, 0.02, 0.0, 0, 0.5),
      mk('sph', dark(accent, 0.15), 0.235 * wm, 0.27, -0.02, 0.045, 0.055, 0.055));
    pocket(-0.0, 0.17, dark(accent, 0.1)); if (hi) pushO(mk('torT', stitch, 0, 0.118, 0.115 * wm, 0.19 * wm, 0.19 * wm, 0.16, Math.PI / 2 - 0.12));
    belt('#b88652');
  } else if (style === 'overalls') {
    t.push(mk('shellB', G(outfit, light(outfit, 0.15), 'f'), 0, 0.3, 0, 0.255 * wm * 1.06, 0.215 * 1.06, 0.24 * wm * 1.035, 0.62), mk('sph', outfit, 0, 0.4, 0.15, 0.12, 0.085, 0.07), mk('bx', outfit, -0.105, 0.46, 0.06, 0.045, 0.13, 0.055, 0, 0, 0.12), mk('bx', outfit, 0.105, 0.46, 0.06, 0.045, 0.13, 0.055, 0, 0, -0.12),
      mk('sph', '#ffd24a', -0.105, 0.42, 0.2, 0.026), mk('sph', '#ffd24a', 0.105, 0.42, 0.2, 0.026), mk('bx', accent, 0.0, 0.24, 0.215 * wm, 0.13, 0.085, 0.025));
    pocket(0, 0.38, dark(outfit, 0.1));
  } else if (style === 'tunic') {
    t.push(mk('cyl12', accent, 0, 0.245, 0, 0.268 * wm, 0.045, 0.24 * wm), mk('bx', '#ffd24a', 0, 0.245, 0.24 * wm, 0.065, 0.055, 0.02), mk('cyl12', G(light(shirt, 0.12), shirt, 'f'), 0, 0.16, 0, 0.268 * wm, 0.08, 0.238 * wm),
      mk('sph', '#ffd24a', 0, 0.385, 0.215, 0.025), mk('sph', '#ffd24a', 0, 0.345, 0.228, 0.025));
    if (hi) pushO(mk('torT', stitch, 0, 0.124, 0, 0.272 * wm, 0.243 * wm, 0.2, Math.PI / 2));
    pocket(-0.13 * wm, 0.15, dark(shirt, 0.12));
  } else { // cloak
    t.push(mk('sphS', dark(outfit, 0.1), 0, 0.27, -0.1, 0.28 * wm, 0.24, 0.11), mk('cone8', G(dark(outfit, 0.06), outfit, 'f'), 0, 0.02, -0.12, 0.27 * wm, 0.3, 0.12, Math.PI, 0, 0), mk('capA', G(outfit, light(outfit, 0.25), 'f'), 0, 0.405, 0.0, 0.3 * wm, 0.2, 0.26, 0.04), mk('sph', accent, 0, 0.25, 0.23, 0.11, 0.045, 0.025),
      mk('sph', '#ffd24a', 0, 0.395, 0.25, 0.037));
    belt(accent);
  }
  const t0 = t.length;
  // owner colour accent: a thin collar ring plus a little tie, or a bigger scarf
  if (acc === 'scarf') { t.push(mk('tor', color, 0, 0.46, 0.0, 0.25, 0.22, 0.13, Math.PI / 2), mk('bx', color, 0.11, 0.37, 0.18, 0.08, 0.19, 0.045, 0, 0, 0.1), mk('bx', light(color, 0.3), 0.11, 0.3, 0.18, 0.085, 0.03, 0.05, 0, 0, 0.1)); }
  else t.push(mk('tor', color, 0, 0.47, 0.0, 0.215, 0.19, 0.08, Math.PI / 2), mk('cone6', color, 0, 0.445, 0.2, 0.075, 0.11, 0.04, Math.PI), mk('sphS', light(color, 0.2), 0, 0.46, 0.205, 0.04));
  if (acc === 'satchel') t.push(mk('bx', '#b87a4a', 0.0, 0.33, 0.0, 0.05, 0.42, 0.32, 0, 0, -0.9), mk('bx', '#d4944f', -0.25, 0.17, 0.02, 0.11, 0.14, 0.14), mk('sph', '#ffd24a', -0.31, 0.19, 0.02, 0.022));
  if (acc === 'beard') t.push(mk('sphT', hair, 0, 0.43, 0.2, 0.13, 0.1, 0.07));
  for (let i = t0; i < t.length; i++) t[i].userData.opt = 1;

  // ----- arms (pivot at the shoulder, static parts baked in arm-local coordinates). Mitten hands with a thumb.
  function makeArm(side) {
    const a = new THREE.Group(); a.position.set(side * 0.255 * wm, 0.44, 0); a.rotation.z = side * 0.14;
    const parts = [mk('sphS', G(shirt, light(shirt, 0.12), 'f'), 0, -0.08, 0, 0.076, 0.105, 0.076), mk('sphS', G(skin, skinTop, 'w'), 0, -0.195, 0, 0.07, 0.068, 0.068)];
    if (mid) parts.push(mk('dot', G(skin, skinTop, 'w'), -side * 0.052, -0.2, 0.034, 0.03, 0.034, 0.03)); if (hi) parts.push(mk('torT', light(shirt, 0.35), 0, -0.145, 0, 0.0625, 0.0625, 0.07, Math.PI / 2));
    for (const m of bake(parts).children) a.add(m);
    return a;
  }
  const arm = makeArm(1); arm.name = 'arm'; const armL = makeArm(-1); armL.name = 'armL'; body.add(arm, armL);
  const toolKind = tool !== 'none' ? tool : (elder ? 'cane' : 'none');
  let toolG = null;
  if (toolKind !== 'none') { toolG = buildTool(toolKind); toolG.position.set(0, -0.195, 0); toolG.rotation.x = TOOL_ALPHA[toolKind]; if (toolKind !== 'basket') toolG.scale.setScalar(1.3); if (toolKind === 'basket') toolG.position.x = 0.04; arm.add(toolG); }

  // ----- legs (pivot at the hip, children of the root so they do not bob). Boots with soles.
  const legCol = style === 'overalls' ? outfit : pants, soleC = mixHex(bootC, '#6a4a5a', 0.55);
  function makeLeg(side) {
    const l = new THREE.Group(); l.position.set(side * 0.115 * wm, 0.2, 0);
    const parts = [mk('sphS', G(legCol, light(legCol, 0.15)), 0, -0.065, 0, 0.09, 0.095, 0.09), mk('sphS', G(bootC, light(bootC, 0.2)), 0, -0.145, 0.035, 0.1, 0.065, 0.13)];
    if (mid) parts.push(mk('cyl8', soleC, 0, -0.2, 0.038, 0.098, 0.016, 0.128)); 
    if (hi) parts.push(mk('sphS', light(bootC, 0.45), 0, -0.14, 0.12, 0.06, 0.04, 0.04));
    for (const m of bake(parts).children) l.add(m);
    return l;
  }
  const legL = makeLeg(-1); legL.name = 'legL'; const legR = makeLeg(1); legR.name = 'legR'; g.add(legL, legR);

  // ----- head
  const head = new THREE.Group(); head.name = 'head'; head.position.y = HEAD_Y; body.add(head);
  const hs = [];
  { const k = Q === 0 ? 0.955 : 1; hs.push(mk('head', G(skin, skinTop, 'w'), 0, 0, 0, HX * k, HY * k, HZ * k)); }
  hs.push(fm('hemiS', G(skin, skinTop, 'w'), -0.335, -0.02, -0.02, 0.055, 0.075, 0.055), fm('hemiS', G(skin, skinTop, 'w'), 0.335, -0.02, -0.02, 0.055, 0.075, 0.055));
  if (hi) hs.push(fm('hemiS', blush, -0.337, -0.02, -0.004, 0.028, 0.045, 0.03), fm('hemiS', blush, 0.337, -0.02, -0.004, 0.028, 0.045, 0.03));
  if (nose) hs.push(fm('hemi', G(noseC, light(noseC, 0.25), 'z'), 0, -0.075, -0.006, 0.026, 0.02, 0.024));
  const ch = child ? 1.15 : 1, bl = (s) => fm('hemiB', G(skin, blush, 'z'), s * 0.23, -0.12, -0.012, 0.105 * ch, 0.066 * ch, 0.016);
  hs.push(bl(-1), bl(1));
  const g0 = hs.length; (GEAR[gear] || GEAR.short)(hs, gearO);
  for (let i = g0; i < hs.length; i++) { const m = hs[i]; if (Math.max(m.scale.x, m.scale.y, m.scale.z) <= 0.09) m.userData.opt = 1; } // tiny trinkets may be dropped if the model is over budget
  const h0 = hs.length;
  if (acc === 'freckles') for (const s of [-1, 1]) for (const [x, y] of [[0.2, -0.07], [0.25, -0.075], [0.225, -0.04]]) hs.push(fm('hemi', skinD, s * x, y, 0.0, 0.014, 0.014, 0.01));
  if (acc === 'glasses') { const fr = pick(['#ff8a6a', '#8a6af0', '#3fb5b0', '#ffc83a']); for (const s of [-1, 1]) hs.push(fm('torS', fr, s * 0.14, -0.04, 0.012, 0.115, 0.115, 0.07)); hs.push(fm('hemi', fr, 0, -0.03, 0.0, 0.025, 0.012, 0.012)); }
  if (acc === 'mustache') for (const s of [-1, 1]) hs.push(fm('hemi', hair, s * 0.05, -0.135, 0.0, 0.065, 0.032, 0.03, s * 0.25));
  if (acc === 'flower') hs.push(fm('sphS', '#ff8fb4', 0.2, 0.2, 0.012, 0.07, 0.065, 0.05), fm('dot', '#ffd24a', 0.2, 0.2, 0.05, 0.03));
  if (elder) for (const s of [-1, 1]) hs.push(fm('hemi', hair, s * 0.14, 0.06, 0.0, 0.065, 0.02, 0.02, s * -0.2));
  for (let i = h0; i < hs.length; i++) hs[i].userData.opt = 1;

  // eyes: LAYERED glossy eyes: dark base, tinted iris with a lighter lower rim, pupil, big + small + tiny highlights, a lash line. The group origin sits at the eye line so scale.y blinks about it.
  const EY = -0.045, ex = eyeV === 2 ? 0.15 : 0.138, erx = [0.082, 0.072, 0.09][eyeV], ery = [0.098, 0.115, 0.09][eyeV];
  const ep = [], hp = [], irisL = light(irisC, 0.4);
  for (const s of [-1, 1]) {
    const X = s * ex, add = (arr, m) => { m.position.y -= EY; arr.push(m); };
    add(ep, fm('hemiE', '#2a1c2a', X, EY, -0.016, erx, ery, 0.036, 0, eyeMat));
    if (mid) add(ep, fm('hemiS', G(irisC, irisL, 'i'), X, EY - 0.03, -0.004, erx * (hi ? 0.78 : 0.7), ery * (hi ? 0.6 : 0.5), 0.022, 0, eyeMat));
    if (hi) add(ep, fm('hemiT', '#1c1220', X, EY - 0.022, 0.004, erx * 0.34, ery * 0.3, 0.02, 0, eyeMat));
    if (hi) add(ep, fm('arcM', mixHex(skinD, '#3a2230', 0.8), X, EY + ery * 0.12, 0.002, erx * 1.06, ery * 1.06, 0.03, Math.PI * 0.14, eyeMat));
    add(hp, fm('hemiS', '#ffffff', X - erx * 0.3, EY + ery * 0.38, 0.014, erx * 0.38, erx * 0.42, 0.014, 0, hiMat));
    add(hp, fm('hemiS', '#ffffff', X + erx * 0.36, EY - ery * 0.38, 0.012, erx * 0.17, erx * 0.17, 0.012, 0, hiMat));
  }
  const eyes = bake([...ep, ...hp], 'eyes'); eyes.position.y = EY; head.add(eyes);
  const browC = elder ? hair : mixHex(skinD, hairD, 0.5);
  const BY = 0.095;
  const mkBrow = (s, name) => { const b = fm('hemiS', browC, s * ex, BY, 0.0, hi ? 0.058 : 0.05, hi ? 0.013 : 0.011, 0.01), grp = new THREE.Group(); grp.name = name; grp.position.copy(b.position); b.position.set(0, 0, 0); for (const m of bake([b]).children) grp.add(m); return grp; };
  const mkNone = (n) => { const o = new THREE.Group(); o.name = n; return o; };
  const browL = mid ? mkBrow(-1, 'browL') : mkNone('browL'), browR = mid ? mkBrow(1, 'browR') : mkNone('browR'); const browBase = 0.095;
  browL.visible = browR.visible = mid && (eyeV === 2 || elder || hi); head.add(browL, browR);
  // mouths: a clear smile (arc), open laughing smile (D), or a cat smile
  const MY = -0.165, ink = '#6a2a3a';
  const mouthSmile = new THREE.Group(); mouthSmile.name = 'mouthSmile';
  { const m = [];
    if (mouthV === 0) m.push(fm('arcB', ink, 0, MY + 0.05, 0.002, 0.07, 0.07, 0.02, Math.PI));
    else if (mouthV === 1) m.push(fm('hemiE', '#9a2a40', 0, MY, 0.002, 0.075, 0.062, 0.009), fm('hemiS', '#ff8a98', 0, MY - 0.028, 0.004, 0.04, 0.02, 0.008), fm('hemiE', G(skin, skinTop, 'w'), 0, MY + 0.036, 0.004, 0.1, 0.036, 0.008));
    else m.push(fm('arcB', ink, -0.045, MY + 0.035, 0.002, 0.045, 0.045, 0.02, Math.PI), fm('arcB', ink, 0.045, MY + 0.035, 0.002, 0.045, 0.045, 0.02, Math.PI));
    for (const x of bake(m).children) mouthSmile.add(x); }
  head.add(mouthSmile);
  // mood parts (lids, flat / "o" / big mouths, sweat drop) are built on first use by ensureMood: they are hidden most of the time, so they cost nothing until a villager needs them
  const ensureMood = () => {
    if (rig.lids) return; const prev = Q; Q = q;
    try {
      const lidList = []; for (const s of [-1, 1]) { const m = fm('hemiS', G(skin, skinTop, 'w'), s * ex, EY + ery * 0.55, -0.01, erx * 1.2, ery * 0.62, 0.045); m.position.y -= EY; lidList.push(m); }
      const lids = bake(lidList, 'lids'); lids.position.y = EY; lids.visible = false; head.add(lids);
      const mouthFlat = new THREE.Group(); mouthFlat.name = 'mouthFlat'; for (const x of bake([fm('hemi', ink, 0, MY + 0.01, 0.002, 0.036, 0.008, 0.01, 0.15)]).children) mouthFlat.add(x);
      const mouthO = new THREE.Group(); mouthO.name = 'mouthO'; { const m1 = fm('hemi', '#9a2a40', 0, MY, 0.003, 0.03, 0.037, 0.014), m2 = fm('hemiS', '#ff8a98', 0, MY - 0.014, 0.007, 0.016, 0.009, 0.008); mouthO.position.copy(m1.position); m2.position.sub(m1.position); m1.position.set(0, 0, 0); for (const x of bake([m1, m2]).children) mouthO.add(x); }
      const mouthBig = new THREE.Group(); mouthBig.name = 'mouthBig'; for (const x of bake([fm('hemiE', '#9a2a40', 0, MY + 0.005, 0.002, 0.092, 0.075, 0.01), fm('hemiS', '#ff8a98', 0, MY - 0.03, 0.005, 0.05, 0.024, 0.008), fm('hemiE', G(skin, skinTop, 'w'), 0, MY + 0.044, 0.004, 0.115, 0.04, 0.009), fm('hemiS', '#ffffff', 0, MY + 0.03, 0.0035, 0.06, 0.016, 0.006)]).children) mouthBig.add(x);
      mouthFlat.visible = mouthO.visible = mouthBig.visible = false; head.add(mouthFlat, mouthO, mouthBig);
      const sweat = new THREE.Group(); sweat.name = 'sweat'; for (const x of bake([mk('sphS', '#8fd8ff', 0.31, 0.18, 0.13, 0.045, 0.055, 0.045), mk('cone6', '#8fd8ff', 0.31, 0.21, 0.13, 0.038, 0.065, 0.038), mk('hemiT', '#ffffff', 0.3, 0.18, 0.17, 0.014, 0.018, 0.012)]).children) sweat.add(x);
      sweat.visible = false; head.add(sweat);
      Object.assign(rig, { lids, mouthFlat, mouthO, mouthBig, sweat });
    } finally { Q = prev; }
  };
  if (elder) head.position.z = 0.03;

  // ----- carried loads and bowls are built lazily (setCarry / 'eat'); only the zzz sprites live in the base model
  const carry = new THREE.Group(); carry.name = 'carry'; carry.visible = false; body.add(carry);
  const zzz = new THREE.Group(); zzz.name = 'zzz';
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(ZG, soft('#ffffff', { emissive: '#bcd6ff', emissiveIntensity: 0.5 })); m.castShadow = false; zzz.add(m); }
  zzz.visible = false; body.add(zzz);

  // ----- triangle budget: bake torso and head, dropping optional trinkets (accessories, fringe) if the model would exceed it
  const cost = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  let total = allTris(g) + [...t, ...hs].reduce((a, m) => a + cost(m), 0);
  const trim = (list) => { const optional = list.filter((m) => m.userData.opt).sort((a, b) => cost(b) - cost(a)); for (const m of optional) { if (total <= BUDGETS[q]) break; total -= cost(m); m.userData.drop = true; } };
  trim([...t, ...hs]);
  if (total > BUDGETS[q] && q > 0) { // still over: rebuild the hair / hat one level lower (it is the big variable part), then trim again
    for (const m of [...t, ...hs]) m.userData.drop = false;
    const oldG = hs.splice(g0, h0 - g0); Q = q - 1; const fresh = []; (GEAR[gear] || GEAR.short)(fresh, gearO); Q = q;
    for (const m of fresh) if (Math.max(m.scale.x, m.scale.y, m.scale.z) <= 0.09) m.userData.opt = 1;
    hs.splice(g0, 0, ...fresh); total = allTris(g) + [...t, ...hs].reduce((a, m) => a + cost(m), 0); void oldG; trim([...t, ...hs]);
  }
  for (const m of bake(t.filter((m) => !m.userData.drop), 'torso').children) { m.name = ''; body.add(m); }
  for (const m of bake(hs.filter((m) => !m.userData.drop), 'headStatic').children) { m.name = ''; head.add(m); }

  // ----- age and build proportions
  const bs = (build === 'tall' ? 1.1 : build === 'small' ? 0.9 : 1) * 1.07; // a touch bigger overall: faces stay readable from the game camera
  if (child) { g.scale.setScalar(0.8); head.scale.setScalar(1.18); }
  else if (elder) g.scale.setScalar(0.95 * bs); else g.scale.setScalar(bs);
  const lean = elder ? 0.16 : 0;
  body.rotation.x = lean;

  const rig = { body, head, eyes, lids: null, browL, browR, mouthSmile, mouthFlat: null, mouthO: null, mouthBig: null, sweat: null, ensureMood, armR: arm, armL, legL, legR, tool: toolG, carry, zzz, toolKind, lean, armZ: 0.14, eyeBase: 1, mood: 'happy', eyeV, hasTool: toolKind !== 'none' && toolKind !== 'cane', work: WORK[toolKind], q,
    elder, load: 'sack', browY: browBase, mood2: 0, emote: null, em: null, emY: 1.28 + (HAT_TALL[gear] || 0), hipY: 0.2, wLoad: null, eatG: null, spoon: null, mouthMode: 0 };
  RIGS.set(g, rig); g.userData.rig = rig;
  g.userData.look = { gear, style, acc, age, tool: toolKind, eyeV, mouthV, skin: skinIdx, hair: hairE[2], hairColor: hair, outfit: outfitI % OUTFITS.length, outfitColor: outfit, build, lod: ['low', 'mid', 'high'][q], iris: irisC };
  setMood(g, 'happy');
  return g;
}

function rigOf(g) {
  let r = RIGS.get(g); if (r) return r;
  const body = g.getObjectByName('body'); if (!body) return null; const head = g.getObjectByName('head');
  r = { body, head, eyes: g.getObjectByName('eyes'), lids: g.getObjectByName('lids'), browL: g.getObjectByName('browL'), browR: g.getObjectByName('browR'), mouthSmile: g.getObjectByName('mouthSmile'), mouthFlat: g.getObjectByName('mouthFlat'), mouthO: g.getObjectByName('mouthO'), mouthBig: g.getObjectByName('mouthBig'), sweat: g.getObjectByName('sweat'),
    armR: g.getObjectByName('arm'), armL: g.getObjectByName('armL'), legL: g.getObjectByName('legL'), legR: g.getObjectByName('legR'), tool: g.getObjectByName('tool'), carry: g.getObjectByName('carry'), zzz: g.getObjectByName('zzz'), toolKind: 'none', lean: 0, armZ: 0.14, eyeBase: 1, mood: 'happy', eyeV: 0, hasTool: !!g.getObjectByName('tool'), work: WORK.none, q: 1,
    ensureMood: null, elder: false, load: 'sack', browY: 0.095, mood2: 0, emote: null, em: null, emY: 1.28, hipY: 0.2, wLoad: null, eatG: null, spoon: null, mouthMode: 0 };
  RIGS.set(g, r); return r;
}

// ---------------------------------------------------------------- moods
/** the face moods setMood understands */
export const MOODS = ['happy', 'tired', 'hungry', 'busy', 'excited', 'sleepy'];
/**
 * setMood(group, mood): 'happy' | 'tired' | 'hungry' | 'busy' | 'excited' | 'sleepy'. Swaps cheap named face meshes (visibility), moves the brows and stores the eye openness.
 * excited = wide eyes, raised brows, big open laugh. sleepy = heavy lids, small flat mouth. tired = half lids, flat mouth. hungry = worried brows, an "o" mouth and a sweat drop.
 */
export function setMood(g, mood = 'happy') {
  const r = rigOf(g); if (!r || !r.eyes) return; r.mood = mood; if (r.ensureMood && mood !== 'happy' && mood !== 'busy') r.ensureMood();
  if (!r.lids) { r.eyeBase = mood === 'excited' ? 1.16 : mood === 'busy' ? 0.92 : 1; r.mouthMode = 0; return; }
  const tired = mood === 'tired', hungry = mood === 'hungry', busy = mood === 'busy', excited = mood === 'excited', sleepy = mood === 'sleepy';
  r.lids.visible = tired || sleepy; r.mouthFlat.visible = tired || sleepy; r.mouthO.visible = hungry; r.mouthBig.visible = excited; r.mouthSmile.visible = !tired && !hungry && !excited && !sleepy; r.sweat.visible = hungry;
  r.eyeBase = sleepy ? 0.42 : tired ? 0.7 : hungry ? 1.1 : excited ? 1.16 : busy ? 0.92 : 1;
  const brows = (busy || hungry || excited) || r.eyeV === 2 || r.elder || r.q >= 2;
  r.browL.visible = r.browR.visible = brows && r.q >= 1;
  r.browR.rotation.z = busy ? 0.4 : hungry ? -0.4 : excited ? -0.14 : tired || sleepy ? 0.18 : -0.05; r.browL.rotation.z = -r.browR.rotation.z;
  r.mouthMode = 0; const by = excited ? 0.04 : tired || sleepy ? -0.025 : hungry ? 0.012 : busy ? -0.012 : 0; r.browL.position.y = r.browR.position.y = r.browY + by;
}

// ---------------------------------------------------------------- loads, bowls (lazy)
export const CARRY_KINDS = ['sack', 'log', 'stone', 'wheat', 'eggs'];
const LOAD_T = new Map();
function buildLoad(kind) {
  const c = [];
  switch (kind) {
    case 'log': c.push(mk('cyl12', G('#b07a4a', '#d8a066', 'f'), 0, 0.37, 0.33, 0.085, 0.52, 0.085, 0, 0, Math.PI / 2), mk('cyl12', G('#c88e58', '#e8b078'), 0.15, 0.4, 0.33, 0.06, 0.34, 0.06, 0, 0, Math.PI / 2 + 0.2), mk('sph', '#f6dcaa', 0.265, 0.37, 0.33, 0.03, 0.082, 0.082), mk('sph', '#f6dcaa', -0.265, 0.37, 0.33, 0.03, 0.082, 0.082), mk('torS', '#9a6a3c', 0.262, 0.37, 0.33, 0.04, 0.05, 0.05, 0, Math.PI / 2, 0)); break;
    case 'stone': c.push(mk('sphM', G('#b8b6d0', '#e2e0f4'), 0, 0.37, 0.33, 0.15, 0.12, 0.13, 0.1, 0.3, 0.1), mk('sphT', G('#a8a6c4', '#d0cee8'), 0.1, 0.46, 0.32, 0.09, 0.075, 0.08), mk('sphS', '#f2f0ff', -0.05, 0.43, 0.42, 0.04, 0.025, 0.02)); break;
    case 'wheat': for (let i = 0; i < 7; i++) { const dy = (i - 3) * 0.022, dz = (i % 2) * 0.03; c.push(mk('cyl8', '#e6c25a', (i - 3) * 0.045, 0.36 + dy * 0.0, 0.33 + dz, 0.011, 0.5, 0.011, 0, 0, Math.PI / 2 + (i - 3) * 0.06), mk('sphS', '#ffd868', 0.27 + Math.abs(i - 3) * 0.01, 0.38 + (i - 3) * 0.028, 0.33 + dz, 0.05, 0.028, 0.025, 0, 0, 0.1)); } c.push(mk('torS', '#ff7a8a', 0, 0.37, 0.33, 0.045, 0.06, 0.06, 0, Math.PI / 2, 0), mk('sphS', '#ff7a8a', 0.0, 0.43, 0.33, 0.03, 0.025, 0.03)); break;
    case 'eggs': c.push(mk('sph', G('#e8b070', '#f6cc90'), 0, 0.3, 0.33, 0.16, 0.1, 0.16), mk('torH', '#c9944a', 0, 0.37, 0.33, 0.16, 0.16, 0.05, Math.PI / 2), mk('arcT', '#a8704a', 0, 0.37, 0.33, 0.15, 0.17, 0.12, 0, Math.PI / 2, 0));
      for (const [x, z, col] of [[-0.06, 0.3, '#fffaf0'], [0.06, 0.32, '#ffe9d4'], [0, 0.4, '#fff4dc'], [-0.07, 0.4, '#dff3ff'], [0.07, 0.4, '#ffe0ea']]) c.push(mk('sph', col, x, 0.39, z, 0.045, 0.058, 0.045)); break;
    default: c.push(mk('sph', G('#f0c060', '#ffe08a', 'f'), 0, 0.35, 0.32, 0.18, 0.16, 0.16), mk('sphS', '#d89a5e', 0, 0.51, 0.32, 0.055, 0.045, 0.055), mk('dot', '#fbe6bc', 0.05, 0.4, 0.43, 0.055, 0.055, 0.03), mk('torS', '#d89a5e', 0, 0.48, 0.32, 0.07, 0.07, 0.05, Math.PI / 2));
  }
  return bake(c, 'load_' + kind);
}
function applyLoad(r, kind) {
  const prev = Q; Q = r.q;
  try { if (!r.carry.getObjectByName('load_' + kind)) { const key = r.q + kind; let tpl = LOAD_T.get(key); if (!tpl) { tpl = buildLoad(kind); LOAD_T.set(key, tpl); } const m = tpl.clone(true); m.name = 'load_' + kind; r.carry.add(m); } } finally { Q = prev; }
  for (const k of r.carry.children) k.visible = k.name === 'load_' + kind; r.wLoad = kind;
}
/** setCarry(group, 'sack'|'log'|'stone'|'wheat'|'eggs'): choose what the 'carry' pose holds (built on first use, geometry shared between villagers). */
export function setCarry(g, kind = 'sack') { const r = rigOf(g); if (!r) return; if (!CARRY_KINDS.includes(kind)) kind = 'sack'; r.load = kind; applyLoad(r, kind); }
function ensureEat(r) {
  if (r.eatG) return; const prev = Q; Q = r.q;
  try {
    const bowl = bake([mk('sph', G('#fff4e4', '#ffffff'), 0, 0.28, 0.3, 0.12, 0.075, 0.12), mk('sph', G('#ff9a6a', '#ffc08a'), 0, 0.325, 0.3, 0.1, 0.02, 0.1), mk('torS', '#ffd0e0', 0, 0.318, 0.3, 0.115, 0.115, 0.05, Math.PI / 2), mk('sphS', '#9be08a', 0.03, 0.34, 0.31, 0.02, 0.015, 0.02), mk('dot', '#ffffff', -0.03, 0.335, 0.34, 0.015)], 'bowl');
    r.eatG = bowl; r.eatG.visible = false; r.body.add(bowl);
    r.spoon = buildTool('spoon'); r.spoon.position.set(0, -0.195, 0); r.spoon.rotation.x = 0.9; r.spoon.visible = false; r.armR.add(r.spoon);
  } finally { Q = prev; }
}

// ---------------------------------------------------------------- emotes: pooled billboard bubbles from one shared icon atlas
/** the emote icons setEmote understands */
export const EMOTES = ['heart', 'exclamation', 'zzz', 'note', 'sweat', 'sparkle', 'coin', 'question'];
const EMO_ALIAS = { exclaim: 'exclamation', '!': 'exclamation', '?': 'question', music: 'note', drop: 'sweat', star: 'sparkle', love: 'heart', sleep: 'zzz' };
let EMO = null;
function emoteKit() {
  if (EMO) return EMO; if (typeof document === 'undefined') return null;
  const S = 128, c = document.createElement('canvas'); c.width = S * 4; c.height = S * 2; const x = c.getContext('2d');
  const cell = (i, f) => { x.save(); x.translate((i % 4) * S + S / 2, Math.floor(i / 4) * S + S / 2 - 4); f(); x.restore(); };
  const bubble = (rim) => {
    x.fillStyle = 'rgba(80,60,120,0.18)'; x.beginPath(); x.ellipse(2, 7, 46, 44, 0, 0, 7); x.fill();
    x.fillStyle = rim; x.beginPath(); x.arc(0, 0, 49, 0, 7); x.fill(); x.beginPath(); x.moveTo(-9, 44); x.lineTo(0, 62); x.lineTo(10, 44); x.closePath(); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(0, 0, 43, 0, 7); x.fill(); x.beginPath(); x.moveTo(-6, 40); x.lineTo(0, 55); x.lineTo(7, 40); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.ellipse(-20, -26, 11, 6, -0.6, 0, 7); x.fill();
  };
  const star = (cx, cy, R, r, n, col) => { x.fillStyle = col; x.strokeStyle = col; x.lineJoin = 'round'; x.lineWidth = 6; x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n - Math.PI / 2, rr = i % 2 ? r : R; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke(); };
  cell(0, () => { bubble('#ffa0bf'); x.fillStyle = '#ff6f98'; x.beginPath(); x.moveTo(0, 26); x.bezierCurveTo(-42, 0, -26, -34, 0, -14); x.bezierCurveTo(26, -34, 42, 0, 0, 26); x.fill(); x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.ellipse(-16, -14, 7, 4, -0.7, 0, 7); x.fill(); });
  cell(1, () => { bubble('#ffb347'); x.fillStyle = '#ff8a3a'; x.beginPath(); x.moveTo(-9, -32); x.quadraticCurveTo(0, -38, 9, -32); x.lineTo(5, 8); x.quadraticCurveTo(0, 12, -5, 8); x.closePath(); x.fill(); x.beginPath(); x.arc(0, 23, 6.5, 0, 7); x.fill(); });
  cell(2, () => { bubble('#9ab8ff'); x.fillStyle = '#6f8ff0'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Z', -11, 12); x.font = 'bold 30px sans-serif'; x.fillText('z', 11, -4); x.font = 'bold 22px sans-serif'; x.fillText('z', 26, -20); });
  cell(3, () => { bubble('#b79cff'); x.fillStyle = '#8a64f0'; x.strokeStyle = '#8a64f0'; x.lineCap = 'round'; x.lineJoin = 'round'; x.save(); x.translate(-8, 17); x.rotate(-0.45); x.beginPath(); x.ellipse(0, 0, 13, 9.5, 0, 0, 7); x.fill(); x.restore(); x.lineWidth = 7; x.beginPath(); x.moveTo(4, 14); x.lineTo(4, -24); x.stroke(); x.beginPath(); x.moveTo(4, -24); x.bezierCurveTo(10, -14, 26, -16, 22, 2); x.stroke(); });
  cell(4, () => { bubble('#8fd8ff'); x.fillStyle = '#4fb8f0'; x.beginPath(); x.moveTo(0, -32); x.bezierCurveTo(8, -16, 24, 0, 24, 14); x.bezierCurveTo(24, 30, -24, 30, -24, 14); x.bezierCurveTo(-24, 0, -8, -16, 0, -32); x.fill(); x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.ellipse(-9, 12, 5, 8, 0.3, 0, 7); x.fill(); });
  cell(5, () => { bubble('#ffd24a'); star(0, 1, 32, 12, 4, '#ffc02a'); star(22, -22, 11, 4, 4, '#ffe27a'); star(-24, 22, 9, 3.5, 4, '#ffe27a'); });
  cell(6, () => { bubble('#ffd24a'); x.fillStyle = '#e8a317'; x.beginPath(); x.arc(0, 0, 31, 0, 7); x.fill(); x.fillStyle = '#ffd24a'; x.beginPath(); x.arc(0, 0, 25, 0, 7); x.fill(); x.fillStyle = '#ffe27a'; x.beginPath(); x.arc(0, 0, 17, 0, 7); x.fill(); x.fillStyle = '#e8a317'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 0, 2); });
  cell(7, () => { bubble('#d4c4ff'); x.fillStyle = '#9a78f0'; x.font = 'bold 66px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 0, 2); });
  const tex = new THREE.CanvasTexture(c); tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.colorSpace = THREE.NoColorSpace;
  const vs = 'uniform vec2 uOff; varying vec2 vUv; void main(){ vUv = (uv + uOff) * vec2(0.25, 0.5); vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); float sx = length(modelMatrix[0].xyz), sy = length(modelMatrix[1].xyz); mv.xy += position.xy * vec2(sx, sy); gl_Position = projectionMatrix * mv; }';
  const fs = 'uniform sampler2D uMap; uniform float uA; varying vec2 vUv; void main(){ vec4 t = texture2D(uMap, vUv); if (t.a < 0.01) discard; gl_FragColor = vec4(t.rgb, t.a * uA); }';
  const mats = EMOTES.map((n, i) => new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex }, uOff: { value: new THREE.Vector2(i % 4, 1 - Math.floor(i / 4)) }, uA: { value: 1 } }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: false }));
  return (EMO = { tex, mats, geo: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0) });
}
/**
 * setEmote(group, name, seconds = 0): float a bubble above the head that pops in with a bouncy scale. name = 'heart' | 'exclamation' | 'zzz' | 'note' | 'sweat' | 'sparkle' | 'coin' | 'question'
 * (or null / 'none' to pop it away). seconds > 0 hides it automatically. One pooled quad per villager, one shared atlas; the bubble is animated from setPose (call it every frame as usual).
 */
export function setEmote(g, name, seconds = 0) {
  const r = rigOf(g); if (!r) return;
  if (name == null || name === 'none' || name === '') { if (r.emote) { r.emote = null; r.emOut = -1; } return; }
  name = EMO_ALIAS[name] || name; if (!EMOTES.includes(name)) return;
  const kit = emoteKit(); r.emote = name; r.emT0 = -1; r.emOut = 0; r.emDur = seconds;
  if (!kit) return;
  if (!r.em) { const m = new THREE.Mesh(kit.geo, kit.mats[0]); m.name = 'emote'; m.frustumCulled = false; m.renderOrder = 30; m.visible = false; m.castShadow = false; g.add(m); r.em = m; }
  r.em.material = kit.mats[EMOTES.indexOf(name)];
}
// scratch outputs of the stroke curves (module scope: no allocation)
let S_A = 0, S_L = 0, S_Q = 0, S_H = 0;
/** one tool stroke, u in 0..1. Anticipation (dip), wind-up, hold, fast strike, impact squash, overshoot + damped settle. Writes S_A (arm), S_L (body lean), S_Q (squash 0..1, negative = stretch), S_H (head). */
function stroke(u, up, dn) {
  if (u < 0.08) { const k = ease.inOut(u / 0.08); S_A = 0.18 * k; S_L = -0.04 * k; S_Q = 0.35 * k; S_H = 0.04 * k; } // anticipation: a small dip and squash
  else if (u < 0.5) { const k = ease.inOut((u - 0.08) / 0.42); S_A = 0.18 + (up - 0.18) * k; S_L = -0.04 - 0.14 * k; S_Q = 0.35 - 0.85 * k; S_H = 0.04 - 0.16 * k; } // wind-up with a stretch
  else if (u < 0.58) { const k = (u - 0.5) / 0.08; S_A = up + Math.sin(k * 25) * 0.025; S_L = -0.18; S_Q = -0.5; S_H = -0.12; } // hold at the top (tremble)
  else if (u < 0.68) { const k = (u - 0.58) / 0.1, e = k * k; S_A = up + (dn - 0.22 - up) * e; S_L = -0.18 + 0.4 * e; S_Q = -0.5 + 1.4 * e; S_H = -0.12 + 0.3 * e; } // strike (accelerating), overshoots below dn
  else if (u < 0.8) { const k = (u - 0.68) / 0.12; S_A = dn - 0.22 * Math.exp(-5 * k) * Math.cos(10 * k); S_L = 0.22 * Math.exp(-3 * k); S_Q = 0.9 * Math.exp(-4 * k); S_H = 0.18 * Math.exp(-3 * k); } // impact squash + follow-through
  else { const k = ease.inOut((u - 0.8) / 0.2); S_A = dn * (1 - k); S_L = 0; S_Q = 0; S_H = 0; } // recover
}
const ALIAS = { carryLog: ['carry', 'log'], carryStone: ['carry', 'stone'], carryWheat: ['carry', 'wheat'], carryEggs: ['carry', 'eggs'], carrySack: ['carry', 'sack'], lookAround: ['look', null] };
/** every pose setPose understands */
export const POSES = ['idle', 'walk', 'work', 'carry', 'cheer', 'sleep', 'sit', 'eat', 'wave', 'stretch', 'look'];
const fract = (x) => x - Math.floor(x);

/**
 * setPose(group, pose, t, phase): 'idle' | 'walk' | 'work' | 'carry' | 'cheer' | 'sleep' | 'sit' | 'eat' | 'wave' | 'stretch' | 'look' (aliases: 'carryLog', 'carryStone', 'carryWheat', 'carryEggs', 'lookAround').
 * t in seconds, phase = per-villager offset. 'idle' plays little variants by itself (look around, stretch, wave). 'carry' holds the load chosen with setCarry (default sack).
 * 'work' is the tool stroke with anticipation and follow-through. Pure number writes, no allocation. Drives body, head, armR/armL, legL/legR, eyes (blink), carry/tool/zzz visibility and the emote bubble.
 */
export function setPose(g, pose = 'idle', t = 0, phase = 0) {
  const r = rigOf(g); if (!r) return;
  let load = r.load; const al = ALIAS[pose]; if (al) { pose = al[0]; if (al[1]) load = al[1]; }
  let by = 0, brx = r.lean, bry = 0, brz = 0, sx = 1, sy = 1, hx = 0, hy = 0, hz = 0, aR = 0, aL = 0, azR = r.armZ, azL = -r.armZ, lL = 0, lR = 0, lz = 0, hip = 0.2, eye = 1, showCarry = false, showTool = true, showZ = false, mouth = 0, showBowl = false, spoon = false, chewV = 0;
  switch (pose) {
    case 'walk': {
      const ph = t * 10 + phase, s = Math.sin(ph), c = Math.abs(Math.cos(ph)), k = r.hasTool ? 0.45 : 0.85;
      lL = s * 0.8; lR = -s * 0.8; aR = lL * k; aL = lR * k; by = Math.abs(s) * 0.09; brz = s * 0.09; hz = -s * 0.07; sy = 0.94 + (1 - c) * 0.1; sx = 1.05 - (1 - c) * 0.07; brx += 0.07; hx = Math.abs(s) * 0.05; bry = s * 0.06; break;
    }
    case 'work': {
      const w = r.work;
      if (w.st === 0) { // chop / mine / hoe / hammer
        const u = ((t + phase) / w.T) % 1; stroke(u < 0 ? u + 1 : u, w.up, w.dn);
        aR = S_A; aL = S_A * 0.55 - 0.15; azL = -r.armZ - 0.12; lL = -0.14 - S_L * 0.3; lR = 0.16 + S_L * 0.3; brx += S_L; by = Math.max(0, -S_Q) * 0.03; sy = 1 - S_Q * 0.075; sx = 1 + S_Q * 0.05; hx = 0.05 + S_H; hz = Math.sin(t * w.T) * 0.02;
      } else if (w.st === 1) { // stir: arm draws small circles, body sways
        const s = Math.sin(t * 6 + phase), c = Math.cos(t * 6 + phase); aR = w.c + s * w.a * 0.7; azR = r.armZ + c * 0.28; aL = -0.5; azL = -0.4; brx += 0.1; bry = c * 0.07; brz = s * 0.03; by = Math.abs(s) * 0.012; hx = 0.1; hy = s * 0.07; lL = -0.1; lR = 0.1; sy = 1 + s * 0.012;
      } else if (w.st === 2) { // read the scroll
        aR = w.c; aL = -0.9; azL = -0.2; hx = 0.14; hy = Math.sin(t * 1.5 + phase) * 0.14; brx += 0.04; sy = 1 + Math.sin(t * 2 + phase) * 0.012;
      } else { // gather / bend and pick
        const s = Math.sin(t * 4.5 + phase), pos = Math.max(0, s), dip = ease.inOut(pos); aR = w.c - dip * 0.8; aL = aR * 0.7; brx += 0.1 + dip * 0.45; by = -dip * 0.03; sy = 1 - dip * 0.05; sx = 1 + dip * 0.03; hx = 0.06 - dip * 0.15; lL = -dip * 0.3; lR = dip * 0.4;
      }
      break;
    }
    case 'carry': {
      const ph = t * 8 + phase, s = Math.sin(ph), c = Math.abs(Math.cos(ph));
      lL = s * 0.6; lR = -s * 0.6; aR = aL = load === 'eggs' ? -0.85 : load === 'wheat' ? -1.2 : -1.05; azR = load === 'eggs' ? -0.28 : -0.42; azL = -azR; by = Math.abs(s) * 0.07; sy = 0.95 + (1 - c) * 0.08; sx = 1.04 - (1 - c) * 0.06; brz = s * 0.06; brx -= load === 'stone' ? 0.14 : 0.07; hz = -s * 0.05; showCarry = true; showTool = false; if (load === 'eggs') by *= 0.5;
      break;
    }
    case 'cheer': {
      const q = t * 6 + phase, j = Math.abs(Math.sin(q)), w = Math.sin(t * 12 + phase), u = (q / Math.PI) % 1, crouch = u > 0.82 ? Math.sin((u - 0.82) / 0.18 * Math.PI) : 0; // a little crouch before every jump
      by = j * 0.24; aR = -2.75 + w * 0.3; aL = -2.75 - w * 0.3; azR = 0.5; azL = -0.5; lL = -0.4 * j; lR = 0.35 * j; hz = Math.sin(q * 0.5) * 0.12; sy = 0.88 + j * 0.2 - crouch * 0.07; sx = 1.09 - j * 0.11 + crouch * 0.05; brx -= 0.05; hx = -0.1; mouth = 2; break;
    }
    case 'wave': {
      const w = Math.sin(t * 9 + phase);
      aR = -2.45; azR = 0.5 + w * 0.34; aL = Math.sin(t * 2 + phase) * 0.06; hz = 0.1; hx = -0.04; hy = Math.sin(t * 1.3 + phase) * 0.12; brz = Math.sin(t * 1.8 + phase) * 0.03; by = (0.5 + 0.5 * Math.sin(t * 9 + phase)) * 0.012; sy = 1 + Math.sin(t * 2.2 + phase) * 0.02; brx -= 0.04; mouth = 2;
      break;
    }
    case 'stretch': {
      const u = ((t + phase) % 4) / 4, e = Math.sin(Math.PI * Math.min(1, u * 1.25)) ** 0.7, tr = u > 0.8 ? Math.sin((u - 0.8) * 40) * 0.05 * (1 - (u - 0.8) / 0.2) : 0;
      aR = -2.9 * e + tr; aL = -2.9 * e - tr; azR = 0.3 + 0.25 * e; azL = -azR; brx -= 0.16 * e; hx = -0.22 * e; sy = 1 + 0.08 * e; sx = 1 - 0.04 * e; by = 0.03 * e; lL = -0.08 * e; lR = 0.08 * e; eye = 1 - 0.9 * Math.min(1, e * 1.4);
      mouth = e > 0.6 ? 1 : 0; break;
    }
    case 'look': {
      const s = Math.sin(t * 0.9 + phase), e = Math.sin(t * 0.45 + phase * 1.3);
      hy = s * 0.85; hx = e * 0.12; bry = s * 0.22; aR = -0.1; aL = 0.1; by = 0; sy = 1 + Math.sin(t * 2.2 + phase) * 0.02; azR = r.armZ + 0.1; azL = -azR; hz = -s * 0.05; break;
    }
    case 'sit': {
      const br = Math.sin(t * 1.8 + phase); hip = 0.11; by = -0.09; lL = lR = -1.5; lz = 0.12; aR = -0.55; aL = -0.5; azR = r.armZ + 0.1; azL = -azR - 0.0; brx += 0.1; sy = 1 + br * 0.025; sx = 1 - br * 0.012; hy = Math.sin(t * 0.5 + phase * 1.7) * 0.4; hx = Math.sin(t * 0.7 + phase) * 0.08; hz = Math.sin(t * 0.9 + phase) * 0.05; lL += Math.max(0, Math.sin(t * 1.3 + phase * 3)) ** 8 * 0.3; break;
    }
    case 'eat': {
      ensureEat(r); const cyc = (t * 0.55 + phase * 0.3) % 1, bite = cyc < 0.55 ? ease.inOut(cyc / 0.55) : cyc < 0.7 ? 1 : 1 - ease.inOut((cyc - 0.7) / 0.3), chew = cyc > 0.62 && cyc < 0.95 ? Math.sin(t * 16) : 0;
      hip = 0.11; by = -0.09; lL = lR = -1.5; lz = 0.12; aR = -0.95 - bite * 1.0; azR = r.armZ - 0.1 * bite; aL = -1.0; azL = -0.25; brx += 0.08 - bite * 0.04; hx = 0.08 + (1 - bite) * 0.16 - bite * 0.04; hy = chew * 0.04; sy = 1 + Math.sin(t * 2 + phase) * 0.014; mouth = bite > 0.85 ? 1 : cyc > 0.62 && cyc < 0.95 ? 3 : 0; chewV = chew; showBowl = true; spoon = true; showTool = false; break;
    }
    case 'sleep': {
      const br = Math.sin(t * 1.4 + phase); sy = 1 + br * 0.03; sx = 1 - br * 0.015; brx += 0.2; hx = 0.38; hz = 0.14; aR = 0.08; aL = 0.08; eye = 0.06; showZ = true; lL = 0.2; lR = -0.2; break;
    }
    default: { // idle: breathing squash, a little sway, a happy hop every few seconds, and a variant (look around, stretch, wave) every few more
      const br = Math.sin(t * 2.2 + phase); sy = 1 + br * 0.028; sx = 1 - br * 0.013; hz = Math.sin(t * 0.9 + phase) * 0.05; hy = Math.sin(t * 0.55 + phase * 1.7) * 0.2; aR = br * 0.07; aL = -br * 0.07; brz = Math.sin(t * 0.9 + phase) * 0.025;
      const u = (t + phase * 0.8) % 3.6;
      if (u < 0.4) { const k = Math.sin(u / 0.4 * Math.PI); by = k * 0.07; sy += k * 0.05; sx -= k * 0.03; aR -= k * 0.35; aL += k * 0.35; } else if (u < 0.55) { const k = Math.sin((u - 0.4) / 0.15 * Math.PI); sy -= k * 0.06; sx += k * 0.04; }
      if (r.toolKind === 'basket' || r.toolKind === 'scroll') aR -= 0.1;
      // variant: one 4 second window in every 9 second slot, chosen per villager (hash), so a crowd never moves in unison
      const tt = t + phase * 3.1, slot = Math.floor(tt / 9), ts = tt - slot * 9, vr = fract(Math.sin(slot * 12.9898 + phase * 78.233) * 43758.5453), uu = (ts - 1.2) / 4;
      if (uu > 0 && uu < 1) {
        const e = Math.min(1, Math.sin(uu * Math.PI) * 1.7);
        if (vr < 0.3) { hy += Math.sin(uu * Math.PI * 2) * 0.85 * e; bry = Math.sin(uu * Math.PI * 2) * 0.16 * e; hx += 0.05 * e; }
        else if (vr < 0.5) { const s2 = uu > 0.8 ? Math.sin((uu - 0.8) * 60) * 0.04 : 0; aR += (-2.85 - aR) * e + s2; aL += (-2.85 - aL) * e - s2; azR += (0.35 - azR) * e; azL += (-0.35 - azL) * e; brx -= 0.14 * e; hx -= 0.2 * e; sy += 0.07 * e; sx -= 0.03 * e; eye = 1 - 0.85 * e; mouth = e > 0.6 ? 1 : 0; }
        else if (vr < 0.65 && !r.hasTool) { aR += (-2.45 - aR) * e; azR += (0.5 + Math.sin(t * 9 + phase) * 0.32 - azR) * e; hz += 0.1 * e; hy *= 1 - e; mouth = 2 * (e > 0.5 ? 1 : 0); }
        else if (vr < 0.8) { hx += 0.28 * e; hy *= 1 - e; by -= 0.02 * e; sy -= 0.03 * e; } // a quick glance down at something
      }
    }
  }
  const b = r.body; b.position.y = by; b.rotation.set(brx, bry, brz); b.scale.set(sx, sy, sx);
  r.head.rotation.set(hx, hy, hz); r.armR.rotation.set(aR, 0, azR); r.armL.rotation.set(aL, 0, azL); r.legL.rotation.set(lL, 0, -lz); r.legR.rotation.set(lR, 0, lz); r.legL.position.y = r.legR.position.y = hip;
  // blink (every ~3.4 s, 0.14 s long, sometimes twice), closed in sleep
  let e = eye === 1 ? r.eyeBase : eye * r.eyeBase;
  if (eye === 1) { const u = (t + phase * 0.61) % 3.4; if (u < 0.14) e *= 1 - 0.92 * Math.sin(u / 0.14 * Math.PI); else if (u > 0.3 && u < 0.42 && fract(phase * 7.1) < 0.4) e *= 1 - 0.92 * Math.sin((u - 0.3) / 0.12 * Math.PI); }
  r.eyes.scale.y = e; r.eyes.scale.x = r.mood === 'excited' ? 1.05 : 1; if (r.lids && r.lids.visible) r.lids.scale.y = 1 + (1 - e) * 0.3;
  // mouth override for the pose (mouth: 1 = open laugh, 2 = big smile, 3 = chew); the mood decides when 0
  const md = r.mood; if (mouth !== r.mouthMode) { r.mouthMode = mouth; const base = md === 'tired' || md === 'sleepy' || md === 'hungry' || md === 'excited'; if (!base) { if (mouth && r.ensureMood) r.ensureMood(); r.mouthSmile.visible = mouth === 0; if (r.mouthBig) { r.mouthBig.visible = mouth === 1 || mouth === 2; r.mouthO.visible = mouth === 3; } } }
  if (r.mouthO && r.mouthO.visible) { r.mouthO.scale.set(1 + Math.abs(chewV) * 0.25, 1 + Math.abs(chewV) * 0.5, 1); }
  r.carry.visible = showCarry; if (showCarry && r.wLoad !== load) applyLoad(r, load);
  if (r.tool) r.tool.visible = showTool; r.zzz.visible = showZ; if (r.eatG) { r.eatG.visible = showBowl; r.spoon.visible = spoon; }
  if (showZ) { const zk = r.zzz.children; for (let i = 0; i < 2; i++) { const k = (t * 0.45 + i / 2 + phase) % 1, m = zk[i]; m.position.set(0.22 + k * 0.22, 1.0 + k * 0.4, 0.05); const sc = 0.025 + 0.05 * Math.sin(k * Math.PI); m.scale.set(sc, sc, sc); } }
  // ---- emote bubble: ease-out-back pop-in, a gentle bob, a squash pulse, pops away when cleared
  const em = r.em;
  if (em) {
    if (r.emote) {
      if (r.emT0 < 0) r.emT0 = t; const a = t - r.emT0;
      if (r.emDur > 0 && a > r.emDur) { r.emote = null; r.emOut = t; } else {
        const k = ease.back(a / 0.42), pulse = 1 + Math.sin(a * 6) * 0.04 * Math.min(1, a / 0.6), s = 0.62 * Math.max(0.001, k);
        em.visible = true; em.scale.set(s * pulse, s / pulse, 1); em.position.set(0.0, r.emY + Math.sin(a * 3.2) * 0.035 + (1 - Math.min(1, a / 0.3)) * -0.15, 0); em.material.uniforms.uA.value = Math.min(1, a / 0.1);
      }
    }
    if (!r.emote) {
      if (r.emOut > 0) { const a = t - r.emOut, k = 1 - ease.inOut(a / 0.22); if (k <= 0.01) { em.visible = false; r.emOut = 0; } else { const s = 0.62 * k; em.scale.set(s * (1 + (1 - k) * 0.3), s * k, 1); } } else if (r.emOut === -1) { em.visible = false; r.emOut = 0; }
    }
  }
}

/** a varied villager: random profession, age mix, owner colour (only an accent now; the outfit colour is picked per villager). opts.lod passes through. */
export function randomVillager(seed = 1, color, opts = {}) {
  const r = rng(seed * 2654435761 + 7);
  const prof = PROFESSIONS[Math.floor(r() * PROFESSIONS.length)];
  const a = r(), age = a < 0.13 ? 'child' : a < 0.22 ? 'elder' : 'adult';
  const col = color || P.outfit[Math.floor(r() * P.outfit.length)];
  const g = villagerModel(col, Math.floor(r() * 100), { tool: prof.tool, seed, age, ...opts });
  g.userData.profession = prof.id; return g;
}

function allTris(g) { let n = 0; g.traverse((o) => { if (o.isMesh) { const gg = o.geometry; n += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } }); return n; }
/** triangle count of a model (visible meshes, for budgets). */
export function triangles(g) {
  let n = 0; g.traverseVisible((o) => { if (o.isMesh) { const gg = o.geometry; n += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } }); return n;
}
