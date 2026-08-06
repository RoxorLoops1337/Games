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
/** A clean game with the starter deck, for probing one mechanic at a time. */
const fresh = () => withDeck(loadGame({}));
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
  bb.swungTurn = 0;                               // each probe is a fresh turn
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
  b.swungTurn = 0;                                // each probe is a fresh turn
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
  const move = 'shalecut';                         // fixed power, no rider, off-element
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

// The heart of "does it actually do what it says". Every card in the table is
// played in a controlled fight and the thing it promises is checked, so a new
// card cannot be added with a `vt` or an `fx` that nothing reads.
section('every card does what its text says');
const EKA = withDeck(loadGame({}));
EKA.enterMap('route_one', 9, 10, 'down');
const bench = (cardId) => {
  EKA.G.might = 0;
  EKA.G.party = [EKA.mkMon('pyrelynx', 30), EKA.mkMon('brookite', 30)];
  EKA.G.battle = null;
  EKA.startBattle({ foe: EKA.mkMon('gargolem', 30), wild: true });
  const bb = EKA.B();
  bb.foe.hp = bb.foe.max = 99999;                 // nothing dies mid-measurement
  bb.mine.hp = Math.floor(bb.mine.max / 2);       // room to heal, room to hurt
  bb.energy = 99;
  const owned = EKA.grantCard(cardId);
  bb.hand = [{ src: 'deck', u: owned.u, id: cardId, bg: 0 }];   // measured with the card in hand
  const before = {
    flat: EKA.attackBonus().flat, mul: EKA.attackBonus().mul, hits: EKA.attackBonus().hits,
    shield: bb.shield, def: bb.mods.def, thorns: bb.mods.thorns,
    hp: bb.mine.hp, max: bb.mine.max, hand: bb.hand.length, energy: bb.energy,
    riders: bb.mods.riders.length, might: EKA.G.might, piles: bb.disc.length + bb.exh.length,
  };
  EKA.playCard(0);
  const after = {
    flat: EKA.attackBonus().flat, mul: EKA.attackBonus().mul, hits: EKA.attackBonus().hits,
    shield: bb.shield, def: bb.mods.def, thorns: bb.mods.thorns,
    hp: bb.mine.hp, max: bb.mine.max, hand: bb.hand.length, energy: bb.energy,
    riders: bb.mods.riders.length, might: EKA.G.might, piles: bb.disc.length + bb.exh.length,
  };
  return { b: bb, owned, before, after, v: EKA.cardValue({ id: cardId, plus: 0, bg: 0 }) };
};
for (const id of CARD_IDS) {
  const c = CARDS[id];
  const fx = c.fx || {};
  const r = bench(id);
  const gained = (k) => r.after[k] - r.before[k];
  // Whatever `vt` names, the number moved by exactly that much.
  if (c.vt === 'edge') eq(gained('flat'), r.v, `${id}: next attack is +${r.v}`);
  if (c.vt === 'atk') eq(gained('flat'), r.v, `${id}: every attack is +${r.v}`);
  if (c.vt === 'might') eq(gained('might'), r.v, `${id}: banks +${r.v} damage permanently`);
  if (c.vt === 'shield') eq(gained('shield'), r.v, `${id}: puts up ${r.v} shield`);
  if (c.vt === 'def') eq(gained('def'), r.v, `${id}: takes ${r.v} less per hit`);
  if (c.vt === 'maxhp') eq(gained('max'), r.v, `${id}: raises max HP by ${r.v}`);
  if (c.vt === 'heal') ok(gained('hp') >= Math.min(r.v, r.before.max - r.before.hp) - (fx.selfdmg || 0),
    `${id}: heals ${r.v}`);
  // The card itself left the hand, so drawing v means the hand ends v-1 up.
  if (c.vt === 'draw') eq(gained('hand'), r.v - 1, `${id}: draws ${r.v}`);
  if (fx.draw) ok(gained('hand') >= fx.draw - 1, `${id}: also draws ${fx.draw}`);
  if (fx.energy) ok(gained('energy') >= fx.energy - c.cost, `${id}: also gives ${fx.energy} energy`);
  // And every rider in `fx` did its thing too.
  if (fx.st && c.kind === 'power') ok(gained('riders') >= 1, `${id}: rides on every attack`);
  if (fx.st && c.kind !== 'power') ok(!!r.b.mods.edgeSt, `${id}: rides on the next attack`);
  if (fx.hits) eq(gained('hits'), fx.hits, `${id}: adds ${fx.hits} swing`);
  if (fx.mul) eq(r.after.mul, r.before.mul * fx.mul, `${id}: multiplies damage by ${fx.mul}`);
  if (fx.thorns) eq(gained('thorns'), fx.thorns, `${id}: bristles for ${fx.thorns}`);
  if (fx.def) ok(gained('def') >= fx.def, `${id}: also takes ${fx.def} less per hit`);
  if (fx.atk) ok(gained('flat') >= fx.atk, `${id}: also adds ${fx.atk} to attacks`);
  if (fx.selfdmg) ok(gained('hp') <= 0, `${id}: costs you HP`);
  if (fx.healFull) eq(r.after.hp, r.after.max, `${id}: heals to full`);
  if (fx.drain) ok(r.b.mods.edgeDrain > 0, `${id}: the swing it sharpens drinks back`);
  if (fx.thorns) ok(gained('thorns') > 0, `${id}: thorns are up`);
  // Exhaust versus discard, and growth, are structural — check them for all.
  if (c.exhaust) eq(r.b.exh.length, 1, `${id}: exhausts instead of discarding`);
  else eq(r.b.disc.filter((x) => x.id === id).length, 1, `${id}: goes to the discard`);
  if (c.grow) eq(r.owned.plus, c.grow, `${id}: grew by ${c.grow} on the play`);
  eq(r.owned.plays, 1, `${id}: the play was counted`);
}
EKA.G.battle = null;

