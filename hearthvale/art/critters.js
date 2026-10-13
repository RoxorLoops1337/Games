// Hearthvale critters: round, fluffy, toy-like animals + sky/air life. Procedural geometry only, vertex-coloured.
//
// WHAT I LEARNED (research notes, 10 bullets)
//  1. Cute = big head (35-45% of the body), tiny limbs, huge round eyes set low and wide, no neck. Babies' proportions read as "hug me".
//  2. Build animals from overlapping ellipsoids ("sausage and ball" method): a body blob, a head blob, stubby cylinders. Low-poly look comes from
//     few segments (5-8) plus smooth normals, not from flat facets, so the toy stays soft.
//  3. Sheep wool reads as fluffy when it is MANY overlapping puffs, each with its own light-top / dark-bottom gradient: the scalloped
//     silhouette and the shaded seams do the work of "fur". Dark face and legs give maximum contrast against the white wool.
//  4. Vertex colours + one shared material means a whole animal is 5-9 draw calls and every part can still carry its own gradient and AO.
//     Bake a cheap AO: darker and a little bluer toward the bottom of each blob (shadows blue-green, light warm).
//  5. Secondary motion sells life for free: tail wag, ear flop one beat behind the body, head counter-nod, breathing squash. Offset every
//     animal by a phase (seed) so a flock never moves in lockstep.
//  6. Squash and stretch: keep volume (scale y down => x/z up), stretch on take-off, squash on landing/anticipation (bunny hop, chicken peck).
//  7. Walk cycles: trot = diagonal legs in sync (FL+BR vs FR+BL); bob the body twice per stride (|sin|), roll it once per stride (waddle).
//     Blend between idle/walk/graze with eased weights, never snap poses.
//  8. Stylised clouds: flat-bottomed (domes with a disc floor) plus a few spheres on top, white lit from above and lavender-blue underneath,
//     slightly emissive so they never go grey. Blob shadow on the ground makes them feel like they float.
//  9. Flyers (birds, bees, butterflies): the wing is a pivot at the shoulder, flap = sine on the pivot rotation; bob the body against the
//     flap, add a ground blob shadow that shrinks with altitude so the creature is anchored in the scene.
// 10. Budget discipline: sphere tris = 2*w*(h-1), so a 6x4 puff is 36 tris. Spend tris on silhouette (ears, tail, head), not on the belly.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { soft, groundShadow, rng } from './artkit.js';

const PI = Math.PI;

/* ------------------------------------------------------------------ geometry kit (shared with props.js) */
const _cache = new Map();
const cached = (k, f) => { let v = _cache.get(k); if (!v) { v = f(); _cache.set(k, v); } return v; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Pillow-soft rounded box: only 2x2 quads per face (48 tris). Dimensions baked in, scale = 1. */
export function pboxGeo(w, h, d, r) {
  return cached(`pb${w},${h},${d},${r}`, () => {
    const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2), p = g.attributes.position, nr = g.attributes.normal;
    const v = new THREE.Vector3(), q = new THREE.Vector3();
    const cx = w / 2 - r, cy = h / 2 - r, cz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); q.set(clamp(v.x, -cx, cx), clamp(v.y, -cy, cy), clamp(v.z, -cz, cz)); v.sub(q);
      if (v.lengthSq() > 1e-9) { v.setLength(r); nr.setXYZ(i, v.x / r, v.y / r, v.z / r); }
      p.setXYZ(i, q.x + v.x, q.y + v.y, q.z + v.z);
    }
    return g;
  });
}
function jitterIco(seed, detail, amt) {
  return cached(`ji${seed},${detail},${amt}`, () => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, R = rng(seed), memo = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; let f = memo.get(k);
      if (!f) { f = 1 + (R() - 0.5) * 2 * amt; memo.set(k, f); } p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
    }
    g.computeVertexNormals(); return g;
  });
}
/** Unit primitives, cached. */
export const GEO = {
  sph: (w = 7, h = 5) => cached(`s${w},${h}`, () => new THREE.SphereGeometry(1, w, h)),
  dome: (w = 8, h = 3) => cached(`d${w},${h}`, () => mergeGeometries([new THREE.SphereGeometry(1, w, h, 0, PI * 2, 0, PI / 2).toNonIndexed(), new THREE.CircleGeometry(1, w).rotateX(PI / 2).toNonIndexed()])),
  cyl: (n = 6, rt = 1, open = false, hs = 1) => cached(`c${n},${rt},${open},${hs}`, () => new THREE.CylinderGeometry(rt, 1, 1, n, hs, open)),
  cone: (n = 5) => cached(`k${n}`, () => new THREE.ConeGeometry(1, 1, n, 1)),
  box: () => cached('bx', () => new THREE.BoxGeometry(1, 1, 1)),
  circle: (n = 8) => cached(`ci${n}`, () => new THREE.CircleGeometry(1, n).rotateX(-PI / 2)),
  ico: (seed = 1, detail = 0, amt = 0.14) => jitterIco(seed, detail, amt),
  disc: (n = 6) => cached(`di${n}`, () => new THREE.CircleGeometry(1, n)),
  halfCyl: (n = 8) => cached(`hc${n}`, () => new THREE.CylinderGeometry(1, 1, 1, n, 1, false, 0, PI)),
};

/* ------------------------------------------------------------------ builder: collects geometry with vertex colours, merges per material */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _base = new THREE.Color(), _c = new THREE.Color(), _tmp = new THREE.Color();
export const CMAT = soft('#ffffff', { vertexColors: true });

