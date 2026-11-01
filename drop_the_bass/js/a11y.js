// a11y.js: the two accessibility settings the canvas and the DOM both read. main.js calls applyA11y(profile.settings) whenever the settings
// change (and once at boot), the HUD asks textScale() when it sizes text, any art that needs a non-colour cue asks colorblind().
// Defaults (nothing applied yet) are 1 and false, so headless tests and the lab pages need no setup.
import { detectLang } from './i18n.js';
let big = false, cb = false;
export const BIGTEXT_SCALE = 1.12;     // canvas text multiplier; the DOM uses CSS zoom 1.15 (see ui_doodle.css body.bigtext)
export function applyA11y(s) {
  big = !!(s && s.bigtext); cb = !!(s && s.colorblind);
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('bigtext', big);
    document.body.classList.toggle('colorblind', cb);
  }
}
export const textScale = () => (big ? BIGTEXT_SCALE : 1);
export const colorblind = () => cb;

// Slow-device watch for "Auto low graphics when slow". Feed it every frame with the real frame time in ms and whether a battle is actively
// running; it returns true once, when the average over WINDOW seconds of active play stays below MIN_FPS. Gaps (tab switch, pause) are skipped.
export const PERF = { WINDOW: 4, MIN_FPS: 34, GAP_MS: 250 };
export function makePerfWatch() {
  let acc = 0, n = 0, fired = false;
  return {
    sample(ms, active) {
      if (fired) return false;
      if (!active || !(ms > 0) || ms > PERF.GAP_MS) { if (!active) { acc = 0; n = 0; } return false; }
      acc += ms; n++;
      if (acc < PERF.WINDOW * 1000) return false;
      const fps = n / (acc / 1000);
      acc = 0; n = 0;
      if (fps < PERF.MIN_FPS) { fired = true; return true; }
      return false;
    },
  };
}

// One-time language offer: the device speaks da, nl or de but the game is showing something else (an explicit English pick, for example).
// Returns the language code to offer, or null (already offered, device is English, or the game already uses it).
export function langOffer(profile, navLangs, curLang) {
  if (!profile || (profile.tutorial && profile.tutorial.hints && profile.tutorial.hints.lang_offer)) return null;
  const target = detectLang(navLangs);
  return target !== 'en' && target !== curLang ? target : null;
}
