// The Museum of odd things: a display case that keeps one of every trophy, fish and gem. Donate each kind once; the shelves fill, and
// the keeper pays out at milestones.

import { ITEM_ORDER, type ItemId } from './items';

/** Everything the museum wants one of, in item order. */
export const MUSEUM_ITEMS: ItemId[] = ITEM_ORDER.filter((id) => id.startsWith('trophy_') || id.startsWith('fish_') && !id.startsWith('fish_pie') || id.startsWith('gem_'));
export const MUSEUM_SET = new Set<ItemId>(MUSEUM_ITEMS);

/** Prizes for reaching a number of donated kinds. */
export const MUSEUM_PRIZES: { at: number; coin: number; item?: [ItemId, number] }[] = [
    { at: 5, coin: 100 },
    { at: 10, coin: 250 },
    { at: 20, coin: 600, item: ['potion_vigor', 1] },
    { at: 30, coin: 1200, item: ['crate_wood', 2] },
    { at: MUSEUM_ITEMS.length, coin: 3000 },
];
