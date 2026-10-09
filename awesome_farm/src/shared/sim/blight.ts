// The Blight: nests on dark islands out at sea that grow, spread and merge, and can only be stopped by going out to them. A nest isle
// is a plot marked `blight` (1 while its nest lives: land, nobody's, not for sale; 2 once it is cleansed: land anybody may buy) with a
// `nest` node in its middle that is fought with weapons. Its level (`Plot.nl`) is 1 when it rises and grows every night; its kind
// (`Plot.nk`) decides which family of monsters it hatches. Each dawn every nest grows a level, two neighbours of one kind may merge
// (their levels add up) and every nest may seed a level-1 nest of its kind on a neighbouring plot. A farmer near a nest wakes its brood.
// The raids it sends at night are sim/raid.ts. Its dice are its own (seeded by the world and the day), never the world's `sim.rng`
// until a farmer is at a nest, so a world nobody takes near a nest plays as it always did.

import { GRID, PLOT, SEA, TILE, TUNING } from '../config';
import { NEST_KINDS, nestKindFor, pickRaider, type NestKindId } from '../data/mobs';
import { PAL } from '../palette';
import { Rng } from '../rng';
import * as chronicle from './chronicle';
import * as mobs from './mobs';
import * as quests from './quests';
import type { Sim } from './sim';
import type { NodeE, PlayerS, Plot } from './types';
import { slotPlot } from './worldgen';

const B = TUNING.blight;

/** Runtime only: each nest's brood clock, and when the last farmer left it. */
interface Mem { brood: Map<number, number>; quiet: Map<number, number> }
const memory = new WeakMap<Sim, Mem>();
const mem = (sim: Sim): Mem => {
    let m = memory.get(sim);
    if (!m) { m = { brood: new Map(), quiet: new Map() }; memory.set(sim, m); }
    return m;
};

const cheb = (a: { gx: number; gy: number }, b: { gx: number; gy: number }) => Math.max(Math.abs(a.gx - b.gx), Math.abs(a.gy - b.gy));
const apart = (a: { gx: number; gy: number }, b: { gx: number; gy: number }) => Math.hypot(a.gx - b.gx, a.gy - b.gy);

// ── where the nests are ─────────────────────────────────────────────────────
/** The plots whose nest is alive. */
export const nestPlots = (sim: Sim): Plot[] => sim.s.plots.filter((p) => p.blight === 1);

/** Every nest node in the world (a walk over the nodes: for the slow clocks, never per step). */
export const nestNodes = (sim: Sim): NodeE[] => sim.ents('node').filter((n) => n.kind === 'nest');

/** The nest standing on a plot, if any. */
export const nestOn = (sim: Sim, plot: Plot) => nestNodes(sim).find((n) => n.plot === plot.i);

/** Where the homes are, or will be: the first ring's eight, the islands raised for later farmers, and every claimed home. Nests keep away. */
function homeSpots (sim: Sim): { gx: number; gy: number }[] {
    const out = Array.from({ length: 8 }, (_, k) => slotPlot(k));
    for (const h of Object.values(sim.s.homes ?? {})) out.push(h);
    for (const p of sim.s.plots) if (p.home !== undefined) out.push(p);
    return out;
}

/** Can a nest isle rise here? Wild sea: nobody's, not the Old Heart, a home, the Dread Reaches (nor beside them) or another nest. */
function canHost (sim: Sim, p: Plot | null | undefined): p is Plot {
    if (!p || p.owned || p.heart || p.dread || p.blight || p.home !== undefined) return false;
    if (p.gx < 1 || p.gy < 1 || p.gx > GRID - 2 || p.gy > GRID - 2) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (sim.world.plot(p.gx + dx, p.gy + dy)?.dread) return false;
    return true;
}

