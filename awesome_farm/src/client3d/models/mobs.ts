// The monster model for any monster kind.
import { placeholder } from './placeholder';
import type { Ent } from '../../shared/sim/types';
import type { Model } from './kit';
import { BOSS_BUILD } from './mobs-boss';
import { MORE_BUILD } from './mobs-more';
import { type MobRig, wrapRig } from './mobs-rig';
import { SMALL_BUILD } from './mobs-small';

type Builds = Record<string, ((seed: number) => MobRig) | undefined>;
export const MOB_MODEL_KINDS = [...Object.keys(SMALL_BUILD), ...Object.keys(MORE_BUILD), ...Object.keys(BOSS_BUILD)];
export function mobModel(kind: string, o: { elite: boolean; seed: number }): Model {
    const build = (SMALL_BUILD as Builds)[kind] ?? (MORE_BUILD as Builds)[kind] ?? (BOSS_BUILD as Builds)[kind];
    if (!build) return { ...placeholder(0.8, 0.8, 0xc080e0, 0.7), pose() {
    } };
    const m = wrapRig(build(o.seed), o);
    return {
        obj: m.obj,
        apply(e: Ent) {

            if (e.k === 'mob') m.apply?.(e);
        },
        pose: m.pose
    };
}
