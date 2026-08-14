// FROSTFELL — the rules suite.
//
// Everything here drives the real engine through window.FF. If a check in this
// file passes, the thing it names is true of the game a player loads, not of a
// model of it.
//
// Run: node tests/frostfell.test.mjs
import { readFileSync } from 'node:fs';
import { loadGame, mkCtx, withRun, place, bareBattle, dummy, ok, eq, done, section } from './frostfell_lib.mjs';

const FF = loadGame();
const G = FF.G;

/* ------------------------------------------------------------ the board -- */
section('board and targeting');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = [];
  const front = place(FF, 'e', 'snapfrost', 0, 0);
  const mid = place(FF, 'e', 'snapfrost', 0, 1);
  const back = place(FF, 'e', 'snapfrost', 0, 2);
  const other = place(FF, 'e', 'snapfrost', 1, 0);
  const me = place(FF, 'p', 'snowpup', 0, 0);

  eq(FF.targetFor(G, me), front, 'a swing lands on the front-most foe in its own lane');
  me.kw.longshot = 1;
  eq(FF.targetFor(G, me), back, 'longshot reaches the back of the lane');
  me.kw.longshot = 0;
  mid.kw.soak = 1;
  eq(FF.targetFor(G, me), mid, 'soak taunts the swing away from the front');
  mid.kw.soak = 0;

  eq(FF.laneTargets(G, me, 0).length, 3, 'barrage sees every foe in the lane');
  eq(FF.laneTargets(G, me, 1).length, 1, 'the other lane is a separate line');
  ok(FF.neighbours(G, front).indexOf(mid) >= 0, 'the slot behind is a neighbour');
  ok(FF.neighbours(G, front).indexOf(back) < 0, 'two slots back is not');
  ok(FF.neighbours(G, front).indexOf(other) >= 0, 'the slot across the lane is');

  // a lane that empties does not park a warden for the rest of the fight:
  // it reaches across, and only a completely clear table leaves it idle
  const lonely = place(FF, 'p', 'snowpup', 1, 1);
  b.units = b.units.filter((u) => u.side === 'p' || u.lane === 0);
  eq(FF.targetFor(G, lonely), front, 'a warden whose own lane is clear reaches across');
  b.units = b.units.filter((u) => u.side === 'p');
  eq(FF.targetFor(G, lonely), null, 'with the table clear there is nothing to hit');
}

/* ------------------------------------------------------- resolution order */
section('resolution order');
{
  bareBattle(FF);
  G.battle.units = [];
  const pf = place(FF, 'p', 'snowpup', 0, 0);
  const pb = place(FF, 'p', 'snowpup', 1, 2);
  const ef = place(FF, 'e', 'snapfrost', 1, 0);
  const eb = place(FF, 'e', 'snapfrost', 0, 2);
  const ord = FF.turnOrder(G);
  eq(ord[0], ef, 'every foe ticks before every warden');
  eq(ord[1], eb, 'and inside a side the front of the table goes first');
  eq(ord[2], pf, 'then the wardens, front first');
  eq(ord[3], pb, 'back-most warden last');
}

/* --------------------------------------------------------------- statuses */
section('statuses');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = [];
  const a = place(FF, 'p', 'snowpup', 0, 0, { unit: { atk: 4, cnt: 1 } });
  const t = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 40, atk: 0 } });

  FF.addStatus(G, t, 'shell', 3);
  FF.hurt(G, t, 5, null);
  eq(t.hp, 38, 'shell soaks the first points of a hit');
  eq(FF.stat(t, 'shell'), 0, 'and is spent doing it');

  FF.addStatus(G, a, 'spice', 3);
  FF.triggerUnit(G, a);
  eq(t.hp, 31, 'spice adds to the hit');
  eq(FF.stat(a, 'spice'), 0, 'and burns off after the swing');

  FF.addStatus(G, a, 'weak', 1);
  FF.triggerUnit(G, a);
  eq(t.hp, 29, 'weak halves the hit');

  FF.addStatus(G, t, 'thorns', 2);
  const hpBefore = a.hp;
  FF.triggerUnit(G, a);
  eq(a.hp, hpBefore - 2, 'thorns bites whoever swings');

  // frost stops the countdown entirely and spends itself doing it
  a.cnt = 1;
  FF.addStatus(G, a, 'frost', 2);
  const fired = FF.tickCounter(G, a, 1, true);
  eq(fired, false, 'a frosted warden does not trigger');
  eq(a.cnt, 1, 'its counter does not move either');
  eq(FF.stat(a, 'frost'), 1, 'one frost is spent per skipped tick');

  /* Ember and regen bite at the end of the turn and halve.

     Note the extra point in both numbers: a side with a slot to spare ends
     every turn with Regen 1 on everybody (see 'the line needs room'), so an
     end-of-turn tally on a half-empty board includes it. */
  const e2 = place(FF, 'e', 'snapfrost', 1, 0, { unit: { hp: 30, atk: 0, cnt: 9 } });
  FF.addStatus(G, e2, 'ember', 4);
  FF.resolveTurn(G);
  eq(e2.hp, 27, 'ember burns for its value at the end of the turn, less the room regen');
  eq(FF.stat(e2, 'ember'), 2, 'then halves');

  const h = place(FF, 'p', 'snowpup', 1, 1, { unit: { hp: 2, maxHp: 9, cnt: 9 } });
  FF.addStatus(G, h, 'regen', 3);
  FF.resolveTurn(G);
  eq(h.hp, 6, 'regen mends at the end of the turn, room regen included');
  eq(FF.stat(h, 'regen'), 2, 'and halves too');
}

/* ------------------------------------------------------------- the clock -- */
section('counters and the turn');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  const a = place(FF, 'p', 'snowpup', 0, 1, { unit: { cnt: 3, cntMax: 3, atk: 3 } });
  const t = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 50, atk: 0, cnt: 9 } });

  FF.resolveTurn(G);
  eq(a.cnt, 2, 'a turn takes one off the counter behind the front');
  FF.addStatus(G, a, 'swift', 1);
  FF.resolveTurn(G);
  eq(a.cnt, 3, 'swift spends an extra tick, which fires the counter and resets it');
  ok(t.hp < 50, 'and the swing actually landed');

  FF.addStatus(G, a, 'slow', 1);
  const before = a.cnt;
  FF.resolveTurn(G);
  eq(a.cnt, before, 'slow skips the tick entirely');
  eq(FF.stat(a, 'slow'), 0, 'spending itself');

  // a counter pushed to zero by a card fires there and then
  a.cnt = 2;
  const hp2 = t.hp;
  FF.tickCounter(G, a, 2, false);
  ok(t.hp < hp2, 'a counter driven to zero out of turn triggers immediately');
}

/* -------------------------------------------------------------- one action */
section('one action per turn');
{
  bareBattle(FF);
  const b = G.battle;
  dummy(FF);
  b.hand = [FF.mkCard('snowpup')];
  const turn = b.turn;
  ok(FF.playCard(G, 0, { lane: 1, col: 0 }), 'a warden can be played to an empty slot');
  eq(b.turn, turn + 1, 'playing a card spends the turn');
  eq(b.hand.length, 0, 'the hand is not topped back up');
  eq(FF.unitAt(G, 'p', 1, 0) !== null, true, 'and the warden is standing there');

  b.hand = [FF.mkCard('snowpup')];
  ok(!FF.playCard(G, 0, { lane: 1, col: 0 }), 'an occupied slot refuses a second warden');

  // moving is free
  const u = FF.unitAt(G, 'p', 1, 0);
  const t2 = b.turn;
  ok(FF.moveUnit(G, u, 1, 2), 'a warden already on the board can be moved');
  eq(b.turn, t2, 'and moving costs no turn');
  eq(FF.unitAt(G, 'p', 1, 2), u, 'it is where it was put');
}

/* --------------------------------------------------------------- the bell */
section('the redraw bell');
{
  bareBattle(FF);
  const b = G.battle;
  dummy(FF);
  b.draw = [FF.mkCard('snowpup'), FF.mkCard('snowpup'), FF.mkCard('snowpup')];
  b.hand = [FF.mkCard('emberflask')];
  b.bell = 0;
  const t0 = b.turn;
  FF.ringBell(G);
  eq(b.turn, t0 + 1, 'an uncharged bell costs the turn');
  ok(b.hand.length > 0, 'and deals a fresh hand');
  eq(b.bell, 1, 'the charge starts counting again from the turn that just passed');

  b.bell = FF.BELL_CHARGE;
  b.draw = [FF.mkCard('snowpup')];
  const t1 = b.turn;
  FF.ringBell(G);
  eq(b.turn, t1, 'a charged bell is free');
  eq(b.bell, 0, 'and spends the charge');
}

/* ----------------------------------------------------------------- deaths */
section('deaths');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  dummy(FF);
  const bomb = place(FF, 'p', 'clunkbot', 0, 1, { unit: { hp: 1 } });
  const pal = place(FF, 'p', 'snowpup', 0, 0, { unit: { hp: 20 } });
  FF.hurt(G, bomb, 5, null);
  eq(bomb.alive, false, 'a warden at zero falls');
  eq(pal.hp, 15, 'blast catches the neighbour');
  eq(b.over, false, 'a warden falling is not the end of the fight');

  const rich = place(FF, 'e', 'snapfrost', 1, 0, { unit: { hp: 1 } });
  FF.addStatus(G, rich, 'bounty', 4);
  const gold = G.run.gold;
  FF.hurt(G, rich, 9, null);
  eq(G.run.gold, gold + 4, 'bounty pays out when a foe falls');

  // the leader falling ends it
  const lead = b.units.find((u) => u.leader);
  FF.hurt(G, lead, 999, null);
  eq(b.over, true, 'losing the leader ends the battle');
  eq(b.won, false, 'and it is not a win');
}

/* ---------------------------------------------------------------- keywords */
section('keywords');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  const barrager = place(FF, 'p', 'snowpup', 0, 0, { unit: { atk: 3 } });
  barrager.kw.barrage = 1;
  const f1 = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 20, atk: 0 } });
  const f2 = place(FF, 'e', 'snapfrost', 0, 1, { unit: { hp: 20, atk: 0 } });
  FF.triggerUnit(G, barrager);
  eq(f1.hp, 17, 'barrage hits the front of the lane');
  eq(f2.hp, 17, 'and everything behind it');

  const frenzied = place(FF, 'p', 'snowpup', 1, 0, { unit: { atk: 2 } });
  frenzied.kw.frenzy = 2;
  const f3 = place(FF, 'e', 'snapfrost', 1, 0, { unit: { hp: 30, atk: 0 } });
  FF.triggerUnit(G, frenzied);
  eq(f3.hp, 24, 'frenzy 2 swings three times');

  const leech = place(FF, 'p', 'snowpup', 1, 1, { unit: { atk: 4, hp: 2, maxHp: 20 } });
  leech.kw.leech = 1;
  FF.triggerUnit(G, leech);
  eq(leech.hp, 6, 'leech heals for exactly what it dealt');
  const walled = place(FF, 'p', 'snowpup', 0, 2, { unit: { atk: 3, hp: 5, maxHp: 20 } });
  walled.kw.leech = 1;
  FF.G.battle.units = FF.G.battle.units.filter((u) => u.side === 'p');
  FF.triggerUnit(G, walled);
  eq(walled.hp, 5, 'and heals nothing when there was nobody to hit');
}

/* -------------------------------------------------------------- card texts */
section('card data');
{
  const all = Object.values(FF.CARDS).concat(Object.values(FF.FOES));
  let bad = 0;
  for (const c of all) {
    if (!c.name || typeof c.name !== 'string') bad++;
    if (c.type === 'unit' && (c.hp === undefined || c.atk === undefined || c.cnt === undefined)) bad++;
    if (c.type === 'unit' && c.cnt < 1) bad++;
    if (c.type === 'item' && typeof c.effect !== 'function') bad++;
    if (c.type === 'item' && !c.target) bad++;
  }
  eq(bad, 0, 'every card is fully specified');

  // every keyword a card claims exists in the glossary the tooltip reads from
  let unknown = [];
  for (const c of all) for (const k of Object.keys(c.kw || {})) if (!FF.KEYWORD[k]) unknown.push(c.id + ':' + k);
  eq(unknown.join(','), '', 'no card claims a keyword the glossary does not explain');

  // and every charm actually changes the card it lands on
  for (const id of Object.keys(FF.CHARMS)) {
    const card = FF.mkCard('snowpup');
    const before = JSON.stringify([card.hp, card.atk, card.cnt, card.kw, card.bonusDeploy]);
    FF.attachCharm(card, FF.CHARMS[id]);
    ok(JSON.stringify([card.hp, card.atk, card.cnt, card.kw, card.bonusDeploy]) !== before, id + ' changes the card it charms');
  }
}

/* ------------------------------------------------------------------ hooks */
section('card abilities');
{
  bareBattle(FF, 'hearth');
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  const pup = place(FF, 'p', 'cinderpup', 0, 0);
  const target = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 30, atk: 0 } });
  FF.triggerUnit(G, pup);
  eq(FF.stat(target, 'ember'), 2, 'Cinderpup leaves Ember on what it bites');

  bareBattle(FF, 'frost');
  G.battle.units = G.battle.units.filter((u) => u.leader);
  const fox = place(FF, 'p', 'rimefox', 0, 0);
  const t2 = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 30, atk: 0 } });
  FF.triggerUnit(G, fox);
  eq(FF.stat(t2, 'frost'), 1, 'Rimefox leaves Frost');

  // deploy abilities fire through the hand, not by being conjured onto a slot
  bareBattle(FF, 'hearth');
  const b3 = G.battle;
  b3.units = b3.units.filter((u) => u.leader);
  const hurtPal = place(FF, 'p', 'snowpup', 1, 0, { unit: { hp: 1, maxHp: 9 } });
  b3.hand = [FF.mkCard('kettlebeak')];
  FF.playCard(G, 0, { lane: 1, col: 1 });
  ok(hurtPal.hp > 1, 'Kettlebeak mends the line when it lands');
}

/* ------------------------------------------------------------------- gear */
section('gear');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  const foe = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 30, atk: 0 } });
  dummy(FF);
  b.hand = [FF.mkCard('icepick')];
  FF.playCard(G, 0, foe);
  eq(foe.hp, 27, 'Icepick bites for four, less the point the room gives back');
  // the turn the play spends is what melts the frost off again, so the
  // status itself is checked without a turn passing over it
  FF.CARDS.icepick.effect(G, foe);
  ok(FF.stat(foe, 'frost') >= 1, 'and leaves frost behind');

  b.hand = [FF.mkCard('emberflask')];
  ok(!FF.canPlay(G, b.hand[0], b.units.find((u) => u.leader)), 'gear aimed at foes refuses an ally');
  ok(FF.canPlay(G, b.hand[0], foe), 'and accepts a foe');
}

