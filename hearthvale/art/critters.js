// Hearthvale critters: round, fluffy, toy-like animals + sky/air life. Procedural geometry only, vertex-coloured.
//
// ROUND 2 "Happy Light". WHAT I LEARNED (research notes)
//  1. Cute = big head (40-45% of the body), tiny limbs, no neck, HUGE glossy dot eyes set low and wide, a clear little smile and a blush oval
//     on each cheek. Life-sim animals read as friendly because the face is simple, symmetrical and always smiling (no frowns, no fangs).
//  2. Sausage-and-ball modelling: overlapping ellipsoids, 5-9 segments with smooth normals; spend triangles on silhouette (ears, tail, head).
//  3. High-key colour: candy pastels (white, cream, blush pink, lilac, caramel, butter, mint), shading only 15% toward lavender-teal, never grey/black.
//  4. Faces are 'decals': tiny flat discs laid on the head ellipsoid by its surface normal (eyes with TWO highlights, blush, smile ribbon).
//     The eyes are their own named part so they can BLINK (scale.y) and close happily while grazing.
//  5. Squash and stretch everywhere: anticipation squash, stretch in the air, landing squash; idle "happy hops" every few seconds, phase-offset per animal.
//  6. Secondary motion: ear wiggle bursts, tail wag (dog fast, sheep slow), head tilts, throat puff on frogs, antennae wobble on snails.
//  7. Wool/fluff reads as soft when it is many overlapping puffs with their own light-top gradient; flower garlands and bows add charm cheaply.
//  8. Walk cycles: diagonal trot, bob twice per stride, roll once; blend poses with eased weights, never snap.
//  9. Flyers: wing pivot at the shoulder, flap = sine, bob against the flap, ground blob shadow shrinks with altitude.
// 10. Budget: sphere tris = 2*w*(h-1). Each critter <= 520 tris, shared vertex-colour material, one extra glossy mesh for the eyes.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { soft, rng } from './artkit.js';

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
// own material (not the shared soft() cache): a fake high-key fill adds 30% of the vertex colour as emission so shaded sides stay pastel, never grey
export const CMAT = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.88, metalness: 0 });
CMAT.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.3;'); };
CMAT.customProgramCacheKey = () => 'hv-highkey';

export class B {
  constructor(ox = 0, oy = 0, oz = 0, defMat = CMAT) { this.o = [ox, oy, oz]; this.defMat = defMat; this.map = new Map(); }
  /** generic: unit geometry g, colour, centre x,y,z, scale sx,sy,sz. o: r=[rx,ry,rz] rotation, sh=AO strength, fn(lx,ly,lz,t,nx,ny,nz)=>colour|null, facet, mat */
  put(g, col, x, y, z, sx, sy, sz, o = {}) {
    const geom = g.index ? g.toNonIndexed() : g.clone(); if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox, pos = geom.attributes.position, nrm = geom.attributes.normal, n = pos.count, cols = new Float32Array(n * 3);
    const hy = (bb.max.y - bb.min.y) || 1, sh = o.free ? (o.sh ?? 0.26) : Math.min(o.sh ?? 0.15, 0.18); _base.set(col); // fake AO is capped at 0.18 (high-key rule); o.free lifts the cap (clouds)
    const paint = (i, c, t) => {
      const s = 1 - t, k = (1 - sh * Math.pow(s, 1.2)) * 1.1;
      cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * (k + (1 - k) * 0.06); cols[i * 3 + 2] = c.b * (k + (1 - k) * 0.42);
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
const EYE = '#2b2036', BLUSH = '#ff93b0', SMILE = '#7d3a4a', WHITE = '#ffffff';
const EYEMAT = soft('#ffffff', { vertexColors: true, roughness: 0.22, metalness: 0.05 });
const SHELLMAT = soft('#ffffff', { vertexColors: true, roughness: 0.3, metalness: 0.05 });
const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

/** Lavender-teal blob shadow (shared geometry, one material per opacity). Used under every critter and prop. */
const _sg = new THREE.CircleGeometry(1, 20), _sm = new Map();
export function blobShadow(r = 0.5, op = 0.2, sx = 1, sz = 1) {
  let m = _sm.get(op); if (!m) { m = new THREE.MeshBasicMaterial({ color: '#5b76b6', transparent: true, opacity: op, depthWrite: false }); _sm.set(op, m); }
  const s = new THREE.Mesh(_sg, m); s.rotation.x = -PI / 2; s.scale.set(r * sx, r * sz, 1); s.position.y = 0.02; s.renderOrder = 1; s.castShadow = false; s.receiveShadow = false; return s;
}
function shadowOf(root, r, op, sx, sz) { const s = blobShadow(r, Math.min(op, 0.22), sx, sz); s.name = 'shadow'; root.add(s); return s; }

/** U-shaped smile ribbon, half-width 1 (6 tris). */
export const smileGeo = () => cached('smile', () => {
  const n = 4, pos = [], idx = [], nrm = [];
  for (let i = 0; i <= n; i++) { const u = -1 + (2 * i) / n, y = (u * u - 1) * 0.42; pos.push(u, y + 0.1, 0, u, y - 0.1, 0); nrm.push(0, 0, 1, 0, 0, 1); }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx); return g;
});
const _dq = new THREE.Quaternion(), _dn = new THREE.Vector3(), _dz = new THREE.Vector3(0, 0, 1), _dv = new THREE.Vector3(), _de = new THREE.Euler();
/** Lay flat geometry g (unit, faces +z) on the ellipsoid (centre c, radii rad) at azimuth az / elevation el, scaled sx,sy, floating `lift`, with tangent offsets dx,dy. */
export function decal(b, g, col, c, rad, az, el, sx, sy, lift, dx = 0, dy = 0) {
  const ce = Math.cos(el), sa = Math.sin(az), ca = Math.cos(az), se = Math.sin(el);
  _dn.set(sa * ce / rad[0], se / rad[1], ca * ce / rad[2]).normalize(); _dq.setFromUnitVectors(_dz, _dn); _dv.set(dx, dy, lift).applyQuaternion(_dq); _de.setFromQuaternion(_dq, 'XYZ');
  b.put(g, col, c[0] + rad[0] * sa * ce + _dv.x, c[1] + rad[1] * se + _dv.y, c[2] + rad[2] * ca * ce + _dv.z, sx, sy, 1, { r: [_de.x, _de.y, _de.z], sh: 0 });
}
export const lift = (r, rad) => 0.5 * r * r / Math.min(rad[0], rad[1], rad[2]) + 0.006;
/** One big glossy dot eye with two highlights (16 tris). */
export function eyeAt(b, c, rad, az, el, r) {
  const l = lift(r, rad); decal(b, GEO.disc(9), EYE, c, rad, az, el, r, r * 1.15, l);
  decal(b, GEO.disc(6), WHITE, c, rad, az, el, r * 0.36, r * 0.36, l + 0.004, r * 0.3, r * 0.4); decal(b, GEO.disc(4), WHITE, c, rad, az, el, r * 0.17, r * 0.17, l + 0.004, -r * 0.3, -r * 0.42);
}
/** The named 'eyes' part (child of the head): a pair of shiny dot eyes, blinks by scale.y. */
export function eyes(parent, c, rad, az, el, r) {
  const py = c[1] + rad[1] * Math.sin(el), pz = c[2] + rad[2] * Math.cos(az) * Math.cos(el);
  return part(parent, 'eyes', 0, py, pz, (b) => { eyeAt(b, c, rad, az, el, r); eyeAt(b, c, rad, -az, el, r); }, EYEMAT);
}
/** blush ovals + smile (static, on the head mesh). o: r eye radius, az, el (eye position), baz (blush extra azimuth), bel, sel (smile elevation), sw (smile half-width), bc (blush colour), w (two small smiles, cat/bunny style) */
export function face(b, c, rad, o) {
  const r = o.r, az = o.az ?? 0.55, el = o.el ?? 0.1;
  if (o.blush !== false) for (const s of [1, -1]) decal(b, GEO.disc(6), o.bc || BLUSH, c, rad, s * (az + (o.baz ?? 0.42)), el - (o.bel ?? 0.28), r * 0.95, r * 0.6, lift(r, rad) - 0.002);
  const sw = o.sw ?? r * 1.1, sc = o.sc || c, sr = o.sr || rad;
  if (o.w) for (const s of [1, -1]) decal(b, smileGeo(), SMILE, sc, sr, s * sw * 0.9 / sr[0], o.sel ?? el - 0.5, sw * 0.8, sw * 0.8, lift(sw, sr) + 0.002);
  else if (o.smile !== false) decal(b, smileGeo(), SMILE, sc, sr, 0, o.sel ?? el - 0.5, sw, sw, lift(sw, sr) + 0.002);
}
function legGroup(root, hipY, spots, make) {
  const L = new THREE.Group(); L.name = 'legs'; root.add(L);
  spots.forEach(([x, z], i) => part(L, 'leg' + i, x, hipY, z, (b) => make(b, x, z, i)));
  return L;
}
function finish(root, kind, type, seed = 0, air = false) {
  const f = (n) => root.getObjectByName(n) || null, a = { type, kind, air, lt: -1, wW: 0, wG: 0, wF: 0 };
  a.body = f('body'); a.head = f('head'); a.tail = f('tail'); a.earL = f('earL'); a.earR = f('earR'); a.wingL = f('wingL'); a.wingR = f('wingR'); a.shadow = f('shadow'); a.eyes = f('eyes'); a.throat = f('throat'); a.shell = f('shell');
  const L = f('legs'); a.legG = L; a.legs = L ? L.children.slice() : [];
  a.by = a.body ? a.body.position.y : 0; a.hz = a.head ? a.head.position.z : 0; a.hy = a.head ? a.head.position.y : 0;
  a.elz = a.earL ? a.earL.rotation.z : 0; a.erz = a.earR ? a.earR.rotation.z : 0; a.wlz = a.wingL ? a.wingL.rotation.z : 0; a.wrz = a.wingR ? a.wingR.rotation.z : 0;
  a.ph = (seed * 2.399) % 6.2832; if (a.shadow) { a.sx = a.shadow.scale.x; a.sy = a.shadow.scale.y; }
  root.userData.critter = kind; root.userData._a = a; root.userData.phase = a.ph; return root;
}
const FLOWERS = ['#ff8fb5', '#ffd84a', '#9fd8ff', '#ffffff', '#c9a8ff'];

/* ------------------------------------------------------------------ SHEEP */
// variants: 0 white, 1 cream, 2 white + flower crown, 3 lilac, 4 white + pink bow, 5 pink, 6 lilac + crown, 7 sheared lamb, 8 cream + bow
export function sheepModel(seed = 0) {
  const R = rng(seed * 131 + 7), v = ((seed % 9) + 9) % 9;
  const wool = ['#ffffff', '#fff0d0', '#ffffff', '#e7deff', '#fffdf2', '#ffcfe1', '#e2d6ff', '#fff3e6', '#fff0d0'][v];
  const sheared = v === 7, crown = v === 2 || v === 6, bow = v === 4 || v === 8;
  const face_ = v === 1 || v === 8 ? '#f7cba4' : v === 5 ? '#ffe0d4' : '#ffdcc8', leg = mix(face_, '#e39c88', 0.4), skin = '#ffd2c4';
  const root = new THREE.Group(); shadowOf(root, 0.52, 0.2, 0.95, 1.3);
  part(root, 'body', 0, 0, 0, (b) => {
    if (!sheared) {
      b.sph(wool, 0, 0.42, -0.02, 0.3, 0.27, 0.34, { w: 8, h: 5 });
      for (const [x, y, z, r] of [[-0.17, 0.56, 0.1, 0.2], [0.17, 0.56, 0.1, 0.2], [0, 0.6, -0.14, 0.21], [0, 0.46, -0.34, 0.17]]) b.sph(wool, x * (0.96 + R() * 0.08), y + R() * 0.02, z, r, r * 0.9, r, { w: 6, h: 4 });
    } else { b.sph(skin, 0, 0.4, 0, 0.22, 0.21, 0.3, { w: 8, h: 5 }); b.sph(wool, 0, 0.57, 0, 0.1, 0.07, 0.12, { w: 5, h: 3 }); b.sph(wool, 0, 0.42, -0.3, 0.09, 0.09, 0.09, { w: 5, h: 3 }); }
  });
  const body = root.getObjectByName('body'), hc = [0, 0.5, 0.4], hr = [0.18, 0.165, 0.16];
  const head = part(body, 'head', 0, 0.46, 0.3, (b) => {
    b.sph(face_, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 4 });
    if (!sheared) b.sph(wool, 0, 0.65, 0.38, 0.14, 0.085, 0.12, { w: 5, h: 3 }); else b.sph(wool, 0, 0.66, 0.4, 0.05, 0.05, 0.05, { w: 4, h: 3 });
    b.sph('#ff9db0', 0, 0.452, 0.555, 0.034, 0.026, 0.022, { w: 4, h: 3, sh: 0 });
    face(b, hc, hr, { r: 0.054, az: 0.5, el: 0.08, sel: -0.52, sw: 0.05 });
    if (crown) for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2 + 0.9; b.sph(FLOWERS[(i + v) % 5], Math.cos(a) * 0.1, 0.68, 0.4 + Math.sin(a) * 0.09, 0.05, 0.042, 0.05, { w: 4, h: 3, sh: 0.05 }); }
    if (bow) { b.sph('#ff7fae', -0.13, 0.64, 0.44, 0.045, 0.032, 0.03, { w: 4, h: 3, sh: 0.05, r: [0, 0, 0.5] }); b.sph('#ff7fae', -0.2, 0.62, 0.44, 0.045, 0.032, 0.03, { w: 4, h: 3, sh: 0.05, r: [0, 0, -0.5] }); b.sph('#ff5f94', -0.165, 0.63, 0.45, 0.022, 0.022, 0.022, { w: 4, h: 3, sh: 0 }); }
  });
  eyes(head, hc, hr, 0.5, 0.08, 0.054);
  part(head, 'earL', 0.14, 0.58, 0.4, (b) => b.sph('#ffb9bf', 0.23, 0.56, 0.4, 0.085, 0.035, 0.055, { w: 4, h: 3, r: [0, 0, -0.35] }));
  part(head, 'earR', -0.14, 0.58, 0.4, (b) => b.sph('#ffb9bf', -0.23, 0.56, 0.4, 0.085, 0.035, 0.055, { w: 4, h: 3, r: [0, 0, 0.35] }));
  part(body, 'tail', 0, 0.5, -0.36, (b) => b.sph(sheared ? skin : wool, 0, 0.5, -0.43, 0.085, 0.085, 0.09, { w: 5, h: 3 }));
  legGroup(root, 0.2, [[0.13, 0.17], [-0.13, 0.17], [0.13, -0.2], [-0.13, -0.2]], (b, x, z) => b.cyl(leg, x, 0.1, z, 0.058, 0.2, { n: 5, rt: 0.85, open: true }));
  return finish(root, 'sheep', 0, seed);
}

