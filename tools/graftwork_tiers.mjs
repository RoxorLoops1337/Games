// Skill tiers for GRAFTWORK difficulty tuning: RANDOM < SLOPPY < CAREFUL < STRONG.
//   node tools/graftwork_tiers.mjs                       # default: every tier, A0, N per tier below
//   node tools/graftwork_tiers.mjs random 1000 0         # one tier: random|sloppy|careful|strong, runs, ascension
//   node tools/graftwork_tiers.mjs sloppy 1000 0 assist  # same with all four Assist options on
//   node tools/graftwork_tiers.mjs careful 300 0 - marrow  # runs PER HERO for careful/strong; last arg limits to one hero
// RANDOM: random plans and walks, random legal card, random target, may end the turn at any step, random graft/reward/shop/forge/event choices.
// SLOPPY: one or two random plans a morning, walks to the nearest room that holds anything, plays cards left to right at the first enemy,
//         never reads an intent, never plans Block.
// CAREFUL = POLICIES.carefulSlip (the careful policy with a 9 percent misplay), careful_pure = POLICIES.careful, STRONG = POLICIES.strong:
//         all three build and walk like the strong bot. Policies and the run itself: tools/graftwork_driver.mjs.
import { HEROES } from '../graftwork/data/index.js';
import { POLICIES, playWardRun, ASSIST_ALL } from './graftwork_driver.mjs';
export { SLIP, ASSIST_ALL, tierFight } from './graftwork_driver.mjs';

// one run of a tier; `floors` is the number of rooms that opened something (stats.floors), as the game counts them
export function runTier(tier, hero, seed, asc = 0, o = {}) {
  const policy = tier === 'careful' ? POLICIES.carefulSlip : tier === 'careful_pure' ? 'careful' : tier;
  const r = playWardRun(hero, seed, policy, asc, { ...o, tag: tier });
  return { ...r, floors: r.run.stats.floors };
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
export function summarize(rs) {
  const N = rs.length, won = rs.filter((r) => r.outcome === 'won').length;
  const a1 = rs.filter((r) => r.outcome === 'won' || r.act > 1).length, a2 = rs.filter((r) => r.outcome === 'won' || r.act > 2).length;
  const first = rs.filter((r) => r.log.fights.length && !r.log.fights[0].win).length;
  const first2 = rs.filter((r) => r.log.fights.slice(0, 2).some((f) => !f.win)).length;
  return { N, wins: won, win: won / N, act1: a1 / N, act2: a2 / N, medFloor: median(rs.map((r) => r.floors)), meanFloor: rs.reduce((a, r) => a + r.floors, 0) / N, medAct: median(rs.map((r) => (r.outcome === 'won' ? 4 : r.act))), firstDeath: first / N, firstTwoDeath: first2 / N };
}
export function measure(tier, n, asc = 0, o = {}) {
  const heroes = o.hero ? [o.hero] : Object.keys(HEROES);
  const rs = [];
  const perHero = tier === 'random' || tier === 'sloppy' ? Math.ceil(n / heroes.length) : n;
  for (const h of heroes) for (let i = 0; i < perHero; i++) rs.push(runTier(tier, h, `${o.tag || 'tier'}-${tier}-${h}-${i}`, asc, o));
  return summarize(rs);
}
const pct = (x) => (100 * x).toFixed(1).padStart(5) + '%';
export function row(tier, s) { return `${tier.padEnd(8)} N=${String(s.N).padEnd(5)} win ${pct(s.win)} (${s.wins})  act1 clear ${pct(s.act1)}  act2 clear ${pct(s.act2)}  floors med ${s.medFloor} mean ${s.meanFloor.toFixed(1)}  med death act ${s.medAct}  first fight lost ${pct(s.firstDeath)}  first two ${pct(s.firstTwoDeath)}`; }

if (process.argv[1] && process.argv[1].endsWith('graftwork_tiers.mjs')) {
  const [, , t, nArg, ascArg, assistArg, hero] = process.argv;
  const asc = +ascArg || 0, o = { assist: assistArg === "assist" ? ASSIST_ALL : undefined, hero: hero || undefined, tag: process.env.GW_TAG || "tier" };
  const defaults = { random: 1000, sloppy: 1000, careful: 300, strong: 300 };
  for (const tier of t && t !== 'all' ? [t] : Object.keys(defaults)) console.log(row(tier, measure(tier, +nArg || defaults[tier], asc, o)) + (o.assist ? '  [assist]' : ''));
}
