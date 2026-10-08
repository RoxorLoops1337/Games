// What the Crafting and Build windows list. A new farmer sees a short list; categories appear as the skill tree
// unlocks them (an Anvil once you know Smithing, Power once you know Power), so nothing is overwhelming at first.
// Locked recipes and buildings inside a listed category still show with a padlock, so you can see what is coming.

import { BUILD_CATS, BUILD_ORDER, BUILDINGS, type BuildCat, type StationId } from '../data/buildings';
import type { PlayerS } from './types';
import { hasUnlock } from './stats';

/** The crafting stations to list, in the order given: your hands, any station you are standing at, and every station whose building you have unlocked. */
export function listedStations (p: PlayerS, all: readonly StationId[], near: (st: StationId) => boolean): StationId[] {
    return all.filter((st) => st === 'hand' || near(st) || BUILD_ORDER.some((b) => BUILDINGS[b].station === st && hasUnlock(p, BUILDINGS[b].req)));
}

/** The build categories to list: those with at least one building you can already build. */
export function listedBuildCats (p: PlayerS): BuildCat[] {
    return BUILD_CATS.filter((c) => BUILD_ORDER.some((b) => BUILDINGS[b].cat === c.id && hasUnlock(p, BUILDINGS[b].req))).map((c) => c.id);
}