// The audit is only worth having if it would notice. A card whose promised
// number nothing applies must fail the same check the real ones pass.
EKA.CARDS.__probe = { name: 'Probe', r: 'common', cost: 0, kind: 'skill', v: 9, vt: 'shield', txt: 'Gain {v} shield.' };
const honest = bench('__probe');
eq(honest.after.shield - honest.before.shield, 9, 'the audit passes a card that keeps its word');
EKA.CARDS.__probe.vt = 'nonsense';                // nothing reads this
const liar = bench('__probe');
eq(liar.after.shield - liar.before.shield, 0, 'and would have caught one that did not');
delete EKA.CARDS.__probe;

// The riders are only worth having if they actually land on the foe.
section('riders land on what you hit');
EKA.G.might = 0;
EKA.G.party = [EKA.mkMon('pyrelynx', 40)];
EKA.G.battle = null;
EKA.startBattle({ foe: EKA.mkMon('gargolem', 20), wild: true });
const rb = EKA.B();
rb.foe.hp = rb.foe.max = 99999;
rb.energy = 99;
const venomCard = EKA.grantCard('venomcoat');
rb.hand = [{ src: 'deck', u: venomCard.u, id: 'venomcoat', bg: 0 }];
EKA.playCard(0);
const kinAtk = rb.mine.moves.find((m) => EKA.MOVES[m.id].pow);
for (let i = 0; i < 30 && !rb.foe.status; i++) {
  rb.hand = [{ src: 'kin', id: kinAtk.id }];
  rb.energy = 99;
  rb.swungTurn = 0;                               // each probe is a fresh turn
  EKA.playCard(0);
}
eq(rb.foe.status, 'snare', 'Venom Coat snares the foe through the kin\'s own attack');
EKA.G.battle = null;

// Guard is flat and honest on the way in, the same as attack is on the way out.
section('guard takes its number off every hit');
EKA.G.party = [EKA.mkMon('pyrelynx', 40)];
EKA.G.battle = null;
EKA.startBattle({ foe: EKA.mkMon('gargolem', 20), wild: true });
const gb = EKA.B();
gb.shield = 0;
const bareHit = EKA.hurtMine([], 20, 'test');
gb.mine.hp = gb.mine.max;
gb.mods.def = 6;
const guardedHit = EKA.hurtMine([], 20, 'test');
eq(bareHit - guardedHit, 6, 'six guard takes six off the hit');
gb.mods.def = 999;
ok(EKA.hurtMine([], 20, 'test') >= 1, 'and a hit never falls to nothing however much guard you stack');
EKA.G.battle = null;

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

section('cards that are decisions rather than numbers');
// Three mechanics went in because thirty of thirty-seven cards were "+N to a
// thing" and a measured run used the same six of them. Each one is checked
// here against the real playCard/endTurn, not a model of them.

