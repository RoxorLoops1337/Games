// EMBERKIN — a run, measured.
//
// This plays the game. Not a simulation of it: the real emberkin/index.html
// loaded headless, a fresh save, the real encounter tables and card resolution,
// all the way from Rowan's study to Crown Hollow. It counts the things that
// make a run tedious rather than describing them.
//
//   node tools/emberkin/playthrough.mjs --runs 60          # a party of four
//   node tools/emberkin/playthrough.mjs --runs 60 --solo   # one kin, no switching
//   node tools/emberkin/playthrough.mjs --runs 60 --starter sproutle
//   node tools/emberkin/playthrough.mjs --runs 60 --rested # heal before each trainer
//   node tools/emberkin/playthrough.mjs --runs 60 --build value  # deck by value, not rarity
//   node tools/emberkin/playthrough.mjs --runs 60 --ban whetstone  # what is one card worth?
//
// >>> READ tools/emberkin/README.md BEFORE BELIEVING A NUMBER THIS PRINTS. <<<
//
// That doc is the manual and the rap sheet: what every printed line means, what
// it is divided by, which lines are comparable between --solo and party mode and
// which are emphatically not, and the ledger of all thirty-nine mistakes this tool
// has made. Twenty-six passes on this game produced about ten changes to the
// game and thirty-nine fixes to the probe. When a number here looks wrong, the ledger is
// the first place to look, not the game.
//
// Two rules that most of that ledger comes down to:
//   1. Average the ratios, never ratio the averages — everything goes through
//      rate(), which takes each run's own ratio and carries a 95% interval.
//   2. If a quantity divides by the party, it is not comparable between the
//      modes. Those lines say so on the line and print a party-free twin.
import { loadGame, mkCtx } from '../../tests/emberkin_lib.mjs';

const argv = process.argv.slice(2);
const RUNS = Number(argv[argv.indexOf('--runs') + 1]) || (argv.includes('--runs') ? 10 : 5);
// Two very different games are hiding in one average. With a party you switch
// into every matchup and almost nothing can kill you; with one kin the element
// chart decides the fight before a card is played. `--solo` measures the second
// one, so a change can be judged against both instead of whichever is flattering.
const SOLO = argv.includes('--solo');
// How many fights a permanent is worth keeping, for scoring. See `worth()`.
const MIGHT_FIGHTS = 12;
// How the run builds its deck. `rarity` is what this tool has always done —
// always take the rarer card — and pass 27 concluded from it that the deck does
// not decide a run, which is a conclusion confounded with the policy that
// produced it. `value` ranks by what a card does per point of energy; `grow`
// builds toward the permanence keywords (grow/chain/retain/combo) that the
// when-payable table says are what separate a played card from an unplayed one.
// Run them against each other before believing anything about the reward screen.
const BUILD = argv.includes('--build') ? argv[argv.indexOf('--build') + 1] : 'rarity';
// How much is one card worth? Two policies tying told us the card set is flat,
// but that is deduced rather than measured. `--ban <id>` plays the run with a
// card struck out of the offers and out of the starting deck; `--force <id>`
// pins three copies into the deck that nothing may swap out. The gap between the
// two, against the danger line, is what that card is worth — and if no card can
// move it outside its interval, the flatness is measured rather than inferred.
// A comma-separated list, so two cards can be struck out together and asked
// whether they add up or overlap. Two cards doing the same job is not depth.
const BANS = argv.includes('--ban') ? argv[argv.indexOf('--ban') + 1].split(',') : [];
const banned = (id) => BANS.includes(id);
const FORCE = argv.includes('--force') ? argv[argv.indexOf('--force') + 1] : null;
const FORCE_N = 3;

/**
 * What a card is worth outside a battle, per energy. `worth()` cannot be used
 * for this — it reads the kin on the field, the foe's HP and the turns left — so
 * this is the same shape with a nominal three turns left and a nominal swing.
 */
const staticScore = (EK, id) => {
  const d = EK.CARDS[id];
  if (!d) return 0;
  const fx = d.fx || {}, LEFT = 3, SWING = 40;
  // Combo is part of the number the card puts on the board — the game adds it to
  // the card's value before any effect reads it — and it was not scored, which is
  // most of why Berserk looked like the worst epic in the game.
  //
  // Grow is deliberately NOT scored here, on principle rather than on evidence:
  // doubling a card's value for it prices the card at its endgame from the first
  // offer, so the deck loads up on Whetstone (base value 3) for a ceiling it will
  // not reach for another sixty fights. The measurement does not actually decide
  // it — solo lost-or-ran was .276 ±.024 with the doubling and .261 ±.022 without,
  // which overlap. Said plainly because the first draft of this comment claimed
  // the numbers settled it and they do not.
  const v = d.v + (d.combo || 0);
  let p = 0;
  if (d.vt === 'edge') p += v;
  if (d.vt === 'atk' || d.vt === 'def') p += v * LEFT;
  if (d.vt === 'might') p += v * LEFT * MIGHT_FIGHTS;
  if (d.vt === 'shield' || d.vt === 'heal') p += v;
  if (d.vt === 'maxhp') p += v * 1.4;
  if (d.vt === 'draw') p += v * 3;
  if (d.vt === 'energy') p += v * 6 * LEFT;
  if (fx.def) p += fx.def * LEFT;
  if (fx.heal) p += fx.heal;
  if (fx.healFull) p += 40;
  if (fx.atk) p += fx.atk * LEFT;
  if (fx.energy) p += 5;
  if (fx.draw) p += fx.draw * 3;
  if (fx.hits) p += SWING * fx.hits * LEFT;
  if (fx.mul) p += SWING * (fx.mul - 1) * LEFT;
  if (fx.drain) p += SWING * fx.drain;
  if (fx.thorns) p += fx.thorns * LEFT;
  if (fx.st) p += 3 * LEFT;
  if (fx.selfdmg) p -= fx.selfdmg;
  if (d.kill) p += d.kill * 4;              // permanent, every time it finishes one
  if (fx.again) p += SWING;                 // a whole extra swing, once
  return p / Math.max(.5, d.cost);
};

/** How much of a card keeps paying after the turn it is played on. */
const permScore = (EK, id) => {
  const d = EK.CARDS[id];
  if (!d) return 0;
  return (d.grow ? 2 : 0) + (d.chain ? 2 : 0) + (d.retain ? 1 : 0)
    + (d.combo ? 1 : 0) + (d.bgrow ? 1 : 0);
};

/** One number a deck policy sorts on. Higher is more wanted. */
const cardRank = (EK, id) => {
  if (BUILD === 'value') return staticScore(EK, id);
  if (BUILD === 'grow') return permScore(EK, id) * 100 + EK.RARITY_ORDER.indexOf(EK.CARDS[id].r);
  return EK.RARITY_ORDER.indexOf(EK.CARDS[id].r) * 100;
};
// `--rested` heals the party before each trainer, which is how this used to
// measure them and why they all read as unloseable. Kept because the comparison
// is the point: the difference between the two columns is how much of a
// trainer's difficulty is the walk that came before it.
const RESTED = argv.includes('--rested');
// `--starter sproutle` runs every run on one starter. Rotating is right for a
// headline number, but it means sixty runs is twenty per starter, and twenty is
// not enough to tell the three apart: across three samples of builds that never
// touched Ember, Cindercub's lost-or-ran read .237, .358 and .438 with intervals
// of about ±.08. A per-starter claim needs a per-starter sample.
const ONLY = argv.includes('--starter') ? argv[argv.indexOf('--starter') + 1] : null;

/** The route a real player walks, in order. */
const ROUTE = [
  { map: 'hollowbrook', target: 0, duels: ['t_wick1'] },
  { map: 'route_one', target: 12, duels: ['t_pell', 't_dorn'] },
  { map: 'stillmere', target: 15, duels: ['t_mio'] },
  { map: 'emberwood', target: 18, duels: ['t_ivo', 't_wick2', 't_coll', 't_hale'] },
  { map: 'crown_hollow', target: 26, duels: ['t_wick3'] },
];

