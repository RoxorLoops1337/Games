// Hearthvale villagers, ROUND 2 "Happy Light": chubby, bright, friendly toy people. All procedural, ~1.0 unit tall, <= 2100 triangles.
//
// WHAT RESEARCH TAUGHT ME (craft notes + cozy life-sim character analysis), applied below:
//  1. Instantly friendly = baby schema: big round head, eyes set LOW and WIDE, chubby cheeks, short limbs. Head is ~1:1.7 to the body.
//  2. Cozy life-sims use SIMPLE glossy dot eyes (one big highlight), a tiny blush oval, a small nose dot or none, and a big clear smile. No lids,
//     no lashes, no detail noise: the face is a few bold marks on a big clean round shape.
//  3. Colour-blocked outfits in clean pastel candy colours (mint, butter, peach, lilac, sky, blossom) with ONE accent; each villager a different
//     hue so a crowd reads as a bouquet, not a uniform. The owner colour is only the small accent (collar, hat band, scarf).
//  4. Inclusive design done respectfully: five skin tones spread evenly across the village, hair TEXTURES (afro, puffs, curls, braids, buns,
//     straight) rather than only colours, headwear (turban, headscarf, caps) as plain everyday clothes, glasses, ages and body builds.
//     Every face keeps the same cute grammar, so nobody is a caricature and nobody is "the default".
//  5. Dark skin must be lit like light skin: saturated WARM base (never grey or brown-black), a lighter warm top highlight (gradient by normal),
//     warm rosy blush, and a small emissive lift so shadows never go muddy. Dark hair always gets a lighter top sheen so it is never a
//     black blob from the game camera (top-down), and near-black hair is simply not used (deepest is a warm chocolate, at most ~12%).
//  6. Silhouette first: profession reads in the hat/tool (straw brim, chef puff, hard hat) while the rest is free variety.
//  7. Squash and stretch: walking is a hop (stretch in the air, squash on contact), idle breathes and hops now and then, cheer is a big bounce.
//  8. Low-poly craft: smooth ellipsoids, vertex-colour gradients (lighter top) instead of textures, one merged mesh per rigid part.
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
const G = (a, b) => a + '|' + b; // vertex colour gradient: base | colour at the top (by normal.y)
const lum = (c) => { const k = new THREE.Color(c); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b; };

