// The chests around you count as part of your pockets when you craft: stand at a workbench with the wood in a chest beside it
// and the planks come out of that wood. Pockets are used first, then the nearest chests. Coins are never taken from a chest.
// Pure functions over the entity list, so the server (which pays) and the craft window (which shows what you have) agree.

import { TILE } from '../config';
import { BUILDINGS } from '../data/buildings';
import type { Cost, ItemId, Res } from '../data/items';
import { invDrop, invHas } from './machines';
import { countOf, takeItem } from './stats';
import type { BuildE, Ent, PlayerS } from './types';
import { oneUber } from './uber';

/** How far from you a chest still counts (tiles are 16 px). */
export const POOL_RADIUS = 8 * TILE;

/** Storage buildings (chests, steel chests, dens) within `radius` of a point, nearest first. */
export function chestsAround (ents: Iterable<Ent>, x: number, y: number, radius = POOL_RADIUS): BuildE[] {
    const out: { b: BuildE; d: number }[] = [];
    for (const e of ents) {
        if (e.k !== 'bld' || !BUILDINGS[e.kind]?.storage) continue;
        const [w, h] = BUILDINGS[e.kind].size;
        const d = Math.hypot((e.tx + w / 2) * TILE - x, (e.ty + h / 2) * TILE - y);
        if (d <= radius) out.push({ b: e, d });
    }
    return oneUber(out.sort((a, b) => a.d - b.d || a.b.id - b.b.id).map((o) => o.b));      // (Uber Chests are one store: the nearest stands for them all)
}

/** How many of something you have, counting the chests. */
export function haveIn (p: PlayerS, chests: readonly BuildE[], res: Res): number {
    if (res === 'coin') return p.coins;
    let n = countOf(p, res);
    for (const c of chests) n += invHas(c.inv, res);
    return n;
}

export const affordIn = (p: PlayerS, chests: readonly BuildE[], cost: Cost) => (Object.entries(cost) as [Res, number][]).every(([r, n]) => haveIn(p, chests, r) >= n);

/** How many of this much a recipe could be made from pockets and chests together. */
export function timesIn (p: PlayerS, chests: readonly BuildE[], cost: Cost): number {
    let n = Infinity;
    for (const [r, c] of Object.entries(cost) as [Res, number][]) if (c > 0) n = Math.min(n, Math.floor(haveIn(p, chests, r) / c));
    return Number.isFinite(n) ? n : 0;
}

/** Pay a cost: from the pockets first, then the nearest chests. Returns the chests that were emptied a little (so the caller can touch them). */
export function payFrom (p: PlayerS, chests: readonly BuildE[], cost: Cost): BuildE[] {
    const touched = new Set<BuildE>();
    for (const [r, n] of Object.entries(cost) as [Res, number][]) {
        if (r === 'coin') { p.coins -= n; continue; }
        let need = n;
        const mine = Math.min(need, countOf(p, r));
        if (mine > 0) { takeItem(p, r, mine); need -= mine; }
        for (const c of chests) {
            if (need <= 0) break;
            const take = Math.min(need, invHas(c.inv, r as ItemId));
            if (take > 0) { invDrop(c.inv!, r as ItemId, take); need -= take; touched.add(c); }
        }
    }
    return [...touched];
}