/* ------------------------------------------------------------------ CHICKEN */
// variants: 0 snow white, 1 ginger, 2 sunny yellow, 3 lilac (all with candy tail feathers)
export function chickenModel(seed = 0) {
  const v = ((seed % 4) + 4) % 4, C = ['#fffdf6', '#ffb468', '#ffe266', '#dccbff'][v], W = ['#f2ead8', '#f09a48', '#ffcf45', '#bda2fb'][v], comb = ['#ff6b7a', '#ff5a6e', '#ff7a8a', '#ff8fc0'][v];
  const T = [['#7fe0d0', '#ff9ec7', '#ffd84a'], ['#ffe08a', '#ff8a5a', '#fff3c0'], ['#ffb347', '#ff9ec7', '#ffffff'], ['#ff9ec7', '#8fd8ff', '#ffffff']][v];
  const root = new THREE.Group(); shadowOf(root, 0.3, 0.2, 1, 1.1);
  part(root, 'body', 0, 0, 0, (b) => { b.sph(C, 0, 0.29, 0, 0.19, 0.2, 0.2, { w: 8, h: 5, r: [-0.4, 0, 0] }); });
  const body = root.getObjectByName('body'), hc = [0, 0.55, 0.16], hr = [0.125, 0.12, 0.115];
  const head = part(body, 'head', 0, 0.46, 0.12, (b) => {
    b.sph(C, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 5 });
    b.cone('#ffae3a', 0, 0.525, 0.285, 0.036, 0.085, { n: 4, r: [PI / 2, 0, 0] });
    b.sph(comb, 0, 0.67, 0.15, 0.03, 0.04, 0.06, { w: 4, h: 3 }); b.sph(comb, 0, 0.65, 0.22, 0.028, 0.034, 0.034, { w: 4, h: 3 });
    b.sph(comb, 0, 0.465, 0.265, 0.022, 0.04, 0.02, { w: 4, h: 3 });
    face(b, hc, hr, { r: 0.04, az: 0.78, el: 0.1, baz: 0.38, bel: 0.2, smile: false });
  });
  eyes(head, hc, hr, 0.78, 0.1, 0.04);
  part(body, 'tail', 0, 0.38, -0.2, (b) => { b.sph(T[0], 0, 0.52, -0.25, 0.035, 0.11, 0.05, { w: 4, h: 3, r: [-0.5, 0, 0] }); b.sph(T[1], 0.06, 0.48, -0.24, 0.032, 0.1, 0.045, { w: 4, h: 3, r: [-0.5, 0, -0.55] }); b.sph(T[2], -0.06, 0.48, -0.24, 0.032, 0.1, 0.045, { w: 4, h: 3, r: [-0.5, 0, 0.55] }); });
  part(body, 'wingL', 0.16, 0.4, 0.0, (b) => b.sph(W, 0.19, 0.31, 0, 0.035, 0.11, 0.13, { w: 5, h: 3, r: [0, 0, 0.12] }));
  part(body, 'wingR', -0.16, 0.4, 0.0, (b) => b.sph(W, -0.19, 0.31, 0, 0.035, 0.11, 0.13, { w: 5, h: 3, r: [0, 0, -0.12] }));
  legGroup(root, 0.16, [[0.065, 0], [-0.065, 0]], (b, x) => { b.cyl('#ffb347', x, 0.08, 0, 0.017, 0.16, { n: 4, open: true }); b.sph('#ffb347', x, 0.012, 0.035, 0.04, 0.012, 0.055, { w: 5, h: 3, sh: 0.05 }); });
  return finish(root, 'chicken', 1, seed);
}

