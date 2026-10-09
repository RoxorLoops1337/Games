// Creatures: wild ones wander the farm and can be befriended with pods; tamed ones follow
// you as a companion or live in a Den and work. Everything here is server-side state:
// the roster lives on the player (`pets`), the visible animals are `crit` entities.

import { TILE, TUNING } from '../config';
import { BUILDINGS, CROPS, SEED_IDS } from '../data/buildings';
import {
    AWAKENINGS, BREED_SECS, BREED_TREATS, breedOffspring, catchChance, PET_MAX_LEVEL, PET_NAMES, petAtk, petLuck, petSpeedMul, Pet, pickSpecies,
    POD_POWER, spOf, SpeciesId, STAR_MAX, starsOf, TRAIT_IDS, TraitId, TRAITS, WORK_ACTIVITY, WorkKind, workCycle,
} from '../data/creatures';
import { FUEL, ITEMS, ItemId } from '../data/items';
import { MOBS } from '../data/mobs';
import { NODES } from '../data/nodes';
import { dist } from '../geom';
import { PAL } from '../palette';
import * as chronicle from './chronicle';
import * as combat from './combat';
import * as jobs from './jobs';
import { dropLoad } from './jobs-carry';
import { fieldStep } from './jobs-field';
import { ownerSite, taskOk } from './jobs-site';
import { invDrop, invSum, invPut } from './machines';
import { fetchAt, findPet, grantPetXp, isWorking, move, petsOf, rosterCap, STASH_RADIUS, stashAt, workSlots } from './petlib';
import * as quests from './quests';
import type { Sim } from './sim';
import { countOf, derived, hasUnlock, takeItem } from './stats';
import type { BuildE, Cmd, CritE, MobE, PlayerS, Plot } from './types';

export { petsOf, rosterCap, workSlots };
export { taskOk };

const DEN_RADIUS = 7 * TILE;

// ── helpers ─────────────────────────────────────────────────────────────────
const denCenter = (d: BuildE) => ({ x: (d.tx + 1) * TILE, y: (d.ty + 2) * TILE - 4 });

export function newPet (p: PlayerS, sp: SpeciesId, lv: number, rng: { next(): number; int(a: number, b: number): number; pick<T>(l: readonly T[]): T }): Pet {
    p.petSeq = (p.petSeq ?? 0) + 1;
    const traits: TraitId[] = [];
    const n = spOf(sp).rarity >= 2 ? 2 : rng.next() < 0.6 ? 1 : 0;
    for (let i = 0; i < n; i++) { const t = rng.pick(TRAIT_IDS); if (!traits.includes(t)) traits.push(t); }
    const taken = new Set([...petsOf(p).map((x) => x.name), p.name]);       // (never the farmer's own name: "Pip" beside Pip confused a tester)
    let name = rng.pick(PET_NAMES);
    for (let i = 0; i < 6 && taken.has(name); i++) name = rng.pick(PET_NAMES);
    return { id: `p${p.petSeq}`, sp, name, lv, xp: 0, traits };
}

// ── spawning wild creatures ─────────────────────────────────────────────────
function spawnWild (sim: Sim, p: PlayerS) {
    const rng = sim.rng;
    const here = sim.world.plotAtPx(p.x, p.y);
    if (!here) return;
    const plots = [here, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => sim.world.plot(here.gx + dx, here.gy + dy))].filter((q) => !!q?.owned);
    // rare, so make a roll count: look around for a spot out of everyone's sight line rather than giving up on the first
    let plot: Plot | null = null, spot: { tx: number; ty: number } | null = null, x = 0, y = 0;
    for (let tries = 0; tries < 8 && !spot; tries++) {
        plot = rng.pick(plots as NonNullable<typeof plots[number]>[]) ?? null;
        const s = plot && sim.world.randomFreeTile(plot, rng, sim.online.map((q) => ({ x: q.x, y: q.y })), 2);
        if (!s) continue;
        x = (s.tx + 0.5) * TILE; y = (s.ty + 1) * TILE - 3;
        if (!sim.online.some((q) => dist(q.x, q.y, x, y) < TUNING.wildSpawnClear)) spot = s;
    }
    if (!plot || !spot) return;
    const sp = pickSpecies(plot.biome, sim.s.night, () => rng.next(), hasUnlock(p, 'rarecatch') ? 0.7 : 0);
    const def = spOf(sp);
    const lv = 1 + rng.int(0, 2 + Math.floor(sim.s.day / 3)) + def.rarity * 2;
    sim.add<CritE>({ k: 'crit', sp, x, y, vx: 0, vy: 0, t: rng.next() * 3, lv, mode: 0, st: 0, hx: x, hy: y, life: 140 + rng.next() * 80, a: 0 });
}