function playOne(runIdx) {
  const EK = loadGame({});
  EK.setCtx(mkCtx());
  EK.newGame();
  // Rotate the starter. Taking the first one every time meant every number in
  // this report — the whole matchup cross-tab that passes 12 and 13 were steered
  // by — was measured on one third of the game, with Ember's resistances baked
  // into every run. Dorn's Stone wall read as an eight-turn slog partly because
  // the probe never once walked in with a Tide kin.
  EK.G.mode = 'world';
  EK.takeStarter(ONLY || EK.STARTERS[runIdx % EK.STARTERS.length]);
  EK.G.dialogue = null; EK.G.mode = 'world';

  // The banned card leaves the starting deck too, or the run is measured with
  // three copies of the thing it is supposed to be without.
  const pinned = new Set();
  if (BANS.length) EK.G.deck = EK.G.deck.filter((u) => !banned((EK.ownedCard(u) || {}).id));
  if (FORCE) {
    for (let i = 0; i < FORCE_N; i++) {
      const c = EK.grantCard(FORCE, true);
      if (!c) break;
      pinned.add(c.u);
      if (!EK.G.deck.includes(c.u)) {
        // Make room by dropping the least wanted unpinned card.
        const inDeck = EK.G.deck.map(EK.ownedCard).filter(Boolean).filter((o) => !pinned.has(o.u));
        let worst = inDeck[0];
        for (const o of inDeck) if (cardRank(EK, o.id) < cardRank(EK, worst.id)) worst = o;
        if (EK.G.deck.length >= EK.DECK_MAX && worst) EK.G.deck = EK.G.deck.filter((u) => u !== worst.u);
        EK.G.deck.push(c.u);
      }
    }
  }

  const stat = {
    steps: 0, fights: 0, noDoubt: 0, wipes: 0, healTrips: 0, turns: 0,
    played: new Map(), drawn: new Map(), afford: new Map(), taken: new Map(),
    // What is a card actually worth? The scorer pays a flat 3 points for one,
    // which is a number somebody typed. These measure it instead: the worth of
    // an average non-kin card sitting in hand at a decision (what an extra card
    // would be, if you could spend it), the worth of the ones actually played,
    // and how often the support pass stops because there is nothing left to
    // afford rather than nothing left worth playing. That last one is the
    // discount: a card you cannot pay for is worth nothing at all.
    handWorth: 0, handN: 0, playWorth: 0, playN: 0, stopBroke: 0, stopDone: 0,
    // Card growth is capped at 4x the card's own value, but G.might is not
    // capped at anything: every might card played adds its whole current value
    // to a run-long total that rides on every attack from every kin. Worth
    // knowing what that total actually reaches now the probe plays the cards.
    might: 0, mightMid: 0,
    // Everything a run accumulates. Might was found by suspecting it; the point
    // of this block is that the next one gets found by reading. For each: what
    // it reaches by Crown Hollow, and whether anything bounds it.
    money: 0, bagN: 0, deckN: 0, grown: 0, grownCap: 0, deckMix: null, deckTop: null, levels: 0, gems: 0,
    wildFights: 0, corners: 0, wildNoBeat: 0, wildBeats: 0,
    oneTurn: 0, foeHp: 0, foeHpSeen: 0, dpt: 0, caught: 0, thrown: 0, switched: 0, salves: 0, fled: 0,
    // What a fight took out of the party, as opposed to how close to death it
    // came. Never-in-doubt is an absolute floor, so it answers "was I worried",
    // which a fight entered at half health flunks whatever happens in it. This
    // answers "was that fight anything" — and it is the one that is about the
    // fight rather than about the walk before it.
    cost: 0, costKin: 0, costN: 0, noDoubtKin: 0,
    // Trainers are the hand-authored fights, and averaging them into the wild
    // ones hides exactly the thing a scripted plan is supposed to change. Keyed
    // by npc id so the three Wick fights can be read as a sequence.
    duels: new Map(),
    // Never-in-doubt has not moved in three passes, and every dial that buys
    // length buys safety too — so stop reading the average and cross-tab the
    // shape instead. Keyed by how the matchup reads before a blow is struck.
    matchup: new Map(),
  };
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  // A player fills a party out early and then mostly stops. Four is enough to
  // have an answer to every element without turning the run into a zoo.
  const PARTY_WANT = SOLO ? 1 : 4;
  const ORBS = ['prismorb', 'gleamorb', 'bloomorb'];
  const orbToThrow = () => ORBS.find((o) => (EK.G.bag[o] || 0) > 0) || null;
  /** A card into the deck if it beats the worst thing already in there. */
  const tryDeck = (c) => {
    if (!c || EK.G.deck.includes(c.u) || banned(c.id)) return;
    const inDeck = EK.G.deck.map(EK.ownedCard).filter(Boolean).filter((o) => !pinned.has(o.u));
    if (inDeck.length < EK.DECK_MAX) { EK.G.deck.push(c.u); return; }
    // A player drops a weak card, not an unused one, so play count only breaks
    // ties within the policy's own ranking.
    const rank = (o) => cardRank(EK, o.id) + Math.min(0.9, (o.plays || 0) / 1000);
    let worst = inDeck[0];
    for (const o of inDeck) if (rank(o) < rank(worst)) worst = o;
    if (worst && rank(worst) < cardRank(EK, c.id)) {
      EK.G.deck = EK.G.deck.filter((u) => u !== worst.u);
      EK.G.deck.push(c.u);
    }
  };

  /**
   * Gems buy chests, and the probe was walking past them with 237 in its pocket
   * at Crown Hollow — the whole second half of the card economy, unmeasured.
   * A player buys the best chest they can afford when they are in town, so that
   * is the rule: best affordable, once a visit, and anything better than the
   * worst card in the deck goes in.
   */
  const buyChest = () => {
    const kinds = EK.CHEST_IDS.slice().sort((a, b) => EK.CHESTS[b].cost - EK.CHESTS[a].cost);
    const kind = kinds.find((k) => (EK.G.gems || 0) >= EK.CHESTS[k].cost);
    if (!kind) return;
    const got = EK.openChest(kind);
    // grantCard puts a pull straight into the deck whenever there is room, which
    // is the one path a ban leaks through — early, before the deck fills.
    if (BANS.length) EK.G.deck = EK.G.deck.filter((u) => !banned((EK.ownedCard(u) || {}).id));
    if (got) for (const c of got) tryDeck(c);
  };

  /**
   * Walking back to town is also when you restock.
   *
   * The shop sells seven things and this used to buy the two cheapest — five
   * bloom orbs and four salves — then stop, which is why the report showed
   * 1093-2995 shards sitting unspent at Crown Hollow and called it a currency
   * with no sink. The sink was there; the shopping list was the problem. A
   * player who is rich buys better orbs (`orbToThrow` already reaches for a
   * prism orb before a bloom orb) and carries more salves, so that is the rule:
   * top up the floor first, then spend what is left over on the good stuff.
   */
  const buy = (id, n) => {
    while ((EK.G.bag[id] || 0) < n && EK.G.money >= EK.ITEMS[id].cost) {
      EK.G.money -= EK.ITEMS[id].cost;
      EK.G.bag[id] = (EK.G.bag[id] || 0) + 1;
    }
  };
  const restock = () => {
    buyChest();
    buy('bloomorb', 5);                       // the floor: never out of orbs
    buy('salve', 4);                          // or out of salves
    if (EK.G.money > 1500) { buy('prismorb', 3); buy('gleamorb', 4); }
    if (EK.G.money > 800) buy('salve', 10);   // rich enough to stop rationing
  };
  restock();

  /** Fight what is in front of us with a plain, honest policy. */
  const fight = (duelId) => {
    const b = EK.B();
    if (!b) return;
    if (!duelId) stat.fights++;

    // How much of the whole party is still standing, not how much of whichever
    // kin happens to be out. A fight you won by rotating through three hurt kin
    // was reading as never in doubt, because the one on the field kept being a
    // fresh one.
    const partyHp = () => {
      const live = EK.G.party.length ? EK.G.party : [b.mine];
      return live.reduce((a, m) => a + Math.max(0, m.hp) / Math.max(1, m.max), 0) / live.length;
    };
    const startHp = partyHp();
    // How close the worst-off kin came to going down, watched all fight.
    //
    // "Never in doubt" reads the party mean, and a mean has a party size in it:
    // with four kin, one of them being taken to zero — a fight that genuinely
    // went wrong — is 25% party damage, which sails under the 30% bar. It is the
    // same denominator that made `cost of a fight` look like a threefold gap
    // between the modes when it was the same number twice. This one is about a
    // kin, so it means the same thing whether you brought one or six.
    const worstKin = () => {
      const live = EK.G.party.length ? EK.G.party : [b.mine];
      return Math.min(...live.map((m) => Math.max(0, m.hp) / Math.max(1, m.max)));
    };
    const startWorst = worstKin();
    let low = startHp, worst = startWorst, turns = 0, guard = 0, planBeats = 0, drank = false;
    // Both halves of the played/drawn ratio, counted the same way: once per card
    // per fight. See the fix note at the loop below for why the numerator has to
    // match the denominator.
    const seenCards = new Set(), playedCards = new Set(), affordCards = new Set();
    const cardKey = (c) => (c.src === 'kin' ? `kin:${c.id}` : c.id);
    // What the fight looks like before it starts: the best element multiplier
    // either side can bring, and the level gap. If two fights in five really are
    // decided in advance, this is where the deciding happens.
    const bestEff = (atk, def) => Math.max(...atk.moves
      .filter((m) => EK.MOVES[m.id].pow)
      .map((m) => EK.effect(EK.MOVES[m.id].type, def.types)), 0);
    const mine = bestEff(b.mine, b.foe), theirs = bestEff(b.foe, b.mine);
    const gap = b.mine.lvl - b.foe.lvl;
    const band = (e) => e >= 2 ? 'strong' : e <= .5 ? 'weak' : 'even';
    const key = `${band(mine)} into ${band(theirs)}`;

    // The answer to a bad matchup is the one the game already has: send
    // somebody else. A probe with one kin cannot do that, which is why every
    // fight it measured was decided by the element chart before a card was
    // played. Switching costs the turn — that is the price of the read.
    const swapIn = () => {
      const live = EK.B();
      if (!live || live.over || live.phase !== 'player') return false;
      const cur2 = live.mine;
      const mineEff = bestEff(cur2, live.foe);
      // Switch out of trouble, not into every edge. Switching on any upgrade at
      // all is what a spreadsheet does; a player does it when the kin on the
      // field is the wrong one — resisted, or nearly out — because it costs a
      // turn, the hand, everything the deck has stacked up, and a hit that
      // lands harder for catching you mid-change.
      const inTrouble = mineEff < 1 || cur2.hp / cur2.max < .35;
      if (!inTrouble) return false;
      let pick = -1, bestScore = mineEff * (cur2.hp / cur2.max);
      EK.G.party.forEach((m, i) => {
        if (m === cur2 || m.hp <= 0) return;
        const score = bestEff(m, live.foe) * (m.hp / m.max);
        if (score > bestScore * 1.6) { pick = i; bestScore = score; }
      });
      if (pick < 0) return false;
      EK.doAction({ kind: 'switch', idx: pick });
      stat.switched++;
      return true;                                // the caller counts the turn
    };
    // A switch spends the turn, so it has to be counted as one. It was not, and
    // that is most of why party fights looked like they were over in one: half
    // of those fights were a switch and a swing.
    // Count the opening telegraph before anything is done about it: switching
    // spends a turn, so the foe works a beat during it, and a fight that opened
    // with a switch was reading as though its plan had never been shown.
    if (b.intent && b.intent.kind === 'plan') planBeats++;
    let counted = !!(b.intent && b.intent.kind === 'plan');
    if (!SOLO && EK.G.party.length > 1 && swapIn()) turns++;
    while (EK.G.battle && !EK.B().over && guard++ < 300) {
      const cur = EK.B();
      if (cur.intent && cur.intent.kind === 'plan' && !counted) planBeats++;
      counted = false;
      // Once per card, not once per turn it is sitting in your hand. A retained
      // card stays in hand all fight, so counting the hand every turn counted it
      // four times against the one time it can be played — which is why the
      // bottom of the played/drawn table was Dewdrop, Hunker, Bulwark and Ward
      // Stance, i.e. every card with Retain on it. The cards were fine; the
      // denominator was counting the same card over and over.
      //
      // And that fix, made on its own, broke the other half: `drawn` became once
      // per fight while `played` stayed once per play, so a kin move playable
      // every turn scored 221%. Twenty-two rows of the table read over 100% — a
      // number that cannot mean anything under the heading it is printed with.
      // Both sides are counted the same way now, so the ratio reads: of the
      // fights where this card reached your hand, the share where it was worth
      // playing at least once.
      //
      // It also has to be read whenever the hand changes, not only at the top of
      // the turn. Draw effects put cards into the hand mid-turn and the policy
      // can play them in the same pass, so those cards were being played without
      // ever being counted as drawn — eight rows still read over 100% after the
      // first half of this fix, all of them cheap or free cards that come off a
      // draw. `noteHand` is called before every decision that reads the hand.
      const noteHand = () => {
        for (const c of cur.hand) {
          const k = cardKey(c);
          if (seenCards.has(k)) continue;
          seenCards.add(k);
          bump(stat.drawn, k);
        }
      };
      noteHand();
      // The policy is part of the measurement. Cheapest-first cannot tell a
      // good deck from a big one, because it never sets anything up: it plays
      // the Chain card while the discount is still zero and the Combo card
      // while the bonus is still nothing. So play the turn in two passes, the
      // way a player learns to within about three fights:
      //
      //   1. enablers — cheap cards with no Combo or Chain on them
      //   2. payoffs  — everything that is worth more for having waited
      //
      // Inside each pass, cheapest first.
      const wants = (c) => {
        if (c.src === 'kin') return true;
        const def = EK.CARDS[c.id];
        // Hold a retained heal while healthy — that is the whole point of it.
        if (def.retain && def.vt === 'heal' && cur.mine.hp > cur.mine.max * .6) return false;
        // A heal at full health is a wasted card whatever else it says.
        if (def.vt === 'heal' && !def.retain && cur.mine.hp > cur.mine.max * .85) return false;
        // A second swing is worth nothing before the first one, and worth nothing
        // if there is no kin move left in hand to spend it on.
        if (def.fx && def.fx.again) {
          if (!cur.swungTurn) return false;
          const cheapest = Math.min(...cur.hand.filter((h) => h.src === 'kin').map((h) => EK.cardCost(h)), Infinity);
          if (!(cheapest <= cur.energy - EK.cardCost(c))) return false;
        }
        return true;
      };
      // What a card is worth, in points of HP, if it is played right now.
      //
      // Cheapest-first is what a beginner does, and it is why every two-energy
      // card looked dead: with three energy and the swing reserved out of it, a
      // 2-cost card only ever got played when two 1-cost cards had not already
      // eaten the budget. That measured the ordering, not the card. This scores
      // instead — damage added, damage prevented, health restored — and buys the
      // best points per energy it can afford.
      const swingDmg = () => {
        let best = 0;
        for (const h of cur.hand) {
          if (h.src !== 'kin' || !EK.MOVES[h.id].pow) continue;
          best = Math.max(best, EK.damageOf(cur.mine, cur.foe, h.id, { crit: false, roll: .925 }).dmg);
        }
        return best || 8;
      };
      /** Turns this fight probably has left — what a lasting card gets to be worth. */
      const runway = () => {
        const swing = Math.max(1, swingDmg());
        return Math.max(1, Math.min(4, Math.ceil(cur.foe.hp / swing)));
      };
      const worth = (c) => {
        const d = EK.CARDS[c.id];
        if (!d) return 0;
        const fx = d.fx || {};
        // Exactly what the game does when the card resolves: `value` is the
        // card's grown value plus its combo bonus if anything has been played
        // this turn. Only the 0.95 nudge below knew combo existed, and that is a
        // penalty — so Berserk, Shieldwall and Whetstone were scored below their
        // base value for carrying an upside.
        const base = EK.cardValue(EK.ownedCard(c.u) || { id: c.id, plus: 0 }) || d.v;
        const v = base + (d.combo && (cur.playedTurn || 0) > 0 ? d.combo : 0);
        const left = runway(), hurt = cur.mine.max - cur.mine.hp;
        let pts = 0;
        if (d.vt === 'edge') pts += v;                        // one swing
        if (d.vt === 'atk') pts += v * left;
        if (d.vt === 'def') pts += v * left;                  // damage off every hit
        // `might` is not a buff, it is a purchase: G.might is saved with the run
        // and added to every attack from every kin for the rest of it. This used
        // to read `v * left * 2` — the fight's runway, capped at four turns, with
        // a x2 fudge for "outlives this fight". A run has eighty-odd fights left
        // at any point, so +2 damage a swing is worth several hundred points, not
        // eight, and the probe was passing on it: Temper played 31% of the fights
        // it could be paid for and Grit 44%, and every read of the might cards for
        // six passes was taken through that.
        //
        // MIGHT_FIGHTS is a floor, not an estimate. The true horizon is the rest
        // of the run; a dozen fights is the number that makes these rank like a
        // permanent without making them the answer to every turn.
        if (d.vt === 'might') pts += v * left * MIGHT_FIGHTS;
        if (d.vt === 'shield') pts += v;                      // damage it will eat
        if (d.vt === 'heal') pts += Math.min(v, hurt);
        if (d.vt === 'maxhp') pts += Math.min(v, hurt) + v * .4;
        if (d.vt === 'draw') pts += v * 3;                    // a card is worth about a card
        // An energy every turn is a card every turn, for the rest of the fight.
        // Three legendaries scored zero for want of a branch here — Eternal Spark
        // was taken 4 times and played 0 of 182 draws — which is the pass-12
        // lesson repeating on the person who wrote it down: if a card looks dead,
        // suspect the policy first.
        if (d.vt === 'energy') pts += v * 6 * left;
        if (fx.def) pts += fx.def * left;
        if (fx.heal) pts += Math.min(fx.heal, hurt);
        if (fx.healFull) pts += hurt;
        if (fx.atk) pts += fx.atk * left;
        if (fx.energy) pts += 5;
        // A card is worth about a card, whether the card says so in `vt` or in
        // `fx`. Only the `vt` half was scored, so Ward Stance's draw and War
        // Cry's two were free and invisible: Ward Stance is drawn 2,700 times in
        // sixty runs and played 19% of them, the lowest rate of anything that is
        // not a three-cost. Third time a missing branch in this function has been
        // mistaken for a dead card. Look here first, every time.
        if (fx.draw) pts += fx.draw * 3;
        if (fx.hits) pts += swingDmg() * fx.hits * left;      // the answer to one swing a turn
        if (fx.mul) pts += swingDmg() * (fx.mul - 1) * left;
        if (fx.drain) pts += swingDmg() * fx.drain;
        if (fx.thorns) pts += fx.thorns * left;
        if (fx.st) pts += 3 * left;
        if (fx.selfdmg) pts -= fx.selfdmg;
        if (d.kill) pts += d.kill * 4;                        // permanent, on every kill
        if (fx.again) pts += swingDmg();                      // one more swing, this turn
        // A Combo or Chain card is worth more for having waited, so it goes last
        // among equals — that is the whole reason those keywords exist.
        if (d.combo || d.chain) pts *= .95;
        return pts;
      };
      // Whatever else it does, a turn ends in a swing. Reserve the price of the
      // cheapest kin move first — a policy that spends its last energy on a
      // shield and then passes is not measuring the game, it is measuring
      // itself, and the first version of this took thirty-seven turns a fight.
      const kinCost = () => {
        let c = Infinity;
        for (const h of cur.hand) if (h.src === 'kin') c = Math.min(c, EK.cardCost(h));
        if (c === Infinity) return 0;
        // A card that buys a second swing needs the whole turn reserved for it —
        // swing, card, swing — or the support pass spends the budget first and
        // the card is unplayable by the time its own condition is met. It read 1
        // play in 196 draws until this was here, which would have measured the
        // one card in the set that changes a rule as worthless.
        const again = cur.hand.find((h) => h.src !== 'kin' && EK.CARDS[h.id]
          && EK.CARDS[h.id].fx && EK.CARDS[h.id].fx.again);
        if (again) {
          const whole = c * 2 + EK.cardCost(again);
          if (whole <= cur.energy) return whole;
        }
        return c;
      };
      const support = (reserve) => {
        for (let spun = 0; spun < 10; spun++) {
          if (cur.over) break;
          noteHand();                  // the last play may have drawn into the hand
          let best = -1, bestRate = 0, couldWant = 0;
          for (let i = 0; i < cur.hand.length; i++) {
            const c = cur.hand[i];
            if (c.src === 'kin') continue;
            const cost = EK.cardCost(c);
            stat.handWorth += worth(c); stat.handN++;
            if (wants(c)) couldWant++;
            // Could this card have been paid for at a moment the policy was
            // choosing? played/drawn cannot tell a bad card from an unaffordable
            // one, and the whole table slopes with price for that reason alone:
            // the median is 100% at cost 0, 69% at 1, 30% at 2, 21% at 3. This
            // is the denominator that takes the price back out.
            if (cost <= cur.energy - reserve) {
              const ak = cardKey(c);
              if (!affordCards.has(ak)) { affordCards.add(ak); bump(stat.afford, ak); }
            }
            if (cost > cur.energy - reserve || !wants(c)) continue;
            const rate = worth(c) / Math.max(.5, cost);       // free cards are not infinitely good
            if (rate > bestRate) { best = i; bestRate = rate; }
          }
          // This note used to say a three-energy card can never be afforded
          // here, because the swing is always reserved out of three. That was
          // never true, and the `when payable` column is what showed it: Chain
          // discounts a card by one for every card already played this turn, so
          // Titanheart and Overkill are payable often and played 90% and 84% of
          // the times they are. Kinbond is the only three-cost without Chain, and
          // even it is payable in about two fights in five — it goes unplayed
          // because heal-to-full is worth only the HP you are missing, which is a
          // reading of the card, not of the budget.
          //
          // What remains true is that the reserve is never skipped. Letting the
          // policy skip the swing for a big enough card was tried in pass 22 and
          // is worse than the gap it closes: at a bar of 1.5x the swing it ate
          // the swing constantly and kin move play rates fell from 62-98% to
          // 24-42%, which measures the escape hatch rather than the game.
          // Why the turn stopped: out of energy with cards still worth playing,
          // or out of cards worth playing. An extra card is only worth something
          // in the second case.
          if (best < 0) { if (couldWant) stat.stopBroke++; else stat.stopDone++; break; }
          const card = cur.hand[best];
          stat.playWorth += worth(card); stat.playN++;
          if (!playedCards.has(card.id)) { playedCards.add(card.id); bump(stat.played, card.id); }
          EK.playCard(best);
        }
      };
      // A salve, before anything else, if the kin on the field is nearly out and
      // the deck has no answer in hand. The probe never once drank one, which
      // means every wipe it has ever reported was a wipe a player would have had
      // a bag to prevent — and the wipe rate is the number three passes of
      // tuning steered by. It costs the turn, the same as it does for a trainer.
      // A salve is for a hit the telegraph says will kill you, and only when it
      // would actually stop it. Drinking on any dip below a third turned into a
      // spiral — nearly three a fight, because a hurt kin is still hurt after one
      // — and took the average fight to six turns. Once, and only if it works.
      const incoming = cur.intent && cur.intent.kind === 'attack' ? (cur.intent.dmg || 0) : 0;
      const salveAmt = EK.ITEMS.salve.amt;
      if ((EK.G.bag.salve || 0) > 0 && !cur.over && !drank
        && incoming >= cur.mine.hp                 // the telegraph says this one kills
        && cur.mine.hp + salveAmt > incoming       // and this is enough to live through it
        && !cur.hand.some((c) => c.src !== 'kin' && EK.CARDS[c.id]
          && EK.CARDS[c.id].vt === 'heal' && EK.cardCost(c) <= cur.energy)) {
        drank = true;
        EK.doAction({ kind: 'item', id: 'salve', target: EK.G.party.indexOf(cur.mine) });
        stat.salves++;
        turns++;
        low = Math.min(low, partyHp()); worst = Math.min(worst, worstKin());
        continue;
      }
      support(kinCost());                       // set up, keeping the swing affordable
      // One swing a turn — take the best one you can pay for.
      // When the turn is being held open for a second swing, the first one has to
      // be the cheap move, not the big one. Swinging with the best move ate the
      // reserve and left nothing to pay for the card — Second Wind read 2 plays
      // in 306 draws until this was here, which is a policy measuring its own
      // habits rather than the card.
      const swing = (cap) => {
        if (cur.over || cur.swungTurn) return false;
        noteHand();
        let pick = -1, bestDmg = -1;
        for (let i = 0; i < cur.hand.length; i++) {
          const c = cur.hand[i];
          if (c.src !== 'kin' || EK.cardCost(c) > Math.min(cur.energy, cap == null ? Infinity : cap)) continue;
          const d = EK.MOVES[c.id].pow ? EK.damageOf(cur.mine, cur.foe, c.id, { crit: false, roll: .925 }).dmg : 1;
          if (d > bestDmg) { pick = i; bestDmg = d; }
        }
        if (pick < 0) return false;
        const k = cardKey(cur.hand[pick]);
        if (!playedCards.has(k)) { playedCards.add(k); bump(stat.played, k); }
        EK.playCard(pick);
        return true;
      };
      // The budget for the first swing when a second one is planned: everything
      // except the card and the cheapest move to spend it on.
      const againCard = cur.hand.find((h) => h.src !== 'kin' && EK.CARDS[h.id]
        && EK.CARDS[h.id].fx && EK.CARDS[h.id].fx.again);
      const cheapKin = Math.min(...cur.hand.filter((h) => h.src === 'kin').map((h) => EK.cardCost(h)), Infinity);
      const firstCap = againCard && cheapKin < Infinity
        ? cur.energy - EK.cardCost(againCard) - cheapKin : null;
      // ...but a cap that finds no move at all is worse than a big swing: it
      // passes the turn. Fall back rather than starve — that read 0 plays and
      // 4.60 turns a fight, the policy paying for its own plan.
      if (!(firstCap != null && firstCap >= cheapKin && swing(firstCap))) swing();
      support(0);                               // then spend whatever is left
      // A card that clears the one-swing flag is worth nothing unless somebody
      // takes the extra swing. Second Wind is the first card in the set that
      // changes a rule rather than a number, and a policy written around the old
      // rule would have measured it at zero and called the card a failure.
      if (swing()) support(0);
      // The turn you win on is still a turn. Breaking here without counting it
      // meant a fight where the player swung twice and the foe answered once
      // was filed under "over in one turn" — which is the metric party mode has
      // been failing for four passes, and a third of it was this.
      if (cur.over) { turns++; break; }
      // Softened up, room in the party, an orb in the bag, and not one of these
      // already: throw. A run that never catches anything is not a run.
      if (!duelId && cur.wild && !cur.legendary && orbToThrow()
        && EK.G.party.length < PARTY_WANT
        && cur.foe.hp / cur.foe.max < .35
        && !EK.G.party.some((m) => m.species === cur.foe.species)) {
        EK.doAction({ kind: 'item', id: orbToThrow(), target: 'foe' });
        stat.thrown++;
        if (EK.B() && EK.B().over) break;
        turns++;
        continue;
      }
      // A fight going badly is one a person runs from: the next hit kills, the
      // bag has nothing that stops it, and there is nobody healthy to send.
      // Never fleeing pushed the wipe rate up by counting losses nobody would
      // have stood still for.
      if (cur.wild && !cur.over && incoming >= cur.mine.hp
        && !EK.G.party.some((m) => m !== cur.mine && m.hp > m.max * .5)) {
        EK.doAction({ kind: 'run' });
        stat.fled += EK.B() && EK.B().over === 'fled' ? 1 : 0;
        turns++;
        if (EK.B() && EK.B().over) break;
        low = Math.min(low, partyHp()); worst = Math.min(worst, worstKin());
        continue;
      }
      EK.endTurn();
      turns++;
      low = Math.min(low, partyHp()); worst = Math.min(worst, worstKin());
    }
    if (duelId) {
      const d = stat.duels.get(duelId) || { n: 0, turns: 0, lost: 0, low: 0, telegraphs: 0, swaps: 0, heals: 0 };
      d.n++; d.turns += turns; d.low += low;
      d.swaps += b.foeSwaps || 0; d.heals += b.foeHeals || 0;
      if (EK.B() && EK.B().over === 'lose') d.lost++;
      d.telegraphs += planBeats;
      stat.duels.set(duelId, d);
    }
    stat.turns += duelId ? 0 : turns;
    if (!duelId && turns <= 1) stat.oneTurn++;
    // The one piece of structure a wild fight has, and nothing has ever counted
    // it. A cornered wild kin gathers its damage into one telegraphed swing
    // instead of four small ones — that is the only beat in the fight, and six
    // passes of "wild fights have no shape" were written without knowing whether
    // it ever fires or how late.
    if (!duelId && b.wild) {
      stat.wildFights++;
      stat.corners += (EK.B() ? EK.B().cornered : b.cornered) || 0;
      stat.wildBeats += planBeats;
      if (!((EK.B() ? EK.B().cornered : b.cornered) || 0)) stat.wildNoBeat++;
    }
    // How much of the foe's health a single player turn takes off, which is the
    // number that decides how long a fight is.
    if (b.foe.max > 0 && !duelId) {
      stat.foeHp += b.foe.max;
      stat.foeHpSeen++;
      stat.dpt += (b.foe.max / Math.max(1, turns + 1)) / b.foe.max;
    }
    // A fight you were never in danger of losing is a cutscene with buttons.
    if (low > .7 && !duelId) stat.noDoubt++;
    if (worst > .7 && !duelId) stat.noDoubtKin++;
    if (!duelId) {
      const drop = Math.max(0, startHp - low);
      stat.cost += drop;
      // …and the same thing again in kin, not in fractions of a party. `partyHp`
      // is a mean, so the very same swing reads as a quarter as much damage to a
      // party of four as to one kin alone. Reported both ways because comparing
      // the raw percentages across the two modes compares denominators.
      stat.costKin += drop * Math.max(1, EK.G.party.length);
      stat.costN++;
    }
    if (!duelId) {
      const m = stat.matchup.get(key) || { n: 0, free: 0, lost: 0, turns: 0, gap: 0 };
      m.n++; m.turns += turns; m.gap += gap;
      if (low > .7) m.free++;
      if (EK.B() && EK.B().over === 'lose') m.lost++;
      stat.matchup.set(key, m);
    }
    const over = EK.B() ? EK.B().over : null;
    if (over === 'lose' && !duelId) stat.wipes++;
    // The real flow adds the caught kin on the way out of the battle; the probe
    // tears the battle down itself, so it has to do that bit too.
    if (over === 'caught') { stat.caught++; EK.addCaught(b.foe); }
    // Take the card the win offers, the way a run really does — otherwise the
    // deck never grows and "never drawn" only measures the starter deck.
    // Trainers hand you a card too — `withReward` runs on both branches of the
    // real win path — and the probe was skipping it. That is why the entire
    // legendary tier read as "never drawn in any run": `REWARD_ODDS.wild` has
    // legendary at 0, so a trainer win is the only place in a normal run one can
    // come from, and the probe was throwing every one of them away.
    if (over === 'win' && EK.G.battle) {
      // The win pays, and the probe was never collecting. `over === 'win'` in the
      // real game hands over gems on every win and a trainer's prize on top of a
      // duel, and this loop drives combat directly so it skipped both. The run
      // started with 500 shards, spent them on the first restock and was broke
      // for the remaining hundred-odd fights — so every salve, orb and walk-back
      // number this tool has ever reported was measured on a player with no
      // income. Gems are the chest currency and were sitting at exactly zero at
      // Crown Hollow in every run, which is a whole reward economy the report
      // could not see.
      EK.G.gems = (EK.G.gems || 0) + EK.gemReward(EK.B());
      if (EK.B().npc) EK.G.money += EK.B().npc.trainer.prize;
      let offer = EK.rollReward(EK.B());
      if (BANS.length && offer) offer = offer.filter((id) => !banned(id));
      if (offer && offer.length) {
        // The best card on offer, not a coin toss between them. Picking at
        // random depressed played/drawn across the whole pool, which is the
        // instrument the deck work in passes 9, 10 and 12 was steered by: a deck
        // built out of random picks is worse than any deck a person would hold.
        let pick = offer[0];
        for (const id of offer) if (cardRank(EK, id) > cardRank(EK, pick)) pick = id;
        // The real reward screen asks which card comes out when the deck is
        // full. Answer it the way a player would: drop the one played least.
        // The real reward screen asks which card comes out when the deck is
        // full; the reward is always taken, so this swap is unconditional where
        // tryDeck's is not.
        const c = EK.grantCard(pick, true);
        if (!EK.G.deck.includes(c.u)) {
          const inDeck = EK.G.deck.map(EK.ownedCard).filter(Boolean).filter((o) => !pinned.has(o.u));
          const rank = (o) => cardRank(EK, o.id) + Math.min(0.9, (o.plays || 0) / 1000);
          let worst = inDeck[0];
          for (const o of inDeck) if (rank(o) < rank(worst)) worst = o;
          if (worst) { EK.G.deck = EK.G.deck.filter((u) => u !== worst.u); EK.G.deck.push(c.u); }
        }
        bump(stat.taken, pick);
      }
    }
    EK.G.battle = null; EK.G.battleMsg = null; EK.G.screen = null;
    EK.G.mode = 'world'; EK.G.flourish = null;
  };

  /** Walk in the grass until the party hits a level, or we give up. */
  const grindTo = (mapId, level, cap = 4000) => {
    const grass = [];
    if (!EK.MAPS[mapId] || !EK.MAPS[mapId].rows) return;
    const rows = EK.MAPS[mapId].rows;
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === ',') grass.push([x, y]);
    }
    if (!grass.length) return;
    let i = 0;
    while (stat.steps < cap) {
      const top = Math.max(...EK.G.party.map((m) => m.lvl));
      if (top >= level) break;
      // Walk between two adjacent grass tiles: the same thing a player does.
      const [gx, gy] = grass[i++ % grass.length];
      EK.enterMap(mapId, gx, gy, 'down');
      EK.G.player.px = gx; EK.G.player.py = gy;
      const before = EK.G.party.map((m) => m.lvl);
      EK.onArrive();
      stat.steps++;
      if (EK.G.battle) fight();
      stat.levels += EK.G.party.reduce((n, m, k) => n + (m.lvl - (before[k] || m.lvl)), 0);
      // Too hurt to carry on? A player walks back to town, and that walk is the
      // thing we are counting.
      const hurt = EK.G.party.every((m) => m.hp <= 0)
        || EK.G.party.reduce((a, m) => a + m.hp / m.max, 0) / EK.G.party.length < .3;
      if (hurt) { stat.healTrips++; EK.healParty(); restock(); }
    }
  };

  /**
   * Fight a named trainer at whatever state the run is actually in.
   *
   * This used to heal first, on the grounds that a trainer measured on the fumes
   * of the last wild kin is measuring the walk to town instead. That was the
   * wrong call, and it took four passes to notice: healing first meant every
   * trainer was measured against four rested kin, which is a fight no trainer in
   * the valley can win and not a fight anybody actually has. A player arrives
   * having walked the route. What the party has left when it gets there is the
   * fight.
   */
  const duel = (mapId, npcId) => {
    const npc = (EK.MAPS[mapId].npcs || []).find((n) => n.id === npcId);
    if (!npc) return;
    if (RESTED) EK.healParty();
    const team = EK.trainerTeam(npc);
    EK.startBattle({ foe: EK.mkMon(team[0][0], team[0][1]), team, npc, wild: false });
    fight(npcId);
    EK.G.battle = null; EK.G.battleMsg = null; EK.G.screen = null;
    EK.G.mode = 'world'; EK.G.flourish = null;
    // Losing to a trainer sends you back to town, same as any other wipe.
    if (EK.G.party.every((m) => m.hp <= 0)) { EK.healParty(); restock(); }
  };

  for (const leg of ROUTE) {
    grindTo(leg.map, leg.target);
    for (const id of leg.duels || []) duel(leg.map, id);
  }
  stat.gems = EK.G.gems;
  stat.party = EK.G.party.length;
  stat.starter = ONLY || EK.STARTERS[runIdx % EK.STARTERS.length];
  stat.top = Math.max(...EK.G.party.map((m) => m.lvl));
  stat.deck = EK.G.deck.length;
  stat.might = EK.G.might || 0;
  stat.money = EK.G.money || 0;
  stat.bagN = Object.values(EK.G.bag || {}).reduce((x, n) => x + (n || 0), 0);
  {
    const owned = new Map((EK.G.cards || []).map((c) => [c.u, c]));
    const inDeck = (EK.G.deck || []).map((u) => owned.get(u)).filter(Boolean);
    stat.deckN = inDeck.length;
    // Card growth is capped per card at 4x its own value. Nothing caps the sum,
    // and the sum is what a deck actually hits with.
    stat.grown = inDeck.reduce((x, c) => x + (c.plus || 0), 0);
    stat.grownCap = inDeck.reduce((x, c) => x + EK.growCap(c.id), 0);
    stat.deckMix = {};
    for (const c of inDeck) {
      const r = EK.CARDS[c.id].r;
      stat.deckMix[r] = (stat.deckMix[r] || 0) + 1;
    }
    // Is the reward system building a deck or a pile? Count how much of the deck
    // is the three cards it holds most of.
    const byId = new Map();
    for (const c of inDeck) byId.set(c.id, (byId.get(c.id) || 0) + 1);
    stat.deckTop = [...byId.values()].sort((a, b) => b - a).slice(0, 3).reduce((x, n) => x + n, 0);
  }
  return stat;
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(playOne(i));

