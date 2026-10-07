// Terrain props, part 1: lamp posts, park benches, the iron fence with stone pillars, the gate arch and its open gates.
import { THREE } from './kit.js';
import { Buf, col, mix, mul, smooth, vnoise, curve, distToSamples } from './terrain_util.js';
import { LOOP, PATHS, PLAZA } from './terrain_ground.js';

export const IRON = col('#3A3550'), IRON_L = col('#5A5874'), IRON_D = col('#2B2438');
export const WOOD = [col('#B07342'), col('#9A6035'), col('#C48650'), col('#A56A3C')];
export const STONE = col('#B9B0BE'), STONE_M = col('#A19AAF'), STONE_D = col('#7F7694'), MOSS = col('#5F8A58');
const GLOWC = [2.1, 1.3, 0.5];

// place helper: builds local geometry standing on the terrain at (x,z)
export function put(S, x, z, ry, s, fn) { const gy = S.hAt(x, z); S.B.gy = gy; S.B.push(x, gy, z, ry || 0, s || 1); S.GLOW.push(x, gy, z, ry || 0, s || 1); fn(S.B, gy, S.GLOW); S.GLOW.pop(); S.B.pop(); S.B.gy = 0; return gy; }

// ---------------------------------------------------------------- lamp post
export function lampPost(S, x, z, o) {
  o = o || {}; const gy = put(S, x, z, o.ry || 0, 1, (B) => {
    B.lathe([[0.3, 0, STONE_D], [0.28, 0.2, STONE_M], [0.2, 0.3, STONE], [0.12, 0.4, IRON]], 6, 0, 0, 0, { rot: 0.5 });
    B.lathe([[0.11, 0.3, IRON_D], [0.085, 0.7, IRON], [0.075, 2.45, IRON_L], [0.1, 2.6, IRON]], 6, 0, 0, 0, {});
    B.cyl(0, 0.85, 0, 0.13, 0.13, 0.07, 6, IRON_L, {}); B.cyl(0, 2.5, 0, 0.15, 0.15, 0.06, 6, IRON_L, {});
    B.cyl(0, 2.6, 0, 0.23, 0.2, 0.06, 6, IRON, {});
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => B.box(a * 0.17, 2.66, b * 0.17, 0.045, 0.4, 0.045, IRON, { base: 0 }));
    B.pyr(0, 3.06, 0, 0.5, 0.26, IRON); B.blob(0, 3.36, 0, 0.065, 0.065, 0.065, IRON_L, IRON_L, { detail: 0 });
  });
  S.GLOW.box(x, gy + 2.67, z, 0.26, 0.38, 0.26, GLOWC, { base: 0, tint: 0, top: GLOWC, ry: 0 });
  S.lamps.push({ x, y: gy + 2.85, z });
  S.hit.circle(x, z, 0.32); S.soft(x, z, 0.75, 0.75, col('#3a2d5c'), 0.32, 0, gy + 0.04, 10);
}

// ---------------------------------------------------------------- park bench (faces +z locally)
export function bench(S, x, z, ry, o) {
  o = o || {}; const R = S.rand; put(S, x, z, ry, 1, (B) => {
    const W = 1.9, seatY = 0.46;
    for (let i = 0; i < 5; i++) B.box(0, seatY, 0.2 - i * 0.1, W, 0.045, 0.085, o.old && i === 2 ? mix(WOOD[2], col('#D9B889'), 0.5) : WOOD[(R() * 4) | 0], { tint: 0.06, base: 0.1 });
    for (let i = 0; i < 3; i++) B.push(0, 0.62 + i * 0.15, -0.27 - i * 0.045, 0, 1, -0.2), B.box(0, 0, 0, W, 0.12, 0.04, WOOD[(R() * 4) | 0], { tint: 0.06, base: 0.1 }), B.pop();
    [-0.82, 0.82].forEach((sx) => {
      B.box(sx, 0, 0.2, 0.06, seatY, 0.07, IRON, { base: 0.3 }); B.push(sx, 0, -0.27, 0, 1, -0.2); B.box(0, 0, 0, 0.06, 1.0, 0.07, IRON, { base: 0.3 }); B.pop();
      B.box(sx, seatY - 0.05, -0.28, 0.06, 0.06, 0.52, IRON, { base: 0 }); B.box(sx, 0.68, 0.18, 0.06, 0.05, 0.5, IRON, { base: 0 }); B.box(sx, 0.55, 0.24, 0.06, 0.15, 0.06, IRON, { base: 0 });
      B.box(sx, 0.64, 0.4, 0.075, 0.075, 0.1, IRON_L, { base: 0 }); B.box(sx, 0, 0.0, 0.1, 0.03, 0.62, IRON_D, { base: 0 });
    });
    B.box(0, 0.12, 0.2, 1.7, 0.04, 0.04, IRON, { base: 0.2 });
  });
  S.hit.box(x, z, 1.0, 0.45, ry); S.soft(x, z, 1.35, 0.8, col('#3a2d5c'), 0.3, -ry, S.hAt(x, z) + 0.04, 12);
}

