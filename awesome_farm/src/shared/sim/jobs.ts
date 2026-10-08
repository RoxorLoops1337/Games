// Jobs: what creatures do for you.
//
// FIELD WORK is one piece of logic with two kinds of site. A *companion* works the land around you and the goods go
// straight into your pockets. A *post* is a standing job on one island: the creature tends everything there on its own
// (you can be asleep, or on another island) and carries what it gets to a chest on that island.
//
// A creature can also be posted at a MACHINE or WORKSHOP. At a furnace, sawmill, millstone or assembler it is the keeper:
// it brings ingredients and fuel from the chests next to it, empties the output into them, and its skill speeds the
// machine up. At a workbench, anvil, kitchen, loom or alchemy table it works through an order you give it (make 20 of
// this), taking the ingredients from the chests and putting the result back.
//
// A post is just data on the creature (`pet.post`); the visible animal is a worker `crit` that creatures.ts keeps in step.

import { TILE, TUNING } from '../config';
import { BUILDINGS, ORDER_STATIONS } from '../data/buildings';
import { WORK_INFO, spOf, type Pet, type Post } from '../data/creatures';
import { ITEMS } from '../data/items';
import { RECIPES } from '../data/recipes';
import { dist } from '../geom';
import { PAL } from '../palette';
import { dropLoad } from './jobs-carry';
import { fieldStep } from './jobs-field';
import { areaOk, isWorkplace, plotCentre, plotSite, standPoint, stationOk } from './jobs-site';
import { sortStep } from './jobs-sort';
import { stationStep } from './jobs-station';
import { isWorking, move, petsOf, workSlots } from './petlib';
import * as quests from './quests';
import type { Sim } from './sim';
import type { Cmd, CritE, Ent, PlayerS, Plot } from './types';

// The pieces live in jobs-site (what a creature may do, the Site, status, walking), jobs-carry (loads and errands), jobs-field
// (the land work), jobs-sort (chests) and jobs-station (machines and workshops); the rest of the game imports these through here.
export { areaOk, craftTime, isWorkplace, machineBoost, stationOk } from './jobs-site';
export { sortPlan } from './jobs-sort';

// ── posts: finding where the creature lives, and keeping it there ───────────
/**
 * Where a posted creature lives. Returns null (and frees the creature, telling its owner) when the post is gone.
 * An island post stands on the nearest free tile to the island's middle: that search (a spiral of tile tests) is made once a second
 * per creature, not every step (Sim.postSpots), so a thing built on the spot moves the creature within the second.
 */
export function postAnchor (sim: Sim, owner: PlayerS, pet: Pet): { x: number; y: number } | null {
    const post = pet.post;
    if (!post) return null;
    if (post.k === 'plot') {
        const plot = sim.s.plots[post.plot];
        if (plot?.owned) {
            const key = `${owner.id}:${pet.id}`;
            const kept = sim.postSpots.get(key);
            if (kept && kept.post === post && sim.s.time - kept.at < 1) return kept.spot;
            const c = plotCentre(sim, plot);
            const spot = sim.nearestFree(Math.floor(c.x / TILE), Math.floor(c.y / TILE));
            const at = spot ? { x: (spot.tx + 0.5) * TILE, y: (spot.ty + 1) * TILE - 3 } : c;
            sim.postSpots.set(key, { at: sim.s.time, post, spot: at });
            return at;
        }
    } else {
        const b = sim.s.ents[post.id];
        if (b && b.k === 'bld' && isWorkplace(b.kind)) return standPoint(b);
    }
    pet.post = undefined; pet.ps = undefined;
    if (owner.online) sim.toast(owner.id, `${pet.name}'s workplace is gone: it is free again`, 'k_paw', PAL.pebble);
    return null;
}

/** A short line for the roster: what the creature is doing and where. */
export function postLabel (plots: readonly Plot[], ents: Readonly<Record<number, Ent>>, pet: Pet): string {
    const post = pet.post;
    if (!post) return '';
    if (post.k === 'plot') { const p = plots[post.plot]; return `${WORK_INFO[post.job].name}${p ? `, island ${p.gx + 1}·${p.gy + 1}` : ''}`; }
    const b = ents[post.id];
    return b && b.k === 'bld' ? BUILDINGS[b.kind].name : 'a workshop that is gone';
}

function wander (sim: Sim, c: CritE, dt: number) {
    c.hx ??= c.x; c.hy ??= c.y;
    c.t -= dt;
    if (c.st === 3) { c.vx *= 0.9; c.vy *= 0.9; }
    else if (c.t <= 0) {
        c.t = 1.4 + sim.rng.next() * 3;
        if (sim.rng.chance(0.6)) {
            const a = sim.rng.next() * Math.PI * 2, s = 10 + sim.rng.next() * 8;
            const tx = c.hx + Math.cos(a) * 22, ty = c.hy + Math.sin(a) * 14;
            const l = Math.max(1, dist(tx, ty, c.x, c.y));
            c.vx = ((tx - c.x) / l) * s; c.vy = ((ty - c.y) / l) * s;
        } else { c.vx = 0; c.vy = 0; }
    }
    move(sim, c, dt, spOf(c.sp).flies);
}

