// Shared helpers for house pieces: flat faces and boxes straight into a builder, south-face fill light, and roofs that fade in steps.
import * as THREE from 'three';
import { bake, Bld, type Col, type ColorFn, hash, hash3, M, MB, mix, type Pt, smooth, VC } from './kit';

/** A face colour for `box`: one colour, or one per side (top, south, north, east, west). */
export type BoxCol = Col | { top?: Col; s?: Col; n?: Col; e?: Col; w?: Col };
/** Face options: shade variation, ambient occlusion on or off, and how much a south face is lifted (`k`). */
export interface FaceOpts { v?: number; ao?: boolean; k?: number }

export const _c = new THREE.Color();
export const q4 = (v: number) => Math.round(v * 4000) / 4000;
/** One flat-shaded triangle straight into a builder. */
export function tri(b: Bld, p: Pt, q: Pt, r: Pt, col: Col, v = 0.05, ao = true) {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], wx = r[0] - p[0], wy = r[1] - p[1], wz = r[2] - p[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    const mx = (p[0] + q[0] + r[0]) / 3, my = (p[1] + q[1] + r[1]) / 3, mz = (p[2] + q[2] + r[2]) / 3;
    let f = 1 + (hash3(q4(mx) * 7.1 + b.seed, q4(my) * 7.1, q4(mz) * 7.1) - 0.5) * 2 * v;
    if (ao) {
        const n = ny / len;
        f *= (n >= 0 ? 0.95 + 0.05 * n : 0.95 + 0.14 * n) * (my < 0.4 ? 0.84 + 0.16 * smooth(0, 0.4, my) : 1);
    }
    _c.setHex(typeof col === 'function' ? col(mx, my, mz) : col).multiplyScalar(f);
    b.pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
    b.col.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
}
/** A triangle wound so that its face points along `hint`. */
export function triO(b: Bld, p: Pt, q: Pt, r: Pt, hint: Pt, col: Col, v = 0.05, ao = true) {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], wx = r[0] - p[0], wy = r[1] - p[1], wz = r[2] - p[2];
    const d = (uy * wz - uz * wy) * hint[0] + (uz * wx - ux * wz) * hint[1] + (ux * wy - uy * wx) * hint[2];
    if (d >= 0) tri(b, p, q, r, col, v, ao);
    else tri(b, p, r, q, col, v, ao);
}
export function quadO(b: Bld, p: Pt, q: Pt, r: Pt, s: Pt, hint: Pt, col: Col, v = 0.05, ao = true) {
    triO(b, p, q, r, hint, col, v, ao);
    triO(b, p, r, s, hint, col, v, ao);
}
export function quad(b: Bld, p: Pt, q: Pt, r: Pt, s: Pt, col: Col, v = 0.05, ao = true) {
    tri(b, p, q, r, col, v, ao);
    tri(b, p, r, s, col, v, ao);
}
export const lift = <T extends Col>(c: T, _k = 1): T => c;
export const liftCol = <T extends Col>(c: T, _k: number): T => c;
export const FILL = { scale: 1, target: 0.3, max: 2.4 };
export const SUN = { x: -0.51, y: 0.73, z: -0.47 };
export function fillSouth(b: Bld) {
    const P = b.pos, C = b.col;
    for (let i = 0; i < P.length; i += 9) {
        const ux = P[i + 3] - P[i], uy = P[i + 4] - P[i + 1], uz = P[i + 5] - P[i + 2], wx = P[i + 6] - P[i], wy = P[i + 7] - P[i + 1], wz = P[i + 8] - P[i + 2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-12) continue;
        nx /= len;
        ny /= len;
        nz /= len;
        const sun = Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z) / 0.73;
        const light = 0.11 + 0.11 * Math.max(0, ny) + 0.7 * sun;
        const f = Math.max(1, Math.min(1 + (FILL.max - 1) * FILL.scale, 1 + (FILL.target / light - 1) * FILL.scale));
        if (f <= 1.001) continue;
        for (let v = 0; v < 3; v++) {
            const k = i + v * 3;
            let r = C[k] * f, g = C[k + 1] * f, bl = C[k + 2] * f;
            const m = Math.max(r, g, bl);
            if (m > 1) {
                r /= m;
                g /= m;
                bl /= m;
            }
            C[k] = r;
            C[k + 1] = g;
            C[k + 2] = bl;
        }
    }
}
export function bakeH(key: string, fn: (mb: MB) => void, seed = 0) {
    return bake(`home:${key}|f${FILL.scale}`, (mb) => {
        fn(mb);
        if (FILL.scale > 0) fillSouth(mb.main);
    }, seed);
}
export const fS = (b: Bld, x0: number, x1: number, y0: number, y1: number, z: number, c: Col, o: FaceOpts = {}) => quad(b, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], liftCol(c, o.k ?? 1.6), o.v, o.ao);
export const fN = (b: Bld, x0: number, x1: number, y0: number, y1: number, z: number, c: Col, o: FaceOpts = {}) => quad(b, [x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], c, o.v, o.ao);
export const fE = (b: Bld, x: number, y0: number, y1: number, z0: number, z1: number, c: Col, o: FaceOpts = {}) => quad(b, [x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], c, o.v, o.ao);
export const fW = (b: Bld, x: number, y0: number, y1: number, z0: number, z1: number, c: Col, o: FaceOpts = {}) => quad(b, [x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], c, o.v, o.ao);
export const fT = (b: Bld, x0: number, x1: number, y: number, z0: number, z1: number, c: Col, o: FaceOpts = {}) => quad(b, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c, o.v, o.ao);
/** An axis-aligned box of flat faces; `skip` names faces to leave out ('t', 's', 'n', 'e', 'w'). */
export function box(b: Bld, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: BoxCol, skip = '', o: FaceOpts = {}) {
    const k = typeof c === 'object' ? c : { top: c, s: c, n: c, e: c, w: c };
    const d = k.s ?? k.top ?? 0xff00ff;
    if (!skip.includes('t')) fT(b, x0, x1, y1, z0, z1, k.top ?? d, o);
    if (!skip.includes('s')) fS(b, x0, x1, y0, y1, z1, k.s ?? d, o);
    if (!skip.includes('n')) fN(b, x0, x1, y0, y1, z0, k.n ?? d, o);
    if (!skip.includes('e')) fE(b, x1, y0, y1, z0, z1, k.e ?? d, o);
    if (!skip.includes('w')) fW(b, x0, y0, y1, z0, z1, k.w ?? d, o);
}
/** Copy a builder's triangles into another, turned by ry and moved. */
export function stamp(dst: Bld, src: Bld, ry = 0, tx = 0, ty = 0, tz = 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (let i = 0; i < src.pos.length; i += 3) {
        const x = src.pos[i], z = src.pos[i + 2];
        dst.pos.push(x * c + z * s + tx, src.pos[i + 1] + ty, -x * s + z * c + tz);
    }
    for (const k of src.col) dst.col.push(k);
}
export const tone = <T>(list: readonly T[], i: number, seed = 0): T => list[Math.floor(hash(i * 7.31 + seed * 1.7, i * 2.1 + seed * 5.3) * list.length) % list.length];
export const vgrad = (base: number, y0: number, y1: number, k = 0.14, dk = 0): ColorFn => (_x: number, y: number) => {
    const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
    return mix(mix(base, 0x2a1d2c, dk * (1 - t)), 0xffffff, k * t);
};
export const FADE_MATS: THREE.Material[] = [VC, M(0xffffff, { vc: true, t: 0.72 }), M(0xffffff, { vc: true, t: 0.46 }), M(0xffffff, { vc: true, t: 0.22 })];
export const GHOST = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
FADE_MATS.push(GHOST);
/** Fade a building out in steps (for roofs over the farmer): shared see-through materials, so no per-building clones. */
export function makeFade(root: THREE.Object3D) {
    const list: THREE.Mesh[] = [];
    root.traverse((o) => {
        const m = o as THREE.Mesh;

        if (m.isMesh && m.material === VC) list.push(m);
    });
    let cur = 0;
    return (alpha: number) => {
        const k = alpha >= 0.9 ? 0 : alpha >= 0.6 ? 1 : alpha >= 0.33 ? 2 : alpha >= 0.1 ? 3 : 4;
        if (k === cur) return;
        cur = k;
        for (const m of list) m.material = FADE_MATS[k];
    };
}
