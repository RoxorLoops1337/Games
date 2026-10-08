// Machines (sim/machines.ts): furnaces and their fuel, garden beds and the weather, assemblers, and loading and collecting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { CROPS } from '../src/shared/data/buildings';
import { FUEL } from '../src/shared/data/items';
import { RECIPES } from '../src/shared/data/recipes';
import { seasonDef } from '../src/shared/season';
import { OUT_CAP } from '../src/shared/sim/machines';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, SimEvent } from '../src/shared/sim/types';
import { rainPlan, weatherAt } from '../src/shared/weather';

const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };
const events = (sim: Sim) => { const e = sim.events; sim.events = []; return e; };
const floats = (ev: SimEvent[]) => ev.filter((e) => e.e === 'float').map((e) => (e as { text: string }).text);
const fxNames = (ev: SimEvent[]) => ev.filter((e) => e.e === 'fx').map((e) => (e as { fx: string }).fx);

/** A cleared home island with the farmer standing six tiles in from its corner; what is put down at (6, 4) is within reach. */
function yard (seed: string) {
    const sim = Sim.create(seed, 'mach');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;
    events(sim);
    return { sim, p, o };
}
const put = (sim: Sim, kind: BuildE['kind'], tx: number, ty: number, extra: Partial<BuildE> = {}) => sim.add<BuildE>({ k: 'bld', kind, tx, ty, rot: 0, by: 'a', ...extra });
const furnace = (sim: Sim, tx: number, ty: number, extra: Partial<BuildE> = {}) => put(sim, 'furnace', tx, ty, { inv: {}, out: {}, fin: {}, fuel: 0, prog: 0, ...extra });
const BAR = RECIPES['furnace:ironbar'].time;

test('a furnace smelts a bar every recipe time once it has ore and fuel, lights the longest-burning fuel first, and pays its owner', () => {
    const { sim, p, o } = yard('MACH-furnace');
    const f = furnace(sim, o.tx + 6, o.ty + 4, { inv: { iron: 3 } });
    run(sim, 5);
    assert.equal(f.out!.ironbar ?? 0, 0, 'ore but no fire: nothing');
    assert.equal(f.inv!.iron, 3);
    f.fin = { wood: 1, coal: 1 };
    run(sim, STEP);
    assert.deepEqual(f.fin, { wood: 1 }, 'the coal went in first');
    assert.ok(Math.abs(f.fuel! - (FUEL.coal! - STEP)) < 1e-9, 'fifty seconds of burn, less this step');
    run(sim, BAR + 0.1 - STEP);
    assert.equal(f.out!.ironbar, 1, `a bar after ${BAR} seconds`);
    assert.equal(f.inv!.iron, 2);
    assert.equal(sim.s.prod?.ironbar, 1, 'the world counts what machines make');
    assert.equal(p.xp, RECIPES['furnace:ironbar'].xp, 'the owner is paid');
    assert.ok(fxNames(events(sim)).includes('smelt'));
    run(sim, BAR + 0.1);
    assert.equal(f.out!.ironbar, 2);
    assert.ok(f.fuel! > FUEL.coal! - 2 * BAR - 0.5 && f.fuel! < FUEL.coal! - 2 * BAR + 0.5, 'the fuel burns down second by second');
    run(sim, BAR + 0.1);
    assert.equal(f.out!.ironbar, 3);
    assert.deepEqual(f.inv, {}, 'the ore is used up');
    assert.equal(f.rcp, undefined, 'and the furnace is idle');
});

test('the output tray holds two hundred of a thing; a full tray stops that recipe', () => {
    const { sim, o } = yard('MACH-cap');
    const f = furnace(sim, o.tx + 6, o.ty + 4, { inv: { iron: 5 }, fin: { coal: 5 }, out: { ironbar: OUT_CAP } });
    run(sim, 10);
    assert.equal(f.out!.ironbar, OUT_CAP);
    assert.equal(f.inv!.iron, 5, 'no ore was spent');
    assert.equal(f.rcp, undefined);
    f.out!.ironbar = OUT_CAP - 1;
    run(sim, BAR + 0.2);
    assert.equal(f.out!.ironbar, OUT_CAP, 'one more fits');
    assert.equal(f.inv!.iron, 4);
    run(sim, BAR + 0.2);
    assert.equal(f.inv!.iron, 4, 'then it waits again');
});

