// Drop the Bass round 4, hub and meta side: Next steps card data, Welcome back, What's new, streak bonuses, practice mapping, shortcut list,
// language-aware page text. Pure functions with a fake clock; the browser side is tests/drop_the_bass_round4_browser.test.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../drop_the_bass/js/meta.js';
import { makeRng } from '../drop_the_bass/js/rng.js';
import { GAME, WORLDS, BOSS_IDS } from '../drop_the_bass/js/data_core.js';
import { STREAK_MILESTONES } from '../drop_the_bass/js/data_meta.js';
import { CHANGELOG } from '../drop_the_bass/js/data_changelog.js';
import { TABLES } from '../drop_the_bass/js/i18n_data.js';

const DASH = String.fromCharCode(8212), EN = String.fromCharCode(8211);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const HOUR = 3600000, DAYMS = 86400000;
const NOW = Date.UTC(2026, 10, 2, 12);
const fresh = () => { const p = M.newProfile(NOW); p.tutorial.done = true; return p; };
const rng = () => makeRng(7);
const src = (f) => fs.readFileSync(new URL('../drop_the_bass/' + f, import.meta.url), 'utf8');

// ---- Next steps
{
  const p = fresh();
  let st = M.nextStepsState(p);
  ok(st.total === 7 && st.done === 0 && st.visible && st.open && !st.dismissed, 'new profile: all seven steps open, card visible');
  ok(JSON.stringify(M.NEXT_STEP_IDS) === JSON.stringify(['preview', 'reroll', 'synergy', 'branch', 'hero', 'modifier', 'outfit']), 'step ids');
  ok(M.markStep(p, 'preview') === true && M.markStep(p, 'preview') === false, 'markStep reports a new tick once');
  ok(M.markStep(p, 'nope') === false, 'unknown id is ignored');
  ok(M.nextStepsState(p).done === 1, 'one tick');
  M.setNextStepsOpen(p, false); ok(M.nextStepsState(p).open === false, 'collapse');
  M.dismissNextSteps(p); ok(M.nextStepsState(p).visible === false, 'dismissed card is hidden');
  const q = fresh(); for (const id of M.NEXT_STEP_IDS) M.markStep(q, id);
  ok(M.nextStepsState(q).done === 7 && !M.nextStepsState(q).visible, 'hidden once everything is ticked');
  const t0 = M.newProfile(NOW); ok(!M.nextStepsState(t0).visible, 'hidden before the tutorial is done');
  // an old save: stats and hints prove some features
  const old = M.migrate({ records: 5, tutorial: { done: true, hints: { hint_synergy: true, hint_branch: true, hint_preview: true } }, stats: { heroUses: 4 }, outfits: { owned: { roxor: ['default', 'onesie'], jasmin: ['default'] }, worn: { roxor: 'onesie', jasmin: 'default' } } }, NOW);
  const d = old.nextSteps.done;
  ok(d.synergy && d.branch && d.hero && d.outfit, 'old save: synergy, branch, hero move and outfit are ticked from what it proves');
  ok(!d.preview && !d.reroll && !d.modifier, 'old save: a seen hint card alone does not prove the preview or the re-roll, nothing proves a modifier');
  const fresh2 = M.migrate({ records: 5, tutorial: { done: true } }, NOW); ok(M.nextStepsState(fresh2).done === 0, 'an old save with no proof starts with no ticks');
  const rt = M.parseSave(M.serialize(old), NOW); ok(rt.nextSteps.done.hero && rt.nextSteps.open === true, 'ticks survive save and load');
  const bad = M.migrate({ records: 1, nextSteps: { done: { hero: true, zzz: true }, dismissed: 'yes', open: 0 } }, NOW);
  ok(bad.nextSteps.done.hero && !bad.nextSteps.done.zzz && bad.nextSteps.dismissed === true && bad.nextSteps.open === false, 'damaged nextSteps is cleaned');
  // a run result with modifiers ticks the modifier step
  const r = fresh(); const res = { won: true, wave: 20, cleared: 20, kills: 10, leaks: 0, merges: 1, bossKills: 1, bestCombo: 3, coinsEarned: 5, deploys: 2, time: 90, stars: 3, world: 'garage', encore: 0, mode: 'story', heroUses: 0, modifiers: ['small_band'], endless: false };
  M.applyRunResult(r, res, rng(), NOW); ok(r.nextSteps.done.modifier, 'a run with a modifier ticks Try a modifier');
}

