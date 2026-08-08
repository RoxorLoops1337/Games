// EMBERKIN — data, battle, world and save suite.
//
// Drives the real game through window.EK with a stubbed DOM. The point of each
// block is a property the game must always have, not a snapshot of today's
// numbers: type maths is symmetric, damage responds to the chart, capture gets
// easier as HP drops, levels raise stats, maps are walkable end to end, and a
// save round-trips.
//
// Run: node tests/emberkin.test.mjs
import { loadGame, mkCtx, autoFight, withDeck, ok, eq, done, section } from './emberkin_lib.mjs';

const EK = withDeck(loadGame());
const { DEX, DEX_ORDER, MOVES, ITEMS, MAPS, TYPES, CHART } = EK;

// ---------------------------------------------------------------- data --
section('dex + moves are internally consistent');
eq(DEX_ORDER.length, 19, 'dex has 19 species');
for (const id of DEX_ORDER) {
  const sp = DEX[id];
  ok(!!sp.name, `${id} has a name`);
  ok(sp.types.length >= 1 && sp.types.length <= 2, `${id} has 1-2 types`);
  sp.types.forEach((t) => ok(!!TYPES[t] && t !== 'Wild', `${id} type ${t} is a real creature type`));
  eq(sp.base.length, 4, `${id} has 4 base stats`);
  sp.base.forEach((b) => ok(b > 0 && b < 200, `${id} base stat ${b} in range`));
  ok(sp.rate > 0 && sp.rate <= 255, `${id} catch rate in range`);
  ok(sp.dex.length > 20, `${id} has dex flavour`);
  ok(sp.learn.some((e) => e[0] === 1), `${id} knows something at level 1`);
  for (const [lv, mv] of sp.learn) {
    ok(!!MOVES[mv], `${id} learns real move ${mv}`);
    ok(lv >= 1 && lv <= 60, `${id} learn level ${lv} sane`);
  }
  if (sp.evo) {
    ok(!!DEX[sp.evo[0]], `${id} evolves into a real species`);
    ok(sp.evo[1] >= 5 && sp.evo[1] <= 60, `${id} evolves at a sane level`);
    const sum = (x) => DEX[x].base.reduce((a, b) => a + b, 0);
    ok(sum(sp.evo[0]) > sum(id), `${sp.evo[0]} is stronger than ${id}`);
  }
}
// A kin fights with its own element. Nothing learns a Wild move — a Cindercub
// bites with fire, not with a generic Nip — so `Wild` is only the fallback for
// the move you are given when every real one is spent.
section('every kin fights with its own element');
for (const id of DEX_ORDER) {
  const sp = DEX[id];
  for (const [, mv] of sp.learn) {
    ok(sp.types.includes(MOVES[mv].type),
      `${id} (${sp.types.join('/')}) learns ${mv}, which is ${MOVES[mv].type}`);
  }
}
// And each element carries a full kit, so no kin has to reach outside itself.
for (const t of Object.keys(TYPES)) {
  if (t === 'Wild') continue;
  const kit = Object.keys(MOVES).filter((m) => MOVES[m].type === t);
  const pow = kit.filter((m) => MOVES[m].pow > 0).map((m) => MOVES[m].pow);
  ok(kit.length >= 6, `${t} has a full kit (${kit.length} moves)`);
  ok(Math.min(...pow) <= 45, `${t} has something cheap to open with`);
  ok(Math.max(...pow) >= 95, `${t} has a finisher`);
  ok(kit.some((m) => (MOVES[m].fx || {}).pri), `${t} has a move that strikes first`);
  ok(kit.some((m) => !MOVES[m].pow), `${t} has something that is not just damage`);
}
ok(DEX_ORDER.every((id) => !DEX[id].learn.some(([, mv]) => MOVES[mv].type === 'Wild')),
  'no kin learns a Wild move');
eq(MOVES.falter.type, 'Wild', 'the last-resort move is the one Wild move left');

section('dex + moves are internally consistent (moves)');
for (const [id, m] of Object.entries(MOVES)) {
  ok(!!TYPES[m.type], `${id} has a real type`);
  ok(m.pp >= 1 && m.pp <= 40, `${id} pp sane`);
  ok(m.pow >= 0 && m.pow <= 130, `${id} power sane`);
  ok(m.pow > 0 || !!m.fx, `${id} either hits or does something`);
}
// Every creature type must be reachable offensively and be beatable.
for (const t of Object.keys(TYPES)) {
  if (t === 'Wild') continue;
  const beatenBy = Object.keys(CHART).filter((a) => (CHART[a][t] || 1) > 1);
  ok(beatenBy.length > 0, `${t} is weak to something`);
  ok(Object.keys(MOVES).some((m) => MOVES[m].type === t && MOVES[m].pow > 0), `${t} has an attacking move`);
}

section('stats and levels');
const cub5 = EK.mkMon('cindercub', 5);
const cub50 = EK.mkMon('cindercub', 50);
ok(cub50.max > cub5.max * 2, 'HP grows a lot with level');
ok(cub50.atk > cub5.atk, 'attack grows with level');
eq(cub5.hp, cub5.max, 'a new creature is at full HP');
ok(cub5.moves.length >= 2 && cub5.moves.length <= 4, 'starting kit is 2-4 moves');
cub5.moves.forEach((m) => ok(EK.moveCost(m.id) >= 0 && EK.moveCost(m.id) <= 3, `${m.id} costs 0-3 energy as a card`));
eq(EK.movesAt('pyrelynx', 60).length, 4, 'a maxed learnset keeps 4 moves');
ok(EK.xpFor(10) > EK.xpFor(9), 'xp curve is monotone');

// ------------------------------------------------------------- battle --
section('type chart and damage');
eq(EK.effect('Ember', ['Verdant']), 2, 'Ember beats Verdant');
eq(EK.effect('Ember', ['Tide']), 0.5, 'Ember flops on Tide');
eq(EK.effect('Tide', ['Ember', 'Stone']), 4, 'dual weakness stacks to 4×');
eq(EK.effect('Verdant', ['Ember', 'Stone']), 1, 'weak + resist cancels out');
eq(EK.effect('Wild', ['Aether']), 1, 'Wild is neutral');

const atk = EK.mkMon('pyrelynx', 30), defV = EK.mkMon('sproutle', 30), defT = EK.mkMon('dewdrip', 30);
const dv = EK.damageOf(atk, defV, 'cinder', { crit: false, roll: 1 }).dmg;
const dt = EK.damageOf(atk, defT, 'cinder', { crit: false, roll: 1 }).dmg;
// The chart points the same way, but not as hard: a 2x entry lands as 1.6x and
// a 0.5x as 0.65x, so the right element is the best thing you can bring without
// the wrong one deciding the fight before a card is played. The spread used to
// be fourfold, which is what made half of every run a coin toss on the chart.
ok(dv > dt * 2, `super-effective still hits far harder than resisted (${(dv / dt).toFixed(2)}x)`);
ok(dv < dt * 3.2, 'but not so much that the matchup is the whole fight');
// Same power, one with STAB and effectiveness behind it, one without.
const noStab = EK.damageOf(atk, defV, 'brine', { crit: false, roll: 1 }).dmg;
ok(EK.damageOf(atk, defV, 'cinder', { crit: false, roll: 1 }).dmg > noStab,
  'STAB + effectiveness beats the same power with neither');
const critDmg = EK.damageOf(atk, defV, 'cinder', { crit: true, roll: 1 }).dmg;
ok(critDmg > dv, 'crits hurt more');
eq(EK.damageOf(atk, defV, 'ashveil', { crit: false, roll: 1 }).dmg, 0, 'status moves deal no damage');

section('stat stages');
const s = EK.mkMon('zaplet', 20);
eq(EK.effStat(s, 'atk'), s.atk, 'no stage = base');
s.stages.atk = 2;
ok(EK.effStat(s, 'atk') > s.atk, '+2 raises attack');
s.stages.atk = -2;
ok(EK.effStat(s, 'atk') < s.atk, '-2 lowers attack');
s.stages.atk = 0;
s.status = 'burn';
ok(EK.effStat(s, 'atk') < s.atk, 'burn softens attack');
s.status = 'chill';
ok(EK.effStat(s, 'spd') < s.spd, 'chill halves speed');

section('a wild battle is played from a hand of cards');
const G = EK.G;
G.party = [EK.mkMon('pyrelynx', 40)];
G.bag = { bloomorb: 30, salve: 5 };
ok(EK.startBattle({ foe: EK.mkMon('sproutle', 5), wild: true }), 'battle starts');
const b0 = EK.B();
eq(b0.hand.length, 5, 'you are dealt five cards');
eq(b0.energy, 3, 'and three energy');
ok(b0.hand.concat(b0.draw, b0.disc).some((c) => c.src === 'kin'), 'the kin shuffles its own moves in');
eq(b0.draw.length + b0.hand.length + b0.disc.length,
   EK.deckCards().length + G.party[0].moves.length, 'every card is somewhere in the piles');
ok(!!b0.intent && !!b0.intent.name, 'the foe telegraphs what it will do');
const affordable = b0.hand.findIndex((c) => EK.cardCost(c) <= b0.energy);
const energyBefore = b0.energy;
const costPaid = EK.cardCost(b0.hand[affordable]);
const played = b0.hand[affordable];
const cardLog = EK.playCard(affordable);
ok(cardLog.length > 0, 'playing a card logs what happened');
eq(b0.energy, energyBefore - costPaid, 'it costs its energy');
// Not a hand-size check: some cards draw, so the hand can refill as it leaves.
ok(!b0.hand.includes(played), 'and that copy leaves your hand');
ok(b0.disc.includes(played) || b0.exh.includes(played), 'landing in the discard or the spent pile');
ok(autoFight(EK), 'the battle resolved');
eq(EK.B().over, 'win', 'a level 40 beats a level 5');
ok(G.party[0].xp > EK.xpFor(40), 'the winner gained experience');
eq(G.dex.sproutle, 1, 'a defeated wild kin is marked seen, not caught');

section('energy, hands and piles behave');
G.party = [EK.mkMon('brookite', 20)];
EK.startBattle({ foe: EK.mkMon('pebblet', 20), wild: true });
const b1 = EK.B();
b1.energy = 0;
const dear = b1.hand.findIndex((c) => EK.cardCost(c) > 0);
if (dear >= 0) {
  const before = b1.hand.length;
  EK.playCard(dear);
  eq(b1.hand.length, before, 'a card you cannot pay for stays in hand');
}
b1.energy = 3;
EK.endTurn();
eq(b1.hand.length, 5, 'ending the turn deals a fresh hand');
eq(b1.energy, 3, 'and refills energy');
b1.disc.push(...b1.draw); b1.draw = [];
const handWas = b1.hand.length;
EK.drawCards([], 3);
ok(b1.hand.length > handWas, 'the discards shuffle back in when the draw pile empties');
EK.G.battle = null;

section('faint, party wipe and switching');
G.party = [EK.mkMon('zaplet', 5), EK.mkMon('mothrix', 5)];
G.party[0].hp = 1;
EK.startBattle({ foe: EK.mkMon('magmane', 50), wild: true });
let guard = 0;
while (!EK.B().over && guard++ < 30) EK.endTurn();
eq(EK.B().over, 'switch', 'one fainted but the bench is not empty');
// Same thing the forced-switch screen does when you send out the next one.
G.party[0].hp = 0;
EK.B().mine = G.party[1];
EK.B().over = null;
EK.swapKinCards(EK.B());
EK.startPlayerTurn([]);
G.party[1].hp = 1;
guard = 0;
while (!EK.B().over && guard++ < 30) EK.endTurn();
eq(EK.B().over, 'lose', 'the whole party down ends the battle');

