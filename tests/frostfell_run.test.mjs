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
  // A card that does not cost the turn is close to free — but only worth
  // reaching for while there is room in the hand for what it draws.
  if (d.freeAction) return { t: null, worth: G.battle.hand.length < FF.HAND ? 99 : 0 };
  if (d.target === 'none') {
    /* Board-wide gear was scored at a flat 2 whatever it did, which put every
       one of them under the threshold and kept them off the table for good.
       Score it by what it actually lands, across everything it lands on. */
    let v = 0;
    for (const x of pre) {
      v += Math.max(0, x.dmg || 0) * 0.4;
      if (!x.tag) continue;
      const n = Number((x.tag.match(/\d+/) || [1])[0]);
      if (/EMBER/.test(x.tag)) v += n * 0.9;
      else if (/FROST/.test(x.tag)) v += x.u.cnt <= 2 ? x.u.atk * 0.7 : 1;
      else if (/SPICE/.test(x.tag)) v += n * 0.8;
      else v += 1;
    }
    return { t: null, worth: v };
  }
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
      // a beast that vents when chilled is worth chilling for the heat alone
      if (/FROST/.test(x.tag) && x.u.heat) control += x.u.heat * 1.6;
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
function cardWorth(id) {
  const d = FF.CARDS[id];
  if (!d) return 0;
  const bodies = G.run.deck.filter((cd) => cd.type === 'unit').length;
  let s = (d.rare || 1) * 2;
  if (d.type === 'unit') {
    // what a body is worth is damage per turn plus what it can survive
    s += (d.atk || 0) / Math.max(1, d.cnt || 1) * 3 + (d.hp || 0) * 0.25;
    if (bodies < 5) s += 4;                        // a caravan short of bodies needs bodies
    if (d.tribe && d.tribe === G.run.tribe) s += 1.5;
  } else {
    s += 5;                                        // gear is a turn that does something
    if (d.target === 'none') s += 1;
  }
  // and whatever the caravan is furthest short of is worth more than its stats
  const need = FF.caravanNeeds(G.run);
  if (need) {
    if (need.k === 'bodies' && d.type === 'unit') s += 5;
    if (need.k === 'wall' && (d.hp || 0) >= 10) s += 5;
    if (need.k === 'punch' && Math.max(d.atk || 0, FF.hitOf({ def: d.id })) >= 5) s += 4;
    if (need.k === 'mend' && /heal|mend|regen/i.test(d.text || '')) s += 5;
  }
  return s;
}
function draftPick(ids) {
  let bestI = 0, bestS = -1e9;
  ids.forEach((id, i) => { const s = cardWorth(id); if (s > bestS) { bestS = s; bestI = i; } });
  return bestI;
}

/* Spending scrip on the offer itself, which is the lever the last round of
   measurement said actually decides a run. In order: set a course while the
   trek is young enough for it to pay off; buy a fresh three when the three on
   the table are worth less than the redeal costs; take the best card; walk on
   and pocket the scrip when the caravan already has what it needs. */
/* The course is declared before a card is drawn, so a pilot with an opinion
   has exactly one thing to go on: the leader it chose. Backing the tribe it
   already starts with is the obvious read, and it is the one this pilot takes.
   The probe measures each of the five directly below, so if a different one
   were better the numbers would say so. */
