// Crops and processors (furnace, sawmill, millstone…): buffers, fuel, recipes, and the
// commands that move items in and out of buildings. This is also where belts, inserters,
// drills and power plug in later.

import { TUNING } from '../config';
import { seasonDef } from '../season';
import { BUILDINGS, CROPS } from '../data/buildings';
import { filterLabel, takes } from '../data/filters';
import { bestFuel, FUEL, fuelValue, ITEMS, ItemId } from '../data/items';
import { RECIPES, recipesFor } from '../data/recipes';
import { PAL } from '../palette';
import { weatherAt } from '../weather';
import * as death from './death';
import * as quests from './quests';
import type { Sim } from './sim';
import { addItem, countOf, takeItem } from './stats';
import type { BuildE, Cmd, Inv, PlayerS } from './types';
import { storageOf } from './uber';

export const OUT_CAP = 200;

// ── small inventory helpers (shared by the factory, the creatures and the status text) ──
export const invHas = (inv: Inv | undefined, id: ItemId) => inv?.[id] ?? 0;
export const invSum = (inv: Inv | undefined) => Object.values(inv ?? {}).reduce((a, b) => a + (b ?? 0), 0);
export function invPut (inv: Inv, id: ItemId, n: number) { inv[id] = (inv[id] ?? 0) + n; }
export function invDrop (inv: Inv, id: ItemId, n: number) {
    const left = (inv[id] ?? 0) - n;
    if (left > 0) inv[id] = left; else delete inv[id];
}
const satisfied = (inv: Inv | undefined, cost: Partial<Record<ItemId | 'coin', number>>) =>
    (Object.entries(cost) as [ItemId, number][]).every(([id, n]) => invHas(inv, id) >= n);

/** Can this building take one more of `item` right now (as an ingredient, fuel or stored item)? */
export function accepts (b: BuildE, item: ItemId): 'inv' | 'fuel' | null {
    const def = BUILDINGS[b.kind];
    if (def.storage) return invSum(b.inv) < storageOf(b) && takes(b.fl, item) ? 'inv' : null;       // (a dedicated chest only takes its own kind)
    if (def.fuel && FUEL[item] && invSum(b.fin) < 12 && (def.proc !== 'furnace' || invHas(b.fin, item) < 12)) {
        // coal is also a steel ingredient: keep the fuel slot topped up first
        if (def.proc !== 'furnace' || !procInputs(b.kind).has(item) || invSum(b.fin) < 4) return 'fuel';
    }
    if (def.proc) {
        if (def.proc === 'assembler') {
            const r = b.sel ? RECIPES[b.sel] : null;
            const need = r?.in[item];
            return need && invHas(b.inv, item) < need * 3 ? 'inv' : null;
        }
        return procInputs(b.kind).has(item) && invHas(b.inv, item) < 40 ? 'inv' : null;
    }
    return null;
}

/** The ingredients each kind of processor takes (an assembler: per chosen recipe), worked out once. Shared sets: never change one. */
const INPUTS_OF = new Map<string, Set<ItemId>>();
const NO_INPUTS = new Set<ItemId>();

/** Items a processor of this kind accepts as ingredients. */
export function procInputs (kind: BuildE['kind'], sel?: string): ReadonlySet<ItemId> {
    const proc = BUILDINGS[kind].proc;
    if (!proc) return NO_INPUTS;
    const key = proc === 'assembler' ? `assembler:${sel && RECIPES[sel] ? sel : ''}` : proc;
    let set = INPUTS_OF.get(key);
    if (!set) {
        set = new Set<ItemId>();
        for (const r of proc === 'assembler' ? (sel && RECIPES[sel] ? [RECIPES[sel]] : []) : recipesFor(proc)) for (const id of Object.keys(r.in) as ItemId[]) set.add(id);
        INPUTS_OF.set(key, set);
    }
    return set;
}

// ── crops ──────────────────────────────────────────────────────────────────
export function plantBed (sim: Sim, p: PlayerS, b: BuildE, seed: ItemId) {
    if (!CROPS[seed] || !takeItem(p, seed, 1)) return;
    sowBed(sim, p, b, seed);
}

/** Put a seed in the ground (the seed itself has already been taken from wherever it came from). */
export function sowBed (sim: Sim, p: PlayerS, b: BuildE, seed: ItemId) {
    if (!CROPS[seed]) return;
    b.crop = 0;
    b.plant = seed;
    b.growT = 0;
    b.by = p.id;
    sim.touch(b);
    const c = sim.center(b);
    sim.fx('plant', c.x, c.y, p.id);
    sim.gainXp(p, 1);
    quests.count(p, 'plant');
}