/** A nest's level (1 when it rises, +1 every night, summed when two merge) and its kind, from its plot. */
export const levelOf = (plot: Plot | undefined) => Math.max(1, plot?.nl ?? 1);
export const kindOf = (plot: Plot | undefined): NestKindId => plot?.nk ?? 'bone';
/** A nest's full health at a level. */
export const nestHp = (lv: number) => Math.round(B.nestHp * (1 + B.nestHpPerLv * (Math.max(1, lv) - 1)));
/** The chance a nest of this level seeds another at dawn. */
export const spreadChance = (lv: number) => Math.min(B.nestSpreadMax, B.nestSpreadBase + B.nestSpreadPerLv * Math.max(1, lv));
/** How many levels above the farmer's threat level the monsters it hatches (its brood, its raiders) come. */
export const raidBonus = (lv: number) => Math.min(B.raidLvMax, Math.floor(Math.max(1, lv) / B.raidLvPer));

/** Mark a plot as a nest isle of this kind at level 1 (it is land from now on: the caller recomputes the world). */
function mark (plot: Plot, kind: NestKindId) { plot.blight = 1; plot.nl = 1; plot.nk = kind; }

/** Put a nest in the middle of a nest isle (its health from the plot's level). */
function addNest (sim: Sim, plot: Plot): NodeE | null {
    const o = sim.world.plotOrigin(plot);
    const spot = sim.nearestFree(o.tx + PLOT / 2, o.ty + PLOT / 2, 6);
    if (!spot) return null;
    const hp = nestHp(levelOf(plot));
    plot.nodes++;
    return sim.add<NodeE>({ k: 'node', kind: 'nest', tx: spot.tx, ty: spot.ty, hp, plot: plot.i, mhp: hp });
}

/** A nest's level changed: its full health follows, the damage it has taken kept as a share. */
function relevel (sim: Sim, plot: Plot, lv: number) {
    plot.nl = lv;
    sim.dirtyPlots.add(plot.i);
    const n = nestOn(sim, plot);
    if (!n) return;
    const was = n.mhp ?? nestHp(1), mhp = nestHp(lv);
    n.hp = Math.max(1, (n.hp / Math.max(1, was)) * mhp);
    n.mhp = mhp;
    sim.touch(n);
}

/** A nest isle is cleansed: land anybody may buy (its level and kind go with the nest). */
function cleanse (sim: Sim, plot: Plot) {
    plot.blight = 2;
    delete plot.nl; delete plot.nk;
    sim.dirtyPlots.add(plot.i);
}

/** Raise a level-1 nest isle on a wild plot (spread uses the same rules; tests and the harness call it directly). Null when the plot cannot host one. */
export function raise (sim: Sim, plot: Plot, kind?: NestKindId): NodeE | null {
    if (!canHost(sim, plot)) return null;
    mark(plot, kind ?? nestKindFor(plot.biome));
    sim.world.recompute();
    sim.dirtyPlots.add(plot.i);
    return addNest(sim, plot);
}

/**
 * The Blight's first nests (once per world, from the seed alone, so an old world that loads today gets the same ones a new world
 * with its seed would), and a nest on any nest isle that has lost its own. Safe to call whenever.
 */
export function ensure (sim: Sim) {
    const s = sim.s;
    if (!s.blight) {
        s.blight = { v: 1 };
        const rng = new Rng(`${s.seed}:blight`);
        const homes = homeSpots(sim);
        const owned = s.plots.filter((p) => p.owned);
        const later = Array.from({ length: 8 }, (_, k) => slotPlot(8 + k));        // (the second ring, raised when farmers nine and up arrive, keeps its spots free)
        const cands = rng.shuffle(s.plots.filter((p) => canHost(sim, p)
            && homes.every((h) => apart(h, p) >= B.nestMinHomeGap) && later.every((h) => cheb(h, p) > B.nestOuterGap)
            && owned.every((q) => cheb(q, p) >= B.nestOwnedGap)));
        const chosen: Plot[] = [];
        for (const p of cands) {
            if (chosen.length >= B.nests) break;
            if (!chosen.some((q) => apart(q, p) < B.nestApart)) chosen.push(p);
        }
        for (const p of chosen) { mark(p, nestKindFor(p.biome)); sim.dirtyPlots.add(p.i); }
        if (chosen.length) sim.world.recompute();
        for (const p of chosen) addNest(sim, p);
    }
    // a nest isle whose nest is gone (taken away some other way) is cleansed
    const have = new Set(nestNodes(sim).map((n) => n.plot));
    let gone = false;
    for (const p of s.plots) if (p.blight === 1 && !have.has(p.i)) { cleanse(sim, p); gone = true; }
    if (gone) sim.world.recompute();
}

