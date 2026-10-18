// Town and offline: build rules, adjacency, production vs the economy model, collect loop, banking, visitors,
// quests, achievements, collection, offline cap, crate keys and pity credit, clock safety, no negative currency.
import assert from 'node:assert/strict';
import { makeRng } from '../midnight_mog/js/rng.js';
import { newProfile } from '../midnight_mog/js/sim/profile.js';
import * as T from '../midnight_mog/js/sim/town.js';
import * as O from '../midnight_mog/js/sim/offline.js';
import * as E from '../midnight_mog/js/sim/economy.js';
import { openCrate, oddsTable, pityCounters, townPityCredit } from '../midnight_mog/js/sim/loot.js';
import { BUILDING_BY_ID, adjacency, outputPerSecond, statsAt, plotUnlock, upgradeCost, buildCost, START_PLOTS, CHECKIN, streakBonus } from '../midnight_mog/js/data/buildings.js';
import { achievementTarget, ACHIEVEMENT_FAMILIES } from '../midnight_mog/js/data/quests.js';

const H = 3600 * 1000;
const em = String.fromCharCode(0x2014);
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-9, `${msg || ''} ${a} vs ${b}`);

/** A late game profile: all buildings unlocked by stage, lots of money, a given plot layout. */
function rich(layout, seed = 11) {
  const p = newProfile(seed, 0);
  p.cur = { fish: 1e12, yarn: 1e9, gems: 1000, tokens: 0 };
  p.progress = { district: 1, stage: 1, best: { 3: 30, 4: 30 } };   // global stage 120
  const plots = layout.map((x) => (x ? { b: x[0], level: x[1], t: 0, ...(x[2] || {}) } : {}));
  p.town = { ...p.town, plots };
  return p;
}
const anyNeg = (p) => Object.values(p.cur).some((v) => !(v >= 0) || !Number.isFinite(v));

// ------------------------------------------------------------------ economy exception: only producers produce
{
  assert.deepEqual(E.selfCheck(), []);
  assert.equal(E.buildingKind('shrine_nine_lives'), null);
  assert.equal(E.buildingKind('observatory'), null);
  assert.equal(E.buildingKind('yarn_mill'), 'yarn');
  assert.equal(E.buildingKind('smokehouse'), 'fish');
  assert.equal(E.buildingKind('fish_stand'), 'fish');        // legacy ids keep the model working
  assert.equal(E.buildingOutput('observatory', 10), 0);
  const p = rich([['shrine_nine_lives', 5], ['observatory', 5], ['nap_dome', 5], null]);
  assert.deepEqual(E.townOutput(p), { fish: 0, yarn: 0 });
  assert.equal(T.production(p).fish, 0);
}

// ------------------------------------------------------------------ production for 1 hour matches the economy model
{
  const p = rich([['tuna_cannery', 12], ['yarn_mill', 9], ['scratching_post', 4], ['gem_mine', 6]]);
  const town = { ...p.town, streak: { days: 0, last: 100 } };    // same day, no streak bonus
  const q = { ...p, town };
  const prod = T.production(q);
  const eco = E.townOutput(q);
  near(prod.fish, eco.fish, 1e-12, 'fish/s');
  near(prod.yarn, eco.yarn, 1e-12, 'yarn/s');
  const r = T.collect(q, 1 * H, 100);
  assert.ok(r.ok);
  const m = E.multipliers(q).income;
  near(r.gained.fish, eco.fish * 3600 * m, 0.01, '1h fish');
  near(r.gained.yarn, eco.yarn * 3600 * m, 0.01, '1h yarn');
  near(r.gained.fish, E.income(q).passive.fish * 3600, 0.01, 'vs income().passive');
  assert.equal(r.tip.fish, 0, 'no tip on a non fresh day');
  // gem mine: gems per hour, unmultiplied, remainder kept
  const gm = outputPerSecond(BUILDING_BY_ID.gem_mine, 6, adjacency(q.town.plots, 3).potency).gems * 3600;
  assert.ok(r.gained.gems === Math.floor(gm), 'gems ' + r.gained.gems + ' vs ' + gm);
  // second collect in the same tick pays nothing
  const r2 = T.collect(r.profile, 1 * H, 100);
  assert.equal(r2.gained.fish, 0); assert.equal(r2.gained.yarn, 0); assert.equal(r2.gained.xp, 0);
  assert.equal(r2.profile.cur.fish, r.profile.cur.fish);
  // input never mutated
  assert.equal(q.town.plots[0].t, 0);
  assert.equal(q.cur.fish, 1e12);
  // production grows with level, and the clock tower multiplies everything
  const withClock = rich([['tuna_cannery', 12], ['clock_tower', 20], null, null]);
  near(T.production(withClock).fish, E.townOutput(withClock).fish, 1e-12);
  assert.ok(T.production(withClock).clock > 1.05);
  assert.ok(T.production(withClock).fish > outputPerSecond(BUILDING_BY_ID.tuna_cannery, 12, 1).fish * 1.05);
}

