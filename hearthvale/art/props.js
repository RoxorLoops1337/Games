// Hearthvale props, ROUND 2 "Happy Light": pastel painted wood, round and chunky, bunting wherever it fits. Origin = centre on the ground. Every prop <= 400 tris, 1-4 meshes.
//
// WHAT I LEARNED (research notes)
//  1. Cozy kits share a silhouette language: chunky, slightly oversized, softened corners. A 48-tri "pillow box" (2x2 quads per face pushed onto a
//     rounded surface) gives the soft toy corner for a tenth of the cost of a bevelled box.
//  2. Light honey wood is the base; PAINT is the accent (mint, sky, butter, blush, lilac). One painted part per prop (the legs, the lid, the roof)
//     is enough: more reads as clutter, none reads as plain.
//  3. Bunting is the cheapest happiness: a sagging string plus single-triangle flags in candy colours, hung between any two posts. 1 tri per flag.
//  4. Cozy-yard staples (hammock, picnic blanket with basket, swing, bird bath, kite on a string, windchime, flower cart, pumpkin patch, bee skep) each
//     tell a tiny story and give villagers somewhere to be. Give them a little animated part (seat, kite, chimes, hammock sway) as a NAMED child.
//  5. Faces on objects (a smiling kite, a jack-o-lantern pumpkin) use the same dot-eye/smile decals as the critters, so the world feels one family.
//  6. Three values per object (light top, mid, shaded underside) come from vertex colours; shadows are lavender-teal and capped at 0.18 strength.
//  7. Repetition with variation sells a prop: stacked planks/bricks/logs get tiny yaw/offset jitter and alternating tones.
//  8. Props that animate keep the moving part as a NAMED child so the game can drive it (flag, flame, lid, bucket, lanterns, flags, chimes, seat, kite,
//     sway, bees); everything else is merged into one mesh per material.
//  9. Emissive materials (lamp glass, fire, lanterns) are SHARED exports so day/night code changes one number for every lamp in the village.
// 10. Fake AO: a soft lavender blob shadow under every prop plus a slightly bluer, darker bottom on each part keeps it seated on the grass.

import * as THREE from 'three';
import { soft, rng } from './artkit.js';
import { B, CMAT, GEO, part, pboxGeo, blobShadow, decal, smileGeo, lift } from './critters.js';

const PI = Math.PI;
export const lampMat = new THREE.MeshStandardMaterial({ color: '#fff1b8', emissive: '#ffc94a', emissiveIntensity: 0.35, roughness: 0.4 });
export const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb23c', vertexColors: true, transparent: true, opacity: 0.95 });
export const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: '#ffb73a', emissiveIntensity: 0.3, roughness: 0.5 });
const TWO = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
TWO.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.3;'); }; TWO.customProgramCacheKey = () => 'hv-highkey2';

// honey wood + candy paint
const W = { light: '#f8dca6', mid: '#efc17e', dark: '#dca463', deep: '#bf8650' };
const PA = { mint: '#a9ecc9', mintD: '#86dcb0', sky: '#a3d9f7', skyD: '#7cc3ee', butter: '#ffe58c', butterD: '#ffd35e', pink: '#ffb5cf', pinkD: '#ff93b8', lilac: '#d8c9ff', coral: '#ff9f8c', cream: '#fff8e6' };
const BUNT = ['#ff8fb5', '#ffe27a', '#8fd8ff', '#9be8b8', '#c9a8ff', '#ffb27a'];
const STONE = { a: '#e2e0f0', b: '#d3d0e8', c: '#c5c2de' };
const _c = new Map(); const cached = (k, f) => { let v = _c.get(k); if (!v) { v = f(); _c.set(k, v); } return v; };
const TRI = () => cached('tri', () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0.5, 0, 0, -0.5, 0, 0.5, 0.5, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); return g; });
const PLANE = () => cached('plane', () => new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2));
const HEART = () => cached('heart', () => { const s = new THREE.Shape(); s.moveTo(0, -0.5); s.bezierCurveTo(-0.62, -0.02, -0.5, 0.5, 0, 0.22); s.bezierCurveTo(0.5, 0.5, 0.62, -0.02, 0, -0.5); return new THREE.ShapeGeometry(s, 3); });
const _rq = new THREE.Quaternion(), _ry = new THREE.Vector3(0, 1, 0), _rd = new THREE.Vector3(), _re = new THREE.Euler();
/** thin rod between two points (n-sided open prism) */
function rod(b, x1, y1, z1, x2, y2, z2, r, col, n = 3) {
  _rd.set(x2 - x1, y2 - y1, z2 - z1); const L = _rd.length(); _rq.setFromUnitVectors(_ry, _rd.normalize()); _re.setFromQuaternion(_rq, 'XYZ');
  b.put(GEO.cyl(n, 1, true), col, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, r, L, r, { r: [_re.x, _re.y, _re.z], sh: 0 });
}
/** sagging bunting between two points: string into sb (default material), 1-tri flags into fb (double-sided material B) */
function bunting(sb, fb, p1, p2, n, sag, size, off = 0, segs = 5) {
  const pt = (u) => [p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u - Math.sin(u * PI) * sag, p1[2] + (p2[2] - p1[2]) * u];
  for (let i = 0; i < segs; i++) { const a = pt(i / segs), c = pt((i + 1) / segs); rod(sb, a[0], a[1], a[2], c[0], c[1], c[2], 0.008, '#fff3d6'); }
  const yaw = Math.atan2(-(p2[2] - p1[2]), p2[0] - p1[0]);
  for (let i = 0; i < n; i++) { const [x, y, z] = pt((i + 0.5) / n); fb.put(TRI(), BUNT[(i + off) % BUNT.length], x, y - size * 0.46, z, size * 0.95, size, 1, { r: [0, yaw, 0], sh: 0.1, mat: TWO }); }
}
function make(shadowR, sx = 1, sz = 1, op = 0.2) { const g = new THREE.Group(); g.add(blobShadow(shadowR, op, sx, sz)); return g; }
function addParts(g, ...bs) { for (const b of bs) for (const m of b.build()) g.add(m); return g; }
function finalize(g) { g.userData.prop = true; return g; }
const flagsB = () => new B(0, 0, 0, TWO);
const prism = (b, len, y0, h, hw, z0, col) => { const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(0, h); s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); geo.translate(0, 0, -len / 2); b.put(geo, col, 0, y0, z0, 1, 1, 1, { sh: 0.12 }); };