export class B {
  constructor(ox = 0, oy = 0, oz = 0, defMat = CMAT) { this.o = [ox, oy, oz]; this.defMat = defMat; this.map = new Map(); }
  /** generic: unit geometry g, colour, centre x,y,z, scale sx,sy,sz. o: r=[rx,ry,rz] rotation, sh=AO strength, fn(lx,ly,lz,t,nx,ny,nz)=>colour|null, facet, mat */
  put(g, col, x, y, z, sx, sy, sz, o = {}) {
    const geom = g.index ? g.toNonIndexed() : g.clone(); if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox, pos = geom.attributes.position, nrm = geom.attributes.normal, n = pos.count, cols = new Float32Array(n * 3);
    const hy = (bb.max.y - bb.min.y) || 1, sh = o.sh ?? 0.26; _base.set(col);
    const paint = (i, c, t) => {
      const s = 1 - t, k = (1 - sh * Math.pow(s, 1.2)) * 1.1;
      cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * (k + (1 - k) * 0.06); cols[i * 3 + 2] = c.b * (k + (1 - k) * 0.3);
    };
    for (let tri = 0; tri < n; tri += 3) {
      if (o.fn && o.facet) {
        const lx = (pos.getX(tri) + pos.getX(tri + 1) + pos.getX(tri + 2)) / 3, ly = (pos.getY(tri) + pos.getY(tri + 1) + pos.getY(tri + 2)) / 3, lz = (pos.getZ(tri) + pos.getZ(tri + 1) + pos.getZ(tri + 2)) / 3;
        const r = o.fn(lx, ly, lz, (ly - bb.min.y) / hy, 0, 0, 0); _c.copy(_base); if (r != null) _c.set(r);
        for (let j = 0; j < 3; j++) paint(tri + j, _c, (pos.getY(tri + j) - bb.min.y) / hy);
      } else {
        for (let j = 0; j < 3; j++) {
          const i = tri + j, ly = pos.getY(i), t = (ly - bb.min.y) / hy; _c.copy(_base);
          if (o.fn) { const r = o.fn(pos.getX(i), ly, pos.getZ(i), t, nrm.getX(i), nrm.getY(i), nrm.getZ(i)); if (r != null) _c.set(r); }
          paint(i, _c, t);
        }
      }
    }
    geom.deleteAttribute('uv'); geom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const r = o.r || [0, 0, 0]; _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e); _p.set(x + this.o[0], y + this.o[1], z + this.o[2]); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); geom.applyMatrix4(_m);
    const mat = o.mat || this.defMat; let l = this.map.get(mat); if (!l) { l = []; this.map.set(mat, l); } l.push(geom); return this;
  }
  sph(col, x, y, z, rx, ry = rx, rz = rx, o = {}) { return this.put(GEO.sph(o.w || 7, o.h || 5), col, x, y, z, rx, ry, rz, o); }
  dome(col, x, y, z, rx, ry = rx, rz = rx, o = {}) { return this.put(GEO.dome(o.w || 8, o.h || 3), col, x, y, z, rx, ry, rz, o); }
  /** cylinder centred at y: radius r (bottom), height h, o.rt = top radius ratio, o.n sides, o.open */
  cyl(col, x, y, z, r, h, o = {}) { return this.put(GEO.cyl(o.n || 6, o.rt ?? 1, !!o.open, o.hs || 1), col, x, y, z, r, h, o.rz ?? r, o); }
  cone(col, x, y, z, r, h, o = {}) { return this.put(GEO.cone(o.n || 5), col, x, y, z, r, h, o.rz ?? r, o); }
  box(col, x, y, z, w, h, d, o = {}) { return this.put(GEO.box(), col, x, y, z, w, h, d, o); }
  pbox(col, x, y, z, w, h, d, r, o = {}) { return this.put(pboxGeo(w, h, d, r), col, x, y, z, 1, 1, 1, o); }
  ico(col, x, y, z, rx, ry = rx, rz = rx, o = {}) { return this.put(GEO.ico(o.seed || 1, o.d || 0, o.amt ?? 0.14), col, x, y, z, rx, ry, rz, o); }
  /** merged meshes, one per material */
  build() {
    const out = [];
    for (const [mat, list] of this.map) { const m = new THREE.Mesh(mergeGeometries(list, false), mat); m.castShadow = true; m.receiveShadow = true; out.push(m); }
    return out;
  }
}
/** Named animatable part: pivot at (px,py,pz) in ROOT coordinates; fn(b) authors shapes in root coordinates too. */
export function part(parent, name, px, py, pz, fn, mat = CMAT) {
  const g = new THREE.Group(); if (name) g.name = name; const pv = parent.userData.pv || [0, 0, 0];
  g.position.set(px - pv[0], py - pv[1], pz - pv[2]); g.userData.pv = [px, py, pz]; parent.add(g);
  const b = new B(-px, -py, -pz, mat); fn(b); for (const m of b.build()) g.add(m); return g;
}
export function triCount(obj) { let n = 0; obj.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; }
export function meshCount(obj) { let n = 0; obj.traverse((o) => { if (o.isMesh) n++; }); return n; }

/* ------------------------------------------------------------------ helpers for animals */
const EYE = '#241a17';
/** Sticker eyes: a 6-tri disc laid on the head ellipsoid (centre c, radii rad) at azimuth az / elevation el, with a 4-tri highlight. 20 tris per pair instead of 40-60. */
function eyes(b, c, rad, az, el, r, hl = true) {
  for (const s of [1, -1]) {
    const a = s * az, ce = Math.cos(el), nx = Math.sin(a) * ce / rad[0], ny = Math.sin(el) / rad[1], nz = Math.cos(a) * ce / rad[2], nl = Math.hypot(nx, ny, nz);
    const px = c[0] + rad[0] * Math.sin(a) * ce, py = c[1] + rad[1] * Math.sin(el), pz = c[2] + rad[2] * Math.cos(a) * ce, yaw = Math.atan2(nx, nz), pit = -Math.asin(ny / nl), o = 0.006;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    b.put(GEO.disc(7), EYE, px + nx / nl * o, py + ny / nl * o, pz + nz / nl * o, r, r * 1.18, 1, { r: [pit, yaw, 0], sh: 0 });
    if (hl) b.put(GEO.disc(4), '#ffffff', px + nx / nl * (o + 0.004) + cy * r * 0.3 + 0 * sy, py + ny / nl * (o + 0.004) + r * 0.42, pz + nz / nl * (o + 0.004) - sy * r * 0.3, r * 0.36, r * 0.36, 1, { r: [pit, yaw, 0], sh: 0 });
  }
}
function legGroup(root, hipY, spots, make) {
  const L = new THREE.Group(); L.name = 'legs'; root.add(L);
  spots.forEach(([x, z], i) => part(L, 'leg' + i, x, hipY, z, (b) => make(b, x, z, i)));
  return L;
}
function shadowOf(root, r, op, sx, sz) { const s = groundShadow(r, op, sx, sz); s.name = 'shadow'; root.add(s); return s; }
function finish(root, kind, type, seed = 0, air = false) {
  const f = (n) => root.getObjectByName(n) || null, a = { type, kind, air, lt: -1, wW: 0, wG: 0, wF: 0 };
  a.body = f('body'); a.head = f('head'); a.tail = f('tail'); a.earL = f('earL'); a.earR = f('earR'); a.wingL = f('wingL'); a.wingR = f('wingR'); a.shadow = f('shadow');
  const L = f('legs'); a.legs = L ? L.children.slice() : [];
  a.by = a.body ? a.body.position.y : 0; a.hz = a.head ? a.head.position.z : 0; a.hy = a.head ? a.head.position.y : 0;
  a.elz = a.earL ? a.earL.rotation.z : 0; a.erz = a.earR ? a.earR.rotation.z : 0; a.wlz = a.wingL ? a.wingL.rotation.z : 0; a.wrz = a.wingR ? a.wingR.rotation.z : 0;
  a.ph = (seed * 2.399) % 6.2832; if (a.shadow) { a.sx = a.shadow.scale.x; a.sy = a.shadow.scale.y; }
  root.userData.critter = kind; root.userData._a = a; root.userData.phase = a.ph; return root;
}

