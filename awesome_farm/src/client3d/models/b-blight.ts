// Buildings that came with the Blight and after it: the Bed (wake here after a fall, as client/art/storybook-blight.ts paints it),
// the Fortified Wall (stone bound in iron, joined like the other walls) and the Uber Chest (the farm's one shared store, violet and
// gold like its 2D chest). The Blight nest is a node: models/nodes-nest.ts.
import * as THREE from 'three';
import type { BuildE } from '../../shared/sim/types';
import { wallModel } from './b-home-walls';
import { chestShape } from './b-work-misc';
import { RAMP } from './data';
import { bake, type BOpts, type BuildingMaker, clamp, mix, type Model } from './kit';

/** The Bed: a wooden frame with a headboard (north), a pillow, a turned-down sheet and a red quilted blanket. */
function sleepbed (_o: BOpts): Model<BuildE> {
    return { obj: bake('blight.sleepbed', (mb) => {
        const b = mb.main, W = RAMP.wood, C = RAMP.cream;
        const quilt = [0x6a2440, 0x9a3446, 0xc9505a, 0xe8737a];
        for (const x of [-0.4, 0.4]) for (const z of [-0.88, 0.88]) b.box(0.1, 0.32, 0.1, W[1], { x, y: 0.16, z, j: 0.005, v: 0.05 });
        b.box(0.86, 0.1, 1.8, W[2], { y: 0.22, j: 0.006, v: 0.04 });
        b.box(0.8, 0.12, 1.72, C[1], { y: 0.33, j: 0.006, v: 0.03 });
        // the headboard, with a rounded top rail, and a low footboard
        b.box(0.9, 0.52, 0.08, W[2], { y: 0.5, z: -0.9, j: 0.006, v: 0.05 });
        b.cyl(0.05, 0.05, 0.94, 6, W[3], { y: 0.78, z: -0.9, rz: Math.PI / 2, v: 0.04 });
        b.box(0.9, 0.2, 0.07, W[2], { y: 0.36, z: 0.9, j: 0.006, v: 0.05 });
        // the pillow, the sheet turned down over the blanket, the blanket with its quilting
        b.ico(0.22, 1, C[3], { y: 0.44, z: -0.62, sx: 1.55, sy: 0.38, sz: 0.85, j: 0.01, v: 0.03 });
        b.box(0.82, 0.06, 0.2, C[2], { y: 0.42, z: -0.32, j: 0.004, v: 0.03 });
        b.box(0.84, 0.08, 1.12, (x: number, _y: number, z: number) => quilt[1 + ((Math.floor((x + 0.5) * 4) + Math.floor((z + 1) * 4)) & 1)], { y: 0.43, z: 0.28, j: 0.004, v: 0.03 });
        b.box(0.86, 0.22, 0.04, quilt[0], { y: 0.36, z: 0.85, v: 0.03 });
        for (const s of [-1, 1]) b.box(0.04, 0.2, 1.12, quilt[0], { x: s * 0.43, y: 0.36, z: 0.28, v: 0.03 });
    }) };
}

/** The Uber Chest: a big steel-cornered chest in the violet and gold of its 2D picture, with a glowing crystal lock (it gives light). */
function uberchest (_o: BOpts): Model<BuildE> {
    const V = [0x35305c, 0x5d4a7c, 0x9d6fdb, 0xc9a6f0], G = RAMP.gold;
    const obj = new THREE.Group();
    obj.add(bake('blight.uberchest', (mb) => {
        chestShape(mb.main, {
            w: 0.84, d: 0.58, h: 0.36, lid: 0.2,
            body: (x: number, y: number) => mix(V[0], V[2], clamp(0.35 + y * 0.9 + x * 0.1)),
            lidCol: (x: number, y: number) => mix(V[1], V[3], clamp((y - 0.36) * 3 + x * 0.1)),
            strap: (_x: number, y: number) => mix(G[1], G[3], clamp(y * 1.6)), lock: G[2], rivets: G[3],
        });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.shiny().box(0.09, 0.07, 0.09, G[1], { x: sx * 0.4, y: 0.035, z: sz * 0.26, j: 0.004 });
    }));
    // the crystal over the lid (the light it gives) bobs and turns
    const gem = bake('blight.uberchest.gem', (mb) => {
        mb.glow(0xc9a6f0, 2.2).oct(0.07, 0xeedcff, { sy: 1.5, ao: false, v: 0 });
    });
    gem.position.y = 0.66;
    obj.add(gem);
    return {
        obj,
        update: (_dt: number, t: number) => { gem.position.y = 0.66 + Math.sin(t * 2) * 0.03; gem.rotation.y = t * 0.8; },
    };
}

export const BLIGHT_BUILDINGS: Record<string, BuildingMaker> = {
    sleepbed,
    uberchest,
    wall_fort: (o) => wallModel('fort', o),
};
