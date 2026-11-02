import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const base = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(base, 'sim.js'));
const { nextGoal, closeCall } = await import(join(base, 'result_goal.js'));

const s = sim.defaultSave();
s.beats = 0;
const poor = nextGoal(s);
assert.equal(poor.ready, false); assert.match(poor.text, /more Beats for/);
s.beats = 5000;
const rich = nextGoal(s);
assert.equal(rich.ready, true); assert.match(rich.text, /is ready/);
// cheapest affordable meta is picked
const cheapest = Math.min(...sim.META.map(d => sim.metaCost(d, 0)));
s.beats = cheapest;
assert.equal(nextGoal(s).ready, true);
assert.match(nextGoal(s).sub, new RegExp('^' + cheapest + ' Beats'));

assert.equal(closeCall({ won: true, progress: 1 }), null);
assert.equal(closeCall({ won: false, progress: 0.3, kills: 5 }), null);
assert.equal(closeCall({ won: false, progress: 0.6, kills: 5 }).title, 'ALMOST!');
assert.equal(closeCall({ won: false, progress: 0.9, kills: 5 }).title, 'SO CLOSE!');
assert.equal(closeCall({ won: false, progress: 0.9, kills: 5, mode: 'pig' }), null);