/* ------------------------------------------------------------------ SHEEP */
export function sheepModel(seed = 0) {
  const R = rng(seed * 131 + 7), v = ((seed % 9) + 9) % 9;
  const wool = v === 5 ? '#fbbdd0' : v === 6 ? '#58504f' : v === 8 ? '#f8e8c6' : '#fffaf1';
  const sheared = v === 7, skin = '#f4c4b2', face = v === 6 ? '#8c7468' : sheared ? '#b08577' : '#66504a', leg = v === 6 ? '#3e3535' : '#4f3d39';
  const root = new THREE.Group(); shadowOf(root, 0.5, 0.3, 0.9, 1.3);
  part(root, 'body', 0, 0, 0, (b) => {
    if (!sheared) {
      b.sph(wool, 0, 0.44, -0.01, 0.3, 0.27, 0.37, { w: 7, h: 5 });
      const P = [[-0.2, 0.52, 0.13, 0.2], [0.2, 0.52, 0.13, 0.2], [0, 0.68, 0.02, 0.2], [-0.19, 0.5, -0.2, 0.2], [0.19, 0.5, -0.2, 0.2], [0, 0.5, -0.36, 0.17]];
      for (const [x, y, z, r] of P) b.sph(wool, x * (0.96 + R() * 0.08), y + R() * 0.03, z, r * (0.92 + R() * 0.16), r * 0.9, r, { w: 6, h: 4 });
    } else {
      b.sph(skin, 0, 0.4, 0, 0.2, 0.2, 0.31, { w: 8, h: 5 });
      b.sph(wool, 0, 0.56, 0.0, 0.1, 0.07, 0.12, { w: 5, h: 3 }); b.sph(wool, 0, 0.42, -0.31, 0.09, 0.09, 0.09, { w: 5, h: 3 });
    }
  });
  const body = root.getObjectByName('body');
  part(body, 'head', 0, 0.5, 0.3, (b) => {
    b.sph(face, 0, 0.53, 0.41, 0.13, 0.13, 0.145, { w: 7, h: 5 });
    b.sph(wool, 0, 0.66, 0.37, 0.12, 0.08, 0.11, { w: 5, h: 3 });
    b.sph('#f0a9a6', 0, 0.495, 0.545, 0.034, 0.024, 0.02, { w: 4, h: 3 });
    eyes(b, [0, 0.53, 0.41], [0.13, 0.13, 0.145], 0.6, 0.14, 0.04);
  });
  const head = body.getObjectByName('head');
  part(head, 'earL', 0.11, 0.59, 0.38, (b) => b.sph(face, 0.17, 0.585, 0.38, 0.07, 0.03, 0.045, { w: 4, h: 3, r: [0, 0, -0.35] }));
  part(head, 'earR', -0.11, 0.59, 0.38, (b) => b.sph(face, -0.17, 0.585, 0.38, 0.07, 0.03, 0.045, { w: 4, h: 3, r: [0, 0, 0.35] }));
  part(body, 'tail', 0, 0.5, -0.36, (b) => b.sph(sheared ? skin : wool, 0, 0.5, -0.43, 0.075, 0.075, 0.085, { w: 5, h: 3 }));
  legGroup(root, 0.2, [[0.13, 0.18], [-0.13, 0.18], [0.13, -0.18], [-0.13, -0.18]], (b, x, z) => b.cyl(leg, x, 0.1, z, 0.055, 0.2, { n: 5, rt: 0.85, open: true }));
  return finish(root, 'sheep', 0, seed);
}

/* ------------------------------------------------------------------ CHICKEN */
export function chickenModel(seed = 0) {
  const v = ((seed % 4) + 4) % 4, C = ['#fffaf0', '#cf8f50', '#f6c84e', '#5d5350'][v], W = ['#e8dfcd', '#a96d38', '#e2ab3a', '#3f3835'][v];
  const root = new THREE.Group(); shadowOf(root, 0.3, 0.28, 1, 1.1);
  part(root, 'body', 0, 0, 0, (b) => { b.sph(C, 0, 0.3, 0, 0.18, 0.2, 0.2, { w: 8, h: 6, r: [-0.45, 0, 0] }); if (v === 3) { b.sph('#fffaf0', 0, 0.37, 0.1, 0.07, 0.05, 0.05, { w: 4, h: 3 }); b.sph('#fffaf0', 0.07, 0.3, 0.05, 0.05, 0.04, 0.04, { w: 4, h: 3 }); } });
  const body = root.getObjectByName('body');
  part(body, 'head', 0, 0.48, 0.14, (b) => {
    b.sph(C, 0, 0.55, 0.19, 0.115, 0.11, 0.11, { w: 7, h: 5 });
    b.cone('#f4a131', 0, 0.53, 0.31, 0.04, 0.1, { n: 4, r: [PI / 2, 0, 0] });
    b.sph('#e8493c', 0, 0.665, 0.19, 0.03, 0.038, 0.06, { w: 4, h: 3 }); b.sph('#e8493c', 0, 0.64, 0.26, 0.026, 0.03, 0.03, { w: 4, h: 3 });
    b.sph('#e8493c', 0, 0.47, 0.29, 0.022, 0.04, 0.02, { w: 4, h: 3 });
    eyes(b, [0, 0.55, 0.19], [0.115, 0.11, 0.11], 1.0, 0.12, 0.03, false);
  });
  part(body, 'tail', 0, 0.38, -0.2, (b) => { b.sph(W, 0, 0.5, -0.26, 0.03, 0.1, 0.05, { w: 4, h: 3, r: [-0.5, 0, 0] }); b.sph(C, 0.05, 0.47, -0.24, 0.028, 0.09, 0.045, { w: 4, h: 3, r: [-0.5, 0, -0.5] }); b.sph(C, -0.05, 0.47, -0.24, 0.028, 0.09, 0.045, { w: 4, h: 3, r: [-0.5, 0, 0.5] }); });
  part(body, 'wingL', 0.15, 0.4, 0.0, (b) => b.sph(W, 0.18, 0.31, 0, 0.03, 0.1, 0.13, { w: 5, h: 4, r: [0, 0, 0.12] }));
  part(body, 'wingR', -0.15, 0.4, 0.0, (b) => b.sph(W, -0.18, 0.31, 0, 0.03, 0.1, 0.13, { w: 5, h: 4, r: [0, 0, -0.12] }));
  legGroup(root, 0.16, [[0.06, 0], [-0.06, 0]], (b, x) => { b.cyl('#f2a63a', x, 0.08, 0, 0.016, 0.16, { n: 4, open: true }); b.sph('#f2a63a', x, 0.012, 0.035, 0.04, 0.012, 0.055, { w: 5, h: 3, sh: 0.05 }); });
  return finish(root, 'chicken', 1, seed);
}

