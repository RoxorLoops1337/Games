// HOOD map diorama geometry (W-STREET). A tabletop miniature of Neon Row, the park and Tay's flat, built at 1 m = 0.16 table units (buildings exaggerated 1.35x tall).
// Table top is y = 0, the row front plane is z = ZF, the street runs along x. Everything static goes into the shared street stores (street_kit.js makeStore):
// B (solid), GLOW (night emissive), SIGN/DEC (atlas decals), FX (additive halos). Filler city blocks are INSTANCED (buildLod) with baked window grids.
import { THREE } from './kit.js';
import { PAL, NEON, WINCOL, mix, mul, col, Buf } from './street_kit.js';
import { rng } from './kit.js';

export const K = 0.16, ZF = 1.0, DP = 1.44;
export const HOOD_PIN = { park: { x: -29 * K, z: 1.55 }, home: { x: -15 * K, z: 1.55 }, shop: { x: 0, z: 1.55 }, studio: { x: 13 * K, z: 1.55 }, bar: { x: 27 * K, z: 1.55 } };
const cr = (c, k) => mul(col(c), k === undefined ? 1 : k);
const TABLE = { x: 7.6, z: 6.9 };

function mw(S, cx, cy, w, h, lit, z) { z = z === undefined ? ZF : z; S.wall(S.B, cx, cy, z + 0.004, w + 0.035, h + 0.035, mix(PAL.cream, PAL.creamD, 0.4)); if (lit) S.wall(S.GLOW, cx, cy, z + 0.009, w, h, lit, mul(lit, 0.85)); else S.wall(S.B, cx, cy, z + 0.009, w, h, PAL.glassD, PAL.glassL); }
function grid(S, xs, ys, w, h, p) { for (const y of ys) for (const x of xs) mw(S, x, y, w, h, S.R() < p ? WINCOL[(S.R() * WINCOL.length) | 0] : null); }
function body(S, x0, x1, top, base, o) {
  o = o || {}; const w = x1 - x0, cx = (x0 + x1) / 2, B = S.B, trim = o.trim || mix(PAL.cream, base, 0.3);
  B.box(cx, 0, ZF - DP / 2, w, top, DP, base, { base: 0.35, tint: 0.03, top: o.roof || mix(base, PAL.ink, 0.5) }); B.box(cx, top - 0.06, ZF + 0.025, w + 0.07, 0.07, 0.12, trim, { base: 0.05 }); B.box(cx, 0, ZF + 0.012, w + 0.02, 0.1, 0.03, o.plinth || PAL.stoneD, { base: 0 });
  for (const y of o.courses || []) B.box(cx, y, ZF + 0.012, w + 0.02, 0.035, 0.03, trim, { base: 0 });
}
function awning(S, cx, w, y0, c1, c2, n) { const sw = w / n; for (let i = 0; i < n; i++) { const x0 = cx - w / 2 + i * sw, x1 = x0 + sw, c = i % 2 ? c2 : c1; S.B.quad([x0, y0 + 0.14, ZF], [x1, y0 + 0.14, ZF], [x1, y0, ZF + 0.34], [x0, y0, ZF + 0.34], mul(c, 0.8), mul(c, 0.8), c, c); S.B.tri([x0, y0, ZF + 0.34], [x1, y0, ZF + 0.34], [(x0 + x1) / 2, y0 - 0.05, ZF + 0.35], mul(c, 0.9)); } }
function tank(S, x, z, top) { const B = S.B; for (const [dx, dz] of [[-0.12, -0.12], [0.12, 0.12], [-0.12, 0.12], [0.12, -0.12]]) B.box(x + dx, top, z + dz, 0.03, 0.2, 0.03, PAL.woodD, { base: 0 }); B.cyl(x, top + 0.2, z, 0.17, 0.17, 0.3, 8, mix(PAL.wood, PAL.woodD, 0.3), { base: 0.2 }); B.cyl(x, top + 0.5, z, 0.19, 0, 0.12, 8, PAL.woodD); }

