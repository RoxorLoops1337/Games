// Tree species for the park: oak (and autumn maple recolour), pine, cypress, cherry blossom, plus a cheap lollipop street tree for the far sidewalk.
// Every generator returns one painted, non-indexed geometry ready to be baked into the merged tree mesh.
import { THREE, rng, jitter, merged } from './kit.js';
import { xf, paintCanopy, paintSolid, blob } from './flora_common.js';

const OAK = { lo: '#3a8672', mid: '#4fae5a', hi: '#a8e060', glint: '#f0e468' };
const OAK2 = { lo: '#2f8a76', mid: '#5cb862', hi: '#b8e868', glint: '#f4ec78' };
const MAPLE = { lo: '#7a2f4e', mid: '#cf5f36', hi: '#f0a040', glint: '#ffd48a' };
const CHERRY = { lo: '#a8456f', mid: '#e4799c', hi: '#f7b6c8', glint: '#ffe0c4' };
const PINE = { lo: '#2c6064', mid: '#3a8a64', hi: '#6cb070', glint: '#b0d878' };
const STREET = { lo: '#4f6a78', mid: '#6b8c7e', hi: '#a4b88a', glint: '#d8c88a' };
const TRUNK = ['#4b3547', '#80604a'];

function trunkPiece(r, rb, rt, h, seg, x, y, z, rx, rz, bottom, top) {
  const g = new THREE.CylinderGeometry(rt, rb, h, 6, seg || 1); g.translate(0, h / 2, 0);
  const ng = jitter(g, rb * 0.25, r);
  return paintSolid(xf(ng, { x, y, z, rx: rx || 0, rz: rz || 0 }), bottom || TRUNK[0], top || TRUNK[1], r, 0.12);
}

// big round-canopy oak: forked faceted trunk, 4 to 5 jittered icosphere clusters. pal chooses green or autumn.
export function makeOak(seed, pal, scale) {
  const r = rng(seed), parts = []; pal = pal || OAK; scale = scale || 1;
  parts.push(trunkPiece(r, 0.42, 0.26, 2.1, 2, 0, 0, 0, 0.03, 0.02));
  parts.push(trunkPiece(r, 0.62, 0.42, 0.45, 1, 0, -0.05, 0, 0, 0)); // root flare
  const fork = r.range(0.45, 0.65);
  parts.push(trunkPiece(r, 0.2, 0.12, 1.5, 1, 0.05, 1.7, 0, 0.1, fork));
  parts.push(trunkPiece(r, 0.18, 0.1, 1.4, 1, -0.05, 1.8, 0.05, -0.35, -fork));
  const n = 4 + (r() > 0.45 ? 1 : 0), cy = 3.7, spread = 1.3;
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.8, rad = i === n - 1 ? 0 : spread * r.range(0.7, 1.1), br = r.range(1.35, 1.95) * (i === n - 1 ? 1.05 : 1);
    const b = blob(br, 1, r, r.range(0.78, 0.95));
    blobs.push({ g: xf(b, { x: Math.cos(a) * rad, y: cy + (i === n - 1 ? 0.75 : r.range(-0.35, 0.35)), z: Math.sin(a) * rad, ry: r() * 6 }), br });
  }
  for (let i = 0; i < 3; i++) { const a = r() * 6.28, rad = r.range(1.9, 2.6), br = r.range(0.55, 0.85); const b = blob(br, 0, r, 0.9); blobs.push({ g: xf(b, { x: Math.cos(a) * rad, y: cy + r.range(-0.8, 0.5), z: Math.sin(a) * rad, ry: r() * 6 }), br }); }
  const centre = { x: 0, y: cy, z: 0 };
  for (const b of blobs) parts.push(paintCanopy(b.g, r, pal, centre, 3.3));
  return xf(merged(parts), { s: scale });
}

