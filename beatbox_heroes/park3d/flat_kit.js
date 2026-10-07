// Flat3D shared kit (Interior Artist): palette, the geometry stores ("S"), decal and glow helpers, wall-face grids, plants and a few reusable props.
// Everything is written into a handful of Buf stores that flat.js turns into merged meshes (few draw calls).
import { THREE, rng } from './kit.js';
import { Buf, makeCollider, col, mix, mul, aoTint, vnoise, fbm } from './terrain_util.js';
export { Buf, col, mix, mul, aoTint, vnoise, fbm };

// ---------------------------------------------------------------- palette (hue shifted, no pure black or white)
const C = (h) => col(h);
export const P = {
  wood: [C('#b8794a'), C('#a46a3d'), C('#c78c55'), C('#9a6239')], woodD: C('#7a4a32'), woodL: C('#d9a46e'), pine: C('#e0b985'), ply: C('#d8b27c'),
  cream: C('#efe1c4'), creamD: C('#cdb99a'), paper: C('#f5ead2'),
  plum: C('#7d4f88'), plumD: C('#5a386c'), plumL: C('#98669c'),
  teal: C('#2f8f93'), tealD: C('#1f6670'), tealL: C('#58b9b2'), sage: C('#9bc18c'), sageD: C('#6f9a72'), mint: C('#8fd6c0'),
  mustard: C('#dba53f'), mustardD: C('#b07d2c'), coral: C('#e8604a'), coralD: C('#b8403f'), pink: C('#ff4f8b'), pinkL: C('#ff9ab8'), violet: C('#7b5cff'), indigo: C('#5f6fb0'), indigoL: C('#8c96d4'),
  cyan: C('#35f2e0'), lime: C('#9dff4a'), yellow: C('#ffd23f'), orange: C('#ff8a3d'), ink: C('#2b2438'), inkL: C('#3f3857'), steel: C('#8d8aa8'), steelL: C('#b9b7d0'), steelD: C('#5e5a7a'),
  brick: [C('#b5573f'), C('#a64c3b'), C('#c26a4a'), C('#9a4638')], mortar: C('#d9b79e'), slab: C('#8a7f98'), slabD: C('#5d5470'),
  leaf: [C('#3f9b5a'), C('#58b667'), C('#2f7d4e'), C('#7ac96c')], leafD: C('#24593f'), terracotta: C('#c8704a'), soil: C('#4b3547'),
  denim: C('#4a62a3'), denimD: C('#34467d'), skin: C('#c68b5e'), white: C('#f1e8d8'), black: C('#2f2a3e'), glassG: C('#7fd9a8'), red: C('#d9433f'),
};
export const WARM = [3.2, 2.1, 0.9], WARMS = [2.4, 1.5, 0.6], PINKN = [3.2, 0.5, 1.6], CYANN = [0.5, 2.6, 3.0], REDN = [3.2, 0.5, 0.45], GREENN = [1.0, 2.6, 0.8], WHITEN = [2.8, 2.4, 2.0], YELN = [3.2, 2.5, 0.5];

export const FLAT = { minX: -7.5, maxX: 7.5, minZ: -5.5, maxZ: 5.5, wallH: 2.75, lowH: 0.9, thick: 0.28 };

// ---------------------------------------------------------------- the store
export function makeStore() {
  const S = { B: new Buf({ rng: rng(101) }), GLOW: new Buf({ rng: rng(102) }), SCR: new Buf({ uv: true }), DEC: new Buf({ uv: true }), SOFT: new Buf({ alpha: true }), GLASS: new Buf({ alpha: true }), hit: makeCollider(), lights: [], windows: [], rand: rng(7), atlas: null, anchors: {} };
  // soft contact shadow blob on the floor (alpha vertex colours)
  S.soft = (x, z, rx, rz, a, ry, y) => softDisc(S.SOFT, x, (y === undefined ? 0.012 : y), z, rx, rz, a === undefined ? 0.4 : a, ry || 0);
  // decal: quad centred at (x,y,z), facing +z locally; ry turns it. Uses the atlas rect by name. buf: S.DEC (lit) or S.SCR (always on)
  S.decal = (name, x, y, z, w, h, ry, rx, tint, rz, buf) => { const r = S.atlas.rect[name]; if (!r) return; const D = buf || S.DEC; D.push(x, y, z, ry || 0, 1, rx || 0, rz || 0); D.uquad([-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0], r[0], r[1], r[2], r[3], tint || [1, 1, 1]); D.pop(); };
  S.screen = (name, x, y, z, w, h, ry, rx, tint, rz) => S.decal(name, x, y, z, w, h, ry, rx, tint, rz, S.SCR);
  return S;
}