// ------------------------------------------------------------------ storage cap and the full bowl bonus
{
  const p = rich([['tuna_cannery', 10], null, null, null]);
  p.town.streak = { days: 0, last: 5 };
  const cap = E.townStorageSeconds(p);
  assert.equal(cap, 4 * 3600);
  const rate = T.production(p).fish;
  const m = E.multipliers(p).income;
  const r10 = T.collect(p, 10 * H, 5);
  near(r10.gained.fish, rate * cap * 1.1 * m, 0.001, '10h pays the 4h cap with the full bowl bonus');
  assert.ok(r10.plots[0].full);
  const r2 = T.collect(p, 2 * H, 5);                    // 50% full: no bonus
  near(r2.gained.fish, rate * 2 * 3600 * m, 0.001);
  const r36 = T.collect(p, 3.6 * H + 1, 5);              // 90% full: bonus
  near(r36.gained.fish, rate * 3.6 * 3600 * 1.1 * m, 0.001);
  // kitty bank adds storage
  const b = rich([['tuna_cannery', 10], ['kitty_bank', 10], null, null]);
  b.town.streak = { days: 0, last: 5 };
  assert.ok(T.collect(b, 40 * H, 5).gained.fish > T.collect(p, 40 * H, 5).gained.fish);
}

// ------------------------------------------------------------------ adjacency math
{
  // plot order: 0 centre, 1 up, 2 left, 3 right. Cannery in the centre with a smokehouse above: +0.15 ("Smoke and tin").
  const p = rich([['tuna_cannery', 10], ['smokehouse', 1], null, null]);
  const adj = adjacency(p.town.plots, 0);
  near(adj.potency, 1.15, 1e-12);
  const base = outputPerSecond(BUILDING_BY_ID.tuna_cannery, 10, 1).fish;
  const pr = T.production(p);
  const smoke = outputPerSecond(BUILDING_BY_ID.smokehouse, 1, adjacency(p.town.plots, 1).potency).fish;
  near(pr.fish, base * 1.15 + smoke, 1e-9);
  near(T.plotInfo(p, 0).potency, 1.15, 1e-12);
  // a noisy neighbour hurts a quiet building: nap dome centre with a cannery (noisy) above: -0.12 plus 0.06 per empty owned side
  const q = rich([['nap_dome', 3], ['tuna_cannery', 1], null, null]);
  near(adjacency(q.town.plots, 0).potency, 1 - 0.12 + 0.06 * 2, 1e-12);
  // swapping re-banks and changes potency, without minting output
  const base2 = rich([['tuna_cannery', 10], ['smokehouse', 1], null, null]);
  const sw = T.swap(base2, 1, 3, 0);
  assert.ok(sw.ok);
  assert.equal(sw.profile.town.plots[1].b, undefined);
  assert.equal(sw.profile.town.plots[3].b, 'smokehouse');
  near(adjacency(sw.profile.town.plots, 0).potency, 1.15, 1e-12);   // right is also orthogonal
  const far = T.swap(rich([['tuna_cannery', 10], null, null, null]), 0, 3, 0);
  assert.equal(far.profile.town.plots[3].b, 'tuna_cannery');
  assert.ok(!T.swap(base2, 0, 0, 0).ok);
  // observatory wants open sky
  const o = rich([['observatory', 1], null, null, null]);
  assert.ok(adjacency(o.town.plots, 0).potency >= 1);
  // townStats sums stats with potency
  assert.ok(T.townStats(rich([['nap_dome', 8], null, null, null])).offlineCapHours > 0);
}

