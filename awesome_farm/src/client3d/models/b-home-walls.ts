// Walls (wood, stone, brick, windowed, low stone) joined to their neighbours, and the doorway.
import type { BuildE } from '../../shared/sim/types';
import { bakeH, box, fE, fN, fS, fT, fW, makeFade, stamp, tone, tri, vgrad } from './b-home-util';
import { RAMP } from './data';
import { Bld, type BOpts, hash, lighten, M, MB, mix, type Model, seedRand } from './kit';

export const HT = 0.19;
export const WALL_H = 1.6;
/** A wall's proportions: half thickness, plinth and cap heights, top, and stone courses. */
export interface WallCfg { hh: number; plinth: number; capY: number; top: number; courses: number }
/** A strip of wall top seen from above. */
export interface Rect { x0: number; x1: number; z0: number; z1: number; alongX: boolean }
export const WALL_CFG: WallCfg = { hh: HT, plinth: 0.24, capY: 1.5, top: WALL_H, courses: 5 };
export const BLOCK_CFG: WallCfg = { hh: 0.37, plinth: 0.1, capY: 0.6, top: 0.7, courses: 3 };
export function layer(b: Bld, cfg: WallCfg, mask: number, e: number, y0: number, y1: number, c: { top: number; s: number; o: number; }, top = true) {
    const h = cfg.hh + e;
    const x0 = mask & 8 ? -0.5 : -h, x1 = mask & 2 ? 0.5 : h;
    const rects: Rect[] = [{ x0, x1, z0: -h, z1: h, alongX: true }];
    if (mask & 1) rects.push({ x0: -h, x1: h, z0: -0.5, z1: -h, alongX: false });
    if (mask & 4) rects.push({ x0: -h, x1: h, z0: h, z1: 0.5, alongX: false });
    if (top) for (const r of rects) fT(b, r.x0, r.x1, y1, r.z0, r.z1, c.top);
    const sS = mask & 4 ? [[x0, -h], [h, x1]] : [[x0, x1]];
    const sN = mask & 1 ? [[x0, -h], [h, x1]] : [[x0, x1]];
    for (const [a, z] of sS) if (z - a > 0.0001) fS(b, a, z, y0, y1, h, c.s);
    for (const [a, z] of sN) if (z - a > 0.0001) fN(b, a, z, y0, y1, -h, c.o);
    if (!(mask & 2)) fE(b, x1, y0, y1, -h, h, c.o);
    if (!(mask & 8)) fW(b, x0, y0, y1, -h, h, c.o);
    if (mask & 1) {
        fE(b, h, y0, y1, -0.5, -h, c.o);
        fW(b, -h, y0, y1, -0.5, -h, c.o);
    }
    if (mask & 4) {
        fE(b, h, y0, y1, h, 0.5, c.o);
        fW(b, -h, y0, y1, h, 0.5, c.o);
        fS(b, -h, h, y0, y1, 0.5, c.o);
    }
    return rects;
}
export function frontSegs(cfg: WallCfg, mask: number) {
    const h = cfg.hh, x0 = mask & 8 ? -0.5 : -h, x1 = mask & 2 ? 0.5 : h;
    return mask & 4 ? [[x0, -h], [h, x1]] : [[x0, x1]];
}
export const clip = (a: number, z: number, s: number[]) => {
    const l = Math.max(a, s[0]), r = Math.min(z, s[1]);
    return r - l > 0.03 ? [l, r] : null;
};
export function pieces(a0: number, a1: number, per: number, off: number, g: number) {
    const out: number[][] = [];
    let lo = a0;
    for (let k = Math.ceil((a0 - off) / per); off + k * per < a1 - 0.000001; k++) {
        const j = off + k * per;
        if (j <= a0 + 0.000001) continue;
        out.push([lo, j - g / 2]);
        lo = j + g / 2;
    }
    out.push([lo, a1]);
    return out.filter((p) => p[1] - p[0] > 0.02);
}
export const WD = RAMP.wood;
export const ST = RAMP.stone;
export const BR3 = RAMP.brick;
export const LF = RAMP.leaf;
export function woodFront(b: Bld, cfg: WallCfg, segs: number[][], seed: number, hasBatten = true) {
    const ZF = cfg.hh;
    for (const s of segs) {
        for (let k = 0; k < 5; k++) {
            const r = clip(-0.5 + 0.2 * k + 0.006, -0.5 + 0.2 * (k + 1) - 0.006, s);
            if (!r) continue;
            const alt = (k + (seed & 1)) % 2 === 0;
            const base = hash(k * 3.7, seed) < 0.28 ? alt ? WD[3] : WD[2] : alt ? WD[2] : WD[3];
            fS(b, r[0], r[1], cfg.plinth, cfg.capY, ZF + 0.008, vgrad(base, cfg.plinth, cfg.capY, 0.16, 0.14), { v: 0.04 });
            const cx = (r[0] + r[1]) / 2;
            if (r[1] - r[0] > 0.12) fS(b, cx - 0.016, cx + 0.016, 1.34, 1.38, ZF + 0.0095, WD[0], { v: 0, ao: false });
        }
        if (hasBatten) {
            box(b, s[0], s[1], 0.5, 0.6, ZF, ZF + 0.034, { top: WD[4], s: WD[3] }, 'nwe', { v: 0.04 });
            for (let k = 0; k < 5; k++) {
                const cx = -0.5 + 0.2 * k + 0.1;
                if (cx > s[0] + 0.03 && cx < s[1] - 0.03) fS(b, cx - 0.016, cx + 0.016, 0.545, 0.575, ZF + 0.0355, WD[0], { v: 0, ao: false });
            }
        }
    }
}
export function woodTop(b: Bld, cfg: WallCfg, rects: Rect[]) {
    const y = cfg.top + 0.003;
    for (const r of rects) {
        if (r.alongX) {
            const zm = (r.z0 + r.z1) / 2;
            fT(b, r.x0, r.x1, y, r.z0, zm - 0.006, WD[4], { v: 0.04, ao: false });
            fT(b, r.x0, r.x1, y, zm + 0.006, r.z1, mix(WD[4], WD[3], 0.35), { v: 0.04, ao: false });
        } else {
            const xm = (r.x0 + r.x1) / 2;
            fT(b, r.x0, xm - 0.006, y, r.z0, r.z1, WD[4], { v: 0.04, ao: false });
            fT(b, xm + 0.006, r.x1, y, r.z0, r.z1, mix(WD[4], WD[3], 0.35), { v: 0.04, ao: false });
        }
    }
}
export const COURSES = [[1 / 2, 0], [1 / 3, 0.1], [1 / 2, 0.25], [1 / 3, 0.22], [1 / 2, 0.12]];
export function stoneFront(b: Bld, cfg: WallCfg, segs: number[][], seed: number) {
    const ZF = cfg.hh, n = cfg.courses, ch = (cfg.capY - cfg.plinth) / n, g = 0.016, p = 0.03;
    const R = seedRand(seed * 31 + 7);
    for (let c = 0; c < n; c++) {
        const [sz, off] = COURSES[c % COURSES.length];
        const y0 = cfg.plinth + c * ch + g / 2, y1 = cfg.plinth + (c + 1) * ch - g / 2;
        for (let k = -1; k < Math.ceil(1 / sz) + 1; k++) {
            const j0 = -0.5 + off + k * sz, j1 = j0 + sz;
            if (j1 <= -0.5 || j0 >= 0.5) continue;
            for (const s of segs) {
                const lo = Math.max(j0 + (j0 > -0.5 + 0.000001 ? g / 2 : 0), s[0]), hi = Math.min(j1 - (j1 < 0.5 - 0.000001 ? g / 2 : 0), s[1]);
                if (hi - lo < 0.004) continue;
                const t = R();
                let base = t < 0.18 ? ST[1] : t < 0.62 ? ST[2] : ST[3];
                const mossy = c < 2 && R() < 0.4;
                if (mossy) base = mix(base, LF[1], 0.25);
                fS(b, lo, hi, y0, y1 - 0.02, ZF + p, vgrad(base, y0, y1, 0.14, 0.1), { v: 0.04 });
                fT(b, lo, hi, y1 - 0.02, ZF, ZF + p, lighten(base, 0.3), { v: 0.03, ao: false });
                if (mossy) {
                    const mw = (hi - lo) * (0.4 + R() * 0.3), mx = lo + (hi - lo) * (0.1 + R() * 0.3), zz = ZF + p + 0.004;
                    tri(b, [mx, y0, zz], [mx + mw, y0, zz], [mx + mw * 0.6, y0 + 0.1 + R() * 0.05, zz], LF[2], 0.1, false);
                    tri(b, [mx, y0, zz], [mx + mw * 0.6, y0 + 0.1, zz], [mx + mw * 0.1, y0 + 0.06, zz], LF[1], 0.1, false);
                }
            }
        }
    }
}
export function stoneTop(b: Bld, cfg: WallCfg, rects: Rect[], seed: number) {
    const y = cfg.top + 0.003;
    for (const r of rects) {
        const [a0, a1] = r.alongX ? [r.x0, r.x1] : [r.z0, r.z1];
        pieces(a0, a1, 0.5, 0.25, 0.034).forEach(([lo, hi], i) => {
            const c = tone([mix(ST[1], ST[2], 0.6), mix(ST[2], ST[3], 0.35), ST[2], mix(ST[1], LF[1], 0.25)], Math.round(lo * 10) + i + (r.alongX ? 0 : 5), seed);
            if (r.alongX) fT(b, lo, hi, y, r.z0, r.z1, c, { v: 0.03, ao: false });
            else fT(b, r.x0, r.x1, y, lo, hi, c, { v: 0.03, ao: false });
        });
    }
}
export function brickFront(b: Bld, cfg: WallCfg, segs: number[][], seed: number) {
    const ZF = cfg.hh, n = 8, ch = (cfg.capY - cfg.plinth) / n, gy = 0.022, gx = 0.02, p = 0.016;
    const R = seedRand(seed * 53 + 3);
    for (let c = 0; c < n; c++) {
        const off = c & 1 ? 1 / 6 : 0, sz = 1 / 3;
        const y0 = cfg.plinth + c * ch + gy / 2, y1 = cfg.plinth + (c + 1) * ch - gy / 2;
        for (let k = -1; k < 4; k++) {
            const j0 = -0.5 + off + k * sz, j1 = j0 + sz;
            if (j1 <= -0.5 || j0 >= 0.5) continue;
            for (const s of segs) {
                const lo = Math.max(j0 + (j0 > -0.5 + 0.000001 ? gx / 2 : 0), s[0]), hi = Math.min(j1 - (j1 < 0.5 - 0.000001 ? gx / 2 : 0), s[1]);
                if (hi - lo < 0.004) continue;
                const t = R();
                const base = t < 0.22 ? BR3[1] : t < 0.7 ? BR3[2] : BR3[3];
                fS(b, lo, hi, y0, y1, ZF + p, vgrad(base, y0, y1, 0.16, 0.1), { v: 0.05 });
            }
        }
    }
}
export function brickTop(b: Bld, cfg: WallCfg, rects: Rect[], seed: number) {
    const y = cfg.top + 0.003;
    for (const r of rects) {
        const [a0, a1] = r.alongX ? [r.x0, r.x1] : [r.z0, r.z1];
        pieces(a0, a1, 1 / 3, 1 / 6, 0.02).forEach(([lo, hi], i) => {
            const c = tone([BR3[3], BR3[4], BR3[3]], Math.round(lo * 10) + i + (r.alongX ? 0 : 5), seed);
            if (r.alongX) fT(b, lo, hi, y, r.z0, r.z1, c, { v: 0.04, ao: false });
            else fT(b, r.x0, r.x1, y, lo, hi, c, { v: 0.04, ao: false });
        });
    }
}
export const GLASS = M(0xffffff, { vc: true, r: 0.25, m: 0.1, e: 0.5, ec: 0x9fd4ea });
export function windowParts(frame: Bld, glass: Bld) {
    const GX = 0.19, y0 = 0.76, y1 = 1.18, fw = 0.065, pr = 0.04, z = HT;
    const ym = (y0 + y1) / 2;
    box(frame, -GX - fw, -GX, y0, y1, z, z + pr, { top: WD[4], s: WD[2] }, 'nwe');
    box(frame, GX, GX + fw, y0, y1, z, z + pr, { top: WD[4], s: WD[2] }, 'nwe');
    box(frame, -GX - fw - 0.025, GX + fw + 0.025, y1, y1 + fw, z, z + pr + 0.012, { top: WD[4], s: WD[3] }, 'nwe');
    box(frame, -GX - fw - 0.03, GX + fw + 0.03, y0 - fw - 0.01, y0, z, z + pr + 0.045, { top: WD[4], s: WD[3] }, 'nwe');
    box(frame, -0.014, 0.014, y0, y1, z, z + pr - 0.006, { top: WD[4], s: WD[2] }, 'nwe');
    box(frame, -GX, GX, ym - 0.014, ym + 0.014, z, z + pr - 0.006, { top: WD[4], s: WD[2] }, 'nwe');
    const zg = z + 0.016, c = [0xf2fcff, 0xd2effa, 0xb4e2f2, 0xa0d4ea];
    fS(glass, -GX, -0.014, ym + 0.014, y1, zg, c[0], { v: 0.02, ao: false, k: 1 });
    fS(glass, 0.014, GX, ym + 0.014, y1, zg, c[1], { v: 0.02, ao: false, k: 1 });
    fS(glass, -GX, -0.014, y0, ym - 0.014, zg, c[2], { v: 0.02, ao: false, k: 1 });
    fS(glass, 0.014, GX, y0, ym - 0.014, zg, c[3], { v: 0.02, ao: false, k: 1 });
}
export function buildWall(mb: MB, style: string, mask: number, seed: number) {
    const b = mb.main, cfg = style === 'block' ? BLOCK_CFG : WALL_CFG;
    const stone = style === 'stone' || style === 'block' || style === 'fort';
    let cols;
    if (stone) cols = { plinth: { top: ST[2], s: ST[1], o: ST[1] }, body: { top: ST[2], s: ST[0], o: ST[2] }, cap: { top: ST[0], s: ST[3], o: ST[3] } };
    else if (style === 'brick') cols = { plinth: { top: BR3[3], s: BR3[1], o: BR3[1] }, body: { top: BR3[2], s: mix(BR3[0], 0xe8d8c0, 0.5), o: BR3[2] }, cap: { top: BR3[1], s: BR3[3], o: BR3[3] } };
    else cols = { plinth: { top: WD[2], s: WD[1], o: WD[1] }, body: { top: WD[3], s: WD[0], o: WD[2] }, cap: { top: WD[2], s: WD[3], o: WD[3] } };
    const pe = style === 'block' ? 0.02 : 0.03, ce = style === 'block' ? 0.025 : 0.035;
    layer(b, cfg, mask, pe, 0, cfg.plinth, cols.plinth, true);
    layer(b, cfg, mask, 0, cfg.plinth, cfg.capY, cols.body, false);
    const tops = layer(b, cfg, mask, ce, cfg.capY, cfg.top, cols.cap, true);
    const segs = frontSegs(cfg, mask);
    if (stone) {
        stoneFront(b, cfg, segs, seed);
        stoneTop(b, cfg, tops, seed);
        if (style === 'block') mossTufts(b, cfg, tops, seed);
        if (style === 'fort') fortBands(mb, cfg, mask);
    } else if (style === 'brick') {
        brickFront(b, cfg, segs, seed);
        brickTop(b, cfg, tops, seed);
    } else {
        woodFront(b, cfg, segs, seed, style !== 'window');
        woodTop(b, cfg, tops);
    }
    if (style === 'window' && (mask === 10 || mask === 5)) {
        const f = new Bld(b.seed), g = new Bld(b.seed);
        windowParts(f, g);
        const gl = mb.custom('glass', GLASS);
        const turns = mask === 10 ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
        for (const t of turns) {
            stamp(b, f, t);
            stamp(gl, g, t);
        }
    }
}
/** The Fortified Wall: stone bound by two iron bands (they follow the joins like the courses do) with rivet heads along them. */
export function fortBands(mb: MB, cfg: WallCfg, mask: number) {
    const I = RAMP.steel, band = { top: I[2], s: I[1], o: I[2] };
    for (const y of [0.56, 1.18]) layer(mb.main, cfg, mask, 0.022, y, y + 0.09, band, true);
    const h = cfg.hh + 0.026, x0 = mask & 8 ? -0.5 : -h, x1 = mask & 2 ? 0.5 : h, sh = mb.shiny();
    for (const y of [0.605, 1.225]) for (let x = x0 + 0.12; x < x1 - 0.06; x += 0.26) for (const z of [-h, h]) sh.box(0.045, 0.045, 0.02, I[3], { x, y, z, ao: false, v: 0 });
}
export function mossTufts(b: Bld, cfg: WallCfg, rects: Rect[], seed: number) {
    const R = seedRand(seed * 17 + 9), y = cfg.top + 0.006, r0 = rects[0];
    for (let i = 0; i < 3; i++) {
        const cx = r0.x0 + (r0.x1 - r0.x0) * (0.15 + R() * 0.7), cz = r0.z0 + (r0.z1 - r0.z0) * (0.2 + R() * 0.6), w = 0.06 + R() * 0.05;
        tri(b, [cx - w, y, cz + w * 0.6], [cx + w, y, cz + w * 0.5], [cx + w * 0.2, y, cz - w], i % 2 ? LF[1] : LF[2], 0.08, false);
    }
}
export function wallModel(style: string, o: BOpts): Model<BuildE> {
    const mask = o.mask & 15, seed = Math.abs(o.seed) % 3;
    const g = bakeH(`wall_${style}|${mask}|${seed}`, (mb: MB) => buildWall(mb, style, mask, seed), seed * 17 + 3);
    return { obj: g, fade: makeFade(g) };
}
export function buildDoor(mb: MB, ry: number) {
    const b = ry ? new Bld(5) : mb.main, sh = ry ? new Bld(6) : mb.shiny(), z = 0.215, ZS = z;
    const inner = 0.3;
    for (const sg of [-1, 1]) {
        const xa = sg < 0 ? -0.5 : inner, xb = sg < 0 ? -inner : 0.5;
        box(b, xa, xb, 0, 1.3, -z, z, { top: WD[3], s: WD[2], n: WD[2], e: WD[1], w: WD[1] }, 't', { v: 0.04 });
        const mid = (xa + xb) / 2;
        fS(b, xa + 0.008, mid - 0.006, 0.26, 1.28, ZS + 0.008, vgrad(WD[3], 0.26, 1.28, 0.16, 0.14), { v: 0.05 });
        fS(b, mid + 0.006, xb - 0.008, 0.26, 1.28, ZS + 0.008, vgrad(WD[2], 0.26, 1.28, 0.16, 0.14), { v: 0.05 });
        box(b, xa, xb, 0, 0.26, -z - 0.02, z + 0.02, { top: WD[2], s: WD[1], n: WD[1], e: WD[0], w: WD[0] }, '', { v: 0.04 });
        for (const y of [0.5, 1.05]) fS(b, mid - 0.015, mid + 0.015, y, y + 0.03, ZS + 0.0105, WD[0], { v: 0, ao: false });
    }
    box(b, -0.5, 0.5, 1.28, 1.6, -z - 0.01, z + 0.015, { top: WD[4], s: WD[3], n: WD[3] }, 'ew', { v: 0.04 });
    fS(b, -0.5, 0.5, 1.32, 1.46, z + 0.0185, vgrad(WD[2], 1.32, 1.46, 0.14, 0.1), { v: 0.04 });
    for (const x of [-0.2, 0.2]) fS(b, x - 0.016, x + 0.016, 1.38, 1.42, z + 0.02, WD[0], { v: 0, ao: false });
    tri(b, [inner, 1.28, z + 0.004], [inner - 0.17, 1.28, z + 0.004], [inner, 1.1, z + 0.004], WD[2], 0.05, false);
    tri(b, [-inner, 1.28, z + 0.004], [-inner, 1.1, z + 0.004], [-inner + 0.17, 1.28, z + 0.004], WD[2], 0.05, false);
    fT(b, -0.5, 0.5, 0.04, -0.3, 0.3, WD[0], { v: 0, ao: false });
    for (let k = 0; k < 3; k++) {
        const zz0 = -0.3 + k * 0.2 + 0.006, zz1 = zz0 + 0.2 - 0.012;
        fT(b, -0.5, 0.5, 0.05, zz0, zz1, tone([WD[3], WD[2], WD[3]], k), { v: 0.05, ao: false });
    }
    fS(b, -0.5, 0.5, 0, 0.05, 0.3, WD[1], { v: 0.03, ao: false });
    for (const x of [-0.42, 0.42]) for (let k = 0; k < 3; k++) {
        const zc = -0.2 + k * 0.2;
        fT(b, x - 0.014, x + 0.014, 0.0515, zc - 0.014, zc + 0.014, WD[0], { v: 0, ao: false });
    }
    sh.box(0.03, 0.03, 0.03, RAMP.brass[2], { y: 1.24, z: z + 0.02 });
    sh.box(0.012, 0.09, 0.012, RAMP.brass[1], { y: 1.205, z: z + 0.02 });
    for (const sg of [-1, 1]) {
        const x = sg * (0.5 + 0.008), f = sg > 0 ? fE : fW;
        f(b, x, 0.26, 1.28, -z + 0.01, -0.005, vgrad(WD[3], 0.26, 1.28, 0.16, 0.14), { v: 0.05 });
        f(b, x, 0.26, 1.28, 0.005, z - 0.01, vgrad(WD[2], 0.26, 1.28, 0.16, 0.14), { v: 0.05 });
        f(b, x, 1.32, 1.46, -z, z, vgrad(WD[2], 1.32, 1.46, 0.14, 0.1), { v: 0.04 });
        for (const zz of [-0.1, 0.1]) f(b, x, 0.7, 0.73, zz - 0.015, zz + 0.015, WD[0], { v: 0, ao: false });
        f(b, sg * 0.5, 0, 0.26, -z - 0.02, z + 0.02, WD[1], { v: 0.04 });
    }
    if (ry) {
        stamp(mb.main, b, ry);
        stamp(mb.shiny(), sh, ry);
    }
}
export function doorwayModel(o: BOpts): Model<BuildE> {
    const ry = o.rot & 1 ? Math.PI / 2 : 0;
    const g = bakeH(`doorway|${ry ? 1 : 0}`, (mb: MB) => buildDoor(mb, ry), 5);
    return { obj: g, fade: makeFade(g) };
}
