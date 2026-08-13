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

/* Which cards a pilot actually plays, and which it never touches. A card that
   never gets played across hundreds of runs is either unplayable or invisible,
   and both are the game's problem rather than the bot's. */
const PLAYED = {};
const OFFERED = {};
const realPlay = FF.playCard;
FF.playCard = function (g, idx, spot) {
  const card = g.battle && g.battle.hand[idx];
  const def = card && card.def;
  const okPlay = realPlay(g, idx, spot);
  if (okPlay && def) PLAYED[def] = (PLAYED[def] || 0) + 1;
  return okPlay;
};
const realTake = FF.takeCard;
FF.takeCard = function (g, id) {
  if (id) OFFERED[id] = (OFFERED[id] || 0) + 1;
  return realTake(g, id);
};

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
/* What the line will kill on its own BEFORE it gets hit for it.

   The first version of this counted every swing a warden would land before a
   foe next attacked, and the bot promptly got worse: it sat on gear because
   something was notionally doomed three turns out, while the thing hit it
   twice in the meantime. Only a kill that lands strictly sooner than the foe's
   own swing is worth withholding gear for — anything later is a trade the
   player is still paying for. */
function doomed() {
  const map = {};
  for (const f of FF.enemyUnits(G)) map[f.uid] = 0;
  for (const u of FF.playerUnits(G)) {
    if (u.atk <= 0) continue;
    const t = FF.targetFor(G, u);
    if (!t || u.cnt >= t.cnt) continue;          // it does not get there first
    map[t.uid] = (map[t.uid] || 0) + u.atk * (1 + (u.kw.frenzy || 0));
  }
  return map;
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
  // gear aimed at a foe: spend it where it kills something the line would not
  // have killed anyway, and prefer whatever is about to swing
  const dead = doomed();
  let best = null, bestScore = 0;
  for (const f of theirs) {
    const p = FF.previewOf(G, card, f);
    const dmg = p.reduce((n, x) => n + Math.max(0, x.dmg || 0), 0);
    let kills = 0, waste = 0;
    for (const x of p) {
      if (!(x.dmg > 0)) continue;
      const already = dead[x.u.uid] || 0;
      if (x.dmg >= x.u.hp) { if (already >= x.u.hp) waste += 1; else kills += 1; }
      else if (already >= x.u.hp) waste += 0.5;         // it is already spoken for
    }
    const soon = f.cnt <= 1 ? 3 : f.cnt <= 2 ? 1 : 0;
    // control counts as damage prevented: freezing something about to swing is
    // worth roughly what the swing would have cost
    let control = 0;
    for (const x of p) {
      if (!x.tag || x.u.side !== 'e') continue;
      if (/FROST/.test(x.tag) && x.u.cnt <= 2) control += x.u.atk * 0.7;
      else if (/EMBER/.test(x.tag)) control += 2;
      else if (/HAUL/.test(x.tag)) control += 1;
    }
    if (card.def === 'hush') control += 2;      // frost AND weak on one target
    // breaking a scheme is worth what the scheme was going to cost, and only
    // one card in the deck breaks one outright — the rest can merely delay it
    if (f.plot) {
      const cost = f.plot.id === 'mark' ? f.atk * 1.2 : 3;
      if (card.def === 'coldread') control += cost;
      else if (p.some((x) => /FROST/.test(x.tag || ''))) control += cost * 0.4;
    }
    const score = kills * 7 + dmg * 0.4 + control + soon - waste * 2;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return { t: best, worth: bestScore };
}
function carefulTurn() {
  const b = G.battle;

  /* Read what the foes have said they will do, and take it away — all of it
     with free moves, so a pilot that looks at the board pays nothing for it.
     A pilot that does not look eats a double lunge and a frozen lane. */
  for (const f of FF.enemyUnits(G)) {
    const p = f.plot;
    if (!p) continue;
    if (p.id === 'mark') {
      const t = FF.playerUnits(G).find((x) => x.uid === p.uid);
      if (!t || t.lane !== p.lane || t.col !== p.col) continue;
      // vacate the named slot and leave it empty — a swap only feeds it a
      // different body
      const spot = FF.freeSlots(G, 'p')[0];
      if (spot) FF.moveUnit(G, t, spot.lane, spot.col);
    } else if (p.id === 'chill') {
      const caught = FF.playerUnits(G).filter((x) => x.lane === p.lane);
      const room = FF.freeSlots(G, 'p').filter((s) => s.lane !== p.lane);
      if (caught.length && caught.length <= room.length) {
        caught.forEach((t, i) => FF.moveUnit(G, t, room[i].lane, room[i].col));
      }
    }
  }

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

  /* Filling the last slot costs the whole line its warmth and hands somebody
     frostbite, and it takes away the room to step out of a lunge. A pilot
     that reads the board keeps one slot back unless the body is worth more
     than the room — which it is when the line is thin or something big is
     about to land. */
  const ui = b.hand.findIndex((c) => c.type === 'unit');
  if (ui >= 0) {
    const last = FF.freeSlots(G, 'p').length <= 1;
    const thin = FF.playerUnits(G).length <= 2;
    const pressed = FF.enemyUnits(G).reduce((n, f) => n + (f.cnt <= 1 ? f.atk : 0), 0) >= 6;
    if (!last || thin || pressed) {
      const slot = carefulSlot(b.hand[ui]);
      if (slot && FF.playCard(G, ui, slot)) return;
    }
  }
  if (bestI >= 0 && FF.playCard(G, bestI, bestT)) return;

  // a wave called onto a set board is half a wave
  if (b.waves && b.waves.length && FF.enemyUnits(G).length <= 1 && FF.playerUnits(G).length >= 3) {
    if (FF.ringWave(G)) return;
  }

  if (b.bell >= FF.BELL_CHARGE || !b.hand.length) { FF.ringBell(G); return; }
  FF.passTurn(G);
}

/* Building the caravan, rather than taking whatever is on the left.

   This exists to answer a question the win rates raised and could not settle:
   the careful pilot survives the first zone far more often than the careless
   one and still wins no more runs, which points at the DRAFT deciding the run
   rather than the fight. Give the careful pilot a real opinion about which of
   the three cards to take, and if the gap opens, that was the cause. */
function draftPick(ids) {
  const deck = G.run.deck;
  const bodies = deck.filter((cd) => cd.type === 'unit').length;
  let bestI = 0, bestS = -1e9;
  ids.forEach((id, i) => {
    const d = FF.CARDS[id];
    if (!d) return;
    let s = (d.rare || 1) * 2;
    if (d.type === 'unit') {
      // what a body is worth is damage per turn plus what it can survive
      s += (d.atk || 0) / Math.max(1, d.cnt || 1) * 3 + (d.hp || 0) * 0.25;
      if (bodies < 5) s += 4;                      // a caravan short of bodies needs bodies
      if (d.tribe && d.tribe === G.run.tribe) s += 1.5;
    } else {
      s += 5;                                      // gear is a turn that does something
      if (d.target === 'none') s += 1;
    }
    if (s > bestS) { bestS = s; bestI = i; }
  });
  return bestI;
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

/* Three pilots, not two. `careless` takes what is leftmost and swings at what
   is nearest; `tactics` plays the fight well but still drafts off the left of
   the reward screen; `careful` does both. Splitting them is what turned an
   unreadable zero into an answer: see the note over draftPick. */
function playRun(tribe, seed, mode) {
  const careful = mode !== 'careless';
  const drafts = mode === 'careful';
  FF.newRun(G, tribe, seed);
  const stat = { turns: 0, battles: 0, zone: 0, won: false, screens: {} };
  let guard = 0;
  while (guard++ < 3000) {
    stat.screens[G.screen] = (stat.screens[G.screen] || 0) + 1;
    if (G.screen === 'victory') { stat.won = true; break; }
    // Where a run ends is as much the measure as whether it ends: a game whose
    // deaths all pile up in one zone has one wall in it, not three.
    if (G.screen === 'gameover') { stat.diedZone = G.run ? G.run.zone : 0; break; }
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
      if (r.cards.length && !r.taken) FF.press('reward', drafts ? draftPick(r.cards) : 0);
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
  // Eight seeds a tribe is what the suite can afford. FF_RUNS turns the same
  // instrument up when the question is 'is this gap real' rather than 'does
  // this still run' — at N=8 the whole spread is two or three runs wide, which
  // is noise, and pretending otherwise would be worse than not measuring.
  const N = Number(process.env.FF_RUNS || 8);
  const tribes = ['hearth', 'frost', 'scrap'];
  const sweep = (mode) => {
    let thrown = null;
    const out = { wins: 0, stuck: 0, reachedTwo: 0, reachedThree: 0, turns: 0, battles: 0, runs: 0, died: [0, 0, 0] };
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) {
        let s;
        try { s = playRun(tribe, 1000 + i * 37, mode); }
        catch (e) { thrown = tribe + '/' + i + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); break; }
        out.runs++;
        if (s.won) out.wins++;
        if (s.stuck) out.stuck++;
        if (s.zone >= 1) out.reachedTwo++;
        if (s.zone >= 2) out.reachedThree++;
        if (!s.won && s.diedZone !== undefined) out.died[Math.min(2, s.diedZone)]++;
        out.turns += s.turns;
        out.battles += s.battles;
      }
      if (thrown) break;
    }
    out.thrown = thrown;
    return out;
  };

  const careless = sweep('careless');
  const tactics = sweep('tactics');
  const careful = sweep('careful');
  eq(careless.thrown, null, 'no careless run throws');
  eq(tactics.thrown, null, 'no tactics-only run throws');
  eq(careful.thrown, null, 'no careful run throws');
  eq(careless.runs, tribes.length * N, 'every careless run finished one way or the other');
  eq(careful.runs, tribes.length * N, 'and so did every careful one');
  eq(careless.stuck + tactics.stuck + careful.stuck, 0, 'no fight goes round forever');
  ok(careless.battles > careless.runs, 'runs contain more than one fight');

  const pct = (o) => Math.round((o.wins / Math.max(1, o.runs)) * 100);
  const line = (o) => `${o.wins}/${o.runs} won (${pct(o)}%) · ${o.reachedTwo}/${o.reachedThree} reached zone 2/3 · ` +
    `died ${o.died.join('/')} by zone · ${(o.turns / Math.max(1, o.battles)).toFixed(1)} turns/fight`;
  console.log(`    careless:      ${line(careless)}`);
  console.log(`    fight only:    ${line(tactics)}`);
  console.log(`    fight + draft: ${line(careful)}`);
  console.log(`    the gap:  ${pct(careful) - pct(careless)} points for playing well — ` +
    `${pct(tactics) - pct(careless)} of it from the fight, ${pct(careful) - pct(tactics)} from the draft`);

  // Neither end may collapse: a walkover for the careless pilot means nothing
  // in the game asks anything, and a careful pilot who never wins means the
  // skill on offer buys nothing.
  ok(careless.wins < careless.runs, 'a careless pilot does not win every run');
  ok(careless.reachedTwo > 0, 'a careless pilot does get somewhere');

  /* The ordering — careful beats careless — is only checked when the sample
     can carry it. At the suite's default eight seeds a tribe the whole spread
     is two or three runs wide, and an assertion that fails on noise teaches
     the next person to ignore it. Run FF_RUNS=25 to hold the game to it. */
  if (N >= 20) {
    ok(careful.wins >= careless.wins, 'playing well is never worse than playing badly');
    ok(careful.reachedTwo >= careless.reachedTwo, 'and it gets further along the trail');
  } else {
    ok(true, `skill ordering not checked at ${N} seeds a tribe — too few to mean anything`);
  }
  const tpf = careless.turns / Math.max(1, careless.battles);
  ok(tpf > 3 && tpf < 60, 'fights last a sane number of turns');
}

