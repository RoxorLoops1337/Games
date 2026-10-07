// Flat3D kitchen (Interior Artist): north-east counter run with hob, sink, blender, fridge with rent notice, table and stools, fruit bowl, herbs and plants. Wholefood plant-based.
import { P, mix, mul, bar, plant, pot, leaf, WARM, WARMS, WHITEN, GREENN } from './flat_kit.js';

export function buildKitchen(S) {
  const B = S.B, G = S.GLOW, hit = S.hit, R = S.rand;
  const cab = P.coral, cabD = P.coralD, top = P.wood[2], steel = P.steelL;
  const topY = 0.9;

  // ---------------------------------------------------------------- counter run (x 1.75 .. 4.55 along the north wall)
  { const x0 = 1.75, x1 = 4.55, cz = -5.2, d = 0.6, cx = (x0 + x1) / 2, W = x1 - x0;
    S.soft(cx, cz + 0.4, W / 2 + 0.1, 0.5, 0.4);
    B.box(cx, 0, cz, W, 0.1, d - 0.04, P.ink, { base: 0.3 }); // kick board
    B.box(cx, 0.1, cz, W, 0.78, d, cab, { base: 0.35, tint: 0.03 });
    // door fronts with handles and a few drawers
    const units = [[1.75, 2.35], [2.35, 2.95], [2.95, 3.55], [3.55, 4.05], [4.05, 4.55]];
    units.forEach(([a, b], i) => { const mx = (a + b) / 2, w = b - a - 0.04, fz = cz + d / 2 + 0.008; const c = i === 0 ? mix(cab, P.cream, 0.1) : mix(cab, cabD, 0.1 * (i % 2));
      B.box(mx, 0.14, fz, w, 0.34, 0.016, c, { base: 0.1, tint: 0.04, top: mul(c, 1.1) }); B.box(mx, 0.52, fz, w, 0.3, 0.016, c, { base: 0.1, tint: 0.04, top: mul(c, 1.1) });
      B.box(mx, 0.46, fz + 0.02, Math.min(0.2, w * 0.5), 0.014, 0.02, steel, { base: 0 }); B.box(mx, 0.78, fz + 0.02, Math.min(0.2, w * 0.5), 0.014, 0.02, steel, { base: 0 }); });
    // scuffs and a dark smear by the sink door (lived in)
    B.box(3.25, 0.14, cz + d / 2 + 0.018, 0.12, 0.05, 0.004, mix(cabD, P.ink, 0.5), { base: 0 });
    // butcher block top
    B.box(cx, topY - 0.02, cz + 0.03, W + 0.04, 0.045, d + 0.06, top, { base: 0.05, tint: 0.04, top: mix(top, P.woodL, 0.4) });
    // backsplash lip
    B.box(cx, topY + 0.02, -5.5 + 0.015, W, 0.08, 0.03, P.cream, { base: 0.1 });
    hit.box(cx, cz + 0.05, W / 2, d / 2 + 0.05, 0);

    // hob (x 2.35): ceramic top with four burners, pot with a wooden spoon, kettle
    { const hx = 2.35, hy = topY + 0.025; B.box(hx, hy - 0.005, cz + 0.02, 0.62, 0.012, 0.5, P.black, { base: 0, top: P.inkL });
      [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.1], [0.15, 0.1]].forEach(([dx, dz], i) => { B.lathe([[0.08, 0, P.ink], [0.075, 0.008, i === 1 ? mix(P.orange, P.red, 0.4) : P.inkL], [0.04, 0.008, P.ink]], 8, hx + dx, hy + 0.007, cz + 0.02 + dz, {}); });
      G.lathe([[0.075, 0, [1.8, 0.5, 0.2]], [0.045, 0.002, [2.0, 0.7, 0.25]]], 8, 2.5, hy + 0.01, cz - 0.1, {});
      // dal pot with lid
      const px = 2.5, pz = cz - 0.1; B.lathe([[0.12, 0, P.steelD], [0.14, 0.04, P.steel], [0.14, 0.2, P.steelL], [0.13, 0.2, P.steelD], [0.0, 0.2, P.leaf[3]]], 9, px, hy + 0.01, pz, {}); B.box(px + 0.15, hy + 0.12, pz, 0.08, 0.02, 0.02, P.ink, { base: 0 }); B.box(px + 0.2, hy + 0.12, pz, 0.08, 0.02, 0.02, P.ink, { base: 0 });
      bar(B, [px - 0.03, hy + 0.14, pz + 0.02], [px - 0.1, hy + 0.34, pz + 0.12], 0.018, 0.018, P.woodL);
      // kettle
      const kx = 2.2, kz = cz + 0.1; B.lathe([[0.09, 0, P.tealD], [0.1, 0.05, P.teal], [0.07, 0.17, P.tealL], [0.03, 0.19, P.tealL], [0.0, 0.19, P.ink]], 8, kx, hy + 0.01, kz, {}); bar(B, [kx - 0.09, hy + 0.09, kz], [kx - 0.17, hy + 0.15, kz], 0.02, 0.02, P.teal); bar(B, [kx + 0.08, hy + 0.12, kz], [kx + 0.08, hy + 0.2, kz], 0.02, 0.02, P.ink);
    }
    // sink (x 3.45): steel basin sunk in the block, mixer tap, dish rack with plates, a colander of greens
    { const sx = 3.45, sz = cz + 0.04; B.box(sx, topY + 0.018, sz, 0.8, 0.012, 0.5, steel, { base: 0, top: mix(steel, P.cream, 0.2) }); B.box(sx, topY + 0.03, sz, 0.66, 0.004, 0.36, mix(P.steelD, P.ink, 0.5), { base: 0 });
      B.box(sx, topY + 0.02, cz - 0.2, 0.05, 0.28, 0.05, steel, { base: 0, tint: 0.02 }); bar(B, [sx, topY + 0.28, cz - 0.2], [sx, topY + 0.3, cz - 0.02], 0.04, 0.04, steel); B.box(sx + 0.07, topY + 0.2, cz - 0.2, 0.025, 0.07, 0.025, P.coral, { base: 0 });
      // dish rack with plates
      B.box(3.98, topY + 0.02, cz + 0.02, 0.3, 0.012, 0.36, P.steelD, { base: 0 }); for (let i = 0; i < 4; i++) { B.push(3.9 + i * 0.065, topY + 0.1, cz + 0.02, 0, 1, 0, 0.12); B.box(0, 0, 0, 0.012, 0.15, 0.22, [P.cream, P.mint, P.mustard, P.pinkL][i], { base: 0.1 }); B.pop(); }
    }
    // chopping station right of the sink: board, avocado, greens, knife; blender at the far left
    { const bx = 4.3, bz = cz + 0.12; B.box(bx, topY + 0.02, bz, 0.34, 0.025, 0.24, P.woodL, { base: 0.1, ry: 0.15, top: mix(P.woodL, P.cream, 0.3) }); B.blob(bx - 0.06, topY + 0.07, bz, 0.04, 0.045, 0.04, P.leafD, P.leaf[2], { detail: 0 }); B.blob(bx + 0.02, topY + 0.065, bz - 0.04, 0.04, 0.04, 0.04, P.leaf[3], P.lime, { detail: 0 }); B.blob(bx + 0.08, topY + 0.06, bz + 0.03, 0.045, 0.03, 0.04, P.leaf[1], P.leaf[3], { detail: 0 }); B.blob(bx + 0.09, topY + 0.065, bz - 0.01, 0.025, 0.025, 0.025, P.orange, P.yellow, { detail: 0 }); B.box(bx - 0.14, topY + 0.045, bz + 0.07, 0.12, 0.012, 0.025, P.steelL, { base: 0, ry: 0.5 });
      // blender
      const lx = 1.98, lz = cz + 0.05; B.cyl(lx, topY + 0.02, lz, 0.075, 0.07, 0.1, 8, P.ink); B.lathe([[0.06, 0, mix(P.glassG, P.cream, 0.5)], [0.085, 0.24, mix(P.glassG, P.cream, 0.7)], [0.09, 0.24, P.glassG], [0, 0.24, P.leaf[3]]], 8, lx, topY + 0.12, lz, {}); B.cyl(lx, topY + 0.36, lz, 0.075, 0.07, 0.03, 8, P.ink);
      // a bunch of bananas and a bowl of greens by the blender
      bar(B, [2.0, topY + 0.04, cz + 0.3], [2.17, topY + 0.07, cz + 0.28], 0.04, 0.04, P.yellow); bar(B, [2.0, topY + 0.07, cz + 0.28], [2.16, topY + 0.1, cz + 0.27], 0.04, 0.04, mix(P.yellow, P.orange, 0.2)); }
    // wall fixtures above: chalkboard menu, shelf with jars, utensil rail, window herbs
    S.decal('chalk', 2.35, 1.85, -5.5 + 0.018, 0.9, 0.64, 0, 0, [1.0, 1.0, 1.0]); B.box(2.35, 1.51, -5.5 + 0.015, 0.94, 0.04, 0.02, P.woodD, { base: 0 }); B.box(2.35, 2.19, -5.5 + 0.015, 0.94, 0.04, 0.02, P.woodD, { base: 0 });
    { const jy = 1.5, jx0 = 4.15, jc = [P.red, P.pine, P.cream, P.orange, P.leaf[1]]; B.box(4.35, jy, -5.39, 0.5, 0.03, 0.2, P.woodL, { base: 0.1 }); for (let i = 0; i < 4; i++) { const c = jc[(i + 1) % 5]; B.lathe([[0.04, 0, mix(c, P.ink, 0.2)], [0.045, 0.02, c], [0.045, 0.15, mix(c, P.cream, 0.25)], [0.04, 0.16, mix(P.woodD, c, 0.2)], [0, 0.16, P.woodD]], 7, jx0 + 0.07 + i * 0.1, jy + 0.03, -5.39, {}); }
      B.box(4.35, 1.88, -5.39, 0.5, 0.03, 0.2, P.woodL, { base: 0.1 }); for (let i = 0; i < 3; i++) B.lathe([[0.05, 0, P.terracotta], [0.055, 0.12, P.terracotta], [0.0, 0.12, P.soil]], 7, 4.2 + i * 0.13, 1.91, -5.39, {}); for (let i = 0; i < 3; i++) leaf(B, [4.2 + i * 0.13, 2.02, -5.39], [0, 1, 0.1], 0.2, 0.1, P.leaf[(i + 1) % 4], P.leafD, 0.02); }
    [3.05, 3.45, 3.85].forEach((hx, i) => { plant(S, hx, 1.3, -5.4, 'herb', 0.7, { pot: [P.terracotta, P.mint, P.mustard][i], pr: 0.1, ph: 0.12 }); });
  }

  // ---------------------------------------------------------------- fridge (mint retro) with the rent notice
  { const fx = 4.97, fz = -5.15, W = 0.7, D = 0.68, Hh = 1.85, c = P.mint;
    S.soft(fx, fz + 0.2, 0.55, 0.55, 0.4);
    B.box(fx, 0.05, fz, W, Hh - 0.05, D, c, { base: 0.3, tint: 0.025, taper: 0.97, top: mul(c, 1.1) }); B.box(fx, 0, fz, W - 0.1, 0.05, D - 0.1, P.ink, { base: 0 });
    const f = fz + D / 2 + 0.012; B.box(fx, 1.25, f, W - 0.04, 0.012, 0.02, mul(c, 0.55), { base: 0 }); B.box(fx - 0.3, 1.0, f + 0.02, 0.025, 0.2, 0.03, steel, { base: 0 }); B.box(fx - 0.3, 1.4, f + 0.02, 0.025, 0.2, 0.03, steel, { base: 0 });
    B.box(fx + 0.0, 1.85, fz, W, 0.01, D, mul(c, 1.15), { base: 0 });
    S.decal('rent', fx + 0.08, 1.46, f + 0.006, 0.2, 0.28, 0, 0, [1, 1, 1], 0.06); S.decal('menu', fx - 0.12, 0.88, f + 0.006, 0.25, 0.19, 0, 0, [1, 1, 1], -0.04); S.decal('photos', fx + 0.12, 1.7, f + 0.006, 0.33, 0.165, 0, 0, [1, 1, 1], 0.03);
    [[-0.22, 1.5, P.pink], [0.25, 1.18, P.yellow], [-0.15, 0.75, P.violet], [0.22, 0.6, P.orange]].forEach(([dx, y, cc]) => { B.box(fx + dx - 0.02, y, f + 0.004, 0.04, 0.04, 0.012, cc, { base: 0, tint: 0.04 }); });
    // a stack of recycling on top
    B.box(fx - 0.1, 1.86, fz, 0.3, 0.03, 0.24, P.cream, { base: 0, ry: 0.2 }); B.box(fx - 0.08, 1.89, fz, 0.26, 0.03, 0.22, P.mustard, { base: 0, ry: -0.1 }); plant(S, fx + 0.2, 1.86, fz + 0.04, 'trail', 0.5, { pot: P.violet, pr: 0.1, ph: 0.12 });
    S.lights.push({ x: fx, y: 1.2, z: fz + 0.6, color: '#d8ffe8', r: 3.0, i: 0.4, kind: 'fridge' });
    hit.box(fx, fz + 0.03, W / 2, D / 2 + 0.03, 0);
  }

  // ---------------------------------------------------------------- table, two stools, fruit bowl and bowls of greens
  { const tx = 3.25, tz = -1.8, W = 0.95, D = 0.95, h = 0.76;
    S.soft(tx, tz, 1.1, 0.9, 0.35);
    B.box(tx, h - 0.04, tz, W, 0.045, D, mix(P.pine, P.woodL, 0.4), { base: 0.1, tint: 0.04, top: mix(P.pine, P.cream, 0.4) });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B.box(tx + a * (W / 2 - 0.07), 0, tz + b * (D / 2 - 0.07), 0.045, h - 0.04, 0.045, P.black, { base: 0.3, taper: 0.8 }));
    // fruit bowl (wooden) with oranges, apples, a banana and avocado halves
    const bx = tx + 0.02, bz = tz + 0.0, by = h + 0.005;
    B.lathe([[0.07, 0, P.woodD], [0.19, 0.08, P.wood[1]], [0.2, 0.1, P.woodL], [0.18, 0.1, P.woodD], [0.0, 0.05, P.woodD]], 10, bx, by, bz, {});
    [[0, 0, P.orange], [0.1, 0.05, P.orange], [-0.08, 0.07, P.yellow], [0.03, -0.1, P.leaf[3]], [-0.1, -0.05, P.red], [0.09, -0.06, P.leaf[1]]].forEach(([dx, dz, c], i) => B.blob(bx + dx, by + 0.11 + (i % 2) * 0.03, bz + dz, 0.058, 0.055, 0.058, mix(c, P.ink, 0.25), c, { detail: 1, jit: 0.08 }));
    bar(B, [bx - 0.1, by + 0.15, bz + 0.1], [bx + 0.1, by + 0.19, bz + 0.0], 0.04, 0.04, P.yellow); B.blob(bx + 0.13, by + 0.17, bz + 0.1, 0.03, 0.025, 0.03, P.leaf[2], P.lime, { detail: 0 });
    // two bowls of salad and a jug of water
    [[tx - 0.3, tz + 0.27], [tx + 0.3, tz + 0.27]].forEach(([x, z], i) => { B.lathe([[0.05, 0, P.cream], [0.12, 0.06, P.cream], [0.12, 0.065, mix(P.cream, P.creamD, 0.3)], [0.1, 0.065, P.leaf[1]]], 9, x, h + 0.005, z, {}); B.blob(x, h + 0.075, z, 0.095, 0.045, 0.095, P.leaf[2], P.leaf[3], { detail: 1, jit: 0.1 }); B.blob(x + 0.03, h + 0.1, z, 0.03, 0.025, 0.03, P.red, P.coral, { detail: 0 }); B.box(x + 0.15, h + 0.005, z - 0.02, 0.012, 0.012, 0.18, P.steelL, { base: 0, ry: i ? 0.2 : -0.2 }); });
    B.lathe([[0.07, 0, mix(P.glassG, P.cream, 0.5)], [0.075, 0.2, mix(P.cream, P.glassG, 0.6)], [0.0, 0.2, P.cream]], 8, tx - 0.28, h + 0.005, tz - 0.25, {});
    hit.box(tx, tz, W / 2 + 0.03, D / 2 + 0.03, 0);
    // stools (round seats, splayed legs)
    [[tx - 0.82, tz + 0.05], [tx + 0.82, tz - 0.05]].forEach(([sx, sz], i) => { B.lathe([[0.2, 0.0, P.mustardD], [0.21, 0.04, P.mustard], [0.0, 0.045, mix(P.mustard, P.cream, 0.3)]], 10, sx, 0.44, sz, {}); for (let k = 0; k < 3; k++) { const a = k * 2.094 + i; bar(B, [sx + Math.cos(a) * 0.13, 0.46, sz + Math.sin(a) * 0.13], [sx + Math.cos(a) * 0.2, 0, sz + Math.sin(a) * 0.2], 0.03, 0.03, P.black); } B.cyl(sx, 0.18, sz, 0.18, 0.18, 0.02, 8, P.black); S.soft(sx, sz, 0.3, 0.3, 0.35); hit.circle(sx, sz, 0.24); });
  }

  // ---------------------------------------------------------------- plants and floor odds and ends
  plant(S, 5.15, 0, -1.05, 'monstera', 1.15, { pot: P.terracotta, pr: 0.26, ph: 0.36 }); S.soft(5.15, -1.05, 0.5, 0.5, 0.35); hit.circle(5.15, -1.05, 0.3);
  { const cx = 1.45, cz = -4.55; S.soft(cx, cz, 0.45, 0.4, 0.4); B.box(cx, 0, cz, 0.5, 0.26, 0.38, P.woodL, { base: 0.3, tint: 0.05, top: mix(P.woodD, P.ink, 0.3) }); // produce crate
    [[-0.12, -0.05, P.orange], [0.05, 0.06, P.leaf[1]], [0.14, -0.06, P.red], [-0.08, 0.08, P.yellow], [0.0, -0.09, P.leaf[3]]].forEach(([dx, dz, c], i) => B.blob(cx + dx, 0.3 + (i % 2) * 0.01, cz + dz, 0.09, 0.08, 0.09, mix(c, P.ink, 0.25), c, { detail: 1, jit: 0.1 })); for (let i = 0; i < 3; i++) leaf(B, [cx + 0.18, 0.26, cz + 0.1 - i * 0.08], [0.6, 0.6, (i - 1) * 0.5], 0.22, 0.12, P.leaf[1], P.leafD, 0.04); hit.box(cx, cz, 0.27, 0.21, 0); }
  S.anchors.kitchenSpot = { x: 3.2, z: -3.95, rot: Math.PI };
}
