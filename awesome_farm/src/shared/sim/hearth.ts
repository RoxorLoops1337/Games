// The evening hearth. In the last minute of the day (the dusk countdown) farmers who gather at a fire earn Hearthside, a buff
// for the whole night: faster hearts and energy and +15% XP (the buff `hearth`, data/stats.ts).
//
// The rule: a farmer who is up (not down, not on an expedition) and within three tiles of a campfire (or a table, a lantern, a
// lamp post: data/hearth.ts) sits at it. Two heads at one fire are a circle: a friend, or your own companion creature standing
// near you, so a farmer on their own with a pet gets it too. While there is a circle the fire fills (`hg`, 0..1, shown by the
// client as a ring over the fire) in `TUNING.hearthFill` seconds, and drains at half speed when they part. When it is full the fire
// is kindled and everyone sitting there is given the buff at once: a farmer who walks off a moment later keeps it, a third
// friend who sits down by the kindled fire is given it too. At the moment night falls a circle that is sitting there kindles on
// the spot, so arriving in the last seconds is not too late. The buff ends at dawn.
//
// Runtime state is only the accumulator below; the fire's own `hg` and the buff's timer are in the save like everything else.

import { TUNING } from '../config';
import { spOf } from '../data/creatures';
import { circleNames, HEARTH_SPOTS } from '../data/hearth';
import { BODY_Y, distToBuilding } from '../geom';
import { PAL } from '../palette';
import * as quests from './quests';
import { findPet } from './petlib';
import type { Sim } from './sim';
import type { BuildE, CritE, PlayerS } from './types';

const BUFF = 'hearth' as const;
/** The fires are looked at this often (s). */
const STEP = 0.25;

export const hasHearth = (p: PlayerS) => p.buffs.some((b) => b.id === BUFF);

/** Is the last minute of the day running? */
function duskOn (sim: Sim) {
    const s = sim.s, left = TUNING.dayLength - s.clock;
    return !s.night && left > 0 && left <= TUNING.duskWarn[0];
}

/** Everything people can gather round. */
const spots = (sim: Sim): BuildE[] => (Object.keys(HEARTH_SPOTS) as (keyof typeof HEARTH_SPOTS)[]).flatMap((k) => sim.buildings(k));

interface Circle { farmers: PlayerS[]; pets: CritE[] }

/** Who sits at this fire: the farmers within reach and the companions of those farmers that stand near it. */
function circleAt (b: BuildE, up: PlayerS[], companions: () => Map<string, CritE>): Circle {
    const farmers = up.filter((q) => distToBuilding(q.x, q.y - BODY_Y, b) <= TUNING.hearthRadius);
    if (!farmers.length) return { farmers, pets: [] };
    const mine = companions();
    const pets = farmers.map((q) => mine.get(q.id)).filter((c): c is CritE => !!c && distToBuilding(c.x, c.y - BODY_Y, b) <= TUNING.hearthPetReach);
    return { farmers, pets };
}
/** Heads at the fire: a circle needs two. */
const heads = (c: Circle) => c.farmers.length + c.pets.length;

/** Everyone who may sit down: up on their feet and not on an expedition. */
const sitters = (sim: Sim) => sim.online.filter((q) => q.downed <= 0 && !q.rift);

/** Each farmer's companion creature in the world, found once per look (scanning every entity is the dear part). */
function companionsOf (sim: Sim) {
    let map: Map<string, CritE> | null = null;
    return () => {
        if (!map) {
            map = new Map();
            for (const e of sim.ents('crit')) if (e.mode === 1 && e.owner) map.set(e.owner, e);
        }
        return map;
    };
}

/** Seconds of the buff when it is given now: what is left of the day, then the whole night. */
const untilDawn = (sim: Sim) => Math.max(0, TUNING.dayLength - sim.s.clock) + sim.s.nightLen;

const petName = (sim: Sim, c: CritE) => {
    const owner = c.owner ? sim.s.players[c.owner] : undefined;
    return (owner && c.pid ? findPet(owner, c.pid)?.name : undefined) ?? spOf(c.sp)?.name ?? 'Companion';
};
const namesOf = (sim: Sim, c: Circle) => [...c.farmers.map((q) => q.name), ...c.pets.map((e) => petName(sim, e))];

