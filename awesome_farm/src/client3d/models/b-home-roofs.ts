// Roofs (thatch, tile, slate) built tile by tile from which neighbours they join.
import type { BuildE } from '../../shared/sim/types';
import { Bld, type BOpts, hash, lerp, MB, mix, type Model, type Pt } from './kit';
import { bakeH, fE, fN, fS, fT, fW, makeFade, quadO, triO } from './b-home-util';
import { RAMP } from './data';

export const YB = 1.6;
export const FA = 0.07;
export const OV = 0.08;
export const TILE = [0x7a2f2a, 0xa84a3a, 0xd0684a, 0xf08a64];
export const SLATE = [0x3a3c52, 0x555878, 0x747aa0, 0x9ea4c8];
/** A roof covering: its colour ramp, shingles per row (0: thatch), staggered rows, rows per slope, shading, colour noise, fascia colours. */
export interface RoofStyle { ramp: readonly number[]; per: number; stagger: boolean; rows: number; shade: number; noise: number; fascia: number[] }
export const STYLES: Record<string, RoofStyle> = {
    thatch: { ramp: RAMP.thatch, per: 0, stagger: false, rows: 4, shade: 0.22, noise: 0.5, fascia: [RAMP.thatch[1], RAMP.straw[1]] },
    tile: { ramp: TILE, per: 4, stagger: false, rows: 4, shade: 0.3, noise: 0.18, fascia: [TILE[0], TILE[1]] },
    slate: { ramp: SLATE, per: 4, stagger: true, rows: 5, shade: 0.22, noise: 0.5, fascia: [SLATE[0], SLATE[1]] }
};
export const lp = (a: Pt, b: Pt, t2: number): Pt => [lerp(a[0], b[0], t2), lerp(a[1], b[1], t2), lerp(a[2], b[2], t2)];
export function cellCol(rs: RoofStyle, style: string, r: number, k: number, seed: number, shaded: boolean) {
    const R2 = rs.ramp, h = hash(r * 3.17 + seed * 0.7, k * 5.31 + 1.3);
    let c;
    if (style === 'tile') c = mix(k & 1 ? mix(R2[2], R2[1], 0.42) : R2[2], R2[3], h * rs.noise * 0.5);
    else if (style === 'slate') c = mix(R2[1], R2[2], 0.25 + h * rs.noise * 1.4);
    else c = mix(R2[1], R2[2], 0.35 + h * rs.noise * 1.6);
    return shaded ? mix(c, R2[0], style === 'thatch' ? 0.45 : 0.55) : c;
}
export function slopeRows(b: Bld, rs: RoofStyle, style: string, p00: Pt, p10: Pt, p11: Pt, p01: Pt, K: number, hint: Pt, seed: number, relief: number) {
    for (let i = 0; i < K; i++) {
        const f0 = i / K, f1 = (i + 1) / K;
        let L0 = lp(p00, p01, f0), R0 = lp(p10, p11, f0);
        const L1 = lp(p00, p01, f1), R1 = lp(p10, p11, f1);
        if (relief && i > 0) {
            const up = (p: Pt) => [p[0], p[1] + relief, p[2]];
            const dL = lp(p00, p01, f0), dR = lp(p10, p11, f0);
            quadO(b, dL, dR, up(dR), up(dL), hint, mix(rs.ramp[0], rs.ramp[1], 0.3), 0.04, false);
            L0 = up(L0);
            R0 = up(R0);
        }
        const per = rs.per || 2 + i % 2;
        const stag = rs.stagger && i & 1 ? 0.5 / per : 0;
        const M0 = lp(L0, L1, rs.shade), M1 = lp(R0, R1, rs.shade);
        for (let k = -1; k <= per; k++) {
            let ua = stag + k / per, ub = stag + (k + 1) / per;
            if (!rs.per) {
                ua = (k + hash(i, k + seed) * 0.4) / per;
                ub = (k + 1 + hash(i, k + 1 + seed) * 0.4) / per;
            }
            ua = Math.max(0, ua);
            ub = Math.min(1, ub);
            if (ub - ua < 0.002) continue;
            quadO(b, lp(L0, R0, ua), lp(L0, R0, ub), lp(M0, M1, ub), lp(M0, M1, ua), hint, cellCol(rs, style, i, k, seed, true), 0.03, false);
            quadO(b, lp(M0, M1, ua), lp(M0, M1, ub), lp(L1, R1, ub), lp(L1, R1, ua), hint, cellCol(rs, style, i, k, seed, false), 0.04, false);
        }
    }
}
export function plateau(b: Bld, rs: RoofStyle, style: string, x0: number, x1: number, z0: number, z1: number, y: number, seed: number) {
    if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return;
    const rh = 1 / rs.rows;
    for (let r = 0; r < rs.rows; r++) {
        const za = -0.5 + r * rh, zb = za + rh;
        const lo = Math.max(za, z0), hi = Math.min(zb, z1);
        if (hi - lo < 0.001) continue;
        const per = rs.per || 2;
        const stag = rs.stagger && r & 1 ? 0.5 / per : rs.per ? 0 : 0.17 * (r * 3 % 4) / 3;
        const shadeZ = zb - rh * rs.shade;
        for (let k = -1; k <= per; k++) {
            let ua = -0.5 + stag + k / per, ub = ua + 1 / per;
            if (!rs.per) {
                ua += (hash(r, k) - 0.5) * 0.3;
                ub += (hash(r, k + 1) - 0.5) * 0.3;
            }
            const xa = Math.max(ua, x0), xb = Math.min(ub, x1);
            if (xb - xa < 0.002) continue;
            if (shadeZ > lo + 0.001) fT(b, xa, xb, y, lo, Math.min(shadeZ, hi), cellCol(rs, style, r, k, seed, false), { v: 0.04, ao: false });
            if (hi > shadeZ + 0.001) fT(b, xa, xb, y, Math.max(shadeZ, lo), hi, cellCol(rs, style, r, k, seed, true), { v: 0.03, ao: false });
        }
    }
}
export function buildRoof(mb: MB, style: string, mask: number, seed: number) {
    const b = mb.main, rs = STYLES[style];
    const eN = !(mask & 1), eE = !(mask & 2), eS = !(mask & 4), eW = !(mask & 8);
    const ridgeX = eN && eS, ridgeZ = eE && eW;
    const SW = 0.46;
    const swN = eN ? ridgeX ? 0.5 : SW : 0, swS = eS ? ridgeX ? 0.5 : SW : 0, swW = eW ? ridgeZ ? 0.5 : SW : 0, swE = eE ? ridgeZ ? 0.5 : SW : 0;
    const Ht = YB + (ridgeX && ridgeZ ? 0.46 : ridgeX || ridgeZ ? 0.42 : 0.36);
    const ET = YB + FA;
    const xbW = eW ? -0.5 - OV : -0.5, xbE = eE ? 0.5 + OV : 0.5, zbN = eN ? -0.5 - OV : -0.5, zbS = eS ? 0.5 + OV : 0.5;
    const txW = -0.5 + swW, txE = 0.5 - swE, tzN = -0.5 + swN, tzS = 0.5 - swS;
    plateau(b, rs, style, txW, txE, tzN, tzS, Ht, seed);
    const K = ridgeX || ridgeZ ? 4 : 3;
    const relief = 0.022;
    if (eS) slopeRows(b, rs, style, [xbW, ET, zbS], [xbE, ET, zbS], [txE, Ht, tzS], [txW, Ht, tzS], K, [0, 1, 1], seed, relief);
    if (eN) slopeRows(b, rs, style, [xbE, ET, zbN], [xbW, ET, zbN], [txW, Ht, tzN], [txE, Ht, tzN], K, [0, 1, -1], seed + 1, 0);
    if (eE) slopeRows(b, rs, style, [xbE, ET, zbS], [xbE, ET, zbN], [txE, Ht, tzN], [txE, Ht, tzS], K, [1, 1, 0], seed + 2, 0);
    if (eW) slopeRows(b, rs, style, [xbW, ET, zbN], [xbW, ET, zbS], [txW, Ht, tzS], [txW, Ht, tzN], K, [-1, 1, 0], seed + 3, 0);
    const [fc, ft] = rs.fascia;
    if (eS) {
        fS(b, xbW, xbE, YB, ET + relief, zbS, fc, { v: 0.05 });
    }
    if (eN) fN(b, xbW, xbE, YB, ET, zbN, fc);
    if (eE) fE(b, xbE, YB, ET, zbN, zbS, fc);
    if (eW) fW(b, xbW, YB, ET, zbN, zbS, fc);
    void ft;
    if (style === 'thatch') {
        const hem = (a: Pt, c: Pt, out: Pt, n: number, s: number) => {
            for (let i = 0; i < n; i++) {
                const t0 = i / n, t1 = (i + 1) / n, len = 0.05 + hash(i + s, seed) * 0.08, tm = (t0 + t1) / 2 + (hash(i, s + 3) - 0.5) * 0.04;
                const p0 = lp(a, c, t0), p1 = lp(a, c, t1), pm = lp(a, c, tm);
                triO(b, [p0[0], YB + 0.01, p0[2]], [p1[0], YB + 0.01, p1[2]], [pm[0] + out[0] * 0.012, YB - len, pm[2] + out[2] * 0.012], out, i % 2 ? RAMP.straw[1] : RAMP.thatch[1], 0.06, false);
            }
        };
        if (eS) hem([xbW, YB, zbS + 0.004], [xbE, YB, zbS + 0.004], [0, 0, 1], 8, 1);
        if (eN) hem([xbE, YB, zbN - 0.004], [xbW, YB, zbN - 0.004], [0, 0, -1], 8, 2);
        if (eE) hem([xbE + 0.004, YB, zbS], [xbE + 0.004, YB, zbN], [1, 0, 0], 8, 3);
        if (eW) hem([xbW - 0.004, YB, zbN], [xbW - 0.004, YB, zbS], [-1, 0, 0], 8, 4);
    } else if (eS) {
        const n = style === 'tile' ? 6 : 5;
        for (let i = 0; i < n; i++) {
            const x0 = lerp(xbW, xbE, i / n), x1 = lerp(xbW, xbE, (i + 1) / n);
            if (style === 'tile') triO(b, [x0 + 0.01, YB + 0.002, zbS + 0.01], [x1 - 0.01, YB + 0.002, zbS + 0.01], [(x0 + x1) / 2, YB - 0.035, zbS + 0.012], [0, 0, 1], TILE[i % 2 ? 1 : 0], 0.05, false);
        }
    }
    if (ridgeX && !ridgeZ) ridgeCap(b, style, txW, txE, 0, Ht, true);
    else if (ridgeZ && !ridgeX) ridgeCap(b, style, tzN, tzS, 0, Ht, false);
}
export function ridgeCap(b: Bld, style: string, a0: number, a1: number, c: number, y: number, alongX: boolean) {
    const col = style === 'thatch' ? RAMP.straw[1] : style === 'tile' ? TILE[0] : SLATE[0];
    const top = style === 'thatch' ? RAMP.straw[2] : style === 'tile' ? TILE[1] : SLATE[1];
    const w = style === 'thatch' ? 0.07 : 0.05, h = style === 'thatch' ? 0.07 : 0.05;
    if (alongX) {
        fT(b, a0, a1, y + h, c - w, c + w, top, { v: 0.05, ao: false });
        fS(b, a0, a1, y, y + h, c + w, col, { v: 0.04, k: 1.2 });
        fN(b, a0, a1, y, y + h, c - w, col);
        const x0 = Math.abs(a0 + 0.5) < 0.000001 ? -1 : a0, x1 = Math.abs(a1 - 0.5) < 0.000001 ? -1 : a1;
        if (x0 !== -1) fW(b, a0, y, y + h, c - w, c + w, col);
        if (x1 !== -1) fE(b, a1, y, y + h, c - w, c + w, col);
    } else {
        fT(b, c - w, c + w, y + h, a0, a1, top, { v: 0.05, ao: false });
        fE(b, c + w, y, y + h, a0, a1, col);
        fW(b, c - w, y, y + h, a0, a1, col);
        if (Math.abs(a1 - 0.5) > 0.000001) fS(b, c - w, c + w, y, y + h, a1, col, { k: 1.2 });
        if (Math.abs(a0 + 0.5) > 0.000001) fN(b, c - w, c + w, y, y + h, a0, col);
    }
}
export function roofModel(style: string, o: BOpts): Model<BuildE> {
    const mask = o.mask & 15, seed = Math.abs(o.seed) % 3;
    const g = bakeH(`roof_${style}|${mask}|${seed}`, (mb: MB) => buildRoof(mb, style, mask, seed), seed * 13 + 1);
    return { obj: g, fade: makeFade(g) };
}
