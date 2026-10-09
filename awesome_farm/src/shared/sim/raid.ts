// The raids a Blight nest sends at night. At nightfall, a farmer whose base (the campfire on their own land nearest to them, or their
// home island) has a living nest within `raidRange` plots gets part of the night's monsters as a raiding party from the nearest nest:
// they wade across the sea (slower), march on the base, and break the walls and doorways in their way (sim/defense.ts); a farmer close by
// is fought as usual.
// Without a nest in range a night is exactly what it always was: nothing here rolls the world's dice unless a raid is coming.

import { PLOT, TILE, TUNING } from '../config';
import { BUILDINGS } from '../data/buildings';
import { pickRaider, type MobDef } from '../data/mobs';
import { PAL } from '../palette';
import * as blight from './blight';
import * as defense from './defense';
import * as mobs from './mobs';
import * as quests from './quests';
import type { Sim } from './sim';
import type { MobE, PlayerS } from './types';

const B = TUNING.blight;

/** The four sides a wave comes from, in the order a nest uses them (north first, then east, south, west). */
export const SIDES = ['north', 'east', 'south', 'west'] as const;

/** One wave: `n` raiders stepping out of one side of a nest `at` seconds into the night. */
export interface Wave { plot: number; side: number; n: number; at: number; lv: number }
export interface RaidPlan { plot: number; n: number; taken: number; x: number; y: number; dir: string; nests: number; lv: number; waves: Wave[] }

/** How many raiders one wave of a nest of this level holds: one small one at level 1, two at level 2, then a few more every other level. */
export const waveSize = (lv: number) => lv <= 2 ? Math.max(1, lv) : 2 + Math.floor((lv - 2) / 2);
/** How many waves a nest of this level sends in a night: one, and one more for every three levels. */
export const waveCount = (lv: number) => Math.min(B.waveMax, 1 + Math.floor((Math.max(1, lv) - 1) / 3));
/** The side a nest's `i`th wave of a night comes from: it starts on a different side every night and goes round (north, east, south, west). */
export const sideOf = (day: number, plot: number, i: number) => (((day + plot + i) % 4) + 4) % 4;

/** The raid a farmer gets tonight (null: none, and the night is exactly as it always was). `count` is how many monsters come for them. */
export function raidFor (sim: Sim, p: PlayerS, count: number): RaidPlan | null {
    if (p.rift || count <= 0) return null;
    const base = blight.baseOf(sim, p);
    const near = blight.nestsNear(sim, base.x, base.y);
    if (!near.length) return null;
    const taken = Math.round(count * B.raidShare);
    // every nest in range sends its own waves, each from the next side round, the first ones small
    const waves: Wave[] = [];
    near.slice(0, 4).forEach((plot, k) => {
        const lv = blight.levelOf(plot), size = waveSize(lv);
        for (let i = 0; i < waveCount(lv); i++) waves.push({ plot: plot.i, side: sideOf(sim.s.day, plot.i, i), n: size, at: 2 + k * 2 + i * B.waveGap, lv });
    });
    waves.sort((a, b) => a.at - b.at);
    let left = B.waveTotal;
    for (const w of waves) { w.n = Math.min(w.n, left); left -= w.n; }
    const keep = waves.filter((w) => w.n > 0);
    const lv = blight.levelOf(near[0]);
    return { plot: near[0].i, n: keep.reduce((a, w) => a + w.n, 0), taken, x: Math.round(base.x), y: Math.round(base.y), dir: blight.direction(sim, base, near[0]), nests: near.length, lv, waves: keep };
}

/** The dusk warning: every farmer a raid is coming for hears where from. */
export function warn (sim: Sim) {
    for (const p of sim.online) {
        const plan = raidFor(sim, p, 1);
        if (!plan) continue;
        sim.banner('A raid is gathering', `at the level ${plan.lv} nest to the ${plan.dir}: ${plan.waves.length} wave${plan.waves.length > 1 ? 's' : ''}, the first from the ${SIDES[plan.waves[0].side]}. Walls, doorways and towers will hold them off.`, PAL.berry, p.id);
        sim.toast(p.id, `A raid is gathering at the nest to the ${plan.dir}`, 'k_skull', PAL.berry);
    }
}

/** Night falls on a farmer with a raid coming: say so, and count it (the first-raid hint waits for it). */
export function announce (sim: Sim, p: PlayerS, plan: RaidPlan) {
    const c = sim.world.plotCenter(sim.s.plots[plan.plot]);
    sim.fx('raid', c.x, c.y);
    const first = plan.waves[0];
    sim.banner('The raid sets out!', `${plan.waves.length} wave${plan.waves.length > 1 ? 's' : ''}, ${plan.n} monster${plan.n > 1 ? 's' : ''}, from the nest to the ${plan.dir}${plan.nests > 1 ? ` (${plan.nests} nests are near)` : ''}. The first comes from the ${SIDES[first.side]}.`, PAL.berry, p.id);
    quests.count(p, 'raid');
}