// ── the update loop ─────────────────────────────────────────────────────────
export function update (sim: Sim, dt: number) {
    const players = sim.online.filter((p) => p.downed <= 0);
    sim.critT -= dt;
    const crits = [...sim.ents('crit')];              // (a copy: the syncs below add to it and take from it)
    updateHatcheries(sim, dt);

    // spawn wild ones around each player: rare enough to feel like a find (one at a time, a few on a fairy night)
    if (sim.critT <= 0) {
        sim.critT = TUNING.wildEvery[0] + sim.rng.next() * (TUNING.wildEvery[1] - TUNING.wildEvery[0]);
        for (const p of players) {
            const near = crits.filter((c) => c.mode === 0 && dist(c.x, c.y, p.x, p.y) < TUNING.wildCrowd).length;
            const fairy = sim.nightEv === 'fairies';
            if (near < (fairy ? TUNING.wildNearFairy : TUNING.wildNear) && sim.rng.chance(fairy ? 0.9 : TUNING.wildChance)) spawnWild(sim, p);
        }
    }

    syncCompanions(sim, crits);
    syncWorkers(sim, crits);

    for (const c of crits) {
        if (!sim.s.ents[c.id]) continue;
        if (c.mode === 0) wildStep(sim, c, players, dt);
        else if (c.mode === 1) companionStep(sim, c, dt);
        else workerStep(sim, c, dt);
    }
}

// ── wild behaviour ──────────────────────────────────────────────────────────
function wildStep (sim: Sim, c: CritE, players: PlayerS[], dt: number) {
    const sp = spOf(c.sp);
    if (c.st === 2) {                                   // inside a pod
        c.vx = 0; c.vy = 0;
        c.a = (c.a ?? 0) - dt;
        if (c.a! <= 0) resolveCatch(sim, c);
        else sim.touch(c);
        return;
    }
    let near: PlayerS | null = null, nd = 58;
    for (const p of players) { const d = dist(p.x, p.y, c.x, c.y); if (d < nd) { nd = d; near = p; } }
    if (near && c.st !== 1) { c.st = 1; c.a = 1.2 + sim.rng.next(); }
    if (c.st === 1) {
        const ax = near ? c.x - near.x : Math.cos(c.t), ay = near ? c.y - near.y : Math.sin(c.t), l = Math.max(1, Math.hypot(ax, ay));
        const sp2 = sp.skittish * 0.9 * (near ? 1 : 0.5);
        c.vx = (ax / l) * sp2; c.vy = (ay / l) * sp2;
        c.a = (c.a ?? 0) - dt;
        if (!near && c.a! <= 0) { c.st = 0; c.vx = 0; c.vy = 0; c.hx = c.x; c.hy = c.y; }
    } else {
        c.t -= dt;
        if (c.t <= 0) {
            c.t = 1.5 + sim.rng.next() * 3.5;
            if (sim.rng.chance(0.55)) {
                const a = sim.rng.next() * Math.PI * 2, s = 11 + sim.rng.next() * 8;
                const tx = (c.hx ?? c.x) + Math.cos(a) * 30, ty = (c.hy ?? c.y) + Math.sin(a) * 24;
                const l = Math.max(1, dist(tx, ty, c.x, c.y));
                c.vx = ((tx - c.x) / l) * s; c.vy = ((ty - c.y) / l) * s;
            } else { c.vx = 0; c.vy = 0; }
        }
    }
    move(sim, c, dt, sp.flies);
    sim.touch(c);
    // wild ones wander off when nobody is around
    if (!players.some((p) => dist(p.x, p.y, c.x, c.y) < TUNING.wildLinger)) {
        c.life = (c.life ?? 100) - dt;
        if ((c.life ?? 1) <= 0) sim.remove(c.id);
    }
}

// ── taming ──────────────────────────────────────────────────────────────────
export function cmdTame (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'tame' }>) {
    const e = sim.s.ents[c.id];
    if (!e || e.k !== 'crit' || e.mode !== 0 || e.st === 2) return;
    if (!(c.pod in POD_POWER)) return;
    if (dist(p.x, p.y - 4, e.x, e.y - 4) > TUNING.podRange) { sim.deny(p, 'Too far away'); return; }
    if (petsOf(p).length >= rosterCap(p)) { sim.deny(p, 'Your creature roster is full'); return; }
    if (!takeItem(p, c.pod as ItemId, 1)) { sim.deny(p, 'You have no pods'); return; }
    const def = spOf(e.sp);
    const chance = catchChance(def.rarity, 1, POD_POWER[c.pod], sim.derivedOf(p).mods.catch ?? 0);
    const ok = sim.rng.chance(chance);
    e.st = 2; e.a = 2.1; e.vx = 0; e.vy = 0; e.cat = { by: p.id, ok, pod: c.pod };
    sim.touch(e);
    sim.events.push({ e: 'pod', by: p.id, id: e.id, px: p.x, py: p.y - 8, x: e.x, y: e.y - 4, ok, pod: c.pod });
    sim.fx('throwPod', p.x, p.y - 8, p.id);
}