const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
const pct = (n, d) => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;

/**
 * A rate, with the room it has to be wrong in.
 *
 * Every per-fight rate in this report is one number standing in for a dozen
 * runs that disagree with each other, and the disagreement is not small: the
 * solo wipe rate came back anywhere from .155 to .364 on *identical* builds, so
 * three passes' worth of claims about it were noise wearing a decimal point.
 *
 * `rate(f)` takes the per-run rate, then reports the mean and a 95% interval
 * (1.96 standard errors of the mean). Read the interval first. If two builds'
 * intervals overlap, the tool has not told you which is better, and no amount of
 * staring at the means will change that — run more, or steer by something else.
 */
const rate = (f, per) => {
  const xs = runs.map((r) => f(r) / Math.max(1, per(r)));
  const n = xs.length;
  const mean = xs.reduce((a, x) => a + x, 0) / n;
  if (n < 2) return { mean, lo: mean, hi: mean, half: 0, n };
  const varr = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1);
  const half = 1.96 * Math.sqrt(varr / n);
  return { mean, lo: Math.max(0, mean - half), hi: mean + half, half, n };
};
const show = (r, dp = 3) => `${r.mean.toFixed(dp)} ±${r.half.toFixed(dp)}`;
const showPct = (r) => `${(r.mean * 100).toFixed(0)}% ±${(r.half * 100).toFixed(0)}`;
const perFight = (r) => r.fights;
const perRun = () => 1;
/**
 * Every number below says what it is divided by, because five passes running
 * turned up a metric whose meaning changed with the party size, the run length
 * or the fight count — and three of those were the same mistake.
 *
 * Two rules, learned the hard way:
 *
 *   1. Average the ratios, never ratio the averages. `avg(x) / avg(fights)`
 *      lets a long run outvote a short one, which is not what "per fight" means.
 *      Everything goes through `rate()`, which takes each run's own ratio.
 *   2. If a quantity divides by the party, it is not comparable between the two
 *      modes. Those lines have a party-free twin printed under them, and the
 *      twin is the one to compare.
 */

