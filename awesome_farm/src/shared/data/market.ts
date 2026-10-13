// Living prices. Past the first ten a day, every unit you sell makes that kind a little cheaper for everybody (1% a unit, down to 60% of its price), and the
// dip fades by a quarter-turn each morning (`RECOVER`); one kind a day is the Hot Item and pays half again as much. Varied
// production beats flooding one good, and the market has a pulse. The state is `WorldState.mkt` (units sold, as of day `d`), the
// hot item is a pure function of the seed and the day, so a client can always work the price out.

import { hash } from '../weather';
import { ITEM_ORDER, ITEMS, type ItemId } from './items';

export const HOT_MUL = 1.5;
export const SAG_PER_UNIT = 0.01;
export const SAG_MIN = 0.6;
/** The first units of a kind sold each day (as the dent stands) cost nothing: only a real flood moves the price. */
export const SAG_FREE = 10;
/** What is left of the sold count after one morning. */
export const RECOVER = 0.7;

export interface MarketState { d: number; s: Record<string, number> }

/** Things that can be the day's Hot Item: sold at the market for something, not gear, not a seed. */
const POOL: ItemId[] = ITEM_ORDER.filter((id) => ITEMS[id].sell >= 3 && ITEMS[id].kind !== 'gear' && ITEMS[id].kind !== 'seed');

/** The day's Hot Item. */
export function hotItem (seed: string, day: number): ItemId {
    return POOL[Math.floor(hash(seed, day, 977) * POOL.length) % POOL.length];
}

/** Units of this kind that count against its price on `day` (the recorded number, faded for the mornings since). */
export function soldOn (m: MarketState | undefined, item: ItemId, day: number): number {
    const n = m?.s[item] ?? 0;
    if (!m || n <= 0) return 0;
    return n * Math.pow(RECOVER, Math.max(0, day - m.d));
}

/** The price multiplier for one more unit of this kind right now (below 1 when it has been sold a lot, 1.5 when hot). */
export function unitMul (m: MarketState | undefined, seed: string, item: ItemId, day: number, extra = 0): number {
    const sag = Math.max(SAG_MIN, 1 - Math.max(0, soldOn(m, item, day) + extra - SAG_FREE) * SAG_PER_UNIT);
    return sag * (hotItem(seed, day) === item ? HOT_MUL : 1);
}

/** What `n` units are worth in base coins (before the farmer's own sell bonus): each unit a hair cheaper than the one before. */
export function worthOf (m: MarketState | undefined, seed: string, item: ItemId, n: number, day: number): number {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += ITEMS[item].sell * unitMul(m, seed, item, day, i);
    return sum;
}

/** Record a sale (and bring the table up to the day). */
export function recordSold (m: MarketState | undefined, item: ItemId, n: number, day: number): MarketState {
    const out: MarketState = { d: day, s: {} };
    if (m) for (const k of Object.keys(m.s)) { const v = soldOn(m, k as ItemId, day); if (v >= 0.5) out.s[k] = Math.round(v * 100) / 100; }
    out.s[item] = (out.s[item] ?? 0) + n;
    return out;
}
