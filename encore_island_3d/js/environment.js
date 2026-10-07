// Encore Island 3D — environment (lighting, sky, water, islands, plaza, flora, boardwalk, particles)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C } from './palette.js';

/* ───────────────────────── helpers ───────────────────────── */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (x, y, s = 0) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };
function jc(hex, amt, r) { // colour with lightness jitter
  _c1.set(hex); _c1.getHSL(_hsl);
  return _c1.setHSL(_hsl.h, _hsl.s, clamp(_hsl.l + (r() - 0.5) * amt, 0, 1)).clone();
}
function mixc(h1, h2, t) { _c1.set(h1); _c2.set(h2); return _c1.lerp(_c2, clamp(t, 0, 1)).clone(); }

function makeBlob(R, seed, amp = 1) {
  const r = rng(seed); const p = [r() * 6.28, r() * 6.28, r() * 6.28];
  return a => R * (1 + amp * (0.035 * Math.sin(3 * a + p[0]) + 0.025 * Math.sin(5 * a + p[1]) + 0.015 * Math.sin(8 * a + p[2])));
}

// geometry prep: non-indexed, no uv, flat colours per face
function prep(g) { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }
function jitter(g, amp, seed = 1) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = x * 31.7 + z * 17.3, m = y * 23.1;
    p.setXYZ(i, x + (hash(k, m, seed) - 0.5) * 2 * amp, y + (hash(k, m, seed + 7) - 0.5) * 2 * amp, z + (hash(k, m, seed + 13) - 0.5) * 2 * amp);
  }
  g.computeVertexNormals(); return g;
}
function paintFaces(g, fn) {
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const c = fn(cx, cy, cz, i / 3);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function xf(g, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  _q.setFromEuler(_e.set(rx, ry, rz)); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); g.applyMatrix4(_m); return g;
}
function finish(g) { if (!g.attributes.normal) g.computeVertexNormals(); return g; }
function merge(list) { return mergeGeometries(list.map(g => { const n = g; ['uv', 'uv1'].forEach(k => n.deleteAttribute(k)); return n; }), false); }

const vcMat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, ...o });

/* ───────────────────────── constants ───────────────────────── */
const WATER_Y = -2.3;
const WCEN = { x: -3, z: 8 };
const HORIZON = 0xffd8d6, HORIZON2 = 0xffc9d4;
const HUB = { x: 0, z: 0 }, MEADOW = { x: -12.7, z: 13.1 }, LOCKED = { x: 6, z: 22 };
const ISLETS = [{ x: 15.5, z: -9.5, R: 2.2 }, { x: -20.5, z: -4.5, R: 2.7 }];
const PLAZA_R = 8.2;

// cliff strata profile: [y, k (radius factor), colour of band below this row]
const PROFILE = [
  [-0.04, 1.0, 0x8fda72], [-0.36, 1.01, 0xf6d9c4], [-1.5, 0.96, 0xeac4dc], [-1.6, 0.9, 0xc2a6ea],
  [-3.0, 0.85, 0xae8ae0], [-3.1, 0.77, 0x9878d2], [-4.4, 0.68, 0x8668c6], [-4.5, 0.58, 0x7658b8],
  [-5.6, 0.45, 0x654ca6], [-5.7, 0.36, 0x5a4196], [-6.9, 0.12, 0x4f388a], [-7.6, 0.0, 0x4f388a],
];
function cliffK(y, sy = 1) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const y0 = PROFILE[i][0] * sy, y1 = PROFILE[i + 1][0] * sy;
    if (y <= y0 && y >= y1) return lerp(PROFILE[i][1], PROFILE[i + 1][1], (y0 - y) / (y0 - y1 + 1e-6));
  }
  return 0.2;
}

/* ───────────────────────── island terrain ───────────────────────── */
function buildIsland({ cx, cz, Rfn, seg, rings, pal, seed, sy = 1, chunks = 10, hangs = 4, roots = 0, lockedTint = null }) {
  const rnd = rng(seed);
  const pos = [], col = [];
  const tri = (a, b, c, color, mode) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3, mz = (a[2] + b[2] + c[2]) / 3;
    const ok = mode === 'up' ? ny >= 0 : (nx * mx + nz * mz >= 0);
    if (!ok) { const t = b; b = c; c = t; }
    for (const v of [a, b, c]) { pos.push(v[0] + cx, v[1], v[2] + cz); col.push(color.r, color.g, color.b); }
  };
  const tint = c => lockedTint ? c.lerp(_c2.set(lockedTint), 0.62) : c;
  const A = []; for (let j = 0; j < seg; j++) A.push(((j + (rnd() - 0.5) * 0.7) / seg) * Math.PI * 2);
  const Rj = A.map(a => Rfn(a));
  // top
  const ringPts = [];
  for (let i = 1; i <= rings; i++) {
    const f = i / rings, ring = [];
    for (let j = 0; j < seg; j++) {
      const r = Rj[j] * f * (i < rings ? 1 + (rnd() - 0.5) * 0.05 : 1);
      ring.push([Math.cos(A[j]) * r, i < rings ? 0 : -0.04, Math.sin(A[j]) * r]);
    }
    ringPts.push(ring);
  }
  const topCol = (x, z, edge) => {
    const n = vnoise((x + cx) * 0.33, (z + cz) * 0.33, seed) * 0.75 + rnd() * 0.45;
    let c = n < 0.45 ? pal[0] : n < 0.8 ? pal[1] : pal[2];
    c = jc(c, 0.05, rnd); if (edge) c.lerp(_c2.set(0xb8ec86), 0.35);
    return tint(c);
  };
  for (let j = 0; j < seg; j++) {
    const j2 = (j + 1) % seg;
    tri([0, 0, 0], ringPts[0][j], ringPts[0][j2], topCol(ringPts[0][j][0] * 0.4, ringPts[0][j][2] * 0.4), 'up');
    for (let i = 0; i < rings - 1; i++) {
      const a = ringPts[i][j], b = ringPts[i][j2], c = ringPts[i + 1][j], d = ringPts[i + 1][j2];
      const edge = i === rings - 2;
      tri(a, c, b, topCol((a[0] + c[0]) / 2, (a[2] + c[2]) / 2, edge), 'up');
      tri(b, c, d, topCol((b[0] + d[0]) / 2, (b[2] + d[2]) / 2, edge), 'up');
    }
  }
  // cliff strata
  const rows = PROFILE.map((row, l) => {
    const pts = [];
    for (let j = 0; j < seg; j++) {
      const jj = rnd(), jy = rnd();
      const k = row[1] * (l === 0 ? 1 : 1 + (jj - 0.5) * 0.07);
      const a = A[j] + (l === 0 ? 0 : (rnd() - 0.5) * 0.05);
      const y = row[0] * sy + (l === 0 || l === PROFILE.length - 1 ? 0 : (jy - 0.5) * 0.16);
      pts.push([Math.cos(a) * Rj[j] * k, y, Math.sin(a) * Rj[j] * k]);
    }
    return pts;
  });
  for (let l = 0; l < PROFILE.length - 1; l++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const a = rows[l][j], b = rows[l][j2], c = rows[l + 1][j], d = rows[l + 1][j2];
      const bc = PROFILE[l][2];
      tri(a, b, c, tint(jc(bc, 0.09, rnd)), 'out');
      if (l < PROFILE.length - 2) tri(b, d, c, tint(jc(bc, 0.09, rnd)), 'out');
    }
  }
  let base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  base.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  base.computeVertexNormals();
  const extras = [base];
  const Rm = Rfn(0);
  // faceted chunks on the cliffs
  const rockCols = [0xc2a6ea, 0xb496e2, 0xdcc0ee, 0xa98ad8, 0xf0cce0, 0x9a7ad0];
  for (let i = 0; i < chunks; i++) {
    const a = rnd() * Math.PI * 2, y = -(1.9 + rnd() * 3.6) * sy, k = cliffK(y, sy), r = Rfn(a) * k * 0.97, s = (0.45 + rnd() * 0.7) * Math.min(1, Rm / 6);
    const g = prep(new THREE.IcosahedronGeometry(1, 0)); jitter(g, 0.18, i + seed);
    const cc = rockCols[Math.floor(rnd() * rockCols.length)];
    paintFaces(g, () => tint(jc(cc, 0.12, rnd)));
    xf(g, Math.cos(a) * r + cx, y, Math.sin(a) * r + cz, s * 1.3, s * 0.8, s * 1.1, rnd() * 3, rnd() * 6, rnd() * 3);
    extras.push(g);
  }
  // hanging stalactite rocks
  for (let i = 0; i < hangs; i++) {
    const a = rnd() * Math.PI * 2, rr = rnd() * 0.45, y0 = -6.2 * sy - rnd() * 0.4, h = (1.4 + rnd() * 1.6) * sy, w = (0.35 + rnd() * 0.4) * Math.min(1, Rm / 6);
    const g = prep(new THREE.ConeGeometry(w, h, 5, 1)); jitter(g, 0.07, i * 3 + seed);
    paintFaces(g, () => tint(jc(0x5a4196, 0.15, rnd)));
    xf(g, Math.cos(a) * Rm * rr + cx, y0 - h * 0.3, Math.sin(a) * Rm * rr + cz, 1, 1, 1, Math.PI, 0, 0);
    extras.push(g);
  }
  // hanging roots (curvy thin cones from the strata)
  for (let i = 0; i < roots; i++) {
    const a = rnd() * Math.PI * 2, y = -(0.5 + rnd() * 1.6) * sy, k = cliffK(y, sy), r = Rfn(a) * k, h = 1.2 + rnd() * 1.8;
    const g = prep(new THREE.ConeGeometry(0.07 + rnd() * 0.05, h, 4, 2)); jitter(g, 0.03, i + 99);
    paintFaces(g, (x, yy) => tint(mixc(0x7a5238, 0xb08058, (yy + h / 2) / h * 0.6 + rnd() * 0.2)));
    xf(g, Math.cos(a) * (r * 0.96) + cx, y - h * 0.42, Math.sin(a) * (r * 0.96) + cz, 1, 1, 1, Math.PI + Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15);
    extras.push(g);
  }
  return extras;
}

