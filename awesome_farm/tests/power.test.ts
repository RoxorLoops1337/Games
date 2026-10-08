// The power grid (sim/power.ts, stepped by sim/factory.ts): poles, nets, satisfaction, batteries, solar and wind.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { sunlight } from '../src/shared/daylight';
import { BUILDINGS } from '../src/shared/data/buildings';
import { buildPowerGraph, netStats, SUPPLY, WIRE_RANGE, wind } from '../src/shared/sim/power';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };

/** A cleared home island; the farmer stands six tiles in from its corner. */
function yard (seed: string) {
    const sim = Sim.create(seed, 'pow');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;
    return { sim, p, o };
}
const put = (sim: Sim, kind: BuildE['kind'], tx: number, ty: number, extra: Partial<BuildE> = {}) => sim.add<BuildE>({ k: 'bld', kind, tx, ty, rot: 0, by: 'a', ...extra });
const chest = (sim: Sim, tx: number, ty: number, inv: BuildE['inv'] = {}) => put(sim, 'chest', tx, ty, { inv });
const graph = (sim: Sim) => buildPowerGraph(sim.buildings());
/** A chest, an inserter and a chest in a row: a consumer with something to do. */
function mover (sim: Sim, tx: number, ty: number) {
    const src = chest(sim, tx, ty, { wood: 20 });
    const ins = put(sim, 'inserter', tx + 1, ty);
    const dst = chest(sim, tx + 2, ty);
    return { src, ins, dst };
}

test('a turbine powers a consumer through a pole; with no pole in reach the consumer is an orphan and gets nothing', () => {
    const { sim, o } = yard('POW-1');
    const { ins, dst } = mover(sim, o.tx + 2, o.ty + 2);
    run(sim, 1);
    assert.ok(graph(sim).orphans.some((b) => b.id === ins.id), 'nothing wires it');
    assert.equal(ins.pw ?? 0, 0);
    const pole = put(sim, 'pole', o.tx + 3, o.ty + 4);
    const turbine = put(sim, 'windturbine', o.tx + 5, o.ty + 5);
    run(sim, 1);
    const g = graph(sim);
    assert.equal(g.nets.length, 1);
    assert.deepEqual(new Set(g.nets[0].members.map((b) => b.id)), new Set([ins.id, turbine.id]));
    assert.equal(g.orphans.length, 0);
    assert.equal(ins.pw, 1, 'three units wanted, a turbine’s worth made');
    run(sim, 10);
    assert.ok((dst.inv!.wood ?? 0) >= 5, 'and the arm swings');
    sim.remove(pole.id);
    run(sim, 1);
    assert.equal(ins.pw, 0, 'the pole is gone: no power');
    assert.ok(graph(sim).orphans.some((b) => b.id === ins.id));
});

test('poles link within seven tiles and reach machines whose footprint touches their three-tile square', () => {
    const { sim, o } = yard('POW-2');
    const x = o.tx + 6, y = o.ty + 6;
    const a = put(sim, 'pole', x, y), b = put(sim, 'pole', x + WIRE_RANGE, y);
    let g = graph(sim);
    assert.equal(g.nets.length, 1, 'exactly the range is a link');
    assert.equal(g.links.length, 1);
    const c = put(sim, 'pole', x, y + WIRE_RANGE + 1);
    g = graph(sim);
    assert.equal(g.nets.length, 2, 'one tile past it is not');
    assert.deepEqual(g.netOf.get(c.id)?.poles.map((p) => p.id), [c.id]);
    const d = put(sim, 'pole', x - 5, y - 5);                      // 7.07 tiles from the first: too far, by a whisker
    g = graph(sim);
    assert.equal(g.nets.length, 3);
    assert.equal(g.netOf.get(a.id), g.netOf.get(b.id));
    assert.notEqual(g.netOf.get(a.id), g.netOf.get(d.id));
    sim.remove(d.id);
    // a machine three tiles from a pole is wired; four tiles is not; a wide footprint only has to touch the square
    const near = put(sim, 'inserter', x, y + SUPPLY);
    const far = put(sim, 'inserter', x, y + SUPPLY + 1);
    const wide = put(sim, 'drill', x - SUPPLY - 1, y - 1, { out: {} });        // its right column stands on x - 3
    const wider = put(sim, 'drill', x - SUPPLY - 2, y + 1, { out: {} });       // its right column stands on x - 4
    g = graph(sim);
    assert.equal(g.netOf.get(near.id), g.netOf.get(a.id));
    assert.ok(g.orphans.some((m) => m.id === far.id));
    assert.equal(g.netOf.get(wide.id), g.netOf.get(a.id), 'touching the square is enough');
    assert.ok(g.orphans.some((m) => m.id === wider.id));
});

