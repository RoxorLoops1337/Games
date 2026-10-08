// A world saved to JSON and loaded again must keep everything and keep running.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import { petsOf } from '../src/shared/sim/creatures';
import { qsOf } from '../src/shared/sim/quests';
import type { BuildE, CritE, MobE, NodeE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };

test('a busy world survives a save and load, and keeps simulating', () => {
    const sim = Sim.create('P-1', 'p');
    sim.cheats = true;
    const p = sim.join('a', 'A')!;
    const q = sim.join('b', 'B')!;
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 9) * TILE; p.hearts = 99;
    q.x = p.x + 20; q.y = p.y; q.hearts = 99;
    sim.command('a', { t: 'devdo', op: 'skills' });
    for (const item of ['sigil_slime', 'pod', 'plank', 'ironbar', 'gear', 'wire', 'circuit', 'stone', 'brick', 'rope', 'wood', 'glass', 'treat'] as const) sim.command('a', { t: 'devdo', op: 'item', id: item, n: 60 });
    // factory
    const pole = sim.add<BuildE>({ k: 'bld', kind: 'pole', tx: o.tx + 5, ty: o.ty + 3, rot: 0 });
    sim.add<BuildE>({ k: 'bld', kind: 'windturbine', tx: o.tx + 7, ty: o.ty + 2, rot: 0 });
    const plot = sim.world.plotAt(o.tx + 3, o.ty + 3)!;
    plot.veins = [[o.tx + 2, o.ty + 3, 'iron'], [o.tx + 3, o.ty + 3, 'iron'], [o.tx + 2, o.ty + 4, 'iron'], [o.tx + 3, o.ty + 4, 'iron']];
    sim.add<BuildE>({ k: 'bld', kind: 'drill', tx: o.tx + 2, ty: o.ty + 3, rot: 0, out: {}, prog: 0 });
    sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: o.tx + 4, ty: o.ty + 3, rot: 0, inv: {} });
    // a boss, a den with a worker, a companion, wild life, a node
    const altar = sim.add<BuildE>({ k: 'bld', kind: 'altar', tx: o.tx + 8, ty: o.ty + 6, rot: 0 });
    sim.command('a', { t: 'summon', id: altar.id, boss: 'slime' });
    const den = sim.add<BuildE>({ k: 'bld', kind: 'den', tx: o.tx + 1, ty: o.ty + 7, rot: 0, inv: {} });
    p.pets = [{ id: 'p1', sp: 'gnaw', name: 'G', lv: 4, xp: 0, traits: ['lucky'] }, { id: 'p2', sp: 'hopper', name: 'H', lv: 3, xp: 0, traits: [] }];
    sim.command('a', { t: 'pet', op: 'assign', pet: 'p1', den: den.id });
    sim.command('a', { t: 'pet', op: 'companion', pet: 'p2' });
    sim.add<NodeE>({ k: 'node', kind: 'tree', tx: o.tx + 9, ty: o.ty + 9, hp: 3, plot: plot.i });
    sim.s.shop = undefined;
    run(sim, 30);
    qsOf(p).ch = 3;
    void pole;

    const json = JSON.stringify(sim.s);
    const copy = new Sim(JSON.parse(json));
    assert.equal(copy.s.tick, sim.s.tick);
    assert.equal(Object.keys(copy.s.ents).length, Object.keys(sim.s.ents).length, 'every entity came back');
    assert.deepEqual(copy.s.players.a.inv, sim.s.players.a.inv, 'inventory intact');
    assert.equal(petsOf(copy.s.players.a).length, 2);
    assert.equal(qsOf(copy.s.players.a).ch, 3);
    // the loaded world's grid agrees with its entities (occupancy is rebuilt, not saved)
    for (const e of Object.values(copy.s.ents)) if (e.k === 'node') assert.equal(copy.world.occAt(e.tx, e.ty), e.id);
    // players are offline after loading; they come back and play on
    for (const id of ['a', 'b']) assert.equal(copy.s.players[id].online, false);
    copy.join('a', 'A'); copy.join('b', 'B');
    copy.s.players.a.hearts = copy.s.players.b.hearts = 99;
    for (let t = 0; t < 120; t += STEP) { copy.s.players.a.hearts = copy.s.players.b.hearts = 99; copy.step(STEP); }
    const dens = copy.buildings('den')[0];
    assert.ok(dens, 'the den is still there');
    assert.ok(Object.values(copy.s.ents).some((e): e is CritE => e.k === 'crit' && e.mode === 2), 'the worker is back at work');
    assert.ok(Object.values(copy.s.ents).some((e): e is MobE => e.k === 'mob' && e.kind === 'slimeking') || copy.s.bosses?.slime, 'the boss fight carried on');
    assert.ok(countOf(copy.s.players.a, 'plank') >= 50);
});
