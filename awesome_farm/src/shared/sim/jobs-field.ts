// Jobs, field work: one piece of logic with two kinds of site. A companion works the land around you and the goods go
// straight into your pockets; a post tends one island on its own and carries what it gets to a chest there (jobs-carry).

import { TILE } from '../config';
import { BUILDINGS, CROPS } from '../data/buildings';
import { petAtk, petLuck, spOf, workCycle, type Pet, type PostStatus, type WorkKind } from '../data/creatures';
import { ITEMS, type ItemId } from '../data/items';
import { MOBS } from '../data/mobs';
import { NODES } from '../data/nodes';
import { dist } from '../geom';
import { PAL } from '../palette';
import * as combat from './combat';
import { CARRY, carries, carrySite, errandStep, loadN, loadSeed, startErrand } from './jobs-carry';
import { nodeGroups, setStatus, walkTo, type Site } from './jobs-site';
import { invDrop, invSum, sowBed } from './machines';
import { grantPetXp } from './petlib';
import * as quests from './quests';
import type { Sim } from './sim';
import type { BuildE, CritE, Ent } from './types';

// ── field work ──────────────────────────────────────────────────────────────
/** What a garden bed needs next from a helper, if anything. */
function bedWork (b: BuildE, hasSeed: boolean): 'harvest' | 'plant' | 'water' | null {
    if (b.crop === 2 && b.plant) return 'harvest';
    if ((b.crop ?? -1) < 0) return hasSeed ? 'plant' : null;
    return b.crop === 0 || b.crop === 1 ? 'water' : null;
}

/** Is this still something worth walking to? */
function fieldValid (sim: Sim, e: Ent | undefined, task: WorkKind, pet: Pet, site: Site): boolean {
    if (!e) return false;
    const apt = spOf(pet.sp).work[task] ?? 0;
    if (e.k === 'node') {
        return (task === 'gather' || task === 'mine') && !NODES[e.kind].titan && nodeGroups(task).includes(NODES[e.kind].group) && (NODES[e.kind].minTier ?? 0) <= Math.max(0, apt - 1)
            && site.d((e.tx + 0.5) * TILE, (e.ty + 0.5) * TILE) <= site.valid;
    }
    if (e.k === 'bld') {
        const c = sim.center(e);
        if (task === 'farm') return e.kind === 'bed' && site.d(c.x, c.y) <= site.valid && bedWork(e, true) !== null;
        if (task === 'haul') return (!!BUILDINGS[e.kind].proc || e.kind === 'drill') && site.d(c.x, c.y) <= site.valid && invSum(e.out) > 0;
        return false;
    }
    if (e.k === 'mob') return task === 'guard' && site.d(e.x, e.y) <= site.valid * 1.07;
    if (e.k === 'drop') return task === 'haul' && site.d(e.x, e.y) <= site.valid;
    return false;
}

function fieldPick (sim: Sim, c: CritE, site: Site, pet: Pet, task: WorkKind): Ent | undefined {
    if (task !== 'guard' && !site.room()) return undefined;
    if (carries(site) && loadN(c) >= CARRY) return undefined;                  // hands full: off to a chest first
    const hasSeed = task === 'farm' && (site.seed() !== undefined || loadSeed(c) !== undefined);
    let best: Ent | undefined, bd = Infinity;
    const take = (e: Ent, x: number, y: number, bias = 0) => { const d = dist(x, y, c.x, c.y) + bias; if (d < bd) { bd = d; best = e; } };
    for (const e of Object.values(sim.s.ents)) {
        if (e.k === 'node') {
            if (task !== 'gather' && task !== 'mine') continue;
            if (!fieldValid(sim, e, task, pet, site) || site.d((e.tx + 0.5) * TILE, (e.ty + 0.5) * TILE) > site.pick) continue;
            take(e, (e.tx + 0.5) * TILE, (e.ty + 0.5) * TILE);
        } else if (e.k === 'bld') {
            const bc = sim.center(e);
            if (task === 'farm' && e.kind === 'bed') {
                const w = bedWork(e, hasSeed);
                if (!w || site.d(bc.x, bc.y) > site.pick) continue;
                take(e, bc.x, bc.y, w === 'harvest' ? -60 : w === 'plant' ? -30 : 0);     // ripe crops first, then empty beds, then watering
            } else if (task === 'haul' && (BUILDINGS[e.kind].proc || e.kind === 'drill') && invSum(e.out) > 0 && site.d(bc.x, bc.y) <= site.pick) take(e, bc.x, bc.y, -20);
        } else if (e.k === 'mob' && task === 'guard') {
            if (MOBS[e.kind].boss || e.rb || site.d(e.x, e.y) > site.pick) continue;
            take(e, e.x, e.y);
        } else if (e.k === 'drop' && task === 'haul') {
            if (site.d(e.x, e.y) > site.pick) continue;
            take(e, e.x, e.y);
        }
    }
    return best;
}

