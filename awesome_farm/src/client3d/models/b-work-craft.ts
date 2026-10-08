// Workshops: workbench, anvil, kitchen, loom, alchemy table, furnace, sawmill and millstone.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { BR, halo, ic, IL, isOn, puffs, sc, setHalo, sparks, ST, taper, wc, WL } from './b-work-util';
import { RAMP } from './data';
import { bake, type BOpts, clamp, flicker, M, mix, type Model } from './kit';

export const HOT = 0xf07a22;
export const FLAME = 0xffb040;
export const CORE = 0xffe08a;
export const GLASS = M(0xffffff, { vc: true, t: 0.5, r: 0.25 });
export const DARK = 0x2c2536;
export function workbench(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.workbench', (mb) => {
        const b = mb.main, side = wc(0.5), top = wc(0.78, 0.25);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.085, 0.4, 0.085, side, { x: sx * 0.37, y: 0.2, z: sz * 0.19, j: 0.008 });
        b.box(0.72, 0.035, 0.38, wc(0.4), { y: 0.15, j: 0.006 });
        for (let i = 0; i < 3; i++) b.box(0.94, 0.095, 0.172, top, { y: 0.445, z: (i - 1) * 0.176, j: 0.01, v: 0.1 });
        b.box(0.1, 0.1, 0.13, ic(0.6), { x: 0.37, y: 0.545, z: 0.15, j: 0.006 });
        b.box(0.1, 0.075, 0.03, ic(0.9), { x: 0.37, y: 0.54, z: 0.235, j: 0.004 });
        b.rod([0.37, 0.54, 0.25], [0.37, 0.54, 0.35], 0.012, 4, IL[3]);
        b.box(0.1, 0.022, 0.022, IL[2], { x: 0.37, y: 0.54, z: 0.35 });
        b.hull([[-0.2, 0, 0.04], [-0.2, 0, -0.04], [0.22, 0, 0.012], [0.22, 0, -0.012], [-0.2, 0.014, 0.04], [-0.2, 0.014, -0.04], [0.22, 0.014, 0.012], [0.22, 0.014, -0.012]], IL[3], { x: -0.14, y: 0.492, z: 0.05, ry: 0.32, j: 0.003 });
        b.box(0.08, 0.055, 0.055, WL[1], { x: -0.37, y: 0.52, z: 0.12, ry: 0.32, j: 0.004 });
        b.rod([0.02, 0.51, -0.14], [0.26, 0.51, -0.1], 0.018, 5, WL[3]);
        b.box(0.075, 0.06, 0.055, IL[2], { x: 0, y: 0.52, z: -0.145, ry: 0.15, j: 0.004 });
        b.box(0.36, 0.035, 0.1, WL[4], { x: -0.26, y: 0.511, z: -0.16, ry: 0.08, j: 0.006 });
        b.box(0.32, 0.035, 0.1, WL[3], { x: -0.24, y: 0.545, z: -0.15, ry: -0.06, j: 0.006 });
        b.box(0.1, 0.1, 0.1, WL[2], { x: 0.3, y: 0.545, z: -0.08, ry: 0.5, j: 0.006 });
    }));
    return { obj: root };
}
export function anvil(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.anvil', (mb) => {
        const b = mb.main;
        b.cyl(0.24, 0.29, 0.27, 7, wc(0.6, 0.3), { y: 0.135, j: 0.02 });
        b.box(0.54, 0.06, 0.32, ic(0.6), { y: 0.3, j: 0.006 });
        b.hull([[-0.13, 0.33, -0.08], [0.13, 0.33, -0.08], [0.13, 0.33, 0.08], [-0.13, 0.33, 0.08], [-0.18, 0.46, -0.1], [0.18, 0.46, -0.1], [0.18, 0.46, 0.1], [-0.18, 0.46, 0.1]], ic(0.7), { j: 0.006 });
        b.hull([[0.33, 0.46, -0.125], [0.33, 0.46, 0.125], [0.33, 0.565, -0.125], [0.33, 0.565, 0.125], [-0.22, 0.46, -0.125], [-0.22, 0.46, 0.125], [-0.22, 0.565, -0.125], [-0.22, 0.565, 0.125], [-0.46, 0.53, 0]], (x, y, z) => y > 0.55 ? IL[3] : ic(0.8)(x, y, z), { j: 0.005 });
        b.box(0.07, 0.07, 0.2, IL[1], { x: 0.37, y: 0.51, z: 0, j: 0.004 });
        b.cyl(0.1, 0.085, 0.15, 6, wc(0.55), { x: 0.34, y: 0.075, z: 0.3, j: 0.006 });
        b.cyl(0.1, 0.1, 0.012, 6, 0x4ab2cf, { x: 0.34, y: 0.15, z: 0.3, ao: false, v: 0.04 });
    }));
    const hot = bake('work.anvil.bar', (mb) => {
        mb.glow(HOT, 2).box(0.3, 0.04, 0.075, (x) => mix(HOT, CORE, clamp((x + 0.15) * 2)), { j: 0.004, ao: false, v: 0.05 });
    });
    hot.position.set(0.04, 0.585, 0);
    hot.rotation.y = 0.12;
    hot.visible = false;
    root.add(hot);
    const hinge = new THREE.Group();
    hinge.position.set(0.05, 0.655, -0.3);
    hinge.add(bake('work.anvil.hammer', (mb) => {
        const b = mb.main;
        b.rod([0, 0, -0.05], [0, 0, 0.34], 0.02, 5, WL[3]);
        b.box(0.1, 0.075, 0.07, IL[2], { z: 0.34, j: 0.004 });
        b.box(0.104, 0.03, 0.074, IL[3], { y: 0.03, z: 0.34, j: 0.003 });
    }));
    hinge.rotation.x = 0.1;
    root.add(hinge);
    const sp = sparks({ x: 0.05, y: 0.6, z: 0, rise: 0.22, dx: 0, spread: 0.12, size: 0.55, period: 0.7, n: 3 });
    root.add(sp.group);
    let on = false;
    return {
        obj: root,
        apply(e) {
            on = isOn(e);
            hot.visible = on;
            if (!on) hinge.rotation.x = 0.1;
        },
        update(_dt: number, t: number) {
            if (on) {
                const k = t * 1.5 % 1;
                const lift = k < 0.7 ? Math.sin(k / 0.7 * Math.PI / 2) : Math.cos((k - 0.7) / 0.3 * Math.PI / 2);
                hinge.rotation.x = 0.06 - 0.95 * lift * lift;
                hot.scale.set(1, 0.85 + 0.15 * flicker(t, 1), 1);
            }
            sp.update(t, on);
        }
    };
}
export function kitchen(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.kitchen', (mb) => {
        const b = mb.main, br = (x: number, y: number, z: number) => mix(0xc8805a, 0xf0b090, clamp(0.4 + (-x - z) * 0.2 + (y - 0.2) * 0.4));
        b.box(0.88, 0.47, 0.68, br, { y: 0.235, z: 0.04, j: 0.012 });
        for (const y of [0.13, 0.3]) b.box(0.895, 0.022, 0.695, 0xaa6244, { y, z: 0.04, j: 0.004, v: 0.03 });
        b.box(0.76, 0.045, 0.52, ic(0.8), { y: 0.49, z: 0.07, j: 0.006 });
        b.box(0.88, 0.5, 0.1, br, { y: 0.72, z: -0.27, j: 0.01 });
        b.box(0.94, 0.05, 0.14, ic(0.8), { y: 0.985, z: -0.27, j: 0.004 });
        b.cyl(0.075, 0.09, 0.4, 6, ic(0.8), { x: 0.28, y: 1.2, z: -0.27, j: 0.005 });
        b.box(0.42, 0.26, 0.04, DARK, { y: 0.17, z: 0.395, ao: false, v: 0 });
        b.hull([[-0.21, 0.3, 0.375], [0.21, 0.3, 0.375], [-0.15, 0.36, 0.38], [0.15, 0.36, 0.38], [-0.21, 0.3, 0.415], [0.21, 0.3, 0.415], [-0.15, 0.36, 0.415], [0.15, 0.36, 0.415]], DARK, { ao: false, v: 0 });
        b.box(0.5, 0.04, 0.05, ST[3], { y: 0.04, z: 0.4, j: 0.004 });
        b.cyl(0.15, 0.13, 0.2, 6, ic(0.45), { x: -0.17, y: 0.62, z: 0.08, j: 0.006 });
        for (const s of [-1, 1]) b.box(0.05, 0.03, 0.03, IL[3], { x: -0.17 + s * 0.17, y: 0.68, z: 0.08 });
        b.rod([-0.12, 0.7, 0.13], [0.04, 0.92, 0.02], 0.014, 4, WL[3]);
        b.oct(0.09, WL[4], { x: 0.3, y: 0.55, z: 0.24, sx: 1.4, sy: 0.7, j: 0.012 });
    }));
    const lid = new THREE.Group();
    lid.position.set(-0.17, 0.725, 0.08);
    lid.add(bake('work.kitchen.lid', (mb) => {
        mb.main.cone(0.17, 0.08, 6, 0xe4e7f2, { y: 0.04, j: 0.004 });
        mb.main.oct(0.03, BR[2], { y: 0.09, j: 0.002 });
    }));
    root.add(lid);
    const fire = bake('work.kitchen.fire', (mb) => {
        mb.glow(HOT, 2).cone(0.1, 0.2, 5, HOT, { x: -0.05, y: 0.14, z: 0.395, j: 0.01, ao: false });
        mb.glow(FLAME, 2.2).cone(0.09, 0.2, 5, FLAME, { x: 0.07, y: 0.13, z: 0.4, j: 0.01, ao: false });
        mb.glow(CORE, 2.4).cone(0.05, 0.12, 4, CORE, { x: 0, y: 0.1, z: 0.41, j: 0.006, ao: false });
    });
    fire.visible = false;
    root.add(fire);
    const embers = bake('work.kitchen.embers', (mb) => {
        for (const x of [-0.08, 0.08]) mb.main.oct(0.04, 0x8a3a2a, { x, y: 0.075, z: 0.4, sy: 0.6, j: 0.01, ao: false });
    });
    root.add(embers);
    const steam = puffs({ x: -0.17, y: 0.85, z: 0.08, rise: 0.4, dx: 0.02, size: 0.85, period: 2.2, n: 3, color: 0xf2f0f6, spread: 0.03 });
    root.add(steam.group);
    const pool = halo(0xff9c38, 0.8);
    pool.position.set(0, 0.04, 0.8);
    pool.visible = false;
    root.add(pool);
    let on = false;
    return {
        obj: root,
        apply(e) {
            on = isOn(e);
            fire.visible = on;
            embers.visible = !on;
            pool.visible = on;
        },
        update(_dt: number, t: number) {
            if (on) {
                fire.scale.set(1, 0.85 + flicker(t, 2) * 0.4, 1);
                lid.position.y = 0.725 + Math.max(0, Math.sin(t * 9)) * 0.012;
                lid.rotation.z = Math.sin(t * 7) * 0.025;
                setHalo(0xff9c38, 0.03, 0.4);
            }
            steam.update(t, on);
        }
    };
}
export function loom(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.loom', (mb) => {
        const b = mb.main, wd = wc(0.65, 0.25);
        for (const s of [-1, 1]) {
            b.box(0.08, 0.9, 0.09, wd, { x: s * 0.36, y: 0.45, z: -0.02, j: 0.01 });
            b.box(0.09, 0.06, 0.5, wc(0.5), { x: s * 0.36, y: 0.03, z: 0.05, j: 0.006 });
        }
        b.box(0.84, 0.08, 0.1, wc(0.8), { y: 0.86, z: -0.02, j: 0.008 });
        b.box(0.84, 0.07, 0.1, wc(0.6), { y: 0.14, z: -0.02, j: 0.008 });
        b.box(0.62, 0.64, 0.025, RAMP.cream[2], { y: 0.5, z: -0.02, j: 0.004, v: 0.04 });
        const stripes = [RAMP.red[1], 0xf8a24a, RAMP.red[2], 0x4ab2cf];
        stripes.forEach((c, i) => b.box(0.62, 0.075, 0.035, c, { y: 0.28 + i * 0.14, z: -0.02, j: 0.003, v: 0.05 }));
        b.cyl(0.055, 0.055, 0.7, 6, RAMP.cream[2], { y: 0.2, z: 0.07, rz: Math.PI / 2, j: 0.004 });
        b.cyl(0.058, 0.058, 0.22, 6, RAMP.red[1], { x: 0.15, y: 0.2, z: 0.07, rz: Math.PI / 2, j: 0.004 });
        b.box(0.5, 0.06, 0.2, wc(0.75), { y: 0.2, z: 0.4, j: 0.006 });
        for (const s of [-1, 1]) b.box(0.06, 0.18, 0.06, wc(0.5), { x: s * 0.2, y: 0.09, z: 0.4 });
    }));
    const shuttle = bake('work.loom.shuttle', (mb) => {
        mb.main.hull([[-0.1, 0, 0], [0.1, 0, 0], [0, 0.03, 0.03], [0, 0.03, -0.03], [0, -0.03, 0.02], [0, -0.03, -0.02]], WL[4], { j: 0.003 });
        mb.main.box(0.06, 0.02, 0.02, RAMP.red[2], { z: 0.025 });
    });
    shuttle.position.set(0.2, 0.395, 0);
    root.add(shuttle);
    let on = false;
    return {
        obj: root,
        apply(e) {
            on = isOn(e);
            if (!on) {
                shuttle.position.set(0.2, 0.395, 0);
                shuttle.rotation.z = 0;
            }
        },
        update(_dt: number, t: number) {
            if (on) {
                shuttle.position.x = Math.sin(t * 2.2) * 0.26;
                shuttle.position.y = 0.355 + Math.sin(t * 0.7) * 0.12;
                shuttle.rotation.z = Math.cos(t * 2.2) * 0.1;
            }
        }
    };
}
export function alchemy(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    const FL = [[-0.26, -0.02], [0.04, 0.06], [0.3, -0.02]];
    root.add(bake('work.alchemy', (mb) => {
        const b = mb.main, g = mb.custom('glass', GLASS), wd = wc(0.75, 0.25);
        for (const sx of [-1, 1]) b.box(0.08, 0.42, 0.5, wc(0.5), { x: sx * 0.38, y: 0.21, j: 0.008 });
        b.box(0.7, 0.04, 0.4, wc(0.45), { y: 0.14, j: 0.006 });
        b.box(0.94, 0.07, 0.58, wd, { y: 0.455, j: 0.01 });
        g.ico(0.13, 0, 0xdff4f0, { x: FL[0][0], y: 0.63, z: FL[0][1], j: 0.006, ao: false });
        g.tube(0.04, 0.04, 0.18, 5, 0xe8fbff, { x: FL[0][0], y: 0.82, z: FL[0][1], ao: false });
        g.cone(0.14, 0.3, 5, 0xdff4f0, { x: FL[1][0], y: 0.64, z: FL[1][1], j: 0.006, ao: false });
        g.tube(0.036, 0.036, 0.16, 5, 0xe8fbff, { x: FL[1][0], y: 0.87, z: FL[1][1], ao: false });
        g.tube(0.065, 0.065, 0.38, 6, 0xdff4f0, { x: FL[2][0], y: 0.68, z: FL[2][1], j: 0.004, ao: false });
        b.ico(0.1, 0, 0x9a3a8a, { x: FL[0][0], y: 0.62, z: FL[0][1], j: 0.004 });
        b.cone(0.115, 0.18, 5, 0x2a7aa8, { x: FL[1][0], y: 0.58, z: FL[1][1], j: 0.004 });
        b.cone(0.055, 0.24, 5, 0x6a52a6, { x: FL[2][0], y: 0.61, z: FL[2][1], j: 0.004 });
        b.cyl(0.07, 0.05, 0.06, 6, ST[2], { x: -0.02, y: 0.525, z: -0.18, j: 0.008 });
    }));
    const on = bake('work.alchemy.glow', (mb) => {
        mb.glow(0xf79fc6, 1.9).ico(0.108, 0, (_x, y) => mix(0xd05aa8, 0xffc4e0, clamp((y - 0.5) * 3)), { x: FL[0][0], y: 0.625, z: FL[0][1], j: 0.004, ao: false });
        mb.glow(0x74cce0, 1.9).cone(0.122, 0.19, 5, (_x, y) => mix(0x2a7aa8, 0xa8e8f0, clamp((y - 0.5) * 3)), { x: FL[1][0], y: 0.585, z: FL[1][1], j: 0.004, ao: false });
        mb.glow(0xc4a4f0, 1.9).cone(0.06, 0.25, 5, (_x, y) => mix(0x6a52a6, 0xe8dcff, clamp((y - 0.5) * 3)), { x: FL[2][0], y: 0.615, z: FL[2][1], j: 0.004, ao: false });
    });
    on.visible = false;
    root.add(on);
    const cols = [0xf79fc6, 0x74cce0, 0xc4a4f0];
    const bubbles = FL.map(([x, z], i) => {
        const s = sparks({ x, y: 0.68, z, rise: 0.28, dx: 0, spread: 0.03, size: 0.35, period: 1.3, n: 2, color: cols[i], glow: 2, phase: i * 0.3 });
        root.add(s.group);
        return s;
    });
    const sig = sparks({ x: 0, y: 1.05, z: 0, rise: 0.3, dx: 0, spread: 0.2, size: 0.4, period: 1.8, n: 3, color: 0xe8dcff, glow: 2.2 });
    root.add(sig.group);
    let isOnNow = false;
    return {
        obj: root,
        apply(e) {
            isOnNow = isOn(e);
            on.visible = isOnNow;
        },
        update(_dt: number, t: number) {
            if (isOnNow) on.scale.set(1, 0.9 + 0.1 * flicker(t, 3), 1);
            for (const s of bubbles) s.update(t, isOnNow);
            sig.update(t, isOnNow);
        }
    };
}
export function furnace(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.furnace', (mb) => {
        const b = mb.main, st = sc(0.5, 0.35);
        b.box(0.96, 0.05, 0.88, sc(0.2, 0.2), { y: 0.025, j: 0.01 });
        taper(b, 0.44, 0.4, 0.42, 0.37, 0.04, 0.64, st, { j: 0.012 }, 0, 0, 0, -0.01);
        for (const y of [0.16, 0.42]) b.box(0.86, 0.022, 0.03, sc(0.8, 0.1), { y, z: 0.405 - y / 0.62 * 0.04 + 0.012, rx: 0.07, j: 0.004, v: 0.03 });
        b.box(0.88, 0.07, 0.8, sc(0.82, 0.2), { y: 0.67, z: -0.01, j: 0.008 });
        b.box(0.28, 0.04, 0.2, 0x35305c, { x: -0.2, y: 0.72, z: 0.1, j: 0.004, v: 0.04 });
        taper(b, 0.15, 0.15, 0.1, 0.1, 0.7, 1.2, st, { j: 0.01 }, 0.22, -0.17);
        b.box(0.3, 0.06, 0.3, sc(0.9, 0.1), { x: 0.22, y: 1.23, z: -0.17, j: 0.005 });
        b.box(0.17, 0.012, 0.17, DARK, { x: 0.22, y: 1.262, z: -0.17, ao: false, v: 0 });
        b.hull([[-0.2, 0.05, 0.3], [0.2, 0.05, 0.3], [-0.2, 0.29, 0.3], [0.2, 0.29, 0.3], [-0.2, 0.05, 0.405], [0.2, 0.05, 0.405], [-0.2, 0.29, 0.405], [0.2, 0.29, 0.405], [-0.12, 0.38, 0.405], [0.12, 0.38, 0.405], [-0.12, 0.38, 0.3], [0.12, 0.38, 0.3]], DARK, { ao: false, v: 0 });
        for (const s of [-1, 1]) b.box(0.07, 0.36, 0.06, sc(0.95, 0.1), { x: s * 0.235, y: 0.23, z: 0.385, j: 0.004 });
        b.box(0.6, 0.07, 0.06, sc(0.95, 0.1), { y: 0.42, z: 0.375, j: 0.004 });
        b.box(0.54, 0.04, 0.1, sc(0.7, 0.1), { y: 0.05, z: 0.435, j: 0.004 });
    }));
    const embersOff = bake('work.furnace.cold', (mb) => {
        for (const [x, z] of [[-0.06, 0.41], [0.1, 0.405]]) mb.main.oct(0.045, 0x8a3a2a, { x, y: 0.1, z, sy: 0.6, j: 0.01, ao: false });
    });
    root.add(embersOff);
    const fire = new THREE.Group();
    fire.add(bake('work.furnace.fire', (mb) => {
        mb.glow(HOT, 2).cone(0.13, 0.3, 5, HOT, { x: -0.07, y: 0.22, z: 0.415, j: 0.015, ao: false, v: 0.05 });
        mb.glow(HOT, 2).cone(0.1, 0.24, 5, HOT, { x: 0.1, y: 0.19, z: 0.425, j: 0.015, ao: false, v: 0.05 });
        mb.glow(FLAME, 2.2).cone(0.09, 0.26, 5, FLAME, { x: 0, y: 0.22, z: 0.435, j: 0.012, ao: false, v: 0.05 });
        mb.glow(CORE, 2.4).cone(0.045, 0.16, 4, CORE, { x: -0.01, y: 0.17, z: 0.45, j: 0.008, ao: false, v: 0.04 });
        for (const [x, z] of [[-0.1, 0.415], [0.02, 0.425], [0.13, 0.415]]) mb.glow(0xf08a2a, 1.8).oct(0.05, 0xf08a2a, { x, y: 0.1, z, sy: 0.6, j: 0.01, ao: false });
    }));
    fire.visible = false;
    root.add(fire);
    const smoke = puffs({ x: 0.22, y: 1.34, z: -0.17, rise: 0.7, dx: 0.14, dz: -0.04, size: 1.05, period: 3, n: 4, color: 0xdcd8e4 });
    root.add(smoke.group);
    const pool = halo(0xffa43c, 0.9);
    pool.position.set(0, 0.04, 0.85);
    pool.visible = false;
    root.add(pool);
    let on = false;
    return {
        obj: root,
        apply(e) {
            on = isOn(e);
            fire.visible = on;
            embersOff.visible = !on;
            pool.visible = on;
        },
        update(_dt: number, t: number) {
            if (on) {
                const f = flicker(t, 0.5), g = flicker(t, 1.7);
                fire.scale.set(1, 0.82 + f * 0.45, 1);
                fire.rotation.z = (g - 0.5) * 0.05;
                setHalo(0xffa43c, 0.03, 0.45);
            }
            smoke.update(t, on);
        }
    };
}
export function sawmill(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.sawmill', (mb) => {
        const b = mb.main, top = wc(0.8, 0.28);
        for (const sx of [-0.86, 0.86]) for (const sz of [-1, 1]) b.box(0.1, 0.42, 0.1, wc(0.5), { x: sx, y: 0.21, z: sz * 0.3, j: 0.01 });
        b.box(1.72, 0.06, 0.07, wc(0.4), { y: 0.14, z: 0.3, j: 0.006 });
        for (let i = 0; i < 3; i++) b.box(1.94, 0.1, 0.22, top, { y: 0.47, z: (i - 1) * 0.225, j: 0.012, v: 0.1 });
        b.cyl(0.19, 0.19, 0.5, 8, (x, y, z) => z > 0.2 ? 0xe8bc84 : wc(0.5, 0.3)(x, y, z), { x: 0.5, y: 0.7, z: 0, rx: Math.PI / 2, j: 0.01 });
        for (let i = 0; i < 3; i++) b.box(0.52, 0.045, 0.2, wc(0.85 - i * 0.1), { x: 0.52, y: 0.545 + i * 0.047, z: -0.3, ry: i * 0.05 - 0.05, j: 0.008 });
    }));
    const sawTilt = new THREE.Group();
    sawTilt.position.set(-0.45, 0.66, 0);
    sawTilt.rotation.x = -0.95;
    root.add(sawTilt);
    const saw = new THREE.Group();
    sawTilt.add(saw);
    saw.add(bake('work.sawmill.blade', (mb) => {
        const m = mb.main;
        m.cyl(0.3, 0.3, 0.035, 8, IL[3], { rx: Math.PI / 2, j: 0.004 });
        m.box(0.5, 0.5, 0.032, 0xdde1f0, { j: 0.004 });
        m.box(0.5, 0.5, 0.034, IL[3], { rz: Math.PI / 4, j: 0.004 });
        m.cyl(0.075, 0.075, 0.1, 6, 0xf8a24a, { rx: Math.PI / 2 });
    }));
    const frame = bake('work.sawmill.frame', (mb) => {
        for (const sz of [-1, 1]) mb.main.box(0.07, 0.5, 0.07, wc(0.6), { x: -0.45, y: 0.72, z: sz * 0.3, j: 0.006 });
    });
    root.add(frame);
    const dust = puffs({ x: -0.45, y: 0.55, z: 0.08, rise: 0.22, dx: 0.12, dz: 0.1, size: 0.45, period: 0.9, n: 3, color: 0xf0d9a0, spread: 0.05 });
    root.add(dust.group);
    let on = false;
    return {
        obj: root,
        apply(e) {
            on = isOn(e);
        },
        update(dt: number, t: number) {
            if (on) saw.rotation.z -= dt * 5.5;
            dust.update(t, on);
        }
    };
}
export function millstone(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.millstone', (mb) => {
        const b = mb.main;
        b.cyl(0.42, 0.45, 0.16, 8, wc(0.7, 0.3), { y: 0.08, j: 0.012 });
        b.cyl(0.4, 0.4, 0.1, 9, sc(0.7), { y: 0.21, j: 0.01 });
        for (const s of [-1, 1]) b.box(0.06, 0.74, 0.06, wc(0.55), { x: s * 0.33, y: 0.37, z: -0.3, j: 0.006 });
        b.box(0.76, 0.06, 0.06, wc(0.75), { y: 0.76, z: -0.3, j: 0.006 });
        b.hull([[-0.2, 0.95, -0.2], [0.2, 0.95, -0.2], [0.2, 0.95, 0.04], [-0.2, 0.95, 0.04], [-0.05, 0.56, -0.1], [0.05, 0.56, -0.1], [0.05, 0.56, -0.02], [-0.05, 0.56, -0.02]], wc(0.85, 0.2), { j: 0.008 });
        b.box(0.42, 0.04, 0.04, WL[2], { y: 0.74, z: -0.1, j: 0.004 });
        b.ico(0.12, 0, RAMP.cream[2], { x: 0.3, y: 0.12, z: 0.36, sy: 1.1, j: 0.02 });
    }));
    const runner = new THREE.Group();
    runner.position.y = 0.27;
    runner.add(bake('work.millstone.runner', (mb) => {
        const b = mb.main;
        b.cyl(0.38, 0.4, 0.12, 9, sc(0.95, 0.25), { y: 0.06, j: 0.01 });
        for (let i = 0; i < 2; i++) b.box(0.3, 0.012, 0.035, SL1, { x: Math.cos(i * 3.1 + 0.5) * 0.2, y: 0.123, z: Math.sin(i * 3.1 + 0.5) * 0.2, ry: -(i * 3.1 + 0.5), ao: false, v: 0.02 });
        b.box(0.5, 0.045, 0.05, WL[3], { y: 0.16, j: 0.004 });
        b.box(0.05, 0.12, 0.05, WL[2], { x: 0.25, y: 0.2, j: 0.004 });
    }));
    root.add(runner);
    const flour = puffs({ x: 0.28, y: 0.34, z: 0.1, rise: 0.22, dx: 0.1, dz: 0.12, size: 0.55, period: 1.4, n: 3, color: 0xfffaf0 });
    root.add(flour.group);
    let on = false;
    return {
        obj: root,
        apply(e) {
            on = isOn(e);
        },
        update(dt: number, t: number) {
            if (on) runner.rotation.y -= dt * 1.5;
            flour.update(t, on);
        }
    };
}
export const SL1 = 0x7a7f9e;
export const CRAFT = { workbench, anvil, kitchen, loom, alchemy, furnace, sawmill, millstone };