/* ------------------------------------------------------------------ COW */
// variants: 0 cream with caramel patches, 1 caramel with cream patches, 2 strawberry (cream with pink patches); all wear a flower garland
export function cowModel(seed = 0) {
  const V = [{ c: '#fffaf0', p: '#d29461' }, { c: '#e0a870', p: '#fff0d4' }, { c: '#fff6ea', p: '#ffb3c9' }][((seed % 3) + 3) % 3];
  const root = new THREE.Group(); shadowOf(root, 0.62, 0.2, 0.8, 1.45);
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph(V.c, 0, 0.56, 0, 0.37, 0.33, 0.52, { w: 8, h: 5 });
    b.sph(V.p, 0.17, 0.76, -0.1, 0.17, 0.12, 0.17, { w: 5, h: 3 }); b.sph(V.p, -0.22, 0.6, 0.12, 0.13, 0.15, 0.17, { w: 5, h: 3 });
  });
  const body = root.getObjectByName('body'), hc = [0, 0.74, 0.68], hr = [0.25, 0.22, 0.21], sc = [0, 0.655, 0.86], sr = [0.15, 0.1, 0.1];
  const head = part(body, 'head', 0, 0.68, 0.5, (b) => {
    b.sph(V.c, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 5 });
    b.sph('#ffc4bb', sc[0], sc[1], sc[2], sr[0], sr[1], sr[2], { w: 6, h: 3 });
    for (const s of [1, -1]) decal(b, GEO.disc(4), '#e58a92', sc, sr, s * 0.4, 0.3, 0.018, 0.022, 0.01);
    face(b, hc, hr, { r: 0.06, az: 0.64, el: 0.14, baz: 0.45, bel: 0.34, sc, sr, sel: -0.38, sw: 0.055 });
    b.cone('#fff0cf', 0.14, 0.9, 0.68, 0.04, 0.12, { n: 4, r: [0, 0, -0.5] }); b.cone('#fff0cf', -0.14, 0.9, 0.68, 0.04, 0.12, { n: 4, r: [0, 0, 0.5] });
    b.sph(V.p, 0, 0.93, 0.72, 0.09, 0.05, 0.08, { w: 5, h: 3 });
    b.cyl('#6fd47a', 0, 0.58, 0.55, 0.21, 0.04, { n: 8, open: true, r: [0.25, 0, 0] });
    for (let i = 0; i < 5; i++) { const a = -1.15 + i * 0.575; b.sph(FLOWERS[i], Math.sin(a) * 0.21, 0.575 - Math.abs(a) * 0.005, 0.55 + Math.cos(a) * 0.18, 0.045, 0.04, 0.045, { w: 4, h: 3, sh: 0.05 }); }
  });
  eyes(head, hc, hr, 0.64, 0.14, 0.06);
  part(head, 'earL', 0.2, 0.82, 0.68, (b) => b.sph(V.c, 0.31, 0.8, 0.68, 0.11, 0.04, 0.07, { w: 5, h: 3, r: [0, 0, -0.3] }));
  part(head, 'earR', -0.2, 0.82, 0.68, (b) => b.sph(V.c, -0.31, 0.8, 0.68, 0.11, 0.04, 0.07, { w: 5, h: 3, r: [0, 0, 0.3] }));
  part(body, 'tail', 0, 0.85, -0.5, (b) => { b.cyl(V.c, 0, 0.66, -0.57, 0.022, 0.36, { n: 4, open: true }); b.sph(V.p, 0, 0.45, -0.57, 0.055, 0.08, 0.055, { w: 5, h: 3 }); });
  legGroup(root, 0.3, [[0.2, 0.34], [-0.2, 0.34], [0.2, -0.32], [-0.2, -0.32]], (b, x, z) => b.cyl(V.c, x, 0.15, z, 0.1, 0.3, { n: 5, rt: 0.85, open: true, fn: (lx, ly, lz, t) => (t < 0.2 ? '#f6c9a6' : null) }));
  return finish(root, 'cow', 0, seed);
}

/* ------------------------------------------------------------------ DOG and PUPPY */
function canine(seed, pup) {
  const vi = ((seed % 4) + 4) % 4, V = [{ c: '#f4b862', l: '#fde6b8', d: '#dc9440' }, { c: '#d19a68', l: '#f7dfc0', d: '#b07445' }, { c: '#fff6e8', l: '#ffffff', d: '#c58a58' }, { c: '#c0c6e0', l: '#f0f2fb', d: '#98a0c4' }][vi];
  const band = ['#ff6f84', '#5fb8ff', '#ffd24a', '#6fe0a8'][vi];
  const S = pup ? 0.84 : 1, bz = pup ? -0.02 : -0.03, bh = pup ? 0.25 : 0.3;
  const root = new THREE.Group(); shadowOf(root, pup ? 0.3 : 0.34, 0.2, 0.9, 1.4);
  part(root, 'body', 0, 0, 0, (b) => { b.sph(V.c, 0, bh, bz, 0.17 * S, 0.17 * S, 0.26 * S, { w: 8, h: 5 }); if (vi === 2) { b.sph(V.d, 0.08, bh + 0.1 * S, -0.06, 0.1, 0.06, 0.12, { w: 5, h: 3 }); } });
  const body = root.getObjectByName('body');
  const hy = pup ? 0.44 : 0.5, hz = pup ? 0.24 : 0.28, hc = [0, hy, hz], hr = pup ? [0.2, 0.18, 0.17] : [0.17, 0.155, 0.15];
  const mc = [0, hy - 0.06, hz + hr[2] * 0.62], mr = [hr[0] * 0.5, 0.06, 0.07];
  const head = part(body, 'head', 0, hy - 0.06, hz - 0.06, (b) => {
    b.sph(V.c, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 5 });
    b.sph(V.l, mc[0], mc[1], mc[2], mr[0], mr[1], mr[2], { w: 6, h: 4 });
    b.sph('#6b4456', 0, mc[1] + 0.035, mc[2] + 0.06, 0.03, 0.022, 0.022, { w: 4, h: 3, sh: 0 });
    b.sph('#ff8aa4', 0, mc[1] - 0.06, mc[2] + 0.045, 0.032, 0.014, 0.04, { w: 4, h: 3, sh: 0 });
    if (vi === 2 || pup) b.sph(V.d, 0.09 * (pup ? 1 : 0.8), hy + 0.06, hz + 0.1, 0.06, 0.055, 0.045, { w: 5, h: 3 });
    face(b, hc, hr, { r: pup ? 0.056 : 0.05, az: 0.55, el: 0.2, baz: 0.38, bel: 0.2, sc: mc, sr: mr, sel: -0.3, sw: 0.05 });
    b.cyl(band, 0, hy - 0.1, hz - 0.05, hr[0] * 0.78, 0.045, { n: 8, open: true, r: [0.4, 0, 0] }); b.cone(band, 0, hy - 0.17, hz + 0.1, 0.05, 0.08, { n: 3, r: [PI, 0, 0] });
  });
  eyes(head, hc, hr, 0.55, 0.2, pup ? 0.056 : 0.05);
  const ey = hy + 0.06, ez = hz;
  part(head, 'earL', 0.1, ey + 0.06, ez, (b) => b.sph(V.d, 0.17, ey - (pup ? 0.04 : 0), ez, 0.05, pup ? 0.12 : 0.1, 0.075, { w: 5, h: 4, r: [0, 0, -0.3] }));
  part(head, 'earR', -0.1, ey + 0.06, ez, (b) => b.sph(V.d, -0.17, ey - (pup ? 0.04 : 0), ez, 0.05, pup ? 0.12 : 0.1, 0.075, { w: 5, h: 4, r: [0, 0, 0.3] }));
  part(body, 'tail', 0, bh + 0.08, -0.27 * S, (b) => { const z = -0.3 * S; b.sph(V.c, 0, bh + 0.1, z, 0.045, 0.07, 0.045, { w: 5, h: 3, r: [-0.5, 0, 0] }); b.sph(V.c, 0, bh + 0.18, z - 0.03, 0.045, 0.07, 0.045, { w: 5, h: 3 }); b.sph(V.l, 0, bh + 0.25, z - 0.02, 0.042, 0.05, 0.042, { w: 5, h: 3 }); });
  legGroup(root, 0.2 * S + 0.02, [[0.09, 0.17 * S], [-0.09, 0.17 * S], [0.09, -0.17 * S], [-0.09, -0.17 * S]], (b, x, z) => b.cyl(V.c, x, 0.1 * S, z, 0.045, 0.2 * S, { n: 5, open: true, fn: (lx, ly, lz, t) => (t < 0.22 ? V.l : null) }));
  return finish(root, pup ? 'puppy' : 'dog', 0, seed);
}
export const dogModel = (seed = 0) => canine(seed, false);
export const puppyModel = (seed = 0) => canine(seed, true);

