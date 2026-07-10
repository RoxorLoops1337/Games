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
ok(TC.CORE_SET.every(c => typeof c.power === 'number' && c.power > 0), 'every card has a positive power stat');
ok(TC.CORE_SET.every(c => {
  const [lo, hi] = TC.TIER_POWER_RANGE[c.tier];
  return c.power >= lo && c.power <= hi;
}), 'power falls within its tier\'s range');
{
  const commonMax = TC.TIER_POWER_RANGE.common[1];
  const ultraMin = TC.TIER_POWER_RANGE.ultrarare[0];
  ok(commonMax < ultraMin, 'common\'s power ceiling stays below Ultra Rare\'s floor');
}

// ---- fresh save ----
const S = TC.freshSave();
ok(S.coins === 0 && S.packsUnopened === TC.STARTER_PACKS, 'starts with 0 coins and the starter packs');
ok(Object.keys(S.collection).length === 0, 'starts with an empty collection');

// ---- allowance ----
ok(S.day === 1, 'a fresh save starts on day 1');
ok(TC.canClaimAllowance(S) === true, 'allowance claimable on a fresh save');
const first = TC.claimAllowance(S);
ok(first === TC.ALLOWANCE_BASE, 'first claim pays the base amount, no streak bonus yet');
ok(TC.canClaimAllowance(S) === false, 'cannot claim twice the same day');
ok(TC.claimAllowance(S) === 0, 'a same-day second claim pays nothing');

// ---- the day counter, not the real calendar, drives progress ----
{
  const S10 = TC.freshSave();
  const r1 = TC.nextDay(S10);
  ok(S10.day === 2 && r1.day === 2, 'nextDay advances the in-game day, no waiting on the real clock');
  ok(TC.canClaimAllowance(S10) === true, 'allowance is claimable again on the new day');
  TC.claimAllowance(S10);
  TC.nextDay(S10);
  const bonusAfterConsecutive = TC.claimAllowance(S10);
  ok(bonusAfterConsecutive === TC.ALLOWANCE_BASE + 2, 'claiming on consecutive days grows the streak bonus');
  TC.nextDay(S10);
  TC.nextDay(S10);
  const S10streakBefore = S10.allowance.streak;
  TC.claimAllowance(S10);
  ok(S10.allowance.streak === 1 && S10streakBefore > 1, 'skipping a day resets the streak instead of continuing it');
}
{
  const S11 = TC.freshSave();
  ok(typeof TC.SUPERMARKET_CHANCE === 'number' && TC.SUPERMARKET_CHANCE > 0, 'supermarket chance is a real probability');
  let sawSupermarketPack = false;
  for (let i = 0; i < 40 && !sawSupermarketPack; i++) {
    const before = S11.packsUnopened;
    const result = TC.nextDay(S11);
    if (result.supermarketPack) sawSupermarketPack = (S11.packsUnopened === before + 1);
  }
  ok(sawSupermarketPack, 'the supermarket beat eventually grants a bonus pack, and packsUnopened reflects it');
}

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

// ---- sell all duplicates ----
{
  const S8 = TC.freshSave();
  ok(TC.duplicateValue(S8) === 0, 'no duplicate value on an empty collection');
  ok(TC.sellAllDuplicates(S8) === 0, 'selling all duplicates on an empty collection pays nothing');
  const idA = TC.CORE_SET.find(c => c.tier === 'common').id;
  const idB = TC.CORE_SET.find(c => c.tier === 'rare').id;
  S8.collection[idA] = { count: 3, reverseHolo: false };
  S8.collection[idB] = { count: 1, reverseHolo: false };
  const expected = 2 * TC.TIER_BY_KEY.common.sell;
  ok(TC.duplicateValue(S8) === expected, 'duplicate value only counts copies beyond the first');
  const gained = TC.sellAllDuplicates(S8);
  ok(gained === expected && S8.coins === expected, 'selling all duplicates pays the summed value');
  ok(S8.collection[idA].count === 1 && S8.collection[idB].count === 1, 'every card is left with exactly one copy');
  ok(TC.duplicateValue(S8) === 0, 'nothing left to sell after selling all duplicates');
}

// ---- school trading ----
{
  const S9 = TC.freshSave();
  ok(Object.keys(S9.school.wants).length === 0, 'no want-list assigned before the first school visit');
  TC.refreshSchoolIfNeeded(S9);
  ok(TC.NPCS.every(npc => S9.school.wants[npc.id]), 'every NPC gets a want assigned on first visit');
  const wantsAfterFirst = { ...S9.school.wants };
  TC.refreshSchoolIfNeeded(S9);
  ok(JSON.stringify(S9.school.wants) === JSON.stringify(wantsAfterFirst), 'wants do not change again the same day');

  const npc = TC.NPCS[0];
  const wantedId = S9.school.wants[npc.id];
  ok(TC.canFulfillTrade(S9, npc.id) === false, 'cannot fulfill a trade with no matching spare card');
  ok(TC.fulfillTrade(S9, npc.id) === null, 'fulfilling an impossible trade returns null');

  S9.collection[wantedId] = { count: 2, reverseHolo: false };
  ok(TC.canFulfillTrade(S9, npc.id) === true, 'can fulfill once a spare copy of the wanted card is owned');
  const result = TC.fulfillTrade(S9, npc.id);
  const wantedTier = TC.BY_ID[wantedId].tier;
  ok(result && result.cardId === wantedId && result.coins === TC.TRADE_PAYOUT[wantedTier], 'trade pays the tier trade rate');
  ok(S9.coins === TC.TRADE_PAYOUT[wantedTier] && S9.collection[wantedId].count === 1, 'coins granted and the spare copy consumed');
  ok(TC.canFulfillTrade(S9, npc.id) === false, 'the same NPC cannot be traded with twice the same day');
  ok(TC.fulfillTrade(S9, npc.id) === null, 'a second same-day trade with the same NPC is rejected');

  TC.nextDay(S9);
  TC.refreshSchoolIfNeeded(S9);
  ok(!S9.school.fulfilledToday[npc.id], 'advancing the day clears fulfilledToday for a fresh trade opportunity');
  ok(S9.school.wantDay === S9.day, 'the want-list is stamped with the current day');
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
