// Petting your companion. Press E (USE on a phone) beside the creature that walks with you and nothing else is in reach: it
// hops for joy, hearts float up, and it grows a little fonder of you (a few pets a day count; more are lovely but earn nothing
// more until tomorrow). From `GIFT_AT` affection, the first pet of each day makes it dig something up for you.
//
// The server decides everything: the companion must be yours and beside you, and a pet is refused inside a second of the last.
// Gifts are rolled with the farmer's luck dice (sim/fortune.ts `luckRng`), never `sim.rng`, so a gift cannot shift the world.
// The tables, the daily cap and the names of the levels are data/bond.ts.

import { TUNING } from '../config';
import { petLuck, type Pet } from '../data/creatures';
import { AFFECTION_MAX, AFFECTION_PER_PAT, affectionOf, GIFT_AT, GIFTS, giftOdds, levelOf, PATS_PER_DAY } from '../data/bond';
import { PAL } from '../palette';
import { luckRng } from './fortune';
import { findPet } from './petlib';
import * as quests from './quests';
import type { Sim } from './sim';
import { derived } from './stats';
import type { CritE, PlayerS } from './types';

/** The creature walking beside this farmer, in the world (not just on the roster). */
function companionOf (sim: Sim, p: PlayerS): CritE | undefined {
    if (!p.comp) return undefined;
    for (const e of sim.ents('crit')) if (e.mode === 1 && e.owner === p.id && e.pid === p.comp) return e;
    return undefined;
}

/** Can this farmer pet their companion right now, and how many of today's pets still earn affection? (The client reads it for its prompt.) */
export function patInfo (p: PlayerS, day: number) {
    const pet = p.comp ? findPet(p, p.comp) : undefined;
    if (!pet) return null;
    const left = pet.pt?.d === day ? Math.max(0, PATS_PER_DAY - pet.pt.n) : PATS_PER_DAY;
    const aff = affectionOf(pet);
    return { pet, aff, earns: aff < AFFECTION_MAX && left > 0, gift: aff >= GIFT_AT && pet.pt?.g !== day };
}

export function cmdPat (sim: Sim, p: PlayerS) {
    if (sim.s.paused || p.downed > 0) return;
    const pet = p.comp ? findPet(p, p.comp) : undefined;
    if (!pet || pet.nest !== undefined) return;
    if ((sim.patT[p.id] ?? -9) + TUNING.patCooldown > sim.s.time) return;
    sim.patT[p.id] = sim.s.time;
    const c = companionOf(sim, p);
    if (!c) return;
    if (Math.hypot(c.x - p.x, c.y - p.y) > TUNING.patReach) { sim.deny(p, 'Too far away'); return; }

    const day = sim.s.day;
    const pt = (pet.pt ??= { d: day, n: 0, g: 0 });
    if (pt.d !== day) { pt.d = day; pt.n = 0; }
    const before = affectionOf(pet);
    const earned = before < AFFECTION_MAX && pt.n < PATS_PER_DAY;
    if (earned) { pt.n++; pet.aff = Math.min(AFFECTION_MAX, before + AFFECTION_PER_PAT); }
    const after = affectionOf(pet);

    // the pat itself: a hop, hearts, the sound and a little burst
    sim.fx('pat', c.x, c.y - 8, p.id);
    sim.events.push({ e: 'hop', id: c.id, x: c.x, y: c.y });
    for (const [dx, dy, col] of [[-7, -17, PAL.blossom], [1, -23, PAL.berry], [8, -15, PAL.blossom]] as const) sim.float(c.x + dx, c.y + dy, '♥', col);
    if (earned) sim.float(p.x, p.y - 30, `${pet.name}  ♥ ${after}`, levelOf(after).color, p.id, 'aff');
    else sim.float(p.x, p.y - 30, after >= AFFECTION_MAX ? `${pet.name} adores you` : `${pet.name} has had plenty today`, PAL.pebble, p.id, 'aff');
    quests.count(p, 'pat');

    // a new name for the bond
    const was = levelOf(before), now = levelOf(after);
    if (now !== was) {
        sim.fx('petLevel', c.x, c.y - 12, p.id);
        sim.banner(`${pet.name} is ${now.name} now`, now.line, now.color, p.id);
    }

    // a fond creature digs something up, once a day
    if (after >= GIFT_AT && pt.g !== day) { pt.g = day; dig(sim, p, pet, c, after); }
}

/** The day's gift: small things from the ground most days, a nice find now and then, a treasure rarely; luck and affection help a little. */
function dig (sim: Sim, p: PlayerS, pet: Pet, c: CritE, affection: number) {
    const rng = luckRng(sim, p);
    const odds = giftOdds(affection), luck = derived(p).luck + petLuck(pet);
    const rare = odds.rare * (1 + luck * 3), nice = odds.nice * (1 + luck);
    const roll = rng.next();
    const tier = roll < rare ? 2 : roll < rare + nice ? 1 : 0;
    const rows = GIFTS[tier];
    const row = rows[Number(rng.weighted(Object.fromEntries(rows.map((x, i) => [i, x.w]))))];
    const n = rng.int(row.min, row.max);
    for (let i = 0; i < n; i++) sim.spawnDrop(row.item, c.x, c.y - 2, rng);
    sim.fx('gift', c.x, c.y - 2, p.id);
    if (tier === 2) sim.fx('lucky', c.x, c.y - 12, p.id);
    sim.float(c.x, c.y - 30, `${pet.name} dug up something!`, tier === 2 ? PAL.plum : PAL.gold, undefined, 'gift');
    quests.count(p, 'petgift');
}
