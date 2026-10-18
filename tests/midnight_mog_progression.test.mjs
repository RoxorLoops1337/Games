import assert from 'node:assert/strict';
import { makeRng } from '../midnight_mog/js/rng.js';
import * as P from '../midnight_mog/js/sim/progression.js';
import { enemyPower, nineLivesMult, bestGlobalStage, globalStage, NINE_LIVES } from '../midnight_mog/js/sim/economy.js';
import { DISTRICTS, ELITE_AFFIXES, districtForStage, waveCount } from '../midnight_mog/js/data/districts.js';
import { ENEMY_BY_ID } from '../midnight_mog/js/data/enemies.js';

const t0 = Date.now();
const mk = (gs, extra = {}) => {
  const d = P.fromGlobal(gs);
  return { v: 1, seed: 1, cur: { fish: 5, gems: 3, yarn: 7, tokens: 0 }, cats: { a: { level: 9, dupes: 2, stars: 1 } }, cards: { pounce: { level: 4, count: 3 } },
    relics: { r: true }, deck: ['pounce'], town: { plots: [], keys: { alley_crate: 2 }, xp: 50 }, progress: { district: d.district, stage: d.stage, best: {} },
    nineLives: { count: 0, shards: 0 }, pity: { x: 3 }, stats: { crateOpens: 40 }, ...extra };
};

// scaling: within 20% of enemyPower, monotonic, finite forever
let prev = null;
for (let gs = 1; gs <= 3000; gs++) {
  const s = P.stageScaling(null, gs), pw = enemyPower(gs);
  if (pw < 1e300) {
    assert.ok(s.hp / pw >= 0.8 && s.hp / pw <= 1.2, 'hp band ' + gs);
    assert.ok(s.dmg / pw >= 0.8 && s.dmg / pw <= 1.2, 'dmg band ' + gs);
  }
  if (prev) for (const k of ['hp', 'dmg', 'speed', 'reward', 'power']) assert.ok(s[k] >= prev[k], k + ' monotonic ' + gs);
  prev = s;
}
assert.equal(P.stageScaling(2, 5).gs, globalStage(2, 5));
assert.equal(P.stageScaling('alley_alamo', 3).gs, 13);
assert.equal(P.stageScaling('rooftop_row', 1).gs, 1);

// endless never throws up to 100000, finite outputs
for (const gs of [61, 120, 121, 500, 5000, 99999, 100000]) {
  const s = P.stageScaling(null, gs);
  for (const k of ['hp', 'dmg', 'speed', 'reward', 'power']) assert.ok(Number.isFinite(s[k]) && s[k] > 0, k + gs);
}
const rng = makeRng(5);
for (let gs = 1; gs <= 100000; gs += gs < 400 ? 1 : 997) {
  const n = P.wavesPerStage(null, gs);
  for (const w of [0, n - 1, n, n + 5]) {
    const sch = P.enemyWave(null, gs, w, rng);
    assert.ok(Array.isArray(sch) && sch.length > 0 && sch.length <= 90);
    for (const e of sch) { assert.ok(ENEMY_BY_ID[e.enemyId]); assert.ok(e.count >= 1 && e.t >= 0 && e.lane >= 0 && e.lane < P.LANES); }
  }
}

// determinism by seed, and different seeds differ
const a = JSON.stringify(P.stagePlan(null, 37, makeRng(99)));
assert.equal(a, JSON.stringify(P.stagePlan(null, 37, makeRng(99))));
assert.notEqual(a, JSON.stringify(P.stagePlan(null, 37, makeRng(100))));
assert.equal(JSON.stringify(P.enemyWave(null, 12, 1)), JSON.stringify(P.enemyWave(null, 12, 1)));

// schedules sorted, pool respected (district enemies only, `from` gates), swarm entries are whole groups
for (let gs = 1; gs <= 60; gs++) {
  const info = districtForStage(gs), ids = new Map(info.district.enemyPool.map((p) => [p.id, p.from]));
  for (const wave of P.stagePlan(null, gs, makeRng(gs))) {
    for (let i = 1; i < wave.length; i++) assert.ok(wave[i].t >= wave[i - 1].t);
    for (const e of wave) {
      if (e.boss) continue;
      assert.ok(ids.has(e.enemyId), gs + ' ' + e.enemyId);
      assert.ok(ids.get(e.enemyId) <= info.stageInDistrict, 'from gate');
      assert.equal(e.affix, null);
      const g = ENEMY_BY_ID[e.enemyId].params.swarm;
      if (g && g.group > 1) assert.equal(e.count, g.group);
    }
  }
}

