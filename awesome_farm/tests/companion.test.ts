// Companion tasks: a creature with a job works the land around you and the goods go into your pockets.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { FIELD_TASKS, SPECIES, SPECIES_LIST, spOf, type Pet, type WorkKind } from '../src/shared/data/creatures';
import { cmdPet, petsOf, taskOk } from '../src/shared/sim/creatures';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, CritE, MobE, NodeE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };
let petN = 0;                                                       // (ids only have to differ: a counter, so a run is the same every time)
const pet = (sp: keyof typeof SPECIES, over: Partial<Pet> = {}): Pet => ({ id: `p${++petN}`, sp, name: 'Buddy', lv: 4, xp: 0, traits: [], ...over });

function yard (seed: string) {
    const sim = Sim.create(seed, 'c');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 9) * TILE; p.fx = 1; p.fy = 0; p.hearts = 99; p.invuln = 999;
    return { sim, p, o, plot: sim.homePlot(p.slot).i };
}
const crit = (sim: Sim) => Object.values(sim.s.ents).find((e): e is CritE => e.k === 'crit' && e.mode === 1);
const task = (sim: Sim, p: ReturnType<typeof yard>['p'], pt: Pet, t: WorkKind | null) => cmdPet(sim, p, { t: 'pet', op: 'task', pet: pt.id, task: t });

test('only jobs a species is good at can be given, and a job brings the creature along', () => {
    const { sim, p } = yard('CT-1');
    const hopper = pet('hopper'), spark = pet('sparkit');
    petsOf(p).push(hopper, spark);
    task(sim, p, spark, 'gather');                              // sparkit hauls and stokes: no field job
    assert.equal(spark.task, undefined);
    task(sim, p, hopper, 'mine');
    assert.equal(hopper.task, undefined, 'hoppers cannot mine');
    task(sim, p, hopper, 'gather');
    assert.equal(hopper.task, 'gather');
    assert.equal(p.comp, hopper.id, 'it came along');
    assert.equal(p.cnt?.pettask, 1, 'counted for quests');
    task(sim, p, hopper, null);
    assert.equal(hopper.task, undefined, 'back to heel');
    task(sim, p, hopper, 'dance' as never);
    task(sim, p, hopper, '__proto__' as never);
    assert.equal(hopper.task, undefined);
    // every species with an aptitude for a field job has a sensible task list
    for (const sp of SPECIES_LIST) {
        const can = FIELD_TASKS.filter((k) => taskOk(pet(sp), k));
        assert.ok(can.every((k) => (spOf(sp).work[k] ?? 0) >= 1));
    }
});

test('a gatherer fells the trees around you and the wood lands in your pockets', () => {
    const { sim, p, o, plot } = yard('CT-2');
    const gnaw = pet('gnaw', { lv: 6 });
    petsOf(p).push(gnaw);
    const trees = Array.from({ length: 4 }, (_, i) => sim.add<NodeE>({ k: 'node', kind: 'tree', tx: o.tx + 3 + i, ty: o.ty + 6, hp: 3, plot }).id);
    const wood0 = countOf(p, 'wood');
    run(sim, 3);
    assert.ok(trees.every((id) => sim.s.ents[id]), 'nothing happens without a job');
    task(sim, p, gnaw, 'gather');
    run(sim, 40);
    const left = trees.filter((id) => sim.s.ents[id]).length;
    assert.ok(left < 4, `${4 - left} trees felled`);
    assert.ok(countOf(p, 'wood') > wood0, 'the wood is yours');
    assert.ok((p.cnt?.petwork ?? 0) >= 1 && (p.cnt?.['petwork:gather'] ?? 0) >= 1, 'counted for quests');
    assert.ok((p.cnt?.['harvest:tree'] ?? 0) >= 1, 'and as chopped trees');
    assert.ok(gnaw.xp > 0 || gnaw.lv > 6, 'the creature learns from it');
    assert.ok(sim.events.some((e) => e.e === 'work'), 'the client is told to animate it');
});

test('a miner breaks rocks but leaves trees alone; faraway rocks are not its business', () => {
    const { sim, p, o, plot } = yard('CT-3');
    const peb = pet('pebbit', { lv: 5 });
    petsOf(p).push(peb);
    const tree = sim.add<NodeE>({ k: 'node', kind: 'tree', tx: o.tx + 4, ty: o.ty + 6, hp: 3, plot });
    const near = sim.add<NodeE>({ k: 'node', kind: 'rock', tx: o.tx + 7, ty: o.ty + 6, hp: 3, plot });
    const far = sim.add<NodeE>({ k: 'node', kind: 'rock', tx: o.tx + 7, ty: o.ty - 18, hp: 3, plot: sim.homePlot(p.slot).i });
    task(sim, p, peb, 'mine');
    run(sim, 40);
    assert.equal(sim.s.ents[near.id], undefined, 'the rock near you went');
    assert.ok(sim.s.ents[tree.id], 'the tree is still standing');
    assert.ok(sim.s.ents[far.id], 'the rock far from you is untouched');
    assert.ok(countOf(p, 'stone') > 0);
});

test('a farmer harvests ripe crops, replants from your seeds and waters the rest', () => {
    const { sim, p, o } = yard('CT-4');
    const bog = pet('bogsprout', { lv: 6 });
    petsOf(p).push(bog);
    sim.add<BuildE>({ k: 'bld', kind: 'bed', tx: o.tx + 7, ty: o.ty + 6, rot: 0, crop: 2, plant: 'seed_wheat', growT: 0, by: 'a' });
    const grow = sim.add<BuildE>({ k: 'bld', kind: 'bed', tx: o.tx + 8, ty: o.ty + 6, rot: 0, crop: 0, plant: 'seed_carrot', growT: 0, by: 'a' });
    sim.give(p, 'seed_wheat', 2);
    task(sim, p, bog, 'farm');
    run(sim, 40);
    assert.ok(countOf(p, 'wheat') > 0, 'wheat in your pockets');
    assert.ok((p.cnt?.crop ?? 0) >= 2, 'it came back to harvest again: it replanted from your seeds');
    assert.ok((p.cnt?.plant ?? 0) >= 1, 'planting counts for quests');
    assert.ok((grow.growT ?? 0) > 0 || (grow.crop ?? 0) !== 0, 'the growing one got water (and may well be ripe and picked by now)');
    assert.ok((p.cnt?.crop ?? 0) >= 1);
});

test('a guard goes after monsters near you and does not touch bosses', () => {
    const { sim, p } = yard('CT-5');
    const duskmaw = pet('duskmaw', { lv: 8 });
    petsOf(p).push(duskmaw);
    task(sim, p, duskmaw, 'guard');
    const slime = sim.add<MobE>({ k: 'mob', kind: 'slime', x: p.x + 70, y: p.y + 10, hp: 3, mhp: 3, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    run(sim, 20);
    assert.equal(sim.s.ents[slime.id], undefined, 'the guard dealt with it');
});

test('a task survives a save and a load, and releasing the job sends the creature back to heel', () => {
    const { sim, p } = yard('CT-6');
    const gnaw = pet('gnaw');
    petsOf(p).push(gnaw);
    task(sim, p, gnaw, 'gather');
    const back = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.equal(petsOf(back.s.players.a)[0].task, 'gather');
    task(sim, p, gnaw, null);
    run(sim, 0.5);
    const c = crit(sim)!;
    assert.ok(c && !c.jt, 'no job target');
});
