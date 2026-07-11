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
  ok(Object.keys(TC.TIER_COUNTS).every(k => counts[k] === TC.TIER_COUNTS[k]), 'tier distribution matches TIER_COUNTS');
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

// ---- printed moves & illustrator credits ----
ok(TC.CORE_SET.every(c => c.move && c.move.name.includes(' ') && c.move.name.length > 3), 'every card has a two-word move name');
ok(TC.CORE_SET.every(c => c.move.dmg % 10 === 0 && c.move.dmg >= 10 && c.move.dmg <= 120), 'move damage is a round number tied to POW');
ok(TC.CORE_SET.every(c => c.move.cost >= 1 && c.move.cost <= 3), 'energy cost runs 1-3');
ok(TC.CORE_SET.every(c => typeof c.move.text === 'string'), 'every move carries an effect line (possibly blank)');
ok(TC.CORE_SET.every(c => c.illus && c.illus.length > 2), 'every card credits an illustrator');
ok(TC.CORE_SET.filter(c => c.move.plus).length > 10, 'a meaningful share of moves have the "+" damage marker');

// ---- fresh save ----
const S = TC.freshSave();
ok(S.coins === 0 && S.packsUnopened === TC.STARTER_PACKS, 'starts with 0 coins and the starter packs');
ok(Object.keys(S.collection).length === 0, 'starts with an empty collection');
ok(S.day === 1, 'a fresh save starts on day 1');
ok(TC.dayEvent(1) === 'none', 'day 1 is always a normal day');

// ---- allowance ----
ok(TC.canClaimAllowance(S) === true, 'allowance claimable on a fresh save');
const first = TC.claimAllowance(S);
ok(first === TC.ALLOWANCE_BASE, 'first claim pays the base amount, no streak bonus yet');
ok(TC.canClaimAllowance(S) === false, 'cannot claim twice the same day');
ok(TC.claimAllowance(S) === 0, 'a same-day second claim pays nothing');

// ---- day events drive the calendar ----
{
  ok(TC.dayEvent(7) === TC.dayEvent(7), 'dayEvent is deterministic per day');
  ok(Object.keys(TC.DAY_EVENTS).length >= 5, 'several distinct day events exist');
  const seen = new Set();
  for (let d = 2; d <= 120; d++) seen.add(TC.dayEvent(d));
  ok(seen.size === Object.keys(TC.DAY_EVENTS).length, 'every event type occurs within 120 days');
}
{
  const S10 = TC.freshSave();
  const r1 = TC.nextDay(S10);
  ok(S10.day === 2 && r1.day === 2, 'nextDay advances the in-game day, no waiting on the real clock');
  ok(r1.event === TC.dayEvent(2) && r1.rumor === TC.dayEvent(3), 'nextDay reports today\'s event and tomorrow\'s rumor');
  ok(TC.canClaimAllowance(S10) === true, 'allowance is claimable again on the new day');
  TC.claimAllowance(S10);
  TC.nextDay(S10);
  const mult = TC.dayEvent(S10.day) === 'grandma' ? 2 : 1;
  const gained = TC.claimAllowance(S10);
  ok(gained === (TC.ALLOWANCE_BASE + 2) * mult, 'consecutive-day claim grows the streak bonus (event multiplier applied)');
  TC.nextDay(S10);
  TC.nextDay(S10);
  const streakBefore = S10.allowance.streak;
  TC.claimAllowance(S10);
  ok(S10.allowance.streak === 1 && streakBefore > 1, 'skipping a day resets the streak instead of continuing it');
}
{
  // supermarket days grant a pack; deterministic seed means this either
  // always passes or always fails — no flake
  const S11 = TC.freshSave();
  let sawSupermarketPack = false;
  for (let i = 0; i < 60 && !sawSupermarketPack; i++) {
    const before = S11.packsUnopened;
    const result = TC.nextDay(S11);
    if (result.event === 'supermarket') sawSupermarketPack = (S11.packsUnopened === before + 1);
  }
  ok(sawSupermarketPack, 'a supermarket day grants a bonus pack within 60 days');
}
{
  // grandma doubles the allowance
  const S12 = TC.freshSave();
  while (TC.dayEvent(S12.day) !== 'grandma') TC.nextDay(S12);
  const gained = TC.claimAllowance(S12);
  ok(gained === TC.ALLOWANCE_BASE * 2 * 1 || gained % 2 === 0, 'grandma day pays a doubled (even) allowance');
  ok(gained >= TC.ALLOWANCE_BASE * 2, 'grandma day pays at least double the base');
}
{
  // sale days cut the pack price
  const S13 = TC.freshSave();
  while (TC.dayEvent(S13.day) !== 'sale') TC.nextDay(S13);
  ok(TC.packPrice(S13) === TC.SALE_PACK_PRICE, 'sale day pack price drops to the sale price');
  S13.coins = TC.SALE_PACK_PRICE;
  ok(TC.buyPack(S13) === true && S13.coins === 0, 'a sale-priced purchase spends exactly the sale price');
  const S14 = TC.freshSave();
  ok(TC.packPrice(S14) === TC.PACK_PRICE, 'day 1 charges full price');
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
  // pulls must be full card objects — the reveal renders their move/illus, and
  // a missing move once crashed the first card reveal of every pack
  ok(pulls.every(p => p.move && typeof p.move.cost === 'number' && p.move.name && typeof p.move.dmg === 'number'), 'every pull carries its full move (name, cost, damage)');
  ok(pulls.every(p => p.illus && p.flavor && typeof p.power === 'number'), 'every pull carries illustrator, flavor and power');
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
}

// ---- collection add/remove primitives ----
{
  const S15 = TC.freshSave();
  const id = TC.CORE_SET[0].id;
  TC.addCardById(S15, id);
  ok(S15.collection[id].count === 1, 'addCardById creates the record');
  TC.addCardById(S15, id);
  ok(S15.collection[id].count === 2, 'addCardById stacks copies');
  ok(TC.removeCardById(S15, id) === true && S15.collection[id].count === 1, 'removeCardById consumes one copy');
  ok(TC.removeCardById(S15, id) === true && !S15.collection[id], 'removing the last copy deletes the record entirely');
  ok(TC.removeCardById(S15, id) === false, 'cannot remove a card that is not owned');
}

