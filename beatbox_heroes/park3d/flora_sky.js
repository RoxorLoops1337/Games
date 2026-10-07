// Skyline backdrop, street apron, clouds. Buildings are hand-meshed (arrays, no CPU merge cost) with painted faces, tiled window texture on the
// walls and an extra emissive mesh of lit windows, rooftop details and neon billboards. Layers fade toward the horizon haze.
import { THREE, rng, flatMat, merged } from './kit.js';
import { col, mix, xf, constUV, paintSolid } from './flora_common.js';
import { makeStreet } from './flora_trees.js';

export const HAZE = '#f0b79a';
const LAYERS = [
  { off: 19, color: '#8f7aa8', hazeCol: '#d9a0b0', haze: 0.10, hmin: 10, hmax: 38, lit: 0.30, detail: 1.0, wmin: 7, wmax: 14, mixc: 0.06 },
  { off: 36, color: '#8a78b8', hazeCol: '#c49ac4', haze: 0.38, hmin: 22, hmax: 52, lit: 0.22, detail: 0.7, wmin: 9, wmax: 17, mixc: 0.3 },
  { off: 58, color: '#b58cb4', hazeCol: '#eaa8a8', haze: 0.55, hmin: 28, hmax: 62, lit: 0.15, detail: 0.35, wmin: 11, wmax: 21, mixc: 0.5 },
  { off: 86, color: '#e0a2a2', hazeCol: '#f4bc9c', haze: 0.74, hmin: 34, hmax: 72, lit: 0.0, detail: 0.1, wmin: 12, wmax: 24, mixc: 0.7 },
];
const ACCENTS = ['#b5738a', '#8f7aa8', '#6f7fa6', '#d99a8a', '#a9564d', '#7d8fb0', '#c98f9a'];
const SUNXZ = new THREE.Vector2(-12, 10).normalize();

class Mesher {
  constructor() { this.p = []; this.c = []; this.u = []; }
  tri(a, b, c, k, uv) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (let i = 0; i < 3; i++) this.c.push(k[i * 3] === undefined ? k.r : k[i * 3], k[i * 3 + 1] === undefined ? k.g : k[i * 3 + 1], k[i * 3 + 2] === undefined ? k.b : k[i * 3 + 2]); if (uv) this.u.push(uv[0][0], uv[0][1], uv[1][0], uv[1][1], uv[2][0], uv[2][1]); else this.u.push(0.04, 0.04, 0.04, 0.04, 0.04, 0.04); }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); return g; }
}
// colour of a point on a building face: lit/shadow side tone, ground mist, layer haze. k = {base, haze}
const _c = new THREE.Color(), _h = col(HAZE), _sh = col('#4a3b78'), _wm = col('#ffd7a8');
function shade(base, nx, ny, nz, y, hz, out) {
  const lit = ny > 0.5 ? 0.92 : 0.5 + 0.5 * (nx * SUNXZ.x + nz * SUNXZ.y);
  const sh = base.clone().lerp(_sh, 0.45), li = base.clone().lerp(_wm, 0.2);
  out.copy(sh).lerp(li, lit);
  out.lerp(_h, Math.max(0, 1 - y / 16) * 0.28 * (0.4 + hz)); // ground mist
  out.lerp(_h, hz); return out;
}

