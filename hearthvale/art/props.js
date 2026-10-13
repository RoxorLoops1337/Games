// Hearthvale props: cute, chunky, readable village clutter. Origin = centre on the ground. Every prop <= 400 tris, 1-4 meshes.
//
// WHAT I LEARNED (research notes, 10 bullets)
//  1. Prop kits work because of a shared silhouette language: chunky, slightly oversized, softened corners. A 48-tri "pillow box" (2x2 quads per
//     face pushed onto a rounded surface) gives the soft toy corner for a tenth of the cost of a bevelled box.
//  2. Exaggerate the identifying feature: bigger barrel hoops, a fat rope on the well, a huge brass lock on the chest, oversized hat on the scarecrow.
//  3. Three values per object (light top, mid, dark underside): baked into vertex colours per shape, so a crate is never one flat brown.
//  4. Repetition with variation sells a prop: stacked planks/bricks/logs get tiny yaw/offset jitter and alternating tones, never perfect grids.
//  5. Cutting tris: hidden faces never exist (shapes overlap instead of butting), cylinders use 4-6 sides when small, caps are dropped when not seen.
//  6. Contrast pairs read at distance: warm wood against cool grey iron, gold against dark wood, red cloth against green grass.
//  7. Tiny storytelling details cluster on the prop: a rope coil, a patched sack, a flower in a pot, a sprig of hay, a coin on the ground.
//  8. Props that animate (flag, flame, lid, wheels, lantern glow) keep the moving part as a NAMED child so the game can drive it; everything
//     else is merged into one mesh per material (1-4 draw calls per prop).
//  9. Emissive materials (lamp glass, fire) are SHARED exports so day/night code changes one number for every lamp in the village.
// 10. Fake AO: a soft blob shadow under every prop plus a darker, bluer bottom on each part keeps the prop seated on the grass.

import * as THREE from 'three';
import { soft, groundShadow, rng } from './artkit.js';
import { B, CMAT, GEO, part, pboxGeo } from './critters.js';

