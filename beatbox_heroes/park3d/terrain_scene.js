// Terrain props, part 2: the bench cluster, busking crate stage, flyers corner, run-loop start arch and the small storytelling clutter.
import { THREE } from './kit.js';
import { col, mix, mul, smooth } from './terrain_util.js';
import { put, bench, lampPost, IRON, IRON_L, IRON_D, WOOD, STONE, STONE_M, STONE_D, MOSS } from './terrain_props.js';
import { crate } from './terrain_wall.js';
import { LOOP } from './terrain_ground.js';

const WARM = [2.6, 1.7, 0.7], PINKG = [2.6, 0.6, 1.3], CYANG = [0.5, 2.0, 2.4];
const lw = (X, Z, ry, x, z) => ({ x: X + x * Math.cos(ry) + z * Math.sin(ry), z: Z - x * Math.sin(ry) + z * Math.cos(ry) });

export function bin(S, x, z, c, ry) {
  const body = c || col('#3F7A62'), band = col('#F0C95E'), dk = mul(body, 0.78), lid = mul(body, 0.7);
  put(S, x, z, ry || 0, 1, (B) => {
    B.lathe([[0.22, 0, IRON_D], [0.27, 0.05, dk], [0.31, 0.2, body], [0.3, 0.44, body], [0.31, 0.44, band], [0.31, 0.5, band], [0.3, 0.5, body], [0.29, 0.72, body], [0.33, 0.75, lid], [0.33, 0.8, lid], [0.2, 0.92, lid], [0, 0.96, mul(lid, 1.1)]], 8, 0, 0, 0, { rot: 0.2 });
    B.box(0, 0.62, 0.27, 0.22, 0.06, 0.06, IRON_D, { base: 0 });
  });
  S.hit.circle(x, z, 0.38); S.soft(x, z, 0.6, 0.6, col('#3a2d5c'), 0.3, 0, S.hAt(x, z) + 0.04, 10);
}
function hydrant(S, x, z, ry) {
  const red = col('#D8483E'), redD = col('#A8322F'), yel = col('#F0C95E');
  put(S, x, z, ry || 0, 1, (B) => {
    B.lathe([[0.2, 0, redD], [0.17, 0.08, red], [0.15, 0.5, red], [0.2, 0.52, redD], [0.2, 0.58, redD], [0.14, 0.62, red], [0.14, 0.72, red], [0.18, 0.74, yel], [0.1, 0.82, yel], [0, 0.86, yel]], 8, 0, 0, 0, {});
    B.box(0.22, 0.38, 0, 0.14, 0.1, 0.12, yel, { base: 0 }); B.box(-0.22, 0.38, 0, 0.14, 0.1, 0.12, yel, { base: 0 }); B.box(0, 0.4, 0.22, 0.1, 0.1, 0.1, redD, { base: 0 });
  });
  S.hit.circle(x, z, 0.3); S.soft(x, z, 0.5, 0.5, col('#3a2d5c'), 0.3, 0, S.hAt(x, z) + 0.04, 10);
}
function cone(S, x, z, ry) {
  const or = col('#EE6A3C'), cr = col('#F6E7CF');
  put(S, x, z, ry, 1, (B) => { B.lathe([[0.2, 0, IRON_D], [0.2, 0.035, or], [0.12, 0.3, or], [0.12, 0.3, cr], [0.095, 0.4, cr], [0.095, 0.4, or], [0.04, 0.56, or], [0, 0.57, or]], 6, 0, 0, 0, { rot: 0.5 }); });
}
// litter in groups of three: crumpled paper, a cup, a flyer, a can
function litter(S, x, z, spread) {
  const R = S.rand, kinds = ['ball', 'cup', 'sheet', 'can', 'ball'];
  for (let i = 0; i < 3; i++) {
    const px = x + (R() - 0.5) * spread, pz = z + (R() - 0.5) * spread, k = kinds[(R() * kinds.length) | 0], sc = 0.8 + R() * 0.5, ry = R() * 6.28;
    put(S, px, pz, ry, sc, (B) => {
      if (k === 'ball') B.blob(0, 0.05, 0, 0.065, 0.055, 0.06, col('#E2D4BC'), col('#F6EBD8'), { detail: 0, jit: 0.3 });
      else if (k === 'cup') { B.lathe([[0.04, 0, col('#E9DFD0')], [0.055, 0.12, col('#F4EBDD')], [0.058, 0.12, col('#D95B4B')], [0.052, 0.125, col('#D95B4B')]], 7, 0, 0, 0, { tint: 0.02 }); B.box(0, 0.12, 0, 0.1, 0.012, 0.1, col('#4A3A3A'), { base: 0 }); }
      else if (k === 'sheet') B.box(0, 0.004, 0, 0.24, 0.006, 0.17, mix(col('#FBEBD0'), [col('#FF7DA6'), col('#7FE0D8'), col('#FFE07A')][(R() * 3) | 0], 0.45), { base: 0, tint: 0.04 });
      else B.cyl(0, 0, 0, 0.032, 0.032, 0.11, 6, [col('#D8534A'), col('#4FA3D9'), col('#C9C3D0')][(R() * 3) | 0], { rx: 0, base: 0.1 });
    });
  }
}