export function harvestBed (sim: Sim, p: PlayerS, b: BuildE) {
    const def = b.plant ? CROPS[b.plant] : undefined;
    if (b.crop !== 2 || !def || !b.plant) return;
    const c = sim.center(b);
    const d = sim.derivedOf(p);
    const count = sim.rng.int(def.yield[0], def.yield[1]) + Math.floor(d.mods.cropYield ?? 0)
        + (sim.rng.chance((d.mods.cropYield ?? 0) % 1) ? 1 : 0) + (sim.rng.chance(seasonDef(sim.s.day).yield) ? 1 : 0);
    for (let i = 0; i < count; i++) sim.spawnDrop(def.out, c.x, c.y);
    if (sim.rng.chance(def.seedBack + (d.mods.seedChance ?? 0))) sim.spawnDrop(b.plant, c.x, c.y);
    b.crop = -1;
    b.plant = undefined;
    b.growT = 0;
    sim.touch(b);
    sim.fx('harvestCrop', c.x, c.y, p.id);
    p.stats.harvested++;
    quests.count(p, 'crop');
    sim.gainXp(p, def.xp);
}

// ── processors ─────────────────────────────────────────────────────────────
function findRecipe (sim: Sim, b: BuildE) {
    const proc = BUILDINGS[b.kind].proc!;
    const owner = b.by ? sim.s.players[b.by] : undefined;
    if (proc === 'assembler') {
        const r = b.sel ? RECIPES[b.sel] : null;
        return r && (!owner || sim.hasUnlock(owner, r.req)) && invHas(b.out, r.out) < OUT_CAP && satisfied(b.inv, r.in) ? r : null;
    }
    for (const r of recipesFor(proc)) {
        if (owner && !sim.hasUnlock(owner, r.req)) continue;
        if (invHas(b.out, r.out) >= OUT_CAP) continue;
        if (satisfied(b.inv, r.in)) return r;
    }
    return null;
}

export function step (sim: Sim, dt: number) {
    sim.machineT += dt;
    const rain = weatherAt(sim.s.seed, sim.s.day, sim.s.clock).rain;
    const pulse = sim.machineT >= 0.5;
    if (pulse) sim.machineT = 0;
    for (const b of sim.buildings()) {
        const def = BUILDINGS[b.kind];
        if (b.kind === 'bed') {
            if (b.crop === 0 || b.crop === 1) {
                const crop = b.plant ? CROPS[b.plant] : undefined;
                const owner = b.by ? sim.s.players[b.by] : undefined;
                if (!crop) { b.crop = -1; sim.touch(b); continue; }
                b.growT = (b.growT ?? 0) + dt * (owner ? sim.derivedOf(owner).growMul : 1) * (1 + TUNING.rainGrow * rain) * seasonDef(sim.s.day).grow;
                if (b.growT >= crop.stageSecs) { b.growT = 0; b.crop++; sim.touch(b); }
            }
            continue;
        }
        if (!def.proc) continue;
        if (!b.rcp) {
            const r = findRecipe(sim, b);
            if (!r) continue;
            b.rcp = r.id; b.prog = 0;
            sim.touch(b);
        }
        const r = RECIPES[b.rcp];
        if (!r || !satisfied(b.inv, r.in)) { b.rcp = undefined; b.prog = 0; b.act = 0; sim.touch(b); continue; }
        if (def.use) {
            b.act = 1;
            if ((b.pw ?? 0) <= 0.01) continue;           // no power: waits
        }
        const owner = b.by ? sim.s.players[b.by] : undefined;
        const od = owner ? sim.derivedOf(owner) : null;
        if (def.fuel && (b.fuel ?? 0) <= 0) {
            b.fin ??= {};
            const fuelItem = bestFuel((i) => invHas(b.fin, i));
            if (fuelItem) {
                invDrop(b.fin, fuelItem, 1);
                b.fuel = fuelValue(fuelItem) * (1 + (od?.mods.fuelSave ?? 0));
                sim.touch(b);
            }
        }
        if (def.fuel && (b.fuel ?? 0) <= 0) continue;     // out of fuel: waits
        const speed = (1 + (od?.mods.machineSpeed ?? 0) + (b.kind === 'furnace' ? od?.mods.smelt ?? 0 : 0) + ((b.boost ?? 0) > sim.s.time ? b.bs ?? 0.25 : 0)) * (def.use ? (b.pw ?? 0) : 1);
        b.prog = (b.prog ?? 0) + dt * speed;
        if (def.fuel) b.fuel = (b.fuel ?? 0) - dt;
        if (b.prog >= r.time) {
            for (const [id, n] of Object.entries(r.in) as [ItemId, number][]) invDrop(b.inv!, id, n);       // (satisfied: the inputs are there)
            invPut((b.out ??= {}), r.out, r.n);
            sim.s.prod ??= {};
            sim.s.prod[r.out] = (sim.s.prod[r.out] ?? 0) + r.n;
            if (owner) quests.count(owner, `make:${r.out}`, r.n);
            b.prog = 0;
            b.rcp = undefined;
            const c = sim.center(b);
            sim.fx('smelt', c.x, c.y, owner?.online ? owner.id : undefined);
            if (owner?.online) sim.gainXp(owner, r.xp);
            sim.touch(b);
        } else if (pulse) sim.touch(b);
    }
}

