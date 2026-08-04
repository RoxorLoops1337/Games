// EMBERKIN — deck, cards and chests.
//
// The battle is a deck-builder, so the properties that matter are about the
// cards themselves: that growth actually sticks (and sticks in the save), that
// battle-only growth does not, that exhaust means gone, that a kill-triggered
// bonus only fires on a kill, and that the chest odds get better as the chests
// get dearer.
//
// Run: node tests/emberkin_cards.test.mjs
import { loadGame, withDeck, autoFight, ok, eq, done, section } from './emberkin_lib.mjs';

const EK = withDeck(loadGame({}));
const { CARDS, CARD_IDS, CHESTS, CHEST_IDS, RARITY, RARITY_ORDER, G } = EK;

// ------------------------------------------------------------------ data --
section('every card is well formed');
ok(CARD_IDS.length >= 30, `there are enough cards to build with (${CARD_IDS.length})`);
for (const id of CARD_IDS) {
  const c = CARDS[id];
  ok(!!c.name, `${id} has a name`);
  ok(RARITY_ORDER.includes(c.r), `${id} has a real rarity`);
  ok(c.cost >= 0 && c.cost <= 3, `${id} costs 0-3 energy`);
  ok(['attack', 'skill', 'power'].includes(c.kind), `${id} has a kind`);
  ok(c.v > 0, `${id} has a value to grow`);
  ok(['dmg', 'shield', 'heal', 'maxhp', 'atk', 'def', 'draw', 'energy'].includes(c.vt), `${id} names what its value is`);
  ok(c.txt.includes('{v}'), `${id} shows its value in its text`);
  if (c.kind === 'attack') eq(c.vt, 'dmg', `${id} is an attack, so its value is damage`);
}
for (const r of RARITY_ORDER) {
  ok(EK.cardsOfRarity(r).length > 0, `${r} has cards`);
  ok(/^#[0-9a-f]{6}$/i.test(RARITY[r]), `${r} has a colour`);
}
// Rarer cards should be worth wanting: more effect per energy, on average.
const avgPer = (r) => {
  const list = EK.cardsOfRarity(r);
  return list.reduce((s, id) => s + CARDS[id].v / Math.max(1, CARDS[id].cost), 0) / list.length;
};
ok(avgPer('legendary') > avgPer('common'), 'legendaries out-value commons per energy');
ok(avgPer('epic') > avgPer('common'), 'epics out-value commons per energy');
// The growth mechanics exist and are spread across rarities.
ok(CARD_IDS.filter((id) => CARDS[id].grow).length >= 4, 'several cards grow permanently');
ok(CARD_IDS.filter((id) => CARDS[id].bgrow).length >= 1, 'at least one grows only for the battle');
ok(CARD_IDS.filter((id) => CARDS[id].kill).length >= 3, 'several pay off on a kill');
ok(CARD_IDS.filter((id) => CARDS[id].exhaust).length >= 4, 'several exhaust');

section('a starting deck is legal');
eq(G.cards.length, EK.STARTER_DECK.length, 'you own the starter cards');
eq(G.deck.length, EK.STARTER_DECK.length, 'and they are all in the deck');
ok(G.deck.length >= EK.DECK_MIN, 'which is a legal size');
ok(G.cards.every((c) => CARDS[c.id]), 'every owned card is real');
ok(new Set(G.cards.map((c) => c.u)).size === G.cards.length, 'every copy has its own id');

// ---------------------------------------------------------------- growth --
section('permanent growth sticks to the copy that earned it');
const jab = G.cards.find((c) => c.id === 'jab');
const jab2 = EK.grantCard('jab');
G.party = [EK.mkMon('pyrelynx', 30)];
EK.startBattle({ foe: EK.mkMon('gargolem', 40), wild: true });
let b = EK.B();
b.hand = [{ src: 'deck', u: jab.u, id: 'jab', bg: 0 }];
b.energy = 3;
const jabBefore = EK.cardValue(jab);
EK.playCard(0);
eq(jab.plus, CARDS.jab.grow, 'the played copy grew');
eq(jab2.plus, 0, 'the other copy did not');
ok(EK.cardValue(jab) > jabBefore, 'and its value went up');
eq(jab.plays, 1, 'plays are counted');

section('growth has a ceiling');
for (const id of CARD_IDS.filter((c) => CARDS[c].grow || CARDS[c].kill)) {
  ok(EK.growCap(id) > CARDS[id].v, `${id} can grow well past its base`);
  ok(EK.growCap(id) <= CARDS[id].v * 6, `${id} cannot grow without limit`);
}
const capped = EK.grantCard('jab');
for (let i = 0; i < 500; i++) EK.growCard(capped, 1);
eq(capped.plus, EK.growCap('jab'), 'growth stops at the ceiling');
eq(EK.growCard(capped, 5), 0, 'and further growth grants nothing');
eq(EK.cardValue(capped), CARDS.jab.v + EK.growCap('jab'), 'a maxed card is worth base plus its ceiling');

section('battle growth is only for the battle');
const hone = EK.grantCard('fanghone');
b.hand = [{ src: 'deck', u: hone.u, id: 'fanghone', bg: 0 },
          { src: 'deck', u: hone.u, id: 'fanghone', bg: 0 }];
b.energy = 6;
EK.playCard(0);
eq(hone.plus, 0, 'battle growth does not touch the owned copy');
ok(b.hand[0].bg > 0, 'but the other copy in hand sharpened');
const boosted = EK.cardValue({ id: 'fanghone', plus: 0, bg: b.hand[0].bg });
ok(boosted > CARDS.fanghone.v, 'so it is worth more this fight');
EK.G.battle = null;
eq(EK.cardValue(hone), CARDS.fanghone.v, 'and nothing carried out of the fight');

section('exhaust means gone for the rest of the fight');
G.party = [EK.mkMon('tsunaga', 40)];
EK.startBattle({ foe: EK.mkMon('gargolem', 50), wild: true });
b = EK.B();
const reaper = EK.grantCard('reaper');
b.hand = [{ src: 'deck', u: reaper.u, id: 'reaper', bg: 0 }];
b.energy = 3;
EK.playCard(0);
eq(b.exh.length, 1, 'it went to the spent pile');
eq(b.disc.filter((c) => c.id === 'reaper').length, 0, 'not the discard');
b.disc.push(...b.hand); b.hand = []; b.draw = [];
EK.drawCards([], 10);
ok(!b.hand.some((c) => c.id === 'reaper' && c === b.exh[0]), 'and it never comes back around');

section('a kill bonus only fires on a kill');
const soul = EK.grantCard('soulfang');
b = EK.B();
b.foe.hp = b.foe.max;                            // healthy: no kill
b.hand = [{ src: 'deck', u: soul.u, id: 'soulfang', bg: 0 }];
b.energy = 3;
EK.playCard(0);
eq(soul.plus, 0, 'a hit that does not kill grants nothing');
const soul2 = EK.grantCard('soulfang');
b.foe.hp = 1;                                    // now it will kill
b.hand = [{ src: 'deck', u: soul2.u, id: 'soulfang', bg: 0 }];
b.energy = 3;
EK.playCard(0);
eq(soul2.plus, CARDS.soulfang.kill, 'the killing blow pays permanently');
eq(soul2.kills, 1, 'and the kill is counted');
EK.G.battle = null;

section('growth survives a save');
const store = {};
const EK2 = withDeck(loadGame(store));
const grow = EK2.grantCard('whetstone');
grow.plus = 7; grow.plays = 9; grow.kills = 2;
EK2.G.party = [EK2.mkMon('cindercub', 5)];
EK2.enterMap('hollowbrook', 9, 8, 'down');
ok(EK2.saveGame(), 'saved');
const EK3 = loadGame(store);
ok(EK3.loadGame(), 'loaded');
const back = EK3.G.cards.find((c) => c.id === 'whetstone');
ok(!!back, 'the grown card came back');
eq(back.plus, 7, 'with its growth');
eq(back.plays, 9, 'its play count');
eq(back.kills, 2, 'and its kills');
eq(EK3.G.deck.length, EK2.G.deck.length, 'the deck list survived too');
ok(EK3.G.deck.every((u) => EK3.G.cards.some((c) => c.u === u)), 'and points at cards that exist');

// ----------------------------------------------------------------- chests --
section('chests cost more and pay better as they go up');
for (let i = 1; i < CHEST_IDS.length; i++) {
  const lo = CHESTS[CHEST_IDS[i - 1]], hi = CHESTS[CHEST_IDS[i]];
  ok(hi.cost > lo.cost * 2, `${hi.name} costs steeply more than ${lo.name}`);
  const rare = (c) => (c.odds.rare || 0) + (c.odds.epic || 0) * 2 + (c.odds.legendary || 0) * 4;
  ok(rare(hi) > rare(lo), `${hi.name} has better odds than ${lo.name}`);
  ok(hi.pulls >= lo.pulls, `${hi.name} gives at least as many cards`);
}
for (const k of CHEST_IDS) {
  const odds = CHESTS[k].odds;
  eq(RARITY_ORDER.reduce((s, r) => s + (odds[r] || 0), 0), 100, `${k} odds add up to 100`);
}

section('opening a chest costs gems and pays in cards');
const EK4 = withDeck(loadGame({}));
EK4.G.gems = 0;
eq(EK4.openChest('silver'), null, 'you cannot open what you cannot afford');
EK4.G.gems = CHESTS.silver.cost;
const owned = EK4.G.cards.length;
const got = EK4.openChest('silver');
ok(!!got, 'the chest opened');
eq(got.length, CHESTS.silver.pulls, 'and gave its pulls');
eq(EK4.G.gems, 0, 'the gems are spent');
eq(EK4.G.cards.length, owned + got.length, 'the cards are owned now');
ok(got.every((c) => CARDS[c.id]), 'and they are real cards');
ok(got.every((c) => c.plus === 0), 'fresh cards start ungrown');

section('the odds are honoured over many opens');
const EK5 = withDeck(loadGame({}));
EK5.G.gems = 1e9;
const tally = { silver: {}, prism: {} };
for (const kind of ['silver', 'prism']) {
  for (let i = 0; i < 400; i++) {
    for (const c of EK5.openChest(kind)) {
      const r = CARDS[c.id].r;
      tally[kind][r] = (tally[kind][r] || 0) + 1;
    }
  }
}
const share = (t, r) => (t[r] || 0) / RARITY_ORDER.reduce((s, x) => s + (t[x] || 0), 0);
ok(share(tally.silver, 'common') > share(tally.prism, 'common'), 'silver is mostly commons');
ok(share(tally.prism, 'legendary') > share(tally.silver, 'legendary'), 'prism actually drops legendaries');
ok(share(tally.prism, 'epic') > 0.25, `prism is epic-heavy (${(share(tally.prism, 'epic') * 100).toFixed(0)}%)`);
ok(share(tally.silver, 'legendary') === 0, 'silver never drops a legendary');

// -------------------------------------------------------------- the deck --
section('deck building respects its limits');
const EK6 = withDeck(loadGame({}));
EK6.G.gems = 1e9;
for (let i = 0; i < 12; i++) EK6.openChest('gold');
EK6.openScreen('deck');
const scr = EK6.G.screen;
const deckWas = EK6.G.deck.length;
scr.i = 0;
EK6.screenSelect();
eq(EK6.G.deck.length, deckWas - 1, 'selecting a deck card takes it out');
scr.i = EK6.G.deck.length;                        // first spare in the collection
EK6.screenSelect();
eq(EK6.G.deck.length, deckWas, 'selecting a spare puts one in');
while (EK6.G.deck.length > EK6.DECK_MIN) { scr.i = 0; EK6.screenSelect(); }
scr.i = 0;
EK6.screenSelect();
eq(EK6.G.deck.length, EK6.DECK_MIN, 'you cannot go below the minimum');
while (EK6.G.deck.length < EK6.DECK_MAX && EK6.G.deck.length < EK6.G.cards.length) {
  scr.i = EK6.G.deck.length;
  EK6.screenSelect();
}
if (EK6.G.cards.length > EK6.DECK_MAX) {
  scr.i = EK6.G.deck.length;
  EK6.screenSelect();
  eq(EK6.G.deck.length, EK6.DECK_MAX, 'and you cannot go above the maximum');
}

section('the deck you built is the deck you fight with');
EK6.G.party = [EK6.mkMon('cindercub', 10)];
EK6.closeScreen();
EK6.startBattle({ foe: EK6.mkMon('zaplet', 5), wild: true });
const bb = EK6.B();
const all = bb.draw.concat(bb.hand, bb.disc);
eq(all.filter((c) => c.src === 'deck').length, EK6.G.deck.length, 'every deck card is in the piles');
eq(all.filter((c) => c.src === 'kin').length, EK6.G.party[0].moves.length, 'and every move the kin knows');
ok(all.filter((c) => c.src === 'deck').every((c) => EK6.G.deck.includes(c.u)), 'nothing you set aside came along');

section('a card deals the number printed on it');
// The card is the contract. It must not be quietly rescaled by the kin's level
// or the foe's defence, or "Deal 10" means 3 at level 5 and 30 at level 40 and
// growing a card by +1 stops meaning anything you can read off the card.
const EK7 = withDeck(loadGame({}));
const flat = (species, lvl, foe, flvl, cardId) => {
  EK7.G.party = [EK7.mkMon(species, lvl)];
  EK7.G.battle = null;
  EK7.startBattle({ foe: EK7.mkMon(foe, flvl), wild: true });
  const c = EK7.CARDS[cardId];
  return EK7.cardDamage(c.v, (c.fx || {}).type, { crit: false }).dmg;
};
const strikeV = EK7.CARDS.strike.v;
eq(flat('cindercub', 5, 'gargolem', 5, 'strike'), strikeV, `a fresh level-5 kin's Strike deals ${strikeV}`);
eq(flat('pyrelynx', 50, 'sproutle', 5, 'strike'), strikeV, 'and a level-50 kin\'s Strike deals exactly the same');
eq(flat('cindercub', 5, 'gargolem', 40, 'strike'), strikeV, 'a fat defence stat does not shrink it either');

// An element on the card still meets the type chart — that is the card's own
// text, not the kin's level talking.
EK7.G.party = [EK7.mkMon('cindercub', 20)];
EK7.G.battle = null;
EK7.startBattle({ foe: EK7.mkMon('sproutle', 20), wild: true });
const leaf = EK7.CARDS.leafcut;
const vsVerdant = EK7.cardDamage(leaf.v, leaf.fx.type, { crit: false }).dmg;
EK7.G.battle = null;
EK7.startBattle({ foe: EK7.mkMon('pebblet', 20), wild: true });
const vsStone = EK7.cardDamage(leaf.v, leaf.fx.type, { crit: false }).dmg;
ok(vsStone > vsVerdant, 'a typed card is still read against the chart');
eq(EK7.cardDamage(10, null, { crit: false }).dmg, 10, 'and a colourless card is neutral against everything');

// Attack buffs are the thing that raises card damage, and they say so.
EK7.B().mods.atk = 5;
eq(EK7.cardDamage(10, null, { crit: false }).dmg, 15, '+5 attack adds 5 to every card attack');
EK7.B().mods.atk = 0;
eq(EK7.cardDamage(10, null, { crit: true }).dmg, 15, 'a crit still multiplies');
EK7.G.battle = null;

section('gems are paid out for winning');
EK6.G.gems = 0;
ok(EK6.gemReward({ wild: true }) > 0, 'a wild win pays something');
ok(EK6.gemReward({ npc: { trainer: { prize: 900 } } }) > EK6.gemReward({ wild: true }), 'a trainer pays more');
ok(EK6.gemReward({ wild: true, legendary: true }) > 20, 'and the legendary pays a lot');

done('emberkin_cards');
