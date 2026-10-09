// How a tower's shot flies on screen (client/world/blight.ts draws it; the sim only says "a shot, from here to there").
// The numbers live here so a test can pin them: a shot must stay on screen long enough to be seen.

import type { SimEvent } from '../sim/types';

export type ShotKind = Extract<SimEvent, { e: 'shot' }>['k'];

/** Seconds a shot is in the air, by kind: [near, far], reached at 0 and at FAR_PX of distance. A heavy bolt is slower. */
export const FLIGHT: Record<'arrow' | 'bolt', [number, number]> = { arrow: [0.35, 0.55], bolt: [0.45, 0.6] };
/** How long a Tesla zap lingers (its glow fades over this long). */
export const ZAP_LINGER = 0.3;
/** The distance (px) at which a shot takes the longest. */
export const FAR_PX = 180;
/** The rise of the arc (px) at its top, per px of distance (a bolt flies flatter), at most MAX_ARC. */
export const ARC = { arrow: 0.22, bolt: 0.12 };
export const MAX_ARC = 26;

/** Seconds in the air for a shot of this kind over this distance (px). */
export function flightTime (kind: 'arrow' | 'bolt', dist: number): number {
    const [a, b] = FLIGHT[kind];
    return a + (b - a) * Math.max(0, Math.min(1, dist / FAR_PX));
}
