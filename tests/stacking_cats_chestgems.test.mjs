// chests sometimes hold 1 to 5 gems instead of an item; the cat roster starts with 3 cats
import assert from 'node:assert/strict';
import { STARTERS, CATS, GEM_CHANCE } from '../stacking_cats/cats.js';
import { newGame, boxPlan, openPlanned } from '../stacking_cats/sim.js';

let n = 0;
const jobs = [];
const t = (name, fn) => { jobs.push(Promise.resolve().then(fn).then(() => { n++; console.log('ok ' + name); })); };

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
t('crowd control: stuns shrink with tenacity, bosses cannot be stunned and a stun is followed by a short immunity', async () => {
  const { stunEnemy, tenacity, STUN_IMMUNE } = await import('../stacking_cats/sim.js');
  const plain = { stun: 0, stunCd: 0, tn: 0 }, brute = { stun: 0, stunCd: 0, tn: 0.4 }, elite = { stun: 0, stunCd: 0, tn: 0.4, elite: true }, boss = { stun: 0, stunCd: 0, tn: 0, boss: true }, immune = { stun: 0, stunCd: 1, tn: 0 };
  stunEnemy(plain, 1); stunEnemy(brute, 1); stunEnemy(elite, 1); stunEnemy(boss, 1); stunEnemy(immune, 1);
  assert.equal(plain.stun, 1);
  assert.ok(Math.abs(brute.stun - 0.6) < 1e-9);
  assert.ok(elite.stun < brute.stun && tenacity(elite) <= 0.8);
  assert.equal(boss.stun, 0);
  assert.equal(immune.stun, 0);
  assert.ok(STUN_IMMUNE >= 1);
});
await Promise.all(jobs);
console.log(`${n} tests passed`);