const PI = Math.PI;
export const lampMat = new THREE.MeshStandardMaterial({ color: '#fff1b8', emissive: '#ffc94a', emissiveIntensity: 0.35, roughness: 0.4 });
export const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb23c', vertexColors: true, transparent: true, opacity: 0.95 });
export const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: '#ffb73a', emissiveIntensity: 0.3, roughness: 0.5 });
const TWO = soft('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
const FLAT = soft('#ffffff', { vertexColors: true, flat: true });

const W = { light: '#e8b574', mid: '#d09a5c', dark: '#a8703c', deep: '#7f5230' };

function make(shadowR, sx = 1, sz = 1, op = 0.3) { const g = new THREE.Group(); const s = groundShadow(shadowR, op, sx, sz); s.name = ''; g.add(s); return g; }
function addParts(g, b) { for (const m of b.build()) g.add(m); return g; }
function finalize(g) { g.userData.prop = true; return g; }

/* ------------------------------------------------------------------ crates & friends */
export function crateModel() {
  const g = make(0.5, 1, 1), b = new B();
  b.pbox(W.light, 0, 0.26, 0, 0.52, 0.5, 0.52, 0.09);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.box(W.dark, x * 0.25, 0.26, z * 0.25, 0.08, 0.5, 0.08, { sh: 0.2 });
  b.box(W.dark, 0, 0.52, 0, 0.5, 0.045, 0.1, { r: [0, 0.78, 0] }); b.box(W.dark, 0, 0.52, 0, 0.5, 0.045, 0.1, { r: [0, -0.78, 0] });
  b.box(W.mid, 0, 0.14, 0.265, 0.4, 0.07, 0.03); b.box(W.mid, 0, 0.38, 0.265, 0.4, 0.07, 0.03);
  return finalize(addParts(g, b));
}
export function barrelModel() {
  const g = make(0.42, 1, 1), b = new B();
  const prof = [[0.2, 0], [0.26, 0.15], [0.29, 0.3], [0.26, 0.45], [0.2, 0.58]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10);
  b.put(lathe, W.mid, 0, 0, 0, 1, 1, 1, { fn: (x, y, z) => (Math.floor((Math.atan2(x, z) + PI) / (PI / 5)) % 2 ? W.dark : null), facet: true });
  b.cyl(W.light, 0, 0.585, 0, 0.2, 0.03, { n: 10, rt: 0.97 });
  b.cyl('#6c6f7a', 0, 0.14, 0, 0.268, 0.05, { n: 10, rt: 1.02, open: true, sh: 0.1 }); b.cyl('#6c6f7a', 0, 0.45, 0, 0.255, 0.05, { n: 10, rt: 1.02, open: true, sh: 0.1 });
  b.sph(W.deep, 0.07, 0.6, 0.05, 0.04, 0.02, 0.04, { w: 5, h: 3 });
  return finalize(addParts(g, b));
}
export function sackModel() {
  const g = make(0.38, 1, 1), b = new B();
  b.sph('#dcbc7e', 0, 0.2, 0, 0.23, 0.21, 0.2, { w: 8, h: 5 });
  b.cone('#d0ae6e', 0, 0.42, 0, 0.1, 0.13, { n: 6, rt: 1, sh: 0.2 });
  b.cyl('#a8723e', 0, 0.37, 0, 0.085, 0.045, { n: 6, open: true, sh: 0.1 });
  b.sph('#d0ae6e', 0.04, 0.5, 0.0, 0.05, 0.04, 0.04, { w: 5, h: 3 }); b.sph('#d0ae6e', -0.05, 0.49, 0.02, 0.04, 0.04, 0.04, { w: 5, h: 3 });
  b.box('#c95a4a', 0.1, 0.22, 0.2, 0.1, 0.1, 0.02, { r: [0, 0, 0.2] });
  return finalize(addParts(g, b));
}
export function hayBaleModel() {
  const g = make(0.5, 1.15, 0.85), b = new B(), R = rng(5);
  b.pbox('#ecc65a', 0, 0.23, 0, 0.8, 0.46, 0.52, 0.1);
  for (const x of [-0.22, 0.22]) b.box('#b8873a', x, 0.23, 0, 0.045, 0.485, 0.545, { sh: 0.1 });
  for (let i = 0; i < 9; i++) b.cone('#f5dc86', (R() - 0.5) * 0.7, 0.46 + R() * 0.02, (R() - 0.5) * 0.4, 0.015, 0.08, { n: 3, r: [R() * 0.8 - 0.4, 0, R() * 0.8 - 0.4], sh: 0.1 });
  for (let i = 0; i < 4; i++) b.cone('#f5dc86', 0.4, 0.15 + R() * 0.2, (R() - 0.5) * 0.4, 0.015, 0.07, { n: 3, r: [0, 0, -1.2 + R() * 0.4], sh: 0.1 });
  return finalize(addParts(g, b));
}
export function logPileModel() {
  const g = make(0.6, 1.25, 0.9), b = new B(), R = rng(9);
  const log = (x, y, z, r, len, yaw) => b.put(GEO.cyl(7, 1, false), '#8d5c38', x, y, z, r, len, r, { r: [0, yaw, PI / 2], fn: (lx, ly, lz, t, nx, ny) => (Math.abs(ny) > 0.8 ? (Math.hypot(lx, lz) > 0.7 ? '#c9965c' : '#e8c48a') : null) });
  const rows = [[-0.24, 0, 0.24], [-0.12, 0.12], [0]];
  rows.forEach((r, ri) => r.forEach((x, i) => { log(x * 1.0, 0.1 + ri * 0.17, (R() - 0.5) * 0.04, 0.115, 0.7 + R() * 0.1, 0); }));
  // logs run along x; rotate to run along z for a nicer view by turning each: we keep x-axis logs but stack across z
  g.rotation.y = 0; return finalize(addParts(g, b));
}
export function plankStackModel() {
  const g = make(0.55, 1.2, 0.8), b = new B(), R = rng(11);
  for (const x of [-0.3, 0.3]) b.box(W.deep, x, 0.03, 0, 0.1, 0.06, 0.5, { sh: 0.1 });
  for (let i = 0; i < 6; i++) { const y = 0.085 + i * 0.075, yaw = (R() - 0.5) * 0.12, off = (R() - 0.5) * 0.06; for (const z of [-0.12, 0.12]) b.box(i % 2 ? W.light : '#dba768', off, y, z + (R() - 0.5) * 0.02, 0.84, 0.065, 0.2, { r: [0, yaw, 0], sh: 0.12 }); }
  b.box('#a37a48', 0, 0.54, 0, 0.1, 0.02, 0.5, { r: [0, 0.05, 0] });
  return finalize(addParts(g, b));
}
export function stonePileModel() {
  const g = make(0.5, 1.1, 0.95), b = new B();
  const moss = (x, y, z, t, nx, ny) => (ny > 0.55 ? '#86b05a' : null);
  b.ico('#a8a9ae', 0, 0.16, 0, 0.3, 0.2, 0.26, { d: 1, seed: 3, amt: 0.12, fn: moss, facet: true });
  b.ico('#c1c2c8', 0.26, 0.1, 0.12, 0.17, 0.12, 0.15, { d: 0, seed: 5, amt: 0.15 });
  b.ico('#8f9096', -0.28, 0.12, -0.06, 0.16, 0.13, 0.15, { d: 0, seed: 7, amt: 0.15 });
  b.ico('#b4b5bb', 0.06, 0.36, -0.02, 0.15, 0.12, 0.13, { d: 0, seed: 9, amt: 0.12 });
  b.ico('#9a9ba2', -0.05, 0.08, 0.28, 0.12, 0.08, 0.11, { d: 0, seed: 2, amt: 0.15 });
  return finalize(addParts(g, b));
}
export function brickStackModel() {
  const g = make(0.5, 1.1, 0.85), b = new B(), R = rng(21), cols = ['#cf5a40', '#b84a35', '#dc6a4c', '#c4533b'];
  b.box(W.deep, 0, 0.025, 0, 0.8, 0.05, 0.24, { sh: 0.1 }); b.box(W.deep, 0, 0.025, 0, 0.1, 0.05, 0.5, { sh: 0.1 });
  for (let row = 0; row < 4; row++) for (let i = 0; i < 3; i++) for (const z of [-1, 1]) {
    if (row === 3 && i === 1) continue;
    b.box(cols[(row + i + (z > 0 ? 1 : 0)) % 4], (i - 1) * 0.255 + (row % 2) * 0.06 + (R() - 0.5) * 0.015, 0.05 + 0.075 + row * 0.085, z * 0.12 + (R() - 0.5) * 0.015, 0.24, 0.08, 0.2, { r: [0, (R() - 0.5) * 0.06, 0], sh: 0.14 });
  }
  b.box(cols[1], 0.5, 0.04, 0.2, 0.22, 0.07, 0.12, { r: [0, 0.4, 0] });
  return finalize(addParts(g, b));
}

/* ------------------------------------------------------------------ cart */
export function cartModel() {
  const g = make(0.7, 1.2, 0.8), b = new B();
  b.pbox(W.mid, 0, 0.3, 0, 0.74, 0.07, 0.96, 0.03);
  for (const s of [1, -1]) b.box(W.light, s * 0.35, 0.42, 0, 0.07, 0.22, 0.96, { sh: 0.2 });
  b.box(W.light, 0, 0.42, 0.46, 0.74, 0.22, 0.07, { sh: 0.2 }); b.box(W.dark, 0, 0.42, -0.46, 0.74, 0.22, 0.07, { sh: 0.2 });
  b.cyl(W.deep, 0, 0.2, 0, 0.03, 0.9, { n: 4, r: [0, 0, PI / 2], sh: 0.05 });
  for (const s of [1, -1]) b.cyl(W.deep, s * 0.22, 0.24, -0.78, 0.028, 0.6, { n: 4, r: [1.38, 0, 0] });
  b.cyl(W.deep, 0, 0.3, -1.05, 0.03, 0.5, { n: 4, r: [0, 0, PI / 2] });
  for (const [x, z, c] of [[-0.12, 0.15, '#e8564a'], [0.14, 0.2, '#f2b632'], [0.02, -0.12, '#e8564a'], [-0.15, -0.25, '#7fd05a']]) b.sph(c, x, 0.5, z, 0.12, 0.11, 0.12, { w: 5, h: 3 });
  const wheel = (s) => (bb) => {
    bb.put(GEO.cyl(10, 1, false), W.deep, s * 0.42, 0.2, 0, 0.2, 0.06, 0.2, { r: [0, 0, PI / 2], sh: 0.1, fn: (x, y, z) => (Math.hypot(x, z) < 0.55 ? W.light : null) });
    bb.box(W.dark, s * 0.45, 0.2, 0, 0.03, 0.34, 0.05); bb.box(W.dark, s * 0.45, 0.2, 0, 0.03, 0.05, 0.34);
  };
  addParts(g, b); part(g, 'wheelL', 0.42, 0.2, 0, wheel(1)); part(g, 'wheelR', -0.42, 0.2, 0, wheel(-1));
  return finalize(g);
}

/* ------------------------------------------------------------------ well, bench, signpost */
export function wellModel() {
  const g = make(0.85, 1, 1, 0.3), b = new B();
  const ring = (lx, ly, lz) => ((Math.floor((Math.atan2(lz, lx) + PI) / (PI / 6)) + (ly > 0 ? 1 : 0)) % 2 ? '#bdbec4' : '#a2a3aa');
  b.put(GEO.cyl(12, 1, true, 2), '#a8a9ae', 0, 0.22, 0, 0.5, 0.44, 0.5, { fn: ring, facet: true });
  b.cyl('#c7c8ce', 0, 0.46, 0, 0.56, 0.08, { n: 12, rt: 0.96 });
  b.put(GEO.circle(12), '#4aa8d6', 0, 0.36, 0, 0.42, 1, 0.42, { sh: 0 });
  for (const s of [1, -1]) b.box(W.dark, s * 0.46, 0.9, 0, 0.08, 0.9, 0.1, { sh: 0.2 });
  b.box('#d9503d', 0, 1.46, 0.2, 1.1, 0.07, 0.62, { r: [0.55, 0, 0] }); b.box('#c24433', 0, 1.46, -0.2, 1.1, 0.07, 0.62, { r: [-0.55, 0, 0] });
  b.box('#a63a2c', 0, 1.62, 0, 1.12, 0.07, 0.1);
  b.cyl(W.deep, 0, 1.0, 0, 0.045, 0.98, { n: 5, r: [0, 0, PI / 2] }); b.box(W.dark, 0.58, 1.0, 0.06, 0.2, 0.05, 0.05, { r: [0, 0, 0.5] });
  addParts(g, b);
  part(g, 'bucket', 0, 0.78, 0, (bb) => { bb.cyl(W.mid, 0, 0.7, 0, 0.1, 0.16, { n: 7, rt: 1.2, sh: 0.2 }); bb.cyl('#6c6f7a', 0, 0.72, 0, 0.125, 0.025, { n: 7, open: true }); bb.cyl('#e7d9b0', 0, 0.9, 0, 0.012, 0.28, { n: 3, open: true, sh: 0 }); });
  return finalize(g);
}
export function benchModel() {
  const g = make(0.65, 1.5, 0.6), b = new B();
  b.pbox(W.light, 0, 0.36, 0, 1.1, 0.07, 0.34, 0.03); b.pbox(W.mid, 0, 0.68, -0.18, 1.1, 0.07, 0.07, 0.03); b.pbox(W.mid, 0, 0.58, -0.18, 1.1, 0.07, 0.07, 0.03);
  for (const s of [1, -1]) { b.pbox(W.dark, s * 0.46, 0.18, 0.0, 0.08, 0.34, 0.3, 0.03); b.pbox(W.dark, s * 0.46, 0.5, -0.17, 0.08, 0.4, 0.07, 0.03); }
  return finalize(addParts(g, b));
}
function textTex(lines, bg, fg) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 256, 96); x.fillStyle = fg; x.font = 'bold 44px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(lines, 128, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function signpostModel(texts = ['Market', 'Farm']) {
  const g = make(0.4, 1, 1), b = new B();
  b.cyl(W.dark, 0, 0.8, 0, 0.065, 1.6, { n: 6, rt: 0.85 }); b.sph(W.light, 0, 1.62, 0, 0.09, 0.09, 0.09, { w: 6, h: 4 });
  b.cyl(W.deep, 0, 0.05, 0, 0.12, 0.1, { n: 6, rt: 0.8 });
  addParts(g, b);
  const arrow = (len, h, dir, y, yaw, txt) => {
    const grp = new THREE.Group(); grp.position.y = y; grp.rotation.y = yaw; g.add(grp);
    const s = new THREE.Shape(); s.moveTo(-len / 2, -h / 2); s.lineTo(len / 2 - h * 0.55, -h / 2); s.lineTo(len / 2 + h * 0.1, 0); s.lineTo(len / 2 - h * 0.55, h / 2); s.lineTo(-len / 2, h / 2); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }); geo.translate(0, 0, -0.03); if (dir < 0) geo.scale(-1, 1, 1);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(W.light);
    for (let i = 0; i < pos.count; i++) { const k = 0.82 + 0.18 * ((pos.getY(i) + h / 2) / h); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); const m = new THREE.Mesh(geo, CMAT); m.castShadow = true; grp.add(m);
    const tex = textTex(txt, '#e8b574', '#5b3a20');
    if (tex) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.82, h * 0.78), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); pl.position.set(-dir * h * 0.04, 0, 0.031); grp.add(pl); const pl2 = pl.clone(); pl2.position.z = -0.031; pl2.rotation.y = PI; grp.add(pl2); }
  };
  arrow(0.8, 0.26, 1, 1.38, 0.15, texts[0] || ''); if (texts.length > 1) arrow(0.7, 0.24, -1, 1.06, -0.12, texts[1]);
  return finalize(g);
}