// ---------------------------------------------------------------- stone pillar
export function pillar(S, x, z, s, o) {
  o = o || {}; const gy = put(S, x, z, o.ry || 0, s || 1, (B) => {
    const c = mix(STONE, col('#C9A98F'), 0.25);
    B.box(0, 0, 0, 0.78, 0.38, 0.78, mix(STONE_M, MOSS, 0.15), { base: 0.5, tint: 0.06 }); B.box(0, 0.38, 0, 0.6, 1.3, 0.6, c, { taper: 0.93, base: 0.25, tint: 0.07 });
    B.box(0, 1.66, 0, 0.74, 0.12, 0.74, STONE, { base: 0 }); B.pyr(0, 1.78, 0, 0.62, 0.32, mix(STONE_M, STONE, 0.5)); B.blob(0, 2.14, 0, 0.1, 0.1, 0.1, STONE_M, STONE, { detail: 0 });
    for (let i = 0; i < 3; i++) B.box((i - 1) * 0.16, 0.5, 0.31, 0.05, 0.35 + i * 0.1, 0.02, mix(STONE_D, MOSS, 0.4), { base: 0, tint: 0.1 });
    if (o.lantern) { B.cyl(0, 1.78, 0, 0.3, 0.26, 0.06, 8, IRON, {}); }
  });
  S.hit.circle(x, z, 0.42 * (s || 1)); S.soft(x, z, 0.8 * (s || 1), 0.8 * (s || 1), col('#3a2d5c'), 0.3, 0, gy + 0.04, 10);
  return gy;
}

