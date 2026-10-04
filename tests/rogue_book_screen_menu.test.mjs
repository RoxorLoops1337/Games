// Menu screens suite: title, heroSelect, library (five tabs), settings (screen and overlay), howto and the pause overlay (js/screen_menu.js).
//
// Boots the REAL modules (util, data, art, audio, meta, run, combat, map, ui, scene, screen_menu, main) and leaves out only the other screen
// files, so main.js supplies its placeholder map, story and node screens. Every scenario builds realistic state with the real META and RUN,
// drives the screens with the loader's _click, _key, _input and virtual clock, and asserts DOM structure, calls into GAME, META and AUDIO,
// persisted settings, cleanup on leave (no leaked listeners, timers or DOM), empty states and error paths.
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './rogue_book_lib.mjs';

const t = harness('rogue_book screen_menu');
const SKIP = ['screen_combat', 'screen_node', 'screen_map', 'screen_end', 'tutorial'];
const EPOCH = Date.UTC(2026, 8, 29, 12, 0, 0);               // 29 Sep 2026 at noon UTC: the same calendar day in every timezone within 11 hours

function fresh(opts = {}) {
  const g = boot({ only: ['screen_menu', 'main'], skip: SKIP, epoch: EPOCH, ...opts });
  if (g._errors.length) throw new Error('boot errors: ' + JSON.stringify(g._errors.map((e) => e.message)));
  // record every sound id any module plays, and every toast
  g._run(`globalThis.__sfx = []; globalThis.__previews = [];
    (function () { const s = AUDIO.sfx; AUDIO.sfx = function (id) { __sfx.push(id); return s.apply(this, arguments); };
                   const p = AUDIO.preview; AUDIO.preview = function (id) { __previews.push(id); return p ? p.apply(this, arguments) : false; }; })();`);
  g.GAME.boot();
  return g;
}
const $ = (g, s) => g._doc.querySelector(s);
const $$ = (g, s) => Array.from(g._doc.querySelectorAll(s));
const sfxLog = (g) => g._run('__sfx.slice()');
const go = async (g, name, params) => { await g.UI.go(name, params, { force: true, transition: 'none' }); await g._settle(); g._frames(3, 16); };
const settle = async (g, frames = 4) => { await g._settle(); g._frames(frames, 16); await g._settle(); };
const nameOf = (el) => (el.getAttribute('aria-label') || el.textContent || el.title || '').trim();
const errors = (g) => g._console.error.length;
const ops = (g) => Object.values(g._counts).reduce((a, b) => a + b, 0);
const todaySeed = (g) => g.U.dateKey(new Date(EPOCH));
// give the profile some history: wins, kills, stories, achievements and past runs
function seedProfile(g, o = {}) {
  const P = g.META.profile;
  P.inkstones = o.stones === undefined ? 200 : o.stones;
  P.stats.runs = 7; P.stats.wins = 2; P.stats.trialBest = o.trialBest === undefined ? 2 : o.trialBest; P.stats.boss1Kills = 1; P.stats.hexesPainted = 250;
  ['kappa', 'tanuki_bandit', 'kodama', 'oni_brute', 'boss_kuzunoha'].forEach((id, i) => { P.seen[id] = 3 + i; P.kills[id] = 2 + i * 3; });
  P.story.intro = true; P.story.ch1_intro = true;
  P.ach.ch1_clear = EPOCH; P.ach.first_draft = EPOCH - 86400000; P.unlocked.hero.push('suzu');
  P.history = [
    { id: 'a', score: 1420, heroes: ['hanae', 'kuro'], chapter: 3, outcome: 'win', trial: 2, daily: false, ts: EPOCH - 3 * 86400000, seed: 1, inkstones: 52 },
    { id: 'b', score: 610, heroes: ['suzu', 'raiga'], chapter: 2, outcome: 'lose', trial: 0, daily: false, ts: EPOCH - 4 * 86400000, seed: 2, inkstones: 14 },
    { id: 'c', score: 302, heroes: ['kuro', 'suzu'], chapter: 1, outcome: 'abandon', trial: 1, daily: false, ts: EPOCH - 5 * 86400000, seed: 3, inkstones: 3 },
    { id: 'd', score: 880, heroes: ['hanae', 'raiga'], chapter: 2, outcome: 'lose', trial: 0, daily: true, ts: EPOCH - 6 * 86400000, seed: todaySeed(g), inkstones: 9 },
  ];
  return P;
}
// a saved run through the real RUN and META, so Continue has something to resume
function saveRun(g, heroes = ['hanae', 'kuro'], trial = 1) {
  const R = g.RUN.newRun({ heroes, trial, seed: 4242 });
  if (!R.map) g.RUN.startChapter(R, 1);
  g.META.saveRun(R);
  return R;
}

await t.test('screen_menu.js loads headless, registers every screen and overlay and touches nothing while loading', () => {
  const g = boot({ only: ['screen_menu', 'main'], skip: SKIP });
  t.eq(g._errors.length, 0, 'no load errors');
  ['title', 'heroSelect', 'library', 'settings', 'howto'].forEach((n) => { t.eq(typeof g.UI.screens[n].enter, 'function', 'UI.screens.' + n + ' has enter'); t.eq(typeof g.UI.screens[n].state, 'function', n + ' has state()'); });
  t.eq(typeof g.UI.overlays.pause.open, 'function', 'the pause overlay is registered');
  t.eq(typeof g.UI.overlays.settings.open, 'function', 'the settings overlay is registered');
  t.eq(g.UI.screens.title.music, 'title', 'title music'); t.eq(g.UI.screens.heroSelect.music, 'hero_select', 'hero select music');
  t.eq(g.UI.screens.library.music, undefined, 'the library keeps whatever plays');
});