const fights = avg((r) => r.fights), steps = avg((r) => r.steps);
console.log(`\nEMBERKIN — ${RUNS} run${RUNS > 1 ? 's' : ''} from the study to Crown Hollow`
  + `${SOLO ? ', one kin, no switching' : ''}${RESTED ? ', rested before every trainer' : ''}`
  + `${BUILD === 'rarity' ? '' : `, building for ${BUILD}`}`
  + `${BANS.length ? `, without ${BANS.join(' and ')}` : ''}${FORCE ? `, with ${FORCE_N}x ${FORCE}` : ''}`
  + `${ONLY ? `, ${ONLY} only` : ''}\n`);
console.log(`  steps walked        ${steps.toFixed(0)}   per run, to reach level ${avg((r) => r.top).toFixed(0)}`);
console.log(`  fights              ${fights.toFixed(0)}   per run;  one every ${show(rate((r) => r.steps, perFight), 1)} steps`);
// Every rate carries a 95% interval. Two builds whose intervals overlap have
// not been told apart by this tool, however different their means look.
console.log(`  never in doubt      ${showPct(rate((r) => r.noDoubt, perFight))} of fights   [party mean — NOT comparable across modes]`);
console.log(`     no kin in doubt   ${showPct(rate((r) => r.noDoubtKin, perFight))} of fights   [worst kin — compare this one]`);
console.log(`  cost of a fight     ${showPct(rate((r) => r.cost, (r) => r.costN))} of the party   [party mean — NOT comparable]`);
console.log(`     the same, in kin  ${show(rate((r) => r.costKin, (r) => r.costN), 2)} kin-bars   [compare this one]`);
console.log(`  turns per fight     ${show(rate((r) => r.turns, perFight), 2)}   per fight`);
console.log(`  over in one turn    ${showPct(rate((r) => r.oneTurn, perFight))} of fights`);
// What the foe's side of a wild fight actually looks like: whether its one
// telegraphed beat ever happens before the fight is over.
console.log(`  wild fights with no beat at all  ${showPct(rate((r) => r.wildNoBeat, (r) => r.wildFights))} of wild fights`
  + `   [the foe never got cornered]`);
