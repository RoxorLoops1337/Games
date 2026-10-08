// Weather is a pure function of the world seed, the day and the time of day, so the server
// and every client agree without sending anything. Some days it rains; the rain waters
// crops (they grow faster) and draws wild creatures out.

import { TUNING } from './config';
import { seasonDay, seasonDef, seasonOf, type SeasonId } from './season';

/** A small stable hash → 0..1. */
export function hash (seed: string, n: number, salt: number) {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= n; h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** Special nights. Every seventh night is a Blood Moon; others bring meteors or fairies now and then. */
export type NightEvent = 'bloodmoon' | 'meteors' | 'fairies' | null;
export function nightEvent (seed: string, day: number): NightEvent {
    if (day >= 7 && day % 7 === 0) return 'bloodmoon';
    if (day < 3) return null;
    const r = hash(seed, day, 11);
    return r < 0.1 ? 'meteors' : r < 0.19 ? 'fairies' : null;
}
export const NIGHT_EVENTS: Record<Exclude<NightEvent, null>, { name: string; sub: string }> = {
    bloodmoon: { name: 'Blood Moon', sub: 'More monsters, stronger monsters — and twice the spoils. Survive until dawn.' },
    meteors: { name: 'Meteor Shower', sub: 'Stars are falling onto your land. Ore and crystal will be waiting at dawn.' },
    fairies: { name: 'Fairy Night', sub: 'Everyone is healed and feeling lucky. The wild folk are out in numbers.' },
};

interface Weather {
    rain: number;        // 0..1
    storm: boolean;      // heavy rain with lightning
    fog: number;         // 0..1
}

const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** The rain of one day, decided from the seed: when it starts (seconds after dawn), how long it lasts, and whether it is a storm (heavy rain with lightning) rather than a light shower. */
interface RainPlan { start: number; len: number; heavy: boolean }

/** Does it rain on this day, and when? The one place that says so: `weatherAt` and the forecast both read it, so they cannot disagree. */
export function rainPlan (seed: string, day: number): RainPlan | null {
    if (!(day > 1 && hash(seed, day, 1) < 0.24 * seasonDef(day).rain)) return null;
    const total = TUNING.dayLength + TUNING.nightLength;
    return { start: 15 + hash(seed, day, 2) * (total - 110), len: 45 + hash(seed, day, 3) * 70, heavy: hash(seed, day, 4) < 0.4 };
}

/** Is there a morning fog on this day? (It lifts before the day is half over.) */
export const foggyDay = (seed: string, day: number) => hash(seed, day, 5) < 0.18;

/** `clock` is seconds since this day's dawn (day then night). */
export function weatherAt (seed: string, day: number, clock: number): Weather {
    const plan = rainPlan(seed, day);
    let rain = 0, storm = false;
    if (plan) {
        const into = clock - plan.start;
        rain = Math.min(smooth(into / 10), smooth((plan.len - into) / 10));
        rain *= plan.heavy ? 1 : 0.6;
        storm = plan.heavy && rain > 0.6;
    }
    const fog = foggyDay(seed, day) ? smooth(clock / 12) * smooth((TUNING.dayLength * 0.45 - clock) / 14) : 0;
    return { rain, storm, fog };
}

// ── the forecast (the weather vane) ─────────────────────────────────────────
/** Which part of the day a time belongs to: the daylight is cut in three, and what comes after it is the night. */
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';
export function dayPart (clock: number): DayPart {
    const d = TUNING.dayLength;
    return clock < d / 3 ? 'morning' : clock < (d * 2) / 3 ? 'afternoon' : clock < d ? 'evening' : 'night';
}

/** What one day will bring, read from the same hashes as the real weather. */
export interface DayForecast {
    day: number;
    /** 0 today, 1 tomorrow, … */
    ahead: number;
    season: SeasonId;
    /** 1..7 */
    seasonDay: number;
    /** The first morning of a season. */
    seasonStart: boolean;
    /** Rain, if any: the part of the day its middle falls in, whether it is a storm, and the plan it came from. */
    rain: { part: DayPart; storm: boolean; start: number; len: number } | null;
    /** A fog over the morning. */
    fog: boolean;
    /** What the night of this day brings (or null: a calm night). */
    night: NightEvent;
}

/** Today and the next days (4 by default), from the seed alone: `weatherAt` and `nightEvent` agree with every line of it (tests/weather.test.ts walks the clock to check). */
export function forecast (seed: string, day: number, days = 4): DayForecast[] {
    const out: DayForecast[] = [];
    for (let i = 0; i < days; i++) {
        const d = day + i, plan = rainPlan(seed, d);
        out.push({
            day: d, ahead: i, season: seasonOf(d), seasonDay: seasonDay(d), seasonStart: seasonDay(d) === 1,
            rain: plan ? { part: dayPart(plan.start + plan.len / 2), storm: plan.heavy, start: plan.start, len: plan.len } : null,
            fog: foggyDay(seed, d),
            night: nightEvent(seed, d),
        });
    }
    return out;
}
