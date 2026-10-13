// Cottages: build one and a villager moves in at the next dawn (name and trade from data/folk.ts, drawn with the world's own dice,
// so the same world gets the same neighbours). Press E at the door: once a day they give you something of their trade, and after
// FRIEND_AT such days they give more. The resident lives on the building (`BuildE.res`), so it saves and syncs like any machine.

import { isEve } from '../data/festival';
import { FOLK_NAMES, FRIEND_AT, hearts, REQUEST_COINS, REQUEST_FRIEND, TRADES, WISHES } from '../data/folk';
import { ITEMS } from '../data/items';
import { PAL } from '../palette';
import * as chronicle from './chronicle';
import { takeItem } from './stats';
import type { Sim } from './sim';
import type { BuildE, PlayerS } from './types';

/** Every cottage with nobody in it gets a resident this dawn. */
export function onDawn (sim: Sim) {
    const taken = new Set(sim.buildings('cottage').map((b) => b.res?.n));
    for (const b of sim.buildings('cottage')) {
        if (b.res && !b.res.q && sim.rng.chance(0.5)) {       // a settled villager sometimes asks for something
            const [item, n] = sim.rng.pick(WISHES);
            b.res.q = item; b.res.qn = n;
            sim.touch(b);
        }
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

/** Festival night: the villager runs a ring-toss stall at their door. STALL_COST coins a throw; a hit pays STALL_PRIZE (a friend's aim is a little better). */
export const STALL_COST = 5;
export const STALL_PRIZE = 15;
export const STALL_HIT = 0.4;
function stall (sim: Sim, p: PlayerS, b: BuildE, r: NonNullable<BuildE['res']>) {
    const c = sim.center(b);
    if (p.coins < STALL_COST) { sim.float(c.x, c.y - 18, `${r.n}: "A throw costs ${STALL_COST} coins"`, PAL.pebble, p.id); return; }
    p.coins -= STALL_COST;
    if (sim.rng.chance(STALL_HIT + (r.v >= FRIEND_AT ? 0.1 : 0))) {
        p.coins += STALL_PRIZE;
        sim.fx('golden', c.x, c.y - 6, p.id);
        sim.float(c.x, c.y - 18, `${r.n}: "Ring! +${STALL_PRIZE} coins"`, PAL.gold, p.id);
    } else sim.float(c.x, c.y - 18, `${r.n}: "So close! Try again?"`, PAL.cream, p.id);
}

export function use (sim: Sim, p: PlayerS, b: BuildE) {
    const c = sim.center(b);
    const r = b.res;
    if (!r) { sim.float(c.x, c.y - 18, 'Empty: someone moves in at dawn', PAL.pebble, p.id); return; }
    if (sim.s.night && isEve(sim.s.day)) { stall(sim, p, b, r); return; }
    const trade = TRADES.find((t) => t.id === r.t)!;
    if (r.q && (p.inv[r.q as keyof typeof p.inv] ?? 0) >= (r.qn ?? 1)) {          // you came with what they asked for
        const item = r.q as keyof typeof ITEMS, n = r.qn ?? 1, before = hearts(r.v);
        takeItem(p, item, n);
        p.coins += REQUEST_COINS;
        r.v += REQUEST_FRIEND;
        r.q = undefined; r.qn = undefined;
        sim.touch(b);
        sim.float(c.x, c.y - 18, `${r.n}: "Just what I needed!" +${REQUEST_COINS} coins`, PAL.gold, p.id);
        if (hearts(r.v) > before) sim.banner(`${r.n} likes you more`, `${hearts(r.v)} of 5 hearts`, PAL.blossom, p.id);
    }
    if (r.g === sim.s.day) {
        const ask = r.q ? ` Could you bring ${r.qn} ${ITEMS[r.q as keyof typeof ITEMS].name}?` : '';
        sim.float(c.x, c.y - 18, `${r.n}: "See you tomorrow!"${ask}`, PAL.cream, p.id);
        return;
    }
    const friend = r.v >= FRIEND_AT;
    const [item, lo, hi] = sim.rng.pick(trade.gifts);
    const n = sim.rng.int(lo, hi) + (friend ? 1 : 0);
    sim.give(p, item, n, c.x, c.y);
    r.g = sim.s.day;
    r.v++;
    sim.touch(b);
    sim.float(c.x, c.y - 18, `${r.n}: "${ITEMS[item].name}, ${trade.line}."`, PAL.gold, p.id);
    if (r.q) sim.float(c.x, c.y - 34, `Could you bring ${r.qn} ${ITEMS[r.q as keyof typeof ITEMS].name}?`, PAL.cream, p.id);
    if (r.v === FRIEND_AT) sim.banner(`${r.n} is a friend now`, 'Their gifts get a little bigger.', PAL.gold, p.id);
}
