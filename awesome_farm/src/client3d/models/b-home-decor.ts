// Home pieces: fence, hedge, flowerbed, barrel, haybale, bench and table.
import type { BuildE } from '../../shared/sim/types';
import { Bld, type BOpts, byHeight, clamp, Col, hash, lighten, MB, mix, type Model, seedRand, TAU } from './kit';
import { bakeH, box, fS, fT, lift, quadO, tone, triO, vgrad } from './b-home-util';
import { RAMP } from './data';

export const WD = RAMP.wood;
export const LF = RAMP.leaf;
export const ST = RAMP.stone;
export const ST_S = RAMP.straw;
export function fence(mb: MB, mask: number) {
    const b = mb.main, hw = 0.07, ph = 0.62;
    box(b, -hw, hw, 0, ph, -hw, hw, { top: WD[4], s: WD[3], n: WD[2], e: WD[2], w: WD[3] }, '', { v: 0.05 });
    b.cone(0.105, 0.13, 4, (x: number, y: number) => x + y > 0 ? WD[4] : WD[3], { y: ph + 0.065, ry: Math.PI / 4, j: 0.004 });
    for (const [y0, y1] of [[0.16, 0.25], [0.39, 0.48]]) {
        const yy = (y0 + y1) / 2;
        if (mask & 2) box(b, hw - 0.01, 0.5, y0, y1, -0.028, 0.028, { top: WD[4], s: WD[3], n: WD[2] }, 'ew', { v: 0.05 });
        if (mask & 8) box(b, -0.5, -hw + 0.01, y0, y1, -0.028, 0.028, { top: WD[4], s: WD[3], n: WD[2] }, 'ew', { v: 0.05 });
        if (mask & 1) box(b, -0.028, 0.028, y0, y1, -0.5, -hw + 0.01, { top: WD[4], e: WD[2], w: WD[2] }, 'sn', { v: 0.05 });
        if (mask & 4) box(b, -0.028, 0.028, y0, y1, hw - 0.01, 0.5, { top: WD[4], e: WD[2], w: WD[2] }, 'sn', { v: 0.05 });
        fS(b, -0.012, 0.012, yy - 0.012, yy + 0.012, hw + 0.004, WD[0], { v: 0, ao: false });
    }
}
export function fenceModel(o: BOpts): Model<BuildE> {
    const mask = o.mask & 15;
    return { obj: bakeH(`fence|${mask}`, (mb: MB) => fence(mb, mask), 3) };
}
export function hedgeHull(b: Bld, x0: number, x1: number, z0: number, z1: number, open: { w: boolean; e: boolean; n: boolean; s: boolean; }, col: Col) {
    const levels = [[0, 0.03], [0.36, 0], [0.6, 0.1], [0.7, 0.2]];
    const pts = [];
    for (const [y, ins] of levels) {
        const a = x0 + (open.w ? 0 : ins), c = x1 - (open.e ? 0 : ins), d = z0 + (open.n ? 0 : ins), e = z1 - (open.s ? 0 : ins);
        pts.push([a, y, d], [c, y, d], [c, y, e], [a, y, e]);
    }
    b.hull(pts, col, { v: 0.07, ao: false });
}
export function hedge(mb: MB, mask: number, seed: number) {
    const b = mb.main, hw = 0.36;
    const col = byHeight([LF[0], LF[1], LF[1], LF[2], LF[2], LF[3]], -0.4, 0.95, 0.5, seed);
    const x0 = mask & 8 ? -0.5 : -hw, x1 = mask & 2 ? 0.5 : hw;
    hedgeHull(b, x0, x1, -hw, hw, { w: !!(mask & 8), e: !!(mask & 2), n: false, s: false }, col);
    if (mask & 1) hedgeHull(b, -hw, hw, -0.5, -0.16, { w: false, e: false, n: true, s: true }, col);
    if (mask & 4) hedgeHull(b, -hw, hw, 0.16, 0.5, { w: false, e: false, n: true, s: true }, col);
    const R = seedRand(seed * 11 + 5);
    for (let i = 0; i < 3; i++) {
        const a = i / 3 * 6.28 + R() * 1.2, r = 0.1 + R() * 0.1;
        b.ico(0.13 + R() * 0.04, 0, col, { x: Math.cos(a) * r, y: 0.64 + R() * 0.04, z: Math.sin(a) * r, sy: 0.75, j: 0.025, ao: false });
    }
    for (let i = 0; i < 4; i++) {
        const a = R() * 6.28, r = 0.05 + R() * 0.22;
        b.oct(0.045, LF[3], { x: Math.cos(a) * r, y: 0.7 + R() * 0.05, z: Math.sin(a) * r, sy: 0.35, ry: R() * 3, j: 0.008, ao: false, v: 0.04 });
    }
    for (const x of [-0.18, 0.2]) b.oct(0.035, LF[3], { x: x + (R() - 0.5) * 0.1, y: 0.3 + R() * 0.2, z: hw + 0.01, sz: 0.4, ry: R() * 3, ao: false });
}
export function hedgeModel(o: BOpts): Model<BuildE> {
    const mask = o.mask & 15, seed = Math.abs(o.seed) % 3;
    return { obj: bakeH(`hedge|${mask}|${seed}`, (mb: MB) => hedge(mb, mask, seed), seed * 5 + 1) };
}
export function flowerbed(mb: MB, seed: number) {
    const b = mb.main, R = seedRand(seed * 13 + 6);
    const X = 0.43, Z = 0.3, H = 0.28, T = 0.06;
    fS(b, -X, X, 0, H / 2 - 0.004, Z, vgrad(WD[2], 0, H, 0.2, 0.15), { v: 0.04 });
    fS(b, -X, X, H / 2 + 0.004, H, Z, vgrad(WD[3], 0, H, 0.2, 0.1), { v: 0.04 });
    box(b, -X, X, 0, H, -Z, Z, { n: WD[2], e: WD[2], w: WD[2] }, 'st', { v: 0.04, ao: false });
    fT(b, -X + T, X - T, 0.235, -Z + T, Z - T, 0x4a2f2a, { v: 0.05, ao: false });
    fT(b, -X, X, H + 0.004, Z - T, Z, WD[4], { v: 0.03, ao: false });
    fT(b, -X, X, H + 0.004, -Z, -Z + T, WD[3], { v: 0.03, ao: false });
    fT(b, -X, -X + T, H + 0.004, -Z + T, Z - T, WD[4], { v: 0.03, ao: false });
    fT(b, X - T, X, H + 0.004, -Z + T, Z - T, WD[4], { v: 0.03, ao: false });
    for (const sx of [-1, 1]) box(b, sx * (X - 0.04) - 0.04, sx * (X - 0.04) + 0.04, 0, H + 0.05, Z - 0.08, Z + 0.015, { top: WD[4], s: WD[3], e: WD[2], w: WD[3] }, 'n', { v: 0.04 });
    b.ico(0.12, 0, 0x5a3a2c, { x: -0.18, y: 0.235, z: 0.02, sy: 0.4, j: 0.02, ao: false });
    b.ico(0.1, 0, 0x4a2f2a, { x: 0.22, y: 0.235, z: -0.05, sy: 0.4, j: 0.02, ao: false });
    const blooms = [
        [-0.3, 0.04, 0.52, 0xf79fc6],
        [-0.13, -0.1, 0.62, 0xffd966],
        [0.06, 0, 0.5, 0xe85d62],
        [0.27, -0.08, 0.58, 0xcdf4ee],
        [-0.18, 0.14, 0.44, 0xffd966],
        [0.2, 0.12, 0.46, 0xf79fc6]
    ];
    for (const [x, z, y, c] of blooms) {
        const j = (R() - 0.5) * 0.04;
        b.rod([x, 0.23, z], [x + j, y, z + j], 0.012, 4, LF[2], 0.008);
        b.oct(0.075, (px: number, py: number, pz: number) => py > y ? lighten(c, 0.35) : hash(px * 9, pz * 9) > 0.5 ? c : mix(c, 0x2a1d2c, 0.18), { x: x + j, y, z: z + j, sy: 0.5, ry: R() * 3, j: 0.006, ao: false, v: 0.04 });
        b.oct(0.032, 0xffd966, { x: x + j, y: y + 0.025, z: z + j, sy: 0.7, ao: false, v: 0.02 });
    }
    for (const [x, z, rx, rz] of [[-0.34, 0.1, -0.2, 0.2], [0.34, 0.06, 0.2, 0.2], [-0.05, 0.16, 0, 0.25], [0.1, -0.14, 0.1, -0.2]]) b.blade(x, z, 0.3, rx, rz, 0.03, byHeight(LF, 0.2, 0.55, 0.4), { y: 0.23, ao: false });
}
export function flowerbedModel(o: BOpts): Model<BuildE> {
    const seed = Math.abs(o.seed) % 3;
    return { obj: bakeH(`flowerbed|${seed}`, (mb: MB) => flowerbed(mb, seed), seed * 3 + 2) };
}
export const barrelR = (y: number) => 1.12 * (0.3 - 0.1 * Math.pow((y - 0.31) / 0.31, 2));
export function barrel(mb: MB) {
    const b = mb.main, N = 8, H = 0.62;
    const prof = [[barrelR(0), 0], [barrelR(0.15), 0.15], [barrelR(0.31), 0.31], [barrelR(0.47), 0.47], [barrelR(H), H]];
    const stave = (x: number, y: number, z: number) => {
        const k = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * N) & 1;
        return lift(mix(k ? WD[2] : WD[3], WD[1], clamp(0.3 - y * 0.5)), 1.5);
    };
    b.lathe(prof, N, stave, { v: 0.05, ao: false });
    b.lathe([[0, H - 0.02], [barrelR(H) - 0.005, H - 0.02], [barrelR(H) - 0.005, H + 0.025], [barrelR(H) - 0.05, H + 0.025], [0, H + 0.01]], N, (x: number, _y: number, z: number) => hash(Math.round(x * 14), Math.round(z * 14)) > 0.55 ? WD[3] : WD[4], { v: 0.05, ao: false });
    for (const y of [0.1, 0.5]) {
        b.lathe([[barrelR(y - 0.04) + 0.014, y - 0.04], [barrelR(y + 0.04) + 0.014, y + 0.04]], N, (x: number, _yy: number, z: number) => lift(Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI * 2) * N * 2) & 1 ? RAMP.steel[3] : RAMP.steel[2], 1.3), { v: 0.04, ao: false });
    }
    b.oct(0.03, WD[1], { x: 0.1, y: H + 0.03, z: 0.07, sy: 0.4, ao: false });
}
export function barrelModel(_o: BOpts): Model<BuildE> {
    return { obj: bakeH('barrel', barrel, 1) };
}
export function disc(b: Bld, cx: number, cy: number, z: number, r: number, n: number, col: (i: number) => number) {
    for (let i = 0; i < n; i++) {
        const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
        triO(b, [cx, cy, z], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], [0, 0, 1], col(i), 0.05, false);
    }
}
export function haybale(mb: MB, seed: number) {
    const b = mb.main, R = seedRand(seed * 7 + 3), r = 0.34, L = 0.7;
    const body = (x: number, y: number, z: number) => {
        const k = Math.floor((Math.atan2(y - r, x) + Math.PI) / TAU * 8);
        return tone([ST_S[1], ST_S[2], ST_S[1], ST_S[2]], k, seed) + 0 * z;
    };
    b.tube(r, r, L, 8, body, { y: r, rx: Math.PI / 2, v: 0.06, ao: false, j: 0.008 });
    disc(b, 0, r, L / 2 + 0.002, r, 8, (i: number) => ST_S[1 + (i & 1)]);
    disc(b, 0, r, L / 2 + 0.006, r * 0.72, 8, (i: number) => ST_S[i & 1 ? 3 : 2]);
    disc(b, 0, r, L / 2 + 0.01, r * 0.46, 8, (i: number) => ST_S[i & 1 ? 1 : 2]);
    disc(b, 0, r, L / 2 + 0.014, r * 0.2, 6, () => RAMP.thatch[1]);
    for (const z of [-0.17, 0.17]) b.tube(r + 0.014, r + 0.014, 0.05, 8, RAMP.thatch[0], { y: r, z, rx: Math.PI / 2, v: 0.03, ao: false });
    for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU + R() * 0.4, rad = r * (0.7 + R() * 0.3);
        b.cone(0.03, 0.09 + R() * 0.07, 3, ST_S[2 + i % 2], { x: Math.cos(a) * rad, y: r + Math.sin(a) * rad, z: L / 2 + 0.02, rx: Math.PI / 2 - (R() - 0.5) * 0.5, rz: (R() - 0.5) * 0.5, ao: false, v: 0.05 });
    }
    for (let i = 0; i < 4; i++) b.cone(0.022, 0.12, 3, ST_S[3], { x: (R() - 0.5) * 0.3, y: 2 * r + 0.01, z: (R() - 0.5) * 0.5, rz: (R() - 0.5) * 1.2, rx: (R() - 0.5) * 1, ao: false });
}
export function haybaleModel(o: BOpts): Model<BuildE> {
    const seed = Math.abs(o.seed) % 3;
    const g = bakeH(`haybale|${seed}`, (mb: MB) => haybale(mb, seed), seed + 1);
    g.rotation.y = (seed - 1) * 0.14;
    return { obj: g };
}
export function bench(mb: MB) {
    const b = mb.main;
    const sy = 0.38, th = 0.05;
    for (let k = 0; k < 3; k++) {
        const z0 = -0.15 + k * 0.1, z1 = z0 + 0.088;
        box(b, -0.44, 0.44, sy - th, sy, z0, z1, { top: k === 1 ? WD[4] : mix(WD[4], WD[3], 0.3), s: WD[3], e: WD[2], w: WD[3] }, 'n', { v: 0.05 });
    }
    for (const sx of [-1, 1]) {
        const x = sx * 0.34;
        for (const sz of [-1, 1]) box(b, x - 0.035, x + 0.035, 0, sy - th, sz * 0.12 - 0.035, sz * 0.12 + 0.035, { top: WD[3], s: WD[2], e: WD[1], w: WD[2], n: WD[1] }, 't', { v: 0.05 });
        box(b, x - 0.03, x + 0.03, 0.12, 0.17, -0.12, 0.12, { top: WD[3], s: WD[2], e: WD[1], w: WD[2] }, 'n', { v: 0.04 });
    }
    box(b, -0.4, 0.4, sy - th - 0.07, sy - th, 0.115, 0.14, { top: WD[2], s: WD[2], e: WD[1] }, 'nw', { v: 0.04 });
    for (const x of [-0.34, 0.34]) fS(b, x - 0.012, x + 0.012, sy - 0.03, sy - 0.012, 0.15 + 0, WD[0], { v: 0, ao: false });
}
export function benchModel(_o: BOpts): Model<BuildE> {
    return { obj: bakeH('bench', bench, 2) };
}
export function table(mb: MB) {
    const b = mb.main;
    const ty = 0.5, th = 0.07, X = 0.93, Z = 0.38;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, sx * (X - 0.1) - 0.06, sx * (X - 0.1) + 0.06, 0, ty - th, sz * (Z - 0.1) - 0.06, sz * (Z - 0.1) + 0.06, { top: WD[2], s: WD[2], e: WD[1], w: WD[2], n: WD[1] }, 't', { v: 0.05 });
    box(b, -X + 0.1, X - 0.1, ty - th - 0.07, ty - th, Z - 0.1, Z - 0.06, { s: WD[3], e: WD[2] }, 'nwt', { v: 0.04 });
    for (let k = 0; k < 4; k++) {
        const z0 = -Z + k * (2 * Z / 4) + 0.004, z1 = -Z + (k + 1) * (2 * Z / 4) - 0.004;
        fT(b, -X, X, ty, z0, z1, tone([WD[4], mix(WD[4], WD[3], 0.35), WD[4], mix(WD[4], WD[3], 0.2)], k, 1), { v: 0.04, ao: false });
    }
    box(b, -X, X, ty - th, ty, -Z, Z, { s: WD[3], e: WD[2], w: WD[3], n: WD[2] }, 't', { v: 0.04 });
    for (const x of [-0.5, 0.5]) fS(b, x - 0.012, x + 0.012, ty - 0.04, ty - 0.02, Z + 0.003, WD[0], { v: 0, ao: false });
    fT(b, -0.62, 0.62, ty + 0.004, -0.2, 0.2, 0xfff0d2, { v: 0.03, ao: false });
    fT(b, -0.62, 0.62, ty + 0.005, 0.16, 0.2, 0xe85d62, { v: 0.03, ao: false });
    fT(b, -0.62, 0.62, ty + 0.005, -0.2, -0.16, 0xe85d62, { v: 0.03, ao: false });
    quadO(b, [-0.62, ty + 0.004, 0.2], [0.62, ty + 0.004, 0.2], [0.62, ty - 0.05, 0.215], [-0.62, ty - 0.05, 0.215], [0, 0, 1], 0xffe8c0, 0.03, false);
    const py = ty + 0.006;
    b.cyl(0.15, 0.12, 0.025, 8, 0xfff6e0, { x: -0.55, y: py + 0.012, z: 0.02, ao: false, v: 0.03 });
    b.ico(0.1, 0, (_x: number, y: number) => y > py + 0.07 ? 0xf0cc8a : 0xd49a52, { x: -0.55, y: py + 0.065, z: 0.02, sy: 0.65, sx: 1.25, j: 0.012, ao: false, ry: 0.4 });
    b.box(0.012, 0.012, 0.012, 0xb8741a, { x: -0.58, y: py + 0.12, z: 0 });
    b.ico(0.14, 0, (x: number, y: number, z: number) => y > py + 0.16 ? 0xffc878 : hash(x * 11, z * 11) > 0.5 ? 0xf39a3c : 0xd8702a, { x: 0, y: py + 0.1, z: 0, sy: 0.78, sx: 1.12, j: 0.012, ao: false, ry: 0.3 });
    b.cone(0.03, 0.07, 4, 0x6a432f, { x: 0, y: py + 0.22, z: 0, rz: 0.15, ao: false });
    b.cyl(0.055, 0.045, 0.1, 6, (_x: number, y: number) => y > py + 0.09 ? 0xe8c48a : 0xb87a46, { x: 0.52, y: py + 0.05, z: -0.04, ao: false, v: 0.05 });
    b.torus(0.032, 0.01, 3, 6, WD[2], { x: 0.58, y: py + 0.055, z: -0.04, ry: Math.PI / 2, ao: false });
    b.cyl(0.044, 0.044, 0.012, 6, 0xc9505a, { x: 0.52, y: py + 0.098, z: -0.04, ao: false });
}
export function tableModel(_o: BOpts): Model<BuildE> {
    return { obj: bakeH('table', table, 4) };
}
