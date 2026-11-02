// Round 9 balance report: fresh-account gates, late trait stages and counter-card sanity (fixed seeds, deterministic, a few seconds).
// Full measured table: node tests/cell_serpent_ext/balance_harness.mjs 6
import assert from 'node:assert/strict';
import * as sim from '../../cell_serpent/sim.js';
import { runs, winRate, playRun, smartBot, profileFor } from './balance_harness.mjs';

// fresh account: stage 1 is winnable with some effort, stage 2 and 3 are not (the bot is better than a thumb)
const f1 = winRate(1, {}, 6), f2 = winRate(2, {}, 4), f3 = winRate(3, {}, 6);
assert.ok(f1.win > 0 && f1.win <= 0.75, 'fresh stage 1 is a real fight: ' + f1.win);
assert.equal(f2.win, 0, 'fresh stage 2 is not cleared');
assert.equal(f3.win, 0, 'fresh stage 3 is failed');

// trait stages (21+): the profile build still makes real progress when snakes show their own behaviour
for (const st of [22, 33]) {
  const r = runs(st, profileFor(st).build, 2);
  assert.ok(r.prog >= 0.35, `typical ${profileFor(st).name} makes progress on trait stage ${st}: ${r.prog.toFixed(2)}`);
}
// the trait constants stay inside sane ranges (a trait must not double a snake's speed or stall it forever)
assert.ok(sim.SOUR_MUL > 1 && sim.SOUR_MUL <= 1.3 && sim.MIGHTY_SLOW > 0.55 && sim.MIGHTY_SLOW < 1 && sim.GRUMPY_SURGE > 0.4 && sim.GRUMPY_SURGE < 1, 'trait multipliers in range');
assert.equal(sim.TRAIT_FROM, 21, 'traits start at stage 21');
// seeded runs stay reproducible
const a = playRun(5, 321, { bot: smartBot }), b = playRun(5, 321, { bot: smartBot });
assert.deepEqual([a.won, a.progress, a.coins], [b.won, b.progress, b.coins], 'balance runs are deterministic');
console.log('31_balance_r9 ok');
