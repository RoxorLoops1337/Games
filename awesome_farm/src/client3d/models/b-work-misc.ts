// Storage and light: chests, campfire, lantern and lamp post.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { bake, Bld, type BOpts, clamp, type Col, env, flicker, mix, type Model, Pt, TAU } from './kit';
import { BR, halo, ic, IR, sc, setHalo, sparks, wc } from './b-work-util';

export const steelCol = (k: number) => (x: number, y: number, z: number) => mix(0x56526a, 0xc4c9dc, clamp(k + (-x - z) * 0.12 + (y - 0.3) * 0.2));
/** A chest: size, lid height, body / lid / strap colours, and an optional lock and rivets. */
export interface ChestLook { w: number; d: number; h: number; lid: number; body: Col; lidCol: Col; strap: Col; lock?: number; rivets?: number }
export function chestShape(b: Bld, o: ChestLook) {
    const { w, d, h, lid, body, lidCol, strap } = o, hw = w / 2, hd = d / 2, ins = 0.05;
    b.box(w, h, d, body, { y: h / 2, j: 0.01 });
    b.hull([
        [-hw - 0.005, h, -hd - 0.005],
        [hw + 0.005, h, -hd - 0.005],
        [hw + 0.005, h, hd + 0.005],
        [-hw - 0.005, h, hd + 0.005],
        [-hw + ins, h + lid, -hd * 0.55],
        [hw - ins, h + lid, -hd * 0.55],
        [hw - ins, h + lid, hd * 0.55],
        [-hw + ins, h + lid, hd * 0.55]
    ], lidCol, { j: 0.008 });
    for (const sx of [-1, 1]) {
        const x = sx * w * 0.28, sw = 0.035;
        b.box(sw * 2, h + 0.005, d + 0.025, strap, { x, y: h / 2, j: 0.003, v: 0.04 });
        b.hull([
            [x - sw, h, -hd - 0.012],
            [x + sw, h, -hd - 0.012],
            [x + sw, h, hd + 0.012],
            [x - sw, h, hd + 0.012],
            [x - sw, h + lid + 0.012, -hd * 0.55],
            [x + sw, h + lid + 0.012, -hd * 0.55],
            [x + sw, h + lid + 0.012, hd * 0.55],
            [x - sw, h + lid + 0.012, hd * 0.55]
        ], strap, { j: 0.003, v: 0.04 });
    }
    b.box(0.13, 0.12, 0.04, o.lock ?? 0, { y: h + 0.005, z: hd + 0.02, j: 0.003 }); // no lock colour reads as black (setHex of nothing)
    b.box(0.03, 0.05, 0.045, 0x35305c, { y: h - 0.005, z: hd + 0.025, ao: false, v: 0 });
    if (o.rivets) for (const sx of [-1, 1]) for (const sy of [0.06, h - 0.06]) b.oct(0.025, o.rivets, { x: sx * (hw - 0.04), y: sy, z: hd + 0.012, sz: 0.5, j: 0.002, ao: false });
}
export function chest(_o: BOpts): Model<BuildE> {
    return { obj: bake('work.chest', (mb) => chestShape(mb.main, { w: 0.68, d: 0.46, h: 0.3, lid: 0.17, body: wc(0.86, 0.28), lidCol: wc(0.9, 0.3), strap: (_x: number, y: number) => mix(BR[1], BR[3], clamp(y * 2 + 0.2)), lock: BR[3] })) };
}
export function steelchest(_o: BOpts): Model<BuildE> {
    const g = bake('work.steelchest', (mb) => {
        chestShape(mb.main, { w: 0.78, d: 0.54, h: 0.34, lid: 0.18, body: steelCol(0.55), lidCol: steelCol(0.7), strap: steelCol(0.95), lock: 0xe4e7f2, rivets: 0xe4e7f2 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.main.box(0.08, 0.06, 0.08, IR[1], { x: sx * 0.37, y: 0.03, z: sz * 0.24, j: 0.004 });
    });
    return { obj: g };
}
export const FIRE = 0xf07a22;
export const FLAME = 0xffb040;
export const CORE = 0xffe08a;
export const PALE = 0xfff3b0;
export function campfire(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.campfire', (mb) => {
        const b = mb.main;
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * TAU + 0.2, h = 0.09 + i % 3 * 0.02;
            b.box(0.2 + i % 2 * 0.03, h, 0.14 + i % 3 * 0.015, sc(0.4 + i % 3 * 0.17, 0.3, i), { x: Math.cos(a) * 0.37, y: h / 2, z: Math.sin(a) * 0.35, ry: -a + (i % 2 ? 0.25 : -0.2), j: 0.03, v: 0.08 });
        }
        b.cyl(0.28, 0.3, 0.04, 8, 0x4a3a32, { y: 0.02, j: 0.01, ao: false });
        const log = (a: Pt, c: Pt, r: number) => b.rod(a, c, r, 6, wc(0.42, 0.3), r * 0.9, { j: 0.012 });
        log([-0.3, 0.07, -0.12], [0.3, 0.17, 0.12], 0.052);
        log([0.28, 0.07, -0.2], [-0.26, 0.17, 0.2], 0.05);
        log([-0.05, 0.07, 0.3], [0.04, 0.16, -0.28], 0.045);
        mb.glow(0xf08a2a, 1.8).oct(0.05, 0xf08a2a, { x: 0, y: 0.12, z: 0, sy: 0.7, j: 0.01, ao: false });
        mb.glow(0xf08a2a, 1.6).oct(0.04, 0xf08a2a, { x: 0.12, y: 0.1, z: -0.06, sy: 0.7, j: 0.01, ao: false });
    }));
    const flameA = bake('work.campfire.fa', (mb) => {
        mb.glow(FIRE, 2).cone(0.17, 0.5, 5, (_x, y) => mix(FIRE, FLAME, clamp(y * 1.2)), { y: 0.33, j: 0.02, ao: false, v: 0.05 });
        mb.glow(FLAME, 2.2).cone(0.12, 0.38, 5, (_x, y) => mix(FLAME, CORE, clamp(y)), { x: 0.02, y: 0.3, z: 0.03, j: 0.015, ao: false, v: 0.05 });
        mb.glow(PALE, 2.4).cone(0.065, 0.22, 4, PALE, { x: 0, y: 0.23, z: 0.03, j: 0.01, ao: false, v: 0.03 });
    });
    const flameB = bake('work.campfire.fb', (mb) => {
        mb.glow(FIRE, 2).cone(0.1, 0.3, 4, FIRE, { x: -0.13, y: 0.25, z: 0.02, j: 0.015, ao: false, v: 0.05 });
        mb.glow(FLAME, 2.1).cone(0.09, 0.26, 4, FLAME, { x: 0.13, y: 0.23, z: -0.04, j: 0.015, ao: false, v: 0.05 });
    });
    root.add(flameA, flameB);
    const sp = sparks({ x: 0, y: 0.5, z: 0, rise: 0.6, dx: 0.05, spread: 0.1, size: 0.4, period: 1.7, n: 3 });
    root.add(sp.group);
    const pool = halo(0xffa040, 1.7);
    root.add(pool);
    return {
        obj: root,
        update(_dt: number, t: number) {
            const f = flicker(t, 0.3), g = flicker(t, 2.1), n = env.night;
            flameA.scale.set(1 + (g - 0.5) * 0.18, 0.78 + f * 0.5 + n * 0.12, 1 + (f - 0.5) * 0.18);
            flameA.rotation.y = t * 0.8;
            flameB.scale.set(1, 0.7 + g * 0.6, 1);
            flameB.rotation.y = -t * 1.1;
            pool.scale.setScalar(3.2 * (1 + n * 0.45 + (f - 0.5) * 0.06));
            setHalo(0xffa040, 0.03, 0.55);
            sp.update(t, true);
        }
    };
}
export function lantern(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.lantern', (mb) => {
        const b = mb.main;
        b.cyl(0.15, 0.17, 0.05, 6, ic(0.4), { y: 0.025, j: 0.008 });
        b.cyl(0.032, 0.04, 0.4, 5, ic(0.5), { y: 0.24, j: 0.005 });
        b.cyl(0.11, 0.09, 0.05, 6, ic(0.6), { y: 0.46, j: 0.005 });
        b.cone(0.16, 0.12, 6, ic(0.4), { y: 0.755, ry: 0.5, j: 0.006 });
        b.cyl(0.13, 0.13, 0.025, 6, ic(0.7), { y: 0.69, j: 0.004 });
        b.box(0.07, 0.035, 0.035, IR[3], { y: 0.84 });
        for (const [x, z] of [[-0.1, 0.06], [0.1, 0.06], [0, -0.12]]) b.box(0.022, 0.2, 0.022, IR[2], { x, y: 0.58, z, j: 0.002, ao: false });
        mb.glow(0xffd060, 1.9).cyl(0.088, 0.1, 0.2, 6, (_x, y) => mix(0xf8b648, 0xfffadc, clamp((y - 0.48) * 4)), { y: 0.58, j: 0.004, ao: false, v: 0.04 });
        mb.glow(0xfffadc, 2.4).oct(0.045, 0xfffadc, { y: 0.58, ao: false, v: 0 });
    }));
    const pool = halo(0xffc860, 1.2);
    root.add(pool);
    return {
        obj: root,
        update(_dt: number, t: number) {
            const f = flicker(t, 4.1);
            pool.scale.setScalar(2.2 * (1 + env.night * 0.6 + (f - 0.5) * 0.05));
            setHalo(0xffc860, 0, 0.45);
        }
    };
}
export function lamppost(_o: BOpts): Model<BuildE> {
    const root = new THREE.Group();
    root.add(bake('work.lamppost', (mb) => {
        const b = mb.main;
        b.box(0.36, 0.1, 0.36, ic(0.4), { y: 0.05, j: 0.008 });
        b.box(0.26, 0.1, 0.26, ic(0.55), { y: 0.15, j: 0.006 });
        b.cyl(0.05, 0.075, 1.3, 6, ic(0.45), { y: 0.8, j: 0.006 });
        b.cyl(0.085, 0.085, 0.045, 6, ic(0.7), { y: 0.3, j: 0.003 });
        b.cyl(0.075, 0.075, 0.04, 6, ic(0.7), { y: 1.35, j: 0.003 });
        b.rod([0.05, 0.55, 0], [0.2, 0.7, 0], 0.014, 4, IR[2]);
        b.rod([-0.05, 0.55, 0], [-0.2, 0.7, 0], 0.014, 4, IR[2]);
        b.box(0.3, 0.04, 0.3, ic(0.6), { y: 1.4, j: 0.004 });
        for (const [x, z] of [[-0.125, -0.125], [0.125, -0.125], [-0.125, 0.125], [0.125, 0.125]]) b.box(0.03, 0.34, 0.03, ic(0.65), { x, y: 1.59, z, j: 0.003, ao: false });
        b.cone(0.27, 0.17, 4, ic(0.45), { y: 1.855, ry: Math.PI / 4, j: 0.006 });
        b.box(0.34, 0.035, 0.34, ic(0.4), { y: 1.775, j: 0.004 });
        b.oct(0.045, IR[3], { y: 1.99 });
        mb.glow(0xffd060, 1.9).cyl(0.12, 0.14, 0.32, 6, (_x, y) => mix(0xf8b648, 0xfffadc, clamp((y - 1.4) * 3)), { y: 1.59, ry: 0.5, j: 0.004, ao: false, v: 0.04 });
        mb.glow(0xfffadc, 2.4).oct(0.07, 0xfffadc, { y: 1.59, ao: false, v: 0 });
    }));
    const pool = halo(0xffc860, 1.7);
    root.add(pool);
    return {
        obj: root,
        update(_dt: number, t: number) {
            const f = flicker(t, 5.3);
            pool.scale.setScalar(3 * (1 + env.night * 0.55 + (f - 0.5) * 0.04));
            setHalo(0xffc860, 0, 0.45);
        }
    };
}
export const MISC = { chest, steelchest, campfire, lantern, lamppost };
