// Balance probe: how long does it take to collect the monster drops a boss sigil needs?
// A farmer stands on one plot of the biome (with an ordinary neighbour plot, as in a real
// farm) for several nights. Every monster that spawns is counted and its drop chances are
// summed, which is what you'd get if you killed everything that came. So this is the *best
// case*, a person who misses a few needs more nights. About 3–6 nights per sigil feels like
// a goal; 10+ feels like a chore. (tests/hunt.test.ts keeps it from drifting.)
//   npx tsx scripts/balance-hunt.ts [nightsPerWorld]

import { MOBS } from '../src/shared/data/mobs';
import type { ItemId } from '../src/shared/data/items';
import { HUNTS, nightsNeeded } from './hunt-lib';

const NIGHTS = Number(process.argv[2] ?? 12);
const WORLDS = 3;

console.log(`sigil                  biome       drops needed               nights if you kill everything   (${NIGHTS} nights x ${WORLDS} worlds)`);
for (const h of HUNTS) {
    const r = nightsNeeded(h, WORLDS, NIGHTS);
    const want = (Object.keys(MOBS) as (keyof typeof MOBS)[]).filter((k) => !MOBS[k].boss && MOBS[k].drops.some((d) => d[0] in h.need)).map((k) => `${k} ${r.per(k).toFixed(1)}/night`).join(', ');
    console.log(`${h.sigil.padEnd(22)} ${h.biome.padEnd(10)} ${(Object.entries(h.need) as [ItemId, number][]).map(([k, v]) => v + ' ' + k).join(' + ').padEnd(26)} ${r.nights.toFixed(1).padStart(5)}    (${want})`);
}
