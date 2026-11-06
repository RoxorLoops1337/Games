// Unlock pacing simulator for GRAFTWORK (engine/unlock.js + data/unlocks.js).
//   node tools/graftwork_unlocks.mjs [players=200] [poolPerHero=40]
// Builds a pool of real finished runs per skill tier with the sim bots (strong = graftwork_strong, careful, sloppy = never grafts),
// all on the FULL pool (GW_POOL=start for the starting pool), then lets N simulated players draw runs from their tier's pool and pushes every run through the REAL
// recordRunEnd (so UP, first kills, achievements and hero gates are exactly the game's). Prints runs needed to unlock everything
// per tier and the unlocked-percent curve. Deterministic (seeded).
import * as RUN from '../graftwork/engine/run.js';
import * as META from '../graftwork/engine/meta.js';
import { POLICIES, playRun } from './graftwork_sim.mjs';
import './graftwork_strong.mjs'; // adds POLICIES.strong
import { makeRng } from '../graftwork/engine/rng.js';
import { TOTAL_COST, UP } from '../graftwork/data/unlocks.js';

const TIERS = { strong: POLICIES.strong, careful: POLICIES.careful, sloppy: POLICIES.none };
const HEROES = ['marrow', 'wick', 'odile'];
const MAX_RUNS = 220;

export function buildPools(perHero = 40, quiet = false) {
  const pools = {};
  for (const [tier, pol] of Object.entries(TIERS)) {
    pools[tier] = {};
    for (const h of HEROES) {
      const arr = [];
      for (let i = 0; i < perHero; i++) {
        const r = playRun(h, `unl-${tier}-${h}-${i}`, pol, 0, { unlocked: process.env.GW_POOL || 'all' });
        arr.push({ json: RUN.serializeRun(r.run), outcome: r.outcome });
      }
      pools[tier][h] = arr;
    }
    if (!quiet) { const all = HEROES.flatMap((h) => pools[tier][h]); console.log(`pool ${tier}: ${all.length} runs, win ${(100 * all.filter((x) => x.outcome === 'won').length / all.length).toFixed(0)}%`); }
  }
  return pools;
}

export function simPlayer(pool, seed, maxRuns = MAX_RUNS) {
  const store = { getItem: () => null, setItem: () => {} };
  META.setStorage(store);
  const m = META.defaultMeta();
  const rng = makeRng('unl:' + seed);
  const curve = [], upLog = [];
  let doneAt = null, wickAt = null, odileAt = null;
  for (let n = 1; n <= maxRuns; n++) {
    const heroes = m.unlocked.heroes;
    // players favour the hero they know: 55 percent the previous hero, else any unlocked one
    const hero = m.__last && heroes.includes(m.__last) && rng.chance(0.55) ? m.__last : heroes[rng.int(heroes.length)];
    m.__last = hero;
    const entry = pool[hero][rng.int(pool[hero].length)];
    const run = RUN.deserializeRun(entry.json);
    META.onRunStart(m, run);
    const res = META.recordRunEnd(m, run, entry.outcome);
    upLog.push(res.unlock.up);
    if (wickAt === null && m.unlocked.heroes.includes('wick')) wickAt = n;
    if (odileAt === null && m.unlocked.heroes.includes('odile')) odileAt = n;
    const st = META.unlockState(m);
    curve.push(st.percent);
    if (doneAt === null && st.done) { doneAt = n; break; }
  }
  return { doneAt, curve, upLog, wickAt, odileAt };
}

const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

if (process.argv[1] && process.argv[1].endsWith('graftwork_unlocks.mjs')) {
  const N = +process.argv[2] || 200, per = +process.argv[3] || 40;
  console.log(`total cost ${TOTAL_COST} UP, per-run cap ${UP.RUN_CAP}, hard minimum ${Math.ceil(TOTAL_COST / UP.RUN_CAP)} runs`);
  const pools = buildPools(per);
  const marks = [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100];
  const rows = [];
  for (const tier of Object.keys(TIERS)) {
    const res = []; for (let i = 0; i < N; i++) res.push(simPlayer(pools[tier], `${tier}-${i}`));
    const done = res.map((r) => (r.doneAt === null ? MAX_RUNS + 1 : r.doneAt));
    const avgUp = res.reduce((a, r) => a + r.upLog.reduce((x, y) => x + y, 0) / r.upLog.length, 0) / N;
    console.log(`\n${tier}: runs to unlock everything  min ${Math.min(...done)}  p10 ${q(done, 0.1)}  median ${q(done, 0.5)}  p90 ${q(done, 0.9)}  max ${Math.max(...done)}   avg UP/run ${avgUp.toFixed(1)}   wick at run ${q(res.map((r) => r.wickAt || 999), 0.5)}  odile at run ${q(res.map((r) => r.odileAt || 999), 0.5)}`);
    const curve = marks.map((k) => { const v = res.map((r) => (k <= r.curve.length ? r.curve[k - 1] : 100)); return Math.round(v.reduce((a, b) => a + b, 0) / v.length); });
    rows.push([tier, curve]);
  }
  console.log('\nunlocked percent (mean) after run:');
  console.log('tier     ' + marks.map((k) => String(k).padStart(4)).join(''));
  for (const [t, c] of rows) console.log(t.padEnd(8) + ' ' + c.map((v) => String(v).padStart(4)).join(''));
}