export function buildTable(S) {
  const B = S.B, X = TABLE.x, Z = TABLE.z;
  B.box(0, -1.5, 0, X * 2 + 0.9, 1.5, Z * 2 + 0.9, cr('#2a2142'), { base: 0.4, tint: 0.02, top: cr('#cbb9a0') }); // plinth with a pale rim on top
  S.floor(B, -X, X, -Z, Z, 0.001, cr('#3b3158')); // table surface
  for (const [cx, cz, w, d] of [[0, -Z - 0.15, X * 2 + 0.9, 0.3], [0, Z + 0.15, X * 2 + 0.9, 0.3], [-X - 0.15, 0, 0.3, Z * 2], [X + 0.15, 0, 0.3, Z * 2]]) B.box(cx, 0, cz, w, 0.09, d, cr('#e4d3b8'), { base: 0.1 }); // frame
  // street: sidewalk, kerb, road with dashes, far pavement
  B.box(0, 0, (ZF + 2.05) / 2, X * 2, 0.04, 2.05 - ZF, cr('#cbb09e'), { base: 0, top: cr('#cbb09e'), tint: 0 });
  for (let x = -X; x < X; x += 0.24) for (let z = ZF; z < 2.05; z += 0.21) S.floor(B, x + 0.01, x + 0.23, z + 0.01, z + 0.2, 0.0415, PAL.paving[(((x * 9 + z * 5) | 0) & 3) % 3]);
  S.floor(B, -X, X, 2.05, 3.9, 0.002, PAL.asphalt); for (let x = -X + 0.3; x < X; x += 0.9) S.floor(B, x, x + 0.45, 2.96, 3.0, 0.004, cr('#e8d2a0')); for (let i = 0; i < 6; i++) S.floor(B, -2.3 + i * 0.12, -2.3 + i * 0.12 + 0.07, 2.12, 3.8, 0.004, cr('#efe3c8'));
  B.box(0, 0, 3.9 + 0.35, X * 2, 0.04, 0.7, cr('#b9a3b8'), { base: 0, top: cr('#b9a3b8'), tint: 0 }); B.box(0, 0, 2.05, X * 2, 0.04, 0.05, PAL.curb, { base: 0 });
  S.floor(B, -X, X, -Z, ZF - DP, 0.003, cr('#2e2547')); // back lots
}