/** Set the fire's fill; the world is told only when the tenths change (a few updates while it fills, not one every look). */
function setFill (sim: Sim, b: BuildE, v: number) {
    const before = b.hg ?? 0;
    if (v <= 0.0001) { if (b.hg !== undefined) { delete b.hg; sim.touch(b); } return; }
    b.hg = Math.min(1, v);
    if (Math.floor(b.hg * 10) !== Math.floor(before * 10) || (b.hg >= 1 && before < 1)) sim.touch(b);
}

/** Give one farmer Hearthside (until dawn) with the banner that names the circle. */
function award (sim: Sim, q: PlayerS, names: string[]) {
    q.buffs = q.buffs.filter((b) => b.id !== BUFF);
    q.buffs.push({ id: BUFF, t: untilDawn(sim) });
    sim.fx('hearth', q.x, q.y - 10, q.id);
    sim.banner(`Hearthside: ${circleNames(names)}`, 'Hearts and energy mend faster, +15% XP until dawn', PAL.pumpkin, q.id);
    quests.count(q, 'hearth');
}

/** The fire catches: a burst at the fire, one on everyone sitting there, a happy hop for the creatures, and the buff. */
function kindle (sim: Sim, b: BuildE, c: Circle) {
    setFill(sim, b, 1);
    const at = sim.center(b);
    sim.fx('hearth', at.x, at.y - 4, undefined, 0.8);
    const names = namesOf(sim, c);
    for (const q of c.farmers) award(sim, q, names);
    for (const e of c.pets) sim.events.push({ e: 'hop', id: e.id, x: e.x, y: e.y });
}

/** A kindled fire: whoever sits down by it from now on is given the buff too (once). */
function welcome (sim: Sim, c: Circle) {
    const late = c.farmers.filter((q) => !hasHearth(q));
    if (!late.length) return;
    const names = namesOf(sim, c);
    for (const q of late) award(sim, q, names);
}

/** Called every step: during the dusk countdown, watch the fires. */
export function update (sim: Sim, dt: number) {
    sim.hearthT += dt;
    if (sim.hearthT < STEP) return;
    const dtl = sim.hearthT;
    sim.hearthT = 0;
    if (!duskOn(sim)) return;
    const up = sitters(sim);
    const fires = spots(sim);
    if (!fires.length) return;
    const companions = companionsOf(sim);
    for (const b of fires) {
        const c = circleAt(b, up, companions);
        const fill = b.hg ?? 0;
        if (fill >= 1) { if (c.farmers.length) welcome(sim, c); continue; }
        if (heads(c) >= 2) {
            setFill(sim, b, fill + dtl / TUNING.hearthFill);
            if ((b.hg ?? 0) >= 1) kindle(sim, b, c);
        } else if (fill > 0) setFill(sim, b, fill - (dtl / TUNING.hearthFill) * 0.5);
    }
}

/** Night falls: a circle that is sitting at a fire right now kindles it (so the last seconds count), then every fire is spent. */
export function onNight (sim: Sim) {
    const fires = spots(sim);
    if (fires.length) {
        const up = sitters(sim), companions = companionsOf(sim);
        for (const b of fires) {
            const c = circleAt(b, up, companions);
            if ((b.hg ?? 0) >= 1) welcome(sim, c);
            else if (heads(c) >= 2) kindle(sim, b, c);
        }
    }
    for (const b of fires) if (b.hg !== undefined) { delete b.hg; sim.touch(b); }
}

/** Dawn: Hearthside ends, for everybody (also for the farmers who are away). */
export function onDawn (sim: Sim) {
    for (const q of Object.values(sim.s.players)) if (hasHearth(q)) q.buffs = q.buffs.filter((b) => b.id !== BUFF);
}

/** A world has just been loaded (or a farmer has come back): a fill that belongs to no dusk is cleared, and a buff that has outlived its night with it. */
export function tidy (sim: Sim) {
    if (!duskOn(sim)) for (const b of spots(sim)) if (b.hg !== undefined) delete b.hg;
    if (!sim.s.night && !duskOn(sim)) for (const q of Object.values(sim.s.players)) if (hasHearth(q)) q.buffs = q.buffs.filter((b) => b.id !== BUFF);
}

/** The heart that Hearthside mends every `hearthHealEvery` seconds, wherever the farmer stands (called while hearts are missing). */
export function regen (sim: Sim, p: PlayerS, dt: number) {
    if (!hasHearth(p)) { delete sim.hearthHeal[p.id]; return; }
    const t = (sim.hearthHeal[p.id] ?? 0) + dt;
    if (t >= TUNING.hearthHealEvery) { sim.hearthHeal[p.id] = 0; sim.heal(p); } else sim.hearthHeal[p.id] = t;
}
