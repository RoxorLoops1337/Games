// Special buildings: the creature den, a lost backpack and the mine ladder.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { bob, glint, glints, halo, nightScale } from './b-special-util';
import { RAMP } from './data';
import { bake, type BOpts, byHeight, clamp, env, hash, mix, type Model, smooth, TAU } from './kit';

export const W = RAMP.wood;
export const ST = RAMP.stone;
export const TH = RAMP.thatch;
export const CR = RAMP.cream;
export const RD = RAMP.red;
export const GOLD = RAMP.gold;
export const BR = RAMP.brass;
export const PLASTER = [0xd9c3a0, 0xecdcb8, 0xf8ecd0, 0xfff7e3];
export const pickR = (R: readonly number[], t: number): number => R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1))))];
export function arch(w: number, h: number, seg = 5) {
    const r = w / 2, pts = [[-r, 0], [-r, h - r]];
    for (let k = 1; k < seg; k++) {
        const a = Math.PI - k / seg * Math.PI;
        pts.push([Math.cos(a) * r, h - r + Math.sin(a) * r]);
    }
    pts.push([r, h - r], [r, 0]);
    return pts;
}
export function den(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    const yF = 0.18, yW = 1.24;
    g.add(bake('sp.den.body', (mb) => {
        const b = mb.main;
        const stone = (x: number, y: number, z: number) => pickR(ST, clamp(0.4 + (-x - z) * 0.18 + (hash(x * 31, z * 29 + y * 7) - 0.5) * 0.5));
        const plaster = (x: number, y: number, z: number) => pickR(PLASTER, clamp(0.66 + (-x - z) * 0.3 + (hash(x * 7, y * 5 + z * 3) - 0.5) * 0.15));
        const timber = (x: number, y: number, z: number) => pickR(W, clamp(0.4 + y * 0.1 + -x * 0.15 + (hash(x * 17, y * 11 + z) - 0.5) * 0.3));
        b.hull([[-0.86, 0, -0.74], [0.86, 0, -0.74], [0.86, 0, 0.78], [-0.86, 0, 0.78], [-0.82, yF, -0.7], [0.82, yF, -0.7], [0.82, yF, 0.74], [-0.82, yF, 0.74]], stone, { j: 0.025, v: 0.08 });
        for (const [x, z, s] of [[-0.66, 0.86, 0.07], [0.66, 0.88, 0.06], [0.95, 0.4, 0.07], [-0.93, -0.2, 0.06]]) b.oct(s, stone, { x, y: s * 0.5, z, sy: 0.7, ry: x, j: 0.015 });
        b.box(1.56, yW - yF, 1.36, plaster, { y: (yW + yF) / 2, z: 0.02, j: 0.012, v: 0.04 });
        for (const x of [-0.8, 0.8]) b.box(0.11, yW - yF + 0.04, 0.11, timber, { x, y: (yW + yF) / 2, z: 0.71, j: 0.008 });
        b.box(1.7, 0.08, 0.11, timber, { y: yW - 0.02, z: 0.71, j: 0.008 });
        for (const x of [-0.8, 0.8]) b.box(0.11, 0.08, 1.46, timber, { x, y: yW - 0.02, z: 0, j: 0.008 });
        b.box(1.56, 0.05, 0.08, timber, { y: 0.52, z: 0.7 });
        for (const x of [-0.26, 0.26]) b.box(0.06, 0.7, 0.06, timber, { x, y: 0.88, z: 0.71 });
        const door = arch(0.46, 0.8, 5);
        b.hull([...door.map(([x, y]) => [x * 1.17, y * 1.05 + yF, 0.7]), ...door.map(([x, y]) => [x * 1.17, y * 1.05 + yF, 0.74])], byHeight(W, 0, 1, 0.3), { v: 0.04, ao: false });
        b.hull([...door.map(([x, y]) => [x, y + yF, 0.72]), ...door.map(([x, y]) => [x, y + yF, 0.77])], (x, y) => pickR(W, clamp(0.6 + y * 0.2 + Math.round(x * 12) % 2 * 0.12)), { v: 0.04, ao: false });
        b.box(0.02, 0.7, 0.015, W[1], { y: 0.6, z: 0.775, ao: false, v: 0 });
        b.oct(0.04, GOLD[2], { x: 0.15, y: 0.6, z: 0.79, ao: false });
        b.box(0.64, 0.06, 0.26, stone, { y: 0.03, z: 0.88, j: 0.01 });
        b.box(0.36, 0.3, 0.04, W[1], { x: -0.55, y: 0.92, z: 0.7 });
        b.box(0.48, 0.09, 0.14, byHeight(W, 0.4, 0.6, 0.4, 2), { x: -0.55, y: 0.74, z: 0.77, j: 0.006 });
        for (const [x, c] of [[-0.69, 0xf79fc6], [-0.55, 0xe85d62], [-0.41, 0xfff6e0]]) b.oct(0.05, c, { x, y: 0.81, z: 0.77, sy: 0.9, j: 0.004, ao: false });
        for (const x of [-0.62, -0.48]) b.oct(0.05, 0x5cb04f, { x, y: 0.79, z: 0.8, sy: 0.6, j: 0.01 });
        b.cyl(0.18, 0.18, 0.03, 8, W[1], { x: 0.55, y: 0.94, z: 0.7, rx: Math.PI / 2 });
        b.box(0.36, 0.02, 0.03, W[0], { x: 0.55, y: 0.94, z: 0.73, ao: false });
        b.box(0.02, 0.36, 0.03, W[0], { x: 0.55, y: 0.94, z: 0.73, ao: false });
        b.box(0.24, 1.1, 0.24, stone, { x: 0.46, y: 1.95, z: -0.2, j: 0.012 });
        b.box(0.32, 0.07, 0.32, ST[3], { x: 0.46, y: 2.52, z: -0.2 });
        const thatch = (x: number, y: number, z: number) => pickR(TH, clamp((y - 1.15) / 0.95 * 0.55 + 0.3 + -x * 0.12 + (hash(x * 23, y * 19 + z * 7) - 0.5) * 0.5));
        const yE = 1.22, yR = 2.04, hw = 1.04;
        b.hull([[-hw, yE, -0.9], [hw, yE, -0.9], [hw, yE, 0.78], [-hw, yE, 0.78], [0, yR - 0.04, -0.82], [0, yR - 0.04, 0.74]], (x, y, z) => pickR(TH, clamp(0.72 + (y - yE) * 0.25 + -x * 0.1 + (hash(x * 5, z * 5) - 0.5) * 0.2)), { j: 0.015, v: 0.05 });
        const slope = Math.atan2(yR - yE, hw);
        for (const s of [-1, 1]) {
            for (let i = 0; i < 4; i++) {
                const t = 0.18 + i * 0.25, len = 1.7 + i % 2 * 0.06, w = 0.38 + i * 0.012;
                const nx = Math.sin(slope), ny = Math.cos(slope);
                b.box(w, 0.07, len, thatch, { x: s * hw * t + s * nx * 0.045, y: yR - (yR - yE) * t + ny * 0.045, z: -0.02, rz: -s * slope, j: 0.02, v: 0.09 });
            }
        }
        b.box(0.12, 0.1, 1.7, (x, _y, z) => pickR(TH, clamp(0.55 + (hash(x * 9, z * 9) - 0.5) * 0.5)), { y: yR + 0.02, z: -0.02, j: 0.02 });
        for (const s of [-1, 1]) b.rod([s * (hw + 0.04), yE - 0.02, 0.8], [0, yR + 0.04, 0.76], 0.03, 4, W[2]);
        for (let i = 0; i < 3; i++) {
            const s = i % 2 ? 1 : -1, xx = s * (0.2 + i * 0.25);
            b.cone(0.03, 0.14, 3, TH[1 + i % 3], { x: xx, y: yR - (yR - yE) * (Math.abs(xx) / hw) - 0.02, z: 0.82, rx: 2.4, ao: false });
        }
    }, 4));
    const glass = bake('sp.den.glass', (mb) => {
        const gl = mb.glow(0xffc860, 1.4);
        gl.box(0.28, 0.21, 0.02, (_x, y) => mix(0xffd070, 0xfff0b0, clamp((y - 0.86) * 5 + 0.3) * 0.7), { x: -0.55, y: 0.92, z: 0.72, ao: false, v: 0.04 });
        gl.cyl(0.14, 0.14, 0.02, 8, (_x, y) => mix(0xffc050, 0xfff0b0, clamp((y - 0.86) * 4)), { x: 0.55, y: 0.94, z: 0.72, rx: Math.PI / 2, ao: false, v: 0.04 });
    });
    g.add(glass);
    const smoke: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
        const s = bake('sp.den.smoke', (mb) => {
            mb.custom('smoke', smokeMat(), false).ico(0.1, 0, (_x, y) => mix(0xf0e8dc, 0xffffff, clamp(y * 4 + 0.5)), { j: 0.02, ao: false, v: 0.04 });
        });
        g.add(s);
        smoke.push(s);
    }
    const lampA = halo(0xffc860, 0.55), pool = halo(0xffc060, 1.1, true);
    lampA.position.set(0, 0.94, 0.9);
    pool.position.set(0, 0.03, 1.15);
    g.add(lampA, pool);
    const ph = hash(o.seed, 17) * TAU;
    let lit = 0;
    return {
        obj: g,
        apply(e) {
            lit = e.act ? 1 : 0;
        },
        update(_dt: number, t: number) {
            for (let i = 0; i < smoke.length; i++) {
                const p = (t * 0.17 + i * 0.25 + ph) % 1, s = smoke[i];
                const show = i < 2 || lit ? 1 : 0;
                const sc = (0.35 + p * 0.8) * (1 - smooth(0.78, 1, p)) * show;
                s.position.set(0.46 + p * (0.25 + env.wind * 0.55) + Math.sin(p * 6 + i) * 0.04, 2.7 + p * 0.95, -0.2 + Math.sin(p * 4 + i * 2) * 0.03);
                s.scale.setScalar(Math.max(0.001, sc));
                s.rotation.y = i + p;
            }
            const k = nightScale(1, t, 0.04, 2.4, ph, 0.1) * (lit ? 1.15 : 1);
            lampA.scale.setScalar(1 * k);
            pool.scale.setScalar(1.1 * k);
        }
    };
}
export let smokeM: THREE.MeshStandardMaterial | null = null;
export function smokeMat() {
    if (!smokeM) smokeM = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, transparent: true, opacity: 0.7, depthWrite: false, roughness: 1, emissive: 0xfff0e0, emissiveIntensity: 0.45 });
    return smokeM;
}
export function lostpack(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    const bag = new THREE.Group();
    bag.add(bake('sp.pack.bag', (mb) => {
        const b = mb.main;
        const leather = (x: number, y: number, z: number) => pickR(W, clamp(0.42 + y * 0.8 + (-x - z) * 0.3 + (hash(x * 17, y * 13 + z * 11) - 0.5) * 0.3));
        b.hull([[-0.24, 0, -0.14], [0.24, 0, -0.14], [0.24, 0, 0.14], [-0.24, 0, 0.14], [-0.19, 0.27, -0.11], [0.19, 0.27, -0.11], [0.19, 0.27, 0.11], [-0.19, 0.27, 0.11]], leather, { j: 0.012, v: 0.07 });
        b.box(0.3, 0.02, 0.17, 0x2a1d2c, { y: 0.268 });
        b.box(0.12, 0.04, 0.05, 0xfff0d2, { x: -0.06, y: 0.28, z: 0, ry: 0.5, rz: 0.1 });
        b.cyl(0.04, 0.04, 0.2, 6, 0xf5e0b8, { x: 0.04, y: 0.31, z: -0.03, rz: 1.45, rx: 0.2, j: 0.004 });
        b.ico(0.045, 0, 0xf39a3c, { x: 0.1, y: 0.31, z: 0.04, j: 0.006 });
        b.box(0.24, 0.12, 0.04, byHeight(W, 0, 0.3, 0.4, 2), { y: 0.1, z: 0.16, j: 0.006 });
        b.box(0.07, 0.3, 0.025, 0x4a2f2a, { y: 0.14, z: 0.14, ao: false });
        b.box(0.055, 0.06, 0.03, GOLD[2], { y: 0.16, z: 0.162, ao: false });
        b.hull([[-0.2, 0.26, -0.1], [0.2, 0.26, -0.1], [-0.18, 0.27, -0.14], [0.18, 0.27, -0.14], [-0.17, 0.2, -0.36], [0.17, 0.2, -0.36], [-0.15, 0.22, -0.38], [0.15, 0.22, -0.38]], (x, _y, z) => pickR(W, clamp(0.7 + (-x - z) * 0.3 + (hash(x * 9, z * 9) - 0.5) * 0.2)), { v: 0.05, j: 0.008 });
        b.torus(0.07, 0.014, 3, 6, W[1], { y: 0.3, z: 0.08, rx: 0.2, j: 0.004 });
        b.oct(0.035, RD[1], { x: 0.25, y: 0.2, z: 0.04, j: 0.004 });
        b.hull([[0, 0, 0], [0.12, -0.02, 0.03], [0.1, -0.14, 0.06], [0, -0.05, 0.02]], RD[2], { x: 0.25, y: 0.2, z: 0.04, ao: false, v: 0.04 });
        b.hull([[0, 0, 0], [0.1, 0, -0.05], [0.14, -0.08, -0.04], [0.02, -0.04, -0.01]], RD[1], { x: 0.25, y: 0.2, z: 0.04, ao: false, v: 0.04 });
    }, 2));
    bag.rotation.y = 0.5;
    bag.position.set(-0.04, 0, 0);
    g.add(bag);
    const coin = bake('sp.pack.coin', (mb) => {
        const gl = mb.glow(0xffd966, 1.5);
        gl.cyl(0.085, 0.085, 0.022, 8, (x, y) => mix(GOLD[1], GOLD[3], clamp((y - 0.01) * 20 + -x * 2)), { rx: 0.35, ao: false, v: 0.05 });
    });
    coin.position.set(0.3, 0.07, 0.3);
    g.add(coin);
    const gl1 = glints(g, 2, 0xffe680, 2.6);
    const pool = halo(0xffd060, 0.75, true);
    g.add(pool);
    const ph = hash(o.seed, 19) * TAU;
    return {
        obj: g,
        update(_dt: number, t: number) {
            const hv = bob(t, 0.025, 1.7, ph) + 0.025;
            bag.position.y = hv;
            coin.position.y = 0.07 + hv * 0.5;
            coin.rotation.y = t * 1.6;
            for (let i = 0; i < gl1.length; i++) {
                const s = gl1[i];
                const p = (t * 0.4 + i * 0.5 + ph) % 1;
                s.position.set(Math.cos(i * 2.2 + t * 0.4) * 0.22, 0.2 + p * 0.5, Math.sin(i * 2.2 + t * 0.4) * 0.18);
                s.scale.setScalar(Math.sin(p * Math.PI) * 0.9 + 0.05);
                s.rotation.y = t + i;
            }
            pool.scale.setScalar(nightScale(0.8, t, 0.12, 2.2, ph, 0.45));
        }
    };
}
export function mineladder(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    g.add(bake('sp.ladder.body', (mb) => {
        const b = mb.main;
        const wood = (x: number, y: number, z: number) => pickR(W, clamp(0.2 + y * 4 + (-x - z) * 0.2 + (hash(x * 17, y * 13 + z * 11) - 0.5) * 0.35));
        b.box(0.96, 0.15, 0.17, wood, { y: 0.075, z: 0.4, j: 0.008 });
        b.box(0.96, 0.15, 0.17, wood, { y: 0.075, z: -0.4, j: 0.008 });
        b.box(0.17, 0.15, 0.64, wood, { x: 0.4, y: 0.075, j: 0.008 });
        b.box(0.17, 0.15, 0.64, wood, { x: -0.4, y: 0.075, j: 0.008 });
        b.box(0.64, 0.02, 0.64, 0x0c0a12, { y: 0.012, ao: false, v: 0 });
        b.box(0.62, 0.1, 0.02, (_x, y) => mix(0x0c0a12, 0x35314b, clamp(y * 6)), { y: 0.07, z: -0.31, ao: false, v: 0.03 });
        for (const [x, z] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) b.oct(0.075, (xx, yy, zz) => pickR(ST, clamp(0.3 + yy * 3 + (-xx - zz) * 0.2)), { x, y: 0.05, z, sy: 0.7, ry: x * 3, j: 0.012 });
        const rail = (x: number, y: number) => pickR(W, clamp(0.12 + y * 1.1 + -x * 0.2));
        for (const s of [-1, 1]) b.rod([s * 0.14, -0, -0.07], [s * 0.14, 0.64, -0.17], 0.035, 5, rail, undefined, { j: 0.006 });
        [0.6, 0.43, 0.26, 0.09].forEach((y, k) => b.box(0.28, 0.034, 0.04, (_x, yy) => pickR(W, clamp(0.15 + yy * 1.2 + k * 0)), { y, z: -0.075 - y / 0.64 * 0.1, ao: false, v: 0.05, j: 0.004 }));
        b.box(0.09, 0.02, 0.09, STEEL, { x: 0.42, y: 0.165, z: 0.4 });
        b.box(0.09, 0.02, 0.09, STEEL, { x: 0.42, y: 0.27, z: 0.4 });
    }, 3));
    g.add(bake('sp.ladder.lamp', (mb) => {
        mb.glow(0xffd070, 1.8).box(0.07, 0.085, 0.07, (_x, y) => y > 0.21 ? 0xfff0b0 : 0xffd060, { x: 0.42, y: 0.215, z: 0.4, ao: false, v: 0.03 });
    }));
    const sp = glint(0xffe9a0, 2.6);
    g.add(sp);
    const pool = halo(0xffc060, 0.9, true);
    pool.position.set(0.3, 0.03, 0.3);
    g.add(pool);
    const ph = hash(o.seed, 23) * TAU;
    return {
        obj: g,
        update(_dt: number, t: number) {
            const k = 0.5 + 0.5 * Math.sin(t * 1.3 + ph), tw = Math.max(0, Math.sin(t * 2.4 + ph));
            sp.position.set(0.42, 0.34 + 0.04 * k, 0.4);
            sp.scale.setScalar(0.2 + tw * tw * 0.9);
            sp.rotation.y = t * 0.8;
            pool.scale.setScalar(nightScale(0.9, t, 0.06, 1.8, ph, 0.4));
        }
    };
}
export const STEEL = 0x585c7c;