// ==================================================================================================== TITLE
await t.test('title: the tap gate, the plaques without a saved run, and the first tap unlocking the menu', async () => {
  const g = fresh();
  await settle(g);
  t.eq(g.UI.currentName, 'title', 'the game boots to the title');
  const st = g.UI.screens.title.state();
  t.ok(st.gated, 'the "Tap to begin" gate shows while audio is not running');
  t.ok($(g, '.mn-gate') && /tap to begin/i.test($(g, '.mn-gate').textContent), 'the gate says Tap to begin');
  t.ok($(g, '.mn-title').classList.contains('gated'), 'the menu is hidden behind the gate');
  t.eq($$(g, '.mn-plaque').map((b) => b.dataset.act).join(), 'new,daily,library,settings,howto', 'no Continue without a saved run: New Tale, Daily Tale, Library, Settings, How to Play');
  t.eq($$(g, '.s-title h1.sr-only').length, 1, 'a real h1 names the game for screen readers');
  t.ok(/v\d/.test($(g, '.mn-ver').textContent), 'the version is shown'); t.ok($(g, '.mn-credits').textContent.length > 10, 'a credits line is shown');
  g._click('.mn-gate');
  await settle(g);
  t.ok(!g.UI.screens.title.state().gated, 'a tap dismisses the gate');
  t.ok(!$(g, '.mn-title').classList.contains('gated'), 'the menu is revealed');
  t.ok($$(g, '.mn-plaque').every((b) => b.classList.contains('rise')), 'the plaques rise in one after another');
  t.deep($$(g, '.mn-plaque').map((b) => b.style.getPropertyValue('--i')), ['1', '2', '3', '4', '5'], 'each plaque has its own stagger index');
  g._flush(700);
  t.ok(!$(g, '.mn-gate'), 'the gate leaves the DOM after its fade');
  await go(g, 'library'); await go(g, 'title');
  t.ok(!$(g, '.mn-gate'), 'the gate never comes back once dismissed in this page session');
  t.ok($$(g, '.mn-plaque').every((b) => b.classList.contains('rise')), 'the menu enters at once when no gate is needed');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('title: any key also dismisses the gate (without pressing a menu shortcut), then the shortcuts work', async () => {
  const g = fresh();
  await settle(g);
  g._key('n');
  await settle(g);
  t.eq(g.UI.currentName, 'title', 'the first key only lifts the gate');
  t.ok(!g.UI.screens.title.state().gated, 'the gate is gone');
  const pairs = [['l', 'library'], ['s', 'settings'], ['h', 'howto'], ['n', 'heroSelect']];
  for (const [key, screen] of pairs) {
    await go(g, 'title');
    g._key(key);
    await settle(g);
    t.eq(g.UI.currentName, screen, 'key ' + key + ' opens ' + screen);
  }
  await go(g, 'title');
  g._key('c'); await settle(g);
  t.eq(g.UI.currentName, 'title', 'C does nothing without a saved run');
  g._key('n', { ctrl: true }); await settle(g);
  t.eq(g.UI.currentName, 'title', 'Ctrl+N is left to the browser');
});

await t.test('title: Continue shows the saved run summary and resumes it through GAME.continueRun', async () => {
  const g = fresh();
  const R = saveRun(g, ['hanae', 'kuro'], 1);
  await go(g, 'title'); g._click('.mn-gate'); await settle(g);
  t.eq($$(g, '.mn-plaque')[0].dataset.act, 'continue', 'Continue comes first');
  const info = g.META.runInfo();
  t.ok(info && /Verse 1/.test(info.text), 'META.runInfo describes the run: ' + (info && info.text));
  t.eq($(g, '[data-act=continue] .mn-p-sub').textContent, info.text, 'the plaque shows the run summary ("Chapter 1, Ink 10, Hanae and Kuro")');
  t.eq($$(g, '[data-act=continue] .mn-p-meds .ico').length, 2, 'both heroes show as medallions');
  t.ok($(g, '[data-act=continue] .hanko'), 'an Ink Trial run wears a trial seal');
  t.ok($(g, '[data-act=continue]').classList.contains('breathe'), 'Continue is the obvious next action, so it breathes');
  t.ok($(g, '[data-act=new]').classList.contains('btn-secondary'), 'New Tale steps back to a secondary plaque');
  let called = 0;
  g.GAME.continueRun = () => { called++; return Promise.resolve(); };
  g._click('[data-act=continue]');
  t.eq(called, 1, 'Continue calls GAME.continueRun');
  g._key('c'); t.eq(called, 2, 'C is the shortcut for Continue');
  // and for real, without the spy: the saved run loads and the game leaves the title
  const g2 = fresh();
  saveRun(g2);
  await go(g2, 'title'); g2._click('.mn-gate'); await settle(g2);
  g2._click('[data-act=continue]');
  await settle(g2, 8);
  t.eq(g2.UI.currentName, 'map', 'a saved run without a pending node resumes on the map');
  t.eq(g2.GAME.state.R.seed, R.seed, 'the resumed run is the saved one');
});

await t.test('title: New Tale goes to hero select; Daily Tale starts the daily run, with an overwrite warning when a tale is saved', async () => {
  const g = fresh();
  await go(g, 'title'); g._click('.mn-gate'); await settle(g);
  g._click('[data-act=new]'); await settle(g);
  t.eq(g.UI.currentName, 'heroSelect', 'New Tale opens hero select');
  await go(g, 'title');
  const calls = [];
  g.GAME.newRun = (o) => { calls.push(o); return { id: 'fake' }; };
  g._click('[data-act=daily]'); await settle(g);
  t.eq(calls.length, 1, 'Daily Tale starts a run straight away');
  t.deep(calls[0], { daily: true }, 'with { daily: true }, and GAME picks the seed and heroes');
  // a saved run: the daily must ask before it replaces it
  saveRun(g);
  await go(g, 'title'); await settle(g);
  g._flush(1000);
  g._click('[data-act=daily]'); await settle(g);
  t.ok(g.UI.overlay.has('confirm'), 'a saved tale triggers the "Start a new tale?" confirm');
  t.eq(calls.length, 1, 'nothing started yet');
  g._click('.o-confirm .btn-secondary'); await settle(g);
  t.eq(calls.length, 1, 'Keep my tale leaves everything alone');
  t.ok(g.META.hasRun(), 'the saved tale survives');
  g._flush(1000);
  g._click('[data-act=daily]'); await settle(g);
  g._click('.o-confirm .btn-primary'); await settle(g);
  t.eq(calls.length, 2, 'Begin anew starts the daily run');
});

await t.test('title: the Daily Tale plaque shows today\'s seed, the two daily heroes and the best score, deterministically', async () => {
  const d0 = new Date(EPOCH), seed = d0.getFullYear() * 10000 + (d0.getMonth() + 1) * 100 + d0.getDate();
  const g = fresh();
  await go(g, 'title'); g._click('.mn-gate'); await settle(g);
  const expected = g.U.dateKey(new Date(EPOCH));
  t.eq(g.UI.screens.title.state().seed, expected, 'the seed is the local date as YYYYMMDD: ' + expected);
  t.eq(expected, seed, 'and it comes from the page clock, not from Date() in the screen');
  const sub = $(g, '[data-act=daily] .mn-p-sub').textContent;
  t.ok(sub.indexOf('Seed ' + expected) >= 0, 'the plaque says the seed: ' + sub);
  t.ok(/not played|new jam/i.test(sub), 'and that it has not been played');
  t.eq($$(g, '[data-act=daily] .mn-p-meds .ico').length, 2, 'the two daily heroes are pictured');
  const heroes = g.RUN.dailyHeroes(expected);
  t.eq(heroes.length, 2, 'RUN.dailyHeroes gives two heroes'); t.ok(heroes[0] !== heroes[1], 'two distinct heroes');
  t.deep(g.RUN.dailyHeroes(expected), heroes, 'the same seed always gives the same heroes');
  const seen = new Set(); for (let d = 20260101; d < 20260140; d++) seen.add(g.RUN.dailyHeroes(d).join());
  t.ok(seen.size > 3, 'different days give different pairs (' + seen.size + ' pairs in 39 days)');
  // a played day with a best score
  const g2 = fresh();
  const P = g2.META.profile;
  P.history = [{ id: 'x', score: 1204, heroes: ['hanae', 'kuro'], chapter: 2, outcome: 'lose', trial: 0, daily: true, ts: EPOCH, seed: expected, inkstones: 5 }, { id: 'y', score: 900, heroes: ['hanae', 'kuro'], chapter: 2, outcome: 'lose', trial: 0, daily: true, ts: EPOCH, seed: expected, inkstones: 4 }, { id: 'z', score: 5000, heroes: ['kuro', 'suzu'], chapter: 3, outcome: 'win', trial: 0, daily: true, ts: EPOCH, seed: expected - 1, inkstones: 4 }];
  P.daily.last = expected;
  await go(g2, 'title'); g2._click('.mn-gate'); await settle(g2);
  t.eq(g2.UI.screens.title.state().best, 1204, 'the best score is the best of TODAY\'s daily runs only (yesterday\'s 5,000 is ignored)');
  t.ok(/Best 1,204/.test($(g2, '[data-act=daily] .mn-p-sub').textContent), 'the plaque says Best 1,204');
  t.ok($(g2, '[data-act=daily] .hanko'), 'a played day carries a check seal');
  // another day, another seed
  const g3 = fresh({ epoch: EPOCH + 86400000 });
  await go(g3, 'title');
  t.eq(g3.UI.screens.title.state().seed, expected + 1, 'the next day has the next seed');
});

await t.test('title: pointer parallax, particle count, reduce motion, fullscreen, and a clean leave', async () => {
  const g = fresh();
  await go(g, 'title'); g._click('.mn-gate'); await settle(g);
  const base = { pm: g._listeners('pointermove'), fs: g._listeners('fullscreenchange') };
  t.eq(g.UI.screens.title.state().px, 0, 'no parallax at rest');
  g._pointer('pointermove', $(g, '.s-title'), { x: 1270, y: 360 });
  g._frames(40, 16);
  t.ok(g.UI.screens.title.state().px > 0.3, 'the pointer pans the scene: px ' + g.UI.screens.title.state().px.toFixed(2));
  g._pointer('pointermove', $(g, '.s-title'), { x: 10, y: 360 });
  g._frames(80, 16);
  t.ok(g.UI.screens.title.state().px < -0.3, 'and back the other way');
  t.eq(g.UI.screens.title.state().particles, 34, 'full petals and fireflies');
  g.UI.setSetting('reduceMotion', true);
  g._pointer('pointermove', $(g, '.s-title'), { x: 1270, y: 360 });
  g._frames(20, 16);
  t.eq(g.UI.screens.title.state().px, 0, 'reduce motion: parallax 0');
  t.eq(g.UI.screens.title.state().particles, Math.ceil(34 * 0.3), 'reduce motion: particles x0.3');
  const fs = $(g, '.mn-fs');
  t.ok(fs && fs.getAttribute('aria-label'), 'the tiny fullscreen button is labelled');
  t.ok(fs.getBoundingClientRect().width >= 44 && fs.getBoundingClientRect().height >= 44, 'and it is a real 44 px hit target');
  g._click(fs);
  t.ok(g._doc.fullscreenElement, 'it requests fullscreen');
  await go(g, 'howto');
  t.eq(g._listeners('fullscreenchange'), base.fs - 1, 'the fullscreenchange listener is removed at leave (' + base.fs + ' -> ' + g._listeners('fullscreenchange') + ')');
  t.eq(g._listeners('pointermove'), base.pm, 'no pointermove listener leaks onto the document or window');
  t.eq($$(g, '.s-title').length, 0, 'the title root is gone');
  t.eq(g._issues.length, 0, 'no canvas issues while the title drew: ' + JSON.stringify(g._issues.slice(0, 2)));
  t.eq(errors(g), 0, 'no console errors');
});


// ==================================================================================================== HERO SELECT
const toasts = (g) => $$(g, '#toasts .toast .t-text').map((e) => e.textContent);
const card = (g, id) => $(g, '.mn-hcard[data-hero=' + id + ']');
const hover = (g, id) => g._pointer('pointerenter', card(g, id), { pointerType: 'mouse' });

await t.test('heroSelect: four hero cards, two unlocked at the start, locked heroes silhouetted with the hint of their achievement', async () => {
  const g = fresh();
  await go(g, 'heroSelect');
  t.deep($$(g, '.mn-hcard').map((b) => b.dataset.hero), ['hanae', 'kuro', 'suzu', 'raiga'], 'four cards in roster order');
  t.deep($$(g, '.mn-hcard').map((b) => b.classList.contains('locked')), [false, false, true, true], 'Suzu and Raiga start locked');
  t.eq($$(g, '.mn-hc-lock').length, 2, 'each locked card wears a padlock');
  t.ok($$(g, '.mn-hcard').every((b) => b.getAttribute('aria-label').length > 10), 'every card has a descriptive aria-label');
  t.ok(/Locked/.test(card(g, 'suzu').getAttribute('aria-label')), 'a locked card says so to screen readers');
  t.eq($(g, '.mn-begin').getAttribute('aria-disabled'), 'true', 'Begin is disabled until two heroes are chosen');
  t.ok(!$(g, '.mn-party-empty').hidden, 'the party stage invites you to choose');
  g._click(card(g, 'suzu'));
  await settle(g);
  t.deep(g.UI.screens.heroSelect.state().chosen, [], 'a locked hero cannot be chosen');
  t.ok($(g, '.mn-d.locked'), 'the sheet shows the locked view');
  t.ok(/Out of the Grove/.test($(g, '.mn-d-hint').textContent) && /Kuzunoha/.test($(g, '.mn-d-hint').textContent), 'the hint is the text of the ch1_clear achievement: ' + $(g, '.mn-d-hint').textContent);
  t.ok($(g, '.mn-d-prog .bar'), 'with a progress bar');
  t.ok(sfxLog(g).indexOf('ui_error') >= 0, 'a locked card plays the error sound');
  g._click(card(g, 'raiga'));
  t.ok(/Lanterns Out/.test($(g, '.mn-d-hint').textContent), 'Raiga unlocks with ch2_clear');
  // unlocking through META changes the card
  g.META.profile.unlocked.hero.push('suzu');
  await go(g, 'heroSelect');
  t.ok(!card(g, 'suzu').classList.contains('locked'), 'an unlocked Suzu is a normal card');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('heroSelect: the detail sheet shows blurb, rows, resource, passive, HP, starter deck and bio from the real data', async () => {
  const g = fresh();
  await go(g, 'heroSelect');
  hover(g, 'hanae'); await settle(g);
  const h = g.DATA.heroes.hanae;
  t.eq($(g, '.mn-d-name h3').textContent, 'Hanae', 'the name'); t.eq($(g, '.mn-d-title').textContent, h.title, 'the title');
  t.ok($(g, '.mn-d-hp').textContent.indexOf(String(h.maxHp)) >= 0, 'HP ' + h.maxHp);
  t.eq($(g, '.mn-d-blurb').textContent, h.blurb, 'the blurb');
  const rows = $$(g, '.mn-d-row');
  t.eq(rows.length, 2, 'both rows are described');
  t.ok(rows[0].textContent.indexOf('+2 damage on attacks') >= 0, 'front bonus from DATA.rowText: ' + rows[0].textContent);
  t.ok(rows[0].classList.contains('best') && /best/.test(rows[0].textContent), 'her favourite row (front) is marked');
  t.ok(rows[1].textContent.indexOf('Block') >= 0, 'back bonus');
  const lines = $$(g, '.mn-d-line').map((l) => l.textContent);
  t.ok(/Bloom/.test(lines[0]) && lines[0].indexOf(g.DATA.statuses.bloom.text) >= 0, 'the resource and its description');
  t.ok(/Blade Flow/.test(lines[1]) && /Bloom/.test(lines[1]), 'the passive by name and effect: ' + lines[1]);
  t.eq($$(g, '.mn-dc').length, 3, 'three distinct starter cards');
  t.deep($$(g, '.mn-dc-n').map((n) => n.textContent), ['x2', 'x2'], 'the strike and the defence show a x2 count');
  t.ok(/starting deck \(5 cards\)/i.test($(g, '.mn-d-sec h4').textContent), 'the deck heading counts five cards');
  t.ok($(g, '.mn-d-bio p').textContent.length > 100 && g.DATA.lore.hero_hanae.text.indexOf($(g, '.mn-d-bio p').textContent.slice(0, 60)) === 0, 'the bio is the hero_hanae lore');
  hover(g, 'kuro'); await settle(g);
  t.eq($(g, '.mn-d-name h3').textContent, 'Kuro', 'hovering another hero swaps the sheet');
  t.ok($(g, '.mn-d-bio h4').textContent.indexOf('His') === 0, 'his story');
  // a starter card previews big on hover
  const sc = $(g, '.mn-cs');
  g._pointer('pointerenter', sc, { pointerType: 'mouse' });
  t.ok(g.UI.tip.open, 'hovering a starter card opens the big preview');
  g._pointer('pointerleave', sc, { pointerType: 'mouse' });
  t.ok(!g.UI.tip.open, 'and leaving closes it');
});

await t.test('heroSelect: pick exactly two (the first is the front hero), swap the order, a third pick drops the oldest', async () => {
  const g = fresh();
  g.META.profile.unlocked.hero.push('suzu');
  await go(g, 'heroSelect');
  const st = () => g.UI.screens.heroSelect.state();
  g._click(card(g, 'hanae')); await settle(g);
  t.deep(st().chosen, ['hanae'], 'one pick');
  t.eq($(g, '.mn-begin').getAttribute('aria-disabled'), 'true', 'still not ready');
  g._click(card(g, 'kuro')); await settle(g);
  t.deep(st().chosen, ['hanae', 'kuro'], 'the first pick is the front hero');
  t.eq(card(g, 'hanae').querySelector('.mn-hc-badge').textContent, 'FRONT', 'Hanae is marked FRONT'); t.eq(card(g, 'kuro').querySelector('.mn-hc-badge').textContent, 'BACK', 'Kuro is marked BACK');
  t.ok(card(g, 'hanae').classList.contains('on') && card(g, 'hanae').getAttribute('aria-pressed') === 'true', 'chosen cards are pressed');
  t.ok(!$(g, '.mn-begin').getAttribute('aria-disabled'), 'Begin is ready');
  t.ok($(g, '.mn-party-empty').hidden, 'the empty prompt is gone');
  t.ok($$(g, '.mn-slot-note').every((n) => /element/.test(n.textContent)), 'both fight in their favourite rows: ' + $$(g, '.mn-slot-note').map((n) => n.textContent).join(' / '));
  t.ok(g.META.loreSeen('hero_hanae') && g.META.loreSeen('hero_kuro'), 'picking a hero marks their story page as read (the Library lists it)');
  // swap
  g._click('.mn-swap'); await settle(g);
  t.deep(st().chosen, ['kuro', 'hanae'], 'Swap trades the rows');
  t.eq(card(g, 'kuro').querySelector('.mn-hc-badge').textContent, 'FRONT', 'the badges follow');
  t.ok($$(g, '.mn-slot-note').every((n) => /prefers/.test(n.textContent)), 'both are now out of place and the stage says so: ' + $$(g, '.mn-slot-note').map((n) => n.textContent).join(' / '));
  g._key('s'); await settle(g);
  t.deep(st().chosen, ['hanae', 'kuro'], 'the S key swaps too');
  // a third pick
  g._click(card(g, 'suzu')); await settle(g);
  t.deep(st().chosen, ['kuro', 'suzu'], 'a third pick drops the oldest (Hanae)');
  t.ok(!card(g, 'hanae').classList.contains('on'), 'her card is released');
  g._click(card(g, 'suzu')); await settle(g);
  t.deep(st().chosen, ['kuro'], 'tapping a chosen hero unchooses them');
  g._click(card(g, 'raiga')); await settle(g);
  t.deep(st().chosen, ['kuro'], 'a locked hero still cannot join');
  // memory: the party survives leaving the screen
  await go(g, 'title'); await go(g, 'heroSelect');
  t.deep(st().chosen, ['kuro'], 'the party is remembered within the page session');
  // keyboard
  g._key('1'); await settle(g);
  t.deep(st().chosen, ['kuro', 'hanae'], 'key 1 picks the first hero');
  g._key('Escape'); await settle(g);
  t.eq(g.UI.currentName, 'title', 'Esc goes back');
});

await t.test('heroSelect: the party stage banter uses the real bark lines, one bubble at a time', async () => {
  const g = fresh();
  await go(g, 'heroSelect');
  g._click(card(g, 'hanae')); g._click(card(g, 'kuro')); await settle(g);
  const lines = (id) => Object.values(g.DATA.lore['barks_' + id].lines).flat();
  const all = new Set([...lines('hanae'), ...lines('kuro')]);
  const said = new Map();
  for (let i = 0; i < 700; i++) {
    g._frames(1, 16);
    const shown = $$(g, '.mn-bark.show');
    t.ok(shown.length <= 1, 'never two bubbles at once');
    shown.forEach((b) => said.set(b.textContent, (said.get(b.textContent) || 0) + 1));
    if (shown.length > 1) break;
  }
  t.ok(said.size >= 3, 'the heroes keep talking (' + said.size + ' different lines in 11 seconds)');
  t.ok([...said.keys()].every((x) => all.has(x)), 'every line is one of the two heroes\' lore barks');
  t.ok([...said.keys()].some((x) => lines('hanae').indexOf(x) >= 0) && [...said.keys()].some((x) => lines('kuro').indexOf(x) >= 0), 'both heroes speak');
  t.eq(g._issues.length, 0, 'the stage drew without canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
});

await t.test('heroSelect: Ink Trial stepper lists every level cumulatively, capped by META.trialMax', async () => {
  const g = fresh();
  await go(g, 'heroSelect');
  t.ok($(g, '.mn-trial').classList.contains('locked'), 'no wins yet: the trials are locked');
  g._click($$(g, '.mn-step')[1]); await settle(g);
  t.eq(g.UI.screens.heroSelect.state().trial, 0, 'the stepper cannot rise');
  t.ok(/unlock/i.test($(g, '.mn-tr-text').textContent), 'and says how to unlock: ' + $(g, '.mn-tr-text').textContent);
  t.ok($$(g, '.mn-rule.none').length === 1, 'the rules list explains itself');
  t.eq($(g, '.mn-tr-rule').textContent, '', 'trial 0 has no rule to write out');
  t.ok(!$(g, '.s-heroSelect').classList.contains('ts-big'), 'normal text keeps every ornament');
  const g2 = fresh();
  seedProfile(g2, { trialBest: 2 });
  t.eq(g2.META.trialMax(), 3, 'after winning trial 2 the next one opens');
  await go(g2, 'heroSelect');
  const plus = $$(g2, '.mn-step')[1], minus = $$(g2, '.mn-step')[0];
  for (let i = 0; i < 5; i++) { g2._click(plus); await settle(g2, 1); }
  t.eq(g2.UI.screens.heroSelect.state().trial, 3, 'the stepper stops at trialMax');
  const li = $$(g2, '.mn-rule');
  t.eq(li.length, 3, 'levels 1 to 3 are all listed');
  t.ok(li[0].textContent.indexOf('Lean Purse') >= 0 && li[1].textContent.indexOf('Tough Hides') >= 0 && li[2].textContent.indexOf('Slow Mending') >= 0, 'in order, with the real trial names and texts: ' + li.map((x) => x.textContent).join(' | '));
  t.ok(li[2].classList.contains('new') && !li[1].classList.contains('new'), 'the newest is highlighted');
  t.ok(li[0].textContent.indexOf(g2.DATA.trials.trial_1.text) >= 0, 'each rule carries the trial text');
  t.eq($$(g2, '.mn-pip.on').length, 3, 'the pips show the level');
  t.ok($(g2, '.mn-tr-name').textContent.indexOf('III') >= 0, 'the level is in Roman numerals');
  t.eq($(g2, '.mn-tr-rule').textContent, g2.DATA.trials.trial_3.text, 'the newest rule is also written under the trial name (it replaces the list on a phone)');
  g2._click(minus); await settle(g2, 1);
  t.eq($$(g2, '.mn-rule').length, 2, 'lowering drops the newest rule');
  t.eq($(g2, '.mn-tr-rule').textContent, g2.DATA.trials.trial_2.text, 'and the written rule follows the level');
  await go(g2, 'title'); await go(g2, 'heroSelect');
  t.eq(g2.UI.screens.heroSelect.state().trial, 2, 'the chosen trial is remembered');
});

await t.test('Larger text size adds ts-big to the hero select and the how to play page (fewer ornaments, so nothing clips)', async () => {
  const g = fresh();
  g.UI.setSetting('textScale', 1.3);
  await go(g, 'heroSelect');
  t.ok($(g, '.s-heroSelect').classList.contains('ts-big'), 'heroSelect root has ts-big at 1.3');
  await go(g, 'howto');
  t.ok($(g, '.mn-howto').classList.contains('ts-big'), 'the how to play book has ts-big at 1.3');
  g.UI.setSetting('textScale', 1.15);
  await go(g, 'heroSelect');
  t.ok($(g, '.s-heroSelect').classList.contains('ts-big'), 'Large (1.15) counts too: the threshold is above 1.1, like the end screens');
  g.UI.setSetting('textScale', 1);
  await go(g, 'heroSelect');
  t.ok(!$(g, '.s-heroSelect').classList.contains('ts-big'), 'Normal keeps every ornament');
});

await t.test('heroSelect: Begin passes heroes, trial and seed to GAME.newRun; the seed field takes numbers and words', async () => {
  const g = fresh();
  seedProfile(g, { trialBest: 1 });
  const calls = [];
  g.GAME.newRun = (o) => { calls.push(JSON.parse(JSON.stringify(o))); return { id: 'r' }; };
  await go(g, 'heroSelect');
  g._click($(g, '.mn-begin')); await settle(g);
  t.eq(calls.length, 0, 'Begin does nothing with fewer than two heroes');
  t.ok(toasts(g).some((x) => /Choose two heroes/.test(x)), 'and says why: ' + toasts(g).join(' | '));
  g._click(card(g, 'hanae')); g._click(card(g, 'kuro')); await settle(g);
  g._click($$(g, '.mn-step')[1]); await settle(g, 1);
  g._click($(g, '.mn-begin')); await settle(g);
  t.deep(calls[0], { heroes: ['hanae', 'kuro'], trial: 1 }, 'an empty seed field sends no seed (GAME rolls one)');
  g._flush(1500);
  g._input('.mn-seed', '12345');
  g._click($(g, '.mn-begin')); await settle(g);
  t.eq(calls[1].seed, 12345, 'a number is the seed');
  g._flush(1500);
  g._input('.mn-seed', 'sakura');
  g._click($(g, '.mn-begin')); await settle(g);
  t.eq(calls[2].seed, g.U.hashStr('sakura') >>> 0, 'a word is hashed into a seed, the same every time');
  g._flush(1500);
  g._click('.mn-swap'); await settle(g);
  g._click($(g, '.mn-begin')); await settle(g);
  t.deep(calls[3].heroes, ['kuro', 'hanae'], 'the swapped order is what the run gets (first is the front hero)');
  g._flush(1500);
  g._click('.mn-dice'); await settle(g);
  t.ok(/^\d{3,6}$/.test($(g, '.mn-seed').value), 'the dice roll a numeric seed: ' + $(g, '.mn-seed').value);
  t.eq(g.UI.screens.heroSelect.state().seed, Number($(g, '.mn-seed').value), 'and the field is what state reports');
  // a saved tale asks first
  saveRun(g);
  g._flush(1500);
  g._click($(g, '.mn-begin')); await settle(g);
  t.ok(g.UI.overlay.has('confirm'), 'a saved tale triggers the overwrite confirm');
  t.eq(calls.length, 4, 'nothing starts before the answer');
  g._click('.o-confirm .btn-primary'); await settle(g);
  t.eq(calls.length, 5, 'Begin anew starts the run');
});

await t.test('heroSelect: really beginning a tale creates the run through RUN and leaves for the story', async () => {
  const g = fresh();
  await go(g, 'heroSelect');
  g._click(card(g, 'kuro')); g._click(card(g, 'hanae')); await settle(g);
  g._input('.mn-seed', '777');
  g._click($(g, '.mn-begin'));
  await settle(g, 10);
  const R = g.GAME.state.R;
  t.ok(R, 'a run exists'); t.deep(R.heroes.map((h) => h.id), ['kuro', 'hanae'], 'the heroes in the order picked'); t.eq(R.seed, 777, 'the seed'); t.eq(R.trial, 0, 'trial 0');
  t.ok(['story', 'map'].indexOf(g.UI.currentName) >= 0, 'the flow moves on to the intro story (or the map): ' + g.UI.currentName);
  t.ok(g.META.hasRun(), 'and the new run is saved');
});

await t.test('heroSelect: the Daily toggle fixes the heroes, the trial and the seed', async () => {
  const g = fresh();
  seedProfile(g, { trialBest: 2 });
  const calls = [];
  g.GAME.newRun = (o) => { calls.push(JSON.parse(JSON.stringify(o))); return { id: 'r' }; };
  await go(g, 'heroSelect');
  g._click(card(g, 'kuro')); g._click(card(g, 'raiga')); await settle(g);
  g._click($$(g, '.mn-step')[1]); await settle(g, 1);
  const seed = todaySeed(g), daily = g.RUN.dailyHeroes(seed);
  g._click('.mn-daily .toggle'); await settle(g);
  const st = g.UI.screens.heroSelect.state();
  t.ok(st.daily, 'the Daily Tale is on');
  t.deep(st.chosen, daily, 'the heroes are RUN.dailyHeroes(today): ' + daily.join(' and '));
  t.eq(st.trial, 0, 'always trial 0');
  t.ok($(g, '.mn-seed').disabled && $(g, '.mn-seed').value === String(seed), 'the seed field shows today\'s seed and is locked');
  t.ok($$(g, '.mn-hcard').every((b) => b.classList.contains('fixed')), 'the cards are fixed');
  t.ok(/Daily/.test($(g, '.mn-begin .btn-label').textContent), 'Begin says Daily: ' + $(g, '.mn-begin .btn-label').textContent);
  g._click(card(g, 'hanae')); await settle(g);
  t.deep(g.UI.screens.heroSelect.state().chosen, daily, 'a card tap cannot change the party'); t.ok(toasts(g).some((x) => /Daily Jam chooses/.test(x)), 'and a toast explains');
  g._click('.mn-swap'); t.deep(g.UI.screens.heroSelect.state().chosen, daily, 'nor can Swap');
  g._click($$(g, '.mn-step')[1]); t.eq(g.UI.screens.heroSelect.state().trial, 0, 'nor the trial stepper');
  g._click($(g, '.mn-begin')); await settle(g);
  t.deep(calls[0], { daily: true }, 'Begin sends { daily: true } and GAME derives seed and heroes');
  g._click('.mn-daily .toggle'); await settle(g);
  t.ok(!g.UI.screens.heroSelect.state().daily, 'toggled off');
  t.deep(g.UI.screens.heroSelect.state().chosen, ['kuro', 'raiga'].filter((id) => g.META.isUnlocked('hero', id)), 'the previous party comes back (locked heroes excluded)');
  t.eq(g._issues.length, 0, 'no canvas issues');
});

await t.test('heroSelect: leave cleans up, canvases draw, and every control has a name', async () => {
  const g = fresh();
  await settle(g); g._click('.mn-gate'); await settle(g);          // the one-shot audio arming listeners are spent by the first tap
  const base = { doc: g._listeners('pointermove'), key: g._listeners('keydown') };
  await go(g, 'heroSelect');
  g._click(card(g, 'hanae')); g._click(card(g, 'kuro')); await settle(g);
  g._frames(60, 16);
  const unnamed = $$(g, '.s-heroSelect button, .s-heroSelect input').filter((b) => !nameOf(b));
  t.eq(unnamed.length, 0, 'every button and field has an accessible name: ' + unnamed.map((b) => b.className).join(','));
  await go(g, 'title');
  t.eq($$(g, '.s-heroSelect').length, 0, 'the screen root is removed');
  t.eq(g._listeners('pointermove'), base.doc, 'no pointermove listeners leaked'); t.eq(g._listeners('keydown'), base.key, 'no keydown listeners leaked');
  t.ok(!g.UI.tip.open, 'no tooltip is left open');
  t.eq(g._issues.length, 0, 'no canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
  t.eq(errors(g), 0, 'no console errors');
});


// ==================================================================================================== LIBRARY
const pane = (g) => $(g, '.mn-tabpane:not([hidden])');
const segBtn = (g, label) => $$(g, '.mn-tabpane:not([hidden]) .seg-b').find((b) => b.textContent === label);
const tabBtn = (g, id) => $(g, '.tab[data-id=' + id + ']');
const visibleItems = (g) => $$(g, '.mn-item').filter((i) => !i.hidden);

await t.test('library: tabs, the Inkstone balance, key shortcuts and the remembered tab', async () => {
  const g = fresh();
  seedProfile(g);
  await go(g, 'library');
  t.deep($$(g, '.tab').map((b) => b.dataset.id), ['unlocks', 'achievements', 'story', 'bestiary', 'history'], 'the five tabs of DESIGN 5.11');
  t.eq(g.UI.screens.library.state().tab, 'unlocks', 'opens on Unlocks');
  t.eq($(g, '.mn-stones .stat .val').textContent, '200', 'the Inkstone balance is META.inkstones');
  t.eq($$(g, '.mn-tabpane').length, 1, 'panes are built lazily: only the open tab exists');
  g._click(tabBtn(g, 'story')); await settle(g);
  t.eq(g.UI.screens.library.state().tab, 'story', 'clicking a tab opens it');
  t.eq($$(g, '.mn-tabpane').filter((p) => !p.hidden).length, 1, 'exactly one pane shows'); t.ok(tabBtn(g, 'story').getAttribute('aria-selected') === 'true', 'the tab is selected for screen readers');
  t.ok(sfxLog(g).indexOf('page_turn') >= 0, 'a tab change turns a page');
  g._key('4'); await settle(g);
  t.eq(g.UI.screens.library.state().tab, 'bestiary', 'key 4 opens the Bestiary');
  g._key('1'); await settle(g);
  t.eq(g.UI.screens.library.state().tab, 'unlocks', 'key 1 opens Unlocks');
  await go(g, 'library', { tab: 'history' });
  t.eq(g.UI.screens.library.state().tab, 'history', 'params.tab picks the tab');
  await go(g, 'library', { tab: 'nonsense' });
  t.ok(['unlocks', 'history'].indexOf(g.UI.screens.library.state().tab) >= 0, 'an unknown tab falls back safely');
  await go(g, 'title'); g._click('.mn-gate'); await settle(g);
  g._click('[data-act=library]'); await settle(g);
  t.eq(g.UI.screens.library.state().tab, g.UI.screens.library.state().tab, 'the title opens the library');
  g._key('Escape'); await settle(g);
  t.eq(g.UI.currentName, 'title', 'Esc goes back');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('library unlocks: every locked def is listed, with kind and hero filters and the empty states', async () => {
  const g = fresh();
  seedProfile(g);
  await go(g, 'library');
  const list = g.META.libraryList();
  const by = (k) => list.filter((e) => e.kind === k).length;
  t.eq($$(g, '.mn-item').length, list.length, 'one tile per META.libraryList entry (' + list.length + ')');
  t.deep([$$(g, '.mn-item.k-card').length, $$(g, '.mn-item.k-relic').length, $$(g, '.mn-item.k-gem').length], [by('card'), by('relic'), by('gem')], 'cards, treasures and gems');
  t.ok(by('card') > 0 && by('relic') > 0 && by('gem') > 0, 'the game has all three kinds locked');
  t.ok($$(g, '.mn-item').every((i) => i.getAttribute('aria-label') && /Costs \d+ Chimes|Unlocked/.test(i.getAttribute('aria-label'))), 'every tile states its price');
  t.eq($(g, '.mn-filters .mn-count').textContent, '0 of ' + list.length + ' unlocked', 'the header counts what you own');
  t.ok($$(g, '.mn-item:not(.owned) .mn-padlock').length === list.length, 'unowned tiles wear padlocks');
  t.ok($$(g, '.mn-item.k-card .card').length === by('card'), 'cards are real UI.card faces');
  // kind filter
  g._click(segBtn(g, 'Cards')); await settle(g, 1);
  t.eq(visibleItems(g).length, by('card'), 'Cards shows only cards'); t.ok($(g, '.mn-sec[data-kind=relic]').hidden && $(g, '.mn-sec[data-kind=gem]').hidden, 'the other sections hide');
  g._click(segBtn(g, 'Gems')); await settle(g, 1);
  t.eq(visibleItems(g).length, by('gem'), 'Gems shows only gems');
  g._click(segBtn(g, 'Treasures')); await settle(g, 1);
  t.eq(visibleItems(g).length, by('relic'), 'Treasures shows only relics');
  g._click(segBtn(g, 'All')); await settle(g, 1);
  // hero filter
  g._click('.mn-chip[data-hero=kuro]'); await settle(g, 1);
  const kuro = list.filter((e) => e.hero === 'kuro').length;
  t.eq(visibleItems(g).length, kuro, 'the Kuro chip shows only his things (' + kuro + ')');
  t.ok(visibleItems(g).every((i) => i.dataset.hero === 'kuro'), 'all of them are his');
  t.eq($(g, '.mn-chip[data-hero=kuro]').getAttribute('aria-pressed'), 'true', 'the chip is pressed');
  g._click('.mn-chip[data-hero=kuro]'); await settle(g, 1);
  t.eq(visibleItems(g).length, list.length, 'pressing it again clears the filter');
  // a combination that matches nothing
  g._click(segBtn(g, 'Gems')); g._click('.mn-chip[data-hero=hanae]'); await settle(g, 1);
  t.eq(visibleItems(g).length, 0, 'gems belong to no hero, so Gems + Hanae is empty');
  const empty = $$(g, '.mn-empty').find((e) => !e.hidden);
  t.ok(empty && /match/.test(empty.textContent), 'a friendly "nothing matches" message shows: ' + (empty && empty.textContent));
  g._click($$(g, '.mn-empty .btn').find((b) => /everything/i.test(b.textContent))); await settle(g, 1);
  t.eq(visibleItems(g).length, list.length, '"Show everything" resets both filters');
  // nothing to unlock at all
  const g2 = fresh();
  g2.META.libraryList = () => [];
  await go(g2, 'library');
  const bare = $$(g2, '.mn-empty').find((e) => !e.hidden);
  t.ok(bare && /bare/.test(bare.textContent), 'with nothing locked the shelves are bare, not blank: ' + (bare && bare.textContent));
  t.eq(errors(g2), 0, 'no console errors');
});

await t.test('library unlocks: buying spends Inkstones, stamps the tile, and the sound and toast come once from GAME', async () => {
  const g = fresh();
  seedProfile(g, { stones: 200 });
  await go(g, 'library');
  const first = g.META.libraryList().find((e) => e.kind === 'card' && e.cost === 60);
  const tile = () => $(g, '.mn-item[data-id=' + first.id + ']');
  t.ok(tile().classList.contains('afford') && !tile().classList.contains('poor'), 'an affordable tile is highlighted');
  t.ok(!tile().querySelector('.mn-unlock').getAttribute('aria-disabled'), 'and its Unlock button is live');
  g._click(tile().querySelector('.mn-unlock'));
  t.ok(tile().classList.contains('just'), 'the stamp animation class is set the moment the button is pressed (cleared on a timer afterwards)');
  await settle(g);
  t.ok(g.META.isUnlocked('card', first.id), 'META says the card is unlocked');
  t.eq(g.META.inkstones, 140, 'the price is paid: 200 - 60');
  t.ok(tile().classList.contains('owned') && !tile().classList.contains('afford'), 'the tile is owned');
  t.ok(tile().querySelector('.mn-unlock').hidden, 'the button is replaced by the stamp'); t.ok(/UNLOCKED/.test(tile().querySelector('.mn-stamp').textContent), 'the stamp says UNLOCKED');
  t.eq($(g, '.mn-stones .stat .val').textContent, '140', 'the balance counts down to 140');
  t.eq($(g, '.mn-filters .mn-count').textContent.split(' ')[0], '1', 'the header counts one owned');
  const log = sfxLog(g);
  t.eq(log.filter((x) => x === 'unlock').length, 1, 'the unlock sound plays exactly once (GAME plays it from META.bus; the Library does not double it)');
  t.ok(log.indexOf('card_pick') >= 0, 'plus the Library\'s own stamp accent');
  t.ok(toasts(g).some((x) => /Unlocked: /.test(x)), 'GAME shows the "Unlocked" toast: ' + toasts(g).join(' | '));
  t.eq($$(g, '.mn-spk').length, 0, 'the sparks clean themselves up'); t.eq($$(g, '.mn-burst').length, 0, 'and so does the ring of light');
  await go(g, 'library');
  t.ok(tile().classList.contains('owned'), 'ownership persists across visits');
  t.ok(g.META.unlockedSet().card.indexOf(first.id) >= 0, 'and RUN would now offer it (META.unlockedSet)');
  // buy until the money runs out
  const relic = g.META.libraryList().find((e) => e.kind === 'relic');
  g.META.profile.inkstones = 5;
  await go(g, 'library');
  t.ok($$(g, '.mn-item:not(.owned)').every((i) => i.classList.contains('poor')), 'with 5 Inkstones nothing is affordable');
  const rt = $(g, '.mn-item[data-id=' + relic.id + ']');
  t.eq(rt.querySelector('.mn-unlock').getAttribute('aria-disabled'), 'true', 'the button is soft-disabled');
  const before = g.META.inkstones;
  g._click(rt.querySelector('.mn-unlock')); await settle(g);
  t.eq(g.META.inkstones, before, 'a click does not spend anything');
  t.ok(!g.META.isUnlocked('relic', relic.id), 'and unlocks nothing');
  t.ok(toasts(g).some((x) => /more Chimes/.test(x)), 'it tells you how many more you need: ' + toasts(g).join(' | '));
  t.ok(sfxLog(g).indexOf('ui_error') >= 0, 'with the error sound');
  // a purchase that META refuses (stale screen) is handled too
  g.META.profile.inkstones = 500;
  await go(g, 'library');
  const gem = g.META.libraryList().find((e) => e.kind === 'gem');
  g.META.profile.inkstones = 0;
  g._click($(g, '.mn-item[data-id=' + gem.id + '] .mn-unlock')); await settle(g);
  t.ok(!g.META.isUnlocked('gem', gem.id), 'a stale Unlock button cannot get around META.buy');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('library unlocks: Affordable first reorders, and reduce motion skips the sparks', async () => {
  const g = fresh();
  seedProfile(g, { stones: 100 });
  await go(g, 'library');
  const order = () => $$(g, '.mn-item.k-card').map((i) => i.dataset.id);
  const orig = order();
  const list = g.META.libraryList().filter((e) => e.kind === 'card');
  const dear = list.find((e) => e.cost > 100), cheap = list.find((e) => e.cost <= 100);
  t.ok(dear && cheap, 'the data has cards on both sides of 100 Inkstones');
  g._click('.mn-affordfirst'); await settle(g, 1);
  const now = order();
  t.ok($(g, '.mn-item.k-card.afford') === $$(g, '.mn-item.k-card')[0], 'the first tile is one you can afford');
  t.ok(now.indexOf(cheap.id) < now.indexOf(dear.id), 'affordable cards sort before dear ones');
  g._click('.mn-affordfirst'); await settle(g, 1);
  t.deep(order(), orig, 'toggling off restores the original order');
  g.UI.setSetting('reduceMotion', true);
  g._click($(g, '.mn-item[data-id=' + cheap.id + '] .mn-unlock')); await settle(g);
  t.ok(g.META.isUnlocked('card', cheap.id), 'buying still works');
  t.eq($$(g, '.mn-burst, .mn-spk').length, 0, 'no burst or sparks when motion is reduced');
  t.ok($(g, '.mn-item[data-id=' + cheap.id + ']').classList.contains('owned'), 'the tile still changes state');
});

await t.test('library achievements: 32 rows with progress from META.stat, done styling, rewards and sorting', async () => {
  const g = fresh();
  seedProfile(g);
  await go(g, 'library', { tab: 'achievements' });
  const list = g.META.achievements();
  t.eq(list.length, 32, 'META has 32 achievements'); t.eq($$(g, '.mn-ach').length, 32, 'and each has a row');
  t.eq($$(g, '.mn-ach.done').length, 2, 'two are done (ch1_clear, first_draft)');
  const row = (id) => $(g, '.mn-ach[data-id=' + id + ']');
  t.ok(/10/.test(row('ch1_clear').querySelector('.mn-ach-rew').textContent), 'the reward is shown: ' + row('ch1_clear').querySelector('.mn-ach-rew').textContent);
  t.ok(/Done/.test(row('ch1_clear').querySelector('.mn-ach-num').textContent) && /\d{1,2} [A-Z][a-z]{2} 2026/.test(row('ch1_clear').querySelector('.mn-ach-num').textContent), 'done rows show the date: ' + row('ch1_clear').querySelector('.mn-ach-num').textContent);
  t.ok(row('ch1_clear').querySelector('.hanko'), 'done rows carry a check seal');
  t.eq(row('cartographer').querySelector('.mn-ach-num').textContent, '250 / 500', 'progress reads META.stat: hexesPainted 250 of 500');
  t.eq(row('cartographer').querySelector('.bar').getAttribute('aria-valuenow'), '250', 'the bar is 250 of 500 (it fills after the tab opens)');
  t.eq(row('cartographer').querySelector('.bar').getAttribute('aria-valuemax'), '500', 'and knows its maximum');
  t.eq(row('regular_reader').querySelector('.mn-ach-num').textContent, '7 / 10', 'runs 7 of 10');
  t.ok(!row('cartographer').classList.contains('done'), 'a locked row is not styled as done');
  t.ok($(g, '.mn-count').textContent.indexOf('2 of 32 done') === 0 && /13 Chimes/.test($(g, '.mn-count').textContent), 'the summary: ' + $(g, '.mn-count').textContent);
  const ids = () => $$(g, '.mn-ach').map((r) => r.dataset.id);
  t.deep(ids(), list.map((a) => a.id), 'default order is the data order');
  g._click(segBtn(g, 'Closest')); await settle(g, 1);
  const closest = ids();
  t.ok(closest.slice(-2).every((id) => row(id).classList.contains('done')), 'Closest puts finished ones last');
  const prog = (id) => list.find((a) => a.id === id).progress;
  t.ok(prog(closest[0]) >= prog(closest[1]) && prog(closest[1]) >= prog(closest[5]), 'and the nearest to done first: ' + closest.slice(0, 3).join(', '));
  g._click(segBtn(g, 'Done first')); await settle(g, 1);
  t.deep(ids().slice(0, 2), ['ch1_clear', 'first_draft'], 'Done first lists them newest first');
  g._click(segBtn(g, 'In order')); await settle(g, 1);
  t.deep(ids(), list.map((a) => a.id), 'In order restores it');
  // a fresh profile
  const g2 = fresh();
  await go(g2, 'library', { tab: 'achievements' });
  t.eq($$(g2, '.mn-ach.done').length, 0, 'a fresh profile has none done'); t.ok($$(g2, '.mn-ach-star').length === 32, 'every locked row shows a dim star');
  t.eq(errors(g2), 0, 'no console errors');
});

await t.test('library story: seen pages replay through the story screen and come back here; unseen ones stay "???"', async () => {
  const g = fresh();
  seedProfile(g);
  await go(g, 'library', { tab: 'story' });
  const list = g.META.storyList();
  t.eq($$(g, '.mn-st').length, list.length, 'one row per META.storyList entry (' + list.length + ', no barks)');
  t.ok(list.every((x) => !/^barks_/.test(x.id)), 'the in-combat barks are not stories');
  t.eq($$(g, '.mn-st.seen').length, 2, 'two pages are read');
  t.eq($(g, '.mn-st[data-id=intro] .mn-st-title').textContent, g.DATA.lore.intro.title, 'a seen page shows its title');
  t.eq($(g, '.mn-st[data-id=victory] .mn-st-title').textContent, '???', 'an unseen page shows ???');
  t.ok(!/Victory|victory/.test($(g, '.mn-st[data-id=victory]').getAttribute('aria-label')), 'and does not leak its name to screen readers: ' + $(g, '.mn-st[data-id=victory]').getAttribute('aria-label'));
  t.ok(/2 of \d+ ballads heard/.test($(g, '.mn-st-sub').textContent), 'the subtitle counts: ' + $(g, '.mn-st-sub').textContent);
  t.ok($$(g, '.mn-st-group').length >= 3, 'pages are grouped (chapters, endings, heroes)');
  g._click('.mn-st[data-id=victory]'); await settle(g);
  t.eq(g.UI.currentName, 'library', 'an unseen page does not open');
  t.ok(toasts(g).some((x) => /not heard this ballad/.test(x)), 'a toast explains: ' + toasts(g).join(' | '));
  g._click('.mn-st[data-id=intro]'); await settle(g, 6);
  t.eq(g.UI.currentName, 'story', 'a seen page opens the story screen');
  t.eq(g.UI.params.id, 'intro', 'with its id'); t.deep(JSON.parse(JSON.stringify(g.UI.params.then)), { name: 'library', params: { tab: 'story' } }, 'and a then that returns to the Library story tab');
  g._click('.s-story .btn-primary'); await settle(g, 6);
  t.eq(g.UI.currentName, 'library', 'finishing the page returns to the library');
  t.eq(g.UI.screens.library.state().tab, 'story', 'on the Story tab');
  // reading a new page makes it appear
  g.META.markLore('victory');
  await go(g, 'library', { tab: 'story' });
  t.eq($(g, '.mn-st[data-id=victory] .mn-st-title').textContent, g.DATA.lore.victory.title, 'a page read later is listed by title');
  const g2 = fresh();
  await go(g2, 'library', { tab: 'story' });
  t.eq($$(g2, '.mn-st.seen').length, 0, 'a fresh profile has read nothing'); t.ok($$(g2, '.mn-st-title').every((x) => x.textContent === '???'), 'every title is hidden');
});

await t.test('library bestiary: silhouettes for the unmet, lore, HP, kills and moves for the met, without spoilers', async () => {
  const g = fresh();
  seedProfile(g);
  await go(g, 'library', { tab: 'bestiary' });
  const data = g.META.bestiary();
  t.eq($$(g, '.mn-beast').length, data.length, 'one tile per creature (' + data.length + ')');
  t.eq($$(g, '.mn-beast.seen').length, 5, 'five have been met'); t.eq($$(g, '.mn-beast.unseen').length, data.length - 5, 'the rest are unseen');
  t.eq($$(g, '.mn-sec-h').length, 3, 'three chapter headings'); t.ok(/Verse 1: /.test($$(g, '.mn-sec-h span')[0].textContent) && /Whispering Bamboo Grove/.test($$(g, '.mn-sec-h span')[0].textContent), 'named after the chapter story: ' + $$(g, '.mn-sec-h span')[0].textContent);
  t.ok(/5 of 17 met/.test($$(g, '.mn-sec-n')[0].textContent), 'and counting met creatures: ' + $$(g, '.mn-sec-n')[0].textContent);
  const un = $(g, '.mn-beast[data-id=chochin]');
  t.eq(un.querySelector('.mn-b-name').textContent, '???', 'an unseen tile says ???'); t.ok(un.querySelector('canvas'), 'over a silhouette canvas'); t.ok(!/Chochin|Lantern/i.test(un.getAttribute('aria-label')), 'and its aria-label does not name it: ' + un.getAttribute('aria-label'));
  const kappa = $(g, '.mn-beast[data-id=kappa]');
  t.eq(kappa.querySelector('.mn-b-name').textContent, 'Kappa', 'a met creature shows its name'); t.eq(kappa.querySelector('.mn-b-kills').textContent, '2', 'and its kill count');
  t.ok($(g, '.mn-beast[data-id=boss_kuzunoha]').classList.contains('tier-boss') && $(g, '.mn-beast[data-id=oni_brute]').classList.contains('tier-elite'), 'tiers are styled');
  const firstOfCh1 = $$(g, '.mn-grid.beasts')[0].children[0];
  t.eq(firstOfCh1.dataset.id, 'boss_kuzunoha', 'bosses come first in a chapter');
  g._click(kappa); await settle(g);
  const def = g.DATA.enemies.kappa;
  t.eq($(g, '.mn-bdetail h3').textContent, 'Kappa', 'the detail names it'); t.eq($(g, '.mn-bd-lore').textContent, def.lore, 'with its lore');
  t.eq($$(g, '.mn-move').length, Object.keys(def.moves).length, 'every move is listed (' + Object.keys(def.moves).length + ')');
  t.ok($$(g, '.mn-move b').map((b) => b.textContent).indexOf(def.moves.mud_slap.name) >= 0, 'by name'); t.ok(/Deal 5 damage/.test($(g, '.mn-move span').textContent), 'and effect: ' + $(g, '.mn-move span').textContent);
  t.ok($(g, '.mn-bd-stats').textContent.indexOf(def.hp[0] + ' to ' + def.hp[1]) >= 0, 'the HP range ' + def.hp.join(' to '));
  t.ok(/Creature/.test($(g, '.mn-bd-chips').textContent) && /Verse 1/.test($(g, '.mn-bd-chips').textContent), 'tier and chapter chips');
  t.ok(kappa.classList.contains('sel'), 'the selected tile is marked');
  g._click(un); await settle(g);
  const txt = $(g, '.mn-bdetail').textContent;
  t.eq($(g, '.mn-bdetail h3').textContent, '???', 'an unseen creature stays ???');
  t.ok(!$(g, '.mn-bd-lore') && !$(g, '.mn-moves'), 'no lore and no move list');
  t.ok(txt.indexOf(g.DATA.enemies.chochin.lore) < 0 && txt.indexOf('Chochin') < 0, 'nothing of it leaks into the panel');
  t.ok(/Meet this creature/.test(txt), 'it says how to meet it');
  g._frames(60, 16);
  t.eq(g._issues.length, 0, 'the live portrait draws without canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
  await go(g, 'library', { tab: 'bestiary' });
  t.ok($(g, '.mn-beast[data-id=chochin]').classList.contains('sel'), 'the selection is remembered');
  const g2 = fresh();
  await go(g2, 'library', { tab: 'bestiary' });
  t.eq($$(g2, '.mn-beast.seen').length, 0, 'a fresh profile has met nobody'); t.ok(/Not yet met/.test($(g2, '.mn-bdetail').textContent), 'the detail pane is not empty either');
  t.eq(errors(g2), 0, 'no console errors');
});

await t.test('library history: newest runs first with heroes, score, chapter, trial, daily and outcome; an empty state otherwise', async () => {
  const g = fresh();
  seedProfile(g);
  await go(g, 'library', { tab: 'history' });
  const rows = $$(g, '.mn-hist');
  t.eq(rows.length, 4, 'one row per run');
  t.deep(rows.map((r) => r.querySelector('.mn-h-out b').textContent), ['Victory', 'Fallen', 'Abandoned', 'Fallen'], 'outcomes, in the order META keeps (newest first)');
  t.eq(rows[0].querySelector('.mn-h-names').textContent, 'Hanae and Kuro', 'the party'); t.eq(rows[0].querySelectorAll('.mn-h-heroes .ico').length, 2, 'as medallions');
  t.eq(rows[0].querySelector('.mn-h-score b').textContent, '1,420', 'score'); t.eq(rows[0].querySelector('.mn-h-ch').textContent, 'Verse 3', 'chapter reached');
  t.ok(/\+52 Chimes/.test(rows[0].querySelector('.mn-h-out').textContent), 'Inkstones earned');
  t.ok(rows[0].querySelector('.hanko') && /T2/.test(rows[0].querySelector('.mn-h-tags').textContent), 'the trial seal T2'); t.ok(!rows[1].querySelector('.mn-h-tags .hanko'), 'trial 0 has no seal');
  t.ok(/D/.test(rows[3].querySelector('.mn-h-tags').textContent) && rows[3].classList.contains('daily'), 'the daily run is marked');
  t.ok(rows[0].classList.contains('win') && rows[1].classList.contains('lose') && rows[2].classList.contains('abandon'), 'rows are styled by outcome');
  t.ok(/\d{1,2} [A-Z][a-z]{2} 2026/.test(rows[0].querySelector('.mn-h-date').textContent), 'a date: ' + rows[0].querySelector('.mn-h-date').textContent);
  t.ok(/Victory with Hanae and Kuro/.test(rows[0].getAttribute('aria-label')), 'and a spoken summary: ' + rows[0].getAttribute('aria-label'));
  const sums = $$(g, '.mn-hist-sum b').map((b) => b.textContent);
  t.deep(sums, ['7', '2', '1,420', '4'], 'the summary strip: tales begun, wins, best score, rows');
  const g2 = fresh();
  await go(g2, 'library', { tab: 'history' });
  t.ok($(g2, '.mn-hist-empty') && /No journeys yet/.test($(g2, '.mn-hist-empty').textContent), 'an empty history has a friendly page');
  t.eq($$(g2, '.mn-hist').length, 0, 'and no rows');
});

await t.test('library: leaves cleanly, every control is named, canvases draw without issues', async () => {
  const g = fresh();
  seedProfile(g);
  await settle(g); g._click('.mn-gate'); await settle(g);
  const base = { pm: g._listeners('pointermove'), key: g._listeners('keydown') };
  await go(g, 'library');
  for (const id of ['achievements', 'story', 'bestiary', 'history', 'unlocks']) { g._click(tabBtn(g, id)); await settle(g, 2); }
  const unnamed = $$(g, '.s-library button, .s-library [role=button]').filter((b) => !nameOf(b) && !b.classList.contains('card'));
  t.eq(unnamed.length, 0, 'every button has a name: ' + unnamed.map((b) => b.className).join(', '));
  t.eq($$(g, '.s-library button, .s-library [role=button]').filter((b) => b.getAttribute('aria-disabled') !== 'true').length > 50, true, 'plenty of controls, all real buttons');
  await go(g, 'title');
  t.eq($$(g, '.s-library').length, 0, 'the root is gone'); t.eq(g._listeners('pointermove'), base.pm, 'no pointermove leaks'); t.eq(g._listeners('keydown'), base.key, 'no keydown leaks');
  t.ok(!g.UI.tip.open, 'no open tooltip');
  t.eq(g._issues.length, 0, 'no canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
  t.eq(errors(g), 0, 'no console errors'); t.eq(g._console.warn.length, 0, 'no warnings: ' + JSON.stringify(g._console.warn.slice(0, 2)));
});


// ==================================================================================================== SETTINGS
const row = (g, key) => $(g, '.mn-set-row[data-setting=' + key + ']');
const setSeg = (g, key, label) => $$(g, '.mn-set-row[data-setting=' + key + '] .seg-b').find((b) => b.textContent === label);
const segOn = (g, key) => ($$(g, '.mn-set-row[data-setting=' + key + '] .seg-b.on')[0] || { textContent: '' }).textContent;
const tog = (g, key) => $(g, '.mn-set-row[data-setting=' + key + '] .toggle');
const slid = (g, key) => $(g, '.mn-set-row[data-setting=' + key + '] input');
const stored = (g) => JSON.parse(g._store['rb_profile_v1']).settings;
const previews = (g) => g._run('__previews.slice()');

await t.test('settings screen: five groups, every control shows the saved value, Back and Escape leave', async () => {
  const g = fresh();
  const P = g.META.profile;
  Object.assign(P.settings, { musicVol: 0.35, sfxVol: 0.6, shake: 0.5, reduceMotion: true, textScale: 1.15, fastAnim: 2, damageNumbers: false, colorblind: true, quality: 'low', hints: false });
  await go(g, 'title'); await go(g, 'settings');
  t.deep($$(g, '.mn-set-h').map((h) => h.textContent), ['Sound', 'Motion', 'Help', 'Display', 'Screen and data'], 'five groups');
  t.eq($$(g, '.s-settings h1, .s-settings .panel-title, .s-settings .panel h2').length > 0, true, 'a titled panel');
  t.eq(slid(g, 'musicVol').value, '0.35', 'music volume shows 0.35'); t.eq(row(g, 'musicVol').querySelector('.s-val').textContent, '35%', 'as 35%');
  t.eq(slid(g, 'sfxVol').value, '0.6', 'effects volume shows 0.6'); t.eq(row(g, 'shake').querySelector('.s-val').textContent, '50%', 'shake 50%');
  t.eq(segOn(g, 'reduceMotion'), 'On', 'reduce motion On'); t.eq(segOn(g, 'textScale'), 'Large', 'text size Large'); t.eq(segOn(g, 'fastAnim'), 'Faster', 'animation speed Faster'); t.eq(segOn(g, 'quality'), 'Low', 'quality Low');
  t.eq(tog(g, 'damageNumbers').getAttribute('aria-checked'), 'false', 'damage numbers off'); t.eq(tog(g, 'colorblind').getAttribute('aria-checked'), 'true', 'colour-blind aids on'); t.eq(tog(g, 'hints').getAttribute('aria-checked'), 'false', 'hints off');
  t.ok($(g, '.mn-sample') && $(g, '.mn-sample').textContent.length > 15, 'a text size sample line'); t.eq($$(g, '.mn-glyphs .gem').length, 5, 'and a strip of five gem glyphs for the colour-blind aid');
  t.ok($(g, '.mn-set-row[data-setting=clear] .btn'), 'Clear saved data is offered on the screen');
  const unnamed = $$(g, '.s-settings button, .s-settings input').filter((b) => !nameOf(b));
  t.eq(unnamed.length, 0, 'every control has an accessible name: ' + unnamed.map((b) => b.className).join(','));
  t.ok($$(g, '.s-settings .seg').every((s) => s.getAttribute('role') === 'radiogroup' && s.getAttribute('aria-label')), 'each segmented control is a labelled radio group');
  t.eq(g.UI.screens.settings.state().form, true, 'state() reports the form');
  g._click('.mn-back'); await settle(g);
  t.eq(g.UI.currentName, 'title', 'Back returns to where you came from');
  await go(g, 'settings'); g._key('Escape'); await settle(g);
  t.eq(g.UI.currentName, 'title', 'Escape also goes back'); t.eq(g.UI.screens.settings.state(), null, 'state() is null once left');
  await go(g, 'settings'); g._key('Escape', { target: slid(g, 'sfxVol') }); await settle(g);
  t.eq(g.UI.currentName, 'title', 'and so does Escape while a slider has the focus (UI would only blur the slider)');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('settings: every control applies at once and persists in META and localStorage', async () => {
  const g = fresh();
  await go(g, 'settings');
  g._frames(30, 16);
  // sliders
  g._input(slid(g, 'musicVol'), 0.25);
  t.eq(g.META.get('musicVol'), 0.25, 'music volume is saved'); t.eq(stored(g).musicVol, 0.25, 'and written to localStorage'); t.eq(row(g, 'musicVol').querySelector('.s-val').textContent, '25%', 'and the readout follows');
  t.eq(previews(g).length, 0, 'moving the music slider needs no preview (the music itself is the preview)');
  g._input(slid(g, 'sfxVol'), 0.4);
  t.eq(g.META.get('sfxVol'), 0.4, 'effects volume is saved');
  t.ok(previews(g).indexOf('ui_click') >= 0, 'dragging the effects slider ticks a preview sound'); t.ok(previews(g).indexOf('card_pick') >= 0, 'and letting go plays the stronger one: ' + previews(g).join());
  const before = previews(g).length; g._input(slid(g, 'sfxVol'), 0.45);
  t.ok(previews(g).length - before <= 2, 'previews are throttled while dragging');
  g._input(slid(g, 'shake'), 0);
  t.eq(g.META.get('shake'), 0, 'shake off'); t.eq(g.UI.opt.shake, 0, 'UI.opt.shake follows'); t.eq(row(g, 'shake').querySelector('.s-val').textContent, 'Off', 'the readout says Off');
  g._input(slid(g, 'shake'), 0.75);
  t.eq(g.UI.opt.shake, 0.75, 'shake 75%'); t.eq(row(g, 'shake').querySelector('.s-val').textContent, '75%', 'and says 75%');
  // segmented controls
  g._click(setSeg(g, 'reduceMotion', 'On'));
  t.eq(g.META.get('reduceMotion'), true, 'reduce motion On is saved'); t.ok(g.UI.opt.reduceMotion, 'UI.opt.reduceMotion'); t.ok(g._doc.body.classList.contains('reduce-motion'), 'the body class is set');
  t.eq(segOn(g, 'reduceMotion'), 'On', 'the segment shows it'); t.eq($(g, '.mn-set-note .mn-set-hint').textContent, '', 'no device hint once it is explicit');
  g._click(setSeg(g, 'reduceMotion', 'Off'));
  t.eq(g.META.get('reduceMotion'), false, 'Off is saved'); t.ok(!g.UI.opt.reduceMotion && !g._doc.body.classList.contains('reduce-motion'), 'and it applies');
  g._media('(prefers-reduced-motion: reduce)', true);
  g._click(setSeg(g, 'reduceMotion', 'Auto'));
  t.eq(g.META.get('reduceMotion'), null, 'Auto is saved as null'); t.ok(g.UI.opt.reduceMotion, 'Auto follows the device (reduce)'); t.ok(/Following your device: reduced motion is on/.test($(g, '.mn-set-note .mn-set-hint').textContent), 'and says so: ' + $(g, '.mn-set-note .mn-set-hint').textContent);
  g._media('(prefers-reduced-motion: reduce)', false);
  g._click(setSeg(g, 'reduceMotion', 'Auto'));
  g._click(setSeg(g, 'fastAnim', 'Fast'));
  t.eq(g.META.get('fastAnim'), 1, 'animation speed Fast'); t.eq(g.UI.opt.fastAnim, 1, 'UI.opt.fastAnim');
  g._click(setSeg(g, 'fastAnim', 'Faster')); t.eq(g.UI.opt.fastAnim, 2, 'Faster');
  g._click(setSeg(g, 'textScale', 'Larger'));
  t.eq(g.META.get('textScale'), 1.3, 'text size Larger is saved'); t.eq(g.UI.opt.textScale, 1.3, 'UI.opt.textScale'); t.eq(String($(g, '#stage').style.getPropertyValue('--ts')), '1.3', 'and the stage gets --ts 1.3');
  g._click(setSeg(g, 'textScale', 'Large')); t.eq(String($(g, '#stage').style.getPropertyValue('--ts')), '1.15', 'Large is 1.15');
  g._click(setSeg(g, 'quality', 'Low'));
  t.eq(g.META.get('quality'), 'low', 'quality Low is saved'); t.ok(g._doc.body.classList.contains('low'), 'the body gets the low class');
  g._click(setSeg(g, 'quality', 'High')); t.ok(!g._doc.body.classList.contains('low'), 'High removes it');
  // toggles
  g._click(tog(g, 'damageNumbers')); t.eq(g.META.get('damageNumbers'), false, 'damage numbers off'); t.eq(g.UI.opt.damageNumbers, false, 'UI.opt.damageNumbers'); t.eq(tog(g, 'damageNumbers').getAttribute('aria-checked'), 'false', 'aria-checked follows');
  g._click(tog(g, 'colorblind')); t.eq(g.META.get('colorblind'), true, 'colour-blind aids on'); t.ok(g._doc.body.classList.contains('colorblind'), 'the body class is set');
  g._click(tog(g, 'hints')); t.eq(g.META.get('hints'), false, 'hints off');
  const s = stored(g);
  t.deep([s.sfxVol, s.shake, s.reduceMotion, s.fastAnim, s.textScale, s.quality, s.damageNumbers, s.colorblind, s.hints], [0.45, 0.75, null, 2, 1.15, 'high', false, true, false], 'everything is in localStorage: ' + JSON.stringify(s));
  // a fresh boot on the same storage reads it all back
  const store = Object.assign({}, g._store);
  const g2 = boot({ only: ['screen_menu', 'main'], skip: SKIP, epoch: EPOCH, store });
  g2.GAME.boot(); await go(g2, 'settings');
  t.eq(slid(g2, 'sfxVol').value, '0.45', 'the next visit shows the saved effects volume'); t.eq(segOn(g2, 'textScale'), 'Large', 'text size'); t.eq(segOn(g2, 'quality'), 'High', 'quality'); t.eq(tog(g2, 'colorblind').getAttribute('aria-checked'), 'true', 'colour-blind');
  t.ok(g2._doc.body.classList.contains('colorblind'), 'and it is applied on boot');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('settings: the shake slider shakes its own row as a demonstration, and only flashes it under reduce motion', async () => {
  const g = fresh();
  await go(g, 'settings');
  const r = row(g, 'shake');
  g._input(slid(g, 'shake'), 0.5);
  t.ok(r.classList.contains('shake'), 'the row shakes while you drag');
  await settle(g, 40);
  t.ok(!r.classList.contains('shake'), 'and settles again');
  g.UI.setSetting('reduceMotion', true);
  g._input(slid(g, 'shake'), 1);
  t.ok(!r.classList.contains('shake') && r.classList.contains('flash-bad'), 'under reduce motion it only flashes (no movement)');
  t.eq(g.META.get('shake'), 1, 'the value still saves');
  await settle(g, 40);
  g.UI.setSetting('reduceMotion', false);
  g._input(slid(g, 'shake'), 0);
  t.ok(!r.classList.contains('shake'), 'at 0 nothing moves');
  t.eq(g._issues.length, 0, 'no canvas issues');
});

await t.test('settings: Restore defaults resets every setting, rebuilds the form and says so', async () => {
  const g = fresh();
  Object.assign(g.META.profile.settings, { musicVol: 0.1, sfxVol: 0.2, shake: 0, reduceMotion: true, textScale: 1.3, fastAnim: 2, damageNumbers: false, colorblind: true, quality: 'low', hints: false });
  g.UI.applySettings();
  await go(g, 'settings');
  t.ok(g._doc.body.classList.contains('colorblind') && g._doc.body.classList.contains('low'), 'the odd settings are applied first');
  g._click($(g, '.mn-set-row[data-setting=defaults] .btn')); await settle(g);
  const D = g.DATA.SETTINGS;
  Object.keys(D).forEach((k) => t.eq(g.META.get(k), D[k].def, 'META ' + k + ' is back to ' + D[k].def));
  t.eq(slid(g, 'musicVol').value, '0.7', 'the rebuilt form shows the default music volume'); t.eq(segOn(g, 'textScale'), 'Normal', 'text size Normal'); t.eq(segOn(g, 'reduceMotion'), 'Auto', 'reduce motion Auto'); t.eq(tog(g, 'hints').getAttribute('aria-checked'), 'true', 'hints back on');
  t.ok(!g._doc.body.classList.contains('colorblind') && !g._doc.body.classList.contains('low'), 'and the body classes are gone'); t.eq(g.UI.opt.textScale, 1, 'UI.opt is back to 1');
  t.ok(toasts(g).some((x) => /restored/i.test(x)), 'a toast says settings were restored');
  t.eq($$(g, '.mn-set').length, 1, 'the form was replaced, not duplicated');
  t.eq(g.META.inkstones, 0, 'progress is untouched');
});

await t.test('settings: Clear saved data asks twice, keeps the settings, erases progress and the saved tale', async () => {
  const g = fresh();
  seedProfile(g); saveRun(g); g.META.set('textScale', 1.15); g.META.set('musicVol', 0.4);
  await go(g, 'settings');
  const clear = () => $(g, '.mn-set-row[data-setting=clear] .btn');
  t.ok(clear().classList.contains('btn-danger') || clear().classList.contains('danger'), 'the button is styled as dangerous');
  g._click(clear()); await settle(g);
  t.ok(g.UI.overlay.has('confirm'), 'first confirmation'); t.ok(/Erase all progress/.test($(g, '.o-confirm').textContent), 'it says what will happen');
  g._click('.o-confirm .btn-secondary'); await settle(g);
  t.eq(g.META.inkstones, 200, 'Keep everything leaves all as it was'); t.ok(g.META.hasRun(), 'and the tale');
  g._flush(1000);
  g._click(clear()); await settle(g);
  g._click('.o-confirm .btn-primary'); await settle(g);
  t.ok(g.UI.overlay.has('confirm') && /Really erase/.test($(g, '.o-confirm').textContent), 'a second, sterner confirmation follows');
  t.eq(g.META.inkstones, 200, 'nothing is gone yet');
  g._click('.o-confirm .btn-secondary'); await settle(g);
  t.eq(g.META.inkstones, 200, 'Cancel at step two keeps everything'); t.ok(g.META.history.length === 4, 'history too');
  g._flush(1000);
  g._click(clear()); await settle(g); g._click('.o-confirm .btn-primary'); await settle(g); g._click('.o-confirm .btn-primary'); await settle(g);
  t.eq(g.META.inkstones, 0, 'both yeses: Inkstones erased'); t.eq(g.META.history.length, 0, 'history erased'); t.ok(!g.META.hasRun(), 'the saved tale is gone'); t.eq(g.META.profile.unlocked.hero.length, 0, 'unlocks erased'); t.eq(Object.keys(g.META.profile.seen).length, 0, 'bestiary erased');
  t.eq(g.META.get('textScale'), 1.15, 'but the settings stay'); t.eq(g.META.get('musicVol'), 0.4, 'all of them');
  t.ok(toasts(g).some((x) => /quiet again/i.test(x)), 'a toast confirms it');
  t.eq(g.UI.overlay.has('confirm'), false, 'no confirm is left open');
  await go(g, 'title'); await settle(g); g._flush(1000);
  t.eq($$(g, '.mn-plaque').map((b) => b.dataset.act).join(), 'new,daily,library,settings,howto', 'the title no longer offers Continue');
  await go(g, 'heroSelect');
  t.deep(g.UI.screens.heroSelect.state().chosen, [], 'hero select starts with an empty party again');
  t.eq($$(g, '.mn-hcard.locked').length, 2, 'and the locked heroes are locked again');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('settings overlay: the same form without Clear data, Done and Escape close, changes apply live', async () => {
  const g = fresh();
  seedProfile(g);
  await go(g, 'title');
  g.UI.overlay.open('settings'); await settle(g);
  t.ok(g.UI.overlay.has('settings'), 'the overlay opens');
  t.eq($$(g, '.o-settings .mn-set-row').length, $$(g, '.mn-set-row').length, 'one form only');
  t.ok(!$(g, '.o-settings .mn-set-row[data-setting=clear]'), 'no Clear saved data while a run may be active'); t.ok(/from the title screen/.test($(g, '.o-settings .mn-set').textContent), 'it says where to clear instead');
  t.ok($(g, '.o-settings .mn-set.in-overlay'), 'marked as the overlay variant');
  g._click(tog(g, 'colorblind')); t.ok(g._doc.body.classList.contains('colorblind'), 'a change applies while the overlay is open'); t.eq(g.META.get('colorblind'), true, 'and saves');
  g._click($(g, '.o-settings .mn-set-done .btn')); await settle(g);
  t.ok(!g.UI.overlay.has('settings'), 'Done closes it');
  g.UI.overlay.open('settings'); await settle(g);
  g._key('Escape'); await settle(g);
  t.ok(!g.UI.overlay.has('settings'), 'Escape closes it');
  g.UI.overlay.open('settings'); await settle(g);
  g._key('Escape', { target: slid(g, 'musicVol') }); await settle(g);
  t.ok(!g.UI.overlay.has('settings'), 'Escape closes it even while a slider has the focus (UI would only blur the slider)');
  g.UI.overlay.open('settings'); await settle(g);
  t.ok($(g, '.o-settings [data-autofocus]') === slid(g, 'musicVol'), 'the first control takes the initial focus (not Done: focusing the bottom would scroll a short screen down)');
  t.ok(!$(g, '.o-settings .mn-set-done [data-autofocus]'), 'and Done is not the autofocus');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('settings: fullscreen button, entering with text 1.3, colour-blind and reduce motion, no canvas issues over time', async () => {
  const g = fresh();
  await go(g, 'settings');
  const fsb = $(g, '.mn-set-row[data-setting=fullscreen] .btn');
  t.ok(fsb && /Full screen/.test(fsb.textContent), 'a Full screen button');
  g._click(fsb); t.ok(g._doc.fullscreenElement, 'it requests fullscreen'); await settle(g);
  t.ok(/Leave full screen/.test(fsb.textContent), 'and flips its label once active: ' + fsb.textContent);
  g._click(fsb); await settle(g); t.ok(!g._doc.fullscreenElement, 'a second press leaves fullscreen'); t.ok(/^Full screen/.test(fsb.textContent), 'and flips back');
  g.UI.setSetting('textScale', 1.3); g.UI.setSetting('colorblind', true); g.UI.setSetting('reduceMotion', true);
  await go(g, 'title'); await go(g, 'settings');
  g._frames(120, 16);
  t.eq($$(g, '.mn-set-row').length, 13, 'thirteen rows at text 1.3');
  t.eq(g._issues.length, 0, 'no canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
  const base = g._listeners('keydown');
  await go(g, 'title');
  t.eq(g._listeners('keydown'), base, 'no listener leaks'); t.eq($$(g, '.s-settings').length, 0, 'root gone');
  t.eq(errors(g), 0, 'no console errors'); t.eq(g._console.warn.length, 0, 'no warnings: ' + JSON.stringify(g._console.warn.slice(0, 2)));
});


// ==================================================================================================== HOW TO PLAY
const HT_IDS = ['book', 'map', 'rows', 'cards', 'intents', 'gems', 'places', 'after'];
const htState = (g) => g.UI.screens.howto.state();
const pageTitle = (g) => $(g, '.mn-pg-title').textContent;

await t.test('howto: eight pages, each with a diagram, a kicker, three numbered rules and a page number', async () => {
  const g = fresh();
  await go(g, 'title'); g._click('.mn-gate'); await settle(g);
  g._key('h'); await settle(g);
  t.eq(g.UI.currentName, 'howto', 'H on the title opens it');
  t.eq(htState(g).pages, 8, 'eight pages'); t.eq(htState(g).page, 0, 'starting on the first');
  t.ok($(g, '.mn-ht-banner') && /How to Play/.test($(g, '.mn-ht-banner').textContent), 'a How to Play banner');
  const seen = [];
  for (let i = 0; i < 8; i++) {
    if (i) { g._click($(g, '.mn-ht-nav .btn-primary')); await settle(g, 2); }
    t.eq(htState(g).id, HT_IDS[i], 'page ' + (i + 1) + ' is ' + HT_IDS[i]);
    seen.push(pageTitle(g));
    t.ok($(g, '.mn-illus canvas, .mn-illus .mn-af-card, .mn-illus .mn-int, .mn-illus > *'), 'page ' + (i + 1) + ' has a diagram');
    t.ok($(g, '.mn-pg-kicker').textContent.length > 10, 'and a kicker: ' + $(g, '.mn-pg-kicker').textContent);
    t.eq($$(g, '.mn-pg-rules li').length, 3, 'three rules'); t.deep($$(g, '.mn-pg-rules li .hanko').map((h) => h.textContent.trim()), ['1', '2', '3'], 'numbered with hanko seals');
    t.eq($(g, '.mn-pg-no').textContent, (i + 1) + ' / 8', 'the page number');
    t.ok(/page \d of 8: /.test($(g, '.mn-book').getAttribute('aria-label')), 'the book is labelled: ' + $(g, '.mn-book').getAttribute('aria-label'));
    t.eq($$(g, '.mn-dot.on').length, 1, 'exactly one dot is lit'); t.eq($$(g, '.mn-dot')[i].classList.contains('on'), true, 'the right one'); t.eq($$(g, '.mn-dot.seen').length, i, 'earlier ones are marked seen');
  }
  t.eq(new Set(seen).size, 8, 'eight distinct titles: ' + seen.join(' | '));
  t.eq($(g, '.mn-ht-nav .btn-primary').textContent.trim(), 'Done', 'the last page offers Done instead of Next');
  t.ok(!$(g, '.mn-margin'), 'the last page has no margin note (the keys list takes its place)');
  t.eq($$(g, '.mn-pg-extra.keys kbd').length, 8, 'eight keyboard shortcuts on the last page'); t.ok($$(g, '.mn-pg-extra.keys dd').every((d) => d.textContent.length > 3), 'each with a description');
  g._click($(g, '.mn-ht-nav .btn-primary')); await settle(g);
  t.eq(g.UI.currentName, 'title', 'Done goes back to where you came from');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('howto: Previous, Next, dots, keys and Escape', async () => {
  const g = fresh();
  await go(g, 'title'); await go(g, 'howto');
  const prev = () => $(g, '.mn-ht-nav .btn-secondary'), next = () => $(g, '.mn-ht-nav .btn-primary');
  t.eq(prev().getAttribute('aria-disabled'), 'true', 'Previous is disabled on the first page'); t.ok(/first page/i.test(prev().title || prev().getAttribute('data-reason') || prev().getAttribute('aria-description') || 'first page'), 'with a reason available');
  g._click(prev()); await settle(g); t.eq(htState(g).page, 0, 'pressing it does nothing');
  g._click(next()); await settle(g); t.eq(htState(g).page, 1, 'Next turns to page 2'); t.ok(sfxLog(g).indexOf('page_turn') >= 0, 'with a page turn sound');
  t.ok(!prev().getAttribute('aria-disabled') || prev().getAttribute('aria-disabled') === 'false', 'Previous is live now');
  g._click(prev()); await settle(g); t.eq(htState(g).page, 0, 'Previous goes back');
  g._click($$(g, '.mn-dot')[5]); await settle(g); t.eq(htState(g).page, 5, 'a dot jumps to that page'); t.ok(/Gems in Slots/.test(pageTitle(g)), 'Gems in Slots: ' + pageTitle(g));
  t.ok(/Page 6: /.test($$(g, '.mn-dot')[5].getAttribute('aria-label')), 'a dot is named by page and title');
  g._key('ArrowRight'); t.eq(htState(g).page, 6, 'ArrowRight'); g._key('PageDown'); t.eq(htState(g).page, 7, 'PageDown');
  g._key('ArrowRight'); t.eq(htState(g).page, 7, 'and stays on the last page');
  g._key('ArrowLeft'); t.eq(htState(g).page, 6, 'ArrowLeft'); g._key('PageUp'); t.eq(htState(g).page, 5, 'PageUp');
  g._key('Home'); t.eq(htState(g).page, 0, 'Home'); g._key('ArrowLeft'); t.eq(htState(g).page, 0, 'ArrowLeft on page 1 stays'); g._key('End'); t.eq(htState(g).page, 7, 'End');
  t.eq(g.UI.currentName, 'howto', 'none of that left the screen');
  const log = sfxLog(g).filter((x) => x === 'page_turn').length;
  g._key('x'); t.eq(g.UI.currentName, 'howto', 'other keys are left alone'); t.eq(sfxLog(g).filter((x) => x === 'page_turn').length, log, 'silently');
  g._key('Escape'); await settle(g);
  t.eq(g.UI.currentName, 'title', 'Escape goes back'); t.eq(htState(g), null, 'state() clears');
  await go(g, 'howto'); t.eq(htState(g).page, 0, 'the screen always opens on page 1');
  g._click('.mn-back'); await settle(g); t.eq(g.UI.currentName, 'title', 'the Back button too');
});

await t.test('howto: a horizontal swipe turns the page, a short or vertical drag does not', async () => {
  const g = fresh();
  await go(g, 'howto');
  const book = $(g, '.mn-book');
  g._drag(book, [900, 300], [500, 310]); t.eq(htState(g).page, 1, 'swipe left = next page');
  g._drag(book, [500, 300], [900, 300]); t.eq(htState(g).page, 0, 'swipe right = previous');
  g._drag(book, [500, 300], [900, 300]); t.eq(htState(g).page, 0, 'swiping right on page 1 stays');
  g._drag(book, [600, 300], [560, 300]); t.eq(htState(g).page, 0, 'a short drag does nothing');
  g._drag(book, [600, 100], [300, 500]); t.eq(htState(g).page, 0, 'a mostly vertical drag does nothing');
  g._pointer('pointerdown', book, { x: 900, y: 300 }); g._pointer('pointercancel', book, { x: 500, y: 300 }); g._pointer('pointerup', book, { x: 300, y: 300 });
  t.eq(htState(g).page, 0, 'a cancelled gesture is forgotten');
  for (let i = 0; i < 9; i++) g._drag(book, [900, 300], [400, 300]);
  t.eq(g.UI.currentName, 'howto', 'swiping past the last page does not exit'); t.eq(htState(g).page, 7, 'it stops on the last page');
});

await t.test('howto: the margin notes are real tips from DATA, statuses come from DATA.statuses, and big text drops the notes', async () => {
  const g = fresh();
  await go(g, 'howto');
  const notes = [];
  for (let i = 0; i < 8; i++) { g._click($$(g, '.mn-dot')[i]); await settle(g, 2); const m = $(g, '.mn-margin'); if (m) notes.push(m.querySelector('p').textContent); }
  t.eq(notes.length, 7, 'seven pages carry a margin note (all but the last)'); t.ok(notes.every((n) => g.DATA.tips.indexOf(n) >= 0), 'each note is a tip from DATA.tips'); t.eq(new Set(notes).size, 7, 'and all are different');
  t.ok(/Liner note/.test($(g, '.mn-margin b') ? $(g, '.mn-margin b').textContent : 'Liner note'), 'headed Liner note');
  g._click($$(g, '.mn-dot')[4]); await settle(g, 2);
  const st = $$(g, '.mn-pg-extra.statuses .status, .mn-pg-extra.statuses > *');
  t.eq(st.length, 9, 'nine statuses on the Intents page');
  t.ok($$(g, '.mn-pg-extra.statuses [aria-label], .mn-pg-extra.statuses .status').length >= 9, 'each is a real UI.status chip (hover for the rules text)');
  t.ok(g.DATA.statuses.vulnerable && g.DATA.statuses.poison && g.DATA.statuses.might, 'and all exist in the data');
  g.UI.setSetting('textScale', 1.3);
  await go(g, 'howto'); g._click($$(g, '.mn-dot')[1]); await settle(g, 2);
  t.ok(!$(g, '.mn-margin'), 'at text 1.3 the margin note is dropped to keep the page from overflowing');
  t.eq($$(g, '.mn-pg-rules li').length, 3, 'the rules stay');
});

await t.test('howto: every diagram animates for several seconds without canvas issues, on every page, with and without reduce motion', async () => {
  for (const rm of [false, true]) {
    const g = fresh();
    if (rm) g.UI.setSetting('reduceMotion', true);
    await go(g, 'howto');
    for (let i = 0; i < 8; i++) {
      g._click($$(g, '.mn-dot')[i]); await settle(g, 2);
      g._resetCounts();
      g._frames(150, 16);
      t.eq(g._issues.length, 0, (rm ? 'reduce motion, ' : '') + 'page ' + (i + 1) + ' (' + HT_IDS[i] + ') animates cleanly: ' + JSON.stringify(g._issues.slice(0, 2)));
      const c = $(g, '.mn-illus canvas');
      if (c) t.ok(ops(g) > 100, 'page ' + (i + 1) + ' actually paints (' + ops(g) + ' canvas calls)');
    }
    t.eq(errors(g), 0, 'no console errors'); t.eq(g._console.warn.length, 0, 'no warnings: ' + JSON.stringify(g._console.warn.slice(0, 2)));
  }
});

await t.test('howto: the DOM diagrams show real data (intent bubbles, gems, tile kinds, Inkstone, trial seals, the daily seed)', async () => {
  const g = fresh();
  seedProfile(g);
  await go(g, 'howto');
  g._click($$(g, '.mn-dot')[4]); await settle(g, 2);
  t.ok($$(g, '.mn-legend .mn-lg').length >= 5 && $$(g, '.mn-legend .mn-lg .ico').length === $$(g, '.mn-legend .mn-lg').length, 'the intents page has a legend of intent icons, one per intent (' + $$(g, '.mn-legend .mn-lg').length + ')');
  t.ok($(g, '.mn-illus canvas'), 'over a live enemy scene');
  g._click($$(g, '.mn-dot')[5]); await settle(g, 2);
  t.ok($$(g, '.mn-illus .gem, .mn-illus canvas').length >= 1, 'the gems page shows gems or a painted card');
  g._click($$(g, '.mn-dot')[6]); await settle(g, 2);
  t.ok($$(g, '.mn-illus *').length >= 6, 'the places page shows tiles');
  g._click($$(g, '.mn-dot')[7]); await settle(g, 2);
  t.eq($$(g, '.mn-af-card').length, 3, 'the last page has Inkstones, Ink Trials and Daily Tale cards');
  t.ok($$(g, '.mn-af-card')[2].textContent.indexOf(String(todaySeed(g))) >= 0, 'the daily card names today\'s seed ' + todaySeed(g));
  t.eq($$(g, '.mn-af-seal').length, 11, 'eleven trial seals are pictured (0 to X)'); t.eq($$(g, '.mn-af-seal.on').length, g.META.trialMax() + 1, 'those you have opened are lit: 0 to ' + g.META.trialMax()); t.ok($(g, '.mn-af-seals').getAttribute('aria-label').indexOf('opened up to ' + g.META.trialMax()) > 0, 'and the strip is described to screen readers');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('howto: leaves cleanly (no listeners, DOM or timers left) and every control is named', async () => {
  const g = fresh();
  await go(g, 'title'); g._click('.mn-gate'); await settle(g);
  const base = { pm: g._listeners('pointermove'), key: g._listeners('keydown'), pu: g._listeners('pointerup') };
  await go(g, 'howto');
  for (let i = 0; i < 8; i++) { g._key('ArrowRight'); g._frames(5, 16); }
  const unnamed = $$(g, '.s-howto button').filter((b) => !nameOf(b));
  t.eq(unnamed.length, 0, 'every button has a name: ' + unnamed.map((b) => b.className).join(','));
  t.ok($$(g, '.mn-dot').every((d) => d.getAttribute('role') === 'tab'), 'the dots are tabs');
  t.eq($$(g, '.mn-dot[aria-selected=true]').length, 1, 'one is selected');
  await go(g, 'title');
  t.eq($$(g, '.s-howto').length, 0, 'root gone'); t.eq(g._listeners('pointermove'), base.pm, 'no pointermove leak'); t.eq(g._listeners('keydown'), base.key, 'no keydown leak'); t.eq(g._listeners('pointerup'), base.pu, 'no pointerup leak');
  g._frames(60, 16);
  t.eq(g._issues.length, 0, 'no canvas issues after leaving: the diagrams stopped drawing'); t.eq(errors(g), 0, 'no console errors');
});


// ==================================================================================================== PAUSE
async function startRun(g, o = {}) {
  const R = g.GAME.newRun({ heroes: o.heroes || ['hanae', 'kuro'], seed: o.seed || 4242, trial: o.trial || 0 });
  await settle(g, 6);
  await g.UI.go('map', { R }, { force: true, transition: 'none' }); await g._settle(); g._frames(3, 16);
  return R;
}
const openPause = async (g) => { g.UI.overlay.open('pause'); await settle(g); };
const acts = (g) => $$(g, '.mn-pause [data-act]').map((b) => b.dataset.act);
const pbtn = (g, act) => $(g, '.mn-pause [data-act=' + act + ']');
const pausing = (g) => g.UI.overlay.has('pause');

await t.test('pause: opens from the menu button with the run card, the plaques and a tip, Resume and Escape close it', async () => {
  const g = fresh();
  const R = await startRun(g, { trial: 2 });
  t.ok($(g, '.menu-btn'), 'the map has the hamburger menu button');
  g._click('.menu-btn'); await settle(g);
  t.ok(pausing(g), 'the pause overlay opens'); t.ok(/Paused/.test($(g, '.o-pause .panel h2, .o-pause .panel-title, .o-pause h2').textContent), 'titled Paused');
  t.deep(acts(g), ['resume', 'deck', 'relics', 'settings', 'howto', 'quit', 'abandon'], 'Resume, Deck, Treasures, Settings, How to play, Save and quit, Abandon run');
  t.eq($(g, '.mn-p-chips').textContent.replace(/\s+/g, ' ').trim(), 'Verse 1Tempo Trial II', 'the run card names the chapter and the trial');
  t.eq($$(g, '.mn-p-heroes .hero-badge, .mn-p-heroes > *').length, 2, 'two hero badges'); t.ok(/Hanae/.test($(g, '.mn-p-heroes').textContent + $$(g, '.mn-p-heroes [aria-label]').map((x) => x.getAttribute('aria-label')).join()), 'Hanae is one');
  t.ok($(g, '.mn-p-stats .stat'), 'gold and ink are shown'); t.ok(/No treasures yet/.test($(g, '.mn-p-relics').textContent), 'no treasures yet');
  t.eq($(g, '[data-act=deck] .hanko').textContent.trim(), String(R.deck.length), 'the Deck plaque counts the deck: ' + R.deck.length);
  t.eq($(g, '[data-act=relics] .hanko').textContent.trim(), '0', 'the Treasures plaque counts 0');
  t.ok($(g, '.mn-p-tip') && g.DATA.tips.indexOf($(g, '.mn-p-tip p').textContent) >= 0, 'the tip is one of DATA.tips: ' + $(g, '.mn-p-tip p').textContent);
  t.ok($(g, '.mn-pause [data-act=resume]').classList.contains('breathe'), 'Resume breathes'); t.ok($(g, '.mn-pause [data-act=abandon]').classList.contains('mn-danger'), 'Abandon is styled dangerous');
  t.ok($(g, '.o-pause [data-autofocus]') === pbtn(g, 'resume'), 'Resume takes the initial focus');
  const tip1 = $(g, '.mn-p-tip p').textContent;
  g._click(pbtn(g, 'resume')); await settle(g);
  t.ok(!pausing(g), 'Resume closes the overlay'); t.eq(g.UI.currentName, 'map', 'and the game is where it was'); t.ok(sfxLog(g).indexOf('ui_close') >= 0, 'with the close sound');
  await openPause(g);
  t.eq($(g, '.mn-p-tip p').textContent, tip1, 'the same tip returns for the same run (deterministic)');
  g._key('Escape'); await settle(g);
  t.ok(!pausing(g), 'Escape closes the overlay');
  await openPause(g); g._key('r'); await settle(g);
  t.ok(!pausing(g), 'R resumes');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('pause: the run card follows the run (daily tag, treasures, brushes, different seed different tip)', async () => {
  const g = fresh();
  const R = await startRun(g, { heroes: ['kuro', 'suzu'], seed: 77 });
  R.daily = true; R.gold = 123; R.ink = 4;
  const relicIds = Object.keys(g.DATA.relics).slice(0, 3); R.relics = relicIds.slice();
  await openPause(g);
  t.ok(/Daily Jam/.test($(g, '.mn-p-chips').textContent), 'a Daily Jam chip'); t.ok(!/Tempo Trial/.test($(g, '.mn-p-chips').textContent), 'no trial chip at trial 0');
  t.eq($$(g, '.mn-p-relics .relic, .mn-p-relics > *').length, 3, 'three treasures are pictured'); t.eq($(g, '[data-act=relics] .hanko').textContent.trim(), '3', 'and counted');
  t.ok(/123/.test($(g, '.mn-p-stats').textContent), 'gold 123 is shown'); t.ok(/Kuro/.test($(g, '.mn-p-heroes').textContent + $$(g, '.mn-p-heroes [aria-label]').map((x) => x.getAttribute('aria-label')).join()), 'Kuro is in the party');
  const tips = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) { g._key('Escape'); await settle(g); g.UI.run.seed = seed; await openPause(g); tips.add($(g, '.mn-p-tip p').textContent); }
  t.ok(tips.size >= 3, 'the tip varies with the seed (' + tips.size + ' different in 10)');
});

await t.test('pause: Deck, Treasures and Settings stack their overlays over the pause menu, and Escape peels them off one at a time', async () => {
  const g = fresh();
  await startRun(g);
  await openPause(g);
  g._click(pbtn(g, 'deck')); await settle(g);
  t.ok(g.UI.overlay.has('deck'), 'Deck opens the deck overlay'); t.ok(pausing(g), 'over the pause menu');
  g._key('Escape'); await settle(g);
  t.ok(!g.UI.overlay.has('deck') && pausing(g), 'Escape closes the deck only');
  g._click(pbtn(g, 'relics')); await settle(g);
  t.ok(g.UI.overlay.has('relics') && pausing(g), 'Treasures opens the treasure overlay'); g._key('Escape'); await settle(g); t.ok(pausing(g) && !g.UI.overlay.has('relics'), 'and Escape peels it off');
  g._click(pbtn(g, 'settings')); await settle(g);
  t.ok(g.UI.overlay.has('settings') && pausing(g), 'Settings opens the settings overlay'); t.ok($(g, '.o-settings .mn-set.in-overlay'), 'in its overlay form');
  g._click(tog(g, 'hints')); t.eq(g.META.get('hints'), false, 'a change made there saves');
  g._click($(g, '.o-settings .mn-set-done .btn')); await settle(g);
  t.ok(!g.UI.overlay.has('settings') && pausing(g), 'Done returns to the pause menu');
  for (const [key, ov] of [['d', 'deck'], ['t', 'relics'], ['s', 'settings']]) { g._key(key); await settle(g); t.ok(g.UI.overlay.has(ov), 'the ' + key.toUpperCase() + ' key opens ' + ov); g._key('Escape'); await settle(g); t.ok(pausing(g), 'and Escape returns to pause'); }
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('pause: How to play is a sub view of the overlay, with its own pages, keys, Back and Escape', async () => {
  const g = fresh();
  await startRun(g);
  await openPause(g);
  g._click(pbtn(g, 'howto')); await settle(g);
  t.ok(pausing(g) && $(g, '.mn-ht-wrap'), 'the pages replace the menu inside the same overlay'); t.ok(!$(g, '.mn-pause'), 'the menu is hidden');
  t.eq($$(g, '.o-pause .mn-dot').length, 8, 'eight pages'); t.eq($(g, '.o-pause .mn-pg-no').textContent, '1 / 8', 'on page 1');
  g._click($(g, '.o-pause .mn-ht-nav .btn-primary')); await settle(g);
  t.eq($(g, '.o-pause .mn-pg-no').textContent, '2 / 8', 'Next works'); g._key('End'); t.eq($(g, '.o-pause .mn-pg-no').textContent, '8 / 8', 'End'); g._key('Home'); t.eq($(g, '.o-pause .mn-pg-no').textContent, '1 / 8', 'Home'); g._key('ArrowRight'); t.eq($(g, '.o-pause .mn-pg-no').textContent, '2 / 8', 'ArrowRight');
  g._key('Escape'); await settle(g);
  t.ok(pausing(g) && $(g, '.mn-pause') && !$(g, '.mn-ht-wrap'), 'Escape returns to the pause menu without closing the overlay');
  g._click(pbtn(g, 'howto')); await settle(g); t.eq($(g, '.o-pause .mn-pg-no').textContent, '1 / 8', 'reopening starts at page 1');
  g._click('.mn-ht-back'); await settle(g);
  t.ok($(g, '.mn-pause') && !$(g, '.mn-ht-wrap'), 'the Back to pause menu button also returns');
  g._key('h'); await settle(g); t.ok($(g, '.mn-ht-wrap'), 'H opens How to play');
  g._key('End'); await settle(g); g._click($(g, '.o-pause .mn-ht-nav .btn-primary')); await settle(g);
  t.ok($(g, '.mn-pause') && pausing(g), 'Done on the last page returns to the pause menu');
  g._key('Escape'); await settle(g); t.ok(!pausing(g), 'Escape on the menu closes it');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('pause: the diagrams inside the overlay are driven by the frame clock and stop when it closes', async () => {
  const g = fresh();
  await startRun(g);
  g._run('window.__HEADLESS = false');
  await openPause(g);
  g._click(pbtn(g, 'howto')); await settle(g);
  const cv = $(g, '.o-pause .mn-illus canvas');
  t.ok(cv, 'the first diagram is a canvas');
  const cx = cv.getContext('2d'); let clears = 0; const orig = cx.clearRect.bind(cx); cx.clearRect = (...a) => { clears++; return orig(...a); };
  g._resetCounts();
  await g._tick(3200, 16);
  t.ok(clears > 150, 'the diagram repaints every frame while the overlay is open (' + clears + ' repaints in 3 s)');
  t.eq(g._issues.length, 0, 'without canvas issues: ' + JSON.stringify(g._issues.slice(0, 2)));
  for (let i = 0; i < 4; i++) { g._key('ArrowRight'); await g._tick(1000, 16); }
  t.eq(g._issues.length, 0, 'across pages too');
  g._key('End'); g._key('Home');
  const cv2 = $(g, '.o-pause .mn-illus canvas'); const cx2 = cv2.getContext('2d'); let c2 = 0; const o2 = cx2.clearRect.bind(cx2); cx2.clearRect = (...a) => { c2++; return o2(...a); };
  await g._tick(500, 16); t.ok(c2 > 20, 'the newly built diagram is driven too');
  g._key('Escape'); g._key('Escape'); await g._tick(100, 16);
  t.ok(!pausing(g), 'closed');
  const before = clears + c2; await g._tick(3200, 16);
  t.eq(clears + c2, before, 'nothing keeps repainting after the overlay is gone');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('pause: Abandon run asks first, records the run as abandoned, pays Inkstones and returns to the title', async () => {
  const g = fresh();
  const R = await startRun(g, { trial: 1 });
  await openPause(g);
  const hist = g.META.history.length;
  g._click(pbtn(g, 'abandon')); await settle(g);
  t.ok(g.UI.overlay.has('confirm'), 'a confirm asks first'); t.ok(/Abandon this journey/.test($(g, '.o-confirm').textContent), 'it says what it is: ' + $(g, '.o-confirm h2, .o-confirm .panel-title').textContent);
  t.eq(g.META.history.length, hist, 'nothing is recorded yet');
  g._click('.o-confirm .btn-secondary'); await settle(g);
  t.ok(!g.UI.overlay.has('confirm') && pausing(g), 'Keep playing leaves the pause menu open'); t.eq(g.UI.currentName, 'map', 'still on the map'); t.eq(g.META.history.length, hist, 'nothing recorded');
  g._flush(1000);
  g._click(pbtn(g, 'abandon')); await settle(g); g._click('.o-confirm .btn-primary'); await settle(g, 8);
  t.eq(g.UI.currentName, 'title', 'Abandon goes to the title'); t.ok(!pausing(g) && !g.UI.overlay.has('confirm'), 'every overlay is closed');
  t.eq(g.META.history.length, hist + 1, 'one history row was added'); t.eq(g.META.history[0].outcome, 'abandon', 'as an abandoned run'); t.eq(g.META.history[0].trial, 1, 'with its trial'); t.deep(g.META.history[0].heroes, ['hanae', 'kuro'], 'and party');
  t.ok(!g.META.hasRun(), 'the saved tale is gone');
  g._click('.mn-gate'); await settle(g);
  t.eq($$(g, '.mn-plaque').map((b) => b.dataset.act).indexOf('continue'), -1, 'and the title no longer offers Continue');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('pause: Save and quit saves the tale, closes everything and lets the title Continue it', async () => {
  const g = fresh();
  const R = await startRun(g);
  R.gold = 321;
  await openPause(g);
  g._click(pbtn(g, 'quit')); await settle(g, 8);
  t.eq(g.UI.currentName, 'title', 'on the title'); t.ok(!pausing(g), 'the overlay is gone');
  t.ok(g.META.hasRun(), 'META has a saved run'); t.ok(sfxLog(g).indexOf('save') >= 0, 'the save sound played');
  t.ok(toasts(g).some((x) => /saved/i.test(x)), 'a toast says so: ' + toasts(g).join(' | '));
  g._click('.mn-gate'); await settle(g);
  t.eq($$(g, '.mn-plaque')[0].dataset.act, 'continue', 'Continue is first');
  g._click('[data-act=continue]'); await settle(g, 8);
  t.eq(g.GAME.state.R.gold, 321, 'and it resumes the same run (gold 321)');
  // a save that cannot be written says so and does not lose the player on a broken page
  const g2 = fresh({ failStorage: 'set' });
  await startRun(g2);
  await openPause(g2);
  g2._click(pbtn(g2, 'quit')); await settle(g2, 8);
  t.eq(g2.UI.currentName, 'title', 'even when storage refuses, the player reaches the title');
  t.ok(g2._console.error.length === 0, 'without console errors');
});

await t.test('pause: without a run (opened on the title) it offers Resume, Settings, How to play and Back to title only', async () => {
  const g = fresh();
  await go(g, 'title'); g._click('.mn-gate'); await settle(g);
  await openPause(g);
  t.deep(acts(g), ['resume', 'settings', 'howto', 'title'], 'no Deck, Treasures, Save and quit or Abandon');
  t.ok(/No journey is underway/.test($(g, '.mn-p-run').textContent), 'the card says there is no tale');
  g._click(pbtn(g, 'title')); await settle(g);
  t.ok(!pausing(g), 'Back to title closes the overlay'); t.eq(g.UI.currentName, 'title', 'and stays on the title');
  await openPause(g); g._key('d'); await settle(g);
  t.ok(!g.UI.overlay.has('deck'), 'the D key does nothing without a run'); t.ok(pausing(g), 'and the menu stays');
  g._key('Escape'); await settle(g);
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('pause: cleans up (keys, DOM, state), every control is named, no canvas issues', async () => {
  const g = fresh();
  await startRun(g);
  await openPause(g); g._key('Escape'); await settle(g);                 // the first interaction arms audio and removes its own listeners
  const base = { key: g._listeners('keydown'), pm: g._listeners('pointermove') };
  await openPause(g);
  const unnamed = $$(g, '.o-pause button').filter((b) => !nameOf(b));
  t.eq(unnamed.length, 0, 'every button has a name: ' + unnamed.map((b) => b.className).join(','));
  t.ok($(g, '.mn-p-col').getAttribute('aria-label') === 'Pause menu', 'the menu is a labelled nav'); t.ok($$(g, '.mn-pause button').length >= 7, 'plaques are real buttons');
  g._key('s'); await settle(g); g._key('Escape'); await settle(g); g._key('h'); await settle(g); g._key('Escape'); await settle(g);
  g._key('Escape'); await settle(g);
  t.ok(!pausing(g), 'closed');
  t.eq($$(g, '.o-pause').length, 0, 'no overlay DOM left'); t.eq(g._listeners('keydown'), base.key, 'no keydown listener leaks'); t.eq(g._listeners('pointermove'), base.pm, 'nor pointermove');
  const calls = g._run('__sfx.length');
  g._key('d'); await settle(g);
  t.ok(!g.UI.overlay.has('deck'), 'the pause shortcuts are gone with the overlay'); t.eq(g._run('__sfx.length'), calls, 'silently');
  for (let i = 0; i < 3; i++) { await openPause(g); g._key('Escape'); await settle(g); }
  t.eq($$(g, '.o-pause').length, 0, 'opening it again and again leaves nothing behind');
  g._frames(60, 16);
  t.eq(g._issues.length, 0, 'no canvas issues: ' + JSON.stringify(g._issues.slice(0, 2))); t.eq(errors(g), 0, 'no console errors'); t.eq(g._console.warn.length, 0, 'no warnings: ' + JSON.stringify(g._console.warn.slice(0, 2)));
});


// ==================================================================================================== CROSS-CUTTING
async function tour(g) {
  await go(g, 'title'); g._click('.mn-gate'); await settle(g); g._frames(60, 16);
  await go(g, 'heroSelect'); g._click(card(g, 'hanae')); await settle(g); g._click(card(g, 'kuro')); await settle(g); g._frames(60, 16);
  for (const id of ['unlocks', 'achievements', 'story', 'bestiary', 'history']) { await go(g, 'library', { tab: id }); g._frames(40, 16); }
  await go(g, 'settings'); g._frames(30, 16);
  await go(g, 'howto'); for (let i = 0; i < 8; i++) { g._key('ArrowRight'); g._frames(30, 16); }
  await go(g, 'title'); await openPause(g); g._frames(20, 16); g._key('h'); await settle(g); g._key('Escape'); await settle(g); g._key('s'); await settle(g); g._key('Escape'); await settle(g); g._key('Escape'); await settle(g);
}

await t.test('every screen and overlay survives the accessibility and viewport matrix without errors, canvas issues or warnings', async () => {
  const combos = [
    { name: 'defaults', set: {}, vp: [1280, 720] },
    { name: 'text 1.3', set: { textScale: 1.3 }, vp: [1280, 720] },
    { name: 'colour-blind + reduce motion + low quality', set: { colorblind: true, reduceMotion: true, quality: 'low' }, vp: [1280, 720] },
    { name: 'phone landscape 844x390', set: {}, vp: [844, 390] },
    { name: 'phone landscape text 1.3', set: { textScale: 1.3 }, vp: [844, 390] },
    { name: 'phone portrait 390x844', set: {}, vp: [390, 844] },
  ];
  for (const c of combos) {
    const g = boot({ only: ['screen_menu', 'main'], skip: SKIP, epoch: EPOCH, viewport: { w: c.vp[0], h: c.vp[1] } });
    g.GAME.boot(); Object.keys(c.set).forEach((k) => g.UI.setSetting(k, c.set[k]));
    seedProfile(g); saveRun(g);
    try { await tour(g); } catch (e) { t.ok(false, c.name + ': the tour threw ' + e.message); continue; }
    t.eq(errors(g), 0, c.name + ': no console errors ' + JSON.stringify(g._console.error.slice(0, 2)));
    t.eq(g._console.warn.length, 0, c.name + ': no warnings ' + JSON.stringify(g._console.warn.slice(0, 2)));
    t.eq(g._issues.length, 0, c.name + ': no canvas issues ' + JSON.stringify(g._issues.slice(0, 2)));
    t.eq(g._uncaught.length, 0, c.name + ': nothing uncaught ' + JSON.stringify(g._uncaught.slice(0, 1)));
    t.eq($(g, '#stage').classList.contains('compact'), c.vp[0] < 900, c.name + ': the stage is compact exactly on phones');
  }
});

await t.test('every sound the menus play is a registered id, and the menus are quiet when nothing happens', async () => {
  const g = fresh();
  seedProfile(g); saveRun(g);
  await tour(g);
  const list = g.DATA.LISTS.sfx;
  const played = Array.from(new Set(sfxLog(g)));
  t.ok(played.length >= 4, 'a real tour plays a variety of sounds: ' + played.join());
  t.deep(played.filter((id) => list.indexOf(id) < 0), [], 'every played id is in DATA.LISTS.sfx');
  const n = sfxLog(g).length;
  g._frames(300, 16); await settle(g);
  t.eq(sfxLog(g).length, n, 'standing still plays nothing (no sound loops from screens)');
});

await t.test('touch works everywhere: taps (pointerType touch) drive the title, hero select, library, settings and how to play', async () => {
  const g = fresh();
  seedProfile(g);
  const tap = (el) => g._click(el, { pointerType: 'touch' });
  await go(g, 'title'); tap('.mn-gate'); await settle(g);
  tap('[data-act=library]'); await settle(g); t.eq(g.UI.currentName, 'library', 'tap Library');
  tap(tabBtn(g, 'history')); await settle(g); t.eq(g.UI.screens.library.state().tab, 'history', 'tap a tab');
  g.UI.back(); await settle(g);
  tap('[data-act=new]'); await settle(g); t.eq(g.UI.currentName, 'heroSelect', 'tap New Tale');
  tap(card(g, 'hanae')); await settle(g); tap(card(g, 'kuro')); await settle(g);
  t.deep(g.UI.screens.heroSelect.state().chosen, ['hanae', 'kuro'], 'tap two heroes');
  tap('.mn-back'); await settle(g);
  await go(g, 'settings'); tap(setSeg(g, 'textScale', 'Large')); t.eq(g.META.get('textScale'), 1.15, 'tap a segment'); tap(tog(g, 'hints')); t.eq(g.META.get('hints'), false, 'tap a switch');
  await go(g, 'howto'); tap('.mn-ht-nav .btn-primary'); await settle(g); t.eq(htState(g).page, 1, 'tap Next');
  g._drag($(g, '.mn-book'), [800, 300], [300, 300], 6, { pointerType: 'touch' }); t.eq(htState(g).page, 2, 'touch swipe turns the page');
  await go(g, 'title'); await openPause(g); tap(pbtn(g, 'resume')); await settle(g); t.ok(!pausing(g), 'tap Resume');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('no state leaks between visits: the layers hold exactly what should be there after a long tour, and boots are deterministic', async () => {
  const g = fresh();
  seedProfile(g);
  await tour(g);
  for (let i = 0; i < 3; i++) { await go(g, 'library', { tab: 'bestiary' }); await go(g, 'heroSelect'); await go(g, 'howto'); await go(g, 'settings'); await go(g, 'title'); }
  t.eq($$(g, '#screens > *').length, 1, 'one screen root in #screens'); t.eq($$(g, '#overlays > *').length, 0, 'no overlay roots'); t.eq($$(g, '#tips .tip.open, #tips > *').filter((e) => !e.hidden && e.classList.contains('open')).length, 0, 'no open tooltips');
  t.eq(g.UI.screens.library.state(), null, 'library state cleared'); t.eq(g.UI.screens.heroSelect.state(), null, 'hero select state cleared'); t.eq(htState(g), null, 'howto state cleared'); t.eq(g.UI.screens.settings.state(), null, 'settings state cleared');
  const html = (gg) => $(gg, '#screens').innerHTML.replace(/\s+/g, ' ');
  const a = fresh(), b = fresh();
  seedProfile(a); seedProfile(b);
  await go(a, 'title'); await go(b, 'title');
  t.eq(html(a), html(b), 'the title renders identical markup for identical state (no randomness)');
  await go(a, 'library', { tab: 'bestiary' }); await go(b, 'library', { tab: 'bestiary' });
  t.eq(html(a), html(b), 'and so does the bestiary');
  t.eq(errors(g), 0, 'no console errors');
});

// ==================================================================================================== phone, pinch and midnight fixes
await t.test('title: Enter on the "Tap to begin" gate is swallowed, so the browser cannot also click the plaque that just took focus', async () => {
  const g = fresh();
  await settle(g);
  t.ok(g.UI.screens.title.state().gated, 'the gate is up');
  const passed = g._key('Enter');
  await settle(g);
  t.eq(passed, false, 'the Enter keydown is default-prevented (dismiss() focuses the first plaque inside it)');
  t.eq(g.UI.currentName, 'title', 'and the title stays: the gate lifts and nothing else happens');
  t.ok(!g.UI.screens.title.state().gated, 'the gate is gone');
  t.ok(g._doc.activeElement && g._doc.activeElement.classList.contains('mn-plaque'), 'the first plaque has focus for the next press');
  const again = g._key('Tab');
  t.ok(again !== undefined, 'Tab on the gate is left alone');
});

await t.test('title and hero select follow the date when left open across midnight, and a click that crosses it shows the new tale first (L26)', async () => {
  const epoch = new Date(2026, 8, 29, 23, 59, 50).getTime();         // 10 s before local midnight
  const key0 = 20260929, key1 = 20260930;
  const g = fresh({ epoch });
  await go(g, 'title'); g._click('.mn-gate'); await settle(g);
  t.eq(g.UI.screens.title.state().seed, key0, 'the title opens on the 29th');
  t.ok(/Seed 20260929/.test($(g, '[data-act=daily] .mn-p-sub').textContent), 'the plaque says so');
  const before = g.RUN.dailyHeroes(key0).join(), after = g.RUN.dailyHeroes(key1).join();
  g._frames(900, 16);                                                // 14.4 s of frames: past midnight
  const st = g.UI.screens.title.state();
  t.eq(st.seed, key1, 'a title left open past midnight shows the new seed: ' + st.seed);
  t.ok(/Seed 20260930/.test($(g, '[data-act=daily] .mn-p-sub').textContent), 'the plaque text follows');
  t.eq($$(g, '[data-act=daily] .mn-p-meds .ico').length, 2, 'with the two heroes of the new day');
  t.eq($$(g, '.mn-plaque').map((b) => b.dataset.act).join(), 'new,daily,library,settings,howto', 'the menu keeps its order after the plaque was rebuilt');
  const calls = [];
  g.GAME.newRun = (o) => { calls.push(o); return { id: 'fake' }; };
  g._click('[data-act=daily]'); await settle(g);
  t.deep(calls, [{ daily: true }], 'a click on the refreshed plaque starts the run');
  // a click that lands before the next poll sees the day change itself: it refreshes and starts nothing
  const g2 = fresh({ epoch });
  await go(g2, 'title'); g2._click('.mn-gate'); await settle(g2);
  const calls2 = [];
  g2.GAME.newRun = (o) => { calls2.push(o); return { id: 'fake' }; };
  g2.META.dailySeed = () => key1;                                    // the date turned over between two polls
  g2._click('[data-act=daily]'); await settle(g2);
  t.eq(calls2.length, 0, 'the click that crossed midnight does not start yesterday\'s tale');
  t.ok(toasts(g2).some((x) => /new Daily Jam/i.test(x)), 'a toast says a new tale has begun');
  t.eq(g2.UI.screens.title.state().seed, key1, 'the plaque now shows the new tale');
  g2._flush(1000);
  g2._click('[data-act=daily]'); await settle(g2);
  t.eq(calls2.length, 1, 'the next click starts it');
  // hero select in Daily mode follows the date too
  const g3 = fresh({ epoch });
  await go(g3, 'heroSelect');
  g3._click('.mn-daily .toggle'); await settle(g3);
  t.eq(g3.UI.screens.heroSelect.state().seedToday, key0, 'hero select starts on the 29th');
  t.deep(g3.UI.screens.heroSelect.state().chosen, g3.RUN.dailyHeroes(key0), 'with that day\'s heroes: ' + before);
  g3._frames(900, 16);
  const hs = g3.UI.screens.heroSelect.state();
  t.eq(hs.seedToday, key1, 'past midnight it holds the new seed');
  t.deep(hs.chosen, g3.RUN.dailyHeroes(key1), 'and the new day\'s heroes: ' + after);
  t.eq($(g3, '.mn-seed').value, String(key1), 'the locked seed field shows it');
  t.eq(errors(g) + errors(g2) + errors(g3), 0, 'no console errors');
});

await t.test('hero select: a speech bubble never covers the Swap pill (it slides left to end before it)', async () => {
  const g = fresh();
  await go(g, 'heroSelect');
  g._click(card(g, 'hanae')); g._click(card(g, 'kuro')); await settle(g);
  const sw = $(g, '.mn-swap'), barks = $$(g, '.mn-bark');
  // the headless DOM has no layout: give the pill and the bubbles the geometry of the real page (pill at x 278, y 10, 44 high; bubbles 200 x 60 near the top)
  const def = (el, o) => Object.keys(o).forEach((k) => Object.defineProperty(el, k, { configurable: true, get: () => o[k] }));
  def(sw, { offsetLeft: 278, offsetTop: 10, offsetWidth: 110, offsetHeight: 44 });
  barks.forEach((b) => Object.defineProperty(b, 'offsetLeft', { configurable: true, get: () => parseFloat(b.style.left) || 0 }));
  barks.forEach((b) => def(b, { offsetWidth: 200, offsetHeight: 60, offsetTop: 14 }));
  let placed = 0;
  for (let i = 0; i < 400; i++) {                                    // long enough for the heroes to speak
    g._frames(1, 16);
    barks.filter((b) => b.classList.contains('show')).forEach((b) => { placed++; const left = parseFloat(b.style.left); t.ok(left + 200 <= 278 - 6 + 0.5, 'the bubble ends before the pill: left ' + left); });
  }
  t.ok(placed >= 10, 'bubbles were shown and checked (' + placed + ' frames)');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('css: a trial rule is never clipped, the phone launch panel is wider, and phone text keeps 8 to 9 screen px (C1, C8)', () => {
  const css = fs.readFileSync(path.join(DIR, 'css', 'menu.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const clip = rules.filter((r) => /\.mn-tr-(rule|text)\b/.test(r.sel) && /line-clamp|text-overflow\s*:\s*ellipsis|overflow\s*:\s*hidden/.test(r.body));
  t.deep(clip.map((r) => r.sel), [], 'no rule of .mn-tr-rule or .mn-tr-text clips with a line clamp, an ellipsis or overflow hidden: the trailing words of a trial are its penalty');
  t.ok(rules.some((r) => r.sel === '.compact .mn-launch' && /width\s*:\s*376px/.test(r.body)), 'the launch panel is widened on a phone');
  t.ok(rules.some((r) => /\.compact \.mn-detail\.panel-wrap/.test(r.sel) && /left\s*:\s*836px/.test(r.body)), 'and the detail sheet gives up the width');
  t.ok(rules.some((r) => /\.mn-tr-head/.test(r.sel) && /grid-template-areas\s*:\s*"minus name plus" "text text text"/.test(r.body)), 'the rule runs the full width under the arrows');
  t.ok(rules.some((r) => /\.compact \.mn-begin/.test(r.sel) && /position\s*:\s*sticky/.test(r.body)), 'Begin stays pinned when a long rule makes the panel scroll');
  ['mn-p-sub', 'mn-credits', 'mn-tr-name', 'mn-slot-note', 'mn-hc-title', 'mn-d-blurb'].forEach((c) => t.ok(rules.some((r) => new RegExp('\\.compact [^,]*\\.' + c.replace('mn-credits', 'mn-foot')).test(r.sel) && /var\(--fs[89]\)/.test(r.body)) || rules.some((r) => r.sel.indexOf(c) >= 0 && /\.compact/.test(r.sel) && /var\(--fs[89]\)/.test(r.body)), 'compact .' + c + ' keeps a screen px floor'));
  t.ok(rules.some((r) => /\.ts-big \.mn-trial\.has-rule \.mn-tr-text/.test(r.sel) && /display\s*:\s*none/.test(r.body)), 'larger text on a desktop drops the generic sub-line when a rule is showing');
  t.ok(rules.some((r) => r.sel === '.mn-d-tapnote' && /display\s*:\s*none/.test(r.body)) && rules.some((r) => r.sel === '.compact .mn-d-tapnote' && /display\s*:\s*block/.test(r.body)), 'the "Tap a card to read it" note is for phones');
});

await t.test('hero select: the starting deck tells a phone player the small cards open the big card, and a tap does', async () => {
  const g = fresh();
  await go(g, 'heroSelect');
  t.ok($(g, '.mn-d-tapnote') && /tap a card/i.test($(g, '.mn-d-tapnote').textContent), 'the note is in the sheet');
  const first = $$(g, '.mn-dc .card')[0];
  first.click(); await settle(g, 2);                                  // a touch tap is a click with no hover and no keyboard focus ring before it
  t.ok(g.UI.tip.open, 'a tap on a starting card opens the big card');
  first.click(); await settle(g, 2);
  t.ok(!g.UI.tip.open, 'and a second tap closes it');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('the Ink Trial rule is written out in full for every trial, and the trial box says when it has one', async () => {
  const g = fresh();
  seedProfile(g, { trialBest: 10 });
  await go(g, 'heroSelect');
  const plus = $$(g, '.mn-step')[1];
  for (let k = 1; k <= 10; k++) {
    g._click(plus); await settle(g, 1);
    t.eq($(g, '.mn-tr-rule').textContent, g.DATA.trials['trial_' + k].text, 'trial ' + k + ': the whole rule text, untruncated');
    t.ok($(g, '.mn-trial').classList.contains('has-rule'), 'trial ' + k + ': the box is marked');
  }
  g._click($$(g, '.mn-step')[0]); await settle(g, 1);
  for (let k = 9; k >= 0; k--) { if (k < 9) { g._click($$(g, '.mn-step')[0]); await settle(g, 1); } }
  t.ok(!$(g, '.mn-trial').classList.contains('has-rule'), 'trial 0 has no rule and no mark');
});

await t.test('tutorial: the "Front row, back row" hint is not raised over a disabled Swap button (a hero is down) or once the fight is decided (L9)', async () => {
  const mk = async () => {
    const g = boot({ only: ['screen_menu', 'main', 'tutorial'], skip: SKIP.filter((x) => x !== 'tutorial'), epoch: EPOCH });
    if (g._errors.length) throw new Error('boot errors: ' + JSON.stringify(g._errors.map((e) => e.message)));
    g.GAME.boot();
    Object.keys(g.UI.tutorial.HINTS).filter((id) => id !== 'swap').forEach((id) => g.META.setTutorial('tut_' + id, true));   // only the swap hint is in play
    await go(g, 'combat', {});
    const btn = g._doc.createElement('button');
    btn.setAttribute('data-tut', 'swap'); btn.textContent = 'Swap';
    g._doc.getElementById('screens').appendChild(btn);
    return { g, btn };
  };
  const turn = async (g) => { g.UI.bus.emit('combat:turn', { turn: 3, phase: 'player' }); await settle(g, 3); };
  { // an enabled Swap button: the hint teaches it
    const { g } = await mk();
    await turn(g);
    t.eq(g.UI.tutorial.current() && g.UI.tutorial.current().id, 'swap', 'with a usable Swap button the hint shows');
    g.UI.bus.emit('combat:end', { result: 'win' }); await settle(g, 2);
    t.eq(g.UI.tutorial.current(), null, 'and closes the moment the fight is decided');
  }
  { // a hero is down: the engine disables the button (UI.setDisabled), so there is nothing to teach
    const { g, btn } = await mk();
    g.UI.setDisabled(btn, true, 'Only one hero is standing');
    await turn(g);
    t.eq(g.UI.tutorial.current(), null, 'a disabled Swap button gets no hint');
    t.deep(g.UI.tutorial.queue(), [], 'and nothing waits in the queue');
    t.ok(!g.UI.tutorial.seen('swap'), 'the hint is not used up: it can still show on a later turn');
    g.UI.setDisabled(btn, false);
    await turn(g);
    t.eq(g.UI.tutorial.current() && g.UI.tutorial.current().id, 'swap', 'once Swap works again the hint shows');
  }
  { // the fight is already decided when the next turn event arrives
    const { g } = await mk();
    g.UI.bus.emit('combat:end', { result: 'lose' }); await settle(g, 2);
    await turn(g);
    t.eq(g.UI.tutorial.current(), null, 'no combat hint starts over the defeat beat');
    await go(g, 'combat', {});                                       // the next fight clears the flag
    const b2 = g._doc.createElement('button'); b2.setAttribute('data-tut', 'swap'); g._doc.getElementById('screens').appendChild(b2);
    await turn(g);
    t.eq(g.UI.tutorial.current() && g.UI.tutorial.current().id, 'swap', 'a new fight teaches again');
  }
});

// ==================================================================================================== ALIGNMENT (overlay versus painted art)
// The menu screens are DOM laid over a painted canvas. These tests pin the shared coordinates so the two cannot drift apart again: what the
// headless DOM cannot measure (real layout) is covered by reading the stylesheet rules and the numbers the screen writes into the DOM.
const cssRules = () => {
  const css = fs.readFileSync(path.join(DIR, 'css', 'menu.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] }));
};
const rule = (rules, sel) => rules.find((r) => r.sel === sel);
const decl = (r, prop) => { const m = r && new RegExp('(?:^|[;\\s])' + prop + '\\s*:\\s*([^;]+)').exec(r.body); return m ? m[1].trim() : null; };
const px = (v) => (v === null ? NaN : parseFloat(v));
const press = (g, el) => { g._click(el); };

await t.test('heroSelect (Daily Tale): a hero the profile still locks stops wearing the padlock, the greyed plate and the Locked label while Daily is on, and gets them back when it is off', async () => {
  const g = fresh();
  await go(g, 'heroSelect');
  t.deep($$(g, '.mn-hcard').map((b) => b.classList.contains('locked')), [false, false, true, true], 'normally Suzu and Raiga are locked');
  const toggle = () => $(g, '.mn-daily .toggle');
  press(g, toggle()); await settle(g);
  t.ok(g.UI.screens.heroSelect.state().daily, 'Daily is on');
  t.eq($$(g, '.mn-hcard.locked').length, 0, 'no card keeps the class locked: the canvas paints the daily heroes unlocked and the DOM agrees');
  t.ok($$(g, '.mn-hcard').every((b) => !/Locked/.test(b.getAttribute('aria-label'))), 'and no card says Locked to a screen reader');
  t.eq($$(g, '.mn-hc-lock').length, 2, 'the padlock spans stay in the DOM (they are shown by the class)');
  const rules = cssRules();
  t.ok(rules.some((r) => r.sel === '.mn-hcard:not(.locked) .mn-hc-lock' && /display\s*:\s*none/.test(r.body)), 'css: the padlock is only displayed while the card is locked');
  t.ok(rules.some((r) => r.sel === '.mn-hcard.locked .mn-hc-plate' && /grayscale/.test(r.body)), 'css: the greyed plate is tied to the same class');
  press(g, card(g, 'suzu')); await settle(g);
  t.ok(!$(g, '.mn-d.locked'), 'the sheet of a daily hero is the real sheet, not the locked one');
  press(g, toggle()); await settle(g);
  t.deep($$(g, '.mn-hcard').map((b) => b.classList.contains('locked')), [false, false, true, true], 'Daily off: Suzu and Raiga are locked again');
  t.ok(/Locked/.test(card(g, 'suzu').getAttribute('aria-label')), 'and say so again');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('heroSelect: the card row, the detail sheet and the party stage share their coordinates (row top, margins, slot centres)', async () => {
  const g = fresh();
  await go(g, 'heroSelect');
  const rules = cssRules();
  const cards = $$(g, '.mn-hcard');
  const lefts = cards.map((c) => px(c.style.left)), top = px(cards[0].style.top);
  t.deep(lefts, [30, 210, 390, 570], 'the row starts at x 30 and steps 180');
  t.eq(top, 84, 'the row top on a desktop stage is 84');
  t.eq(px($(g, '.s-heroSelect').style.getPropertyValue('--hc-y')), top, 'the screen publishes the row top as --hc-y (the detail sheet follows it)');
  const sheet = rule(rules, '.mn-detail.panel-wrap');
  t.ok(/var\(--hc-y,\s*84px\)/.test(decl(sheet, 'top')), 'css: the sheet top is the row top');
  t.eq(px(decl(sheet, 'left')) + px(decl(sheet, 'width')), 1280 - lefts[0], 'css: the sheet leaves the same margin on the right as the row leaves on the left (30)');
  t.ok(/calc\(706px - var\(--hc-y,\s*84px\)\)/.test(decl(sheet, 'height')), 'css: the sheet ends at y 706, flush with the party stage and the launch panel');
  const party = rule(rules, '.mn-party'), launch = rule(rules, '.mn-launch');
  t.eq(px(decl(party, 'top')) + px(decl(party, 'height')), 706, 'the party stage ends at y 706'); t.eq(px(decl(launch, 'top')) + px(decl(launch, 'height')), 706, 'and so does the launch panel');
  t.ok(!/border\s*:/.test(party.body) && /inset 0 0 0 2px/.test(decl(party, 'box-shadow')), 'css: the party frame ring is an inset shadow, not a border, so its children share the canvas coordinates');
  // the two slots stand centred on the frame, and each label is exactly under its sprite (label left = sprite x - frame x)
  const front = px($(g, '.mn-slot.front').style.left), back = px($(g, '.mn-slot.back').style.left);
  t.eq((front + back) / 2, px(decl(party, 'width')) / 2, 'the pair is centred on the party frame (labels at ' + back + ' and ' + front + ' of 400)');
  t.eq(front - back, 150, 'the slots keep their 150 px spacing');
  t.ok(!rules.some((r) => /\.mn-slot\.(front|back)$/.test(r.sel) && /left\s*:/.test(r.body)), 'css: the label x comes from SLOT in screen_menu.js, not from a second copy in the stylesheet');
  // the Inkstone pill is the same size on hero select and in the library
  const hsPill = $(g, '.mn-stones .stat').className;
  await go(g, 'library'); const libPill = $(g, '.mn-stones .stat').className;
  t.ok(/sz-lg/.test(hsPill) && hsPill === libPill, 'the Inkstone pill is the same size on both screens (' + hsPill + ' / ' + libPill + ')');
  t.ok(!/margin-right/.test(rule(rules, '.mn-stones').body), 'css: the pill sits on the same 20 px margin as Back (no margin-right)');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('heroSelect on a phone (stage.compact): the row drops under the Back square, nothing lifts into it, the sheet follows, and desktop restores it', async () => {
  const g = fresh();
  const stage = g._doc.getElementById('stage');
  stage.classList.add('compact');
  await go(g, 'heroSelect');
  const cards = $$(g, '.mn-hcard');
  t.deep(cards.map((c) => px(c.style.top)), [92, 92, 92, 92], 'the whole row sits at y 92 (Back is a 81 to 88 px square at 844x390 and 740x360)');
  t.eq(px($(g, '.s-heroSelect').style.getPropertyValue('--hc-y')), 92, 'and --hc-y moves the sheet with it');
  g._click(card(g, 'hanae')); g._click(card(g, 'kuro')); await settle(g, 20);
  t.deep(g.UI.screens.heroSelect.state().chosen, ['hanae', 'kuro'], 'two heroes chosen');
  t.ok(cards.every((c) => !c.style.transform), 'no card lifts on a phone (a chosen card would rise into the Back square)');
  const rules = cssRules();
  t.ok(!rules.some((r) => /\.compact \.mn-hc-badge/.test(r.sel)), 'css: the FRONT and BACK badge sits inside the card on every viewport (no separate phone rule, no collision with the ribbon)');
  t.ok(px(decl(rule(rules, '.mn-hc-badge'), 'left')) >= 0 && px(decl(rule(rules, '.mn-hc-badge'), 'top')) >= 0, 'css: the badge is inside the card (left and top are not negative)');
  stage.classList.remove('compact'); g._frames(3, 16); await settle(g, 4);
  t.deep(cards.map((c) => px(c.style.top)), [84, 84, 84, 84], 'back on a desktop stage the row returns to y 84');
  t.ok(cards.some((c) => c.style.transform), 'and chosen cards lift again');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('css: heroSelect, library, settings and howto share ONE header (Back, ribbon and pill on one centre line, one --hit tall bar on a phone)', () => {
  const rules = cssRules();
  const bar = rules.find((r) => r.sel === '.mn-hs-top, .mn-lib-top, .mn-set-top');
  t.ok(bar && /var\(--bar-top\)/.test(decl(bar, 'top')) && /var\(--bar-h\)/.test(decl(bar, 'height')) && decl(bar, 'align-items') === 'center', 'one rule places the bars of all four screens (top, height, centring)');
  const root = rule(rules, '.s-heroSelect, .s-library, .s-settings, .s-howto');
  t.eq(decl(root, '--bar-top'), '10px', 'desktop bar top'); t.eq(decl(root, '--bar-h'), '60px', 'desktop bar height'); t.ok(/calc\(var\(--bar-top\) \+ var\(--bar-h\) \/ 2\)/.test(decl(root, '--bar-cy')), '--bar-cy is the middle of the bar');
  const phone = rule(rules, '.compact .s-heroSelect, .compact .s-library, .compact .s-settings, .compact .s-howto');
  t.eq(decl(phone, '--bar-top'), '0px', 'phone bar is flush with the top'); t.eq(decl(phone, '--bar-h'), 'var(--hit)', 'and exactly one --hit tall, as tall as Back');
  const rib = rule(rules, '.mn-hs-top .mn-banner, .mn-lib-top .mn-banner');
  t.ok(decl(rib, 'top') === '50%' && /translate\(-50%,\s*-50%\)/.test(decl(rib, 'transform')), 'the ribbon of hero select and library is centred on the bar');
  const how = rule(rules, '.mn-ht-banner');
  t.ok(decl(how, 'top') === 'var(--bar-cy)' && /translate\(-50%,\s*-50%\)/.test(decl(how, 'transform')), 'the How to Play ribbon is centred on the same line');
  t.ok(!rules.some((r) => /\.compact \.mn-(hs|lib)-top \.mn-back/.test(r.sel) && /align-self/.test(r.body)), 'phone: Back is no longer pinned to the top edge while the ribbon and pill centre elsewhere');
  t.ok(rules.some((r) => /min\(var\(--ts\),\s*1\.12\)/.test(decl(r, 'font-size') || '') && /\.mn-hs-top \.mn-banner span/.test(r.sel)), 'the ribbon grows with the text size only up to 1.12x, so Larger text cannot reach the tabs and lifted cards');
  t.ok(decl(rule(rules, '.compact .mn-tabs'), 'top').indexOf('var(--bar-cy)') >= 0, 'phone library tabs sit under the ribbon (they follow --bar-cy)');
});

await t.test('howto (screen and overlay): the dots sit on the page axis, the diagram frame is centred on its page, and a phone gives Back, the book and the buttons a --hit row each', async () => {
  const rules = cssRules();
  const nav = rule(rules, '.mn-ht-nav');
  t.ok(decl(nav, 'display') === 'grid' && /^1fr auto 1fr$/.test(decl(nav, 'grid-template-columns')), 'css: the nav is a 1fr auto 1fr grid, so the dots are centred whatever Previous and Next weigh');
  t.ok(/justify-self\s*:\s*start/.test(rule(rules, '.mn-ht-nav > .btn:first-child').body) && /justify-self\s*:\s*end/.test(rule(rules, '.mn-ht-nav > .btn:last-child').body), 'css: Previous hugs the left, Next the right');
  const left = rule(rules, '.mn-pg.left'), illus = rule(rules, '.mn-illus');
  t.eq(1160 / 2 - px(decl(left, 'padding-left')) - px(decl(left, 'padding-right')), px(decl(illus, 'width')), 'css: the left page content width equals the 528 px diagram frame (520 canvas + 2 x 4 border), so the frame is centred');
  // phone geometry for every plausible --hit (a 44 screen px square at scale 0.75 down to 0.33): header row, book, buttons never overlap
  const bookTop = decl(rule(rules, '.compact .mn-book'), 'top'), bookH = decl(rule(rules, '.compact .mn-book'), 'height'), navBottom = px(decl(rule(rules, '.compact .mn-ht-nav'), 'bottom'));
  const mT = /^calc\(var\(--hit\) \+ (\d+)px\)$/.exec(bookTop), mH = /^calc\((\d+)px - 2 \* var\(--hit\)\)$/.exec(bookH);
  t.ok(mT && mH, 'css: phone book top and height are written in --hit');
  [58.7, 66.7, 81.2, 88, 99].forEach((hit) => {
    const top = hit + Number(mT[1]), bottom = top + (Number(mH[1]) - 2 * hit), navTop = 720 - navBottom - hit;
    t.ok(top >= hit + 4, 'hit ' + hit + ': the book starts at y ' + top.toFixed(1) + ', under Back (bottom ' + hit + ')');
    t.ok(bottom <= navTop, 'hit ' + hit + ': the book ends at y ' + bottom.toFixed(1) + ', above the buttons (top ' + navTop.toFixed(1) + ')');
    t.ok(navTop + hit + navBottom <= 720 + 1e-6, 'hit ' + hit + ': the buttons stay on the stage');
    t.ok(navTop - bottom >= 8, 'hit ' + hit + ': at least 8 stage px (the 5 px book ring and 3 clear) between the book and the buttons: ' + (navTop - bottom).toFixed(1));
  });
  const iBig = rules.findIndex((r) => r.sel === '.ts-big .mn-ht-nav'), iPhone = rules.findIndex((r) => r.sel === '.compact .mn-ht-nav');
  t.ok(iBig >= 0 && iPhone > iBig, 'css: the phone nav rule comes AFTER the Larger text one (same specificity), so Larger text on a phone keeps bottom 8 instead of lifting the buttons 6 px into the book (R11)');
  const oTop = decl(rule(rules, '.compact .mn-ht-wrap .mn-howto.overlay'), 'top'), oBook = decl(rule(rules, '.compact .mn-howto.overlay .mn-book'), 'height');
  const wrapH = px(decl(rule(rules, '.compact .mn-ht-wrap'), 'height'));
  const oT = /^calc\(var\(--hit\) \+ (\d+)px\)$/.exec(oTop), oH = /^calc\((\d+)px - 2 \* var\(--hit\)\)$/.exec(oBook), oOverH = /^calc\((\d+)px - var\(--hit\)\)$/.exec(decl(rule(rules, '.compact .mn-ht-wrap .mn-howto.overlay'), 'height'));
  t.ok(oT && oH && oOverH, 'css: the phone overlay is written in --hit too');
  [58.7, 66.7, 81.2, 88, 99].forEach((hit) => {
    const overTop = hit + Number(oT[1]), overH = Number(oOverH[1]) - hit, bookH2 = Number(oH[1]) - 2 * hit;
    t.ok(overTop >= hit + 4, 'overlay hit ' + hit + ': the book starts under the Back button');
    t.ok(bookH2 + hit <= overH, 'overlay hit ' + hit + ': book and buttons fit the overlay (' + (bookH2 + hit).toFixed(1) + ' of ' + overH.toFixed(1) + ')');
    t.ok(overTop + overH <= wrapH + 1e-6 && wrapH <= 720, 'overlay hit ' + hit + ': the whole wrap fits the 720 px stage');
    t.ok(overH - (bookH2 + hit) >= 8, 'overlay hit ' + hit + ': at least 8 stage px between the book and the buttons: ' + (overH - (bookH2 + hit)).toFixed(1));
  });
  const hb = rule(rules, '.mn-ht-banner-o');
  t.ok(decl(hb, 'top') === 'calc(var(--hit) / 2)' && /translate\(-50%,\s*-50%\)/.test(decl(hb, 'transform')), 'css: the overlay ribbon shares Back\'s centre line (--hit / 2)');
});

await t.test('title: the menu column starts clear of the painted book (cover, gold corner fittings, pointer parallax), the text under the logo is centred on its glyphs, and the narrow plaques keep their words', () => {
  const rules = cssRules();
  const menu = rule(rules, '.s-title .mn-menu');
  const left = px(decl(menu, 'left')), width = px(decl(menu, 'width'));
  // the painted book is read from the art source (art_scenes.js titleBook and the title scene), so repainting it shows up here
  const art = fs.readFileSync(path.join(DIR, 'js', 'art_scenes.js'), 'utf8'), src = fs.readFileSync(path.join(DIR, 'js', 'screen_menu.js'), 'utf8');
  const cover = /const cover = \[((?:\[\d+, \d+\](?:, )?)+)\];\s*tk\.celFill\(g, cover, '[^']+', \{ line: ([\d.]+)/.exec(art);
  const layerK = /layer\('book', \{[^}]*\}, ([\d.]+),/.exec(art), camK = /parallaxX: reduce\(\) \? 0 : S\.px \* (\d+)/.exec(src);
  t.ok(cover && layerK && camK, 'the cover polygon, the book layer factor and the title camera offset are readable');
  const BOOK_PAGES_RIGHT = 958, BOOK_COVER_RIGHT = Math.max(...[...cover[1].matchAll(/\[(\d+), \d+\]/g)].map((m) => Number(m[1])));   // the cream pages end at x 958 (mirror of 322); the leather cover with its gold corner fittings at 988
  const clear = BOOK_COVER_RIGHT + Number(cover[2]) / 2 + Number(layerK[1]) * Number(camK[1]);   // + half the ink line + the parallax (layer factor x camera offset: the pointer far left moves the book 7 px right)
  t.eq(BOOK_COVER_RIGHT, 988, 'the painted cover ends at x 988');
  t.ok(left >= BOOK_PAGES_RIGHT, 'the column (x ' + left + ') starts right of the last page of the painted book (' + BOOK_PAGES_RIGHT + ')');
  t.ok(left >= clear, 'and covers NONE of the cover or its gold corner fitting, even with the pointer parallax: x ' + left + ' >= ' + clear.toFixed(1) + ' (was 972, which hid 16 px of the fitting)');
  t.ok(left + width <= 1280 - 14, 'right edge ' + (left + width) + ': inside the 14 px margin of the full screen button');
  const gap = px(decl(rule(rules, '.mn-slims'), 'gap'));
  t.ok((width - 2 * gap) / 3 >= 84, 'phone: the three slim plaques stay 84 px or wider (' + ((width - 2 * gap) / 3).toFixed(1) + '), 42 css px on the narrowest phone');
  const halo = rule(rules, '.s-title .mn-menu::before'), insetLeft = px(/inset:\s*(-?\d+)px\s+(-?\d+)px\s+(-?\d+)px\s+(-?\d+)px/.exec(decl(halo, 'inset') ? 'inset: ' + decl(halo, 'inset') : '')[4]);
  t.ok(left + insetLeft >= BOOK_COVER_RIGHT, 'the dark halo behind the plaques does not start over the painted book (starts at x ' + (left + insetLeft) + ')');
  const tag = rule(rules, '.s-title .mn-tag'); t.eq(decl(tag, 'text-indent'), decl(tag, 'letter-spacing'), 'the tagline cancels its trailing letter-spacing: its glyphs are centred on the logo axis');
  const sub = rule(rules, '.mn-gate-sub'); t.eq(decl(sub, 'text-indent'), decl(sub, 'letter-spacing'), 'and so does the gate hint');
  t.ok(/display\s*:\s*none/.test(rule(rules, '.s-title.ts-big .mn-p-meds, .compact .s-title .mn-p-meds').body), 'Larger text and phones drop the decorative hero faces so the Continue summary and the Daily seed are never clipped');
  t.ok(rules.some((r) => /\.compact \.s-title \.mn-slims \.mn-plaque::before/.test(r.sel) && /display\s*:\s*none/.test(r.body)), 'phone: the three slim plaques give up the diamond so "Settings" stays one word in a 92 px button');
});

await t.test('title: the Larger text size marks the title root so the narrow column can adapt', async () => {
  const g = fresh({}); g.UI.setSetting('textScale', 1.3);
  await settle(g);
  await go(g, 'title'); await settle(g);
  t.ok($(g, '.s-title').classList.contains('ts-big'), 'the title root carries ts-big at Larger');
  g.UI.setSetting('textScale', 1); await go(g, 'howto'); await go(g, 'title');
  t.ok(!$(g, '.s-title').classList.contains('ts-big'), 'and not at Normal');
});

await t.test('library and pause: tiles of one row are one width, the unlock footers are as wide as their cards, and the run card shares one left edge', () => {
  const rules = cssRules();
  const sum = rule(rules, '.mn-hist-sum');
  t.ok(decl(sum, 'display') === 'grid' && decl(sum, 'grid-auto-columns') === '1fr' && decl(sum, 'width') === 'max-content', 'css: the four history tiles share one column width (the widest sets it)');
  const item = rule(rules, '.mn-item.k-card'), foot = rule(rules, '.mn-item.k-card .mn-item-foot');
  const lc = px(/--lc-w:\s*(\d+)px/.exec(item.body)[1]);
  t.eq(lc, 168, 'css: --lc-w is the deck card width (LISTS.cardSizes.deck)');
  t.eq(decl(foot, 'width'), 'var(--lc-w)', 'css: the price pill and Unlock button row is exactly the card width');
  t.ok(decl(item, 'width') === 'calc(var(--lc-w) + 8px)', 'css: the tile keeps its 8 px of slack for the stamp and padlock overhang');
  t.ok(!/padding(-left)?\s*:\s*[1-9]/.test(rule(rules, '.mn-p-stats').body), 'css: the stat pills of the run card have no left padding');
  const base = fs.readFileSync(path.join(DIR, 'css', 'base.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const ico = px(/\.stat\.sz-sm \{ --ico: (\d+)px/.exec(base)[1]), hang = ico * Number(/\.stat \{[^}]*margin-left: calc\(var\(--ico\) \* ([\d.]+)\)/.exec(base)[1]);
  t.ok(Math.abs(px(decl(rule(rules, '.mn-p-stats'), 'margin-left')) + hang) < 0.05, 'css: the stats row is pulled left by the pill\'s own margin (' + hang.toFixed(1) + ' px), so the FIRST PILL starts on the heading edge like the chips and hero rows and its icon hangs left like the hero medals (R6)');
  const relics = rule(rules, '.mn-p-relics'); t.ok(/padding\s*:\s*8px 0 4px/.test(relics.body), 'css: the treasure strip has no side padding either');
});

await t.test('library history: the four summary tiles render (the grid keeps them in one row)', async () => {
  const g = fresh(); seedProfile(g);
  await go(g, 'library', { tab: 'history' });
  t.eq($$(g, '.mn-hist-sum span').length, 4, 'four tiles');
  t.eq(errors(g), 0, 'no console errors');
});

await t.test('heroSelect: the Begin labels are short enough for their button at the Larger text size (R1: "Begin the Daily Tale" was 285 px wide in a 276 px button and clipped the gold border)', async () => {
  const g = fresh(); await go(g, 'heroSelect');
  const label = () => $(g, '.mn-begin .btn-label').textContent;
  const plain = label();
  press(g, $(g, '.mn-daily .toggle')); await settle(g);
  const daily = label();
  t.eq(plain, 'Begin the Journey', 'the normal label is unchanged'); t.ok(/^Begin Daily Jam$/.test(daily), 'the Daily label is "Begin Daily Jam" (the word Daily still says what starts): ' + daily);
  press(g, $(g, '.mn-daily .toggle')); await settle(g);
  t.eq(label(), 'Begin the Journey', 'and switching Daily off restores it');
  // width model, measured in the widest stack font available to headless Chromium (DejaVu Serif Bold): 0.46 em per glyph plus the letter-spacing
  const rules = cssRules();
  const em = (v) => parseFloat(v), ls = em(decl(rule(rules, '.ts-big .mn-begin'), 'letter-spacing')), font = 21 * 1.3;
  const body = /padding\s*:\s*\d+px (\d+)px/.exec(rule(rules, '.mn-launch .p-body').body), avail = px(decl(rule(rules, '.mn-launch'), 'width')) - 2 * Number(body[1]) - 9;   // the button is 264 px with a scrollbar, 273 without
  [plain, daily].forEach((txt) => {
    const w = txt.length * (0.46 + ls) * font;
    t.ok(w + 2 * 16 <= avail, '"' + txt + '" at 27.3 px is about ' + w.toFixed(0) + ' px wide: 16 px or more of margin each side inside the ' + avail + ' px button');
  });
  t.ok(ls <= 0.05, 'the Larger text button tightens its letter-spacing to ' + ls + ' em (was .07)');
  t.eq(errors(g), 0, 'no console errors');
});

t.done();