/* ------------------------------------------------------------------ crates & friends */
export function crateModel() {
  const g = make(0.5), b = new B();
  b.pbox(W.light, 0, 0.26, 0, 0.52, 0.5, 0.52, 0.09);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.box(PA.mint, x * 0.25, 0.26, z * 0.25, 0.08, 0.5, 0.08, { sh: 0.1 });
  b.box(PA.butter, 0, 0.52, 0, 0.5, 0.045, 0.1, { r: [0, 0.78, 0] }); b.box(PA.butter, 0, 0.52, 0, 0.5, 0.045, 0.1, { r: [0, -0.78, 0] });
  b.box(W.mid, 0, 0.14, 0.265, 0.4, 0.07, 0.03); b.box(W.mid, 0, 0.38, 0.265, 0.4, 0.07, 0.03);
  return finalize(addParts(g, b));
}
export function barrelModel() {
  const g = make(0.42), b = new B();
  const prof = [[0.2, 0], [0.26, 0.15], [0.29, 0.3], [0.26, 0.45], [0.2, 0.58]];
  b.put(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10), W.mid, 0, 0, 0, 1, 1, 1, { fn: (x, y, z) => (Math.floor((Math.atan2(x, z) + PI) / (PI / 5)) % 2 ? W.light : null), facet: true });
  b.cyl(W.light, 0, 0.585, 0, 0.2, 0.03, { n: 10, rt: 0.97 });
  b.cyl(PA.skyD, 0, 0.14, 0, 0.268, 0.05, { n: 10, rt: 1.02, open: true, sh: 0.1 }); b.cyl(PA.skyD, 0, 0.45, 0, 0.255, 0.05, { n: 10, rt: 1.02, open: true, sh: 0.1 });
  b.sph(PA.pink, 0.07, 0.605, 0.05, 0.05, 0.025, 0.05, { w: 5, h: 3 }); b.sph('#ffe27a', 0.07, 0.62, 0.05, 0.02, 0.012, 0.02, { w: 4, h: 3, sh: 0 });
  return finalize(addParts(g, b));
}
export function sackModel() {
  const g = make(0.38), b = new B();
  b.sph('#fff0cf', 0, 0.2, 0, 0.23, 0.21, 0.2, { w: 8, h: 5 });
  b.cone('#fbe3b4', 0, 0.42, 0, 0.1, 0.13, { n: 6, rt: 1, sh: 0.1 });
  b.cyl(PA.pink, 0, 0.37, 0, 0.085, 0.045, { n: 6, open: true, sh: 0.05 });
  b.sph('#fbe3b4', 0.04, 0.5, 0.0, 0.05, 0.04, 0.04, { w: 5, h: 3 }); b.sph('#fbe3b4', -0.05, 0.49, 0.02, 0.04, 0.04, 0.04, { w: 5, h: 3 });
  b.box(PA.coral, 0.1, 0.22, 0.2, 0.1, 0.1, 0.02, { r: [0, 0, 0.2] });
  return finalize(addParts(g, b));
}
export function hayBaleModel() {
  const g = make(0.5, 1.15, 0.85), b = new B(), R = rng(5);
  b.pbox('#ffe27a', 0, 0.23, 0, 0.8, 0.46, 0.52, 0.1);
  for (const x of [-0.22, 0.22]) b.box('#ffb877', x, 0.23, 0, 0.045, 0.485, 0.545, { sh: 0.05 });
  for (let i = 0; i < 9; i++) b.cone('#fff2a8', (R() - 0.5) * 0.7, 0.46 + R() * 0.02, (R() - 0.5) * 0.4, 0.015, 0.08, { n: 3, r: [R() * 0.8 - 0.4, 0, R() * 0.8 - 0.4], sh: 0.05 });
  for (let i = 0; i < 4; i++) b.cone('#fff2a8', 0.4, 0.15 + R() * 0.2, (R() - 0.5) * 0.4, 0.015, 0.07, { n: 3, r: [0, 0, -1.2 + R() * 0.4], sh: 0.05 });
  return finalize(addParts(g, b));
}
export function logPileModel() {
  const g = make(0.6, 1.25, 0.9), b = new B(), R = rng(9);
  const log = (x, y, z, r, len, yaw) => b.put(GEO.cyl(7, 1, false), '#d8a066', x, y, z, r, len, r, { r: [0, yaw, PI / 2], fn: (lx, ly, lz, t, nx, ny) => (Math.abs(ny) > 0.8 ? (Math.hypot(lx, lz) > 0.7 ? '#e8b878' : '#fff0c8') : null) });
  const rows = [[-0.24, 0, 0.24], [-0.12, 0.12], [0]];
  rows.forEach((r, ri) => r.forEach((x, i) => { log(x * 1.0, 0.1 + ri * 0.17, (R() - 0.5) * 0.04, 0.115, 0.7 + R() * 0.1, 0); }));
  b.sph('#7fdc6a', 0.34, 0.06, 0.28, 0.1, 0.05, 0.08, { w: 5, h: 3 }); b.sph('#ff9ec7', 0.36, 0.1, 0.3, 0.03, 0.03, 0.03, { w: 4, h: 3, sh: 0 });
  g.rotation.y = 0; return finalize(addParts(g, b));
}
export function plankStackModel() {
  const g = make(0.55, 1.2, 0.8), b = new B(), R = rng(11);
  for (const x of [-0.3, 0.3]) b.box(W.deep, x, 0.03, 0, 0.1, 0.06, 0.5, { sh: 0.1 });
  for (let i = 0; i < 6; i++) { const y = 0.085 + i * 0.075, yaw = (R() - 0.5) * 0.12, off = (R() - 0.5) * 0.06; for (const z of [-0.12, 0.12]) b.box(i % 2 ? '#ffe6b4' : '#f8d49a', off, y, z + (R() - 0.5) * 0.02, 0.84, 0.065, 0.2, { r: [0, yaw, 0], sh: 0.1 }); }
  b.box(PA.butter, 0, 0.54, 0, 0.1, 0.02, 0.5, { r: [0, 0.05, 0] });
  return finalize(addParts(g, b));
}
export function stonePileModel() {
  const g = make(0.5, 1.1, 0.95), b = new B();
  const moss = (x, y, z, t, nx, ny) => (ny > 0.55 ? '#9ae27a' : null);
  b.ico(STONE.a, 0, 0.16, 0, 0.3, 0.2, 0.26, { d: 1, seed: 3, amt: 0.12, fn: moss, facet: true });
  b.ico('#ebe9f6', 0.26, 0.1, 0.12, 0.17, 0.12, 0.15, { d: 0, seed: 5, amt: 0.15 });
  b.ico(STONE.c, -0.28, 0.12, -0.06, 0.16, 0.13, 0.15, { d: 0, seed: 7, amt: 0.15 });
  b.ico(STONE.b, 0.06, 0.36, -0.02, 0.15, 0.12, 0.13, { d: 0, seed: 9, amt: 0.12 });
  b.sph('#ff9ec7', -0.1, 0.4, 0.1, 0.035, 0.03, 0.035, { w: 4, h: 3 }); b.sph('#ffffff', -0.2, 0.2, 0.22, 0.03, 0.025, 0.03, { w: 4, h: 3 });
  return finalize(addParts(g, b));
}
export function brickStackModel() {
  const g = make(0.5, 1.1, 0.85), b = new B(), R = rng(21), cols = ['#ffa07a', '#ff9068', '#ffb48e', '#f58d72'];
  b.box(W.deep, 0, 0.025, 0, 0.8, 0.05, 0.24, { sh: 0.1 }); b.box(W.deep, 0, 0.025, 0, 0.1, 0.05, 0.5, { sh: 0.1 });
  for (let row = 0; row < 4; row++) for (let i = 0; i < 3; i++) for (const z of [-1, 1]) {
    if (row === 3 && i === 1) continue;
    b.box(cols[(row + i + (z > 0 ? 1 : 0)) % 4], (i - 1) * 0.255 + (row % 2) * 0.06 + (R() - 0.5) * 0.015, 0.05 + 0.075 + row * 0.085, z * 0.12 + (R() - 0.5) * 0.015, 0.24, 0.08, 0.2, { r: [0, (R() - 0.5) * 0.06, 0], sh: 0.1 });
  }
  b.box(cols[1], 0.5, 0.04, 0.2, 0.22, 0.07, 0.12, { r: [0, 0.4, 0] });
  return finalize(addParts(g, b));
}

/* ------------------------------------------------------------------ cart */
export function cartModel() {
  const g = make(0.7, 1.2, 0.8), b = new B(), fb = flagsB();
  b.box(W.mid, 0, 0.27, 0, 0.74, 0.07, 0.96, { sh: 0.1 });
  for (const s of [1, -1]) b.box(PA.mint, s * 0.35, 0.42, 0, 0.07, 0.22, 0.96, { sh: 0.1 });
  b.box(PA.mintD, 0, 0.42, 0.46, 0.74, 0.22, 0.07, { sh: 0.1 }); b.box(PA.mintD, 0, 0.42, -0.46, 0.74, 0.22, 0.07, { sh: 0.1 });
  b.cyl(W.deep, 0, 0.2, 0, 0.03, 0.9, { n: 4, r: [0, 0, PI / 2], sh: 0.05 });
  for (const s of [1, -1]) b.cyl(W.dark, s * 0.22, 0.24, -0.78, 0.028, 0.6, { n: 4, r: [1.38, 0, 0] });
  b.cyl(W.dark, 0, 0.3, -1.05, 0.03, 0.5, { n: 4, r: [0, 0, PI / 2] });
  for (const [x, z, c] of [[-0.12, 0.15, '#ff8f9c'], [0.14, 0.2, '#ffd75e'], [0.02, -0.12, '#ff8f9c'], [-0.15, -0.25, '#9be86a']]) b.sph(c, x, 0.5, z, 0.12, 0.11, 0.12, { w: 5, h: 3 });
  bunting(b, fb, [-0.35, 0.56, 0.46], [0.35, 0.56, 0.46], 4, 0.07, 0.1, 0, 2);
  const wheel = (s) => (bb) => {
    bb.put(GEO.cyl(10, 1, false), W.dark, s * 0.42, 0.2, 0, 0.2, 0.06, 0.2, { r: [0, 0, PI / 2], sh: 0.1, fn: (x, y, z) => (Math.hypot(x, z) < 0.55 ? PA.pink : null) });
    bb.box(W.deep, s * 0.45, 0.2, 0, 0.03, 0.34, 0.05); bb.box(W.deep, s * 0.45, 0.2, 0, 0.03, 0.05, 0.34);
  };
  addParts(g, b, fb); part(g, 'wheelL', 0.42, 0.2, 0, wheel(1)); part(g, 'wheelR', -0.42, 0.2, 0, wheel(-1));
  return finalize(g);
}

