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
  ok(['skill', 'power'].includes(c.kind), `${id} has a kind`);
  ok(c.v > 0, `${id} has a value to grow`);
  ok(['edge', 'might', 'shield', 'heal', 'maxhp', 'atk', 'def', 'draw', 'energy', 'none'].includes(c.vt),
    `${id} names what its value is`);
  // A power whose whole text is a rider has no number to print; everything else
  // must show the number it grows, or growth is invisible to the player.
  if (c.vt !== 'none') ok(c.txt.includes('{v}'), `${id} shows its value in its text`);
}

// The point of the redesign: your kin brings the attacks, the deck sharpens
// them. A support card that damaged the foe by itself would make the kin an
// accessory to the deck, and it is meant to be the other way round.
section('no card in your deck deals damage by itself');
for (const id of CARD_IDS) {
  const c = CARDS[id];
  ok(c.vt !== 'dmg', `${id} has no damage value`);
  ok(c.kind !== 'attack', `${id} is not an attack card`);
  ok(!/^Deal /.test(c.txt), `${id} does not claim to deal damage (${c.txt})`);
}
for (const r of RARITY_ORDER) {
  ok(EK.cardsOfRarity(r).length > 0, `${r} has cards`);
  ok(/^#[0-9a-f]{6}$/i.test(RARITY[r]), `${r} has a colour`);
}
// Rarer cards should be worth wanting: more effect per energy, on average.
// Powers price a whole rule, not a number, so they are read on cost alone.
const avgPer = (r) => {
  const list = EK.cardsOfRarity(r).filter((id) => CARDS[id].vt !== 'none');
  return list.reduce((s, id) => s + CARDS[id].v / Math.max(1, CARDS[id].cost), 0) / Math.max(1, list.length);
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
const whet = G.cards.find((c) => c.id === 'whet') || EK.grantCard('whet');
const whet2 = EK.grantCard('whet');
G.party = [EK.mkMon('pyrelynx', 30)];
EK.startBattle({ foe: EK.mkMon('gargolem', 40), wild: true });
let b = EK.B();
b.hand = [{ src: 'deck', u: whet.u, id: 'whet', bg: 0 }];
b.energy = 3;
const whetBefore = EK.cardValue(whet);
EK.playCard(0);
eq(whet.plus, CARDS.whet.grow, 'the played copy grew');
eq(whet2.plus, 0, 'the other copy did not');
ok(EK.cardValue(whet) > whetBefore, 'and its value went up');
eq(whet.plays, 1, 'plays are counted');

section('growth has a ceiling');
for (const id of CARD_IDS.filter((c) => CARDS[c].grow || CARDS[c].kill)) {
  ok(EK.growCap(id) > CARDS[id].v, `${id} can grow well past its base`);
  ok(EK.growCap(id) <= CARDS[id].v * 6, `${id} cannot grow without limit`);
}
const capped = EK.grantCard('whet');
for (let i = 0; i < 500; i++) EK.growCard(capped, 1);
eq(capped.plus, EK.growCap('whet'), 'growth stops at the ceiling');
eq(EK.growCard(capped, 5), 0, 'and further growth grants nothing');
eq(EK.cardValue(capped), CARDS.whet.v + EK.growCap('whet'), 'a maxed card is worth base plus its ceiling');

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
// The card no longer swings itself, so the kill belongs to whatever it
// sharpened: play the edge, then attack with it, and see who gets paid.
const swingWith = (cardId, foeHp) => {
  const owned = EK.grantCard(cardId);
  const bb = EK.B();
  bb.foe.hp = foeHp; bb.over = null;
  const move = bb.mine.moves.find((m) => EK.MOVES[m.id].pow);
  bb.hand = [{ src: 'deck', u: owned.u, id: cardId, bg: 0 }, { src: 'kin', id: move.id }];
  bb.energy = 9;
  EK.playCard(0);                                 // the edge
  EK.playCard(0);                                 // the attack it sharpened
  return { owned, killed: bb.foe.hp <= 0 };
};
b = EK.B();
const missed = swingWith('soulfang', b.foe.max);  // healthy: it will not die
ok(!missed.killed, 'a foe at full HP survives one sharpened swing');
eq(missed.owned.plus, 0, 'an attack that does not kill grants nothing');
eq(missed.owned.kills || 0, 0, 'and counts no kill');
// Moves can miss, so swing until one actually lands the blow.
let landed = null;
for (let i = 0; i < 40 && !landed; i++) {
  const r = swingWith('soulfang', 1);             // one point left: it dies
  if (r.killed) landed = r.owned;
}
ok(!!landed, 'a sharpened swing eventually lands the kill');
eq(landed.plus, CARDS.soulfang.kill, 'the killing blow pays permanently');
eq(landed.kills, 1, 'and the kill is counted');
EK.G.battle = null;

section('an edge is spent by the next attack that connects');
G.party = [EK.mkMon('pyrelynx', 40)];
EK.G.battle = null;
EK.startBattle({ foe: EK.mkMon('gargolem', 40), wild: true });
b = EK.B();
b.foe.hp = b.foe.max = 9999;                      // survive anything, so we can measure
const edgeCard = EK.grantCard('edge');
const kinMove = b.mine.moves.find((m) => EK.MOVES[m.id].pow);
b.hand = [{ src: 'deck', u: edgeCard.u, id: 'edge', bg: 0 }];
b.energy = 9;
EK.playCard(0);
eq(EK.attackBonus().flat, EK.cardValue(edgeCard), 'the edge is waiting on the next attack');
// A miss keeps it — spending two turns setting up a swing that a 5% accuracy
// roll then eats is the kind of thing that stops people setting anything up.
for (let i = 0; i < 30 && EK.attackBonus().flat > 0; i++) {
  b.hand = [{ src: 'kin', id: kinMove.id }];
  b.energy = 9;
  EK.playCard(0);
}
eq(EK.attackBonus().flat, 0, 'and an attack that lands spends it');
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

section('a support card adds exactly the number printed on it');
// The card is the contract. A "+4" must be worth 4 on the bar whether the kin
// holding it is level 5 or level 50 — a stat nudged through the level formula
// would be worth 1 to one and 12 to the other, and growing a card by +1 would
// stop meaning anything you can read off the card.
const EK7 = withDeck(loadGame({}));
/** Damage the same move does with the card played, minus without it. */
const gainFrom = (cardId, species, lvl, foe, flvl) => {
  const move = 'lunge';                            // fixed, neutral, no rider
  const roll = { crit: false, roll: 1 };
  EK7.G.might = 0;
  EK7.G.party = [EK7.mkMon(species, lvl)];
  EK7.G.party[0].moves = [{ id: move, pp: 30, max: 30 }];
  EK7.G.battle = null;
  EK7.startBattle({ foe: EK7.mkMon(foe, flvl), wild: true });
  const b8 = EK7.B();
  b8.foe.hp = b8.foe.max = 99999;                  // nothing dies, so we can measure
  const bare = EK7.damageOf(b8.mine, b8.foe, move, roll).dmg;
  const owned = EK7.grantCard(cardId);
  b8.hand = [{ src: 'deck', u: owned.u, id: cardId, bg: 0 }];
  b8.energy = 9;
  EK7.playCard(0);
  const withCard = bare + EK7.attackBonus().flat;
  EK7.G.battle = null;
  return { gain: withCard - bare, printed: EK7.cardValue(owned) };
};
for (const [species, lvl, foe, flvl, label] of [
  ['cindercub', 5, 'gargolem', 5, 'a fresh level-5 kin'],
  ['pyrelynx', 50, 'sproutle', 5, 'a level-50 kin'],
  ['cindercub', 5, 'gargolem', 40, 'a kin facing a fat defence stat'],
]) {
  const { gain, printed } = gainFrom('edge', species, lvl, foe, flvl);
  eq(gain, printed, `${label} gets exactly the +${printed} the card promises`);
}

// The stack adds up, and the permanent half rides on top of the battle half.
EK7.G.might = 0;
EK7.G.party = [EK7.mkMon('pyrelynx', 30)];
EK7.G.battle = null;
EK7.startBattle({ foe: EK7.mkMon('gargolem', 30), wild: true });
const b9 = EK7.B();
b9.foe.hp = b9.foe.max = 99999;
b9.energy = 99;
const focusCard = EK7.grantCard('focus'), edgeTwo = EK7.grantCard('edge');
b9.hand = [{ src: 'deck', u: focusCard.u, id: 'focus', bg: 0 }];
EK7.playCard(0);
eq(EK7.attackBonus().flat, CARDS.focus.v, 'Focus is on every attack');
b9.hand = [{ src: 'deck', u: edgeTwo.u, id: 'edge', bg: 0 }];
EK7.playCard(0);
eq(EK7.attackBonus().flat, CARDS.focus.v + CARDS.edge.v, 'and an edge stacks on top of it');
EK7.G.might = 4;
eq(EK7.attackBonus().flat, CARDS.focus.v + CARDS.edge.v + 4, 'as does the permanent damage you have earned');

// Powers change the shape of an attack rather than its number.
const twin = EK7.grantCard('twinstrike');
b9.hand = [{ src: 'deck', u: twin.u, id: 'twinstrike', bg: 0 }];
EK7.playCard(0);
eq(EK7.attackBonus().hits, 2, 'Twin Strike gives every attack a second swing');
const over = EK7.grantCard('overkill');
b9.hand = [{ src: 'deck', u: over.u, id: 'overkill', bg: 0 }];
EK7.playCard(0);
eq(EK7.attackBonus().mul, 2, 'Overkill doubles what they land for');
const venom = EK7.grantCard('venomcoat');
b9.hand = [{ src: 'deck', u: venom.u, id: 'venomcoat', bg: 0 }];
EK7.playCard(0);
ok(b9.mods.riders.some((r) => r[0] === 'snare'), 'Venom Coat rides on every attack you make');
EK7.G.might = 0;
EK7.G.battle = null;

section('permanent damage outlives the battle, and the save');
const store2 = {};
const EK8 = withDeck(loadGame(store2));
EK8.G.might = 0;
EK8.G.party = [EK8.mkMon('pyrelynx', 30)];
EK8.enterMap('hollowbrook', 9, 8, 'down');
EK8.startBattle({ foe: EK8.mkMon('gargolem', 30), wild: true });
const bm = EK8.B();
const grit = EK8.grantCard('grit');
bm.hand = [{ src: 'deck', u: grit.u, id: 'grit', bg: 0 }];
bm.energy = 9;
EK8.playCard(0);
eq(EK8.G.might, EK8.CARDS.grit.v, 'Grit banks its damage on the run, not the battle');
EK8.clearMods(bm);
eq(EK8.G.might, EK8.CARDS.grit.v, 'and clearing the battle does not take it back');
EK8.G.battle = null;
ok(EK8.saveGame(), 'saved');
const EK9 = loadGame(store2);
ok(EK9.loadGame(), 'loaded');
eq(EK9.G.might, EK8.CARDS.grit.v, 'and it came back with the save');

section('every win offers a card');
const EKR = withDeck(loadGame({}));
EKR.enterMap('route_one', 9, 10, 'down');
const offerFor = (opt) => EKR.rollReward(opt);
for (const [label, opt] of [['a wild win', { wild: true }], ['a trainer', { npc: {} }], ['the legendary', { legendary: true }]]) {
  const offer = offerFor(opt);
  eq(offer.length, EKR.REWARD_PICKS, `${label} offers ${EKR.REWARD_PICKS} cards`);
  ok(offer.every((id) => !!EKR.CARDS[id]), `${label} offers real cards`);
  eq(new Set(offer).size, offer.length, `${label} never offers the same card twice`);
}
// Harder fights reach further up the table. Measured, because odds are odds.
const meanRarity = (opt, n = 900) => {
  let total = 0, count = 0;
  for (let i = 0; i < n; i++) for (const id of offerFor(opt)) { total += RARITY_ORDER.indexOf(CARDS[id].r); count++; }
  return total / count;
};
const wildMean = meanRarity({ wild: true });
const trainerMean = meanRarity({ npc: {} });
const legendMean = meanRarity({ legendary: true });
ok(trainerMean > wildMean, `a trainer offers better than a wild kin (${trainerMean.toFixed(2)} vs ${wildMean.toFixed(2)})`);
ok(legendMean > trainerMean, `and the legendary better than a trainer (${legendMean.toFixed(2)})`);
eq(EKR.rewardOdds({ legendary: true, npc: {} }), EKR.REWARD_ODDS.legendary, 'the legendary outranks the trainer table');

section('taking the card is what commits it');
EKR.G.party = [EKR.mkMon('pyrelynx', 30)];
EKR.G.mode = 'world';
const ownedBefore = EKR.G.cards.length;
const offer = ['guard', 'focus', 'snack'];
let settled = 0;
EKR.openScreen('reward', { offer, done: () => { settled++; } });
eq(EKR.G.mode, 'screen', 'the offer opens as a screen');
eq(EKR.G.screen.list.length, offer.length + 1, 'with a way to decline');
eq(EKR.G.cards.length, ownedBefore, 'and nothing is owned until you pick');
EKR.G.screen.i = 1;
EKR.screenSelect();
eq(EKR.G.cards.length, ownedBefore + 1, 'picking grants exactly one card');
eq(EKR.G.cards[EKR.G.cards.length - 1].id, 'focus', 'the one you were on');
eq(settled, 1, 'and the run carries on afterwards');
eq(EKR.G.mode, 'world', 'back to the world');

const afterPick = EKR.G.cards.length;
EKR.openScreen('reward', { offer, done: () => { settled++; } });
EKR.G.screen.i = EKR.G.screen.list.length - 1;    // "No thanks"
EKR.screenSelect();
eq(EKR.G.cards.length, afterPick, 'declining grants nothing');
eq(settled, 2, 'and still carries on');

// Back is not a dead button here: there is nothing behind the offer, so it
// means "No thanks" — the option that is actually on the screen.
EKR.openScreen('reward', { offer, done: () => { settled++; } });
EKR.G.screen.i = 0;
EKR.pressKey('b'); EKR.step(.1); EKR.releaseKey('b'); EKR.fired.clear();
eq(EKR.G.cards.length, afterPick, 'back declines rather than doing nothing');
eq(EKR.G.mode, 'world', 'and closes the offer');
eq(settled, 3, 'settling the run either way');

section('gems are paid out for winning');
EK6.G.gems = 0;
ok(EK6.gemReward({ wild: true }) > 0, 'a wild win pays something');
ok(EK6.gemReward({ npc: { trainer: { prize: 900 } } }) > EK6.gemReward({ wild: true }), 'a trainer pays more');
ok(EK6.gemReward({ wild: true, legendary: true }) > 20, 'and the legendary pays a lot');

done('emberkin_cards');
