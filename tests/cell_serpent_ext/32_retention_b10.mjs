// Round 10 retention: Streak Tokens, weekly badges, in-run next goal teaser, comeback polish.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const k = await import(join(root, 'keep10.js'));
const ch = await import(join(root, 'chase.js'));
const ND = String.fromCharCode(0x2014);
const DAY = 86400000;

// ---- save defaults and sanitize
assert.equal(sim.defaultSave().addict.tok, 0);
assert.deepEqual(sim.defaultSave().addict.wb, {});
const bad = sim.sanitizeSave({ addict: { tok: 99, wb: { cells: 'x', runs: 5, evil: 3, bombs: -2 } } }).addict;
assert.equal(bad.tok, sim.TOKEN_MAX); assert.equal(bad.wb.runs, 5); assert.equal(bad.wb.cells, undefined); assert.equal(bad.wb.evil, undefined);
assert.equal(sim.sanitizeSave({ addict: { tok: 'x' } }).addict.tok, 0);
assert.equal(sim.sanitizeSave({}).addict.tok, 0, 'old saves load with defaults');

// ---- Season milestones at 12 and 24 grant a Streak Token (capped)
const d0 = sim.seasonKey(30000) * sim.SEASON_DAYS + 5, s = sim.defaultSave();
sim.ensureSeason(s, d0); s.addict.season.n = 12;
assert.ok(sim.claimSeason(s, d0, 2)); assert.equal(s.addict.tok, 1);
assert.ok(sim.rewardText(sim.SEASON_MILES[2].reward).includes('Streak Token'));
s.addict.season.n = 24; assert.ok(sim.claimSeason(s, d0, 4)); assert.equal(s.addict.tok, 2);
assert.equal(sim.claimSeason(s, d0, 4), false, 'no double claim');
s.addict.tok = 3; sim.grantReward(s, { tok: 1 }); assert.equal(s.addict.tok, 3, 'cap');

// ---- a token forgives one missed day for the spin streak, shield goes first
const D = 20500;
const sp = sim.defaultSave();
sp.addict.spin = { day: D, prize: 0, n: 5, shield: 0 }; sp.addict.tok = 1;
assert.equal(sim.spinStreak(sp, D + 2), 5, 'streak shown alive with a token');
const r = sim.doSpin(sp, D + 2); assert.ok(r.saved && r.byToken); assert.equal(sp.addict.spin.n, 6); assert.equal(sp.addict.tok, 0);
const sp2 = sim.defaultSave(); sp2.addict.spin = { day: D, prize: 0, n: 5, shield: 1 }; sp2.addict.tok = 1;
const r2 = sim.doSpin(sp2, D + 2); assert.ok(r2.saved && !r2.byToken); assert.equal(sp2.addict.tok, 1, 'shield used first'); assert.equal(sp2.addict.spin.shield, 0);
const sp3 = sim.defaultSave(); sp3.addict.spin = { day: D, prize: 0, n: 5, shield: 0 };
assert.equal(sim.spinStreak(sp3, D + 2), 0); const r3 = sim.doSpin(sp3, D + 2); assert.ok(!r3.saved); assert.equal(sp3.addict.spin.n, 1, 'no token, fresh start');
const sp4 = sim.defaultSave(); sp4.addict.spin = { day: D, prize: 0, n: 5, shield: 0 }; sp4.addict.tok = 2;
sim.doSpin(sp4, D + 4); assert.equal(sp4.addict.tok, 2, 'two missed days: token kept, fresh start');

// ---- a token forgives one missed chest day
const finish = (save, day) => { save.addict.q = { day, p: sim.dailyQuests(day).map(q => q.target), chest: 0 }; return sim.claimQuestChest(save, day); };
const cq = sim.defaultSave();
finish(cq, D); finish(cq, D + 1); cq.addict.tok = 1;
assert.equal(ch.questStreak(cq, D + 3).n, 2, 'alive with a token');
finish(cq, D + 3); assert.equal(cq.addict.qs.n, 3); assert.equal(cq.addict.tok, 0);
const cq2 = sim.defaultSave(); finish(cq2, D); finish(cq2, D + 1); finish(cq2, D + 3); assert.equal(cq2.addict.qs.n, 1);

// ---- token row copy
assert.ok(k.tokenInfo(sp2).line.includes('Streak Token'));
assert.ok(k.tokenRowHTML(sp2).includes('tokrow'));
sp2.addict.spin.shield = 1; assert.equal(k.protectLine(sp2), null, 'shield row wins');
sp2.addict.spin.shield = 0; assert.ok(k.protectLine(sp2).includes('1 saved'));