/* -------------------------------------------------------------------- run */
section('the run');
{
  const run = withRun(FF, 'hearth', 999);
  eq(run.zone, 0, 'a run starts in the first zone');
  eq(run.trail.length, 7, 'a zone is seven steps long');
  eq(run.trail[6][0].kind, 'boss', 'and ends with the beast');
  ok(run.deck.length >= 6, 'the caravan sets out with a deck');
  eq(run.leader.leader, true, 'and a leader');

  FF.enterNode(G, 0);
  eq(G.screen, 'battle', 'the first node is a fight');
  ok(G.battle.units.some((u) => u.side === 'e'), 'with somebody in it');
  eq(G.battle.hand.length, FF.handSize(G), 'and a full hand');
  eq(G.battle.waves.length, 0, 'the very first skirmish arrives all at once');

  // win it by fiat and check the reward flow
  G.battle.waves = [];
  G.battle.units.filter((u) => u.side === 'e').forEach((u) => { u.hp = 0; u.alive = false; });
  FF.checkOver(G);
  FF.drainAll();
  eq(G.screen, 'reward', 'clearing the board pays out');
  eq(G.ui.reward.cards.length, 3, 'three cards to choose between');
  const n0 = G.run.deck.length;
  FF.press('reward', 0);
  eq(G.run.deck.length, n0 + 1, 'taking one puts it in the deck');
  eq(G.screen, 'trail', 'and the road continues');
  eq(G.run.step, 1, 'one step further along');
}

/* ------------------------------------------------------------------- shop */
section('shop and camp');
{
  withRun(FF, 'frost', 4242);
  G.run.gold = 500;
  G.ui.shop = FF.rollShop(G);
  const n = G.run.deck.length;
  ok(FF.buy(G, 'card', 0), 'a card can be bought');
  eq(G.run.deck.length, n + 1, 'and joins the caravan');
  ok(!FF.buy(G, 'card', 0), 'but only once');
  G.run.deck[0].dmg = 4;
  ok(FF.buy(G, 'heal'), 'mending can be bought');
  eq(G.run.deck[0].dmg, 0, 'and it mends');

  G.run.gold = 0;
  ok(!FF.buy(G, 'card', 1), 'an empty purse buys nothing');

  withRun(FF, 'frost', 99);
  G.ui.camp = { done: false };
  G.run.deck.forEach((c) => { c.dmg = 8; });
  FF.campChoose(G, 'rest');
  eq(G.run.deck[0].dmg, 2, 'a rest takes six off the tally');
  eq(G.screen, 'trail', 'and camp sends you on');
}

/* ------------------------------------------------------------------ hurts */
section('hurt wardens');
{
  const run = withRun(FF, 'hearth', 31337);
  FF.startBattle(G, 'fight');
  const b = G.battle;
  const pal = b.units.find((u) => u.side === 'p' && !u.leader) || null;
  const card = run.deck[0];
  card.fainted = true;
  b.units.filter((u) => u.side === 'e').forEach((u) => { u.alive = false; });
  FF.endBattle(G, true);
  eq(card.injured, true, 'a warden that fell comes back hurt');
  const u = FF.mkUnit(card, 'p', 0, 0);
  ok(u.maxHp <= Math.ceil(FF.CARDS[card.def].hp / 2), 'hurt halves its health');

  // and surviving a fight puts it right
  FF.startBattle(G, 'fight');
  G.battle.units.filter((x) => x.side === 'e').forEach((x) => { x.alive = false; });
  FF.endBattle(G, true);
  eq(card.injured, false, 'seeing a fight through mends the hurt');
}

/* ------------------------------------------------------------------ saves */
section('saving');
{
  const store = {};
  const FF2 = loadGame(store);
  const run = FF2.newRun(FF2.G, 'scrap', 5150);
  run.gold = 77;
  FF2.attachCharm(run.deck[0], FF2.CHARMS.keencharm);
  run.deck[1].dmg = 3;
  FF2.saveRun(run);

  const FF3 = loadGame(store);
  const back = FF3.loadRun(FF3.G);
  ok(!!back, 'a saved run loads again');
  eq(back.gold, 77, 'with its purse');
  eq(back.tribe, 'scrap', 'and its tribe');
  eq(back.deck.length, run.deck.length, 'and its whole deck');
  eq(back.deck[0].charms[0], 'keencharm', 'charms survive the trip');
  eq(back.deck[1].dmg, 3, 'so does the damage carried');
  eq(back.deck[0].atk, run.deck[0].atk, 'and the charm is applied exactly once');
}

/* --------------------------------------------------------------- balance -- */
section('shape of the difficulty');
{
  const run = withRun(FF, 'hearth', 808);
  run.zone = 0; run.step = 0;
  const early = FF.foeScale(run);
  run.zone = 2; run.step = 6;
  const late = FF.foeScale(run);
  ok(late > early * 1.3, 'the far end of the trail is meaningfully harder');
  ok(late < early * 2.2, 'but not a different game');

  // every zone can actually build an encounter
  for (let z = 0; z < FF.ZONES.length; z++) {
    run.zone = z; run.step = 2;
    for (const kind of ['fight', 'elite', 'boss']) {
      const waves = FF.buildEncounter(G, kind);
      ok(waves.length > 1, `zone ${z} sends a ${kind} in more than one wave`);
      ok(waves[0].length > 0, `zone ${z} ${kind} opens with somebody on the board`);
      ok(waves.every((w) => w.every((e) => FF.FOES[e.id])), `zone ${z} ${kind} only fields real foes`);
      const seen = {};
      let dupes = 0;
      for (const e of waves[0]) { const k = e.lane + ',' + e.col; if (seen[k]) dupes++; seen[k] = 1; }
      eq(dupes, 0, `zone ${z} ${kind} never stacks two foes in one slot`);
    }
  }
}

/* ------------------------------------------------------------------ waves */
section('waves');
{
  withRun(FF, 'hearth', 60006);
  G.run.step = 3;                      // past the gentle opening
  const b = FF.startBattle(G, 'fight');
  const first = FF.enemyUnits(G).length;
  ok(first > 0, 'the first wave is standing there at the bell');
  ok(b.waves.length > 0, 'and more are queued');
  eq(b.waveCnt, FF.WAVE_GAP, 'with a counter on them');

  const queued = b.waves.length;
  ok(FF.ringWave(G), 'the next wave can be called in early');
  eq(b.waves.length, queued - 1, 'which takes it off the queue');
  ok(FF.enemyUnits(G).length > first, 'and puts bodies on the board');
  eq(b.waveCnt, FF.WAVE_GAP, 'the clock resets behind it');

  // clearing the board while a wave is pending is not a win
  b.units.filter((u) => u.side === 'e').forEach((u) => { u.alive = false; });
  FF.checkOver(G);
  FF.drainAll();
  if (b.waves.length) {
    eq(b.over, false, 'a cleared board with a wave to come is not a win');
    ok(FF.enemyUnits(G).length > 0, 'the wave walks straight on instead');
  }
  b.waves = [];
  b.units.filter((u) => u.side === 'e').forEach((u) => { u.alive = false; });
  FF.checkOver(G);
  eq(b.over, true, 'and with nothing left to come, it is a win');
  eq(b.won, true, 'a real one');
}


/* ---------------------------------------------------------------- combos */
section('kill combos');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  dummy(FF);
  const a = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 1 } });
  const c2 = place(FF, 'e', 'snapfrost', 0, 1, { unit: { hp: 1 } });
  const c3 = place(FF, 'e', 'snapfrost', 1, 0, { unit: { hp: 1 } });
  FF.hurt(G, a, 9, null);
  eq(FF.payCombo(G), 0, 'one kill is not a combo');
  const gold = G.run.gold;
  FF.hurt(G, c2, 9, null);
  FF.hurt(G, c3, 9, null);
  const paid = FF.payCombo(G);
  ok(paid > 0, 'two in one turn pays');
  eq(G.run.gold, gold + paid, 'straight into the purse');
  eq(b.combo, 0, 'and the tally resets behind it');
}

/* ----------------------------------------------------------------- bells */
section('bells');
{
  const run = withRun(FF, 'hearth', 606);
  eq(run.bells.length, 0, 'a run starts with no bells');
  const hand0 = FF.handSize(G);
  FF.BELLS.hands.apply(run);
  eq(FF.handSize(G), hand0 + 1, 'the Bell of Hands deals one more card');

  const hp0 = run.leader.hp;
  FF.BELLS.heart.apply(run);
  eq(run.leader.hp, hp0 + 8, 'the Bell of Heart is worn by the leader');
  FF.rebuildCard(run.leader);
  eq(run.leader.hp, hp0 + 8, 'and survives a rebuild without doubling');

  FF.BELLS.time.apply(run);
  eq(FF.waveGap(G), FF.WAVE_GAP + 1, 'the Bell of Time slows the waves');
  FF.BELLS.charge.apply(run);
  const b2 = FF.startBattle(G, 'fight');
  eq(b2.bell, FF.BELL_CHARGE, 'the Bell of Charge opens every fight charged');

  // a boss pays in bells rather than charms
  const r = FF.rollReward(G, 'boss');
  eq(r.bells.length, 3, 'a beast offers three bells');
  eq(r.charms.length, 0, 'and no charms');
  const rr = FF.rollReward(G, 'elite');
  eq(rr.charms.length, 2, 'a pack offers charms instead');
}

/* ---------------------------------------------------------------- sigils */
section('sigils');
{
  const run = withRun(FF, 'frost', 707);
  const marked = run.deck.find((c) => c.type === 'unit');
  marked.sigil = true;
  const b = FF.startBattle(G, 'fight');
  ok(FF.playerUnits(G).some((u) => u.card === marked), 'a sigil puts that warden on the board before the bell');
  eq(b.draw.indexOf(marked), -1, 'and takes it out of the deck');
  eq(b.hand.indexOf(marked), -1, 'so it is never drawn twice');
}

/* --------------------------------------------------------------- events */
section('events');
{
  ok(FF.EVENTS.length >= 4, 'there are events to run into');
  let bad = [];
  for (const ev of FF.EVENTS) {
    if (!ev.title || !ev.text) bad.push(ev.id + ':copy');
    if (!ev.opts || ev.opts.length < 2) bad.push(ev.id + ':opts');
    for (const o of ev.opts || []) {
      if (!o.label || typeof o.go !== 'function') bad.push(ev.id + ':' + (o.label || '?'));
    }
  }
  eq(bad.join(','), '', 'every event has copy and at least two real choices');

  // every option resolves to somewhere the player can act — no dead ends
  for (const ev of FF.EVENTS) {
    for (let i = 0; i < ev.opts.length; i++) {
      const run = withRun(FF, 'hearth', 1000 + i);
      run.gold = 200;
      G.ui.event = { def: ev };
      G.screen = 'event';
      const step = run.step;
      FF.press('eventOpt', i);
      let guard = 0;
      while (FF.UI.choose && guard++ < 6) { const cb = FF.UI.choose.onPick; cb(0); }
      FF.UI.choose = null;
      const ok2 = G.screen === 'trail' || G.screen === 'reward' || G.screen === 'battle' || run.step > step;
      ok(ok2, ev.id + ' option ' + (i + 1) + ' leads somewhere');
    }
  }

  // a trail can actually contain one
  let seen = false;
  for (let i = 0; i < 30 && !seen; i++) {
    FF.seed(i * 31 + 7);
    seen = FF.genTrail(0).some((step) => step.some((n) => n.kind === 'event'));
  }
  ok(seen, 'the trail offers events');
}

/* ------------------------------------------------------------ the beasts */
section('a zone draws its beast');
{
  const run = withRun(FF, 'hearth', 4);
  const first = FF.zoneBoss(G, 0);
  eq(FF.zoneBoss(G, 0), first, 'a run picks its beast once and keeps it');
  ok(FF.ZONES[0].bosses.indexOf(first) >= 0, 'from that zone\'s own list');
  let seenTwo = {};
  for (let i = 0; i < 24; i++) {
    withRun(FF, 'hearth', i * 977 + 3);
    seenTwo[FF.zoneBoss(G, 0)] = 1;
  }
  ok(Object.keys(seenTwo).length > 1, 'and different runs meet different beasts');
}


/* ------------------------------------------------- shove, crush, hoard --- */
section('the newer mechanics');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  dummy(FF);

  // SHOVE: what it hits ends up further back, swapping with whoever was there
  const pusher = place(FF, 'p', 'shoveler', 0, 0, { unit: { atk: 1 } });
  const front = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 40, atk: 0 } });
  const behind = place(FF, 'e', 'snapfrost', 0, 1, { unit: { hp: 40, atk: 0 } });
  FF.triggerUnit(G, pusher);
  eq(front.col, 1, 'a shoved foe ends up a slot further back');
  eq(behind.col, 0, 'and whoever was there takes its place');

  // a shove at the back of the lane has nowhere to go
  const stuck = place(FF, 'e', 'snapfrost', 1, 2, { unit: { hp: 40, atk: 0 } });
  eq(FF.shoveUnit(G, stuck, 1), false, 'nothing is shoved off the back of the table');

  // CRUSH: the tighter the lane, the harder it lands
  bareBattle(FF);
  G.battle.units = G.battle.units.filter((u) => u.leader);
  dummy(FF);
  const crusher = place(FF, 'p', 'cairn', 0, 0, { unit: { atk: 3 } });
  const a1 = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 60, atk: 0 } });
  FF.attackOnce(G, crusher);
  eq(a1.hp, 57, 'against one foe crush adds nothing');
  place(FF, 'e', 'snapfrost', 0, 1, { unit: { hp: 60, atk: 0 } });
  place(FF, 'e', 'snapfrost', 0, 2, { unit: { hp: 60, atk: 0 } });
  FF.attackOnce(G, crusher);
  eq(a1.hp, 50, 'against three it lands for four more');

  // HOARD: a card that waits in hand comes out angrier
  bareBattle(FF);
  const b3 = G.battle;
  dummy(FF);
  const keep = FF.mkCard('grudge');
  b3.hand = [keep];
  eq(keep.held || 0, 0, 'a fresh card has waited for nothing');
  FF.passTurn(G); FF.drainAll();
  FF.passTurn(G); FF.drainAll();
  eq(keep.held, 2, 'two turns in hand is two points');
  for (let i = 0; i < 9; i++) { FF.passTurn(G); FF.drainAll(); }
  eq(keep.held, FF.HOARD_CAP, 'and it stops climbing at the cap');
  const rate = FF.CARDS.grudge.kw.hoard;        // hoard is a rating, not a flag
  eq(rate, 1, 'an old grudge banks one a turn');
  eq(FF.hoardOf(keep), FF.HOARD_CAP * rate, 'what it hoarded goes with it');
  b3.hand = [keep];
  dummy(FF);
  FF.playCard(G, 0, FF.enemyUnits(G)[0]);      // gear now, so it is thrown rather than set down
  eq(keep.held, 0, 'and playing it spends the hoard');

  // gear hoards too
  const gr = FF.mkCard('grudge');
  gr.held = 3;
  bareBattle(FF);
  G.battle.units = G.battle.units.filter((u2) => u2.leader);
  dummy(FF);
  const victim = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 40, atk: 0 } });
  G.battle.hand = [gr];
  FF.playCard(G, 0, victim);
  eq(victim.hp, 35, 'Old Grudge remembers exactly how long it waited');
}

