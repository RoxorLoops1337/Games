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

/* A tiny on-disk record of what each turned-up arm last said, so the summary
   the default check prints is a measurement rather than a comment. */
const ARMS_FILE = new URL('./.frostfell-arms.json', import.meta.url);
const ARMS = {
  all: (() => { try { return JSON.parse(readFileSync(ARMS_FILE, 'utf8')); } catch { return {}; } })(),
  read(knob) { return this.all[knob] || null; },
  /* Read-modify-write, because two arms turned up at once will otherwise
     clobber each other: both load the file at import and the second to finish
     wins. Found by running FF_LESSON and FF_MONEY in parallel and getting one
     reading out of two. */
  stamp(knob, said, sample) {
    let disk = {};
    try { disk = JSON.parse(readFileSync(ARMS_FILE, 'utf8')); } catch { disk = {}; }
    Object.assign(this.all, disk);
    this.all[knob] = { said, sample };
    this.save();
  },
  save() { try { writeFileSync(ARMS_FILE, JSON.stringify(this.all, null, 1) + '\n'); } catch { /* read-only tree */ } },
};
const STANDING = [
  ['FF_ABLATE=60', 'which fight habits are worth anything, added and removed'],
  ['FF_LESSON=1', 'what a lesson is worth, and at what dose'],
  ['FF_MONEY=70', 'what a purse buys, one ware removed and one ware given'],
  ['FF_COURSE=150', 'the five courses against declaring nothing'],
];

const MEND = { on: false, by: {}, hurt: 0, last: null, where: 'start' };
const wounds = () => (G.run ? G.run.deck.concat([G.run.leader])
  .filter((c) => c.type === 'unit').reduce((n, c) => n + (c.dmg || 0), 0) : 0);

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
  if (tweak) tweak(G.run);
  MEND.last = null; MEND.where = 'start';
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
  return stat;
}

