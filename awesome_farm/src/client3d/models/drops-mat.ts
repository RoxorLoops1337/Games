// Loot models: materials, ores, bars and crafted parts.
import { au, curve, type DropSpec, glint, hg, ingot, INK, R, ring, spike } from './drops-shapes';
import { Col, hash3, lighten, M, MB, mix, TAU } from './kit';

export const S = (build: (mb: MB) => void, o: Partial<DropSpec> = {}): DropSpec => ({ build, ...o });
export function logs(mb: MB) {
    const b = mb.main, W12 = R.wood, h = Math.PI / 2, pale = 0xe8c088;
    const bark = (len: number, ry: number, px: number, pz: number) => au((x: number, y: number, z: number) => {
        const along = (x - px) * Math.cos(ry) - (z - pz) * Math.sin(ry);
        return Math.abs(along) > len ? pale : W12[3 + Math.floor(hash3(x * 5, y * 5, z * 5) * 1.9)];
    });
    b.cyl(0.3, 0.3, 0.9, 8, bark(0.43, 0.6, -0.02, 0.14), { x: -0.02, y: 0.3, z: 0.14, rz: h, ry: 0.6, j: 0.012 });
    b.cyl(0.21, 0.21, 0.93, 6, W12[4], { x: -0.02, y: 0.3, z: 0.14, rz: h, ry: 0.6, ao: false });
    b.cyl(0.12, 0.12, 0.94, 5, W12[3], { x: -0.02, y: 0.3, z: 0.14, rz: h, ry: 0.6, ao: false });
    b.cyl(0.04, 0.04, 0.95, 4, W12[1], { x: -0.02, y: 0.3, z: 0.14, rz: h, ry: 0.6, ao: false });
    b.cyl(0.22, 0.22, 0.72, 6, bark(0.34, -0.5, 0.06, -0.13), { x: 0.06, y: 0.62, z: -0.13, rz: h, ry: -0.5, j: 0.012 });
    b.cyl(0.13, 0.13, 0.74, 5, W12[3], { x: 0.06, y: 0.62, z: -0.13, rz: h, ry: -0.5, ao: false });
    b.cone(0.05, 0.14, 4, W12[3], { x: -0.3, y: 0.6, z: 0.2, rz: 1.1, j: 0.01 });
}
export function stone(mb: MB) {
    const b = mb.main, st = R.stone;
    b.dode(0.4, hg(st, 0.05, 0.7, 0.6), { y: 0.3, sy: 0.78, sx: 1.12, ry: 0.4, j: 0.1 });
    b.dode(0.22, hg(st, 0, 0.45, 0.6), { x: 0.4, y: 0.14, z: 0.14, sy: 0.72, ry: 1.2, j: 0.06 });
    b.dode(0.16, hg(st, 0, 0.4, 0.6), { x: -0.34, y: 0.1, z: -0.2, sy: 0.7, j: 0.05 });
}
export function coal(mb: MB) {
    const b = mb.main, c = R.coal;
    b.dode(0.38, hg([c[1], c[2], c[3], 0x6e6a82], 0.05, 0.7, 0.8), { y: 0.3, sy: 0.82, sx: 1.08, ry: 0.5, j: 0.12 });
    b.dode(0.22, hg([c[0], c[1], c[2], c[3]], 0, 0.5, 0.7), { x: 0.4, y: 0.15, z: 0.12, sy: 0.75, ry: 1, j: 0.07 });
    b.dode(0.15, hg([c[0], c[1], c[2], c[3]], 0, 0.4, 0.7), { x: -0.32, y: 0.1, z: -0.14, sy: 0.7, j: 0.05 });
    for (const [x, y, z] of [[-0.12, 0.55, 0.18], [0.14, 0.5, 0.26], [0.34, 0.26, 0.28], [-0.3, 0.38, 0.22]]) glint(mb, x, y, z, 0.045, 0xcdd2ff, 1.4);
}
export function oreChunk(mb: MB, nug: readonly number[], glowCol?: number) {
    const b = mb.main, st = R.stone;
    b.dode(0.4, hg(st, 0.05, 0.7, 0.55), { y: 0.3, sy: 0.8, sx: 1.1, ry: 0.4, j: 0.1 });
    b.dode(0.21, hg(st, 0, 0.45, 0.55), { x: 0.4, y: 0.14, z: 0.14, sy: 0.72, ry: 1.2, j: 0.06 });
    const spots = [[-0.17, 0.6, 0.1, 0.15], [0.13, 0.62, -0.06, 0.17], [-0.04, 0.42, 0.34, 0.14], [0.34, 0.34, 0.26, 0.11], [-0.34, 0.4, -0.04, 0.13]];
    spots.forEach(([x, y, z, r], i) => {
        const g = glowCol ? mb.glow(glowCol, 0.8) : b;
        g.oct(r, nug[i % nug.length], { x, y, z, sy: 1.3, ry: i * 1.3, rz: i * 0.5 - 0.7, j: 0.014, v: 0.12, ao: false });
    });
}
export function mound(mb: MB, ramp: readonly number[], pebble: Col) {
    const b = mb.main;
    b.ico(0.46, 0, hg(ramp, 0, 0.4, 0.5), { y: 0.1, sy: 0.6, sx: 1.1, ry: 0.3, j: 0.08 });
    b.ico(0.3, 0, hg(ramp, 0, 0.35, 0.5), { x: 0.34, y: 0.06, z: 0.2, sy: 0.6, j: 0.06 });
    b.ico(0.24, 0, hg(ramp, 0, 0.3, 0.5), { x: -0.3, y: 0.05, z: -0.2, sy: 0.6, j: 0.05 });
    for (const [x, y, z] of [[-0.1, 0.36, 0.2], [0.2, 0.28, 0.32], [0.38, 0.12, -0.12], [-0.4, 0.1, 0.18]]) b.tet(0.06, pebble, { x, y, z, ry: x * 9, j: 0.01, ao: false });
}
export function peat(mb: MB) {
    const b = mb.main, P = R.peat, g = R.leaf;
    b.box(0.74, 0.4, 0.56, hg([P[1], P[2], P[3], 0x9a7e60], 0, 0.4, 0.6), { y: 0.2, ry: 0.4, j: 0.05 });
    b.box(0.74, 0.08, 0.56, (x: number, y: number, z: number) => g[1 + Math.floor(hash3(x * 7, y, z * 7) * 2)], { y: 0.43, ry: 0.4, j: 0.05, ao: false });
    b.box(0.34, 0.26, 0.3, hg([P[1], P[2], P[3], 0x9a7e60], 0, 0.3, 0.6), { x: 0.4, y: 0.13, z: 0.28, ry: -0.4, j: 0.04 });
    for (let i = 0; i < 4; i++) b.blade(-0.14 + i * 0.1, -0.05 + i % 2 * 0.1, 0.18 + i % 3 * 0.04, (i - 1.5) * 0.06, 0.02, 0.025, g[2 + i % 2], { y: 0.46 });
}
export function fiber(mb: MB) {
    const b = mb.main, g = R.leaf;
    for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, lean = 0.14 + i % 3 * 0.1;
        b.blade(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.92 - i % 3 * 0.1, Math.cos(a) * lean, Math.sin(a) * lean, 0.075, au((_x: number, y: number) => y > 0.6 ? g[4] : g[3]), { y: 0.02 });
    }
    mb.main.cyl(0.14, 0.15, 0.1, 7, R.leather[2], { y: 0.28, j: 0.01 });
    mb.main.cyl(0.13, 0.14, 0.08, 7, R.leather[3], { y: 0.28, ao: false });
}
export function herb(mb: MB) {
    const b = mb.main, g = R.leaf;
    for (let i = 0; i < 6; i++) {
        const el = 0.35 + i % 3 * 0.35;
        b.leaf(0.7 - i % 3 * 0.08, 0.21, 0.025, hg([g[0], g[1], g[2], g[3]], 0.1, 0.8, 0.4, i), { y: 0.2 + i % 3 * 0.1, ry: i / 6 * TAU, rx: -el, j: 0.01, v: 0.1 });
    }
    b.rod([0, 0, 0], [0, 0.3, 0], 0.045, 5, R.moss[1]);
    for (let i = 0; i < 3; i++) glint(mb, Math.cos(i * 2.1) * 0.22, 0.62 + i * 0.05, Math.sin(i * 2.1) * 0.22, 0.04, 0xf79fc6, 0.7);
}
export function cotton(mb: MB) {
    const b = mb.main, c = [0xe3d6c4, 0xf4ead8, 0xfffaf0, 0xffffff];
    const balls = [[0, 0.5, 0, 0.3], [0.26, 0.42, 0.1, 0.22], [-0.24, 0.4, -0.04, 0.23], [0.02, 0.38, 0.26, 0.2], [-0.02, 0.62, -0.16, 0.2]];
    balls.forEach(([x, y, z, r], i) => b.ico(r, 0, hg(c, 0.2, 0.85, 0.6, i), { x, y, z, ry: i, j: 0.035 }));
    for (let i = 0; i < 4; i++) b.leaf(0.28, 0.1, 0.015, R.leaf[1], { y: 0.14, ry: i / 4 * TAU + 0.5, rx: -0.45, j: 0.01 });
    b.cone(0.12, 0.2, 4, R.leaf[0], { y: 0.14, rx: Math.PI, ry: 0.4 });
}
export function plank(mb: MB) {
    const b = mb.main, W12 = R.wood;
    const board = (x: number, y: number, z: number, ry: number, w: number) => {
        b.box(w, 0.12, 0.4, au((_px: number, py: number) => py > y + 0.1 ? W12[4] : W12[3]), { x, y, z, ry, j: 0.01 });
        for (const dz of [-0.1, 0.07]) b.box(w * 0.92, 0.02, 0.018, W12[2], { x, y: y + 0.07, z: z + dz, ry, ao: false, v: 0 });
        b.box(0.02, 0.1, 0.38, W12[1], { x: x + Math.cos(ry) * w / 2, y, z: z - Math.sin(ry) * w / 2, ry, ao: false, v: 0 });
    };
    board(0, 0.06, 0.16, 0.1, 0.9);
    board(0.06, 0.18, -0.14, -0.12, 0.84);
    board(-0.04, 0.3, 0.12, 0.24, 0.78);
}
export function bricks(mb: MB) {
    const b = mb.main, c = R.brick;
    const brick = (x: number, y: number, z: number, ry: number, i: number) => b.box(0.56, 0.22, 0.3, au((_x: number, py: number) => py > y + 0.2 ? c[3] : c[2]), { x, y, z, ry, j: 0.012, v: 0.07 + i * 0.01 });
    brick(-0.28, 0.11, 0.18, 0.05, 0);
    brick(0.3, 0.11, 0.1, -0.08, 1);
    brick(0.02, 0.33, -0.1, 0.18, 2);
}
export const glassMat = M(0xffffff, { vc: true, r: 0.12, m: 0.2, t: 0.72 });
export function glass(mb: MB) {
    const b = mb.custom('glass', glassMat, true), pale = 0xcdf4ee, edge = 0x6ac6d8;
    b.box(0.74, 0.84, 0.09, au((x: number, y: number) => Math.abs(x) > 0.33 || Math.abs(y - 0.5) > 0.38 ? edge : pale), { y: 0.5, ry: 0, j: 0.004, v: 0.03, ao: false });
    b.box(0.5, 0.56, 0.07, au((x: number, y: number) => Math.abs(x) > 0.23 || Math.abs(y - 0.52) > 0.26 ? edge : lighten(pale, 0.4)), { x: 0.14, y: 0.46, z: 0.07, ry: 0.25, j: 0.004, v: 0.03, ao: false });
    mb.glow(0xffffff, 0.8).box(0.05, 0.64, 0.02, 0xffffff, { x: -0.2, y: 0.56, z: 0.06, rz: 0.5, ao: false, v: 0 });
    mb.glow(0xffffff, 0.8).box(0.03, 0.36, 0.02, 0xffffff, { x: -0.09, y: 0.5, z: 0.06, rz: 0.5, ao: false, v: 0 });
}
export function ingots(mb: MB, ramp: readonly number[], o: { long?: boolean; stamp?: number; spark?: boolean } = {}) {
    const b = mb.shiny(), w = o.long ? 0.62 : 0.54, d = o.long ? 0.26 : 0.3, h = o.long ? 0.17 : 0.2;
    ingot(b, ramp, { x: -0.26, z: 0.1, ry: 0.08 }, w, d, h);
    ingot(b, ramp, { x: 0.3, z: 0.04, ry: -0.06 }, w, d, h);
    ingot(b, ramp, { x: 0.02, y: h, z: -0.18, ry: o.long ? Math.PI / 2 + 0.12 : 0.12 }, w, d, h);
    if (o.stamp) b.box(0.18, 0.012, 0.09, o.stamp, { x: 0.02, y: h * 2 - 0.004, z: -0.18, ry: 0.12, ao: false, v: 0 });
    if (o.spark) glint(mb, 0.18, 0.6, 0.08, 0.06, 0xfffbd0, 2.4);
}
export function cloth(mb: MB, main: number, hi: number, stripe: number) {
    const b = mb.main;
    for (let i = 0; i < 3; i++) {
        const y = i * 0.17, ry = (i - 1) * 0.16, off = (i - 1) * 0.05;
        b.box(0.82 - i * 0.04, 0.15, 0.6, au((_x: number, py: number) => py > y + 0.12 ? hi : main), { x: off, y: y + 0.075, z: 0, ry, j: 0.012, v: 0.05 });
        b.box(0.84 - i * 0.04, 0.045, 0.02, stripe, { x: off + Math.sin(ry) * 0.3, y: y + 0.08, z: 0.3 * Math.cos(ry), ry, ao: false, v: 0 });
    }
}
export function rope(mb: MB) {
    const b = mb.main, c = R.sand;
    ring(b, 0.3, 0.1, c[1], { y: 0.1, j: 0.01 }, 8, 3);
    ring(b, 0.3, 0.1, c[2], { y: 0.26, ry: 0.4, j: 0.01 }, 8, 3);
    curve(b, [[0.28, 0.3, 0.05], [0.4, 0.2, 0.3], [0.5, 0.08, 0.5]], 0.075, 0.05, 3, c[2]);
}
export function gearCog(mb: MB) {
    const b = mb.shiny(), I = R.iron, n = 8;
    b.cyl(0.33, 0.33, 0.16, n, hg(I, 0, 0.2, 0.3), { y: 0.3, ry: 0.2, j: 0.006 });
    for (let i = 0; i < n; i++) {
        const a = i / n * TAU + 0.2;
        b.box(0.16, 0.16, 0.15, I[2], { x: Math.cos(a) * 0.4, y: 0.3, z: -Math.sin(a) * 0.4, ry: a, j: 0.006 });
    }
    b.cyl(0.14, 0.14, 0.18, 6, 0x35305c, { y: 0.3, ao: false, v: 0.02 });
}
export function wireSpool(mb: MB) {
    const b = mb.main, C = R.copper;
    b.cyl(0.14, 0.14, 0.5, 6, R.iron[1], { y: 0.28, ao: false });
    b.cyl(0.4, 0.4, 0.07, 7, R.iron[1], { y: 0.03, ry: 0.2, j: 0.008 });
    b.torus(0.27, 0.085, 3, 7, au((_x: number, y: number) => C[y > 0.2 ? 2 : 1]), { y: 0.16, rx: Math.PI / 2, ry: 0, v: 0.08 });
    b.torus(0.27, 0.085, 3, 7, au((_x: number, y: number) => C[y > 0.4 ? 3 : 2]), { y: 0.33, rx: Math.PI / 2, ry: 0.5, v: 0.08 });
    b.rod([0.26, 0.38, 0.1], [0.5, 0.06, 0.5], 0.04, 3, C[2], 0.03);
}
export function circuit(mb: MB) {
    const b = mb.main, g = R.green;
    b.box(0.9, 0.08, 0.64, au((_x: number, y: number) => y > 0.07 ? g[2] : g[1]), { y: 0.04, j: 0.006, v: 0.06 });
    b.box(0.32, 0.12, 0.3, 0x35305c, { x: 0.04, y: 0.14, z: 0, ry: 0, j: 0.004, v: 0.04 });
    for (const sx of [-1, 1]) b.box(0.06, 0.03, 0.34, R.iron[2], { x: 0.04 + sx * 0.19, y: 0.08, ao: false, v: 0 });
    b.box(0.86, 0.02, 0.06, R.gold[2], { y: 0.085, z: 0.27, ao: false, v: 0.03 });
    b.box(0.5, 0.012, 0.03, R.gold[1], { x: -0.2, y: 0.082, z: -0.12, ao: false, v: 0 });
    b.box(0.03, 0.012, 0.3, R.gold[1], { x: -0.4, y: 0.082, z: 0.06, ao: false, v: 0 });
    b.cyl(0.07, 0.07, 0.12, 5, 0xe85d62, { x: -0.3, y: 0.14, z: -0.06 });
    b.cyl(0.06, 0.06, 0.1, 5, 0x4ab2cf, { x: 0.36, y: 0.13, z: -0.15 });
    mb.glow(0x92d364, 1.4).box(0.05, 0.03, 0.05, 0x92d364, { x: 0.32, y: 0.1, z: 0.13, ao: false, v: 0 });
}
export function flour(mb: MB) {
    const b = mb.main, c = [0xe4d4bc, 0xf4e8d2, 0xfff6e0, 0xffffff];
    b.lathe([[0, 0], [0.34, 0], [0.46, 0.14], [0.46, 0.34], [0.32, 0.52], [0.15, 0.6]], 7, hg(c, 0, 0.6, 0.3), { j: 0.015, v: 0.05 });
    b.cone(0.3, 0.34, 7, c[2], { y: 0.8, rx: Math.PI, j: 0.02, ao: false, v: 0.05 });
    b.cyl(0.15, 0.19, 0.09, 7, R.leather[2], { y: 0.62, j: 0.01 });
    b.box(0.34, 0.26, 0.03, R.teal[2], { y: 0.3, z: 0.45, rx: -0.1, ao: false, v: 0.03 });
    b.box(0.14, 0.14, 0.04, R.gold[2], { y: 0.3, z: 0.46, rx: -0.1, ao: false, v: 0 });
    b.ico(0.17, 0, c[3], { x: 0.4, y: 0.08, z: 0.3, sy: 0.55, j: 0.02, ao: false });
}
export function motor(mb: MB) {
    const b = mb.shiny(), I = R.iron, h = Math.PI / 2;
    b.cyl(0.33, 0.33, 0.62, 8, hg(I, 0, 0.6, 0.35), { x: -0.06, y: 0.36, rz: h, j: 0.006 });
    b.tube(0.35, 0.35, 0.12, 8, R.copper[2], { x: 0.12, y: 0.36, rz: h });
    b.tube(0.35, 0.35, 0.12, 8, R.copper[2], { x: -0.24, y: 0.36, rz: h });
    b.cyl(0.07, 0.07, 0.42, 5, R.iron[3], { x: 0.44, y: 0.36, rz: h });
    b.cyl(0.14, 0.14, 0.07, 6, R.iron[2], { x: 0.58, y: 0.36, rz: h });
    b.box(0.3, 0.08, 0.52, I[0], { x: -0.1, y: 0.04 });
    b.box(0.12, 0.06, 0.2, 0xf8a24a, { x: -0.22, y: 0.7, z: 0, j: 0.004 });
    mb.glow(0xf8a24a, 0.9).box(0.04, 0.04, 0.04, 0xf8a24a, { x: -0.22, y: 0.76, ao: false, v: 0 });
}
export function powerCore(mb: MB) {
    const b = mb.shiny(), G = R.gold;
    mb.glow(0x4ab2cf, 1.4).oct(0.25, au((_x: number, y: number) => y > 0.5 ? 0xbdf0f8 : 0x6ad0e8), { y: 0.5, sy: 1.7, ry: 0.5, ao: false, v: 0.08 });
    mb.glow(0x4ab2cf, 1.4).oct(0.16, 0xe8fbff, { y: 0.5, sx: 1.6, sz: 1.6, sy: 0.6, ry: 0.5, ao: false, v: 0.05 });
    b.torus(0.4, 0.045, 3, 8, G[2], { y: 0.5 });
    b.torus(0.4, 0.045, 3, 8, R.copper[2], { y: 0.5, ry: 1.3 });
    b.cyl(0.2, 0.26, 0.1, 6, R.copper[1], { y: 0.02 });
    b.box(0.3, 0.07, 0.3, G[2], { y: 0.96, ry: 0.4, ao: false });
}
export function slimegel(mb: MB) {
    const b = mb.shiny(), V = R.violet;
    b.ico(0.4, 0, hg([0x6a52a6, 0x9d6fdb, 0xbba0ee, 0xe8dcff], 0, 0.7, 0.35), { y: 0.36, sy: 0.82, sx: 1.12, ry: 0.6, j: 0.04, v: 0.05 });
    b.ico(0.2, 0, hg([0x6a52a6, 0x9d6fdb, 0xbba0ee, 0xe8dcff], 0, 0.4, 0.35), { x: 0.4, y: 0.17, z: 0.12, sy: 0.75, j: 0.03 });
    b.ico(0.12, 0, V[2], { x: -0.34, y: 0.1, z: 0.28, sy: 0.75, j: 0.02 });
    mb.glow(0xffffff, 1.2).ico(0.075, 0, 0xffffff, { x: -0.12, y: 0.6, z: 0.2, sy: 1.3, ao: false, v: 0 });
    mb.glow(0xffffff, 1).ico(0.04, 0, 0xffffff, { x: 0.06, y: 0.66, z: 0.16, ao: false, v: 0 });
}
export function bone(mb: MB) {
    const b = mb.main, B = R.bone;
    b.rod([0, 0.18, 0], [0, 0.82, 0], 0.095, 5, hg(B, 0, 1, 0.3), 0.095, { j: 0.008 });
    for (const [x, y] of [[-0.11, 0.1], [0.11, 0.1], [-0.11, 0.9], [0.11, 0.9]]) b.ico(0.16, 0, hg(B, 0, 1, 0.3), { x, y, ry: x * 5, j: 0.012 });
    b.rod([0, 0.3, 0], [0, 0.7, 0.01], 0.045, 4, B[1], 0.045, { x: 0.06, z: 0.06, ao: false });
}
export function batwing(mb: MB) {
    const b = mb.main, D = [0x35305c, 0x7a62a0, 0x9d84c4, 0xc4b0e0], th = 0.025;
    const W0 = [-0.08, 0.1], tips = [[0.52, 0.86], [0.62, 0.52], [0.52, 0.2], [0.34, -0.02]];
    b.rod([-0.34, 0.02, 0], [W0[0], W0[1], 0], 0.05, 4, D[0]);
    for (const [x, y] of tips) b.rod([W0[0], W0[1], 0], [x, y, 0], 0.03, 3, D[0], 0.012);
    for (let i = 0; i < tips.length - 1; i++) {
        const [x1, y1] = tips[i], [x2, y2] = tips[i + 1];
        b.hull([[W0[0], W0[1], th], [x1, y1, th], [(x1 + x2) / 2 - 0.06, (y1 + y2) / 2, th], [x2, y2, th], [W0[0], W0[1], -th], [x1, y1, -th], [(x1 + x2) / 2 - 0.06, (y1 + y2) / 2, -th], [x2, y2, -th]], au((x: number, y: number) => hash3(x * 9, y * 9, i) > 0.5 ? D[1] : D[2]), { y: 0, j: 0.01, v: 0.06 });
    }
    b.hull([[-0.34, 0.02, th], [W0[0], W0[1], th], [tips[3][0], tips[3][1], th], [-0.2, -0.1, th], [-0.34, 0.02, -th], [W0[0], W0[1], -th], [tips[3][0], tips[3][1], -th], [-0.2, -0.1, -th]], D[1], { v: 0.06 });
    b.ico(0.04, 0, 0xfff6e0, { x: 0.52, y: 0.86 });
}
export function hide(mb: MB) {
    const b = mb.main, L = R.leather, h = Math.PI / 2;
    b.cyl(0.27, 0.27, 0.76, 7, hg(L, 0.05, 0.55, 0.4), { x: 0, y: 0.34, z: 0, rz: h, ry: 0.3, j: 0.015 });
    b.cyl(0.19, 0.19, 0.78, 6, L[3], { x: 0, y: 0.34, rz: h, ry: 0.3, ao: false });
    b.cyl(0.12, 0.12, 0.8, 5, L[0], { x: 0, y: 0.34, rz: h, ry: 0.3, ao: false });
    b.cyl(0.05, 0.05, 0.82, 4, L[2], { x: 0, y: 0.34, rz: h, ry: 0.3, ao: false });
    for (const dx of [-0.24, 0.24]) b.tube(0.285, 0.285, 0.07, 7, L[0], { x: dx * Math.cos(0.3), y: 0.34, z: -dx * Math.sin(0.3) * 0, rz: h, ry: 0.3 });
    b.hull([[-0.3, 0.02, 0.36], [0.4, 0, 0.3], [0.38, 0.04, 0.6], [-0.2, 0.02, 0.62], [-0.3, 0.1, 0.36], [0.4, 0.07, 0.3], [0.38, 0.1, 0.6], [-0.2, 0.08, 0.62]], L[2], { j: 0.012, v: 0.06 });
}
export function ectoplasm(mb: MB) {
    const g = mb.glow(0x6ad8e8, 0.9), c = [0x5ac0d8, 0x8ae0ee, 0xbdf4ee, 0xe8fffa];
    g.ico(0.34, 0, hg(c, 0.1, 0.9, 0.3), { y: 0.6, sy: 1.18, j: 0.03, ao: false });
    g.ico(0.2, 0, hg(c, 0.1, 0.5, 0.3), { x: 0.18, y: 0.28, z: 0.02, sy: 1.1, j: 0.02, ao: false });
    g.ico(0.12, 0, c[1], { x: 0.3, y: 0.1, z: 0.04, j: 0.015, ao: false });
    g.ico(0.07, 0, c[1], { x: 0.38, y: 0.97, z: 0, ao: false });
    mb.main.oct(0.065, INK, { x: -0.1, y: 0.68, z: 0.3, sy: 1.5, ao: false });
    mb.main.oct(0.065, INK, { x: 0.1, y: 0.68, z: 0.3, sy: 1.5, ao: false });
    mb.main.oct(0.04, INK, { x: 0, y: 0.55, z: 0.32, sy: 1.3, ao: false });
}
export function scarabShell(mb: MB) {
    const b = mb.shiny(), T = R.teal;
    for (const s of [-1, 1]) {
        b.dome(0.34, 0.32, 6, 2, hg([T[0], T[1], T[2], 0xcdf4ee], 0, 0.3, 0.3), { x: s * 0.27, y: 0.2, z: 0, sz: 1.35, rz: -s * 0.5, j: 0.012, v: 0.07 });
        b.oct(0.07, R.gold[2], { x: s * 0.3, y: 0.46, z: 0.16, sy: 0.5, ao: false, j: 0 });
        b.oct(0.06, R.gold[2], { x: s * 0.32, y: 0.4, z: -0.14, sy: 0.5, ao: false, j: 0 });
    }
    b.hull([[0, 0, 0.4], [-0.1, 0.03, -0.3], [0.1, 0.03, -0.3], [0, 0.18, 0.1], [0, 0, -0.4]], 0x35305c, { y: 0.06, v: 0.04 });
    b.rod([0, 0.2, -0.4], [0, 0.1, 0.5], 0.03, 4, R.gold[1], 0.03, { ao: false });
}
export function rockheart(mb: MB) {
    const st = R.stone, g = mb.glow(0xe8402f, 1.3);
    g.ico(0.3, 0, au((_x: number, y: number) => y > 0.5 ? 0xff6a58 : 0xd84030), { y: 0.5, sy: 1.1, ry: 0.4, j: 0.02, ao: false, v: 0.1 });
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + 0.3;
        spike(mb.main, 0.42 + i % 2 * 0.12, 0.13, hg(st, 0, 0.5, 0.5, i), { x: Math.cos(a) * 0.3, y: 0.08, z: Math.sin(a) * 0.3, rx: Math.sin(a) * 0.7, rz: -Math.cos(a) * 0.7, j: 0.012 }, 4);
    }
    mb.main.dode(0.2, R.stone[1], { y: 0.04, sy: 0.5, j: 0.03 });
}
export function crystalShard(mb: MB) {
    const g = mb.glow(0x3aaed0, 1.1);
    const col = (i: number) => au((_x: number, y: number) => y > 0.62 ? 0xbdf0f8 : y > 0.3 ? 0x6ad0e8 : mix(0x2d86b8, 0x4ab2cf, 0.4 + i * 0.2));
    spike(g, 0.98, 0.17, col(0), { rz: 0.05, ry: 0.3, j: 0.01, ao: false, v: 0.1 }, 6);
    spike(g, 0.62, 0.13, col(1), { x: 0.27, z: 0.07, rz: -0.5, ry: 1, j: 0.01, ao: false, v: 0.1 }, 6);
    spike(g, 0.5, 0.11, col(2), { x: -0.26, z: 0.1, rz: 0.55, ry: 2, j: 0.01, ao: false, v: 0.1 }, 6);
    mb.main.dode(0.2, hg(R.stone, 0, 0.3, 0.5), { y: 0, sy: 0.4, j: 0.04 });
    glint(mb, -0.3, 0.7, 0.22, 0.04, 0xe8fbff, 1.8);
}
export function frostShard(mb: MB) {
    const g = mb.glow(0x4ab2cf, 0.8), I = R.ice;
    const col = (i: number) => au((_x: number, y: number) => y > 0.45 ? I[2] : y > 0.2 ? I[1] : mix(I[0], I[1], 0.4 + i * 0.1));
    spike(g, 0.95, 0.16, col(0), { y: 0, rz: -0.05, j: 0.012, ao: false, v: 0.08 }, 5);
    spike(g, 0.6, 0.12, col(1), { x: 0.26, z: 0.1, y: 0, rz: -0.5, j: 0.012, ao: false, v: 0.08 }, 5);
    spike(g, 0.5, 0.11, col(2), { x: -0.25, z: 0.08, y: 0, rz: 0.55, j: 0.012, ao: false, v: 0.08 }, 5);
    spike(g, 0.34, 0.09, col(0), { x: 0.06, z: 0.28, y: 0, rx: 0.7, j: 0.012, ao: false }, 4);
    glint(mb, 0.1, 0.8, 0.16, 0.04, 0xffffff, 2.2);
}
export function toadskin(mb: MB) {
    const b = mb.main, G = R.green;
    const blob = (r: number, n: number, y: number, c: Col, ry: number) => {
        const pts = [];
        for (let i = 0; i < n; i++) {
            const a = i / n * TAU + ry, rr = r * (0.82 + 0.3 * hash3(i, r * 9, 1));
            pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.78]);
        }
        b.prism(pts, y, y + 0.14, c, { j: 0.015, v: 0.06 });
    };
    blob(0.5, 8, 0, G[1], 0.1);
    blob(0.42, 8, 0.15, G[2], 0.7);
    blob(0.32, 7, 0.3, mix(G[2], R.moss[2], 0.5), 1.3);
    for (const [x, y, z] of [[-0.14, 0.46, 0.06], [0.1, 0.46, -0.05], [0.18, 0.46, 0.12], [-0.05, 0.46, 0.14]]) b.oct(0.09, G[0], { x, y, z, sy: 0.4, ao: false, v: 0.05 });
    for (const [x, y, z] of [[0, 0.5, 0], [-0.2, 0.4, -0.06]]) b.oct(0.055, R.moss[3], { x, y, z, ao: false });
    b.box(0.5, 0.04, 0.05, 0xf4deaa, { x: 0.05, y: 0.16, z: 0.35, ry: 0.1, ao: false, v: 0.03 });
}
export function shroud(mb: MB) {
    const b = mb.main, V = R.violet;
    const hem = [[-0.5, 0], [-0.3, 0.1], [-0.1, -0.02], [0.12, 0.12], [0.32, 0], [0.5, 0.1]];
    b.hull(
        [[-0.2, 0.9, 0.06], [0.2, 0.9, 0.06], [-0.2, 0.9, -0.06], [0.2, 0.9, -0.06], ...hem.map(([x, y]) => [x, y, 0.16]), ...hem.map(([x, y]) => [x, y, -0.1])],
        au((_x: number, y: number) => y > 0.55 ? V[2] : y > 0.25 ? V[1] : V[0]),
        { j: 0.012, v: 0.07 }
    );
    for (const x of [-0.3, 0, 0.28]) b.box(0.08, 0.5, 0.03, V[0], { x, y: 0.45, z: 0.17, rz: x * -0.35, ao: false });
    b.box(0.34, 0.08, 0.26, 0x2a1d2c, { y: 0.88, z: 0, ao: false, v: 0.02 });
    for (const [x, y, z] of [[-0.4, 0.1, 0.24], [0.1, 0.06, 0.26], [0.42, 0.14, 0.2]]) glint(mb, x, y, z, 0.05, 0xbdf4ee, 1.8);
}
export function riftShard(mb: MB) {
    const g = mb.glow(0x9d6fdb, 1.1), V = R.violet;
    const col = (i: number) => au((_x: number, y: number) => y > 0.55 ? 0xbba0ee : y > 0.25 ? V[2] : V[1 + i % 2]);
    spike(g, 1, 0.17, col(0), { rz: -0.1, ry: 0.4, j: 0.012, ao: false, v: 0.1 }, 5);
    spike(g, 0.65, 0.13, col(1), { x: 0.27, z: 0.08, rz: -0.55, ry: 1, j: 0.012, ao: false, v: 0.1 }, 5);
    spike(g, 0.5, 0.11, col(2), { x: -0.26, z: 0.1, rz: 0.55, ry: 2, j: 0.012, ao: false, v: 0.1 }, 5);
    mb.main.ico(0.17, 0, R.dusk[0], { y: -0.02, sy: 0.4, j: 0.03 });
    glint(mb, -0.3, 0.75, 0.22, 0.045, 0xe8dcff, 1.6);
    glint(mb, 0.36, 0.92, -0.1, 0.035, 0xe8dcff, 1.6);
}
export function riftCore(mb: MB) {
    const b = mb.shiny();
    mb.glow(0x9d6fdb, 1.3).ico(0.3, 0, au((_x: number, y: number) => y > 0.5 ? 0xbba0ee : y > 0.38 ? 0x9d6fdb : 0x7a52c0), { y: 0.5, ry: 0.3, j: 0.01, ao: false, v: 0.08 });
    mb.glow(0x4ab2cf, 1.4).oct(0.15, 0xbdf4ee, { y: 0.5, ao: false, v: 0.05 });
    b.torus(0.43, 0.04, 3, 8, 0xf79fc6, { y: 0.5, rx: 1.15, ry: 0.4 });
    b.torus(0.4, 0.04, 3, 8, 0x4ab2cf, { y: 0.5, rx: -0.4, rz: 0.9 });
    for (const [x, y, z] of [[0.46, 0.72, 0.1], [-0.4, 0.3, -0.2], [0.1, 0.12, 0.4]]) mb.glow(0xb07aff, 1.6).oct(0.05, 0xe8dcff, { x, y, z, sy: 1.4, ao: false });
}
export function lanternShard(mb: MB) {
    const g = mb.glow(0xffb020, 1.1), G = R.gold;
    const col = (i: number) => au((_x: number, y: number) => y > 0.5 ? 0xffe070 : y > 0.22 ? 0xffc030 : G[1 + i % 2 * 0]);
    spike(g, 0.95, 0.19, col(0), { rz: 0.08, ry: 0.2, j: 0.012, ao: false, v: 0.09 }, 4);
    spike(g, 0.5, 0.12, col(1), { x: 0.24, z: 0.06, rz: -0.6, ry: 0.9, j: 0.012, ao: false, v: 0.09 }, 4);
    spike(mb.main, 0.1, 0.22, 0xb8741a, { y: -0.02, j: 0.02 }, 5);
    glint(mb, -0.26, 0.5, 0.2, 0.04, 0xfff3b0, 1.6);
    glint(mb, 0.1, 0.96, 0, 0.035, 0xffffff, 1.6);
}
export function pearl(mb: MB) {
    const b = mb.shiny(), c = [0xdcd0c0, 0xf4eadc, 0xfffaf0, 0xffffff], sh = [0xc9a46a, 0xdcbc82, 0xecd49c, 0xf8e8be];
    b.dome(0.46, 0.18, 7, 2, hg(sh, 0, 0.2, 0.4), { y: 0, j: 0.015, v: 0.08 });
    b.hull([[-0.4, 0.1, -0.2], [0.4, 0.1, -0.2], [0, 0.1, -0.5], [-0.3, 0.45, -0.34], [0.3, 0.45, -0.34], [0, 0.5, -0.4]], hg(sh, 0.1, 0.5, 0.4), { j: 0.015, v: 0.08 });
    mb.glow(0xffffff, 0.4).ico(0.26, 1, hg(c, 0.1, 0.9, 0.25), { y: 0.38, j: 0.006, ao: false, v: 0.03 });
    glint(mb, -0.1, 0.55, 0.18, 0.04, 0xffffff, 1.6);
}
export const MATS: Record<string, DropSpec> = {
    wood: S(logs),
    stone: S(stone),
    coal: S(coal),
    iron: S((mb: MB) => oreChunk(mb, [0xa8664a, 0xd08a60, 0xc9505a, 0xf0b088])),
    copper: S((mb: MB) => oreChunk(mb, [0xf08a40, 0x4aa088, 0xffc078, 0x3a94b8])),
    goldore: S((mb: MB) => oreChunk(mb, [0xffd966, 0xfff3b0, 0xe0a020], 0xffd966)),
    sand: S((mb: MB) => mound(mb, R.sand, 0xc9a46a)),
    clay: S((mb: MB) => mound(mb, [0x8a4a34, 0xaa6244, 0xc8805a, 0xe0a07a], 0x8a4a34)),
    peat: S(peat),
    fiber: S(fiber, { turn: 'sway', size: 1.35 }),
    herb: S(herb),
    cotton: S(cotton),
    plank: S(plank),
    brick: S(bricks),
    glass: S(glass, { turn: 'sway' }),
    ironbar: S((mb: MB) => ingots(mb, R.iron)),
    copperbar: S((mb: MB) => ingots(mb, R.copper)),
    goldbar: S((mb: MB) => ingots(mb, R.gold, { spark: true })),
    steel: S((mb: MB) => ingots(mb, R.steel, { long: true, stamp: R.steel[0] })),
    cloth: S((mb: MB) => cloth(mb, 0xecd5bb, 0xfff6e0, 0x4ab2cf)),
    rope: S(rope),
    gear: S(gearCog),
    wire: S(wireSpool, { lean: 0.35 }),
    circuit: S(circuit, { lean: 0.25 }),
    flour: S(flour, { lean: 0.7, turn: 'sway' }),
    motor: S(motor, { lean: 0.3 }),
    core: S(powerCore),
    slimegel: S(slimegel),
    bone: S(bone, { diag: 0.75, turn: 'sway' }),
    batwing: S(batwing, { turn: 'sway', diag: 0.2, lean: 0.9 }),
    hide: S(hide),
    ectoplasm: S(ectoplasm, { turn: 'sway' }),
    crystal: S(crystalShard),
    scarabshell: S(scarabShell),
    rockheart: S(rockheart),
    frostshard: S(frostShard),
    toadskin: S(toadskin),
    shroud: S(shroud, { turn: 'sway' }),
    rift_shard: S(riftShard),
    rift_core: S(riftCore),
    lantern_shard: S(lanternShard),
    pearl: S(pearl)
};