// ---------------------------------------------------------------- geometry library (cached, coloured by vertex colour)
const HEMI = (w, h) => () => new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2); // flat back, dome towards +Z (for face decals)
const GEOS = {
  dot: () => new THREE.SphereGeometry(1, 5, 4),
  sphS: () => new THREE.SphereGeometry(1, 6, 4),
  sph: () => new THREE.SphereGeometry(1, 7, 5),
  sphT: () => new THREE.SphereGeometry(1, 8, 6),
  sphM: () => new THREE.SphereGeometry(1, 10, 7),
  head: () => new THREE.SphereGeometry(1, 14, 9),
  hemi: HEMI(8, 3), hemiM: HEMI(8, 3), hemiS: HEMI(6, 2), hemiE: HEMI(8, 2),
  capA: () => new THREE.SphereGeometry(1, 14, 3, 0, Math.PI * 2, 0, Math.PI * 0.3),
  capB: () => new THREE.SphereGeometry(1, 14, 4, 0, Math.PI * 2, 0, Math.PI * 0.4),
  capC: () => new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.5),
  cone6: () => new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0),
  cone8: () => new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  cyl8: () => new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl12: () => new THREE.CylinderGeometry(1, 1, 1, 9),
  box: () => roundedBoxGeo(1, 1, 1, 0.22, 1).clone(),
  bx: () => new THREE.BoxGeometry(1, 1, 1),
  tor: () => new THREE.TorusGeometry(1, 0.26, 4, 9),
  torS: () => new THREE.TorusGeometry(1, 0.2, 3, 8),
  torH: () => new THREE.TorusGeometry(1, 0.2, 3, 12),
  arcT: () => new THREE.TorusGeometry(1, 0.2, 3, 5, Math.PI),
  arcB: () => new THREE.TorusGeometry(1, 0.3, 3, 6, Math.PI),
};
const geoCache = new Map(), colGeoCache = new Map();
function colored(kind, color) {
  const k = kind + color; let g = colGeoCache.get(k);
  if (!g) {
    let b = geoCache.get(kind); if (!b) { b = GEOS[kind](); geoCache.set(kind, b); }
    g = b.clone(); const [c0s, c1s] = color.split('|'); const c0 = new THREE.Color(c0s), c1 = c1s ? new THREE.Color(c1s) : null, n = g.attributes.position.count, a = new Float32Array(n * 3), nr = g.attributes.normal, tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      tmp.copy(c0); if (c1) { const t = Math.max(0, Math.min(1, (nr.getY(i) - 0.05) / 0.8)); tmp.lerp(c1, t * t * (3 - 2 * t)); }
      a[i * 3] = tmp.r; a[i * 3 + 1] = tmp.g; a[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); colGeoCache.set(k, g);
  }
  return g;
}
// a faint warm emissive lifts every shadow (high-key look; skin never goes muddy)
const vcMat = soft('#ffffff', { vertexColors: true, emissive: '#ffb890', emissiveIntensity: 0.09 });
const eyeMat = gloss('#ffffff', { vertexColors: true, roughness: 0.15 });
const hiMat = soft('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.9 });

/** unit mesh of `kind`, vertex-coloured, scaled (sx,sy,sz), euler (rx,ry,rz) in YXZ order. col may be a gradient G(base, top). */
function mk(kind, col, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, mat = vcMat) {
  if (kind === 'sph' && Math.max(sx, sy, sz) <= 0.05) kind = 'dot'; else if (kind === 'hemi' && Math.max(sx, sy) <= 0.05) kind = 'hemiS';
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
// cheerful, clearly different outfit colours: P.outfit-like saturated ones plus pastels. NO dark colours.
const OUTFITS = ['#ff6f61', '#4f9cf2', '#ffbf1f', '#4fcf6e', '#a96af0', '#ff7fb8', '#2fc4bc', '#ff8c3a',
  '#6fdca0', '#ffd84a', '#ff9f78', '#b79aff', '#7ac4ff', '#ff90bc', '#a4de3c', '#58d8e4', '#f08ce0', '#ffe66a'];
const PANTS = ['#e8c9a0', '#9bc0f0', '#f0b8a8', '#b4dc98', '#d4c0f0', '#f4d890', '#a8d8d0', '#f4b0c8'];
const BOOTS = ['#c98a58', '#e2a070', '#e8c068', '#9ab6e8', '#c9a0e0', '#f0907a'];
// hair: [colour, weight, name]; warm browns plus fun colours; the deepest is a warm chocolate (never black), <= ~12%
const HAIRS = [['#4a2e2e', 6, 'chocolate'], ['#6e4630', 9, 'brown'], ['#92532e', 9, 'chestnut'], ['#c27a34', 8, 'caramel'], ['#f0b53c', 9, 'honey'], ['#f6dd8e', 6, 'blonde'],
  ['#e8602c', 9, 'ginger'], ['#b08cf5', 9, 'lilac'], ['#ff7eb0', 9, 'pink'], ['#38c0b0', 8, 'teal'], ['#eeeef6', 5, 'silver'], ['#7ab8ff', 6, 'sky'], ['#6fdca0', 6, 'mint']];
const ELDER_HAIRS = [['#eeeef6', 40, 'silver'], ['#e0dcd0', 30, 'ash'], ['#d9d0ee', 15, 'lilac-silver'], ['#f4e4c0', 15, 'cream']];
const SKIN_W = [22, 22, 22, 20, 14]; // peach, light, tan, golden brown, deep brown
const wpick = (rnd, list, wi = 1) => { let s = 0; for (const e of list) s += Array.isArray(e) ? e[wi] : e; let r = rnd() * s; for (let i = 0; i < list.length; i++) { r -= Array.isArray(list[i]) ? list[i][wi] : list[i]; if (r <= 0) return i; } return list.length - 1; };

// ---------------------------------------------------------------- hair / hat builders (head-local coordinates, y up, z = face)
const capOn = (kind, col, s = 1.04, tilt = -0.3, dy = 0, dz = 0, sy = 1) => mk(kind, col, 0, dy, dz, HX * s, HY * s * sy, HZ * s, tilt);
const hairCap = (c, o, s = 1.045, tilt = -0.34) => c.push(capOn('capB', o.hairG, s, tilt));
function fringe(c, o) {
  for (const [x, y, r] of [[-0.17, 0.165, 0.078], [0, 0.195, 0.08], [0.17, 0.165, 0.078]]) { const f = fm('dot', o.hairG, x, y, -0.01, r * 1.1, r * 0.8, r * 0.55); f.userData.opt = 1; c.push(f); }
}
const ribbon = (c, o, x, y, z, s = 0.05) => c.push(mk('sphS', o.ribbon, x, y, z, s, s * 0.8, s * 0.8));
const GEAR = {
  short(c, o) { hairCap(c, o); fringe(c, o); },
  messy(c, o) {
    hairCap(c, o); fringe(c, o);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.4, rr = 0.17; c.push(mk('cone6', o.hairG, Math.sin(a) * rr, 0.25, Math.cos(a) * rr * 0.9 - 0.02, 0.08, 0.16, 0.08, Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7)); }
    c.push(mk('cone6', o.hairG, 0.04, 0.3, 0.1, 0.05, 0.22, 0.05, 0.5, 0, -0.5));
  },
  bun(c, o) { hairCap(c, o); fringe(c, o); c.push(mk('sphM', o.hairG, 0, 0.36, -0.1, 0.13, 0.12, 0.13), mk('tor', o.ribbon, 0, 0.28, -0.1, 0.09, 0.09, 0.07, Math.PI / 2)); },
  twinbuns(c, o) { hairCap(c, o); fringe(c, o); for (const s of [-1, 1]) c.push(mk('sphM', o.hairG, s * 0.23, 0.28, -0.05, 0.125, 0.12, 0.12), mk('tor', o.ribbon, s * 0.2, 0.22, -0.04, 0.085, 0.085, 0.07, Math.PI / 2, 0, s * 0.5)); },
  topknot(c, o) { hairCap(c, o, 1.045, -0.4); fringe(c, o); c.push(mk('sph', o.hairG, 0, 0.32, -0.04, 0.07, 0.06, 0.07), mk('sphM', o.hairG, 0, 0.4, -0.04, 0.11, 0.1, 0.11), mk('tor', o.ribbon, 0, 0.33, -0.04, 0.075, 0.075, 0.06, Math.PI / 2)); },
  pigtails(c, o) {
    hairCap(c, o, 1.045, -0.3); fringe(c, o);
    for (const s of [-1, 1]) c.push(mk('sph', o.hairG, s * 0.37, -0.1, -0.08, 0.09, 0.16, 0.09, 0, 0, s * 0.35), mk('sphS', o.ribbon, s * 0.335, 0.05, -0.05, 0.055, 0.045, 0.055));
  },
  long(c, o) { hairCap(c, o, 1.045, -0.3); c.push(mk('sphM', o.hairG, 0, -0.1, -0.15, 0.36, 0.38, 0.2)); for (const s of [-1, 1]) c.push(mk('sphS', o.hairG, s * 0.335, -0.12, -0.02, 0.06, 0.2, 0.12)); fringe(c, o); ribbon(c, o, 0.25, 0.17, 0.04, 0.05); },
  bob(c, o) { hairCap(c, o, 1.05, -0.32); c.push(mk('sphM', o.hairG, 0, -0.07, -0.07, 0.385, 0.25, 0.275)); fringe(c, o); },
  afro(c, o) { hairCap(c, o, 1.045, -0.5); c.push(mk('sphM', o.hairG, 0, 0.13, -0.17, 0.47, 0.43, 0.4)); for (const [x, y, r] of [[-0.16, 0.2, 0.07], [0.16, 0.2, 0.07], [0, 0.22, 0.075]]) { const f = fm('dot', o.hairG, x, y, 0.0, r, r * 0.8, r * 0.7); f.userData.opt = 1; c.push(f); } },
  afroPuffs(c, o) { hairCap(c, o); fringe(c, o); for (const s of [-1, 1]) c.push(mk('sphM', o.hairG, s * 0.27, 0.27, -0.03, 0.18, 0.17, 0.17), mk('sphS', o.ribbon, s * 0.22, 0.19, -0.03, 0.055, 0.04, 0.055)); },
  curly(c, o) {
    hairCap(c, o, 1.045, -0.36); fringe(c, o);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; c.push(mk('sphS', o.hairG, Math.sin(a) * 0.24, 0.21, Math.cos(a) * 0.2 - 0.04, 0.105, 0.1, 0.105)); }
    c.push(mk('sphS', o.hairG, 0, 0.3, -0.04, 0.115, 0.105, 0.115), mk('sphS', o.hairG, 0.1, 0.29, -0.12, 0.09, 0.085, 0.09));
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
    c.push(mk('sph', straw, 0, 0.13, 0.005, 0.5, 0.05, 0.5, -0.08), mk('capC', G(straw, '#fff0b8'), 0, 0.125, -0.005, 0.345, 0.3, 0.335, -0.08), mk('cyl12', o.color, 0, 0.17, -0.005, 0.352, 0.07, 0.342, -0.08));
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
    c.push(mk('sphM', '#ffffff', 0, 0.42, -0.01, 0.23, 0.17, 0.22), mk('sphS', '#fffaf0', -0.16, 0.34, 0.0, 0.14), mk('sphS', '#fffaf0', 0.16, 0.34, 0.0, 0.14), mk('sphS', '#fffaf0', 0, 0.35, -0.15, 0.14));
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
const HAT_COVERS_TOP = new Set(['straw', 'chef', 'elf', 'hood', 'turban', 'headscarf', 'baldcap']);

// ---------------------------------------------------------------- tools (origin = hand, +Y = tool axis, +Z = the cutting side)
const WOOD = '#d89a5e', WOODD = '#a8704a', STEEL = '#e6e9f0', STEELD = '#a4abc0';
function buildTool(kind, o) {
  const c = [];
  switch (kind) {
    case 'axe': c.push(mk('cyl8', WOOD, 0, 0.17, 0, 0.026, 0.54, 0.026), mk('bx', STEEL, 0, 0.36, 0.06, 0.035, 0.15, 0.17), mk('bx', STEELD, 0, 0.37, -0.03, 0.05, 0.1, 0.06)); break;
    case 'pick': c.push(mk('cyl8', WOOD, 0, 0.17, 0, 0.026, 0.54, 0.026), mk('bx', STEELD, 0, 0.4, 0, 0.045, 0.055, 0.16), mk('cone6', STEEL, 0, 0.4, 0.2, 0.04, 0.16, 0.04, Math.PI / 2 - 0.35), mk('cone6', STEEL, 0, 0.4, -0.2, 0.04, 0.16, 0.04, -Math.PI / 2 + 0.35)); break;
    case 'hoe': c.push(mk('cyl8', WOOD, 0, 0.22, 0, 0.026, 0.66, 0.026), mk('bx', STEEL, 0, 0.5, 0.075, 0.11, 0.025, 0.16, 0.6)); break;
    case 'hammer': c.push(mk('cyl8', WOOD, 0, 0.14, 0, 0.028, 0.46, 0.028), mk('box', '#c9c4bc', 0, 0.35, 0, 0.2, 0.1, 0.1), mk('box', STEELD, 0.09, 0.35, 0, 0.04, 0.115, 0.115)); break;
    case 'ladle': c.push(mk('cyl8', WOOD, 0, 0.17, 0, 0.022, 0.5, 0.022), mk('sph', STEELD, 0, 0.45, 0.03, 0.08, 0.045, 0.08, 0.4), mk('sph', STEEL, 0, 0.455, 0.03, 0.06, 0.03, 0.06, 0.4)); break;
    case 'scroll': c.push(mk('cyl12', '#fff1cf', 0, 0.12, 0, 0.055, 0.24, 0.055), mk('sph', '#d89a5e', 0, 0.245, 0, 0.05, 0.03, 0.05), mk('sph', '#d89a5e', 0, -0.005, 0, 0.05, 0.03, 0.05), mk('tor', '#ff7a7a', 0, 0.12, 0, 0.06, 0.06, 0.1, Math.PI / 2)); break;
    case 'basket': {
      c.push(mk('arcT', WOODD, 0, 0.02, 0, 0.13, 0.13, 0.1, 0, Math.PI / 2, 0));
      c.push(mk('sph', '#e8b070', 0, -0.1, 0, 0.16, 0.11, 0.16), mk('sphS', '#c9944a', 0, -0.035, 0, 0.15, 0.03, 0.15));
      c.push(mk('sph', '#ff6a5a', -0.04, -0.02, 0.03, 0.06), mk('sph', '#ffb02e', 0.05, -0.02, -0.02, 0.06)); break;
    }
    case 'cane': c.push(mk('cyl8', WOODD, 0, 0.1, 0, 0.02, 0.4, 0.02), mk('sph', WOODD, 0, 0.31, 0.02, 0.045)); break;
  }
  return bake(c, 'tool');
}
const TOOL_ALPHA = { axe: 0.8, pick: 0.8, hoe: 0.7, hammer: 0.7, ladle: 0.5, scroll: 0.3, basket: 0, cane: 0.1, none: 0 };
const WORK = { axe: { c: -0.5, a: 1.4, s: 9 }, pick: { c: -0.5, a: 1.4, s: 8 }, hoe: { c: -0.4, a: 1.1, s: 7 }, hammer: { c: -0.3, a: 1.0, s: 12 }, ladle: { c: -0.9, a: 0.22, s: 6 }, scroll: { c: -1.15, a: 0.08, s: 2 }, basket: { c: -0.5, a: 0.45, s: 5 }, cane: { c: -0.5, a: 0.8, s: 8 }, none: { c: -0.5, a: 0.8, s: 8 } };

// ---------------------------------------------------------------- the villager
const RIGS = new WeakMap();
const BUDGET = 2040; // counted over EVERY mesh (hidden mood swaps, sack and zzz included): the test sums them all under a 2100 cap

/**
 * villagerModel(color, hat, opts) -> THREE.Group
 * color: OWNER colour, only a small accent (collar, hat band, scarf). hat: integer seed 0..99 (skin, hair, headgear, outfit colour, face, build).
 * opts: { tool: 'none'|'axe'|'pick'|'hoe'|'hammer'|'ladle'|'scroll'|'basket', seed, age: 'adult'|'child'|'elder', style, gear, skin: 0..4, build: 'round'|'tall'|'small'|'normal', outfit }
 */
export function villagerModel(color = '#e8564a', hat = 0, opts = {}) {
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
  const hairG = G(hair, hairTop);
  // ----- outfit: a different cheerful colour per villager; the owner colour is only an accent
  const outfitI = opts.outfit ?? Math.floor(rnd() * OUTFITS.length), outfit = sat(OUTFITS[outfitI % OUTFITS.length], 1.22);
  const hatI = (outfitI + 3 + Math.floor(rnd() * (OUTFITS.length - 5))) % OUTFITS.length, hatC = sat(OUTFITS[hatI], 1.15);
  const style = opts.style || (tool !== 'none' ? prof.style : pick(STYLES));
  const build = opts.build || (child ? 'small' : ['round', 'round', 'normal', 'normal', 'tall', 'small'][Math.floor(rnd() * 6)]);
  const wm = build === 'round' ? 1.16 : build === 'tall' ? 0.94 : build === 'small' ? 1.0 : 1.04;
  let gear = opts.gear; if (!gear) { const pool = prof.hats && rnd() < 0.6 ? prof.hats : GEARS; gear = pick(pool); if (elder && ['pigtails', 'crown', 'flowers', 'twinbuns', 'braids'].includes(gear)) gear = pick(['short', 'cap', 'bun', 'headscarf', 'bob', 'baldcap']); if (child && gear === 'crown' && rnd() < 0.5) gear = 'short'; }
  const eyeV = Math.floor(rnd() * 3), mouthV = wpick(rnd, [3, 4, 3]), iris = pick(['#5a3a4a', '#3a5a8a', '#3a6a52', '#6a4a8a']), pants = pick(PANTS), bootC = pick(BOOTS), nose = rnd() < 0.7;
  const acc = elder ? pick(['mustache', 'glasses', 'beard', 'glasses', 'none']) : pick(['none', 'none', 'none', 'scarf', 'glasses', 'freckles', 'satchel', 'freckles', 'glasses', 'flower']);
  const accent = prof.accent, shirt = style === 'overalls' ? light(mixHex(outfit, '#fff4dc', 0.5), 0.2) : outfit;
  const gearO = { hair, hairG, color, hatC, cloth: hatC, ribbon: pick(['#ff8fb4', '#ff7a6a', '#6ab0f0', '#ffd24a', '#a98af0']), cap: hatC, band: color, accent };
  const shirtG = G(shirt, light(shirt, 0.16));

  const g = new THREE.Group(); g.name = 'villager';
  const body = new THREE.Group(); body.name = 'body'; g.add(body);
  g.add(groundShadow(0.4 * wm, 0.22, 1, 0.9));

  // ----- torso (static, vertex-coloured, merged)
  const t = [];
  t.push(mk('sphM', shirtG, 0, 0.3, 0, 0.26 * wm, 0.215, 0.24 * wm));
  if (style === 'apron') {
    t.push(mk('sph', accent, 0, 0.26, 0.11 * wm, 0.2 * wm, 0.18, 0.15), mk('sph', accent, 0, 0.42, 0.15, 0.11, 0.08, 0.07),
      mk('bx', light(accent, 0.3), 0, 0.19, 0.225 * wm, 0.11, 0.065, 0.02), mk('cyl8', accent, -0.1, 0.46, 0.04, 0.02, 0.1, 0.02, 0.0, 0, -0.5), mk('cyl8', accent, 0.1, 0.46, 0.04, 0.02, 0.1, 0.02, 0.0, 0, 0.5),
      mk('sph', o_(accent), 0.235 * wm, 0.27, -0.02, 0.045, 0.055, 0.055));
  } else if (style === 'overalls') {
    t.push(mk('sph', outfit, 0, 0.25, 0.04, 0.265 * wm, 0.165, 0.215 * wm), mk('sph', outfit, 0, 0.4, 0.15, 0.12, 0.085, 0.07), mk('bx', outfit, -0.105, 0.46, 0.06, 0.045, 0.13, 0.055, 0, 0, 0.12), mk('bx', outfit, 0.105, 0.46, 0.06, 0.045, 0.13, 0.055, 0, 0, -0.12),
      mk('sph', '#ffd24a', -0.105, 0.42, 0.2, 0.026), mk('sph', '#ffd24a', 0.105, 0.42, 0.2, 0.026), mk('bx', accent, 0.0, 0.24, 0.215 * wm, 0.13, 0.085, 0.025));
  } else if (style === 'tunic') {
    t.push(mk('cyl12', accent, 0, 0.245, 0, 0.268 * wm, 0.045, 0.24 * wm), mk('bx', '#ffd24a', 0, 0.245, 0.24 * wm, 0.065, 0.055, 0.02), mk('cyl12', G(light(shirt, 0.12), shirt), 0, 0.16, 0, 0.268 * wm, 0.08, 0.238 * wm),
      mk('sph', '#ffd24a', 0, 0.385, 0.215, 0.025), mk('sph', '#ffd24a', 0, 0.345, 0.228, 0.025));
  } else { // cloak
    t.push(mk('sphS', dark(outfit, 0.1), 0, 0.27, -0.1, 0.28 * wm, 0.24, 0.11), mk('cone8', dark(outfit, 0.06), 0, 0.02, -0.12, 0.27 * wm, 0.3, 0.12, Math.PI, 0, 0), mk('capA', G(outfit, light(outfit, 0.25)), 0, 0.405, 0.0, 0.3 * wm, 0.2, 0.26, 0.04), mk('sph', accent, 0, 0.25, 0.23, 0.11, 0.045, 0.025),
      mk('sph', '#ffd24a', 0, 0.395, 0.25, 0.037));
  }
  const t0 = t.length;
  // owner colour accent: a thin collar ring plus a little tie, or a bigger scarf
  if (acc === 'scarf') { t.push(mk('tor', color, 0, 0.46, 0.0, 0.25, 0.22, 0.13, Math.PI / 2), mk('bx', color, 0.11, 0.37, 0.18, 0.08, 0.19, 0.045, 0, 0, 0.1), mk('bx', light(color, 0.3), 0.11, 0.3, 0.18, 0.085, 0.03, 0.05, 0, 0, 0.1)); }
  else t.push(mk('tor', color, 0, 0.47, 0.0, 0.215, 0.19, 0.08, Math.PI / 2), mk('cone6', color, 0, 0.445, 0.2, 0.075, 0.11, 0.04, Math.PI), mk('sphS', light(color, 0.2), 0, 0.46, 0.205, 0.04));
  if (acc === 'satchel') t.push(mk('bx', '#b87a4a', 0.0, 0.33, 0.0, 0.05, 0.42, 0.32, 0, 0, -0.9), mk('bx', '#d4944f', -0.25, 0.17, 0.02, 0.11, 0.14, 0.14), mk('sph', '#ffd24a', -0.31, 0.19, 0.02, 0.022));
  if (acc === 'beard') t.push(mk('sphT', hair, 0, 0.43, 0.2, 0.13, 0.1, 0.07));
  for (let i = t0; i < t.length; i++) t[i].userData.opt = 1;

  // ----- arms (pivot at the shoulder, static parts baked in arm-local coordinates)
  function makeArm(side) {
    const a = new THREE.Group(); a.position.set(side * 0.255 * wm, 0.44, 0); a.rotation.z = side * 0.14;
    const parts = [mk('sphS', shirt, 0, -0.08, 0, 0.076, 0.105, 0.076), mk('sphS', skin, 0, -0.195, 0, 0.07)];
    for (const m of bake(parts).children) a.add(m);
    return a;
  }
  const arm = makeArm(1); arm.name = 'arm'; const armL = makeArm(-1); armL.name = 'armL'; body.add(arm, armL);
  const toolKind = tool !== 'none' ? tool : (elder ? 'cane' : 'none');
  let toolG = null;
  if (toolKind !== 'none') { toolG = buildTool(toolKind, gearO); toolG.position.set(0, -0.195, 0); toolG.rotation.x = TOOL_ALPHA[toolKind]; if (toolKind !== 'basket') toolG.scale.setScalar(1.3); if (toolKind === 'basket') toolG.position.x = 0.04; arm.add(toolG); }

  // ----- legs (pivot at the hip, children of the root so they do not bob)
  const legCol = style === 'overalls' ? outfit : pants;
  function makeLeg(side) {
    const l = new THREE.Group(); l.position.set(side * 0.115 * wm, 0.2, 0);
    for (const m of bake([mk('sphS', legCol, 0, -0.065, 0, 0.09, 0.095, 0.09), mk('sphS', bootC, 0, -0.145, 0.035, 0.1, 0.065, 0.13)]).children) l.add(m);
    return l;
  }
  const legL = makeLeg(-1); legL.name = 'legL'; const legR = makeLeg(1); legR.name = 'legR'; g.add(legL, legR);

  // ----- head
  const head = new THREE.Group(); head.name = 'head'; head.position.y = HEAD_Y; body.add(head);
  const hs = [];
  hs.push(mk('head', G(skin, skinTop), 0, 0, 0, HX, HY, HZ));
  hs.push(fm('hemiS', skin, -0.335, -0.02, -0.02, 0.055, 0.075, 0.055), fm('hemiS', skin, 0.335, -0.02, -0.02, 0.055, 0.075, 0.055));
  if (nose) hs.push(fm('hemi', noseC, 0, -0.075, -0.006, 0.028, 0.022, 0.026));
  const ch = child ? 1.15 : 1;
  hs.push(fm('hemiS', blush, -0.23, -0.12, -0.012, 0.095 * ch, 0.058 * ch, 0.02), fm('hemiS', blush, 0.23, -0.12, -0.012, 0.095 * ch, 0.058 * ch, 0.02));
  const g0 = hs.length; (GEAR[gear] || GEAR.short)(hs, gearO);
  for (let i = g0; i < hs.length; i++) { const m = hs[i]; if (Math.max(m.scale.x, m.scale.y, m.scale.z) <= 0.09) m.userData.opt = 1; } // tiny trinkets may be dropped if the model is over budget
  const h0 = hs.length;
  if (acc === 'freckles') for (const s of [-1, 1]) for (const [x, y] of [[0.2, -0.07], [0.25, -0.075], [0.225, -0.04]]) hs.push(fm('hemi', skinD, s * x, y, 0.0, 0.014, 0.014, 0.01));
  if (acc === 'glasses') { const fr = pick(['#ff8a6a', '#8a6af0', '#3fb5b0', '#ffc83a']); for (const s of [-1, 1]) hs.push(fm('torS', fr, s * 0.14, -0.04, 0.012, 0.115, 0.115, 0.07)); hs.push(fm('hemi', fr, 0, -0.03, 0.0, 0.025, 0.012, 0.012)); }
  if (acc === 'mustache') for (const s of [-1, 1]) hs.push(fm('hemi', hair, s * 0.05, -0.135, 0.0, 0.065, 0.032, 0.03, s * 0.25));
  if (acc === 'flower') hs.push(fm('sphS', '#ff8fb4', 0.2, 0.2, 0.012, 0.07, 0.065, 0.05), fm('dot', '#ffd24a', 0.2, 0.2, 0.05, 0.03));
  if (elder) for (const s of [-1, 1]) hs.push(fm('hemi', hair, s * 0.14, 0.06, 0.0, 0.065, 0.02, 0.02, s * -0.2));
  for (let i = h0; i < hs.length; i++) hs[i].userData.opt = 1;

  // eyes: big glossy dots with a soft tinted lower half, one big highlight and a small one. Group origin sits at the eye line so scale.y blinks about it.
  const EY = -0.045, ex = eyeV === 2 ? 0.15 : 0.138, erx = [0.082, 0.072, 0.09][eyeV], ery = [0.098, 0.115, 0.09][eyeV];
  const ep = [], hp = [];
  for (const s of [-1, 1]) {
    const X = s * ex;
    const e = fm('hemiE', '#2a1c2a', X, EY, -0.016, erx, ery, 0.036, 0, eyeMat); const i = fm('hemiS', iris, X, EY - 0.03, -0.004, erx * 0.7, ery * 0.5, 0.022, 0, eyeMat);
    const h1 = fm('hemiS', '#ffffff', X - erx * 0.3, EY + ery * 0.38, 0.014, erx * 0.38, erx * 0.42, 0.014, 0, hiMat), h2 = fm('hemiS', '#ffffff', X + erx * 0.36, EY - ery * 0.38, 0.012, erx * 0.17, erx * 0.17, 0.012, 0, hiMat);
    for (const m of [e, i]) { m.position.y -= EY; ep.push(m); } for (const m of [h1, h2]) { m.position.y -= EY; hp.push(m); }
  }
  const eyes = bake([...ep, ...hp], 'eyes'); eyes.position.y = EY; head.add(eyes);
  const lidList = []; for (const s of [-1, 1]) { const m = fm('hemiS', skin, s * ex, EY + ery * 0.55, -0.01, erx * 1.2, ery * 0.62, 0.045); m.position.y -= EY; lidList.push(m); }
  const lids = bake(lidList, 'lids'); lids.position.y = EY; lids.visible = false; head.add(lids);
  const browC = elder ? hair : mixHex(skinD, '#5a3322', 0.45);
  const browL = fm('hemiS', browC, -ex, 0.09, 0.0, 0.05, 0.011, 0.01), browR = fm('hemiS', browC, ex, 0.09, 0.0, 0.05, 0.011, 0.01);
  browL.name = 'browL'; browR.name = 'browR'; browL.visible = browR.visible = eyeV === 2 || elder; head.add(browL, browR);
  // mouths: a clear smile (arc), open laughing smile (D), or a cat smile
  const MY = -0.165, ink = '#6a2a3a';
  const mouthSmile = new THREE.Group(); mouthSmile.name = 'mouthSmile';
  { const m = [];
    if (mouthV === 0) m.push(fm('arcB', ink, 0, MY + 0.05, 0.002, 0.07, 0.07, 0.02, Math.PI));
    else if (mouthV === 1) m.push(fm('hemiE', '#9a2a40', 0, MY, 0.002, 0.075, 0.062, 0.02), fm('hemiS', '#ff8a98', 0, MY - 0.028, 0.006, 0.04, 0.02, 0.012), fm('hemiE', skin, 0, MY + 0.045, 0.012, 0.095, 0.045, 0.02));
    else m.push(fm('arcB', ink, -0.045, MY + 0.035, 0.002, 0.045, 0.045, 0.02, Math.PI), fm('arcB', ink, 0.045, MY + 0.035, 0.002, 0.045, 0.045, 0.02, Math.PI));
    for (const x of bake(m).children) mouthSmile.add(x); }
  const mouthFlat = new THREE.Group(); mouthFlat.name = 'mouthFlat'; for (const x of bake([fm('hemi', ink, 0, MY + 0.01, 0.002, 0.036, 0.008, 0.01, 0.15)]).children) mouthFlat.add(x);
  const mouthO = new THREE.Group(); mouthO.name = 'mouthO'; for (const x of bake([fm('hemi', '#9a2a40', 0, MY, 0.003, 0.03, 0.037, 0.014), fm('hemi', '#ff8a98', 0, MY - 0.014, 0.007, 0.016, 0.009, 0.008)]).children) mouthO.add(x);
  mouthFlat.visible = mouthO.visible = false; head.add(mouthSmile, mouthFlat, mouthO);
  const sweat = new THREE.Group(); sweat.name = 'sweat'; for (const x of bake([mk('sphS', '#8fd8ff', 0.31, 0.18, 0.13, 0.045, 0.055, 0.045), mk('cone6', '#8fd8ff', 0.31, 0.21, 0.13, 0.038, 0.065, 0.038)]).children) sweat.add(x);
  sweat.visible = false; head.add(sweat);
  if (elder) head.position.z = 0.03;

  // ----- carried sack and sleep bubbles (hidden until their pose)
  const carry = new THREE.Group(); carry.name = 'carry';
  for (const x of bake([mk('sph', '#f0c060', 0, 0.35, 0.32, 0.18, 0.16, 0.16), mk('sphS', '#d89a5e', 0, 0.51, 0.32, 0.055, 0.045, 0.055), mk('dot', '#fbe6bc', 0.05, 0.4, 0.43, 0.055, 0.055, 0.03)]).children) carry.add(x);
  carry.visible = false; body.add(carry);
  const zzz = new THREE.Group(); zzz.name = 'zzz';
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh((colored('dot', '#ffffff'), geoCache.get('dot')), soft('#ffffff', { emissive: '#bcd6ff', emissiveIntensity: 0.5 })); m.castShadow = false; zzz.add(m); }
  zzz.visible = false; body.add(zzz);

  // ----- triangle budget: bake torso and head, dropping optional trinkets (accessories, fringe) if the model would exceed it
  const cost = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  let total = allTris(g) + [...t, ...hs].reduce((a, m) => a + cost(m), 0);
  const optional = [...t, ...hs].filter((m) => m.userData.opt).sort((a, b) => cost(b) - cost(a));
  for (const m of optional) { if (total <= BUDGET) break; total -= cost(m); m.userData.drop = true; }
  for (const m of bake(t.filter((m) => !m.userData.drop), 'torso').children) { m.name = ''; body.add(m); }
  for (const m of bake(hs.filter((m) => !m.userData.drop), 'headStatic').children) { m.name = ''; head.add(m); }

  // ----- age and build proportions
  const bs = (build === 'tall' ? 1.1 : build === 'small' ? 0.9 : 1) * 1.07; // a touch bigger overall: faces stay readable from the game camera
  if (child) { g.scale.setScalar(0.8); head.scale.setScalar(1.18); }
  else if (elder) g.scale.setScalar(0.95 * bs); else g.scale.setScalar(bs);
  const lean = elder ? 0.16 : 0;
  body.rotation.x = lean;

  const rig = { body, head, eyes, lids, browL, browR, mouthSmile, mouthFlat, mouthO, sweat, armR: arm, armL, legL, legR, tool: toolG, carry, zzz, toolKind, lean, armZ: 0.14, eyeBase: 1, mood: 'happy', eyeV, hasTool: toolKind !== 'none' && toolKind !== 'cane', work: WORK[toolKind] };
  RIGS.set(g, rig); g.userData.rig = rig;
  g.userData.look = { gear, style, acc, age, tool: toolKind, eyeV, mouthV, skin: skinIdx, hair: hairE[2], hairColor: hair, outfit: outfitI % OUTFITS.length, outfitColor: outfit, build };
  setMood(g, 'happy');
  return g;
}
function o_(c) { return dark(c, 0.15); }

function rigOf(g) {
  let r = RIGS.get(g); if (r) return r;
  const body = g.getObjectByName('body'); if (!body) return null; const head = g.getObjectByName('head');
  r = { body, head, eyes: g.getObjectByName('eyes'), lids: g.getObjectByName('lids'), browL: g.getObjectByName('browL'), browR: g.getObjectByName('browR'), mouthSmile: g.getObjectByName('mouthSmile'), mouthFlat: g.getObjectByName('mouthFlat'), mouthO: g.getObjectByName('mouthO'), sweat: g.getObjectByName('sweat'),
    armR: g.getObjectByName('arm'), armL: g.getObjectByName('armL'), legL: g.getObjectByName('legL'), legR: g.getObjectByName('legR'), tool: g.getObjectByName('tool'), carry: g.getObjectByName('carry'), zzz: g.getObjectByName('zzz'), toolKind: 'none', lean: 0, armZ: 0.14, eyeBase: 1, mood: 'happy', eyeV: 0, hasTool: !!g.getObjectByName('tool'), work: WORK.none };
  RIGS.set(g, r); return r;
}

/** setMood(group, 'happy'|'tired'|'hungry'|'busy'): swaps cheap named face meshes (visibility) and stores the eye openness. */
export function setMood(g, mood = 'happy') {
  const r = rigOf(g); if (!r || !r.eyes) return; r.mood = mood;
  const tired = mood === 'tired', hungry = mood === 'hungry', busy = mood === 'busy';
  r.lids.visible = tired; r.mouthFlat.visible = tired; r.mouthO.visible = hungry; r.mouthSmile.visible = !tired && !hungry; r.sweat.visible = hungry;
  r.eyeBase = tired ? 0.7 : hungry ? 1.1 : busy ? 0.92 : 1;
  const brows = (busy || hungry) || r.eyeV === 2 || (g.userData.look && g.userData.look.age === 'elder');
  r.browL.visible = r.browR.visible = brows && !tired;
  r.browR.rotation.z = busy ? 0.4 : hungry ? -0.4 : -0.05; r.browL.rotation.z = busy ? -0.4 : hungry ? 0.4 : 0.05;
}

/**
 * setPose(group, pose, t, phase): 'idle' | 'walk' | 'work' | 'carry' | 'cheer' | 'sleep'. t in seconds, phase = per-villager offset.
 * Pure number writes, no allocation. Drives body, head, armR/armL, legL/legR, eyes (blink), carry/tool/zzz visibility.
 * Everything bounces: walking is a hop (stretch in the air, squash on contact), idle breathes and hops now and then.
 */
export function setPose(g, pose = 'idle', t = 0, phase = 0) {
  const r = rigOf(g); if (!r) return;
  let by = 0, brx = r.lean, brz = 0, sx = 1, sy = 1, hx = 0, hy = 0, hz = 0, aR = 0, aL = 0, azR = r.armZ, azL = -r.armZ, lL = 0, lR = 0, eye = 1, showCarry = false, showTool = true, showZ = false;
  switch (pose) {
    case 'walk': {
      const ph = t * 10 + phase, s = Math.sin(ph), c = Math.abs(Math.cos(ph)), k = r.hasTool ? 0.45 : 0.85;
      lL = s * 0.8; lR = -s * 0.8; aR = lL * k; aL = lR * k; by = Math.abs(s) * 0.09; brz = s * 0.09; hz = -s * 0.07; sy = 0.94 + (1 - c) * 0.1; sx = 1.05 - (1 - c) * 0.07; brx += 0.07; hx = Math.abs(s) * 0.05; break;
    }
    case 'work': {
      const w = r.work, s = Math.sin(t * w.s + phase), pos = Math.max(0, s);
      aR = w.c + s * w.a; aL = aR * 0.7 - 0.2; azL = -r.armZ - 0.1; lL = -0.12; lR = 0.12; brx += 0.08 + pos * 0.12; by = pos * 0.025; sy = 1 - pos * 0.06 + (1 - pos) * 0.015; sx = 1 + pos * 0.04; hx = 0.06 + pos * 0.09; hz = s * 0.04;
      if (r.toolKind === 'scroll') { hx = 0.12; hy = Math.sin(t * 1.5 + phase) * 0.12; }
      break;
    }
    case 'carry': {
      const ph = t * 8 + phase, s = Math.sin(ph), c = Math.abs(Math.cos(ph));
      lL = s * 0.6; lR = -s * 0.6; aR = aL = -1.05; azR = -0.42; azL = 0.42; by = Math.abs(s) * 0.07; sy = 0.95 + (1 - c) * 0.08; sx = 1.04 - (1 - c) * 0.06; brz = s * 0.06; brx -= 0.07; hz = -s * 0.05; showCarry = true; showTool = false; break;
    }
    case 'cheer': {
      const q = t * 6 + phase, j = Math.abs(Math.sin(q)), w = Math.sin(t * 12 + phase);
      by = j * 0.24; aR = -2.75 + w * 0.3; aL = -2.75 - w * 0.3; azR = 0.5; azL = -0.5; lL = -0.4 * j; lR = 0.35 * j; hz = Math.sin(q * 0.5) * 0.12; sy = 0.88 + j * 0.2; sx = 1.09 - j * 0.11; brx -= 0.05; hx = -0.1; break;
    }
    case 'sleep': {
      const br = Math.sin(t * 1.4 + phase); sy = 1 + br * 0.03; sx = 1 - br * 0.015; brx += 0.2; hx = 0.38; hz = 0.14; aR = 0.08; aL = 0.08; eye = 0.06; showZ = true; lL = 0.2; lR = -0.2; break;
    }
    default: { // idle: breathing squash, a little sway, and a happy hop every few seconds
      const br = Math.sin(t * 2.2 + phase); sy = 1 + br * 0.028; sx = 1 - br * 0.013; hz = Math.sin(t * 0.9 + phase) * 0.05; hy = Math.sin(t * 0.55 + phase * 1.7) * 0.2; aR = br * 0.07; aL = -br * 0.07; brz = Math.sin(t * 0.9 + phase) * 0.025;
      const u = (t + phase * 0.8) % 3.6;
      if (u < 0.4) { const k = Math.sin(u / 0.4 * Math.PI); by = k * 0.07; sy += k * 0.05; sx -= k * 0.03; aR -= k * 0.35; aL += k * 0.35; } else if (u < 0.55) { const k = Math.sin((u - 0.4) / 0.15 * Math.PI); sy -= k * 0.06; sx += k * 0.04; }
      if (r.toolKind === 'basket' || r.toolKind === 'scroll') aR -= 0.1;
    }
  }
  const b = r.body; b.position.y = by; b.rotation.set(brx, 0, brz); b.scale.set(sx, sy, sx);
  r.head.rotation.set(hx, hy, hz); r.armR.rotation.set(aR, 0, azR); r.armL.rotation.set(aL, 0, azL); r.legL.rotation.x = lL; r.legR.rotation.x = lR;
  // blink (every ~3.4 s, 0.14 s long), closed in sleep
  let e = eye === 1 ? r.eyeBase : eye;
  if (eye === 1) { const u = (t + phase * 0.61) % 3.4; if (u < 0.14) e *= 1 - 0.92 * Math.sin(u / 0.14 * Math.PI); }
  r.eyes.scale.y = e; if (r.lids.visible) r.lids.scale.y = 1 + (1 - e) * 0.3;
  r.carry.visible = showCarry; if (r.tool) r.tool.visible = showTool; r.zzz.visible = showZ;
  if (showZ) { const zk = r.zzz.children; for (let i = 0; i < 2; i++) { const k = (t * 0.45 + i / 2 + phase) % 1, m = zk[i]; m.position.set(0.22 + k * 0.22, 1.0 + k * 0.4, 0.05); const sc = 0.025 + 0.05 * Math.sin(k * Math.PI); m.scale.set(sc, sc, sc); } }
}

/** a varied villager: random profession, age mix, owner colour (only an accent now; the outfit colour is picked per villager). */
export function randomVillager(seed = 1, color) {
  const r = rng(seed * 2654435761 + 7);
  const prof = PROFESSIONS[Math.floor(r() * PROFESSIONS.length)];
  const a = r(), age = a < 0.13 ? 'child' : a < 0.22 ? 'elder' : 'adult';
  const col = color || P.outfit[Math.floor(r() * P.outfit.length)];
  const g = villagerModel(col, Math.floor(r() * 100), { tool: prof.tool, seed, age });
  g.userData.profession = prof.id; return g;
}

function allTris(g) { let n = 0; g.traverse((o) => { if (o.isMesh) { const gg = o.geometry; n += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } }); return n; }
/** triangle count of a model (for budgets). */
export function triangles(g) {
  let n = 0; g.traverseVisible((o) => { if (o.isMesh) { const gg = o.geometry; n += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } }); return n;
}