function resolveCatch (sim: Sim, e: CritE) {
    const cat = e.cat;
    const owner = cat ? sim.s.players[cat.by] : undefined;
    const def = spOf(e.sp);
    if (!cat || !owner || petsOf(owner).length >= rosterCap(owner)) { e.st = 1; e.a = 2; e.cat = undefined; sim.touch(e); return; }
    if (cat.ok) {
        const pet = newPet(owner, e.sp, e.lv, sim.rng);
        petsOf(owner).push(pet);
        quests.count(owner, `tame:${e.sp}`);
        if (def.rarity >= 2) quests.count(owner, 'rare');
        if (def.rarity >= 3) quests.count(owner, 'legend');
        owner.dex ??= [];
        if (!owner.dex.includes(e.sp)) owner.dex.push(e.sp);
        sim.fx('catchOk', e.x, e.y - 6, owner.online ? owner.id : undefined);
        if (!chronicle.note(sim, 'tame:first', `${owner.name} befriended the farm's first creature, a ${def.name}.`, 'k_paw') && def.rarity >= 2) chronicle.note(sim, `tame:${e.sp}`, `${owner.name} befriended a ${def.name}.`, 'k_paw');
        if (owner.online) {
            sim.banner(`You befriended ${def.name}!`, `${pet.name} joined your roster  (P)`, PAL.blossom, owner.id);
            sim.gainXp(owner, 10 + def.rarity * 18);
        }
        sim.remove(e.id);
    } else {
        sim.fx('catchFail', e.x, e.y - 6, owner.online ? owner.id : undefined);
        if (owner.online) sim.float(e.x, e.y - 18, 'It broke free!', PAL.berry, owner.id);
        e.cat = undefined; e.st = 1; e.a = 2.5; e.vx = (sim.rng.next() - 0.5) * 70; e.vy = (sim.rng.next() - 0.5) * 70;
        sim.touch(e);
    }
}

// ── breeding ────────────────────────────────────────────────────────────────
const hatcheryOf = (sim: Sim, id: number): BuildE | null => {
    const b = sim.s.ents[id];
    return b && b.k === 'bld' && b.kind === 'hatchery' ? b : null;
};
const hatchCenter = (b: BuildE) => ({ x: (b.tx + 1) * TILE, y: (b.ty + 2) * TILE - 6 });

/** Seconds an egg takes for this owner. */
export const breedTime = (owner: PlayerS) => BREED_SECS / (1 + (derived(owner).mods.breed ?? 0));

export function cmdBreed (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'breed' }>) {
    const h = hatcheryOf(sim, c.id);
    if (!h || !sim.inReach(p, h, 120)) { sim.deny(p, 'Stand near the hatchery'); return; }
    const at = hatchCenter(h);
    if (c.op === 'start') {
        if (h.par || h.egg) { sim.deny(p, h.egg ? 'There is an egg waiting' : 'It is already busy'); return; }
        const a = findPet(p, c.a), b = findPet(p, c.b);
        if (!a || !b || a === b) { sim.deny(p, 'Pick two different creatures'); return; }
        if (isWorking(a) || isWorking(b) || a.nest !== undefined || b.nest !== undefined) { sim.deny(p, 'Both must be free: not working, not in another nest'); return; }
        if (petsOf(p).length >= rosterCap(p)) { sim.deny(p, 'Your roster is full: there would be nowhere for the baby to go'); return; }
        if (!takeItem(p, 'treat', BREED_TREATS)) { sim.deny(p, `You need ${BREED_TREATS} creature treats`); return; }
        if (p.comp === a.id || p.comp === b.id) p.comp = undefined;
        a.nest = h.id; b.nest = h.id;
        h.par = [a.id, b.id]; h.bt = 0; h.bo = p.id; h.egg = undefined;
        sim.touch(h);
        sim.fx('eggStart', at.x, at.y, p.id);
        sim.banner('An egg is forming…', `${a.name} and ${b.name} are settling in`, PAL.blossom, p.id);
        return;
    }
    if (h.bo !== p.id) { sim.deny(p, 'Those are not your creatures'); return; }
    if (c.op === 'cancel') {
        if (!h.par) return;
        release(sim, h);
        sim.float(at.x, at.y - 16, 'Called off', PAL.cream, p.id);
        return;
    }
    // hatch
    const egg = h.egg;
    if (!egg) return;
    if (petsOf(p).length >= rosterCap(p)) { sim.deny(p, 'Your roster is full'); return; }
    const pet = newPet(p, egg.sp, 1, sim.rng);
    pet.traits = [...egg.traits];
    petsOf(p).push(pet);
    h.egg = undefined; h.bo = undefined; h.bt = undefined;
    sim.touch(h);
    const def = spOf(egg.sp);
    p.dex ??= [];
    if (!p.dex.includes(egg.sp)) { p.dex.push(egg.sp); sim.toast(p.id, `New in your bestiary: ${def.name}`, 'k_paw', PAL.gold); }
    quests.count(p, 'hatch');
    quests.count(p, `tame:${egg.sp}`);
    if (def.rarity >= 2) quests.count(p, 'rare');
    if (def.rarity >= 3) quests.count(p, 'legend');
    sim.fx('hatch', at.x, at.y - 4, p.id);
    sim.banner(`A ${def.name} hatched!`, `${pet.name} joined your roster  (P)${egg.mu ? '  ·  a lucky surprise!' : ''}`, PAL.blossom, p.id);
    sim.gainXp(p, 12 + def.rarity * 20);
}

function release (sim: Sim, h: BuildE) {
    const owner = h.bo ? sim.s.players[h.bo] : undefined;
    if (owner) for (const id of h.par ?? []) { const pet = findPet(owner, id); if (pet) pet.nest = undefined; }
    h.par = undefined; h.bt = undefined;
    if (!h.egg) h.bo = undefined;
    sim.touch(h);
}