/* ------------------------------------------------------------------ COW */
export function cowModel(seed = 0) {
  const V = [{ c: '#fdf8ee', p: '#3d3430' }, { c: '#b97b4a', p: '#f6ead4' }, { c: '#f3e4c9', p: '#a86a3c' }][((seed % 3) + 3) % 3];
  const root = new THREE.Group(); shadowOf(root, 0.62, 0.3, 0.8, 1.45);
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph(V.c, 0, 0.62, 0, 0.35, 0.33, 0.58, { w: 8, h: 5 });
    b.sph(V.p, 0.17, 0.78, -0.05, 0.17, 0.12, 0.17, { w: 5, h: 3 }); b.sph(V.p, -0.2, 0.62, 0.22, 0.13, 0.15, 0.17, { w: 5, h: 3 }); b.sph(V.p, -0.1, 0.64, -0.38, 0.15, 0.14, 0.13, { w: 5, h: 3 });
    b.sph('#f6b4ae', 0, 0.37, -0.2, 0.1, 0.07, 0.1, { w: 5, h: 3 });
  });
  const body = root.getObjectByName('body');
  part(body, 'head', 0, 0.7, 0.55, (b) => {
    b.sph(V.c, 0, 0.72, 0.72, 0.2, 0.19, 0.19, { w: 7, h: 5 });
    b.sph('#f7b8b0', 0, 0.655, 0.88, 0.14, 0.095, 0.09, { w: 6, h: 4 });
    b.sph('#8a4a48', 0.05, 0.665, 0.965, 0.02, 0.02, 0.012, { w: 4, h: 2, sh: 0 }); b.sph('#8a4a48', -0.05, 0.665, 0.965, 0.02, 0.02, 0.012, { w: 4, h: 2, sh: 0 });
    b.cone('#f3e8cc', 0.13, 0.9, 0.7, 0.04, 0.13, { n: 4, r: [0, 0, -0.5] }); b.cone('#f3e8cc', -0.13, 0.9, 0.7, 0.04, 0.13, { n: 4, r: [0, 0, 0.5] });
    b.sph(V.p, 0, 0.9, 0.74, 0.08, 0.04, 0.07, { w: 5, h: 3 });
    eyes(b, [0, 0.72, 0.72], [0.2, 0.19, 0.19], 0.62, 0.1, 0.04);
    b.cyl('#d9503d', 0, 0.62, 0.6, 0.17, 0.05, { n: 8, open: true, r: [0.4, 0, 0] }); b.sph('#ffd24a', 0, 0.57, 0.76, 0.045, 0.045, 0.04, { w: 4, h: 3 });
  });
  const head = body.getObjectByName('head');
  part(head, 'earL', 0.19, 0.8, 0.7, (b) => b.sph(V.c, 0.28, 0.79, 0.7, 0.1, 0.035, 0.065, { w: 5, h: 3, r: [0, 0, -0.3] }));
  part(head, 'earR', -0.19, 0.8, 0.7, (b) => b.sph(V.c, -0.28, 0.79, 0.7, 0.1, 0.035, 0.065, { w: 5, h: 3, r: [0, 0, 0.3] }));
  part(body, 'tail', 0, 0.85, -0.57, (b) => { b.cyl(V.c, 0, 0.65, -0.62, 0.02, 0.4, { n: 4, open: true }); b.sph(V.p, 0, 0.43, -0.62, 0.05, 0.07, 0.05, { w: 5, h: 3 }); });
  legGroup(root, 0.38, [[0.2, 0.38], [-0.2, 0.38], [0.2, -0.36], [-0.2, -0.36]], (b, x, z) => b.cyl(V.c, x, 0.19, z, 0.085, 0.38, { n: 5, rt: 0.85, open: true }));
  return finish(root, 'cow', 0, seed);
}

/* ------------------------------------------------------------------ DOG */
export function dogModel(seed = 0) {
  const V = [{ c: '#e3a65a', l: '#f8dba6', d: '#c0803a' }, { c: '#9b6a42', l: '#e9cba4', d: '#744c2c' }, { c: '#f8f1e4', l: '#ffffff', d: '#8a5a3a' }, { c: '#80848e', l: '#dde0e6', d: '#5b5f69' }][((seed % 4) + 4) % 4];
  const root = new THREE.Group(); shadowOf(root, 0.34, 0.28, 0.9, 1.4);
  part(root, 'body', 0, 0, 0, (b) => { b.sph(V.c, 0, 0.3, -0.02, 0.16, 0.16, 0.26, { w: 8, h: 5 }); if (((seed % 4) + 4) % 4 === 2) b.sph(V.d, 0.07, 0.4, -0.06, 0.1, 0.06, 0.12, { w: 5, h: 3 }); });
  const body = root.getObjectByName('body');
  part(body, 'head', 0, 0.44, 0.22, (b) => {
    b.sph(V.c, 0, 0.48, 0.27, 0.14, 0.13, 0.13, { w: 7, h: 5 }); b.sph(V.l, 0, 0.435, 0.38, 0.07, 0.055, 0.07, { w: 6, h: 3 });
    b.sph('#2b2220', 0, 0.455, 0.445, 0.032, 0.024, 0.024, { w: 4, h: 3, sh: 0 }); b.sph('#f08a9a', 0, 0.4, 0.4, 0.02, 0.008, 0.035, { w: 4, h: 2, sh: 0 });
    eyes(b, [0, 0.48, 0.27], [0.14, 0.13, 0.13], 0.55, 0.2, 0.034);
    b.cyl('#e8564a', 0, 0.39, 0.2, 0.125, 0.045, { n: 8, open: true, r: [0.5, 0, 0] });
  });
  const head = body.getObjectByName('head');
  part(head, 'earL', 0.1, 0.56, 0.25, (b) => b.sph(V.d, 0.15, 0.5, 0.25, 0.045, 0.1, 0.07, { w: 5, h: 4, r: [0, 0, -0.3] }));
  part(head, 'earR', -0.1, 0.56, 0.25, (b) => b.sph(V.d, -0.15, 0.5, 0.25, 0.045, 0.1, 0.07, { w: 5, h: 4, r: [0, 0, 0.3] }));
  part(body, 'tail', 0, 0.38, -0.27, (b) => { b.sph(V.c, 0, 0.42, -0.31, 0.042, 0.065, 0.042, { w: 5, h: 3, r: [-0.5, 0, 0] }); b.sph(V.c, 0, 0.5, -0.34, 0.042, 0.065, 0.042, { w: 5, h: 3 }); b.sph(V.l, 0, 0.57, -0.33, 0.04, 0.05, 0.04, { w: 5, h: 3 }); });
  legGroup(root, 0.2, [[0.09, 0.17], [-0.09, 0.17], [0.09, -0.17], [-0.09, -0.17]], (b, x, z) => b.cyl(V.c, x, 0.1, z, 0.04, 0.2, { n: 5, open: true }));
  return finish(root, 'dog', 0, seed);
}

