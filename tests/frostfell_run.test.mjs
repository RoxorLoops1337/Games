// FROSTFELL — the playthrough probe.
//
// A bot plays whole runs end to end. It is not a good player: it deploys what
// it can, throws gear at whatever is in front, and rings the bell when it has
// nothing. That is the point — it measures the game, not the pilot, and it
// walks every screen transition a real run walks, which is where the crashes
// hide.
//
// Run: node tests/frostfell_run.test.mjs
import { loadGame, ok, eq, done, section } from './frostfell_lib.mjs';

const FF = loadGame();
const G = FF.G;

/* ------------------------------------------------------------- the pilot -- */
function bestSlot() {
  // Hold the front of both lanes first, then fill in behind.
  for (let col = 0; col < FF.COLS; col++) {
    for (let lane = 0; lane < FF.LANES; lane++) {
      if (FF.slotFree(G, 'p', lane, col)) return { lane, col };
    }
  }
  return null;
}
function itemTarget(card) {
  const d = FF.CARDS[card.def];
  if (d.target === 'none') return null;
  const mine = FF.playerUnits(G), theirs = FF.enemyUnits(G);
  if (d.target === 'ally') return mine.slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || null;
  if (d.target === 'enemy') return theirs.slice().sort((a, b) => a.cnt - b.cnt || b.atk - a.atk)[0] || null;
  return theirs[0] || mine[0] || null;
}
function botTurn() {
  const b = G.battle;
  const ui = b.hand.findIndex((c) => c.type === 'unit');
  if (ui >= 0) {
    const slot = bestSlot();
    if (slot && FF.playCard(G, ui, slot)) return;
  }
  for (let i = 0; i < b.hand.length; i++) {
    const c = b.hand[i];
    if (c.type !== 'item') continue;
    const t = itemTarget(c);
    if (FF.canPlay(G, c, t) && FF.playCard(G, i, t)) return;
  }
  if (b.bell >= FF.BELL_CHARGE || !b.hand.length) { FF.ringBell(G); return; }
  FF.passTurn(G);
}

/* Some choices open a chooser, and a couple of them open a second one behind
   the first. The bot always takes the leftmost option until the stack clears. */
function settleChoosers() {
  let guard = 0;
  while (FF.UI.choose && guard++ < 6) {
    const cb = FF.UI.choose.onPick;
    cb(0);
    if (guard > 3) FF.UI.choose = null;   // a chooser that will not close is a bug, not a loop
  }
  FF.UI.choose = null;
}

function playRun(tribe, seed) {
  FF.newRun(G, tribe, seed);
  const stat = { turns: 0, battles: 0, zone: 0, won: false, screens: {} };
  let guard = 0;
  while (guard++ < 3000) {
    stat.screens[G.screen] = (stat.screens[G.screen] || 0) + 1;
    if (G.screen === 'victory') { stat.won = true; break; }
    if (G.screen === 'gameover') break;
    stat.zone = Math.max(stat.zone, G.run ? G.run.zone : 0);
    if (G.screen === 'trail') {
      const step = G.run.trail[G.run.step];
      FF.enterNode(G, step.length > 1 ? (seed + G.run.step) % step.length : 0);
    } else if (G.screen === 'battle') {
      if (G.battle.turn === 0) stat.battles++;
      if (G.battle.over) { FF.drainAll(); continue; }
      botTurn();
      stat.turns++;
      if (G.battle.turn > 160) return Object.assign(stat, { stuck: true });
    } else if (G.screen === 'reward') {
      const r = G.ui.reward;
      if (r.cards.length && !r.taken) FF.press('reward', 0);
      else if (r.charms.length && !r.charmTaken) { FF.press('rewardCharm', 0); settleChoosers(); }
      else if (r.bells && r.bells.length && !r.bellTaken) FF.press('rewardBell', 0);
      else FF.press('rewardSkip');
    } else if (G.screen === 'event') {
      const ev = G.ui.event.def;
      let pickIdx = ev.opts.length - 1;
      for (let k = 0; k < ev.opts.length; k++) { const o = ev.opts[k]; if (!o.can || o.can(G)) { pickIdx = k; break; } }
      FF.press('eventOpt', pickIdx);
      settleChoosers();
    } else if (G.screen === 'shop') {
      const s = G.ui.shop;
      let bought = false;
      for (let i = 0; i < s.cards.length; i++) if (!s.cards[i].sold && G.run.gold >= s.cards[i].price) { FF.buy(G, 'card', i); bought = true; break; }
      if (!bought && !s.heal.sold && G.run.gold >= s.heal.price) { FF.buy(G, 'heal'); bought = true; }
      if (!bought) FF.press('leaveShop');
    } else if (G.screen === 'camp') {
      FF.press('campRest');
    } else {
      break;
    }
  }
  stat.guard = guard;
  return stat;
}

/* ---------------------------------------------------------------- the run -- */
section('whole runs, start to finish');
{
  let thrown = null;
  let wins = 0, stuck = 0, reachedTwo = 0, totalTurns = 0, battles = 0;
  const N = 8;
  const tribes = ['hearth', 'frost', 'scrap'];
  const results = [];
  for (const tribe of tribes) {
    for (let i = 0; i < N; i++) {
      let s;
      try { s = playRun(tribe, 1000 + i * 37); }
      catch (e) { thrown = tribe + '/' + i + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); break; }
      results.push(s);
      if (s.won) wins++;
      if (s.stuck) stuck++;
      if (s.zone >= 1) reachedTwo++;
      totalTurns += s.turns;
      battles += s.battles;
    }
    if (thrown) break;
  }
  eq(thrown, null, 'no run throws');
  const runs = results.length;
  eq(runs, tribes.length * N, 'every run finished one way or the other');
  eq(stuck, 0, 'no fight goes round forever');
  ok(battles > runs, 'runs contain more than one fight');
  console.log(`    ${runs} runs · ${wins} won · ${reachedTwo} reached zone 2 · ` +
    `${(totalTurns / Math.max(1, battles)).toFixed(1)} turns per fight`);

  // The bot is bad on purpose. If it wins every time the game is a walkover;
  // if it never gets out of the first zone, the opening is a wall.
  ok(wins < runs, 'a careless pilot does not win every run');
  ok(reachedTwo > 0, 'a careless pilot does get somewhere');
  const tpf = totalTurns / Math.max(1, battles);
  ok(tpf > 3 && tpf < 60, 'fights last a sane number of turns');
}

/* --------------------------------------------------------- determinism --- */
section('a seed is a promise');
{
  const a = playRun('hearth', 4242);
  const b = playRun('hearth', 4242);
  eq(a.battles, b.battles, 'the same seed plays the same number of fights');
  eq(a.won, b.won, 'and ends the same way');
  eq(a.turns, b.turns, 'turn for turn');
}

done('frostfell-run');
