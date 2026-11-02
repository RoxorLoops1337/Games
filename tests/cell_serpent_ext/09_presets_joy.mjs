// Batch 5: loadout presets, slot reorder and the pet happiness meter (cosmetic, saved).
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const base = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(base, 'sim.js'));
const ux = await import(join(base, 'presets_ux.js'));

// old saves (no presets, no joy) still load
const old = sim.sanitizeSave({ v: 8, pets: { kitten: { star: 2, frag: 1 } }, petEquip: ['kitten'] });
assert.deepEqual(old.presets, [[], [], []], 'old saves get three empty presets');
assert.equal(old.pets.kitten.joy, 0, 'old pets start shy');
// junk is cleaned
const bad = sim.sanitizeSave({ presets: [['swab', 'nope', 'swab'], 'x', null, ['daggers']], pets: { kitten: { star: 1, joy: 9999 } } });
assert.deepEqual(bad.presets[0], ['swab'], 'unknown and duplicate ids dropped');
assert.deepEqual(bad.presets[1], [], 'non arrays become empty');
assert.equal(bad.presets.length, 3, 'always exactly three');
assert.equal(bad.pets.kitten.joy, sim.PET_JOY_MAX, 'joy is clamped');

// save, load, reorder
const s = sim.defaultSave();
assert.ok(ux.savePreset(s, 1), 'save into slot B');
assert.deepEqual(s.presets[1], s.loadout);
const first = s.loadout.slice();
if (s.loadout.length >= 2) { assert.ok(ux.moveSlot(s, 0, 1)); assert.equal(s.loadout[1], first[0], 'dragged skill lands in the new slot'); }
assert.ok(ux.loadPreset(s, 1), 'load slot B');
assert.deepEqual(s.loadout, first, 'loading restores the saved order');
assert.ok(!ux.loadPreset(s, 0), 'an empty preset does not load');
s.presets[2] = ['maw']; assert.ok(!ux.loadPreset(s, 2), 'a preset with a skill you do not own does not load');
assert.ok(!ux.moveSlot(s, 0, 99), 'out of range moves are refused');

// joy fills for walking pets only, capped
const g = sim.defaultSave(); g.pets.kitten.star = 1; g.pets.puppy.star = 1; g.petEquip = ['kitten'];
const out = sim.applyResult(g, { coins: 0, kills: 0, stage: 8, won: true, frags: {} });
assert.ok(g.pets.kitten.joy > 0 && g.pets.puppy.joy === 0, 'only the walking pet gains joy');
assert.equal(out.joy.kitten[1], g.pets.kitten.joy);
for (let i = 0; i < 30; i++) sim.applyResult(g, { coins: 0, kills: 0, stage: 8, won: true, frags: {} });
assert.equal(g.pets.kitten.joy, sim.PET_JOY_MAX, 'joy caps at the max');
// the save round-trips
const back = sim.sanitizeSave(JSON.parse(JSON.stringify(g)));
assert.equal(back.pets.kitten.joy, sim.PET_JOY_MAX);
