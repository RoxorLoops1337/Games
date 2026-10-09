// The Blight nest (a node): a throbbing cluster of dark eggs on its tendrils, lit from inside through their cracks, as the 2D nest
// in client/art/storybook-blight.ts (two frames there, a slow swell here).
import * as THREE from 'three';
import { bake, clamp, type MB, mix, seedRand, TAU } from './kit';
import type { NodeOpts, NodeRig } from './nodes';

/** The nest's shell (dark to light), its veins and the glow in its cracks: the 2D nest's colours. */
const NEST = [0x2a1830, 0x46284e, 0x6a3a6e, 0x925294, 0xbe7ab8];
const VEIN = 0xb02a50;
const HOT = [0xe0405a, 0xff7a88, 0xffd0d6];

/** One egg: a dark shell lit from below by its crack, with veins running down it. */
function egg (mb: MB, x: number, z: number, r: number, h: number, ry: number) {
    mb.main.ico(r, 1, (_x: number, y: number) => NEST[Math.max(0, Math.min(4, Math.round(clamp(y / (h * 2)) * 3.4)))], { x, y: h, z, sy: h / r, ry, j: 0.03, v: 0.06 });
    // the glowing crack down its front, and two veins
    mb.glow(HOT[0], 2.2).box(0.035, h * 0.9, 0.03, HOT[1], { x: x + r * 0.15, y: h * 1.05, z: z + r * 0.93, rz: 0.15, ao: false, v: 0 });
    for (const s of [-1, 1]) mb.main.box(0.022, h * 1.1, 0.02, VEIN, { x: x + s * r * 0.55, y: h * 0.95, z: z + r * 0.78, ry: s * 0.6, rz: s * 0.25, ao: false, v: 0 });
}

export function nestNode (o: NodeOpts): NodeRig {
    const obj = new THREE.Group(), bodyG = new THREE.Group();
    obj.add(bodyG);
    const rg: NodeRig = { obj, body: bodyG, swayAmp: 0 };
    const body = bake(`blight.nest|${o.seed % 3}`, (mb) => {
        const r = seedRand(o.seed * 7 + 5);
        // the tendrils it grows from, spreading over the ground, and the mound they meet in
        mb.main.dome(0.62, 0.16, 9, 2, (_x: number, y: number) => mix(NEST[0], NEST[1], clamp(y * 6)), { j: 0.03, v: 0.06 });
        for (let k = 0; k < 9; k++) {
            const a = k / 9 * TAU + r() * 0.4, len = 0.55 + r() * 0.35;
            mb.main.rod([Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3], [Math.cos(a) * len, 0.02, Math.sin(a) * len], 0.06, 5, NEST[k % 2], 0.025, { j: 0.01 });
        }
        egg(mb, -0.26, 0.06, 0.2, 0.24, 0.3);
        egg(mb, 0.27, 0.08, 0.19, 0.22, 1.1);
        egg(mb, 0.02, -0.12, 0.28, 0.36, 2);
        egg(mb, -0.08, 0.3, 0.15, 0.15, 0.7);
        // pustules of glowing ooze round its foot
        for (let k = 0; k < 6; k++) {
            const a = r() * TAU, d = 0.42 + r() * 0.25;
            mb.glow(HOT[0], 2).oct(0.035 + r() * 0.02, HOT[k % 2], { x: Math.cos(a) * d, y: 0.03, z: Math.sin(a) * d, sy: 0.6, ao: false, v: 0 });
        }
    }, o.seed);
    bodyG.add(body);
    // it throbs, as the 2D nest's two frames do
    const ph = (o.seed % 7) * 0.9;
    rg.extra = (_dt, t) => {
        const k = Math.max(0, Math.sin(t * 2.4 + ph));
        body.scale.set(1 + k * 0.035, 1 + k * 0.06, 1 + k * 0.035);
    };
    return rg;
}