// boss every 10 stages with phases, exactly one boss wave, last
for (let gs = 1; gs <= 200; gs++) {
  const plan = P.stagePlan(null, gs, makeRng(gs)), info = districtForStage(gs);
  assert.equal(plan.length, waveCount(gs) + (gs % 10 === 0 ? 1 : 0));
  const bosses = plan.flat().filter((e) => e.boss);
  if (gs % 10 === 0) {
    assert.equal(bosses.length, 1);
    assert.ok(plan[plan.length - 1].includes(bosses[0]));
    assert.equal(bosses[0].enemyId, info.district.boss);
    assert.ok(bosses[0].phases.length >= 3 && bosses[0].phases[0].at === 1);
    if (gs <= 60) assert.equal(bosses[0].affix, null);
    else assert.equal(bosses[0].affix.length, Math.min(4, 1 + info.round));
  } else assert.equal(bosses.length, 0);
}
assert.equal(districtForStage(60).isBoss, true);
assert.equal(P.stageInfo(null, 61).endless, true);
assert.match(P.stageInfo(null, 121).label, /Comet Rift II/);

// elite affixes appear in endless only
let elites = 0;
const ids = new Set(ELITE_AFFIXES.map((x) => x.id));
for (let gs = 61; gs < 400; gs++) for (const w of P.stagePlan(null, gs, makeRng(gs))) for (const e of w) if (e.affix && !e.boss) { elites++; assert.ok(e.affix.every((x) => ids.has(x))); }
assert.ok(elites > 20, 'elites ' + elites);

// budgets grow with waves
const sz = (gs, w) => P.enemyWave(null, gs, w, makeRng(3)).reduce((s, e) => s + e.count, 0);
assert.ok(sz(55, 4) > sz(1, 0));

// rewards: first clear advances, replay does not, loss pays nothing, gems on boss first clear only, input not mutated
let p = mk(1);
const snap = JSON.stringify(p);
let r = P.stageRewards(p, { won: true });
assert.equal(JSON.stringify(p), snap);
assert.ok(r.firstClear && r.advanced && r.rewards.fish > 0 && r.profile.progress.stage === 2 && r.profile.stats.battlesWon === 1);
let r2 = P.stageRewards(r.profile, { won: true, gs: 1 });
assert.ok(!r2.firstClear && !r2.advanced && r2.rewards.fish > 0 && r2.rewards.fish < r.rewards.fish);
assert.equal(P.stageRewards(p, { won: false }).rewards.fish, 0);
let pb = mk(10);
const rb = P.stageRewards(pb, { won: true });
assert.ok(rb.boss && rb.rewards.gems > 0 && rb.profile.stats.bossKills === 1);
assert.equal(P.stageRewards(rb.profile, { won: true, gs: 10 }).rewards.gems, 0);
assert.equal(P.stageRewards(mk(31), { won: true }).profile.progress.district, 2);
assert.equal(P.stageRewards(mk(30), { won: true }).profile.progress.district, 2);
assert.ok(Number.isFinite(P.stageRewards(mk(100000), { won: true }).rewards.fish) && P.stageRewards(mk(100000), { won: true }).rewards.fish > 0);

// unlocks
assert.equal(P.unlockedDistricts(mk(1)), 1);
assert.equal(P.unlockedDistricts(mk(31)), 2);
assert.ok(P.isDistrictUnlocked(mk(95), 4) && !P.isDistrictUnlocked(mk(95), 5));
assert.deepEqual(P.unlockedContentDistricts(mk(25)), ['rooftop_row', 'alley_alamo', 'sewer_sprawl']);
assert.ok(P.isStageUnlocked(mk(5), 5) && !P.isStageUnlocked(mk(5), 6));

