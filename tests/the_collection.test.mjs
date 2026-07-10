// The Collection — logic tests for the card-collecting sim.
import { loadTC } from './the_collection_lib.mjs';

const TC = loadTC();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  FAIL:', msg); } };

// ---- surface + data ----
ok(TC && typeof TC.freshSave === 'function', 'TC surface exposed');
ok(TC.CORE_SET.length === 100, 'core set has 100 cards');
ok(new Set(TC.CORE_SET.map(c => c.id)).size === 100, 'card ids are unique');
{
  const counts = {};
  TC.CORE_SET.forEach(c => { counts[c.tier] = (counts[c.tier] || 0) + 1; });
  ok(JSON.stringify(counts) === JSON.stringify(TC.TIER_COUNTS) || Object.keys(TC.TIER_COUNTS).every(k => counts[k] === TC.TIER_COUNTS[k]), 'tier distribution matches TIER_COUNTS');
}
ok(TC.CORE_SET.every(c => c.name && c.type && c.flavor), 'every card has a name, type and flavor');

// ---- fresh save ----
const S = TC.freshSave();
ok(S.coins === 0 && S.packsUnopened === TC.STARTER_PACKS, 'starts with 0 coins and the starter packs');
ok(Object.keys(S.collection).length === 0, 'starts with an empty collection');

// ---- allowance ----
ok(TC.canClaimAllowance(S) === true, 'allowance claimable on a fresh save');
const first = TC.claimAllowance(S);
ok(first === TC.ALLOWANCE_BASE, 'first claim pays the base amount, no streak bonus yet');
ok(TC.canClaimAllowance(S) === false, 'cannot claim twice the same day');
ok(TC.claimAllowance(S) === 0, 'a same-day second claim pays nothing');

// ---- kiosk economy ----
{
  const S2 = TC.freshSave();
  ok(TC.buyPack(S2) === false, 'cannot buy a pack with 0 coins');
  S2.coins = TC.PACK_PRICE;
  const before = S2.packsUnopened;
  ok(TC.buyPack(S2) === true, 'buying a pack succeeds with enough coins');
  ok(S2.coins === 0 && S2.packsUnopened === before + 1, 'coins spent, pack added');
}

// ---- pack opening ----
{
  const S3 = TC.freshSave();
  const rand = TC.seededRandom('test-pack-1');
  const pulls = TC.openPack(S3, rand);
  ok(Array.isArray(pulls) && pulls.length === 5, 'a pack yields 5 cards');
  ok(S3.packsUnopened === TC.STARTER_PACKS - 1 && S3.packsOpenedTotal === 1, 'opening a pack consumes it and tallies the total');
  ok(Object.keys(S3.collection).length === new Set(pulls.map(p => p.id)).size, 'collection reflects the pulled cards');
  ok(TC.openPack(Object.assign(TC.freshSave(), { packsUnopened: 0 }), rand) === null, 'opening with no packs left returns null');
}

// ---- pity ----
{
  const S4 = TC.freshSave();
  S4.packsUnopened = 999;
  const rand = TC.seededRandom('pity-check');
  let sawRareHoloPlus = false;
  for (let i = 0; i < TC.HARD_PITY_RAREHOLO; i++) {
    const pulls = TC.openPack(S4, rand);
    const hit = pulls[pulls.length - 1];
    if (['rareholo', 'doublerare', 'ultrarare'].includes(hit.tier)) sawRareHoloPlus = true;
  }
  ok(sawRareHoloPlus, 'hard pity guarantees a Rare Holo+ within the pity window');
}
{
  const S5 = TC.freshSave();
  S5.packsUnopened = 999;
  const rand = TC.seededRandom('ultra-pity-check');
  let sawUltra = false;
  for (let i = 0; i < TC.HARD_PITY_ULTRARARE; i++) {
    const pulls = TC.openPack(S5, rand);
    if (pulls[pulls.length - 1].tier === 'ultrarare') sawUltra = true;
  }
  ok(sawUltra, 'hard pity guarantees an Ultra Rare within its pity window');
}

// ---- selling duplicates ----
{
  const S6 = TC.freshSave();
  const someId = TC.CORE_SET[0].id;
  ok(TC.sellDuplicate(S6, someId) === 0, 'cannot sell a card you do not own');
  S6.collection[someId] = { count: 2, reverseHolo: false };
  const gained = TC.sellDuplicate(S6, someId);
  ok(gained === TC.TIER_BY_KEY[TC.CORE_SET[0].tier].sell, 'selling pays the tier sell value');
  ok(S6.collection[someId].count === 1, 'selling consumes one duplicate');
  ok(TC.sellDuplicate(S6, someId) === 0, 'cannot sell your last copy');
}

// ---- completion ----
{
  const S7 = TC.freshSave();
  ok(TC.completionFraction(S7) === 0, 'completion starts at 0');
  S7.collection[TC.CORE_SET[0].id] = { count: 1, reverseHolo: false };
  ok(Math.abs(TC.completionFraction(S7) - 1 / 100) < 1e-9, 'completion reflects one owned card out of 100');
}

// ---- determinism ----
{
  const rA = TC.seededRandom('same-seed');
  const rB = TC.seededRandom('same-seed');
  const seqA = [rA(), rA(), rA()];
  const seqB = [rB(), rB(), rB()];
  ok(JSON.stringify(seqA) === JSON.stringify(seqB), 'seededRandom is deterministic for the same seed');
}

console.log(`the_collection: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
