// EMBERKIN — a run, measured.
//
// Eight passes went into how the game looks and almost none into whether it is
// any good to play, and "is it boring" is not a thing you can answer by reading
// the source. So this plays it: a fresh save, the real controls, the real
// encounter tables, all the way from Rowan's study to Crown Hollow, and it
// counts the things that make a run tedious rather than describing them.
//
// What it reports, and why each number is worth having:
//
//   steps / encounters      how much walking buys how much game
//   never in doubt          fights where the player never dropped below 70% HP.
//                           A fight you cannot lose is a cutscene you have to
//                           press buttons through.
//   heal trips              times the party was too hurt to go on and the only
//                           cure was walking back to town
//   dead cards              cards drawn and never worth playing, and cards that
//                           were never even drawn because they are not in the
//                           deck anybody builds
//   turns per fight         a fight that takes twelve turns at level 5 is not
//                           hard, it is slow
//
//   node tools/emberkin/playthrough.mjs            # one run
//   node tools/emberkin/playthrough.mjs --runs 20  # twenty, averaged
import { loadGame, mkCtx } from '../../tests/emberkin_lib.mjs';

const argv = process.argv.slice(2);
const RUNS = Number(argv[argv.indexOf('--runs') + 1]) || (argv.includes('--runs') ? 10 : 5);
// Two very different games are hiding in one average. With a party you switch
// into every matchup and almost nothing can kill you; with one kin the element
// chart decides the fight before a card is played. `--solo` measures the second
// one, so a change can be judged against both instead of whichever is flattering.
const SOLO = argv.includes('--solo');

/** The route a real player walks, in order. */
const ROUTE = [
  { map: 'hollowbrook', target: 0, duels: ['t_wick1'] },
  { map: 'route_one', target: 12, duels: ['t_pell', 't_dorn'] },
  { map: 'stillmere', target: 15, duels: ['t_mio'] },
  { map: 'emberwood', target: 18, duels: ['t_ivo', 't_wick2', 't_coll', 't_hale'] },
  { map: 'crown_hollow', target: 26, duels: ['t_wick3'] },
];