/* ---------------------------------------------------------------- the run -- */
section('whole runs, start to finish');
{
  // Eight seeds a tribe is what the suite can afford. FF_RUNS turns the same
  // instrument up when the question is 'is this gap real' rather than 'does
  // this still run' — at N=8 the whole spread is two or three runs wide, which
  // is noise, and pretending otherwise would be worse than not measuring.
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
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

  /* THE SHAPE OF A RUN, drawn rather than tabulated.

     Each row is one pilot, and the bar is where its runs ENDED: how many fell
     in the first zone, the second, the third, and how many crossed. Read left
     to right it is the trail itself, and the block that grows as you go down
     the rows is the whole point of the instrument. */
    const glyph = { 0: '░', 1: '▒', 2: '▓', win: '█' };
  const shape = (o) => {
    const wide = 48;
    const cells = [o.died[0], o.died[1], o.died[2], o.wins];
    const keys = [0, 1, 2, 'win'];
    let out = '';
    cells.forEach((n, i) => { out += glyph[keys[i]].repeat(Math.round(wide * n / Math.max(1, o.runs))); });
    return out.padEnd(wide).slice(0, wide);
  };
  const rows = [['careless', careless], ['+ the fight', tactics],
    ['+ the trader', trader], ['+ steering the pool', careful]];
  console.log('');
  console.log(`    ${''.padEnd(20)}${'zone 1 ░   zone 2 ▒   zone 3 ▓   crossed █'.padEnd(48)}  won`);
  for (const [name, o] of rows) {
    console.log(`    ${name.padEnd(20)}${shape(o)}  ${String(pct(o) + '%').padStart(4)}`);
  }
  console.log('');
  const rung = (a, z) => {
    const d = pct(z) - pct(a);
    return `${d >= 0 ? '+' : ''}${d}`.padStart(4);
  };
  console.log(`    what each thing is worth:  the fight ${rung(careless, tactics)}   ` +
    `the trader ${rung(tactics, trader)}   steering the pool ${rung(trader, careful)}   ` +
    `= ${pct(careful) - pct(careless)} points, all told`);
  for (const [name, o] of rows) {
    console.log(`    ${name.padEnd(20)}${(o.turns / Math.max(1, o.battles)).toFixed(1)} turns a fight · ` +
      `${o.reachedTwo}/${o.runs} saw the second zone, ${o.reachedThree} the third`);
  }

  /* What is actually killing a competent pilot in the last zone. A zone that
     kills is a difficulty setting; a zone where the same three things kill
     every time is a design problem, and telling them apart needs the names. */
  if (TITAN.fights) {
    console.log(`    the Kettle Titan: ${TITAN.fights} fights · ` +
      `frost in hand on ${Math.round(100 * TITAN.turnsWithFrost / Math.max(1, TITAN.turns))}% of turns facing it`);
  }
  const lastZone = Object.entries(careful.killers).sort((a, z) => z[1] - a[1]);
  const totalLate = lastZone.reduce((n, [, v]) => n + v, 0);
  console.log('');
  if (!totalLate) console.log('    what ends a good run in the last zone: nothing — nobody died there');
  else {
    console.log(`    what ends a good run in the last zone (${totalLate} deaths):`);
    for (const [k, v] of lastZone.slice(0, 5)) {
      console.log(`      ${String(Math.round(100 * v / totalLate) + '%').padStart(4)}  ` +
        `${'█'.repeat(Math.round(24 * v / totalLate)).padEnd(24)} ${k} (${v})`);
    }
  }

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
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
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
  /* FF_MONEY turns the economy arm up on its own, the way FF_ABLATE does the
     habits and FF_COURSE does the courses. It read eight points in one run and
     one in the next at 210 runs an arm, which is the same "band wider than the
     effect" mistake in a third place. */
  const MN = Number(process.env.FF_MONEY || 0);
  const sweepM = MN ? (tweak) => {
    let wins = 0, runs = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < MN; i++) {
        const st = playRun(tribe, 1000 + i * 37, 'careful', tweak);
        runs++;
        if (st.won) wins++;
      }
    }
    return { wins, runs, pct: Math.round((wins / Math.max(1, runs)) * 100) };
  } : sweep2;
  if (MN) console.log(`    (money turned up: ${3 * MN} runs an arm)`);
  const normal = sweepM(null);
  /* Every number in this section is a proportion out of the same handful of
     runs, so it carries a band: one standard deviation, in points, computed up
     front and printed below, so nobody reads a four-point difference as a
     finding. Several of this iteration's dead ends were exactly that mistake
     made twice. */
  const band = (100 * Math.sqrt(0.35 * 0.65 / Math.max(1, normal.runs))).toFixed(1);
  const broke = sweepM((run) => { run.gold = 0; run.prices = 40; });
  const rich = sweepM((run) => { run.gold = 400; run.prices = 0.02; });
  const bar = (n) => '█'.repeat(Math.round(n / 2)).padEnd(30);
  console.log(`    ${'penniless'.padEnd(19)}${bar(broke.pct)} ${String(broke.pct + '%').padStart(4)}`);
  console.log(`    ${'as it ships'.padEnd(19)}${bar(normal.pct)} ${String(normal.pct + '%').padStart(4)}`);
  console.log(`    ${'a bottomless purse'.padEnd(19)}${bar(rich.pct)} ${String(rich.pct + '%').padStart(4)}`);
  console.log(`    → money is worth ${normal.pct - broke.pct} points of win rate`);
  /* AND WHAT THE PURSE BOUGHT. The gap between "as it ships" and "bottomless"
     has been printed for rounds without anyone asking which ware it is. Give a
     rich pilot everything except one thing at a time: whatever it cannot do
     without is where the money goes. */
  if (MN) {
    const rows = [];
    for (const w of ['meal', 'bell', 'temper', 'charm', 'card', 'heal', 'sigil', 'burn']) {
      const arm = sweepM((run) => { run.gold = 400; run.prices = 0.02; run.noBuy = { [w]: 1 }; });
      rows.push([w, arm.pct, rich.pct - arm.pct]);
    }
    rows.sort((a2, z) => z[2] - a2[2]);
    console.log('    what a bottomless purse is actually buying (rich, minus one ware):');
    for (const [w, pct, drop] of rows) {
      console.log(`      no ${w.padEnd(8)} ${bar(pct)} ${String(pct + '%').padStart(4)}  ` +
        (drop > 0 ? `−${drop} of the ${rich.pct - normal.pct}` : 'no cost'));
    }
    /* And the same question from the other end: a penniless pilot handed one
       ware for nothing. If one of them closes most of the gap it is that ware;
       if they all close a little, the gap is the economy and not a ware, and
       the word "compounding" can be retired. */
    const up = [];
    for (const w of ['meal', 'charm', 'temper', 'bell', 'card', 'heal', 'sigil', 'burn']) {
      const arm = sweepM((run) => { run.gold = 0; run.prices = 40; run.freeWare = w; });
      up.push([w, arm.pct, arm.pct - broke.pct]);
    }
    up.sort((a2, z) => z[2] - a2[2]);
    ARMS.stamp('FF_MONEY=70', `${rows[0][0]} is −${rows[0][2]} of ${rich.pct - normal.pct} removed; ` +
      `free ${up[0][0]} is +${up[0][2]} given`, 3 * MN);
    console.log(`    and what closes it from the other end (penniless, plus one free ware, vs ${broke.pct}%):`);
    for (const [w, pct, gain] of up) {
      console.log(`      free ${w.padEnd(7)} ${bar(pct)} ${String(pct + '%').padStart(4)}  ` +
        (gain > 0 ? `+${gain} of the ${normal.pct - broke.pct}` : String(gain)));
    }
  }
  /* And the course on its own, handed over rather than bought — so the lever
     is measured apart from whether the pilot knows when to pull it. */
  /* FF_COURSE turns just this comparison up. The five courses were called level
     at 210 runs an arm and the numbers moved ten points between samples, which
     at a band of three means the levelling was as likely luck as design — the
     same mistake the fight ablation was making for four rounds. */
  const CN = Number(process.env.FF_COURSE || 0);
  const sweepC = CN ? (tweak) => {
    let wins = 0, runs = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < CN; i++) {
        const st = playRun(tribe, 1000 + i * 37, 'careful', tweak);
        runs++;
        if (st.won) wins++;
      }
    }
    return { wins, runs, pct: Math.round((wins / Math.max(1, runs)) * 100) };
  } : sweep2;
  if (CN) console.log(`    (courses turned up: ${3 * CN} runs an arm)`);
  const noCourse = sweepC((run) => { run.course = null; });
  const byCourse = FF.COURSES.map((co) => ({ co, r: sweepC((run) => { run.course = co.id; }) }));
  console.log('');
  console.log(`    ${'no course'.padEnd(19)}${bar(noCourse.pct)} ${String(noCourse.pct + '%').padStart(4)}`);
  for (const { co, r } of byCourse) {
    console.log(`    ${co.short.toLowerCase().padEnd(19)}${bar(r.pct)} ${String(r.pct + '%').padStart(4)}`);
  }
  const cband = (100 * Math.sqrt(0.35 * 0.65 / Math.max(1, 3 * (CN || N)))).toFixed(1);
  console.log(`    (±${cband} is one standard deviation on the course rows)`);
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

