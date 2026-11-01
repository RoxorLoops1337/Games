// Drop the Bass, hub round 2: new settings (migration), a11y helpers, perf watch, reset countdowns, hub hints, language offer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../drop_the_bass/js/meta.js';
import { applyA11y, textScale, colorblind, BIGTEXT_SCALE, makePerfWatch, PERF, langOffer } from '../drop_the_bass/js/a11y.js';
import { durationText, resetText } from '../drop_the_bass/js/countdown.js';
import { HINTS } from '../drop_the_bass/js/data_story.js';
import { HINTS_EXTRA } from '../drop_the_bass/js/data_hints_extra.js';
import { setLang } from '../drop_the_bass/js/i18n.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const DASH = String.fromCharCode(8212);
const NOW = Date.UTC(2026, 9, 24, 12);
setLang('en');

// ---- settings: defaults, migration of an old save, sanitising
{
  const p = M.newProfile(NOW);
  ok(p.settings.colorblind === false && p.settings.bigtext === false && p.settings.autolow === true, 'defaults');
  const old = M.newProfile(NOW); delete old.settings.colorblind; delete old.settings.bigtext; delete old.settings.autolow;
  const m = M.migrate(JSON.parse(JSON.stringify(old)), NOW);
  ok(m.settings.colorblind === false && m.settings.bigtext === false && m.settings.autolow === true, 'old save gets the new settings');
  const junk = M.newProfile(NOW); junk.settings.colorblind = 'yes'; junk.settings.bigtext = 1; junk.settings.autolow = 0;
  const j = M.migrate(JSON.parse(JSON.stringify(junk)), NOW);
  ok(j.settings.colorblind === true && j.settings.bigtext === true && j.settings.autolow === false, 'values become booleans');
  const back = M.parseSave(M.serialize(j), NOW);
  ok(back.settings.bigtext === true && back.settings.autolow === false, 'round trip keeps them');
}

// ---- a11y helpers
{
  ok(textScale() === 1 && colorblind() === false, 'neutral before apply');
  applyA11y({ bigtext: true, colorblind: true });
  ok(textScale() === BIGTEXT_SCALE && BIGTEXT_SCALE > 1 && BIGTEXT_SCALE < 1.2 && colorblind() === true, 'applied');
  applyA11y({ bigtext: false, colorblind: false });
  ok(textScale() === 1 && colorblind() === false, 'reset');
  applyA11y(undefined); ok(textScale() === 1, 'undefined settings are fine');
}

// ---- perf watch: slow battle fires once, a fast one never, gaps and pauses are ignored
{
  const slow = makePerfWatch(); let fired = 0;
  for (let i = 0; i < 400; i++) if (slow.sample(40, true)) fired++;
  ok(fired === 1, 'slow play fires exactly once');
  const fast = makePerfWatch(); fired = 0;
  for (let i = 0; i < 1000; i++) if (fast.sample(16.7, true)) fired++;
  ok(fired === 0, 'smooth play never fires');
  const gaps = makePerfWatch(); fired = 0;
  for (let i = 0; i < 400; i++) if (gaps.sample(900, true)) fired++;
  ok(fired === 0, 'long gaps (tab switch) are not slowness');
  const paused = makePerfWatch(); fired = 0;
  for (let i = 0; i < 400; i++) if (paused.sample(60, false)) fired++;
  ok(fired === 0 && PERF.MIN_FPS > 20, 'paused or menus never fire');
}

// ---- reset countdowns
{
  const H = 3600000, MI = 60000;
  ok(durationText(5 * H + 20 * MI) === '5h 20m', 'hours and minutes: ' + durationText(5 * H + 20 * MI));
  ok(durationText(20 * MI) === '20m' && durationText(1000) === '1m', 'minutes, never 0m');
  ok(durationText(3 * 24 * H + 5 * H + 10 * MI) === '3d 5h', 'days and hours');
  ok(resetText(2 * H) === 'Resets in 2h 0m', 'resetText ' + resetText(2 * H));
  const d = M.dailyResetMs(NOW);
  ok(d > 0 && d <= 86400000, 'daily within a day');
  ok(M.dayOf(NOW + d) === M.dayOf(NOW) + 1 && M.dayOf(NOW + d - 1) === M.dayOf(NOW), 'daily reset is exactly the day change');
  const w = M.weeklyResetMs(NOW);
  ok(w > 0 && w <= 7 * 86400000, 'weekly within a week');
  ok(M.isoWeek(NOW + w).id !== M.isoWeek(NOW).id && M.isoWeek(NOW + w - 1).id === M.isoWeek(NOW).id, 'weekly reset is the ISO week change');
  // Saturday 2026-10-24 12:00 UTC: Monday 00:00 is 1.5 days away
  ok(w === 36 * H, 'weekly from Saturday noon is 36h');
  ok(M.weeklyGig(M.newProfile(NOW), NOW).msLeft === w, 'matches weeklyGig.msLeft');
}

// ---- hub hints: text exists, one per id, no em dashes; the language offer fires once and only for a different device language
{
  const ids = ['hint_setlist', 'hint_wardrobe', 'hint_skin_buy', 'hint_studio_scene', 'hint_weekly'];
  for (const id of ids) ok(HINTS_EXTRA[id] && HINTS[id] && HINTS[id].title && HINTS[id].text.length > 30 && !(HINTS[id].title + HINTS[id].text).includes(DASH), 'hint ' + id);
  const p = M.newProfile(NOW);
  ok(langOffer(p, ['da-DK', 'en'], 'en') === 'da', 'device Danish, game English: offer');
  ok(langOffer(p, ['nl'], 'nl') === null, 'game already in the device language');
  ok(langOffer(p, ['fr-FR'], 'en') === null && langOffer(p, ['en-US'], 'en') === null, 'device English or unsupported: nothing');
  ok(langOffer(p, ['nb-NO'], 'en') === 'da', 'Norwegian reads as Danish');
  p.tutorial.hints.lang_offer = true;
  ok(langOffer(p, ['de'], 'en') === null, 'only once');
}

// ---- cosmetics hint trigger
{
  const p = M.newProfile(NOW);
  p.diamonds = 0; ok(M.cosmeticAffordable(p) === false, 'broke: nothing to buy');
  p.diamonds = 100000; ok(M.cosmeticAffordable(p) === true, 'rich: a skin or outfit can be bought');
}

// ---- source rules for the files of this round
for (const f of ['a11y.js', 'countdown.js', 'ui_core.js', 'ui_hub.js', 'ui_setlist.js', 'ui_wardrobe.js', 'data_hints_extra.js']) ok(!readFileSync(new URL('../drop_the_bass/js/' + f, import.meta.url), 'utf8').includes(DASH), 'no em dash in ' + f);
console.log('drop_the_bass hub2: ' + n + ' checks passed');
