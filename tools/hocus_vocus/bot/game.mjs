// Echowake balance bot: game loader and small shared helpers.
//
// loadGame() boots the real RUN / COMBAT / MAP / META scripts (plus every data file) in the headless sandbox from
// tests/hocus_vocus_lib.mjs, once per process, and returns { U, DATA, COMBAT, MAP, RUN, META }. No DOM is touched.
// Nothing in the bot reads the clock or uses an unseeded random source: every random choice goes through U.rng.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '../../../tests/hocus_vocus_lib.mjs';

let cached = null;

export function loadGame() {
  if (cached) return cached;
  const api = boot({ only: ['run', 'combat', 'map', 'meta'] });
  if (api._errors && api._errors.length) throw new Error('bot: game scripts failed to load: ' + JSON.stringify(api._errors.map((e) => e.file + ': ' + e.message)));
  // Intent text is only for the UI; the bot reads the numeric fields, and building text is a big share of the planner's time.
  api.DATA.intentText = () => '';
  cached = { U: api.U, DATA: api.DATA, COMBAT: api.COMBAT, MAP: api.MAP, RUN: api.RUN, META: api.META };
  return cached;
}

export const HERE = path.dirname(fileURLToPath(import.meta.url));

export const HERO_IDS = ['hanae', 'kuro', 'suzu', 'raiga'];
export const ALL_PAIRS = [['hanae', 'kuro'], ['hanae', 'suzu'], ['hanae', 'raiga'], ['kuro', 'suzu'], ['kuro', 'raiga'], ['suzu', 'raiga']];

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
export const round1 = (x) => Math.round(x * 10) / 10;
export const round3 = (x) => Math.round(x * 1000) / 1000;
