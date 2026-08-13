// FROSTFELL — the render suite.
//
// A canvas game has a whole second failure surface: a draw call that throws on
// a state the rules suite never looks at, and a hit region that never lines up
// with what the player can see. Nothing here checks pixels — it checks that
// every screen draws, that every art recipe in the game survives being drawn,
// and that the things you are meant to be able to touch are touchable.
//
// Run: node tests/frostfell_render.test.mjs
import { loadGame, mkCtx, withRun, place, bareBattle, dummy, ok, eq, done, section } from './frostfell_lib.mjs';

const log = [];
const FF = loadGame({}, log);
const G = FF.G;
FF.setCtx(mkCtx(log));

const frame = (n = 1) => { for (let i = 0; i < n; i++) { FF.update(1 / 60); FF.render(); } };
const drew = (label) => { ok(log.length > 0, label); log.length = 0; };

/* ---------------------------------------------------------- every screen -- */
section('every screen draws');
{
  G.screen = 'title';
  frame(3); drew('the title draws');

  withRun(FF, 'hearth', 2024);
  G.screen = 'trail';
  frame(3); drew('the trail draws');

  FF.enterNode(G, 0);
  eq(G.screen, 'battle', 'the first node opens a fight');
  frame(30); drew('a battle draws');

  // mid-resolution: the busiest frame in the game
  FF.passTurn(G);
  frame(10); drew('a turn resolving draws');

  G.ui.reward = FF.rollReward(G, 'boss');
  G.screen = 'reward';
  frame(2); drew('the reward screen draws, charms and all');

  G.ui.shop = FF.rollShop(G);
  G.screen = 'shop';
  frame(2); drew('the shop draws');
  ok(FF.hits().some((h) => h.id === 'buySigil'), 'and sells a sigil');

  G.ui.event = { def: FF.EVENTS[0] };
  G.screen = 'event';
  frame(2); drew('an event draws');
  ok(FF.hits().filter((h) => h.id === 'eventOpt').length >= 2, 'with its choices touchable');

  G.screen = 'camp';
  frame(2); drew('camp draws');

  // a warden wearing charms and standing under a banner: the busiest unit
  withRun(FF, 'scrap', 9);
  FF.attachCharm(G.run.deck[0], FF.CHARMS.keencharm);
  FF.attachCharm(G.run.deck[0], FF.CHARMS.shellcharm);
  G.run.deck[0].sigil = true;
  FF.startBattle(G, 'boss');
  frame(8); drew('a boss opening — banner, sigil-deployed warden, charms and all');

  G.screen = 'gameover';
  frame(2); drew('the loss screen draws');
  G.screen = 'victory';
  frame(2); drew('the win screen draws');
}

/* -------------------------------------------------------------- overlays -- */
section('overlays');
{
  withRun(FF, 'frost', 77);
  G.screen = 'trail';
  FF.UI.deck = true;
  frame(2); drew('the deck view draws');
  FF.UI.inspect = G.run.deck[0];
  frame(2); drew('an inspected card draws');
  FF.UI.inspect = null;
  FF.UI.deck = false;

  FF.press('campCharm');
  ok(!!FF.UI.choose, 'a chooser opens');
  frame(2); drew('the chooser draws');
  FF.UI.choose = null;
}

