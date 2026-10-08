// Automation: drills mine veins, belts carry, inserters move items between anything with a
// buffer, generators and poles make a power grid, and everything slows down (or stops)
// when the grid can't keep up. Runs every simulation step after the processors.

import { BUILDINGS, isBeltLike } from '../data/buildings';
import { cleanFilter, validIcon } from '../data/filters';
import { bestFuel, fuelValue, ITEMS, ItemId } from '../data/items';
import { RECIPES } from '../data/recipes';
import type { Sim } from './sim';
import { chuteSell, chuteStep, chuteSells, chuteTakes } from './chute';
import { accepts, invDrop, invHas, invPut, invSum } from './machines';
import { sunlight } from '../daylight';
import { buildPowerGraph, netStats, PowerGraph } from './power';
import type { BuildE, Cmd, PlayerS } from './types';

/** East, south, west, north. */
export const DIRS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const TUNNEL_RANGE = 6;    // tiles an underground belt can span
const BELT_PERIOD = 0.17;
export const DRILL_BASE = 3.5;          // seconds per item with all four tiles on ore
export const SWING = 0.8;               // seconds per inserter swing
export const DRILL_BUF = 8;

/** The world's power grid, rebuilt only when a piece that matters to it has come or gone (`Sim.powerDirty`). */
export function powerGraph (sim: Sim): PowerGraph {
    if (!sim.powerGraph || sim.powerDirty) {
        sim.powerGraph = buildPowerGraph(sim.buildings());
        sim.powerDirty = false;
    }
    return sim.powerGraph;
}

const entAt = (sim: Sim, tx: number, ty: number): BuildE | null => {
    const w = sim.world;
    const id = w.occAt(tx, ty) || w.floorAt(tx, ty);
    const e = id ? sim.s.ents[id] : null;
    return e && e.k === 'bld' ? e : null;
};

/**
 * The other end of an underground belt: an entrance looks ahead for the nearest exit facing the
 * same way, an exit looks back for its entrance. Anything in between is passed underneath. A
 * piece of the same kind in the way pairs first, so tunnels never cross-link.
 */
export function tunnelPartner (at: (tx: number, ty: number) => BuildE | null, b: BuildE): BuildE | null {
    const forward = b.kind === 'tunnel';
    if (!forward && b.kind !== 'tunnelx') return null;
    const [dx, dy] = DIRS[b.rot & 3];
    const sgn = forward ? 1 : -1;
    for (let i = 1; i <= TUNNEL_RANGE; i++) {
        const e = at(b.tx + dx * i * sgn, b.ty + dy * i * sgn);
        if (!e || (e.rot & 3) !== (b.rot & 3)) continue;
        if (e.kind === b.kind) return null;
        if (e.kind === (forward ? 'tunnelx' : 'tunnel')) return e;
    }
    return null;
}

/** Tiles just outside a footprint on the side the machine faces (rot 0 = east …). */
export function frontTiles (b: BuildE): [number, number][] {
    const [w, h] = BUILDINGS[b.kind].size;
    const [dx, dy] = DIRS[b.rot & 3];
    const out: [number, number][] = [];
    if (dx !== 0) for (let y = 0; y < h; y++) out.push([dx > 0 ? b.tx + w : b.tx - 1, b.ty + y]);
    else for (let x = 0; x < w; x++) out.push([b.tx + x, dy > 0 ? b.ty + h : b.ty - 1]);
    return out;
}

// ── what can be taken from / given to a building ───────────────────────────
export function listItems (b: BuildE): ItemId[] {
    const def = BUILDINGS[b.kind];
    if (isBeltLike(b.kind)) {
        const s = b.belt ?? [];
        for (let i = 2; i >= 0; i--) if (s[i]) return [s[i] as ItemId];
        return [];
    }
    if (def.storage) return (Object.keys(b.inv ?? {}) as ItemId[]).filter((i) => invHas(b.inv, i) > 0);
    if (def.proc || b.kind === 'drill') return (Object.keys(b.out ?? {}) as ItemId[]).filter((i) => invHas(b.out, i) > 0);
    return [];
}

function takeOne (b: BuildE, item: ItemId): boolean {
    if (isBeltLike(b.kind)) {
        const s = b.belt ?? [];
        for (let i = 2; i >= 0; i--) if (s[i] === item) { s[i] = null; return true; }
        return false;
    }
    const part = BUILDINGS[b.kind].storage ? b.inv : b.out;
    if (!part || invHas(part, item) < 1) return false;
    invDrop(part, item, 1);
    return true;
}

