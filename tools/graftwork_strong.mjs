// The strong bot (Thread aware fights, school focus, Temper, card buys, the early boss): the reference for win rates.
//   node tools/graftwork_strong.mjs [runsPerHero=40] [ascension=0] [hero]
// The policy itself lives in tools/graftwork_driver.mjs (POLICIES.strong); this is the command, and the import that
// tools/graftwork_golden.mjs --root uses to make sure POLICIES.strong exists.
import { HEROES } from '../graftwork/data/index.js';
import { playWardRun } from './graftwork_driver.mjs';
export { strongFight, strongPickGraft, strongForge, strongShopCards, auditDelta } from './graftwork_driver.mjs';

if (process.argv[1] && process.argv[1].endsWith('graftwork_strong.mjs')) {
  const N = +process.argv[2] || 40, asc = +process.argv[3] || 0, only = process.argv[4];
  for (const hero of Object.keys(HEROES)) {
    if (only && hero !== only) continue;
    const rs = [];
    for (let i = 0; i < N; i++) rs.push(playWardRun(hero, `strong-${hero}-${i}`, 'strong', asc));
    const wins = rs.filter((r) => r.outcome === 'won').length;
    const a1 = rs.filter((r) => r.outcome === 'won' || r.act > 1).length;
    const fl = (rs.reduce((a, r) => a + r.run.stats.floors, 0) / N).toFixed(1);
    const a3 = rs.filter((r) => r.outcome === 'won' || r.act > 2).length;
    console.log(`strong ${hero.padEnd(7)} A${asc} act1 clear ${a1}/${N}  act2 clear ${a3}/${N}  win ${wins}/${N} (${(100 * wins / N).toFixed(0)}%) rooms ${fl}`);
  }
}
