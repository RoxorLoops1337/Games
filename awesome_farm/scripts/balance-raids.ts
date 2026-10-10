// Raid probe: a night at a base with a Blight nest 4 plots away, at nest levels 1..15 with a farmer of the level someone would be by then,
// alone (a simple fighter that stays at its campfire) and with a few towers. Prints how many raiders come, how tough they are, what they cost
// the farmer (hearts, falls) and what they break. Meant to show a curve that rises gently, not a cliff.
//   npx tsx scripts/balance-raids.ts [runsPerCell]

import { TILE, TUNING } from '../src/shared/config';
import { nightCount } from '../src/shared/data/mobs';
import * as blight from '../src/shared/sim/blight';
import * as clock from '../src/shared/sim/clock';
import { Sim } from '../src/shared/sim/sim';
import { derived } from '../src/shared/sim/stats';
import type { BuildE, MobE, NodeE, PlayerS } from '../src/shared/sim/types';

const STEP = 1 / 20;
const RUNS = Number(process.argv[2] ?? 4);

/** (nest level, the farmer's level, weapon, armour, vitality ranks) as a typical run would have them at about that night. */
const STAGES: [number, number, string, string | null, number][] = [
    [0, 5, 'sword_iron', null, 1], [0, 12, 'sword_steel', 'plate_steel', 5], [0, 24, 'sword_crystal', 'plate_crystal', 6],
    [1, 5, 'sword_iron', null, 1], [2, 7, 'sword_iron', 'mail_iron', 2], [3, 9, 'sword_iron', 'mail_iron', 3], [5, 12, 'sword_steel', 'plate_steel', 5],
    [8, 17, 'sword_steel', 'plate_steel', 6], [12, 24, 'sword_crystal', 'plate_crystal', 6], [15, 30, 'sword_pharaoh', 'plate_colossus', 6],
];

function night (seed: string, nestLv: number, level: number, weapon: string, body: string | null, vit: number, towers: number) {
    const sim = Sim.create(seed, 'bal');
    sim.cheats = true;
    for (const p of sim.s.plots) if (p.blight === 1) { const n = Object.values(sim.s.ents).find((e): e is NodeE => e.k === 'node' && e.kind === 'nest' && e.plot === p.i); if (n) sim.remove(n.id); p.blight = undefined; delete p.nl; delete p.nk; }
    sim.world.recompute();
    const p = sim.join('p0', 'P0')!;
    p.level = level;
    p.equip = { tool: 'pick_flint', weapon: weapon as never, ...(body ? { body: body as never } : {}) };
    p.skills = { c_vit: vit, c_skin: Math.min(4, vit), c_edge: Math.min(4, Math.floor(level / 6)) };
    p.inv.potion_heal = 6;
    p.hearts = derived(p).maxHearts;
    const h = sim.homePlot(p.slot);
    const plot = sim.world.plot(h.gx + 4, h.gy)!;
    if (nestLv > 0) { blight.raise(sim, plot, 'swarm'); plot.nl = nestLv; }
    const c = sim.world.plotCenter(h);
    p.x = c.x; p.y = c.y;
    let built = 0;
    for (let k = 0; k < towers; k++) {
        const spot = sim.nearestFree(Math.floor(c.x / TILE) + 3 + k * 2, Math.floor(c.y / TILE) + (k % 2 ? -3 : 3), 6);
        if (!spot) continue;
        sim.give(p, 'plank', 20); sim.give(p, 'rope', 10); sim.give(p, 'stone', 30);
        p.skills.c_towers = 1;
        sim.command('p0', { t: 'build', kind: 'tower_archer', tx: spot.tx, ty: spot.ty, rot: 0 });
        built++;
    }
    sim.s.clock = TUNING.dayLength - 0.1;
    sim.step(STEP); sim.step(STEP);
    const mobsAll = () => Object.values(sim.s.ents).filter((e): e is MobE => e.k === 'mob');
    let hearts0 = p.hearts, lost = 0, falls = 0, seen = new Set<number>(), hp = 0, maxLv = 0;
    const bld0 = Object.values(sim.s.ents).filter((e) => e.k === 'bld').length;
    for (let t = 0; t < (TUNING.nightLength + 20) * 20 && sim.s.night !== false; t++) {
        if (p.downed > 0) { p.downed = 0; p.hearts = derived(p).maxHearts; falls++; }
        // a simple fighter: stands at the fire, hits what comes within reach, drinks when low
        const d = derived(p);
        let best: MobE | null = null, bd = 70;
        for (const m of mobsAll()) { const dd = Math.hypot(m.x - p.x, m.y - p.y); if (dd < bd) { bd = dd; best = m; } }
        if (p.hearts <= 1.5 && (p.inv.potion_heal ?? 0) > 0) sim.command('p0', { t: 'eat', item: 'potion_heal' });
        if (best) {
            const reach = Math.max(d.reach, d.weapon.reach) - 4;
            if (bd > reach) { const dx = best.x - p.x, dy = best.y - p.y, l = Math.max(1, Math.hypot(dx, dy)); sim.command('p0', { t: 'move', x: p.x + (dx / l) * d.speed * STEP, y: p.y + (dy / l) * d.speed * STEP, fx: dx / l, fy: dy / l, moving: true }); }
            else sim.command('p0', { t: 'swing', id: best.id });
        }
        p.energy = Math.max(p.energy, 40);
        const before = p.hearts;
        sim.step(STEP);
        if (p.hearts < before) lost += before - p.hearts;
        for (const m of mobsAll()) if (m.rd && !seen.has(m.id)) { seen.add(m.id); hp += m.mhp; maxLv = Math.max(maxLv, m.lv ?? 0); }
    }
    const bldN = Object.values(sim.s.ents).filter((e) => e.k === 'bld').length;
    return { raiders: seen.size, hp: Math.round(hp), lost: Math.round(lost * 10) / 10, falls, broke: Math.max(0, bld0 - bldN), maxHearts: d(p), built };
}
const d = (p: PlayerS) => derived(p).maxHearts;

console.log('nest lv  farmer lv  towers   raiders   avg raider hp   hearts lost (of max)   falls   buildings lost');
for (const towers of [0, 3]) {
    for (const [nl, lv, w, b, vit] of STAGES) {
        let r = 0, hp = 0, lost = 0, falls = 0, broke = 0, mh = 0;
        for (let i = 0; i < RUNS; i++) { const x = night(`RAID-${nl}-${towers}-${i}`, nl, lv, w, b, vit, towers); r += x.raiders; hp += x.hp; lost += x.lost; falls += x.falls; broke += x.broke; mh = x.maxHearts; }
        console.log(`${String(nl).padStart(6)}   ${String(lv).padStart(8)}   ${String(towers).padStart(6)}   ${(r / RUNS).toFixed(1).padStart(7)}   ${String(Math.round(hp / Math.max(1, r))).padStart(13)}   ${(lost / RUNS).toFixed(1).padStart(10)} (of ${mh})        ${(falls / RUNS).toFixed(1).padStart(5)}   ${(broke / RUNS).toFixed(1).padStart(8)}`);
    }
}
void nightCount;
