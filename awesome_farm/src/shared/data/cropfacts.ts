// What a farmer wants to know before planting a seed: how long until it is ripe (in this season, with their skills), how much it gives,
// what that is worth at the market and how fast it earns. Pure, so the seed window and a test read the same numbers.

import { clock } from '../fmt';
import { CROPS } from './buildings';
import { ITEMS, ItemId } from './items';

interface CropFacts {
    id: ItemId;
    name: string;
    /** Seconds from planting to ripe. */
    secs: number;
    yieldMin: number;
    yieldMax: number;
    /** The average number of crops, with the season's bonus. */
    avg: number;
    /** What an average harvest sells for at the market. */
    coins: number;
    /** Coins per minute the bed is occupied: the way to compare a quick crop with a slow, rich one. */
    perMin: number;
    xp: number;
    /** The chance a harvest also gives a seed back. */
    seedBack: number;
}

/** `growMul`: the farmer's skills (derived().growMul); `seasonGrow` and `seasonYield`: the season's numbers; `sellMul`: derived().sellMul. */
interface CropEnv { growMul: number; seasonGrow: number; seasonYield: number; sellMul: number }

export function cropFacts (id: ItemId, env: CropEnv): CropFacts | null {
    const c = CROPS[id];
    if (!c) return null;
    const speed = Math.max(0.05, env.growMul * env.seasonGrow);
    const secs = (c.stageSecs * 2) / speed;                       // two growth stages from seed to ripe
    const avg = (c.yield[0] + c.yield[1]) / 2 + env.seasonYield;
    const coins = avg * ITEMS[c.out].sell * env.sellMul;
    return { id, name: c.name, secs, yieldMin: c.yield[0], yieldMax: c.yield[1], avg, coins, perMin: (coins / secs) * 60, xp: c.xp, seedBack: c.seedBack };
}

/** "1:12", "45s": a time for a card. */
export function fmtSecs (s: number): string {
    const n = Math.max(1, Math.round(s));
    return n < 60 ? `${n}s` : clock(n);
}

/** Which of these crops is the quickest and which earns the most per minute. Null when there is nothing to compare. */
export function rankCrops (list: readonly CropFacts[]): { fastest: ItemId; best: ItemId } | null {
    if (list.length < 2) return null;
    const fastest = list.reduce((a, b) => (b.secs < a.secs ? b : a));
    const best = list.reduce((a, b) => (b.perMin > a.perMin ? b : a));
    return { fastest: fastest.id, best: best.id };
}