/* ------------------------------------------------------------------ CAT */
export function catModel(seed = 0) {
  const vi = ((seed % 4) + 4) % 4, V = [{ c: '#f2a04c', s: '#c9702b', l: '#fff0d8' }, { c: '#929bab', s: '#6d7585', l: '#e6e9ef' }, { c: '#403a46', s: '#2c2831', l: '#6a6270' }, { c: '#fbf4ea', s: '#e29a55', l: '#ffffff' }][vi];
  const root = new THREE.Group(); shadowOf(root, 0.28, 0.28, 0.8, 1.5);
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph(V.c, 0, 0.25, 0, 0.12, 0.13, 0.22, { w: 8, h: 5 });
    if (vi === 0 || vi === 1) for (let i = 0; i < 3; i++) b.sph(V.s, 0, 0.365 - i * 0.012, -0.1 + i * 0.08, 0.1, 0.028, 0.022, { w: 5, h: 3 });
    if (vi === 3) { b.sph(V.s, 0.06, 0.33, -0.05, 0.08, 0.06, 0.1, { w: 5, h: 3 }); b.sph('#3d3630', -0.07, 0.29, 0.09, 0.07, 0.07, 0.08, { w: 5, h: 3 }); }
  });
  const body = root.getObjectByName('body');
  part(body, 'head', 0, 0.36, 0.2, (b) => {
    b.sph(V.c, 0, 0.4, 0.22, 0.128, 0.11, 0.11, { w: 7, h: 5 }); b.sph(V.l, 0, 0.365, 0.315, 0.05, 0.038, 0.035, { w: 5, h: 3 });
    b.sph('#ef8fa0', 0, 0.385, 0.345, 0.016, 0.012, 0.01, { w: 4, h: 2, sh: 0 });
    eyes(b, [0, 0.4, 0.22], [0.128, 0.11, 0.11], 0.6, 0.22, 0.036);
  });
  const head = body.getObjectByName('head');
  part(head, 'earL', 0.075, 0.49, 0.2, (b) => b.cone(V.c, 0.082, 0.54, 0.2, 0.045, 0.1, { n: 4, r: [0, 0, -0.15] }));
  part(head, 'earR', -0.075, 0.49, 0.2, (b) => b.cone(V.c, -0.082, 0.54, 0.2, 0.045, 0.1, { n: 4, r: [0, 0, 0.15] }));
  part(body, 'tail', 0, 0.28, -0.2, (b) => { const P = [[0.28, -0.26, 0.042], [0.35, -0.32, 0.04], [0.44, -0.34, 0.038], [0.53, -0.31, 0.036]]; for (const [y, z, r] of P) b.sph(V.c, 0, y, z, r, r, r, { w: 5, h: 3 }); b.sph(vi === 0 ? V.s : V.l, 0, 0.545, -0.295, 0.034, 0.034, 0.034, { w: 5, h: 3 }); });
  legGroup(root, 0.15, [[0.07, 0.14], [-0.07, 0.14], [0.07, -0.14], [-0.07, -0.14]], (b, x, z) => b.cyl(V.c, x, 0.075, z, 0.035, 0.15, { n: 5, open: true }));
  return finish(root, 'cat', 0, seed);
}

/* ------------------------------------------------------------------ DUCK */
export function duckModel(seed = 0) {
  const V = [{ c: '#fffdf4', h: '#fffdf4', w: '#ece6d4' }, { c: '#ffd84a', h: '#ffd84a', w: '#f0be2e' }, { c: '#a98d6c', h: '#2c8c6a', w: '#85694b' }][((seed % 3) + 3) % 3];
  const root = new THREE.Group(); shadowOf(root, 0.28, 0.28, 1, 1.2);
  part(root, 'body', 0, 0, 0, (b) => { b.sph(V.c, 0, 0.2, -0.02, 0.15, 0.125, 0.2, { w: 8, h: 5 }); });
  const body = root.getObjectByName('body');
  part(body, 'tail', 0, 0.25, -0.18, (b) => b.cone(V.c, 0, 0.28, -0.22, 0.05, 0.1, { n: 4, r: [-0.9, 0, 0] }));
  part(body, 'head', 0, 0.28, 0.12, (b) => {
    b.sph(V.h, 0, 0.37, 0.15, 0.095, 0.095, 0.095, { w: 7, h: 5 }); b.sph('#f6a432', 0, 0.345, 0.24, 0.052, 0.024, 0.062, { w: 5, h: 3, sh: 0.12 });
    eyes(b, [0, 0.37, 0.15], [0.095, 0.095, 0.095], 0.85, 0.15, 0.028, false);
  });
  part(body, 'wingL', 0.13, 0.26, 0, (b) => b.sph(V.w, 0.155, 0.2, -0.02, 0.03, 0.08, 0.13, { w: 5, h: 4 }));
  part(body, 'wingR', -0.13, 0.26, 0, (b) => b.sph(V.w, -0.155, 0.2, -0.02, 0.03, 0.08, 0.13, { w: 5, h: 4 }));
  legGroup(root, 0.09, [[0.05, 0], [-0.05, 0]], (b, x) => { b.cyl('#f2992e', x, 0.05, 0, 0.014, 0.09, { n: 4, open: true }); b.sph('#f6a432', x, 0.012, 0.04, 0.045, 0.012, 0.06, { w: 5, h: 3, sh: 0.05 }); });
  return finish(root, 'duck', 1, seed);
}

/* ------------------------------------------------------------------ BUNNY */
export function bunnyModel(seed = 0) {
  const V = [{ c: '#f8f3ec', i: '#f6b9c4', l: '#ffffff' }, { c: '#c99a6c', i: '#f1b0a6', l: '#f0dcc0' }, { c: '#aaa8aa', i: '#f3b4c0', l: '#e4e2e2' }, { c: '#ead5b6', i: '#f4b0b0', l: '#fff6e6' }][((seed % 4) + 4) % 4];
  const root = new THREE.Group(); shadowOf(root, 0.24, 0.28, 1, 1.2);
  part(root, 'body', 0, 0, 0, (b) => b.sph(V.c, 0, 0.19, -0.02, 0.14, 0.15, 0.19, { w: 8, h: 5 }));
  const body = root.getObjectByName('body');
  part(body, 'tail', 0, 0.2, -0.19, (b) => b.sph(V.l, 0, 0.2, -0.21, 0.06, 0.06, 0.06, { w: 6, h: 4, sh: 0.15 }));
  part(body, 'head', 0, 0.33, 0.13, (b) => {
    b.sph(V.c, 0, 0.37, 0.15, 0.115, 0.105, 0.105, { w: 7, h: 5 }); b.sph(V.l, 0, 0.335, 0.235, 0.045, 0.035, 0.035, { w: 5, h: 3 });
    b.sph('#f08ca0', 0, 0.35, 0.265, 0.018, 0.014, 0.012, { w: 4, h: 3, sh: 0 }); eyes(b, [0, 0.37, 0.15], [0.115, 0.105, 0.105], 0.62, 0.2, 0.034);
  });
  const head = body.getObjectByName('head');
  const ear = (b, s) => { b.sph(V.c, s * 0.055, 0.56, 0.1, 0.034, 0.115, 0.026, { w: 5, h: 4, r: [0.15, 0, -s * 0.12] }); b.sph(V.i, s * 0.055, 0.555, 0.116, 0.02, 0.09, 0.012, { w: 4, h: 3, r: [0.15, 0, -s * 0.12], sh: 0.1 }); };
  part(head, 'earL', 0.045, 0.44, 0.1, (b) => ear(b, 1)); part(head, 'earR', -0.045, 0.44, 0.1, (b) => ear(b, -1));
  legGroup(root, 0.1, [[0.05, 0.17], [-0.05, 0.17], [0.085, 0.04], [-0.085, 0.04]], (b, x, z, i) => {
    if (i < 2) b.sph(V.c, x, 0.04, z, 0.03, 0.035, 0.035, { w: 4, h: 3 }); else b.sph(V.c, x, 0.04, z + 0.02, 0.045, 0.04, 0.1, { w: 5, h: 3 });
  });
  return finish(root, 'bunny', 2, seed);
}

