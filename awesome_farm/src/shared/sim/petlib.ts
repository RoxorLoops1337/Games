// What every creature job shares: the roster and its caps, moving about, experience, and the chests that goods go into
// and supplies come out of. (creatures.ts, jobs.ts and the den code all stand on this; it depends on none of them.)

import { TILE } from '../config';
import { BUILDINGS } from '../data/buildings';
import { names, takes } from '../data/filters';
import { PET_MAX_LEVEL, petXpMul, petXpNeed, type Pet } from '../data/creatures';
import type { ItemId } from '../data/items';
import { dist } from '../geom';
import { PAL } from '../palette';
import { invDrop, invHas, invPut, invSum } from './machines';
import type { Sim } from './sim';
import { derived } from './stats';
import type { BuildE, CritE, PlayerS } from './types';

export const petsOf = (p: PlayerS): Pet[] => (p.pets ??= []);
export const rosterCap = (p: PlayerS) => 12 + 3 * Math.floor(derived(p).mods.creatureSlots ?? 0);      // (commands and menus: the plain `derived`)
/** How many creatures may work at once, in dens and at posts together. */
export const workSlots = (p: PlayerS) => 4 + Math.floor(derived(p).mods.creatureSlots ?? 0);
export const findPet = (p: PlayerS, id: string) => petsOf(p).find((x) => x.id === id);
/** Is this creature working somewhere (a den or a post)? */
export const isWorking = (pet: Pet) => pet.den !== undefined || pet.post !== undefined;

export function move (sim: Sim, c: CritE, dt: number, flies?: boolean) {
    const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
    if (flies) { c.x = nx; c.y = ny; return; }
    if (!sim.world.boxBlocked(nx, c.y, 3, 2)) c.x = nx; else c.vx = -c.vx * 0.4;
    if (!sim.world.boxBlocked(c.x, ny, 3, 2)) c.y = ny; else c.vy = -c.vy * 0.4;
}

/** Experience for a pet: traits, the owner's Creature XP skill, level-ups with a toast. */
export function grantPetXp (sim: Sim, owner: PlayerS | undefined, pet: Pet, amount: number, at?: { x: number; y: number }) {
    if (pet.lv >= PET_MAX_LEVEL) return;
    pet.xp += amount * petXpMul(pet) * (1 + (owner ? derived(owner).mods.creatureXp ?? 0 : 0));
    let up = 0;
    while (pet.lv < PET_MAX_LEVEL && pet.xp >= petXpNeed(pet.lv)) { pet.xp -= petXpNeed(pet.lv); pet.lv++; up++; }
    if (pet.lv >= PET_MAX_LEVEL) pet.xp = 0;
    if (up && owner) {
        pet.hp = undefined;
        if (at) sim.fx('petLevel', at.x, at.y - 10, owner.online ? owner.id : undefined);
        if (owner.online) sim.toast(owner.id, `${pet.name} reached level ${pet.lv}!`, 'k_paw', PAL.blossom);
    }
}

// ── chests ──────────────────────────────────────────────────────────────────
/** How far from a den, machine or island centre a chest still counts as "next to it". */
export const STASH_RADIUS = 9 * TILE;

const centreOf = (b: BuildE) => { const [w, h] = BUILDINGS[b.kind].size; return { x: (b.tx + w / 2) * TILE, y: (b.ty + h / 2) * TILE }; };

/** Every storage building (chests, steel chests, dens) within `radius` of a point, nearest first; `last` is tried only when the rest are full. */
export function storesNear (sim: Sim, x: number, y: number, radius: number, last?: number): BuildE[] {
    const out: { b: BuildE; d: number }[] = [];
    for (const b of sim.buildings()) {
        if (!BUILDINGS[b.kind].storage) continue;
        const c = centreOf(b), d = dist(c.x, c.y, x, y);
        if (d <= radius) out.push({ b, d: d + (b.id === last ? 1e6 : 0) });
    }
    return out.sort((a, c) => a.d - c.d).map((e) => e.b);
}

/**
 * The helpers below look the chests up with `storesNear` (a scan of every building and a sort) unless the caller hands them the list
 * (`stores`, as `storesNear` would give it for the same point, radius and `last`): a keeper's round makes a dozen such calls.
 */
type Stores = readonly BuildE[] | undefined;

/** Free space across the storage near a point (for `item`, only the chests that would take it). */
export function roomAt (sim: Sim, x: number, y: number, radius: number, last?: number, item?: ItemId, stores?: Stores): number {
    let room = 0;
    for (const s of stores ?? storesNear(sim, x, y, radius, last)) if (!item || takes(s.fl, item)) room += Math.max(0, (BUILDINGS[s.kind].storage ?? 0) - invSum(s.inv));
    return room;
}

/** How many of `item` the storage near a point holds. */
export function haveAt (sim: Sim, x: number, y: number, radius: number, item: ItemId, stores?: Stores): number {
    let n = 0;
    for (const s of stores ?? storesNear(sim, x, y, radius)) n += invHas(s.inv, item);
    return n;
}

/**
 * Put goods into the nearest storage with room. Returns how many went in; with `spill` the rest lands on the ground at the point.
 * A chest set to take this kind of thing on purpose comes first, then the open ones; a chest set to take something else is passed by.
 */
export function stashAt (sim: Sim, x: number, y: number, radius: number, item: ItemId, n: number, o: { last?: number; spill?: boolean; stores?: Stores } = {}): number {
    let left = n;
    const near = (o.stores ?? storesNear(sim, x, y, radius, o.last)).filter((s) => takes(s.fl, item));
    for (const s of [...near.filter((s) => names(s.fl, item)), ...near.filter((s) => !names(s.fl, item))]) {
        s.inv ??= {};
        const room = (BUILDINGS[s.kind].storage ?? 0) - invSum(s.inv);
        const put = Math.min(left, room);
        if (put > 0) { invPut(s.inv, item, put); left -= put; sim.touch(s); }
        if (!left) break;
    }
    if (o.spill) for (let i = 0; i < left; i++) sim.spawnDrop(item, x, y + 8);
    return n - left;
}

/** Take up to `n` of `item` out of the storage near a point. Returns how many it got. */
export function fetchAt (sim: Sim, x: number, y: number, radius: number, item: ItemId, n: number, stores?: Stores): number {
    let got = 0;
    for (const s of stores ?? storesNear(sim, x, y, radius)) {
        const have = invHas(s.inv, item);
        if (have <= 0) continue;
        const take = Math.min(have, n - got);
        invDrop(s.inv!, item, take); got += take; sim.touch(s);
        if (got >= n) break;
    }
    return got;
}
