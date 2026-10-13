// Cottages: build one and a villager moves in at the next dawn (name and trade from data/folk.ts, drawn with the world's own dice,
// so the same world gets the same neighbours). Press E at the door: once a day they give you something of their trade, and after
// FRIEND_AT such days they give more. The resident lives on the building (`BuildE.res`), so it saves and syncs like any machine.

import { FOLK_NAMES, FRIEND_AT, TRADES } from '../data/folk';
import { ITEMS } from '../data/items';
import { PAL } from '../palette';
import * as chronicle from './chronicle';
import type { Sim } from './sim';
import type { BuildE, PlayerS } from './types';

/** Every cottage with nobody in it gets a resident this dawn. */
export function onDawn (sim: Sim) {
    const taken = new Set(sim.buildings('cottage').map((b) => b.res?.n));
    for (const b of sim.buildings('cottage')) {
        if (b.res) continue;
        const free = FOLK_NAMES.filter((n) => !taken.has(n));
        const name = sim.rng.pick(free.length ? free : FOLK_NAMES);
        const trade = sim.rng.pick(TRADES);
        taken.add(name);
        b.res = { n: name, t: trade.id, v: 0, g: -1 };
        sim.touch(b);
        const owner = b.by ? sim.s.players[b.by] : undefined;
        if (owner?.online) sim.banner(`${name} moved in`, `A ${trade.name.toLowerCase()} has taken the cottage. Press E at the door.`, PAL.gold, owner.id);
        chronicle.note(sim, `cottage:${b.id}`, `${name} the ${trade.name.toLowerCase()} moved into a cottage on the farm.`, 'k_flag');
    }
}

export function use (sim: Sim, p: PlayerS, b: BuildE) {
    const c = sim.center(b);
    const r = b.res;
    if (!r) { sim.float(c.x, c.y - 18, 'Empty: someone moves in at dawn', PAL.pebble, p.id); return; }
    const trade = TRADES.find((t) => t.id === r.t)!;
    if (r.g === sim.s.day) { sim.float(c.x, c.y - 18, `${r.n}: "See you tomorrow!"`, PAL.cream, p.id); return; }
    const friend = r.v >= FRIEND_AT;
    const [item, lo, hi] = sim.rng.pick(trade.gifts);
    const n = sim.rng.int(lo, hi) + (friend ? 1 : 0);
    sim.give(p, item, n, c.x, c.y);
    r.g = sim.s.day;
    r.v++;
    sim.touch(b);
    sim.float(c.x, c.y - 18, `${r.n}: "${ITEMS[item].name}, ${trade.line}."`, PAL.gold, p.id);
    if (r.v === FRIEND_AT) sim.banner(`${r.n} is a friend now`, 'Their gifts get a little bigger.', PAL.gold, p.id);
}
