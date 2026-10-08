// Home pieces: signpost, scarecrow, statue and banner.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { bakeH, box, fS, fT, lift, stamp, tone, triO } from './b-home-util';
import { RAMP } from './data';
import { Bld, type BOpts, byHeight, clamp, env, hash, M, MB, mix, type Model, pivot, seedRand, TAU } from './kit';

export const WD = RAMP.wood;
export const LF = RAMP.leaf;
export const ST = RAMP.stone;
export const RD = RAMP.red;
export const GD = RAMP.gold;
export function arrowBoard(dir: number, y0: number, y1: number, len: number, seed: number) {
    const t = new Bld(seed), z0 = 0.062, z1 = 0.108, tip = 0.17, ym = (y0 + y1) / 2;
    const xt = dir * len, xb = -dir * (len * 0.82);
    const pts = [];
    for (const z of [z0, z1]) pts.push([xb, y0, z], [xt - dir * tip, y0, z], [xt, ym, z], [xt - dir * tip, y1, z], [xb, y1, z]);
    t.hull(pts, (_x, y) => y > ym + 0.03 ? WD[4] : WD[3], { v: 0.05, ao: false });
    const x0 = Math.min(xb, xt - dir * tip) + 0.07, x1 = Math.max(xb, xt - dir * tip) - 0.08;
    fS(t, x0, x1, ym + 0.012, ym + 0.036, z1 + 0.003, WD[1], { v: 0.02, ao: false });
    fS(t, x0, x0 + (x1 - x0) * 0.62, ym - 0.045, ym - 0.025, z1 + 0.003, WD[1], { v: 0.02, ao: false });
    fS(t, xb + 0.026 - 0.012, xb + 0.026 + 0.012, ym - 0.012, ym + 0.012, z1 + 0.004, WD[0], { v: 0, ao: false });
    return t;
}
export function signpost(mb: MB) {
    const b = mb.main;
    box(b, -0.055, 0.055, 0, 1.2, -0.055, 0.055, { top: WD[4], s: WD[3], n: WD[2], e: WD[2], w: WD[3] }, '', { v: 0.05 });
    b.cone(0.085, 0.1, 4, WD[4], { y: 1.25, ry: Math.PI / 4 });
    stamp(b, arrowBoard(1, 0.86, 1.1, 0.38, 3), 0.12);
    stamp(b, arrowBoard(-1, 0.52, 0.74, 0.33, 4), -0.16);
    b.ico(0.19, 0, byHeight(ST, 0, 0.15, 0.4), { y: 0, sy: 0.4, sx: 1.15, j: 0.03 });
    b.ico(0.07, 0, ST[3], { x: 0.17, y: 0.03, z: 0.12, sy: 0.7, j: 0.01 });
    b.ico(0.055, 0, ST[2], { x: -0.15, y: 0.025, z: 0.14, sy: 0.7, j: 0.01 });
}
export function signpostModel(_o: BOpts): Model<BuildE> {
    return { obj: bakeH('signpost', signpost, 6) };
}
export function scarecrow(mb: MB) {
    const b = mb.main, V = RAMP.violet, ST_S = RAMP.straw, R = seedRand(11);
    const pink = (x: number, y: number, z: number) => mix(0xe58aa8, 0xffc0d4, clamp((y - 0.4) / 0.5) * 0.6 + hash(Math.round(x * 12), Math.round(z * 12) + Math.round(y * 9)) * 0.3);
    b.rod([0, 0, 0], [0, 1.2, 0], 0.048, 5, (_x: number, y: number) => mix(WD[2], WD[3], clamp(y * 0.5)), 0.042, { j: 0.006, ao: false });
    b.rod([-0.5, 0.84, -0.01], [0.5, 0.84, -0.01], 0.034, 4, WD[3], 0.034, { j: 0.006, ao: false });
    b.hull([[-0.2, 0.9, -0.1], [0.2, 0.9, -0.1], [0.2, 0.9, 0.1], [-0.2, 0.9, 0.1], [-0.15, 0.4, -0.085], [0.15, 0.4, -0.085], [0.15, 0.4, 0.085], [-0.15, 0.4, 0.085]], pink, { v: 0.06, ao: false });
    box(b, -0.165, 0.165, 0.43, 0.49, -0.095, 0.095, { top: RAMP.pumpkin[2], s: RAMP.pumpkin[2], e: RAMP.pumpkin[1], w: RAMP.pumpkin[2] }, 'n', { v: 0.04 });
    fS(b, -0.03, 0.03, 0.44, 0.48, 0.0975, RAMP.brass[2], { v: 0, ao: false });
    fS(b, 0.04, 0.12, 0.62, 0.7, 0.093, 0xffd966, { v: 0.04, ao: false });
    fS(b, 0.043, 0.117, 0.628, 0.692, 0.0945, 0xe85d62, { v: 0.04, ao: false });
    for (const sg of [-1, 1]) {
        b.rod([sg * 0.17, 0.85, 0], [sg * 0.48, 0.84, 0], 0.065, 5, pink, 0.05, { j: 0.008, ao: false });
        for (let k = 0; k < 2; k++) b.cone(0.022, 0.1 + R() * 0.05, 3, ST_S[2 + (k & 1)], { x: sg * (0.48 + 0.02 * k), y: 0.84 + (k - 0.5) * 0.05, z: (R() - 0.5) * 0.04, rz: -sg * (1.35 + R() * 0.3), ao: false });
    }
    for (let k = 0; k < 4; k++) b.cone(0.024, 0.11 + R() * 0.05, 3, ST_S[1 + k % 3], { x: -0.09 + k * 0.06, y: 0.36, z: (R() - 0.5) * 0.08, rx: Math.PI + (R() - 0.5) * 0.4, rz: (R() - 0.5) * 0.5, ao: false });
    b.ico(0.17, 1, (x: number, y: number, z: number) => hash(x * 8, z * 8 + y * 3) > 0.6 ? 0xd8aa6e : y > 1.12 ? 0xf8ddb0 : 0xe8c48a, { y: 1.1, sy: 1.04, j: 0.012, v: 0.05, ao: false });
    for (const sx of [-1, 1]) b.oct(0.025, 0x3a2433, { x: sx * 0.066, y: 1.14, z: 0.158, sz: 0.5, ao: false });
    fS(b, -0.06, 0.06, 1.045, 1.058, 0.162, 0xa83a46, { v: 0, ao: false });
    b.cyl(0.25, 0.26, 0.03, 6, (x: number, _y: number, z: number) => hash(x * 9, z * 9) > 0.5 ? V[2] : V[1], { y: 1.285, z: -0.02, rx: -0.32, j: 0.01, ao: false });
    b.cone(0.16, 0.36, 6, (_x: number, y: number) => y < 1.34 ? RAMP.brass[2] : mix(V[1], V[3], clamp((y - 1.34) / 0.3)), { y: 1.54, z: -0.08, rz: -0.2, rx: -0.32, x: -0.02, j: 0.01, ao: false });
}
export function scarecrowModel(_o: BOpts): Model<BuildE> {
    return { obj: bakeH('scarecrow', scarecrow, 7) };
}
export function statue(mb: MB, seed: number) {
    const b = mb.main;
    const stone = byHeight([0x76768a, 0x8e8e9e, 0xa4a2ac, 0xb6b2b2], -0.1, 1.3, 0.5, 3);
    const mossy = (moss: number) => (x: number, y: number, z: number) => {
        const m = hash(Math.round(x * 11) + seed, Math.round(z * 11) + Math.round(y * 8)) < moss * (1.1 - y * 0.9);
        return m ? mix(tone([LF[1], LF[2], LF[0]], Math.round(x * 20 + z * 20), seed), stone(x, y, z), 0.3) : stone(x, y, z);
    };
    box(b, -0.4, 0.4, 0, 0.17, -0.4, 0.4, { top: ST[1], s: ST[1], n: ST[1], e: ST[0], w: ST[1] }, '', { v: 0.05 });
    box(b, -0.31, 0.31, 0.17, 0.3, -0.31, 0.31, { top: ST[2], s: ST[2], n: ST[1], e: ST[1], w: ST[2] }, '', { v: 0.05 });
    fS(b, -0.14, 0.14, 0.2, 0.27, 0.31 + 0.004, ST[0], { v: 0.02, ao: false });
    fS(b, -0.1, 0.1, 0.225, 0.245, 0.31 + 0.006, ST[3], { v: 0.02, ao: false });
    fS(b, -0.4, -0.2, 0, 0.08, 0.4 + 0.004, LF[1], { v: 0.1, ao: false });
    fS(b, 0.12, 0.26, 0.1, 0.17, 0.4 + 0.004, LF[2], { v: 0.1, ao: false });
    fT(b, 0.05, 0.3, 0.172, 0.12, 0.38, LF[2], { v: 0.1, ao: false });
    b.sph(0.29, 9, 5, mossy(0.22), { y: 0.55, sy: 0.86, sx: 1.05, j: 0.02, v: 0.06, ao: false });
    b.ico(0.215, 1, mossy(0.1), { y: 0.97, z: 0.02, sy: 0.95, j: 0.015, v: 0.06, ao: false });
    for (const sg of [-1, 1]) {
        b.oct(0.1, mossy(0.12), { x: sg * 0.33, y: 0.55, z: 0.07, sy: 1.15, j: 0.01, ao: false });
        b.oct(0.12, mossy(0.3), { x: sg * 0.15, y: 0.33, z: 0.17, sy: 0.55, sz: 1.35, j: 0.01, ao: false });
    }
    for (const sx of [-1, 1]) {
        b.oct(0.045, ST[0], { x: sx * 0.085, y: 0.99, z: 0.215, sz: 0.5, sy: 1.25, ao: false });
        b.oct(0.04, mix(0xc99aa8, 0x8a8a9e, 0.3), { x: sx * 0.15, y: 0.9, z: 0.17, sz: 0.4, ao: false });
    }
    for (let k = 0; k < 5; k++) {
        const a = -0.6 + k * 0.3, x = Math.sin(a) * 0.09, y = 0.88 - (1 - Math.cos(a)) * 0.2;
        fS(b, x - 0.02, x + 0.02, y, y + 0.014, 0.224, ST[0], { v: 0, ao: false });
    }
    for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) * 0.62, len = 0.5 - Math.abs(i - 1.5) * 0.07;
        b.leaf(len, 0.11, 0.028, byHeight([LF[1], LF[2], LF[3], LF[4]], 1.1, 1.6, 0.35, i), { y: 1.12, x: Math.sin(a) * 0.04, z: 0, rx: -1.3 + Math.abs(i - 1.5) * 0.1, ry: a, j: 0.008, ao: false });
    }
}
export function statueModel(o: BOpts): Model<BuildE> {
    const seed = Math.abs(o.seed) % 3;
    return { obj: bakeH(`statue|${seed}`, (mb: MB) => statue(mb, seed), seed + 9) };
}
export const CLOTH = [
    [[-0.31, 0], [-0.16, 0], [-0.16, -0.8], [-0.31, -0.62]],
    [[-0.16, 0], [0.16, 0], [0.16, -0.8], [0, -0.88], [-0.16, -0.8]],
    [[0.16, 0], [0.31, 0], [0.31, -0.62], [0.16, -0.8]]
];
export const XC = [-0.235, 0, 0.235];
export const SUN_MAT = M(0xffffff, { vc: true, e: 0.55, ec: 0xffc850, r: 0.5 });
export function clothStrip(mb: MB, i: number) {
    const b = mb.main;
    const poly = CLOTH[i].map(([x, y]) => [x - XC[i], y]);
    const hem = 0.075;
    const col = (x: number, y: number) => y > -hem ? RD[3] : x + XC[i] < -0.1 ? RD[2] : x + XC[i] > 0.1 ? RD[1] : mix(RD[1], RD[2], 0.55);
    const front = (z: number, flip: boolean) => {
        for (let k = 1; k < poly.length - 1; k++) {
            const a = [poly[0][0], poly[0][1], z], c = [poly[k][0], poly[k][1], z], d = [poly[k + 1][0], poly[k + 1][1], z];
            triO(b, a, c, d, [0, 0, flip ? -1 : 1], flip ? mix(RD[0], 0x2a1d2c, 0.2) : (x: number, y: number) => col(x, y), 0.05, false);
        }
    };
    front(0, false);
    front(-0.004, true);
    if (i === 1) {
        const cy = -0.4, r = 0.105, r2 = 0.155, sun = mb.custom('sun', SUN_MAT);
        for (let k = 0; k < 8; k++) {
            const a0 = k / 8 * TAU, a1 = (k + 1) / 8 * TAU, am = (a0 + a1) / 2;
            triO(sun, [0, cy, 0.004], [Math.cos(a0) * r, cy + Math.sin(a0) * r, 0.004], [Math.cos(a1) * r, cy + Math.sin(a1) * r, 0.004], [0, 0, 1], k % 2 ? GD[2] : GD[3], 0.04, false);
            triO(sun, [Math.cos(am - 0.18) * (r + 0.01), cy + Math.sin(am - 0.18) * (r + 0.01), 0.004], [Math.cos(am + 0.18) * (r + 0.01), cy + Math.sin(am + 0.18) * (r + 0.01), 0.004], [Math.cos(am) * r2, cy + Math.sin(am) * r2, 0.004], [0, 0, 1], GD[1], 0.04, false);
        }
    }
}
export const bannerStatic = (mb: MB) => {
    const b = mb.main;
    box(b, -0.18, 0.18, 0, 0.11, -0.18, 0.18, { top: ST[1], s: ST[1], n: ST[0], e: ST[0], w: ST[1] }, '', { v: 0.06 });
    b.ico(0.1, 0, ST[2], { x: 0.17, y: 0.04, z: 0.14, sy: 0.6, j: 0.01 });
    b.ico(0.08, 0, ST[1], { x: -0.16, y: 0.03, z: 0.17, sy: 0.6, j: 0.01 });
    b.rod([0, 0.1, 0], [0, 1.58, 0], 0.045, 6, (_x: number, y: number) => lift(mix(WD[2], WD[3], clamp(y * 0.4)), 1.4), 0.04, { j: 0.005, ao: false });
    b.rod([-0.37, 1.5, 0], [0.37, 1.5, 0], 0.03, 5, WD[3], 0.03, { ao: false });
    b.oct(0.065, GD[2], { y: 1.64, sy: 1.2, ao: false });
    for (const sx of [-1, 1]) b.oct(0.04, GD[2], { x: sx * 0.38, y: 1.5, ao: false });
};
export function bannerModel(o: BOpts): Model<BuildE> {
    const seed = Math.abs(o.seed);
    const obj = new THREE.Group();
    obj.add(bakeH('banner.pole', bannerStatic, 12));
    const hinges: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
        const cloth = bakeH(`banner.cloth|${i}`, (mb: MB) => clothStrip(mb, i), 13 + i);
        cloth.traverse((m) => {
            m.receiveShadow = false;
        });
        const h = pivot(cloth, XC[i], 1.485, 0.045);
        obj.add(h);
        hinges.push(h);
    }
    const ph = hash(seed, 3) * TAU, AMP = [0.15, 0.09, 0.15];
    return {
        obj,
        update(_dt: number, t: number) {
            const w = 0.45 + env.wind * 0.9;
            for (let i = 0; i < 3; i++) {
                const h = hinges[i], s = t * 1.9 * w + ph - i * 0.85;
                h.rotation.x = -0.05 * w + Math.sin(s) * AMP[i] * w;
                h.scale.y = 1 - 0.035 * w * (0.5 + 0.5 * Math.sin(s * 1.3 + 1.2));
            }
        }
    };
}
