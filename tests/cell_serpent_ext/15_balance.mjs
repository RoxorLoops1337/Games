// 15-balance: headless balance targets (botInput + random card picks, fixed seeds, deterministic).
import assert from 'node:assert/strict';
import * as sim from '../../cell_serpent/sim.js';
import { winRate } from './balance_harness.mjs';

const N = 10;
const fresh1 = winRate(1, {}, N), fresh3 = winRate(3, {}, N);
assert.ok(fresh1.win >= 0.1 && fresh1.win <= 0.6, 'fresh account clears stage 1 sometimes: ' + fresh1.win);
assert.equal(fresh3.win, 0, 'fresh account cannot clear stage 3');
assert.ok(fresh1.prog > fresh3.prog * 0.9, 'stage 3 is not easier than stage 1 on progress');

const m5 = { atk: 5, cdn: 5, crt: 5 };
const s3 = winRate(3, m5, N), s5 = winRate(5, m5, N);
assert.ok(s3.win >= 0.4, 'a few meta levels make stage 3 clearable: ' + s3.win);
assert.ok(s5.win < s3.win, 'the stage 5 boss is a wall compared with stage 3');

// economy: a stage 1 win pays enough Beats that the first Volume levels come within a handful of runs
assert.ok(fresh1.coins >= 60, 'stage 1 pays a steady drip of Beats: ' + fresh1.coins);
const firstThree = [0, 1, 2].reduce((a, l) => a + sim.metaCost(sim.META[0], l), 0);
assert.ok(firstThree / Math.max(1, fresh1.coins) <= 4, 'three Volume levels cost about four stage 1 runs');

console.log('15_balance ok');