// ---- retain: it stays in your hand across the turn ----------------------
{
  const g = fresh();
  g.G.party = [g.mkMon('pyrelynx', 30)];
  g.startBattle({ foe: g.mkMon('gargolem', 30), wild: true });
  const b = g.B();
  const held = g.mkCard('dewdrop');
  g.G.cards.push(held);
  b.hand = [{ src: 'deck', u: held.u, id: 'dewdrop' }, { src: 'deck', u: -1, id: 'guard' }];
  ok(g.CARDS.dewdrop.retain, 'Dewdrop is a card you hold');
  ok(!g.CARDS.guard.retain, 'Guard is not');
  g.endTurn();
  const ids = g.B().hand.filter((c) => c.src === 'deck').map((c) => c.id);
  ok(ids.includes('dewdrop'), 'the retained card is still in hand next turn');
  ok(!g.B().disc.some((c) => c.id === 'dewdrop'), 'and not in the discard');
  ok(g.B().disc.some((c) => c.id === 'guard'), 'while the ordinary one went to the discard');
}

// ---- combo: worth more when it is not the first card of the turn --------
{
  const g = fresh();
  g.G.party = [g.mkMon('pyrelynx', 30)];
  const solo = (first) => {
    g.G.battle = null;
    g.startBattle({ foe: g.mkMon('gargolem', 40), wild: true });
    const b = g.B();
    b.energy = 9;
    const c = g.mkCard('shieldwall'); g.G.cards.push(c);
    b.hand = first ? [{ src: 'deck', u: -2, id: 'quickstep' }, { src: 'deck', u: c.u, id: 'shieldwall' }]
                   : [{ src: 'deck', u: c.u, id: 'shieldwall' }];
    if (first) g.playCard(0);
    g.playCard(b.hand.findIndex((h) => h.id === 'shieldwall'));
    return b.shield;
  };
  const alone = solo(false), after = solo(true);
  eq(g.CARDS.shieldwall.combo, 10, 'Shieldwall has a combo bonus');
  eq(after - alone, 10, `it is worth ${after - alone} more played second (${alone} → ${after})`);
}

// ---- chain: it gets cheaper the more you have played --------------------
{
  const g = fresh();
  g.G.party = [g.mkMon('pyrelynx', 30)];
  g.startBattle({ foe: g.mkMon('gargolem', 40), wild: true });
  const b = g.B();
  b.energy = 9;
  const fang = { src: 'deck', u: -3, id: 'fanghone' };
  eq(g.cardCost(fang), g.CARDS.fanghone.cost, 'a chain card is full price at the top of the turn');
  b.hand = [{ src: 'deck', u: -4, id: 'quickstep' }, fang];
  g.playCard(0);
  eq(g.cardCost(fang), Math.max(0, g.CARDS.fanghone.cost - 1), 'and a pound cheaper after one card');
  // Never free-and-then-negative.
  for (let i = 0; i < 6; i++) { b.hand.unshift({ src: 'deck', u: -9, id: 'quickstep' }); g.playCard(0); }
  ok(g.cardCost(fang) >= 0, 'a chain never goes below nothing');
  // A fresh turn resets it: the discount is this turn's, not the fight's.
  ok(b.playedTurn > 0, 'the count is up after a turn of playing');
  g.startPlayerTurn([]);
  eq(b.playedTurn, 0, 'and back to nothing at the top of the next turn');
  eq(g.cardCost(fang), g.CARDS.fanghone.cost, 'so the chain card is full price again');
}

// ---- every mechanic is on a card, and every card says what it does -------
for (const id of CARD_IDS) {
  const c = CARDS[id];
  // Keywords, not sentences: a mechanic is named once and learned once, which
  // is also the only way the rules text fits on the card face.
  if (c.retain) ok(/\bRetain\b/.test(c.txt), `${c.name} is keyworded Retain`);
  if (c.combo) ok(new RegExp(`Combo \\+${c.combo}\\b`).test(c.txt), `${c.name} names its Combo value`);
  if (c.chain) ok(/\bChain\b/.test(c.txt), `${c.name} is keyworded Chain`);
  // …and no card claims a keyword it does not have.
  if (/\bRetain\b/.test(c.txt)) ok(c.retain, `${c.name} says Retain and means it`);
  if (/\bCombo\b/.test(c.txt)) ok(c.combo, `${c.name} says Combo and means it`);
  if (/\bChain\b/.test(c.txt)) ok(c.chain, `${c.name} says Chain and means it`);
}
ok(CARD_IDS.filter((id) => CARDS[id].retain).length >= 3, 'more than one card is worth holding');
ok(CARD_IDS.filter((id) => CARDS[id].combo).length >= 3, 'and more than one rewards sequencing');
ok(CARD_IDS.filter((id) => CARDS[id].chain).length >= 3, 'and more than one rewards setting up');

