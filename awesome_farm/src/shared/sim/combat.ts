// How a player's weapon hits monsters. Every weapon type behaves differently:
// sword — a cleaving arc · spear — a piercing line · hammer — a ground-pounding ring ·
// dagger — fast and crit-happy · bow — an arrow from range · staff — a bolt that bursts.

import type { WeaponType } from '../data/items';
import { MOBS } from '../data/mobs';
import { PAL } from '../palette';
import * as mobs from './mobs';
import type { Sim } from './sim';
import { derived } from './stats';
import type { MobE, PlayerS } from './types';

/** Knockback speed (px/s) per weapon. */
const KNOCK: Record<WeaponType, number> = { fist: 70, club: 95, dagger: 60, sword: 105, spear: 80, hammer: 170, bow: 55, staff: 75 };
/** Extra energy per swing (bows and staffs are not free). */
const ENERGY_MUL: Record<WeaponType, number> = { fist: 1, club: 1, dagger: 0.8, sword: 1, spear: 1, hammer: 1.4, bow: 1.6, staff: 2.2 };

function mobsNear (sim: Sim, x: number, y: number, r: number, pred: (m: MobE) => boolean = () => true) {
    const out: MobE[] = [];
    for (const e of sim.ents('mob')) {
        if (Math.hypot(e.x - x, e.y - 4 - y) <= r + MOBS[e.kind].r * 0.5 && pred(e)) out.push(e);
    }
    return out;
}

/** The set of monsters one swing at `primary` connects with. */
function targetsFor (sim: Sim, p: PlayerS, primary: MobE): MobE[] {
    const d = derived(p);
    const w = d.weapon;
    const px = p.x, py = p.y - 5;
    const ax = primary.x - px, ay = primary.y - 4 - py;
    const al = Math.max(1, Math.hypot(ax, ay));
    const ux = ax / al, uy = ay / al;
    const set = new Map<number, MobE>([[primary.id, primary]]);
    const add = (list: MobE[]) => list.forEach((m) => set.set(m.id, m));
    switch (w.wtype) {
        case 'sword':   // everything inside a wide arc in front
            add(mobsNear(sim, px, py, w.reach + 10, (m) => {
                const dx = m.x - px, dy = m.y - 4 - py, l = Math.max(1, Math.hypot(dx, dy));
                return (dx * ux + dy * uy) / l > 0.15;
            }));
            break;
        case 'spear':   // a narrow line through the target
            add(mobsNear(sim, px, py, w.reach + 12, (m) => {
                const dx = m.x - px, dy = m.y - 4 - py;
                const along = dx * ux + dy * uy, side = Math.abs(dx * -uy + dy * ux);
                return along > -2 && side <= 9 + MOBS[m.kind].r * 0.4;
            }));
            break;
        case 'hammer':  // slams the ground all around
            add(mobsNear(sim, px, py, 34));
            break;
        case 'staff':   // the bolt bursts where it lands
            add(mobsNear(sim, primary.x, primary.y - 4, 24));
            break;
        default: break;
    }
    return [...set.values()];
}

/** Damage a monster. Handles crits, boss bonuses, knockback, floating numbers and death. */
export function damageMob (sim: Sim, e: MobE, dmg: number, by: PlayerS | null, opts: { kx?: number; ky?: number; kb?: number; crit?: boolean; quiet?: boolean; nofloat?: boolean } = {}) {
    if (!sim.s.ents[e.id]) return;
    const def = MOBS[e.kind];
    e.hp -= dmg;
    if (by) sim.credit(e, by, dmg);
    const kb = (opts.kb ?? 90) * (def.boss ? 0.05 : (e.kind === 'rockling' ? 0.45 : e.kind === 'knight' ? 0.6 : 1));
    if (opts.kx !== undefined && opts.ky !== undefined && kb > 0) {
        const l = Math.max(1, Math.hypot(opts.kx, opts.ky));
        e.vx = (opts.kx / l) * kb; e.vy = (opts.ky / l) * kb; e.knockT = def.boss ? 0 : 0.16; e.hopT = 0;
        if (e.st === 1) e.st = 0;            // a hit interrupts a wind-up
    }
    sim.touch(e);
    const text = dmg >= 10 ? `${Math.round(dmg)}` : `${Math.round(dmg * 10) / 10}`;
    if (!opts.nofloat) sim.float(e.x + (sim.rng.next() - 0.5) * 8, e.y - 14, opts.crit ? `${text}!` : text, opts.crit ? PAL.gold : PAL.cream, by?.id);
    if (e.hp > 0) { if (!opts.quiet) sim.fx('enemyHit', e.x, e.y - 5, by?.id); return; }
    mobs.killMob(sim, e, by ?? undefined);
}

/** A player swings at a monster. */
export function attack (sim: Sim, p: PlayerS, primary: MobE) {
    const d = derived(p);
    const w = d.weapon;
    const night = sim.s.night ? 1 + (d.mods.nightDmg ?? 0) : 1;
    const list = targetsFor(sim, p, primary);
    const perfect = p.buffs.some((b) => b.id === 'perfect');           // (a Perfect dash: this swing is a critical hit, then the buff is spent)
    if (perfect) p.buffs = p.buffs.filter((b) => b.id !== 'perfect');
    let first = true;
    for (const m of list) {
        const def = MOBS[m.kind];
        let dmg = w.dmg * night * (def.boss || m.rb ? 1 + (d.mods.bossDmg ?? 0) : 1);
        if (w.wtype === 'staff' && m !== primary) dmg *= 0.6;
        if (w.wtype === 'hammer' && m !== primary) dmg *= 0.8;
        const crit = perfect || (d.crit > 0 && sim.rng.chance(d.crit));
        if (crit) { dmg *= 2; sim.fx('crit', m.x, m.y - 6, first ? p.id : undefined); }
        const kx = m.x - p.x, ky = m.y - p.y;
        const stunHammer = w.wtype === 'hammer' && !def.boss && sim.rng.chance(0.25);
        damageMob(sim, m, dmg, p, { kx, ky, kb: KNOCK[w.wtype], crit, quiet: !first });
        if (stunHammer && sim.s.ents[m.id]) { m.stun = 0.7; m.st = 3; sim.touch(m); }
        first = false;
    }
}

/** What one swing at a monster costs: the farmer's swing cost times the weapon's own (bows and staffs are not free). */
export function swingEnergy (p: PlayerS) {
    const d = derived(p);
    return d.swingEnergy * ENERGY_MUL[d.weapon.wtype];
}
