// Thrift Shop furniture and charm (Interior Artist INT-A): counter with register and lucky cat, back shelf with the boombox, window display and neon OPEN sign, armchair and
// floor lamp, the $1 record bins, bunting, wall frames, plants, rugs, door dressing and the sidewalk outside.
import { P, mix, mul, bar, plant, col, WARM, WARMS, PINKN, CYANN, YELN, WHITEN, GREENN } from './flat_kit.js';
import { wallDecal, wallScreen, wbox } from './shop_shell.js';
import { mannequin, FIT } from './shop_stock.js';

const C = (h) => col(h);
// boombox (also reused by the lab): body, two speaker cones, handle, tape window. glow = emissive buffer for the lit parts
export function boombox(B, G, x, y, z, ry, c, s) {
  s = s || 1; B.push(x, y, z, ry, s);
  B.box(0, 0, 0, 0.52, 0.27, 0.15, c, { base: 0.2, tint: 0.03, top: mul(c, 1.15) });
  [-0.17, 0.17].forEach((dx) => { B.lathe([[0.1, 0, P.ink], [0.1, 0.012, P.inkL], [0.07, 0.02, P.black], [0.03, 0.04, P.steelD], [0, 0.03, P.steelL]], 10, dx, 0.135, 0.078, { rot: 0 }); });
  B.box(0, 0.19, 0.074, 0.15, 0.05, 0.012, P.ink, { base: 0 }); B.box(0, 0.2, 0.082, 0.12, 0.03, 0.006, mix(P.cream, P.mustard, 0.2), { base: 0 });
  G.box(-0.06, 0.205, 0.0795, 0.12, 0.012, 0.004, [2.4, 0.6, 0.5], { base: 0, tint: 0 }); G.box(-0.04, 0.17, 0.0795, 0.08, 0.008, 0.004, [0.6, 2.6, 1.8], { base: 0, tint: 0 });
  bar(B, [-0.2, 0.27, 0], [-0.15, 0.36, 0], 0.016, 0.016, P.steelD); bar(B, [-0.15, 0.36, 0], [0.15, 0.36, 0], 0.016, 0.016, P.steelD); bar(B, [0.15, 0.36, 0], [0.2, 0.27, 0], 0.016, 0.016, P.steelD);
  B.box(0.0, 0.265, 0.0, 0.04, 0.02, 0.1, P.ink, { base: 0 });
  B.pop();
}
const lamp = (S, x, y0, z, h, shade, glowCol) => { const B = S.B, G = S.GLOW; B.cyl(x, y0, z, 0.12, 0.12, 0.03, 8, P.ink); B.cyl(x, y0 + 0.03, z, 0.018, 0.018, h, 6, P.steelD); B.lathe([[0.18, 0, shade], [0.1, 0.18, mul(shade, 1.1)], [0.0, 0.18, mul(shade, 1.2)]], 8, x, y0 + h, z, { tint: 0.02 }); G.lathe([[0.17, 0.01, glowCol], [0.095, 0.17, glowCol]], 8, x, y0 + h, z, {}); };
export { lamp };

