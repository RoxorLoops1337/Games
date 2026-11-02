// Retention loops: mastery, collection book, lucky spin, weekly challenge, comeback gift, nudge, next reward.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const S = await import(join(root, 'sim.js'));
const day = 20400, DAY = 86400000;
const fresh = () => S.defaultSave();

// save is version safe
{
  const s = S.sanitizeSave({}); assert.ok(s.addict && s.addict.spin.prize === -1);
  const bad = S.sanitizeSave({ addict: { sp: { love: -5, zzz: 9 }, sk: { swab: 'x' }, claimed: { 'sp:love:0': 1, '<b>': 1 }, spin: { day: 5, prize: 99 }, week: { key: 3, prog: 4, claimed: 1 }, seen: 'no' } });
  assert.equal(bad.addict.sp.love, 0); assert.equal(bad.addict.sp.zzz, undefined); assert.equal(bad.addict.sk.swab, 0);
  assert.ok(bad.addict.claimed['sp:love:0'] && !bad.addict.claimed['<b>']);
  assert.equal(bad.addict.spin.prize, S.SPIN_PRIZES.length - 1); assert.equal(bad.addict.seen, 0);
  const round = S.sanitizeSave(JSON.parse(JSON.stringify(bad))); assert.deepEqual(round.addict, bad.addict);
  const old = fresh(); delete old.addict; assert.ok(S.sanitizeSave(old).addict);
}
// mastery counts kills per species and damage per skill, rewards claim once
{
  const s = fresh();
  S.recordAddictRun(s, day, { stage: 1, kills: 45, dmgBy: { swab: 6000, capsule: 999, ghost: 5 } });
  assert.equal(s.addict.sp.love, 45); assert.equal(s.addict.sk.swab, 60);
  S.recordAddictRun(s, day, { stage: 2, kills: 10, mode: 'pig', dmgBy: {} }); assert.equal(s.addict.sp.rust, 0);
  const m = S.masteryList(s).find(x => x.key === 'sp:love'); assert.equal(m.ready, 0); assert.equal(m.next.at, 150);
  const b = s.beats; assert.ok(S.claimMastery(s, 'sp:love', 0)); assert.equal(s.beats, b + 60);
  assert.ok(!S.claimMastery(s, 'sp:love', 0)); assert.ok(!S.claimMastery(s, 'sp:love', 1));
  assert.equal(S.claimAllMastery(s), 1);   // swab milestone 50
}
// lucky spin: once a day, same prize for the same date, always a valid prize
{
  const s = fresh(); assert.ok(S.spinReady(s, day));
  const r = S.doSpin(s, day); assert.ok(r && r.index === S.spinPrize(day)); assert.equal(S.doSpin(s, day), null);
  assert.ok(S.spinReady(s, day + 1));
  const seen = new Set(); for (let d = 0; d < 400; d++) { const i = S.spinPrize(d); assert.ok(i >= 0 && i < S.SPIN_PRIZES.length); seen.add(i); assert.equal(i, S.spinPrize(d)); }
  assert.equal(seen.size, S.SPIN_PRIZES.length);
  const t = fresh(), snap = x => JSON.stringify([x.beats, x.sparkles, x.eggs, x.energy.n, x.pets]), before = snap(t);
  S.doSpin(t, day); assert.notEqual(snap(t), before);
}
// weekly challenge: stable inside a week, progress resets on a new week, claims once
{
  const wk0 = day - ((day + 3) % 7); for (let d = 0; d < 7; d++) assert.deepEqual(S.weekChallenge(wk0 + d), S.weekChallenge(wk0));
  const s = fresh(), c = S.weekChallenge(day);
  for (let i = 0; i < 80 && !S.weekReady(s, day); i++) S.recordAddictRun(s, day, { stage: 1, kills: 100, bombs: 10, chests: 10, picks: 20, won: true, dmgBy: {} });
  assert.ok(S.weekReady(s, day), c.text);
  const sp = s.sparkles; assert.ok(S.claimWeek(s, day)); assert.equal(s.sparkles, sp + S.WEEK_REWARD.sparkles); assert.ok(!S.claimWeek(s, day));
  S.ensureWeek(s, day + 7); assert.equal(s.addict.week.prog, 0);
}
// comeback gift: only after a break, scales with time away, never lost
{
  const s = fresh(), t0 = 1.7e12;
  S.touchSeen(s, t0); assert.equal(S.comebackGift(s, t0 + 2 * DAY), null);
  S.touchSeen(s, t0 + 2 * DAY); assert.equal(s.addict.seen, t0 + 2 * DAY);
  const g3 = S.comebackGift(s, t0 + 6 * DAY), g8 = S.comebackGift(s, t0 + 11 * DAY), g20 = S.comebackGift(s, t0 + 40 * DAY);
  assert.ok(g3 && g8 && g20); assert.ok(g8.reward.beats > g3.reward.beats && g20.reward.eggs > g8.reward.eggs);
  S.touchSeen(s, t0 + 6 * DAY); assert.equal(s.addict.seen, t0 + 2 * DAY);   // a pending gift is not overwritten
  const e = s.energy.n; assert.ok(S.claimComeback(s, t0 + 6 * DAY)); assert.equal(s.energy.n, e + g3.reward.energy);
  assert.equal(S.claimComeback(s, t0 + 6 * DAY), null);
}
// collection book
{
  const s = fresh(); let b = S.bookStatus(s); assert.equal(b.got, 0); assert.ok(!b.cats.some(c => c.ready));
  s.cleared = 10; for (const p of S.PETS) s.pets[p.id].star = 1;
  b = S.bookStatus(s); assert.ok(b.cats.find(c => c.id === 'species').ready && b.cats.find(c => c.id === 'pets').ready);
  const eg = s.eggs; assert.ok(S.claimBook(s, 'pets')); assert.equal(s.eggs, eg + 2); assert.ok(!S.claimBook(s, 'pets')); assert.ok(!S.claimBook(s, 'keeps'));
  for (const k of S.KEEPSAKES) s.keeps[k.id].lv = 1;
  for (const o of S.OUTFITS) s.outfits.owned[o.id] = 1;
  assert.ok(S.bookStatus(s).all[1].ready); assert.ok(S.claimBook(s, 'all0') && S.claimBook(s, 'all1') && !S.claimBook(s, 'all1')); assert.ok(!S.claimBook(s, 'nope'));
}
// one more run nudge
{
  const s = fresh();
  const lost = p => ({ stage: 3, won: false, progress: p, stars: 0 });
  assert.match(S.nudgeFor(s, lost(0.47), 0), /cells? from the 50% chest/);
  assert.match(S.nudgeFor(s, lost(0.5), 60), /from a new best/);
  assert.match(S.nudgeFor(s, lost(0.8), 60), /New best/);
  assert.equal(S.nudgeFor(s, lost(0.1), 0), 'Next chest at 25%');
  assert.match(S.nudgeFor(s, { stage: 3, won: true, stars: 1 }, 0), /revive/);
  assert.match(S.nudgeFor(s, { stage: 3, won: true, stars: 2 }, 0), /face/);
  assert.equal(S.nudgeFor(s, { stage: 3, won: true, stars: 1, hard: true }, 0), null);
  assert.equal(S.nudgeFor(s, { stage: 3, won: false, mode: 'pig' }, 0), null);
}
// next reward bar: ready first, else the closest goal
{
  const s = fresh(); s.addict.spin.day = day; s.addict.week = { key: S.weekKey(day), prog: 0, claimed: 1 };
  const n = S.nextReward(s, day, 0); assert.ok(!n.ready && n.frac >= 0 && n.frac < 1 && n.label && n.text);
  s.addict.spin.day = 0; const r = S.nextReward(s, day, 0); assert.ok(r.ready && /Spin/.test(r.label));
  s.addict.spin.day = day; s.kills = 90; const k = S.nextReward(s, day, 0); assert.equal(k.label, 'Pop 100 cells');
}
console.log('16_addiction ok');
// ---- round 2: mastery rank, streak wheel, daily quests, season, achievements, comeback flow
{
  const s = fresh();
  let r = S.masteryRank(s, 'swab'); assert.equal(r.rank, 0); assert.equal(r.name, 'Rookie'); assert.equal(r.next, 50); assert.equal(r.frac, 0);
  s.addict.sk.swab = 25; r = S.masteryRank(s, 'swab'); assert.equal(r.frac, 0.5);
  s.addict.sk.swab = 400; r = S.masteryRank(s, 'swab'); assert.equal(r.rank, 2); assert.equal(r.name, 'Silver'); assert.equal(r.next, 2500);
  s.addict.sk.swab = 99999999; r = S.masteryRank(s, 'swab'); assert.equal(r.rank, r.max); assert.equal(r.next, null); assert.equal(r.frac, 1);
  assert.equal(S.masteryRank(s, 'nope').rank, 0);
}
{   // spin streak: consecutive days build looks, a gap resets, saved + sanitised
  const s = fresh();
  for (let d = 0; d < 7; d++) S.doSpin(s, day + d);
  assert.equal(s.addict.spin.n, 7); assert.equal(S.spinStreak(s, day + 6), 7); assert.equal(S.spinStreak(s, day + 7), 7); assert.equal(S.spinStreak(s, day + 8), 0);
  assert.equal(S.spinFrame(7).name, 'Silver wheel'); assert.equal(S.spinFrame(2).at, 0); assert.equal(S.spinFrame(99).next, 0); assert.equal(S.spinFrame(3).next, 7);
  S.doSpin(s, day + 9); assert.equal(s.addict.spin.n, 1);
  assert.equal(S.sanitizeSave(JSON.parse(JSON.stringify(s))).addict.spin.n, 1);
  assert.equal(S.sanitizeAddict({ spin: { day: 1, prize: 0, n: -4 } }).spin.n, 0);
}
{   // daily quests: deterministic, three distinct, rotate, chest after all three, nothing needs energy
  for (let d = 0; d < 200; d++) { const q = S.dailyQuests(day + d); assert.equal(q.length, 3); assert.equal(new Set(q.map(x => x.id)).size, 3); assert.deepEqual(q, S.dailyQuests(day + d)); }
  assert.ok(new Set(Array.from({ length: 30 }, (_x, d) => S.dailyQuests(day + d).map(x => x.id).join())).size > 8);
  const s = fresh(); let st = S.questState(s, day); assert.equal(st.doneCount, 0); assert.ok(!st.chestReady); assert.equal(S.claimQuestChest(s, day), null);
  const run = { stage: 1, kills: 200, runs: 1, bombs: 9, chests: 9, picks: 20, groove: 30, won: true, dmgBy: {} };
  S.recordAddictRun(s, day, run); st = S.questState(s, day);
  assert.equal(st.doneCount, 3); assert.ok(st.chestReady); assert.ok(st.quests.every(x => x.prog === x.target));
  const b = s.beats + s.sparkles + s.eggs * 100, rw = S.claimQuestChest(s, day); assert.ok(rw); assert.ok(s.beats + s.sparkles + s.eggs * 100 > b);
  assert.equal(S.claimQuestChest(s, day), null); assert.ok(S.questState(s, day).chestOpened);
  assert.equal(S.questState(s, day + 1).doneCount, 0);   // a new day starts fresh
  S.recordAddictRun(s, day + 1, { stage: 1, kills: 1, dmgBy: {} }); assert.ok(!S.questState(s, day + 1).chestOpened);
  const rt = S.sanitizeSave(JSON.parse(JSON.stringify(s))); assert.deepEqual(rt.addict.q, s.addict.q);
  const junk = S.sanitizeAddict({ q: { day: 'x', p: 'no', chest: 5 } }); assert.deepEqual(junk.q.p, [0, 0, 0]); assert.equal(junk.q.chest, 1);
}
{   // season: one stamp per day, milestones claim once, leftovers are paid when the season ends
  const s = fresh(), d0 = 30 * 700;   // first day of a season
  assert.equal(S.seasonStatus(s, d0).dayNo, 1); assert.equal(S.seasonStatus(s, d0 + 29).daysLeft, 0);
  for (let i = 0; i < 3; i++) S.recordAddictRun(s, d0 + i, { stage: 1, kills: 1, dmgBy: {} });
  S.recordAddictRun(s, d0 + 2, { stage: 1, kills: 1, dmgBy: {} });   // same day again: no second stamp
  let st = S.seasonStatus(s, d0 + 2); assert.equal(st.stamps, 3); assert.ok(st.stampedToday); assert.ok(st.miles[0].ready && !st.miles[1].ready);
  const b = s.beats; assert.ok(S.claimSeason(s, d0 + 2, 0)); assert.equal(s.beats, b + 150); assert.ok(!S.claimSeason(s, d0 + 2, 0)); assert.ok(!S.claimSeason(s, d0 + 2, 1)); assert.ok(!S.claimSeason(s, d0 + 2, 99));
  for (let i = 3; i < 7; i++) S.recordAddictRun(s, d0 + i, { stage: 1, kills: 1, dmgBy: {} });
  assert.ok(S.seasonStatus(s, d0 + 6).miles[1].ready);
  const eggs = s.eggs; S.ensureSeason(s, d0 + 30);   // the next season: the unclaimed 7 stamp egg is paid out, nothing is lost
  assert.equal(s.eggs, eggs + 1); assert.equal(s.addict.season.n, 0); assert.match(S.seasonStatus(s, d0 + 30).note, /Last season gifts: 1 Egg/);
  S.clearSeasonNote(s); assert.equal(S.seasonStatus(s, d0 + 30).note, '');
  const full = fresh(); for (let i = 0; i < 40; i++) { S.recordAddictRun(full, d0 + (i % 30), { stage: 1, kills: 1, dmgBy: {} }); } assert.ok(full.addict.season.n <= S.SEASON_DAYS);
  const rt = S.sanitizeSave(JSON.parse(JSON.stringify(s))); assert.deepEqual(rt.addict.season, s.addict.season);
  assert.deepEqual(S.sanitizeAddict({ season: { key: 3, n: 999, claimed: { 0: 1, 77: 1 }, note: '<b>x</b>' } }).season, { key: 3, n: 30, last: 0, claimed: { 0: 1 }, note: 'bxb' });
}
{   // achievements reuse trophies; the toast fires once, old saves do not spam
  const s = fresh(); assert.deepEqual(S.achievementCount(s), { got: 0, total: S.TROPHIES.length });
  assert.deepEqual(S.popAchievements(s), []); assert.equal(s.addict.annInit, 1);
  s.kills = 150; assert.equal(S.achievementCount(s).got, 1);
  const p = S.popAchievements(s); assert.equal(p.length, 1); assert.equal(p[0].id, 'k100'); assert.deepEqual(S.popAchievements(s), []);
  S.claimTrophy(s, 'k100'); assert.equal(S.achievementCount(s).got, 1);
  const old = fresh(); old.cleared = 40; old.kills = 9999; old.runs = 99; assert.deepEqual(S.popAchievements(old), []);   // first look: silent
  old.hardCleared = 5; old.hardCleared = Math.min(old.cleared, 5); assert.ok(S.popAchievements(old).some(t => t.id === 'h5'));
  const rt = S.sanitizeSave(JSON.parse(JSON.stringify(old))); assert.deepEqual(rt.addict.ann, old.addict.ann);
}
{   // comeback: warm lines, never lost, streak is kept warm
  const s = fresh(), t0 = 1.7e12, dk = Math.floor((t0 + 6 * DAY) / DAY);
  S.touchSeen(s, t0); assert.deepEqual(S.comebackLines(s, dk, t0 + DAY), []);
  const lines = S.comebackLines(s, dk, t0 + 6 * DAY); assert.ok(lines.length >= 3); assert.ok(lines.every(l => !l.includes(String.fromCharCode(8212))));
  assert.match(lines[lines.length - 1], /Nothing is lost/);
  s.streak = { last: 1, n: 1 }; S.claimComeback(s, t0 + 6 * DAY); assert.equal(s.streak.n, 2);
  assert.ok(S.nextReward(fresh(), day, 0));
}
console.log('16_addiction round 2 ok');


// batch 3: retention UI source stays wired (quest rows, season rail, ready banner, mastery order, toast reward)
{
  const { readFileSync } = await import('node:fs');
  const r = readFileSync(join(root, 'retain_ui.js'), 'utf8'), a = readFileSync(join(root, 'addict_ui.js'), 'utf8'), h = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(r.includes('qrow') && r.includes('qhero') && r.includes('searail') && r.includes('seastat'));
  assert.ok(a.includes('readybar') && a.includes('mfrac'));
  for (const c of ['.qrow', '.qhero', '.searail', '.readybar', '.tile.mast']) assert.ok(h.includes(c), 'css ' + c);
  assert.ok(!/—/.test(r + a), 'no em dash');
}
