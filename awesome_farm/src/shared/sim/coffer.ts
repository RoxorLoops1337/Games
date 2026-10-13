// The Farm Coffer: a strongbox every farmer can pay coins into. Everyone sees the total. The rules:
//   - anyone in reach may put coins in; you may take back only what YOU put in (the box keeps a ledger per farmer);
//   - when a farmer buys land and is short, the coffers in the world top up the difference (the farm fund raises new land together).
// The coins live on the building (`BuildE.cof`), so they ride along with it in every save and every sync.

import { PAL } from '../palette';
import type { Sim } from './sim';
import type { BuildE, Cmd, PlayerS } from './types';

export const COFFER_REACH = 120;

const coffer = (sim: Sim, id: number): BuildE | null => {
    const b = sim.s.ents[id];
    return b?.k === 'bld' && b.kind === 'coffer' ? b : null;
};
export const totalOf = (b: BuildE) => b.cof?.c ?? 0;
export const shareOf = (b: BuildE, id: string) => b.cof?.by[id] ?? 0;

/** All the coins in the world's coffers. */
export const fundTotal = (sim: Sim) => sim.buildings('coffer').reduce((a, b) => a + totalOf(b), 0);

export function cmdCoffer (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'coffer' }>) {
    const b = coffer(sim, c.id);
    if (!b || !sim.inReach(p, b, COFFER_REACH)) { sim.deny(p, 'Stand next to the coffer'); return; }
    const n = Math.floor(Number(c.n));
    if (!Number.isFinite(n) || n < 1) return;
    const box = b.cof ??= { c: 0, by: {} };
    const at = sim.center(b);
    if (c.op === 'put') {
        const m = Math.min(n, p.coins);
        if (m < 1) { sim.deny(p, 'No coins to put in'); return; }
        p.coins -= m;
        box.c += m;
        box.by[p.id] = (box.by[p.id] ?? 0) + m;
        sim.float(at.x, at.y - 14, `+${m} to the coffer`, PAL.gold, p.id);
    } else if (c.op === 'take') {
        const m = Math.min(n, box.by[p.id] ?? 0, box.c);
        if (m < 1) { sim.deny(p, 'Only what you put in comes back out'); return; }
        p.coins += m;
        box.c -= m;
        box.by[p.id] -= m;
        if (box.by[p.id] <= 0) delete box.by[p.id];
        sim.float(at.x, at.y - 14, `-${m} from the coffer`, PAL.pebble, p.id);
    } else return;
    sim.touch(b);
}

/**
 * A farmer short of coins for land: the coffers pay the difference when they hold enough between them. Returns the coins drawn
 * (0 when the fund cannot cover it: nothing is taken then). The ledger shrinks evenly across whoever put coins in.
 */
export function coverShortfall (sim: Sim, p: PlayerS, short: number): number {
    if (short < 1 || fundTotal(sim) < short) return 0;
    let left = short;
    for (const b of sim.buildings('coffer')) {
        if (left <= 0) break;
        const box = b.cof;
        if (!box || box.c <= 0) continue;
        const take = Math.min(left, box.c);
        box.c -= take;
        left -= take;
        let owed = take;                                              // (the ledger gives up its biggest balances first)
        for (const [who] of Object.entries(box.by).sort((a, b2) => b2[1] - a[1])) {
            const m = Math.min(owed, box.by[who]);
            box.by[who] -= m; owed -= m;
            if (box.by[who] <= 0) delete box.by[who];
            if (owed <= 0) break;
        }
        sim.touch(b);
    }
    p.coins += short;
    sim.toast(p.id, `The farm coffer paid ${short} coins toward the land`, 'k_coin', PAL.gold);
    return short;
}
