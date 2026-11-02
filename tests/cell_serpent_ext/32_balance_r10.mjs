// Round 10 balance report: the informed bot (reads the cards, takes the stage's counter first) and the late-game sanity floor.
// Measured (master build, 12 seeds, informed): 38-41 ~92-100%, 42 25% (24 seeds: 38%), 45 boss 92%, 47 33% (24 seeds: 33%), 48 67%, 49 67%, 50 92%.
// The random picker reads 0-17% on 42/45/47, which is a picker artefact, not a wall, so no constants changed.
import assert from 'node:assert/strict';
import * as sim from '../../cell_serpent/sim.js';
import { runs, playRun, informedPick, profileFor } from './balance_harness.mjs';

const b45 = profileFor(45).build;
const rnd = runs(45, b45, 4), inf = runs(45, { ...b45, pick: informedPick }, 4);
assert.ok(inf.prog >= rnd.prog, `informed picks never read worse than random on the boss: ${inf.prog.toFixed(2)} vs ${rnd.prog.toFixed(2)}`);
assert.ok(inf.prog >= 0.5, 'a master build with sensible picks makes real progress on boss 45: ' + inf.prog.toFixed(2));
// the picker takes the counter card for the stage's snake when it is offered
const g = sim.createGame({ seed: 3, stage: 42 });
g.choices = [{ id: 'notes', kind: 'capsule', rarity: 3 }, { id: 'oil', kind: 'passive', rarity: 0 }, { id: 'tower', kind: 'weapon', rarity: 0, gain: 1 }];
assert.equal(informedPick(g, () => 0), 1, 'Oil Can is picked on the Rusty stage 42');
// determinism with the informed picker
const x = playRun(42, 11, { ...profileFor(42).build, pick: informedPick }), y = playRun(42, 11, { ...profileFor(42).build, pick: informedPick });
assert.deepEqual([x.won, x.progress, x.coins], [y.won, y.progress, y.coins], 'informed runs are deterministic');
console.log('32_balance_r10 ok');
