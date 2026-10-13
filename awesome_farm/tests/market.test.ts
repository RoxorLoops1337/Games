// Living prices: each unit sold dents that kind's price, the dent fades by morning, one kind a day pays half again, and it all
// reaches the coins the market pays.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { HOT_MUL, hotItem, recordSold, RECOVER, SAG_MIN, soldOn, unitMul, worthOf } from '../src/shared/data/market';
import { ITEMS } from '../src/shared/data/items';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

test('the hot item is stable for a day, changes from day to day, and is always something the market buys', () => {
    assert.equal(hotItem('s', 5), hotItem('s', 5));
    const seen = new Set<string>();
    for (let d = 1; d <= 60; d++) { const h = hotItem('seed', d); seen.add(h); assert.ok(ITEMS[h].sell >= 3 && ITEMS[h].kind !== 'gear'); }
    assert.ok(seen.size > 8, `variety over two months (${seen.size})`);
});

test('selling dents the price, never below the floor, and a morning heals part of it', () => {
    const item = (['wood', 'stone', 'iron'] as const).find((i) => hotItem('p', 1) !== i)!;
    let m = recordSold(undefined, item, 20, 1);
    assert.equal(unitMul(undefined, 'p', item, 1), 1);
    assert.ok(unitMul(m, 'p', item, 1) < 1 && unitMul(m, 'p', item, 1) >= SAG_MIN);
    assert.ok(Math.abs(soldOn(m, item, 2) - 20 * RECOVER) < 1e-9, 'a day later 70% of the dent is left');
    m = recordSold(m, item, 999, 1);
    assert.equal(unitMul(m, 'p', item, 1), SAG_MIN * (hotItem('p', 1) === item ? HOT_MUL : 1));
    assert.ok(worthOf(undefined, 'p', item, 50, 1) < ITEMS[item].sell * 50, 'a big batch is worth a little less per unit');
});

test('the market pays by the living price, and a hot item pays half again', () => {
    const sim = Sim.create('mkt', 'm');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;
    sim.add<BuildE>({ k: 'bld', kind: 'market', tx: o.tx + 7, ty: o.ty + 6, rot: 0, by: 'a' });
    const hot = hotItem(sim.s.seed, sim.s.day);
    p.inv = { [hot]: 10, wood: 40 } as typeof p.inv;
    p.coins = 0;
    sim.command('a', { t: 'sell', item: hot, n: 10 });
    const hotPay = p.coins;
    assert.ok(hotPay >= Math.round(ITEMS[hot].sell * 10 * 0.9 * HOT_MUL * 0.95), `hot pays more (${hotPay})`);
    assert.ok(sim.s.mkt?.s[hot] === 10, 'recorded');
    if (hot !== 'wood') { p.coins = 0; sim.command('a', { t: 'sell', item: 'wood', n: 40 }); assert.ok(p.coins < ITEMS.wood.sell * 40 * 1.0001 * (p.coins > 0 ? 1 : 1) + 1); }
});
