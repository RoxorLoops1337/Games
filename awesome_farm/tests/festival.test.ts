// Festival eve and the Lantern Chain: the last day of a season, lit lanterns chain up, the longest chain pays at dawn.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { CHAIN_COINS, CHAIN_GAP, CHAIN_MIN, isEve, litTonight, longestChain } from '../src/shared/sim/festival';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, s: number) => { for (let t = 0; t < s; t += STEP) sim.step(STEP); };

function setup (seed: string, n: number, gap = 4) {
    const sim = Sim.create(seed, 'c');
    const a = sim.join('a', 'A')!;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 5) * TILE; a.y = (o.ty + 9) * TILE;
    const lamps = Array.from({ length: n }, (_, i) => sim.add<BuildE>({ k: 'bld', kind: 'lantern', tx: o.tx + 2 + i * gap, ty: o.ty + 6, rot: 0, by: 'a' }));
    return { sim, a, lamps };
}

test('only the last day of a season is a festival', () => {
    assert.equal(isEve(7), true);
    assert.equal(isEve(14), true);
    assert.equal(isEve(6), false);
    assert.equal(isEve(8), false);
});

test('lantern chains: lit lanterns within the gap link up, far ones do not', () => {
    const { sim, lamps } = setup('FES-1', 6, 4);
    sim.s.day = 7;
    for (const l of lamps) l.kd = 7;
    assert.equal(longestChain(sim, litTonight(sim)), 6, 'every lantern is 4 tiles from the next');
    const far = setup('FES-2', 4, CHAIN_GAP + 3);
    far.sim.s.day = 7;
    for (const l of far.lamps) l.kd = 7;
    assert.equal(longestChain(far.sim, litTonight(far.sim)), 1, 'nine tiles apart: no chain');
});

test('E lights a lantern only on festival night; a long chain pays everyone at dawn', () => {
    const { sim, a, lamps } = setup('FES-3', 6, 4);
    sim.s.day = 3; sim.s.night = true;
    sim.command('a', { t: 'use', id: lamps[0].id });
    assert.equal(lamps[0].kd, undefined, 'not a festival night: nothing');
    sim.s.day = 7; sim.s.night = true;
    for (const l of lamps) { a.x = (l.tx + 0.5) * TILE; a.y = (l.ty + 2) * TILE; sim.command('a', { t: 'use', id: l.id }); }
    assert.ok(lamps.every((l) => l.kd === 7), 'all six lit');
    const before = a.coins;
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.01;
    run(sim, 0.5);
    assert.equal(sim.s.day, 8, 'dawn came');
    assert.equal(a.coins - before, 6 * CHAIN_COINS, 'six lanterns pay six times');
    assert.ok(CHAIN_MIN <= 6);
});

test('a short chain pays nothing', () => {
    const { sim, a, lamps } = setup('FES-4', 2, 4);
    sim.s.day = 7; sim.s.night = true;
    for (const l of lamps) { a.x = (l.tx + 0.5) * TILE; a.y = (l.ty + 2) * TILE; sim.command('a', { t: 'use', id: l.id }); }
    const before = a.coins;
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.01;
    run(sim, 0.5);
    assert.equal(a.coins, before);
});

test('only a lantern or lamp post lit for today glows as a festival light', async () => {
    const { festivalLit } = await import('../src/shared/data/festival');
    assert.equal(festivalLit({ kind: 'lantern', kd: 7 }, 7), true);
    assert.equal(festivalLit({ kind: 'lamppost', kd: 7 }, 7), true);
    assert.equal(festivalLit({ kind: 'lantern', kd: 7 }, 14), false, 'last season\'s flame is out');
    assert.equal(festivalLit({ kind: 'lantern' }, 7), false);
    assert.equal(festivalLit({ kind: 'campfire', kd: 7 }, 7), false);
});
