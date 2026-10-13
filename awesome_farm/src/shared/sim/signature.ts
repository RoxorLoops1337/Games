// A companion's signature move: every SIGNATURE_EVERY strikes its element does something extra (data/creatures.ts SIGNATURE).

import { SIGNATURE, SIGNATURE_EVERY, spOf } from '../data/creatures';
import { MOBS } from '../data/mobs';
import { dist } from '../geom';
import * as combat from './combat';
import type { Sim } from './sim';
import type { CritE, MobE, PlayerS } from './types';

const SPLASH = 34, JUMP = 70;

const near = (sim: Sim, from: MobE, range: number, not: MobE[] = []) =>
    sim.ents('mob').filter((m) => m !== from && !not.includes(m) && !MOBS[m.kind].boss && dist(m.x, m.y, from.x, from.y) < range);

/** Called after a companion's strike: counts it and, on the Nth, fires the move. Returns true when it fired. */
export function onStrike (sim: Sim, c: CritE, owner: PlayerS, target: MobE, atk: number): boolean {
    c.sg = (c.sg ?? 0) + 1;
    if (c.sg < SIGNATURE_EVERY) return false;
    c.sg = 0;
    const el = spOf(c.sp).element;
    const hit = (m: MobE, mul: number, kb = 40) => { if (sim.s.ents[m.id]) combat.damageMob(sim, m, atk * mul, owner, { kx: m.x - c.x, ky: m.y - c.y, kb, quiet: true }); };
    const stun = (m: MobE, s: number) => { if (sim.s.ents[m.id] && !MOBS[m.kind].boss) m.stun = Math.max(m.stun ?? 0, s); };
    switch (el) {
        case 'fire': for (const m of near(sim, target, SPLASH)) hit(m, 0.5); sim.fx('hitEarth', target.x, target.y - 4); break;
        case 'frost': stun(target, 1.2); sim.fx('hitEarth', target.x, target.y - 4); break;
        case 'spark': { const done: MobE[] = []; let from = target; for (let i = 0; i < 2; i++) { const nx = near(sim, from, JUMP, done)[0]; if (!nx) break; hit(nx, 0.7); done.push(nx); from = nx; } break; }
        case 'earth': for (const m of [target, ...near(sim, target, SPLASH)]) { stun(m, 0.5); if (m !== target) hit(m, 0.3, 140); } sim.fx('hitEarth', target.x, target.y - 4); break;
        case 'leaf': sim.heal(owner, 0.5); break;
        case 'light': for (const m of [target, ...near(sim, target, SPLASH * 1.5)]) stun(m, 0.8); break;
        case 'shadow': hit(target, 1.5); break;
    }
    sim.float(c.x, c.y - 16, SIGNATURE[el].name, 0xffffff, owner.id);
    return true;
}