section('switching swaps the kin cards, not the deck');
G.party = [EK.mkMon('cindercub', 20), EK.mkMon('dewdrip', 20)];
EK.startBattle({ foe: EK.mkMon('mothrix', 5), wild: true });
const b2 = EK.B();
const kinOf = (mon) => mon.moves.map((m) => m.id);
const allKin = () => b2.draw.concat(b2.hand, b2.disc).filter((c) => c.src === 'kin').map((c) => c.id);
ok(allKin().every((id) => kinOf(G.party[0]).includes(id)), 'only the active kin moves are in the deck');
const supportBefore = b2.draw.concat(b2.hand, b2.disc).filter((c) => c.src === 'deck').length;
EK.doAction({ kind: 'switch', idx: 1 });
eq(b2.mine.species, 'dewdrip', 'the bench kin stepped in');
ok(allKin().every((id) => kinOf(G.party[1]).includes(id)), 'and brought its own move cards');
eq(b2.draw.concat(b2.hand, b2.disc).filter((c) => c.src === 'deck').length, supportBefore,
   'the support cards are untouched by the swap');
EK.G.battle = null;

section('trainer battles chain their team and refuse capture');
G.party = [EK.mkMon('tsunaga', 45)];
G.bag = { bloomorb: 5 };
const team = [['cindercub', 5], ['zaplet', 5]];
EK.startBattle({ foe: EK.mkMon('cindercub', 5), team, npc: { name: 'Tester', id: 't_x', trainer: { team, prize: 100 } }, wild: false });
const noRun = EK.doAction({ kind: 'run' });
ok(noRun.some((e) => /no running/i.test(e.t)), 'you cannot flee a trainer');
const noCatch = EK.doAction({ kind: 'item', id: 'bloomorb' });
ok(noCatch.some((e) => /No\./.test(e.t)), 'you cannot catch a trainer kin');
eq(G.bag.bloomorb, 5, 'the refused orb is not consumed');
ok(autoFight(EK), 'the trainer battle resolved');
eq(EK.B().over, 'win', 'beating the whole team wins');
// A trainer has a bench now and may send its kin out in any order, so "the
// second one was used" is the claim, not "the second one was last".
ok(EK.B().roster.every((m) => m.hp <= 0), 'the whole team was sent out and beaten');
ok(EK.gemReward(EK.B()) > 0, 'a trainer win is worth gems');

// A foe can die on its own turn — burn or snare finishing it at end of turn, or
// thorns answering the hit it just landed. The next one has to step in AND the
// turn has to come back to you. It used to stop in the foe phase with an empty
// hand and no energy, and nothing the player pressed could move it again.
for (const how of ['burn', 'thorns']) {
  G.party = [EK.mkMon('tsunaga', 45)];
  const chain = [['cindercub', 5], ['zaplet', 5]];
  EK.G.battle = null;
  EK.startBattle({ foe: EK.mkMon('cindercub', 5), team: chain, npc: { name: 'Tester', id: 't_y', trainer: { team: chain, prize: 100 } }, wild: false });
  const bk = EK.B();
  bk.foePotions = 0;                               // no reaching for the bag; we want it dead
  bk.foe.hp = 1;                                   // one point of anything finishes it
  if (how === 'burn') bk.foe.status = 'burn';
  else bk.mods.thorns = 40;
  EK.endTurn();                                    // the foe swings, then dies to it
  eq(bk.teamIdx, 1, `${how}: the next kin is sent out when the foe dies on its own turn`);
  ok(!bk.over, `${how}: and the battle is not over`);
  eq(bk.phase, 'player', `${how}: the turn comes back to the player`);
  ok(bk.hand.length > 0, `${how}: with a hand to play`);
  ok(bk.energy > 0, `${how}: and energy to play it with`);
  EK.G.battle = null;
}

section('shields, buffs and max HP all wear off with the battle');
G.party = [EK.mkMon('gargolem', 30)];
const rock = G.party[0];
const baseMax = rock.max;
EK.startBattle({ foe: EK.mkMon('pebblet', 30), wild: true });
const b3 = EK.B();
b3.hand = ['guard', 'focus', 'heartroot'].map((id) => ({ src: 'deck', u: EK.grantCard(id).u, id, bg: 0 }));
b3.energy = 9;
EK.playCard(0);
ok(b3.shield > 0, 'Guard puts up a shield');
EK.playCard(0);
ok(EK.attackBonus().flat >= EK.CARDS.focus.v, 'Focus adds its number to every attack for the battle');
EK.playCard(0);
ok(rock.max > baseMax, 'Heartroot raises max HP for the battle');
const hpNow = rock.hp;
const through = EK.hurtMine([], 5, 'test');
ok(through < 5, 'the shield eats damage before HP does');
ok(rock.hp >= hpNow - 5, 'and HP only takes what got through');
EK.clearMods(b3);
eq(rock.max, baseMax, 'max HP goes back to normal after the battle');
eq(EK.attackBonus().flat, 0, 'and the attack bonus is gone with it');
EK.G.battle = null;

// The bonus has to be given back to the kin that got it. Booking one running
// total and taking it off whoever was out at the end let you buff a kin, switch,
// and keep the HP forever — while the kin you switched to paid for it, in the
// save, every battle. Repeat it and one kin grows without limit and the other
// grinds down to 1.
G.party = [EK.mkMon('gargolem', 30), EK.mkMon('brookite', 30)];
const [buffed, bench] = G.party;
const wasBuffed = buffed.max, wasBench = bench.max;
EK.startBattle({ foe: EK.mkMon('pebblet', 30), wild: true });
const b3b = EK.B();
b3b.hand = [{ src: 'deck', u: EK.grantCard('heartroot').u, id: 'heartroot', bg: 0 }];
b3b.energy = 9;
EK.playCard(0);
ok(buffed.max > wasBuffed, 'the active kin gains the max HP');
b3b.mine = bench;                                  // switch, the way the party screen does
EK.swapKinCards(b3b);
EK.clearMods(b3b);
eq(buffed.max, wasBuffed, 'and gives it back even though it was benched at the end');
eq(bench.max, wasBench, 'the kin that came in never pays for it');
ok(G.party.every((m) => m.hp <= m.max && m.hp >= 0), 'nobody is left with more HP than they can hold');
EK.G.battle = null;

section('capture maths');
const weak = EK.mkMon('zaplet', 5); weak.hp = 1;
const fresh = EK.mkMon('zaplet', 5);
ok(EK.captureChance(weak, 1) > EK.captureChance(fresh, 1), 'hurt kin are easier to catch');
ok(EK.captureChance(weak, 2.6) > EK.captureChance(weak, 1), 'a better orb helps');
const statused = EK.mkMon('zaplet', 5); statused.hp = 1; statused.status = 'shock';
ok(EK.captureChance(statused, 1) > EK.captureChance(weak, 1), 'status helps');
ok(EK.captureChance(EK.mkMon('vespyr', 40), 2.6) < EK.captureChance(fresh, 1), 'the legendary resists the best orb');
ok(EK.captureChance(weak, 1) <= 1 && EK.captureChance(weak, 1) >= 0, 'chance stays a probability');

section('catching a wild kin actually catches it');
G.party = [EK.mkMon('tsunaga', 50)];
G.bag = { prismorb: 400 };
G.dex = {}; G.caught = 0;
EK.startBattle({ foe: EK.mkMon('zaplet', 3), wild: true });
EK.B().foe.hp = 1;
let caught = false;
for (let i = 0; i < 400 && !caught; i++) {
  EK.doAction({ kind: 'item', id: 'prismorb' });
  if (EK.B() && EK.B().over === 'caught') caught = true;
  else if (!EK.B() || EK.B().over) { EK.startBattle({ foe: EK.mkMon('zaplet', 3), wild: true }); EK.B().foe.hp = 1; }
  else { EK.B().foe.hp = 1; EK.B().mine.hp = EK.B().mine.max; }
}
ok(caught, 'a weakened kin is eventually caught');
ok(G.bag.prismorb < 400, 'orbs are consumed');
const beforeParty = G.party.length;
EK.addCaught(EK.B().foe);
eq(G.party.length, beforeParty + 1, 'the catch joins the party');
eq(G.dex.zaplet, 2, 'the dex marks it caught');

// Foes fight with FOE_HP_MUL times their real HP. A catch must hand that pool
// back: otherwise every kin you ever caught walks around on double HP, and the
// first level-up recomputes the honest maximum, finds it smaller than what the
// creature is carrying, and drives HP straight through zero.
const kept = G.party[G.party.length - 1];
eq(kept.species, 'zaplet', 'the caught kin is the one that joined');
eq(kept.max, EK.hpAt(EK.DEX.zaplet.base[0], kept.lvl), 'and joins on its own HP, not the fight-sized pool');
ok(kept.hp > 0 && kept.hp <= kept.max, 'alive, and inside its own bar');
const beforeLvl = kept.max;
kept.lvl++; EK.refresh(kept);
ok(kept.hp > 0, 'and levelling it up does not knock it out');
ok(kept.max > beforeLvl, 'the level-up raised its maximum');
ok(kept.hp <= kept.max, 'without leaving it holding more HP than it can');

// The same correction has to survive a creature that is already wrong — an old
// save, or anything else carrying a maximum its stats do not justify.
const bloated = EK.mkMon('zaplet', 10);
bloated.max = bloated.max * 2; bloated.hp = 3;
bloated.lvl++; EK.refresh(bloated);
ok(bloated.hp > 0, 'a bloated maximum is corrected without fainting the creature');
ok(bloated.hp <= bloated.max, 'and it ends up inside its bar');

section('a full party sends the catch to the box');
G.party = ['cindercub', 'dewdrip', 'sproutle', 'zaplet', 'pebblet', 'mothrix'].map((id) => EK.mkMon(id, 5));
G.box = [];
EK.addCaught(EK.mkMon('kindlark', 5));
eq(G.party.length, 6, 'party stays at six');
eq(G.box.length, 1, 'the overflow goes to the box');

section('the box withdraws, stores and swaps');
const boxG = EK.G;
boxG.party = ['cindercub', 'dewdrip'].map((id) => EK.mkMon(id, 5));
boxG.box = ['zaplet', 'mothrix'].map((id) => EK.mkMon(id, 5));
EK.openScreen('box');
const scr = EK.G.screen;
scr.i = 2;                                  // first boxed kin
EK.boxSelect(scr);
eq(boxG.party.length, 3, 'a boxed kin joins a party with room');
eq(boxG.box.length, 1, 'and leaves the box');
scr.i = 0;
EK.boxSelect(scr);
eq(boxG.party.length, 2, 'a party kin can be stored');
eq(boxG.box.length, 2, 'and lands in the box');
boxG.party = ['cindercub', 'dewdrip', 'sproutle', 'zaplet', 'pebblet', 'mothrix'].map((id) => EK.mkMon(id, 5));
boxG.box = [EK.mkMon('kindlark', 9)];
scr.i = 6; scr.pick = null;
EK.boxSelect(scr);
eq(scr.pick, 6, 'a full party turns a withdrawal into a swap');
eq(boxG.party.length, 6, 'nothing moved yet');
scr.i = 1;
EK.boxSelect(scr);
eq(boxG.party.length, 6, 'the party stays at six');
eq(boxG.party[1].species, 'kindlark', 'the newcomer took the slot');
eq(boxG.box[0].species, 'dewdrip', 'the replaced kin went to the box');
eq(scr.pick, null, 'the swap cleared the pick');
boxG.party = [EK.mkMon('cindercub', 5)];
boxG.box = [];
scr.i = 0; scr.pick = null;
EK.boxSelect(scr);
eq(boxG.party.length, 1, 'your last kin cannot be stored');
EK.closeScreen();

