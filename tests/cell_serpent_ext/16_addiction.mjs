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
