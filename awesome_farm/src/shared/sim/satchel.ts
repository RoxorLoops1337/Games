// The Relic Satchel: laying relics in it and picking them up (data/relics.ts says what they give). The grid grows with the farmer's level.

import { ITEMS, type ItemId } from '../data/items';
import { fits, satchelDims, type RelicDef } from '../data/relics';
import type { Sim } from './sim';
import { addItem, countOf, itemCap, takeItem } from './stats';
import type { PlayerS } from './types';

/** What an item is as a relic (undefined: it is not one). */
export const relicDef = (it: string): RelicDef | undefined => (ITEMS as Record<string, { relic?: RelicDef }>)[it]?.relic;

/** Lay a relic from the pockets in the satchel, if it is a relic you carry and the place is free. */
export function put (sim: Sim, p: PlayerS, item: ItemId, x: number, y: number, r?: 1) {
    if (!relicDef(item) || countOf(p, item) < 1) return;
    const list = p.satchel ?? (p.satchel = []);
    if (!fits(relicDef, satchelDims(p.level), list, item, x, y, r === 1 ? 1 : undefined)) { sim.deny(p, 'It does not fit there'); return; }
    takeItem(p, item, 1);
    list.push(r === 1 ? { it: item, x, y, r: 1 } : { it: item, x, y });
    sim.fx('equip', p.x, p.y - 8, p.id);
}

/** Pick the i-th relic back up. */
export function take (sim: Sim, p: PlayerS, i: number) {
    const list = p.satchel;
    if (!list || !Number.isInteger(i) || i < 0 || i >= list.length) return;
    const it = list[i].it;
    if (countOf(p, it) >= itemCap(p, it)) { sim.deny(p, 'Your pockets are full'); return; }
    list.splice(i, 1);
    addItem(p, it, 1);
    sim.fx('equip', p.x, p.y - 8, p.id);
}

/** A farmer whose grid got smaller (never happens) or whose list is damaged keeps only what fits: called when a world loads. */
export function tidy (p: PlayerS) {
    if (!p.satchel) return;
    const grid = satchelDims(p.level), kept: NonNullable<PlayerS['satchel']> = [];
    for (const r of p.satchel) if (relicDef(r.it) && fits(relicDef, grid, kept, r.it, r.x, r.y, r.r === 1 ? 1 : undefined)) kept.push(r);
    p.satchel = kept;
}