/* ───────────────────────── plaza texture ───────────────────────── */
function makePlazaTexture(renderer) {
  const S = 1536, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  const R = S / 2, rnd = rng(77);
  g.fillStyle = '#d6bba6'; g.fillRect(0, 0, S, S); // mortar
  const cream = ['#fff6ea', '#fbeedd', '#f6e4d0', '#fff1e6', '#fdeaee', '#f9e9d6'];
  const pinks = ['#ff86bb', '#ff74b0', '#ff98c6', '#ff6aa8'];
  const lil = ['#d8c2f2', '#cdb4ee'];
  const cob = (r, a, w, h, color) => {
    g.save(); g.translate(R + Math.cos(a) * r, R + Math.sin(a) * r); g.rotate(a + Math.PI / 2);
    g.fillStyle = color; const rr = Math.min(w, h) * 0.32; g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, rr); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.roundRect(-w / 2 + 2, -h / 2 + 2, w * 0.7, h * 0.3, rr * 0.6); g.fill();
    g.restore();
  };
  const ringW = R * 0.036; // ring thickness in px
  const nRings = Math.floor(R * 0.99 / ringW);
  for (let i = 1; i <= nRings; i++) {
    const r = i * ringW, rn = r / R, circ = 2 * Math.PI * r;
    const n = Math.max(6, Math.round(circ / (ringW * 1.35)));
    const off = rnd() * 6.28;
    for (let k = 0; k < n; k++) {
      const a = off + (k / n) * Math.PI * 2, w = (circ / n) * 0.9, h = ringW * 0.88;
      let color = cream[Math.floor(rnd() * cream.length)];
      const sector = Math.floor(((a % 6.2832) + 6.2832) % 6.2832 / (Math.PI / 6));
      if (rn < 0.7 && sector % 2 === 0 && rnd() < 0.5) color = '#fdebf0'; // faint sunburst
      if (rn > 0.715 && rn < 0.77 && (k % 5) !== 4) color = pinks[Math.floor(rnd() * 4)];   // dashed pink ring path
      if (rn > 0.945) color = (k % 2 === 0) ? pinks[Math.floor(rnd() * 4)] : '#fff3e8';       // border
      if (rn > 0.43 && rn < 0.465 && (k % 3) === 0) color = '#ffe08a';                        // inner gold dots
      if (rn > 0.91 && rn <= 0.945) color = lil[k % 2];
      cob(r, a, w, h, color);
    }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return tex;
}