test('when demand beats supply every machine on the net gets the same share, and works exactly that much slower', () => {
    const { sim, o } = yard('POW-3');
    const asm = put(sim, 'assembler', o.tx + 2, o.ty + 2, { inv: { ironbar: 40 }, out: {}, fuel: 0, prog: 0, sel: 'assembler:gear' });
    put(sim, 'pole', o.tx + 4, o.ty + 4);
    const turbine = put(sim, 'windturbine', o.tx + 5, o.ty + 5);
    const ins = mover(sim, o.tx + 2, o.ty + 6).ins;                             // (a second consumer on the same net)
    sim.step(STEP);                                                             // the grid is read once before any power is given out
    const g = graph(sim);
    assert.equal(g.nets.length, 1);
    const st = netStats(g.nets[0], sim.s.time);
    assert.equal(st.use, BUILDINGS.assembler.use! + BUILDINGS.inserter.use!);
    assert.ok(st.gen < st.use && st.gen > 0, `a lone turbine (${st.gen.toFixed(1)}) against ${st.use} wanted`);
    assert.ok(st.ratio < 1 && st.ratio > 0.5);
    assert.equal(asm.pw, Math.round(st.ratio * 20) / 20, 'satisfaction in steps of a twentieth');
    assert.equal(asm.pw, ins.pw, 'the same share for both');
    // the assembler's progress is its share of the seconds
    let expected = asm.prog ?? 0;
    for (let i = 0; i < 20; i++) { expected += asm.pw! * STEP; sim.step(STEP); }
    assert.ok(Math.abs(asm.prog! - expected) < 1e-9, `${asm.prog} of a gear after a second at ${asm.pw}`);
    assert.ok(asm.prog! < 1, 'well short of a full second of work');
    void turbine;
});

test('batteries store the surplus by the second, never past their capacity, and give it back when nothing else makes power', () => {
    const { sim, o } = yard('POW-4');
    put(sim, 'pole', o.tx + 4, o.ty + 4);
    put(sim, 'solar', o.tx + 5, o.ty + 5);
    const cell = put(sim, 'battery', o.tx + 4, o.ty + 6, { chg: 0 });
    sim.s.clock = 40;
    run(sim, 2);
    assert.ok(Math.abs(cell.chg! - BUILDINGS.solar.gen! * 2) < 1e-6, `two seconds of full sun: ${cell.chg}`);
    cell.chg = BUILDINGS.battery.store! - 10;
    run(sim, 2);
    assert.equal(cell.chg, BUILDINGS.battery.store!, 'full is full');
    // night: no sun, nothing drawn, nothing moves
    sim.s.clock = TUNING.dayLength + 10; sim.s.night = true;
    run(sim, 1);
    assert.equal(cell.chg, BUILDINGS.battery.store!);
    // something draws: the cell covers it at full satisfaction
    const { ins } = mover(sim, o.tx + 2, o.ty + 2);
    run(sim, 1);
    sim.s.clock = TUNING.dayLength + 10;
    const before = cell.chg!;
    for (let i = 0; i < 20; i++) { sim.s.clock = TUNING.dayLength + 10; sim.step(STEP); }
    assert.equal(ins.pw, 1, 'the battery keeps the grid whole');
    assert.ok(Math.abs(before - cell.chg! - BUILDINGS.inserter.use!) < 1e-6, `a second of the arm’s draw came out of the cell: ${before - cell.chg!}`);
    // and when it runs dry the arm stops
    cell.chg = 0.2;
    for (let i = 0; i < 20; i++) { sim.s.clock = TUNING.dayLength + 10; sim.step(STEP); }
    assert.equal(cell.chg, 0);
    assert.equal(ins.pw, 0);
});