// ---- Streak bonuses
{
  ok(STREAK_MILESTONES.map((m) => m.days).join() === '7,14,30' && STREAK_MILESTONES[2].crate === 'studio', 'milestones 7, 14, 30; the 30 day one brings a Studio crate');
  const p = fresh(); let day = NOW; let seen = [];
  for (let i = 1; i <= 31; i++) {
    const before = p.diamonds, r = M.claimLogin(p, day, rng());
    ok(r.ok && r.streak === i, 'day ' + i + ' streak counts');
    for (const b of r.bonuses) seen.push(b.days);
    if (i === 7) ok(r.bonuses.length === 1 && r.bonuses[0].days === 7 && p.diamonds - before >= 30 + 20, 'day 7 pays the calendar reward plus the 7 day bonus');
    day += DAYMS;
  }
  ok(seen.join() === '7,14,30', 'each bonus is paid exactly once: ' + seen.join());
  ok(p.login.bonus[7] && p.login.bonus[14] && p.login.bonus[30], 'claimed flags');
  ok(M.nextStreakBonus(p, day) === null, 'nothing left to show after all three');
  // a streak that breaks and builds again never pays twice
  const q = fresh(); q.login.bonus[7] = true; q.login.streak = 6; q.login.lastDay = M.dayOf(NOW) - 1; q.login.claimedDay = M.dayOf(NOW) - 1;
  const r7 = M.claimLogin(q, NOW, rng()); ok(r7.ok && r7.streak === 7 && r7.bonuses.length === 0, 'a bonus already paid is not paid again');
  // preview
  const s = fresh(); const nb = M.nextStreakBonus(s, NOW);
  ok(nb && nb.days === 7 && nb.left === 6 && nb.reward.diamonds === 20 && !nb.ready, 'new player: next bonus is day 7, six days to go (today counts)');
  // migration: the existing streak counts as progress
  const old = M.migrate({ records: 5, login: { lastDay: M.dayOf(NOW) - 1, streak: 9, claimedDay: M.dayOf(NOW) - 1 }, tutorial: { done: true } }, NOW);
  ok(old.login.streak === 9 && Object.keys(old.login.bonus).length === 0, 'old save keeps its streak and has no bonus claimed');
  const nb2 = M.nextStreakBonus(old, NOW); ok(nb2.days === 7 && nb2.today, 'old save with 9 days: the 7 day bonus is due with today\'s claim');
  ok(M.streakBonusReady(old).length === 1, 'and it can also be claimed straight away');
  const got = M.claimStreakBonuses(old, rng()); ok(got.length === 1 && got[0].days === 7 && old.login.bonus[7], 'claimStreakBonuses pays it');
  ok(M.claimStreakBonuses(old, rng()).length === 0, 'once only');
  const rt = M.parseSave(M.serialize(old), NOW); ok(rt.login.bonus[7] && !rt.login.bonus[14], 'claimed flags survive save and load');
  const junk = M.migrate({ records: 1, login: { streak: 'x', bonus: { 7: true, 99: true } } }, NOW); ok(junk.login.streak === 0 && junk.login.bonus[7] && !junk.login.bonus[99], 'damaged login is cleaned');
}

// ---- Welcome back (fake clock)
{
  const p = fresh(); p.login = { lastDay: M.dayOf(NOW) - 1, streak: 4, claimedDay: M.dayOf(NOW) - 1, bonus: {} }; p.lastSeen = NOW - 30 * HOUR;
  ok(M.welcomeSummary(p, NOW, NOW - 11 * HOUR) === null, 'under 12 hours: no summary');
  const s = M.welcomeSummary(p, NOW, NOW - 13 * HOUR);
  ok(s && s.hours >= 12.9 && s.hours <= 13.1, '13 hours away: summary');
  ok(s.login.claimable && s.login.state === 'alive' && s.login.streak === 5, 'the streak is alive and today\'s claim makes it 5');
  ok(s.royalties > 0, 'royalties from lastSeen');
  const onlyLastSeen = M.welcomeSummary(p, NOW, null); ok(onlyLastSeen && onlyLastSeen.hours >= 29 && onlyLastSeen.royalties > 0, 'without awayFrom it uses lastSeen');
  ok(s.goal.id === 'stage' && typeof s.goal.stage === 'string', 'goal: the next stage to clear');
  ok(s.daily.done === false && s.weekly.done === false && s.weekly.msLeft > 0, 'daily and weekly status');
  const brk = fresh(); brk.login = { lastDay: M.dayOf(NOW) - 3, streak: 6, claimedDay: M.dayOf(NOW) - 3, bonus: {} };
  ok(M.welcomeSummary(brk, NOW, NOW - 72 * HOUR).login.state === 'broken', 'a missed day breaks the streak');
  const nw = fresh(); ok(M.welcomeSummary(nw, NOW, NOW - 20 * HOUR).login.state === 'new', 'no streak yet');
  const first = M.newProfile(NOW); ok(M.welcomeSummary(first, NOW + 40 * HOUR, NOW) === null, 'first launch (tutorial not done): no summary');
  const done = fresh(); for (const w of WORLDS) done.prog[w.id].cleared = true; done.daily.challengeDay = M.dayOf(NOW);
  ok(M.welcomeSummary(done, NOW, NOW - 20 * HOUR).goal.id === 'weekly', 'everything cleared and the daily done: next goal is the weekly');
  const wk = M.weeklyGig(done, NOW); done.weekly = { id: wk.id, done: true, best: 25 };
  ok(M.welcomeSummary(done, NOW, NOW - 20 * HOUR).goal.id === 'endless', 'then Endless');
  // a new profile stamps lastActive 0 and a later activity moves it
  ok(M.newProfile(NOW).lastActive === 0, 'lastActive starts at 0');
  ok(M.migrate({ records: 5 }, NOW).lastActive === 0 && M.migrate({ records: 5, lastActive: NOW }, NOW).lastActive === NOW, 'lastActive migrates');
}

