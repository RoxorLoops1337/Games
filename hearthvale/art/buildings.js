// Hearthvale buildings: chunky, toy-like, procedural. ORIGINAL designs inspired by the cozy village-builder genre as a whole.
//
// WHAT I LEARNED (research + genre study), applied below:
//  1. Fat, rounded forms read as "toys": every wall is a bevelled rounded box, never a hard cube; bevel about 5-8 percent of the small side.
//  2. The roof is the hero: roughly 45 percent of the building height, steep (45 deg+), thick slabs with a big overhang (0.2+) that casts a shadow band on the wall.
//  3. Roof colour is the accent; walls stay cream/plaster; so the village reads as a patchwork of coloured hats on pale bodies.
//  4. Hand-painted look comes from value banding: light top, mid, dark underside. Here: vertex colours (roof courses, scallop shingles, darker eaves undersides).
//  5. Fake ambient occlusion: darken vertices near the ground and on downward-facing faces, so walls sit in the grass and roofs have shaded undersides (see bake()).
//  6. Stone foundation band under every wall (cobble colour) + timber corner posts/plates = the cheap "half-timbered storybook" shortcut.
//  7. Doors and windows are OVERSIZED relative to realism: round-top doors, shutters, sills, flower boxes, cross mullions, glowing glass at night.
//  8. Chimneys are stubby and wide with a cap, and smoke is an anchor the game animates; a second chimney or dormer signals an upgrade.
//  9. Scalloped shingles, bunting, hanging signs, barrels, sacks, crates and lanterns cluster around the entrance; the rest of the wall stays calm.
// 10. One signature silhouette per building (sails, dome+stack, floppy wizard hat, striped canopy, saw blade) must survive at 40 px and from the game camera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as K from './artkit.js';
import { P } from './palette.js';

const { soft, gloss } = K;

// ---------------------------------------------------------------- shared materials (game drives emissiveIntensity)
export const windowMat = soft('#a9dcf3', { emissive: '#ffb347', emissiveIntensity: 0, roughness: 0.4 });
export const lanternMat = soft('#ffe08a', { emissive: '#ffb830', emissiveIntensity: 0 });
const fireMat = soft('#ff9a3c', { emissive: '#ff7a1a', emissiveIntensity: 1.3 });
const waterMat = gloss(P.water, { emissive: '#2a8fc0', emissiveIntensity: 0.18 });
for (const m of [windowMat, lanternMat, fireMat, waterMat]) m.userData.special = true;
const vcMat = soft('#ffffff', { vertexColors: true, side: THREE.DoubleSide });

// ---------------------------------------------------------------- palette shorthands
const TIM = P.barkDark, TIM2 = P.bark, WOODL = P.woodLight, WOOD = P.wood, PLANK = P.plank, STONE = P.cobble, STONEL = P.stoneLight, STONED = P.stoneDark;
const IRON = '#56505e', GOLD = P.gold, GOLDD = P.goldDeep, CREAM = P.cream;
const ROOFS = [P.roofRed, P.roofOrange, P.roofBlue, P.roofTeal, P.roofPurple, P.roofPink, P.roofGold];
const BUNT = [P.red, P.gold, P.blue, P.leafLight, P.roofPink, P.roofOrange, P.roofPurple];

const _c = new THREE.Color();
const shade = (hex, a) => { _c.set(hex); if (a >= 0) _c.lerp(new THREE.Color('#ffffff'), a); else _c.lerp(new THREE.Color('#3a2a4a'), -a); return '#' + _c.getHexString(); };
const lv = (info) => Math.max(1, Math.min(3, (info && info.lvl) | 0 || 1));
const G = (...k) => { const g = new THREE.Group(); for (const c of k) if (c) g.add(c); return g; };
const add = (g, ...k) => { for (const c of k) if (c) g.add(c); return g; };
const col = (c) => (typeof c === 'string' ? soft(c) : c);
const sh = (m) => { m.castShadow = m.receiveShadow = true; return m; };
const place = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

// ---------------------------------------------------------------- primitives (low tri count)
const BOXG = new THREE.BoxGeometry(1, 1, 1);
// box without its bottom face (10 tris): bottoms are never seen on bottom-anchored parts
const BOXN = (() => { const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, keep = []; for (let i = 0; i < p.count; i += 3) if (n.getY(i) > -0.5) keep.push(i, i + 1, i + 2); const mk = (a, sz) => { const o = new Float32Array(keep.length * sz); keep.forEach((k, j) => { for (let c = 0; c < sz; c++) o[j * sz + c] = a.array[k * sz + c]; }); return new THREE.BufferAttribute(o, sz); }; const r = new THREE.BufferGeometry(); r.setAttribute('position', mk(p, 3)); r.setAttribute('normal', mk(n, 3)); r.setAttribute('uv', mk(u, 2)); return r; })();
const SPH = new THREE.SphereGeometry(1, 10, 7), SPL = new THREE.SphereGeometry(1, 7, 5), ICO = new THREE.IcosahedronGeometry(1, 0);
/** plain box, bottom at y */
function bx(w, h, d, c, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(BOXN, col(c)); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); return sh(m); }
/** rounded box (1 bevel segment), bottom at y */
function rb(w, h, d, c, x = 0, y = 0, z = 0, r) {
  if (Math.min(w, h, d) < 0.13) return bx(w, h, d, c, x, y, z);
  r = r ?? Math.min(0.07, w / 3.2, h / 3.2, d / 3.2); const f = (v) => +v.toFixed(3);
  const m = new THREE.Mesh(K.roundedBoxGeo(f(w), f(h), f(d), r, 1), col(c)); m.position.set(x, y + h / 2, z); return sh(m);
}
const cyl = (rt, rb_, h, c, x = 0, y = 0, z = 0, seg = 10) => K.cyl(rt, rb_, h, typeof c === 'string' ? c : null, x, y, z, typeof c === 'string' ? { seg } : { seg, mat: c });
const cone = (r, h, c, x = 0, y = 0, z = 0, seg = 4, rot) => K.cone(r, h, typeof c === 'string' ? c : null, x, y, z, typeof c === 'string' ? { seg, rot } : { seg, rot, mat: c });
function sp(r, c, x = 0, y = 0, z = 0, o = {}) { const m = new THREE.Mesh(r < 0.06 ? ICO : (o.lo || r < 0.2) ? SPL : SPH, col(c)); m.scale.set(r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1)); m.position.set(x, y, z); return sh(m); }
function bl(r, c, x = 0, y = 0, z = 0, sy = 1, ry = 0) { const m = new THREE.Mesh(ICO, col(c)); m.scale.set(r, r * sy, r); m.position.set(x, y, z); m.rotation.y = ry; return sh(m); }
const lcg = new Map();
/** cylinder lying along axis 'x' or 'z', centred */
function lcyl(axis, r, len, c, x, y, z, seg = 10, r2) {
  const k = `${r},${r2 ?? r},${len},${seg}`; let g = lcg.get(k); if (!g) { g = new THREE.CylinderGeometry(r2 ?? r, r, len, seg); lcg.set(k, g); }
  const m = new THREE.Mesh(g, col(c)); m.position.set(x, y, z); if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2; return sh(m);
}
const ringG = new Map();
/** open-ended band (no caps), bottom at y */
function ring(r, h, c, x, y, z, seg = 8) { const k = `${r},${h},${seg}`; let g = ringG.get(k); if (!g) { g = new THREE.CylinderGeometry(r, r, h, seg, 1, true); ringG.set(k, g); } const m = new THREE.Mesh(g, col(c)); m.position.set(x, y + h / 2, z); return sh(m); }
const discG = new Map();
/** flat disc facing up, at y */
function disc(r, c, x, y, z, seg = 7) { const k = `${r},${seg}`; let g = discG.get(k); if (!g) { g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2); discG.set(k, g); } const m = new THREE.Mesh(g, col(c)); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = true; return m; }
const _up = new THREE.Vector3(0, 1, 0);
/** square bar between two points */
function bar(ax, ay, az, bx_, by, bz, t, c) {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx_, by, bz), d = b.clone().sub(a), len = d.length();
  const m = new THREE.Mesh(BOXG, col(c)); m.scale.set(t, len, t); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(_up, d.normalize()); return sh(m);
}
const prismCache = new Map();
/** extruded polygon (pts in XY), extruded along z by depth, centred on z */
function poly(pts, depth, c, x = 0, y = 0, z = 0, ry = 0) {
  const k = JSON.stringify(pts) + depth; let g = prismCache.get(k);
  if (!g) { const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))); g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); g.computeVertexNormals(); prismCache.set(k, g); }
  const m = new THREE.Mesh(g, col(c)); m.position.set(x, y, z); m.rotation.y = ry; return sh(m);
}
function starGeoCached() { return poly(Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? 0.4 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; }), 0.2, GOLD); }
/** 5 point star, radius r, facing +z, centre at x,y,z */
function star(r, c, x, y, z, ry = 0) { const m = starGeoCached(); m.material = col(c); m.scale.set(r, r, r * 0.2 / 0.2); m.position.set(x, y, z); m.rotation.y = ry; return m; }
/** merge same-material meshes of a small cluster into one mesh (for animated parts) */
function fuse(meshes, mat) {
  const gs = meshes.map((m) => { m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix); return g.index ? g : g; });
  const mm = new THREE.Mesh(mergeGeometries(gs.map((g) => (g.index ? g : g)), false), col(mat)); return sh(mm);
}

