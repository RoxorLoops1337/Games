// The Bed: where a farmer wakes up after a fall, instead of at home. Placing a bed makes it yours, and so does pressing E on any bed;
// a farmer has one wake-up spot (`PlayerS.bed`, a building id), so a new bed moves it. When the bed is gone (or down in the caves) the
// farmer wakes at home as before. An outpost far from home becomes possible.

import { PAL } from '../palette';
import type { Sim } from './sim';
import type { BuildE, PlayerS } from './types';

/** Make a bed the farmer's wake-up spot. */
export function setBed (sim: Sim, p: PlayerS, b: BuildE) {
    p.bed = b.id;
    const c = sim.center(b);
    sim.fx('bedSet', c.x, c.y - 4, p.id);
    sim.float(c.x, c.y - 22, 'This is where you wake up now', PAL.lime, p.id);
}

/** Where a farmer wakes after a fall: beside their bed if it still stands (on the surface), else null (at home). */
export function wakeSpot (sim: Sim, p: PlayerS): { tx: number; ty: number } | null {
    if (p.bed === undefined) return null;
    const b = sim.s.ents[p.bed];
    if (b?.k !== 'bld' || b.kind !== 'sleepbed' || sim.world.isUnder(b.ty)) { delete p.bed; return null; }
    return sim.nearestFree(b.tx + 1, b.ty + 1, 4) ?? sim.nearestFree(b.tx - 1, b.ty, 4);
}
