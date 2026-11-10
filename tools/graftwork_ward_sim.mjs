// The per-act table of GRAFTWORK runs (design/WARD.md): win rate, where runs die, and per act the fights, monsters, elites, events,
// shops, forges and how often the boss was taken early.
//   node tools/graftwork_ward_sim.mjs [runsPerHero=20] [ascension=0] [strong|careful|greedy|none|sloppy|random|passive|fill|all|both]
//   GW_UNLOCK=start|all (default all) picks the card pool. The policies and every other switch are in tools/graftwork_driver.mjs.
import { wardTable, describe } from './graftwork_driver.mjs';
export { playWardRun, wardTable, describe, GRAFT_ADJ } from './graftwork_driver.mjs';

if (process.argv[1] && process.argv[1].endsWith('graftwork_ward_sim.mjs')) {
  const N = +process.argv[2] || 20, asc = +process.argv[3] || 0, which = process.argv[4] || 'both';
  for (const p of which === 'both' ? ['random', 'strong'] : which === 'all' ? ['random', 'sloppy', 'passive', 'fill', 'careful', 'strong'] : [which]) console.log(describe(p, wardTable(p, N, asc)));
}