/* ------------------------------------------------------------------ CAT and KITTEN */
function feline(seed, kit) {
  const vi = ((seed % 4) + 4) % 4, V = [{ c: '#ffb860', s: '#f48f35', l: '#fff3dc' }, { c: '#bcc8e2', s: '#93a2cb', l: '#eef1fa' }, { c: '#dcae92', s: '#bb8566', l: '#fff0e2' }, { c: '#fff5ea', s: '#ffb860', l: '#ffffff' }][vi];
  const bell = ['#ff6f84', '#6fc3ff', '#9be08a', '#c29bff'][vi], S = kit ? 0.82 : 1;
  const root = new THREE.Group(); shadowOf(root, kit ? 0.24 : 0.28, 0.2, 0.8, 1.5);
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph(V.c, 0, 0.25 * S + 0.01, 0, 0.125 * S, 0.135 * S, 0.22 * S, { w: 8, h: 5, facet: vi < 2 || vi === 3, fn: vi < 2 ? (x, y, z) => (y > 0.1 && Math.floor((z + 1.2) * 2.8) % 2 === 0 ? V.s : null) : vi === 3 ? (x, y, z) => (x > 0.1 && z > -0.2 && y > -0.1 ? V.s : null) : undefined });
  });
  const body = root.getObjectByName('body');
  const hy = kit ? 0.36 : 0.4, hz = kit ? 0.18 : 0.2, hc = [0, hy, hz], hr = kit ? [0.17, 0.14, 0.13] : [0.15, 0.125, 0.12];
  const head = part(body, 'head', 0, hy - 0.05, hz - 0.04, (b) => {
    b.sph(V.c, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 8, h: 5 });
    b.sph('#ff8fa6', 0, hy - 0.03, hz + hr[2] - 0.005, 0.02, 0.014, 0.012, { w: 4, h: 3, sh: 0 });
    face(b, hc, hr, { r: kit ? 0.056 : 0.05, az: 0.58, el: 0.18, baz: 0.4, bel: 0.2, w: true, sel: -0.34, sw: 0.034, bc: '#ff9db6' });
    if (vi < 2) for (const s of [-1, 0, 1]) b.sph(V.s, s * 0.05, hy + hr[1] - 0.012, hz + 0.03, 0.014, 0.012, 0.045, { w: 4, h: 3 });
  });
  eyes(head, hc, hr, 0.58, 0.18, kit ? 0.056 : 0.05);
  const eyc = hy + hr[1] - 0.03;
  part(head, 'earL', 0.085, eyc, hz, (b) => { b.cone(V.c, 0.095, eyc + 0.05, hz, 0.055, 0.12, { n: 4, r: [0, 0, -0.18] }); b.cone('#ffb3c4', 0.095, eyc + 0.04, hz + 0.02, 0.03, 0.08, { n: 4, r: [0, 0, -0.18] }); });
  part(head, 'earR', -0.085, eyc, hz, (b) => { b.cone(V.c, -0.095, eyc + 0.05, hz, 0.055, 0.12, { n: 4, r: [0, 0, 0.18] }); b.cone('#ffb3c4', -0.095, eyc + 0.04, hz + 0.02, 0.03, 0.08, { n: 4, r: [0, 0, 0.18] }); });
  part(body, 'tail', 0, 0.28 * S, -0.2 * S, (b) => { const P = [[0.3, -0.27, 0.058], [0.39, -0.31, 0.052], [0.48, -0.3, 0.048], [0.55, -0.26, 0.045]]; for (const [y, z, r] of P) b.sph(V.c, 0, y * S + 0.02, z * S, r, r, r, { w: 5, h: 3 }); b.sph(vi === 3 ? V.s : V.l, 0, 0.56 * S + 0.02, -0.23 * S, 0.038, 0.038, 0.038, { w: 4, h: 3 }); });
  part(body, 'collar', 0, 0.3 * S, 0.14 * S, (b) => { b.cyl(bell, 0, hy - 0.12, hz - 0.03, hr[0] * 0.8, 0.035, { n: 8, open: true, r: [0.3, 0, 0] }); b.sph('#ffd84a', 0, hy - 0.15, hz + 0.07, 0.03, 0.03, 0.03, { w: 4, h: 3, sh: 0 }); });
  legGroup(root, 0.15 * S + 0.02, [[0.07, 0.14 * S], [-0.07, 0.14 * S], [0.07, -0.14 * S], [-0.07, -0.14 * S]], (b, x, z) => b.cyl(V.c, x, 0.075 * S + 0.005, z, 0.036, 0.15 * S, { n: 5, open: true, fn: (lx, ly, lz, t) => (t < 0.25 ? V.l : null) }));
  return finish(root, kit ? 'kitten' : 'cat', 0, seed);
}
export const catModel = (seed = 0) => feline(seed, false);
export const kittenModel = (seed = 0) => feline(seed, true);

/* ------------------------------------------------------------------ DUCK and DUCKLING */
export function duckModel(seed = 0) {
  const V = [{ c: '#ffffff', h: '#ffffff', w: '#eeeaff' }, { c: '#ffe45e', h: '#ffe45e', w: '#ffcf3a' }, { c: '#e8c9a0', h: '#3cc59a', w: '#d3a97a' }][((seed % 3) + 3) % 3];
  const root = new THREE.Group(); shadowOf(root, 0.28, 0.2, 1, 1.2);
  part(root, 'body', 0, 0, 0, (b) => { b.sph(V.c, 0, 0.2, -0.02, 0.155, 0.13, 0.2, { w: 8, h: 5 }); });
  const body = root.getObjectByName('body'), hc = [0, 0.38, 0.15], hr = [0.115, 0.11, 0.11];
  part(body, 'tail', 0, 0.25, -0.18, (b) => b.cone(V.c, 0, 0.29, -0.22, 0.055, 0.1, { n: 4, r: [-0.9, 0, 0] }));
  const head = part(body, 'head', 0, 0.28, 0.12, (b) => {
    b.sph(V.h, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 5 }); b.sph('#ffae3a', 0, 0.345, 0.255, 0.058, 0.026, 0.066, { w: 5, h: 3, sh: 0.1 });
    face(b, hc, hr, { r: 0.04, az: 0.78, el: 0.16, baz: 0.38, bel: 0.22, smile: false });
  });
  eyes(head, hc, hr, 0.78, 0.16, 0.04);
  part(body, 'wingL', 0.14, 0.27, 0, (b) => b.sph(V.w, 0.165, 0.2, -0.02, 0.035, 0.085, 0.13, { w: 5, h: 3 }));
  part(body, 'wingR', -0.14, 0.27, 0, (b) => b.sph(V.w, -0.165, 0.2, -0.02, 0.035, 0.085, 0.13, { w: 5, h: 3 }));
  legGroup(root, 0.09, [[0.05, 0], [-0.05, 0]], (b, x) => { b.cyl('#ffa93a', x, 0.05, 0, 0.014, 0.09, { n: 4, open: true }); b.sph('#ffb347', x, 0.012, 0.04, 0.045, 0.012, 0.06, { w: 5, h: 3, sh: 0.05 }); });
  return finish(root, 'duck', 1, seed);
}
export function ducklingModel(seed = 0) {
  const V = [{ c: '#ffe55f', w: '#ffd23c' }, { c: '#fff4c4', w: '#ffe79a' }, { c: '#ffd0a4', w: '#ffb683' }, { c: '#c4f0dc', w: '#97e2c2' }][((seed % 4) + 4) % 4];
  const root = new THREE.Group(); shadowOf(root, 0.2, 0.2, 1, 1.1);
  part(root, 'body', 0, 0, 0, (b) => { b.sph(V.c, 0, 0.14, -0.01, 0.12, 0.105, 0.14, { w: 8, h: 5 }); });
  const body = root.getObjectByName('body'), hc = [0, 0.28, 0.07], hr = [0.115, 0.105, 0.105];
  part(body, 'tail', 0, 0.16, -0.12, (b) => b.cone(V.c, 0, 0.19, -0.15, 0.04, 0.07, { n: 4, r: [-0.9, 0, 0] }));
  const head = part(body, 'head', 0, 0.2, 0.05, (b) => {
    b.sph(V.c, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 5 }); b.sph('#ffae3a', 0, 0.255, 0.165, 0.04, 0.02, 0.045, { w: 5, h: 3, sh: 0.1 });
    b.sph(V.w, 0, 0.385, 0.06, 0.03, 0.04, 0.03, { w: 4, h: 3 }); b.sph(V.w, 0.02, 0.39, 0.04, 0.02, 0.035, 0.02, { w: 4, h: 3 });
    face(b, hc, hr, { r: 0.044, az: 0.72, el: 0.12, baz: 0.38, bel: 0.24, smile: false });
  });
  eyes(head, hc, hr, 0.72, 0.12, 0.044);
  part(body, 'wingL', 0.1, 0.18, 0, (b) => b.sph(V.w, 0.12, 0.13, -0.01, 0.025, 0.06, 0.09, { w: 5, h: 3 }));
  part(body, 'wingR', -0.1, 0.18, 0, (b) => b.sph(V.w, -0.12, 0.13, -0.01, 0.025, 0.06, 0.09, { w: 5, h: 3 }));
  legGroup(root, 0.05, [[0.04, 0], [-0.04, 0]], (b, x) => { b.cyl('#ffa93a', x, 0.03, 0, 0.011, 0.05, { n: 4, open: true }); b.sph('#ffb347', x, 0.01, 0.03, 0.035, 0.01, 0.048, { w: 5, h: 3, sh: 0.05 }); });
  return finish(root, 'duckling', 1, seed);
}

