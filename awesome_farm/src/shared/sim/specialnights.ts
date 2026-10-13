// Each season has a night worth waiting for:
//   summer .... fireflies: rare creatures wander the islands (the wild-creature roll gets a rarity boost)
//   autumn .... the Harvest Moon: garden beds grow twice as fast until dawn
//   winter .... the Aurora: crystals fall on two owned islands (a ping marks each)
// Spring keeps its rain. All of it is announced at nightfall, to everybody, and costs the Blood Moon nothing (a Blood Moon night wins).

import { TILE } from '../config';
import { PAL } from '../palette';
import { seasonOf } from '../season';
import type { Sim } from './sim';

export const FIREFLY_BOOST = 0.45;
export const HARVEST_MOON_GROW = 2;
export const AURORA_CRYSTALS = 3;

const calm = (sim: Sim) => sim.s.night && sim.nightEv !== 'bloodmoon';

/** Extra rarity for the wild-creature roll tonight (summer fireflies). */
export const fireflyBoost = (sim: Sim) => (calm(sim) && seasonOf(sim.s.day) === 'summer' ? FIREFLY_BOOST : 0);

/** How much faster beds grow right now (the autumn Harvest Moon). */
export const harvestMoon = (sim: Sim) => (calm(sim) && seasonOf(sim.s.day) === 'autumn' ? HARVEST_MOON_GROW : 1);

/** At nightfall: say what tonight is, and for the Aurora, drop the crystals. */
export function onNightfall (sim: Sim) {
    if (!calm(sim) || !sim.online.length) return;
    const season = seasonOf(sim.s.day);
    if (season === 'summer') for (const p of sim.online) sim.toast(p.id, 'Fireflies tonight: rare creatures wander the islands', 'k_paw', PAL.gold);
    else if (season === 'autumn') for (const p of sim.online) sim.toast(p.id, 'The Harvest Moon: your crops grow twice as fast until dawn', 'k_coin', PAL.gold);
    else if (season === 'winter') aurora(sim);
}

function aurora (sim: Sim) {
    const plots = sim.world.plots.filter((p) => p.owned);
    let spots = 0;
    for (let tries = 0; tries < 10 && spots < 2 && plots.length; tries++) {
        const t = sim.world.randomFreeTile(sim.rng.pick(plots), sim.rng, sim.online.map((q) => ({ x: q.x, y: q.y })), 3);
        if (!t) continue;
        const x = (t.tx + 0.5) * TILE, y = (t.ty + 1) * TILE - 3;
        for (let i = 0; i < AURORA_CRYSTALS; i++) sim.spawnDrop('crystal', x, y);
        sim.fx('golden', x, y - 8);
        sim.events.push({ e: 'ping', by: sim.online[0].id, name: 'Aurora', x, y, color: 0x9ae8ff });
        spots++;
    }
    for (const p of sim.online) sim.banner('The Aurora', spots ? 'Crystals have fallen on your islands: look for the pings' : 'The sky glows green over the ice', PAL.foam, p.id);
}
