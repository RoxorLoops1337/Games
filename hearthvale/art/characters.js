// Hearthvale villagers: chunky, toy-like, all procedural, ~1.0 unit tall, <= 1800 triangles.
//
// WHAT RESEARCH TAUGHT ME (web search + craft notes), applied below:
//  1. Baby schema (Lorenz): big round head, high forehead, big eyes set LOW on the face and WIDE apart, chubby cheeks, short limbs.
//     So: head is ~55% of body height, eyes sit below the head's equator, a full eye-width apart, cheeks are blush discs.
//  2. Chibi ratios run 1:2 to 1:4 (head : body). Mascot studies say expression and proportion drive cuteness most. I use ~1:1.8 with no neck.
//  3. Build bodies from bean/pear shapes, never boxes: torso is an egg narrower than the head, limbs are tapered stubs with mitten hands.
//  4. Eyes carry the face: glossy dark ellipsoids with ONE big highlight and a tiny second one; nose is a dinky dot; mouth is a tiny arc.
//  5. Silhouette first: a profession must read as a solid shape at 25 px, so it lives in the hat/tool (straw brim, chef puff, pointy hat,
//     long hoe handle) rather than in face or textile detail. Only 1 or 2 bold shapes per profession.
//  6. Value before hue: faces are the lightest, most contrasty spot (dark eyes on light skin); darker boots and trousers ground the figure;
//     torso and legs never share a colour so the silhouette does not blur.
//  7. 60-30-10 colour rule: the owner's colour is the big shirt/overall shape, a warm neutral (trousers, hair) is the second, and the
//     profession accent (apron, belt, band) plus gold buttons are the small saturated accents. Shadows stay tinted, never black.
//  8. Squash and stretch gives softness: breathing squashes the body, landings of cheer squash, walking bobs and sways.
//  9. Low-poly craft: smooth-shaded low-segment ellipsoids (10x7) look like soft vinyl toys; spend polygons on the head (silhouette
//     and eyes), not on hands and boots. Merge everything static into one vertex-coloured mesh per rigid part.
// 10. Mood is face + posture: tired = heavy lids and flat mouth, hungry = worried brows, small "o" mouth and a sweat drop, busy = brows
//     down and a determined smirk. Swapping cheap named meshes beats morph targets on a phone.
//
// Contract (same as the old villagerModel): group children `body` (everything that bobs, head included) and `arm` (right arm, pivot at the
// shoulder, rotation.x swings the tool). Extra named children for setPose: legL, legR, armL (left arm), plus `head`, `eyes`.
import * as THREE from 'three';
import { soft, gloss, groundShadow, mergeStatic, rng, roundedBoxGeo } from './artkit.js';
import { P } from './palette.js';

// ---------------------------------------------------------------- small helpers
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
const light = (c, t = 0.3) => mixHex(c, '#ffffff', t);
const dark = (c, t = 0.25) => mixHex(c, '#3b2a4a', t); // shadows lean violet-blue, never black

