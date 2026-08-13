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

/* ------------------------------------------------------------ the pilot 2 --

   A player who is actually paying attention. It does the four things the
   careless bot never does: it puts bodies where they will be hit rather than
   wherever is free, it slides wounded wardens out of the front, it holds gear
   until the gear does something, and it rings for the next wave while its own
   board is set instead of while it is rebuilding.

   The gap between this one's win rate and the careless one's is the number
   that actually describes the difficulty: if they win equally often, nothing
   the player does matters. */
function soakerFirst(card) {
  const d = FF.CARDS[card.def];
  return !!(d && d.kw && (d.kw.soak || d.hp >= 10));
}
function carefulSlot(card) {
  // wall first, then the lane that is about to be hit, then anywhere
  const wall = soakerFirst(card);
  const lanes = [0, 1].sort((a, z) => threatOf(z) - threatOf(a));
  for (const lane of lanes) {
    const cols = wall ? [0, 1, 2] : [1, 2, 0];
    for (const col of cols) if (FF.slotFree(G, 'p', lane, col)) return { lane, col };
  }
  return null;
}
function threatOf(lane) {
  return FF.enemyUnits(G).filter((u) => u.lane === lane).reduce((n, u) => n + u.atk / Math.max(1, u.cnt), 0);
}
function carefulItem(card) {
  const d = FF.CARDS[card.def];
  const pre = FF.previewOf(G, card, null);
  const mine = FF.playerUnits(G), theirs = FF.enemyUnits(G);
  if (d.target === 'none') return { t: null, worth: pre.length ? 2 : 0 };
  if (d.target === 'ally') {
    // mending is worth spending only on something actually hurt
    const hurtOne = mine.slice().sort((a, z) => (a.hp / a.maxHp) - (z.hp / z.maxHp))[0];
    if (!hurtOne) return { t: null, worth: 0 };
    const wounded = 1 - hurtOne.hp / hurtOne.maxHp;
    // a counter-shortener is worth most on the biggest attacker
    if (card.def === 'pryrod' || card.def === 'bellrope') {
      const best = mine.slice().sort((a, z) => z.atk - a.atk)[0];
      return { t: best, worth: best && best.cnt > 1 ? 3 : 0 };
    }
    return { t: hurtOne, worth: wounded > 0.35 ? 3 : 0 };
  }
  // gear aimed at a foe: spend it where it kills, or on whatever swings soonest
  let best = null, bestScore = 0;
  for (const f of theirs) {
    const p = FF.previewOf(G, card, f);
    const dmg = p.reduce((n, x) => n + Math.max(0, x.dmg || 0), 0);
    const kills = p.filter((x) => x.dmg > 0 && x.dmg >= x.u.hp).length;
    const score = kills * 6 + dmg * 0.4 + (f.cnt <= 1 ? 2 : 0);
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return { t: best, worth: bestScore };
}
function carefulTurn() {
  const b = G.battle;

  // free actions first: nothing about them costs a turn
  for (const u of FF.playerUnits(G)) {
    if (u.leader && u.col < 2) {
      // the leader belongs at the back, always
      for (let col = 2; col > u.col; col--) if (FF.slotFree(G, 'p', u.lane, col)) { FF.moveUnit(G, u, u.lane, col); break; }
    } else if (!u.leader && u.col === 0 && u.hp <= u.maxHp * 0.3) {
      // pull a warden that is about to fall out of the front line
      for (let col = 2; col > 0; col--) if (FF.slotFree(G, 'p', u.lane, col)) { FF.moveUnit(G, u, u.lane, col); break; }
    }
  }

  // what the best piece of gear would be worth right now
  let bestI = -1, bestT = null, bestW = 2.5;
  for (let i = 0; i < b.hand.length; i++) {
    const c = b.hand[i];
    if (c.type !== 'item') continue;
    const pickT = carefulItem(c);
    if (pickT.worth > bestW && FF.canPlay(G, c, pickT.t)) { bestW = pickT.worth; bestI = i; bestT = pickT.t; }
  }

  // a kill this turn beats a body next turn — that is the single judgement the
  // careless bot never makes, because it always reaches for a warden first
  if (bestI >= 0 && bestW >= 6 && FF.playCard(G, bestI, bestT)) return;

  const ui = b.hand.findIndex((c) => c.type === 'unit');
  if (ui >= 0) {
    const slot = carefulSlot(b.hand[ui]);
    if (slot && FF.playCard(G, ui, slot)) return;
  }
  if (bestI >= 0 && FF.playCard(G, bestI, bestT)) return;

  // a wave called onto a set board is half a wave
  if (b.waves && b.waves.length && FF.enemyUnits(G).length <= 1 && FF.playerUnits(G).length >= 3) {
    if (FF.ringWave(G)) return;
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

function playRun(tribe, seed, careful) {
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
      if (careful) carefulTurn(); else botTurn();
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
      // a careful shopper mends first and thins the deck when it can afford to
      if (careful && !s.heal.sold && G.run.gold >= s.heal.price &&
          G.run.deck.some((cd) => cd.dmg > 0 || cd.injured)) { FF.buy(G, 'heal'); bought = true; }
      if (!bought && careful && s.burn && !s.burn.sold && G.run.gold >= s.burn.price + 30 && G.run.deck.length > 8) {
        FF.press('buyBurn');
        settleChoosers();
        bought = true;
      }
      for (let i = 0; !bought && i < s.cards.length; i++) if (!s.cards[i].sold && G.run.gold >= s.cards[i].price) { FF.buy(G, 'card', i); bought = true; break; }
      if (!bought && !s.heal.sold && G.run.gold >= s.heal.price) { FF.buy(G, 'heal'); bought = true; }
      if (!bought) FF.press('leaveShop');
    } else if (G.screen === 'camp') {
      FF.press('campRest');
    } else if (G.screen === 'rest') {
      FF.press('restPick', 0);
      settleChoosers();
    } else if (G.screen === 'shrine') {
      FF.press('shrineGive');
      settleChoosers();
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
  const N = 8;
  const tribes = ['hearth', 'frost', 'scrap'];
  const sweep = (careful) => {
    let thrown = null;
    const out = { wins: 0, stuck: 0, reachedTwo: 0, turns: 0, battles: 0, runs: 0 };
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) {
        let s;
        try { s = playRun(tribe, 1000 + i * 37, careful); }
        catch (e) { thrown = tribe + '/' + i + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); break; }
        out.runs++;
        if (s.won) out.wins++;
        if (s.stuck) out.stuck++;
        if (s.zone >= 1) out.reachedTwo++;
        out.turns += s.turns;
        out.battles += s.battles;
      }
      if (thrown) break;
    }
    out.thrown = thrown;
    return out;
  };

  const careless = sweep(false);
  const careful = sweep(true);
  eq(careless.thrown, null, 'no careless run throws');
  eq(careful.thrown, null, 'no careful run throws');
  eq(careless.runs, tribes.length * N, 'every careless run finished one way or the other');
  eq(careful.runs, tribes.length * N, 'and so did every careful one');
  eq(careless.stuck + careful.stuck, 0, 'no fight goes round forever');
  ok(careless.battles > careless.runs, 'runs contain more than one fight');

  const pct = (o) => Math.round((o.wins / Math.max(1, o.runs)) * 100);
  console.log(`    careless: ${careless.wins}/${careless.runs} won (${pct(careless)}%) · ` +
    `${careless.reachedTwo} reached zone 2 · ${(careless.turns / Math.max(1, careless.battles)).toFixed(1)} turns/fight`);
  console.log(`    careful:  ${careful.wins}/${careful.runs} won (${pct(careful)}%) · ` +
    `${careful.reachedTwo} reached zone 2 · ${(careful.turns / Math.max(1, careful.battles)).toFixed(1)} turns/fight`);
  console.log(`    the gap:  ${pct(careful) - pct(careless)} points of win rate for playing well`);

  // Neither end may collapse: a walkover for the careless pilot means nothing
  // in the game asks anything, and a careful pilot who never wins means the
  // skill on offer buys nothing.
  ok(careless.wins < careless.runs, 'a careless pilot does not win every run');
  ok(careless.reachedTwo > 0, 'a careless pilot does get somewhere');
  ok(careful.wins >= careless.wins, 'playing well is never worse than playing badly');
  ok(careful.reachedTwo >= careless.reachedTwo, 'and it gets further along the trail');
  const tpf = careless.turns / Math.max(1, careless.battles);
  ok(tpf > 3 && tpf < 60, 'fights last a sane number of turns');
}

/* --------------------------------------------------------- determinism --- */
section('a seed is a promise');
{
  const a = playRun('hearth', 4242, true);
  const b = playRun('hearth', 4242, true);
  eq(a.battles, b.battles, 'the same seed plays the same number of fights');
  eq(a.won, b.won, 'and ends the same way');
  eq(a.turns, b.turns, 'turn for turn');
}

done('frostfell-run');