/** A hatchery is taken down (Sim.remove): the parents resting in it walk free, or they would be "in the hatchery" for ever. */
export function onRemove (sim: Sim, h: BuildE) {
    if (h.par) release(sim, h);
}

/** After a load: a creature whose nest is not a hatchery holding it any more (one taken down by an older build) is set free. */
export function tidy (sim: Sim) {
    for (const p of Object.values(sim.s.players)) {
        for (const pet of p.pets ?? []) {
            if (pet.nest === undefined) continue;
            const h = sim.s.ents[pet.nest];
            if (!h || h.k !== 'bld' || h.kind !== 'hatchery' || !h.par?.includes(pet.id)) pet.nest = undefined;
        }
    }
}

/** Eggs form while the parents rest; when one is ready the parents walk free. */
function updateHatcheries (sim: Sim, dt: number) {
    for (const h of sim.buildings('hatchery')) {
        if (!h.par) continue;
        const owner = h.bo ? sim.s.players[h.bo] : undefined;
        const a = owner ? findPet(owner, h.par[0]) : undefined, b = owner ? findPet(owner, h.par[1]) : undefined;
        if (!owner || !a || !b) { release(sim, h); continue; }       // a parent was released: the egg is lost
        const before = Math.floor(h.bt ?? 0);
        h.bt = (h.bt ?? 0) + dt;
        if (Math.floor(h.bt) !== before) sim.touch(h);
        if (h.bt < BREED_SECS / (1 + (sim.derivedOf(owner).mods.breed ?? 0))) continue;        // (breedTime, from the per-step cache)
        const kid = breedOffspring(a, b, sim.rng);
        h.egg = { sp: kid.sp, traits: kid.traits, ...(kid.mutated ? { mu: 1 as const } : {}) };
        release(sim, h);
        h.bo = owner.id;
        sim.touch(h);
        const at = hatchCenter(h);
        sim.fx('eggStart', at.x, at.y, owner.online ? owner.id : undefined);
        if (owner.online) sim.banner('The egg is ready!', 'Hatch it at the hatchery', PAL.blossom, owner.id);
    }
}

// ── companions ──────────────────────────────────────────────────────────────
function syncCompanions (sim: Sim, crits: CritE[]) {
    const have = new Map<string, CritE>();
    for (const c of crits) if (c.mode === 1 && c.owner) have.set(c.owner, c);
    for (const p of Object.values(sim.s.players)) {
        const pet = p.online && p.comp ? findPet(p, p.comp) : undefined;
        const ent = have.get(p.id);
        if (pet && isWorking(pet)) { p.comp = undefined; }
        const want = pet && !isWorking(pet) && p.downed <= 0 ? pet : undefined;
        if (ent && (!want || ent.pid !== want.id)) { sim.remove(ent.id); crits.splice(crits.indexOf(ent), 1); }
        else if (!ent && want) {
            const e = sim.add<CritE>({ k: 'crit', sp: want.sp, x: p.x - 14, y: p.y, vx: 0, vy: 0, t: 0, lv: want.lv, ...(starsOf(want) ? { star: starsOf(want) } : {}), mode: 1, st: 0, owner: p.id, pid: want.id, a: 0.8 });
            crits.push(e);
            sim.fx('summon', e.x, e.y - 6, p.id);
        } else if (ent && want) {
            if (ent.lv !== want.lv || (ent.star ?? 0) !== starsOf(want)) { ent.lv = want.lv; ent.star = starsOf(want) || undefined; sim.touch(ent); }
        }
    }
}

function companionStep (sim: Sim, c: CritE, dt: number) {
    const owner = c.owner ? sim.s.players[c.owner] : undefined;
    const pet = owner && c.pid ? findPet(owner, c.pid) : undefined;
    if (!owner || !pet) { sim.remove(c.id); return; }
    const sp = spOf(c.sp);
    const task = pet.task && taskOk(pet, pet.task) ? pet.task : undefined;
    const busy = task ? fieldStep(sim, c, ownerSite(sim, owner), pet, task, dt, 4) : false;      // working beside you, or trotting at heel
    if (!busy) {
        const speed = (62 + 8) * petSpeedMul(pet);
        const tx = owner.x - owner.fx * 16, ty = owner.y - owner.fy * 10 + 2;
        const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
        if (d > 150) { c.x = owner.x - 10; c.y = owner.y; c.vx = 0; c.vy = 0; }
        else if (d > 14) { const s = Math.min(speed * (d > 60 ? 1.6 : 1), d * 6); c.vx = (dx / d) * s; c.vy = (dy / d) * s; }
        else { c.vx = 0; c.vy = 0; }
        move(sim, c, dt, sp.flies);
    }
    // joins the fight: strikes the nearest monster in range (and looks again a moment later when there is none, not every step)
    c.a = (c.a ?? 0) - dt;
    if (c.a! <= 0) {
        let best: MobE | null = null, bd = 82;
        for (const e of sim.ents('mob')) {
            const dd = dist(e.x, e.y, c.x, c.y);
            if (dd < bd) { bd = dd; best = e; }
        }
        c.a = best ? 1.15 : 0.1;
        if (best) {
            const atk = petAtk(pet) * (1 + (sim.derivedOf(owner).mods.companionDmg ?? 0));
            c.tx = best.x; c.ty = best.y; c.st = 3; c.w = 0.5; c.wk = 'guard';
            sim.events.push({ e: 'work', id: c.id, kind: 'guard', x: best.x, y: best.y - 4 });
            const hpBefore = best.hp, bid = best.id;
            combat.damageMob(sim, best, atk, owner, { kx: best.x - c.x, ky: best.y - c.y, kb: 70, quiet: true });
            if (!sim.s.ents[bid]) grantPetXp(sim, owner, pet, 2 + MOBS[best.kind].tier * 2, c);
            else if (hpBefore > best.hp) grantPetXp(sim, owner, pet, 0.6);
        }
    }
    if (c.st === 3) { c.w = (c.w ?? 0) - dt; if (c.w! <= 0) c.st = 0; }
    sim.touch(c);
}