// ------------------------------------------------------------------ build, upgrade, plot unlock, rules
{
  let p = newProfile(3, 0);
  p.cur.fish = 1e6; p.cur.gems = 500;
  assert.equal(p.town.plots.length, START_PLOTS);
  assert.equal(T.canBuild(p, 'nope', 1).reason, 'unknown_building');
  assert.equal(T.canBuild(p, 'tuna_cannery', 99).reason, 'bad_plot');
  assert.equal(T.canBuild(p, 'tuna_cannery', 0).reason, 'occupied');
  assert.equal(T.canBuild(p, 'shrine_nine_lives', 1).reason, 'locked');          // stage 30 needed
  assert.equal(T.canBuild(p, 'yarn_mill', 1).reason, 'locked');                   // stage 3 needed
  p.progress.best = { 1: 30, 2: 30, 3: 30 };
  const ok = T.canBuild(p, 'yarn_mill', 1);
  assert.ok(ok.ok); assert.equal(ok.cost.fish, buildCost(BUILDING_BY_ID.yarn_mill, E.cost).fish);
  const b1 = T.build(p, 'yarn_mill', 1, 1000);
  assert.ok(b1.ok);
  assert.equal(b1.profile.town.plots[1].b, 'yarn_mill');
  assert.equal(b1.profile.town.plots[1].t, 1000);
  assert.equal(b1.profile.cur.fish, p.cur.fish - ok.cost.fish);
  assert.equal(p.town.plots[1].b, undefined, 'input untouched');
  // limit
  let q = p;
  for (let i = 0; i < 3; i++) q = T.build(q, 'crate_workshop', 1 + i, 0).profile;
  assert.equal(q.town.plots.filter((x) => x.b === 'crate_workshop').length, 1);
  assert.equal(T.canBuild(q, 'crate_workshop', 3).reason, 'limit');
  // gems for the shrine and observatory
  const g = rich([null, null, null, null]);
  g.cur.gems = 99;
  assert.equal(T.canBuild(g, 'shrine_nine_lives', 1).reason, 'need_gems');
  g.cur.gems = 100;
  const sh = T.build(g, 'shrine_nine_lives', 1, 0);
  assert.ok(sh.ok); assert.equal(sh.profile.cur.gems, 0);
  // garden option
  const ga = T.build(rich([null, null, null, null]), 'catnip_garden', 0, 0, { district: 'sewer_sprawl', strain: 'hp' });
  assert.ok(ga.ok); assert.deepEqual(ga.profile.town.plots[0].opt, { district: 'sewer_sprawl', strain: 'hp' });
  assert.equal(T.build(rich([null, null, null, null]), 'catnip_garden', 0, 0, { district: 'x', strain: 'hp' }).reason, 'bad_option');
  assert.ok(T.build(rich([null, null, null, null]), 'catnip_garden', 0, 0).profile.town.plots[0].opt);
  // upgrade
  const u0 = rich([['tuna_cannery', 1], null, null, null]);
  const u1 = T.upgrade(u0, 0, 0);
  assert.ok(u1.ok); assert.equal(u1.profile.town.plots[0].level, 2);
  assert.equal(u1.cost, upgradeCost(BUILDING_BY_ID.tuna_cannery, 1, E.cost));
  assert.equal(u1.profile.stats.upgrades, 1);
  const u5 = T.upgrade(u0, 0, 0, 5);
  assert.equal(u5.profile.town.plots[0].level, 6); assert.equal(u5.levels, 5);
  const poor = rich([['tuna_cannery', 30], null, null, null]); poor.cur.fish = 10;
  const pu = T.upgrade(poor, 0, 0);
  assert.ok(!pu.ok); assert.equal(pu.reason, 'need_fish'); assert.equal(pu.profile, poor);
  assert.equal(T.upgrade(u0, 2, 0).reason, 'empty');
  const half = rich([['tuna_cannery', 20], null, null, null]); half.cur.fish = 30000;
  const hm = T.upgrade(half, 0, 0, 1000);
  assert.ok(hm.levels > 0 && hm.profile.cur.fish >= 0 && hm.profile.cur.fish < 30000);
  // endless: beyond economy's last level the upgrade still prices and works
  const late = rich([['tuna_cannery', 85], null, null, null]); late.cur.fish = 1e15;
  assert.ok(T.upgrade(late, 0, 0).ok);
  // plot unlock
  const pl = rich([['tuna_cannery', 1], null, null, null]);
  const info = T.plotUnlockInfo(pl);
  assert.equal(info.fish, plotUnlock(0, E.cost).fish); assert.equal(info.plotIndex, START_PLOTS);
  const un = T.unlockPlot(pl, 0);
  assert.ok(un.ok); assert.equal(un.profile.town.plots.length, START_PLOTS + 1);
  assert.equal(un.profile.cur.fish, pl.cur.fish - info.fish);
  const young = newProfile(1, 0); young.cur.fish = 1e9;
  assert.equal(T.unlockPlot(young, 0).reason, 'locked');
  const broke = rich([['tuna_cannery', 1], null, null, null]); broke.cur.fish = 5;
  assert.equal(T.unlockPlot(broke, 0).reason, 'need_fish');
  // bad time
  assert.equal(T.build(p, 'yarn_mill', 1, NaN).reason, 'bad_time');
}