console.log(`  cornered beats      ${show(rate((r) => r.corners, (r) => r.wildFights))} per wild fight`);
console.log(`  telegraphed beats   ${show(rate((r) => r.wildBeats, (r) => r.wildFights))} per wild fight   [the plan, not the cornering]`);
console.log(`  foe max HP          ${show(rate((r) => r.foeHp, (r) => r.foeHpSeen), 0)}   per wild kin, at level ${avg((r) => r.top).toFixed(0)}`);
// Absolute counts are dominated by how long a run happened to take, and runs
// vary a lot — normalise, or you end up comparing two samples of noise.
// The heal trip fires off a party mean too — four kin have to take four times
// the damage to trigger it — so it is a within-mode number only.
console.log(`  walks back to heal  ${show(rate((r) => r.healTrips, perFight))} per fight   [party mean trigger — within-mode only]`);
console.log(`  wipes               ${show(rate((r) => r.wipes, perFight))} per fight   [a party is genuinely harder to wipe; that part is real]`);
// How many runs a claim of a given size would actually need, from the spread
// this sample just showed. Printed so that "it moved" can be checked rather
// than believed.
{
  const w = rate((r) => r.wipes, perFight);
  const sd = w.half / 1.96 * Math.sqrt(w.n);
  const need = (delta) => Math.max(2, Math.ceil(2 * (1.96 * sd / delta) ** 2));
  console.log(`     to call a .05 change in that: ~${need(.05)} runs;  .02: ~${need(.02)}`);
}
console.log(`  party at the end    ${avg((r) => r.party).toFixed(1)}   per run;  ${avg((r) => r.caught).toFixed(1)} caught from ${avg((r) => r.thrown).toFixed(1)} throws`);
console.log(`  salves drunk        ${show(rate((r) => r.salves, perFight))} per fight`);
console.log(`  ran from a fight    ${show(rate((r) => r.fled, perFight))} per fight`);
// Running away is not surviving, it is losing without the walk home. Teaching
// the probe to flee moved fights out of the wipe column and into this one and
// changed the danger not at all — solo went .196 wipes to .063 wipes plus .123
// runs — so this is the line to read when asking whether a fight can beat you.
console.log(`  lost or ran         ${show(rate((r) => r.wipes + r.fled, perFight))} per fight   [the danger line]`);
console.log(`  switched mid-fight  ${show(rate((r) => r.switched, perFight), 2)} per fight`);
console.log(`  ended at level      ${show(rate((r) => r.top, perRun), 1)}   per run\n`);