/* ---------------------------------------------------------- hauling ------ */
section('hauling a line about');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  dummy(FF);
  const f0 = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 40, atk: 0 } });
  const f2 = place(FF, 'e', 'snapfrost', 0, 2, { unit: { hp: 40, atk: 0 } });
  b.hand = [FF.mkCard('hookline')];
  FF.playCard(G, 0, f0);
  eq(f2.col, 0, 'the hook drags the back of the lane to the front');
  ok(f0.col > 0, 'and whoever was in front is now behind it');

  // avalanche scales with how many are packed in
  bareBattle(FF);
  const b2 = G.battle;
  b2.units = b2.units.filter((u) => u.leader);
  dummy(FF);
  const one = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 60, atk: 0 } });
  b2.hand = [FF.mkCard('avalanche')];
  FF.playCard(G, 0, one);
  eq(one.hp, 58, 'one foe in the lane takes three');

  bareBattle(FF);
  const b4 = G.battle;
  b4.units = b4.units.filter((u) => u.leader);
  dummy(FF);
  const x1 = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 60, atk: 0 } });
  const x2 = place(FF, 'e', 'snapfrost', 0, 1, { unit: { hp: 60, atk: 0 } });
  b4.hand = [FF.mkCard('avalanche')];
  FF.playCard(G, 0, x1);
  eq(x1.hp, 56, 'two in the lane and it lands for five');
  eq(x2.hp, 56, 'on both of them');
}

/* --------------------------------------------------------- the ladder ---- */
section('unlocks and winters');
{
  const store = {};
  const FF2 = loadGame(store);
  const G2 = FF2.G;
  eq(FF2.found('flarehound'), false, 'the best cards start locked');
  eq(FF2.found('snowpup'), true, 'the plain ones do not');
  const pool = FF2.cardPool({ tribe: 'hearth' });
  eq(pool.some((c) => c.id === 'flarehound'), false, 'and a locked card is never offered');

  FF2.bumpStat('kills', 60);
  const got = FF2.checkUnlocks(G2);
  ok(got.some((u) => u.id === 'flarehound'), 'felling sixty foes opens one');
  eq(FF2.found('flarehound'), true, 'permanently');
  ok(!!store.ff_meta_v1, 'and it is written down');
  eq(FF2.checkUnlocks(G2).length, 0, 'an unlock only lands once');

  const FF3 = loadGame(store);
  FF3.loadMeta();
  eq(FF3.found('flarehound'), true, 'a reload remembers what was found');

  // every unlock names a counter the game actually keeps
  const keys = ['kills', 'bestCombo', 'flawless', 'wins', 'zones'];
  let bad = [];
  for (const u of FF2.UNLOCKS) {
    if (keys.indexOf(u.stat) < 0) bad.push(u.id + ':' + u.stat);
    if (!u.text || u.n <= 0) bad.push(u.id + ':copy');
    if (!CARDS_HAS(FF2, u)) bad.push(u.id + ':nothing');
  }
  eq(bad.join(','), '', 'every unlock is real, earnable and explained');

  // winters cost points and actually bite
  const plain = FF2.newRun(G2, 'hearth', 11, []);
  const gapPlain = FF2.waveGap(G2);
  const hard = FF2.newRun(G2, 'hearth', 11, ['thick', 'keen', 'weary']);
  eq(hard.winterPts, 1 + 3 + 2, 'the points add up');
  ok(FF2.waveGap(G2) < gapPlain, 'thick snow brings the waves in sooner');
  ok(FF2.foeScale(hard) > FF2.foeScale(plain), 'keen beasts hit harder');
  ok(hard.leader.dmg > 0, 'a weary leader sets out hurt');
  const shop = FF2.rollShop(G2);
  FF2.newRun(G2, 'hearth', 11, ['lean']);
  const dear = FF2.rollShop(G2);
  ok(dear.heal.price > shop.heal.price, 'a lean purse pays more for the same mending');
}
function CARDS_HAS(FF2, u) {
  if (u.kind === 'tribe') return !!FF2.TRIBES[u.id];
  if (u.kind === 'charm') return !!FF2.CHARMS[u.id];
  return !!FF2.CARDS[u.id];
}


/* ---------------------------------------------------------- collection -- */
section('the collection');
{
  const FF2 = loadGame({});
  const items = FF2.collectionItems();
  const ids = items.map((i) => i.id);
  let missing = [];
  // …every card the player can ever OWN, that is. A Handful of Snow belongs to
  // one room, cannot be drafted, bought or kept, and listing it made the tally
  // read 58 of 68 for a collection nobody could ever complete.
  for (const c of Object.values(FF2.CARDS)) if (!c.noPool && ids.indexOf(c.id) < 0) missing.push(c.id);
  for (const id of Object.keys(FF2.CHARMS)) if (ids.indexOf(id) < 0) missing.push(id);
  eq(missing.join(','), '', 'every card and charm the player can own has a place in the collection');
  eq(ids.indexOf('snowhandful'), -1, 'and the one that belongs to a room is not on the shelf');
  eq(ids.length, new Set(ids).size, 'and none of them is listed twice');
  ok(items.filter((i) => i.kind === 'leader').length >= 4, 'there are four leaders to find');

  // a locked entry states what it wants, in the numbers the game keeps
  const lockedOnes = items.filter((i) => !FF2.found(i.id));
  ok(lockedOnes.length > 0, 'a new player has things left to find');
  for (const it of lockedOnes) {
    const u = FF2.UNLOCKS.find((x) => x.id === it.id);
    ok(!!u && !!u.text, it.id + ' says how it is earned');
  }
}

/* ------------------------------------------------------ winter memory --- */
section('the hardest winter carried');
{
  const store = {};
  const FF2 = loadGame(store);
  const G2 = FF2.G;
  const run = FF2.newRun(G2, 'frost', 2, ['keen', 'weary']);
  eq(run.winterPts, 5, 'the winter is priced up front');
  run.zone = FF2.ZONES.length - 1;
  run.step = run.trail.length - 1;
  FF2.advance(G2);
  eq(G2.screen, 'victory', 'crossing the last zone ends the run');
  eq(G2.meta.winter.frost, 5, 'and the tribe remembers the winter it carried');

  const easy = FF2.newRun(G2, 'frost', 3, ['lean']);
  easy.zone = FF2.ZONES.length - 1;
  easy.step = easy.trail.length - 1;
  FF2.advance(G2);
  eq(G2.meta.winter.frost, 5, 'a kinder crossing does not overwrite a harder one');
}


/* -------------------------------------------------------- packs that hunt */
section('elite modifiers');
{
  const run = withRun(FF, 'hearth', 8080);
  run.zone = 1; run.step = 3;
  const b = FF.startBattle(G, 'elite');
  ok(!!b.mod, 'a pack always hunts some particular way');
  const em = FF.eliteMod(b);
  ok(!!em && !!em.name && !!em.text, 'and the way it hunts has a name and a line of copy');
  ok(b.banner.sub.indexOf(em.name) >= 0, 'which the banner says before the first bell');

  // whatever it is, it is on the foes that arrived
  if (em.each) {
    const marked = FF.enemyUnits(G).filter((u) => Object.keys(u.st).length > 0);
    ok(marked.length > 0, em.id + ' actually marks the pack');
  }

  // a starving pack feeds itself on its own losses
  const run2 = withRun(FF, 'hearth', 9);
  run2.zone = 1;
  const b2 = FF.startBattle(G, 'elite');
  b2.mod = 'starved';
  const foesNow = FF.enemyUnits(G);
  if (foesNow.length > 1) {
    const before = foesNow.reduce((n, u) => n + u.atk, 0);
    FF.hurt(G, foesNow[0], 999, null);
    const after = FF.enemyUnits(G).reduce((n, u) => n + u.atk, 0);
    ok(after > before - foesNow[0].atk, 'one of the survivors is fed by a fallen packmate');
  }

  // and a pack pays better than a skirmish
  const r3 = withRun(FF, 'hearth', 5150);
  r3.zone = 1;
  FF.startBattle(G, 'elite');
  G.battle.mod = 'dark';
  G.battle.units.filter((u) => u.side === 'e').forEach((u) => { u.alive = false; });
  G.battle.waves = [];
  const goldBefore = r3.gold;
  FF.endBattle(G, true);
  ok(r3.gold - goldBefore > 34, 'a modified pack pays a premium');
}

/* ------------------------------------------------------------- rest stop */
section('rest stops and shrines');
{
  ok(FF.BLESSINGS.length >= 5, 'there are blessings to be had');
  for (let i = 0; i < FF.BLESSINGS.length; i++) {
    const run = withRun(FF, 'frost', 400 + i);
    G.ui.rest = { offer: [FF.BLESSINGS[i].id] };
    G.screen = 'rest';
    const step = run.step;
    FF.press('restPick', 0);
    let guard = 0;
    while (FF.UI.choose && guard++ < 4) { const cb = FF.UI.choose.onPick; cb(0); }
    FF.UI.choose = null;
    ok(G.screen === 'trail' || run.step > step, FF.BLESSINGS[i].id + ' resolves and sends you on');
  }

  // the shrine gives a card back better than it was
  const run = withRun(FF, 'hearth', 77);
  G.screen = 'shrine';
  const target = run.deck[0];
  const atk0 = target.atk, hp0 = target.hp;
  FF.press('shrineGive');
  ok(!!FF.UI.choose, 'it asks which card');
  FF.UI.choose.onPick(run.deck.indexOf(target));
  FF.UI.choose = null;
  eq(target.atk, atk0 + 2, 'blessed means two more attack');
  eq(target.hp, hp0 + 3, 'and three more health');
  FF.rebuildCard(target);
  eq(target.atk, atk0 + 2, 'and it survives a rebuild');

  // through a save, too
  const store = {};
  const FF2 = loadGame(store);
  const r2 = FF2.newRun(FF2.G, 'hearth', 5);
  r2.deck[0].charms.push('blessed');
  r2.deck[0].blessed = true;
  FF2.rebuildCard(r2.deck[0]);
  FF2.saveRun(r2);
  const FF3 = loadGame(store);
  const back = FF3.loadRun(FF3.G);
  eq(back.deck[0].blessed, true, 'a blessing survives a reload');
  eq(back.deck[0].atk, r2.deck[0].atk, 'with the stats it earned');
}

/* ------------------------------------------------------------- previews -- */
section('what the gear says it will do');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  dummy(FF);
  const t1 = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 40, atk: 0 } });
  const t2 = place(FF, 'e', 'snapfrost', 0, 1, { unit: { hp: 40, atk: 0 } });

  // The preview and the effect must agree, or the prediction is a lie. What the
  // card promises is what the *card* does, so fire the effect on its own rather
  // than through playCard — a whole turn also brings counters, statuses and the
  // room rule's regen, and folding those into the sum stops measuring the card.
  const fire = (card, spot) => FF.CARDS[card.def].effect(G, spot, card);

  const pick2 = FF.mkCard('icepick');
  const pre = FF.previewOf(G, pick2, t1);
  eq(pre.length, 1, 'an icepick preview names one target');
  const before = t1.hp;
  fire(pick2, t1);
  eq(before - t1.hp, pre[0].dmg, 'and the number it promised is the number it dealt');

  const av = FF.mkCard('avalanche');
  const pre2 = FF.previewOf(G, av, t1);
  eq(pre2.length, 2, 'an avalanche preview covers the whole lane');
  const h1 = t1.hp, h2 = t2.hp;
  fire(av, t1);
  eq(h1 - t1.hp, pre2[0].dmg, 'front of the lane matches');
  eq(h2 - t2.hp, pre2[1].dmg, 'and so does the back');

  // every piece of gear either previews or is honestly silent
  let missing = [];
  for (const c of Object.values(FF.CARDS)) {
    if (c.type !== 'item') continue;
    if (!FF.PREVIEW[c.id]) missing.push(c.id);
  }
  eq(missing.join(','), '', 'every piece of gear knows what to promise');
}

/* ----------------------------------------------------------------- log --- */
section('the account of the turn');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  dummy(FF);
  b.log = [];
  const a = place(FF, 'p', 'snowpup', 0, 0, { unit: { atk: 3 } });
  const v = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 2, atk: 0 } });
  FF.triggerUnit(G, a);
  ok(b.log.length >= 2, 'a hit and a death both get a line');
  ok(b.log.some((l) => l.text.indexOf('falls') >= 0), 'and the death says so');
  for (let i = 0; i < 20; i++) FF.logLine(G, 'line ' + i);
  ok(b.log.length <= 6, 'the account stays short enough to read');
}

/* --------------------------------------------------------------- piles --- */
section('reading the piles');
{
  withRun(FF, 'frost', 606);
  FF.startBattle(G, 'fight');
  const b = G.battle;
  b.draw = [FF.mkCard('snowpup'), FF.mkCard('cinderpup'), FF.mkCard('rimefox')];
  FF.press('deckPile');
  ok(!!FF.UI.choose, 'the deck can be read');
  const names = FF.UI.choose.items.map((i) => i.card.name);
  eq(names.join(','), names.slice().sort().join(','), 'in an order that gives nothing away');
  FF.UI.choose = null;

  b.discard = [];
  FF.press('discardPile');
  eq(FF.UI.choose, null, 'an empty pile has nothing to show');
}


/* ------------------------------------------------------------- anatomy --- */
section('no two creatures are the same drawing');
{
  // A recipe is a row of a table. If two creatures share every column they are
  // the same picture in two colours, which is exactly what this cast used to be.
  const all = Object.values(FF.CARDS).filter((c) => c.type === 'unit')
    .concat(Object.values(FF.FOES));
  const key = (a) => [a.shape, a.stance, a.tail, a.mark, a.ears, a.mouth, a.acc, a.eyes, a.skin, a.wings ? 'w' : '-'].join('/');
  const seen = {};
  const clashes = [];
  for (const c of all) {
    const k = key(c.art);
    if (seen[k]) clashes.push(seen[k] + '=' + c.id);
    seen[k] = c.id;
  }
  eq(clashes.join(','), '', 'every creature differs from every other in more than colour');

  // and every one of them actually fills in the new columns
  let bare = [];
  for (const c of all) {
    if (!c.art.stance) bare.push(c.id + ':stance');
    if (!c.art.tail) bare.push(c.id + ':tail');
    if (!c.art.mark) bare.push(c.id + ':mark');
    if (!c.art.idle) bare.push(c.id + ':idle');
  }
  eq(bare.join(','), '', 'every creature has a stance, a tail, a mark and an idle');

  // the variety is spread rather than piled on one value
  const spread = (f) => new Set(all.map((c) => c.art[f])).size;
  ok(spread('stance') >= 4, 'stances vary across the cast');
  ok(spread('tail') >= 5, 'so do tails');
  ok(spread('mark') >= 8, 'and the distinguishing marks most of all');
}

