// The Iridium Drill: a squat violet-banded housing under a small derrick; its bit turns and bobs while it drills (the sim touches it
// every second it works), with a glowing violet crystal on top and a plume of violet dust.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { housing, PIT } from './b-work-power';
import { puffs, sc } from './b-work-util';
import { bake, type BOpts, type Model } from './kit';

const IRI = 0x9d6fdb, IRI_DARK = 0x5d4a7c, IRI_LIGHT = 0xf79fc6;

export function iridiumDrill(_o: BOpts): Model<BuildE> {
    const inner = new THREE.Group();
    inner.add(bake('work.iridium', (mb) => {
        const b = mb.main;
        housing(b, 0.34, sc(0.55, 0.3), sc(0.2, 0.15));
        // violet bands round the housing
        b.box(1.86, 0.05, 1.86, IRI_DARK, { y: 0.2, j: 0.004, ao: false });
        // the pit and a derrick over it: four posts, a cross frame
        b.cyl(0.5, 0.5, 0.014, 8, PIT, { y: 0.356, ao: false, v: 0 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, 0.95, 0.08, sc(0.6, 0.2), { x: sx * 0.5, y: 0.82, z: sz * 0.5, rz: -sx * 0.1, rx: sz * 0.1, j: 0.004 });
        for (const y of [0.9, 1.22]) {
            b.box(1.1 - (y - 0.9) * 0.4, 0.06, 0.06, IRI_DARK, { y, z: 0.5 - (y - 0.9) * 0.2, j: 0.003 });
            b.box(1.1 - (y - 0.9) * 0.4, 0.06, 0.06, IRI_DARK, { y, z: -0.5 + (y - 0.9) * 0.2, j: 0.003 });
            b.box(0.06, 0.06, 1.1 - (y - 0.9) * 0.4, IRI_DARK, { y, x: 0.5 - (y - 0.9) * 0.2, j: 0.003 });
            b.box(0.06, 0.06, 1.1 - (y - 0.9) * 0.4, IRI_DARK, { y, x: -0.5 + (y - 0.9) * 0.2, j: 0.003 });
        }
        b.box(0.32, 0.18, 0.32, sc(0.7, 0.2), { y: 1.36, j: 0.004 });
        // the sky-metal on top
        b.cone(0.16, 0.34, 5, IRI, { y: 1.62, j: 0.006 });
        b.cone(0.08, 0.2, 5, IRI_LIGHT, { y: 1.74, x: 0.06, j: 0.004 });
    }));
    const rod = new THREE.Group();
    rod.position.set(0, 0.36, 0);
    inner.add(rod);
    rod.add(bake('work.iridium.rod', (mb) => {
        const b = mb.main;
        b.cyl(0.07, 0.07, 1.0, 6, sc(0.8, 0.15), { y: 0.62, j: 0.003 });
        b.cone(0.16, 0.36, 6, IRI, { y: 0.1, ry: 0, sy: -1, j: 0.004 });
        for (let i = 0; i < 3; i++) b.box(0.3, 0.04, 0.05, IRI_LIGHT, { y: 0.4 + i * 0.22, ry: i * 1.05, j: 0.003 });
    }));
    const dust = puffs({ x: 0, y: 0.5, z: 0, rise: 0.7, dx: 0.1, dz: 0.1, size: 0.9, period: 1.4, n: 4, color: IRI, spread: 0.28 });
    inner.add(dust.group);
    let busy = 0, lastIp = -1;
    return {
        obj: inner,
        apply(e) {
            if ((e.ip ?? 0) !== lastIp) busy = 2.2;                 // it moved since the last time: it is drilling
            lastIp = e.ip ?? 0;
        },
        update(dt: number, t: number) {
            busy = Math.max(0, busy - dt);
            const on = busy > 0;
            if (on) {
                rod.rotation.y -= dt * 7;
                rod.position.y = 0.36 + Math.sin(t * 18) * 0.025;
            } else rod.position.y = 0.36;
            dust.update(t, on);
        }
    };
}

export const IRIDIUM = { iridium_drill: iridiumDrill };