function softDisc(buf, x, y, z, rx, rz, a, ry) {
  const seg = 12, cl = col('#2e2048'), c0 = cl.concat([a]), c1 = cl.concat([a * 0.55]), c2 = cl.concat([0]), cs = Math.cos(ry), sn = Math.sin(ry);
  const p = (k, f) => { const t = (k / seg) * Math.PI * 2, lx = Math.cos(t) * rx * f, lz = Math.sin(t) * rz * f; return [x + lx * cs - lz * sn, y, z + lx * sn + lz * cs]; };
  for (let k = 0; k < seg; k++) { buf.tri([x, y, z], p(k + 1, 0.6), p(k, 0.6), c0, c1, c1); buf.quad(p(k, 0.6), p(k + 1, 0.6), p(k + 1, 1), p(k, 1), c1, c1, c2, c2); }
}

// ---------------------------------------------------------------- glow material (vertex coloured emissive, driven by lighting through userData.nightGlow)
export function glowLambert(nightGlow) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0xffffff, emissiveIntensity: nightGlow });
  m.userData.nightGlow = nightGlow;
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * emissiveIntensity;'); };
  m.customProgramCacheKey = () => 'flatglow';
  return m;
}

// ---------------------------------------------------------------- bars, leaves, pots, plants
// box between two 3D points with a w x h cross-section
export function bar(B, a, b, w, h, color, o) {
  o = o || {}; const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1e-6, cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, cz = (a[2] + b[2]) / 2;
  const yaw = Math.atan2(dx, dz), pitch = -Math.asin(dy / L);
  B.push(cx, cy, cz, yaw, 1, pitch, 0); B.box(0, -h / 2, 0, w, h, L, color, Object.assign({ base: 0 }, o)); B.pop();
}
// double-sided folded leaf. base b, direction d, length l, width w
export function leaf(B, b, d, l, w, c1, c2, droop) {
  const dl = Math.hypot(d[0], d[1], d[2]) || 1, ux = d[0] / dl, uy = d[1] / dl, uz = d[2] / dl; droop = droop || 0;
  const sx = -uz, sz = ux, sl = Math.hypot(sx, sz) || 1, px = (sx / sl) * w / 2, pz = (sz / sl) * w / 2;
  const tip = [b[0] + ux * l, b[1] + uy * l - droop, b[2] + uz * l], mid = [b[0] + ux * l * 0.45, b[1] + uy * l * 0.45 + 0.02 + w * 0.12, b[2] + uz * l * 0.45];
  const L = [mid[0] + px, mid[1] - w * 0.14, mid[2] + pz], R = [mid[0] - px, mid[1] - w * 0.14, mid[2] - pz], hi = mul(c1, 1.1);
  B.tri(b, L, mid, c2, c1, hi); B.tri(b, mid, R, c2, hi, c1); B.tri(mid, L, tip, hi, c1, c1); B.tri(mid, tip, R, hi, c1, c1);
  B.tri(b, mid, L, c2, c2, c2); B.tri(b, R, mid, c2, c2, c2); B.tri(mid, tip, L, c2, c2, c2); B.tri(mid, R, tip, c2, c2, c2);
}
export function pot(B, x, y0, z, r, h, color, soil) {
  const lo = aoTint(color, 0.5), hi = mul(color, 1.08);
  B.lathe([[r * 0.68, 0, lo], [r, h * 0.92, color], [r * 1.08, h, hi], [r * 1.02, h, mul(hi, 0.8)], [r * 0.9, h, P.soil], [0, h - 0.03, soil || P.soil]], 8, x, y0, z, {});
  return y0 + h;
}
// leafy plant. kind: 'monstera' | 'fiddle' | 'snake' | 'herb' | 'fern' | 'cactus' | 'trail'
export function plant(S, x, y0, z, kind, s, o) {
  o = o || {}; const B = S.B, R = S.rand; s = s || 1; const potc = o.pot || P.terracotta;
  const top = pot(B, x, y0, z, (o.pr || 0.22) * s, (o.ph || 0.3) * s, potc);
  if (kind === 'monstera') {
    const n = 9; for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + R() * 0.4, up = 0.5 + R() * 0.6, rr = 0.2 + R() * 0.45, l = (0.36 + R() * 0.2) * s;
      const base = [x, top, z], mid = [x + Math.cos(a) * rr * s * 0.6, top + up * s * 0.7, z + Math.sin(a) * rr * s * 0.6], tip = [x + Math.cos(a) * rr * s, top + up * s, z + Math.sin(a) * rr * s];
      bar(B, base, mid, 0.022, 0.022, P.leafD); bar(B, mid, tip, 0.018, 0.018, P.leafD);
      const c = P.leaf[(R() * 4) | 0]; leaf(B, tip, [Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8], l, l * 0.85, c, mul(c, 0.55), 0.06); }
  } else if (kind === 'fiddle') {
    bar(B, [x, top, z], [x + 0.03, top + 1.1 * s, z], 0.05, 0.05, P.woodD); for (let i = 0; i < 12; i++) { const a = i * 2.4, hy = top + (0.4 + i * 0.065) * s, c = P.leaf[(i + 1) % 4]; leaf(B, [x, hy, z], [Math.cos(a), 0.25, Math.sin(a)], 0.34 * s, 0.26 * s, c, mul(c, 0.5), 0.05); }
  } else if (kind === 'snake') {
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + R(), rr = 0.05 + R() * 0.08, h = (0.5 + R() * 0.45) * s; const c = mix(P.leaf[2], P.mustard, 0.12 + R() * 0.1); B.push(x + Math.cos(a) * rr, top, z + Math.sin(a) * rr, a, 1, (R() - 0.5) * 0.12, (R() - 0.5) * 0.12); B.box(0, 0, 0, 0.1 * s, h, 0.03, c, { taper: 0.3, base: 0.3, top: mix(c, P.mustard, 0.5) }); B.pop(); }
  } else if (kind === 'herb') {
    for (let i = 0; i < 10; i++) { const a = i * 2.2 + R(), rr = R() * 0.1, c = P.leaf[(R() * 4) | 0]; B.blob(x + Math.cos(a) * rr * s, top + (0.05 + R() * 0.08) * s, z + Math.sin(a) * rr * s, 0.075 * s, 0.05 * s, 0.075 * s, mul(c, 0.6), c, { detail: 0, jit: 0.1 }); }
  } else if (kind === 'fern') {
    for (let i = 0; i < 11; i++) { const a = (i / 11) * 6.283, c = P.leaf[(i % 2) ? 1 : 3]; leaf(B, [x, top, z], [Math.cos(a), 0.7, Math.sin(a)], 0.5 * s, 0.14 * s, c, mul(c, 0.5), 0.12 * s); }
  } else if (kind === 'cactus') {
    B.blob(x, top + 0.14 * s, z, 0.1 * s, 0.17 * s, 0.1 * s, P.leafD, P.leaf[2], { detail: 0, jit: 0.06 }); B.blob(x + 0.09 * s, top + 0.16 * s, z, 0.045 * s, 0.07 * s, 0.045 * s, P.leafD, P.leaf[2], { detail: 0, jit: 0.04 }); B.blob(x, top + 0.31 * s, z, 0.03 * s, 0.025 * s, 0.03 * s, P.pinkL, P.pink, { detail: 0, jit: 0.02 });
  } else if (kind === 'trail') {
    for (let i = 0; i < 9; i++) { const a = i * 0.7, c = P.leaf[i % 3], l = (0.35 + (i % 4) * 0.12) * s; bar(B, [x + Math.cos(a) * 0.12, top, z + Math.sin(a) * 0.12], [x + Math.cos(a) * 0.2, top - l, z + Math.sin(a) * 0.2], 0.012, 0.012, P.leafD); for (let k = 1; k < 3; k++) leaf(B, [x + Math.cos(a) * 0.2, top - l * k / 3, z + Math.sin(a) * 0.2], [Math.cos(a + 1), -0.1, Math.sin(a + 1)], 0.1, 0.1, c, mul(c, 0.5), 0.02); }
  }
  return top;
}