// ── dens and workers ────────────────────────────────────────────────────────
function assignedTo (sim: Sim, den: BuildE) {
    const out: { owner: PlayerS; pet: Pet }[] = [];
    for (const p of Object.values(sim.s.players)) for (const pet of petsOf(p)) if (pet.den === den.id) out.push({ owner: p, pet });
    return out;
}

function syncWorkers (sim: Sim, crits: CritE[]) {
    const dens = new Map<number, BuildE>();
    for (const b of sim.buildings('den')) dens.set(b.id, b);
    const have = new Map<string, CritE>();
    for (const c of crits) if (c.mode === 2) have.set(`${c.owner}:${c.pid}`, c);
    const wanted = new Set<string>();
    for (const p of Object.values(sim.s.players)) {
        for (const pet of petsOf(p)) {
            if (pet.post) {
                // a standing job: the animal lives at its post (an island, or beside its machine)
                const spot = jobs.postAnchor(sim, p, pet);
                if (spot) {
                    const key = `${p.id}:${pet.id}`;
                    wanted.add(key);
                    const ent = have.get(key);
                    if (!ent) {
                        const e = sim.add<CritE>({ k: 'crit', sp: pet.sp, x: spot.x + (sim.rng.next() - 0.5) * 20, y: spot.y + sim.rng.next() * 6, vx: 0, vy: 0, t: sim.rng.next() * 3, lv: pet.lv, ...(starsOf(pet) ? { star: starsOf(pet) } : {}), mode: 2, st: 0, owner: p.id, pid: pet.id, hx: spot.x, hy: spot.y, a: 2 });
                        crits.push(e);
                        sim.fx('summon', e.x, e.y - 6, p.online ? p.id : undefined);
                    } else {
                        if (ent.lv !== pet.lv || (ent.star ?? 0) !== starsOf(pet)) { ent.lv = pet.lv; ent.star = starsOf(pet) || undefined; sim.touch(ent); }
                        if (ent.hx !== spot.x || ent.hy !== spot.y) { ent.hx = spot.x; ent.hy = spot.y; }
                    }
                }
                continue;
            }
            if (!pet.den) continue;
            const den = dens.get(pet.den);
            if (!den) { pet.den = undefined; continue; }          // the den was taken down
            const key = `${p.id}:${pet.id}`;
            wanted.add(key);
            const ent = have.get(key);
            if (!ent) {
                const dc = denCenter(den);
                const e = sim.add<CritE>({ k: 'crit', sp: pet.sp, x: dc.x + (sim.rng.next() - 0.5) * 24, y: dc.y + 8 + sim.rng.next() * 8, vx: 0, vy: 0, t: sim.rng.next() * 3, lv: pet.lv, ...(starsOf(pet) ? { star: starsOf(pet) } : {}), mode: 2, st: 0, owner: p.id, pid: pet.id, den: den.id, hx: dc.x, hy: dc.y + 12, a: 2 + sim.rng.next() * 4 });
                crits.push(e);
            } else if (ent.lv !== pet.lv || ent.den !== pet.den || (ent.star ?? 0) !== starsOf(pet)) { ent.lv = pet.lv; ent.den = pet.den; ent.star = starsOf(pet) || undefined; sim.touch(ent); }
        }
    }
    for (const [key, c] of have) if (!wanted.has(key) && sim.s.ents[c.id]) { dropLoad(sim, c); sim.remove(c.id); crits.splice(crits.indexOf(c), 1); }
}

