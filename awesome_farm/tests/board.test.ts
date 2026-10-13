// The Request Board: reading an ask, paying up front, filling and taking down.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { parseAsk, rewardEach } from '../src/shared/data/board';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE } from '../src/shared/sim/types';

function setup (seed: string) {
    const sim = Sim.create(seed, 'c');
    const a = sim.join('a', 'A')!, b = sim.join('b', 'B')!;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = b.x = (o.tx + 5) * TILE; a.y = b.y = (o.ty + 6) * TILE;
    const box = sim.add<BuildE>({ k: 'bld', kind: 'board', tx: o.tx + 5, ty: o.ty + 4, rot: 0 });
    return { sim, a, b, box };
}

test('asks are read from plain words', () => {
    assert.deepEqual(parseAsk('plank 50'), { item: 'plank', n: 50 });
    assert.deepEqual(parseAsk('50 planks'), { item: 'plank', n: 50 });
    assert.deepEqual(parseAsk('Berry Jam x12'), { item: 'jam', n: 12 });
    assert.equal(parseAsk('wood')?.n, 10, 'a bare name asks for ten');
    assert.equal(parseAsk('flibbertigibbet 5'), null);
    assert.equal(parseAsk('   '), null);
});

test('posting pays the reward up front; filling pays the filler and gives the asker the items', () => {
    const { sim, a, b, box } = setup('BRD-1');
    a.coins = 1000; b.coins = 0;
    const pay = rewardEach('plank') * 20;
    sim.command('a', { t: 'board', op: 'post', id: box.id, text: 'plank 20' });
    assert.equal(box.ask?.length, 1);
    assert.equal(a.coins, 1000 - pay, 'the reward is held');
    sim.give(b, 'plank', 30);
    sim.command('b', { t: 'board', op: 'fill', id: box.id, rid: box.ask![0].rid, n: 8 });
    assert.equal(b.coins, rewardEach('plank') * 8);
    assert.equal(countOf(a, 'plank'), 8);
    assert.equal(box.ask![0].got, 8);
    sim.command('b', { t: 'board', op: 'fill', id: box.id, rid: box.ask![0].rid });
    assert.equal(box.ask!.length, 0, 'filled requests come down');
    assert.equal(countOf(a, 'plank'), 20);
    assert.equal(b.coins, pay, 'the filler got every coin that was held');
});

test('you cannot fill your own request, a poor poster cannot post, and taking down refunds the rest', () => {
    const { sim, a, b, box } = setup('BRD-2');
    a.coins = 5;
    sim.command('a', { t: 'board', op: 'post', id: box.id, text: 'goldbar 50' });
    assert.equal(box.ask?.length ?? 0, 0, 'not enough coins up front');
    a.coins = 5000;
    sim.command('a', { t: 'board', op: 'post', id: box.id, text: 'stone 10' });
    sim.give(a, 'stone', 5);
    sim.command('a', { t: 'board', op: 'fill', id: box.id, rid: box.ask![0].rid });
    assert.equal(countOf(a, 'stone'), 5, 'nothing happens');
    sim.give(b, 'stone', 4);
    sim.command('b', { t: 'board', op: 'fill', id: box.id, rid: box.ask![0].rid });
    sim.command('b', { t: 'board', op: 'cancel', id: box.id, rid: box.ask![0].rid });
    assert.equal(box.ask!.length, 1, 'only the poster can take it down');
    const coins = a.coins;
    sim.command('a', { t: 'board', op: 'cancel', id: box.id, rid: box.ask![0].rid });
    assert.equal(a.coins, coins + rewardEach('stone') * 6, 'the unpaid six come back');
    assert.equal(box.ask!.length, 0);
});
