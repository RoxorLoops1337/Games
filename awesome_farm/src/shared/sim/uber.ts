// The Uber Chest: every Uber Chest in the world opens the same store, shared by the whole farm, and each one built adds
// `BUILDINGS.uberchest.storage` room to it. The store is `WorldState.uber.inv`; every Uber Chest's `inv` IS that object (linked
// when the world loads and when one is built), so every rule that works a chest (hands, inserters, creatures, crafting from
// nearby chests) works it unchanged. Two rules keep that honest: a list of chests holds at most one Uber Chest (`oneUber`,
// or the same store would count twice), and touching one touches them all (so every client sees the new contents).
// The room is `BuildE.cap` on each of them (`storageOf`). Taking the last one down keeps the store for the next one.

import { BUILDINGS } from '../data/buildings';
import type { Sim } from './sim';
import type { BuildE, Ent } from './types';

export const UBER = 'uberchest';
export const isUber = (b: { kind: string }) => b.kind === UBER;

/** A chest's room: its kind's, or for an Uber Chest the room all of them give together. Pure: the client reads it too. */
export const storageOf = (b: Pick<BuildE, 'kind' | 'cap'>) => (isUber(b) ? b.cap ?? BUILDINGS.uberchest.storage! : BUILDINGS[b.kind].storage ?? 0);

/** The same list with only its first Uber Chest (they are one store: counting two would count it twice). */
export function oneUber<T extends { kind: string }> (list: T[]): T[] {
    let seen = false;
    return list.filter((b) => !isUber(b) || (!seen && (seen = true)));
}

const ubers = (sim: Sim) => sim.buildings(UBER);

/** Point every Uber Chest at the shared store and give them all the room they add up to. */
export function link (sim: Sim) {
    const all = ubers(sim);
    if (!all.length && !sim.s.uber) return;
    const store = (sim.s.uber ??= { inv: {} });
    const cap = all.length * BUILDINGS.uberchest.storage!;
    for (const b of all) { b.inv = store.inv; b.cap = cap; sim.touch(b); }
}

/** One was built or taken down. */
export const changed = (sim: Sim, e: Ent) => { if (e.k === 'bld' && isUber(e)) link(sim); };

/** Touching one touches all, so every client sees the shared contents change. */
export function touchAll (sim: Sim) { for (const b of ubers(sim)) sim.dirty.add(b.id); }
