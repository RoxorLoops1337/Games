// chests sometimes hold 1 to 5 gems instead of an item; the cat roster starts with 3 cats
import assert from 'node:assert/strict';
import { STARTERS, CATS, GEM_CHANCE } from '../stacking_cats/cats.js';
import { newGame, boxPlan, openPlanned } from '../stacking_cats/sim.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok ' + name); };

t('start: only 3 cats are unlocked from the beginning and every other cat has an unlock rule', () => {
  assert.equal(STARTERS.length, 3);
  for (const c of CATS) assert.ok(STARTERS.includes(c.id) || c.unlock, c.id);
});
t('chests: some plans hold 1 to 5 gems, most hold items, and gems are added to the run', () => {
  const g = newGame({ seed: 7 });
  let gemPlans = 0, items = 0, total = 0;
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const p = boxPlan(g, ['cardboard', 'basket', 'silver', 'golden'][i % 4]);
    if (p.gems) { gemPlans++; seen.add(p.gems); assert.ok(p.gems >= 1 && p.gems <= 5); total += p.gems; openPlanned(g, p); } else items++;
  }
  assert.ok(gemPlans > 100 && gemPlans < items * 0.3, `${gemPlans} gem chests of 4000`);
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5]);
  assert.equal(g.run.boxGems, total);
  assert.ok(Object.values(GEM_CHANCE).every((x) => x > 0 && x < 0.2));
});
console.log(`${n} tests passed`);
