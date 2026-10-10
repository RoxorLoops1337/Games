// Loot and luck: what is in a crate, what is on the Fortune Wheel, what a buried treasure holds, and how often
// fortune smiles. Everything here is data: sim/fortune.ts rolls it, the client shows it.

import { PAL } from '../palette';
import type { ItemId, Rarity, Res } from './items';

export type CrateTier = 'wood' | 'silver' | 'gold' | 'mythic';
export const CRATE_TIERS: CrateTier[] = ['wood', 'silver', 'gold', 'mythic'];
export const CRATE_ITEM: Record<CrateTier, ItemId> = { wood: 'crate_wood', silver: 'crate_silver', gold: 'crate_gold', mythic: 'crate_mythic' };

/** One thing a roll can give: item (or coins), how many (before the crate's multiplier), and its weight in the rarity class. */
interface LootRow { item: Res; min: number; max: number; w: number }

/** What a roll of each rarity can hold. Stackables grow with the crate's tier; gear comes one at a time. */
export const LOOT_POOL: Record<Rarity, LootRow[]> = {
    0: [
        { item: 'coin', min: 12, max: 30, w: 6 }, { item: 'wood', min: 6, max: 12, w: 4 }, { item: 'stone', min: 6, max: 12, w: 4 }, { item: 'coal', min: 4, max: 8, w: 3 },
        { item: 'fiber', min: 4, max: 8, w: 3 }, { item: 'plank', min: 3, max: 6, w: 3 }, { item: 'brick', min: 2, max: 4, w: 2 }, { item: 'glass', min: 2, max: 4, w: 2 },
        { item: 'seed_wheat', min: 3, max: 5, w: 2 }, { item: 'seed_carrot', min: 2, max: 4, w: 2 }, { item: 'seed_pumpkin', min: 2, max: 3, w: 1 }, { item: 'berry', min: 4, max: 8, w: 2 },
        { item: 'bait', min: 4, max: 8, w: 2 }, { item: 'rope', min: 2, max: 4, w: 2 },
    ],
    1: [
        { item: 'relic_ember_chip', min: 1, max: 1, w: 1 }, { item: 'relic_frost_chip', min: 1, max: 1, w: 1 }, { item: 'relic_vine_chip', min: 1, max: 1, w: 1 }, { item: 'relic_iron_chip', min: 1, max: 1, w: 1 }, { item: 'relic_spirit_chip', min: 1, max: 1, w: 1 },
        { item: 'coin', min: 45, max: 90, w: 6 }, { item: 'ironbar', min: 2, max: 4, w: 4 }, { item: 'copperbar', min: 2, max: 4, w: 3 }, { item: 'gear', min: 2, max: 4, w: 3 },
        { item: 'wire', min: 2, max: 4, w: 2 }, { item: 'goldore', min: 2, max: 4, w: 3 }, { item: 'potion_heal', min: 1, max: 2, w: 3 }, { item: 'potion_energy', min: 1, max: 2, w: 2 },
        { item: 'potion_swift', min: 1, max: 2, w: 2 }, { item: 'potion_might', min: 1, max: 1, w: 2 }, { item: 'potion_guard', min: 1, max: 1, w: 2 }, { item: 'treat', min: 2, max: 3, w: 3 }, { item: 'potion_study', min: 1, max: 2, w: 2 },
        { item: 'pod', min: 2, max: 3, w: 3 }, { item: 'bread', min: 2, max: 3, w: 2 }, { item: 'cloth', min: 2, max: 3, w: 2 }, { item: 'bottle', min: 1, max: 1, w: 2 },
    ],
    2: [
        { item: 'relic_ember_shard', min: 1, max: 1, w: 1 }, { item: 'relic_frost_shard', min: 1, max: 1, w: 1 }, { item: 'relic_vine_shard', min: 1, max: 1, w: 1 }, { item: 'relic_iron_shard', min: 1, max: 1, w: 1 }, { item: 'relic_spirit_shard', min: 1, max: 1, w: 1 },
        { item: 'coin', min: 130, max: 240, w: 6 }, { item: 'goldbar', min: 1, max: 3, w: 4 }, { item: 'steel', min: 1, max: 2, w: 3 }, { item: 'circuit', min: 1, max: 2, w: 2 },
        { item: 'potion_mend', min: 1, max: 2, w: 2 }, { item: 'potion_vigor', min: 1, max: 1, w: 2 }, { item: 'potion_night', min: 1, max: 1, w: 2 }, { item: 'pod_great', min: 1, max: 2, w: 3 }, { item: 'potion_insight', min: 1, max: 1, w: 2 }, { item: 'potion_kin', min: 1, max: 2, w: 2 },
        { item: 'rockheart', min: 1, max: 2, w: 1 }, { item: 'frostshard', min: 1, max: 2, w: 1 }, { item: 'shroud', min: 1, max: 2, w: 1 }, { item: 'koi_sashimi', min: 1, max: 1, w: 1 },
        { item: 'charm_lucky', min: 1, max: 1, w: 1 }, { item: 'charm_swift', min: 1, max: 1, w: 1 }, { item: 'charm_vital', min: 1, max: 1, w: 1 },
    ],
    3: [
        { item: 'relic_ember_core', min: 1, max: 1, w: 1 }, { item: 'relic_frost_core', min: 1, max: 1, w: 1 }, { item: 'relic_vine_core', min: 1, max: 1, w: 1 }, { item: 'relic_iron_core', min: 1, max: 1, w: 1 }, { item: 'relic_spirit_core', min: 1, max: 1, w: 1 },
        { item: 'coin', min: 360, max: 620, w: 6 }, { item: 'crystal', min: 2, max: 4, w: 4 }, { item: 'pod_ultra', min: 1, max: 1, w: 2 }, { item: 'rift_shard', min: 3, max: 6, w: 3 }, { item: 'potion_memory', min: 1, max: 2, w: 2 },
        { item: 'pearl', min: 1, max: 2, w: 2 }, { item: 'core', min: 1, max: 1, w: 1 }, { item: 'bag_pack', min: 1, max: 1, w: 1 }, { item: 'bag_frame', min: 1, max: 1, w: 1 },
        { item: 'helm_crystal', min: 1, max: 1, w: 1 }, { item: 'staff_crystal', min: 1, max: 1, w: 1 }, { item: 'pick_crystal', min: 1, max: 1, w: 1 },
    ],
    4: [
        { item: 'coin', min: 1500, max: 2500, w: 5 }, { item: 'lantern_shard', min: 1, max: 1, w: 5 }, { item: 'rift_core', min: 1, max: 2, w: 3 }, { item: 'core', min: 2, max: 3, w: 2 },
        { item: 'pod_ultra', min: 3, max: 3, w: 2 },
    ],
};

