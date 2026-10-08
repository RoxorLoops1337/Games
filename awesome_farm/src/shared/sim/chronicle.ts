// The farm chronicle: the game writes one storybook line for each milestone (an island raised, a boss felled, a chapter finished,
// a Blood Moon survived…) into the world's shared log, and the Journal's Chronicle tab reads it back. A line is `{ d: day, t: text,
// i: icon, k: key }`; a keyed line is written once (the key says "this has happened"), so a milestone never repeats. The log is
// world state (saved, sent with the welcome) and each new line is also sent as a `chron` event so every screen keeps up.

import type { Sim } from './sim';
import type { ChronEntry } from './types';

export const CHRON_MAX = 300;
/** Levels worth a line. */
export const LEVEL_MARKS = [5, 10, 15, 20, 30, 40, 50, 75, 100];
/** Farm ages worth a line (in days). */
const AGE_MARKS = [10, 25, 50, 100, 200, 365];
/** Plot counts worth a line. */
export const LAND_MARKS = [1, 5, 10, 20, 40, 80, 160];

/** "Dana", "Dana and Sam", "Dana, Sam and Kit", "Dana, Sam and 3 others". */
export function names (list: string[]): string {
    const l = [...new Set(list.filter(Boolean))];
    if (l.length <= 1) return l[0] ?? 'Someone';
    if (l.length === 2) return `${l[0]} and ${l[1]}`;
    if (l.length === 3) return `${l[0]}, ${l[1]} and ${l[2]}`;
    return `${l[0]}, ${l[1]} and ${l.length - 2} others`;
}

/**
 * Write a line. With a `key` the line is written only once ever (returns false when it already exists). The text is cut to a sane
 * length: player names are the only free text that goes into it.
 */
export function note (sim: Sim, key: string | undefined, text: string, icon: string): boolean {
    const log = (sim.s.chron ??= []);
    if (key && log.some((e) => e.k === key)) return false;
    const entry: ChronEntry = { d: sim.s.day, t: text.slice(0, 160), i: icon, ...(key ? { k: key.slice(0, 64) } : {}) };
    log.push(entry);
    if (log.length > CHRON_MAX) log.splice(0, log.length - CHRON_MAX);
    sim.events.push({ e: 'chron', entry });
    return true;
}

/** Levels gained: a line for every mark that was crossed. */
export function levels (sim: Sim, p: { id: string; name: string; level: number }, gained: number) {
    for (const m of LEVEL_MARKS) if (p.level - gained < m && p.level >= m) note(sim, `lvl:${p.id}:${m}`, `${p.name} reached level ${m}.`, 'k_star');
}

/** Plots raised by one farmer. */
export function land (sim: Sim, p: { id: string; name: string; plotsBought: number }) {
    if (!LAND_MARKS.includes(p.plotsBought)) return;
    const n = p.plotsBought;
    note(sim, `land:${p.id}:${n}`, n === 1 ? `${p.name} raised the first new plot out of the sea.` : `${p.name} has raised ${n} plots out of the sea.`, 'k_map');
}

/** A new day began: the farm's age, the first night, and what the night held (`event` is the night event that has just ended, if any). */
export function morning (sim: Sim, event: string | null) {
    const day = sim.s.day, last = day - 1;
    if (day === 2) note(sim, 'night1', 'The farm made it through its first night.', 'k_moon');
    if (AGE_MARKS.includes(day)) note(sim, `age:${day}`, `The farm is ${day} days old.`, 'k_sprout');
    if (event === 'bloodmoon') note(sim, `ev:${last}`, `The Blood Moon rose on day ${last}, and the farm stood.`, 'k_skull');
    else if (event === 'meteors') note(sim, `ev:${last}`, `Stars fell on the farm on day ${last}.`, 'k_star');
    else if (event === 'fairies') note(sim, `ev:${last}`, `Fairies danced over the fields on day ${last}.`, 'k_clover');
}
