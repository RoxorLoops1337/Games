// FROSTFELL — the pilot.
//
// The bot that plays whole runs, lifted out of the probe that reads them.
//
// WHY THIS FILE EXISTS, since a 1200-line move is not free: the probe is the
// slowest thing in `npm run check` and the only way to make it faster is to run
// arms concurrently. A worker cannot import the probe — importing it RUNS every
// arm in it, which is the opposite of the goal — so the pilot has to be
// importable on its own. Nothing in here prints, asserts or measures. It plays.
//
// The second half of the same change is that a tweak is now a DESCRIPTOR rather
// than a closure (see applyTweak): a closure cannot cross a worker boundary, and
// every tweak in the probe turned out to be a handful of field assignments and a
// list of card ids anyway.

// FROSTFELL — the playthrough probe.
//
// A bot plays whole runs end to end. It is not a good player: it deploys what
// it can, throws gear at whatever is in front, and rings the bell when it has
// nothing. That is the point — it measures the game, not the pilot, and it
// walks every screen transition a real run walks, which is where the crashes
// hide.
//
// Run: node tests/frostfell_run.test.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { loadGame, ok, eq, done, section } from './frostfell_lib.mjs';

const FF = loadGame();
const G = FF.G;

/* Which cards a pilot actually plays, and which it never touches. A card that
   never gets played across hundreds of runs is either unplayable or invisible,
   and both are the game's problem rather than the bot's. */
const PLAYED = {};
const OFFERED = {};
/* What the caravan was actually HOLDING when the run ended, counted off the
   deck rather than hooked into takeCard — which, like buy() and triggerUnit()
   before it, is called internally and never through the export. Three wrappers
   in three rounds have quietly measured nothing; the rule is now to read state
   rather than to intercept calls. */
const CARRIED = {};
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

/* And what the counter actually sells. A ware nobody buys in a whole run is
   furniture: it wants a reason or it wants cutting, and the only way to tell
   those apart is to know whether the pilot passed it over or never looked.

   Counted where the pilot decides rather than where the game charges: half the
   counter is bought by pressing a button that opens a chooser, so wrapping the
   exported buy() sees three wares out of nine and calls the other six dead. */
/* WHICH FOE GETS THE MOST TURNS.

   The late-zone death table names what landed the killing blow, which is not
   the same question as which foe is doing the most work. A counter-1 foe takes
   five turns for a counter-5 foe's one, and in the front row it takes ten — so
   "who killed the leader" and "who was swinging" can be different animals
   entirely, and only one of them is a balance problem. */
const TRIGGERS = {};

const SOLD = {};
const sale = (kind, did) => { if (did) SOLD[kind] = (SOLD[kind] || 0) + 1; return did; };

/* --------------------------------------------------- the beast, watched --- */
/* Last round's fix gave the Kettle Titan a bounded, visible, reversible heat
   and the death count barely moved. Two explanations fit that: the answer is
   unreachable (a caravan facing it does not hold frost), or the beast is
   simply too big for where it stands. These counters tell them apart. */
const TITAN = { fights: 0, turnsWithFrost: 0, turns: 0, vents: 0, heatAtDeath: [], lost: 0 };
const FROSTERS = Object.values(FF.CARDS)
  .filter((c) => c.type === 'item' && /frost/i.test(c.text || '')).map((c) => c.id);
function watchTitan() {
  const b = G.battle;
  if (!b || b.over) return;
  const titan = FF.enemyUnits(G).find((u) => u.def === 'kettletitan');
  if (!titan) return;
  TITAN.turns++;
  if (b.hand.some((c) => FROSTERS.indexOf(c.def) >= 0)) TITAN.turnsWithFrost++;
}