// ---------------------------------------------------------------- geometry library (cached, coloured by vertex colour)
const HEMI = (w, h) => () => new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2); // flat back, dome towards +Z (for face decals)
const GEOS = {
  dot: () => new THREE.SphereGeometry(1, 5, 4),
  sphS: () => new THREE.SphereGeometry(1, 6, 4),
  sph: () => new THREE.SphereGeometry(1, 7, 5),
  sphT: () => new THREE.SphereGeometry(1, 8, 6),
  sphM: () => new THREE.SphereGeometry(1, 10, 7),
  head: () => new THREE.SphereGeometry(1, 16, 10),
  hemi: HEMI(8, 3), hemiM: HEMI(10, 3), hemiS: HEMI(6, 2), hemiE: HEMI(8, 2),
  capA: () => new THREE.SphereGeometry(1, 16, 3, 0, Math.PI * 2, 0, Math.PI * 0.3),
  capB: () => new THREE.SphereGeometry(1, 16, 4, 0, Math.PI * 2, 0, Math.PI * 0.4),
  capC: () => new THREE.SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI * 0.5),
  cone6: () => new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0),
  cone8: () => new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  cyl8: () => new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl12: () => new THREE.CylinderGeometry(1, 1, 1, 9),
  box: () => roundedBoxGeo(1, 1, 1, 0.22, 1).clone(),
  bx: () => new THREE.BoxGeometry(1, 1, 1),
  tor: () => new THREE.TorusGeometry(1, 0.26, 4, 9),
  torS: () => new THREE.TorusGeometry(1, 0.2, 3, 8),
  arcT: () => new THREE.TorusGeometry(1, 0.2, 3, 5, Math.PI),
};
const geoCache = new Map(), colGeoCache = new Map();
function colored(kind, color) {
  const k = kind + color; let g = colGeoCache.get(k);
  if (!g) {
    let b = geoCache.get(kind); if (!b) { b = GEOS[kind](); geoCache.set(kind, b); }
    g = b.clone(); const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); colGeoCache.set(k, g);
  }
  return g;
}
const vcMat = soft('#ffffff', { vertexColors: true });
const eyeMat = gloss('#ffffff', { vertexColors: true, roughness: 0.18 });
const hiMat = soft('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.85 });
const goldMat = gloss('#ffffff', { vertexColors: true, roughness: 0.35 });

/** unit mesh of `kind`, vertex-coloured, scaled (sx,sy,sz), euler (rx,ry,rz) in YXZ order. */
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
const HX = 0.30, HY = 0.265, HZ = 0.28, HEAD_Y = 0.72;
/** place a unit mesh on the head surface at (x,y), pushed `off` along the normal, facing outwards. */
function fm(kind, col, x, y, off, sx, sy, sz, spin = 0, mat = vcMat) {
  const zf = HZ * Math.sqrt(Math.max(0.0001, 1 - (x / HX) ** 2 - (y / HY) ** 2));
  let nx = x / (HX * HX), ny = y / (HY * HY), nz = zf / (HZ * HZ); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
  return mk(kind, col, x + nx * off, y + ny * off, zf + nz * off, sx, sy, sz, -Math.asin(ny), Math.atan2(nx, nz), spin, mat);
}

// ---------------------------------------------------------------- data: professions
export const PROFESSIONS = [
  { id: 'woodcutter', tool: 'axe', accent: '#9a6a3c', style: 'tunic', hats: ['cap', 'bandana', 'beanie', 'messy'] },
  { id: 'miner', tool: 'pick', accent: '#7a7f95', style: 'overalls', hats: ['hard', 'bandana', 'beanie'] },
  { id: 'farmer', tool: 'hoe', accent: '#e3b857', style: 'overalls', hats: ['straw', 'straw', 'bandana', 'pigtails'] },
  { id: 'builder', tool: 'hammer', accent: '#e8843c', style: 'apron', hats: ['cap', 'hard', 'bandana'] },
  { id: 'cook', tool: 'ladle', accent: '#fff4dc', style: 'apron', hats: ['chef', 'chef', 'bun'] },
  { id: 'scholar', tool: 'scroll', accent: '#8e6bc4', style: 'cloak', hats: ['elf', 'bun', 'long', 'crown'] },
  { id: 'gatherer', tool: 'basket', accent: '#7fd05a', style: 'tunic', hats: ['flowers', 'pigtails', 'hood', 'straw'] },
  { id: 'villager', tool: 'none', accent: '#d9a566', style: 'tunic', hats: null },
];
const TOOLS = ['none', 'axe', 'pick', 'hoe', 'hammer', 'ladle', 'scroll', 'basket'];
const STYLES = ['apron', 'overalls', 'tunic', 'cloak'];
const GEARS = ['short', 'messy', 'bun', 'pigtails', 'long', 'straw', 'cap', 'hood', 'bandana', 'chef', 'flowers', 'crown', 'beanie', 'elf', 'hard'];
const PANTS = ['#8a6a4a', '#5d6a8c', '#7b5a45', '#6d5a7a', '#5a7a68'];
const IRIS = ['#7a4a2e', '#3f6a8c', '#3e7a50', '#6a4a8a'];

// ---------------------------------------------------------------- hair / hat builders (head-local coordinates, y up, z = face)
const capOn = (kind, col, s = 1.04, tilt = -0.3, dy = 0, dz = 0, sy = 1) => mk(kind, col, 0, dy, dz, HX * s, HY * s * sy, HZ * s, tilt);
function fringe(c, hair) {
  for (const [x, y, r] of [[-0.15, 0.14, 0.068], [0, 0.165, 0.07], [0.15, 0.14, 0.068]]) { const f = fm('dot', hair, x, y, 0.0, r, r * 0.8, r * 0.7); f.userData.opt = 1; c.push(f); }
}
const GEAR = {
  short(c, o) { c.push(capOn('capB', o.hair, 1.045, -0.34)); fringe(c, o.hair); },
  messy(c, o) {
    c.push(capOn('capB', o.hair, 1.045, -0.34)); fringe(c, o.hair);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.4, rr = 0.15; c.push(mk('cone6', o.hair, Math.sin(a) * rr, 0.22, Math.cos(a) * rr * 0.9 - 0.02, 0.07, 0.15, 0.07, Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7)); }
    c.push(mk('cone6', o.hair, 0.04, 0.26, 0.1, 0.045, 0.2, 0.045, 0.5, 0, -0.5)); // ahoge
  },
  bun(c, o) { c.push(capOn('capB', o.hair, 1.045, -0.34)); fringe(c, o.hair); c.push(mk('sph', o.hair, 0, 0.3, -0.1, 0.1), mk('tor', o.ribbon, 0, 0.24, -0.1, 0.075, 0.075, 0.06, Math.PI / 2)); },
  pigtails(c, o) {
    c.push(capOn('capB', o.hair, 1.045, -0.3)); fringe(c, o.hair);
    for (const s of [-1, 1]) c.push(mk('sph', o.hair, s * 0.31, -0.08, -0.07, 0.075, 0.13, 0.075, 0, 0, s * 0.35), mk('sph', o.ribbon, s * 0.285, 0.04, -0.05, 0.05, 0.04, 0.05));
  },
  long(c, o) { c.push(capOn('capB', o.hair, 1.045, -0.3), mk('sph', o.hair, 0, -0.07, -0.13, 0.3, 0.3, 0.17)); fringe(c, o.hair); c.push(mk('sph', o.ribbon, 0.22, 0.15, 0.04, 0.045, 0.045, 0.035)); },
  straw(c, o) {
    c.push(capOn('capA', o.hair, 1.04, -0.25, -0.02)); 
    const straw = '#f2d072';
    c.push(mk('sph', straw, 0, 0.115, 0.005, 0.5, 0.05, 0.5, -0.08), mk('capA', straw, 0, 0.1, -0.005, 0.33, 0.27, 0.32, -0.08), mk('tor', o.color, 0, 0.145, -0.005, 0.315, 0.315, 0.12, Math.PI / 2 - 0.08));
  },
  cap(c, o) {
    c.push(capOn('capB', o.hair, 1.04, -0.3, -0.01)); 
    c.push(mk('capA', o.cap, 0, 0.03, -0.01, HX * 1.07, HY * 1.0, HZ * 1.08, -0.25), mk('sph', dark(o.cap, 0.15), 0, 0.105, 0.265, 0.19, 0.03, 0.14, 0.15), mk('sph', o.accent, 0, 0.275, -0.02, 0.03));
  },
  hood(c, o) {
    c.push(mk('sph', o.cloth, 0, 0.03, -0.1, HX * 1.09, HY * 1.07, 0.27), mk('tor', light(o.cloth, 0.2), 0, -0.01, 0.17, 0.215, 0.235, 0.09, 0.05), mk('cone6', o.cloth, 0, 0.24, -0.2, 0.09, 0.2, 0.09, -0.9));
    c.push(fm('dot', o.hair, -0.1, 0.17, -0.01, 0.07, 0.04, 0.04), fm('dot', o.hair, 0.1, 0.17, -0.01, 0.07, 0.04, 0.04));
  },
  bandana(c, o) {
    c.push(capOn('capB', o.hair, 1.04, -0.32)); 
    c.push(mk('capA', o.band, 0, 0.0, -0.01, HX * 1.075, HY * 1.07, HZ * 1.075, -0.42));
    for (const [x, z] of [[-0.12, 0.11], [0.12, 0.11], [0, 0.17], [0, -0.14]]) c.push(mk('sph', '#fff4dc', x, 0.235, z, 0.025));
    c.push(mk('sph', o.band, 0, 0.1, -0.29, 0.06, 0.06, 0.05), mk('cone6', o.band, -0.05, 0.03, -0.3, 0.04, 0.12, 0.02, 0, 0, 0.5), mk('cone6', o.band, 0.05, 0.03, -0.3, 0.04, 0.12, 0.02, 0, 0, -0.5));
  },
  chef(c, o) {
    c.push(capOn('capB', o.hair, 1.04, -0.3), mk('cyl12', '#ffffff', 0, 0.16, -0.01, 0.26, 0.09, 0.25));
    c.push(mk('sph', '#ffffff', 0, 0.37, -0.01, 0.2, 0.15, 0.2), mk('sphS', '#fffaf0', -0.14, 0.3, 0.0, 0.12), mk('sphS', '#fffaf0', 0.14, 0.3, 0.0, 0.12), mk('sphS', '#fffaf0', 0, 0.31, -0.13, 0.12));
  },
  flowers(c, o) {
    c.push(capOn('capB', o.hair, 1.045, -0.34)); fringe(c, o.hair);
    const cols = ['#ff8fb4', '#fff4dc', '#ffd24a', '#c7a8ff', '#ff8fb4', '#fff4dc'];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + 0.6, pol = 0.95, x = HX * Math.sin(pol) * Math.sin(a) * 1.05, y = HY * Math.cos(pol) * 1.05 + 0.005, z = HZ * Math.sin(pol) * Math.cos(a) * 1.05;
      c.push(mk('sphS', cols[i], x, y, z, 0.062, 0.055, 0.062));
    }
  },
  crown(c, o) {
    c.push(capOn('capB', o.hair, 1.045, -0.34)); fringe(c, o.hair);
    const g = '#ffd24a'; c.push(mk('cyl12', g, 0, 0.2, -0.02, 0.19, 0.05, 0.18, -0.2));
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; c.push(mk('cone6', g, Math.sin(a) * 0.18, 0.28 + Math.cos(a) * 0.0, Math.cos(a) * 0.17 - 0.02, 0.05, 0.1, 0.05)); }
    c.push(mk('sph', '#e8564a', 0, 0.225, 0.17, 0.035));
  },
  beanie(c, o) {
    c.push(capOn('capB', o.hair, 1.04, -0.3)); 
    c.push(mk('capB', o.cloth, 0, 0.0, -0.01, HX * 1.08, HY * 1.1, HZ * 1.08, -0.4), mk('tor', light(o.cloth, 0.35), 0, 0.075, 0.015, 0.285, 0.285, 0.13, Math.PI / 2 - 0.4), mk('sph', '#fff4dc', 0, 0.3, -0.07, 0.07));
  },
  elf(c, o) {
    c.push(capOn('capB', o.hair, 1.04, -0.3)); 
    c.push(mk('cone8', o.cloth, 0, 0.07, -0.03, 0.29, 0.5, 0.28, -0.12), mk('tor', light(o.cloth, 0.3), 0, 0.09, -0.02, 0.285, 0.285, 0.1, Math.PI / 2), mk('sph', '#ffd24a', 0, 0.55, -0.1, 0.045));
  },
  hard(c, o) {
    const y = '#f2c230'; c.push(capOn('capB', o.hair, 1.035, -0.28)); 
    c.push(mk('capA', y, 0, 0.03, -0.01, HX * 1.09, HY * 1.04, HZ * 1.1, -0.2), mk('sph', y, 0, 0.1, 0.0, 0.34, 0.03, 0.33, -0.05), mk('bx', dark(y, 0.2), 0, 0.27, -0.01, 0.045, 0.02, 0.27), mk('sph', '#fff3b0', 0, 0.2, 0.25, 0.05, 0.05, 0.03));
  },
};
const HAT_COVERS_TOP = new Set(['straw', 'chef', 'elf', 'hood']);

