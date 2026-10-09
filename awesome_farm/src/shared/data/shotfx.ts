// How a tower's shot flies on screen (client/world/blight.ts draws it; the sim only says "a shot, from here to there").
// The numbers live here so a test can pin them: a shot must stay on screen long enough to be seen.

import type { SimEvent } from '../sim/types';

export type ShotKind = Extract<SimEvent, { e: 'shot' }>['k'];

/** How fast a shot flies (px per second): a skeleton's arrow flies at 120, which the owner likes; an Archer Tower's is a little quicker, a heavy bolt a little slower. */
export const SPEED: Record<'arrow' | 'bolt', number> = { arrow: 140, bolt: 120 };
/** The shortest and longest time (seconds) a shot is ever in the air, whatever the distance. */
export const FLIGHT_MIN = 0.3, FLIGHT_MAX = 1.1;
/** How long a Tesla zap lingers (its glow fades over this long). */
export const ZAP_LINGER = 0.3;
/** The distance (px) at which a shot takes the longest. */
export const FAR_PX = 180;
/** The rise of the arc (px) at its top, per px of distance (a bolt flies flatter), at most MAX_ARC. */
export const ARC = { arrow: 0.22, bolt: 0.12 };
export const MAX_ARC = 26;

/** Seconds in the air for a shot of this kind over this distance (px): at its own speed, never blink-short and never slow. */
export function flightTime (kind: 'arrow' | 'bolt', dist: number): number {
    return Math.max(FLIGHT_MIN, Math.min(FLIGHT_MAX, dist / SPEED[kind]));
}