// Nine Lives
let no = P.nineLivesReset(mk(10));
assert.equal(no.ok, false); assert.equal(no.shards, 0);
const town = { plots: [{ b: 'tuna_cannery', level: 40, t: 5 }, { b: 'nap_dome', level: 10, t: 5 }, { b: 'shrine_nine_lives', level: 20, t: 5 }, {}], keys: { alley_crate: 2 }, xp: 50 };
let prof = mk(100, { town, meta: { start_fish: 2 } });
prof.cur.gems = 77;
const pre = JSON.stringify(prof);
const nl = P.nineLivesReset(prof);
assert.equal(JSON.stringify(prof), pre);
assert.ok(nl.ok && nl.shards > 0);
const q = nl.profile;
assert.equal(q.nineLives.count, 1);
assert.equal(q.nineLives.shards, nl.shards);
assert.equal(q.cur.tokens, nl.shards);
assert.equal(q.cur.gems, 77);
assert.equal(q.stats.crateOpens, 0);
assert.equal(q.progress.district, 1); assert.equal(q.progress.stage, 1);
assert.ok(q.progress.echo >= Math.floor(100 * NINE_LIVES.echoFraction));
assert.equal(q.cats.a.level, 1); assert.equal(q.cats.a.stars, 1); assert.equal(q.cards.pounce.count, 3);
assert.equal(q.town.plots.length, 4); assert.equal(q.town.keys.alley_crate, 2); assert.equal(q.town.xp, 0);
assert.equal(q.town.plots[1].level, 10); // nap dome keeps all
assert.equal(q.town.plots[2].level, 20); // shrine keeps all
assert.ok(q.town.plots[0].level >= 20 && q.town.plots[0].level < 40);
assert.deepEqual(q.deck, ['pounce']); assert.deepEqual(q.pity, { x: 3 });
assert.ok(q.cur.fish > 0 && q.cur.yarn === 0);
assert.ok(bestGlobalStage(q) < 5);
// shrine boosts shards vs no shrine
const noShrine = P.nineLivesReset(mk(100));
assert.ok(nl.shards > noShrine.shards, 'shrine shards');

// echo: stages below the threshold are echo clears (20s, replay pay, no gems), threshold reachable
assert.equal(P.stageMode(q, 1).echo, true);
assert.equal(P.stageMode(q, 1).seconds, 20);
const ec = P.echoClear(q, 5);
assert.equal(ec.cleared, 5); assert.equal(ec.seconds, 100); assert.equal(ec.profile.progress.stage, 6);
const full = P.echoClear(q);
assert.equal(P.stageMode(full.profile, bestGlobalStage(full.profile)).echo, false);
assert.equal(full.cleared, q.progress.echo - 1);
assert.ok(full.rewards.gems === 0 && full.rewards.fish > 0);
assert.equal(P.stageMode(full.profile, bestGlobalStage(full.profile)).firstClear, true);

// multiplier never decreases over a long reset chain, shards respect diminishing returns
let cur = mk(60), lastM = nineLivesMult(0), lastShards = 0, gain = [];
for (let i = 0; i < 40; i++) {
  const best = 40 + i * 5;
  const d = P.fromGlobal(best);
  cur.progress = { district: d.district, stage: d.stage, best: {} };
  const out = P.nineLivesReset(cur);
  assert.ok(out.ok);
  cur = out.profile;
  const m = nineLivesMult(cur.nineLives.shards);
  assert.ok(m.income >= lastM.income && m.damage >= lastM.damage, 'mult monotonic');
  assert.ok(cur.nineLives.shards > lastShards);
  gain.push([m.income - lastM.income, out.shards]);
  lastM = m; lastShards = cur.nineLives.shards;
}
// per shard marginal gain falls (concave mult)
for (let i = 1; i < gain.length; i++) assert.ok(gain[i][0] / gain[i][1] < gain[i - 1][0] / gain[i - 1][1] + 1e-12, 'diminishing ' + i);
assert.equal(cur.nineLives.count, 40);
assert.equal(cur.nineLives.ascended, true);
assert.equal(P.shrineBonuses(mk(1)).shardPct, 0);

const ms = Date.now() - t0;
assert.ok(ms < 10000, 'too slow ' + ms);
console.log('midnight_mog progression ok (' + ms + 'ms)');