// ---------------------------------------------------------------- iron fence, pillars and the gate
const FZ = 26.5, FX = 16.6, GATE = 1.9;
export function buildFence(S) {
  const B = S.B, R = S.rand, pil = [];
  // pillars
  [-16.6, -10.6, -5.6, 5.6, 10.6, 16.6].forEach((x) => pil.push([x, FZ])); [-24, -16, -8, 0, 8, 16, 24].forEach((z) => { pil.push([-FX, z]); pil.push([FX, z]); });
  pil.forEach(([x, z]) => pillar(S, x, z, 1, {}));
  pillar(S, -2.45, FZ, 1.3, { lantern: true }); pillar(S, 2.45, FZ, 1.3, { lantern: true });
  // gate pillar lanterns (glow)
  [-2.45, 2.45].forEach((x) => { const gy = S.hAt(x, FZ); S.GLOW.box(x, gy + 2.36, FZ, 0.3, 0.3, 0.3, GLOWC, { base: 0, tint: 0, top: GLOWC }); S.lamps.push({ x, y: gy + 2.5, z: FZ }); });
  // lines: [x0,z0,x1,z1]
  const lines = [[-FX, FZ, -GATE - 0.45, FZ], [GATE + 0.45, FZ, FX, FZ], [-FX, -25.4, -FX, FZ], [FX, -25.4, FX, FZ]];
  // pickets (instanced) + rails (merged)
  const P = new Buf({ rng: R }); P.box(0, 0, 0, 0.034, 1.02, 0.034, IRON, { base: 0.3, tint: 0.03 }); P.pyr(0, 1.02, 0, 0.06, 0.12, IRON_L); const pg = P.geometry(false);
  const spots = [];
  lines.forEach(([x0, z0, x1, z1]) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 0.3), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    for (let i = 0; i <= n; i++) { const x = x0 + dx * (i / n) * L, z = z0 + dz * (i / n) * L; if (pil.some((p) => Math.hypot(p[0] - x, p[1] - z) < 0.52) || (Math.abs(z - FZ) < 0.1 && Math.abs(x) < GATE + 2.0)) continue; spots.push([x, S.hAt(x, z), z]); }
    const seg = Math.max(1, Math.round(L / 1.1));
    for (let i = 0; i < seg; i++) { const xa = x0 + dx * (i / seg) * L, za = z0 + dz * (i / seg) * L, xb = x0 + dx * ((i + 1) / seg) * L, zb = z0 + dz * ((i + 1) / seg) * L, ha = S.hAt(xa, za), hb = S.hAt(xb, zb); if (Math.abs(za - FZ) < 0.1 && Math.abs(xa) < GATE + 2.0 && Math.abs(xb) < GATE + 2.0) continue; rail(B, [xa, ha + 0.9, za], [xb, hb + 0.9, zb], IRON_L); rail(B, [xa, ha + 0.26, za], [xb, hb + 0.26, zb], IRON); }
  });
  const im = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), spots.length); const dm = new THREE.Object3D(), cc = new THREE.Color();
  spots.forEach((p, i) => { dm.position.set(p[0], p[1], p[2]); dm.rotation.set((R() - 0.5) * 0.04, R() * 3, (R() - 0.5) * 0.04); dm.scale.set(1, 0.97 + R() * 0.06, 1); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); const k = 0.82 + R() * 0.4; cc.setRGB(k, k * (0.96 + R() * 0.08), k * (1 + R() * 0.12)); if (R() < 0.07) cc.setRGB(1.6, 1.3, 1.5); im.setColorAt(i, cc); });
  im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; S.group.add(im); S.fence = im;
  // collisions
  S.hit.box(-9.7, FZ, 8.0, 0.35, 0); S.hit.box(9.7, FZ, 8.0, 0.35, 0); S.hit.box(-FX, 0, 0.35, 28, 0); S.hit.box(FX, 0, 0.35, 28, 0);

  // ---- gate: open iron leaves swung inward, an arch with a sign and warm bulbs
  [-1, 1].forEach((sd) => { put(S, sd * (GATE + 0.05), FZ, sd > 0 ? -Math.PI / 2 + 0.2 : Math.PI / 2 - 0.2, 1, (b) => { leaf(b, sd > 0); }); S.hit.box(sd * 1.7, FZ - 0.8, 0.12, 0.8, 0); });
  const ay = 2.5, ar = GATE + 0.45, N = 18, bulbs = [];
  put(S, 0, FZ, 0, 1, (b) => {
    for (let i = 0; i < N; i++) { const a0 = (i / N) * Math.PI, a1 = ((i + 1) / N) * Math.PI, p0 = [Math.cos(a0) * ar, ay + Math.sin(a0) * 1.7], p1 = [Math.cos(a1) * ar, ay + Math.sin(a1) * 1.7];
      [-0.06, 0.06].forEach((zz) => rail2(b, [p0[0], p0[1], zz], [p1[0], p1[1], zz], 0.09, IRON)); if (i % 3 === 1) { b.box(p0[0], p0[1] - 0.2, 0, 0.04, 0.3, 0.04, IRON_L, { base: 0 }); } if (i % 2 === 0 && i > 0) bulbs.push([p0[0], p0[1] - 0.12]); }
    // sign plate hanging from the arch
    b.box(0, ay + 1.7 - 0.95, -0.03, 2.5, 0.62, 0.07, IRON_D, { base: 0 }); b.box(-0.9, ay + 1.7 - 0.36, -0.03, 0.04, 0.34, 0.04, IRON_L, { base: 0 }); b.box(0.9, ay + 1.7 - 0.36, -0.03, 0.04, 0.34, 0.04, IRON_L, { base: 0 });
  });
  const gyG = S.hAt(0, FZ); S.decal('gate', 0, gyG + ay + 1.7 - 0.64, FZ + 0.012, 2.4, 0.6, 0, 0, [1.25, 1.25, 1.25], 0); S.decal('gate', 0, gyG + ay + 1.7 - 0.64, FZ - 0.078, 2.4, 0.6, Math.PI, 0, [1.25, 1.25, 1.25], 0);
  bulbs.forEach(([bx, by], i) => S.GLOW.box(bx - 0.04, gyG + by - 0.04, FZ - 0.04, 0.08, 0.08, 0.08, [[2.6, 1.7, 0.7], [2.6, 0.6, 1.3], [0.5, 2.0, 2.4]][i % 3], { base: 0, tint: 0, top: [2.6, 1.7, 0.7] }));
  S.anchors.gateArch = { x: 0, z: FZ, y: ay + 1.7 + gyG };
  S.hit.box(-2.45, FZ, 0.55, 0.55, 0); S.hit.box(2.45, FZ, 0.55, 0.55, 0);
}
function rail(B, a, b, c) { rail2(B, a, b, 0.045, c, 0.05); }
// bar between two 3D points (horizontal width w, height h)
function rail2(B, a, b, w, c, h) {
  h = h || w; const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1e-6, nx = (-dz / l) * (w / 2), nz = (dx / l) * (w / 2), up = h;
  const p = (P, s, u) => [P[0] + nx * s, P[1] + (u ? up : 0), P[2] + nz * s], hi = [c[0] * 1.12, c[1] * 1.12, c[2] * 1.12];
  B.quad(p(a, 1, 1), p(b, 1, 1), p(b, -1, 1), p(a, -1, 1), hi); B.quad(p(a, 1, 0), p(b, 1, 0), p(b, 1, 1), p(a, 1, 1), c); B.quad(p(b, -1, 0), p(a, -1, 0), p(a, -1, 1), p(b, -1, 1), c);
}
// one gate leaf, hinged at the origin and extending along local +x
function leaf(B, flip) {
  const L = 1.6; B.box(0.03, 0.08, 0, 0.07, 1.25, 0.07, IRON, { base: 0.2 }); B.box(L, 0.08, 0, 0.07, 1.25, 0.07, IRON, { base: 0.2 }); B.box(L / 2, 0.08, 0, L, 0.06, 0.06, IRON, { base: 0 }); B.box(L / 2, 1.2, 0, L, 0.06, 0.06, IRON_L, { base: 0 });
  for (let i = 1; i < 7; i++) { const x = (i / 7) * L; B.box(x, 0.1, 0, 0.032, 1.15, 0.032, IRON, { base: 0.1 }); B.pyr(x, 1.25, 0, 0.055, 0.1, IRON_L); }
  B.cyl(L * 0.5, 0.45, 0, 0.3, 0.3, 0.03, 8, IRON, { rx: 0 }); B.box(L * 0.5, 0.45, 0, 0.5, 0.04, 0.04, IRON_L, { base: 0 });
}

