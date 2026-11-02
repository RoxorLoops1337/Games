// Batch 12 balance (agent d): Gold Records (late Beats sink) and the human-like ring bot.
import assert from 'node:assert/strict';
import * as sim from '../../cell_serpent/sim.js';
import { PLAT_STATS, PLAT_MAX, PLAT_STEP, platCost, platTotal, platMeta, buyPlat, platReady } from '../../cell_serpent/plat_b12d.js';
import { humanBot, humanRuns, BUILDS, playRun } from './balance_harness.mjs';

// Gold Records: defaults, sanitize, gating, cost, bonus
{
  const s = sim.defaultSave(); assert.deepEqual(s.plat, { atk: 0, crt: 0, vit: 0, for: 0 });
  assert.deepEqual(sim.sanitizeSave({ plat: { atk: 99, crt: -3, vit: 'x', for: 4, evil: 5 } }).plat, { atk: 10, crt: 0, vit: 0, for: 4 });
  assert.deepEqual(sim.sanitizeSave({}).plat, s.plat, 'an old save loads with empty records');
  s.beats = 1e9; assert.ok(!buyPlat(s, 'atk'), 'closed before stage 25');
  s.cleared = 25; assert.ok(!buyPlat(s, 'atk'), 'closed until the stat is maxed');
  s.meta.atk = 15; assert.ok(platReady(s, 'atk'));
  const before = s.beats; assert.ok(buyPlat(s, 'atk')); assert.equal(before - s.beats, platCost(0)); assert.equal(s.plat.atk, 1);
  assert.ok(!buyPlat(s, 'cdn'), 'Tempo and Encore have no ladder');
  for (let i = 1; i < PLAT_MAX; i++) assert.ok(buyPlat(s, 'atk')); assert.ok(!buyPlat(s, 'atk'), 'ten ranks at most');
  const m = platMeta(s); assert.equal(m.atk, 15 + PLAT_STEP * PLAT_MAX); assert.equal(s.meta.atk, 15, 'the save is untouched');
  const poor = sim.defaultSave(); poor.cleared = 30; poor.meta.crt = 13; poor.beats = platCost(0) - 1; assert.ok(!buyPlat(poor, 'crt'));
  assert.ok(platTotal() > 2e6, 'the ladder is a long goal: ' + platTotal());
  // vit stays under the slow cap, cooldowns untouched
  const v = sim.makePlayer(platMeta({ meta: { vit: 13 }, plat: { vit: 10 } })); assert.ok(v.slow <= 0.45);
}
// the human-like bot: deterministic, turn rate limited, and weaker than the perfect bot at a ring stage
{
  const a = playRun(6, 101, { ...BUILDS.regular, bot: humanBot(101) }), b = playRun(6, 101, { ...BUILDS.regular, bot: humanBot(101) });
  assert.equal(a.progress, b.progress, 'the human bot is deterministic');
  const g = sim.createGame({ seed: 3, stage: 6 }), bot = humanBot(3, { turnDeg: 60 });
  let prev = g.p.aim, worst = 0;
  for (let i = 0; i < 90; i++) { sim.step(g, 1 / 30, bot(g)); let d = Math.abs(Math.atan2(Math.sin(g.p.aim - prev), Math.cos(g.p.aim - prev))); worst = Math.max(worst, d); prev = g.p.aim; g.events.length = 0; if (g.phase === 'levelup') sim.choose(g, 0); }
  assert.ok(worst <= (60 * Math.PI / 180) / 30 + 1e-6, 'aim turns at most 60 deg/s: ' + worst);
  assert.ok(sim.ringPace(6) < 1 && sim.ringPace(12) < sim.ringPace(6) && sim.ringPace(42) < 1, 'ring pace is eased early and at the end');
}
// a fresh account still fails stage 3 and the first ring stage (also with the human bot)
{
  let w = 0; for (let i = 0; i < 6; i++) if (playRun(3, 100 + i, { bot: humanBot(100 + i) }).won) w++;
  assert.ok(w <= 1, 'fresh stage 3 stays harsh: ' + w + '/6');
  assert.equal(humanRuns(6, {}, 4).win, 0, 'a fresh build does not clear the first circle stage');
  const r = humanRuns(6, BUILDS.regular, 12).win;
  assert.ok(r >= 0.3 && r <= 0.85, 'regular build, stage 6, human aim: ' + r);
}
console.log('35_d_balance_b12d ok');