export function buildSkyline(ctx, bounds, R, groundAt) {
  const M = new Mesher(), L = new Mesher(), group = new THREE.Group();
  const cx = 0, cz = 0; let nBuild = 0, nLit = 0;
  const tmp = new THREE.Color();
  const face = (m, a, b, c, d, nrm, base, hz, uvs) => { // quad a,b,c,d in CCW order seen from outside, per vertex shading
    const ca = shade(base, nrm[0], nrm[1], nrm[2], a[1], hz, new THREE.Color()), cb = shade(base, nrm[0], nrm[1], nrm[2], b[1], hz, new THREE.Color()), cc = shade(base, nrm[0], nrm[1], nrm[2], c[1], hz, new THREE.Color()), cd = shade(base, nrm[0], nrm[1], nrm[2], d[1], hz, new THREE.Color());
    m.tri(a, b, c, [ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b], uvs && [uvs[0], uvs[1], uvs[2]]); m.tri(a, c, d, [ca.r, ca.g, ca.b, cc.r, cc.g, cc.b, cd.r, cd.g, cd.b], uvs && [uvs[0], uvs[2], uvs[3]]);
  };
  const flatFace = (m, a, b, c, d, nrm, base, hz) => face(m, a, b, c, d, nrm, base, hz, null);
  // axis aligned box with tiled window uvs on the sides (cols x rows cells)
  function box(x, y, z, w, h, d, base, hz, cols, rows, sides) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y0 = y, y1 = y + h;
    const uvF = (c, r) => [[0, 0], [c, 0], [c, r], [0, r]];
    const cl = cols || 1, rw = rows || 1;
    // sides: +z, -z, +x, -x (windowed when cols given), roof
    face(M, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], base, hz, cols ? uvF(cl, rw) : null);
    face(M, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], base, hz, cols ? uvF(cl, rw) : null);
    face(M, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], base, hz, cols ? uvF(sides ? sides.dc : cl, rw) : null);
    face(M, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], base, hz, cols ? uvF(sides ? sides.dc : cl, rw) : null);
    flatFace(M, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], base, hz);
  }
  function plainBox(x, y, z, w, h, d, base, hz) { box(x, y, z, w, h, d, base, hz, 0, 0); }
  function cyl(x, y, z, r, h, n, base, hz, taper) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 6.283, a1 = ((i + 1) / n) * 6.283, am = (a0 + a1) / 2, r2 = r * (taper === undefined ? 1 : taper);
      const p = (a, rr, yy) => [x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr];
      face(M, p(a1, r, y), p(a0, r, y), p(a0, r2, y + h), p(a1, r2, y + h), [Math.cos(am), 0, Math.sin(am)], base, hz, null);
    }
    // cap
    for (let i = 0; i < n; i++) { const a0 = (i / n) * 6.283, a1 = ((i + 1) / n) * 6.283, k = shade(base, 0, 1, 0, y + h, hz, tmp.clone()); M.tri([x, y + h, z], [x + Math.cos(a1) * r * (taper === undefined ? 1 : taper), y + h, z + Math.sin(a1) * r * (taper === undefined ? 1 : taper)], [x + Math.cos(a0) * r * (taper === undefined ? 1 : taper), y + h, z + Math.sin(a0) * r * (taper === undefined ? 1 : taper)], k); }
  }
  function cone(x, y, z, r, h, n, base, hz) {
    for (let i = 0; i < n; i++) { const a0 = (i / n) * 6.283, a1 = ((i + 1) / n) * 6.283, am = (a0 + a1) / 2; const k = shade(base, Math.cos(am) * 0.7, 0.7, Math.sin(am) * 0.7, y + h * 0.5, hz, tmp.clone()); M.tri([x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x, y + h, z], k); }
  }
  function litQuad(a, b, c, d, color, uv) { // uv = [u0,v0,u1,v1] rectangle in the lit atlas
    const k = [color.r, color.g, color.b]; const k3 = k.concat(k, k);
    L.tri(a, b, c, k3, [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]]]); L.tri(a, c, d, k3, [[uv[0], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]);
  }
  const ATL = { win: [0, 0.5, 0.25, 1], curtain: [0.25, 0.5, 0.5, 1], plain: [0.5, 0.5, 0.75, 1], stripe: [0.75, 0.5, 1, 1], neon: [0, 0, 0.5, 0.5], cafe: [0.5, 0, 1, 0.5] };

  const WINCOL = ['#ffd98a', '#ffc46b', '#ffb36b', '#ffe6b0', '#ff9d6b', '#ffcf80'];
  const NEON = ['#ff3ea5', '#2ee6ff', '#ffe14d', '#a86bff', '#9dff4a'];
  let signs = 0;

  const FACADE = ['#b8566e', '#7a68b0', '#4f84b8', '#d98e50', '#9c4646', '#3f9690', '#e0a070', '#6e56a0', '#c8607a', '#5f7fc0', '#d4b050', '#8a5a9a'];
  const AWN = ['#ff6f91', '#2ec4b6', '#ffb347', '#8a63ff', '#ff5a4a', '#ffd23f'];
  function hip(x0, z0, x1, z1, y, h, base, hz) {
    const ax = (x0 + x1) / 2, az = (z0 + z1) / 2, ap = [ax, y + h, az], sl = h / Math.max(1, Math.min(x1 - x0, z1 - z0));
    const f = (a, b, nrm) => { const k = shade(base, nrm[0], nrm[1], nrm[2], y + h * 0.5, hz, new THREE.Color()); M.tri(a, b, ap, k); };
    f([x0, y, z1], [x1, y, z1], [0, 0.6, 0.8]); f([x1, y, z0], [x0, y, z0], [0, 0.6, -0.8]); f([x1, y, z1], [x1, y, z0], [0.8, 0.6, 0]); f([x0, y, z0], [x0, y, z1], [-0.8, 0.6, 0]);
  }
  function building(side, ai, depthC, wv, hv, layer, k) {
    const m0 = M.p.length, l0 = L.p.length; buildingInner(side, ai, depthC, wv, hv, layer, k);
    if (groundAt) { // stand on whatever the terrain artist built outside the park (hills, meadow, street)
      let bx, bz; const d0 = depthC + 6;
      if (side === 'N') { bx = ai; bz = -d0; } else if (side === 'S') { bx = ai; bz = d0; } else if (side === 'E') { bx = d0; bz = ai; } else { bx = -d0; bz = ai; }
      let gy = groundAt(bx, bz); if (gy === null || gy === undefined) gy = 0; gy = Math.max(-0.2, gy) - 0.05;
      if (Math.abs(gy) > 0.01) { for (let i = m0 + 1; i < M.p.length; i += 3) M.p[i] += gy; for (let i = l0 + 1; i < L.p.length; i += 3) L.p[i] += gy; }
    }
  }
  function buildingInner(side, ai, depthC, wv, hv, layer, k) {
    // side: 'N','S','E','W'; ai: coordinate along the side; depthC: distance of the FRONT face from the park centre
    _h.set(layer.hazeCol); const w = wv, d = R.range(11, 15), h = hv, base = col(R.pick(FACADE)).lerp(col(layer.color), layer.mixc).lerp(col(R() > 0.5 ? '#ffd0b0' : '#9a8cc0'), R() * 0.08);
    base.multiplyScalar(0.86);
    const hz = layer.haze, cellW = R.pick([2.2, 2.6, 3.0, 3.4]), cellH = R.pick([2.9, 3.2, 3.6]);
    let bx, bz, bw, bd;
    if (side === 'N') { bx = ai; bz = -(depthC + d / 2); bw = w; bd = d; } else if (side === 'S') { bx = ai; bz = depthC + d / 2; bw = w; bd = d; } else if (side === 'E') { bx = depthC + d / 2; bz = ai; bw = d; bd = w; } else { bx = -(depthC + d / 2); bz = ai; bw = d; bd = w; }
    const gh = h > 9 && k < 2 ? 3.6 : 0; // ground floor with shops (near layers only)
    const cols = Math.max(2, Math.round(bw / cellW)), dcols = Math.max(2, Math.round(bd / cellW)), rows = Math.max(2, Math.round((h - gh) / cellH));
    const x0 = bx - bw / 2, x1 = bx + bw / 2, z0 = bz - bd / 2, z1 = bz + bd / 2, y1 = h;
    const uvZ = [[0, 0], [cols, 0], [cols, rows], [0, rows]], uvX = [[0, 0], [dcols, 0], [dcols, rows], [0, rows]];
    const gbase = base.clone().lerp(col('#4a3b6a'), 0.3);
    if (gh) { // ground floor band, plain
      face(M, [x0, 0, z1], [x1, 0, z1], [x1, gh, z1], [x0, gh, z1], [0, 0, 1], gbase, hz, null); face(M, [x1, 0, z0], [x0, 0, z0], [x0, gh, z0], [x1, gh, z0], [0, 0, -1], gbase, hz, null);
      face(M, [x1, 0, z1], [x1, 0, z0], [x1, gh, z0], [x1, gh, z1], [1, 0, 0], gbase, hz, null); face(M, [x0, 0, z0], [x0, 0, z1], [x0, gh, z1], [x0, gh, z0], [-1, 0, 0], gbase, hz, null);
    }
    face(M, [x0, gh, z1], [x1, gh, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], base, hz, uvZ);
    face(M, [x1, gh, z0], [x0, gh, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], base, hz, uvZ);
    face(M, [x1, gh, z1], [x1, gh, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], base, hz, uvX);
    face(M, [x0, gh, z0], [x0, gh, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], base, hz, uvX);
    const roofC = base.clone().lerp(col('#6a5a88'), 0.35);
    if (k < 2) { const pc = col(R.pick(FACADE)).lerp(col(layer.color), layer.mixc * 0.6).multiplyScalar(0.8); const pw = 0.9, ox = R() > 0.5; const px0 = ox ? x0 - 0.02 : x1 - pw + 0.02; plainBox(px0 + pw / 2, gh, z1 + 0.02 - 0.0, pw, y1 - gh, 0.12, pc, hz); plainBox(px0 + pw / 2, gh, z0 - 0.02, pw, y1 - gh, 0.12, pc, hz); }
    const cream = col('#e3cdb8').lerp(_h, hz);
    // cornice + plinth line (lighter slabs that catch the sun), floor string course
    if (k < 2) plainBox(bx, y1 - 0.05, bz, bw + 0.5, 0.55, bd + 0.5, cream, hz);
    if (gh) plainBox(bx, gh - 0.2, bz, bw + 0.3, 0.4, bd + 0.3, cream, hz);
    flatFace(M, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], roofC, hz);
    nBuild++;
    if (layer.lit > 0) {
      const faces = [];
      if (bz < 0) faces.push({ n: [0, 0, 1], a: [x0, z1], b: [x1, z1], cl: cols, len: bw });
      if (bz > 0) faces.push({ n: [0, 0, -1], a: [x1, z0], b: [x0, z0], cl: cols, len: bw });
      if (bx < 0) faces.push({ n: [1, 0, 0], a: [x1, z1], b: [x1, z0], cl: dcols, len: bd });
      if (bx > 0) faces.push({ n: [-1, 0, 0], a: [x0, z0], b: [x0, z1], cl: dcols, len: bd });
      for (const f of faces) {
        const [ax, az] = f.a, [bx2, bz2] = f.b, off = 0.07, hh = y1 - gh;
        const P = (u, v) => [ax + (bx2 - ax) * u + f.n[0] * off, v, az + (bz2 - az) * u + f.n[2] * off];
        for (let c = 0; c < f.cl; c++) {
          for (let r = 0; r < rows; r++) {
            if (R() > layer.lit * (0.55 + 0.9 * (r / rows < 0.5 ? 1 : 0.7)) || nLit > 1000) continue;
            const u0 = (c + 0.22) / f.cl, u1 = (c + 0.78) / f.cl, v0 = gh + (r + 0.22) / rows * hh, v1 = gh + (r + 0.8) / rows * hh;
            const wc = col(R.pick(WINCOL)).multiplyScalar(0.8 + R() * 0.3).lerp(_h, hz * 0.45);
            litQuad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), wc, R() > 0.3 ? ATL.win : ATL.curtain); nLit++;
          }
          if (gh && k === 0 && f.len / f.cl > 1.5) { // shopfront: glass band, awning, and a warm lit window now and then
            const u0 = (c + 0.1) / f.cl, u1 = (c + 0.9) / f.cl, glass = R() < 0.6, aw = col(R.pick(AWN)).lerp(_h, hz * 0.7);
            if (glass) { const wc = col(R.pick(WINCOL)).multiplyScalar(0.9).lerp(_h, hz * 0.45); litQuad(P(u0, 0.35), P(u1, 0.35), P(u1, gh * 0.68), P(u0, gh * 0.68), wc, ATL.plain); nLit++; }
            else { const dk = col('#3a2f66').lerp(_h, hz); const A = P(u0, 0.35), B2 = P(u1, 0.35), C2 = P(u1, gh * 0.68), D2 = P(u0, gh * 0.68); const kk = [dk.r, dk.g, dk.b]; M.tri(A, B2, C2, kk.concat(kk, kk)); M.tri(A, C2, D2, kk.concat(kk, kk)); }
            // sloped awning
            const p0 = P(u0 - 0.02, gh * 0.78), p1 = P(u1 + 0.02, gh * 0.78); const q0 = [p0[0] + f.n[0] * 0.9, gh * 0.62, p0[2] + f.n[2] * 0.9], q1 = [p1[0] + f.n[0] * 0.9, gh * 0.62, p1[2] + f.n[2] * 0.9];
            const awc = shade(aw, f.n[0], 0.7, f.n[2], gh, hz, new THREE.Color()); const ak = [awc.r, awc.g, awc.b]; M.tri(p0, p1, q1, ak.concat(ak, ak)); M.tri(p0, q1, q0, ak.concat(ak, ak));
          }
        }
      }
    }
    const det = layer.detail; let top = y1 + 0.5;
    const grey = col('#b9afb8').lerp(_h, hz), rust = col('#8a6a6e').lerp(_h, hz), dark = col('#4b3f5e').lerp(_h, hz), terra = col('#b0594a').lerp(_h, hz);
    let ty = top;
    const roofK = R();
    if (roofK < 0.3 && h < 45) { hip(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, top, Math.min(bw, bd) * R.range(0.22, 0.4), terra, hz); ty = top + 1; }
    else if (roofK < 0.55 && h > 18) { const sw = bw * R.range(0.5, 0.7), sd = bd * R.range(0.5, 0.7), sh = R.range(3, 7), sx = bx + R.range(-1, 1), sz = bz + R.range(-1, 1); box(sx, top, sz, sw, sh, sd, base.clone().lerp(col('#ffd0b0'), 0.1), hz, Math.max(2, Math.round(sw / cellW)), Math.max(1, Math.round(sh / cellH))); plainBox(sx, top + sh - 0.05, sz, sw + 0.4, 0.4, sd + 0.4, cream, hz); ty = top + sh + 0.4; }
    if (h > 55 && R() < 0.5) { cone(bx, ty, bz, 0.6, 9, 4, dark, hz); ty += 0; }
    const rx = () => bx + R.range(-bw * 0.3, bw * 0.3), rz = () => bz + R.range(-bd * 0.3, bd * 0.3);
    if (roofK > 0.3 || true) {
      if (R() < 0.45 * det) { const tx = rx(), tz = rz(); for (const lx of [-0.6, 0.6]) for (const lz of [-0.6, 0.6]) plainBox(tx + lx, ty, tz + lz, 0.18, 1.3, 0.18, dark, hz); cyl(tx, ty + 1.3, tz, 1.05, 1.7, 8, rust, hz); cone(tx, ty + 3.0, tz, 1.15, 0.9, 8, dark, hz); }
      if (R() < 0.55 * det) { const tx = rx(), tz = rz(); for (let i = 0; i < 2 + (R() > 0.5 ? 1 : 0); i++) plainBox(tx + i * 1.5, ty, tz + R.range(-0.3, 0.3), R.range(1, 1.5), R.range(0.8, 1.3), R.range(0.9, 1.3), grey, hz); }
      if (R() < 0.3 * det) plainBox(rx(), ty, rz(), 2.4, 2.4, 2.4, cream, hz);
      if (R() < 0.5 * det + 0.2) {
        const tx = rx(), tz = rz(), ah = R.range(4, 9); plainBox(tx, ty, tz, 0.14, ah, 0.14, dark, hz); plainBox(tx, ty + ah * 0.7, tz, 1.6, 0.1, 0.1, dark, hz); plainBox(tx, ty + ah * 0.5, tz, 1.0, 0.1, 0.1, dark, hz);
        if (layer.lit > 0 || R() > 0.5) litQuad([tx - 0.15, ty + ah, tz + 0.2], [tx + 0.15, ty + ah, tz + 0.2], [tx + 0.15, ty + ah + 0.4, tz + 0.2], [tx - 0.15, ty + ah + 0.4, tz + 0.2], col('#ff5a4a'), ATL.plain);
      }
    }
    if (k < 2 && R() < 0.22 && signs < 9 && (side === 'N' || side === 'E' || side === 'W')) {
      signs++; const sw = R.range(7, 10), shh = sw * 0.45, nrm = side === 'N' ? [0, 0, 1] : side === 'E' ? [-1, 0, 0] : [1, 0, 0];
      const sx = side === 'N' ? bx + R.range(-bw * 0.2, bw * 0.2) : (side === 'E' ? x0 + 0.6 : x1 - 0.6), sz = side === 'N' ? z1 - 0.6 : bz + R.range(-bd * 0.2, bd * 0.2);
      const ux = side === 'N' ? 1 : 0, uz = side === 'N' ? 0 : (side === 'E' ? 1 : -1);
      for (const s of [-0.38, 0.38]) plainBox(sx + ux * sw * s, ty, sz + uz * sw * s, 0.25, 1.8, 0.25, dark, hz);
      plainBox(sx + nrm[0] * 0.05, ty + 1.8 + shh / 2 - 0.05, sz + nrm[2] * 0.05 - (side === 'N' ? 0.05 : 0), side === 'N' ? sw + 0.5 : 0.3, shh + 0.4, side === 'N' ? 0.3 : sw + 0.5, dark, hz);
      const P = (u, v) => [sx + ux * sw * (u - 0.5) + nrm[0] * 0.3, ty + 1.8 + v * shh, sz + uz * sw * (u - 0.5) + nrm[2] * 0.3];
      const neonC = col(R.pick(NEON)); const which = signs % 3 === 1 ? ATL.neon : signs % 3 === 2 ? ATL.cafe : ATL.stripe;
      litQuad(P(0, 0), P(1, 0), P(1, 1), P(0, 1), which === ATL.stripe ? neonC.multiplyScalar(0.9) : col('#fff0d8').lerp(_h, hz * 0.3), which); nLit++;
    }
  }

  const sides = [
    { s: 'N', f: (k) => -bounds.minZ + LAYERS[k].off, from: (k, f) => -(f + 38 + k * 14), to: (k, f) => f + 38 + k * 14 },
    { s: 'E', f: (k) => bounds.maxX + LAYERS[k].off, from: (k, f) => -(LAYERS[k].off + -bounds.minZ) + 2, to: (k) => 34 + k * 24 },
    { s: 'W', f: (k) => -bounds.minX + LAYERS[k].off, from: (k) => -(LAYERS[k].off + -bounds.minZ) + 2, to: (k) => 34 + k * 24 },
    { s: 'S', f: (k) => bounds.maxZ + LAYERS[k].off + 8, from: (k, f) => -(f * 0.9), to: (k, f) => f * 0.9 },
  ];
  for (let k = 0; k < LAYERS.length; k++) {
    const layer = LAYERS[k];
    for (const sd of sides) {
      if (sd.s === 'S' && k < 2) continue;
      const skipP = k === 3 ? 0.35 : 0;
      const f = sd.f(k); let a = sd.from(k, f); const end = sd.to(k, f);
      while (a < end) {
        const w = R.range(layer.wmin, layer.wmax); let h = R.range(layer.hmin, layer.hmax);
        if (sd.s === 'S') h *= 0.6;
        if (R() < 0.12) h *= 1.45; // the odd tower
        if (R() >= skipP) building(sd.s, a + w / 2, f, w, h, layer, k); a += w + R.range(0, 2.2);
      }
    }
  }

  // far hill/tree line silhouettes behind the farthest layer is skipped: layers already fade to haze.
  const bodyTex = bodyTexture(), litTex = litTexture();
  const bodyMat = new THREE.MeshBasicMaterial({ map: bodyTex, vertexColors: true, fog: false });
  const litMat = new THREE.MeshBasicMaterial({ map: litTex, vertexColors: true, fog: false, toneMapped: false });
  litMat.color.setScalar(1.15);
  const body = new THREE.Mesh(M.geo(), bodyMat); body.frustumCulled = false; body.name = 'skyline'; body.matrixAutoUpdate = false;
  const lit = new THREE.Mesh(L.geo(), litMat); lit.frustumCulled = false; lit.name = 'skyline_windows'; lit.matrixAutoUpdate = false;
  group.add(body, lit);
  return { group, body, lit, litMat, buildings: nBuild, litWindows: nLit };
}