/* ------------------------------------------- and what walking past one is -- */
/* THE ONE THING A TRANSCRIPT FOUND THAT NO RUNG EVER DID.

   A run crossed all three zones having fought eight of twenty-one steps. Not a
   lucky one — a competent one, taking the safe fork every time it was offered.
   That is a winning line the ladder above cannot see, because every rung on it
   fights whatever the trail happens to put in front of it; none of them chooses
   to walk away.

   So here are two pilots identical in every respect except what they do at a
   fork with a fight on one side of it. One takes the fight, one takes the other
   thing. If dodging is even level, the game is asking to be dodged. */
section('does walking past a fight pay');
{
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  const tribes = ['hearth', 'frost', 'scrap'];
  const arm = (tweak) => {
    let wins = 0, runs = 0, power = 0, fought = 0, walked = 0, seen = 0;
    let cards = 0, temp = 0, meals = 0, gold = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) {
        const st = playRun(tribe, 1000 + i * 37, 'careful', tweak);
        runs++;
        if (st.won) wins++;
        if (st.endPower !== undefined) {
          power += st.endPower; fought += st.fought; walked += st.walked; seen++;
          cards += st.cards; temp += st.temp; meals += st.meals; gold += st.endGold;
        }
      }
    }
    return { pct: Math.round((wins / Math.max(1, runs)) * 100), runs,
      power: power / Math.max(1, seen), share: fought / Math.max(1, walked),
      cards: cards / Math.max(1, seen), temp: temp / Math.max(1, seen),
      meals: meals / Math.max(1, seen), gold: gold / Math.max(1, seen) };
  };
  const seek = arm((run) => { run.seek = true; });
  const dodge = arm((run) => { run.dodge = true; });
  DUCKS.forks = 0; DUCKS.taken = 0; DUCKS.wound = 0;
  const sore = arm((run) => { run.duckHurt = true; });
  const bar2 = (n) => '█'.repeat(Math.round(n / 2)).padEnd(30);
  const band = (100 * Math.sqrt(0.35 * 0.65 / Math.max(1, seek.runs))).toFixed(1);
  const row = (label, a) => {
    console.log(`    ${label.padEnd(22)}${bar2(a.pct)} ${String(a.pct + '%').padStart(4)}` +
      `   fought ${Math.round(a.share * 100)}% of steps, arrived at ${a.power.toFixed(1)}`);
    console.log(`    ${''.padEnd(22)}${''.padEnd(30)}      ` +
      `${a.cards.toFixed(1)} cards · ${a.temp.toFixed(1)} tempered · ${a.meals.toFixed(1)} meals · ${Math.round(a.gold)} unspent`);
  };
  row('takes every fight', seek);
  row('walks past what it can', dodge);
  row('ducks to a quiet stop when hurt', sore);
  console.log(`    ${''.padEnd(22)}${''.padEnd(30)}      ` +
    `took the quiet road at ${DUCKS.taken} of ${DUCKS.forks} forks that offered it ` +
    `(${Math.round((DUCKS.taken / Math.max(1, DUCKS.forks)) * 100)}%), ` +
    `the line ${Math.round((DUCKS.wound / Math.max(1, DUCKS.forks)) * 100)}% wounded at those forks`);
  console.log(`    → walking past a fight is worth ${dodge.pct - seek.pct} points; ` +
    `ducking to a camp only when hurt is worth ${sore.pct - seek.pct} (±${band} is one standard deviation)`);
  /* The bar. Dodging may be survivable — a run that ducks two hard packs and
     scrapes home is a story — but it may not be the BETTER line, because a
     trail that pays you to avoid it is a trail nobody has a reason to walk. */
  /* Two standard deviations, not one — the same confidence every other claim in
     this suite is stated at. At the sample `npm run check` runs (24 an arm, band
     ±9.7) a one-sigma gate fails about one run in six on noise alone, which is a
     gate that cries wolf rather than one that catches a regression. At the real
     sample the tolerance is six points and dodging reads −6, so it still bites. */
  ok(dodge.pct <= seek.pct + Number(band) * 2,
    `walking past fights is not the winning line (${dodge.pct}% dodging vs ${seek.pct}% fighting, band ±${band})`);
  /* And the part a win rate cannot show, stated as what is actually true rather
     than as what was hoped for. A dodger does NOT arrive thin: everything it
     walks towards instead of a fight — a camp, a rest, a cache — builds a
     caravan too, and it arrives holding a leaner, better-tempered line than the
     pilot who fought everything. What it does not get to do is arrive AHEAD.
     The bar is that fighting buys at least as much caravan as ducking does; if
     ducking ever bought more, no amount of difficulty tax would make fighting
     the honest line, it would only make the game longer. */
  ok(dodge.power <= seek.power + 0.4,
    `ducking fights does not build a better caravan (${dodge.power.toFixed(1)} against ${seek.power.toFixed(1)})`);
  /* And the finding underneath both of the above, kept as a check because it is
     the thing that was actually broken: a fighting caravan must be able to
     SPEND what fighting pays it. It ended a run holding 527 scrip when the only
     counter in the game shared a fork with the fights it was winning. */
  ok(seek.gold < 200, `a caravan that fights can spend what it earns (${Math.round(seek.gold)} left over)`);
}

