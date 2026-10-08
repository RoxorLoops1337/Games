// The weather vane's words: how a forecast (shared/weather.ts: `forecast`) is told in plain language, which picture goes
// with it and what to do about it. Pure, so the window, the vane in the world and the tests read the same text. Every
// claim in a hint is read from the rules (TUNING, the seasons, the night events), so it cannot drift away from the game.

import { TUNING } from '../config';
import { PAL } from '../palette';
import { SEASONS } from '../season';
import { NIGHT_EVENTS, SCHOLAR_DAY, type DayForecast, type DayPart } from '../weather';

/** "in the afternoon": when in the day the rain falls. */
const WHEN: Record<DayPart, string> = { morning: 'in the morning', afternoon: 'in the afternoon', evening: 'in the evening', night: 'after dark' };

/** Today, Tomorrow, In 2 days… */
export const dayLabel = (f: Pick<DayForecast, 'ahead'>) => (f.ahead === 0 ? 'Today' : f.ahead === 1 ? 'Tomorrow' : `In ${f.ahead} days`);
/** "Summer, day 3": the season and the day of it. */
export const seasonLabel = (f: Pick<DayForecast, 'season' | 'seasonDay'>) => `${SEASONS[f.season].name}, day ${f.seasonDay}`;

/** The daytime in words: "light rain in the afternoon", "a storm in the evening", "foggy morning", "dry and clear". */
export function skyWords (f: DayForecast): string {
    const rain = f.rain ? `${f.rain.storm ? 'a storm' : 'light rain'} ${WHEN[f.rain.part]}` : '';
    if (f.fog && rain) return `foggy morning, ${rain}`;
    return rain || (f.fog ? 'foggy morning' : 'dry and clear');
}

/** The night in words: "calm night", "Blood Moon night"… */
export function nightWords (f: DayForecast): string {
    return f.night === 'bloodmoon' ? 'Blood Moon night' : f.night === 'meteors' ? 'meteor shower at night' : f.night === 'fairies' ? 'fairy night' : 'calm night';
}

/** One row of the window: "Light rain in the afternoon, calm night". */
export function dayWords (f: DayForecast): string {
    const s = `${skyWords(f)}, ${nightWords(f)}`;
    return s[0].toUpperCase() + s.slice(1);
}

/** The picture for the daytime and for the night (glyph keys: client/art/icons.ts). */
export const dayIcon = (f: DayForecast) => (f.rain ? (f.rain.storm ? 'k_storm' : 'k_rain') : f.fog ? 'k_fog' : 'k_sun');
export const nightIcon = (f: DayForecast) => (f.night === 'bloodmoon' ? 'k_blood' : f.night === 'meteors' ? 'k_meteor' : f.night === 'fairies' ? 'k_fairy' : 'k_moon');
/** The one small picture over the vane in the world: the most noteworthy thing the day brings. */
export const vaneIcon = (f: DayForecast) => (f.night === 'bloodmoon' ? 'k_blood' : f.rain ? dayIcon(f) : f.night ? nightIcon(f) : f.fog ? 'k_fog' : 'k_sun');

/** A coloured tag for the days and nights that matter: a Blood Moon first, then Scholar's Day (the row's words name any other night). */
export function eventTag (f: DayForecast): { text: string; color: number } | null {
    if (f.study && f.night !== 'bloodmoon') return { text: SCHOLAR_DAY.name, color: PAL.plum };
    if (f.night) return { text: NIGHT_EVENTS[f.night].name, color: f.night === 'bloodmoon' ? PAL.berry : f.night === 'meteors' ? PAL.gold : PAL.blossom };
    return null;
}

const SOON = (n: number, night = false) => (n === 0 ? (night ? 'tonight' : 'today') : n === 1 ? (night ? 'tomorrow night' : 'tomorrow') : `in ${n} days`);

/**
 * What to do about it, in one short line, for the most important thing coming: a Blood Moon, then rain, a new season, the
 * other night events, fog. `clock` (seconds since dawn) lets today's rain and fog count only while they are still to come.
 */
export function forecastHint (list: DayForecast[], clock = 0): string {
    const blood = list.find((f) => f.night === 'bloodmoon');
    if (blood) return `Blood Moon ${SOON(blood.ahead, true)}: stock up on potions and food and keep a fire lit. Its monsters drop double coins.`;
    const study = list.find((f) => f.study);
    if (study) return `${SCHOLAR_DAY.name} ${SOON(study.ahead)}: double XP from everything until dawn. Save your XP brews for it: they stack.`;
    const wet = list.find((f) => f.rain && (f.ahead > 0 || clock < f.rain.start + f.rain.len));
    if (wet) return `Rain ${SOON(wet.ahead)}: crops grow up to ${Math.round(TUNING.rainGrow * 100)}% faster while it falls, so plant before it. Koi bite in the rain.`;
    const turn = list.find((f) => f.seasonStart && f.ahead > 0);
    if (turn) return `${SEASONS[turn.season].name} begins ${SOON(turn.ahead)}. ${SEASONS[turn.season].blurb}`;
    const sky = list.find((f) => f.night);
    if (sky) return `${NIGHT_EVENTS[sky.night!].name} ${SOON(sky.ahead, true)}. ${NIGHT_EVENTS[sky.night!].sub}`;
    const mist = list.find((f) => f.fog && (f.ahead > 0 || clock < TUNING.dayLength * 0.45));
    if (mist) return `Fog ${SOON(mist.ahead)}: it hangs over the morning and lifts before noon.`;
    return 'Calm days ahead: a good time to build.';
}