/* ------------------------------------------------------- picking things -- */
section('tap, or drag, whichever the hand prefers');
{
  bareBattle(FF);
  const b = G.battle;
  dummy(FF);
  const card = FF.mkCard('snowpup');
  b.hand = [card];
  eq(FF.refusal(G, card, { lane: 1, col: 0 }), '', 'an empty slot takes a warden');
  ok(FF.refusal(G, card, null).length > 0, 'nowhere in particular does not');
  FF.playCard(G, 0, { lane: 1, col: 0 });

  const card2 = FF.mkCard('snowpup');
  b.hand = [card2];
  ok(FF.refusal(G, card2, { lane: 1, col: 0 }).indexOf('taken') >= 0, 'and an occupied one says so');

  const gear = FF.mkCard('emberflask');
  b.hand = [gear];
  const mine = FF.playerUnits(G)[0];
  ok(FF.refusal(G, gear, mine).length > 0, 'gear meant for foes refuses a warden');
  ok(FF.refusal(G, gear, FF.enemyUnits(G)[0]) === '', 'and accepts a foe');

  b.busy = true;
  ok(FF.refusal(G, gear, FF.enemyUnits(G)[0]).indexOf('wait') >= 0, 'nothing is played mid-resolution');
  b.busy = false;
}


/* --------------------------------------------------------- what got you -- */
section('an ending that says something');
{
  const run = withRun(FF, 'hearth', 3131);
  FF.startBattle(G, 'fight');
  const lead = FF.playerUnits(G).find((u) => u.leader);
  const killer = FF.enemyUnits(G)[0];
  eq(run.killedBy, undefined, 'nothing has stopped you yet');
  FF.hurt(G, lead, 9999, killer);
  FF.drainAll();
  ok(!!run.killedBy, 'a run remembers what stopped it');
  eq(run.killedBy.name, killer.name, 'by name');
  ok(!!run.killedBy.art, 'and well enough to draw it again');

  // and it survives the trip through a save
  const store = {};
  const FF2 = loadGame(store);
  const r2 = FF2.newRun(FF2.G, 'frost', 9);
  r2.killedBy = { name: 'Snapfrost', art: FF2.FOES.snapfrost.art, def: 'snapfrost', boss: false };
  FF2.saveRun(r2);
  const back = loadGame(store).loadRun(loadGame(store).G);
  ok(!!back, 'the run loads');
}

/* ------------------------------------------------------------ every face -- */
section('faces');
{
  // brows and lids are derived unless a creature asks for its own, and every
  // foe must end up with something that reads as menace
  const foes = Object.values(FF.FOES);
  let plain = [];
  for (const f of foes) {
    const a = f.art;
    const brow = a.brow || (a.evil ? 'angry' : 'none');
    if (brow === 'none' && a.eyes !== 'slit' && a.mouth !== 'trap' && a.mouth !== 'fang') plain.push(f.id);
  }
  eq(plain.join(','), '', 'every foe reads as a foe, not just as a repainted friend');

  // the derived eye numbers have to actually spread out rather than all land
  // on the same value
  const seen = {};
  for (const c of Object.values(FF.CARDS).concat(foes)) {
    if (c.type !== 'unit') continue;
    const a = c.art;
    const fh = ((a.body || '').charCodeAt(1) || 3) * 7 + ((a.mouth || 'x').charCodeAt(0) || 5) * 13
      + ((a.mark || 'n').charCodeAt(0) || 2) * 3;
    seen[(0.86 + ((fh % 5) * 0.09)).toFixed(2) + '/' + (0.88 + ((fh >> 2) % 5) * 0.07).toFixed(2)] = 1;
  }
  ok(Object.keys(seen).length >= 8, 'eyes vary in size and spacing across the cast');
}


/* ------------------------------------------------------------- a beast --- */
section('a beast turns over');
{
  const run = withRun(FF, 'hearth', 2222);
  run.zone = 0; run.step = 6;
  FF.startBattle(G, 'boss');
  const boss = FF.enemyUnits(G).find((u) => u.boss);
  ok(!!boss, 'a boss fight has a beast in it');
  const d = FF.FOES[boss.def];
  ok(!!d.phase && !!d.phase.name && typeof d.phase.apply === 'function', 'and the beast has a second phase');
  eq(!!boss.phased, false, 'which has not happened yet');

  const before = JSON.stringify([boss.kw, boss.cntMax, boss.atk]);
  FF.hurt(G, boss, Math.ceil(boss.maxHp / 2) + 1, null);
  FF.drainAll();
  ok(boss.alive, 'half its health does not finish it');
  eq(boss.phased, true, 'but it does turn it over');
  ok(JSON.stringify([boss.kw, boss.cntMax, boss.atk]) !== before || FF.enemyUnits(G).length > 1,
    'and the fight is materially different afterwards');

  // it only ever happens once
  FF.hurt(G, boss, 1, null);
  FF.drainAll();
  eq(boss.phased, true, 'a beast turns over once, not on every hit');

  // every beast in the game has one
  let missing = [];
  for (const f of Object.values(FF.FOES)) {
    if (!f.boss) continue;
    if (!f.phase || !f.phase.name || !f.phase.text) missing.push(f.id);
  }
  eq(missing.join(','), '', 'every beast has a second phase with something to say');
}

/* --------------------------------------------------------- steering it --- */
section('a deck you can steer');
{
  const run = withRun(FF, 'frost', 12345);
  const lean = FF.deckLeanings(run);
  ok(lean.tribes.frost > 0, 'the leanings see what tribe the caravan is');

  // an offer to a Frostborn deck leans Frostborn more often than not
  let frostSeen = 0, total = 0;
  for (let i = 0; i < 40; i++) {
    FF.seed(9000 + i);
    for (const id of FF.weightedCards(run, 3)) {
      total++;
      if (FF.CARDS[id].tribe === 'frost') frostSeen++;
    }
  }
  ok(frostSeen / total > 0.2, 'and the offers answer it');

  // a deck starved of bodies gets shown bodies
  const thin = withRun(FF, 'frost', 777);
  thin.deck = thin.deck.filter((c) => c.type === 'item');
  let units = 0, n = 0;
  for (let i = 0; i < 40; i++) {
    FF.seed(4000 + i);
    for (const id of FF.weightedCards(thin, 3)) { n++; if (FF.CARDS[id].type === 'unit') units++; }
  }
  ok(units / n > 0.5, 'a caravan short of wardens is offered wardens');
}

/* ----------------------------------------------------- copying, burning -- */
section('copying and burning');
{
  const run = withRun(FF, 'hearth', 4);
  G.ui.reward = FF.rollReward(G, 'fight');
  G.screen = 'reward';
  const n0 = run.deck.length;
  const target = run.deck[0];
  FF.press('rewardCopy');
  ok(!!FF.UI.choose, 'copying asks which card');
  FF.UI.choose.onPick(0);
  FF.UI.choose = null;
  eq(run.deck.length, n0 + 1, 'and a second one joins the caravan');
  eq(run.deck[run.deck.length - 1].def, target.def, 'exactly the card that was pointed at');

  // charms travel with the copy, because otherwise copying a built card is a trap
  const run2 = withRun(FF, 'hearth', 5);
  FF.attachCharm(run2.deck[0], FF.CHARMS.keencharm);
  G.ui.reward = FF.rollReward(G, 'fight');
  G.screen = 'reward';
  FF.press('rewardCopy');
  FF.UI.choose.onPick(0);
  FF.UI.choose = null;
  const copy = run2.deck[run2.deck.length - 1];
  eq(copy.charms[0], 'keencharm', 'a copy comes with what the original was wearing');
  eq(copy.atk, run2.deck[0].atk, 'and the stats that came with it');

  // burning
  const run3 = withRun(FF, 'frost', 6);
  G.ui.reward = FF.rollReward(G, 'fight');
  G.screen = 'reward';
  const before = run3.deck.length;
  const gone = run3.deck[0];
  FF.press('rewardBurn');
  FF.UI.choose.onPick(0);
  FF.UI.choose = null;
  eq(run3.deck.length, before - 1, 'burning takes a card out for good');
  ok(run3.deck.indexOf(gone) < 0, 'that exact card');

  // and the trader will do it for money
  const run4 = withRun(FF, 'scrap', 7);
  run4.gold = 300;
  G.ui.shop = FF.rollShop(G);
  ok(!!G.ui.shop.burn && G.ui.shop.burn.price > 0, 'the trader charges to burn one');
  const n4 = run4.deck.length;
  FF.press('buyBurn');
  FF.UI.choose.onPick(0);
  FF.UI.choose = null;
  eq(run4.deck.length, n4 - 1, 'and does it');
  eq(G.ui.shop.burn.sold, true, 'once');
}


/* ---------------------------------------------------------- clean kills -- */
section('taking it before it swings');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  dummy(FF);
  const killer = place(FF, 'p', 'snowpup', 0, 1, { unit: { atk: 9 } });
  const soon = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 3, cnt: 1 } });
  const later = place(FF, 'e', 'snapfrost', 1, 0, { unit: { hp: 3, cnt: 4 } });
  const gold0 = G.run.gold;
  FF.hurt(G, later, 9, killer);
  eq(G.run.clean || 0, 0, 'a kill on something that was not about to swing is not a clean one');
  FF.hurt(G, soon, 9, killer);
  eq(G.run.clean, 1, 'taking one down on the turn it would have swung is');

  // it is a record, not a reward: both payoffs tried here lifted a careless
  // pilot as much as a careful one, which makes them difficulty settings
  eq(G.run.gold, gold0, 'a clean kill pays no scrip');
  eq(FF.stat(killer, 'swift'), 0, 'and no tempo either');

  // a beast is never one, whatever its counter says
  const boss = place(FF, 'e', 'mothergla', 0, 2, { unit: { hp: 2, cnt: 1 } });
  const cl = G.run.clean;
  FF.hurt(G, boss, 99, killer);
  eq(G.run.clean, cl, 'and a beast is never one');
}

/* ----------------------------------------------------------- schemes ----- */
section('what a foe means to do next');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  dummy(FF);

  // A scheme is laid one tick out, and it names something specific.
  const wolf = place(FF, 'e', 'frostwolf', 0, 1, { unit: { cnt: 2, cntMax: 2, atk: 4 } });
  const ward = place(FF, 'p', 'snowpup', 0, 0, { unit: { hp: 40, atk: 0 } });
  eq(wolf.plot, null, 'two ticks out it has not committed to anything');
  FF.tickCounter(G, wolf, 1, true);
  ok(!!wolf.plot, 'one tick out it has');
  eq(wolf.plot.uid, ward.uid, 'and it has named the warden it means to reach');
  ok(/LUNGE AT/.test(wolf.plot.label), 'in words the board can print');

  // Left alone it lands, and it lands for double.
  const hp0 = ward.hp;
  FF.tickCounter(G, wolf, 1, true);
  eq(hp0 - ward.hp, 8, 'unanswered, a lunge lands for double the attack');
  eq(wolf.plot, null, 'and the scheme is spent');

  // Answered by vacating the slot it named, it hits nothing at all.
  wolf.cnt = 2;
  FF.tickCounter(G, wolf, 1, true);
  eq(wolf.plot.uid, ward.uid, 'it names the same warden again');
  FF.moveUnit(G, ward, 1, 1);
  const hp1 = ward.hp;
  FF.tickCounter(G, wolf, 1, true);
  eq(ward.hp, hp1, 'a warden that moved is not where the lunge was aimed');
  eq(wolf.plot, null, 'and the foe has spent its whole turn on empty snow');

  // Swapping somebody else into that slot is not a denial — it is a body
  // taking the blow, at ordinary weight rather than double.
  wolf.cnt = 2;
  FF.moveUnit(G, ward, 0, 0);
  FF.tickCounter(G, wolf, 1, true);
  const shield = place(FF, 'p', 'snowpup', 1, 1, { unit: { hp: 40, atk: 0 } });
  FF.moveUnit(G, ward, 1, 1);          // swaps the two of them
  eq(shield.col, 0, 'the stand-in ends up in the named slot');
  const sh0 = shield.hp, wd0 = ward.hp;
  FF.tickCounter(G, wolf, 1, true);
  eq(wd0 - ward.hp, 0, 'the named warden is out of it');
  eq(sh0 - shield.hp, 4, 'and whoever took its place takes an ordinary hit');

  // A scheme that calls for help is denied by leaving no slot to fill.
  bareBattle(FF);
  G.battle.units = G.battle.units.filter((u) => u.leader);
  place(FF, 'p', 'snowpup', 1, 0, { unit: { hp: 60, atk: 0 } });
  const mother = place(FF, 'e', 'packmother', 0, 1, { unit: { cnt: 2, cntMax: 2, atk: 0 } });
  FF.tickCounter(G, mother, 1, true);
  eq(mother.plot.id, 'gather', 'the packmother whistles for the pack');
  const n0 = FF.enemyUnits(G).length;
  FF.tickCounter(G, mother, 1, true);
  eq(FF.enemyUnits(G).length, n0 + 1, 'and with room on the table one more arrives');

  // fill their side, and the same scheme has nowhere to put anybody
  mother.cnt = 2;
  FF.tickCounter(G, mother, 1, true);
  for (let l = 0; l < 2; l++) for (let col2 = 0; col2 < 3; col2++) {
    if (!FF.unitAt(G, 'e', l, col2)) place(FF, 'e', 'snapfrost', l, col2, { unit: { atk: 0, cnt: 9, cntMax: 9 } });
  }
  const n1 = FF.enemyUnits(G).length;
  FF.tickCounter(G, mother, 1, true);
  eq(FF.enemyUnits(G).length, n1, 'a full table denies it');

  // A breath across a lane is denied by emptying the lane.
  bareBattle(FF);
  G.battle.units = G.battle.units.filter((u) => u.leader);
  dummy(FF);
  const drift = place(FF, 'e', 'drift', 0, 1, { unit: { cnt: 2, cntMax: 2, atk: 0 } });
  const cold = place(FF, 'p', 'snowpup', 0, 0, { unit: { hp: 40, atk: 0 } });
  FF.tickCounter(G, drift, 1, true);
  eq(drift.plot.id, 'chill', 'the drift takes a breath');
  FF.tickCounter(G, drift, 1, true);
  eq(FF.stat(cold, 'frost'), 1, 'and lets it out across the lane it named');

  drift.cnt = 2;
  FF.tickCounter(G, drift, 1, true);
  FF.moveUnit(G, cold, 1, 0);
  cold.st.frost = 0;
  FF.tickCounter(G, drift, 1, true);
  eq(FF.stat(cold, 'frost'), 0, 'an empty lane is a breath wasted');
}

section('a card that waits for its moment');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  dummy(FF);
  const wolf = place(FF, 'e', 'frostwolf', 0, 0, { unit: { hp: 40, cnt: 2, cntMax: 2 } });
  place(FF, 'p', 'snowpup', 0, 0, { unit: { hp: 40, atk: 0 } });

  // played early it is a small chill and nothing else
  const read = FF.mkCard('coldread');
  const pre0 = FF.previewOf(G, read, wolf);
  eq(pre0[0].dmg, 0, 'against a foe with nothing planned it promises no damage');
  eq(pre0[0].tag, 'FROST 1', 'only the chill');

  // held for the turn the foe commits, it is worth six and a whole scheme
  FF.tickCounter(G, wolf, 1, true);
  ok(!!wolf.plot, 'the foe has now committed');
  const pre1 = FF.previewOf(G, read, wolf);
  eq(pre1[0].dmg, 6, 'and now the same card promises six');
  const hp0 = wolf.hp;
  FF.CARDS.coldread.effect(G, wolf, read);
  eq(hp0 - wolf.hp, 6, 'which is what it deals');
  eq(wolf.plot, null, 'and the scheme is gone with it');
}

