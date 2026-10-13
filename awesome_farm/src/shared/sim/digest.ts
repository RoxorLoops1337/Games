// Welcome back: when a farmer returns after a while (a server world keeps running without them), a few short toasts say what
// happened: how long it was, the crops that ripened, what is blocked, who is here, what post waits. It reuses the "what needs you"
// rules (sim/needs.ts), so it says the same things the T window will.

import { TILE } from '../config';
import { PAL } from '../palette';
import { needLine, needsOf } from './needs';
import type { Sim } from './sim';
import { simEnv } from './status';
import type { PlayerS } from './types';

/** Away at least this long (world seconds) for a digest to be worth showing, or a day has turned. */
export const DIGEST_AFTER = 300;

/** Remember when this farmer left (called as they leave). */
export function noteLeave (sim: Sim, p: PlayerS) {
    p.left = { t: sim.s.time, d: sim.s.day };
}

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/** The lines to tell a returning farmer ([] when they were not away long or nothing happened). */
export function digestLines (sim: Sim, p: PlayerS): { text: string; icon: string; color: number }[] {
    const was = p.left;
    if (!was) return [];
    const away = sim.s.time - was.t, passed = sim.s.day - was.d;
    if (away < DIGEST_AFTER && passed < 1) return [];
    const out: { text: string; icon: string; color: number }[] = [];
    const needs = needsOf(sim.buildings(), simEnv(sim), { x: p.x || TILE, y: p.y || TILE });
    const head = passed >= 1 ? `Welcome back: ${days(passed)} have passed` : 'Welcome back';
    out.push({ text: needs.length ? `${head}. ${needs.slice(0, 2).map((n) => needLine(n).replace(/\s+/g, ' ')).join('; ')}${needs.length > 2 ? '…' : ''} (press T)` : `${head}. Nothing needs you right now.`, icon: 'k_flag', color: PAL.gold });
    const here = sim.online.filter((q) => q.id !== p.id).map((q) => q.name);
    if (here.length) out.push({ text: `Here now: ${here.slice(0, 4).join(', ')}${here.length > 4 ? ` and ${here.length - 4} more` : ''}`, icon: 'k_flag', color: PAL.lime });
    return out;
}

/** On joining again: toast the digest, once. */
export function welcomeBack (sim: Sim, p: PlayerS) {
    for (const l of digestLines(sim, p)) sim.toast(p.id, l.text, l.icon, l.color);
    delete p.left;
}