/* ───────────────────────── flora geometry ───────────────────────── */
function cherryGeo() {
  const r = rng(5); const list = [];
  const trunk = prep(new THREE.CylinderGeometry(0.11, 0.2, 1.7, 6, 1)); jitter(trunk, 0.02, 3);
  paintFaces(trunk, (x, y) => mixc(0x7a4f36, 0xa87650, (y + 0.85) / 1.7)); list.push(xf(trunk, 0, 0.85, 0));
  const br = prep(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 5, 1)); paintFaces(br, () => _c1.set(0x946445).clone()); list.push(xf(br, 0.28, 1.75, 0.05, 1, 1, 1, 0, 0, -0.6));
  const br2 = prep(new THREE.CylinderGeometry(0.05, 0.09, 0.8, 5, 1)); paintFaces(br2, () => _c1.set(0x946445).clone()); list.push(xf(br2, -0.25, 1.7, -0.1, 1, 1, 1, 0.2, 0, 0.55));
  const blobs = [[0, 2.65, 0, 1.25], [0.95, 2.2, 0.25, 0.9], [-0.9, 2.3, -0.3, 0.9], [0.1, 3.35, 0.35, 0.8], [-0.2, 2.35, 0.9, 0.75], [0.35, 2.4, -0.85, 0.7]];
  blobs.forEach(([x, y, z, rad], i) => {
    const g = prep(new THREE.IcosahedronGeometry(rad, 1)); jitter(g, rad * 0.11, 10 + i);
    paintFaces(g, (cx, cy, cz) => {
      const t = clamp((cy + rad * 0.9) / (rad * 1.8), 0, 1);
      let c = mixc(0xff6aac, 0xffc2dc, Math.pow(t, 0.8) + (r() - 0.5) * 0.18);
      if (r() < 0.07) c = _c1.set(0xfff0f6).clone();
      return c;
    });
    list.push(xf(g, x, y - rad * 0.9 + rad * 0.9, z, 1, 0.82, 1, 0, i, 0));
  });
  return merge(list);
}
function pineGeo() {
  const r = rng(9); const list = [];
  const t = prep(new THREE.CylinderGeometry(0.09, 0.14, 0.9, 5)); paintFaces(t, () => _c1.set(0x8a5e40).clone()); list.push(xf(t, 0, 0.45, 0));
  [[1.0, 1.6, 0.85], [0.8, 1.4, 1.65], [0.58, 1.2, 2.4], [0.34, 0.9, 3.0]].forEach(([rad, h, y], i) => {
    const g = prep(new THREE.ConeGeometry(rad, h, 7, 1)); jitter(g, 0.05, 20 + i);
    paintFaces(g, (cx, cy) => { const tt = clamp((cy + h / 2) / h, 0, 1); return mixc(i % 2 ? 0x3fae96 : 0x4cc0a0, 0x9af0c8, tt * 0.55 + r() * 0.12); });
    list.push(xf(g, 0, y + h * 0.15, 0, 1, 1, 1, 0, i * 0.5, 0));
  });
  return merge(list);
}
function bushGeo() {
  const r = rng(11); const list = [];
  const g = prep(new THREE.IcosahedronGeometry(0.62, 1)); jitter(g, 0.07, 31);
  paintFaces(g, (x, y) => mixc(0x68cf66, 0xa8ec88, clamp((y + 0.4) / 0.9, 0, 1) + (r() - 0.5) * 0.25));
  list.push(xf(g, 0, 0.36, 0, 1, 0.75, 1));
  const cols = [0xff7eb6, 0xfff4e6, 0xffd84d, 0xffa6cb, 0xff7eb6];
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.28, h = r() * 0.4, rr = 0.5 * Math.cos(h);
    const f = prep(new THREE.IcosahedronGeometry(0.085, 0)); paintFaces(f, () => jc(cols[i % cols.length], 0.1, r));
    list.push(xf(f, Math.cos(a) * rr, 0.32 + Math.sin(h) * 0.62 * 0.75 + 0.1, Math.sin(a) * rr, 1, 1, 1, r() * 3, r() * 3, 0));
  }
  return merge(list);
}
function flowerGeo(headHex, seed) {
  const r = rng(seed); const list = [];
  for (let i = 0; i < 6; i++) {
    const a = r() * 6.28, d = 0.08 + r() * 0.3, h = 0.28 + r() * 0.22, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const s = prep(new THREE.CylinderGeometry(0.014, 0.02, h, 3, 1, true)); paintFaces(s, () => _c1.set(0x58b55a).clone()); list.push(xf(s, x, h / 2, z));
    const hd = prep(new THREE.OctahedronGeometry(0.1 + r() * 0.03, 0)); paintFaces(hd, (cx, cy) => cy > 0.035 ? _c1.set(0xffd84d).clone() : jc(headHex, 0.1, r)); list.push(xf(hd, x, h + 0.02, z, 1, 0.55, 1, 0, r() * 3, 0));
    if (i < 2) { const lf = prep(new THREE.ConeGeometry(0.05, 0.2, 3, 1, true)); paintFaces(lf, () => _c1.set(0x7fd66e).clone()); list.push(xf(lf, x + 0.06, 0.1, z, 1, 1, 1, 0, 0, -0.8)); }
  }
  return merge(list);
}
function tuftGeo() {
  const r = rng(13); const list = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + r(), h = 0.3 + r() * 0.3;
    const g = prep(new THREE.ConeGeometry(0.055, h, 3, 1, true)); paintFaces(g, (x, y) => mixc(0x58bd5c, 0xcdf6a0, clamp((y + h / 2) / h, 0, 1)));
    list.push(xf(g, Math.cos(a) * 0.06, h / 2, Math.sin(a) * 0.06, 1, 1, 1, Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28));
  }
  return merge(list);
}
function rockGeo() {
  const r = rng(17);
  const g = prep(new THREE.DodecahedronGeometry(0.42, 0)); jitter(g, 0.07, 41);
  paintFaces(g, (x, y) => mixc(0xa9b1c9, 0xd6d8ea, clamp((y + 0.3) / 0.7, 0, 1) + (r() - 0.5) * 0.25));
  return xf(g, 0, 0.14, 0, 1, 0.7, 1);
}
function mushroomGeo() {
  const r = rng(19); const list = [];
  const s = prep(new THREE.CylinderGeometry(0.05, 0.075, 0.24, 5)); paintFaces(s, () => _c1.set(0xfff0e0).clone()); list.push(xf(s, 0, 0.12, 0));
  const cap = prep(new THREE.SphereGeometry(0.2, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2)); paintFaces(cap, () => jc(0xff6fa8, 0.08, r)); list.push(xf(cap, 0, 0.22, 0, 1, 0.85, 1));
  for (let i = 0; i < 4; i++) { const a = i * 1.7, d = 0.11; const sp = prep(new THREE.IcosahedronGeometry(0.035, 0)); paintFaces(sp, () => _c1.set(0xfff6ee).clone()); list.push(xf(sp, Math.cos(a) * d, 0.3 + (i % 2) * 0.02, Math.sin(a) * d)); }
  return merge(list);
}

