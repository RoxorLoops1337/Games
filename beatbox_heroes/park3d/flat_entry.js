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
  extras(S);
  S.anchors.start = { x: 4.3, z: 2.2, rot: Math.PI }; S.anchors.doorSpot = { x: 5.5, z: 4.35, rot: 0 }; S.anchors.door = S.anchors.doorSpot;
}

// lived-in extras: bike, clothes airer, pouf, boombox on a crate, record clock, switches, wall grime, kicked-off sneakers
function extras(S) {
  const B = S.B, G = S.GLOW, hit = S.hit, R = S.rand;
  const ring = (cx, cy, cz, r, n, w, c, rimc) => { for (let i = 0; i < n; i++) { const a0 = (i / n) * 6.283, a1 = ((i + 1) / n) * 6.283; bar(B, [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cz], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cz], w, w, c); } };
  // fixie bike leaning on the south wall
  { const bx = -0.9, bz = 5.12; S.soft(bx, bz - 0.05, 0.95, 0.3, 0.3); B.push(bx, 0, bz, 0, 1, 0.2);
    ring(-0.55, 0.34, 0, 0.33, 14, 0.04, P.ink); ring(-0.55, 0.34, 0, 0.29, 12, 0.014, P.steelL); ring(0.55, 0.34, 0, 0.33, 14, 0.04, P.ink); ring(0.55, 0.34, 0, 0.29, 12, 0.014, P.steelL);
    const fr = P.cyan; bar(B, [-0.55, 0.34, 0], [-0.1, 0.34, 0], 0.03, 0.03, fr); bar(B, [-0.1, 0.34, 0], [0.18, 0.8, 0], 0.03, 0.03, fr); bar(B, [-0.55, 0.34, 0], [0.0, 0.76, 0], 0.03, 0.03, fr); bar(B, [0.0, 0.76, 0], [0.18, 0.8, 0], 0.03, 0.03, fr); bar(B, [0.0, 0.76, 0], [0.55, 0.34, 0], 0.03, 0.03, fr); bar(B, [0.18, 0.8, 0], [0.52, 0.86, 0], 0.03, 0.03, fr); bar(B, [0.52, 0.86, 0], [0.55, 0.34, 0], 0.03, 0.03, fr);
    B.box(0.0, 0.74, -0.06, 0.2, 0.04, 0.1, P.ink, { base: 0 }); bar(B, [0.52, 0.86, -0.18], [0.52, 0.86, 0.18], 0.025, 0.025, P.ink); B.box(-0.1, 0.0, 0.0, 0.05, 0.03, 0.12, P.pink, { base: 0 }); B.pop(); }
  // clothes airer with a few things drying (the flat is small)
  { const ax = 2.0, az = 3.55; S.soft(ax, az, 0.7, 0.45, 0.3);
    [-0.45, 0.45].forEach((dx) => { bar(B, [ax + dx, 0.95, az - 0.22], [ax + dx - 0.05, 0, az - 0.3], 0.03, 0.03, P.woodL); bar(B, [ax + dx, 0.95, az + 0.22], [ax + dx - 0.05, 0, az + 0.3], 0.03, 0.03, P.woodL); bar(B, [ax + dx, 0.95, az - 0.22], [ax + dx, 0.95, az + 0.22], 0.03, 0.03, P.woodL); });
    [-0.14, 0, 0.14].forEach((dz) => bar(B, [ax - 0.45, 0.95, az + dz], [ax + 0.45, 0.95, az + dz], 0.02, 0.02, P.steelL));
    [[-0.3, P.pink, 0.3], [-0.1, P.tealL, 0.34], [0.12, P.yellow, 0.28], [0.32, P.denim, 0.36]].forEach(([dx, c, h]) => { B.box(ax + dx, 0.95 - h, az, 0.2, h, 0.32, c, { base: 0, tint: 0.05, taper: 0.9 }); }); hit.box(ax, az, 0.5, 0.32, 0); }
  // central boho rug with two floor cushions
  { const rx = 1.0, rz = 1.45; B.box(rx, 0, rz, 2.8, 0.016, 1.5, P.cream, { base: 0.5, tint: 0 }); S.decal('rug3', rx, 0.0172, rz, 2.76, 1.46, 0, -Math.PI / 2, [1, 1, 1]);
    [[0.2, 2.05, P.coral, 0.4], [1.75, 2.05, P.violet, -0.5]].forEach(([cx, cz, c, ry]) => { B.box(cx, 0.016, cz, 0.55, 0.12, 0.55, c, { base: 0.1, tint: 0.04, taper: 0.9, ry }); B.box(cx, 0.136, cz, 0.3, 0.015, 0.3, mix(c, P.cream, 0.4), { base: 0, ry }); S.soft(cx, cz, 0.45, 0.45, 0.3); hit.box(cx, cz, 0.28, 0.28, ry); }); }
  // pouf
  { const px = -1.0, pz = -0.3; S.soft(px, pz, 0.45, 0.45, 0.35); B.lathe([[0.26, 0, P.pink], [0.31, 0.14, mix(P.pink, P.pinkL, 0.3)], [0.28, 0.32, P.pinkL], [0.12, 0.36, mix(P.pinkL, P.cream, 0.4)], [0, 0.35, P.pinkL]], 8, px, 0, pz, {}); hit.circle(px, pz, 0.32); }
  // milk crate with a boombox
  { const cx = -1.6, cz = -4.5; S.soft(cx, cz, 0.5, 0.4, 0.35); B.box(cx, 0, cz, 0.42, 0.3, 0.34, P.coralD, { base: 0.3, tint: 0.04, top: mix(P.coralD, P.ink, 0.4) }); B.box(cx, 0.3, cz, 0.44, 0.03, 0.36, P.coral, { base: 0 });
    B.box(cx, 0.33, cz, 0.56, 0.3, 0.2, P.ink, { base: 0.1, tint: 0.02, top: P.inkL }); [-1, 1].forEach((s) => { B.push(cx + s * 0.16, 0.48, cz + 0.101, 0, 1, Math.PI / 2); B.lathe([[0.09, 0, P.black], [0.085, 0.01, P.inkL], [0.03, -0.015, P.orange], [0, -0.01, P.yellow]], 9, 0, 0, 0, {}); B.pop(); }); B.box(cx, 0.52, cz + 0.101, 0.14, 0.07, 0.012, P.steel, { base: 0 }); G.box(cx - 0.03, 0.535, cz + 0.108, 0.06, 0.02, 0.006, [1.0, 2.6, 0.8], { base: 0, tint: 0 }); bar(B, [cx - 0.2, 0.63, cz], [cx + 0.2, 0.7, cz], 0.02, 0.02, P.steelL); hit.box(cx, cz, 0.3, 0.2, 0); }
  // kicked-off sneakers near the door
  sneaker(B, 5.0, 0.0, 3.95, 2.6, P.cream, P.red, P.ink); sneaker(B, 4.72, 0.0, 3.62, 3.6, P.cream, P.red, P.ink);
  // a vinyl sleeve and a tape on the floor, a crumpled flyer
  S.decal('rec4', 1.2, 0.019, 0.9, 0.3, 0.3, 0.5, -Math.PI / 2, [1, 1, 1]); B.box(1.2, 0, 0.9, 0.31, 0.014, 0.31, P.ink, { base: 0, ry: 0.5 }); S.decal('tape1', 3.1, 0.017, 1.5, 0.1, 0.066, 1.0, -Math.PI / 2, [1, 1, 1]); B.box(3.1, 0, 1.5, 0.1, 0.014, 0.066, P.ink, { base: 0, ry: 1.0 });
  B.blob(0.3, 0.04, 2.2, 0.06, 0.05, 0.06, P.cream, P.paper, { detail: 0, jit: 0.2 });
  // record clock on the west wall
  { B.push(-7.46, 2.2, -1.45, 0, 1, 0, -Math.PI / 2); B.lathe([[0.18, 0, P.ink], [0.18, 0.02, P.inkL], [0.075, 0.02, P.yellow], [0, 0.024, P.cream]], 12, 0, 0, 0, {}); B.pop(); B.box(-7.43, 2.2, -1.45, 0.012, 0.011, 0.012, P.ink, { base: 0 }); bar(B, [-7.425, 2.2, -1.45], [-7.425, 2.3, -1.4], 0.012, 0.012, P.ink); bar(B, [-7.425, 2.2, -1.45], [-7.425, 2.18, -1.36], 0.012, 0.012, P.ink); }
  // light switches and sockets
  const plate = (x, y, z, ry) => { B.box(x, y, z, 0.085, 0.085, 0.012, P.cream, { base: 0, ry: ry || 0 }); };
  plate(1.95, 1.2, -5.49, 0); B.box(1.95, 1.19, -5.48, 0.02, 0.04, 0.012, P.ink, { base: 0 }); plate(-5.4, 0.3, -5.49); plate(-1.15, 0.3, -5.49); plate(5.0, 0.3, 4.9, 0); plate(2.65, 1.1, -5.49);
  B.box(-7.49, 0.3, 4.8, 0.012, 0.085, 0.085, P.cream, { base: 0 }); B.box(-7.49, 0.3, -0.2, 0.012, 0.085, 0.085, P.cream, { base: 0 });
  // wall grime and warm smudges (soft decals), soot above the hob, water streaks under windows
  S.softOn(2.35, 1.2, -5.48, 0, 0.5, 0.3, 0.2); S.softOn(-4.0, 1.1, -5.48, 0, 0.9, 0.35, 0.12); S.softOn(5.0, 0.3, 4.92, 0, 0.6, 0.18, 0.14); S.softOn(-7.48, 0.5, 3.2, Math.PI / 2, 0.8, 0.2, 0.12); S.softOn(1.95, 1.3, -5.48, 0, 0.12, 0.2, 0.25); S.softOn(3.45, 1.0, -5.48, 0, 0.6, 0.2, 0.12); S.softOn(-0.25, 0.9, -5.48, 0, 1.2, 0.2, 0.1);
  // floor scuffs near the door and the kitchen threshold
  S.soft(5.3, 3.9, 0.7, 0.5, 0.12); S.soft(3.2, -0.2, 0.8, 0.4, 0.1); S.soft(-0.2, -3.0, 0.9, 0.5, 0.1);
}