/* ------------------------------------------------------------------ well, bench, signpost */
export function wellModel() {
  const g = make(0.85, 1, 1, 0.2), b = new B(), fb = flagsB();
  const ring = (lx, ly, lz) => ((Math.floor((Math.atan2(lz, lx) + PI) / (PI / 6)) + (ly > 0 ? 1 : 0)) % 2 ? STONE.a : STONE.b);
  b.put(GEO.cyl(12, 1, true, 2), STONE.a, 0, 0.22, 0, 0.5, 0.44, 0.5, { fn: ring, facet: true });
  b.cyl('#f2f0fb', 0, 0.46, 0, 0.56, 0.08, { n: 12, rt: 0.96 });
  b.put(GEO.circle(12), '#5fd8f0', 0, 0.36, 0, 0.42, 1, 0.42, { sh: 0 });
  for (const s of [1, -1]) b.box(W.mid, s * 0.46, 0.9, 0, 0.08, 0.9, 0.1, { sh: 0.1 });
  b.box('#ff9fb8', 0, 1.46, 0.2, 1.1, 0.07, 0.62, { r: [0.55, 0, 0] }); b.box('#ff86a6', 0, 1.46, -0.2, 1.1, 0.07, 0.62, { r: [-0.55, 0, 0] });
  b.box(PA.cream, 0, 1.62, 0, 1.12, 0.07, 0.1);
  b.cyl(W.deep, 0, 1.0, 0, 0.045, 0.98, { n: 5, r: [0, 0, PI / 2] }); b.box(W.dark, 0.58, 1.0, 0.06, 0.2, 0.05, 0.05, { r: [0, 0, 0.5] });
  bunting(b, fb, [-0.5, 1.3, 0.34], [0.5, 1.3, 0.34], 5, 0.1, 0.12, 2, 4);
  b.sph('#7fdc6a', 0.5, 0.06, 0.4, 0.12, 0.05, 0.09, { w: 5, h: 3 }); b.sph('#ff9ec7', 0.52, 0.11, 0.4, 0.035, 0.03, 0.035, { w: 4, h: 3, sh: 0 });
  addParts(g, b, fb);
  part(g, 'bucket', 0, 0.78, 0, (bb) => { bb.cyl(PA.sky, 0, 0.7, 0, 0.1, 0.16, { n: 7, rt: 1.2, sh: 0.1 }); bb.cyl(PA.skyD, 0, 0.72, 0, 0.125, 0.025, { n: 7, open: true }); bb.cyl('#fff3d6', 0, 0.9, 0, 0.012, 0.28, { n: 3, open: true, sh: 0 }); });
  return finalize(g);
}
export function benchModel() {
  const g = make(0.65, 1.5, 0.6), b = new B();
  b.pbox(W.light, 0, 0.36, 0, 1.1, 0.07, 0.34, 0.03); b.pbox(W.mid, 0, 0.68, -0.18, 1.1, 0.07, 0.07, 0.03); b.pbox(W.mid, 0, 0.58, -0.18, 1.1, 0.07, 0.07, 0.03);
  for (const s of [1, -1]) { b.box(PA.mint, s * 0.46, 0.0, 0.0, 0.08, 0.34, 0.3, { sh: 0.1 }); b.box(PA.mint, s * 0.46, 0.34, -0.17, 0.08, 0.4, 0.07, { sh: 0.1 }); }
  b.pbox(PA.pink, -0.22, 0.43, 0.02, 0.3, 0.07, 0.24, 0.035, { r: [0, 0.1, 0] }); b.sph('#ffffff', -0.22, 0.485, 0.02, 0.025, 0.015, 0.025, { w: 4, h: 3, sh: 0 });
  return finalize(addParts(g, b));
}
function textTex(lines, bg, fg) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 256, 96); x.fillStyle = fg; x.font = 'bold 44px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(lines, 128, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function signpostModel(texts = ['Market', 'Farm']) {
  const g = make(0.4), b = new B();
  b.cyl(W.mid, 0, 0.8, 0, 0.065, 1.6, { n: 6, rt: 0.85 }); b.sph(PA.pink, 0, 1.64, 0, 0.1, 0.1, 0.1, { w: 6, h: 4 });
  b.cyl(W.dark, 0, 0.05, 0, 0.12, 0.1, { n: 6, rt: 0.8 }); b.sph('#7fdc6a', 0.14, 0.05, 0.1, 0.1, 0.05, 0.07, { w: 5, h: 3 });
  addParts(g, b);
  const arrow = (len, h, dir, y, yaw, txt, col, bg) => {
    const grp = new THREE.Group(); grp.position.y = y; grp.rotation.y = yaw; g.add(grp);
    const s = new THREE.Shape(); s.moveTo(-len / 2, -h / 2); s.lineTo(len / 2 - h * 0.55, -h / 2); s.lineTo(len / 2 + h * 0.1, 0); s.lineTo(len / 2 - h * 0.55, h / 2); s.lineTo(-len / 2, h / 2); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }); geo.translate(0, 0, -0.03); if (dir < 0) geo.scale(-1, 1, 1);
    const pos = geo.attributes.position, col2 = new Float32Array(pos.count * 3), c = new THREE.Color(col);
    for (let i = 0; i < pos.count; i++) { const k = 0.9 + 0.1 * ((pos.getY(i) + h / 2) / h); col2[i * 3] = c.r * k; col2[i * 3 + 1] = c.g * k; col2[i * 3 + 2] = c.b * k; }
    geo.setAttribute('color', new THREE.BufferAttribute(col2, 3)); const m = new THREE.Mesh(geo, CMAT); m.castShadow = true; grp.add(m);
    const tex = textTex(txt, bg, '#7a4a2a');
    if (tex) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.82, h * 0.78), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); pl.position.set(-dir * h * 0.04, 0, 0.031); grp.add(pl); const pl2 = pl.clone(); pl2.position.z = -0.031; pl2.rotation.y = PI; grp.add(pl2); }
  };
  arrow(0.8, 0.26, 1, 1.38, 0.15, texts[0] || '', '#ffe6a8', '#ffe6a8'); if (texts.length > 1) arrow(0.7, 0.24, -1, 1.06, -0.12, texts[1], '#ffc6d9', '#ffc6d9');
  return finalize(g);
}

/* ------------------------------------------------------------------ scarecrow */
export function scarecrowModel() {
  const g = make(0.5), b = new B();
  b.cyl(W.dark, 0, 0.7, 0, 0.045, 1.4, { n: 5, rt: 0.9, open: true }); b.cyl(W.dark, 0, 1.05, 0, 0.04, 1.15, { n: 4, r: [0, 0, PI / 2], open: true });
  b.cyl(W.deep, 0, 0.04, 0, 0.14, 0.08, { n: 6 });
  b.sph('#8fd0f5', 0, 0.98, 0, 0.23, 0.3, 0.2, { w: 6, h: 4 });
  b.box('#ff9fb8', 0.06, 0.95, 0.19, 0.15, 0.15, 0.03, { r: [0, 0, 0.15] });
  
  for (const s of [1, -1]) { b.cyl('#8fd0f5', s * 0.42, 1.08, 0, 0.1, 0.5, { n: 5, rt: 0.9, r: [0, 0, PI / 2], open: true }); b.sph('#ffe8c4', s * 0.7, 1.08, 0, 0.06, 0.06, 0.06, { w: 5, h: 3 }); for (let i = 0; i < 1; i++) b.cone('#ffe488', s * 0.72, 1.08 + (i - 0.5) * 0.07, 0, 0.025, 0.12, { n: 3, r: [0, 0, -s * 1.57 + (i - 0.5) * 0.5], sh: 0.05 }); }
  const hc = [0, 1.5, 0], hr = [0.19, 0.19, 0.19];
  b.sph('#ffe8c4', hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 5 });
  for (const s of [1, -1]) { decal(b, GEO.disc(8), '#2b2036', hc, hr, s * 0.45, 0.1, 0.034, 0.04, 0.012); decal(b, GEO.disc(4), '#ffffff', hc, hr, s * 0.45, 0.1, 0.012, 0.012, 0.016, 0.01, 0.014); decal(b, GEO.disc(6), '#ff93b0', hc, hr, s * 0.85, -0.12, 0.034, 0.022, 0.012); }
  decal(b, smileGeo(), '#7d3a4a', hc, hr, 0, -0.35, 0.06, 0.06, 0.014);
  b.cyl('#ffe27a', 0, 1.64, 0, 0.3, 0.03, { n: 8, rt: 1 }); b.cyl('#ffe27a', 0, 1.74, 0, 0.17, 0.2, { n: 8, rt: 0.75 }); b.cyl(PA.pink, 0, 1.68, 0, 0.175, 0.05, { n: 8, rt: 1.04, open: true });
  b.sph('#ff93b8', 0.17, 1.74, 0.07, 0.05, 0.04, 0.05, { w: 5, h: 3 }); b.sph('#ffffff', 0.17, 1.76, 0.1, 0.02, 0.015, 0.02, { w: 4, h: 3, sh: 0 });
  addParts(g, b);
  part(g, 'body', 0, 1.0, 0, (bb) => bb.cone('#ffe488', 0.16, 1.4, 0.12, 0.02, 0.1, { n: 3, r: [0.2, 0, -0.8], sh: 0.05 }));
  return finalize(g);
}