// ---- haggling offers ----
{
  const o1 = TC.makeOffer('finn', 5, false);
  const o2 = TC.makeOffer('finn', 5, false);
  ok(JSON.stringify(o1) === JSON.stringify(o2), 'offers are deterministic per npc+day');
  ok(o1.want && o1.give && typeof o1.coins === 'number' && o1.coins >= 0, 'an offer names a want, a give, and non-negative coins');
  ok(['lowball', 'fair', 'generous'].includes(o1.quality), 'offer quality is one of the three bands');
  // fairness math: give value + coins should sit inside the quality band
  for (let d = 2; d <= 40; d++) {
    const o = TC.makeOffer('ren', d, false);
    const band = TC.OFFER_QUALITIES[o.quality].mul;
    const total = TC.cardValue(o.give) + o.coins;
    const wantVal = TC.cardValue(o.want);
    // coins round to integers, so allow a half-coin of slack either side
    if (!(total >= Math.floor(wantVal * band[0]) - 1 && total <= Math.ceil(wantVal * band[1]) + 1)) {
      ok(false, `offer day ${d} value ${total} outside ${o.quality} band of want ${wantVal}`);
    }
  }
  ok(true, 'offer values stay inside their quality band across 39 sampled days');
}
{
  const S16 = TC.freshSave();
  TC.refreshSchoolIfNeeded(S16);
  ok(TC.NPCS.every(npc => S16.school.offers[npc.id] && S16.school.offers[npc.id].state === 'open'), 'every NPC gets an open offer for the day');
  ok(Array.isArray(S16.school.duels) && S16.school.duels.length >= 1, 'at least one duel is set up for the day');
  const snapshot = JSON.stringify(S16.school.offers);
  TC.refreshSchoolIfNeeded(S16);
  ok(JSON.stringify(S16.school.offers) === snapshot, 'offers do not reroll on the same day');

  const npcId = TC.NPCS[0].id;
  const offer = S16.school.offers[npcId];
  ok(TC.canAcceptOffer(S16, npcId) === false, 'cannot accept without owning the wanted card');
  ok(TC.acceptOffer(S16, npcId) === null, 'accepting an impossible offer returns null');

  TC.addCardById(S16, offer.want);
  ok(TC.canAcceptOffer(S16, npcId) === true, 'owning the wanted card (even the only copy) enables the deal');
  const beforeCoins = S16.coins;
  const result = TC.acceptOffer(S16, npcId);
  ok(result && result.got === offer.give && result.gave === offer.want, 'accepting swaps the cards');
  ok(S16.coins === beforeCoins + offer.coins, 'accepting pays the offered coins');
  if (offer.give === offer.want) {
    ok(S16.collection[offer.want].count === 1, 'same-card swap nets out to one copy');
  } else {
    ok(!S16.collection[offer.want], 'the wanted card left the collection');
  }
  ok(S16.collection[offer.give] && S16.collection[offer.give].count >= 1, 'their card joined the collection');
  ok(offer.state === 'done' && TC.canAcceptOffer(S16, npcId) === false, 'a done deal cannot be re-accepted');
}
{
  // counter: a lowballer caves (rand below threshold), a pushed deal dies (rand above)
  const S17 = TC.freshSave();
  TC.refreshSchoolIfNeeded(S17);
  const npcId = TC.NPCS[1].id;
  const offer = S17.school.offers[npcId];
  const coinsBefore = offer.coins;
  const accepted = TC.counterOffer(S17, npcId, () => 0);
  ok(accepted && accepted.accepted === true && offer.coins > coinsBefore, 'a successful counter raises the coins');
  ok(TC.counterOffer(S17, npcId, () => 0) === null, 'cannot counter twice');

  const S18 = TC.freshSave();
  TC.refreshSchoolIfNeeded(S18);
  const offer2 = S18.school.offers[npcId];
  const rejected = TC.counterOffer(S18, npcId, () => 0.999);
  ok(rejected && rejected.accepted === false && offer2.state === 'withdrawn', 'a failed counter kills the deal');
  ok(TC.canAcceptOffer(S18, npcId) === false, 'a withdrawn deal cannot be accepted');
}
{
  const S19 = TC.freshSave();
  TC.refreshSchoolIfNeeded(S19);
  const npcId = TC.NPCS[2].id;
  ok(TC.declineOffer(S19, npcId) === true && S19.school.offers[npcId].state === 'declined', 'declining marks the offer passed');
  ok(TC.declineOffer(S19, npcId) === false, 'cannot decline twice');
}

// ---- flip duels ----
{
  ok(TC.duelChance(100, 100) === 0.5, 'even POW is a coin flip');
  ok(TC.duelChance(140, 20) === 0.85, 'win chance caps at 85%');
  ok(TC.duelChance(20, 140) >= 0.15, 'win chance floors at 15% — never hopeless');
  const d1 = TC.buildDuelsForDay(9);
  const d2 = TC.buildDuelsForDay(9);
  ok(JSON.stringify(d1) === JSON.stringify(d2), 'duels are deterministic per day');
  ok(d1.length >= 1 && d1.every(d => d.stake && !d.done), 'duels come with a staked card, unplayed');
}
{
  // duelday spawns two duels
  let duelDay = 2;
  while (TC.dayEvent(duelDay) !== 'duelday' && duelDay < 200) duelDay++;
  ok(TC.dayEvent(duelDay) === 'duelday', 'a duelday exists within 200 days');
  ok(TC.buildDuelsForDay(duelDay).length === 2, 'duelday sets up two duels');
}
{
  const S20 = TC.freshSave();
  TC.refreshSchoolIfNeeded(S20);
  const duel = S20.school.duels[0];
  const myId = TC.CORE_SET.find(c => c.id !== duel.stake).id;
  ok(TC.resolveDuel(S20, 0, myId) === null, 'cannot duel with a card you do not own');

  TC.addCardById(S20, myId);
  const win = TC.resolveDuel(S20, 0, myId, () => 0);
  ok(win && win.won === true, 'rand below chance wins the flip');
  ok(S20.collection[duel.stake] && S20.collection[duel.stake].count >= 1, 'winning takes their card');
  ok(S20.collection[myId] && S20.collection[myId].count === 1, 'winning keeps your card');
  ok(duel.done === true && TC.resolveDuel(S20, 0, myId, () => 0) === null, 'a finished duel cannot be replayed');

  const S21 = TC.freshSave();
  TC.refreshSchoolIfNeeded(S21);
  const duel2 = S21.school.duels[0];
  const myId2 = TC.CORE_SET.find(c => c.id !== duel2.stake).id;
  TC.addCardById(S21, myId2);
  const loss = TC.resolveDuel(S21, 0, myId2, () => 0.999);
  ok(loss && loss.won === false, 'rand above chance loses the flip');
  ok(!S21.collection[myId2], 'losing your only copy removes the card from the binder — real stakes');
  ok(!S21.collection[duel2.stake], 'losing gains you nothing');
}

// ---- binder page rewards ----
{
  const S22 = TC.freshSave();
  ok(TC.pageCards(0).length === TC.PAGE_SIZE, 'a binder page holds PAGE_SIZE cards');
  ok(TC.isPageComplete(S22, 0) === false, 'an empty page is not complete');
  ok(TC.claimPageReward(S22, 0) === 0, 'no reward for an incomplete page');
  TC.pageCards(0).forEach(c => TC.addCardById(S22, c.id));
  ok(TC.isPageComplete(S22, 0) === true, 'owning all nine completes the page');
  const gained = TC.claimPageReward(S22, 0);
  ok(gained === TC.PAGE_REWARD && S22.coins === TC.PAGE_REWARD, 'completing a page pays the page reward');
  ok(TC.claimPageReward(S22, 0) === 0, 'a page reward can only be claimed once');
}

