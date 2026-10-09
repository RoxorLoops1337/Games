// The clock: the day, the dusk warnings, nightfall with its spawns and events, and the dawn that ends it all.
// These are the Sim's own steps, moved out for room; they take the sim and reach its runtime fields directly.

import { TUNING } from '../config';
import { isBoss, nightCount } from '../data/mobs';
import { PAL } from '../palette';
import { seasonDay, seasonDef, seasonOf, SEASONS, yearOf } from '../season';
import { nightEvent, NIGHT_EVENTS, type NightEvent } from '../weather';
import * as chronicle from './chronicle';
import * as dread from './dread';
import * as fortune from './fortune';
import * as gather from './gather';
import * as hearth from './hearth';
import * as mail from './mail';
import * as mines from './mines';
import * as mobs from './mobs';
import { tellLessons } from './petlib';
import * as quests from './quests';
import * as scholar from './scholar';
import * as shop from './shop';
import type { Sim } from './sim';
import { derived } from './stats';
import * as wish from './wish';

/** A new day: the trader restocks, and so on. */
function morning (sim: Sim) {
    shop.refresh(sim);
    fortune.dawn(sim);
    mail.postcards(sim);
}

export function updateClock (sim: Sim, dt: number) {
    const s = sim.s;
    const shorten = Math.max(0, ...sim.online.map((p) => sim.derivedOf(p).nightShorten));
    if (!s.night) s.nightLen = TUNING.nightLength * (1 - shorten) * seasonDef(s.day).night;
    s.clock += dt;
    if (!s.night) {
        const left = TUNING.dayLength - s.clock;
        if (left <= TUNING.duskWarn[0] && sim.duskWarned < 1) { sim.duskWarned = 1; warnDusk(sim, false); }
        if (left <= TUNING.duskWarn[1] && sim.duskWarned < 2) { sim.duskWarned = 2; warnDusk(sim, true); }
    }
    if (!s.night && s.clock >= TUNING.dayLength) startNight(sim);
    if (s.night) {
        const nt = s.clock - TUNING.dayLength;
        while (sim.nightSpawns.length && sim.nightSpawns[0].at <= nt) {
            const sp = sim.nightSpawns.shift()!;
            sim.spawnMob(sp.kind, sp.near, sp.plot);
        }
    }
    if (s.clock >= TUNING.dayLength + s.nightLen) dawn(sim);
    // a haunted plot keeps one slime around even by day
    sim.hauntT -= dt;
    if (sim.hauntT <= 0) {
        sim.hauntT = 20;
        const haunted = sim.world.ownedPlots().filter((p) => p.mod === 'haunted');
        const about = sim.ents('mob').length;
        if (haunted.length && !s.night && about < haunted.length && sim.online.length) sim.spawnMob('slime', undefined, sim.rng.pick(haunted).i);
    }
}

/** The first morning of a season: a banner for everyone, and a year counter at the turn of winter. */
export function seasonBegins (sim: Sim) {
    const sd = SEASONS[seasonOf(sim.s.day)];
    const first = sim.s.day === 1;
    if (!first) { chronicle.note(sim, `season:${sim.s.day}`, `${sd.name} has come to the farm.`, 'k_sprout'); wish.begin(sim); }
    for (const p of sim.online) {
        sim.banner(first ? sd.name : `${sd.name} has come`, `${sd.blurb}${seasonOf(sim.s.day) === 'spring' && !first ? `  (Year ${yearOf(sim.s.day)})` : ''}`, sd.color, p.id);
        sim.fx('dawn', p.x, p.y - 12, p.id);
    }
}

