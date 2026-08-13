// FROSTFELL — teaching, the rulebook, and the score.
//
// The hints are the only part of the game that watches the player rather than
// the other way round, so they get their own suite: every hint must be
// reachable, every hint must clear on the action it names, and the whole
// sequence must be escapable in one tap and never come back.
//
// Run: node tests/frostfell_tutorial.test.mjs
import { loadGame, mkCtx, withRun, place, ok, eq, done, section } from './frostfell_lib.mjs';

/* --------------------------------------------------------------- hints --- */
section('the hints');
{
  const store = {};
  const FF = loadGame(store);
  const G = FF.G;
  FF.setCtx(mkCtx(null));

  eq(!!G.meta.taught, false, 'a fresh install has not been taught anything');
  withRun(FF, 'hearth', 4242);
  ok(!!G.tut, 'a first run comes with a guide');
  eq(G.tut.i, 0, 'starting at the first hint');

  const idOf = () => (FF.TUTORIAL[G.tut.i] || {}).id;
  // a settle outlasts a hint's dwell; a tick is just long enough for a hint
  // whose dwell is already spent to notice that its action has happened
  const settle = (n = 68) => { for (let i = 0; i < n; i++) FF.update(1 / 30); };
  const tick = (n = 3) => { for (let i = 0; i < n; i++) FF.update(1 / 30); };

  FF.enterNode(G, 0);
  settle();
  eq(idOf(), 'deploy', 'the first thing it asks for is a warden on the board');

  // deploying clears it
  G.battle.hand = [FF.mkCard('snowpup')].concat(G.battle.hand);
  FF.playCard(G, 0, { lane: 1, col: 0 });
  tick();
  eq(idOf(), 'counter', 'putting one down moves it on to the counter');

  // that same play spent the turn, so the counter hint is already satisfied —
  // it must still stay up long enough to read
  tick(20);
  eq(idOf(), 'counter', 'and a satisfied hint is not yanked away half-read');
  settle();
  eq(idOf(), 'action', 'it clears once it has had its moment');

  // the order toggle
  /* Play on until the order hint comes up. This used to pass a turn only while
     the 'action' hint was showing, which quietly assumed no later hint would
     ever want the clock to move — the moment one did, the harness span for
     ever. A player takes turns the whole way through; so does this. */
  /* Play on until the order hint comes up — through the end of a fight if it
     takes that long. The opening skirmish is deliberately gentle now, so a
     guided player can finish it before the guide finishes them; the guide
     carries into the next fight, and so does this. */
  const nextFight = () => {
    for (let k = 0; k < 8 && G.screen !== 'battle'; k++) {
      if (G.screen === 'reward') FF.press('rewardSkip');
      else if (G.screen === 'trail') FF.enterNode(G, 0);
      else if (G.screen === 'shop') FF.press('leaveShop');
      else if (G.screen === 'camp') FF.press('campRest');
      else FF.advance(G);
      FF.drainAll();
      while (FF.UI.choose) { FF.UI.choose.onPick(0); FF.UI.choose = null; }
    }
  };
  let guard = 0;
  while (idOf() && idOf() !== 'order' && G.tut.i < FF.TUTORIAL.length && guard++ < 80) {
    if (G.screen !== 'battle' || G.battle.over) { nextFight(); settle(); continue; }
    // do what the hint asks, then play on — which is what a player does
    if (idOf() === 'front') {
      const u = FF.playerUnits(G).find((x) => !x.leader && x.col > 0);
      if (u && FF.slotFree(G, 'p', u.lane, 0)) FF.moveUnit(G, u, u.lane, 0);
    }
    FF.passTurn(G); FF.drainAll();
    settle();
  }
  ok(guard < 80, 'the guide reaches the order hint by playing the fight');
  eq(idOf(), 'order', 'then it points at the resolution order');
  settle();
  FF.UI.order = true;
  tick();
  eq(idOf(), 'inspect', 'looking at the order moves it on');

  settle();
  FF.UI.inspect = G.run.deck[0];
  tick();
  eq(idOf(), 'bell', 'tapping something to read it moves it on again');
  FF.UI.inspect = null;

  settle();
  FF.ringBell(G); FF.drainAll();
  /* A settle rather than a tick: ringing the bell throws the hand away and
     deals a fresh one, and the frames that animation eats are frames the guide
     does not step in. Three of them used to be enough by luck. */
  settle();
  ok(idOf() === 'wave' || G.tut.over, 'ringing the bell reaches the last hint');

  // the opening skirmish has no waves, so that hint must skip rather than stick
  if (!G.battle.waves.length) {
    settle();
    eq(G.tut.over, true, 'a hint that does not apply to this fight is skipped, not stuck');
    eq(G.meta.taught, true, 'and finishing is remembered');
    ok(!!store.ff_meta_v1, 'in the save, not just in memory');
  }

  // a second run is not taught again
  withRun(FF, 'frost', 7);
  eq(G.tut, null, 'a taught player is left alone');
}

