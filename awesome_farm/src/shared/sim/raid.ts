// The raids a Blight nest sends at night. At nightfall, a farmer whose base (the campfire on their own land nearest to them, or their
// home island) has a living nest within `raidRange` plots gets part of the night's monsters as a raiding party from the nearest nest:
// they wade across the sea (slower), march on the base, and break the walls and doorways in their way (sim/defense.ts); a farmer close by
// is fought as usual.
// Without a nest in range a night is exactly what it always was: nothing here rolls the world's dice unless a raid is coming.

import { TILE, TUNING } from '../config';
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

/**
 * The map is cut into eight sectors round a farmer's base by an X and a + (the lines run through the base): east, south-east, south,
 * south-west, west, north-west, north, north-east. Every nest in a sector sends ONE wave a night, so a night has at most eight, each
 * stepping out of the sector's own direction.
 */
export const SECTORS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'] as const;
/** Which sector a point lies in, seen from the base (0 east, going clockwise on the map: 2 south, 4 west, 6 north). */
export const sectorOf = (from: { x: number; y: number }, to: { x: number; y: number }) => ((Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) % 8) + 8) % 8;

/** One wave: `n` raiders from one sector, stepping out at (sx, sy) `at` seconds into the night. `plot` is the strongest nest of the sector. */
export interface Wave { plot: number; sector: number; n: number; at: number; lv: number; sx: number; sy: number }
export interface RaidPlan { plot: number; n: number; taken: number; x: number; y: number; dir: string; nests: number; lv: number; waves: Wave[] }

/** How many raiders one nest of this level adds to its sector's wave: one small one at level 1, two at level 2, then a few more every other level. */
export const waveSize = (lv: number) => lv <= 2 ? Math.max(1, lv) : 2 + Math.floor((lv - 2) / 2);
/** The sector order of a night: it starts a sector further round every night (night 1 from the north) and goes clockwise. */
export const sectorOrder = (day: number) => Array.from({ length: 8 }, (_, k) => (6 + Math.max(0, day - 1) + k) % 8);

/** How many sectors send a wave on this night: two on the first night, one more every night, all eight from the seventh. */
export const waveCap = (day: number) => Math.min(8, 1 + Math.max(1, day));

/** The raid a farmer gets tonight (null: none, and the night is exactly as it always was). `count` is how many monsters come for them. */
export function raidFor (sim: Sim, p: PlayerS, count: number): RaidPlan | null {
    if (p.rift || count <= 0) return null;
    const base = blight.baseOf(sim, p);
    const near = blight.nestsNear(sim, base.x, base.y);
    if (!near.length) return null;
    const taken = Math.round(count * B.raidShare);
    // the nests of one sector send one wave between them; the strongest of them is where its raiders come from
    const bySector = new Map<number, typeof near>();
    for (const plot of near) {
        const k = sectorOf(base, sim.world.plotCenter(plot));
        bySector.set(k, [...(bySector.get(k) ?? []), plot]);
    }
    const waves: Wave[] = [];
    for (const k of sectorOrder(sim.s.day)) {
        const group = bySector.get(k);
        if (!group) continue;
        const lead = [...group].sort((a, b) => blight.levelOf(b) - blight.levelOf(a) || a.i - b.i)[0];
        const c = sim.world.plotCenter(lead), d = Math.hypot(c.x - base.x, c.y - base.y) || 1;
        const reach = Math.min(d, B.raidSpawnTiles * TILE);       // a far nest's raiders start where the march can still be won in a night
        const spot = stagingSpot(sim, base, c, reach, d);
        waves.push({ plot: lead.i, sector: k, n: Math.min(B.waveSectorMax, group.reduce((a, q) => a + waveSize(blight.levelOf(q)), 0)), at: 2 + waves.length * B.waveGap, lv: blight.levelOf(lead), sx: spot.x, sy: spot.y });
    }
    waves.length = Math.min(waves.length, waveCap(sim.s.day));
    let left = B.waveTotal;
    for (const w of waves) { w.n = Math.min(w.n, left); left -= w.n; }
    const keep = waves.filter((w) => w.n > 0);
    const lv = blight.levelOf(near[0]);
    return { plot: near[0].i, n: keep.reduce((a, w) => a + w.n, 0), taken, x: Math.round(base.x), y: Math.round(base.y), dir: blight.direction(sim, base, near[0]), nests: near.length, lv, waves: keep };
}