// ------------------------------------------------------------------ banking: re-arranging mints nothing and loses nothing
{
  const p = rich([['tuna_cannery', 5], null, null, null]);
  p.town.streak = { days: 0, last: 5 };
  const rate1 = T.production(p).fish;
  const up = T.upgrade(p, 0, 1 * H);                   // one hour at level 5, then level 6
  const rate2 = T.production(up.profile).fish;
  assert.ok(rate2 > rate1);
  const r = T.collect(up.profile, 2 * H, 5);
  const m = E.multipliers(up.profile).income;
  near(r.gained.fish, (rate1 * 3600 + rate2 * 3600) * m, 0.001, 'banked hour + new hour');
  // building a neighbour (potency change) banks the old rate
  const bn = T.build(p, 'smokehouse', 1, 1 * H);
  assert.ok(bn.ok);
  const rr = T.collect(bn.profile, 2 * H, 5);
  const m2 = E.multipliers(bn.profile).income;
  const smokeRate = T.production(bn.profile).perPlot.find((x) => x.b === 'smokehouse').rate;
  const canneryNew = T.production(bn.profile).perPlot.find((x) => x.b === 'tuna_cannery').rate;
  near(rr.gained.fish, (rate1 * 3600 + canneryNew * 3600 + smokeRate * 3600) * m2, 0.001);
}

// ------------------------------------------------------------------ check-in: streak, daily tip, grace, visitors
{
  const p = rich([['tuna_cannery', 10], null, null, null]);
  const r1 = T.collect(p, 1 * H, 20);
  assert.equal(r1.streak.days, 1); assert.ok(r1.streak.fresh);
  assert.ok(r1.tip.fish > 0, 'daily tip');
  const rate = T.production(p).fish, m = E.multipliers(p).income;
  near(r1.tip.fish, rate * 20 * 60 * (1 + streakBonus(1)) * m, 0.001);
  near(r1.gained.fish, (rate * 3600 * (1 + streakBonus(1)) * m) + r1.tip.fish, 0.002);
  const r1b = T.collect(r1.profile, 1 * H + 1000, 20);
  assert.ok(!r1b.streak.fresh); assert.equal(r1b.tip.fish, 0);
  let q = r1.profile, now = 1 * H;
  for (let d = 21; d <= 30; d++) { now += 24 * H; q = T.collect(q, now, d).profile; }
  assert.equal(q.town.streak.days, 11);
  near(T.collect(q, now + H, 31).streak.bonus, streakBonus(12), 1e-12);
  // a missed day breaks it, unless the kitty bank forgives
  const broke = T.collect(q, now + 3 * 24 * H, 33);
  assert.equal(broke.streak.days, 1);
  const bank = rich([['tuna_cannery', 10], ['kitty_bank', 40], null, null]);
  bank.town.streak = { days: 5, last: 20 };
  assert.ok(T.townStats(bank).streakGrace >= 1);
  assert.equal(T.collect(bank, 5 * H, 22).streak.days, 6);                // one missed day forgiven
  // clock going backwards in day index: no change
  const back = T.collect(q, now + H, 3);
  assert.equal(back.streak.days, q.town.streak.days); assert.ok(!back.streak.fresh);
  // visitors: once per slot
  const v = rich([['tuna_cannery', 1], null, null, null], 5);
  const t0 = 100 * H;
  const st = T.visitorState(v, t0);
  assert.ok(!st.claimed && st.kind.id);
  const c1 = T.claimVisitor(v, t0, 4);
  assert.ok(c1.ok);
  assert.equal(c1.profile.town.visitor.slot, st.slot);
  const c2 = T.claimVisitor(c1.profile, t0 + 60 * 1000, 4);
  assert.ok(!c2.ok && c2.reason === 'claimed');
  const c3 = T.claimVisitor(c1.profile, t0 + 4 * H + 1000, 4);
  assert.ok(c3.ok, 'next slot');
  assert.equal(T.claimVisitor(c3.profile, t0 - 50 * H, 4).reason, 'clock');
  assert.ok(!anyNeg(c3.profile));
  // clock tower shortens the interval
  const ct = rich([['tuna_cannery', 1], ['clock_tower', 60], null, null]);
  assert.ok(T.visitorState(ct, t0).interval < 4 * 3600 && T.visitorState(ct, t0).interval >= 2 * 3600);
  // determinism
  assert.equal(T.visitorState(v, t0).kind.id, T.visitorState(v, t0 + 5000).kind.id);
}