/* -------------------------------------------------- what the fight is for -- */
section('which parts of playing well are worth anything');
{
  /* FF_ABLATE turns this one section up on its own. The habits sit two to seven
     points apart, and at the suite's usual sample the band is five — which is
     why the same habit read +3 one round and -2 the next. Settling which of
     them are real needs a sample this section can afford only when it is the
     only thing running. */
  const N = Number(process.env.FF_ABLATE || process.env.FF_RUNS || DEFAULT_N);
  if (process.env.FF_ABLATE) console.log(`    (turned up: ${3 * N} runs an arm)`);
  /* FF_HABIT names ONE habit and prices only that one, which is what it takes
     to get a single number's band under two points inside a session. Ablating
     all six at a sample that tight costs six times as much and answers five
     questions nobody asked. */
  const ONLY = process.env.FF_HABIT || '';
  if (ONLY) console.log(`    (only "${ONLY}", ${3 * N} runs an arm)`);
  const tribes = ['hearth', 'frost', 'scrap'];
  const sweep3 = () => {
    let wins = 0, runs = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) { const st = playRun(tribe, 1000 + i * 37, 'tactics'); runs++; if (st.won) wins++; }
    }
    return Math.round((wins / Math.max(1, runs)) * 100);
  };
  const all = sweep3();
  const band = (100 * Math.sqrt(0.2 * 0.8 / Math.max(1, tribes.length * N))).toFixed(1);
  console.log(`    the fight, played well:  ${all}%`);
  /* ARE THE OTHER DECISIONS FAKE, OR IS ONE-AT-A-TIME THE WRONG QUESTION?

     The settled table says denying schemes is worth +7 and every other fight
     habit is inside the band — which reads as "nineteen of twenty decisions in
     a fight price at zero", and that would be a damning thing for a board game
     to be true of.

     But ablation removes ONE habit and leaves the pilot every other way of
     coping. If the habits overlap — if a pilot that cannot keep a slot back
     simply denies a scheme instead, and one that cannot hold gear spends it on
     the same target a turn earlier — then each reads zero on its own while the
     SET of them is worth a great deal. Removing them all at once is the only
     way to tell those two stories apart, and it had never been run. */
  const before = Object.assign({}, SKILL);
  for (const [key] of HABITS) SKILL[key] = false;
  const none = sweep3();
  Object.assign(SKILL, before);
  console.log(`    the fight, with every habit switched off:  ${none}%  (${all - none} points for the set)`);

  /* AND THE SAME QUESTION FROM THE OTHER END, which is the thing that finally
     settled the money gap.

     Removing one habit at a time has said the same thing for six rounds: denial
     clears the band and nothing else does. That reads as "nineteen of twenty
     decisions are fake" — but the SET is worth nineteen points, and a set worth
     nineteen made of parts each worth zero is the exact signature of things
     that SUBSTITUTE for one another. A pilot that cannot keep a slot back
     denies a scheme instead; one that cannot hold gear spends it a turn early
     on the same target.

     So: start from the pilot that knows nothing and turn ONE habit on. If each
     alone recovers a real share of the nineteen, they are all real and the
     subtractive table was blunt rather than right. */
  const added = [];
  for (const [key, label] of HABITS) {
    for (const [k2] of HABITS) SKILL[k2] = false;
    SKILL[key] = true;
    added.push([label, sweep3()]);
  }
  Object.assign(SKILL, before);
  added.sort((a2, z) => z[1] - a2[1]);
  /* And this table refuses to print inside its own band, the same as the one
     above it. It nearly cost a round: at the default sample it read "keeping a
     slot in reserve +5" with a ±2.8 band, that got written down as a finding,
     and at 180 runs an arm it is +2. A ranking inside its own band is noise
     wherever it is printed, including here. */
  const top = added[0];
  console.log(`    and one at a time, starting from nothing (${none}% knowing none): ` +
    `${top[0].replace(' (removed)', '')} alone is worth ${top[1] - none} of the ${all - none}`);
  if (Number(band) > 3.2) {
    console.log(`      (no table: ±${band} a row at this sample. FF_ABLATE=60 or more for one that means something)`);
    added.length = 0;
  } else {
    ARMS.stamp('FF_ABLATE=60', `${top[0].replace(' (removed)', '')} +${top[1] - none} of the ${all - none}; ` +
      `next best ${added[1] ? added[1][0].replace(' (removed)', '') + ' +' + (added[1][1] - none) : 'none'}`,
      tribes.length * N);
  }
  for (const [label, pct] of added) {
    const d = pct - none;
    console.log(`      only ${label.replace(' (removed)', '').padEnd(34)}` +
      '█'.repeat(Math.round(pct / 2)).padEnd(14) + ` ${String(pct + '%').padStart(4)}  ` +
      (d > 0 ? '+' + d : String(d)) + ' of the ' + (all - none));
  }
  const rows = [];
  for (const [key, label] of HABITS) {
    if (ONLY && key !== ONLY) continue;
    SKILL[key] = false;
    const without = sweep3();
    SKILL[key] = true;
    rows.push({ label, cost: all - without });
  }
  rows.sort((a, z) => z.cost - a.cost);
  /* A TABLE NOBODY MAY READ IS WORSE THAN NO TABLE.

     This ranking was printed every run for six rounds and read as a podium, and
     it was never one: at the suite's usual sample each row carries ±2.8, so six
     numbers re-rolled every round produce a different order every time. The
     same six habits read +9/+8/+6/+6 one round and +6/0/0/-2/-3 the next with
     nothing changed between them.

     So it prints only when it can be trusted. Under a two-point band it is a
     table; over one it is a single honest sentence and an instruction for
     getting the real thing. The probe is three times faster than it was, so
     the real thing is now affordable. */
  const READABLE = 2.0;
  if (Number(band) <= READABLE) {
    for (const r of rows) {
      const n = r.cost;
      const bar = n > 0 ? '█'.repeat(Math.min(20, Math.round(n / 2))) : '';
      console.log(`      ${String(n >= 0 ? '+' + n : n).padStart(4)}  ${bar.padEnd(20)} ${r.label}`);
    }
    console.log(`      (±${band} is one standard deviation — a habit inside that band is not a decision)`);
  } else {
    console.log(`      (no table: ±${band} a row at this sample, and a ranking inside its own band is noise.`);
    console.log(`       FF_ABLATE=${Math.ceil(400 / tribes.length)} for all of them, or FF_HABIT=<key> FF_ABLATE=250 for one)`);
  }
  {
    const tot = ROOM.free.reduce((n, v) => n + (v || 0), 0) || 1;
    console.log('    free slots on the player line, by share of turns: ' +
      ROOM.free.map((v, i) => i + ':' + Math.round(((v || 0) / tot) * 100) + '%').join(' '));
    const et = ROOM.efree.reduce((n, v) => n + (v || 0), 0) || 1;
    console.log('    free slots on the foes\' line:                    ' +
      ROOM.efree.map((v, i) => i + ':' + Math.round(((v || 0) / et) * 100) + '%').join(' '));
    const ct = CROOM.free.reduce((n, v) => n + (v || 0), 0) || 1;
    console.log('    and on a CARELESS pilot\'s line:                   ' +
      CROOM.free.map((v, i) => i + ':' + Math.round(((v || 0) / ct) * 100) + '%').join(' '));
  }
  console.log(`    the room rule, in practice: the line stood on a packed board for ` +
    `${Math.round((ROOM.packed / Math.max(1, ROOM.packed + ROOM.spare)) * 100)}% of turns · ` +
    `a body was held back on ${ROOM.declined} of ${ROOM.plays} deployments ` +
    `(${Math.round((ROOM.declined / Math.max(1, ROOM.plays)) * 100)}%)`);
  ok(true, 'the ablation is a report, not a gate');
}

