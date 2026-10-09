// The creature model for any species.
import { placeholder } from './placeholder';
import { bogsprout, crystalisk, glimmoth, scarabeau } from './critters-odd';
import { aurorin, cinderkit, duskmaw, frostpup, gnaw, pyrelion, sandpaw } from './critters-quad';
import { type CritterSpec, Rig } from './critters-rig';
import type { Model } from './kit';
import type { Ent } from '../../shared/sim/types';
import { fuzzle, hopper, mossback, pebbit, sparkit } from './critters-small';

export const SPECS = {
    hopper,
    fuzzle,
    mossback,
    pebbit,
    sparkit,
    gnaw,
    cinderkit,
    sandpaw,
    frostpup,
    duskmaw,
    pyrelion,
    aurorin,
    bogsprout,
    glimmoth,
    scarabeau,
    crystalisk
};
export const SCALE = {
    hopper: 1.15,
    fuzzle: 1.35,
    mossback: 1,
    pebbit: 1.1,
    gnaw: 1.2,
    cinderkit: 1.2,
    sparkit: 1.15,
    sandpaw: 1.15,
    scarabeau: 1.15,
    frostpup: 1.2,
    bogsprout: 1.1,
    glimmoth: 1,
    crystalisk: 1.1,
    duskmaw: 1.25,
    pyrelion: 1.35,
    aurorin: 1.3
};
export function critterModel(species: string, o: { seed: number; stage?: number }): Model {
    const spec = (SPECS as Record<string, CritterSpec | undefined>)[species];
    if (!spec) return { ...placeholder(0.7, 0.7, 0xf0c080, 0.5), pose() {
    } };
    const r = new Rig(species, Math.abs(o.seed | 0) % 3, { ...spec.cfg }, Math.abs(o.seed | 0));
    spec.build(r);
    r.setScale((SCALE as Record<string, number | undefined>)[species] ?? 1);
    r.setStars(o.stage ?? 0);
    r.pose(0, false, false, 0);
    return {
        obj: r.obj,
        pose: (face: number, moving: boolean, sleeping: boolean, dt: number) => r.pose(face, moving, sleeping, dt),
        apply: (e: Ent) => r.apply(e)

    };
}
