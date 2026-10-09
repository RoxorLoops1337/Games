// The raids a Blight nest sends at night. At nightfall, a farmer whose base (the campfire on their own land nearest to them, or their
// home island) has a living nest within `raidRange` plots gets part of the night's monsters as a raiding party from the nearest nest:
// they wade across the sea (slower), march on the base, and stop at walls, doorways and buildings; a farmer close by is fought as usual.
// Without a nest in range a night is exactly what it always was: nothing here rolls the world's dice unless a raid is coming.

import { TILE, TUNING } from '../config';
import { pickRaider, type MobDef } from '../data/mobs';
import { PAL } from '../palette';
import * as blight from './blight';
import * as mobs from './mobs';
import * as quests from './quests';
import type { Sim } from './sim';
import type { MobE, PlayerS } from './types';

const B = TUNING.blight;

export interface RaidPlan { plot: number; n: number; taken: number; x: number; y: number; dir: string; nests: number; lv: number }

/** The raid a farmer gets tonight (null: none, and the night is exactly as it always was). `count` is how many monsters come for them. */
export function raidFor (sim: Sim, p: PlayerS, count: number): RaidPlan | null {
    if (p.rift || count <= 0) return null;
    const base = blight.baseOf(sim, p);
    const near = blight.nestsNear(sim, base.x, base.y);
    if (!near.length) return null;
    const taken = Math.round(count * B.raidShare);
    const lv = blight.levelOf(near[0]);
    const n = Math.min(B.raidMax, taken + B.raidPerNest * (near.length - 1) + Math.floor(lv / B.raidPerLv));
    return { plot: near[0].i, n, taken, x: Math.round(base.x), y: Math.round(base.y), dir: blight.direction(sim, base, near[0]), nests: near.length, lv };
}

/** The dusk warning: every farmer a raid is coming for hears where from. */
export function warn (sim: Sim) {
    for (const p of sim.online) {
        const plan = raidFor(sim, p, 1);
        if (!plan) continue;
        sim.banner('A raid is gathering', `at the level ${plan.lv} nest to the ${plan.dir}. Walls, doorways and towers will hold them off.`, PAL.berry, p.id);
        sim.toast(p.id, `A raid is gathering at the nest to the ${plan.dir}`, 'k_skull', PAL.berry);
    }
}

/** Night falls on a farmer with a raid coming: say so, and count it (the first-raid hint waits for it). */
export function announce (sim: Sim, p: PlayerS, plan: RaidPlan) {
    const c = sim.world.plotCenter(sim.s.plots[plan.plot]);
    sim.fx('raid', c.x, c.y);
    sim.banner('The raid sets out!', `${plan.n} monster${plan.n > 1 ? 's' : ''} from the nest to the ${plan.dir}${plan.nests > 1 ? ` (${plan.nests} nests are near)` : ''}`, PAL.berry, p.id);
    quests.count(p, 'raid');
}

/** One raider steps out of its nest and sets off for the base. (Null: the nest is gone, or there was no room.) */
export function spawnRaider (sim: Sim, sp: { near?: string; raid?: number; rx?: number; ry?: number }): MobE | null {
    const plot = sp.raid !== undefined ? sim.s.plots[sp.raid] : undefined;
    if (!plot || plot.blight !== 1 || sp.rx === undefined || sp.ry === undefined) return null;
    const who = sp.near ? sim.s.players[sp.near] : undefined;
    const lv = (who ? mobs.groupLevel(sim, who) : 1) + blight.raidBonus(blight.levelOf(plot));
    const kind = pickRaider(blight.kindOf(plot), lv, () => sim.rng.next());
    const m = mobs.spawnMob(sim, kind, undefined, plot.i, { lv, pack: false });
    if (!m) return null;
    m.rd = [sp.rx, sp.ry];
    sim.touch(m);
    return m;
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

/** Something stops a raider: it steps round it for a moment. */
function atWall (_sim: Sim, e: MobE, _def: MobDef, _id: number, _dt: number) {
    if ((e.dt ?? 0) <= 0 && e.rd) { e.dt = 0.8; e.dd = -(e.dd ?? ((e.id & 1) ? -1 : 1)); }
}