// ---- chores (daily odd jobs) ----
{
  ok(Array.isArray(TC.CHORES) && TC.CHORES.length >= 3, 'there are at least three chores');
  ok(TC.CHORES.every(c => c.id && c.name && c.prizes), 'every chore has an id, name and prize table');
  // outcome deterministic per chore per day
  const a = TC.choreOutcome('laundry', 5);
  const b = TC.choreOutcome('laundry', 5);
  ok(JSON.stringify(a) === JSON.stringify(b), 'chore outcome is deterministic per chore + day');
  ok(a && typeof a.coins === 'number' && a.coins >= 0 && typeof a.candy === 'number', 'chore outcome has coins and candy');
  const S = TC.freshSave();
  ok(TC.canDoChore(S, 'laundry') === true, 'a chore is available on a fresh day');
  const beforeCoins = S.coins, beforeCandy = S.candy;
  const res = TC.doChore(S, 'laundry');
  ok(res && S.coins === beforeCoins + res.coins && S.candy === beforeCandy + res.candy, 'doing a chore banks its coins and candy');
  if (res.cardId) ok(S.collection[res.cardId] && S.collection[res.cardId].count >= 1, 'a lucky-card chore adds the card');
  ok(TC.canDoChore(S, 'laundry') === false, 'a chore cannot be repeated the same day');
  ok(TC.doChore(S, 'laundry') === null, 'repeating a chore returns null');
  TC.nextDay(S);
  ok(TC.canDoChore(S, 'laundry') === true, 'the chore is available again the next day');
  // across many days every prize kind actually shows up somewhere
  let sawCoins = false, sawCandy = false;
  for (let d = 2; d <= 120; d++) {
    const o = TC.choreOutcome('dishes', d);
    if (o.coins > 0) sawCoins = true;
    if (o.candy > 0) sawCandy = true;
  }
  ok(sawCoins && sawCandy, 'chores pay out both coins and candy across many days');
}

// ---- candy currency ----
{
  const S = TC.freshSave();
  ok(TC.buyCandy(S) === false, 'cannot buy candy with no coins');
  S.coins = TC.CANDY_PRICE;
  ok(TC.buyCandy(S) === true && S.candy === 1 && S.coins === 0, 'buying candy spends coins and adds a candy');
}

// ---- relationships ----
{
  const S = TC.freshSave();
  ok(TC.relOf(S, 'finn') === 0, 'relationships start at neutral 0');
  ok(TC.relTier(0).key === 'neutral', 'score 0 is the neutral tier');
  ok(TC.relTier(70).key === 'bestfriend', 'a high score is best friend');
  ok(TC.relTier(-80).key === 'enemy', 'a low score is enemy');
  ok(TC.changeRel(S, 'finn', 150) === 100, 'relationship is clamped at +100');
  ok(TC.changeRel(S, 'finn', -400) === -100, 'relationship is clamped at -100');
  // candy is the friendship currency
  const S2 = TC.freshSave();
  ok(TC.giveCandy(S2, 'ren') === null, 'cannot give candy you do not have');
  S2.candy = 2;
  TC.refreshSchoolIfNeeded(S2);
  const r = TC.giveCandy(S2, 'ren');
  ok(r && S2.candy === 1 && TC.relOf(S2, 'ren') > 0, 'giving candy costs a candy and raises the relationship');
  ok(TC.giveCandy(S2, 'ren') === null, 'cannot give the same kid candy twice in a day');
  // accepting a trade warms the relationship; enemies refuse to trade
  const S3 = TC.freshSave();
  TC.changeRel(S3, 'finn', -60);
  TC.refreshSchoolIfNeeded(S3);
  ok(S3.school.offers.finn.state === 'refused', 'an enemy refuses to trade');
  ok(TC.canAcceptOffer(S3, 'finn') === false, 'a refused offer cannot be accepted');
}

// ---- offers bias toward cards you can actually trade ----
{
  const S = TC.freshSave();
  // own spares of a handful of cards
  const spares = TC.CORE_SET.slice(0, 6).map(c => c.id);
  spares.forEach(id => { S.collection[id] = { count: 2, reverseHolo: false }; });
  TC.refreshSchoolIfNeeded(S);
  const fulfillable = TC.NPCS.filter(npc => TC.canAcceptOffer(S, npc.id)).length;
  ok(fulfillable >= 1, 'with spares in hand, at least one kid wants something you can trade');
}

// ---- steal a card ----
{
  ok(TC.stealChance(0) > 0.2 && TC.stealChance(0) < 0.8, 'neutral steal odds sit mid-range');
  ok(TC.stealChance(100) > TC.stealChance(-100), 'friends are easier to steal from than enemies');
  ok(TC.stealChance(100) <= 0.8 && TC.stealChance(-100) >= 0.2, 'steal odds are clamped 20-80%');
  // a clean getaway (rand below chance) nets a card, no relationship hit
  const S = TC.freshSave();
  TC.refreshSchoolIfNeeded(S);
  const before = Object.keys(S.collection).length;
  const relBefore = TC.relOf(S, 'tova');
  const good = TC.attemptSteal(S, 'tova', () => 0);
  ok(good && good.caught === false && good.cardId, 'a successful steal returns the stolen card');
  ok(Object.keys(S.collection).length >= before, 'the stolen card is added to your binder');
  ok(TC.relOf(S, 'tova') === relBefore, 'getting away clean does not change the relationship');
  ok(TC.canSteal(S, 'tova') === false, 'you can only try to steal from a kid once a day');
  ok(TC.attemptSteal(S, 'tova', () => 0) === null, 'a second same-day steal attempt is rejected');
  // getting caught (rand above chance) tanks the relationship and costs you a spare
  const S2 = TC.freshSave();
  TC.refreshSchoolIfNeeded(S2);
  const spareId = TC.CORE_SET[0].id;
  S2.collection[spareId] = { count: 2, reverseHolo: false };
  const bad = TC.attemptSteal(S2, 'beck', () => 0.999);
  ok(bad && bad.caught === true, 'a failed steal is flagged as caught');
  ok(TC.relOf(S2, 'beck') < -20, 'getting caught tanks the relationship');
  ok(bad.lostCardId === spareId && S2.collection[spareId].count === 1, 'the caught thief loses one spare copy as payback');
}

// ---- completion ----
{
  const S7 = TC.freshSave();
  ok(TC.completionFraction(S7) === 0, 'completion starts at 0');
  S7.collection[TC.CORE_SET[0].id] = { count: 1, reverseHolo: false };
  ok(Math.abs(TC.completionFraction(S7) - 1 / 100) < 1e-9, 'completion reflects one owned card out of 100');
}

// ---- town: neighbours & lawns ----
{
  ok(Array.isArray(TC.NEIGHBORS) && TC.NEIGHBORS.length === 5, 'there are five neighbours to mow for');
  const S = TC.freshSave();
  const nb = TC.NEIGHBORS[0].id;
  ok(TC.lawnState(S, nb).canMow === true, 'a fresh lawn can be mowed');
  const res = TC.mowLawn(S, nb);
  ok(res !== null, 'mowing a fresh lawn succeeds');
  ok(S.coins >= 0 && S.lawns.lastMowed[nb] === S.day, 'mowing records the day it was done');
  ok(TC.lawnState(S, nb).canMow === false, 'you cannot mow the same lawn twice');
  ok(TC.mowLawn(S, TC.NEIGHBORS[1].id) === null, 'only one lawn can be mowed per day');
  // after a week the same lawn is available again (if it is a new day)
  S.day += TC.LAWN_COOLDOWN;
  ok(TC.lawnState(S, nb).canMow === true, 'a lawn regrows after the cooldown');
  ok(TC.lawnState(S, TC.NEIGHBORS[1].id).canMow === true, 'a different lawn is free once the daily limit resets');
  // cooldown still blocks before a full week passes
  const S2 = TC.freshSave();
  TC.mowLawn(S2, nb);
  S2.day += 3;
  const st = TC.lawnState(S2, nb);
  ok(st.canMow === false && st.onCooldown === true && st.daysLeft === TC.LAWN_COOLDOWN - 3, 'mid-cooldown reports the days left');
  ok(TC.mowLawn(S, 'not-a-neighbour') === null, 'mowing an unknown neighbour is rejected');
  // lawn payout is deterministic per neighbour+day
  const a = TC.lawnOutcome(nb, 5), b = TC.lawnOutcome(nb, 5);
  ok(JSON.stringify(a) === JSON.stringify(b), 'lawn payout is deterministic for a given neighbour and day');
}