/* ------------------------------------------------------------------ BUNNY (pastel) */
export function bunnyModel(seed = 0) {
  const V = [{ c: '#fbf6ef', i: '#ffbfd0', l: '#ffffff' }, { c: '#e3b384', i: '#ffbcae', l: '#f9e6cc' }, { c: '#d6d0ec', i: '#ffbfd6', l: '#f3f0fb' }, { c: '#ffe6d0', i: '#ffb0b8', l: '#fff7ee' }][((seed % 4) + 4) % 4];
  const root = new THREE.Group(); shadowOf(root, 0.24, 0.2, 1, 1.2);
  part(root, 'body', 0, 0, 0, (b) => b.sph(V.c, 0, 0.19, -0.02, 0.145, 0.15, 0.185, { w: 8, h: 5 }));
  const body = root.getObjectByName('body'), hc = [0, 0.38, 0.15], hr = [0.14, 0.12, 0.115];
  part(body, 'tail', 0, 0.2, -0.19, (b) => b.sph(V.l, 0, 0.2, -0.22, 0.065, 0.065, 0.065, { w: 6, h: 4, sh: 0.1 }));
  const head = part(body, 'head', 0, 0.33, 0.13, (b) => {
    b.sph(V.c, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 5 }); b.sph(V.l, 0, 0.345, 0.235, 0.05, 0.038, 0.035, { w: 5, h: 3 });
    b.sph('#ff8fab', 0, 0.37, 0.265, 0.02, 0.015, 0.012, { w: 4, h: 3, sh: 0 }); b.box('#ffffff', 0, 0.31, 0.262, 0.026, 0.026, 0.01, { sh: 0 });
    face(b, hc, hr, { r: 0.05, az: 0.62, el: 0.2, baz: 0.4, bel: 0.24, w: true, sc: [0, 0.345, 0.15], sr: [0.14, 0.12, 0.12], sel: -0.52, sw: 0.025, bc: '#ffa0b8' });
  });
  eyes(head, hc, hr, 0.62, 0.2, 0.05);
  const ear = (b, s) => { b.sph(V.c, s * 0.06, 0.57, 0.1, 0.04, 0.125, 0.03, { w: 5, h: 4, r: [0.15, 0, -s * 0.12] }); b.sph(V.i, s * 0.06, 0.565, 0.118, 0.022, 0.095, 0.014, { w: 4, h: 3, r: [0.15, 0, -s * 0.12], sh: 0.05 }); };
  part(head, 'earL', 0.05, 0.45, 0.1, (b) => ear(b, 1)); part(head, 'earR', -0.05, 0.45, 0.1, (b) => ear(b, -1));
  legGroup(root, 0.1, [[0.055, 0.17], [-0.055, 0.17], [0.09, 0.04], [-0.09, 0.04]], (b, x, z, i) => {
    if (i < 2) b.sph(V.c, x, 0.04, z, 0.032, 0.038, 0.038, { w: 4, h: 3 }); else b.sph(V.c, x, 0.04, z + 0.02, 0.048, 0.042, 0.1, { w: 5, h: 3 });
  });
  return finish(root, 'bunny', 2, seed);
}

/* ------------------------------------------------------------------ BIRD (flying, origin = body centre): bluebird, pink finch, yellow canary */
export function birdModel(seed = 0) {
  const vi = ((seed % 3) + 3) % 3, V = [{ c: '#62b8ff', b: '#fff6e0', w: '#3f98f0', t: '#8fd2ff' }, { c: '#ff9bc0', b: '#fff1f6', w: '#ff72a6', t: '#ffc0d8' }, { c: '#ffe04a', b: '#fff8b8', w: '#ffc42a', t: '#fff08a' }][vi];
  const root = new THREE.Group(); const sh = shadowOf(root, 0.14, 0.2, 1, 1); sh.position.y = -0.25;
  part(root, 'body', 0, 0, 0, (b) => { b.sph(V.c, 0, 0, 0, 0.11, 0.1, 0.13, { w: 8, h: 5 }); b.sph(V.b, 0, -0.04, 0.04, 0.08, 0.065, 0.09, { w: 5, h: 4, sh: 0.08 }); });
  const body = root.getObjectByName('body'), hc = [0, 0.11, 0.13], hr = [0.088, 0.082, 0.082];
  const head = part(body, 'head', 0, 0.05, 0.1, (b) => {
    b.sph(V.c, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 5 }); b.cone('#ffb23a', 0, 0.1, 0.215, 0.026, 0.06, { n: 4, r: [PI / 2, 0, 0] });
    if (vi === 1) b.cone(V.w, 0, 0.2, 0.1, 0.02, 0.06, { n: 3, r: [-0.4, 0, 0] });
    face(b, hc, hr, { r: 0.036, az: 0.82, el: 0.12, baz: 0.3, bel: 0.2, smile: false });
  });
  eyes(head, hc, hr, 0.82, 0.12, 0.036);
  part(body, 'wingL', 0.07, 0.04, 0, (b) => { b.sph(V.w, 0.16, 0.04, -0.01, 0.1, 0.016, 0.075, { w: 6, h: 3 }); b.sph(V.t, 0.1, 0.046, 0.01, 0.05, 0.018, 0.06, { w: 4, h: 3 }); });
  part(body, 'wingR', -0.07, 0.04, 0, (b) => { b.sph(V.w, -0.16, 0.04, -0.01, 0.1, 0.016, 0.075, { w: 6, h: 3 }); b.sph(V.t, -0.1, 0.046, 0.01, 0.05, 0.018, 0.06, { w: 4, h: 3 }); });
  part(body, 'tail', 0, 0, -0.12, (b) => b.sph(V.w, 0, 0.0, -0.2, 0.05, 0.014, 0.1, { w: 5, h: 3 }));
  return finish(root, 'bird', 3, seed, true);
}

/* ------------------------------------------------------------------ BUTTERFLY */
const WINGMAT = soft('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
const BUTTER = ['#ff8fb3', '#ffd24a', '#7fc8ff', '#c59bff', '#7fe3b0', '#ffa86a'];
export function butterflyModel(color = '#ff8fb3') {
  if (typeof color !== 'string') color = BUTTER[(((color | 0) % BUTTER.length) + BUTTER.length) % BUTTER.length];
  const root = new THREE.Group(); const sh = shadowOf(root, 0.1, 0.2, 1, 1); sh.position.y = -0.5;
  const base = new THREE.Color(color), rim = base.clone().lerp(new THREE.Color('#ffffff'), 0.7), dot = base.clone().lerp(new THREE.Color('#ffffff'), 0.35).offsetHSL(0.04, 0, -0.1);
  part(root, 'body', 0, 0, 0, (b) => { b.cyl('#8a6a5a', 0, 0, 0, 0.014, 0.1, { n: 5, r: [PI / 2, 0, 0], sh: 0 }); b.sph('#8a6a5a', 0, 0, 0.06, 0.022, 0.022, 0.022, { w: 5, h: 3, sh: 0 }); });
  const wing = (s) => (b) => {
    const fn = (lx, ly, lz) => { const r = Math.hypot(lx, lz); return r > 0.82 ? rim : r < 0.18 ? dot : null; };
    b.put(GEO.circle(8), base, s * 0.07, 0, 0.035, 0.105, 1, 0.09, { fn, mat: WINGMAT, sh: 0 });
    b.put(GEO.circle(8), base, s * 0.05, -0.001, -0.04, 0.072, 1, 0.062, { fn, mat: WINGMAT, sh: 0 });
    b.put(GEO.circle(6), dot, s * 0.09, 0.002, 0.045, 0.03, 1, 0.027, { mat: WINGMAT, sh: 0 });
  };
  const body = root.getObjectByName('body');
  part(body, 'wingL', 0, 0, 0, wing(1), WINGMAT); part(body, 'wingR', 0, 0, 0, wing(-1), WINGMAT);
  root.scale.setScalar(1.6);
  return finish(root, 'butterfly', 3, 0, true);
}

/* ------------------------------------------------------------------ FISH (origin = body centre, swims toward +z) */
const FISHES = ['#ff9a5c', '#5ec8ff', '#ff8fb3', '#ffd24a'];
export function fishModel(color = '#ff9a5c') {
  if (typeof color !== 'string') color = FISHES[(((color | 0) % FISHES.length) + FISHES.length) % FISHES.length];
  const base = new THREE.Color(color), belly = base.clone().lerp(new THREE.Color('#fff4e0'), 0.65), fin = base.clone().lerp(new THREE.Color('#ffffff'), 0.25);
  const root = new THREE.Group(); const sh = shadowOf(root, 0.2, 0.16, 0.6, 1.2); sh.position.y = -0.2;
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph(color, 0, 0, 0, 0.1, 0.11, 0.19, { w: 8, h: 6, fn: (x, y) => (y < -0.25 ? belly : null) });
    for (const s of [1, -1]) { b.sph('#ffffff', s * 0.082, 0.04, 0.115, 0.036, 0.036, 0.036, { w: 5, h: 3, sh: 0 }); b.sph(EYE, s * 0.1, 0.04, 0.125, 0.021, 0.023, 0.021, { w: 4, h: 3, sh: 0 }); b.sph('#ff9db8', s * 0.095, -0.02, 0.1, 0.022, 0.014, 0.012, { w: 4, h: 2, sh: 0 }); }
    b.cone(fin, 0, 0.12, -0.03, 0.012, 0.12, { n: 3, rz: 0.1, r: [-0.4, 0, 0] });
  });
  const body = root.getObjectByName('body');
  part(body, 'tail', 0, 0, -0.17, (b) => b.cone(fin, 0, 0, -0.27, 0.012, 0.15, { n: 4, rz: 0.11, r: [PI / 2, 0, 0], sh: 0 }), WINGMAT);
  part(body, 'wingL', 0.07, -0.03, 0.04, (b) => b.cone(fin, 0.12, -0.04, 0.0, 0.01, 0.1, { n: 3, rz: 0.04, r: [0, 0, -1.1] }), WINGMAT);
  part(body, 'wingR', -0.07, -0.03, 0.04, (b) => b.cone(fin, -0.12, -0.04, 0.0, 0.01, 0.1, { n: 3, rz: 0.04, r: [0, 0, 1.1] }), WINGMAT);
  return finish(root, 'fish', 4, 0, true);
}