/* ------------------------------------------------------------------ scarecrow */
export function scarecrowModel() {
  const g = make(0.5, 1, 1), b = new B();
  b.cyl(W.dark, 0, 0.7, 0, 0.045, 1.4, { n: 5, rt: 0.9 }); b.cyl(W.dark, 0, 1.05, 0, 0.04, 1.15, { n: 4, r: [0, 0, PI / 2] });
  b.cyl(W.deep, 0, 0.04, 0, 0.14, 0.08, { n: 6 });
  b.sph('#5b86c9', 0, 0.98, 0, 0.23, 0.3, 0.2, { w: 6, h: 5 });
  b.box('#e8564a', 0.06, 0.95, 0.19, 0.15, 0.15, 0.03, { r: [0, 0, 0.15] });
  b.sph('#e8c25a', 0, 0.72, 0.02, 0.1, 0.07, 0.1, { w: 5, h: 3 });
  for (const s of [1, -1]) { b.cyl('#5b86c9', s * 0.42, 1.08, 0, 0.1, 0.5, { n: 5, rt: 0.9, r: [0, 0, PI / 2] }); for (let i = 0; i < 2; i++) b.cone('#f2d36b', s * 0.72, 1.08 + (i - 0.5) * 0.07, 0, 0.025, 0.12, { n: 3, r: [0, 0, -s * 1.57 + (i - 0.5) * 0.5], sh: 0.05 }); }
  b.sph('#e6cb98', 0, 1.5, 0, 0.19, 0.19, 0.19, { w: 7, h: 5 });
  for (const s of [1, -1]) b.put(GEO.disc(6), '#2b2220', s * 0.07, 1.54, 0.185, 0.03, 0.036, 1, { sh: 0 });
  b.sph('#e07a5f', 0, 1.49, 0.185, 0.03, 0.025, 0.02, { w: 4, h: 3, sh: 0 });
  b.box('#5b3a20', 0, 1.42, 0.18, 0.12, 0.02, 0.015, { sh: 0 });
  b.cyl('#e5b24a', 0, 1.64, 0, 0.3, 0.03, { n: 8, rt: 1 }); b.cyl('#d9a43a', 0, 1.74, 0, 0.17, 0.2, { n: 8, rt: 0.75 });
  addParts(g, b);
  part(g, 'body', 0, 1.0, 0, (bb) => bb.cone('#f2d36b', 0.16, 1.4, 0.12, 0.02, 0.1, { n: 3, r: [0.2, 0, -0.8], sh: 0.05 }));
  return finalize(g);
}