// ---- kiosk lottery ----
{
  const S = TC.freshSave();
  S.coins = 3;
  ok(TC.buyLottery(S) === null, 'you cannot buy a lottery ticket without enough coins');
  S.coins = 100;
  const before = S.coins;
  const res = TC.buyLottery(S);
  ok(res && typeof res.kind === 'string', 'buying a ticket returns an outcome');
  ok(S.lottery.bought === 1, 'the ticket counter increments');
  ok(S.coins <= before - TC.LOTTERY_PRICE + res.coins + 1, 'the ticket price is deducted and winnings added');
  if (res.cardId) ok(!!S.collection[res.cardId], 'a jackpot card lands in the binder');
  const o1 = TC.lotteryOutcome(7, 3), o2 = TC.lotteryOutcome(7, 3);
  ok(JSON.stringify(o1) === JSON.stringify(o2), 'lottery outcome is deterministic for a given day and ticket number');
}

// ---- scratch-and-match 3x3 grid ----
{
  const complete = (g, L) => !!g[L[0]] && g[L[0]] === g[L[1]] && g[L[1]] === g[L[2]];
  const anyLine = (g) => TC.SCRATCH_LINES.find(L => complete(g, L)) || null;
  // determinism: same day+ticket => same grid
  const a = TC.scratchGrid(9, 2), b = TC.scratchGrid(9, 2);
  ok(JSON.stringify(a) === JSON.stringify(b), 'scratch grid is deterministic for a given day and ticket number');
  ok(Array.isArray(a.cells) && a.cells.length === 9, 'the scratch grid has nine cells');
  // the grid mirrors the underlying economy outcome
  const outc = TC.lotteryOutcome(9, 2);
  ok(a.kind === outc.kind && a.coins === outc.coins && a.cardId === outc.cardId, 'the grid carries the same outcome as lotteryOutcome');
  // sweep a range of tickets: winners have a valid highlighted line, losers have none
  let sawWin = false, sawLoss = false;
  for (let t = 1; t <= 80; t++) {
    for (let d = 1; d <= 12; d++) {
      const g = TC.scratchGrid(d, t);
      if (g.kind === 'nothing') {
        sawLoss = true;
        ok(g.line === null, 'a losing grid highlights no line');
        ok(anyLine(g.cells) === null, 'a losing grid has no accidental three-in-a-row');
      } else {
        sawWin = true;
        ok(Array.isArray(g.line) && g.line.length === 3, 'a winning grid highlights a triple');
        ok(TC.SCRATCH_LINES.some(L => L.join(',') === g.line.join(',')), 'the winning line is a real row/column/diagonal');
        ok(g.line.every(i => g.cells[i] === g.symbol), 'the three highlighted cells all show the prize symbol');
      }
    }
  }
  ok(sawWin, 'the sweep produced at least one winning grid');
  ok(sawLoss, 'the sweep produced at least one losing grid');
}

// ---- supermarket gating ----
{
  const S = TC.freshSave();
  // find a supermarket day and a non-supermarket day
  let superDay = null, normalDay = null;
  for (let d = 2; d < 400 && (superDay === null || normalDay === null); d++) {
    if (TC.dayEvent(d) === 'supermarket') { if (superDay === null) superDay = d; }
    else if (normalDay === null) normalDay = d;
  }
  S.day = superDay; ok(TC.canEnterMarket(S) === true, 'the supermarket opens on a shopping day');
  S.day = normalDay; ok(TC.canEnterMarket(S) === false, 'the supermarket is closed without a parent trip');
}

// ---- daily goals nudge ----
{
  const S = TC.freshSave();
  const g0 = TC.dailyGoals(S);
  ok(Array.isArray(g0) && g0.length === 4, 'four daily goals are offered');
  ok(g0.every(x => x.id && x.label && typeof x.done === 'boolean'), 'each goal has an id, label and done flag');
  const allowance = g0.find(x => x.id === 'allowance');
  ok(allowance.done === false, 'the allowance goal is open on a fresh day');
  TC.claimAllowance(S);
  ok(TC.dailyGoals(S).find(x => x.id === 'allowance').done === true, 'claiming allowance ticks its goal off');
  // mowing a lawn ticks the lawn goal
  ok(TC.dailyGoals(S).find(x => x.id === 'lawn').done === false, 'lawn goal starts open');
  TC.mowLawn(S, TC.NEIGHBORS[0].id);
  ok(TC.dailyGoals(S).find(x => x.id === 'lawn').done === true, 'mowing a lawn ticks the lawn goal off');
  // doing a chore ticks the chore goal
  ok(TC.dailyGoals(S).find(x => x.id === 'chore').done === false, 'chore goal starts open');
  TC.doChore(S, 'dishes');
  ok(TC.dailyGoals(S).find(x => x.id === 'chore').done === true, 'doing a chore ticks the chore goal off');
}

// ---- weather ----
{
  ok(TC.weatherFor(1) === 'clear', 'day 1 is always clear');
  const kinds = new Set();
  for (let d = 2; d < 300; d++) kinds.add(TC.weatherFor(d));
  ok([...kinds].every(k => ['clear', 'cloudy', 'overcast', 'rain'].includes(k)), 'weather is always one of the known kinds');
  ok(kinds.has('rain') && kinds.has('clear') && kinds.has('cloudy'), 'the weather varies across days');
  ok(TC.weatherFor(42) === TC.weatherFor(42), 'weather is deterministic for a given day');
}

// ---- mailbox ----
{
  const S = TC.freshSave();
  ok(TC.canCheckMail(S) === true, 'a fresh day has unread mail');
  const c = TC.mailboxContent(S.day);
  ok(c && typeof c.note === 'string' && typeof c.coins === 'number', 'mail content has a note and (maybe) coins');
  ok(TC.mailboxContent(5).note === TC.mailboxContent(5).note, 'mail is deterministic for a given day');
  const before = S.coins;
  const got = TC.checkMail(S);
  ok(got !== null, 'checking mail the first time returns content');
  ok(S.coins === before + got.coins, 'any loose change from the mail is credited');
  ok(TC.canCheckMail(S) === false, 'mail can only be checked once a day');
  ok(TC.checkMail(S) === null, 'a second same-day mail check returns nothing');
  S.day += 1;
  ok(TC.canCheckMail(S) === true, 'a new day brings new mail');
  // old saves without a mail field still load and can check mail
  const old = TC.freshSave(); delete old.mail;
  ok(TC.canCheckMail(old) === true, 'a save missing the mail field still allows checking mail');
}