/* ------------------------------------------------------------------ CLOUD */
/** Unlit (so low-poly facets never show as lighting steps): colour gradient only. The game dims it at night with cloudMat.color. */
export const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: false });
export function cloudModel(seed = 0) {
  const R = rng(seed * 53 + 11), n = 3 + ((R() * 2) | 0); const root = new THREE.Group();
  const sh = blobShadow(1, 0.07, 3.6, 1.8); sh.name = 'shadow'; root.add(sh);
  part(root, 'body', 0, 0, 0, (b) => {
    for (let i = 0; i < n; i++) { const u = n === 1 ? 0 : i / (n - 1) - 0.5, r = 0.95 - Math.abs(u) * 0.55 + R() * 0.15; b.dome('#ffffff', u * 3.4, 0, (R() - 0.5) * 0.5, r, r * 0.72, r * 0.85, { w: 12, h: 3, sh: 0.3, free: true }); }
    const tops = 2 + ((R() * 2) | 0);
    for (let i = 0; i < tops; i++) { const u = tops === 1 ? 0 : i / (tops - 1) - 0.5, r = 0.85 - Math.abs(u) * 0.4 + R() * 0.15; b.sph('#ffffff', u * 2.0 + (R() - 0.5) * 0.3, r * 0.5, (R() - 0.5) * 0.3, r, r * 0.8, r * 0.85, { w: 8, h: 4, sh: 0.26, free: true }); }
  }, cloudMat);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return finish(root, 'cloud', 5, seed, true);
}

/* ------------------------------------------------------------------ BEE (chubby and smiling) */
export function beeModel() {
  const root = new THREE.Group(); const sh = shadowOf(root, 0.08, 0.2, 1, 1); sh.position.y = -0.4;
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph('#ffe35a', 0, 0, 0, 0.075, 0.07, 0.1, { w: 8, h: 6, facet: true, fn: (x, y, z) => (Math.floor((z + 1) * 2.4) % 2 === 1 ? '#9a6a4a' : null) });
    b.cone('#9a6a4a', 0, 0, -0.12, 0.02, 0.05, { n: 3, r: [-PI / 2, 0, 0] });
  });
  const body = root.getObjectByName('body'), hc = [0, 0.005, 0.15], hr = [0.062, 0.058, 0.055];
  const head = part(body, 'head', 0, 0, 0.09, (b) => { b.sph('#ffe35a', hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 6, h: 4 }); face(b, hc, hr, { r: 0.026, az: 0.55, el: 0.15, baz: 0.45, bel: 0.2, sel: -0.55, sw: 0.022 }); b.cyl('#9a6a4a', 0.02, 0.07, 0.15, 0.004, 0.04, { n: 3, open: true, sh: 0 }); b.cyl('#9a6a4a', -0.02, 0.07, 0.15, 0.004, 0.04, { n: 3, open: true, sh: 0 }); });
  eyes(head, hc, hr, 0.55, 0.15, 0.026);
  const wm = new THREE.MeshStandardMaterial({ color: '#eaf8ff', roughness: 0.3, transparent: true, opacity: 0.75, side: THREE.DoubleSide, vertexColors: true, depthWrite: false });
  part(body, 'wingL', 0.03, 0.065, -0.01, (b) => b.sph('#ffffff', 0.075, 0.085, -0.01, 0.06, 0.004, 0.034, { w: 5, h: 3, sh: 0, r: [0, -0.4, 0.3] }), wm);
  part(body, 'wingR', -0.03, 0.065, -0.01, (b) => b.sph('#ffffff', -0.075, 0.085, -0.01, 0.06, 0.004, 0.034, { w: 5, h: 3, sh: 0, r: [0, 0.4, -0.3] }), wm);
  return finish(root, 'bee', 3, 0, true);
}

/* ------------------------------------------------------------------ SNAIL (tiny, shiny shell) */
// variants: shell colour 0 pink, 1 mint, 2 butter, 3 lilac
export function snailModel(seed = 0) {
  const vi = ((seed % 4) + 4) % 4, S = [{ a: '#ff9ec2', b: '#ffd5e5', c: '#ff6fa3' }, { a: '#7fe3b8', b: '#c9f7e3', c: '#44c995' }, { a: '#ffd84a', b: '#fff1a8', c: '#f5b72a' }, { a: '#c5a6ff', b: '#e8dcff', c: '#9f7ae8' }][vi], skin = '#ffe6c8';
  const root = new THREE.Group(); shadowOf(root, 0.2, 0.2, 0.8, 1.5);
  part(root, 'body', 0, 0, 0, (b) => { b.sph(skin, 0, 0.065, -0.02, 0.1, 0.065, 0.2, { w: 7, h: 4 }); });
  const body = root.getObjectByName('body'), hc = [0, 0.15, 0.18], hr = [0.078, 0.075, 0.072];
  const head = part(body, 'head', 0, 0.1, 0.12, (b) => {
    b.sph(skin, hc[0], hc[1], hc[2], hr[0], hr[1], hr[2], { w: 7, h: 4 });
    face(b, hc, hr, { r: 0.034, az: 0.5, el: 0.14, baz: 0.45, bel: 0.2, sel: -0.5, sw: 0.03 });
  });
  eyes(head, hc, hr, 0.5, 0.14, 0.034);
  for (const s of [1, -1]) part(head, s > 0 ? 'earL' : 'earR', s * 0.04, 0.2, 0.17, (b) => { b.cyl(skin, s * 0.045, 0.255, 0.17, 0.011, 0.1, { n: 4, open: true, sh: 0.05 }); b.sph('#ff9ec2', s * 0.045, 0.315, 0.17, 0.027, 0.027, 0.027, { w: 4, h: 3, sh: 0 }); });
  part(body, 'shell', 0, 0.1, -0.07, (b) => {
    const c = [0, 0.23, -0.07], r = [0.14, 0.15, 0.14];
    b.sph(S.b, c[0], c[1], c[2], r[0], r[1], r[2], { w: 8, h: 6 });
    for (const s of [1, -1]) { const az = s * PI / 2; decal(b, GEO.disc(8), S.a, c, r, az, 0, 0.108, 0.108, 0.006); decal(b, GEO.disc(8), S.b, c, r, az, 0, 0.076, 0.076, 0.011, 0.01 * s); decal(b, GEO.disc(7), S.c, c, r, az, 0, 0.044, 0.044, 0.015, 0.02 * s); }
    b.sph(S.a, 0, 0.37, -0.07, 0.055, 0.04, 0.055, { w: 5, h: 3 });
  }, SHELLMAT);
  return finish(root, 'snail', 6, seed);
}

/* ------------------------------------------------------------------ FROGGY on a lily pad */
export function froggyModel(seed = 0) {
  const vi = ((seed % 3) + 3) % 3, G = [{ c: '#8fe86e', b: '#f4ffcf' }, { c: '#6fdcc0', b: '#eafff4' }, { c: '#b8ec6a', b: '#fffbd0' }][vi];
  const root = new THREE.Group(); shadowOf(root, 0.4, 0.18, 1, 1);
  const pad = cached('pad', () => new THREE.CircleGeometry(1, 12, 0.35, PI * 2 - 0.6).rotateX(-PI / 2));
  const flower = ['#ff9ec7', '#ffffff', '#ffd9ec'][vi];
  const pb = new B(0, 0, 0, CMAT); pb.put(pad, '#74dc8c', 0, 0.03, 0, 0.36, 1, 0.36, { sh: 0, fn: (lx, ly, lz) => (Math.hypot(lx, lz) > 0.85 ? '#a8f2a2' : null) });
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; pb.sph(flower, 0.24 + Math.cos(a) * 0.045, 0.07, -0.2 + Math.sin(a) * 0.045, 0.045, 0.02, 0.026, { w: 4, h: 3, sh: 0.05, r: [0, -a, 0] }); }
  pb.sph('#ffd84a', 0.24, 0.085, -0.2, 0.02, 0.016, 0.02, { w: 4, h: 3, sh: 0 });
  for (const m of pb.build()) root.add(m);
  part(root, 'body', 0, 0, 0, (b) => {
    b.sph(G.c, 0, 0.17, 0.0, 0.21, 0.15, 0.19, { w: 8, h: 5, fn: (x, y, z, t, nx, ny, nz) => (ny < -0.2 && nz > -0.1 ? G.b : null) });
    for (const s of [1, -1]) b.sph(G.c, s * 0.115, 0.29, 0.1, 0.07, 0.065, 0.065, { w: 6, h: 4 });
    face(b, [0, 0.17, 0.0], [0.21, 0.15, 0.19], { r: 0.045, az: 0.7, el: 0.0, baz: 0.45, bel: 0.1, sel: -0.12, sw: 0.1, bc: '#ff8fae' });
  });
  const body = root.getObjectByName('body');
  part(body, 'eyes', 0, 0.29, 0.1, (b) => { for (const s of [1, -1]) eyeAt(b, [s * 0.115, 0.29, 0.1], [0.07, 0.065, 0.065], 0, 0.45, 0.045); }, EYEMAT);
  part(body, 'throat', 0, 0.12, 0.16, (b) => b.sph(G.b, 0, 0.11, 0.17, 0.08, 0.05, 0.05, { w: 6, h: 3, sh: 0.05 }));
  legGroup(root, 0.1, [[0.1, 0.13], [-0.1, 0.13], [0.17, -0.07], [-0.17, -0.07]], (b, x, z, i) => {
    if (i < 2) b.sph(G.c, x * 1.1, 0.04, z + 0.03, 0.04, 0.04, 0.055, { w: 4, h: 3 }); else b.sph(G.c, x, 0.05, z, 0.075, 0.055, 0.12, { w: 5, h: 4, r: [0, x > 0 ? -0.3 : 0.3, 0] });
  });
  return finish(root, 'froggy', 7, seed);
}

