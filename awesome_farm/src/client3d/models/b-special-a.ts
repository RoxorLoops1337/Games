// Special buildings: the market stall and the fortune wheel.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { WHEEL, wheelSpans } from '../../shared/data/loot';
import { halo, nightScale } from './b-special-util';
import { RAMP } from './data';
import { bake, type BOpts, byHeight, clamp, hash, lighten, mix, type Model, TAU } from './kit';

export const W = RAMP.wood;
export const RD = RAMP.red;
export const CR = RAMP.cream;
export const ST = RAMP.stone;
export const BR = RAMP.brass;
export const ST2 = RAMP.straw;
export function market(_o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    g.add(bake('sp.market', (mb) => {
        const b = mb.main;
        const wood = byHeight(W, -0.2, 1.1, 0.5);
        for (const [x, z, h] of [[-0.93, -0.06, 1], [0.93, -0.06, 1], [-0.93, -0.46, 1.34], [0.93, -0.46, 1.34]]) b.box(0.09, h, 0.09, wood, { x, y: h / 2, z, j: 0.01 });
        b.box(1.5, 0.4, 0.38, byHeight(W, 0, 0.45, 0.6, 3), { y: 0.2, z: 0.27, j: 0.012 });
        b.box(1.62, 0.06, 0.48, byHeight(W, 0.3, 0.5, 0.3, 4), { y: 0.43, z: 0.27, j: 0.01 });
        b.box(1.52, 0.025, 0.02, W[0], { y: 0.1, z: 0.465, ao: false, v: 0.03 });
        for (let i = 0; i < 2; i++) b.box(0.75, 0.22, 0.012, i % 2 ? CR[3] : RD[1], { x: -0.375 + i * 0.75, y: 0.3, z: 0.476, v: 0.03, ao: false });
        const nS = 5, sw = 2.2 / nS, x0 = -1.1;
        const yB = 1.38, zB = -0.56, yF = 1.04, zF = -0.04, th = 0.04;
        for (let i = 0; i < nS; i++) {
            const xa = x0 + i * sw, xb = xa + sw, xm = (xa + xb) / 2, red = i % 2 === 0;
            const col = red ? byHeight(RD, 0.8, 1.3, 0.3, i) : byHeight(CR, 0.75, 1.3, 0.2, i);
            b.hull([[xa, yB, zB], [xb, yB, zB], [xa, yF, zF], [xb, yF, zF], [xa, yB - th, zB], [xb, yB - th, zB], [xa, yF - th, zF], [xb, yF - th, zF], [xm, yF - 0.19, zF + 0.04]], col, { v: 0.04, j: 0.006, ao: false });
        }
        const fruit = (x: number, z: number, r: number, ramp: readonly number[], sy = 1, ry = 0) => b.oct(r, byHeight(ramp, 0.46, 0.46 + r * 2.1, 0.4, Math.round(x * 10)), { x, y: 0.46 + r * sy * 0.9, z, sy, ry, j: r * 0.1, v: 0.06, ao: false });
        fruit(-0.62, 0.2, 0.115, RD, 0.95, 0.3);
        fruit(-0.42, 0.33, 0.105, RD, 0.95, 1.2);
        fruit(-0.24, 0.2, 0.115, RAMP.pumpkin.slice(1), 0.95, 0.7);
        b.ico(0.16, 0, byHeight(RAMP.pumpkin, 0.46, 0.76, 0.4, 3), { x: 0.1, y: 0.46 + 0.16 * 0.74, z: 0.27, sy: 0.8, ry: 0.4, j: 0.02, v: 0.06 });
        fruit(0.42, 0.22, 0.125, RAMP.leaf, 1, 0.1);
        fruit(0.62, 0.33, 0.105, [0xb8841e, 0xdcaa38, 0xf0cc58, 0xfff0a0], 1.2, 0.5);
        b.cyl(0.17, 0.14, 0.34, 5, byHeight(W, 0, 0.4, 0.6, 5), { x: 0.84, y: 0.17, z: 0.3, j: 0.012 });
        for (const [x, z, k] of [[0.8, 0.27, 0], [0.89, 0.33, 1]]) b.oct(0.08, RD[1 + k % 3], { x, y: 0.37, z, j: 0.008 });
        b.box(0.28, 0.19, 0.03, byHeight(W, 0.5, 0.8, 0.3), { x: -0.86, y: 0.7, z: 0.34, j: 0.006 });
        b.oct(0.075, (x, y) => mix(RAMP.gold[1], RAMP.gold[3], clamp((y - 0.62) * 4 + (-x - 0.86) * 0.5)), { x: -0.86, y: 0.7, z: 0.37, sz: 0.4, ao: false });
    }, 2));
    return { obj: g };
}
export const HUB_Y = 0.9;
export const WHEEL_R = 0.8;
export const LEAN = 0.87;
export function fortune(_o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    g.add(bake('sp.fortune.stand', (mb) => {
        const b = mb.main, wood = byHeight(W, 0, 1.2, 0.55, 2);
        const apex = [0, HUB_Y + 0.02, -0.16];
        for (const s of [-1, 1]) {
            b.rod(apex, [s * 0.9, 0.05, 0.3], 0.065, 4, wood, 0.08, { j: 0.01 });
            b.box(0.2, 0.1, 0.34, byHeight(W, 0, 0.2, 0.4, 4), { x: s * 0.9, y: 0.05, z: 0.3, ry: -s * 0.25, j: 0.012 });
        }
        b.rod([0, 0.04, -0.95], [0, 1.66, -0.95], 0.05, 4, wood, 0.045, { j: 0.01 });
        b.rod(apex, [0, 0.6, -0.95], 0.045, 4, wood, undefined, { j: 0.008 });
        b.rod([0, 1.62, -0.95], [0, 1.62, -0.58], 0.035, 4, wood, undefined, { j: 0.006 });
        b.oct(0.06, RAMP.gold[2], { y: 1.72, z: -0.95, ao: false });
        b.box(0.34, 0.12, 0.3, byHeight(W, 0.6, 1.2, 0.4), { y: HUB_Y + 0.06, z: -0.2, j: 0.01 });
        b.box(1.2, 0.09, 0.34, byHeight(W, 0, 0.2, 0.5, 7), { x: 0, y: 0.045, z: 0.76, j: 0.01 });
        b.cyl(0.17, 0.11, 0.13, 8, mix(W[1], 0xa8703f, 0.3), { x: 0.3, y: 0.155, z: 0.76 });
        for (let i = 0; i < 4; i++) b.oct(0.05, i % 2 ? RAMP.gold[3] : RAMP.gold[2], { x: 0.3 + Math.cos(i * 1.7) * 0.08, y: 0.235 + i % 3 * 0.015, z: 0.76 + Math.sin(i * 1.7) * 0.07, sy: 0.3, ry: i, ao: false });
        for (const s of [-1, 1]) {
            b.box(0.06, 0.62, 0.06, W[1], { x: s * 0.9, y: 0.31, z: 0.86 });
            b.box(0.13, 0.025, 0.13, 0x585c7c, { x: s * 0.9, y: 0.82, z: 0.86 });
            mb.glow(0xffd070, 1.8).box(0.1, 0.17, 0.1, (_x, y) => y > 0.72 ? 0xfff0b0 : 0xffd060, { x: s * 0.9, y: 0.71, z: 0.86, ao: false, v: 0.03 });
        }
    }, 4));
    const spinG = new THREE.Group(), tilt = new THREE.Group();
    spinG.add(bake('sp.fortune.wheel', (mb) => {
        const b = mb.main;
        b.cyl(WHEEL_R + 0.03, WHEEL_R + 0.03, 0.17, 16, (x, y, z) => mix(BR[1], BR[3], clamp(((x - y * 0) * -0.5 + 0.5) * 0.6 + (z > 0.05 ? 0.25 : 0))), { rx: Math.PI / 2, ao: false, v: 0.05 });
        b.cyl(WHEEL_R - 0.07, WHEEL_R - 0.07, 0.03, 12, 0x3a2535, { z: 0.086, rx: Math.PI / 2, ao: false, v: 0 });
        const spans = wheelSpans(), R0 = 0.12, R1 = WHEEL_R - 0.09, gap = 0.012;
        spans.forEach(([u0, u1], i) => {
            const wd = WHEEL[i];
            const a0 = u0 * TAU + gap, a1 = u1 * TAU - gap, n = Math.max(1, Math.ceil((a1 - a0) / 0.62));
            const pts = [];
            for (const z of [0.1, 0.135]) {
                pts.push([Math.sin(a0) * R0, Math.cos(a0) * R0, z], [Math.sin(a1) * R0, Math.cos(a1) * R0, z]);
                for (let k = 0; k <= n; k++) {
                    const a = a0 + (a1 - a0) * k / n;
                    pts.push([Math.sin(a) * R1, Math.cos(a) * R1, z]);
                }
            }
            const base = wd.color;
            b.hull(pts, (x, y) => lighten(base, 0.34 - Math.hypot(x, y) * 0.3), { ao: false, v: 0.045 });
        });
        for (let k = 0; k < 10; k++) {
            const a = k / 10 * TAU;
            b.tet(0.04, CR[3], { x: Math.sin(a) * (WHEEL_R - 0.015), y: Math.cos(a) * (WHEEL_R - 0.015), z: 0.1, ry: a, ao: false, v: 0.02 });
        }
        b.cyl(0.115, 0.13, 0.1, 8, mix(BR[1], BR[3], 0.5), { z: 0.15, rx: Math.PI / 2, ao: false });
        b.ico(0.07, 0, BR[3], { z: 0.2, sz: 0.7, ao: false });
    }, 6));
    tilt.add(spinG);
    tilt.add(bake('sp.fortune.pointer', (mb) => {
        const b = mb.main, y = WHEEL_R - 0.02;
        b.hull([[-0.085, y + 0.2, 0.14], [0.085, y + 0.2, 0.14], [0, y - 0.1, 0.14], [-0.085, y + 0.2, 0.2], [0.085, y + 0.2, 0.2], [0, y - 0.1, 0.2]], (_x, yy) => yy > y + 0.05 ? RD[2] : RD[1], { ao: false, v: 0.04 });
    }));
    tilt.rotation.x = -LEAN;
    const wheel = new THREE.Group();
    wheel.add(tilt);
    wheel.position.set(0, HUB_Y, 0.04);
    const lamp = halo(0xffc060, 1.4, true);
    lamp.position.set(0, 0.03, 0.75);
    g.add(wheel, lamp);
    let spin = 0, applied = 0;
    const ph = hash(_o.seed, 5) * TAU;
    return {
        obj: g,
        update(dt: number, t: number) {
            spin = Math.max(0, spin - dt * 0.9);
            spinG.rotation.z -= dt * (0.28 + spin * 5);
            lamp.scale.setScalar(nightScale(1.3, t, 0.05, 2.3, ph, 0.25));
        },
        apply() {
            if (++applied > 1) spin = 1;
        }
    };
}
