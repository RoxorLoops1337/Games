// cashing out at rest stops, the loss after a fall, and roads that replace each other instead of stacking
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CASH_EVERY, FALL_LOSS, ROUTES } from '../stacking_cats/cats.js';
import { newGame, rollRoutes, chooseRoute } from '../stacking_cats/sim.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok ' + name); };
const main = readFileSync(new URL('../stacking_cats/main.js', import.meta.url), 'utf8');

t('rest stop: every 5th wave offers Cash out and Keep going, and keeping going marks the run as at risk', () => {
  assert.equal(CASH_EVERY, 5);
  assert.ok(FALL_LOSS > 0 && FALL_LOSS < 1);
  assert.ok(/g\.wave % CASH_EVERY === 0 && campSeen !== g\.wave/.test(main), 'the rest stop shows once per 5th wave');
  assert.ok(/go: \(\) => \{ run\.risk = true;/.test(main) && /cash: \(\) => \{ run\.cashed = true;/.test(main));
});
t('payout: a fall after turning down a cash out keeps only part of the coins and gems, a cash out keeps all', () => {
  assert.ok(/const keep = run\.risk && !run\.cashed \? 1 - FALL_LOSS : 1;/.test(main));
  assert.ok(/run\.earned = Math\.floor\(run\.coins \* keep\)/.test(main));
  assert.ok(/run\.gems -= run\.lostGems/.test(main));
});
t('roads replace each other and never repeat back to back, so soft roads cannot be chained', () => {
  const g = newGame({ seed: 5 });
  assert.equal(g.route.id, 'trail');
  chooseRoute(g, 'meadow');
  assert.equal(g.route.enemyHp, ROUTES.find((r) => r.id === 'meadow').enemyHp, 'one road at a time, nothing multiplies');
  chooseRoute(g, 'meadow');
  assert.equal(g.route.enemyHp, ROUTES.find((r) => r.id === 'meadow').enemyHp, 'choosing it again does not compound');
  for (let i = 0; i < 60; i++) assert.ok(!rollRoutes(g).includes('meadow'), 'the road just walked is not offered again');
  const fresh = newGame({ seed: 6 });
  assert.ok(Array.from({ length: 80 }, () => rollRoutes(fresh)).some((r) => r.includes('trail')), 'before the first pick every road can appear');
});
console.log(`${n} tests passed`);
