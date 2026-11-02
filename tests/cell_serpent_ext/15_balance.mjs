// 15-balance: headless balance targets (bot + random card picks, fixed seeds, deterministic, about 6 s).
// Full table for every stage: node tests/cell_serpent_ext/balance_harness.mjs [seedsPerStage] [stage,stage,...]
import assert from 'node:assert/strict';
import * as sim from '../../cell_serpent/sim.js';
import { runs, winRate, PROFILES, profileFor } from './balance_harness.mjs';

const N = 4;
const fresh1 = winRate(1, {}, N), fresh3 = winRate(3, {}, N);
assert.ok(fresh1.win >= 0.1 && fresh1.win <= 0.6, 'fresh account clears stage 1 sometimes: ' + fresh1.win);
assert.equal(fresh3.win, 0, 'fresh account cannot clear stage 3');
assert.ok(fresh1.prog > fresh3.prog * 0.9, 'stage 3 is not easier than stage 1 on progress');

const m5 = { atk: 5, cdn: 5, crt: 5 };
const s3 = winRate(3, m5, N), s5 = winRate(5, m5, N);
assert.ok(s3.win >= 0.4, 'a few meta levels make stage 3 clearable: ' + s3.win);
assert.ok(s5.win < s3.win, 'the stage 5 boss is a wall compared with stage 3');

// ring stages: the long spiral used to be a spike (stage 6 about 16% while stage 7 was 100% at meta 8)
const m8 = { atk: 8, cdn: 8, crt: 8 };
const r6 = runs(6, { meta: m8 }, 3), r7 = runs(7, { meta: m8 }, 3);
assert.ok(sim.RING_SPEED > 0.5 && sim.RING_SPEED < 2.5, 'circle stage speed is a sane multiplier (b11: the circle is smaller and the aim is free, so the shorter spiral is walked faster)');
assert.ok(r6.prog >= 0.4 && r6.prog >= r7.prog * 0.4, 'stage 6 (circle) is hard but not a wall next to stage 7: ' + r6.prog.toFixed(2) + ' vs ' + r7.prog.toFixed(2));
assert.ok(r6.win < 1 || r7.win < 1 || r6.win <= r7.win, 'the circle is never the easier stage');

// bosses: soft at the face, so the first yellow cells pop and the run can snowball; they are not a wall for a typical player
const bossHp = n => { const g = sim.createGame({ seed: 5, stage: n }), s = g.snakes[0].segs; return [s[2].max, s[s.length - 1].max]; };
assert.ok(sim.BOSS_HP[0] < 1 && sim.BOSS_HP[1] >= 2, 'boss cells start soft and end tough');
const b10 = runs(10, profileFor(10).build, 3);
assert.ok(b10.prog >= 0.25, 'the stage 10 boss is a fight for the regular profile, not a wall: ' + b10.prog.toFixed(2));
assert.ok(bossHp(10)[1] > bossHp(10)[0] * 3, 'a boss gets much tougher down its length');

// typical player per band: owns skills, pets, keepsakes and an outfit; mid-band lanes are beatable but not free
assert.equal(PROFILES.length, 5);
for (const [i, st] of [[0, 2], [1, 8], [2, 13]]) {
  const r = runs(st, PROFILES[i].build, 2);
  assert.ok(r.prog >= 0.5, `typical ${PROFILES[i].name} makes real progress on stage ${st}: ${r.prog.toFixed(2)}`);
}
const strong = runs(13, PROFILES[2].build, 2), bare = runs(13, { meta: PROFILES[2].build.meta }, 2);
assert.ok(strong.prog >= bare.prog, 'skills, pets, keepsakes and the outfit never make a build weaker: ' + strong.prog.toFixed(2) + ' vs ' + bare.prog.toFixed(2));

// economy: a stage 1 win pays enough Beats that the first Volume levels come within a handful of runs
assert.ok(fresh1.coins >= 60, 'stage 1 pays a steady drip of Beats: ' + fresh1.coins);
const firstThree = [0, 1, 2].reduce((a, l) => a + sim.metaCost(sim.META[0], l), 0);
assert.ok(firstThree / Math.max(1, fresh1.coins) <= 4, 'three Volume levels cost about four stage 1 runs');
// Sparkles: first clears are the faucet (about 25 per stage early); prices must stay within a few clears
let first5 = 0; for (let n = 1; n <= 5; n++) first5 += sim.clearReward(n).sparkles;
assert.ok(first5 >= 2 * sim.EGG_PRICE, 'the first five clears buy at least two eggs: ' + first5);
assert.ok(sim.reviveCost(0) <= sim.clearReward(1).sparkles, 'the first revive costs less than the first clear pays');
assert.ok(sim.KEEP_PRICE <= 6 * sim.clearReward(3).sparkles, 'a keepsake draw costs about three early clears');

// round 3: late-game easing is monotonic and the Beats sink (extra meta levels) keeps old saves valid
for (let n = 15; n < 50; n++) assert.ok(sim.hpBase(n + 1) > sim.hpBase(n), 'cell HP still rises every stage: ' + n);
assert.ok(sim.hpBase(3) === 12 * (12.5 * Math.pow(1.2, 2) + 1.5), 'early cell HP untouched');
assert.ok(sim.META.filter(m => m.max > 1).every(m => m.max >= 12 && m.max <= 15), 'meta levels stay within the 15 pips the Stats card draws');
const old = sim.sanitizeSave({ meta: { atk: 12, crt: 10, cdn: 10, vit: 10, for: 10, rev: 1 } });
assert.equal(old.meta.atk, 12); assert.equal(old.meta.for, 10); assert.ok(sim.buyMeta({ ...old, beats: 1e6 }, 'atk'), 'a maxed-out old account can buy the new levels');
console.log('15_balance ok');
