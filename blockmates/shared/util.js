import { DAY_SECONDS } from './data.js';
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// phase 0 = sunrise, .25 noon, .5 sunset, .75 midnight
export function phaseOf(time) { return ((time % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS / DAY_SECONDS; }
export function daylight(time) { return sstep(-0.18, 0.3, Math.sin(phaseOf(time) * Math.PI * 2)); }
export const isNight = (time) => daylight(time) < 0.35;