export function buildRow(S) {
  const B = S.B, R = S.R, V = 1.35;
  // ----- park wall + gate (x -7.6 .. -3.6, gate -4.64)
  const gx = -29 * K;
  B.box(-6.2, 0, ZF - 0.12, 3.2, 0.24, 0.24, PAL.brick[1], { base: 0.3, top: cr('#cbb9a0') }); B.box(-4.3 + 0.55 + 0.25, 0, ZF - 0.12, 0.7, 0.24, 0.24, PAL.brick[1], { base: 0.3, top: cr('#cbb9a0') });
  for (const px of [gx - 0.2, gx + 0.2]) { B.box(px, 0, ZF - 0.12, 0.16, 0.62, 0.16, PAL.stone, { base: 0.3 }); B.pyr(px, 0.62, ZF - 0.12, 0.2, 0.1, PAL.stoneD); S.GLOW.box(px, 0.72, ZF - 0.12, 0.07, 0.09, 0.07, NEON.warm, { base: 0 }); S.halo(px, 0.8, ZF + 0.05, 0.55, 0.55, [0.8, 0.5, 0.2]); }
  for (let k = 0; k < 8; k++) { const a0 = Math.PI - k / 8 * Math.PI, a1 = Math.PI - (k + 1) / 8 * Math.PI; B.push((gx + Math.cos(a0) * 0.2 + gx + Math.cos(a1) * 0.2) / 2, 0.62 + (Math.sin(a0) + Math.sin(a1)) * 0.1, ZF - 0.12, 0, 1, 0, Math.atan2(Math.sin(a1) - Math.sin(a0), Math.cos(a1) - Math.cos(a0))); B.box(0, -0.012, 0, 0.08, 0.025, 0.03, PAL.iron, { base: 0 }); B.pop(); }
  for (const [a, b] of [[-7.6, -4.95], [-4.35, -3.6]]) for (let x = a + 0.05; x < b; x += 0.1) S.wall(B, x, 0.31, ZF - 0.02, 0.012, 0.16, PAL.iron);
  S.sign('park', gx, 0.92, ZF - 0.06, 0.62, 0.155, 0); S.halo(gx, 0.75, ZF + 0.3, 1.2, 0.9, [0.28, 0.45, 0.2]);
  // ----- home stoop
  body(S, -3.6, -1.36, 2.9, cr('#93403a'), { courses: [0.7, 1.3, 1.9, 2.5], roof: cr('#8a5a62') });
  grid(S, [-3.32, -2.92, -2.52, -2.12, -1.72], [1.0, 1.6, 2.2], 0.2, 0.3, 0.6); mw(S, -3.2, 0.42, 0.28, 0.3, WINCOL[0]); mw(S, -1.6, 0.42, 0.28, 0.3, WINCOL[0]);
  B.box(-2.4, 0.0, ZF + 0.01, 0.34, 0.62, 0.04, cr('#2a8c7a'), { base: 0 }); for (let i = 0; i < 3; i++) B.box(-2.4, 0, ZF + 0.14 - i * 0.05, 0.5 - i * 0.04, 0.03 * (i + 1) + 0.03, 0.28 - i * 0.07, PAL.stone, { base: 0.1 }); B.box(-2.4, 0.66, ZF + 0.12, 0.5, 0.03, 0.26, PAL.stone, { base: 0 }); S.GLOW.box(-2.4, 0.7, ZF + 0.02, 0.2, 0.06, 0.02, WINCOL[2], { base: 0 });
  for (let i = 0; i < 3; i++) { const y = 0.95 + i * 0.6; B.box(-1.65, y, ZF + 0.12, 0.62, 0.025, 0.24, PAL.iron, { base: 0 }); S.wall(B, -1.65, y + 0.09, ZF + 0.24, 0.62, 0.15, PAL.iron); }
  tank(S, -2.0, ZF - 0.7, 2.9); B.box(-3.1, 2.9, ZF - 0.6, 0.3, 0.2, 0.24, PAL.steel, { base: 0.2 });
  // ----- shop
  body(S, -1.04, 1.04, 1.9, cr('#3f8088'), { courses: [0.74], roof: cr('#9a8aa4') });
  for (const wx of [-0.55, 0.55]) { mw(S, wx, 0.32, 0.7, 0.4, [2.0, 1.25, 0.6]); S.halo(wx, 0.35, ZF + 0.35, 1.3, 0.9, [0.5, 0.32, 0.12]); } S.wall(S.GLOW, 0, 0.3, ZF + 0.012, 0.26, 0.52, [2.0, 1.25, 0.6]);
  awning(S, 0, 1.7, 0.56, cr('#ff6f61'), cr('#f6efde'), 10); S.sign('thrift', 0, 0.98, ZF + 0.025, 1.2, 0.3, 0); grid(S, [-0.6, -0.2, 0.2, 0.6], [1.4], 0.22, 0.28, 0.7);
  for (let i = 0; i < 7; i++) B.box(-0.8 + i * 0.045, 0.0, ZF + 0.5, 0.035, 0.2, 0.07, [PAL.pinkC, PAL.teal, PAL.yellowC][i % 3], { base: 0 }); S.halo(0, 0.01, ZF + 0.6, 2.2, 0.8, [0.5, 0.3, 0.1], { flat: true });
  // ----- sound lab
  body(S, 1.23, 3.09, 2.4, cr('#4a5c9a'), { courses: [0.7, 1.3], roof: cr('#8a86ac') });
  mw(S, 1.7, 0.3, 0.6, 0.36, [1.4, 0.5, 2.4]); S.halo(1.7, 0.3, ZF + 0.3, 1.4, 1.0, [0.4, 0.2, 0.6]); B.box(2.18, 0, ZF + 0.012, 0.3, 0.62, 0.04, cr('#6a6e8e'), { base: 0 }); S.GLOW.box(2.08, 0.74, ZF + 0.03, 0.06, 0.06, 0.05, NEON.red, { base: 0 }); S.halo(2.08, 0.75, ZF + 0.2, 0.6, 0.6, [0.9, 0.12, 0.1]);
  S.sign('soundlab', 2.16, 1.1, ZF + 0.025, 1.3, 0.325, 0); S.halo(2.16, 1.1, ZF + 0.3, 2.2, 1.0, [0.12, 0.36, 0.44]); grid(S, [1.5, 1.95, 2.4, 2.85], [1.6, 2.05], 0.22, 0.3, 0.6); B.cyl(2.7, 2.4, ZF - 0.5, 0.01, 0.01, 0.4, 4, PAL.iron); S.GLOW.box(2.7, 2.8, ZF - 0.5, 0.03, 0.03, 0.03, NEON.red, { base: 0 });
  // ----- bar
  body(S, 3.28, 5.44, 2.15, cr('#573f7a'), { courses: [0.64, 1.2], roof: cr('#8a7098'), trim: cr('#a870a8') });
  S.sign('bar', 4.36, 1.3, ZF + 0.03, 1.5, 0.75, 0); S.halo(4.36, 1.3, ZF + 0.3, 2.9, 1.6, [0.55, 0.12, 0.38]); for (const wx of [3.78, 4.95]) { mw(S, wx, 0.33, 0.5, 0.36, [1.8, 0.5, 2.4]); S.halo(wx, 0.35, ZF + 0.3, 1.1, 0.8, [0.45, 0.12, 0.4]); }
  B.box(4.36, 0, ZF + 0.012, 0.34, 0.6, 0.05, cr('#b8283f'), { base: 0 }); for (const dx of [-0.2, 0.2]) S.GLOW.box(4.36 + dx, 0.0, ZF + 0.03, 0.025, 0.66, 0.025, NEON.pink, { base: 0 }); S.GLOW.box(4.36, 0.66, ZF + 0.03, 0.42, 0.025, 0.025, NEON.pink, { base: 0 }); S.halo(4.36, 0.01, ZF + 0.5, 1.8, 0.8, [0.5, 0.1, 0.34], { flat: true });
  S.sign('live', 3.5, 0.9, ZF + 0.03, 0.3, 0.15, 0); grid(S, [3.6, 4.1, 4.62, 5.1], [1.72], 0.22, 0.2, 0.6);
  // ----- end blocks
  body(S, 5.44, 7.6, 2.6, cr('#6a5a8a'), { courses: [0.7, 1.4, 2.0], roof: cr('#8a7aa0') }); grid(S, [5.8, 6.25, 6.7, 7.15], [1.0, 1.6, 2.2], 0.2, 0.28, 0.5); mw(S, 6.5, 0.36, 0.9, 0.36, [1.6, 1.9, 2.3]); S.halo(6.5, 0.4, ZF + 0.3, 1.6, 0.9, [0.2, 0.3, 0.4]);
  // ----- street dressing: lamps, cars, bus stop + map, juice cart
  for (let i = 0; i < 9; i++) { const x = (-32 + i * 8) * K; B.cyl(x, 0.04, 2.0, 0.018, 0.012, 0.62, 5, PAL.iron, { base: 0 }); B.box(x, 0.66, 1.93, 0.04, 0.025, 0.14, PAL.iron, { base: 0 }); S.GLOW.box(x, 0.62, 1.86, 0.07, 0.03, 0.07, NEON.warm, { base: 0 }); S.halo(x, 0.55, 1.9, 0.9, 0.9, [0.7, 0.45, 0.18]); S.halo(x, 0.05, 1.65, 0.8, 0.7, [0.4, 0.26, 0.1], { flat: true }); }
  const cc = [cr('#2ec4b6'), cr('#e9a23b'), cr('#d9534f'), cr('#e870a0'), cr('#6b7fd7'), cr('#e8d9c0')];
  [[-5.2, 2.5], [-3.4, 2.5], [0.55, 2.5], [2.8, 2.5], [5.2, 2.5], [-0.6, 3.5], [3.5, 3.45]].forEach(([x, z], i) => { const c = cc[i % 6]; B.box(x, 0.02, z, 0.72, 0.1, 0.34, c, { base: 0.3, top: mul(c, 1.1) }); B.box(x, 0.12, z, 0.36, 0.1, 0.3, PAL.glassD, { taper: 0.82, top: c }); S.GLOW.box(x - 0.36, 0.07, z - 0.1, 0.012, 0.03, 0.05, [3, 0.4, 0.35], { base: 0 }); });
  B.box(6 * K * 1.0 + 0.0, 0.04, 1.2, 0.46, 0.4, 0.04, cr('#1b1838'), { base: 0 }); S.dec('map', 0.96, 0.27, 1.226, 0.42, 0.26, 0); S.halo(0.96, 0.3, 1.5, 1.0, 0.7, [0.1, 0.3, 0.38]);
  B.box(-1.1, 0.04, 1.55, 0.34, 0.14, 0.2, cr('#2ec4b6'), { base: 0.2, top: cr('#f6efde') }); for (let i = 0; i < 8; i++) { const a0 = i / 8 * 6.283, a1 = (i + 1) / 8 * 6.283, c = i % 2 ? cr('#ff8a3d') : cr('#f6efde'); B.tri([-1.05, 0.5, 1.5], [-1.05 + Math.cos(a1) * 0.3, 0.38, 1.5 + Math.sin(a1) * 0.3], [-1.05 + Math.cos(a0) * 0.3, 0.38, 1.5 + Math.sin(a0) * 0.3], c); }
  B.cyl(-1.05, 0.18, 1.5, 0.008, 0.008, 0.3, 4, PAL.iron);
  // the little cat on the wall
  B.blob(-6.7, 0.29, ZF - 0.12, 0.05, 0.05, 0.07, cr('#1f1830'), cr('#3a2f52'), { detail: 0, jit: 0.1 }); S.GLOW.box(-6.7, 0.32, ZF - 0.07, 0.03, 0.012, 0.01, [0.7, 3, 0.5], { base: 0 });
}

