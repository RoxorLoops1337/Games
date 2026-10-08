// Jobs, machines and workshops: at a furnace, sawmill, millstone or assembler the creature is the keeper (ingredients and fuel
// in from the chests beside it, output out, its skill speeds the machine up); at a workbench, anvil, kitchen, loom or alchemy
// table it works through an order (make 20 of this) from the chests and puts the result back.

import { TUNING } from '../config';
import { BUILDINGS } from '../data/buildings';
import { type Pet, type Post, type PostStatus, type WorkKind } from '../data/creatures';
import { FUEL, ITEMS, type ItemId } from '../data/items';
import { RECIPES, recipesFor } from '../data/recipes';
import { PAL } from '../palette';
import { craftTime, machineBoost, setStatus, standPoint, stationOk, walkTo } from './jobs-site';
import { invDrop, invHas, invPut, invSum } from './machines';
import { fetchAt, grantPetXp, haveAt, roomAt, STASH_RADIUS, stashAt, storesNear } from './petlib';
import * as quests from './quests';
import type { Sim } from './sim';
import type { BuildE, CritE, PlayerS } from './types';

// ── machines and workshops ──────────────────────────────────────────────────
const wkEvent = (sim: Sim, c: CritE, kind: WorkKind, at: { x: number; y: number }) => {
    c.st = 3; c.w = 0.9; c.wk = kind; c.tx = at.x; c.ty = at.y;
    sim.events.push({ e: 'work', id: c.id, kind, x: at.x, y: at.y - 4 });
};

export function stationStep (sim: Sim, c: CritE, owner: PlayerS, pet: Pet, post: Extract<Post, { k: 'stn' }>, dt: number) {
    const b = sim.s.ents[post.id];
    if (!b || b.k !== 'bld') return;
    const def = BUILDINGS[b.kind], skill = def.work;
    if (!skill || !stationOk(pet, b.kind)) return;
    const stand = standPoint(b);
    if (walkTo(sim, c, pet, stand.x, stand.y, dt, 7, 1.2)) { c.ac = 'walk'; return; }
    c.vx = 0; c.vy = 0;
    if (def.proc) keepMachine(sim, c, owner, pet, b, skill, dt);
    else workOrder(sim, c, owner, pet, b, skill, post, dt);
    if (c.ws === 'work') c.ac = def.proc ? 'keep' : 'make';
}

/** The keeper of a furnace, sawmill, millstone or assembler. */
function keepMachine (sim: Sim, c: CritE, owner: PlayerS, pet: Pet, b: BuildE, skill: WorkKind, dt: number) {
    c.js = (c.js ?? 0) - dt;
    if (c.js > 0) return;
    c.js = TUNING.serviceEvery;
    const def = BUILDINGS[b.kind];
    const at = sim.center(b);
    const R = STASH_RADIUS;
    const stores = storesNear(sim, at.x, at.y, R);     // (the chests beside it, found once for the whole round)
    b.inv ??= {}; b.out ??= {}; b.fin ??= {};
    let did = 0;
    // 1. empty the output tray into a chest
    let carried = 0;
    for (const [item, n] of Object.entries(b.out) as [ItemId, number][]) {
        if (carried >= 24) break;
        const put = stashAt(sim, at.x, at.y, R, item, Math.min(n, 24 - carried), { stores });
        if (put > 0) { invDrop(b.out, item, put); carried += put; }
    }
    did += carried;
    pet.pn = (pet.pn ?? 0) + carried;
    // 2. fuel: the cheapest thing that burns
    if (def.fuel && (b.fuel ?? 0) < 8 && invSum(b.fin) < 4) {
        const fuels = (Object.keys(FUEL) as ItemId[]).filter((i) => haveAt(sim, at.x, at.y, R, i, stores) > 0)
            .sort((a, d) => ((a === 'plank' ? 1e3 : 0) + ITEMS[a].sell) - ((d === 'plank' ? 1e3 : 0) + ITEMS[d].sell));
        if (fuels.length) { const got = fetchAt(sim, at.x, at.y, R, fuels[0], 6, stores); if (got) { invPut(b.fin, fuels[0], got); did += got; } }
    }
    // 3. ingredients: up to three batches of everything it can make, from what the chests hold
    const recipes = def.proc === 'assembler' ? (b.sel && RECIPES[b.sel] ? [RECIPES[b.sel]] : []) : recipesFor(def.proc!);
    for (const r of recipes) {
        if (!sim.hasUnlock(owner, r.req)) continue;
        const inp = Object.entries(r.in) as [ItemId, number][];
        const buffered = Math.min(...inp.map(([i, n]) => Math.floor(invHas(b.inv, i) / n)));
        const want = 3 - buffered;
        if (want <= 0) continue;
        const can = Math.min(want, ...inp.map(([i, n]) => Math.floor(haveAt(sim, at.x, at.y, R, i, stores) / n)));
        if (can <= 0) continue;
        for (const [i, n] of inp) { const got = fetchAt(sim, at.x, at.y, R, i, can * n, stores); if (got) { invPut(b.inv, i, got); did += got; } }
    }
    // 4. its skill speeds the machine up
    b.boost = sim.s.time + TUNING.serviceEvery * 2.5;
    b.bs = machineBoost(pet, skill, sim.derivedOf(owner).mods.work ?? 0);
    if (did > 0) b.by = owner.id;
    sim.touch(b);
    // 5. how is it going?
    let st: PostStatus = 'work';
    if (def.proc === 'assembler' && !b.sel) st = 'norecipe';
    else if (def.fuel && (b.fuel ?? 0) <= 0 && invSum(b.fin) === 0) st = 'nofuel';
    else if (def.use && b.act && (b.pw ?? 0) <= 0.01) st = 'nopower';
    else if (invSum(b.out) >= 40 && roomAt(sim, at.x, at.y, R, undefined, undefined, stores) <= 0) st = 'nostore';
    else if (!b.rcp && invSum(b.inv) === 0) st = 'noinput';
    setStatus(sim, c, owner, pet, st);
    if (did > 0 || st === 'work') {
        wkEvent(sim, c, skill, at);
        grantPetXp(sim, owner, pet, 0.5, c, true);
        if (did > 0) { quests.count(owner, 'petwork'); quests.count(owner, `petwork:${skill}`); }
    }
}