export function startNight (sim: Sim) {
    const s = sim.s;
    s.night = true;
    const n = s.day;
    sim.nightEv = nightEvent(s.seed, n);
    const spawns: typeof sim.nightSpawns = [];
    for (const p of sim.online) {
        const count = Math.min(14, Math.round(nightCount(mobs.groupLevel(sim, p)) * (sim.nightEv === 'bloodmoon' ? 1.8 : 1)));
        for (let i = 0; i < count; i++) spawns.push({ near: p.id, at: 0 });
        sim.fx('dusk', p.x, p.y - 12, p.id);
    }
    for (const h of sim.world.ownedPlots().filter((p) => p.mod === 'haunted')) {
        spawns.push({ kind: 'slime', plot: h.i, at: 0 }, { kind: 'slime', plot: h.i, at: 0 });
    }
    for (const sp of spawns) sp.at = 2 + sim.rng.next() * TUNING.nightSpawnWindow;
    sim.nightSpawns = spawns.sort((a, b) => a.at - b.at);
    if (sim.nightEv) {
        const info = NIGHT_EVENTS[sim.nightEv];
        sim.banner(info.name, info.sub, sim.nightEv === 'bloodmoon' ? PAL.berry : sim.nightEv === 'meteors' ? PAL.gold : PAL.blossom);
        startEvent(sim, sim.nightEv);
    } else sim.banner(`Night ${n}`, 'Monsters wander the farm — stay near a campfire', PAL.plum);
    hearth.onNight(sim);                          // (a circle sitting at a fire as night falls kindles it)
}

export function startEvent (sim: Sim, ev: Exclude<NightEvent, null>) {
    if (ev === 'fairies') {
        for (const p of sim.online) {
            p.hearts = Math.max(p.hearts, derived(p).maxHearts);
            p.energy = derived(p).maxEnergy;
            p.buffs = p.buffs.filter((b) => b.id !== 'lucky');
            p.buffs.push({ id: 'lucky', t: 160 });
            sim.fx('heal', p.x, p.y - 10, p.id);
        }
    } else if (ev === 'meteors') {
        const plots = sim.world.ownedPlots();
        for (let i = 0; i < 4 + Math.min(4, plots.length); i++) {
            const plot = sim.rng.pick(plots);
            const spot = sim.world.randomFreeTile(plot, sim.rng, undefined, 1);
            if (spot) gather.addNode(sim, i % 3 === 0 ? 'crystal' : i % 3 === 1 ? 'gold' : 'iron', spot.tx, spot.ty, plot);
        }
    }
}

/** The sun is going down: tell everyone, with a sound, so nobody is caught far from a fire. */
function warnDusk (sim: Sim, alarm: boolean) {
    for (const p of sim.online) {
        if (alarm) {
            sim.banner('Night is almost here!', `Monsters come out in ${TUNING.duskWarn[1]} seconds`, PAL.berry, p.id);
            sim.fx('waveStart', p.x, p.y - 12, p.id);
        } else {
            sim.banner('The sun is sinking', `Night falls in ${TUNING.duskWarn[0]} seconds. Head for a campfire: gather round it for Hearthside.`, PAL.pumpkin, p.id);
            sim.toast(p.id, `Night falls in ${TUNING.duskWarn[0]} seconds`, 'k_moon', PAL.pumpkin);
            sim.fx('dusk', p.x, p.y - 12, p.id);
        }
    }
}

export function dawn (sim: Sim) {
    const s = sim.s;
    sim.duskWarned = 0;
    s.clock -= TUNING.dayLength + s.nightLen;
    s.night = false;
    s.day++;
    sim.nightSpawns = [];
    if (seasonDay(s.day) === 1) seasonBegins(sim);
    if (sim.nightEv === 'bloodmoon') {
        for (const p of sim.online) {
            if (p.downed > 0) continue;
            const reward = Math.min(500, 20 + 10 * s.day);
            sim.give(p, 'coin', reward);
            sim.toast(p.id, `The Blood Moon is over: +${reward} coins`, 'k_coin', PAL.gold);
        }
    }
    chronicle.morning(sim, sim.nightEv);
    sim.nightEv = null;
    hearth.onDawn(sim);                           // (Hearthside ends)
    mines.onDawn(sim);                            // (half-dug rock is whole again)
    for (const e of sim.ents('mob')) if (!isBoss(e.kind) && !e.guard && e.rift === undefined) sim.killMob(e);
    for (const e of sim.ents('proj')) sim.remove(e.id);
    for (const p of sim.online) {
        quests.count(p, 'night');
        sim.fx('dawn', p.x, p.y - 12, p.id);
        const max = sim.derivedOf(p).maxHearts;
        if (p.downed <= 0 && p.hearts < max) p.hearts = Math.min(max, p.hearts + 1);
    }
    morning(sim);
    scholar.onDawn(sim);
    for (const p of sim.online) tellLessons(sim, p, false);
    dread.ensure(sim);
    sim.banner(`Day ${s.day}`, `You made it through the night. +1 heart`, PAL.gold);
}