export function canAccept (b: BuildE, item: ItemId): boolean {
    if (isBeltLike(b.kind)) { const s = b.belt ?? []; return !s[0] || !s[1]; }
    if (b.kind === 'chute') return chuteTakes(b, item);
    return accepts(b, item) !== null;
}

function insertOne (sim: Sim, b: BuildE, item: ItemId): boolean {
    if (isBeltLike(b.kind)) {
        const s = (b.belt ??= [null, null, null]);
        if (!s[1]) s[1] = item; else if (!s[0]) s[0] = item; else return false;
        sim.touch(b);
        return true;
    }
    if (b.kind === 'chute') return chuteSell(sim, b, item);        // (sold on the spot: coins to whoever built it)
    const where = accepts(b, item);
    if (!where) return false;
    if (where === 'fuel') invPut((b.fin ??= {}), item, 1); else invPut((b.inv ??= {}), item, 1);
    sim.touch(b);
    return true;
}

// ── step ───────────────────────────────────────────────────────────────────
export function stepFactory (sim: Sim, dt: number) {
    if (!sim.factoryN) return;                        // (nothing automated yet: most of a young farm)
    const all = sim.buildings();
    const g = powerGraph(sim);
    const owner = (b: BuildE): PlayerS | undefined => (b.by ? sim.s.players[b.by] : undefined);

    for (const b of all) {
        if (b.kind === 'drill') stepDrill(sim, b, dt, owner(b));
        else if (b.kind === 'inserter') stepInserter(sim, b, dt, owner(b));
        else if (b.kind === 'coalgen') stepCoalGen(sim, b, dt);
        else if (b.kind === 'chute') chuteStep(sim, b);
    }
    sim.beltT += dt;
    if (sim.beltT >= BELT_PERIOD) {
        const speed = Math.max(0, ...sim.online.map((q) => sim.derivedOf(q).mods.beltSpeed ?? 0));
        sim.beltT -= BELT_PERIOD / (1 + speed);
        stepBelts(sim, all);
    }
    updatePower(sim, g, dt);
}

/**
 * Where the item at the head of this belt piece may go, best first. A belt only ever sends
 * things straight on. A splitter takes turns between forward, left and right; a sorter sends
 * what matches its filter straight on and everything else to the sides, taking turns.
 */
function routes (sim: Sim, b: BuildE, item: ItemId, front: BuildE | null): BuildE[] {
    if (b.kind === 'belt' || b.kind === 'tunnel' || b.kind === 'tunnelx') return front ? [front] : [];
    const side = (k: number) => { const [dx, dy] = DIRS[(b.rot + k) & 3]; return entAt(sim, b.tx + dx, b.ty + dy); };
    const turn = <T>(list: T[]): T[] => { const r = (b.rr ?? 0) % Math.max(1, list.length); return [...list.slice(r), ...list.slice(0, r)]; };
    const left = side(3), right = side(1);
    const pick = (list: (BuildE | null)[]) => list.filter((x): x is BuildE => !!x);
    if (b.kind === 'splitter') return turn(pick([front, left, right]));
    // sorter
    if (!b.flt) return pick([front]);
    return b.flt === item ? pick([front]) : turn(pick([left, right]));
}

function stepBelts (sim: Sim, all: readonly BuildE[]) {
    const belts = all.filter((b) => isBeltLike(b.kind));
    if (!belts.length) return;
    const next = new Map<number, BuildE | null>();
    for (const b of belts) {
        const [dx, dy] = DIRS[b.rot & 3];
        next.set(b.id, b.kind === 'tunnel' ? tunnelPartner((tx, ty) => entAt(sim, tx, ty), b) : entAt(sim, b.tx + dx, b.ty + dy));
    }
    // downstream first, so a full line shuffles forward in one pass
    const order: BuildE[] = [];
    const state = new Map<number, number>();
    const visit = (b: BuildE) => {
        if (state.get(b.id)) return;
        state.set(b.id, 1);
        const n = next.get(b.id);
        if (n && isBeltLike(n.kind)) visit(n);
        order.push(b);
    };
    for (const b of belts) visit(b);
    for (const b of order) {
        const s = (b.belt ??= [null, null, null]);
        let changed = false;
        if (s[2]) {
            const item = s[2] as ItemId;
            for (const n of routes(sim, b, item, next.get(b.id) ?? null)) {
                if (isBeltLike(n.kind)) {
                    // a belt that points straight back at us would never take it
                    const [ndx, ndy] = DIRS[n.rot & 3];
                    const headOn = n.tx + ndx === b.tx && n.ty + ndy === b.ty;
                    const ns = (n.belt ??= [null, null, null]);
                    if (headOn || ns[0]) continue;
                    ns[0] = item; s[2] = null; sim.touch(n); changed = true;
                } else if (canAccept(n, item) && insertOne(sim, n, item)) { s[2] = null; changed = true; }
                if (!s[2]) { if (b.kind !== 'belt') b.rr = ((b.rr ?? 0) + 1) % 6; break; }
            }
        }
        if (!s[2] && s[1]) { s[2] = s[1]; s[1] = null; changed = true; }
        if (!s[1] && s[0]) { s[1] = s[0]; s[0] = null; changed = true; }
        if (changed) sim.touch(b);
    }
}

