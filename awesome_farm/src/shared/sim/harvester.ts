// The Harvester Arm: every few seconds it reaches for one ripe garden bed within HARVEST_RANGE tiles and harvests it for the
// farmer who built it (their yield bonuses, their XP). The crop goes into the nearest chest within CHEST_RANGE tiles that has
// room and takes it; with no chest to take it, it falls on the ground by the bed as if the farmer had harvested by hand.
// Giant crops are left for a person: they are a moment worth being there for.

import { TILE } from '../config';
import { BUILDINGS } from '../data/buildings';
import { takes } from '../data/filters';
import type { ItemId } from '../data/items';
import { giantBlock, harvestOne, invPut, invSum } from './machines';
import type { Sim } from './sim';
import type { BuildE } from './types';
import { storageOf } from './uber';

export const HARVEST_RANGE = 2;
export const CHEST_RANGE = 3;
export const HARVEST_EVERY = 4;      // seconds between beds

const dist = (sim: Sim, a: BuildE, b: BuildE) => {
    const p = sim.center(a), q = sim.center(b);
    return Math.hypot(p.x - q.x, p.y - q.y) / TILE;
};

/** The chest that would take this item from this arm, if any. */
function chestFor (sim: Sim, arm: BuildE, item: ItemId): BuildE | null {
    let best: BuildE | null = null, bd = CHEST_RANGE + 0.01;
    for (const b of sim.ents('bld')) {
        const def = BUILDINGS[b.kind];
        if (!def.storage || def.grave || invSum(b.inv) >= storageOf(b) || !takes(b.fl, item)) continue;
        const d = dist(sim, arm, b);
        if (d < bd) { bd = d; best = b; }
    }
    return best;
}

export function step (sim: Sim, dt: number) {
    const arms = sim.buildings('harvester');
    if (!arms.length) return;
    for (const arm of arms) {
        arm.prog = (arm.prog ?? 0) + dt;
        if (arm.prog < HARVEST_EVERY) continue;
        const owner = arm.by ? sim.s.players[arm.by] : undefined;
        if (!owner) { arm.prog = 0; continue; }
        const bed = sim.buildings('bed').find((b) => b.crop === 2 && !!b.plant && dist(sim, arm, b) <= HARVEST_RANGE && !giantBlock(sim, b));
        if (!bed) { arm.prog = HARVEST_EVERY; continue; }                  // (nothing ripe: look again next step, not after a whole wait)
        arm.prog = 0;
        const touched = new Set<BuildE>();
        harvestOne(sim, owner, bed, (item) => {
            const chest = chestFor(sim, arm, item);
            if (!chest) { const c = sim.center(bed); sim.spawnDrop(item, c.x, c.y); return; }
            invPut((chest.inv ??= {}), item, 1);
            touched.add(chest);
        });
        for (const c of touched) sim.touch(c);
        sim.touch(arm);
    }
}
