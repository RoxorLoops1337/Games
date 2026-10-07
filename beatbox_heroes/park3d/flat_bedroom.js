// Flat3D bedroom corner and wardrobe (Interior Artist): bed with patchwork blanket, nightstand lamp, laundry pile and basket, plants on the half wall,
// wardrobe with an open door and a full-length mirror, a shag rug.
import { P, mix, mul, bar, plant, pot, leaf, WARM, WARMS } from './flat_kit.js';

export function buildBedroom(S) {
  const B = S.B, G = S.GLOW, hit = S.hit, R = S.rand;

  // ---------------------------------------------------------------- bed (head on the west wall under the window)
  { const bz = 3.15, x0 = -7.5, len = 2.1, wd = 1.55, fx = x0 + len, wood = mix(P.woodD, P.plumD, 0.3);
    S.soft(-6.4, bz, 1.4, 1.1, 0.5);
    B.box(x0 + 0.06, 0, bz, 0.1, 1.05, wd + 0.1, wood, { base: 0.3, tint: 0.03 }); for (let i = 0; i < 5; i++) B.box(x0 + 0.1, 0.5 + 0.1 * i + 0.1, bz - 0.55 + i * 0.275 - 0.0, 0.05, 0.001, 0.001, wood, { base: 0 }); // headboard
    for (let i = 0; i < 4; i++) B.box(x0 + 0.12, 0.62, bz - 0.57 + i * 0.38, 0.03, 0.4, 0.2, mix(wood, P.mustardD, 0.3), { base: 0.2, tint: 0.04 }); // slats
    B.box(fx - 0.04, 0, bz, 0.08, 0.5, wd + 0.06, wood, { base: 0.3, tint: 0.03 }); // footboard
    B.box(x0 + len / 2, 0.14, bz, len - 0.1, 0.16, wd, mix(wood, P.ink, 0.15), { base: 0.4 }); [[0.05, -1], [0.05, 1], [len - 0.1, -1], [len - 0.1, 1]].forEach(([dx, s]) => B.box(x0 + dx, 0, bz + s * (wd / 2 - 0.04), 0.07, 0.14, 0.07, P.woodD, { base: 0.1 }));
    B.box(x0 + len / 2 + 0.02, 0.28, bz, len - 0.16, 0.26, wd - 0.04, P.cream, { base: 0.2, tint: 0.02, taper: 0.97, top: mix(P.cream, P.paper, 0.4) }); // mattress
    // patchwork blanket over the lower two thirds
    const bx0 = x0 + 0.78, bx1 = fx - 0.05, pw = (bx1 - bx0) / 3, ph = (wd - 0.02) / 3, pc = [P.teal, P.pink, P.mustard, P.violet, P.tealL, P.coral, P.indigoL, P.teal, P.pinkL];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) B.box(bx0 + pw * (i + 0.5), 0.54, bz - wd / 2 + 0.01 + ph * (j + 0.5), pw - 0.004, 0.06 + ((i + j) % 2) * 0.005, ph - 0.004, pc[(i * 3 + j * 2 + i) % 9], { base: 0.05, tint: 0.05, taper: 0.97 });
    [-1, 1].forEach((s) => { for (let i = 0; i < 3; i++) { const xa = bx0 + pw * i, xb = bx0 + pw * (i + 1), z = bz + s * (wd / 2 + 0.01), c = pc[(i * 3 + (s > 0 ? 2 : 0) + i * 2) % 9]; if (s > 0) B.quad([xa, 0.28, z], [xb, 0.28, z], [xb, 0.57, z], [xa, 0.57, z], mul(c, 0.7), mul(c, 0.7), c, c); else B.quad([xb, 0.28, z], [xa, 0.28, z], [xa, 0.57, z], [xb, 0.57, z], mul(c, 0.7), mul(c, 0.7), c, c); } });
    B.quad([fx - 0.01, 0.3, bz - wd / 2], [fx - 0.01, 0.3, bz + wd / 2], [fx - 0.01, 0.56, bz + wd / 2], [fx - 0.01, 0.56, bz - wd / 2], mul(P.teal, 0.75));
    // pillows and a hoodie thrown on top
    B.box(x0 + 0.42, 0.54, bz - 0.38, 0.5, 0.15, 0.36, P.cream, { base: 0.05, taper: 0.9, tint: 0.03, ry: 0.1 }); B.box(x0 + 0.4, 0.54, bz + 0.34, 0.5, 0.15, 0.36, P.pinkL, { base: 0.05, taper: 0.9, tint: 0.03, ry: -0.08 }); B.box(x0 + 0.5, 0.67, bz - 0.34, 0.4, 0.1, 0.3, mix(P.cream, P.creamD, 0.3), { base: 0, taper: 0.9, ry: 0.15, rz: -0.1 });
    B.box(x0 + 1.0, 0.6, bz + 0.1, 0.5, 0.05, 0.38, P.yellow, { base: 0, tint: 0.05, ry: 0.5 }); B.box(x0 + 0.95, 0.64, bz - 0.0, 0.3, 0.04, 0.12, mix(P.yellow, P.orange, 0.3), { base: 0, ry: 0.9 });
    hit.box(x0 + len / 2, bz, len / 2 + 0.02, wd / 2 + 0.03, 0);
    S.anchors.bedSpot = { x: fx + 0.4, z: bz, rot: -Math.PI / 2, seatY: 0.54 };
  }

  // ---------------------------------------------------------------- nightstand with a glowing lamp
  { const nx = -7.2, nz = 4.4; S.soft(nx, nz, 0.5, 0.5, 0.4);
    B.box(nx, 0.08, nz, 0.5, 0.42, 0.44, mix(P.mustardD, P.woodD, 0.4), { base: 0.35, tint: 0.04, top: P.woodL }); [[-0.2, -0.17], [0.2, -0.17], [-0.2, 0.17], [0.2, 0.17]].forEach(([dx, dz]) => B.box(nx + dx, 0, nz + dz, 0.05, 0.1, 0.05, P.woodD, { base: 0.1, taper: 0.7 }));
    B.box(nx + 0.23, 0.28, nz, 0.02, 0.18, 0.38, mix(P.mustard, P.cream, 0.2), { base: 0, tint: 0.03 }); B.box(nx + 0.25, 0.37, nz, 0.03, 0.03, 0.08, P.steel, { base: 0 }); B.box(nx + 0.23, 0.14, nz, 0.02, 0.1, 0.38, mix(P.mustard, P.cream, 0.1), { base: 0, tint: 0.03 });
    const ty = 0.5; B.lathe([[0.07, 0, P.teal], [0.085, 0.05, P.tealL], [0.03, 0.22, P.teal], [0.03, 0.26, P.steelD]], 8, nx - 0.08, ty, nz - 0.08, {}); G.lathe([[0.1, 0.0, WARMS], [0.15, 0.06, WARM], [0.1, 0.2, WARM]], 8, nx - 0.08, ty + 0.25, nz - 0.08, {}); B.lathe([[0.1, 0.2, WARMS], [0.0, 0.2, WARMS]], 8, nx - 0.08, ty + 0.25, nz - 0.08, {});
    B.box(nx + 0.1, ty, nz + 0.08, 0.14, 0.07, 0.07, P.ink, { base: 0.1, ry: 0.3 }); G.box(nx + 0.07, ty + 0.045, nz + 0.115, 0.07, 0.02, 0.012, [3.0, 0.4, 0.4], { base: 0, tint: 0, ry: 0.0 }); // alarm clock
    B.box(nx + 0.12, ty, nz - 0.12, 0.17, 0.035, 0.12, P.coral, { base: 0, ry: -0.3 }); B.box(nx + 0.12, ty + 0.035, nz - 0.12, 0.15, 0.03, 0.11, P.cream, { base: 0, ry: -0.2 }); B.lathe([[0.03, 0, mix(P.glassG, P.cream, 0.5)], [0.035, 0.1, mix(P.glassG, P.cream, 0.6)], [0, 0.1, P.cream]], 7, nx + 0.0, ty, nz + 0.12, {});
    S.lights.push({ x: nx - 0.08, y: 1.0, z: nz - 0.08, color: '#ffb867', r: 5, i: 0.9, kind: 'lamp' });
    hit.box(nx, nz, 0.27, 0.24, 0);
  }

  // ---------------------------------------------------------------- laundry: basket and a pile, plus plants on the half wall and a rag rug
  { const lx = -4.5, lz = 4.85; S.soft(lx, lz, 0.6, 0.5, 0.4);
    B.lathe([[0.22, 0, P.woodD], [0.28, 0.05, P.woodL], [0.3, 0.42, P.pine], [0.28, 0.42, P.woodD], [0.0, 0.3, P.woodD]], 10, lx, 0, lz, {}); for (let k = 0; k < 4; k++) B.box(lx, 0.07 + k * 0.09, lz, 0.6, 0.02, 0.6, P.woodD, { base: 0, ry: 0.78, tint: 0.02 }); // woven bands (approx)
    [[0, 0.46, 0, P.yellow], [0.1, 0.48, 0.07, P.denim], [-0.1, 0.5, 0.0, P.pinkL], [0.04, 0.54, -0.1, P.tealL]].forEach(([dx, y, dz, c]) => B.blob(lx + dx, y, lz + dz, 0.19, 0.1, 0.17, mix(c, P.ink, 0.3), c, { detail: 1, jit: 0.2 }));
    bar(B, [lx + 0.25, 0.5, lz + 0.1], [lx + 0.5, 0.05, lz + 0.35], 0.12, 0.05, P.denimD);
    B.blob(lx + 0.72, 0.1, lz + 0.2, 0.28, 0.1, 0.22, mix(P.coral, P.ink, 0.3), P.coral, { detail: 1, jit: 0.25 }); B.blob(lx + 0.6, 0.14, lz - 0.1, 0.2, 0.09, 0.17, mix(P.cream, P.ink, 0.2), P.cream, { detail: 1, jit: 0.25 }); B.blob(lx + 0.95, 0.07, lz + 0.35, 0.16, 0.06, 0.12, mix(P.violet, P.ink, 0.25), P.violet, { detail: 1, jit: 0.2 }); B.box(lx + 0.5, 0.0, lz + 0.55, 0.12, 0.02, 0.05, P.cream, { base: 0, ry: 0.5 }); B.box(lx + 0.58, 0.0, lz + 0.57, 0.12, 0.02, 0.05, P.pink, { base: 0, ry: 0.2 });
    hit.circle(lx, lz, 0.32); hit.circle(lx + 0.75, lz + 0.15, 0.32); }
  plant(S, -6.3, 1.05, 1.6, 'trail', 0.9, { pot: P.mustard, pr: 0.14, ph: 0.2 }); plant(S, -5.2, 1.05, 1.6, 'fern', 0.8, { pot: P.terracotta, pr: 0.16, ph: 0.22 }); B.box(-4.5, 1.09, 1.6, 0.4, 0.15, 0.1, P.violet, { base: 0, ry: 0.0 }); B.box(-4.45, 1.24, 1.6, 0.28, 0.12, 0.1, P.coral, { base: 0, ry: 0.1 });
  plant(S, -3.95, 0, 5.05, 'snake', 1.1, { pot: P.cream, pr: 0.2, ph: 0.3 }); hit.circle(-3.95, 5.05, 0.24); S.soft(-3.95, 5.05, 0.4, 0.4, 0.35);
  S.decal('rug2', -6.0, 0.0235, 4.1, 0.8, 0.8, 0, -Math.PI / 2, [1, 1, 1]);
  B.box(-7.4, 1.9, 4.5, 0.04, 0.34, 0.9, P.woodL, { base: 0.1 }); // wall shelf with books and a plant (west wall)
  B.box(-7.3, 1.9, 4.5, 0.2, 0.03, 0.9, P.woodL, { base: 0 }); S.decal('spines', -7.28, 2.0, 4.5, 0.6, 0.12, Math.PI / 2, 0, [1, 1, 1]); plant(S, -7.3, 1.93, 4.9, 'herb', 0.6, { pot: P.pink, pr: 0.07, ph: 0.09 });
  S.decal('photos', -7.49, 1.6, 4.5, 0.55, 0.28, Math.PI / 2, 0, [1, 1, 1]);

  // ---------------------------------------------------------------- wardrobe (west wall, one door open) and the full-length mirror
  { const wx = -7.5 + 0.34, wz = -3.0, W = 1.8, D = 0.68, Hh = 2.12, c = mix(P.tealD, P.teal, 0.4);
    S.soft(wx + 0.1, wz, 0.6, 1.1, 0.4);
    B.box(wx, 0, wz, D, Hh, W, mix(P.woodD, P.plumD, 0.5), { base: 0.3, tint: 0.03, top: P.wood[1] }); // carcass seen from the open door side
    B.box(wx - 0.05, 0.1, wz, D - 0.1, 0.01, W - 0.1, P.ink, { base: 0 });
    const fx = wx + D / 2 + 0.012;
    // doors: south door closed, north door ajar
    B.box(fx, 0.06, wz + W / 4, 0.024, Hh - 0.1, W / 2 - 0.03, c, { base: 0.1, tint: 0.03 }); B.box(fx + 0.014, 0.24, wz + W / 4, 0.012, Hh - 0.56, W / 2 - 0.2, mix(c, P.cream, 0.08), { base: 0, tint: 0.03 }); B.box(fx + 0.03, 1.0, wz + 0.06, 0.025, 0.22, 0.025, P.steelL, { base: 0 });
    { const hx = fx, hz = wz - W / 2 + 0.015, a = 1.15, lw = W / 2 - 0.03; B.box(hx + Math.sin(a) * lw / 2, 0.06, hz + Math.cos(a) * lw / 2, 0.024, Hh - 0.1, lw, c, { ry: a, base: 0.1, tint: 0.03 }); }
    // hanging clothes inside (north half) and shoes below
    bar(B, [wx - 0.1, 1.85, wz - W / 2 + 0.06], [wx - 0.1, 1.85, wz + W / 2 - 0.06], 0.02, 0.02, P.steelL);
    [[P.yellow, 0.28], [P.coral, 0.25], [P.denim, 0.3], [P.pink, 0.22], [P.violet, 0.26], [P.cream, 0.24], [P.teal, 0.28]].forEach(([cc, w], i) => { const zz = wz - W / 2 + 0.16 + i * 0.12; B.box(wx - 0.08, 0.95, zz, 0.45, 0.95 - (i % 2) * 0.2, 0.08, cc, { base: 0.1, tint: 0.05, taper: 0.92 }); B.box(wx - 0.08, 1.82, zz, 0.03, 0.06, 0.03, P.steelD, { base: 0 }); void w; });
    [[-0.28, P.cream], [0.0, P.red], [0.28, P.cyan]].forEach(([dz, cc], i) => sneakerLite(B, wx + 0.02, 0.1, wz - 0.5 + dz * 0.4 + i * 0.1, cc));
    // stacked hat boxes and a rolled blanket on top
    B.box(wx, Hh, wz - 0.4, 0.5, 0.2, 0.4, P.mustard, { base: 0.1, tint: 0.04 }); B.box(wx, Hh + 0.2, wz - 0.4, 0.4, 0.16, 0.34, P.pinkL, { base: 0.1, tint: 0.04, ry: 0.1 }); B.box(wx, Hh, wz + 0.35, 0.5, 0.26, 0.5, P.cream, { base: 0.1, tint: 0.04 }); B.lathe([[0.1, 0, P.coral], [0.1, 0.4, P.coral], [0, 0.4, mix(P.coral, P.cream, 0.4)]], 8, wx, Hh + 0.3, wz + 0.3, { rot: 0 });
    hit.box(wx + 0.12, wz, D / 2 + 0.14, W / 2 + 0.02, 0);
    S.anchors.wardrobeSpot = { x: -5.85, z: wz + 0.1, rot: -Math.PI / 2 };
  }
  { const mx = -7.22, mz = -1.45, th = 0.12, mh = 1.75, mw = 0.62; B.push(mx, 0.0, mz, 0, 1, 0, th); B.box(0, 0, 0, 0.05, mh + 0.06, mw + 0.08, P.woodD, { base: 0, tint: 0.03, top: P.wood[2] }); B.pop();
    const cx = mx + 0.032 - mh / 2 * Math.sin(th) + 0.0, cy = mh / 2 * Math.cos(th); S.decal('mirror', cx + 0.012, cy + 0.03, mz, mw, mh, Math.PI / 2, -th, [1.1, 1.1, 1.1]);
    B.box(mx + 0.2, 0, mz - 0.28, 0.04, 0.5, 0.04, P.woodD, { base: 0, rz: 0.4 }); S.soft(mx + 0.2, mz, 0.4, 0.45, 0.3); hit.box(mx + 0.12, mz, 0.22, 0.34, 0); }
}
function sneakerLite(B, x, y, z, c) { B.box(x, y, z, 0.12, 0.05, 0.3, P.cream, { base: 0.1 }); B.box(x, y + 0.05, z - 0.02, 0.11, 0.07, 0.22, c, { base: 0.05, taper: 0.9 }); }