section('levelling and evolution');
G.party = [EK.mkMon('cindercub', 15)];
const cub = G.party[0];
const atkBefore = cub.atk;
EK.startBattle({ foe: EK.mkMon('magmane', 60), wild: true });
EK.B().mine = cub;
EK.grantXP([], cub, EK.mkMon('magmane', 60));
ok(cub.lvl > 15, 'a big win levels you up');
ok(cub.atk > atkBefore, 'levels raise stats');
ok(cub.hp > 0, 'the level-up did not kill anyone');
const pending = EK.checkEvolve();
ok(!!pending, 'level 16+ Cindercub is due to evolve');
const res = EK.evolveMon(pending);
eq(pending.species, 'pyrelynx', 'it became Pyrelynx');
eq(res.newName, 'Pyrelynx', 'the evolution is reported');
eq(EK.G.dex.pyrelynx, 2, 'evolving registers the new form in the dex');
ok(pending.moves.length <= 4, 'move list never exceeds four');

section('every move effect does what it says');
// The kin's moves are the only source of damage now, so each fx a move can
// carry is exercised against a foe that cannot die mid-measurement.
const mv = withDeck(loadGame({}));
mv.enterMap('route_one', 9, 10, 'down');
const useOn = (moveId, opt = {}) => {
  mv.G.might = 0;
  mv.G.party = [mv.mkMon(opt.mine || 'pyrelynx', 40)];
  mv.G.battle = null;
  mv.startBattle({ foe: mv.mkMon(opt.foe || 'gargolem', 30), wild: true });
  const bb = mv.B();
  bb.foe.hp = bb.foe.max = 99999;
  bb.mine.hp = Math.floor(bb.mine.max / 2);
  bb.mine.moves = [{ id: moveId, pp: 30, max: 30 }];
  const before = { foe: bb.foe.hp, hp: bb.mine.hp, atk: bb.mine.stages.atk, def: bb.mine.stages.def,
    spd: bb.mine.stages.spd, fAtk: bb.foe.stages.atk, fSpd: bb.foe.stages.spd, status: bb.foe.status };
  const log = [];
  mv.useMove(log, 'mine', moveId);
  return { b: bb, before, log,
    dealt: before.foe - bb.foe.hp, hpDelta: bb.mine.hp - before.hp,
    missed: log.some((e) => /missed/.test(e.t)) };
};
for (const [id, m] of Object.entries(MOVES)) {
  const fx = m.fx || {};
  // Damage: a move with power takes HP off, one without never does.
  let r = useOn(id);
  for (let i = 0; i < 30 && r.missed; i++) r = useOn(id);      // accuracy, not the effect
  if (m.pow) ok(r.dealt > 0, `${id} (power ${m.pow}) takes HP off`);
  else eq(r.dealt, 0, `${id} has no power and deals nothing`);

  if (fx.drain) ok(r.hpDelta > 0, `${id} drains life back`);
  if (fx.recoil) ok(r.hpDelta < 0, `${id} costs the user HP`);
  if (fx.heal && !m.pow) ok(r.hpDelta > 0, `${id} heals its user`);
  if (fx.self) {
    for (const [stat, n] of fx.self) {
      const key = { atk: 'atk', def: 'def', spd: 'spd' }[stat];
      ok(Math.sign(r.b.mine.stages[key] - r.before[key]) === Math.sign(n),
        `${id} moves its own ${stat} ${n > 0 ? 'up' : 'down'}`);
    }
  }
  if (fx.foe) {
    for (const [stat, n] of fx.foe) {
      const was = stat === 'atk' ? r.before.fAtk : stat === 'spd' ? r.before.fSpd : 0;
      ok(Math.sign(r.b.foe.stages[stat] - was) === Math.sign(n),
        `${id} moves the foe's ${stat} ${n > 0 ? 'up' : 'down'}`);
    }
  }
  if (fx.st) {
    // A kin is immune to the status of its own element, so pick a target that
    // is not — and swing until the chance lands rather than trusting one roll.
    const immuneType = EK.IMMUNE_TO[fx.st[0]];
    const target = DEX_ORDER.find((sp) => !DEX[sp].types.includes(immuneType));
    ok(!!target, `${fx.st[0]} has somebody it can be applied to`);
    let landed = null;
    for (let i = 0; i < 200 && !landed; i++) {
      const t = useOn(id, { foe: target });
      if (t.b.foe.status) landed = t.b.foe.status;
    }
    eq(landed, fx.st[0], `${id} can leave the foe ${fx.st[0]}`);
  }
  if (fx.pri) ok(fx.pri > 0, `${id} carries priority`);
}
// Recoil and drain are paid on what came off, not on the number rolled. A
// heavy move finishing something already beaten must not kill its own user.
const overkill = MOVES.magmacharge ? 'magmacharge' : Object.keys(MOVES).find((id) => (MOVES[id].fx || {}).recoil && MOVES[id].pow > 50);
mv.G.might = 0;
mv.G.party = [mv.mkMon('pyrelynx', 50)];
mv.G.battle = null;
mv.startBattle({ foe: mv.mkMon('sproutle', 3), wild: true });
const ob = mv.B();
ob.mine.hp = ob.mine.max;
ob.foe.hp = 1;                                    // one point left, huge swing incoming
ob.mine.moves = [{ id: overkill, pp: 30, max: 30 }];
for (let i = 0; i < 40 && ob.foe.hp > 0; i++) {   // it can miss; that is accuracy, not recoil
  ob.foe.hp = 1; ob.mine.hp = ob.mine.max;
  mv.useMove([], 'mine', overkill);
}
eq(ob.foe.hp, 0, 'the swing finishes it');
ok(ob.mine.max - ob.mine.hp <= 1, `recoil is paid on the 1 HP it took, not the ${MOVES[overkill].pow} it rolled`);
mv.G.battle = null;
// Priority is the one that has to be read by the turn order, not just stored.
ok(Object.keys(MOVES).filter((id) => (MOVES[id].fx || {}).pri).length >= 7,
  'every element has a first-strike move');
mv.G.battle = null;

section('a card shows the damage, not a power rating');
// Power is an internal number nobody can act on: 45 means one thing at level 5
// and another at level 50, and nothing at all against something that resists it.
const dt2 = withDeck(loadGame({}));
dt2.enterMap('route_one', 9, 10, 'down');
dt2.G.might = 0;
dt2.G.party = [dt2.mkMon('cindercub', 14)];
dt2.startBattle({ foe: dt2.mkMon('sproutle', 14), wild: true });   // Verdant: Ember eats it
const emberMove = dt2.B().mine.moves.find((m) => MOVES[m.id].type === 'Ember' && MOVES[m.id].pow);
const vsWeak = dt2.moveDamage(emberMove.id);
ok(!/power/.test(dt2.moveCardText(emberMove.id)), 'the card does not say "power"');
ok(/deal /.test(dt2.moveCardText(emberMove.id)), 'it says what it deals');
ok(vsWeak.lo > 0 && vsWeak.hi >= vsWeak.lo, `and gives a range (${vsWeak.lo}-${vsWeak.hi})`);

// The number moves with the deck stacked onto it.
const edgeCard2 = dt2.grantCard('edge');
dt2.B().hand = [{ src: 'deck', u: edgeCard2.u, id: 'edge', bg: 0 }];
dt2.B().energy = 9;
dt2.playCard(0);
const sharpened = dt2.moveDamage(emberMove.id);
eq(sharpened.lo - vsWeak.lo, dt2.CARDS.edge.v, 'an edge adds exactly its number to what the card shows');

// And with the type chart.
dt2.G.battle = null;
dt2.G.might = 0;
dt2.startBattle({ foe: dt2.mkMon('dewdrip', 14), wild: true });     // Tide: Ember flops
const vsResist = dt2.moveDamage(emberMove.id);
ok(vsResist.hi < vsWeak.lo, `the same move reads lower against something that resists it (${vsResist.lo}-${vsResist.hi} vs ${vsWeak.lo}-${vsWeak.hi})`);

// Out of a fight there is nobody to measure against, so the party screen uses a
// stated yardstick: a same-level target that neither resists nor is weak to it.
const shelf = dt2.mkMon('cindercub', 14);
const emberN = dt2.moveDamageNeutral(shelf, emberMove.id);
ok(emberN > 0, `the party screen shows a real number (~${emberN})`);
const byPow = shelf.moves.filter((m) => MOVES[m.id].pow).sort((a, c) => MOVES[c.id].pow - MOVES[a.id].pow);
ok(dt2.moveDamageNeutral(shelf, byPow[0].id) >= dt2.moveDamageNeutral(shelf, byPow[byPow.length - 1].id),
  'and the heavier move reads heavier');
const statusMove = shelf.moves.find((m) => !MOVES[m.id].pow);
if (statusMove) eq(dt2.moveDamageNeutral(shelf, statusMove.id), 0, 'a status move reads as no damage at all');
dt2.G.battle = null;

section('status effects tick and expire sensibly');
G.party = [EK.mkMon('gargolem', 30)];
EK.startBattle({ foe: EK.mkMon('gargolem', 30), wild: true });
const b = EK.B();
b.mine.status = 'burn';
const hp0 = b.mine.hp;
EK.endOfTurn([]);
ok(b.mine.hp < hp0, 'burn chips HP at end of turn');
b.mine.status = ''; b.mine.hp = b.mine.max;
EK.endOfTurn([]);
eq(b.mine.hp, b.mine.max, 'no status, no chip');
// Elemental immunity: an Ember kin cannot be burned by Flame Fang.
const emberMon = EK.mkMon('magmane', 30);
G.party = [emberMon];
EK.startBattle({ foe: EK.mkMon('pyrelynx', 60), wild: true });
EK.B().mine = emberMon;
for (let i = 0; i < 60; i++) { emberMon.hp = emberMon.max; EK.useMove([], 'foe', 'flamefang'); }
eq(emberMon.status, '', 'Ember kin never catch fire');

// -------------------------------------------------------------- world --
section('no map is a rectangle of one tile');
// The valley used to be blocks: a 2×2 square of trees, a straight shoreline, a
// rectangle of tall grass. Everything below is a shape test, not a taste test —
// a region whose every row is the same run is a rectangle, and a rectangle is
// what a map looks like before anybody has drawn it.
const OUTSIDE = Object.keys(MAPS).filter((id) => MAPS[id].kind !== 'inside');
/** For each tile kind, the set of distinct row-signatures it makes. */
const shapesOf = (map, ch) => {
  const runs = new Set();
  for (const row of map.rows) {
    const sig = [...row].map((c, i) => (c === ch ? i : -1)).filter((i) => i >= 0).join(',');
    if (sig) runs.add(sig);
  }
  return runs;
};
for (const id of OUTSIDE) {
  const map = MAPS[id];
  for (const ch of [',', '#', 's']) {
    const rows = map.rows.filter((r) => r.includes(ch)).length;
    if (rows < 3) continue;                       // too little of it to have a shape
    const shapes = shapesOf(map, ch);
    ok(shapes.size > 1, `${id}: ${EK.TILE_ART[ch]} is not the same run on every row (${shapes.size} shapes over ${rows} rows)`);
  }
  // Something to look at: every outdoor map carries scatter of some kind.
  const chars = new Set(map.rows.join(''));
  ok([...'of~sL'].some((c) => chars.has(c)), `${id} has something in it besides ground and cover`);
}
// The shore in particular: a coast that steps in and out, not a wall of sand.
const shoreWidths = new Set(MAPS.stillmere.rows.map((r) => (r.match(/s+/g) || ['']).join('').length));
ok(shoreWidths.size >= 4, `Stillmere's beach varies in width (${[...shoreWidths].sort((a, b) => a - b).join(', ')})`);

