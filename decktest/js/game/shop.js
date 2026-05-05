// Shop: rolls a slate of units the player can buy.
// Tier weights shift toward higher tiers as the run progresses.
window.Decktest = window.Decktest || {};

(function () {
  const SHOP_SIZE = 5;

  // Probability of each tier appearing per slot, indexed by round.
  // Each row is [t1, t2]; sums to 1.
  const TIER_ODDS_BY_ROUND = [
    [1.00, 0.00], // (unused, rounds are 1-indexed)
    [1.00, 0.00], // round 1
    [0.85, 0.15], // round 2
    [0.70, 0.30], // round 3
    [0.55, 0.45], // round 4
    [0.45, 0.55], // round 5
    [0.35, 0.65], // round 6
    [0.30, 0.70], // round 7
    [0.25, 0.75], // round 8
  ];

  function rollTier(rng, round) {
    const odds = TIER_ODDS_BY_ROUND[Math.min(round, TIER_ODDS_BY_ROUND.length - 1)];
    const r = rng.next();
    let acc = 0;
    for (let i = 0; i < odds.length; i++) {
      acc += odds[i];
      if (r < acc) return i + 1;
    }
    return 1;
  }

  function rollOne(rng, round) {
    const tier = rollTier(rng, round);
    const pool = Decktest.units.SHOP_POOL_BY_TIER[tier]
              || Decktest.units.SHOP_POOL_BY_TIER[1];
    return rng.pick(pool);
  }

  function rollSlate(rng, round) {
    const slate = [];
    for (let i = 0; i < SHOP_SIZE; i++) slate.push(rollOne(rng, round));
    return slate;
  }

  function refreshShop(run, rng, free) {
    if (!free) {
      if (run.gold < Decktest.run.REROLL_COST) return false;
      run.gold -= Decktest.run.REROLL_COST;
    }
    run.shop = rollSlate(rng, run.round);
    return true;
  }

  function buy(run, slotIdx) {
    if (slotIdx < 0 || slotIdx >= run.shop.length) return false;
    const defId = run.shop[slotIdx];
    if (!defId) return false;
    if (!Decktest.run.benchHasRoom(run)) return false;
    const def = Decktest.units.UNIT_DEFS[defId];
    if (!def) return false;
    if (run.gold < def.cost) return false;
    run.gold -= def.cost;
    run.bench.push(defId);
    run.shop[slotIdx] = null;
    return true;
  }

  Decktest.shop = { SHOP_SIZE, refreshShop, buy, rollSlate };
})();
