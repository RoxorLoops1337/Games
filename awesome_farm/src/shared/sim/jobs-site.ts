// Jobs, the ground everything stands on: what a creature may do, the Site (where it works and where the goods go), the status
// line that tells the owner when something is wrong, and walking. jobs-carry, jobs-field, jobs-sort and jobs-station build on
// this; jobs.ts (posts and commands) ties them together and re-exports areaOk, craftTime, isWorkplace, machineBoost and stationOk
// for the rest of the game (everything else here is imported from this file directly).

import { PLOT, TILE } from '../config';
import { BUILDINGS, ORDER_STATIONS, SEED_IDS } from '../data/buildings';
import { AREA_JOBS, FIELD_TASKS, petSpeedMul, spOf, STATUS_INFO, workCycle, type Pet, type PostStatus, type WorkKind } from '../data/creatures';
import type { ItemId, Res } from '../data/items';
import type { Recipe } from '../data/recipes';
import { dist, distToRect } from '../geom';
import { PAL } from '../palette';
import { fetchAt, haveAt, move, roomAt, STASH_RADIUS, stashAt, storesNear } from './petlib';
import type { Sim } from './sim';
import { countOf, takeItem } from './stats';
import type { BuildE, CritE, PlayerS, Plot } from './types';

// ── what a creature may do ──────────────────────────────────────────────────
const FIELD_RADIUS = 9 * TILE;

/** A companion can take any field job its species has an aptitude for. */
export const taskOk = (pet: Pet, kind: WorkKind) => FIELD_TASKS.includes(kind) && (spOf(pet.sp).work[kind] ?? 0) >= 1;
/** Can this creature hold this job on an island? */
export const areaOk = (pet: Pet, kind: WorkKind) => AREA_JOBS.includes(kind) && (spOf(pet.sp).work[kind] ?? 0) >= 1;
/** Can this creature run this building (a machine or a workshop)? */
export const stationOk = (pet: Pet, kind: BuildE['kind']) => { const w = BUILDINGS[kind]?.work; return !!w && (spOf(pet.sp).work[w] ?? 0) >= 1; };
/** Can a creature work at this building at all? */
export const isWorkplace = (kind: BuildE['kind']) => { const d = BUILDINGS[kind]; return !!d?.work && (!!d.proc || ORDER_STATIONS.includes(d.station!)); };

export const nodeGroups = (task: WorkKind) => (task === 'gather' ? ['wood', 'plant'] : ['stone', 'ore', 'earth', 'gem']);

/** Seconds a workshop takes for one go at a recipe (a better worker is quicker). */
export function craftTime (r: Recipe, pet: Pet, skill: WorkKind, ownerWork = 0) {
    const speed = 26 / workCycle(pet, skill, ownerWork);       // 1 for a beginner, more for a good one
    return (3 + r.xp * 0.5) / Math.max(0.2, speed);
}
/** How much faster a keeper makes a machine run (0.25 = a quarter faster). */
export function machineBoost (pet: Pet, skill: WorkKind, ownerWork = 0) {
    return Math.min(1.5, 0.4 * (26 / workCycle(pet, skill, ownerWork)));
}

// ── sites: where a creature works, and where the goods go ───────────────────
export interface Site {
    owner: PlayerS;
    /** A post (an island) rather than a companion beside you. */
    post: boolean;
    /** How far a thing is from the working area: 0 inside it. */
    d (x: number, y: number): number;
    /** Things up to this far are worth walking to / are still worth finishing. */
    pick: number;
    valid: number;
    /** Is there somewhere to put what it gets? */
    room (): boolean;
    put (item: Res, n: number, x: number, y: number): void;
    seed (): ItemId | undefined;
    takeSeed (item: ItemId): boolean;
    xp (n: number): void;
    /** An island: the chests the worker carries to and from (a companion has none: it puts things in your pockets). */
    stores?: () => BuildE[];
}

/** A companion: the land round its owner; everything goes into the owner's pockets. */
export function ownerSite (sim: Sim, owner: PlayerS): Site {
    return {
        owner, post: false, pick: FIELD_RADIUS, valid: FIELD_RADIUS * 1.4,
        d: (x, y) => dist(x, y, owner.x, owner.y),
        room: () => true,
        put: (item, n, x, y) => { sim.give(owner, item, n, x, y); },
        seed: () => SEED_IDS.find((s) => countOf(owner, s) > 0),
        takeSeed: (s) => takeItem(owner, s, 1),
        xp: (n) => sim.gainXp(owner, n),
    };
}