// wind sway material
function swayMat(uTime, amp) {
  const m = vcMat();
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime; sh.uniforms.uAmp = { value: amp };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float sp = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.45;
      #else
        float sp = 0.0;
      #endif
      float hh = max(position.y, 0.0);
      float sw = sin(uTime * 1.5 + sp) * 0.7 + sin(uTime * 2.6 + sp * 1.7) * 0.3;
      transformed.x += sw * uAmp * hh * hh * 0.5;
      transformed.z += cos(uTime * 1.2 + sp) * uAmp * hh * hh * 0.35;`);
  };
  m.customProgramCacheKey = () => 'sway';
  return m;
}
function inst(geo, mat, items, castShadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  const d = new THREE.Object3D(); const col = new THREE.Color();
  items.forEach((it, i) => {
    d.position.set(it.x, it.y || 0, it.z); d.rotation.set(0, it.ry || 0, 0); d.scale.set(it.s, it.sy || it.s, it.s); d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i, col.setRGB(it.t || 1, it.t || 1, it.t || 1));
  });
  mesh.count = items.length; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false; return mesh;
}

/* ───────────────────────── main ───────────────────────── */
export function buildWorld(scene, renderer) {
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const root = new THREE.Group(); root.name = 'environment'; scene.add(root);
  const uTime = { value: 0 };
  const rnd = rng(2024);

  const hubR = makeBlob(9.4, 11, 1);
  const meadowR = makeBlob(6.2, 23, 1.3);
  const islet1R = makeBlob(ISLETS[0].R, 31, 1.4), islet2R = makeBlob(ISLETS[1].R, 37, 1.4);
  const lockedR = makeBlob(6.0, 41, 1.3);

  /* ---- lighting & atmosphere ---- */
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 42, 108);
  const hemi = new THREE.HemisphereLight(0xe2ecff, 0xffc4de, 1.75); root.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b4, 2.7);
  const sunDir = new THREE.Vector3(16, 21, 11).normalize();
  sun.target.position.set(-3, 0, 5); sun.position.copy(sun.target.position).addScaledVector(sunDir, 45);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 5, far: 100 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3.5;
  root.add(sun, sun.target);

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir.clone() }, uHor: { value: new THREE.Color(HORIZON) }, uHor2: { value: new THREE.Color(HORIZON2) }, uMid: { value: new THREE.Color(0x8fd3f4) }, uTop: { value: new THREE.Color(0x9a86e0) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w*0.9999; }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun,uHor,uHor2,uMid,uTop;
    void main(){ vec3 d=normalize(vD); float h=max(d.y,0.0);
      vec3 c=mix(uHor,uHor2,smoothstep(0.0,0.12,h));
      c=mix(c,uMid,smoothstep(0.03,0.30,h));
      c=mix(c,uTop,smoothstep(0.25,0.8,h));
      float s=max(dot(d,normalize(uSun)),0.0);
      c+=vec3(1.0,0.78,0.55)*pow(s,6.0)*0.35+vec3(1.0,0.9,0.7)*pow(s,80.0)*0.8;
      c+=vec3(1.0,0.95,0.85)*smoothstep(0.9985,0.9995,s)*2.0;
      gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 14), skyMat); sky.renderOrder = -1000; sky.frustumCulled = false; root.add(sky);

  // clouds
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: 0xffe9f2, emissiveIntensity: 0.3, fog: false });
  for (let i = 0; i < 18; i++) {
    const r = rng(500 + i), list = []; const n = 4 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const rad = 3 + r() * 3.2; const g = prep(new THREE.IcosahedronGeometry(rad, 1)); jitter(g, rad * 0.1, k + i);
      paintFaces(g, (x, y) => mixc(0xf2e2f4, 0xffffff, clamp((y + rad) / (rad * 2), 0, 1)));
      list.push(xf(g, (k - n / 2) * 4.2 + (r() - 0.5) * 2, (r() - 0.3) * 1.5, (r() - 0.5) * 3, 1, 0.55, 0.9));
    }
    const m = new THREE.Mesh(merge(list), cloudMat); const low = i >= 12, ang = (i / 12) * 6.28 + r(), rr = low ? 105 + r() * 25 : 70 + r() * 55;
    m.position.set(Math.cos(ang) * rr, low ? 9 + r() * 7 : 26 + r() * 20, Math.sin(ang) * rr); m.rotation.y = r() * 3; m.scale.setScalar(1 + r() * 0.8); m.userData.speed = 0.5 + r() * 0.7;
    m.frustumCulled = false; root.add(m); clouds.push(m);
  }

  /* ---- water ---- */
  const islUniform = [new THREE.Vector3(HUB.x, HUB.z, 8.8), new THREE.Vector3(MEADOW.x, MEADOW.z, 5.7), new THREE.Vector3(LOCKED.x, LOCKED.z, 5.6),
    new THREE.Vector3(ISLETS[0].x, ISLETS[0].z, ISLETS[0].R * 0.9), new THREE.Vector3(ISLETS[1].x, ISLETS[1].z, ISLETS[1].R * 0.9)];
  const wg = (() => {
    const inner = new THREE.PlaneGeometry(120, 120, 60, 60); inner.rotateX(-Math.PI / 2);
    const outer = new THREE.PlaneGeometry(720, 720, 36, 36); outer.rotateX(-Math.PI / 2);
    const oi = outer.index.array, keep = [];
    for (let c = 0; c < oi.length; c += 6) { const cell = c / 6, ci = cell % 36, cj = Math.floor(cell / 36); if (ci >= 15 && ci <= 20 && cj >= 15 && cj <= 20) continue; for (let k = 0; k < 6; k++) keep.push(oi[c + k]); }
    outer.setIndex(keep);
    [inner, outer].forEach(g => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); });
    const g = mergeGeometries([inner, outer], false); g.translate(WCEN.x, 0, WCEN.z); return g;
  })();
  const islGLSL = `uniform vec3 uIsl[5];
    float islD(vec2 p){ float d=1e5; for(int i=0;i<5;i++){ d=min(d,length(p-uIsl[i].xy)-uIsl[i].z);} return d; }`;
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: uTime, uIsl: { value: islUniform }, uSun: { value: sunDir.clone() },
      uC1: { value: new THREE.Color(0x7ff0dc) }, uC2: { value: new THREE.Color(0x35c6d8) }, uC3: { value: new THREE.Color(0x2b8fd0) }, uSky: { value: new THREE.Color(0xd8f0ff) },
    }]),
    vertexShader: `uniform float uTime; varying vec3 vW; ${islGLSL}
      #include <fog_pars_vertex>
      void main(){ vec4 w=modelMatrix*vec4(position,1.0);
        float d=islD(w.xz); float damp=smoothstep(1.2,7.0,d)*(1.0-smoothstep(28.0,50.0,length(w.xz-vec2(-3.0,8.0))));
        float h=sin(w.x*0.33+uTime*0.9)*0.5+sin(w.z*0.41-uTime*0.7)*0.42+sin((w.x+w.z)*0.62+uTime*1.35)*0.22+sin((w.x-w.z)*0.9-uTime*1.1)*0.12;
        w.y+=h*0.13*damp; vW=w.xyz;
        vec4 mvPosition=viewMatrix*w; gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 uSun,uC1,uC2,uC3,uSky; varying vec3 vW; ${islGLSL}
      #include <fog_pars_fragment>
      float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.0) n=-n;
        float d=islD(vW.xz); vec3 V=normalize(cameraPosition-vW);
        vec3 col=mix(uC1,uC2,smoothstep(0.0,5.0,d)); col=mix(col,uC3,smoothstep(6.0,40.0,d));
        col*=0.80+0.30*dot(n,normalize(uSun));
        col*=1.0-0.16*(1.0-smoothstep(0.0,3.0,d));
        float fres=pow(1.0-max(dot(n,V),0.0),3.0); col=mix(col,uSky,fres*0.38);
        vec3 H=normalize(normalize(uSun)+V); float sp=pow(max(dot(n,H),0.0),70.0); col+=vec3(1.0,0.92,0.8)*sp*0.8;
        vec2 g=floor(vW.xz*3.2); float hh=h21(g+floor(uTime*1.3)); vec2 fc=fract(vW.xz*3.2)-0.5; float spk=step(0.996,hh)*(0.5+0.5*sin(uTime*7.0+hh*60.0))*smoothstep(0.5,0.1,abs(fc.x)+abs(fc.y)); col+=vec3(1.0,0.97,0.9)*spk*0.9;
        float alpha=mix(0.58,0.97,smoothstep(0.5,8.0,d));
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3aa9c9, fog: true }));
  seabed.position.set(WCEN.x, WATER_Y - 6.5, WCEN.z); seabed.renderOrder = -1; root.add(seabed);
  const water = new THREE.Mesh(wg, waterMat); water.position.y = WATER_Y; water.renderOrder = 1; water.frustumCulled = false; root.add(water);

  /* ---- islands (merged terrain) ---- */
  const hubPal = [0x9ee78e, 0x86dc72, 0xb9ee94], mdPal = [0xa4e59c, 0x8ede78, 0xc2f29a];
  const terr = [];
  terr.push(...buildIsland({ cx: HUB.x, cz: HUB.z, Rfn: hubR, seg: 48, rings: 5, pal: hubPal, seed: 101, chunks: 18, hangs: 7, roots: 9 }));
  terr.push(...buildIsland({ cx: MEADOW.x, cz: MEADOW.z, Rfn: meadowR, seg: 36, rings: 5, pal: mdPal, seed: 202, sy: 0.85, chunks: 10, hangs: 4, roots: 5 }));
  terr.push(...buildIsland({ cx: ISLETS[0].x, cz: ISLETS[0].z, Rfn: islet1R, seg: 16, rings: 2, pal: mdPal, seed: 303, sy: 0.55, chunks: 3, hangs: 2 }));
  terr.push(...buildIsland({ cx: ISLETS[1].x, cz: ISLETS[1].z, Rfn: islet2R, seg: 18, rings: 2, pal: hubPal, seed: 404, sy: 0.6, chunks: 3, hangs: 2 }));
  const terrain = new THREE.Mesh(merge(terr), vcMat()); terrain.castShadow = true; terrain.receiveShadow = true; root.add(terrain);

  // locked mist island (separate, tinted + translucent)
  const lockedGeo = merge(buildIsland({ cx: 0, cz: 0, Rfn: lockedR, seg: 28, rings: 3, pal: [0xdcd2f2, 0xd0c4ee, 0xe6dcf6], seed: 505, chunks: 6, hangs: 3, lockedTint: 0xcdbfe8 }));
  { // a couple of silhouette trees
    const tr = []; const rr = rng(66);
    for (let i = 0; i < 7; i++) { const sc = 0.8 + rr() * 0.6; const g = prep(new THREE.ConeGeometry(1.0, 2.6, 6)); paintFaces(g, (x, y) => mixc(0xaa9ad6, 0xc9bdea, (y + 1.3) / 2.6)); tr.push(xf(g, (rr() - 0.5) * 6, 1.3 * sc, (rr() - 0.5) * 6, sc)); }
    const extra = merge(tr); const cm = mergeGeometries([lockedGeo, extra], false);
    const lockedMat = vcMat({ emissive: 0xd8c8f0, emissiveIntensity: 0.28, transparent: true, opacity: 0.88 });
    const locked = new THREE.Mesh(cm, lockedMat); locked.position.set(LOCKED.x, 0, LOCKED.z); root.add(locked);
  }
  const mistGroup = new THREE.Group(); mistGroup.position.set(LOCKED.x, 0, LOCKED.z); root.add(mistGroup);
  {
    const list = []; const r = rng(88);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.28 + r() * 0.3, d = 3.6 + r() * 3.0, s = 1.6 + r() * 1.6; const g = prep(new THREE.IcosahedronGeometry(1, 1)); jitter(g, 0.08, i);
      paintFaces(g, (x, y) => mixc(0xf4e8fb, 0xffffff, (y + 1) / 2));
      list.push(xf(g, Math.cos(a) * d, -0.3 + r() * 1.3, Math.sin(a) * d, s * 1.3, s * 0.55, s * 1.1, 0, r() * 3, 0));
    }
    for (let i = 0; i < 3; i++) { const a = r() * 6.28, d = 1.5 + r() * 1.4; const g = prep(new THREE.IcosahedronGeometry(1, 1)); jitter(g, 0.08, i + 50); paintFaces(g, () => _c1.set(0xfaf2ff).clone()); list.push(xf(g, Math.cos(a) * d, -1.0 + r() * 0.5, Math.sin(a) * d, 2.0, 0.7, 1.8, 0, r() * 3, 0)); }
    for (let i = 0; i < 7; i++) { const a = i * 0.9; const g = prep(new THREE.IcosahedronGeometry(1, 1)); paintFaces(g, () => _c1.set(0xffffff).clone()); list.push(xf(g, Math.cos(a) * 7.2, -1.9, Math.sin(a) * 7.2, 3.2, 1.2, 2.8, 0, a, 0)); }
    const mistMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: 0xffeaf6, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, depthWrite: false });
    const mist = new THREE.Mesh(merge(list), mistMat); mist.renderOrder = 3; mistGroup.add(mist);
  }

  /* ---- foam rings ---- */
  const foams = [];
  function foamRing(cx, cz, Rfn, sy, phase) {
    const kw = cliffK(WATER_Y, sy), seg = 56; const pos = [], colr = [], idx = [];
    const mk = (r0, r1, a0, a1, dash) => {
      const base = pos.length / 3;
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2, Rw = Rfn(a) * kw; const n = vnoise(a * 4, phase, 5);
        const dm = dash ? (0.25 + 0.75 * smoothstep(0.35, 0.65, vnoise(a * 5 + phase, 3.3, 9))) : 1;
        pos.push(Math.cos(a) * Rw * r0, 0, Math.sin(a) * Rw * r0); colr.push(1, 1, 1, a0 * dm);
        pos.push(Math.cos(a) * Rw * r1, 0, Math.sin(a) * Rw * r1); colr.push(1, 1, 1, a1 * dm);
      }
      for (let j = 0; j < seg; j++) { const k = base + j * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    };
    function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
    mk(0.97, 1.0, 0.0, 0.95); mk(1.0, 1.3, 0.95, 0.0);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(cx, WATER_Y + 0.07, cz); m.renderOrder = 2; m.userData.phase = phase; root.add(m); foams.push(m);
    // outer dashed pulse ring
    const pos2 = [], col2 = [], idx2 = []; const b = 0;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, Rw = Rfn(a) * kw; const dm = smoothstep(0.38, 0.62, vnoise(a * 6 + phase * 3, 7.7, 3));
      pos2.push(Math.cos(a) * Rw * 1.14, 0, Math.sin(a) * Rw * 1.14); col2.push(1, 1, 1, 0.0);
      pos2.push(Math.cos(a) * Rw * 1.26, 0, Math.sin(a) * Rw * 1.26); col2.push(1, 1, 1, 0.75 * dm);
      pos2.push(Math.cos(a) * Rw * 1.38, 0, Math.sin(a) * Rw * 1.38); col2.push(1, 1, 1, 0.0);
    }
    for (let j = 0; j < seg; j++) { const k = j * 3; idx2.push(k, k + 1, k + 3, k + 1, k + 4, k + 3, k + 1, k + 2, k + 4, k + 2, k + 5, k + 4); }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(col2, 4)); g2.setIndex(idx2);
    const m2 = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    m2.position.set(cx, WATER_Y + 0.07, cz); m2.renderOrder = 2; m2.userData.phase = phase; m2.userData.outer = true; root.add(m2); foams.push(m2);
  }
  foamRing(HUB.x, HUB.z, hubR, 1, 0.3); foamRing(MEADOW.x, MEADOW.z, meadowR, 0.85, 1.9);
  foamRing(ISLETS[0].x, ISLETS[0].z, islet1R, 0.55, 3.1); foamRing(ISLETS[1].x, ISLETS[1].z, islet2R, 0.6, 4.4);
  foamRing(LOCKED.x, LOCKED.z, lockedR, 1, 5.2);

  /* ---- plaza ---- */
  {
    const tex = makePlazaTexture(renderer);
    const geo = new THREE.CylinderGeometry(PLAZA_R, PLAZA_R + 0.08, 0.3, 96, 1);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xf0d2bc, roughness: 0.9, flatShading: true });
    const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0 });
    const plaza = new THREE.Mesh(geo, [sideMat, topMat, sideMat]); plaza.position.y = 0.04 - 0.15; plaza.receiveShadow = true; plaza.castShadow = false; root.add(plaza);
    // gold trim ring at the plaza rim
    const rim = new THREE.Mesh(new THREE.TorusGeometry(PLAZA_R + 0.02, 0.045, 5, 96), new THREE.MeshStandardMaterial({ color: 0xffd84d, emissive: 0xffa820, emissiveIntensity: 0.35, roughness: 0.5, flatShading: true }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.045; root.add(rim);
  }

  /* ---- boardwalk ---- */
  const P0 = new THREE.Vector2(-4.6, 5.5), P2 = new THREE.Vector2(-9.2, 10.6), P1 = new THREE.Vector2(-7.55, 7.3);
  const bez = t => new THREE.Vector2(
    (1 - t) * (1 - t) * P0.x + 2 * (1 - t) * t * P1.x + t * t * P2.x, (1 - t) * (1 - t) * P0.y + 2 * (1 - t) * t * P1.y + t * t * P2.y);
  const bwPts = []; for (let i = 0; i <= 60; i++) bwPts.push(bez(i / 60));
  const BW_HALF = 1.1;
  {
    const wood = [], lights = []; const r = rng(321);
    // arclength samples starting where outside plaza-ish
    const samples = []; { let acc = 0, prev = bwPts[0], next = 0; const total = (() => { let L = 0; for (let i = 1; i < bwPts.length; i++) L += bwPts[i].distanceTo(bwPts[i - 1]); return L; })();
      const N = Math.floor(total / 0.36);
      for (let i = 0; i <= N; i++) { const t = i / N; const p = bez(t), q = bez(Math.min(1, t + 0.01)), o = bez(Math.max(0, t - 0.01)); const tg = q.clone().sub(o).normalize();
        if (p.length() > 7.7) samples.push({ p, tg, t }); } }
    const plankC = [0xffb6d2, 0xfff1e0, 0xffc4da, 0xffeedd];
    samples.forEach((s, i) => {
      const yaw = Math.atan2(-s.tg.y, s.tg.x); // box long axis along local x
      const g = prep(new THREE.BoxGeometry(0.31, 0.09, 2.15)); paintFaces(g, () => jc(plankC[i % 4], 0.05, r));
      wood.push(xf(g, s.p.x, 0.045, s.p.y, 1, 1, 1, 0, Math.atan2(s.tg.x, s.tg.y) + Math.PI / 2 - Math.PI / 2 + 0, 0));
    });
    // fix rotation: box local z is plank width; we want width perpendicular to tangent -> local x along tangent
    wood.length = 0;
    samples.forEach((s, i) => {
      const g = prep(new THREE.BoxGeometry(0.32, 0.1, 2.15)); paintFaces(g, (x, y, z) => jc(plankC[i % 4], 0.05, r));
      const rotY = Math.atan2(-s.tg.y, s.tg.x); // rotate local +x onto tangent (x,z)
      wood.push(xf(g, s.p.x, 0.04, s.p.y, 1, 1, 1, 0, rotY, 0));
    });
    const side = [-1, 1];
    // stringers + posts + rails + lights
    for (const sd of side) {
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i], b = samples[i + 1];
        const nA = new THREE.Vector2(-a.tg.y, a.tg.x).multiplyScalar(sd * (BW_HALF - 0.02)), nB = new THREE.Vector2(-b.tg.y, b.tg.x).multiplyScalar(sd * (BW_HALF - 0.02));
        const pa = a.p.clone().add(nA), pb = b.p.clone().add(nB), len = pa.distanceTo(pb) + 0.02, mid = pa.clone().add(pb).multiplyScalar(0.5);
        const rotY = Math.atan2(-(pb.y - pa.y), pb.x - pa.x);
        const beam = prep(new THREE.BoxGeometry(len, 0.15, 0.13)); paintFaces(beam, () => jc(0x9a6a48, 0.06, r)); wood.push(xf(beam, mid.x, 0.0, mid.y, 1, 1, 1, 0, rotY, 0));
        const rope = prep(new THREE.BoxGeometry(len, 0.045, 0.045)); paintFaces(rope, () => _c1.set(0xfff0dc).clone()); wood.push(xf(rope, mid.x, 0.66, mid.y, 1, 1, 1, 0, rotY, 0));
        const rope2 = prep(new THREE.BoxGeometry(len, 0.04, 0.04)); paintFaces(rope2, () => _c1.set(0xffe0ec).clone()); wood.push(xf(rope2, mid.x, 0.38, mid.y, 1, 1, 1, 0, rotY, 0));
        if (i % 2 === 0) { // bulb string with sag
          for (let k = 0; k < 2; k++) {
            const f = k / 2; const px = lerp(pa.x, pb.x, f), pz = lerp(pa.y, pb.y, f);
            const ph = ((i * 2 + k) % 5); const cc = [0xff7eb6, 0xffd84d, 0x9af0b4, 0xfff4e6, 0x8fe3f0][ph];
            const bn = new THREE.IcosahedronGeometry(0.065, 0); bn.deleteAttribute('uv');
            const cl = new Float32Array(bn.attributes.position.count * 3); _c1.set(cc); for (let q = 0; q < cl.length; q += 3) { cl[q] = _c1.r * 2.2; cl[q + 1] = _c1.g * 2.2; cl[q + 2] = _c1.b * 2.2; }
            bn.setAttribute('color', new THREE.BufferAttribute(cl, 3)); bn.deleteAttribute('normal'); lights.push(xf(bn, px, 0.6 - Math.sin(f * Math.PI) * 0.0 - 0.07, pz));
          }
        }
        if (i % 4 === 0) { // post
          const post = prep(new THREE.CylinderGeometry(0.065, 0.085, 0.82, 6)); paintFaces(post, (x, y) => mixc(0x8a5a3c, 0xb98458, (y + 0.4) / 0.8)); wood.push(xf(post, pa.x, 0.37, pa.y));
          const cap = prep(new THREE.IcosahedronGeometry(0.1, 0)); paintFaces(cap, () => _c1.set(0xffd84d).clone()); wood.push(xf(cap, pa.x, 0.82, pa.y));
        }
        if (i % 7 === 0) { // piles into the water
          const pile = prep(new THREE.CylinderGeometry(0.11, 0.13, 3.2, 6)); paintFaces(pile, () => jc(0x7a5238, 0.08, r)); wood.push(xf(pile, pa.x, -1.5, pa.y));
        }
      }
    }
    const bw = new THREE.Mesh(merge(wood), vcMat()); bw.castShadow = true; bw.receiveShadow = true; root.add(bw);
    const bulbMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    if (lights.length) { const lm = new THREE.Mesh(merge(lights.map(g => { g.deleteAttribute('normal'); return g; })), bulbMat); root.add(lm); }
  }

  /* ---- flora ---- */
  const trees = [], pines = [], bushes = [], tufts = [], rocks = [], mush = [];
  const fl = { pink: [], yellow: [], white: [] };
  const solids = []; // for spawn avoidance (meadow)
  const flowerKinds = ['pink', 'yellow', 'white'];
  const addTree = (x, z, s, list = trees) => { list.push({ x, z, s, ry: rnd() * 6.28, t: 0.92 + rnd() * 0.12 }); };
  const polar = (cx, cz, a, r) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  const bwAng = Math.atan2(5.5, -4.6);
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; return Math.abs(d); };

  // hub ring
  {
    const treeRim = (a) => Math.max(8.5, hubR(a) - 0.8);
    // tall cherry trees on the back and sides
    const n = 9; const a0 = 140 * Math.PI / 180, span = 262 * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i + 0.5) / n * span + (rnd() - 0.5) * 0.12;
      if (angDiff(a, bwAng) < 0.3) continue;
      const [x, z] = polar(0, 0, a, treeRim(a)); addTree(x, z, 1.15 + rnd() * 0.45);
    }
    // two small front-side cherries
    for (const a of [38, 124]) { const aa = a * Math.PI / 180; if (angDiff(aa, bwAng) < 0.3) continue; const [x, z] = polar(0, 0, aa, treeRim(aa)); addTree(x, z, 0.85); }
    // pines behind
    for (let i = 0; i < 6; i++) {
      const a = (205 + i * 24 + (rnd() - 0.5) * 8) * Math.PI / 180; const [x, z] = polar(0, 0, a, Math.min(treeRim(a) + 0.2, hubR(a) - 0.5)); addTree(x, z, 0.95 + rnd() * 0.55, pines);
    }
    // bushes all around (not boardwalk)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * 6.2832 + (rnd() - 0.5) * 0.2; if (angDiff(a, bwAng) < 0.26) continue;
      const rr = lerp(PLAZA_R + 0.28, hubR(a) - 0.3, 0.55 + rnd() * 0.3); const [x, z] = polar(0, 0, a, rr); addTree(x, z, 0.7 + rnd() * 0.5, bushes);
    }
    // rocks, mushrooms
    for (let i = 0; i < 8; i++) { const a = rnd() * 6.2832; if (angDiff(a, bwAng) < 0.3) continue; const [x, z] = polar(0, 0, a, lerp(PLAZA_R + 0.3, hubR(a) - 0.35, 0.5 + rnd() * 0.4)); rocks.push({ x, z, s: 0.5 + rnd() * 0.7, ry: rnd() * 6, t: 0.9 + rnd() * 0.15 }); }
    for (let i = 0; i < 10; i++) { const a = rnd() * 6.2832; if (angDiff(a, bwAng) < 0.3) continue; const [x, z] = polar(0, 0, a, lerp(PLAZA_R + 0.25, hubR(a) - 0.4, 0.3 + rnd() * 0.6)); mush.push({ x, z, s: 0.7 + rnd() * 0.8, ry: rnd() * 6, t: 0.95 + rnd() * 0.08 }); }
    // flower patches & tufts in the ring, plus small accents inside plaza border
    for (let i = 0; i < 38; i++) { const a = rnd() * 6.2832; if (angDiff(a, bwAng) < 0.25) continue; const [x, z] = polar(0, 0, a, lerp(PLAZA_R + 0.2, hubR(a) - 0.3, rnd())); fl[flowerKinds[i % 3]].push({ x, z, s: 0.8 + rnd() * 0.6, ry: rnd() * 6 }); }
    for (let i = 0; i < 10; i++) { const a = rnd() * 6.2832; if (angDiff(a, bwAng) < 0.3) continue; const [x, z] = polar(0, 0, a, 7.55 + rnd() * 0.5); fl[flowerKinds[i % 3]].push({ x, y: 0.03, z, s: 0.55, ry: rnd() * 6 }); }
    for (let i = 0; i < 110; i++) { const a = rnd() * 6.2832; if (angDiff(a, bwAng) < 0.22) continue; const [x, z] = polar(0, 0, a, lerp(PLAZA_R + 0.05, hubR(a) - 0.25, rnd())); tufts.push({ x, z, s: 0.7 + rnd() * 0.8, ry: rnd() * 6, t: 0.9 + rnd() * 0.2 }); }
    for (let i = 0; i < 26; i++) { const a = rnd() * 6.2832; const [x, z] = polar(0, 0, a, 7.9 + rnd() * 0.5); tufts.push({ x, y: 0.03, z, s: 0.6 + rnd() * 0.4, ry: rnd() * 6, t: 1 }); }
  }
  // meadow
  const spawnPoints = [];
  {
    const cx = MEADOW.x, cz = MEADOW.z; const toHub = Math.atan2(-cz, -cx);
    const nt = 5; for (let i = 0; i < nt; i++) {
      const a = toHub + 0.8 + (i / (nt - 1)) * (6.2832 - 1.6) + (rnd() - 0.5) * 0.2; const rr = meadowR(a) - 1.0 - rnd() * 0.5; const [x, z] = polar(cx, cz, a, rr);
      const pine = i % 3 === 1; addTree(x, z, pine ? 1.0 : 1.0 + rnd() * 0.35, pine ? pines : trees); solids.push([x, z, 1.3]);
    }
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.2832; if (angDiff(a, toHub) < 0.35) continue; const [x, z] = polar(cx, cz, a, 3.2 + rnd() * (meadowR(a) - 3.9)); addTree(x, z, 0.65 + rnd() * 0.55, bushes); solids.push([x, z, 0.8]); }
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.2832; if (angDiff(a, toHub) < 0.35) continue; const [x, z] = polar(cx, cz, a, 2.0 + rnd() * (meadowR(a) - 2.7)); rocks.push({ x, z, s: 0.5 + rnd() * 0.8, ry: rnd() * 6, t: 0.9 + rnd() * 0.15 }); solids.push([x, z, 0.5]); }
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.2832; const [x, z] = polar(cx, cz, a, 1.5 + rnd() * (meadowR(a) - 2.2)); mush.push({ x, z, s: 0.7 + rnd() * 0.8, ry: rnd() * 6, t: 0.95 + rnd() * 0.08 }); }
    for (let i = 0; i < 55; i++) { const a = rnd() * 6.2832; if (angDiff(a, toHub) < 0.25 && i % 2) continue; const [x, z] = polar(cx, cz, a, 0.8 + rnd() * (meadowR(a) - 1.4)); fl[flowerKinds[i % 3]].push({ x, z, s: 0.8 + rnd() * 0.7, ry: rnd() * 6 }); }
    for (let i = 0; i < 120; i++) { const a = rnd() * 6.2832; const [x, z] = polar(cx, cz, a, rnd() * (meadowR(a) - 0.5)); tufts.push({ x, z, s: 0.7 + rnd() * 0.9, ry: rnd() * 6, t: 0.9 + rnd() * 0.2 }); }
    // spawn points (free of solids, spaced)
    let tries = 0;
    while (spawnPoints.length < 16 && tries++ < 2000) {
      const a = rnd() * 6.2832, rr = 0.9 + rnd() * (meadowR(a) - 2.2); const [x, z] = polar(cx, cz, a, rr);
      if (solids.some(s => Math.hypot(s[0] - x, s[1] - z) < s[2] + 0.4)) continue;
      if (spawnPoints.some(p => Math.hypot(p.x - x, p.z - z) < 1.7)) continue;
      if (Math.hypot(x - (cx + Math.cos(toHub) * 6), z - (cz + Math.sin(toHub) * 6)) < 2.0) continue;
      spawnPoints.push({ x, z });
    }
  }
  // islets
  addTree(ISLETS[0].x + 0.1, ISLETS[0].z, 0.85); for (let i = 0; i < 6; i++) tufts.push({ x: ISLETS[0].x + (rnd() - 0.5) * 2.2, z: ISLETS[0].z + (rnd() - 0.5) * 2.2, s: 0.8, ry: rnd() * 6, t: 1 });
  addTree(ISLETS[1].x - 0.2, ISLETS[1].z + 0.1, 0.8, pines); rocks.push({ x: ISLETS[1].x + 1.1, z: ISLETS[1].z - 0.6, s: 0.6, ry: 1, t: 1 }); fl.pink.push({ x: ISLETS[1].x + 0.6, z: ISLETS[1].z + 1.0, s: 1, ry: 0 });
  // locked-island side: nothing (hidden by mist)

  const treeMat = swayMat(uTime, 0.018), lowMat = swayMat(uTime, 0.5);
  root.add(inst(cherryGeo(), treeMat, trees));
  root.add(inst(pineGeo(), swayMat(uTime, 0.01), pines));
  root.add(inst(bushGeo(), swayMat(uTime, 0.05), bushes));
  root.add(inst(tuftGeo(), lowMat, tufts, false));
  root.add(inst(rockGeo(), vcMat(), rocks));
  root.add(inst(mushroomGeo(), vcMat(), mush));
  root.add(inst(flowerGeo(0xff7eb6, 1), lowMat, fl.pink, false));
  root.add(inst(flowerGeo(0xffd84d, 2), lowMat, fl.yellow, false));
  root.add(inst(flowerGeo(0xfff8f0, 3), lowMat, fl.white, false));

  /* ---- particles ---- */
  const pxU = { value: 800 };
  { // petals
    const N = 190, base = new Float32Array(N * 3), ph = new Float32Array(N), r = rng(909);
    for (let i = 0; i < N; i++) {
      const hubSide = i < 150; let x, z;
      if (hubSide) { const a = r() * 6.2832; const rr = 3 + r() * 6.5; x = Math.cos(a) * rr; z = Math.sin(a) * rr; } else { x = MEADOW.x + (r() - 0.5) * 10; z = MEADOW.z + (r() - 0.5) * 10; }
      base[i * 3] = x; base[i * 3 + 1] = 3.5 + r() * 3.5; base[i * 3 + 2] = z; ph[i] = r();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTime, uPx: pxU },
      vertexShader: `uniform float uTime,uPx; attribute float aPh; varying float vA; varying float vR; varying float vT;
        void main(){ vec3 p=position; float H=p.y; float spd=0.28+0.22*fract(aPh*7.3); float f=fract(aPh+uTime*spd/H); float y=H*(1.0-f);
          p.x+=sin(uTime*0.9+aPh*30.0)*0.7+(H-y)*0.28; p.z+=cos(uTime*0.7+aPh*17.0)*0.6; p.y=y+0.05;
          vA=smoothstep(0.0,0.35,y)*smoothstep(H,H-0.7,y); vR=uTime*1.7+aPh*20.0; vT=fract(aPh*3.7);
          vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(uPx*0.22/(-mv.z),1.0,40.0); }`,
      fragmentShader: `varying float vA; varying float vR; varying float vT;
        void main(){ vec2 q=gl_PointCoord-0.5; float c=cos(vR),s=sin(vR); q=vec2(c*q.x-s*q.y,s*q.x+c*q.y);
          float e=(q.x*q.x)/(0.2*0.2)+(q.y*q.y)/(0.1*0.1); if(e>1.0) discard;
          vec3 col=mix(vec3(1.0,0.5,0.72),vec3(1.0,0.78,0.88),vT*0.8+q.x*0.5); gl_FragColor=vec4(col,vA*0.95); }`,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4; root.add(pts);
  }
  { // fireflies
    const N = 90, base = new Float32Array(N * 3), ph = new Float32Array(N), mx = new Float32Array(N), r = rng(1234);
    for (let i = 0; i < N; i++) {
      const hubSide = i < 68; let x, z;
      if (hubSide) { const a = r() * 6.2832, rr = Math.sqrt(r()) * 9; x = Math.cos(a) * rr; z = Math.sin(a) * rr; } else { x = MEADOW.x + (r() - 0.5) * 9; z = MEADOW.z + (r() - 0.5) * 9; }
      base[i * 3] = x; base[i * 3 + 1] = 0.5 + r() * 2.8; base[i * 3 + 2] = z; ph[i] = r(); mx[i] = r();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aMix', new THREE.BufferAttribute(mx, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uPx: pxU },
      vertexShader: `uniform float uTime,uPx; attribute float aPh; attribute float aMix; varying float vP; varying float vM;
        void main(){ vec3 p=position; float t=uTime; p.x+=sin(t*0.5+aPh*6.28)*0.9+sin(t*0.9+aPh*13.0)*0.3; p.y+=sin(t*0.7+aPh*9.0)*0.45; p.z+=cos(t*0.45+aPh*5.0)*0.9;
          vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; float pulse=0.5+0.5*sin(t*2.2+aPh*40.0); vP=pulse; vM=aMix;
          gl_PointSize=clamp(uPx*0.16*(0.45+0.9*pulse)/(-mv.z),1.0,48.0); }`,
      fragmentShader: `varying float vP; varying float vM;
        void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); a*=a; vec3 col=mix(vec3(1.0,0.86,0.4),mix(vec3(0.6,1.0,0.78),vec3(1.0,0.6,0.85),step(0.66,vM)),step(0.45,vM));
          gl_FragColor=vec4(col*(0.7+0.5*vP),a*(0.3+0.6*vP)); }`,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5; root.add(pts);
  }

  /* ---- API ---- */
  const distToBoardwalk = (x, z) => {
    let best = 1e9;
    for (let i = 0; i < bwPts.length - 1; i++) {
      const a = bwPts[i], b = bwPts[i + 1]; const abx = b.x - a.x, abz = b.y - a.y; const t = clamp(((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz), 0, 1);
      best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.y + abz * t)));
    }
    return best;
  };
  const isWalkable = (x, z) => {
    if (Math.hypot(x, z) < hubR(Math.atan2(z, x)) - 0.35) return true;
    const mx = x - MEADOW.x, mz = z - MEADOW.z;
    if (Math.hypot(mx, mz) < meadowR(Math.atan2(mz, mx)) - 0.35) return true;
    return distToBoardwalk(x, z) <= BW_HALF;
  };

  const sz = new THREE.Vector2();
  function update(dt, t, focus) {
    uTime.value = t;
    renderer.getDrawingBufferSize(sz); pxU.value = sz.y / (2 * Math.tan(THREE.MathUtils.degToRad(22.5))) / (renderer.getPixelRatio() || 1) * (renderer.getPixelRatio() || 1);
    if (focus) sky.position.set(focus.x, 0, focus.z);
    for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 140) c.position.x = -140; }
    for (const f of foams) {
      const ph = f.userData.phase;
      if (f.userData.outer) { const k = (t * 0.32 + ph) % 1; f.scale.setScalar(1 + k * 0.1); f.material.opacity = Math.sin(k * Math.PI) * 0.9; }
      else { const s = 1 + 0.028 * Math.sin(t * 0.9 + ph); f.scale.setScalar(s); f.material.opacity = 0.72 + 0.22 * Math.sin(t * 0.9 + ph); }
    }
    mistGroup.rotation.y = t * 0.02; mistGroup.position.y = Math.sin(t * 0.4) * 0.12;
  }

  return { update, isWalkable, spawnPoints, sunLight: sun, hubRadiusAt: a => hubR(a) };
}