/** What working on this thing is called (the client turns it into an icon and a caption). */
function doingOf (e: Ent, task: WorkKind): string {
    if (e.k === 'node') return task === 'mine' ? 'mine' : NODES[e.kind].group === 'wood' ? 'chop' : 'pick';
    if (e.k === 'bld') { if (task === 'haul') return 'haul'; const w = bedWork(e, true); return w === 'harvest' ? 'harvest' : w === 'plant' ? 'plant' : 'water'; }
    if (e.k === 'mob') return 'fight';
    return 'haul';
}

const fieldPos = (sim: Sim, e: Ent) => (e.k === 'node' ? { x: (e.tx + 0.5) * TILE, y: (e.ty + 1) * TILE - 6 } : e.k === 'bld' ? sim.center(e) : { x: e.x, y: e.y });

/** The work itself, once the creature has been at it long enough. */
function fieldDo (sim: Sim, c: CritE, site: Site, pet: Pet, task: WorkKind, e: Ent, at: { x: number; y: number }): boolean {
    const owner = site.owner;
    const luck = petLuck(pet) + (sim.derivedOf(owner).luck ?? 0);
    const apt = spOf(pet.sp).work[task] ?? 0;
    const done = (xp: number, got = 0) => {
        quests.count(owner, 'petwork');
        quests.count(owner, `petwork:${task}`);
        if (site.post && got > 0) pet.pn = (pet.pn ?? 0) + got;
        grantPetXp(sim, owner, pet, xp, c);
        sim.fx('petWork', at.x, at.y);
    };
    if (e.k === 'node') {
        const def = NODES[e.kind];
        const plot = sim.s.plots[e.plot];
        sim.fx(def.brk, at.x, at.y - 2);
        sim.remove(e.id);
        let got = 0, main: ItemId | null = null;
        for (const [res, min, max, chance = 1] of def.drops) {
            if (res === 'coin' || !sim.rng.chance(chance)) continue;
            let n = sim.rng.int(min, max) + (plot?.mod === 'bountiful' ? 1 : 0);
            if (sim.rng.chance(luck)) n *= 2;
            site.put(res, n, at.x, at.y - 6);
            got += n; main ??= res as ItemId;
        }
        if (main) sim.float(at.x, at.y - 16, `+${got} ${ITEMS[main].name}`, PAL.lime, owner.id);
        quests.count(owner, `harvest:${e.kind}`);
        owner.stats.harvested++;
        site.xp(Math.max(1, Math.ceil(def.xp * 0.5)));
        done(3, got);
        return true;
    }
    if (e.k === 'bld') {
        if (task === 'haul') {
            let moved = 0;
            for (const [item, n] of Object.entries(e.out ?? {}) as [ItemId, number][]) {
                const take = Math.min(n, 12 - moved);
                if (take <= 0) continue;
                invDrop(e.out!, item, take); site.put(item, take, at.x, at.y - 6); moved += take;
            }
            if (!moved) return false;
            sim.touch(e);
            sim.float(at.x, at.y - 16, `+${moved} carried`, PAL.lime, owner.id);
            done(2, moved);
            return true;
        }
        const w = bedWork(e, site.seed() !== undefined);
        if (w === 'harvest') {
            const crop = CROPS[e.plant!]!;
            const n = sim.rng.int(crop.yield[0], crop.yield[1]) + (sim.rng.chance(luck) ? 1 : 0);
            site.put(crop.out, n, at.x, at.y - 6);
            if (sim.rng.chance(crop.seedBack + 0.1)) site.put(e.plant!, 1, at.x, at.y - 6);
            e.crop = -1; e.plant = undefined; e.growT = 0;
            sim.touch(e);
            owner.stats.harvested++;
            quests.count(owner, 'crop');
            site.xp(crop.xp);
            sim.fx('harvestCrop', at.x, at.y);
            sim.float(at.x, at.y - 16, `+${n} ${ITEMS[crop.out].name}`, PAL.lime, owner.id);
            done(3, n);
            return true;
        }
        if (w === 'plant') {
            const seed = site.seed();
            if (!seed || !site.takeSeed(seed)) return false;
            sowBed(sim, owner, e, seed);
            done(2, 0);
            return true;
        }
        if (w === 'water') {
            e.growT = (e.growT ?? 0) + 3 + apt * 2.5;
            sim.touch(e);
            done(1.5, 0);
            return true;
        }
        return false;
    }
    if (e.k === 'mob') {
        combat.damageMob(sim, e, petAtk(pet) * (1 + (sim.derivedOf(owner).mods.companionDmg ?? 0)), owner, { kx: e.x - c.x, ky: e.y - c.y, kb: 70, quiet: true });
        done(1, 0);
        return true;
    }
    if (e.k === 'drop') {
        sim.remove(e.id);
        site.put(e.res, 1, at.x, at.y - 6);
        sim.float(at.x, at.y - 14, `+1 ${e.res === 'coin' ? 'coin' : ITEMS[e.res as ItemId].name}`, PAL.lime, owner.id);
        done(0.6, 1);
        return true;
    }
    return false;
}