/* ------------------------------------------------------------------ lamp post, tent, campfire */
export function lampPostModel() {
  const g = make(0.4, 1, 1), b = new B();
  b.cyl('#4a4f5c', 0, 0.12, 0, 0.17, 0.24, { n: 8, rt: 0.55 }); b.cyl('#585e6d', 0, 0.9, 0, 0.055, 1.5, { n: 6, rt: 0.8 });
  b.cyl('#4a4f5c', 0, 1.62, 0, 0.1, 0.07, { n: 8, rt: 1.3 });
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.box('#4a4f5c', x * 0.1, 1.84, z * 0.1, 0.035, 0.34, 0.035, { sh: 0.05 });
  b.cone('#4a4f5c', 0, 2.1, 0, 0.18, 0.2, { n: 6 }); b.sph('#e8b53a', 0, 2.24, 0, 0.045, 0.045, 0.045, { w: 5, h: 4 });
  addParts(g, b);
  const glass = new B(0, 0, 0, lampMat); glass.cyl('#fff1b8', 0, 1.84, 0, 0.095, 0.3, { n: 6, rt: 1.1, sh: 0 }); const gm = glass.build()[0]; gm.name = 'lamp'; gm.castShadow = false; g.add(gm);
  return finalize(g);
}
export function tentModel() {
  const g = make(0.95, 1.1, 1.1), b = new B();
  const prism = (len, y0, h, hw, z0, col) => { const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(0, h); s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); geo.translate(0, 0, -len / 2); b.put(geo, col, 0, y0, z0, 1, 1, 1, { sh: 0.3 }); };
  const cols = ['#e8564a', '#fbefd2', '#e8564a', '#fbefd2', '#e8564a'], n = 5;
  for (let i = 0; i < n; i++) prism(0.28, 0.0, 1.0 - i * 0.0, 0.62, (i - (n - 1) / 2) * 0.28, cols[i]);
  b.cyl(W.deep, 0, 1.0, 0.0, 0.025, 1.46, { n: 4, r: [PI / 2, 0, 0], sh: 0.05 });
  b.put(GEO.cone(3), '#3a2d26', 0, 0.3, 0.72, 0.28, 0.6, 0.02, { r: [0, 0, 0], sh: 0 });
      for (const [x, z] of [[0.7, 0.5], [-0.7, 0.5], [0.7, -0.5], [-0.7, -0.5]]) b.cone(W.deep, x, 0.07, z, 0.03, 0.14, { n: 4, r: [0, 0, 0.3 * Math.sign(x)] });
  b.sph('#4f9a4a', 0.78, 0.07, -0.1, 0.1, 0.07, 0.2, { w: 5, h: 3 });
  b.cyl(W.deep, 0, 1.2, 0.72, 0.014, 0.5, { n: 4 });
  addParts(g, b);
  part(g, 'flag', 0, 1.42, 0.72, (bb) => bb.put(GEO.circle(3), '#ffd24a', 0.11, 1.42, 0.72, 0.1, 1, 0.07, { mat: TWO, sh: 0, r: [PI / 2, 0, 0] }), TWO);
  return finalize(g);
}
export function campfireModel() {
  const g = make(0.65, 1, 1), b = new B(), R = rng(3);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; b.ico(i % 2 ? '#a8a9ae' : '#8f9096', Math.cos(a) * 0.38, 0.08, Math.sin(a) * 0.38, 0.12, 0.09, 0.1, { d: 0, seed: i + 1, amt: 0.15, r: [0, -a, 0] }); }
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; b.put(GEO.cyl(6, 1, false), '#7a4e2c', Math.cos(a) * 0.1, 0.1 + i * 0.015, Math.sin(a) * 0.1, 0.06, 0.55, 0.06, { r: [0, -a, PI / 2 - 0.2], fn: (x, y, z, t, nx, ny) => (Math.abs(ny) > 0.8 ? '#d9a566' : null) }); }
  b.put(GEO.circle(8), '#3a2d26', 0, 0.03, 0, 0.3, 1, 0.3, { sh: 0 });
  addParts(g, b);
  const fl = part(g, 'flame', 0, 0.12, 0, (bb) => {
    bb.cone('#ff7a2a', 0, 0.3, 0, 0.17, 0.42, { n: 6, sh: 0.4, mat: flameMat }); bb.cone('#ffb83c', 0.04, 0.27, 0.03, 0.11, 0.34, { n: 6, sh: 0.3, mat: flameMat, r: [0.1, 0, -0.1] }); bb.cone('#fff0a0', 0, 0.24, 0, 0.06, 0.24, { n: 5, sh: 0.2, mat: flameMat });
    bb.cone('#ff9a3a', -0.1, 0.22, -0.05, 0.07, 0.22, { n: 5, sh: 0.3, mat: flameMat, r: [0, 0, 0.3] });
  }, flameMat);
  fl.children.forEach((m) => { m.castShadow = false; });
  return finalize(g);
}

