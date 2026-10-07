// Flat3D living room (Interior Artist): couch, TV unit, record shelf with tapes and records, coffee table, rug, beanbag, speaker stack, sneaker wall, string lights, floor lamp, posters.
import { P, mix, mul, bar, plant, pot, leaf, WARM, WARMS, PINKN, CYANN, YELN } from './flat_kit.js';

export function sneaker(B, x, y, z, ry, c1, c2, c3, sole) {
  B.push(x, y, z, ry || 0);
  B.box(0, 0, 0, 0.115, 0.04, 0.31, sole || P.cream, { base: 0.1, tint: 0.02 }); // sole
  B.box(0, 0.04, -0.045, 0.1, 0.075, 0.2, c1, { base: 0.05, taper: 0.9 }); // upper, heel and mid
  B.box(0, 0.04, 0.1, 0.095, 0.04, 0.11, c2, { base: 0.05, taper: 0.8 }); // toe box
  B.box(0, 0.115, -0.1, 0.085, 0.045, 0.06, mul(c1, 0.85), { base: 0 }); // collar
  B.box(0, 0.1, 0.02, 0.07, 0.03, 0.09, c3, { base: 0, taper: 0.8 }); // tongue / laces
  B.box(0, 0.075, -0.145, 0.105, 0.03, 0.02, c2, { base: 0 }); // heel tab
  B.pop();
}
export function sleeve(B, x, y, z, ry, c, w) { B.box(x, y, z, w || 0.014, 0.3, 0.3, c, { ry: ry || 0, base: 0.1, tint: 0.08 }); }

