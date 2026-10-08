// Scholar's Day (weather.ts: `scholarDay`, a pure function of the seed and the day, so the weather vane can see it coming):
// from dawn to the next dawn every farmer learns twice as much. It is the `scholarday` buff, handed out at dawn to everybody
// here and on arrival to whoever comes later, timed to run out at the next dawn; dawn also takes back a stale one.

import { TUNING } from '../config';
import { PAL } from '../palette';
import { SCHOLAR_DAY, scholarDay } from '../weather';
import type { Sim } from './sim';
import type { PlayerS } from './types';

/** Seconds left until the next dawn. */
const untilDawn = (sim: Sim) => Math.max(1, TUNING.dayLength + (sim.s.night ? sim.s.nightLen : TUNING.nightLength) - sim.s.clock);

/** Is today a Scholar's Day? */
export const today = (sim: Sim) => scholarDay(sim.s.seed, sim.s.day);

/** Give (or take back) the day's blessing to one farmer: on arrival and at dawn. */
export function grant (sim: Sim, p: PlayerS) {
    const had = p.buffs.some((b) => b.id === 'scholarday');
    if (had) p.buffs = p.buffs.filter((b) => b.id !== 'scholarday');
    if (today(sim)) p.buffs = [...p.buffs, { id: 'scholarday', t: untilDawn(sim) }];
}

/** A new day: everybody here gets the blessing (or loses yesterday's), with a banner when it begins. */
export function onDawn (sim: Sim) {
    for (const p of Object.values(sim.s.players)) {
        if (p.online) grant(sim, p);
        else if (p.buffs.some((b) => b.id === 'scholarday')) p.buffs = p.buffs.filter((b) => b.id !== 'scholarday');
    }
    if (!today(sim)) return;
    for (const p of sim.online) sim.banner(SCHOLAR_DAY.name, `${SCHOLAR_DAY.sub} XP brews stack with it.`, PAL.plum, p.id);
}
