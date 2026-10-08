// The Dread Reaches: four 3×3 blocks of haunted bog out in the wilds. Each is land from the start and nobody's, stocked with rich ore and
// treasure, haunted by the undead (day and night, as many as there are farmers to haunt), and guarded at its heart by a warden: one of the
// altar bosses, stronger and hitting harder, who comes back a few days after he falls. Whoever brings a party into the middle and wins
// takes the spoils of a boss fight and more.

import { PLOT, TILE, TUNING } from '../config';
import { BOSSES, isBoss, MOBS, pickHaunt } from '../data/mobs';
import type { ItemId } from '../data/items';
import { PAL } from '../palette';
import * as gather from './gather';
import * as mobs from './mobs';
import type { Sim } from './sim';
import type { MobE, PlayerS, Plot } from './types';
import { DREAD_BOSS } from './worldgen';

interface Zone {
    q: number;
    core: Plot;
    plots: Plot[];
    /** Middle of the block, in pixels. */
    cx: number; cy: number;
    /** Its edges, in pixels. */
    x0: number; y0: number; x1: number; y1: number;
}

const cache = new WeakMap<Sim, Zone[]>();
const memory = new WeakMap<Sim, { at: Map<string, number>; empty: Map<number, number> }>();
const mem = (sim: Sim) => { let m = memory.get(sim); if (!m) { m = { at: new Map(), empty: new Map() }; memory.set(sim, m); } return m; };

/** The Dread blocks of this world (found once). */
export function zones (sim: Sim): Zone[] {
    let zs = cache.get(sim);
    if (zs) return zs;
    zs = [];
    for (let q = 0; q < 4; q++) {
        const plots = sim.s.plots.filter((p) => p.dread && p.zone === q);
        const core = plots.find((p) => p.dread === 2);
        if (!core || plots.length !== 9) continue;
        const o = sim.world.plotOrigin(core), c = sim.world.plotCenter(core);
        zs.push({ q, core, plots, cx: c.x, cy: c.y, x0: (o.tx - PLOT) * TILE, y0: (o.ty - PLOT) * TILE, x1: (o.tx + 2 * PLOT) * TILE, y1: (o.ty + 2 * PLOT) * TILE });
    }
    cache.set(sim, zs);
    return zs;
}

/** The block a point is in (or just outside: `margin` px), if any. */
export function zoneAt (sim: Sim, x: number, y: number, margin = 0): Zone | null {
    for (const z of zones(sim)) if (x >= z.x0 - margin && x < z.x1 + margin && y >= z.y0 - margin && y < z.y1 + margin) return z;
    return null;
}

export const wardenOf = (sim: Sim, z: Zone) => sim.ents('mob').find((e) => e.zone === z.q + 1 && isBoss(e.kind));

/** Every block gets its first stock of resources, its warden, and a new warden some days after the last one fell. Safe to call whenever. */
export function ensure (sim: Sim) {
    const d = (sim.s.dread ??= {});
    for (const z of zones(sim)) {
        let w = d[z.core.i];
        if (!w) w = d[z.core.i] = { boss: DREAD_BOSS[z.q] ?? 'stone' };
        if (!w.set) { stock(sim, z); w.set = 1; }
        if (!wardenOf(sim, z) && (w.down === undefined || sim.s.day - w.down >= TUNING.wardenRespawnDays)) { spawnWarden(sim, z, w.boss); delete w.down; }
    }
}

/** First stock: ore and plants everywhere, a chest in each outer plot, and a vault by the warden's feet. */
function stock (sim: Sim, z: Zone) {
    for (const plot of z.plots) {
        gather.populate(sim, plot, false, []);
        if (plot.dread === 1) {
            const spot = sim.world.randomFreeTile(plot, sim.rng, undefined, 2);
            if (spot) gather.addNode(sim, 'chest', spot.tx, spot.ty, plot);
        }
    }
    const o = sim.world.plotOrigin(z.core);
    const spot = sim.nearestFree(o.tx + PLOT / 2, o.ty + PLOT / 2 + 5);
    if (spot) gather.addNode(sim, 'vault', spot.tx, spot.ty, z.core);
}