// ---------------------------------------------------------------- shared set pieces
let _shadowMat = null, _shadowGeo = null;
function contact(w, d, o = 1) {
  if (typeof document === 'undefined') return null;
  if (!_shadowMat) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 8, 32, 32, 32);
    gr.addColorStop(0, 'rgba(45,70,25,0.42)'); gr.addColorStop(0.55, 'rgba(45,70,25,0.24)'); gr.addColorStop(1, 'rgba(45,70,25,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    _shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }); _shadowMat.userData.special = true; _shadowGeo = new THREE.PlaneGeometry(1, 1);
  }
  const m = new THREE.Mesh(_shadowGeo, _shadowMat); m.scale.set(w, d, 1); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1; m.material.opacity = o; return m;
}
function window3(w = 0.26, h = 0.3, o = {}) {
  const g = new THREE.Group();
  add(g, bx(w + 0.1, h + 0.1, 0.05, o.frame || TIM, 0, -h / 2 - 0.05, 0), bx(w, h, 0.05, windowMat, 0, -h / 2, 0.02),
    bx(0.025, h, 0.03, TIM, 0, -h / 2, 0.05), bx(w, 0.025, 0.03, TIM, 0, -0.0125, 0.05), bx(w + 0.16, 0.045, 0.11, STONEL, 0, -h / 2 - 0.1, 0.04));
  if (o.shut) for (const s of [-1, 1]) add(g, bx(0.09, h + 0.06, 0.03, o.shut, s * (w / 2 + 0.1), -h / 2 - 0.03, 0.03));
  if (o.box) {
    const cs = o.flowers || [P.roofPink, P.gold, P.white, P.roofPurple];
    add(g, bx(w + 0.1, 0.09, 0.1, TIM2, 0, -h / 2 - 0.2, 0.07), bx(w + 0.04, 0.06, 0.08, P.leaf, 0, -h / 2 - 0.11, 0.08));
    for (let i = 0; i < 3; i++) add(g, bl(0.04, cs[i % cs.length], (i - 1) * w * 0.32, -h / 2 - 0.07, 0.09, 1, i));
  }
  return g;
}
function door3(w = 0.32, h = 0.52, c = TIM2, o = {}) {
  const g = new THREE.Group(), r = w / 2;
  add(g, bx(w + 0.14, h - r + 0.02, 0.05, STONEL, 0, 0, -0.01), lcyl('z', r + 0.07, 0.05, STONEL, 0, h - r, -0.01, 8),
    bx(w, h - r, 0.05, c, 0, 0, 0.02), lcyl('z', r, 0.05, c, 0, h - r, 0.02, 8),
    bx(0.014, h - 0.08, 0.012, shade(c, -0.3), -w * 0.18, 0, 0.05), bx(0.014, h - 0.08, 0.012, shade(c, -0.3), w * 0.18, 0, 0.05),
    bx(w * 0.9, 0.035, 0.02, IRON, 0, h * 0.4, 0.05), sp(0.03, o.gold ? GOLD : GOLDD, w * 0.3, h * 0.45, 0.06),
    bx(w + 0.34, 0.07, 0.24, STONEL, 0, -0.03, 0.1));
  return g;
}
function chimney(g, x, z, y0, y1, w = 0.24, c = P.brick, cap = STONE) {
  add(g, bx(w, y1 - y0, w, c, x, y0, z), bx(w + 0.1, 0.08, w + 0.1, cap, x, y1, z), bx(w * 0.5, 0.01, w * 0.5, '#2b2230', x, y1 + 0.075, z), bx(w + 0.02, 0.03, w + 0.02, shade(c, -0.18), x, y0 + (y1 - y0) * 0.55, z));
  const a = new THREE.Object3D(); a.name = 'chimney'; a.position.set(x, y1 + 0.16, z); g.add(a);
}
function lantern(g, x, y, z, s = 1, gold = false) {
  add(g, bx(0.12 * s, 0.04 * s, 0.12 * s, gold ? GOLDD : IRON, x, y, z), K.cyl(0.05 * s, 0.05 * s, 0.14 * s, null, x, y + 0.04 * s, z, { seg: 6, mat: lanternMat }), cone(0.1 * s, 0.09 * s, gold ? GOLD : IRON, x, y + 0.18 * s, z, 4), sp(0.02 * s, gold ? GOLD : IRON, x, y + 0.28 * s, z));
}
function barrel(g, x, z, c = WOOD, s = 1, y = 0) {
  add(g, K.lathe([[0.001, 0], [0.095, 0.0], [0.12, 0.15], [0.095, 0.3], [0.001, 0.3]].map(([r, h]) => [r * s, h * s]), c, x, y, z, { seg: 8 }),
    ring(0.115 * s, 0.025 * s, IRON, x, y + 0.06 * s, z, 8), ring(0.115 * s, 0.025 * s, IRON, x, y + 0.22 * s, z, 8));
}
function crate(g, x, z, y = 0, s = 0.26, c = PLANK, ry = 0) {
  const grp = new THREE.Group(); add(grp, bx(s, s * 0.8, s, c, 0, 0, 0), bx(s * 1.04, 0.03, 0.02, TIM2, 0, s * 0.1, s / 2), bx(s * 1.04, 0.03, 0.02, TIM2, 0, s * 0.6, s / 2), bx(0.02, 0.03, s * 1.04, TIM2, s / 2, s * 0.35, 0)); place(grp, x, y, z, ry); g.add(grp); return grp;
}
function sack(g, x, z, c = P.cream, s = 1, y = 0, ry = 0) {
  add(g, sp(0.125 * s, c, x, y + 0.1 * s, z, { sy: 0.82 }), cone(0.05 * s, 0.1 * s, c, x, y + 0.19 * s, z, 5, ry));
}
function pot(g, x, y, z, s = 1, flower) {
  add(g, K.lathe([[0.001, 0], [0.05 * s, 0], [0.07 * s, 0.1 * s], [0.075 * s, 0.12 * s], [0.06 * s, 0.12 * s]], P.clay, x, y, z, { seg: 6 }), bl(0.075 * s, P.leaf, x, y + 0.14 * s, z, 0.8));
  if (flower) add(g, bl(0.03 * s, flower, x + 0.02 * s, y + 0.2 * s, z + 0.03 * s));
}
function bunting(g, a, b, n = 7, sag = 0.12, size = 0.07, seed = 0) {
  const [ax, ay, az] = a, [bx_, by, bz] = b, yaw = Math.atan2(bx_ - ax, bz - az); let px = ax, py = ay, pz = az;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(1, (i + 0.5) / n), t2 = i === n ? 1 : (i + 1) / n;
    const x = ax + (bx_ - ax) * t2, z = az + (bz - az) * t2, y = ay + (by - ay) * t2 - sag * 4 * t2 * (1 - t2);
    add(g, bar(px, py, pz, x, y, z, 0.014, TIM2)); px = x; py = y; pz = z;
    if (i < n) {
      const fx = ax + (bx_ - ax) * t, fz = az + (bz - az) * t, fy = ay + (by - ay) * t - sag * 4 * t * (1 - t);
      const f = new THREE.Group(); const m = cone(size, size * 1.7, BUNT[(i + seed) % BUNT.length], 0, -size * 1.7, 0, 3); m.rotation.set(Math.PI, 0, 0); m.scale.set(1, 1, 0.28); f.add(m); f.position.set(fx, fy, fz); f.rotation.y = yaw + Math.PI / 2; g.add(f);
    }
  }
}
function roofCapGold(on) { return on ? GOLD : null; }

/**
 * Gable roof of thick slabs with scalloped shingles. ridge along z (along='z') or x. span = eave to eave incl overhang, len = ridge length incl overhang.
 * fill: { col, wd: wall depth across, base: wall top y relative to roof y, ovg: gable overhang, trim } fills the gable triangles.
 * returns surface(u) = world height at lateral offset u from the ridge.
 */
function roof(g, o) {
  const { x = 0, y = 0, z = 0, span, len, rise, t = 0.1, col: rc, along = 'z', fill = null, courses = 2, ridgeCol, scal = true } = o;
  const R = new THREE.Group(); R.position.set(x, y, z); if (along === 'z') R.rotation.y = Math.PI / 2;
  const hd = span / 2, a = Math.atan2(rise, hd), Ls = Math.hypot(hd, rise) + 0.06, dk = shade(rc, -0.16), lt = shade(rc, 0.07);
  for (const s of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(0, rise / 2, s * hd / 2); pv.rotation.x = s * a;
    pv.add(rb(len, t, Ls, rc, 0, -t, 0, 0.05));
    for (let k = 0; k < courses; k++) pv.add(bx(len - 0.1, 0.014, 0.04, dk, 0, 0, s * (Ls / 2 - 0.42 - k * 0.3)));
    if (scal) {
      const n = Math.max(3, Math.round(len / 0.24)), rs = len / (2 * n);
      for (let i = 0; i < n; i++) pv.add(disc(rs * 0.97, lt, -len / 2 + rs * (2 * i + 1), 0.012, s * (Ls / 2 - rs * 0.97), 8));
    }
    R.add(pv);
  }
  R.add(lcyl('x', 0.065, len + 0.02, ridgeCol || dk, 0, rise, 0, 6));
  if (fill) {
    const { wd, base, ovg = 0.14 } = fill, dx = len - 2 * ovg, yb = rise * (1 - wd / (2 * hd)) - t * 0.6;
    R.add(poly([[-wd / 2, base], [wd / 2, base], [wd / 2, yb], [0, rise - 0.1], [-wd / 2, yb]], dx, fill.col, 0, 0, 0, Math.PI / 2));
    for (const e of [-1, 1]) {
      const fx = e * (dx / 2);
      if (fill.timber !== false) {
        R.add(bx(0.05, 0.07, wd, TIM, fx, base + 0.04, 0), bx(0.05, (rise - base) * 0.6, 0.06, TIM, fx, base + 0.1, 0));
        R.add(bar(fx, base + 0.1, -wd * 0.45, fx, base + (rise - base) * 0.5, -0.03, 0.045, TIM), bar(fx, base + 0.1, wd * 0.45, fx, base + (rise - base) * 0.5, 0.03, 0.045, TIM));
      }
      if (fill.win !== false) R.add(lcyl('x', 0.1, 0.05, windowMat, fx + e * 0.02, base + (rise - base) * 0.58, 0, 10), lcyl('x', 0.125, 0.04, TIM, fx + e * 0.005, base + (rise - base) * 0.58, 0, 10));
    }
  }
  g.add(R);
  return (u) => y + rise * (1 - Math.min(1, Math.abs(u) / hd));
}
function lean(g, x, y, z, w, len, rise, c, dir = 1) {
  // single-slope roof: starts high at x (wall side) and slopes down toward +dir
  const a = Math.atan2(rise, w), L = Math.hypot(w, rise) + 0.1, pv = new THREE.Group(); pv.position.set(x + dir * w / 2, y + rise / 2, z); pv.rotation.z = -dir * a;
  pv.add(rb(L, 0.09, len, c, 0, -0.09, 0, 0.04));
  for (let k = 0; k < 2; k++) pv.add(bx(0.04, 0.014, len - 0.1, shade(c, -0.16), dir * (L / 2 - 0.2 - k * 0.3), 0, 0));
  g.add(pv);
}

// ---------------------------------------------------------------- finishing: vertex colours, fake AO, merge
function bake(root) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh || o.material.userData.special || o.material.isMeshBasicMaterial) return;
    const g = o.geometry.clone(), pos = g.attributes.position, nor = g.attributes.normal, c = o.material.color, mw = o.matrixWorld, buf = new Float32Array(pos.count * 3);
    nm.getNormalMatrix(mw);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw); n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      let k = 1 - 0.34 * Math.max(0, 1 - v.y / 0.5);       // wall bases sit in shadow
      if (n.y < -0.35) k *= 0.7;                           // undersides (eaves, awnings)
      else if (n.y > 0.5) k *= 1.04;                       // tops catch light
      buf[i * 3] = c.r * k; buf[i * 3 + 1] = c.g * k; buf[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(buf, 3)); o.geometry = g; o.material = vcMat;
  });
}
function finish(root, topY, foot) {
  const anchors = []; root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.name === 'chimney') anchors.push(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)); });
  if (foot) { const s = contact(foot[0], foot[1], foot[2] ?? 1); if (s) root.add(s); }
  if (globalThis.__hvDebug) { const rows = []; root.traverse((o) => { if (o.isMesh) { const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); rows.push([Math.round(t), o.material.color ? o.material.color.getHexString() : '', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)]); } }); globalThis.__hvRows = rows; }
  bake(root); root.userData.topY = topY;
  const out = K.mergeStatic(root);
  for (const p of anchors) { const e = new THREE.Object3D(); e.name = 'chimney'; e.position.copy(p); out.add(e); }
  out.userData.topY = topY; return out;
}

/** cottage shell: foundation, walls, corner posts, plates. returns wall top y */
function shell(g, W, D, H, wallC, o = {}) {
  const f = o.found ?? 0.16, z0 = o.z ?? 0, x0 = o.x ?? 0;
  add(g, rb(W + 0.14, f + 0.06, D + 0.14, o.foundC || STONE, x0, 0, z0, 0.05), rb(W, H, D, wallC, x0, f - 0.02, z0, 0.07));
  const top = f - 0.02 + H;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, bx(0.1, H, 0.1, TIM, x0 + sx * W / 2, f - 0.02, z0 + sz * D / 2));
  for (const sz of [-1, 1]) add(g, bx(W + 0.06, 0.09, 0.1, TIM, x0, top - 0.09, z0 + sz * D / 2));
  for (const sx of [-1, 1]) add(g, bx(0.1, 0.09, D + 0.06, TIM, x0 + sx * W / 2, top - 0.09, z0));
  return top;
}

// ================================================================ BUILDINGS
export const BUILD = {};