// ---------------------------------------------------------------- placement of lamps
export function placeLamps(S, F) {
  const spots = [];
  spots.push([-2.5, 21.6], [2.5, 13.6], [-2.45, 6.4 + 0.0]); // main avenue (last one hugs the plaza)
  [40, 140, 330, 222].forEach((d) => { const a = (d * Math.PI) / 180; spots.push([Math.cos(a) * 7.0, Math.sin(a) * 7.0]); });
  spots.push([2.4, -11.2], [-2.5, -17.8], [-2.2, -22.4], [9.8, 1.9], [6.4, 11.7], [5.0, -5.6]);
  const loop = F.loop, step = 11.5; for (let s = 6; s < loop.len; s += step) { const i = Math.min(loop.length - 1, Math.round((s / loop.len) * loop.length)), c = loop[i], n = [c.tz, -c.tx], sg = n[0] * c.x + n[1] * c.z > 0 ? 1 : -1; spots.push([c.x + sg * n[0] * 2.4, c.z + sg * n[1] * 2.4]); }
  const others = []; F.paths.forEach((p) => curve(p.pts, false, 0.9).forEach((q) => others.push({ x: q.x, z: q.z })));
  const placed = [];
  spots.forEach(([x, z]) => {
    if (Math.abs(x) > 15.2 || z > 24.8 || z < -23.2) return; if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 4.5)) return;
    if (S.hit.test(x, z)) return; if (z > 17.5 && Math.abs(x) < 6 && Math.abs(x) > 3.3 && false) return;
    placed.push([x, z]); lampPost(S, x, z);
  });
  return placed.length;
}