/* ----------------------------------------------- where the mending comes -- */
section('why damage is not a pressure');
{
  const tribes = ['hearth', 'frost', 'scrap'];
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  MEND.on = true; MEND.by = {}; MEND.hurt = 0;
  let wins = 0, runs = 0;
  for (const tribe of tribes) {
    for (let i = 0; i < N; i++) { const st = playRun(tribe, 7000 + i * 31, 'careful'); runs++; if (st.won) wins++; }
  }
  MEND.on = false;
  const rows = Object.entries(MEND.by).sort((a2, z) => z[1] - a2[1]);
  const total = rows.reduce((n, r) => n + r[1], 0) || 1;
  console.log('  · where the mending comes from');
  console.log(`    ${Math.round(MEND.hurt)} damage taken across ${runs} runs, ` +
    `${Math.round(total)} of it mended (${Math.round((total / Math.max(1, MEND.hurt)) * 100)}%)`);
  for (const [where, amount] of rows.slice(0, 6)) {
    console.log(`      ${where.padEnd(34)}${'█'.repeat(Math.round((amount / total) * 40)).padEnd(40)} ` +
      `${Math.round((amount / total) * 100)}%`);
  }
  ok(MEND.hurt > 0, 'the caravan does take damage');
  ok(total > 0, 'and something mends it');
}