/* ------------------------------------------------------------------ BIRD (flying, origin = body centre) */
export function birdModel(seed = 0) {
  const vi = ((seed % 3) + 3) % 3, V = [{ c: '#5ba9ea', b: '#fff4dc', w: '#3f86cf' }, { c: '#a8603c', b: '#ee6a48', w: '#7e4428' }, { c: '#ffd24a', b: '#fff0a8', w: '#e8a92a' }][vi];
  const root = new THREE.Group(); const sh = shadowOf(root, 0.14, 0.3, 1, 1); sh.position.y = -0.25;
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph(V.c, 0, 0, 0, 0.1, 0.09, 0.13, { w: 7, h: 5 }); b.sph(V.b, 0, -0.035, 0.03, 0.075, 0.06, 0.09, { w: 5, h: 4, sh: 0.1 });
  });
  const body = root.getObjectByName('body');
  part(body, 'head', 0, 0.05, 0.1, (b) => { b.sph(V.c, 0, 0.1, 0.12, 0.078, 0.075, 0.075, { w: 6, h: 4 }); b.cone('#f6a432', 0, 0.095, 0.2, 0.025, 0.06, { n: 4, r: [PI / 2, 0, 0] }); eyes(b, [0, 0.1, 0.12], [0.078, 0.075, 0.075], 0.85, 0.15, 0.021, false); });
  part(body, 'wingL', 0.07, 0.04, 0, (b) => { b.sph(V.w, 0.16, 0.04, -0.01, 0.1, 0.014, 0.07, { w: 6, h: 3 }); b.sph(V.c, 0.1, 0.045, 0.01, 0.05, 0.016, 0.06, { w: 4, h: 3 }); });
  part(body, 'wingR', -0.07, 0.04, 0, (b) => { b.sph(V.w, -0.16, 0.04, -0.01, 0.1, 0.014, 0.07, { w: 6, h: 3 }); b.sph(V.c, -0.1, 0.045, 0.01, 0.05, 0.016, 0.06, { w: 4, h: 3 }); });
  part(body, 'tail', 0, 0, -0.12, (b) => b.sph(V.w, 0, 0.0, -0.2, 0.045, 0.012, 0.09, { w: 5, h: 3 }));
  return finish(root, 'bird', 3, seed, true);
}

/* ------------------------------------------------------------------ BUTTERFLY */
const WINGMAT = soft('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
export function butterflyModel(color = '#ff8fb3') {
  const root = new THREE.Group(); const sh = shadowOf(root, 0.1, 0.25, 1, 1); sh.position.y = -0.5;
  const base = new THREE.Color(color), rim = base.clone().lerp(new THREE.Color('#ffffff'), 0.55), dot = base.clone().lerp(new THREE.Color('#3a2430'), 0.7);
  part(root, 'body', 0, 0, 0, (b) => { b.cyl('#4a3328', 0, 0, 0, 0.013, 0.1, { n: 5, r: [PI / 2, 0, 0], sh: 0 }); b.sph('#4a3328', 0, 0, 0.06, 0.02, 0.02, 0.02, { w: 5, h: 3, sh: 0 }); });
  const wing = (s) => (b) => {
    const fn = (lx, ly, lz) => { const r = Math.hypot(lx, lz); return r > 0.9 ? rim : r < 0.15 ? dot : base; };
    b.put(GEO.circle(8), base, s * 0.07, 0, 0.035, 0.1, 1, 0.085, { fn, mat: WINGMAT, sh: 0, r: [0, 0, 0] });
    b.put(GEO.circle(8), base, s * 0.05, -0.001, -0.04, 0.07, 1, 0.06, { fn, mat: WINGMAT, sh: 0 });
    b.put(GEO.circle(6), dot, s * 0.085, 0.002, 0.045, 0.028, 1, 0.025, { mat: WINGMAT, sh: 0 });
  };
  const body = root.getObjectByName('body');
  part(body, 'wingL', 0, 0, 0, wing(1), WINGMAT); part(body, 'wingR', 0, 0, 0, wing(-1), WINGMAT);
  return finish(root, 'butterfly', 3, 0, true);
}

/* ------------------------------------------------------------------ FISH (origin = body centre, swims toward +z) */
export function fishModel(color = '#ff9a3c') {
  const base = new THREE.Color(color), belly = base.clone().lerp(new THREE.Color('#fff4e0'), 0.65), fin = base.clone().lerp(new THREE.Color('#ffffff'), 0.2).multiplyScalar(0.9);
  const root = new THREE.Group(); const sh = shadowOf(root, 0.2, 0.18, 0.6, 1.2); sh.position.y = -0.2;
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph(color, 0, 0, 0, 0.09, 0.105, 0.2, { w: 8, h: 6, fn: (x, y) => (y < -0.25 ? belly : null) });
    for (const s of [1, -1]) { b.sph('#ffffff', s * 0.075, 0.035, 0.12, 0.03, 0.03, 0.03, { w: 5, h: 3, sh: 0 }); b.sph(EYE, s * 0.095, 0.035, 0.13, 0.016, 0.018, 0.016, { w: 4, h: 2, sh: 0 }); }
    b.cone(fin, 0, 0.115, -0.03, 0.012, 0.12, { n: 3, rz: 0.1, r: [-0.4, 0, 0] });
  });
  const body = root.getObjectByName('body');
  part(body, 'tail', 0, 0, -0.17, (b) => b.cone(fin, 0, 0, -0.27, 0.012, 0.15, { n: 4, rz: 0.11, r: [PI / 2, 0, 0], sh: 0 }), WINGMAT);
  part(body, 'wingL', 0.07, -0.03, 0.04, (b) => b.cone(fin, 0.12, -0.04, 0.0, 0.01, 0.1, { n: 3, rz: 0.04, r: [0, 0, -1.1] }), WINGMAT);
  part(body, 'wingR', -0.07, -0.03, 0.04, (b) => b.cone(fin, -0.12, -0.04, 0.0, 0.01, 0.1, { n: 3, rz: 0.04, r: [0, 0, 1.1] }), WINGMAT);
  return finish(root, 'fish', 4, 0, true);
}

/* ------------------------------------------------------------------ CLOUD */
export const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, metalness: 0, emissive: '#e3ecff', emissiveIntensity: 0.5 });
export function cloudModel(seed = 0) {
  const R = rng(seed * 53 + 11), n = 4 + ((R() * 2) | 0); const root = new THREE.Group();
  const sh = groundShadow(1, 0.13, 3.6, 1.8); sh.name = 'shadow'; root.add(sh);
  part(root, 'body', 0, 0, 0, (b) => {
    for (let i = 0; i < n; i++) { const u = n === 1 ? 0 : i / (n - 1) - 0.5, r = 0.95 - Math.abs(u) * 0.55 + R() * 0.15; b.dome('#ffffff', u * 3.6, 0, (R() - 0.5) * 0.5, r, r * 0.72, r * 0.85, { w: 8, h: 3, sh: 0.24 }); }
    const tops = 2 + ((R() * 2) | 0);
    for (let i = 0; i < tops; i++) { const u = tops === 1 ? 0 : i / (tops - 1) - 0.5, r = 0.85 - Math.abs(u) * 0.4 + R() * 0.15; b.sph('#ffffff', u * 2.0 + (R() - 0.5) * 0.3, r * 0.5, (R() - 0.5) * 0.3, r, r * 0.8, r * 0.85, { w: 7, h: 4, sh: 0.28 }); }
  }, cloudMat);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return finish(root, 'cloud', 5, seed, true);
}

