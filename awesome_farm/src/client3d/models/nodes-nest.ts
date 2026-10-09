// The Blight nest (a node): a throbbing cluster of dark eggs on its tendrils, lit from inside through their cracks, as the 2D nest
// in client/art/storybook-blight.ts (two frames there, a slow swell here).
import * as THREE from 'three';
import { bake, clamp, type MB, mix, seedRand, TAU } from './kit';
import type { NodeOpts, NodeRig } from './nodes';

/** The nest's shell (dark to light), its veins and the glow in its cracks: the 2D nest's colours. */
const NEST = [0x2a1830, 0x46284e, 0x6a3a6e, 0x925294, 0xbe7ab8];
const VEIN = 0xb02a50;
const HOT = [0xe0405a, 0xff7a88, 0xffd0d6];

/** How big a nest is drawn at a level: the 2D `nestScale` (client/world/blight.ts), so both views grow it alike. */
export const nestScale = (lv: number) => Math.min(1.9, 0.85 + 0.09 * (Math.max(1, lv) - 1));
/** Which look a level has (0..3): an older nest is darker and has more eggs and spines. Baked once per tier and seed, so every nest
 * of a tier shares its mesh (instanced) and a nest rebuilds only when it crosses into the next tier. */
export const nestTier = (lv: number) => lv >= 10 ? 3 : lv >= 6 ? 2 : lv >= 3 ? 1 : 0;
/** How fast it throbs (radians a second): the 2D nest's beat, a little quicker as it grows, still slow. */
export const nestBeat = (lv: number) => 2.2 + Math.max(1, lv) * 0.05;
/** The darkening of a tier (as the 2D tint, darker by 3% a level up to 30%). */
const DARK = [0, 0.12, 0.22, 0.32];

/** One egg: a dark shell lit from below by its crack, with veins running down it. */
function egg (mb: MB, x: number, z: number, r: number, h: number, ry: number, dark: number) {
    mb.main.ico(r, 1, (_x: number, y: number) => mix(NEST[Math.max(0, Math.min(4, Math.round(clamp(y / (h * 2)) * 3.4)))], 0x120a18, dark), { x, y: h, z, sy: h / r, ry, j: 0.03, v: 0.06 });
    // the glowing crack down its front, and two veins
    mb.glow(HOT[0], 2.2).box(0.035, h * 0.9, 0.03, HOT[1], { x: x + r * 0.15, y: h * 1.05, z: z + r * 0.93, rz: 0.15, ao: false, v: 0 });
    for (const s of [-1, 1]) mb.main.box(0.022, h * 1.1, 0.02, VEIN, { x: x + s * r * 0.55, y: h * 0.95, z: z + r * 0.78, ry: s * 0.6, rz: s * 0.25, ao: false, v: 0 });
}

/** The nest's body at one tier: tendrils and mound, the eggs (more as it ages), pustules, and on old nests bone spines. */
function nestBody (seed: number, tier: number) {
    return bake(`blight.nest|${seed % 3}|${tier}`, (mb) => {
        const r = seedRand(seed * 7 + 5), dk = DARK[tier], d = (c: number) => mix(c, 0x120a18, dk);
        // the tendrils it grows from, spreading over the ground, and the mound they meet in
        mb.main.dome(0.62, 0.16 + tier * 0.02, 9, 2, (_x: number, y: number) => d(mix(NEST[0], NEST[1], clamp(y * 6))), { j: 0.03, v: 0.06 });
        for (let k = 0; k < 9 + tier * 2; k++) {
            const a = k / (9 + tier * 2) * TAU + r() * 0.4, len = 0.55 + r() * 0.35 + tier * 0.05;
            mb.main.rod([Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3], [Math.cos(a) * len, 0.02, Math.sin(a) * len], 0.06, 5, d(NEST[k % 2]), 0.025, { j: 0.01 });
        }
        egg(mb, -0.26, 0.06, 0.2, 0.24, 0.3, dk);
        egg(mb, 0.27, 0.08, 0.19, 0.22, 1.1, dk);
        egg(mb, 0.02, -0.12, 0.28, 0.36, 2, dk);
        egg(mb, -0.08, 0.3, 0.15, 0.15, 0.7, dk);
        if (tier >= 1) egg(mb, 0.32, -0.26, 0.14, 0.17, 2.6, dk);
        if (tier >= 2) { egg(mb, -0.36, -0.22, 0.16, 0.2, 1.8, dk); egg(mb, 0.18, 0.32, 0.12, 0.13, 0.2, dk); }
        if (tier >= 3) egg(mb, -0.02, -0.38, 0.18, 0.26, 1.2, dk);
        // pustules of glowing ooze round its foot
        for (let k = 0; k < 6 + tier * 2; k++) {
            const a = r() * TAU, dd = 0.42 + r() * 0.25;
            mb.glow(HOT[0], 2).oct(0.035 + r() * 0.02, HOT[k % 2], { x: Math.cos(a) * dd, y: 0.03, z: Math.sin(a) * dd, sy: 0.6, ao: false, v: 0 });
        }
        // an old nest grows bone spines out of its mound
        for (let k = 0; k < (tier >= 2 ? 3 + tier : 0); k++) {
            const a = k / (3 + tier) * TAU + 0.4, rr = 0.42 + r() * 0.1, hgt = 0.3 + r() * 0.18;
            mb.main.rod([Math.cos(a) * rr, 0.04, Math.sin(a) * rr], [Math.cos(a) * (rr + 0.12), hgt, Math.sin(a) * (rr + 0.12)], 0.035, 5, 0xd0c8b8, 0.006, { j: 0.004 });
        }
    }, seed);
}

/** A nest. `o.level` reads its plot's level (`Plot.nl`) every frame: it grows and darkens with it, and throbs a little faster. */
export function nestNode (o: NodeOpts): NodeRig {
    const obj = new THREE.Group(), bodyG = new THREE.Group(), lvG = new THREE.Group();
    obj.add(bodyG);
    bodyG.add(lvG);
    const rg: NodeRig = { obj, body: bodyG, swayAmp: 0 };
    const lvl = () => Math.max(1, o.level?.() ?? 1);
    let tier = nestTier(lvl()), body = nestBody(o.seed, tier), shown = nestScale(lvl());
    lvG.add(body);
    lvG.scale.setScalar(shown);
    const ph = (o.seed % 7) * 0.9;
    rg.extra = (dt, t) => {
        const lv = lvl(), want = nestTier(lv);
        if (want !== tier) { lvG.remove(body); tier = want; body = nestBody(o.seed, tier); lvG.add(body); }
        // it grows to its level's size (smoothly: a level comes at dawn)
        shown += (nestScale(lv) - shown) * Math.min(1, dt * 2);
        lvG.scale.setScalar(shown);
        // and throbs, as the 2D nest's two frames do: a slow swell
        const k = Math.max(0, Math.sin(t * nestBeat(lv) + ph));
        body.scale.set(1 + k * 0.05, 1 + k * 0.08, 1 + k * 0.05);
    };
    return rg;
}
