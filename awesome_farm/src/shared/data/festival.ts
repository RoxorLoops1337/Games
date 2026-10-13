// Festival eve, the pure part (the client reads it to make lit lanterns glow; the rules are in sim/festival.ts).

import { seasonDay, SEASON_DAYS } from '../season';

/** Is this the day of a festival (the last day of a season)? Its night is the festival night. */
export const isEve = (day: number) => seasonDay(day) === SEASON_DAYS;

/** Is this a lantern or lamp post lit for the festival of this day? */
export const festivalLit = (b: { kind: string; kd?: number }, day: number) => (b.kind === 'lantern' || b.kind === 'lamppost') && b.kd === day;