section('maps are well formed and connected');
for (const [id, map] of Object.entries(MAPS)) {
  const w = map.rows[0].length;
  map.rows.forEach((r, y) => eq(r.length, w, `${id} row ${y} is ${w} wide`));
  ok(map.rows.length >= 8, `${id} is tall enough`);
  for (const wp of (map.warps || [])) {
    ok(!!MAPS[wp.to], `${id} warp targets a real map (${wp.to})`);
    const dst = MAPS[wp.to];
    ok(wp.tx >= 0 && wp.tx < dst.rows[0].length && wp.ty >= 0 && wp.ty < dst.rows.length, `${id}→${wp.to} lands inside the map`);
    ok(!EK.SOLID.has(dst.rows[wp.ty][wp.tx]), `${id}→${wp.to} lands on a walkable tile`);
    ok(wp.x >= 0 && wp.x < w && wp.y >= 0 && wp.y < map.rows.length, `${id} warp tile is inside the map`);
  }
  for (const n of (map.npcs || [])) {
    ok(!EK.SOLID.has(map.rows[n.y][n.x]), `${id} NPC ${n.name} stands on a walkable tile`);
    if (n.trainer) {
      ok(!!n.id, `${id} trainer ${n.name} has a flag id`);
      n.trainer.team.forEach(([sp, lv]) => {
        ok(!!DEX[sp], `${n.name} uses real species ${sp}`);
        ok(lv > 0 && lv < 60, `${n.name} team level ${lv} sane`);
      });
    }
  }
  for (const key of Object.keys(map.signs || {})) {
    const [sx, sy] = key.split(',').map(Number);
    eq(map.rows[sy][sx], 'S', `${id} sign at ${key} is on a sign tile`);
  }
  if (map.enc) {
    ok(map.enc.rate > 0 && map.enc.rate < .5, `${id} encounter rate sane`);
    map.enc.table.forEach(([sp, lo, hi, wt]) => {
      ok(!!DEX[sp], `${id} spawns real species ${sp}`);
      ok(lo <= hi && lo > 0, `${id} ${sp} level band sane`);
      ok(wt > 0, `${id} ${sp} weight positive`);
    });
    ok(map.rows.join('').includes(','), `${id} has tall grass to meet them in`);
  }
}
// Every map with an encounter table must be reachable from the town.
const seen = new Set(['hollowbrook']);
const stack = ['hollowbrook'];
while (stack.length) {
  const cur = stack.pop();
  for (const wp of (MAPS[cur].warps || [])) if (!seen.has(wp.to)) { seen.add(wp.to); stack.push(wp.to); }
}
for (const id of Object.keys(MAPS)) ok(seen.has(id), `${id} is reachable from Hollowbrook`);

section('every species can actually be obtained');
const spawnable = new Set();
for (const map of Object.values(MAPS)) {
  for (const e of ((map.enc && map.enc.table) || [])) spawnable.add(e[0]);
  // Was `spawnable.add('vespyr')` with a comment reading "scripted shrine
  // encounter" — the test asserting the encounter existed because nothing in
  // the data said so. An exemption written into a net is the net agreeing with
  // the gap. The shrine encounter is a map field now and this reads it.
  if (map.legend) spawnable.add(map.legend.id);
}
// The game's own list, not a copy of it. This net is the one that already
// had the shrine encounter carved out by name; a fourth starter added to
// STARTERS would have quietly stopped being covered here.
for (const id of EK.STARTERS) spawnable.add(id);
for (const id of DEX_ORDER) {
  const viaEvo = DEX_ORDER.some((p) => DEX[p].evo && DEX[p].evo[0] === id && spawnable.has(p));
  ok(spawnable.has(id) || viaEvo, `${id} is catchable or evolvable`);
}

section('the rival brings the starter that beats yours');
const wick1 = MAPS.hollowbrook.npcs.find((n) => n.id === 't_wick1');
const wick2 = MAPS.emberwood.npcs.find((n) => n.id === 't_wick2');
ok(!!wick1 && !!wick2, 'the rival shows up twice');
for (const [mine, theirs] of Object.entries(EK.RIVAL_PICK)) {
  EK.G.flags = { gotStarter: 1, starter: mine };
  const t1 = EK.trainerTeam(wick1);
  eq(t1[0][0], theirs, `against ${mine} the rival leads ${theirs}`);
  ok(EK.effect(DEX[theirs].types[0], DEX[mine].types) === 2, `${theirs} actually beats ${mine}`);
  const t2 = EK.trainerTeam(wick2);
  const evo = DEX[theirs].evo ? DEX[theirs].evo[0] : theirs;
  ok(t2.some((e) => e[0] === evo), `the rematch team has grown into ${evo}`);
  ok(t2.every(([sp, lv]) => DEX[sp] && lv > 0), 'the rematch team is real');
}
const wick3 = MAPS.crown_hollow.npcs.find((n) => n.id === 't_wick3');
for (const [mine] of Object.entries(EK.RIVAL_PICK)) {
  EK.G.flags = { gotStarter: 1, starter: mine, beatVespyr: 1 };
  const t3 = EK.trainerTeam(wick3);
  let top = EK.RIVAL_PICK[mine];
  while (DEX[top].evo) top = DEX[top].evo[0];
  ok(t3.some((e) => e[0] === top), `the final rival team has the fully grown ${top}`);
  ok(t3.every(([sp, lv]) => DEX[sp] && lv >= 25), 'the final team is endgame level');
}
EK.G.flags = {};
eq(EK.trainerTeam(MAPS.route_one.npcs.find((n) => n.id === 't_pell'))[0][0], 'sproutle', 'ordinary trainers keep their fixed team');

section('story NPCs are absent until their beat is live');
EK.G.flags = {};
ok(!EK.npcActive(wick1), 'the rival is not in town before you have a kin');
ok(!EK.npcAt(MAPS.hollowbrook, wick1.x, wick1.y), 'and does not block the path');
ok(!EK.npcActive(wick3), 'the final rival is not on the mountain yet');
EK.G.flags = { gotStarter: 1 };
ok(EK.npcActive(wick1), 'once Rowan hands one over, he is there');
ok(!!EK.npcAt(MAPS.hollowbrook, wick1.x, wick1.y), 'and stands in the way');
// Leaving the map is a property of beating a BLOCKING npc, and it is read out
// of the flags rather than off a field on the map object — which is why this
// sets the flag rather than the field. There is exactly one such npc, and if
// that ever stops being true this finds the new one instead of testing nothing.
const blockers = Object.values(MAPS).flatMap((m) => m.npcs || []).filter((n) => n.block);
ok(blockers.length > 0, `somebody blocks a path (${blockers.map((n) => n.name).join(', ')})`);
for (const b of blockers) {
  EK.G.flags = { gotStarter: 1 };
  ok(EK.npcActive(b), `${b.name} is in the way while unbeaten`);
  EK.G.flags = { gotStarter: 1, [b.id]: 1 };
  ok(!EK.npcActive(b), `${b.name} steps off once beaten, and the save is what says so`);
  // Which makes a parting line unreadable by construction: he is off the map
  // the instant the flag that would show it is set.
  ok(!b.after, `${b.name} carries no after-line, because nobody could ever read it`);
}
EK.G.flags = {};

// And the other side of that, which is the claim rather than the exception.
//
// Read the nine trainers' dialogue together and they all have a voice: Dorn
// guards a stretch, Ivo lives in the trees, Mio got everything out of that
// water. Six of the nine then said one shared sentence — "Good match. Go on." —
// for the rest of the game. The one who legitimately says nothing says nothing
// because he is NOT THERE, and that is a fact npcActive already knows, so this
// asks it rather than naming him.
section('a trainer you beat still has something to say');
{
  const trainers = Object.values(MAPS).flatMap((m) => m.npcs || []).filter((n) => n.trainer);
  ok(trainers.length >= 9, `there are trainers to ask (${trainers.length})`);
  // Every gate open, every trainer beaten. npcActive gates on `requires` as
  // well as `block`, and setting one flag at a time quietly skipped the two
  // later Wicks — a loop that tests six of nine and says so only in a number.
  const done = { gotStarter: 1, beatVespyr: 1 };
  trainers.forEach((t) => { done[t.id] = 1; });
  let stayed = 0;
  for (const n of trainers) {
    EK.G.flags = { ...done };
    if (!EK.npcActive(n)) continue;              // he left; the loop above owns that case
    stayed++;
    const after = typeof n.after === 'function' ? n.after() : n.after;
    ok(Array.isArray(after) && after.length > 0,
      `${n.name} has a line for after the fight`);
    ok(!(after || []).join(' ').includes('Good match'),
      `${n.name} does not fall back to the sentence everybody shared`);
  }
  ok(stayed >= 8, `and most of them are still standing there (${stayed})`);
  EK.G.flags = {};
}

// Pell counts the dex out loud, and a count inside a sentence is how Old Tam's
// boast collided with the tally at six ("Six kinds in the book. I managed six").
// A test that asserted "Pell mentions the count" would not have seen it. This
// reads every count she can be given.
section('nobody says the same number twice');
{
  const pell = MAPS.route_one.npcs.find((n) => n.id === 't_pell');
  const WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi;
  for (let n = 0; n <= DEX_ORDER.length; n++) {
    EK.newGame();
    EK.G.flags = { gotStarter: 1, t_pell: 1 };
    DEX_ORDER.slice(0, n).forEach((id) => EK.catchMon(id));
    const said = (typeof pell.after === 'function' ? pell.after() : pell.after).join(' ');
    const nums = (said.match(WORDS) || []).map((w) => w.toLowerCase());
    eq(new Set(nums).size, nums.length, `at ${n} caught, Pell does not repeat a number`);
  }
  EK.newGame(); EK.G.flags = {};
}
// Prerequisites: the rival must not challenge before Rowan hands out a starter.
EK.enterMap('hollowbrook', wick1.x - 1, wick1.y, 'right');
EK.G.alert = null;
eq(EK.trainerSight(), false, 'no starter, no challenge');
EK.G.flags = { gotStarter: 1, starter: 'cindercub' };
EK.enterMap('hollowbrook', wick1.x - 1, wick1.y, 'right');
EK.G.alert = null;
eq(EK.trainerSight(), true, 'with a starter in hand, the rival calls you out');
EK.G.flags = {}; EK.G.alert = null; EK.G.dialogue = null; EK.G.mode = 'world'; EK.G.battle = null;

