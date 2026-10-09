// Special buildings: the Golden Windmill and the mine shaft.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { bake, type BOpts, byHeight, clamp, Col, env, hash, mix, type Model, seedRand, TAU } from './kit';
import { bob, flag, glints, halo, nightScale, ownGlow } from './b-special-util';
import { RAMP } from './data';

export const W = RAMP.wood;
export const ST = RAMP.stone;
export const CR = RAMP.cream;
export const RD = RAMP.red;
export const GOLD = RAMP.gold;
export const BR = RAMP.brass;
export const STEEL = RAMP.steel;
export const pickR = (R: readonly number[], t: number): number => R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1))))];
export const A8 = Math.PI / 8;
export const PLASTER = [0xd9c3a0, 0xecdcb8, 0xf8ecd0, 0xfff7e3];
export const TOWER_Y0 = 0.3;
export const TOWER_H = 2.3;
export const R_BASE = 0.8;
export const R_TOP = 0.46;
export const HUB_Y = 2.88;
export const HUB_Z = 0.86;
export const rTower = (y: number) => R_BASE + (R_TOP - R_BASE) * clamp((y - TOWER_Y0) / TOWER_H);
export const arch = (w: number, h: number, seg = 5) => {
    const r = w / 2, pts = [[-r, 0], [-r, h - r]];
    for (let k = 1; k < seg; k++) {
        const a = Math.PI - k / seg * Math.PI;
        pts.push([Math.cos(a) * r, h - r + Math.sin(a) * r]);
    }
    pts.push([r, h - r], [r, 0]);
    return pts;
};
export function mill(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    g.add(bake('sp.mill.tower', (mb) => {
        const b = mb.main;
        const stone = (x: number, y: number, z: number) => pickR(ST, clamp(0.45 + (-x - z) * 0.2 + (hash(x * 19, y * 9 + z * 23) - 0.5) * 0.4));
        const plaster = (x: number, y: number, z: number) => mix(pickR(PLASTER, clamp(0.6 + (y - TOWER_Y0) * 0.08 + (-x - z) * 0.32 + (hash(x * 11, y * 4 + z * 13) - 0.5) * 0.14)), 0xffd890, 0.22);
        b.cyl(0.9, 0.97, TOWER_Y0, 8, stone, { y: TOWER_Y0 / 2, ry: A8, j: 0.02, v: 0.08 });
        mb.glow(0xffd890, 0.2).cyl(R_TOP, R_BASE, TOWER_H, 8, plaster, { y: TOWER_Y0 + TOWER_H / 2, ry: A8, j: 0.01, v: 0.04 });
        const band = (y: number, h = 0.085, grow = 0.035) => b.tube(rTower(y + h) + grow, rTower(y) + grow, h, 8, (x, yy, z) => mix(GOLD[1], GOLD[3], clamp(0.35 + (-x - z) * 0.4 + (hash(x * 7, z * 7) - 0.5) * 0.2)) + 0 * yy, { y: y + h / 2, ry: A8, ao: false, v: 0.05 });
        band(TOWER_Y0 + 0.02);
        band(1.2);
        band(TOWER_Y0 + TOWER_H - 0.12);
        const door = arch(0.4, 0.66, 5);
        const zf = rTower(0.6) * Math.cos(A8) - 0.02;
        b.hull([...door.map(([x, y]) => [x * 1.2, y * 1.06 + TOWER_Y0, zf - 0.05]), ...door.map(([x, y]) => [x * 1.2, y * 1.06 + TOWER_Y0, zf + 0.04])], (_x, y) => mix(GOLD[1], GOLD[2], clamp((y - 0.3) * 1.2)), { ao: false, v: 0.04 });
        b.hull([...door.map(([x, y]) => [x, y + TOWER_Y0, zf - 0.05]), ...door.map(([x, y]) => [x, y + TOWER_Y0, zf + 0.06])], (x, y) => pickR(W, clamp(0.55 + y * 0.2 + Math.round(x * 12) % 2 * 0.12)), { ao: false, v: 0.04 });
        b.box(0.02, 0.58, 0.015, W[1], { y: TOWER_Y0 + 0.33, z: zf + 0.065, ao: false, v: 0 });
        b.oct(0.038, GOLD[2], { x: 0.12, y: TOWER_Y0 + 0.34, z: zf + 0.08, ao: false });
        b.box(0.62, 0.07, 0.24, stone, { y: 0.035, z: zf + 0.2, j: 0.01 });
        for (const [y, r] of [[1.5, 0.13], [2, 0.085]]) {
            const z = rTower(y) * Math.cos(A8);
            b.cyl(r + 0.045, r + 0.045, 0.04, 6, (x, yy, zz) => mix(GOLD[1], GOLD[3], clamp(0.4 + (-x - zz + yy) * 0.2)), { y, z: z - 0.005, rx: Math.PI / 2, ao: false, v: 0.05 });
        }
        const cy = TOWER_Y0 + TOWER_H;
        b.cone(0.66, 0.8, 8, (x, y, z) => pickR(RD, clamp(0.35 + (y - cy) * 0.3 + (-x - z) * 0.4 + (hash(x * 13, y * 5 + z * 9) - 0.5) * 0.25)), { y: cy + 0.4, ry: A8, j: 0.01, v: 0.05 });
        b.tube(0.71, 0.69, 0.08, 8, (x, yy, z) => mix(GOLD[1], GOLD[3], clamp(0.4 + (-x - z) * 0.4)) + 0 * yy, { y: cy + 0.02, ry: A8, ao: false, v: 0.05 });
        b.rod([0, cy + 0.7, 0], [0, cy + 1.3, 0], 0.025, 5, (_x, y) => mix(GOLD[1], GOLD[3], clamp((y - cy) * 0.5)), undefined, { ao: false });
        b.oct(0.05, GOLD[3], { y: cy + 0.78, ao: false });
        b.rod([0, HUB_Y, 0.2], [0, HUB_Y, HUB_Z], 0.065, 5, byHeight(W, 2.3, 2.7, 0.3), undefined, { j: 0.006 });
    }, 6));
    const blades = new THREE.Group();
    blades.add(bake('sp.mill.sails', (mb) => {
        const b = mb.main, cloth = mb.glow(0xffe0a0, 0.34);
        const arm = (k: number) => {
            const rz = k * Math.PI / 2;
            const rot = (px: number, py: number, pz: number) => [px * Math.cos(rz) - py * Math.sin(rz), px * Math.sin(rz) + py * Math.cos(rz), pz];
            const quad = (x0: number, x1: number, y0: number, y1: number, c: Col, bb = b) => bb.hull([rot(x0, y0, -0.01), rot(x1, y0, -0.01), rot(x0, y1, -0.01), rot(x1, y1, -0.01), rot(x0, y0, 0.012), rot(x1, y0, 0.012), rot(x0, y1, 0.012), rot(x1, y1, 0.012)], c, { ao: false, v: 0.04 });
            b.rod(rot(0, 0.1, 0), rot(0, 1.15, 0), 0.032, 4, W[2], undefined, { j: 0.004 });
            quad(0.03, 0.27, 0.28, 0.68, (x: number, y: number, z: number) => mix(0xffe8b0, 0xfffaf0, clamp(0.5 + (-x - z) * 0.3 + (hash(x * 9, y * 9) - 0.5) * 0.3)), cloth);
            quad(0.03, 0.27, 0.7, 1.12, (x: number, y: number, z: number) => mix(0xffd870, 0xfff3b8, clamp(0.5 + (-x - z) * 0.3 + (hash(x * 9, y * 9) - 0.5) * 0.3)), cloth);
            quad(0.27, 0.3, 0.28, 1.12, () => GOLD[2]);
        };
        for (let k = 0; k < 4; k++) arm(k);
        b.oct(0.16, (x, y, z) => mix(GOLD[1], GOLD[3], clamp(0.5 + (-x + y - z * 0.2) * 0.8)), { z: 0, sz: 0.8, ao: false, v: 0.06, j: 0.008 });
        b.cone(0.07, 0.18, 6, GOLD[2], { z: 0.14, rx: Math.PI / 2, ao: false });
    }));
    blades.add(bake('sp.mill.sails.glow', (mb) => {
        mb.glow(0xffd966, 1.4).oct(0.05, 0xfff3b0, { z: 0.2, ao: false, v: 0.03 });
    }));
    blades.position.set(0, HUB_Y, HUB_Z);
    g.add(blades);
    g.add(bake('sp.mill.glass', (mb) => {
        const gl = mb.glow(0xffc860, 1.4);
        for (const [y, r] of [[1.5, 0.13], [2, 0.085]]) {
            const z = rTower(y) * Math.cos(A8);
            gl.cyl(r, r, 0.03, 6, (_x, yy) => mix(0xffc050, 0xfff0b0, clamp((yy - y + 0.1) * 4)), { y, z: z + 0.012, rx: Math.PI / 2, ao: false, v: 0.04 });
        }
    }));
    const fl = flag('mill', 0xe85d62, 0xffd966, 0.62, 0.34, 3, 0.18, 0.5);
    fl.root.position.set(0, TOWER_Y0 + TOWER_H + 1.12, 0);
    g.add(fl.root);
    const star = new THREE.Group();
    const starMesh = bake('sp.mill.star', (mb) => {
        const gl = mb.glow(0xffc840, 1.8);
        for (let k = 0; k < 5; k++) {
            const a = k / 5 * TAU;
            gl.oct(0.05, (x, y) => mix(0xffc030, 0xfff0a0, clamp((Math.hypot(x, y) - 0.02) * 6)), { x: Math.sin(a) * 0.06, y: Math.cos(a) * 0.06, sy: 2.4, sx: 1, sz: 0.6, rz: -a, ao: false, v: 0.06 });
        }
        gl.oct(0.05, 0xfff0a0, { sz: 0.7, ao: false });
    });
    star.add(starMesh);
    star.position.set(0, TOWER_Y0 + TOWER_H + 1.45, 0);
    star.rotation.x = -0.87;
    const starG = new THREE.Group();
    starG.add(star);
    g.add(starG);
    const own = ownGlow(starG);
    const sparkle = glints(g, 2, 0xffe680, 2.6);
    const lampA = halo(0xffc860, 0.55), lampB = halo(0xffe08a, 0.9);
    {
        const z = rTower(1.5) * Math.cos(A8) + 0.05;
        lampA.position.set(0, 1.5, z);
        lampB.position.set(0, TOWER_Y0 + TOWER_H + 1.45, 0.05);
    }
    g.add(lampA, lampB);
    const ph = hash(o.seed, 29) * TAU;
    let ang = 0;
    return {
        obj: g,
        update(dt: number, t: number) {
            ang -= dt * (0.4 + env.wind * 2.4);
            blades.rotation.z = ang;
            fl.wave(t);
            starG.position.y = bob(t, 0.03, 1.5, ph);
            star.rotation.z = Math.sin(t * 0.8 + ph) * 0.25;
            own.set(0.85 + 0.3 * Math.sin(t * 2.2 + ph));
            for (let i = 0; i < sparkle.length; i++) {
                const s = sparkle[i];
                const k = Math.max(0, Math.sin(t * 2.1 + i * 2.4 + ph)), a = i * 3.1 + t * 0.4;
                s.position.set(Math.cos(a) * 0.2, TOWER_Y0 + TOWER_H + 1.45 + Math.sin(a * 1.3) * 0.12, 0.1 + Math.sin(a) * 0.12);
                s.scale.setScalar(0.1 + k * k * 1);
                s.rotation.y = t + i;
            }
            lampA.scale.setScalar(nightScale(0.55, t, 0.04, 2.4, ph, 0.3));
            lampB.scale.setScalar(nightScale(0.9, t, 0.1, 2, ph, 0.4));
        },
        dispose() {
            own.dispose();
        }
    };
}
export function mineshaft(o: BOpts): Model<BuildE> {
    const g = new THREE.Group();
    const r = seedRand(o.seed * 3 + 7);
    const yD = 0.12;
    g.add(bake('sp.shaft.body', (mb) => {
        const b = mb.main;
        const wood = (x: number, y: number, z: number) => pickR(W, clamp(0.4 + y * 0.18 + (-x - z) * 0.14 + (hash(x * 13, y * 9 + z * 11) - 0.5) * 0.4));
        const stone = (x: number, y: number, z: number) => pickR(ST, clamp(0.4 + y * 0.5 + (-x - z) * 0.2 + (hash(x * 23, y * 9 + z * 17) - 0.5) * 0.45));
        for (let i = 0; i < 3; i++) b.box(1.94, yD, 0.64, byHeight(W, 0, 0.14, 0.55, i), { y: yD / 2, z: -0.65 + i * 0.65, j: 0.012, v: 0.07 });
        b.lathe([[0.64, yD - 0.02], [0.64, yD + 0.2], [0.44, yD + 0.2], [0.44, yD + 0.02]], 10, (x, y, z) => {
            const rr = Math.hypot(x, z - 0);
            if (rr < 0.5 && y < yD + 0.19) return mix(0x1c1826, 0x514c63, clamp((y - yD) / 0.18));
            return pickR(ST, clamp(0.38 + (y - yD) * 1.2 + (-x - z) * 0.3 + (hash(Math.round(x * 6), Math.round(z * 6)) - 0.5) * 0.5));
        }, { j: 0.015, v: 0.07 });
        b.cyl(0.45, 0.45, 0.02, 8, 0x15101e, { y: yD + 0.012, ao: false, v: 0 });
        for (const s of [-1, 1]) {
            b.rod([s * 0.84, yD, 0.5], [s * 0.46, 1.78, 0], 0.065, 4, wood, 0.055, { j: 0.008 });
            b.rod([s * 0.84, yD, -0.5], [s * 0.46, 1.78, 0], 0.065, 4, wood, 0.055, { j: 0.008 });
            b.box(0.26, 0.12, 0.34, stone, { x: s * 0.86, y: yD + 0.06, z: 0.5, j: 0.012 });
            b.rod([s * 0.7, 0.55, 0.33], [s * 0.62, 0.55, -0.33], 0.035, 4, W[1]);
        }
        b.box(1.2, 0.13, 0.14, byHeight(W, 1.6, 1.95, 0.4, 3), { y: 1.82, j: 0.01 });
        b.box(0.1, 0.5, 0.1, wood, { x: -0.52, y: 1.52, z: 0 });
        b.box(0.1, 0.5, 0.1, wood, { x: 0.52, y: 1.52, z: 0 });
        b.rod([-0.52, 1.5, 0], [-0.2, 1.8, 0], 0.03, 4, W[1]);
        b.rod([0.52, 1.5, 0], [0.2, 1.8, 0], 0.03, 4, W[1]);
        b.box(0.04, 0.2, 0.04, STEEL[2], { y: 1.68, z: 0 });
        b.cyl(0.17, 0.17, 0.07, 6, (x, y, z) => mix(BR[1], BR[3], clamp(0.3 + (-x + (y - 1.55)) * 0.8 + (z > 0.02 ? 0.2 : 0))), { y: 1.54, z: 0, rx: Math.PI / 2, ao: false, v: 0.05 });
        b.cyl(0.1, 0.1, 0.62, 6, byHeight(W, 0.8, 1.2, 0.4, 2), { x: 0.66, y: 0.98, z: 0, rx: Math.PI / 2, j: 0.006 });
        b.rod([0.66, 0.98, 0.34], [0.66, 0.78, 0.46], 0.025, 4, STEEL[2]);
        b.rod([0.66, 1.08, 0], [0.16, 1.7, 0], 0.012, 3, 0xdcb870, undefined, { ao: false });
        for (const s of [-1, 1]) b.rod([s * 0.1 - 0.28, yD + 0.34, 0.5], [s * 0.1 - 0.28, yD - 0, 0.2], 0.03, 4, byHeight(W, 0.1, 0.5, 0.3), undefined, { j: 0.004 });
        [0.28, 0.14].forEach((k, i) => b.box(0.2, 0.025, 0.03, W[2 + i % 2], { x: -0.28, y: yD + k, z: 0.2 + k / 0.34 * 0.3 - 0.05 * 0, ao: false }));
        b.box(0.5, 0.05, 0.12, wood, { x: 0.5, y: yD + 0.025, z: 0.84, ry: 0.15 });
        b.box(0.5, 0.05, 0.12, wood, { x: 0.52, y: yD + 0.075, z: 0.86, ry: -0.1 });
        for (const [x, z, s, c] of [[0.88, 0.78, 0.06, 0xd08a60], [-0.86, 0.84, 0.07, 0x9a90b0], [-0.7, 0.9, 0.05, 0x3a3647]]) b.oct(s, c, { x, y: yD + s * 0.5, z, sy: 0.75, ry: x * 3, j: 0.012 });
        b.rod([0.86, yD, -0.2], [0.78, yD + 0.78, -0.62], 0.022, 4, W[3]);
        b.hull([[0.7, yD + 0.76, -0.62], [0.9, yD + 0.8, -0.62], [0.8, yD + 0.82, -0.58], [0.8, yD + 0.74, -0.66], [0.62, yD + 0.7, -0.62], [0.98, yD + 0.7, -0.62]], (_x, y) => mix(STEEL[2], STEEL[3], clamp((y - yD - 0.7) * 6)), { ao: false, v: 0.04 });
        void r;
    }, 4));
    const buck = new THREE.Group();
    buck.add(bake('sp.shaft.bucket', (mb) => {
        const b = mb.main;
        b.rod([0, 0, 0], [0, -0.7, 0], 0.012, 3, 0xdcb870, undefined, { ao: false });
        b.cyl(0.1, 0.075, 0.15, 7, (x, y) => pickR(W, clamp(0.45 + (y + 0.76) * 3 + -x * 0.6)), { y: -0.78, j: 0.005 });
    }));
    buck.position.set(-0.17, 1.54, 0);
    g.add(buck);
    const lamp = new THREE.Group();
    lamp.add(bake('sp.shaft.lamp', (mb) => {
        const b = mb.main;
        b.rod([0, 0, 0], [0, -0.1, 0], 0.01, 3, STEEL[2]);
        b.box(0.12, 0.025, 0.12, STEEL[2], { y: -0.115 });
        b.box(0.12, 0.025, 0.12, STEEL[2], { y: -0.26 });
        mb.glow(0xffd070, 1.8).box(0.085, 0.13, 0.085, (_x, y) => y > -0.17 ? 0xfff0b0 : 0xffd060, { y: -0.19, ao: false, v: 0.03 });
    }));
    lamp.position.set(-0.82, 0.98, 0.58);
    g.add(lamp);
    g.add(bake('sp.shaft.arm', (mb) => {
        mb.main.rod([-0.74, 0.88, 0.5], [-0.82, 1, 0.58], 0.025, 4, W[1]);
        mb.main.rod([-0.62, 1.2, 0.3], [-0.82, 1, 0.58], 0.018, 3, W[1]);
    }));
    const pole = bake('sp.shaft.pole', (mb) => {
        mb.main.rod([0, 1.88, 0], [0, 2.35, 0], 0.02, 3, W[3]);
        mb.main.oct(0.04, GOLD[2], { y: 2.37, ao: false });
    });
    g.add(pole);
    const fl = flag('shaft', 0xe85d62, 0xf59a96, 0.42, 0.24, 3, 0.2, 0.45);
    fl.root.position.set(0, 2.22, 0);
    g.add(fl.root);
    const glow2 = halo(0x241a50, 0.42, true), lampP = halo(0xffc060, 1.1, true);
    glow2.position.set(0, yD + 0.05, 0);
    lampP.position.set(-0.82, 0.14, 0.7);
    g.add(glow2, lampP);
    const ph = hash(o.seed, 31) * TAU;
    return {
        obj: g,
        update(_dt: number, t: number) {
            buck.rotation.z = Math.sin(t * 1.1 + ph) * 0.05;
            buck.rotation.x = Math.sin(t * 0.8 + ph * 2) * 0.03;
            lamp.rotation.z = Math.sin(t * 1.4 + ph) * 0.05 + env.wind * 0.02;
            fl.wave(t);
            const k = 0.5 + 0.5 * Math.sin(t * 1.5 + ph);
            glow2.scale.setScalar(0.6 * (0.9 + 0.2 * k + 0.5 * env.night));
            lampP.scale.setScalar(nightScale(1.1, t, 0.05, 3.1, ph, 0.3));
        }
    };
}