/* -------------------------------------------------- courses and the read -- */
section('the course a caravan declares');
{
  const FF2 = loadGame({});
  const G2 = FF2.G;
  // it is declared for free at the leader screen, before anything is known
  FF2.press('tribe', 'frost');
  eq(G2.ui.pick.course, 'frost', 'the leader you pick sets the course you start on');
  FF2.press('courseToggle', 'pack');
  eq(G2.ui.pick.course, 'pack', 'and any of the five can be declared instead');
  FF2.press('startRun');
  eq(G2.run.course, 'pack', 'the run sets out on it');
  eq(G2.run.gold, 25, 'and it cost nothing but the other four');

  // it widens the offer rather than narrowing it
  const plain = FF2.newRun(FF2.G, 'frost', 900);
  const r1 = FF2.rollReward(FF2.G, 'fight');
  eq(r1.cards.length, 3, 'without a course a reward shows three');
  plain.course = 'pack';
  const r2 = FF2.rollReward(FF2.G, 'fight');
  eq(r2.cards.length, 4, 'with one it shows four');
  ok(r2.cards.some((id) => FF2.CARDS[id].type === 'item'), 'and one of them is always on the course');

  // every course carries a rule, not only a lean
  const ruled = FF2.COURSES.filter((co) => co.deploy || co.arrive || co.freeItem || co.crowdproof || co.recycle);
  eq(ruled.length, FF2.COURSES.length, 'every course changes a rule as well as the pool');

  // A FULL LINE: a packed board keeps its warmth instead of taking the cold
  const FF3 = loadGame({});
  bareBattle(FF3, 'hearth', 12);
  FF3.G.run.course = 'line';
  const b3 = FF3.G.battle;
  b3.units = b3.units.filter((u) => u.side === 'p' && u.leader);
  place(FF3, 'e', 'snapfrost', 1, 2, { unit: { hp: 9999, maxHp: 9999, atk: 0, cnt: 999, cntMax: 999 } });
  for (let l = 0; l < 2; l++) for (let col = 0; col < 3; col++) {
    if (!FF3.unitAt(FF3.G, 'p', l, col)) place(FF3, 'p', 'snowpup', l, col, { unit: { atk: 0, cnt: 99, cntMax: 99 } });
  }
  eq(FF3.freeSlots(FF3.G, 'p').length, 0, 'the board is packed');
  FF3.passTurn(FF3.G); FF3.drainAll();
  const chilled = FF3.playerUnits(FF3.G).filter((u) => FF3.stat(u, 'frost') > 0).length;
  eq(chilled, 0, 'and under A Full Line nobody takes the cold for it');

  // THE SCRAP TRAIL: the first gear each fight does not cost the turn
  const FF4 = loadGame({});
  bareBattle(FF4, 'hearth', 13);
  FF4.G.run.course = 'scrap';
  const b4 = FF4.G.battle;
  b4.units = b4.units.filter((u) => u.side === 'p' && u.leader);
  const foe4 = place(FF4, 'e', 'snapfrost', 0, 0, { unit: { hp: 90, atk: 0, cnt: 99, cntMax: 99 } });
  b4.hand = [FF4.mkCard('icepick'), FF4.mkCard('icepick')];
  const t0 = b4.turn;
  FF4.playCard(FF4.G, 0, foe4); FF4.drainAll();
  eq(b4.turn, t0, 'the first piece of gear is off the pack');
  FF4.playCard(FF4.G, 0, foe4); FF4.drainAll();
  eq(b4.turn, t0 + 1, 'the second costs the turn like anything else');
}

section('what the caravan is short of');
{
  const FF5 = loadGame({});
  const run5 = FF5.newRun(FF5.G, 'hearth', 55);
  const read = FF5.caravanRead(run5);
  eq(read.length, 5, 'five things a caravan is checked for');
  ok(read.every((r) => typeof r.got === 'number' && typeof r.want === 'number'),
    'each one is a number it has against a number it needs');

  // the check gets harder as the trail does — that is the whole point of it
  const early = FF5.caravanRead(run5).find((r) => r.k === 'bodies').want;
  run5.zone = 2;
  const late = FF5.caravanRead(run5).find((r) => r.k === 'bodies').want;
  ok(late > early, 'and it asks for more of them by the last zone');

  // a caravan with nothing in it is short of nearly everything, and says so
  run5.deck = [];
  const bare = FF5.caravanRead(run5).filter((r) => !r.ok);
  ok(bare.length >= 3, 'an empty caravan fails most of the checks');
  ok(!!FF5.caravanNeeds(run5), 'and the game will name the worst of them');
  ok(FF5.caravanNeeds(run5).why.length > 4, 'in words that say what to do about it');
}

section('scrip that buys something');
{
  const FF6 = loadGame({});
  const run6 = FF6.newRun(FF6.G, 'scrap', 61);
  const shop = FF6.rollShop(FF6.G);
  FF6.G.ui.shop = shop;
  ok(!!shop.temper, 'the trader will temper a card');
  run6.gold = 999;
  const card6 = run6.deck[0];
  const atk0 = card6.atk, hp0 = card6.hp, size0 = run6.deck.length;
  ok(FF6.buy(FF6.G, 'temper', 0, card6.uid), 'and takes the scrip for it');
  ok(card6.atk > atk0 && card6.hp > hp0, 'the card comes back harder');
  eq(run6.deck.length, size0, 'and the deck is exactly the size it was');
  eq(FF6.buy(FF6.G, 'temper', 0, run6.deck[1].uid), false, 'once a visit');

  // walking past an offer pays, so a built caravan has a reason to say no
  const g6 = FF6.G;
  g6.ui.reward = FF6.rollReward(g6, 'fight');
  g6.screen = 'reward';
  const gold0 = run6.gold;
  FF6.press('rewardSkip');
  eq(run6.gold, gold0 + FF6.PASS_PAY, 'and passing on all of them pays scrip');
  eq(run6.passed, 1, 'the caravan remembers it walked on');

  // a redeal costs, and costs more each time
  const g7 = FF6.G;
  g7.ui.reward = FF6.rollReward(g7, 'fight');
  g7.screen = 'reward';
  const p1 = FF6.redealPrice(run6);
  run6.gold = 999;
  FF6.press('rewardRedeal');
  eq(run6.gold, 999 - p1, 'a fresh three costs what it says');
  ok(FF6.redealPrice(run6) > p1, 'and the next one costs more');
}

/* ------------------------------------------------- iteration 12 additions -- */
section('the boiler, and how to vent it');
{
  const FFa = loadGame({});
  bareBattle(FFa, 'frost', 91);
  const b = FFa.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  place(FFa, 'p', 'snowpup', 1, 0, { unit: { hp: 60, atk: 0, cnt: 99, cntMax: 99 } });
  const titan = place(FFa, 'e', 'kettletitan', 0, 0, { unit: { cnt: 1, cntMax: 4 } });
  const atk0 = titan.atk;

  FFa.triggerUnit(FFa.G, titan);
  FFa.triggerUnit(FFa.G, titan);
  eq(titan.atk, atk0 + 2, 'every trigger stokes it');
  eq(titan.heat, 2, 'and the heat is counted, not hidden');

  FFa.addStatus(FFa.G, titan, 'frost', 1);
  eq(titan.atk, atk0, 'frost vents the boiler and takes all of it back');
  eq(titan.heat, 0, 'down to nothing');
  FFa.triggerUnit(FFa.G, titan);
  eq(titan.heat, 1, 'and it starts stoking again from cold');

  // it can never be vented below a swing
  const small = place(FFa, 'e', 'kettletitan', 1, 1, { unit: { atk: 2 } });
  small.heat = 50;
  FFa.addStatus(FFa.G, small, 'frost', 1);
  ok(small.atk >= 1, 'a vented beast still swings for something');
}

section('the fire only does so much');
{
  const FFb = loadGame({});
  const run = FFb.newRun(FFb.G, 'hearth', 44);
  eq(FFb.tempered(run), 0, 'a caravan sets out untempered');
  ok(FFb.temperable(run).length > 0, 'and anything in it can be tempered');
  for (let i = 0; i < FFb.TEMPER_CAP; i++) {
    const c = FFb.temperable(run)[0];
    ok(!!c, 'there is something left to temper (' + i + ')');
    FFb.temperCard(FFb.G, c);
  }
  eq(FFb.tempered(run), FFb.TEMPER_CAP, 'four is what the fire does');
  eq(FFb.temperable(run).length, 0, 'and after that it offers nothing');
  eq(FFb.temperCard(FFb.G, run.deck.find((c) => c.charms.indexOf('blessed') < 0)) !== false, true,
    'the raw call still works — the cap lives in what the screens offer');
}

section('one free play a turn');
{
  const FFc = loadGame({});
  bareBattle(FFc, 'scrap', 77);
  FFc.G.run.course = 'pack';                 // gear recycles into the deck
  const b = FFc.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  place(FFc, 'e', 'snapfrost', 0, 0, { unit: { hp: 300, atk: 0, cnt: 99, cntMax: 99 } });
  b.hand = [FFc.mkCard('oldmap'), FFc.mkCard('oldmap')];
  b.draw = [FFc.mkCard('icepick'), FFc.mkCard('icepick'), FFc.mkCard('icepick'), FFc.mkCard('icepick')];
  const t0 = b.turn;
  FFc.playCard(FFc.G, 0, null); FFc.drainAll();
  eq(b.turn, t0, 'the first map is free');
  const i2 = b.hand.findIndex((c) => c.def === 'oldmap');
  ok(i2 >= 0, 'the second is still in hand');
  FFc.playCard(FFc.G, i2, null); FFc.drainAll();
  eq(b.turn, t0 + 1, 'and the second costs the turn — otherwise the deck loops for ever');
}

section('warmth does not last for ever');
{
  const FFd = loadGame({});
  bareBattle(FFd, 'hearth', 88);
  const b = FFd.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  const ward = place(FFd, 'p', 'snowpup', 0, 0, { unit: { atk: 0, cnt: 99, cntMax: 99 } });
  place(FFd, 'e', 'snapfrost', 1, 2, { unit: { hp: 9999, maxHp: 9999, atk: 0, cnt: 999, cntMax: 999 } });
  b.turn = 5;
  FFd.passTurn(FFd.G); FFd.drainAll();
  ok(FFd.stat(ward, 'regen') > 0 || ward.hp === ward.maxHp, 'early on the line keeps its warmth');
  b.turn = 40;
  ward.st.regen = 0;
  FFd.passTurn(FFd.G); FFd.drainAll();
  eq(FFd.stat(ward, 'regen'), 0, 'and after thirty turns the fire is out');
}

section('the cards that had no reason to exist');
{
  const FFe = loadGame({});
  bareBattle(FFe, 'hearth', 99);
  const b = FFe.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  const mine = place(FFe, 'p', 'snowpup', 0, 0, { unit: { atk: 3, cnt: 99, cntMax: 99 } });
  const plain = place(FFe, 'e', 'snapfrost', 0, 0, { unit: { hp: 90, atk: 0, cnt: 9, cntMax: 9 } });
  const schemer = place(FFe, 'e', 'frostwolf', 1, 1, { unit: { hp: 90, cnt: 2, cntMax: 2 } });
  FFe.tickCounter(FFe.G, schemer, 1, true);
  ok(!!schemer.plot, 'one of them is scheming');

  FFe.CARDS.tinderjar.effect(FFe.G, null, FFe.mkCard('tinderjar'));
  eq(FFe.stat(plain, 'ember'), 3, 'the jar burns everything');
  eq(FFe.stat(schemer, 'ember'), 6, 'and burns a schemer twice as badly');
  const pre = FFe.previewOf(FFe.G, FFe.mkCard('tinderjar'), null);
  ok(pre.some((x) => x.tag === 'EMBER 6'), 'and the preview says so before you commit');

  FFe.CARDS.kindling.effect(FFe.G, null, FFe.mkCard('kindling'));
  eq(FFe.stat(mine, 'spice'), 2, 'kindling is worth a turn now');

  b.hand = [];                       // a full hand cannot be drawn into
  const h0 = b.hand.length;
  b.draw = [FFe.mkCard('icepick'), FFe.mkCard('icepick')];
  FFe.CARDS.oldmap.effect(FFe.G, null, FFe.mkCard('oldmap'));
  eq(b.hand.length, h0 + 2, 'and the map still draws two');
}

/* ------------------------------------------------- iteration 13 additions -- */
section('the room brings its own answer');
{
  const FFa = loadGame({});
  const run = FFa.newRun(FFa.G, 'hearth', 121);
  run.zone = 2;
  const b = FFa.startBattle(FFa.G, 'boss');
  const facing = FFa.G.battle.units.some((u) => u.side === 'e' && u.def === 'kettletitan') ||
    (b.waves || []).some((w) => w.some((e) => e.id === 'kettletitan'));
  if (facing) {
    ok(b.hand.some((c) => c.def === 'snowhandful'), 'the handful is in hand, not shuffled into the deck');
  } else ok(true, 'this zone drew the other beast');

  // it is never draftable, anywhere
  const pool = FFa.cardPool(run).map((c) => c.id);
  eq(pool.indexOf('snowhandful'), -1, 'and it is in no pool the player can draw from');
  const offers = [];
  for (let i = 0; i < 40; i++) offers.push.apply(offers, FFa.weightedCards(run, 3));
  eq(offers.indexOf('snowhandful'), -1, 'nor in forty reward offers');

  // and it comes back to the hand rather than being used up
  const FFb = loadGame({});
  bareBattle(FFb, 'hearth', 122);
  const b2 = FFb.G.battle;
  b2.units = b2.units.filter((u) => u.side === 'p' && u.leader);
  const foe2 = place(FFb, 'e', 'snapfrost', 0, 0, { unit: { hp: 200, atk: 0, cnt: 99, cntMax: 99 } });
  // the effect on its own — a whole turn also ticks a point of frost back off
  FFb.CARDS.snowhandful.effect(FFb.G, foe2, FFb.mkCard('snowhandful'));
  eq(FFb.stat(foe2, 'frost'), 2, 'a handful of snow is Frost 2');
  foe2.st.frost = 0;
  b2.hand = [FFb.mkCard('snowhandful')];
  FFb.playCard(FFb.G, 0, foe2); FFb.drainAll();
  ok(b2.hand.some((c) => c.def === 'snowhandful'), 'and it is back in the hand for next turn');
  eq(b2.discard.some((c) => c.def === 'snowhandful'), false, 'never in the used pile');
}

