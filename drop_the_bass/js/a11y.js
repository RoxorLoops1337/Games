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

// One-time language offer: the device speaks da, nl or de but the game is showing something else (an explicit English pick, for example).
// Returns the language code to offer, or null (already offered, device is English, or the game already uses it).
export function langOffer(profile, navLangs, curLang) {
  if (!profile || (profile.tutorial && profile.tutorial.hints && profile.tutorial.hints.lang_offer)) return null;
  const target = detectLang(navLangs);
  return target !== 'en' && target !== curLang ? target : null;
}