/* ---------------------------------------------------------------- skip --- */
section('skipping');
{
  const store = {};
  const FF = loadGame(store);
  const G = FF.G;
  FF.setCtx(mkCtx(null));
  withRun(FF, 'frost', 11);
  FF.enterNode(G, 0);
  ok(!!G.tut && !G.tut.over, 'the guide is running');
  FF.press('tutSkip');
  eq(G.tut.over, true, 'one tap ends it');
  eq(G.meta.taught, true, 'permanently');

  const FF2 = loadGame(store);
  FF2.loadMeta();
  eq(FF2.G.meta.taught, true, 'and it survives a reload');
}

/* ------------------------------------------------------------ every hint -- */
section('the hints are all reachable');
{
  const FF = loadGame({});
  let bad = [];
  for (const h of FF.TUTORIAL) {
    if (!h.id || !h.text) bad.push(h.id || '(nameless)');
    if (typeof h.done !== 'function') bad.push(h.id + ':done');
    if (h.text && h.text.length > 130) bad.push(h.id + ':too wordy');
  }
  eq(bad.join(','), '', 'every hint is named, short, and knows when it is finished');
  ok(FF.TUTORIAL.length >= 5, 'and there are enough of them to cover the game');

  /* AND THE TWO THAT PAY MOST ARE AMONG THEM.

     The fight ablation has priced every habit a pilot can have for six rounds.
     The two that survive every round are keeping a slot in reserve and denying
     schemes — and for the first nineteen of those rounds the guide taught the
     first and had not one word about the second. A hint list that omits the
     most valuable thing in the game is not a guide, it is a tour. */
  const ids = FF.TUTORIAL.map((h) => h.id);
  ok(ids.indexOf('room') >= 0, 'the guide teaches keeping a slot in reserve');
  ok(ids.indexOf('scheme') >= 0, 'and denying a scheme');

  /* And the opening has to CONTAIN the thing the hint points at. Sampled across
     forty openings it used to contain a schemer in seventeen, so most new
     players met the rule for the first time in the second zone, having lost to
     it once already. */
  let withPlot = 0;
  for (let s = 0; s < 24; s++) {
    FF.newRun(FF.G, s % 2 ? 'frost' : 'hearth', 700 + s);
    FF.startBattle(FF.G, 'fight');
    if (FF.G.battle.units.some((u) => u.side === 'e' && u.scheme)) withPlot++;
  }
  eq(withPlot, 24, 'and every opening fight has something with a plan in it');
}

section('the guide teaches denial by making it happen');
{
  const FF = loadGame({});
  const G = FF.G;
  FF.newRun(G, 'hearth', 909);
  FF.startBattle(G, 'fight');
  const plotter = G.battle.units.find((u) => u.side === 'e' && u.scheme);
  ok(!!plotter, 'the opening has a schemer');
  FF.layPlot(G, plotter);
  ok(!!plotter.plot, 'and it puts its plan on the table a turn out');
  eq(G.battle.denied || 0, 0, 'nothing denied yet');

  /* Take away what the plan needed and the whole trigger is wasted — which is
     the thing the hint claims, checked against the rules rather than the text.
     Every scheme in the game lays against the board as it stood a turn ago and
     fires against the board as it stands now, so emptying the player's side is
     a denial whichever scheme this opening happened to roll. */
  for (const u of G.battle.units) if (u.side === 'p') u.alive = false;
  FF.triggerUnit(G, plotter);
  ok((G.battle.denied || 0) >= 1, 'a plan that no longer has what it needed is denied');
  eq(plotter.plot, null, 'and the plan is spent either way');
}