// ---- What's new
{
  ok(typeof GAME.version === 'number' && CHANGELOG[0].version === GAME.version, 'the newest changelog entry is for GAME.version');
  ok(CHANGELOG[0].items.length >= 4 && CHANGELOG[0].items.length <= 6, 'latest entry has 4 to 6 lines');
  const all = CHANGELOG.flatMap((e) => [e.title, ...e.items]);
  ok(all.every((x) => typeof x === 'string' && x.length > 3 && !(x.includes(DASH) || x.includes(EN))), 'changelog text: strings, no em or en dash');
  const ids = CHANGELOG.map((e) => e.id); ok(new Set(ids).size === ids.length && ids.every((i) => /^v\d+$/.test(i)), 'unique ids');
  ok(CHANGELOG.every((e, i) => i === 0 || e.version < CHANGELOG[i - 1].version), 'newest first');
  const txt = (CHANGELOG.find((e) => e.id === 'v2')).items.join(' ').toLowerCase();
  for (const k of ['second tour', 'upgrade path', 'hero move', 'modifier', 'outfit', 'language', 'text']) ok(txt.includes(k), 'the v2 entry mentions ' + k);
  ok(TABLES.some((tb) => tb.name === 'CHANGELOG'), 'changelog is in the data overlay registry');
  const p = M.newProfile(NOW); p.tutorial.done = true;
  ok(!M.whatsNewDue(p), 'a new player starts up to date');
  const old = M.migrate({ records: 5, tutorial: { done: true } }, NOW); ok(old.whatsNewSeen === 0 && M.whatsNewDue(old), 'an old save sees the card once');
  M.markWhatsNewSeen(old); ok(!M.whatsNewDue(old) && old.whatsNewSeen === GAME.version, 'seen version is stored');
  ok(M.parseSave(M.serialize(old), NOW).whatsNewSeen === GAME.version, 'and survives save and load');
  const tut = M.migrate({ records: 5 }, NOW); ok(!M.whatsNewDue(tut), 'not shown before the tutorial is done');
}

// ---- Practice a boss: every boss has a stage that features it
{
  const main = src('js/main.js');
  ok(/export const practiceWorld = \(boss\) => WORLDS\.find\(\(w\) => w\.boss === boss\) \|\| WORLDS\.find\(\(w\) => w\.boss10 === boss\)/.test(main), 'practiceWorld picks the stage whose boss is the id, else boss10');
  for (const id of BOSS_IDS) ok(WORLDS.some((w) => w.boss === id || w.boss10 === id), 'a stage features boss ' + id);
  ok(!/sim\.js/.test('') && /class PracticeRun extends Run/.test(main), 'practice is built on a Run subclass in main.js');
  ok(/mode: 'practice'/.test(src('js/ui_hub.js')) && /showPracticeResults/.test(main), 'codex button and results hook');
}

// ---- Desktop shortcuts list matches the keys battle.js handles
{
  const ui = src('js/ui_run.js'), battle = src('js/battle.js');
  const keys = [...ui.matchAll(/t\('run\.keys\.\w+_k', '([^']+)'\)/g)].map((m) => m[1]);
  ok(keys.length === 10, 'ten shortcut rows');
  const handled = (k) => new RegExp("k === '" + k.toLowerCase() + "'|k === '" + k + "'").test(battle) || (k === 'Space / Enter' && /k === ' '/.test(battle)) || (k === 'Esc / P' && /'Escape'/.test(battle));
  for (const row of keys) for (const k of row.split(/\s*\/\s*/)) { const kk = k === 'Space' ? 'Space / Enter' : k === 'Enter' ? 'Space / Enter' : k === 'Esc' ? 'Esc / P' : k; ok(handled(kk) || handled(k), 'battle.js handles key ' + k); }
  ok(/hasFinePointer\(\) \? h\('div', \{ class: 'card shortcuts'/.test(ui), 'the section only renders with a fine pointer');
}

// ---- Language-aware page text
{
  const main = src('js/main.js'), html = src('index.html');
  ok(/document\.title = t\('page\.title'/.test(main) && /setAttribute\('aria-label', t\('page\.canvas_label'/.test(main), 'title and canvas label come from t()');
  ok(/I18N\.onLang\(\(\) => \{ applyPageText\(\);/.test(main), 'and follow a language change');
  for (const code of ['en', 'da', 'nl', 'de']) ok(new RegExp('\\b' + code + ': \\[').test(html), 'index.html boot messages in ' + code);
  ok(!html.includes(DASH), 'no em dash in index.html');
  ok(/drop_the_bass_lang/.test(html), 'boot messages read the stored language key');
}

for (const f of ['js/ui_hub.js', 'js/ui_run.js', 'js/main.js', 'js/meta.js', 'js/data_changelog.js', 'js/data_meta.js', 'index.html']) ok(!src(f).includes(DASH), 'no em dash in ' + f);
console.log('drop_the_bass round4 hub: ' + n + ' checks passed');