test('a keeper’s stoking and Hot Fire speed a furnace up; Efficient Burn stretches every piece of fuel', () => {
    const { sim, p, o } = yard('MACH-speed');
    const plain = furnace(sim, o.tx + 6, o.ty + 4, { inv: { iron: 3 }, fin: { coal: 2 } });
    const stoked = furnace(sim, o.tx + 8, o.ty + 4, { inv: { iron: 3 }, fin: { coal: 2 }, boost: sim.s.time + 60, bs: 0.5 });
    run(sim, BAR / 1.5 + 0.15);
    assert.equal(plain.out!.ironbar ?? 0, 0, 'the plain furnace is still at it');
    assert.equal(stoked.out!.ironbar, 1, 'the stoked one is half as fast again');
    p.skills.i_smelt = 4;                                          // +60% furnace speed
    const hot = furnace(sim, o.tx + 10, o.ty + 4, { inv: { iron: 3 }, fin: { coal: 2 } });
    run(sim, BAR / 1.6 + 0.15);
    assert.equal(hot.out!.ironbar, 1, 'Hot Fire smelts in two seconds');
    p.skills.i_fuel = 4;                                           // +48% burn time
    const thrifty = furnace(sim, o.tx + 12, o.ty + 4, { inv: { iron: 1 }, fin: { coal: 1 } });
    run(sim, STEP);
    assert.ok(Math.abs(thrifty.fuel! - (FUEL.coal! * 1.48 - STEP)) < 1e-9, `a coal lasts ${thrifty.fuel} seconds`);
});

test('a garden bed is planted from the pocket, grows a stage every stage time (quicker in spring) and harvests the table’s yield', () => {
    const { sim, p, o } = yard('MACH-bed');
    assert.equal(sim.s.day, 1);
    const bed = put(sim, 'bed', o.tx + 6, o.ty + 4, { crop: -1 });
    sim.command('a', { t: 'use', id: bed.id });
    assert.ok(floats(events(sim)).includes('Needs seeds'));
    sim.give(p, 'seed_wheat', 2);
    sim.command('a', { t: 'use', id: bed.id });
    const ev = events(sim);
    assert.equal(bed.crop, 0);
    assert.equal(bed.plant, 'seed_wheat');
    assert.equal(bed.by, 'a');
    assert.equal(countOf(p, 'seed_wheat'), 1, 'one seed went in');
    assert.equal(p.xp, 1);
    assert.ok(fxNames(ev).includes('plant'));
    sim.command('a', { t: 'use', id: bed.id });
    assert.ok(floats(events(sim)).includes('Growing…'));
    assert.equal(countOf(p, 'seed_wheat'), 1, 'a growing bed takes no seed');
    const stage = CROPS.seed_wheat!.stageSecs / seasonDef(1).grow;        // spring: a quarter faster, no rain on the first day
    run(sim, stage - 0.6);
    assert.equal(bed.crop, 0);
    run(sim, 0.8);
    assert.equal(bed.crop, 1, 'a sprout');
    run(sim, stage + 0.2);
    assert.equal(bed.crop, 2, 'ripe');
    const before = sim.ents('drop').length;
    sim.command('a', { t: 'use', id: bed.id });
    const wheat = sim.ents('drop').filter((d) => d.res === 'wheat').length;
    assert.ok(wheat >= CROPS.seed_wheat!.yield[0] && wheat <= CROPS.seed_wheat!.yield[1], `the table’s yield: ${wheat}`);
    assert.ok(sim.ents('drop').every((d) => d.res === 'wheat' || d.res === 'seed_wheat'), 'wheat, and sometimes the seed back');
    assert.ok(sim.ents('drop').length - before <= wheat + 1);
    assert.equal(bed.crop, -1);
    assert.equal(bed.plant, undefined);
    assert.equal(p.xp, 1 + CROPS.seed_wheat!.xp);
    assert.equal(p.stats.harvested, 1);
    assert.ok(fxNames(events(sim)).includes('harvestCrop'));
    assert.equal(sim.s.day, 1, 'all within the first day');
});

