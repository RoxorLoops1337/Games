// The Farm Coffer: anyone pays in, you take back only your own, and the coffers top up a land purchase.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { fundTotal, shareOf, totalOf } from '../src/shared/sim/coffer';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

function setup (seed: string) {
    const sim = Sim.create(seed, 'c');
    const a = sim.join('a', 'A')!, b = sim.join('b', 'B')!;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = b.x = (o.tx + 5) * TILE; a.y = b.y = (o.ty + 6) * TILE;
    const box = sim.add<BuildE>({ k: 'bld', kind: 'coffer', tx: o.tx + 5, ty: o.ty + 4, rot: 0 });
    return { sim, a, b, box };
}

test('anyone can pay in; you can take back only what you put in', () => {
    const { sim, a, b, box } = setup('COF-1');
    a.coins = 300; b.coins = 50;
    sim.command('a', { t: 'coffer', op: 'put', id: box.id, n: 200 });
    sim.command('b', { t: 'coffer', op: 'put', id: box.id, n: 1e9 });
    assert.equal(totalOf(box), 250);
    assert.equal(shareOf(box, 'a'), 200); assert.equal(shareOf(box, 'b'), 50);
    assert.equal(a.coins, 100); assert.equal(b.coins, 0);
    sim.command('b', { t: 'coffer', op: 'take', id: box.id, n: 1e9 });
    assert.equal(b.coins, 50, 'b gets back exactly their own 50');
    assert.equal(totalOf(box), 200, 'a is untouched');
    sim.command('b', { t: 'coffer', op: 'take', id: box.id, n: 10 });
    assert.equal(b.coins, 50, 'nothing more to take');
});

test('too far from the coffer, nothing happens', () => {
    const { sim, a, box } = setup('COF-2');
    a.coins = 100; a.x += 40 * TILE;
    sim.command('a', { t: 'coffer', op: 'put', id: box.id, n: 50 });
    assert.equal(totalOf(box), 0);
    assert.equal(a.coins, 100);
});

test('the coffers pay what a land purchase is short, only when they can cover all of it', () => {
    const { sim, a, b, box } = setup('COF-3');
    const plot = sim.s.plots.find((p) => sim.world.isPurchasable(p))!;
    assert.ok(plot, 'a plot is for sale');
    const price = Math.max(1, Math.round(sim.world.price(plot, a.plotsBought) * sim.derivedOf(a).landMul));
    b.coins = price; sim.command('b', { t: 'coffer', op: 'put', id: box.id, n: price });
    assert.equal(fundTotal(sim), price);
    a.coins = price - 5;
    sim.command('a', { t: 'buy', plot: plot.i });
    assert.ok(plot.owned, 'a bought it with the coffer topping up 5');
    assert.equal(a.coins, 0);
    assert.equal(fundTotal(sim), price - 5);
    // a second purchase the fund cannot cover is refused and nothing is taken from it
    const plot2 = sim.s.plots.find((p) => sim.world.isPurchasable(p));
    if (plot2) {
        const before = fundTotal(sim);
        a.coins = 0;
        sim.command('a', { t: 'buy', plot: plot2.i });
        assert.ok(!plot2.owned);
        assert.equal(fundTotal(sim), before);
    }
});