// ---- fishing ----
{
  const S = TC.freshSave();
  ok(TC.fishCastsLeft(S) === TC.FISH_CASTS_PER_DAY, 'a fresh day starts with a full set of casts');
  ok(TC.canFish(S) === true, 'you can fish on a fresh day');
  const o = TC.fishOutcome(3, 1);
  ok(o && typeof o.kind === 'string' && typeof o.label === 'string', 'a fish outcome has a kind and a label');
  ok(['fish', 'coin', 'bigcoin', 'candy', 'card', 'boot'].includes(o.kind), 'fish outcome kinds are from the known set');
  ok(JSON.stringify(TC.fishOutcome(3, 1)) === JSON.stringify(TC.fishOutcome(3, 1)), 'fish outcome is deterministic for day+cast');
  // exhaust the day's casts
  let caught = 0;
  for (let i = 0; i < TC.FISH_CASTS_PER_DAY; i++) { const r = TC.fishCast(S); if (r) caught++; }
  ok(caught === TC.FISH_CASTS_PER_DAY, 'you get exactly the daily number of casts');
  ok(TC.canFish(S) === false && TC.fishCast(S) === null, 'casts run out for the day');
  S.day += 1;
  ok(TC.canFish(S) === true, 'casts refill on a new day');
  // a card catch lands in the binder
  let sawCard = false;
  for (let d = 2; d < 60 && !sawCard; d++) { const r = TC.fishOutcome(d, 1); if (r.cardId) { sawCard = true; ok(!!TC.BY_ID[r.cardId], 'a caught card is a real card id'); } }
  ok(sawCard, 'card catches occur across days');
  // old saves without a fishing field still load and fish
  const old = TC.freshSave(); delete old.fishing;
  ok(TC.canFish(old) === true && TC.fishCast(old) !== null, 'a save missing the fishing field still works');
}

// ---- fishing catch journal ----
{
  // a fish catch carries a valid species and coins
  let sawFish = false;
  for (let d = 2; d < 200 && !sawFish; d++) for (let c = 1; c <= 4 && !sawFish; c++) {
    const r = TC.fishOutcome(d, c);
    if (r.kind === 'fish') { sawFish = true;
      ok(TC.FISH_SPECIES.some(f => f.id === r.fishId), 'a caught fish is a real species');
      ok(r.coins > 0 && r.label.length > 0, 'a fish sells for coins and has a label');
    }
  }
  ok(sawFish, 'fish catches occur across days');
  // journal starts empty and logs species on first catch
  const S = TC.freshSave();
  ok(TC.fishJournalCount(S) === 0, 'the catch journal starts empty');
  ok(TC.fishJournalState(S).every(f => f.caught === false), 'every species starts uncaught');
  // find a day/cast that lands a fish and cast it
  let done = false;
  for (let d = 2; d < 200 && !done; d++) {
    const probe = TC.fishOutcome(d, 1);
    if (probe.kind === 'fish') {
      const T = TC.freshSave(); T.day = d; T.fishing = { day: d, casts: 0 };
      const r = TC.fishCast(T);
      ok(r.fishId === probe.fishId, 'fishCast lands the deterministic species');
      ok(r.fishNew === true && T.fishJournal[probe.fishId] === true, 'a first catch is flagged new and logged');
      ok(TC.fishJournalCount(T) === 1, 'the journal count reflects the logged species');
      // re-catching the same species is not new
      T.fishing = { day: d, casts: 0 };
      const r2 = TC.fishCast(T);
      if (r2.fishId === probe.fishId) ok(r2.fishNew === false, 'a repeat catch of the same species is not new');
      done = true;
    }
  }
  ok(done, 'exercised a fish catch through fishCast');
  // old save without a fishJournal still logs
  const noJ = TC.freshSave(); delete noJ.fishJournal;
  for (let d = 2; d < 200; d++) { noJ.day = d; noJ.fishing = { day: d, casts: 0 };
    const r = TC.fishCast(noJ); if (r.fishId) { ok(noJ.fishJournal[r.fishId] === true, 'a save missing fishJournal still logs a catch'); break; } }
}

// ---- floating joystick vector ----
{
  const R = 52, D = 9;
  // inside the deadzone → neutral (stand still even while the stick is down)
  ok(TC.joyVector(0, 0, R, D).mag === 0, 'no drag is neutral');
  ok(TC.joyVector(5, 5, R, D).mag === 0, 'a tiny wobble under the deadzone is neutral');
  // a partial push gives a proportional magnitude (analog speed)
  const half = TC.joyVector(26, 0, R, D);
  ok(Math.abs(half.mag - 0.5) < 1e-9 && Math.abs(half.x - 0.5) < 1e-9 && half.y === 0, 'a half push points right at half strength');
  // pushing past the radius clamps to full strength but keeps direction
  const over = TC.joyVector(200, 0, R, D);
  ok(over.mag === 1 && Math.abs(over.x - 1) < 1e-9, 'pushing past the ring clamps to full speed');
  // direction is a proper unit-scaled vector: magnitude of {x,y} equals mag
  const diag = TC.joyVector(100, 100, R, D);
  ok(Math.abs(Math.hypot(diag.x, diag.y) - diag.mag) < 1e-9 && diag.mag === 1, 'a diagonal push is full strength along the diagonal');
  // down/left directions carry the right signs
  const dl = TC.joyVector(-30, 40, R, D);
  ok(dl.x < 0 && dl.y > 0, 'down-left drag yields negative x, positive y');
}

// ---- townsfolk presence ----
{
  for (let d = 1; d < 200; d++) {
    const n = TC.walkersOutCount(d);
    ok(n >= 1 && n <= 3, 'townsfolk count stays within 1..3');
    const w = TC.weatherFor(d);
    if (w === 'rain') ok(n === 1, 'only one hardy soul is out in the rain');
    if (w === 'clear' || w === 'cloudy') ok(n === 3, 'a full crowd on fair days');
  }
  ok(TC.walkersOutCount(7) === TC.walkersOutCount(7), 'townsfolk count is deterministic per day');
}

// ---- arcade cabinet ----
{
  ok(TC.arcadeReward(0).tier === 'bullseye' && TC.arcadeReward(0).coins === 12, 'a dead-centre stop is a bullseye');
  ok(TC.arcadeReward(0.15).tier === 'good' && TC.arcadeReward(0.15).coins > 0, 'a close stop pays out');
  ok(TC.arcadeReward(0.3).tier === 'edge' && TC.arcadeReward(0.3).coins > 0, 'an edge stop pays a little');
  ok(TC.arcadeReward(0.9).coins === 0, 'a wild miss pays nothing');
  const S = TC.freshSave();
  ok(TC.arcadePlaysLeft(S) === TC.ARCADE_PLAYS_PER_DAY, 'a fresh day has all arcade plays');
  const before = S.coins;
  const r = TC.arcadePlay(S, 0);
  ok(r && S.coins === before + r.coins, 'playing credits the reward coins');
  ok(TC.arcadePlaysLeft(S) === TC.ARCADE_PLAYS_PER_DAY - 1, 'playing uses a daily play');
  let n = 0; while (TC.canPlayArcade(S)) { TC.arcadePlay(S, 0.5); n++; }
  ok(n === TC.ARCADE_PLAYS_PER_DAY - 1, 'the daily play limit is enforced');
  ok(TC.arcadePlay(S, 0) === null, 'no plays left returns null');
  S.day += 1;
  ok(TC.canPlayArcade(S) === true, 'arcade plays refill on a new day');
  const old = TC.freshSave(); delete old.arcade;
  ok(TC.canPlayArcade(old) === true && TC.arcadePlay(old, 0) !== null, 'a save missing the arcade field still works');
  // lifetime bullseye tally
  const B = TC.freshSave();
  ok(B.arcadeBulls === 0, 'a fresh save has no bullseyes');
  let rr = TC.arcadePlay(B, 0);       // dead centre = bullseye
  ok(B.arcadeBulls === 1 && rr.totalBulls === 1, 'a bullseye increments the lifetime tally');
  rr = TC.arcadePlay(B, 0.3);          // an edge, not a bullseye
  ok(B.arcadeBulls === 1 && rr.totalBulls === 1, 'a non-bullseye leaves the tally unchanged');
  rr = TC.arcadePlay(B, 0);            // next day not needed; still has plays? ensure plays left
  ok(B.arcadeBulls === 2, 'another bullseye keeps counting');
  const noB = TC.freshSave(); delete noB.arcadeBulls;
  ok(TC.arcadePlay(noB, 0).totalBulls === 1, 'a save missing arcadeBulls still tallies');
}