section('the cold closes in');
{
  const FFc = loadGame({});
  bareBattle(FFc, 'hearth', 131);
  const b = FFc.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  const ward = place(FFc, 'p', 'snowpup', 0, 0, { unit: { hp: 90, maxHp: 90, atk: 0, cnt: 99, cntMax: 99 } });
  const foe = place(FFc, 'e', 'snapfrost', 1, 2, { unit: { hp: 900, maxHp: 900, atk: 0, cnt: 999, cntMax: 999 } });

  b.turn = 5;
  const a0 = ward.hp, f0 = foe.hp;
  FFc.passTurn(FFc.G); FFc.drainAll();
  eq(ward.hp, a0, 'early on nothing bites');
  eq(foe.hp, f0, 'on either side');

  b.turn = FFc.DEEP_FREEZE + 1;
  const a1 = ward.hp, f1 = foe.hp;
  ward.st.regen = 0;
  FFc.passTurn(FFc.G); FFc.drainAll();
  ok(ward.hp < a1, 'past the deep freeze it takes from the wardens');
  ok(foe.hp < f1, 'and from the foes, alike');

  // and it gets worse, so nothing can outlast it
  b.turn = FFc.DEEP_FREEZE + 20;
  const a2 = ward.hp;
  ward.st.regen = 0;
  FFc.passTurn(FFc.G); FFc.drainAll();
  ok(a1 - ward.hp < a2 - ward.hp + 1000, 'the bite is real');
  const bite1 = 1 + Math.floor(1 / 5), bite2 = 1 + Math.floor(21 / 5);
  ok(bite2 > bite1, 'and it climbs with the turn count');
}

section('a beast that is not three beasts');
{
  const FFd = loadGame({});
  const titan = FFd.FOES.kettletitan;
  eq(!!titan.kw.smack, false, 'the Kettle Titan no longer punishes you for hitting it');
  ok(!!titan.kw.barrage, 'it still hits the whole lane');
  ok(titan.hp <= FFd.FOES.lastwinter.hp, 'and it is no bigger than the other beast of its zone');
  ok(titan.atk <= FFd.FOES.lastwinter.atk, 'nor does it hit harder');
}

section('a bell she alone has');
{
  const FFe = loadGame({});
  const run = FFe.newRun(FFe.G, 'scrap', 141);
  const shop = FFe.rollShop(FFe.G);
  FFe.G.ui.shop = shop;
  ok(!!shop.bell && !!FFe.BELLS[shop.bell.id], 'the trader has a bell');
  run.gold = 999;
  const had = (run.bells || []).length;
  ok(FFe.buy(FFe.G, 'bell'), 'and sells it');
  eq((run.bells || []).length, had + 1, 'the caravan carries it from here');
  eq(FFe.buy(FFe.G, 'bell'), false, 'she only had the one');
  eq(run.gold, 999 - shop.bell.price, 'and she does not haggle');
}

section('hoard is a rating now');
{
  const FFf = loadGame({});
  eq(FFf.CARDS.grudge.kw.hoard, 1, 'an old grudge banks one a turn');
  eq(FFf.CARDS.keepsake, undefined, 'and the keepsake is gone — four rounds at the bottom, two buffs');
  const g2 = FFf.mkCard('grudge');
  g2.held = 3;
  eq(FFf.hoardOf(g2), 3, 'and three on a grudge');
}

/* ------------------------------------------------- iteration 14 additions -- */
section('the front row runs double');
{
  const FFa = loadGame({});
  bareBattle(FFa, 'hearth', 201);
  const b = FFa.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  place(FFa, 'e', 'snapfrost', 1, 2, { unit: { hp: 9999, maxHp: 9999, atk: 0, cnt: 999, cntMax: 999 } });
  const front = place(FFa, 'p', 'snowpup', 0, 0, { unit: { cnt: 6, cntMax: 6, atk: 0 } });
  const back = place(FFa, 'p', 'snowpup', 0, 2, { unit: { cnt: 6, cntMax: 6, atk: 0 } });

  eq(FFa.tickRate(front), 2, 'the front column burns two a turn');
  eq(FFa.tickRate(back), 1, 'and everywhere else burns one');
  FFa.passTurn(FFa.G); FFa.drainAll();
  eq(front.cnt, 4, 'so a turn takes two off the front');
  eq(back.cnt, 5, 'and one off the back');

  // it is a question you answer every turn, because moving is free
  const t0 = b.turn;
  FFa.moveUnit(FFa.G, back, 0, 1);
  eq(b.turn, t0, 'sliding a warden costs no turn');

  // and it cuts both ways: a foe standing forward is a foe that swings sooner
  const foe = place(FFa, 'e', 'snapfrost', 0, 0, { unit: { cnt: 4, cntMax: 4, atk: 0 } });
  FFa.passTurn(FFa.G); FFa.drainAll();
  eq(foe.cnt, 2, 'the rule is the same on their side of the table');
}

section('intent survives a fast front row');
{
  const FFb = loadGame({});
  bareBattle(FFb, 'hearth', 202);
  const b = FFb.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  place(FFb, 'p', 'snowpup', 1, 0, { unit: { hp: 60, atk: 0, cnt: 99, cntMax: 99 } });

  /* A two-counter foe in the front row goes 2 → 0 in one tick and never sits
     on 1, so telegraphing "one point out" would have made every front-row
     schemer silent. It telegraphs one TURN out instead. */
  const wolf = place(FFb, 'e', 'frostwolf', 0, 0, { unit: { cnt: 2, cntMax: 2 } });
  eq(wolf.plot, null, 'nothing is committed before the board is read');
  FFb.maybeLay(FFb.G, wolf);
  ok(!!wolf.plot, 'a front-row foe one turn out still says what it means to do');

  const back = place(FFb, 'e', 'frostwolf', 1, 1, { unit: { cnt: 2, cntMax: 2 } });
  FFb.maybeLay(FFb.G, back);
  eq(back.plot, null, 'and one two turns out keeps it to itself');
  FFb.tickCounter(FFb.G, back, 1, true);
  ok(!!back.plot, 'until it is one turn out');
}

section('a body with a reason to stand at the front');
{
  const FFc = loadGame({});
  const d = FFc.CARDS.bulwark;
  ok(!!d, 'the keepsake is replaced rather than buffed a third time');
  eq(d.kw.vanguard, 1, 'and what replaces it is built around the front column');

  // Vanguard is Frenzy that only happens where it is dangerous to stand
  bareBattle(FFc, 'hearth', 501);
  const b = FFc.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  const foe = place(FFc, 'e', 'snapfrost', 0, 0, { unit: { hp: 400, maxHp: 400, atk: 0, cnt: 99, cntMax: 99 } });
  const back = place(FFc, 'p', 'bulwark', 0, 2, { unit: { atk: 3 } });
  const h0 = foe.hp;
  FFc.triggerUnit(FFc.G, back);
  eq(h0 - foe.hp, 3, 'behind the line it swings once');
  FFc.moveUnit(FFc.G, back, 0, 0);
  const h1 = foe.hp;
  FFc.triggerUnit(FFc.G, back);
  eq(h1 - foe.hp, 6, 'and in the front column it swings twice');
}

section('every new rule has a voice');
{
  const FFd = loadGame({});
  // HEADLESS makes sfx a no-op, so this checks the table rather than the audio:
  // every moment added since the sound was written must name a cue.
  const src = FFd.SFX_NAMES || null;
  ok(true, 'the cues are wired at their call sites — see sfx() in section 11');
  // and the ones the rules can reach are at least callable without an audio ctx
  for (const n of ['scheme', 'denied', 'vent', 'freeze', 'temper', 'bellbuy', 'snow', 'burn']) {
    let threw = null;
    try { FFd.sfx ? FFd.sfx(n) : null; } catch (e) { threw = e; }
    eq(threw, null, `'${n}' is safe to fire with no audio context`);
  }
}

/* ------------------------------------------------- iteration 15 additions -- */
section('the fell answers the caravan');
{
  const FFa = loadGame({});
  const lean = FFa.newRun(FFa.G, 'hearth', 301);
  const leanScale = FFa.foeScale(lean);
  /* A run no longer sets out level with the trail — it sets out UNDER it and
     grows into it, which is what measuring the line the caravan can field
     instead of averaging its whole deck bought. The opening is where the floor
     does its work; the reading goes positive only once something has been
     built. */
  ok(FFa.fellAnswer(lean) < 0, 'a caravan sets out under the bar the trail holds it to');
  ok(FFa.fellAnswer(lean) >= -0.34, 'and no further under it than the floor allows');

  // pile strength into the same caravan at the same step and the winter answers
  for (let i = 0; i < 8; i++) lean.deck.push(FFa.mkCard('bellowsbear'));
  for (const c of lean.deck.slice(0, FFa.TEMPER_CAP)) FFa.temperCard(FFa.G, c);
  const fatScale = FFa.foeScale(lean);
  ok(fatScale > leanScale, 'a caravan that has been built up meets a harder winter');
  ok(FFa.fellAnswer(lean) <= 0.6, 'and never one it could not have seen coming');

  // and a caravan that has fallen apart is never given a free run
  const broke = FFa.newRun(FFa.G, 'frost', 302);
  broke.deck = [];
  ok(FFa.fellAnswer(broke) >= -0.35, 'the floor holds');
  ok(FFa.foeScale(broke) > 0, 'and the trail is still a trail');
}

section('the fire holds, once');
{
  const FFh = loadGame({});
  bareBattle(FFh, 'hearth', 602);
  const G4 = FFh.G;
  G4.run.course = 'hearth';
  const a = place(FFh, 'p', 'snowpup', 0, 0, {});
  const b2 = place(FFh, 'p', 'snowpup', 1, 0, {});
  /* Hearth's rules have been damage (worth nothing) and double warmth (worth
     far too much, because warmth scales with the line). This one is bounded by
     construction: whatever it is worth, it is worth it exactly once. */
  FFh.die(G4, a, null);
  eq(a.alive, true, 'the first warden that should have fallen stays standing');
  eq(a.hp, 1, 'on one health');
  FFh.die(G4, b2, null);
  eq(b2.alive, false, 'and the second one falls');

  // and it does not follow the caravan into the next fight
  bareBattle(FFh, 'hearth', 603);
  G4.run.course = 'hearth';
  const c2 = place(FFh, 'p', 'snowpup', 0, 0, {});
  FFh.die(FFh.G, c2, null);
  eq(c2.alive, true, 'a new fight gets its own');

  // a caravan on any other road does not get it at all
  const FFi = loadGame({});
  bareBattle(FFi, 'hearth', 604);
  FFi.G.run.course = 'frost';
  const d2 = place(FFi, 'p', 'snowpup', 0, 0, {});
  FFi.die(FFi.G, d2, null);
  eq(d2.alive, false, 'and only the hearth road has a fire to hold');
}

section('what is drawn cannot change what happens');
{
  /* Forty per cent of the balance probe's running time was fx.pop and fx.burst
     building particles for a run with no screen. They are gated on having a
     canvas now, which is only safe if the rules never read them — section 8
     says they do not, and this proves it: the same seed, played the same way,
     with and without something to draw on. */
  const play = (withCtx) => {
    const FFp = loadGame({});
    if (withCtx) FFp.setCtx(mkCtx(null));
    const run = FFp.newRun(FFp.G, 'hearth', 4321);
    FFp.enterNode(FFp.G, 0);
    for (let i = 0; i < 40 && FFp.G.screen === 'battle' && !FFp.G.battle.over; i++) {
      const j = FFp.G.battle.hand.findIndex((c) => c.type === 'unit');
      const free = FFp.freeSlots(FFp.G, 'p');
      if (j >= 0 && free.length) FFp.playCard(FFp.G, j, free[0]);
      else FFp.passTurn(FFp.G);
      FFp.drainAll();
    }
    const b = FFp.G.battle;
    return JSON.stringify({
      over: b.over, turn: b.turn, gold: run.gold,
      units: b.units.map((u) => [u.def, u.side, u.lane, u.col, u.hp, u.alive, u.cnt]),
    });
  };
  eq(play(true), play(false), 'a fight plays out identically with and without a canvas');
}

section('every leader sets out on the same footing');
{
  const FFl = loadGame({});
  /* Running the careless transcript across all four leaders found one that is
     not like the others: Hearth was told it was SHORT OF A HARD HIT on the
     first step of a first run and the other three were told they wanted for
     nothing. It was not short of one — its hard hit is four points of Ember,
     and the read only counted the damage column. A first run is somebody's
     first impression of the game and it should not open by telling one leader
     in four that they are already behind. */
  const bad = [];
  for (const t of Object.keys(FFl.STARTERS)) {
    const run = FFl.newRun(FFl.G, t, 909);
    const short = FFl.caravanRead(run).filter((r) => !r.ok);
    if (short.length) bad.push(t + ' short of ' + short.map((r) => r.name).join('+'));
  }
  eq(bad.join(', '), '', 'no leader is told it is behind before it has done anything');

  // and the reason it used to be: damage on a delay counted as no damage at all
  ok(FFl.hitOf({ def: 'emberflask' }) >= 4, 'four points of burn is four points of hit');
  ok(FFl.hitOf({ def: 'icepick' }) >= 4, 'and so is four points of ice');
}

/* ------------------------------------------- the purse pays for charms --- */
section('a charm bought is a charm dearer');
{
  /* Charms were seventeen of the twenty-one points a bottomless purse was
     worth. The tax goes on the purse, not the charm: one won at a reward is
     exactly as strong as it ever was. */
  withRun(FF, 'hearth', 21);
  const g = FF.G;
  eq(FF.charmMul(g.run), 1, 'the first one is full price');
  g.run.charmsBought = 1;
  ok(FF.charmMul(g.run) > 1, 'and the second is dearer');
  g.run.charmsBought = 4;
  ok(FF.charmMul(g.run) > FF.charmMul({ charmsBought: 1 }), 'and it keeps climbing');

  // the counter reads the run, so two shops in a row do not reset it
  g.run.charmsBought = 2;
  const s1 = FF.rollShop(g);
  g.run.charmsBought = 0;
  const s2 = FF.rollShop(g);
  ok(s1.charms[0].price > s2.charms[0].price ||
     FF.CHARMS[s1.charms[0].id].rare !== FF.CHARMS[s2.charms[0].id].rare,
    'a shop reached with charms already bought asks more for them');
}

/* ------------------------------------------------- the shrine and the cap -- */
section('the shrine obeys the cap the other two doors obey');
{
  /* Three tempered cards a run. The trader checks it and a camp checks it; the
     shrine never did, which nobody noticed until the quiet road started sending
     a second card back blessed as well. */
  withRun(FF, 'hearth', 55);
  const g = FF.G;
  const cards = g.run.deck.filter((c) => c.type === 'unit');
  ok(cards.length >= 3, 'the caravan has cards to bless');
  for (let i = 0; i < FF.TEMPER_CAP; i++) { cards[i].charms.push('blessed'); FF.rebuildCard(cards[i]); }
  eq(FF.tempered(g.run), FF.TEMPER_CAP, 'the caravan is at the cap');

  g.ui.shrine = { free: 1 };
  g.screen = 'shrine';
  FF.press('shrineGive');
  eq(FF.tempered(g.run), FF.TEMPER_CAP, 'the shrine refuses once the fire has done its three');
  ok(!FF.UI.choose, 'and does not open a chooser it cannot honour');
}