/* --------------------------------------------- the arms nobody remembers -- */
section('the arms that are not run by default');
{
  /* THREE INSTRUMENTS EXIST THAT AN ORDINARY CHECK NEVER RUNS, and the first
     attempt at surfacing them printed a hand-written string saying what each
     one "said last time". That is a comment with extra steps: nothing enforced
     it and it would have been wrong within three rounds.

     So the readings are STAMPED: an arm that runs writes its headline and the
     sample it ran at to `.frostfell-arms.json`, and the default check reads it
     back. That file is COMMITTED, which is the whole point — a reading that
     lived only on the machine that took it starts blank in a fresh clone, which
     is exactly the rot it was meant to stop.

     There is no age counter. One was tried, incrementing on every check, and it
     churned the file on every run for a number nobody needed: git already knows
     when a reading last changed, and knows it better. */
  const rows = [];
  for (const [knob, what] of STANDING) {
    const rec = ARMS.read(knob);
    rows.push([knob, what, rec]);
  }
  console.log('  · arms that do not run by default');
  for (const [knob, what, rec] of rows) {
    console.log(`    ${knob.padEnd(24)}${what}`);
    console.log(`    ${''.padEnd(24)}→ ` + (rec
      ? `${rec.said}   (at ${rec.sample} an arm)`
      : 'no reading recorded — run it'));
  }
  ok(STANDING.length >= 4, 'every arm that needs a knob is listed');
}

/* ------------------------------------------------- can a lesson be priced -- *//* ------------------------------------------------- can a lesson be priced -- */
section('what being told is worth');
{
  /* Three pilots, identical but for what they know about red text. The middle
     one is the game as it ships: it learns only when the lesson fires, which
     is in the first zone, on a run that has never denied a scheme, twice. */
  const tribes = ['hearth', 'frost', 'scrap'];
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  const sweepT = (o) => {
    o = o || {};
    TAUGHT.on = !!o.on; TAUGHT.always = !!o.always; TAUGHT.room = !!o.room;
    const L = FF.LESSON, keep = { times: L.times, zone: L.zone };
    if (o.times !== undefined) L.times = o.times;
    if (o.zone !== undefined) L.zone = o.zone;

    let wins = 0, runs = 0, reached = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) {
        const st = playRun(tribe, 5000 + i * 41, 'careless');
        runs++;
        if (st.won) wins++;
        if (st.zone >= 1) reached++;
      }
    }
    TAUGHT.on = false; TAUGHT.always = false; TAUGHT.room = false;
    L.times = keep.times; L.zone = keep.zone;
    return { pct: Math.round((wins / Math.max(1, runs)) * 100), reached, runs };
  };
  const blind = sweepT({});
  const told = sweepT({ on: true });
  const knowing = sweepT({ on: true, always: true });
  const bar = (n) => '█'.repeat(Math.round(n / 2)).padEnd(24);
  const band = (100 * Math.sqrt(0.1 * 0.9 / Math.max(1, blind.runs))).toFixed(1);
  console.log('  · what being told is worth');
  console.log(`    never told   ${bar(blind.pct)} ${String(blind.pct + '%').padStart(4)}   ` +
    `${blind.reached}/${blind.runs} saw the second zone`);
  console.log(`    told once    ${bar(told.pct)} ${String(told.pct + '%').padStart(4)}   ` +
    `${told.reached}/${told.runs}`);
  console.log(`    always knew  ${bar(knowing.pct)} ${String(knowing.pct + '%').padStart(4)}   ` +
    `${knowing.reached}/${knowing.runs}`);
  console.log(`    → knowing is worth ${knowing.pct - blind.pct} points; being told carries ` +
    `${told.pct - blind.pct} of them (±${band} is one standard deviation)`);

  /* WHAT DOSE, AND IS THERE A SECOND THING WORTH TEACHING.

     Twice, in the first zone, about schemes: three numbers nobody had ever
     turned. FF_LESSON turns this section up on its own the way FF_ABLATE does
     the habits — it is eight arms, so it is not run on an ordinary check. */
  const LN = Number(process.env.FF_LESSON || 0);
  if (LN) {
    const rows = [
      ['told once (ships)',    { on: true, times: 1 }],
      ['told twice',           { on: true, times: 2 }],
      ['told four times',      { on: true, times: 4 }],
      ['told in every zone',   { on: true, times: 2, zone: 9 }],
      ['the room rule only',   { room: true, times: 1 }],
      ['both lessons',         { on: true, room: true, times: 1 }],
    ];
    console.log('    what the dose is worth (careless, against ' + blind.pct + '% never told):');
    let first = null;
    for (const [name, o] of rows) {
      const arm = sweepT(o);
      const d = arm.pct - blind.pct;
      if (first === null) first = d;
      console.log(`      ${name.padEnd(20)}${bar(arm.pct)} ${String(arm.pct + '%').padStart(4)}  ` +
        (d > 0 ? '+' + d : String(d)));
    }
    ARMS.stamp('FF_LESSON=1', `being told once is +${first}; every larger dose reads the same`,
      tribes.length * N);
  }
  ok(knowing.pct >= blind.pct - 5, 'knowing how to deny a scheme is not a handicap');
  ok(true, 'what being told is worth is a report, not a gate');
}