// ------------------------------------------------------------------ crate workshop keys, loot keys, pity credit
{
  const p = rich([['crate_workshop', 25], null, null, null]);
  p.town.streak = { days: 0, last: 5 };
  const perDay = statsAt(BUILDING_BY_ID.crate_workshop, 25, 1).keysPerDay;
  const r = T.collect(p, 4 * H, 5);                         // 4h of storage
  const expect = perDay * 4 / 24;
  const total = Object.values(r.profile.town.keys).reduce((a, b) => a + b, 0) + r.profile.town.keyFrac;
  near(total, expect, 0.001, 'keys');
  // fractions persist over several collects
  let q = p, now = 0;
  for (let i = 0; i < 20; i++) { now += 3 * H; q = T.collect(q, now, 5).profile; }
  const sum = Object.values(q.town.keys).reduce((a, b) => a + b, 0) + q.town.keyFrac;
  near(sum, perDay * 60 / 24, 0.002, 'keys over 60h');
  assert.ok(Object.keys(q.town.keys).every((k) => k.endsWith('_crate')));
  // loot accepts keys
  const kp = rich([null, null, null, null]);
  kp.cur.fish = 0; kp.cur.gems = 0;
  kp.town.keys = { alley_crate: 2 };
  const rng = makeRng(9);
  const o1 = openCrate(kp, 'alley_crate', rng, { useKey: true });
  assert.ok(!o1.error && o1.drops.length === 1);
  assert.equal(o1.profile.town.keys.alley_crate, 1);
  assert.equal(o1.profile.cur.fish, 0);
  assert.equal(o1.profile.stats.crateOpens | 0, 0, 'no price creep');
  assert.equal(o1.profile.stats.cratesTotal, 1);
  assert.equal(kp.town.keys.alley_crate, 2, 'input untouched');
  const o2 = openCrate(o1.profile, 'alley_crate', rng, { useKey: true });
  assert.ok(!o2.error && !o2.profile.town.keys.alley_crate);
  const o3 = openCrate(o2.profile, 'alley_crate', rng, { useKey: true });
  assert.equal(o3.error, 'no_key'); assert.equal(o3.drops.length, 0);
  assert.equal(openCrate(kp, 'neon_crate', rng, { useKey: true }).error, 'no_key');
  assert.equal(openCrate(kp, 'alley_crate', rng, { count: 10, useKey: true }).error, 'no_key');
  // normal payment still works and still needs currency
  assert.equal(openCrate(kp, 'alley_crate', rng).error, 'cant_afford');
  // pity credit: shown, not stored, never alone a hard guarantee
  const w = rich([['crate_workshop', 40], null, null, null]);
  const credit = townPityCredit(w);
  assert.ok(credit > 0 && credit <= 30);
  const none = rich([null, null, null, null]);
  assert.equal(townPityCredit(none), 0);
  const shown = pityCounters(w, 'alley_crate').epic, raw = pityCounters(w, 'alley_crate', false).epic;
  assert.equal(raw, 0); assert.ok(shown > 0);
  assert.equal(oddsTable('alley_crate', w).pity.epic.counter, shown);
  assert.ok(oddsTable('alley_crate', w).forced === null, 'credit alone never forces');
  w.cur.fish = 1e9;
  const opened = openCrate(w, 'alley_crate', makeRng(4));
  assert.ok(opened.profile.pity.alley_crate <= 1, 'stored counter is the real one');
  // Monte Carlo sanity: credit never lowers the epic rate, and the stored counters stay small integers
  let epicsPlain = 0, epicsCredit = 0, rp = rich([null, null, null, null]), rw = rich([['crate_workshop', 40], null, null, null]);
  rp.cur.fish = rw.cur.fish = 1e15;
  const ra = makeRng(21), rb = makeRng(21);
  for (let i = 0; i < 1500; i++) {
    const a = openCrate(rp, 'alley_crate', ra, { free: true }), b = openCrate(rw, 'alley_crate', rb, { free: true });
    rp = a.profile; rw = b.profile;
    if (['epic', 'legend', 'mythic'].includes(a.drops[0].rarity)) epicsPlain++;
    if (['epic', 'legend', 'mythic'].includes(b.drops[0].rarity)) epicsCredit++;
  }
  assert.ok(epicsCredit >= epicsPlain * 0.9, `credit ${epicsCredit} plain ${epicsPlain}`);
  assert.ok(epicsPlain > 5 && epicsPlain < 700);
}

