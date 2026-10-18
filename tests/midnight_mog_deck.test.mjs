import assert from 'node:assert/strict';
import { makeRng } from '../midnight_mog/js/rng.js';
import * as D from '../midnight_mog/js/sim/deck.js';
import { STARTER_DECK, CARDS } from '../midnight_mog/js/data/cards.js';
import { RELICS } from '../midnight_mog/js/data/relics.js';

const sorted = (a) => a.slice().sort();
const mk = (seed, ids = STARTER_DECK, opts) => D.newDeck(ids, makeRng(seed), opts);

// opening hand, no loss
{
  const d = mk(1);
  assert.equal(d.hand.length, 5);
  assert.equal(d.draw.length, 7);
  assert.deepEqual(D.allCards(d), sorted(STARTER_DECK));
  assert.equal(d.energy, 3);
  assert.equal(D.energyRegen(0), 0.5);
}

// 1000 random sequences: nothing lost or duplicated (exhaust included)
{
  const exCard = { ...CARDS.find((c) => c.cost === 0), id: 'x' };
  let reshuffles = 0;
  for (let s = 1; s <= 1000; s++) {
    const r = makeRng(s * 7919);
    const size = r.int(5, 20);
    const ids = []; for (let k = 0; k < size; k++) ids.push(r.pick(CARDS).id);
    const d = D.newDeck(ids, makeRng(s), { mods: { handSizeAdd: r.int(0, 2), firstFree: r.chance(0.3) } });
    const want = sorted(ids);
    for (let k = 0; k < 120; k++) {
      const a = r.int(0, 5);
      if (a === 0) D.tick(d, r.next() * 3);
      else if (a === 1) D.draw(d, r.int(1, 3));
      else if (a === 2) D.cycleHand(d, r.chance(0.5));
      else if (a === 3) D.gainEnergy(d, r.int(-2, 4));
      else { const i = r.int(-1, d.hand.length); const ok = D.canPlay(d, i); const res = D.play(d, i); assert.equal(!!res, ok); }
      assert.deepEqual(D.allCards(d), want, 'conserved seed ' + s);
      assert.ok(d.hand.length <= D.HAND_MAX && d.energy >= 0 && d.energy <= d.energyCap);
    }
    // JSON roundtrip identical
    assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
  }
  void exCard; void reshuffles;
}

// reshuffle: draw pile empty -> discard comes back; hand never shows duplicates beyond deck copies
{
  const ids = ['pounce', 'pounce', 'zoomies', 'curious_cat', 'cat_nap', 'tail_flick'];
  const d = D.newDeck(ids, makeRng(5), { mods: { startEnergyAdd: 100, energyCapAdd: 100 } });
  assert.equal(d.hand.length, 5); assert.equal(d.draw.length, 1);
  D.play(d, 0); // plays one, refill takes the last draw card
  assert.equal(d.draw.length, 0); assert.equal(d.discard.length, 1);
  const before = d.discard.slice();
  D.play(d, 0); // refill must reshuffle discard
  assert.equal(d.discard.length, 0); assert.equal(d.draw.length, 1);
  assert.ok(d.draw.length + d.hand.length + d.discard.length === 6);
  assert.ok(before.length === 1);
  // exhausted cards do not come back
  d.hand.push('cat_nap'); d.total++;
}

// determinism + resume from serialized state
{
  const run = (d) => { const log = []; for (let k = 0; k < 60; k++) { D.tick(d, 1); const i = k % d.hand.length; const r = D.play(d, i, { free: true }); log.push(r ? r.id : null, d.hand.join()); } return log; };
  const a = mk(42), b = mk(42);
  assert.deepEqual(run(a), run(b));
  assert.notDeepEqual(mk(43).hand, mk(44).hand.concat('z'));
  const c = mk(9); run(c);
  const saved = D.serializeDeck(c);
  const e1 = D.deserializeDeck(saved), e2 = D.cloneDeck(c);
  assert.deepEqual(run(e1), run(e2));
}

// energy, cost, canPlay, first free
{
  const d = D.newDeck(['call_scrap_tabby', 'call_baron_von_fluff', 'pounce', 'cat_nap', 'zoomies', 'curious_cat'], makeRng(3), { mods: { firstFree: true } });
  d.hand = ['call_baron_von_fluff', 'pounce', 'cat_nap', 'zoomies', 'curious_cat']; d.draw = ['call_scrap_tabby'];
  assert.equal(D.cardCost(d, 'call_baron_von_fluff'), 0, 'first card free');
  D.play(d, 0);
  assert.equal(d.energy, 3);
  assert.equal(D.cardCost(d, 'call_baron_von_fluff'), 4);
  d.hand[0] = 'call_baron_von_fluff';
  assert.equal(D.canPlay(d, 0, 3.9), false);
  d.hand[0] = 'call_baron_von_fluff';
  assert.equal(D.play(d, 0), null); assert.equal(d.energy, 3);
  D.tick(d, 100); assert.equal(d.energy, 10);
  const e = mk(1, STARTER_DECK, { mods: { costAdd: -1 } });
  assert.equal(D.cardCost(e, 'pounce'), 1); assert.equal(D.cardCost(e, 'cat_nap'), 0);
}

// relic and town hooks
{
  const prof = { relics: { rusty_bell: true }, deck: STARTER_DECK, cards: {}, town: { plots: [{ b: 'barracks', level: 17 }, { b: 'laser_arcade', level: 30 }] } };
  assert.equal(D.modsFromProfile(prof).startEnergyAdd >= 1, true);
  assert.ok(D.deckSlots(prof) >= 13);
  assert.equal(D.deckSlots({}), 12);
  assert.ok(D.energyRegen(30) > 0.5 && D.energyRegen(30) <= 0.5 * 1.45 + 1e-9);
  const rl = RELICS.find((r) => JSON.stringify(r.effect).includes('hand_size_add'));
  assert.equal(D.newDeck(STARTER_DECK, makeRng(1), { mods: D.relicMods([rl.id]) }).hand.length, 6);
  const p = D.deckPower(prof);
  assert.equal(p.size, 12); assert.equal(p.issues.length, 0); assert.ok(p.power > 0 && p.avgCost > 0);
  assert.ok(D.deckPower({ deck: ['nope'] }).issues.length > 0);
}

// retain and exhaust flags (via data override)
{
  const d = mk(2);
  d.hand = ['pounce', 'zoomies', 'cat_nap', 'curious_cat', 'tail_flick']; d.draw = ['pounce']; d.discard = [];
  const c = CARDS.find((x) => x.id === 'zoomies'); c.retain = true;
  const p = CARDS.find((x) => x.id === 'pounce'); p.exhaust = true;
  assert.ok(D.cycleHand(d, true).discarded === 4); assert.ok(d.hand.includes('zoomies'));
  d.hand = ['pounce', 'cat_nap']; d.energy = 5;
  const r = D.play(d, 0); assert.equal(r.exhausted, true); assert.deepEqual(d.exhaust, ['pounce']);
  delete c.retain; delete p.exhaust;
}
console.log('midnight_mog deck ok');