test('solar follows the daylight and wind never dies: the pure numbers behind the grid', () => {
    const solar: BuildE = { id: 1, k: 'bld', kind: 'solar', tx: 0, ty: 0, rot: 0 };
    const turbine: BuildE = { id: 2, k: 'bld', kind: 'windturbine', tx: 4, ty: 0, rot: 0 };
    const drill: BuildE = { id: 3, k: 'bld', kind: 'drill', tx: 8, ty: 0, rot: 0, act: 1 };
    const cell: BuildE = { id: 4, k: 'bld', kind: 'battery', tx: 12, ty: 0, rot: 0, chg: 100 };
    const net = (members: BuildE[]) => ({ id: 0, poles: [], members, gen: 0, use: 0, ratio: 1, live: false });
    assert.equal(sunlight(40, TUNING.nightLength), 1, 'noon');
    assert.equal(sunlight(TUNING.dayLength - TUNING.duskFade / 2, TUNING.nightLength), 0.5, 'halfway through dusk');
    assert.equal(sunlight(TUNING.dayLength + 10, TUNING.nightLength), 0, 'night');
    assert.equal(netStats(net([solar]), 0, 1).gen, BUILDINGS.solar.gen);
    assert.equal(netStats(net([solar]), 0, 0.5).gen, BUILDINGS.solar.gen! / 2);
    assert.equal(netStats(net([solar]), 0, 0).gen, 0);
    for (let t = 0; t < 10000; t += 7) { const w = wind(t); assert.ok(w >= 0.35 && w <= 1, `wind ${w} at ${t}`); }
    assert.equal(netStats(net([turbine]), 0).gen, BUILDINGS.windturbine.gen! * wind(0));
    // satisfaction: nothing wanted is fine when something is made, nothing at all when nothing is
    assert.equal(netStats(net([turbine]), 0).ratio, 1);
    assert.equal(netStats(net([solar]), 0, 0).ratio, 0);
    const short = netStats(net([solar, drill]), 0, 0.5);
    assert.ok(Math.abs(short.ratio - 15 / 20) < 1e-9, 'fifteen made of twenty wanted');
    assert.equal(netStats(net([solar, drill, cell]), 0, 0.5).ratio, 1, 'a charged battery covers the shortfall');
    assert.equal(netStats(net([solar, drill, { ...cell, chg: 0 }]), 0, 0.5).ratio, 15 / 20, 'an empty one does not');
    drill.act = 0;
    assert.equal(netStats(net([solar, drill]), 0, 1).use, 0, 'an idle machine draws nothing');
});

test('taking a pole out of a line splits the grid: the far side goes dark until it is put back', () => {
    const { sim, o } = yard('POW-6');
    const x = o.tx + 1, y = o.ty + 2;
    put(sim, 'windturbine', x, y + 2);
    put(sim, 'pole', x, y);
    const mid = put(sim, 'pole', x + 6, y);
    put(sim, 'pole', x + 12, y);
    const { ins } = mover(sim, x + 12, y + 2);
    run(sim, 1);
    assert.equal(graph(sim).nets.length, 1);
    assert.equal(ins.pw, 1);
    sim.remove(mid.id);
    run(sim, 1);
    const g = graph(sim);
    assert.equal(g.nets.length, 2, 'two grids');
    assert.equal(ins.pw, 0, 'the arm’s grid has no generator');
    assert.equal(netStats(g.netOf.get(ins.id)!, sim.s.time).gen, 0);
    put(sim, 'pole', x + 6, y);
    run(sim, 1);
    assert.equal(graph(sim).nets.length, 1);
    assert.equal(ins.pw, 1, 'joined up again');
});

test('a consumer with nothing to do draws nothing, so the grid is not counted as short', () => {
    const { sim, o } = yard('POW-7');
    put(sim, 'pole', o.tx + 4, o.ty + 4);
    put(sim, 'windturbine', o.tx + 5, o.ty + 5);
    const idle = put(sim, 'inserter', o.tx + 3, o.ty + 2);         // nothing behind, nothing in front
    const { ins } = mover(sim, o.tx + 1, o.ty + 6);
    run(sim, 1);
    const g = graph(sim);
    const st = netStats(g.nets[0], sim.s.time);
    assert.equal(idle.act ?? 0, 0);
    assert.equal(ins.act, 1);
    assert.equal(st.use, BUILDINGS.inserter.use, 'only the busy arm is counted');
    assert.equal(st.ratio, 1);
    assert.equal(idle.pw, 1, 'the idle arm is still on the grid, ready');
});