// ------------------------------------------------------------------ quests, achievements, collection
{
  let p = rich([['tuna_cannery', 10], null, null, null], 77);
  p = T.refresh(p, 40);
  assert.equal(p.quests.daily.day, 40); assert.equal(p.quests.daily.quests.length, 3);
  assert.equal(p.quests.weekly.week, 5); assert.equal(p.quests.weekly.quests.length, 4);
  const again = T.refresh(p, 40);
  assert.deepEqual(again.quests, p.quests);
  assert.deepEqual(T.refresh(rich([['tuna_cannery', 10], null, null, null], 77), 40).quests, p.quests, 'deterministic');
  assert.equal(T.refresh(p, -1), p);
  // not done yet
  assert.equal(T.claimQuest(p, 'daily', 0, 40).reason, 'not_done');
  assert.equal(T.claimQuest(p, 'daily', 7, 40).reason, 'bad_index');
  assert.equal(T.claimQuest(p, 'daily', 0, 41).reason, 'stale');
  // finish every daily by bumping the counters hard
  const delta = {};
  for (const k of ['battlesWon', 'bossKills', 'kills', 'cardsPlayed', 'spellsCast', 'summons', 'perfectWins', 'fastWins', 'cratesOpened', 'collects', 'upgrades', 'catLevelUps', 'fishEarned']) delta[k] = 1e12;
  let done = T.recordStats(p, delta);
  assert.equal(p.stats.battlesWon, 0, 'recordStats is pure');
  assert.equal(T.recordStats(p, { kills: -5, hacker: NaN, __proto__: 1 }).stats.kills, 0);
  const gems0 = done.cur.gems;
  let gainedGems = 0;
  for (let i = 0; i < 3; i++) {
    const c = T.claimQuest(done, 'daily', i, 40);
    assert.ok(c.ok, 'claim ' + i + ' ' + c.reason);
    done = c.profile; gainedGems += c.gemsGranted;
    assert.equal(T.claimQuest(done, 'daily', i, 40).reason, 'claimed');
  }
  assert.equal(done.cur.gems - gems0, gainedGems);
  assert.ok(done.cur.gems > gems0);
  const bonus = T.claimBonus(done, 'daily', 40);
  assert.ok(bonus.ok);
  assert.equal(T.claimBonus(bonus.profile, 'daily', 40).reason, 'claimed');
  assert.equal(T.claimBonus(T.refresh(p, 40), 'daily', 40).reason, 'not_ready');
  assert.ok(done.stats.gemToday <= 40);
  // weekly
  // derived metrics (nine lives resets, stage) cannot be bumped by counters: raise them directly so all four are done
  done = { ...done, nineLives: { count: 1000, shards: 0 }, progress: { ...done.progress, best: { ...done.progress.best, 6: 30 } } };
  for (let i = 0; i < 4; i++) { const c = T.claimQuest(done, 'weekly', i, 40); assert.ok(c.ok, 'weekly ' + i + ' ' + c.reason + ' ' + JSON.stringify(done.quests.weekly.quests[i])); done = c.profile; }
  assert.ok(T.claimBonus(done, 'weekly', 40).ok);
  assert.ok(!anyNeg(done));
  // a new day rolls new dailies
  const next = T.refresh(done, 41);
  assert.equal(next.quests.daily.day, 41); assert.equal(next.quests.weekly.week, 5);
  assert.equal(T.refresh(done, 42 + 7).quests.weekly.week, 7);

  // achievements: several tiers ready at once, claimed one by one, never repeated
  const big = T.recordStats(rich([['tuna_cannery', 10], null, null, null]), { battlesWon: 1e6 });
  const st = T.achievements(big).find((s) => s.family === 'battles_won');
  assert.ok(st.ready >= 5);
  const c1 = T.claimAchievement(big, 'battles_won');
  assert.ok(c1.ok); assert.equal(c1.profile.quests.ach.battles_won, 1);
  assert.equal(c1.entry.id, 'battles_won_1');
  assert.ok(c1.profile.cur.gems > big.cur.gems);
  assert.equal(T.claimAchievement(c1.profile, 'nope').reason, 'unknown');
  assert.equal(T.claimAchievement(rich([['tuna_cannery', 10], null, null, null]), 'battles_won').reason, 'not_ready');
  const all = T.claimAllAchievements(big);
  assert.ok(all.claimed.length >= 5);
  assert.equal(T.claimAllAchievements(all.profile).claimed.length, 0);
  assert.ok(all.profile.quests.ach.battles_won >= 5);
  assert.ok(!anyNeg(all.profile));
  const fam = ACHIEVEMENT_FAMILIES.find((f) => f.id === 'battles_won');
  assert.ok(1e6 >= achievementTarget(fam, all.profile.quests.ach.battles_won - 1));

  // collection: own every cat of a role, claim, no double claim
  const cp = rich([['tuna_cannery', 10], null, null, null]);
  const entries = T.collection(cp);
  assert.ok(entries.length > 20);
  const doneEntry = entries.find((e) => e.done && !e.claimed);
  if (doneEntry) {
    const cc = T.claimCollection(cp, doneEntry.id);
    assert.ok(cc.ok); assert.equal(T.claimCollection(cc.profile, doneEntry.id).reason, 'claimed');
  }
  assert.equal(T.claimCollection(cp, 'nope').reason, 'unknown');
  const notDone = entries.find((e) => !e.done);
  assert.equal(T.claimCollection(cp, notDone.id).reason, 'not_done');
  // own all cats: a role set bonus shows up and entries become claimable
  const full = rich([['tuna_cannery', 10], null, null, null]);
  full.cats = {};
  const cats = (await import('../midnight_mog/js/data/cats.js')).CATS;
  for (const c of cats) full.cats[c.id] = { level: 10, dupes: 0, stars: 1 };
  assert.ok(T.collectionBonuses(full).length > 0);
  let fp = full, n = 0;
  for (const e of T.collection(full)) if (e.done && !e.claimed) { const r = T.claimCollection(fp, e.id); assert.ok(r.ok, e.id); fp = r.profile; n++; }
  assert.ok(n > 10 && !anyNeg(fp));
  // training xp pays before yarn
  const xp = { ...rich([null, null, null, null]) }; xp.town.xp = 50;
  const px = T.payWithXp(xp, 80);
  assert.equal(px.xpUsed, 50); assert.equal(px.yarnDue, 30); assert.equal(px.profile.town.xp, 0);
  assert.equal(T.payWithXp(xp, 20).yarnDue, 0);
}