// Turns per fight has the widest interval in the report and has drifted up for
// three passes. Split by starter: if the three disagree, the spread is the
// element chart rather than noise, and no number of runs will narrow it.
{
  const byStarter = new Map();
  for (const r of runs) {
    const k = r.starter || '?';
    const cur = byStarter.get(k) || [];
    cur.push(r);
    byStarter.set(k, cur);
  }
  if (byStarter.size > 1) {
    console.log('  by starter          turns/fight   no kin in doubt   lost or ran');
    for (const [k, rs] of byStarter) {
      const sub = (f, per) => {
        const xs = rs.map((r) => f(r) / Math.max(1, per(r)));
        const m = xs.reduce((a, x) => a + x, 0) / xs.length;
        const v = xs.length > 1 ? xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) : 0;
        return { mean: m, half: 1.96 * Math.sqrt(v / xs.length) };
      };
      const t = sub((r) => r.turns, perFight);
      const d = sub((r) => r.noDoubtKin, perFight);
      const l = sub((r) => r.wipes + r.fled, perFight);
      console.log(`  ${k.padEnd(20)} ${show(t, 2).padStart(11)}   ${showPct(d).padStart(15)}   ${show(l).padStart(11)}`);
    }
    console.log('');
  }
}

// The trainers, one line each, in the order a run meets them. A plan that never
// gets telegraphed before the fight ends is a plan nobody sees.
const DUEL_ORDER = ['t_wick1', 't_pell', 't_dorn', 't_mio', 't_ivo', 't_wick2', 't_coll', 't_hale', 't_wick3'];
console.log('  trainer            fights  turns  lost  lowest HP  plan beats seen   swaps  potions');
for (const id of DUEL_ORDER) {
  let n = 0, turns = 0, lost = 0, low = 0, tel = 0, sw = 0, he = 0;
  for (const r of runs) {
    const d = r.duels.get(id);
    if (!d) continue;
    n += d.n; turns += d.turns; lost += d.lost; low += d.low; tel += d.telegraphs;
    sw += d.swaps || 0; he += d.heals || 0;
  }
  if (!n) { console.log(`  ${id.padEnd(18)}      -`); continue; }
  console.log(`  ${id.padEnd(18)} ${String(n).padStart(6)} ${(turns / n).toFixed(1).padStart(6)} `
    + `${pct(lost, n).padStart(5)} ${pct(low / n, 1).padStart(10)} ${(tel / n).toFixed(1).padStart(16)}`
    + `${(sw / n).toFixed(1).padStart(8)}${(he / n).toFixed(1).padStart(8)}`);
}
console.log('');

