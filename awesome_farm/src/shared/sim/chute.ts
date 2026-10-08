// The Export Chute: a belt-fed (or inserter-fed, or drill-fed) building that sells whatever arrives, at once, for coins that go
// straight to the farmer who built it (even while they are away: their record is credited) at a cut below the market price
// (TUNING.chuteCut), so selling by hand still matters. It keeps its own books (BuildE.ch) as plain JSON: a rolling minute of
// takings for the "about X coins a minute" the windows and the Factory view show, and a few coins waiting to be shown as a
// "+N" over it (at most one a second: a belt can feed it six things a second).
//
// What it will take is decided here and nowhere else (`canAccept` in factory.ts asks `chuteTakes`): it never takes gear (tools,
// weapons, armour, charms, packs), crates and bottles, or anything of the 'misc' kind (pods, treats, rods, bait, sigils,
// trophies, junk): things you keep, use or open. Materials, food, seeds and potions that have a price are fair game. A thing it
// will not take simply stays where it is (the belt does not hand it over), and the belt's status says why.

import { TUNING } from '../config';
import { ITEMS, type ItemId } from '../data/items';
import { PAL } from '../palette';
import * as quests from './quests';
import type { Sim } from './sim';
import type { BuildE, ChuteS } from './types';

/** The rolling minute is six slices of ten seconds. */
const CHUTE_SLICE = 10;
export const CHUTE_SLICES = 6;

/** Can a chute sell this kind of thing at all? */
export function chuteSells (item: ItemId): boolean {
    const d = ITEMS[item];
    return !!d && d.sell > 0 && (d.kind === 'material' || d.kind === 'food' || d.kind === 'seed' || d.kind === 'potion') && !d.gear && !d.open;
}

/** Will this chute take one more of `item` right now? (It needs a builder to pay, and obeys its filter.) */
export const chuteTakes = (b: BuildE, item: ItemId) => !!b.by && chuteSells(item) && (!b.flt || b.flt === item);

/** What one of `item` pays this farmer in a chute, in hundredths of a coin: the market price (with their selling bonus) less the chute's cut. */
const chuteCents = (sellerPrice: number) => Math.round(sellerPrice * TUNING.chuteCut * 100);

const fresh = (): ChuteS => ({ s: 0, w: new Array(CHUTE_SLICES).fill(0), p: 0, f: 0, r: 0, t0: 0 });

/** Move the books on to the slice `time` is in: the slices that have gone by drop off the old end. */
function roll (ch: ChuteS, time: number) {
    const n = Math.floor(time / CHUTE_SLICE);
    if (n <= ch.s) return;
    const gone = n - ch.s;
    ch.w = gone >= CHUTE_SLICES ? new Array(CHUTE_SLICES).fill(0) : [...new Array(gone).fill(0), ...ch.w].slice(0, CHUTE_SLICES);
    ch.s = n;
}

/** Coins paid out in the last minute, as far as the books go (they may be older than `time`: slices that have gone by do not count). */
function minuteSum (ch: ChuteS, time: number): number {
    const gone = Math.max(0, Math.floor(time / CHUTE_SLICE) - ch.s);
    let sum = 0;
    for (let i = 0; i < CHUTE_SLICES - gone; i++) sum += ch.w[i] ?? 0;
    return sum;
}

/**
 * About how many coins a minute this chute is paying right now: what it paid in the last minute, spread over the time it has
 * actually been selling (a chute that only just started is not told it earns a sixth of what it does). 0 when nothing has come.
 */
export function chuteRate (ch: ChuteS | undefined, time: number): number {
    if (!ch) return 0;
    const sum = minuteSum(ch, time);
    if (sum <= 0) return 0;
    const window = CHUTE_SLICE * (CHUTE_SLICES - 1) + (time % CHUTE_SLICE);
    return (sum * 60) / Math.max(20, Math.min(window, time - ch.t0));
}

/** Sell one `item` through this chute: false when it will not (nothing is taken). */
export function chuteSell (sim: Sim, b: BuildE, item: ItemId): boolean {
    const p = b.by ? sim.s.players[b.by] : undefined;
    if (!p || !chuteTakes(b, item)) return false;
    const ch = (b.ch ??= fresh());
    const time = sim.s.time;
    roll(ch, time);
    if (minuteSum(ch, time) <= 0) ch.t0 = time;                    // a new run of selling
    ch.r += chuteCents(ITEMS[item].sell * sim.derivedOf(p).sellMul);        // (`sellValue`, with the step's cached stats: a belt can feed it six things a second)
    const coins = Math.floor(ch.r / 100);
    ch.r -= coins * 100;
    if (coins > 0) {
        p.coins += coins;
        ch.w[0] += coins; ch.p += coins;
        sim.s.prod ??= {};
        sim.s.prod.coin = (sim.s.prod.coin ?? 0) + coins;
        quests.count(p, 'sell', coins);                       // (what a chute sells counts as selling goods)
    }
    sim.touch(b);
    return true;
}

/** Every step: show the coins taken since the last "+N" (the number floats up over the chute, with one quiet clink). */
export function chuteStep (sim: Sim, b: BuildE) {
    const ch = b.ch;
    if (!ch || ch.p <= 0 || sim.s.time - ch.f < TUNING.chuteFloatEvery) return;
    const c = sim.center(b);
    sim.float(c.x, c.y - 14, `+${ch.p}`, PAL.gold, undefined, `chute-${b.id}`);
    sim.fx('chute', c.x, c.y - 6);                                 // (no farmer's own action: nobody's camera shakes for it)
    ch.p = 0; ch.f = sim.s.time;
}