// tall pine: 5 stacked skirts, each wider at the base, rotated and offset so the silhouette is ragged
export function makePine(seed, scale) {
  const r = rng(seed), parts = [];
  parts.push(trunkPiece(r, 0.22, 0.14, 1.6, 1, 0, 0, 0, 0, 0));
  const tiers = 5; let y = 0.9;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), rad = 1.55 - t * 1.0 + r.range(-0.08, 0.1), h = 1.35 - t * 0.35;
    const g = new THREE.ConeGeometry(rad, h, 7, 1, true); g.translate(0, h / 2, 0);
    const jg = jitter(g, 0.14, r);
    const pg = xf(jg, { x: r.range(-0.1, 0.1), y, z: r.range(-0.1, 0.1), ry: r() * 6, rz: r.range(-0.04, 0.04) });
    parts.push(paintCanopy(pg, r, PINE, { x: 0, y: y + h / 2, z: 0 }, rad * 1.2));
    y += h * 0.62;
  }
  const tip = new THREE.ConeGeometry(0.28, 0.9, 5, 1, true); tip.translate(0, 0.45, 0);
  parts.push(paintCanopy(xf(jitter(tip, 0.06, r), { y: y - 0.1 }), r, PINE, { x: 0, y: y, z: 0 }, 0.6));
  return xf(merged(parts), { s: scale || 1 });
}

// slim cypress: 3 stretched faceted blobs stacked
export function makeCypress(seed, scale) {
  const r = rng(seed), parts = [];
  parts.push(trunkPiece(r, 0.2, 0.13, 0.9, 1, 0, 0, 0, 0, 0));
  const ys = [1.6, 2.9, 4.1], rs = [0.9, 0.78, 0.55];
  for (let i = 0; i < 3; i++) { const b = blob(rs[i], 1, r, 1.8 - i * 0.2); parts.push(paintCanopy(xf(b, { x: r.range(-0.08, 0.08), y: ys[i], z: r.range(-0.08, 0.08), ry: r() * 6 }), r, PINE, { x: 0, y: ys[i], z: 0 }, rs[i] * 1.8)); }
  return xf(merged(parts), { s: scale || 1 });
}

// flowering cherry: thin forked leaning trunk, 5 wide pink clouds
export function makeCherry(seed, scale) {
  const r = rng(seed), parts = [];
  parts.push(trunkPiece(r, 0.3, 0.17, 1.9, 2, 0, 0, 0, 0.12, -0.05));
  parts.push(trunkPiece(r, 0.35, 0.3, 0.3, 1, 0, -0.05, 0, 0, 0));
  parts.push(trunkPiece(r, 0.14, 0.08, 1.5, 1, 0.1, 1.55, 0, 0.05, 0.75));
  parts.push(trunkPiece(r, 0.13, 0.07, 1.3, 1, 0.05, 1.6, 0.05, -0.55, -0.6));
  parts.push(trunkPiece(r, 0.12, 0.07, 1.1, 1, 0, 1.5, -0.05, 0.6, -0.1));
  const spots = [[1.2, 3.0, 0.3, 1.3], [-1.1, 3.1, -0.3, 1.25], [0.2, 3.7, 0.9, 1.15], [0.1, 3.4, -1.0, 1.2], [0, 4.0, 0, 1.05]];
  for (const s of spots) { const b = blob(s[3], 1, r, 0.8); parts.push(paintCanopy(xf(b, { x: s[0], y: s[1], z: s[2], ry: r() * 6 }), r, CHERRY, { x: 0, y: 3.5, z: 0 }, 2.8)); }
  return xf(merged(parts), { s: scale || 1 });
}

// background lollipop street tree (about 30 triangles)
export function makeStreet(seed, scale) {
  const r = rng(seed), parts = [];
  const t = new THREE.CylinderGeometry(0.12, 0.17, 2.0, 5, 1); t.translate(0, 1.0, 0); parts.push(paintSolid(t, TRUNK[0], TRUNK[1], r));
  parts.push(paintCanopy(xf(blob(1.15, 0, r, 0.95), { y: 2.7 }), r, STREET, { x: 0, y: 2.7, z: 0 }, 1.5));
  return xf(merged(parts), { s: scale || 1 });
}

export const PALS = { OAK, OAK2, MAPLE, CHERRY };