// ── a nest under attack ─────────────────────────────────────────────────────
/** A farmer swings their weapon at a nest. */
export function hitNest (sim: Sim, p: PlayerS, n: NodeE) {
    const d = sim.derivedOf(p);
    const c = sim.center(n);
    let dmg = d.weapon.dmg * (sim.s.night ? 1 + (d.mods.nightDmg ?? 0) : 1);
    const crit = d.crit > 0 && sim.rng.chance(d.crit);
    if (crit) dmg *= 2;
    n.hp -= dmg;
    sim.touch(n);
    const text = dmg >= 10 ? `${Math.round(dmg)}` : `${Math.round(dmg * 10) / 10}`;
    sim.float(c.x + (sim.rng.next() - 0.5) * 8, c.y - 18, crit ? `${text}!` : text, crit ? PAL.gold : PAL.cream, p.id);
    mem(sim).brood.set(n.id, Math.min(mem(sim).brood.get(n.id) ?? 0, sim.s.time + 2));       // (a nest that is struck wakes its brood)
    if (n.hp > 0) { sim.fx('nestHit', c.x, c.y, p.id); return; }
    destroy(sim, n, p);
}

/** A nest falls: the isle is cleansed (anybody may buy it now) and everyone who fought there shares the spoils. */
export function destroy (sim: Sim, n: NodeE, by?: PlayerS) {
    const plot = sim.s.plots[n.plot];
    const c = sim.center(n), lv = levelOf(plot), kind = NEST_KINDS[kindOf(plot)].name;
    sim.fx('nestDie', c.x, c.y, by?.id);
    sim.remove(n.id);
    for (const m of sim.ents('mob')) if (m.nb === n.plot) sim.killMob(m);           // (its brood scatters)
    if (plot?.blight === 1) { cleanse(sim, plot); sim.world.recompute(); }
    if (!by) return;
    const helpers = sim.online.filter((q) => q === by || (!q.rift && q.downed <= 0 && Math.hypot(q.x - c.x, q.y - c.y) <= B.broodNear * 1.5));
    for (const q of helpers) {
        const coins = sim.rng.int(B.nestCoins[0], B.nestCoins[1]) * lv;
        const cores = B.nestCores + Math.floor(lv / B.nestCoresPer);
        sim.give(q, 'coin', coins, c.x, c.y - 8);
        sim.give(q, 'blightcore', cores, c.x, c.y - 8);
        sim.gainXp(q, B.nestXp * lv);
        quests.count(q, 'nest');
        sim.toast(q.id, `The nest is gone: +${coins} coins, ${cores} Blight Core${cores > 1 ? 's' : ''}`, 'i_blightcore', PAL.gold);
    }
    const who = chronicle.names(helpers.map((q) => q.name));
    sim.banner('A Blight nest is destroyed!', `${who} cleansed the isle: anybody may buy it now`, PAL.lime);
    if (!chronicle.note(sim, 'nest:first', `${who} destroyed the first Blight nest, a level ${lv} ${kind}.`, 'k_skull')) chronicle.note(sim, `nest:${plot?.i}:${sim.s.day}`, `${who} destroyed a level ${lv} ${kind}.`, 'k_skull');
}