section('a win puts something back');
// A measured run walked to the Wayhouse five times before Crown Hollow. The
// second wind is proportional, so a hard fight pays and a walkover does not.
{
  const g = fresh();
  g.G.party = [g.mkMon('pyrelynx', 30)];
  g.startBattle({ foe: g.mkMon('sproutle', 2), wild: true });
  const b = g.B();
  // A fight that cost you nothing gives you nothing.
  b.hpMark = b.mine.hp;
  b.foe.hp = 0;
  const log1 = [];
  g.resolveFoeDown(log1);
  eq(b.mine.hp, b.mine.max, 'an untouched kin is still untouched');

  // A fight that hurt gives it back, up to the cap.
  g.G.battle = null;
  g.startBattle({ foe: g.mkMon('sproutle', 2), wild: true });
  const b2 = g.B();
  b2.hpMark = b2.mine.max;
  b2.mine.hp = Math.round(b2.mine.max * .4);
  const before = b2.mine.hp;
  b2.foe.hp = 0;
  g.resolveFoeDown([]);
  ok(b2.mine.hp > before, `it got something back (${before} → ${b2.mine.hp})`);
  ok(b2.mine.hp - before <= Math.round(b2.mine.max * g.RALLY_CAP) + 1,
    'and never more than the cap');
  ok(b2.mine.hp <= b2.mine.max, 'and never past full');
  eq(b2.hpMark, b2.mine.hp, 'the next foe is measured from where this one left it');
}

section('a reward always reaches the deck');
// With the deck full, taking a card used to put it somewhere you would never
// draw it, so the offer stopped being a decision part-way through a run.
{
  const g = fresh();
  g.G.cards = []; g.G.deck = []; g.G.nextUid = 0;
  while (g.G.deck.length < g.DECK_MAX) g.grantCard('guard');
  eq(g.G.deck.length, g.DECK_MAX, 'the deck is full');
  // Make one card obviously the least used.
  const idle = g.ownedCard(g.G.deck[3]);
  for (const u of g.G.deck) { const o = g.ownedCard(u); o.plays = o === idle ? 0 : 5; }
  const taken = g.grantCard('soulfang');
  eq(g.G.deck.length, g.DECK_MAX, 'the deck is still exactly full');
  ok(g.G.deck.includes(taken.u), 'and the new card is in it');
  ok(!g.G.deck.includes(idle.u), 'the copy you had played least came out');
  ok(g.G.cards.some((c) => c.u === idle.u), 'and it is still yours, in the collection');
  ok(taken.replaced, `the offer can say what it replaced (${taken.replaced})`);
}

section('a full deck asks what comes out');
// A twelve-card deck makes the offer the first half of a decision: something
// has to go, and the game must not pick for you.
{
  const g = fresh();
  g.G.cards = []; g.G.deck = []; g.G.nextUid = 0;
  while (g.G.deck.length < g.DECK_MAX) g.grantCard('guard');
  eq(g.G.deck.length, g.DECK_MAX, 'the deck is full');
  // Asked for: the card is yours but stays out of the deck until you choose.
  const asked = g.grantCard('soulfang', true);
  ok(g.G.cards.some((c) => c.u === asked.u), 'the card is owned');
  ok(!g.G.deck.includes(asked.u), 'but it is not in the deck yet');
  eq(g.G.deck.length, g.DECK_MAX, 'and nothing was silently thrown out');

  // The swap screen lists the deck and nothing else, and has no way out.
  g.openScreen('swap', { newCard: asked.u });
  eq(g.G.screen.kind, 'swap', 'the swap screen opened');
  eq(g.G.screen.list.length, g.DECK_MAX, 'it lists the whole deck');
  g.closeScreen();
  eq(g.G.screen && g.G.screen.kind, 'swap', 'and there is no way out but choosing');
  g.renderScreen();
  ok(true, 'it renders');

  const out = g.G.screen.list[3];
  g.G.screen.i = 3;
  g.screenSelect();
  eq(g.G.deck.length, g.DECK_MAX, 'the deck is still exactly full');
  ok(g.G.deck.includes(asked.u), 'the new card went in');
  ok(!g.G.deck.includes(out.u), 'the one you picked came out');
  ok(g.G.cards.some((c) => c.u === out.u), 'and it is still yours');
  eq(g.G.screen, null, 'the screen closed');
}