/* ------------------------------------------------------------- the pilot -- */
function bestSlot() {
  /* READ THE TELEGRAPH FIRST.

     A wave names its lane a turn before it arrives, and anyone standing in that
     lane turns it away — it waits instead of arriving. That is the second EVENT
     on this board — the first being a scheme — and it is the whole reason
     placement might be a decision rather than arithmetic. A pilot that places
     well answers it; one that does not fills the nearest hole. */
  const b = G.battle;
  /* DOES IT CHANGE THE ANSWER? A mechanic that measures neutral on win rate is
     defensible only if it changes what a turn looks like, and that is a
     measurable claim rather than a feeling: count the deployments where a
     telegraph is live, and of those, the ones where reading it puts the body
     somewhere the pilot would not otherwise have put it. */
  const plain = () => {
    for (let col = 0; col < FF.COLS; col++) {
      for (let lane = 0; lane < FF.LANES; lane++) {
        if (FF.slotFree(G, 'p', lane, col)) return { lane, col };
      }
    }
    return null;
  };
  /* SHELTER IS GONE, AND BOTH ITS NUMBERS ARE KEPT — that is the whole value.

     The habit was "keep a fragile body out of the front column", built so the
     aura cards would have a pilot that could use them. Measured twice:

       any body that cannot survive the biggest swing   −7 at the fight rung
                                                        (12/13/36/36 vs 12/20/40/39)
       aura-carriers only                                0, firing 95 times in 360 runs

     Neither version is worth a row in the ablation table. A habit that prices at
     zero is not free: it is a switch every future pilot change has to reason
     around, and it stays in the table forever implying somebody should care.

     The wide reading is the one worth remembering, because it is the THIRD time
     careful placement has cost this pilot points. The front column ticks twice,
     swings go to the front of a lane, and a pilot that keeps bodies out of the
     fighting is a pilot doing less fighting. That is not a quirk of one
     heuristic any more, it is what this board is. */

  if (b && b.waveLane !== undefined && !FF.laneHeldBy(G, b.waveLane)) {
    for (let col = 0; col < FF.COLS; col++) {
      if (FF.slotFree(G, 'p', b.waveLane, col)) {
        if (TELL.on) {
          TELL.live++;
          const other = plain();
          if (!other || other.lane !== b.waveLane || other.col !== col) TELL.moved++;
        }
        return { lane: b.waveLane, col };
      }
    }
  }
  if (TELL.on && b && b.waveLane !== undefined) TELL.live++;
  // Then hold the front of both lanes, then fill in behind.
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
/* CAN A LESSON BE MEASURED AT ALL?

   Last round shipped a teaching change — a scheme that lands in the first zone
   says what would have taken it away — and reported it unmeasured, on the
   grounds that the careless pilot is BLIND rather than slow: it does not deny
   schemes because it never looks, so nothing that makes the decision easier to
   notice can move it. That is a claim about the instrument, and a claim about
   an instrument is testable.

   So: a pilot that plays exactly as carelessly as the careless one, except
   that once the game has TOLD it about a scheme — `run.taught`, set by the
   lesson itself, in the game, not here — it starts taking them away. Against
   two controls: one that is never told, and one that always knew. If the
   middle row sits on the bottom one, the limit is real and now proven rather
   than asserted. If it climbs toward the top one, careless has been the wrong
   floor for five rounds and this is the right one. */
const TAUGHT = { on: false, always: false, room: false };

function botTurn() {
  const b = G.battle;
  if (TAUGHT.on && b && !b.over && (TAUGHT.always || (G.run && (G.run.taught | 0) > 0))) denySchemes();
  /* And the same for the OTHER lesson: a pilot that keeps a slot back once the
     cold has got in and the game has said why. Same shape, different rule —
     which is the only way to find out whether what is worth eleven points is
     being taught, or the particular thing being taught. */
  const heedRoom = TAUGHT.room && (TAUGHT.always || (G.run && (G.run.taughtRoom | 0) > 0));
  /* The room table only ever watched the careful pilot, so the one question
     item 3 asks — what does a beginner's board actually look like — had no
     answer in the output. Same reading, taken on the careless line. */
  if (b && !b.over) {
    const free = FF.freeSlots(G, 'p').length;
    CROOM.free[Math.min(6, free)] = (CROOM.free[Math.min(6, free)] || 0) + 1;
    CROOM.turns++;
  }
  const ui = b.hand.findIndex((c) => c.type === 'unit');
  /* WHAT "KEEPING A SLOT BACK" ACTUALLY MEANS, which is why the room lesson
     measured zero last round.

     This was "do not fill the last slot if two bodies are standing", and the
     careful pilot's version has always been three tests: not while the line is
     THIN, and not while something big is about to land. A pilot holding bodies
     back through a wave it cannot survive is not keeping a slot in reserve, it
     is losing. Taught the crude rule, the careless pilot gained nothing; the
     careful pilot playing ONLY this habit gains five points. Same rule, two
     expressions, and the difference was the whole finding. */
  const lastOne = FF.freeSlots(G, 'p').length <= FF.ROOM_NEEDED;
  const thinLine = FF.playerUnits(G).length <= 2;
  const bigSoon = FF.enemyUnits(G).reduce((n, f) => n + (f.cnt <= 1 ? f.atk : 0), 0) >= 6;
  if (ui >= 0 && !(heedRoom && lastOne && !thinLine && !bigSoon)) {
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
/* WHERE A BODY GOES, now that the front row burns two counters a turn.

   The old version of this put walls at the front and everything else behind,
   and the ablation priced it at NINE POINTS WORSE than filling the nearest
   free slot — a board with no geometry cannot be played well, only fussed
   over. With depth costing and paying, the question is worth asking properly:
   the front is for whatever wants to swing sooner and can take the answer, the
   back is for whatever is slow to come round or too soft to stand there. */
function carefulSlot(card) {
  const d = FF.CARDS[card.def] || {};
  const hp = d.hp || 0, atk = d.atk || 0, cnt = d.cnt || 1;
  // worth putting at the front: hits hard for its counter, and can survive a turn there
  const forward = (atk / Math.max(1, cnt)) >= 1.2 && hp >= 8;
  const lanes = [0, 1].sort((a, z) => threatOf(z) - threatOf(a));
  const cols = forward ? [0, 1, 2] : [2, 1, 0];
  for (const lane of lanes) {
    for (const col of cols) if (FF.slotFree(G, 'p', lane, col)) return { lane, col };
  }
  for (const lane of lanes) for (const col of [0, 1, 2]) if (FF.slotFree(G, 'p', lane, col)) return { lane, col };
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
    /* EVERY ALLY-TARGETED CARD USED TO BE SCORED AS IF IT WERE A HEAL.

       Ranked by plays per copy CARRIED — which is the number about the card,
       rather than raw plays, which is a number about how often the pool offers
       it — the bottom of the table was Thorn Oil at 2.75 and Patch Kit at 2.99
       against a top of eleven. Neither is a heal.

       Thorns is retaliation: it wants whatever is about to be HIT, which is a
       soaker or the front of a lane with something swinging into it, and has
       nothing to do with who is most wounded. Shell is damage prevented, which
       the scoring counted as nothing at all. Both were unplayable by a pilot
       that could only ask "who is hurt?". */
    const incoming = (x) => theirs.reduce((n, f) => {
      if (f.cnt > 2) return n;                       // not swinging soon
      const t2 = FF.targetFor(G, f);
      return t2 && t2.uid === x.uid ? n + f.atk : n;
    }, 0);
    if (/thorns/i.test(d.text || '')) {
      const best = mine.slice().sort((a, z) => incoming(z) - incoming(a))[0];
      const hit = best ? incoming(best) : 0;
      return { t: best, worth: hit >= 3 ? 2 + hit * 0.4 : 0 };
    }
    if (/shell/i.test(d.text || '')) {
      // worth the mending on somebody hurt, plus the blow it turns aside
      const soon = mine.slice().sort((a, z) =>
        (incoming(z) + (1 - z.hp / z.maxHp) * 4) - (incoming(a) + (1 - a.hp / a.maxHp) * 4))[0];
      const val = soon ? incoming(soon) * 0.5 + (1 - soon.hp / soon.maxHp) * 4 : 0;
      return { t: soon, worth: val >= 2 ? val : 0 };
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
/* WHICH PARTS OF PLAYING WELL ARE WORTH ANYTHING.

   The fight has been the weakest rung of the ladder for four rounds. Rather
   than guess at what to add, this switches each of the careful pilot's fight
   habits off one at a time and re-runs the sweep: whatever the pilot can stop
   doing without losing win rate was never a decision in the first place. */
const ROOM = { plays: 0, declined: 0, packed: 0, spare: 0, free: [], efree: [] };
const CROOM = { turns: 0, free: [] };
const DUCKS = { forks: 0, taken: 0, wound: 0, bar: 0.22 };
const LANE = { on: false, by: {} };
const TELL = { on: false, live: 0, moved: 0, held: 0, fights: 0, turns: 0, allTurns: 0, lastB: null, lastHeld: 0 };
const SKILL = { deny: true, reposition: true, holdGear: true, keepSlot: true, wave: true, place: true };
const HABITS = [
  ['deny', 'denying schemes'],
  ['reposition', 'repositioning at all (removed)'],
  ['holdGear', 'holding gear until it earns the turn'],
  ['keepSlot', 'keeping a slot in reserve'],
  ['wave', 'calling waves early (removed)'],
  ['place', 'filling the front of both lanes first'],
];

/* Taking away what a foe has committed to, with free moves only. Lifted out of
   the careful pilot so a pilot that has been TAUGHT can do this one thing and
   nothing else — which is the only way to price a lesson. */
function denySchemes() {
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
}

function carefulTurn() {
  if (G.battle && !G.battle.over) {
    /* Read off the board rather than hooked into the engine: triggerUnit is
       called internally, so wrapping the export sees none of it. This counts
       each living foe's SHARE of a turn — its tick rate over its counter — and
       the damage that share is worth, which is the question anyway. */
    for (const u of FF.enemyUnits(G)) {
      const rate = (u.col === 0 ? 2 : 1) / Math.max(1, u.cntMax);
      const t = TRIGGERS[u.def] || (TRIGGERS[u.def] = { fires: 0, dmg: 0 });
      t.fires += rate;
      t.dmg += rate * u.atk;
    }
    const free = FF.freeSlots(G, 'p').length;
    if (free) ROOM.spare++; else ROOM.packed++;
    ROOM.free[Math.min(6, free)] = (ROOM.free[Math.min(6, free)] || 0) + 1;
    /* PER RUN as well as globally, because the global histogram cannot answer
       the question the room-rule finding rests on: do the decks that WIN stand
       on emptier boards? That needs the number attributed to the run that
       produced it, and one running mean is the whole cost. */
    RUNROOM.turns++; RUNROOM.free += free;
    if (FF.hasRoom(G, 'p')) RUNROOM.warm++;
    /* AND THE OTHER SIDE OF THE TABLE, which the first cut of this forgot to
       look at. The room rule is symmetric — it has always applied to the foes
       too — so moving the bar from one gap to two changes the fight for
       whichever line is fuller, and it is not the player's. */
    const ef = FF.freeSlots(G, 'e').length;
    ROOM.efree[Math.min(6, ef)] = (ROOM.efree[Math.min(6, ef)] || 0) + 1;
  }
  const b = G.battle;

  /* Read what the foes have said they will do, and take it away — all of it
     with free moves, so a pilot that looks at the board pays nothing for it.
     A pilot that does not look eats a double lunge and a frozen lane. */
  if (SKILL.deny) denySchemes();

  /* CAN THIS CARAVAN ANSWER A NAMED WAVE AT ALL?

     The front-slot-only telegraph was worth +8 to a run carrying no course and
     nothing to any of the five, and shipping around it left the reading
     unexplained. The suspicion it points at predates the telegraph: a course
     narrows the pool, and a narrowed pool may not hold enough BODIES for the
     board's own geometry. So count, on every turn a telegraph is live, whether
     the lane is already held and whether the pilot could hold it if it wanted
     to — a creature in hand and a free slot in the named lane. Broken out by
     course, against a run that declared none. */
  if (LANE.on && b.waveLane !== undefined) {
    const co = (G.run && G.run.course) || 'none';
    const r = LANE.by[co] || (LANE.by[co] = { live: 0, held: 0, could: 0, bodies: 0 });
    r.live++;
    const held = FF.laneHeldBy(G, b.waveLane);
    if (held) r.held++;
    const spare = [0, 1, 2].some((col) => FF.slotFree(G, 'p', b.waveLane, col));
    const inHand = b.hand.some((c) => c.type === 'unit');
    if (held || (spare && inHand)) r.could++;
    r.bodies += FF.playerUnits(G).length;
  }

  /* THE LEADER DOES NOT BELONG AT THE BACK.

     "Always park the leader in column three" was in this pilot from the first
     round and priced at MINUS SEVEN once the ablation was run at a sample that
     could see it — the worst habit in the list by a distance. It is obvious in
     hindsight: the leader is usually the strongest thing the caravan owns, the
     front row burns two counters a turn, and a leader kept out of reach is a
     leader that never swings. Safety was costing more than it saved.

     What survives is the opposite instinct — walk it forward when it is healthy
     and the line can cover it — kept behind the same switch so the ablation can
     keep pricing it. */
  /* And walking it forward priced at minus three once the rest of the pilot was
     cleaned up, so that goes too: the leader is left exactly where it lands and
     the pilot does no repositioning at all. Both directions of the same habit
     have now been measured and neither is a decision. */
  if (SKILL.reposition) for (const u of FF.playerUnits(G)) {
    if (false) {
      // (kept as a switch so the ablation still has a row to price)
    }
    /* AND THAT IS ALL THE REPOSITIONING THE PILOT DOES.

       Shuffling wardens about after they are down priced at or below zero for
       three rounds and survived two rewrites — first as a rule about health
       (pull whoever is hurt), then as a rule about the clock (a long wait is
       wasted at the front). Both measured −1 to −3, inside the noise either
       way. The verdict is in and it is not a decision: WHERE A BODY GOES DOWN
       is the question the geometry asks, and it is asked once, at deployment.
       The free move after that is a convenience — for stepping out of a lunge,
       which the scheme-denial habit already covers, and for tidying up. Keeping
       a habit in the pilot that the instrument says is worth nothing would be
       dressing the measurement rather than reading it. */
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
  if (!SKILL.holdGear && bestI >= 0 && FF.playCard(G, bestI, bestT)) return;
  if (bestI >= 0 && bestW >= 6 && FF.playCard(G, bestI, bestT)) return;

  /* Filling the last slot costs the whole line its warmth and hands somebody
     frostbite, and it takes away the room to step out of a lunge. A pilot
     that reads the board keeps one slot back unless the body is worth more
     than the room — which it is when the line is thin or something big is
     about to land. */
  /* WHICH BODY, AND WHETHER TO WAIT.

     A hoarding card is worth more every turn it stays in hand, and the pilot
     used to deploy whatever unit came first — which meant Keepsake sat at the
     bottom of the usage table and the excuse was that the instrument could not
     test it. Now it can: hold a hoarder while the board can spare it, and put
     it down the moment it is capped or the line actually needs a body. */
  const units = b.hand.map((c, i) => ({ c, i })).filter((x) => x.c.type === 'unit');
  const banked = (x) => (x.c.kw && x.c.kw.hoard ? x.c.kw.hoard : 0);
  const standing = FF.playerUnits(G).length;
  const worthWaiting = (x) => banked(x) > 0 && (x.c.held || 0) < FF.HOARD_CAP && standing >= 3;
  const ready = units.filter((x) => !worthWaiting(x));
  // deploy the fattest hoard first when several are ready, else anything
  ready.sort((a, z) => (banked(z) * (z.c.held || 0)) - (banked(a) * (a.c.held || 0)));
  const ui = ready.length ? ready[0].i : (units.length && standing < 3 ? units[0].i : -1);
  if (ui >= 0) {
    // the decision point moved with the rule: with ROOM_NEEDED free slots, one
    // more body is the one that costs the line its warmth
    const last = FF.freeSlots(G, 'p').length <= FF.ROOM_NEEDED;
    const thin = FF.playerUnits(G).length <= 2;
    const pressed = FF.enemyUnits(G).reduce((n, f) => n + (f.cnt <= 1 ? f.atk : 0), 0) >= 6;
    /* HOW OFTEN THE QUESTION IS EVEN ASKED.

       "Keeping a slot in reserve" priced at exactly +0 at 750 runs an arm, band
       ±1.5 — a measured zero rather than a noisy one. But a habit can read zero
       two ways: because doing it is worth nothing, or because the moment to do
       it never comes. These two counters tell them apart, and nothing else can. */
    ROOM.plays++;
    if (last && !thin && !pressed) ROOM.declined++;
    if (!SKILL.keepSlot || !last || thin || pressed) {
      /* And "place bodies where they will be hit" priced at minus four against
         simply filling the nearest free slot, across two rewrites of the
         heuristic. The front of both lanes first is not a fallback any more,
         it is the answer: it puts bodies where the swings are and lets the
         geometry do the rest. */
      const slot = SKILL.place ? bestSlot() : carefulSlot(b.hand[ui]);
      if (slot && FF.playCard(G, ui, slot)) return;
    }
  }
  if (bestI >= 0 && FF.playCard(G, bestI, bestT)) return;

  /* Calling a wave early priced at minus three. A wave pulled onto a set board
     is half a wave in theory and a turn spent not killing anything in practice,
     and the clock brings it along soon enough by itself. Kept behind the switch
     so the next round can see whether that is still true. */
  /* Calling a wave early has now been measured at 210 runs an arm in both
     directions and cost five points both times: it is a turn spent not killing
     anything, and the clock brings the wave along soon enough by itself. Out,
     like the repositioning — but kept behind the switch, because the sign of a
     habit depends on the rest of the pilot and this one has flipped before. */
  if (false && SKILL.wave && b.waves && b.waves.length &&
      FF.enemyUnits(G).length <= 1 && FF.playerUnits(G).length >= 3) {
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
    /* A TAUNT WAS WORTH +6 HERE FOR ONE MEASUREMENT, on the reasoning that Soak
       had just become the only answer to Aimless. It went back out again. With
       the pilot chasing a soaker, Mitewing's share of late deaths fell from 33%
       to 25% — and the top rung fell from 37 to 30 with it, which is the more
       important number. A taunt does not prevent damage, it CONCENTRATES it:
       one warden takes everything instead of the line spreading it out and the
       room rule mending all of it. Making Soak beat Aimless is a fairness fix,
       not a power one, and the pilot is not told to go looking for it. */
  } else {
    s += 5;                                        // gear is a turn that does something
    if (d.target === 'none') s += 1;
  }
  /* Weighting the pick by what the caravan is short of priced at +1, inside the
     band. The read stays on the trail, the reward screen and the trader —
     telling a PLAYER what their deck lacks is worth doing whether or not a
     scoring rule can use it — but the pilot no longer pretends it is a
     tiebreaker it can measure. */
  const need = (DRAFT.read && false) ? FF.caravanNeeds(G.run) : null;
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
/* THE SAME TREATMENT FOR THE REWARD SCREEN.

   Steering the pool collapsed to one point the moment the courses were levelled,
   which either means its levers were never worth much or that one of them was
   carrying the rest. The fight ablation found three habits actively costing
   points; there is no reason to assume this rung is cleaner. */
const DRAFT = { redeal: true, temper: true, pass: true, read: true, course: true };
const DRAFT_HABITS = [
  ['redeal', 'buying a fresh offer'],
  ['temper', 'tempering instead of taking'],
  ['pass', 'walking on when the caravan wants nothing'],
  ['read', 'picking what the caravan is short of'],
  ['course', 'declaring a course at all'],
];

function draftTurn(r) {
  const run = G.run;
  /* Eat first. A meal is bought out of the scrip the fight just paid, it costs
     no card and no node, and it is the only thing on this screen that makes the
     caravan stronger without making the deck bigger — so a pilot that has the
     price in hand takes it every time before it decides anything else. */
  if (run.gold >= FF.mealPrice(run) && FF.feedable(run).length) {
    const m0 = run.meals || 0;
    FF.press('rewardMeal');
    pickBiggest();
    sale('meal', (run.meals || 0) > m0);
    return;
  }
  const i = draftPick(r.cards);
  const worth = cardWorth(r.cards[i]);
  // an offer worth less than the price of a fresh one
  const rd = FF.redealPrice(run);
  /* Buying a fresh offer priced at +1 against a band of 2.2 — the scrip is
     worth more in the trader's hands than in a redeal, and the pool is good
     enough that three cards you dislike are rarely three cards you cannot use.
     The button stays in the game; the pilot stops reaching for it. */
  if (false && DRAFT.redeal && worth < 9 && run.gold >= rd + 20 && (run.redeals || 0) < 3) { FF.press('rewardRedeal'); return; }
  /* Whether to take a card is a question about the DECK, not about the card.
     Keying it on how good the offer looked made the pilot measurably worse the
     moment offers improved — better cards, more of them taken, a fatter deck,
     a worse draw. A caravan that is not short of anything and is already
     twelve cards deep walks on and keeps the scrip. */
  const need = FF.caravanNeeds(run);
  /* A caravan that is not short of anything wants its cards harder, not more
     of them — and the reward screen will now trade the whole offer for that. */
  /* And tempering instead of taking flipped from +5 to MINUS EIGHT the moment
     the temper cap came down from four to three. That is not noise, it is the
     two changes interacting: with only three tempers in a whole run, spending a
     reward on one is spending a card to move a number you were going to reach
     at the trader anyway. Out of the pilot; still on the screen, where a player
     who has not been to a trader in three steps should absolutely reach for it. */
  if (false && DRAFT.temper && !need && run.deck.length >= 9 && FF.temperable(run).length) {
    FF.press('rewardTemper');
    pickBiggest();
    return;
  }
  /* And WALKING ON priced at minus four — the worst habit on this screen. It
     was put in two rounds ago on the reasoning that a fat deck draws badly, and
     that reasoning is sound; what was wrong was doing it for scrip rather than
     for the deck. Tempering already covers the "I want strength, not breadth"
     case and pays five points for it, so passing is now only for a deck that is
     genuinely too fat to draw. */
  /* The other half of the same habit, missed the first time and still priced at
     minus five: even a fifteen-card deck is better off taking a card than
     walking past one. Passing is a button on the screen, not a plan. */
  if (false && DRAFT.pass && run.deck.length >= 15 && worth < 14) { FF.press('rewardSkip'); return; }
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
/* SCARS OFF, AS A CONTROL.

   Last round gave the scar rule a reason to exist and named it as the likely
   cause of two things — the careless pilot losing a point and Cold running away
   with the course table — without testing either. This is the test: the same
   pilots on the same seeds, with every scar wiped the moment it is handed out,
   so the only difference between the two samples is that one rule.

   Done here rather than behind a flag in the game, because a difficulty knob
   that exists only for the instrument is a knob that eventually ships. */
/* SPENDING THE SPEED.

   Gating the particle systems on having a canvas took this suite from 26.7s to
   9.4s, and for one round nothing was done with the headroom. The default
   sample was eight runs a tribe — twenty-four an arm, a band of ±9.7 — which
   meant every number the suite printed on an ordinary `npm run check` was one
   it could not stand behind, including the two it GATES on.

   Thirty is where it lands: ninety runs an arm, a band of ±5.0, and the whole
   suite in 24 seconds — 3.75x the sample in LESS wall time than the old suite
   took at ±9.7. It is still not enough to settle a habit, which is what
   FF_ABLATE is for; it is enough that a gate which fails means something. */
/* An error function, because the card arm needs a normal tail to work out what
   a family-wise bar actually is and Math does not carry one. Abramowitz &
   Stegun 7.1.26 — five figures, which is four more than a threshold needs. */
function erf(x) {
  const sgn = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sgn * y;
}
/* THE PROBE DOES NOT RELOAD ITS RUNS, so every save it writes is work nobody
   reads. Profiling put `saveRun` at the top of the flame graph — 7.6% of the
   whole probe, serialising a deck, a trail and a log on every state change to a
   localStorage stub. Muted here and nowhere else: the save/load suites do not
   touch this flag, so they still test the real thing. */
FF.store.mute = true;


/* EVERY ARM PLAYS THE SAME GAME, WHICH IT HAD NEVER DONE.

   `playRun(tribe, seed, mode)` was not a function of its arguments. Unlocks
   accumulate in `G.meta.found` as runs finish, and `cardPool` filters on it, so
   a run's OFFER depended on how many runs that thread had already played. Two
   consecutive plays of seed 4242 came out at 100 turns and 25.

   That is not a small thing, because the ladder runs its four arms in sequence:
   careless went first with 3 things unlocked and careful went last with 12, so
   part of every rung this file has ever printed was the unlock state rather than
   the pilot. It also explains the round-to-round rung volatility documented for
   six iterations — the arms were never paired on identical trails, only on
   identical seeds.

   The existing `a seed is a promise` check passed throughout, because it runs at
   the very END of the probe where the meta has already saturated and stopped
   changing. A determinism check placed where determinism is trivially true.

   So the meta is saturated up front. Every card and every tribe is available to
   every arm from the first run, which is both the honest comparison and what a
   player who has unlocked the game sees. It also makes a run independent of
   every other run, which is what lets the ladder be pooled at all. */
for (const u of FF.UNLOCKS) {
  G.meta.found[u.id] = true;
  if (u.kind === 'tribe' && G.meta.unlocked.indexOf(u.id) < 0) G.meta.unlocked.push(u.id);
}
const DEFAULT_N = 30;
const NO_SCARS = !!process.env.FF_NOSCARS;
function stripScars(run) {
  if (!run) return;
  for (const c of run.deck.concat([run.leader])) {
    if (!c.charms.some((id) => FF.SCARS[id])) continue;
    c.charms = c.charms.filter((id) => !FF.SCARS[id]);
    FF.rebuildCard(c);
  }
}

const MEND = { on: false, by: {}, hurt: 0, last: null, where: 'start' };
/* Reset at the top of every run and folded into that run's stat at the bottom;
   it is deliberately NOT one of the merged COUNTERS, because it is per-run
   state rather than an accumulating total. */
const RUNROOM = { turns: 0, free: 0, warm: 0 };
const wounds = () => (G.run ? G.run.deck.concat([G.run.leader])
  .filter((c) => c.type === 'unit').reduce((n, c) => n + (c.dmg || 0), 0) : 0);

/* A TWEAK IS A DESCRIPTOR, NOT A CLOSURE.

   Every arm in the probe that bends a run did it by passing a function, and a
   function cannot be posted to a worker. It turned out none of them needed to
   be one: sixteen call sites between them did field assignments, pushed a list
   of card ids onto the deck, and in one case tempered the front of it. So that
   is the whole vocabulary, and it survives `structuredClone`.

   Keeping the shape small is deliberate. The moment this grows an `each` or a
   `where` it is a closure again with extra steps, and the refactor it paid for
   is undone. If an arm needs something this cannot say, add a NAMED field here
   and say what it means — do not add an escape hatch. */
function applyTweak(run, spec) {
  if (!spec) return;
  if (spec.set) Object.assign(run, spec.set);
  if (spec.give) for (const id of spec.give) if (FF.CARDS[id]) run.deck.push(FF.mkCard(id));
  if (spec.temper) for (const c of run.deck.slice(0, FF.TEMPER_CAP)) FF.temperCard(G, c);
}

function playRun(tribe, seed, mode, tweak) {
  // A cumulative ladder: each pilot is the one above it plus one more thing it
  // knows how to do, so the difference between two rows is that one thing.
  const careful = mode !== 'careless';                       // plays the fight
  const shops = mode === 'trader' || mode === 'careful';     // spends well
  const drafts = mode === 'careful';                         // steers the offers
  FF.newRun(G, tribe, seed);
  // A pilot that steers the pool declares a course at the leader screen, the
  // way a player does — before anything is known except which leader it took.
  if (mode === 'careful' && DRAFT.course) G.run.course = courseWanted();
  applyTweak(G.run, tweak);
  MEND.last = null; MEND.where = 'start';
  RUNROOM.turns = 0; RUNROOM.free = 0; RUNROOM.warm = 0;
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
    /* WHERE THE MENDING COMES FROM.

       "Damage is not a pressure in this game" was last round's closing line and
       its biggest finding: the line is 7% wounded at the forks where it should
       be deciding, which means every rule ever written that pays in mending was
       dead on arrival. Four sources were blamed by name — camps, meals,
       mend-all, warmth — without anybody counting them, and the list turned out
       to be wrong: a warden that FALLS has its damage wiped to nought, and
       winning a fight clears Hurt.

       Counted the way the charms were counted: read the wound total on every
       pass of the loop and attribute the change to whatever screen the caravan
       was standing on. No hooks, no game knobs — see "read state, don't
       intercept calls". */
    if (MEND.on) {
      const w = wounds();
      if (MEND.last !== null) {
        const d = MEND.last - w;
        /* Attribute the change to the TRANSITION, not to the screen it is
           standing on now. A fight ending is measured on the first pass after
           the battle screen goes away, so bucketing by current screen buried
           the fallen-come-back-whole wipe inside the warmth number. */
        const bucket = (MEND.where === 'battle' && G.screen !== 'battle')
          ? 'a fight ENDING (the fallen come back whole)'
          : (MEND.where === 'battle' ? 'inside a fight (warmth and gear)' : MEND.where);
        if (d > 0) MEND.by[bucket] = (MEND.by[bucket] || 0) + d;
        else if (d < 0) MEND.hurt -= d;
      }
      MEND.last = w;
      /* And the in-fight bucket has to be split, because two very different
         things live in it: warmth and gear mending turn by turn, and a fight
         ENDING — where every fallen warden's damage is wiped to nought and a
         beast pays a night's rest on top. The first is a rule you can tune; the
         second is the one nobody had noticed. */
      MEND.where = G.screen;
    }
    if (NO_SCARS) stripScars(G.run);
    if (G.screen === 'victory') {
      stat.won = true;
      stat.endPower = FF.caravanPower(G.run); stat.fought = G.run.fights || 0;
      stat.endGold = G.run.gold; stat.walked = G.run.zone * FF.TRAIL_STEPS + G.run.step;
      stat.cards = G.run.deck.length; stat.temp = FF.tempered(G.run); stat.meals = G.run.meals || 0;
      for (const c of G.run.deck) CARRIED[c.def] = (CARRIED[c.def] || 0) + 1;
      break;
    }
    // Where a run ends is as much the measure as whether it ends: a game whose
    // deaths all pile up in one zone has one wall in it, not three.
    if (G.screen === 'gameover') {
      stat.diedZone = G.run ? G.run.zone : 0;
      if (G.run) {
        stat.endPower = FF.caravanPower(G.run); stat.fought = G.run.fights || 0;
        stat.endGold = G.run.gold; stat.walked = G.run.zone * FF.TRAIL_STEPS + G.run.step;
        stat.cards = G.run.deck.length; stat.temp = FF.tempered(G.run); stat.meals = G.run.meals || 0;
        for (const c of G.run.deck) CARRIED[c.def] = (CARRIED[c.def] || 0) + 1;
      }
      // The run already remembers the blow that took the leader, by name. What
      // it never did was count them: one death is an anecdote, two hundred is
      // a design note.
      stat.killedBy = (G.run && G.run.killedBy && G.run.killedBy.name) || 'the cold';
      break;
    }
    stat.zone = Math.max(stat.zone, G.run ? G.run.zone : 0);
    if (G.screen === 'trail') {
      const step = G.run.trail[G.run.step];
      let idx = step.length > 1 ? (seed + G.run.step) % step.length : 0;
      /* Two arms that differ in one thing only: what they do at a fork that has
         a fight on one side of it. Everything else about the pilot is the same,
         so the gap between them is the price of walking past a fight. */
      if (step.length > 1 && (G.run.dodge || G.run.seek || G.run.duckHurt)) {
        const fighty = (n) => n.kind === 'fight' || n.kind === 'elite' || n.kind === 'boss';
        /* A THIRD ARM, because the first two cannot price a situational choice.

           The quiet road — a camp reached by walking past a fight mends the
           whole line — shipped unmeasured, and the note said why: a pilot that
           ducks EVERYTHING never arrives at a fork hurt, so it never gets to
           want the mend. The fix is the same one that priced the lesson. This
           pilot takes every fight it is offered until the caravan is actually
           hurt, and then takes the quiet road if the quiet road leads to a
           camp. If that is worth nothing, the quiet road is a sentence attached
           to nothing and should be said so. */
        let want;
        if (G.run.duckHurt) {
          const line = G.run.deck.concat([G.run.leader]).filter((cd) => cd.type === 'unit');
          const wounded = line.reduce((n, cd) => n + (cd.dmg || 0), 0);
          const pool = line.reduce((n, cd) => n + (cd.hp || 0), 0) || 1;
          const sore = wounded / pool > DUCKS.bar;
          /* The quiet road pays at a camp, a rest stop and a shrine now, not
             at a camp alone — so the pilot takes any of the three. The first
             cut of this looked for a camp only and ended up playing the same
             run as the fighter: same cards, same meals, same arrival power,
             which is the tell that a pilot is not exercising the choice. */
          const QUIET = { camp: 1, rest: 1, shrine: 1 };
          /* AND WHAT A PLAYER WOULD ACTUALLY DUCK FOR.

             Ducking on damage alone almost never fires: the line is SEVEN PER
             CENT wounded at the forks that offer the choice, because camps,
             meals, mend-all and the room rule's warmth clear damage faster than
             it accrues. Mending is not scarce, so a rule paid in mending cannot
             be a decision.

             What IS scarce is the blessing — three tempered cards a run and no
             more — so a shrine on the quiet road, which sends back two, is
             worth ducking for whether or not anybody is hurt. That is the
             version of the choice a player would actually make. */
          const canBless = FF.tempered(G.run) < 3;
          const worthIt = (n) => QUIET[n.kind] && (sore || (n.kind === 'shrine' && canBless));
          want = step.findIndex(worthIt);
          if (want < 0) want = step.findIndex(fighty);
          /* The denominator that means something: forks where a fight sits
             opposite a quiet stop, which is the only place the rule can apply.
             Counting ALL forks made a 3% look like the rule never fires, when
             what it actually says is that the caravan is rarely hurt enough at
             the moment the choice is offered. */
          if (step.some(fighty) && step.some((n) => QUIET[n.kind])) {
            DUCKS.forks++;                                   // this arm only
            DUCKS.wound += wounded / pool;
            if (want >= 0 && QUIET[step[want].kind]) DUCKS.taken++;
          }
        } else {
          want = step.findIndex((n) => (G.run.dodge ? !fighty(n) : fighty(n)));
        }
        if (want >= 0) idx = want;
      }
      FF.enterNode(G, idx);
    } else if (G.screen === 'battle') {
      if (G.battle.turn === 0) stat.battles++;
      if (G.battle.over) { FF.drainAll(); continue; }
      if (G.battle.units.some((u) => u.def === 'kettletitan' && u.alive)) {
        if (!stat.sawTitan) { stat.sawTitan = true; TITAN.fights++; }
        watchTitan();
      }
      /* Waves held, counted across battles and across BOTH pilots — the first
         cut of this sat inside the careful turn, so the careless arm reported
         0.00 held waves a fight and that read as a finding. It was an
         instrument that never ran. */
      if (TELL.on) {
        const tb = G.battle;
        if (TELL.lastB !== tb) {
          TELL.held += (TELL.lastHeld || 0);
          TELL.lastB = tb; TELL.lastHeld = 0; TELL.fights++;
        }
        TELL.lastHeld = tb.laneHeld || 0;
        if (tb.waveLane !== undefined) TELL.turns++;
        TELL.allTurns++;
      }
      if (careful) carefulTurn(); else botTurn();
      stat.turns++;
      if (G.battle.turn > 160) return Object.assign(stat, { stuck: true });
    } else if (G.run && G.run.lockDeck && (G.screen === 'reward' || G.screen === 'shop')) {
      // a locked run takes nothing and buys nothing: the deck it set out with
      // is the deck it fights the whole trail with
      if (G.screen === 'shop') FF.press('leaveShop');
      else FF.press('rewardSkip');
    } else if (G.screen === 'reward') {
      const r = G.ui.reward;
      if (r.cards.length && !r.taken && drafts) draftTurn(r);
      else if (r.cards.length && !r.taken) FF.press('reward', 0);
      else if (r.charms.length && !r.charmTaken) {
        /* WHICH WARDEN GETS IT.

           This used to fall through to settleChoosers, which picks the first
           name on the list every time — the leader. That was harmless while a
           warden could wear any number and became the whole story the moment
           two was the limit: every charm after the second landed on a leader
           who had no room and simply threw one away. The pilot was measuring
           a cap by refusing to spread, which is not what a player does.

           So: the biggest warden that still has a place. */
        FF.press('rewardCharm', 0);
        if (FF.UI.choose) {
          const items = FF.UI.choose.items;
          let bi = 0, bs = -1;
          items.forEach((it, k) => {
            const cd = it.card;
            if (!cd) return;
            const sc = cd.hp + cd.atk * 2;
            if (sc > bs) { bs = sc; bi = k; }
          });
          FF.UI.choose.onPick(bi);
        }
        settleChoosers();
      }
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
      /* WHERE THE PURSE ACTUALLY GOES.

         A bottomless purse wins 61% against 38% as it ships, and until now the
         only thing measured was that the gap exists. `run.noBuy` takes ONE
         thing off the counter for a rich pilot, so the twenty-three points can
         be split by what bought them instead of guessed at. It is a property of
         the PILOT, not the game — nothing in index.html knows about it. */
      const can = (w) => !(G.run.noBuy && G.run.noBuy[w]);
      /* AND THE ARM RUN THE OTHER WAY. Removing one ware from a rich pilot
         found the charms; it left eighteen points unexplained and the note
         called them "permanent power compounding", which is a phrase and not a
         finding. So: give a POOR pilot exactly one ware, free, and see which
         single thing closes the most of the gap. Free means the scrip for that
         purchase appears and nothing else does. */
      const gift = (w, price) => {
        if (G.run.freeWare === w && G.run.gold < price) G.run.gold = price;
      };
      gift('bell', s.bell ? s.bell.price : 0);
      gift('heal', s.heal.price);
      gift('temper', s.temper ? s.temper.price : 0);
      gift('burn', s.burn ? s.burn.price : 0);
      gift('sigil', s.sigil ? s.sigil.price : 0);
      gift('charm', s.charms.length ? s.charms[0].price : 0);
      gift('meal', FF.mealPrice(G.run));
      gift('card', s.cards.length ? Math.min(...s.cards.map((cc) => cc.price)) : 0);
      /* A careful shopper spends on what does not make the deck bigger. That
         is not a style preference: with money buying only cards, "everything
         free" measured WORSE than penniless, because every purchase was one
         more card between the caravan and the card it wanted. */
      // a bell is the biggest thing money can buy and the only thing she alone has
      if (shops && can('bell') && s.bell && !s.bell.sold && G.run.gold >= s.bell.price) {
        sale('bell', FF.buy(G, 'bell')); bought = true;
      }
      if (!bought && shops && can('heal') && !s.heal.sold && G.run.gold >= s.heal.price &&
          G.run.deck.some((cd) => cd.dmg > 0 || cd.injured)) {
        sale('heal', FF.buy(G, 'heal')); bought = true;
      }
      if (!bought && shops && can('temper') && s.temper && !s.temper.sold && G.run.gold >= s.temper.price &&
          FF.temperable(G.run).length) {
        const t0 = FF.tempered(G.run);
        FF.press('buyTemper');
        pickBiggest();
        sale('temper', FF.tempered(G.run) > t0);
        bought = true;
      }
      if (!bought && shops && can('burn') && s.burn && !s.burn.sold && G.run.gold >= s.burn.price && G.run.deck.length > 10) {
        const n0 = G.run.deck.length;
        FF.press('buyBurn');
        settleChoosers();
        sale('burn', G.run.deck.length < n0);
        bought = true;
      }
      /* A SIGIL, which the pilot had never once looked at. It marks a warden to
         stand before the bell and takes it out of the draw pile — a free
         deployment every fight for the rest of the run AND a thinner deck, from
         one purchase. The pilot not buying it was never evidence about the
         ware; it was evidence about the pilot. */
      if (!bought && shops && can('sigil') && s.sigil && !s.sigil.sold && G.run.gold >= s.sigil.price &&
          G.run.deck.some((cd) => cd.type === 'unit' && !cd.sigil)) {
        const g0 = G.run.deck.filter((cd) => cd.sigil).length;
        FF.press('buySigil');
        pickBiggest();
        sale('sigil', G.run.deck.filter((cd) => cd.sigil).length > g0);
        bought = true;
      }
      /* A CHARM, the other ware the pilot had never looked at. It is the only
         thing on the counter that makes an existing card better in a way a
         meal cannot — a counter off, an attack on — and it adds no card. */
      if (!bought && shops && can('charm')) {
        for (let i = 0; i < s.charms.length; i++) {
          if (s.charms[i].sold || G.run.gold < s.charms[i].price) continue;
          const best = G.run.deck.concat([G.run.leader])
            .filter((cd) => cd.type === 'unit')
            .sort((a, z) => (z.hp + z.atk * 2) - (a.hp + a.atk * 2))[0];
          if (!best) break;
          sale('charm', FF.buy(G, 'charm', i, best.uid));
          settleChoosers();
          bought = true; break;
        }
      }
      /* And tending a hurt, which is only ever worth anything when something in
         the caravan is actually carrying a scar. */
      if (!bought && shops && s.scar && !s.scar.sold && G.run.gold >= s.scar.price) {
        const scarred = G.run.deck.concat([G.run.leader])
          .find((cd) => cd.charms.some((id) => FF.SCARS[id]));
        if (scarred) { sale('scar', FF.buy(G, 'scar', 0, scarred.uid)); bought = true; }
      }
      /* And then she feeds whoever is biggest, for as long as the purse holds.
         Four transcripts walked out of a shop with a full purse because there
         was nothing left on the counter that did not add a card; a meal is the
         thing that was missing, so a pilot who spends well now spends it all. */
      if (!bought && shops && can('meal') && G.run.gold >= FF.mealPrice(G.run) && FF.feedable(G.run).length) {
        const m0 = G.run.meals || 0;
        FF.press('buyMeal');
        pickBiggest();
        sale('meal', (G.run.meals || 0) > m0);
        bought = true;
      }
      // only then a card, and only if the caravan is actually short of one
      const wants = FF.caravanNeeds(G.run);
      for (let i = 0; !bought && can('card') && i < s.cards.length; i++) {
        if (s.cards[i].sold || G.run.gold < s.cards[i].price) continue;
        if (shops && !wants && G.run.deck.length >= 12) continue;
        sale('card', FF.buy(G, 'card', i));
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
      if (!bought && !s.heal.sold && G.run.gold >= s.heal.price) {
        sale('heal', FF.buy(G, 'heal')); bought = true;
      }
      /* A press that changes nothing is how a shop becomes an infinite loop —
         it already has been, twice. If a visit thinks it bought something but
         the counter looks exactly as it did, walk out. */
      const fingerprint = JSON.stringify([G.run.gold, s.cards.map((cc) => cc.sold), s.heal.sold,
        s.temper && s.temper.sold, s.burn && s.burn.sold, G.run.deck.length, G.run.meals || 0,
        s.sigil && s.sigil.sold, s.scar && s.scar.sold, s.charms.map((cc) => cc.sold)]);
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
  stat.freeAvg = RUNROOM.turns ? RUNROOM.free / RUNROOM.turns : 0;
  stat.warmShare = RUNROOM.turns ? RUNROOM.warm / RUNROOM.turns : 0;
  return stat;
}

/* ---------------------------------------------- carrying counters home --- */
/* WHY THIS EXISTS, and why it is not a convenience.

   The pilot accumulates thirteen module-level counters as it plays — which card
   got played, who was swinging, how many forks were ducked, what the mending
   ledger says. Every table at the bottom of the probe reads them AFTER all the
   arms have run, on the assumption that they hold everything the probe ever saw.

   The moment an arm runs in a worker that assumption breaks silently: the runs
   happen in another thread, the counters there fill up, and the ones the probe
   reads are short by exactly that arm. No assertion would fail. Several tables
   would simply be wrong, and wrong in the direction of "this card is never
   played", which is the reading this project has already acted on twice.

   So a worker sends its counters home and the main thread absorbs them. The
   absorb rule is deliberately narrow, because the same thirteen objects hold
   BOTH accumulated counts and configuration: `MEND.on`, `TELL.on`, `TAUGHT.room`
   and `DUCKS.bar` are inputs, not outputs.

     numbers  ADD          (every count, every total)
     arrays   CONCATENATE  (every sample list)
     anything else  LEFT ALONE — booleans, strings and null are configuration

   Configuration travels the other way, in the job, via applyConfig. And the
   whole thing is proved rather than trusted: the run suite plays one arm inline
   and the same arm pooled and asserts the counters come out identical. */
const COUNTERS = { PLAYED, OFFERED, CARRIED, TRIGGERS, SOLD, TITAN, ROOM, CROOM, DUCKS, LANE, TELL, MEND, TAUGHT };

function cloneCounts(o) {
  const out = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (Array.isArray(v)) out[k] = v.slice();
    else if (v && typeof v === 'object') out[k] = cloneCounts(v);
    else out[k] = v;
  }
  return out;
}
/* THE TYPE OF A FIELD DOES NOT TELL YOU WHETHER IT ACCUMULATES, and assuming it
   did produced two wrong tables on the first run of this.

   `DUCKS.bar` is 0.22 — a numeric THRESHOLD, and summing it across two workers
   set it to 0.66 and changed which forks the duck arm counted. `ROOM.free` is a
   histogram indexed by free-slot count, and concatenating two of them produced a
   twelve-slot board on a six-slot game. Both are named here rather than guessed
   at, and the run suite asserts inline and pooled agree so anything missed from
   these lists fails loudly instead of skewing a table by a few percent. */
const SKIP = {                      // configuration and transient state, never merged
  DUCKS: new Set(['bar']),
  TAUGHT: new Set(['on', 'always', 'room']),
  LANE: new Set(['on']),
  TELL: new Set(['on', 'lastB', 'lastHeld']),
  MEND: new Set(['on', 'last', 'where']),
  ROOM: new Set(['on']),
};
const CONCAT = new Set(['heatAtDeath']);   // sample lists; everything else indexed

function addCounts(into, from, skip) {
  for (const k of Object.keys(from)) {
    if (skip && skip.has(k)) continue;
    const v = from[k];
    if (typeof v === 'number') into[k] = (typeof into[k] === 'number' ? into[k] : 0) + v;
    else if (Array.isArray(v)) {
      if (CONCAT.has(k)) into[k] = (Array.isArray(into[k]) ? into[k] : []).concat(v);
      else {
        const dst = Array.isArray(into[k]) ? into[k] : (into[k] = []);
        v.forEach((n, i) => { dst[i] = (dst[i] || 0) + (n || 0); });
      }
    } else if (v && typeof v === 'object') addCounts(into[k] || (into[k] = {}), v, null);
    // booleans, strings, null: configuration, not a count — never merged
  }
}

/** Everything this thread has counted since it started. */
export function snapshot() {
  const out = {};
  for (const k of Object.keys(COUNTERS)) out[k] = cloneCounts(COUNTERS[k]);
  return out;
}
/** Fold another thread's counters into this one's. */
export function absorb(snap) {
  if (!snap) return;
  for (const k of Object.keys(snap)) if (COUNTERS[k]) addCounts(COUNTERS[k], snap[k], SKIP[k]);
}
/** The switches an arm sets before it plays. Sent in the job, applied here. */
export function applyConfig(cfg) {
  if (!cfg) return;
  if (cfg.skill) Object.assign(SKILL, cfg.skill);
  if (cfg.draft) Object.assign(DRAFT, cfg.draft);
  if (cfg.taught) Object.assign(TAUGHT, cfg.taught);
  if (cfg.flags) {
    if (cfg.flags.lane !== undefined) LANE.on = cfg.flags.lane;
    if (cfg.flags.tell !== undefined) TELL.on = cfg.flags.tell;
    if (cfg.flags.mend !== undefined) MEND.on = cfg.flags.mend;
    if (cfg.flags.room !== undefined) ROOM.on = cfg.flags.room;
  }
}
/** What this thread's arm was configured with, to send to a worker. */
export function config() {
  return { skill: Object.assign({}, SKILL), draft: Object.assign({}, DRAFT),
    taught: Object.assign({}, TAUGHT),
    flags: { lane: LANE.on, tell: TELL.on, mend: MEND.on, room: ROOM.on } };
}

export {
  CARRIED, CROOM, DEFAULT_N, DRAFT, DRAFT_HABITS, DUCKS, FF, FROSTERS, G, HABITS, LANE, MEND, NO_SCARS, OFFERED, PLAYED, ROOM, SKILL, SOLD, TAUGHT, TELL, TITAN, TRIGGERS, bestSlot, botTurn, cardWorth, carefulItem, carefulSlot, carefulTurn, courseWanted, denySchemes, doomed, draftPick, draftTurn, erf, itemTarget, pickBiggest, playRun, sale, settleChoosers, soakerFirst, stripScars, threatOf, watchTitan, wounds,
  applyTweak,
};