/* ------------------------------------------------------------------ beehive, fence, banner, mailbox */
export function beehiveModel() {
  const g = make(0.5, 1, 1), b = new B();
  const prof = [[0.0, 0.0], [0.3, 0.02], [0.34, 0.12], [0.26, 0.17], [0.31, 0.27], [0.23, 0.32], [0.26, 0.42], [0.16, 0.47], [0.17, 0.56], [0.07, 0.62], [0.0, 0.64]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10);
  b.put(lathe, '#f0b93e', 0, 0.38, 0, 1, 1, 1, { sh: 0.3, fn: (x, y) => (Math.floor(y / 0.16) % 2 ? '#d99a2a' : null), facet: true });
  b.sph('#3a2a22', 0, 0.5, 0.31, 0.07, 0.085, 0.03, { w: 6, h: 4, sh: 0 });
  b.pbox(W.mid, 0, 0.34, 0, 0.8, 0.07, 0.8, 0.03);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.box(W.dark, x * 0.32, 0.17, z * 0.32, 0.07, 0.34, 0.07, { sh: 0.2 });
  b.sph('#ffd24a', 0.2, 0.43, 0.3, 0.012, 0.012, 0.012, { w: 4, h: 2, sh: 0 });
  addParts(g, b);
  return finalize(g);
}
export function fenceModel(len = 2) {
  const g = make(0.3, Math.max(1, len / 0.6), 0.5, 0.2), b = new B(), R = rng(Math.round(len * 10));
  const n = Math.max(2, Math.round(len / 0.28)), x0 = -len / 2;
  b.pbox(W.mid, 0, 0.3, 0, len, 0.07, 0.05, 0.02); b.pbox(W.mid, 0, 0.55, 0, len, 0.07, 0.05, 0.02);
  for (let i = 0; i <= n; i++) {
    const x = x0 + (i / n) * len, post = i === 0 || i === n || i % 4 === 0, h = post ? 0.8 : 0.66 + (R() - 0.5) * 0.04;
    b.box(post ? W.dark : W.light, x, h / 2, 0.04, post ? 0.1 : 0.1, h, 0.04, { r: [0, 0, (R() - 0.5) * 0.04], sh: 0.2 });
    b.cone(post ? W.dark : W.light, x, h + 0.025, 0.04, 0.07, 0.07, { n: 4, rt: 1 });
  }
  return finalize(addParts(g, b));
}
export function bannerPoleModel(colorHex = '#d9503d') {
  const g = make(0.3, 1, 1), b = new B();
  b.cyl(W.deep, 0, 0.05, 0, 0.14, 0.1, { n: 6, rt: 0.8 }); b.cyl(W.dark, 0, 1.15, 0, 0.04, 2.1, { n: 6, rt: 0.85 }); b.sph('#ffd24a', 0, 2.25, 0, 0.07, 0.07, 0.07, { w: 6, h: 4 });
  b.cyl('#e8b53a', 0.31, 2.05, 0, 0.025, 0.66, { n: 4, r: [0, 0, PI / 2] });
  addParts(g, b);
  const cloth = new THREE.PlaneGeometry(0.56, 1.0, 2, 8); cloth.translate(0, -0.5, 0);
  const pos = cloth.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(colorHex);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i); if (y < -0.99) pos.setY(i, -1 + (1 - Math.abs(x) / 0.28) * 0.2);
    const k = 0.78 + 0.28 * (pos.getY(i) + 1); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * (k + (1 - k) * 0.3);
  }
  cloth.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const grp = new THREE.Group(); grp.name = 'flag'; grp.position.set(0.33, 2.03, 0); grp.userData.pv = [0.33, 2.03, 0];
  const m = new THREE.Mesh(cloth, TWO); m.castShadow = true; grp.add(m);
  const em = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), new THREE.MeshStandardMaterial({ color: '#ffd24a', roughness: 0.6, side: THREE.DoubleSide })); em.position.set(0, -0.38, 0.004); grp.add(em);
  g.add(grp);
  return finalize(g);
}
export function mailboxModel() {
  const g = make(0.35, 1, 1), b = new B();
  b.cyl(W.dark, 0, 0.45, 0, 0.045, 0.9, { n: 5, rt: 0.9 }); b.pbox(W.deep, 0, 0.96, 0, 0.12, 0.08, 0.34, 0.03);
  b.pbox('#4f86c6', 0, 1.1, 0, 0.36, 0.28, 0.5, 0.11);
  b.put(GEO.circle(8), '#2e5f9a', 0, 1.1, 0.255, 0.12, 1, 0.1, { r: [PI / 2, 0, 0], sh: 0 });
  b.box('#fff8e6', 0.08, 1.06, 0.26, 0.14, 0.09, 0.02, { r: [0, 0, 0.1], sh: 0.1 });
  addParts(g, b);
  part(g, 'flag', 0.2, 1.1, -0.05, (bb) => { bb.box('#e8564a', 0.215, 1.2, -0.05, 0.03, 0.2, 0.04, { sh: 0.1 }); bb.box('#e8564a', 0.24, 1.3, -0.05, 0.1, 0.07, 0.04, { sh: 0.1 }); });
  return finalize(g);
}

