// The Long Dusk: once the farm has beaten every boss, a Dusk Beacon can be lit. While it burns every wild monster (not bosses, not
// expedition monsters) is TUNING.duskLevels levels tougher and gives TUNING.duskLoot times the spoils. Pressing E at the beacon again
// puts it out. The switch is `WorldState.dusk`; it is all server-side (monster levels and loot), so nothing new goes over the wire.

import { BOSS_ORDER } from '../data/mobs';
import { PAL } from '../palette';
import * as chronicle from './chronicle';
import type { Sim } from './sim';
import type { BuildE, PlayerS } from './types';

/** Has this world beaten every boss? */
export const unlocked = (sim: Sim) => BOSS_ORDER.every((id) => (sim.s.bosses?.[id] ?? 0) > 0);

export function use (sim: Sim, p: PlayerS, b: BuildE) {
    const c = sim.center(b);
    if (!unlocked(sim)) {
        const left = BOSS_ORDER.filter((id) => !(sim.s.bosses?.[id] ?? 0)).length;
        sim.deny(p, `The beacon sleeps until every boss has fallen (${left} left)`);
        return;
    }
    if (sim.s.dusk) {
        sim.s.dusk = 0;
        sim.banner('The Long Dusk ends', 'The monsters are as they were.', PAL.pebble);
    } else {
        sim.s.dusk = 1;
        sim.banner('The Long Dusk begins', 'Every monster is tougher and richer. Press E at the beacon to put it out.', PAL.plum);
        chronicle.note(sim, 'dusk:begin', `${p.name} lit the Dusk Beacon: the Long Dusk began.`, 'k_moon');
    }
    sim.fx('golden', c.x, c.y - 8, p.id);
    sim.touch(b);
}