/* ------------------------------------------------------------------ lamp post, tent, campfire */
export function lampPostModel() {
  const g = make(0.4), b = new B();
  b.cyl(PA.mintD, 0, 0.12, 0, 0.17, 0.24, { n: 10, rt: 0.55 }); b.cyl(PA.mint, 0, 0.9, 0, 0.055, 1.5, { n: 8, rt: 0.8 });
  b.cyl(PA.mintD, 0, 1.62, 0, 0.1, 0.07, { n: 8, rt: 1.3 });
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.box(PA.mintD, x * 0.1, 1.84, z * 0.1, 0.035, 0.34, 0.035, { sh: 0.05 });
  b.cone(PA.pink, 0, 2.1, 0, 0.18, 0.2, { n: 8 }); b.sph('#ffd84a', 0, 2.24, 0, 0.05, 0.05, 0.05, { w: 5, h: 4 });
  addParts(g, b);
  const glass = new B(0, 0, 0, lampMat); glass.cyl('#fff1b8', 0, 1.84, 0, 0.095, 0.3, { n: 8, rt: 1.1, sh: 0 }); const gm = glass.build()[0]; gm.name = 'lamp'; gm.castShadow = false; g.add(gm);
  return finalize(g);
}
export function tentModel() {
  const g = make(0.95, 1.1, 1.1), b = new B(), fb = flagsB();
  const cols = ['#ff9db8', '#fff6e0', '#ff9db8', '#fff6e0', '#ff9db8'], n = 5;
  for (let i = 0; i < n; i++) prism(b, 0.28, 0.0, 1.0, 0.62, (i - (n - 1) / 2) * 0.28, cols[i]);
  b.cyl(W.mid, 0, 1.0, 0.0, 0.025, 1.46, { n: 4, r: [PI / 2, 0, 0], sh: 0.05 });
  b.put(GEO.cone(3), '#c9788a', 0, 0.3, 0.72, 0.28, 0.6, 0.02, { sh: 0 });
  for (const [x, z] of [[0.7, 0.5], [-0.7, 0.5], [0.7, -0.5], [-0.7, -0.5]]) b.cone(W.mid, x, 0.07, z, 0.03, 0.14, { n: 4, r: [0, 0, 0.3 * Math.sign(x)] });
  b.sph('#7fdc6a', 0.78, 0.07, -0.1, 0.1, 0.07, 0.2, { w: 5, h: 3 });
  b.cyl(W.mid, 0, 1.2, 0.72, 0.014, 0.5, { n: 4 });
  bunting(b, fb, [0, 1.32, 0.74], [-0.7, 0.14, 0.5], 4, 0.05, 0.11, 0, 3); bunting(b, fb, [0, 1.32, 0.74], [0.7, 0.14, 0.5], 4, 0.05, 0.11, 3, 3);
  addParts(g, b, fb);
  part(g, 'flag', 0, 1.42, 0.72, (bb) => bb.put(GEO.circle(3), '#ffd84a', 0.11, 1.42, 0.72, 0.1, 1, 0.07, { mat: TWO, sh: 0, r: [PI / 2, 0, 0] }), TWO);
  return finalize(g);
}
export function campfireModel() {
  const g = make(0.65), b = new B();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; b.ico(i % 2 ? STONE.a : STONE.c, Math.cos(a) * 0.38, 0.08, Math.sin(a) * 0.38, 0.12, 0.09, 0.1, { d: 0, seed: i + 1, amt: 0.15, r: [0, -a, 0] }); }
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; b.put(GEO.cyl(6, 1, false), '#d09258', Math.cos(a) * 0.1, 0.1 + i * 0.015, Math.sin(a) * 0.1, 0.06, 0.55, 0.06, { r: [0, -a, PI / 2 - 0.2], fn: (x, y, z, t, nx, ny) => (Math.abs(ny) > 0.8 ? '#fff0c8' : null) }); }
  b.put(GEO.circle(8), '#8a6a5e', 0, 0.03, 0, 0.3, 1, 0.3, { sh: 0 });
  addParts(g, b);
  const fl = part(g, 'flame', 0, 0.12, 0, (bb) => {
    bb.cone('#ff8a3a', 0, 0.3, 0, 0.17, 0.42, { n: 6, sh: 0.18, mat: flameMat }); bb.cone('#ffc24a', 0.04, 0.27, 0.03, 0.11, 0.34, { n: 6, sh: 0.15, mat: flameMat, r: [0.1, 0, -0.1] }); bb.cone('#fff4b0', 0, 0.24, 0, 0.06, 0.24, { n: 5, sh: 0.1, mat: flameMat });
    bb.cone('#ffa84a', -0.1, 0.22, -0.05, 0.07, 0.22, { n: 5, sh: 0.15, mat: flameMat, r: [0, 0, 0.3] });
  }, flameMat);
  fl.children.forEach((m) => { m.castShadow = false; });
  return finalize(g);
}

/* ------------------------------------------------------------------ beehive, fence, banner, mailbox */
export function beehiveModel() {
  const g = make(0.5), b = new B();
  const prof = [[0.0, 0.0], [0.3, 0.02], [0.34, 0.12], [0.26, 0.17], [0.31, 0.27], [0.23, 0.32], [0.26, 0.42], [0.16, 0.47], [0.17, 0.56], [0.07, 0.62], [0.0, 0.64]];
  b.put(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10), '#ffd04a', 0, 0.38, 0, 1, 1, 1, { sh: 0.15, fn: (x, y) => (Math.floor(y / 0.16) % 2 ? '#ffb92e' : null), facet: true });
  b.sph('#a8704a', 0, 0.5, 0.31, 0.07, 0.085, 0.03, { w: 6, h: 4, sh: 0 });
  b.pbox(PA.sky, 0, 0.34, 0, 0.8, 0.07, 0.8, 0.03);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.box(PA.skyD, x * 0.32, 0.17, z * 0.32, 0.07, 0.34, 0.07, { sh: 0.1 });
  b.sph('#ff9ec7', 0.2, 0.43, 0.3, 0.03, 0.02, 0.03, { w: 4, h: 3, sh: 0 });
  addParts(g, b);
  return finalize(g);
}
export function fenceModel(len = 2) {
  const g = make(0.3, Math.max(1, len / 0.6), 0.5, 0.14), b = new B(), R = rng(Math.round(len * 10));
  const n = Math.max(2, Math.round(len / 0.28)), x0 = -len / 2;
  b.pbox(PA.sky, 0, 0.3, 0, len, 0.07, 0.05, 0.02); b.pbox(PA.sky, 0, 0.55, 0, len, 0.07, 0.05, 0.02);
  for (let i = 0; i <= n; i++) {
    const x = x0 + (i / n) * len, post = i === 0 || i === n || i % 4 === 0, h = post ? 0.8 : 0.66 + (R() - 0.5) * 0.04, c = post ? PA.butter : PA.cream;
    b.box(c, x, h / 2, 0.04, 0.1, h, 0.04, { r: [0, 0, (R() - 0.5) * 0.04], sh: 0.1 });
    b.sph(c, x, h + 0.015, 0.04, 0.055, 0.045, 0.03, { w: 5, h: 3 });
  }
  return finalize(addParts(g, b));
}
export function bannerPoleModel(colorHex = '#ff8fa8') {
  const g = make(0.3), b = new B();
  b.cyl(W.dark, 0, 0.05, 0, 0.14, 0.1, { n: 6, rt: 0.8 }); b.cyl(W.light, 0, 1.15, 0, 0.04, 2.1, { n: 6, rt: 0.85 }); b.sph('#ffd84a', 0, 2.25, 0, 0.07, 0.07, 0.07, { w: 6, h: 4 });
  b.cyl('#ffd84a', 0.31, 2.05, 0, 0.025, 0.66, { n: 4, r: [0, 0, PI / 2] });
  addParts(g, b);
  const cloth = new THREE.PlaneGeometry(0.56, 1.0, 2, 8); cloth.translate(0, -0.5, 0);
  const pos = cloth.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(colorHex);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i); if (y < -0.99) pos.setY(i, -1 + (1 - Math.abs(x) / 0.28) * 0.2);
    const k = 0.9 + 0.14 * (pos.getY(i) + 1); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * (k + (1 - k) * 0.3);
  }
  cloth.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const grp = new THREE.Group(); grp.name = 'flag'; grp.position.set(0.33, 2.03, 0); grp.userData.pv = [0.33, 2.03, 0];
  const m = new THREE.Mesh(cloth, TWO); m.castShadow = true; grp.add(m);
  const em = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), new THREE.MeshStandardMaterial({ color: '#ffe27a', roughness: 0.6, side: THREE.DoubleSide })); em.position.set(0, -0.38, 0.004); grp.add(em);
  g.add(grp);
  return finalize(g);
}
export function mailboxModel() {
  const g = make(0.35), b = new B();
  b.cyl(W.mid, 0, 0.45, 0, 0.045, 0.9, { n: 5, rt: 0.9 }); b.pbox(W.dark, 0, 0.96, 0, 0.12, 0.08, 0.34, 0.03);
  b.pbox(PA.sky, 0, 1.1, 0, 0.36, 0.28, 0.5, 0.11);
  b.put(GEO.circle(8), PA.skyD, 0, 1.1, 0.255, 0.12, 1, 0.1, { r: [PI / 2, 0, 0], sh: 0 });
  b.put(HEART(), '#ff7aa2', 0.0, 1.14, 0.19, 0.1, 0.1, 1, { sh: 0, r: [0, PI / 2, 0], mat: TWO }); b.put(HEART(), '#ff7aa2', 0, 1.14, -0.19, 0.1, 0.1, 1, { sh: 0, r: [0, PI / 2, 0], mat: TWO });
  b.box('#fff8e6', 0.08, 1.06, 0.26, 0.14, 0.09, 0.02, { r: [0, 0, 0.1], sh: 0.05 });
  addParts(g, b);
  part(g, 'flag', 0.2, 1.1, -0.05, (bb) => { bb.box('#ff8f7a', 0.215, 1.2, -0.05, 0.03, 0.2, 0.04, { sh: 0.05 }); bb.box('#ff8f7a', 0.24, 1.3, -0.05, 0.1, 0.07, 0.04, { sh: 0.05 }); });
  return finalize(g);
}