// Chests pull three or four at a time, so they still make room themselves —
// being asked four times in a row is not a decision, it is a form.
{
  const g = fresh();
  g.G.cards = []; g.G.deck = []; g.G.nextUid = 0;
  while (g.G.deck.length < g.DECK_MAX) g.grantCard('guard');
  const auto = g.grantCard('soulfang');
  ok(g.G.deck.includes(auto.u), 'an unasked grant lands in the deck');
  eq(g.G.deck.length, g.DECK_MAX, 'and the deck stays its size');
  ok(auto.replaced, `and it knows what it replaced (${auto.replaced})`);
}

// A card whose definition has gone — an old save, a renamed id — must not take
// the game down, and should be the first thing evicted.
{
  const g = fresh();
  g.CARDS.__gone = { name: 'Gone', r: 'legendary', cost: 1, kind: 'skill', v: 1, vt: 'shield', txt: '{v}' };
  g.G.cards = []; g.G.deck = []; g.G.nextUid = 0;
  const ghost = g.grantCard('__gone');
  while (g.G.deck.length < g.DECK_MAX) g.grantCard('guard');
  delete g.CARDS.__gone;
  eq(g.cardCost({ src: 'deck', u: ghost.u, id: '__gone' }), 0, 'a card with no definition costs nothing');
  eq(g.cardName({ src: 'deck', u: ghost.u, id: '__gone' }), '?', 'and reads as unknown rather than throwing');
  const fresher = g.grantCard('edge');
  ok(!g.G.deck.includes(ghost.u), 'and it is the first thing out when room is needed');
  ok(g.G.deck.includes(fresher.u), 'while the real card goes in');
}

section('speed decides who opens');
// Fights ran under two turns, so a foe that always moved second often never
// moved at all. Something faster than you now lands the first blow.
{
  const g = fresh();
  g.G.party = [g.mkMon('gargolem', 20)];          // slow
  const quick = g.mkMon('zaplet', 20);            // fast
  ok(g.effStat(quick, 'spd') > g.effStat(g.G.party[0], 'spd'), 'the wild kin really is faster');
  const full = g.G.party[0].hp;
  g.startBattle({ foe: quick, wild: true });
  ok(g.B().mine.hp <= full, 'a faster wild kin gets the first word');
  ok(g.B().log && g.B().log.length, 'and the opening is played back rather than silent');

  // A trainer squares up with you: the opening rival fight is meant to be
  // winnable rather than a coin toss on speed.
  g.G.battle = null;
  g.G.party = [g.mkMon('gargolem', 20)];
  g.G.party[0].hp = g.G.party[0].max;
  g.startBattle({ foe: g.mkMon('zaplet', 20), npc: { name: 'Wick', id: 't_x', trainer: { team: [], prize: 0 } } });
  eq(g.B().mine.hp, g.B().mine.max, 'a trainer does not get a free hit in');

  // And a slower foe never opens, however the fight starts.
  g.G.battle = null;
  g.G.party = [g.mkMon('zaplet', 20)];
  g.startBattle({ foe: g.mkMon('gargolem', 20), wild: true });
  eq(g.B().mine.hp, g.B().mine.max, 'a slower wild kin waits its turn');
}