// How a fight reads before a blow is struck, against how it went. An average
// that never moves can still be two very different populations.
const mk = new Map();
for (const r of runs) for (const [k, v] of r.matchup) {
  const cur = mk.get(k) || { n: 0, free: 0, lost: 0, turns: 0, gap: 0 };
  for (const f of ['n', 'free', 'lost', 'turns', 'gap']) cur[f] += v[f];
  mk.set(k, cur);
}
const mkTotal = [...mk.values()].reduce((a, v) => a + v.n, 0);
console.log('  matchup (your best element into theirs)   share  never in doubt  lost  turns  lvl gap');
for (const [k, v] of [...mk].sort((a, b2) => b2[1].n - a[1].n)) {
  console.log(`  ${k.padEnd(40)} ${pct(v.n, mkTotal).padStart(5)} ${pct(v.free, v.n).padStart(15)} `
    + `${pct(v.lost, v.n).padStart(5)} ${(v.turns / v.n).toFixed(1).padStart(6)} ${(v.gap / v.n).toFixed(1).padStart(7)}`);
}
console.log('');

// What is a card worth? The scorer pays a flat 3 points for a drawn card, and
// that number decides whether a draw effect is a real effect or a decoration —
// Ward Stance's two cards are six points against fifteen shield. So measure it.
//
// An extra card is worth an average card ONLY on the turns you had energy left
// and nothing worth spending it on. On the turns you stopped because you were
// broke, an extra card is worth nothing: you could not have played it. So the
// honest value of a draw is the average card discounted by how often the turn
// ends card-poor rather than energy-poor.
{
  const sum = (k) => runs.reduce((a, r) => a + r[k], 0);
  const avgHand = sum('handWorth') / Math.max(1, sum('handN'));
  const avgPlay = sum('playWorth') / Math.max(1, sum('playN'));
  const broke = sum('stopBroke'), done = sum('stopDone');
  const cardPoor = done / Math.max(1, broke + done);
const EK0 = loadGame({});
  // What a run accumulates. Every other number in this report is per fight or
  // per run, which is exactly why nothing in it ever said that might reached
  // +499 against a 174 HP foe. If a quantity persists across fights, the
  // per-fight tables cannot see it — so it has to be printed here.
  {
    const st = (k) => {
      const xs = runs.map((r) => r[k]);
      const m = xs.reduce((a, x) => a + x, 0) / xs.length;
      const v = xs.length < 2 ? 0 : xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
      return `${m.toFixed(m < 10 ? 1 : 0)} ±${(1.96 * Math.sqrt(v / xs.length)).toFixed(m < 10 ? 1 : 0)}`;
    };
    console.log('  what a run accumulates          (bound)');
    console.log(`    might             +${st('might')}   damage on every attack   (capped ${EK0.MIGHT_CAP ?? '?'})`);
    console.log(`    card growth in deck +${st('grown')} of a possible ${(runs.reduce((a, r) => a + r.grownCap, 0) / runs.length).toFixed(0)}   (each card 4x its own value; the sum is unbounded)`);
    console.log(`    money             ${st('money')}   (spent on orbs and salves)`);
    console.log(`    gems              ${st('gems')}`);
    console.log(`    items in bag      ${st('bagN')}`);
    console.log(`    deck              ${st('deckN')} of ${EK0.DECK_MAX} cards; ${st('deckTop')} of them are the three it holds most of`);
    const mixOf = (rs) => {
      const mix = {};
      for (const r of rs) for (const [k, n] of Object.entries(r.deckMix || {})) mix[k] = (mix[k] || 0) + n;
      const tot = Object.values(mix).reduce((a, n) => a + n, 0) || 1;
      return EK0.RARITY_ORDER.filter((r) => mix[r]).map((r) => `${r} ${(100 * mix[r] / tot).toFixed(0)}%`).join(', ');
    };
    console.log(`    rarity mix        ${mixOf(runs)}`);

    // A good run's deck against a bad one's. Split by the danger line, thirds at
    // each end, so the question is what the decks of the runs that went well
    // actually look like — not what the average deck looks like.
    const byRisk = runs.slice().sort((a, b) =>
      (a.fled + a.wipes) / Math.max(1, a.fights) - (b.fled + b.wipes) / Math.max(1, b.fights));
    const k = Math.max(1, Math.floor(runs.length / 3));
    const band = (rs, label) => {
      const avg = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
      const half = (f) => {
        const m = avg(f), v = rs.length < 2 ? 0
          : rs.reduce((a, r) => a + (f(r) - m) ** 2, 0) / (rs.length - 1);
        return 1.96 * Math.sqrt(v / rs.length);
      };
      const lr = (r) => (r.fled + r.wipes) / Math.max(1, r.fights);
      console.log(`    ${label.padEnd(16)} lost or ran ${avg(lr).toFixed(3)} ±${half(lr).toFixed(3)}`
        + `   might +${avg((r) => r.might).toFixed(0)} ±${half((r) => r.might).toFixed(0)}`
        + `   growth +${avg((r) => r.grown).toFixed(0)} ±${half((r) => r.grown).toFixed(0)}`
        + `   top-3 ${avg((r) => r.deckTop).toFixed(1)}/12`);
      console.log(`    ${' '.repeat(16)} ${mixOf(rs)}`);
    };
    console.log('\n  the decks of the runs that went best, against the ones that went worst');
    band(byRisk.slice(0, k), 'best third');
    band(byRisk.slice(-k), 'worst third');
    console.log('');
  }
  console.log('  what a card is worth');
  console.log(`    average card in hand   ${avgHand.toFixed(1)} points`);
  console.log(`    average card played    ${avgPlay.toFixed(1)} points   (the policy picks the best, so this is a ceiling)`);
  console.log(`    turns that ended card-poor  ${(cardPoor * 100).toFixed(0)}%   (the rest ended out of energy, where a drawn card buys nothing)`);
  console.log(`    so a drawn card is worth  ${(avgHand * cardPoor).toFixed(1)}  — the scorer pays 3\n`);
}