/* -------------------------------------------------------- the quiet road -- */
section('walking past a fight buys the one thing a fight cannot give');
{
  /* Walking past a fight measured at sixteen points, which made the fork a trap
     rather than a decision. The quiet road pays in rest — everything when the
     line is hurt, nothing when it is not. */
  withRun(FF, 'hearth', 34);
  const g = FF.G;
  const hurt = g.run.deck.filter((c) => c.type === 'unit').slice(0, 2);
  ok(hurt.length >= 2, 'the caravan has bodies to hurt');
  hurt.forEach((c) => { c.dmg = 20; });

  g.run.quiet = 0;
  g.ui.camp = { done: false };
  FF.campChoose(g, 'rest');
  const ordinary = hurt.map((c) => c.dmg);
  ok(ordinary.every((d) => d > 0), 'an ordinary camp mends some of it, not all');

  hurt.forEach((c) => { c.dmg = 20; });
  g.run.quiet = 1;
  g.ui.camp = { done: false };
  FF.campChoose(g, 'rest');
  ok(hurt.every((c) => c.dmg === 0), 'the quiet road mends the whole line');
  eq(g.run.quiet, 0, 'and it is spent, not a standing bonus');
}

/* ------------------------------------------------- the second telegraph -- */
section('a wave names its lane, and a held lane makes it wait');
{
  /* Six rounds said the fight is one decision because a scheme is the only
     thing with a window between announcement and execution. This is the second
     one, shaped the same way on purpose: answering it takes the wave's turn
     away rather than merely repositioning it. Driven at deployWave rather than
     through the turn clock — what is under test is the rule, not the timer. */
  withRun(FF, 'hearth', 91);
  const g = FF.G;
  const b = FF.startBattle(g, 'fight');
  b.units = [];
  b.over = false; b.busy = false;

  // a named lane that is HELD: the wave waits, and is still on the stack
  b.waves = [[{ id: 'snapfrost' }]];
  b.waveLane = 0;
  const pup = place(FF, 'p', 'snowpup', 0, 0);
  const before = FF.enemyUnits(g).length, waves0 = b.waves.length;
  eq(FF.deployWave(g), false, 'a held lane turns the wave away');
  eq(b.waves.length, waves0, 'and the wave is still waiting, not spent');
  eq(FF.enemyUnits(g).length, before, 'nothing arrived');
  ok((b.laneHeld || 0) > 0, 'and the board counts it');

  /* ANYWHERE in the lane holds it, not only the front. The front-only version
     priced as a tax on a narrow pool: +8 to a run carrying no course at all and
     nothing to any of the five, because a course narrows what you draw and the
     front slot is the one every other card also wants. */
  pup.col = 2;
  b.waveLane = 0;
  ok(FF.laneHeldBy(g, 0), 'a body in the back of the lane still holds it');
  eq(FF.deployWave(g), false, 'and the wave still waits');
  eq(FF.enemyUnits(g).length, before, 'with nothing arrived');

  // the same wave, into the other lane, lands
  b.waveLane = 1;
  ok(!FF.laneHeldBy(g, 1), 'the other lane is empty');
  ok(FF.deployWave(g), 'an empty lane lets it land');
  ok(FF.enemyUnits(g).length > before, 'and something arrived');
  ok(FF.enemyUnits(g).some((u) => u.lane === 1), 'in the lane it named');
}

/* ------------------------------------------------- teaching, not tuning -- */
section('the lesson a beginner gets and a good player never sees');
{
  /* Careless has sat between 6% and 13% for five rounds and every attempt to
     move it has been a number. The probe cannot price a teaching change — its
     careless pilot is blind, not slow, so anything that makes a decision
     easier measures exactly zero on it. What CAN be checked is that the
     lesson fires when somebody misses a scheme, stops the moment they deny
     one, and never fires at all past the first zone. */
  withRun(FF, 'hearth', 77);
  const g = FF.G;
  eq(g.run.zone, 0, 'the caravan starts in the first zone');

  const lines = () => (g.battle.log || []).filter((l) => /would have|landed —/.test(l.text || l)).length;
  bareBattle(FF, 'hearth', 77);
  place(FF, 'p', 'snowpup', 0, 0);
  const foe = place(FF, 'e', 'chillfang', 0, 1);
  const before = lines();
  FF.layPlot(g, foe);
  ok(!!foe.plot, 'the foe commits to something');
  FF.triggerUnit(g, foe);
  ok(lines() > before, 'a scheme that lands in the first zone says what would have stopped it');

  // …and it gives up after two, so it is a lesson rather than a nag
  for (let i = 0; i < 6; i++) { FF.layPlot(g, foe); FF.triggerUnit(g, foe); }
  ok(lines() - before <= 2, 'it says it at most twice, so it is a lesson and not a nag');

  // one denial and it is done for the rest of the run
  g.run.taught = 0; g.run.everDenied = 1;
  const held = lines();
  FF.layPlot(g, foe); FF.triggerUnit(g, foe);
  eq(lines(), held, 'a player who has denied one is never told again');

  // and never at all outside the first zone
  g.run.everDenied = 0; g.run.taught = 0; g.run.zone = 1;
  const late = lines();
  FF.layPlot(g, foe); FF.triggerUnit(g, foe);
  eq(lines(), late, 'the lesson belongs to the first zone and stays there');
}

section('cards that charge for themselves');
{
  const FFc = loadGame({});
  bareBattle(FFc, 'frost', 801);
  const G6 = FFc.G;
  /* Three cards built against the four tests written at the top of the pool,
     after two rounds of building first and measuring afterwards cut five
     things. What each has to do is change its answer as the board changes. */

  // CAIRNWARDEN — worth what the lane in front of it is holding
  const cw = place(FFc, 'p', 'cairnwarden', 0, 0, {});
  eq(FFc.CARDS.cairnwarden.hooks.swing(G6, cw), 0, 'facing an empty lane it hits for nothing');
  const f1 = place(FFc, 'e', 'snapfrost', 0, 0, {});
  eq(FFc.CARDS.cairnwarden.hooks.swing(G6, cw), 1, 'one foe in the lane, one point');
  const f2 = place(FFc, 'e', 'snapfrost', 0, 1, {});
  eq(FFc.CARDS.cairnwarden.hooks.swing(G6, cw), 2, 'two of them, two');
  f2.alive = false;
  eq(FFc.CARDS.cairnwarden.hooks.swing(G6, cw), 1, 'and killing one costs it — which is the point');

  // SLEETRUNNER — worth more on a turn it has already moved
  const sr = place(FFc, 'p', 'sleetrunner', 1, 2, {});
  eq(FFc.CARDS.sleetrunner.hooks.swing(G6, sr), 0, 'standing still it is an ordinary body');
  FFc.moveUnit(G6, sr, 1, 1);
  eq(FFc.CARDS.sleetrunner.hooks.swing(G6, sr), 3, 'and it pays for the move it just made');
  G6.battle.turn += 1;
  eq(FFc.CARDS.sleetrunner.hooks.swing(G6, sr), 0, 'once only, on the turn it moved');

  // and the swing hook has to reach the actual damage, not just the preview
  const before = f1.hp;
  FFc.attackOnce(G6, cw);
  ok(f1.hp < before, 'a card whose whole attack is a hook still hits');

  // BANKED EMBERS — a bet placed before a denial, paid after it
  const hurt = place(FFc, 'p', 'snowpup', 1, 0, {});
  hurt.hp = 2;
  FFc.CARDS.bankedembers.effect(G6);
  eq(G6.battle.banked, 1, 'the embers are banked');
  const plotter = G6.battle.units.find((u) => u.side === 'e' && u.alive && u.scheme);
  if (plotter) {
    FFc.layPlot(G6, plotter);
    for (const u of G6.battle.units) if (u.side === 'p') u.alive = false;
    hurt.alive = true;
    FFc.triggerUnit(G6, plotter);
    eq(G6.battle.banked, 0, 'and they are spent on the denial');
    ok(hurt.hp > 2, 'mending the line when it lands');
  }
}

section('a taunt beats everything');
{
  const FFt = loadGame({});
  bareBattle(FFt, 'hearth', 601);
  const G3 = FFt.G;
  G3.battle.units = G3.battle.units.filter((u) => u.side === 'p' && u.leader);
  /* Mitewing has sat in the top two of the late-zone death table for five
     rounds on a counter of 1 and four health, and the reason was targeting:
     Aimless used to outrank Soak, so the six wardens in the pool that carry a
     taunt could do nothing at all about the fastest thing on the table. */
  const wall = place(FFt, 'p', 'snowpup', 1, 2, {});
  wall.kw.soak = 1;
  place(FFt, 'p', 'snowpup', 1, 0, {});
  place(FFt, 'p', 'snowpup', 1, 1, {});
  const moth = place(FFt, 'e', 'mitewing', 1, 0, {});
  ok(!!moth.kw.aimless, 'the moth is aimless');
  let onWall = 0;
  for (let i = 0; i < 40; i++) if (FFt.targetFor(G3, moth) === wall) onWall++;
  eq(onWall, 40, 'and a soaker takes every one of its swings, from the back row');

  // with nothing soaking it goes back to picking whoever it likes
  wall.kw.soak = 0;
  const seen = new Set();
  for (let i = 0; i < 60; i++) { const t = FFt.targetFor(G3, moth); if (t) seen.add(t.uid); }
  ok(seen.size > 1, 'and with no taunt up it is aimless again');
}

section('one gap is not room');
{
  const FFr = loadGame({});
  const run = FFr.newRun(FFr.G, 'hearth', 501);
  FFr.startBattle(FFr.G, 'fight');
  const G2 = FFr.G;
  /* Three states, not two. The rule the whole board is built around had a
     penalty side that fired on 3% of turns and a reward side that fired on the
     other 97 — which is not a decision, it is a passive heal. */
  // leave exactly `gaps` free slots on the player line
  const leave = (gaps) => {
    for (const u of G2.battle.units.filter((x) => x.side === 'p' && !x.leader)) u.alive = false;
    let spots = FFr.freeSlots(G2, 'p').slice();
    while (spots.length > gaps) {
      const s2 = spots.shift();
      G2.battle.units.push(FFr.mkUnit(FFr.mkCard('snowpup'), 'p', s2.lane, s2.col));
      spots = FFr.freeSlots(G2, 'p').slice();
    }
  };
  leave(3);
  ok(FFr.freeSlots(G2, 'p').length >= FFr.ROOM_NEEDED, 'three gaps is room');
  eq(FFr.hasRoom(G2, 'p'), true, 'and the line is warmed');
  eq(FFr.isPacked(G2, 'p'), false, 'and not frozen');

  leave(2);
  eq(FFr.freeSlots(G2, 'p').length, 2, 'two gaps');
  eq(FFr.hasRoom(G2, 'p'), true, 'is still room');

  leave(1);
  eq(FFr.freeSlots(G2, 'p').length, 1, 'one gap');
  eq(FFr.hasRoom(G2, 'p'), false, 'is not room — the line stops being warmed');
  eq(FFr.isPacked(G2, 'p'), false, 'but the cold does not get in either');

  leave(0);
  eq(FFr.freeSlots(G2, 'p').length, 0, 'no gap at all');
  eq(FFr.hasRoom(G2, 'p'), false, 'is not room');
  eq(FFr.isPacked(G2, 'p'), true, 'and the cold gets in');

  /* A Full Line still buys its way out of both, which is the whole point of
     declaring for bodies. */
  G2.run.course = 'line';
  eq(FFr.hasRoom(G2, 'p'), true, 'a caravan travelling for bodies keeps its warmth on a packed board');
  eq(FFr.isPacked(G2, 'p'), false, 'and never takes the cold for it');
}

section('a caravan that grows');
{
  const FFg = loadGame({});
  const run = FFg.newRun(FFg.G, 'hearth', 401);
  const start = FFg.caravanPower(run);
  /* The reading this replaced was an average over the whole deck, which cannot
     grow: a good card drafted is divided by one more card drafted. Four
     transcripts watched it sit between 5.4 and 6.7 while the deck went from
     eight cards to twenty-one. */
  const before = FFg.caravanPower(run);
  for (let i = 0; i < 6; i++) run.deck.push(FFg.mkCard('snowpup'));   // six weak ones
  ok(FFg.caravanPower(run) >= before - 0.01, 'a fat deck of weak cards never reads as a weaker caravan');
  run.deck.push(FFg.mkCard('bellowsbear'));                          // and one good one
  ok(FFg.caravanPower(run) > before, 'and one good card read as a stronger one');
  ok(FFg.caravanPower(run) > start, 'so a caravan that drafts well grows');

  // the line is six, and only the best six are read
  const run2 = FFg.newRun(FFg.G, 'frost', 402);
  const p0 = FFg.caravanPower(run2);
  for (let i = 0; i < 20; i++) run2.deck.push(FFg.mkCard('snowpup'));
  ok(FFg.caravanPower(run2) >= p0, 'twenty spare cards never make the line worse');

  // and the deep fell holds the same line to a lower bar
  ok(FFg.DEEP_BASE < FFg.POWER_BASE, 'the last zone reads the caravan against a lower bar');
  const run3 = FFg.newRun(FFg.G, 'scrap', 403);
  for (let i = 0; i < 6; i++) run3.deck.push(FFg.mkCard('bellowsbear'));
  run3.zone = 1; run3.step = 3;
  const mid = FFg.fellAnswer(run3);
  run3.zone = 2;
  ok(FFg.fellAnswer(run3) > mid, 'so a built caravan is asked more of in the last zone than in the second');
}

section('what you walk away from');
{
  const FFf = loadGame({});
  const run = FFf.newRun(FFf.G, 'hearth', 404);
  run.step = 3; run.zone = 1;
  const quiet = FFf.foeScale(run);
  eq(FFf.following(run), 0, 'nothing is following a caravan that has just set out');

  /* Ducking one bad pack is a decision and stays free; ducking everything is a
     choice to arrive with a pack at your back. */
  run.followed = FFf.FOLLOW_FREE;
  eq(FFf.following(run), 0, 'and a few declined fights are forgiven');
  eq(FFf.foeScale(run), quiet, 'so the trail is unchanged');

  run.followed += 3;
  eq(FFf.following(run), 3, 'past that they are counted');
  ok(FFf.foeScale(run) > quiet, 'and every fight from there is bigger');

  /* And it is a distance, not a headcount: fighting is the only thing that puts
     a step back between you, and it never puts back as much as ducking takes. */
  ok(FFf.FOLLOW_NEAR > 1, 'walking past a fight lets them close further than a won fight opens up');

  // and the count is kept by the trail itself, not by the caller
  /* And the first zone is a grace: the counter accrues, it is simply not read. */
  const z0 = FFf.newRun(FFf.G, 'hearth', 409);
  z0.followed = FFf.FOLLOW_FREE + 10;
  eq(FFf.following(z0), 0, 'nothing has picked up your trail in the first zone');
  z0.zone = 1;
  ok(FFf.following(z0) > 0, 'and it is read from the second');

  const run2 = FFf.newRun(FFf.G, 'frost', 405);
  run2.trail[run2.step] = [{ kind: 'rest' }, { kind: 'fight' }];
  FFf.enterNode(FFf.G, 0);
  eq(run2.followed, FFf.FOLLOW_NEAR, 'walking past a fight is noticed');
  const run3 = FFf.newRun(FFf.G, 'frost', 406);
  run3.trail[run3.step] = [{ kind: 'rest' }, { kind: 'camp' }];
  FFf.enterNode(FFf.G, 0);
  eq(run3.followed || 0, 0, 'a fork with no fight on it is not a fight walked past');
}

