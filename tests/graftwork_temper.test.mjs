// Temper: hammering a card's patches into the card keeps their effect, frees the slots, and keeps the deck's leash intact.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import { cardSpec, instWeight, isBare, canGraft, canTemper, strainInfo, FUSE_CAP, fusedWeight } from '../graftwork/engine/cards.js';
import { cardLines, priceLines } from '../graftwork/engine/text.js';
import { GRAFTS } from '../graftwork/data/index.js';
import { newCombat, specOf } from '../graftwork/engine/combat.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
function fresh(seed = 'temper') {
  const run = RUN.newRun({ hero: 'marrow', seed });
  run.phase = 'forge'; run.pending = { kind: 'forge', used: 0 };
  return run;
}
const sew = (run, inst, ...ids) => { for (const id of ids) assert.ok(RUN.applyGraft(run, inst.uid, id, { keepPhase: true, free: true }).ok, 'sewn ' + id); };
const heavy = Object.values(GRAFTS).filter((g) => g.weight >= 2).map((g) => g.id);

t('tempering keeps the boon and the price but empties the patch slots', () => {
  const run = fresh(); const inst = run.deck.find((c) => c.id === 'm_incision');
  sew(run, inst, 'g_quick_hands', 'g_hollow_bone');
  const before = cardSpec(inst), textBefore = cardLines(before).join('|'), priceBefore = priceLines(before).join('|');
  assert.deepEqual(RUN.forgeAct(run, 'temper', inst.uid), { ok: true });
  const after = cardSpec(inst);
  assert.deepEqual(inst.grafts, [], 'no live patches');
  assert.deepEqual(inst.fused, ['g_quick_hands', 'g_hollow_bone']);
  assert.equal(cardLines(after).join('|'), textBefore, 'same rules text');
  assert.equal(priceLines(after).join('|'), priceBefore, 'the price did not go away');
  assert.equal(after.cost, before.cost); assert.deepEqual(after.flags, before.flags);
});
t('new grafts fit again, but the same graft cannot be sewn twice', () => {
  const run = fresh(); const inst = run.deck[0];
  sew(run, inst, 'g_quick_hands'); RUN.forgeAct(run, 'temper', inst.uid);
  assert.equal(canGraft(inst, 'g_quick_hands'), false, 'already part of the card');
  const other = Object.keys(GRAFTS).find((id) => id !== 'g_quick_hands' && canGraft(inst, id));
  assert.ok(other, 'something else fits');
  sew(run, inst, other); assert.equal(inst.grafts.length, 1);
});
t('a tempered card is no longer Bare, so the Tithe will not land on it', () => {
  const run = fresh(); const inst = run.deck[0];
  assert.equal(isBare(inst), true); sew(run, inst, 'g_quick_hands'); RUN.forgeAct(run, 'temper', inst.uid);
  assert.equal(isBare(inst), false);
  assert.ok(!strainInfo(run).tithed.includes(inst.uid));
});
t('each tempered graft weighs 1 less, never under 1', () => {
  const run = fresh(); const inst = run.deck[0];
  const g = heavy.find((id) => canGraft(inst, id)); assert.ok(g, 'a weight 2+ graft fits');
  sew(run, inst, g);
  const w0 = instWeight(inst); RUN.forgeAct(run, 'temper', inst.uid);
  assert.equal(instWeight(inst), fusedWeight(g)); assert.equal(fusedWeight(g), GRAFTS[g].weight - 1); assert.ok(instWeight(inst) < w0);
  assert.equal(fusedWeight('g_quick_hands'), 1, 'a weight 1 graft stays at 1');
});
t('tempering an Overload removes the x1.5 and the Shatter roll', () => {
  const run = fresh(); const inst = run.deck.find((c) => c.id === 'm_bonesaw');
  const ids = Object.keys(GRAFTS).filter((id) => canGraft(inst, id)).slice(0, 3);
  for (const id of ids) { inst.grafts.push(id); }
  assert.equal(cardSpec(inst).overload, true);
  RUN.forgeAct(run, 'temper', inst.uid);
  assert.equal(cardSpec(inst).overload, false);
  // in combat the card now fights with no Shatter risk, over many seeds
  for (let i = 0; i < 40; i++) {
    const r2 = fresh('shatter' + i); const c0 = r2.deck.find((c) => c.id === 'm_bonesaw'); c0.fused = ids.slice(); c0.grafts = [];
    const c = newCombat(r2, ['bedpan_slime']);
    const w = [...c.hand, ...c.drawPile].find((k) => k.inst.id === 'm_bonesaw');
    assert.equal(specOf(c, w).overload, false);
  }
});
t('a tempered graft cannot be stripped, and a card holds at most FUSE_CAP of them', () => {
  const run = fresh(); const inst = run.deck[0];
  sew(run, inst, 'g_quick_hands'); RUN.forgeAct(run, 'temper', inst.uid);
  assert.equal(RUN.stripGraft(run, inst.uid, 'g_quick_hands'), false, 'permanent');
  inst.fused = ['a', 'b', 'c', 'd'].slice(0, FUSE_CAP); inst.grafts = ['g_hollow_bone'];
  assert.equal(canTemper(inst), false, 'over the cap');
});
t('only a card with live patches can be tempered, and junk never', () => {
  const run = fresh();
  assert.equal(canTemper(run.deck[0]), false, 'no patches');
  assert.deepEqual(RUN.forgeAct(run, 'temper', run.deck[0].uid), { ok: false });
});
t('tempered grafts survive a save and still count toward a school Resonance', () => {
  const run = fresh(); const inst = run.deck[0]; sew(run, inst, 'g_quick_hands'); RUN.forgeAct(run, 'temper', inst.uid);
  const back = RUN.deserializeRun(RUN.serializeRun(run));
  assert.deepEqual(back.deck[0].fused, ['g_quick_hands']);
  assert.equal(RUN.resonance(back).counts[GRAFTS.g_quick_hands.school], 1);
});
console.log(`graftwork_temper ok ${n}`);
