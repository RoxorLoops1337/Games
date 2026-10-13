// Rainbow's end. When a day's rain clears, a rainbow lands on a random island somebody owns, and at its foot lies a pot of gold: a
// heap of coins and a crate. Whoever gets there first picks it up. Everybody is told where (a ping on the ground and the map).
// At most one a day, only by day.

import { TILE, TUNING } from '../config';
import { PAL } from '../palette';
import { weatherAt } from '../weather';
import type { Sim } from './sim';

interface State { raining: boolean; day: number }
const states = new WeakMap<Sim, State>();

/** Coins in the pot: a little more as the farm grows. */
export const potCoins = (day: number) => Math.min(30, 10 + Math.floor(day / 3));

export function step (sim: Sim) {
    const s = sim.s;
    const st = states.get(sim) ?? { raining: false, day: -1 };
    states.set(sim, st);
    const rain = weatherAt(s.seed, s.day, s.clock).rain;
    if (rain > 0.35) { st.raining = true; return; }
    if (!st.raining || rain > 0.08) return;
    st.raining = false;
    if (s.night || s.clock >= TUNING.dayLength || st.day === s.day || !sim.online.length) return;
    st.day = s.day;
    land(sim);
}

/** Put the pot of gold down on a random free tile of a random owned island. */
export function land (sim: Sim): { x: number; y: number } | null {
    const plots = sim.world.plots.filter((p) => p.owned);
    if (!plots.length) return null;
    for (let tries = 0; tries < 8; tries++) {
        const plot = sim.rng.pick(plots);
        const t = sim.world.randomFreeTile(plot, sim.rng, sim.online.map((q) => ({ x: q.x, y: q.y })), 3);
        if (!t) continue;
        const x = (t.tx + 0.5) * TILE, y = (t.ty + 1) * TILE - 3;
        for (let i = 0; i < potCoins(sim.s.day); i++) sim.spawnDrop('coin', x, y);
        sim.spawnDrop('crate_wood', x, y);
        sim.fx('golden', x, y - 8);
        const by = sim.online[0].id;
        sim.events.push({ e: 'ping', by, name: 'Rainbow', x, y, color: 0xffd04a });
        for (const q of sim.online) sim.banner('A rainbow!', 'A pot of gold waits where it lands: look for the ping', PAL.gold, q.id);
        return { x, y };
    }
    return null;
}
