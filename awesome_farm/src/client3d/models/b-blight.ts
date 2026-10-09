// Buildings that came with the Blight and after it: the four towers of the Defense tab, the Bed (wake here after a fall, as client/art/storybook-blight.ts paints it),
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

/** The Archer Tower: a stone foot, four timber legs, a railed lookout under a red cone roof and a pennant. */
function tower_archer (_o: BOpts): Model<BuildE> {
    return { obj: bake('blight.tower_archer', (mb) => {
        const b = mb.main, W = RAMP.wood, S = RAMP.stone, R = RAMP.red;
        b.box(0.86, 0.3, 0.86, S[1], { y: 0.15, j: 0.01, v: 0.06 });
        for (const x of [-0.32, 0.32]) for (const z of [-0.32, 0.32]) b.box(0.1, 1.1, 0.1, W[1], { x, y: 0.85, z, j: 0.006, v: 0.05 });
        for (const z of [-0.32, 0.32]) b.box(0.66, 0.06, 0.06, W[2], { y: 0.7, z, rz: 0.55, v: 0.04 });
        b.box(0.9, 0.08, 0.9, W[2], { y: 1.42, j: 0.006, v: 0.04 });
        for (const s of [-1, 1]) {
            b.box(0.9, 0.18, 0.05, W[1], { y: 1.55, z: s * 0.43, v: 0.04 });
            b.box(0.05, 0.18, 0.9, W[1], { x: s * 0.43, y: 1.55, v: 0.04 });
        }
        b.cone(0.62, 0.5, 4, R[1], { y: 1.95, ry: Math.PI / 4, v: 0.05 });
        b.cyl(0.015, 0.015, 0.4, 4, W[3], { y: 2.35, v: 0 });
        b.box(0.22, 0.12, 0.02, R[2], { x: 0.11, y: 2.47, v: 0 });
    }) };
}

/** The Spike Trap: a plank floor with a bed of iron spikes. */
function spike (_o: BOpts): Model<BuildE> {
    return { obj: bake('blight.spike', (mb) => {
        const W = RAMP.wood, I = RAMP.iron;
        mb.main.box(0.9, 0.05, 0.9, W[1], { y: 0.025, j: 0.004, v: 0.04 });
        for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) mb.shiny().cone(0.07, 0.24, 4, I[2], { x: (i - 1) * 0.27, y: 0.17, z: (k - 1) * 0.27, ry: (i + k) * 0.4, v: 0.04 });
    }) };
}

/** The Ballista: a timber cradle on a swivel, a great bow with iron tips and a bolt laid ready. */
function ballista (_o: BOpts): Model<BuildE> {
    return { obj: bake('blight.ballista', (mb) => {
        const b = mb.main, W = RAMP.wood, I = RAMP.iron;
        b.box(0.8, 0.16, 0.8, W[1], { y: 0.08, j: 0.006, v: 0.05 });
        b.cyl(0.14, 0.18, 0.3, 8, I[1], { y: 0.31, v: 0.04 });
        b.box(0.16, 0.12, 0.9, W[2], { y: 0.52, rx: -0.12, v: 0.04 });
        for (const s of [-1, 1]) {
            b.box(0.5, 0.07, 0.07, W[2], { x: s * 0.27, y: 0.6, z: -0.3, ry: s * 0.35, v: 0.04 });
            mb.shiny().box(0.06, 0.08, 0.08, I[2], { x: s * 0.5, y: 0.6, z: -0.2, v: 0.02 });
        }
        b.box(0.015, 0.015, 0.7, RAMP.cream[2], { y: 0.62, z: -0.02, v: 0 });
        b.cyl(0.025, 0.025, 0.85, 5, W[3], { y: 0.6, z: 0.02, rx: Math.PI / 2, v: 0.02 });
        mb.shiny().cone(0.05, 0.12, 4, I[3], { y: 0.6, z: -0.46, rx: -Math.PI / 2, v: 0.02 });
    }) };
}

/** The Tesla Coil: an iron plinth, a copper coil wound up a mast and a glowing sphere that hums while the grid feeds it. */
function tesla (_o: BOpts): Model<BuildE> {
    const obj = new THREE.Group();
    obj.add(bake('blight.tesla', (mb) => {
        const b = mb.main, I = RAMP.iron, C = RAMP.copper;
        b.box(0.7, 0.22, 0.7, I[1], { y: 0.11, j: 0.006, v: 0.05 });
        b.cyl(0.08, 0.12, 1.1, 8, I[2], { y: 0.77, v: 0.03 });
        for (let i = 0; i < 6; i++) mb.shiny().torus(0.16 - i * 0.012, 0.03, 5, 12, C[2], { y: 0.45 + i * 0.13, rx: Math.PI / 2, v: 0.03 });
        mb.shiny().torus(0.2, 0.05, 6, 16, C[3], { y: 1.32, rx: Math.PI / 2, v: 0.02 });
    }));
    const orb = bake('blight.tesla.orb', (mb) => { mb.glow(0x8fe7ff, 2.4).ico(0.13, 1, 0xdff8ff, { ao: false, v: 0 }); });
    orb.position.y = 1.5;
    obj.add(orb);
    return {
        obj,
        update: (_dt: number, t: number) => { const k = 1 + Math.sin(t * 9) * 0.08; orb.scale.set(k, k, k); orb.rotation.y = t * 1.5; },
    };
}

export const BLIGHT_BUILDINGS: Record<string, BuildingMaker> = {
    sleepbed,
    uberchest,
    wall_fort: (o) => wallModel('fort', o),
    tower_archer,
    spike,
    ballista,
    tesla,
};
