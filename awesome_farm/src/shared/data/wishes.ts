// Season wishes: on the first morning of every season (after the first) the farm is offered three wishes, picked from this list by
// the world's seed, and the farmers vote for one. The winner blesses every farmer of the world until the season ends: a few small,
// useful numbers (the same stat keys skills, gear and buffs use), so nobody is ever worse off and everybody gets a say.
// The rules are in sim/wish.ts.

import { Rng } from '../rng';
import { PAL } from '../palette';
import type { Mods } from './stats';

interface Wish { id: string; name: string; icon: string; color: number; blurb: string; mods: Mods }

export const WISHES: Wish[] = [
    { id: 'rains', name: 'Gentle Rains', icon: 'i_carrot', color: PAL.lime, blurb: 'The fields drink well this season.', mods: { grow: 0.25 } },
    { id: 'harvest', name: 'Heavy Harvest', icon: 'i_pumpkin', color: PAL.pumpkin, blurb: 'Every crop gives a little more.', mods: { cropYield: 1 } },
    { id: 'fair', name: 'Market Fair', icon: 'k_coin', color: PAL.gold, blurb: 'Buyers are generous and pay more for everything.', mods: { sell: 0.1 } },
    { id: 'hands', name: 'Busy Hands', icon: 'i_plank', color: PAL.wood, blurb: 'Everything you build costs less.', mods: { buildCost: -0.15 } },
    { id: 'rush', name: 'Land Rush', icon: 'k_map', color: PAL.foam, blurb: 'The sea gives up its land at a better price.', mods: { landCost: -0.15 } },
    { id: 'minds', name: 'Bright Minds', icon: 'k_star', color: PAL.plum, blurb: 'Everything you do teaches you a bit more.', mods: { xp: 0.2 } },
    { id: 'tailwind', name: 'Tailwind', icon: 'i_potion_swift', color: PAL.sea, blurb: 'A steady wind at your back.', mods: { moveSpeed: 0.12, swingSpeed: 0.05 } },
    { id: 'veins', name: 'Rich Veins', icon: 'i_iron', color: PAL.stone, blurb: 'Rock and ore give an extra piece.', mods: { ore: 1, stone: 1 } },
    { id: 'woods', name: 'Whispering Woods', icon: 'i_wood', color: PAL.leaf, blurb: 'Trees and plants give an extra piece.', mods: { wood: 1, plant: 1 } },
    { id: 'forges', name: 'Roaring Forges', icon: 'i_ironbar', color: PAL.pumpkin, blurb: 'Furnaces and machines work faster and burn less.', mods: { smelt: 0.25, fuelSave: 0.2, machineSpeed: 0.1 } },
    { id: 'kin', name: 'Kindred Spirits', icon: 'k_paw', color: PAL.blossom, blurb: 'Creatures work harder and learn faster.', mods: { work: 0.2, creatureXp: 0.25, catch: 0.1 } },
    { id: 'hunt', name: 'Hunter\'s Moon', icon: 'k_sword', color: PAL.berry, blurb: 'Monsters feel your blows, most of all at night.', mods: { dmgPct: 0.1, nightDmg: 0.15, vamp: 0.05 } },
    { id: 'clover', name: 'Four-leaf Season', icon: 'k_clover', color: PAL.lime, blurb: 'More double drops and better chests.', mods: { luck: 0.1, chestLoot: 0.15 } },
    { id: 'tide', name: 'Good Fishing', icon: 'i_rod', color: PAL.sea, blurb: 'The fish bite sooner and are easier to land.', mods: { fishSpeed: 0.3, fishLuck: 0.15 } },
];
export const WISH_BY_ID: Record<string, Wish> = Object.fromEntries(WISHES.map((w) => [w.id, w]));

/** How many wishes the farm chooses between. */
export const WISH_OPTIONS = 3;

/** Which season (0 = the first spring) a day belongs to. */
export const seasonIndex = (day: number) => Math.floor((Math.max(1, day) - 1) / 7);

/** The three wishes on offer in a season: the same three for everybody, every time, from the world's seed. */
export function wishPool (seed: string, season: number): string[] {
    const r = new Rng(`${seed}:wish:${season}`);
    return r.shuffle(WISHES.map((w) => w.id)).slice(0, WISH_OPTIONS);
}
