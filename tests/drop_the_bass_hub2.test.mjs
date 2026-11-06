// Drop the Bass, hub round 2: new settings (migration), a11y helpers, perf watch, reset countdowns, hub hints, language offer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../drop_the_bass/js/meta.js';
import { applyA11y, textScale, colorblind, BIGTEXT_SCALE, langOffer } from '../drop_the_bass/js/a11y.js';
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

// ---- the perf watch moved into the battle view (auto low graphics); a11y.js no longer carries a copy
{
  const src = readFileSync(new URL('../drop_the_bass/js/a11y.js', import.meta.url), 'utf8');
  ok(!/makePerfWatch|PERF\b/.test(src), 'a11y.js has no dead perf watch');
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

// ---- hint pile-up: one at a time, 20 s apart, not over the Setlist, the skin hint only after the first clear
{
  const C = await import('../drop_the_bass/js/ui_core.js');
  let clock = 1000000; C.setHintClock(() => clock); C.resetHintState();
  const shown = []; let open = null;
  const app = { profile: M.newProfile(NOW), save() {}, hooks: { onHint: (id, fin) => { shown.push(id); open = fin; } } };
  app.profile.tutorial.done = true;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const close = () => { const f = open; open = null; if (f) f(); };
  ok(C.hubHint(app, 'hint_wardrobe') === true, 'first hint is accepted');
  ok(C.hubHint(app, 'hint_studio_scene') === false && !app.profile.tutorial.hints.hint_studio_scene, 'a second hint while one is pending is refused and not marked seen');
  await wait(520); ok(shown.join() === 'hint_wardrobe', 'only the first one shows');
  ok(C.hubHint(app, 'hint_studio_scene') === false, 'refused while the card is open');
  close();
  ok(C.hubHint(app, 'hint_studio_scene') === false, 'refused right after a hint (20 s gap)');
  clock += 19000; ok(C.hubHint(app, 'hint_studio_scene') === false, 'still inside 20 s');
  clock += 1500; ok(C.hubHint(app, 'hint_studio_scene') === true, 'accepted after 20 s');
  await wait(520); ok(shown.join() === 'hint_wardrobe,hint_studio_scene', 'queued hint came on a later screen'); close();
  ok(C.hubHint(app, 'hint_studio_scene') === false, 'a seen hint never repeats');
  // the Setlist sheet: only hint_setlist may show over it
  clock += 25000;
  globalThis.document = { querySelector: (q) => (q === '.setlist' ? {} : null) };
  ok(C.hubHint(app, 'hint_weekly') === false && !app.profile.tutorial.hints.hint_weekly, 'no other hint over the Setlist');
  ok(C.hubHint(app, 'hint_setlist') === true, 'hint_setlist itself is fine'); await wait(520); close();
  delete globalThis.document;
  // skin offer needs a cleared stage
  clock += 25000;
  app.profile.diamonds = 100000;
  ok(C.hubHint(app, 'hint_skin_buy') === false && !app.profile.tutorial.hints.hint_skin_buy, 'no skin offer before the first stage is cleared');
  app.profile.prog.garage.cleared = true;
  ok(C.hubHint(app, 'hint_skin_buy') === true, 'skin offer after the first clear'); await wait(520); close();
  ok(shown.at(-1) === 'hint_skin_buy', 'skin offer shown');
  // a hint that is dropped at the last moment still runs its done callback (the Weekly Gig start)
  clock += 25000; let fired = 0;
  globalThis.document = { querySelector: () => null };
  ok(C.hubHint(app, 'hint_weekly', () => fired++) === true, 'weekly accepted');
  globalThis.document = { querySelector: (q) => (q === '.setlist' ? {} : null) };
  await wait(520); ok(fired === 1 && !app.profile.tutorial.hints.hint_weekly, 'dropped hint calls done and stays unseen');
  delete globalThis.document; C.setHintClock(null); C.resetHintState();
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