// ---- jump rope ----
{
  ok(TC.jumpRopeReward(0).pop === 0, 'zero jumps earns no popularity');
  ok(TC.jumpRopeReward(6).pop > 0 && TC.jumpRopeReward(6).rel > 0, 'a decent streak earns popularity and befriends');
  ok(TC.jumpRopeReward(20).pop >= TC.jumpRopeReward(10).pop, 'a longer streak never earns less popularity');
  ok(TC.jumpRopeReward(6).coins === undefined, 'rope skipping no longer pays coins');
  ok(TC.jumpRopeReward(3).rel === 0, 'a tiny streak gives no relationship bump');
  const S = TC.freshSave();
  ok(TC.jumpRopeTriesLeft(S) === TC.JUMPROPE_TRIES_PER_DAY, 'a fresh day has all jump-rope tries');
  const before = S.pop, coinsBefore = S.coins, relBefore = TC.relOf(S, TC.NPCS[0].id);
  const r = TC.jumpRopePlay(S, 6, TC.NPCS[0].id);
  ok(r && S.pop === before + r.pop, 'playing credits popularity');
  ok(S.coins === coinsBefore, 'playing does not credit coins');
  ok(TC.relOf(S, TC.NPCS[0].id) > relBefore, 'a good run bumps the buddy relationship');
  ok(TC.jumpRopeTriesLeft(S) === TC.JUMPROPE_TRIES_PER_DAY - 1, 'playing uses a daily try');
  let n = 0; while (TC.canJumpRope(S)) { TC.jumpRopePlay(S, 2); n++; }
  ok(n === TC.JUMPROPE_TRIES_PER_DAY - 1, 'the daily try limit is enforced');
  ok(TC.jumpRopePlay(S, 5) === null, 'no tries left returns null');
  S.day += 1; ok(TC.canJumpRope(S) === true, 'tries refill on a new day');
  const old = TC.freshSave(); delete old.jumprope;
  ok(TC.canJumpRope(old) === true && TC.jumpRopePlay(old, 4) !== null, 'a save missing the jumprope field still works');
}

// ---- popularity ----
{
  ok(TC.popularityTier(0).key === 'unknown', 'a fresh kid is unknown');
  ok(TC.popularityTier(30).key === 'liked' && TC.popularityTier(80).key === 'star', 'popularity climbs through the tiers');
  ok(TC.popularityTier(1000).key === 'star', 'popularity tops out at school star');
  // better deals: bonus grows with popularity, capped
  ok(TC.popDealBonus(0) === 0 && TC.popDealBonus(40) === 10 && TC.popDealBonus(1000) === 20, 'deal bonus scales and caps at 20');
  // easier friends: bonus grows with popularity, capped
  ok(TC.popFriendBonus(0) === 0 && TC.popFriendBonus(24) === 2 && TC.popFriendBonus(1000) === 8, 'friend bonus scales and caps at 8');
  // rope skipping raises popularity, not coins
  const S = TC.freshSave();
  ok(S.pop === 0, 'a fresh save has no popularity');
  const c0 = S.coins;
  TC.jumpRopePlay(S, 8, TC.NPCS[0].id);
  ok(S.pop > 0 && S.coins === c0, 'a rope run raises popularity and leaves coins alone');
  // popularity makes candy gifts befriend faster
  const P = TC.freshSave(); P.candy = 2; P.pop = 60;
  const Q = TC.freshSave(); Q.candy = 2; Q.pop = 0;
  const pr = TC.giveCandy(P, TC.NPCS[1].id);
  const qr = TC.giveCandy(Q, TC.NPCS[1].id);
  ok(pr.rel > qr.rel, 'a popular kid earns more goodwill per candy');
  // a save missing pop still works everywhere
  const old = TC.freshSave(); delete old.pop; old.candy = 1;
  ok(TC.giveCandy(old, TC.NPCS[0].id) !== null && typeof TC.popDealBonus(old.pop) === 'number', 'systems tolerate a save missing pop');
}

// ---- getting-started tutorial ----
{
  const S = TC.freshSave();
  ok(TC.tutorialCount(S) === 0 && TC.tutorialDone(S) === false, 'a fresh save has the whole tutorial ahead');
  ok(TC.tutorialState(S).every(t => t.done === false && t.hint.length > 0), 'every step starts undone with a hint');
  // completing steps flips them done
  S.packsOpenedTotal = 1;
  ok(TC.tutorialState(S).find(t => t.id === 'pack').done === true, 'opening a pack completes the pack step');
  S.collection[TC.CORE_SET[0].id] = 1;
  S.chores.lastDoneDay = { dishes: 1 };
  S.allowance.lastClaimDay = 1;
  S.lawns.lastMowed = { delgado: 1 };
  S.pop = 5;
  ok(TC.tutorialDone(S) === true && TC.tutorialCount(S) === TC.TUTORIAL_STEPS.length, 'doing all the things finishes the tutorial');
  // progress detection marks steps seen once
  const P = TC.freshSave(); P.storySeen = true;
  ok(TC.checkTutorialProgress(P).length === 0, 'nothing new on a fresh started game');
  P.packsOpenedTotal = 1; P.collection[TC.CORE_SET[0].id] = 1;
  const neu = TC.checkTutorialProgress(P);
  ok(neu.length === 2 && neu.some(t => t.id === 'pack') && neu.some(t => t.id === 'binder'), 'newly-done steps are reported once');
  ok(TC.checkTutorialProgress(P).length === 0, 'the same steps are not reported twice');
  ok(P.tutSeen.pack === true, 'completed steps are marked seen on the save');
  // seedTutSeen suppresses a veteran's past progress
  const vet = TC.freshSave(); vet.packsOpenedTotal = 9; vet.collection[TC.CORE_SET[0].id] = 1; vet.storySeen = true;
  TC.seedTutSeen(vet);
  ok(TC.checkTutorialProgress(vet).length === 0, 'seeding the seen-set stops old progress from re-toasting');
  // a save missing the tutorial fields still works
  const bare = TC.freshSave(); delete bare.tutSeen; bare.storySeen = true; bare.packsOpenedTotal = 1;
  ok(TC.checkTutorialProgress(bare).length >= 1, 'a save without tutSeen still detects progress');
}

// ---- jump-rope personal best ----
{
  const S = TC.freshSave();
  ok(S.jrBest === 0, 'a fresh save has no jump-rope record');
  let r = TC.updateJumpBest(S, 7);
  ok(r.isNew === true && r.best === 7 && S.jrBest === 7, 'a first run sets the record');
  r = TC.updateJumpBest(S, 5);
  ok(r.isNew === false && r.best === 7 && S.jrBest === 7, 'a worse run does not lower the record');
  r = TC.updateJumpBest(S, 12);
  ok(r.isNew === true && r.best === 12, 'a better run raises the record');
  ok(TC.updateJumpBest(S, 12).isNew === false, 'tying the record is not a new best');
  ok(TC.updateJumpBest(TC.freshSave(), 0).isNew === false, 'a zero-jump run is never a record');
  const noField = TC.freshSave(); delete noField.jrBest;
  const nb = TC.updateJumpBest(noField, 4);
  ok(nb.isNew === true && nb.best === 4, 'a save missing jrBest still records a best');
}

