// Batch 8: pet reactions per species, mastery rank ladder, collection strip, old saves still load.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const base = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(base, 'sim.js'));
const sp = await import(join(base, 'skillpets8.js'));

for (const p of sim.PETS) {
  const r = sp.PET_REACT[p.id];
  assert.ok(r && r.word && r.move && r.snd, p.id + ' has a reaction');
  assert.ok(!r.word.includes('—'), 'no em dash');
}
const s = sim.sanitizeSave({ v: 8 });
assert.ok(sp.collectionHTML(s).includes('0 / ' + sim.PETS.length + ' friends'), 'old save: no friends met');
s.pets.kitten.star = 5; s.pets.puppy.star = 1;
const h = sp.collectionHTML(s);
assert.ok(h.includes('2 / ' + sim.PETS.length) && h.includes('class="max"') && h.includes('1 with full stars'));
const lad = sp.rankLadderHTML({ rank: 2, val: 100, next: 400, name: 'Silver' });
assert.equal((lad.match(/rkm on/g) || []).length, 2, 'two medals earned');
assert.ok(lad.includes('300 damage to Gold') && lad.includes('--p:25%'));
assert.ok(sp.rankLadderHTML({ rank: 5, val: 9999, next: 0, name: 'Star' }).includes('all medals earned'));