section('one swing a turn');
// Three energy and moves costing one or two meant the best line was to attack
// twice and never touch the deck — which is the exact opposite of "your kin
// brings the attacks, your deck makes them land harder", and why a fight was
// over in a turn and a half.
{
  const g = fresh();
  g.G.party = [g.mkMon('pyrelynx', 30)];
  g.startBattle({ foe: g.mkMon('gargolem', 30), wild: true });
  const bb = g.B();
  bb.foe.hp = bb.foe.max = 99999;                 // nothing dies, so we can count
  const move = bb.mine.moves.find((m) => g.MOVES[m.id].pow);
  bb.hand = [{ src: 'kin', id: move.id }, { src: 'kin', id: move.id }];
  bb.energy = 9;
  eq(bb.swungTurn, 0, 'a fresh turn has not swung yet');
  ok(g.playableNow(bb, bb.hand[0]), 'and the swing is playable');
  const hpBefore = bb.foe.hp;
  g.playCard(0);
  eq(bb.swungTurn, 1, 'swinging marks the turn');
  ok(bb.foe.hp <= hpBefore, 'and the swing happened');
  const energyAfter = bb.energy, handAfter = bb.hand.length, hpAfter = bb.foe.hp;
  ok(!g.playableNow(bb, bb.hand[0]), 'the second kin card reads as unplayable');
  g.playCard(0);
  eq(bb.hand.length, handAfter, 'and playing it puts it straight back in hand');
  eq(bb.energy, energyAfter, 'costs nothing');
  eq(bb.foe.hp, hpAfter, 'and does no damage');

  // A support card is still free to play — the limit is on the swing, not the turn.
  const owned = g.grantCard('edge');
  bb.hand.push({ src: 'deck', u: owned.u, id: 'edge', bg: 0 });
  ok(g.playableNow(bb, bb.hand[bb.hand.length - 1]), 'support is unaffected');

  // The aim never rests on a card that will refuse the keypress.
  bb.sel = 0;
  g.aimPlayable(bb);
  ok(g.playableNow(bb, bb.hand[bb.sel]), 'the aim moves off a spent swing');

  // And ending the turn hands the swing back.
  g.endTurn();
  eq(g.B().swungTurn, 0, 'a new turn swings again');
}

section('a trainer works a plan, and telegraphs every beat of it');
// Every hand-authored fight was "two kin, no plan": the foe scored its moves
// each turn and never built toward anything. A plan is a short loop of beats,
// each announced a turn ahead through the intent line, so the point is never
// surprise — it is that you can see the big hit coming.
{
  const g = fresh();
  const npc = { name: 'Wick', id: 't_x', trainer: { team: [], prize: 0, plan: ['sharpen', 'swing'] } };
  g.G.party = [g.mkMon('gargolem', 40)];
  g.startBattle({ foe: g.mkMon('sproutle', 20), npc });
  const bb = g.B();
  bb.mine.hp = bb.mine.max = 99999;               // survive the payoff, so we can read it
  // Leave it only one thing to do on a swing beat, so the payoff is readable.
  bb.foe.moves = bb.foe.moves.filter((m) => g.MOVES[m.id].pow).slice(0, 1);
  ok(bb.foe.moves.length, 'the foe has an attack to pay the plan off with');
  ok(!!bb.plan, 'the trainer brought a plan');
  eq(bb.intent.kind, 'plan', 'and the first beat is telegraphed before you act');
  eq(bb.intent.name, g.PLANS.sharpen.label, 'by name');
  ok(bb.intent.n > 0, `with the number on it (+${bb.intent.n})`);
  ok(/\+/.test(bb.intent.tell), 'and a line the hand can print');
  const edge = bb.intent.n;
  eq(bb.foeEdge, 0, 'nothing is banked yet');
  const hpBefore = bb.mine.hp;
  g.endTurn();
  eq(bb.foeEdge, edge, 'ending the turn is when the beat happens');
  eq(bb.mine.hp, hpBefore, 'and a setup beat costs the foe its attack');
  eq(bb.intent.kind, 'attack', 'the payoff is telegraphed in turn');
  g.endTurn();
  eq(bb.foeEdge, 0, 'the edge is spent on the swing it was saved for');
  ok(bb.mine.hp < hpBefore, 'which lands');
}