// ---------------------------------------------------------------- COTTAGE
BUILD.house = (info) => {
  const L = lv(info), id = info.id | 0, g = G(), rc = ROOFS[id % ROOFS.length], wallC = id % 3 === 1 ? P.plasterWarm : P.plaster, own = info.color || P.red;
  const W = 1.5, D = 1.44, H = 0.8, top = shell(g, W, D, H, wallC);
  const rise = [0.8, 0.92, 1.05][L - 1], span = [1.86, 1.9, 1.94][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { y: ry0, span, len: D + 0.34, rise, col: rc, ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.16 } });
  // door + windows (front = +z)
  add(g, place(door3(0.3, 0.52, L >= 1 ? own : TIM2, { gold: L === 3 }), 0, 0.2, D / 2 + 0.01));
  for (const s of [-1, 1]) add(g, place(window3(0.24, 0.28, { shut: shade(own, 0.05), box: L >= 2 || s < 0, flowers: id % 2 ? [P.roofPink, P.white] : [P.gold, P.roofPurple] }), s * 0.52, 0.72, D / 2 + 0.02));
  for (const s of [-1, 1]) add(g, place(window3(0.24, 0.28, { shut: shade(own, 0.05) }), s * (W / 2 + 0.01), 0.72, -0.05, s * Math.PI / 2));
  // chimney
  const cx = 0.46, cz = -0.28; chimney(g, cx, cz, surf(cx) - 0.3, surf(cx) + [0.3, 0.38, 0.46][L - 1], 0.26);
  if (L >= 3) chimney(g, -0.5, 0.3, surf(-0.5) - 0.3, surf(-0.5) + 0.22, 0.2);
  pot(g, -0.28, 0.17, D / 2 + 0.2, 1, P.roofPink); pot(g, 0.3, 0.17, D / 2 + 0.2, 0.9, P.gold);
  if (L >= 2) {  // dormer on the +x slope
    const dxp = 0.6, dz = 0.12, base = surf(dxp + 0.17) - 0.07, hh = 0.44;
    add(g, rb(0.34, hh, 0.38, wallC, dxp - 0.03, base, dz, 0.05), bx(0.05, hh, 0.05, TIM, dxp + 0.14, base, dz - 0.19), bx(0.05, hh, 0.05, TIM, dxp + 0.14, base, dz + 0.19));
    add(g, place(window3(0.17, 0.2, { shut: shade(own, 0.05) }), dxp + 0.14, base + 0.3, dz, Math.PI / 2));
    roof(g, { x: dxp - 0.06, y: base + hh - 0.02, z: dz, span: 0.64, len: 0.6, rise: 0.26, t: 0.07, col: rc, along: 'x', scal: false, courses: 0, ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: 0.38, base: -0.03, ovg: 0.08, timber: false, win: false } });
    pot(g, 0.5, 0.17, D / 2 + 0.15, 0.8, P.roofOrange);
    for (const s of [-1, 1]) add(g, bar(s * (W / 2 + 0.02), 0.2, -D / 2 + 0.05, s * (W / 2 + 0.02), top - 0.1, -0.35, 0.04, TIM));
  }
  if (L >= 2) { const f = G(); add(f, bar(0, 0, 0, 0, 0.45, 0, 0.025, TIM2), rb(0.26, 0.15, 0.02, own, 0.14, 0.27, 0, 0.02)); f.position.set(-0.04, ry0 + rise - 0.02, D / 2 + 0.01 - 0.06); g.add(f); }
  if (L === 3) {
    bunting(g, [-W / 2, top - 0.08, D / 2 + 0.1], [W / 2, top - 0.08, D / 2 + 0.1], 7, 0.12, 0.07, id);
    lantern(g, 0.34, 0.62, D / 2 + 0.12, 1, true); add(g, bar(0.34, 0.55, D / 2 + 0.01, 0.34, 0.55, D / 2 + 0.12, 0.03, GOLDD));
    add(g, sp(0.07, GOLD, 0, ry0 + rise + 0.12, 0, { lo: false }));
  }
  return finish(g, ry0 + rise + (L === 3 ? 0.3 : 0.15), [2.3, 2.3, 0.9]);
};

// ---------------------------------------------------------------- KITCHEN
BUILD.kitchen = (info) => {
  const L = lv(info), g = G(), W = 1.3, D = 1.24, H = 0.92, wallC = '#f8d79a', own = info.color || P.red;
  const top = shell(g, W, D, H, wallC, { x: 0.06 });
  const rise = [0.5, 0.6, 0.74][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { x: 0.06, y: ry0, span: 1.7, len: 1.62, rise, col: P.roofRed, along: 'x', ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.14 } });
  // front (+z): door right, serving window left with striped awning
  add(g, place(door3(0.32, 0.56, P.roofTeal, { gold: L === 3 }), 0.42, 0.2, D / 2 + 0.01));
  add(g, place(window3(0.4, 0.3, { shut: P.roofTeal, box: false }), -0.2, 0.7, D / 2 + 0.02));
  add(g, rb(0.62, 0.06, 0.2, WOODL, -0.2, 0.36, D / 2 + 0.1, 0.02));   // counter
  // pots hanging from a rail under the eave
  add(g, bar(-0.66, top - 0.05, D / 2 + 0.17, 0.0, top - 0.05, D / 2 + 0.17, 0.03, IRON));
  for (let i = 0; i < 3; i++) { const x = -0.58 + i * 0.25; add(g, bar(x, top - 0.05, D / 2 + 0.17, x, top - 0.18, D / 2 + 0.17, 0.014, IRON), K.cyl(0.075, 0.06, 0.12, i === 1 ? '#c98a55' : IRON, x, top - 0.3, D / 2 + 0.17, { seg: 8 }), cyl(0.085, 0.085, 0.02, shade(IRON, 0.2), x, top - 0.19, D / 2 + 0.17, 8)); }
  // herbs and sacks
  pot(g, -0.5, 0.17, D / 2 + 0.22, 1, P.white); pot(g, -0.1, 0.17, D / 2 + 0.22, 0.9, P.roofPink); pot(g, -0.3, 0.38, D / 2 + 0.1, 0.7);
  // big exterior brick stack on the -x end
  const sx = -0.8, sh0 = surf(0) + 0.38;
  add(g, rb(0.4, top + 0.1, 0.42, P.brick, sx, 0, -0.05, 0.05), rb(0.31, sh0 - top - 0.05, 0.31, P.brick, sx, top + 0.05, -0.05, 0.04), bx(0.43, 0.04, 0.45, shade(P.brick, -0.2), sx, top * 0.55, -0.05), bx(0.34, 0.04, 0.34, shade(P.brick, -0.2), sx, top + 0.45, -0.05));
  add(g, rb(0.38, 0.07, 0.38, STONE, sx, sh0, -0.05, 0.03), bx(0.2, 0.01, 0.2, '#2b2230', sx, sh0 + 0.065, -0.05));
  const a = new THREE.Object3D(); a.name = 'chimney'; a.position.set(sx, sh0 + 0.18, -0.05); g.add(a);
  if (L >= 2) chimney(g, 0.5, -0.25, surf(0) - 0.1, surf(0) + 0.3, 0.2, P.brick);
  // wood pile on +x side
  const logs = [[0.8, 0.07, 0], [0.8, 0.07, 0.14], [0.8, 0.07, -0.14], [0.8, 0.19, 0.07], [0.8, 0.19, -0.07], [0.8, 0.31, 0]];
  logs.forEach(([x, y, z], i) => add(g, lcyl('x', 0.066, 0.24, i % 2 ? WOOD : TIM2, x, y, z, 7), cyl(0.05, 0.05, 0.01, WOODL, x + 0.12, y - 0.0, z, 7)));
  // fix log orientation: rotate cap discs onto x axis
  add(g, bx(0.2, 0.04, 0.2, TIM2, 0.8, 0.0, 0));
  if (L === 3) { bunting(g, [-0.7, top - 0.12, D / 2 + 0.2], [0.7, top - 0.12, D / 2 + 0.2], 8, 0.1, 0.07, 3); lantern(g, 0.7, 0.55, D / 2 + 0.1, 1, true); }
  if (L >= 2) { // striped awning over the window
    for (let i = 0; i < 5; i++) { const s = rb(0.14, 0.04, 0.3, i % 2 ? CREAM : P.red, -0.2 - 0.28 + i * 0.14 + 0.07, 0.0, 0, 0.015); const pv = G(s); pv.position.set(0, top - 0.3, D / 2 + 0.17); pv.rotation.x = 0.55; g.add(pv); }
  }
  return finish(g, ry0 + rise + 0.25, [2.2, 2.2, 0.9]);
};

// ---------------------------------------------------------------- BAKERY
BUILD.bakery = (info) => {
  const L = lv(info), g = G(), W = 1.38, D = 1.34, H = 0.78, wallC = '#fbe6c4';
  const top = shell(g, W, D, H, wallC, { x: -0.1 });
  const rise = [0.74, 0.86, 1.0][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { x: -0.1, y: ry0, span: 1.8, len: D + 0.3, rise, col: P.roofPink, ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.15 } });
  // shop window with striped awning (front)
  add(g, place(window3(0.5, 0.3, { shut: false }), -0.1, 0.7, D / 2 + 0.02)); add(g, rb(0.78, 0.07, 0.24, WOODL, -0.1, 0.4, D / 2 + 0.1, 0.03));
  // loaves on the sill
  for (let i = 0; i < 3; i++) add(g, sp(0.06, i === 1 ? P.thatch : '#d99a4e', -0.28 + i * 0.18, 0.5, D / 2 + 0.12, { sx: 1.3, sy: 0.8, lo: true }));
  for (let i = 0; i < 6; i++) { const s = rb(0.16, 0.04, 0.34, i % 2 ? CREAM : P.red, 0, 0, 0, 0.015), pv = G(s); pv.position.set(-0.1 - 0.4 + i * 0.16 + 0.08, top - 0.2, D / 2 + 0.2); pv.rotation.x = 0.6; g.add(pv); }
  for (let i = 0; i < 6; i++) add(g, cyl(0.08, 0.08, 0.02, i % 2 ? CREAM : P.red, -0.1 - 0.4 + i * 0.16 + 0.08, top - 0.41, D / 2 + 0.31, 7));
  add(g, place(door3(0.3, 0.5, P.roofOrange, { gold: L === 3 }), 0.43, 0.2, D / 2 + 0.01));
  // bread sign (hanging bracket)
  add(g, bar(0.72, 1.0, D / 2 - 0.02, 0.72, 1.0, D / 2 + 0.3, 0.035, TIM), bx(0.04, 0.2, 0.04, TIM, 0.72, 0.82, D / 2 + 0.3), sp(0.12, '#e0a050', 0.72, 0.74, D / 2 + 0.3, { sx: 1.3, sy: 0.8, sz: 0.8 }), bx(0.22, 0.03, 0.03, '#f6d9a0', 0.72, 0.74, D / 2 + 0.3));
  for (const k of [-1, 0, 1]) add(g, bx(0.02, 0.05, 0.1, '#c27a35', 0.72 + k * 0.07, 0.78, D / 2 + 0.3));
  // chimney (fat) + round oven on the side
  chimney(g, 0.2, -0.3, surf(0.2) - 0.3, surf(0.2) + [0.3, 0.38, 0.46][L - 1], 0.3, P.brick);
  add(g, K.lathe([[0.001, 0], [0.34, 0], [0.38, 0.12], [0.35, 0.3], [0.26, 0.45], [0.12, 0.54], [0.001, 0.57]], P.clayLight, 0.78, 0, -0.2, { seg: 12 }));
  add(g, rb(0.24, 0.2, 0.06, '#2b2230', 0.78, 0.1, 0.12, 0.03), K.cyl(0.07, 0.07, 0.04, null, 0.78, 0.13, 0.14, { seg: 6, mat: fireMat }));
  // flour sacks + barrel
  sack(g, -0.72, D / 2 + 0.2, P.cream, 1.2, 0.0, 1); sack(g, -0.9, D / 2 + 0.05, P.cream, 1.1); sack(g, -0.8, D / 2 + 0.08, '#f1e0b8', 1.0, 0.2);
  if (L >= 2) { barrel(g, 0.3, D / 2 + 0.32, WOOD, 1); pot(g, 0.1, 0.17, D / 2 + 0.28, 0.8, P.white); }
  if (L === 3) { bunting(g, [-0.78, top - 0.05, D / 2 + 0.34], [0.58, top - 0.05, D / 2 + 0.34], 8, 0.1, 0.07, 1); lantern(g, 0.6, 0.62, D / 2 + 0.12, 1, true); }
  return finish(g, ry0 + rise + 0.2, [2.3, 2.1, 0.9]);
};