/** Where a sector's wave steps out: on the line from the base to its nest, `reach` px out, backed in toward the base until the spot is clear. */
function stagingSpot (sim: Sim, base: { x: number; y: number }, nest: { x: number; y: number }, reach: number, dist: number): { x: number; y: number } {
    const ux = (nest.x - base.x) / dist, uy = (nest.y - base.y) / dist;
    for (let back = 0; back < 20; back++) {
        const r = reach - back * TILE * 1.5;
        if (r < 8 * TILE) break;
        const x = base.x + ux * r, y = base.y + uy * r;
        if (!sim.world.boxBlocked(x, y, 3, 2) && sim.world.inBounds(Math.floor(x / TILE), Math.floor(y / TILE))) return { x, y };
    }
    return { x: base.x + ux * 12 * TILE, y: base.y + uy * 12 * TILE };
}

/** The dusk warning: every farmer a raid is coming for hears where from. */
export function warn (sim: Sim) {
    for (const p of sim.online) {
        const plan = raidFor(sim, p, 1);
        if (!plan) continue;
        sim.banner('A raid is gathering', `${plan.waves.length} wave${plan.waves.length > 1 ? 's' : ''} tonight, from the ${sectorList(plan)}. Walls, doorways and towers will hold them off.`, PAL.berry, p.id);
        sim.toast(p.id, `A raid is gathering: from the ${sectorList(plan)}`, 'k_skull', PAL.berry);
    }
}

/** "north, east and south-west": the sectors the waves come from, in the order they come. */
const sectorList = (plan: RaidPlan) => { const n = plan.waves.map((w) => SECTORS[w.sector]); return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0]; };

/** Night falls on a farmer with a raid coming: say so, and count it (the first-raid hint waits for it). */
export function announce (sim: Sim, p: PlayerS, plan: RaidPlan) {
    const c = sim.world.plotCenter(sim.s.plots[plan.plot]);
    sim.fx('raid', c.x, c.y);
    const first = plan.waves[0];
    sim.banner('The raid sets out!', `${plan.waves.length} wave${plan.waves.length > 1 ? 's' : ''}, ${plan.n} monster${plan.n > 1 ? 's' : ''}. The first comes from the ${SECTORS[first.sector]}.`, PAL.berry, p.id);
    quests.count(p, 'raid');
}

/** One raider steps out of its nest and sets off for the base. (Null: the nest is gone, or there was no room.) */
export function spawnRaider (sim: Sim, sp: { near?: string; raid?: number; rx?: number; ry?: number; sec?: number; sx?: number; sy?: number; first?: boolean }): MobE | null {
    const plot = sp.raid !== undefined ? sim.s.plots[sp.raid] : undefined;
    if (!plot || plot.blight !== 1 || sp.rx === undefined || sp.ry === undefined) return null;
    const who = sp.near ? sim.s.players[sp.near] : undefined;
    const lv = (who ? mobs.groupLevel(sim, who) : 1) + blight.raidBonus(blight.levelOf(plot));
    const kind = pickRaider(blight.kindOf(plot), lv, () => sim.rng.next());
    // a wave steps out where its sector's line from the base meets the march (a little spread along the front)
    const at = sp.sx !== undefined && sp.sy !== undefined ? spread(sim, sp.sx, sp.sy) : null;
    // the higher the nest, the tougher what comes out of it: more health, a harder bite, and from level 5 on some of them elite
    const nl = blight.levelOf(plot);
    const hm = Math.min(B.raidHpMax, 1 + B.raidHpPerLv * (nl - 1)), dm = Math.min(B.raidDmgMax, 1 + B.raidDmgPerLv * (nl - 1));
    const elite = nl >= B.raidEliteFrom && sim.rng.chance(Math.min(B.raidEliteMax, B.raidElitePerLv * (nl - B.raidEliteFrom + 1)));
    const m = mobs.spawnMob(sim, kind, undefined, plot.i, { lv, pack: false, hm, dm, elite, ...(at ?? {}) });
    if (!m) return null;
    if (sp.first && who && sp.sec !== undefined) sim.toast(who.id, `A wave comes from the ${SECTORS[sp.sec]}`, 'k_skull', PAL.berry);
    m.rd = [sp.rx, sp.ry];
    sim.touch(m);
    return m;
}

/** A spot near (x, y), spread a little along the front; the spot itself when every try is blocked. */
function spread (sim: Sim, x: number, y: number): { x: number; y: number } {
    for (let tries = 0; tries < 6; tries++) {
        const sx = x + (sim.rng.next() - 0.5) * 6 * TILE, sy = y + (sim.rng.next() - 0.5) * 6 * TILE;
        if (!sim.world.boxBlocked(sx, sy, 3, 2)) return { x: sx, y: sy };
    }
    return { x, y };
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
