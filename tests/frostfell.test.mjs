// FROSTFELL — the rules suite.
//
// Everything here drives the real engine through window.FF. If a check in this
// file passes, the thing it names is true of the game a player loads, not of a
// model of it.
//
// Run: node tests/frostfell.test.mjs
import { loadGame, withRun, place, bareBattle, dummy, ok, eq, done, section } from './frostfell_lib.mjs';

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

  // ember and regen bite at the end of the turn and halve
  const e2 = place(FF, 'e', 'snapfrost', 1, 0, { unit: { hp: 30, atk: 0, cnt: 9 } });
  FF.addStatus(G, e2, 'ember', 4);
  FF.resolveTurn(G);
  eq(e2.hp, 26, 'ember burns for its value at the end of the turn');
  eq(FF.stat(e2, 'ember'), 2, 'then halves');

  const h = place(FF, 'p', 'snowpup', 1, 1, { unit: { hp: 2, maxHp: 9, cnt: 9 } });
  FF.addStatus(G, h, 'regen', 3);
  FF.resolveTurn(G);
  eq(h.hp, 5, 'regen mends at the end of the turn');
  eq(FF.stat(h, 'regen'), 1, 'and halves too');
}

/* ------------------------------------------------------------- the clock -- */
section('counters and the turn');
{
  bareBattle(FF);
  const b = G.battle;
  b.units = b.units.filter((u) => u.leader);
  const a = place(FF, 'p', 'snowpup', 0, 0, { unit: { cnt: 3, cntMax: 3, atk: 3 } });
  const t = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 50, atk: 0, cnt: 9 } });

  FF.resolveTurn(G);
  eq(a.cnt, 2, 'a turn takes one off the counter');
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
  eq(foe.hp, 26, 'Icepick bites for four');
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

done('frostfell');