section('the dex tells you where to look');
for (const id of DEX_ORDER) {
  const h = EK.habitat(id);
  ok(h.length > 10, `${id} has a habitat line`);
  // The claim this section exists to make, stated instead of assumed. It used
  // to end `ok(id === 'vespyr' || /Rowan/.test(h))` — an exemption for the one
  // kin the whole game is built toward, which was in fact the only one the
  // screen was lying about: "Not found in the wild. Not anywhere, really.",
  // printed about the thing with its own theme, its own opening line, its own
  // reward, and a promise elsewhere that it gathers on the shrine again.
  ok(!/Not anywhere, really/.test(h), `${id} has somewhere it can be found — "${h}"`);
  const wild = Object.values(MAPS).some((m) => ((m.enc && m.enc.table) || []).some((e) => e[0] === id));
  const shrine = Object.values(MAPS).some((m) => m.legend && m.legend.id === id);
  const viaEvo = DEX_ORDER.some((p) => DEX[p].evo && DEX[p].evo[0] === id);
  if (wild) ok(h.startsWith('Found in'), `${id} lists where it spawns`);
  else if (shrine) ok(/^Waits in /.test(h), `${id} names the ground it haunts`);
  else if (viaEvo) ok(/Evolves from/.test(h), `${id} points at its pre-evolution`);
  else ok(/Rowan/.test(h), `${id} explains how else to get it`);
}

// The screen and the world have to be reading the same field, or they will
// drift the way they already had. Move the shrine and the dex must follow.
section('the dex reads the shrine off the map the walk uses');
{
  const map = MAPS.crown_hollow;
  ok(!!map.legend, 'the shrine encounter lives on the map');
  eq(map.legend.id, 'vespyr', 'and names what waits there');
  const was = map.legend.where;
  map.legend.where = 'somewhere else entirely';
  ok(/somewhere else entirely/.test(EK.habitat('vespyr')), 'the dex line follows the map data');
  map.legend.where = was;
}

// And the walk reads it too. Being data is what makes this drivable at all —
// the rate and the cooldown used to be numbers written inside tryMove, so the
// only way to reach this branch in a test was to roll .18 and hope.
section('the shrine encounter is driven by the map, not by the map id');
{
  const lg = MAPS.crown_hollow.legend;
  const kept = { rate: lg.rate, gap: lg.gap };
  lg.rate = 1; lg.gap = 0;                    // certainty, off the same field the game reads
  const shrineWalk = () => {
    EK.G.flags = { gotStarter: 1 };
    EK.G.dialogue = null; EK.G.battle = null; EK.G.alert = null;
    EK.G.party = [EK.mkMon('cindercub', 30)];
    EK.enterMap('crown_hollow', 6, 3, 'down');   // shrine grass, above the line
    EK.G.steps = 999;
    EK.G.mode = 'world';
    EK.tryMove('right');
    EK.onArrive();                             // tryMove only STARTS the step
    return EK.G.dialogue;
  };

  ok(!!shrineWalk(), 'walking the shrine grass wakes it');

  // Below the line it does not live there, and that line is data now.
  EK.G.flags = { gotStarter: 1 }; EK.G.dialogue = null;
  EK.G.party = [EK.mkMon('cindercub', 30)];
  EK.enterMap('crown_hollow', 6, 8, 'down');
  EK.G.steps = 999; EK.G.mode = 'world';
  const wasAbove = lg.above;
  lg.above = 2;                                // pull the shrine up above where we stand
  EK.tryMove('right'); EK.onArrive();
  ok(!EK.G.dialogue, 'and it keeps to the ground the map gives it');
  lg.above = wasAbove;

  // Once it is beaten the hunt is over, and that gate is data too.
  EK.G.flags = { gotStarter: 1, beatVespyr: 1 }; EK.G.dialogue = null;
  EK.G.party = [EK.mkMon('cindercub', 30)];
  EK.enterMap('crown_hollow', 6, 3, 'down');
  EK.G.steps = 999; EK.G.mode = 'world';
  EK.tryMove('right'); EK.onArrive();
  ok(!EK.G.dialogue, 'and it stays gone once it has been taken');

  lg.rate = kept.rate; lg.gap = kept.gap;
  EK.G.flags = {}; EK.G.dialogue = null; EK.G.battle = null; EK.G.party = [];
}

section('movement, collision and warps');
EK.enterMap('route_one', 9, 10, 'down');
eq(EK.G.mapId, 'route_one', 'entered the route');
ok(!EK.passable(MAPS.route_one, 0, 5, 5), 'trees block');
ok(EK.passable(MAPS.route_one, 9, 5, 5), 'the path is walkable');
// Found rather than hard-coded: the pond gets reshaped whenever the town does.
const pond = (() => {
  const rows = MAPS.hollowbrook.rows;
  for (let y = 0; y < rows.length; y++) { const x = rows[y].indexOf('~'); if (x >= 0) return [x, y]; }
  return null;
})();
ok(pond, 'Hollowbrook still has a pond');
ok(!EK.passable(MAPS.hollowbrook, pond[0], pond[1], pond[1]), 'water blocks');
// A ledge is one-way: you may drop down it, never climb it.
const ledgeRow = MAPS.route_one.rows.findIndex((r) => r.includes('L'));
const ledgeCol = MAPS.route_one.rows[ledgeRow].indexOf('L');
ok(EK.passable(MAPS.route_one, ledgeCol, ledgeRow, ledgeRow - 1), 'ledges let you drop down');
ok(!EK.passable(MAPS.route_one, ledgeCol, ledgeRow, ledgeRow + 1), 'ledges refuse to be climbed');

EK.enterMap('hollowbrook', 9, 1, 'up');
const wp = EK.warpAt(MAPS.hollowbrook, 9, 0);
ok(!!wp, 'the town has a north exit');
eq(wp.to, 'route_one', 'it leads to Route One');