/* ------------------------------------------------------------ the whole cast */
section('every art recipe survives being drawn');
{
  const ctx = mkCtx(null);
  let thrown = null;
  const all = Object.values(FF.CARDS).concat(Object.values(FF.FOES));
  for (const c of all) {
    if (c.type !== 'unit') continue;
    try { FF.drawCreature(ctx, c.art, 100, 100, 90, { t: 1.3, ph: 2, sq: 0.4, blink: 0.5, flip: true }); }
    catch (e) { thrown = c.id + ': ' + e.message; break; }
  }
  eq(thrown, null, 'every creature in the game draws without throwing');

  // and every trimming, in combination, not just the ones the roster happens to use
  const shapes = ['blob', 'round', 'tall', 'squat', 'small', 'wisp', 'boss'];
  const ears = ['round', 'pointy', 'horns', 'antler', 'antenna', 'shard', 'fin', 'none'];
  const mouths = ['smile', 'grin', 'flat', 'fang', 'wide', 'trap', 'beak', 'bolt', 'beard', 'none'];
  const accs = ['none', 'scarf', 'helm', 'crown', 'lantern', 'kettle', 'gear', 'hammer', 'pike', 'staff', 'cloak'];
  const pats = ['none', 'spots', 'stripes', 'tips', 'shards'];
  const eyes = ['dot', 'big', 'slit'];
  let combos = 0;
  thrown = null;
  outer:
  for (const shape of shapes) for (const e of ears) for (const m of mouths) {
    const acc = accs[combos % accs.length], pat = pats[combos % pats.length], ey = eyes[combos % eyes.length];
    combos++;
    try {
      FF.drawCreature(ctx, { body: '#fff', belly: '#eee', shape, ears: e, mouth: m, acc, pat, eyes: ey,
        patCol: '#123', accCol: '#456', wings: combos % 3 ? null : '#789', evil: combos % 2 },
        60, 60, 70, { t: combos * 0.13 });
    } catch (err) { thrown = [shape, e, m, acc].join('/') + ': ' + err.message; break outer; }
  }
  eq(thrown, null, `all ${combos} recipe combinations draw`);

  for (const c of Object.values(FF.CARDS)) {
    if (c.type !== 'item') continue;
    try { FF.drawItemIcon(ctx, c.art, 50, 50, 40, 0.7); }
    catch (e) { thrown = c.id + ': ' + e.message; break; }
  }
  eq(thrown, null, 'every piece of gear draws its icon');
}

/* --------------------------------------------------------- hit regions --- */
section('what you can see is what you can touch');
{
  withRun(FF, 'hearth', 5);
  FF.enterNode(G, 0);
  frame(2);
  const hits = FF.hits();
  ok(hits.some((h) => h.id === 'hand'), 'the hand is touchable');
  ok(hits.some((h) => h.id === 'bell'), 'the bell is touchable');
  ok(hits.some((h) => h.id === 'slot'), 'empty slots are drop targets');
  ok(hits.some((h) => h.id === 'unit'), 'units are touchable');
  for (const h of hits) {
    ok(h.x >= -40 && h.y >= -40 && h.x + h.w <= FF.VW + 40 && h.y + h.h <= FF.VH + 40,
      'hit region ' + h.id + ' sits on the screen');
  }

  // a card dragged from hand onto a slot puts a warden there
  const handHit = hits.filter((h) => h.id === 'hand');
  const unitCardIdx = G.battle.hand.findIndex((c) => c.type === 'unit');
  if (unitCardIdx >= 0) {
    const src = handHit.find((h) => h.data === unitCardIdx);
    const slot = FF.hits().find((h) => h.id === 'slot');
    const before = FF.playerUnits(G).length;
    FF.onDown(src.x + 10, src.y + 10);
    FF.onMove(slot.x + 40, slot.y + 40);
    FF.onUp(slot.x + 40, slot.y + 40);
    eq(FF.playerUnits(G).length, before + 1, 'dragging a warden from hand to a slot deploys it');
  }

  // a tap without a drag inspects instead of playing
  frame(1);
  const h2 = FF.hits().find((h) => h.id === 'hand');
  if (h2) {
    FF.onDown(h2.x + 10, h2.y + 10);
    FF.onUp(h2.x + 11, h2.y + 11);
    ok(!!FF.UI.inspect, 'a tap opens the card instead of playing it');
    FF.UI.inspect = null;
  }
}

/* -------------------------------------------------------- long animation -- */
section('the loop stays upright');
{
  withRun(FF, 'scrap', 31);
  FF.enterNode(G, 0);
  let thrown = null;
  try {
    for (let i = 0; i < 400; i++) {
      if (G.screen === 'battle' && !G.battle.busy && !G.battle.over) FF.passTurn(G);
      frame(2);
      if (G.screen !== 'battle') break;
    }
  } catch (e) { thrown = e.message; }
  eq(thrown, null, 'four hundred frames of a fight resolving itself never throw');
  ok(G.screen !== 'battle' || G.battle.turn > 6, 'and the turns actually turn while it draws');

  // The same fight without the animation budget: a player who does nothing at
  // all must still reach an ending rather than sitting in a stalled board.
  withRun(FF, 'hearth', 31);
  FF.enterNode(G, 0);
  let turns = 0;
  while (G.screen === 'battle' && !G.battle.over && turns++ < 300) { FF.passTurn(G); FF.drainAll(); }
  ok(G.battle.over, 'a fight nobody plays does eventually end');
  eq(G.battle.won, false, 'badly');
}

done('frostfell-render');