/** One raider steps out of its nest and sets off for the base. (Null: the nest is gone, or there was no room.) */
export function spawnRaider (sim: Sim, sp: { near?: string; raid?: number; rx?: number; ry?: number; side?: number; first?: boolean }): MobE | null {
    const plot = sp.raid !== undefined ? sim.s.plots[sp.raid] : undefined;
    if (!plot || plot.blight !== 1 || sp.rx === undefined || sp.ry === undefined) return null;
    const who = sp.near ? sim.s.players[sp.near] : undefined;
    const lv = (who ? mobs.groupLevel(sim, who) : 1) + blight.raidBonus(blight.levelOf(plot));
    const kind = pickRaider(blight.kindOf(plot), lv, () => sim.rng.next());
    // a wave steps out of one side of the nest island (when there is room there; else anywhere on it, as raiders always did)
    const at = sp.side !== undefined ? edgeSpot(sim, plot, sp.side) : null;
    const m = mobs.spawnMob(sim, kind, undefined, plot.i, { lv, pack: false, ...(at ?? {}) });
    if (!m) return null;
    if (sp.first && who && sp.side !== undefined) sim.toast(who.id, `A wave comes from the ${SIDES[sp.side]}`, 'k_skull', PAL.berry);
    m.rd = [sp.rx, sp.ry];
    sim.touch(m);
    return m;
}

/** A spot a little inside one side of a nest island (0 north, 1 east, 2 south, 3 west), a little spread along it; null when it is blocked. */
function edgeSpot (sim: Sim, plot: { gx: number; gy: number }, side: number): { x: number; y: number } | null {
    const c = sim.world.plotCenter(plot as never), half = (PLOT * TILE) / 2 - 2.5 * TILE;
    for (let tries = 0; tries < 6; tries++) {
        const along = (sim.rng.next() - 0.5) * 6 * TILE;
        const dx = side === 1 ? half : side === 3 ? -half : along, dy = side === 0 ? -half : side === 2 ? half : along;
        const x = c.x + dx, y = c.y + dy;
        if (!sim.world.boxBlocked(x, y, 3, 2)) return { x, y };
    }
    return null;
}

/** A raider with nobody to chase marches on the base (stepping round whatever is in its way for a moment when it has to). */
export function march (e: MobE, def: MobDef, dt: number) {
    const [tx, ty] = e.rd!;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < B.raidArrive) { e.vx = 0; e.vy = 0; return; }
    let ux = dx / d, uy = dy / d;
    if ((e.dt ?? 0) > 0) {
        e.dt = Math.max(0, e.dt! - dt);
        const s = e.dd ?? 1;
        const sx = -uy * s * 0.9 + ux * 0.25, sy = ux * s * 0.9 + uy * 0.25, l = Math.hypot(sx, sy) || 1;
        ux = sx / l; uy = sy / l;
    }
    const sp = def.speed * B.raidMarch;
    e.vx = ux * sp; e.vy = uy * sp;
}

/** What stops a raider's feet box at (x, y): the edge of the map (-2), solid rock (-1), or the id of what stands there (a doorway counts). 0: clear, sea included. */
function blockAt (sim: Sim, x: number, y: number): number {
    const w = sim.world;
    for (const [px, py] of [[x - 3, y - 2], [x + 3, y - 2], [x - 3, y], [x + 3, y]]) {
        const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
        if (!w.inBounds(tx, ty)) return -2;
        const occ = w.occAt(tx, ty);
        if (occ !== 0) return occ;
        if (w.gateAt(tx, ty)) return w.softAt(tx, ty) || -2;
    }
    return 0;
}

/** Move a raider: it wades across the sea (slower), walls, doorways, towers and buildings stop it, and it breaks the defenses in its way. */
export function raidMove (sim: Sim, e: MobE, def: MobDef, dt: number) {
    const w = sim.world;
    const wet = !w.isLand(Math.floor(e.x / TILE), Math.floor(e.y / TILE));
    const k = (e.sm ?? 1) * (wet ? B.raidWade : 1);
    const nx = e.x + e.vx * dt * k, ny = e.y + e.vy * dt * k;
    if (def.flies) {
        if (!w.flyBlocked(nx, ny, e.x, e.y)) { e.x = nx; e.y = ny; return; }
        const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
        atWall(sim, e, def, w.occAt(tx, ty) || w.softAt(tx, ty), dt);
        return;
    }
    let hit = 0;
    const bx = blockAt(sim, nx, e.y);
    if (!bx) e.x = nx; else hit = bx;
    const by = blockAt(sim, e.x, ny);
    if (!by) e.y = ny; else hit = hit || by;
    if (hit) atWall(sim, e, def, hit, dt);
}

/** Something stops a raider: a defense piece takes a blow now and then; anything else it steps round. */
function atWall (sim: Sim, e: MobE, def: MobDef, id: number, dt: number) {
    const b = id > 0 ? sim.s.ents[id] : undefined;
    if (b?.k === 'bld' && BUILDINGS[b.kind].hp) {
        e.hb = (e.hb ?? 0.3) - dt;
        if (e.hb <= 0) { e.hb = B.raidBldEvery; defense.hitBuilding(sim, b, B.raidBldDmg * def.dmg * (e.el ? 1.25 : 1)); }
        return;
    }
    if ((e.dt ?? 0) <= 0 && e.rd) { e.dt = 0.8; e.dd = -(e.dd ?? ((e.id & 1) ? -1 : 1)); }
}