function playOne() {
  const EK = loadGame({});
  EK.setCtx(mkCtx());
  EK.newGame();
  // Take the first starter, the way most players do.
  EK.G.mode = 'world';
  EK.takeStarter(EK.STARTERS[0]);
  EK.G.dialogue = null; EK.G.mode = 'world';

  const stat = {
    steps: 0, fights: 0, noDoubt: 0, wipes: 0, healTrips: 0, turns: 0,
    played: new Map(), drawn: new Map(), taken: new Map(), levels: 0, gems: 0,
    oneTurn: 0, foeHp: 0, foeHpSeen: 0, dpt: 0, caught: 0, thrown: 0, switched: 0,
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
  /** Walking back to town is also when you restock. */
  const restock = () => {
    while ((EK.G.bag.bloomorb || 0) < 5 && EK.G.money >= EK.ITEMS.bloomorb.cost) {
      EK.G.money -= EK.ITEMS.bloomorb.cost;
      EK.G.bag.bloomorb = (EK.G.bag.bloomorb || 0) + 1;
    }
  };

  /** Fight what is in front of us with a plain, honest policy. */
  const fight = (duelId) => {
    const b = EK.B();
    if (!b) return;
    if (!duelId) stat.fights++;
    const startHp = b.mine.hp / b.mine.max;
    let low = startHp, turns = 0, guard = 0, planBeats = 0;
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
      let pick = -1, bestScore = mineEff * (cur2.hp / cur2.max);
      EK.G.party.forEach((m, i) => {
        if (m === cur2 || m.hp <= 0) return;
        const score = bestEff(m, live.foe) * (m.hp / m.max);
        if (score > bestScore * 1.6) { pick = i; bestScore = score; }
      });
      if (pick < 0) return false;
      EK.doAction({ kind: 'switch', idx: pick });
      stat.switched++;
      return true;
    };
    if (!SOLO && EK.G.party.length > 1) swapIn();
    while (EK.G.battle && !EK.B().over && guard++ < 300) {
      const cur = EK.B();
      if (cur.intent && cur.intent.kind === 'plan') planBeats++;
      for (const c of cur.hand) bump(stat.drawn, c.src === 'kin' ? `kin:${c.id}` : c.id);
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
        const fx = d.fx || {}, v = EK.cardValue(EK.ownedCard(c.u) || { id: c.id, plus: 0 }) || d.v;
        const left = runway(), hurt = cur.mine.max - cur.mine.hp;
        let pts = 0;
        if (d.vt === 'edge') pts += v;                        // one swing
        if (d.vt === 'atk') pts += v * left;
        if (d.vt === 'def') pts += v * left;                  // damage off every hit
        if (d.vt === 'might') pts += v * left * 2;            // "for ever" outlives this fight
        if (d.vt === 'shield') pts += v;                      // damage it will eat
        if (d.vt === 'heal') pts += Math.min(v, hurt);
        if (d.vt === 'maxhp') pts += Math.min(v, hurt) + v * .4;
        if (d.vt === 'draw') pts += v * 3;                    // a card is worth about a card
        if (fx.def) pts += fx.def * left;
        if (fx.heal) pts += Math.min(fx.heal, hurt);
        if (fx.energy) pts += 5;
        if (fx.hits) pts += swingDmg() * fx.hits * left;      // the answer to one swing a turn
        if (fx.mul) pts += swingDmg() * (fx.mul - 1) * left;
        if (fx.drain) pts += swingDmg() * fx.drain;
        if (fx.thorns) pts += fx.thorns * left;
        if (fx.st) pts += 3 * left;
        if (fx.selfdmg) pts -= fx.selfdmg;
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
        return c === Infinity ? 0 : c;
      };
      const support = (reserve) => {
        for (let spun = 0; spun < 10; spun++) {
          if (cur.over) break;
          let best = -1, bestRate = 0;
          for (let i = 0; i < cur.hand.length; i++) {
            const c = cur.hand[i];
            if (c.src === 'kin') continue;
            const cost = EK.cardCost(c);
            if (cost > cur.energy - reserve || !wants(c)) continue;
            const rate = worth(c) / Math.max(.5, cost);       // free cards are not infinitely good
            if (rate > bestRate) { best = i; bestRate = rate; }
          }
          if (best < 0) break;
          const card = cur.hand[best];
          bump(stat.played, card.id);
          EK.playCard(best);
        }
      };
      support(kinCost());                       // set up, keeping the swing affordable
      // One swing a turn — take the best one you can pay for.
      if (!cur.over && !cur.swungTurn) {
        let pick = -1, bestDmg = -1;
        for (let i = 0; i < cur.hand.length; i++) {
          const c = cur.hand[i];
          if (c.src !== 'kin' || EK.cardCost(c) > cur.energy) continue;
          const d = EK.MOVES[c.id].pow ? EK.damageOf(cur.mine, cur.foe, c.id, { crit: false, roll: .925 }).dmg : 1;
          if (d > bestDmg) { pick = i; bestDmg = d; }
        }
        if (pick >= 0) { bump(stat.played, `kin:${cur.hand[pick].id}`); EK.playCard(pick); }
      }
      support(0);                               // then spend whatever is left
      if (cur.over) break;
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
      EK.endTurn();
      turns++;
      low = Math.min(low, cur.mine.hp / cur.mine.max);
    }
    if (duelId) {
      const d = stat.duels.get(duelId) || { n: 0, turns: 0, lost: 0, low: 0, telegraphs: 0 };
      d.n++; d.turns += turns; d.low += low;
      if (EK.B() && EK.B().over === 'lose') d.lost++;
      d.telegraphs += planBeats;
      stat.duels.set(duelId, d);
    }
    stat.turns += duelId ? 0 : turns;
    if (!duelId && turns <= 1) stat.oneTurn++;
    // How much of the foe's health a single player turn takes off, which is the
    // number that decides how long a fight is.
    if (b.foe.max > 0 && !duelId) {
      stat.foeHp += b.foe.max;
      stat.foeHpSeen++;
      stat.dpt += (b.foe.max / Math.max(1, turns + 1)) / b.foe.max;
    }
    // A fight you were never in danger of losing is a cutscene with buttons.
    if (low > .7 && !duelId) stat.noDoubt++;
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
    if (over === 'win' && EK.G.battle && !duelId) {
      const offer = EK.rollReward(EK.B());
      if (offer && offer.length) {
        const pick = offer[Math.floor(Math.random() * offer.length)];
        // The real reward screen asks which card comes out when the deck is
        // full. Answer it the way a player would: drop the one played least.
        const c = EK.grantCard(pick, true);
        if (!EK.G.deck.includes(c.u)) {
          // A player drops a weak card, not an unused one — dropping by play
          // count alone throws out whatever you took last fight.
          const inDeck = EK.G.deck.map(EK.ownedCard).filter(Boolean);
          const worth = (o) => EK.RARITY_ORDER.indexOf(EK.CARDS[o.id].r) * 100 + (o.plays || 0);
          let worst = inDeck[0];
          for (const o of inDeck) if (worth(o) < worth(worst)) worst = o;
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
   * Fight a named trainer at whatever level the run is actually at. The point
   * is the shape of the fight, not whether the route order is respected, so
   * this heals first: a trainer measured on the fumes of the last wild kin is
   * measuring the walk to town instead.
   */
  const duel = (mapId, npcId) => {
    const npc = (EK.MAPS[mapId].npcs || []).find((n) => n.id === npcId);
    if (!npc) return;
    EK.healParty();
    const team = EK.trainerTeam(npc);
    EK.startBattle({ foe: EK.mkMon(team[0][0], team[0][1]), team, npc, wild: false });
    fight(npcId);
    EK.G.battle = null; EK.G.battleMsg = null; EK.G.screen = null;
    EK.G.mode = 'world'; EK.G.flourish = null;
    EK.healParty();
  };

  for (const leg of ROUTE) {
    grindTo(leg.map, leg.target);
    for (const id of leg.duels || []) duel(leg.map, id);
  }
  stat.gems = EK.G.gems;
  stat.party = EK.G.party.length;
  stat.top = Math.max(...EK.G.party.map((m) => m.lvl));
  stat.deck = EK.G.deck.length;
  return stat;
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(playOne());

const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
const pct = (n, d) => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;

const fights = avg((r) => r.fights), steps = avg((r) => r.steps);
console.log(`\nEMBERKIN — ${RUNS} run${RUNS > 1 ? 's' : ''} from the study to Crown Hollow`
  + `${SOLO ? ', one kin, no switching' : ''}\n`);
console.log(`  steps walked        ${steps.toFixed(0)}`);
console.log(`  fights              ${fights.toFixed(0)}   (one every ${(steps / Math.max(1, fights)).toFixed(1)} steps)`);
console.log(`  never in doubt      ${avg((r) => r.noDoubt).toFixed(0)}   ${pct(avg((r) => r.noDoubt), fights)} of them`);
console.log(`  turns per fight     ${(avg((r) => r.turns) / Math.max(1, fights)).toFixed(1)}`);
console.log(`  over in one turn    ${avg((r) => r.oneTurn).toFixed(0)}   ${pct(avg((r) => r.oneTurn), fights)} of them`);
console.log(`  foe max HP          ${(avg((r) => r.foeHp) / Math.max(1, avg((r) => r.foeHpSeen))).toFixed(0)}`);
// Absolute counts are dominated by how long a run happened to take, and runs
// vary a lot — normalise, or you end up comparing two samples of noise.
console.log(`  walks back to heal  ${avg((r) => r.healTrips).toFixed(1)}   ${(avg((r) => r.healTrips) / Math.max(1, fights)).toFixed(3)} per fight`);
console.log(`  wipes               ${avg((r) => r.wipes).toFixed(1)}   ${(avg((r) => r.wipes) / Math.max(1, fights)).toFixed(3)} per fight`);
console.log(`  party at the end    ${avg((r) => r.party).toFixed(1)}   ${avg((r) => r.caught).toFixed(1)} caught from ${avg((r) => r.thrown).toFixed(1)} throws`);
console.log(`  switched mid-fight  ${avg((r) => r.switched).toFixed(1)}   ${(avg((r) => r.switched) / Math.max(1, fights)).toFixed(2)} per fight`);
console.log(`  ended at level      ${avg((r) => r.top).toFixed(0)}\n`);

// The trainers, one line each, in the order a run meets them. A plan that never
// gets telegraphed before the fight ends is a plan nobody sees.
const DUEL_ORDER = ['t_wick1', 't_pell', 't_dorn', 't_mio', 't_ivo', 't_wick2', 't_coll', 't_hale', 't_wick3'];
console.log('  trainer            fights  turns  lost  lowest HP  plan beats seen');
for (const id of DUEL_ORDER) {
  let n = 0, turns = 0, lost = 0, low = 0, tel = 0;
  for (const r of runs) {
    const d = r.duels.get(id);
    if (!d) continue;
    n += d.n; turns += d.turns; lost += d.lost; low += d.low; tel += d.telegraphs;
  }
  if (!n) { console.log(`  ${id.padEnd(18)}      -`); continue; }
  console.log(`  ${id.padEnd(18)} ${String(n).padStart(6)} ${(turns / n).toFixed(1).padStart(6)} `
    + `${pct(lost, n).padStart(5)} ${pct(low / n, 1).padStart(10)} ${(tel / n).toFixed(1).padStart(16)}`);
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

// Which cards actually got played, and which ones sat there.
const all = new Map();
for (const r of runs) {
  for (const [k, n] of r.drawn) all.set(k, { ...(all.get(k) || { drawn: 0, played: 0 }), drawn: (all.get(k) || {}).drawn + n || n });
  for (const [k, n] of r.played) {
    const cur = all.get(k) || { drawn: 0, played: 0 };
    all.set(k, { ...cur, played: (cur.played || 0) + n });
  }
}
const taken = new Map();
for (const r of runs) for (const [k, n] of r.taken) taken.set(k, (taken.get(k) || 0) + n);
const rows = [...all].map(([k, v]) => [k, v.drawn || 0, v.played || 0])
  .sort((a, b) => (a[2] / Math.max(1, a[1])) - (b[2] / Math.max(1, b[1])));
console.log('  card                 drawn  played  played/drawn');
for (const [k, d, p] of rows) {
  console.log(`  ${k.padEnd(20)} ${String(d).padStart(5)} ${String(p).padStart(7)}  ${pct(p, d)}`);
}

// And the whole pool: anything never seen is a card no run ever built with.
const EK = loadGame({});
const never = EK.CARD_IDS.filter((id) => !all.has(id));
console.log(`\n  offered and taken but never worth playing:`);
for (const [k, n] of [...taken].sort((a, b) => b[1] - a[1])) {
  const seen = all.get(k) || { drawn: 0, played: 0 };
  if (seen.drawn && (seen.played || 0) / seen.drawn > .25) continue;
  console.log(`    ${k.padEnd(18)} taken ${String(n).padStart(3)}  drawn ${String(seen.drawn || 0).padStart(4)}  played ${String(seen.played || 0).padStart(4)}`);
}
console.log(`\n  never drawn in any run (${never.length}/${EK.CARD_IDS.length}): ${never.join(', ') || 'none'}\n`);