test('rain, the season, Green Thumb and the owner all change how fast a bed grows', () => {
    /** How far a wheat bed grows in one second of a given day and hour, with the clock held still. */
    const growth = (day: number, clock: number, skills: Record<string, number> = {}, owned = true) => {
        const { sim, p, o } = yard(`MACH-grow-${day}-${clock}`);
        Object.assign(p.skills, skills);
        const bed = put(sim, 'bed', o.tx + 6, o.ty + 4, { crop: 0, plant: 'seed_wheat', growT: 0, by: owned ? 'a' : undefined });
        sim.s.day = day;
        for (let i = 0; i < 20; i++) { sim.s.clock = clock; sim.s.night = false; sim.step(STEP); }
        return bed.growT!;
    };
    const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} against ${b}`);
    near(growth(1, 10), seasonDef(1).grow, 'a dry spring hour');
    near(growth(8, 10), seasonDef(8).grow, 'summer');
    near(growth(15, 10), seasonDef(15).grow, 'autumn');
    near(growth(22, 10), seasonDef(22).grow, 'winter');
    assert.ok(seasonDef(22).grow < seasonDef(1).grow * 0.5, 'winter is less than half of spring');
    // a downpour: half as fast again
    let rainy = 0, at = 0;
    for (let d = 2; d < 400 && !rainy; d++) { const plan = rainPlan('MACH-grow-seed', d); if (plan?.heavy) { rainy = d; at = plan.start + plan.len / 2; } }
    assert.ok(rainy, 'a stormy day exists');
    assert.equal(weatherAt('MACH-grow-seed', rainy, at).rain, 1, 'in the thick of it');
    const sim = Sim.create('MACH-grow-seed', 'mach');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    const bed = put(sim, 'bed', o.tx + 6, o.ty + 4, { crop: 0, plant: 'seed_wheat', growT: 0, by: 'a' });
    sim.s.day = rainy;
    for (let i = 0; i < 20; i++) { sim.s.clock = at; sim.s.night = false; sim.step(STEP); }
    near(bed.growT!, seasonDef(rainy).grow * (1 + TUNING.rainGrow), 'rain');
    // Green Thumb, and a bed nobody owns
    near(growth(1, 10, { f_thumb: 5 }), seasonDef(1).grow * 1.6, 'Green Thumb at the top');
    near(growth(1, 10, { f_thumb: 5 }, false), seasonDef(1).grow, 'a bed with no owner grows at the base rate');
});

test('a bed whose seed is gone clears itself', () => {
    const { sim, o } = yard('MACH-badbed');
    const bed = put(sim, 'bed', o.tx + 6, o.ty + 4, { crop: 1, plant: undefined, growT: 3 });
    sim.step(STEP);
    assert.equal(bed.crop, -1);
});

test('an assembler builds only the recipe it is set to, takes only its parts, and needs the recipe’s unlock', () => {
    const { sim, p, o } = yard('MACH-asm');
    const asm = put(sim, 'assembler', o.tx + 6, o.ty + 3, { inv: {}, out: {}, fuel: 0, prog: 0 });
    put(sim, 'pole', o.tx + 9, o.ty + 5);
    put(sim, 'windturbine', o.tx + 10, o.ty + 6); put(sim, 'windturbine', o.tx + 10, o.ty + 8);
    sim.give(p, 'ironbar', 6);
    sim.command('a', { t: 'xfer', id: asm.id, item: 'ironbar', n: 6, dir: 'put' });
    assert.ok(floats(events(sim)).includes("That doesn't go in here"), 'no recipe chosen: it takes nothing');
    sim.command('a', { t: 'config', id: asm.id, sel: 'furnace:ironbar' });
    assert.equal(asm.sel, undefined, 'a furnace recipe is not for an assembler');
    sim.command('a', { t: 'config', id: asm.id, sel: 'assembler:gear' });
    assert.equal(asm.sel, 'assembler:gear');
    sim.command('a', { t: 'xfer', id: asm.id, item: 'ironbar', n: 6, dir: 'put' });
    assert.deepEqual(asm.inv, { ironbar: 6 });
    run(sim, 2.6);
    assert.equal(asm.out!.gear, 1, 'a gear in two seconds');
    run(sim, 6);
    assert.equal(asm.out!.gear, 3);
    assert.deepEqual(asm.inv, {});
    assert.equal(sim.s.prod?.gear, 3);
    // choosing again hands back whatever was half-loaded
    asm.inv = { ironbar: 1 };
    sim.command('a', { t: 'config', id: asm.id, sel: '' });
    assert.equal(asm.sel, undefined);
    assert.equal(countOf(p, 'gear'), 3);
    assert.equal(countOf(p, 'ironbar'), 1);
    assert.deepEqual([asm.inv, asm.out], [{}, {}]);
    // a recipe behind Engineering waits for the skill
    sim.command('a', { t: 'config', id: asm.id, sel: 'assembler:circuit' });
    asm.inv = { wire: 3, ironbar: 1, glass: 1 };
    run(sim, 6);
    assert.equal(asm.out!.circuit ?? 0, 0, 'circuits need Engineering');
    p.skills.i_eng = 1;
    run(sim, 6);
    assert.equal(asm.out!.circuit, 1);
});

test('Load everything useful fills a furnace with the ingredients of unlocked recipes and the best fuel; Collect empties the tray', () => {
    const { sim, p, o } = yard('MACH-load');
    const f = furnace(sim, o.tx + 6, o.ty + 4);
    sim.give(p, 'iron', 10); sim.give(p, 'sand', 5); sim.give(p, 'coal', 30); sim.give(p, 'ironbar', 4); sim.give(p, 'wood', 3);
    sim.command('a', { t: 'load', id: f.id });
    assert.deepEqual({ ...f.inv }, { iron: 10, sand: 5 }, 'ore and sand, not the bars of a locked steel recipe');
    assert.deepEqual({ ...f.fin }, { coal: 20 }, 'twenty of the best fuel');
    assert.equal(countOf(p, 'coal'), 10);
    assert.equal(countOf(p, 'wood'), 3, 'the wood stays: coal burns longer');
    assert.ok(fxNames(events(sim)).includes('load'));
    sim.command('a', { t: 'load', id: f.id });
    assert.ok(floats(events(sim)).includes('Nothing to load'));
    p.skills.i_smith2 = 1;
    sim.command('a', { t: 'load', id: f.id });
    assert.equal(f.inv!.ironbar, 4, 'with Steelwork the bars go in too');
    assert.equal(f.fin!.coal, 20, 'the fuel slot was full enough');
    f.out = { ironbar: 5, glass: 2 };
    sim.command('a', { t: 'collect', id: f.id });
    assert.equal(countOf(p, 'ironbar'), 5);
    assert.equal(countOf(p, 'glass'), 2);
    assert.deepEqual(f.out, {});
    assert.ok(floats(events(sim)).includes('+7 collected'));
    sim.command('a', { t: 'collect', id: f.id });
    assert.ok(floats(events(sim)).includes('Nothing to collect'));
    sim.give(p, 'glass', TUNING.baseCarry - 2);
    f.out = { glass: 1 };
    sim.command('a', { t: 'collect', id: f.id });
    assert.ok(floats(events(sim)).includes('Your pockets are full'));
    assert.equal(f.out!.glass, 1);
});
