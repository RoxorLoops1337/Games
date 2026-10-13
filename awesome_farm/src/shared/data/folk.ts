// The island folk who move into cottages: a name and a trade each. Press E at their door once a day and they give you something
// of their trade; the more days you visit, the better the gift (data only: sim/cottage.ts does the moving in and the giving).

import type { ItemId } from './items';

export const FOLK_NAMES = ['Mira', 'Tobin', 'Wren', 'Odo', 'Pippa', 'Bram', 'Nell', 'Cass', 'Fenn', 'Lark', 'Hob', 'Sage'];

export interface Trade { id: string; name: string; line: string; gifts: [ItemId, number, number][] }

export const TRADES: Trade[] = [
    { id: 'baker', name: 'Baker', line: 'still warm from the oven', gifts: [['bread', 1, 2], ['flour', 2, 4]] },
    { id: 'fisher', name: 'Fisher', line: 'caught this morning', gifts: [['fish_carp', 1, 2], ['fish_perch', 1, 2], ['bait', 2, 4]] },
    { id: 'miner', name: 'Miner', line: 'dug out of the deep', gifts: [['iron', 2, 4], ['coal', 2, 4], ['stone', 4, 8]] },
    { id: 'gardener', name: 'Gardener', line: 'from the back garden', gifts: [['carrot', 2, 4], ['pumpkin', 1, 2], ['seed_wheat', 2, 4]] },
    { id: 'weaver', name: 'Weaver', line: 'fresh off the loom', gifts: [['cloth', 1, 2], ['rope', 2, 4], ['fiber', 3, 6]] },
    { id: 'beekeeper', name: 'Beekeeper', line: 'golden and slow', gifts: [['honey', 1, 2], ['berry', 3, 6]] },
];

/** How many visits (days a gift was given) make a friend: from then on the gift is bigger. */
export const FRIEND_AT = 5;

/** Hearts a villager shows: one for every HEART_EVERY friendship points, up to MAX_HEARTS. */
export const HEART_EVERY = 2;
export const MAX_HEARTS = 5;
export const hearts = (v: number) => Math.min(MAX_HEARTS, Math.floor(v / HEART_EVERY));

/** What a villager may ask for at dawn (an item and how many); bringing it earns REQUEST_FRIEND friendship points and REQUEST_COINS coins. */
export const WISHES: [ItemId, number][] = [['bread', 2], ['carrot', 4], ['fish_carp', 2], ['honey', 1], ['plank', 6], ['stone', 10], ['fiber', 8], ['berry', 6]];
export const REQUEST_FRIEND = 2;
export const REQUEST_COINS = 25;