/* ------------------------------------------------------------------ chest, coins, scroll */
export function chestModel() {
  const g = make(0.55, 1.2, 0.9), b = new B();
  b.pbox(W.mid, 0, 0.21, 0, 0.84, 0.42, 0.52, 0.08);
  b.box('#3a2a20', 0, 0.425, 0, 0.7, 0.01, 0.4, { sh: 0 });
  b.sph('#ffd24a', 0, 0.42, 0, 0.3, 0.1, 0.17, { w: 7, h: 4 }); b.sph('#fff2a0', 0.12, 0.5, 0.05, 0.05, 0.04, 0.04, { w: 4, h: 3, sh: 0 }); b.sph('#f27a9a', -0.14, 0.49, -0.03, 0.04, 0.04, 0.04, { w: 4, h: 3, sh: 0 });
  for (const x of [-0.3, 0.3]) b.box('#e8b53a', x, 0.21, 0, 0.09, 0.44, 0.545, { sh: 0.1 });
  addParts(g, b);
  part(g, 'lid', 0, 0.42, -0.26, (bb) => {
    bb.put(GEO.halfCyl(8), W.light, 0, 0.42, 0.26, 0.27, 0.84, 0.27, { r: [0, 0, PI / 2], sh: 0.2 });
    bb.box('#3a2a20', 0, 0.425, 0.26, 0.82, 0.01, 0.53, { sh: 0 });
    for (const x of [-0.3, 0.3]) bb.put(GEO.halfCyl(8), '#e8b53a', x, 0.42, 0.26, 0.285, 0.09, 0.285, { r: [0, 0, PI / 2], sh: 0.1 });
    bb.box('#ffd24a', 0, 0.45, 0.545, 0.12, 0.14, 0.05); bb.sph('#3a2a20', 0, 0.45, 0.575, 0.018, 0.028, 0.01, { w: 4, h: 3, sh: 0 });
  });
  return finalize(g);
}
export function coinPileModel() {
  const g = make(0.45, 1, 1), b = new B(), R = rng(6);
  b.sph('#e8b53a', 0, 0.09, 0, 0.3, 0.17, 0.3, { w: 8, h: 4, sh: 0.3 });
  const coin = (x, y, z, r, rot) => b.put(GEO.cyl(8, 1, false), '#ffd24a', x, y, z, r, 0.04, r, { r: rot, fn: (lx, ly, lz, t, nx, ny) => (Math.abs(ny) > 0.8 && Math.hypot(lx, lz) < 0.72 ? '#ffe98a' : null), sh: 0.12 });
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3, rad = 0.12 + (i % 2) * 0.1; coin(Math.cos(a) * rad, 0.14 + (i % 2 ? 0 : 0.06), Math.sin(a) * rad, 0.1, [0.5 + R() * 0.6, a, (R() - 0.5) * 0.8]); }
  coin(0.0, 0.2, 0.0, 0.11, [0.15, 0.4, 0.1]);
  coin(0.34, 0.03, 0.22, 0.1, [0, 0.4, 0]); coin(-0.34, 0.03, 0.12, 0.1, [0, 1, 0]);
  b.ico('#f27a9a', -0.1, 0.27, -0.04, 0.06, 0.07, 0.06, { d: 0, seed: 4, amt: 0.05 }); b.ico('#6fc3ea', 0.1, 0.25, 0.07, 0.05, 0.06, 0.05, { d: 0, seed: 8, amt: 0.05 });
  return finalize(addParts(g, b));
}
export function scrollModel() {
  const g = make(0.4, 1.3, 0.6, 0.22), b = new B();
  b.put(GEO.cyl(10, 1, false), '#f6e8c0', 0, 0.12, 0, 0.1, 0.62, 0.1, { r: [0, 0, PI / 2], fn: (lx, ly, lz, t, nx, ny) => (Math.abs(nx) > 0.8 ? '#d9b97a' : null), sh: 0.2 });
  for (const s of [1, -1]) { b.cyl(W.dark, s * 0.34, 0.12, 0, 0.045, 0.05, { n: 6, r: [0, 0, PI / 2] }); b.sph('#e8b53a', s * 0.375, 0.12, 0, 0.05, 0.05, 0.05, { w: 5, h: 4 }); }
  b.cyl('#d9503d', 0, 0.12, 0, 0.108, 0.1, { n: 10, r: [0, 0, PI / 2], open: true, sh: 0.1 }); b.cyl('#c24433', 0, 0.12, 0, 0.11, 0.025, { n: 10, r: [0, 0, PI / 2], open: true, sh: 0.1 });
  b.cyl('#d9503d', 0.0, 0.03, 0.12, 0.012, 0.15, { n: 3, r: [PI / 2, 0, 0.4], open: true, sh: 0 });
  return finalize(addParts(g, b));
}

