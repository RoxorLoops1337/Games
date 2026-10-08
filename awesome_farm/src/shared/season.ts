// Seasons: a year is four weeks of game days. Pure functions of the day number, so the server
// and every client agree without sending anything (like the weather).

import { PAL } from './palette';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_DAYS = 7;
export const SEASON_ORDER: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

interface SeasonDef {
    name: string;
    blurb: string;          // shown in the banner when it begins
    color: number;          // UI accent
    tint: number;           // multiplied over the world (near white, so it stays subtle)
    grow: number;           // crop growth speed
    yield: number;          // chance of one extra crop on harvest
    rain: number;           // how often it rains compared with the base chance
    night: number;          // night length compared with the base
}

export const SEASONS: Record<SeasonId, SeasonDef> = {
    spring: { name: 'Spring', blurb: 'Crops grow fast and the rain comes more often.', color: PAL.lime, tint: 0xf6ffee, grow: 1.25, yield: 0, rain: 1.5, night: 1 },
    summer: { name: 'Summer', blurb: 'Long, warm days and short nights.', color: PAL.gold, tint: 0xfff8e2, grow: 1, yield: 0, rain: 0.7, night: 0.8 },
    autumn: { name: 'Autumn', blurb: 'Harvest time: crops often give one more.', color: PAL.pumpkin, tint: 0xffe8cc, grow: 1, yield: 0.4, rain: 1.1, night: 1.05 },
    winter: { name: 'Winter', blurb: 'Crops barely grow and the nights are long. Keep a fire lit.', color: PAL.foam, tint: 0xe6eeff, grow: 0.45, yield: 0, rain: 1, night: 1.3 },
};

export const seasonOf = (day: number): SeasonId => SEASON_ORDER[Math.floor((day - 1) / SEASON_DAYS) % SEASON_ORDER.length];
/** 1..7 */
export const seasonDay = (day: number) => ((day - 1) % SEASON_DAYS) + 1;
export const yearOf = (day: number) => Math.floor((day - 1) / (SEASON_DAYS * SEASON_ORDER.length)) + 1;
export const seasonDef = (day: number) => SEASONS[seasonOf(day)];
