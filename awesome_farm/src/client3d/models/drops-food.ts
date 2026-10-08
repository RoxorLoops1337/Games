// Loot models: food, fish, dishes and seed pouches.
import { au, bowl, curve, type DropSpec, glint, hg, INK, plate, puff, R, ribs } from './drops-shapes';
import { darken, hash3, lighten, MB, mix, Pt, TAU } from './kit';

export const S = (build: (mb: MB) => void, o: Partial<DropSpec> = {}): DropSpec => ({ build, ...o });
export const W = 0xfff6e0;
export function berries(mb: MB) {
    const b = mb.main, rc = [0xb8404c, 0xe85d62, 0xf2837e, 0xfab0a8];
    const pts = [[-0.2, 0.26, 0.06, 0.25], [0.2, 0.24, 0, 0.23], [0, 0.26, 0.26, 0.22], [0.02, 0.54, -0.02, 0.23]];
    pts.forEach(([x, y, z, r], i) => {
        b.ico(r, 0, hg(rc, y - r, y + r, 0.35, i), { x, y, z, ry: i, j: 0.02 });
        mb.glow(W, 1.2).oct(0.035, W, { x: x - r * 0.35, y: y + r * 0.55, z: z + r * 0.55, sy: 1.4, ao: false, v: 0 });
    });
    b.leaf(0.42, 0.15, 0.02, R.leaf[2], { x: 0, y: 0.72, z: 0, ry: 0.8, rx: -0.5, j: 0.008 });
    b.leaf(0.34, 0.12, 0.02, R.leaf[1], { x: 0, y: 0.72, z: 0, ry: -1.2, rx: -0.3, j: 0.008 });
    b.rod([0, 0.62, 0], [0.02, 0.76, 0], 0.03, 4, 0x6a402f);
}
export function mushroom(mb: MB) {
    const b = mb.main;
    b.cyl(0.15, 0.21, 0.44, 6, hg(R.cream, 0, 0.4, 0.3), { y: 0.22, j: 0.012 });
    b.dome(0.52, 0.42, 7, 2, hg([0xb83a48, 0xe85d62, 0xf2837e, 0xfab0a8], 0.3, 0.8, 0.4), { y: 0.38, j: 0.02, v: 0.07 });
    const spots = [[0, 0.78, 0], [0.26, 0.64, 0.18], [-0.22, 0.66, 0.22], [0.04, 0.62, 0.38], [-0.34, 0.54, -0.08], [0.32, 0.56, -0.16]];
    for (const [x, y, z] of spots) b.oct(0.075, W, { x, y, z, sy: 0.45, ao: false, v: 0.02 });
}
export function wheat(mb: MB) {
    const b = mb.main, st = R.straw;
    for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + 0.4, k = 0.1 + i % 2 * 0.1, lx = Math.cos(a) * k, lz = Math.sin(a) * k, h = 0.74 - i % 3 * 0.1;
        b.rod([0, 0, 0], [lx, h, lz], 0.032, 3, st[0]);
        b.oct(0.14, 0xffd040, { x: lx * 1.03, y: h + 0.06, z: lz * 1.03, sy: 2, ry: i, j: 0.006, ao: false, v: 0.1 });
        b.oct(0.09, 0xffe070, { x: lx * 1.06, y: h + 0.27, z: lz * 1.06, sy: 1.6, ry: i, ao: false, v: 0.06 });
    }
    b.box(0.26, 0.1, 0.24, R.leather[2], { y: 0.2, ry: 0.4, j: 0.006 });
}
export function carrot(mb: MB) {
    const b = mb.main, c = [0xe8701a, 0xf8a24a, 0xffb85c, 0xffd890];
    b.cone(0.27, 0.82, 6, hg(c, 0, 0.8, 0.3), { y: 0.38, rx: Math.PI, j: 0.012, v: 0.07 });
    for (const [y, rr] of [[0.52, 0.22], [0.36, 0.16], [0.22, 0.1]]) b.box(rr * 1.7, 0.03, 0.06, c[0], { y, z: rr * 0.9, ry: 0, ao: false, v: 0.03 });
    for (let i = 0; i < 4; i++) b.leaf(0.55, 0.13, 0.02, R.leaf[1 + i % 3], { y: 0.78, ry: (i - 1.5) * 0.8, rx: -0.8 - i % 2 * 0.1, j: 0.008 });
}
export function pumpkin(mb: MB) {
    const b = mb.main;
    b.lathe([[0, 0], [0.3, 0], [0.5, 0.2], [0.47, 0.45], [0.2, 0.58], [0, 0.54]], 8, ribs(8, 0xf8a24a, 0xdc7a2c), { j: 0.015, v: 0.05 });
    b.cyl(0.07, 0.1, 0.18, 5, 0x6a8a3a, { y: 0.64, rz: 0.2, j: 0.01 });
    curve(b, [[0.06, 0.6, 0], [0.22, 0.7, 0.08], [0.32, 0.64, 0.2]], 0.025, 0.015, 3, R.leaf[1]);
    b.leaf(0.3, 0.1, 0.015, R.leaf[2], { x: 0.04, y: 0.58, ry: 2.2, rx: -0.3 });
}
export function melon(mb: MB) {
    const b = mb.main;
    b.lathe([[0, 0], [0.3, 0], [0.5, 0.24], [0.46, 0.5], [0.22, 0.66], [0, 0.62]], 8, ribs(8, 0x6ac060, 0x3f8a4c), { j: 0.012, v: 0.05, sx: 1.12 });
    b.cyl(0.05, 0.07, 0.12, 5, 0x6a8a3a, { y: 0.68, j: 0.01 });
    b.ico(0.08, 0, 0xf4deaa, { x: 0.36, y: 0.12, z: 0.3, sy: 0.4, ao: false });
}
export function beet(mb: MB) {
    const b = mb.main, wc = [0x7a2a50, 0xa8406a, 0xd06a90, 0xe8a0b8];
    b.ico(0.37, 0, hg(wc, 0.1, 0.8, 0.3), { y: 0.36, sy: 0.92, j: 0.02, v: 0.07 });
    b.cone(0.1, 0.4, 5, wc[0], { y: 0, rx: Math.PI, j: 0.01 });
    b.cyl(0.13, 0.2, 0.06, 6, wc[3], { y: 0.66, ao: false, v: 0.03 });
    for (let i = 0; i < 3; i++) {
        b.rod([0, 0.66, 0], [Math.sin(i * 2.2) * 0.2, 0.92, Math.cos(i * 2.2) * 0.2], 0.022, 3, 0xc9505a);
        b.leaf(0.42, 0.14, 0.02, R.leaf[1 + i % 2], { y: 0.78, ry: i * 2.2 + 0.2, rx: -0.9, j: 0.008 });
    }
}
export function corn(mb: MB) {
    const b = mb.main, y = [0xe0a020, 0xffd966];
    b.cyl(0.13, 0.2, 0.8, 6, ribs(6, y[1], y[0]), { y: 0.46, j: 0.012, v: 0.06 });
    b.cone(0.13, 0.16, 6, y[0], { y: 0.94, j: 0.01 });
    for (let i = 0; i < 4; i++) b.leaf(0.7, 0.17, 0.02, hg(R.leaf, 0, 0.7, 0.3, i), { y: 0.03, ry: i * 1.6 + 0.4, rx: -1, j: 0.01 });
    for (let i = 0; i < 3; i++) b.rod([0, 0.96, 0], [(i - 1) * 0.08, 1.12, 0.05], 0.01, 3, 0xe0b878);
}
export function pepper(mb: MB) {
    const b = mb.main, rc = [0x9a3446, 0xc9505a, 0xe85d62, 0xf59a96];
    const chili = (pts: Pt[], r: number, c: number) => {
        curve(b, pts, r, r * 0.12, 4, (x: number, y: number, z: number) => hash3(x * 6, y * 6, z * 6) > 0.5 ? c : rc[2], { j: 0.008, v: 0.08 });
        b.cone(r * 1.3, 0.12, 5, R.leaf[1], { x: pts[0][0], y: pts[0][1] + 0.05, z: pts[0][2], j: 0.005 });
        b.rod([pts[0][0], pts[0][1] + 0.08, pts[0][2]], [pts[0][0] + 0.06, pts[0][1] + 0.26, pts[0][2]], 0.025, 4, R.leaf[0]);
    };
    chili([[-0.12, 0.74, 0], [-0.22, 0.42, 0.05], [0.08, 0.1, 0.1]], 0.15, rc[1]);
    chili([[0.18, 0.64, -0.04], [0.32, 0.36, 0.02], [0.42, 0.1, 0.08]], 0.12, rc[2]);
}
export function flax(mb: MB) {
    const b = mb.main;
    for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + 0.5, lx = Math.cos(a) * 0.16, lz = Math.sin(a) * 0.16, h = 0.78 - i % 2 * 0.12;
        b.rod([0, 0, 0], [lx, h, lz], 0.03, 3, R.leaf[1]);
        b.oct(0.15, au((_x: number, y: number, _z: number) => y > h - 0.02 ? 0x9be0e8 : 0x4ab2cf), { x: lx, y: h, z: lz, sy: 0.6, ry: i, ao: false, v: 0.06 });
        b.oct(0.055, 0xffd966, { x: lx, y: h + 0.05, z: lz, ao: false });
    }
    b.cyl(0.12, 0.14, 0.1, 6, R.leather[2], { y: 0.16, j: 0.006 });
}
export function loaf(mb: MB) {
    const b = mb.main, c = [0x8a5a2a, 0xb87a3a, 0xd49a4a, 0xf4deaa];
    const ring = (rx: number, rz: number, y: number, n = 8) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * TAU) * rx, y, Math.sin(i / n * TAU) * rz]);
    b.hull([...ring(0.5, 0.3, 0), ...ring(0.53, 0.33, 0.14), ...ring(0.46, 0.29, 0.34), ...ring(0.3, 0.18, 0.46)], hg(c.slice(0, 3), 0, 0.45, 0.3), { j: 0.012, v: 0.06 });
    for (let i = 0; i < 3; i++) b.box(0.075, 0.03, 0.32, c[3], { x: -0.18 + i * 0.18, y: 0.47 - Math.abs(i - 1) * 0.07, z: 0, ry: 0.5, rz: (i - 1) * 0.14, ao: false, v: 0.02 });
}
export function cornbread(mb: MB) {
    const b = mb.main;
    b.box(0.82, 0.3, 0.56, au((_x: number, y: number) => y > 0.28 ? 0xffd966 : 0xe0a020), { y: 0.15, ry: 0.15, j: 0.012, v: 0.05 });
    b.box(0.82, 0.03, 0.02, 0xc58f3e, { y: 0.31, z: 0, ry: 0.15, ao: false, v: 0 });
    b.box(0.02, 0.03, 0.56, 0xc58f3e, { y: 0.31, x: 0, ry: 0.15, ao: false, v: 0 });
    b.box(0.16, 0.07, 0.12, 0xfff3b0, { x: 0.12, y: 0.34, z: -0.1, ry: 0.4, j: 0.006 });
    for (const [x, z] of [[-0.26, 0.15], [0.3, 0.14], [-0.18, -0.15]]) b.ico(0.045, 0, 0xffd966, { x, y: 0.32, z, sy: 0.5, ao: false });
}
export function pie(mb: MB, o: { fish?: boolean } = {}) {
    const b = mb.main, c = [0xa8703f, 0xd49a62, 0xe8b878];
    b.cyl(0.5, 0.42, 0.28, 10, ribs(10, c[1], c[0]), { y: 0.14, j: 0.01, v: 0.04 });
    if (o.fish) {
        b.cyl(0.44, 0.44, 0.04, 10, c[2], { y: 0.28, ao: false, v: 0.04 });
        for (const k of [-0.15, 0.15]) {
            b.box(0.84, 0.035, 0.08, c[1], { y: 0.32, z: k, ao: false, v: 0.03 });
            b.box(0.08, 0.035, 0.84, c[1], { y: 0.34, x: k, ao: false, v: 0.03 });
        }
        b.hull([[0, 0.3, 0], [0.04, 0.8, 0.04], [0.04, 0.8, -0.04], [0.22, 0.98, 0.02], [0.22, 0.98, -0.02], [-0.16, 0.98, 0.02], [-0.16, 0.98, -0.02]], 0x7f98c4, { x: 0.05, z: -0.08, j: 0.008 });
    } else {
        b.cyl(0.43, 0.43, 0.05, 10, 0xf8a24a, { y: 0.28, ao: false, v: 0.05 });
        b.oct(0.2, 0xfff6e0, { x: 0.02, y: 0.36, z: 0, sy: 0.7, j: 0.012, ao: false });
        for (let i = 0; i < 3; i++) b.rod([-0.3 + i * 0.3, 0.32, 0.27], [-0.2 + i * 0.3, 0.32, 0.38], 0.03, 3, c[0], 0.03, { ao: false });
    }
}
export function jar(mb: MB) {
    const b = mb.shiny(), jam = [0xb83a48, 0xd84a54, 0xe85d62, 0xf2837e];
    b.lathe([[0, 0], [0.3, 0], [0.37, 0.08], [0.37, 0.6], [0.3, 0.68]], 7, hg(jam, 0, 0.6, 0.4), { j: 0.01, v: 0.06 });
    mb.main.cone(0.4, 0.3, 7, 0xfff0d2, { y: 0.8, rx: Math.PI, j: 0.012, v: 0.04 });
    mb.main.tube(0.3, 0.3, 0.07, 7, 0xe85d62, { y: 0.7, ao: false, v: 0.02 });
    mb.main.box(0.3, 0.3, 0.03, 0xfff6e0, { y: 0.34, z: 0.38, ry: 0, ao: false, v: 0.02 });
    mb.glow(0xe85d62, 1).ico(0.08, 0, 0xe85d62, { y: 0.34, z: 0.41, sy: 0.9, ao: false, v: 0.04 });
    mb.main.cone(0.1, 0.12, 5, R.leaf[1], { y: 0.98, ry: 0.4 });
    mb.glow(W, 1.2).oct(0.04, W, { x: -0.24, y: 0.5, z: 0.3, sy: 2.2, ao: false, v: 0 });
}
export function steam(mb: MB, x = 0, z = 0, c = 0xfffbf4) {
    puff(mb, x - 0.06, 0.62, z, 0.07, c, 0.5);
    puff(mb, x + 0.06, 0.78, z + 0.02, 0.06, c, 0.5);
    puff(mb, x - 0.03, 0.94, z - 0.02, 0.05, c, 0.5);
}
export function stewBowl(mb: MB) {
    bowl(mb, R.wood[3], 0xb8541f, {});
    for (const [x, z, c] of [[-0.16, 0.08, 0xf8a24a], [0.14, 0.14, 0xf8a24a], [0.04, -0.14, 0xfff0d2]]) mb.main.box(0.15, 0.09, 0.13, c, { x, y: 0.31, z, ry: x * 9, j: 0.01, ao: false, v: 0.08 });
    mb.main.oct(0.08, 0x6a402f, { x: -0.04, y: 0.31, z: 0.18, sy: 0.6, ao: false });
    steam(mb, 0, 0);
}
export function soupBowl(mb: MB) {
    bowl(mb, 0xecd5bb, 0xc03a5a, {}, {});
    mb.main.tube(0.2, 0.2, 0.04, 8, 0xfff6e0, { y: 0.34, ao: false, v: 0.02 });
    mb.main.oct(0.09, 0xfff6e0, { x: 0, y: 0.35, z: 0, sy: 0.6, ao: false });
    steam(mb, 0, 0);
}
export function spicyBowl(mb: MB) {
    bowl(mb, 0x8a4036, 0xe84a30, { fillGlow: 0xff7a3a, e: 0.7 });
    for (const [x, z, a] of [[-0.14, 0.1, 0.4], [0.12, 0.12, -0.5], [0.02, -0.12, 1.3]]) mb.main.oct(0.09, 0xe85d62, { x, y: 0.34, z, sx: 1.9, sy: 0.7, ry: a, ao: false, v: 0.06 });
    for (const [x, z] of [[0.2, -0.06], [-0.22, -0.08]]) mb.main.oct(0.06, 0x5cb04f, { x, y: 0.33, z, ao: false });
    steam(mb, 0, 0, 0xffc8a0);
}
export function iceBowl(mb: MB) {
    bowl(mb, 0xcdf4ee, 0xcdeccd, { fillGlow: 0xcdf4ee, e: 0.5, rim: 0xffffff });
    const g = [0xe8fff0, 0xcdeccd, 0xa8dcb8];
    mb.main.ico(0.26, 0, hg(g, 0.2, 0.7, 0.3), { y: 0.42, sy: 0.7, j: 0.03 });
    mb.main.ico(0.15, 0, g[0], { x: 0.2, y: 0.36, z: 0.1, sy: 0.7, j: 0.02 });
    mb.main.hull([[0, 0, 0.06], [0.34, 0, 0.06], [0, 0.26, 0.06], [0, 0, -0.06], [0.34, 0, -0.06], [0, 0.26, -0.06]], 0xe8737a, { x: -0.2, y: 0.5, z: 0.3, rz: -0.7, j: 0.006 });
    mb.main.box(0.38, 0.03, 0.14, 0x3f8a4c, { x: -0.12, y: 0.4, z: 0.3, rz: 0.55, ao: false, v: 0.03 });
    glint(mb, 0.12, 0.78, 0, 0.05, 0xcdf4ee, 2);
    glint(mb, -0.2, 0.9, -0.1, 0.04, 0xffffff, 2);
}
export function catfishBowl(mb: MB) {
    bowl(mb, R.wood[3], 0xf08a30, {});
    mb.main.hull([[0, 0.3, 0.05], [0, 0.3, -0.05], [0.2, 0.6, 0], [0.34, 0.64, 0.04], [0.34, 0.64, -0.04], [0.5, 0.42, 0]], 0x8a5a3a, { x: -0.1, z: 0, j: 0.008 });
    for (const s of [-1, 1]) mb.main.rod([0.2, 0.34, s * 0.08], [0.4, 0.34, s * 0.3], 0.02, 3, 0x6a402f, 0.012);
    mb.main.oct(0.08, 0xfff0d2, { x: 0.18, y: 0.33, z: -0.16, ao: false });
    steam(mb, -0.1, 0);
}
export function eelBowl(mb: MB) {
    bowl(mb, 0x5d4a7c, 0x35305c, {});
    curve(mb.main, [[-0.28, 0.34, 0.04], [0, 0.4, -0.1], [0.28, 0.36, 0.06]], 0.09, 0.05, 4, 0x666b86, { ao: false });
    mb.main.oct(0.09, 0x888ca8, { x: 0.3, y: 0.36, z: -0.07, j: 0.01 });
    mb.main.oct(0.025, INK, { x: 0.33, y: 0.4, z: -0.02, ao: false });
    steam(mb, 0, 0, 0xcdc0f0);
}
export function lanternBowl(mb: MB) {
    bowl(mb, 0x4a475c, 0x6ad8e8, { fillGlow: 0x6ad8e8, e: 1.1 });
    const g = mb.glow(0xbdf4ee, 1.6);
    for (const [x, y, z, r] of [[-0.1, 0.55, 0.06, 0.07], [0.12, 0.68, -0.04, 0.06], [0.02, 0.82, 0.08, 0.05]]) g.oct(r * 1.2, 0xe8fffa, { x, y, z, ao: false, v: 0 });
    mb.main.ico(0.06, 0, 0xfff3b0, { x: 0.14, y: 0.34, z: 0.16, ao: false });
}
/** A fish: length, height and width, back / belly / fin colours, body and width profiles, snout, tail, dorsal fin(s) and where,
 * pectoral fin (0: none), eye colour, spots [u, v, colour, radius], a stripe [height, width], dark bars, and a glow [colour, strength]. */
