// 35_a QA regressions found by live screenshots (batch 12, agent a).
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const save = sim.defaultSave();
// the stage 50 win with three stars must not promise a stage 51
const t50 = sim.nudgeFor(save, { won: true, stars: 3, stage: sim.MAX_STAGE, progress: 1 });
assert.ok(t50 && !/Stage 50 is waiting|Stage 51/.test(t50), 'stage 50 three star line: ' + t50);
assert.match(sim.nudgeFor(save, { won: true, stars: 3, stage: 12, progress: 1 }), /Stage 13 is waiting/, 'other stages keep the old line');