interface CrateDef {
    name: string;
    color: number;
    rolls: [number, number];                       // how many things come out
    cls: [number, number, number, number, number]; // odds of each rarity class for a roll
    mul: number;                                    // stackables are this many times bigger
    floor?: Rarity;                                 // one roll is at least this good
    shard?: number;                                 // chance of a Lantern Shard on top
}

export const CRATES: Record<CrateTier, CrateDef> = {
    wood:   { name: 'Wooden Crate', color: PAL.wood,   rolls: [2, 3], cls: [64, 28, 7, 1, 0],    mul: 1 },
    silver: { name: 'Silver Crate', color: PAL.pebble, rolls: [3, 4], cls: [35, 40, 20, 4.5, 0.5], mul: 1.3 },
    gold:   { name: 'Golden Crate', color: PAL.gold,   rolls: [4, 5], cls: [10, 30, 40, 18, 2],   mul: 1.7, floor: 2, shard: 0.3 },
    mythic: { name: 'Mythic Crate', color: PAL.plum,   rolls: [5, 6], cls: [0, 15, 35, 40, 10],   mul: 2.2, floor: 3, shard: 1 },
};

/** Silver crates and better: after this many without an epic find, the next one holds one. */
export const CRATE_PITY = 8;

// ── the Fortune Wheel ───────────────────────────────────────────────────────
interface Wedge {
    id: string;
    label: string;
    w: number;                                       // odds (also its share of the wheel, though tiny ones are drawn wider)
    color: number;
    kind: 'coin' | 'items' | 'crate' | 'jackpot' | 'bust';
    mul?: number;                                    // coins: this many times the stake
    items?: [Res, number][];
    crate?: CrateTier;
}