/** One tick of field work. Returns true when the creature is busy with a job (so it does not trot back to heel). `div`: how much quicker than a den worker it works. */
export function fieldStep (sim: Sim, c: CritE, site: Site, pet: Pet, task: WorkKind, dt: number, div: number): boolean {
    const carry = carries(site);
    if (carry && c.er !== undefined && errandStep(sim, c, site, pet, dt)) return true;
    c.js = (c.js ?? 0) - dt;
    let target = c.jt ? sim.s.ents[c.jt] : undefined;
    if (target && !fieldValid(sim, target, task, pet, site)) { target = undefined; c.jt = undefined; c.jp = 0; c.jq = 0; }
    if (!target && c.js <= 0) {
        target = fieldPick(sim, c, site, pet, task);
        c.js = target ? 0.3 : 2.5;                               // nothing to do: look again in a moment
        if (target) { c.jt = target.id; c.jp = 0; c.jq = 0; }
        let st: PostStatus = target ? 'work' : task === 'guard' || site.room() ? 'idle' : 'nostore';
        if (carry) {
            const needSeed = task === 'farm' && target?.k === 'bld' && (target.crop ?? -1) < 0 && !loadSeed(c);
            if (needSeed) {
                // an empty bed and the seeds are in a chest: fetch some first
                if (startErrand(sim, c, site, 1)) st = 'work'; else { target = undefined; c.jt = undefined; st = 'idle'; }
            } else if (!target && loadN(c) > 0) {
                st = startErrand(sim, c, site, 0) ? 'work' : 'nostore';             // nothing more to do: take what it has to a chest
            }
        }
        if (site.post) setStatus(sim, c, site.owner, pet, st);
        if (carry && c.er !== undefined) { errandStep(sim, c, site, pet, dt); return true; }
    }
    if (!target) { if (!site.post) c.ac = undefined; return false; }
    const at = fieldPos(sim, target);
    c.ac = doingOf(target, task);
    if (walkTo(sim, c, pet, at.x, at.y, dt, target.k === 'mob' ? 16 : 17)) { c.jp = 0; return true; }
    c.vx = 0; c.vy = 0;
    c.jp = (c.jp ?? 0) + dt;
    if (c.st !== 3) { c.st = 3; c.w = 0.5; c.wk = task; c.tx = at.x; c.ty = at.y; sim.events.push({ e: 'work', id: c.id, kind: task, x: at.x, y: at.y - 4 }); }
    const base = workCycle(pet, task, sim.derivedOf(site.owner).mods.work ?? 0) / div;
    const cycle = task === 'guard' ? Math.min(1.2, base) : Math.max(0.6, base);
    if (c.jp >= cycle) {
        fieldDo(sim, c, carries(site) ? carrySite(c, site) : site, pet, task, target, at);
        c.jp = 0;
        if (target.k !== 'mob') { c.jt = undefined; c.js = 0; }          // (a monster stays the target until it falls)
    }
    sim.touch(c);
    return true;
}