export function buildPark(S) {
  const B = S.B, R = S.R, gx = -29 * K;
  // lawn polygon (slightly rounded corners), path, pond-fountain, trees, benches, lamps
  S.floor(B, -7.45, -3.75, -6.6, ZF - 0.28, 0.006, cr('#3f7a4a')); for (let i = 0; i < 16; i++) { const x = -7.3 + R() * 3.4, z = -6.3 + R() * 6.6; S.floor(B, x, x + 0.5 + R() * 0.5, z, z + 0.4 + R() * 0.5, 0.009, cr(R() < 0.5 ? '#4f9a58' : '#3a6f46')); }
  S.floor(B, gx - 0.17, gx + 0.17, -3.0, ZF - 0.1, 0.012, cr('#e6c8a2')); S.floor(B, gx - 1.1, gx + 0.9, -3.0, -2.62, 0.012, cr('#e6c8a2')); S.floor(B, gx - 1.1, gx - 0.75, -5.8, -2.62, 0.012, cr('#e6c8a2'));
  const fx = gx - 0.1, fz = -2.4; B.lathe([[0.4, 0, PAL.stoneD], [0.46, 0.05, PAL.stone], [0.46, 0.1, mul(PAL.stone, 1.1)], [0.36, 0.1, cr('#2c6e8f')], [0, 0.1, cr('#4fb6c9')]], 12, fx, 0, fz, {}); B.cyl(fx, 0.08, fz, 0.06, 0.04, 0.2, 7, PAL.stone); B.cyl(fx, 0.28, fz, 0.1, 0.02, 0.05, 8, cr('#8fe0e0'));
  S.halo(fx, 0.15, fz, 1.2, 1.2, [0.1, 0.35, 0.4], { flat: true });
  const T = [[-6.9, -0.6], [-5.8, -1.1], [-6.6, -2.4], [-6.2, -4.0], [-4.5, -4.2], [-7.0, -5.6], [-5.5, -5.8], [-4.2, -5.9], [-6.0, -3.3], [-4.1, -0.9], [-5.0, -0.2], [-7.2, -4.6]];
  T.forEach(([x, z], i) => { const s = 0.85 + (i % 4) * 0.12; B.cyl(x, 0, z, 0.035 * s, 0.025 * s, 0.34 * s, 5, PAL.woodD, { base: 0.2 }); if (i % 3 === 2) { B.cyl(x, 0.2 * s, z, 0.22 * s, 0.14 * s, 0.34 * s, 6, PAL.leaf[2]); B.cyl(x, 0.45 * s, z, 0.16 * s, 0.0, 0.4 * s, 6, PAL.leaf[1]); } else { B.blob(x, 0.55 * s, z, 0.25 * s, 0.22 * s, 0.25 * s, PAL.leaf[2], mix(PAL.leaf[i % 4], cr('#fff0a0'), 0.2), { detail: 1, jit: 0.4 }); B.blob(x + 0.1 * s, 0.72 * s, z - 0.04, 0.16 * s, 0.14 * s, 0.16 * s, PAL.leaf[0], PAL.leaf[3], { detail: 0, jit: 0.4 }); S.GLOW.blob(x + 0.08 * s, 0.6 * s, z + 0.1, 0.1 * s, 0.08 * s, 0.09 * s, [0.25, 0.7, 0.3], [0.5, 1.1, 0.5], { detail: 0, jit: 0.4 }); } });
  for (const [x, z, ry] of [[fx - 0.9, -2.4, Math.PI / 2], [fx + 0.8, -2.4, -Math.PI / 2]]) { B.box(x, 0.02, z, 0.26, 0.05, 0.1, PAL.wood, { base: 0.1, ry }); B.box(x, 0.1, z, 0.26, 0.08, 0.02, PAL.wood, { base: 0.1, ry }); }
  for (const [x, z] of [[gx - 0.5, -1.2], [gx + 0.5, -4.0]]) { B.cyl(x, 0, z, 0.012, 0.01, 0.4, 5, PAL.iron, { base: 0 }); S.GLOW.box(x, 0.42, z, 0.05, 0.05, 0.05, NEON.warm, { base: 0 }); S.halo(x, 0.44, z, 0.8, 0.8, [0.7, 0.45, 0.2]); }
  for (let k = 0; k < 10; k++) { const t = k / 9; S.GLOW.box(gx - 0.5 + t * 1.0, 0.8 - Math.sin(t * Math.PI) * 0.1, ZF - 0.4, 0.025, 0.025, 0.025, [NEON.warm, NEON.pink, NEON.cyan][k % 3], { base: 0 }); }
}