function workerStep (sim: Sim, c: CritE, dt: number) {
    const owner = c.owner ? sim.s.players[c.owner] : undefined;
    const pet = owner && c.pid ? findPet(owner, c.pid) : undefined;
    if (owner && pet?.post) { jobs.postStep(sim, c, owner, pet, dt); return; }       // a standing job at an island or a machine
    const den = c.den ? sim.s.ents[c.den] : undefined;
    if (!owner || !pet || !den || den.k !== 'bld') { sim.remove(c.id); return; }
    const sp = spOf(c.sp);
    // idle wandering round the den
    c.t -= dt;
    if (c.st === 3) { c.vx *= 0.9; c.vy *= 0.9; }
    else if (c.t <= 0) {
        c.t = 1.4 + sim.rng.next() * 3;
        if (sim.rng.chance(0.6)) {
            const a = sim.rng.next() * Math.PI * 2, s = 10 + sim.rng.next() * 8;
            const tx = (c.hx ?? c.x) + Math.cos(a) * 22, ty = (c.hy ?? c.y) + Math.sin(a) * 14;
            const l = Math.max(1, dist(tx, ty, c.x, c.y));
            c.vx = ((tx - c.x) / l) * s; c.vy = ((ty - c.y) / l) * s;
        } else { c.vx = 0; c.vy = 0; }
    }
    move(sim, c, dt, sp.flies);
    // the job
    c.a = (c.a ?? 0) - dt;
    if (c.st === 3) { c.w = (c.w ?? 0) - dt; if (c.w! <= 0) c.st = 0; }
    if (c.a! <= 0) {
        const ownerWork = sim.derivedOf(owner).mods.work ?? 0;
        const kinds = (Object.entries(sp.work) as [WorkKind, number][]).sort((a, b) => b[1] - a[1]).map(([k]) => k);
        // Handiwork only keeps machines turning, and always "finds" something: it is what a den worker does when the land has nothing for it
        const order = kinds.includes('make') ? [...kinds.filter((k) => k !== 'make'), 'make' as WorkKind] : kinds;
        let did: WorkKind | null = null;
        for (const k of order) if (doJob(sim, den, owner, pet, c, k)) { did = k; break; }
        c.ac = did ? WORK_ACTIVITY[did] : 'idle';
        if (did) {
            const cyc = workCycle(pet, did, ownerWork);
            c.a = did === 'guard' ? cyc / 4 : cyc;
            c.st = 3; c.w = 0.9; c.wk = did;
            grantPetXp(sim, owner, pet, did === 'guard' ? 1 : 3, c, true);
        } else c.a = kinds.includes('guard') ? 1 : 5;
    }
    sim.touch(c);
}

/** Put items into the nearest storage that has room (a chest near the den, or the den); the rest hits the ground. */
function stash (sim: Sim, den: BuildE, item: ItemId, n: number) {
    const dc = denCenter(den);
    stashAt(sim, dc.x, dc.y, STASH_RADIUS, item, n, { last: den.id, spill: true });
}

/** Take up to `n` of `item` out of storage near the den. */
function fetch (sim: Sim, den: BuildE, item: ItemId, n: number) {
    const dc = denCenter(den);
    return fetchAt(sim, dc.x, dc.y, STASH_RADIUS, item, n);
}

/** What one go at a den job has to hand. */
interface Job {
    sim: Sim; den: BuildE; owner: PlayerS; pet: Pet; c: CritE; kind: WorkKind;
    /** The den's middle, and whether a point is within the den's reach. */
    dc: { x: number; y: number }; near (x: number, y: number): boolean;
    /** The creature's luck (traits and its owner's), and its aptitude for this job. */
    luck: number; apt: number;
    /** Show the work: the creature turns to the spot and the clients animate it. */
    visual (x: number, y: number): void;
}

/** Lumber and mining: break a node in reach and put what it drops in a chest. */
function jobGather (j: Job): boolean {
    const { sim, kind, apt } = j;
    const groups = kind === 'gather' ? ['wood', 'plant'] : ['stone', 'ore', 'earth', 'gem'];
    const list = sim.ents('node').filter((e) => !NODES[e.kind].titan && groups.includes(NODES[e.kind].group)
        && j.near((e.tx + 0.5) * TILE, (e.ty + 0.5) * TILE) && (NODES[e.kind].minTier ?? 0) <= Math.max(0, apt - 1));
    if (!list.length) return false;
    const n = sim.rng.pick(list);
    const def = NODES[n.kind];
    const cx = (n.tx + 0.5) * TILE, cy = (n.ty + 1) * TILE - 7;
    const plot = sim.s.plots[n.plot] as Plot | undefined;
    j.visual(cx, cy);
    sim.fx(def.brk, cx, cy);
    sim.remove(n.id);
    for (const [res, min, max, chance = 1] of def.drops) {
        if (res === 'coin' || !sim.rng.chance(chance)) continue;
        let count = sim.rng.int(min, max) + (plot?.mod === 'bountiful' ? 1 : 0);
        if (sim.rng.chance(j.luck)) count *= 2;
        stash(sim, j.den, res, count);
    }
    sim.fx('petWork', cx, cy);
    return true;
}