/* ------------------------------------------------------------------ chest, coins, scroll */
export function chestModel() {
  const g = make(0.55, 1.2, 0.9), b = new B();
  b.pbox('#f5c88c', 0, 0.21, 0, 0.84, 0.42, 0.52, 0.08);
  b.box('#d9a07c', 0, 0.425, 0, 0.7, 0.01, 0.4, { sh: 0 });
  b.sph('#ffd84a', 0, 0.42, 0, 0.3, 0.1, 0.17, { w: 7, h: 4 }); b.sph('#fff4b0', 0.12, 0.5, 0.05, 0.05, 0.04, 0.04, { w: 4, h: 3, sh: 0 }); b.sph('#ff93b8', -0.14, 0.49, -0.03, 0.04, 0.04, 0.04, { w: 4, h: 3, sh: 0 });
  for (const x of [-0.3, 0.3]) b.box('#ffd24a', x, 0.21, 0, 0.09, 0.44, 0.545, { sh: 0.05 });
  addParts(g, b);
  part(g, 'lid', 0, 0.42, -0.26, (bb) => {
    bb.put(GEO.halfCyl(8), '#ffdca6', 0, 0.42, 0.26, 0.27, 0.84, 0.27, { r: [0, 0, PI / 2], sh: 0.12 });
    bb.box('#d9a07c', 0, 0.425, 0.26, 0.82, 0.01, 0.53, { sh: 0 });
    for (const x of [-0.3, 0.3]) bb.put(GEO.halfCyl(8), '#ffd24a', x, 0.42, 0.26, 0.285, 0.09, 0.285, { r: [0, 0, PI / 2], sh: 0.05 });
    bb.box('#ffd84a', 0, 0.45, 0.545, 0.12, 0.14, 0.05); bb.sph('#8a5a50', 0, 0.45, 0.575, 0.018, 0.028, 0.01, { w: 4, h: 3, sh: 0 });
  });
  return finalize(g);
}
export function coinPileModel() {
  const g = make(0.45), b = new B(), R = rng(6);
  b.sph('#ffcf48', 0, 0.09, 0, 0.3, 0.17, 0.3, { w: 8, h: 4, sh: 0.15 });
  const coin = (x, y, z, r, rot) => b.put(GEO.cyl(8, 1, false), '#ffd84a', x, y, z, r, 0.04, r, { r: rot, fn: (lx, ly, lz, t, nx, ny) => (Math.abs(ny) > 0.8 && Math.hypot(lx, lz) < 0.72 ? '#fff0a0' : null), sh: 0.08 });
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3, rad = 0.12 + (i % 2) * 0.1; coin(Math.cos(a) * rad, 0.14 + (i % 2 ? 0 : 0.06), Math.sin(a) * rad, 0.1, [0.5 + R() * 0.6, a, (R() - 0.5) * 0.8]); }
  coin(0.0, 0.2, 0.0, 0.11, [0.15, 0.4, 0.1]);
  coin(0.34, 0.03, 0.22, 0.1, [0, 0.4, 0]); coin(-0.34, 0.03, 0.12, 0.1, [0, 1, 0]);
  b.ico('#ff93b8', -0.1, 0.27, -0.04, 0.06, 0.07, 0.06, { d: 0, seed: 4, amt: 0.05 }); b.ico('#7fd0f5', 0.1, 0.25, 0.07, 0.05, 0.06, 0.05, { d: 0, seed: 8, amt: 0.05 });
  return finalize(addParts(g, b));
}
export function scrollModel() {
  const g = make(0.4, 1.3, 0.6, 0.18), b = new B();
  b.put(GEO.cyl(10, 1, false), '#fff3d4', 0, 0.12, 0, 0.1, 0.62, 0.1, { r: [0, 0, PI / 2], fn: (lx, ly, lz, t, nx, ny) => (Math.abs(nx) > 0.8 ? '#f0d49a' : null), sh: 0.12 });
  for (const s of [1, -1]) { b.cyl(W.dark, s * 0.34, 0.12, 0, 0.045, 0.05, { n: 6, r: [0, 0, PI / 2] }); b.sph('#ffd84a', s * 0.375, 0.12, 0, 0.05, 0.05, 0.05, { w: 5, h: 4 }); }
  b.cyl('#ff8fb5', 0, 0.12, 0, 0.108, 0.1, { n: 10, r: [0, 0, PI / 2], open: true, sh: 0.05 }); b.cyl('#ff75a3', 0, 0.12, 0, 0.11, 0.025, { n: 10, r: [0, 0, PI / 2], open: true, sh: 0.05 });
  b.cyl('#ff8fb5', 0.0, 0.03, 0.12, 0.012, 0.15, { n: 3, r: [PI / 2, 0, 0.4], open: true, sh: 0 });
  return finalize(addParts(g, b));
}

/* ------------------------------------------------------------------ lantern string, flower pot */
export function lanternStringModel(len = 4) {
  const g = new THREE.Group(), b = new B(), H = 2.2;
  g.add(blobShadow(0.3, 0.14, 1, 1));
  for (const x of [-len / 2, len / 2]) { b.cyl(W.mid, x, H / 2, 0, 0.045, H, { n: 5, rt: 0.8 }); b.sph(PA.pink, x, H + 0.03, 0, 0.065, 0.065, 0.065, { w: 5, h: 3 }); b.cyl(W.dark, x, 0.04, 0, 0.1, 0.08, { n: 5, rt: 0.8 }); }
  const sag = 0.35, n = Math.max(3, Math.round(len * 1.5)), lm = new B(0, 0, 0, lanternMat);
  const pt = (u) => [(u - 0.5) * len, H - 0.02 - Math.sin(u * PI) * sag];
  const seg = 8;
  for (let i = 0; i < seg; i++) { const [x1, y1] = pt(i / seg), [x2, y2] = pt((i + 1) / seg); rod(b, x1, y1, 0, x2, y2, 0, 0.01, '#fff0d0'); }
  const flags = new B(0, 0, 0, TWO);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, [x, y] = pt(u);
    if (i % 2 === 0) { lm.sph('#ffe9a8', x, y - 0.16, 0, 0.1, 0.12, 0.1, { w: 5, h: 3, sh: 0 }); lm.cone('#ffe9a8', x, y - 0.03, 0, 0.04, 0.04, { n: 4, sh: 0 }); }
    else flags.put(TRI(), BUNT[(i >> 1) % BUNT.length], x, y - 0.12, 0, 0.2, 0.22, 1, { sh: 0.1, mat: TWO });
  }
  addParts(g, b, flags); for (const m of lm.build()) { m.name = 'lanterns'; m.castShadow = false; g.add(m); }
  return finalize(g);
}
export function flowerPotModel() {
  const g = make(0.32), b = new B(), R = rng(8);
  const prof = [[0.12, 0], [0.19, 0.2], [0.23, 0.22], [0.23, 0.29], [0.2, 0.3]];
  b.put(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10), '#ffb48e', 0, 0, 0, 1, 1, 1, { sh: 0.15, fn: (x, y) => (y > 0.72 ? '#ffc8aa' : null) });
  b.put(GEO.circle(10), '#9a6a50', 0, 0.28, 0, 0.2, 1, 0.2, { sh: 0 });
  const cols = ['#ff8fbd', '#ffe27a', '#ffffff'];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.3, x = Math.cos(a) * 0.08, z = Math.sin(a) * 0.08, h = 0.42 + i * 0.07 + R() * 0.04;
    b.cyl('#5fd058', x * 1.4, 0.28 + (h - 0.28) / 2, z * 1.4, 0.011, h - 0.28, { n: 3, open: true, r: [z * 1.2, 0, -x * 1.2], sh: 0.05 });
    b.sph(cols[i], x * 1.8, h, z * 1.8, 0.08, 0.06, 0.08, { w: 6, h: 4, sh: 0.1 }); b.sph('#ffb23c', x * 1.8, h + 0.045, z * 1.8, 0.03, 0.02, 0.03, { w: 4, h: 3, sh: 0 });
  }
  b.sph('#5fd058', 0.14, 0.35, 0.04, 0.09, 0.025, 0.045, { w: 5, h: 3, r: [0, 0.3, 0.4] }); b.sph('#78e068', -0.12, 0.34, -0.07, 0.09, 0.025, 0.045, { w: 5, h: 3, r: [0, -0.5, -0.4] });
  return finalize(addParts(g, b));
}

/* ================================================================== ROUND 2: new cozy props */