export function buildFlat(S) {
  // Tay and Foxy's flat as a cutaway floor plan behind the home block (4B): rooms, low walls, a handful of furniture boxes
  const B = S.B, s = 0.17, cx = -15 * K, cz = -3.4, P = (x, z) => [cx + x * s, 0.0, cz + z * s];
  B.box(cx, 0, cz, 15.8 * s, 0.05, 11.8 * s, cr('#d9c8ae'), { base: 0.2, top: cr('#cbb9a0') });
  const room = (x0, x1, z0, z1, c) => S.floor(B, cx + x0 * s, cx + x1 * s, cz + z0 * s, cz + z1 * s, 0.054, c);
  room(-7.5, -0.5, -1.5, 5.5, cr('#c78c55')); room(0.5, 7.5, -5.5, -0.5, cr('#58b9b2')); room(-7.5, -1.0, -5.5, -1.5, cr('#8f5a98')); room(0.5, 7.5, -0.5, 5.5, cr('#3a4a78'));
  const wall = (x0, z0, x1, z1, h) => { const w = Math.abs(x1 - x0) * s || 0.04, d = Math.abs(z1 - z0) * s || 0.04; B.box(cx + (x0 + x1) / 2 * s, 0.05, cz + (z0 + z1) / 2 * s, w, h, d, cr('#efe1c4'), { base: 0.2, top: cr('#fff2dc') }); };
  wall(-7.7, -5.7, 7.7, -5.7, 0.34); wall(-7.7, -5.7, -7.7, 5.7, 0.3); wall(7.7, -5.7, 7.7, 5.7, 0.16); wall(-7.7, 5.7, 7.7, 5.7, 0.09); wall(0, -5.5, 0, 5.5, 0.12);
  // furniture
  const bx = (x, z, w, d, h, c, y0) => B.box(cx + x * s, 0.054 + (y0 || 0), cz + z * s, w * s, h, d * s, c, { base: 0.2 });
  bx(-4.5, 3.5, 3.4, 1.3, 0.1, cr('#8f5a98')); bx(-4.5, 4.0, 3.4, 0.5, 0.17, cr('#a874aa')); bx(-4.5, 0.5, 3, 2, 0.01, cr('#e8604a'));
  bx(-5.5, -3.6, 3.0, 4.0, 0.08, cr('#e8e1d5')); bx(-5.5, -4.8, 3.0, 1.2, 0.14, cr('#34a199')); bx(3.5, -5.0, 6.0, 1.2, 0.11, cr('#f5ead2')); bx(6.4, -3.0, 1.2, 1.2, 0.3, cr('#e8e1d5')); bx(3.5, -2.2, 3.0, 1.4, 0.08, PAL.wood);
  bx(5.0, 1.5, 3.2, 3.0, 0.2, cr('#17102b')); S.GLOW.box(cx + 5.0 * s, 0.26, cz + 1.5 * s, 0.2, 0.012, 0.16, NEON.cyan, { base: 0 }); S.GLOW.box(cx + 3.4 * s, 0.1, cz + 4.4 * s, 0.1, 0.02, 0.06, NEON.pink, { base: 0 }); bx(-1.0, 3.2, 1.0, 1.0, 0.1, cr('#ffd23f'));
  S.halo(cx, 0.1, cz, 3.2, 2.4, [0.3, 0.22, 0.12], { flat: true });
  S.sign('flat', cx, 0.28, cz + 6.0 * s + 0.05, 0.62, 0.23, 0, [1, 1, 1], -0.45);
}

