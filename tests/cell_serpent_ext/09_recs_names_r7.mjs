// Batch 7: recommended build per species, pet nicknames (old saves keep loading), empty states.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const base = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(base, 'sim.js'));
const rec = await import(join(base, 'build_rec.js'));
const pn = await import(join(base, 'pet_names.js'));
const em = await import(join(base, 'empty_ux.js'));

for (const skin of sim.SKINS.concat(['piggy'])) {
  const r = rec.recFor(skin);
  assert.equal(r.ids.length, 3, skin + ' has three picks');
  assert.ok(r.ids.every(id => sim.WEAPONS.some(w => w.id === id)), skin + ' picks are real skills');
}
const s = sim.defaultSave();
for (const id of Object.keys(s.skills)) s.skills[id].lv = 1;
s.loadout = ['swab', 'daggers', 'tower', 'dragon', 'needles'];
const f = rec.recFit(s, 'mighty');
assert.equal(f.have, 1, 'only the cow choir fits mighty');
const best = rec.bestBuild(s, 'mighty');
assert.ok(best && best.length === sim.LOADOUT_SIZE && new Set(best).size === best.length, 'bring them keeps a unique full loadout');
assert.ok(best.includes('maw') && best.includes('stick') && best.includes('tower'), 'all owned picks are in');
s.loadout = best;
assert.equal(rec.bestBuild(s, 'mighty'), null, 'nothing to change when it already fits');
assert.ok(rec.shinesVs('maw').includes('mighty'));

// nicknames
const old = sim.sanitizeSave({ v: 8 });
assert.equal(old.petNames, undefined, 'old saves have no pet names');
assert.equal(pn.petNick(old, 'kitten'), '');
assert.ok(pn.setPetNick(old, 'kitten', '  Mochi<b>  '));
assert.equal(pn.petNick(old, 'kitten'), 'Mochib');
const back = sim.sanitizeSave(JSON.parse(JSON.stringify(old)));
assert.equal(back.petNames.kitten, 'Mochib', 'nickname survives a save round trip');
assert.deepEqual(sim.sanitizeSave({ petNames: { kitten: 5, ghost: 'x', puppy: 'Averyveryverylongname' } }).petNames, { puppy: 'Averyveryv' });
pn.setPetNick(old, 'kitten', ''); assert.equal(pn.petNick(old, 'kitten'), '', 'empty clears');
const a = pn.nextIdea(old, 'turtle'); pn.setPetNick(old, 'turtle', a); assert.notEqual(pn.nextIdea(old, 'turtle'), a, 'dice moves on');

assert.ok(em.emptyCardHTML('pets', 'Ready').includes('Nobody needs stars'));
assert.ok(em.emptyCardHTML('skills', 'Owned').length > 20);
const main = readFileSync(join(base, 'main.js'), 'utf8');
assert.ok(main.includes('renderRecStrip') && main.includes('petLabel') && (main.includes('emptyCard(') || main.includes('emptyCardUx(')), 'wired into main.js');
