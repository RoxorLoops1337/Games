// The defenses against the Blight's raids. Walls, doorways (and later towers) have hit points (`BuildingDef.hp`); a raider stopped by
// one strikes it now and then (sim/raid.ts), a piece at 0 breaks (it is gone, nothing is given back), and everything hurt mends at dawn.
// A building's damage is `BuildE.hp` (the hit points left; none: whole).

import { BUILDINGS } from '../data/buildings';
import { PAL } from '../palette';
import type { Sim } from './sim';
import type { BuildE } from './types';

/** A blow against a wall, doorway or tower: it loses hit points, and at none it breaks (nothing is given back). */
export function hitBuilding (sim: Sim, b: BuildE, dmg: number) {
    const max = BUILDINGS[b.kind].hp;
    if (!max || !sim.s.ents[b.id]) return;
    b.hp = Math.max(0, (b.hp ?? max) - dmg);
    sim.touch(b);
    const c = sim.center(b);
    if (b.hp > 0) { sim.fx('bldHit', c.x, c.y); return; }
    sim.fx('bldBreak', c.x, c.y);
    const owner = b.by ? sim.s.players[b.by] : undefined;
    if (owner?.online) sim.toast(owner.id, `Raiders broke your ${BUILDINGS[b.kind].name}`, 'k_skull', PAL.berry);
    sim.remove(b.id);
}

/** Dawn: every damaged defense is whole again. */
export function mend (sim: Sim) {
    for (const b of sim.buildings()) if (b.hp !== undefined) { delete b.hp; sim.touch(b); }
}