// ---------------------------------------------------------------- STOREHOUSE
BUILD.storehouse = (info) => {
  const L = lv(info), g = G(), W = 1.52, D = 1.5, H = 0.78, wallC = '#d9a66b';
  const top = shell(g, W, D, H, wallC);
  const rise = [0.8, 0.92, 1.05][L - 1], ry0 = top + 0.07;
  roof(g, { y: ry0, span: 1.88, len: D + 0.32, rise, col: P.roofBlue, ridgeCol: L === 3 ? GOLD : null, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.16, timber: false, win: false } });
  // vertical plank gaps
  for (let i = 0; i < 9; i++) add(g, bx(0.014, H - 0.1, 0.01, shade(wallC, -0.3), -0.64 + i * 0.16, 0.2, D / 2 + 0.005));
  // barn doors with x braces
  const dw = 0.56, dh = 0.6;
  add(g, rb(dw * 2 + 0.16, dh + 0.1, 0.07, P.cream, 0, 0.17, D / 2 + 0.0, 0.03));
  for (const s of [-1, 1]) { const x = s * dw / 2; add(g, rb(dw - 0.04, dh, 0.06, WOODL, x, 0.2, D / 2 + 0.03, 0.025), bar(x - dw * 0.45, 0.24, D / 2 + 0.07, x + dw * 0.45, 0.2 + dh - 0.04, D / 2 + 0.07, 0.035, P.cream), bar(x + dw * 0.45, 0.24, D / 2 + 0.07, x - dw * 0.45, 0.2 + dh - 0.04, D / 2 + 0.07, 0.035, P.cream), sp(0.03, IRON, -s * 0.05, 0.5, D / 2 + 0.08, { lo: true })); }
  // hayloft hatch + hoist
  const ly = ry0 + 0.18;
  add(g, rb(0.34, 0.3, 0.05, '#4a3526', 0, ly, D / 2 - 0.0 + 0.05 - 0.05, 0.02), rb(0.3, 0.26, 0.03, WOODL, 0, ly + 0.02, D / 2 + 0.03, 0.02));
  add(g, bar(0, ly + 0.34, D / 2 + 0.0, 0, ly + 0.36, D / 2 + 0.42, 0.045, TIM), sp(0.045, IRON, 0, ly + 0.33, D / 2 + 0.38, { lo: true }), bar(0, ly + 0.33, D / 2 + 0.38, 0, ly + 0.0, D / 2 + 0.38, 0.012, TIM2));
  sack(g, 0, D / 2 + 0.38, '#f1e0b8', 0.6, ly - 0.14);
  // sacks + barrels + crates by the door
  sack(g, -0.8, D / 2 + 0.25, P.cream, 1.15); sack(g, -0.7, D / 2 + 0.05, '#f1e0b8', 1.1); sack(g, -0.8, D / 2 + 0.12, P.cream, 1.0, 0.2, 2);
  barrel(g, 0.85, D / 2 + 0.2, WOOD, 1.1); barrel(g, 0.72, D / 2 + 0.38, TIM2, 1.0); crate(g, 0.66, D / 2 + 0.1, 0.0, 0.24); crate(g, 0.7, D / 2 + 0.1, 0.2, 0.18, WOODL, 0.3);
  window3 && add(g, place(window3(0.22, 0.26, { shut: P.roofBlue }), W / 2 + 0.01, 0.62, 0.0, Math.PI / 2));
  if (L >= 2) { barrel(g, -0.95, 0.2, TIM2, 1); crate(g, -W / 2 - 0.2, -0.3, 0.0, 0.3); crate(g, -W / 2 - 0.2, -0.3, 0.24, 0.22, WOODL, 0.5); for (const s of [-1, 1]) add(g, bar(s * 0.85, 0.2, D / 2 + 0.03, s * 0.85, top - 0.1, D / 2 + 0.03, 0.05, TIM)); }
  if (L === 3) { bunting(g, [-W / 2, top - 0.08, D / 2 + 0.1], [W / 2, top - 0.08, D / 2 + 0.1], 8, 0.12, 0.07, 4); lantern(g, 0.62, 0.78, D / 2 + 0.1, 1, true); add(g, sp(0.07, GOLD, 0, ry0 + rise + 0.12, 0)); }
  return finish(g, ry0 + rise + 0.15, [2.3, 2.3, 0.9]);
};

// ---------------------------------------------------------------- SAWMILL
BUILD.sawmill = (info) => {
  const L = lv(info), g = G(), rc = '#b9783f';
  add(g, rb(1.84, 0.14, 1.72, PLANK, 0, 0, 0, 0.05));
  for (let i = 0; i < 5; i++) add(g, bx(0.012, 0.01, 1.7, shade(PLANK, -0.3), -0.72 + i * 0.36, 0.14, 0));
  const ph = 1.2, bayX = -0.4;
  for (const sx of [-0.82, 0.02]) for (const sz of [-1, 1]) add(g, rb(0.14, ph, 0.14, TIM2, sx, 0.1, sz * 0.72, 0.04));
  for (const sz of [-1, 1]) add(g, rb(1.0, 0.12, 0.12, TIM, bayX, ph - 0.04, sz * 0.72, 0.03));
  for (const sx of [-0.82, 0.02]) add(g, rb(0.12, 0.12, 1.5, TIM, sx, ph - 0.04, 0, 0.03));
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) add(g, bar(bayX + sx * 0.42, ph - 0.28, sz * 0.72, bayX + sx * 0.18, ph - 0.04, sz * 0.72, 0.07, TIM));
  // back wall (planks)
  add(g, rb(0.9, 0.8, 0.08, WOOD, bayX, 0.14, -0.72, 0.03)); for (let i = 0; i < 5; i++) add(g, bx(0.012, 0.7, 0.01, shade(WOOD, -0.3), bayX - 0.36 + i * 0.18, 0.18, -0.675));
  const rise = [0.5, 0.6, 0.72][L - 1], ry0 = ph + 0.08;
  roof(g, { x: bayX, y: ry0, span: 1.2, len: 1.9, rise, col: rc, along: 'z', ridgeCol: L === 3 ? GOLD : null, courses: 1, fill: { col: PLANK, wd: 0.96, base: -0.1, ovg: 0.14, timber: true, win: false } });
  // saw bench (right side, open to the camera) with the spinning blade
  const bxp = 0.58;
  add(g, rb(0.5, 0.1, 1.34, WOODL, bxp, 0.4, 0.0, 0.03)); for (const sz of [-0.55, 0.55]) for (const dx of [-0.17, 0.17]) add(g, rb(0.1, 0.4, 0.1, TIM2, bxp + dx, 0.14, sz, 0.03));
  add(g, rb(0.3, 0.12, 0.22, IRON, bxp, 0.5, 0.0, 0.03), rb(0.1, 0.5, 0.1, IRON, bxp, 0.5, -0.08, 0.03));
  const disc = lcyl('x', 0.4, 0.035, '#cfdbe8', 0, 0, 0, 18), teeth = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, t = bx(0.04, 0.1, 0.07, '#a2b1c4', 0, 0, 0); t.position.set(0, Math.cos(a) * 0.4, Math.sin(a) * 0.4); t.rotation.x = -a + 0.6; teeth.push(t); }
  const spin = G(disc, fuse(teeth, '#a2b1c4'), lcyl('x', 0.1, 0.06, P.red, 0, 0, 0, 8), lcyl('x', 0.2, 0.045, '#b3c1d3', 0, 0, 0, 12)); spin.name = 'spin'; spin.position.set(bxp, 0.98, 0.0);
  // log being cut + cut piece
  add(g, lcyl('z', 0.12, 0.8, TIM2, bxp, 0.62, 0.52, 8), lcyl('z', 0.1, 0.02, WOODL, bxp, 0.62, 0.93, 8), lcyl('z', 0.1, 0.5, WOOD, bxp, 0.62, -0.45, 8));
  add(g, rb(0.3, 0.05, 0.5, WOODL, bxp + 0.18, 0.5, 0.65, 0.015));
  // log pile (back-left, ends toward the camera) and planks stack (front-left)
  const lp = [[-0.64, 0.2, -0.3], [-0.4, 0.2, -0.3], [-0.52, 0.38, -0.3], [-0.64, 0.2, 0.05], [-0.4, 0.2, 0.05]];
  lp.forEach(([x, y, z], i) => { add(g, lcyl('z', 0.12, 0.5, i % 2 ? TIM2 : WOOD, x, y, z, 8)); add(g, lcyl('z', 0.1, 0.02, WOODL, x, y, z + 0.25, 8)); });
  for (let i = 0; i < 5; i++) add(g, rb(0.5, 0.045, 0.28, i % 2 ? WOODL : PLANK, -0.5 + (i % 2) * 0.02, 0.14 + i * 0.062, 0.5, 0.015));
  add(g, bx(0.04, 0.3, 0.3, TIM, -0.5, 0.14, 0.5));
  add(g, bl(0.2, '#f1d78a', 0.3, 0.14, 0.62, 0.5, 1), bl(0.13, '#f1d78a', 0.3, 0.14, 0.2, 0.5, 2), bl(0.15, '#f1d78a', 0.8, 0.14, 0.5, 0.5, 3));
  // saw hung on the back wall
  add(g, lcyl('z', 0.17, 0.02, '#cfdbe8', -0.4, 0.8, -0.66, 10));
  if (L >= 2) { add(g, rb(0.4, 0.2, 0.05, WOODL, bayX, ph - 0.5, 0.8, 0.02), bar(bayX - 0.15, ph - 0.28, 0.8, bayX - 0.15, ph - 0.1, 0.8, 0.012, IRON), bar(bayX + 0.15, ph - 0.28, 0.8, bayX + 0.15, ph - 0.1, 0.8, 0.012, IRON)); lantern(g, 0.02, 0.8, 0.82, 1, false); add(g, bx(0.04, 0.56, 0.04, TIM, 0.02, 0.14, 0.82)); for (let i = 0; i < 4; i++) add(g, rb(0.46, 0.05, 0.26, i % 2 ? WOODL : PLANK, bxp + 0.0, 0.14 + i * 0.062, -0.55, 0.015)); }
  if (L === 3) { bunting(g, [-0.82, ph - 0.1, 0.78], [0.02, ph - 0.1, 0.78], 6, 0.1, 0.07, 5); lantern(g, -0.82, 0.9, 0.84, 1, true); add(g, sp(0.07, GOLD, bayX, ry0 + rise + 0.12, 0)); }
  const out = finish(g, ry0 + rise + 0.15, [2.2, 2.1, 0.9]); out.add(spin); return out;
};