export function buildScene(S) {
  const B = S.B, R = S.rand;
  // ---------------- bench cluster, west of the fountain, facing the plaza
  { const a0 = Math.atan2(-4, -9), Rr = Math.hypot(9, 4), list = [];
    [-1, 0, 1].forEach((k) => { const a = a0 + k * 0.4, x = Math.cos(a) * Rr, z = Math.sin(a) * Rr, ry = Math.atan2(-x, -z); bench(S, x, z, ry, { old: k === 1 }); list.push({ x, z, rot: ry, seatY: 0.46 }); });
    S.anchors.benches = list; S.anchors.bench = Object.assign({}, list[1]);
    const b0 = list[0], b2 = list[2], b1 = list[1];
    put(S, b0.x, b0.z, b0.rot, 1, (B) => { B.lathe([[0.04, 0, col('#E9DFD0')], [0.052, 0.11, col('#F4EBDD')], [0.055, 0.11, col('#D95B4B')], [0.05, 0.116, col('#D95B4B')]], 7, 0.62, 0.49, 0.1, {}); });
    put(S, b2.x, b2.z, b2.rot, 1, (B) => { B.box(-0.45, 0.49, 0.06, 0.34, 0.012, 0.26, col('#EADFC9'), { ry: 0.3, base: 0, tint: 0.03 }); B.box(-0.45, 0.502, 0.06, 0.3, 0.004, 0.04, col('#2B2438'), { ry: 0.3, base: 0 }); B.box(-0.4, 0.502, 0.12, 0.28, 0.004, 0.03, col('#7A6C86'), { ry: 0.3, base: 0 });
      B.box(1.2, 0, 0.55, 0.32, 0.38, 0.2, col('#F0B43F'), { ry: 0.5, tint: 0.04, base: 0.3 }); B.box(1.2, 0.2, 0.67, 0.28, 0.12, 0.05, col('#C98B2B'), { ry: 0.5, base: 0 }); });
    S.decal('smiley', b1.x - Math.sin(b1.rot) * 0.38 + Math.cos(b1.rot) * 0.5, S.hAt(b1.x, b1.z) + 0.78, b1.z - Math.cos(b1.rot) * 0.38 - Math.sin(b1.rot) * 0.5, 0.2, 0.2, b1.rot + Math.PI, -0.2, null, 0);
    const bp = (a, r) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    const q1 = bp(a0 - 0.22, 11.7), q2 = bp(a0 + 0.62, 11.2); bin(S, q1.x, q1.z, col('#3F7A62'), 0.4); bin(S, q2.x, q2.z, col('#3F6FA8'), 1.2);
    const lt = bp(a0 + 0.2, 11.3); litter(S, lt.x, lt.z, 1.4);
  }
  // ---------------- busking crate stage, diagonal backdrop behind the spot (8,-8); the 2.5 m circle stays clean
  { const SX = 8, SZ = -11.5, RY = 0, wood = WOOD;
    put(S, SX, SZ, RY, 1, (B, gy, G) => {
      [-1.1, 0, 1.1].forEach((x, i) => crate(B, S, x, 0, 0, 1.15, wood[i % 3], 0.02 * (i - 1)));
      crate(B, S, -0.55, 0.72, 0, 1.0, wood[1], -0.03); crate(B, S, 0.62, 0.72, -0.02, 0.88, wood[2], 0.06); crate(B, S, -0.2, 0, -1.1, 1.0, wood[0], 0.1); crate(B, S, 0.9, 0, -1.15, 1.05, wood[1], -0.12); crate(B, S, 0.35, 0.66, -1.12, 0.85, wood[2], 0.2);
      // amp on top, speaker on the ground, mic stand, cable, hat, sign, guitar case
      const ay = 1.35; B.box(-0.55, ay, 0.02, 0.72, 0.52, 0.38, col('#3A3258'), { base: 0.2, tint: 0.03 }); B.box(-0.55, ay + 0.04, 0.215, 0.58, 0.38, 0.03, col('#D9A24A'), { base: 0 });
      for (let i = 0; i < 6; i++) B.box(-0.55 - 0.25 + i * 0.1, ay + 0.04, 0.23, 0.02, 0.38, 0.01, col('#B07A32'), { base: 0 });
      for (let i = 0; i < 4; i++) B.cyl(-0.55 - 0.24 + i * 0.16, ay + 0.46, 0.2, 0.025, 0.025, 0.04, 6, col('#F0E0C0'), {}); B.box(-0.55, ay + 0.52, 0.02, 0.28, 0.07, 0.05, IRON_D, { base: 0 });
      G.box(0.1 - 0.55 + 0.2, ay + 0.44, 0.215, 0.03, 0.03, 0.02, [3.4, 0.4, 0.4], { base: 0, tint: 0, top: [3.4, 0.4, 0.4] });
      B.box(-2.3, 0, 0.5, 0.58, 1.05, 0.46, col('#3A3258'), { base: 0.3, ry: 0.15 }); B.cyl(-2.28 + 0.03, 0.62, 0.74, 0.19, 0.19, 0.03, 8, col('#D9A24A'), { rx: 0 }); B.cyl(-2.3, 0.24, 0.72, 0.1, 0.1, 0.03, 8, col('#B07A32'), {});
      B.cyl(1.2, 0.72, 0.38, 0.14, 0.14, 0.03, 8, IRON, {}); B.cyl(1.2, 0.74, 0.38, 0.012, 0.012, 1.25, 5, IRON_L, { base: 0 }); B.box(1.2, 1.95, 0.46, 0.015, 0.015, 0.2, IRON_L, { base: 0 }); B.cyl(1.2, 1.88, 0.58, 0.035, 0.03, 0.11, 6, col('#2B2438'), {}); B.blob(1.2, 1.99, 0.58, 0.045, 0.045, 0.045, IRON_L, col('#9A9AB8'), { detail: 0 });
      B.box(0.2, 0.72, 0.28, 0.9, 0.012, 0.02, IRON_D, { base: 0, ry: -0.2 });
      B.at(2.1, 0, 0.8, 0.5, 1, () => { B.lathe([[0.2, 0, col('#6A4A33')], [0.26, 0.15, col('#7A5238')], [0.2, 0.17, col('#7A5238')], [0.16, 0.04, col('#3A2A2A')], [0, 0.04, col('#3A2A2A')]], 8, 0, 0, 0, {}); for (let i = 0; i < 4; i++) B.cyl(-0.05 + i * 0.04, 0.045, -0.04 + (i % 2) * 0.08, 0.025, 0.025, 0.01, 6, i % 2 ? col('#F2C14E') : col('#C9C3D0'), { base: 0 }); });
      B.box(-1.6, 0, 0.85, 0.9, 0.5, 0.03, col('#C79A6A'), { rx: -0.22, base: 0.1 });
      B.box(2.5, 0, -0.5, 1.15, 0.12, 0.4, col('#2F2640'), { ry: 0.4, base: 0.2 }); B.box(2.5, 0.12, -0.5, 0.2, 0.03, 0.05, col('#C9C3D0'), { ry: 0.4, base: 0 });
      // string lights: two poles and a sagging wire with warm, pink and cyan bulbs
      const PX = 2.5, PY = 3.1, pts = [];
      [-PX, PX].forEach((x) => { B.cyl(x, 0, -0.3, 0.06, 0.05, PY, 6, mix(WOOD[1], col('#6A4A33'), 0.4), {}); B.cyl(x, PY, -0.3, 0.07, 0.04, 0.1, 6, IRON, {}); B.box(x, 0, -0.3, 0.5, 0.2, 0.5, mix(STONE_M, MOSS, 0.2), { base: 0.4, tint: 0.05 }); });
      const NSEG = 12; for (let i = 0; i <= NSEG; i++) { const u = i / NSEG, x = -PX + 2 * PX * u, y = PY + 0.08 - 0.62 * (1 - (2 * u - 1) * (2 * u - 1)); pts.push([x, y, -0.3 + 0.2 * Math.sin(u * 3.14)]); }
      for (let i = 0; i < NSEG; i++) wire(B, pts[i], pts[i + 1]);
      for (let i = 1; i < NSEG; i++) { const p = pts[i], c = [WARM, PINKG, CYANG][i % 3]; B.box(p[0], p[1] - 0.2, p[2], 0.015, 0.14, 0.015, IRON, { base: 0 }); G.box(p[0] - 0.05, p[1] - 0.3, p[2] - 0.05, 0.1, 0.12, 0.1, c, { base: 0, tint: 0, top: c }); }
      S.anchors.stageLights = pts.slice(1, NSEG).map((p) => { const w = lw(SX, SZ, RY, p[0], p[2]); return { x: w.x, y: S.hAt(SX, SZ) + p[1] - 0.25, z: w.z, color: [WARM, PINKG, CYANG] }; });
    });
    S.hit.box(SX, SZ, 1.85, 0.65, RY); S.hit.box(lw(SX, SZ, RY, -2.3, 0.5).x, lw(SX, SZ, RY, -2.3, 0.5).z, 0.35, 0.3, RY); S.hit.box(lw(SX, SZ, RY, 0.5, -1.1).x, lw(SX, SZ, RY, 0.5, -1.1).z, 1.0, 0.55, RY);
    S.soft(SX, SZ, 2.7, 1.2, col('#3a2d5c'), 0.34, -RY, 0.045, 14);
    const p1 = lw(SX, SZ, RY, 2.9, -0.3), p2 = lw(SX, SZ, RY, -2.9, -0.3); S.hit.circle(p1.x, p1.z, 0.3); S.hit.circle(p2.x, p2.z, 0.3);
    S.decal('busk', lw(SX, SZ, RY, -1.6, 0.85).x, S.hAt(SX, SZ) + 0.27, lw(SX, SZ, RY, -1.6, 0.85).z, 0.88, 0.44, RY, -0.22, null, 0);
    // a few coins and a pick on the worn ground, outside the clean circle
    litter(S, 5.2, -11.6, 1.2);
  }
  // ---------------- flyers corner at (4,22)
  { const bz = 20.4, bx = 4.0;
    put(S, bx, bz, 0, 1, (B) => {
      const wood = col('#8E5530'), cork = col('#C79660');
      [-1.3, 1.3].forEach((x) => B.box(x, 0, 0, 0.14, 2.45, 0.14, wood, { base: 0.4, tint: 0.06 }));
      B.box(0, 0.8, 0.02, 2.7, 1.5, 0.1, mix(wood, col('#C48650'), 0.3), { base: 0.2 }); B.box(0, 0.88, 0.075, 2.45, 1.34, 0.03, cork, { base: 0, tint: 0.08 });
      B.push(0, 2.33, 0, 0, 1, 0.18); B.box(0, 0, 0, 3.1, 0.07, 0.8, mix(wood, col('#5A3B2E'), 0.4), { base: 0 }); B.pop();
      B.box(0, 2.25, -0.2, 2.9, 0.1, 0.2, wood, { base: 0 });
    });
    const gy = S.hAt(bx, bz), z0 = bz + 0.095; [['fly1', -0.85, 1.75, 0.62, 0.05], ['fly3', -0.1, 1.55, 0.6, -0.08], ['fly2', 0.75, 1.8, 0.58, 0.07], ['fly4', 0.2, 1.0, 0.56, 0.03], ['fly2', -0.9, 1.0, 0.5, -0.1], ['yo', 0.95, 1.12, 0.42, 0.2], ['fly1', 0.55, 1.3, 0.38, 0.12]].forEach((d) => S.decal(d[0], bx + d[1], gy + d[2], z0 + R() * 0.004, d[3], d[3], 0, 0, null, d[4]));
    S.hit.box(bx, bz, 1.45, 0.35, 0); S.soft(bx, bz + 0.2, 1.9, 0.7, col('#3a2d5c'), 0.32, 0, gy + 0.045, 12);
    bin(S, 6.3, 21.4, col('#3F7A62'), 0.3); bin(S, 6.95, 21.9, col('#3F6FA8'), 0.8); hydrant(S, 1.9, 20.2, 0.3);
    put(S, 5.6, 19.4, 0, 1, (B) => { crate(B, S, 0, 0, 0, 0.8, WOOD[2], 0.2); B.box(0, 0.5, 0, 0.5, 0.06, 0.36, col('#FBEBD0'), { ry: 0.3, base: 0, tint: 0.05 }); B.box(0, 0.56, 0, 0.5, 0.05, 0.36, col('#FF9DBA'), { ry: 0.5, base: 0, tint: 0.05 }); }); S.hit.circle(5.6, 19.4, 0.45);
    litter(S, 3.0, 23.2, 2.2); litter(S, 5.2, 23.4, 1.6);
  }
  // ---------------- run loop start arch at (12.4, 14)
  { const px = [10.4, 14.5], pz = 15.0, rx = 12.45, c = S.runStartSample || { x: 12.4, z: 14, tx: 0, tz: 1 };
    px.forEach((x, i) => { put(S, x, pz, 0, 1, (B) => { B.box(0, 0, 0, 0.5, 0.18, 0.5, STONE_M, { base: 0.4 }); for (let k = 0; k < 6; k++) B.cyl(0, 0.18 + k * 0.55, 0, 0.1, 0.1, 0.55, 6, k % 2 ? col('#2B2438') : col('#F0C95E'), { base: 0 }); B.blob(0, 3.5, 0, 0.12, 0.12, 0.12, col('#F0C95E'), col('#FFE9A0'), { detail: 0 }); }); S.hit.circle(x, pz, 0.3); });
    put(S, 12.45, pz, 0, 1, (B) => { B.box(0, 3.35, 0, 4.4, 0.1, 0.1, IRON, { base: 0 }); B.box(0, 2.45, -0.0, 3.7, 0.04, 0.03, IRON_L, { base: 0 }); });
    const gy = S.hAt(rx, pz); S.decal('start', rx, gy + 2.9, pz + 0.02, 3.8, 0.95, 0, 0, [1.1, 1.1, 1.1], 0); S.decal('start', rx, gy + 2.9, pz - 0.02, 3.8, 0.95, Math.PI, 0, [1.1, 1.1, 1.1], 0);
    [-1.7, 1.7].forEach((x) => { put(S, rx + x, pz, 0, 1, (B) => { B.box(0, 2.45, 0, 0.04, 0.9, 0.04, IRON_L, { base: 0 }); }); });
    S.decal('start', 12.4, 0.05, 12.7, 3.0, 0.75, 0, -Math.PI / 2, [1.1, 1.1, 1.1], 0);
    cone(S, 9.6, 14.9, 0.1); cone(S, 15.2, 14.6, 0.7); cone(S, 15.45, 15.2, 1.1);
    bench(S, 15.4, 11.0, -Math.PI / 2, {}); bin(S, 15.3, 9.3, col('#3F6FA8'), 0.5); litter(S, 14.2, 8.6, 1.0);
  }
  // ---------------- clutter groups: rocks in threes, hopscotch, chalk, a picnic blanket
  [[-14.4, -16.8, 0.8], [-15.2, 13.5, 1.0], [14.6, -16.3, 0.9], [14.9, 21, 1.1], [-5.8, 20.6, 0.7], [7.6, -17.4, 0.8], [-4.4, -15.4, 0.7], [10.8, 8.5, 0.6], [-14.6, -3.6, 0.9], [15.2, 2.5, 0.7]].forEach(([x, z, s], gi) => {
    const sz = [0.62, 0.4, 0.26];
    for (let i = 0; i < 3; i++) { const a = R() * 6.28 + i * 2.1, d = i === 0 ? 0 : 0.5 + R() * 0.35, px = x + Math.cos(a) * d * s, pz = z + Math.sin(a) * d * s, gy = S.hAt(px, pz), r = sz[i] * s * (0.85 + R() * 0.3);
      B.gy = gy; B.blob(px, gy + r * 0.28, pz, r * 1.1, r * 0.7, r * 0.95, mix(STONE_D, col('#5A5170'), 0.4), mix(STONE, col('#D3CADA'), 0.3), { detail: 1, jit: 0.3, ry: R() * 3 }); S.hit.circle(px, pz, r * 0.85 * (i === 0 ? 1 : 0.8)); B.gy = 0; }
    S.soft(x, z, 1.1 * s, 0.9 * s, col('#3a2d5c'), 0.3, 0, S.hAt(x, z) + 0.04, 10);
  });
  S.decal('hop', -0.35, 0.052, 11.6, 2.3, 2.3, 0.1, -Math.PI / 2, [1, 1, 1], 0); S.decal('chalk', 3.9, 0.06, -5.6, 2.2, 1.1, -0.5, -Math.PI / 2, null, 0);
  put(S, -6.6, 8.8, 0.45, 1, (B) => {
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const c = (i + j) % 2 ? col('#E4DAC4') : col('#D4574F'); B.box(-1 + i * 0.4 + 0.2, 0.0, -0.8 + j * 0.4 + 0.2, 0.4, 0.02, 0.4, c, { base: 0, tint: 0.04 }); }
    B.lathe([[0.2, 0, col('#8E6A3C')], [0.26, 0.1, col('#B98A52')], [0.28, 0.24, col('#C99A62')], [0.25, 0.26, col('#B98A52')], [0.2, 0.25, col('#7A5A34')], [0, 0.24, col('#7A5A34')]], 8, 0.3, 0.02, -0.1, {}); B.box(0.3, 0.26, -0.1, 0.5, 0.03, 0.04, col('#8E6A3C'), { base: 0 });
    for (let i = 0; i < 3; i++) B.blob(-0.55 + i * 0.16, 0.06, 0.4 + (i % 2) * 0.12, 0.06, 0.055, 0.06, col('#B83A3A'), col('#F0634F'), { detail: 0 });
    B.box(-0.6, 0.02, -0.4, 0.45, 0.1, 0.3, col('#7FC8C0'), { ry: 0.3, taper: 0.9, base: 0.1 });
  });
  litter(S, 5.8, 4.4, 1.4); litter(S, -3.2, -6.6, 1.6); litter(S, 11.2, -3.6, 1.6);
}
function wire(B, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz);   const nx = 0.012; const c = col('#2B2438'); B.quad([a[0], a[1] + nx, a[2]], [b[0], b[1] + nx, b[2]], [b[0], b[1] + nx, b[2] + 0.02], [a[0], a[1] + nx, a[2] + 0.02], c); B.quad([a[0], a[1], a[2]], [a[0], a[1], a[2] + 0.02], [b[0], b[1], b[2] + 0.02], [b[0], b[1], b[2]], c); }