export function buildFront(S, F) {
  const B = S.B, G = S.GLOW, hit = S.hit, R = S.rand, WALL = F;
  // ---------------------------------------------------------------- counter (L-shape) with register, lucky cat, jars, bell, bag stack
  { const x0 = 2.45, x1 = 4.75, z0 = -2.38, z1 = -1.72, h = 1.0;
    S.soft((x0 + x1) / 2, -2.0, 1.5, 0.7, 0.4); S.soft(4.45, -1.0, 0.55, 1.0, 0.35);
    B.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, h - 0.05, z1 - z0 - 0.05, mix(P.tealD, P.teal, 0.35), { base: 0.35, tint: 0.04 });
    B.box((x0 + x1) / 2, h - 0.05, (z0 + z1) / 2, x1 - x0 + 0.1, 0.05, z1 - z0 + 0.1, P.woodL, { base: 0.1, tint: 0.03, top: mix(P.pine, P.woodL, 0.3) });
    for (let i = 0; i < 6; i++) B.box(x0 + 0.2 + i * 0.4, 0.12, z1 - 0.03, 0.34, 0.7, 0.02, mix(P.tealD, P.tealL, (i % 2) * 0.2), { base: 0.1, tint: 0.04 });
    B.box((x0 + x1) / 2, 0, z1 - 0.01, x1 - x0, 0.1, 0.05, P.woodD, { base: 0 }); // kick
    B.box(4.45, 0, -1.0, 0.6, h - 0.05, 1.45, mix(P.tealD, P.teal, 0.35), { base: 0.35, tint: 0.04 }); B.box(4.45, h - 0.05, -1.0, 0.7, 0.05, 1.55, P.woodL, { base: 0.1, tint: 0.03, top: mix(P.pine, P.woodL, 0.3) });
    hit.box((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 + 0.05, (z1 - z0) / 2 + 0.05, 0); hit.box(4.45, -1.0, 0.35, 0.78, 0);
    // register: body, drawer, keys, screen decal
    const rx = 3.55, rz = -2.12, ty = h; B.box(rx, ty, rz, 0.4, 0.14, 0.34, P.creamD, { base: 0.15, taper: 0.9 }); B.push(rx, ty + 0.1, rz + 0.06, 0, 1, -0.5); B.box(0, 0, 0, 0.34, 0.1, 0.18, P.cream, { base: 0.1 }); B.pop();
    B.box(rx, ty + 0.16, rz - 0.1, 0.32, 0.17, 0.04, P.ink, { base: 0, rx: -0.1 }); S.screen('register', rx, ty + 0.25, rz - 0.075, 0.28, 0.14, 0, -0.1, [1.1, 1.1, 1.1]);
    for (let i = 0; i < 6; i++) B.box(rx - 0.12 + (i % 3) * 0.08, ty + 0.13 + (i < 3 ? 0.0 : 0.04), rz + 0.12 - (i < 3 ? 0 : 0.045), 0.05, 0.02, 0.04, [P.pink, P.yellow, P.cyan, P.lime, P.coral, P.cream][i], { base: 0 });
    // maneki-neko lucky cat waving, bell, tip jar, candy jar, paper bags, hang-tag spool
    { const cx = 4.35, cz = -2.1; B.blob(cx, ty + 0.14, cz, 0.1, 0.13, 0.09, P.cream, P.white, { detail: 1, jit: 0.04 }); B.blob(cx, ty + 0.3, cz + 0.01, 0.085, 0.075, 0.075, P.cream, P.white, { detail: 1, jit: 0.04 }); B.box(cx - 0.05, ty + 0.35, cz, 0.03, 0.04, 0.03, P.cream, { base: 0 }); B.box(cx + 0.05, ty + 0.35, cz, 0.03, 0.04, 0.03, P.cream, { base: 0 }); B.box(cx, ty + 0.2, cz + 0.085, 0.07, 0.04, 0.01, P.red, { base: 0 }); B.box(cx + 0.1, ty + 0.2, cz + 0.02, 0.05, 0.12, 0.05, P.cream, { base: 0.1, rz: -0.35 }); G.box(cx - 0.015, ty + 0.19, cz + 0.088, 0.03, 0.03, 0.006, YELN, { base: 0, tint: 0 }); }
    B.lathe([[0.04, 0, P.steelL], [0.05, 0.03, P.steelL], [0.0, 0.045, P.steelL]], 8, 2.85, ty, -2.0, {}); B.cyl(2.85, ty + 0.045, -2.0, 0.012, 0.012, 0.03, 6, P.yellow);
    B.lathe([[0.07, 0, P.cream], [0.075, 0.14, mix(P.cream, P.cyan, 0.3)], [0.065, 0.15, P.cream], [0.0, 0.15, P.cream]], 8, 3.0, ty, -2.15, {});
    B.lathe([[0.08, 0, P.cream], [0.085, 0.16, mix(P.cream, P.pink, 0.3)], [0.07, 0.17, P.cream], [0.0, 0.17, P.cream]], 8, 3.15, ty, -1.95, {}); for (let i = 0; i < 6; i++) B.blob(3.15 + (i % 3 - 1) * 0.03, ty + 0.08 + (i % 2) * 0.05, -1.95 + (i % 2 - 0.5) * 0.04, 0.025, 0.02, 0.025, [P.pink, P.yellow, P.lime, P.cyan, P.coral, P.cream][i], [P.pinkL, P.yellow, P.lime, P.cyan, P.coral, P.cream][i], { detail: 0, jit: 0.05 });
    for (let i = 0; i < 4; i++) B.box(3.95 + i * 0.01, ty + i * 0.05, -1.96, 0.2, 0.045, 0.34, [P.cream, P.mustard, P.cream, P.coral][i], { base: 0.1, ry: 0.05 * i }); S.decal('tag_blank', 3.95, ty + 0.2, -1.78, 0.1, 0.065, 0.0, 0, [1, 1, 1]);
    // card display on the return, price cards taped to the front
    S.decal('price0', 2.9, 0.78, z1 + 0.005, 0.14, 0.09, 0, 0, [1.05, 1.05, 1.05]); S.decal('price2', 4.05, 0.62, z1 + 0.005, 0.14, 0.09, 0.05, 0, [1.05, 1.05, 1.05]);
    S.decal('nr', 4.74, 0.6, -0.85, 0.34, 0.1, Math.PI / 2, 0, [1.05, 1.05, 1.05]);
    // glass candy and sunglass tray at the return
    B.box(4.45, h, -0.55, 0.36, 0.03, 0.28, P.woodD, { base: 0 }); [-0.1, 0.1].forEach((dx, i) => B.cyl(4.45 + dx, h + 0.03, -0.55, 0.07, 0.065, 0.05, 6, [P.pinkL, P.mint][i]));
  }
  // back shelf on the north wall behind the counter: boombox, radios, jars, a TV, books, lamp
  { const sx0 = 2.6, sx1 = 4.85, z = -3.84; [1.18, 1.7].forEach((y) => { B.box((sx0 + sx1) / 2, y, z, sx1 - sx0, 0.04, 0.3, P.woodD, { base: 0.2, tint: 0.03 }); [sx0 + 0.05, sx1 - 0.05].forEach((x) => B.box(x, y - 0.22, z, 0.04, 0.22, 0.28, P.woodD, { base: 0.3 })); });
    boombox(B, G, 3.0, 1.22, z + 0.02, 0.1, C('#c8455a'), 1.0);
    B.box(3.8, 1.22, z, 0.3, 0.2, 0.2, mix(P.mustardD, P.ink, 0.2), { base: 0.2 }); B.lathe([[0.04, 0, P.cream], [0.04, 0.02, P.black], [0.0, 0.02, P.black]], 8, 3.76, 1.43, z + 0.1, {}); B.box(3.84, 1.34, z + 0.1, 0.12, 0.04, 0.01, P.cream, { base: 0 });
    B.box(4.35, 1.22, z, 0.3, 0.24, 0.22, P.ink, { base: 0.2, tint: 0.02 }); S.screen('register', 4.35, 1.35, z + 0.113, 0.22, 0.14, 0, 0, [0.7, 0.9, 1.0]); B.box(4.35, 1.46, z, 0.12, 0.02, 0.1, P.steelD, { base: 0 }); bar(B, [4.3, 1.48, z], [4.22, 1.62, z], 0.008, 0.008, P.steelL); bar(B, [4.4, 1.48, z], [4.5, 1.62, z], 0.008, 0.008, P.steelL);
    for (let i = 0; i < 7; i++) B.box(3.2 + i * 0.05, 1.74, z, 0.045, 0.2 + (i % 3) * 0.04, 0.16, [P.pink, P.teal, P.mustard, P.coral, P.indigo, P.cream, P.plum][i], { base: 0.1, ry: (i % 2) * 0.05 });
    [[2.8, P.mint], [3.55, P.pinkL], [4.5, P.mustard]].forEach(([x, c], i) => B.lathe([[0.07, 0, c], [0.1, 0.1, mix(c, P.cream, 0.2)], [0.06, 0.2, c], [0.04, 0.24, c], [0.0, 0.24, c]], 8, x, 1.74, z + 0.02, { tint: 0.04 }));
    lamp(S, 4.65, 1.74, z + 0.02, 0.3, C('#e8604a'), [3.0, 1.5, 0.7]); plant(S, 2.9, 1.74, z + 0.02, 'trail', 0.55, { pot: P.terracotta, pr: 0.09, ph: 0.1 });
    wallScreen(S, WALL.N, 'neon_thrift', 3.7 + 5.0, 0.04, 2.34, 1.5, 0.5, [1.25, 1.25, 1.25]); S.lights.push({ x: 3.7, y: 2.3, z: -3.5, color: '#ffd23f', r: 5, i: 0.55, kind: 'neon' });
    S.lights.push({ x: 4.65, y: 2.1, z: -3.4, color: '#ffb066', r: 4.5, i: 0.7, kind: 'lamp' });
  }
  // ---------------------------------------------------------------- the window display (west storefront) with the mannequin and the neon OPEN sign
  { const f = WALL.W, uC = 4.8; B.box(-4.65, 0, -0.8, 0.7, 0.14, 3.0, mix(P.plumD, P.plum, 0.4), { base: 0.3, tint: 0.03, top: mix(C('#a86bff'), P.plumD, 0.55) }); S.hit.box(-4.65, -0.8, 0.36, 1.5, 0);
    mannequin(S, -4.62, 0.14, -1.45, 1.0);
    // suitcase stack and a gramophone horn: mismatched thrift charm
    B.box(-4.62, 0.14, 0.15, 0.62, 0.2, 0.42, C('#a86b4a'), { base: 0.2, tint: 0.04, ry: 0.15 }); B.box(-4.6, 0.34, 0.15, 0.5, 0.16, 0.34, C('#3f8f8a'), { base: 0.15, ry: -0.1 }); B.box(-4.6, 0.5, 0.14, 0.4, 0.12, 0.26, C('#e8c06a'), { base: 0.15, ry: 0.25 });
    // neon OPEN sign hung on two chains in the glass, plus painted lettering on the pane
    const sy = 1.78, p = f.pt(uC, 0.16); S.screen('open', p[0], sy, p[1], 0.9, 0.45, Math.atan2(f.nx, f.nz), 0, [1.25, 1.25, 1.25]);
    [-0.4, 0.4].forEach((du) => { const q = f.pt(uC + du, 0.16); bar(B, [q[0], sy + 0.22, q[1]], [q[0], 2.28, q[1]], 0.008, 0.008, P.steelD); });
    wallDecal(S, f, 'window_text', uC - 0.05, -0.13, 1.28, 1.35, 0.5, [1, 1, 1]);
    S.lights.push({ x: -4.0, y: 1.7, z: -0.8, color: '#ff4f8b', r: 5.5, i: 0.9, kind: 'neon' });
    // string lights along the window top, framed prints above the display
    for (let i = 0; i < 9; i++) { const q = f.pt(uC - 1.4 + i * 0.35, 0.12); G.blob(q[0], 2.33 - Math.sin(i / 8 * Math.PI) * -0.0 - 0.04 * Math.sin(i * 1.4), q[1], 0.03, 0.03, 0.03, [[3.0, 2.0, 0.6], [0.6, 2.6, 2.8], [3.0, 0.8, 1.6], [1.0, 2.8, 0.8]][i % 4], [[3.0, 2.0, 0.6], [0.6, 2.6, 2.8], [3.0, 0.8, 1.6], [1.0, 2.8, 0.8]][i % 4], { detail: 0, jit: 0.02 }); }
  }
  // ---------------------------------------------------------------- east side: $1 record bins, a mismatched armchair, floor lamp, rugs
  S.decal('rug_a', -1.0, 0.017, 1.7, 3.0, 1.31, 0.0, -Math.PI / 2, [1, 1, 1]); S.decal('rug_b', 3.75, 0.017, 2.3, 1.9, 1.9, 0.0, -Math.PI / 2, [1, 1, 1]); S.decal('rug_c', 2.05, 0.017, 3.55, 1.0, 0.8, 0.0, -Math.PI / 2, [1, 1, 1]);
  [0.55, 1.35].forEach((z, k) => { const x = 4.4; S.soft(x, z, 0.6, 0.5, 0.35); B.box(x, 0.0, z, 0.52, 0.5, 0.95, C(k ? '#8a5a3a' : '#a46a3d'), { base: 0.3, tint: 0.05 }); B.box(x - 0.2, 0.5, z, 0.04, 0.12, 0.95, P.woodD, { base: 0.1 });
    for (let i = 0; i < 9; i++) { S.decal('sleeve' + ((i + k) % 4), x + 0.05 + (i % 2) * 0.01, 0.62, z - 0.4 + i * 0.1, 0.3, 0.3, Math.PI / 2 + (i % 3 - 1) * 0.02, -0.18, [1.05, 1.05, 1.05]); }
    hit.box(x, z, 0.28, 0.5, 0); S.decal('bin_label', x - 0.27, 0.43, z, 0.5, 0.17, -Math.PI / 2, 0, [1.05, 1.05, 1.05]); });
  { const ax = 3.8, az = 2.55, ry = -1.9; S.soft(ax, az, 0.8, 0.8, 0.4); B.push(ax, 0, az, ry);
    [-0.32, 0.32].forEach((dx) => [-0.28, 0.28].forEach((dz) => B.box(dx, 0, dz, 0.06, 0.16, 0.06, P.woodD, { base: 0 }))); B.box(0, 0.14, 0, 0.78, 0.26, 0.7, C('#c8704a'), { base: 0.3, tint: 0.04 }); B.box(0, 0.4, 0.04, 0.58, 0.1, 0.5, C('#e8a04a'), { base: 0.1, tint: 0.05, top: C('#f2b862') });
    B.box(0, 0.4, -0.3, 0.78, 0.55, 0.14, C('#c8704a'), { base: 0.2, tint: 0.04, taper: 0.94 }); [-0.37, 0.37].forEach((dx) => B.box(dx, 0.4, 0.0, 0.1, 0.22, 0.6, mix(C('#c8704a'), P.plumD, 0.3), { base: 0.1 }));
    B.box(0.0, 0.5, -0.12, 0.3, 0.3, 0.1, C('#8f5a98'), { base: 0.05, rx: -0.3, tint: 0.06 }); B.pop(); hit.circle(ax, az, 0.5);
    lamp(S, 4.6, 0.0, 1.85, 1.55, C('#f2c14a'), [3.0, 2.1, 0.8]); S.lights.push({ x: 4.55, y: 1.65, z: 1.85, color: '#ffc27a', r: 5.5, i: 0.8, kind: 'lamp' }); hit.circle(4.6, 1.85, 0.18); }
  // vintage portable TV on a crate with static, a stack of suitcases, a monstera and a fiddle leaf
  { const tx = 4.6, tz = 3.35; S.soft(tx, tz, 0.5, 0.45, 0.35); B.box(tx, 0, tz, 0.5, 0.45, 0.42, C('#7a4a32'), { base: 0.3, tint: 0.05 }); B.box(tx, 0.45, tz, 0.4, 0.3, 0.3, C('#c9a46a'), { base: 0.1, tint: 0.03 }); B.box(tx - 0.04, 0.49, tz - 0.0, 0.26, 0.2, 0.012, P.ink, { base: 0, ry: -0.5 }); hit.circle(tx, tz, 0.3); }
  plant(S, -4.62, 0, 3.55, 'monstera', 1.1, { pot: P.terracotta, pr: 0.26, ph: 0.34 }); S.soft(-4.62, 3.55, 0.5, 0.5, 0.35); hit.circle(-4.62, 3.55, 0.3);
  plant(S, 0.3, 0, -3.55, 'fiddle', 1.15, { pot: P.cream, pr: 0.22, ph: 0.3 }); S.soft(0.3, -3.55, 0.5, 0.5, 0.35); hit.circle(0.3, -3.55, 0.28);
  plant(S, 4.55, 0, 0.15, 'fern', 1.0, { pot: P.mustard, pr: 0.17, ph: 0.2 }); hit.circle(4.55, 0.15, 0.2);
  // ---------------------------------------------------------------- wall dressing: posters, frames cluster, clock, bunting
  const WW = WALL.W, NN = WALL.N;
  wallDecal(S, WW, 'poster_c', 7.55, 0.02, 1.6, 0.4, 0.56, [1.05, 1.05, 1.05], 0.03); wallDecal(S, WW, 'poster_b', 7.0, 0.02, 1.55, 0.4, 0.56, [1.05, 1.05, 1.05], -0.04); wallDecal(S, WW, 'sale', 2.95, 0.02, 1.75, 0.46, 0.6, [1.08, 1.08, 1.08], 0.02);
  wallDecal(S, WW, 'poster_a', 2.8, 0.02, 1.12, 0.27, 0.38, [1.0, 1.0, 1.0], -0.05); wallDecal(S, NN, 'poster_a', 5.0 + 0.9, 0.02, 1.7, 0.4, 0.56, [1.05, 1.05, 1.05]);
  wallDecal(S, NN, 'clock', 5.0 + 2.2, 0.03, 2.08, 0.3, 0.3, [1.05, 1.05, 1.05]); wbox(B, NN, 5.0 + 2.2, 0.02, 1.92, 0.34, 0.34, 0.02, P.ink, { base: 0 });
  wallDecal(S, NN, 'hours', 5.0 + 2.2, 0.02, 1.55, 0.2, 0.13, [1.05, 1.05, 1.05]);
  { const fr = [[0.16, 2.0, 0.3, 0.4, P.woodD], [0.58, 2.12, 0.22, 0.22, P.mustard], [0.62, 1.78, 0.26, 0.3, P.teal], [0.2, 1.6, 0.3, 0.24, P.coralD]]; fr.forEach(([du, y, w, h, c], i) => { const u = 4.2 + du; wbox(B, NN, u, 0.03, y - h / 2 - 0.03, w + 0.06, h + 0.06, 0.04, c, { base: 0.1 }); wallDecal(S, NN, ['poster_a', 'poster_b', 'poster_c', 'sale'][i], u, 0.055, y, w, h, [1.0, 1.0, 1.0], (i - 1.5) * 0.03); }); }
  // bunting: a wire along the north wall under the cornice with triangular flags
  { const y0 = 2.5, x0 = -1.0, x1 = 5.0, n = 16; bar(B, [x0, y0, -3.95], [x1, y0 - 0.05, -3.95], 0.006, 0.006, P.ink); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, y = y0 - 0.05 * t - 0.035 * Math.sin(t * Math.PI * 4), c = [P.pink, P.cyan, P.yellow, P.lime, P.coral, P.violet][i % 6], w = 0.15; B.tri([x - w / 2, y, -3.94], [x + w / 2, y, -3.94], [x, y - 0.2, -3.94], c, c, mul(c, 0.85)); B.tri([x - w / 2, y, -3.94], [x, y - 0.2, -3.94], [x + w / 2, y, -3.94], c, mul(c, 0.85), c); } }
  // ---------------------------------------------------------------- door dressing and the sidewalk outside
  if (S.leaf) { const L = S.leaf, nx = Math.sin(L.ry), nz = Math.cos(L.ry); S.decal('door', L.x + nx * 0.028, 1.03, L.z + nz * 0.028, L.dw - 0.05, 1.96, L.ry, 0, [1.05, 1.05, 1.05]); S.decal('door', L.x - nx * 0.028, 1.03, L.z - nz * 0.028, L.dw - 0.05, 1.96, L.ry + Math.PI, 0, [1.0, 1.0, 1.0]); }
  { const mx = 2.05, mz = 3.45; B.box(mx, 0, mz, 1.0, 0.014, 0.6, mix(P.terracotta, P.ink, 0.3), { base: 0.2 }); }
  // sidewalk: A-frame chalkboard, a bin, a bike rack with a cruiser, a lamp post, a planter
  { const ax = 3.5, az = 4.95; S.soft(ax, az, 0.55, 0.4, 0.35); B.push(ax, 0, az, 0.2); B.push(0, 0, -0.15, 0, 1, 0.22); B.box(0, 0, 0, 0.62, 0.9, 0.04, P.woodD, { base: 0.1 }); B.pop(); B.push(0, 0, 0.15, 0, 1, -0.22); B.box(0, 0, 0, 0.62, 0.9, 0.04, P.woodD, { base: 0.1 }); B.pop(); B.pop();
    S.decal('chalk', ax + Math.sin(0.2) * 0.0 + 0.03, 0.46, az + 0.19, 0.5, 0.4, 0.2, -0.22, [1.05, 1.05, 1.05]); S.decal('chalk', ax - 0.03, 0.46, az - 0.19, 0.5, 0.4, 0.2 + Math.PI, -0.22, [1.0, 1.0, 1.0]); }
  { const px = -3.2, pz = 5.0; S.soft(px, pz, 0.8, 0.4, 0.35); B.box(px, 0, pz, 1.3, 0.34, 0.45, P.woodD, { base: 0.3, tint: 0.04 }); for (let i = 0; i < 6; i++) B.blob(px - 0.5 + i * 0.2, 0.42, pz + (i % 2 - 0.5) * 0.1, 0.13, 0.1, 0.12, P.leafD, P.leaf[i % 4], { detail: 1, jit: 0.15 }); for (let i = 0; i < 5; i++) B.blob(px - 0.4 + i * 0.2, 0.52, pz + (i % 2 - 0.5) * 0.14, 0.04, 0.04, 0.04, [P.pink, P.yellow, P.cream, P.coral, P.violet][i], [P.pinkL, P.yellow, P.cream, P.coral, P.violet][i], { detail: 0, jit: 0.05 }); }
  { const bx = -1.2, bz = 5.0; S.soft(bx, bz, 0.3, 0.3, 0.35); B.cyl(bx, 0, bz, 0.2, 0.17, 0.55, 8, mix(P.steelD, P.teal, 0.3)); B.cyl(bx, 0.55, bz, 0.22, 0.22, 0.04, 8, P.steelL); B.cyl(bx, 0.59, bz, 0.04, 0.04, 0.03, 6, P.ink); }
  { const lx = -4.6, lz = 5.15; B.cyl(lx, 0, lz, 0.1, 0.1, 0.06, 8, P.ink); B.cyl(lx, 0.06, lz, 0.035, 0.03, 2.9, 6, P.ink); bar(B, [lx, 2.9, lz], [lx + 0.5, 3.05, lz], 0.03, 0.03, P.ink); B.box(lx + 0.5, 2.93, lz, 0.22, 0.05, 0.14, P.ink, { base: 0 }); G.box(lx + 0.42, 2.88, lz - 0.05, 0.16, 0.04, 0.1, [3.4, 2.5, 1.2], { base: 0, tint: 0 }); S.lights.push({ x: lx + 0.5, y: 2.8, z: lz, color: '#ffd9a0', r: 6, i: 0.5, kind: 'lamp' }); }
}