/** Bunting line between two honey posts: `flags` is the swaying child. */
export function buntingLineModel(len = 3) {
  const g = new THREE.Group(), b = new B(), fb = flagsB(), H = 2.0; g.add(blobShadow(0.3, 0.14, 1, 1));
  for (const x of [-len / 2, len / 2]) { b.cyl(W.mid, x, H / 2, 0, 0.045, H, { n: 6, rt: 0.8 }); b.sph(PA.pink, x, H + 0.03, 0, 0.07, 0.07, 0.07, { w: 6, h: 4 }); b.cyl(W.dark, x, 0.04, 0, 0.11, 0.08, { n: 6, rt: 0.8 }); }
  const n = Math.max(4, Math.round(len * 3.2));
  bunting(b, fb, [-len / 2, H - 0.02, 0], [len / 2, H - 0.02, 0], n, 0.3, 0.2, 0, 8);
  addParts(g, b); const f = addParts(new THREE.Group(), fb); f.name = 'flags'; f.position.y = H - 0.02; f.children.forEach((m) => { m.position.y -= H - 0.02; }); g.add(f);
  return finalize(g);
}
/** Smiling diamond kite floating on a string from a stake. `kite` bobs and tilts. */
export function kiteModel() {
  const g = make(0.3, 1, 1, 0.14), b = new B(), fb = flagsB();
  b.cyl(W.dark, 0, 0.2, 0, 0.04, 0.4, { n: 5, rt: 0.8 }); b.sph(PA.butter, 0, 0.41, 0, 0.06, 0.06, 0.06, { w: 5, h: 3 });
  rod(b, 0, 0.42, 0, 0.35, 2.1, 0.1, 0.008, '#fff3d6');
  addParts(g, b);
  const K = part(g, 'kite', 0.35, 2.1, 0.1, (kb) => {
    const cx = 0.35, cy = 2.5, cz = 0.1, hw = 0.3, hh = 0.42;
    const quad = (x1, y1, x2, y2, col) => { const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, x1 - cx, y1 - cy, 0, x2 - cx, y2 - cy, 0], 3)); gm.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); kb.put(gm, col, cx, cy, cz, 1, 1, 1, { sh: 0.05, mat: TWO, ox: 0 }); };
    quad(cx - hw, cy, cx, cy + hh, '#ff9ec7'); quad(cx, cy + hh, cx + hw, cy, '#ffe27a'); quad(cx + hw, cy, cx, cy - hh * 0.9, '#8fd8ff'); quad(cx, cy - hh * 0.9, cx - hw, cy, '#9be8b8');
    kb.put(GEO.disc(8), '#2b2036', cx - 0.09, cy + 0.04, cz + 0.004, 0.035, 0.04, 1, { sh: 0, mat: TWO }); kb.put(GEO.disc(8), '#2b2036', cx + 0.09, cy + 0.04, cz + 0.004, 0.035, 0.04, 1, { sh: 0, mat: TWO });
    kb.put(GEO.disc(4), '#ffffff', cx - 0.082, cy + 0.055, cz + 0.006, 0.012, 0.012, 1, { sh: 0, mat: TWO }); kb.put(GEO.disc(4), '#ffffff', cx + 0.098, cy + 0.055, cz + 0.006, 0.012, 0.012, 1, { sh: 0, mat: TWO });
    kb.put(smileGeo(), '#7d3a4a', cx, cy - 0.04, cz + 0.004, 0.07, 0.07, 1, { sh: 0, mat: TWO }); for (const s of [1, -1]) kb.put(GEO.disc(6), '#ff6f9c', cx + s * 0.16, cy - 0.01, cz + 0.004, 0.032, 0.02, 1, { sh: 0, mat: TWO });
    rod(kb, cx, cy - hh * 0.9, cz, cx - 0.05, cy - 1.0, cz, 0.006, '#fff3d6');
    for (let i = 0; i < 4; i++) { const y = cy - hh * 0.9 - 0.18 - i * 0.2, x = cx - 0.05 * (i + 1) * 0.5 - 0.02; kb.put(TRI(), BUNT[i], x - 0.07, y, cz, 0.16, 0.12, 1, { sh: 0.05, mat: TWO, r: [0, 0, 0.9] }); kb.put(TRI(), BUNT[i], x + 0.07, y, cz, 0.16, 0.12, 1, { sh: 0.05, mat: TWO, r: [0, 0, -0.9] }); }
  }, TWO);
  return finalize(g);
}
/** Wind chime on a little post: `chimes` swings. */
export function windchimeModel() {
  const g = make(0.45, 1, 1, 0.16), b = new B();
  b.cyl(W.mid, 0, 0.7, 0, 0.06, 1.4, { n: 6, rt: 0.8 }); b.cyl(W.dark, 0, 0.05, 0, 0.15, 0.1, { n: 6, rt: 0.8 }); b.sph(PA.pink, 0, 1.46, 0, 0.09, 0.08, 0.09, { w: 6, h: 4 });
  b.cyl(W.mid, 0.3, 1.36, 0, 0.035, 0.6, { n: 4, r: [0, 0, PI / 2], open: true }); b.sph(PA.butter, 0.62, 1.36, 0, 0.05, 0.05, 0.05, { w: 4, h: 3 });
  b.sph('#7fdc6a', 0.16, 0.05, 0.12, 0.11, 0.05, 0.08, { w: 5, h: 3 }); b.sph('#ff9ec7', 0.18, 0.1, 0.12, 0.035, 0.03, 0.035, { w: 4, h: 3, sh: 0 });
  addParts(g, b);
  part(g, 'chimes', 0.62, 1.32, 0, (cb) => {
    cb.cyl(PA.lilac, 0.62, 1.28, 0, 0.14, 0.04, { n: 8, rt: 0.9 }); rod(cb, 0.62, 1.34, 0, 0.62, 1.28, 0, 0.014, '#fff3d6');
    const T = [[0.36, PA.pink], [0.5, PA.sky], [0.32, PA.mint], [0.44, PA.butter], [0.28, PA.lilac]];
    T.forEach(([h, col], i) => { const a = (i / T.length) * PI * 2 + 0.3, x = 0.62 + Math.cos(a) * 0.085, z = Math.sin(a) * 0.085; rod(cb, x, 1.28, z, x, 1.2 - h * 0.15, z, 0.006, '#fff3d6'); cb.cyl(col, x, 1.2 - h * 0.15 - h, z, 0.03, h, { n: 6, sh: 0.1 }); });
    cb.cyl('#fff3d6', 0.62, 0.78, 0, 0.012, 0.3, { n: 3, open: true, sh: 0 }); cb.put(HEART(), '#ff9ec7', 0.62, 0.7, 0, 0.16, 0.16, 1, { sh: 0, mat: TWO });
  }, CMAT);
  return finalize(g);
}
/** Hammock between two posts: `sway` rocks. */
export function hammockModel() {
  const g = make(1.0, 1.5, 0.6, 0.16), b = new B(), L = 1.6, H = 0.95;
  for (const s of [1, -1]) { b.cyl(W.mid, s * L / 2, H / 2 + 0.05, 0, 0.06, H + 0.1, { n: 6, rt: 0.85 }); b.sph(PA.mint, s * L / 2, H + 0.12, 0, 0.08, 0.07, 0.08, { w: 6, h: 4 }); b.cyl(W.dark, s * L / 2, 0.04, 0, 0.13, 0.08, { n: 6, rt: 0.8 }); }
  b.sph('#7fdc6a', 0.2, 0.05, 0.5, 0.12, 0.05, 0.08, { w: 5, h: 3 }); b.sph('#ff9ec7', 0.23, 0.1, 0.5, 0.035, 0.03, 0.035, { w: 4, h: 3, sh: 0 });
  addParts(g, b);
  part(g, 'sway', 0, H, 0, (sb) => {
    const nx = 8, nz = 2, pos = [], idx = [];
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { const u = i / nx, v = j / nz - 0.5, x = (u - 0.5) * (L - 0.1), y = H - 0.05 - Math.sin(u * PI) * 0.34 + (Math.abs(v) * 0.12) * Math.sin(u * PI) * 1.2, z = v * 0.62; pos.push(x, y, z); }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, bb = a + 1, cc = a + nz + 1, d = cc + 1; idx.push(a, bb, cc, bb, d, cc); }
    const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gm.setIndex(idx); gm.computeVertexNormals();
    sb.put(gm.toNonIndexed(), '#ffffff', 0, 0, 0, 1, 1, 1, { sh: 0.05, mat: TWO, fn: (x, y, z) => (Math.abs(z) < 0.01 ? '#fff3d6' : Math.floor((x / (L - 0.1) + 0.5) * nx + 0.001) % 2 ? '#ff93bd' : '#ffc6dc') });
    for (const s of [1, -1]) for (const z of [-0.28, 0.28]) rod(sb, s * (L / 2 - 0.02), H + 0.02, 0, s * (L / 2 - 0.12), H - 0.12, z, 0.01, '#fff3d6');
    sb.pbox(PA.butter, -0.25, H - 0.3, 0, 0.36, 0.1, 0.26, 0.05, { r: [0, 0, 0.12] }); sb.put(HEART(), '#ff7aa2', -0.25, H - 0.24, 0.14, 0.09, 0.09, 1, { sh: 0, mat: TWO, r: [0, 0, 0.1] });
  }, TWO);
  return finalize(g);
}
/** Picnic: gingham blanket, wicker basket, apples, cups, a sandwich. */
export function picnicModel() {
  const g = make(1.0, 1.2, 1.0, 0.14), b = new B();
  b.pbox('#fff6e4', 0, 0.0, 0, 1.5, 0.05, 1.3, 0.02);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) b.put(PLANE(), '#ff9fc0', (i - 2) * 0.3, 0.054, (j - 1.5) * 0.3, 0.2, 1, 0.2, { sh: 0 });
  b.cyl('#e8c07a', -0.35, 0.17, -0.1, 0.24, 0.26, { n: 10, rt: 1.12, fn: (x, y, z, t) => (Math.floor(t * 5) % 2 ? '#f6d498' : null), facet: true });
  b.cyl('#fff3d6', -0.35, 0.32, -0.1, 0.27, 0.025, { n: 10, rt: 1.0, open: true, sh: 0 });
  b.sph('#ffffff', -0.35, 0.34, -0.1, 0.2, 0.04, 0.2, { w: 6, h: 3, sh: 0.05 });
  for (let i = 0; i < 6; i++) { const a = (i / 5) * PI, x1 = -0.35 + Math.cos(a) * 0.24, y1 = 0.3 + Math.sin(a) * 0.28, a2 = ((i + 1) / 5) * PI, x2 = -0.35 + Math.cos(a2) * 0.24, y2 = 0.3 + Math.sin(a2) * 0.28; if (i < 5) rod(b, x1, y1, -0.1, x2, y2, -0.1, 0.018, '#d8a860', 3); }
  b.sph('#ff6f7f', -0.2, 0.37, 0.0, 0.07, 0.065, 0.07, { w: 6, h: 4 }); b.sph('#9be86a', -0.5, 0.37, -0.02, 0.07, 0.065, 0.07, { w: 6, h: 4 }); b.cone('#7fdc6a', -0.5, 0.42, -0.02, 0.012, 0.04, { n: 3, sh: 0 });
  b.sph('#ffcf6a', -0.3, 0.36, 0.1, 0.06, 0.05, 0.06, { w: 5, h: 3 });
  b.cyl(PA.sky, 0.3, 0.06, 0.15, 0.06, 0.1, { n: 6, rt: 1.15 }); b.cyl(PA.pink, 0.52, 0.06, -0.1, 0.06, 0.1, { n: 6, rt: 1.15 });
  b.box('#ffe9b0', 0.25, 0.05, -0.3, 0.26, 0.05, 0.2, { sh: 0.05 }); b.box('#9be86a', 0.25, 0.1, -0.3, 0.27, 0.02, 0.21, { sh: 0 }); b.box('#ffe9b0', 0.25, 0.15, -0.3, 0.26, 0.05, 0.2, { sh: 0.05 });
  b.sph('#ff7aa2', 0.55, 0.06, 0.32, 0.07, 0.04, 0.07, { w: 5, h: 3 });
  return finalize(addParts(g, b));
}
/** Swing set: `seat` swings (rotate about X). */
export function swingModel() {
  const g = make(0.9, 1.3, 0.8, 0.16), b = new B(), fb = flagsB(), L = 1.2, H = 1.7;
  for (const s of [1, -1]) for (const z of [-0.45, 0.45]) rod(b, s * L / 2, 0.02, z, s * L / 2, H, z * 0.12, 0.06, W.mid, 5);
  b.cyl(PA.mint, 0, H, 0, 0.055, L + 0.2, { n: 8, r: [0, 0, PI / 2] }); for (const s of [1, -1]) b.sph(PA.mintD, s * (L / 2 + 0.1), H, 0, 0.07, 0.07, 0.07, { w: 6, h: 4 });
  b.sph('#7fdc6a', 0.75, 0.05, 0.4, 0.12, 0.05, 0.08, { w: 5, h: 3 });
  bunting(b, fb, [-L / 2, H + 0.02, 0.04], [L / 2, H + 0.02, 0.04], 6, 0.0, 0.0, 0, 1);
  addParts(g, b);
  part(g, 'seat', 0, H, 0, (sb) => {
    for (const s of [1, -1]) rod(sb, s * 0.23, H - 0.03, 0, s * 0.23, 0.5, 0, 0.012, '#fff3d6');
    sb.pbox(PA.pink, 0, 0.44, 0, 0.56, 0.07, 0.24, 0.035); sb.sph(PA.butter, 0, 0.485, 0, 0.1, 0.02, 0.06, { w: 5, h: 3, sh: 0 });
  });
  return finalize(g);
}
/** Flower cart: mint hand cart overflowing with blooms under a striped awning. */
export function flowerCartModel() {
  const g = make(0.75, 1.2, 0.9, 0.18), b = new B(), fb = flagsB(), R = rng(31);
  b.box(W.mid, 0, 0.28, 0, 0.9, 0.06, 0.6, { sh: 0.1 });
  b.box(PA.mint, 0, 0.5, 0.3, 0.9, 0.3, 0.05, { sh: 0.1 }); b.box(PA.mint, 0, 0.5, -0.3, 0.9, 0.3, 0.05, { sh: 0.1 }); for (const s of [1, -1]) b.box(PA.mintD, s * 0.45, 0.5, 0, 0.05, 0.3, 0.6, { sh: 0.1 });
  b.sph('#6fd860', 0, 0.62, 0, 0.42, 0.14, 0.26, { w: 7, h: 3 });
  const C = ['#ff8fbd', '#ffe27a', '#ffffff', '#c9a8ff', '#ff9f8c', '#8fd8ff'];
  for (let i = 0; i < 8; i++) b.sph(C[i % C.length], -0.3 + (i % 4) * 0.2 + (R() - 0.5) * 0.06, 0.74 + (i % 2) * 0.05, (i < 4 ? 0.08 : -0.1) + (R() - 0.5) * 0.06, 0.075, 0.06, 0.075, { w: 4, h: 3, sh: 0.08 });
  for (const s of [1, -1]) { b.cyl(W.dark, s * 0.42, 0.65, 0.3, 0.025, 1.0, { n: 3, open: true }); b.cyl(W.dark, s * 0.42, 0.65, -0.3, 0.025, 1.0, { n: 3, open: true }); }
  b.box('#ff9db8', 0, 1.2, 0.18, 1.0, 0.04, 0.45, { r: [0.38, 0, 0], sh: 0.1 }); b.box('#fff6e0', 0, 1.2, -0.18, 1.0, 0.04, 0.45, { r: [-0.38, 0, 0], sh: 0.1 });
  b.cyl(W.dark, 0, 0.3, 0.62, 0.03, 0.5, { n: 4, open: true, r: [PI / 2 - 0.15, 0, 0] });
  addParts(g, b, fb);
  const wheel = (s) => (bb) => { bb.put(GEO.cyl(8, 1, false), W.dark, s * 0.48, 0.2, 0, 0.2, 0.05, 0.2, { r: [0, 0, PI / 2], sh: 0.08, fn: (x, y, z) => (Math.hypot(x, z) < 0.55 ? PA.pink : null) }); bb.box(W.deep, s * 0.5, 0.2, 0, 0.03, 0.34, 0.05); };
  part(g, 'wheelL', 0.48, 0.2, 0, wheel(1)); part(g, 'wheelR', -0.48, 0.2, 0, wheel(-1));
  return finalize(g);
}
/** Bird bath with a happy little bluebird: `bird` hops. */
export function birdBathModel() {
  const g = make(0.55, 1, 1, 0.18), b = new B();
  b.put(new THREE.LatheGeometry([[0, 0], [0.26, 0], [0.28, 0.06], [0.14, 0.12], [0.1, 0.4], [0.16, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 8), '#dccfff', 0, 0, 0, 1, 1, 1, { sh: 0.12 });
  b.put(new THREE.LatheGeometry([[0, 0], [0.4, 0.1], [0.5, 0.2], [0.44, 0.2], [0.3, 0.12], [0, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 8), '#f4e9ff', 0, 0.48, 0, 1, 1, 1, { sh: 0.12 });
  b.put(GEO.circle(8), '#6fdcf5', 0, 0.62, 0, 0.36, 1, 0.36, { sh: 0 });
  b.sph('#7fdc6a', 0.34, 0.05, 0.28, 0.13, 0.06, 0.09, { w: 5, h: 3 }); b.sph('#ff9ec7', 0.37, 0.11, 0.28, 0.04, 0.035, 0.04, { w: 4, h: 3, sh: 0 });
  addParts(g, b);
  part(g, 'bird', 0.33, 0.66, 0.05, (bb) => {
    const c = [0.33, 0.74, 0.05];
    bb.sph('#62b8ff', c[0], c[1], c[2], 0.075, 0.07, 0.085, { w: 7, h: 4 }); bb.sph('#fff6e0', c[0], c[1] - 0.025, c[2] + 0.03, 0.05, 0.045, 0.05, { w: 5, h: 3, sh: 0.05 });
    const hc = [c[0], c[1] + 0.08, c[2] + 0.05], hr = [0.055, 0.052, 0.052];
    bb.sph('#62b8ff', hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 6, h: 4 }); bb.cone('#ffb23a', hc[0], hc[1] - 0.005, hc[2] + 0.07, 0.016, 0.04, { n: 4, r: [PI / 2, 0, 0] });
    for (const s of [1, -1]) { decal(bb, GEO.disc(7), '#2b2036', hc, hr, s * 0.8, 0.12, 0.018, 0.02, 0.008); decal(bb, GEO.disc(4), '#ffffff', hc, hr, s * 0.8, 0.12, 0.007, 0.007, 0.012, 0.005, 0.007); }
    bb.sph('#3f98f0', c[0], c[1] + 0.0, c[2] - 0.11, 0.035, 0.012, 0.07, { w: 5, h: 3 });
  });
  return finalize(g);
}
/** Painted sign board on a post. signBoardModel(color, label?) */
export function signBoardModel(color = PA.sky, label = '') {
  const g = make(0.4, 1, 0.8, 0.16), b = new B();
  const c = new THREE.Color(color), dark = '#' + c.clone().multiplyScalar(0.85).getHexString();
  for (const s of [1, -1]) b.cyl(W.mid, s * 0.34, 0.5, 0, 0.045, 1.0, { n: 6, rt: 0.85 });
  b.pbox(color, 0, 0.7, 0, 0.9, 0.56, 0.07, 0.07); b.pbox('#fff8e6', 0, 0.78, 0.045, 0.78, 0.4, 0.02, 0.02, { sh: 0.05 }); b.pbox(dark, 0, 0.66, 0.0, 0.94, 0.06, 0.075, 0.03);
  b.put(HEART(), '#ff7aa2', 0, 0.82, 0.062, 0.26, 0.26, 1, { sh: 0, mat: TWO });
  for (const s of [1, -1]) b.sph('#ff9ec7', s * 0.5, 0.06, 0.12, 0.05, 0.04, 0.05, { w: 4, h: 3 });
  b.sph('#7fdc6a', -0.42, 0.05, 0.1, 0.12, 0.05, 0.08, { w: 5, h: 3 }); b.sph('#ffe27a', 0.42, 0.05, 0.1, 0.1, 0.05, 0.08, { w: 5, h: 3 });
  for (const s of [1, -1]) b.sph(PA.butter, s * 0.34, 1.02, 0, 0.065, 0.06, 0.065, { w: 5, h: 3 });
  addParts(g, b);
  if (label) { const tex = textTex(label, '#fff8e6', '#7a4a2a'); if (tex) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); pl.position.set(0, 0.7, 0.062); g.add(pl); } }
  return finalize(g);
}
/** Pumpkin patch with a smiling pumpkin. */
export function pumpkinPatchModel() {
  const g = make(0.85, 1.1, 0.9, 0.18), b = new B(), R = rng(17);
  const pump = (x, z, r, col, face) => {
    const hc = [x, r * 0.9, z], hr = [r * 1.1, r * 0.9, r * 1.1];
    b.sph(col, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 6, h: 4, facet: true, fn: (lx, ly, lz) => (Math.floor((Math.atan2(lx, lz) + PI) / (PI / 3.5)) % 2 ? mixc(col, '#ffffff', 0.12) : null) });
    b.cyl('#7fcf5a', x, r * 1.75, z, r * 0.12, r * 0.4, { n: 4, rt: 0.8, open: true, sh: 0.05 });
    if (face) { for (const s of [1, -1]) { decal(b, GEO.disc(5), '#7a3a2a', hc, hr, s * 0.42, 0.18, r * 0.11, r * 0.13, 0.01); decal(b, GEO.disc(4), '#ffffff', hc, hr, s * 0.42, 0.18, r * 0.035, r * 0.035, 0.014, r * 0.03, r * 0.04); decal(b, GEO.disc(6), '#ff93b0', hc, hr, s * 0.8, -0.1, r * 0.11, r * 0.07, 0.01); } decal(b, smileGeo(), '#7a3a2a', hc, hr, 0, -0.3, r * 0.22, r * 0.22, 0.012); }
  };
  const mixc = (a, c, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(c), t).getHexString();
  pump(0, 0.1, 0.3, '#ffa23c', true); pump(0.55, 0.3, 0.2, '#ffb85a'); pump(-0.55, 0.2, 0.18, '#ffc06a'); pump(-0.2, -0.45, 0.16, '#ff9a4a'); pump(0.4, -0.35, 0.14, '#ffe27a');
  for (let i = 0; i < 2; i++) { const a = i * 0.8 + 0.4; rod(b, 0.3 * Math.cos(a), 0.04, 0.3 * Math.sin(a), 0.7 * Math.cos(a + 0.6), 0.05, 0.6 * Math.sin(a + 0.6), 0.012, '#7fcf5a'); }
  for (const [x, z, a] of [[0.5, 0.7, 0.3], [-0.6, 0.6, -0.4], [0.8, -0.1, 1.2]]) b.sph('#6fd860', x, 0.08, z, 0.15, 0.02, 0.11, { w: 5, h: 3, r: [0, a, 0] });
  b.sph('#ff9ec7', -0.8, 0.1, -0.3, 0.05, 0.04, 0.05, { w: 4, h: 3 }); b.sph('#ffffff', 0.85, 0.1, 0.4, 0.04, 0.035, 0.04, { w: 4, h: 3 });
  return finalize(addParts(g, b));
}
/** Straw bee skep on a little stand, with two bees circling (`bees`). */
export function beeSkepModel() {
  const g = make(0.55, 1, 1, 0.18), b = new B();
  const prof = []; for (let i = 0; i <= 8; i++) { const u = i / 8, y = u * 0.62, r = Math.sqrt(Math.max(0.0, 1 - u * u)) * 0.36 * (1 + 0.07 * Math.sin(i * PI)); prof.push([Math.max(0.001, r), y]); }
  b.put(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 8), '#ffd870', 0, 0.3, 0, 1, 1, 1, { sh: 0.12, facet: true, fn: (x, y) => (Math.floor(y * 8) % 2 ? '#ffc24a' : null) });
  b.sph('#b86f4a', 0, 0.4, 0.34, 0.08, 0.1, 0.03, { w: 5, h: 3, sh: 0 }); b.sph('#ffb23c', 0, 0.95, 0, 0.045, 0.045, 0.045, { w: 5, h: 3 });
  b.box(PA.sky, 0, 0.22, 0, 0.7, 0.08, 0.7, { sh: 0.1 }); for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.box(PA.skyD, x * 0.28, 0.11, z * 0.28, 0.07, 0.22, 0.07, { sh: 0.1 });
  b.sph('#ff9ec7', 0.45, 0.05, 0.4, 0.04, 0.04, 0.04, { w: 4, h: 3 }); b.sph('#7fdc6a', 0.45, 0.03, 0.4, 0.1, 0.04, 0.07, { w: 5, h: 3 });
  addParts(g, b);
  const bees = new THREE.Group(); bees.name = 'bees'; g.add(bees);
  for (let i = 0; i < 2; i++) {
    const bb = new B(); bb.sph('#ffe35a', 0, 0, 0, 0.045, 0.04, 0.055, { w: 5, h: 4, sh: 0.05 }); bb.sph('#9a6a4a', 0, 0.002, -0.025, 0.046, 0.041, 0.016, { w: 5, h: 3, sh: 0 });
    bb.put(GEO.circle(5), '#e8f6ff', 0.0, 0.04, -0.01, 0.045, 1, 0.03, { mat: TWO, sh: 0, r: [0, 0, 0.25] });
    const m = new THREE.Group(); m.position.set(Math.cos(i * PI) * 0.5, 0.9 + i * 0.12, Math.sin(i * PI) * 0.5); m.rotation.y = i * PI; addParts(m, bb); bees.add(m);
  }
  return finalize(g);
}