// ---------------------------------------------------------------- BRICK KILN
BUILD.kiln = (info) => {
  const L = lv(info), g = G(), b1 = P.clay, b2 = shade(P.clay, 0.1), b3 = shade(P.clay, -0.12);
  add(g, rb(1.8, 0.2, 1.7, STONE, 0, 0, 0, 0.06));
  const R = [0.74, 0.8, 0.86][L - 1];
  add(g, K.lathe([[0.001, 0.2], [R, 0.2], [R + 0.05, 0.3], [R + 0.03, 0.55]], b3, 0, 0, 0, { seg: 14 }));
  add(g, K.lathe([[R + 0.03, 0.55], [R, 0.72], [R - 0.1, 0.9], [R - 0.2, 1.02]], b1, 0, 0, 0, { seg: 14 }));
  add(g, K.lathe([[R - 0.2, 1.02], [R - 0.34, 1.12], [R - 0.5, 1.2], [R - 0.58, 1.26], [0.001, 1.32]], b2, 0, 0, 0, { seg: 14 }));
  for (const [y, r] of [[0.52, R + 0.045], [0.93, R - 0.12]]) add(g, cyl(r, r, 0.045, L >= 3 ? GOLDD : IRON, 0, y, 0, 14));
  // glowing mouth: stone arch frame, dark recess, bright fire
  add(g, rb(0.66, 0.42, 0.24, STONED, 0, 0.2, R - 0.0, 0.06), lcyl('z', 0.33, 0.24, STONED, 0, 0.62, R, 10));
  add(g, bx(0.46, 0.38, 0.1, '#2b2230', 0, 0.2, R + 0.09), lcyl('z', 0.23, 0.1, '#2b2230', 0, 0.58, R + 0.09, 10));
  add(g, bx(0.36, 0.26, 0.05, fireMat, 0, 0.22, R + 0.13), lcyl('z', 0.18, 0.05, fireMat, 0, 0.48, R + 0.13, 8), bx(0.5, 0.06, 0.16, STONEL, 0, 0.2, R + 0.15));
  // tall chimney stack at the back
  const cy0 = 0.9, cy1 = 2.0 + (L - 1) * 0.1;
  add(g, K.cyl(0.17, 0.24, cy1 - cy0, b1, 0.2, cy0, -0.42, { seg: 10 }), cyl(0.21, 0.19, 0.1, STONE, 0.2, cy1, -0.42, 10), cyl(0.14, 0.14, 0.04, '#2b2230', 0.2, cy1 + 0.1, -0.42, 8), cyl(0.2, 0.2, 0.04, b3, 0.2, 1.35, -0.42, 10), cyl(0.185, 0.185, 0.04, b3, 0.2, 1.7, -0.42, 10));
  const a = new THREE.Object3D(); a.name = 'chimney'; a.position.set(0.2, cy1 + 0.3, -0.42); g.add(a);
  // brick stacks, firewood, clay lump, wheelbarrow-ish cart
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) add(g, rb(0.2, 0.09, 0.1, r % 2 ? P.brickDark : P.brick, -0.82 + c * 0.22 + r * 0.11, 0.2 + r * 0.095, 0.62, 0.02), rb(0.2, 0.09, 0.1, r % 2 ? P.brick : P.brickDark, -0.82 + c * 0.22 + r * 0.11, 0.2 + r * 0.095, 0.5, 0.02));
  for (let i = 0; i < 4; i++) add(g, lcyl('x', 0.055, 0.34, i % 2 ? TIM2 : WOOD, 0.78, 0.26 + (i > 1 ? 0.1 : 0), 0.45 + (i % 2) * 0.12 - 0.06, 7));
  add(g, bl(0.18, P.clayLight, -0.8, 0.28, 0.08, 0.6), bl(0.12, P.clay, -0.62, 0.25, 0.2, 0.6, 1));
  add(g, bx(0.04, 0.26, 0.04, TIM, 0.55, 0.2, 0.85), bx(0.04, 0.2, 0.04, TIM, 0.85, 0.2, 0.85), rb(0.5, 0.04, 0.12, WOODL, 0.7, 0.4, 0.85, 0.015));
  if (L >= 2) { add(g, bar(-0.9, 0.2, -0.7, -0.9, 1.0, -0.7, 0.07, TIM)); lantern(g, -0.9, 0.95, -0.55, 1, L === 3); add(g, bar(-0.9, 1.05, -0.7, -0.9, 1.05, -0.5, 0.05, TIM)); }
  if (L === 3) { bunting(g, [-0.55, 0.9, 0.68], [0.55, 0.9, 0.68], 7, 0.14, 0.07, 2); add(g, sp(0.09, GOLD, 0, 1.4 + 0.02, 0)); }
  return finish(g, 1.45 + (L - 1) * 0.1 + (L > 1 ? 0.0 : 0), [2.2, 2.1, 0.9]);
};

// ---------------------------------------------------------------- STUDY (wizard tower)
BUILD.study = (info) => {
  const L = lv(info), g = G(), tw = G(), plaster = '#e6d6fa', band = '#c4aaf0';
  add(g, rb(1.8, 0.16, 1.7, STONE, 0, 0, 0, 0.06));
  // lean tower, built in a sub group so it can tilt
  add(tw, K.lathe([[0.001, 0.1], [0.7, 0.1], [0.72, 0.25], [0.66, 0.5]], STONE, 0, 0, 0, { seg: 12 }));
  add(tw, K.lathe([[0.66, 0.5], [0.6, 1.0], [0.52, 1.5], [0.46, 1.62]], plaster, 0, 0, 0, { seg: 12 }));
  add(tw, cyl(0.64, 0.64, 0.07, band, 0, 1.0, 0, 12), cyl(0.56, 0.56, 0.06, band, 0, 1.45, 0, 12));
  const top1 = 1.62;
  add(tw, cyl(0.62, 0.55, 0.13, band, 0, top1 - 0.08, 0, 12), cyl(0.5, 0.5, 0.3, '#ddd2f0', 0, top1 + 0.04, 0, 12), cyl(0.48, 0.5, 0.07, TIM, 0, top1 - 0.04, 0, 12));
  // wizard hat roof
  const hy = top1 + 0.3;
  add(tw, cyl(0.84, 0.84, 0.06, '#4b3f9a', 0, hy - 0.04, 0, 14), K.cone(0.62, 0.9, '#5a4bb5', 0, hy + 0.02, 0, { seg: 12, rot: 0 }));
  const tip = G(K.cone(0.28, 0.7, '#6a58cc', 0, 0, 0, { seg: 10, rot: 0 }), sp(0.05, GOLD, 0, 0.7, 0)); tip.position.set(0.0, hy + 0.85, 0); tip.rotation.z = -0.35; tw.add(tip);
  add(tw, cyl(0.56, 0.66, 0.05, GOLD, 0, hy + 0.12, 0, 14));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; add(tw, star(0.06, GOLD, Math.sin(a) * 0.42, hy + 0.36, Math.cos(a) * 0.42, a)); }
  g.add(tw); tw.rotation.z = -0.06; tw.position.set(-0.05, 0.0, -0.1);
  // windows (glowing), door, balcony
  const rAt = (y) => (y < 1.0 ? 0.66 - (y - 0.5) * 0.12 : 0.6 - (y - 1.0) * 0.16);
  [[0.8, 0.5], [1.18, 1.5], [1.46, 2.6], [1.1, -0.9]].forEach(([y, a], i) => { const w = window3(0.17, i === 2 ? 0.2 : 0.26, { frame: GOLDD }); w.position.set(Math.sin(a) * (rAt(y) - 0.0), y, Math.cos(a) * rAt(y)); w.rotation.y = a; tw.add(w); });
  add(g, place(door3(0.3, 0.5, P.roofPurple, { gold: L === 3 }), 0.2, 0.18, 0.62, 0.0));
  // moon + star sign on a bracket
  add(g, bar(0.9, 1.05, 0.2, 0.9, 1.05, 0.6, 0.04, TIM), bar(0.9, 1.05, 0.58, 0.9, 0.82, 0.58, 0.015, IRON));
  add(g, rb(0.3, 0.24, 0.04, '#3c3a8a', 0.9, 0.62, 0.58, 0.02)); const moon = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.025, 5, 10, 4.6), col(GOLD)); moon.position.set(0.9, 0.74, 0.61); moon.rotation.z = 0.5; add(g, sh(moon)); add(g, star(0.045, GOLD, 0.97, 0.7, 0.61));
  // stacked books, scrolls, desk
  const bc = [P.red, P.blue, P.leaf, P.gold, P.roofPurple, P.roofOrange];
  [[0.45, 0.2, 0.98, 0, 0.1], [0.4, 0.17, 0.98, 0.1, 0.14], [0.36, 0.19, 0.98, 0.23, 0.25]].forEach(([w, h, , y0, rot], i) => add(g, place(rb(0.34 - i * 0.03, 0.07, 0.24, bc[i], -0.8 + i * 0.01, 0.16 + i * 0.075, 0.55 + 0.0, 0.02), -0.8 + i * 0.01, 0.16 + i * 0.075, 0.55, rot * (i % 2 ? 1 : -1))));
  for (let i = 0; i < 3; i++) add(g, rb(0.07, 0.3, 0.2, bc[(i + 3) % 6], -0.62 + i * 0.075, 0.16, 0.72, 0.015));
  add(g, lcyl('x', 0.04, 0.2, P.cream, -0.55, 0.2, 0.3, 6), lcyl('x', 0.04, 0.2, '#f1dcaa', -0.5, 0.2, 0.38, 6));
  add(g, cone(0.01, 0.01, GOLD, 0, 0, 0, 3)); // tiny filler removed visually
  if (L >= 2) { for (let i = 0; i < 4; i++) add(g, place(rb(0.3, 0.06, 0.2, bc[(i + 1) % 6], 0.7, 0.16 + i * 0.065, 0.76, 0.02), 0.7, 0.16 + i * 0.065, 0.76, i * 0.4)); lantern(g, 0.55, 0.72, 0.68, 1, false); add(g, bar(0.55, 0.65, 0.58, 0.55, 0.65, 0.68, 0.03, IRON)); }
  if (L === 3) { bunting(g, [-0.55, 0.62, 0.62], [0.5, 0.62, 0.7], 6, 0.12, 0.06, 6); add(g, rb(0.16, 0.5, 0.16, '#6a58cc', -0.88, 0.16, -0.55, 0.04), cone(0.13, 0.3, GOLD, -0.88, 0.66, -0.55, 4), rb(0.16, 0.5, 0.16, '#6a58cc', 0.88, 0.16, -0.55, 0.04), cone(0.13, 0.3, GOLD, 0.88, 0.66, -0.55, 4)); }
  return finish(g, hy + 1.65, [2.2, 2.1, 0.9]);
};