// ------------------------------------------------------------------ observatory maps and garden
{
  const p = rich([['observatory', 13], ['catnip_garden', 10, { opt: { district: 'sewer_sprawl', strain: 'dmg' } }], null, null]);
  const ms = T.maps(p, 9);
  assert.equal(ms.length, 3);                                // 1 at level 1, +1 per 6 levels
  assert.ok(ms[0].stage >= 1 && ms[0].rewardMult > 1.3);
  const c = T.claimMapClear(p, ms[0].id, 9);
  assert.ok(c.ok && c.gems === 1);
  assert.equal(T.claimMapClear(c.profile, ms[0].id, 9).reason, 'claimed');
  assert.ok(T.claimMapClear(c.profile, ms[0].id, 10).ok);
  assert.equal(T.claimMapClear(p, 'comet_rift_99', 9).reason, 'locked');
  const gb = T.gardenBuffs(p, 'sewer_sprawl'), gb2 = T.gardenBuffs(p, 'rooftop_row');
  assert.ok(gb.dmg > 0); near(gb2.dmg, gb.dmg * 0.3, 1e-12); assert.equal(gb.hp, 0);
}

// ------------------------------------------------------------------ offline
{
  const p = rich([['tuna_cannery', 20], ['yarn_mill', 10], null, null]);
  p.lastSeen = 1000;
  const eco = E.offlineGainFor(p, 3 * 3600);
  const g = O.offlineGain(p, 1000 + 3 * H);
  assert.equal(g.fish, eco.fish); assert.equal(g.yarn, eco.yarn); assert.equal(g.seconds, eco.seconds); assert.equal(g.capped, eco.capped);
  assert.ok(g.fish > 0);
  // cap enforced
  const capS = E.offlineCapSeconds(p);
  const far = O.offlineGain(p, 1000 + 1000 * H);
  assert.equal(far.seconds, capS); assert.ok(far.capped);
  const atCap = O.offlineGain(p, 1000 + (capS / 3600) * H);
  assert.equal(far.fish, atCap.fish); assert.ok(!atCap.capped);
  assert.ok(O.offlineGain(p, 1000 + 7 * H).fish <= far.fish);
  assert.equal(far.fish, E.offlineGainFor(p, 1e9).fish);
  // gain is monotonic in time away and never has gems
  let prev = -1;
  for (let h = 0; h <= 60; h += 3) { const x = O.offlineGain(p, 1000 + h * H); assert.ok(x.fish >= prev); prev = x.fish; assert.ok(x.seconds <= x.capSeconds); }
  // nap dome: longer cap, better efficiency, still clamped
  const nap = rich([['tuna_cannery', 20], ['yarn_mill', 10], ['nap_dome', 20], null]);
  nap.lastSeen = 1000;
  const lim = O.offlineLimits(nap);
  assert.ok(lim.capSeconds > capS && lim.efficiency > E.offlineEfficiency(nap));
  const ng = O.offlineGain(nap, 1000 + 1000 * H);
  assert.equal(ng.seconds, lim.capSeconds);
  assert.ok(ng.fish > far.fish);
  assert.ok(ng.seconds <= 40 * 3600);
  const maxed = rich([['tuna_cannery', 20], ['nap_dome', 1e6], null, null]); maxed.meta = { offline_cap: 8, offline_eff: 5 }; maxed.lastSeen = 0;
  const ml = O.offlineLimits(maxed);
  assert.ok(ml.capSeconds <= 40 * 3600 && ml.efficiency <= 0.8 + 1e-12);
  // clock going backwards or garbage: nothing, lastSeen does not move
  assert.equal(O.offlineGain(p, 500).fish, 0); assert.equal(O.offlineGain(p, 500).seconds, 0);
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, '5']) { assert.equal(O.offlineGain(p, bad).seconds, 0); assert.equal(O.applyOffline(p, bad).profile.lastSeen, 1000); }
  const ap = O.applyOffline(p, 1000 + 5 * H);
  assert.equal(ap.profile.lastSeen, 1000 + 5 * H);
  assert.equal(ap.profile.cur.fish, p.cur.fish + ap.gain.fish);
  assert.equal(ap.profile.cur.gems, p.cur.gems);
  assert.equal(O.applyOffline(ap.profile, 1000 + 5 * H).gain.fish, 0, 'no double pay');
  assert.equal(O.applyOffline(ap.profile, 10).profile.lastSeen, 1000 + 5 * H, 'lastSeen monotonic');
  assert.equal(O.touch(ap.profile, 5).lastSeen, ap.profile.lastSeen);
  assert.equal(p.lastSeen, 1000, 'input untouched');
}

