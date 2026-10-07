// Flat3D entry and hall (Interior Artist): door leaf art, entry mat, shoe rack, hall tree with jackets, skateboard, wellness corner, runner, tall plant.
import { P, mix, mul, bar, plant, WARM } from './flat_kit.js';
import { sneaker } from './flat_living.js';

export function buildEntry(S) {
  const B = S.B, G = S.GLOW, hit = S.hit;
  // door leaf painted (decal on the face the camera sees)
  if (S.leaf) { const L = S.leaf, nx = Math.sin(L.ry), nz = Math.cos(L.ry); S.decal('door', L.x + nx * 0.028, 1.03, L.z + nz * 0.028, L.dw - 0.05, 1.96, L.ry, 0, [1.05, 1.05, 1.05]); }
  // entry mat and a hallway runner
  B.box(5.5, 0, 4.45, 1.0, 0.014, 0.58, mix(P.terracotta, P.ink, 0.2), { base: 0.2, tint: 0.03, ry: 0.06 }); S.decal('mat', 5.5, 0.0155, 4.45, 0.92, 0.5, 0.06, -Math.PI / 2, [1, 1, 1]);
  S.decal('runner', 4.95, 0.0165, 2.1, 0.8, 1.9, 0.0, -Math.PI / 2, [1, 1, 1]); B.box(4.95, 0, 2.1, 0.86, 0.015, 1.96, P.creamD, { base: 0.3, tint: 0 });
  // shoe rack along the east wall (three tiers of sneakers)
  { const x = 7.12, z = 4.0, len = 1.4; S.soft(x - 0.1, z, 0.5, len / 2 + 0.2, 0.4);
    [0.02, 0.28, 0.54].forEach((y, r) => { B.box(x, y, z, 0.38, 0.03, len, P.woodL, { base: 0.2, tint: 0.04 }); for (let i = 0; i < 4; i++) { const p = [[P.cream, P.pink, P.ink], [P.ink, P.cyan, P.cream], [P.yellow, P.cream, P.ink], [P.denim, P.cream, P.red], [P.coral, P.cream, P.ink]][(i + r * 2) % 5]; sneaker(B, x + 0.0, y + 0.03, z - len / 2 + 0.26 + i * 0.34, -Math.PI / 2 + (i % 2 ? 0.1 : -0.05), p[0], p[1], p[2]); } });
    [[-1], [1]].forEach(([s]) => { B.box(x, 0, z + s * (len / 2 - 0.03), 0.38, 0.6, 0.04, P.woodD, { base: 0.3 }); });
    B.lathe([[0.1, 0, P.mustard], [0.12, 0.04, mix(P.mustard, P.cream, 0.2)], [0.0, 0.03, P.ink]], 8, x, 0.57, z - 0.5, {}); B.box(x, 0.6, z - 0.5, 0.03, 0.012, 0.015, P.steelL, { base: 0 });
    hit.box(x, z, 0.22, len / 2 + 0.03, 0); }
  // hall tree west of the door
  { const hx = 4.35, hz = 5.0; S.soft(hx, hz, 0.45, 0.4, 0.4); B.cyl(hx, 0, hz, 0.22, 0.22, 0.04, 8, P.woodD); B.cyl(hx, 0.04, hz, 0.03, 0.03, 1.7, 6, P.woodD);
    for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.4; bar(B, [hx, 1.62, hz], [hx + Math.cos(a) * 0.22, 1.7, hz + Math.sin(a) * 0.22], 0.025, 0.025, P.woodL); }
    B.box(hx - 0.2, 1.0, hz, 0.1, 0.65, 0.36, P.denim, { base: 0.1, tint: 0.05, taper: 0.9 }); B.box(hx - 0.2, 1.22, hz + 0.0, 0.11, 0.1, 0.38, P.denimD, { base: 0 }); // denim jacket
    B.box(hx + 0.15, 0.95, hz + 0.1, 0.1, 0.7, 0.34, P.yellow, { base: 0.1, tint: 0.05, taper: 0.9 }); B.box(hx + 0.0, 0.98, hz - 0.2, 0.3, 0.38, 0.06, P.cream, { base: 0.1, tint: 0.03 }); // bomber and tote
    B.blob(hx + 0.18, 1.62, hz - 0.15, 0.12, 0.08, 0.12, P.ink, P.inkL, { detail: 1, jit: 0.1 }); B.box(hx + 0.28, 1.58, hz - 0.15, 0.1, 0.01, 0.1, P.ink, { base: 0 }); // cap
    hit.circle(hx, hz, 0.3); }
  // skateboard leaning on the east low wall, a wellness corner (rolled mat, dumbbells, kettlebell)
  { B.push(7.38, 0.05, 2.7, 0, 1, 0, 0.18); B.box(0, 0, 0, 0.03, 0.82, 0.21, P.pink, { base: 0.1, tint: 0.04, top: P.teal }); [[0.06, 0.06], [0.06, 0.76]].forEach(([a, y]) => { B.box(-0.045, y - 0.02, -0.05, 0.05, 0.05, 0.04, P.yellow, { base: 0 }); B.box(-0.045, y - 0.02, 0.05, 0.05, 0.05, 0.04, P.yellow, { base: 0 }); }); B.pop(); }
  { const mx = 6.85, mz = 1.5; S.soft(mx, mz, 0.5, 0.4, 0.3); B.push(mx, 0.12, mz, 0.35, 1, 0, Math.PI / 2); B.lathe([[0.12, 0, P.teal], [0.12, 0.62, P.tealL], [0, 0.62, mix(P.teal, P.cream, 0.4)]], 10, 0, 0, 0, {}); B.pop();
    [0, 1].forEach((i) => { const dx = 6.5, dz = 1.25 + i * 0.25; B.box(dx, 0, dz, 0.3, 0.07, 0.07, P.ink, { base: 0 }); B.box(dx - 0.14, 0, dz, 0.07, 0.1, 0.1, P.ink, { base: 0 }); B.box(dx + 0.14, 0, dz, 0.07, 0.1, 0.1, P.ink, { base: 0 }); });
    B.blob(6.3, 0.12, 1.65, 0.1, 0.1, 0.1, P.coralD, P.coral, { detail: 1, jit: 0.04 }); B.cyl(6.3, 0.19, 1.65, 0.03, 0.03, 0.05, 6, P.coralD); hit.box(6.6, 1.45, 0.5, 0.35, 0); }
  plant(S, 7.0, 0, 0.2, 'fiddle', 1.25, { pot: P.cream, pr: 0.25, ph: 0.34 }); S.soft(7.0, 0.2, 0.5, 0.5, 0.35); hit.circle(7.0, 0.2, 0.3);
  S.anchors.start = { x: 4.3, z: 2.2, rot: Math.PI }; S.anchors.doorSpot = { x: 5.5, z: 4.35, rot: 0 }; S.anchors.door = S.anchors.doorSpot;
}
