// Jobs, carrying: a creature on an island does not teleport what it gets, it carries it (a handful at a time) to a chest, fetches
// seeds from one before planting, and (a sorter) moves a stack from the chest it lies in to the one it belongs in. The load is
// data on the worker (`ld`); an errand is the chest it is heading for (`er`) and why (`ek`).

import { TUNING } from '../config';
import { takes } from '../data/filters';
import { BUILDINGS, SEED_IDS } from '../data/buildings';
import { workCycle, type Pet } from '../data/creatures';
import type { ItemId } from '../data/items';
import { dist } from '../geom';
import { PAL } from '../palette';
import { walkTo, type Site } from './jobs-site';
import { invDrop, invHas, invPut, invSum } from './machines';
import { grantPetXp, STASH_RADIUS, stashAt } from './petlib';
import * as quests from './quests';
import type { Sim } from './sim';
import type { BuildE, CritE } from './types';

// ── carrying ────────────────────────────────────────────────────────────────
// A creature on an island does not teleport what it gets: it carries it (a handful at a time) to a chest, and for farming
// it fetches seeds from a chest first, then walks to the beds and plants them. The load is data on the worker (`ld`).
export const CARRY = 12;
export const carries = (site: Site) => site.post && !!site.stores;
export const loadN = (c: CritE) => (c.ld ?? []).reduce((a, [, n]) => a + n, 0);
const loadHas = (c: CritE, item: string) => (c.ld ?? []).find(([i]) => i === item)?.[1] ?? 0;
export const loadSeed = (c: CritE) => SEED_IDS.find((s) => loadHas(c, s) > 0);
function addLoad (c: CritE, item: string, n: number) {
    if (n <= 0) return;
    c.ld ??= [];
    const row = c.ld.find(([i]) => i === item);
    if (row) row[1] += n; else c.ld.push([item, n]);
}
function takeLoad (c: CritE, item: string, n: number) {
    const row = c.ld?.find(([i]) => i === item);
    if (!row) return 0;
    const t = Math.min(n, row[1]);
    row[1] -= t;
    c.ld = c.ld!.filter(([, k]) => k > 0);
    if (!c.ld.length) c.ld = undefined;
    return t;
}
/** What was in a worker's hands goes into the nearest chest (or onto the ground) when it stops work. */
export function dropLoad (sim: Sim, c: CritE) {
    for (const [item, n] of c.ld ?? []) stashAt(sim, c.x, c.y, STASH_RADIUS, item as ItemId, n, { spill: true });
    c.ld = undefined; c.er = undefined; c.ek = undefined;
}
/** The same site, but what the worker gets goes into its hands and the seeds it plants come out of them. */
export function carrySite (c: CritE, site: Site): Site {
    return {
        ...site,
        put: (item, n, x, y) => { if (item === 'coin') site.put(item, n, x, y); else addLoad(c, item, n); },
        seed: () => loadSeed(c),
        takeSeed: (s) => takeLoad(c, s, 1) > 0,
    };
}
/** Set off for the nearest chest that can take things (kind 0) or that holds seeds (kind 1). */
export function startErrand (sim: Sim, c: CritE, site: Site, kind: 0 | 1): boolean {
    let best: BuildE | undefined, bd = Infinity;
    for (const s of site.stores!()) {
        const ok = kind === 0 ? (BUILDINGS[s.kind].storage ?? 0) - invSum(s.inv) > 0 && (c.ld ?? []).some(([item]) => takes(s.fl, item as ItemId)) : SEED_IDS.some((id) => invHas(s.inv, id) > 0);
        if (!ok) continue;
        const cc = sim.center(s), d = dist(cc.x, cc.y, c.x, c.y);
        if (d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    c.er = best.id; c.ek = kind; c.jt = undefined; c.jp = 0; c.jq = 0;
    c.ac = kind === 0 ? 'carry' : 'fetch';
    return true;
}
/** At the chest, sorting (kind 2): pick the stack up, then head for the chest it belongs in. */
function errandPick (sim: Sim, c: CritE, chest: BuildE, at: { x: number; y: number }) {
    const item = c.ei as ItemId, n = Math.min(c.en ?? 0, invHas(chest.inv, item), CARRY - loadN(c));
    if (n > 0) {
        invDrop(chest.inv!, item, n); addLoad(c, item, n); sim.touch(chest); sim.fx('petWork', at.x, at.y);
        if (c.et !== undefined && sim.s.ents[c.et]) { c.er = c.et; c.ek = 3; }
    }
    c.ei = undefined; c.en = undefined;
    if (c.er === undefined) c.et = undefined;
}

/** At the chest, sorting (kind 3): put the stack in its chest (whatever does not fit goes to the nearest chest with room). */
function errandPlace (sim: Sim, c: CritE, site: Site, pet: Pet, chest: BuildE, at: { x: number; y: number }) {
    let moved = 0;
    const room = (BUILDINGS[chest.kind].storage ?? 0) - invSum(chest.inv);
    let left = room;
    for (const [item, n] of [...(c.ld ?? [])]) {
        const put = takes(chest.fl, item as ItemId) ? Math.min(n, left) : 0;
        if (put > 0) { chest.inv ??= {}; invPut(chest.inv, item as ItemId, put); takeLoad(c, item, put); left -= put; moved += put; }
    }
    for (const [item, n] of [...(c.ld ?? [])]) { const put = stashAt(sim, at.x, at.y, STASH_RADIUS, item as ItemId, n); if (put > 0) { takeLoad(c, item, put); moved += put; } }
    if (moved > 0) {
        sim.touch(chest);
        sim.fx('petWork', at.x, at.y);
        pet.pn = (pet.pn ?? 0) + moved;
        quests.count(site.owner, 'petwork'); quests.count(site.owner, 'petwork:sort');
        grantPetXp(sim, site.owner, pet, 2, c, true);
    }
    c.et = undefined;
    c.js = Math.max(0.3, workCycle(pet, 'sort', sim.derivedOf(site.owner).mods.work ?? 0) / (TUNING.postSpeed * 2));
}

/** At the chest, carrying (kind 0): put everything in its hands away. */
function errandStore (sim: Sim, c: CritE, site: Site, at: { x: number; y: number }) {
    let moved = 0;
    for (const [item, n] of [...(c.ld ?? [])]) {
        const put = stashAt(sim, at.x, at.y, STASH_RADIUS, item as ItemId, n);
        if (put > 0) { takeLoad(c, item, put); moved += put; }
    }
    if (moved > 0) {
        sim.fx('petWork', at.x, at.y);
        sim.float(at.x, at.y - 14, `+${moved} stored`, PAL.lime, site.owner.id);
    }
}

/** At the chest, fetching (kind 1): take a handful of the seed it holds most of, one for each empty bed on the island. */
function errandSeeds (sim: Sim, c: CritE, site: Site, chest: BuildE, at: { x: number; y: number }) {
    const seed = SEED_IDS.filter((s) => invHas(chest.inv, s) > 0).sort((a, b) => invHas(chest.inv, b) - invHas(chest.inv, a))[0];
    if (!seed) return;
    let empty = 0;
    for (const b of sim.buildings('bed')) { const bc = sim.center(b); if ((b.crop ?? -1) < 0 && site.d(bc.x, bc.y) <= site.valid) empty++; }
    const n = Math.min(invHas(chest.inv, seed), empty, CARRY - loadN(c), 8);
    if (n > 0) { invDrop(chest.inv!, seed, n); addLoad(c, seed, n); sim.touch(chest); sim.fx('petWork', at.x, at.y); }
}

/** Walk to the chest; at the chest, do the errand (`ek`: 0 put everything in, 1 fetch seeds, 2 pick a stack up to sort, 3 put it where it belongs). Returns true while busy. */
export function errandStep (sim: Sim, c: CritE, site: Site, pet: Pet, dt: number): boolean {
    const chest = c.er !== undefined ? sim.s.ents[c.er] : undefined;
    if (!chest || chest.k !== 'bld' || !BUILDINGS[chest.kind].storage) { c.er = undefined; c.ek = undefined; return false; }
    const at = sim.center(chest);
    c.ac = c.ek === 2 ? 'sortpick' : c.ek === 3 ? 'sortput' : c.ek === 1 ? 'fetch' : 'carry';
    if (walkTo(sim, c, pet, at.x, at.y, dt, 17)) return true;
    c.vx = 0; c.vy = 0;
    const kind = c.ek;
    c.er = undefined; c.ek = undefined; c.js = 0.2;
    if (kind === 2) errandPick(sim, c, chest, at);
    else if (kind === 3) errandPlace(sim, c, site, pet, chest, at);
    else if (kind === 0) errandStore(sim, c, site, at);
    else if (kind === 1) errandSeeds(sim, c, site, chest, at);
    c.st = 3; c.w = 0.4; c.wk = 'haul'; c.tx = at.x; c.ty = at.y;
    sim.touch(c);
    return true;
}