/* ------------------------------------------------------------------ BEE */
export function beeModel() {
  const root = new THREE.Group(); const sh = shadowOf(root, 0.08, 0.25, 1, 1); sh.position.y = -0.4;
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph('#ffd23c', 0, 0, 0, 0.07, 0.07, 0.1, { w: 10, h: 8, facet: true, fn: (x, y, z) => (Math.floor((z + 1) * 2.6) % 2 === 1 ? '#3a2a22' : null) });
    b.cone('#3a2a22', 0, 0, -0.12, 0.02, 0.05, { n: 3, r: [-PI / 2, 0, 0] });
  });
  const body = root.getObjectByName('body');
  part(body, 'head', 0, 0, 0.09, (b) => { b.sph('#3a2a22', 0, 0.005, 0.12, 0.05, 0.05, 0.045, { w: 6, h: 4 }); for (const s of [1, -1]) b.sph('#ffffff', s * 0.03, 0.02, 0.15, 0.014, 0.016, 0.01, { w: 4, h: 2, sh: 0 }); });
  const wm = new THREE.MeshStandardMaterial({ color: '#e6f6ff', roughness: 0.3, transparent: true, opacity: 0.7, side: THREE.DoubleSide, vertexColors: true, depthWrite: false });
  part(body, 'wingL', 0.03, 0.065, -0.01, (b) => b.sph('#ffffff', 0.07, 0.085, -0.01, 0.055, 0.004, 0.03, { w: 5, h: 3, sh: 0, r: [0, -0.4, 0.3] }), wm);
  part(body, 'wingR', -0.03, 0.065, -0.01, (b) => b.sph('#ffffff', -0.07, 0.085, -0.01, 0.055, 0.004, 0.03, { w: 5, h: 3, sh: 0, r: [0, 0.4, -0.3] }), wm);
  return finish(root, 'bee', 3, 0, true);
}

export const CRITTERS = { sheep: sheepModel, chicken: chickenModel, cow: cowModel, dog: dogModel, cat: catModel, duck: duckModel, bunny: bunnyModel, bird: birdModel, butterfly: butterflyModel, fish: fishModel, cloud: cloudModel, bee: beeModel };