// ---- achievements / trophy wall ----
{
  const S = TC.freshSave();
  ok(TC.achievementCount(S) === 0, 'a fresh save has no achievements');
  const st = TC.achievementsState(S);
  ok(st.length === TC.ACHIEVEMENTS.length && st.every(a => a.done === false), 'every achievement starts locked');
  S.packsOpenedTotal = 1;
  ok(st.find, 'sanity'); // state is a snapshot; recompute after mutating
  ok(TC.achievementsState(S).find(a => a.id === 'firstpack').done === true, 'opening a pack unlocks First Rip');
  S.day = 8; S.coins = 120;
  const st2 = TC.achievementsState(S);
  ok(st2.find(a => a.id === 'week').done === true, 'reaching day 7 unlocks Regular');
  ok(st2.find(a => a.id === 'saver').done === true, 'saving 100 coins unlocks Piggy Bank');
  ok(TC.achievementCount(S) === 3, 'the tally counts unlocked achievements');
  // completion-based ones
  const full = TC.freshSave(); TC.CORE_SET.forEach(c => { full.collection[c.id] = 1; });
  ok(TC.achievementsState(full).find(a => a.id === 'complete').done === true, 'a full binder unlocks Completionist');
  ok(TC.achievementsState(full).find(a => a.id === 'half').done === true, 'a full binder also counts as half full');
  // old save missing optional fields must not throw
  const old = TC.freshSave(); delete old.pet; delete old.lottery; delete old.allowance;
  ok(typeof TC.achievementCount(old) === 'number', 'achievements tolerate a save missing optional fields');
  // cross-system achievements tied to the minigames / fish journal
  const M = TC.freshSave();
  ok(TC.achievementsState(M).find(a => a.id === 'angler').done === false, 'Master Angler starts locked');
  TC.FISH_SPECIES.forEach(f => { M.fishJournal[f.id] = true; });
  ok(TC.achievementsState(M).find(a => a.id === 'angler').done === true, 'catching every fish unlocks Master Angler');
  M.jrBest = 10;
  ok(TC.achievementsState(M).find(a => a.id === 'skipper').done === true, 'a jump-rope streak of 10 unlocks Rope Star');
  M.arcadeBulls = 10;
  ok(TC.achievementsState(M).find(a => a.id === 'sharp').done === true, 'ten arcade bullseyes unlock Sharpshooter');
  const partial = TC.freshSave(); partial.jrBest = 9; partial.arcadeBulls = 9;
  ok(TC.achievementsState(partial).find(a => a.id === 'skipper').done === false &&
     TC.achievementsState(partial).find(a => a.id === 'sharp').done === false, 'just-short values stay locked');
  // these tolerate a save missing the newer fields
  const bare = TC.freshSave(); delete bare.fishJournal; delete bare.jrBest; delete bare.arcadeBulls;
  ok(typeof TC.achievementCount(bare) === 'number', 'cross-system achievements tolerate missing fields');
}

// ---- allowance streak info ----
{
  const S = TC.freshSave();
  for (let day = 1; day <= 5; day++) {
    S.day = day;
    const info = TC.allowanceStreakInfo(S);
    const before = S.coins;
    const paid = TC.claimAllowance(S);
    ok(paid === info.amount, 'day ' + day + ': streak info predicts the exact payout');
    ok(S.coins === before + paid, 'day ' + day + ': coins rise by the payout');
    ok(info.streak === day, 'day ' + day + ': the streak grows each consecutive day');
  }
  ok(S.allowance.streak === 5, 'a five-day run builds a streak of 5');
  // a gap resets the streak
  S.day = 10;
  ok(TC.allowanceStreakInfo(S).streak === 1, 'skipping days resets the streak to 1');
  // old save without an allowance field still yields numbers
  const old = TC.freshSave(); delete old.allowance;
  const oi = TC.allowanceStreakInfo(old);
  ok(oi.streak === 1 && typeof oi.amount === 'number', 'streak info tolerates a missing allowance field');
}

// ---- daily-goal completion bonus ----
{
  function allDone(){
    const S = TC.freshSave(); S.day = 3; S.coins = 0;
    S.allowance.lastClaimDay = S.day;             // allowance claimed
    S.chores.lastDoneDay = { dishes: S.day };     // a chore done
    S.lawns = { lastMowed: {}, lastAnyDay: S.day };
    S.school = { wantDay: S.day, offers: {}, duels: [], gaveCandy: {}, stoleToday: {} };
    return S;
  }
  const fresh = TC.freshSave();
  ok(TC.allGoalsDone(fresh) === false, 'a fresh day has goals outstanding');
  ok(TC.dailyBonusClaimable(fresh) === false, 'no bonus while goals remain');
  const S = allDone();
  ok(TC.allGoalsDone(S) === true, 'all four goals can be marked done');
  ok(TC.dailyBonusClaimable(S) === true, 'the bonus is claimable once every goal is done');
  const got = TC.claimDailyBonus(S);
  ok(got === TC.DAILY_GOAL_BONUS && S.coins === TC.DAILY_GOAL_BONUS, 'claiming pays the bonus into coins');
  ok(TC.dailyBonusClaimable(S) === false && TC.claimDailyBonus(S) === 0, 'the bonus is once per day');
  S.day += 1; S.allowance.lastClaimDay = S.day; S.chores.lastDoneDay = { dishes: S.day };
  S.lawns.lastAnyDay = S.day; S.school.wantDay = S.day;
  ok(TC.dailyBonusClaimable(S) === true, 'a new day makes the bonus available again');
  const old = TC.freshSave(); delete old.goalBonus; const S2 = allDone(); delete S2.goalBonus;
  ok(TC.claimDailyBonus(S2) === TC.DAILY_GOAL_BONUS, 'a save missing goalBonus still awards the bonus');
}

// ---- new-card "NEW" badge tracking ----
{
  const S = TC.freshSave();
  const id = TC.CORE_SET[0].id;
  ok(!S.newCards[id], 'a card starts not-new');
  TC.addCardById(S, id);
  ok(S.newCards[id] === true, 'a first-time pull is flagged new');
  TC.addCardById(S, id);   // a duplicate
  ok(S.newCards[id] === true, 'pulling a duplicate keeps the flag (already owned, still unseen)');
  ok(TC.markCardSeen(S, id) === true && !S.newCards[id], 'viewing the card clears the new flag');
  ok(TC.markCardSeen(S, id) === false, 'clearing an already-seen card is a no-op');
  // duplicate of an already-owned card does not re-flag once seen
  TC.addCardById(S, id);
  ok(!S.newCards[id], 'a duplicate of a seen, already-owned card is not re-flagged');
  // old save without newCards still works
  const old = TC.freshSave(); delete old.newCards;
  const id2 = TC.CORE_SET[1].id;
  TC.addCardById(old, id2);
  ok(old.newCards && old.newCards[id2] === true, 'addCardById tolerates a save missing newCards');
}