// ---------------------------------------------------------------- tools (origin = hand, +Y = tool axis, +Z = the cutting side)
const WOOD = '#c58a52', WOODD = '#8a5a3a', STEEL = '#d8dbe3', STEELD = '#8f95a8';
function buildTool(kind, o) {
  const c = [];
  switch (kind) {
    case 'axe': c.push(mk('cyl8', WOOD, 0, 0.17, 0, 0.022, 0.54, 0.022), mk('bx', STEEL, 0, 0.36, 0.06, 0.03, 0.15, 0.17), mk('bx', STEELD, 0, 0.37, -0.03, 0.045, 0.1, 0.06)); break;
    case 'pick': c.push(mk('cyl8', WOOD, 0, 0.17, 0, 0.022, 0.54, 0.022), mk('bx', STEELD, 0, 0.4, 0, 0.04, 0.05, 0.16), mk('cone6', STEEL, 0, 0.4, 0.2, 0.035, 0.16, 0.035, Math.PI / 2 - 0.35), mk('cone6', STEEL, 0, 0.4, -0.2, 0.035, 0.16, 0.035, -Math.PI / 2 + 0.35)); break;
    case 'hoe': c.push(mk('cyl8', WOOD, 0, 0.22, 0, 0.022, 0.66, 0.022), mk('bx', STEEL, 0, 0.5, 0.075, 0.1, 0.02, 0.16, 0.6)); break;
    case 'hammer': c.push(mk('cyl8', WOOD, 0, 0.14, 0, 0.024, 0.46, 0.024), mk('box', '#a9a39a', 0, 0.35, 0, 0.2, 0.1, 0.1), mk('box', STEELD, 0.09, 0.35, 0, 0.04, 0.115, 0.115)); break;
    case 'ladle': c.push(mk('cyl8', WOOD, 0, 0.17, 0, 0.018, 0.5, 0.018), mk('sph', STEELD, 0, 0.45, 0.03, 0.07, 0.04, 0.07, 0.4), mk('sph', STEEL, 0, 0.455, 0.03, 0.055, 0.03, 0.055, 0.4)); break;
    case 'scroll': c.push(mk('cyl12', '#fff1cf', 0, 0.12, 0, 0.05, 0.24, 0.05), mk('sph', '#c58a52', 0, 0.245, 0, 0.045, 0.03, 0.045), mk('sph', '#c58a52', 0, -0.005, 0, 0.045, 0.03, 0.045), mk('tor', '#e8564a', 0, 0.12, 0, 0.055, 0.055, 0.1, Math.PI / 2)); break;
    case 'basket': {
      c.push(mk('arcT', WOODD, 0, 0.02, 0, 0.12, 0.12, 0.09, 0, Math.PI / 2, 0));
      c.push(mk('sph', '#d9a566', 0, -0.1, 0, 0.15, 0.1, 0.15), mk('sphS', '#b9824a', 0, -0.035, 0, 0.14, 0.03, 0.14));
      c.push(mk('sph', '#e8564a', -0.04, -0.02, 0.03, 0.055), mk('sph', '#ffb02e', 0.05, -0.02, -0.02, 0.055)); break;
    }
    case 'cane': c.push(mk('cyl8', WOODD, 0, 0.1, 0, 0.018, 0.4, 0.018), mk('sph', WOODD, 0, 0.31, 0.02, 0.04)); break;
  }
  const g = bake(c, 'tool'); return g;
}
const TOOL_ALPHA = { axe: 0.8, pick: 0.8, hoe: 0.7, hammer: 0.7, ladle: 0.5, scroll: 0.3, basket: 0, cane: 0.1, none: 0 };
const WORK = { axe: { c: -0.5, a: 1.4, s: 9 }, pick: { c: -0.5, a: 1.4, s: 8 }, hoe: { c: -0.4, a: 1.1, s: 7 }, hammer: { c: -0.3, a: 1.0, s: 12 }, ladle: { c: -0.9, a: 0.22, s: 6 }, scroll: { c: -1.15, a: 0.08, s: 2 }, basket: { c: -0.5, a: 0.45, s: 5 }, cane: { c: -0.5, a: 0.8, s: 8 }, none: { c: -0.5, a: 0.8, s: 8 } };