// ---------------------------------------------------------------- WINDMILL
BUILD.mill = (info) => {
  const L = lv(info), g = G(), wall = '#f3e6c8', wall2 = '#e6d3a8';
  add(g, rb(1.7, 0.16, 1.7, STONE, 0, 0, 0, 0.06));
  add(g, K.lathe([[0.001, 0.12], [0.74, 0.12], [0.76, 0.3], [0.7, 0.45]], STONED, 0, 0, -0.1, { seg: 12 }));
  add(g, K.lathe([[0.7, 0.45], [0.62, 1.0], [0.54, 1.5], [0.5, 1.75]], wall, 0, 0, -0.1, { seg: 12 }));
  add(g, cyl(0.66, 0.66, 0.05, TIM, 0, 0.98, -0.1, 12), cyl(0.57, 0.57, 0.05, TIM, 0, 1.45, -0.1, 12));
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.4; add(g, bar(Math.sin(a) * 0.62, 0.5, -0.1 + Math.cos(a) * 0.62, Math.sin(a) * 0.51, 1.72, -0.1 + Math.cos(a) * 0.51, 0.03, wall2)); }
  // cap
  const cy = 1.75;
  add(g, cyl(0.56, 0.52, 0.12, TIM2, 0, cy - 0.02, -0.1, 12), K.lathe([[0.57, cy + 0.08], [0.55, cy + 0.2], [0.45, cy + 0.38], [0.25, cy + 0.52], [0.001, cy + 0.56]], L === 3 ? GOLDD : '#a8683c', 0, 0, -0.1, { seg: 12 }));
  add(g, bx(0.04, 0.2, 0.04, TIM, 0, cy + 0.55, -0.1), sp(0.06, GOLD, 0, cy + 0.78, -0.1, { lo: true }));
  // door, windows, balcony
  add(g, place(door3(0.3, 0.5, P.roofTeal, { gold: L === 3 }), 0, 0.22, 0.6 - 0.1 + 0.0, 0)); g.children[g.children.length - 1].position.z = 0.57;
  add(g, rb(0.36, 0.05, 0.12, TIM, 0, 0.98, 0.5, 0.02));
  const w = window3(0.18, 0.24, { shut: P.roofTeal }); w.position.set(0, 1.25, 0.46); g.add(w);
  const w2 = window3(0.16, 0.22, { shut: P.roofTeal }); w2.position.set(0.52, 0.85, -0.1 + 0.2); w2.rotation.y = 1.2; g.add(w2);
  // sails
  const hubZ = 0.55, hubY = cy + 0.1, len = 0.92;
  const woods = [], cloths = [], bars2 = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, sg = new THREE.Group();
    sg.add(bx(0.05, len, 0.05, TIM, 0, 0.05, 0), bx(0.3, 0.025, 0.04, TIM, 0.15 + 0.02, 0.2, 0), bx(0.3, 0.025, 0.04, TIM, 0.17, len - 0.08, 0), bx(0.025, len - 0.3, 0.04, TIM, 0.3, 0.2, 0), bx(0.3, 0.025, 0.04, TIM, 0.17, 0.45, 0), bx(0.3, 0.025, 0.04, TIM, 0.17, 0.7, 0));
    const cl = bx(0.26, len - 0.3, 0.025, i % 2 ? CREAM : '#f8e9c5', 0.17, 0.22, -0.01);
    sg.add(cl); sg.rotation.z = a; sg.updateMatrix(); sg.updateMatrixWorld(true);
    sg.traverse((m) => { if (m.isMesh) { m.updateWorldMatrix(true, false); const gg = m.geometry.clone(); gg.applyMatrix4(m.matrixWorld); const mm = new THREE.Mesh(gg, m.material); (m === cl ? cloths : woods).push(mm); } });
  }
  const sails = G(fuse(woods, TIM), fuse(cloths, '#f8e9c5'), sp(0.1, GOLDD, 0, 0, 0.04), cyl(0.05, 0.05, 0.2, TIM, 0, 0, 0, 6));
  sails.children[3].rotation.x = Math.PI / 2; sails.children[3].position.set(0, 0, -0.06);
  sails.name = 'spinz'; sails.position.set(0, hubY, hubZ);
  // props
  sack(g, -0.8, 0.5, P.cream, 1.2); sack(g, -0.65, 0.65, P.cream, 1.1); sack(g, -0.74, 0.58, '#f1e0b8', 1.0, 0.2);
  barrel(g, 0.82, 0.5, WOOD, 1);
  for (let i = 0; i < 4; i++) add(g, bl(0.07, P.thatch, 0.7 + i * 0.05, 0.2 + i * 0.01, 0.8 - i * 0.05, 1.4, i));
  if (L >= 2) { lantern(g, 0.45, 0.65, 0.72, 1, false); add(g, bar(0.45, 0.58, 0.62, 0.45, 0.58, 0.72, 0.03, IRON)); }
  if (L === 3) { bunting(g, [-0.62, 1.0, 0.45], [0.62, 1.0, 0.45], 7, 0.12, 0.07, 3); add(g, cyl(0.62, 0.62, 0.04, GOLDD, 0, 1.0, -0.1, 12)); }
  const out = finish(g, cy + 0.9, [2.2, 2.1, 0.9]); out.add(sails); return out;
};

// ---------------------------------------------------------------- MARKET (striped stall)
BUILD.market = (info) => {
  const L = lv(info), g = G(), own = info.color || P.red;
  add(g, rb(1.84, 0.1, 1.76, STONE, 0, 0, 0, 0.05));
  const ph = L === 3 ? 1.36 : 1.26, hi = ph + 0.12, lo = ph - 0.4, Z0 = -0.82, Z1 = 0.5;
  for (const sx of [-1, 1]) add(g, rb(0.12, ph, 0.12, TIM2, sx * 0.82, 0.1, -0.7, 0.035), rb(0.12, lo + 0.02, 0.12, TIM2, sx * 0.82, 0.1, 0.4, 0.035));
  // back panel + shelf with jars
  add(g, rb(1.6, 0.95, 0.06, WOOD, 0, 0.1, -0.74, 0.025)); for (let i = 0; i < 7; i++) add(g, bx(0.012, 0.85, 0.01, shade(WOOD, -0.3), -0.66 + i * 0.22, 0.14, -0.705));
  add(g, bx(1.4, 0.05, 0.2, WOODL, 0, 0.62, -0.62));
  [P.red, P.gold, P.roofPurple, P.leaf, P.roofOrange, P.red, P.gold].forEach((c, i) => add(g, cyl(0.06, 0.07, 0.11, c, -0.58 + i * 0.19, 0.67, -0.62, 7)));
  // striped canopy, high at the back, low at the front
  const n = 8, sw = 1.94 / n, a = Math.atan2(hi - lo, Z1 - Z0), Ls = Math.hypot(Z1 - Z0, hi - lo) + 0.02;
  for (let i = 0; i < n; i++) { const c = i % 2 ? CREAM : (L >= 2 && i % 4 === 0 ? own : P.red); const pv = G(rb(sw - 0.005, 0.07, Ls, c, 0, -0.07, 0, 0.02)); pv.position.set(-0.97 + sw * (i + 0.5), (hi + lo) / 2, (Z0 + Z1) / 2); pv.rotation.x = a; g.add(pv); }
  for (let i = 0; i < n; i++) { const c = i % 2 ? CREAM : P.red; const d = cyl(sw / 2 * 0.98, sw / 2 * 0.98, 0.05, c, -0.97 + sw * (i + 0.5), 0, 0, 8); d.rotation.x = Math.PI / 2; d.position.set(-0.97 + sw * (i + 0.5), lo - 0.08, Z1 + 0.0); add(g, d); }
  add(g, lcyl('x', 0.04, 1.96, GOLDD, 0, lo - 0.01, Z1 + 0.03, 6), rb(1.96, 0.1, 0.1, TIM, 0, hi - 0.05, Z0 - 0.03, 0.03));
  // counter in front of the canopy with baskets of goods
  add(g, rb(1.5, 0.42, 0.42, WOODL, 0, 0.1, 0.74, 0.04), rb(1.58, 0.06, 0.5, PLANK, 0, 0.52, 0.74, 0.025));
  for (let i = 0; i < 5; i++) add(g, bx(0.26, 0.4, 0.012, i % 2 ? CREAM : P.red, -0.52 + i * 0.26, 0.12, 0.955));
  const goods = [[P.red, -0.56], ['#7bbf4a', -0.19], [P.roofOrange, 0.19], [P.gold, 0.56]];
  goods.forEach(([c, x], i) => { add(g, rb(0.3, 0.1, 0.3, TIM2, x, 0.58, 0.74, 0.03)); for (let k = 0; k < 5; k++) add(g, sp(0.056, c, x - 0.07 + (k % 2) * 0.12, 0.72, 0.74 - 0.06 + (k >> 1) * 0.08, { lo: true })); });
  barrel(g, 0.82, 0.72, WOOD, 1.0); barrel(g, -0.84, 0.74, TIM2, 1.0); crate(g, -0.7, 0.28, 0.0, 0.26); crate(g, -0.68, 0.28, 0.21, 0.2, WOODL, 0.3); crate(g, 0.7, 0.3, 0.0, 0.24, WOODL, 0.2);
  for (let i = 0; i < 3; i++) add(g, sp(0.056, P.roofOrange, 0.66 + (i - 1) * 0.06, 0.26, 0.3 + (i % 2) * 0.05, { lo: true }));
  sack(g, 0.45, 0.2, '#f1e0b8', 1.0);
  // hanging coin sign on the right side
  add(g, bar(0.82, ph - 0.0, 0.2, 0.93, ph - 0.0, 0.2, 0.04, TIM), bar(0.93, ph - 0.02, 0.2, 0.93, ph - 0.2, 0.2, 0.012, IRON), rb(0.05, 0.26, 0.36, WOODL, 0.93, ph - 0.46, 0.2, 0.02), lcyl('x', 0.1, 0.06, GOLD, 0.94, ph - 0.33, 0.2, 10));
  if (L >= 2) { lantern(g, -0.82, lo - 0.34, 0.42, 1, false); add(g, bar(-0.82, lo - 0.01, 0.42, -0.82, lo - 0.1, 0.42, 0.012, IRON)); for (const s of [-1, 1]) add(g, bl(0.11, P.leafLight, s * 0.5, hi + 0.04, -0.2, 0.7), bl(0.045, P.roofPink, s * 0.5 + 0.04, hi + 0.1, -0.16)); }
  if (L === 3) { for (const sx of [-1, 1]) add(g, sp(0.08, GOLD, sx * 0.82, 0.1 + ph + 0.06, -0.7), sp(0.07, GOLD, sx * 0.82, 0.1 + lo + 0.08, 0.4)); bunting(g, [-0.97, lo - 0.14, Z1 + 0.04], [0.97, lo - 0.14, Z1 + 0.04], 9, 0.1, 0.065, 1); add(g, bar(0, hi, -0.2, 0, hi + 0.5, -0.2, 0.03, GOLDD), rb(0.28, 0.16, 0.02, own, 0.16, hi + 0.33, -0.2, 0.01)); }
  return finish(g, hi + (L === 3 ? 0.6 : 0.25), [2.2, 2.0, 0.9]);
};