// ---- weekly badges
const wk = sim.defaultSave(); const wday = 20300;
const claimWeekWith = (save, day) => { sim.ensureWeek(save, day); save.addict.week.prog = sim.weekChallenge(day).target; return sim.claimWeek(save, day); };
assert.ok(claimWeekWith(wk, wday));
const id1 = sim.weekChallenge(wday).id; assert.equal(wk.addict.wb[id1], 1);
assert.equal(k.weekBadges(wk).got, 1);
assert.ok(k.weekBadgesHTML(wk, id1).includes('wbd got'));
let bonusPaid = 0;
for (const d of sim.WEEK_DEFS) { const before = wk.sparkles; const paid = sim.collectWeekBadge(wk, d.id); if (paid) { bonusPaid++; assert.ok(wk.sparkles - before >= sim.WEEK_ALL_BONUS.sparkles); } }
assert.equal(bonusPaid, 1, 'all-six bonus once'); assert.equal(sim.collectWeekBadge(wk, 'cells'), false); assert.ok(k.weekBadges(wk).all && k.weekBadges(wk).bonusTaken);
assert.equal(sim.sanitizeSave(JSON.parse(JSON.stringify(wk))).addict.claimed['wb:all'], 1);
const wk2 = sim.defaultSave(); claimWeekWith(wk2, wday); assert.equal(sim.claimWeek(wk2, wday), false, 'one claim per week');
assert.equal(wk2.addict.wb[id1], 1);
for (const key of Object.keys(k.WEEK_BADGES)) assert.ok(sim.WEEK_DEFS.some(d => d.id === key));
assert.equal(Object.keys(k.WEEK_BADGES).length, sim.WEEK_DEFS.length);

// ---- in-run teaser
const tz = sim.defaultSave(); const td = 20400;
let t = k.nextGoalTeaser(tz, td); assert.equal(t.kind, 'stamp', 'fresh day: the stamp');
const qd = sim.dailyQuests(td), big = qd.findIndex(q => q.target === Math.max(...qd.map(x => x.target)));
tz.addict.q = { day: td, p: qd.map((q, i) => i === big ? q.target - 1 : 0), chest: 0 };
t = k.nextGoalTeaser(tz, td); assert.equal(t.kind, 'quest'); assert.ok(/^\d+ more: /.test(t.text));
sim.stampSeason(tz, td); tz.addict.q.p = [0, 0, 0];
t = k.nextGoalTeaser(tz, td); assert.ok(t === null || t.kind === 'quest' || t.kind === 'week');
tz.addict.q.p = sim.dailyQuests(td).map(q => q.target); tz.addict.q.chest = 1; sim.ensureWeek(tz, td).claimed = 1;
assert.equal(k.nextGoalTeaser(tz, td), null, 'nothing left: no teaser');
assert.equal(k.teaseGoal(tz, td, true), null, 'no DOM in headless, no crash');

// ---- comeback polish
const cb = sim.defaultSave(); const t0 = 1.7e12; sim.touchSeen(cb, t0);
const g3 = sim.comebackGift(cb, t0 + 4 * DAY), g8 = sim.comebackGift(cb, t0 + 9 * DAY);
assert.ok(!g3.reward.tok && g8.reward.tok === 1, 'a week away brings a Streak Token');
assert.ok(sim.rewardText(g8.reward).includes('Streak Token'));
sim.claimComeback(cb, t0 + 9 * DAY); assert.equal(cb.addict.tok, 1);
assert.equal(k.awayText(3), '3 days'); assert.equal(k.awayText(8), 'about a week'); assert.equal(k.awayText(20), 'a couple of weeks');
cb.addict.spin.n = 3; assert.ok(k.comebackExtra(cb, g8).some(x => x.includes('Streak Token')));

// ---- wiring and copy
for (const f of ['keep10.js', 'addict_ui.js', 'retain_ui.js', 'chase.js']) assert.ok(!readFileSync(join(root, f), 'utf8').includes(ND), f + ' has no em dash');
assert.ok(readFileSync(join(root, 'main.js'), 'utf8').includes('teaseGoal(save'), 'run start shows the teaser');
const html = readFileSync(join(root, 'index.html'), 'utf8');
assert.ok(html.includes('@css:16-addiction round 10') && html.includes('#goalTease'));