const courseWanted = () => G.run.tribe;
function draftTurn(r) {
  const run = G.run;
  const i = draftPick(r.cards);
  const worth = cardWorth(r.cards[i]);
  // an offer worth less than the price of a fresh one
  const rd = FF.redealPrice(run);
  if (worth < 9 && run.gold >= rd + 20 && (run.redeals || 0) < 3) { FF.press('rewardRedeal'); return; }
  /* Whether to take a card is a question about the DECK, not about the card.
     Keying it on how good the offer looked made the pilot measurably worse the
     moment offers improved — better cards, more of them taken, a fatter deck,
     a worse draw. A caravan that is not short of anything and is already
     twelve cards deep walks on and keeps the scrip. */
  const need = FF.caravanNeeds(run);
  /* A caravan that is not short of anything wants its cards harder, not more
     of them — and the reward screen will now trade the whole offer for that. */
  if (!need && run.deck.length >= 9 && FF.temperable(run).length) {
    FF.press('rewardTemper');
    pickBiggest();
    return;
  }
  if (!need && run.deck.length >= 11) { FF.press('rewardSkip'); return; }
  if (run.deck.length >= 15 && worth < 14) { FF.press('rewardSkip'); return; }
  FF.press('reward', i);
}

/* Answer an open chooser with the card most worth making harder: whatever is
   already carrying the line. Used wherever tempering is on offer, which as of
   this round is three different screens. */