/** Clockwise from the top. The jackpot's odds grow with every paid spin that misses it. */
export const WHEEL: Wedge[] = [
    { id: 'bust',    label: 'Oops',    w: 13,  color: PAL.slate,   kind: 'bust', mul: 0.2 },
    { id: 'c05',     label: '½×', w: 17, color: PAL.sea,   kind: 'coin', mul: 0.5 },
    { id: 'potions', label: 'Potions', w: 7,   color: PAL.blossom, kind: 'items', items: [['potion_heal', 2], ['potion_energy', 2]] },
    { id: 'c1',      label: '1×', w: 14,  color: PAL.lime,    kind: 'coin', mul: 1 },
    { id: 'crate_w', label: 'Crate',   w: 9,   color: PAL.wood,    kind: 'crate', crate: 'wood' },
    { id: 'c2',      label: '2×', w: 8,   color: PAL.pumpkin, kind: 'coin', mul: 2 },
    { id: 'pods',    label: 'Pods',    w: 6,   color: PAL.foam,    kind: 'items', items: [['pod', 3], ['treat', 3]] },
    { id: 'c5',      label: '5×', w: 3,   color: PAL.berry,   kind: 'coin', mul: 5 },
    { id: 'crate_s', label: 'Silver',  w: 3.5, color: PAL.pebble,  kind: 'crate', crate: 'silver' },
    { id: 'bars',    label: 'Bars',    w: 5,   color: PAL.stone,   kind: 'items', items: [['ironbar', 4], ['goldbar', 1]] },
    { id: 'c12',     label: '12×', w: 0.8, color: PAL.gold,   kind: 'coin', mul: 12 },
    { id: 'crate_g', label: 'Golden',  w: 1,   color: PAL.gold,    kind: 'crate', crate: 'gold' },
    { id: 'jackpot', label: 'JACKPOT', w: 0.4, color: PAL.plum,    kind: 'jackpot' },
];

/** The wheel's layout in turns (0..1) clockwise from the top: start and end of every wedge. Tiny wedges are drawn wider so you can see them. */
export function wheelSpans (min = 0.024): [number, number][] {
    const total = WHEEL.reduce((a, w) => a + w.w, 0);
    const raw = WHEEL.map((w) => Math.max(min, w.w / total));
    const sum = raw.reduce((a, b) => a + b, 0);
    let t = 0;
    return raw.map((r) => { const a = t; t += r / sum; return [a, t] as [number, number]; });
}

export const WHEEL_FREE_STAKE = 50;             // what the coin multipliers are worth on the free spin
export const WHEEL_JACKPOT_PITY = 0.07;         // extra odds per paid spin since the last jackpot
export const wheelPrice = (paidToday: number) => Math.min(400, 40 + 20 * paidToday);
export const JACKPOT_COIN_MUL = 20;

/** Double or nothing. */
export const GAMBLE_ODDS = 0.45;
export const GAMBLE_MAX_CHAIN = 4;
export const GAMBLE_MAX_COINS = 20000;

// ── the other ways luck turns up ────────────────────────────────────────────
export const LUCK = {
    strike: 0.04,         // every node you break: chance of a Lucky Find
    golden: 0.012,        // a node that grows is golden (it drops three times as much and a prize on top)
    goldenMul: 3,
    bury: 0.3,            // each owned island, each dawn: chance a treasure mound appears (one at a time per island)
    bottle: 0.06,         // a catch: chance a bottle came up on the line too
    shardDig: 0.05,       // a buried treasure: chance of a Lantern Shard
};

/** Crates from the monsters you beat: [tier, chance] by the monster's tier; elites are one rung better and twice as likely. */
export const MOB_CRATE: [CrateTier, number][] = [['wood', 0.015], ['wood', 0.03], ['wood', 0.06], ['silver', 0.06], ['silver', 0.12]];
/** Bosses always leave a crate (and sometimes a better one). */
export const BOSS_CRATE: { guaranteed: CrateTier; bonus: CrateTier; bonusChance: number } = { guaranteed: 'gold', bonus: 'mythic', bonusChance: 0.2 };

/** Titan nodes: every farmer who helped fell one rolls for a crate, best first (the first that comes up is the one). These are the chances for a lone hand: they are multiplied by the payout's hands multiplier (×1.5 with two, up to ×2.5 with four) and by luck. */
export const TITAN_CRATE: [CrateTier, number][] = [['silver', 0.12], ['wood', 0.45]];