/** One tick of a posted creature. */
export function postStep (sim: Sim, c: CritE, owner: PlayerS, pet: Pet, dt: number) {
    const post = pet.post;
    if (!post) return;
    if (post.k === 'plot') areaStep(sim, c, owner, pet, post, dt);
    else stationStep(sim, c, owner, pet, post, dt);
    if (c.st === 3) { c.w = (c.w ?? 0) - dt; if (c.w! <= 0) c.st = 0; }
    sim.touch(c);
}

function areaStep (sim: Sim, c: CritE, owner: PlayerS, pet: Pet, post: Extract<Post, { k: 'plot' }>, dt: number) {
    const plot = sim.s.plots[post.plot];
    if (!plot || !areaOk(pet, post.job)) return;
    const busy = post.job === 'sort' ? sortStep(sim, c, plotSite(sim, owner, plot), pet, dt) : fieldStep(sim, c, plotSite(sim, owner, plot), pet, post.job, dt, TUNING.postSpeed);
    if (!busy) wander(sim, c, dt);
}

// ── commands ────────────────────────────────────────────────────────────────
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Put a creature on a post: `at` is `{ plot, job }` for an island, or `{ bld }` for a machine or workshop. */
export function cmdPost (sim: Sim, p: PlayerS, pet: Pet, c: Extract<Cmd, { t: 'pet' }>) {
    const at = c.at;
    if (!at || typeof at !== 'object') return;
    let post: Post;
    let where: { x: number; y: number };
    if (at.bld !== undefined) {
        if (!isInt(at.bld)) return;
        const b = sim.s.ents[at.bld];
        if (!b || b.k !== 'bld' || !isWorkplace(b.kind)) { sim.deny(p, 'A creature cannot work there'); return; }
        const def = BUILDINGS[b.kind];
        if (!stationOk(pet, b.kind)) { sim.deny(p, `${pet.name} cannot run a ${def.name}`); return; }
        const taken = Object.values(sim.s.players).some((q) => petsOf(q).some((x) => x !== pet && x.post?.k === 'stn' && x.post.id === b.id));
        if (taken) { sim.deny(p, `Someone is already working at the ${def.name}`); return; }
        post = { k: 'stn', id: b.id };
        if (pet.post?.k === 'stn' && pet.post.id === b.id && pet.post.ord) post.ord = pet.post.ord;
        where = sim.center(b);
    } else {
        if (!isInt(at.plot) || typeof at.job !== 'string') return;
        const plot = sim.s.plots[at.plot];
        if (!plot?.owned) { sim.deny(p, 'That island is not yours to work yet'); return; }
        if (!areaOk(pet, at.job)) { sim.deny(p, `${pet.name} is no good at that`); return; }
        post = { k: 'plot', plot: plot.i, job: at.job };
        where = plotCentre(sim, plot);
    }
    const working = petsOf(p).filter((x) => x.id !== pet.id && isWorking(x)).length;
    if (working >= workSlots(p)) { sim.deny(p, `You can only have ${workSlots(p)} creatures working`); return; }
    if (p.comp === pet.id) p.comp = undefined;
    pet.den = undefined; pet.task = undefined;
    pet.post = post; pet.ps = undefined;
    // a fresh start: the animal pops up at its new post (creatures.ts brings it back there)
    for (const e of sim.ents('crit')) if (e.owner === p.id && e.pid === pet.id) { dropLoad(sim, e); sim.remove(e.id); }
    quests.count(p, 'post');
    quests.count(p, post.k === 'plot' ? 'post:plot' : 'post:stn');
    sim.fx('post', where.x, where.y - 6, p.id);
    sim.float(where.x, where.y - 22, `${pet.name} at work`, PAL.lime, p.id);
}

/** Tell the creature at a workshop what to make, and how many: `rcp` and `n` (0 cancels). */
export function cmdOrder (sim: Sim, p: PlayerS, pet: Pet, c: Extract<Cmd, { t: 'pet' }>) {
    const post = pet.post;
    if (!post || post.k !== 'stn') { sim.deny(p, `${pet.name} has no workshop`); return; }
    const b = sim.s.ents[post.id];
    if (!b || b.k !== 'bld' || !ORDER_STATIONS.includes(BUILDINGS[b.kind].station!)) { sim.deny(p, 'That machine needs no orders: just keep it supplied'); return; }
    if (!isInt(c.n) || c.n < 0 || c.n > 99) return;
    const crit = sim.ents('crit').find((e) => e.owner === p.id && e.pid === pet.id);
    if (c.n === 0) { post.ord = undefined; if (crit) crit.jp = 0; return; }
    const r = typeof c.rcp === 'string' ? RECIPES[c.rcp] : undefined;
    if (!r || r.station !== BUILDINGS[b.kind].station) { sim.deny(p, `That is not made at a ${BUILDINGS[b.kind].name}`); return; }
    if (!sim.hasUnlock(p, r.req)) { sim.deny(p, 'Locked — learn it in the skill tree'); return; }
    if (r.in.coin !== undefined) { sim.deny(p, 'That costs coins: a creature cannot make it'); return; }
    post.ord = { r: r.id, n: c.n };
    pet.ps = undefined;
    if (crit) { crit.jp = 0; crit.js = 0; }
    sim.fx('equip', sim.center(b).x, sim.center(b).y - 6, p.id);
    sim.float(sim.center(b).x, sim.center(b).y - 22, `${c.n}× ${ITEMS[r.out].name}`, PAL.cream, p.id);
}

/** Free a creature from whatever it is doing at a post. */
export const clearPost = (pet: Pet) => { pet.post = undefined; pet.ps = undefined; };