function bodyTexture() { // one repeating floor cell: wall, dark glass pane with a sky gradient, frame, sill, floor band
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#efe6ec'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#d9cfdc'; g.fillRect(0, 56, 64, 8); // floor band
  const x0 = 13, x1 = 51, y0 = 11, y1 = 47; // v up is image-y down: pane region v .22..82 maps to y 11..50
  g.fillStyle = '#cdbfd6'; g.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4 + 3); // frame
  const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#9a88c8'); gr.addColorStop(1, '#4e4480'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = '#cdbfd6'; g.fillRect(31, y0, 2, y1 - y0); // mullion
  g.fillStyle = 'rgba(255,214,170,0.35)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 14, y0); g.lineTo(x0, y0 + 20); g.fill(); // reflection
  g.fillStyle = '#bdaec8'; g.fillRect(x0 - 3, y1 + 2, x1 - x0 + 6, 3); // sill
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function litTexture() { // 512x256 atlas: top row neon + cafe signs (cells 2 wide), bottom row window variants (flipY: v=0 bottom). Cells: win, curtain, plain, stripe
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  // bottom half of the uv space (v 0..0.5) is the lower half of the canvas? CanvasTexture flipY: v=1 is the top of the canvas.
  // top row of canvas (v .5..1): windows. bottom row of canvas (v 0..0.5): signs.
  const cell = (i, fn) => { g.save(); g.translate(i * 128, 0); fn(); g.restore(); };
  cell(0, () => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#fff0b8'); gr.addColorStop(1, '#ff9a4a'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = '#b05a2a'; g.fillRect(0, 0, 128, 7); g.fillRect(0, 121, 128, 7); g.fillRect(0, 0, 7, 128); g.fillRect(121, 0, 7, 128); g.fillRect(61, 0, 6, 128); g.fillStyle = 'rgba(255,255,230,0.45)'; g.fillRect(14, 14, 40, 40); });
  cell(1, () => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#ffe2a0'); gr.addColorStop(1, '#ff8f55'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = '#e8803e'; g.fillRect(0, 0, 40, 128); g.fillStyle = '#b8552c'; g.fillRect(0, 0, 128, 7); g.fillRect(0, 121, 128, 7); g.fillRect(0, 0, 7, 128); g.fillRect(121, 0, 7, 128); g.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 16; i < 118; i += 14) g.fillRect(52, i, 66, 6); });
  cell(2, () => { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#fff6e0'); gr.addColorStop(1, '#ffe0b0'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  cell(3, () => { g.fillStyle = '#fff0d8'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ffd6a8'; for (let i = 0; i < 128; i += 16) g.fillRect(0, i, 128, 8); });
  // signs, canvas y 128..256 -> v 0..0.5. Each is 256 wide. Neon BEAT BOX and a cafe board.
  g.save(); g.translate(0, 128); g.fillStyle = '#2b1f4a'; g.fillRect(0, 0, 256, 128); g.lineWidth = 6; g.strokeStyle = '#ff3ea5'; g.strokeRect(8, 8, 240, 112);
  g.font = 'bold 54px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff3ea5'; g.shadowBlur = 14; g.fillStyle = '#ffe3f2'; g.fillText('BEAT', 128, 46); g.shadowColor = '#2ee6ff'; g.fillStyle = '#d8fbff'; g.fillText('BOX', 128, 92); g.restore();
  g.save(); g.translate(256, 128); g.fillStyle = '#3a2a2e'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#ffd27a'; g.fillRect(0, 0, 256, 10); g.fillRect(0, 118, 256, 10); g.font = 'bold 60px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ffb040'; g.shadowBlur = 12; g.fillStyle = '#fff0c0'; g.fillText('CAFE', 128, 66); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- ground apron outside the park: sidewalk, road with dashes, far pavement, lilac ground fading into haze, street trees and parked cars ----------
export function buildStreet(ctx, bounds, R, on) {
  const parts = [], B = bounds; on = on || { N: true, S: true, E: true, W: true };
  const quad = (x0, z0, x1, z1, y, k00, k10, k11, k01) => { // horizontal quad with a colour per corner (x0z0, x1z0, x1z1, x0z1), normal up
    const g = new THREE.BufferGeometry(); const p = new Float32Array([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0]); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const C = [col(k01), col(k11), col(k10), col(k01), col(k10), col(k00)]; const ca = new Float32Array(18); C.forEach((k, i) => { ca[i * 3] = k.r; ca[i * 3 + 1] = k.g; ca[i * 3 + 2] = k.b; }); g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g.computeVertexNormals(); return g;
  };
  const ring = (i0, i1, y, c0, c1) => { // band from i0 to i1 metres outside the park bounds, colour c0 (inner edge) to c1 (outer edge)
    const xa = B.minX - i1, xb = B.minX - i0, xc = B.maxX + i0, xd = B.maxX + i1, za = B.minZ - i1, zb = B.minZ - i0, zc = B.maxZ + i0, zd = B.maxZ + i1;
    if (on.N) parts.push(quad(xa, za, xd, zb, y, c1, c1, c0, c0)); if (on.S) parts.push(quad(xa, zc, xd, zd, y, c0, c0, c1, c1));
    if (on.W) parts.push(quad(xa, zb, xb, zc, y, c1, c0, c0, c1)); if (on.E) parts.push(quad(xc, zb, xd, zc, y, c0, c1, c1, c0));
  };
  const y0 = -0.06;
  ring(0.0, 4.0, y0 + 0.03, '#d6b894', '#cfae8c'); // sidewalk
  ring(4.0, 4.5, y0 + 0.05, '#e8d2b0', '#e8d2b0'); // curb
  ring(4.5, 12.5, y0 + 0.02, '#544b6c', '#4a4262'); // asphalt
  ring(12.5, 13.0, y0 + 0.05, '#e8d2b0', '#e8d2b0');
  ring(13.0, 17.5, y0 + 0.03, '#cbab90', '#c3a08a');
  // lane dashes along the road centre line
  const dash = (x, z, w, d) => parts.push(quad(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y0 + 0.06, '#f3dfb0', '#f3dfb0', '#f3dfb0', '#f3dfb0'));
  const rc = 8.5;
  for (let x = B.minX - 12; x < B.maxX + 12; x += 3.2) { if (on.N) dash(x, B.minZ - rc, 1.6, 0.18); if (on.S) dash(x, B.maxZ + rc, 1.6, 0.18); }
  for (let z = B.minZ - 6; z < B.maxZ + 6; z += 3.2) { if (on.W) dash(B.minX - rc, z, 0.18, 1.6); if (on.E) dash(B.maxX + rc, z, 0.18, 1.6); }
  // crosswalk at the gate
  if (on.S) for (let i = -3; i <= 3; i++) dash(i * 0.9, B.maxZ + rc - 2.2, 0.5, 2.6);
  // far ground: big rings fading to the haze colour
  const far = (i0, i1, c0, c1) => ring(i0, i1, y0 - 0.0 + 0.01, c0, c1); far(17.5, 40, '#9d88aa', '#b49aaa'); far(40, 90, '#b49aaa', '#d4a8a2'); far(90, 400, '#d4a8a2', HAZE);
  // street trees on the inner sidewalk, parked cars on the road edge
  const trees = [], placed = [];
  const tv = [makeStreet(5, 1), makeStreet(6, 1.15), makeStreet(7, 0.9)];
  const put = (x, z) => { const s = 0.9 + R() * 0.35; trees.push(xf(R.pick(tv), { x, y: -0.02, z, ry: R() * 6, s })); };
  for (let x = B.minX - 3; x <= B.maxX + 3; x += 11) { if (on.N) put(x + R.range(-0.6, 0.6), B.minZ - 2.2); if (on.S && Math.abs(x) > 3.5) put(x + R.range(-0.6, 0.6), B.maxZ + 2.2); }
  for (let z = B.minZ + 4; z < B.maxZ - 2; z += 11) { if (on.W) put(B.minX - 2.2, z + R.range(-0.5, 0.5)); if (on.E) put(B.maxX + 2.2, z + R.range(-0.5, 0.5)); }
  // cars
  const carCols = ['#2ec4b6', '#e9a23b', '#d9534f', '#e8d9c0', '#6b7fd7', '#e870a0'];
  const car = (x, z, ry, c) => {
    const r = rng((x * 31 + z * 17) | 0), p = [], body = new THREE.BoxGeometry(1.9, 0.62, 4.1), cab = new THREE.BoxGeometry(1.65, 0.6, 2.1);
    const mk = (g, y, z2, c0, c1) => { const ng = g.toNonIndexed(); ng.deleteAttribute('uv'); return paintSolid(xf(ng, { y, z: z2 }), c0, c1, r, 0.2); };
    p.push(mk(body, 0.62, 0, '#3a3050', c)); p.push(mk(cab, 1.2, -0.15, '#4b4162', '#9ab6d8'));
    for (const sx of [-0.92, 0.92]) for (const sz of [-1.3, 1.3]) { const w = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 6); w.rotateZ(Math.PI / 2); const ng = w.toNonIndexed(); ng.deleteAttribute('uv'); p.push(paintSolid(xf(ng, { x: sx, y: 0.34, z: sz }), '#2b2438', '#3a3550', r)); }
    return xf(merged(p), { x, z, ry });
  };
  const carPos = [[B.minX - 5.4, -8, 0, 0, 'W'], [B.minX - 5.4, 4, 0, 3, 'W'], [B.maxX + 5.4, -14, Math.PI, 1, 'E'], [B.maxX + 5.4, 10, Math.PI, 4, 'E'], [-9, B.minZ - 5.4, Math.PI / 2, 5, 'N'], [11, B.minZ - 5.4, -Math.PI / 2, 2, 'N'], [-12, B.maxZ + 5.4, Math.PI / 2, 4, 'S'], [14, B.maxZ + 5.4, -Math.PI / 2, 0, 'S']];
  for (const cp of carPos) if (on[cp[4]]) trees.push(car(cp[0], cp[1], cp[2], carCols[cp[3]]));
  if (!parts.length && !trees.length) return { mesh: null };
  const gs = parts.concat(trees).map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; });
  const geo = merged(gs); const mesh = new THREE.Mesh(geo, flatMat()); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'street';
  return { mesh };
}

// ---------- clouds: flat-bottomed low-poly puffs painted by face normal; the whole sky mesh turns very slowly so they drift ----------
export function buildClouds(R) {
  const parts = [];
  const top = col('#ffe0c0'), side = col('#f0a8a4'), bot = col('#b98aa8'), rim = col('#fff0dc');
  const paintC = (geo) => {
    const p = geo.attributes.position, a = new Float32Array(p.count * 3), A = new THREE.Vector3(), B2 = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), t = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      A.fromBufferAttribute(p, i); B2.fromBufferAttribute(p, i + 1); C.fromBufferAttribute(p, i + 2); N.subVectors(C, B2).cross(new THREE.Vector3().subVectors(A, B2)).normalize();
      const up = N.y, sun = Math.max(0, N.dot(new THREE.Vector3(-0.5, 0.35, 0.6).normalize()));
      if (up > 0.15) t.copy(side).lerp(top, Math.min(1, up * 1.3)); else if (up < -0.35) t.copy(bot); else t.copy(side).lerp(bot, Math.max(0, -up * 1.6));
      t.lerp(rim, sun * 0.35); const f = (R() - 0.5) * 0.05;
      for (let k = 0; k < 3; k++) { a[(i + k) * 3] = t.r + f; a[(i + k) * 3 + 1] = t.g + f; a[(i + k) * 3 + 2] = t.b + f * 0.5; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
  };
  const cloud = (cx, cy, cz, len, ry) => {
    const n = 5 + Math.floor(R() * 3), bl = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5, rad = len * 0.16 * (1 - Math.abs(u) * 0.9 + R() * 0.25);
      const g = new THREE.IcosahedronGeometry(rad, 0); const ng = g.index ? g.toNonIndexed() : g; const p = ng.attributes.position;
      const seen = new Map(); for (let k = 0; k < p.count; k++) { const key = p.getX(k).toFixed(3) + p.getY(k).toFixed(3) + p.getZ(k).toFixed(3); let d = seen.get(key); if (!d) { d = [(R() - 0.5) * rad * 0.3, (R() - 0.5) * rad * 0.2, (R() - 0.5) * rad * 0.3]; seen.set(key, d); } p.setXYZ(k, p.getX(k) + d[0], Math.max(-rad * 0.12, p.getY(k) * 0.72 + d[1]), p.getZ(k) + d[2] * 1.2); }
      ng.deleteAttribute('uv'); ng.computeVertexNormals();
      bl.push(xf(ng, { x: u * len, y: rad * 0.12 + (R() * 0.25) * rad, z: (R() - 0.5) * len * 0.12 }));
    }
    const geo = merged(bl); paintC(geo); return xf(geo, { x: cx, y: cy, z: cz, ry });
  };
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + R() * 0.3, rad = 70 + R() * 50, y = 48 + R() * 34 + (i % 3) * 6;
    parts.push(cloud(Math.cos(a) * rad, y, Math.sin(a) * rad, 34 + R() * 22, -a + Math.PI / 2 + (R() - 0.5) * 0.6));
  }
  // a few closer, lower wisps for beauty shots
  for (let i = 0; i < 4; i++) { const a = 3.6 + i * 0.9 + R() * 0.3, rad = 58 + R() * 12; parts.push(cloud(Math.cos(a) * rad, 20 + R() * 6, Math.sin(a) * rad, 16 + R() * 8, -a + Math.PI / 2)); }
  const geo = merged(parts.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; }));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'clouds'; return { mesh };
}