// Which cards actually got played, and which ones sat there.
const all = new Map();
const cell = (k) => { if (!all.has(k)) all.set(k, { drawn: 0, played: 0, afford: 0 }); return all.get(k); };
for (const r of runs) {
  for (const [k, n] of r.drawn) cell(k).drawn += n;
  for (const [k, n] of r.played) cell(k).played += n;
  for (const [k, n] of r.afford) cell(k).afford += n;
}
const taken = new Map();
for (const r of runs) for (const [k, n] of r.taken) taken.set(k, (taken.get(k) || 0) + n);
// played/drawn slopes with price all on its own — a 2-cost is competing for a
// budget of two, so it loses picks it deserved to lose. `when payable` divides
// by the fights where the card could actually have been paid for at a moment the
// policy was choosing, which takes the price back out and leaves the card. Read
// that column for "is this card any good"; read played/drawn for "does it ever
// get to happen". A card that is never payable prints `never` rather than a
// percentage, because a percentage there is a number nobody should read.
const rows = [...all].map(([k, v]) => [k, v.drawn || 0, v.played || 0, v.afford || 0])
  .sort((a, b) => (a[2] / Math.max(1, a[1])) - (b[2] / Math.max(1, b[1])));
console.log('  card                 drawn  played  played/drawn  when payable');
for (const [k, d, p, af] of rows) {
  const when = k.startsWith('kin:') ? '' : (af ? pct(p, af) : 'never');
  console.log(`  ${k.padEnd(20)} ${String(d).padStart(5)} ${String(p).padStart(7)}  ${pct(p, d).padStart(12)}  ${when.padStart(12)}`);
}

// And the whole pool: anything never seen is a card no run ever built with.
const EK = loadGame({});
const never = EK.CARD_IDS.filter((id) => !all.has(id));
console.log(`\n  offered and taken but never worth playing:`);
for (const [k, n] of [...taken].sort((a, b) => b[1] - a[1])) {
  const seen = all.get(k) || { drawn: 0, played: 0 };
  // Judge "not worth playing" on the fights it could be paid for. A card that is
  // never payable is not a bad card, it is a card the budget never reaches, and
  // the two want different fixes.
  const base = seen.afford || seen.drawn;
  if (base && (seen.played || 0) / base > .25) continue;
  console.log(`    ${k.padEnd(18)} taken ${String(n).padStart(3)}  drawn ${String(seen.drawn || 0).padStart(4)}  played ${String(seen.played || 0).padStart(4)}`);
}
console.log(`\n  never drawn in any run (${never.length}/${EK.CARD_IDS.length}): ${never.join(', ') || 'none'}\n`);