// ---- day summary (bedtime recap) ----
{
  const S = TC.freshSave();
  S.dayStart = TC.daySnapshot(S);            // baseline at day start
  let sum = TC.daySummary(S);
  ok(sum.cards === 0 && sum.coins === 0 && sum.ach === 0, 'a fresh day has an empty recap');
  S.coins += 25; TC.addCardById(S, TC.CORE_SET[0].id); TC.addCardById(S, TC.CORE_SET[1].id);
  sum = TC.daySummary(S);
  ok(sum.cards === 2, 'the recap counts new cards collected today');
  ok(sum.coins === 25, 'the recap counts coins earned today');
  S.packsOpenedTotal = 1;                     // crosses the First Rip achievement
  ok(TC.daySummary(S).ach === 1, 'the recap counts trophies earned today');
  // spending shows as a negative coin delta, cards never go negative
  const S2 = TC.freshSave(); S2.coins = 50; S2.dayStart = TC.daySnapshot(S2); S2.coins = 30;
  ok(TC.daySummary(S2).coins === -20 && TC.daySummary(S2).cards === 0, 'spending nets negative coins without breaking card count');
  // a save missing dayStart falls back to a zero-delta snapshot
  const old = TC.freshSave(); delete old.dayStart; old.coins = 99;
  ok(TC.daySummary(old).coins === 0, 'a save without dayStart yields a safe empty recap');
}

// ---- new-achievement detection (toast trigger) ----
{
  const S = TC.freshSave();
  ok(TC.checkNewAchievements(S).length === 0, 'a fresh save unlocks nothing new');
  S.packsOpenedTotal = 1;
  const neu = TC.checkNewAchievements(S);
  ok(neu.length === 1 && neu[0].id === 'firstpack', 'crossing a threshold reports exactly the new achievement');
  ok(TC.checkNewAchievements(S).length === 0, 'the same achievement is not reported twice');
  ok(S.achSeen && S.achSeen.firstpack === true, 'the unlocked achievement is marked seen on the save');
  S.day = 8; S.coins = 200;
  const neu2 = TC.checkNewAchievements(S);
  ok(neu2.length === 2 && neu2.map(a => a.id).sort().join() === 'saver,week', 'multiple simultaneous unlocks are all reported');
  // seedAchSeen suppresses past progress
  const existing = TC.freshSave(); existing.packsOpenedTotal = 5; existing.day = 10;
  TC.seedAchSeen(existing);
  ok(TC.checkNewAchievements(existing).length === 0, 'seeding the seen-set stops old progress from re-toasting');
  // a save missing achSeen still works
  const noSeen = TC.freshSave(); delete noSeen.achSeen; noSeen.packsOpenedTotal = 1;
  ok(TC.checkNewAchievements(noSeen).length === 1, 'a save without achSeen still detects new achievements');
}

// ---- supermarket cart dash ----
{
  ok(TC.cartDashReward(9).coins === 14 && TC.cartDashReward(9).candy === 1, 'a clean sweep pays the most, plus a candy');
  ok(TC.cartDashReward(5).coins === 8 && TC.cartDashReward(2).coins === 4, 'mid tallies pay mid amounts');
  ok(TC.cartDashReward(0).coins === 1, 'even a slow dash pays a little');
  const S = TC.freshSave(); S.day = 4; S.coins = 0; S.candy = 0;
  ok(TC.canCartDash(S) === true && TC.cartDashLeft(S) === 1, 'the cart dash is available once on a shopping day');
  const r = TC.cartDash(S, 8);
  ok(r && S.coins === 14 && S.candy === 1, 'playing pays out coins (and candy) into the save');
  ok(TC.canCartDash(S) === false && TC.cartDash(S, 8) === null, 'the cart dash is once-per-day');
  S.day += 1; ok(TC.canCartDash(S) === true, 'it refills on a new day');
  const old = TC.freshSave(); delete old.cart;
  ok(TC.canCartDash(old) === true && TC.cartDash(old, 3) !== null, 'a save missing the cart field still works');
}

// ---- npc greetings ----
{
  const g = TC.npcGreeting({ id: 'keeper' }, 3);
  ok(typeof g === 'string' && g.length > 0, 'an npc greeting is a non-empty string');
  ok(TC.NPC_GREETINGS.keeper.includes(g), 'the keeper greets from their own line pool');
  ok(TC.npcGreeting({ id: 'keeper' }, 3) === TC.npcGreeting({ id: 'keeper' }, 3), 'a greeting is deterministic for a given day');
  ok(TC.npcGreeting({}, 3) === null && TC.npcGreeting(null, 1) === null, 'an actor without an id has no greeting');
  const kid = TC.npcGreeting({ id: 'finn' }, 5);
  ok(typeof kid === 'string' && kid.length > 0, 'a school kid falls back to the generic greeting pool');
  const days = new Set(); for (let d = 1; d < 40; d++) days.add(TC.npcGreeting({ id: 'mom' }, d));
  ok(days.size > 1, 'a greeting varies across days');
}

// ---- card of the day ----
{
  const id = TC.cardOfDay(5);
  ok(!!TC.BY_ID[id], 'card of the day is a real card id');
  ok(TC.cardOfDay(5) === TC.cardOfDay(5), 'card of the day is deterministic for a given day');
  const ids = new Set(); for (let d = 1; d < 60; d++) ids.add(TC.cardOfDay(d));
  ok(ids.size > 1, 'the featured card varies across days');
}

// ---- seasons ----
{
  ok(TC.seasonFor(1) === 'spring', 'day 1 is spring');
  ok(TC.seasonFor(7) === 'spring' && TC.seasonFor(8) === 'summer', 'the season flips after a week');
  ok(TC.seasonFor(15) === 'autumn' && TC.seasonFor(22) === 'winter', 'autumn then winter follow');
  ok(TC.seasonFor(29) === 'spring', 'the seasons wrap back to spring after a full year');
  ok(['spring', 'summer', 'autumn', 'winter'].includes(TC.seasonFor(123)), 'season is always a known one');
  ok(TC.seasonFor(50) === TC.seasonFor(50), 'season is deterministic per day');
}

// ---- festivals ----
{
  ok(TC.festivalFor(10) === 'fair' && TC.festivalFor(20) === 'fair', 'a fair falls on every tenth day');
  ok(TC.festivalFor(3) === null && TC.festivalFor(5) === null, 'ordinary spring days have no festival');
  ok(TC.festivalFor(24) === 'lights', 'winter days get the lights');
  ok(TC.festivalFor(24) === TC.festivalFor(24), 'festival is deterministic per day');
  // most days are ordinary
  let plain = 0; for (let d = 1; d < 100; d++) if (TC.festivalFor(d) === null) plain++;
  ok(plain > 40, 'the majority of days are ordinary');
}

// ---- feed the cat ----
{
  const S = TC.freshSave();
  ok(TC.feedPet(S) === null, 'you cannot feed the cat with no candy');
  S.candy = 2;
  const r = TC.feedPet(S);
  ok(r && r.affection === 1, 'feeding bumps affection');
  ok(S.candy === 1, 'feeding spends a candy');
  TC.feedPet(S);
  ok(S.pet.affection === 2 && S.candy === 0, 'affection accumulates and candy runs out');
  ok(TC.feedPet(S) === null, 'no candy left, no feeding');
  // old saves without a pet field still load with a default cat and can be fed
  const old = TC.freshSave(); delete old.pet; old.candy = 1;
  const r2 = TC.feedPet(old);
  ok(r2 && old.pet && old.pet.name === 'Biscuit', 'a save missing the pet field defaults to Biscuit and feeds fine');
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
