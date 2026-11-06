// Round 11 skills and pets: joy badge, tappable mastery chips, build power delta, sheet scroll keep wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const b9 = await import(join(root, 'pets_b9.js'));
const b10 = await import(join(root, 'pets_b10.js'));
const pre = await import(join(root, 'presets_ux.js'));

assert.deepEqual([0, 1, 32, 33, 65, 66, 99, sim.PET_JOY_MAX].map(b9.joyTierOf), [0, 1, 1, 2, 2, 3, 3, 4]);
assert.ok(b9.joyBadgeHTML(0).includes('jt0') && b9.joyBadgeHTML(sim.PET_JOY_MAX).includes('jt4'));
assert.ok(b9.joyBadgeHTML(50).includes('Content'));

const s = sim.defaultSave(); const id = 'swab';
s.skills[id].lv = 1; s.addict.sk = { [id]: sim.SKILL_MILES[1].at };
const html = b10.masteryPathHTML(s, id);
assert.equal((html.match(/<button class="mp ready"/g) || []).length, 2, 'ready steps are buttons');
assert.ok(/data-i="0"/.test(html) && /data-i="1"/.test(html));
assert.equal(sim.claimMastery(s, 'sk:' + id, 1), true);
assert.equal((b10.masteryPathHTML(s, id).match(/<button class="mp ready"/g) || []).length, 1, 'claimed step is a done chip');

// build power compare
const o = sim.defaultSave(); o.skills.swab.lv = 1; o.skills.daggers.lv = 4; o.loadout = ['swab'];
assert.ok(pre.buildPower(o, ['daggers']) > pre.buildPower(o, ['swab']));
assert.ok(pre.buildDelta(o, ['daggers']) > 0 && pre.buildDelta(o, ['swab']) === 0 && pre.buildDelta(o, ['swab', 'daggers']) > 0);

const sheet = readFileSync(join(root, 'skill_sheet.js'), 'utf8');
assert.ok(/dataset\.key === key/.test(sheet) && /sh\.scrollTop = keep/.test(sheet), 'rebuild keeps scroll');
assert.ok(readFileSync(join(root, 'main.js'), 'utf8').includes('joyBadge(t, k.joy || 0)'));
assert.ok(!/—/.test(readFileSync(join(root, 'pets_b9.js'), 'utf8') + sheet));