function spawnWarden (sim: Sim, z: Zone, bossId: string) {
    const entry = BOSSES[bossId] ?? BOSSES.stone;
    const def = MOBS[entry.kind];
    const spot = sim.nearestFree(Math.floor(z.cx / TILE), Math.floor(z.cy / TILE) - 2);
    const x = spot ? (spot.tx + 0.5) * TILE : z.cx, y = spot ? (spot.ty + 1) * TILE - 3 : z.cy;
    const hp = Math.round(def.hp * TUNING.wardenHp);
    return sim.add<MobE>({
        k: 'mob', kind: entry.kind, x, y, hp, mhp: hp, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0, st: 0,
        ph: 0, pi: 0, pt: 2.2, hx: z.cx, hy: z.cy + 6, idle: 0, zone: z.q + 1, dm: TUNING.wardenDmg,
    });
}

/** Called when a warden falls: note the day he went down, so the next one knows when to wake. */
export function fallen (sim: Sim, e: MobE) {
    const z = zones(sim).find((q) => q.q === (e.zone ?? 0) - 1);
    if (!z) return;
    const w = (sim.s.dread ??= {})[z.core.i];
    if (w) w.down = sim.s.day;
    for (const p of sim.online) sim.banner('A warden has fallen', `${MOBS[e.kind].name} will not stay down for ever…`, PAL.plum, p.id);
}

/** What the Dread Reaches do over time: greet whoever walks in, send the dead after them, and let the dead rest when nobody is there. */
export function update (sim: Sim) {
    if (sim.s.tick % 60 !== 0) return;                       // every three seconds
    const m = mem(sim);
    const players = sim.online.filter((p) => p.downed <= 0 && !p.rift);
    // a welcome, once per visit
    for (const p of sim.online) {
        const z = p.rift ? null : zoneAt(sim, p.x, p.y);
        const was = m.at.get(p.id) ?? -1;
        if ((z ? z.q : -1) !== was) {
            m.at.set(p.id, z ? z.q : -1);
            if (z) {
                const w = wardenOf(sim, z);
                sim.banner('The Dread Reaches', w ? `${MOBS[w.kind].name} sleeps at its heart. The dead walk here, day and night.` : 'The warden is gone for now, but the dead still walk.', PAL.plum, p.id);
                sim.fx('roar', p.x, p.y - 10, p.id, 0.7);
            }
        }
    }
    for (const z of zones(sim)) {
        const near = players.filter((p) => zoneAt(sim, p.x, p.y, PLOT * TILE * 0.5)?.q === z.q);
        const mine = sim.ents('mob').filter((e) => e.zone === z.q + 1 && !isBoss(e.kind));
        if (!near.length) {
            // nobody about: after half a minute the haunting thins out again
            const since = m.empty.get(z.q) ?? sim.s.time;
            m.empty.set(z.q, since);
            if (sim.s.time - since > 30) for (const e of mine) sim.remove(e.id);
            continue;
        }
        m.empty.delete(z.q);
        const want = Math.min(TUNING.dreadMax, TUNING.dreadBase + TUNING.dreadPerFarmer * near.length);
        for (let i = 0; i < 2 && mine.length < want; i++) {
            const plot = sim.rng.pick(z.plots);
            const lv = Math.max(...near.map((p) => mobs.groupLevel(sim, p))) + 1;
            const kind = pickHaunt(lv, () => sim.rng.next());
            const mob = mobs.spawnMob(sim, kind, undefined, plot.i, { lv, elite: sim.rng.chance(0.2), pack: false });
            if (mob) { mob.zone = z.q + 1; mob.guard = 1; sim.touch(mob); mine.push(mob); }
        }
    }
}

/** Extra spoils for helping take down a warden, on top of what any boss gives. */
export function spoils (sim: Sim, q: PlayerS, e: MobE) {
    const rng = sim.rng;
    const items: [ItemId, number][] = [['crate_gold', 2], ['rift_shard', rng.int(4, 8)]];
    if (rng.chance(0.4)) items.push(['crate_mythic', 1]);
    for (const [item, n] of items) sim.give(q, item, n, q.x, q.y - 8);
    sim.give(q, 'coin', MOBS[e.kind].coins[1] * 2, q.x, q.y - 8);
    if (q.online) sim.toast(q.id, 'The warden’s hoard: gold crates and rift shards', 'i_crate_gold', PAL.gold);
}