/* ------------------------------------------------------------------ ANIMATION (no allocation per call) */
const GA = {
  sheep: { f: 6.2, bob: 0.05, leg: 0.6, sway: 0.07, pitch: 0.04, tf: 9, ta: 0.35, er: 0.12 },
  cow: { f: 4.2, bob: 0.03, leg: 0.42, sway: 0.04, pitch: 0.03, tf: 2.2, ta: 0.4, er: 0.1 },
  dog: { f: 9.5, bob: 0.045, leg: 0.8, sway: 0.05, pitch: 0.06, tf: 13, ta: 0.7, er: 0.2 },
  cat: { f: 7.5, bob: 0.02, leg: 0.7, sway: 0.03, pitch: 0.04, tf: 2.6, ta: 0.35, er: 0.06 },
  chicken: { f: 9, bob: 0.025, leg: 0.8, sway: 0.07, nod: 0.035 },
  duck: { f: 6.5, bob: 0.02, leg: 0.7, sway: 0.16, nod: 0.01 },
  bunny: { f: 5.4 },
  bird: { fidle: 3, ffly: 15, amp: 0.8 }, bee: { fidle: 30, ffly: 44, amp: 0.55 }, butterfly: { fidle: 3.5, ffly: 11, amp: 0.8 },
};
const quad = (a, t, sp, ph, P) => {
  const W = a.wW, Gz = a.wG, w = t * sp * P.f + ph, s1 = Math.sin(w), s2 = Math.sin(2 * w), c2 = Math.cos(2 * w), body = a.body, idle = 1 - W;
  body.position.y = a.by + W * Math.abs(s1) * P.bob; body.rotation.z = W * s1 * P.sway; body.rotation.x = W * s2 * P.pitch + Gz * 0.12;
  const sq = Math.sin(t * 2.2 * sp + ph) * 0.018 * idle + W * c2 * 0.025; body.scale.y = 1 + sq; body.scale.x = body.scale.z = 1 - sq * 0.5;
  const L = a.legs; for (let i = 0; i < L.length; i++) L[i].rotation.x = W * Math.sin(w + (i === 1 || i === 2 ? PI : 0)) * P.leg;
  const h = a.head; if (h) { h.rotation.x = Gz * (0.78 + Math.sin(t * 5.5 * sp + ph) * 0.09) + W * s2 * 0.05 + idle * (1 - Gz) * Math.sin(t * 1.1 + ph) * 0.05; h.rotation.y = idle * (1 - Gz * 0.8) * Math.sin(t * 0.55 * sp + ph * 1.7) * 0.45; }
  if (a.earL) { let tw = Math.max(0, Math.sin(t * 1.3 + ph * 5)); tw = tw * tw * tw * tw * 0.5; const fl = Math.sin(t * 3 * sp + ph) * 0.05 + W * s2 * P.er; a.earL.rotation.z = a.elz + fl + tw; a.earR.rotation.z = a.erz - fl; }
  if (a.tail) { a.tail.rotation.y = Math.sin(t * P.tf * sp + ph) * P.ta * (1 + W * 0.5); a.tail.rotation.x = W * s1 * 0.08; }
};
const biped = (a, t, sp, ph, P) => {
  const W = a.wW, Gz = a.wG, F = a.wF, w = t * sp * P.f + ph, s1 = Math.sin(w), body = a.body, idle = 1 - W - F;
  let pk = Math.sin(t * sp * 5.5 + ph); pk = pk > 0 ? pk * pk : 0;
  body.position.y = a.by + W * Math.abs(s1) * P.bob + F * (0.1 + 0.05 * Math.sin(t * sp * 18));
  body.rotation.z = W * s1 * P.sway; body.rotation.x = Gz * (0.25 + 0.55 * pk) - F * 0.25;
  const sq = Math.sin(t * 2.6 * sp + ph) * 0.02 * idle - Gz * pk * 0.04; body.scale.y = 1 + sq; body.scale.x = body.scale.z = 1 - sq * 0.5;
  const L = a.legs; L[0].rotation.x = W * s1 * P.leg + F * 0.7; L[1].rotation.x = -W * s1 * P.leg + F * 0.7;
  const h = a.head; h.position.z = a.hz + W * s1 * P.nod; h.rotation.x = Gz * 0.55 * pk - F * 0.2; h.rotation.y = idle * Math.sin(t * 0.9 * sp + ph * 1.7) * 0.5 + W * s1 * 0.12;
  const fl = F * (0.9 + 0.9 * Math.sin(t * sp * 24 + ph)) + (1 - F) * (0.04 + 0.04 * Math.sin(t * 2 + ph) + W * 0.1 * s1);
  a.wingL.rotation.z = a.wlz + fl; a.wingR.rotation.z = a.wrz - fl;
  a.tail.rotation.x = Math.sin(t * 2.2 * sp + ph) * 0.06 + W * s1 * 0.12 + Gz * pk * 0.2;
};
const hopper = (a, t, sp, ph, P) => {
  const W = a.wW, Gz = a.wG, w = t * sp * P.f + ph, hs = Math.sin(w), hop = Math.max(0, hs), cr = Math.max(0, -hs), body = a.body, idle = 1 - W;
  body.position.y = a.by + W * hop * 0.2; body.rotation.x = W * (-hop * 0.3 + cr * 0.12) + Gz * 0.1;
  const sy = 1 + W * (hop * 0.07 - cr * 0.1) + idle * Math.sin(t * 2.4 * sp + ph) * 0.02; body.scale.y = sy; body.scale.x = body.scale.z = 1 / Math.sqrt(sy);
  const L = a.legs; L[0].rotation.x = L[1].rotation.x = W * (hop * 0.7 - cr * 0.2); L[2].rotation.x = L[3].rotation.x = W * (-hop * 0.9 + cr * 0.5);
  const h = a.head; h.rotation.x = Gz * (0.5 + 0.1 * Math.sin(t * 16 * sp)) + idle * (1 - Gz) * (Math.sin(t * 1.1 + ph) * 0.05 + Math.max(0, Math.sin(t * 7 + ph)) * Math.max(0, Math.sin(t * 0.7 + ph * 3)) * 0.05) + W * (-hop * 0.2);
  h.rotation.y = idle * (1 - Gz) * Math.sin(t * 0.5 * sp + ph * 1.7) * 0.5;
  let tw = Math.max(0, Math.sin(t * 1.1 + ph * 5)); tw = tw * tw * tw * tw * 0.6;
  const lag = W * (-hop * 0.45 + cr * 0.3); a.earL.rotation.x = lag + Gz * 0.1; a.earR.rotation.x = lag + Gz * 0.1;
  a.earL.rotation.z = a.elz + Math.sin(t * 2 + ph) * 0.04 + tw; a.earR.rotation.z = a.erz - Math.sin(t * 2 + ph) * 0.04;
  a.tail.rotation.x = W * hop * 0.3;
};
const flyer = (a, t, sp, ph, P, always) => {
  const F = always ? 1 : a.wF, W = a.wW, fr = (P.fidle + (P.ffly - P.fidle) * (always ? a.wF : F)) * sp, ws = Math.sin(t * fr + ph), body = a.body;
  const amp = P.amp * (always ? 0.45 + 0.55 * a.wF : 1);
  const fold = always ? 0 : -1.2, ang = fold + (always ? amp * ws + 0.15 : (1.2 + 0.15 + amp * ws)) * (always ? 1 : F);
  a.wingL.rotation.z = ang; a.wingR.rotation.z = -ang;
  body.position.y = a.by + (always ? Math.sin(t * 2.3 * sp + ph) * 0.03 + ws * 0.02 * a.wF : Math.sin(t * 2.3 * sp + ph) * 0.012 * F + W * Math.abs(Math.sin(t * 9 * sp + ph)) * 0.035 + (1 - F) * 0);
  body.rotation.x = always ? Math.sin(t * 1.7 + ph) * 0.1 - 0.05 : -F * 0.12 + ws * 0.06 * F + W * Math.sin(t * 9 * sp + ph) * 0.08;
  body.rotation.z = always ? Math.sin(t * 1.3 + ph) * 0.12 * a.wF : 0;
  const h = a.head; if (h) { h.rotation.y = (1 - F) * Math.sin(t * 1.3 * sp + ph * 1.7) * 0.7; h.rotation.x = (1 - F) * Math.sin(t * 2.7 + ph) * 0.12; }
  if (a.tail) a.tail.rotation.x = Math.sin(t * 2.6 * sp + ph) * 0.12 + (1 - F) * 0.2;
};
const swim = (a, t, sp, ph) => {
  const mv = Math.max(a.wW, a.wF), w = t * sp * (3 + 5 * mv) + ph, body = a.body;
  body.rotation.y = Math.sin(w - 0.9) * (0.08 + 0.08 * mv); body.rotation.z = Math.sin(w * 0.5) * 0.04; body.position.y = a.by + Math.sin(w * 0.5) * 0.012;
  a.tail.rotation.y = Math.sin(w) * (0.4 + 0.25 * mv); a.wingL.rotation.z = a.wlz + Math.sin(w * 1.5) * 0.25; a.wingR.rotation.z = a.wrz - Math.sin(w * 1.5) * 0.25;
};

/**
 * Drive a critter. anim = 'idle' | 'walk' | 'graze' | 'fly' (fly = swim/hover/flap/hop-flutter for animals that can).
 * t = seconds (monotonic), speed = playback speed multiplier (1 = normal), state = optional phase offset (number) or {phase}.
 * Poses blend with eased weights, so switching anim never snaps. Call every frame. Zero allocation.
 */
export function animateCritter(g, anim, t, speed = 1, state) {
  const a = g.userData._a; if (!a) return;
  const tw = anim === 'walk' ? 1 : 0, tg = anim === 'graze' ? 1 : 0, tf = anim === 'fly' ? 1 : 0;
  if (a.lt < 0) { a.wW = tw; a.wG = tg; a.wF = tf; a.lt = t; }
  let dt = t - a.lt; if (dt < 0 || dt > 0.3) dt = 0.016; a.lt = t; const k = 1 - Math.exp(-dt * 9);
  a.wW += (tw - a.wW) * k; a.wG += (tg - a.wG) * k; a.wF += (tf - a.wF) * k;
  const ph = (typeof state === 'number' ? state : state && state.phase) || a.ph, sp = speed || 1, K = a.kind;
  switch (a.type) {
    case 0: quad(a, t, sp, ph, GA[K]); break;
    case 1: biped(a, t, sp, ph, GA[K]); break;
    case 2: hopper(a, t, sp, ph, GA[K]); break;
    case 3: flyer(a, t, sp, ph, GA[K], K !== 'bird'); break;
    case 4: swim(a, t, sp, ph); break;
    case 5: { const s = 1 + Math.sin(t * 0.7 * sp + ph) * 0.025; a.body.scale.set(s, 1 + Math.sin(t * 0.9 * sp + ph * 2) * 0.04, s); a.body.position.y = a.by + Math.sin(t * 0.4 * sp + ph) * 0.06; break; }
  }
  const sh = a.shadow;
  if (sh) {
    if (a.air) { const y = g.position.y, ys = g.scale.y || 1, f = a.kind === 'cloud' ? 1 : 1 / (1 + Math.max(0, y) * 0.15); sh.position.y = (0.02 - y) / ys; sh.scale.x = a.sx * f; sh.scale.y = a.sy * f; }
    else { const f = Math.max(0.5, 1 - (a.body.position.y - a.by) * 1.6); sh.scale.x = a.sx * f; sh.scale.y = a.sy * f; }
  }
}
