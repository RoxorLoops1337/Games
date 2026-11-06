// Batch 13 (agent d): Gold Wall, a cosmetic Beats sink and long-term career goals. Nothing here adds power.
import assert from 'node:assert/strict';
import * as sim from '../../cell_serpent/sim.js';
import { PLAQUES, buyPlaque, plaqueReady, plaqueNext, wallTitle, careerGoals, wallTotal } from '../../cell_serpent/wall_b13d.js';
import { readFileSync } from 'node:fs';

const s = sim.defaultSave();
assert.deepEqual(s.wall, { plaques: {} });
assert.deepEqual(sim.sanitizeSave({}).wall, { plaques: {} }, 'old saves load');
assert.deepEqual(sim.sanitizeSave({ wall: { plaques: { kit: 1, evil: 1, zz: 1, pup: 0 } } }).wall.plaques, { kit: 1 });
s.beats = 1e9; assert.ok(!buyPlaque(s, 'kit'), 'closed before stage 10');
s.cleared = 10; assert.ok(!buyPlaque(s, 'pup'), 'plaques are bought in order');
const b = s.beats; assert.ok(buyPlaque(s, 'kit')); assert.equal(b - s.beats, PLAQUES[0].price);
assert.ok(!buyPlaque(s, 'kit'), 'no double buy'); assert.equal(plaqueNext(s).id, 'pup');
assert.ok(!plaqueReady(s, 'pup'), 'needs stage 15'); assert.equal(wallTitle(s), 'Kitten Star');
for (const p of PLAQUES) assert.ok(PLAQUES.indexOf(p) === 0 || p.price > PLAQUES[PLAQUES.indexOf(p) - 1].price, 'price ladder rises');
assert.ok(wallTotal() > 3e6, 'a long goal');
// cosmetic: the player a run starts with is identical with and without plaques
const a = JSON.stringify(sim.makePlayer(s.meta)), c = JSON.stringify(sim.makePlayer(sim.defaultSave().meta));
assert.equal(a, c, 'plaques add no power');
const g = careerGoals(s); assert.equal(g.length, 5); assert.ok(g.every(x => x.frac >= 0 && x.frac <= 1));
assert.ok(readFileSync(new URL('../../cell_serpent/hub2.js', import.meta.url), 'utf8').includes('wallCard(s'), 'wired into Stats');
assert.ok(!/—/.test(readFileSync(new URL('../../cell_serpent/wall_b13d.js', import.meta.url), 'utf8')), 'no em dash');
