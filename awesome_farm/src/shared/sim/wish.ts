// Season wishes: on the first morning of each season after the first, the farm is offered three wishes (data/wishes.ts) and the
// farmers vote. The vote closes as soon as every farmer who is online has voted, or when night falls (or the day turns): the wish with
// the most votes wins, a tie or an empty ballot is settled by the world's own dice (the same answer every time for this world), and the
// winner blesses EVERY farmer of the world, online or not, until the season ends. A farmer who joins mid-season gets it on arrival.
// The blessing is `PlayerS.wish`, read by the stat ledger (`modsOf`) like a skill or a buff.

import { Rng } from '../rng';
import { PAL } from '../palette';
import { seasonIndex, WISH_BY_ID, wishPool } from '../data/wishes';
import * as chronicle from './chronicle';
import type { Sim } from './sim';
import type { Cmd, PlayerS } from './types';

/** Is a vote running right now? */
export const isOpen = (sim: Sim) => { const w = sim.s.wish; return !!w && w.won === undefined && w.k === seasonIndex(sim.s.day); };

const tell = (sim: Sim) => { if (sim.s.wish) sim.events.push({ e: 'wish', wish: sim.s.wish }); };

/** A new season has begun (not the very first): offer three wishes, take back the last blessing and ask everyone who is here. */
export function begin (sim: Sim) {
    const k = seasonIndex(sim.s.day);
    if (k < 1) return;
    sim.s.wish = { k, day: sim.s.day, opts: wishPool(sim.s.seed, k), votes: {} };
    for (const p of Object.values(sim.s.players)) delete p.wish;
    for (const p of sim.online) {
        sim.events.push({ e: 'open', to: p.id, ui: 'wish', id: 0 });
        sim.toast(p.id, 'Choose this season\'s wish', 'k_star', PAL.gold);
    }
    tell(sim);
}

/** A farmer casts (or changes) their vote. */
export function cmdWish (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'wish' }>) {
    const w = sim.s.wish;
    if (typeof c.id !== 'string' || !w || !w.opts.includes(c.id)) return;
    if (!isOpen(sim)) { sim.deny(p, 'This season\'s wish is already chosen'); return; }
    if (w.votes[p.id] === c.id) return;
    w.votes[p.id] = c.id;
    sim.fx('perk', p.x, p.y - 10, p.id);
    tell(sim);
    if (sim.online.length && sim.online.every((q) => !!w.votes[q.id])) resolve(sim);
}

/** Count the votes and bless the farm. */
function resolve (sim: Sim) {
    const w = sim.s.wish;
    if (!w || w.won !== undefined) return;
    const count: Record<string, number> = Object.fromEntries(w.opts.map((o) => [o, 0]));
    for (const [pid, id] of Object.entries(w.votes)) if (sim.s.players[pid] && id in count) count[id]++;
    const top = Math.max(...Object.values(count));
    const tied = w.opts.filter((o) => count[o] === top);
    const id = tied.length === 1 ? tied[0] : new Rng(`${sim.s.seed}:wishpick:${w.k}`).pick(tied);
    const wish = WISH_BY_ID[id];
    w.won = id;
    for (const p of Object.values(sim.s.players)) p.wish = id;
    for (const p of sim.online) {
        sim.banner(`Season wish: ${wish.name}`, wish.blurb, wish.color, p.id);
        sim.fx('win', p.x, p.y - 10, p.id);
    }
    chronicle.note(sim, `wish:${w.k}`, `The farm wished for ${wish.name} this season.`, wish.icon);
    tell(sim);
}

/** Every step: close a vote that has run out of day. */
export function update (sim: Sim) {
    const w = sim.s.wish;
    if (!w || w.won !== undefined) return;
    if (w.k !== seasonIndex(sim.s.day)) return;                    // (an old vote: the next season's `begin` replaces it)
    if (sim.s.night || sim.s.day > w.day) resolve(sim);
}

/** A farmer arrives (or is made) mid-season: the blessing applies to them too. */
export function grant (sim: Sim, p: PlayerS) {
    const w = sim.s.wish;
    if (w?.won !== undefined && w.k === seasonIndex(sim.s.day)) p.wish = w.won; else delete p.wish;
}