/** Farming: harvest a ripe bed, else plant an empty one from the chests, else water one that is growing. */
function jobFarm (j: Job): boolean {
    const { sim, den, owner, apt } = j;
    const beds = sim.buildings('bed').filter((b) => j.near((b.tx + 0.5) * TILE, (b.ty + 0.5) * TILE));
    if (!beds.length) return false;
    const ripe = beds.find((b) => b.crop === 2 && b.plant);
    if (ripe) {
        const crop = CROPS[ripe.plant!]!;
        const bc = sim.center(ripe);
        j.visual(bc.x, bc.y);
        const count = sim.rng.int(crop.yield[0], crop.yield[1]) + (sim.rng.chance(j.luck) ? 1 : 0);
        const seed = ripe.plant!;
        stash(sim, den, crop.out, count);
        if (sim.rng.chance(crop.seedBack + 0.2)) stash(sim, den, seed, 1);
        ripe.crop = -1; ripe.plant = undefined; ripe.growT = 0; sim.touch(ripe);
        quests.count(owner, 'crop');
        sim.fx('petWork', bc.x, bc.y);
        return true;
    }
    const empty = beds.find((b) => (b.crop ?? -1) < 0);
    if (empty) {
        const seed = SEED_IDS.find((s) => fetch(sim, den, s, 1) > 0);
        if (seed) {
            empty.crop = 0; empty.plant = seed; empty.growT = 0; sim.touch(empty);
            const bc = sim.center(empty);
            j.visual(bc.x, bc.y);
            sim.fx('plant', bc.x, bc.y);
            return true;
        }
    }
    const growing = beds.filter((b) => b.crop === 0 || b.crop === 1);
    if (growing.length) {
        const b = sim.rng.pick(growing);
        b.growT = (b.growT ?? 0) + 3 + apt * 2.5;      // watering
        sim.touch(b);
        const bc = sim.center(b);
        j.visual(bc.x, bc.y);
        sim.fx('petWork', bc.x, bc.y);
        return true;
    }
    return false;
}

/** Hauling: empty the first machine or drill in reach that has something in its tray, a dozen things at a time. */
function jobHaul (j: Job): boolean {
    const { sim, den } = j;
    let moved = 0;
    for (const b of sim.buildings()) {
        const def = BUILDINGS[b.kind];
        if ((!def.proc && b.kind !== 'drill') || !b.out || !j.near((b.tx + 1) * TILE, (b.ty + 1) * TILE)) continue;
        for (const [item, n] of Object.entries(b.out) as [ItemId, number][]) {
            if (n <= 0 || moved >= 12) continue;
            const take = Math.min(n, 12 - moved);
            invDrop(b.out, item, take); stash(sim, den, item, take); moved += take;
        }
        if (moved) { sim.touch(b); const bc = sim.center(b); j.visual(bc.x, bc.y); sim.fx('petWork', bc.x, bc.y); break; }
    }
    return moved > 0;
}

/** Kindling stokes the furnaces; Handiwork only keeps the other machines turning. Both speed up everything in reach. */
function jobCraft (j: Job): boolean {
    const { sim, den, kind } = j;
    let did = false;
    for (const b of sim.buildings()) {
        const def = BUILDINGS[b.kind];
        if (!def.proc || !j.near((b.tx + 1) * TILE, (b.ty + 1) * TILE)) continue;
        b.boost = sim.s.time + 40;
        b.bs = 0.25;
        if (kind === 'craft' && def.fuel && (b.fuel ?? 0) < 6 && invSum(b.fin) < 3) {
            for (const item of ['coal', 'peat', 'plank', 'wood'] as ItemId[]) {
                if (!FUEL[item]) continue;
                const got = fetch(sim, den, item, 4);
                if (got) { b.fin ??= {}; invPut(b.fin, item, got); break; }
            }
        }
        sim.touch(b);
        const bc = sim.center(b);
        if (!did) { j.visual(bc.x, bc.y); sim.fx('petWork', bc.x, bc.y); }
        did = true;
    }
    return did;
}

/** Guarding: strike the nearest monster (never a boss) within reach of the den. */
function jobGuard (j: Job): boolean {
    const { sim, owner, pet, dc } = j;
    let best: MobE | null = null, bd = 150;
    for (const e of sim.ents('mob')) {
        if (MOBS[e.kind].boss) continue;
        const d = dist(e.x, e.y, dc.x, dc.y);
        if (d < bd) { bd = d; best = e; }
    }
    if (!best) return false;
    j.visual(best.x, best.y - 4);
    combat.damageMob(sim, best, petAtk(pet) * (1 + (sim.derivedOf(owner).mods.companionDmg ?? 0)), owner, { kx: best.x - dc.x, ky: best.y - dc.y, kb: 80, quiet: true });
    return true;
}

/** One try at each kind of den job. (Sorting is an island job: a den worker has no chests to walk between.) */
const DEN_JOBS: Record<WorkKind, (j: Job) => boolean> = { gather: jobGather, mine: jobGather, farm: jobFarm, haul: jobHaul, craft: jobCraft, make: jobCraft, sort: () => false, guard: jobGuard };

function doJob (sim: Sim, den: BuildE, owner: PlayerS, pet: Pet, c: CritE, kind: WorkKind): boolean {
    const dc = denCenter(den);
    const j: Job = {
        sim, den, owner, pet, c, kind, dc,
        near: (x, y) => dist(x, y, dc.x, dc.y) <= DEN_RADIUS,
        luck: petLuck(pet) + (sim.derivedOf(owner).luck ?? 0),
        apt: spOf(pet.sp).work[kind] ?? 0,
        visual: (x, y) => { c.tx = x; c.ty = y; sim.events.push({ e: 'work', id: c.id, kind, x, y }); },
    };
    return DEN_JOBS[kind]?.(j) ?? false;
}