section('a braced trainer eats a hit, and an aimed one goes round your shield');
{
  const g = fresh();
  const npc = { name: 'Hale', id: 't_y', trainer: { team: [], prize: 0, plan: ['brace', 'swing'] } };
  // A small attacker against a big guard, so the whole swing has somewhere to go.
  g.G.party = [g.mkMon('pyrelynx', 5)];
  g.startBattle({ foe: g.mkMon('gargolem', 20), npc });
  const bb = g.B();
  bb.foe.hp = bb.foe.max = 99999;
  bb.mine.hp = bb.mine.max = 99999;
  eq(bb.intent.step, 'brace', 'the guard is announced first');
  const guard = bb.intent.n;
  g.endTurn();
  eq(bb.foeShield, guard, 'and banked when the turn ends');
  const before = bb.foe.hp;
  const move = bb.mine.moves.find((m) => g.MOVES[m.id].pow);
  // Moves can miss, so swing until one actually connects with the guard.
  for (let i = 0; i < 40 && bb.foeShield === guard; i++) {
    bb.hand = [{ src: 'kin', id: move.id }];
    bb.energy = 9; bb.swungTurn = 0;
    g.playCard(0);
  }
  ok(bb.foeShield < guard, 'the guard eats the swing before the health does');
  eq(bb.foe.hp, before, 'and none of it reaches the bar');

  // Aim: the answer to a shield you banked because you saw the sharpen coming.
  const h = fresh();
  h.G.party = [h.mkMon('gargolem', 40)];
  h.startBattle({ foe: h.mkMon('sproutle', 30), npc: { name: 'Wick', id: 't_z', trainer: { team: [], prize: 0, plan: ['aim', 'swing'] } } });
  const hb = h.B();
  hb.mine.hp = hb.mine.max = 99999;
  hb.foe.moves = hb.foe.moves.filter((m) => h.MOVES[m.id].pow).slice(0, 1);
  eq(hb.intent.step, 'aim', 'taking aim is telegraphed like anything else');
  eq(hb.intent.n, 0, 'and carries no number, because it is not a number');
  h.endTurn();
  eq(hb.foePierce, 1, 'the aim is held');
  hb.shield = 9999;                               // everything you could possibly bank
  const hp = hb.mine.hp;
  h.endTurn();
  ok(hb.mine.hp < hp, 'and the hit lands anyway');
  ok(!(h.B().log || []).some((e) => /Shield absorbs/.test(e.msg || '')),
    'without a point of it going through the shield');
  eq(hb.foePierce, 0, 'the aim is spent on the one swing');
}

section('the three Wick fights are the same person getting better');
// The arc is data, so it is worth asserting as data: every rival fight has a
// plan, each one is longer than the last, and each knows a beat the one before
// it did not.
{
  const g = fresh();
  const wicks = ['t_wick1', 't_wick2', 't_wick3'].map((id) => {
    for (const m of Object.values(g.MAPS)) {
      const n = (m.npcs || []).find((x) => x.id === id);
      if (n) return n;
    }
    return null;
  });
  ok(wicks.every(Boolean), 'all three Wick fights are on the map');
  const plans = wicks.map((n) => n.trainer.plan);
  ok(plans.every((p) => Array.isArray(p) && p.length), 'and every one of them has a plan');
  ok(plans[0].length < plans[1].length && plans[1].length < plans[2].length,
    `the plan gets longer each time (${plans.map((p) => p.length).join(' < ')})`);
  const kinds = plans.map((p) => new Set(p.filter((s) => s !== 'swing')));
  eq(kinds[0].size, 1, 'the first Wick has one idea');
  ok(kinds[1].size > kinds[0].size, 'the second has learned another');
  ok(kinds[2].size > kinds[1].size, 'and the third has learned a third');
  for (const p of plans) for (const s of p) ok(!!g.PLANS[s], `${s} is a beat the game knows`);
  // Nobody gets two setup turns in a row: that is a free turn, not a plan.
  for (const p of plans) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i], bnext = p[(i + 1) % p.length];
      ok(a === 'swing' || bnext === 'swing', `${a} is paid off before the next beat`);
    }
  }
  // And every trainer in the game has one, not just the rival.
  let trainers = 0, planned = 0;
  for (const m of Object.values(g.MAPS)) {
    for (const n of m.npcs || []) {
      if (!n.trainer) continue;
      trainers++;
      if (n.trainer.plan) planned++;
    }
  }
  ok(trainers >= 8, `there are trainers to check (${trainers})`);
  eq(planned, trainers, 'every trainer in the valley brings a plan');
}

section('a trainer\'s kin is not a wild kin');
// Trainers hit at full strength and come in teams, so each of their kin needs a
// far smaller pool than a lone wild one — giving them the wild number made the
// opening rival fight a coin toss.
{
  ok(EK.TRAINER_HP_MUL < EK.FOE_HP_MUL, 'a trainer\'s kin carries less of the fight on its own');
  ok(EK.WILD_DMG_MUL < 1, 'and a wild kin hits softer than a trained one');
  const g = fresh();
  g.G.party = [g.mkMon('pyrelynx', 30)];
  g.startBattle({ foe: g.mkMon('gargolem', 20), wild: true });
  const wildMax = g.B().foe.max;
  g.G.battle = null;
  g.startBattle({ foe: g.mkMon('gargolem', 20), npc: { name: 'X', id: 't_w', trainer: { team: [], prize: 0 } } });
  ok(g.B().foe.max < wildMax, `the same kin is tougher in the grass (${wildMax} vs ${g.B().foe.max})`);
}