// ── where things lie ────────────────────────────────────────────────────────
/** A farmer's base: the campfire on their own land nearest to them, or the middle of their home island. */
export function baseOf (sim: Sim, p: PlayerS): { x: number; y: number } {
    const home = sim.homePlot(p.slot);
    let best = sim.world.plotCenter(home), bd = Math.hypot(best.x - p.x, best.y - p.y);
    for (const f of sim.buildings('campfire')) {
        const plot = sim.world.plotAt(f.tx, f.ty);
        if (!plot?.owned || (plot.buyer !== p.id && plot !== home)) continue;
        const c = { x: (f.tx + 0.5) * TILE, y: (f.ty + 1) * TILE };
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd) { bd = d; best = c; }
    }
    return best;
}

/** Living nests within `range` plots of a point (px), nearest first. */
export function nestsNear (sim: Sim, x: number, y: number, range: number = B.raidRange): Plot[] {
    const gx = x / (PLOT * TILE) - SEA - 0.5, gy = y / (PLOT * TILE) - SEA - 0.5;
    return nestPlots(sim).map((p) => ({ p, d: Math.hypot(p.gx - gx, p.gy - gy) })).filter((o) => o.d <= range)
        .sort((a, b) => a.d - b.d || a.p.i - b.p.i).map((o) => o.p);
}

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
/** "north-east": which way a plot lies from a point. */
export function direction (sim: Sim, from: { x: number; y: number }, plot: Plot) {
    const c = sim.world.plotCenter(plot);
    const a = Math.atan2(c.y - from.y, c.x - from.x);
    return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

export interface RaidPlan { plot: number; n: number; taken: number; x: number; y: number; dir: string; nests: number; lv: number }

// ── the nests stir ──────────────────────────────────────────────────────────
/** A farmer near a nest wakes its brood; with nobody near for a while, the brood melts away. */
function brood (sim: Sim) {
    const m = mem(sim), now = sim.s.time;
    const players = sim.online.filter((p) => p.downed <= 0 && !p.rift);
    const all = sim.ents('mob');
    for (const n of nestNodes(sim)) {
        const c = sim.center(n);
        const near = players.filter((p) => Math.hypot(p.x - c.x, p.y - c.y) <= B.broodNear);
        const mine = all.filter((e) => e.nb === n.plot);
        if (!near.length) {
            if (!mine.length) continue;
            const since = m.quiet.get(n.id) ?? now;
            m.quiet.set(n.id, since);
            if (now - since > B.broodLinger) for (const e of mine) sim.remove(e.id);
            continue;
        }
        m.quiet.delete(n.id);
        if ((m.brood.get(n.id) ?? 0) > now || mine.length >= B.broodMax) continue;
        m.brood.set(n.id, now + B.broodEvery);
        const plot = sim.s.plots[n.plot];
        const lv = Math.max(...near.map((p) => mobs.groupLevel(sim, p))) + raidBonus(levelOf(plot));
        const e = mobs.spawnMob(sim, pickRaider(kindOf(plot), lv, () => sim.rng.next()), undefined, n.plot, { lv, pack: false });
        if (e) { e.nb = n.plot; sim.touch(e); }
    }
}

/** Every step: the towers and traps; every three seconds, the nests stir. */
/** Every three seconds the nests stir. */
export function update (sim: Sim) {
    if (sim.s.tick % 60 === 30) brood(sim);
}

// ── dawn ────────────────────────────────────────────────────────────────────
/** Dawn: every nest grows a level and mends some of its wounds; same-kind neighbours may merge; then the Blight spreads. */
export function onDawn (sim: Sim) {
    for (const plot of nestPlots(sim)) relevel(sim, plot, levelOf(plot) + 1);
    for (const n of nestNodes(sim)) {
        const mhp = n.mhp ?? nestHp(levelOf(sim.s.plots[n.plot]));
        if (n.hp < mhp) { n.hp = Math.min(mhp, n.hp + mhp * B.nestMend); sim.touch(n); }
    }
    merge(sim);
    spread(sim);
}

const NEAR8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** Whoever's land is within raid range of a plot (online), with where it lies from their base. */
function tellNear (sim: Sim, plot: Plot, title: string, sub: (dir: string) => string) {
    for (const p of sim.online) {
        const mine = sim.s.plots.filter((q) => q.owned && (q.buyer === p.id || q.buyer === `home:${p.slot}`));
        if (!mine.some((o) => apart(o, plot) <= B.raidRange)) continue;
        sim.banner(title, sub(direction(sim, baseOf(sim, p), plot)), PAL.berry, p.id);
    }
}

/** Two nests of the same kind on neighbouring plots may become one: the higher level stays where it is with both levels added; the other isle is cleansed. Each nest merges at most once a dawn. */
export function merge (sim: Sim): [Plot, Plot][] {
    const s = sim.s;
    const rng = new Rng(`${s.seed}:merge:${s.day}`);
    const done = new Set<number>();
    const out: [Plot, Plot][] = [];
    for (const a of nestPlots(sim)) {
        if (done.has(a.i)) continue;
        for (const [dx, dy] of NEAR8) {
            const b = sim.world.plot(a.gx + dx, a.gy + dy);
            if (!b || b.blight !== 1 || done.has(b.i) || kindOf(b) !== kindOf(a) || b.i < a.i) continue;
            if (!rng.chance(B.nestMerge)) continue;
            const keep = levelOf(b) > levelOf(a) ? b : a, gone = keep === a ? b : a;
            const lv = levelOf(a) + levelOf(b);
            const n = nestOn(sim, gone);
            if (n) { const c = sim.center(n); sim.fx('nestSpread', c.x, c.y); sim.remove(n.id); }
            for (const m of sim.ents('mob')) if (m.nb === gone.i) { m.nb = keep.i; sim.touch(m); }
            cleanse(sim, gone);
            relevel(sim, keep, lv);
            done.add(a.i); done.add(b.i);
            out.push([keep, gone]);
            tellNear(sim, keep, 'Two nests have merged', (dir) => `A level ${lv} ${NEST_KINDS[kindOf(keep)].name} now stands to the ${dir}`);
            chronicle.note(sim, `merge:${keep.i}:${s.day}`, `Two Blight nests merged into a level ${lv} ${NEST_KINDS[kindOf(keep)].name}.`, 'k_skull');
            break;
        }
    }
    if (out.length) sim.world.recompute();
    return out;
}

/** Each nest may seed a level-1 nest of its kind on a neighbouring plot: never on anybody's land, the Dread Reaches, another nest or near a home. */
export function spread (sim: Sim): Plot[] {
    const s = sim.s;
    const rng = new Rng(`${s.seed}:spread:${s.day}`);
    const nests = nestPlots(sim);
    let total = nests.length;
    const homes = homeSpots(sim);
    const born: Plot[] = [];
    for (const n of nests) {
        if (total >= B.nestMax) break;
        if (!rng.chance(spreadChance(levelOf(n)))) continue;
        const opts: Plot[] = [];
        for (const [dx, dy] of NEAR8) {
            const q = sim.world.plot(n.gx + dx, n.gy + dy);
            if (canHost(sim, q) && homes.every((h) => cheb(h, q) > B.nestHomeGuard)) opts.push(q);
        }
        if (!opts.length) continue;
        const q = rng.pick(opts);
        mark(q, kindOf(n));
        born.push(q);
        total++;
    }
    if (!born.length) return born;
    sim.world.recompute();
    for (const q of born) {
        sim.dirtyPlots.add(q.i);
        addNest(sim, q);
        const c = sim.world.plotCenter(q);
        sim.fx('nestSpread', c.x, c.y);
    }
    // whoever's land the Blight has crept close to is told (once, for the nearest new nest)
    const told = new Set<string>();
    for (const q of born) {
        for (const p of sim.online) {
            if (told.has(p.id)) continue;
            const mine = s.plots.filter((o) => o.owned && (o.buyer === p.id || o.buyer === `home:${p.slot}`));
            if (!mine.some((o) => apart(o, q) <= B.raidRange)) continue;
            told.add(p.id);
            sim.banner('The Blight is spreading', `A new nest rose to the ${direction(sim, baseOf(sim, p), q)}. Its raids will come at night.`, PAL.berry, p.id);
        }
    }
    return born;
}