// ---------------------------------------------------------------- the villager
const RIGS = new WeakMap();
const BUDGET = 1620; // leaves headroom for the mood swaps (sweat drop, lids) under the 1800 cap

/**
 * villagerModel(color, hat, opts) -> THREE.Group
 * color: outfit accent (owner colour). hat: integer seed 0..99 (skin, hair, headgear, face, accessory).
 * opts: { tool: 'none'|'axe'|'pick'|'hoe'|'hammer'|'ladle'|'scroll'|'basket', seed, age: 'adult'|'child'|'elder', style, gear }
 */
export function villagerModel(color = '#e8564a', hat = 0, opts = {}) {
  const tool = TOOLS.includes(opts.tool) ? opts.tool : 'none', age = opts.age || 'adult';
  const prof = PROFESSIONS.find((p) => p.tool === tool) || PROFESSIONS[7];
  const rnd = rng(((hat | 0) + 1) * 7919 + (opts.seed | 0) * 104729 + 13); const pick = (a) => a[Math.floor(rnd() * a.length)];
  const child = age === 'child', elder = age === 'elder';
  // appearance picks
  const skinW = rnd(), skin = mixHex(P.skin[skinW < 0.3 ? 0 : skinW < 0.58 ? 1 : skinW < 0.8 ? 2 : skinW < 0.92 ? 3 : 4], '#ffc9a0', 0.14), skinD = mixHex(skin, '#a0503a', 0.3), blush = mixHex(skin, '#ff5a78', 0.5);
  let hair = pick(P.hair); if (elder) hair = pick(['#e8e0d0', '#d6d6dc', '#b9b4aa']);
  const style = opts.style || (tool !== 'none' ? prof.style : pick(STYLES));
  let gear = opts.gear; if (!gear) { const pool = prof.hats && rnd() < 0.75 ? prof.hats : GEARS; gear = pick(pool); if (elder && ['pigtails', 'crown', 'flowers'].includes(gear)) gear = pick(['short', 'cap', 'bun', 'bandana']); if (child && gear === 'crown' && rnd() < 0.5) gear = 'short'; }
  const eyeV = Math.floor(rnd() * 3), mouthV = Math.floor(rnd() * 3), iris = pick(IRIS), pants = pick(PANTS);
  const acc = elder ? pick(['mustache', 'glasses', 'beard', 'mustache']) : pick(['none', 'none', 'scarf', 'glasses', 'freckles', 'satchel', 'scarf', 'freckles']);
  const accent = prof.accent, shirt = style === 'overalls' ? light(color, 0.72) : color;
  const cloth = dark(mixHex(color, '#ffffff', 0.05), 0.12);
  const gearO = { hair, color, cloth: style === 'cloak' ? color : mixHex(color, '#ffffff', 0.12), ribbon: pick(['#ff8fb4', '#e8564a', '#4a90e0', '#ffd24a']), cap: pick(['#5d6a8c', '#8a5a3a', '#6b8a5a', '#a65b4a']), band: pick(['#e8564a', '#4a90e0', '#f2b632']), accent };

  const g = new THREE.Group(); g.name = 'villager';
  const body = new THREE.Group(); body.name = 'body'; g.add(body);
  g.add(groundShadow(0.36, 0.3, 1, 0.9));

  // ----- torso (static, vertex-coloured, merged)
  const t = []; const bootC = '#6b4328';
  t.push(mk('sphT', shirt, 0, 0.31, 0, 0.245, 0.2, 0.22));
  if (style === 'apron') {
    t.push(mk('sph', accent, 0, 0.27, 0.105, 0.19, 0.17, 0.15), mk('sph', accent, 0, 0.42, 0.14, 0.105, 0.075, 0.07),
      mk('bx', light(accent, 0.25), 0, 0.2, 0.215, 0.1, 0.06, 0.02), mk('cyl8', accent, -0.1, 0.46, 0.04, 0.018, 0.1, 0.018, 0.0, 0, -0.5), mk('cyl8', accent, 0.1, 0.46, 0.04, 0.018, 0.1, 0.018, 0.0, 0, 0.5),
      mk('sph', dark(accent, 0.2), 0.22, 0.28, -0.02, 0.04, 0.05, 0.05));
  } else if (style === 'overalls') {
    t.push(mk('sph', color, 0, 0.26, 0.04, 0.25, 0.155, 0.205), mk('sph', color, 0, 0.41, 0.145, 0.115, 0.08, 0.07), mk('bx', color, -0.1, 0.46, 0.06, 0.04, 0.12, 0.05, 0, 0, 0.12), mk('bx', color, 0.1, 0.46, 0.06, 0.04, 0.12, 0.05, 0, 0, -0.12),
      mk('sph', '#ffd24a', -0.1, 0.42, 0.19, 0.022), mk('sph', '#ffd24a', 0.1, 0.42, 0.19, 0.022), mk('bx', accent, 0.0, 0.25, 0.205, 0.12, 0.08, 0.025));
  } else if (style === 'tunic') {
    t.push(mk('cyl12', accent, 0, 0.255, 0, 0.255, 0.04, 0.228), mk('bx', '#ffd24a', 0, 0.255, 0.226, 0.06, 0.05, 0.02), mk('cyl12', dark(shirt, 0.1), 0, 0.165, 0, 0.255, 0.075, 0.225),
      mk('sph', '#ffd24a', 0, 0.39, 0.2, 0.022), mk('sph', '#ffd24a', 0, 0.35, 0.215, 0.022));
  } else { // cloak
    t.push(mk('sphS', dark(color, 0.2), 0, 0.27, -0.09, 0.27, 0.23, 0.11), mk('cone8', dark(color, 0.12), 0, 0.02, -0.12, 0.25, 0.3, 0.12, Math.PI, 0, 0), mk('capA', color, 0, 0.405, 0.0, 0.285, 0.2, 0.25, 0.04), mk('sph', accent, 0, 0.255, 0.215, 0.1, 0.04, 0.025),
      mk('sph', '#ffd24a', 0, 0.4, 0.235, 0.034));
  }
  const t0 = t.length;
  if (acc === 'scarf') { const sc = pick(['#e8564a', '#fff4dc', '#4a90e0', '#ffd24a']); t.push(mk('tor', sc, 0, 0.47, 0.0, 0.23, 0.2, 0.12, Math.PI / 2), mk('bx', sc, 0.1, 0.38, 0.17, 0.07, 0.17, 0.04, 0, 0, 0.1)); }
  if (acc === 'satchel') t.push(mk('bx', '#8a5a3a', 0.0, 0.33, 0.0, 0.05, 0.42, 0.3, 0, 0, -0.9), mk('bx', '#a8703f', -0.23, 0.17, 0.02, 0.1, 0.13, 0.13), mk('sph', '#ffd24a', -0.285, 0.19, 0.02, 0.02));
  if (acc === 'beard') t.push(mk('sph', hair, 0, 0.41, 0.17, 0.12, 0.1, 0.07));
  for (let i = t0; i < t.length; i++) t[i].userData.opt = 1;

  // ----- arms (pivot at the shoulder, static parts baked in arm-local coordinates)
  function makeArm(side, withTool) {
    const a = new THREE.Group(); a.position.set(side * 0.235, 0.44, 0); a.rotation.z = side * 0.14;
    const parts = [mk('sphS', shirt, 0, -0.075, 0, 0.068, 0.1, 0.068), mk('dot', skin, 0, -0.185, 0, 0.062)];
    for (const m of bake(parts).children) a.add(m);
    return a;
  }
  const arm = makeArm(1); arm.name = 'arm'; const armL = makeArm(-1); armL.name = 'armL'; body.add(arm, armL);
  const toolKind = tool !== 'none' ? tool : (elder ? 'cane' : 'none');
  let toolG = null;
  if (toolKind !== 'none') { toolG = buildTool(toolKind, gearO); toolG.position.set(0, -0.185, 0); toolG.rotation.x = TOOL_ALPHA[toolKind]; if (toolKind !== 'basket') toolG.scale.setScalar(1.3); if (toolKind === 'basket') toolG.position.x = 0.04; arm.add(toolG); }

  // ----- legs (pivot at the hip, children of the root so they do not bob)
  const legCol = style === 'overalls' ? color : pants;
  function makeLeg(side) {
    const l = new THREE.Group(); l.position.set(side * 0.105, 0.2, 0);
    for (const m of bake([mk('sphS', legCol, 0, -0.065, 0, 0.082, 0.09, 0.082), mk('sphS', bootC, 0, -0.145, 0.03, 0.09, 0.06, 0.12)]).children) l.add(m);
    return l;
  }
  const legL = makeLeg(-1); legL.name = 'legL'; const legR = makeLeg(1); legR.name = 'legR'; g.add(legL, legR);

  // ----- head
  const head = new THREE.Group(); head.name = 'head'; head.position.y = HEAD_Y; body.add(head);
  const hs = [];
  hs.push(mk('head', skin, 0, 0, 0, HX, HY, HZ));
  hs.push(fm('hemiS', skin, -0.285, -0.02, -0.02, 0.05, 0.065, 0.05), fm('hemiS', skin, 0.285, -0.02, -0.02, 0.05, 0.065, 0.05));
  hs.push(fm('hemi', skinD, 0, -0.085, -0.008, 0.03, 0.024, 0.026));
  const ch = child ? 1.15 : 1;
  hs.push(fm('hemiS', blush, -0.2, -0.1, -0.01, 0.058 * ch, 0.038 * ch, 0.02), fm('hemiS', blush, 0.2, -0.1, -0.01, 0.058 * ch, 0.038 * ch, 0.02));
  (GEAR[gear] || GEAR.short)(hs, gearO);
  const h0 = hs.length;
  if (acc === 'freckles') for (const s of [-1, 1]) for (const [x, y] of [[0.17, -0.06], [0.215, -0.065], [0.19, -0.035]]) hs.push(fm('hemi', skinD, s * x, y, 0.0, 0.013, 0.013, 0.01));
  if (acc === 'glasses') { for (const s of [-1, 1]) hs.push(fm('torS', '#5a4a3a', s * 0.125, -0.035, 0.01, 0.092, 0.092, 0.07)); hs.push(fm('hemi', '#5a4a3a', 0, -0.03, 0.0, 0.02, 0.01, 0.01)); }
  if (acc === 'mustache') for (const s of [-1, 1]) hs.push(fm('hemi', hair, s * 0.045, -0.125, 0.0, 0.06, 0.03, 0.03, s * 0.25));
  if (elder) for (const s of [-1, 1]) hs.push(fm('hemi', hair, s * 0.125, 0.045, 0.0, 0.06, 0.018, 0.02, s * -0.2)); // bushy brows
  for (let i = h0; i < hs.length; i++) hs[i].userData.opt = 1;

  // eyes: glossy ink ellipsoids, iris glow, two highlights. Group origin sits at the eye line so scale.y blinks about it.
  const EY = -0.035, ex = eyeV === 2 ? 0.135 : 0.122, erx = [0.066, 0.056, 0.074][eyeV], ery = [0.082, 0.098, 0.076][eyeV];
  const ep = [], hp = [];
  for (const s of [-1, 1]) {
    const X = s * ex;
    const e = fm('hemiM', '#2a1a20', X, EY, -0.016, erx, ery, 0.034, 0, eyeMat); const i = fm('hemiE', iris, X, EY - 0.025, -0.004, erx * 0.72, ery * 0.55, 0.02, 0, eyeMat);
    const h1 = fm('hemiE', '#ffffff', X - erx * 0.28, EY + ery * 0.38, 0.012, 0.021, 0.024, 0.012, 0, hiMat);
    for (const m of [e, i]) { m.position.y -= EY; ep.push(m); } for (const m of [h1]) { m.position.y -= EY; hp.push(m); }
  }
  const eyes = bake([...ep, ...hp], 'eyes'); eyes.position.y = EY; head.add(eyes);
  // lids (tired)
  const lidList = []; for (const s of [-1, 1]) { const m = fm('hemi', skin, s * ex, EY + ery * 0.55, -0.01, erx * 1.2, ery * 0.62, 0.04); m.position.y -= EY; lidList.push(m); }
  const lids = bake(lidList, 'lids'); lids.position.y = EY; lids.visible = false; head.add(lids);
  // brows
  const browC = elder ? hair : '#5a3d2e';
  const browL = fm('hemi', browC, -ex, 0.075, 0.0, 0.05, 0.012, 0.012), browR = fm('hemi', browC, ex, 0.075, 0.0, 0.05, 0.012, 0.012);
  browL.name = 'browL'; browR.name = 'browR'; browL.visible = browR.visible = eyeV === 2 || elder; head.add(browL, browR);
  // mouths
  const MY = -0.128, ink = '#4a2a2a';
  const mouthSmile = new THREE.Group(); mouthSmile.name = 'mouthSmile';
  { const m = [];
    if (mouthV === 0) m.push(fm('arcT', ink, 0, MY + 0.03, 0.002, 0.042, 0.042, 0.02, Math.PI));
    else if (mouthV === 1) m.push(fm('hemi', '#7a2a35', 0, MY + 0.005, 0.002, 0.052, 0.04, 0.02), fm('hemi', '#ff7a8a', 0, MY - 0.014, 0.006, 0.03, 0.016, 0.012));
    else m.push(fm('arcT', ink, -0.03, MY + 0.02, 0.002, 0.03, 0.03, 0.02, Math.PI), fm('arcT', ink, 0.03, MY + 0.02, 0.002, 0.03, 0.03, 0.02, Math.PI));
    for (const x of bake(m).children) mouthSmile.add(x); }
  const mouthFlat = new THREE.Group(); mouthFlat.name = 'mouthFlat'; for (const x of bake([fm('hemi', ink, 0, MY + 0.01, 0.002, 0.03, 0.007, 0.01, 0.15)]).children) mouthFlat.add(x);
  const mouthO = new THREE.Group(); mouthO.name = 'mouthO'; for (const x of bake([fm('hemi', '#7a2a35', 0, MY, 0.003, 0.026, 0.032, 0.014), fm('hemi', '#ff7a8a', 0, MY - 0.012, 0.007, 0.014, 0.008, 0.008)]).children) mouthO.add(x);
  mouthFlat.visible = mouthO.visible = false; head.add(mouthSmile, mouthFlat, mouthO);
  // sweat drop (hungry)
  const sweat = new THREE.Group(); sweat.name = 'sweat'; for (const x of bake([mk('sph', '#8fd8ff', 0.27, 0.16, 0.12, 0.04, 0.05, 0.04), mk('cone6', '#8fd8ff', 0.27, 0.19, 0.12, 0.034, 0.06, 0.034)]).children) sweat.add(x);
  sweat.visible = false; head.add(sweat);
  if (elder) head.position.z = 0.03;

  // ----- carried sack and sleep bubbles (hidden until their pose)
  const carry = new THREE.Group(); carry.name = 'carry';
  for (const x of bake([mk('sph', '#e3b857', 0, 0.35, 0.3, 0.17, 0.15, 0.15), mk('sph', '#c58a52', 0, 0.5, 0.3, 0.05, 0.04, 0.05), mk('sph', '#f6dcae', 0.05, 0.4, 0.4, 0.05, 0.05, 0.03)]).children) carry.add(x);
  carry.visible = false; body.add(carry);
  const zzz = new THREE.Group(); zzz.name = 'zzz';
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh((colored('dot', '#ffffff'), geoCache.get('dot')), soft('#ffffff', { emissive: '#bcd6ff', emissiveIntensity: 0.5 })); m.castShadow = false; zzz.add(m); }
  zzz.visible = false; body.add(zzz);

  // ----- triangle budget: bake torso and head, dropping optional trinkets (accessories, fringe) if the model would exceed it
  const cost = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  let total = triangles(g) + [...t, ...hs].reduce((a, m) => a + cost(m), 0);
  const optional = [...t, ...hs].filter((m) => m.userData.opt).sort((a, b) => cost(b) - cost(a));
  for (const m of optional) { if (total <= BUDGET) break; total -= cost(m); m.userData.drop = true; }
  for (const m of bake(t.filter((m) => !m.userData.drop), 'torso').children) { m.name = ''; body.add(m); }
  for (const m of bake(hs.filter((m) => !m.userData.drop), 'headStatic').children) { m.name = ''; head.add(m); }

  // ----- age proportions
  if (child) { g.scale.setScalar(0.8); head.scale.setScalar(1.14); }
  if (elder) { g.scale.setScalar(0.95); }
  const lean = elder ? 0.16 : 0;
  body.rotation.x = lean;

  const rig = { body, head, eyes, lids, browL, browR, mouthSmile, mouthFlat, mouthO, sweat, armR: arm, armL, legL, legR, tool: toolG, carry, zzz, toolKind, lean, armZ: 0.14, eyeBase: 1, mood: 'happy', eyeV, hasTool: toolKind !== 'none' && toolKind !== 'cane', work: WORK[toolKind] };
  RIGS.set(g, rig); g.userData.rig = rig; g.userData.look = { gear, style, acc, age, tool: toolKind, eyeV, mouthV };
  setMood(g, 'happy');
  return g;
}

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
  // brows are face-aligned meshes: the spin lives in rotation.z (YXZ order), busy = inner ends down, hungry = worried
  r.browR.rotation.z = busy ? 0.4 : hungry ? -0.4 : -0.05; r.browL.rotation.z = busy ? -0.4 : hungry ? 0.4 : 0.05;
}

