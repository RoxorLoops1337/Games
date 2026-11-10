// Graft policy table for GRAFTWORK: integration coverage + balance numbers for the plain policies.
//   node tools/graftwork_sim.mjs [runsPerHero=20] [ascension=0] [policy ...]     default policies: careful greedy none
// Every run is a Ward run played by tools/graftwork_driver.mjs (strong builder and walker, the named policy for fights, grafts, shop and forge).
// Also re-exports the driver, so `import { POLICIES, fight, graftScore, ... } from './graftwork_sim.mjs'` keeps working (tools/graftwork_golden.mjs --root).
import { strainInfo } from '../graftwork/engine/cards.js';
import { HEROES } from '../graftwork/data/index.js';
import { POLICIES, playWardRun } from './graftwork_driver.mjs';
export * from './graftwork_driver.mjs';

if (process.argv[1] && process.argv[1].endsWith('graftwork_sim.mjs')) {
  const N = +process.argv[2] || 20, asc = +process.argv[3] || 0, names = process.argv.slice(4).length ? process.argv.slice(4) : ['careful', 'greedy', 'none'];
  for (const pname of names) {
    if (!POLICIES[pname]) { console.error(`unknown policy ${pname} (have: ${Object.keys(POLICIES).join(' ')})`); process.exit(2); }
    for (const hero of Object.keys(HEROES)) {
      const rs = [];
      for (let i = 0; i < N; i++) rs.push(playWardRun(hero, `${pname}-${hero}-${i}`, pname, asc));
      const wins = rs.filter((r) => r.outcome === 'won').length;
      const acts = [0, 0, 0, 0]; rs.forEach((r) => { acts[r.outcome === 'won' ? 3 : r.act - 1]++; });
      const avg = (f) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
      console.log(`${pname.padEnd(8)} ${hero.padEnd(7)} win ${wins}/${N}  died act1/2/3: ${acts[0]}/${acts[1]}/${acts[2]}  rooms ${avg((r) => r.run.stats.floors)} grafts ${avg((r) => r.run.stats.grafts)} strain ${avg((r) => strainInfo(r.run).strain)} shatters ${avg((r) => r.run.stats.shatters)} deck ${avg((r) => r.run.deck.length)}`);
    }
  }
}
