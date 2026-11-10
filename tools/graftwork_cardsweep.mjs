// Forced-card control sweep (card audit method).  node tools/graftwork_cardsweep.mjs <hero|all> [N=200] [asc=0] [cardId,cardId...] [--json]
// Each non-starter card of the hero (and the neutral x_* pool) goes into the starter deck as 2 copies; the no-pick strong bot plays N runs
// on the same seeds as a no-card control. Prints wins and floors versus the control, and plays per run is not tracked (see the audit doc).
import * as RUN from '../graftwork/engine/run.js';
import { CARDS, HEROES } from '../graftwork/data/index.js';
import { POLICIES, playWardRun } from './graftwork_driver.mjs';

export function forcedRuns(hero, ids, N, asc, copies = 2) {
  const pol = POLICIES.strongNoPick;
  const tag = (id) => (id ? id : 'control');
  const res = {};
  for (const id of [null, ...ids]) {
    let w = 0, fl = 0;
    for (let i = 0; i < N; i++) {
      const p2 = { ...pol, fight(run, po, mt) { if (id && !run.flags.swept) { run.flags.swept = 1; for (let k = 0; k < copies; k++) run.deck.push({ uid: RUN.nextUid(run), id, grafts: [], up: 0 }); } return pol.fight(run, po, mt); } };
      const r = playWardRun(hero, `sweep-${hero}-${i}`, p2, asc, { tag: 'sweep' });
      if (r.outcome === 'won') w++; fl += r.run.stats.floors;
    }
    res[tag(id)] = { w, fl: fl / N };
  }
  return res;
}
if (process.argv[1] && process.argv[1].endsWith('graftwork_cardsweep.mjs')) {
  const a = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  const heroes = a[0] && a[0] !== 'all' ? [a[0]] : Object.keys(HEROES);
  const N = +a[1] || 200, asc = +a[2] || 0, only = a[3] ? a[3].split(',') : null;
  for (const hero of heroes) {
    const ids = Object.values(CARDS).filter((c) => (c.hero === hero || c.hero === 'any') && c.rarity !== 'starter' && c.type !== 'junk').map((c) => c.id).filter((id) => !only || only.includes(id));
    const res = forcedRuns(hero, ids, N, asc);
    const ctl = res.control;
    for (const id of ids) console.log(JSON.stringify({ hero, id, dw: res[id].w - ctl.w, dfl: +(res[id].fl - ctl.fl).toFixed(2), w: res[id].w, ctlw: ctl.w, N }));
  }
}
