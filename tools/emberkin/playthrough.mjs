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

/** The route a real player walks, in order. */
const ROUTE = [
  { map: 'route_one', target: 12 },
  { map: 'emberwood', target: 18 },
  { map: 'crown_hollow', target: 26 },
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
  };
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  /** Fight what is in front of us with a plain, honest policy. */
  const fight = () => {
    const b = EK.B();
    if (!b) return;
    stat.fights++;
    const startHp = b.mine.hp / b.mine.max;
    let low = startHp, turns = 0, guard = 0;
    while (EK.G.battle && !EK.B().over && guard++ < 300) {
      const cur = EK.B();
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
          let best = -1, bestKey = null;
          for (let i = 0; i < cur.hand.length; i++) {
            const c = cur.hand[i];
            if (c.src === 'kin') continue;
            const cost = EK.cardCost(c);
            if (cost > cur.energy - reserve || !wants(c)) continue;
            const def = EK.CARDS[c.id];
            const key = [(def.combo || def.chain) ? 1 : 0, cost];
            if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
              best = i; bestKey = key;
            }
          }
          if (best < 0) break;
          const card = cur.hand[best];
          bump(stat.played, card.id);
          EK.playCard(best);
        }
      };
      support(kinCost());                       // set up, keeping the swing affordable
      for (let spun = 0; spun < 4 && !cur.over; spun++) {
        const i = cur.hand.findIndex((c) => c.src === 'kin' && EK.cardCost(c) <= cur.energy);
        if (i < 0) break;
        bump(stat.played, `kin:${cur.hand[i].id}`);
        EK.playCard(i);
      }
      support(0);                               // then spend whatever is left
      if (cur.over) break;
      EK.endTurn();
      turns++;
      low = Math.min(low, cur.mine.hp / cur.mine.max);
    }
    stat.turns += turns;
    // A fight you were never in danger of losing is a cutscene with buttons.
    if (low > .7) stat.noDoubt++;
    const over = EK.B() ? EK.B().over : null;
    if (over === 'lose') stat.wipes++;
    // Take the card the win offers, the way a run really does — otherwise the
    // deck never grows and "never drawn" only measures the starter deck.
    if (over === 'win' && EK.G.battle) {
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
      if (hurt) { stat.healTrips++; EK.healParty(); }
    }
  };

  for (const leg of ROUTE) grindTo(leg.map, leg.target);
  stat.gems = EK.G.gems;
  stat.top = Math.max(...EK.G.party.map((m) => m.lvl));
  stat.deck = EK.G.deck.length;
  return stat;
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(playOne());

const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
const pct = (n, d) => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;

const fights = avg((r) => r.fights), steps = avg((r) => r.steps);
console.log(`\nEMBERKIN — ${RUNS} run${RUNS > 1 ? 's' : ''} from the study to Crown Hollow\n`);
console.log(`  steps walked        ${steps.toFixed(0)}`);
console.log(`  fights              ${fights.toFixed(0)}   (one every ${(steps / Math.max(1, fights)).toFixed(1)} steps)`);
console.log(`  never in doubt      ${avg((r) => r.noDoubt).toFixed(0)}   ${pct(avg((r) => r.noDoubt), fights)} of them`);
console.log(`  turns per fight     ${(avg((r) => r.turns) / Math.max(1, fights)).toFixed(1)}`);
// Absolute counts are dominated by how long a run happened to take, and runs
// vary a lot — normalise, or you end up comparing two samples of noise.
console.log(`  walks back to heal  ${avg((r) => r.healTrips).toFixed(1)}   ${(avg((r) => r.healTrips) / Math.max(1, fights)).toFixed(3)} per fight`);
console.log(`  wipes               ${avg((r) => r.wipes).toFixed(1)}   ${(avg((r) => r.wipes) / Math.max(1, fights)).toFixed(3)} per fight`);
console.log(`  ended at level      ${avg((r) => r.top).toFixed(0)}\n`);

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