// ---------------------------------------------------------------- HALL (3x3)
BUILD.hall = (info) => {
  const L = lv(info), g = G(), own = info.color || P.red, wallC = '#fbeed0', wing = '#f7e0b0', rc = P.roofRed, blue = P.roofBlue;
  // plaza + steps
  add(g, rb(2.84, 0.16, 2.84, STONE, 0, 0, 0, 0.07));
  add(g, bx(1.3, 0.07, 0.3, STONEL, 0, 0.14, 1.3), bx(1.1, 0.07, 0.26, STONE, 0, 0.2, 1.17));
  // main block
  const mz = -0.25, W = 1.7, D = 1.5, top = shell(g, W, D, 0.96, wallC, { z: mz, found: 0.28, foundC: STONE });
  const rise = [0.9, 1.0, 1.14][L - 1], span = [2.1, 2.2, 2.3][L - 1], ry0 = top + 0.07;
  const surf = roof(g, { z: mz, y: ry0, span, len: D + 0.34, rise, col: rc, ridgeCol: L === 3 ? GOLD : null, courses: 1, fill: { col: wallC, wd: D, base: top - ry0 - 0.02, ovg: 0.16, win: false } });
  const fz = mz + D / 2;
  // grand front door + windows
  add(g, rb(0.64, 0.7, 0.08, STONEL, 0, 0.22, fz, 0.04), lcyl('z', 0.32, 0.08, STONEL, 0, 0.92, fz, 10));
  add(g, bx(0.46, 0.66, 0.08, TIM2, 0, 0.24, fz + 0.03), lcyl('z', 0.23, 0.08, TIM2, 0, 0.9, fz + 0.03, 10), bx(0.025, 0.86, 0.02, TIM, 0, 0.26, fz + 0.075), bx(0.4, 0.04, 0.02, IRON, 0, 0.55, fz + 0.075), sp(0.035, GOLD, 0.1, 0.55, fz + 0.09), sp(0.035, GOLD, -0.1, 0.55, fz + 0.09));
  for (const s of [-1, 1]) add(g, place(window3(0.26, 0.34, { shut: shade(own, 0.08), box: L >= 2 }), s * 0.6, 0.64, fz + 0.01));
  // porch on two columns with its own little gable roof
  const pz = fz + 0.42;
  for (const s of [-1, 1]) add(g, cyl(0.07, 0.085, 0.9, CREAM, s * 0.46, 0.16, pz + 0.05, 8), bx(0.2, 0.06, 0.2, STONEL, s * 0.46, 1.04, pz + 0.05));
  roof(g, { z: pz - 0.12, y: 1.12, span: 1.34, len: 0.92, rise: 0.4, t: 0.08, col: rc, along: 'z', ridgeCol: L === 3 ? GOLD : null, courses: 0, scal: false });
  // side wings with lean-to roofs sloping outward
  for (const s of [-1, 1]) {
    const wx = s * 1.08, wtop = 0.28 + 0.62;
    add(g, bx(0.62, 0.3, 1.0, STONE, wx, 0, -0.35), rb(0.54, 0.62, 0.9, wing, wx, 0.28, -0.35, 0.06), bx(0.1, 0.62, 0.1, TIM, wx + s * 0.27, 0.28, 0.1), bx(0.1, 0.62, 0.1, TIM, wx - s * 0.27, 0.28, 0.1));
    lean(g, s * 0.78, wtop + 0.06, -0.35, 0.66, 1.1, 0.34, P.roofOrange, s);
    add(g, place(window3(0.2, 0.28, { shut: false }), wx, 0.62, 0.11));
  }
  chimney(g, 1.18, -0.7, 1.15, 1.85, 0.2); if (L >= 2) chimney(g, -1.18, -0.7, 1.15, 1.75, 0.2);
  // clock tower rising from the ridge, set toward the back
  const tz = mz - 0.42, tw = 0.74, t0 = 0.9, t1 = ry0 + rise + 0.4;
  add(g, bx(tw, t1 - t0, tw, '#f4e4c1', 0, t0, tz), bx(tw + 0.1, 0.07, tw + 0.1, STONEL, 0, t1 - 0.04, tz));
  for (const s of [-1, 1]) for (const q of [-1, 1]) add(g, bx(0.07, t1 - t0, 0.07, TIM, s * tw / 2, t0, tz + q * tw / 2));
  const b0 = t1 + 0.03, bh = 0.46;
  add(g, bx(tw - 0.06, bh, tw - 0.06, '#5a4a68', 0, b0, tz));
  for (const s of [-1, 1]) for (const q of [-1, 1]) add(g, bx(0.1, bh, 0.1, '#f4e4c1', s * (tw / 2 - 0.03), b0, tz + q * (tw / 2 - 0.03)));
  add(g, bx(tw + 0.2, 0.07, tw + 0.2, TIM2, 0, b0 + bh, tz), cone(tw * 0.78, 0.8, L === 3 ? GOLDD : blue, 0, b0 + bh + 0.06, tz, 4));
  // clock face
  const cy_ = t0 + 0.6, cz = tz + tw / 2;
  add(g, lcyl('z', 0.27, 0.04, GOLD, 0, cy_, cz, 8), lcyl('z', 0.22, 0.06, CREAM, 0, cy_, cz + 0.01, 8), bar(0, cy_, cz + 0.045, 0, cy_ + 0.15, cz + 0.045, 0.025, IRON), bar(0, cy_, cz + 0.045, 0.1, cy_ - 0.05, cz + 0.045, 0.025, IRON));
  // flag pole + flag
  const pt = b0 + bh + 0.06 + 0.8;
  add(g, bar(0, pt - 0.05, tz, 0, pt + 0.78, tz, 0.035, TIM2), sp(0.06, GOLD, 0, pt + 0.82, tz));
  const flag = G(rb(0.62, 0.34, 0.03, own, 0.34, -0.17, 0, 0.015), bx(0.62, 0.05, 0.035, GOLD, 0.34, -0.06, 0));
  flag.name = 'flag'; flag.position.set(0.02, pt + 0.74, tz);
  // hanging banners on the facade (lvl 2+)
  if (L >= 2) for (const s of [-1, 1]) add(g, bar(s * 0.95 - 0.12, 1.05, fz + 0.04, s * 0.95 + 0.12, 1.05, fz + 0.04, 0.03, GOLDD), rb(0.2, 0.62, 0.03, own, s * 0.95, 0.44, fz + 0.04, 0.012), bx(0.2, 0.03, 0.035, GOLD, s * 0.95, 0.83, fz + 0.04), bx(0.2, 0.03, 0.035, GOLD, s * 0.95, 0.47, fz + 0.04));
  // props on the plaza
  barrel(g, -1.15, 1.0, WOOD, 1.0, 0.14); crate(g, 1.1, 1.05, 0.14, 0.26);
  pot(g, -0.86, 0.2, 1.2, 1, P.roofPink); pot(g, 0.86, 0.2, 1.2, 1, P.gold);
  if (L >= 2) for (const s of [-1, 1]) { add(g, cyl(0.04, 0.05, 0.9, IRON, s * 1.25, 0.14, 1.2, 6)); lantern(g, s * 1.25, 1.03, 1.2, 1.1, L === 3); }
  if (L === 3) {
    bunting(g, [-0.9, top - 0.06, fz + 0.32], [0.9, top - 0.06, fz + 0.32], 7, 0.14, 0.08, 0);
    for (const s of [-1, 1]) add(g, cyl(0.15, 0.17, 0.95, '#f4e4c1', s * 0.9, 0.28, mz - 0.62, 9), cone(0.21, 0.34, GOLDD, s * 0.9, 1.22, mz - 0.62, 9, 0));
  }
  const out = finish(g, pt + 0.95, [3.2, 3.2, 0.95]); out.add(flag); return out;
};

// ---------------------------------------------------------------- DECOR
BUILD.flowers = (info) => {
  const L = lv(info), id = info.id | 0, g = G();
  const sets = [[P.roofPink, P.gold, P.white], [P.roofPurple, P.roofPink, P.gold], [P.red, P.gold, P.white], [P.blue, P.white, P.roofPink]], cs = sets[id % sets.length];
  add(g, rb(0.86, 0.16, 0.86, TIM2, 0, 0, 0, 0.05), rb(0.74, 0.12, 0.74, P.soil, 0, 0.08, 0, 0.04));
  const r = K.rng(id + 7);
  const n = [9, 12, 15][L - 1];
  for (let i = 0; i < n; i++) { const a = r() * 6.28, d = 0.08 + r() * 0.26, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.26 + r() * 0.14 + (L - 1) * 0.04; add(g, bar(x, 0.18, z, x, h + 0.1, z, 0.018, P.leaf), bl(0.065 + r() * 0.02, cs[i % cs.length], x, h + 0.14, z, 0.85, i), bl(0.04, P.leafLight, x, 0.26, z + 0.04, 0.5, i)); }
  for (let i = 0; i < 4; i++) add(g, bl(0.1, P.leaf, -0.28 + (i % 2) * 0.56, 0.22, -0.28 + (i >> 1) * 0.56, 0.7, i));
  if (L >= 2) { add(g, bl(0.025, P.gold, 0.2, 0.55, 0.2), bl(0.025, P.white, -0.15, 0.5, -0.1)); }
  if (L === 3) { for (const s of [-1, 1]) add(g, rb(0.05, 0.62, 0.05, TIM2, s * 0.4, 0.14, -0.38, 0.015)); add(g, lcyl('x', 0.05, 0.84, GOLD, 0, 0.78, -0.38, 6), sp(0.07, GOLD, 0, 0.84, -0.38, { lo: true })); for (let i = 0; i < 4; i++) add(g, bl(0.06, P.roofPink, -0.3 + i * 0.2, 0.74, -0.38)); }
  return finish(g, 0.9 + (L === 3 ? 0.1 : 0), [1.15, 1.15, 0.8]);
};
BUILD.lantern = (info) => {
  const L = lv(info), g = G();
  add(g, rb(0.46, 0.14, 0.46, STONE, 0, 0, 0, 0.05), cyl(0.07, 0.1, 0.3, STONEL, 0, 0.12, 0, 8), cyl(0.035, 0.05, 1.0 + (L - 1) * 0.12, L === 3 ? GOLDD : IRON, 0, 0.4, 0, 7));
  const top = 1.4 + (L - 1) * 0.12;
  add(g, bx(0.2, 0.03, 0.2, L === 3 ? GOLDD : IRON, 0, top - 0.02, 0));
  add(g, K.cyl(0.1, 0.1, 0.24, null, 0, top, 0, { seg: 6, mat: lanternMat }), cone(0.18, 0.16, L === 3 ? GOLD : P.roofRed, 0, top + 0.24, 0, 6, 0), sp(0.035, GOLD, 0, top + 0.43, 0, { lo: true }));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(g, bx(0.025, 0.26, 0.025, L === 3 ? GOLDD : IRON, Math.sin(a) * 0.105, top, Math.cos(a) * 0.105)); }
  if (L >= 2) { add(g, bar(0, top - 0.3, 0, 0.26, top - 0.3, 0, 0.03, IRON), bar(0.26, top - 0.3, 0, 0.26, top - 0.36, 0, 0.012, IRON)); lantern(g, 0.26, top - 0.5, 0, 0.8, L === 3); }
  if (L === 3) { add(g, bar(0, top - 0.3, 0, -0.26, top - 0.3, 0, 0.03, GOLDD)); lantern(g, -0.26, top - 0.5, 0, 0.8, true); }
  pot(g, 0.22, 0.14, 0.2, 0.9, P.roofPink);
  return finish(g, top + 0.55, [0.95, 0.95, 0.8]);
};
BUILD.fountain = (info) => {
  const L = lv(info), g = G();
  add(g, K.lathe([[0.001, 0], [0.84, 0], [0.9, 0.1], [0.9, 0.34], [0.78, 0.38], [0.78, 0.3]], STONE, 0, 0, 0, { seg: 16 }));
  add(g, cyl(0.93, 0.93, 0.06, STONEL, 0, 0.32, 0, 16));
  add(g, cyl(0.76, 0.76, 0.03, waterMat, 0, 0.3, 0, 16));
  add(g, cyl(0.16, 0.22, 0.36, STONEL, 0, 0.3, 0, 8), K.lathe([[0.001, 0.62], [0.32, 0.7], [0.4, 0.82], [0.3, 0.8], [0.001, 0.7]], STONEL, 0, 0, 0, { seg: 12 }), cyl(0.09, 0.12, 0.3, STONEL, 0, 0.68, 0, 8));
  add(g, K.lathe([[0.001, 1.0], [0.2, 1.04], [0.26, 1.12], [0.19, 1.1], [0.001, 1.04]], STONEL, 0, 0, 0, { seg: 10 }), cyl(0.2, 0.2, 0.02, waterMat, 0, 0.76, 0, 12));
  add(g, sp(0.12, waterMat, 0, 1.16, 0, { sy: 1.3, lo: true }));
  // water arcs (droplets)
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; for (const [d, h, r] of [[0.28, 0.9, 0.04], [0.5, 0.82, 0.04], [0.68, 0.5, 0.035]]) add(g, sp(r, waterMat, Math.sin(a) * d * 0.9, h - 0.08 * (d > 0.6 ? 1 : 0), Math.cos(a) * d * 0.9, { lo: true })); }
  for (let i = 0; i < 3; i++) add(g, sp(0.14 - i * 0.02, '#ffffff', Math.sin(i * 2.1) * 0.5, 0.36, Math.cos(i * 2.1) * 0.5, { sy: 0.4, lo: true }));
  for (const [x, z] of [[-0.7, 0.4], [0.62, -0.5], [0.3, 0.74]]) add(g, bl(0.08, STONED, x, 0.4, z, 0.7, x * 3));
  if (L >= 2) { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(g, cyl(0.06, 0.07, 0.6, IRON, Math.sin(a) * 0.95, 0.0, Math.cos(a) * 0.95, 7)); lantern(g, Math.sin(a) * 0.95, 0.6, Math.cos(a) * 0.95, 0.9, L === 3); } }
  if (L === 3) { add(g, sp(0.15, GOLD, 0, 1.4, 0, { sx: 1.3, sy: 0.8, lo: false }), bx(0.03, 0.2, 0.03, GOLDD, 0, 1.28, 0)); add(g, cone(0.07, 0.14, GOLD, 0.16, 1.4, 0, 3)); g.children[g.children.length - 1].rotation.z = -Math.PI / 2; for (let i = 0; i < 4; i++) add(g, bl(0.1, P.roofPink, Math.sin(i * 1.57 + 0.8) * 0.85, 0.42, Math.cos(i * 1.57 + 0.8) * 0.85, 0.7)); }
  return finish(g, L === 3 ? 1.65 : 1.35, [2.2, 2.2, 0.8]);
};
BUILD.banner = (info) => {
  const L = lv(info), own = info.color || P.red, g = G(), ph = [1.45, 1.6, 1.78][L - 1];
  add(g, rb(0.5, 0.14, 0.5, STONE, 0, 0, 0, 0.05), cyl(0.12, 0.16, 0.2, STONEL, 0, 0.1, 0, 8), cyl(0.04, 0.05, ph, L === 3 ? GOLDD : TIM2, 0, 0.2, 0, 7), sp(0.07, GOLD, 0, ph + 0.24, 0, { lo: true }));
  add(g, lcyl('x', 0.025, 0.66, L === 3 ? GOLDD : TIM, 0, ph - 0.05 + 0.08, 0, 6));
  const bannerH = [0.7, 0.78, 0.9][L - 1];
  const flag = G(rb(0.4, bannerH, 0.03, own, 0, -bannerH, 0, 0.015), bx(0.4, 0.05, 0.035, GOLD, 0, -0.08, 0), cone(0.2, 0.2, own, 0, -bannerH - 0.2, 0, 3, 0), star(0.1, GOLD, 0, -bannerH * 0.55, 0.025));
  flag.children[2].rotation.set(0, Math.PI / 2, Math.PI); flag.children[2].position.y = -bannerH; flag.children[2].scale.set(1, 1, 0.25);
  flag.children[2].rotation.set(Math.PI, 0, 0); flag.children[2].position.set(0, -bannerH - 0.01 + 0.0, 0); flag.children[2].scale.set(1, 1, 0.2); flag.children[2].position.y = -bannerH - 0.18 + 0.2 - 0.2 + 0.0;
  flag.name = 'flag'; flag.position.set(0, ph + 0.03, 0.0);
  for (const s of [-1, 1]) add(g, sp(0.035, GOLD, s * 0.33, ph + 0.03, 0, { lo: true }));
  if (L >= 2) { const f2 = rb(0.2, 0.3, 0.025, own, 0.27, ph - 0.9, 0.0, 0.01); add(g, f2, bar(0.04, ph - 0.58, 0, 0.27, ph - 0.58, 0, 0.02, TIM2)); }
  if (L === 3) { for (const s of [-1, 1]) add(g, bar(s * 0.18, ph + 0.03, 0.0, s * 0.18, ph - 0.05, 0.0, 0.0001, GOLD), sp(0.045, GOLD, s * 0.18, ph - 0.7, 0.03, { lo: true })); lantern(g, 0.3, 0.9, 0.0, 0.8, true); add(g, bar(0.0, 0.98, 0.0, 0.3, 0.98, 0.0, 0.02, GOLDD)); }
  const out = finish(g, ph + 0.4, [1.0, 1.0, 0.8]); out.add(flag); return out;
};