function pickBiggest() {
  if (!FF.UI.choose) return false;
  const items = FF.UI.choose.items;
  let bi = 0, bs = -1;
  items.forEach((it, i) => {
    const cd = it.card;
    const sc = cd && cd.type === 'unit' ? cd.hp + cd.atk * 2 : 0;
    if (sc > bs) { bs = sc; bi = i; }
  });
  FF.UI.choose.onPick(bi);
  FF.UI.choose = null;
  settleChoosers();
  return true;
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
function playRun(tribe, seed, mode, tweak) {
  // A cumulative ladder: each pilot is the one above it plus one more thing it
  // knows how to do, so the difference between two rows is that one thing.
  const careful = mode !== 'careless';                       // plays the fight
  const shops = mode === 'trader' || mode === 'careful';     // spends well
  const drafts = mode === 'careful';                         // steers the offers
  FF.newRun(G, tribe, seed);
  // A pilot that steers the pool declares a course at the leader screen, the
  // way a player does — before anything is known except which leader it took.
  if (mode === 'careful') G.run.course = courseWanted();
  if (tweak) tweak(G.run);
  const stat = { turns: 0, battles: 0, zone: 0, won: false, screens: {} };
  let lastShop = null;
  let guard = 0;
  while (guard++ < 3000) {
    if (guard >= 3000) {
      stat.ranOut = true;
      stat.spunOn = Object.entries(stat.screens).sort((a, z) => z[1] - a[1]).slice(0, 2)
        .map(([k, v]) => k + ' ' + v).join('+') + (G.UI && G.UI.choose ? ' chooser-open' : '');
    }
    stat.screens[G.screen] = (stat.screens[G.screen] || 0) + 1;
    if (G.screen === 'victory') { stat.won = true; break; }
    // Where a run ends is as much the measure as whether it ends: a game whose
    // deaths all pile up in one zone has one wall in it, not three.
    if (G.screen === 'gameover') {
      stat.diedZone = G.run ? G.run.zone : 0;
      // The run already remembers the blow that took the leader, by name. What
      // it never did was count them: one death is an anecdote, two hundred is
      // a design note.
      stat.killedBy = (G.run && G.run.killedBy && G.run.killedBy.name) || 'the cold';
      break;
    }
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
      if (r.cards.length && !r.taken && drafts) draftTurn(r);
      else if (r.cards.length && !r.taken) FF.press('reward', 0);
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
      /* A careful shopper spends on what does not make the deck bigger. That
         is not a style preference: with money buying only cards, "everything
         free" measured WORSE than penniless, because every purchase was one
         more card between the caravan and the card it wanted. */
      if (shops && !s.heal.sold && G.run.gold >= s.heal.price &&
          G.run.deck.some((cd) => cd.dmg > 0 || cd.injured)) { FF.buy(G, 'heal'); bought = true; }
      if (!bought && shops && s.temper && !s.temper.sold && G.run.gold >= s.temper.price &&
          FF.temperable(G.run).length) {
        FF.press('buyTemper');
        pickBiggest();
        bought = true;
      }
      if (!bought && shops && s.burn && !s.burn.sold && G.run.gold >= s.burn.price && G.run.deck.length > 10) {
        FF.press('buyBurn');
        settleChoosers();
        bought = true;
      }
      // only then a card, and only if the caravan is actually short of one
      const wants = FF.caravanNeeds(G.run);
      for (let i = 0; !bought && i < s.cards.length; i++) {
        if (s.cards[i].sold || G.run.gold < s.cards[i].price) continue;
        if (shops && !wants && G.run.deck.length >= 12) continue;
        FF.buy(G, 'card', i);
        // the sale comes with a trade-in: leave the weakest thing behind
        if (shops && FF.UI.choose) {
          const items = FF.UI.choose.items;
          let wi = 0, ws = 1e9;
          items.forEach((it, k) => {
            const cd = it.card;
            const sc = cd.type === 'unit' ? cd.hp + cd.atk * 2 : 12 + (cd.rare || 1) * 3;
            if (sc < ws) { ws = sc; wi = k; }
          });
          FF.UI.choose.onPick(wi);
          FF.UI.choose = null;
        }
        settleChoosers();
        bought = true; break;
      }
      if (!bought && !s.heal.sold && G.run.gold >= s.heal.price) { FF.buy(G, 'heal'); bought = true; }
      /* A press that changes nothing is how a shop becomes an infinite loop —
         it already has been, twice. If a visit thinks it bought something but
         the counter looks exactly as it did, walk out. */
      const fingerprint = JSON.stringify([G.run.gold, s.cards.map((cc) => cc.sold), s.heal.sold,
        s.temper && s.temper.sold, s.burn && s.burn.sold, G.run.deck.length]);
      if (!bought || fingerprint === lastShop) FF.press('leaveShop');
      lastShop = fingerprint;
    } else if (G.screen === 'camp') {
      /* A camp is a choice now, not a button. Mending matters when somebody is
         hurt; when nobody is, the fire is better spent on the anvil. */
      const hurtSome = G.run.deck.concat([G.run.leader]).some((cd) => cd.dmg > 2 || cd.injured);
      if (shops && !hurtSome && FF.temperable(G.run).length) {
        FF.press('campTemper');
        pickBiggest();
      } else FF.press('campRest');
    } else if (G.screen === 'rest') {
      FF.press('restPick', 0);
      settleChoosers();
    } else if (G.screen === 'shrine') {
      FF.press('shrineGive');
      settleChoosers();
    } else {
      stat.lostAt = G.screen;
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
  const sweep = (mode, tweak) => {
    let thrown = null;
    const out = { wins: 0, stuck: 0, reachedTwo: 0, reachedThree: 0, turns: 0, battles: 0, runs: 0,
      died: [0, 0, 0], killers: {}, vanished: 0, vanishedAt: {} };
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) {
        let s;
        try { s = playRun(tribe, 1000 + i * 37, mode, tweak); }
        catch (e) { thrown = tribe + '/' + i + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); break; }
        out.runs++;
        if (s.won) out.wins++;
        if (s.stuck) out.stuck++;
        if (s.zone >= 1) out.reachedTwo++;
        if (s.zone >= 2) out.reachedThree++;
        if (!s.won && s.diedZone === undefined && !s.stuck) {
          out.vanished++;
          const where = s.ranOut ? 'ran out of turns on ' + s.spunOn : (s.lostAt || 'unknown');
          out.vanishedAt[where] = (out.vanishedAt[where] || 0) + 1;
        }
        if (!s.won && s.diedZone !== undefined) {
          out.died[Math.min(2, s.diedZone)]++;
          if (s.diedZone >= 2) out.killers[s.killedBy] = (out.killers[s.killedBy] || 0) + 1;
        }
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
  const trader = sweep('trader');
  const careful = sweep('careful');
  eq(careless.thrown, null, 'no careless run throws');
  eq(tactics.thrown, null, 'no tactics-only run throws');
  eq(trader.thrown, null, 'no trader run throws');
  eq(careful.thrown, null, 'no careful run throws');
  eq(careless.runs, tribes.length * N, 'every careless run finished one way or the other');
  eq(careful.runs, tribes.length * N, 'and so did every careful one');
  eq(careless.stuck + tactics.stuck + trader.stuck + careful.stuck, 0, 'no fight goes round forever');
  ok(careless.battles > careless.runs, 'runs contain more than one fight');

  /* A run that ends without a victory AND without a death did not end — the
     bot fell out of its own loop, and every number above it is a lie by that
     much. This has bitten three times now (unhandled screens twice, and a
     turn budget the third), so it is an assertion rather than a note. */
  for (const [nm, o] of [['careless', careless], ['fight', tactics], ['trader', trader], ['careful', careful]]) {
    if (o.vanished) {
      console.log(`    ! ${nm}: ${o.vanished} runs ended without a victory or a death — ` +
        Object.entries(o.vanishedAt).map(([k, v]) => `${k} ${v}`).join(', '));
    }
    eq(o.vanished, 0, `every ${nm} run reaches an ending`);
  }

  const pct = (o) => Math.round((o.wins / Math.max(1, o.runs)) * 100);
  const line = (o) => `${o.wins}/${o.runs} won (${pct(o)}%) · ${o.reachedTwo}/${o.reachedThree} reached zone 2/3 · ` +
    `died ${o.died.join('/')} by zone · ${(o.turns / Math.max(1, o.battles)).toFixed(1)} turns/fight`;
  console.log(`    careless:           ${line(careless)}`);
  console.log(`    + the fight:        ${line(tactics)}`);
  console.log(`    + the trader:       ${line(trader)}`);
  console.log(`    + steering the pool:${line(careful)}`);
  console.log(`    the gap:  ${pct(careful) - pct(careless)} points for playing well — ` +
    `${pct(tactics) - pct(careless)} from the fight, ${pct(trader) - pct(tactics)} from the trader, ` +
    `${pct(careful) - pct(trader)} from steering the pool`);

  /* What is actually killing a competent pilot in the last zone. A zone that
     kills is a difficulty setting; a zone where the same three things kill
     every time is a design problem, and telling them apart needs the names. */
  const lastZone = Object.entries(careful.killers).sort((a, z) => z[1] - a[1]);
  const totalLate = lastZone.reduce((n, [, v]) => n + v, 0);
  console.log(`    what ends a good run in the last zone (${totalLate} deaths): ` +
    (lastZone.slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing — nobody died there'));

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
    /* What is held to a bar is the WHOLE gap, not any one rung of it.

       An earlier version of this line demanded the trader be worth six points
       on its own, and that expectation is exactly what this round set out to
       break: when tempering lived only at the trader it was worth fourteen
       points, and that is not a healthy economy, it is a single node on a map
       of nine deciding the run. With the same strength reachable at a camp and
       on the reward screen, being penniless is survivable and the trader's own
       rung is small. The rungs move between iterations; the total is the thing
       that must not collapse. */
    ok(pct(careful) - pct(careless) >= 12, 'playing well, all told, is worth a good deal');
  } else {
    ok(true, `skill ordering not checked at ${N} seeds a tribe — too few to mean anything`);
  }
  const tpf = careless.turns / Math.max(1, careless.battles);
  ok(tpf > 3 && tpf < 60, 'fights last a sane number of turns');
}

/* ------------------------------------------------------ cards in practice -- */
/* ------------------------------------------------------------- economy --- */
/* Does money do anything?

   A resource that does not change the outcome is decoration, and the honest
   way to find out is to take it away and to give away far too much of it, and
   see whether the run notices. `prices` is the multiplier winters already use,
   so this is the game's own lever rather than a new one: at 0.02 everything in
   every shop is free, at 40 nothing is ever affordable. If those two runs land
   on the same win rate, the trader is scenery. */
section('does money change anything');
{
  const N = Number(process.env.FF_RUNS || 8);
  const tribes = ['hearth', 'frost', 'scrap'];
  const sweep2 = (tweak) => {
    let wins = 0, runs = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) {
        const st = playRun(tribe, 1000 + i * 37, 'careful', tweak);
        runs++;
        if (st.won) wins++;
      }
    }
    return { wins, runs, pct: Math.round((wins / Math.max(1, runs)) * 100) };
  };
  const normal = sweep2(null);
  /* Every number in this section is a proportion out of the same handful of
     runs, so it carries a band: one standard deviation, in points, computed up
     front and printed below, so nobody reads a four-point difference as a
     finding. Several of this iteration's dead ends were exactly that mistake
     made twice. */
  const band = Math.round(100 * Math.sqrt(0.35 * 0.65 / Math.max(1, normal.runs)));
  const broke = sweep2((run) => { run.gold = 0; run.prices = 40; });
  const rich = sweep2((run) => { run.gold = 400; run.prices = 0.02; });
  console.log(`    penniless:      ${broke.wins}/${broke.runs} won (${broke.pct}%)`);
  console.log(`    as it ships:    ${normal.wins}/${normal.runs} won (${normal.pct}%)`);
  console.log(`    bottomless purse: ${rich.wins}/${rich.runs} won (${rich.pct}%)`);
  console.log(`    money is worth ${normal.pct - broke.pct} points of win rate`);
  /* And the course on its own, handed over rather than bought — so the lever
     is measured apart from whether the pilot knows when to pull it. */
  const noCourse = sweep2((run) => { run.course = null; });
  const byCourse = FF.COURSES.map((co) => ({ co, r: sweep2((run) => { run.course = co.id; }) }));
  console.log(`    no course:      ${noCourse.wins}/${noCourse.runs} won (${noCourse.pct}%)`);
  for (const { co, r } of byCourse) {
    console.log(`    ${(co.short + ':').padEnd(16)}${r.wins}/${r.runs} won (${r.pct}%)`);
  }
  const bestCourse = byCourse.reduce((a, z) => (z.r.pct > a.r.pct ? z : a));
  const worstCourse = byCourse.reduce((a, z) => (z.r.pct < a.r.pct ? z : a));
  ok(bestCourse.r.pct >= noCourse.pct - band, 'declaring a course is never worse than declaring none');
  /* And no course may run away with the game. One of them shipped for about
     ten minutes paying its warmth unconditionally and measured 73% against a
     36% baseline — which is not a choice a player makes, it is the answer, and
     the other four become decoration. Twenty points clear of the field is the
     line; a course that crosses it wants tuning, not shipping. */
  ok(bestCourse.r.pct - worstCourse.r.pct <= 20 + band * 2,
    `no course runs away with the run (${bestCourse.co.short} ${bestCourse.r.pct}% vs ${worstCourse.co.short} ${worstCourse.r.pct}%)`);
  console.log(`    (±${band} points is one standard deviation at ${normal.runs} runs an arm — ` +
    `anything inside that band is noise, not a finding)`);
  ok(normal.pct >= broke.pct - band * 2, 'money is never a liability');
  /* This gap USED to be the bar, and it deliberately is not any more.

     When the trader was the only door onto tempering, being penniless cost
     eleven points — which reads as a working economy and is actually a single
     point of failure: miss the one shop node on a map of nine and the run is
     gone. Tempering now lives at a camp and on the reward screen too, so a
     broke caravan still has roads to strength and the number is small on
     purpose. What has to stay big is the LADDER rung: a pilot who spends well
     still has to beat one who does not, and that is checked up in the sweep.
     A bottomless purse is still not the best row, and should not be — spending
     badly has to cost you, or the shop is a tax on patience. */
  ok(true, `money is worth ${normal.pct - broke.pct} points, band ±${band} — reported, not gated`);
}

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