/**
 * setPose(group, pose, t, phase): 'idle' | 'walk' | 'work' | 'carry' | 'cheer' | 'sleep'. t in seconds, phase = per-villager offset.
 * Pure number writes, no allocation. Drives body, head, armR/armL, legL/legR, eyes (blink), carry/tool/zzz visibility.
 */
export function setPose(g, pose = 'idle', t = 0, phase = 0) {
  const r = rigOf(g); if (!r) return;
  let by = 0, brx = r.lean, brz = 0, sx = 1, sy = 1, hx = 0, hy = 0, hz = 0, aR = 0, aL = 0, azR = r.armZ, azL = -r.armZ, lL = 0, lR = 0, eye = 1, showCarry = false, showTool = true, showZ = false;
  switch (pose) {
    case 'walk': {
      const ph = t * 10 + phase, s = Math.sin(ph), k = r.hasTool ? 0.45 : 0.85;
      lL = s * 0.75; lR = -s * 0.75; aR = lL * k; aL = lR * k; by = Math.abs(s) * 0.05; brz = s * 0.06; hz = -s * 0.05; sy = 1 - Math.abs(Math.cos(ph)) * 0.02; sx = 1 + Math.abs(Math.cos(ph)) * 0.015; brx += 0.05; break;
    }
    case 'work': {
      const w = r.work, s = Math.sin(t * w.s + phase), pos = Math.max(0, s);
      aR = w.c + s * w.a; aL = aR * 0.7 - 0.2; azL = -r.armZ - 0.1; lL = -0.12; lR = 0.12; brx += 0.07 + pos * 0.1; by = pos * 0.01; sy = 1 - pos * 0.035; sx = 1 + pos * 0.025; hx = 0.06 + pos * 0.08; hz = s * 0.03;
      if (r.toolKind === 'scroll') { hx = 0.12; hy = Math.sin(t * 1.5 + phase) * 0.12; }
      break;
    }
    case 'carry': {
      const ph = t * 8 + phase, s = Math.sin(ph);
      lL = s * 0.55; lR = -s * 0.55; aR = aL = -1.05; azR = -0.42; azL = 0.42; by = Math.abs(s) * 0.04; brz = s * 0.04; brx -= 0.07; hz = -s * 0.04; showCarry = true; showTool = false; break;
    }
    case 'cheer': {
      const q = t * 6 + phase, j = Math.abs(Math.sin(q)), w = Math.sin(t * 12 + phase);
      by = j * 0.17; aR = -2.75 + w * 0.3; aL = -2.75 - w * 0.3; azR = 0.5; azL = -0.5; lL = -0.35 * j; lR = 0.3 * j; hz = Math.sin(q * 0.5) * 0.1; sy = 1 - (1 - j) * 0.09; sx = 1 + (1 - j) * 0.06; brx -= 0.05; hx = -0.1; break;
    }
    case 'sleep': {
      const br = Math.sin(t * 1.4 + phase); sy = 1 + br * 0.025; sx = 1 - br * 0.012; brx += 0.2; hx = 0.38; hz = 0.14; aR = 0.08; aL = 0.08; eye = 0.06; showZ = true; lL = 0.2; lR = -0.2; break;
    }
    default: { // idle
      const br = Math.sin(t * 2.2 + phase); sy = 1 + br * 0.02; sx = 1 - br * 0.009; hz = Math.sin(t * 0.9 + phase) * 0.04; hy = Math.sin(t * 0.55 + phase * 1.7) * 0.2; aR = br * 0.05; aL = -br * 0.05; by = 0;
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

/** a varied villager: random profession, age mix, owner colour. */
export function randomVillager(seed = 1, color) {
  const r = rng(seed * 2654435761 + 7);
  const prof = PROFESSIONS[Math.floor(r() * PROFESSIONS.length)];
  const a = r(), age = a < 0.13 ? 'child' : a < 0.22 ? 'elder' : 'adult';
  const col = color || P.outfit[Math.floor(r() * P.outfit.length)];
  const g = villagerModel(col, Math.floor(r() * 100), { tool: prof.tool, seed, age });
  g.userData.profession = prof.id; return g;
}

/** triangle count of a model (for budgets). */
export function triangles(g) {
  let n = 0; g.traverseVisible((o) => { if (o.isMesh) { const gg = o.geometry; n += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } }); return n;
}