/**
 * What a drill stands on: the ore most of its tiles have, and how many. A plot's veins are a list that is only ever replaced whole
 * (`ensureVeins`), so the answer is kept per drill (Sim.drillVeins) with the lists it was read from, and read again only when one
 * of those has been swapped for another.
 */
function veinsUnder (sim: Sim, b: BuildE) {
    const [w, h] = BUILDINGS.drill.size;
    const lists: (unknown[] | undefined)[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lists.push(sim.world.plotAt(b.tx + x, b.ty + y)?.veins);
    let got = sim.drillVeins.get(b.id);
    if (!got || got.from.some((v, i) => v !== lists[i])) {
        const counts = new Map<ItemId, number>();
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const v = sim.world.veinAt(b.tx + x, b.ty + y);
            if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        got = { best: null, tiles: 0, from: lists };
        for (const [res, n] of counts) if (n > got.tiles) got = { best: res, tiles: n, from: lists };
        sim.drillVeins.set(b.id, got);
    }
    return got;
}

function stepDrill (sim: Sim, b: BuildE, dt: number, owner?: PlayerS) {
    b.out ??= {};
    const { best, tiles } = veinsUnder(sim, b);
    const full = invSum(b.out) >= DRILL_BUF;
    const run = !!best && !full;
    const pw = b.pw ?? 0;
    if ((b.act ?? 0) !== (run ? 1 : 0)) { b.act = run ? 1 : 0; sim.touch(b); }
    if (run && pw > 0.01) {
        const od = owner ? sim.derivedOf(owner) : null;
        const rate = (tiles / 4) * pw * (1 + (od?.mods.drillYield ?? 0) + (od?.mods.machineSpeed ?? 0));
        b.prog = (b.prog ?? 0) + dt * rate;
        if (b.prog >= DRILL_BASE) {
            b.prog -= DRILL_BASE;
            invPut(b.out, best!, 1);
            sim.s.prod ??= {};
            sim.s.prod[best!] = (sim.s.prod[best!] ?? 0) + 1;
            sim.touch(b);
        }
    }
    // hand out whatever it has to whatever is in front of it
    if (invSum(b.out) > 0) {
        for (const [tx, ty] of frontTiles(b)) {
            const t = entAt(sim, tx, ty);
            if (!t) continue;
            const item = (Object.keys(b.out) as ItemId[]).find((i) => invHas(b.out, i) > 0 && canAccept(t, i));
            if (item && insertOne(sim, t, item)) { invDrop(b.out, item, 1); sim.touch(b); break; }
        }
    }
}

function stepInserter (sim: Sim, b: BuildE, dt: number, owner?: PlayerS) {
    const [dx, dy] = DIRS[b.rot & 3];
    const back = entAt(sim, b.tx - dx, b.ty - dy), front = entAt(sim, b.tx + dx, b.ty + dy);
    const pw = b.pw ?? 0;
    const was = b.act ?? 0;
    // does it have anything to do? (it asks for power whenever it does, even before it has any)
    const pick = !b.hand && back && front ? listItems(back).find((i) => (!b.flt || b.flt === i) && canAccept(front, i)) : undefined;
    b.act = b.hand || pick ? 1 : 0;
    if (b.act !== was) sim.touch(b);
    if (!b.hand) {
        if (!pick || !back || pw <= 0.01) return;
        if (!takeOne(back, pick)) return;
        sim.touch(back);
        b.hand = pick; b.prog = 0;
        sim.touch(b);
        return;
    }
    if (pw <= 0.01) return;
    const od = owner ? sim.derivedOf(owner) : null;
    b.prog = Math.min(1, (b.prog ?? 0) + (dt / SWING) * pw * (1 + (od?.mods.machineSpeed ?? 0)));
    if (b.prog >= 1 && front && canAccept(front, b.hand) && insertOne(sim, front, b.hand)) {
        b.hand = undefined; b.prog = 0;
        sim.touch(b);
    }
}

function stepCoalGen (sim: Sim, b: BuildE, dt: number) {
    const was = b.act ?? 0;
    // it only burns while something on its grid is drawing power
    const net = powerGraph(sim).netOf.get(b.id);
    const wanted = !!net && net.use > 0;
    if ((b.fuel ?? 0) <= 0 && wanted) {
        b.fin ??= {};
        const item = bestFuel((i) => invHas(b.fin, i));
        if (item) { invDrop(b.fin, item, 1); b.fuel = fuelValue(item) * 1.4; sim.touch(b); }
    }
    if ((b.fuel ?? 0) > 0 && wanted) b.fuel = (b.fuel ?? 0) - dt;
    b.act = (b.fuel ?? 0) > 0 && wanted ? 1 : 0;
    if (b.act !== was) sim.touch(b);
}

function updatePower (sim: Sim, g: PowerGraph, dt: number) {
    const sun = sunlight(sim.s.clock, sim.s.nightLen);
    for (const net of g.nets) {
        const st = netStats(net, sim.s.time, sun);
        net.gen = st.gen; net.use = st.use; net.ratio = st.ratio;
        // spare power fills the batteries; a shortfall drains them (and the grid runs full while they last)
        const cells = net.members.filter((m) => m.kind === 'battery');
        if (cells.length) {
            const cap = BUILDINGS.battery.store!;
            if (st.gen > st.use) {
                let spare = (st.gen - st.use) * dt;
                for (const c of cells) {
                    const add = Math.min(spare, cap - (c.chg ?? 0));
                    if (add > 0) { c.chg = (c.chg ?? 0) + add; spare -= add; if (Math.round(c.chg / cap * 8) !== Math.round((c.chg - add) / cap * 8)) sim.touch(c); }
                }
            } else if (st.use > st.gen) {
                let need = (st.use - st.gen) * dt;
                for (const c of cells) {
                    const take = Math.min(need, c.chg ?? 0);
                    if (take > 0) { c.chg = (c.chg ?? 0) - take; need -= take; if (Math.round(c.chg / cap * 8) !== Math.round((c.chg + take) / cap * 8)) sim.touch(c); }
                }
                // what the batteries could not cover is what the machines go without
                net.ratio = Math.min(1, (st.gen + (st.use - st.gen) * (1 - need / Math.max(1e-9, (st.use - st.gen) * dt))) / st.use);
            }
        }
        for (const m of net.members) {
            if (!BUILDINGS[m.kind].use) continue;
            const r = Math.round(net.ratio * 20) / 20;
            if (m.pw !== r) { m.pw = r; sim.touch(m); }
        }
    }
    // consumers that aren't wired to anything
    for (const b of g.orphans) if ((b.pw ?? 0) !== 0) { b.pw = 0; sim.touch(b); }
}

// ── config command ─────────────────────────────────────────────────────────
export function cmdConfig (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'config' }>) {
    const b = sim.s.ents[c.id];
    if (!b || b.k !== 'bld' || !sim.inReach(p, b, sim.derivedOf(p).reach + 30)) return;
    const def = BUILDINGS[b.kind];
    if (c.rot !== undefined && Number.isInteger(c.rot) && def.dir) { b.rot = c.rot & 3; sim.touch(b); }
    if (c.flt !== undefined && (b.kind === 'inserter' || b.kind === 'sorter') && (c.flt === null || ITEMS[c.flt])) { b.flt = c.flt ?? undefined; sim.touch(b); }
    // a chute sells only what can be sold, and only the one item if it has a filter
    if (c.flt !== undefined && b.kind === 'chute' && (c.flt === null || chuteSells(c.flt))) { b.flt = c.flt ?? undefined; sim.touch(b); }
    // a chest's label: what it takes, and the icon it wears (anything already inside stays; the creature sorters move it)
    if ((c.fl !== undefined || c.ic !== undefined) && def.storage && !def.pets && !def.grave) {
        const fl = c.fl !== undefined ? cleanFilter(c.fl) : null;
        if (fl) b.fl = fl.length ? fl : undefined;
        if (c.ic === null || c.ic === '') b.ic = undefined; else if (c.ic !== undefined && validIcon(c.ic)) b.ic = c.ic;
        const at = sim.center(b);
        sim.fx('equip', at.x, at.y - 4, p.id);
        sim.touch(b);
    }
    if (c.sel !== undefined && def.proc === 'assembler' && (!c.sel || RECIPES[c.sel]?.station === 'assembler')) {
        b.sel = c.sel || undefined;
        // anything half-loaded goes back to the player
        for (const part of [b.inv, b.out]) for (const [item, n] of Object.entries(part ?? {}) as [ItemId, number][]) sim.give(p, item, n);
        b.inv = {}; b.out = {}; b.rcp = undefined; b.prog = 0; b.by = p.id;
        sim.touch(b);
    }
}