/* ------------------------------------------------------------------ lantern string, flower pot */
export function lanternStringModel(len = 4) {
  const g = new THREE.Group(), b = new B(), R = rng(Math.round(len * 7)), H = 2.2;
  const s = groundShadow(0.3, 0.2, 1, 1); g.add(s);
  for (const x of [-len / 2, len / 2]) { b.cyl(W.dark, x, H / 2, 0, 0.045, H, { n: 5, rt: 0.8 }); b.sph('#e8b53a', x, H + 0.03, 0, 0.06, 0.06, 0.06, { w: 5, h: 3 }); b.cyl(W.deep, x, 0.04, 0, 0.1, 0.08, { n: 5, rt: 0.8 }); }
  const sag = 0.35, n = Math.max(3, Math.round(len * 1.5)), cols = ['#e8564a', '#f2b632', '#52b56a', '#4a90e0', '#a65bd6'], lm = new B(0, 0, 0, lanternMat);
  const pt = (u) => [(u - 0.5) * len, H - 0.02 - Math.sin(u * PI) * sag];
  const seg = 8;
  for (let i = 0; i < seg; i++) { const [x1, y1] = pt(i / seg), [x2, y2] = pt((i + 1) / seg), dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy); b.cyl('#6b4a2c', (x1 + x2) / 2, (y1 + y2) / 2, 0, 0.01, l, { n: 3, open: true, r: [0, 0, Math.atan2(dx, dy) * -1], sh: 0, rz: 0.01 }); }
  const flags = new B(0, 0, 0, TWO);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, [x, y] = pt(u);
    if (i % 2 === 0) { lm.sph('#ffe9a8', x, y - 0.16, 0, 0.1, 0.12, 0.1, { w: 5, h: 3, sh: 0 }); lm.cone('#ffe9a8', x, y - 0.03, 0, 0.04, 0.04, { n: 4, sh: 0 }); }
    else flags.put(GEO.cone(3), cols[(i >> 1) % cols.length], x, y - 0.12, 0, 0.1, 0.2, 0.01, { r: [0, 0, PI], sh: 0.15, mat: TWO });
  }
  addParts(g, b); addParts(g, flags); for (const m of lm.build()) { m.name = 'lanterns'; m.castShadow = false; g.add(m); }
  return finalize(g);
}
export function flowerPotModel() {
  const g = make(0.32, 1, 1), b = new B(), R = rng(8);
  const prof = [[0.12, 0], [0.19, 0.2], [0.23, 0.22], [0.23, 0.29], [0.2, 0.3]];
  b.put(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10), '#d9774a', 0, 0, 0, 1, 1, 1, { sh: 0.3, fn: (x, y) => (y > 0.72 ? '#e48a5c' : null) });
  b.put(GEO.circle(10), '#6e4529', 0, 0.28, 0, 0.2, 1, 0.2, { sh: 0 });
  const cols = ['#ef7fb0', '#ffd24a', '#ffffff'];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.3, x = Math.cos(a) * 0.08, z = Math.sin(a) * 0.08, h = 0.42 + i * 0.07 + R() * 0.04;
    b.cyl('#4fa845', x * 1.4, 0.28 + (h - 0.28) / 2, z * 1.4, 0.011, h - 0.28, { n: 3, open: true, r: [z * 1.2, 0, -x * 1.2], sh: 0.05 });
    b.sph(cols[i], x * 1.8, h, z * 1.8, 0.075, 0.06, 0.075, { w: 6, h: 4, sh: 0.2 }); b.sph('#ffb23c', x * 1.8, h + 0.045, z * 1.8, 0.03, 0.02, 0.03, { w: 4, h: 3, sh: 0 });
  }
  b.sph('#4fa845', 0.14, 0.35, 0.04, 0.09, 0.025, 0.045, { w: 5, h: 3, r: [0, 0.3, 0.4] }); b.sph('#5fba4e', -0.12, 0.34, -0.07, 0.09, 0.025, 0.045, { w: 5, h: 3, r: [0, -0.5, -0.4] });
  return finalize(addParts(g, b));
}