section('every exit on a map can actually be walked to');
// Tile-only flood fill: NPCs are deliberately excluded so a story blocker does
// not read as a broken map. Ledges are entered from above, as a player would.
function reachable(map, sx, sy) {
  const seen = new Set([`${sx},${sy}`]);
  const q = [[sx, sy]];
  const walk = (x, y, fromY) => {
    const row = map.rows[y];
    const t = (!row || x < 0 || x >= row.length) ? '#' : row[x];
    return t === 'L' ? y > fromY : !EK.SOLID.has(t);
  };
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      let nx = x + dx, ny = y + dy;
      const row = map.rows[ny];
      if (!row || nx < 0 || nx >= row.length) continue;
      if (row[nx] === 'L' && dy === 1) ny += 1;           // a ledge drop clears two tiles
      if (!walk(nx, ny, y) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  return seen;
}
for (const [id, map] of Object.entries(MAPS)) {
  const warps = map.warps || [];
  if (warps.length < 2) continue;
  const from = reachable(map, warps[0].x, warps[0].y);
  for (const wp of warps.slice(1)) ok(from.has(`${wp.x},${wp.y}`), `${id}: ${wp.to} exit is reachable from the first exit`);
  for (const n of (map.npcs || [])) ok(from.has(`${n.x},${n.y}`) || map.rows[n.y][n.x] === '=', `${id}: ${n.name} can be walked up to`);
}

section('the Warden really gates Crown Hollow');
const wood = MAPS.emberwood;
const hale = wood.npcs.find((n) => n.id === 't_hale');
ok(!!hale && hale.block, 'the Warden is flagged as a blocker');
const south = wood.warps.find((w) => w.to === 'route_one');
const north = wood.warps.find((w) => w.to === 'crown_hollow');
const blocked = (() => {                       // same fill, but his tile is a wall
  const rows = wood.rows.slice();
  rows[hale.y] = rows[hale.y].slice(0, hale.x) + '#' + rows[hale.y].slice(hale.x + 1);
  return reachable({ rows }, south.x, south.y);
})();
ok(!blocked.has(`${north.x},${north.y}`), 'you cannot slip past the Warden to Crown Hollow');
ok(reachable(wood, south.x, south.y).has(`${north.x},${north.y}`), 'once he steps aside the path opens');

section('the difficulty curve never asks for a grind');
// Each trainer should be beatable by a party levelled on the grass around them:
// no trainer may outlevel the local encounter band by more than a few levels.
const ROUTE_ORDER = ['route_one', 'emberwood', 'stillmere', 'crown_hollow'];
for (const id of ROUTE_ORDER) {
  const map = MAPS[id];
  const wildMax = Math.max(...map.enc.table.map((e) => e[2]));
  for (const n of (map.npcs || [])) {
    if (!n.trainer) continue;
    const lead = Math.max(...n.trainer.team.map((t) => t[1]));
    ok(lead <= wildMax + 8, `${n.name} (Lv${lead}) is within reach of ${id} wilds (Lv${wildMax})`);
  }
}
// And the legendary must not outclass the region it guards.
ok(26 <= Math.max(...MAPS.crown_hollow.enc.table.map((e) => e[2])) + 8, 'Vespyr sits close to Crown Hollow levels');

// The first fight is the one that has to be winnable on what the game just
// handed you: a level-5 starter, the starter deck, no grass walked yet — and a
// rival holding the kin that beats yours. It stands on the only road out of
// town, so an unwinnable version of it is an unwinnable game. Played greedily
// (spend everything, then end the turn) it should still go the player's way
// most of the time; a careful player does better than this bot.
const firstRival = MAPS.hollowbrook.npcs.find((n) => n.id === 't_wick1');
const opening = loadGame({});
for (const starter of EK.STARTERS) {
  const foe = opening.RIVAL_PICK[starter];
  const lvl = opening.trainerTeam(firstRival)[0][1];
  let wins = 0;
  const RUNS = 400;
  for (let i = 0; i < RUNS; i++) {
    withDeck(opening);                                  // a deck nobody has grown yet
    opening.G.party = [opening.mkMon(starter, 5)];
    opening.startBattle({ foe: opening.mkMon(foe, lvl), team: [[foe, lvl]], npc: firstRival, wild: false });
    autoFight(opening);
    if (opening.B() && opening.B().over === 'win') wins++;
    opening.G.battle = null;
  }
  const rate = wins / RUNS;
  // The bot spends an Edge whether or not an attack follows it, so it undersells
  // the deck badly; a player who sequences them does much better than this.
  ok(rate >= .55, `a fresh ${starter} beats the rival's Lv${lvl} ${foe} ${(rate * 100) | 0}% of the time playing greedily`);
  ok(rate <= .98, `and it is still a fight, not a formality (${(rate * 100) | 0}%)`);
}

section('encounters only fire in tall grass');
EK.G.party = [EK.mkMon('cindercub', 5)];
EK.enterMap('route_one', 9, 10, 'down');
EK.G.battle = null; EK.G.mode = 'world';
for (let i = 0; i < 200; i++) { EK.G.player.x = 9; EK.G.player.y = 10; EK.onArrive(); }
ok(!EK.G.battle, 'standing on the path never starts a fight');
let started = 0;
for (let i = 0; i < 400; i++) {
  EK.G.battle = null; EK.G.mode = 'world';
  // Heal between rolls. A fast wild kin now opens the fight, so without this
  // the party is on the floor after a dozen encounters and startBattle starts
  // refusing — which measures the speed rule rather than the encounter rate.
  EK.healParty();
  EK.G.player.x = 4; EK.G.player.y = 1;              // tall grass
  EK.onArrive();
  // A roll no longer opens the fight on the spot: the grass moves first, and
  // the encounter is the beat's payoff. Run the beat out so this still measures
  // the encounter rate end to end rather than the moment it is scheduled.
  if (EK.G.rustle) EK.rustleStep(EK.RUSTLE_T + .01);
  if (EK.G.battle) started++;
}
ok(started > 10, `tall grass produces encounters (${started}/400)`);

// The climax does not open with the same words as a level-six Dewdrip.
EK.G.battle = null; EK.G.rustle = null; EK.G.mode = 'world'; EK.healParty();
EK.startBattle({ foe: EK.mkMon('vespyr', 26), wild: true, legendary: true });
const legLines = (EK.G.battleMsg || {}).lines || [];
ok(legLines.length > 2, 'a legendary gets more than the two-line wild opening');
ok(!legLines.some((l) => /bristles/.test(l)), 'and none of it is the wild line');
EK.G.battle = null; EK.G.battleMsg = null; EK.G.mode = 'world'; EK.healParty();
EK.startBattle({ foe: EK.mkMon('dewdrip', 6), wild: true });
ok(((EK.G.battleMsg || {}).lines || []).some((l) => /bristles/.test(l)),
  'while an ordinary wild fight still bristles');
EK.G.battle = null; EK.G.battleMsg = null; EK.G.mode = 'world';
// And the beat is what stands between the step and the fight.
EK.G.battle = null; EK.G.rustle = null; EK.G.mode = 'world';
EK.healParty();
for (let i = 0; i < 400 && !EK.G.rustle; i++) {
  EK.G.player.x = 4; EK.G.player.y = 1;
  EK.onArrive();
}
ok(!!EK.G.rustle, 'a wild encounter opens with the grass moving, not with the fight');
ok(!EK.G.battle, 'and the fight has not started while the grass is still moving');
ok(EK.rustleStep(EK.RUSTLE_T * .5) && !EK.G.battle, 'half way through, still no fight');
EK.rustleStep(EK.RUSTLE_T);
ok(!!EK.G.battle && !EK.G.rustle, 'when the grass settles, the fight is on');

// Going down closes the dark over the arena before it moves you, rather than
// teleporting you to the Wayhouse on the same frame the last kin falls.
{
  const lose = loadGame({});
  lose.setCtx(mkCtx());
  lose.newGame();
  for (let i = 0; i < 12 && lose.G.mode === 'dialogue'; i++) lose.advanceDialogue();
  lose.G.dialogue = null; lose.G.mode = 'world';
  lose.takeStarter('cindercub'); lose.G.dialogue = null;
  lose.G.mapId = 'route_one';
  lose.startBattle({ foe: lose.mkMon('bramblor', 40), wild: true });
  // Fought out rather than assigned: `over` is decided inside the damage path,
  // so a party set to zero HP by hand never loses — which is what the first
  // version of this test, and the film that went with it, both discovered.
  autoFight(lose, 400);
  eq(lose.B() && lose.B().over, 'lose', `a Lv5 starter loses to a Lv40 Bramblor (over=${lose.B() && lose.B().over}, hp=${lose.G.party.map((m) => m.hp)})`);
  // Step as well as advance: the defeat lines are said from a callback that
  // only runs once the battle log has finished playing back, and playback is
  // driven by the frame loop rather than by dismissing text.
  for (let i = 0; i < 200 && !lose.G.blackout; i++) {
    lose.step(.2); lose.fired.clear();
    const d = lose.G.dialogue || lose.liveBattleMsg();
    if (d) { d.hold = 0; lose.advanceDialogue(); }
  }
  ok(!!lose.G.blackout, 'going down closes the dark before it moves you');
  eq(lose.G.mapId, 'route_one', 'and you are still where you fell while it closes');
  ok(lose.blackoutCover() >= 0, 'the dark has a cover value from the start');
  lose.blackoutStep(lose.BLACKOUT_T * .5);
  eq(lose.G.mapId, 'route_one', 'half way through, still there');
  lose.blackoutStep(lose.BLACKOUT_T);
  eq(lose.G.mapId, 'wayhouse', 'when it has closed, the Wayhouse');
  ok(!lose.G.blackout, 'and the dark is done');
  ok(lose.G.fade > 0, 'with the room opening out of it rather than snapping in');
}

// Losing the legendary without catching it never ends the hunt — and the game
// says so. The mechanic was tested from the start; the telling was not, and a
// player who believes it is gone stops going back to the shrine.
{
  const leg = loadGame({});
  leg.setCtx(mkCtx());
  leg.newGame();
  for (let i = 0; i < 12 && leg.G.mode === 'dialogue'; i++) leg.advanceDialogue();
  leg.G.dialogue = null; leg.G.mode = 'world';
  leg.takeStarter('cindercub'); leg.G.dialogue = null;
  // Collect every line the game puts on screen while the fight resolves. There
  // is no hook for this — the lines have to be read off G.dialogue as they
  // arrive, before they are dismissed.
  const saidOn = (setup) => {
    const said = [];
    leg.G.battle = null; leg.G.dialogue = null; leg.G.battleMsg = null;
    leg.G.mode = 'world'; leg.healParty();
    leg.startBattle({ foe: leg.mkMon('vespyr', 26), wild: true, legendary: true });
    setup(leg.B());
    autoFight(leg, 400);                 // stepping alone never plays a card
    // Keep going past the end of the battle: the win lines are said from
    // winFlourish's callback, which runs on its own clock after G.battle is
    // already gone. A loop that stops at "no battle" stops one beat too early
    // and collects only the opening.
    for (let i = 0; i < 400; i++) {
      leg.step(.2); leg.fired.clear();
      const d = leg.G.dialogue || leg.liveBattleMsg();
      if (d) { said.push(...d.lines); d.hold = 0; leg.advanceDialogue(); }
      if (leg.G.screen) leg.closeScreen();
    }
    return [...new Set(said)].join(' ');
  };
  // Knocked down rather than caught: the quietest path, and a wild win used to
  // say nothing at all.
  const beat = saidOn((b) => { b.foe.hp = 1; });
  ok(/again|comes? back|still up|not gone/i.test(beat),
    `knocking it down says the hunt is still open (${beat.slice(0, 80)})`);
  ok(!leg.G.flags.beatVespyr, 'and the flag agrees — the hunt really is still open');
}

// Being healed is a beat too, and the line that says it worked comes after it.
EK.G.battle = null; EK.G.mend = null; EK.G.mode = 'world';
EK.G.party.forEach((m) => { m.hp = 1; });
EK.enterMap('wayhouse', 5, 3, 'up');
const sable = (EK.G.map.npcs || []).find((n) => n.heal);
ok(!!sable, 'the Wayhouse has somebody who heals');
EK.talkTo(sable);
for (let i = 0; i < 12 && EK.G.dialogue; i++) { EK.G.dialogue.hold = 0; EK.advanceDialogue(); }
ok(!!EK.G.mend, 'past the offer, the light happens');
ok(EK.G.party.every((m) => m.hp === m.max), 'and the party is already whole behind it');
ok(EK.mendStep(EK.MEND_T * .5) && !EK.G.dialogue, 'half way through, nobody has spoken yet');
EK.mendStep(EK.MEND_T);
ok(!EK.G.mend && !!EK.G.dialogue, 'when the light goes, the reply arrives');
EK.G.dialogue = null; EK.G.mode = 'world';
EK.G.battle = null; EK.G.mode = 'world';

section('trainers spot you down their own line');
// A trainer's ambush is spent the moment it fires, so each probe starts clean.
const spot = (mapId, x, y, keepFlags) => {
  if (!keepFlags) EK.G.flags = {};
  EK.enterMap(mapId, x, y, 'down');
  EK.G.battle = null; EK.G.mode = 'world'; EK.G.dialogue = null; EK.G.alert = null;
  const hit = EK.trainerSight();
  return hit ? EK.G.alert.npc.name : null;
};
const pell = MAPS.route_one.npcs.find((n) => n.id === 't_pell');   // faces down
eq(spot('route_one', pell.x, pell.y + 1), pell.name, 'one tile ahead is seen');
eq(spot('route_one', pell.x, pell.y + 4), pell.name, 'four tiles ahead is seen');
eq(spot('route_one', pell.x, pell.y + 5), null, 'five tiles is too far');
eq(spot('route_one', pell.x, pell.y - 1), null, 'behind them is safe');
eq(spot('route_one', pell.x + 1, pell.y + 2), null, 'beside the line is safe');
EK.G.flags = {};
EK.G.flags[pell.id] = 1;
eq(spot('route_one', pell.x, pell.y + 1, true), null, 'a beaten trainer does not re-challenge');

// Losing is not a soft-lock: a trainer standing on the only road out of town
// would otherwise re-challenge you forever, and the grass is on their far side.
EK.G.flags = {};
eq(spot('route_one', pell.x, pell.y + 1, true), pell.name, 'they call you out the first time');
ok(!EK.G.flags[pell.id], 'and are still unbeaten');
eq(spot('route_one', pell.x, pell.y + 2, true), null, 'but the ambush is spent — walking back past them is free');
eq(spot('route_one', pell.x, pell.y + 1, true), null, 'however many times you walk the line');
EK.G.party = [EK.mkMon('cindercub', 20)];
EK.talkTo(pell);
ok(!!EK.G.dialogue || !!EK.G.battle, 'and talking to them still starts the rematch');
EK.G.dialogue = null; EK.G.battle = null;
EK.G.flags = {};
// Sight must not pass through walls.
const coll = MAPS.emberwood.npcs.find((n) => n.id === 't_coll');    // faces left
const [cdx, cdy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[coll.dir];
let blockedAt = 0;
for (let i = 1; i <= 4; i++) if (EK.SOLID.has(MAPS.emberwood.rows[coll.y + cdy * i][coll.x + cdx * i])) { blockedAt = i; break; }
if (blockedAt) {
  eq(spot('emberwood', coll.x + cdx * blockedAt + cdx, coll.y + cdy * blockedAt + cdy), null, 'sight does not pass through solid tiles');
} else {
  eq(spot('emberwood', coll.x + cdx * 3, coll.y + cdy * 3), coll.name, 'an open line is seen');
}
EK.G.flags = {}; EK.G.alert = null; EK.G.battle = null; EK.G.mode = 'world';

section('the valley keeps up with you, and never overtakes');
// The bands used to be absolute, so a route you had outgrown kept sending
// level-3 kin at a level-12 party and two fights in five were decided before
// they started. A wild kin is rolled in its band and then brought up to within
// WILD_TRAIL of your best — never above it.
for (const lead of [1, 5, 12, 30]) {
  EK.G.party = [EK.mkMon('pyrelynx', lead)];
  for (let i = 0; i < 200; i++) {
    const mon = EK.rollEncounter(MAPS.stillmere);
    const row = MAPS.stillmere.enc.table.find((e) => e[0] === mon.species);
    ok(!!row, 'rolled a species from the table');
    ok(mon.lvl >= row[1], `${mon.species} ${mon.lvl} is not below its band floor ${row[1]} (lead ${lead})`);
    ok(mon.lvl <= Math.max(row[2], lead), `${mon.species} ${mon.lvl} never outranks band or lead (${row[2]}/${lead})`);
    // Once you are past the band, the valley closes to within WILD_TRAIL.
    if (lead - EK.WILD_TRAIL > row[2]) {
      ok(mon.lvl >= lead - EK.WILD_TRAIL, `${mon.species} ${mon.lvl} keeps up with a lead of ${lead}`);
    }
  }
}
// An empty party must not crash the roll — it happens on a fresh save.
EK.G.party = [];
ok(EK.rollEncounter(MAPS.stillmere), 'a party-less roll still produces something');
EK.G.party = [EK.mkMon('pyrelynx', 22)];

// --------------------------------------------------------------- save --
section('save round-trips');
const store = {};
const EK2 = loadGame(store);
EK2.G.party = [EK2.mkMon('pyrelynx', 22), EK2.mkMon('lanterneel', 18)];
EK2.G.party[0].hp = 13;
EK2.G.party[0].nick = 'Ash';
EK2.G.party[0].status = 'burn';
EK2.G.party[0].moves[0].pp = 2;
EK2.G.bag = { bloomorb: 4, salve: 1 };
EK2.G.money = 1234;
EK2.G.dex = { pyrelynx: 2, zaplet: 1 };
EK2.G.flags = { gotStarter: 1, t_pell: 1 };
EK2.enterMap('emberwood', 8, 12, 'left');
ok(EK2.saveGame(), 'save writes');
ok(EK2.hasSave(), 'a save is detected');

const EK3 = loadGame(store);
ok(EK3.loadGame(), 'load restores a party');
eq(EK3.G.party.length, 2, 'both kin came back');
eq(EK3.G.party[0].species, 'pyrelynx', 'species preserved');
eq(EK3.G.party[0].lvl, 22, 'level preserved');
eq(EK3.G.party[0].hp, 13, 'damage preserved');
eq(EK3.G.party[0].nick, 'Ash', 'nickname preserved');
eq(EK3.G.party[0].status, 'burn', 'status preserved');
eq(EK3.G.party[0].moves[0].pp, 2, 'spent PP preserved');
eq(EK3.G.money, 1234, 'shards preserved');
eq(EK3.G.bag.bloomorb, 4, 'bag preserved');
eq(EK3.G.dex.pyrelynx, 2, 'dex preserved');
eq(EK3.G.flags.t_pell, 1, 'beaten trainers stay beaten');
eq(EK3.G.mapId, 'emberwood', 'position preserved');
eq(EK3.G.player.x, 8, 'x preserved');

section('a corrupt save never crashes the game');
const EK4 = loadGame({ emberkin_save_v1: '{not json' });
eq(EK4.loadGame(), false, 'garbage is rejected');
const EK5 = loadGame({ emberkin_save_v1: JSON.stringify({ v: 1, party: [{ s: 'nonexistent', l: 5, mv: [] }] }) });
eq(EK5.loadGame(), false, 'an unknown species is dropped rather than loaded');

section('a battle message never outlives its battle');
// A pending battle line used to hijack every world dialogue that followed it,
// which silently froze story beats — the legendary stopped being catchable.
EK.G.party = [EK.mkMon('cindercub', 10)];
EK.startBattle({ foe: EK.mkMon('zaplet', 5), wild: true });
ok(!!EK.G.battleMsg, 'a battle opens with a message pending');
EK.G.battle = null;                                   // battle torn down mid-message
EK.G.mode = 'world';
EK.say('Someone', ['A line in the world.'], () => { EK.G.flags.spoke = 1; });
eq(EK.G.mode, 'dialogue', 'world dialogue opens');
for (let i = 0; i < 6 && EK.G.mode === 'dialogue'; i++) { EK.pressKey('a'); EK.step(.2); EK.releaseKey('a'); EK.fired.clear(); }
eq(EK.G.mode, 'world', 'and can be advanced past');
eq(EK.G.flags.spoke, 1, 'its callback runs');
EK.G.battleMsg = null; EK.G.flags = {};

// The other half of the same mistake, and the one that actually bricked a run:
// an unread battle message still pending when the battle ENDS. The end-of-battle
// text goes up through G.dialogue, but every press was applied to the invisible
// battle message instead — and its `hold` was only ticked by updateBattle, which
// stops running the moment the mode is 'dialogue'. The hold never expired, so
// nothing on screen moved and no button did anything, ever.
EK.G.party = [EK.mkMon('cindercub', 20)];
EK.enterMap('route_one', 9, 10, 'down');
EK.G.mode = 'world';
EK.startBattle({ foe: EK.mkMon('sproutle', 5), wild: true });
EK.G.battleMsg = { lines: ['a line nobody got round to reading'], i: 0, done: null, hold: .12 };
let finished = false;
EK.say('', ['You pocket 8 rare gems.', 'Told you.', 'You collected 300 shards.'],
  () => { finished = true; EK.G.battle = null; EK.G.battleMsg = null; EK.G.mode = 'world'; });
eq(EK.G.mode, 'dialogue', 'the end-of-battle text opens');
for (let i = 0; i < 30 && EK.G.mode === 'dialogue'; i++) { EK.pressKey('a'); EK.step(.05); EK.releaseKey('a'); EK.fired.clear(); }
ok(finished, 'confirm walks the end-of-battle lines to the end');
eq(EK.G.mode, 'world', 'and hands control back to the world');
eq(EK.G.battle, null, 'with the battle torn down');

// Playback waits for the HP bars to catch up before it shows the next line. A
// bar that can never catch up would gate it for ever and hang the fight on
// screen with no way out, so an unreal number counts as settled, not as a wall.
EK.G.mode = 'world'; EK.G.battle = null; EK.G.battleMsg = null; EK.G.dialogue = null;
EK.G.party = [EK.mkMon('cindercub', 20)];
EK.startBattle({ foe: EK.mkMon('sproutle', 5), wild: true });
const stuckB = EK.B();
EK.submitLog(EK.endTurn());
stuckB.dispM = NaN; stuckB.tgtM = NaN;                  // a bar that will never arrive
const liWas = stuckB.li;
for (let i = 0; i < 60 && EK.G.battle && EK.B().log; i++) {
  EK.pressKey('a'); EK.step(.05); EK.releaseKey('a'); EK.fired.clear();
}
ok(!EK.G.battle || !EK.B().log || EK.B().li > liWas, 'playback keeps moving even when a bar never arrives');
EK.G.battle = null; EK.G.mode = 'world';

// And a new fight never inherits the last one's unread line.
EK.G.battleMsg = { lines: ['left over'], i: 0, done: null, hold: .12 };
EK.G.party = [EK.mkMon('cindercub', 20)];
EK.startBattle({ foe: EK.mkMon('zaplet', 5), wild: true });
ok(!EK.G.battleMsg || EK.G.battleMsg.lines[0] !== 'left over', 'a new battle does not inherit the old message');
EK.G.battle = null; EK.G.battleMsg = null; EK.G.mode = 'world';

section('winning a fight offers a card, and the run goes on');
// End to end through the real teardown: the battle comes off the board, the
// offer opens, taking one grows the deck, and the world is playable after.
const winRun = withDeck(loadGame({}));
winRun.enterMap('route_one', 9, 10, 'down');
winRun.G.mode = 'world';
winRun.G.party = [winRun.mkMon('tsunaga', 50)];
const cardsBefore = winRun.G.cards.length;
winRun.startBattle({ foe: winRun.mkMon('sproutle', 3), wild: true });
ok(autoFight(winRun), 'the fight resolved');
eq(winRun.B().over, 'win', 'and it was a win');
// A win holds the arena for a beat before the card offer — a fight you won
// should not turn straight into a transaction. It is skippable, so the press
// that ends it must not also confirm the screen behind it.
let sawFlourish = false;
for (let i = 0; i < 40 && !winRun.G.screen; i++) {
  winRun.pressKey('a'); winRun.step(.2); winRun.releaseKey('a'); winRun.fired.clear();
  winRun.draw();
  sawFlourish = sawFlourish || !!winRun.G.flourish;
}
ok(sawFlourish, 'the win got a moment first');
eq(winRun.G.flourish, null, 'and the moment ended');
eq(winRun.G.battle, null, 'the battle is off the board');
eq(winRun.G.mode, 'screen', 'and the card offer is up');
eq(winRun.G.screen.kind, 'reward', 'it is the reward screen');
ok(winRun.G.screen.list.length > 1, 'with something to choose between');
winRun.G.screen.i = 0;
winRun.screenSelect();
eq(winRun.G.cards.length, cardsBefore + 1, 'taking one grows the deck by exactly one');
eq(winRun.G.mode, 'world', 'and hands the world back');
// And the world really is playable — not just labelled that way.
const wx = winRun.G.player.x;
winRun.pressKey('right');
for (let i = 0; i < 30; i++) { winRun.step(.05); winRun.fired.clear(); }
winRun.releaseKey('right');
ok(winRun.G.player.x !== wx || winRun.G.battle, 'you can walk away from it');

section('a throw takes its time, and says what really happened');
// The outcome is decided the moment the orb leaves your hand — everything after
// is playback. What matters is that the playback tells the truth: three shakes
// on screen means the roll really did hold three times.
for (const shakes of [0, 1, 2, 3]) {
  const beats = EK.orbBeats(shakes, false).map((b) => b[0]);
  eq(beats.filter((b) => b === 'wobble').length, shakes, `a ${shakes}-shake miss wobbles ${shakes} times`);
  eq(beats[beats.length - 1], 'burst', `and ends by bursting open`);
  ok(beats[0] === 'throw' && beats.includes('suck') && beats.includes('fall'), 'after an arc, a vanish and a drop');
}
const held = EK.orbBeats(3, true).map((b) => b[0]);
eq(held[held.length - 1], 'click', 'a catch ends on the click');
eq(held.filter((b) => b === 'wobble').length, 3, 'having wobbled all the way');
ok(EK.orbBeats(3, false).reduce((n, b) => n + b[1], 0) > 2.5, 'a full three-shake throw is a real wait');

// The line it prints is the number of shakes it actually did.
const thr = withDeck(loadGame({}));
thr.enterMap('route_one', 9, 10, 'down');
const outcomes = new Map();
for (let i = 0; i < 400 && outcomes.size < 3; i++) {
  thr.G.party = [thr.mkMon('pyrelynx', 30)];
  thr.G.bag = { bloomorb: 99 };
  thr.G.battle = null;
  thr.startBattle({ foe: thr.mkMon('gargolem', 30), wild: true });
  const bb = thr.B();
  const log = [];
  thr.tryCatch(log, 'bloomorb');
  const plan = bb.orbPlan;
  const wobbles = plan.beats.filter((b) => b[0] === 'wobble').length;
  const line = log[log.length - 1].t;
  outcomes.set(wobbles + ':' + plan.caught, line);
  if (plan.caught) {
    eq(bb.over, 'caught', 'a hold ends the battle as a catch');
    ok(/click/.test(line), 'and says so');
  } else {
    ok(/out|shake|close/i.test(line), `a ${wobbles}-shake miss says how close it came: "${line}"`);
  }
  thr.G.battle = null;
}
ok(outcomes.size >= 2, `throws produce more than one outcome (${outcomes.size} distinct)`);

section('the orb holds the battle log until it stops moving');
const orbRun = withDeck(loadGame({}));
orbRun.setCtx(mkCtx());
orbRun.enterMap('route_one', 9, 10, 'down');
orbRun.G.party = [orbRun.mkMon('pyrelynx', 30)];
orbRun.G.bag = { prismorb: 99 };
orbRun.startBattle({ foe: orbRun.mkMon('mothrix', 5), wild: true });
orbRun.G.battleMsg = null;
orbRun.B().foe.hp = 1;                              // as close to a certain hold as the maths gets
orbRun.submitLog(orbRun.doAction({ kind: 'item', id: 'prismorb' }));
let frames = 0, sawOrb = false;
while (orbRun.G.battle && frames++ < 400) {
  orbRun.step(.05);
  if (orbRun.orbPhase()) sawOrb = true;
  orbRun.fired.clear();
}
ok(sawOrb, 'the throw actually plays out rather than resolving on the spot');
ok(frames > 40, `and holds the battle while it does (${frames} frames, ${(frames * .05).toFixed(1)}s)`);

section('a catch celebrates, then hands you its papers');
const cel = withDeck(loadGame({}));
cel.setCtx(mkCtx());
cel.enterMap('route_one', 9, 10, 'down');
cel.G.party = [cel.mkMon('pyrelynx', 30)];
cel.G.bag = { prismorb: 200 };
let caughtOne = false;
for (let tryN = 0; tryN < 60 && !caughtOne; tryN++) {
  cel.G.battle = null; cel.G.gotcha = null; cel.G.screen = null; cel.G.mode = 'world';
  cel.startBattle({ foe: cel.mkMon('mothrix', 4), wild: true });
  cel.G.battleMsg = null;
  cel.B().foe.hp = 1;
  cel.submitLog(cel.doAction({ kind: 'item', id: 'prismorb' }));
  for (let i = 0; i < 400 && !cel.G.gotcha; i++) { cel.step(.05); cel.fired.clear(); }
  caughtOne = !!cel.G.gotcha;
}
ok(caughtOne, 'a weakened kin under a prism orb is eventually caught');
eq(cel.G.battle, null, 'the battle is off the board before the celebration');
ok(cel.G.gotcha.species === 'mothrix', 'the celebration is about the kin you caught');
// It ends on its own, and hands over to the profile.
for (let i = 0; i < 200 && cel.G.gotcha; i++) { cel.step(.05); cel.fired.clear(); }
eq(cel.G.gotcha, null, 'the celebration ends on its own');
eq(cel.G.screen && cel.G.screen.kind, 'profile', 'and opens the new kin\'s papers');
ok(cel.G.party.some((m) => m.species === 'mothrix'), 'which is a kin you now have');

section('naming a kin you just caught');
const prof = cel.G.screen;
const mine = prof.opt.mon;
eq(mine.nick || '', '', 'it starts with no nickname of its own');
// commitNick reads the field; headless there is none, so drive it directly.
mine.nick = '  Mothy  McMoth  ';
eq(cel.commitNick({ opt: { mon: mine } }), 'Mothy McMoth', 'a name is trimmed and its spaces squashed');
mine.nick = 'a'.repeat(40);
eq(cel.commitNick({ opt: { mon: mine } }).length, 12, 'and capped at something a name box can hold');
mine.nick = mine.name;
eq(cel.commitNick({ opt: { mon: mine } }), '', 'naming it after its own species is not a nickname');
mine.nick = 'Mothy';
eq(cel.dispName(mine), 'Mothy', 'a named kin goes by its name');
// Confirm always means "that will do": the cursor starts on the way out, so
// mashing the one button you always have cannot trap you on this screen.
eq(cel.G.screen.i, 1, 'the cursor starts on the way out, not on the name field');
cel.screenSelect();
eq(cel.G.screen, null, 'and taking it along closes the papers');
eq(cel.G.mode, 'world', 'back to the world');
ok(cel.hasSave(), 'with the name written down');

section('the papers are reachable again from the party');
cel.G.mode = 'world';
cel.openScreen('party');
cel.G.screen.i = cel.G.party.findIndex((m) => m.species === 'mothrix');
cel.screenSelect();
eq(cel.G.screen.kind, 'profile', 'picking a kin outside a fight opens its papers');
eq(cel.G.screen.opt.mon.species, 'mothrix', 'the one you picked');
cel.closeScreen();
eq(cel.G.screen.kind, 'party', 'and closing goes back to the party, not to nowhere');
cel.closeScreen();

section('healing restores the whole party');
EK.G.party = [EK.mkMon('bramblor', 30), EK.mkMon('voltyx', 25)];
EK.G.party[0].hp = 1; EK.G.party[0].status = 'burn'; EK.G.party[0].moves[0].pp = 0;
EK.G.party[1].hp = 0;
EK.healParty();
ok(EK.G.party.every((m) => m.hp === m.max && !m.status && m.moves.every((mv) => mv.pp === mv.max)), 'everyone is whole again');

// The XP bar is the one bar in a fight that only ever moves once, and it used to
// move by teleporting: it read `m.xp` raw while the HP bar beside it glided to
// its target. On a level-up it was worse than abrupt — the level increments
// before the bar is next drawn, so the fill was measured against the NEW level's
// floor and the bar jumped from part-full straight to a sliver of the next
// level, never passing through full. The one thing an XP bar exists to show was
// the one thing it never showed.
section('the xp bar sweeps instead of teleporting');
{
  // Fought through real input on purpose. `autoFight` calls the raw playCard /
  // endTurn and throws their logs away, so it never reaches submitLog — and the
  // sweep lives entirely in the playback that submitLog drives. A test built on
  // autoFight watched a bar that was never being animated and said it was fine.
  const g = withDeck(loadGame());
  g.G.party = [g.mkMon('cindercub', 5)];
  // Parked just under the level-6 floor so the win is guaranteed to cross it.
  // Without this the kin gains a dozen xp against a Lv4 foe, never reaches the
  // boundary, and the fill has nowhere to sweep to — the first version of this
  // asserted a wrap that the scenario could not produce.
  g.G.party[0].xp = g.xpFor(6) - 2;
  g.startBattle({ foe: g.mkMon('sproutle', 4), wild: true });
  ok(g.B().dispXp === g.G.party[0].xp, 'a fight opens with the bar where the kin actually is');
  ok(g.B().barLv === 5, 'and drawn against the level it is actually on');

  const startXp = g.G.party[0].xp;
  let guard = 0, lagged = false, sawFull = false;
  while (g.G.battle && guard++ < 600) {
    const b = g.B();
    if (b) {
      if (Math.abs(b.tgtXp - b.dispXp) > 0) lagged = true;
      const fl = g.xpFor(b.barLv);
      const span = Math.max(1, g.xpFor(b.barLv + 1) - fl);
      if ((b.dispXp - fl) / span > .95) sawFull = true;
    }
    const stuck = b && b.phase === 'player' && !b.log && !b.over
      && !b.hand.some((c) => g.playableNow(b, c));
    const key = stuck ? 'e' : 'a';
    g.step(.12);
    g.pressKey(key); g.step(.02); g.releaseKey(key); g.fired.clear();
  }
  ok(guard < 600, `the fight resolved through input (${guard} frames)`);
  const won = g.G.party[0].xp > startXp;
  ok(g.G.party[0].lvl === 6, `and levelled across the boundary (Lv${g.G.party[0].lvl})`);
  ok(won, `the kin actually earned xp (${startXp} -> ${g.G.party[0].xp})`);
  if (won) {
    ok(lagged, 'the bar was seen behind its target rather than snapping to it');
    ok(sawFull, 'and it was seen at the top of a level rather than skipping the fill');
  }
}

section('switching hands the xp bar to the kin that came in');
{
  const g = withDeck(loadGame());
  g.G.party = [g.mkMon('cindercub', 5), g.mkMon('sproutle', 12)];
  g.startBattle({ foe: g.mkMon('dewdrip', 5), wild: true });
  const other = g.G.party[1];
  g.G.battle.mine = other;
  g.G.battle.dispXp = other.xp;
  ok(g.B().dispXp === other.xp, 'the bar reads the incoming kin, not the outgoing one');
  ok(other.xp !== g.G.party[0].xp, 'and those two totals really are different');
}

// The stat bars are read against what a creature of THIS level can be, not a
// flat number. It was a flat 130, which put a Lv30 kin's 21..71 in the bottom
// half of the track (29 and 42 indistinguishable) and let a Lv100's 225 clamp
// off the end. The ceiling is the dex's highest base stat carried to the same
// level, so a full bar means "as strong as the strongest thing in the valley".
// If somebody adds a creature above that base, every bar silently starts
// clamping and nothing else would say so.
section('the stat bar ceiling covers the whole dex');
{
  const g = loadGame();
  let hi = 0, who = '';
  for (const id of g.DEX_ORDER) {
    const b = g.DEX[id].base;
    for (const i of [1, 2, 3]) if (b[i] > hi) { hi = b[i]; who = id; }
  }
  ok(hi <= 110, `no creature out-bases the ceiling (highest is ${who} at ${hi})`);
  // And it has to actually discriminate at a level people play at.
  const m = g.mkMon('kindlark', 31);
  const ceil = g.statAt(110, 31);
  const spread = Math.abs(m.spd - m.def) / ceil;
  ok(spread > .3, `two stats a creature really has read apart (${Math.round(spread * 100)}% of the track)`);
}

// The bag out of a fight. In a battle an item acts on the kin that is out; in
// the field it has to find somebody, and the screen never said who — you
// pressed A on a salve and a toast afterwards told you who had drunk it. Four
// of the seven things in a full bag cannot be used out there at all, and they
// were drawn exactly like the three that can.
section('the bag says what it would do before you do it');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null; g.G.mode = 'world'; g.G.battle = null;
  g.G.party = ['pyrelynx', 'brookite', 'bramblor'].map((id, i) => g.mkMon(id, 18 + i));
  Object.keys(g.ITEMS).forEach((k) => { g.G.bag[k] = 3; });
  const p = g.G.party;
  p[0].hp = p[0].max;                       // the first one is FINE, so a target of
  p[1].hp = Math.round(p[1].max * .4);      // party[0] would be visibly wrong
  p[2].hp = 0;

  const orb = Object.keys(g.ITEMS).find((k) => g.ITEMS[k].kind === 'orb');
  const heal = Object.keys(g.ITEMS).find((k) => g.ITEMS[k].kind === 'heal');
  const revive = Object.keys(g.ITEMS).find((k) => g.ITEMS[k].kind === 'revive');
  ok(orb && heal && revive, 'the bag holds an orb, a salve and a revive to reason about');

  ok(!g.fieldItemUse(orb).ok, 'an orb has nothing to do on a footpath');
  ok(/wild/i.test(g.fieldItemUse(orb).why), `and says why — "${g.fieldItemUse(orb).why}"`);
  eq(g.fieldItemUse(heal).target, p[1], 'a salve names the kin that is hurt, not the first in the party');
  eq(g.fieldItemUse(revive).target, p[2], 'and a revive names the one that is down');

  // The invariant, walked over the whole bag rather than over named items:
  // nothing the screen dims can be spent, and nothing it names can fail. The
  // row and the button read one function, so this is what that buys.
  g.openScreen('bag');
  const list = g.screenList(g.G.screen);
  ok(list.length > 3, `the shelf has something on it (${list.length})`);
  ok(g.fieldItemUse(list[g.G.screen.i]).ok,
    `the cursor opens on something usable (${list[g.G.screen.i]})`);
  for (const k of list) {
    const before = g.G.bag[k];
    const use = g.fieldItemUse(k);
    const tgt = use.target, hpBefore = tgt ? tgt.hp : 0;
    g.G.screen.i = list.indexOf(k);
    g.screenSelect();
    if (use.ok) {
      eq(g.G.bag[k] || 0, before - 1, `${k} is spent when the row says it would work`);
      ok(tgt.hp > hpBefore, `and the kin the row named is the one that got it (${g.dispName(tgt)})`);
      g.G.bag[k] = before; tgt.hp = hpBefore;      // put it back for the next item
    } else {
      eq(g.G.bag[k], before, `${k} is not spent when the row is dimmed`);
    }
  }

  // In a fight the shelf is a different question and the cursor stays put:
  // orbs are the point there, and they lead the list.
  g.G.mode = 'world'; g.G.screen = null;
  g.startBattle({ foe: g.mkMon('kindlark', 12), wild: true });
  g.openScreen('bag');
  eq(g.G.screen.i, 0, 'in a fight it opens where it always did');
}

done('emberkin');