// ------------------------------------------------------------------ clock safety and no negative currency
{
  const p = rich([['tuna_cannery', 10], ['yarn_mill', 5], ['gem_mine', 3], ['scratching_post', 2]]);
  p.town.streak = { days: 3, last: 50 };
  // a timer in the future (clock was set forward, then back) pays nothing and heals
  const fut = { ...p, town: { ...p.town, plots: p.town.plots.map((x) => ({ ...x, t: 1000 * H })) } };
  const r = T.collect(fut, 10 * H, 50);
  assert.equal(r.gained.fish, 0); assert.equal(r.gained.yarn, 0);
  assert.ok(r.profile.town.plots.every((x) => !x.b || x.t === 10 * H), 'timers pulled back to now');
  const after = T.collect(r.profile, 11 * H, 50);
  assert.ok(after.gained.fish > 0, 'works again afterwards');
  assert.ok(!T.collect(p, NaN, 50).ok);
  assert.equal(T.collect(p, NaN, 50).profile, p);
  // collecting at an earlier time never pays more than at a later time
  const early = T.collect(p, 2 * H, 50).gained.fish, late = T.collect(p, 3 * H, 50).gained.fish;
  assert.ok(late >= early);
  // fuzz: random operations never produce a negative, fractional or non finite currency, and never mutate their input
  const rng = makeRng(2024);
  let q = rich([['tuna_cannery', 1], null, null, null], 5);
  q.cur = { fish: 3000, yarn: 100, gems: 120, tokens: 0 };
  q.town.streak = { days: 0, last: -1 };
  const ids = Object.keys(BUILDING_BY_ID);
  let now = 0;
  for (let i = 0; i < 1500; i++) {
    const before = JSON.stringify(q);
    const op = rng.int(0, 9);
    const day = Math.floor(now / (24 * H));
    now += rng.chance(0.1) ? -rng.int(0, 5 * H) : rng.int(0, 3 * H);     // sometimes the clock goes backwards
    const nowC = Math.max(0, now);
    let r2;
    if (op <= 1) r2 = T.build(q, ids[rng.int(0, ids.length - 1)], rng.int(0, q.town.plots.length + 1), nowC);
    else if (op <= 3) r2 = T.upgrade(q, rng.int(0, q.town.plots.length), nowC, rng.int(1, 4));
    else if (op === 4) r2 = T.unlockPlot(q, nowC);
    else if (op === 5) r2 = T.swap(q, rng.int(0, q.town.plots.length - 1), rng.int(0, q.town.plots.length - 1), nowC);
    else if (op === 6) r2 = T.claimVisitor(q, nowC, day);
    else if (op === 7) r2 = { profile: T.refresh(T.recordStats(q, { battlesWon: rng.int(0, 3), fishEarned: rng.int(0, 1000) }), day) };
    else r2 = T.collect(q, nowC, day);
    assert.equal(JSON.stringify(q), before, 'input mutated by op ' + op);
    q = r2.profile;
    q.cur.fish += rng.int(0, 400);
    for (const k of ['fish', 'yarn', 'gems', 'tokens']) assert.ok(Number.isInteger(q.cur[k]) && q.cur[k] >= 0, `${k} ${q.cur[k]} after op ${op}`);
    assert.ok(q.town.xp >= 0 && Number.isFinite(q.town.xp));
    for (const id of Object.keys(q.town.keys)) assert.ok(Number.isInteger(q.town.keys[id]) && q.town.keys[id] > 0);
    for (const pl of q.town.plots) if (pl.b) { assert.ok(pl.level >= 1); assert.ok(Number.isFinite(pl.t)); assert.ok(!('acc' in pl) || pl.acc >= 0); }
    for (const id of ids) assert.ok(q.town.plots.filter((x) => x.b === id).length <= BUILDING_BY_ID[id].limit);
  }
  assert.ok(q.town.plots.filter((x) => x.b).length >= 2, 'the fuzz actually built things');
}

// ------------------------------------------------------------------ house rules
{
  const { readFileSync } = await import('node:fs');
  for (const f of ['town.js', 'offline.js']) {
    const src = readFileSync(new URL('../midnight_mog/js/sim/' + f, import.meta.url), 'utf8');
    assert.ok(!src.includes(em), f + ' has an em dash');
    assert.ok(!/Math\.random|Date\.now|new Date|localStorage|document\./.test(src.replace(/\/\/.*$/gm, '')), f + ' touches a forbidden global');
  }
}

console.log('midnight_mog town + offline: ok');