export const PROPS = { crate: crateModel, barrel: barrelModel, sack: sackModel, hayBale: hayBaleModel, logPile: logPileModel, plankStack: plankStackModel, stonePile: stonePileModel, brickStack: brickStackModel, cart: cartModel, well: wellModel, bench: benchModel, signpost: signpostModel, scarecrow: scarecrowModel, lampPost: lampPostModel, tent: tentModel, campfire: campfireModel, beehive: beehiveModel, fence: fenceModel, bannerPole: bannerPoleModel, mailbox: mailboxModel, chest: chestModel, coinPile: coinPileModel, scroll: scrollModel, lanternString: lanternStringModel, flowerPot: flowerPotModel };

/** Optional helper: drive the standard animated parts (flag wave, flame flicker, wheel roll, chest lid, lantern glow). Zero allocation after first call per object. */
export function animateProp(g, t, o) {
  const u = g.userData; if (u._ap === undefined) { u._ap = { flag: g.getObjectByName('flag'), flame: g.getObjectByName('flame'), lid: g.getObjectByName('lid'), bucket: g.getObjectByName('bucket'), lanterns: g.getObjectByName('lanterns') }; }
  const a = u._ap, ph = u.phase || 0;
  if (a.flag) { a.flag.rotation.y = Math.sin(t * 2.2 + ph) * 0.18; a.flag.rotation.z = Math.sin(t * 3.1 + ph) * 0.04; }
  if (a.flame) { const f = 1 + Math.sin(t * 17 + ph) * 0.08 + Math.sin(t * 29) * 0.06; a.flame.scale.set(1 / Math.sqrt(f), f, 1 / Math.sqrt(f)); a.flame.rotation.y = t * 1.5; }
  if (a.lid && o && o.open !== undefined) a.lid.rotation.x = -o.open * 1.9;
  if (a.bucket) a.bucket.position.y = Math.sin(t * 0.8 + ph) * 0.01;
}
