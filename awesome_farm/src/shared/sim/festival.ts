// Festival eve and the Lantern Chain. The last day of every season has a festival night: at dusk the whole farm is asked to light
// lanterns (press E on a Lantern or Lamp Post). Lit ones within CHAIN_GAP tiles of each other form a chain; at dawn the longest chain
// pays everyone who is online: coins for each lantern in it, and the Lucky buff once it is long enough. The lit mark lives on the
// lantern itself (`BuildE.kd`, the day it was lit), so nothing is saved apart from the buildings.

import { TILE } from '../config';
import { seasonDay, seasonOf, SEASON_DAYS, SEASONS } from '../season';
import { PAL } from '../palette';
import * as chronicle from './chronicle';
import type { Sim } from './sim';
import type { BuildE, PlayerS } from './types';

export const CHAIN_GAP = 6;        // tiles between one lit lantern and the next
export const CHAIN_MIN = 4;        // the shortest chain that counts
export const CHAIN_COINS = 15;     // coins each farmer gets for every lantern in the longest chain
export const CHAIN_LUCKY = 8;      // chain length that also earns the Lucky buff
export const USE_REACH = 40;

/** Is this the day of a festival (the last day of a season)? Its night is the festival night. */
export const isEve = (day: number) => seasonDay(day) === SEASON_DAYS;

const lanterns = (sim: Sim) => [...sim.buildings('lantern'), ...sim.buildings('lamppost')];
export const litTonight = (sim: Sim) => lanterns(sim).filter((b) => b.kd === sim.s.day);

/** The size of the longest group of lit lanterns that are each within CHAIN_GAP tiles of another in the group. */
export function longestChain (sim: Sim, lit: BuildE[]): number {
    const parent = lit.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < lit.length; i++) for (let j = i + 1; j < lit.length; j++) {
        const a = sim.center(lit[i]), b = sim.center(lit[j]);
        if (Math.hypot(a.x - b.x, a.y - b.y) <= CHAIN_GAP * TILE) parent[find(i)] = find(j);
    }
    const size = new Map<number, number>();
    let best = 0;
    for (let i = 0; i < lit.length; i++) { const r = find(i); const n = (size.get(r) ?? 0) + 1; size.set(r, n); best = Math.max(best, n); }
    return best;
}

/** Nightfall: if it is festival night, tell everyone what to do. */
export function onNight (sim: Sim) {
    if (!isEve(sim.s.day)) return;
    const next = SEASONS[seasonOf(sim.s.day + 1)].name;
    sim.banner('Festival Eve!', `Light the Lantern Chain: press E on lanterns within ${CHAIN_GAP} tiles of each other. ${next} comes at dawn.`, PAL.gold);
}

/** E on a lantern or lamp post. Returns true when it was a festival lighting (so the use is spent). */
export function use (sim: Sim, p: PlayerS, b: BuildE): boolean {
    if (!sim.s.night || !isEve(sim.s.day)) return false;
    const c = sim.center(b);
    if (b.kd === sim.s.day) {
        sim.float(c.x, c.y - 16, `Chain so far: ${longestChain(sim, litTonight(sim))}`, PAL.cream, p.id);
        return true;
    }
    b.kd = sim.s.day;
    sim.touch(b);
    sim.fx('golden', c.x, c.y - 6, p.id);
    const n = longestChain(sim, litTonight(sim));
    sim.float(c.x, c.y - 16, `Lit! Longest chain: ${n}`, PAL.gold, p.id);
    return true;
}

/** Dawn after a festival night (called with the day that just ended): pay out the longest chain. */
export function onDawn (sim: Sim, ended: number) {
    if (!isEve(ended)) return;
    const lit = lanterns(sim).filter((b) => b.kd === ended);
    const n = longestChain(sim, lit);
    if (n < CHAIN_MIN) {
        if (lit.length) sim.banner('The festival fades', `Only ${n} lanterns were chained. ${CHAIN_MIN} make a chain: try again next season.`, PAL.pebble);
        return;
    }
    for (const p of sim.online) {
        sim.give(p, 'coin', n * CHAIN_COINS);
        if (n >= CHAIN_LUCKY) { p.buffs = p.buffs.filter((x) => x.id !== 'lucky'); p.buffs.push({ id: 'lucky', t: 240 }); }
        sim.toast(p.id, `Lantern Chain of ${n}: +${n * CHAIN_COINS} coins${n >= CHAIN_LUCKY ? ' and luck for a while' : ''}`, 'k_coin', PAL.gold);
    }
    sim.banner('The Lantern Chain shines', `${n} lanterns lit together: the whole farm is rewarded`, PAL.gold);
    chronicle.note(sim, `festival:${ended}`, `The farm lit a Lantern Chain of ${n} on the eve of ${SEASONS[seasonOf(ended + 1)].name}.`, 'k_moon');
}