// ================================================================ FARM
const cropGreen = soft('#ffffff', { vertexColors: true }), cropGold = soft('#ffffff', { vertexColors: true }), cropEar = soft('#ffe27a', { emissive: '#7a5a10', emissiveIntensity: 0.15 });
cropGreen.color.set('#74cc4c'); cropGold.color.set('#f2c64c');
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
      g1.applyMatrix4(m); bl_.push(colorize(g1, 0.55, 1.05, 0, 0.4));
      const e = new THREE.ConeGeometry(0.036, 0.15, 5, 1, true); e.translate(0, 0.075, 0); const q = new THREE.Matrix4().compose(new THREE.Vector3(cx + Math.sin(a) * 0.04 + Math.sin(a) * 0.075, h * 0.88, Math.cos(a) * 0.04 + Math.cos(a) * 0.0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5)), new THREE.Vector3(1, 1, 1)); e.applyMatrix4(q); er.push(e);
    }
  }
  _rowGeo = mergeGeometries(bl_.map((x) => x.toNonIndexed()), false); _earGeo = mergeGeometries(er.map((x) => x.toNonIndexed()), false);
}
export function farmModel(info) {
  cropGeos(); const g = G();
  add(g, rb(2.9, 0.12, 1.9, P.soil, 0, 0, 0, 0.05), rb(2.76, 0.07, 1.76, P.soilDark, 0, 0.1, 0, 0.04));
  const rowsZ = [-0.66, -0.22, 0.22, 0.66];
  for (const z of rowsZ) add(g, rb(2.6, 0.1, 0.22, P.soil, 0, 0.14, z, 0.05), bx(2.55, 0.01, 0.05, shade(P.soilDark, -0.1), 0, 0.14, z + 0.17));
  // fence (front gate gap)
  const fc = P.plank, fx = 1.4, fz = 0.92, post = (x, z) => add(g, rb(0.08, 0.3, 0.08, TIM2, x, 0.08, z, 0.025));
  for (let i = 0; i <= 6; i++) { const x = -fx + i * (2 * fx / 6); post(x, -fz); if (Math.abs(x) > 0.3) post(x, fz); }
  for (const z of [-0.5, 0, 0.5]) { if (z === 0) { post(-fx, 0); post(fx, 0); } else { post(-fx, z * 1.8); post(fx, z * 1.8); } }
  for (const y of [0.17, 0.3]) {
    add(g, rb(2.86, 0.045, 0.04, fc, 0, y, -fz, 0.015), rb(1.08, 0.045, 0.04, fc, -0.88 - 0.0, y, fz, 0.015), rb(1.08, 0.045, 0.04, fc, 0.88, y, fz, 0.015), rb(0.04, 0.045, 1.84, fc, -fx, y, 0, 0.015), rb(0.04, 0.045, 1.84, fc, fx, y, 0, 0.015));
  }
  add(g, bx(0.08, 0.34, 0.08, TIM, -0.34, 0.08, fz), bx(0.08, 0.34, 0.08, TIM, 0.34, 0.08, fz));
  // scarecrow (back right)
  const sx = 1.0, sz = -0.6;
  add(g, bx(0.05, 0.62, 0.05, TIM2, sx, 0.12, sz), lcyl('x', 0.025, 0.56, TIM2, sx, 0.52, sz, 5), rb(0.2, 0.26, 0.14, P.roofBlue, sx, 0.33, sz, 0.04), sp(0.1, '#f1e0b8', sx, 0.74, sz, { lo: true }), cyl(0.15, 0.15, 0.02, P.thatch, sx, 0.8, sz, 8), cone(0.09, 0.14, P.roofRed, sx, 0.81, sz, 8, 0));
  for (const s of [-1, 1]) add(g, bl(0.05, P.thatch, sx + s * 0.3, 0.52, sz, 0.8), bl(0.045, P.thatch, sx + s * 0.1, 0.3, sz + 0.0, 0.8));
  add(g, bx(0.025, 0.025, 0.02, IRON, sx - 0.035, 0.76, sz + 0.095), bx(0.025, 0.025, 0.02, IRON, sx + 0.035, 0.76, sz + 0.095));
  // crops: one mesh per row (scale the row to grow it)
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
  add(g, rb(w - 0.1, 0.09, h - 0.1, P.soil, 0, 0, 0, 0.05), rb(w - 0.35, 0.05, h - 0.35, P.soilDark, 0, 0.08, 0, 0.03));
  // half-built stone course
  for (const s of [-1, 1]) { add(g, rb(w - 0.5, 0.2, 0.2, STONE, 0, 0.1, s * (hz - 0.12), 0.05)); }
  add(g, rb(0.2, 0.2, h - 0.8, STONE, -(hx - 0.12), 0.1, 0, 0.05)); add(g, rb(0.2, 0.14, h - 0.8, shade(STONE, -0.1), hx - 0.12, 0.1, 0, 0.05));
  // scaffold posts, rails, braces
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, rb(0.1, ph, 0.1, TIM2, sx * hx, 0.06, sz * hz, 0.03));
  for (const y of [0.6, ph - 0.02]) { for (const sz of [-1, 1]) add(g, bx(2 * hx, 0.07, 0.07, WOOD, 0, y, sz * hz)); for (const sx of [-1, 1]) add(g, bx(0.07, 0.07, 2 * hz, WOOD, sx * hx, y, 0)); }
  add(g, bar(-hx, 0.1, hz, hx, ph - 0.02, hz, 0.05, TIM), bar(hx, 0.1, hz, -hx, 0.6, hz, 0.04, TIM2), bar(hx, 0.1, -hz, hx, ph - 0.02, hz * 0.2, 0.05, TIM));
  // planks across the middle level (a work platform)
  for (let i = 0; i < 5; i++) add(g, rb(0.16, 0.04, Math.min(h - 0.5, 1.0), i % 2 ? WOODL : PLANK, -hx * 0.7 + i * 0.18, 0.62, -hz * 0.35, 0.012));
  // tarp draped over one side
  const tarp = rb(hx * 1.0, 0.04, 2 * hz * 0.7, '#e8dcc4', 0, 0, 0, 0.015); const tp = G(tarp); tp.position.set(hx * 0.45, ph - 0.05, 0.0); tp.rotation.z = -0.45; g.add(tp);
  for (let i = 0; i < 3; i++) add(g, bx(0.05, 0.03, 2 * hz * 0.7, P.red, hx * 0.2 + i * 0.12, ph - 0.1 - i * 0.06, 0.0)); g.children[g.children.length - 1].visible = false;
  // plank stack, barrel, bricks, sawhorse
  for (let i = 0; i < 5; i++) add(g, rb(0.55, 0.05, 0.26, i % 2 ? WOODL : PLANK, -hx + 0.34, 0.09 + i * 0.065, hz - 0.5 + (i % 2) * 0.03, 0.015));
  barrel(g, hx - 0.25, hz - 0.35, WOOD, 1.0, 0.09);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3 - r; c++) add(g, rb(0.18, 0.08, 0.1, P.brick, hx - 0.6 + c * 0.2 + r * 0.1, 0.09 + r * 0.085, -hz + 0.5, 0.02));
  add(g, rb(0.5, 0.05, 0.1, WOODL, 0.1, 0.34, hz - 0.35, 0.015), bar(-0.1, 0.09, hz - 0.28, -0.05, 0.36, hz - 0.35, 0.04, TIM), bar(0.3, 0.09, hz - 0.28, 0.25, 0.36, hz - 0.35, 0.04, TIM));
  // ladder
  for (const s of [-1, 1]) add(g, bar(-hx - 0.05, 0.08, s * 0.12 + 0.2, -hx - 0.05 + 0.0, ph - 0.1, s * 0.12 + 0.05, 0.04, TIM2));
  for (let i = 0; i < 5; i++) add(g, bx(0.04, 0.035, 0.28, WOODL, -hx - 0.05, 0.2 + i * 0.18, 0.12));
  // bunting + little flags
  bunting(g, [-hx, ph + 0.02, hz + 0.02], [hx, ph + 0.02, hz + 0.02], 8, 0.1, 0.07, 2);
  add(g, bar(hx, ph, -hz, hx, ph + 0.45, -hz, 0.03, TIM2), rb(0.22, 0.14, 0.02, P.gold, hx + 0.12, ph + 0.28, -hz, 0.01));
  add(g, bar(-hx, ph, -hz, -hx, ph + 0.45, -hz, 0.03, TIM2), rb(0.22, 0.14, 0.02, P.red, -hx + 0.12, ph + 0.28, -hz, 0.01));
  return finish(g, ph + 0.5, [w + 0.2, h + 0.2, 0.9]);
}

// ================================================================ export
export const BUILD_TYPES = Object.keys(BUILD);
