// A late-game world must stay cheap: 8 farmers, hundreds of plots' worth of machines. The
// limits are generous (a 20 Hz server has 50 ms per step); they exist to catch anything
// that turns quadratic as the farm grows, not to benchmark.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import type { BuildingKind } from '../src/shared/data/buildings';
import { SimHost } from '../src/shared/net/host';
import { PROTOCOL } from '../src/shared/net/protocol';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

const STEP = 1 / 20;
/**
 * The step and broadcast budgets (ms, medians). Strict is the bar on a quiet machine, asked for with `--perf-strict` or PERF_STRICT=1;
 * every other run, and CI (a shared, slower box), gets twice the room, so a busy neighbour cannot fail the suite. The medians are
 * printed either way, so a creeping cost shows in every run.
 */
const strict = (process.argv.includes('--perf-strict') || !!process.env.PERF_STRICT) && !process.env.CI;
const STEP_MS = strict ? 25 : 50, FLUSH_MS = strict ? 40 : 80;

test('a big busy world: simulation steps and broadcasts stay well inside their budget', (tc) => {
    const sim = Sim.create('PERF-1', 'perf');
    sim.cheats = true;
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) { const p = sim.join('p' + i, 'P' + i)!; ids.push(p.id); sim.command(p.id, { t: 'devdo', op: 'skills' }); sim.command(p.id, { t: 'devdo', op: 'coins', n: 1_000_000 }); }
    for (const id of ids) {
        const p = sim.s.players[id];
        for (let round = 0; round < 8; round++) {
            const mine = sim.s.plots.filter((pl) => pl.owned && (pl.buyer === id || pl.buyer === 'home:' + p.slot));
            const next = sim.s.plots.find((pl) => !pl.owned && mine.some((m) => Math.abs(m.gx - pl.gx) + Math.abs(m.gy - pl.gy) === 1));
            if (next) sim.command(id, { t: 'buy', plot: next.i });
        }
    }
    const kinds: BuildingKind[] = ['belt', 'belt', 'belt', 'inserter', 'drill', 'furnace', 'assembler', 'pole', 'windturbine', 'chest', 'bed', 'lantern', 'fence', 'sawmill', 'millstone', 'coalgen'];
    let seed = 7, placed = 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (const pl of sim.s.plots.filter((x) => x.owned)) {
        const o = sim.world.plotOrigin(pl);
        for (let n = 0; n < 100; n++) {
            const tx = o.tx + 1 + Math.floor(rnd() * 26), ty = o.ty + 1 + Math.floor(rnd() * 26);
            if (!sim.world.isFree(tx, ty)) continue;
            sim.add<BuildE>({ k: 'bld', kind: kinds[Math.floor(rnd() * kinds.length)], tx, ty, rot: n % 4, inv: {}, out: {}, prog: 0, act: n % 3 ? 1 : 0 });
            placed++;
        }
    }
    assert.ok(placed > 1500, `built ${placed} machines and fittings`);
    const host = new SimHost(sim, 'perf');
    let bytes = 0;
    for (const id of ids) {
        const peer = { send: (t: string) => { bytes += t.length; } };
        host.attach(peer);
        host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name: id }));
    }
    sim.s.clock = 280;                     // into the night, so monsters are about too
    const steps: number[] = [], flushes: number[] = [];
    bytes = 0;
    for (let i = 0; i < 400; i++) {
        for (const id of ids) sim.s.players[id].hearts = 99;
        const a = performance.now(); sim.step(STEP); steps.push(performance.now() - a);
        if (i % 2 === 1) { const b = performance.now(); host.flush(); flushes.push(performance.now() - b); }
    }
    steps.sort((x, y) => x - y); flushes.sort((x, y) => x - y);
    const med = (a: number[]) => a[Math.floor(a.length / 2)];
    tc.diagnostic(`median step ${med(steps).toFixed(1)} ms, median broadcast ${med(flushes).toFixed(1)} ms (${strict ? 'strict' : 'relaxed'} budget: ${STEP_MS} / ${FLUSH_MS})`);
    assert.ok(med(steps) < STEP_MS, `median step ${med(steps).toFixed(1)} ms`);
    assert.ok(med(flushes) < FLUSH_MS, `median broadcast ${med(flushes).toFixed(1)} ms`);
    // everyone listening: the per-farmer stream stays modest (bytes per second of game time)
    const perFarmer = bytes / 8 / (400 * STEP);
    assert.ok(perFarmer < 90_000, `${(perFarmer / 1024).toFixed(0)} KB/s per farmer`);
    // and the save is small enough to write every few seconds
    const t = performance.now();
    const json = JSON.stringify(sim.s);
    assert.ok(performance.now() - t < 150 && json.length < 20_000_000, `save ${(json.length / 1024).toFixed(0)} KB`);
});