/** A workshop worker: one go at the ordered recipe after another. */
function workOrder (sim: Sim, c: CritE, owner: PlayerS, pet: Pet, b: BuildE, skill: WorkKind, post: Extract<Post, { k: 'stn' }>, dt: number) {
    const def = BUILDINGS[b.kind];
    const ord = post.ord;
    if (!ord) { setStatus(sim, c, owner, pet, pet.ps === 'done' ? 'done' : 'noorder'); c.jp = 0; return; }
    const r = RECIPES[ord.r];
    if (!r || r.station !== def.station || !sim.hasUnlock(owner, r.req) || r.in.coin !== undefined) {
        post.ord = undefined; c.jp = 0;
        setStatus(sim, c, owner, pet, 'noorder');
        return;
    }
    const at = sim.center(b), R = STASH_RADIUS;
    const need = Object.entries(r.in) as [ItemId, number][];
    c.js = (c.js ?? 0) - dt;
    // the ingredients and the room for the result are checked a couple of times a second, not every tick
    if (c.js <= 0) {
        c.js = 0.5;
        const stores = storesNear(sim, at.x, at.y, R);
        const have = need.every(([i, n]) => haveAt(sim, at.x, at.y, R, i, stores) >= n);
        const room = roomAt(sim, at.x, at.y, R, undefined, r.out, stores) >= r.n;
        c.rb = have ? (room ? 1 : 2) : 0;                        // (0 short of supplies, 1 ready, 2 nowhere to put it)
    }
    if (c.rb !== 1) { setStatus(sim, c, owner, pet, c.rb === 2 ? 'nostore' : 'noinput'); return; }
    setStatus(sim, c, owner, pet, 'work');
    const before = c.jp ?? 0;
    c.jp = before + dt;
    if (Math.floor(before / 1.1) !== Math.floor(c.jp / 1.1)) wkEvent(sim, c, skill, at);
    const d = sim.derivedOf(owner);
    if (c.jp < craftTime(r, pet, skill, d.mods.work ?? 0)) return;
    // done: take the ingredients (a lucky craft keeps them) and put the result in a chest
    c.jp = 0; c.rb = 0; c.js = 0;
    const stores = storesNear(sim, at.x, at.y, R);
    if (!(d.mods.craftSave && sim.rng.chance(d.mods.craftSave))) for (const [i, n] of need) fetchAt(sim, at.x, at.y, R, i, n, stores);
    stashAt(sim, at.x, at.y, R, r.out, r.n, { spill: true, stores });
    ord.n -= 1;
    pet.pn = (pet.pn ?? 0) + r.n;
    owner.stats.crafted++;
    quests.count(owner, `craft:${r.out}`, r.n);
    quests.count(owner, 'petwork');
    quests.count(owner, `petwork:${skill}`);
    grantPetXp(sim, owner, pet, 2 + r.xp * 0.2, c, true);
    sim.fx('craft', at.x, at.y - 6);
    sim.float(at.x, at.y - 18, `+${r.n} ${ITEMS[r.out].name}`, PAL.cream, owner.id, `order-${b.id}`);
    if (ord.n <= 0) {
        post.ord = undefined;
        setStatus(sim, c, owner, pet, 'done');
        if (owner.online) sim.toast(owner.id, `${pet.name} finished the order: ${ITEMS[r.out].name}`, `i_${r.out}`, PAL.lime);
    }
}
