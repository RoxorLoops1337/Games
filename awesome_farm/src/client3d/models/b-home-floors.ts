// Floors: path, planks, brick, slate and carpet, joined to their neighbours.
import type { BuildE } from '../../shared/sim/types';
import { Bld, type BOpts, Col, darken, hash, lighten, MB, mix, type Model, seedRand } from './kit';
import { bakeH, fE, fN, fS, fT, fW, quadO, tone, tri, triO } from './b-home-util';
import { RAMP } from './data';

export const WD = RAMP.wood;
export function slab(b: Bld, mask: number, y: number, top: number, skirt: number) {
    fT(b, -0.5, 0.5, y, -0.5, 0.5, top, { v: 0.03, ao: false });
    if (!(mask & 4)) fS(b, -0.5, 0.5, 0, y, 0.5, skirt, { v: 0.03, ao: false });
    if (!(mask & 1)) fN(b, -0.5, 0.5, 0, y, -0.5, skirt, { v: 0.03, ao: false });
    if (!(mask & 2)) fE(b, 0.5, 0, y, -0.5, 0.5, skirt, { v: 0.03, ao: false });
    if (!(mask & 8)) fW(b, -0.5, 0, y, -0.5, 0.5, skirt, { v: 0.03, ao: false });
}
export function path(mb: MB, mask: number, seed: number) {
    const b = mb.main, R = seedRand(seed * 91 + 4);
    slab(b, mask, 0.045, 0x8a6a48, 0x7a5c3e);
    const zs = [-0.5, -0.16 + R() * 0.12, 0.12 + R() * 0.12, 0.5];
    const GAP = 0.024;
    for (let r = 0; r < 3; r++) {
        const n = r === 1 ? 3 : 2;
        const xs = [-0.5];
        for (let k = 1; k < n; k++) xs.push(-0.5 + k / n + (R() - 0.5) * 0.22);
        xs.push(0.5);
        for (let k = 0; k < n; k++) {
            const jit = () => (R() - 0.5) * 0.07;
            const c = [
                [xs[k] + (k ? jit() : 0), zs[r] + (r ? jit() : 0)],
                [xs[k + 1] + (k + 1 < n ? jit() : 0), zs[r] + (r ? jit() : 0)],
                [xs[k + 1] + (k + 1 < n ? jit() : 0), zs[r + 1] + (r + 1 < 3 ? jit() : 0)],
                [xs[k] + (k ? jit() : 0), zs[r + 1] + (r + 1 < 3 ? jit() : 0)]
            ];
            const cx = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4, cz = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
            const base = c.map(([x, z]) => [x + Math.sign(cx - x) * GAP / 2, z + Math.sign(cz - z) * GAP / 2]);
            const top = base.map(([x, z]) => [x + (cx - x) * 0.1, z + (cz - z) * 0.1]);
            const col = tone([0xcaa87c, 0xdcc090, 0xc4a070, 0xd4b284, 0xe4cc9c], r * 5 + k, seed);
            const yb = 0.045, yt = 0.068;
            const P = (p: number[], y: number) => [p[0], y, p[1]];
            quadO(b, P(top[0], yt), P(top[1], yt), P(top[2], yt), P(top[3], yt), [0, 1, 0], col, 0.05, false);
            for (let e = 0; e < 4; e++) {
                const a0 = base[e], a1 = base[(e + 1) % 4], t0 = top[e], t1 = top[(e + 1) % 4];
                const ex = (a0[0] + a1[0]) / 2 - cx, ez = (a0[1] + a1[1]) / 2 - cz;
                quadO(b, P(a0, yb), P(a1, yb), P(t1, yt), P(t0, yt), [ex, 0.6, ez], mix(col, ex + ez < 0 ? 0xffffff : 0x6a4a30, 0.22), 0.04, false);
            }
        }
    }
    for (let i = 0; i < 2; i++) {
        const x = (R() - 0.5) * 0.8, z = (R() - 0.5) * 0.8;
        mb.main.ico(0.026, 0, 0xb8946a, { x, y: 0.052, z, sy: 0.6, j: 0.006, ao: false });
    }
}
export function planks(mb: MB, mask: number, seed: number) {
    const b = mb.main, R = seedRand(seed * 47 + 2);
    slab(b, mask, 0.042, WD[0], WD[1]);
    const rows = 4, rh = 1 / rows, OFFS = [0, 0.34, 0.17, 0.42], y = 0.056, G = 0.014;
    for (let r = 0; r < rows; r++) {
        const z0 = -0.5 + r * rh + (r === 0 ? 0 : G / 2), z1 = -0.5 + (r + 1) * rh - (r === rows - 1 ? 0 : G / 2);
        const off = OFFS[r];
        for (let k = -1; k < 3; k++) {
            const j0 = -0.5 + off % 0.5 + k * 0.5 - 0.5, j1 = j0 + 0.5;
            const lo = Math.max(j0 + (j0 > -0.5 ? G / 2 : 0), -0.5), hi = Math.min(j1 - (j1 < 0.5 ? G / 2 : 0), 0.5);
            if (hi - lo < 0.004) continue;
            const col = tone([WD[2], WD[3], WD[3], WD[2], mix(WD[3], WD[4], 0.4)], r * 3 + k, seed + Math.round(R() * 4));
            fT(b, lo, hi, y, z0, z1, col, { v: 0.05, ao: false });
            fT(b, lo, hi, y + 0.001, z0, z0 + 0.025, mix(col, 0xffffff, 0.2), { v: 0.02, ao: false });
            fT(b, lo + 0.04, hi - 0.04, y + 0.001, (z0 + z1) / 2 - 0.004, (z0 + z1) / 2 + 0.004, mix(col, WD[0], 0.4), { v: 0.02, ao: false });
            if (j0 > -0.5 + 0.01) for (const sx of [-1, 1]) fT(b, j0 + sx * 0.05 - 0.008, j0 + sx * 0.05 + 0.008, y + 0.002, (z0 + z1) / 2 - 0.05, (z0 + z1) / 2 - 0.034, WD[0], { v: 0, ao: false });
        }
    }
}
export function brickfloor(mb: MB, mask: number, seed: number) {
    const b = mb.main;
    slab(b, mask, 0.045, 0x6a2a24, 0x5a2420);
    const BC = [0x9a4a36, 0xc0664a, 0xd88868, 0xb35e48];
    const rows = 4, rh = 1 / rows, gy = 0.03, gx = 0.03;
    for (let r = 0; r < rows; r++) {
        const z0 = -0.5 + r * rh + (r === 0 ? 0 : gy / 2), z1 = -0.5 + (r + 1) * rh - (r === rows - 1 ? 0 : gy / 2);
        const off = r & 1 ? 0.25 : 0;
        for (let k = -1; k < 3; k++) {
            const j0 = -0.5 + off + k * 0.5, j1 = j0 + 0.5;
            const lo = Math.max(j0 + (j0 > -0.5 ? gx / 2 : 0), -0.5), hi = Math.min(j1 - (j1 < 0.5 ? gx / 2 : 0), 0.5);
            if (hi - lo < 0.004) continue;
            const col = tone(BC, r * 4 + k, seed);
            fT(b, lo, hi, 0.062, z0, z1, col, { v: 0.05, ao: false });
            fT(b, lo, hi, 0.0625, z0, z0 + 0.03, lighten(col, 0.22), { v: 0.02, ao: false });
            fS(b, lo, hi, 0.045, 0.062, z1, darken(col, 0.3), { v: 0.02, ao: false, k: 1.4 });
        }
    }
}
export function slatefloor(mb: MB, mask: number, seed: number) {
    const b = mb.main;
    slab(b, mask, 0.045, 0x585c7c, 0x4a4d68);
    const SL = [0x7a7f9e, 0x9ea4bf, 0x8a90ae];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const x0 = -0.5 + i * 0.5 + 0.022, x1 = x0 + 0.456, z0 = -0.5 + j * 0.5 + 0.022, z1 = z0 + 0.456;
        const col = (i + j) % 2 ? SL[0] : tone([SL[1], SL[2]], i * 2 + j, seed);
        const m = 0.026, yt = 0.07;
        quadO(b, [x0 + m, yt, z0 + m], [x1 - m, yt, z0 + m], [x1 - m, yt, z1 - m], [x0 + m, yt, z1 - m], [0, 1, 0], col, 0.05, false);
        quadO(b, [x0, 0.045, z1], [x1, 0.045, z1], [x1 - m, yt, z1 - m], [x0 + m, yt, z1 - m], [0, 0.6, 1], mix(col, 0x3a3c52, 0.35), 0.03, false);
        quadO(b, [x0, 0.045, z0], [x1, 0.045, z0], [x1 - m, yt, z0 + m], [x0 + m, yt, z0 + m], [0, 0.6, -1], lighten(col, 0.3), 0.03, false);
        quadO(b, [x0, 0.045, z0], [x0, 0.045, z1], [x0 + m, yt, z1 - m], [x0 + m, yt, z0 + m], [-1, 0.6, 0], lighten(col, 0.22), 0.03, false);
        quadO(b, [x1, 0.045, z0], [x1, 0.045, z1], [x1 - m, yt, z1 - m], [x1 - m, yt, z0 + m], [1, 0.6, 0], mix(col, 0x3a3c52, 0.2), 0.03, false);
    }
}
export function carpet(mb: MB, mask: number, seed: number) {
    const b = mb.main;
    const RED = [0x7a2438, 0xa8384c, 0xd05a68, 0xf08a90], VIO = 0x4b3a6b, GOLD = 0xe0a020;
    const y = 0.058;
    slab(b, mask, y, RED[1], RED[0]);
    const lz = (_c: number, r: number, col: Col, yy: number) => quadO(b, [-r, yy, 0], [0, yy, -r], [r, yy, 0], [0, yy, r], [0, 1, 0], col, 0.03, false);
    lz(0, 0.3, RED[2], y + 0.002);
    lz(0, 0.2, RED[3], y + 0.003);
    lz(0, 0.1, GOLD, y + 0.004);
    lz(0, 0.045, RED[1], y + 0.005);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const cx = sx * 0.36, cz = sz * 0.36;
        quadO(b, [cx - 0.04, y + 0.002, cz], [cx, y + 0.002, cz - 0.04], [cx + 0.04, y + 0.002, cz], [cx, y + 0.002, cz + 0.04], [0, 1, 0], RED[2], 0.03, false);
    }
    const open2 = { N: !(mask & 1), E: !(mask & 2), S: !(mask & 4), W: !(mask & 8) };
    const strip = (d0: number, d1: number, col: Col, yy: number) => {
        const P = (x: number, z: number) => [x, yy, z];
        const ends = (open1: boolean, d: number) => open1 ? d : 0;
        if (open2.N) quadO(b, P(-0.5 + ends(open2.W, d0), -0.5 + d0), P(0.5 - ends(open2.E, d0), -0.5 + d0), P(0.5 - ends(open2.E, d1), -0.5 + d1), P(-0.5 + ends(open2.W, d1), -0.5 + d1), [0, 1, 0], col, 0.03, false);
        if (open2.S) quadO(b, P(-0.5 + ends(open2.W, d0), 0.5 - d0), P(0.5 - ends(open2.E, d0), 0.5 - d0), P(0.5 - ends(open2.E, d1), 0.5 - d1), P(-0.5 + ends(open2.W, d1), 0.5 - d1), [0, 1, 0], col, 0.03, false);
        if (open2.W) quadO(b, P(-0.5 + d0, -0.5 + ends(open2.N, d0)), P(-0.5 + d0, 0.5 - ends(open2.S, d0)), P(-0.5 + d1, 0.5 - ends(open2.S, d1)), P(-0.5 + d1, -0.5 + ends(open2.N, d1)), [0, 1, 0], col, 0.03, false);
        if (open2.E) quadO(b, P(0.5 - d0, -0.5 + ends(open2.N, d0)), P(0.5 - d0, 0.5 - ends(open2.S, d0)), P(0.5 - d1, 0.5 - ends(open2.S, d1)), P(0.5 - d1, -0.5 + ends(open2.N, d1)), [0, 1, 0], col, 0.03, false);
    };
    strip(0, 0.05, VIO, y + 0.003);
    strip(0.085, 0.12, GOLD, y + 0.004);
    void seed;
    void tri;
    void triO;
    void hash;
}
export const MAKERS: Record<string, ((mb: MB, mask: number, seed: number) => void) | undefined> = { path, planks, brickfloor, slatefloor, carpet };
export function floorModel(kind: string, o: BOpts): Model<BuildE> {
    const mask = o.mask & 15, seed = Math.abs(o.seed) % 4;
    const mk = MAKERS[kind];
    const g = bakeH(`floor_${kind}|${mask}|${seed}`, (mb: MB) => mk!(mb, mask, seed), seed * 7 + 2);
    g.traverse((m) => {
        m.castShadow = false;
    });
    return { obj: g };
}