export const CRITTERS = { sheep: sheepModel, chicken: chickenModel, cow: cowModel, dog: dogModel, cat: catModel, duck: duckModel, bunny: bunnyModel, bird: birdModel, butterfly: butterflyModel, fish: fishModel, cloud: cloudModel, bee: beeModel, puppy: puppyModel, kitten: kittenModel, snail: snailModel, froggy: froggyModel, duckling: ducklingModel };

/* ------------------------------------------------------------------ ANIMATION (no allocation per call) */
// f stride speed, bob, leg swing, sway, pitch, tf/ta tail wag freq/amp, er ear flop; hop = happy-hop height, hr = hops per second, hd = share of the cycle spent hopping, hs = squash amount
const GA = {
  sheep: { f: 6.2, bob: 0.05, leg: 0.6, sway: 0.07, pitch: 0.04, tf: 7, ta: 0.35, er: 0.12, hop: 0.07, hr: 0.2, hd: 0.1 },
  cow: { f: 4.2, bob: 0.03, leg: 0.42, sway: 0.04, pitch: 0.03, tf: 2.6, ta: 0.45, er: 0.1, hop: 0.03, hr: 0.12, hd: 0.14 },
  dog: { f: 9.5, bob: 0.05, leg: 0.8, sway: 0.05, pitch: 0.06, tf: 15, ta: 0.7, er: 0.2, hop: 0.1, hr: 0.28, hd: 0.09 },
  puppy: { f: 11, bob: 0.06, leg: 0.9, sway: 0.07, pitch: 0.07, tf: 18, ta: 0.8, er: 0.25, hop: 0.13, hr: 0.4, hd: 0.08 },
  cat: { f: 7.5, bob: 0.02, leg: 0.7, sway: 0.03, pitch: 0.04, tf: 2.2, ta: 0.4, er: 0.08, hop: 0.05, hr: 0.14, hd: 0.14 },
  kitten: { f: 9, bob: 0.03, leg: 0.8, sway: 0.05, pitch: 0.05, tf: 3, ta: 0.5, er: 0.1, hop: 0.09, hr: 0.3, hd: 0.1 },
  chicken: { f: 9, bob: 0.025, leg: 0.8, sway: 0.07, nod: 0.035, hop: 0.07, hr: 0.25, hd: 0.1 },
  duck: { f: 6.5, bob: 0.02, leg: 0.7, sway: 0.16, nod: 0.01, hop: 0.05, hr: 0.2, hd: 0.12 },
  duckling: { f: 9, bob: 0.025, leg: 0.9, sway: 0.2, nod: 0.015, hop: 0.09, hr: 0.35, hd: 0.09 },
  bunny: { f: 5.4, hop: 0.12, hr: 0.28, hd: 0.1 },
  froggy: { f: 3.2, hop: 0.1, hr: 0.22, hd: 0.14 },
  snail: {},
  bird: { fidle: 3, ffly: 15, amp: 0.8 }, bee: { fidle: 30, ffly: 44, amp: 0.55 }, butterfly: { fidle: 3.5, ffly: 11, amp: 0.8 },
};
// happy-hop curve: anticipation squash, stretch in the air, landing squash. Writes HY (0..1 height) and HS (-1..1 squash) without allocating.
let HY = 0, HS = 0;
function hopFx(t, sp, ph, rate, dur) {
  HY = HS = 0; if (!rate) return;
  const c = t * rate * sp + ph * 0.159, f = c - Math.floor(c); if (f >= dur) return; const u = f / dur;
  if (u < 0.2) HS = -Math.sin((u / 0.2) * PI) * 0.9; else if (u < 0.8) { const w = Math.sin(((u - 0.2) / 0.6) * PI); HY = w; HS = w * 0.8; } else HS = -Math.sin(((u - 0.8) / 0.2) * PI);
}
const quad = (a, t, sp, ph, P) => {
  const W = a.wW, Gz = a.wG, w = t * sp * P.f + ph, s1 = Math.sin(w), s2 = Math.sin(2 * w), c2 = Math.cos(2 * w), body = a.body, idle = 1 - W, k = idle * (1 - Gz);
  hopFx(t, sp, ph, P.hr, P.hd); const hy = HY * k, hs = HS * k;
  body.position.y = a.by + W * Math.abs(s1) * P.bob + hy * P.hop; body.rotation.z = W * s1 * P.sway + idle * Math.sin(t * 1.3 * sp + ph) * 0.035; body.rotation.x = W * s2 * P.pitch + Gz * 0.12 - hy * 0.12;
  const sq = Math.sin(t * 2.4 * sp + ph) * 0.022 * idle + W * c2 * 0.03 + hs * 0.13; body.scale.y = 1 + sq; body.scale.x = body.scale.z = 1 - sq * 0.5;
  if (a.legG) a.legG.position.y = hy * P.hop;
  const L = a.legs; for (let i = 0; i < L.length; i++) L[i].rotation.x = W * Math.sin(w + (i === 1 || i === 2 ? PI : 0)) * P.leg + hy * (i < 2 ? -0.5 : 0.5);
  const h = a.head; if (h) { h.rotation.x = Gz * (0.78 + Math.sin(t * 5.5 * sp + ph) * 0.09) + W * s2 * 0.05 + idle * (1 - Gz) * Math.sin(t * 1.1 + ph) * 0.05 - hs * 0.08; h.rotation.y = idle * (1 - Gz * 0.8) * Math.sin(t * 0.55 * sp + ph * 1.7) * 0.45; h.rotation.z = k * Math.sin(t * 0.8 * sp + ph * 2) * 0.1; }
  if (a.earL) { let tw = Math.max(0, Math.sin(t * 1.3 + ph * 5)); tw = tw * tw * tw * tw * 0.55; const fl = Math.sin(t * 3 * sp + ph) * 0.05 + W * s2 * P.er - hy * 0.35; a.earL.rotation.z = a.elz + fl + tw; a.earR.rotation.z = a.erz - fl - tw * 0.6; }
  if (a.tail) { a.tail.rotation.y = Math.sin(t * P.tf * sp + ph) * P.ta * (1 + W * 0.5 + (hy > 0 ? 0.7 : 0)); a.tail.rotation.x = W * s1 * 0.08 + hy * 0.25; }
};
const biped = (a, t, sp, ph, P) => {
  const W = a.wW, Gz = a.wG, F = a.wF, w = t * sp * P.f + ph, s1 = Math.sin(w), body = a.body, idle = 1 - W - F, k = Math.max(0, idle) * (1 - Gz);
  let pk = Math.sin(t * sp * 5.5 + ph); pk = pk > 0 ? pk * pk : 0;
  hopFx(t, sp, ph, P.hr, P.hd); const hy = HY * k, hs = HS * k;
  body.position.y = a.by + W * Math.abs(s1) * P.bob + F * (0.1 + 0.05 * Math.sin(t * sp * 18)) + hy * P.hop;
  body.rotation.z = W * s1 * P.sway + idle * Math.sin(t * 1.4 * sp + ph) * 0.04; body.rotation.x = Gz * (0.25 + 0.55 * pk) - F * 0.25 - hy * 0.1;
  const sq = Math.sin(t * 2.6 * sp + ph) * 0.025 * idle - Gz * pk * 0.04 + hs * 0.14; body.scale.y = 1 + sq; body.scale.x = body.scale.z = 1 - sq * 0.5;
  if (a.legG) a.legG.position.y = hy * P.hop;
  const L = a.legs; L[0].rotation.x = W * s1 * P.leg + F * 0.7 - hy * 0.4; L[1].rotation.x = -W * s1 * P.leg + F * 0.7 - hy * 0.4;
  const h = a.head; h.position.z = a.hz + W * s1 * P.nod; h.rotation.x = Gz * 0.55 * pk - F * 0.2 - hs * 0.1; h.rotation.y = idle * Math.sin(t * 0.9 * sp + ph * 1.7) * 0.5 + W * s1 * 0.12; h.rotation.z = k * Math.sin(t * 0.7 * sp + ph * 2) * 0.1;
  const fl = F * (0.9 + 0.9 * Math.sin(t * sp * 24 + ph)) + (1 - F) * (0.04 + 0.04 * Math.sin(t * 2 + ph) + W * 0.1 * s1 + hy * 0.9);
  a.wingL.rotation.z = a.wlz + fl; a.wingR.rotation.z = a.wrz - fl;
  a.tail.rotation.x = Math.sin(t * 2.2 * sp + ph) * 0.06 + W * s1 * 0.12 + Gz * pk * 0.2; a.tail.rotation.y = Math.sin(t * 6 * sp + ph) * 0.18 * (hy > 0 ? 2 : 1);
};
const hopper = (a, t, sp, ph, P) => {
  const W = a.wW, Gz = a.wG, w = t * sp * P.f + ph, hs = Math.sin(w), hop = Math.max(0, hs), cr = Math.max(0, -hs), body = a.body, idle = 1 - W, k = idle * (1 - Gz);
  hopFx(t, sp, ph, P.hr, P.hd); const hy = HY * k, hq = HS * k;
  body.position.y = a.by + W * hop * 0.2 + hy * P.hop; body.rotation.x = W * (-hop * 0.3 + cr * 0.12) + Gz * 0.1 - hy * 0.2;
  const sy = 1 + W * (hop * 0.07 - cr * 0.1) + idle * Math.sin(t * 2.4 * sp + ph) * 0.02 + hq * 0.14; body.scale.y = sy; body.scale.x = body.scale.z = 1 / Math.sqrt(sy);
  if (a.legG) a.legG.position.y = hy * P.hop;
  const L = a.legs; L[0].rotation.x = L[1].rotation.x = W * (hop * 0.7 - cr * 0.2) + hy * 0.7; L[2].rotation.x = L[3].rotation.x = W * (-hop * 0.9 + cr * 0.5) - hy * 0.9;
  const h = a.head; h.rotation.x = Gz * (0.5 + 0.1 * Math.sin(t * 16 * sp)) + idle * (1 - Gz) * (Math.sin(t * 1.1 + ph) * 0.05 + Math.max(0, Math.sin(t * 7 + ph)) * Math.max(0, Math.sin(t * 0.7 + ph * 3)) * 0.07) + W * (-hop * 0.2) - hq * 0.1;
  h.rotation.y = idle * (1 - Gz) * Math.sin(t * 0.5 * sp + ph * 1.7) * 0.5; h.rotation.z = k * Math.sin(t * 0.9 * sp + ph * 2) * 0.12;
  let tw = Math.max(0, Math.sin(t * 1.1 + ph * 5)); tw = tw * tw * tw * tw * 0.7;
  const lag = W * (-hop * 0.45 + cr * 0.3) - hy * 0.5; a.earL.rotation.x = lag + Gz * 0.1; a.earR.rotation.x = lag + Gz * 0.1;
  a.earL.rotation.z = a.elz + Math.sin(t * 2 + ph) * 0.04 + tw; a.earR.rotation.z = a.erz - Math.sin(t * 2 + ph) * 0.04 - tw * 0.5;
  a.tail.rotation.x = W * hop * 0.3 + hy * 0.3; a.tail.scale.setScalar(1 + Math.max(0, Math.sin(t * 9 * sp + ph)) * 0.08 * k);
};
const flyer = (a, t, sp, ph, P, always) => {
  const F = always ? 1 : a.wF, W = a.wW, fr = (P.fidle + (P.ffly - P.fidle) * (always ? a.wF : F)) * sp, ws = Math.sin(t * fr + ph), body = a.body;
  const amp = P.amp * (always ? 0.45 + 0.55 * a.wF : 1);
  const fold = always ? 0 : -1.2, ang = fold + (always ? amp * ws + 0.15 : (1.2 + 0.15 + amp * ws)) * (always ? 1 : F);
  a.wingL.rotation.z = ang; a.wingR.rotation.z = -ang;
  body.position.y = a.by + (always ? Math.sin(t * 2.3 * sp + ph) * 0.03 + ws * 0.02 * a.wF : Math.sin(t * 2.3 * sp + ph) * 0.012 * F + W * Math.abs(Math.sin(t * 9 * sp + ph)) * 0.035);
  body.rotation.x = always ? Math.sin(t * 1.7 + ph) * 0.1 - 0.05 : -F * 0.12 + ws * 0.06 * F + W * Math.sin(t * 9 * sp + ph) * 0.08;
  body.rotation.z = always ? Math.sin(t * 1.3 + ph) * 0.12 * a.wF : 0;
  if (!always) { const sq = Math.sin(t * 3 * sp + ph) * 0.02 * (1 - F); body.scale.y = 1 + sq; body.scale.x = body.scale.z = 1 - sq * 0.5; }
  const h = a.head; if (h) { h.rotation.y = (1 - F) * Math.sin(t * 1.3 * sp + ph * 1.7) * 0.7; h.rotation.x = (1 - F) * Math.sin(t * 2.7 + ph) * 0.12; h.rotation.z = (1 - F) * Math.sin(t * 1.9 + ph) * 0.12; }
  if (a.tail) a.tail.rotation.x = Math.sin(t * 2.6 * sp + ph) * 0.12 + (1 - F) * 0.2;
};
const swim = (a, t, sp, ph) => {
  const mv = Math.max(a.wW, a.wF), w = t * sp * (3 + 5 * mv) + ph, body = a.body;
  body.rotation.y = Math.sin(w - 0.9) * (0.08 + 0.08 * mv); body.rotation.z = Math.sin(w * 0.5) * 0.04; body.position.y = a.by + Math.sin(w * 0.5) * 0.012;
  a.tail.rotation.y = Math.sin(w) * (0.4 + 0.25 * mv); a.wingL.rotation.z = a.wlz + Math.sin(w * 1.5) * 0.25; a.wingR.rotation.z = a.wrz - Math.sin(w * 1.5) * 0.25;
};
const snailA = (a, t, sp, ph) => {
  const W = a.wW, Gz = a.wG, body = a.body, w = t * sp * (1.6 + 2.6 * W) + ph;
  hopFx(t, sp, ph, 0.1, 0.1); const hy = HY * (1 - W), hs = HS * (1 - W);
  body.position.y = a.by + hy * 0.05; body.scale.z = 1 + Math.sin(w) * (0.04 + 0.1 * W) + hs * 0.06; body.scale.y = 1 - Math.sin(w) * (0.02 + 0.05 * W) + hs * 0.1; body.scale.x = 1 - hs * 0.04; body.rotation.z = Math.sin(t * 0.7 * sp + ph) * 0.03;
  const h = a.head; h.rotation.x = Gz * 0.45 + Math.sin(t * 1.1 + ph) * 0.05 + W * Math.sin(w) * 0.05; h.rotation.y = (1 - W) * Math.sin(t * 0.6 * sp + ph * 1.7) * 0.35;
  const sh = a.shell; sh.rotation.z = Math.sin(w - 1) * 0.05; sh.rotation.x = -Math.sin(w) * 0.04; sh.scale.y = 1 + Math.sin(t * 2.2 + ph) * 0.02;
  a.earL.rotation.z = a.elz + Math.sin(t * 2.1 * sp + ph) * 0.2; a.earL.rotation.x = Math.sin(t * 1.7 + ph) * 0.22; a.earR.rotation.z = a.erz - Math.sin(t * 2.1 * sp + ph + 1.3) * 0.2; a.earR.rotation.x = Math.sin(t * 1.7 + ph + 1.1) * 0.22;
};
const frogA = (a, t, sp, ph, P) => {
  const W = a.wW, Gz = a.wG, body = a.body, idle = 1 - W, w = t * sp * P.f + ph, hs = Math.sin(w), hop = Math.max(0, hs), cr = Math.max(0, -hs);
  hopFx(t, sp, ph, P.hr, P.hd); const hy = HY * idle, hq = HS * idle;
  const c = t * 0.3 * sp + ph * 0.0795, f = c - Math.floor(c); let puff = 0; if (f < 0.2 && idle > 0.5) puff = Math.abs(Math.sin((f / 0.2) * PI * 2)) * Math.sin((f / 0.2) * PI);
  body.position.y = a.by + W * hop * 0.2 + hy * P.hop; body.rotation.x = W * (-hop * 0.35 + cr * 0.1) - hy * 0.15;
  const sq = W * (hop * 0.1 - cr * 0.16) + hq * 0.15 + Math.sin(t * 2 * sp + ph) * 0.015 * idle + puff * 0.05; body.scale.y = 1 + sq; body.scale.x = body.scale.z = 1 - sq * 0.5;
  a.throat.scale.set(1 + puff * 0.6, 1 + puff * 1.5, 1 + puff * 1.5); body.rotation.z = Math.sin(t * 0.9 * sp + ph) * 0.03 * idle;
  if (a.legG) a.legG.position.y = hy * P.hop + W * hop * 0.2;
  const L = a.legs; L[0].rotation.x = L[1].rotation.x = W * (hop * 0.6 - cr * 0.2) + hy * 0.6; L[2].rotation.x = L[3].rotation.x = W * (-hop * 0.9 + cr * 0.4) - hy * 0.8;
};

