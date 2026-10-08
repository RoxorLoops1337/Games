// The bond with your companion: press E beside it to pet it. A pet earns a little affection (a few pets a day), the affection
// has names, and a creature that is fond enough digs something up for you once a day. The rules are sim/bond.ts; the numbers
// for reach and the gap between two pets are in TUNING (patReach, patCooldown).

import { PAL } from '../palette';
import { BUILDINGS, type BuildingKind } from './buildings';
import type { Pet } from './creatures';
import type { Res } from './items';

export const AFFECTION_MAX = 100;
/** Pets a day (per creature) that earn affection; more are still lovely, they just earn nothing more until tomorrow. */
export const PATS_PER_DAY = 5;
export const AFFECTION_PER_PAT = 1;
/** From this much affection the creature digs up a gift the first time you pet it each day. */
export const GIFT_AT = 40;

interface AffectionLevel { id: string; name: string; at: number; color: number; line: string }
/** Shy, Friendly, Fond, Devoted: from where the numbers start. (Gifts begin at Fond: `GIFT_AT` is its threshold.) */
export const AFFECTION_LEVELS: AffectionLevel[] = [
    { id: 'shy',      name: 'Shy',      at: 0,  color: PAL.pebble,  line: 'Still getting used to you.' },
    { id: 'friendly', name: 'Friendly', at: 10, color: PAL.lime,    line: 'Comes running when you are near.' },
    { id: 'fond',     name: 'Fond',     at: 40, color: PAL.blossom, line: 'Digs up a small gift for you every day.' },
    { id: 'devoted',  name: 'Devoted',  at: 75, color: PAL.gold,    line: 'Would follow you anywhere. Its gifts are the best.' },
];

/** A creature's affection, always a whole number from 0 to 100 (a creature from an older save has none). */
export const affectionOf = (pet: Pick<Pet, 'aff'>) => Math.max(0, Math.min(AFFECTION_MAX, Math.floor(Number(pet.aff) || 0)));

export function levelOf (affection: number): AffectionLevel {
    let out = AFFECTION_LEVELS[0];
    for (const l of AFFECTION_LEVELS) if (affection >= l.at) out = l;
    return out;
}
/** The level and how far it is to the next one (`next` is null at the top). */
export function levelInfo (pet: Pick<Pet, 'aff'>) {
    const aff = affectionOf(pet), level = levelOf(aff), i = AFFECTION_LEVELS.indexOf(level);
    return { aff, level, next: AFFECTION_LEVELS[i + 1] ?? null };
}

/** Buildings with nothing to use (a campfire, a table, a lamp, a statue): standing next to one, E pets your companion instead of doing nothing. */
export const petsFirstAt = (kind: BuildingKind) => { const cat = BUILDINGS[kind]?.cat; return cat === 'decor' || cat === 'light'; };

// ── the gifts ───────────────────────────────────────────────────────────────
interface GiftRow { item: Res; min: number; max: number; w: number }
/** 0: something small from the ground. 1: a nice find. 2: a rare treasure. */
export const GIFTS: Record<0 | 1 | 2, GiftRow[]> = {
    0: [
        { item: 'seed_wheat', min: 2, max: 4, w: 3 }, { item: 'seed_carrot', min: 2, max: 3, w: 3 }, { item: 'seed_pumpkin', min: 1, max: 2, w: 2 },
        { item: 'sand', min: 3, max: 5, w: 3 }, { item: 'clay', min: 2, max: 4, w: 3 }, { item: 'mushroom', min: 1, max: 3, w: 3 },
        { item: 'berry', min: 3, max: 6, w: 3 }, { item: 'coin', min: 6, max: 14, w: 4 },
    ],
    1: [
        { item: 'treat', min: 1, max: 2, w: 3 }, { item: 'pod', min: 1, max: 2, w: 2 }, { item: 'herb', min: 2, max: 3, w: 2 },
        { item: 'bait', min: 3, max: 5, w: 2 }, { item: 'potion_energy', min: 1, max: 1, w: 2 }, { item: 'coin', min: 16, max: 28, w: 4 },
    ],
    2: [
        { item: 'crate_wood', min: 1, max: 1, w: 4 }, { item: 'crate_silver', min: 1, max: 1, w: 1 }, { item: 'pearl', min: 1, max: 1, w: 2 },
        { item: 'crystal', min: 1, max: 2, w: 2 }, { item: 'pod_great', min: 1, max: 1, w: 2 },
    ],
};

/** The odds of a nice find and of a rare treasure, before luck: they grow a little with every point of affection past the threshold. */
export const giftOdds = (affection: number) => {
    const over = Math.max(0, Math.min(AFFECTION_MAX, affection) - GIFT_AT);
    return { nice: 0.22 + 0.002 * over, rare: 0.03 + 0.0006 * over };
};
