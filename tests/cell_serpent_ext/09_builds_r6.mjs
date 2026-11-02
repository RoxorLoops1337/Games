// Batch 6: build names, auto-suggest build and the full-joy run emote data. Old saves keep loading.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const base = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(base, 'sim.js'));
const ux = await import(join(base, 'presets_ux.js'));

const old = sim.sanitizeSave({ v: 8, presets: [['swab'], [], []] });
assert.equal(old.presetNames, undefined, 'old saves have no names and still load');
assert.equal(ux.buildName(old, 0), 'A', 'default build names are A B C');
const nm = sim.sanitizeSave({ presetNames: ['Duet <b>', 5, 'Averyveryverylong'] });
assert.deepEqual(nm.presetNames, ['Duet b', '', 'Averyver'], 'names are cleaned and capped at 8');
assert.ok(ux.renameBuild(old, 1, '  Loud!  ')); assert.equal(ux.buildName(old, 1), 'Loud!');
ux.renameBuild(old, 1, ''); assert.equal(ux.buildName(old, 1), 'B', 'an empty name falls back');
assert.equal(ux.renameBuild(old, 3, 'x'), false);

const s = sim.defaultSave();
for (const id of ['swab', 'daggers', 'tower', 'dragon', 'needles', 'stick']) if (s.skills[id]) s.skills[id].lv = id === 'needles' ? 6 : 1;
const sug = ux.suggestBuild(s);
assert.ok(sug.length > 0 && sug.length <= sim.LOADOUT_SIZE && new Set(sug).size === sug.length, 'suggested build is unique and fits');
assert.equal(sug[0], 'needles', 'highest level first');
assert.ok(sug.every(id => s.skills[id].lv > 0), 'only owned skills');

const render = readFileSync(join(base, 'render.js'), 'utf8'), main = readFileSync(join(base, 'main.js'), 'utf8');
assert.ok(render.includes('joyEmote') && main.includes('g.petJoy'), 'full-joy emote is wired');