// ---------------------------------------------------------------- instanced LOD city blocks (baked window grids; instanceColor tints the walls)
function lodGeos(floors, seed) {
  const R = rng(seed), FH = 0.3, H = floors * FH, body = new Buf({ rng: rng(seed + 1) }), lit = new Buf({ rng: rng(seed + 2) });
  body.box(0, 0, 0, 1, H, 1, [1, 1, 1], { base: 0.35, tint: 0.02, top: [0.62, 0.6, 0.7] }); body.box(0, H - 0.02, 0, 1.06, 0.07, 1.06, [0.9, 0.88, 0.92], { base: 0 });
  const cols = 3; for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const y = f * FH + FH * 0.5 + 0.02, u = -0.5 + (c + 0.5) / cols;
    for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) { if (nz === -1) continue; const on = R() < 0.5, g = on ? lit : body, col2 = on ? WINCOL[(R() * WINCOL.length) | 0] : [0.12, 0.14, 0.26]; const p = (a, b) => nz ? [a, y + b, 0.5 + 0.004] : [nx * (0.5 + 0.004), y + b, a]; const w = 0.17, h = FH * 0.5; if (nz) g.quad(p(u - w / 2, -h / 2), p(u + w / 2, -h / 2), p(u + w / 2, h / 2), p(u - w / 2, h / 2), col2); else if (nx > 0) g.quad(p(u + w / 2, -h / 2), p(u - w / 2, -h / 2), p(u - w / 2, h / 2), p(u + w / 2, h / 2), col2); else g.quad(p(u - w / 2, -h / 2), p(u + w / 2, -h / 2), p(u + w / 2, h / 2), p(u - w / 2, h / 2), col2); }
  }
  return { body: body.geometry(false), lit: lit.geometry(false), H };
}
export function buildLod(S, R, bodyMat, glowMat) {
  const group = new THREE.Group(); group.name = 'hood_lod'; const FLOORS = [2, 3, 5, 7], types = FLOORS.map((f, i) => lodGeos(f, 900 + i * 17)), lists = FLOORS.map(() => []);
  const hues = ['#9a8ab0', '#ac8aa4', '#8a98b4', '#b4a094', '#90acb0', '#a4808c', '#8a80ae', '#b49aa8'];
  const put = (x, z, ry, w, d) => { const t = (R() * 4) | 0; const tt = ry ? Math.min(2, t) : t; lists[tt].push({ x, z, ry, w, d, h: 0.92 + R() * 0.22, c: hues[(R() * hues.length) | 0] }); };
  for (let gx = -0.3; gx < 7.2; gx += 1.18) for (let gz = -6.3; gz < -0.9; gz += 1.18) { if (R() < 0.12) continue; put(gx + R() * 0.2, gz + R() * 0.2, 0, 0.8 + R() * 0.28, 0.8 + R() * 0.28); }
  for (let x = -7.2; x < 7.2; x += 1.25) { lists[0].push({ x: x + R() * 0.12, z: 5.55, ry: Math.PI, w: 0.95 + R() * 0.2, d: 1.0, h: 0.8 + R() * 0.3, c: hues[(R() * hues.length) | 0] }); }
  for (const x of [-7.0, 7.0]) for (let z = -6.0; z < 5.0; z += 1.3) if (R() < 0.4) put(x, z, x < 0 ? Math.PI / 2 : -Math.PI / 2, 1.0, 1.0);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color(); let count = 0;
  lists.forEach((l, ti) => {
    if (!l.length) return; const a = new THREE.InstancedMesh(types[ti].body, bodyMat, l.length), b = new THREE.InstancedMesh(types[ti].lit, glowMat, l.length);
    l.forEach((o, i) => { q.setFromAxisAngle(up, o.ry); p.set(o.x, 0, o.z); s.set(o.w, o.h, o.d); m.compose(p, q, s); a.setMatrixAt(i, m); b.setMatrixAt(i, m); c.set(o.c); a.setColorAt(i, c); }); count += l.length;
    a.castShadow = true; a.receiveShadow = true; a.frustumCulled = false; b.frustumCulled = false; a.name = 'hood_lod_' + ti; b.name = 'hood_lod_lit_' + ti; group.add(a, b);
  });
  group.userData.count = count; return group;
}
