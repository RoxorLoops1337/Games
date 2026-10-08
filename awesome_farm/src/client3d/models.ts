// The whole model library in one place, and a warm-up that bakes every model in small slices.
import { SPECIES_LIST } from '../shared/data/creatures';
import { type BuildingKind, BUILDINGS } from '../shared/data/buildings';
import { ITEMS } from '../shared/data/items';
import { MOBS } from '../shared/data/mobs';
import { NODES } from '../shared/data/nodes';
import { buildingModel } from './models/buildings';
import { critterModel } from './models/critters';
import { dropModel } from './models/drops';
import { farmerModel } from './models/farmer';
import { mobModel } from './models/mobs';
import { nodeModel } from './models/nodes';

export const NODE_KINDS = Object.keys(NODES);
export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];
export const MOB_KINDS = Object.keys(MOBS);
export const SPECIES_IDS = [...SPECIES_LIST];
export const ITEM_IDS = ['coin', ...Object.keys(ITEMS)];
export function prewarm(onProgress: ((arg0: number, arg1: number) => void) | undefined, sliceMs = 8) {
    const jobs: (() => void)[] = [];
    for (const kind of NODE_KINDS) for (const biome of ['meadow', 'quarry', 'goldsand', 'snowcap', 'bog']) for (let seed = 0; seed < (kind === 'tree' ? 9 : 4); seed++) jobs.push(() => nodeModel(kind, { biome, gold: false, seed }));
    for (const kind of BUILDING_KINDS) for (const mask of BUILDINGS[kind].wall || BUILDINGS[kind].roof || BUILDINGS[kind].floor ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] : [0]) jobs.push(() => buildingModel(kind, { rot: 0, seed: 1, mask }));
    for (const kind of MOB_KINDS) for (const elite of [false, true]) jobs.push(() => mobModel(kind, { elite, seed: 1 }));
    for (const sp of SPECIES_IDS) jobs.push(() => critterModel(sp, { seed: 1 }));
    for (const id of ITEM_IDS) jobs.push(() => dropModel(id));
    jobs.push(() => farmerModel(undefined, 0, {}));
    const total = jobs.length;
    let i = 0;
    return new Promise<void>((resolve) => {
        const tick = () => {
            const t0 = performance.now();
            while (i < total && performance.now() - t0 < sliceMs) {
                try {
                    jobs[i]();
                } catch (e) {
                    console.warn('prewarm', e);
                }
                i++;
            }
            onProgress?.(i, total);
            if (i < total) setTimeout(tick, 0);
            else resolve();
        };
        tick();
    });
}
