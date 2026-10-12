// A farmer must never be left inside something solid. Movement is the client's own, so when a friend builds on the tile a farmer is
// walking onto, the server may still think they stand a few pixels away while their screen already has them inside the new piece.
// So every placement is WATCHED for a moment: any farmer whose feet then touch something solid is lifted out to the nearest free spot
// (and their client snaps there: `warp`).

import { TILE } from '../config';
import type { Sim } from './sim';
import type { PlayerS } from './types';

/** Seconds a fresh piece is watched (long enough for the position of a laggy farmer to arrive). */
export const WATCH_SECS = 2;

/** How far (px) a farmer's own screen may be ahead of where the server last heard of them. */
export const LAG = 12;

interface Foot { tx: number; ty: number; w: number; h: number; /** who built it: their own screen is in step with the build, so only a real overlap counts for them */ by?: string }
/** Would a farmer standing at (x, y), their feet box grown by `pad`, touch the footprint? */
export const touches = (f: Foot, x: number, y: number, pad: number) =>
    x + 4 + pad > f.tx * TILE && x - 4 - pad < (f.tx + f.w) * TILE && y + pad > f.ty * TILE && y - 3 - pad < (f.ty + f.h) * TILE;

/**
 * Move a farmer out of whatever they stand in (or, with a footprint, out of its reach with some lag to spare), to the nearest free spot.
 * False: they were not stuck (or nowhere free was found).
 */
export function eject (sim: Sim, p: PlayerS, f?: Foot): boolean {
    const w = sim.world;
    const stuck = w.boxBlocked(p.x, p.y, 4, 3) || (!!f && touches(f, p.x, p.y, LAG));
    if (!stuck) return false;
    for (let r = 4; r <= 112; r += 4) {
        const n = Math.max(8, Math.round(r / 2));
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
            if (w.boxBlocked(x, y, 4, 3) || (f && touches(f, x, y, LAG))) continue;
            p.x = x; p.y = y; p.warp++;
            sim.float(x, y - 18, 'Pushed clear', undefined, p.id);
            return true;
        }
    }
    return false;
}

/** Watch a new piece's footprint: check right now, and again on every step for a moment. */
export function watch (sim: Sim, tx: number, ty: number, w: number, h: number, by?: string) {
    sim.watching.push({ tx, ty, w, h, by, until: sim.s.time + WATCH_SECS });
    check(sim, sim.watching[sim.watching.length - 1]);
}

function check (sim: Sim, f: Foot) {
    const pad = 2 * TILE;
    for (const p of sim.online) {
        if (p.x < (f.tx - 2) * TILE - pad || p.x > (f.tx + f.w + 2) * TILE + pad || p.y < (f.ty - 2) * TILE - pad || p.y > (f.ty + f.h + 3) * TILE + pad) continue;
        eject(sim, p, p.id === f.by ? undefined : f);
    }
}

export function step (sim: Sim) {
    if (!sim.watching.length) return;
    sim.watching = sim.watching.filter((f) => f.until > sim.s.time);
    for (const f of sim.watching) check(sim, f);
}