export const plotCentre = (sim: Sim, plot: Plot) => { const o = sim.world.plotOrigin(plot); return { x: (o.tx + PLOT / 2) * TILE, y: (o.ty + PLOT / 2) * TILE }; };

/** A post on an island: the whole plot, with the chests on it (or just beside it) as the larder and the store. */
export function plotSite (sim: Sim, owner: PlayerS, plot: Plot): Site {
    const o = sim.world.plotOrigin(plot);
    const x0 = o.tx * TILE, y0 = o.ty * TILE, x1 = (o.tx + PLOT) * TILE, y1 = (o.ty + PLOT) * TILE;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let near: BuildE[] | null = null;                 // (the chests, looked up the first time this site needs them: a site lives one step)
    const stores = () => (near ??= storesNear(sim, cx, cy, STASH_RADIUS));
    return {
        owner, post: true, pick: 0, valid: TILE / 2,
        d: (x, y) => distToRect(x, y, x0, y0, x1 - x0, y1 - y0),
        room: () => roomAt(sim, cx, cy, STASH_RADIUS, undefined, undefined, stores()) > 0,
        put: (item, n, x, y) => {
            if (item === 'coin') { sim.give(owner, 'coin', n, x, y); return; }
            stashAt(sim, cx, cy, STASH_RADIUS, item, n, { spill: true, stores: stores() });
        },
        seed: () => SEED_IDS.find((s) => haveAt(sim, cx, cy, STASH_RADIUS, s, stores()) > 0),
        takeSeed: (s) => fetchAt(sim, cx, cy, STASH_RADIUS, s, 1, stores()) > 0,
        xp: () => { /* an island hand earns its keeper nothing: it is the creature that learns */ },
        stores,
    };
}

// ── status, and telling the owner when something is wrong ───────────────────
const ACT_OF: Partial<Record<PostStatus, string>> = { idle: 'idle', tidy: 'idle', done: 'idle', noorder: 'idle', nostore: 'stuck', noinput: 'stuck', nofuel: 'stuck', nopower: 'stuck', norecipe: 'stuck' };

export function setStatus (sim: Sim, c: CritE, owner: PlayerS, pet: Pet, st: PostStatus) {
    const act = ACT_OF[st];
    if (act) c.ac = act;
    if (c.ws !== st) { c.ws = st; sim.touch(c); }
    if (pet.ps === st) return;
    pet.ps = st;
    const info = STATUS_INFO[st];
    if (info.bad && owner.online) {
        const key = `${owner.id}:${pet.id}`;
        if (sim.s.time - (sim.jobT[key] ?? -999) > 90) {
            sim.jobT[key] = sim.s.time;
            sim.toast(owner.id, `${pet.name}: ${info.text.toLowerCase()}. ${info.hint}`, 'k_paw', PAL.pumpkin);
        }
    }
}

/**
 * Walk towards a point at the creature's pace. Returns true while it is still on its way.
 * Boxed in by a fence or a tree: after a moment it simply scampers over.
 */
export function walkTo (sim: Sim, c: CritE, pet: Pet, x: number, y: number, dt: number, reach: number, pace = 2.1): boolean {
    const d = dist(c.x, c.y, x, y);
    if (d <= reach) return false;
    const speed = (62 + 8) * petSpeedMul(pet) * pace;
    const s = Math.min(speed, d * 8);
    const bx = c.x, by = c.y;
    c.vx = ((x - c.x) / d) * s; c.vy = ((y - c.y) / d) * s;
    move(sim, c, dt, spOf(c.sp).flies);
    c.jq = dist(bx, by, c.x, c.y) < s * dt * 0.3 ? (c.jq ?? 0) + dt : 0;
    if ((c.jq ?? 0) > 1.5) { c.x = x + ((c.x - x) / Math.max(1, d)) * 14; c.y = y + ((c.y - y) / Math.max(1, d)) * 14; c.jq = 0; }
    sim.touch(c);
    return true;
}

/** Just south of a building: where its keeper stands. */
export const standPoint = (b: BuildE) => { const [w, h] = BUILDINGS[b.kind].size; return { x: (b.tx + w / 2) * TILE, y: (b.ty + h) * TILE + 5 }; };