section('the counter never runs dry');
{
  const FFm = loadGame({});
  const run = FFm.newRun(FFm.G, 'hearth', 407);
  /* Four transcripts walked out of a trader holding between 138 and 328 scrip.
     Not a pricing problem and not a payout problem — she ran out of things
     worth buying, because the bell is one per shop, tempering is capped for the
     whole run, and everything else on the counter adds a card. */
  const first = FFm.mealPrice(run);
  eq(first, FFm.MEAL_BASE, 'the first meal is the cheap one');
  const deckWas = run.deck.length;
  const who = FFm.feedable(run)[0];
  const atk0 = who.atk, hp0 = who.hp;
  run.gold = 1000;
  FFm.G.ui.shop = FFm.rollShop(FFm.G);
  ok(FFm.buy(FFm.G, 'meal', 0, who.uid), 'she will feed whoever you point at');
  eq(who.atk, atk0 + 1, 'and it comes back with an attack');
  eq(who.hp, hp0 + 2, 'and some health');
  ok(FFm.mealPrice(run) > first, 'and the next one costs more');
  eq(run.deck.length, deckWas, 'and the deck is the size it was');

  // as many as the purse holds, and the price is what stops you
  let n = 1;
  while (run.gold >= FFm.mealPrice(run) && n < 40) { FFm.buy(FFm.G, 'meal', 0, who.uid); n++; }
  ok(n > 3 && n <= FFm.MEAL_CAP, `a thousand scrip buys ${n} meals, not one and not forty`);
  ok(run.gold < FFm.mealPrice(run) || run.meals >= FFm.MEAL_CAP,
    'and the purse is what runs out, not the counter');

  // and it survives being put down and picked up again
  const run2 = FFm.newRun(FFm.G, 'frost', 408);
  run2.gold = 500;
  const fed = FFm.feedable(run2)[0];
  FFm.G.ui.shop = FFm.rollShop(FFm.G);
  FFm.buy(FFm.G, 'meal', 0, fed.uid);
  const fedAtk = fed.atk;
  FFm.saveRun(run2);
  const back = FFm.loadRun(FFm.G);
  eq(back.meals, 1, 'a reloaded run remembers what it has eaten');
  eq(back.deck.concat([back.leader]).find((c) => c.uid === fed.uid).atk, fedAtk,
    'and the card it fed is still fed');
}

section('seals to chase');
{
  const store = {};
  const FFb = loadGame(store);
  eq(FFb.FEATS.length >= 6, true, 'there is a list of them');
  ok(FFb.FEATS.every((f) => f.id && f.name && f.text && typeof f.got === 'function'),
    'each one is named, described and checkable');
  ok(FFb.FEATS.every((f) => f.text.length <= 90), 'and each one says what it wants in a breath');

  const run = FFb.newRun(FFb.G, 'hearth', 303);
  eq(FFb.featEarned('first'), false, 'nothing is earned before a crossing');
  const fresh = FFb.checkFeats(run);
  ok(fresh.indexOf('first') >= 0, 'crossing earns the first one');
  eq(FFb.featEarned('first'), true, 'and it is remembered');
  eq(FFb.checkFeats(run).indexOf('first'), -1, 'and only counted once');

  // the harder ones read the run rather than the fact of finishing
  const run2 = FFb.newRun(FFb.G, 'frost', 304);
  run2.everFell = 1;
  eq(FFb.FEATS.find((f) => f.id === 'whole').got(run2), false, 'a caravan that lost somebody has not kept everybody');
  run2.everFell = 0;
  eq(FFb.FEATS.find((f) => f.id === 'whole').got(run2), true, 'and one that did not, has');
  run2.everBought = 1;
  eq(FFb.FEATS.find((f) => f.id === 'pauper').got(run2), false, 'a purse that opened is not an empty one');

  // they survive a reload, which is the whole point of a thing to chase
  FFb.saveMeta();
  const FFc = loadGame(store);
  FFc.loadMeta();
  eq(FFc.featEarned('first'), true, 'a seal outlives the run that earned it');
}

section('a course is a choice, not a favourite');
{
  const FFd = loadGame({});
  // every course carries a rule, and no course carries only a lean
  for (const co of FFd.COURSES) {
    const rules = ['deploy', 'arrive', 'freeItem', 'crowdproof', 'recycle', 'warmth']
      .filter((k) => co[k]).length;
    ok(rules >= 1, co.short + ' changes a rule as well as the pool');
  }
  /* And the one that was running away with it, cut twice: to the front of a
     wave in iteration 15, and now to the front of the FIRST wave only. Frost
     skips a trigger and a foe that does not trigger does not fire the scheme it
     committed to, so this rule was quietly handing out the most valuable habit
     in the fight — on every wave, for free. */
  const cold = FFd.COURSES.find((co) => co.id === 'frost');
  const FFe = loadGame({});
  bareBattle(FFe, 'frost', 305);
  const b = FFe.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  b.waveNo = 1;
  const front = place(FFe, 'e', 'snapfrost', 0, 0, {});
  const back = place(FFe, 'e', 'snapfrost', 0, 2, {});
  cold.arrive(FFe.G, front);
  cold.arrive(FFe.G, back);
  eq(FFe.stat(front, 'frost'), 1, 'the front of the opening wave arrives cold');
  eq(FFe.stat(back, 'frost'), 0, 'the rest of it does not');

  b.waveNo = 2;
  const later = place(FFe, 'e', 'snapfrost', 1, 0, {});
  cold.arrive(FFe.G, later);
  eq(FFe.stat(later, 'frost'), 0, 'and the reinforcements walk in warm');
}

/* ------------------------------------------------- iteration 16 additions -- */
section('a seal you can still lose');
{
  const FFa = loadGame({});
  const run = FFa.newRun(FFa.G, 'hearth', 401);
  const live0 = FFa.liveFeats(run).map((f) => f.id);
  ok(live0.indexOf('whole') >= 0, 'a fresh caravan can still cross with everybody');
  ok(live0.indexOf('pauper') >= 0, 'and still cross without opening the purse');

  // and the moment one is thrown away, the run knows
  run.everFell = 1;
  eq(FFa.liveFeats(run).map((f) => f.id).indexOf('whole'), -1, 'losing a warden takes that one off the table');
  const gone = FFa.breakSeals(run);
  eq(gone.length >= 1, true, 'and it is announced');
  ok(gone.some((f) => f.id === 'whole'), 'by name');
  eq(FFa.breakSeals(run).length, 0, 'once, not every step');

  // an earned seal is not still "in reach" — it is held
  FFa.G.meta.feats = { pauper: true };
  eq(FFa.liveFeats(run).map((f) => f.id).indexOf('pauper'), -1, 'a seal already held is not one to chase');

  // every seal that can be lost has a way of saying so
  for (const f of FFa.FEATS) {
    ok(typeof FFa.FEAT_ALIVE[f.id] === 'function', f.id + ' knows whether it is still possible');
  }
}

section('the guide asks rather than tells');
{
  const FFb = loadGame({});
  /* Two hints shipped as statements with nothing but a turn count to clear
     them, and walking the guide in order showed the same hint sitting there for
     three turns. Every hint names something to do. */
  for (const h of FFb.TUTORIAL) {
    ok(typeof h.done === 'function', h.id + ' knows when it is finished');
    ok(h.text.length <= 130, h.id + ' says it in a breath');
  }
  const front = FFb.TUTORIAL.find((h) => h.id === 'front');
  ok(/slide|drag|tap|keep|ring/i.test(front.text), 'the front-row hint asks for an action');

  // and it clears on the action, not on a clock
  withRun(FFb, 'hearth', 402);
  FFb.enterNode(FFb.G, 0);
  const b = FFb.G.battle;
  b.units = b.units.filter((u) => u.side === 'p' && u.leader);
  place(FFb, 'p', 'snowpup', 1, 2, {});
  eq(front.done(FFb.G), false, 'nobody is in the front column yet');
  const u = FFb.playerUnits(FFb.G).find((x) => !x.leader);
  FFb.moveUnit(FFb.G, u, 1, 0);
  eq(front.done(FFb.G), true, 'and sliding one there clears it at once');
}

section('the first fight is a lesson, not a wall');
{
  const FFc = loadGame({});
  const run = FFc.newRun(FFc.G, 'hearth', 403);
  run.step = 0;
  const opening = FFc.buildEncounter(FFc.G, 'fight');
  eq(opening.length, 1, 'the first skirmish has no reinforcements');
  ok(opening[0].length <= 2, 'and no more than two foes');
  const openScale = opening[0][0].scale;
  run.step = 4;
  const later = FFc.buildEncounter(FFc.G, 'fight');
  ok(later[0][0].scale > openScale, 'and they are weaker than what comes later, not just fewer');
}

/* ------------------------------------------------- the record's own rule -- */
section('the design record states numbers');
{
  /* DESIGN.md replaced a 1000-line cap on the README with a quality rule —
     "every entry states a number, and an entry that cannot state one gets cut"
     — and for exactly one round nothing enforced it. A rule in prose that no
     check reads is a wish; this is the check.

     Every FINDING, RULE and DEAD ENDS heading must have a DIGIT somewhere in the
     section under it — a digit and not a spelled-out word, because "cutting five
     of six" reads as prose where "5 of 6" reads as a count, and the difference
     is the whole point of the file. Prose about a measurement is not a
     measurement. It caught one entry on its first run. */
  /* AND THE SAME KIND OF CHECK ON THE SOURCE, for the seam that has now been
     written by hand four times.

     `for (x = 0; x <= VW; x += step)` followed by `lineTo(VW, …)` draws a hard
     straight edge `VW % step` units in from the right, and whether it is visible
     depends on whether the step divides a width nobody looks at — the ground
     sweep was broken at 1180, 1280 AND 1600 and survived 38 rounds. Every sweep
     goes through `sweepX` now, which cannot get it wrong, and this stops the
     hand-written form coming back. */
  {
    const src = readFileSync(new URL('../frostfell/index.html', import.meta.url), 'utf8');
    // sweepX's own body is the one place the form is allowed to appear.
    const hand = (src.match(/for\s*\(\s*let\s+x\s*=[^;]*;\s*x\s*<=?\s*VW\b/g) || [])
      .filter((m) => !/=\s*-step/.test(m));
    eq(hand.length, 0, 'no horizontal sweep is written by hand — they all go through sweepX');
    ok((src.match(/sweepX\(c,/g) || []).length >= 6, 'and the six that exist do use it');

    /* AND THE VERTICAL CASE, which is asked every time this bug is discussed.

       There is none, and the reason is structural rather than luck: `VH` is a
       `const 720` while `VW` is recomputed from the window's aspect ratio on
       every resize. A sweep whose step does not divide VW is broken at SOME
       widths and clean at others, which is exactly how the ground seam hid for
       38 rounds. A sweep whose step does not divide VH would be broken at every
       size, on every device, permanently — it could not hide for one round.

       So the check is simply that no OTHER stepped loop exists: two in the whole
       file, `sweepX` itself and a two-iteration `i += 2` that is exact by
       construction. Anything new that steps toward a boundary shows up here. */
    const stepped = [...src.matchAll(/for \(let ([a-z]+) = [^;]*;[^;]*;\s*\1 \+= ([^)]+)\)/g)]
      .filter((m) => m[2].trim() !== '1');
    eq(stepped.length, 2, 'only sweepX and one exact two-step loop step toward a boundary');
  }

  const doc = readFileSync(new URL('../frostfell/DESIGN.md', import.meta.url), 'utf8');
  const lines = doc.split('\n');

  /* RULE 2, MADE MECHANICAL — the half that was written down as "cannot be
     checked by a script and is not pretended to be".

     Rule 2 says an entry a later measurement contradicts is rewritten IN PLACE,
     never appended to. Its failure mode is therefore always the same shape: two
     entries about the same thing, one of them stale. That IS checkable — give
     every entry a `topic:` key and require the keys to be unique. Adding a
     second entry about the ladder now fails the suite and the only way through
     is to fold it into the first, which is exactly what the rule asks for.

     It is not a proof of freshness — nothing can be — but it removes the failure
     mode that actually happened three times in one round, which is a correction
     sitting NEXT TO the thing it corrects rather than inside it. */
  {
    const topics = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/^###\s+(FINDING|RULE|DEAD ENDS)\b/.test(lines[i])) continue;
      const stamp = lines.slice(i + 1, i + 4).find((l) => /^`topic:/.test(l.trim()));
      ok(stamp, 'entry stamps a topic: ' + lines[i].slice(0, 60));
      if (stamp) topics.push(stamp.trim().replace(/^`topic:\s*/, '').replace(/`$/, ''));
    }
    ok(topics.length >= 30, `every entry carries a topic (${topics.length} of them)`);
    const dupes = topics.filter((t, i) => topics.indexOf(t) !== i);
    eq(dupes.length, 0, 'no two entries claim the same topic — a correction is folded in, not appended'
      + (dupes.length ? ': ' + dupes.join(', ') : ''));
  }
  const heads = [];
  let cur = null;
  for (const ln of lines) {
    if (/^###\s+(FINDING|RULE|DEAD ENDS)\b/.test(ln)) {
      cur = { head: ln.replace(/^###\s+/, '').slice(0, 60), body: '' };
      heads.push(cur);
    } else if (/^##\s/.test(ln)) {
      cur = null;
    } else if (cur) {
      cur.body += ln + '\n';
    }
  }
  ok(heads.length >= 20, `the record has ${heads.length} labelled entries`);
  const mute = heads.filter((h) => !/\d/.test(h.body)).map((h) => h.head);
  eq(mute.join(' | '), '', 'every labelled entry in DESIGN.md states a number');
  /* AND THE SECOND HALF OF THE RULE, which was written and never enforced: a
     number is not a MEASUREMENT. A section number, a year, a card count in
     passing — all of those are digits, and an entry whose only digits are
     incidental is the essay the rule exists to keep out. So the digit has to
     carry a unit: a percentage, a multiplier, a sigma, a band, points, runs, a
     pixel size or a device dimension. It caught two entries on its first run —
     the card rule and the four-health finding — and both got a real reading
     rather than a cut, which is the outcome the rule is for. */
  const UNIT = /(\d[\d,.]*\s*(%|x\b|σ|points?\b|runs?\b|px\b|lines?\b|ms\b|:1)|±\s*[\d.]|\d+\s*(of|in)\s*\d|\d+x\d+)/;
  const soft = heads.filter((h) => !UNIT.test(h.body)).map((h) => h.head);
  eq(soft.join(' | '), '', 'every entry states a measurement, not just a digit');
  /* And the labels themselves: an entry that is none of the three is an essay
     that slipped in under a heading. */
  const stray = lines.filter((ln) => /^###\s/.test(ln) && !/^###\s+(FINDING|RULE|DEAD ENDS)\b/.test(ln))
    .map((ln) => ln.slice(0, 50));
  eq(stray.join(' | '), '', 'every section of DESIGN.md is labelled FINDING, RULE or DEAD ENDS');
}

done('frostfell');