section('the hint about red text waits until there is red text');
{
  const FF = loadGame({});
  const G = FF.G;
  FF.setCtx(mkCtx(null));
  withRun(FF, 'hearth', 4343);
  FF.enterNode(G, 0);
  const step = (n) => { for (let i = 0; i < n; i++) FF.update(1 / 30); };
  // put the guide on the scheme hint directly: what is under test is the
  // holding, not the walk that gets there, and the walk has its own section
  G.tut.i = FF.TUTORIAL.findIndex((h) => h.id === 'scheme');
  G.tut.t = 0;
  ok(G.tut.i >= 0, 'the guide has a scheme hint');

  /* Clear every plan off the table and the hint holds rather than talking about
     red text that is not there. This is the whole fix: it used to land on turn
     five of the opening with the log already reading that the player had been
     lunged at. */
  for (const u of G.battle.units) u.plot = null;
  step(4);
  eq(G.tut.hold, true, 'with nothing on the table it waits');
  eq((FF.TUTORIAL[G.tut.i] || {}).id, 'scheme', 'and does not skip past itself');

  const foe = G.battle.units.find((u) => u.side === 'e' && u.alive && u.scheme);
  ok(!!foe, 'the opening still has a schemer in it');
  FF.layPlot(G, foe);
  step(4);
  eq(G.tut.hold, false, 'and the moment one commits, it speaks up');
}

/* ------------------------------------------------------------- rulebook -- */
section('the rulebook');
{
  const log = [];
  const FF = loadGame({}, log);
  const G = FF.G;
  FF.setCtx(mkCtx(log));
  G.screen = 'title';
  FF.update(1 / 60); FF.render();
  ok(FF.hits().some((h) => h.id === 'help'), 'the title offers the rules');
  ok(FF.hits().some((h) => h.id === 'mute'), 'and a way to shut it up');

  FF.press('help');
  eq(FF.UI.help, 0, 'the rulebook opens on its first page');
  for (let page = 0; page < FF.HELP_PAGES.length; page++) {
    FF.press('helpPage', page);
    log.length = 0;
    FF.render();
    ok(log.length > 0, 'page ' + (page + 1) + ' of the rulebook draws');
    ok(FF.hits().some((h) => h.id === 'helpClose'), 'and can be closed');
  }
  FF.press('helpClose');
  eq(FF.UI.help, null, 'closing puts it away');

  // the rulebook has to actually cover the game, or it is decoration
  const shown = FF.HELP_RULES.map((r) => r[0].toLowerCase()).join(' ');
  ['board', 'action', 'counter', 'order', 'bell', 'wave', 'hurt'].forEach((k) => {
    ok(shown.indexOf(k) >= 0, 'the rules explain ' + k);
  });
}

/* ---------------------------------------------------------------- score -- */
section('the score');
{
  const FF = loadGame({});
  const G = FF.G;
  FF.setCtx(mkCtx(null));

  G.screen = 'title';
  eq(FF.moodFor(G), 'title', 'the title has its own mood');
  withRun(FF, 'hearth', 5);
  eq(FF.moodFor(G), 'trail', 'the trail has another');
  FF.startBattle(G, 'fight');
  eq(FF.moodFor(G), 'fight', 'a fight another still');
  FF.startBattle(G, 'boss');
  eq(FF.moodFor(G), 'boss', 'and the beast gets its own');

  // the sequencer must actually run, and must not touch the game's randomness
  const before = FF.MUSIC.notes;
  for (let i = 0; i < 600; i++) FF.musicTick(G, 1 / 60);
  ok(FF.MUSIC.notes > before, 'ten seconds of music schedules notes');
  ok(FF.MUSIC.bars > 0, 'and gets through at least a bar');

  FF.seed(999);
  const a = [];
  for (let i = 0; i < 5; i++) a.push(FF.rnd());
  FF.seed(999);
  for (let i = 0; i < 300; i++) FF.musicTick(G, 1 / 60);
  const b = [];
  for (let i = 0; i < 5; i++) b.push(FF.rnd());
  eq(a.join(','), b.join(','), 'the melody never spends the run seed');

  FF.setMute(true);
  eq(FF.MUSIC.on, false, 'mute stops the music');
  eq(FF.AUD.on, false, 'and the effects');
  eq(G.meta.mute, true, 'and is remembered');
  const quiet = FF.MUSIC.notes;
  for (let i = 0; i < 300; i++) FF.musicTick(G, 1 / 60);
  eq(FF.MUSIC.notes, quiet, 'a muted sequencer schedules nothing at all');
  FF.setMute(false);
  eq(FF.MUSIC.on, true, 'and it comes back');
}

done('frostfell-tutorial');