// ── commands ────────────────────────────────────────────────────────────────
export function cmdPet (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'pet' }>) {
    const pet = findPet(p, c.pet);
    if (!pet) return;
    if (pet.nest !== undefined && c.op !== 'rename') { sim.deny(p, `${pet.name} is in the hatchery`); return; }
    switch (c.op) {
        case 'companion':
            if (pet.den) pet.den = undefined;
            if (pet.post) { pet.post = undefined; pet.ps = undefined; }
            p.comp = pet.id;
            sim.fx('equip', p.x, p.y - 8, p.id);
            return;
        case 'rest':
            if (p.comp === pet.id) p.comp = undefined;
            return;
        case 'assign': {
            const den = c.den !== undefined ? sim.s.ents[c.den] : undefined;
            if (!den || den.k !== 'bld' || den.kind !== 'den' || !sim.inReach(p, den, 160)) { sim.deny(p, 'Stand near the den'); return; }
            if (assignedTo(sim, den).length >= (BUILDINGS.den.pets ?? 3) && pet.den !== den.id) { sim.deny(p, 'The den is full'); return; }
            const working = petsOf(p).filter((x) => isWorking(x) && x.id !== pet.id).length;
            if (working >= workSlots(p)) { sim.deny(p, `You can only have ${workSlots(p)} creatures working`); return; }
            if (p.comp === pet.id) p.comp = undefined;
            pet.post = undefined; pet.ps = undefined;
            pet.den = den.id;
            sim.fx('build', denCenter(den).x, denCenter(den).y - 6, p.id);
            return;
        }
        case 'unassign': pet.den = undefined; pet.post = undefined; pet.ps = undefined; return;
        case 'post': return jobs.cmdPost(sim, p, pet, c);
        case 'order': return jobs.cmdOrder(sim, p, pet, c);
        case 'task': {
            const kind = c.task ?? undefined;
            if (kind !== undefined && (typeof kind !== 'string' || !taskOk(pet, kind))) { sim.deny(p, `${pet.name} cannot do that`); return; }
            pet.task = kind;
            if (kind) { if (pet.den) pet.den = undefined; if (pet.post) { pet.post = undefined; pet.ps = undefined; } p.comp = pet.id; quests.count(p, 'pettask'); }   // a creature with a job comes along
            sim.fx('equip', p.x, p.y - 8, p.id);
            return;
        }
        case 'feed': {
            const item = c.item;
            if (!item || !ITEMS[item]) return;
            const xp = item === 'treat' ? 60 : ITEMS[item].food ? ITEMS[item].food! * 0.5 : 0;
            if (xp <= 0 || pet.lv >= PET_MAX_LEVEL) { sim.deny(p, pet.lv >= PET_MAX_LEVEL ? `${pet.name} is at the top` : "It won't eat that"); return; }
            if (!takeItem(p, item, 1)) return;
            sim.fx('eat', p.x, p.y - 8, p.id);
            grantPetXp(sim, p, pet, xp, { x: p.x, y: p.y });
            return;
        }
        case 'awaken': {
            const star = starsOf(pet);
            const next = AWAKENINGS[star];
            if (!next) { sim.deny(p, `${pet.name} is fully awakened`); return; }
            if (pet.lv < next.lv) { sim.deny(p, `${pet.name} must reach level ${next.lv} first`); return; }
            const cost = Object.entries(next.cost) as [ItemId, number][];
            const short = cost.find(([item, n]) => countOf(p, item) < n);
            if (short) { sim.deny(p, `Needs ${short[1]} ${ITEMS[short[0]].name}`); return; }
            for (const [item, n] of cost) takeItem(p, item, n);
            pet.star = star + 1;
            pet.hp = undefined;
            // the first and the last awakening bring out a trait it did not know it had
            let gift = '';
            if ((star === 0 || star === 2) && pet.traits.length < 3) {
                const pool = TRAIT_IDS.filter((t) => !pet.traits.includes(t));
                if (pool.length) { const t = sim.rng.pick(pool); pet.traits.push(t); gift = TRAITS[t].name; }
            }
            const where = sim.ents('crit').find((e) => e.pid === pet.id && e.owner === p.id);
            const x = where?.x ?? p.x, y = (where?.y ?? p.y) - 10;
            sim.fx('awaken', x, y, p.id);
            sim.banner(`${pet.name} awakened!`, `${'★'.repeat(pet.star)}${'☆'.repeat(STAR_MAX - pet.star)}${gift ? `  ·  discovered ${gift}` : ''}`, PAL.gold, p.id);
            quests.count(p, 'awaken');
            if (pet.star >= STAR_MAX) quests.count(p, 'awakenmax');
            return;
        }
        case 'release': {
            const i = petsOf(p).indexOf(pet);
            petsOf(p).splice(i, 1);
            if (p.comp === pet.id) p.comp = undefined;
            sim.give(p, 'coin', 3 * pet.lv);
            sim.float(p.x, p.y - 24, `${pet.name} went back to the wild`, PAL.cream, p.id);
            return;
        }
        case 'rename': {
            const name = String(c.name ?? '').replace(/[^\w '\-!]/g, '').trim().slice(0, 14);
            if (name) pet.name = name;
            return;
        }
    }
}