export function buildLiving(S) {
  const B = S.B, G = S.GLOW, hit = S.hit, R = S.rand;
  const dark = P.ink, shelfWood = mix(P.ply, P.woodL, 0.3);

  // ---------------------------------------------------------------- rug (afro-geometric, teal and plum)
  { const cx = -4.0, cz = -2.7, w = 3.5, d = 2.3; B.box(cx, 0, cz, w, 0.016, d, mix(P.cream, P.creamD, 0.3), { base: 0.5, tint: 0 }); S.decal('rug', cx, 0.0172, cz, w - 0.04, d - 0.04, 0, -Math.PI / 2, [1, 1, 1]); }

  // ---------------------------------------------------------------- couch (faces north, mustard) at (-4, -1.55)
  { const cx = -4.0, cz = -1.5, M = P.mustard, MD = P.mustardD, ML = mix(P.mustard, P.cream, 0.25);
    S.soft(cx, cz, 1.7, 0.85, 0.5);
    [[-1.14, -0.4], [1.14, -0.4], [-1.14, 0.4], [1.14, 0.4]].forEach(([dx, dz]) => B.box(cx + dx, 0, cz + dz, 0.08, 0.12, 0.08, P.woodD, { base: 0.1, taper: 0.7 }));
    B.box(cx, 0.1, cz, 2.5, 0.3, 0.95, MD, { base: 0.4, tint: 0.03 }); // frame
    B.box(cx, 0.4, cz + 0.37, 2.5, 0.55, 0.2, M, { base: 0.1, tint: 0.03, taper: 0.97 }); // back
    [-1, 1].forEach((s) => B.box(cx + s * 1.16, 0.4, cz - 0.0, 0.2, 0.3, 0.95, M, { base: 0.1, tint: 0.03, taper: 0.94, top: ML })); // arms
    for (let i = -1; i <= 1; i++) { B.box(cx + i * 0.74, 0.4, cz - 0.1, 0.72, 0.13, 0.68, ML, { base: 0.15, tint: 0.04, taper: 0.95 }); B.push(cx + i * 0.74, 0.53, cz + 0.2, 0, 1, -0.2); B.box(0, 0, 0, 0.7, 0.36, 0.16, ML, { base: 0.1, tint: 0.04, taper: 0.93 }); B.pop(); }
    // throw pillows and a blanket
    B.push(cx - 0.95, 0.56, cz + 0.05, 0.5, 1, -0.3, 0.12); B.box(0, 0, 0, 0.36, 0.34, 0.11, P.teal, { base: 0, tint: 0.05, taper: 0.9 }); B.box(0, 0.0, 0.056, 0.2, 0.2, 0.01, P.tealL, { base: 0 }); B.pop();
    B.push(cx + 0.98, 0.56, cz + 0.1, -0.4, 1, -0.3, -0.1); B.box(0, 0, 0, 0.34, 0.32, 0.11, P.pink, { base: 0, tint: 0.05, taper: 0.9 }); B.pop();
    B.box(cx + 1.1, 0.7, cz - 0.1, 0.3, 0.05, 0.9, mix(P.coral, P.cream, 0.15), { base: 0, rz: -0.05 }); B.box(cx + 1.28, 0.46, cz - 0.1, 0.05, 0.28, 0.9, P.coral, { base: 0.1 }); B.box(cx + 1.08, 0.4, cz - 0.1, 0.45, 0.03, 0.8, mix(P.coral, P.cream, 0.4), { base: 0, rz: 0.1 });
    hit.box(cx, cz, 1.28, 0.5, 0);
    S.anchors.couchSpot = { x: cx - 0.4, z: cz - 0.05, rot: Math.PI, seatY: 0.46 }; S.anchors.foxy = { x: cx + 0.62, z: cz - 0.05, rot: Math.PI, seatY: 0.46 };
  }

  // ---------------------------------------------------------------- TV unit and TV on the north wall
  { const cx = -4.0, cz = -5.2;
    S.soft(cx, cz + 0.15, 1.2, 0.5, 0.4);
    B.box(cx, 0.12, cz, 2.0, 0.42, 0.5, mix(P.woodD, P.wood[1], 0.5), { base: 0.35, tint: 0.04, top: P.wood[2] });
    [[-1, 0], [0, 0], [1, 0]].forEach(([i]) => { B.box(cx + i * 0.64, 0.17, cz + 0.255, 0.58, 0.3, 0.02, i === 0 ? P.ink : mix(P.ink, P.violet, 0.2), { base: 0, tint: 0.02 }); }); // cubbies
    [[-0.8], [0.8]].forEach(([dx]) => B.box(cx + dx, 0, cz + 0.1, 0.07, 0.12, 0.07, P.woodD, { base: 0.1 }));
    // console and controller, tape deck
    B.box(cx + 0.64, 0.17, cz + 0.2, 0.34, 0.06, 0.22, P.black, { base: 0.1 }); G.box(cx + 0.74, 0.17 + 0.052, cz + 0.28, 0.04, 0.012, 0.02, CYANN, { base: 0, tint: 0 });
    B.box(cx, 0.17, cz + 0.2, 0.46, 0.07, 0.24, P.steelD, { base: 0.1 }); B.box(cx - 0.64, 0.17, cz + 0.2, 0.3, 0.1, 0.22, P.mint, { base: 0.1 });
    // TV
    const tvw = 1.52, tvh = 0.86, ty = 0.64; B.box(cx, ty, cz, tvw, tvh, 0.07, P.ink, { base: 0, tint: 0.01 }); B.box(cx, 0.54, cz, 0.5, 0.1, 0.22, P.inkL, { base: 0.1, taper: 0.6 });
    S.screen('tv', cx, ty + tvh / 2, cz + 0.038, tvw - 0.1, tvh - 0.1, 0, 0, [1.1, 1.1, 1.1]);
    S.lights.push({ x: cx, y: 1.0, z: cz + 0.9, color: '#7ad8ff', r: 5.5, i: 0.9, flicker: 0.35, kind: 'tv' });
    hit.box(cx, cz + 0.02, 1.0, 0.27, 0);
    // posters above the TV
    [['poster_c', -0.78], ['poster_a', 0], ['poster_d', 0.78]].forEach(([n, dx], i) => { const py = 1.9 + (i === 1 ? 0.03 : 0), w = 0.5, h = 0.7; B.box(cx + dx, py - h / 2 - 0.02, -5.5 + 0.012, w + 0.04, h + 0.04, 0.012, P.ink, { base: 0, tint: 0.02 }); S.decal(n, cx + dx, py, -5.5 + 0.02, w, h, 0, 0, [1.05, 1.0, 1.0]); });
  }

  // ---------------------------------------------------------------- record shelf (cube shelf) at the north wall, west corner
  { const cx = -6.4, cz = -5.28, W = 1.9, Hh = 1.26, D = 0.4, t = 0.035, wood = shelfWood, back = mix(P.woodD, P.plumD, 0.4);
    S.soft(cx, cz + 0.1, 1.15, 0.45, 0.35);
    B.box(cx, 0, cz - D / 2 + 0.01, W, Hh, 0.02, back, { base: 0.1, tint: 0.02 });
    B.box(cx - W / 2 + t / 2, 0, cz, t, Hh, D, wood, { base: 0.3 }); B.box(cx + W / 2 - t / 2, 0, cz, t, Hh, D, wood, { base: 0.3 }); B.box(cx, Hh - t, cz, W, t, D, wood, { base: 0, top: P.woodL }); B.box(cx, 0.1, cz, W, t, D, wood, { base: 0.4 });
    for (let r = 1; r <= 2; r++) B.box(cx, 0.1 + r * 0.36, cz, W, t, D, wood, { base: 0.2 });
    for (let c = 1; c <= 2; c++) B.box(cx - W / 2 + c * W / 3, 0.1, cz, t, Hh - 0.1, D, wood, { base: 0.1 });
    [[-0.85], [0.85]].forEach(([dx]) => B.box(cx + dx, 0, cz, 0.06, 0.1, 0.34, P.woodD, { base: 0 }));
    const cw = (W - 2 * t) / 3 - 0.01, colX = (c) => cx - W / 2 + t + (c + 0.5) * (W - t) / 3, rowY = (r) => 0.1 + t + r * 0.36;
    // records filed in the bottom row (edges seen from the front) and the middle left, covers shown elsewhere
    const rc = [P.pink, P.cyan, P.yellow, P.violet, P.coral, P.cream, P.teal, P.mustard, P.lime, P.orange];
    for (let c = 0; c < 3; c++) { const n = 8 - c, x0 = colX(c) - cw / 2 + 0.03; for (let i = 0; i < n; i++) sleeve(B, x0 + i * (cw - 0.06) / n, rowY(0), cz + 0.0, 0, mix(rc[(i * 3 + c * 5) % 10], P.ink, 0.2 + R() * 0.2), 0.016); }
    for (let i = 0; i < 6; i++) sleeve(B, colX(0) - cw / 2 + 0.05 + i * 0.075, rowY(1), cz + 0.0, 0, mix(rc[(i * 7) % 10], P.ink, 0.25), 0.016);
    // covers shown standing in the middle cubes
    S.decal('rec0', colX(1) - 0.1, rowY(1) + 0.15, cz + D / 2 - 0.1, 0.26, 0.26, 0.0, -0.1); S.decal('rec3', colX(1) + 0.15, rowY(1) + 0.14, cz + D / 2 - 0.14, 0.24, 0.24, 0.0, -0.08);
    S.decal('rec5', colX(2) - 0.12, rowY(1) + 0.15, cz + D / 2 - 0.1, 0.26, 0.26, 0.0, -0.1); S.decal('rec2', colX(2) + 0.13, rowY(1) + 0.14, cz + D / 2 - 0.12, 0.24, 0.24, 0.0, -0.08);
    // tapes in the top row (two cubes)
    for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) { const tx = colX(c) - 0.22 + i * 0.11, ty = rowY(2) + 0.05 + r * 0.115; B.box(tx, ty - 0.045, cz + 0.14, 0.1, 0.07, 0.02, P.ink, { base: 0, tint: 0.02 }); S.decal('tape' + ((i + r + c) % 4), tx, ty - 0.01, cz + 0.152, 0.1, 0.066, 0, 0, [1, 1, 1]); }
    // a little fern in the last top cube
    plant(S, colX(2), rowY(2), cz, 'trail', 0.45, { pot: P.mustard, pr: 0.15, ph: 0.2 });
    // the top: turntable, speaker, tape stack and a plant
    const ty = Hh;
    B.box(cx - 0.35, ty, cz, 0.62, 0.07, 0.36, P.black, { base: 0.1, tint: 0.02, top: P.inkL }); B.box(cx - 0.38, ty + 0.07, cz, 0.3, 0.012, 0.3, P.steelD, { base: 0 }); // deck and platter plinth
    B.box(cx - 0.12, ty + 0.07, cz - 0.1, 0.012, 0.04, 0.16, P.steelL, { base: 0 }); bar(B, [cx - 0.12, ty + 0.1, cz - 0.12], [cx - 0.3, ty + 0.1, cz + 0.05], 0.012, 0.012, P.steelL); // tonearm
    S.turntable = { x: cx - 0.38, y: ty + 0.082, z: cz };
    B.box(cx + 0.28, ty, cz, 0.3, 0.42, 0.28, P.woodD, { base: 0.2, tint: 0.03 }); B.push(cx + 0.28, ty + 0.2, cz + 0.145, 0, 1, Math.PI / 2); B.lathe([[0.1, 0, P.black], [0.09, 0.012, P.inkL], [0.02, 0.03, P.orange]], 8, 0, 0, 0, {}); B.pop();
    [0.0, 1].forEach((_, i) => { B.box(cx + 0.65, ty + i * 0.016, cz - 0.02, 0.15, 0.016, 0.1, [P.pink, P.cyan][i], { base: 0, tint: 0.02 }); });
    plant(S, cx + 0.8, ty, cz + 0.02, 'cactus', 0.8, { pot: P.coral, pr: 0.12, ph: 0.15 });
    hit.box(cx, cz + 0.02, W / 2, 0.2, 0);
    // poster over the shelf
    B.box(cx, 1.58, -5.488, 0.5, 0.72, 0.012, P.ink, { base: 0 }); S.decal('poster_b', cx, 1.94, -5.478, 0.46, 0.65, 0, 0, [1.05, 1.05, 1.0]);
    // crate of records on the floor in front
    { const px = -6.7, pz = -4.62; B.box(px, 0.0, pz, 0.46, 0.3, 0.4, P.mustardD, { base: 0.3, tint: 0.05, top: mix(P.mustardD, P.ink, 0.5) }); B.box(px, 0.3, pz, 0.48, 0.03, 0.42, P.mustard, { base: 0 });
      for (let i = 0; i < 6; i++) sleeve(B, px - 0.18 + i * 0.07, 0.04, pz, 0, [P.pink, P.cyan, P.coral, P.violet, P.yellow, P.cream][i], 0.014); hit.box(px, pz, 0.26, 0.22, 0); }
  }

  // ---------------------------------------------------------------- coffee table with a wholefood snack, a juice and headphones
  { const cx = -4.0, cz = -3.35, w = 1.3, d = 0.66, h = 0.42;
    S.soft(cx, cz, 0.95, 0.55, 0.4);
    B.box(cx, h - 0.04, cz, w, 0.05, d, P.woodL, { base: 0.1, tint: 0.04, top: mix(P.woodL, P.cream, 0.2) }); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => B.box(cx + a * (w / 2 - 0.06), 0, cz + b * (d / 2 - 0.06), 0.06, h - 0.04, 0.06, P.woodD, { base: 0.3 }));
    B.box(cx, 0.1, cz, w - 0.14, 0.03, d - 0.14, P.wood[1], { base: 0.4 });
    // magazines on the low shelf
    B.box(cx - 0.25, 0.13, cz, 0.3, 0.025, 0.22, P.pink, { base: 0.1, ry: 0.2 }); B.box(cx - 0.22, 0.155, cz + 0.02, 0.28, 0.02, 0.2, P.cyan, { base: 0, ry: -0.1 });
    // top: plate with avocado toast, green juice, headphones, a basil pot
    const ty = h + 0.0;
    B.lathe([[0.0, 0, P.cream], [0.12, 0.0, P.cream], [0.15, 0.025, mix(P.cream, P.creamD, 0.2)], [0.13, 0.025, P.cream], [0.0, 0.012, P.cream]], 10, cx - 0.35, ty, cz + 0.05, {}); B.box(cx - 0.35, ty + 0.012, cz + 0.05, 0.19, 0.03, 0.13, P.pine, { base: 0.1, ry: 0.3 }); B.box(cx - 0.35, ty + 0.042, cz + 0.05, 0.17, 0.018, 0.11, P.leaf[3], { base: 0, ry: 0.3, tint: 0.1 }); B.blob(cx - 0.33, ty + 0.06, cz + 0.05, 0.03, 0.015, 0.03, P.red, P.coral, { detail: 0 });
    B.lathe([[0.05, 0, P.glassG], [0.055, 0.15, mix(P.glassG, P.cream, 0.3)], [0.0, 0.15, P.leaf[3]]], 8, cx + 0.15, ty, cz - 0.1, {}); B.box(cx + 0.18, ty + 0.1, cz - 0.1, 0.012, 0.15, 0.012, P.yellow, { base: 0, rz: -0.2 }); // juice and straw
    // headphones
    B.lathe([[0.04, 0, P.pink], [0.04, 0.025, mix(P.pink, P.cream, 0.2)], [0, 0.025, P.pink]], 8, cx + 0.38, ty, cz + 0.12, {}); B.lathe([[0.04, 0, P.pink], [0.04, 0.025, mix(P.pink, P.cream, 0.2)], [0, 0.025, P.pink]], 8, cx + 0.52, ty, cz + 0.08, {}); bar(B, [cx + 0.38, ty + 0.04, cz + 0.12], [cx + 0.45, ty + 0.1, cz + 0.1], 0.015, 0.015, P.ink); bar(B, [cx + 0.45, ty + 0.1, cz + 0.1], [cx + 0.52, ty + 0.04, cz + 0.08], 0.015, 0.015, P.ink);
    plant(S, cx + 0.45, ty, cz - 0.17, 'herb', 0.6, { pot: P.terracotta, pr: 0.1, ph: 0.1 });
    B.box(cx - 0.05, ty, cz + 0.2, 0.14, 0.02, 0.05, P.ink, { base: 0, ry: 0.4 }); // remote
    hit.box(cx, cz, w / 2 + 0.02, d / 2 + 0.02, 0);
  }

  // ---------------------------------------------------------------- beanbag and floor lamp
  { const bx = -1.55, bz = -1.85; S.soft(bx, bz, 0.8, 0.7, 0.5);
    B.blob(bx, 0.3, bz, 0.58, 0.32, 0.52, mix(P.coral, P.coralD, 0.5), P.coral, { detail: 1, jit: 0.2, ry: 0.6 }); B.blob(bx - 0.1, 0.46, bz - 0.12, 0.38, 0.14, 0.34, P.coral, mix(P.coral, P.pinkL, 0.4), { detail: 1, jit: 0.12 });
    B.box(bx + 0.5, 0.0, bz + 0.2, 0.22, 0.03, 0.35, P.cream, { base: 0, ry: 0.3 }); // a pair of socks, lived in
    hit.circle(bx, bz, 0.58); }
  { const lx = -2.3, lz = -2.55; S.soft(lx, lz, 0.3, 0.3, 0.4);
    B.cyl(lx, 0, lz, 0.17, 0.14, 0.04, 8, P.black); B.cyl(lx, 0.04, lz, 0.015, 0.015, 1.45, 5, P.steelD); B.lathe([[0.2, 0, P.cream], [0.12, 0.2, P.cream], [0.12, 0.2, WARMS]], 8, lx, 1.45, lz, {}); G.lathe([[0.16, 0.01, WARMS], [0.19, 0.035, WARM], [0.11, 0.18, WARM]], 8, lx, 1.45, lz, {});
    S.lights.push({ x: lx, y: 1.6, z: lz, color: '#ffcf8a', r: 6.5, i: 1.05, kind: 'lamp' }); hit.circle(lx, lz, 0.2); }

  // ---------------------------------------------------------------- speaker stack (north wall, between TV and the desk nook)
  { const cx = -2.35, cz = -5.12;
    S.soft(cx, cz + 0.1, 0.6, 0.55, 0.4);
    B.box(cx, 0, cz, 0.78, 0.82, 0.6, P.black, { base: 0.35, tint: 0.02, top: P.inkL }); B.box(cx, 0.82, cz, 0.7, 0.62, 0.5, P.black, { base: 0.1, tint: 0.02, top: P.inkL }); B.box(cx, 1.44, cz, 0.62, 0.34, 0.42, P.inkL, { base: 0.1, tint: 0.02 });
    const woofer = (x, y, z, r, c) => { B.push(x, y, z, 0, 1, Math.PI / 2); B.lathe([[r, 0, P.ink], [r * 0.95, 0.012, P.inkL], [r * 0.55, -0.04, mix(P.inkL, c, 0.3)], [r * 0.2, -0.05, c], [0, -0.045, mix(c, P.cream, 0.4)]], 10, 0, 0, 0, {}); B.pop(); };
    woofer(cx, 0.46, cz + 0.301, 0.25, P.orange); woofer(cx, 0.13, cz + 0.301, 0.0001, P.orange); woofer(cx, 1.13, cz + 0.251, 0.2, P.coral); B.box(cx, 0.86, cz + 0.25, 0.22, 0.035, 0.02, P.steel, { base: 0 });
    woofer(cx, 1.61, cz + 0.211, 0.12, P.yellow);
    G.box(cx - 0.33, 0.1, cz + 0.302, 0.03, 0.64, 0.012, PINKN, { base: 0, tint: 0 }); G.box(cx + 0.3, 0.1, cz + 0.302, 0.03, 0.64, 0.012, CYANN, { base: 0, tint: 0 }); // neon edge trim
    S.lights.push({ x: cx, y: 0.9, z: cz + 0.7, color: '#ff3ea5', r: 3.2, i: 0.35, kind: 'neon' });
    hit.box(cx, cz, 0.4, 0.31, 0); }

  // ---------------------------------------------------------------- sneaker wall (west wall, z -0.9..1.3)
  { const x0 = -7.5, zc = 0.2, len = 2.2, pal = [[P.red, P.cream, P.ink], [P.cream, P.tealL, P.yellow], [P.yellow, P.ink, P.cream], [P.violet, P.pinkL, P.cream], [P.ink, P.lime, P.pink], [P.pink, P.cream, P.ink], [P.cyan, P.ink, P.yellow], [P.orange, P.cream, P.ink], [P.cream, P.red, P.ink], [P.tealL, P.mustard, P.cream]];
    // backing panel (darker slab) so the wall reads as a display
    B.box(x0 + 0.02, 0.38, zc, 0.04, 1.95, len + 0.2, mix(P.plumD, P.ink, 0.45), { base: 0.1, tint: 0.02 });
    let n = 0;
    for (let r = 0; r < 4; r++) { const y = 0.55 + r * 0.44; B.box(x0 + 0.17, y, zc, 0.3, 0.03, len, P.woodL, { base: 0.1, tint: 0.03 }); B.box(x0 + 0.17, y - 0.06, zc - len / 2 + 0.1, 0.24, 0.06, 0.03, P.ink, { base: 0 }); B.box(x0 + 0.17, y - 0.06, zc + len / 2 - 0.1, 0.24, 0.06, 0.03, P.ink, { base: 0 });
      for (let i = 0; i < 6; i++) { const p = pal[(n++ * 3 + r) % 10]; sneaker(B, x0 + 0.17, y + 0.03, zc - len / 2 + 0.28 + i * 0.33, 0, p[0], p[1], p[2]); } }
    S.screen('kicks', x0 + 0.03, 2.5, zc, 1.0, 0.5, Math.PI / 2, 0, [1.2, 1.2, 1.2]); G.box(x0 + 0.012, 2.28, zc - 0.5, 0.012, 0.012, 1.0, CYANN, { base: 0 });
    S.lights.push({ x: x0 + 0.5, y: 2.4, z: zc, color: '#35f2e0', r: 3.4, i: 0.4, kind: 'neon' });
  }

  // ---------------------------------------------------------------- string lights along the north and west walls
  { const hooks = (pts, axis) => {
      const bulbC = [WARM, PINKN, CYANN, YELN, WARM]; let bi = 0;
      for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1], N = 8, prev = null; let last = [a[0], a[1], a[2]];
        for (let i = 1; i <= N; i++) { const t = i / N, sag = Math.sin(Math.PI * t) * 0.16, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t]; bar(B, last, p, 0.012, 0.012, P.black); if (i < N && i % 1 === 0) { const c = bulbC[bi++ % 5]; G.box(p[0] - 0.035, p[1] - 0.09, p[2] - 0.035, 0.07, 0.09, 0.07, c, { base: 0, tint: 0, top: c }); B.box(p[0], p[1] - 0.02, p[2], 0.03, 0.025, 0.03, P.black, { base: 0 }); } last = p; } void prev; }
      void axis; };
    hooks([[-7.2, 2.32, -5.44], [-5.6, 2.32, -5.44], [-4.0, 2.32, -5.44], [-2.4, 2.32, -5.44], [-0.9, 2.3, -5.44]]);
    hooks([[-7.44, 2.32, -5.2], [-7.44, 2.34, -3.6], [-7.44, 2.34, -2.0], [-7.44, 2.34, -0.4], [-7.44, 2.3, 1.1]]);
    S.lights.push({ x: -4.5, y: 2.25, z: -4.9, color: '#ffcf8a', r: 5, i: 0.45, kind: 'neon' }); }
}