/* ------------------------------------------------------ cards in practice -- */
section('every card is worth playing');
{
  const all = Object.values(FF.CARDS).filter((c) => !c.leader);
  const never = all.filter((c) => !PLAYED[c.id]);
  const rare = all.filter((c) => (PLAYED[c.id] || 0) > 0)
    .sort((a, b) => (PLAYED[a.id] || 0) - (PLAYED[b.id] || 0)).slice(0, 3);
  const top = Object.entries(PLAYED).sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(`    played ${Object.keys(PLAYED).length}/${all.length} cards · ` +
    `most: ${top.map(([k, v]) => k + ' ' + v).join(', ')}`);
  if (rare.length) console.log(`    least: ${rare.map((c) => c.id + ' ' + PLAYED[c.id]).join(', ')}`);
  if (never.length) console.log(`    never played: ${never.map((c) => c.id).join(', ')}`);

  /* Two different failures wear the same face here, and only one of them is a
     design problem:

       - never ACQUIRED — the card is rare, or locked, or the pool never offers
         it. That is a matter of weighting, worth printing and watching.
       - acquired and never PLAYED — the caravan carried it around all run and
         never found a moment for it. That one is the card's fault. */
  const held = all.filter((c) => (OFFERED[c.id] || 0) > 0 || FF.STARTERS.hearth.deck.indexOf(c.id) >= 0 ||
    FF.STARTERS.frost.deck.indexOf(c.id) >= 0 || FF.STARTERS.scrap.deck.indexOf(c.id) >= 0);
  const deadWeight = held.filter((c) => !PLAYED[c.id]);
  const unseen = never.filter((c) => held.indexOf(c) < 0);
  if (unseen.length) console.log(`    never even acquired: ${unseen.map((c) => c.id).join(', ')}`);
  eq(deadWeight.map((c) => c.id).join(','), '',
    'no card is carried around a whole run and never found a moment');
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