// ---------------------------------------------------------------- wall faces: a grid of vertex-coloured cells with holes (windows, doors)
// a,b: start/end along the floor [x,z]; nrm: the visible side normal [nx,nz]; h: height. colorFn(u,v,uc,vc) -> colour at a grid corner (uc,vc = cell centre).
// o: {y0, stepU, uBreaks, vBreaks, holes:[{u0,u1,v0,v1}]}; u is measured from a toward b.
export function wallFace(B, a, b, nrm, h, colorFn, o) {
  o = o || {}; const ax = a[0], az = a[1]; let dx = b[0] - ax, dz = b[1] - az; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
  const flip = -dz * nrm[0] + dx * nrm[1] < 0, y0 = o.y0 || 0, holes = o.holes || [], su = o.stepU || 0.5;
  const us = new Set([0, +L.toFixed(4)]); for (let u = su; u < L - 1e-3; u += su) us.add(+u.toFixed(4)); (o.uBreaks || []).forEach((u) => { if (u > 0 && u < L) us.add(+u.toFixed(4)); }); holes.forEach((hh) => { us.add(+hh.u0.toFixed(4)); us.add(+hh.u1.toFixed(4)); });
  const vs = new Set([0, +h.toFixed(4)]); (o.vBreaks || []).forEach((v) => { if (v > 0 && v < h) vs.add(+v.toFixed(4)); }); holes.forEach((hh) => { vs.add(+hh.v0.toFixed(4)); vs.add(+hh.v1.toFixed(4)); });
  const U = [...us].sort((p, q) => p - q), V = [...vs].sort((p, q) => p - q);
  const P3 = (u, v) => [ax + dx * u, y0 + v, az + dz * u];
  for (let i = 0; i < U.length - 1; i++) for (let j = 0; j < V.length - 1; j++) {
    const uc = (U[i] + U[i + 1]) / 2, vc = (V[j] + V[j + 1]) / 2; if (holes.some((hh) => uc > hh.u0 && uc < hh.u1 && vc > hh.v0 && vc < hh.v1)) continue;
    const c00 = colorFn(U[i], V[j], uc, vc), c10 = colorFn(U[i + 1], V[j], uc, vc), c11 = colorFn(U[i + 1], V[j + 1], uc, vc), c01 = colorFn(U[i], V[j + 1], uc, vc);
    const p00 = P3(U[i], V[j]), p10 = P3(U[i + 1], V[j]), p11 = P3(U[i + 1], V[j + 1]), p01 = P3(U[i], V[j + 1]);
    if (!flip) B.quad(p00, p10, p11, p01, c00, c10, c11, c01); else B.quad(p00, p01, p11, p10, c00, c01, c11, c10);
  }
}
// flat per-cell variant (bricks, tiles): cellFn(uc, vc, rowIndex, u0) -> one colour or null. rows: [[v0,v1],...], cell: width, offset: stagger odd rows, gap: mortar gap
export function wallCells(B, a, b, nrm, cellFn, o) {
  const ax = a[0], az = a[1]; let dx = b[0] - ax, dz = b[1] - az; const L = Math.hypot(dx, dz); dx /= L; dz /= L; const flip = -dz * nrm[0] + dx * nrm[1] < 0, y0 = o.y0 || 0;
  const P3 = (u, v) => [ax + dx * u, y0 + v, az + dz * u];
  o.rows.forEach((rw, j) => { const off = o.offset && j % 2 ? o.cell / 2 : 0; for (let u = -off; u < L; u += o.cell) { const u0 = Math.max(0, u), u1 = Math.min(L, u + o.cell - (o.gap || 0)); if (u1 - u0 < 0.02) continue; const c = cellFn((u0 + u1) / 2, (rw[0] + rw[1]) / 2, j, u0); if (!c) continue; const p00 = P3(u0, rw[0]), p10 = P3(u1, rw[0]), p11 = P3(u1, rw[1]), p01 = P3(u0, rw[1]); if (!flip) B.quad(p00, p10, p11, p01, c); else B.quad(p00, p01, p11, p10, c); } });
}
