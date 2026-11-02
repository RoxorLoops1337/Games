// Batch 5 retention: streak shield gift at 7 and 14 spin days, forgives one missed day, old saves load.
import assert from 'node:assert/strict';
import * as S from '../../cell_serpent/sim.js';
const day = 20000;
{
  const s = S.defaultSave ? S.defaultSave() : S.sanitizeSave({});
  let gifts = 0;
  for (let d = 0; d < 7; d++) { const r = S.doSpin(s, day + d); if (r.gift) gifts++; assert.equal(r.gift, d === 6); }
  assert.equal(gifts, 1); assert.ok(S.hasShield(s));
  // miss one day: shield keeps the streak and is used up
  const r = S.doSpin(s, day + 8); assert.ok(r.saved); assert.equal(s.addict.spin.n, 8); assert.ok(!S.hasShield(s));
  // miss one day again without a shield: streak resets
  assert.equal(S.spinStreak(s, day + 10), 0); S.doSpin(s, day + 10); assert.equal(s.addict.spin.n, 1);
  // a long gap resets even with a shield
  const t = S.sanitizeSave({}); t.addict.spin = { day, prize: 0, n: 5, shield: 1 }; S.doSpin(t, day + 4); assert.equal(t.addict.spin.n, 1);
  // second gift at 14
  const u = S.sanitizeSave({}); for (let d = 0; d < 14; d++) S.doSpin(u, day + d); assert.ok(S.hasShield(u));
  // old saves without a shield field load as no shield
  const old = S.sanitizeSave({ addict: { spin: { day: 3, prize: 1, n: 4 } } }); assert.equal(old.addict.spin.shield, 0);
  assert.equal(S.sanitizeSave({ addict: { spin: { day: 3, prize: 1, n: 4, shield: 1 } } }).addict.spin.shield, 1);
}
console.log('23_retention_r5 ok');
