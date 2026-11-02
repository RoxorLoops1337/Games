// countdown.js: "Resets in 5h 20m" text for the Daily Challenge and Weekly Gig cards. Pure apart from t(); abbreviations keep it plural-safe.
import { t } from './i18n.js';
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
// ms -> '3d 5h' | '5h 20m' | '20m' (never shows 0m: the last minute reads '1m')
export function durationText(ms) {
  const m = Math.max(1, Math.ceil(ms / MIN));
  const d = Math.floor(m * MIN / DAY), hh = Math.floor((m * MIN % DAY) / HOUR), mm = m % 60;
  if (d >= 1) return t('time.d_h', '{d}d {h}h', { d, h: hh });
  if (hh >= 1) return t('time.h_m', '{h}h {m}m', { h: hh, m: mm });
  return t('time.m', '{m}m', { m: mm });
}
export const resetText = (ms) => t('hub.resets_in', 'Resets in {time}', { time: durationText(ms) });