/* --------------------------------------------- how much skill can carry --- */
/* "A run is decided mostly by the deck it is holding" was last round's honest
   finding and it is also, put another way, a design choice. This arm measures
   the size of it: the SAME deck, locked for the whole trail, played by both
   pilots. Nothing is drafted, bought or burned, so every point of difference
   between the two rows is the fight and only the fight — and the difference
   between a weak deck played well and a strong one played badly is how much of
   a deck gap skill can actually close. */
section('which reward-screen decisions are worth anything');
{
  const N = Number(process.env.FF_ABLATE || process.env.FF_RUNS || DEFAULT_N);
  if (process.env.FF_ABLATE) console.log(`    (turned up: ${3 * N} runs an arm)`);
  const tribes = ['hearth', 'frost', 'scrap'];
  const sweep4 = () => {
    let wins = 0, runs = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) { const st = playRun(tribe, 1000 + i * 37, 'careful'); runs++; if (st.won) wins++; }
    }
    return Math.round((wins / Math.max(1, runs)) * 100);
  };
  const all = sweep4();
  const band = (100 * Math.sqrt(0.3 * 0.7 / Math.max(1, tribes.length * N))).toFixed(1);
  console.log(`    the reward screen, played well:  ${all}%`);
  const rows = [];
  for (const [key, label] of DRAFT_HABITS) {
    DRAFT[key] = false;
    const without = sweep4();
    DRAFT[key] = true;
    rows.push({ label, cost: all - without });
  }
  rows.sort((a, z) => z.cost - a.cost);
  // The same rule as the fight table above: it prints when it can be trusted
  // and says so plainly when it cannot.

  const READABLE = 2.0;
  if (Number(band) <= READABLE) {
    for (const r of rows) {
      const n = r.cost;
      const bar = n > 0 ? '█'.repeat(Math.min(20, Math.round(n / 2))) : '';
      console.log(`      ${String(n >= 0 ? '+' + n : n).padStart(4)}  ${bar.padEnd(20)} ${r.label}`);
    }
    console.log(`      (±${band} is one standard deviation — a habit inside that band is not a decision)`);
  } else {
    console.log(`      (no table: ±${band} a row at this sample, and a ranking inside its own band is noise.`);
    console.log(`       FF_ABLATE=${Math.ceil(400 / tribes.length)} for all of them, or FF_HABIT=<key> FF_ABLATE=250 for one)`);
  }
  ok(true, 'the reward ablation is a report, not a gate');
}

section('the same deck, two pilots');
{
  const N = Number(process.env.FF_RUNS || DEFAULT_N);
  const tribes = ['hearth', 'frost', 'scrap'];
  /* Both decks have to be able to finish the trail or the arm measures nothing
     but zeroes — a starter deck with no rewards at all wins about none of the
     time whoever is holding it. So both get the bodies a mid-run caravan would
     have, and the strong one gets the gear, the beast-cards and the tempering a
     well-shopped run arrives with. */
  const BASE = ['snowpup', 'cinderpup', 'snowpup', 'wayfarer', 'icepick', 'stew'];
  const EXTRA = ['bellowsbear', 'cairn', 'avalanche', 'gearshield', 'hush', 'lastlight'];
  const lock = (strong) => (run) => {
    run.lockDeck = true;
    /* A locked run cannot visit a trader or take a camp's mending, so without
       this the arm measures a war of attrition rather than a series of fights:
       damage carries between them and nothing ever puts it back. Every locked
       caravan mends the same amount, so it stays a controlled comparison. */
    run.mend = 8;
    for (const id of BASE) if (FF.CARDS[id]) run.deck.push(FF.mkCard(id));
    if (!strong) return;
    for (const id of EXTRA) if (FF.CARDS[id]) run.deck.push(FF.mkCard(id));
    for (const c of run.deck.slice(0, FF.TEMPER_CAP)) FF.temperCard(G, c);
  };
  const arm = (mode, strong) => {
    let wins = 0, runs = 0;
    for (const tribe of tribes) {
      for (let i = 0; i < N; i++) {
        const st = playRun(tribe, 1000 + i * 37, mode, lock(strong));
        runs++;
        if (st.won) wins++;
      }
    }
    return Math.round((wins / Math.max(1, runs)) * 100);
  };
  const weakBad = arm('careless', false), weakGood = arm('tactics', false);
  const strongBad = arm('careless', true), strongGood = arm('tactics', true);
  const band = Math.round(100 * Math.sqrt(0.25 * 0.75 / Math.max(1, tribes.length * N)));
  const bar2 = (n) => '█'.repeat(Math.round(n / 2)).padEnd(30);
  console.log(`    ${'weak deck, played badly'.padEnd(26)}${bar2(weakBad)} ${String(weakBad + '%').padStart(4)}`);
  console.log(`    ${'weak deck, played well'.padEnd(26)}${bar2(weakGood)} ${String(weakGood + '%').padStart(4)}`);
  console.log(`    ${'strong deck, played badly'.padEnd(26)}${bar2(strongBad)} ${String(strongBad + '%').padStart(4)}`);
  console.log(`    ${'strong deck, played well'.padEnd(26)}${bar2(strongGood)} ${String(strongGood + '%').padStart(4)}`);
  const deckGap = strongBad - weakBad;
  const skillGap = weakGood - weakBad;
  console.log(`    → the deck is worth ${deckGap} points, the fight ${skillGap} — ` +
    `skill closes ${deckGap > 0 ? Math.round(100 * skillGap / deckGap) : 0}% of a deck gap ` +
    `(±${band} is one standard deviation)`);
  ok(weakGood >= weakBad - band, 'playing the fight well is never a liability');
}

