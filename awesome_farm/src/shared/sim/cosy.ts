// Cosy rooms. Stand inside a walled-in room that is furnished well enough and it gives you the Cosy buff: energy and hearts come back
// faster. The score counts what is near you (decor, lights, a bed, a fire), with a bonus for every different kind of thing, so a
// crowded corner of one thing is not the same as a lived-in room.

import { TILE } from '../config';
import { BUILDINGS } from '../data/buildings';
import type { Sim } from './sim';
import type { PlayerS } from './types';

export const COSY_AT = 8;           // the score that makes a room cosy
export const COSY_RANGE = 6;        // tiles round the farmer that count
const CHECK_EVERY = 2;              // seconds
const BUFF_SECS = 12;
const timers = new WeakMap<Sim, number>();

/** What one piece adds to a room (0 for walls, floors, machines and other things that are not furniture). */
export function cosyValue (kind: string): number {
    const d = BUILDINGS[kind as keyof typeof BUILDINGS];
    if (!d || d.hidden) return 0;
    if (kind === 'sleepbed' || kind === 'campfire') return 3;
    if (kind === 'carpet') return 1;
    return d.cat === 'decor' || d.cat === 'light' ? 1 : 0;
}

/** The cosy score round a point: the pieces' values, plus 2 for every different kind. */
export function cosyScore (sim: Sim, x: number, y: number): number {
    const r = COSY_RANGE * TILE;
    let sum = 0;
    const kinds = new Set<string>();
    for (const b of sim.ents('bld')) {
        const v = cosyValue(b.kind);
        if (!v) continue;
        const c = sim.center(b);
        if (Math.hypot(c.x - x, c.y - y) > r) continue;
        sum += v;
        kinds.add(b.kind);
    }
    return sum + kinds.size * 2;
}

/** Is the farmer standing in a walled-in room? */
export const inRoom = (sim: Sim, p: PlayerS) => sim.world.sealed(Math.floor(p.x / TILE), Math.floor((p.y - 2) / TILE), 120);

export function update (sim: Sim, dt: number) {
    const t = (timers.get(sim) ?? 0) + dt;
    if (t < CHECK_EVERY) { timers.set(sim, t); return; }
    timers.set(sim, 0);
    for (const p of sim.online) {
        if (p.downed > 0 || !inRoom(sim, p)) continue;
        const score = cosyScore(sim, p.x, p.y);
        if (score < COSY_AT) continue;
        const had = p.buffs.find((b) => b.id === 'cosy');
        if (had) had.t = BUFF_SECS;
        else {
            p.buffs.push({ id: 'cosy', t: BUFF_SECS });
            sim.toast(p.id, `A cosy room (score ${score}): energy and hearts come back faster`, 'k_heart');
        }
    }
}