section('the chart points the same way, but not as hard');
// The chart says who beats whom, and that is knowledge worth having. What it
// must not do is decide the fight before a card is played — measured over twelve
// runs with one kin, the element being with you or against you swung the loss
// rate from 6% to 57% with the level gap identical in both.
{
  const g = fresh();
  eq(g.EFF_DMG(1), 1, 'a neutral hit is untouched');
  eq(g.EFF_DMG(0), 0, 'and immune still means immune');
  ok(g.EFF_DMG(2) > 1 && g.EFF_DMG(2) < 2, `an advantage still helps, less (${g.EFF_DMG(2)}×)`);
  ok(g.EFF_DMG(.5) > .5 && g.EFF_DMG(.5) < 1, `a resist still hurts, less (${g.EFF_DMG(.5)}×)`);
  ok(g.EFF_DMG(4) > g.EFF_DMG(2), 'a stacked weakness is still worse than a single one');
  ok(g.EFF_DMG(.25) < g.EFF_DMG(.5), 'and a stacked resist still better');
  // Softening must never flip the direction — that would make the dex a lie.
  for (const e of [.25, .5, 1, 2, 4]) {
    const d = g.EFF_DMG(e);
    ok(e > 1 ? d > 1 : e < 1 ? d < 1 : d === 1, `${e}× still reads as ${e > 1 ? 'good' : e < 1 ? 'bad' : 'neutral'}`);
  }
  // The chart itself is untouched, because that is what the dex shows and what
  // "It's brutally effective!" is about.
  eq(g.effect('Ember', ['Verdant']), 2, 'the chart still says 2×');

  // And it shows up on the bar the way it says it does.
  const one = g.mkMon('pyrelynx', 30);
  const wet = g.mkMon('dewdrip', 30), dry = g.mkMon('sproutle', 30);
  const roll = { crit: false, roll: 1 };
  const good = g.damageOf(one, dry, 'cinder', roll).dmg;
  const bad = g.damageOf(one, wet, 'cinder', roll).dmg;
  ok(good > bad, 'the right element still hits harder');
  ok(good < bad * 4, `but not four times as hard (${good} vs ${bad})`);
}

section('a cornered wild kin gathers itself, out loud');
// Two fights in five were never in doubt, and the reason was not that they were
// easy — a wild fight was four identical small hits with no moment in it. Same
// damage, gathered into one swing you are told about a turn ahead.
{
  const g = fresh();
  g.G.party = [g.mkMon('gargolem', 40)];
  g.startBattle({ foe: g.mkMon('sproutle', 30), wild: true });
  const bb = g.B();
  bb.mine.hp = bb.mine.max = 99999;
  bb.foe.moves = bb.foe.moves.filter((m) => g.MOVES[m.id].pow).slice(0, 1);
  eq(bb.cornered, 0, 'a healthy wild kin is not cornered');
  eq(bb.foeEdge, 0, 'and has nothing banked');
  const calm = bb.intent.dmg;
  ok(!/cornered/.test(bb.intent.name), 'nor does the line say so');

  // Hurt it past the line and read the intent again — the telegraph is the point.
  bb.foe.hp = Math.floor(bb.foe.max * (g.CORNER_AT - .05));
  g.readIntent();
  eq(bb.cornered, 1, 'past the line it corners');
  ok(bb.foeEdge > 0, `and gathers itself (+${bb.foeEdge})`);
  ok(/cornered/.test(bb.intent.name), 'the line says so a turn ahead');
  ok(bb.intent.dmg > calm, `and the number it shows goes up with it (${calm} → ${bb.intent.dmg})`);

  // It is one swing, not a new state of being.
  const hp = bb.mine.hp;
  g.endTurn();
  ok(bb.mine.hp < hp, 'the big one lands');
  eq(bb.foeEdge, 0, 'and spends the whole of it');
  g.readIntent();
  ok(!/cornered/.test(bb.intent.name), 'it does not corner twice');

  // A trainer's kin does not do this — they have plans instead.
  const t = fresh();
  t.G.party = [t.mkMon('gargolem', 40)];
  t.startBattle({ foe: t.mkMon('sproutle', 30), npc: { name: 'X', id: 't_c', trainer: { team: [], prize: 0 } } });
  const tb = t.B();
  tb.foe.hp = 1;
  t.readIntent();
  eq(tb.cornered, 0, 'a trained kin does not corner');
}
done('emberkin_cards');
