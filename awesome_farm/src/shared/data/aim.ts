// Where each tower last shot, as the CLIENT remembers it (no sim state, no protocol): the Ballista turns toward its last target and the
// Tesla Coil's orb swells as it fires. Written by the world view from the `shot` event (client/world/blight.ts), read by the 2D bow
// sprite and by the 3D models, keyed by the tower's tile.

interface Seen { a: number; at: number }
const seen = new Map<number, Seen>();
const key = (tx: number, ty: number) => tx * 100003 + ty;

/** A tower on tile (tx, ty) fired at angle `a` (radians, screen y down: 0 is east, a quarter turn is south) at time `at` (ms). */
export function noteShot (tx: number, ty: number, a: number, at: number) { seen.set(key(tx, ty), { a, at }); }
/** The angle it last aimed at (east, the sea side, until it has shot). */
export const aimOf = (tx: number, ty: number) => seen.get(key(tx, ty))?.a ?? 0;
/** Milliseconds since it last fired (a large number if it never has). */
export const sinceShot = (tx: number, ty: number, now: number) => { const s = seen.get(key(tx, ty)); return s ? now - s.at : 1e9; };
/** An angle as one of eight directions: 0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE. */
export const dir8 = (a: number) => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
/** The shortest signed turn from `from` to `to` (radians). */
export const turnTo = (from: number, to: number) => { let d = (to - from) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

/** A tower turns to look at `a` without having fired (the Ballista follows the nearest raider in range, and glances about when none is). Does not touch the time of its last shot. */
export function lookAt (tx: number, ty: number, a: number) { const k = key(tx, ty), s = seen.get(k); seen.set(k, { a, at: s?.at ?? -1e9 }); }