/* ----------------------------------------------------- and every ware --- */
/* A ware nobody buys in a whole run is furniture. But "the pilot never bought
   it" is two different findings wearing one face — it passed the ware over, or
   it never looked — and the counter had two wares in the second category for
   nineteen iterations. The sigil and the scar are now on the pilot's list, so
   this table finally reads as evidence about the SHOP. */
section('how many turns each foe gets');
{
  const rows = Object.entries(TRIGGERS).map(([id, t]) => ({ id, t, f: FF.FOES[id] }))
    .filter((r) => r.f).sort((a, z) => z.t.dmg - a.t.dmg);
  const all = rows.reduce((n, r) => n + r.t.dmg, 0) || 1;
  const top = rows.length ? rows[0].t.dmg : 1;
  console.log('    by share of the damage the fell actually swings:');
  for (const r of rows.slice(0, 8)) {
    console.log(`    ${r.f.name.padEnd(14)}${'█'.repeat(Math.round((r.t.dmg / top) * 22)).padEnd(23)}` +
      `${String(Math.round((r.t.dmg / all) * 100) + '%').padStart(4)}  counter ${r.f.cnt}` +
      `${r.f.kw && r.f.kw.aimless ? ' · aimless — no wall stops it' : ''}`);
  }
}

section('every ware is worth buying');
{
  const WARES = [
    ['meal', 'a hot meal'], ['temper', 'temper'], ['bell', 'a bell'], ['heal', 'mend all'],
    ['card', 'a card'], ['sigil', 'a sigil'], ['burn', 'burn a card'], ['scar', 'tend a hurt'],
    ['charm', 'a charm'],
  ];
  const rows = WARES.map(([k, name]) => ({ k, name, n: SOLD[k] || 0 })).sort((a, z) => z.n - a.n);
  const top = rows[0].n || 1;
  for (const r of rows) {
    console.log(`    ${r.name.padEnd(14)}${'█'.repeat(Math.round((r.n / top) * 26)).padEnd(27)}${r.n}`);
  }
  const dead = rows.filter((r) => !r.n);
  if (dead.length) console.log(`    never bought: ${dead.map((r) => r.name).join(', ')}`);
  /* The bar is deliberately weak: a ware may be situational (tending a hurt is
     worth nothing to a caravan carrying no scars) without being furniture. What
     it may not be is unreachable — bought zero times across hundreds of runs by
     a pilot that is looking for it. */
  ok(!dead.length, `every ware on the counter gets bought (${dead.map((r) => r.name).join(', ') || 'none dead'})`);
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
  if (rare.length) {
    /* AND WHY they are least, which the count alone cannot say. A card at the
       bottom of this table is there for one of three reasons and only one of
       them is the card's fault: it is rarely offered, it is offered and rarely
       taken, or it is taken and then never finds a moment. The ware table
       learned this lesson last round about the shop; the same question had
       never been asked of the deck. */
    console.log('    least by raw plays: ' + rare.map((c) => c.id).join(', ') +
      ' — but raw plays is a table about the pool, not the cards:');
    /* Raw plays is a table about the POOL, not about the cards: the three at
       the bottom of it turned out to be carried into a deck about sixty times
       against the top three's nine hundred, because the top three are starter
       cards that are in every deck from the first step. Divide it out. What is
       left is a number about the card — how often a caravan that HAS one finds
       a moment for it — and it is the only one of the two worth acting on. */
    const per = (id) => (CARRIED[id] ? PLAYED[id] / CARRIED[id] : 0);
    const seen = all.filter((c) => (CARRIED[c.id] || 0) >= 20)
      .sort((a, b) => per(a.id) - per(b.id));
    const line = (c) => console.log(`      ${c.id.padEnd(14)} ${per(c.id).toFixed(2).padStart(6)} plays per copy carried` +
      ` · ${String(PLAYED[c.id] || 0).padStart(5)} plays across ${String(CARRIED[c.id]).padStart(5)} copies`);
    console.log('    the five that find the fewest moments:');
    for (const c of seen.slice(0, 5)) line(c);
    console.log('    and the five that find the most:');
    for (const c of seen.slice(-5).reverse()) line(c);
  }
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