/**
 * Drive a critter. anim = 'idle' | 'walk' | 'graze' | 'fly' (fly = swim/hover/flap/hop-flutter for animals that can).
 * t = seconds (monotonic), speed = playback speed multiplier (1 = normal), state = optional phase offset (number) or {phase}.
 * Poses blend with eased weights, so switching anim never snaps. Call every frame. Zero allocation.
 * Idle is lively: breathing squash, happy hops with squash and stretch every few seconds, head tilts, ear wiggles, tail wags, blinks.
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
    case 6: snailA(a, t, sp, ph); break;
    case 7: frogA(a, t, sp, ph, GA[K]); break;
  }
  if (a.eyes) { // blink every ~4 s (some critters double-blink); content closed eyes while grazing
    const bt = (t * sp + ph * 1.3) % 4.1; let s = 1; if (bt < 0.16) s = 1 - 0.93 * Math.sin((bt / 0.16) * PI); else if (bt > 0.34 && bt < 0.48 && ((ph * 7) | 0) % 2 === 0) s = 1 - 0.93 * Math.sin(((bt - 0.34) / 0.14) * PI);
    s = Math.min(s, 1 - 0.78 * a.wG); a.eyes.scale.y = s < 0.07 ? 0.07 : s;
  }
  const sh = a.shadow;
  if (sh) {
    if (a.air) { const y = g.position.y, ys = g.scale.y || 1, f = a.kind === 'cloud' ? 1 : 1 / (1 + Math.max(0, y) * 0.15); sh.position.y = (0.02 - y) / ys; sh.scale.x = a.sx * f; sh.scale.y = a.sy * f; }
    else { const f = Math.max(0.5, 1 - (a.body.position.y - a.by) * 1.6); sh.scale.x = a.sx * f; sh.scale.y = a.sy * f; }
  }
}