// ── commands ───────────────────────────────────────────────────────────────
export function cmdXfer (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'xfer' }>) {
    const b = sim.reachableBuilding(p, c.id);
    const def = b && BUILDINGS[b.kind];
    if (!b || !def || !ITEMS[c.item]) return;
    const n0 = Math.floor(c.n);
    if (!(n0 > 0)) return;
    const part = c.part ?? (def.storage || def.grave ? 'inv' : c.dir === 'take' ? 'out' : 'inv');
    const target = part === 'out' ? (b.out ??= {}) : part === 'fuel' ? (b.fin ??= {}) : (b.inv ??= {});
    const centre = sim.center(b);
    if (c.dir === 'put') {
        if (part === 'out') return;
        if (def.grave) { sim.deny(p, 'Take things out of it: nothing goes in'); return; }
        if (def.storage && !takes(b.fl, c.item)) { sim.deny(p, `This chest only takes ${filterLabel(b.fl).toLowerCase()}`); return; }
        if (def.proc || def.fuel) {
            const ok = part === 'fuel' ? !!def.fuel && !!FUEL[c.item] : procInputs(b.kind, b.sel).has(c.item);
            if (!ok) { sim.deny(p, part === 'fuel' ? "That won't burn" : "That doesn't go in here"); return; }
        }
        let n = Math.min(n0, countOf(p, c.item));
        if (def.storage) n = Math.min(n, storageOf(b) - invSum(b.inv));
        if (def.proc || def.fuel) n = Math.min(n, 300 - invHas(target, c.item));
        if (n <= 0) { sim.deny(p, def.storage ? 'The chest is full' : 'Nothing to load'); return; }
        takeItem(p, c.item, n);
        invPut(target, c.item, n);
        b.by = p.id;
        sim.touch(b);
        sim.fx('load', centre.x, centre.y, p.id);
        if (def.storage) quests.count(p, 'stash');       // (the tutorial counts it)
    } else {
        let n = Math.min(n0, invHas(target, c.item));
        if (n <= 0) return;
        n = addItem(p, c.item, n);
        if (n <= 0) { sim.deny(p, 'Your pockets are full'); return; }
        invDrop(target, c.item, n);
        sim.touch(b);
        sim.fx('collect', centre.x, centre.y, p.id);
        death.tidy(sim, b);
    }
}

/** "Load everything useful": ingredients for unlocked recipes, plus fuel. */
export function cmdLoad (sim: Sim, p: PlayerS, id: number) {
    const b = sim.reachableBuilding(p, id);
    const def = b && BUILDINGS[b.kind];
    if (!b || !def || (!def.proc && !def.fuel)) return;
    b.inv ??= {}; b.fin ??= {};
    let moved = 0;
    const ingredients = new Set<ItemId>();
    for (const r of def.proc ? recipesFor(def.proc).filter((q) => def.proc !== 'assembler' || q.id === b.sel) : []) {
        if (!sim.hasUnlock(p, r.req)) continue;
        for (const i of Object.keys(r.in) as ItemId[]) if (!(def.fuel && FUEL[i])) ingredients.add(i);
    }
    for (const i of ingredients) {
        const n = Math.min(countOf(p, i), 60 - invHas(b.inv, i));
        if (n > 0) { takeItem(p, i, n); invPut(b.inv, i, n); moved += n; }
    }
    if (def.fuel && invSum(b.fin) < 20) {
        const best = bestFuel((i) => countOf(p, i));
        if (best) {
            const n = Math.min(countOf(p, best), 20);
            takeItem(p, best, n); invPut(b.fin, best, n); moved += n;
        }
    }
    if (!moved) { sim.deny(p, 'Nothing to load'); return; }
    b.by = p.id;
    sim.touch(b);
    const c = sim.center(b);
    sim.fx('load', c.x, c.y, p.id);
}

export function cmdCollect (sim: Sim, p: PlayerS, id: number) {
    const b = sim.reachableBuilding(p, id);
    if (!b?.out) return;
    let got = 0;
    for (const [item, n] of Object.entries(b.out) as [ItemId, number][]) {
        const added = addItem(p, item, n);
        if (added > 0) { invDrop(b.out, item, added); got += added; }
    }
    if (!got) { sim.deny(p, invSum(b.out) ? 'Your pockets are full' : 'Nothing to collect'); return; }
    sim.touch(b);
    const c = sim.center(b);
    sim.fx('collect', c.x, c.y, p.id);
    sim.float(c.x, c.y - 14, `+${got} collected`, PAL.lime, p.id);
}

