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
  const keep = FF.mkCard('keepsake');
  b3.hand = [keep];
  eq(keep.held || 0, 0, 'a fresh card has waited for nothing');
  FF.passTurn(G); FF.drainAll();
  FF.passTurn(G); FF.drainAll();
  eq(keep.held, 2, 'two turns in hand is two points');
  for (let i = 0; i < 9; i++) { FF.passTurn(G); FF.drainAll(); }
  eq(keep.held, FF.HOARD_CAP, 'and it stops climbing at the cap');
  const before = FF.CARDS.keepsake.atk;
  const u = FF.mkUnit(keep, 'p', 1, 1);
  eq(u.atk, before + FF.HOARD_CAP, 'what it hoarded is on the board with it');
  b3.hand = [keep];
  FF.playCard(G, 0, { lane: 1, col: 1 });
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
  eq(victim.hp, 34, 'Old Grudge remembers exactly how long it waited');
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
  eq(one.hp, 57, 'one foe in the lane takes three');

  bareBattle(FF);
  const b4 = G.battle;
  b4.units = b4.units.filter((u) => u.leader);
  dummy(FF);
  const x1 = place(FF, 'e', 'snapfrost', 0, 0, { unit: { hp: 60, atk: 0 } });
  const x2 = place(FF, 'e', 'snapfrost', 0, 1, { unit: { hp: 60, atk: 0 } });
  b4.hand = [FF.mkCard('avalanche')];
  FF.playCard(G, 0, x1);
  eq(x1.hp, 55, 'two in the lane and it lands for five');
  eq(x2.hp, 55, 'on both of them');
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
  for (const c of Object.values(FF2.CARDS)) if (ids.indexOf(c.id) < 0) missing.push(c.id);
  for (const id of Object.keys(FF2.CHARMS)) if (ids.indexOf(id) < 0) missing.push(id);
  eq(missing.join(','), '', 'every card and charm in the game has a place in the collection');
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

  // the preview and the effect must agree, or the prediction is a lie
  const pick2 = FF.mkCard('icepick');
  const pre = FF.previewOf(G, pick2, t1);
  eq(pre.length, 1, 'an icepick preview names one target');
  const before = t1.hp;
  b.hand = [pick2];
  FF.playCard(G, 0, t1);
  eq(before - t1.hp, pre[0].dmg, 'and the number it promised is the number it dealt');

  const av = FF.mkCard('avalanche');
  const pre2 = FF.previewOf(G, av, t1);
  eq(pre2.length, 2, 'an avalanche preview covers the whole lane');
  const h1 = t1.hp, h2 = t2.hp;
  b.hand = [av];
  FF.playCard(G, 0, t1);
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

done('frostfell');