export const PROPS = { crate: crateModel, barrel: barrelModel, sack: sackModel, hayBale: hayBaleModel, logPile: logPileModel, plankStack: plankStackModel, stonePile: stonePileModel, brickStack: brickStackModel, cart: cartModel, well: wellModel, bench: benchModel, signpost: signpostModel, scarecrow: scarecrowModel, lampPost: lampPostModel, tent: tentModel, campfire: campfireModel, beehive: beehiveModel, fence: fenceModel, bannerPole: bannerPoleModel, mailbox: mailboxModel, chest: chestModel, coinPile: coinPileModel, scroll: scrollModel, lanternString: lanternStringModel, flowerPot: flowerPotModel,
  buntingLine: buntingLineModel, kite: kiteModel, windchime: windchimeModel, hammock: hammockModel, picnic: picnicModel, swing: swingModel, flowerCart: flowerCartModel, birdBath: birdBathModel, signBoard: signBoardModel, pumpkinPatch: pumpkinPatchModel, beeSkep: beeSkepModel };

/** Optional helper: drive the standard animated parts (flag wave, flame flicker, wheel roll, chest lid, lantern glow, bunting flutter, chimes, swing seat, kite, hammock sway, bees, bird bath bird). Zero allocation after first call per object. */
export function animateProp(g, t, o) {
  const u = g.userData; if (u._ap === undefined) { u._ap = { flag: g.getObjectByName('flag'), flame: g.getObjectByName('flame'), lid: g.getObjectByName('lid'), bucket: g.getObjectByName('bucket'), lanterns: g.getObjectByName('lanterns'), flags: g.getObjectByName('flags'), chimes: g.getObjectByName('chimes'), seat: g.getObjectByName('seat'), kite: g.getObjectByName('kite'), sway: g.getObjectByName('sway'), bees: g.getObjectByName('bees'), bird: g.getObjectByName('bird') }; }
  const a = u._ap, ph = u.phase || 0;
  if (a.flag) { a.flag.rotation.y = Math.sin(t * 2.2 + ph) * 0.18; a.flag.rotation.z = Math.sin(t * 3.1 + ph) * 0.04; }
  if (a.flame) { const f = 1 + Math.sin(t * 17 + ph) * 0.08 + Math.sin(t * 29) * 0.06; a.flame.scale.set(1 / Math.sqrt(f), f, 1 / Math.sqrt(f)); a.flame.rotation.y = t * 1.5; }
  if (a.lid && o && o.open !== undefined) a.lid.rotation.x = -o.open * 1.9;
  if (a.bucket) a.bucket.position.y = Math.sin(t * 0.8 + ph) * 0.01;
  if (a.flags) { a.flags.rotation.x = Math.sin(t * 1.9 + ph) * 0.07 + Math.sin(t * 3.3 + ph) * 0.025; }
  if (a.chimes) { a.chimes.rotation.z = Math.sin(t * 1.3 + ph) * 0.06; a.chimes.rotation.x = Math.sin(t * 1.7 + ph * 2) * 0.07; }
  if (a.seat) a.seat.rotation.x = Math.sin(t * 1.5 + ph) * 0.4;
  if (a.kite) { a.kite.rotation.z = Math.sin(t * 1.4 + ph) * 0.1; a.kite.rotation.x = Math.sin(t * 1.1 + ph) * 0.06; if (a.ky === undefined) a.ky = a.kite.position.y; a.kite.position.y = a.ky + Math.sin(t * 1.8 + ph) * 0.05; }
  if (a.sway) { a.sway.rotation.x = Math.sin(t * 0.9 + ph) * 0.06; }
  if (a.bees) { a.bees.rotation.y = t * 1.2 + ph; a.bees.position.y = Math.sin(t * 5 + ph) * 0.02; }
  if (a.bird) { if (a.by === undefined) a.by = a.bird.position.y; const h = Math.max(0, Math.sin(t * 2.2 + ph)); a.bird.position.y = a.by + h * h * 0.04; a.bird.rotation.y = Math.sin(t * 0.7 + ph) * 0.4; }
}