export interface FishLook {
    L: number; H: number; W: number; back: number; belly: number; fin: number;
    prof?: number[]; wprof?: number[]; snout?: number; tailL?: number; tailH?: number;
    dorsal?: number; dorsalAt?: number; pectoral?: number; eye?: number;
    spots?: number[][]; stripe?: number[]; bars?: number; barCol?: number; glow?: number[];
}
export function fish(mb: MB, p: FishLook, o: { s?: number; x?: number; y?: number; z?: number; flat?: boolean } = {}) {
    const s = o.s ?? 1, ox = o.x ?? 0, oy = o.y ?? 0.5, oz = o.z ?? 0, flat = !!o.flat;
    const P = (x: number, y: number, z: number) => flat ? [ox + x * s, oy + z * s, oz - y * s] : [ox + x * s, oy + y * s, oz + z * s];
    const up = (_x: number, y: number, z: number) => (flat ? -(z - oz) : y - oy) / s;
    const bb = p.glow ? mb.glow(p.glow[0], p.glow[1]) : mb.main;
    const U = [0, 0.2, 0.48, 0.78, 1], hp = p.prof ?? [0.34, 0.78, 1, 0.78, 0.3], wp = p.wprof ?? hp;
    const pts: number[][] = [];
    U.forEach((u, i) => {
        const x = -p.L / 2 + u * p.L, h = hp[i] * p.H, w = wp[i] * p.W;
        pts.push(P(x, h, 0), P(x, -h * 0.82, 0), P(x, 0, w), P(x, 0, -w));
    });
    pts.push(P(p.L / 2 + (p.snout ?? 0), 0, 0));
    const mid = mix(p.back, p.belly, 0.5);
    bb.hull(pts, au((x: number, y: number, z: number) => {
        const u = up(x, y, z);
        return u > p.H * 0.34 ? p.back : u < -p.H * 0.2 ? p.belly : mid;
    }), { v: 0.05, j: 0.006 });
    const ff = p.glow ? bb : mb.main, t = 0.016, tl = p.tailL ?? 0.26, th = p.tailH ?? p.H * 1.1, x0 = -p.L / 2;
    ff.hull([P(x0 + 0.06, p.H * 0.12, t), P(x0 + 0.06, -p.H * 0.12, t), P(x0 - tl, th, t), P(x0 - tl, -th, t), P(x0 - tl * 0.62, 0, t), P(x0 + 0.06, p.H * 0.12, -t), P(x0 + 0.06, -p.H * 0.12, -t), P(x0 - tl, th, -t), P(x0 - tl, -th, -t), P(x0 - tl * 0.62, 0, -t)], p.fin, { v: 0.05, ao: false });
    const dd = p.dorsal ?? 1;
    if (dd) {
        const dx0 = -p.L / 2 + (p.dorsalAt ?? 0.3) * p.L, len = p.L * (dd === 2 ? 0.34 : 0.26), dh = p.H * (dd === 2 ? 0.7 : 0.5), hh = p.H * 0.92;
        ff.hull([P(dx0, hh, t), P(dx0 + len, hh, t), P(dx0 + len * (dd === 2 ? 0.2 : 0.35), hh + dh, t), P(dx0, hh, -t), P(dx0 + len, hh, -t), P(dx0 + len * (dd === 2 ? 0.2 : 0.35), hh + dh, -t)], p.fin, { v: 0.05, ao: false });
    }
    if (p.pectoral !== 0) {
        const px = p.L * 0.12, hh = -p.H * 0.35;
        ff.hull([P(px, hh, p.W * 0.9), P(px + 0.1, hh, p.W * 0.9), P(px - 0.06, hh - p.H * 0.6, p.W * 1.5)], p.fin, { v: 0.05, ao: false });
    }
    const ex = p.L * 0.33, ey = p.H * 0.22, ez = p.W * 0.72;
    const e1 = P(ex, ey, ez);
    mb.main.oct(0.062 * s, 0xfff6e0, { x: e1[0], y: e1[1], z: e1[2], ao: false, v: 0 });
    const e2 = P(ex + 0.012, ey, ez + 0.03);
    mb.main.oct(0.036 * s, p.eye ?? INK, { x: e2[0], y: e2[1], z: e2[2], ao: false, v: 0 });
    for (const [u, v, c, r] of p.spots ?? []) {
        const sp = P(-p.L / 2 + u * p.L, v * p.H, p.W * 0.86 * (1 - Math.abs(v) * 0.2) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, u)))));
        bb.oct(r * s, c, { x: sp[0], y: sp[1], z: sp[2], sz: 0.55, ao: false, v: 0.04 });
    }
    if (p.stripe) {
        const a = P(-p.L * 0.36, p.stripe[0] * p.H, p.W * 0.78), c = P(p.L * 0.3, p.stripe[0] * p.H, p.W * 0.8);
        mb.main.rod(a, c, p.stripe[1] * p.H, 4, 0xe8ecf6, undefined, { ao: false, v: 0.02 });
    }
    for (let i = 0; i < (p.bars ?? 0); i++) {
        const bx = -p.L * 0.28 + i * p.L * 0.17, hb = p.H * 0.9, a = P(bx, hb, p.W * 0.78), c = P(bx + 0.02, -hb * 0.4, p.W * 0.82);
        mb.main.rod(a, c, 0.022 * s, 3, p.barCol ?? INK, undefined, { ao: false, v: 0.02 });
    }
}
export const FISH: Record<string, FishLook> = {
    fish_minnow: { L: 0.66, H: 0.11, W: 0.08, back: 0x9ea4b9, belly: 0xfffbf4, fin: 0xd5d9e6, tailH: 0.15, tailL: 0.2, dorsal: 1, stripe: [0, 0.1], pectoral: 0 },
    fish_carp: { L: 0.8, H: 0.3, W: 0.19, back: 0xf8a24a, belly: 0xffd966, fin: 0xe0701a, prof: [0.3, 0.8, 1, 0.82, 0.3], dorsal: 1, dorsalAt: 0.12, tailH: 0.3, spots: [[0.4, 0.4, 0xffd966, 0.07], [0.55, 0.15, 0xffd966, 0.07], [0.3, 0.1, 0xffd966, 0.06], [0.68, 0.45, 0xffd966, 0.06]] },
    fish_perch: { L: 0.8, H: 0.24, W: 0.13, back: 0x4a8a3f, belly: 0xd4f08a, fin: 0xe85d62, dorsal: 2, dorsalAt: 0.18, tailH: 0.26, bars: 4, barCol: 0x2d5a38 },
    fish_trout: { L: 0.9, H: 0.2, W: 0.13, back: 0xe8869a, belly: 0xfff0f2, fin: 0xd8506a, dorsal: 1, dorsalAt: 0.35, tailH: 0.22, spots: [[0.3, 0.5, 0xc9304a, 0.045], [0.45, 0.6, 0xc9304a, 0.045], [0.6, 0.45, 0xc9304a, 0.045], [0.38, 0.1, 0xc9304a, 0.04], [0.55, 0.2, 0xc9304a, 0.04]], stripe: [0.05, 0.06] },
    fish_bass: { L: 0.92, H: 0.28, W: 0.16, back: 0x6c9a49, belly: 0xe8f0b0, fin: 0x3f8a4c, snout: 0.05, dorsal: 2, dorsalAt: 0.2, tailH: 0.26, stripe: [0.12, 0.11] },
    fish_catfish: { L: 0.85, H: 0.23, W: 0.2, back: 0x8a5a3a, belly: 0xd49a62, fin: 0x6a402f, prof: [0.3, 0.7, 1, 0.9, 0.5], wprof: [0.3, 0.7, 1, 1.1, 0.9], dorsal: 1, dorsalAt: 0.4, tailH: 0.2, spots: [[0.35, 0.4, 0x4a2f2a, 0.06], [0.5, 0.25, 0x4a2f2a, 0.055], [0.62, 0.5, 0x4a2f2a, 0.05]] },
    fish_koi: { L: 0.88, H: 0.27, W: 0.17, back: 0xfffbf4, belly: 0xf4ece0, fin: 0xf8c8a0, dorsal: 1, dorsalAt: 0.2, tailH: 0.32, tailL: 0.3, spots: [[0.28, 0.55, 0xf8a24a, 0.13], [0.52, 0.35, 0xe85d62, 0.12], [0.7, 0.5, 0xf8a24a, 0.1], [0.42, 0, 0xe85d62, 0.07]] },
    fish_pike: { L: 1.04, H: 0.17, W: 0.11, back: 0x4a7a3f, belly: 0xe8eeb0, fin: 0x6c8a3a, prof: [0.4, 0.8, 1, 0.7, 0.3], snout: 0.13, dorsal: 1, dorsalAt: 0.08, tailH: 0.2, tailL: 0.22, spots: [[0.3, 0.3, 0xf0f0b0, 0.04], [0.42, 0.45, 0xf0f0b0, 0.04], [0.54, 0.3, 0xf0f0b0, 0.04], [0.66, 0.4, 0xf0f0b0, 0.04], [0.5, 0, 0xf0f0b0, 0.035]] },
    fish_lantern: { L: 0.8, H: 0.25, W: 0.15, back: 0x2d6ea6, belly: 0x7ad0e8, fin: 0x4ab2cf, dorsal: 1, dorsalAt: 0.3, tailH: 0.24, spots: [[0.3, -0.1, 0xffe680, 0.045], [0.42, -0.2, 0xffe680, 0.045], [0.54, -0.2, 0xffe680, 0.045], [0.66, -0.1, 0xffe680, 0.04]] },
    fish_goldkoi: { L: 0.92, H: 0.29, W: 0.17, back: 0xffbe2a, belly: 0xffe070, fin: 0xffe9a0, dorsal: 1, dorsalAt: 0.15, tailH: 0.36, tailL: 0.34, glow: [0xffc030, 0.4], spots: [[0.3, 0.5, 0xfffbd0, 0.08], [0.5, 0.35, 0xfffbd0, 0.08], [0.68, 0.45, 0xfffbd0, 0.065], [0.42, 0.05, 0xe0a020, 0.06]] }
};
export function fishDetail(mb: MB, id: string) {
    const p = FISH[id];
    fish(mb, p, { y: 0.5 });
    const L = p.L, x1 = L / 2 + (p.snout ?? 0);
    if (id === 'fish_catfish') for (const sz of [-1, 1]) curve(mb.main, [[x1 - 0.03, -0.02, sz * 0.06], [x1 + 0.12, 0, sz * 0.2], [x1 + 0.26, -0.06, sz * 0.3]], 0.02, 0.008, 3, 0x4a2f2a, { y: 0.5 });
    if (id === 'fish_koi') for (const sz of [-1, 1]) curve(mb.main, [[x1 - 0.02, -0.04, sz * 0.05], [x1 + 0.08, -0.06, sz * 0.12]], 0.014, 0.007, 3, 0xe85d62, { y: 0.5 });
    if (id === 'fish_pike') for (let i = 0; i < 4; i++) mb.main.tet(0.025, 0xfff6e0, { x: x1 - 0.14 + i * 0.045, y: 0.5 - 0.035, z: 0.05 * (i % 2 ? 1 : -1) * 0.6 + 0.045, ry: i, ao: false });
    if (id === 'fish_lantern') {
        curve(mb.main, [[x1 - 0.1, 0.2, 0], [x1 + 0.06, 0.42, 0], [x1 + 0.22, 0.46, 0], [x1 + 0.3, 0.34, 0]], 0.018, 0.012, 3, 0x2d6ea6, { y: 0.5 });
        mb.glow(0xffe680, 2.4).ico(0.1, 0, 0xfff3b0, { x: x1 + 0.3, y: 0.82, z: 0, ao: false, v: 0 });
    }
    if (id === 'fish_goldkoi') glint(mb, 0.3, 1, 0.1, 0.05, 0xfffbd0, 2.6);
}
export const fishSpec = (id: string) => S((mb: MB) => fishDetail(mb, id), { turn: 'sway', lean: 0.85, diag: id === 'fish_eel' ? 0 : 0.28, spark: id === 'fish_goldkoi' ? 0xffe680 : undefined });
export function eel(mb: MB) {
    const b = mb.main, g = [0x3a3647, 0x514c63, 0x666b86, 0x9496ae];
    const pts = [];
    for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        pts.push([-0.5 + u, 0.5 + Math.sin(u * TAU * 1.05 + 0.4) * 0.2, 0]);
    }
    for (let i = 0; i < 7; i++) b.rod(pts[i], pts[i + 1], 0.07 * (1 - (7 - i) * 0.04) + 0.02, 4, hg(g, 0.2, 0.75, 0.3, i), 0.08 * (1 - (6 - i) * 0.04) + 0.02, { ao: false, v: 0.06 });
    b.ico(0.1, 0, g[2], { x: pts[7][0] + 0.03, y: pts[7][1], z: 0, sx: 1.25, sy: 0.9, j: 0.008 });
    b.oct(0.032, W, { x: pts[7][0] + 0.04, y: pts[7][1] + 0.05, z: 0.08, ao: false });
    b.oct(0.018, INK, { x: pts[7][0] + 0.05, y: pts[7][1] + 0.05, z: 0.1, ao: false });
    b.hull([[-0.5, pts[0][1], 0.02], [-0.6, pts[0][1] + 0.1, 0.02], [-0.6, pts[0][1] - 0.1, 0.02], [-0.5, pts[0][1], -0.02], [-0.6, pts[0][1] + 0.1, -0.02], [-0.6, pts[0][1] - 0.1, -0.02]], g[1], { ao: false });
}
export function platedFish(mb: MB, id: string, o: { plate: number; col: number[]; extras: (m: MB) => void; }) {
    plate(mb.main, o.plate);
    const p = { ...FISH[id], back: o.col[0], belly: o.col[1], fin: o.col[2], glow: undefined, spots: [], stripe: undefined, bars: 0 };
    fish(mb, p, { flat: true, y: 0.24, s: 0.82, x: 0.03, z: 0 });
    o.extras?.(mb);
}
export const lemon = (mb: MB, x: number, z: number) => {
    mb.main.hull([[0, 0, 0.06], [0.3, 0, 0.06], [0.15, 0.18, 0.06], [0, 0, -0.06], [0.3, 0, -0.06], [0.15, 0.18, -0.06]], 0xffd966, { x, y: 0.1, z, rx: Math.PI / 2, rz: 0, j: 0.006 });
};
export function smokedTrout(mb: MB) {
    platedFish(mb, 'fish_trout', { plate: 0xecd5bb, col: [0xc9701a, 0xe8a04a, 0x9a4a1a], extras: (m: MB) => {
        m.main.box(0.5, 0.012, 0.03, 0x6a3a1a, { x: 0, y: 0.34, z: -0.02, ry: 0, ao: false });
        lemon(m, -0.5, 0.2);
        steam(m, 0.1, 0, 0xb8b0c8);
    } });
}
export function bakedBass(mb: MB) {
    platedFish(mb, 'fish_bass', { plate: 0xfff6e0, col: [0xe0a020, 0xf8d878, 0xc58f3e], extras: (m: MB) => {
        lemon(m, -0.52, -0.3);
        for (let i = 0; i < 3; i++) m.main.leaf(0.26, 0.08, 0.012, R.leaf[2], { x: 0.1 + i * 0.06, y: 0.4, z: 0.3, ry: 2.6 + i * 0.5, rx: -0.2 });
    } });
}
export function koiSashimi(mb: MB) {
    plate(mb.main, 0x35305c);
    for (let i = 0; i < 4; i++) {
        const x = -0.28 + i * 0.19, z = 0;
        mb.main.hull([[-0.08, 0, -0.17], [0.1, 0, -0.17], [-0.08, 0.1, 0.17], [0.1, 0.1, 0.17], [-0.08, 0.1, -0.15], [0.1, 0.07, -0.15]], au((_px: number, py: number) => py > 0.17 ? 0xfff0f2 : 0xf79fc6), { x, y: 0.12 + i * 0.012, z, ry: 0.1, rx: 0, j: 0.006 });
    }
    mb.main.ico(0.08, 0, 0x92d364, { x: 0.36, y: 0.16, z: -0.3, sy: 0.7, j: 0.01 });
    mb.main.leaf(0.3, 0.1, 0.012, R.leaf[2], { x: -0.1, y: 0.15, z: -0.34, ry: 1, rx: -0.1 });
    glint(mb, 0, 0.6, 0, 0.05, 0xfff6e0, 1.6);
}
export function pikeRoast(mb: MB) {
    plate(mb.main, 0xfff6e0);
    const b = mb.main, c = [0x8a4a1a, 0xb8741a, 0xd89a38, 0xf0c070];
    b.ico(0.44, 0, hg(c, 0.1, 0.5, 0.35), { x: 0, y: 0.3, z: 0.02, sx: 1.55, sy: 0.5, sz: 0.62, j: 0.02, v: 0.08 });
    b.hull([[0.5, 0.2, 0.07], [0.5, 0.2, -0.07], [0.85, 0.22, 0], [0.5, 0.34, 0]], 0x4a7a3f, { j: 0.006 });
    b.oct(0.03, W, { x: 0.62, y: 0.3, z: 0.07, ao: false });
    b.hull([[-0.55, 0.22, 0.02], [-0.55, 0.22, -0.02], [-0.8, 0.4, 0], [-0.8, 0.12, 0]], 0x6c8a3a, { j: 0.006 });
    for (const [x, z] of [[-0.2, 0.3], [0.1, 0.34], [0.32, 0.26]]) {
        b.oct(0.06, 0xe85d62, { x, y: 0.12, z, ao: false });
    }
    for (let i = 0; i < 2; i++) b.leaf(0.3, 0.09, 0.012, R.leaf[1 + i % 2], { x: -0.1 + i * 0.22, y: 0.46, z: -0.1, ry: 0.4 + i * 0.7, rx: -0.6, j: 0.005 });
}
export function pouch(mb: MB, tint: number, o: { tie?: number; seed?: number } = {}) {
    const b = mb.main, base = mix(0xd49a62, tint, 0.42), hi = mix(0xf4deaa, tint, 0.3);
    b.lathe([[0, 0], [0.32, 0], [0.5, 0.18], [0.47, 0.4], [0.2, 0.58]], 7, hg([darken(base, 0.2), base, hi, lighten(hi, 0.2)], 0, 0.5, 0.3), { j: 0.02, v: 0.06 });
    b.cone(0.26, 0.34, 6, hi, { y: 0.82, rx: Math.PI, j: 0.02, ao: false });
    b.tube(0.17, 0.21, 0.1, 6, o.tie ?? tint, { y: 0.62, j: 0.008, ao: false, v: 0.03 });
    b.cyl(0.23, 0.23, 0.04, 6, lighten(tint, 0.3), { y: 0.3, z: 0.44, rx: Math.PI / 2, ao: false, v: 0.02 });
    b.oct(0.16, tint, { y: 0.3, z: 0.47, sz: 0.4, ao: false, v: 0.02 });
    const sc = o.seed ?? tint;
    for (const [x, z, y] of [[-0.34, 0.42, 0.07], [-0.14, 0.52, 0.06], [0.14, 0.52, 0.06], [0.36, 0.4, 0.07]]) b.oct(0.08, sc, { x, y, z, sy: 0.8, ry: x * 6, ao: false, v: 0.06 });
}
export const seed = (tint: number, o: { tie?: number; seed?: number } = {}) => S((mb: MB) => pouch(mb, tint, o), { turn: 'sway', lean: 0.45 });
export const FOODS: Record<string, DropSpec> = {
    berry: S(berries),
    mushroom: S(mushroom),
    wheat: S(wheat, { turn: 'sway', diag: 0.2, size: 1.2 }),
    carrot: S(carrot, { diag: 0.65, turn: 'sway', lean: 0.5 }),
    pumpkin: S(pumpkin),
    melon: S(melon),
    beet: S(beet),
    corn: S(corn, { diag: 0.6, turn: 'sway', lean: 0.5 }),
    pepper: S(pepper, { turn: 'sway', lean: 0.4 }),
    flax: S(flax, { turn: 'sway' }),
    bread: S(loaf),
    cornbread: S(cornbread),
    pie: S((mb: MB) => pie(mb)),
    fish_pie: S((mb: MB) => pie(mb, { fish: true })),
    jam: S(jar, { lean: 0.35 }),
    stew: S(stewBowl),
    soup: S(soupBowl),
    spicy_stew: S(spicyBowl),
    melon_ice: S(iceBowl),
    catfish_stew: S(catfishBowl),
    stewed_eel: S(eelBowl),
    lantern_soup: S(lanternBowl),
    fish_minnow: fishSpec('fish_minnow'),
    fish_carp: fishSpec('fish_carp'),
    fish_perch: fishSpec('fish_perch'),
    fish_trout: fishSpec('fish_trout'),
    fish_bass: fishSpec('fish_bass'),
    fish_eel: S(eel, { turn: 'sway', lean: 0.85 }),
    fish_catfish: fishSpec('fish_catfish'),
    fish_koi: fishSpec('fish_koi'),
    fish_pike: fishSpec('fish_pike'),
    fish_lantern: fishSpec('fish_lantern'),
    fish_goldkoi: fishSpec('fish_goldkoi'),
    smoked_trout: S(smokedTrout),
    baked_bass: S(bakedBass),
    koi_sashimi: S(koiSashimi),
    pike_roast: S(pikeRoast),
    seed_wheat: seed(0xe8c040, { tie: 0xc58f3e }),
    seed_carrot: seed(0xf8a24a),
    seed_pumpkin: seed(0xdc6a1a, { seed: 0xfff6e0 }),
    seed_cotton: seed(0xfffbf4, { seed: 0xfffbf4, tie: 0xcdf4ee }),
    seed_beet: seed(0xb0446e),
    seed_corn: seed(0xffd966, { tie: 0x5cb04f }),
    seed_melon: seed(0x5cb04f, { seed: 0x2a1d2c }),
    seed_pepper: seed(0xe85d62),
    seed_flax: seed(0x4ab2cf)
};
